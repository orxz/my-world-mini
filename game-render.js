// ============================================================
// 第十六部分:渲染循环(增加区块更新 + 雾色随水位变化)
// ============================================================
let lastTime = performance.now();
let fpsAcc = 0, fpsFrames = 0, fpsTimer = 0, _fpsEl = null, _posEl = null;
let bobPhase = 0, bobAmp = 0;   // 第一人称行走视角摆动
// 交互:按住左键/长按挖矿按钮 连续挖掘(经典 MC 手感)
let mouseHeld = false;
let touchBreakHeld = false;
let autoMineTimer = 0;

// 昼夜循环:dayTime 0..1(0=午夜,0.25=日出,0.5=正午,0.75=日落),起步 0.3(早晨)
let dayTime = 0.3;
let lastSunUp = null;   // 昼夜边沿检测(R45):入夜/黎明一次性提示用
// updateDayNight 用的临时颜色对象(避免每帧分配)
const _dayColor = new THREE.Color();
const _dayColorB = new THREE.Color();
// 光源/天体引用(在 init 中赋值)
let sunLight = null, ambientLight = null, hemiLight = null, torchHoldLight = null;
let sunMeshRef = null, moonMeshRef = null;

// 昼夜循环更新:根据 dayTime 调整光照强度/方向、天空与雾色、太阳/月亮位置
// 注意:仅在非水下时覆盖背景/雾色(水下色调由 animate 的 inWater 逻辑接管,优先级最高)
// 全周期 = 120 秒,昼夜由平滑函数(sin/cos)过渡
function updateDayNight(dt, waterNow) {
  // waterNow: 本帧是否在水中(由 animate 计算一次传入,避免每帧多次 getBlock;
  // 缺省时自行计算,便于独立调用/测试)
  if (waterNow === undefined) waterNow = inWater();
  // 昼夜循环:受设置控制(可关闭/调速度);暂停菜单打开时冻结推进(M3,
  // 「已暂停」语义;触屏无指针锁,故以菜单可见性为准),光照/雾色计算照常
  const _pm = document.getElementById('pause-menu');
  const _paused = _pm && !_pm.classList.contains('hidden');
  if (settings.dayNightEnabled && !_paused) {
    dayTime += dt / (settings.dayCycleSpeed || BALANCE.day.cycle);
    if (dayTime >= 1) { dayTime -= 1; dayCount++; }   // R55:天数
  }

  // 太阳角度:0=午夜,0.25=日出(东升),0.5=正午,0.75=日落(西落)
  const sunAngle = dayTime * Math.PI * 2 - Math.PI / 2;
  const sunH = Math.sin(sunAngle);       // -1..1(高度,>0 为白天)
  // 入夜/黎明一次性提示(R45):昼夜危险切换可感知 —— 夜间刷怪、
  // 拂晓阳光烧毁亡灵;边沿触发不刷屏,首帧只建立基线不出提示
  const sunUpNow = sunH > 0;
  if (lastSunUp === null) lastSunUp = sunUpNow;
  else if (sunUpNow !== lastSunUp) {
    lastSunUp = sunUpNow;
    if (!sunUpNow && settings.hostiles && settings.dayNightEnabled) showToast('🌙 天黑了,黑暗中开始有怪物出没(火把可防刷怪)');
    else if (sunUpNow) showToast('☀️ 天亮了,阳光会烧毁僵尸和骷髅');
  }
  let dayFactor = Math.max(0, sunH);   // 0..1,白天强度因子
  // 雨天:白昼光照整体压暗 ~30%
  if (weather === 'rain') dayFactor *= 0.7;

  // 光照强度:白天明亮(正午最强),夜晚昏暗
  // 用 dayFactor 平方做非线性过渡,白天更"亮得稳",黄昏过渡更柔和
  if (sunLight) {
    sunLight.intensity = 0.15 + dayFactor * dayFactor * 0.9;   // 夜 0.15 ~ 正午 ~1.05
    // 太阳沿圆轨道运动,半径足够大覆盖世界;方向与天体一致
    const R = 120;
    sunLight.position.set(Math.cos(sunAngle) * R, Math.sin(sunAngle) * R, -40);
  }
  if (ambientLight) {
    ambientLight.intensity = 0.18 + dayFactor * 0.45 + (beaconAura ? 0.12 : 0);   // R55:信标夜视/照明
  }
  if (hemiLight) {
    hemiLight.intensity = 0.1 + dayFactor * 0.25;
  }
  // 火把光晕随昼夜调整:白天微光(0.3)、夜晚全亮(1.0) —— 火光与场景光解耦
  torchGlowUniform.value = 0.3 + 0.7 * (1 - dayFactor);
  // 手持火把照明(R23):点光源跟随玩家,手持火把时点亮
  if (torchHoldLight) {
    const held = hotbar[currentSlot];
    torchHoldLight.intensity = (held && held.kind === 'block' && held.id === 'torch') ? 1.6 : 0;
    torchHoldLight.position.copy(playerPos);
  }

  // 太阳/月亮天体:沿圆轨道运动,互为对侧
  const R2 = 120;
  if (sunMeshRef) {
    sunMeshRef.position.set(Math.cos(sunAngle) * R2, Math.sin(sunAngle) * R2 + 8, -40);
    sunMeshRef.visible = sunH > -0.1;   // 地平线下略容差,日出日落可见
  }
  if (moonMeshRef) {
    // 月亮在太阳的反方向(角度 + π)
    moonMeshRef.position.set(Math.cos(sunAngle + Math.PI) * R2, Math.sin(sunAngle + Math.PI) * R2 + 8, -40);
    moonMeshRef.visible = -sunH > -0.1;  // 夜晚可见
  }

  // 天空颜色:在 夜(0x0a0a2a) / 黄昏黎明(0xff8844) / 白天(0x87ceeb) 间插值
  // 黄昏/黎明出现在 dayTime≈0.25(日出)与 0.75(日落)
  // 白天-夜晚混合(基于 sunH 的 smoothstep)
  const tDay = Math.max(0, Math.min(1, (sunH + 0.15) / 0.35));
  // 黄昏强度:太阳在地平线附近(sunH 接近 0)时最强
  const dusk = Math.max(0, 1 - Math.abs(sunH) / 0.3) * (1 - tDay) * 0.85;

  _dayColor.setHex(0x87ceeb);   // 白天
  _dayColorB.setHex(0x0a0a2a);  // 夜晚
  _dayColor.lerp(_dayColorB, 1 - tDay);     // 日夜混合
  if (dusk > 0) {
    _dayColorB.setHex(0xff8844);            // 黄昏橙(复用 B 作临时)
    _dayColor.lerp(_dayColorB, dusk);
  }
  // 仅在非水下时覆盖背景/雾色(水下色调在 animate 中以更高优先级设置)
  if (!waterNow) {
    if (scene.background.getHex() !== _dayColor.getHex()) {
      scene.background.setHex(_dayColor.getHex());
    }
    scene.fog.color.setHex(_dayColor.getHex());
    scene.fog.near = FOG_NEAR; scene.fog.far = FOG_FAR;
  }

  // 信息面板昼夜进度显示(缓存元素 + 仅在显示的分钟变化时写 DOM,避免每帧触发布局)
  if (_daytimeEl === null) _daytimeEl = document.getElementById('daytime');
  if (_daytimeEl) {
    const hh = Math.floor(dayTime * 24);
    const mm = Math.floor((dayTime * 24 - hh) * 60);
    const str = '第' + dayCount + '天 ' + (hh < 10 ? '0' + hh : hh) + ':' + (mm < 10 ? '0' + mm : mm);
    if (str !== _lastDaytimeStr) { _daytimeEl.textContent = str; _lastDaytimeStr = str; }
  }

  // 天穹渐变色 + 星星透明度(随昼夜;每 4 帧刷新一次——颜色变化缓慢,降 75% 顶点上传)
  if ((skyFrame++ & 3) === 0) updateSky(tDay);
}
let skyFrame = 0;
let _daytimeEl = null;      // 昼夜时间 DOM 元素缓存
let _lastDaytimeStr = '';

function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  let dt = (now - lastTime) / 1000;
  lastTime = now;
  if (dt > 0.05) dt = 0.05;

  const locked = document.pointerLockElement === renderer.domElement;
  // 触屏设备无指针锁(iOS Safari 等不支持 requestPointerLock):
  // 以「游戏进行中」(遮罩/暂停菜单隐藏且无面板打开)作为物理活跃条件,桌面 locked 语义不变
  let active = locked;
  if (!locked && (('ontouchstart' in window) || navigator.maxTouchPoints > 0)) {
    const pmHidden = document.getElementById('pause-menu').classList.contains('hidden');
    const ovHidden = document.getElementById('overlay').classList.contains('hidden');
    active = pmHidden && ovHidden && !inventoryOpen && !tableOpen && !furnaceOpen && !chestOpen && !tradeOpen && !enchantOpen;
  }
  const prevVy = velocity.y;
  if (active) {
    // 先推进设施动画,再把乘坐者吸附到座位;避免先跑物理再被瞬移
    if (typeof updatePlaygroundRides === 'function') updatePlaygroundRides(dt, now);
    if (ridingRide) updateRidePlayer();
    else updatePlayer(dt, prevVy);
  }
  if (active) updateFallingBlocks(dt);           // 沙砾重力(暂停时冻结)
  if (active) updateTNT(dt);                     // 点燃的 TNT(暂停时冻结)
  if (active) updateMinecarts(dt);               // 矿车(暂停时冻结,R26)
  if (active) updateXPOrbs(dt);                  // 经验球(R28)
  if (active) updateFishing(dt);                 // 钓鱼浮标(R29)
  updateWeather(dt);                             // 天气(晴雨随机调度,暂停也推进)
  updateFurnaces(dt);                            // 熔炉冶炼(经典:暂停也持续燃烧)
  updateCanes();                                 // 甘蔗生长(绝对时间判定,R40)
  achvVillageT -= dt;                            // 成就:发现村庄节流探测(R34)
  if (achvVillageT <= 0) { achvVillageT = 1; checkVillageAchv(); }
  if (active) updateSpawners(dt);                // 地牢刷怪笼(暂停时冻结,R37)
  if (active) updateRedstone(dt);                // 红石信号网络(暂停时冻结,R38)
  if (active) updateDroppedItems(dt);            // 掉落物(暂停时冻结;每帧仅一次)
  if (active && settings.mobs) updateMobs(dt);   // 生物(暂停时冻结)
  if (active) updateArrows(dt);                  // 箭矢(暂停时冻结,避免面板开着被骷髅射中)
  updateParticles(dt);   // 粒子效果
  stats.playTime += active ? dt : 0;  // R55:统计(暂停不计时)
  if (absorptionT > 0) { absorptionT -= dt; if (absorptionT <= 0) absorption = 0; }
  if (active) updateBeaconAura(dt);   // R55:信标光环
  updateStatusHUD(dt);   // R55:低血/低饥饿/受击方向/交互提示
  updateDoorAnim(dt);    // 门开关动画
  updateDamageVignette(dt);
  updateDeathOverlay(dt);
  updateClouds(dt);   // 云朵飘动(无论是否锁定都执行)

  // 区块动态加载/卸载(无论是否锁定都执行,保证世界持续生成)
  updateChunks(playerPos.x, playerPos.z);
  if (Math.floor(now / 1000) !== window.__lastCropCheck) { window.__lastCropCheck = Math.floor(now / 1000); updateCrops(); }

  if (holdGroup) {
    // FP 手持默认隐藏(纯净视角,不挡视线);设置「第一人称手持」可开回 MC 经典观感。
    // TP 模式手持挂在玩家模型右手(heldMount),不受此设置影响
    holdGroup.visible = (cameraMode === 0 && settings.fpHeld);
    updateHoldAnim(dt);
  }

  if (cameraMode === 0) {
    // FP 下显式隐藏玩家模型并恢复不透明:TP→F5 切回 FP 时 visible 会残留 true
    // (复位逻辑在 updateThirdPersonCamera,而 FP 分支不调用它),模型会挡在自己镜头前
    playerModel.visible = false;
    setPlayerModelFade(1);
    camera.position.copy(playerPos);
    if (isSneaking) camera.position.y += BALANCE.player.sneakEyeOffset;   // R55:潜行眼高下沉
    camera.rotation.order = 'YXZ';
    camera.rotation.y = yaw;
    camera.rotation.x = pitch;
    // R55:FOV 随冲刺平滑拉伸;基础 FOV 读设置(此前 settings.fov 未生效)
    const targetFov = (settings.fov || 75) + (isSprinting ? BALANCE.player.sprintFov : 0);
    if (Math.abs(camera.fov - targetFov) > 0.05) {
      camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 10);
      camera.updateProjectionMatrix();
    }
    // 行走视角摆动(轻微起伏 + 微 roll,落地感/移动感)
    const hspd = Math.hypot(velocity.x, velocity.z);
    const bobTarget = (!settings.reduceMotion && onGround && !isFlying && hspd > 0.8) ? 1 : 0;
    bobAmp += (bobTarget - bobAmp) * Math.min(1, dt * 8);
    bobPhase += dt * hspd * 1.7;
    camera.position.y += Math.sin(bobPhase * 2) * 0.042 * bobAmp;
    camera.rotation.z = Math.sin(bobPhase) * 0.007 * bobAmp;
  } else {
    updateThirdPersonCamera();
  }

  // R55 视觉:镜头震动(受击/爆炸);用正弦而非随机,避免高频抖动
  if (shakeT > 0 && !settings.reduceMotion) {
    shakeT -= dt;
    const k = Math.max(0, shakeT) / 0.35;
    const s = shakeAmp * k;
    camera.position.x += Math.sin(now * 0.11) * s;
    camera.position.y += Math.cos(now * 0.14) * s * 0.7;
    if (shakeT <= 0) { shakeT = 0; shakeAmp = 0; }
  }

  // 天空穹顶/星星跟随相机(无视差),缓慢旋转(星星周日视运动)
  skyGroup.position.copy(camera.position);
  skyGroup.rotation.y += dt * 0.004;

  // 玩家模型:每帧跟随玩家位置/朝向(无论 cameraMode),避免切换人称时模型停留原地
  if (playerModel) {
    playerModel.position.set(playerPos.x, playerPos.y - PLAYER_HEIGHT * 0.5, playerPos.z);
    playerModel.rotation.y = yaw + Math.PI;   // 模型脸在本地 +z,与 forward(-z)差 π
    const ud = playerModel.userData;
    const horizSpeed = Math.hypot(velocity.x, velocity.z);
    const moving = horizSpeed > 0.5;
    ud.walkPhase += dt * (moving ? horizSpeed * 2.4 : 0);
    if (moving) {
      // 行走:四肢对角线摆动(幅度适中,自然步态)
      const swing = Math.sin(ud.walkPhase) * 0.6;
      ud.armL.rotation.x = swing;
      ud.armR.rotation.x = -swing;
      ud.legL.rotation.x = -swing * 0.9;
      ud.legR.rotation.x = swing * 0.9;
      // 摆动时归零侧向
      ud.armL.rotation.z = 0; ud.armR.rotation.z = 0;
    } else {
      // 待机:四肢缓慢回归中立 + 轻微呼吸式侧摆
      ud.armL.rotation.x *= 0.85; ud.armR.rotation.x *= 0.85;
      ud.legL.rotation.x *= 0.85; ud.legR.rotation.x *= 0.85;
      const idle = Math.sin(now * 0.002) * 0.03;
      ud.armL.rotation.z = idle; ud.armR.rotation.z = -idle;
    }
    // 挥剑动画(swingT>0):右臂大幅前挥,0.3 秒一次,覆盖行走摆动
    if (ud.swingT > 0) {
      ud.swingT += dt;
      const p = ud.swingT / 0.3;
      if (p >= 1) { ud.swingT = 0; ud.armR.rotation.x = 0; }
      else { ud.armR.rotation.x = -Math.sin(p * Math.PI) * 1.6; }
    }
  }

  // 接地阴影跟随:玩家(仅第三人称,模型可见时)/生物/掉落物
  if (playerShadow) {
    if (playerModel && playerModel.visible) updateBlobShadow(playerShadow, playerPos.x, playerPos.z, playerPos.y - PLAYER_HEIGHT * 0.5);
    else playerShadow.visible = false;
  }
  for (const m of mobs) updateBlobShadow(m.shadow, m.mesh.position.x, m.mesh.position.z, m.mesh.position.y - 0.45);
  for (const d of droppedItems) updateBlobShadow(d.userData.shadow, d.position.x, d.position.z, d.position.y - 0.15);

  // 交互:按住左键(或长按移动端挖矿键)连续挖掘 —— 每 0.22 秒自动追加一次破坏点击
  // 触屏不锁指针:touchBreakHeld 是明确的按键意图,不受 locked 门控(R32② 修复)
  if ((locked && mouseHeld) || touchBreakHeld) {
    autoMineTimer -= dt;
    if (autoMineTimer <= 0) { autoMineTimer = 0.22; breakBlock(); }
  } else {
    autoMineTimer = 0;
  }

  const target = raycastTarget();
  if (target) {
    highlightBox.visible = true;
    highlightBox.position.set(target.x + 0.5, target.y + 0.5, target.z + 0.5);
    // R55 视觉:可收获=黑色细框,层级不足=橙红框(与准星提示呼应)
    const tb = getBlock(target.x, target.y, target.z);
    const can = tb ? canHarvestBlock(tb) : true;
    highlightBox.material.color.setHex(can ? 0x101010 : 0xff7040);
    highlightBox.material.opacity = can ? 0.4 : 0.75;
  } else {
    highlightBox.visible = false;
  }
  const curKey = target ? blockKey(target.x, target.y, target.z) : null;
  if (curKey !== breakTargetKey && breakProgress > 0) {
    breakProgress = 0;
    hideBreakOverlay();
  }
  // 破坏裂纹 3D 覆盖层(阶段随进度推进)
  if (crackMesh) {
    const cracking = !!(target && breakProgress > 0 && curKey === breakTargetKey);
    crackMesh.visible = cracking;
    if (cracking) {
      crackMesh.position.set(target.x + 0.5, target.y + 0.5, target.z + 0.5);
      const stage = Math.min(3, Math.floor(breakProgress / breakCostTotal * 4));
      if (crackMesh.material !== crackMats[stage]) crackMesh.material = crackMats[stage];
    }
  }

  // 水态每帧只算一次(getBlock 字符串 key 查询),供昼夜/雾色/天穹可见性共用
  const inWaterNow = inWater();
  // 昼夜循环:推进 dayTime 并调整光照/天空/天体(updateDayNight 内部仅在非水下时覆盖背景/雾)
  updateDayNight(dt, inWaterNow);
  // 水面呼吸波动(注册表遍历,只碰水 mesh)
  const waterBob = Math.sin(now * 0.0012) * 0.035;
  for (const wm of waterMeshes) wm.position.y = waterBob;
  // 雾/背景:水中色调优先级最高(覆盖昼夜色调),水下视野大幅拉近(沉浸感)
  // 出水后由 updateDayNight 在下一帧重新应用昼夜色
  const _waterBg = 0x1f5fa8, _waterBg2 = 0x143d6e;
  skyGroup.visible = !inWaterNow;   // 水下隐藏天穹/星星(蓝雾接管)
  if (inWaterNow) {
    if (scene.background.getHex() !== _waterBg) {
      scene.background.setHex(_waterBg);
      scene.fog.color.setHex(_waterBg2);
      scene.fog.near = 0.1; scene.fog.far = 16;
    }
  }

  renderer.render(scene, camera);

  fpsFrames++; fpsTimer += dt;
  if (fpsTimer >= 0.5) {
    fpsAcc = Math.round(fpsFrames / fpsTimer);
    fpsFrames = 0; fpsTimer = 0;
    // M7:DOM 元素懒缓存 + 判空(缺失不抛错,不必每帧 getElementById)
    if (!_fpsEl) { _fpsEl = document.getElementById('fps'); _posEl = document.getElementById('pos'); }
    if (_fpsEl) _fpsEl.textContent = fpsAcc;
    if (_posEl) _posEl.textContent =
      `${playerPos.x.toFixed(1)}, ${playerPos.y.toFixed(1)}, ${playerPos.z.toFixed(1)}`;
    const pcx = Math.floor(playerPos.x / CHUNK_SIZE);
    const pcz = Math.floor(playerPos.z / CHUNK_SIZE);
    const cEl = document.getElementById('chunk');
    if (cEl) cEl.textContent = `${pcx}, ${pcz}`;
    const bEl = document.getElementById('biome');
    if (bEl) {
      const b = biomeAt(Math.floor(playerPos.x), Math.floor(playerPos.z), worldSeed);
      bEl.textContent = BIOMES[b].name;
    }
    updateInfoCount();
  }

  // 自动保存(定时)
  scheduleAutosave();
}

// 应用存档到当前游戏状态(由 loadSlot 调用)

// ============================================================
// 农作物系统(小麦,按游戏时间生长)
// 种植:手里拿 snow,对草地右键 → 幼嫩小麦(记录时间);60秒成熟(snow→leaves)
// ============================================================
const cropTimers = new Map();
const caneTimers = new Map();   // 甘蔗生长计时(R40,绝对时间戳,随存档)
const cakes = new Map();        // 蛋糕剩余片数(R40):key "x,y,z" → 1-6
function tryPlantCrop(nx, ny, nz) {
  if (selectedType !== 'snow') return false;
  if (getBlock(nx, ny - 1, nz) !== 'grass') return false;
  if (setBlock(nx, ny, nz, 'snow')) { cropTimers.set(blockKey(nx, ny, nz), Date.now()); return true; }
  return false;
}
// R55:种子种植(视觉仍用雪苗,兼容旧存档的雪苗计时器)
function tryPlantSeed(nx, ny, nz) {
  if (getBlock(nx, ny - 1, nz) !== 'grass') return false;
  if (getBlock(nx, ny, nz)) return false;
  if (setBlock(nx, ny, nz, 'snow')) { cropTimers.set(blockKey(nx, ny, nz), Date.now()); markDirtySave(); return true; }
  return false;
}
function updateCrops() {
  // 必须用 Date.now()(绝对时间):cropTimers 会随存档持久化,跨会话恢复后
  // 仍需按真实经过时间成熟。performance.now() 相对页面加载、每会话归零,会导致跨会话农作物永远不成熟。
  const now = Date.now();
  for (const [key, plantTime] of cropTimers.entries()) {
    if (now - plantTime < 60000) continue;
    const [x, y, z] = key.split(',').map(Number);
    const b = getBlock(x, y, z);
    if (b === 'snow') { setBlock(x, y, z, 'leaves'); showToast('小麦成熟了'); }
    // getBlock 对「未加载区块」与「空气」都返回 null:区块不在内存时保留计时器(R20),
    // 等玩家回访再判定;成熟标记保留(R29):cropTimers 里的 leaves 条目 = 成熟麦田
    else if (b === null && !chunks.has(chunkKey(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE)))) continue;
    else if (b !== 'snow' && b !== 'leaves') cropTimers.delete(key);
  }
}

// 甘蔗生长(R40):种下 45s 长一节,最多 3 节(经典);未加载区块保留计时
function updateCanes() {
  const now = Date.now();
  for (const [key, t0] of caneTimers.entries()) {
    if (now - t0 < 45000) continue;
    const [x, y, z] = key.split(',').map(Number);
    if (getBlock(x, y, z) !== 'sugarcane') { caneTimers.delete(key); continue; }
    if (!chunks.has(chunkKey(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE)))) continue;
    let h = 0;
    while (getBlock(x, y + h, z) === 'sugarcane' && h < 4) h++;
    if (h < 3 && !getBlock(x, y + h, z)) {
      setBlock(x, y + h, z, 'sugarcane');
      caneTimers.set(key, now);   // 下一节再等 45s
    }
  }
}

// 存档物品修复:丢弃未知 id 的损坏物品,补齐缺失字段(保留合法数量)
// (早期版本的该防御在某次重构中随 hotbar 恢复路径被移除,脏档会令
//  itemName/drawItemIcon 抛 TypeError 使读档崩溃;此处恢复契约)
function sanitizeItem(item) {
  if (!item || typeof item !== 'object') return null;
  if (item.kind === 'block') {
    if (!BLOCK_TYPES[item.id]) return null;
    const n = item.count | 0;
    const out = { kind: 'block', id: item.id };
    if (n > 0) out.count = n;   // 无 count 交 normalizeHotbar 补满
    return out;
  }
  if (item.kind === 'tool') {
    if (!TOOL_TYPES[item.id]) return null;
    const maxDur = TOOL_TYPES[item.id].durability;
    return { kind: 'tool', id: item.id, durability: Number.isFinite(item.durability) ? Math.max(1, Math.min(maxDur, item.durability)) : maxDur };
  }
  if (item.kind === 'item') {
    if (!ITEM_TYPES[item.id]) return null;
    return { kind: 'item', id: item.id, count: Math.max(1, (item.count | 0) || 1) };
  }
  return null;
}

function applySave(rec) {
  if (autosaveTimer) { clearTimeout(autosaveTimer); autosaveTimer = null; }
  const missingFields = MACHINES.validateSaveRecord(rec);
  if (missingFields.length) console.warn('存档缺少字段(可能是旧版本存档):', missingFields.join(','));
  clearWorld();
  worldSeed = (typeof rec.seed === 'number') ? rec.seed : worldSeed;
  modifications.clear();
  modsByChunk.clear();
  // R25 存档瘦身:广场 diff 不在档里时先重建已知广场(用户 diff 随后覆盖);
  // 旧档(无标记)自带全量广场 diff,直接应用即可
  worldPlazaBuilt = !!rec.plazaBuilt;
  if (worldPlazaBuilt) { buildSpawnPlaza(); buildPlaygroundProps(); }
  // 重建全局 diff 表 + 区块桶(读档一次性解析 key,游戏期间按桶直接应用)
  if (rec.modifications) {
    for (const [k, v] of rec.modifications) {
      // 脏数据防御(R47):key 非法(解析不出有限坐标)的 diff 跳过 ——
      // 否则 NaN 坐标条目会永久留在 diff 表并随下次存档扩散
      const c1 = k.indexOf(','), c2 = k.indexOf(',', c1 + 1);
      const mx = +k.slice(0, c1), my = +k.slice(c1 + 1, c2), mz = +k.slice(c2 + 1);
      if (c1 < 0 || c2 < 0 || !Number.isFinite(mx) || !Number.isFinite(my) || !Number.isFinite(mz)) continue;
      addModification(mx, my, mz, v);
    }
  }
  if (rec.playerPos && rec.playerPos.y > 1 && rec.playerPos.y < WORLD_HEIGHT
      && Number.isFinite(rec.playerPos.x) && Number.isFinite(rec.playerPos.z)) {
    playerPos.set(rec.playerPos.x, rec.playerPos.y, rec.playerPos.z);
  } else {
    // 存档位置异常 → 回广场中心
    const plazaH = SEA_LEVEL + 6;
    playerPos.set(SPAWN_X, plazaH + 1 + PLAYER_HEIGHT * 0.5, SPAWN_Z);
  }
  yaw = rec.yaw || 0; pitch = rec.pitch || 0;
  if (typeof rec.dayTime === 'number' && Number.isFinite(rec.dayTime)) dayTime = ((rec.dayTime % 1) + 1) % 1;   // 带范围校验恢复世界时间(旧档无此字段则沿用 clearWorld 重置的早晨)
  cameraMode = rec.cameraMode || 0; isFlying = rec.isFlying || false;
  velocity.set(0, 0, 0);
  wasOnGround = false; wasInWater = false;
  playerHP = (typeof rec.playerHP === 'number') ? Math.max(0, Math.min(PLAYER_MAX_HP, rec.playerHP)) : PLAYER_MAX_HP;
  hungerState.hunger = (typeof rec.playerHunger === 'number') ? Math.max(0, Math.min(20, rec.playerHunger)) : 20;
  hungerState.drain = 0; hungerState.regenT = 0; hungerState.starveT = 0;
  updateHungerBar();
  breathTimer = 0;
  if (rec.hotbar) {
    hotbar = rec.hotbar.map(sanitizeItem).slice(0, HOTBAR_SIZE);
    // 旧存档归一化:无数量字段的方块格补满一组(逻辑在 inventory.js)
    INVLIB.normalizeHotbar(hotbar);
  } else initInventory();
  for (const it of hotbar) if (it) discovered.add(it.id);   // R55:旧档已持有物品视为已发现
  currentSlot = Math.max(0, Math.min(HOTBAR_SIZE - 1, (rec.currentSlot | 0) || 0));
  // 预热玩家所在区域区块
  const pcx = Math.floor(playerPos.x / CHUNK_SIZE);
  const pcz = Math.floor(playerPos.z / CHUNK_SIZE);
  for (let dx = -2; dx <= 2; dx++)
    for (let dz = -2; dz <= 2; dz++)
      ensureChunk(pcx + dx, pcz + dz);
  for (const ch of chunks.values()) buildChunkMesh(ch);
  buildHotbar();
  updateHPBar();
  selectSlot(currentSlot);
  // 恢复门实体(clearWorld 已调 clearDoors)
  if (rec.doorsData) {
    for (const [key, d] of rec.doorsData) {
      try {
        if (!d || !Number.isFinite(d.x) || !Number.isFinite(d.y) || !Number.isFinite(d.z)) continue;
        // 确保门位置区块已生成(避免在未加载区块创建门)
        ensureChunk(Math.floor(d.x / CHUNK_SIZE), Math.floor(d.z / CHUNK_SIZE));
        const door = { x: d.x, y: d.y, z: d.z, type: d.type || 'door', open: !!d.open, facing: d.facing || 0 };
        doors.set(key, door);
        door.group = createDoorMesh(door);
        scene.add(door.group);
      } catch (e) { /* 跳过损坏的门数据 */ }
    }
  }
  if (rec.cropTimersData) { cropTimers.clear(); for (const [k,v] of rec.cropTimersData) cropTimers.set(k,v); }
  // 恢复熔炉状态(方块本体在 modifications 中,状态在这里)
  furnaces.clear();
  if (rec.furnacesData) {
    for (const f of rec.furnacesData) {
      furnaces.set(blockKey(f.x, f.y, f.z), { x: f.x, y: f.y, z: f.z, input: f.input || null, fuel: f.fuel || null, output: f.output || null, burnT: f.burnT || 0, burnMax: f.burnMax || 1, cookT: f.cookT || 0 });
    }
  }
  // 恢复箱子内容与床重生点
  chests.clear();
  if (rec.chestsData) {
    for (const c of rec.chestsData) {
      chests.set(blockKey(c.x, c.y, c.z), { x: c.x, y: c.y, z: c.z, slots: c.slots || new Array(CHEST_SLOTS).fill(null) });
    }
  }
  spawnPoint = (rec.spawnPoint && Number.isFinite(rec.spawnPoint.x) && Number.isFinite(rec.spawnPoint.y) && Number.isFinite(rec.spawnPoint.z)) ? rec.spawnPoint : null;
  // 恢复经验(R28)
  if (rec.xpData && Number.isFinite(rec.xpData.level) && Number.isFinite(rec.xpData.points)) {
    xpState.level = Math.max(0, Math.floor(rec.xpData.level));
    xpState.points = Math.max(0, Math.floor(rec.xpData.points));
  } else { xpState.level = 0; xpState.points = 0; }
  updateXPBar();
  // 恢复成就(R34;脏 id 直接忽略,旧档无此字段 = 空集)
  achvUnlocked.clear();
  if (Array.isArray(rec.achvData)) {
    for (const id of rec.achvData) if (MACHINES.ACHV_BY_ID[id]) achvUnlocked.add(id);
  }
  updateAchvBtn();
  // R55:模式/天数/统计/目标/发现/信标/宝库
  gameMode = rec.mode === 'creative' ? 'creative' : 'survival';
  settings.mode = gameMode;
  dayCount = (Number.isFinite(rec.dayCount) && rec.dayCount > 0) ? Math.floor(rec.dayCount) : 1;
  if (rec.statsData && typeof rec.statsData === 'object') {
    for (const k of ['playTime', 'blocksMined', 'blocksPlaced', 'distance', 'deaths', 'kills', 'fish', 'trades']) {
      if (Number.isFinite(rec.statsData[k])) stats[k] = rec.statsData[k];
    }
  }
  stats._lx = undefined; stats._lz = undefined;   // R55:读档首帧不累计出生点位移
  goalClaimed.clear();
  if (Array.isArray(rec.goalClaimedData)) for (const id of rec.goalClaimedData) goalClaimed.add(id);
  discovered.clear();
  if (Array.isArray(rec.discoveredData)) for (const id of rec.discoveredData) discovered.add(id);
  beacons.clear();
  if (Array.isArray(rec.beaconsData)) for (const k of rec.beaconsData) beacons.add(k);
  vaults.clear();
  if (Array.isArray(rec.vaultsData)) for (const k of rec.vaultsData) vaults.add(k);
  if (typeof updateGoalsHUD === 'function') updateGoalsHUD(true);   // 读档不补发经验,避免改写入档 XP
  // 恢复蛋糕片数(R40;旧档无字段 = 全 6 片由 getCakeSlices 惰性补)
  cakes.clear();
  if (Array.isArray(rec.cakesData)) {
    for (const [k, n] of rec.cakesData) cakes.set(k, Math.max(1, Math.min(6, n | 0)));
  }
  // 恢复活塞朝向(R42;脏数据防御:朝向 0-3)
  pistons.clear();
  if (Array.isArray(rec.pistonsData)) {
    for (const [k, f] of rec.pistonsData) if (typeof k === 'string' && Number.isInteger(f) && f >= 0 && f <= 3) pistons.set(k, f);
  }
  // 恢复矿车(R26;位置取整到所在铁轨格)
  clearMinecarts();
  if (rec.minecartsData) {
    for (const mc of rec.minecartsData) {
      if (Number.isFinite(mc.x) && Number.isFinite(mc.y) && Number.isFinite(mc.z)) spawnMinecart(mc.x, mc.y, mc.z);
    }
  }
  // 恢复生物(R27:生物入存档 —— 类型/位置/血量;激怒/燃烧等瞬态重置)
  clearMobs();
  if (rec.mobsData) {
    for (const md of rec.mobsData) {
      if (!md || !MOB_DEFS[md.t] || !Number.isFinite(md.x) || !Number.isFinite(md.y) || !Number.isFinite(md.z)) continue;
      spawnMob(md.x, md.y - 0.45, md.z, md.t, md.t === 'slime' ? { size: md.s } : undefined);   // spawnMob 内部再 +0.45 回中心位;史莱姆带体型(R35)
      const mm = mobs[mobs.length - 1];
      mm.hp = Math.max(1, Math.min(MOB_DEFS[md.t].hp, (typeof md.hp === 'number') ? md.hp : MOB_DEFS[md.t].hp));
      if (md.t === 'slime') mm.hp = Math.max(1, Math.min([1, 4, 16][mm.slimeSize], mm.hp));   // 体型上限
      if (md.baby) { mm.baby = true; mm.growT = 55; mm.mesh.scale.setScalar(0.55); }   // 幼崽(R29)
    }
  }
  // 恢复护甲装备(4 部位;脏数据防御:非法 id/部位回 null)
  for (const s of ['head', 'chest', 'legs', 'feet']) {
    const a = rec.armorSlotsData ? rec.armorSlotsData.find(e => e && e[0] === s) : null;
    const d = a && a[1] && TOOL_TYPES[a[1].id];
    armorSlots[s] = (d && d.tool === 'armor' && d.slot === s) ? { kind: 'tool', id: a[1].id, durability: a[1].durability || d.durability } : null;
  }
  updateArmorBar();
  saveDirty = false;
  // R55:读档期间 updateGoalsHUD 可能排入防抖自动保存;读档结束取消它,
  // 避免刚读完 3 秒后又强制覆盖一次(旧档迁移时尤其容易发生)
  if (typeof autosaveTimer !== 'undefined' && autosaveTimer) { clearTimeout(autosaveTimer); autosaveTimer = null; }
}

function updateInfoCount() {
  const el = document.getElementById('count');
  if (el) el.textContent = chunks.size;
}

function showFatalError(msg) {
  const el = document.getElementById('overlay') || document.createElement('div');
  el.id = 'overlay';
  el.style.cssText = 'position:fixed;inset:0;background:rgba(20,0,0,0.9);z-index:200;color:#fff;display:flex;align-items:center;justify-content:center;text-align:center;padding:40px;font-size:16px;white-space:pre-line;line-height:1.7;';
  el.textContent = msg;
  document.body.appendChild(el);
}

let toastTimer = null;
function showToast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 900);
}

function showBreakOverlay(target, ratio) {
  let el = document.getElementById('break-bar');
  if (!el) {
    el = document.createElement('div');
    el.id = 'break-bar';
    el.style.cssText = 'position:fixed;left:50%;bottom:90px;transform:translateX(-50%);width:200px;height:14px;background:rgba(0,0,0,0.5);border-radius:7px;border:1px solid rgba(255,255,255,0.3);z-index:12;overflow:hidden;';
    const fill = document.createElement('div');
    fill.id = 'break-fill';
    fill.style.cssText = 'height:100%;width:0;background:linear-gradient(90deg,#7CFC00,#5fd35f);transition:width .08s;';
    el.appendChild(fill);
    document.body.appendChild(el);
  }
  el.style.display = 'block';
  document.getElementById('break-fill').style.width = (Math.min(1, ratio) * 100) + '%';
}
function hideBreakOverlay() {
  const el = document.getElementById('break-bar');
  if (el) el.style.display = 'none';
}

