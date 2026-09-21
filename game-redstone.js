// ============================================================
// 红石基础(R38):信号网络每 0.25s 重算 ——
// 电源 = 红石火把(常开 15)/ 拉杆(开态 15);传导 = 红石线(BFS 衰减 -1/格);
// 执行器 = 铁门(任一门格相邻充能 >0 强制开,断能关)
// 传播算法在 machines.js redstonePower 纯函数(单测覆盖)
// ============================================================
let redstoneTimer = 0;
function updateRedstone(dt) {
  redstoneTimer -= dt;
  if (redstoneTimer > 0) return;
  redstoneTimer = 0.25;
  const wires = new Set();
  const sources = [];
  let hasDoor = false;
  for (const d of doors.values()) if (d.type === 'door_iron') { hasDoor = true; break; }
  // 没有任何线/电源/铁门时不做 BFS(零成本快路径:登记表为空且无铁门)
  if (redstoneParts.size === 0 && !hasDoor) return;
  for (const m of redstoneParts.values()) {
    for (const [key, id] of m) {
      const [x, y, z] = key.split(',').map(Number);
      if (getBlock(x, y, z) !== id) continue;   // 残留登记(已破坏/未加载)跳过
      if (id === 'redstone') wires.add(key);
      else if (id === 'redstone_torch' || id === 'lever_on' || id === 'repeater_on') sources.push({ key, p: 15 });   // repeater_on 信号拉满重发(R42)
    }
  }
  const power = MACHINES.redstonePower(wires, sources);
  // ---- 中继器(R42):输入侧(四向邻格)有功率 → 延迟 0.5s 后导通拉满;
  //      无输入 → 立即断开。双向简化(经典为单向,无朝向存储)
  const now = Date.now();
  for (const m of redstoneParts.values()) {
    for (const [key, id] of m) {
      if (id !== 'repeater_off' && id !== 'repeater_on') continue;
      const [x, y, z] = key.split(',').map(Number);
      if (getBlock(x, y, z) !== id) continue;
      // 输入判定:开态中继器须排除自身电源重算(否则自身输出回灌输入 → 永不断开的自锁)
      const powerIn = (id === 'repeater_on')
        ? MACHINES.redstonePower(wires, sources.filter(sc => sc.key !== key))
        : power;
      let input = false;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if ((powerIn.get((x + dx) + ',' + y + ',' + (z + dz)) || 0) > 0) { input = true; break; }
      }
      if (id === 'repeater_off' && input) {
        if (!repeaterTimers.has(key)) repeaterTimers.set(key, now + 500);   // 延迟半秒
      } else if (id === 'repeater_off' && !input) {
        repeaterTimers.delete(key);
      } else if (id === 'repeater_on' && !input) {
        repeaterTimers.delete(key);
        setBlock(x, y, z, 'repeater_off');
      }
    }
  }
  for (const [key, deadline] of repeaterTimers.entries()) {
    if (now < deadline) continue;
    const [x, y, z] = key.split(',').map(Number);
    if (getBlock(x, y, z) === 'repeater_off') { setBlock(x, y, z, 'repeater_on'); spawnParticles(x + 0.5, y + 0.4, z + 0.5, 0xe05040, 3); audio.play('click'); }
    repeaterTimers.delete(key);
  }
  // ---- 活塞(R42):四向 + 上方充能 → 伸出(推动链);断能 → 收回(方块留在原地)
  for (const m of redstoneParts.values()) {
    for (const [key, id] of m) {
      if (id !== 'piston' && id !== 'piston_ext') continue;
      const [x, y, z] = key.split(',').map(Number);
      if (getBlock(x, y, z) !== id) continue;
      let powered = false;
      for (const [dx, dy2, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, 0, 1], [0, 0, -1]]) {
        if ((power.get((x + dx) + ',' + (y + dy2) + ',' + (z + dz)) || 0) > 0) { powered = true; break; }
      }
      if (powered && id === 'piston') pistonExtend(x, y, z);
      else if (!powered && id === 'piston_ext') pistonRetract(x, y, z);
    }
  }
  // 执行器:铁门(两格门体,任一格四向相邻充能即开)
  for (const d of doors.values()) {
    if (d.type !== 'door_iron') continue;
    let powered = false;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if ((power.get((d.x + dx) + ',' + d.y + ',' + (d.z + dz)) || 0) > 0
          || (power.get((d.x + dx) + ',' + (d.y + 1) + ',' + (d.z + dz)) || 0) > 0) { powered = true; break; }
    }
    if (powered !== d.open) {
      d.open = powered;
      d.animT = 0;
      audio.play('step');
    }
  }
}

// ---- 活塞推动(R42) ----
const PISTON_FACING = [[1, 0], [-1, 0], [0, 1], [0, -1]];   // 0:+x 1:-x 2:+z 3:-z
const PISTON_IMMOVABLE = { chest: 1, furnace: 1, spawner: 1, cake: 1, bed: 1, enchanting_table: 1 };   // 容器/多方块不可推(经典)
function pistonFacingOf(x, y, z) {
  const f = pistons.get(x + ',' + y + ',' + z);
  return (f === undefined) ? 0 : f;
}
function pistonExtend(x, y, z) {
  const [fx, fz] = PISTON_FACING[pistonFacingOf(x, y, z)];
  // 前方链扫描:空气=链止;非固体非空气=被推掉(pop);固体=入链;
  // 链 >12 或遇不可推方块(含间接)→ 不动作(经典)
  const chain = [];
  let cx = x + fx, cz = z + fz;
  while (chain.length <= 12) {
    const b = getBlock(cx, y, cz);
    if (!b) break;
    if (b === 'water') break;   // 液体:链止(经典:活塞不推不弹液体,不吞水不铸水物品)
    if (PISTON_IMMOVABLE[b]) return false;
    if (!BLOCK_TYPES[b] || !BLOCK_TYPES[b].solid) {
      // 非固体元件被推掉(经典 pop):掉落物后该格为空,链止于此
      setBlock(cx, y, cz, null);
      let dropId = b, dropKind = 'block';
      if (b === 'redstone') { dropId = 'redstone_dust'; dropKind = 'item'; }
      else if (b === 'lever_on') dropId = 'lever_off';
      else if (b === 'repeater_on') dropId = 'repeater_off';
      else if (b === 'sugarcane') { dropId = 'sugarcane'; }
      spawnDroppedItem(cx, y, cz, dropId, 1, dropKind);
      audio.play('pop');
      break;
    }
    chain.push([cx, cz]);
    cx += fx; cz += fz;
  }
  if (chain.length > 12) return false;   // 超过 12 格推不动(经典)
  // 链尾 → 链首逐格前移(先移后清,避免覆盖)
  for (let i = chain.length - 1; i >= 0; i--) {
    const [ax, az] = chain[i];
    const b = getBlock(ax, y, az);
    setBlock(ax + fx, y, az + fz, b);
    setBlock(ax, y, az, null);
  }
  setBlock(x, y, z, 'piston_ext');
  spawnParticles(x + 0.5 + fx, y + 0.5, z + 0.5 + fz, 0xc8c8d2, 5);
  audio.play('place');
  unlockAchv('piston');   // 成就:精密机械(R42)
  return true;
}
function pistonRetract(x, y, z) {
  setBlock(x, y, z, 'piston');   // 收回(普通活塞:被推方块留在原地)
  audio.play('break');
}

// 红石元件直接破坏(R38):非固体元件射线穿不中 —— 沿视线采样最先命中的元件格
function raycastRedstone(maxDist) {
  const dx = -Math.sin(yaw) * Math.cos(pitch), dy = Math.sin(pitch), dz = -Math.cos(yaw) * Math.cos(pitch);
  for (let t = 0.3; t <= (maxDist || 4); t += 0.2) {
    const x = Math.floor(playerPos.x + dx * t), y = Math.floor(playerPos.y + dy * t), z = Math.floor(playerPos.z + dz * t);
    const b = getBlock(x, y, z);
    if (b && (REDSTONE_FAMILY[b] || b === CANE_ID)) return { x, y, z, id: b };
    if (b && BLOCK_TYPES[b] && BLOCK_TYPES[b].solid) return null;   // 先撞墙
  }
  return null;
}
// 门开关动画推进(在 animate 里调用)
function updateDoorAnim(dt) {
  for (const d of doors.values()) {
    if (d.animT === undefined) continue;
    d.animT += dt;
    const p = Math.min(1, d.animT / 0.3);
    const eased = d.open ? p : (1 - p);
    if (d.group) { const pivot = d.group.children.find(c => c.userData.isDoorPivot); if (pivot) pivot.rotation.y = -eased * Math.PI / 2; }
    if (p >= 1) d.animT = undefined;
  }
}

function doorBlocksAt(x, y, z) {
  const d1 = doors.get(doorKey(x,y,z)); if (d1 && !d1.open) return true;
  const d2 = doors.get(doorKey(x,y-1,z)); if (d2 && !d2.open) return true;
  return false;
}
function getDoorAt(x, y, z) {
  let d = doors.get(doorKey(x,y,z)); if (d) return d;
  return doors.get(doorKey(x,y-1,z)) || null;
}
function raycastDoor() {
  _rayEye.set(playerPos.x, playerPos.y, playerPos.z);
  _rayDir.set(-Math.sin(yaw)*Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw)*Math.cos(pitch));
  for (let t = 0.3; t <= 4; t += 0.25) {
    const sx = Math.floor(_rayEye.x+_rayDir.x*t), sy = Math.floor(_rayEye.y+_rayDir.y*t), sz = Math.floor(_rayEye.z+_rayDir.z*t);
    const wall = getBlock(sx, sy, sz);   // 遮挡:隔墙不能开关/拆门
    if (wall && BLOCK_TYPES[wall] && BLOCK_TYPES[wall].solid) return null;
    const d = getDoorAt(sx, sy, sz); if (d) return d;
  }
  return null;
}
// 释放门 mesh 的 geometry/material(避免 GPU 泄漏)
function disposeDoorGroup(g) {
  if (!g) return;
  g.traverse(function(o) {
    if (o.isMesh) {
      if (o.geometry) o.geometry.dispose();
      // 门板材质用共享缓存(不释放),frame/groove/knob 每次新建(释放)
      if (o.material && !o.userData.isDoorPanel) o.material.dispose();
    }
  });
}
function clearDoors() {
  for (const d of doors.values()) { if (d.group) { disposeDoorGroup(d.group); scene.remove(d.group); } }
  doors.clear();
}


// 破坏/放置粒子效果
const particles = [];
let particleGeo = null;
// 粒子材质按颜色缓存(方块颜色有限,避免每次破坏新建/销毁 8 个材质)
const particleMatCache = new Map();
function getParticleMat(colorHex) {
  let m = particleMatCache.get(colorHex);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color: colorHex });
    particleMatCache.set(colorHex, m);
  }
  return m;
}
function spawnParticles(x, y, z, colorHex, count) {
  if (!particleGeo) particleGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
  const mat = getParticleMat(colorHex);
  for (let i = 0; i < count; i++) {
    const m = new THREE.Mesh(particleGeo, mat);
    m.position.set(x + 0.5 + (Math.random() - 0.5) * 0.6, y + 0.5 + (Math.random() - 0.5) * 0.6, z + 0.5 + (Math.random() - 0.5) * 0.6);
    m.userData = { vel: new THREE.Vector3((Math.random() - 0.5) * 4, Math.random() * 4 + 1, (Math.random() - 0.5) * 4), life: 0.6 + Math.random() * 0.3 };
    scene.add(m);
    particles.push(m);
  }
}
function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.userData.vel.y -= 12 * dt;
    p.position.addScaledVector(p.userData.vel, dt);
    p.userData.life -= dt;
    p.scale.setScalar(Math.max(0.1, p.userData.life * 1.5));
    // 材质来自缓存,不 dispose(仅从场景移除)
    if (p.userData.life <= 0) { scene.remove(p); particles.splice(i, 1); }
  }
}

