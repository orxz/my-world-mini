// ============================================================
// 第十五部分:物理 / 移动(改造 isSolidAt 已查 chunk)
// ============================================================
function collidePlayer(dt) {
  const r = PLAYER_RADIUS;
  const H = PLAYER_HEIGHT;
  moveAxis('x', velocity.x * dt, r, H);
  moveAxis('z', velocity.z * dt, r, H);
  onGround = false;
  moveAxis('y', velocity.y * dt, r, H);
}

function moveAxis(axis, delta, r, H) {
  if (delta === 0) return;
  // 潜行边缘保护(R55):着地潜行时,若前进方向脚下是空气/水则取消该轴位移。
  // 只挡「走出边缘」,不挡正常上台阶(目标格脚下仍有实体)。
  if ((axis === 'x' || axis === 'z') && isSneaking && onGround && !isFlying) {
    const nx = axis === 'x' ? playerPos.x + delta : playerPos.x;
    const nz = axis === 'z' ? playerPos.z + delta : playerPos.z;
    const fy = Math.floor(playerPos.y - H * 0.5 - 0.08);
    const below = getBlock(Math.floor(nx), fy, Math.floor(nz));
    const support = below && BLOCK_TYPES[below] && BLOCK_TYPES[below].solid;
    if (!support) { velocity[axis] = 0; return; }
  }
  playerPos[axis] += delta;
  const px = playerPos.x, py = playerPos.y, pz = playerPos.z;
  const minX = Math.floor(px - r), maxX = Math.floor(px + r);
  const minY = Math.floor(py - H * 0.5), maxY = Math.floor(py + H * 0.5);
  const minZ = Math.floor(pz - r), maxZ = Math.floor(pz + r);
  for (let x = minX; x <= maxX; x++)
    for (let y = minY; y <= maxY; y++)
      for (let z = minZ; z <= maxZ; z++) {
        const b = getBlock(x, y, z);
        if (!b || !BLOCK_TYPES[b] || !BLOCK_TYPES[b].solid) continue;
        const bt = BLOCK_TYPES[b];
        if (axis === 'y') {
          if (delta > 0) { playerPos.y = y - H * 0.5 - 1e-4; }
          else {
            // 半砖(R41):落在半高 0.5;普通方块落满高 1
            const landTop = bt.slab ? 0.5 : 1;
            playerPos.y = y + landTop + H * 0.5 + 1e-4; onGround = true;
          }
          velocity.y = 0; return;
        }
        // ---- 水平轴:step-assist 与栅栏(R41)----
        const feet = py - H * 0.5;
        // 楼梯:着地走入 → 自动上一格(经典免跳攀爬);上方 2 格净空
        if (bt.stair && onGround && feet >= y - 0.01 && !isSolidAt(x, y + 1, z) && !isSolidAt(x, y + 2, z)) {
          playerPos.y = y + 1 + H * 0.5 + 1e-4;
          continue;   // 登顶后本格不再视为阻挡
        }
        // 半砖:脚在其底面以上 → 半高踏上(行走/下落皆可);上方 1 格净空
        if (bt.slab && feet >= y - 0.01 && !isSolidAt(x, y + 1, z)) {
          playerPos.y = y + 0.5 + H * 0.5 + 1e-4; onGround = true;
          continue;
        }
        if (axis === 'x') {
          if (delta > 0) playerPos.x = x - r - 1e-4;
          else playerPos.x = x + 1 + r + 1e-4;
          velocity.x = 0; return;
        } else {
          if (delta > 0) playerPos.z = z - r - 1e-4;
          else playerPos.z = z + 1 + r + 1e-4;
          velocity.z = 0; return;
        }
      }
  // 栅栏防跳(R41):身体未与栅栏格重叠(跳跃中)时,前进方向前沿列
  // 若是栅栏且脚低于栅栏顶 → 阻挡。碰撞高 1.7(本作跳跃顶点 ≈1.56,
  // 取 > 顶点确保任何起跳都越不过;经典 1.5 格对 1.25 跳同理)
  if (axis === 'x' || axis === 'z') {
    const feet = py - H * 0.5;
    const dir = delta > 0 ? 1 : -1;
    const ex = axis === 'x' ? px + dir * (r + 0.08) : px;
    const ez = axis === 'z' ? pz + dir * (r + 0.08) : pz;
    const fy = Math.floor(feet + 0.01);
    for (const yy of [fy - 1, fy, fy + 1]) {   // 含脚下一格:跳跃中脚已越过栅栏格顶但仍在碰撞高度内
      if (getBlock(Math.floor(ex), yy, Math.floor(ez)) === 'fence' && feet < yy + 1.7) {
        if (axis === 'x') { playerPos.x -= delta; velocity.x = 0; }
        else { playerPos.z -= delta; velocity.z = 0; }
        return;
      }
    }
  }
}

// 水中检测
// 是否处于水中:采样点与第一人称相机严格一致(camera.position === playerPos),
// 这样水下色调恰好在相机没入水时触发,避免水面附近出现"色调/相机位置"错位的闪烁带。
// 第三人称相机虽在 +0.2 高度,但色调以玩家身体中心为准即可(视觉差异可忽略)。
function inWater() {
  const t = getBlock(Math.floor(playerPos.x), Math.floor(playerPos.y), Math.floor(playerPos.z));
  return t === 'water';
}

// 音效节流状态
let lastStepTime = 0, lastJumpTime = 0, lastWaterTime = 0, wasInWater = false;

function updatePlayer(dt, prevVy) {
  // 乘坐矿车(R26):位置由矿车驱动,玩家物理挂起;空格下车
  if (ridingCart) {
    if (keys[keymap.jump]) dismountCart();
    return;
  }
  const forward = _fwd.set(-Math.sin(yaw), 0, -Math.cos(yaw));
  const right = _right.set(Math.cos(yaw), 0, -Math.sin(yaw));
  // 正面视角(cameraMode 2)相机回望玩家:屏幕上=玩家背后、屏幕右=玩家左侧,
  // 前后/左右须整体镜像(W/A/S/D 按"屏幕方向"移动);只反前后不反左右会横移错乱
  if (cameraMode === 2) { forward.negate(); right.negate(); }

  const move = _move.set(0, 0, 0);
  // 触屏摇杆输入
  const tm = (typeof window.__touchMove === 'function') ? window.__touchMove() : null;
  if (tm && (Math.abs(tm.x) > 0.1 || Math.abs(tm.z) > 0.1)) {
    move.addScaledVector(forward, -tm.z);   // 池化:不 clone,零分配
    move.addScaledVector(right, tm.x);
  } else {
    if (keys[keymap.forward]) move.add(forward);
  if (keys[keymap.back]) move.sub(forward);
  if (keys[keymap.right]) move.add(right);
  if (keys[keymap.left]) move.sub(right);
  }
  if (move.lengthSq() > 0) move.normalize();

  const water = inWater();
  const ladderHere = getBlock(Math.floor(playerPos.x), Math.floor(playerPos.y - 0.3), Math.floor(playerPos.z)) === 'ladder'
    || getBlock(Math.floor(playerPos.x), Math.floor(playerPos.y + 0.3), Math.floor(playerPos.z)) === 'ladder';
  const shiftDown = keys['ShiftLeft'] || keys['ShiftRight'] || (keys[keymap.sneak] || false);
  // 潜行(R55):地面 + Shift/自定义键 + 非飞行/非水/非梯子;眼高在相机层下沉
  isSneaking = !isFlying && !water && onGround && (!!shiftDown || touchSneak) && !ladderHere;
  // 冲刺(R55):双击 W 锁定 / 触屏摇杆推满 / 冲刺键;需有前进输入、饥饿 > 6、非潜行
  const touchMag = tm ? Math.hypot(tm.x, tm.z) : 0;
  const wantSprint = !isFlying && !water && !isSneaking
    && (touchMag > 0.9 || touchSprint || keys[keymap.sprint] || (sprintLock && keys[keymap.forward]));
  if (wantSprint && hungerState.hunger > BALANCE.player.sprintMinHunger && move.lengthSq() > 0.1) {
    isSprinting = true;
  } else {
    isSprinting = false;
    if (!wantSprint) sprintLock = false;
  }
  const speed = isFlying ? FLY_SPEED
    : water ? BALANCE.player.swimSpeed
    : isSneaking ? SNEAK_SPEED
    : isSprinting ? SPRINT_SPEED : WALK_SPEED;
  const sprint = shiftDown;   // 飞行下降沿用 Shift

  if (isFlying) {
    velocity.x = move.x * speed;
    velocity.z = move.z * speed;
    velocity.y = 0;
    if (keys[keymap.jump]) velocity.y = speed;
    if (sprint) velocity.y = -speed;
  } else if (water) {
    // 水中:浮力缓慢上浮,空格加速上浮;潜水下落有上限
    velocity.x = move.x * speed;
    velocity.z = move.z * speed;
    if (keys[keymap.jump]) {
      velocity.y = BALANCE.player.swimUp;
    } else {
      velocity.y -= GRAVITY * 0.3 * dt;
      velocity.y += 6.0 * dt;
      if (velocity.y < -BALANCE.player.sinkMax) velocity.y = -BALANCE.player.sinkMax;
    }
  } else {
    velocity.x = move.x * speed;
    velocity.z = move.z * speed;
    // 梯子攀爬(经典):空格上升 / Shift 悬停 / 其余缓慢下滑
    if (ladderHere) {
      if (keys[keymap.jump]) velocity.y = 3.2;
      else if (shiftDown) velocity.y = 0;
      else velocity.y = Math.max(velocity.y - GRAVITY * dt, -1.8);
    } else {
      velocity.y -= GRAVITY * dt;
      if (keys[keymap.jump] && onGround) {
        velocity.y = JUMP_SPEED;
        const now = performance.now();
        if (now - lastJumpTime > 250) { audio.play('jump'); lastJumpTime = now; }
      }
    }
  }

  collidePlayer(dt);

  // 落地音效:仅在"从空中→触地"这一帧触发(边沿检测),避免着地后重复播放
  // 黏液块(R35):重着陆弹起(越猛越高),免摔伤 —— 经典蹦床
  let landedOnSlime = false;
  if (onGround && !wasOnGround && prevVy < -6) {
    const underSlime = getBlock(Math.floor(playerPos.x), Math.floor(playerPos.y - PLAYER_HEIGHT * 0.5 - 0.1), Math.floor(playerPos.z)) === 'slime';
    if (underSlime && !isFlying) {
      landedOnSlime = true;
      onGround = false;
      velocity.y = Math.min(14, Math.max(7, -prevVy * 0.65));
      audio.play('jump');
      spawnParticles(playerPos.x, playerPos.y - 0.8, playerPos.z, 0x6fc05a, 6);
    } else {
      audio.play('jump');
      if (!water) spawnParticles(playerPos.x, playerPos.y - 0.7, playerPos.z, 0x9a8a6a, 6);   // 落地尘土
    }
  }
  // 坠落伤害(R55):安全 3 格,每格 0.9,上限 20;水/黏液块/飞行免疫
  if (onGround && !wasOnGround && !isFlying && prevVy < 0 && !inWater() && !landedOnSlime) {
    const fallH = BALANCE_LIB.fallHeightFromVelocity(prevVy);
    const dmg = BALANCE_LIB.fallDamage(fallH);
    if (dmg > 0) {
      damagePlayer(dmg, 'fall');
      if (dmg >= 10) showToast('💥 重摔!(-' + dmg + ' HP)');
    }
  }
  wasOnGround = onGround;
  // 记录最后安全位置(用于虚空救援):仅当稳稳站在实体方块上时更新
  if (onGround && !isFlying) lastSafePos.copy(playerPos);
  // 统计(R55):只累计着地行走,飞行/传送/重生不计入
  {
    const dsx = playerPos.x - (stats._lx === undefined ? playerPos.x : stats._lx);
    const dsz = playerPos.z - (stats._lz === undefined ? playerPos.z : stats._lz);
    stats._lx = playerPos.x; stats._lz = playerPos.z;
    if (onGround && !isFlying) stats.distance += Math.hypot(dsx, dsz);
  }
  // 教程:累计移动距离(仅落地行走计入)
  if (tutorial.active) {
    const dx = playerPos.x - (tutorial._lx === undefined ? playerPos.x : tutorial._lx);
    const dz = playerPos.z - (tutorial._lz === undefined ? playerPos.z : tutorial._lz);
    tutorial._lx = playerPos.x; tutorial._lz = playerPos.z;
    if (onGround) tutEvent('move', Math.hypot(dx, dz));
  }

  // 走路音效(按节拍)
  if (onGround && !isFlying) {
    const horiz = Math.hypot(velocity.x, velocity.z);
    if (horiz > 1) {
      const now = performance.now();
      const interval = 320;
      if (now - lastStepTime > interval) {
        const under = getBlock(Math.floor(playerPos.x), Math.floor(playerPos.y - PLAYER_HEIGHT * 0.5 - 0.1), Math.floor(playerPos.z));
        audio.play('step', under);
        lastStepTime = now;
      }
    }
  }

  // 入水音效
  if (water && !wasInWater) {
    const now = performance.now();
    if (now - lastWaterTime > 500) { audio.play('water'); lastWaterTime = now; }
  }
  wasInWater = water;
  // 窒息:头部在水下连续 20 秒后每秒 1 HP;浮出重置
  const headInWater = getBlock(Math.floor(playerPos.x), Math.floor(playerPos.y + 0.2), Math.floor(playerPos.z)) === 'water';
  if (headInWater) {
    breathTimer += dt;
    if (breathTimer > BALANCE.player.breath) {
      const over = breathTimer - BALANCE.player.breath;
      const before = Math.floor(over - dt);
      const after = Math.floor(over);
      if (after > before) damagePlayer(after - before, 'drown');
    }
  } else {
    breathTimer = 0;
  }

  // 饥饿系统:速率来自 BALANCE.hunger(移动 0.22 / 静止 0.08 / 冲刺 0.55)
  const moveRate = Math.hypot(velocity.x, velocity.z) > 0.5;
  let rate = moveRate ? BALANCE.hunger.drainWalk : BALANCE.hunger.drainIdle;
  if (isSprinting) rate = BALANCE.hunger.drainSprint;
  if (isFlying) rate *= 0.4;
  const hres = INVLIB.hungerTick(hungerState, dt, rate, playerHP < PLAYER_MAX_HP);
  if (hres.hungerChanged) {
    updateHungerBar();
    if (hungerState.hunger === BALANCE.hunger.lowWarn) showToast('🍗 你饿了:饥饿低于 18 不再回血,归零会持续掉血');
  }
  if (hres.regen) {
    // 回血消耗食物(R45 经典收敛):每次 +1 血附加 0.5 点饥饿消耗
    // (drain +2,4 单位=1 点)—— 吃满 20 只能「白嫖」几口,食物换血经济成立
    hungerState.drain += 2;
    playerHP = Math.min(PLAYER_MAX_HP, playerHP + 1);
    updateHPBar();
  }
  if (hres.starve && playerHP > 2) damagePlayer(1, 'starve');

  // 防掉落到地图下面:y < 0(世界底部以下)立即救援,不等 -20
  if (playerPos.y < 0) {
    // 优先:尝试在 lastSafePos 附近找安全位(确保区块已生成)
    const sx = Math.floor(lastSafePos.x), sz = Math.floor(lastSafePos.z);
    ensureChunk(Math.floor(sx / CHUNK_SIZE), Math.floor(sz / CHUNK_SIZE));
    let rescued = false;
    for (let y = Math.min(WORLD_HEIGHT - 3, Math.floor(lastSafePos.y) + 2); y >= 1; y--) {
      if (isSolidAt(sx, y, sz) && !isSolidAt(sx, y + 1, sz) && !isSolidAt(sx, y + 2, sz)) {
        playerPos.set(sx + 0.5, y + 1 + PLAYER_HEIGHT * 0.5 + 0.1, sz + 0.5);
        rescued = true; break;
      }
    }
    // 兜底:lastSafePos 不可用 → 回出生广场中心(确定性安全)
    if (!rescued) {
      const plazaH = SEA_LEVEL + 6;
      playerPos.set(SPAWN_X, plazaH + 1 + PLAYER_HEIGHT * 0.5, SPAWN_Z);
    }
    velocity.set(0, 0, 0);
    showToast('已从虚空中救回');
  }
}
let wasOnGround = false;   // 落地边沿检测

