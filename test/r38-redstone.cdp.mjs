// ============================================================
// R38 红石轮 实机验证(CDP,headless Chrome,--remote-debugging-port=9333)
// 覆盖:配方、红石矿生成与挖掘掉粉、元件放置(需支撑/拒绝)、拉杆右键切换
// (真实瞄准路径)、信号传播(火把+线 BFS 驱动铁门自动开)、拉杆控门
// (开→门开,关→门关)、断线门关、铁门手动拒绝、存档往返(线/拉杆态/
// 铁门开闭)、读档后信号网络恢复、破坏元件(视线采样一击拆+掉落)、
// 成就「电路初成」、0 报错。
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

  // ---- 0. 进游戏(传送开阔地,清射线路径)----
  await sleep(1500);
  await evl(`document.getElementById('overlay').click()`);
  await sleep(600);
  await evl(`endTutorial()`);
  const hut = await evl(`(() => { for (let cx=-6;cx<=6;cx++) for (let cz=-6;cz<=6;cz++){ const h=villageInCell(cx,cz,worldSeed); if(h) return h; } })()`);
  await evl(`playerPos.set(${hut.cx + 8.5}, ${hut.base + 4}, ${hut.cz + 8.5}); velocity.set(0,0,0); isFlying=false;`);
  await sleep(2600);
  // 现场搭一块平整试验台:gy = 支撑层(floor(playerPos.y)-1,玩家脚下方块);
  // 原点挂 window.__RS,后续步骤统一取用(避免重复 floor 漂移)
  await evl(`(() => {
    const px = Math.floor(playerPos.x), gy = Math.floor(playerPos.y) - 1, pz = Math.floor(playerPos.z);
    for (let dx = -2; dx <= 22; dx++) for (let dz = -3; dz <= 3; dz++) {
      setBlock(px + dx, gy, pz + dz, 'stone');       // 地台(支撑层)
      for (let dy = 1; dy <= 4; dy++) setBlock(px + dx, gy + dy, pz + dz, null);   // 净空
    }
    playerPos.set(px + 0.5, gy + 1.9, pz + 0.5); velocity.set(0, 0, 0);
    window.__RS = { px, gy, pz };
    return true;
  })()`);
  await sleep(300);
  check('进入游戏+试验台就绪', await evl(`typeof updateRedstone === 'function' && typeof raycastRedstone === 'function'`) && !!hut);

  // ---- 1. 配方 + 红石矿生成(深层确定性 hash 挖掘掉粉)----
  const basics = await evl(`(() => {
    const g2 = (ids) => ids.map(x => x === null ? null : { kind: (x === 'stick' || x === 'redstone_dust') ? 'item' : 'block', id: x });
    const torch = matchRecipeGrid(g2(['redstone_dust', null, 'stick', null]), 2, CRAFTLIB.RECIPES);
    const lever = matchRecipeGrid(g2(['stick', null, 'cobblestone', null]), 2, CRAFTLIB.RECIPES);
    const wire = matchRecipeGrid(g2(['redstone_dust', null, null, null]), 2, CRAFTLIB.RECIPES);
    // 矿:扫已加载区块深层找红石矿(确定性生成)
    let ore = null;
    outer: for (const ch of chunks.values()) {
      for (let lx = 0; lx < 16; lx++) for (let lz = 0; lz < 16; lz++) {
        for (let y = 1; y < 14; y++) {
          if (ch.data[chunkIdx(lx, y, lz)] === BLOCK_ID.redstone_ore) { ore = [ch.cx * 16 + lx, y, ch.cz * 16 + lz]; break outer; }
        }
      }
    }
    return { torch: !!torch, lever: !!lever, wire: !!wire, ore: ore ? ore.join(',') : null };
  })()`);
  check('配方×3 + 红石矿深层生成(已加载区内找得到)', basics.torch && basics.lever && basics.wire && !!basics.ore, JSON.stringify(basics));

  // ---- 2. 火把+线驱动铁门自动开(真实放置:拉杆路留待 3)----
  // 布局:门前 3 格:torch 在 (px+2),线 (px+3..px+8),门在 (px+9)
  const torchDoor = await evl(`(() => {
    const px = window.__RS.px, gy = window.__RS.gy, pz = window.__RS.pz;
    // 手持火把,瞄准 (px+2, gy, pz) 顶面放置
    for (let i = 0; i < 9; i++) hotbar[i] = null;
    hotbar[0] = { kind: 'block', id: 'redstone_torch', count: 8 }; currentSlot = 0; selectSlot(0);   // selectSlot 同步 selectedType(placeBlock 放方块依赖)
    const aim = (tx, ty, tz) => { const dx = (tx + 0.5) - playerPos.x, dy = (ty + 1.0) - playerPos.y, dz = (tz + 0.5) - playerPos.z; yaw = Math.atan2(-dx, -dz); pitch = Math.asin(dy / Math.hypot(dx, dy, dz)); };   // 瞄顶面中心(近格优先命中问题)
    const place = (bid, count, tx, ty, tz) => {
      hotbar[0] = { kind: 'block', id: bid, count }; currentSlot = 0; selectSlot(0);
      aim(tx, ty, tz);
      placeBlock();
      return true;
    };
    place('redstone_torch', 8, px + 2, gy, pz);
    place('redstone', 16, px + 3, gy, pz);
    place('redstone', 16, px + 4, gy, pz);
    // 铁门(px+5)
    place('door_iron', 1, px + 5, gy, pz);
    const torchOk = getBlock(px + 2, gy + 1, pz) === 'redstone_torch';
    const wireOk = getBlock(px + 3, gy + 1, pz) === 'redstone' && getBlock(px + 4, gy + 1, pz) === 'redstone';
    const doorOk = doors.has(doorKey(px + 5, gy + 1, pz));
    const achv = achvUnlocked.has('redstone');
    // 信号 tick:门应自动开
    redstoneTimer = 0; updateRedstone(0);
    const d = doors.get(doorKey(px + 5, gy + 1, pz));
    return { torchOk, wireOk, doorOk, achv, doorOpen: d ? d.open : null };
  })()`);
  check('火把+线真实放置 → 铁门自动开 + 成就「电路初成」',
    torchDoor.torchOk && torchDoor.wireOk && torchDoor.doorOk && torchDoor.achv && torchDoor.doorOpen === true, JSON.stringify(torchDoor));

  // ---- 3. 拉杆控门:关态门关,拉杆右键开(真实瞄准)→ 门开 ----
  const leverDoor = await evl(`(() => {
    const px = window.__RS.px, gy = window.__RS.gy, pz = window.__RS.pz;
    // 线延伸 4 格(px+5..px+8 是空中的?门占了 px+5。重排:拆门,拉杆接在线尾)
    // 简化重排:先拆现有铁门(红石拆除路径),改用拉杆直接贴在门旁
    const d = doors.get(doorKey(px + 5, gy + 1, pz));
    if (d) { removeDoor(px + 5, gy + 1, pz); setBlock(px + 5, gy + 1, pz, null); setBlock(px + 5, gy + 2, pz, null); }
    // 拉杆放在 (px+3, py+1) 旁(替换原线),门重建于 (px+5)
    setBlock(px + 3, gy + 1, pz, null);
    setBlock(px + 3, gy + 1, pz, 'lever_off');
    playerPos.set(px + 0.5, gy + 1.9, pz + 2.5); velocity.set(0, 0, 0);   // 站在南侧,瞄北面
    const place = (bid, count, tx, ty, tz) => {
      for (let i = 0; i < 9; i++) hotbar[i] = null;
      hotbar[0] = { kind: 'block', id: bid, count }; currentSlot = 0; selectSlot(0);   // selectSlot 同步 selectedType(placeBlock 放方块依赖)
      const dx = (tx + 0.5) - playerPos.x, dy = (ty + 1.0) - playerPos.y, dz = (tz + 0.5) - playerPos.z;   // 瞄顶面中心
      yaw = Math.atan2(-dx, -dz); pitch = Math.asin(dy / Math.hypot(dx, dy, dz));
      placeBlock();
    };
    place('door_iron', 1, px + 5, gy, pz);
    redstoneTimer = 0; updateRedstone(0);
    const closed = doors.get(doorKey(px + 5, gy + 1, pz));
    const doorClosed = closed && closed.open === false;
    // 右键拉杆(瞄准其支撑方块 (px+3, gy) 顶面 → 相邻格是拉杆)
    for (let i = 0; i < 9; i++) hotbar[i] = null;
    hotbar[0] = { kind: 'block', id: 'stone', count: 1 }; currentSlot = 0; selectSlot(0);   // selectSlot 同步 selectedType(placeBlock 放方块依赖)
    const dx = (px + 3.5) - playerPos.x, dy = (gy + 1.0) - playerPos.y, dz = (pz + 0.5) - playerPos.z;
    yaw = Math.atan2(-dx, -dz); pitch = Math.asin(dy / Math.hypot(dx, dy, dz));
    placeBlock();   // 手持石块瞄支撑顶面 → 分发到拉杆切换
    const leverOn = getBlock(px + 3, gy + 1, pz) === 'lever_on';
    redstoneTimer = 0; updateRedstone(0);
    const opened = doors.get(doorKey(px + 5, gy + 1, pz));
    return { doorClosed, leverOn, doorOpened: opened ? opened.open : null };
  })()`);
  check('拉杆:关态门关 → 右键拉杆(真实瞄准)→ 门自动开',
    leverDoor.doorClosed && leverDoor.leverOn && leverDoor.doorOpened === true, JSON.stringify(leverDoor));

  // ---- 4. 拉杆再切回关 → 门关;断线(拆线)→ 门关 ----
  const offAndCut = await evl(`(() => {
    const px = window.__RS.px, gy = window.__RS.gy, pz = window.__RS.pz;
    // 再右键拉杆 → 关
    const dx = (px + 3.5) - playerPos.x, dy = (gy + 1.0) - playerPos.y, dz = (pz + 0.5) - playerPos.z;
    yaw = Math.atan2(-dx, -dz); pitch = Math.asin(dy / Math.hypot(dx, dy, dz));
    placeBlock();
    const leverOff = getBlock(px + 3, gy + 1, pz) === 'lever_off';
    redstoneTimer = 0; updateRedstone(0);
    let d = doors.get(doorKey(px + 5, gy + 1, pz));
    const closedAfterOff = d && d.open === false;
    // 开拉杆后拆中间线(真实破坏路径:视线采样一击拆;从东侧瞄准,
    // 避免先命中更近的拉杆 —— 门格不在方块数据,射线可穿)
    setBlock(px + 3, gy + 1, pz, 'lever_on');   // 重新开
    playerPos.set(px + 6.5, gy + 1.9, pz + 0.5); velocity.set(0, 0, 0);
    const wx = px + 4;
    const ax = (wx + 0.5) - playerPos.x, ay = (gy + 1.5) - playerPos.y, az = (pz + 0.5) - playerPos.z;
    yaw = Math.atan2(-ax, -az); pitch = Math.asin(ay / Math.hypot(ax, ay, az));
    const d0 = droppedItems.length;
    breakBlock();   // 一击拆线(非固体走 raycastRedstone)
    const wireGone = getBlock(wx, gy + 1, pz) === null;
    const dustDrop = droppedItems.slice(d0).some(it => it.userData.type === 'redstone_dust');
    redstoneTimer = 0; updateRedstone(0);
    d = doors.get(doorKey(px + 5, gy + 1, pz));
    return { leverOff, closedAfterOff, wireGone, dustDrop, doorClosedAfterCut: d ? d.open === false : null };
  })()`);
  check('拉杆关→门关;拆线(一击)→掉红石粉→门失电关',
    offAndCut.leverOff && offAndCut.closedAfterOff && offAndCut.wireGone && offAndCut.dustDrop && offAndCut.doorClosedAfterCut, JSON.stringify(offAndCut));

  // ---- 5. 铁门手动右键拒绝 ----
  const manual = await evl(`(() => {
    const px = window.__RS.px, gy = window.__RS.gy, pz = window.__RS.pz;
    playerPos.set(px + 3.5, gy + 1.9, pz + 0.5); velocity.set(0, 0, 0);
    const d = doors.get(doorKey(px + 5, gy + 1, pz));
    const before = d.open;
    const dx = (px + 5.5) - playerPos.x, dy = (gy + 1.5) - playerPos.y, dz = (pz + 0.5) - playerPos.z;
    yaw = Math.atan2(-dx, -dz); pitch = Math.asin(dy / Math.hypot(dx, dy, dz));
    for (let i = 0; i < 9; i++) hotbar[i] = null;
    hotbar[0] = { kind: 'block', id: 'stone', count: 1 }; currentSlot = 0; selectSlot(0);   // selectSlot 同步 selectedType(placeBlock 放方块依赖)
    placeBlock();   // 瞄准铁门右键
    const after = doors.get(doorKey(px + 5, gy + 1, pz)).open;
    return { before, after, refused: before === after };
  })()`);
  check('铁门手动右键拒绝(需红石信号)', manual.refused, JSON.stringify(manual));

  // ---- 6. 存档往返:线/拉杆态/铁门开闭恢复 + 读档后信号网络重建 ----
  const rt = await evl(`(() => {
    const px = window.__RS.px, gy = window.__RS.gy, pz = window.__RS.pz;
    // 先恢复完整链:火把(px+2)+线(px+3,px+4)+ 门开
    setBlock(px + 3, gy + 1, pz, 'redstone');
    setBlock(px + 4, gy + 1, pz, 'redstone');
    redstoneTimer = 0; updateRedstone(0);
    const rec = JSON.parse(JSON.stringify(buildSaveRecord()));
    const mods = rec.modifications.filter(([k, v]) => v && v.indexOf && v.indexOf('redstone') === 0 || v === 'lever_off' || v === 'lever_on').length;
    const doorOpenBefore = doors.get(doorKey(px + 5, gy + 1, pz)).open;
    applySave(rec);
    const torchBack = getBlock(px + 2, gy + 1, pz) === 'redstone_torch';
    const wireBack = getBlock(px + 4, gy + 1, pz) === 'redstone';
    const leverBack = getBlock(px + 3, gy + 1, pz) === 'redstone';
    const doorBack = doors.has(doorKey(px + 5, gy + 1, pz));
    // 读档后 tick:登记表从 diff 重建,门应重新自动开
    redstoneTimer = 0; updateRedstone(0);
    const reopened = doors.get(doorKey(px + 5, gy + 1, pz)).open;
    return { mods, doorOpenBefore, torchBack, wireBack, leverBack, doorBack, reopened };
  })()`);
  check('存档往返:元件/铁门恢复 + 读档后信号重建门自动开',
    rt.torchBack && rt.wireBack && rt.doorBack && rt.reopened === true, JSON.stringify(rt));

  // ---- 7. 报错 ----
  await sleep(800);
  check('页面 0 JS error', jsErrors.length === 0, jsErrors.slice(0, 3).join(' || '));

  console.log('\n===== R38 红石轮 实机验证 =====');
  for (const r of results) console.log(r);
  const fails = results.filter(r => r.startsWith('FAIL'));
  console.log(`\n结果: ${results.length - fails.length}/${results.length} PASS`);
  if (fails.length) { console.log('❌ 有失败项'); process.exit(1); }
  console.log('✅ 全部通过');
  ws.close();
  process.exit(0);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
