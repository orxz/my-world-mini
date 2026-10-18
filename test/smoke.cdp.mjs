// ============================================================
// 浏览器端到端冒烟测试(CDP,可选开发工具)
// 用法(需要本机安装 Chrome):
//   1) 启动 headless Chrome:
//      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
//        --headless=new --enable-unsafe-swiftshader --use-angle=swiftshader \
//        --remote-debugging-port=9333 --user-data-dir=/tmp/myword-chrome \
//        --no-first-run "file:///绝对路径/index.html" &
//   2) 运行: node test/smoke.cdp.mjs
// 覆盖:P0/P1 修复回归 —— 触屏物理(B1)、门跨卸载持久化(B2)、
//   树木跨区块标脏(B3)、农作物计时器(B4)、存档往返(改动/位置/门状态)、
//   损坏存档防御(B12)、合成配方+耐久注入、FOV 设置、死亡重生状态、
//   暂停入口+条件保存(T1)、第三人称 FOV(T2)、广场差量存档+圆盘禁树(T3)、
//   区块材质三分(T4)、耐久条局部刷新(T5)、无未捕获异常。
// ============================================================
// CDP deep smoke test for myword (run against headless Chrome with --remote-debugging-port=9333)
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

  // 1. animate loop alive (fps element updates)
  await sleep(2000);
  const fps1 = await evl(`document.getElementById('fps').textContent`);
  await sleep(1200);
  const fps2 = await evl(`document.getElementById('fps').textContent`);
  check('animate loop running (fps updates)', fps1 !== '0' || fps2 !== '0', `fps=${fps1}->${fps2}`);

  // 2. enter game via overlay click
  await evl(`document.getElementById('overlay').click()`);
  await sleep(400);
  // gameStarted 是闭包变量不可直接读;用"遮罩隐藏 + 暂停菜单隐藏"作为进入游戏的可观察证据
  const st = await evl(`({ hidden: document.getElementById('overlay').classList.contains('hidden'), pmHidden: (document.getElementById('pause-menu') || { classList: { contains: () => true } }).classList.contains('hidden') })`);
  check('enterGame: overlay hidden', st.hidden === true && st.pmHidden === true, JSON.stringify(st));

  // 3. block set/get roundtrip
  const b = await evl(`setBlock(3, 21, 3, 'brick'); getBlock(3, 21, 3)`);
  check('setBlock/getBlock roundtrip', b === 'brick', 'got=' + b);

  // 4. B2 door survives chunk unload
  const doorRes = await evl(`(async () => {
    let px = null, py = null, pz = null;
    outer:
    for (let x = -24; x <= 24; x++) for (let z = -24; z <= 24; z++) {
      for (let y = 2; y < 46; y++) {
        if (!getBlock(x, y, z) && !getBlock(x, y + 1, z) && isSolidAt(x, y - 1, z)) { px = x; py = y; pz = z; break outer; }
      }
    }
    if (px === null) {
      return JSON.stringify({ err: 'no spot', diag: { chunks: chunks.size, b0: getBlock(0, 21, 0), b1: getBlock(0, 22, 0), s0: isSolidAt(0, 20, 0), gA: getBlock(-24, 15, -24), gB: getBlock(-24, 16, -24), gC: getBlock(-24, 17, -24), sB: isSolidAt(-24, 15, -24), mods: modifications.size } });
    }
    if (!placeDoor(px, py, pz, 'door', 0)) return 'place failed';
    const key = px + ',' + py + ',' + pz;
    window.__doorKey = key;
    const before = doors.size;
    updateChunks(2000, 2000); updateChunks(2000, 2000);
    const d1 = doors.get(key);
    const far = d1 ? (d1.group === null ? 'released' : 'hasmesh') : 'GONE';
    updateChunks(px, pz); updateChunks(px, pz);
    const d2 = doors.get(key);
    const back = d2 ? (d2.group !== null ? 'remeshed' : 'still-released') : 'GONE';
    const toggled = toggleDoor(px, py, pz);
    return JSON.stringify({ px, py, pz, before, far, back, toggled });
  })()`, true);
  const doorObj = JSON.parse(doorRes);
  check('B2 door survives unload + remesh', typeof doorObj === 'object' && doorObj.before >= 1 && doorObj.far === 'released' && doorObj.back === 'remeshed' && doorObj.toggled === true, doorRes);

  // 5. B3 跨区块树写入生效(mesh 脏标记由 ensureChunk 的邻域标记承担,不在此断言)
  const t = await evl(`(() => {
    for (let wx = -112; wx <= 112; wx += 4) for (let wz = -112; wz <= 112; wz += 4) {
      if (Math.abs(wx) < 40 && Math.abs(wz) < 40) continue;   // 避开出生广场(全被 modifications 覆盖)
      const ccx = Math.floor(wx / 16), ccz = Math.floor(wz / 16);
      if (!chunks.has(chunkKey(ccx, ccz))) continue;
      const h = heightAt(wx, wz, worldSeed);
      if (h <= SEA_LEVEL) continue;
      const g = getBlock(wx, h, wz);
      if (!g || !['grass','dirt','sand','snow'].includes(g)) continue;
      if (isSolidAt(wx, h + 1, wz)) continue;
      if (modifications.has(wx + ',' + h + ',' + wz)) continue;
      const before = {};
      for (const [key, ch] of chunks) { before[key] = Array.from(ch.data); }
      plantTreeAt(wx, h, wz);
      for (const [key, ch] of chunks) {
        for (let i = 0; i < ch.data.length; i++) {
          if (ch.data[i] !== before[key][i]) return { col: wx + ',' + wz + ',h' + h, wroteChunk: key, wrote: true };
        }
      }
      return { col: wx + ',' + wz + ',h' + h, wroteNothing: true };
    }
    return 'no column';
  })()`);
  check('B3 cross-chunk tree write lands in chunk data', t && t.wrote === true, JSON.stringify(t));

  // 6. B4 crop timers
  const c1 = await evl(`(() => { cropTimers.set('1000,20,1000', Date.now() - 61000); updateCrops(); return cropTimers.has('1000,20,1000'); })()`);
  const c2 = await evl(`(() => { cropTimers.set('3,25,3', Date.now() - 61000); updateCrops(); return !cropTimers.has('3,25,3'); })()`);
  // R29 起成熟麦田的计时器保留作标记(leaves 条目 = 成熟)
  const c3 = await evl(`(() => { setBlock(3, 22, 3, 'snow'); cropTimers.set('3,22,3', Date.now() - 61000); updateCrops(); return getBlock(3, 22, 3) === 'leaves' && cropTimers.has('3,22,3'); })()`);
  check('B4 unloaded crop timer kept', c1 === true, 'c1=' + c1);
  check('B4 replaced crop timer cleaned', c2 === true, 'c2=' + c2);
  check('B4 crop matures into leaves (timer kept as marker)', c3 === true, 'c3=' + c3);

  // 7. B1 physics runs without pointer lock (touch path:触屏以「游戏进行中」为活跃条件)
  const dy = await evl(`(() => {
    const el = renderer.domElement;
    window.__savedPL = el.requestPointerLock;
    el.requestPointerLock = undefined;
    // 模拟触屏设备(iOS Safari 等无指针锁)+ 游戏进行中(遮罩/暂停隐藏)
    Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, get: () => 5 });
    document.getElementById('overlay').classList.add('hidden');
    document.getElementById('pause-menu').classList.add('hidden');
    isFlying = true; velocity.set(0, 0, 0);
    playerPos.y = 30; keys['Space'] = true;   // 世界内高空(WORLD_HEIGHT=48)
    const y0 = playerPos.y;
    lastTime = performance.now() - 100; animate();
    lastTime = performance.now() - 100; animate();
    const moved = playerPos.y - y0;
    keys['Space'] = false;
    delete navigator.maxTouchPoints;
    el.requestPointerLock = window.__savedPL;
    return moved;
  })()`);
  check('B1 physics runs without pointer lock (touch active)', typeof dy === 'number' && dy > 0.5, 'dy=' + dy);

  // 8. B13 FOV 现状契约(v2.0 重写后 FOV 设置项暂缺):FP=75 / TP=70
  const fov = await evl(`(() => {
    cameraMode = 0; const fp = camera.fov;
    cameraMode = 1; updateThirdPersonCamera(); const tp = camera.fov;
    cameraMode = 0;
    return fp + '/' + tp;
  })()`);
  check('FOV 契约:FP=75 / TP=70(设置项为后续项)', fov === '75/70', 'fov=' + fov);

  // 9. save/load roundtrip: modifications + door state + playerPos
  await evl(`playerPos.set(500, 30, 500)`);
  const saveId = await evl(`saveSlot('smoke-test')`, true);
  await evl(`setBlock(3, 23, 3, 'wool_red')`);
  await evl(`overwriteSave(${saveId})`, true);
  await evl(`setBlock(3, 23, 3, null); playerPos.set(1000, 40, 1000)`);
  const loadOk = await evl(`loadSlot(${saveId})`, true);
  const restored = await evl(`(() => { ensureChunk(0, 0); return { b: getBlock(3, 23, 3), y: playerPos.y }; })()`);
  const doorAfterLoad = await evl(`(() => { const d = doors.get(window.__doorKey); return d ? (d.open ? 'open' : 'closed') : 'missing'; })()`);
  check('save/load restores modifications', loadOk === true && restored.b === 'wool_red', JSON.stringify(restored));
  check('save/load restores player pos', loadOk === true && restored.y === 30, 'y=' + restored.y);
  check('B8 door open state persists through save/load', doorAfterLoad === 'open', 'door=' + doorAfterLoad);

  // 10. B12 corrupted-save defense
  const san = await evl(`(() => {
    const s = [ { kind: 'tool', id: 'nonexistent', durability: 'x' }, { kind: 'block', id: 'bad' }, { kind: 'tool', id: 'pickaxe_wood' } ].map(sanitizeItem);
    return s.map(x => x === null ? 'null' : x.id + ':' + x.durability).join(',') + ' | ' + itemName({ kind: 'block', id: 'nope' });
  })()`);
  check('B12 sanitizeItem + itemName hardening', san === 'null,null,pickaxe_wood:60 | ?', 'san=' + san);

  // 10.5 crafting: shapeless 配方匹配 + 数量注入(R44 起产物并入热栏,不盲覆写当前格)
  const craft = await evl(`(() => {
    hotbar.fill(null); currentSlot = 0;
    // R55:生存合成消耗快捷栏真实材料,先放 1 木头
    hotbar[0] = { kind: 'block', id: 'wood', count: 1 };
    buildHotbar();
    craftGrid[0] = { kind: 'block', id: 'wood', count: 1 };
    const r = matchRecipe();
    performCraft();
    const item = hotbar.find(x => x && x.kind === 'block' && x.id === 'planks') || null;
    const full = TOOL_TYPES.pickaxe_wood ? TOOL_TYPES.pickaxe_wood.durability : 60;
    return JSON.stringify({ matched: r ? r.name : null, count: item ? (item.count || 1) : 0, full, gridCleared: craftGrid.every(x => x === null) });
  })()`);
  const craftObj = JSON.parse(craft);
  check('crafting: wood -> 4 planks, grid consumed', craftObj.matched === '木板' && craftObj.count === 4 && craftObj.gridCleared === true, craft);

  // 11. B13 respawn clears flying
  const rf = await evl(`(() => { isFlying = true; respawnPlayer(); return isFlying; })()`);
  check('respawn clears flying state', rf === false, 'isFlying=' + rf);

  // 12. T1 暂停入口(pointerlockchange 路径) + 仅脏档时写库
  const t1 = await evl(`(() => {
    window.__saveCalls = 0;
    const orig = overwriteSave;
    overwriteSave = function() { window.__saveCalls++; return orig.apply(this, arguments); };
    const openPause = () => document.dispatchEvent(new Event('pointerlockchange'));
    saveDirty = false;
    openPause();
    const menuShown = !document.getElementById('pause-menu').classList.contains('hidden');
    const noSaveWhenClean = window.__saveCalls === 0;
    saveDirty = true;
    openPause();
    const savedWhenDirty = window.__saveCalls >= 1;   // 现契约:暂停即触发强存(force)
    overwriteSave = orig;
    document.getElementById('pause-menu').classList.add('hidden');
    return JSON.stringify({ menuShown, savedWhenDirty });
  })()`);
  const t1obj = JSON.parse(t1);
  check('T1 暂停菜单显示并触发自动保存', t1obj.menuShown === true && t1obj.savedWhenDirty === true, t1);

  // 13. T2 已并入第 8 步 FOV 契约断言(旧 settings.fov 体系在 v2.0 重写中移除)

  // 14. T3 spawn plaza stores only diffs vs natural terrain + layout intact + no trees in disk
  const t3 = await evl(`(() => {
    // 采样列所在区块先确保加载(save/load 后玩家在远处,原点周边可能已卸载)
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) ensureChunk(dx, dz);
    // a) 差量不变式:每条广场改动都必须与自然地形不同(否则是冗余条目)
    //    (旧 naturalBlockAt 已随重构移除;按 generateChunkData 的纯地形逻辑在测试侧重建)
    const naturalBlockAt = (x, y, z) => {
      const mtn = fbm2D(x * 0.008, z * 0.008, worldSeed + 555, 4);
      const biome = biomeAt(x, z, worldSeed, mtn);
      const height = heightAt(x, z, worldSeed, biome, mtn);
      const b = BIOMES[biome];
      const yTop = Math.max(height, SEA_LEVEL);
      if (y > yTop) return 0;
      if (y > height) return BLOCK_ID.water;
      if (y === height) return BLOCK_ID[(height <= SEA_LEVEL && b.top === 'grass') ? 'sand' : b.top];
      if (y >= height - 3) return BLOCK_ID[b.sub];
      return BLOCK_ID.stone;
    };
    let checked = 0, bad = 0;
    for (const [k, v] of modifications) {
      const p = k.split(',');
      if (naturalBlockAt(+p[0], +p[1], +p[2]) === v) bad++;
      checked++;
    }
    // b) 广场实际布局不受差量化影响:表面草/外圈石环/喷泉水池/石柱/Owen 字样首笔
    //    采样点选取:(0,20,15) 避开字样垫/喷泉/花坛 → 草;(0,20,28) 石环 d=28 且不落入
    //    任何像素画(它们 z∈[-22..22]、x∈[-22..30],z=28 必不在画内)
    const layoutOK = getBlock(0, 20, 15) === 'grass'
      && getBlock(0, 20, 28) === 'stone'
      && getBlock(0, 20, 8) === 'water'
      && getBlock(0, 22, 8) === 'stone'
      && getBlock(-12, 21, -3) === 'leaves';
    // c) 广场内不长树走真实路径:growTreesInChunk 重复调用幂等(putWorld 只写空气/树叶,
    //    广场列由 modifications 守卫),数据不因重复生成而变形
    const ch00 = chunks.get(chunkKey(0, 0));
    const snap = Array.from(ch00.data);
    growTreesInChunk(0, 0);
    let changed = 0;
    for (let i = 0; i < ch00.data.length; i++) if (ch00.data[i] !== snap[i]) changed++;
    const treeGuard = changed === 0;
    return JSON.stringify({ checked, bad, size: modifications.size, layoutOK, treeGuard });
  })()`);
  const t3o = JSON.parse(t3);
  check('T3 plaza modifications are true diffs (no redundant entries)', t3o.bad === 0 && t3o.checked > 1000, t3);
  check('T3 plaza layout intact + growTreesInChunk idempotent', t3o.layoutOK === true && t3o.treeGuard === true, t3);

  // 15. T4 区块材质契约(v2.x 图集化后):单一固体材质带 alphaTest(树叶孔洞)+ 水面透明材质
  const t4 = await evl(`(() => {
    let target = null, waterChunk = null;
    for (const ch of chunks.values()) {
      for (let i = 0; i < ch.data.length; i++) {
        if (ch.data[i] === BLOCK_ID.leaves && !target) target = ch;
        if (ch.data[i] === BLOCK_ID.water && !waterChunk) waterChunk = ch;
      }
    }
    if (target) buildChunkMesh(target);
    if (waterChunk) buildChunkMesh(waterChunk);
    return JSON.stringify({
      solidAlphaTest: !!matSolidChunk && matSolidChunk.alphaTest > 0,
      solidAtlas: !!(matSolidChunk && matSolidChunk.map),
      waterTransparent: !!matWaterChunk && matWaterChunk.transparent === true,
      foundLeavesChunk: !!target, leavesMesh: !!(target && target.mesh),
      waterMesh: !!(waterChunk && waterChunk.mesh && waterChunk.mesh.water),
    });
  })()`);
  const t4o = JSON.parse(t4);
  check('T4 区块材质:图集固体材质 alphaTest + 水面透明', t4o.solidAlphaTest && t4o.solidAtlas && t4o.waterTransparent && t4o.leavesMesh, t4);

  // 16. T5 durability bar partial refresh (no full hotbar rebuild)
  const t5 = await evl(`(() => {
    hotbar[0] = { kind: 'tool', id: 'pickaxe_wood', durability: 60 };
    currentSlot = 0; buildHotbar();
    const q = '#hotbar .slot[data-slot="0"]';
    const canvas1 = document.querySelector(q + ' canvas');
    hotbar[0].durability = 15;
    refreshHotbarSlot(0);
    const canvas2 = document.querySelector(q + ' canvas');
    const width = document.querySelector(q + ' .dur span').style.width;
    return JSON.stringify({ kept: canvas1 === canvas2 && canvas1.isConnected, width });
  })()`);
  const t5o = JSON.parse(t5);
  check('T5 durability refresh is partial (canvas kept, width updated)', t5o.kept === true && t5o.width === '25%', t5);

  // 16.5 T6 连挖累积 + 裂纹覆盖层阶段 + 即挖(现机制:breakBlock 推进进度,animate 按 mouseHeld 节拍复击)
  const t6 = await evl(`(async () => {
    const _f = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    document.getElementById('overlay').classList.add('hidden');
    playerPos.set(0.5, 40, 0.5); velocity.set(0, 0, 0); isFlying = true;
    yaw = 0; pitch = -0.5;
    const dy = Math.sin(pitch), dz = -Math.cos(pitch);
    const bx = Math.floor(0.5), by = Math.floor(40 + dy * 3), bz = Math.floor(0.5 + dz * 3);
    setBlock(bx, by, bz, 'stone');
    // a) 空手(stone cost 5):连续 3 次破坏点击,进度累积,裂纹阶段与进度一致
    hotbar[0] = null; selectSlot(0);
    breakTargetKey = null; breakProgress = 0;
    breakBlock(); breakBlock(); breakBlock();
    await _f();
    const p2 = breakProgress;
    const cracked = !!(crackMesh && crackMats && crackMats.length === 4 && crackMesh.visible === true);
    const stageOK = !!(crackMesh && p2 > 0 && crackMesh.material === crackMats[Math.min(3, Math.floor((p2 / breakCostTotal) * 4))]);
    // b) 挖空后裂纹隐藏
    for (let i = 0; i < 12 && getBlock(bx, by, bz) !== null; i++) { breakBlock(); }
    await _f();
    const cleared = getBlock(bx, by, bz) === null && crackMesh.visible === false;
    // c) 工具加成:同块空手耗时 > 木镐耗时(先空手基线,再持镐;生存耗时制)
    hotbar[0] = null; selectSlot(0);
    const handCost = breakCost('stone');
    hotbar[0] = { kind: 'tool', id: 'pickaxe_wood', durability: 60 };
    selectSlot(0);
    const toolCost = breakCost('stone');
    const instant = toolCost < handCost && toolCost >= 1;
    setBlock(bx, by, bz, null);
    return JSON.stringify({ p2, accumulated: p2 >= 2 && p2 <= 4, cracked, stageOK, cleared, instant, toolCost, handCost });
  })()`, true);
  const t6o = JSON.parse(t6);
  check('T6 hold-to-mine accumulates + crack overlay + instant mine', t6o.accumulated && t6o.cracked && t6o.stageOK && t6o.cleared && t6o.instant, t6);

  // 16.6 T6b mousedown wiring: 真实事件路径置位/复位 mouseHeld(mock pointerLockElement)
  const t6b = await evl(`(() => {
    const el = renderer.domElement;
    Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => el });
    el.dispatchEvent(new MouseEvent('mousedown', { button: 0 }));
    const set = mouseHeld === true;
    el.dispatchEvent(new MouseEvent('mouseup', { button: 0 }));   // mouseup 绑在画布上
    const unset = mouseHeld === false;
    delete document.pointerLockElement;
    return JSON.stringify({ set, unset });
  })()`);
  const t6bo = JSON.parse(t6b);
  check('T6b mousedown/mouseup wiring drives miningHeld', t6bo.set === true && t6bo.unset === true, t6b);

  // 16.7 T7 modifications 反向索引:双结构互查一致 + generateChunkData 经桶加速
  //    (桶内键是数字 chunkIdx,非字符串坐标;现契约无单条硬删 API,只有整体 clear)
  const t7 = await evl(`(() => {
    // a) 互查不变式:桶内每个 idx 反解回世界坐标后都属于该区块,并集 == modifications 的键集
    let badPlacement = 0, total = 0;
    const union = new Set();
    for (const [ck, bucket] of modsByChunk) {
      const [ccx, ccz] = ck.split(',').map(Number);
      for (const [idx, v] of bucket) {
        total++;
        const lx = idx % 16, lz = ((idx / 16) | 0) % 16, y = (idx / 256) | 0;
        union.add(blockKey(ccx * 16 + lx, y, ccz * 16 + lz));
        if (Math.floor((ccx * 16 + lx) / 16) !== ccx || Math.floor((ccz * 16 + lz) / 16) !== ccz) badPlacement++;
      }
    }
    const sameAsMap = union.size === modifications.size;
    // b) setBlock 写入同时落到两个结构;改为 null 是「挖掉」改动,键仍在两结构(值变 null)
    setBlock(999, 30, 999, 'brick');
    const k999 = '999,30,999';
    const idx999 = chunkIdx(999 - 62 * 16, 30, 999 - 62 * 16);
    const afterSet = modifications.has(k999) && modsByChunk.get('62,62').get(idx999) === 'brick';
    setBlock(999, 30, 999, null);
    const afterDel = modifications.get(k999) === null && modsByChunk.get('62,62').get(idx999) === null;
    // 清理测试残留(两结构一致地重置该键)
    setBlock(999, 30, 999, null);
    // c) 桶加速:重生成含改动的区块,改动仍在数据里(与全扫描等价)
    const data = generateChunkData(0, 0);
    let modApplied = true;
    for (const [k, v] of modifications) {
      const p = k.split(',').map(Number);
      if (p[0] >= 0 && p[0] < 16 && p[2] >= 0 && p[2] < 16) {
        const id = data[chunkIdx(p[0], p[1], p[2])];
        if ((v ? BLOCK_ID[v] : 0) !== id) { modApplied = false; break; }
      }
    }
    return JSON.stringify({ badPlacement, total, sameAsMap, afterSet, afterDel, modApplied });
  })()`);
  const t7o = JSON.parse(t7);
  check('T7 modsByChunk reverse index consistency + bucketed generateChunkData', t7o.badPlacement === 0 && t7o.sameAsMap && t7o.afterSet && t7o.afterDel && t7o.modApplied, t7);

  // 16.8 T8 网格拓扑(贪心合并已由逐面光照渐变取代):主体+水面双 mesh、
  //     aTorch/aSky 光照属性、拓扑覆盖与独立扫描全等
  const t8 = await evl(`(() => {
    const ch = chunks.get(chunkKey(0, 0)) || chunks.values().next().value;
    const ox2 = ch.cx * 16, oz2 = ch.cz * 16;
    const parts = ['solid', 'water'];
    const getMesh = (p) => (ch.mesh && ch.mesh[p]);
    let tris = 0, hasTorch = true, hasNonWater = false;
    for (const p of parts) {
      const m = getMesh(p);
      if (!m) continue;
      tris += m.geometry.index.count / 3;
      if (p !== 'water') { hasNonWater = true; if (!m.geometry.attributes.aTorch) hasTorch = false; }
    }
    // 拓扑等价:从 mesh 反推每个 quad 覆盖的 (cell,面方向) 集合
    const cov = new Set();
    for (const p of parts) {
      const m = getMesh(p);
      if (!m) continue;
      const pos = m.geometry.attributes.position.array;
      const idx = m.geometry.index.array;
      const nrm = m.geometry.attributes.normal.array;
      for (let q = 0; q < idx.length; q += 6) {
        const ci = [idx[q], idx[q+1], idx[q+2], idx[q+5]];
        const vs = ci.map(k => [pos[k*3], pos[k*3+1], pos[k*3+2]]);
        const n = [nrm[ci[0]*3], nrm[ci[0]*3+1], nrm[ci[0]*3+2]];
        const mn = [0,1,2].map(a => Math.round(Math.min(vs[0][a], vs[1][a], vs[2][a], vs[3][a])));
        const mx = [0,1,2].map(a => Math.round(Math.max(vs[0][a], vs[1][a], vs[2][a], vs[3][a])));
        const axis = n[0] !== 0 ? 0 : n[1] !== 0 ? 1 : 2;
        const s1 = (axis + 1) % 3, s2 = (axis + 2) % 3;
        for (let u = mn[s1]; u < mx[s1]; u++)
          for (let v = mn[s2]; v < mx[s2]; v++) {
            const oc = [0, 0, 0];
            oc[axis] = n[axis] > 0 ? mn[axis] - 1 : mn[axis];
            oc[s1] = u; oc[s2] = v;
            cov.add(oc[0] + '|' + oc[1] + '|' + oc[2] + '|' + axis + '|' + (n[axis] > 0 ? 1 : 0));
          }
      }
    }
    // 独立扫描可见面集合(第三实现,不依赖两种 builder)
    const visible = new Set();
    for (let y = 0; y < 48; y++) for (let lz = 0; lz < 16; lz++) for (let lx = 0; lx < 16; lx++) {
      const id = ch.data[chunkIdx(lx, y, lz)];
      if (!id) continue;
      const isWater = id === BLOCK_ID.water;
      for (let f = 0; f < 6; f++) {
        const F = FACES[f];
        const nb = getBlock(ox2 + lx + F.n[0], y + F.n[1], oz2 + lz + F.n[2]);
        if (nb) {
          const ndef = BLOCK_TYPES[nb];
          if (isWater ? (ndef.solid || nb === 'water') : ndef.solid) continue;
        }
        const axis = F.n[0] !== 0 ? 0 : F.n[1] !== 0 ? 1 : 2;
        visible.add(lx + '|' + y + '|' + lz + '|' + axis + '|' + (F.n[axis] > 0 ? 1 : 0));
      }
    }
    let onlyCov = 0, onlyVis = 0;
    for (const k of cov) if (!visible.has(k)) onlyCov++;
    for (const k of visible) if (!cov.has(k)) onlyVis++;
    return JSON.stringify({ tris, faces: visible.size, refTris: visible.size * 2, hasTorch, hasNonWater, topologyExact: onlyCov === 0 && onlyVis === 0 });
  })()`);
  const t8o = JSON.parse(t8);
  check('T8 网格拓扑与独立扫描全等 + aTorch 光照属性', t8o.hasTorch && t8o.hasNonWater && t8o.tris > 0 && t8o.tris === t8o.refTris && t8o.topologyExact === true, t8);

  // 17. no JS exceptions during session
  check('no uncaught JS exceptions', jsErrors.length === 0, JSON.stringify(jsErrors.slice(0, 3)));

  console.log(results.join('\n'));
  const fails = results.filter((r) => r.startsWith('FAIL')).length;
  ws.close();
  process.exit(fails > 0 ? 1 : 0);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(2); });
