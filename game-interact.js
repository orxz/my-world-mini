// ============================================================
// 第十四部分:射线检测(DDA 体素步进 + 门实体射线)
// ============================================================
// DDA 体素射线:逐体素步进找第一个固体方块(替代 intersectObjects,无需遍历 mesh 数组)
// 性能优势:只检查视线穿过的 ~6 个体素,而非 121 个 chunk mesh 的所有三角形
// 池化命中结果:animate 每帧调用 raycastTarget,命中时不再分配对象字面量
// 调用方都是同步消费(读取 x/y/z/normal 后立即使用),复用引用安全
const _rayHitResult = { x: 0, y: 0, z: 0, normal: null };
function _rayHit(x, y, z) {
  _rayHitResult.x = x; _rayHitResult.y = y; _rayHitResult.z = z;
  _rayHitResult.normal = _rayNormal;
  return _rayHitResult;
}

function raycastTarget() {
  // 起点:第一人称=相机位置(playerPos);第三人称=玩家眼睛
  _rayEye.set(playerPos.x, playerPos.y, playerPos.z);
  _rayDir.set(-Math.sin(yaw)*Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw)*Math.cos(pitch));
  const eye = _rayEye, dir = _rayDir;
  const maxDist = 6;  // 最远 6 格

  // DDA 算法:Amanatides-Woo 体素遍历
  let x = Math.floor(eye.x), y = Math.floor(eye.y), z = Math.floor(eye.z);
  const stepX = dir.x > 0 ? 1 : (dir.x < 0 ? -1 : 0);
  const stepY = dir.y > 0 ? 1 : (dir.y < 0 ? -1 : 0);
  const stepZ = dir.z > 0 ? 1 : (dir.z < 0 ? -1 : 0);
  // 到下一个体素边界的 t 值
  const tDeltaX = dir.x !== 0 ? Math.abs(1 / dir.x) : Infinity;
  const tDeltaY = dir.y !== 0 ? Math.abs(1 / dir.y) : Infinity;
  const tDeltaZ = dir.z !== 0 ? Math.abs(1 / dir.z) : Infinity;
  // 初始 tMax(到第一个边界)
  let tMaxX = dir.x !== 0 ? (stepX > 0 ? (x + 1 - eye.x) / dir.x : (eye.x - x) / -dir.x) : Infinity;
  let tMaxY = dir.y !== 0 ? (stepY > 0 ? (y + 1 - eye.y) / dir.y : (eye.y - y) / -dir.y) : Infinity;
  let tMaxZ = dir.z !== 0 ? (stepZ > 0 ? (z + 1 - eye.z) / dir.z : (eye.z - z) / -dir.z) : Infinity;

  let lastStep = null;  // 记录最后跨过的轴(用于反推法线)
  let traveled = 0;

  // 检查起点是否已在方块内(眼睛嵌墙)
  if (isSolidAt(x, y, z)) {
    _rayNormal.set(0, 1, 0);
    return _rayHit(x, y, z);
  }

  for (let i = 0; i < 32 && traveled <= maxDist; i++) {
    // 步进到最近的体素边界
    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      x += stepX; traveled = tMaxX; tMaxX += tDeltaX; lastStep = 'x';
    } else if (tMaxY < tMaxZ) {
      y += stepY; traveled = tMaxY; tMaxY += tDeltaY; lastStep = 'y';
    } else {
      z += stepZ; traveled = tMaxZ; tMaxZ += tDeltaZ; lastStep = 'z';
    }
    if (traveled > maxDist) break;
    // 检查当前体素是否固体(非空气,且非水)
    const block = getBlock(x, y, z);
    if (block && block !== 'water' && BLOCK_TYPES[block] && BLOCK_TYPES[block].solid) {
      // 命中:法线 = 进入面方向(反 step),池化向量避免每帧命中时分配
      _rayNormal.set(
        lastStep === 'x' ? -stepX : 0,
        lastStep === 'y' ? -stepY : 0,
        lastStep === 'z' ? -stepZ : 0
      );
      return _rayHit(x, y, z);
    }
  }
  return null;  // 射线未命中固体
}

function currentTool() {
  const item = hotbar[currentSlot];
  if (item && item.kind === 'tool') return item;
  return null;
}

function currentToolDef() {
  const tool = currentTool();
  if (!tool) return null;
  let tdef = TOOL_TYPES[tool.id] || null;
  if (tdef && tool.ench && tool.ench.efficiency) {
    tdef = Object.assign({}, tdef, { speed: tdef.speed * (1 + 0.45 * tool.ench.efficiency) });
  }
  return tdef;
}

function breakCost(blockType) {
  // 核心计算在 craft.js(纯函数,可单测);这里只做依赖注入(BLOCK_TYPES/TOOL_TYPES/currentTool)
  // 效率附魔(R28):工具速度 ×(1 + 0.45×级);层级不足(R55)由 craft.breakCost 统一 ×2.5
  const def = BLOCK_TYPES[blockType];
  return CRAFTLIB.breakCost(def, currentToolDef());
}

function canHarvestBlock(blockType) {
  return CRAFTLIB.canHarvest(BLOCK_TYPES[blockType], currentToolDef());
}

function harvestTierName(blockType) {
  const t = (BLOCK_TYPES[blockType] && BLOCK_TYPES[blockType].tier) || 0;
  return t >= 4 ? '钻石' : t >= 3 ? '铁' : t >= 2 ? '石' : '木';
}

function breakBlock() {
  const item = hotbar[currentSlot];
  if (item && item.kind === 'tool') {
    const tdef = TOOL_TYPES[item.id];
    if (tdef.tool === 'sword' || tdef.tool === 'bow' || tdef.tool === 'shield') {
      useTool(item);
      return;
    }
  }
  if (item && item.kind === 'item') {
    showToast(`${itemName(item)} 不能破坏方块,切换到工具或方块`);
    return;
  }
  // 左键优先命中动物(剑/斧伤害更高,空手/其他工具 1 点)
  const mobHit = raycastMob(3.5);
  if (mobHit) {
    const heldDef = (item && item.kind === 'tool') ? TOOL_TYPES[item.id] : null;
    const now = performance.now();
    const cd = heldDef
      ? (BALANCE.combat.cooldown[heldDef.tool] || BALANCE.combat.cooldown.other)
      : BALANCE.combat.cooldown.hand;
    if (now - lastAttackTime < cd * 1000) return;   // R55:攻击冷却(防按住左键 4.5 次/秒)
    lastAttackTime = now;
    let dmg = (heldDef && (heldDef.tool === 'sword' || heldDef.tool === 'axe')) ? (heldDef.damage || 4) : 1;
    dmg += ((item && item.ench && item.ench.sharpness) || 0);   // 锋利 +1/级
    const crit = !onGround && velocity.y < BALANCE.combat.critVelocity;
    if (crit) dmg = Math.round(dmg * BALANCE.combat.critMultiplier);
    hurtMob(mobHit, dmg, -Math.sin(yaw), -Math.cos(yaw));
    if (crit) showToast('💥 暴击!');
    flashHitMarker(crit);
    swingArm();
    swingHoldItem();
    return;
  }
  // 矿车(R26):左键击打 —— 移动中顺向助推,静止回收掉落
  const lookCart = raycastCart(3.5);
  if (lookCart) { punchCart(lookCart); return; }
  // 红石元件(R38):非固体射线穿不中 —— 视线采样命中即一击拆除
  {
    const rs = raycastRedstone(4);
    if (rs) {
      setBlock(rs.x, rs.y, rs.z, null);
      spawnParticles(rs.x, rs.y, rs.z, 0xc03028, 6);
      audio.play('break');
      let dropId = rs.id, dropKind = 'block', dropN = 1;
      if (rs.id === 'redstone') { dropId = 'redstone_dust'; dropKind = 'item'; }
      else if (rs.id === 'lever_on') dropId = 'lever_off';   // 拆下拉杆回到关态
      else if (rs.id === 'repeater_on') dropId = 'repeater_off';   // 开态中继器拆回关态(R42)
      else if (rs.id === 'piston_ext') { dropId = 'piston'; pistons.delete(rs.x + ',' + rs.y + ',' + rs.z); }
      else if (rs.id === 'piston') pistons.delete(rs.x + ',' + rs.y + ',' + rs.z);
      spawnDroppedItem(rs.x, rs.y, rs.z, dropId, dropN, dropKind);
      if (rs.id === CANE_ID) {   // 拆一节:上方整柱弹出(经典),柱底计时清理
        for (let yy = rs.y + 1; getBlock(rs.x, yy, rs.z) === CANE_ID; yy++) {
          setBlock(rs.x, yy, rs.z, null);
          spawnDroppedItem(rs.x, yy, rs.z, CANE_ID, 1, 'block');
        }
        caneTimers.delete(rs.x + ',' + rs.y + ',' + rs.z);
      }
      tutEvent('break', 1);
      markDirtySave();
      return;
    }
  }
  // 门:左键=移除门(任何手持,和破坏方块一致);右键=开关门
  const lookDoor = raycastDoor();
  if (lookDoor) {
    removeDoor(lookDoor.x, lookDoor.y, lookDoor.z);
    spawnDroppedItem(lookDoor.x, lookDoor.y, lookDoor.z, lookDoor.type, 1);   // 掉落门物品
    showToast('移除门'); audio.play('break'); markDirtySave(); return;
  }
  const t = raycastTarget();
  if (!t) return;
  const type = getBlock(t.x, t.y, t.z);
  if (!type) return;
  if (t.y === 0) { showToast('基岩无法破坏'); return; }  // 基岩层不可挖
  if (type === 'water') { showToast('水不能破坏'); return; }
  if (type === 'vault') { showToast('🔐 封印宝库:需要 12 颗末影珍珠开启'); return; }
  if (type === 'obsidian') { showToast('封印框无法破坏'); return; }

  const harvestOk = canHarvestBlock(type);   // R55:层级不足可挖掉但不掉落
  const cost = breakCost(type);
  breakCostTotal = cost;   // 供裂纹覆盖层换算阶段
  const tool = currentTool();
  const key = blockKey(t.x, t.y, t.z);
  if (breakTargetKey !== key) {
    breakTargetKey = key;
    breakProgress = 0;
  }
  breakProgress++;
  showBreakOverlay(t, breakProgress / cost);
  audio.play('step');
  if (breakProgress < cost) return;
  spawnParticles(t.x, t.y, t.z, new THREE.Color(BLOCK_TYPES[type].top).getHex(), 8);
  setBlock(t.x, t.y, t.z, null);
  // 火把附着:拆掉支撑后,上面的火把一并掉落(经典)
  if (getBlock(t.x, t.y + 1, t.z) === 'torch') {
    setBlock(t.x, t.y + 1, t.z, null);
    spawnDroppedItem(t.x, t.y + 1, t.z, 'torch', 1, 'block');
  }
  // 甘蔗附着(R40):支撑被拆,整柱甘蔗弹出
  {
    let yy = t.y + 1;
    while (getBlock(t.x, yy, t.z) === CANE_ID) {
      setBlock(t.x, yy, t.z, null);
      spawnDroppedItem(t.x, yy, t.z, CANE_ID, 1, 'block');
      yy++;
    }
    if (yy > t.y + 1) caneTimers.delete(t.x + ',' + (t.y + 1) + ',' + t.z);
  }
  // 红石元件附着(R38):支撑被拆,上方元件一并弹出
  {
    const above = getBlock(t.x, t.y + 1, t.z);
    if (above && REDSTONE_FAMILY[above]) {
      setBlock(t.x, t.y + 1, t.z, null);
      let popId = above, popKind = 'block';
      if (above === 'redstone') { popId = 'redstone_dust'; popKind = 'item'; }
      else if (above === 'lever_on') popId = 'lever_off';
      spawnDroppedItem(t.x, t.y + 1, t.z, popId, 1, popKind);
    }
  }
  // 箱子被拆:掉落全部内容
  if (type === 'chest') {
    const ck = blockKey(t.x, t.y, t.z);
    const c = chests.get(ck);
    if (c) {
      for (const it of c.slots) {
        if (it) spawnDroppedItem(t.x, t.y, t.z, it.id, it.count || 1, it.kind || 'block', it.durability);
      }
      chests.delete(ck);
      if (chestOpen === ck) closeChestPanel();
    }
  }
  // 床被拆:若是当前重生床则清除重生点
  if (type === 'bed' && spawnPoint) {
    if (Math.floor(spawnPoint.x) === t.x && Math.floor(spawnPoint.z) === t.z
        && Math.floor(spawnPoint.y - 1.1) === t.y) {
      spawnPoint = null;
      showToast('重生床已拆除,重生点重置');
    }
  }
  // 熔炉被拆:掉落内含物(待冶炼/燃料/产物)
  if (type === 'furnace') {
    const fk = blockKey(t.x, t.y, t.z);
    const f = furnaces.get(fk);
    if (f) {
      for (const it of [f.input, f.fuel, f.output]) {
        if (it) spawnDroppedItem(t.x, t.y, t.z, it.id, it.count || 1, it.kind || 'block', it.durability);
      }
      furnaces.delete(fk);
      if (furnaceOpen === fk) closeFurnacePanel();
    }
  }
  // 蛋糕被挖:清除剩余片数状态(否则原位重放新蛋糕会"复活"旧的剩余片数,R53·B10)
  if (type === 'cake') cakes.delete(blockKey(t.x, t.y, t.z));
  if (type === 'beacon') beacons.delete(blockKey(t.x, t.y, t.z));   // R55:拆信标熄灯
  // 经典掉落(生存采集):石头→圆石;煤矿→煤炭(1-2);钻石矿→钻石;树叶 15% 掉苹果
  let dropType = type, dropKind = 'block', dropCount = 1;
  if (harvestOk) {
    if (type === 'stone') dropType = 'cobblestone';
    else if (type === 'coal_ore') { dropType = 'coal'; dropKind = 'item'; dropCount = 1 + (Math.random() < 0.3 ? 1 : 0); }
    else if (type === 'diamond_ore') { dropType = 'gem_diamond'; dropKind = 'item'; }
    else if (type === 'gold_ore') { dropType = 'gold_ore'; dropKind = 'block'; }
    else if (type === 'leaves' && Math.random() < 0.15) { dropType = 'apple'; dropKind = 'item'; }
    else if (type === 'spawner') { dropType = null; }   // 刷怪笼破坏无掉落(经典,R37)
    else if (type === 'redstone_ore') { dropType = 'redstone_dust'; dropKind = 'item'; dropCount = 4 + (Math.random() < 0.5 ? 1 : 0); }   // 红石矿 → 红石粉 4-5(R38)
    else if (type === 'redstone') { dropType = 'redstone_dust'; dropKind = 'item'; }   // 红石线拆回红石粉(R38)
  } else {
    dropType = null;
    showToast('⛏ 需要' + harvestTierName(type) + '镐才能收获' + (BLOCK_TYPES[type] ? BLOCK_TYPES[type].name : ''));
  }
  // 成熟麦田(R29):麦子格上仍有种植计时 → 收获小麦 + 种子(R55)
  if (type === 'leaves' && cropTimers.has(blockKey(t.x, t.y, t.z))) {
    cropTimers.delete(blockKey(t.x, t.y, t.z));
    spawnDroppedItem(t.x, t.y, t.z, 'wheat', 1, 'item');
    spawnDroppedItem(t.x, t.y, t.z, 'seed', 1, 'item');
    markDirtySave();
  }
  if (dropType) { spawnDroppedItem(t.x, t.y, t.z, dropType, dropCount, dropKind); discovered.add(dropType); }
  stats.blocksMined++;
  breakProgress = 0; breakTargetKey = null;
  hideBreakOverlay();
  // 交互减噪:破坏不再逐次 toast(粒子/音效/裂纹已是充分反馈)
  tutEvent('break', 1);
  audio.play('break', type);
  if (tool) {
    tool.durability = Math.max(0, tool.durability - 1);
    if (tool.durability <= 0) {
      showToast(`${TOOL_TYPES[tool.id].name} 坏了!`);
      hotbar[currentSlot] = null;
    }
    refreshHotbarSlot(currentSlot);   // 单格轻量刷新(每击一次都触发)
  }
  markDirtySave();
}

// 放置消耗:当前手持方块格扣减数量,用尽清格(生存模式,替代无限方块)
function consumeSelected() {
  const item = hotbar[currentSlot];
  if (!item || item.kind !== 'block') return;
  item.count = (item.count || 1) - 1;
  if (item.count <= 0) {
    showToast('用完了:' + BLOCK_TYPES[item.id].name);
    hotbar[currentSlot] = null;
    selectedType = null;
  }
  refreshHotbarSlot(currentSlot);   // 单格轻量刷新(替代 9 格重建)
}

function placeBlock() {
  // R55:靠近游乐设施右击直接乘坐(优先于方块交互)
  if (typeof tryMountNearbyRide === 'function' && tryMountNearbyRide()) return;
  const lookDoor = raycastDoor();
  const holdingDoor = selectedType && selectedType.indexOf('door') === 0;
  if (lookDoor && !holdingDoor) { toggleDoor(lookDoor.x, lookDoor.y, lookDoor.z); return; }
  // 矿车(R26):右键乘坐(手持矿车点铁轨放车,走下方交互分发)
  {
    const item0 = hotbar[currentSlot];
    const lookCart = raycastCart(3.5);
    if (lookCart && !(item0 && item0.kind === 'item' && item0.id === 'minecart')) {
      mountCart(lookCart);
      return;
    }
    const mobHitV = raycastMob(3.5);
    // 铁傀儡修复(R55):手持铁锭右键铁傀儡,恢复 25 HP 并消耗 1 铁锭
    if (mobHitV && mobHitV.type === 'golem' && item0 && item0.kind === 'item' && item0.id === 'iron_ingot') {
      repairGolem(mobHitV, item0);
      return;
    }
    // 村民交易(R33):右键村民 —— 手持面包=喂食繁殖(R39),幼崽不开面板,否则开交易
    if (mobHitV && mobHitV.type === 'villager') {
      if (mobHitV.baby) { showToast('村民幼崽只想玩耍'); return; }
      if (item0 && item0.kind === 'item' && item0.id === 'bread') { feedVillager(mobHitV, item0); return; }
      openTradePanel(mobHitV);
      return;
    }
    // 剪羊毛(R35):手持剪刀右键羊
    if (mobHitV && mobHitV.type === 'sheep' && item0 && item0.kind === 'tool' && item0.id === 'shears') {
      shearSheep(mobHitV, item0);
      return;
    }
    // 喂食繁殖(R29):手持小麦右键猪/牛/羊(村民不吃麦,走上面的交易)
    if (item0 && item0.kind === 'item' && item0.id === 'wheat') {
      const mobHit0 = raycastMob(3.5);
      if (mobHit0 && (mobHit0.type === 'pig' || mobHit0.type === 'cow' || mobHit0.type === 'sheep' || mobHit0.type === 'chicken')) { feedAnimal(mobHit0, item0); return; }
    }
    // 铁桶(R36):空桶舀水/水桶放水(优先于交互方块 —— 经典持桶点方块即倒水)
    if (item0 && item0.kind === 'item' && (item0.id === 'bucket' || item0.id === 'water_bucket')) { useBucket(item0); return; }
  }
  const item = hotbar[currentSlot];
  // 交互方块(右键):合成台 / TNT / 熔炉 / 床 / 箱子 —— 单次射线统一分发
  // (先于工具/食物分支:经典 MC 交互方块优先,持镐/食物也能打开熔炉/箱子/床)
  const tHit = raycastTarget();
  if (tHit) {
    const hitType = getBlock(tHit.x, tHit.y, tHit.z);
    if (item && item.kind === 'item' && item.id === 'minecart') {
      // 手持矿车右键:铁轨非固体射线穿不中,改看命中实心块的放置位(格+法线)是否为铁轨
      const rx = tHit.x + Math.round(tHit.normal.x), ry = tHit.y + Math.round(tHit.normal.y), rz = tHit.z + Math.round(tHit.normal.z);
      if (getBlock(rx, ry, rz) === 'rail') {
        spawnMinecart(rx, ry, rz);
        item.count = (item.count || 1) - 1;
        if (item.count <= 0) hotbar[currentSlot] = null;
        buildHotbar();
        showToast('放下矿车(右键乘坐 · 左键击打助推/回收)');
      } else showToast('矿车要放在铁轨上');
      return;
    }
    if (hitType === 'crafting_table') { openTablePanel(); return; }
    if (hitType === 'enchanting_table') { openEnchantPanel(); return; }
    if (hitType === 'tnt') { igniteTNT(tHit.x, tHit.y, tHit.z); return; }
    if (hitType === 'furnace') { openFurnacePanel(tHit.x, tHit.y, tHit.z); return; }
    if (hitType === 'bed') { trySleep(tHit.x, tHit.y, tHit.z); return; }
    if (hitType === 'chest') { openChestPanel(tHit.x, tHit.y, tHit.z); return; }
    // 南瓜雕刻(R57,经典):手持剪刀右键南瓜 → 刻出脸;只有雕刻南瓜/南瓜灯能召唤铁傀儡
    if (hitType === 'pumpkin' && item && item.kind === 'tool' && item.id === 'shears') {
      setBlock(tHit.x, tHit.y, tHit.z, 'carved_pumpkin', { noGolem: true });   // 改造不算重放,原版不触发
      discovered.add('carved_pumpkin');   // 解锁图鉴
      spawnParticles(tHit.x, tHit.y, tHit.z, 0xd99632, 6);
      audio.play('break');
      consumeToolDurability(item);
      markDirtySave();
      showToast('✂️ 刻出南瓜脸 — 拆下重放,南瓜必须最后放才召唤');
      return;
    }
    if (hitType === 'vault') { tryOpenVault(tHit.x, tHit.y, tHit.z); return; }
    if (hitType === 'beacon') { showToast('🔆 信标:8 格内提供夜视与缓慢回血'); return; }
    if (hitType === 'cake') { eatCakeSlice(tHit.x, tHit.y, tHit.z); return; }
    // 拉杆(R38):命中面的相邻格是拉杆 → 右键切换开/关(双 id 方块,存档天然记录)
    const lx = tHit.x + Math.round(tHit.normal.x), ly = tHit.y + Math.round(tHit.normal.y), lz = tHit.z + Math.round(tHit.normal.z);
    const lb = getBlock(lx, ly, lz);
    if (lb === 'lever_off' || lb === 'lever_on') {
      setBlock(lx, ly, lz, lb === 'lever_off' ? 'lever_on' : 'lever_off');
      showToast(lb === 'lever_off' ? '🕹️ 拉杆:开' : '🕹️ 拉杆:关');
      audio.play('click');
      swingHoldItem();
      return;
    }
  }
  // 工具右键:近战/弓箭/举盾/钓鱼/穿甲(方块交互已优先分发)
  if (item && item.kind === 'tool') { useTool(item); return; }
  // 种子种植(R55):手持种子对草地右键(替代雪;旧存档的雪仍可成熟)
  if (item && item.kind === 'item' && item.id === 'seed') {
    const ts = raycastTarget();
    if (ts) {
      const px = ts.x + Math.round(ts.normal.x), py = ts.y + Math.round(ts.normal.y), pz = ts.z + Math.round(ts.normal.z);
      if (tryPlantSeed(px, py, pz)) {
        item.count = (item.count || 1) - 1;
        if (item.count <= 0) hotbar[currentSlot] = null;
        buildHotbar(); markDirtySave();
        showToast('🌱 种下小麦(60 秒成熟)');
        audio.play('place');
      } else showToast('种子要种在草地上');
    }
    return;
  }
  // 金苹果(R55):60 秒伤害吸收 4,刷新不叠加
  if (item && item.kind === 'item' && item.id === 'gold_apple') {
    eatGoldApple(item);
    return;
  }
  if (item && item.kind === 'item' && FOODS[item.id]) {
    // 食物:右键进食恢复饥饿值
    if (hungerState.hunger >= 20) { showToast('已经很饱了'); return; }
    hungerState.hunger = Math.min(20, hungerState.hunger + FOODS[item.id]);
    item.count = (item.count || 1) - 1;
    if (item.count <= 0) hotbar[currentSlot] = null;
    buildHotbar(); updateHungerBar(); markDirtySave();
    audio.play('eat');
    swingHoldItem();
    showToast('吃掉:' + ITEM_TYPES[item.id].name + '(饥饿 +' + FOODS[item.id] + ')');
    return;
  }
  if (item && item.kind === 'item') {
    showToast(`${itemName(item)} 不能放置,选中方块再放`);
    return;
  }
  const t = raycastTarget();
  if (!t) { showToast('未对准任何方块'); return; }
  const nx = t.x + Math.round(t.normal.x);
  const ny = t.y + Math.round(t.normal.y);
  const nz = t.z + Math.round(t.normal.z);
  if (getBlock(nx, ny, nz) || doorBlocksAt(nx, ny, nz)) { showToast('此处已有方块或门'); return; }
  // 梯子:需贴墙/贴地放置(经典附着),且非固体可放在自己脚下
  if (selectedType === 'ladder') {
    const hasSupport = isSolidAt(nx - 1, ny, nz) || isSolidAt(nx + 1, ny, nz)
      || isSolidAt(nx, ny, nz - 1) || isSolidAt(nx, ny, nz + 1) || isSolidAt(nx, ny - 1, nz);
    if (!hasSupport) { showToast('梯子需要贴着实体墙或地面放置'); return; }
  }
  // 火把:需放在固体方块上面(经典附着;R22 先做立式火把)
  if (selectedType === 'torch' && !isSolidAt(nx, ny - 1, nz)) {
    showToast('火把需要放在固体方块上面'); return;
  }
  // 铁轨:需放在固体方块上面(R26;平地铁轨,坡道暂不支持)
  if (selectedType === 'rail' && !isSolidAt(nx, ny - 1, nz)) {
    showToast('铁轨需要放在固体方块上面'); return;
  }
  // 红石元件(R38):线/火把/拉杆需固体支撑(与铁轨/火把同规则)
  if ((selectedType === 'redstone' || selectedType === 'redstone_torch' || selectedType === 'lever_off') && !isSolidAt(nx, ny - 1, nz)) {
    showToast('红石元件需要放在固体方块上面'); return;
  }
  // 甘蔗(R40):需草/沙/土上且四向邻水(经典水边种植)
  if (selectedType === 'sugarcane') {
    const under = getBlock(nx, ny - 1, nz);
    const okUnder = under === 'grass' || under === 'sand' || under === 'dirt';
    const waterAdj = getBlock(nx + 1, ny - 1, nz) === 'water' || getBlock(nx - 1, ny - 1, nz) === 'water'
      || getBlock(nx, ny - 1, nz + 1) === 'water' || getBlock(nx, ny - 1, nz - 1) === 'water';
    if (!okUnder || !waterAdj) { showToast('甘蔗要种在水边的草地/沙地上'); return; }
  }
  if (selectedType !== 'ladder' && overlapsPlayer(nx, ny, nz)) { showToast('挡住自己了,换个方向'); return; }
  if (selectedType && selectedType.indexOf('door') === 0) {
    const facing = Math.abs(Math.sin(yaw)) > 0.5 ? 1 : 0;
    if (placeDoor(nx, ny, nz, selectedType, facing)) {
      showToast('放置:'+(BLOCK_TYPES[selectedType]?BLOCK_TYPES[selectedType].name:'门'));
      audio.play('place'); markDirtySave(); consumeSelected();
    }
    else { showToast('门需 2 格高空间'); }
    return;
  }
  if (tryPlantCrop(nx, ny, nz)) { showToast('种下小麦(60秒成熟)'); audio.play('place'); consumeSelected(); return; }
  if (setBlock(nx, ny, nz, selectedType)) {
    const placedType = selectedType;   // consumeSelected 数尽会置空,先留存(R38)
    spawnParticles(nx, ny, nz, new THREE.Color(BLOCK_TYPES[selectedType].top).getHex(), 4);
    showToast(`放置:${BLOCK_TYPES[selectedType].name}`);
    tutEvent('place', 1);
    stats.blocksPlaced++;
    audio.play('place');
    markDirtySave();
    consumeSelected();
    if (placedType === 'redstone_torch') unlockAchv('redstone');   // 成就:电路初成(R38)
    if (placedType === 'beacon') { beacons.add(blockKey(nx, ny, nz)); unlockAchv('beacon'); }   // R55
    if (placedType === 'sugarcane') caneTimers.set(nx + ',' + ny + ',' + nz, Date.now());   // 45s 长一节(R40)
    if (placedType === 'piston') {   // 朝向 = 玩家水平视线方向(R42)
      const dirx = -Math.sin(yaw), dirz = -Math.cos(yaw);
      const facing = Math.abs(dirx) > Math.abs(dirz) ? (dirx > 0 ? 0 : 1) : (dirz > 0 ? 2 : 3);
      pistons.set(nx + ',' + ny + ',' + nz, facing);
      showToast('活塞朝向:' + ['东', '西', '南', '北'][facing]);
    }
  }
}

const toolCooldown = {};
function useTool(item) {
  const def = TOOL_TYPES[item.id];
  const now = performance.now();
  const cd = def.tool === 'sword' ? BALANCE.combat.cooldown.sword * 1000
    : def.tool === 'bow' ? 600 : def.tool === 'shield' ? 500 : BALANCE.combat.cooldown.other * 1000;
  if (toolCooldown[item.id] && now - toolCooldown[item.id] < cd) return;
  if (def.tool === 'sword') {
    toolCooldown[item.id] = now;   // 交互:挥砍即进入冷却(经典攻击间隔)
    swingArm();
    swingHoldItem();
    const m = raycastMob(3.5);
    if (m) {
      let dmg = (def.damage || 3) + ((item.ench && item.ench.sharpness) || 0);
      const crit = !onGround && velocity.y < BALANCE.combat.critVelocity;
      if (crit) dmg = Math.round(dmg * BALANCE.combat.critMultiplier);
      hurtMob(m, dmg, -Math.sin(yaw), -Math.cos(yaw));
      flashHitMarker(crit);
      showToast(`挥砍:${def.name} · 伤害${dmg}${crit ? ' · 暴击!' : ''} · 命中生物`);
      audio.play('break');
      consumeToolDurability(item);   // 经典:命中才损耗耐久,空挥不扣
    }
  } else if (def.tool === 'bow') {
    const arrowSlot = hotbar.findIndex(s => s && s.kind === 'item' && s.id === 'arrow' && s.count > 0);
    if (arrowSlot < 0) { showToast('没有箭,无法射击(背包取箭)'); return; }
    toolCooldown[item.id] = now;   // 交互:射出才进入冷却(拉弓时间)
    hotbar[arrowSlot].count--;
    if (hotbar[arrowSlot].count <= 0) hotbar[arrowSlot] = null;
    refreshHotbarSlot(arrowSlot);
    consumeToolDurability(item);
    shootArrow();
    swingHoldItem();
    audio.play('place');
    showToast(`射箭 · 剩余 ${hotbar[arrowSlot] ? hotbar[arrowSlot].count : 0} 支`);
  } else if (def.tool === 'shield') {
    toolCooldown[item.id] = now;   // 交互:举盾进入冷却
    shieldActive = 0.6;
    raisedShield = item;           // 记住举起的盾(格挡成功扣耐久)
    swingHoldItem();
    showToast(`举盾:${def.name}`);
    consumeToolDurability(item);
  } else if (def.tool === 'rod') {
    // 钓鱼(R29):有浮标 → 咬钩窗口内收获 / 否则收回;无浮标 → 对水甩竿
    toolCooldown[item.id] = now;
    if (fishingState) {
      if (fishingState.stage === 'bite') catchFish(fishingState);
      else showToast('收回鱼线');
      endFishing();
    } else {
      const w = findWaterAlongView(8);
      if (!w) { showToast('对着水面甩竿'); return; }
      startFishing(w.x, w.y, w.z, item);
      swingHoldItem();
    }
  } else if (def.tool === 'armor') {
    toolCooldown[item.id] = now;
    equipArmor(item);
  } else {
    showToast(`${def.name}:用于破坏方块(左键),右键只是展示`);
    toolCooldown[item.id] = now;
    swingHoldItem();
  }
}

// 耐久附魔(R28):等级 l → 消耗概率 1/(l+1)(经典近似);返回 true 表示本次免损耗
function enchUnbreakingSkip(item) {
  return !!(item && item.ench && item.ench.unbreaking && Math.random() < item.ench.unbreaking / (item.ench.unbreaking + 1));
}

function consumeToolDurability(item) {
  if (enchUnbreakingSkip(item)) return;   // 耐久附魔:本次不损耗
  item.durability = Math.max(0, item.durability - 1);
  if (item.durability <= 0) {
    showToast(`${TOOL_TYPES[item.id].name} 坏了!`);
    hotbar[currentSlot] = null;
  }
  refreshHotbarSlot(currentSlot);   // 单格轻量刷新(破坏方块每次都触发,避免 9 格重建)
  markDirtySave();
}

const arrows = [];
let arrowGeo = null, arrowMat = null;
// 力量附魔等级(扫描快捷栏的弓,R28)
function bowPowerBonus() {
  for (let i = 0; i < HOTBAR_SIZE; i++) {
    const it = hotbar[i];
    if (it && it.kind === 'tool' && TOOL_TYPES[it.id] && TOOL_TYPES[it.id].tool === 'bow' && it.ench && it.ench.power) return it.ench.power;
  }
  return 0;
}
function shootArrow() {
  if (!arrowGeo) { arrowGeo = new THREE.BoxGeometry(0.08, 0.08, 0.4); arrowMat = new THREE.MeshLambertMaterial({ color: 0xcaa472 }); }
  const m = new THREE.Mesh(arrowGeo, arrowMat);
  m.position.copy(playerPos);
  const dir = new THREE.Vector3(
    -Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)
  );
  m.userData = { vel: dir.multiplyScalar(28), life: 2.5, fromPlayer: true };
  scene.add(m);
  arrows.push(m);
}


// 门实体系统(独立于区块,2 格高,可开关)
const doors = new Map();
function doorKey(x, y, z) { return x+','+y+','+z; }
const doorMatCache = {};
function getDoorMat(type) {
  if (!doorMatCache[type]) { const def = BLOCK_TYPES[type] || BLOCK_TYPES['door']; doorMatCache[type] = new THREE.MeshLambertMaterial({ color: def.side }); }
  return doorMatCache[type];
}
function createDoorMesh(door) {
  const mat = getDoorMat(door.type);
  const g = new THREE.Group();
  // pivot Group(铰链在左 x=-0.43):门板+凹槽+把手都挂在内,统一旋转
  const pivot = new THREE.Group();
  pivot.position.set(-0.43, 0, 0);
  pivot.userData.isDoorPivot = true;
  g.add(pivot);
  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.86, 1.9, 0.1), mat);
  panel.position.set(0.43, 0.95, 0);
  panel.userData.isDoorPanel = true;  // 标记:共享缓存材质,disposeDoorGroup 不释放
  pivot.add(panel);
  const grooveMat = new THREE.MeshLambertMaterial({ color: 0x000000, transparent: true, opacity: 0.2 });
  for (const gx of [0.23, 0.43, 0.63]) { const gr = new THREE.Mesh(new THREE.BoxGeometry(0.015, 1.6, 0.02), grooveMat); gr.position.set(gx, 0.95, 0.06); pivot.add(gr); }
  const knob = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.05), new THREE.MeshLambertMaterial({ color: 0xd4af37 }));
  knob.position.set(0.7, 1.0, 0.07); knob.userData.isDoorKnob = true; pivot.add(knob);
  const topFrame = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.06, 0.14), new THREE.MeshLambertMaterial({ color: 0x3a2412 }));
  topFrame.position.set(0, 1.95, 0); g.add(topFrame);
  if (door.open) pivot.rotation.y = -Math.PI / 2;
  g.position.set(door.x + 0.5, door.y, door.z + 0.5);
  g.rotation.y = door.facing === 1 ? Math.PI / 2 : 0;
  g.userData.doorKey = doorKey(door.x, door.y, door.z);
  return g;
}
function placeDoor(x, y, z, type, facing) {
  if (y < 1 || y + 1 >= WORLD_HEIGHT) return false;
  if (getBlock(x, y, z) || getBlock(x, y + 1, z)) return false;
  if (!isSolidAt(x, y - 1, z)) return false;
  const door = { x, y, z, type: type || 'door', open: false, facing: facing || 0 };
  doors.set(doorKey(x,y,z), door);
  door.group = createDoorMesh(door); scene.add(door.group);
  return true;
}
function removeDoor(x, y, z) {
  const d = doors.get(doorKey(x,y,z)); if (!d) return false;
  if (d.group) { disposeDoorGroup(d.group); scene.remove(d.group); }
  doors.delete(doorKey(x,y,z)); return true;
}
function toggleDoor(x, y, z) {
  const d = doors.get(doorKey(x, y, z));
  if (!d) return false;
  if (d.type === 'door_iron') {   // 铁门只能红石驱动(经典,R38)
    showToast('🚪 铁门需要红石信号(火把/拉杆+红石线)');
    return false;
  }
  d.open = !d.open;
  d.animT = 0;  // 触发动画(在 animate 里推进)
  audio.play('step');
  showToast(d.open ? '🚪 开门' : '🚪 关门');
  return true;
}

