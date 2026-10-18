// ============================================================
// R39 村民繁殖+铁傀儡轮 实机验证(CDP,--remote-debugging-port=9333)
// 覆盖:村民面包喂食(真实瞄准/求爱/幼崽拒绝/人满拒绝)、两只求爱产
// 村民幼崽(0.55 缩放+home+60s 长大)、幼崽右键不开面板、空手交易不受
// 影响;铁块配方;铁傀儡 T 形构造生成(R57 还原原版:4 铁块 T + 雕刻南瓜
// 最后放,普通南瓜不触发,结构 5 块消失);
// 守护 AI(追击+击杀敌对生物)、仇恨(R57:建造的傀儡被误伤不还手,
// 野外傀儡仍反击 7 伤+15s 平息)、死亡掉铁锭 3-5+XP 0;存档往返;
// ============================================================
const CDP = process.env.CDP || 'http://127.0.0.1:9333';
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
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, timeout: 60000 });
    if (r.result.exceptionDetails) {
      throw new Error('EVAL ERROR: ' + ((r.result.exceptionDetails.exception && r.result.exceptionDetails.exception.description) || r.result.exceptionDetails.text));
    }
    return r.result.result.value;
  };
  await send('Runtime.enable');

  const results = [];
  const check = (name, cond, extra = '') => results.push((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' | ' + extra : ''));

  // ---- 0. 进游戏(传送村庄开阔地)----
  await sleep(1500);
  await evl(`document.getElementById('overlay').click()`);
  await sleep(600);
  await evl(`endTutorial()`);
  const hut = await evl(`(() => { for (let cx=-6;cx<=6;cx++) for (let cz=-6;cz<=6;cz++){ const h=villageInCell(cx,cz,worldSeed); if(h) return h; } })()`);
  await evl(`playerPos.set(${hut.cx + 8.5}, ${hut.base + 4}, ${hut.cz + 8.5}); velocity.set(0,0,0); isFlying=false;`);
  await sleep(2600);
  await evl(`(() => {   // 平整村庄旁一块空地(清树冠),原点挂 window.__RS
    const px = Math.floor(playerPos.x), gy = Math.floor(playerPos.y) - 1, pz = Math.floor(playerPos.z);
    for (let dx = -2; dx <= 8; dx++) for (let dz = -3; dz <= 3; dz++) {
      setBlock(px + dx, gy, pz + dz, 'grass');
      for (let dy = 1; dy <= 4; dy++) setBlock(px + dx, gy + dy, pz + dz, null);
    }
    playerPos.set(px + 0.5, gy + 1.9, pz + 0.5); velocity.set(0, 0, 0);
    window.__RS = { px, gy, pz };
    return true;
  })()`);
  await sleep(300);
  check('进入游戏+空地就绪', await evl(`typeof feedVillager === 'function' && typeof golemAI === 'function'`) && !!hut);

  // ---- 1. 村民面包喂食(真实瞄准:手持面包右键村民 → 求爱;重复/幼崽拒绝)----
  // 两村民分居玩家两侧(避免瞄准 B 的射线先命中更近的 A)
  const feed = await evl(`(() => {
    const px = window.__RS.px, gy = window.__RS.gy, pz = window.__RS.pz;
    clearMobs();
    const a = spawnMob(px + 2.5, gy + 1, pz + 0.5, 'villager');
    const b = spawnMob(px + 2.5, gy + 1, pz + 2.5, 'villager');
    a.turnT = 999; b.turnT = 999;   // 冻结游荡便于瞄准
    playerPos.set(px + 0.5, gy + 1.9, pz + 1.5); velocity.set(0, 0, 0);
    const hold = (id) => { for (let i = 0; i < 9; i++) hotbar[i] = null; hotbar[0] = { kind: 'item', id, count: 3 }; currentSlot = 0; selectSlot(0); };
    const aimAt = (m) => { const t = m.mesh.position; const dx = t.x - playerPos.x, dy = t.y - playerPos.y, dz = t.z - playerPos.z; yaw = Math.atan2(-dx, -dz); pitch = Math.asin(dy / Math.hypot(dx, dy, dz)); };
    hold('bread');
    aimAt(a); placeBlock();
    const loveA = a.loveT === 30;
    const breadLeft = hotbar[0] && hotbar[0].count;
    const again = (() => { aimAt(a); placeBlock(); return a.loveT === 30; })();   // 重复喂:仍在求爱(拒绝,数量不变)
    aimAt(b); placeBlock();
    const loveB = b.loveT === 30;
    return { loveA, breadLeft, again, loveB };
  })()`);
  check('村民喂面包:两只求爱 + 面包消耗 + 重复拒绝', feed.loveA && feed.loveB && feed.breadLeft === 2 && feed.again, JSON.stringify(feed));

  // ---- 2. 求爱会合产崽(村民幼崽 0.55 + home + MOB_CN toast)----
  const breed = await evl(`(() => {
    const vs = mobs.filter(m => m.type === 'villager');
    vs[0].turnT = 999; vs[1].turnT = 999;
    for (let i = 0; i < 200; i++) updateMobs(0.05);
    const baby = mobs.find(m => m.type === 'villager' && m.baby);
    return { baby: !!baby, scale: baby ? +baby.mesh.scale.x.toFixed(2) : null,
             home: baby && baby.home ? Math.abs(baby.home.x - window.__RS.px) < 60 : false,
             cd: baby ? true : false, n: mobs.filter(m => m.type === 'villager').length };
  })()`);
  check('村民繁殖:幼崽诞生(0.55 缩放 + home 绑定)', breed.baby && Math.abs(breed.scale - 0.55) < 0.01 && breed.home, JSON.stringify(breed));

  // ---- 3. 幼崽右键不开面板;空手右键成体 → 交易面板(不回归)----
  const panel = await evl(`(() => {
    const px = window.__RS.px, gy = window.__RS.gy, pz = window.__RS.pz;
    const baby = mobs.find(m => m.type === 'villager' && m.baby);
    const adult = mobs.find(m => m.type === 'villager' && !m.baby);
    baby.mesh.position.set(px + 2.5, gy + 1, pz + 1.5);
    playerPos.set(px + 0.5, gy + 1.9, pz + 1.5); velocity.set(0, 0, 0);
    for (let i = 0; i < 9; i++) hotbar[i] = null;
    hotbar[0] = { kind: 'item', id: 'wheat', count: 1 }; currentSlot = 0; selectSlot(0);
    const dx = baby.mesh.position.x - playerPos.x, dy = baby.mesh.position.y - playerPos.y, dz = baby.mesh.position.z - playerPos.z;
    yaw = Math.atan2(-dx, -dz); pitch = Math.asin(dy / Math.hypot(dx, dy, dz));
    placeBlock();
    const babyRefused = document.getElementById('trade-panel').classList.contains('hidden');
    baby.mesh.position.set(px + 7.5, gy + 1, pz + 2.5);   // 幼崽挪远,避免挡住成体
    adult.mesh.position.set(px + 2.5, gy + 1, pz + 1.5);
    const dx2 = adult.mesh.position.x - playerPos.x, dy2 = adult.mesh.position.y - playerPos.y, dz2 = adult.mesh.position.z - playerPos.z;
    yaw = Math.atan2(-dx2, -dz2); pitch = Math.asin(dy2 / Math.hypot(dx2, dy2, dz2));
    placeBlock();
    const adultOpened = !document.getElementById('trade-panel').classList.contains('hidden');
    closeTradePanel();
    return { babyRefused, adultOpened };
  })()`);
  check('幼崽不开面板 / 空手右键成体开交易', panel.babyRefused && panel.adultOpened, JSON.stringify(panel));

  // ---- 4. 人满拒绝:村内已有 6 村民时再喂拒绝 ----
  const cap = await evl(`(() => {
    const px = window.__RS.px, gy = window.__RS.gy, pz = window.__RS.pz;
    clearMobs();
    const home = { x: ${hut.cx + 0.5}, z: ${hut.cz + 0.5} };
    for (let i = 0; i < 6; i++) { const v = spawnMob(px + 2 + i * 0.3, gy + 1, pz + 0.5, 'villager'); v.home = home; v.turnT = 999; }
    const t = mobs[0];
    t.mesh.position.set(px + 2.5, gy + 1, pz + 0.5);
    playerPos.set(px + 0.5, gy + 1.9, pz + 0.5); velocity.set(0, 0, 0);
    for (let i = 0; i < 9; i++) hotbar[i] = null;
    hotbar[0] = { kind: 'item', id: 'bread', count: 1 }; currentSlot = 0; selectSlot(0);
    const dx = t.mesh.position.x - playerPos.x, dy = t.mesh.position.y - playerPos.y, dz = t.mesh.position.z - playerPos.z;
    yaw = Math.atan2(-dx, -dz); pitch = Math.asin(dy / Math.hypot(dx, dy, dz));
    const bread0 = hotbar[0].count;
    placeBlock();
    return { refused: t.loveT === undefined || t.loveT === 0, breadKept: hotbar[0] && hotbar[0].count === bread0 };
  })()`);
  check('人满拒绝:村内 6 村民不再进食(面包不消耗)', cap.refused && cap.breadKept, JSON.stringify(cap));

  // ---- 5. 铁傀儡构造(还原原版,R57):4 铁块 T 形 + 雕刻南瓜最后放 ----
  //   横杠 (px+4/5/6, gy+2) / 竖杆 (px+5, gy+1) / 南瓜 (px+5, gy+3)
  //   先放普通南瓜 → 不触发;拆下换成雕刻南瓜(真实 placeBlock 从上方放)→ 生成
  const golem = await evl(`(() => {
    const px = window.__RS.px, gy = window.__RS.gy, pz = window.__RS.pz;
    clearMobs();
    for (const dx of [-1, 0, 1]) setBlock(px + 5 + dx, gy + 2, pz, 'iron_block');   // 横杠 3
    setBlock(px + 5, gy + 1, pz, 'iron_block');                                     // 竖杆
    setBlock(px + 5, gy + 3, pz, 'pumpkin');                                        // 普通南瓜
    const noGolem = !mobs.some(m => m.type === 'golem');
    setBlock(px + 5, gy + 3, pz, null);                                             // 拆下重放
    playerPos.set(px + 5.5, gy + 4.6, pz + 3.5); velocity.set(0, 0, 0);
    for (let i = 0; i < 9; i++) hotbar[i] = null;
    hotbar[0] = { kind: 'block', id: 'carved_pumpkin', count: 1 }; currentSlot = 0; selectSlot(0);
    const tx = px + 5.5, ty = gy + 3, tz = pz + 0.5;
    const dx = tx - playerPos.x, dy = ty - playerPos.y, dz = tz - playerPos.z;
    yaw = Math.atan2(-dx, -dz); pitch = Math.asin(dy / Math.hypot(dx, dy, dz));
    placeBlock();   // 南瓜落在横杠中块顶面 → 南瓜最后放 → 触发
    const g = mobs.find(m => m.type === 'golem');
    return { noGolem, golem: !!g, hp: g ? g.hp : null,
             headLeft: getBlock(px + 5, gy + 3, pz),
             gone: getBlock(px + 5, gy + 2, pz) === null && getBlock(px + 4, gy + 2, pz) === null
                   && getBlock(px + 6, gy + 2, pz) === null && getBlock(px + 5, gy + 1, pz) === null,
             achv: achvUnlocked.has('golem') };
  })()`);
  check('铁傀儡构造:普通南瓜不触发 → 雕刻南瓜最后放 → 生成(hp100)+ 5 块消失 + 成就',
    golem.noGolem && golem.golem && golem.hp === 100 && golem.gone && golem.headLeft === null && golem.achv, JSON.stringify(golem));

  // ---- 6. 守护 AI:追击并击杀 12 格内敌对生物 ----
  const guard = await evl(`(() => {
    const px = window.__RS.px, gy = window.__RS.gy, pz = window.__RS.pz;
    const g = mobs.find(m => m.type === 'golem');
    g.mesh.position.set(px + 3.5, gy + 1, pz + 0.5);
    const z = spawnMob(px + 7.5, gy + 1, pz + 0.5, 'zombie');
    z.turnT = 9999;
    const d0 = Math.hypot(g.mesh.position.x - z.mesh.position.x, g.mesh.position.z - z.mesh.position.z);
    let dead = false;
    for (let i = 0; i < 600; i++) { updateMobs(0.05); if (!mobs.includes(z)) { dead = true; break; } }
    const d1 = 0;
    return { d0: +d0.toFixed(1), dead, stillThere: mobs.includes(g) };
  })()`);
  check('守护 AI:4 格外僵尸被铁傀儡追击击杀', guard.dead && guard.stillThere, JSON.stringify(guard));

  // ---- 7. 仇恨(R57 原版):玩家建造的傀儡被误伤不还手;野外傀儡仍按 R39 反击 ----
  const anger = await evl(`(() => {
    const built = mobs.find(m => m.type === 'golem');
    built.mesh.position.set(playerPos.x + 3.5, playerPos.y - 0.9, playerPos.z);
    playerHP = 20; updateHPBar();
    hurtMob(built, 2, 0, 0, true);                    // 误伤建造的傀儡
    for (let i = 0; i < 40; i++) updateMobs(0.05);    // 2 秒:期间不应攻击玩家
    const builtCalm = !built.angered && playerHP === 20;
    // 野外(无 playerCreated)傀儡:被攻击 → 激怒 15s → 近身 7 伤
    const wild = spawnMob(playerPos.x + 3.5, Math.floor(playerPos.y) - 1, playerPos.z, 'golem');
    hurtMob(wild, 2, 0, 0, true);
    const wildAngered = wild.angered === true && wild.angerT > 14;
    for (let i = 0; i < 40 && playerHP === 20; i++) updateMobs(0.05);
    const wildHit = playerHP < 20;
    wild.angerT = 0.01;
    for (let i = 0; i < 10; i++) updateMobs(0.05);
    const wildCalm = wild.angered === false;
    removeMob(mobs.indexOf(wild));                    // 收尾:避免影响后续存档断言
    return { builtCalm, wildAngered, wildHit, wildCalm, hp: playerHP };
  })()`);
  check('仇恨:建造傀儡误伤不还手 / 野外傀儡反击 7 伤后平息',
    anger.builtCalm && anger.wildAngered && anger.wildHit && anger.wildCalm, JSON.stringify(anger));

  // ---- 8. 死亡:掉铁锭 3-5、XP 0 ----
  const death = await evl(`(() => {
    clearXPOrbs(); clearDroppedItems();
    const g = mobs.find(m => m.type === 'golem');
    const d0 = droppedItems.length;
    hurtMob(g, 999, 0, 0, true);
    const iron = droppedItems.slice(d0).filter(it => it.userData.type === 'iron_ingot').reduce((s, it) => s + it.userData.count, 0);
    return { removed: !mobs.includes(g), iron, xp: xpOrbs.length };
  })()`);
  check('死亡:掉铁锭 3-5 + 无经验球(经典)', death.removed && death.iron >= 3 && death.iron <= 5 && death.xp === 0, JSON.stringify(death));

  // ---- 9. 存档往返:村民幼崽 + 铁傀儡入档恢复 ----
  const rt = await evl(`(() => {
    const px = window.__RS.px, gy = window.__RS.gy, pz = window.__RS.pz;
    const g = spawnMob(px + 3.5, gy + 1, pz + 0.5, 'golem');
    const baby = spawnMob(px + 4.5, gy + 1, pz + 0.5, 'villager');
    baby.baby = true; baby.growT = 60; baby.mesh.scale.setScalar(0.55);
    g.hp = 77;
    const rec = JSON.parse(JSON.stringify(buildSaveRecord()));
    applySave(rec);
    const g2 = mobs.find(m => m.type === 'golem');
    const b2 = mobs.find(m => m.type === 'villager' && m.baby);
    return { golemHp: g2 ? g2.hp : null, babyBack: !!b2, babyScale: b2 ? +b2.mesh.scale.x.toFixed(2) : null };
  })()`);
  check('存档往返:铁傀儡(hp77)+ 村民幼崽恢复', rt.golemHp === 77 && rt.babyBack && Math.abs(rt.babyScale - 0.55) < 0.01, JSON.stringify(rt));

  // ---- 10. 报错 ----
  await sleep(800);
  check('页面 0 JS error', jsErrors.length === 0, jsErrors.slice(0, 3).join(' || '));

  console.log('\n===== R39 村民繁殖+铁傀儡轮 实机验证 =====');
  for (const r of results) console.log(r);
  const fails = results.filter(r => r.startsWith('FAIL'));
  console.log(`\n结果: ${results.length - fails.length}/${results.length} PASS`);
  if (fails.length) { console.log('❌ 有失败项'); process.exit(1); }
  console.log('✅ 全部通过');
  ws.close();
  process.exit(0);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
