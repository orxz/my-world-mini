// ============================================================
// 矿车系统(R26):铁轨上的可乘坐/可推动载具实体
// 寻路走 MACHINES.cartNextDir(纯函数可单测):优先直行、到弯自动转、到头停住
// 左键击打:移动中=顺向助推,静止=回收掉落;右键=乘坐(空格下车)
// 轨道被拆 → 出轨坠落落地;矿车随存档持久化(minecartsData)
// ============================================================
const minecarts = [];
let ridingCart = null;

function isRailAt(x, y, z) { return getBlock(x, y, z) === 'rail'; }

function buildCartMesh() {
  const g = new THREE.Group();
  const matBody = new THREE.MeshLambertMaterial({ color: 0xb8b8c0 });
  const matDark = new THREE.MeshLambertMaterial({ color: 0x5a5a62 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.08, 0.56), matBody);
  base.position.y = 0.04;
  g.add(base);
  const wall = (w, d, x, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.26, d), matBody);
    m.position.set(x, 0.2, z);
    g.add(m);
  };
  wall(0.82, 0.06, 0, -0.25); wall(0.82, 0.06, 0, 0.25);
  wall(0.06, 0.44, -0.38, 0); wall(0.06, 0.44, 0.38, 0);
  const rim = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.05, 0.62), matDark);
  rim.position.y = 0.34;
  g.add(rim);
  return g;
}

function spawnMinecart(cx, cy, cz) {
  const c = { cx, cz, y: cy, x: cx + 0.5, z: cz + 0.5, dx: 0, dz: 0, t: 0, speed: 0, vy: 0, mesh: buildCartMesh() };
  c.mesh.position.set(c.x, cy + 0.06, c.z);
  scene.add(c.mesh);
  minecarts.push(c);
  markDirtySave();
  return c;
}

function removeMinecart(c) {
  const i = minecarts.indexOf(c);
  if (i >= 0) minecarts.splice(i, 1);
  if (ridingCart === c) ridingCart = null;
  scene.remove(c.mesh);
  c.mesh.traverse(o => {   // 资源释放(M2 同款)
    if (o.isMesh) {
      if (o.geometry) o.geometry.dispose();
      if (Array.isArray(o.material)) { for (const mt of o.material) { if (mt.map) mt.map.dispose(); mt.dispose(); } }
      else if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); }
    }
  });
}

function clearMinecarts() {
  for (const c of minecarts.slice()) removeMinecart(c);   // 走单删路径(释放几何/材质,防泄漏)
  ridingCart = null;
}

// 射线拾取矿车(与 raycastMob 同款视线-半径判定)
function raycastCart(range) {
  const dirx = -Math.sin(yaw) * Math.cos(pitch), diry = Math.sin(pitch), dirz = -Math.cos(yaw) * Math.cos(pitch);
  const ex = playerPos.x, ey = playerPos.y, ez = playerPos.z;
  let best = null, bestD = range;
  for (const c of minecarts) {
    const dx = c.x - ex, dy = c.y + 0.25 - ey, dz = c.z - ez;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d > range + 1) continue;
    const dot = dx * dirx + dy * diry + dz * dirz;
    if (dot <= 0 || dot > range) continue;
    const px = dx - dirx * dot, py = dy - diry * dot, pz = dz - dirz * dot;
    if (px * px + py * py + pz * pz < 0.5 * 0.5 && d < bestD) { bestD = d; best = c; }
  }
  return best;
}

function mountCart(c) {
  ridingCart = c;
  c.speed = Math.max(c.speed, 4.5);
  if (c.dx === 0 && c.dz === 0) {
    const cy = Math.round(c.y);
    const nd = MACHINES.cartNextDir(isRailAt(c.cx + 1, cy, c.cz), isRailAt(c.cx - 1, cy, c.cz), isRailAt(c.cx, cy, c.cz + 1), isRailAt(c.cx, cy, c.cz - 1), 0, 0);
    if (nd) { c.dx = nd[0]; c.dz = nd[1]; }
  }
  showToast('乘坐矿车(空格下车)');
  unlockAchv('ride_cart');   // 成就:矿工之旅(R34)
}

function dismountCart() {
  if (!ridingCart) return;
  const c = ridingCart;
  ridingCart = null;
  c.speed = Math.min(c.speed, 2.5);   // 下车带一点惯性
  // 玩家挪到车旁,避免下一帧又触发乘坐
  playerPos.set(c.x + 0.9, c.y + 1.2, c.z);
  velocity.set(0, 0, 0);
  showToast('下车');
}

function punchCart(c) {
  swingArm(); swingHoldItem(); audio.play('place');
  if (c === ridingCart) { dismountCart(); return; }
  if (c.speed < 0.3) {
    // 静止矿车:击打回收(经典:打矿车掉矿车)
    removeMinecart(c);
    spawnDroppedItem(c.x, c.y + 0.3, c.z, 'minecart', 1, 'item');
    showToast('回收矿车'); markDirtySave();
    return;
  }
  c.speed = Math.min(c.speed + 1.5, 6);   // 移动中击打 = 顺向助推
  showToast('推动矿车');
}

function updateMinecarts(dt) {
  for (const c of minecarts) {
    const cy = Math.round(c.y);
    if (!isRailAt(c.cx, cy, c.cz)) {
      // 出轨:重力坠落,落到实体上停住(不水平移动)
      c.vy -= 22 * dt;
      c.y += c.vy * dt;
      const below = Math.floor(c.y - 0.01);
      if (below <= 0 || isSolidAt(c.cx, below, c.cz)) { c.y = below + 1; c.vy = 0; c.speed = 0; c.dx = c.dz = 0; }
      c.mesh.position.set(c.x, c.y + 0.06, c.z);
      if (c === ridingCart) playerPos.set(c.x, c.y + 1.2, c.z);
      continue;
    }
    // 乘坐自动驱动 / 推动惯性衰减
    if (c === ridingCart) c.speed = Math.max(c.speed, 4.5);
    else c.speed = Math.max(0, c.speed - (0.45 * c.speed + 0.08) * dt);
    if (c.speed > 0.02) {
      let rem = c.speed * dt, guard = 0;
      while (rem > 1e-5 && guard++ < 6) {
        if (c.dx === 0 && c.dz === 0) {
          const nd = MACHINES.cartNextDir(isRailAt(c.cx + 1, cy, c.cz), isRailAt(c.cx - 1, cy, c.cz), isRailAt(c.cx, cy, c.cz + 1), isRailAt(c.cx, cy, c.cz - 1), 0, 0);
          if (!nd) { c.speed = 0; break; }
          c.dx = nd[0]; c.dz = nd[1];
        }
        const step = Math.min(rem, 1 - c.t);
        c.t += step; rem -= step;
        if (c.t >= 1 - 1e-9) {
          c.cx += c.dx; c.cz += c.dz; c.t = 0;
          const nd = MACHINES.cartNextDir(isRailAt(c.cx + 1, cy, c.cz), isRailAt(c.cx - 1, cy, c.cz), isRailAt(c.cx, cy, c.cz + 1), isRailAt(c.cx, cy, c.cz - 1), c.dx, c.dz);
          if (!nd) { c.speed = 0; c.dx = c.dz = 0; break; }   // 到头停在格心
          c.dx = nd[0]; c.dz = nd[1];
        }
      }
      markDirtySave();
    }
    c.x = c.cx + 0.5 + c.dx * c.t;
    c.z = c.cz + 0.5 + c.dz * c.t;
    c.y = cy;
    c.mesh.position.set(c.x, cy + 0.06, c.z);
    c.mesh.rotation.y = c.dx !== 0 ? Math.PI / 2 : 0;
    if (c === ridingCart) { playerPos.set(c.x, cy + 1.2, c.z); velocity.set(0, 0, 0); }
  }
}

// ============================================================
// 经验与附魔(R28):经验球实体(磁吸吸收升级)+ 附魔台面板
// 升级阈值/升级结算/附魔选项生成在 machines.js 纯函数(可单测)
// ============================================================
const xpOrbs = [];
let xpOrbGeo = null, xpOrbMat = null;
function spawnXPOrbs(x, y, z, total) {
  // 拆成若干小球(每球 1-3 点),轻微散布
  let left = total;
  while (left > 0) {
    const v = Math.min(left, 1 + (Math.random() * 3 | 0));
    left -= v;
    if (!xpOrbGeo) {
      xpOrbGeo = new THREE.OctahedronGeometry(0.14);
      xpOrbMat = new THREE.MeshBasicMaterial({ color: 0x8ef24a });
    }
    const mesh = new THREE.Mesh(xpOrbGeo, xpOrbMat);
    const ox = x + (Math.random() - 0.5) * 1.2, oz = z + (Math.random() - 0.5) * 1.2;
    mesh.position.set(ox, y + 0.3, oz);
    scene.add(mesh);
    xpOrbs.push({ mesh, x: ox, y: y + 0.3, z: oz, value: v, vy: 2 + Math.random() * 2, age: 0 });
  }
}
function clearXPOrbs() {
  for (const o of xpOrbs) scene.remove(o.mesh);
  xpOrbs.length = 0;
}
function updateXPOrbs(dt) {
  for (let i = xpOrbs.length - 1; i >= 0; i--) {
    const o = xpOrbs[i];
    o.age += dt;
    const dx = playerPos.x - o.x, dy = (playerPos.y - 0.8) - o.y, dz = playerPos.z - o.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d < 1.2) {   // 吸收
      const gained = MACHINES.xpGain(xpState, o.value);
      audio.play('xp');   // 经验吸收清脆音(R43)
      if (gained > 0) { showToast('⭐ 升级!经验等级 ' + xpState.level); audio.play('levelup'); }
      updateXPBar();
      markDirtySave();
      scene.remove(o.mesh);
      xpOrbs.splice(i, 1);
      continue;
    }
    if (d < 4.5) {   // 磁吸飞向玩家
      o.x += dx / d * 6 * dt; o.y += dy / d * 6 * dt; o.z += dz / d * 6 * dt;
    } else {         // 重力 + 落地
      o.vy -= 18 * dt;
      let ny = o.y + o.vy * dt;
      if (isSolidAt(Math.floor(o.x), Math.floor(ny - 0.1), Math.floor(o.z))) { ny = Math.floor(ny - 0.1) + 1.1; o.vy = 0; }
      o.y = ny;
    }
    o.mesh.position.set(o.x, o.y + Math.sin(o.age * 3) * 0.06, o.z);
    o.mesh.rotation.y += dt * 2.5;
    if (o.age > 90) { scene.remove(o.mesh); xpOrbs.splice(i, 1); }
  }
}
function updateXPBar() {
  const fill = document.getElementById('xp-fill');
  const lv = document.getElementById('xp-level');
  if (fill) fill.style.width = Math.min(100, xpState.points / MACHINES.xpToNext(xpState.level) * 100) + '%';
  if (lv) lv.textContent = xpState.level > 0 ? String(xpState.level) : '';
}

// ---- 附魔台面板(JS 构建的经典灰岩面板) ----
let enchantPanelEl = null, currentEnchantOptions = null;
let enchantOpen = false;   // 面板开合状态(E/Esc 派发/指针门控/触屏冻结用,R53·B8)
function openEnchantPanel() {
  if (!enchantPanelEl) {
    enchantPanelEl = document.createElement('div');
    enchantPanelEl.id = 'enchant-panel';
    enchantPanelEl.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:80;background:#c6c6c6;border:4px solid;border-color:#fff #555 #555 #fff;padding:16px 18px;min-width:330px;max-width:90vw;box-shadow:0 8px 30px rgba(0,0,0,.5);font-size:14px;color:#222;';
    document.body.appendChild(enchantPanelEl);
  }
  const item = hotbar[currentSlot];
  currentEnchantOptions = (item && item.kind === 'tool')
    ? MACHINES.rollEnchants(TOOL_TYPES[item.id].tool, Math.random, TOOL_TYPES[item.id].tier === 'gold')
    : null;
  renderEnchantPanel();
  enchantOpen = true;
  enchantPanelEl.style.display = '';
  if (typeof syncPanelDim === 'function') syncPanelDim();
  if (document.pointerLockElement) document.exitPointerLock();
}
function closeEnchantPanel() {
  enchantOpen = false;
  if (enchantPanelEl) enchantPanelEl.style.display = 'none';
  if (typeof syncPanelDim === 'function') syncPanelDim();
  tryRelockPointer();
}
function renderEnchantPanel() {
  if (!enchantPanelEl) return;
  const item = hotbar[currentSlot];
  let inner = '<div style="font-weight:bold;margin-bottom:10px;font-size:15px;">✨ 附魔台 · 经验等级 <span style="color:#2a7a1a;">' + xpState.level + '</span> (' + xpState.points + '/' + MACHINES.xpToNext(xpState.level) + ')</div>';
  if (!item || item.kind !== 'tool') {
    inner += '<div style="color:#555;margin:12px 0;">手持工具 / 武器 / 弓 / 护甲再来(先在快捷栏选中)</div>';
  } else {
    const enchStr = item.ench ? ' <span style="color:#7a2aaa;">[' + Object.entries(item.ench).map(([k, v]) => MACHINES.ENCHANT_NAMES[k] + ' ' + 'I'.repeat(v)).join(' · ') + ']</span>' : '';
    inner += '<div style="margin-bottom:10px;">当前:' + itemName(item) + enchStr + '</div>';
    for (let i = 0; i < (currentEnchantOptions || []).length; i++) {
      const o = currentEnchantOptions[i];
      const afford = xpState.level >= o.cost;
      inner += '<button data-ei="' + i + '" style="display:block;width:100%;margin:6px 0;padding:8px 10px;background:' + (afford ? '#8b8b8b' : '#9a9a9a') + ';color:' + (afford ? '#fff' : '#777') + ';border:2px solid;border-color:#fff #444 #444 #fff;cursor:' + (afford ? 'pointer' : 'not-allowed') + ';font-size:13px;">✨ ' + MACHINES.ENCHANT_NAMES[o.type] + ' ' + 'I'.repeat(o.level) + ' —— 消耗 ' + o.cost + ' 级经验' + (afford ? '' : '(等级不足)') + '</button>';
    }
  }
  inner += '<button id="ench-close" style="margin-top:10px;padding:6px 20px;background:#6f6f6f;color:#fff;border:2px solid;border-color:#fff #444 #444 #fff;cursor:pointer;">关闭</button>';
  enchantPanelEl.innerHTML = inner;
  enchantPanelEl.querySelectorAll('button[data-ei]').forEach(b => {
    b.onclick = () => {
      const o = currentEnchantOptions && currentEnchantOptions[+b.dataset.ei];
      const item2 = hotbar[currentSlot];
      if (!o || !item2 || item2.kind !== 'tool') return;
      if (xpState.level < o.cost) { showToast('经验等级不足(需要 ' + o.cost + ' 级)'); return; }
      xpState.level -= o.cost;
      item2.ench = item2.ench || {};
      item2.ench[o.type] = Math.max(item2.ench[o.type] || 0, o.level);
      refreshHotbarSlot(currentSlot);
      updateXPBar();
      markDirtySave();
      audio.play('place');
      showToast('✨ 附魔成功:' + MACHINES.ENCHANT_NAMES[o.type] + ' ' + 'I'.repeat(o.level));
      unlockAchv('enchant');   // 成就:附魔师(R34)
      currentEnchantOptions = MACHINES.rollEnchants(TOOL_TYPES[item2.id].tool, Math.random, TOOL_TYPES[item2.id].tier === 'gold');
      renderEnchantPanel();
    };
  });
  const cb = enchantPanelEl.querySelector('#ench-close');
  if (cb) cb.onclick = closeEnchantPanel;
}

// ============================================================
// 钓鱼系统(R29):手持钓鱼竿右键甩竿 → 等待咬钩 → 窗口内再右键收鱼
// 产出:生鱼 70% / 蛛丝 15% / 皮革 10% / 绿宝石 5%(宝物)
// ============================================================
let fishingState = null;
function findWaterAlongView(maxDist) {
  const dx = -Math.sin(yaw) * Math.cos(pitch), dy = Math.sin(pitch), dz = -Math.cos(yaw) * Math.cos(pitch);
  for (let t = 0.4; t <= maxDist; t += 0.25) {
    const x = Math.floor(playerPos.x + dx * t), y = Math.floor(playerPos.y + dy * t), z = Math.floor(playerPos.z + dz * t);
    if (getBlock(x, y, z) === 'water') return { x: playerPos.x + dx * t, y: y + 0.95, z: playerPos.z + dz * t };
  }
  return null;
}
function startFishing(px, py, pz, rodItem) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), new THREE.MeshLambertMaterial({ color: 0xd03030 }));
  mesh.position.set(px, py, pz);
  scene.add(mesh);
  fishingState = { mesh, x: px, y: py, z: pz, t: 0, biteAt: 2 + Math.random() * 3.5, biteT: 0, stage: 'wait', rodItem };
  showToast('🎣 甩竿…等鱼上钩');
}
function endFishing() {
  if (fishingState) { scene.remove(fishingState.mesh); fishingState = null; }
}
function catchFish(f) {
  const r = Math.random();
  const drop = r < 0.7 ? ['raw_fish', '钓到生鱼!'] : r < 0.85 ? ['string', '钓到一团蛛丝?'] : r < 0.95 ? ['leather', '钓到旧皮革'] : ['gem_emerald', '钓到宝石!'];
  spawnDroppedItem(f.x - 0.5, f.y - 0.6, f.z - 0.5, drop[0], 1, 'item');
  showToast('🐟 ' + drop[1]);
  stats.fish++;
  audio.play('place');
  unlockAchv('fish');   // 成就:渔夫(R34)
  if (f.rodItem) consumeToolDurability(f.rodItem);
  markDirtySave();
}
function updateFishing(dt) {
  const f = fishingState;
  if (!f) return;
  f.t += dt;
  if (f.stage === 'wait') {
    if (f.t >= f.biteAt) {
      f.stage = 'bite'; f.biteT = 1.4;
      showToast('🐟 咬钩了!快按右键!');
      audio.play('place');
    }
  } else if (f.stage === 'bite') {
    f.biteT -= dt;
    f.mesh.position.y = f.y - 0.12 + Math.sin(f.t * 22) * 0.05;   // 浮标下坠抖动
    if (f.biteT <= 0) { showToast('鱼跑了…再甩一竿'); endFishing(); return; }
  }
  if (f.stage === 'wait') f.mesh.position.y = f.y + Math.sin(f.t * 2) * 0.03;
}

// ============================================================
// 动物繁殖(R29):手持小麦右键牛/羊/猪喂食 → 求爱模式(红心),
// 两只会合 → 产幼崽(0.55 缩放,60 秒长大);生育冷却 60 秒
// ============================================================
const MOB_CN = { pig: '猪', cow: '牛', sheep: '羊', villager: '村民', chicken: '鸡' };
function countPassives() {
  let n = 0;
  for (const m of mobs) if (!MOB_DEFS[m.type].hostile) n++;
  return n;
}
function feedAnimal(m, item) {
  swingHoldItem();
  if (m.baby) { showToast('幼崽还小,长大再喂'); return; }
  if (m.breedCd > 0) { showToast('它最近刚生育过,歇一歇'); return; }
  if (m.loveT > 0) { showToast('已在求爱中(再喂一只同类)'); return; }
  m.loveT = 30;
  item.count = (item.count || 1) - 1;
  if (item.count <= 0) hotbar[currentSlot] = null;
  refreshHotbarSlot(currentSlot);
  spawnParticles(m.mesh.position.x, m.mesh.position.y + 0.6, m.mesh.position.z, 0xff5a8a, 6);
  showToast('💗 ' + (MOB_CN[m.type] || m.type) + ' 进入求爱模式(再喂一只同类)');
}

// 村民喂食繁殖(R39,经典吃面包):求爱 30s,两只村民会合产崽;
// 村内(家屋 24 格)村民 ≥6 时拒绝(人满为患)
function feedVillager(m, item) {
  swingHoldItem();
  if (m.baby) { showToast('村民幼崽只想玩耍(长大再喂)'); return; }
  if (m.breedCd > 0) { showToast('他最近刚有宝宝,歇一歇'); return; }
  if (m.loveT > 0) { showToast('已在求爱中(再喂一位村民)'); return; }
  if (m.home && countVillagersNear(m.home.x, m.home.z) >= 6) { showToast('村里人满为患(≤6)'); return; }
  m.loveT = 30;
  item.count = (item.count || 1) - 1;
  if (item.count <= 0) hotbar[currentSlot] = null;
  refreshHotbarSlot(currentSlot);
  spawnParticles(m.mesh.position.x, m.mesh.position.y + 0.6, m.mesh.position.z, 0xff5a8a, 6);
  showToast('💗 村民进入求爱模式(手持面包再喂一位)');
}

// 夜间在距玩家 ≥12 格处生成敌对生物;难度按天数递进(R55)
function hostileCapNow() { return BALANCE_LIB.nightCap(dayCount); }
function isCaveHostile(m) { return m.mesh.position.y < SEA_LEVEL + 2; }
function countCaveHostiles() {
  let n = 0;
  for (const m of mobs) if (MOB_DEFS[m.type].hostile && isCaveHostile(m)) n++;
  return n;
}
// 地下生成:在已加载区块里找光级 <8 的洞穴空腔(与地表共享总 cap,地下最多 4)
function trySpawnCaveHostile() {
  if (countCaveHostiles() >= BALANCE.mobs.caveCap) return false;
  const arr = Array.from(chunks.values());
  if (!arr.length) return false;
  for (let tries = 0; tries < 6; tries++) {
    const ch = arr[(Math.random() * arr.length) | 0];
    const wx = ch.cx * CHUNK_SIZE + ((Math.random() * CHUNK_SIZE) | 0) + 0.5;
    const wz = ch.cz * CHUNK_SIZE + ((Math.random() * CHUNK_SIZE) | 0) + 0.5;
    const dx = wx - playerPos.x, dz = wz - playerPos.z;
    if (dx * dx + dz * dz < 144) continue;
    const fx = Math.floor(wx), fz = Math.floor(wz);
    for (let y = 3; y < 38; y++) {
      if (isSolidAt(fx, y - 1, fz) && !isSolidAt(fx, y, fz) && !isSolidAt(fx, y + 1, fz)
          && lightAtWorld(fx, y, fz) < 8) {
        spawnMob(wx, y, fz, dayCount >= 4 && Math.random() < 0.3 ? 'skeleton' : 'zombie');
        return true;
      }
    }
  }
  return false;
}
function trySpawnHostile() {
  if (!settings.hostiles || !settings.dayNightEnabled) return;
  if (tutorial.active) return;   // 新手教程期间不刷敌对生物(安全学习;跳过教程即恢复)
  if (sunHeight() > -0.05) return;   // 仅夜间
  if (countHostiles() >= hostileCapNow() || chunks.size === 0) return;
  // 地下优先(35%):洞穴不再是零风险提款机
  if (Math.random() < BALANCE.mobs.caveChance && trySpawnCaveHostile()) return;
  const arr = Array.from(chunks.values());
  const ch = arr[(Math.random() * arr.length) | 0];
  const wx = ch.cx * CHUNK_SIZE + ((Math.random() * CHUNK_SIZE) | 0) + 0.5;
  const wz = ch.cz * CHUNK_SIZE + ((Math.random() * CHUNK_SIZE) | 0) + 0.5;
  const dx = wx - playerPos.x, dz = wz - playerPos.z;
  if (dx * dx + dz * dz < 144) return;
  const fx = Math.floor(wx), fz = Math.floor(wz);
  for (let y = WORLD_HEIGHT - 2; y > SEA_LEVEL; y--) {
    const b = getBlock(fx, y, fz);
    if (!b) continue;
    if (b !== 'water' && BLOCK_TYPES[b] && BLOCK_TYPES[b].solid && !getBlock(fx, y + 1, fz) && !getBlock(fx, y + 2, fz)) {
      // 光照判定(经典):生成点火把光级 ≥8 过亮 → 不刷(火把防刷怪)
      if (lightAtWorld(fx, y + 1, fz) < 8) {
        const r = Math.random();
        // 第 1 夜仅僵尸;第 2 夜解锁骷髅/苦力怕;第 4 夜蜘蛛/史莱姆;第 5 夜末影人
        if (dayCount <= 1) spawnMob(wx, y + 1, fz, 'zombie');
        else if (dayCount === 2) (r < 0.6 ? spawnMob(wx, y + 1, fz, 'zombie') : r < 0.8 ? spawnMob(wx, y + 1, fz, 'creeper') : spawnMob(wx, y + 1, fz, 'skeleton'));
        else if (dayCount === 3) (r < 0.45 ? spawnMob(wx, y + 1, fz, 'zombie') : r < 0.68 ? spawnMob(wx, y + 1, fz, 'creeper') : r < 0.86 ? spawnMob(wx, y + 1, fz, 'skeleton') : spawnMob(wx, y + 1, fz, 'spider'));
        else if (r < 0.36) spawnMob(wx, y + 1, fz, 'zombie');
        else if (r < 0.58) spawnMob(wx, y + 1, fz, 'creeper');
        else if (r < 0.76) spawnMob(wx, y + 1, fz, 'skeleton');
        else if (r < 0.88) spawnMob(wx, y + 1, fz, 'spider');
        else if (r < 0.96) spawnMob(wx, y + 1, fz, 'slime');
        else if (dayCount >= 5) spawnMob(wx, y + 1, fz, 'enderman');
        else spawnMob(wx, y + 1, fz, 'zombie');
      }
    }
    break;   // 只看地表第一个非空气方块
  }
}

function clearHostiles() {
  for (let i = mobs.length - 1; i >= 0; i--) {
    if (MOB_DEFS[mobs[i].type].hostile) removeMob(i);
  }
}

// 生物更新:按类型 AI(猪游荡 / 僵尸追击近战白天燃烧 / 苦力怕引信爆炸)+ 共享物理
function updateMobs(dt) {
  mobSpawnTimer -= dt;
  if (mobSpawnTimer <= 0) { mobSpawnTimer = 1.5; trySpawnMob(); }
  hostileSpawnTimer -= dt;
  if (hostileSpawnTimer <= 0) { hostileSpawnTimer = BALANCE.mobs.spawnInterval; trySpawnHostile(); }
  const maxDist = (RENDER_DISTANCE + 2) * CHUNK_SIZE;
  for (let i = mobs.length - 1; i >= 0; i--) {
    const m = mobs[i];
    const p = m.mesh.position;
    const dxp = p.x - playerPos.x, dzp = p.z - playerPos.z;
    const distP = Math.sqrt(dxp * dxp + dzp * dzp);
    // 距离过远或所在区块已卸载 → 移除
    if (distP > maxDist
        || !chunks.has(chunkKey(Math.floor(p.x / CHUNK_SIZE), Math.floor(p.z / CHUNK_SIZE)))) {
      removeMob(i); continue;
    }

    // ---- 按类型 AI(决定 yaw/speed 与特殊行为);返回 true 表示该生物已移除 ----
    // 繁殖与成长(R29):求爱红心 + 配对产崽;幼崽 60 秒长大
    if (!MOB_DEFS[m.type].hostile) {
      if (m.baby) {
        m.growT -= dt;
        if (m.growT <= 0) { m.baby = false; m.mesh.scale.setScalar(1); }
      }
      // 产蛋(R40):每 90-180 秒下一枚蛋(经典 5-10 分钟的游戏节奏缩短)
      if (m.type === 'chicken' && !m.baby) {
        if (m.eggT === undefined) m.eggT = 90 + Math.random() * 90;
        m.eggT -= dt;
        if (m.eggT <= 0) {
          m.eggT = 90 + Math.random() * 90;
          spawnDroppedItem(m.mesh.position.x - 0.5, m.mesh.position.y - 0.2, m.mesh.position.z - 0.5, 'egg', 1, 'item');
          spawnParticles(m.mesh.position.x, m.mesh.position.y - 0.2, m.mesh.position.z, 0xf0e8d0, 4);
          audio.play('pop');
        }
      }
      // 剪毛恢复(R35):45 秒后羊毛长回
      if (m.sheared) {
        m.shearT -= dt;
        if (m.shearT <= 0) {
          m.sheared = false;
          for (const part of m.mesh.userData.woolParts) part.material = m.mesh.userData.woolMat;
        }
      }
      if (m.breedCd > 0) m.breedCd -= dt;
      if (m.loveT > 0) {
        m.loveT -= dt;
        m.heartT = (m.heartT || 0) - dt;
        if (m.heartT <= 0) {
          m.heartT = 0.8;
          spawnParticles(p.x, p.y + 0.6, p.z, 0xff5a8a, 2);
        }
        for (const o of mobs) {
          if (o !== m && o.type === m.type && o.loveT > 0 && !o.baby && !o.breedCd
              && o.mesh.position.distanceTo(p) < 3) {
            if (countPassives() >= 15) { showToast('动物太多啦'); m.loveT = 0; o.loveT = 0; break; }
            m.loveT = 0; o.loveT = 0;
            m.breedCd = 60; o.breedCd = 60;
            const baby = spawnMob((p.x + o.mesh.position.x) / 2, ((p.y + o.mesh.position.y) / 2) - 0.45, (p.z + o.mesh.position.z) / 2, m.type);
            baby.baby = true; baby.growT = 60;
            baby.mesh.scale.setScalar(0.55);
            spawnParticles(baby.mesh.position.x, baby.mesh.position.y, baby.mesh.position.z, 0xff5a8a, 10);
            showToast('💗 ' + (MOB_CN[m.type] || m.type) + '宝宝诞生了!');
            audio.play('place');
            unlockAchv('breed');   // 成就:牧场主(R34)
            break;
          }
        }
      }
    }
    if (m.type === 'pig') {
      wanderStep(m, dt, 1.3, 0.65);
    } else if (m.type === 'chicken') {
      wanderStep(m, dt, 1.1, 0.6);
    } else if (m.type === 'cow' || m.type === 'sheep') {
      wanderStep(m, dt, 1.1, 0.6);
    } else if (m.type === 'villager') {
      // 村民(R33):平时村庄周边慢逛;离村 >14 格朝家走;受击后 5 秒逃離玩家
      if (m.fleeT > 0) {
        m.fleeT -= dt;
        m.yaw = Math.atan2(playerPos.x - p.x, playerPos.z - p.z);   // 背向玩家
        m.speed = 1.9;
      } else {
        wanderStep(m, dt, 0.85, 0.55);
        if (m.home) {
          const dh = Math.hypot(m.home.x - p.x, m.home.z - p.z);
          if (dh > 14) {
            m.yaw = Math.atan2(-(m.home.x - p.x), -(m.home.z - p.z));   // 朝家走
            m.speed = 0.9;
          }
        }
      }
    } else if (m.type === 'zombie') {
      if (zombieAI(m, dt, distP)) continue;
    } else if (m.type === 'spider') {
      if (spiderAI(m, dt, distP)) continue;
    } else if (m.type === 'enderman') {
      if (endermanAI(m, dt, distP)) continue;
    } else if (m.type === 'skeleton') {
      if (skeletonAI(m, dt, distP)) continue;
    } else if (m.type === 'slime') {
      slimeAI(m, dt, distP);
    } else if (m.type === 'golem_ancient') {
      ancientGolemAI(m, dt, distP);
    } else if (m.type === 'golem') {
      golemAI(m, dt, distP);
    } else if (creeperAI(m, dt, distP)) {
      continue;
    }

    // ---- 共享物理:重力/浮力 + 碰撞(撞墙跳一格或转向)+ 落地 ----
    const inW = getBlock(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)) === 'water';
    const dirx = -Math.sin(m.yaw) * m.speed, dirz = -Math.cos(m.yaw) * m.speed;
    // 重力 / 水中浮力
    if (inW) m.vy += (2.2 - m.vy) * Math.min(1, dt * 3);
    else m.vy -= GRAVITY * dt;
    // 前方阻挡检测(脚部+半高),撞墙:概率跳一格,否则转向
    // R57:脚底偏移按类型取(铁傀儡原点在脚底,普通生物在身体中心)
    const footOff = m.footOff !== undefined ? m.footOff : 0.45;
    const footY = Math.floor(p.y - footOff + 0.1), midY = Math.floor(p.y + 0.1);
    const dlen = Math.hypot(dirx, dirz);
    if (dlen > 0.01 && m.onGround) {
      const ax = p.x + dirx / dlen * 0.5, az = p.z + dirz / dlen * 0.5;
      const fbx = getBlock(Math.floor(ax), footY, Math.floor(az)) || getBlock(Math.floor(ax), midY, Math.floor(az));
      if (fbx && BLOCK_TYPES[fbx] && BLOCK_TYPES[fbx].solid) {
        // 栅栏(R41):生物不越栏(1.5 格),只会转向;其余方块照旧半数跳
        if (fbx === 'fence') { m.yaw += Math.PI * (0.5 + Math.random()); m.turnT = 1 + Math.random() * 2; }
        else if (Math.random() < 0.5) m.vy = 7.2;
        else { m.yaw += Math.PI * (0.5 + Math.random()); m.turnT = 1 + Math.random() * 2; }
      }
    }
    // 位移(x/z 分轴,撞墙滑动并反弹转向;叠加击退速度)
    let nx = p.x + (dirx + m.kvx) * dt;
    if (dirx + m.kvx !== 0) {
      const sx = Math.sign(dirx + m.kvx);
      if (isSolidAt(Math.floor(nx + sx * 0.3), footY, Math.floor(p.z)) || isSolidAt(Math.floor(nx + sx * 0.3), midY, Math.floor(p.z))) {
        nx = p.x; m.kvx = 0; m.yaw = Math.PI - m.yaw;
      }
    }
    let nz = p.z + (dirz + m.kvz) * dt;
    if (dirz + m.kvz !== 0) {
      const sz = Math.sign(dirz + m.kvz);
      if (isSolidAt(Math.floor(nx), footY, Math.floor(nz + sz * 0.3)) || isSolidAt(Math.floor(nx), midY, Math.floor(nz + sz * 0.3))) {
        nz = p.z; m.kvz = 0; m.yaw = -m.yaw;
      }
    }
    p.x = nx; p.z = nz;
    // 击退速度衰减
    const kd = Math.max(0, 1 - dt * 5);
    m.kvx *= kd; m.kvz *= kd;
    // 垂直:落地支撑 / 顶头
    let ny = p.y + m.vy * dt;
    m.onGround = false;
    if (m.vy <= 0) {
      const supportY = Math.floor(ny - footOff - 0.05);
      if (isSolidAt(Math.floor(p.x), supportY, Math.floor(p.z))) { ny = supportY + 1 + footOff; m.vy = 0; m.onGround = true; }
    } else if (isSolidAt(Math.floor(p.x), Math.floor(ny + 0.45), Math.floor(p.z))) {
      m.vy = 0; ny = p.y;
    }
    p.y = ny;
    if (p.y < -5) { removeMob(i); continue; }
    // 朝向 + 行走摆腿(4 腿对角步态 / 2 腿交替);僵尸双臂前平举微摆
    m.mesh.rotation.y = m.yaw;
    const moving = m.speed > 0.05 && m.onGround;
    if (moving) m.walkPhase += dt * (m.type === 'pig' ? 8 : 10);
    const swing = moving ? Math.sin(m.walkPhase) * 0.55 : 0;
    const legs = m.mesh.userData.legs;
    if (legs.length === 2) {
      legs[0].rotation.x = swing; legs[1].rotation.x = -swing;
    } else if (legs.length >= 4) {
      legs[0].rotation.x = swing; legs[3].rotation.x = swing;
      legs[1].rotation.x = -swing; legs[2].rotation.x = -swing;
    }
    if (m.mesh.userData.arms) {
      const armSwing = -Math.PI / 2 + (moving ? Math.sin(m.walkPhase) * 0.12 : 0);
      m.mesh.userData.arms[0].rotation.x = armSwing;
      m.mesh.userData.arms[1].rotation.x = armSwing;
    }
    // 受击闪红恢复
    if (m.hurtT > 0) {
      m.hurtT -= dt;
      if (m.hurtT <= 0) {
        const mats = m.mesh.userData.mats, base = m.mesh.userData.baseColors;
        for (let k = 0; k < mats.length; k++) mats[k].color.setHex(base[k]);
      }
    }
  }
}

// 击中生物:扣血 + 击退 + 闪红;HP 归零 → 粒子消散(silent=不播音效,燃烧伤害用)
// ---- 史莱姆 AI(R35):地面蓄力 → 蹦跳逼近(经典移动方式);接触伤害按体型 ----
// 大(4)/中(2)有伤害;小无伤。跳跃中速度保持,落地进入下一次蓄力
function slimeAI(m, dt, distP) {
  if (m.onGround) {
    m.speed = 0;
    m.slimeCharge -= dt;
    if (m.slimeCharge <= 0) {
      m.slimeCharge = 0.6 + Math.random() * 0.8;
      m.yaw = distP < 14 ? faceYaw(m) : m.yaw + (Math.random() - 0.5) * 2;
      m.speed = 2.4;
      m.vy = 6.8;
    }
  }
  // 接触伤害(冷却 1.2s)
  m.attackCd -= dt;
  if (distP < 1.4 && m.slimeSize > 0 && m.attackCd <= 0) {
    m.attackCd = 1.2;
    damagePlayer([0, 2, 4][m.slimeSize], 'combat');
  }
  // 胶体挤压动画:上升拉伸/下落压扁(仅缩放,不动网格结构)
  const sq = 1 + Math.max(-0.22, Math.min(0.22, m.vy * 0.035));
  m.mesh.scale.set(m.slimeBase / Math.sqrt(sq), m.slimeBase * sq, m.slimeBase / Math.sqrt(sq));
  return false;
}

// ---- 铁傀儡 AI(R39):村庄守护 —— 12 格内敌对生物优先追击(伤 10 击退),
//      无敌时慢逛守村;被玩家攻击后反击 15 秒(伤 7,经典) ----
function golemAI(m, dt, distP) {
  m.attackCd -= dt;
  // 原版(R57):玩家建造的铁傀儡永不攻击玩家 —— 被误伤也只掉血不还手
  if (m.angered && m.playerCreated) m.angered = false;
  if (m.angered) {
    m.angerT -= dt;
    if (m.angerT <= 0) { m.angered = false; }
    else {
      m.yaw = faceYaw(m);
      m.speed = 2.0;
      if (distP < 1.8 && m.attackCd <= 0) {
        m.attackCd = 1.2;
        damagePlayer(7, 'combat');
        velocity.y = 5;   // 大力击飞(经典)
      }
      return false;
    }
  }
  // 守护:找 12 格内最近的敌对生物
  let tgt = null, bd = 12;
  for (const o of mobs) {
    if (o === m || !MOB_DEFS[o.type] || !MOB_DEFS[o.type].hostile) continue;
    const dx = o.mesh.position.x - m.mesh.position.x, dz = o.mesh.position.z - m.mesh.position.z;
    const d = Math.hypot(dx, dz);
    if (d < bd) { bd = d; tgt = o; }
  }
  if (tgt) {
    const dx = tgt.mesh.position.x - m.mesh.position.x, dz = tgt.mesh.position.z - m.mesh.position.z;
    m.yaw = Math.atan2(-dx, -dz);
    m.speed = 2.0;
    if (bd < 1.9 && m.attackCd <= 0) {
      m.attackCd = 1.0;
      hurtMob(tgt, 10, dx / Math.max(0.01, bd), dz / Math.max(0.01, bd));
      spawnParticles(tgt.mesh.position.x, tgt.mesh.position.y + 0.5, tgt.mesh.position.z, 0xd8d8e0, 5);
    }
  } else {
    // R57:守村巡逻 —— 以生成点为圆心选一个巡逻点走过去,到了再换;
    // 不再用 wanderStep 的"随机停走"(方向随机 + 30% 站桩,10 秒只能挪 3 格,看着像不动)
    const gx = m.mesh.position.x, gz = m.mesh.position.z;
    if (m.homeX === undefined) { m.homeX = gx; m.homeZ = gz; }
    if (m.patrolX === undefined || Math.hypot(m.patrolX - gx, m.patrolZ - gz) < 1.0) {
      const ang = Math.random() * Math.PI * 2, r = 3 + Math.random() * 5;
      m.patrolX = m.homeX + Math.cos(ang) * r;
      m.patrolZ = m.homeZ + Math.sin(ang) * r;
    }
    m.yaw = Math.atan2(-(m.patrolX - gx), -(m.patrolZ - gz));
    m.speed = 1.15;
    // 卡住自救:1.2 秒内几乎没位移(墙角/半格卡位)→ 抬一格并重新选点
    if (m.stuckT === undefined) { m.stuckT = 0; m.stuckX = gx; m.stuckZ = gz; }
    m.stuckT += dt;
    if (m.stuckT > 1.2) {
      if (Math.hypot(gx - m.stuckX, gz - m.stuckZ) < 0.15) { m.vy = 6.5; m.patrolX = undefined; }
      m.stuckT = 0; m.stuckX = gx; m.stuckZ = gz;
    }
  }
  return false;
}

// ---- 远古铁傀儡(R55):核心地牢精英,始终敌对,重击 + 击飞 ----
function ancientGolemAI(m, dt, distP) {
  m.attackCd -= dt;
  if (distP < 20) {
    m.yaw = faceYaw(m);
    m.speed = 1.7;
    if (distP < 2.3 && m.attackCd <= 0) {
      m.attackCd = 1.5;
      damagePlayer(8, 'combat');
      velocity.y = 5.5;
      spawnParticles(m.mesh.position.x, m.mesh.position.y + 0.9, m.mesh.position.z, 0x8a7a5a, 8);
    }
  } else {
    m.speed = 0.5;
  }
  return false;
}

function hurtMob(m, dmg, kx, kz, silent) {
  if (!m || m.hp <= 0) return;
  if (m.hurtT > 0.001) return;   // R55:受击无敌帧(0.30s),防多源/连击叠加
  m.hp -= dmg;
  m.hurtT = BALANCE.combat.invuln;
  // 末影人被攻击即激怒,并短暂延迟后瞬移(经典)
  if (m.type === 'enderman') { m.angered = true; m.tpT = 0.35; }
  // 村民被攻击 → 转身逃跑(经典:不还手)
  if (m.type === 'villager') m.fleeT = 5;
  // 铁傀儡被玩家攻击 → 反击 15 秒(经典,R39)
  if (m.type === 'golem') { m.angered = true; m.angerT = 15; }
  // 击退:R57 —— 铁傀儡体型大,受击只轻微上抬(原 4 会让 2.4 格高的傀儡看起来在飞)
  const knockUp = (m.type === 'golem' || m.type === 'golem_ancient') ? 1.2 : 4;
  m.kvx += kx * 6; m.kvz += kz * 6; m.vy = knockUp;
  const mats = m.mesh.userData.mats;
  for (let k = 0; k < mats.length; k++) mats[k].color.setHex(0xd05a5a);
  if (!silent) audio.play(m.type === 'zombie' ? 'zombie' : m.type === 'creeper' ? 'hurt' : 'pig');
  if (m.hp <= 0) {
    stats.kills++;   // R55:统计
    const p = m.mesh.position;
    spawnParticles(p.x - 0.5, p.y - 0.5, p.z - 0.5, m.type === 'pig' ? 0xeba3a9 : m.type === 'cow' ? 0x6b4a2f : m.type === 'sheep' ? 0xe8e8e4 : m.type === 'spider' ? 0x2a2a30 : m.type === 'enderman' ? 0x7a4a9a : m.type === 'villager' ? 0x7a5a3a : m.type === 'slime' ? 0x6fc05a : m.type === 'golem' ? 0xc8c8d2 : 0x7a9a7a, 12);
    // 经典掉落(按生物类型)
    const dropAt = (id, kind, count) => spawnDroppedItem(p.x - 0.5, p.y - 0.2, p.z - 0.5, id, count, kind);
    if (m.type === 'pig') dropAt('porkchop', 'item', 1 + (Math.random() < 0.5 ? 1 : 0));
    else if (m.type === 'cow') { dropAt('beef', 'item', 1 + (Math.random() < 0.5 ? 1 : 0)); dropAt('leather', 'item', 1); }
    else if (m.type === 'sheep') { dropAt('mutton', 'item', 1 + (Math.random() < 0.5 ? 1 : 0)); if (!m.sheared) dropAt('wool_white', 'block', 1); }   // 剪过的羊不再掉毛(R35)
    else if (m.type === 'chicken') { dropAt('raw_chicken', 'item', 1); dropAt('feather', 'item', Math.random() < 0.5 ? 2 : 1); }   // R40
    else if (m.type === 'skeleton') dropAt('arrow', 'item', Math.random() < 0.7 ? 2 : 1);
    else if (m.type === 'spider') dropAt('string', 'item', Math.random() < 0.5 ? 2 : 1);
    else if (m.type === 'enderman' && Math.random() < 0.6) dropAt('ender_pearl', 'item', 1);
    else if (m.type === 'slime') {
      // 经典分裂:大/中史莱姆死亡 → 2-3 只小一级;最小级掉黏液球
      if (m.slimeSize > 0) {
        const n = 2 + (Math.random() < 0.5 ? 1 : 0);
        for (let i = 0; i < n; i++) {
          spawnMob(p.x + (Math.random() - 0.5) * 1.2, p.y - 0.2, p.z + (Math.random() - 0.5) * 1.2, 'slime', { size: m.slimeSize - 1 });
        }
        spawnParticles(p.x, p.y, p.z, 0x6fc05a, 10);
      } else if (Math.random() < 0.75) dropAt('slime_ball', 'item', Math.random() < 0.35 ? 2 : 1);
    }
    else if (m.type === 'golem') dropAt('iron_ingot', 'item', 3 + (Math.random() * 3 | 0));   // 铁傀儡:铁锭 3-5(经典,R39)
    else if (m.type === 'golem_ancient') { dropAt('iron_block', 'block', 2); dropAt('gem_gold', 'item', 2); unlockAchv('ancient_golem'); }   // R55:远古铁卫
    // 经验球(R28):敌对 5(末影人 10)/被动 1-3;铁傀儡 0(经典,R39)
    spawnXPOrbs(p.x, p.y, p.z, m.type === 'golem' ? 0 : m.type === 'golem_ancient' ? 20 : MOB_DEFS[m.type].hostile ? (m.type === 'enderman' ? 10 : 5) : 1 + (Math.random() * 3 | 0));
    if (m.type === 'zombie') unlockAchv('kill_zombie');       // 成就:怪物猎人(R34)
    else if (m.type === 'creeper') unlockAchv('kill_creeper'); // 成就:拆弹专家
    else if (m.type === 'slime' && m.slimeSize === 0) unlockAchv('kill_slime');   // 成就:黏糊糊(R35)
    killMob(m);
    showToast(m.type === 'zombie' ? '🧟 击倒了僵尸' : m.type === 'creeper' ? '💥 击倒了苦力怕' : m.type === 'skeleton' ? '💀 击倒了骷髅' : m.type === 'spider' ? '🕷 击倒了蜘蛛' : m.type === 'enderman' ? '🟣 击倒了末影人' : m.type === 'villager' ? '🧑‍🌾 村民倒下了…(他什么也没掉落)' : m.type === 'slime' ? '🟢 击碎了' + ['小', '中', '大'][m.slimeSize] + '史莱姆' : m.type === 'golem' ? '🤖 铁傀儡倒下了…' : m.type === 'cow' ? '🐮 击倒了牛' : m.type === 'sheep' ? '🐑 击倒了羊' : '🐷 击倒了猪');
  }
}

// 视线命中生物(球体近似:沿视线 3.5 格内、夹角最小者)
function raycastMob(maxDist) {
  const dx = -Math.sin(yaw) * Math.cos(pitch), dy = Math.sin(pitch), dz = -Math.cos(yaw) * Math.cos(pitch);
  let best = null, bestT = maxDist;
  for (const m of mobs) {
    const p = m.mesh.position;
    // R57:铁傀儡模型原点在脚底且高 2.4 格,用躯干中心(脚底 +1.2)当命中球心,
    // 否则视线齐平看过去会从头顶掠过 —— 手持铁锭右键修复/左键攻击都打不中
    const cy = p.y + ((m.type === 'golem' || m.type === 'golem_ancient') ? 1.2 : 0);
    const tx = p.x - playerPos.x, ty = cy - playerPos.y, tz = p.z - playerPos.z;
    const proj = tx * dx + ty * dy + tz * dz;
    if (proj <= 0.3 || proj > bestT) continue;
    const perp2 = tx * tx + ty * ty + tz * tz - proj * proj;
    const hitR2 = (m.type === 'golem' || m.type === 'golem_ancient') ? 1.15 : 0.55;   // 体型大,命中球也放大
    if (perp2 < hitR2) {
      // 遮挡:命中最优目标前先采样视线穿过的体素,遇固体即被墙挡住
      let blocked = false;
      for (let t = 0.4; t < proj; t += 0.5) {
        const wb = getBlock(Math.floor(playerPos.x + dx * t), Math.floor(playerPos.y + dy * t), Math.floor(playerPos.z + dz * t));
        if (wb && BLOCK_TYPES[wb] && BLOCK_TYPES[wb].solid) { blocked = true; break; }
      }
      if (!blocked) { best = m; bestT = proj; }
    }
  }
  return best;
}

// ============================================================
// 沙子/沙砾重力(复刻经典 MC):失去支撑后化为下落实体坠落堆积
// setBlock 时向队列写入支撑检查(本格 + 上格);链式反应逐列崩落
// ============================================================
const fallingBlocks = [];
const fallCheckQueue = [];   // 平铺 [x,y,z,...],避免对象分配
const FALLING_TYPES = { sand: 1, gravel: 1 };

function scheduleFallCheck(x, y, z) {
  fallCheckQueue.push(x, y, z);
}

// 下落实体:以方块外观坠落,落到固体顶部即还原为方块(记录改动,随存档持久)
function startFallingBlock(x, y, z, type) {
  setBlock(x, y, z, null);   // 原位变空气(并触发上方同类的支撑检查 → 链式崩落)
  const mesh = new THREE.Mesh(blockGeo, materials[type]);
  mesh.position.set(x + 0.5, y + 0.5, z + 0.5);
  scene.add(mesh);
  fallingBlocks.push({ mesh, type, vy: 0 });
}

function updateFallingBlocks(dt) {
  // 处理支撑检查队列(处理中可能入队更多 → while 直至清空,链式级联)
  while (fallCheckQueue.length) {
    const z = fallCheckQueue.pop(), y = fallCheckQueue.pop(), x = fallCheckQueue.pop();
    if (y <= 0 || y >= WORLD_HEIGHT) continue;
    const b = getBlock(x, y, z);
    if (b && FALLING_TYPES[b] && !isSolidAt(x, y - 1, z)) startFallingBlock(x, y, z, b);
  }
  for (let i = fallingBlocks.length - 1; i >= 0; i--) {
    const f = fallingBlocks[i];
    f.vy = Math.max(-22, f.vy - GRAVITY * dt);
    let ny = f.mesh.position.y + f.vy * dt;
    const bx = Math.floor(f.mesh.position.x), bz = Math.floor(f.mesh.position.z);
    const below = Math.floor(ny - 0.5);
    if (isSolidAt(bx, below, bz)) {
      // 落地:还原为方块(若正好落在玩家所在格,抬高一层避免把玩家埋进方块)
      let landY = below + 1;
      if (overlapsPlayer(bx, landY, bz)) landY += 1;
      setBlock(bx, landY, bz, f.type);
      scene.remove(f.mesh);
      fallingBlocks.splice(i, 1);
      audio.play('step');
      continue;
    }
    f.mesh.position.y = ny;
    if (ny < -10) { scene.remove(f.mesh); fallingBlocks.splice(i, 1); }
  }
}

function clearFallingBlocks() {
  for (const f of fallingBlocks) scene.remove(f.mesh);
  fallingBlocks.length = 0;
  fallCheckQueue.length = 0;
}

