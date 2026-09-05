// ============================================================
// R42 红石扩展轮 实机验证(CDP,--remote-debugging-port=9333)
// 覆盖:配方×2;中继器 0.5s 延迟导通(半秒前不导通/到期导通)、信号拉满
// (20 格线末端 15)、断电立即断开、开态拆回关态;活塞真实放置(朝向
// 登记)、充能伸出推石(1 块/3 块链)、>12 格不动、容器不可推、非固体
// 被 pop、断能收回方块留原地、成就;pistonsData 存档往返(朝向+伸出态);
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

  // ---- 0. 进游戏 + 长走廊试验台 ----
  await sleep(1500);
  await evl(`document.getElementById('overlay').click()`);
  await sleep(600);
  await evl(`endTutorial()`);
  const hut = await evl(`(() => { for (let cx=-6;cx<=6;cx++) for (let cz=-6;cz<=6;cz++){ const h=villageInCell(cx,cz,worldSeed); if(h) return h; } })()`);
  await evl(`playerPos.set(${hut.cx + 8.5}, ${hut.base + 4}, ${hut.cz + 8.5}); velocity.set(0,0,0); isFlying=false;`);
  await sleep(2600);
  await evl(`(() => {
    const px = Math.floor(playerPos.x), gy = Math.floor(playerPos.y) - 1, pz = Math.floor(playerPos.z);
    for (let dx = -2; dx <= 30; dx++) for (let dz = -3; dz <= 3; dz++) {
      setBlock(px + dx, gy, pz + dz, 'stone');
      for (let dy = 1; dy <= 5; dy++) setBlock(px + dx, gy + dy, pz + dz, null);
    }
    playerPos.set(px + 0.5, gy + 1.9, pz + 0.5); velocity.set(0, 0, 0);
    window.__RS = { px, gy, pz };
    return true;
  })()`);
  await sleep(300);
  check('进入游戏+走廊就绪', await evl(`typeof pistonExtend === 'function' && typeof updateRedstone === 'function'`) && !!hut);

  // ---- 1. 配方×2 ----
  const recipes = await evl(`(() => {
    const mk = (id, kind) => ({ kind, id });
    const rep = matchRecipeGrid([mk('redstone_torch','block'), mk('stone','block'), mk('redstone_torch','block'), mk('stone','block'), mk('stone','block'), mk('stone','block'), null, null, null], 3, CRAFTLIB.RECIPES);
    const pist = matchRecipeGrid([mk('planks','block'), mk('planks','block'), mk('planks','block'), mk('cobblestone','block'), mk('iron_ingot','item'), mk('cobblestone','block'), mk('cobblestone','block'), mk('redstone_dust','item'), mk('cobblestone','block')], 3, CRAFTLIB.RECIPES);
    return { rep: !!(rep && rep.result.id === 'repeater_off'), pist: !!(pist && pist.result.id === 'piston') };
  })()`);
  check('配方:2火把3石→中继器 / 3板4圆石1铁1粉→活塞', recipes.rep && recipes.pist, JSON.stringify(recipes));

  // ---- 2. 中继器:20 格线末端断电 → 放中继器 → 延迟 0.5s → 导通拉满 15 → 断电即断 ----
  const repeater = await evl(`(() => {
    const px = window.__RS.px, gy = window.__RS.gy, pz = window.__RS.pz;
    const readPower = () => {   // 重建输入直调纯函数读末端功率
      const wires = new Set(), sources = [];
      for (const m of redstoneParts.values()) for (const [key, id] of m) {
        const [x, y, z] = key.split(',').map(Number);
        if (getBlock(x, y, z) !== id) continue;
        if (id === 'redstone') wires.add(key);
        else if (id === 'redstone_torch' || id === 'lever_on' || id === 'repeater_on') sources.push({ key, p: 15 });
      }
      return MACHINES.redstonePower(wires, sources);
    };
    const endKey = (px + 22) + ',' + (gy + 1) + ',' + pz;
    // 布局:火把(px+2) 线 px+3..22(20 格)
    setBlock(px + 2, gy + 1, pz, 'redstone_torch');
    for (let dx = 3; dx <= 22; dx++) setBlock(px + dx, gy + 1, pz, 'redstone');
    redstoneTimer = 0; updateRedstone(0);
    const noRep = readPower().get(endKey) || 0;   // 无中继器:距源 20 格 = 0
    // 中继器插入中点(px+13 换线)
    setBlock(px + 13, gy + 1, pz, 'repeater_off');
    redstoneTimer = 0; updateRedstone(0);
    const stillOff = getBlock(px + 13, gy + 1, pz) === 'repeater_off';   // 0.5s 未到
    const offEnd = readPower().get(endKey) || 0;   // 中继器未导通,末端仍 0(半段距源 11)
    // 半秒后
    repeaterTimers.set((px + 13) + ',' + (gy + 1) + ',' + pz, Date.now() - 10);
    redstoneTimer = 0; updateRedstone(0);
    const nowOn = getBlock(px + 13, gy + 1, pz) === 'repeater_on';
    const fullEnd = readPower().get(endKey) || 0;   // 信号拉满:距中继器 9 格 = 15-9
    // 断电(拆火把):中继器立即断开
    setBlock(px + 2, gy + 1, pz, null);
    redstoneTimer = 0; updateRedstone(0);
    const backOff = getBlock(px + 13, gy + 1, pz) === 'repeater_off';
    const endAfterCut = readPower().get(endKey) || 0;
    // 清理
    for (let dx = 3; dx <= 22; dx++) setBlock(px + dx, gy + 1, pz, null);
    return { noRep, stillOff, offEnd, nowOn, fullEnd, backOff, endAfterCut };
  })()`);
  check('中继器:20 格断电 / 0.5s 延迟 / 导通拉满 / 断电即断',
    repeater.noRep === 0 && repeater.stillOff && repeater.offEnd === 0 && repeater.nowOn
      && repeater.fullEnd === 6 && repeater.backOff && repeater.endAfterCut === 0, JSON.stringify(repeater));

  // ---- 3. 活塞:真实放置(朝向)+ 充能伸出推石 ----
  const piston = await evl(`(() => {
    const px = window.__RS.px, gy = window.__RS.gy, pz = window.__RS.pz;
    // 火把(px+2)+线(px+3,4)+ 活塞位(px+5)+ 待推石(px+6)
    setBlock(px + 2, gy + 1, pz, 'redstone_torch');
    setBlock(px + 3, gy + 1, pz, 'redstone');
    setBlock(px + 4, gy + 1, pz, 'redstone');
    setBlock(px + 6, gy + 1, pz, 'stone');
    playerPos.set(px + 0.5, gy + 1.9, pz + 0.5); velocity.set(0, 0, 0);
    for (let i = 0; i < 9; i++) hotbar[i] = null;
    hotbar[0] = { kind: 'block', id: 'piston', count: 4 }; currentSlot = 0; selectSlot(0);
    const dx = (px + 5.5) - playerPos.x, dy = (gy + 1.05) - playerPos.y, dz = (pz + 0.5) - playerPos.z;   // 瞄顶面上方 0.05(DDA 边界平局加固)
    yaw = Math.atan2(-dx, -dz); pitch = Math.asin(dy / Math.hypot(dx, dy, dz));
    placeBlock();
    const placed = getBlock(px + 5, gy + 1, pz) === 'piston';
    const facing = pistons.get((px + 5) + ',' + (gy + 1) + ',' + pz);
    redstoneTimer = 0; updateRedstone(0);
    const ext = getBlock(px + 5, gy + 1, pz) === 'piston_ext';
    const pushed = getBlock(px + 7, gy + 1, pz) === 'stone' && getBlock(px + 6, gy + 1, pz) === null;
    const achv = achvUnlocked.has('piston');
    return { placed, facing, ext, pushed, achv };
  })()`);
  check('活塞:真实放置(朝东)+ 充能伸出推石 1 格 + 成就',
    piston.placed && piston.facing === 0 && piston.ext && piston.pushed && piston.achv, JSON.stringify(piston));

  // ---- 4. 活塞推动链:3 块全移;13 块不动;容器不可推;非固体 pop;断能收回 ----
  const chain = await evl(`(() => {
    const px = window.__RS.px, gy = window.__RS.gy, pz = window.__RS.pz;
    // 重建:活塞保持伸出态(上一步),先断能收回,再布置链测试
    setBlock(px + 2, gy + 1, pz, null);   // 拆火把断电
    redstoneTimer = 0; updateRedstone(0);
    const retracted = getBlock(px + 5, gy + 1, pz) === 'piston';
    const stoneStayed = getBlock(px + 7, gy + 1, pz) === 'stone';   // 被推方块留在原地(普通活塞)
    // 重新供电 + 贴脸 3 块链(活塞只推贴脸方块:px+6..8;缝隙另测)
    for (let dx = 6; dx <= 10; dx++) setBlock(px + dx, gy + 1, pz, null);
    setBlock(px + 6, gy + 1, pz, 'stone');
    setBlock(px + 7, gy + 1, pz, 'stone');
    setBlock(px + 8, gy + 1, pz, 'stone');
    setBlock(px + 2, gy + 1, pz, 'redstone_torch');
    redstoneTimer = 0; updateRedstone(0);
    const chain3 = getBlock(px + 6, gy + 1, pz) === null
      && getBlock(px + 7, gy + 1, pz) === 'stone' && getBlock(px + 8, gy + 1, pz) === 'stone'
      && getBlock(px + 9, gy + 1, pz) === 'stone';
    // 断能收回,布 13 块链(px+6..18)→ 不动作
    setBlock(px + 2, gy + 1, pz, null);
    redstoneTimer = 0; updateRedstone(0);
    for (let dx = 6; dx <= 18; dx++) setBlock(px + dx, gy + 1, pz, null);
    for (let dx = 6; dx <= 18; dx++) setBlock(px + dx, gy + 1, pz, 'stone');
    setBlock(px + 2, gy + 1, pz, 'redstone_torch');
    redstoneTimer = 0; updateRedstone(0);
    const tooLong = getBlock(px + 5, gy + 1, pz) === 'piston' && getBlock(px + 19, gy + 1, pz) === null;
    // 容器不可推:前方箱子
    setBlock(px + 2, gy + 1, pz, null);
    redstoneTimer = 0; updateRedstone(0);
    for (let dx = 6; dx <= 18; dx++) setBlock(px + dx, gy + 1, pz, null);
    setBlock(px + 6, gy + 1, pz, 'chest');
    setBlock(px + 2, gy + 1, pz, 'redstone_torch');
    redstoneTimer = 0; updateRedstone(0);
    const chestBlocked = getBlock(px + 5, gy + 1, pz) === 'piston' && getBlock(px + 6, gy + 1, pz) === 'chest';
    // 非固体(红石线)被 pop
    setBlock(px + 2, gy + 1, pz, null);
    redstoneTimer = 0; updateRedstone(0);
    setBlock(px + 6, gy + 1, pz, 'redstone');
    const d0 = droppedItems.filter(d => d.userData.type === 'redstone_dust').length;
    setBlock(px + 2, gy + 1, pz, 'redstone_torch');
    redstoneTimer = 0; updateRedstone(0);
    const popped = droppedItems.filter(d => d.userData.type === 'redstone_dust').length > d0
      && getBlock(px + 6, gy + 1, pz) === null && getBlock(px + 5, gy + 1, pz) === 'piston_ext';
    // 清理
    setBlock(px + 2, gy + 1, pz, null); setBlock(px + 3, gy + 1, pz, null); setBlock(px + 4, gy + 1, pz, null);
    redstoneTimer = 0; updateRedstone(0);
    setBlock(px + 5, gy + 1, pz, null); setBlock(px + 6, gy + 1, pz, null); setBlock(px + 7, gy + 1, pz, null);
    return { retracted, stoneStayed, chain3, tooLong, chestBlocked, popped };
  })()`);
  check('活塞:断能收回(方块留原地)/ 3 块链全移 / 13 块不动 / 容器不可推 / 非固体 pop',
    chain.retracted && chain.stoneStayed && chain.chain3 && chain.tooLong && chain.chestBlocked && chain.popped, JSON.stringify(chain));

  // ---- 5. 采样破坏:repeater_on 拆回关态;piston_ext 拆回活塞 ----
  const drops = await evl(`(() => {
    const px = window.__RS.px, gy = window.__RS.gy, pz = window.__RS.pz;
    clearMobs();   // 防游荡生物截胡视线(breakBlock 先查 mob)
    setBlock(px + 6, gy + 1, pz, 'repeater_on');
    playerPos.set(px + 4.5, gy + 1.9, pz + 0.5); velocity.set(0, 0, 0);   // 站近:元件采样射程 4 格
    const dx = (px + 6.5) - playerPos.x, dy = (gy + 1.5) - playerPos.y, dz = (pz + 0.5) - playerPos.z;
    yaw = Math.atan2(-dx, -dz); pitch = Math.asin(dy / Math.hypot(dx, dy, dz));
    const d0 = droppedItems.length;
    breakBlock();
    const repDrop = droppedItems.slice(d0).some(it => it.userData.type === 'repeater_off');
    setBlock(px + 6, gy + 1, pz, 'piston_ext');
    const d1 = droppedItems.length;
    breakBlock();
    const pistDrop = droppedItems.slice(d1).some(it => it.userData.type === 'piston');
    return { repDrop, pistDrop };
  })()`);
  check('采样破坏:开态中继器→关态掉落 / 伸出活塞→活塞掉落', drops.repDrop && drops.pistDrop, JSON.stringify(drops));

  // ---- 6. 存档往返:pistonsData 朝向 + 伸出态恢复且断能可收回 ----
  const rt = await evl(`(() => {
    const px = window.__RS.px, gy = window.__RS.gy, pz = window.__RS.pz;
    // 朝南活塞(facing 2)伸出态
    pistons.set((px + 6) + ',' + (gy + 1) + ',' + pz, 2);
    setBlock(px + 6, gy + 1, pz, 'piston_ext');
    const rec = JSON.parse(JSON.stringify(buildSaveRecord()));
    const savedF = rec.pistonsData ? rec.pistonsData.find(e => e[0] === (px + 6) + ',' + (gy + 1) + ',' + pz) : null;
    applySave(rec);
    const fBack = pistons.get((px + 6) + ',' + (gy + 1) + ',' + pz);
    const extBack = getBlock(px + 6, gy + 1, pz) === 'piston_ext';
    // 读档后断能 → 收回(登记重建,tick 生效)
    redstoneTimer = 0; updateRedstone(0);
    const retracted = getBlock(px + 6, gy + 1, pz) === 'piston';
    setBlock(px + 6, gy + 1, pz, null);
    return { savedF: savedF ? savedF[1] : null, fBack, extBack, retracted };
  })()`);
  check('存档往返:活塞朝向(南)+ 伸出态恢复 + 读档后断能收回',
    rt.savedF === 2 && rt.fBack === 2 && rt.extBack && rt.retracted, JSON.stringify(rt));

  // ---- 7. 报错 ----
  await sleep(800);
  check('页面 0 JS error', jsErrors.length === 0, jsErrors.slice(0, 3).join(' || '));

  console.log('\n===== R42 红石扩展轮 实机验证 =====');
  for (const r of results) console.log(r);
  const fails = results.filter(r => r.startsWith('FAIL'));
  console.log(`\n结果: ${results.length - fails.length}/${results.length} PASS`);
  if (fails.length) { console.log('❌ 有失败项'); process.exit(1); }
  console.log('✅ 全部通过');
  ws.close();
  process.exit(0);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
