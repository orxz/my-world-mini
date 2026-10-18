// ============================================================
// 破坏裂纹覆盖层(Minecraft 风格:方块表面随进度出现裂纹,4 阶段)
// ============================================================
let crackMesh = null, crackMats = null, breakCostTotal = 1;
function makeCrackTexture(stage) {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const ctx = c.getContext('2d');
  // 确定性伪随机(固定种子,每次加载裂纹一致)
  let st = (1234567 + stage * 7919) >>> 0;
  const rand = () => { st = (st * 1664525 + 1013904223) >>> 0; return st / 4294967296; };
  ctx.strokeStyle = 'rgba(15,12,8,0.68)';
  ctx.lineCap = 'round';
  const lines = 3 + stage * 2;
  for (let i = 0; i < lines; i++) {
    let x = 4 + rand() * 24, y = 4 + rand() * 24;
    ctx.lineWidth = (stage >= 2 && rand() < 0.4) ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    const segs = 3 + ((rand() * 3) | 0);
    for (let sgi = 0; sgi < segs; sgi++) {
      x = Math.max(1, Math.min(31, x + (rand() - 0.5) * 12));
      y = Math.max(1, Math.min(31, y + (rand() - 0.5) * 12));
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  return tex;
}
function createCrackOverlay() {
  crackMats = [];
  for (let s = 0; s < 4; s++) {
    crackMats.push(new THREE.MeshBasicMaterial({ map: makeCrackTexture(s), transparent: true, depthWrite: false }));
  }
  crackMesh = new THREE.Mesh(new THREE.BoxGeometry(1.004, 1.004, 1.004), crackMats[0]);
  crackMesh.visible = false;
  crackMesh.renderOrder = 2;
  scene.add(crackMesh);
}

// ============================================================
// 掉落物实体(生存采集:破坏方块/Q 丢弃生成,靠近自动拾取入快捷栏)
// ============================================================
// 小旋转方块(0.3 大小),从被破坏方块中心生成,受重力 + 地面支撑,30 秒后淡出消失
// pickupDelay 期间不可拾取;之后玩家走近自动收入快捷栏(堆叠×64,满了留在地上)
let dropItemGeo = null;
const itemDropMatCache = {};
function getItemDropMat(id) {
  if (!itemDropMatCache[id]) {
    itemDropMatCache[id] = new THREE.MeshLambertMaterial({ color: (ITEM_TYPES[id] || {}).color || 0xcccccc });
  }
  return itemDropMatCache[id];
}
function spawnDroppedItem(x, y, z, itemId, count = 1, kind = 'block', durability) {
  if (!dropItemGeo) dropItemGeo = new THREE.BoxGeometry(0.3, 0.3, 0.3);
  const mat = materials[itemId] || getItemDropMat(itemId);
  const mesh = new THREE.Mesh(dropItemGeo, mat);
  mesh.position.set(x + 0.5, y + 0.5, z + 0.5);
  mesh.userData = {
    kind,
    type: itemId,
    count: count || 1,   // 掉落物携带数量(Q 丢弃整组时保留)
    durability,          // 工具耐久(Q 丢弃工具时保留,拾取时还原)
    life: 30,          // 30 秒后消失
    pickupDelay: 0.5,  // 生成后 0.5 秒内不可拾取,避免刚破坏就吸回
    vy: 1.5 + Math.random() * 1.0,   // 初始上抛一点
    baseY: 0,
  };
  scene.add(mesh);
  mesh.userData.shadow = makeBlobShadow(0.34);   // 接地阴影
  droppedItems.push(mesh);
  return mesh;
}

// 拾取入栏(委托纯函数模块 inventory.js;渲染/存档副作用在此)
function pickupIntoInventory(kind, id, count, durability) {
  // 快照对比:只刷新发生变化的格(替代整条热栏重建)
  const snap = hotbar.map(s => s ? (s.kind + ':' + s.id + ':' + (s.count || 0) + ':' + (s.durability || 0)) : null);
  const absorbed = INVLIB.pickupIntoInventory(hotbar, kind, id, count, {
    durability,
    defaultDurability: TOOL_TYPES[id] ? TOOL_TYPES[id].durability : undefined,
  });
  if (absorbed > 0) {
    discovered.add(id);   // R55:图鉴解锁
    tutEvent('pickup', absorbed);
    const pa = PICKUP_ACHV[id];   // 成就:材料里程碑(R34)
    if (pa) unlockAchv(pa);
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      const it = hotbar[i];
      const now = it ? (it.kind + ':' + it.id + ':' + (it.count || 0) + ':' + (it.durability || 0)) : null;
      if (now !== snap[i]) refreshHotbarSlot(i);
    }
    markDirtySave();
  }
  return absorbed;
}

function updateDroppedItems(dt) {
  for (let i = droppedItems.length - 1; i >= 0; i--) {
    const d = droppedItems[i];
    const u = d.userData;
    // 旋转(绕 Y 轴自旋,经典 Minecraft 掉落物观感)
    d.rotation.y += dt * 1.8;

    // 重力 + 地面支撑:垂直方向积分,落到固体方块顶部即停(终端速度 -22 防穿薄地板)
    u.vy = Math.max(-22, u.vy - GRAVITY * dt);
    let ny = d.position.y + u.vy * dt;
    const bx = Math.floor(d.position.x);
    const bz = Math.floor(d.position.z);
    // 取脚下方块(掉落物底面在 ny - 0.15)
    const supportY = Math.floor(ny - 0.15);
    if (isSolidAt(bx, supportY, bz) && u.vy <= 0) {
      // 停在该固体方块顶面(掉落物中心高 0.15)
      ny = supportY + 1 + 0.15;
      u.vy = 0;
    }
    d.position.y = ny;

    // 寿命 / 拾取延迟递减
    u.life -= dt;
    if (u.pickupDelay > 0) u.pickupDelay -= dt;

    // 拾取:玩家走近(1.2 格内)且延迟已过 → 收入快捷栏(堆叠/空格);满了留在地上
    if (u.pickupDelay <= 0) {
      const dx = d.position.x - playerPos.x;
      const dz = d.position.z - playerPos.z;
      const dy = d.position.y - playerPos.y;
      if (dx * dx + dy * dy + dz * dz < 1.44) {
        const want = u.count || 1;
        const got = pickupIntoInventory(u.kind || 'block', u.type, want, u.durability);
        if (got > 0) {
          audio.play('place');   // 拾取音
          if (got >= want) { removeBlobShadow(u.shadow); scene.remove(d); droppedItems.splice(i, 1); continue; }
          u.count = want - got;   // 部分吸收:剩余留在地上
        }
      }
    }

    // 寿命到点:淡出后移除(最后 1 秒闪烁式收缩)
    if (u.life <= 0) {
      removeBlobShadow(u.shadow);
      scene.remove(d);
      droppedItems.splice(i, 1);
      continue;
    }
    if (u.life < 1) {
      const k = Math.max(0.05, u.life);
      d.scale.setScalar(k);
      d.visible = (Math.floor(u.life * 6) % 2 === 0);
    } else {
      d.scale.setScalar(1);
      d.visible = true;
    }
  }
}

// 清空所有掉落物(重置/读档时调用,避免场景残留)
function clearDroppedItems() {
  for (const d of droppedItems) { removeBlobShadow(d.userData.shadow); scene.remove(d); }
  droppedItems.length = 0;
}

// ============================================================
// 生物系统(猪=被动氛围生物;僵尸/苦力怕=夜间敌对生物,复刻经典 MC)
// 统一物理(重力/浮力/碰撞) + 按类型 AI;不入存档;暂停时冻结;可在设置中开关
// ============================================================
const mobs = [];
const MOB_CAP = 10;        // 被动生物上限(猪)
let mobSpawnTimer = 2;
let hostileSpawnTimer = 4;

const MOB_DEFS = {
  pig:      { hp: 10, hostile: false },
  cow:      { hp: 10, hostile: false },
  sheep:    { hp: 8,  hostile: false },
  zombie:   { hp: 20, hostile: true },
  creeper:  { hp: 20, hostile: true },
  skeleton: { hp: 16, hostile: true },
  spider:   { hp: 16, hostile: true },     // R27:夜间敌对,白天中性(经典)
  enderman: { hp: 40, hostile: false },    // R27:中立,被注视/被攻击才激怒
  villager: { hp: 20, hostile: false },    // R33:村庄 NPC,右键交易(绿宝石经济)
  slime:    { hp: 16, hostile: true },     // R35:跳跃移动,死亡分裂(大→中→小)
  golem:    { hp: 100, hostile: false },   // R39:铁傀儡,村庄守护(构造生成)
  golem_ancient: { hp: 180, hostile: true },  // R55:核心地牢的远古铁傀儡(精英)
  chicken:  { hp: 4,  hostile: false },   // R40:被动生物,产蛋+小麦繁殖
};
function countHostiles() {
  let n = 0;
  for (const m of mobs) if (MOB_DEFS[m.type].hostile) n++;
  return n;
}
// 太阳高度(-1 夜 ~ +1 昼;敌对生物仅夜间生成,僵尸白天燃烧)
function sunHeight() { return Math.sin(dayTime * Math.PI * 2 - Math.PI / 2); }
// 头顶是否直通天空(僵尸燃烧判定)
function skyExposed(p) {
  const x = Math.floor(p.x), z = Math.floor(p.z);
  for (let y = Math.floor(p.y) + 2; y < WORLD_HEIGHT; y++) if (isSolidAt(x, y, z)) return false;
  return true;
}

// 粉红猪模型:-z 为前(与玩家模型一致);userData 携带腿/材质引用(动画与受击闪红依赖)
function buildPigMesh() {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0xeba3a9 });
  const headMat = new THREE.MeshLambertMaterial({ color: 0xf0adb2 });
  const snoutMat = new THREE.MeshLambertMaterial({ color: 0xd97f88 });
  const eyeMat = new THREE.MeshLambertMaterial({ color: 0x2a2a2a });
  const legMat = new THREE.MeshLambertMaterial({ color: 0xdd8f96 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 0.95), bodyMat);
  body.position.y = 0.55;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.4), headMat);
  head.position.set(0, 0.62, -0.62);
  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.14, 0.08), snoutMat);
  snout.position.set(0, 0.56, -0.85);
  const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.03), eyeMat);
  eyeL.position.set(-0.12, 0.68, -0.83);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.12;
  // 4 条腿(Group 旋转中心在髋部,便于行走摆动)
  const legs = [];
  const mkLeg = (lx, lz) => {
    const lg = new THREE.Group();
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.32, 0.16), legMat);
    m.position.y = -0.16;
    lg.add(m);
    lg.position.set(lx, 0.32, lz);
    legs.push(lg);
    return lg;
  };
  mkLeg(-0.18, -0.3); mkLeg(0.18, -0.3); mkLeg(-0.18, 0.3); mkLeg(0.18, 0.3);
  g.add(body, head, snout, eyeL, eyeR, legs[0], legs[1], legs[2], legs[3]);
  g.userData = { legs, mats: [bodyMat, headMat, snoutMat, legMat], baseColors: [0xeba3a9, 0xf0adb2, 0xd97f88, 0xdd8f96] };
  return g;
}

// 村民的「家」小屋:扫 3×3 村格取最近的小屋中心(24 格内;R33)
// 村民离群游荡太远时凭 home 找回村;无小屋(如指令生成)则纯游荡
function villagerHomeFor(x, z) {
  const c0x = Math.floor(x / 48), c0z = Math.floor(z / 48);
  let best = null, bestD = 24 * 24;
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
    const hut = villageInCell(c0x + dx, c0z + dz, worldSeed);
    if (!hut) continue;
    const d = (hut.cx - x) * (hut.cx - x) + (hut.cz - z) * (hut.cz - z);
    if (d < bestD) { bestD = d; best = { x: hut.cx + 0.5, z: hut.cz + 0.5 }; }
  }
  return best;
}
// 某小屋现有村民数(每屋上限 2)
function countVillagersNear(hx, hz) {
  let n = 0;
  for (const m of mobs) {
    if (m.type !== 'villager') continue;
    const dx = m.mesh.position.x - hx, dz = m.mesh.position.z - hz;
    if (dx * dx + dz * dz < 400) n++;
  }
  return n;
}

function spawnMob(x, groundY, z, type, opts) {
  const t = type || 'pig';
  const mesh = t === 'zombie' ? buildZombieMesh()
    : t === 'creeper' ? buildCreeperMesh()
    : t === 'skeleton' ? buildSkeletonMesh()
    : t === 'spider' ? buildSpiderMesh()
    : t === 'enderman' ? buildEndermanMesh()
    : t === 'cow' ? buildCowMesh()
    : t === 'sheep' ? buildSheepMesh()
    : t === 'villager' ? buildVillagerMesh()
    : t === 'slime' ? buildSlimeMesh()
    : t === 'golem' ? buildGolemMesh()
    : t === 'golem_ancient' ? buildGolemMesh(true)
    : t === 'chicken' ? buildChickenMesh()
    : buildPigMesh();
  mesh.position.set(x, groundY + 0.45, z);   // 身体中心离地 0.45
  if (t === 'golem_ancient') mesh.scale.setScalar(1.25);   // R55:精英体型
  scene.add(mesh);
  mobs.push({
    mesh, type: t, vy: 0, kvx: 0, kvz: 0,
    yaw: Math.random() * Math.PI * 2,
    turnT: 1 + Math.random() * 2, speed: 0,
    hp: MOB_DEFS[t].hp, hurtT: 0, walkPhase: Math.random() * 6, onGround: false,
    attackCd: 0, fuse: 0, burnT: 0, fireT: 0, groanT: 2 + Math.random() * 3,
  });
  const m = mobs[mobs.length - 1];
  if (t === 'villager') m.home = villagerHomeFor(x, z);
  if (t === 'slime') {   // R35:体型分级 2=大(hp16/伤4) 1=中(hp4/伤2) 0=小(hp1/掉黏液球)
    m.slimeSize = (opts && Number.isInteger(opts.size)) ? Math.max(0, Math.min(2, opts.size)) : 2;
    m.hp = [1, 4, 16][m.slimeSize];
    m.slimeCharge = 0.4 + Math.random() * 0.6;
    m.slimeBase = [0.55, 0.85, 1.2][m.slimeSize];
    m.mesh.scale.setScalar(m.slimeBase);
  }
  // 接地阴影:尺寸按体型(史莱姆随 slimeBase,其余按类型表)
  m.shadow = makeBlobShadow(t === 'slime' ? m.slimeBase : (MOB_SHADOW_SIZE[t] || 0.7));
  return m;
}

// 各类型生物的接地阴影直径(格)
const MOB_SHADOW_SIZE = {
  pig: 0.7, cow: 0.8, sheep: 0.75, chicken: 0.45, villager: 0.7,
  zombie: 0.65, creeper: 0.6, skeleton: 0.6, spider: 0.9, enderman: 0.6, golem: 0.95, golem_ancient: 0.85,
};

// 僵尸模型:绿皮人形,-z 为前,双臂经典前平举;userData 携带腿/臂引用
function buildZombieMesh() {
  const g = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0x4a8a4a });
  const shirt = new THREE.MeshLambertMaterial({ color: 0x2a8a8a });
  const pants = new THREE.MeshLambertMaterial({ color: 0x35459a });
  const dark = new THREE.MeshLambertMaterial({ color: 0x142014 });
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), skin);
  head.position.y = 1.33;
  const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.07, 0.03), dark);
  eyeL.position.set(-0.1, 1.38, -0.22);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.1;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.55, 0.24), shirt);
  torso.position.y = 0.85;
  // 双臂前平举(肩部为旋转中心,rotation.x = -90°)
  const arms = [];
  const mkArm = (side) => {
    const a = new THREE.Group();
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.55, 0.15), skin);
    m.position.y = -0.27;
    a.add(m);
    a.position.set(side * 0.3, 1.06, 0);
    a.rotation.x = -Math.PI / 2;
    arms.push(a);
    return a;
  };
  const legGroups = [];
  const mkLeg = (side) => {
    const lg = new THREE.Group();
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.58, 0.18), pants);
    m.position.y = -0.29;
    lg.add(m);
    lg.position.set(side * 0.12, 0.58, 0);
    legGroups.push(lg);
    return lg;
  };
  g.add(head, eyeL, eyeR, torso, mkArm(-1), mkArm(1), mkLeg(-1), mkLeg(1));
  g.userData = { legs: legGroups, arms, mats: [skin, shirt, pants], baseColors: [0x4a8a4a, 0x2a8a8a, 0x35459a] };
  return g;
}

// 蜘蛛模型(R27):黑色扁身 + 红眼 + 侧伸 4 组腿(适配 4 腿摆动)
function buildSpiderMesh() {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0x2a2a30 });
  const headMat = new THREE.MeshLambertMaterial({ color: 0x34343c });
  const eyeMat = new THREE.MeshLambertMaterial({ color: 0xd03030 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 0.7), bodyMat);
  body.position.set(0, 0.42, 0.18);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.34, 0.36), headMat);
  head.position.set(0, 0.38, -0.38);
  const parts = [body, head];
  for (const [ex, ez] of [[-0.12, -0.55], [0.12, -0.55], [-0.06, -0.57], [0.06, -0.57]]) {
    const e = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.02), eyeMat);
    e.position.set(ex, 0.44, ez);
    parts.push(e);
  }
  const legGroups = [];
  const mkLeg = (side, zo) => {
    const lg = new THREE.Group();
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.08), bodyMat);
    m.position.x = side * 0.32;
    lg.add(m);
    lg.position.set(0, 0.4, zo);
    legGroups.push(lg);
    return lg;
  };
  g.add(...parts, mkLeg(-1, -0.22), mkLeg(1, -0.22), mkLeg(-1, 0.28), mkLeg(1, 0.28));
  g.userData = { legs: legGroups, mats: [bodyMat, headMat, eyeMat], baseColors: [0x2a2a30, 0x34343c, 0xd03030] };
  return g;
}

// 末影人模型(R27):2.3 格高黑瘦人形 + 紫色横眼 + 长臂
function buildEndermanMesh() {
  const g = new THREE.Group();
  const black = new THREE.MeshLambertMaterial({ color: 0x16161c });
  const eyeMat = new THREE.MeshLambertMaterial({ color: 0xc06ae8 });
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.4, 0.42), black);
  head.position.y = 2.05;
  const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.05, 0.03), eyeMat);
  eyeL.position.set(-0.1, 2.08, -0.215);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.1;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.9, 0.24), black);
  torso.position.y = 1.4;
  const arms = [];
  const mkArm = (side) => {
    const a = new THREE.Group();
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.11, 1.0, 0.11), black);
    m.position.y = -0.5;
    a.add(m);
    a.position.set(side * 0.26, 1.82, 0);
    arms.push(a);
    return a;
  };
  const legGroups = [];
  const mkLeg = (side) => {
    const lg = new THREE.Group();
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.95, 0.13), black);
    m.position.y = -0.47;
    lg.add(m);
    lg.position.set(side * 0.1, 0.95, 0);
    legGroups.push(lg);
    return lg;
  };
  g.add(head, eyeL, eyeR, torso, mkArm(-1), mkArm(1), mkLeg(-1), mkLeg(1));
  g.userData = { legs: legGroups, arms, mats: [black, eyeMat], baseColors: [0x16161c, 0xc06ae8] };
  return g;
}

// 苦力怕模型:绿色无声潜行体,4 短腿,正面经典哭脸(像素纹理)
function makeCreeperFaceTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 8;
  const ctx = c.getContext('2d');
  // 绿底 + 深绿斑驳(确定性)
  let st = 424242;
  const rand = () => { st = (st * 1664525 + 1013904223) >>> 0; return st / 4294967296; };
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++) {
      ctx.fillStyle = rand() < 0.3 ? '#3d8a3d' : '#4faa4f';
      ctx.fillRect(x, y, 1, 1);
    }
  // 黑色眼+嘴(经典图案)
  ctx.fillStyle = '#0a0f0a';
  ctx.fillRect(1, 2, 2, 2); ctx.fillRect(5, 2, 2, 2);   // 眼
  ctx.fillRect(3, 4, 2, 3);                              // 鼻/嘴中条
  ctx.fillRect(2, 5, 1, 2); ctx.fillRect(5, 5, 1, 2);    // 嘴角下垂
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  return tex;
}
function buildCreeperMesh() {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0x4faa4f });
  const faceMat = new THREE.MeshLambertMaterial({ map: makeCreeperFaceTexture() });
  const legMat = new THREE.MeshLambertMaterial({ color: 0x439243 });
  // 躯干(高瘦)+ 头(正面贴脸,模型朝 -z → 脸在 -z 面,材质数组第 6 位)
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.85, 0.32), bodyMat);
  body.position.y = 0.83;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.52, 0.52), [bodyMat, bodyMat, bodyMat, bodyMat, bodyMat, faceMat]);
  head.position.y = 1.5;
  // 4 短腿(前二后二)
  const legGroups = [];
  const mkLeg = (lx, lz) => {
    const lg = new THREE.Group();
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.4, 0.24), legMat);
    m.position.y = -0.2;
    lg.add(m);
    lg.position.set(lx, 0.4, lz);
    legGroups.push(lg);
    return lg;
  };
  mkLeg(-0.14, -0.2); mkLeg(0.14, -0.2); mkLeg(-0.14, 0.2); mkLeg(0.14, 0.2);
  g.add(body, head, legGroups[0], legGroups[1], legGroups[2], legGroups[3]);
  g.userData = { legs: legGroups, mats: [bodyMat, faceMat, legMat], baseColors: [0x4faa4f, 0xffffff, 0x439243] };
  return g;
}

// 骷髅模型:白骨人形(僵尸同构),深眼窝 + 弓(远程敌对)
function buildSkeletonMesh() {
  const g = new THREE.Group();
  const bone = new THREE.MeshLambertMaterial({ color: 0xd8d8ce });
  const dark = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
  const cloth = new THREE.MeshLambertMaterial({ color: 0x8a8a8a });
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), bone);
  head.position.y = 1.33;
  const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.09, 0.03), dark);
  eyeL.position.set(-0.1, 1.37, -0.22);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.1;
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.03), dark);
  nose.position.set(0, 1.28, -0.22);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.55, 0.2), cloth);
  torso.position.y = 0.85;
  // 双臂前平举(右臂挂弓)
  const arms = [];
  const mkArm = (side) => {
    const a = new THREE.Group();
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.55, 0.12), bone);
    m.position.y = -0.27;
    a.add(m);
    if (side > 0) {
      const bowM = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.02, 6, 12, Math.PI * 1.2), new THREE.MeshLambertMaterial({ color: 0x6e4f2a }));
      bowM.rotation.z = Math.PI / 2;
      bowM.position.set(0, -0.5, -0.08);
      a.add(bowM);
    }
    a.position.set(side * 0.26, 1.06, 0);
    a.rotation.x = -Math.PI / 2;
    arms.push(a);
    return a;
  };
  const legGroups = [];
  const mkLeg = (side) => {
    const lg = new THREE.Group();
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.58, 0.14), bone);
    m.position.y = -0.29;
    lg.add(m);
    lg.position.set(side * 0.1, 0.58, 0);
    legGroups.push(lg);
    return lg;
  };
  g.add(head, eyeL, eyeR, nose, torso, mkArm(-1), mkArm(1), mkLeg(-1), mkLeg(1));
  g.userData = { legs: legGroups, arms, mats: [bone, cloth], baseColors: [0xd8d8ce, 0x8a8a8a] };
  return g;
}

// 牛模型:棕身 + 白脸 + 双角(被动,掉生牛肉/皮革)
function buildCowMesh() {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2f });
  const headMat = new THREE.MeshLambertMaterial({ color: 0x7a573a });
  const hornMat = new THREE.MeshLambertMaterial({ color: 0xe8e0d0 });
  const legMat = new THREE.MeshLambertMaterial({ color: 0x5a3d26 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.55, 1.05), bodyMat);
  body.position.y = 0.65;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.4), headMat);
  head.position.set(0, 0.85, -0.68);
  const hornL = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.16), hornMat);
  hornL.position.set(-0.16, 1.05, -0.7);
  const hornR = hornL.clone();
  hornR.position.x = 0.16;
  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.14, 0.06), hornMat);
  snout.position.set(0, 0.76, -0.9);
  const legGroups = [];
  const mkLeg = (lx, lz) => {
    const lg = new THREE.Group();
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.4, 0.17), legMat);
    m.position.y = -0.2;
    lg.add(m);
    lg.position.set(lx, 0.4, lz);
    legGroups.push(lg);
    return lg;
  };
  mkLeg(-0.2, -0.34); mkLeg(0.2, -0.34); mkLeg(-0.2, 0.34); mkLeg(0.2, 0.34);
  g.add(body, head, hornL, hornR, snout, legGroups[0], legGroups[1], legGroups[2], legGroups[3]);
  g.userData = { legs: legGroups, mats: [bodyMat, headMat, legMat], baseColors: [0x6b4a2f, 0x7a573a, 0x5a3d26] };
  return g;
}

// 羊模型:蓬松白羊毛体 + 灰白脸(被动,掉羊肉/羊毛)
function buildSheepMesh() {
  const g = new THREE.Group();
  const woolMat = new THREE.MeshLambertMaterial({ color: 0xe8e8e4 });
  const faceMat = new THREE.MeshLambertMaterial({ color: 0xd8c8b8 });
  const legMat = new THREE.MeshLambertMaterial({ color: 0x9a8a78 });
  const skinMat = new THREE.MeshLambertMaterial({ color: 0xe8b8a8 });   // 剪毛后的粉皮(R35)
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.6, 0.95), woolMat);
  body.position.y = 0.72;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34), faceMat);
  head.position.set(0, 0.95, -0.6);
  const woolCap = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.14, 0.4), woolMat);
  woolCap.position.set(0, 1.14, -0.6);
  const legGroups = [];
  const mkLeg = (lx, lz) => {
    const lg = new THREE.Group();
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.42, 0.15), legMat);
    m.position.y = -0.21;
    lg.add(m);
    lg.position.set(lx, 0.42, lz);
    legGroups.push(lg);
    return lg;
  };
  mkLeg(-0.18, -0.3); mkLeg(0.18, -0.3); mkLeg(-0.18, 0.3); mkLeg(0.18, 0.3);
  g.add(body, head, woolCap, legGroups[0], legGroups[1], legGroups[2], legGroups[3]);
  g.userData = { legs: legGroups, mats: [woolMat, faceMat, legMat, skinMat], baseColors: [0xe8e8e4, 0xd8c8b8, 0x9a8a78, 0xe8b8a8], woolParts: [body, woolCap], woolMat, skinMat };
  return g;
}

// ============================================================
// 铁桶(R36):空桶右键舀水 / 水桶右键放水 —— 可移动水源
// 放出的水是真实 water 方块(可再舀取/可游泳/随存档),静态不扩散
// ============================================================
function bucketSwapItem(newId) {
  // 当前格桶 -1(用尽就地换成新桶);叠放时新桶走拾取入栏,满栏掉脚边
  const it = hotbar[currentSlot];
  it.count = (it.count || 1) - 1;
  if (it.count <= 0) {
    hotbar[currentSlot] = { kind: 'item', id: newId, count: 1 };
  } else {
    const got = pickupIntoInventory('item', newId, 1);
    if (got < 1) spawnDroppedItem(playerPos.x - 0.5, playerPos.y, playerPos.z - 0.5, newId, 1, 'item');
  }
  buildHotbar(); updateHoldItem();
  markDirtySave();
}
function useBucket(item) {
  swingHoldItem();
  if (item.id === 'bucket') {
    // 舀水:沿视线 5 格找第一个水格(经典:水被装走,原地变空气);遇固体停
    const dx = -Math.sin(yaw) * Math.cos(pitch), dy = Math.sin(pitch), dz = -Math.cos(yaw) * Math.cos(pitch);
    for (let t = 0.4; t <= 5; t += 0.25) {
      const x = Math.floor(playerPos.x + dx * t), y = Math.floor(playerPos.y + dy * t), z = Math.floor(playerPos.z + dz * t);
      const b = getBlock(x, y, z);
      if (b === 'water') {
        setBlock(x, y, z, null);
        bucketSwapItem('water_bucket');
        showToast('🪣 装满一桶水');
        audio.play('splash');
        unlockAchv('bucket');   // 成就:桶装玩意(R36)
        return;
      }
      if (b && BLOCK_TYPES[b] && BLOCK_TYPES[b].solid) break;   // 墙后的水够不着
    }
    showToast('没对准水(靠近水面,准星对水)');
    return;
  }
  // 放水:对准方块,相邻格倒出静态水
  const t = raycastTarget();
  if (!t) { showToast('没对准方块'); return; }
  const nx = t.x + Math.round(t.normal.x), ny = t.y + Math.round(t.normal.y), nz = t.z + Math.round(t.normal.z);
  if (getBlock(nx, ny, nz)) { showToast('这里已有方块'); return; }
  setBlock(nx, ny, nz, 'water');
  bucketSwapItem('bucket');
  showToast('🪣 倒出水(可游泳 · 可再舀取)');
  audio.play('splash');
}

// 剪羊毛(R35):手持剪刀右键羊 → 掉 1-3 白羊毛 + 模型换粉皮;45 秒长回
function shearSheep(m, tool) {
  swingHoldItem();
  if (m.sheared) { showToast('这只羊已经被剪过了'); return; }
  if (m.baby) { showToast('幼崽的毛还没长好'); return; }
  m.sheared = true;
  m.shearT = 45;
  for (const part of m.mesh.userData.woolParts) part.material = m.mesh.userData.skinMat;
  const n = 1 + (Math.random() * 3 | 0);
  spawnDroppedItem(m.mesh.position.x - 0.5, m.mesh.position.y - 0.2, m.mesh.position.z - 0.5, 'wool_white', n, 'block');
  spawnParticles(m.mesh.position.x, m.mesh.position.y + 0.4, m.mesh.position.z, 0xe8e8e4, 8);
  showToast('✂️ 剪下羊毛 ×' + n);
  audio.play('break');
  if (tool) {
    tool.durability = Math.max(0, tool.durability - 1);
    if (tool.durability <= 0) {
      showToast(TOOL_TYPES[tool.id].name + ' 坏了!');
      hotbar[currentSlot] = null;
    }
    refreshHotbarSlot(currentSlot);
  }
}

// 村民模型(R33):棕色长袍人形 + 大鼻子 + 双臂交叠身前(经典站姿)
function buildVillagerMesh() {
  const g = new THREE.Group();
  const robeMat = new THREE.MeshLambertMaterial({ color: 0x7a5a3a });   // 袍子主色
  const robeDark = new THREE.MeshLambertMaterial({ color: 0x63482e });  // 袍摆
  const skinMat = new THREE.MeshLambertMaterial({ color: 0xc9a177 });   // 头/手臂肤色
  const noseMat = new THREE.MeshLambertMaterial({ color: 0xb98e66 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x2a2018 });
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), skinMat);
  head.position.y = 1.36;
  // 大鼻子(村民标志)+ 单字眉 + 双眼
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.16, 0.09), noseMat);
  nose.position.set(0, 1.3, -0.23);
  const brow = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.05, 0.03), dark);
  brow.position.set(0, 1.46, -0.2);
  const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.03), dark);
  eyeL.position.set(-0.09, 1.39, -0.21);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.09;
  // 袍身(上窄下宽两段)+ 袍摆盖住腿根
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.5, 0.26), robeMat);
  torso.position.y = 0.92;
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.42, 0.3), robeDark);
  skirt.position.y = 0.46;
  // 双臂交叠:肩部为旋转中心,前平举并向内收,小臂叠在身前
  const arms = [];
  const mkArm = (side) => {
    const a = new THREE.Group();
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.44, 0.14), skinMat);
    m.position.y = -0.22;
    a.add(m);
    a.position.set(side * 0.3, 1.1, 0);
    a.rotation.x = -Math.PI / 2;
    a.rotation.z = side * 0.24;
    arms.push(a);
    return a;
  };
  // 短腿(袍下露出一截)
  const legGroups = [];
  const mkLeg = (side) => {
    const lg = new THREE.Group();
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.26, 0.16), robeDark);
    m.position.y = -0.13;
    lg.add(m);
    lg.position.set(side * 0.12, 0.26, 0);
    legGroups.push(lg);
    return lg;
  };
  g.add(head, nose, brow, eyeL, eyeR, torso, skirt, mkArm(-1), mkArm(1), mkLeg(-1), mkLeg(1));
  g.userData = { legs: legGroups, arms, mats: [robeMat, robeDark, skinMat, noseMat], baseColors: [0x7a5a3a, 0x63482e, 0xc9a177, 0xb98e66] };
  return g;
}

// 史莱姆模型(R35):半透明绿方体 + 嘴 + 双眼;体型由 mesh.scale 控制(分裂用)
function buildSlimeMesh() {
  const g = new THREE.Group();
  const gelMat = new THREE.MeshLambertMaterial({ color: 0x6fc05a, transparent: true, opacity: 0.82 });
  const innerMat = new THREE.MeshLambertMaterial({ color: 0x4a9c3c });
  const eyeMat = new THREE.MeshLambertMaterial({ color: 0x142014 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), gelMat);
  body.position.y = 0.45;
  const inner = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.55), innerMat);
  inner.position.y = 0.45;
  const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.04), eyeMat);
  eyeL.position.set(-0.16, 0.56, -0.46);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.16;
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.08, 0.04), eyeMat);
  mouth.position.set(0, 0.34, -0.46);
  g.add(body, inner, eyeL, eyeR, mouth);
  g.userData = { legs: [], mats: [gelMat, innerMat], baseColors: [0x6fc05a, 0x4a9c3c] };
  return g;
}

// 鸡模型(R40):白身 + 黄喙 + 红髯 + 黄腿 + 两侧翅
function buildChickenMesh() {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0xf4f4f0 });
  const beakMat = new THREE.MeshLambertMaterial({ color: 0xe8a020 });
  const wattleMat = new THREE.MeshLambertMaterial({ color: 0xd03040 });
  const legMat = new THREE.MeshLambertMaterial({ color: 0xe8a020 });
  const eyeMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.4, 0.55), bodyMat);
  body.position.y = 0.45;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.3, 0.24), bodyMat);
  head.position.set(0, 0.72, -0.3);
  const beak = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.09, 0.14), beakMat);
  beak.position.set(0, 0.7, -0.48);
  const wattle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.06), wattleMat);
  wattle.position.set(0, 0.58, -0.44);
  const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 0.02), eyeMat);
  eyeL.position.set(-0.08, 0.76, -0.42);
  const eyeR = eyeL.clone(); eyeR.position.x = 0.08;
  const wingL = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.26, 0.36), bodyMat);
  wingL.position.set(-0.24, 0.46, 0.04);
  const wingR = wingL.clone(); wingR.position.x = 0.24;
  const legGroups = [];
  const mkLeg = (lx) => {
    const lg = new THREE.Group();
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.26, 0.05), legMat);
    m.position.y = -0.13;
    lg.add(m);
    lg.position.set(lx, 0.26, 0.06);
    legGroups.push(lg);
    return lg;
  };
  g.add(body, head, beak, wattle, eyeL, eyeR, wingL, wingR, mkLeg(-0.09), mkLeg(0.09));
  g.userData = { legs: legGroups, mats: [bodyMat, beakMat, wattleMat, legMat], baseColors: [0xf4f4f0, 0xe8a020, 0xd03040, 0xe8a020] };
  return g;
}

// 铁傀儡模型(R39):2.4 格高铁块人形 —— 宽躯干 + 小头 + 垂肩长臂 + 短腿
function buildGolemMesh(ancient) {
  const g = new THREE.Group();
  const ironMat = new THREE.MeshLambertMaterial({ color: ancient ? 0x7a6a4a : 0xc8c8d2 });
  const ironDark = new THREE.MeshLambertMaterial({ color: ancient ? 0x5a4a32 : 0x9a9aa8 });
  const mossMat = new THREE.MeshLambertMaterial({ color: ancient ? 0x8a5a3a : 0x5e8a4c });   // 胸口苔痕/远古锈迹
  const eyeMat = new THREE.MeshLambertMaterial({ color: ancient ? 0xff3020 : 0xd05030 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.05, 0.5), ironMat);
  torso.position.y = 1.35;
  const moss = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.06), mossMat);
  moss.position.set(-0.08, 1.3, -0.27);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), ironDark);
  head.position.y = 2.1;
  const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.03), eyeMat);
  eyeL.position.set(-0.1, 2.12, -0.22);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.1;
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 0.05), ironMat);
  nose.position.set(0, 2.04, -0.24);
  const arms = [];
  const mkArm = (side) => {
    const a = new THREE.Group();
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.26, 1.15, 0.3), ironMat);
    m.position.y = -0.58;
    a.add(m);
    a.position.set(side * 0.56, 1.78, 0);
    arms.push(a);
    return a;
  };
  const legGroups = [];
  const mkLeg = (side) => {
    const lg = new THREE.Group();
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.8, 0.3), ironDark);
    m.position.y = -0.4;
    lg.add(m);
    lg.position.set(side * 0.22, 0.82, 0);
    legGroups.push(lg);
    return lg;
  };
  g.add(torso, moss, head, eyeL, eyeR, nose, mkArm(-1), mkArm(1), mkLeg(-1), mkLeg(1));
  g.userData = { legs: legGroups, arms, mats: [ironMat, ironDark, mossMat], baseColors: ancient ? [0x7a6a4a, 0x5a4a32, 0x8a5a3a] : [0xc8c8d2, 0x9a9aa8, 0x5e8a4c] };
  return g;
}

// 铁傀儡构造生成(R39,经典 T 形简化;放下铁块时检测两种完成形态):
//  形态 A(头位收尾):下方竖 3 身体 + 臂已在第二格侧邻
//  形态 B(臂位收尾):相邻柱已竖 4(身体 3+头),本次放下的是侧臂 ——
//  玩家从侧面即可完成(从下方瞄不到顶面,B 是主路径)
function trySpawnGolem(x, y, z) {
  if (getBlock(x, y, z) !== 'iron_block') return false;
  const all = (cells) => cells.every(([cx, cy, cz]) => getBlock(cx, cy, cz) === 'iron_block');
  const build = (cells) => {   // 移除结构 + 原地生成(首格为柱底)
    for (const [cx, cy, cz] of cells) setBlock(cx, cy, cz, null);
    spawnMob(cells[0][0] + 0.5, cells[0][1] + 1, cells[0][2] + 0.5, 'golem');
    spawnParticles(cells[0][0] + 0.5, cells[0][1] + 1.5, cells[0][2] + 0.5, 0xd8d8e0, 16);
    audio.play('place');
    showToast('🤖 铁傀儡苏醒了!(村庄守护,攻击敌对生物)');
    unlockAchv('golem');   // 成就:铁壁守护(R39)
  };
  // 形态 A:头位收尾
  if (all([[x, y - 1, z], [x, y - 2, z], [x, y - 3, z]])) {
    const arm = [[x - 1, y - 2, z], [x + 1, y - 2, z], [x, y - 2, z - 1], [x, y - 2, z + 1]].find(c => getBlock(c[0], c[1], c[2]) === 'iron_block');
    if (arm) {
      build([[x, y - 3, z], [x, y - 2, z], [x, y - 1, z], [x, y, z], arm]);
      return true;
    }
  }
  // 形态 B:臂位收尾(四向邻柱竖 4,本次为第二格侧臂)
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const cx = x + dx, cz = z + dz;
    if (all([[cx, y - 1, cz], [cx, y, cz], [cx, y + 1, cz], [cx, y + 2, cz]])) {
      build([[cx, y - 1, cz], [cx, y, cz], [cx, y + 1, cz], [cx, y + 2, cz], [x, y, z]]);
      return true;
    }
  }
  return false;
}

function removeMob(i) {
  const m = mobs[i];
  m.mesh.traverse(function(o) {
    if (o.isMesh) {
      if (o.geometry) o.geometry.dispose();
      // 材质可能是单材质或多材质数组(苦力怕头 6 面);纹理(Creeper 脸等)一并释放(M2)
      const dispMat = (mt) => { if (mt.map) mt.map.dispose(); mt.dispose(); };
      if (Array.isArray(o.material)) { for (let k = 0; k < o.material.length; k++) dispMat(o.material[k]); }
      else if (o.material) dispMat(o.material);
    }
  });
  scene.remove(m.mesh);
  removeBlobShadow(m.shadow);
  mobs.splice(i, 1);
}
function clearMobs() { for (let i = mobs.length - 1; i >= 0; i--) removeMob(i); }

// 尝试生成:随机挑一个已加载区块,找草地面(离玩家 >10 格,水下/沙漠不刷)
// 草地 16 格内有村庄小屋 → 优先补村民(每屋 ≤2,不受动物总帽挤占,R33)
function trySpawnMob() {
  if (!settings.mobs || chunks.size === 0) return;
  const arr = Array.from(chunks.values());
  const ch = arr[(Math.random() * arr.length) | 0];
  const wx = ch.cx * CHUNK_SIZE + ((Math.random() * CHUNK_SIZE) | 0) + 0.5;
  const wz = ch.cz * CHUNK_SIZE + ((Math.random() * CHUNK_SIZE) | 0) + 0.5;
  const dx = wx - playerPos.x, dz = wz - playerPos.z;
  if (dx * dx + dz * dz < 100) return;
  const fx = Math.floor(wx), fz = Math.floor(wz);
  for (let y = WORLD_HEIGHT - 2; y > SEA_LEVEL; y--) {
    const b = getBlock(fx, y, fz);
    if (!b) continue;
    if (b === 'grass' && !getBlock(fx, y + 1, fz)) {
      const home = villagerHomeFor(wx, wz);
      if (home && Math.hypot(home.x - wx, home.z - wz) < 16 && countVillagersNear(home.x, home.z) < 2) {
        spawnMob(wx, y + 1, wz, 'villager');
        break;
      }
      if (mobs.length >= MOB_CAP) break;
      // 被动生物池:猪 40% / 牛 25% / 羊 22% / 鸡 13%(R40)
      const pr = Math.random();
      spawnMob(wx, y + 1, wz, pr < 0.4 ? 'pig' : pr < 0.65 ? 'cow' : pr < 0.87 ? 'sheep' : 'chicken');
    }
    break;   // 只看地表第一个非空气方块
  }
}

// ---- 共用:随机游荡(定时换向/闲置) ----
function wanderStep(m, dt, speed, activeChance) {
  m.turnT -= dt;
  if (m.turnT <= 0) {
    m.turnT = 1.5 + Math.random() * 3;
    m.speed = Math.random() < activeChance ? speed : 0;
    m.yaw = Math.random() * Math.PI * 2;
  }
}
// 面向玩家的 yaw(模型前方 = -z)
function faceYaw(m) {
  return Math.atan2(-(playerPos.x - m.mesh.position.x), -(playerPos.z - m.mesh.position.z));
}

// ---- 共用:白天阳光燃烧(僵尸/骷髅);返回 true 表示烧死移除 ----
function burnStep(m, dt) {
  if (sunHeight() > 0.15 && skyExposed(m.mesh.position)) {
    m.burnT += dt;
    m.fireT -= dt;
    if (m.fireT <= 0) {
      m.fireT = 0.18;
      spawnParticles(m.mesh.position.x - 0.5, m.mesh.position.y + 0.3, m.mesh.position.z - 0.5, 0xff7733, 2);
    }
    if (m.burnT >= 1) {
      m.burnT = 0;
      hurtMob(m, 3, 0, 0, true);
      if (mobs.indexOf(m) < 0) return true;
    }
  } else {
    m.burnT = 0;
  }
  return false;
}

// ---- 僵尸 AI:24 格内追击 + 近战(伤害+击退);白天阳光直射燃烧 ----
function zombieAI(m, dt, distP) {
  if (distP < 24) {
    m.yaw = faceYaw(m);
    m.speed = 2.3;
    m.groanT -= dt;
    if (m.groanT <= 0) { m.groanT = 2.5 + Math.random() * 3; audio.play('zombie'); }
  } else {
    wanderStep(m, dt, 1.0, 0.5);
  }
  // 近战:1.5 格内,冷却 1.5 秒(经典 MC 攻击间隔)
  m.attackCd -= dt;
  if (distP < 1.5 && m.attackCd <= 0) {
    m.attackCd = 1.5;
    damagePlayer(3, 'combat');
    const inv = 1 / Math.max(0.001, distP);
    velocity.x += (playerPos.x - m.mesh.position.x) * inv * 6;
    velocity.z += (playerPos.z - m.mesh.position.z) * inv * 6;
    velocity.y = 4;   // 击退小跳
  }
  return burnStep(m, dt);
}

// ---- 蜘蛛 AI(R27):夜间快速爬行追击(经典白天中性化);近战 2 伤害 ----
function spiderAI(m, dt, distP) {
  const night = sunHeight() < 0.1;
  if (night && distP < 20) {
    m.yaw = faceYaw(m);
    m.speed = 2.6;
  } else {
    wanderStep(m, dt, 1.2, 0.6);   // 白天变中性慢速游荡(经典)
  }
  m.attackCd -= dt;
  if (distP < 1.5 && m.attackCd <= 0) {
    m.attackCd = 1.2;
    damagePlayer(2, 'combat');
    const inv = 1 / Math.max(0.001, distP);
    velocity.x += (playerPos.x - m.mesh.position.x) * inv * 6;
    velocity.z += (playerPos.z - m.mesh.position.z) * inv * 6;
    velocity.y = 4;
  }
  return false;
}

// ---- 末影人 AI(R27):中立游荡;被注视(0.8s)或被攻击激怒 → 高速追击(3.1)+
//      近战 7 伤害;受击后短暂延迟瞬移(经典) ----
function endermanAI(m, dt, distP) {
  if (!m.angered) {
    if (distP < 24) {
      const p = m.mesh.position;
      const tx = p.x - playerPos.x, ty = p.y - playerPos.y, tz = p.z - playerPos.z;
      const dlen = Math.sqrt(tx * tx + ty * ty + tz * tz);
      const dxv = -Math.sin(yaw) * Math.cos(pitch), dyv = Math.sin(pitch), dzv = -Math.cos(yaw) * Math.cos(pitch);
      const cos = (tx * dxv + ty * dyv + tz * dzv) / dlen;
      if (cos > 0.985) {   // 视线夹角 < ~10°
        m.stareT = (m.stareT || 0) + dt;
        if (m.stareT > 0.8) { m.angered = true; showToast('👁 末影人被激怒了!'); audio.play('zombie'); }
      } else m.stareT = 0;
    } else m.stareT = 0;
    wanderStep(m, dt, 1.0, 0.5);
  } else {
    m.yaw = faceYaw(m);
    m.speed = 3.1;
  }
  if (m.tpT > 0) {
    m.tpT -= dt;
    if (m.tpT <= 0) teleportEnderman(m);
  }
  m.attackCd -= dt;
  if (m.angered && distP < 1.8 && m.attackCd <= 0) {
    m.attackCd = 1.2;
    damagePlayer(6, 'combat');
    const inv = 1 / Math.max(0.001, distP);
    velocity.x += (playerPos.x - m.mesh.position.x) * inv * 7;
    velocity.z += (playerPos.z - m.mesh.position.z) * inv * 7;
    velocity.y = 4.5;
  }
  return false;
}

// 末影人瞬移:随机 ±8 格找「实体上两格空气」的落点;紫粒子收发
function teleportEnderman(m) {
  for (let tries = 0; tries < 12; tries++) {
    const nx = m.mesh.position.x + (Math.random() - 0.5) * 16;
    const nz = m.mesh.position.z + (Math.random() - 0.5) * 16;
    if (!chunks.has(chunkKey(Math.floor(nx / CHUNK_SIZE), Math.floor(nz / CHUNK_SIZE)))) continue;
    const fx = Math.floor(nx), fz = Math.floor(nz);
    for (let y = WORLD_HEIGHT - 3; y > 1; y--) {
      if (isSolidAt(fx, y, fz) && !isSolidAt(fx, y + 1, fz) && !isSolidAt(fx, y + 2, fz)) {
        spawnParticles(m.mesh.position.x, m.mesh.position.y, m.mesh.position.z, 0xb06ee0, 10);
        m.mesh.position.set(nx, y + 1.45, nz);
        m.vy = 0; m.kvx = m.kvz = 0;
        spawnParticles(nx, y + 1, nz, 0xb06ee0, 10);
        audio.play('place');
        return;
      }
    }
  }
}

// ---- 骷髅 AI:保持 7~11 格射程带(远则靠近/近则后退),2 秒一箭;白天燃烧 ----
function skeletonAI(m, dt, distP) {
  if (distP < 20) {
    m.yaw = faceYaw(m);
    m.speed = distP > 11 ? 2.0 : (distP < 7 ? -2.0 : 0);   // 负速=面向玩家后退
    m.groanT -= dt;
    if (m.groanT <= 0) { m.groanT = 3 + Math.random() * 3; audio.play('zombie'); }
  } else {
    wanderStep(m, dt, 1.0, 0.5);
  }
  m.attackCd -= dt;
  if (distP < 14 && m.attackCd <= 0) {
    m.attackCd = 2.0;
    shootMobArrow(m);
  }
  return burnStep(m, dt);
}

// 骷髅射箭:从其手部朝玩家(带简易重力补偿抛物线);怪物之箭可命中玩家
function shootMobArrow(m) {
  if (!arrowGeo) { arrowGeo = new THREE.BoxGeometry(0.08, 0.08, 0.4); arrowMat = new THREE.MeshLambertMaterial({ color: 0xcaa472 }); }
  const a = new THREE.Mesh(arrowGeo, arrowMat);
  const from = m.mesh.position;
  a.position.set(from.x, from.y + 0.6, from.z);
  const dx = playerPos.x - from.x, dy = (playerPos.y + 0.2) - (from.y + 0.6), dz = playerPos.z - from.z;
  const d = Math.max(0.5, Math.sqrt(dx * dx + dy * dy + dz * dz));
  const speed = 18;
  a.userData = {
    vel: new THREE.Vector3(dx / d * speed, dy / d * speed + d * 0.4, dz / d * speed),
    life: 3,
    fromPlayer: false,
  };
  scene.add(a);
  arrows.push(a);
  audio.play('place');
}

// ---- 苦力怕 AI:16 格内潜行追击;2.8 格内点燃引信(膨胀+白闪),远离则熄灭;1.5 秒爆炸 ----
function creeperAI(m, dt, distP) {
  if (distP < 16) {
    m.yaw = faceYaw(m);
    m.speed = distP > 2.2 ? 2.6 : 0;
  } else {
    wanderStep(m, dt, 1.0, 0.5);
  }
  const mats = m.mesh.userData.mats, base = m.mesh.userData.baseColors;
  if (distP < 2.8 && m.onGround) {
    if (m.fuse === 0) audio.play('fuse');
    m.fuse += dt;
    m.mesh.scale.setScalar(1 + m.fuse * 0.14);          // 膨胀
    const flash = ((m.fuse * 8) | 0) % 2 === 0;         // 白色闪烁
    for (let k = 0; k < mats.length; k++) mats[k].color.setHex(flash ? 0xffffff : base[k]);
    if (m.fuse >= 1.5) {
      explodeAt(m.mesh.position.x, m.mesh.position.y + 0.3, m.mesh.position.z, 2.6, 14);
      killMob(m);
      return true;
    }
  } else if (m.fuse > 0) {
    // 玩家跑远,引信熄灭复原
    m.fuse = Math.max(0, m.fuse - dt * 2);
    if (m.fuse === 0) m.mesh.scale.setScalar(1);
    else m.mesh.scale.setScalar(1 + m.fuse * 0.14);
    for (let k = 0; k < mats.length; k++) mats[k].color.setHex(base[k]);
  }
  return false;
}

function killMob(m) {
  const idx = mobs.indexOf(m);
  if (idx >= 0) removeMob(idx);
}

// 爆炸:球形破坏方块(基岩除外,边缘随机保留成粗糙弹坑)+ 玩家伤害/击退 + 弹坑立即重建
// 爆炸清理:容器/状态化方块被炸时与挖矿路径一致的善后(掉内容/删状态/清重生点)
function explodeCleanupBlock(b, bx, by, bz) {
  const key = blockKey(bx, by, bz);
  if (b === 'chest') {
    const c = chests.get(key);
    if (c) {
      for (const it of c.slots) {
        if (it) spawnDroppedItem(bx, by, bz, it.id, it.count || 1, it.kind || 'block', it.durability);
      }
      chests.delete(key);
      if (chestOpen === key) closeChestPanel();
    }
  } else if (b === 'furnace') {
    const f = furnaces.get(key);
    if (f) {
      for (const it of [f.input, f.fuel, f.output]) {
        if (it) spawnDroppedItem(bx, by, bz, it.id, it.count || 1, it.kind || 'block', it.durability);
      }
      furnaces.delete(key);
      if (furnaceOpen === key) closeFurnacePanel();
    }
  } else if (b === 'bed' && spawnPoint) {
    if (Math.floor(spawnPoint.x) === bx && Math.floor(spawnPoint.z) === bz
        && Math.floor(spawnPoint.y - 1.1) === by) spawnPoint = null;
  } else if (b === 'cake') {
    cakes.delete(key);
  }
}

function explodeAt(cx, cy, cz, radius, maxDamage) {
  const r = Math.ceil(radius);
  const bx0 = Math.floor(cx), by0 = Math.floor(cy), bz0 = Math.floor(cz);
  for (let dx = -r; dx <= r; dx++)
    for (let dy = -r; dy <= r; dy++)
      for (let dz = -r; dz <= r; dz++) {
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d > radius) continue;
        const bx = bx0 + dx, by = by0 + dy, bz = bz0 + dz;
        if (by <= 0) continue;                    // 基岩层保护
        const b = getBlock(bx, by, bz);
        if (!b || b === 'water') continue;
        if (d > radius - 1 && hash3(bx, by, bz, 777) < 0.45) continue;   // 边缘随机保留
        // 容器/状态化方块:先走与挖矿一致的清理(掉内容/删状态/清重生点),
        // 否则爆炸留下孤儿状态,原位重放同名方块会"复活"旧内容(物品复制)
        if (b === 'chest' || b === 'furnace' || b === 'cake') explodeCleanupBlock(b, bx, by, bz);
        setBlock(bx, by, bz, null);
      }
  // 爆炸半径内的门实体(非方块)一并移除,避免弹坑上悬浮门
  const doorRadius = r + 1;
  for (const [dkey, dv] of doors) {
    if (Math.abs(dv.x - bx0) <= doorRadius && Math.abs(dv.y - by0) <= doorRadius && Math.abs(dv.z - bz0) <= doorRadius) {
      if (dv.group) { disposeDoorGroup(dv.group); scene.remove(dv.group); }
      doors.delete(dkey);
    }
  }
  spawnParticles(cx - 0.5, cy - 0.5, cz - 0.5, 0x666666, 20);
  spawnParticles(cx - 0.5, cy - 0.5, cz - 0.5, 0xff9944, 10);
  const dx = playerPos.x - cx, dy = playerPos.y - cy, dz = playerPos.z - cz;
  const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (d < radius * 2.6) {
    // 伤害随距离衰减:贴脸高伤、2.6 倍半径外无伤(曲线较陡,远距更安全)
    damagePlayer(Math.max(1, Math.round((1 - d / (radius * 2.6)) * maxDamage)), 'explosion');
    const inv = 1 / Math.max(0.5, d);
    velocity.x += dx * inv * 8; velocity.z += dz * inv * 8; velocity.y = 6;   // 爆炸击退
  }
  audio.play('explode');
  for (const ch of dirtyChunks) buildChunkMesh(ch);   // 弹坑不等分帧预算,立即重建
}

