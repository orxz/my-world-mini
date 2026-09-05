// ============================================================
// R40 蛋糕/糖/蛋链 实机验证(CDP,--remote-debugging-port=9333)
// 覆盖:海岸甘蔗自然生成(扫描已加载区块)、水边种植(真实放置/无水
// 拒绝)、45s 逐节生长至 3、采样破坏拆柱(中段/底部)、鸡(生成池/
// 产蛋/小麦繁殖幼崽/掉落生鸡肉+羽毛)、生鸡肉冶炼表、糖/蛋糕配方、
// 蛋糕放置+吃片(6→5/饥饿+3/成就)、吃完消失、cakesData 存档往返、
// 0 报错。
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

  // ---- 0. 进游戏(先在出生区找海:扫 ocean 群系 → 传送海岸)----
  await sleep(1500);
  await evl(`document.getElementById('overlay').click()`);
  await sleep(600);
  await evl(`endTutorial()`);
  const sea = await evl(`(() => {
    for (let r = 30; r <= 400; r += 30) {
      for (let a = 0; a < 12; a++) {
        const x = Math.round(Math.cos(a / 12 * Math.PI * 2) * r), z = Math.round(Math.sin(a / 12 * Math.PI * 2) * r);
        if (biomeAt(x, z, worldSeed) === 'ocean') return { x, z };
      }
    }
    return null;
  })()`);
  check('找到海洋群系(出生 400 格内)', !!sea, JSON.stringify(sea));
  await evl(`playerPos.set(${sea.x + 0.5}, 30, ${sea.z + 0.5}); velocity.set(0, 0, 0); isFlying = false;`);
  await sleep(2800);   // 海岸区块加载(甘蔗生成侧写入)
  const natural = await evl(`(() => {
    let n = 0;
    for (const ch of chunks.values()) {
      for (let i = 0; i < ch.data.length; i++) if (ch.data[i] === BLOCK_ID.sugarcane) { n++; break; }   // 每区块计 1
    }
    return { chunksWithCane: n, loaded: chunks.size };
  })()`);
  check('海岸甘蔗自然生成(已加载区块内出现)', natural.chunksWithCane >= 1, JSON.stringify(natural));

  // ---- 1. 水边种植(真实 placeBlock):草+四向水 → 种下;无水拒绝 ----
  const plant = await evl(`(() => {
    // 在海岸边搭测试台:一块草 + 旁边一格水
    const px = Math.floor(playerPos.x), gy = Math.floor(playerPos.y) - 1, pz = Math.floor(playerPos.z);
    // 找玩家脚下实际地面层
    let gyy = gy + 6;
    while (gyy > 1 && !isSolidAt(px, gyy, pz + 4)) gyy--;
    window.__RS = { px, gy: gyy, pz: pz + 4 };
    for (let dx = -1; dx <= 3; dx++) for (let dy = 1; dy <= 4; dy++) setBlock(px + dx, gyy + dy, pz + 4, null);
    setBlock(px + 2, gyy, pz + 4, 'grass');
    setBlock(px + 3, gyy, pz + 4, 'water');   // 水邻居
    playerPos.set(px + 0.5, gyy + 1.9, pz + 4.5); velocity.set(0, 0, 0);
    for (let i = 0; i < 9; i++) hotbar[i] = null;
    hotbar[0] = { kind: 'block', id: 'sugarcane', count: 4 }; currentSlot = 0; selectSlot(0);
    const dx = (px + 2.5) - playerPos.x, dy = (gyy + 1.0) - playerPos.y, dz = (pz + 4.5) - playerPos.z;
    yaw = Math.atan2(-dx, -dz); pitch = Math.asin(dy / Math.hypot(dx, dy, dz));
    placeBlock();
    const planted = getBlock(px + 2, gyy + 1, pz + 4) === 'sugarcane';
    // 无水侧拒绝:抬高三层隔绝海岸天然水(草垫 + 净空,确保四向无水)
    setBlock(px + 1, gyy + 2, pz + 2, 'grass');
    for (let dy = 3; dy <= 5; dy++) setBlock(px + 1, gyy + dy, pz + 2, null);
    for (const [ox2, oz2] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) setBlock(px + 1 + ox2, gyy + 3, pz + 2 + oz2, null);
    playerPos.set(px + 0.5, gyy + 3.9, pz + 2.5); velocity.set(0, 0, 0);
    const dx2 = (px + 1.5) - playerPos.x, dy2 = (gyy + 3.0) - playerPos.y, dz2 = (pz + 2.5) - playerPos.z;
    yaw = Math.atan2(-dx2, -dz2); pitch = Math.asin(dy2 / Math.hypot(dx2, dy2, dz2));
    const cnt0 = hotbar[0].count;
    placeBlock();
    const rejected = getBlock(px + 1, gyy + 3, pz + 2) === null && hotbar[0].count === cnt0;
    return { planted, rejected, cnt: hotbar[0].count };
  })()`);
  check('甘蔗种植:水边真实放置 ✓ / 无水拒绝不消耗', plant.planted && plant.rejected, JSON.stringify(plant));

  // ---- 2. 生长:计时回拨 46s ×2 → 3 节 ----
  const grow = await evl(`(() => {
    const px = window.__RS.px, gy = window.__RS.gy, pz = window.__RS.pz;
    const key = (px + 2) + ',' + (gy + 1) + ',' + pz;
    for (let round = 0; round < 2; round++) {
      caneTimers.set(key, Date.now() - 46000);
      updateCanes();
    }
    let h = 0;
    while (getBlock(px + 2, gy + 1 + h, pz) === 'sugarcane' && h < 5) h++;
    return { h };
  })()`);
  check('甘蔗生长:45s/节 → 3 节', grow.h === 3, JSON.stringify(grow));

  // ---- 3. 采样破坏:拆中段 → 上段弹出;拆底 → 柱清空掉落 ----
  const breakCane = await evl(`(() => {
    const px = window.__RS.px, gy = window.__RS.gy, pz = window.__RS.pz;
    const cnt = (id) => droppedItems.filter(d => d.userData.type === id).length;
    const c0 = cnt('sugarcane');
    playerPos.set(px + 0.5, gy + 1.9, pz + 0.5); velocity.set(0, 0, 0);
    const aimAt = (ty) => { const dx = (px + 2.5) - playerPos.x, dy = (ty + 0.5) - playerPos.y, dz = (pz + 0.5) - playerPos.z; yaw = Math.atan2(-dx, -dz); pitch = Math.asin(dy / Math.hypot(dx, dy, dz)); };
    aimAt(gy + 2);   // 拆中段
    breakBlock();
    const afterMid = (getBlock(px + 2, gy + 1, pz) === 'sugarcane' && getBlock(px + 2, gy + 3, pz) === null);
    const dropsMid = cnt('sugarcane') - c0;   // 中段+上段 = 2
    aimAt(gy + 1);   // 拆底
    breakBlock();
    const allGone = getBlock(px + 2, gy + 1, pz) === null;
    const dropsAll = cnt('sugarcane') - c0;   // 全柱 = 3
    return { afterMid, dropsMid, allGone, dropsAll };
  })()`);
  check('甘蔗破坏:拆中段弹上段(2 掉)/ 拆底全柱(3 掉)', breakCane.afterMid && breakCane.dropsMid === 2 && breakCane.allGone && breakCane.dropsAll === 3, JSON.stringify(breakCane));

  // ---- 4. 鸡:生成池统计 + 产蛋 + 小麦繁殖 + 掉落 ----
  const chicken = await evl(`(() => {
    const px = window.__RS.px, gy = window.__RS.gy, pz = window.__RS.pz;
    // 生成池统计
    let seen = 0;
    for (let i = 0; i < 600 && seen === 0; i++) {
      clearMobs(); trySpawnMob();
      if (mobs.some(m => m.type === 'chicken')) seen++;
    }
    clearMobs(); clearDroppedItems();
    // 产蛋
    const a = spawnMob(px + 2.5, gy + 1, pz + 1.5, 'chicken');
    a.turnT = 999; a.eggT = 0.1;
    for (let i = 0; i < 6; i++) updateMobs(0.05);
    const egg = droppedItems.some(d => d.userData.type === 'egg');
    const reset = a.eggT > 80;   // 重置回 90-180
    // 繁殖(错开站位真实瞄准)
    const b = spawnMob(px + 2.5, gy + 1, pz + 3.5, 'chicken');
    b.turnT = 999;
    playerPos.set(px + 0.5, gy + 1.9, pz + 2.5); velocity.set(0, 0, 0);
    const hold = (id) => { for (let i = 0; i < 9; i++) hotbar[i] = null; hotbar[0] = { kind: 'item', id, count: 2 }; currentSlot = 0; selectSlot(0); };
    const aimAt = (m) => { const t = m.mesh.position; const dx = t.x - playerPos.x, dy = t.y - playerPos.y, dz = t.z - playerPos.z; yaw = Math.atan2(-dx, -dz); pitch = Math.asin(dy / Math.hypot(dx, dy, dz)); };
    hold('wheat');
    aimAt(a); placeBlock();
    aimAt(b); placeBlock();
    const bothLove = a.loveT === 30 && b.loveT === 30;
    for (let i = 0; i < 200; i++) updateMobs(0.05);
    const baby = mobs.some(m => m.type === 'chicken' && m.baby);
    // 死亡掉落
    clearDroppedItems();
    const c = mobs.find(m => m.type === 'chicken' && !m.baby) || a;
    if (mobs.includes(c)) hurtMob(c, 99, 0, 0, true);
    const raw = droppedItems.some(d => d.userData.type === 'raw_chicken');
    const feather = droppedItems.some(d => d.userData.type === 'feather');
    return { seen, egg, reset, bothLove, baby, raw, feather };
  })()`);
  check('鸡:生成池/产蛋(计时重置)/小麦繁殖幼崽/掉生鸡肉+羽毛',
    chicken.seen >= 1 && chicken.egg && chicken.reset && chicken.bothLove && chicken.baby && chicken.raw && chicken.feather, JSON.stringify(chicken));

  // ---- 5. 配方 + 冶炼表(页面内真实匹配)----
  const recipes = await evl(`(() => {
    const g3 = (ids) => ids.map(x => x === null ? null : { kind: (x === 'wheat' || x === 'sugar' || x === 'egg') ? 'item' : (x === 'sugarcane' ? 'block' : 'item'), id: x });
    const sugar = matchRecipeGrid([{ kind: 'block', id: 'sugarcane' }, null, null, null], 2, CRAFTLIB.RECIPES);
    const cake = matchRecipeGrid(g3(['sugar', 'sugar', 'egg', 'wheat', 'wheat', 'wheat', null, null, null]), 3, CRAFTLIB.RECIPES);
    const smelt = MACHINES.SMELT.raw_chicken.id === 'cooked_chicken' && MACHINES.furnaceCanSmelt({ input: { kind: 'item', id: 'raw_chicken' }, fuel: null, output: null, burnT: 0, cookT: 0 });
    return { sugar: !!sugar, cake: !!(cake && cake.result.id === 'cake'), smelt };
  })()`);
  check('配方:甘蔗→糖 / 2糖1蛋3麦→蛋糕 / 生鸡肉可冶炼', recipes.sugar && recipes.cake && recipes.smelt, JSON.stringify(recipes));

  // ---- 6. 蛋糕:真实放置 + 右键吃片(6→5,+3,成就)→ 吃完消失 ----
  const cake = await evl(`(() => {
    const px = window.__RS.px, gy = window.__RS.gy, pz = window.__RS.pz;
    setBlock(px + 2, gy, pz + 1, 'stone');
    for (let dy = 1; dy <= 3; dy++) setBlock(px + 2, gy + dy, pz + 1, null);
    playerPos.set(px + 0.5, gy + 1.9, pz + 1.5); velocity.set(0, 0, 0);
    hungerState.hunger = 10;
    for (let i = 0; i < 9; i++) hotbar[i] = null;
    hotbar[0] = { kind: 'block', id: 'cake', count: 1 }; currentSlot = 0; selectSlot(0);
    const dx = (px + 2.5) - playerPos.x, dy = (gy + 1.0) - playerPos.y, dz = (pz + 1.5) - playerPos.z;
    yaw = Math.atan2(-dx, -dz); pitch = Math.asin(dy / Math.hypot(dx, dy, dz));
    placeBlock();
    const placed = getBlock(px + 2, gy + 1, pz + 1) === 'cake';
    // 吃一片
    const dx2 = (px + 2.5) - playerPos.x, dy2 = (gy + 1.5) - playerPos.y, dz2 = (pz + 1.5) - playerPos.z;
    yaw = Math.atan2(-dx2, -dz2); pitch = Math.asin(dy2 / Math.hypot(dx2, dy2, dz2));
    placeBlock();
    const slices = cakes.get((px + 2) + ',' + (gy + 1) + ',' + (pz + 1));
    const hunger = hungerState.hunger;
    const achv = achvUnlocked.has('cake');
    // 吃完剩余 5 片(直调,每次重置饥饿)
    for (let k = 0; k < 5; k++) { hungerState.hunger = 10; eatCakeSlice(px + 2, gy + 1, pz + 1); }
    const gone = getBlock(px + 2, gy + 1, pz + 1) === null && !cakes.has((px + 2) + ',' + (gy + 1) + ',' + (pz + 1));
    return { placed, slices, hunger, achv, gone };
  })()`);
  check('蛋糕:放置+吃片(6→5/+3/成就)→ 吃完方块消失',
    cake.placed && cake.slices === 5 && cake.hunger === 13 && cake.achv && cake.gone, JSON.stringify(cake));

  // ---- 7. 存档往返:cakesData 恢复片数 ----
  const rt = await evl(`(() => {
    const px = window.__RS.px, gy = window.__RS.gy, pz = window.__RS.pz;
    setBlock(px + 2, gy + 1, pz + 1, 'cake');
    hungerState.hunger = 10;
    eatCakeSlice(px + 2, gy + 1, pz + 1);
    eatCakeSlice(px + 2, gy + 1, pz + 1);
    const rec = JSON.parse(JSON.stringify(buildSaveRecord()));
    const saved = rec.cakesData ? rec.cakesData[0][1] : null;
    applySave(rec);
    const back = cakes.get((px + 2) + ',' + (gy + 1) + ',' + (pz + 1));
    return { saved, back };
  })()`);
  check('蛋糕片数入档读档恢复(6-2=4)', rt.saved === 4 && rt.back === 4, JSON.stringify(rt));

  // ---- 8. 报错 ----
  await sleep(800);
  check('页面 0 JS error', jsErrors.length === 0, jsErrors.slice(0, 3).join(' || '));

  console.log('\n===== R40 蛋糕/糖/蛋链 实机验证 =====');
  for (const r of results) console.log(r);
  const fails = results.filter(r => r.startsWith('FAIL'));
  console.log(`\n结果: ${results.length - fails.length}/${results.length} PASS`);
  if (fails.length) { console.log('❌ 有失败项'); process.exit(1); }
  console.log('✅ 全部通过');
  ws.close();
  process.exit(0);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
