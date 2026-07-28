(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const E = {
    c: $('#battleCanvas'), hp: $('#doorHp'), hpBar: $('#doorBar'), money: $('#money'), income: $('#income'), time: $('#timeLeft'), wave: $('#waveLabel'),
    threat: $('#threat'), doorState: $('#doorStatus'), doorBtn: $('#upgradeDoor'), grid: $('#storeGrid'), combo: $('#comboBadge'), coachTitle: $('#coachTitle'),
    coachText: $('#coachText'), emergency: $('#emergencyButton'), restart: $('#restartButton'), status: $('#statusLine'), sound: $('#soundToggle'), modal: $('#resultModal'),
    resultTitle: $('#resultTitle'), resultText: $('#resultText'), resultIncome: $('#resultIncome'), resultKills: $('#resultKills'), resultCombos: $('#resultCombos'), retry: $('#resultRetry')
  };
  const ctx = E.c.getContext('2d');
  const DEF = {
    shelf: { name: '货架', icon: '🛒', cost: 20 }, turret: { name: '炮台', icon: '🔫', cost: 30 },
    freezer: { name: '冷柜', icon: '❄️', cost: 35 }, camera: { name: '监控', icon: '📹', cost: 40 }
  };
  let S, raf, last = performance.now(), audio, soundOn = true;

  const fresh = () => ({ running:true, t:0, money:60, hp:100, hpMax:100, doorLv:1, selected:'shelf', cells:Array(9).fill(null), enemies:[], shots:[], fx:[], spawn:0, cash:0, freeze:0, emergency:false, frozenUntil:0, kills:0, maxIncome:1, combos:new Set(), tutorial:0, boss:false, lock:0, nextId:1 });
  const neigh = i => { const r=Math.floor(i/3),c=i%3,o=[]; [[-1,0],[1,0],[0,-1],[0,1]].forEach(([a,b])=>{const y=r+a,x=c+b;if(y>=0&&y<3&&x>=0&&x<3)o.push(y*3+x)});return o; };
  const counts = () => S.cells.reduce((a,v)=>(v&&(a[v.type]++),a),{shelf:0,turret:0,freezer:0,camera:0});
  const beep = (f,d=.06,type='sine',v=.025) => { if(!soundOn)return; try{audio ||= new (AudioContext||webkitAudioContext)();const o=audio.createOscillator(),g=audio.createGain();o.frequency.value=f;o.type=type;g.gain.setValueAtTime(v,audio.currentTime);g.gain.exponentialRampToValueAtTime(.0001,audio.currentTime+d);o.connect(g).connect(audio.destination);o.start();o.stop(audio.currentTime+d)}catch{} };
  const say = (m,k='',lock=0) => { if(S.lock>0&&k!=='bad')return;E.status.textContent=m;E.status.className=`status-line${k?' '+k:''}`;S.lock=Math.max(S.lock,lock); };
  const select = type => { S.selected=type; document.querySelectorAll('.build-card').forEach(b=>b.classList.toggle('selected',b.dataset.build===type)); };

  function stats(){
    let income=1,dps=0,freezePower=0,laser=0,cold=false; const active=new Set();
    S.cells.forEach((f,i)=>{ if(!f)return; const a=neigh(i).map(n=>S.cells[n]).filter(Boolean);
      if(f.type==='shelf'){let n=2*f.lv;if(a.some(x=>x.type==='shelf')){n*=1.5;active.add('黄金货道')}income+=n}
      if(f.type==='turret'){let n=7+5*f.lv;if(a.some(x=>x.type==='camera')){n*=1.8;laser++;active.add('锁定激光')}dps+=n}
      if(f.type==='freezer'){freezePower+=f.lv;if(a.some(x=>x.type==='camera')){cold=true;active.add('冷链监控')}}
    });
    active.forEach(x=>{if(!S.combos.has(x)){S.combos.add(x);say(`✨ 联动激活：${x}！${x==='黄金货道'?'经济开始滚雪球。':x==='锁定激光'?'炮台变成穿透激光。':'冷柜变成全场冻结。'}`,'good',2.2);beep(900,.18,'triangle',.04)}});
    S.maxIncome=Math.max(S.maxIncome,Math.floor(income)); return {income,dps,freezePower,laser,cold,active};
  }

  function init(){
    cancelAnimationFrame(raf); S=fresh(); last=performance.now(); E.grid.innerHTML='';
    for(let i=0;i<9;i++){const b=document.createElement('button');b.type='button';b.className=`store-cell${i===4?' recommended':''}`;b.addEventListener('click',()=>cellClick(i));E.grid.appendChild(b)}
    E.modal.classList.add('hidden'); document.querySelectorAll('button').forEach(b=>b.disabled=false); E.emergency.disabled=false; select('shelf'); render(); raf=requestAnimationFrame(loop);
  }

  function cellClick(i){
    if(!S.running)return; const f=S.cells[i];
    if(f){ if(f.lv>=3)return say(`${DEF[f.type].name}已经满级。`,'good'); const cost=Math.round(DEF[f.type].cost*(.7+f.lv*.45)); if(S.money<cost)return say(`升级需要 ¥${cost}。`,'bad');S.money-=cost;f.lv++;pop(i);say(`${DEF[f.type].name}升到 ${f.lv} 级，能力明显增强。`,'good');beep(800+f.lv*90,.1,'triangle');render();return }
    const d=DEF[S.selected]; if(S.money<d.cost)return say(`现金不足：${d.name}需要 ¥${d.cost}。`,'bad');
    S.money-=d.cost;S.cells[i]={type:S.selected,lv:1};pop(i);beep(S.selected==='shelf'?540:680,.08,'triangle');say(`已建造${d.name}。${hint(S.selected)}`,'good');tutorial();render();
  }
  const hint=t=>t==='shelf'?'相邻货架会额外增收。':t==='turret'?'它会自动攻击最近的敌人。':t==='freezer'?'它会周期冻结全场。':'把它贴着炮台或冷柜放。';
  function pop(i){const b=E.grid.children[i];b.classList.remove('hit');void b.offsetWidth;b.classList.add('hit')}
  function tutorial(){const c=counts();if(S.tutorial===0&&c.shelf){S.tutorial=1;E.coachTitle.textContent='第二步：补一座炮台';E.coachText.textContent='异常顾客快到了。选择“自动炮台”，再放到空格。';select('turret');recommend()}else if(S.tutorial===1&&c.turret){S.tutorial=2;E.coachTitle.textContent='核心抉择已经开始';E.coachText.textContent='继续货架会滚经济，但怪物也在逼近。撑过 90 秒。';[...E.grid.children].forEach(x=>x.classList.remove('recommended'))}}
  function recommend(){const i=S.cells.findIndex(x=>!x);if(i>=0)E.grid.children[i].classList.add('recommended')}
  function buff(i,f){const a=neigh(i).map(n=>S.cells[n]).filter(Boolean);if(f.type==='shelf'&&a.some(x=>x.type==='shelf'))return'黄金货道 +50%';if(f.type==='turret'&&a.some(x=>x.type==='camera'))return'锁定激光 · 穿透';if(f.type==='freezer'&&a.some(x=>x.type==='camera'))return'冷链监控 · 全场冻结';if(f.type==='camera'&&a.some(x=>x.type==='turret'))return'强化相邻炮台';if(f.type==='camera'&&a.some(x=>x.type==='freezer'))return'强化相邻冷柜';return''}

  function doorUpgrade(){const cost=40+(S.doorLv-1)*35;if(S.money<cost)return say(`加固门需要 ¥${cost}。`,'bad');S.money-=cost;S.doorLv++;S.hpMax+=30;S.hp=Math.min(S.hpMax,S.hp+45);say(`卷帘门升到 ${S.doorLv} 级，耐久大幅提高。`,'good');beep(430,.12,'square');render()}
  function emergency(){if(S.emergency||!S.running)return;S.emergency=true;S.frozenUntil=S.t+4;S.enemies.forEach(e=>e.y=Math.max(45,e.y-70));S.fx.push({type:'wave',life:1,max:1});E.emergency.disabled=true;say('⚡ 应急断电：敌人被震退并冻结 4 秒。这里就是自然的广告救场点。','good');beep(180,.35,'sawtooth')}

  function spawn(boss=false){
    if(boss)S.boss=true; const wave=1+Math.floor(S.t/18),hp=boss?720:40+wave*18+Math.random()*18;
    S.enemies.push({id:S.nextId++,x:90+Math.random()*720,y:30,hp,max:hp,speed:boss?24:30+wave*4+Math.random()*10,damage:boss?18:4+wave*1.8,atk:0,boss,frozen:0,wobble:Math.random()*6.28});
    if(boss){say('⚠️ 异常店长出现！现在必须依靠联动、升级或应急断电。','bad');beep(92,.6,'sawtooth')}
  }

  function update(dt){
    if(!S.running)return;S.t+=dt;S.spawn+=dt;S.cash+=dt;S.freeze+=dt;S.lock=Math.max(0,S.lock-dt);const st=stats(),left=90-S.t;
    if(S.cash>=1){S.cash-=1;S.money+=st.income;const card=E.money.closest('.hud-card');card.classList.remove('flash');void card.offsetWidth;card.classList.add('flash');S.cells.forEach((f,i)=>f?.type==='shelf'&&pop(i));beep(880,.025,'sine',.015)}
    const interval=S.t<10?999:Math.max(4.1,7.2-S.t*.03);if(S.spawn>=interval){S.spawn=0;const n=S.t<30?2:S.t<58?3:4;for(let i=0;i<n;i++)spawn();say(`第 ${1+Math.floor(S.t/18)} 批异常顾客成群出现。`,'bad',1)}
    if(!S.boss&&S.t>=66)spawn(true);
    if(st.freezePower){const interval=st.cold?5:Math.max(7,9-st.freezePower);if(S.freeze>=interval){S.freeze=0;const d=st.cold?3.2:1.3+st.freezePower*.35;S.enemies.forEach(e=>e.frozen=Math.max(e.frozen,d));S.fx.push({type:'ice',life:.8,max:.8});say(st.cold?'❄️ 冷链监控触发：全场深度冻结。':'冷柜启动，敌人减速。','good',1.4);beep(320,.15)}}
    shoot(dt,st);moveEnemies(dt);S.shots.forEach(x=>x.life-=dt);S.shots=S.shots.filter(x=>x.life>0);S.fx.forEach(x=>x.life-=dt);S.fx=S.fx.filter(x=>x.life>0);
    if(left<=0)finish(true);if(S.hp<=0)finish(false);render(st);
  }
  function shoot(dt,st){if(!st.dps||!S.enemies.length)return;const t=S.enemies.reduce((a,b)=>!a||b.y>a.y?b:a,null);t.hp-=st.dps*dt;if(Math.random()<dt*(4+st.laser*2)){S.shots.push({x1:450+(Math.random()-.5)*210,y1:390,x2:t.x,y2:t.y,life:.11,laser:st.laser>0});beep(st.laser?1040:620,.025,'square',.012)}if(st.laser&&Math.random()<dt*1.7)S.enemies.filter(e=>e!==t&&Math.abs(e.y-t.y)<75).slice(0,2).forEach(e=>e.hp-=st.dps*dt*.35)}
  function moveEnemies(dt){
    const global=S.t<S.frozenUntil;for(const e of S.enemies){if(e.hp<=0)continue;e.frozen=Math.max(0,e.frozen-dt);const slow=global?0:e.frozen>0?.28:1;if(e.y<342){e.y+=e.speed*slow*dt;e.wobble+=dt*5}else{e.atk+=dt;if(e.atk>=(e.boss?.65:1.05)){e.atk=0;S.hp-=e.damage/(1+(S.doorLv-1)*.22);E.c.classList.remove('shake');void E.c.offsetWidth;E.c.classList.add('shake');if(S.hp<S.hpMax*.35)say('卷帘门进入红线！下一次收入能否赶上加固？','bad',1.2);beep(110,.07,'sawtooth',.035)}}}
    const dead=S.enemies.filter(e=>e.hp<=0);dead.forEach(e=>{S.kills++;S.money+=e.boss?55:4;S.fx.push({type:'burst',x:e.x,y:e.y,life:.55,max:.55});if(e.boss)say('💥 异常店长被击退！你建立的系统开始反过来碾压敌人。','good',3)});S.enemies=S.enemies.filter(e=>e.hp>0)
  }

  function render(pre){const st=pre||stats(),left=Math.max(0,Math.ceil(90-S.t)),pct=Math.max(0,Math.min(100,S.hp/S.hpMax*100));E.hp.textContent=Math.ceil(pct);E.hpBar.style.width=pct+'%';E.hpBar.style.background=pct<35?'var(--danger)':pct<65?'var(--warning)':'var(--accent)';E.money.textContent=Math.floor(S.money);E.income.textContent=Math.floor(st.income);E.time.textContent=left;E.wave.textContent=S.t<10?`第一批异常顾客 ${Math.max(1,Math.ceil(10-S.t))} 秒后出现`:S.t<66?`第 ${1+Math.floor((S.t-10)/18)} 波 · 敌人持续增强`:'Boss 夜班 · 撑到天亮';
    const close=S.enemies.reduce((m,e)=>Math.max(m,e.y),0),th=S.hp<S.hpMax*.35||close>315?'极高':close>250||S.enemies.length>7?'高':S.enemies.length>2?'中':'低';E.threat.textContent=th;E.threat.style.color=th==='高'||th==='极高'?'var(--danger)':th==='中'?'var(--warning)':'var(--accent)';E.doorState.textContent=pct<35?'门快破了！':pct<70?'正在承压':'安全';E.doorState.style.color=pct<35?'var(--danger)':pct<70?'var(--warning)':'var(--accent)';
    const doorCost=40+(S.doorLv-1)*35;E.doorBtn.textContent=`加固门 ¥${doorCost}`;E.doorBtn.disabled=!S.running||S.money<doorCost;document.querySelectorAll('.build-card').forEach(b=>b.disabled=!S.running||S.money<DEF[b.dataset.build].cost);
    E.combo.classList.toggle('active',st.active.size>0);E.combo.textContent=st.active.size?`联动：${[...st.active].join(' · ')}`:'把监控贴着炮台或冷柜放置';
    S.cells.forEach((f,i)=>{const b=E.grid.children[i];b.classList.toggle('occupied',!!f);if(!f){b.innerHTML='';return}const d=DEF[f.type],u=f.lv<3?Math.round(d.cost*(.7+f.lv*.45)):0,x=buff(i,f);b.innerHTML=`<div class="facility"><span class="level-pips">${'★'.repeat(f.lv)}</span><span class="facility-icon">${d.icon}</span><span class="facility-name">${d.name} Lv.${f.lv}</span><span class="facility-meta">${f.lv<3?`点击升级 ¥${u}`:'已满级'}</span>${x?`<span class="facility-buff">${x}</span>`:''}</div>`});
  }

  function draw(){const w=E.c.width,h=E.c.height;ctx.clearRect(0,0,w,h);const g=ctx.createLinearGradient(0,0,0,h);g.addColorStop(0,'#101827');g.addColorStop(1,'#0a0f17');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);ctx.fillStyle='#182231';ctx.fillRect(48,78,w-96,278);ctx.strokeStyle='#2f3d52';ctx.lineWidth=2;ctx.setLineDash([20,18]);ctx.beginPath();ctx.moveTo(w/2,85);ctx.lineTo(w/2,350);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#263348';ctx.fillRect(0,354,w,66);for(let x=28;x<w;x+=58){ctx.fillStyle='#5a6b82';ctx.fillRect(x,377,34,4)}S.enemies.forEach(drawEnemy);S.shots.forEach(drawShot);S.fx.forEach(drawFx);drawDefense(stats())}
  function drawEnemy(e){const frozen=e.frozen>0||S.t<S.frozenUntil,scale=e.boss?1.75:1.08;ctx.save();ctx.translate(e.x+Math.sin(e.wobble)*2,e.y);ctx.scale(scale,scale);if(frozen){ctx.fillStyle='#62a9ff55';ctx.beginPath();ctx.arc(0,0,38,0,6.28);ctx.fill()}ctx.font=`${e.boss?58:44}px system-ui`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(e.boss?'👹':'👤',0,0);ctx.restore();const bw=e.boss?120:66,r=Math.max(0,e.hp/e.max),y=e.y-(e.boss?66:40);ctx.fillStyle='#2b3547';ctx.fillRect(e.x-bw/2,y,bw,5);ctx.fillStyle=e.boss?'#ff626f':'#ffca57';ctx.fillRect(e.x-bw/2,y,bw*r,5);if(e.boss){ctx.fillStyle='#ffabb1';ctx.font='bold 15px system-ui';ctx.textAlign='center';ctx.fillText('异常店长',e.x,e.y-78)}}
  function drawShot(s){ctx.save();ctx.globalAlpha=Math.min(1,s.life*9);ctx.strokeStyle=s.laser?'#b495ff':'#ffca57';ctx.lineWidth=s.laser?8:4;ctx.beginPath();ctx.moveTo(s.x1,s.y1);ctx.lineTo(s.x2,s.y2);ctx.stroke();ctx.restore()}
  function drawFx(p){const q=1-p.life/p.max;ctx.save();if(p.type==='burst'){ctx.globalAlpha=1-q;ctx.strokeStyle='#ffca57';ctx.lineWidth=5;ctx.beginPath();ctx.arc(p.x,p.y,12+q*34,0,6.28);ctx.stroke()}else if(p.type==='ice'){ctx.globalAlpha=.25*(1-q);ctx.fillStyle='#62a9ff';ctx.fillRect(0,0,E.c.width,E.c.height)}else{ctx.globalAlpha=.35*(1-q);ctx.strokeStyle='#ffca57';ctx.lineWidth=10;ctx.beginPath();ctx.arc(450,350,40+q*500,Math.PI,6.28);ctx.stroke()}ctx.restore()}
  function drawDefense(st){const c=counts(),a=[];for(let i=0;i<c.turret;i++)a.push(st.laser>i?'🟣':'🔫');for(let i=0;i<c.freezer;i++)a.push('❄️');ctx.font='34px system-ui';ctx.textAlign='center';a.forEach((x,i)=>ctx.fillText(x,450-Math.max(1,a.length-1)*26+i*52,396))}

  function loop(now){const dt=Math.min(.05,(now-last)/1000);last=now;update(dt);draw();raf=requestAnimationFrame(loop)}
  function finish(win){if(!S.running)return;S.running=false;document.querySelectorAll('button').forEach(b=>{if(!['resultRetry','restartButton','soundToggle'].includes(b.id))b.disabled=true});E.resultTitle.textContent=win?'天亮了，便利店守住了':'卷帘门被撞开了';E.resultText.textContent=win?'你完成了“贪经济—承压—构筑联动—反杀”的循环。':'失败原因应该清楚：经济贪太久、防线不足、没有联动，或救场太迟。';E.resultIncome.textContent=S.maxIncome;E.resultKills.textContent=S.kills;E.resultCombos.textContent=S.combos.size;E.modal.classList.remove('hidden');beep(win?660:120,.6,win?'triangle':'sawtooth')}

  document.querySelectorAll('.build-card').forEach(b=>b.addEventListener('click',()=>select(b.dataset.build)));E.doorBtn.addEventListener('click',doorUpgrade);E.emergency.addEventListener('click',emergency);E.restart.addEventListener('click',init);E.retry.addEventListener('click',init);E.sound.addEventListener('click',()=>{soundOn=!soundOn;E.sound.textContent=soundOn?'🔊':'🔇'});init();
})();
