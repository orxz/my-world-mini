// ============================================================
// R37 地牢轮 实机验证(CDP,headless Chrome,--remote-debugging-port=9333)
// 覆盖:石室结构逐点断言(地板/墙/顶/刷怪笼/角箱/室内)、生成确定性、
// 登记表(dungeonSpawns/LootSpots)、战利品箱首次填充(3-5 条/成就/重开
// 不重复/删缓存重开同内容)、刷怪笼(近距离生成/同类 ≤3/远距不刷/挖笼失效)、
// 刷怪笼破坏无掉落(真实 breakBlock 路径)、生成侧零存档 diff、箱内容入档
// 往返、0 报错。
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

  // ---- 0. 进游戏(找地牢,传送邻近地表加载区块;关教程免守卫)----
  await sleep(1500);
  await evl(`document.getElementById('overlay').click()`);
  await sleep(600);
  await evl(`endTutorial()`);
  const dg = await evl(`(() => { for (let cx=-4;cx<=4;cx++) for (let cz=-4;cz<=4;cz++){ const d=dungeonInCell(cx,cz,worldSeed); if(d) return d; } })()`);
  check('找到地牢(±4 地牢格内)', !!dg, JSON.stringify(dg));
  await evl(`(() => {
    const mtn = fbm2D((${dg.cx} + 14) * 0.008, ${dg.cz} * 0.008, worldSeed + 555, 4);
    const gh = heightAt(${dg.cx} + 14, ${dg.cz}, worldSeed, biomeAt(${dg.cx} + 14, ${dg.cz}, worldSeed, mtn), mtn);
    playerPos.set(${dg.cx} + 14.5, gh + 4, ${dg.cz} + 0.5);
    velocity.set(0, 0, 0); isFlying = false;
  })()`);
  await sleep(2800);

  // ---- 1. 石室结构逐点断言 ----
  const F = dg.floor;
  const struct = await evl(`(() => {
    const cx = ${dg.cx}, cz = ${dg.cz}, F = ${dg.floor};
    const wall = (x, z) => { const b = getBlock(x, F + 2, z); return b === 'cobblestone' || b === 'brick'; };
    return {
      floorC: getBlock(cx, F, cz) === 'cobblestone',
      floorEdge: getBlock(cx - 3, F, cz - 3) === 'cobblestone',
      wallN: wall(cx, cz - 3), wallS: wall(cx, cz + 3), wallW: wall(cx - 3, cz), wallE: wall(cx + 3, cz),
      ceilIn: getBlock(cx, F + 4, cz) === 'brick',
      ceilEdge: getBlock(cx - 3, F + 4, cz - 3) === 'stone',
      spawner: getBlock(cx, F + 1, cz) === 'spawner',
      chestA: getBlock(cx - 2, F + 1, cz - 2) === 'chest',
      chestB: ${dg.chests} >= 2 ? getBlock(cx + 2, F + 1, cz + 2) === 'chest' : true,
      air: getBlock(cx - 1, F + 2, cz - 1) === null && getBlock(cx + 1, F + 3, cz + 1) === null,
      above: getBlock(cx, F + 5, cz) !== null,   // 顶板之上有岩层(埋深)
    };
  })()`);
  const ok1 = Object.entries(struct).filter(([k, v]) => k !== 'chestB').every(([, v]) => v === true) && struct.chestB;
  check('石室结构:地板/四墙/顶/刷怪笼/角箱/室内空气/顶板埋深', ok1, JSON.stringify(struct));

  // ---- 2. 生成确定性(同种子同格恒等)----
  const determinism = await evl(`(() => {
    const a = dungeonInCell(2, 2, worldSeed), b = dungeonInCell(2, 2, worldSeed);
    const dgp = { cx: ${dg.cx}, cz: ${dg.cz}, floor: ${dg.floor}, mob: 'zombie', chests: 2 };
    const s1 = dungeonBlockAt(3, 3, 1, dgp, worldSeed), s2 = dungeonBlockAt(3, 3, 1, dgp, worldSeed);
    return { cellEq: JSON.stringify(a) === JSON.stringify(b), blockEq: s1 === s2 };
  })()`);
  check('生成确定性(同种子同格恒等)', determinism.cellEq && determinism.blockEq, JSON.stringify(determinism));

  // ---- 3. 登记表包含刷怪笼与角箱(按各自所在区块查;角箱可能与中心不同区块)----
  const reg = await evl(`(() => {
    const all = [...dungeonSpawns.values()].flat();
    const sp = all.some(e => e.x === ${dg.cx} && e.y === ${dg.floor + 1} && e.z === ${dg.cz});
    const lo = [...dungeonLootSpots.values()].flat().some(e => e.x === ${dg.cx - 2} && e.y === ${dg.floor + 1} && e.z === ${dg.cz - 2});
    const mobOk = all.some(e => e.mob === ${JSON.stringify(dg.mob)});
    return { sp, lo, mobOk };
  })()`);
  check('登记表:刷怪笼(带怪种)+ 战利品箱入册', reg.sp && reg.lo && reg.mobOk, JSON.stringify(reg));

  // ---- 4. 零存档 diff(地牢原生方块不进 modifications)----
  const zeroDiff = await evl(`(() => {
    const rec = buildSaveRecord();
    const inDungeon = (rec.modifications || []).some(([k]) => {
      const [x, y, z] = k.split(',').map(Number);
      return Math.abs(x - ${dg.cx}) <= 3 && Math.abs(z - ${dg.cz}) <= 3 && y >= ${dg.floor} && y <= ${dg.floor + 4};
    });
    return { inDungeon };
  })()`);
  check('生成侧零存档 diff(地牢区域无 modifications)', zeroDiff.inDungeon === false, JSON.stringify(zeroDiff));

  // ---- 5. 战利品箱:首次填充(3-5 条/成就/重开不重复/确定性)----
  const loot = await evl(`(() => {
    const ck = blockKey(${dg.cx - 2}, ${dg.floor + 1}, ${dg.cz - 2});
    openChestPanel(${dg.cx - 2}, ${dg.floor + 1}, ${dg.cz - 2});
    const c1 = chests.get(ck);
    const items1 = c1.slots.filter(Boolean);
    const achv = achvUnlocked.has('dungeon_loot');
    closeChestPanel();
    // 重开:不再重复填充(内容一致)
    openChestPanel(${dg.cx - 2}, ${dg.floor + 1}, ${dg.cz - 2});
    const items2 = chests.get(ck).slots.filter(Boolean);
    closeChestPanel();
    const same = JSON.stringify(items1) === JSON.stringify(items2);
    // 删缓存后再开:同 hash 同内容(确定性)
    chests.delete(ck);
    openChestPanel(${dg.cx - 2}, ${dg.floor + 1}, ${dg.cz - 2});
    const items3 = chests.get(ck).slots.filter(Boolean);
    closeChestPanel();
    const deterministic = JSON.stringify(items1) === JSON.stringify(items3);
    const idsOk = items1.every(it => INVLIB.DUNGEON_LOOT_TABLE.some(e => e.id === it.id));
    return { n: items1.length, achv, same, deterministic, idsOk,
             sample: items1.map(it => it.id + 'x' + it.count).join(' ') };
  })()`);
  check('战利品箱:3-5 条/成就/重开一致/确定性/物品合法', loot.n >= 3 && loot.n <= 5 && loot.achv && loot.same && loot.deterministic && loot.idsOk, JSON.stringify(loot));

  // ---- 6. 刷怪笼行为:近距生成 → 同类上限 → 远距不刷 → 挖笼失效 ----
  const spawner = await evl(`(() => {
    clearMobs();
    // 玩家进石室(笼旁)
    playerPos.set(${dg.cx} + 1.5, ${dg.floor + 2.4}, ${dg.cz} + 0.5);
    velocity.set(0, 0, 0); isFlying = false;
    tutorial.active = false;
    spawnerTimer = 0;
    updateSpawners(0);   // 首次调用(节流直通)
    const spawned1 = mobs.filter(m => m.type === ${JSON.stringify(dg.mob)}).length;
    // 连刷至上限 3(每 2s 节流 → 手动清零)
    for (let k = 0; k < 4 && mobs.length < 3; k++) { spawnerTimer = 0; updateSpawners(0); }
    const atCap = mobs.filter(m => m.type === ${JSON.stringify(dg.mob)}).length;
    const capOk = atCap >= 1 && atCap <= 3;
    // 远离 20 格(>16)→ 不再生成
    playerPos.set(${dg.cx} + 40.5, ${dg.floor + 20}, ${dg.cz} + 0.5);
    clearMobs();
    spawnerTimer = 0; updateSpawners(0);
    const farNoSpawn = mobs.length === 0;
    // 挖掉刷怪笼 → 失效
    setBlock(${dg.cx}, ${dg.floor + 1}, ${dg.cz}, null);
    playerPos.set(${dg.cx} + 1.5, ${dg.floor + 2.4}, ${dg.cz} + 0.5);
    spawnerTimer = 0; updateSpawners(0);
    const brokenNoSpawn = mobs.length === 0;
    return { spawned1, capOk, farNoSpawn, brokenNoSpawn };
  })()`);
  check('刷怪笼:近距生成/同类 1-3 上限/远距不刷/挖笼失效',
    spawner.spawned1 >= 1 && spawner.capOk && spawner.farNoSpawn && spawner.brokenNoSpawn, JSON.stringify(spawner));

  // ---- 7. 刷怪笼破坏无掉落(真实 breakBlock 路径:重放笼 + 镐瞄准连击)----
  const noDrop = await evl(`(() => {
    setBlock(${dg.cx}, ${dg.floor + 1}, ${dg.cz}, 'spawner');
    for (let i = 0; i < 9; i++) hotbar[i] = null;
    hotbar[0] = { kind: 'tool', id: 'pickaxe_diamond', durability: 1562 }; currentSlot = 0; buildHotbar();
    playerPos.set(${dg.cx} + 1.5, ${dg.floor + 2.4}, ${dg.cz} + 0.5);
    velocity.set(0, 0, 0);
    const t = { x: ${dg.cx}, y: ${dg.floor + 1}, z: ${dg.cz} };
    const dx = (t.x + 0.5) - playerPos.x, dy = (t.y + 0.5) - playerPos.y, dz = (t.z + 0.5) - playerPos.z;
    yaw = Math.atan2(-dx, -dz); pitch = Math.asin(dy / Math.hypot(dx, dy, dz));
    const d0 = droppedItems.length;
    for (let k = 0; k < 8 && getBlock(t.x, t.y, t.z); k++) breakBlock();
    const gone = getBlock(t.x, t.y, t.z) === null;
    const drops = droppedItems.length - d0;
    return { gone, drops };
  })()`);
  check('刷怪笼破坏无掉落(真实连击路径)', noDrop.gone && noDrop.drops === 0, JSON.stringify(noDrop));

  // ---- 8. 箱内容入档往返 ----
  const rt = await evl(`(() => {
    const rec = JSON.parse(JSON.stringify(buildSaveRecord()));
    const saved = rec.chestsData ? rec.chestsData.filter(c => c.x === ${dg.cx - 2} && c.y === ${dg.floor + 1} && c.z === ${dg.cz - 2}) : [];
    const n0 = saved.length ? saved[0].slots.filter(Boolean).length : -1;
    applySave(rec);
    const c = chests.get(blockKey(${dg.cx - 2}, ${dg.floor + 1}, ${dg.cz - 2}));
    const n1 = c ? c.slots.filter(Boolean).length : -1;
    return { n0, n1 };
  })()`);
  check('战利品箱内容入档读档恢复', rt.n0 >= 3 && rt.n0 === rt.n1, JSON.stringify(rt));

  // ---- 9. 报错 ----
  await sleep(800);
  check('页面 0 JS error', jsErrors.length === 0, jsErrors.slice(0, 3).join(' || '));

  console.log('\n===== R37 地牢轮 实机验证 =====');
  for (const r of results) console.log(r);
  const fails = results.filter(r => r.startsWith('FAIL'));
  console.log(`\n结果: ${results.length - fails.length}/${results.length} PASS`);
  if (fails.length) { console.log('❌ 有失败项'); process.exit(1); }
  console.log('✅ 全部通过');
  ws.close();
  process.exit(0);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
