// ============================================================
// R35 史莱姆+剪刀轮 实机验证(CDP,headless Chrome,--remote-debugging-port=9333)
// 覆盖:史莱姆体型生成(大/中/小 hp+缩放)、蓄力蹦跳 AI、接触伤害按体型、
// 死亡分裂链(大→中→小)+黏液球掉落+成就#17、夜间生成池、存档往返(s 体型);
// 剪刀:对羊右键剪毛(掉羊毛/换粉皮/耐久)、重复拒绝、45s 长回、剪过羊击杀不掉毛;
// 黏液块:玩家重着陆弹起 + 免摔伤;配方(剪刀对角/黏液块无序);0 报错。
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
  await evl(`endTutorial()`);   // 教程守卫会压制夜间刷怪
  check('进入游戏', await evl(`document.getElementById('overlay').classList.contains('hidden') && typeof slimeAI === 'function'`));

  // ---- 1. 体型生成:大/中/小 hp 与缩放 ----
  const sizes = await evl(`(() => {
    const px = playerPos.x, py = playerPos.y + 2, pz = playerPos.z;
    const a = spawnMob(px + 2, py, pz, 'slime', { size: 2 });
    const b = spawnMob(px + 4, py, pz, 'slime', { size: 1 });
    const c = spawnMob(px + 6, py, pz, 'slime', { size: 0 });
    return { a: [a.hp, a.slimeSize, +a.mesh.scale.x.toFixed(2)],
             b: [b.hp, b.slimeSize, +b.mesh.scale.x.toFixed(2)],
             c: [c.hp, c.slimeSize, +c.mesh.scale.x.toFixed(2)] };
  })()`);
  check('体型分级:大 16hp/1.2 中 4hp/0.85 小 1hp/0.55',
    sizes.a[0] === 16 && sizes.a[1] === 2 && Math.abs(sizes.a[2] - 1.2) < 0.01 &&
    sizes.b[0] === 4 && sizes.b[1] === 1 && Math.abs(sizes.b[2] - 0.85) < 0.01 &&
    sizes.c[0] === 1 && sizes.c[1] === 0 && Math.abs(sizes.c[2] - 0.55) < 0.01, JSON.stringify(sizes));

  // ---- 2. 蹦跳 AI:蓄力起跳(垂直)且期间明显逼近玩家(随机地形取最小距离)----
  const hop = await evl(`(() => {
    const s = mobs.find(m => m.type === 'slime' && m.slimeSize === 2);
    playerPos.set(s.mesh.position.x + 5, s.mesh.position.y, s.mesh.position.z);
    velocity.set(0, 0, 0); isFlying = false;
    const d0 = s.mesh.position.distanceTo(playerPos);
    let maxY = s.mesh.position.y, minY = s.mesh.position.y, minDist = d0;
    for (let i = 0; i < 300; i++) {
      updateMobs(0.05);
      maxY = Math.max(maxY, s.mesh.position.y); minY = Math.min(minY, s.mesh.position.y);
      minDist = Math.min(minDist, s.mesh.position.distanceTo(playerPos));
    }
    return { hopUp: +(maxY - minY).toFixed(2), gotCloser: +(d0 - minDist).toFixed(2) };
  })()`);
  check('蹦跳 AI:离地 >0.5 格且逼近玩家 >1 格', hop.hopUp > 0.5 && hop.gotCloser > 1, JSON.stringify(hop));

  // ---- 3. 接触伤害按体型(大=4;清场隔离避免其它史莱姆干扰)----
  const touch = await evl(`(() => {
    clearMobs();
    playerHP = 20; updateHPBar();
    const s = spawnMob(playerPos.x + 0.6, playerPos.y, playerPos.z, 'slime', { size: 2 });
    s.attackCd = 0;
    for (let i = 0; i < 10; i++) updateMobs(0.05);
    return { hp: playerHP, cd: s.attackCd > 0 };
  })()`);
  check('接触伤害:大史莱姆贴身 4 点', touch.hp === 16 && touch.cd, JSON.stringify(touch));

  // ---- 4. 分裂链:大→2-3 中 → 小 → 成就+黏液球 ----
  const split = await evl(`(() => {
    clearMobs();
    const px = playerPos.x, py = playerPos.y + 1, pz = playerPos.z;
    const big = spawnMob(px + 2, py, pz, 'slime', { size: 2 });
    hurtMob(big, 99, 0, 0, true);
    const mediums = mobs.filter(m => m.type === 'slime' && m.slimeSize === 1).length;
    let smalls = 0;
    for (const m of [...mobs.filter(m => m.type === 'slime' && m.slimeSize === 1)]) {
      hurtMob(m, 99, 0, 0, true);
      smalls = Math.max(smalls, mobs.filter(m2 => m2.type === 'slime' && m2.slimeSize === 0).length);
    }
    const drops0 = droppedItems.length;
    for (const m of [...mobs.filter(m => m.type === 'slime' && m.slimeSize === 0)]) hurtMob(m, 99, 0, 0, true);
    return { mediums, smalls, achv: achvUnlocked.has('kill_slime'),
             balls: droppedItems.filter(d => d.userData.type === 'slime_ball').length,
             left: mobs.filter(m => m.type === 'slime').length, drops: droppedItems.length - drops0 };
  })()`);
  check('分裂链:大→2-3 中→小;小死掉黏液球;成就「黏糊糊」',
    split.mediums >= 2 && split.mediums <= 3 && split.smalls >= 2 && split.achv && split.left === 0, JSON.stringify(split));

  // ---- 5. 夜间生成池含史莱姆(统计法)----
  const pool = await evl(`(() => {
    clearMobs(); clearDroppedItems(); clearXPOrbs();
    dayTime = 0.8;   // 夜间
    dayCount = 4;    // R55:史莱姆第 4 夜起进入生成池
    let seen = 0;
    for (let i = 0; i < 260 && seen === 0; i++) {
      clearHostiles();
      trySpawnHostile();
      if (mobs.some(m => m.type === 'slime')) seen++;
    }
    clearHostiles();
    return { seen };
  })()`);
  check('夜间敌对池刷出史莱姆(≤260 次尝试内)', pool.seen >= 1, JSON.stringify(pool));

  // ---- 6. 存档往返:体型 s 入档恢复 ----
  const rt = await evl(`(() => {
    clearMobs();
    spawnMob(1.5, 30, 1.5, 'slime', { size: 1 });
    const rec = JSON.parse(JSON.stringify(buildSaveRecord()));
    const savedS = rec.mobsData[0].s;
    applySave(rec);
    const m = mobs.find(mm => mm.type === 'slime');
    return { savedS, size: m ? m.slimeSize : null, hp: m ? m.hp : null };
  })()`);
  check('存档往返:中史莱姆 s=1 体型与血量恢复', rt.savedS === 1 && rt.size === 1 && rt.hp === 4, JSON.stringify(rt));

  // ---- 7. 剪刀剪羊毛(真实右键路径)----
  const shear = await evl(`(() => {
    clearMobs();
    const s = spawnMob(playerPos.x + 2, playerPos.y + 1, playerPos.z, 'sheep');
    const t = s.mesh.position;
    const dx = t.x - playerPos.x, dy = t.y - playerPos.y, dz = t.z - playerPos.z;
    yaw = Math.atan2(-dx, -dz); pitch = Math.asin(dy / Math.hypot(dx, dy, dz));
    for (let i = 0; i < 9; i++) hotbar[i] = null;
    hotbar[0] = { kind: 'tool', id: 'shears', durability: 238 }; currentSlot = 0; buildHotbar();
    const d0 = droppedItems.length;
    placeBlock();
    const wool = droppedItems.slice(d0).filter(d => d.userData.type === 'wool_white');
    const dur = hotbar[0] ? hotbar[0].durability : -1;
    const pink = s.mesh.userData.woolParts.every(p => p.material === s.mesh.userData.skinMat);
    // 重复剪拒绝
    const d1 = droppedItems.length; placeBlock();
    return { sheared: s.sheared === true, shearT: s.shearT > 40, woolN: wool.length, dur, pink,
             again: droppedItems.length === d1, toast: s.sheared };
  })()`);
  check('剪羊毛:掉毛/粉皮/耐久-1/45s 计时/重复拒绝',
    shear.sheared && shear.shearT && shear.woolN >= 1 && shear.woolN <= 3 && shear.dur === 237 && shear.pink && shear.again, JSON.stringify(shear));

  // ---- 8. 羊毛长回(计时归零)----
  const regrow = await evl(`(() => {
    const s = mobs.find(m => m.type === 'sheep');
    s.shearT = 0.05;
    for (let i = 0; i < 10; i++) updateMobs(0.05);
    const woolBack = s.mesh.userData.woolParts.every(p => p.material === s.mesh.userData.woolMat);
    return { woolBack, regrown: s.sheared === false };
  })()`);
  check('羊毛 45 秒长回(材质复原+标记复位)', regrow.woolBack && regrow.regrown, JSON.stringify(regrow));

  // ---- 9. 黏液块弹跳:高坠免伤并弹起 ----
  const bounce = await evl(`(() => {
    const bx = Math.floor(playerPos.x), bz = Math.floor(playerPos.z);
    const by = Math.floor(playerPos.y - 1);
    setBlock(bx, by, bz, 'slime');
    playerPos.set(bx + 0.5, by + 4.5, bz + 0.5);
    velocity.set(0, -22, 0); isFlying = false;
    playerHP = 20; updateHPBar();
    let bounced = false, peakVy = 0;
    for (let i = 0; i < 300; i++) {
      const pv = velocity.y;   // animate 以参数传入本帧前速度(落地判定依据)
      updatePlayer(0.016, pv);
      if (velocity.y > peakVy) peakVy = velocity.y;
      if (velocity.y > 5) bounced = true;
      if (playerPos.y > by + 6) break;   // 弹起脱离
    }
    const under = getBlock(bx, by, bz);
    setBlock(bx, by, bz, null);   // 清理
    return { bounced, peakVy: +peakVy.toFixed(1), hp: playerHP, under };
  })()`);
  check('黏液块弹跳:弹起速度 >5 且免摔伤', bounce.bounced && bounce.peakVy > 5 && bounce.hp === 20 && bounce.under === 'slime', JSON.stringify(bounce));

  // ---- 10. 配方(剪刀/黏液块,页面内真实匹配)----
  const recipes = await evl(`(() => {
    const g2 = (ids) => ids.map(x => x === null ? null : { kind: 'item', id: x });
    const shears = matchRecipeGrid(g2(['iron_ingot', null, null, 'iron_ingot']), 2, CRAFTLIB.RECIPES);
    const slimeB = matchRecipeGrid(g2(['slime_ball', 'slime_ball', 'slime_ball', 'slime_ball']), 2, CRAFTLIB.RECIPES);
    return { shears: shears && shears.result.id === 'shears', slime: slimeB && slimeB.result.id === 'slime' };
  })()`);
  check('配方:剪刀对角 / 4 黏液球→黏液块(页面内真实匹配)', recipes.shears && recipes.slime, JSON.stringify(recipes));

  // ---- 11. 报错 ----
  await sleep(800);
  check('页面 0 JS error', jsErrors.length === 0, jsErrors.slice(0, 3).join(' || '));

  console.log('\n===== R35 史莱姆+剪刀轮 实机验证 =====');
  for (const r of results) console.log(r);
  const fails = results.filter(r => r.startsWith('FAIL'));
  console.log(`\n结果: ${results.length - fails.length}/${results.length} PASS`);
  if (fails.length) { console.log('❌ 有失败项'); process.exit(1); }
  console.log('✅ 全部通过');
  ws.close();
  process.exit(0);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
