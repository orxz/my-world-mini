// ============================================================
// R49 性能长测复验(CDP,--remote-debugging-port=9333):
//   P1 区块生成微基准(R43 基准 0.26ms/块,阈值 ≤2ms/块)
//   P2 红石 BFS 微基准(R43 3.1ms/100 次,阈值 ≤15ms)
//   P3 存档序列化微基准(R43 52.8ms/20 次,阈值 ≤200ms)
//   P4 updateMobs 微基准(R43 0.028ms/帧,阈值 ≤0.2ms/帧)
//   P5 长稳态长测:5000 帧主循环分 5 段(含随机 setBlock×500、
//      红石翻转、周期存读档),段间耗时衰减 <60%(无恶化趋势)
//   P6 内存泄漏复查:长测前后 renderer.info(纹理==5、几何漂移小)、
//      mobs/chunks/droppedItems/doors 受控不无界增长
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
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, timeout: 300000 });
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

  // ---- P1 区块生成微基准 ----
  const p1 = await evl(`(() => {
    const t0 = performance.now();
    const cx0 = Math.floor(playerPos.x / CHUNK_SIZE), cz0 = Math.floor(playerPos.z / CHUNK_SIZE);
    let made = 0;
    for (let dx = 6; dx < 9; dx++) for (let dz = 6; dz < 9; dz++) {
      const k = chunkKey(cx0 + dx, cz0 + dz);
      if (!chunks.has(k)) { ensureChunk(cx0 + dx, cz0 + dz); made++; }
    }
    const dt = performance.now() - t0;
    return { made, ms: Math.round(dt * 10) / 10, per: made ? Math.round(dt / made * 1000) / 1000 : 0 };
  })()`);
  check('P1 区块生成微基准 ≤2ms/块(R43 基准 0.26)', p1.made >= 5 && p1.per <= 2, JSON.stringify(p1));

  // ---- P2 红石 BFS 微基准 ----
  const p2 = await evl(`(() => {
    // 广场旁平地铺 40 格线 + 8 个火把源(与 R43 基准同构)
    const px = Math.floor(playerPos.x), py = Math.floor(playerPos.y), pz = Math.floor(playerPos.z);
    for (let i = 0; i < 40; i++) {
      setBlock(px + 20 + i, py - 1, pz, 'stone');
      setBlock(px + 20 + i, py, pz, 'redstone');
    }
    for (let i = 0; i < 8; i++) {
      setBlock(px + 20 + i * 5, py, pz, 'redstone_torch');
      registerRedstone(px + 20 + i * 5, py, pz, 'redstone_torch');
    }
    const t0 = performance.now();
    for (let i = 0; i < 100; i++) updateRedstone();
    const dt = performance.now() - t0;
    // 清理
    for (let i = 0; i < 40; i++) { setBlock(px + 20 + i, py - 1, pz, null); setBlock(px + 20 + i, py, pz, null); }
    return { ms: Math.round(dt * 10) / 10 };
  })()`);
  check('P2 红石 BFS ×100 ≤15ms(R43 基准 3.1)', p2.ms <= 15, JSON.stringify(p2));

  // ---- P3 存档序列化微基准 ----
  const p3 = await evl(`(() => {
    const t0 = performance.now();
    let n = 0;
    for (let i = 0; i < 20; i++) { buildSaveRecord(); n++; }
    const dt = performance.now() - t0;
    return { n, ms: Math.round(dt * 10) / 10 };
  })()`);
  check('P3 存档序列化 ×20 ≤200ms(R43 基准 52.8)', p3.ms <= 200, JSON.stringify(p3));

  // ---- P4 updateMobs 微基准(被动生物——敌对白天会燃烧减员)----
  const p4 = await evl(`(() => {
    clearMobs();
    const px = Math.floor(playerPos.x), py = Math.floor(playerPos.y), pz = Math.floor(playerPos.z);
    const types = ['pig', 'cow', 'sheep', 'chicken', 'villager'];
    for (let i = 0; i < 15; i++) spawnMob(px + 3 + (i % 5) * 2, py, pz + 2 + ((i / 5) | 0) * 2, types[i % types.length]);
    const t0 = performance.now();
    for (let i = 0; i < 1000; i++) updateMobs(0.016);
    const dt = performance.now() - t0;
    const per = Math.round(dt / 1000 * 1000) / 1000;
    return { mobs: mobs.length, per };
  })()`);
  check('P4 updateMobs 15 生物 ×1000 帧 ≤0.2ms/帧(R43 基准 0.028)', p4.mobs >= 15 && p4.per <= 0.2, JSON.stringify(p4));   // ≥15:自然刷怪器可加 1 只

  // ---- P5+P6 长稳态长测 + 内存复查 ----
  const p56 = await evl(`(async () => {
    clearMobs();
    droppedItems.length = 0;
    const before = {
      tex: renderer.info.memory.textures, geo: renderer.info.memory.geometries,
      chunks: chunks.size, mobs: mobs.length, doors: doors.size, sceneChildren: scene.children.length
    };
    velocity.set(0, 0, 0);
    const segs = [];
    let blockWrites = 0;
    const px = Math.floor(playerPos.x), py = Math.floor(playerPos.y), pz = Math.floor(playerPos.z);
    // 长测舞台:旁侧一片可控修改区
    for (let s = 0; s < 5; s++) {
      const t0 = performance.now();
      for (let f = 0; f < 1000; f++) {
        updatePlayer(0.016);
        updateMobs(0.016);
        updateDayNight(0.016);
        // 每 20 帧一次随机方块翻转(500 段内共 ~250 次,含 set+remesh)
        if (f % 20 === 0) {
          const wx = px + 10 + (f % 17), wy = py + (f % 5) - 1, wz = pz + ((f / 20) | 0) % 7;
          if (getBlock(wx, wy, wz)) { setBlock(wx, wy, wz, null); blockWrites++; }
        }
        // 每 200 帧生成一只生物(总 25 只,含被动+敌对混合负载)
        if (f % 200 === 0) spawnMob(px + 6, py, pz + 3, ['pig', 'sheep', 'zombie', 'skeleton', 'creeper'][(f / 200) % 5]);
        // 每 500 帧掉落一个物品(拾取测试清理路径)
        if (f % 500 === 0) spawnDroppedItem(px - 0.5, py, pz - 0.5, 'planks', 1, 'block');
      }
      segs.push(Math.round(performance.now() - t0));
      // 每段存读档一次(真实序列化负载)
      const rec = buildSaveRecord();
      applySave(rec);
      await new Promise((r) => setTimeout(r, 30));
    }
    const after = {
      tex: renderer.info.memory.textures, geo: renderer.info.memory.geometries,
      chunks: chunks.size, mobs: mobs.length, doors: doors.size,
      drops: droppedItems.length, mods: modifications.size
    };
    // 泄漏复查:清场前后场景节点差 = 被移除实体数(生物 mesh/掉落物都挂
    // scene 上,clearMobs 若正确 remove 差值应 ≥ 生物数)
    const childrenBeforeCleanup = scene.children.length;
    clearMobs();
    droppedItems.length = 0;
    const geoAfterCleanup = renderer.info.memory.geometries;
    const childrenAfterCleanup = scene.children.length;
    // 段间恶化:绝对上限为主(末段均值 ≤0.1ms/帧,swiftshader 软渲下依然
    // 极宽裕),相对趋势 ≤2× 防「慢漂」(段内有 mods/掉落物累积的缓升属正常)
    const first = segs[0], lastAvg = (segs[3] + segs[4]) / 2;
    return { segs: segs.join(','), blockWrites, degradePct: Math.round((lastAvg / first - 1) * 100),
      lastPerFrame: Math.round(lastAvg / 1000 * 1000) / 1000,
      before, after, geoAfterCleanup, childrenBeforeCleanup, childrenAfterCleanup,
      texStable: after.tex === before.tex, geoDrift: geoAfterCleanup - before.geo,
      perfOk: lastAvg / 1000 <= 0.1 && lastAvg <= first * 2,
      sceneClean: childrenBeforeCleanup - childrenAfterCleanup >= after.mobs,   // 实体节点随清理移除
      geoNoGrowth: geoAfterCleanup <= before.geo + 10,   // 负漂移=applySave 后区块变少,正常
      mobsBounded: after.mobs <= 25 + 8 };
  })()`);
  const segsArr = p56.segs.split(',').map(Number);
  check('P5 长稳态 5000 帧:末段 ≤0.1ms/帧 且相对首段 ≤2×(无慢漂恶化)', segsArr.length === 5 && p56.perfOk, 'segs=' + p56.segs + ' lastPerFrame=' + p56.lastPerFrame + 'ms degrade=' + p56.degradePct + '% writes=' + p56.blockWrites);
  check('P6 内存稳定:纹理不变、清场节点移除≥生物数(无实体泄漏)、几何无无界增长、生物受控', p56.texStable && p56.sceneClean && p56.geoNoGrowth && p56.mobsBounded, JSON.stringify({ before: p56.before, after: p56.after, geoAfterCleanup: p56.geoAfterCleanup, children: p56.childrenBeforeCleanup + '→' + p56.childrenAfterCleanup, sceneClean: p56.sceneClean, geoNoGrowth: p56.geoNoGrowth }));

  // ---- 0 JS error ----
  check('P7 页面 0 JS error(全程含 5000 帧长测)', jsErrors.length === 0, jsErrors.slice(0, 2).join(' | '));

  console.log(results.join('\n'));
  const fails = results.filter((r) => r.startsWith('FAIL')).length;
  console.log(`\n结果: ${results.length - fails}/${results.length} PASS` + (fails ? '\n❌ 有失败项' : '\n✅ 全部通过 —— 性能长测复验达标'));
  ws.close();
  process.exit(fails ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
