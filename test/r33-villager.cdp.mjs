// ============================================================
// R33 村民交易轮 实机验证(CDP,headless Chrome)
// 用法同 test/smoke.cdp.mjs:先起 --remote-debugging-port=9333 的
// headless Chrome 打开本作 index.html,再运行本脚本。
// 覆盖:村民模型/家寻路/受击逃跑、交易面板(瞄准右键开、卖/买、
// 支付不足、满栏掉落兜底、Esc 关闭)、猪喂食不回归、村庄生成挂接
// (每屋 ≤2、绕过动物帽)、存档往返、死亡无掉落、FPS/零报错。
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
  const evl = async (expression, awaitPromise = false) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true, timeout: 60000 });
    if (r.result.exceptionDetails) {
      throw new Error('EVAL ERROR: ' + ((r.result.exceptionDetails.exception && r.result.exceptionDetails.exception.description) || r.result.exceptionDetails.text));
    }
    return r.result.result.value;
  };
  await send('Runtime.enable');

  const results = [];
  const check = (name, cond, extra = '') => results.push((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' | ' + extra : ''));

  // ---- 0. 进游戏 ----
  await sleep(1500);
  await evl(`document.getElementById('overlay').click()`);
  await sleep(600);
  const started = await evl(`document.getElementById('overlay').classList.contains('hidden') && typeof spawnMob === 'function'`);
  check('进入游戏', started === true);

  // ---- 1. 找一座离广场最近的小屋,传送过去等区块 ----
  const hut = await evl(`(() => {
    let best = null;
    for (let cx = -6; cx <= 6 && !best; cx++)
      for (let cz = -6; cz <= 6; cz++) {
        const h = villageInCell(cx, cz, worldSeed);
        if (h) { best = h; break; }
      }
    return best;
  })()`);
  check('找到村庄小屋(±6 村格内)', !!hut, JSON.stringify(hut));
  await evl(`playerPos.set(${hut.cx + 10.5}, ${hut.base + 6}, ${hut.cz + 10.5}); velocity.set(0,0,0); isFlying = false;`);
  await sleep(2600);   // 等区块加载 + 网格

  // ---- 2. 村民模型 + home 绑定 ----
  const v0 = await evl(`(() => {
    const v = spawnMob(${hut.cx + 3.5}, ${hut.base + 2}, ${hut.cz + 3.5}, 'villager');
    return { type: v.type, hp: v.hp, homeX: v.home ? v.home.x : null,
             parts: v.mesh.children.length, hasLegs: !!(v.mesh.userData.legs && v.mesh.userData.legs.length === 2) };
  })()`);
  check('村民生成:type/hp/模型部件/双腿', v0.type === 'villager' && v0.hp === 20 && v0.parts >= 9 && v0.hasLegs, JSON.stringify(v0));
  check('home 绑定到小屋中心', v0.homeX !== null && Math.abs(v0.homeX - (hut.cx + 0.5)) < 1, 'homeX=' + v0.homeX);

  // ---- 3. 离家远 → 朝家走(确定性:手动驱动 updateMobs)----
  const homeWalk = await evl(`(() => {
    const v = mobs.find(m => m.type === 'villager');
    v.fleeT = 0;
    v.mesh.position.set(${hut.cx + 20.5}, ${hut.base + 2}, ${hut.cz + 20.5});
    const d0 = Math.hypot(v.mesh.position.x - v.home.x, v.mesh.position.z - v.home.z);
    for (let i = 0; i < 400; i++) updateMobs(0.05);   // 20 秒模拟
    const d1 = Math.hypot(v.mesh.position.x - v.home.x, v.mesh.position.z - v.home.z);
    return { d0: +d0.toFixed(2), d1: +d1.toFixed(2), alive: mobs.includes(v) };
  })()`);
  check('离村 >14 格自动回家(距离收敛)', homeWalk.alive && homeWalk.d1 < homeWalk.d0 - 3, JSON.stringify(homeWalk));

  // ---- 4. 受击逃跑(背向玩家拉开距离)----
  const flee = await evl(`(() => {
    const v = mobs.find(m => m.type === 'villager');
    v.mesh.position.set(${hut.cx + 3.5}, ${hut.base + 2}, ${hut.cz + 3.5});
    playerPos.set(${hut.cx + 3.5}, ${hut.base + 2}, ${hut.cz + 6.5});   // 玩家在村民南边 3 格
    const d0 = v.mesh.position.distanceTo(playerPos);
    hurtMob(v, 1, 0, 0, true);
    const fleeSet = v.fleeT === 5;
    for (let i = 0; i < 200; i++) updateMobs(0.05);   // 10 秒模拟
    const d1 = v.mesh.position.distanceTo(playerPos);
    return { fleeSet, d0: +d0.toFixed(2), d1: +d1.toFixed(2) };
  })()`);
  check('受击设逃跑计时并拉开距离', flee.fleeSet && flee.d1 > flee.d0 + 2, JSON.stringify(flee));

  // ---- 5. 瞄准村民右键(手持小麦)开交易,而不是喂食 ----
  const openPanel = await evl(`(() => {
    const v = mobs.find(m => m.type === 'villager');
    v.fleeT = 0;
    v.mesh.position.set(${hut.cx + 3.5}, ${hut.base + 2}, ${hut.cz + 3.5});
    playerPos.set(${hut.cx + 5.5}, ${hut.base + 2}, ${hut.cz + 3.5});
    velocity.set(0, 0, 0);
    const t = v.mesh.position;
    const dx = t.x - playerPos.x, dy = t.y - playerPos.y, dz = t.z - playerPos.z;
    yaw = Math.atan2(-dx, -dz); pitch = Math.asin(dy / Math.hypot(dx, dy, dz));
    for (let i = 0; i < 9; i++) hotbar[i] = null;   // 清残留(脚本可复跑)
    hotbar[0] = { kind: 'item', id: 'wheat', count: 20 }; currentSlot = 0; buildHotbar();
    placeBlock();
    return { panel: !document.getElementById('trade-panel').classList.contains('hidden'),
             isMob: tradeOpen === v, loveT: v.loveT === undefined ? 0 : v.loveT,
             wheat: hotbar[0] ? hotbar[0].count : 0 };
  })()`);
  check('持麦右键村民 → 开交易(未被喂食截胡)', openPanel.panel && openPanel.isMob && openPanel.loveT === 0 && openPanel.wheat === 20, JSON.stringify(openPanel));

  // ---- 6. 面板内容:7 行,首行小麦×18→绿宝石(n=1 无角标,与炉面板一致),买行角标 4 ----
  const panelState = await evl(`(() => {
    const rows = document.querySelectorAll('#trade-list .trade-row');
    const r0 = rows[0], r4 = rows[4];
    return { rows: rows.length,
             r0Locked: r0.classList.contains('locked'),
             r0GiveCnt: r0.children[0].querySelector('.cnt') ? r0.children[0].querySelector('.cnt').textContent : '',
             r0GetCnt: r0.children[2].querySelector('.cnt') ? r0.children[2].querySelector('.cnt').textContent : '',
             r4GetCnt: r4.children[2].querySelector('.cnt') ? r4.children[2].querySelector('.cnt').textContent : '',
             r1Locked: rows[1].classList.contains('locked') };
  })()`);
  check('交易面板 7 行 + 角标 + 锁定态', panelState.rows === 7 && !panelState.r0Locked && panelState.r0GiveCnt === '18' && panelState.r0GetCnt === '' && panelState.r4GetCnt === '4' && panelState.r1Locked, JSON.stringify(panelState));

  // ---- 7. 卖出:小麦×18 → 绿宝石×1 ----
  const sell = await evl(`(() => {
    document.querySelectorAll('#trade-list .trade-row')[0].click();
    const cnt = (id) => INVLIB.countInHotbar(hotbar, id);
    return { wheat: cnt('wheat'), emerald: cnt('gem_emerald'),
             row5Unlocked: !document.querySelectorAll('#trade-list .trade-row')[4].classList.contains('locked') };
  })()`);
  check('交易:小麦 20→2,绿宝石 +1,买面包行解锁', sell.wheat === 2 && sell.emerald === 1 && sell.row5Unlocked, JSON.stringify(sell));

  // ---- 8. 买入:绿宝石×1 → 面包×4 ----
  const buy = await evl(`(() => {
    document.querySelectorAll('#trade-list .trade-row')[4].click();
    const cnt = (id) => INVLIB.countInHotbar(hotbar, id);
    return { emerald: cnt('gem_emerald'), bread: cnt('bread') };
  })()`);
  check('交易:绿宝石清零,面包 +4', buy.emerald === 0 && buy.bread === 4, JSON.stringify(buy));

  // ---- 9. 支付不足:直接 doTrade 锁定项,拒绝且不扣 ----
  const reject = await evl(`(() => {
    hotbar[0] = { kind: 'item', id: 'coal', count: 3 };
    const before = INVLIB.countInHotbar(hotbar, 'coal');
    doTrade(INVLIB.VILLAGER_TRADES[1]);   // 煤 ×15
    return { before, after: INVLIB.countInHotbar(hotbar, 'coal') };
  })()`);
  check('支付不足拒绝交易(数量不变)', reject.before === 3 && reject.after === 3, JSON.stringify(reject));

  // ---- 10. 满栏兜底:9 格全满时交易,产物掉在脚边 ----
  const fullBar = await evl(`(() => {
    for (let i = 0; i < 9; i++) hotbar[i] = { kind: 'item', id: 'wheat', count: 64 };
    buildHotbar();
    const d0 = droppedItems.length;
    document.querySelectorAll('#trade-list .trade-row')[0].click();   // 小麦 18 → 绿宝石(栏满,吸收 0)
    return { dropped: droppedItems.length - d0, dropId: droppedItems[droppedItems.length - 1] ? droppedItems[droppedItems.length - 1].userData.type : null,
             emerald: INVLIB.countInHotbar(hotbar, 'gem_emerald') };
  })()`);
  check('满栏交易产物掉落脚边(不亏)', fullBar.dropped === 1 && fullBar.dropId === 'gem_emerald' && fullBar.emerald === 0, JSON.stringify(fullBar));

  // ---- 11. Esc 关闭面板并重锁判定 ----
  const escClose = await evl(`(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
    return { hidden: document.getElementById('trade-panel').classList.contains('hidden'), tradeOpen: tradeOpen === null };
  })()`);
  check('Esc 关闭交易面板', escClose.hidden && escClose.tradeOpen, JSON.stringify(escClose));

  // ---- 12. 猪喂食不回归(R29)----
  const pigFeed = await evl(`(() => {
    const p = spawnMob(${hut.cx + 5.5}, ${hut.base + 2}, ${hut.cz + 5.5}, 'pig');
    playerPos.set(${hut.cx + 5.5}, ${hut.base + 2}, ${hut.cz + 7.5});
    const t = p.mesh.position;
    const dx = t.x - playerPos.x, dy = t.y - playerPos.y, dz = t.z - playerPos.z;
    yaw = Math.atan2(-dx, -dz); pitch = Math.asin(dy / Math.hypot(dx, dy, dz));
    for (let i = 0; i < 9; i++) hotbar[i] = null;
    hotbar[0] = { kind: 'item', id: 'wheat', count: 5 }; currentSlot = 0; buildHotbar();
    placeBlock();
    return { loveT: p.loveT, wheat: hotbar[0] ? hotbar[0].count : 0,
             panelOpen: !document.getElementById('trade-panel').classList.contains('hidden') };
  })()`);
  check('猪仍可小麦喂食(loveT=30,消耗 1)', pigFeed.loveT === 30 && pigFeed.wheat === 4 && !pigFeed.panelOpen, JSON.stringify(pigFeed));

  // ---- 13. 村庄生成挂接:动物满帽时村民仍补齐至每屋 2 ----
  const villageSpawn = await evl(`(() => {
    clearMobs();
    for (let i = 0; i < 10; i++) spawnMob(${hut.cx + 6.5}, ${hut.base + 2}, ${hut.cz + 6.5}, 'pig');   // 顶满 MOB_CAP
    playerPos.set(${hut.cx + 12.5}, ${hut.base + 4}, ${hut.cz + 12.5});   // 离小屋 >10 格允许生成
    velocity.set(0, 0, 0);
    for (let i = 0; i < 2000; i++) trySpawnMob();
    return { pigs: mobs.filter(m => m.type === 'pig').length,
             villagers: countVillagersNear(${hut.cx + 0.5}, ${hut.cz + 0.5}) };
  })()`);
  check('村庄自动补村民(每屋 ≤2,绕过动物帽)', villageSpawn.villagers === 2 && villageSpawn.pigs === 10, JSON.stringify(villageSpawn));

  // ---- 14. 存档往返:本小屋村民入档、读档恢复(home 重算)----
  const roundtrip = await evl(`(() => {
    const near = (m) => Math.hypot(m.mesh.position.x - ${hut.cx + 0.5}, m.mesh.position.z - ${hut.cz + 0.5}) < 20;
    const rec = JSON.parse(JSON.stringify(buildSaveRecord()));
    const before = rec.mobsData ? rec.mobsData.filter(m => m.t === 'villager' && Math.hypot(m.x - ${hut.cx + 0.5}, m.z - ${hut.cz + 0.5}) < 20).length : -1;
    applySave(rec);
    const vs = mobs.filter(m => m.type === 'villager' && near(m));
    const v = vs[0];
    return { before, after: vs.length,
             homeOk: v && v.home ? Math.abs(v.home.x - ${hut.cx + 0.5}) < 1 : false,
             panelClosed: document.getElementById('trade-panel').classList.contains('hidden') };
  })()`);
  check('存档往返:村民恢复 + home 重算 + 面板关闭', roundtrip.before === 2 && roundtrip.after === 2 && roundtrip.homeOk && roundtrip.panelClosed, JSON.stringify(roundtrip));

  // ---- 15. 村民死亡:无掉落(经典),实体移除 ----
  const death = await evl(`(() => {
    const v = spawnMob(${hut.cx + 4.5}, ${hut.base + 2}, ${hut.cz + 4.5}, 'villager');
    const d0 = droppedItems.length;
    hurtMob(v, 99, 0, 0, true);
    return { removed: !mobs.includes(v), drops: droppedItems.length - d0 };
  })()`);
  check('村民死亡无掉落', death.removed && death.drops === 0, JSON.stringify(death));

  // ---- 16. 性能与报错(FPS 受 swiftshader 软渲染封顶;改测新 AI 每帧成本)----
  await sleep(1200);
  const perf = await evl(`(() => {
    clearMobs();
    for (let i = 0; i < 12; i++) spawnMob(${hut.cx + 3.5} + i * 0.4, ${hut.base + 2}, ${hut.cz + 3.5} + i * 0.4, 'villager');
    for (let i = 0; i < 10; i++) spawnMob(${hut.cx + 6.5}, ${hut.base + 2}, ${hut.cz + 6.5}, 'pig');
    const t0 = performance.now();
    for (let i = 0; i < 2000; i++) updateMobs(0.016);   // 2000 帧 × 22 生物
    const dt = performance.now() - t0;
    clearMobs();
    return { perFrameMs: +(dt / 2000).toFixed(4), fps: document.getElementById('fps').textContent };
  })()`);
  check('22 生物 AI+物理每帧 <0.3ms(新村民 AI 开销可控)', perf.perFrameMs < 0.3 && parseInt(perf.fps) >= 15, JSON.stringify(perf));
  check('页面 0 JS error', jsErrors.length === 0, jsErrors.slice(0, 3).join(' || '));

  console.log('\n===== R33 村民交易轮 实机验证 =====');
  for (const r of results) console.log(r);
  const fails = results.filter(r => r.startsWith('FAIL'));
  console.log(`\n结果: ${results.length - fails.length}/${results.length} PASS`);
  if (fails.length) { console.log('❌ 有失败项'); process.exit(1); }
  console.log('✅ 全部通过');
  ws.close();
  process.exit(0);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
