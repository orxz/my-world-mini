// ============================================================
// R41 建筑方块轮 实机验证(CDP,--remote-debugging-port=9333)
// 覆盖:5 配方;真实放置(半砖/楼梯/栅栏);半砖半高落地(y+0.5)与
// 行走 step-assist(踏上半砖);楼梯自动上阶(不跳,+1);栅栏水平阻挡
// 与跳跃防越(1.5);生物撞栅栏转向不跳;普通方块攀爬行为不变(需跳);
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

  // ---- 0. 进游戏 + 平整试验台(长走廊)----
  await sleep(1500);
  await evl(`document.getElementById('overlay').click()`);
  await sleep(600);
  await evl(`endTutorial()`);
  const hut = await evl(`(() => { for (let cx=-6;cx<=6;cx++) for (let cz=-6;cz<=6;cz++){ const h=villageInCell(cx,cz,worldSeed); if(h) return h; } })()`);
  await evl(`playerPos.set(${hut.cx + 8.5}, ${hut.base + 4}, ${hut.cz + 8.5}); velocity.set(0,0,0); isFlying=false;`);
  await sleep(2600);
  await evl(`(() => {
    const px = Math.floor(playerPos.x), gy = Math.floor(playerPos.y) - 1, pz = Math.floor(playerPos.z);
    for (let dx = -2; dx <= 14; dx++) for (let dz = -3; dz <= 3; dz++) {
      setBlock(px + dx, gy, pz + dz, 'stone');
      for (let dy = 1; dy <= 5; dy++) setBlock(px + dx, gy + dy, pz + dz, null);
    }
    playerPos.set(px + 0.5, gy + 1.9, pz + 0.5); velocity.set(0, 0, 0);
    window.__RS = { px, gy, pz };
    return true;
  })()`);
  await sleep(300);
  check('进入游戏+走廊就绪', await evl(`typeof moveAxis === 'function'`) && !!hut);

  // ---- 1. 配方×5(页面内真实匹配)----
  const recipes = await evl(`(() => {
    const g3 = (ids) => ids.map(x => x === null ? null : { kind: x === 'stick' ? 'item' : 'block', id: x });
    const slabP = matchRecipeGrid(g3(['planks', 'planks', 'planks', null, null, null, null, null, null]), 3, CRAFTLIB.RECIPES);
    const slabC = matchRecipeGrid(g3(['cobblestone', 'cobblestone', 'cobblestone', null, null, null, null, null, null]), 3, CRAFTLIB.RECIPES);
    const stP = matchRecipeGrid(g3(['planks', null, null, 'planks', 'planks', null, 'planks', 'planks', 'planks']), 3, CRAFTLIB.RECIPES);
    const stC = matchRecipeGrid(g3(['cobblestone', null, null, 'cobblestone', 'cobblestone', null, 'cobblestone', 'cobblestone', 'cobblestone']), 3, CRAFTLIB.RECIPES);
    const fence = matchRecipeGrid(g3(['planks', 'stick', 'planks', 'planks', 'stick', 'planks', null, null, null]), 3, CRAFTLIB.RECIPES);
    return { slabP: !!slabP, slabC: !!slabC, stP: !!stP, stC: !!stC, fence: !!(fence && fence.result.id === 'fence') };
  })()`);
  check('配方×5:双台阶/双楼梯/栅栏', Object.values(recipes).every(Boolean), JSON.stringify(recipes));

  // ---- 2. 半砖:真实放置 + 行走 step-assist 踏上(脚 y+0.5)----
  const slab = await evl(`(() => {
    const px = window.__RS.px, gy = window.__RS.gy, pz = window.__RS.pz;
    for (let i = 0; i < 9; i++) hotbar[i] = null;
    hotbar[0] = { kind: 'block', id: 'slab_planks', count: 4 }; currentSlot = 0; selectSlot(0);
    playerPos.set(px + 0.5, gy + 1.9, pz + 0.5); velocity.set(0, 0, 0);
    const dx = (px + 3.5) - playerPos.x, dy = (gy + 1.0) - playerPos.y, dz = (pz + 0.5) - playerPos.z;
    yaw = Math.atan2(-dx, -dz); pitch = Math.asin(dy / Math.hypot(dx, dy, dz));
    placeBlock();   // 半砖放 (px+3, gy+1)
    const placed = getBlock(px + 3, gy + 1, pz) === 'slab_planks';
    // 行走 east:按住 W(真实输入路径)+ 朝 +x;不按跳
    yaw = -Math.PI / 2;
    keys['KeyW'] = true; keys['Space'] = false;
    let stepped = false, feetOn = null;
    for (let i = 0; i < 300; i++) {
      const pv = velocity.y;
      updatePlayer(0.016, pv);
      if (playerPos.x > px + 3.7 && Math.abs((playerPos.y - 0.9) - (gy + 1.5)) < 0.06) { stepped = true; feetOn = +(playerPos.y - 0.9).toFixed(2); break; }
      if (playerPos.x > px + 4.5) break;   // 越过仍没踏上半高 = 失败
    }
    keys['KeyW'] = false;
    return { placed, stepped, feetOn, x: +(playerPos.x - px).toFixed(2) };
  })()`);
  check('半砖:真实放置 + 行走自动踏上(脚在半高 y+0.5)', slab.placed && slab.stepped, JSON.stringify(slab));

  // ---- 3. 半砖:从上方落到半砖上 → 落在半高(真实重力落地)----
  const slabLand = await evl(`(() => {
    const px = window.__RS.px, gy = window.__RS.gy, pz = window.__RS.pz;
    playerPos.set(px + 3.5, gy + 4.5, pz + 0.5); velocity.set(0, 0, 0); isFlying = false;
    onGround = false;
    for (let i = 0; i < 300 && !onGround; i++) { const pv = velocity.y; updatePlayer(0.016, pv); }
    const feet = +(playerPos.y - 0.9).toFixed(2);
    return { landed: onGround === true, feet, expect: +(gy + 1.5).toFixed(2) };
  })()`);
  check('半砖:高坠落在半高(y+0.5)', slabLand.landed && Math.abs(slabLand.feet - slabLand.expect) < 0.02, JSON.stringify(slabLand));

  // ---- 4. 楼梯:行走自动上阶(+1,不跳)----
  const stairs = await evl(`(() => {
    const px = window.__RS.px, gy = window.__RS.gy, pz = window.__RS.pz;
    setBlock(px + 5, gy + 1, pz, 'stairs_cobble');
    playerPos.set(px + 3.5, gy + 2.4, pz + 0.5); velocity.set(0, 0, 0); isFlying = false;
    onGround = false;
    for (let i = 0; i < 90 && !onGround; i++) { const pv = velocity.y; updatePlayer(0.016, pv); }   // 先落到半砖
    yaw = -Math.PI / 2;
    keys['KeyW'] = true; keys['Space'] = false;
    let climbed = false, feet = null;
    for (let i = 0; i < 300; i++) {
      const pv = velocity.y;
      updatePlayer(0.016, pv);
      if (playerPos.x > px + 5.6) {
        feet = +(playerPos.y - 0.9).toFixed(2);
        if (Math.abs(feet - (gy + 2)) < 0.06) climbed = true;   // 站上楼梯顶(整格)
        break;
      }
    }
    keys['KeyW'] = false;
    return { climbed, feet, x: +(playerPos.x - px).toFixed(2) };
  })()`);
  check('楼梯:行走自动上阶(脚 +1,全程未按跳)', stairs.climbed, JSON.stringify(stairs));

  // ---- 5. 栅栏:水平阻挡 + 跳跃防越(1.5 格)----
  const fence = await evl(`(() => {
    const px = window.__RS.px, gy = window.__RS.gy, pz = window.__RS.pz;
    setBlock(px + 8, gy + 1, pz, 'fence');
    playerPos.set(px + 6.5, gy + 1.9, pz + 0.5); velocity.set(0, 0, 0); isFlying = false;
    onGround = false;
    for (let i = 0; i < 90 && !onGround; i++) { const pv = velocity.y; updatePlayer(0.016, pv); }
    // 按住 W + 持续起跳(真实输入路径,越栏尝试)
    yaw = -Math.PI / 2;
    keys['KeyW'] = true; keys['Space'] = true;
    let maxX = 0, jumpedOver = false;
    for (let i = 0; i < 260; i++) {
      const pv = velocity.y;
      updatePlayer(0.016, pv);
      maxX = Math.max(maxX, playerPos.x - px);
      if (playerPos.x > px + 8.9) { jumpedOver = true; break; }
    }
    keys['KeyW'] = false; keys['Space'] = false;
    return { maxX: +maxX.toFixed(2), jumpedOver, fenceAt: px + 8 };
  })()`);
  check('栅栏:行走+跳跃均无法越过(1.7 格防跳)', !fence.jumpedOver && fence.maxX < 7.85, JSON.stringify(fence));   // maxX 为相对位移;栅栏在 px+8,中心不得越过其格前沿

  // ---- 6. 生物撞栅栏:不跳,只转向 ----
  const mobFence = await evl(`(() => {
    const px = window.__RS.px, gy = window.__RS.gy, pz = window.__RS.pz;
    clearMobs();
    const pig = spawnMob(px + 6.5, gy + 1, pz + 0.5, 'pig');
    pig.yaw = -Math.PI / 2;   // 朝 +x(栅栏方向)
    pig.speed = 1.3; pig.turnT = 999;
    const yaw0 = pig.yaw;
    let jumped = false;
    for (let i = 0; i < 120; i++) {
      updateMobs(0.05);
      if (pig.vy > 3) { jumped = true; break; }   // 跳跃特征速度
      if (Math.abs(pig.yaw - yaw0) > 1) break;    // 已转向
    }
    const turned = Math.abs(pig.yaw - yaw0) > 1;
    const crossed = pig.mesh.position.x > px + 8;
    return { jumped, turned, crossed };
  })()`);
  check('生物撞栅栏:不跳只转向,未越栏', !mobFence.jumped && mobFence.turned && !mobFence.crossed, JSON.stringify(mobFence));

  // ---- 7. 普通方块攀爬不变:走向石墙不自动上(需跳)----
  const normal = await evl(`(() => {
    const px = window.__RS.px, gy = window.__RS.gy, pz = window.__RS.pz;
    setBlock(px + 11, gy + 1, pz, 'stone');
    playerPos.set(px + 9.5, gy + 1.9, pz + 0.5); velocity.set(0, 0, 0); isFlying = false;
    onGround = false;
    for (let i = 0; i < 90 && !onGround; i++) { const pv = velocity.y; updatePlayer(0.016, pv); }
    yaw = -Math.PI / 2;
    keys['KeyW'] = true; keys['Space'] = false;
    let climbed = false;
    for (let i = 0; i < 150; i++) {
      const pv = velocity.y;
      updatePlayer(0.016, pv);
      if (playerPos.y - 0.9 > gy + 1.05) { climbed = true; break; }   // 不按跳却被抬升 = 回归
    }
    keys['KeyW'] = false;
    const blocked = playerPos.x < px + 11;
    return { climbed, blocked, x: +(playerPos.x - px).toFixed(2) };
  })()`);
  check('普通方块:不自动上阶(仍需跳跃,无回归)', !normal.climbed && normal.blocked, JSON.stringify(normal));

  // ---- 8. 报错 ----
  await sleep(800);
  check('页面 0 JS error', jsErrors.length === 0, jsErrors.slice(0, 3).join(' || '));

  console.log('\n===== R41 建筑方块轮 实机验证 =====');
  for (const r of results) console.log(r);
  const fails = results.filter(r => r.startsWith('FAIL'));
  console.log(`\n结果: ${results.length - fails.length}/${results.length} PASS`);
  if (fails.length) { console.log('❌ 有失败项'); process.exit(1); }
  console.log('✅ 全部通过');
  ws.close();
  process.exit(0);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
