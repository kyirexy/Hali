(() => {
  const stage = document.querySelector('#gameStage');
  const tabs = [...document.querySelectorAll('.tab')];
  const modal = document.querySelector('#resultModal');
  const retryButton = document.querySelector('#retryButton');
  const nextGameButton = document.querySelector('#nextGameButton');
  const soundToggle = document.querySelector('#soundToggle');
  let currentGame = 'elevator';
  let cleanup = () => {};
  let soundOn = true;
  let audioCtx = null;

  function beep(freq = 440, duration = .07, type = 'sine', gain = .035) {
    if (!soundOn) return;
    try {
      audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      g.gain.value = gain;
      osc.connect(g).connect(audioCtx.destination);
      osc.start();
      g.gain.exponentialRampToValueAtTime(.0001, audioCtx.currentTime + duration);
      osc.stop(audioCtx.currentTime + duration);
    } catch (_) {}
  }

  function bind(root, key) { return root.querySelector(`[data-bind="${key}"]`); }
  function status(root, text, kind = '') {
    const el = bind(root, 'status');
    el.textContent = text;
    el.className = `status-line ${kind}`.trim();
  }
  function animate(el, cls) {
    if (!el) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }
  function randomPick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function cloneTemplate(id) {
    const fragment = document.querySelector(`#${id}`).content.cloneNode(true);
    stage.replaceChildren(fragment);
    return stage.firstElementChild;
  }
  function setTab(game) {
    tabs.forEach(tab => tab.classList.toggle('active', tab.dataset.game === game));
  }
  function showResult(title, summary, metrics) {
    document.querySelector('#resultTitle').textContent = title;
    document.querySelector('#resultSummary').textContent = summary;
    const container = document.querySelector('#resultMetrics');
    container.innerHTML = metrics.map(m => `<div><span>${m.label}</span><strong>${m.value}</strong></div>`).join('');
    modal.classList.remove('hidden');
  }
  function closeResult() { modal.classList.add('hidden'); }
  function mount(game) {
    cleanup();
    closeResult();
    currentGame = game;
    setTab(game);
    cleanup = game === 'elevator' ? mountElevator() : game === 'baggage' ? mountBaggage() : mountFire();
  }

  tabs.forEach(tab => tab.addEventListener('click', () => mount(tab.dataset.game)));
  retryButton.addEventListener('click', () => mount(currentGame));
  nextGameButton.addEventListener('click', () => {
    const order = ['elevator', 'baggage', 'fire'];
    mount(order[(order.indexOf(currentGame) + 1) % order.length]);
  });
  soundToggle.addEventListener('click', () => {
    soundOn = !soundOn;
    soundToggle.textContent = soundOn ? '🔊' : '🔇';
  });

  function mountElevator() {
    const root = cloneTemplate('elevatorTemplate');
    const state = {
      score: 0, combo: 0, time: 60, rescue: 1, selected: null, nextId: 1,
      queue: [], loads: { odd: [], even: [] }, ended: false
    };
    const intervals = [];
    const oddCar = root.querySelector('[data-elevator="odd"]');
    const evenCar = root.querySelector('[data-elevator="even"]');

    function createPassenger() {
      if (state.queue.length >= 12 || state.ended) return;
      state.queue.push({ id: state.nextId++, floor: 2 + Math.floor(Math.random() * 5), patience: 100, vip: Math.random() < .14 });
      render();
    }
    function render() {
      bind(root, 'score').textContent = state.score;
      bind(root, 'combo').textContent = state.combo;
      bind(root, 'time').textContent = state.time;
      const q = bind(root, 'queue');
      q.innerHTML = state.queue.map(p => `
        <button class="passenger ${state.selected === p.id ? 'selected' : ''} ${p.patience < 35 ? 'urgent' : ''}" data-passenger="${p.id}" type="button">
          <span class="avatar">${p.vip ? '👑' : '🧍'}</span>
          <span class="floor">${p.floor}F</span>
          <small>${p.floor % 2 ? '奇数梯' : '偶数梯'}</small>
          <span class="patience"><i style="width:${Math.max(0,p.patience)}%"></i></span>
        </button>`).join('');
      q.querySelectorAll('[data-passenger]').forEach(btn => btn.addEventListener('click', () => {
        state.selected = Number(btn.dataset.passenger);
        render();
        beep(520);
      }));
      ['odd','even'].forEach(type => {
        bind(root, `${type}Load`).textContent = state.loads[type].length ? state.loads[type].map(p => `${p.floor}F`).join(' · ') : '空';
        root.querySelector(`[data-elevator="${type}"] .capacity`).textContent = `${state.loads[type].length} / 3`;
        root.querySelector(`[data-elevator="${type}"]`).classList.toggle('ready', state.loads[type].length === 3);
      });
      const pressure = Math.min(100, state.queue.length / 12 * 100);
      bind(root, 'pressureBar').style.width = `${pressure}%`;
      bind(root, 'pressureText').textContent = pressure < 45 ? '安全' : pressure < 75 ? '拥挤' : '即将崩盘';
      root.querySelector('[data-action="rescue"]').disabled = state.rescue <= 0;
    }
    function load(type) {
      if (state.ended) return;
      if (state.selected == null) return status(root, '先选一名乘客，再点电梯。', 'bad');
      const idx = state.queue.findIndex(p => p.id === state.selected);
      if (idx < 0) return;
      if (state.loads[type].length >= 3) return status(root, '这部电梯已满，先发车。', 'bad');
      const p = state.queue[idx];
      const correct = type === (p.floor % 2 ? 'odd' : 'even');
      if (!correct) {
        state.combo = 0;
        p.patience -= 18;
        status(root, `${p.floor}F 乘客坐错梯了，耐心下降。`, 'bad');
        animate(root, 'shake');
        beep(150, .11, 'sawtooth');
        render();
        return;
      }
      state.loads[type].push(p);
      state.queue.splice(idx, 1);
      state.selected = null;
      state.score += p.vip ? 4 : 1;
      status(root, `${p.floor}F 乘客已装载，继续凑同梯乘客或立即发车。`);
      beep(620);
      render();
    }
    function dispatch(type) {
      const load = state.loads[type];
      if (!load.length) return status(root, '空梯发车没有收益。', 'bad');
      const floors = new Set(load.map(p => p.floor));
      const perfect = load.length === 3 && floors.size <= 2;
      const gained = load.length * 4 + (perfect ? 12 + state.combo * 2 : 0);
      state.score += gained;
      state.combo = perfect ? state.combo + 1 : 0;
      status(root, perfect ? `精准调度！一次送走 ${load.length} 人，压力瞬间释放。` : `送走 ${load.length} 人，但装载不够紧凑。`, perfect ? 'good' : '');
      const car = type === 'odd' ? oddCar : evenCar;
      animate(car, 'moving');
      beep(perfect ? 880 : 720, .14, 'triangle', .05);
      state.loads[type] = [];
      render();
    }
    oddCar.addEventListener('click', () => load('odd'));
    evenCar.addEventListener('click', () => load('even'));
    root.querySelector('[data-action="dispatchOdd"]').addEventListener('click', () => dispatch('odd'));
    root.querySelector('[data-action="dispatchEven"]').addEventListener('click', () => dispatch('even'));
    root.querySelector('[data-action="dispatchAll"]').addEventListener('click', () => { dispatch('odd'); dispatch('even'); });
    root.querySelector('[data-action="rescue"]').addEventListener('click', () => {
      if (!state.rescue) return;
      state.rescue = 0;
      const saved = state.queue.splice(0, Math.min(4, state.queue.length));
      state.score += saved.length * 3;
      status(root, `临时货梯带走 ${saved.length} 人，候梯区被救活。`, 'good');
      beep(960, .2, 'triangle', .06);
      render();
    });

    for (let i = 0; i < 7; i++) createPassenger();
    intervals.push(setInterval(createPassenger, 2600));
    intervals.push(setInterval(() => {
      if (state.ended) return;
      state.time--;
      state.queue.forEach(p => p.patience -= state.queue.length > 8 ? 7 : 4);
      const lost = state.queue.filter(p => p.patience <= 0).length;
      if (lost) {
        state.queue = state.queue.filter(p => p.patience > 0);
        state.combo = 0;
        state.score = Math.max(0, state.score - lost * 5);
        status(root, `${lost} 名乘客失去耐心离开，连调中断。`, 'bad');
        beep(120, .18, 'sawtooth');
      }
      render();
      if (state.time <= 0) end();
    }, 1000));
    function end() {
      state.ended = true;
      intervals.forEach(clearInterval);
      showResult('电梯调度结束', state.score >= 70 ? '你体验到了“拥堵被精准清空”的释放感。' : '下一局试试保留空位，等待满载精准调度。', [
        {label:'得分',value:state.score},{label:'最高连调',value:state.combo},{label:'滞留',value:state.queue.length}
      ]);
    }
    render();
    return () => { state.ended = true; intervals.forEach(clearInterval); };
  }

  function mountBaggage() {
    const root = cloneTemplate('baggageTemplate');
    const canvas = bind(root, 'canvas');
    const ctx = canvas.getContext('2d');
    const state = { score:0, combo:0, maxCombo:0, time:60, first:'up', second:'mid', rescue:1, bags:[], lastSpawn:0, jamUntil:0, ended:false, raf:0, lastTime:performance.now() };
    const colors = { red:'#ff6b7d', blue:'#58a6ff', yellow:'#ffd166' };
    const routes = { red:'up', blue:'mid', yellow:'down' };
    const intervals = [];

    function spawn() {
      const color = randomPick(['red','blue','yellow']);
      state.bags.push({ color, x:40, y:260, route:null, done:false, speed:105 + Math.min(80,state.combo*4) });
    }
    function setSwitch(which) {
      if (which === 'first') state.first = state.first === 'up' ? 'downstream' : 'up';
      else state.second = state.second === 'mid' ? 'down' : 'mid';
      bind(root, which === 'first' ? 'switch1' : 'switch2').textContent = which === 'first' ? (state.first === 'up' ? '上路' : '去道岔2') : (state.second === 'mid' ? '中路' : '下路');
      beep(600);
    }
    root.querySelector('[data-switch="first"]').addEventListener('click', () => setSwitch('first'));
    root.querySelector('[data-switch="second"]').addEventListener('click', () => setSwitch('second'));
    root.querySelector('[data-action="clearJam"]').addEventListener('click', () => {
      if (!state.rescue) return;
      state.rescue = 0;
      state.jamUntil = 0;
      state.bags = state.bags.filter(b => b.x < 680);
      status(root, '机械臂清除了错误行李，流水线重新顺畅。', 'good');
      beep(940, .18, 'triangle', .06);
      root.querySelector('[data-action="clearJam"]').disabled = true;
    });

    function routeY(route, x) {
      if (x < 360) return 260;
      if (route === 'up') return 260 - (x-360)*.55;
      if (x < 600) return 260;
      if (route === 'mid') return 260;
      return 260 + (x-600)*.75;
    }
    function drawTrack() {
      ctx.lineWidth = 18; ctx.lineCap = 'round'; ctx.strokeStyle = '#253147';
      const line = pts => { ctx.beginPath(); ctx.moveTo(...pts[0]); pts.slice(1).forEach(p=>ctx.lineTo(...p)); ctx.stroke(); };
      line([[20,260],[360,260]]);
      line([[360,260],[690,80],[870,80]]);
      line([[360,260],[600,260]]);
      line([[600,260],[870,260]]);
      line([[600,260],[760,430],[870,430]]);
      ctx.fillStyle = '#141d2a'; ctx.fillRect(820,38,65,84); ctx.fillRect(820,218,65,84); ctx.fillRect(820,388,65,84);
      [['A',850,85,colors.red],['B',850,265,colors.blue],['C',850,435,colors.yellow]].forEach(([t,x,y,c])=>{ctx.fillStyle=c;ctx.font='bold 26px sans-serif';ctx.textAlign='center';ctx.fillText(t,x,y+8);});
      ctx.fillStyle = '#76e6b6'; ctx.beginPath(); ctx.arc(360,260,11,0,Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.arc(600,260,11,0,Math.PI*2); ctx.fill();
    }
    function updateBag(b, dt) {
      const jammed = performance.now() < state.jamUntil;
      b.x += b.speed * dt * (jammed ? .22 : 1);
      if (!b.route && b.x >= 360) b.route = state.first === 'up' ? 'up' : (state.second === 'mid' ? 'mid' : 'down');
      b.y = routeY(b.route, b.x);
      if (b.x >= 830 && !b.done) {
        b.done = true;
        const correct = routes[b.color] === b.route;
        if (correct) {
          state.combo++;
          state.maxCombo = Math.max(state.maxCombo,state.combo);
          const gain = 4 + Math.min(20,state.combo);
          state.score += gain;
          if (state.combo % 5 === 0) { status(root, `${state.combo} 连击！流水线进入顺流，行李速度提升。`, 'good'); beep(900, .12, 'triangle', .055); }
          else beep(720 + state.combo*12, .05);
        } else {
          state.combo = 0;
          state.score = Math.max(0,state.score-5);
          state.jamUntil = performance.now()+1800;
          status(root, '错分造成堵塞！下一批行李正在逼近。', 'bad');
          animate(root,'shake'); beep(130,.18,'sawtooth');
        }
      }
    }
    function drawBag(b) {
      ctx.save();
      ctx.translate(b.x,b.y);
      ctx.fillStyle = colors[b.color];
      ctx.strokeStyle = '#0b1018'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.roundRect(-18,-14,36,28,7); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.strokeStyle = colors[b.color]; ctx.lineWidth=5; ctx.arc(0,-15,8,Math.PI,0);ctx.stroke();
      ctx.restore();
    }
    function frame(now) {
      if (state.ended) return;
      const dt = Math.min(.04,(now-state.lastTime)/1000); state.lastTime=now;
      if (now-state.lastSpawn > Math.max(650,1300-state.combo*18)) { spawn(); state.lastSpawn=now; }
      state.bags.forEach(b=>updateBag(b,dt));
      state.bags = state.bags.filter(b=>b.x<920);
      ctx.clearRect(0,0,canvas.width,canvas.height);
      drawTrack();
      state.bags.forEach(drawBag);
      if (now < state.jamUntil) { ctx.fillStyle='rgba(255,107,107,.16)';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#ff6b6b';ctx.font='bold 30px sans-serif';ctx.textAlign='center';ctx.fillText('堵塞！',450,55); }
      state.raf=requestAnimationFrame(frame);
    }
    intervals.push(setInterval(()=>{
      state.time--; bind(root,'time').textContent=state.time; bind(root,'score').textContent=state.score; bind(root,'combo').textContent=state.combo;
      if(state.time<=0) end();
    },1000));
    function end(){ state.ended=true; cancelAnimationFrame(state.raf); intervals.forEach(clearInterval); showResult('行李夜班结束',state.maxCombo>=8?'你体验到了“预判正确后整线顺流”的高速连击感。':'下一局提前看后续颜色，在行李到道岔前切换。',[{label:'得分',value:state.score},{label:'最高连击',value:state.maxCombo},{label:'剩余行李',value:state.bags.length}]); }
    bind(root,'score').textContent=0; bind(root,'combo').textContent=0;
    state.raf=requestAnimationFrame(frame);
    return ()=>{state.ended=true;cancelAnimationFrame(state.raf);intervals.forEach(clearInterval);};
  }

  function mountFire() {
    const root = cloneTemplate('fireTemplate');
    const state = {
      score:0, combo:0, maxCombo:0, time:60, boost:1, total:6, ended:false,
      zones:[
        {id:0,name:'居民楼',fire:56,pressure:2,wind:false,saved:false},
        {id:1,name:'商场',fire:42,pressure:2,wind:false,saved:false},
        {id:2,name:'仓库',fire:68,pressure:1,wind:false,saved:false}
      ], windIndex:-1
    };
    const intervals=[];
    function render(){
      bind(root,'score').textContent=state.score; bind(root,'combo').textContent=state.combo; bind(root,'time').textContent=state.time;
      const used=state.zones.reduce((s,z)=>s+z.pressure,0); bind(root,'freePressure').textContent=Math.max(0,state.total-used);
      bind(root,'wind').textContent=state.windIndex<0?'平稳':`吹向${state.zones[state.windIndex].name}`;
      bind(root,'zones').innerHTML=state.zones.map(z=>`
        <article class="fire-zone ${z.fire>=82?'critical':''}" data-zone="${z.id}">
          <div><div class="zone-name">${z.name}</div><div class="zone-stats">火势 ${Math.round(z.fire)} / 水压 ${z.pressure}</div></div>
          <div class="zone-visual"><div class="flame" style="transform:scale(${.55+z.fire/130})">${z.fire<10?'💨':'🔥'}</div></div>
          <div><div class="fire-bar"><i style="width:${Math.min(100,z.fire)}%"></i></div>
          <div class="pressure-controls"><button data-minus="${z.id}" type="button">−</button><div class="pressure-dots">${'●'.repeat(z.pressure)}${'○'.repeat(Math.max(0,5-z.pressure))}</div><button data-plus="${z.id}" type="button">＋</button></div></div>
        </article>`).join('');
      root.querySelectorAll('[data-plus]').forEach(b=>b.addEventListener('click',()=>changePressure(Number(b.dataset.plus),1)));
      root.querySelectorAll('[data-minus]').forEach(b=>b.addEventListener('click',()=>changePressure(Number(b.dataset.minus),-1)));
      root.querySelector('[data-action="boost"]').disabled=!state.boost;
    }
    function changePressure(id,delta){
      const z=state.zones[id]; const used=state.zones.reduce((s,a)=>s+a.pressure,0);
      if(delta>0&&used>=state.total)return status(root,'总水压已用完，先从低危区域回收。','bad');
      if(delta<0&&z.pressure<=0)return;
      z.pressure+=delta; status(root,delta>0?`向${z.name}追加水压。`:`从${z.name}回收一格水压。`); beep(delta>0?650:420); render();
    }
    function tick(){
      state.time--;
      let lost=false;
      state.zones.forEach((z,i)=>{
        const before=z.fire;
        const growth=5.2+(i===state.windIndex?4.8:0)+(z.fire>70?1.2:0);
        const suppression=z.pressure*(z.fire>70?5.7:4.4);
        z.fire=Math.max(0,Math.min(110,z.fire+growth-suppression));
        if(before>=72&&z.fire<20){ state.combo++;state.maxCombo=Math.max(state.maxCombo,state.combo);state.score+=20+state.combo*5;status(root,`极限翻盘！${z.name}从红线被一口气压下。`,'good');beep(980,.2,'triangle',.06); }
        if(z.fire===0&&!z.saved){z.saved=true;state.score+=12;status(root,`${z.name}火势归零，形成完整灭火反馈。`,'good');beep(820,.12,'triangle');}
        if(z.fire>0)z.saved=false;
        if(z.fire>=100)lost=true;
      });
      if(Math.random()<.18){state.windIndex=Math.floor(Math.random()*3);status(root,`风向突变：火势正吹向${state.zones[state.windIndex].name}。`,'bad');}
      if(Math.random()<.08)state.windIndex=-1;
      render();
      if(lost||state.time<=0)end(lost);
    }
    root.querySelector('[data-action="balance"]').addEventListener('click',()=>{
      state.zones.forEach(z=>z.pressure=2); state.total=Math.max(state.total,6); status(root,'平均分压很稳，但不一定能救下最危险区域。');render();
    });
    root.querySelector('[data-action="focusWorst"]').addEventListener('click',()=>{
      const worst=[...state.zones].sort((a,b)=>b.fire-a.fire)[0];state.zones.forEach(z=>z.pressure=1);worst.pressure=Math.min(4,state.total-2);status(root,`水压集中到${worst.name}，准备制造一次红线翻盘。`,'good');beep(760,.1,'triangle');render();
    });
    root.querySelector('[data-action="boost"]').addEventListener('click',()=>{
      if(!state.boost)return;state.boost=0;state.total+=3;status(root,'增压泵启动！短期总水压增加 3 格。','good');beep(920,.2,'triangle',.06);render();
    });
    function end(lost){state.ended=true;intervals.forEach(clearInterval);showResult(lost?'火场失控':'消防轮班结束',state.maxCombo>0?'你体验到了“放弃平均、集中资源、红线翻盘”的爽点。':'下一局不要平均分压，把水从低危区抽到红线区域。',[{label:'救援分',value:state.score},{label:'极限翻盘',value:state.maxCombo},{label:'剩余水压',value:Math.max(0,state.total-state.zones.reduce((s,z)=>s+z.pressure,0))}]);}
    render();
    intervals.push(setInterval(tick,1000));
    return()=>{state.ended=true;intervals.forEach(clearInterval);};
  }

  mount('elevator');
})();
