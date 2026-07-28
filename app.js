(() => {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];

  const els = {
    doorValue: $('#doorValue'), doorMaxValue: $('#doorMaxValue'), doorBar: $('#doorBar'),
    moneyValue: $('#moneyValue'), repValue: $('#repValue'), evidenceValue: $('#evidenceValue'), evidenceBar: $('#evidenceBar'),
    roundValue: $('#roundValue'), phaseText: $('#phaseText'), ruleTitle: $('#ruleTitle'), ruleHint: $('#ruleHint'), roundTimerBar: $('#roundTimerBar'),
    visitorLane: $('#visitorLane'), inspectionHint: $('#inspectionHint'), arrivedValue: $('#arrivedValue'), visitorTotalValue: $('#visitorTotalValue'),
    forecastValue: $('#forecastValue'), closeEarlyButton: $('#closeEarlyButton'), closeButtonHint: $('#closeButtonHint'),
    battleCanvas: $('#battleCanvas'), battleHint: $('#battleHint'), enemyValue: $('#enemyValue'), protocolButton: $('#protocolButton'),
    storeGrid: $('#storeGrid'), synergyStrip: $('#synergyStrip'), doorUpgradeButton: $('#doorUpgradeButton'),
    coach: $('#coach'), coachIcon: $('#coachIcon'), coachTitle: $('#coachTitle'), coachText: $('#coachText'),
    restartButton: $('#restartButton'), soundButton: $('#soundButton'),
    upgradeModal: $('#upgradeModal'), upgradeChoices: $('#upgradeChoices'),
    resultModal: $('#resultModal'), resultTitle: $('#resultTitle'), resultText: $('#resultText'),
    resultCorrect: $('#resultCorrect'), resultFalse: $('#resultFalse'), resultKills: $('#resultKills'), resultRetryButton: $('#resultRetryButton')
  };

  const ctx = els.battleCanvas.getContext('2d');
  const GAME_SPEED = Math.max(1, Number(window.__GAME_SPEED__ || 1));

  const FACILITIES = {
    shelf: {
      name: '货架', icon: '🛒', cost: 24,
      day: (level) => `顾客结账 +${2 + level}`,
      night: (level) => `罐头投射 ${7 + level * 4}伤害`
    },
    freezer: {
      name: '冷柜', icon: '❄️', cost: 32,
      day: (level) => `冷饮顾客额外 +${2 + level}`,
      night: (level) => `每${Math.max(2.4, 4.4 - level * .45).toFixed(1)}秒冻结`
    },
    camera: {
      name: '监控', icon: '📹', cost: 38,
      day: () => '每轮提示一名可疑者',
      night: (level) => `标记敌人，承伤 +${45 + level * 12}%`
    },
    generator: {
      name: '发电机', icon: '⚡', cost: 42,
      day: (level) => `证据充能 +${level}/秒`,
      night: (level) => `链电 ${8 + level * 4}伤害`
    }
  };

  const RULES = [
    {
      title: '没有影子的人，不是顾客',
      hint: '只看“影子”特征。无影者必须拒绝。',
      fields: ['shadow'],
      isAnomaly: (t) => !t.shadow
    },
    {
      title: '无影且体温冰冷，才是异常',
      hint: '必须同时满足两个条件，别误伤普通顾客。',
      fields: ['shadow', 'cold'],
      isAnomaly: (t) => !t.shadow && t.cold
    },
    {
      title: '红伞配反向脚印，是店长的替身',
      hint: '最终轮会出现无面店长；识破替身可削弱Boss。',
      fields: ['umbrella', 'footprints'],
      isAnomaly: (t) => t.umbrella === 'red' && t.footprints === 'reverse'
    }
  ];

  const ROUND_CONFIG = [
    { visitors: 5, anomalies: 2, business: 13, baseEnemies: 3, boss: false },
    { visitors: 5, anomalies: 2, business: 14, baseEnemies: 5, boss: false },
    { visitors: 5, anomalies: 3, business: 15, baseEnemies: 7, boss: true }
  ];

  const UPGRADE_POOL = [
    { id: 'coldChain', title: '冷链弹仓', desc: '货架与冷柜相邻时，罐头会穿透并附带减速。', apply: (s) => { s.upgrades.coldChain = true; } },
    { id: 'nightGrid', title: '夜视电网', desc: '监控与发电机相邻时，链电优先攻击被标记目标，并短暂眩晕。', apply: (s) => { s.upgrades.nightGrid = true; } },
    { id: 'honestTrade', title: '诚信经营', desc: '每放行一名普通顾客，卷帘门恢复2点耐久。', apply: (s) => { s.upgrades.honestTrade = true; } },
    { id: 'bounty', title: '异常悬赏', desc: '每正确拒绝一名异常，额外获得¥10。', apply: (s) => { s.upgrades.bounty = true; } },
    { id: 'doubleDoor', title: '双层卷帘', desc: '门体上限+35，并立刻修复35点。', apply: (s) => { s.doorMax += 35; s.doorHp = Math.min(s.doorMax, s.doorHp + 35); } },
    { id: 'clearance', title: '临期清仓', desc: '所有货架收入+2，但下一轮敌人移动速度+12%。', risk: '高收益 / 高风险', apply: (s) => { s.upgrades.clearance = (s.upgrades.clearance || 0) + 1; s.enemySpeedBonus += .12; } },
    { id: 'protocolRefund', title: '封店回扣', desc: '使用封店协议后，获得¥24用于下一轮改造。', apply: (s) => { s.upgrades.protocolRefund = true; } },
    { id: 'cameraSweep', title: '全景巡检', desc: '监控提示不再只亮边框，还会揭示“高度可疑”文字。', apply: (s) => { s.upgrades.cameraSweep = true; } }
  ];

  const NAMES = ['林姨', '小周', '阿哲', '雨桐', '老贺', '小满', '陈叔', '小禾', '阿宁', '海生'];
  const FACES = ['🧑', '👩', '👨', '🧔', '👵', '🧑‍🦱', '👩‍🦰', '🧑‍💼'];

  let audioContext = null;
  let soundEnabled = true;
  let game = null;
  let rafId = 0;
  let lastFrame = 0;

  function initialGrid() {
    return [
      null, null, null,
      null, { type: 'camera', level: 1 }, null,
      null, { type: 'shelf', level: 1 }, null
    ];
  }

  function createState() {
    return {
      round: 0,
      phase: 'business',
      timer: 0,
      timerMax: 1,
      money: 72,
      reputation: 100,
      doorHp: 100,
      doorMax: 100,
      evidence: 0,
      selectedBuild: 'shelf',
      visitors: [],
      visitorCursor: 0,
      spawnClock: 0,
      enemies: [],
      projectiles: [],
      grid: initialGrid(),
      facilityClocks: {},
      cameraHintUsed: false,
      protocolUsedThisDefense: false,
      upgrades: {},
      chosenUpgrades: [],
      enemySpeedBonus: 0,
      totals: { correct: 0, false: 0, missed: 0, kills: 0 },
      defenseRoundData: null,
      businessPaused: false,
      ended: false,
      perfectChecks: 0
    };
  }

  function startGame() {
    if (rafId) cancelAnimationFrame(rafId);
    game = createState();
    els.upgradeModal.classList.add('hidden');
    els.resultModal.classList.add('hidden');
    startBusinessRound(0);
    lastFrame = performance.now();
    rafId = requestAnimationFrame(loop);
    renderAll();
  }

  function startBusinessRound(roundIndex) {
    game.round = roundIndex;
    game.phase = 'business';
    const cfg = ROUND_CONFIG[roundIndex];
    game.timer = cfg.business;
    game.timerMax = cfg.business;
    game.visitors = generateVisitors(roundIndex, cfg.visitors, cfg.anomalies);
    game.visitors[0].arrived = true;
    game.visitorCursor = 1;
    game.spawnClock = 0;
    game.cameraHintUsed = false;
    game.protocolUsedThisDefense = false;
    game.enemies = [];
    game.projectiles = [];
    setCoach(
      roundIndex === 0 ? '👁️' : '📋',
      roundIndex === 0 ? '先看守则，再看顾客' : `第${roundIndex + 1}轮守则已变化`,
      roundIndex === 0 ? '符合守则的人才是异常。点中可疑顾客，状态会变为“拒绝”。' : '规则会组合多个特征。误拒会损失声誉，漏掉异常会让它从店内偷袭。'
    );
    renderAll();
  }

  function generateVisitors(roundIndex, count, anomalyCount) {
    const rule = RULES[roundIndex];
    const result = [];
    let guard = 0;
    while (result.length < count && guard < 500) {
      guard += 1;
      const traits = randomTraits();
      const anomaly = rule.isAnomaly(traits);
      const currentAnomalies = result.filter((v) => v.anomaly).length;
      const remaining = count - result.length;
      const needed = anomalyCount - currentAnomalies;
      if (anomaly && needed <= 0) continue;
      if (!anomaly && remaining <= needed) continue;
      result.push({
        id: `${roundIndex}-${result.length}-${Math.random().toString(16).slice(2)}`,
        name: NAMES[Math.floor(Math.random() * NAMES.length)],
        face: FACES[Math.floor(Math.random() * FACES.length)],
        traits,
        anomaly,
        rejected: false,
        arrived: false,
        cameraHint: false
      });
    }
    return shuffle(result);
  }

  function randomTraits() {
    return {
      shadow: Math.random() > .34,
      cold: Math.random() < .42,
      umbrella: ['none', 'red', 'blue'][Math.floor(Math.random() * 3)],
      footprints: Math.random() < .34 ? 'reverse' : 'normal'
    };
  }

  function loop(now) {
    const dt = Math.min(.05, (now - lastFrame) / 1000 || 0);
    lastFrame = now;
    if (!game.ended && !game.businessPaused) update(dt * GAME_SPEED);
    drawBattle(now / 1000);
    rafId = requestAnimationFrame(loop);
  }

  function update(dt) {
    if (game.phase === 'business') updateBusiness(dt);
    else if (game.phase === 'defense') updateDefense(dt);
  }

  function updateBusiness(dt) {
    const cfg = ROUND_CONFIG[game.round];
    game.timer = Math.max(0, game.timer - dt);
    game.spawnClock += dt;

    const generatorLevels = totalFacilityLevels('generator');
    if (generatorLevels > 0) {
      game.evidence = Math.min(100, game.evidence + generatorLevels * dt * .75);
    }

    const spawnInterval = cfg.business / (cfg.visitors + .6);
    while (game.visitorCursor < game.visitors.length && game.spawnClock >= spawnInterval) {
      game.spawnClock -= spawnInterval;
      const visitor = game.visitors[game.visitorCursor];
      visitor.arrived = true;
      game.visitorCursor += 1;
      tone(520, .05, 'sine');
      renderVisitors();
      updateForecast();
    }

    maybeCameraHint();
    if (game.timer <= 0) closeStore(false);
    renderTop();
  }

  function maybeCameraHint() {
    if (game.cameraHintUsed || game.timer > game.timerMax * .55 || totalFacilityLevels('camera') <= 0) return;
    const candidates = game.visitors.filter((v) => v.arrived && v.anomaly && !v.rejected);
    if (!candidates.length) return;
    const chosen = candidates[Math.floor(Math.random() * candidates.length)];
    chosen.cameraHint = true;
    game.cameraHintUsed = true;
    els.inspectionHint.textContent = game.upgrades.cameraSweep ? '监控提示：标蓝顾客高度可疑' : '监控出现雪花：有一名顾客画面不稳定';
    renderVisitors();
  }

  function closeStore(manual) {
    if (game.phase !== 'business') return;
    const arrived = game.visitors.filter((v) => v.arrived);
    const correct = arrived.filter((v) => v.anomaly && v.rejected).length;
    const falseReject = arrived.filter((v) => !v.anomaly && v.rejected).length;
    const missed = arrived.filter((v) => v.anomaly && !v.rejected).length;
    const acceptedNormals = arrived.filter((v) => !v.anomaly && !v.rejected);
    const allArrived = arrived.length === game.visitors.length;
    const perfect = allArrived && correct === game.visitors.filter((v) => v.anomaly).length && falseReject === 0 && missed === 0;

    const payout = acceptedNormals.reduce((sum, visitor) => sum + visitorPayout(visitor), 0);
    game.money += payout;
    game.reputation = Math.max(0, game.reputation - falseReject * 14 - missed * 8);
    game.evidence = Math.min(100, game.evidence + correct * 22 + (perfect ? 18 : 0));
    if (game.upgrades.bounty) game.money += correct * 10;
    if (game.upgrades.honestTrade) game.doorHp = Math.min(game.doorMax, game.doorHp + acceptedNormals.length * 2);

    game.totals.correct += correct;
    game.totals.false += falseReject;
    game.totals.missed += missed;
    if (perfect) game.perfectChecks += 1;

    game.defenseRoundData = { correct, falseReject, missed, accepted: acceptedNormals.length, payout, perfect, manual };
    beginDefense();
  }

  function visitorPayout(visitor) {
    const shelfLevels = totalFacilityLevels('shelf');
    const freezerLevels = totalFacilityLevels('freezer');
    let value = 6 + shelfLevels * 2;
    if (visitor.traits.cold) value += freezerLevels * 2;
    if (game.upgrades.clearance) value += shelfLevels * 2 * game.upgrades.clearance;
    if (hasGoldenAisle()) value = Math.round(value * 1.25);
    value *= Math.max(.55, game.reputation / 100);
    return Math.round(value);
  }

  function beginDefense() {
    game.phase = 'defense';
    game.timer = 999;
    game.timerMax = 1;
    game.enemies = createEnemyWave();
    game.projectiles = [];
    game.facilityClocks = {};
    els.inspectionHint.textContent = `结账 ¥${game.defenseRoundData.payout} · 正确拒绝 ${game.defenseRoundData.correct} · 漏入 ${game.defenseRoundData.missed}`;
    setCoach(
      game.defenseRoundData.missed ? '🚨' : '🌙',
      game.defenseRoundData.missed ? '漏掉的异常从店内偷袭！' : '熄灯，设施切换为防御模式',
      game.defenseRoundData.missed ? '盘查错误会直接增加门前压力。下轮可根据失败原因调整。' : '观察同一设施如何改变用途；设施相邻还会形成跨模式联动。'
    );
    tone(170, .16, 'sawtooth');
    renderAll();
  }

  function createEnemyWave() {
    const cfg = ROUND_CONFIG[game.round];
    const missed = game.defenseRoundData.missed;
    const enemies = [];
    for (let i = 0; i < cfg.baseEnemies; i += 1) {
      enemies.push(makeEnemy(false, false, i * 24));
    }
    for (let i = 0; i < missed; i += 1) {
      enemies.push(makeEnemy(false, true, i * 16));
    }
    if (cfg.boss) enemies.push(makeEnemy(true, false, 60));
    return enemies;
  }

  function makeEnemy(boss, saboteur, offset) {
    const baseHp = boss ? 170 : saboteur ? 38 : 28 + game.round * 9;
    const evidenceWeakness = boss ? Math.min(.32, game.defenseRoundData.correct * .08) : 0;
    return {
      id: Math.random().toString(16).slice(2),
      boss,
      saboteur,
      hp: baseHp * (1 - evidenceWeakness),
      maxHp: baseHp * (1 - evidenceWeakness),
      x: saboteur ? 132 + offset : 375 + offset,
      y: 62 + Math.random() * 70,
      speed: (boss ? 10 : saboteur ? 23 : 16 + game.round * 2.5) * (1 + game.enemySpeedBonus),
      damage: boss ? 11 : saboteur ? 6 : 3 + game.round,
      attackClock: 0,
      frozen: 0,
      marked: 0,
      stunned: 0,
      dead: false
    };
  }

  function updateDefense(dt) {
    updateEnemies(dt);
    updateFacilities(dt);
    updateProjectiles(dt);
    game.enemies = game.enemies.filter((e) => !e.dead);
    els.enemyValue.textContent = String(game.enemies.length);
    if (game.doorHp <= 0) endGame(false);
    else if (game.enemies.length === 0) finishDefenseRound();
    renderTop();
  }

  function updateEnemies(dt) {
    for (const enemy of game.enemies) {
      if (enemy.dead) continue;
      enemy.frozen = Math.max(0, enemy.frozen - dt);
      enemy.marked = Math.max(0, enemy.marked - dt);
      enemy.stunned = Math.max(0, enemy.stunned - dt);
      if (enemy.stunned > 0) continue;
      if (enemy.x > 63) {
        const slow = enemy.frozen > 0 ? .3 : 1;
        enemy.x -= enemy.speed * slow * dt;
      } else {
        enemy.attackClock += dt;
        if (enemy.attackClock >= .82) {
          enemy.attackClock = 0;
          game.doorHp = Math.max(0, game.doorHp - enemy.damage);
          els.battleCanvas.classList.remove('shake');
          void els.battleCanvas.offsetWidth;
          els.battleCanvas.classList.add('shake');
          tone(92, .07, 'square');
        }
      }
    }
  }

  function updateFacilities(dt) {
    game.grid.forEach((facility, index) => {
      if (!facility) return;
      const key = `${index}-${facility.type}`;
      game.facilityClocks[key] = (game.facilityClocks[key] || 0) + dt;
      if (facility.type === 'shelf') {
        const interval = Math.max(.62, 1.35 - facility.level * .15);
        if (game.facilityClocks[key] >= interval) {
          game.facilityClocks[key] = 0;
          shelfAttack(index, facility);
        }
      } else if (facility.type === 'freezer') {
        const interval = Math.max(2.4, 4.4 - facility.level * .45);
        if (game.facilityClocks[key] >= interval) {
          game.facilityClocks[key] = 0;
          freezerPulse(index, facility);
        }
      } else if (facility.type === 'camera') {
        const interval = Math.max(1.5, 2.9 - facility.level * .25);
        if (game.facilityClocks[key] >= interval) {
          game.facilityClocks[key] = 0;
          cameraMark(facility);
        }
      } else if (facility.type === 'generator') {
        const interval = Math.max(2.6, 5 - facility.level * .45);
        if (game.facilityClocks[key] >= interval) {
          game.facilityClocks[key] = 0;
          generatorChain(index, facility);
        }
      }
    });
  }

  function shelfAttack(index, facility) {
    const target = frontEnemy();
    if (!target) return;
    const coldAdjacent = adjacentFacilities(index, 'freezer').length > 0;
    const pierce = game.upgrades.coldChain && coldAdjacent;
    game.projectiles.push({ x: 55, y: 98, targetId: target.id, speed: 250, damage: 7 + facility.level * 4, slow: coldAdjacent, pierce, dead: false });
    tone(330, .025, 'square', .025);
  }

  function freezerPulse(index, facility) {
    const cameraAdjacent = adjacentFacilities(index, 'camera').length > 0;
    const duration = 1.1 + facility.level * .25 + (cameraAdjacent ? .45 : 0);
    game.enemies.forEach((enemy) => { enemy.frozen = Math.max(enemy.frozen, duration); });
    tone(610, .08, 'sine', .04);
  }

  function cameraMark(facility) {
    const target = frontEnemy();
    if (!target) return;
    target.marked = 2.4 + facility.level * .3;
  }

  function generatorChain(index, facility) {
    const cameraAdjacent = adjacentFacilities(index, 'camera').length > 0;
    const targets = [...game.enemies].filter((e) => !e.dead).sort((a, b) => a.x - b.x).slice(0, 3);
    targets.forEach((enemy) => {
      let damage = 8 + facility.level * 4;
      if (cameraAdjacent && game.upgrades.nightGrid && enemy.marked > 0) {
        damage *= 1.8;
        enemy.stunned = Math.max(enemy.stunned, .55);
      }
      damageEnemy(enemy, damage);
    });
    tone(760, .06, 'sawtooth', .04);
  }

  function updateProjectiles(dt) {
    for (const projectile of game.projectiles) {
      if (projectile.dead) continue;
      const target = game.enemies.find((e) => e.id === projectile.targetId && !e.dead) || frontEnemy();
      if (!target) { projectile.dead = true; continue; }
      const dx = target.x - projectile.x;
      projectile.x += Math.sign(dx) * projectile.speed * dt;
      projectile.y += (target.y - projectile.y) * Math.min(1, dt * 8);
      if (Math.abs(projectile.x - target.x) < 12) {
        damageEnemy(target, projectile.damage);
        if (projectile.slow) target.frozen = Math.max(target.frozen, .9);
        if (projectile.pierce) {
          const next = [...game.enemies].filter((e) => !e.dead && e.id !== target.id).sort((a, b) => a.x - b.x)[0];
          if (next) {
            damageEnemy(next, projectile.damage * .55);
            next.frozen = Math.max(next.frozen, .6);
          }
        }
        projectile.dead = true;
      }
    }
    game.projectiles = game.projectiles.filter((p) => !p.dead);
  }

  function damageEnemy(enemy, amount) {
    const multiplier = enemy.marked > 0 ? 1.58 : 1;
    enemy.hp -= amount * multiplier;
    if (enemy.hp <= 0 && !enemy.dead) {
      enemy.dead = true;
      game.totals.kills += 1;
      game.money += enemy.boss ? 40 : 4;
      tone(enemy.boss ? 120 : 220, enemy.boss ? .22 : .05, 'triangle', .05);
    }
  }

  function finishDefenseRound() {
    if (game.round >= ROUND_CONFIG.length - 1) {
      endGame(true);
      return;
    }
    game.businessPaused = true;
    game.phase = 'intermission';
    game.money += 18 + game.round * 8;
    setCoach('🧰', '撑住了，选择一项永久改装', '不是单纯加数值：有些改装会改变联动方式，有些会交换收益与风险。');
    showUpgradeChoices();
    renderAll();
  }

  function showUpgradeChoices() {
    const available = UPGRADE_POOL.filter((u) => !game.chosenUpgrades.includes(u.id));
    const choices = shuffle([...available]).slice(0, 3);
    els.upgradeChoices.innerHTML = '';
    choices.forEach((upgrade) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'upgrade-card';
      button.innerHTML = `<strong>${upgrade.title}</strong><p>${upgrade.desc}</p>${upgrade.risk ? `<span class="risk">${upgrade.risk}</span>` : ''}`;
      button.addEventListener('click', () => {
        upgrade.apply(game);
        game.chosenUpgrades.push(upgrade.id);
        els.upgradeModal.classList.add('hidden');
        game.businessPaused = false;
        startBusinessRound(game.round + 1);
        tone(680, .1, 'triangle', .05);
      }, { once: true });
      els.upgradeChoices.appendChild(button);
    });
    els.upgradeModal.classList.remove('hidden');
  }

  function endGame(win) {
    game.ended = true;
    game.businessPaused = true;
    els.resultTitle.textContent = win ? '你守到了天亮' : '卷帘门被突破';
    els.resultText.textContent = win
      ? `你没有只靠堆炮台，而是用盘查结果削弱异常、用设施双状态建立防线。完成了 ${game.perfectChecks} 次完美盘查。`
      : `本局漏入 ${game.totals.missed} 名异常。观察失败、过度贪经济或设施联动不足，都会直接反映在门前压力上。`;
    els.resultCorrect.textContent = String(game.totals.correct);
    els.resultFalse.textContent = String(game.totals.false);
    els.resultKills.textContent = String(game.totals.kills);
    els.resultModal.classList.remove('hidden');
    tone(win ? 660 : 90, .35, win ? 'triangle' : 'sawtooth', .08);
  }

  function renderAll() {
    renderTop();
    renderVisitors();
    renderGrid();
    renderBuildButtons();
    updateForecast();
  }

  function renderTop() {
    els.doorValue.textContent = String(Math.ceil(game.doorHp));
    els.doorMaxValue.textContent = String(game.doorMax);
    els.doorBar.style.width = `${Math.max(0, (game.doorHp / game.doorMax) * 100)}%`;
    els.moneyValue.textContent = String(Math.floor(game.money));
    els.repValue.textContent = String(Math.round(game.reputation));
    els.evidenceValue.textContent = String(Math.floor(game.evidence));
    els.evidenceBar.style.width = `${game.evidence}%`;
    document.querySelector('.phone').dataset.phase = game.phase;
    els.roundValue.textContent = String(game.round + 1);
    els.phaseText.textContent = game.phase === 'business' ? '营业中' : game.phase === 'defense' ? '熄灯防御' : '改装中';
    const rule = RULES[game.round];
    els.ruleTitle.textContent = rule.title;
    els.ruleHint.textContent = rule.hint;
    const denominator = Math.max(1, ROUND_CONFIG[game.round].baseEnemies + (game.defenseRoundData?.missed || 0) + (ROUND_CONFIG[game.round].boss ? 1 : 0));
    const timerPercent = game.phase === 'business' ? (game.timer / game.timerMax) * 100 : game.phase === 'defense' ? Math.max(0, Math.min(100, (game.enemies.length / denominator) * 100)) : 0;
    els.roundTimerBar.style.width = `${timerPercent}%`;
    els.protocolButton.disabled = game.phase !== 'defense' || game.evidence < 100 || game.protocolUsedThisDefense;
    els.protocolButton.classList.toggle('ready', !els.protocolButton.disabled);
    els.closeEarlyButton.disabled = game.phase !== 'business' || game.visitors.filter((v) => v.arrived).length === 0;
    els.closeButtonHint.textContent = game.phase === 'business'
      ? `还剩 ${Math.ceil(game.timer)} 秒 · 越早关门越安全`
      : '防御阶段无法继续营业';
    els.doorUpgradeButton.disabled = game.phase === 'defense' || game.money < doorUpgradeCost();
    els.doorUpgradeButton.textContent = `门体升级 ¥${doorUpgradeCost()}`;
    els.battleHint.textContent = game.phase === 'business' ? '熄灯后，设施会切换成防御模式' : game.phase === 'defense' ? '同一设施已改变用途，正在自动防守' : '选择改装后进入下一轮';
    els.enemyValue.textContent = String(game.enemies.length);
  }

  function renderVisitors() {
    els.visitorLane.innerHTML = '';
    const cfg = ROUND_CONFIG[game.round];
    els.visitorTotalValue.textContent = String(cfg.visitors);
    els.arrivedValue.textContent = String(game.visitors.filter((v) => v.arrived).length);
    for (let i = 0; i < cfg.visitors; i += 1) {
      const visitor = game.visitors[i];
      if (!visitor || !visitor.arrived) {
        const placeholder = document.createElement('div');
        placeholder.className = 'visitor-placeholder';
        placeholder.textContent = '…';
        els.visitorLane.appendChild(placeholder);
        continue;
      }
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `visitor arrive${visitor.rejected ? ' rejected' : ''}${visitor.cameraHint ? ' camera-hint' : ''}`;
      button.innerHTML = `
        <span class="person">${visitor.face}</span>
        <span class="name">${visitor.name}</span>
        <span class="traits">${visibleTraitChips(visitor.traits).map((chip) => `<span class="trait ${chip.relevant ? 'relevant' : 'muted-trait'}">${chip.text}</span>`).join('')}</span>
        <span class="decision">${visitor.rejected ? '拒绝入店' : '放行结账'}</span>`;
      button.addEventListener('click', () => {
        if (game.phase !== 'business') return;
        visitor.rejected = !visitor.rejected;
        tone(visitor.rejected ? 250 : 460, .04, 'square', .025);
        renderVisitors();
        updateForecast();
      });
      els.visitorLane.appendChild(button);
    }
  }

  function visibleTraitChips(t) {
    const fields = new Set(RULES[game.round].fields);
    return [
      { field: 'shadow', text: t.shadow ? '👤有影' : '◌无影' },
      { field: 'cold', text: t.cold ? '🥶冰冷' : '🌡常温' },
      { field: 'umbrella', text: t.umbrella === 'red' ? '☂️红伞' : t.umbrella === 'blue' ? '🌂蓝伞' : '✋无伞' },
      { field: 'footprints', text: t.footprints === 'reverse' ? '↩反脚印' : '→正常步' }
    ].map((chip) => ({ ...chip, relevant: fields.has(chip.field) }));
  }

  function updateForecast() {
    if (!game) return;
    const value = game.visitors.filter((v) => v.arrived && !v.anomaly && !v.rejected).reduce((sum, v) => sum + visitorPayout(v), 0);
    els.forecastValue.textContent = String(value);
  }

  function renderGrid() {
    els.storeGrid.innerHTML = '';
    game.grid.forEach((facility, index) => {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = `store-cell${facility ? '' : ' empty'}${!facility && game.phase !== 'defense' ? ' can-place' : ''}${cellHasSynergy(index) ? ' synergy' : ''}`;
      if (facility) {
        const def = FACILITIES[facility.type];
        const modeText = game.phase === 'defense' ? def.night(facility.level) : def.day(facility.level);
        cell.innerHTML = `
          <span class="facility">
            <span class="facility-icon">${def.icon}</span>
            <span class="facility-info"><strong>${def.name}</strong><small>${modeText}</small></span>
          </span>
          <span class="facility-level">Lv.${facility.level}</span>
          <span class="mode-badge ${game.phase === 'defense' ? 'night' : ''}">${game.phase === 'defense' ? '防御用途' : '营业用途'}</span>`;
      }
      cell.addEventListener('click', () => handleGridClick(index));
      els.storeGrid.appendChild(cell);
    });
    renderSynergies();
  }

  function handleGridClick(index) {
    if (game.phase === 'defense' || game.phase === 'intermission') return;
    const facility = game.grid[index];
    if (!facility) {
      const def = FACILITIES[game.selectedBuild];
      if (game.money < def.cost) {
        setCoach('💸', '现金不够', `建造${def.name}需要¥${def.cost}。继续营业，或用现有设施撑过本轮。`);
        tone(110, .06, 'square', .03);
        return;
      }
      game.money -= def.cost;
      game.grid[index] = { type: game.selectedBuild, level: 1 };
      setCoach('🧩', `已建造${def.name}`, `营业用途：${def.day(1)}；熄灯用途：${def.night(1)}。`);
      tone(580, .08, 'triangle', .04);
    } else {
      const cost = facilityUpgradeCost(facility);
      if (game.money < cost) {
        setCoach('💸', '升级现金不足', `升级${FACILITIES[facility.type].name}需要¥${cost}。`);
        return;
      }
      game.money -= cost;
      facility.level += 1;
      setCoach('⬆️', `${FACILITIES[facility.type].name}升到 Lv.${facility.level}`, '升级会同时强化营业和防御两个用途。');
      tone(720, .08, 'triangle', .04);
    }
    renderAll();
  }

  function renderBuildButtons() {
    $$('.build-button').forEach((button) => {
      const type = button.dataset.build;
      button.classList.toggle('selected', type === game.selectedBuild);
      button.disabled = game.phase === 'defense' || game.phase === 'intermission';
    });
  }

  function renderSynergies() {
    const messages = [];
    if (hasGoldenAisle()) messages.push('黄金动线：同排双货架，营业收入×1.25');
    if (hasAdjacentPair('shelf', 'freezer')) messages.push(game.upgrades.coldChain ? '冷链弹仓：罐头穿透并减速' : '冷链陈列：冷饮顾客收益提高');
    if (hasAdjacentPair('camera', 'generator')) messages.push(game.upgrades.nightGrid ? '夜视电网：链电标记目标并眩晕' : '夜间供电：证据充能更快');
    els.synergyStrip.textContent = messages.length ? messages.join(' · ') : '尚未形成跨模式联动：尝试让设施相邻或同排';
    els.synergyStrip.classList.toggle('active', messages.length > 0);
  }

  function cellHasSynergy(index) {
    const facility = game.grid[index];
    if (!facility) return false;
    if (facility.type === 'shelf' && (adjacentFacilities(index, 'freezer').length || rowHasTwoShelves(Math.floor(index / 3)))) return true;
    if (facility.type === 'freezer' && adjacentFacilities(index, 'shelf').length) return true;
    if (facility.type === 'camera' && adjacentFacilities(index, 'generator').length) return true;
    if (facility.type === 'generator' && adjacentFacilities(index, 'camera').length) return true;
    return false;
  }

  function adjacentIndices(index) {
    const row = Math.floor(index / 3);
    const col = index % 3;
    return [[row - 1, col], [row + 1, col], [row, col - 1], [row, col + 1]]
      .filter(([r, c]) => r >= 0 && r < 3 && c >= 0 && c < 3)
      .map(([r, c]) => r * 3 + c);
  }

  function adjacentFacilities(index, type) {
    return adjacentIndices(index).map((i) => game.grid[i]).filter((f) => f && f.type === type);
  }

  function hasAdjacentPair(a, b) {
    return game.grid.some((facility, index) => facility && facility.type === a && adjacentFacilities(index, b).length > 0);
  }

  function rowHasTwoShelves(row) {
    return game.grid.slice(row * 3, row * 3 + 3).filter((f) => f?.type === 'shelf').length >= 2;
  }

  function hasGoldenAisle() {
    return [0, 1, 2].some(rowHasTwoShelves);
  }

  function totalFacilityLevels(type) {
    return game.grid.reduce((sum, facility) => sum + (facility?.type === type ? facility.level : 0), 0);
  }

  function facilityUpgradeCost(facility) {
    return Math.round(FACILITIES[facility.type].cost * (.65 + facility.level * .55));
  }

  function doorUpgradeCost() {
    const levels = Math.round((game.doorMax - 100) / 25);
    return 45 + levels * 25;
  }

  function frontEnemy() {
    return [...game.enemies].filter((e) => !e.dead).sort((a, b) => a.x - b.x)[0] || null;
  }

  function useProtocol() {
    if (game.phase !== 'defense' || game.evidence < 100 || game.protocolUsedThisDefense) return;
    game.protocolUsedThisDefense = true;
    game.evidence = 0;
    game.enemies.forEach((enemy) => {
      enemy.x += 55;
      enemy.stunned = Math.max(enemy.stunned, 2.2);
      damageEnemy(enemy, enemy.boss ? 42 : 30);
    });
    game.doorHp = Math.min(game.doorMax, game.doorHp + 18);
    if (game.upgrades.protocolRefund) game.money += 24;
    setCoach('⚡', '封店协议启动', '正确盘查积累的证据，终于在防守阶段变成一次可见的翻盘。');
    tone(850, .24, 'sawtooth', .08);
    renderAll();
  }

  function upgradeDoor() {
    if (game.phase === 'defense') return;
    const cost = doorUpgradeCost();
    if (game.money < cost) return;
    game.money -= cost;
    game.doorMax += 25;
    game.doorHp = Math.min(game.doorMax, game.doorHp + 25);
    setCoach('🚪', '卷帘门完成升级', '防守更稳，但这笔钱没有投入经济与设施。你在为安全买单。');
    tone(430, .09, 'triangle', .04);
    renderAll();
  }

  function drawBattle(time) {
    const w = els.battleCanvas.width;
    const h = els.battleCanvas.height;
    ctx.clearRect(0, 0, w, h);

    const night = game?.phase === 'defense';
    const gradient = ctx.createLinearGradient(0, 0, w, h);
    gradient.addColorStop(0, night ? '#080a11' : '#141827');
    gradient.addColorStop(1, night ? '#101627' : '#21283a');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = night ? '#1d2433' : '#2b3446';
    ctx.fillRect(0, 128, w, 42);
    ctx.strokeStyle = '#424c5d';
    ctx.setLineDash([12, 12]);
    ctx.beginPath();
    ctx.moveTo(0, 148);
    ctx.lineTo(w, 148);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#111722';
    ctx.fillRect(7, 32, 58, 106);
    ctx.fillStyle = game && game.doorHp / game.doorMax < .35 ? '#7d2433' : '#344258';
    ctx.fillRect(43, 57, 22, 77);
    ctx.fillStyle = '#d9e2ef';
    ctx.font = '10px system-ui';
    ctx.fillText('便利店', 12, 49);

    if (!game) return;

    game.projectiles.forEach((p) => {
      ctx.fillStyle = '#ffd166';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fill();
    });

    game.enemies.forEach((enemy) => {
      const pulse = Math.sin(time * 7 + enemy.y) * 1.5;
      const size = enemy.boss ? 20 : enemy.saboteur ? 13 : 11;
      ctx.save();
      ctx.translate(enemy.x, enemy.y + pulse);
      if (enemy.marked > 0) {
        ctx.strokeStyle = '#63c7ff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, size + 6, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (enemy.frozen > 0) ctx.globalAlpha = .65;
      ctx.fillStyle = enemy.boss ? '#b58cff' : enemy.saboteur ? '#ff667d' : '#df4f68';
      ctx.beginPath();
      ctx.arc(0, 0, size, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0a0c12';
      ctx.beginPath();
      ctx.arc(-4, -2, 2, 0, Math.PI * 2);
      ctx.arc(4, -2, 2, 0, Math.PI * 2);
      ctx.fill();
      if (enemy.boss) {
        ctx.fillStyle = '#f2eaff';
        ctx.font = '9px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('无面店长', 0, -27);
      }
      const hpWidth = enemy.boss ? 45 : 24;
      ctx.fillStyle = '#242a37';
      ctx.fillRect(-hpWidth / 2, size + 5, hpWidth, 4);
      ctx.fillStyle = enemy.frozen > 0 ? '#63c7ff' : '#82f2ba';
      ctx.fillRect(-hpWidth / 2, size + 5, hpWidth * Math.max(0, enemy.hp / enemy.maxHp), 4);
      ctx.restore();
    });

    if (game.phase === 'business') {
      ctx.fillStyle = 'rgba(255,255,255,.55)';
      ctx.font = '12px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('营业中：门外暂时平静', 220, 88);
      ctx.fillStyle = 'rgba(130,242,186,.12)';
      ctx.fillRect(84, 44, 270, 58);
    }
  }

  function setCoach(icon, title, text) {
    els.coachIcon.textContent = icon;
    els.coachTitle.textContent = title;
    els.coachText.textContent = text;
  }

  function shuffle(items) {
    for (let i = items.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  }

  function tone(frequency, duration, type = 'sine', volume = .035) {
    if (!soundEnabled) return;
    try {
      audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = type;
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(volume, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(.0001, audioContext.currentTime + duration);
      oscillator.connect(gain).connect(audioContext.destination);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + duration);
    } catch (_) {
      // Audio is optional in the graybox.
    }
  }

  $$('.build-button').forEach((button) => {
    button.addEventListener('click', () => {
      game.selectedBuild = button.dataset.build;
      renderBuildButtons();
      const def = FACILITIES[game.selectedBuild];
      setCoach(def.icon, `已选择${def.name}`, `点空格建造。营业：${def.day(1)}；熄灯：${def.night(1)}。`);
    });
  });

  els.closeEarlyButton.addEventListener('click', () => closeStore(true));
  els.protocolButton.addEventListener('click', useProtocol);
  els.doorUpgradeButton.addEventListener('click', upgradeDoor);
  els.restartButton.addEventListener('click', startGame);
  els.resultRetryButton.addEventListener('click', startGame);
  els.soundButton.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    els.soundButton.textContent = soundEnabled ? '🔊' : '🔇';
  });

  window.__gameDebug = {
    getState: () => game,
    closeStore: () => closeStore(true),
    useProtocol,
    restart: startGame
  };

  startGame();
})();
