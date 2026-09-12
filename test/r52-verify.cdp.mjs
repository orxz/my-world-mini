// ============================================================
// R52 视角修复复验(CDP,--remote-debugging-port=9333):
//   V1 正面视角 A/D 横移镜像(W/S 已反,A/D 须同步反)
//   V2 TP 构图:距离 4.0 / 高度 +0.55
//   V3 贴墙淡出:safe≤1.0 全隐、≥1.8 全显、材质 opacity 联动
//   V4 触屏 🎥 切视角按钮:存在 + 点击循环三视角
//   V5 R51 不回退:TP 相机 pitch 与挖掘射线 pitch 平行、模型朝向
// 截图:/tmp/r52v/*.png
// ============================================================
import { writeFileSync, mkdirSync } from 'fs';
const CDP = 'http://127.0.0.1:9333';
const OUT = '/tmp/r52v';
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.error('[dbg] main start');
  let targets = null;
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(CDP + '/json/list');
      targets = await res.json();
      if (targets.find((t) => t.type === 'page' && t.url.includes('index.html'))) break;
    } catch (e) { /* retry */ }
    await sleep(500);
  }
  // 全新 Chrome(只有 about:blank)没有 index.html 页:先导航再重新取 target。
  // file:// 导航可能替换 page target(旧 webSocketDebuggerUrl 失效会挂死),
  // 故导航用临时连接,完成后重新列表、重连主 ws
  if (!targets.find((t) => t.type === 'page' && t.url.includes('index.html'))) {
    const any = targets && targets.find((t) => t.type === 'page');
    if (!any) { console.error('FATAL: no page target'); process.exit(1); }
    await new Promise((res) => {
      const w = new WebSocket(any.webSocketDebuggerUrl);
      w.onopen = () => w.send(JSON.stringify({ id: 1, method: 'Page.enable' }));
      w.onmessage = (ev) => {
        const m = JSON.parse(ev.data);
        if (m.id === 1) w.send(JSON.stringify({ id: 2, method: 'Page.navigate', params: { url: 'file://' + process.cwd() + '/index.html' } }));
        if (m.id === 2) { w.close(); res(); }
      };
      w.onerror = () => res();
    });
    await sleep(2500);
    for (let i = 0; i < 20; i++) {
      targets = await (await fetch(CDP + '/json/list')).json();
      if (targets.find((t) => t.type === 'page' && t.url.includes('index.html'))) break;
      await sleep(500);
    }
  }
  const page = targets && targets.find((t) => t.type === 'page' && t.url.includes('index.html'));
  if (!page) { console.error('FATAL: no index.html page after navigate'); process.exit(1); }
  console.error('[dbg] page:', page.id.slice(0, 8));

  let ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  console.error('[dbg] ws open');
  let id = 0;
  const pending = new Map();
  const jsErrors = [];
  const attachWs = () => {
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
      else if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params.exceptionDetails;
        jsErrors.push((d.exception && d.exception.description) || d.text);
      }
    };
  };
  attachWs();
  const send = (method, params = {}) => new Promise((res, rej) => {
    const mid = ++id; pending.set(mid, res);
    // CDP 无响应兜底:页面导航/WS 失效时 send 会永久 pending,超时抛错暴露挂点
    setTimeout(() => {
      if (pending.has(mid)) { pending.delete(mid); rej(new Error('CDP timeout: ' + method)); }
    }, 15000);
    try { ws.send(JSON.stringify({ id: mid, method, params })); }
    catch (e) { pending.delete(mid); rej(e); }
  });
  const evl = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, timeout: 60000 });
    if (r.result.exceptionDetails) throw new Error('EVAL: ' + JSON.stringify(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text));
    return r.result.result.value;
  };
  await send('Runtime.enable');
  await send('Page.enable');
  const shot = async (name) => {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    const data = r && (r.data || r.result && r.result.data);
    if (data) { writeFileSync(OUT + '/' + name + '.png', Buffer.from(data, 'base64')); console.log('SHOT', name); }
    else console.log('SHOT-FAIL', name);
  };

  // 页面已是 index.html(如 Chrome 以游戏页为初始标签启动)时直接复用当前连接:
  // navigate/reload 都会令 file:// 页的 page-level WS 失效(旧连接 evaluate 永久
  // 挂死),且重连在窗口被系统回收的环境下不稳定 —— 只在必要时才导航
  const wasFreshGame = targets.find((t) => t.type === 'page' && t.url.includes('index.html'));
  if (wasFreshGame) {
    // 已是刚启动的游戏页(全新 profile,无缓存顾虑):等游戏就绪即可
    await sleep(2500);
  } else {
    await send('Page.navigate', { url: 'file://' + process.cwd() + '/index.html?fresh=' + Date.now() });
    try { ws.close(); } catch (e) { /* already closed */ }
    await sleep(3000);
    for (let i = 0; i < 20; i++) {
      const list = await (await fetch(CDP + '/json/list')).json();
      const again = list.find((t) => t.type === 'page' && t.url.includes('index.html'));
      if (again) { ws = new WebSocket(again.webSocketDebuggerUrl); break; }
      await sleep(500);
    }
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    attachWs();
    await send('Runtime.enable');
    await send('Page.enable');
  }
  // 页面必须在前台 tab:后台页的 captureScreenshot 会永久不响应(实测挂点)
  await send('Page.bringToFront');
  console.error('[dbg] ready');
  // 刚启动的游戏页在同步初始化(世界生成),evaluate 会排队:轮询等主线程空闲
  for (let i = 0; i < 8; i++) {
    try { await evl('1+1'); break; } catch (e) { await sleep(2000); }
  }
  await evl(`document.getElementById('overlay').click()`);
  await sleep(800);
  await evl(`endTutorial()`);

  const results = [];
  const check = (name, cond, extra = '') => results.push((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' | ' + extra : ''));

  // 统一姿态:广场上方高空(无遮挡、无上局存档残留墙),yaw=0 朝 -z
  await evl(`(() => {
    const y = Math.floor(playerPos.y) + 10;
    playerPos.set(12.5, y, 12.5); velocity.set(0,0,0); yaw = 0; pitch = 0;
    return true;
  })()`);
  await sleep(400);

  // ---- V1 移动镜像 ----
  const probe = async (mode, key) => evl(`(() => {
    cameraMode = ${mode}; yaw = 0; pitch = 0; velocity.set(0,0,0); isFlying = true;
    Object.keys(keys).forEach(k => delete keys[k]);
    keys[${JSON.stringify(key)}] = true;
    updatePlayer(0.016, 0);
    Object.keys(keys).forEach(k => delete keys[k]); isFlying = false;
    return [+(velocity.x.toFixed(2)), +(velocity.z.toFixed(2))];
  })()`);
  const m0 = { W: await probe(0, 'KeyW'), A: await probe(0, 'KeyA'), D: await probe(0, 'KeyD') };
  const m2 = { W: await probe(2, 'KeyW'), A: await probe(2, 'KeyA'), D: await probe(2, 'KeyD') };
  check('V1a FP/TP背后 W=-z A=-x D=+x', m0.W[1] < 0 && m0.A[0] < 0 && m0.D[0] > 0,
    JSON.stringify(m0));
  check('V1b 正面 W=+z(镜像) A=+x(镜像) D=-x(镜像)', m2.W[1] > 0 && m2.A[0] > 0 && m2.D[0] < 0,
    JSON.stringify(m2));

  // ---- V2/V5 TP 构图与平行性 ----
  const geo = await evl(`(() => {
    cameraMode = 1; yaw = 0.4; pitch = -0.18; updateThirdPersonCamera();
    const d = Math.hypot(camera.position.x - playerPos.x, camera.position.z - playerPos.z);
    return { dist: +d.toFixed(2), dy: +(camera.position.y - playerPos.y).toFixed(2),
             camPitchX: +camera.rotation.x.toFixed(3), fov: camera.fov, camZ: camera.rotation.z };
  })()`);
  check('V2a TP 距离≈4.0(水平)', Math.abs(geo.dist - 4.0) < 0.05, 'dist=' + geo.dist);
  check('V2b TP 相机高度 +0.55(过肩)', Math.abs(geo.dy - 0.55) < 0.02, 'dy=' + geo.dy);
  check('V5a 相机 pitch 与射线 pitch 平行(R51)', Math.abs(geo.camPitchX - (-0.18)) < 1e-9, 'camPitch=' + geo.camPitchX);
  check('V5b TP fov=70 且无 roll', geo.fov === 70 && Math.abs(geo.camZ) < 1e-9, JSON.stringify(geo));

  // 构图截图(平视/仰/俯)
  await evl(`cameraMode = 1; pitch = 0;`); await sleep(250); await shot('tpback-level-v2');
  await evl(`pitch = 0.6;`); await sleep(250); await shot('tpback-up-v2');
  await evl(`pitch = -0.6;`); await sleep(250); await shot('tpback-down-v2');
  await evl(`pitch = 0;`);

  // ---- V3 贴墙淡出(高空无残留,墙基于玩家当前格放置)----
  const fadeFar = await evl(`(() => {
    cameraMode = 1; yaw = 0; pitch = 0;
    updateThirdPersonCamera();
    const safeDist = Math.hypot(camera.position.x - playerPos.x, camera.position.z - playerPos.z);
    return { safe: +safeDist.toFixed(2), vis: playerModel.visible,
             op: +playerModel.userData.fadeMats[0].opacity.toFixed(2), trans: playerModel.userData.fadeMats[0].transparent };
  })()`);
  check('V3a 开阔处模型全显 opacity=1 不透明', fadeFar.vis === true && fadeFar.op === 1 && fadeFar.trans === false, JSON.stringify(fadeFar));

  // 背后放墙(yaw=0 背后=+z):+2 格 = 1 格远(半淡区);+1 格 = 贴脸(全隐区)
  const fadeNear = await evl(`(() => {
    const bx = Math.floor(playerPos.x), by = Math.floor(playerPos.y) - 1;
    const put = (bz) => { for (let dy = 0; dy < 4; dy++) setBlock(bx, by + dy, bz, 'stone'); };
    const clr = (bz) => { for (let dy = 0; dy < 4; dy++) setBlock(bx, by + dy, bz, 'air'); };
    const read = () => ({ safe: +Math.hypot(camera.position.x - playerPos.x, camera.position.z - playerPos.z).toFixed(2),
                          vis: playerModel.visible, op: +playerModel.userData.fadeMats[0].opacity.toFixed(2),
                          held: playerModel.userData.heldMount.visible });
    put(Math.floor(playerPos.z) + 2); updateThirdPersonCamera();
    const half = read();
    clr(Math.floor(playerPos.z) + 2);
    put(Math.floor(playerPos.z) + 1); updateThirdPersonCamera();
    const zero = read();
    clr(Math.floor(playerPos.z) + 1);
    updateThirdPersonCamera();
    return { half, zero, restored: { vis: playerModel.visible, op: playerModel.userData.fadeMats[0].opacity } };
  })()`);
  check('V3b 距 1 格墙:半淡 0<op<1', fadeNear.half.op > 0 && fadeNear.half.op < 1, JSON.stringify(fadeNear.half));
  check('V3c 贴脸墙:模型隐藏 op=0 手持同隐', fadeNear.zero.vis === false && fadeNear.zero.op === 0 && fadeNear.zero.held === false, JSON.stringify(fadeNear.zero));
  check('V3d 撤墙恢复:全显 op=1', fadeNear.restored.vis === true && fadeNear.restored.op === 1, JSON.stringify(fadeNear.restored));

  // 贴墙半淡近景截图(重放 1 格墙)
  await evl(`(() => {
    const bx = Math.floor(playerPos.x), bz = Math.floor(playerPos.z) + 2, by = Math.floor(playerPos.y) - 1;
    for (let dy = 0; dy < 4; dy++) setBlock(bx, by + dy, bz, 'stone');
    return true;
  })()`);
  await sleep(250); await shot('tpback-wall-fade');
  await evl(`(() => {
    const bx = Math.floor(playerPos.x), bz = Math.floor(playerPos.z) + 2, by = Math.floor(playerPos.y) - 1;
    for (let dy = 0; dy < 4; dy++) setBlock(bx, by + dy, bz, 'air');
    cameraMode = 0; return true;
  })()`);

  // ---- V4 触屏切视角按钮 ----
  const v4 = await evl(`(() => {
    const btn = document.getElementById('touch-camera');
    if (!btn) return { exists: false };
    const before = cameraMode;
    btn.click();
    const after = cameraMode;
    btn.click(); btn.click();
    return { exists: true, before, after, back: cameraMode, vis: getComputedStyle(btn).display };
  })()`);
  check('V4a 🎥 按钮存在', v4.exists === true, JSON.stringify(v4));
  check('V4b 点击循环 0→1→…→0(三视角)', v4.exists && v4.before === 0 && v4.after === 1 && v4.back === 0, JSON.stringify(v4));

  // ---- V6 第一人称纯净视角(R52 增补:默认看不到自己与手持)----
  // 走真实路径:改 settings 后等 rAF 刷新(animate 每帧重算可见性),不自证
  await evl(`cameraMode = 0; yaw = 0; pitch = -0.5; settings.fpHeld = false;`);
  await sleep(350);
  const v6a = await evl(`({ model: playerModel.visible, shadow: playerShadow.visible, hold: holdGroup.visible })`);
  check('V6a FP 默认纯净:模型/影子/手持全隐', !v6a.model && !v6a.shadow && !v6a.hold, JSON.stringify(v6a));

  await evl(`settings.fpHeld = true;`);
  await sleep(350);
  const v6b0 = await evl(`({ model: playerModel.visible, hold: holdGroup.visible, armVis: holdGroup.userData.arm.visible })`);
  check('V6b 设置开:FP 手持显示且看不到自己', v6b0.hold && v6b0.armVis && !v6b0.model, JSON.stringify(v6b0));

  await evl(`settings.fpHeld = true; cameraMode = 1; updateThirdPersonCamera();`);
  await sleep(350);
  const v6c = await evl(`({ model: playerModel.visible, hold: holdGroup.visible, tpHeld: playerModel.userData.heldMount.visible })`);
  check('V6c TP 不受手持设置影响(模型+TP 手持可见)', v6c.model && !v6c.hold && v6c.tpHeld, JSON.stringify(v6c));
  await evl(`cameraMode = 0; settings.fpHeld = false;`);
  await sleep(350);
  const v6e = await evl(`({ model: playerModel.visible, hold: holdGroup.visible })`);
  check('V6e TP→FP 切换后模型立即隐藏(修复可见残留)', !v6e.model && !v6e.hold, JSON.stringify(v6e));

  // 设置面板开关真实点击(click 处理器内部自会刷新文案;refreshSettingsUI
  // 是 setupInput 闭包内局部函数,全局作用域不可直接调用)
  const v6b = await evl(`(() => {
    const btn = document.getElementById('set-fpheld');
    if (!btn) return { exists: false };
    document.getElementById('settings-panel').classList.remove('hidden');
    const label0 = btn.textContent;
    btn.click();
    const after = settings.fpHeld, label1 = btn.textContent;
    btn.click();
    document.getElementById('settings-panel').classList.add('hidden');
    return { exists: true, label0, after, label1, back: settings.fpHeld };
  })()`);
  check('V6d 设置面板「第一人称手持」开关可用', v6b.exists && v6b.after === true && v6b.back === false && v6b.label0 === '关' && v6b.label1 === '开', JSON.stringify(v6b));

  // ---- 模型朝向不回退(R51) ----
  const orient = await evl(`(() => {
    cameraMode = 1; yaw = 0.7; pitch = 0; updateThirdPersonCamera();
    playerModel.updateMatrixWorld();
    const face = new THREE.Vector3(0, 1.46, 0.25);   // 模型本地正面(脸)
    const p = playerModel.localToWorld(face.clone());
    const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const toFace = p.clone().sub(playerModel.position).setY(0).normalize();
    return { dot: +toFace.dot(fwd).toFixed(3) };
  })()`);
  check('V5c 模型脸朝 forward(点积≈1)', orient.dot > 0.99, JSON.stringify(orient));
  await evl(`cameraMode = 0;`);

  console.log('\n==== RESULTS ====');
  results.forEach((r) => console.log(r));
  const fails = results.filter((r) => r.startsWith('FAIL'));
  console.log(`\n${results.length - fails.length}/${results.length} PASS`);
  if (jsErrors.length) { console.log('JS ERRORS:', jsErrors.slice(0, 5)); }
  console.log('DONE');
  ws.close();
  process.exit(fails.length ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
