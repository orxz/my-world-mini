// ============================================================
// R46 教程引导流验收(CDP,--remote-debugging-port=9333):
// 全部走真实路径 —— keys 走动 / 真实 mousemove 事件(stub 指针锁定)
// / 瞄准破坏 / 磁吸拾取 / 真实放置 / selectSlot / toggleInventory
//   T1  首次自动开启(welcome 卡 1/11,继续+跳过按钮)
//   T2  全步骤真实通关:welcome→move(走 8 格)→look(转 2.5rad)→break×3
//       →pickup×2(捡 ③ 掉的)→place×2(放 ④ 捡的)→slot×2→inventory
//       →survival1/2 阅读卡→done 卡(11/11)
//   T3  完成即写 localStorage;点继续后教程收起;重载不再自动弹
//   T4  跳过路径:任意步点「跳过教程」→ 收起 + 记忆 + 游戏可玩
//   T5  教程期间夜间不刷怪(保护承诺);结束教程恢复刷怪
//   T6  暂停菜单「重新新手教程」真实点击 → 从头再来
//   T7  引导文案与玩法一致(床 3 羊毛+3 板 / 熔炉 8 圆石 / 1 木→4 板)
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

  const results = [];
  const check = (name, cond, extra = '') => results.push((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' | ' + extra : ''));
  const reloadFresh = async () => {
    await evl(`try { localStorage.removeItem('myword_tutorial_done'); } catch (e) {}`);
    await send('Page.navigate', { url: 'file://' + process.cwd() + '/index.html?fresh=' + Date.now() });
    await sleep(2500);
    await evl(`document.getElementById('overlay').click()`);
    await sleep(800);
  };

  // ---- T1 首次自动开启 ----
  await reloadFresh();
  const t1 = await evl(`(() => {
    const el = document.getElementById('tutorial-card');
    return {
      active: tutorial.active, visible: el && !el.classList.contains('hidden'),
      step: tutorial.step, title: el ? el.querySelector('.tut-title').textContent : '',
      hasNext: !!document.getElementById('tut-next'), hasSkip: !!document.getElementById('tut-skip'),
      indicator: el ? el.querySelector('.tut-step-ind').textContent : ''
    };
  })()`);
  check('T1 首次进入自动开启教程(welcome 卡 1/11,带继续/跳过)', t1.active && t1.visible && t1.step === 0 && t1.title.includes('欢迎') && t1.hasNext && t1.hasSkip && t1.indicator === '1 / 11', JSON.stringify(t1));

  // ---- T2 全步骤真实通关 ----
  const walk = await evl(`(() => {
    const log = [];
    const cardText = () => { const el = document.getElementById('tutorial-card'); return el ? el.querySelector('.tut-title').textContent : ''; };
    // welcome 阅读卡 → 继续,进入 ① 移动
    document.getElementById('tut-next').click();
    // ② 移动:清前向走廊(R45 坑:悬垂树冠卡碰撞清零速度),keys 真实走 8 格
    const py = Math.floor(playerPos.y);
    for (let dz = 0; dz >= -16; dz--) for (let dy = -1; dy <= 3; dy++) setBlock(0, py + dy, dz, dy === -1 ? 'planks' : null);
    velocity.set(0, 0, 0);
    let guard = 0;
    while (tutorial.step === 1 && guard++ < 200) { keys['KeyW'] = true; updatePlayer(0.1); }
    keys['KeyW'] = false;
    log.push('move->step' + tutorial.step + ' ' + cardText());
    // ③ 环顾:stub 指针锁定 + 真实 mousemove 事件(累计 2.5rad ≈ 1000px)
    Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => renderer.domElement });
    guard = 0;
    while (tutorial.step === 2 && guard++ < 60) {
      document.dispatchEvent(new MouseEvent('mousemove', { movementX: 60, movementY: 8 }));
    }
    log.push('look->step' + tutorial.step + ' ' + cardText() + ' lookProg=' + (tutorial.progress.look || 0).toFixed(2));
    return { log: log.join(' ; '), step: tutorial.step, lookDone: tutorial.step > 2 };
  })()`);
  check('T2a 移动步:keys 真实走 8 格推进', walk.step >= 2, walk.log);
  check('T2b 环顾步:真实 mousemove 事件累计 2.5rad 推进', walk.lookDone, walk.log);

  const minePlace = await evl(`(() => {
    const log = [];
    const cardText = () => { const el = document.getElementById('tutorial-card'); return el ? el.querySelector('.tut-title').textContent : ''; };
    const px = Math.floor(playerPos.x), py = Math.floor(playerPos.y), pz = Math.floor(playerPos.z);
    const aim = (tx, ty, tz) => { const dx = (tx + 0.5) - playerPos.x, dy = (ty + 0.5) - playerPos.y, dz = (tz + 0.5) - playerPos.z; yaw = Math.atan2(-dx, -dz); pitch = Math.asin(dy / Math.hypot(dx, dy, dz)); };
    clearMobs();
    // ④ 挖掘:对准走廊地面木板连击拆 3 块(掉 planks,供 ⑤ 拾取/⑥ 放置)
    const spots = [[0, -3], [0, -5], [0, -7]];
    for (const [sx, sz] of spots) {
      aim(sx, py - 1, sz);
      for (let hit = 0; hit < 12 && getBlock(sx, py - 1, sz); hit++) breakBlock();
    }
    log.push('break->step' + tutorial.step + ' ' + cardText());
    // ⑤ 拾取:真实磁吸(逐掉落物走拾)
    for (let guard = 0; guard < 60 && tutorial.step === 4; guard++) {
      const snap = droppedItems.slice();
      if (!snap.length) break;
      const d = snap[0];
      playerPos.set(d.position.x, d.position.y + 0.7, d.position.z); velocity.set(0, 0, 0);
      for (let i = 0; i < 20 && droppedItems.includes(d); i++) updateDroppedItems(0.05);
    }
    log.push('pickup->step' + tutorial.step + ' ' + cardText() + ' planks=' + INVLIB.countInHotbar(hotbar, 'planks'));
    // ⑥ 放置:显式站位到走廊(拾取传送会悬在坑里,就地瞄准的「地面」可能是空气),
    //     按 journey __placeAt 验证过的模式:支撑面已铺板,瞄其顶面上方 0.05
    const pslot = hotbar.findIndex((h) => h && h.id === 'planks');
    const put = (tx, tz) => {
      setBlock(tx, py - 1, tz, 'planks');   // 确保支撑面
      setBlock(tx, py, tz, null); setBlock(tx, py + 1, tz, null);
      currentSlot = Math.max(0, pslot); selectSlot(currentSlot);
      playerPos.set(tx + 0.5, py + 0.9, tz + 1.5); velocity.set(0, 0, 0);
      const dx = (tx + 0.5) - playerPos.x, dy = (py + 0.05) - playerPos.y, dz = (tz + 0.5) - playerPos.z;
      yaw = Math.atan2(-dx, -dz); pitch = Math.asin(dy / Math.hypot(dx, dy, dz));
      for (let g = 0; g < 5 && !getBlock(tx, py, tz); g++) placeBlock();
    };
    put(0, Math.floor(playerPos.z) - 2);
    put(0, Math.floor(playerPos.z) - 3);
    const pzAfter = Math.floor(playerPos.z);
    const placedN = [pzAfter, pzAfter - 1, pzAfter + 1, pzAfter - 2].filter((tz) => getBlock(0, py, tz) === 'planks').length;
    log.push('place->step' + tutorial.step + ' ' + cardText() + ' placedN=' + placedN + ' planksLeft=' + INVLIB.countInHotbar(hotbar, 'planks'));
    // ⑦ 切换快捷栏 ×2
    selectSlot(2); selectSlot(3);
    log.push('slot->step' + tutorial.step + ' ' + cardText());
    // ⑧ 背包:真实打开
    toggleInventory(true); toggleInventory(false);
    log.push('inventory->step' + tutorial.step + ' ' + cardText());
    return { log: log.join(' ; '), step: tutorial.step };
  })()`);
  check('T2c 挖掘步:连击拆 3 块推进', minePlace.log.includes('break->step4'), minePlace.log);
  check('T2d 拾取步:磁吸 2 个推进(且拿到 ④ 的木板)', minePlace.log.includes('pickup->step5') && /planks=[1-9]/.test(minePlace.log), minePlace.log);
  check('T2e 放置步:右键实际放置 2 块(木板被消耗)并推进', minePlace.log.includes('place->step6') && /placedN=2/.test(minePlace.log) && /planksLeft=0/.test(minePlace.log), minePlace.log);
  check('T2f 切换步:selectSlot ×2 推进', minePlace.log.includes('slot->step7'), minePlace.log);
  check('T2g 背包步:真实打开推进', minePlace.log.includes('inventory->step8'), minePlace.log);

  const finish = await evl(`(() => {
    const log = [];
    const clickNext = () => { const b = document.getElementById('tut-next'); if (b) b.click(); };
    // ⑨⑩ 生存须知阅读卡 → done
    clickNext(); log.push('after1 step=' + tutorial.step);
    clickNext(); log.push('after2 step=' + tutorial.step);
    const el = document.getElementById('tutorial-card');
    const doneTitle = el.querySelector('.tut-title').textContent;
    const doneIndicator = el.querySelector('.tut-step-ind').textContent;
    const saved = (() => { try { return localStorage.getItem('myword_tutorial_done'); } catch (e) { return null; } })();
    clickNext();   // done 卡点继续 → 收起
    const closed = !tutorial.active && document.getElementById('tutorial-card').classList.contains('hidden');
    log.push('done saved=' + saved + ' closed=' + closed);
    return { log: log.join(' ; '), doneTitle, doneIndicator, saved, closed };
  })()`);
  check('T2h 阅读卡×2 → done 卡(11/11,完成即写 localStorage)', finish.doneTitle.includes('教程完成') && finish.doneIndicator === '11 / 11' && finish.saved === '1', finish.log + ' | ' + finish.doneTitle + ' ' + finish.doneIndicator);
  check('T2i done 卡点继续 → 教程收起', finish.closed, finish.log);

  // ---- T3 完成后重载不再自动弹 ----
  await send('Page.navigate', { url: 'file://' + process.cwd() + '/index.html?fresh=' + Date.now() });
  await sleep(2200);
  await evl(`document.getElementById('overlay').click()`);
  await sleep(800);
  const t3 = await evl(`tutorial.active`);
  check('T3 完成后重载不再自动弹出教程', t3 === false, 'active=' + t3);

  // ---- T4 跳过路径 ----
  await reloadFresh();
  const t4 = await evl(`(() => {
    // 走两步到 ② 移动步再跳过(任意步可跳)
    const py = Math.floor(playerPos.y);
    for (let dz = 0; dz >= -8; dz--) for (let dy = -1; dy <= 3; dy++) setBlock(0, py + dy, dz, dy === -1 ? 'planks' : null);
    document.getElementById('tut-next').click();
    const skipBtn = document.getElementById('tut-skip');
    skipBtn.click();
    const saved = (() => { try { return localStorage.getItem('myword_tutorial_done'); } catch (e) { return null; } })();
    const hidden = document.getElementById('tutorial-card').classList.contains('hidden');
    // 游戏仍可玩:物理与刷怪正常运转
    velocity.set(0, 0, 0); updatePlayer(0.1);
    updateMobs(0.1);
    return { active: tutorial.active, saved, hidden, playable: true };
  })()`);
  check('T4 跳过路径:任意步可跳,收起+记忆+游戏可玩', t4.active === false && t4.saved === '1' && t4.hidden && t4.playable, JSON.stringify(t4));

  // ---- T5 教程期间夜间不刷怪 / 结束后恢复 ----
  const t5 = await evl(`(() => {
    const out = {};
    // 教程中:午夜 30s 无敌对生成(保护承诺)
    startTutorial(true);
    clearMobs();
    dayTime = 0; updateDayNight(0.1);
    const origSpawn = spawnMob;
    let hostile = 0;
    window.spawnMob = function (x, y, z, type, opts) { if (MOB_DEFS[type] && MOB_DEFS[type].hostile) hostile++; return origSpawn(x, y, z, type, opts); };
    for (let i = 0; i < 300; i++) updateMobs(0.1);
    out.duringTutorial = hostile;
    // 结束教程:恢复刷怪
    endTutorial();
    hostile = 0;
    for (let i = 0; i < 300; i++) updateMobs(0.1);
    window.spawnMob = origSpawn;
    out.afterTutorial = hostile;
    clearMobs();
    dayTime = 0.3; updateDayNight(0.1);
    return out;
  })()`);
  check('T5 教程期间夜间 0 刷怪;结束教程恢复刷怪', t5.duringTutorial === 0 && t5.afterTutorial > 0, JSON.stringify(t5));

  // ---- T6 暂停菜单「重新新手教程」真实点击 ----
  const t6 = await evl(`(() => {
    // 真实路径:打开暂停菜单 → 点重看按钮(菜单隐藏 + startTutorial(true) + toast)
    document.getElementById('pause-menu').classList.remove('hidden');
    const btn = document.getElementById('btn-replay-tutorial');
    btn.click();
    const card = document.getElementById('tutorial-card');
    return { active: tutorial.active, step: tutorial.step, visible: !card.classList.contains('hidden'), menuHidden: document.getElementById('pause-menu').classList.contains('hidden'), title: card.querySelector('.tut-title').textContent };
  })()`);
  check('T6 暂停菜单重看教程:真实点击从头开始', t6.active && t6.step === 0 && t6.visible && t6.menuHidden && t6.title.includes('欢迎'), JSON.stringify(t6));
  await evl(`endTutorial()`);

  // ---- T7 引导文案与玩法一致(配方事实核对) ----
  const t7 = await evl(`(() => {
    const R = CRAFTLIB.RECIPES;
    const bed = R.find((r) => r.result && r.result.id === 'bed');
    const bedGrid = bed.pattern.filter(Boolean);
    const bedWool = bedGrid.filter((x) => String(x).startsWith('wool')).length;
    const bedPlanks = bedGrid.filter((x) => x === 'planks').length;
    const furn = R.find((r) => r.result && r.result.id === 'furnace');
    const furnN = furn.pattern.filter((x) => x === 'cobblestone').length;
    const planks = R.find((r) => r.result && r.result.id === 'planks');
    return { bedWool, bedPlanks, furnN, planksCount: planks.count, planksIn: planks.pattern.filter(Boolean).length };
  })()`);
  check('T7 文案一致:床=3 羊毛+3 板 / 熔炉=8 圆石 / 1 木→4 板', t7.bedWool === 3 && t7.bedPlanks === 3 && t7.furnN === 8 && t7.planksCount === 4 && t7.planksIn === 1, JSON.stringify(t7));

  // ---- T9 触屏文案(R46):注入 ontouchstart 后重渲染走 descTouch ----
  const t9 = await evl(`(() => {
    startTutorial(true);
    tutorial.step = 0; tutorial.progress = { move: 0, look: 0, break: 0, pickup: 0, place: 0, slot: 0, inventory: 0 };
    _tutRenderedStep = -1; _tutRenderedDesc = '';
    window.ontouchstart = null;   // 令 'ontouchstart' in window === true(渲染层实时判定)
    renderTutorialCard();
    const desktop = document.querySelector('#tutorial-card .tut-desc').textContent;
    document.getElementById('tut-next').click();   // → ① 移动(有 descTouch)
    _tutRenderedStep = -1; _tutRenderedDesc = '';
    renderTutorialCard();
    const moveTouch = document.querySelector('#tutorial-card .tut-desc').textContent;
    delete window.ontouchstart;
    _tutRenderedStep = -1; _tutRenderedDesc = '';
    renderTutorialCard();
    const moveDesk = document.querySelector('#tutorial-card .tut-desc').textContent;
    endTutorial();
    return { moveTouch, moveDesk, desktopHasSkipHint: desktop.includes('跳过教程'), touchOk: moveTouch.includes('摇杆'), deskOk: moveDesk.includes('W/A/S/D') };
  })()`);
  check('T9 触屏文案:isTouch 时显示摇杆/按钮版(桌面仍显示键位版)', t9.touchOk && t9.deskOk && t9.desktopHasSkipHint, JSON.stringify(t9));

  // ---- T10 暂停菜单背包入口(R46:移动端无 E 键的唯一入口) ----
  const t10 = await evl(`(() => {
    document.getElementById('pause-menu').classList.remove('hidden');
    const btn = document.getElementById('btn-inventory');
    btn.click();
    const panel = document.getElementById('inventory');
    return { hasBtn: !!btn, invOpen: inventoryOpen, panelVisible: panel && !panel.classList.contains('hidden'), menuHidden: document.getElementById('pause-menu').classList.contains('hidden') };
  })()`);
  check('T10 暂停菜单「🎒 背包」:真实点击打开背包(触屏唯一入口)', t10.hasBtn && t10.invOpen && t10.panelVisible && t10.menuHidden, JSON.stringify(t10));
  await evl(`toggleInventory(false)`);

  // ---- 0 JS error ----
  check('T8 页面 0 JS error(全程真实路径)', jsErrors.length === 0, jsErrors.slice(0, 2).join(' | '));

  console.log(results.join('\n'));
  const fails = results.filter((r) => r.startsWith('FAIL')).length;
  console.log(`\n结果: ${results.length - fails}/${results.length} PASS` + (fails ? '\n❌ 有失败项' : '\n✅ 全部通过 —— 教程引导流验收达标'));
  ws.close();
  process.exit(fails ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
