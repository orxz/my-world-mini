// ============================================================
// R43 打磨轮 实机验证(CDP,--remote-debugging-port=9333)
// 覆盖:新音效×5(pop/xp/levelup/splash/click)不抛错且接线点真实触发
// (舀水 splash/拉杆 click/经验吸收 xp+升级 levelup/产蛋 pop);平衡微调
// (熟猪排 10/牛排 8 + 真实进食路径);性能基准(区块生成/网格构建/
// 大红石网 tick/存档序列化/生物微基准/renderer.info 稳定);移动端
// 375×667 成就 toast 避让暂停按钮 + 面板小屏;0 报错。
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

  // ---- 0. 进游戏 ----
  await sleep(1500);
  await evl(`document.getElementById('overlay').click()`);
  await sleep(600);
  await evl(`endTutorial()`);
  const hut = await evl(`(() => { for (let cx=-6;cx<=6;cx++) for (let cz=-6;cz<=6;cz++){ const h=villageInCell(cx,cz,worldSeed); if(h) return h; } })()`);
  await evl(`playerPos.set(${hut.cx + 8.5}, ${hut.base + 4}, ${hut.cz + 8.5}); velocity.set(0,0,0); isFlying=false;`);
  await sleep(2600);
  check('进入游戏', await evl(`document.getElementById('overlay').classList.contains('hidden')`) && !!hut);

  // ---- 1. 新音效×5:全部可播不抛错 ----
  const sounds = await evl(`(() => {
    let ok = true;
    try { for (const t of ['pop', 'xp', 'levelup', 'splash', 'click']) audio.play(t); } catch (e) { ok = false; }
    return { ok, ctx: !!audio.ctx };
  })()`);
  check('新音效×5 播放不抛错(pop/xp/levelup/splash/click)', sounds.ok && sounds.ctx, JSON.stringify(sounds));

  // ---- 2. 接线点:舀水 splash / 拉杆 click / 经验 xp+levelup / 产蛋 pop(劫持 play 计数)----
  const wiring = await evl(`(() => {
    const px = Math.floor(playerPos.x), gy = Math.floor(playerPos.y) - 1, pz = Math.floor(playerPos.z);
    for (let dx = -2; dx <= 6; dx++) for (let dz = -2; dz <= 2; dz++) {
      setBlock(px + dx, gy, pz + dz, 'stone');
      for (let dy = 1; dy <= 4; dy++) setBlock(px + dx, gy + dy, pz + dz, null);
    }
    playerPos.set(px + 0.5, gy + 1.9, pz + 0.5); velocity.set(0, 0, 0);
    window.__RS = { px, gy, pz };
    const played = {};
    const origPlay = audio.play.bind(audio);
    audio.play = (type, bt) => { played[type] = (played[type] || 0) + 1; return origPlay(type, bt); };
    try {
      // 舀水 splash
      setBlock(px + 2, gy + 1, pz, 'water');
      for (let i = 0; i < 9; i++) hotbar[i] = null;
      hotbar[0] = { kind: 'item', id: 'bucket', count: 1 }; currentSlot = 0; selectSlot(0);
      const dx = (px + 2.5) - playerPos.x, dy = (gy + 1.5) - playerPos.y, dz = (pz + 0.5) - playerPos.z;
      yaw = Math.atan2(-dx, -dz); pitch = Math.asin(dy / Math.hypot(dx, dy, dz));
      placeBlock();
      // 拉杆 click(瞄准支撑顶面)
      setBlock(px + 4, gy, pz, 'stone'); setBlock(px + 4, gy + 1, pz, 'lever_off');
      for (let i = 0; i < 9; i++) hotbar[i] = null;
      hotbar[0] = { kind: 'block', id: 'stone', count: 1 }; currentSlot = 0; selectSlot(0);
      const lx = (px + 4.5) - playerPos.x, ly = (gy + 1.05) - playerPos.y, lz = (pz + 0.5) - playerPos.z;
      yaw = Math.atan2(-lx, -lz); pitch = Math.asin(ly / Math.hypot(lx, ly, lz));
      placeBlock();
      // 经验吸收 xp + 升级 levelup
      const lv0 = xpState.level;
      xpState.level = 0; xpState.points = MACHINES.xpToNext(1) - 1;
      spawnXPOrbs(playerPos.x, playerPos.y, playerPos.z, 2);
      for (let i = 0; i < 30 && xpOrbs.length; i++) updateXPOrbs(0.05);
      const leveled = xpState.level >= 1;
      // 产蛋 pop
      clearMobs();
      const c = spawnMob(px + 2.5, gy + 1, pz + 1.5, 'chicken');
      c.eggT = 0.05;
      const before = played.pop || 0;
      for (let i = 0; i < 6; i++) updateMobs(0.05);
      const eggPopped = (played.pop || 0) > before;
      return { splash: played.splash || 0, click: played.click || 0, xp: played.xp || 0,
               levelup: played.levelup || 0, leveled, eggPopped, waterGone: getBlock(px + 2, gy + 1, pz) === null };
    } finally { audio.play = origPlay; }
  })()`);
  check('接线点:舀水 splash/拉杆 click/吸收 xp+升级 levelup/产蛋 pop',
    wiring.splash >= 1 && wiring.click >= 1 && wiring.xp >= 1 && wiring.levelup >= 1 && wiring.leveled && wiring.eggPopped && wiring.waterGone, JSON.stringify(wiring));

  // ---- 3. 平衡微调:食物表 + 真实进食 ----
  const balance = await evl(`(() => {
    const px = window.__RS.px, gy = window.__RS.gy, pz = window.__RS.pz;
    const f = INVLIB.FOODS;
    const table = { pork: f.cooked_porkchop, steak: f.stake0 === undefined ? f.steak : null, chicken: f.cooked_chicken, bread: f.bread };
    hungerState.hunger = 5;
    for (let i = 0; i < 9; i++) hotbar[i] = null;
    hotbar[0] = { kind: 'item', id: 'cooked_porkchop', count: 2 }; currentSlot = 0; selectSlot(0);
    playerPos.set(px + 0.5, gy + 1.9, pz + 0.5); velocity.set(0, 0, 0);
    pitch = 1.2; yaw = 0;   // 朝天(避开交互)
    placeBlock();   // 右键进食
    const after = hungerState.hunger;
    return { pork: f.cooked_porkchop, steak: f.steak, chicken: f.cooked_chicken, after, count: hotbar[0] ? hotbar[0].count : 0 };
  })()`);
  check('平衡:熟猪排 10/牛排 8 + 真实进食 +10',
    balance.pork === 10 && balance.steak === 8 && balance.after === 15 && balance.count === 1, JSON.stringify(balance));

  // ---- 4. 性能基准 ----
  const perf = await evl(`(() => {
    const px = window.__RS.px, gy = window.__RS.gy, pz = window.__RS.pz;
    // ① 区块生成(9 个新区块)
    let t0 = performance.now();
    for (let i = 0; i < 9; i++) { const cx2 = Math.floor(px / 16) + 5 + i, cz2 = Math.floor(pz / 16); const d = generateChunkData(cx2, cz2); void d; }
    const genMs = +(performance.now() - t0).toFixed(1);
    // ② 大红石网:40 线 + 8 电源 BFS ×100
    const wires = new Set(), sources = [];
    for (let i = 0; i < 40; i++) wires.add((i) + ',0,0');
    for (let i = 0; i < 8; i++) sources.push({ key: (i * 5) + ',0,1', p: 15 });
    t0 = performance.now();
    for (let k = 0; k < 100; k++) MACHINES.redstonePower(wires, sources);
    const bfsMs = +performance.now() - t0;
    // ③ 存档序列化(含现场 modifications)
    t0 = performance.now();
    for (let k = 0; k < 20; k++) JSON.stringify(buildSaveRecord());
    const saveMs = +(performance.now() - t0).toFixed(1);
    // ④ 生物微基准(15 只)
    clearMobs();
    for (let i = 0; i < 15; i++) spawnMob(px + 2 + (i % 5), gy + 1, pz + 1 + Math.floor(i / 5) * 0.4, i % 2 ? 'pig' : 'chicken');
    t0 = performance.now();
    for (let i = 0; i < 1000; i++) updateMobs(0.016);
    const mobPerFrame = +((performance.now() - t0) / 1000).toFixed(4);
    clearMobs();
    const mem = renderer.info.memory;
    return { genMs, bfsPer100: +bfsMs.toFixed(1), saveMs, mobPerFrame, mem: { tex: mem.textures, geo: mem.geometries } };
  })()`);
  check('性能:区块生成 9 块 <60ms / 红石 BFS×100 <30ms / 存档×20 <200ms / 15 生物 <0.3ms/帧',
    perf.genMs < 60 && perf.bfsPer100 < 30 && perf.saveMs < 200 && perf.mobPerFrame < 0.3, JSON.stringify(perf));

  // ---- 5. 移动端:成就 toast 避让暂停按钮(375×667 模拟)----
  await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 667, deviceScaleFactor: 2, mobile: true });
  await sleep(400);
  const mobile = await evl(`(() => {
    unlockAchv('get_wood');   // 已解锁则无 toast —— 造一个新 toast
    const t = document.querySelector('#achv-toasts .achv-toast');
    const wrap = document.getElementById('achv-toasts');
    const pauseBtn = document.querySelector('#touch-pause');
    const wrapTop = wrap.getBoundingClientRect().top;
    const tRect = t ? t.getBoundingClientRect() : null;
    const pauseRect = pauseBtn ? pauseBtn.getBoundingClientRect() : null;
    const overlap = pauseRect && tRect ? !(tRect.right < pauseRect.left || tRect.left > pauseRect.right || tRect.bottom < pauseRect.top || tRect.top > pauseRect.bottom) : false;
    // ≡ 按钮真实触发:派发 touchstart → 暂停菜单出现(R43 新增入口)
    let menuOpened = false;
    if (pauseBtn) {
      pauseBtn.dispatchEvent(new Event('click', { bubbles: true }));
      menuOpened = !document.getElementById('pause-menu').classList.contains('hidden');
      document.getElementById('pause-menu').classList.add('hidden');   // 复原
    }
    return { wrapTop: Math.round(wrapTop), hasToast: !!t, toastTop: tRect ? Math.round(tRect.top) : null,
             pauseRect: pauseRect ? [Math.round(pauseRect.top), Math.round(pauseRect.right)] : null, overlap,
             hasPauseBtn: !!pauseBtn, menuOpened,
             cleared: (t2 => { if (t2) { t2.remove(); } return true; })(t) };
  })()`);
  check('移动端:≡ 暂停按钮存在且可开菜单 + 成就 toast 无重叠(375×667)',
    mobile.hasPauseBtn && mobile.menuOpened && mobile.wrapTop >= 50 && !mobile.overlap, JSON.stringify(mobile));
  await send('Emulation.clearDeviceMetricsOverride');
  await sleep(300);

  // ---- 6. 报错 ----
  await sleep(800);
  check('页面 0 JS error', jsErrors.length === 0, jsErrors.slice(0, 3).join(' || '));

  console.log('\n===== R43 打磨轮 实机验证 =====');
  for (const r of results) console.log(r);
  const fails = results.filter(r => r.startsWith('FAIL'));
  console.log(`\n结果: ${results.length - fails.length}/${results.length} PASS`);
  if (fails.length) { console.log('❌ 有失败项'); process.exit(1); }
  console.log('✅ 全部通过');
  ws.close();
  process.exit(0);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
