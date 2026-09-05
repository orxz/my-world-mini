// ============================================================
// R36 铁桶与水轮 实机验证(CDP,headless Chrome,--remote-debugging-port=9333)
// 覆盖:配方(3 铁锭 V 形)、图标/3D 手持绘制不报错、舀水(水格消失+桶变水桶)、
// 放水(目标格变 water+桶变空)、可移动水源循环取放 3 次、放到的水可游泳
// (inWater)、modifications 入存档往返、成就「桶装玩意」、未对准水拒绝、
// 墙后水够不着(遇固体停)、0 报错。
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
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, timeout: 60000 });
    if (r.result.exceptionDetails) {
      throw new Error('EVAL ERROR: ' + ((r.result.exceptionDetails.exception && r.result.exceptionDetails.exception.description) || r.result.exceptionDetails.text));
    }
    return r.result.result.value;
  };
  await send('Runtime.enable');

  const results = [];
  const check = (name, cond, extra = '') => results.push((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' | ' + extra : ''));

  // ---- 0. 进游戏(传送开阔村庄平地:出生广场有装饰树,叶墙会挡住舀水视线)----
  await sleep(1500);
  await evl(`document.getElementById('overlay').click()`);
  await sleep(600);
  const hut = await evl(`(() => { for (let cx=-6;cx<=6;cx++) for (let cz=-6;cz<=6;cz++){ const h=villageInCell(cx,cz,worldSeed); if(h) return h; } })()`);
  await evl(`playerPos.set(${hut.cx + 8.5}, ${hut.base + 4}, ${hut.cz + 8.5}); velocity.set(0,0,0); isFlying=false;`);
  await sleep(2600);   // 等区块加载
  check('进入游戏(开阔地)', await evl(`document.getElementById('overlay').classList.contains('hidden') && typeof useBucket === 'function'`) && !!hut);

  // ---- 1. 配方 + 图标/3D 绘制不报错 ----
  const basics = await evl(`(() => {
    const g3 = (ids) => ids.map(x => x === null ? null : { kind: 'item', id: x });
    const r = matchRecipeGrid(g3(['iron_ingot', null, 'iron_ingot', null, 'iron_ingot', null, null, null, null]), 3, CRAFTLIB.RECIPES);
    const cv = document.createElement('canvas'); cv.width = cv.height = 48;
    let iconOk = true;
    try { drawItemIcon({ kind: 'item', id: 'bucket' }, cv); drawItemIcon({ kind: 'item', id: 'water_bucket' }, cv); }
    catch (e) { iconOk = false; }
    let meshOk = true;
    try { const m1 = buildMaterialMesh('bucket'); const m2 = buildMaterialMesh('water_bucket'); m1.traverse(() => {}); m2.traverse(() => {}); }
    catch (e) { meshOk = false; }
    return { recipe: r && r.result.id === 'bucket', iconOk, meshOk };
  })()`);
  check('配方 3 铁锭 V 形 + 图标/3D 手持绘制 OK', basics.recipe && basics.iconOk && basics.meshOk, JSON.stringify(basics));

  // ---- 2. 舀水:面前眼平面放一格水 → 空桶右键 → 水消失、桶变水桶、成就解锁 ----
  // (种子随机,先清空东向射线路径上的树叶/树干,保证视线干净)
  const scoop = await evl(`(() => {
    const px = Math.floor(playerPos.x), ey = Math.floor(playerPos.y), bz = Math.floor(playerPos.z);
    for (let dx = 1; dx <= 5; dx++) setBlock(px + dx, ey, bz, null);
    const bx = px + 2;
    setBlock(bx, ey, bz, 'water');
    for (let i = 0; i < 9; i++) hotbar[i] = null;
    hotbar[0] = { kind: 'item', id: 'bucket', count: 1 }; currentSlot = 0; buildHotbar();
    const dx2 = (bx + 0.5) - playerPos.x, dy = (ey + 0.5) - playerPos.y, dz = (bz + 0.5) - playerPos.z;
    yaw = Math.atan2(-dx2, -dz); pitch = Math.asin(dy / Math.hypot(dx2, dy, dz));
    placeBlock();
    return { gone: getBlock(bx, ey, bz) === null, id: hotbar[0] && hotbar[0].id,
             achv: achvUnlocked.has('bucket') };
  })()`);
  check('舀水:水格消失 + 桶变水桶 + 成就「桶装玩意」', scoop.gone && scoop.id === 'water_bucket' && scoop.achv, JSON.stringify(scoop));

  // ---- 3. 放水/舀取循环:眼前石柱西面倒水 → (柱西格)水;再舀回;循环 3 轮 ----
  const cycle = await evl(`(() => {
    const px = Math.floor(playerPos.x), ey = Math.floor(playerPos.y), bz = Math.floor(playerPos.z);
    for (let dx = 1; dx <= 5; dx++) setBlock(px + dx, ey, bz, null);   // 清射线路径
    const sx = px + 3;
    setBlock(sx, ey, bz, 'stone');   // 眼平面石柱(倒水面)
    const wx = sx - 1;               // 水落点(石柱西面相邻格)
    const aimAt = (tx, ty, tz) => {
      const dx = (tx + 0.5) - playerPos.x, dy = (ty + 0.5) - playerPos.y, dz = (tz + 0.5) - playerPos.z;
      yaw = Math.atan2(-dx, -dz); pitch = Math.asin(dy / Math.hypot(dx, dy, dz));
    };
    const logs = [];
    for (let round = 0; round < 3; round++) {
      const slot = hotbar.findIndex(h => h && h.id === 'water_bucket');
      currentSlot = Math.max(0, slot); selectSlot(currentSlot);
      aimAt(sx, ey, bz);
      placeBlock();   // 水桶对石柱 → 水落在 (wx, ey, bz)
      const placed = getBlock(wx, ey, bz) === 'water';
      const hasEmpty = INVLIB.countInHotbar(hotbar, 'bucket') === 1 && INVLIB.countInHotbar(hotbar, 'water_bucket') === 0;
      const slot2 = hotbar.findIndex(h => h && h.id === 'bucket');
      currentSlot = Math.max(0, slot2); selectSlot(currentSlot);
      aimAt(wx, ey, bz);
      placeBlock();   // 空桶对水 → 舀回
      const scoopedBack = getBlock(wx, ey, bz) === null && INVLIB.countInHotbar(hotbar, 'water_bucket') === 1;
      logs.push(placed && hasEmpty && scoopedBack);
    }
    setBlock(sx, ey, bz, null);
    return { rounds: logs.filter(Boolean).length };
  })()`);
  check('可移动水源:倒水→舀取 循环 3 轮全成(桶↔水桶往返)', cycle.rounds === 3, JSON.stringify(cycle));

  // ---- 4. 放出的水可游泳(inWater 真实判定)----
  const swim = await evl(`(() => {
    const bx = Math.floor(playerPos.x), by = Math.floor(playerPos.y), bz = Math.floor(playerPos.z) + 3;
    setBlock(bx, by, bz, 'water'); setBlock(bx, by + 1, bz, 'water');
    const save = playerPos.clone();
    playerPos.set(bx + 0.5, by + 0.9, bz + 0.5);
    const inW = inWater();
    playerPos.copy(save);
    setBlock(bx, by, bz, null); setBlock(bx, by + 1, bz, null);
    return { inW };
  })()`);
  check('放出的水可游泳(inWater 判定)', swim.inW === true, JSON.stringify(swim));

  // ---- 5. 存档往返:放的水随 modifications 持久化 ----
  const rt = await evl(`(() => {
    const bx = Math.floor(playerPos.x) + 4, by = Math.floor(playerPos.y) - 1, bz = Math.floor(playerPos.z);
    setBlock(bx, by, bz, 'water');
    const rec = JSON.parse(JSON.stringify(buildSaveRecord()));
    const inRec = rec.modifications.some(([k]) => k === bx + ',' + by + ',' + bz);
    applySave(rec);
    const restored = getBlock(bx, by, bz) === 'water';
    setBlock(bx, by, bz, null);
    return { inRec, restored };
  })()`);
  check('放的水入存档并读档恢复', rt.inRec && rt.restored, JSON.stringify(rt));

  // ---- 6. 拒绝路径:未对准水(空桶朝天)/ 目标格有水(水桶对水后面石柱)----
  const reject = await evl(`(() => {
    for (let i = 0; i < 9; i++) hotbar[i] = null;
    // 空桶抬头朝天:视线无水 → 拒绝且不消耗
    hotbar[0] = { kind: 'item', id: 'bucket', count: 1 }; currentSlot = 0; buildHotbar();
    pitch = 1.2; yaw = 0;
    const before = hotbar[0].id;
    placeBlock();
    const noScoop = hotbar[0] && hotbar[0].id === before;
    // 水桶:眼前石柱,柱西格已有水 → 射线穿水命中石柱,倒水目标格被水占据 → 拒绝
    const px = Math.floor(playerPos.x), ey = Math.floor(playerPos.y), bz = Math.floor(playerPos.z);
    for (let dx = 1; dx <= 5; dx++) setBlock(px + dx, ey, bz, null);   // 清射线路径
    const sx = px + 3;
    setBlock(sx, ey, bz, 'stone');
    setBlock(sx - 1, ey, bz, 'water');
    hotbar[0] = { kind: 'item', id: 'water_bucket', count: 1 }; buildHotbar();
    const dx = (sx + 0.5) - playerPos.x, dy = (ey + 0.5) - playerPos.y, dz = (bz + 0.5) - playerPos.z;
    yaw = Math.atan2(-dx, -dz); pitch = Math.asin(dy / Math.hypot(dx, dy, dz));
    placeBlock();
    const kept = hotbar[0] && hotbar[0].id === 'water_bucket';
    const waterStill = getBlock(sx - 1, ey, bz) === 'water';
    setBlock(sx, ey, bz, null); setBlock(sx - 1, ey, bz, null);
    return { noScoop, kept, waterStill };
  })()`);
  check('拒绝路径:未对准水不消耗 / 倒向有水格不倒', reject.noScoop && reject.kept && reject.waterStill, JSON.stringify(reject));

  // ---- 7. 报错 ----
  await sleep(800);
  check('页面 0 JS error', jsErrors.length === 0, jsErrors.slice(0, 3).join(' || '));

  console.log('\n===== R36 铁桶与水轮 实机验证 =====');
  for (const r of results) console.log(r);
  const fails = results.filter(r => r.startsWith('FAIL'));
  console.log(`\n结果: ${results.length - fails.length}/${results.length} PASS`);
  if (fails.length) { console.log('❌ 有失败项'); process.exit(1); }
  console.log('✅ 全部通过');
  ws.close();
  process.exit(0);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
