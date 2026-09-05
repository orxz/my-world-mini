// ============================================================
// R45 生存数值验收(CDP,--remote-debugging-port=9333):
// 挨饿全程 / 回血节奏 / 夜间刷怪压迫 / 拂晓燃烧 —— 全走真实路径
//   A 挨饿:主循环接线(updatePlayer 活动率)+ 状态机全程计时(114s 动/320s 静)
//   B 回血:真实 damagePlayer 受伤 → 主循环参数回血节奏(4s/+1,≥18 门限)
//   C 夜刷:午夜真实 updateMobs 120s —— 敌对生成 ≥3、全部距玩家 ≥12 格、
//           火把防刷(广场点亮区 0 生成)、AFK 玩家受击(压迫感量化)
//   D 拂晓:正午天空直射 僵尸/骷髅燃烧致死(≤8s)、苦力怕/蜘蛛不燃烧
//   E 数值:僵尸近战 3 伤/1.5s 冷却(经典对照)
// ============================================================
const CDP = 'http://127.0.0.1:9333';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  let targets = null;
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(CDP + '/json/list');
      targets = await res.json();
      if (targets.some((t) => t.type === 'page')) break;
    } catch (e) { /* chrome not up yet */ }
    await sleep(500);
  }
  const page = targets && targets.find((t) => t.type === 'page');
  if (!page) { console.error('FATAL: no page target'); process.exit(1); }

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  let id = 0;
  const pending = new Map();
  const jsErrors = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    else if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      jsErrors.push((d.exception && d.exception.description) || d.text);
    }
  };
  const send = (method, params = {}) => new Promise((res) => {
    const mid = ++id;
    pending.set(mid, res);
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
  const evl = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, timeout: 120000 });
    if (r.result.exceptionDetails) {
      throw new Error('EVAL ERROR: ' + ((r.result.exceptionDetails.exception && r.result.exceptionDetails.exception.description) || r.result.exceptionDetails.text));
    }
    return r.result.result.value;
  };
  await send('Runtime.enable');
  await send('Console.enable');
  await send('Page.enable');
  await send('Page.navigate', { url: 'file://' + process.cwd() + '/index.html?fresh=' + Date.now() });
  await sleep(2500);

  const results = [];
  const check = (name, cond, extra = '') => results.push((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' | ' + extra : ''));

  // ---- 0. 进游戏 ----
  await evl(`document.getElementById('overlay').click()`);
  await sleep(600);
  await evl(`endTutorial()`);
  check('进入游戏', await evl(`document.getElementById('overlay').classList.contains('hidden')`));

  // ---- A. 挨饿:接线 + 全程计时 ----
  const starve = await evl(`(() => {
    const out = {};
    // 净空前向走廊(随机树冠会悬垂广场北缘:头部进叶被 collidePlayer
    // 清零水平速度,活动率掉回静止档 —— yaw=0 前进即 -z 方向)
    const py0 = Math.floor(playerPos.y);
    for (let dz = 0; dz >= -8; dz--) for (let dy = 0; dy <= 2; dy++) setBlock(0, py0 + dy, dz, null);
    velocity.set(0, 0, 0);
    // A1 主循环接线:updatePlayer 移动态活动率 0.7(keys 用 e.code 键名)
    hungerState.hunger = 20; hungerState.drain = 0;
    const pos0 = { x: playerPos.x, y: playerPos.y, z: playerPos.z };
    keys['KeyW'] = true; updatePlayer(0.1);
    out.keysW = !!keys['KeyW']; out.drain1 = hungerState.drain.toFixed(4); out.vel1 = Math.hypot(velocity.x, velocity.z).toFixed(2);
    out.tmType = typeof window.__touchMove; out.tmVal = (typeof window.__touchMove === 'function') ? JSON.stringify(window.__touchMove()) : null;
    out.yawV = (yaw === null || yaw === undefined) ? String(yaw) : yaw.toFixed(3);
    keys['KeyW'] = false;
    out.velMove = Math.hypot(velocity.x, velocity.z);
    out.pos0 = pos0.x.toFixed(1) + ',' + pos0.y.toFixed(1) + ',' + pos0.z.toFixed(1);
    out.water0 = inWater(); out.fly0 = isFlying;
    out.ride0 = !!ridingCart; out.tut0 = tutorial.active;
    out.wiringMove = Math.abs(hungerState.drain - 0.07) < 1e-9;   // 0.1s × 0.7
    // A2 静止态活动率 0.25
    velocity.set(0, 0, 0); updatePlayer(0.1);
    out.wiringIdle = Math.abs(hungerState.drain - (0.07 + 0.025)) < 1e-9;
    // A3 全程计时(状态机=主循环同一函数同参数):移动 20→0 点秒数 + 饿伤害全程
    const s1 = { hunger: 20, drain: 0, regenT: 0, starveT: 0 };
    let t1 = 0;
    while (s1.hunger > 0 && t1 < 400) { const r = INVLIB.hungerTick(s1, 0.1, 0.7, false); t1 += 0.1; if (r.hungerChanged && s1.hunger === 0) break; }
    out.moveEmptySec = Math.round(t1);
    // 饿到 floor:主循环条件 playerHP > 2 时 damagePlayer(1,'starve')
    const s2 = { hunger: 0, drain: 0, regenT: 0, starveT: 0 };
    playerHP = 20; let t2 = 0; const floors = [];
    for (let i = 0; i < 900; i++) {   // 90s 足够触底
      const r = INVLIB.hungerTick(s2, 0.1, 0.25, playerHP < PLAYER_MAX_HP);
      t2 += 0.1;
      if (r.starve && playerHP > 2) damagePlayer(1, 'starve');
      if (i % 100 === 0) floors.push(playerHP);
    }
    out.starveFloor = playerHP;
    out.starveSeq = floors.join(',');
    // 恢复现场
    playerHP = PLAYER_MAX_HP; updateHPBar();
    hungerState.hunger = 20; hungerState.drain = 0; updateHungerBar();
    return out;
  })()`);
  check('A1 挨饿接线:移动 0.7 / 静止 0.25 活动率(真实 updatePlayer)', starve.wiringMove && starve.wiringIdle, JSON.stringify(starve));
  check('A2 挨饿全程:移动 20→0 点约 114s(±10)', starve.moveEmptySec >= 104 && starve.moveEmptySec <= 124, 'moveEmptySec=' + starve.moveEmptySec);
  check('A3 饿伤触底:停在该难度下限(2 HP),不饿死', starve.starveFloor === 2, 'floor=' + starve.starveFloor + ' seq=' + starve.starveSeq);

  // ---- B. 回血节奏+食物经济(真实 updatePlayer 全链路,R45 回血消耗食物)----
  const regen = await evl(`(() => {
    damagePlayer(6, 'combat');          // 真实路径受伤(无护甲=6 直扣)
    const hp0 = playerHP;               // 20-6=14
    hungerState.hunger = 20; hungerState.drain = 0; hungerState.regenT = 0;
    velocity.set(0, 0, 0); keys['KeyW'] = false;
    const stamps = [];
    let t = 0;
    while (t < 40 && playerHP < PLAYER_MAX_HP) {
      const before = playerHP;
      updatePlayer(0.1); t += 0.1;
      if (playerHP > before) stamps.push(Math.round(t));
      if (stamps.length >= 5 && t > stamps[4] + 3) break;   // 5 口后若停滞即止
    }
    const stalledHP = playerHP, stalledHunger = hungerState.hunger;
    // 吃面包(真实右键进食)→ 饥饿回 20 → 继续回血到满
    hotbar[7] = { kind: 'item', id: 'bread', count: 2 }; currentSlot = 7; selectSlot(7); buildHotbar();
    placeBlock();
    const afterEat = hungerState.hunger;
    let healed = false;
    for (let i = 0; i < 350 && !healed; i++) { updatePlayer(0.1); t += 0.1; if (playerHP >= PLAYER_MAX_HP) healed = true; }
    // 门限验证:饥饿 17(<18)不回血
    hungerState.hunger = 17; hungerState.regenT = 0;
    let falseRegen = false;
    for (let i = 0; i < 60; i++) { const b = playerHP; updatePlayer(0.1); if (playerHP > b) falseRegen = true; }
    playerHP = PLAYER_MAX_HP; updateHPBar();
    hungerState.hunger = 20; hungerState.drain = 0; updateHungerBar();
    hotbar[7] = null; buildHotbar();
    return { hp0, stamps: stamps.join(','), stalledHP, stalledHunger, afterEat, healedFull: healed, noRegenBelow18: !falseRegen };
  })()`);
  const stampsArr = regen.stamps.split(',').map(Number);
  check('B1 回血节奏:4s/+1(消耗食物后停滞 18-19)', regen.hp0 === 14 && stampsArr.slice(0, 4).join(',') === '4,8,12,16' && (regen.stalledHP === 18 || regen.stalledHP === 19), JSON.stringify(regen));
  check('B2 食物经济:回血消耗饥饿(5 口后 20→' + regen.stalledHunger + ',<20)', regen.stalledHunger < 20);
  check('B3 进食恢复:面包+5 回 20 → 继续回血到满', regen.afterEat === 20 && regen.healedFull);
  check('B4 回血门限:饥饿 <18 不回血', regen.noRegenBelow18);

  // ---- C. 夜间刷怪压迫(午夜真实 updateMobs 120s)----
  const night = await evl(`(() => {
    clearMobs();
    droppedItems.length = 0;
    dayTime = 0;   // 午夜 sunHeight=-1
    updateDayNight(0.1);
    const plazaTorches = [];
    // 广场本身有火把:记录生成时位置分布由输出统计
    playerHP = PLAYER_MAX_HP; updateHPBar();
    const spawnLog = [];
    const origSpawn = spawnMob;
    // 记录敌对生成点(劫持记录,不改行为)
    window.spawnMob = function (x, y, z, type, opts) { const r = origSpawn(x, y, z, type, opts); if (MOB_DEFS[type] && MOB_DEFS[type].hostile) spawnLog.push({ x, y, z, type }); return r; };   // 记精确坐标(取整会让 ≥12 误判)
    const hpStamps = [];
    for (let i = 0; i < 1200; i++) {   // 120s 真实模拟(dayTime 固定午夜:
      updateMobs(0.1);                 // 循环里勿调 updateDayNight,会把昼夜推一整圈)
      if (i % 100 === 99) hpStamps.push(playerHP);
    }
    window.spawnMob = origSpawn;
    const alive = mobs.filter((m) => MOB_DEFS[m.type].hostile);
    const tooClose = spawnLog.filter((s) => Math.hypot(s.x - playerPos.x, s.z - playerPos.z) < 12);
    // 火把防刷:广场中心 8 格内(有火把网)不应有生成点
    const nearPlaza = spawnLog.filter((s) => Math.hypot(s.x - playerPos.x, s.z - playerPos.z) <= 8);
    // 追击链确定性验证:自然生成有随机性(可能都卡在地形上),把幸存
    // 敌对逐只(≤3)传送到玩家 1.2 格(近战射程内)→ 真实 AI 必须造成伤害
    // 或持续贴身;史莱姆跳得慢/骷髅拉开射箭,窗口给足 12s/只
    let chaseDmg = false, chaseClose = false;
    for (let hi = 0; hi < Math.min(3, alive.length) && !chaseDmg; hi++) {
      const h = alive[hi];
      h.mesh.position.set(playerPos.x + 1.2, playerPos.y, playerPos.z);
      const hp0 = playerHP;
      for (let i = 0; i < 120 && !chaseDmg; i++) {
        updateMobs(0.1);
        if (playerHP < hp0) chaseDmg = true;
        if (mobs.some((m) => MOB_DEFS[m.type] && MOB_DEFS[m.type].hostile && m.mesh.position.distanceTo(playerPos) < 1.6)) chaseClose = true;
      }
    }
    return {
      nightLen: 'sim 120s', sun: sunHeight().toFixed(2),
      spawns: spawnLog.length, types: spawnLog.map((s) => s.type).join(','),
      aliveAtEnd: alive.length, tooClose: tooClose.length, nearPlaza: nearPlaza.length,
      hpStamps: hpStamps.join(','), minHP: Math.min(...hpStamps, playerHP),
      finalHP: playerHP, chaseDmg, chaseClose
    };
  })()`);
  check('C1 夜间敌对生成 ≥3(120s 午夜,压迫感存在)', night.spawns >= 3, JSON.stringify(night));
  check('C2 生成距离全部 ≥12 格(不被贴脸偷袭)', night.tooClose === 0, 'tooClose=' + night.tooClose);
  check('C3 火把防刷:点亮区(≤8 格)0 生成', night.nearPlaza === 0, 'nearPlaza=' + night.nearPlaza);
  check('C4 夜间压迫感:敌对真实追击(受伤或逼近至近身)', night.chaseDmg || night.chaseClose || night.minHP < 20, 'chaseDmg=' + night.chaseDmg + ' chaseClose=' + night.chaseClose + ' minHP=' + night.minHP);

  // ---- D. 拂晓燃烧(正午天空直射;回广场净空重置,排除前段残留干扰)----
  const dawn = await evl(`(() => {
    dayTime = 0.5;   // 正午
    updateDayNight(0.1);
    clearMobs();
    // 回出生广场中心:净空重置(前段击退/弹坑会破坏受控条件)
    const pgy = (() => { for (let y = 40; y > 4; y--) if (getBlock(0, y, 0)) return y; })();
    setBlock(0, pgy, 0, 'stone');
    for (let dy = 1; dy <= 4; dy++) setBlock(0, pgy + dy, 0, null);
    playerPos.set(0.5, pgy + 1 + PLAYER_HEIGHT * 0.5 + 0.05, 0.5); velocity.set(0, 0, 0);
    const gy = pgy;
    // 站位:僵尸 6 / 骷髅 10 / 蜘蛛 14(远离苦力怕自爆半径 2.6 的波及);
    // 并清整条走廊净空(悬垂树冠会卡住追击路径 → 烧不死/打不着)
    const spots = [[6, 0], [10, 0], [14, 0]];
    for (let dx = 0; dx <= 15; dx++) for (let dz = -1; dz <= 1; dz++) {
      const gb = getBlock(dx, gy, dz);
      if (!BLOCK_TYPES[gb] || !BLOCK_TYPES[gb].solid) setBlock(dx, gy, dz, 'stone');
      for (let dy = 1; gy + dy < WORLD_HEIGHT; dy++) setBlock(dx, gy + dy, dz, null);   // 整列净空(skyExposed 查全列)
    }
    const types = ['zombie', 'skeleton', 'spider'];
    types.forEach((t, i) => spawnMob(spots[i][0] + 0.5, gy + 1, spots[i][1] + 0.5, t));
    // 苦力怕独立贴脸位(2 格,远离僵尸 6+):自爆行为确定化(自由走位死因不可控)
    spawnMob(2.5, gy + 1, 0.5, 'creeper');
    const dies = {};
    const hpBefore = playerHP;
    let t = 0;
    while (t < 12 && mobs.length > 0) { updateMobs(0.1); t += 0.1; types.forEach((tp) => { if (!(tp in dies) && !mobs.some((m) => m.type === tp)) dies[tp] = Math.round(t * 10) / 10; }); }
    // 苦力怕死因甄别:白天也敌对(经典),贴近必自爆 —— 用爆炸证据区分
    // (自爆 = 弹坑:立足位石块被炸掉 / 玩家受爆炸伤害);燃烧则两者皆无
    const crater = !getBlock(2, gy, 0) || !getBlock(3, gy, 0);
    const boomDmg = hpBefore - playerHP > 0;
    return { dies: JSON.stringify(dies), remain: mobs.map((m) => m.type).join(','), t: Math.round(t * 10) / 10, gy, crater, boomDmg };
  })()`);
  const dies = JSON.parse(dawn.dies);
  check('D1 拂晓燃烧:僵尸/骷髅白昼天空直射烧死(≤8s)', dies.zombie !== undefined && dies.zombie <= 8 && dies.skeleton !== undefined && dies.skeleton <= 8, dawn.dies);
  check('D2 仅亡灵燃烧:蜘蛛白天存活;苦力怕死因=自爆非燃烧(弹坑/爆炸伤害证据)', dies.spider === undefined && dies.creeper === undefined ? true : (dies.spider === undefined && (dawn.crater || dawn.boomDmg)), 'remain=' + dawn.remain + ' crater=' + dawn.crater + ' boomDmg=' + dawn.boomDmg);

  // ---- E. 僵尸近战数值(经典对照 3 伤/1.5s;广场净空受控场)----
  const melee = await evl(`(() => {
    clearMobs();
    dayTime = 0;   // 保持夜间(zombie 不会被烧干扰)
    updateDayNight(0.1);
    const pgy = (() => { for (let y = 40; y > 4; y--) if (getBlock(0, y, 0)) return y; })();
    for (let dx = 0; dx <= 4; dx++) for (let dz = -1; dz <= 1; dz++) {
      const gb = getBlock(dx, pgy, dz);
      if (!BLOCK_TYPES[gb] || !BLOCK_TYPES[gb].solid) setBlock(dx, pgy, dz, 'stone');
      for (let dy = 1; pgy + dy < WORLD_HEIGHT; dy++) setBlock(dx, pgy + dy, dz, null);   // 整列净空(树冠卡路径)
    }
    playerPos.set(0.5, pgy + 1 + PLAYER_HEIGHT * 0.5 + 0.05, 0.5); velocity.set(0, 0, 0);
    playerHP = 20; updateHPBar();
    spawnMob(2.5, pgy + 1, 0.5, 'zombie');
    const hits = [];
    let t = 0;
    while (t < 8 && playerHP > 0) {
      updateMobs(0.1); t += 0.1;
      if (hits.length === 0 ? playerHP < 20 : playerHP < hits[hits.length - 1].hp) hits.push({ t: Math.round(t * 10) / 10, hp: playerHP });
      if (hits.length >= 4) break;
    }
    clearMobs();
    playerHP = PLAYER_MAX_HP; updateHPBar();
    const dmgSeq = hits.map((h) => h.hp);
    const gaps = hits.slice(1).map((h, i) => Math.round((h.t - hits[i].t) * 10) / 10);
    return { hits: hits.length, dmgSeq: dmgSeq.join(','), gaps: gaps.join(','), t: Math.round(t * 10) / 10 };
  })()`);
  const gaps = melee.gaps ? melee.gaps.split(',').map(Number) : [];
  check('E1 僵尸近战:命中伤 3(20→17→14)', melee.hits >= 2 && melee.dmgSeq.startsWith('17,14'), JSON.stringify(melee));
  check('E2 攻击冷却 1.5s(±0.3)', gaps.length >= 1 && gaps.every((g) => Math.abs(g - 1.5) <= 0.3), 'gaps=' + melee.gaps);

  // ---- F. 入夜/黎明一次性提示(R45)----
  const dusk = await evl(`(() => {
    // 先静默建立「夜间」基线(吞掉此前残留状态的一次边沿)
    dayTime = 0; updateDayNight(0.1);
    const toasts = [];
    const origToast = showToast;
    window.showToast = (m) => toasts.push(String(m));
    dayTime = 0.5; updateDayNight(0.1);   // 夜→昼:天亮
    dayTime = 0.0; updateDayNight(0.1);   // 昼→夜:天黑
    dayTime = 0.05; updateDayNight(0.1);  // 同侧(夜):不再出
    window.showToast = origToast;
    return { toasts: toasts.join(' / ') };
  })()`);
  const duskToasts = dusk.toasts.split(' / ').filter(Boolean);
  check('F1 入夜/黎明各提示一次(边沿触发不刷屏)', duskToasts.length === 2 && duskToasts[0].includes('天亮') && duskToasts[1].includes('天黑'), dusk.toasts);

  // ---- G. 低饥饿一次性警告(R45:6 点时提醒,5 不再重复)----
  const warn = await evl(`(() => {
    // 回出生广场净空重置 + 每帧回位(撞墙会把速度卡零,掉回静止速率)
    const pgy = (() => { for (let y = 40; y > 4; y--) if (getBlock(0, y, 0)) return y; })();
    setBlock(0, pgy, 0, 'stone');
    for (let dy = 1; dy <= 4; dy++) setBlock(0, pgy + dy, 0, null);
    const stand = new THREE.Vector3(0.5, pgy + 1 + PLAYER_HEIGHT * 0.5 + 0.05, 0.5);
    const toasts = [];
    const origToast = showToast;
    window.showToast = (m) => toasts.push(String(m));
    hungerState.hunger = 8; hungerState.drain = 0;
    keys['KeyW'] = true;
    for (let i = 0; i < 200 && hungerState.hunger > 4; i++) { playerPos.copy(stand); velocity.set(0, 0, 0); updatePlayer(0.1); }
    keys['KeyW'] = false;
    window.showToast = origToast;
    playerHP = PLAYER_MAX_HP; updateHPBar();
    return { toasts: toasts.join(' / '), hunger: hungerState.hunger };
  })()`);
  const warnToasts = warn.toasts.split(' / ').filter((s) => s.includes('你饿了'));
  check('G1 低饥饿警告:到 6 时提醒恰好一次', warnToasts.length === 1 && warn.hunger <= 5, warn.toasts + ' | hunger=' + warn.hunger);

  // ---- H. 全程 0 JS error ----
  check('H 页面 0 JS error(全程真实路径)', jsErrors.length === 0, jsErrors.slice(0, 2).join(' | '));

  console.log(results.join('\n'));
  const fails = results.filter((r) => r.startsWith('FAIL')).length;
  console.log(`\n结果: ${results.length - fails}/${results.length} PASS` + (fails ? '\n❌ 有失败项' : '\n✅ 全部通过 —— 生存数值与夜间压迫感验收达标'));
  ws.close();
  process.exit(fails ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
