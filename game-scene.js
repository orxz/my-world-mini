// ============================================================
// 第七部分:全局状态(玩家/物品/视角)
// ============================================================
let scene, camera, renderer;
const PLAYER_HEIGHT = BALANCE.player.height;
const PLAYER_RADIUS = BALANCE.player.radius;
const GRAVITY = BALANCE.player.gravity;
const JUMP_SPEED = BALANCE.player.jump;
const WALK_SPEED = BALANCE.player.walk;
const FLY_SPEED = BALANCE.player.fly;
const SPRINT_SPEED = BALANCE.player.sprint;
const SNEAK_SPEED = BALANCE.player.sneak;

let selectedType = 'grass';

let hotbar = [];
const HOTBAR_SIZE = 9;

const keys = {};
let pitch = 0, yaw = 0;
let isFlying = false;
let onGround = false;
let cameraMode = 0;
let playerModel = null;

// R55:移动状态机(冲刺/潜行)
let isSprinting = false;
let isSneaking = false;
let lastWDown = 0;          // 双击 W 检测
let sprintLock = false;     // 双击后保持冲刺,松开 W 取消
let lastAttackTime = -99;   // 攻击冷却
let lastDamageTime = -99;   // 受击方向指示
let lastDamageDir = 0;      // 伤害来源相对玩家的水平角(弧度)

// R55:模式/进度/统计
let gameMode = 'survival';      // survival | creative
let dayCount = 1;               // 第 N 天
const stats = { playTime: 0, blocksMined: 0, blocksPlaced: 0, distance: 0, deaths: 0, kills: 0, fish: 0, trades: 0 };
const goalClaimed = new Set();  // 已领取奖励的目标 id
const discovered = new Set();   // 已发现物品(生存图鉴)
const beacons = new Set();      // 已放置的信标坐标 key
const vaults = new Set();       // 已开启的宝库坐标 key
let absorption = 0;             // 金苹果伤害吸收点数
let absorptionT = 0;            // 吸收剩余秒数
let beaconAura = false;         // 信标光环(8 格内)
let beaconRegenT = 0;
let shakeT = 0, shakeAmp = 0;   // R55 视觉:受击/爆炸镜头震动
let lastDeathCause = 'combat';
let lastDeathPos = null;
let lastRelockRequest = -1e9;   // R55:关面板后请求指针锁,抑制失败时的误暂停
let playgroundRides = null;     // R55:出生地游乐场动态设施(旋转木马/摩天轮/秋千)

// R55:按键映射(可在设置中重映射)
const KEYMAP_DEFAULT = { forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD', jump: 'Space', sneak: 'ShiftLeft', sprint: 'KeyR', inventory: 'KeyE', drop: 'KeyQ', camera: 'F5' };
let keymap = Object.assign({}, KEYMAP_DEFAULT);
let touchSprint = false, touchSneak = false;

let holdGroup = null;
let holdSwingT = 0;
let shieldActive = 0;
let raisedShield = null;   // 举盾时手持的盾引用(格挡成功扣耐久用)
let playerShadow = null;   // 玩家接地阴影(第三人称显示;生物/掉落物各自持有)

let breakTargetKey = null;
let breakProgress = 0;
let inventoryOpen = false;

const velocity = new THREE.Vector3();
const playerPos = new THREE.Vector3(0, 30, 0);

// 池化向量:热路径(每帧)复用,避免 new Vector3 造成 GC 压力
const _fwd = new THREE.Vector3();       // 移动:前方向
const _right = new THREE.Vector3();     // 移动:右方向
const _move = new THREE.Vector3();      // 移动:合成输入
const _rayEye = new THREE.Vector3();    // 射线:起点(DDA + 门检测共用)
const _rayDir = new THREE.Vector3();    // 射线:方向
const _rayNormal = new THREE.Vector3(); // 射线:命中面法线

// 掉落物(生存采集核心:破坏方块必掉落,靠近自动拾取入快捷栏)
const droppedItems = [];
// 玩家生命系统(无怪物,先建立基础设施:跌落/溺水伤害 + HUD + 存档)
let playerHP = 20;       // 10 颗心,每心 2 点
// 经验(R28):击杀生物掉经验球(磁吸吸收)升级;附魔台消耗等级附魔
const xpState = { level: 0, points: 0 };
// 护甲装备槽(经典 4 部位):格 = {kind:'tool', id, durability};手持护甲右键穿上
const armorSlots = { head: null, chest: null, legs: null, feet: null };
const ARMOR_SLOT_NAMES = { head: '头盔', chest: '胸甲', legs: '护腿', feet: '靴子' };
function totalArmorPoints() {
  let p = 0;
  for (const s in armorSlots) {
    const it = armorSlots[s];
    if (it && TOOL_TYPES[it.id]) {
      p += TOOL_TYPES[it.id].armor || 0;
      if (it.ench && it.ench.protection) p += it.ench.protection;   // 保护附魔(R28)
    }
  }
  return p;
}
let breathTimer = 0;     // 持续在水下憋气计时(秒);浮出水面归零
// 饥饿状态(状态机逻辑在 inventory.js:hungerTick;{hunger, drain, regenT, starveT})
const hungerState = { hunger: 20, drain: 0, regenT: 0, starveT: 0 };
const lastSafePos = new THREE.Vector3(0, 30, 0);  // 最后安全位置(虚空救援用)
let lastSpaceTime = 0;
let worldSeed = (Math.random() * 4294967296) >>> 0;

const highlightBox = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1.002, 1.002, 1.002)),
  new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4 })
);

// 云朵系统:高空半透明块状云面片(像素化云纹理),缓慢飘动
const clouds = [];
let cloudGeo = null;
// 块状云纹理:16×8 单元格拼出像素云团(3 个变体,确定性种子)
let cloudTextures = null;
function makeCloudTexture(seed) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 32;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 64, 32);
  ctx.fillStyle = '#ffffff';
  let st = seed >>> 0;
  const rand = () => { st = (st * 1664525 + 1013904223) >>> 0; return st / 4294967296; };
  for (let cy = 0; cy < 8; cy++) {
    for (let cx = 0; cx < 16; cx++) {
      const ddx = (cx - 7.5) / 7.5, ddy = (cy - 3.5) / 3.5;
      const d = ddx * ddx + ddy * ddy * 1.6;
      if (d < 0.5 + rand() * 0.45) ctx.fillRect(cx * 4, cy * 4, 4, 4);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  return tex;
}
function createClouds() {
  if (cloudGeo) return;   // 幂等:只构建一次几何体
  cloudGeo = new THREE.PlaneGeometry(26, 14);
  if (!cloudTextures) { cloudTextures = [makeCloudTexture(101), makeCloudTexture(202), makeCloudTexture(303)]; }
  const COUNT = 10;
  for (let i = 0; i < COUNT; i++) {
    const mat = new THREE.MeshBasicMaterial({
      map: cloudTextures[i % cloudTextures.length],
      transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide,
      fog: false,   // 云不受雾影响(避免远处被雾吞没)
    });
    const cloud = new THREE.Mesh(cloudGeo, mat);
    cloud.rotation.x = -Math.PI / 2;          // 水平平铺
    cloud.position.set(
      (Math.random() * 2 - 1) * 180,           // x: -180..180
      70 + Math.random() * 15,                 // y: 70..85
      (Math.random() * 2 - 1) * 180            // z: -180..180
    );
    // 随机朝向 + 轻微缩放,让云朵有变化
    cloud.rotation.z = Math.random() * Math.PI;
    const sc = 0.8 + Math.random() * 0.6;
    cloud.scale.set(sc, sc, sc);
    cloud.userData.speed = 0.3 + Math.random() * 0.4;   // 各自微不同的飘动速度
    scene.add(cloud);
    clouds.push(cloud);
  }
}

// ============================================================
// 天空系统:渐变天穹(顶亮/地平线雾色一致)+ 夜晚星星 + 日/月光晕
// 天穹用 MeshBasicMaterial+顶点色(与背景/雾走同一色调映射管线,衔接无缝)
// ============================================================
const skyGroup = new THREE.Group();
let skyDomeGeo = null, starMat = null, glowTexture = null;
const _skyTop = new THREE.Color();
const _skyHorizon = new THREE.Color();
const _zenithDay = new THREE.Color(0x3a7bd0);   // 白天天顶色(比天空色略深)

function makeGlowTexture() {
  if (glowTexture) return glowTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.32)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  glowTexture = new THREE.CanvasTexture(c);
  return glowTexture;
}

function createSky() {
  // 渐变天穹(每帧按昼夜刷新顶点色)
  skyDomeGeo = new THREE.SphereGeometry(420, 20, 12);
  const vcount = skyDomeGeo.attributes.position.count;
  skyDomeGeo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(vcount * 3).fill(1), 3));
  const dome = new THREE.Mesh(skyDomeGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, depthWrite: false, fog: false }));
  dome.renderOrder = -2;
  skyGroup.add(dome);
  // 星星(上半球随机分布,夜晚淡入)
  const starCount = 320;
  const pos = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    let x, y, z, l;
    do { x = Math.random() * 2 - 1; y = Math.random(); z = Math.random() * 2 - 1; l = Math.sqrt(x * x + y * y + z * z); } while (l < 0.1 || y / l < 0.03);
    pos[i * 3] = x / l * 400; pos[i * 3 + 1] = y / l * 400; pos[i * 3 + 2] = z / l * 400;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false });
  const stars = new THREE.Points(starGeo, starMat);
  stars.renderOrder = -1;
  skyGroup.add(stars);
  scene.add(skyGroup);
  // 日/月光晕(叠加混合 Sprite,挂在天体 mesh 上随其升降)
  const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeGlowTexture(), color: 0xffeeaa, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  sunGlow.scale.set(60, 60, 1);
  sunMeshRef.add(sunGlow);
  const moonGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeGlowTexture(), color: 0xaabbff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  moonGlow.scale.set(34, 34, 1);
  moonMeshRef.add(moonGlow);
}

// 刷新天穹顶点色(地平线=天空/雾色,与远处地形雾衔接无缝;天顶=白天稍深蓝)
function updateSky(tDay) {
  _skyHorizon.copy(_dayColor);
  _skyTop.copy(_dayColor);
  if (tDay > 0) _skyTop.lerp(_zenithDay, 0.35 * tDay);
  // 雨天:天穹整体灰化
  if (weather === 'rain') {
    _skyHorizon.lerp(_rainGray, 0.55);
    _skyTop.lerp(_rainGray, 0.55);
  }
  const pos = skyDomeGeo.attributes.position, col = skyDomeGeo.attributes.color;
  for (let i = 0; i < pos.count; i++) {
    const h = pos.getY(i) / 420;
    let t = (h + 0.06) / 0.48;
    t = Math.max(0, Math.min(1, t));
    t = t * t * (3 - 2 * t);
    col.setXYZ(i,
      _skyHorizon.r + (_skyTop.r - _skyHorizon.r) * t,
      _skyHorizon.g + (_skyTop.g - _skyHorizon.g) * t,
      _skyHorizon.b + (_skyTop.b - _skyHorizon.b) * t);
  }
  col.needsUpdate = true;
  if (starMat) starMat.opacity = (1 - tDay) * 0.9;
}

// ============================================================
// 天气系统(经典:随机下雨 —— 雨滴粒子 / 天色变暗 / 雨声;暂停菜单可关)
// ============================================================
const _rainGray = new THREE.Color(0x6a7580);
let weather = 'clear';            // 'clear' | 'rain'
let weatherTimer = 90;            // 距离下次天气 roll(秒)
let rainMesh = null;              // 雨滴 Points
const RAIN_COUNT = 420;
const RAIN_AREA = 44;             // 覆盖半径(格)
const RAIN_SPEED_MIN = 18, RAIN_SPEED_MAX = 26;

function createRain() {
  if (rainMesh) return;
  const pos = new Float32Array(RAIN_COUNT * 3);
  const spd = new Float32Array(RAIN_COUNT);
  for (let i = 0; i < RAIN_COUNT; i++) {
    pos[i * 3] = (Math.random() * 2 - 1) * RAIN_AREA;
    pos[i * 3 + 1] = Math.random() * 28;
    pos[i * 3 + 2] = (Math.random() * 2 - 1) * RAIN_AREA;
    spd[i] = RAIN_SPEED_MIN + Math.random() * (RAIN_SPEED_MAX - RAIN_SPEED_MIN);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color: 0x9ab8d8, size: 0.12, transparent: true, opacity: 0.65,
    depthWrite: false, fog: true, sizeAttenuation: true,
  });
  rainMesh = new THREE.Points(geo, mat);
  rainMesh.userData.speeds = spd;
  rainMesh.visible = false;
  rainMesh.frustumCulled = false;   // 手动跟随玩家,避免视锥剔除
  scene.add(rainMesh);
}

function setWeather(w) {
  weather = w;
  if (rainMesh) rainMesh.visible = (w === 'rain');
  updateRainAudio();
  showToast(w === 'rain' ? '🌧️ 下雨了' : '🌤️ 雨停了');
}

function updateWeather(dt) {
  if (!settings.weather) { if (weather !== 'clear') { weather = 'clear'; if (rainMesh) rainMesh.visible = false; updateRainAudio(); } return; }
  // 天气状态机转移走纯模块 machines.weatherNext(R25);视觉/音效由 setWeather 应用
  const wn = MACHINES.weatherNext(weather, weatherTimer, dt, Math.random);
  weatherTimer = wn.timer;
  if (wn.weather !== weather) setWeather(wn.weather);
  // 雨滴下落 + 跟随玩家(超界回顶循环;垂直以玩家为基准,山地高处也有雨)
  if (weather === 'rain' && rainMesh) {
    const posAttr = rainMesh.geometry.attributes.position;
    const arr = posAttr.array, spd = rainMesh.userData.speeds;
    const px = playerPos.x, pz = playerPos.z, py = playerPos.y;
    for (let i = 0; i < RAIN_COUNT; i++) {
      let y = arr[i * 3 + 1] - spd[i] * dt;
      if (y < py - 12) y = py + 12 + Math.random() * 6;
      arr[i * 3 + 1] = y;
      // 水平跟随:保持雨滴在玩家周围区域内(超出则折返)
      const dx = arr[i * 3] - px, dz = arr[i * 3 + 2] - pz;
      if (dx > RAIN_AREA) arr[i * 3] -= RAIN_AREA * 2; else if (dx < -RAIN_AREA) arr[i * 3] += RAIN_AREA * 2;
      if (dz > RAIN_AREA) arr[i * 3 + 2] -= RAIN_AREA * 2; else if (dz < -RAIN_AREA) arr[i * 3 + 2] += RAIN_AREA * 2;
    }
    posAttr.needsUpdate = true;
  }
}

// 雨声:循环白噪声 + 低通(随天气开关淡入淡出)
function updateRainAudio() {
  if (!audio.ctx || !audio.masterGain) return;
  if (weather === 'rain' && settings.weather && !audio._rainSrc) {
    try {
      const len = audio.ctx.sampleRate * 2;
      const buf = audio.ctx.createBuffer(1, len, audio.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const src = audio.ctx.createBufferSource();
      src.buffer = buf; src.loop = true;
      const filt = audio.ctx.createBiquadFilter();
      filt.type = 'lowpass'; filt.frequency.value = 900;
      const g = audio.ctx.createGain();
      g.gain.value = 0;
      g.gain.linearRampToValueAtTime(0.12, audio.ctx.currentTime + 2);   // 淡入
      src.connect(filt); filt.connect(g); g.connect(audio.masterGain);
      src.start();
      audio._rainSrc = src; audio._rainGain = g;
    } catch (e) { /* 音频失败静默 */ }
  } else if (weather !== 'rain' && audio._rainSrc) {
    try {
      const g = audio._rainGain, src = audio._rainSrc;
      g.gain.linearRampToValueAtTime(0, audio.ctx.currentTime + 1.5);   // 淡出
      setTimeout(() => { try { src.stop(); } catch (e2) { console.debug('雨声源停止失败(忽略):', e2); } }, 1600);
    } catch (e) { /* 忽略 */ }
    audio._rainSrc = null; audio._rainGain = null;
  }
}

// 更新云朵:缓慢 +x 方向飘动,越过 x=200 后重置到 x=-200(环绕)
function updateClouds(dt) {
  for (const c of clouds) {
    c.position.x += c.userData.speed * dt;
    if (c.position.x > 200) c.position.x = -200;
  }
}

// ============================================================
// 第八部分:玩家模型(第三人称,沿用旧实现)
// ============================================================
// 玩家模型(第三人称可见) —— Steve 风格人形,头部贴图含五官,身体分区着色
// 约定:所有肢体用 Group,旋转中心在肢体顶端(肩/髋),便于行走摆动;
// userData 必须包含 {armL, armR, legL, legR, heldMount, walkPhase}(动画与手持物依赖)
// 玩家模型(第三人称可见) —— Steve 风格人形
// 【尺寸标准】model-space: 脚底 y=0,头顶 y=1.70(= PLAYER_HEIGHT)
// 这样模型严格包裹在碰撞盒 [−0.85, +0.85] 内,锚点放 playerPos.y − 0.85(碰撞盒底)即脚踩地,不穿墙。
// userData 必须保留 {armL, armR, legL, legR, heldMount, walkPhase}(动画依赖)
// 玩家模型(第三人称可见) —— 全新人形,严格匹配 PLAYER_HEIGHT=1.7 碰撞盒
// model-space 约定:脚底 y=0,头顶 y=1.70(=PLAYER_HEIGHT),所有部件水平半宽 < PLAYER_RADIUS(0.30)
// 这样锚点放 playerPos.y - PLAYER_HEIGHT*0.5(碰撞盒底)时,模型严格包裹在碰撞盒内,绝不穿墙。
// userData 契约(动画 + 手持物依赖):{armL, armR, legL, legR, heldMount, walkPhase, swingT}
// 玩家模型(Minecraft Steve 风格):大头、短四肢、紧凑身体
// model-space: 脚底 y=0,头顶(含头发)y≈1.80。锚点=碰撞盒底,脚踩地。
// userData 契约:{armL, armR, legL, legR, heldMount, walkPhase, swingT, fadeMats}
function buildPlayerModel() {
  playerModel = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0xf0c090 });
  const shirt = new THREE.MeshLambertMaterial({ color: 0x3a7ad6 });
  const sleeve = new THREE.MeshLambertMaterial({ color: 0x4985d6 });
  const pants = new THREE.MeshLambertMaterial({ color: 0x4a5a7a });
  const shoe = new THREE.MeshLambertMaterial({ color: 0x2a2a2a });
  const hair = new THREE.MeshLambertMaterial({ color: 0x3a2412 });

  // 头部(1.30~1.62,中心 1.46)—— 大头,占身高 ~18%
  const headMats = makeHeadMaterials(skin, hair);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.36, 0.42), headMats);
  head.position.y = 1.46;
  // 头发
  const hairCap = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.14, 0.46), hair);
  hairCap.position.y = 1.60;
  const hairBack = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.28, 0.08), hair);
  hairBack.position.set(0, 1.49, -0.21);
  const hairSideL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.24, 0.42), hair);
  hairSideL.position.set(-0.23, 1.47, 0);
  const hairSideR = hairSideL.clone(); hairSideR.position.x = 0.23;

  // 躯干(0.78~1.30,中心 1.04,高 0.52)—— 宽身
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.52, 0.25), shirt);
  torso.position.y = 1.04;

  // 手臂(肩 y=1.26)—— Group 旋转中心在肩,上臂+手共 0.46
  function makeArm(side) {
    const g = new THREE.Group();
    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.30, 0.16), sleeve);
    upper.position.y = -0.15;
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.16, 0.15), skin);
    hand.position.y = -0.38;
    g.add(upper, hand);
    g.position.set(side * 0.29, 1.26, 0);
    return g;
  }
  const armL = makeArm(-1);
  const armR = makeArm(1);
  // 右手挂点(手持物):在手部位置,略向前抬(持物感,避免"夹在腋下")
  const heldMount = new THREE.Group();
  heldMount.position.set(0, -0.42, 0.18);
  armR.add(heldMount);

  // 腿(髋 y=0.78)—— 短腿,裤腿+鞋共 0.78
  function makeLeg(side) {
    const g = new THREE.Group();
    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.54, 0.19), pants);
    upper.position.y = -0.27;
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.24, 0.28), shoe);
    foot.position.set(0, -0.66, 0.04);   // 鞋底=0(脚踩地)
    g.add(upper, foot);
    g.position.set(side * 0.11, 0.78, 0);
    return g;
  }
  const legL = makeLeg(-1);
  const legR = makeLeg(1);

  playerModel.add(torso, head, hairCap, hairBack, hairSideL, hairSideR, armL, armR, legL, legR);
  // 贴墙淡出材质表:全部为本模型专属实例(头部 6 面含 clone/派生),可安全改 opacity
  const fadeMats = [skin, shirt, sleeve, pants, shoe, hair, ...headMats];
  playerModel.userData = { armL, armR, legL, legR, walkPhase: 0, swingT: 0, heldMount, fadeMats };
  playerModel.visible = false;
  scene.add(playerModel);
  if (!playerShadow) playerShadow = makeBlobShadow(0.75);   // 接地阴影(第三人称显示)
}

// ============================================================
// 第九部分:手持物品与工具模型(沿用旧实现)
// ============================================================
// 第一人称手持物容器:挂在相机上(屏幕右下角),本地坐标
function buildHoldGroup() {
  holdGroup = new THREE.Group();
  holdGroup.position.set(HOLD_BASE.x, HOLD_BASE.y, HOLD_BASE.z);   // 右下前方
  holdGroup.rotation.set(0, 0, 0);
  // 手臂:肤色,从屏幕右下伸向画面中心(空手也显示,经典 MC 观感;消除手持物"无依托悬浮"感)
  const arm = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, 0.22, 0.6),
    new THREE.MeshLambertMaterial({ color: 0xf0c090 })
  );
  arm.position.set(-0.26, 0.16, 0.32);
  arm.rotation.set(-0.55, 0.5, 0.15);
  holdGroup.add(arm);
  holdGroup.userData.arm = arm;
  camera.add(holdGroup);
  updateHoldItem();
}

// 刷新手持物(FP 屏幕右下 + TP 玩家右手),在 selectSlot 时调用
// 刷新手持物:方块/工具/材料都在 FP(屏幕右下)和 TP(玩家右手)显示
// 在 selectSlot 时调用。默认第1格是方块 → 持续手持显示。
// 刷新手持物:方块/工具/材料都在 FP(屏幕右下)和 TP(玩家右手)显示
function updateHoldItem() {
  // 清空旧物品(手臂是常驻件,保留)
  if (holdGroup) {
    for (let i = holdGroup.children.length - 1; i >= 0; i--) {
      const c = holdGroup.children[i];
      if (c !== holdGroup.userData.arm) holdGroup.remove(c);
    }
  }
  const heldMount = playerModel ? playerModel.userData.heldMount : null;
  if (heldMount) { while (heldMount.children.length) heldMount.remove(heldMount.children[0]); }

  const item = hotbar[currentSlot];
  if (!item) return;

  let base;
  if (item.kind === 'block') {
    base = new THREE.Mesh(blockGeo, materials[item.id]);   // 1x1x1
  } else if (item.kind === 'tool') {
    base = buildToolMesh(item.id);                          // Group,内部已缩放好
  } else if (item.kind === 'item') {
    base = buildMaterialMesh(item.id);                      // Group
  } else { return; }

  // 第一人称(屏幕右下,手臂前端;方块收小避免占屏过大)
  if (holdGroup) {
    const fp = base.clone();
    if (item.kind === 'block') { fp.scale.setScalar(0.30); fp.rotation.set(0.2, 0.55, 0); fp.position.set(0, 0.02, 0); }
    else if (item.kind === 'tool') { fp.scale.setScalar(1.0); fp.rotation.set(0.1, 0.3, 0); }   // 工具保留原尺寸
    else { fp.scale.setScalar(0.6); fp.rotation.set(0.3, 0.6, 0.2); }
    holdGroup.add(fp);
  }
  // 第三人称(玩家右手):工具保留原尺寸(不双重缩放)
  if (heldMount) {
    const tp = base.clone();
    if (item.kind === 'block') { tp.scale.setScalar(0.35); tp.rotation.set(0.4, 0.5, 0); }
    else if (item.kind === 'tool') { tp.scale.setScalar(0.85); tp.rotation.set(0.3, 0.2, 0); }  // 工具略小但清晰
    else { tp.scale.setScalar(0.45); tp.rotation.set(0.4, 0.5, 0.2); }
    heldMount.add(tp);
  }
}

const blockGeo = new THREE.BoxGeometry(1, 1, 1);

// ============================================================
// 第九部分补充:实体接地阴影(blob shadow)—— 修复"视觉悬浮"感
// 半透明径向渐变圆片贴在脚下地面,随离地高度缩小/淡出;
// 玩家(第三人称)/生物/掉落物共用,几何与纹理全局共享
// ============================================================
let blobShadowTex = null;
function getBlobShadowTex() {
  if (blobShadowTex) return blobShadowTex;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 4, 32, 32, 30);
  g.addColorStop(0, 'rgba(0,0,0,0.55)');
  g.addColorStop(0.7, 'rgba(0,0,0,0.25)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  blobShadowTex = new THREE.CanvasTexture(cv);
  // 预热上传 GPU:避免首个阴影实体出现时纹理计数中途变化(性能长测的内存稳定性口径)
  if (typeof renderer !== 'undefined' && renderer && renderer.initTexture) renderer.initTexture(blobShadowTex);
  return blobShadowTex;
}
const blobShadowGeo = new THREE.PlaneGeometry(1, 1);

function makeBlobShadow(size) {
  const m = new THREE.Mesh(blobShadowGeo, new THREE.MeshBasicMaterial({
    map: getBlobShadowTex(), transparent: true, depthWrite: false,
  }));
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 1;              // 在地形之后绘制,避免与顶面深度冲突
  m.userData.baseSize = size;
  m.visible = false;
  scene.add(m);
  return m;
}

function removeBlobShadow(sh) {
  if (!sh) return;
  scene.remove(sh);
  sh.material.dispose();          // 几何/纹理全局共享,不在此释放
}

// 每帧调用:从脚部向下找支撑面(最多 12 格),圆片贴地并随离地高度淡出
function updateBlobShadow(sh, x, z, feetY) {
  if (!sh) return;
  const bx = Math.floor(x), bz = Math.floor(z);
  const yEnd = Math.max(0, Math.floor(feetY) - 12);
  let gy = -1;
  for (let y = Math.floor(feetY); y >= yEnd; y--) {
    if (isSolidAt(bx, y, bz)) { gy = y; break; }
  }
  if (gy < 0) { sh.visible = false; return; }   // 脚下无地面(悬空/未加载区块)
  const h = feetY - (gy + 1);                    // 离地高度
  if (h > 5) { sh.visible = false; return; }     // 太高淡出殆尽,不再绘制
  const k = Math.max(0, 1 - h * 0.18);           // 贴地 1 → 升空渐减
  sh.visible = true;
  sh.position.set(x, gy + 1 + 0.02, z);
  sh.scale.setScalar(sh.userData.baseSize * (0.8 + 0.2 * k));
  sh.material.opacity = 0.15 + 0.75 * k;
}


function buildToolMesh(toolId) {
  const def = TOOL_TYPES[toolId];
  const g = new THREE.Group();
  const tc = tierColorOf(def.tier);
  const matTier = new THREE.MeshLambertMaterial({ color: tc });
  const matHandle = new THREE.MeshLambertMaterial({ color: 0x6e4f2a });
  const handleGeo = new THREE.BoxGeometry(0.05, 0.05, 0.3);
  if (def.tool === 'sword') {
    const handle = new THREE.Mesh(handleGeo, matHandle);
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.04, 0.05), matHandle);
    guard.position.y = 0.17;
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.45, 0.02), matTier);
    blade.position.y = 0.42;
    g.add(handle, guard, blade);
    g.rotation.z = -0.3; g.position.y = -0.1;
  } else if (def.tool === 'bow') {
    const arc = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.02, 8, 16, Math.PI * 1.2), matHandle);
    arc.rotation.z = Math.PI / 2; g.add(arc); g.rotation.z = -0.2;
  } else if (def.tool === 'shield') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.45, 0.05), matTier);
    g.add(body); g.rotation.y = 0.2;
  } else if (def.tool === 'rod') {
    // 钓鱼竿(R29):细长斜杆 + 浮标
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.55), matHandle);
    pole.rotation.x = 0.7;
    g.add(pole);
    const bob = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.07), new THREE.MeshLambertMaterial({ color: 0xd03030 }));
    bob.position.set(0, 0.1, -0.25);
    g.add(bob);
  } else if (def.tool === 'armor') {
    // 护甲:按部位大小的护甲板(手持短暂展示,右键即穿上)
    const h = def.slot === 'chest' ? 0.38 : (def.slot === 'head' ? 0.24 : 0.2);
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.32, h, 0.1), matTier);
    g.add(body); g.rotation.y = 0.2;
  } else {
    // 镐/斧/铲:统一斜柄,但头部按工具类型区分形状,与图标一致
    const handle = new THREE.Mesh(handleGeo, matHandle); handle.rotation.x = 0.5;
    if (def.tool === 'pickaxe') {
      // 镐头:柄顶向两侧伸出的尖(两个小斜块)
      const headL = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.05, 0.05), matTier);
      headL.position.set(-0.09, 0.18, 0.05); headL.rotation.z = 0.5;
      const headR = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.05, 0.05), matTier);
      headR.position.set(0.09, 0.18, 0.05); headR.rotation.z = -0.5;
      g.add(handle, headL, headR);
    } else if (def.tool === 'axe') {
      // 斧头:单侧梯形刃(偏向一侧)
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.16, 0.05), matTier);
      head.position.set(0.08, 0.18, 0.05);
      g.add(handle, head);
    } else { // shovel
      // 铲头:略凹的宽薄斗
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.10, 0.06), matTier);
      head.position.set(0, 0.18, 0.05);
      g.add(handle, head);
    }
    g.rotation.z = -0.4;
  }
  g.scale.setScalar(0.9);  // 工具整体尺寸(与身体比例匹配,武器清晰可见)
  g.position.set(0, -0.08, -0.08);
  g.traverse(function(o) { if (o.isMesh) o.userData._owned = true; });
  return g;
}

function buildMaterialMesh(itemId) {
  const def = ITEM_TYPES[itemId];
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: def.color });
  if (def.shape === 'gem') { g.add(new THREE.Mesh(new THREE.OctahedronGeometry(0.14), mat)); }
  else if (def.shape === 'ingot') { g.add(new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.08, 0.14), mat)); }
  else if (def.shape === 'cart') { const b = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.16, 0.2), mat); g.add(b); g.rotation.y = 0.3; }
  else if (def.shape === 'bucket') {
    // 铁桶(R36):梯形近似 = 略宽的桶身;水桶顶加薄水面
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.24, 0.2), mat));
    if (itemId === 'water_bucket') {
      const w = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.04, 0.18), new THREE.MeshLambertMaterial({ color: 0x2a8fd6 }));
      w.position.y = 0.13;
      g.add(w);
    }
  }
  else { g.add(new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.3), mat)); }
  g.rotation.set(0.3, 0.6, 0.2);
  g.position.set(0, -0.05, 0);
  g.traverse(function(o) { if (o.isMesh) o.userData._owned = true; });
  return g;
}

function swingHoldItem() { holdSwingT = 0.001; }

// 第一人称手持物动画:空闲浮动 + 使用挥动 + 举盾
// 基础位置 (0.55,-0.45,-0.85)(buildHoldGroup 设定)
const HOLD_BASE = { x: 0.55, y: -0.45, z: -0.85 };
function updateHoldAnim(dt) {
  if (!holdGroup) return;
  const item = hotbar[currentSlot];
  const isShield = item && item.kind === 'tool' && TOOL_TYPES[item.id].tool === 'shield';
  // 盾计时无条件衰减(切槽/死亡后不再冻结 → 修复永久格挡)
  if (shieldActive > 0) {
    shieldActive -= dt;
    if (shieldActive <= 0) { shieldActive = 0; raisedShield = null; }
  }
  // 举盾:盾抬到正前方居中
  if (isShield && shieldActive > 0) {
    holdGroup.position.set(0, -0.20, -0.75);
    holdGroup.rotation.set(0, 0, 0);
    return;
  }
  // 空闲:轻柔上下浮动 + Y 轴微旋(手持物有生命感)
  const now = performance.now();
  const idleBob = Math.sin(now * 0.0025) * 0.012;
  const idleRot = Math.sin(now * 0.0015) * 0.05;
  if (holdSwingT <= 0) {
    holdGroup.position.set(HOLD_BASE.x, HOLD_BASE.y + idleBob, HOLD_BASE.z);
    holdGroup.rotation.set(idleRot * 0.3, idleRot, 0);
    return;
  }
  // 挥动:向下挥再回位
  holdSwingT += dt;
  const p = holdSwingT / 0.25;
  if (p >= 1) {
    holdSwingT = 0;
    holdGroup.position.set(HOLD_BASE.x, HOLD_BASE.y, HOLD_BASE.z);
    holdGroup.rotation.set(0, 0, 0);
  } else {
    const s = Math.sin(p * Math.PI);
    holdGroup.rotation.x = -s * 1.1;
    holdGroup.position.set(HOLD_BASE.x, HOLD_BASE.y - s * 0.14, HOLD_BASE.z);
  }
}

function makeHeadMaterials(skinMat, hairMat) {
  // 头部 6 面材质:正面(z+)画五官(眉/眼/鼻/嘴/腮红),侧/后/顶贴发色,底肤色
  // 用确定性纹理(固定像素布局,非随机)保证每个玩家形象稳定一致
  const faceTex = makePixelTexture((ctx, s) => {
    // 肤色底 + 细微固定噪点
    ctx.fillStyle = '#f0c090'; ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#e8b888';
    ctx.fillRect(2, 2, 2, 1); ctx.fillRect(s-4, 3, 2, 1); ctx.fillRect(5, s-3, 1, 1);
    // 刘海(顶部不规则一行)
    ctx.fillStyle = '#3a2412';
    for (let x = 0; x < s; x++) { if (x % 3 !== 2) ctx.fillRect(x, 0, 1, 2); }
    // 眉毛(两道粗短横线)
    ctx.fillStyle = '#3a2412';
    ctx.fillRect(Math.floor(s*0.20), Math.floor(s*0.36), 3, 1);
    ctx.fillRect(Math.floor(s*0.58), Math.floor(s*0.36), 3, 1);
    // 眼睛:白眼底 + 蓝瞳 + 黑瞳点(Steve 蓝眼)
    const ey = Math.floor(s * 0.44);
    for (const ex of [Math.floor(s * 0.22), Math.floor(s * 0.58)]) {
      ctx.fillStyle = '#ffffff'; ctx.fillRect(ex, ey, 3, 2);
      ctx.fillStyle = '#5a7ad6'; ctx.fillRect(ex + 1, ey, 2, 2);
      ctx.fillStyle = '#2a2a2a'; ctx.fillRect(ex + 1, ey + 1, 1, 1);
    }
    // 鼻子(中线一小段略深肤色)
    ctx.fillStyle = '#d8a878';
    ctx.fillRect(Math.floor(s*0.47), Math.floor(s*0.52), 2, 3);
    // 嘴(两行,略红)
    ctx.fillStyle = '#a85a4a';
    ctx.fillRect(Math.floor(s * 0.36), Math.floor(s * 0.68), Math.floor(s * 0.28), 1);
    ctx.fillStyle = '#8a4a3a';
    ctx.fillRect(Math.floor(s * 0.36), Math.floor(s * 0.70), Math.floor(s * 0.28), 1);
    // 腮红
    ctx.fillStyle = 'rgba(220,130,110,0.35)';
    ctx.fillRect(Math.floor(s*0.12), Math.floor(s*0.58), 2, 2);
    ctx.fillRect(Math.floor(s*0.78), Math.floor(s*0.58), 2, 2);
    // 下颌胡茬阴影
    ctx.fillStyle = 'rgba(120,80,60,0.25)';
    ctx.fillRect(3, s-2, s-6, 1);
  });
  // 侧面:前侧鬓角(发色过渡)+ 肤色
  const sideTex = makePixelTexture((ctx, s) => {
    ctx.fillStyle = '#f0c090'; ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#3a2412'; for (let y = 0; y < 5; y++) ctx.fillRect(0, y, 1, 1);
  });
  const sideMat = skinMat.clone(); sideMat.map = sideTex;
  const front = skinMat.clone(); front.map = faceTex;
  return [
    sideMat,        // +x 右脸(带鬓角)
    sideMat.clone(),// -x 左脸(带鬓角)
    hairMat,        // +y 头顶(头发色)
    skinMat,        // -y 下巴(肤色)
    front,          // +z 正脸(带五官)
    skinMat,        // -z 后脑(肤色,发套另建模覆盖)
  ];
}

// ============================================================
// 第十部分:第三人称相机(沿用旧实现)
// ============================================================
// 第三人称相机:背后(模式1)/正面(模式2)
// 设计:距离 4 米(原版同款,模型占屏适中不挡准星),相机过肩
// (+0.55 ≈ 头顶),碰撞时拉近;拉近到贴脸时模型按距离淡出(不糊屏)
// 贴墙淡出系数应用:1=不透明(常态);<1 线性透明;≤0.02 隐藏模型(连带接地阴影)
// 材质均为玩家专属实例(见 buildPlayerModel 的 fadeMats),改 opacity 不影响其它实体;
// 手持物(heldMount)材质可能共享方块材质表,跟随手臂按阈值整体显隐
function setPlayerModelFade(f) {
  if (!playerModel) return;
  const ud = playerModel.userData;
  if (ud.fadeMats) {
    for (const m of ud.fadeMats) {
      m.opacity = f;
      m.transparent = f < 1;
      m.depthWrite = f >= 0.55;   // 半透时关深度写,避免头/躯干/四肢互相深度冲突
    }
  }
  playerModel.visible = f > 0.02 && cameraMode !== 0;
  if (ud.heldMount) ud.heldMount.visible = f > 0.35;
}

function updateThirdPersonCamera() {
  if (cameraMode === 0) {
    playerModel.visible = false;
    setPlayerModelFade(1);                 // 恢复不透明(避免切回 TP 残留透明)
    if (camera.fov !== 75) { camera.fov = 75; camera.updateProjectionMatrix(); }
    return;
  }
  playerModel.visible = true;
  // 模型锚点:碰撞盒底(模型 model-space 脚底=0,故脚踩地)
  // 模型脸在本地 +z,而玩家朝向 forward=(-sin yaw, -cos yaw) 即 yaw=0 时朝 -z
  // → 需 +π 对齐:否则背后视角看到正脸、正面视角看到后脑勺
  playerModel.position.set(playerPos.x, playerPos.y - PLAYER_HEIGHT * 0.5, playerPos.z);
  playerModel.rotation.y = yaw + Math.PI;

  // 理想相机位置:玩家身后(或身前),沿水平朝向偏移
  const dist = 4.0;                       // 距离(原版第三人称同款;3.5 时模型占屏过大、平视挡准星)
  const dir = cameraMode === 1 ? 1 : -1;  // 1=背后, -1=正面
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  const eyeY = playerPos.y + 0.15;        // 碰撞锚点:眼睛(=playerPos)略上,避免眼线贴方块误拉近
  // 相机过肩取景:+0.55(约玩家头顶高度,模型落到画面中下、准星越过头顶);
  // 高度差是准星与挖掘落点的固定平移视差,远近处 <1 格,原版亦然;
  // 相机 pitch 仍与挖掘射线完全平行(角度零偏差,见下方 rotation.x = pitch)
  const idealX = playerPos.x - fx * dist * dir;
  const idealZ = playerPos.z - fz * dist * dir;
  const idealY = playerPos.y + 0.55;

  // 相机碰撞:沿"眼睛→理想位置"步进,遇方块拉近(避免穿墙)
  const clear = raycastCameraClearDist(playerPos.x, eyeY, playerPos.z, idealX, idealY, idealZ);
  const safe = Math.max(0.8, clear);      // 最小 0.8 避免贴脸
  const t = safe / dist;
  // 贴墙淡出(原版行为):被墙挤到 ≤1.8 格时模型开始透明,≤1.0 格完全隐藏,
  // 避免模型糊满屏幕挡死视野;恢复正常距离自动回实
  setPlayerModelFade(Math.min(1, Math.max(0, (safe - 1.0) / 0.8)));
  camera.position.set(
    playerPos.x + (idealX - playerPos.x) * t,
    eyeY + (idealY - eyeY) * t,
    playerPos.z + (idealZ - playerPos.z) * t
  );
  camera.rotation.order = 'YXZ';
  // 相机朝向:背后视角看玩家背影;正面视角相机转向玩家( yaw+π )
  camera.rotation.y = yaw + (dir < 0 ? Math.PI : 0);
  // 与挖掘射线(raycastTarget 用全量 pitch)完全平行:准星即落点
  // (旧实现 -0.15+pitch*0.5 导致第三人称准星与实际目标错位)
  camera.rotation.x = pitch;
  camera.rotation.z = 0;   // 第三人称无 roll(避免第一人称视角摆动残留)
  camera.fov = 70;
  camera.updateProjectionMatrix();
}

function raycastCameraClearDist(x0, y0, z0, x1, y1, z1) {
  const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
  const fullDist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (fullDist < 0.001) return 0;
  const steps = Math.ceil(fullDist / 0.2);
  const sx = dx / steps, sy = dy / steps, sz = dz / steps;
  let cx = x0, cy = y0, cz = z0;
  for (let i = 0; i < steps; i++) {
    cx += sx; cy += sy; cz += sz;
    if (isSolidAt(Math.floor(cx), Math.floor(cy), Math.floor(cz))) {
      return Math.max(0.6, (fullDist * i / steps) - 0.2);
    }
  }
  return fullDist;
}

function cycleCameraMode() {
  cameraMode = (cameraMode + 1) % 3;
  const names = ['第一人称', '第三人称(背后)', '第三人称(正面)'];
  showToast('视角:' + names[cameraMode]);
}

