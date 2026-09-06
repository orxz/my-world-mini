// ============================================================
// R51 视觉/视角修复回归(CDP,--remote-debugging-port=9333):
//   A 渲染树:相机入场景图(FP 手持可渲染)、手臂常驻、持物/空手
//   B 视角一致:第三人称相机 pitch=射线 pitch(准星对齐)、
//     正面视角 yaw+π、无 roll、fov 70
//   C 模型朝向:rotation.y=yaw+π、脸对准 forward、后脑在反方向
//   D 接地阴影:玩家贴地/悬空淡出/移动跟随、生物与掉落物生成、
//     清理无泄漏
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
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, timeout: 120000 });
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

  // ---- A 渲染树:相机/手臂/手持 ----
  const a1 = await evl(`camera.parent === scene`);
  check('A1 相机已入场景图(FP 手持可渲染)', a1 === true);

  await evl(`hotbar[0] = { kind: 'block', id: 'planks', count: 8 }; currentSlot = 0; selectSlot(0); buildHotbar(); updateHoldItem();`);
  const a2 = await evl(`(() => {
    const arm = holdGroup.userData.arm;
    const held = holdGroup.children.filter(c => c !== arm);
    const tp = playerModel.userData.heldMount.children.length;
    return { armIn: holdGroup.children.includes(arm), heldN: held.length, armVis: arm.visible, tp };
  })()`);
  check('A2 持物:手臂常驻 + FP 物品 1 件 + TP 右手 1 件', a2.armIn && a2.heldN === 1 && a2.tp === 1, JSON.stringify(a2));

  // 切槽位再回切(触发 updateHoldItem 重建)→ 手臂仍在
  const a3 = await evl(`(() => {
    hotbar[1] = { kind: 'block', id: 'stone', count: 4 }; selectSlot(1); selectSlot(0);
    const arm = holdGroup.userData.arm;
    return { armIn: holdGroup.children.includes(arm), n: holdGroup.children.length };
  })()`);
  check('A3 切槽重建后手臂保留', a3.armIn && a3.n === 2, JSON.stringify(a3));

  const a4 = await evl(`(() => {
    hotbar[0] = null; hotbar[1] = null; selectSlot(0); updateHoldItem();
    return holdGroup.children.length;   // 只剩手臂
  })()`);
  check('A4 空手:仅剩手臂(1)', a4 === 1, 'children=' + a4);

  // ---- B 视角一致 ----
  const b1 = await evl(`(() => {
    const out = [];
    for (const p of [-0.8, -0.18, 0.6]) {
      pitch = p; cameraMode = 1; updateThirdPersonCamera();
      out.push(Math.abs(camera.rotation.x - p));
    }
    return Math.max(...out);
  })()`);
  check('B1 第三人称相机 pitch 与瞄准射线一致(准星对齐)', b1 < 1e-9, 'maxErr=' + b1);

  const b2 = await evl(`(() => {
    yaw = 0.7; cameraMode = 2; updateThirdPersonCamera();
    return { y: Math.abs(camera.rotation.y - (yaw + Math.PI)), roll: camera.rotation.z, fov: camera.fov };
  })()`);
  check('B2 正面视角相机 yaw+π / 无 roll / fov70', b2.y < 1e-9 && b2.roll === 0 && b2.fov === 70, JSON.stringify(b2));

  // ---- C 模型朝向 ----
  const c1 = await evl(`(() => {
    cameraMode = 1; updateThirdPersonCamera();
    const face = new THREE.Vector3(0, 0, 1).applyQuaternion(playerModel.quaternion);   // 模型脸在本地 +z
    const back = new THREE.Vector3(0, 0, -1).applyQuaternion(playerModel.quaternion);  // 后脑
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    return {
      rot: Math.abs(playerModel.rotation.y - (yaw + Math.PI)),
      faceDot: face.x * fx + face.z * fz,
      backDot: back.x * fx + back.z * fz,
    };
  })()`);
  check('C1 模型 rotation.y=yaw+π 且脸对准朝向、后脑背向', c1.rot < 1e-9 && c1.faceDot > 0.999 && c1.backDot < -0.999, JSON.stringify(c1));

  // ---- D 接地阴影 ----
  const d1 = await evl(`(() => new Promise(res => requestAnimationFrame(() => res({
    vis: playerShadow.visible,
    dy: +(playerShadow.position.y - (playerPos.y - PLAYER_HEIGHT * 0.5)).toFixed(3),
    inScene: scene.children.includes(playerShadow),
  }))))()`);
  check('D1 玩家阴影可见且贴地(≤0.1)', d1.vis && d1.inScene && d1.dy >= 0 && d1.dy <= 0.1, JSON.stringify(d1));

  const d2 = await evl(`(() => {
    const feet = playerPos.y - PLAYER_HEIGHT * 0.5;
    updateBlobShadow(playerShadow, playerPos.x, playerPos.z, feet + 8);
    const airHidden = !playerShadow.visible;
    updateBlobShadow(playerShadow, playerPos.x, playerPos.z, feet);
    return { airHidden, grounded: playerShadow.visible };
  })()`);
  check('D2 悬空 8 格淡出 / 落地恢复', d2.airHidden && d2.grounded, JSON.stringify(d2));

  const d3 = await evl(`(() => {
    const px = Math.floor(playerPos.x), py = Math.floor(playerPos.y), pz = Math.floor(playerPos.z);
    const m = spawnMob(px + 4, py - 1, pz + 2, 'pig');
    const d = spawnDroppedItem(px + 2, py - 1, pz + 2, 'planks', 1);
    return new Promise(res => requestAnimationFrame(() => requestAnimationFrame(() => res({
      mob: !!m.shadow && scene.children.includes(m.shadow),
      mobVis: m.shadow.visible,
      drop: !!d.userData.shadow && scene.children.includes(d.userData.shadow),
      dropVis: d.userData.shadow.visible,
    }))));
  })()`);
  check('D3 生物/掉落物阴影生成且可见', d3.mob && d3.mobVis && d3.drop && d3.dropVis, JSON.stringify(d3));

  const d4 = await evl(`(() => {
    const before = scene.children.length;
    clearMobs(); clearDroppedItems();
    return { before, after: scene.children.length };
  })()`);
  check('D4 清理无泄漏(数量还原)', d4.after === d4.before - 4, JSON.stringify(d4));

  const d5 = await evl(`(() => {
    const sx = playerShadow.position.x;
    playerPos.x += 3;
    updateBlobShadow(playerShadow, playerPos.x, playerPos.z, playerPos.y - PLAYER_HEIGHT * 0.5);
    const moved = Math.abs(playerShadow.position.x - sx - 3) < 1e-6;
    playerPos.x -= 3;
    updateBlobShadow(playerShadow, playerPos.x, playerPos.z, playerPos.y - PLAYER_HEIGHT * 0.5);
    return moved;
  })()`);
  check('D5 阴影水平跟随实体', d5 === true);

  // 收尾:切回第一人称
  await evl(`cameraMode = 0; pitch = 0; yaw = 0;`);

  const fails = results.filter((r) => r.startsWith('FAIL'));
  console.log(results.join('\n'));
  console.log(fails.length === 0 ? `\n== R51 ALL ${results.length} PASS ==` : `\n== R51 ${fails.length} FAIL ==`);
  if (jsErrors.length) { console.log('JS ERRORS:', jsErrors.slice(0, 5).join('\n---\n')); process.exit(1); }
  ws.close();
  process.exit(fails.length === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
