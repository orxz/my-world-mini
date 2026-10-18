/* eslint-env node */
/* global fetch, WebSocket */
// ============================================================
// R56 儿童游乐场验收(CDP,--remote-debugging-port=9333)
// 覆盖:环场轨道闭环/车站矿车/村民铁傀儡雕像/旋转木马/摩天轮/秋千/
//       水滑梯/沙坑/蹦床/气球拱门/矿车真实环线/重置重建/0 报错
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
    } catch { /* chrome not up */ }
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
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, timeout: 60000 });
    if (r.result.exceptionDetails) {
      throw new Error('EVAL ERROR: ' + ((r.result.exceptionDetails.exception && r.result.exceptionDetails.exception.description) || r.result.exceptionDetails.text));
    }
    return r.result.result.value;
  };
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.navigate', { url: 'file://' + process.cwd() + '/index.html?fresh=' + Date.now() });
  await sleep(3000);

  const results = [];
  const check = (name, cond, extra = '') => results.push((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' | ' + extra : ''));

  await evl(`document.getElementById('overlay').click()`);
  await sleep(600);
  await evl(`endTutorial()`);

  // 1. 环场轨道闭环 + 车站
  const track = await evl(`(() => {
    let rails = 0;
    for (let x = -20; x <= 20; x++) for (const z of [-20, 20]) if (getBlock(x, 23, z) === 'rail') rails++;
    for (let z = -19; z <= 19; z++) for (const x of [-20, 20]) if (getBlock(x, 23, z) === 'rail') rails++;
    return { rails, corner: getBlock(20, 23, -20), station: getBlock(0, 22, 20),
             cart: minecarts.filter(c => c.cx === 0 && c.cz === 20 && c.y === 23).length };
  })()`);
  check('环场轨道闭环 ≥150 格 + 车站 + 1 辆矿车', track.rails >= 150 && track.corner === 'rail' && track.station === 'planks' && track.cart === 1, JSON.stringify(track));

  // 2. 村民 + 铁傀儡雕像
  const statue = await evl(`({
    golem: getBlock(14, 23, 12) === 'iron_block' && getBlock(12, 23, 12) === 'iron_block',
    face: getBlock(14, 25, 11) === 'wool_black' && getBlock(14, 25, 12) === 'wool_yellow',
    villager: getBlock(17, 23, 12) === 'brick' && getBlock(17, 25, 12) === 'sand',
    base: getBlock(13, 20, 10) === 'stone' && getBlock(17, 20, 14) === 'stone'
  })`);
  check('村民 + 铁傀儡雕像(铁块/黄头黑脸/村民长袍/石基)', Object.values(statue).every(Boolean), JSON.stringify(statue));

  // 3. 动态设施存在且会转
  const rides = await evl(`(() => {
    const r = playgroundRides;
    if (!r) return { exists: false };
    const a0 = r.carousel.rotation.y, b0 = r.ferris.rotation.z, c0 = r.swing.rotation.x;
    updatePlaygroundRides(1.0, 1000);
    return { exists: true, carousel: r.carousel.rotation.y !== a0, ferris: r.ferris.rotation.z !== b0,
             swing: r.swing.rotation.x !== c0, children: r.carousel.children.length + r.ferris.children.length,
             scale: [r.carousel.scale.x, r.ferris.scale.x, r.swing.scale.x] };
  })()`);
  check('旋转木马/摩天轮/秋千存在且动画更新', rides.exists && rides.carousel && rides.ferris && rides.swing && rides.children > 20 && rides.scale.every(v => v >= 1.2), JSON.stringify(rides));

  // 3b. 三种设施真实乘坐/移动/下车
  const mounts = await evl(`(() => {
    const out = [];
    for (const [x, z, want] of [[13, 7, '旋转木马'], [14.5, -6, '摩天轮'], [-13, 7, '秋千']]) {
      playerPos.set(x, 21.9, z); velocity.set(0, 0, 0);
      const ok = tryMountNearbyRide();
      const label = ridingRide && ridingRide.label;
      updatePlaygroundRides(1.2, 2000);
      updateRidePlayer();
      const moved = Math.abs(playerPos.x - x) + Math.abs(playerPos.z - z);
      dismountRide();
      out.push({ ok, label, want, moved, after: !!ridingRide });
    }
    return out;
  })()`);
  check('旋转木马/摩天轮/秋千可乘坐并移动/下车', mounts.length === 3 && mounts.every(m => m.ok && m.label === m.want && m.moved > 0.05 && !m.after), JSON.stringify(mounts));

  // 4. 水滑梯 / 沙坑 / 蹦床 / 气球拱门
  const facilities = await evl(`({
    slide: getBlock(-8, 23, 14) === 'water' && getBlock(-8, 20, 10) === 'water',
    sandbox: getBlock(-14, 20, 13) === 'sand' && getBlock(-16, 21, 11) === 'fence',
    slime: getBlock(8, 20, 15) === 'slime',
    arch: getBlock(-4, 25, 30) === 'wool_white' && getBlock(0, 25, 30) === 'wool_red'
  })`);
  check('水滑梯/沙坑/蹦床/气球拱门落地', Object.values(facilities).every(Boolean), JSON.stringify(facilities));

  // 5. 矿车真实环线:南侧→东侧→北侧→西侧
  const ride = await evl(`(() => {
    const c = minecarts.find(c2 => c2.cx === 0 && c2.cz === 20);
    mountCart(c);
    let minX = 0, maxX = 0, minZ = 20, maxZ = 20, moves = 0, lastX = c.cx, lastZ = c.cz;
    for (let i = 0; i < 900; i++) {
      updateMinecarts(0.05);
      minX = Math.min(minX, c.cx); maxX = Math.max(maxX, c.cx);
      minZ = Math.min(minZ, c.cz); maxZ = Math.max(maxZ, c.cz);
      if (c.cx !== lastX || c.cz !== lastZ) moves++;
      lastX = c.cx; lastZ = c.cz;
    }
    const onRail = isRailAt(c.cx, Math.round(c.y), c.cz);
    dismountCart();
    return { minX, maxX, minZ, maxZ, moves, onRail, riding: !!ridingCart };
  })()`);
  check('矿车真实环线(四边都跑到,全程不出轨)', ride.minX <= -18 && ride.maxX >= 18 && ride.minZ <= -18 && ride.maxZ >= 18 && ride.moves > 100 && ride.onRail && !ride.riding, JSON.stringify(ride));

  // 6. 重置世界后游乐场重建且只有 1 辆矿车
  const rebuilt = await evl(`(() => {
    resetWorld();
    const rails = getBlock(0, 23, 20) === 'rail' && getBlock(20, 23, 0) === 'rail';
    const cart = minecarts.filter(c => c.cx === 0 && c.cz === 20 && c.y === 23).length;
    return { rails, cart, props: !!playgroundRides, totalCarts: minecarts.length };
  })()`);
  check('重置后游乐场/轨道重建,矿车不重复', rebuilt.rails && rebuilt.cart === 1 && rebuilt.props && rebuilt.totalCarts === 1, JSON.stringify(rebuilt));

  await sleep(600);
  check('页面 0 JS error(全程真实路径)', jsErrors.length === 0, jsErrors.slice(0, 3).join(' || '));

  console.log('\n===== R56 儿童游乐场验收 =====');
  for (const r of results) console.log(r);
  const fails = results.filter(r => r.startsWith('FAIL'));
  console.log(`\n结果: ${results.length - fails.length}/${results.length} PASS`);
  if (fails.length) { console.log('❌ 有失败项'); process.exit(1); }
  console.log('✅ 全部通过 —— 出生地游乐场可玩');
  ws.close();
  process.exit(0);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
