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
//   损坏存档防御(B12)、FOV 设置、死亡重生状态、无未捕获异常。
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
      const h = heightAt(wx, wz, worldSeed, biomeAt(wx, wz, worldSeed));
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

  // 11. B13 respawn clears flying
  const rf = await evl(`(() => { isFlying = true; respawnPlayer(); return isFlying; })()`);
  check('respawn clears flying state', rf === false, 'isFlying=' + rf);

  // 12. no JS exceptions during session
  check('no uncaught JS exceptions', jsErrors.length === 0, JSON.stringify(jsErrors.slice(0, 3)));

  console.log(results.join('\n'));
  const fails = results.filter((r) => r.startsWith('FAIL')).length;
  ws.close();
  process.exit(fails > 0 ? 1 : 0);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(2); });
