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

  // 4c. 出生点冒险入口:结构/净空/真实右键传送/回城/统计与重复进入
  const portals = await evl(`(() => ({
    gates: DUNGEON_PORTALS.every(p => getBlock(p.x, 21, p.z) === p.block
      && getBlock(p.x - 1, 22, p.z) === 'obsidian' && getBlock(p.x, 24, p.z) === p.accent),
    spawnClear: !getBlock(0, 21, 0) && !getBlock(0, 22, 0) && !getBlock(0, 23, 0),
    hints: DUNGEON_PORTALS.every(p => (interactHintFor(null, p.block) || {}).text.includes(p.label))
      && interactHintFor(null, 'portal_home').text.includes('出生广场')
  }))()`);
  check('三档传送门结构/出生点净空/交互提示', portals.gates && portals.spawnClear && portals.hints, JSON.stringify(portals));

  const travel = await evl(`(() => {
    const out = [];
    hotbar[currentSlot] = null; cameraMode = 0;
    const aim = (tx, ty, tz) => {
      const dx = tx - playerPos.x, dy = ty - playerPos.y, dz = tz - playerPos.z;
      yaw = Math.atan2(-dx, -dz); pitch = Math.atan2(dy, Math.hypot(dx, dz));
    };
    const homeCount = (dg) => {
      let n = 0;
      const half = dg.size >> 1;
      for (let x = dg.cx - half; x < dg.cx - half + dg.size; x++)
        for (let z = dg.cz - half; z < dg.cz - half + dg.size; z++)
          if (getBlock(x, dg.floor + 1, z) === 'portal_home') n++;
      return n;
    };
    for (const p of DUNGEON_PORTALS) {
      const dg = findNearestDungeon(p.tier, worldSeed, SPAWN_X, SPAWN_Z);
      const distance0 = stats.distance;
      playerPos.set(p.x + 0.5, PLAZA_HEIGHT + 1 + PLAYER_HEIGHT * 0.5, p.z + 3.5);
      velocity.set(0, 0, 0);
      aim(p.x + 0.5, PLAZA_HEIGHT + 1.5, p.z + 0.5);
      const hit = raycastTarget();
      const hitType = hit && getBlock(hit.x, hit.y, hit.z);
      placeBlock();
      const px = Math.floor(playerPos.x), pz = Math.floor(playerPos.z), half = dg.size >> 1;
      const inside = px >= dg.cx - half && px < dg.cx - half + dg.size && pz >= dg.cz - half && pz < dg.cz - half + dg.size;
      const clear = !getBlock(px, dg.floor + 1, pz) && !getBlock(px, dg.floor + 2, pz);
      const loaded = chunks.has(chunkKey(Math.floor(px / CHUNK_SIZE), Math.floor(pz / CHUNK_SIZE)));
      const homes1 = homeCount(dg);
      let saveRestored = true;
      if (p.tier === 'shallow') {
        const rec = buildSaveRecord();
        applySave(rec);
        saveRestored = homeCount(dg) === 1;
      }
      let home = null;
      for (let x = dg.cx - half; x < dg.cx - half + dg.size; x++)
        for (let z = dg.cz - half; z < dg.cz - half + dg.size; z++)
          if (getBlock(x, dg.floor + 1, z) === 'portal_home') home = { x, z };
      const statsClean = stats.distance === distance0 && stats._lx === undefined && stats._lz === undefined;
      if (home) { aim(home.x + 0.5, dg.floor + 1.5, home.z + 0.5); placeBlock(); }
      const returned = Math.abs(playerPos.x - SPAWN_X) < 0.01 && Math.abs(playerPos.z - SPAWN_Z) < 0.01;
      let repeatSafe = true;
      if (p.tier === 'shallow') {
        teleportToDungeon('shallow');
        repeatSafe = homes1 === 1 && homeCount(dg) === 1;
        teleportToSpawn();
      }
      out.push({ tier: p.tier, hit: hitType === p.block, inside, clear, loaded, home: !!home,
        returned, statsClean, repeatSafe, saveRestored, homes1, distance0, distance1: stats.distance,
        pos: [playerPos.x, playerPos.y, playerPos.z], expected: [dg.cx, dg.floor, dg.cz],
        toast: document.getElementById('toast').textContent });
    }
    yaw = 0; pitch = 0; velocity.set(0, 0, 0);
    return out;
  })()`);
  check('真实右键进入三档地牢并回城(安全落点/区块加载/统计不突增/回城石存档且不重复)',
    travel.length === 3 && travel.every(t => t.hit && t.inside && t.clear && t.loaded && t.home && t.returned && t.statsClean && t.repeatSafe && t.saveRestored && t.distance0 === t.distance1), JSON.stringify(travel));

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
    const portals = DUNGEON_PORTALS.every(p => getBlock(p.x, 21, p.z) === p.block);
    return { rails, cart, props: !!playgroundRides, totalCarts: minecarts.length, portals };
  })()`);
  check('重置后游乐场/轨道/传送门重建,矿车不重复', rebuilt.rails && rebuilt.cart === 1 && rebuilt.props && rebuilt.totalCarts === 1 && rebuilt.portals, JSON.stringify(rebuilt));

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
