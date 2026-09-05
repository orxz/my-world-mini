// ============================================================
// R48 移动端全流程复验(CDP,375×667 触屏仿真):
// Page.addScriptToEvaluateOnNewDocument 注入 ontouchstart 使 isTouch
// 在绑定期生效 → 真实 TouchEvent 驱动摇杆/拖视角/挖放按钮
//   M1 触屏开局层:touch-controls/touch-pause 可见 + __touchMove 定义
//      + 教程自动开且文案触屏版(摇杆)
//   M2 摇杆移动:真实 touchstart/touchmove 推满 → updatePlayer →
//      玩家真实位移 + 教程移动步推进
//   M3 拖动视角:画布右半区真实拖动 → yaw 变化 + 教程环顾步推进
//   M4 挖掘按钮:#touch-break 真实 touchstart 连按 → 方块破坏 +
//      教程挖掘步推进;touchend 后 touchBreakHeld 复位(防连挖卡死)
//   M5 放置按钮:hotbar 格真实 click 选中 → #touch-place touchstart
//      → 方块实际放置
//   M6 ≡ → 暂停菜单 → 🎒 背包打开
//   M7 移动端合成:目录发放 wood → 合成格循环点击到 wood →
//      合成按钮 → 木板入栏(全程真实 UI click,无右键依赖)
//   M8 保存与继续:暂停菜单 💾 → IndexedDB 有档 → 重载 → loadSlot
//      → 快捷栏还原
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
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, timeout: 120000 });
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

  // 触屏环境:375×667 + 导航前注入 ontouchstart(isTouch 在绑定期判定)
  await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 667, deviceScaleFactor: 2, mobile: true });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: "try { localStorage.removeItem('myword_tutorial_done'); } catch (e) {}; window.ontouchstart = null;" });
  await send('Page.navigate', { url: 'file://' + process.cwd() + '/index.html?fresh=' + Date.now() });
  await sleep(3000);

  // 页内触屏事件工具(真实 TouchEvent)
  await evl(`window.__tap = (el, type, x, y) => {
    const t = new Touch({ identifier: 1, target: el, clientX: x, clientY: y });
    el.dispatchEvent(new TouchEvent(type, { touches: type === 'touchend' ? [] : [t], changedTouches: [t], bubbles: true, cancelable: true }));
  }`);

  // ---- 0. 开局 ----
  await evl(`document.getElementById('overlay').click()`);
  await sleep(800);

  // ---- M1 触屏开局层 ----
  const m1 = await evl(`(() => {
    const tc = document.getElementById('touch-controls');
    const tp = document.getElementById('touch-pause');
    const card = document.getElementById('tutorial-card');
    return {
      layer: tc && tc.style.display !== 'none' && getComputedStyle(tc).display !== 'none',
      pause: tp && getComputedStyle(tp).display !== 'none',
      joy: typeof window.__touchMove === 'function',
      tut: tutorial.active, step: tutorial.step,
      descTouch: card && card.querySelector('.tut-desc') && card.querySelector('.tut-desc').textContent,
      vp: window.innerWidth + 'x' + window.innerHeight
    };
  })()`);
  check('M1 触屏开局层:控件可见 + 摇杆 API + 教程自动开且文案触屏版', m1.layer && m1.pause && m1.joy && m1.tut && m1.descTouch && m1.descTouch.includes('跳过教程'), JSON.stringify(m1));
  await evl(`document.getElementById('tut-next').click()`);   // welcome → ① 移动

  // ---- M2 摇杆移动(真实 TouchEvent)----
  const m2 = await evl(`(() => {
    // 清前向走廊(R45 坑:悬垂树冠卡碰撞)
    const py = Math.floor(playerPos.y);
    for (let dz = 0; dz >= -16; dz--) for (let dy = -1; dy <= 3; dy++) setBlock(0, py + dy, dz, dy === -1 ? 'planks' : null);
    const joy = document.getElementById('joystick');
    const r = joy.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const z0 = playerPos.z;
    // 真实按下 + 推满(上 = 前进)
    __tap(joy, 'touchstart', cx, cy);
    __tap(joy, 'touchmove', cx, cy - 40);
    let guard = 0;
    while (tutorial.step === 1 && guard++ < 200) updatePlayer(0.1);
    __tap(joy, 'touchend', cx, cy - 40);
    const moved = z0 - playerPos.z;   // 前进 = -z
    const tm = window.__touchMove();
    return { step: tutorial.step, moved: Math.round(moved * 10) / 10, afterReleaseX: tm.x, afterReleaseZ: tm.z };
  })()`);
  check('M2 摇杆真实驱动移动(≥6 格)+ 教程移动步推进 + 松手归零', m2.step > 1 && m2.moved >= 6 && m2.afterReleaseX === 0 && m2.afterReleaseZ === 0, JSON.stringify(m2));

  // ---- M3 拖动视角(真实 TouchEvent,右半区)----
  const m3 = await evl(`(() => {
    const canvas = renderer.domElement;
    const yaw0 = yaw;
    let guard = 0;
    // 按住右半区向左拖(累计 2.5rad+)
    __tap(canvas, 'touchstart', 300, 300);
    let x = 300;
    while (tutorial.step === 2 && guard++ < 40) { x -= 20; __tap(canvas, 'touchmove', x, 300); }
    __tap(canvas, 'touchend', x, 300);
    return { step: tutorial.step, yawDelta: Math.abs(yaw - yaw0).toFixed(2), look: (tutorial.progress.look || 0).toFixed(2) };
  })()`);
  check('M3 拖动视角:yaw 实际变化 + 教程环顾步推进', m3.step > 2 && parseFloat(m3.yawDelta) > 0.3, JSON.stringify(m3));

  // ---- M4 挖掘按钮(真实 touchstart 连按)----
  const m4 = await evl(`(() => {
    clearMobs();
    const px = Math.floor(playerPos.x), py = Math.floor(playerPos.y), pz = Math.floor(playerPos.z);
    // 站位与目标:脚下前方走廊地面木板
    playerPos.set(0.5, py + 0.9, pz - 1.5); velocity.set(0, 0, 0);
    const aim = (tx, ty, tz) => { const dx = (tx + 0.5) - playerPos.x, dy = (ty + 0.5) - playerPos.y, dz = (tz + 0.5) - playerPos.z; yaw = Math.atan2(-dx, -dz); pitch = Math.asin(dy / Math.hypot(dx, dy, dz)); };
    const btn = document.getElementById('touch-break');
    let broken = 0;
    const targets = [[0, py - 1, pz - 3], [0, py - 1, pz - 4], [0, py - 1, pz - 5]];
    for (const [tx, ty, tz] of targets) {
      aim(tx, ty, tz);
      let g = 0;
      while (getBlock(tx, ty, tz) && g++ < 15) { __tap(btn, 'touchstart', 60, 600); __tap(btn, 'touchend', 60, 600); }
      if (!getBlock(tx, ty, tz)) broken++;
    }
    return { step: tutorial.step, broken };
  })()`);
  check('M4 挖掘按钮:touchstart 连按真实破坏 3 块 + 教程挖掘步推进', m4.step > 3 && m4.broken === 3, JSON.stringify(m4));

  // ---- M5 放置按钮(hotbar 真实 click 选中 + touch-place)----
  const m5 = await evl(`(() => {
    // 教程 ④ 拾取步:先磁吸捡起掉落
    for (let guard = 0; guard < 60 && tutorial.step === 4; guard++) {
      const snap = droppedItems.slice();
      if (!snap.length) break;
      const d = snap[0];
      playerPos.set(d.position.x, d.position.y + 0.7, d.position.z); velocity.set(0, 0, 0);
      for (let i = 0; i < 20 && droppedItems.includes(d); i++) updateDroppedItems(0.05);
    }
    const afterPickup = tutorial.step;
    // 点选快捷栏第一格(真实 click,触屏合成同路径)
    const slotEl = document.querySelector('#hotbar .slot');
    slotEl.click();
    const selected = hotbar[currentSlot];
    // 显式站位放置(journey 模式)
    const py = Math.floor(playerPos.y);
    const put = (tx, tz) => {
      // 清目标列+站位列+缓冲(站位格若有地形方块,射线第一击就打在脚下草上)
      for (let dz2 = 0; dz2 <= 2; dz2++) {
        const gb = getBlock(tx, py - 1, tz + dz2);
        if (!BLOCK_TYPES[gb] || !BLOCK_TYPES[gb].solid) setBlock(tx, py - 1, tz + dz2, 'planks');
        setBlock(tx, py, tz + dz2, null); setBlock(tx, py + 1, tz + dz2, null); setBlock(tx, py + 2, tz + dz2, null);
      }
      playerPos.set(tx + 0.5, py + 0.9, tz + 1.5); velocity.set(0, 0, 0);
      const dx = (tx + 0.5) - playerPos.x, dy = (py + 0.05) - playerPos.y, dz = (tz + 0.5) - playerPos.z;
      yaw = Math.atan2(-dx, -dz); pitch = Math.asin(dy / Math.hypot(dx, dy, dz));
      const btn = document.getElementById('touch-place');
      let g = 0;
      while (!getBlock(tx, py, tz) && g++ < 5) __tap(btn, 'touchstart', 30, 600);
    };
    const pz = Math.floor(playerPos.z);
    // 两目标拉开距离(pz-2 与 pz-5):第二发的射线不能穿过第一发刚放的
    // 方块(共线近距会被自挡拦截)
    put(0, pz - 2); put(0, pz - 5);
    return { afterPickup, selected: selected && selected.id, placed1: !!getBlock(0, py, pz - 2), placed2: !!getBlock(0, py, pz - 5), step: tutorial.step };
  })()`);
  check('M5 hotbar 真实 click 选中 + 放置按钮实际放置 2 块 + 步骤推进', m5.afterPickup === 5 && m5.selected && m5.placed1 && m5.placed2 && m5.step === 6, JSON.stringify(m5));

  // ---- M6 ≡ 菜单 → 背包 ----
  const m6 = await evl(`(() => {
    const pb = document.getElementById('touch-pause');
    __tap(pb, 'touchstart', 340, 30);
    const menuVisible = !document.getElementById('pause-menu').classList.contains('hidden');
    document.getElementById('btn-inventory').click();
    const invOpen = inventoryOpen && !document.getElementById('inventory').classList.contains('hidden');
    return { menuVisible, invOpen };
  })()`);
  check('M6 ≡ 触屏开暂停菜单 → 🎒 背包打开', m6.menuVisible && m6.invOpen, JSON.stringify(m6));

  // ---- M7 移动端合成(真实 UI click,无右键)----
  const m7 = await evl(`(() => {
    // 目录发放 wood 到当前格(真实点击目录里的木头格)
    const cells = Array.from(document.querySelectorAll('#inventory .inv-grid .inv-cell'));
    const woodCell = cells.find((c) => c.textContent.includes('木头') || (c.querySelector('.inv-label') || {}).textContent === '木头');
    let granted = false;
    if (woodCell) { woodCell.click(); granted = !!(hotbar[currentSlot] && hotbar[currentSlot].id === 'wood'); }
    // 合成格点击循环到 wood(HOTBAR_ORDER 第 4 位,从空起 4 次点击)
    const gridCell = document.querySelector('#craft-grid .inv-cell');
    let clicks = 0;
    while ((!craftGrid[0] || craftGrid[0].id !== 'wood') && clicks++ < 10) gridCell.click();
    const woodInGrid = !!(craftGrid[0] && craftGrid[0].id === 'wood');
    document.getElementById('craft-btn').click();
    const planks = INVLIB.countInHotbar(hotbar, 'planks');
    return { granted, woodInGrid, clicks, planks };
  })()`);
  check('M7 移动端合成:目录发放木头 → 合成格点击到木头 → 合成出木板', m7.granted && m7.woodInGrid && m7.planks >= 1, JSON.stringify(m7));

  // ---- M8 保存与继续(真实按钮 + IndexedDB + 重载还原)----
  const m8a = await evl(`(async () => {
    toggleInventory(false);
    document.getElementById('pause-menu').classList.remove('hidden');
    document.getElementById('btn-save').click();
    await new Promise((r) => setTimeout(r, 500));
    const saves = await listSaves();
    return { n: saves.length, id: saves.length ? saves[0].id : null };
  })()`);
  await send('Page.navigate', { url: 'file://' + process.cwd() + '/index.html?fresh=' + Date.now() });
  await sleep(3000);
  await evl(`document.getElementById('overlay').click()`);
  await sleep(800);
  const m8b = await evl(`(async () => {
    const ok = await loadSlot(${JSON.stringify(m8a.id)});
    const planks = INVLIB.countInHotbar(hotbar, 'planks');
    return { ok, planks, touch: typeof window.__touchMove === 'function' };
  })()`);
  check('M8 💾 保存 → 重载 → 继续游戏还原(木板在栏 + 触屏层仍激活)', m8a.n >= 1 && m8b.ok && m8b.planks >= 1 && m8b.touch, JSON.stringify({ a: m8a, b: m8b }));
  // 清理验收存档
  await evl(`(async () => { await deleteSave(${JSON.stringify(m8a.id)}); currentSaveId = null; await new Promise((r) => setTimeout(r, 300)); })()`);

  // ---- 0 JS error ----
  check('M9 页面 0 JS error(全程触屏真实路径)', jsErrors.length === 0, jsErrors.slice(0, 2).join(' | '));

  console.log(results.join('\n'));
  const fails = results.filter((r) => r.startsWith('FAIL')).length;
  console.log(`\n结果: ${results.length - fails}/${results.length} PASS` + (fails ? '\n❌ 有失败项' : '\n✅ 全部通过 —— 移动端全流程验收达标'));
  ws.close();
  process.exit(fails ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
