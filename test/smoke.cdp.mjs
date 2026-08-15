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
  const st = await evl(`({ hidden: document.getElementById('overlay').classList.contains('hidden'), started: gameStarted })`);
  check('enterGame: overlay hidden + gameStarted', st.hidden === true && st.started === true, JSON.stringify(st));

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

  // 5. B3 cross-chunk tree write marks neighbor mesh dirty
  const t = await evl(`(() => {
    // 种子无关:在已加载区块中搜索自然地表列,归一化全部区块为"干净"后种树,
    // 校验"数据被写入的区块 meshDirty 必须变为 true"(B3 核心属性)
    for (let wx = -112; wx <= 112; wx += 4) for (let wz = -112; wz <= 112; wz += 4) {
      if (Math.abs(wx) < 40 && Math.abs(wz) < 40) continue;   // 避开出生广场(全被 modifications 覆盖)
      const ccx = Math.floor(wx / 16), ccz = Math.floor(wz / 16);
      if (!chunks.has(chunkKey(ccx, ccz))) continue;          // 只测试"已加载"区块上的跨区块写入
      const h = heightAt(wx, wz, worldSeed);
      if (h <= SEA_LEVEL) continue;
      const g = getBlock(wx, h, wz);
      if (!g || !['grass','dirt','sand','snow'].includes(g)) continue;
      if (isSolidAt(wx, h + 1, wz)) continue;
      if (modifications.has(wx + ',' + h + ',' + wz)) continue;
      const before = {};
      for (const [key, ch] of chunks) { ch.meshDirty = false; before[key] = Array.from(ch.data); }
      plantTreeAt(wx, h, wz);
      for (const [key, ch] of chunks) {
        for (let i = 0; i < ch.data.length; i++) {
          if (ch.data[i] !== before[key][i]) return { col: wx + ',' + wz + ',h' + h, wroteChunk: key, dirty: ch.meshDirty };
        }
      }
      return { col: wx + ',' + wz + ',h' + h, wroteNothing: true };
    }
    return 'no column';
  })()`);
  check('B3 tree write marks dirty on written chunk', t && t.dirty === true, JSON.stringify(t));

  // 6. B4 crop timers
  const c1 = await evl(`(() => { cropTimers.set('1000,20,1000', Date.now() - 61000); updateCrops(); return cropTimers.has('1000,20,1000'); })()`);
  const c2 = await evl(`(() => { cropTimers.set('3,25,3', Date.now() - 61000); updateCrops(); return !cropTimers.has('3,25,3'); })()`);
  const c3 = await evl(`(() => { setBlock(3, 22, 3, 'snow'); cropTimers.set('3,22,3', Date.now() - 61000); updateCrops(); return getBlock(3, 22, 3) === 'leaves' && !cropTimers.has('3,22,3'); })()`);
  check('B4 unloaded crop timer kept', c1 === true, 'c1=' + c1);
  check('B4 replaced crop timer cleaned', c2 === true, 'c2=' + c2);
  check('B4 crop matures + timer cleaned', c3 === true, 'c3=' + c3);

  // 7. B1 physics runs without pointer lock (touch path)
  const dy = await evl(`(() => {
    const el = renderer.domElement;
    window.__savedPL = el.requestPointerLock;
    el.requestPointerLock = undefined;
    gameStarted = true; isFlying = true; velocity.set(0, 0, 0);
    playerPos.y = 100; keys['Space'] = true;
    const y0 = playerPos.y;
    lastTime = performance.now() - 100; animate();
    lastTime = performance.now() - 100; animate();
    const moved = playerPos.y - y0;
    el.requestPointerLock = window.__savedPL;
    keys['Space'] = false;
    return moved;
  })()`);
  check('B1 physics runs without pointer lock', typeof dy === 'number' && dy > 0.5, 'dy=' + dy);

  // 8. B13 FOV setting applied
  const fov = await evl(`(() => { settings.fov = 85; loadSettings(); const f = camera.fov; settings.fov = 75; loadSettings(); return f; })()`);
  check('FOV setting applied to camera', fov === 85, 'fov=' + fov);

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

  // 10.5 crafting: tool recipe match + durability injection via performCraft
  const craft = await evl(`(() => {
    craftGrid[0] = { kind: 'block', id: 'planks' };
    craftGrid[1] = { kind: 'block', id: 'planks' };
    craftGrid[2] = { kind: 'block', id: 'planks' };
    craftGrid[3] = { kind: 'item', id: 'stick' };
    const r = matchRecipe();
    performCraft();
    const item = hotbar[currentSlot];
    const full = TOOL_TYPES.pickaxe_wood ? TOOL_TYPES.pickaxe_wood.durability : 60;
    return JSON.stringify({ matched: r ? r.name : null, slot: item ? item.kind + ':' + item.id : null, dur: item ? item.durability : null, full, gridCleared: craftGrid.every(x => x === null) });
  })()`);
  const craftObj = JSON.parse(craft);
  check('crafting: wood pickaxe + full durability injected', craftObj.matched === '木镐' && craftObj.slot === 'tool:pickaxe_wood' && craftObj.dur === craftObj.full && craftObj.gridCleared === true, craft);

  // 11. B13 respawn clears flying
  const rf = await evl(`(() => { isFlying = true; respawnPlayer(); return isFlying; })()`);
  check('respawn clears flying state', rf === false, 'isFlying=' + rf);

  // 12. T1 pause menu entry (touch ≡ path) + autosave only when dirty
  const t1 = await evl(`(() => {
    // 共用入口 showPauseMenu:菜单显示;无改动时不触发保存,有改动时才写库
    window.__saveCalls = 0;
    const orig = overwriteSave;
    overwriteSave = function() { window.__saveCalls++; return orig.apply(this, arguments); };
    saveDirty = false;
    showPauseMenu();
    const menuShown = !document.getElementById('pause-menu').classList.contains('hidden');
    const noSaveWhenClean = window.__saveCalls === 0;
    saveDirty = true;
    showPauseMenu();
    const savedWhenDirty = window.__saveCalls === 1;
    overwriteSave = orig;
    document.getElementById('pause-menu').classList.add('hidden');
    return JSON.stringify({ menuShown, noSaveWhenClean, savedWhenDirty });
  })()`);
  const t1obj = JSON.parse(t1);
  check('T1 showPauseMenu: menu shows + autosave only when dirty', t1obj.menuShown === true && t1obj.noSaveWhenClean === true && t1obj.savedWhenDirty === true, t1);

  // 13. T2 third-person camera respects settings.fov (was hardcoded 70)
  const fov3 = await evl(`(() => {
    const saved = settings.fov;
    settings.fov = 95;
    cameraMode = 1;
    updateThirdPersonCamera();
    const f = camera.fov;
    cameraMode = 0;
    settings.fov = saved;
    camera.fov = saved; camera.updateProjectionMatrix();
    return f;
  })()`);
  check('T2 third-person camera uses settings.fov (not hardcoded 70)', fov3 === 95, 'fov=' + fov3);

  // 14. T3 spawn plaza stores only diffs vs natural terrain + layout intact + no trees in disk
  const t3 = await evl(`(() => {
    // 采样列所在区块先确保加载(save/load 后玩家在远处,原点周边可能已卸载)
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) ensureChunk(dx, dz);
    // a) 差量不变式:每条广场改动都必须与自然地形不同(否则是冗余条目)
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
    // c) 广场圆盘内不长树:对广场内草地列直接种树,应被半径守卫拦下(数据不变)
    const ch = chunks.get(chunkKey(0, 0));
    const i0 = ch ? ch.data[chunkIdx(5, 21, 5)] : 0;
    plantTreeAt(5, 20, 5);
    const i1 = ch ? ch.data[chunkIdx(5, 21, 5)] : 0;
    return JSON.stringify({ checked, bad, size: modifications.size, layoutOK, treeGuard: i0 === i1 });
  })()`);
  const t3o = JSON.parse(t3);
  check('T3 plaza modifications are true diffs (no redundant entries)', t3o.bad === 0 && t3o.checked > 1000, t3);
  check('T3 plaza layout intact + no tree planted inside disk', t3o.layoutOK === true && t3o.treeGuard === true, t3);

  // 15. T4 chunk materials split: opaque solids / alphaTest leaves / transparent water
  const t4 = await evl(`(() => {
    let target = null;
    for (const ch of chunks.values()) {
      for (let i = 0; i < ch.data.length; i++) if (ch.data[i] === BLOCK_ID.leaves) { target = ch; break; }
      if (target) break;
    }
    let leavesMesh = false;
    if (target) { buildChunkMesh(target); leavesMesh = !!(target.mesh && target.mesh.leaves); }
    return JSON.stringify({
      solidOpaque: !!matSolidChunk && matSolidChunk.transparent !== true && !matSolidChunk.alphaTest,
      leavesMat: !!matLeavesChunk && matLeavesChunk.alphaTest > 0,
      waterTransparent: !!matWaterChunk && matWaterChunk.transparent === true,
      foundLeavesChunk: !!target, leavesMesh,
    });
  })()`);
  const t4o = JSON.parse(t4);
  check('T4 chunk materials split (opaque/leaves/water)', t4o.solidOpaque && t4o.leavesMat && t4o.waterTransparent && (!t4o.foundLeavesChunk || t4o.leavesMesh), t4);

  // 16. T5 durability bar partial refresh (no full hotbar rebuild)
  const t5 = await evl(`(() => {
    hotbar[0] = { kind: 'tool', id: 'pickaxe_wood', durability: 60 };
    currentSlot = 0; buildHotbar();
    const q = '#hotbar .slot[data-slot="0"]';
    const canvas1 = document.querySelector(q + ' canvas');
    hotbar[0].durability = 15;
    refreshSlotDurability(0);
    const canvas2 = document.querySelector(q + ' canvas');
    const width = document.querySelector(q + ' .dur span').style.width;
    return JSON.stringify({ kept: canvas1 === canvas2 && canvas1.isConnected, width });
  })()`);
  const t5o = JSON.parse(t5);
  check('T5 durability refresh is partial (canvas kept, width updated)', t5o.kept === true && t5o.width === '25%', t5);

  // 16.5 T6 hold-to-mine: auto re-hit + crack overlay stage + instant mining
  const t6 = await evl(`(async () => {
    const _s = (ms) => new Promise((r) => setTimeout(r, ms));
    const _f = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    document.getElementById('overlay').classList.add('hidden');
    playerPos.set(0.5, 40, 0.5); velocity.set(0, 0, 0); isFlying = true;
    yaw = 0; pitch = -0.5;
    const dy = Math.sin(pitch), dz = -Math.cos(pitch);
    const bx = Math.floor(0.5), by = Math.floor(40 + dy * 3), bz = Math.floor(0.5 + dz * 3);
    setBlock(bx, by, bz, 'stone');
    // a) 空手(stone cost 5):首击 + 按住自动复击(250ms 节拍),进度累积,裂纹阶段与进度一致
    hotbar[0] = null; selectSlot(0);
    miningHeld = true; lastMiningTick = performance.now(); breakBlock();
    await _s(700);
    miningHeld = false; await _f();          // 停拍后读稳定状态(animate 已按当前进度刷新裂纹)
    const p2 = breakProgress;                // 手动首击 + ~2 次节拍复击(慢帧容忍 2..4)
    const cracked = !!(crackMesh && crackTextures && crackTextures.length === 10 && crackMesh.visible === true);
    const stageOK = !!(crackMesh && crackMesh.material.map === crackTextures[Math.min(9, Math.floor((p2 / breakTargetCost) * 10))]);
    // b) 挖空后裂纹隐藏
    for (let i = 0; i < 12 && getBlock(bx, by, bz) !== null; i++) { breakBlock(); }
    await _f();
    const cleared = getBlock(bx, by, bz) === null && crackMesh.visible === false;
    // c) Instant Mining:木镐对石头一击即碎
    hotbar[0] = { kind: 'tool', id: 'pickaxe_wood', durability: 60 };
    selectSlot(0);
    setBlock(bx, by, bz, 'stone');
    breakTargetKey = null; breakProgress = 0;
    breakBlock();
    const instant = getBlock(bx, by, bz) === null && breakProgress === 0;
    setBlock(bx, by, bz, null);
    return JSON.stringify({ p2, accumulated: p2 >= 2 && p2 <= 4, cracked, stageOK, cleared, instant });
  })()`, true);
  const t6o = JSON.parse(t6);
  check('T6 hold-to-mine accumulates + crack overlay + instant mine', t6o.accumulated && t6o.cracked && t6o.stageOK && t6o.cleared && t6o.instant, t6);

  // 16.6 T6b mousedown wiring: 真实事件路径置位/复位 miningHeld(mock pointerLockElement)
  const t6b = await evl(`(() => {
    const el = renderer.domElement;
    Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => el });
    el.dispatchEvent(new MouseEvent('mousedown', { button: 0 }));
    const set = miningHeld === true;
    window.dispatchEvent(new MouseEvent('mouseup', { button: 0 }));
    const unset = miningHeld === false;
    delete document.pointerLockElement;
    return JSON.stringify({ set, unset });
  })()`);
  const t6bo = JSON.parse(t6b);
  check('T6b mousedown/mouseup wiring drives miningHeld', t6bo.set === true && t6bo.unset === true, t6b);

  // 16.7 T7 modifications 反向索引:双结构互查一致 + generateChunkData 经桶加速
  const t7 = await evl(`(() => {
    // a) 互查不变式:每个桶键都属于该区块,且并集 == modifications 的键集
    let badPlacement = 0, total = 0;
    for (const [ck, s] of modsByChunk) {
      const [ccx, ccz] = ck.split(',').map(Number);
      for (const k of s) {
        total++;
        const p = k.split(',').map(Number);
        if (Math.floor(p[0] / 16) !== ccx || Math.floor(p[2] / 16) !== ccz) badPlacement++;
      }
    }
    const union = new Set();
    for (const s of modsByChunk.values()) for (const k of s) union.add(k);
    const sameAsMap = union.size === modifications.size;
    // b) setBlock 写入同时落到两个结构;改为 null 是「挖掉」改动,键仍在两结构(值变 null)
    setBlock(999, 30, 999, 'brick');
    const afterSet = modifications.has('999,30,999') && modsByChunk.get('62,62').has('999,30,999');
    setBlock(999, 30, 999, null);
    const afterDel = modifications.get('999,30,999') === null && modsByChunk.get('62,62').has('999,30,999');
    modsDelete('999,30,999');   // 真删除:两结构同步移除、空桶回收
    const afterHardDel = !modifications.has('999,30,999') && !modsByChunk.get('62,62');
    // c) 桶加速:重生成含改动的区块,改动仍在数据里(与全扫描等价)
    const data = generateChunkData(0, 0);
    let modApplied = true;
    for (const [k, v] of modifications) {
      const p = k.split(',').map(Number);
      if (p[0] >= 0 && p[0] < 16 && p[2] >= 0 && p[2] < 16) {
        const id = data[chunkIdx(p[0] - 0, p[1], p[2] - 0)];
        if ((v ? BLOCK_ID[v] : 0) !== id) { modApplied = false; break; }
      }
    }
    return JSON.stringify({ badPlacement, total, sameAsMap, afterSet, afterDel, afterHardDel, modApplied });
  })()`);
  const t7o = JSON.parse(t7);
  check('T7 modsByChunk reverse index consistency + bucketed generateChunkData', t7o.badPlacement === 0 && t7o.sameAsMap && t7o.afterSet && t7o.afterDel && t7o.afterHardDel && t7o.modApplied, t7);

  // 16.8 T8 greedy meshing: aTile 属性 + 三角形数下降 + 拓扑覆盖与独立扫描全等
  const t8 = await evl(`(() => {
    const ch = chunks.get(chunkKey(0, 0)) || chunks.values().next().value;
    const ox2 = ch.cx * 16, oz2 = ch.cz * 16;
    let tris = 0, hasTile = true, hasNonWater = false;
    for (const p of ['solid', 'leaves', 'water']) {
      const m = ch.mesh && ch.mesh[p];
      if (!m) continue;
      tris += m.geometry.index.count / 3;
      if (p !== 'water') { hasNonWater = true; if (!m.geometry.attributes.aTile) hasTile = false; }
    }
    // 拓扑等价:从 mesh 反推每个 quad 覆盖的 (cell,面方向) 集合
    const cov = new Set();
    for (const p of ['solid', 'leaves', 'water']) {
      const m = ch.mesh && ch.mesh[p];
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
    return JSON.stringify({ tris, faces: visible.size, refTris: visible.size * 2, hasTile, hasNonWater, reduced: tris < visible.size * 2, topologyExact: onlyCov === 0 && onlyVis === 0 });
  })()`);
  const t8o = JSON.parse(t8);
  check('T8 greedy meshing: aTile attr + tris reduced + topology == independent scan', t8o.hasTile && t8o.hasNonWater && t8o.reduced && t8o.tris > 0 && t8o.topologyExact === true, t8);

  // 17. no JS exceptions during session
  check('no uncaught JS exceptions', jsErrors.length === 0, JSON.stringify(jsErrors.slice(0, 3)));

  console.log(results.join('\n'));
  const fails = results.filter((r) => r.startsWith('FAIL')).length;
  ws.close();
  process.exit(fails > 0 ? 1 : 0);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(2); });
