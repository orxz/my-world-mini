// ============================================================
// R50 收官细审(CDP,--remote-debugging-port=9333):
//   A 成就:23 条定义完整/批量解锁 23/23/存档往返
//   B 附魔台:真实放置→面板→真实点击附魔→经验扣减→成就→
//     锋利附魔实战生效(近战伤害 +level)
//   C 矿车:铺轨→放车→乘坐(成就)→沿轨真实位移→下车→
//     静止击打回收(掉落矿车物品)
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
  await send('Page.navigate', { url: 'file://' + process.cwd() + '/index.html?fresh=' + Date.now() });
  await sleep(2500);

  const results = [];
  const check = (name, cond, extra = '') => results.push((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' | ' + extra : ''));

  await evl(`document.getElementById('overlay').click()`);
  await sleep(600);
  await evl(`endTutorial()`);

  // ---- A 成就细审 ----
  const a = await evl(`(() => {
    const ids = MACHINES.ACHIEVEMENTS.map((x) => x.id);
    const unique = new Set(ids).size === ids.length;
    const byIdOk = ids.every((x) => MACHINES.ACHV_BY_ID[x]);
    // 批量真实解锁(unlockAchv 去重路径)
    ids.forEach((x) => unlockAchv(x));
    ids.forEach((x) => unlockAchv(x));   // 重复解锁不重复计
    const btn = document.getElementById('btn-achv').textContent;
    // 存档往返
    const rec = buildSaveRecord();
    const clone = JSON.parse(JSON.stringify(rec));
    achvUnlocked.clear();
    applySave(clone);
    return { n: ids.length, unique, byIdOk, count: achvUnlocked.size, btn, roundTrip: achvUnlocked.size === ids.length };
  })()`);
  check('A1 成就定义完整:23 条唯一 id 全量映射', a.n === 23 && a.unique && a.byIdOk, JSON.stringify(a));
  check('A2 全解锁:unlockAchv 去重,面板 23/23', a.count === 23 && a.btn.includes('23/23'), a.btn);
  check('A3 成就存档往返:23 条完整还原', a.roundTrip);

  // ---- B 附魔台细审 ----
  const b = await evl(`(() => {
    // 真实放置附魔台 + 手持铁剑 + 经验给足
    const px = Math.floor(playerPos.x), py = Math.floor(playerPos.y), pz = Math.floor(playerPos.z);
    setBlock(px + 2, py - 1, pz, 'stone');
    setBlock(px + 2, py, pz, null); setBlock(px + 2, py + 1, pz, null);
    hotbar[0] = { kind: 'tool', id: 'sword_iron', durability: 250 };
    currentSlot = 0; selectSlot(0); buildHotbar();
    xpState.level = 30; updateXPBar();
    openEnchantPanel();
    const panel = document.getElementById('enchant-panel');
    const opts = currentEnchantOptions || [];
    // 真实点击第一个可负担选项
    const btns = panel.querySelectorAll('button[data-ei]');
    let clicked = -1;
    for (let i = 0; i < opts.length; i++) if (xpState.level >= opts[i].cost) { btns[i].click(); clicked = i; break; }
    const enchanted = hotbar[0].ench && Object.keys(hotbar[0].ench).length > 0;
    const achv = achvUnlocked.has('enchant');
    return { panelOpen: panel.style.display !== 'none', opts: opts.length, clicked, levelAfter: xpState.level, enchanted, ench: JSON.stringify(hotbar[0].ench), achv };
  })()`);
  check('B1 附魔台:面板+选项+真实点击附魔(经验扣减+成就)', b.panelOpen && b.opts >= 1 && b.clicked >= 0 && b.levelAfter < 30 && b.enchanted && b.achv, JSON.stringify(b));

  const b2 = await evl(`(() => {
    // 锋利实战:锋利 N 级铁剑近战伤害 = 6 + N(铁剑 damage)
    const ench = hotbar[0].ench || {};
    const sharp = ench.sharpness || 0;
    clearMobs();
    const px = Math.floor(playerPos.x), py = Math.floor(playerPos.y), pz = Math.floor(playerPos.z);
    setBlock(px + 3, py - 1, pz, 'stone'); setBlock(px + 3, py, pz, null); setBlock(px + 3, py + 1, pz, null);
    const pig = spawnMob(px + 3.5, py, pz + 0.5, 'pig');
    const hp0 = pig.hp;
    // 真实攻击路径:瞄准生物 breakBlock(raycastMob 命中 → hurtMob)
    const dx = (px + 3.5) - playerPos.x, dy = (pig.mesh.position.y) - playerPos.y, dz = (pz + 0.5) - playerPos.z;
    yaw = Math.atan2(-dx, -dz); pitch = Math.asin(dy / Math.hypot(dx, dy, dz));
    velocity.set(0, 0, 0);
    breakBlock();
    const dealt = hp0 - pig.hp;
    clearMobs();
    closeEnchantPanel();
    hotbar[0] = null; buildHotbar(); updateHoldItem();
    return { sharp, dealt, expect: 6 + sharp, ok: dealt === 6 + sharp };
  })()`);
  check('B2 锋利附魔实战生效:近战伤害 6+锋利级', b2.ok, JSON.stringify(b2));

  // ---- C 矿车细审 ----
  const c = await evl(`(() => {
    clearMinecarts();
    droppedItems.length = 0;
    const px = Math.floor(playerPos.x), py = Math.floor(playerPos.y), pz = Math.floor(playerPos.z);
    // 铺 6 格铁轨(真实 setBlock)+ 立足面
    for (let i = 0; i < 6; i++) {
      setBlock(px + 4 + i, py - 1, pz, 'stone');
      setBlock(px + 4 + i, py, pz, 'rail');
    }
    // 放车 + 真实乘坐
    const cart = spawnMinecart(px + 4, py, pz);
    playerPos.set(px + 4.5, py + 0.5, pz + 0.5); velocity.set(0, 0, 0);
    const dx = cart.x - playerPos.x, dy = (cart.y + 0.25) - playerPos.y, dz = cart.z - playerPos.z;
    yaw = Math.atan2(-dx, -dz); pitch = Math.asin(dy / Math.hypot(dx, dy, dz));
    const seen = raycastCart(4);
    if (seen) mountCart(seen);
    const riding = ridingCart === cart;
    const achv = achvUnlocked.has('ride_cart');
    // 矿车沿轨位移(updateMinecarts 真实推进;animate 循环里与 updateMobs 并列)
    const x0 = cart.x;
    for (let i = 0; i < 120; i++) { updateMobs(0.016); updateMinecarts(0.016); }   // ~2s
    const moved = cart.x - x0;
    // 真实下车
    dismountCart();
    const dismounted = ridingCart === null;
    // 静止回收(punchCart:speed<0.3 → 掉落矿车)
    cart.speed = 0;
    punchCart(cart);
    const removed = minecarts.length === 0;
    // 掉落物走拾(真实磁吸)
    for (let guard = 0; guard < 40 && droppedItems.length; guard++) {
      const d = droppedItems[0];
      playerPos.set(d.position.x, d.position.y + 0.7, d.position.z); velocity.set(0, 0, 0);
      for (let i = 0; i < 20 && droppedItems.includes(d); i++) updateDroppedItems(0.05);
    }
    const picked = INVLIB.countInHotbar(hotbar, 'minecart');
    // 清理铁轨
    for (let i = 0; i < 6; i++) { setBlock(px + 4 + i, py, pz, null); }
    return { riding, achv, moved: Math.round(moved * 10) / 10, dismounted, removed, picked };
  })()`);
  check('C1 矿车:射线看见+真实乘坐(成就 ride_cart)', c.riding && c.achv, JSON.stringify(c));
  check('C2 矿车沿轨道真实位移(≥1 格)', c.moved >= 1, 'moved=' + c.moved);
  check('C3 真实下车 + 静止击打回收(掉落物可拾取)', c.dismounted && c.removed && c.picked >= 1, JSON.stringify(c));

  // ---- 0 JS error ----
  check('D 页面 0 JS error(全程真实路径)', jsErrors.length === 0, jsErrors.slice(0, 2).join(' | '));

  console.log(results.join('\n'));
  const fails = results.filter((r) => r.startsWith('FAIL')).length;
  console.log(`\n结果: ${results.length - fails}/${results.length} PASS` + (fails ? '\n❌ 有失败项' : '\n✅ 全部通过 —— 收官细审达标'));
  ws.close();
  process.exit(fails ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
