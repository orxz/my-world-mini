// ============================================================
// TNT(经典:右键点燃 → 上跳 + 闪烁膨胀 ~2.5 秒后爆炸,复用苦力怕爆炸)
// ============================================================
const tntEnts = [];
function igniteTNT(x, y, z) {
  setBlock(x, y, z, null);
  const mesh = new THREE.Mesh(blockGeo, materials.tnt);
  mesh.position.set(x + 0.5, y + 0.5, z + 0.5);
  mesh.scale.setScalar(0.98);
  scene.add(mesh);
  tntEnts.push({ mesh, vy: 3.5, fuse: 0 });
  audio.play('fuse');
  showToast('💥 TNT 已点燃,快跑!');
}

function updateTNT(dt) {
  for (let i = tntEnts.length - 1; i >= 0; i--) {
    const e = tntEnts[i];
    e.fuse += dt;
    // 重力 + 地面支撑
    e.vy = Math.max(-18, e.vy - GRAVITY * dt);
    let ny = e.mesh.position.y + e.vy * dt;
    const bx = Math.floor(e.mesh.position.x), bz = Math.floor(e.mesh.position.z);
    if (e.vy <= 0 && isSolidAt(bx, Math.floor(ny - 0.5), bz)) {
      ny = Math.floor(ny - 0.5) + 1 + 0.5;
      e.vy = 0;
    }
    e.mesh.position.y = ny;
    // 闪烁:膨胀 + 高频明灭(最后 1 秒更急促)
    const p = e.fuse / 2.5;
    e.mesh.scale.setScalar(0.98 + p * 0.15);
    const rate = p > 0.6 ? 16 : 7;
    e.mesh.visible = ((e.fuse * rate) | 0) % 2 === 0;
    if (e.fuse >= 2.5) {
      const pos = e.mesh.position;
      scene.remove(e.mesh);
      tntEnts.splice(i, 1);
      explodeAt(pos.x, pos.y, pos.z, 3.2, 18);
    }
  }
}

function clearTNT() {
  for (const e of tntEnts) scene.remove(e.mesh);
  tntEnts.length = 0;
}

// ============================================================
// 熔炉(经典:右键打开;燃料燃烧 + 冶炼进度,状态随存档持久化)
// ============================================================
const furnaces = new Map();   // "x,y,z" -> {x,y,z, input, fuel, output, burnT, burnMax, cookT}
// 熔炉常量与状态机提取到纯模块 machines.js(R25 治理轮,可单测);
// 燃料产能:1 个产物 = COOK_TIME 秒
const COOK_TIME = MACHINES.COOK_TIME;
const SMELT = MACHINES.SMELT;
let furnaceOpen = null;   // 当前打开面板的熔炉 key(null=关)

function getFurnace(x, y, z) {
  const key = blockKey(x, y, z);
  let f = furnaces.get(key);
  if (!f) { f = { x, y, z, input: null, fuel: null, output: null, burnT: 0, burnMax: 1, cookT: 0 }; furnaces.set(key, f); }
  return f;
}

// 熔炉状态机(每帧推进;燃烧中消耗燃料,完成后产出)
function updateFurnaces(dt) {
  for (const [key, f] of furnaces) {
    const changed = MACHINES.furnaceTick(f, dt);   // 状态机在纯模块 machines.js(R25,可单测)
    if (changed) markDirtySave();   // 熔炉状态变化需触发自动保存
    if (changed && furnaceOpen === key) renderFurnacePanel();
  }
}

function clearFurnaces() {
  furnaces.clear();
  furnaceOpen = null;
  const panel = document.getElementById('furnace-panel');
  if (panel) panel.classList.add('hidden');
}

// ---- 熔炉面板 ----
function openFurnacePanel(x, y, z) {
  furnaceOpen = blockKey(x, y, z);
  const f = getFurnace(x, y, z);
  const panel = document.getElementById('furnace-panel');
  if (!panel) return;
  panel.classList.remove('hidden');
  if (document.pointerLockElement) document.exitPointerLock();
  const closeBtn = document.getElementById('furnace-close');
  if (closeBtn) closeBtn.onclick = closeFurnacePanel;
  // 放入循环目录(可冶炼物 + 燃料)
  const inList = ['iron_ore', 'sand', 'cobblestone', 'porkchop', 'beef'].map(id => ({ kind: SMELT[id].kind, id }));
  const fuelList = ['coal', 'wood', 'planks', 'stick'].map(id => ({ kind: 'item', id }));
  const bindCycle = (el, slot, list) => {
    el.onclick = () => {
      const cur = f[slot];
      let idx = cur ? list.findIndex(c => c.id === cur.id) : -1;
      idx = (idx + 1) % list.length;
      f[slot] = { kind: list[idx].kind, id: list[idx].id };
      renderFurnacePanel();
    };
    el.oncontextmenu = (e) => { e.preventDefault(); f[slot] = null; renderFurnacePanel(); };
  };
  bindCycle(document.getElementById('furnace-in'), 'input', inList);
  bindCycle(document.getElementById('furnace-fuel'), 'fuel', fuelList);
  const outCell = document.getElementById('furnace-out');
  if (outCell) {
    outCell.onclick = () => {
      if (!f.output) return;
      const want = f.output.count || 1;
      const got = pickupIntoInventory(f.output.kind, f.output.id, want);
      if (got >= want) f.output = null;
      else f.output.count = want - got;
      renderFurnacePanel();
    };
  }
  renderFurnacePanel();
}

// 交互:关闭面板后自动重新锁定指针(无缝回到游戏,不必再点一下画面)
function tryRelockPointer() {
  if (!renderer || document.pointerLockElement === renderer.domElement) return;
  if (inventoryOpen || tableOpen || furnaceOpen || chestOpen || tradeOpen || enchantOpen) return;   // 还有面板开着则不抢
  try {
    const p = renderer.domElement.requestPointerLock();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  } catch (e) { /* 忽略 */ }
}

function closeFurnacePanel() {
  furnaceOpen = null;
  const panel = document.getElementById('furnace-panel');
  if (panel) panel.classList.add('hidden');
  tryRelockPointer();
}

function renderFurnaceCell(el, it) {
  if (!el) return;
  const old = el.querySelector('canvas'); if (old) old.remove();
  const badge = el.querySelector('.cnt'); if (badge) badge.remove();
  if (it) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 48;
    drawItemIcon(it, cv);
    el.appendChild(cv);
    if ((it.count || 1) > 1) {
      const c = document.createElement('span');
      c.className = 'cnt';
      c.textContent = it.count;
      el.appendChild(c);
    }
  }
}

function renderFurnacePanel() {
  if (!furnaceOpen) return;
  const f = furnaces.get(furnaceOpen);
  if (!f) { closeFurnacePanel(); return; }
  renderFurnaceCell(document.getElementById('furnace-in'), f.input);
  renderFurnaceCell(document.getElementById('furnace-fuel'), f.fuel);
  renderFurnaceCell(document.getElementById('furnace-out'), f.output);
  const burn = document.getElementById('furnace-flame-fill');
  if (burn) burn.style.width = (f.burnT > 0 ? Math.max(0, f.burnT / f.burnMax) * 100 : 0) + '%';
  const cook = document.getElementById('furnace-cook-fill');
  if (cook) cook.style.width = (f.cookT / COOK_TIME) * 100 + '%';
}

// ============================================================
// 床(经典:夜间右键睡觉 → 跳到早晨 + 设置重生点;怪物太近睡不了)
// ============================================================
let spawnPoint = null;   // 床设置的重生点(null=回出生广场)

function trySleep(x, y, z) {
  if (sunHeight() > -0.05) { showToast('只能在夜晚睡觉'); return; }
  for (const m of mobs) {
    if (MOB_DEFS[m.type] && MOB_DEFS[m.type].hostile) {
      const dx = m.mesh.position.x - x, dz = m.mesh.position.z - z;
      if (dx * dx + dz * dz < 64) { showToast('附近有怪物,无法入睡'); return; }
    }
  }
  spawnPoint = { x: x + 0.5, y: y + 1.1, z: z + 0.5 };
  dayTime = 0.3;   // 直接跳到早晨
  playerHP = PLAYER_MAX_HP; updateHPBar();
  hungerState.hunger = Math.min(20, hungerState.hunger + 2); updateHungerBar();
  showToast('😴 睡了个好觉,重生点已设在此床');
  audio.play('place');
  unlockAchv('sleep');   // 成就:甜美的梦(R34)
  markDirtySave();
}

// ============================================================
// 箱子(经典:右键打开 27 格储物;点击取出,点空格放入当前手持整组)
// ============================================================
const chests = new Map();   // "x,y,z" -> {x, y, z, slots: Array(27)}
const CHEST_SLOTS = 27;
let chestOpen = null;

function getChest(x, y, z) {
  const key = blockKey(x, y, z);
  let c = chests.get(key);
  if (!c) { c = { x, y, z, slots: new Array(CHEST_SLOTS).fill(null) }; chests.set(key, c); }
  return c;
}

function openChestPanel(x, y, z) {
  chestOpen = blockKey(x, y, z);
  const c = getChest(x, y, z);
  // 地牢战利品(R37):首次打开的生成侧箱子按确定性 hash 填充(零存档 diff;
  // 打开后内容经 chestsData 持久化,同箱重开/读档后开箱内容一致)
  if (!c.slots.some(s => s) && isDungeonLootSpot(x, y, z)) fillDungeonLoot(c);
  const panel = document.getElementById('chest-panel');
  if (!panel) return;
  panel.classList.remove('hidden');
  if (document.pointerLockElement) document.exitPointerLock();
  const closeBtn = document.getElementById('chest-close');
  if (closeBtn) closeBtn.onclick = closeChestPanel;
  // 惰性生成 27 个储物格
  const gridEl = document.getElementById('chest-grid');
  if (gridEl && gridEl.children.length === 0) {
    for (let i = 0; i < CHEST_SLOTS; i++) {
      const cell = document.createElement('div');
      cell.className = 'inv-cell';
      gridEl.appendChild(cell);
    }
  }
  document.querySelectorAll('#chest-grid .inv-cell').forEach((cell, i) => {
    cell.onclick = () => {
      const it = c.slots[i];
      if (it) {
        // 有物:整组取出到快捷栏(工具带耐久)
        const want = it.count || 1;
        const got = pickupIntoInventory(it.kind || 'block', it.id, want, it.durability);
        if (got >= want) c.slots[i] = null;
        else it.count = want - got;
      } else {
        // 空:放入当前手持整组(保留耐久/数量)
        const held = hotbar[currentSlot];
        if (held) {
          c.slots[i] = held;
          hotbar[currentSlot] = null;
          if (held.kind === 'block') selectedType = null;
          buildHotbar(); updateHoldItem();
          markDirtySave();   // 箱子内容变化需触发自动保存
        }
      }
      renderChestPanel();
    };
    cell.oncontextmenu = (e) => { e.preventDefault(); c.slots[i] = null; renderChestPanel(); markDirtySave(); };
  });
  renderChestPanel();
}

function closeChestPanel() {
  chestOpen = null;
  const panel = document.getElementById('chest-panel');
  if (panel) panel.classList.add('hidden');
  tryRelockPointer();
}

function renderChestPanel() {
  if (!chestOpen) return;
  const c = chests.get(chestOpen);
  if (!c) { closeChestPanel(); return; }
  document.querySelectorAll('#chest-grid .inv-cell').forEach((cell, i) => {
    renderFurnaceCell(cell, c.slots[i]);   // 复用单元格渲染(图标+角标)
  });
}

function clearChests() {
  chests.clear();
  chestOpen = null;
  const panel = document.getElementById('chest-panel');
  if (panel) panel.classList.add('hidden');
}

// ============================================================
// 蛋糕(R40):放置后右键逐片进食(6 片,每片 +3 饥饿;经典 7 片简化),
// 吃完方块消失;剩余片数 cakesData 随存档
// ============================================================
function getCakeSlices(x, y, z) {
  const key = x + ',' + y + ',' + z;
  if (!cakes.has(key)) cakes.set(key, 6);
  return cakes.get(key);
}
function eatCakeSlice(x, y, z) {
  swingHoldItem();
  if (hungerState.hunger >= 20) { showToast('已经很饱了'); return; }
  const key = x + ',' + y + ',' + z;
  let n = getCakeSlices(x, y, z);
  hungerState.hunger = Math.min(20, hungerState.hunger + 3);
  updateHungerBar();
  n--;
  audio.play('eat');
  unlockAchv('cake');   // 成就:蛋糕时刻(R40)
  if (n <= 0) {
    cakes.delete(key);
    setBlock(x, y, z, null);
    spawnParticles(x + 0.5, y + 0.5, z + 0.5, 0xf8f0e8, 6);
    showToast('🍰 蛋糕吃完了');
  } else {
    cakes.set(key, n);
    showToast('🍰 吃了一片蛋糕(饥饿 +3,还剩 ' + n + ' 片)');
  }
  markDirtySave();
}

// ============================================================
// 地牢(R37):石室 + 刷怪笼 + 战利品箱(确定性生成侧结构,零存档 diff)
// 结构函数在 worldgen.js;此处是战利品填充与刷怪笼行为
// ============================================================
function isDungeonLootSpot(x, y, z) {
  const ck = chunkKey(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE));
  const arr = dungeonLootSpots.get(ck);
  return !!(arr && arr.some(e => e.x === x && e.y === y && e.z === z));
}
function fillDungeonLoot(c) {
  // 确定性:同种子同位置永远同内容(rand 由世界坐标+种子派生,不掺 Math.random)
  let i = 0;
  const rand = () => hash3(c.x * 31 + (i++), c.y * 7 + (i * 3), c.z * 13, worldSeed + 5150);
  c.slots = INVLIB.rollDungeonLoot(rand);
  markDirtySave();
  unlockAchv('dungeon_loot');   // 成就:宝箱猎人(R37)
  showToast('🗝️ 地牢战利品箱!');
}

// 刷怪笼行为(经典):玩家 16 格内显示笼内火粒;12 格内周期在笼旁空位生成
// 对应怪(每笼 8 格内同类 ≤3);笼被挖掉即失效(getBlock 校验)
let spawnerTimer = 0;
function updateSpawners(dt) {
  spawnerTimer -= dt;
  if (spawnerTimer > 0) return;
  spawnerTimer = 2;
  for (const arr of dungeonSpawns.values()) {
    for (const s of arr) {
      if (getBlock(s.x, s.y, s.z) !== 'spawner') continue;
      const dx = s.x + 0.5 - playerPos.x, dy = s.y + 0.5 - playerPos.y, dz = s.z + 0.5 - playerPos.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d > 16) continue;
      spawnParticles(s.x + 0.5, s.y + 1.1, s.z + 0.5, 0xff8830, 2);   // 笼内火粒
      if (d >= 12 || !settings.mobs || tutorial.active) continue;
      let near = 0;
      for (const m of mobs) {
        if (m.type !== s.mob) continue;
        const mdx = m.mesh.position.x - s.x - 0.5, mdz = m.mesh.position.z - s.z - 0.5;
        if (mdx * mdx + mdz * mdz < 64) near++;
      }
      if (near >= 3) continue;
      // 笼旁同层空位(支撑=石室地板 rel0,头部净空 1 格)
      const offs = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [1, 0, 1], [-1, 0, -1]];
      for (const [ox2, oy2, oz2] of offs) {
        const bx = s.x + ox2, by = s.y + oy2, bz = s.z + oz2;
        if (!getBlock(bx, by, bz) && !getBlock(bx, by + 1, bz) && isSolidAt(bx, by - 1, bz)) {
          spawnMob(bx + 0.5, by, bz + 0.5, s.mob);
          spawnParticles(bx + 0.5, by + 1, bz + 0.5, 0xff8830, 6);
          break;
        }
      }
    }
  }
}

// ============================================================
// 村民交易(R33):右键村民开面板,经典绿宝石经济
// 表与计数/消耗/判定在 inventory.js 纯函数层(单测覆盖)
// ============================================================
let tradeOpen = null;   // 正在交易的村民(mob 引用)

function openTradePanel(m) {
  tradeOpen = m;
  swingHoldItem();
  const panel = document.getElementById('trade-panel');
  if (!panel) return;
  panel.classList.remove('hidden');
  if (document.pointerLockElement) document.exitPointerLock();
  const closeBtn = document.getElementById('trade-close');
  if (closeBtn) closeBtn.onclick = closeTradePanel;
  const listEl = document.getElementById('trade-list');
  if (listEl && listEl.children.length === 0) {
    for (const tr of INVLIB.VILLAGER_TRADES) {
      const row = document.createElement('div');
      row.className = 'trade-row';
      const give = document.createElement('div');
      give.className = 'inv-cell trade-cell';
      const arrow = document.createElement('span');
      arrow.className = 'trade-arrow';
      arrow.textContent = '➜';
      const get = document.createElement('div');
      get.className = 'inv-cell trade-cell';
      row.appendChild(give); row.appendChild(arrow); row.appendChild(get);
      row.onclick = () => doTrade(tr);
      listEl.appendChild(row);
    }
  }
  renderTradePanel();
}

function closeTradePanel() {
  tradeOpen = null;
  const panel = document.getElementById('trade-panel');
  if (panel) panel.classList.add('hidden');
  tryRelockPointer();
}

function renderTradePanel() {
  if (!tradeOpen) return;
  if (!mobs.includes(tradeOpen)) { closeTradePanel(); return; }   // 村民已消失(死亡/重置)
  document.querySelectorAll('#trade-list .trade-row').forEach((row, i) => {
    const tr = INVLIB.VILLAGER_TRADES[i];
    renderFurnaceCell(row.children[0], { kind: 'item', id: tr.give.id, count: tr.give.n });
    renderFurnaceCell(row.children[2], { kind: 'item', id: tr.get.id, count: tr.get.n });
    row.classList.toggle('locked', !INVLIB.canTrade(hotbar, tr));
  });
}

function doTrade(tr) {
  if (!tradeOpen || !mobs.includes(tradeOpen)) { closeTradePanel(); return; }
  if (!INVLIB.canTrade(hotbar, tr)) { showToast('支付物不够:' + ITEM_TYPES[tr.give.id].name + ' ×' + tr.give.n); return; }
  INVLIB.consumeFromHotbar(hotbar, tr.give.id, tr.give.n);
  const got = pickupIntoInventory('item', tr.get.id, tr.get.n);
  if (got < tr.get.n) {   // 快捷栏满:余数掉在脚边不亏
    spawnDroppedItem(playerPos.x - 0.5, playerPos.y, playerPos.z - 0.5, tr.get.id, tr.get.n - got, 'item');
  }
  buildHotbar(); updateHoldItem(); renderTradePanel();
  showToast('🤝 换得 ' + ITEM_TYPES[tr.get.id].name + ' ×' + tr.get.n);
  audio.play('place');
  markDirtySave();
  unlockAchv('trade');   // 成就:交易大师(R34)
}

// ============================================================
// 成就/进度系统(R34):经典里程碑链 + 金色 toast + 暂停菜单面板
// 定义与解锁判定在 machines.js 纯函数层(单测覆盖);
// 埋点:拾取(本函数包装层)/合成(craftGiveResult)/击杀(hurtMob)/
// 钓鱼(catchFish)/繁殖(updateMobs)/睡觉(trySleep)/矿车(mountCart)/
// 附魔(附魔台成交)/交易(doTrade)/发现村庄(animate 节流探测)
// ============================================================
const achvUnlocked = new Set();
let achvVillageT = 0;   // 村庄邻近探测节流(秒)

// 拾取类里程碑(掉落拾起/熔炉收取/箱子取回/交易收入全走 pickupIntoInventory)
const PICKUP_ACHV = { wood: 'get_wood', cobblestone: 'stone_age', iron_ingot: 'iron_age', gem_diamond: 'diamonds' };
// 合成类里程碑(2×2 与合成台共用 craftGiveResult)
const CRAFT_ACHV = { crafting_table: 'workbench', furnace: 'furnace', bread: 'bake_bread' };

function unlockAchv(id) {
  const a = MACHINES.awardAchievement(achvUnlocked, id);
  if (!a) return;
  achvUnlocked.add(id);
  showAchvToast(a);
  audio.play('place');
  markDirtySave();
  updateAchvBtn();
}

function updateAchvBtn() {
  const btn = document.getElementById('btn-achv');
  if (btn) btn.textContent = '🏆 成就 (' + achvUnlocked.size + '/' + MACHINES.ACHIEVEMENTS.length + ')';
}

function showAchvToast(a) {
  const wrap = document.getElementById('achv-toasts');
  if (!wrap) return;
  const t = document.createElement('div');
  t.className = 'achv-toast';
  const icon = document.createElement('span');
  icon.className = 'achv-icon';
  icon.textContent = a.icon;
  const text = document.createElement('span');
  text.className = 'achv-text';
  const sub = document.createElement('b');
  sub.textContent = '进度已达成!';
  text.appendChild(sub);
  text.appendChild(document.createTextNode(a.name));
  t.appendChild(icon); t.appendChild(text);
  wrap.appendChild(t);
  setTimeout(() => t.classList.add('out'), 3600);
  setTimeout(() => t.remove(), 4300);
}

// 发现村庄(玩家 24 格内有小屋;每 1 秒探测一次,村格哈希早退开销极小)
function checkVillageAchv() {
  if (achvUnlocked.has('find_village')) return;
  const c0x = Math.floor(playerPos.x / 48), c0z = Math.floor(playerPos.z / 48);
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
    const hut = villageInCell(c0x + dx, c0z + dz, worldSeed);
    if (hut && Math.hypot(hut.cx - playerPos.x, hut.cz - playerPos.z) < 24) {
      unlockAchv('find_village');
      return;
    }
  }
}

// 成就面板(暂停菜单入口):全清单 + 解锁态 + 计数
function openAchvPanel() {
  const panel = document.getElementById('achv-panel');
  if (!panel) return;
  panel.classList.remove('hidden');
  const list = document.getElementById('achv-list');
  if (list && list.children.length === 0) {
    for (const a of MACHINES.ACHIEVEMENTS) {
      const row = document.createElement('div');
      row.className = 'achv-row';
      const icon = document.createElement('span');
      icon.className = 'achv-row-icon';
      const text = document.createElement('span');
      text.className = 'achv-row-text';
      const name = document.createElement('b');
      name.textContent = a.name;
      text.appendChild(name);
      text.appendChild(document.createTextNode(a.desc));
      row.appendChild(icon); row.appendChild(text);
      list.appendChild(row);
    }
  }
  document.querySelectorAll('#achv-list .achv-row').forEach((row, i) => {
    const a = MACHINES.ACHIEVEMENTS[i];
    row.classList.toggle('done', achvUnlocked.has(a.id));
    row.querySelector('.achv-row-icon').textContent = achvUnlocked.has(a.id) ? a.icon : '🔒';
  });
  const cnt = document.getElementById('achv-count');
  if (cnt) cnt.textContent = achvUnlocked.size + ' / ' + MACHINES.ACHIEVEMENTS.length;
}

function closeAchvPanel() {
  const panel = document.getElementById('achv-panel');
  if (panel) panel.classList.add('hidden');
}

// ============================================================
// 生命系统(无怪物,先建立基础设施:跌落/溺水伤害 + HUD + 存档)
// ============================================================
const PLAYER_MAX_HP = 20;   // 10 颗心,每心 2 点
const HEART_COUNT = 10;     // HUD 心数

// 渲染 HP 条(每颗心 = 2 HP;半心红、满心深红、空心黑)
function updateHPBar() {
  const bar = document.getElementById('hp-bar');
  if (!bar) return;
  if (bar.children.length !== HEART_COUNT) {
    bar.innerHTML = '';
    for (let i = 0; i < HEART_COUNT; i++) {
      const h = document.createElement('div');
      h.className = 'heart';
      h.textContent = '♥';
      bar.appendChild(h);
    }
  }
  const hp = Math.max(0, Math.min(PLAYER_MAX_HP, playerHP));
  for (let i = 0; i < HEART_COUNT; i++) {
    const seg = hp - i * 2;   // 该心覆盖的血量区间
    const el = bar.children[i];
    if (seg >= 2) el.className = 'heart full';
    else if (seg === 1) el.className = 'heart half';
    else el.className = 'heart empty';
  }
}

// 渲染护甲条(左侧 10 面盾,每盾 = 2 护甲点;无护甲时隐藏 —— 经典)
const ARMOR_ICON_COUNT = 10;
function updateArmorBar() {
  const bar = document.getElementById('armor-bar');
  if (!bar) return;
  const pts = Math.max(0, Math.min(2 * ARMOR_ICON_COUNT, totalArmorPoints()));
  bar.style.display = pts > 0 ? 'flex' : 'none';
  if (bar.children.length !== ARMOR_ICON_COUNT) {
    bar.innerHTML = '';
    for (let i = 0; i < ARMOR_ICON_COUNT; i++) {
      const a = document.createElement('div');
      a.className = 'armoricon';
      a.textContent = '🛡';
      bar.appendChild(a);
    }
  }
  for (let i = 0; i < ARMOR_ICON_COUNT; i++) {
    const seg = pts - i * 2;
    const el = bar.children[i];
    if (seg >= 2) el.className = 'armoricon full';
    else if (seg === 1) el.className = 'armoricon half';
    else el.className = 'armoricon empty';
  }
}

// 渲染饥饿条(右侧 10 鸡腿;满 = 彩色,空 = 灰暗)
function updateHungerBar() {
  const bar = document.getElementById('hunger-bar');
  if (!bar) return;
  if (bar.children.length !== HEART_COUNT) {
    bar.innerHTML = '';
    for (let i = 0; i < HEART_COUNT; i++) {
      const h = document.createElement('div');
      h.className = 'drumstick';
      h.textContent = '🍗';
      bar.appendChild(h);
    }
  }
  const hu = Math.max(0, Math.min(20, hungerState.hunger));
  for (let i = 0; i < HEART_COUNT; i++) {
    const seg = hu - i * 2;
    bar.children[i].className = 'drumstick' + (seg >= 2 ? ' full' : seg >= 1 ? ' half' : ' empty');
  }
}

// 红屏受击渐晕(伤害反馈):一个红色半透明遮罩,opacity 由 0.45 渐变到 0
let damageVignetteTimer = 0;
function showDamageVignette() {
  const el = document.getElementById('damage-vignette');
  if (!el) return;
  el.style.opacity = '0.45';
  damageVignetteTimer = 0.6;
}
function updateDamageVignette(dt) {
  if (damageVignetteTimer <= 0) return;
  damageVignetteTimer -= dt;
  const el = document.getElementById('damage-vignette');
  if (!el) return;
  if (damageVignetteTimer <= 0) { el.style.opacity = '0'; damageVignetteTimer = 0; }
  else { el.style.opacity = String(Math.max(0, damageVignetteTimer / 0.6) * 0.45); }
}

// ---- 护甲系统(经典):穿上/卸下/受击损耗 ----
function equipArmor(item) {
  const def = TOOL_TYPES[item.id];
  const prev = armorSlots[def.slot];
  armorSlots[def.slot] = { kind: 'tool', id: item.id, durability: item.durability };
  hotbar[currentSlot] = prev;   // 换下的旧件放回手持格(没有则空手)
  buildHotbar();
  selectSlot(currentSlot);      // 刷新 selectedType/手持模型
  updateArmorBar();
  markDirtySave();
  showToast(prev ? `装备:${def.name}(换下 ${TOOL_TYPES[prev.id].name})` : `装备:${def.name} · 护甲 ${totalArmorPoints()}/${INVLIB.ARMOR_MAX_POINTS}`);
}

function unequipArmor(slot) {
  const it = armorSlots[slot];
  if (!it) { showToast('该部位没有装备护甲'); return; }
  const got = INVLIB.pickupIntoInventory(hotbar, 'tool', it.id, 1, { durability: it.durability, defaultDurability: TOOL_TYPES[it.id].durability });
  if (got > 0) {
    armorSlots[slot] = null;
    updateArmorBar(); buildHotbar(); markDirtySave();
    showToast(`卸下:${TOOL_TYPES[it.id].name}`);
    buildInventoryPanel();
  } else showToast('快捷栏已满,腾出格子再卸下');
}

// 战斗受击:每件已装备护甲耐久 -1,耗尽即碎(经典;耐久附魔可免损耗,R28)
function wearArmorHit() {
  for (const s of ['head', 'chest', 'legs', 'feet']) {
    const it = armorSlots[s];
    if (!it) continue;
    if (!enchUnbreakingSkip(it)) {
      it.durability = Math.max(0, it.durability - 1);
      if (it.durability <= 0) { showToast(`${TOOL_TYPES[it.id].name} 坏了!`); armorSlots[s] = null; }
    }
  }
  updateArmorBar();
  markDirtySave();
}

// 格挡消耗举起的盾(耐久 -1,耗尽即碎)
function damageRaisedShield() {
  if (!raisedShield) return;
  const idx = hotbar.indexOf(raisedShield);
  if (idx < 0) return;
  raisedShield.durability = Math.max(0, raisedShield.durability - 1);
  if (raisedShield.durability <= 0) {
    showToast(`${TOOL_TYPES[raisedShield.id].name} 坏了!`);
    hotbar[idx] = null;
    buildHotbar();
  } else refreshHotbarSlot(idx);
  markDirtySave();
}

// 扣血(统一入口:扣血 + 红屏渐晕 + 音效;若 HP<=0 触发死亡)
// kind:'combat'=近战/箭 · 'explosion'=爆炸 · 'fall'/'drown'/'starve'=环境伤
// 战斗伤先过盾格挡(举盾中:combat 全格挡、explosion 减半),再过护甲减伤
// (护甲每点 4%、上限 80%;摔落/溺水/饥饿不吃护甲 —— 经典)
function damagePlayer(amount, kind) {
  if (amount <= 0) return;
  let dmg = amount;
  if (kind !== 'fall' && kind !== 'drown' && kind !== 'starve') {
    // 格挡:仅当"举盾时刻手持的盾"仍在当前格时生效(切槽后盾已放下,不永久格挡)
    if (shieldActive > 0 && hotbar[currentSlot] === raisedShield) {
      damageRaisedShield();
      if (kind !== 'explosion') { audio.play('place'); showToast('🛡 格挡!'); return; }
      dmg = dmg * 0.5;
    }
    const pts = totalArmorPoints();
    if (pts > 0) { dmg = INVLIB.armorReduce(dmg, pts); wearArmorHit(); }
  }
  playerHP = Math.max(0, playerHP - Math.round(dmg));
  showDamageVignette();
  audio.play('hurt');
  updateHPBar();
  markDirtySave();
  if (playerHP <= 0) respawnPlayer();
}

// 死亡/重生:优先床重生点,否则回出生广场中心,满血;快捷栏(生存物资)保留
let deathOverlayTimer = 0;
// 死亡掉落(经典):快捷栏全部物品掉落在死亡地点,重生后可回收(工具保留耐久)
function dropInventoryOnDeath() {
  for (let i = 0; i < HOTBAR_SIZE; i++) {
    const it = hotbar[i];
    if (!it) continue;
    // 轻微散布在死亡点周围,便于拾取
    const dx = (Math.random() - 0.5) * 1.6;
    const dz = (Math.random() - 0.5) * 1.6;
    spawnDroppedItem(playerPos.x + dx - 0.5, playerPos.y - 0.9, playerPos.z + dz - 0.5,
      it.id, it.kind === 'tool' ? 1 : (it.count || 1), it.kind, it.durability);
    hotbar[i] = null;
  }
  // 已装备护甲同样掉落(经典死亡掉落)
  for (const s of ['head', 'chest', 'legs', 'feet']) {
    const it = armorSlots[s];
    if (!it) continue;
    const adx = (Math.random() - 0.5) * 1.6;
    const adz = (Math.random() - 0.5) * 1.6;
    spawnDroppedItem(playerPos.x + adx - 0.5, playerPos.y - 0.9, playerPos.z + adz - 0.5, it.id, 1, 'tool', it.durability);
    armorSlots[s] = null;
  }
  updateArmorBar();
  selectedType = null;
  buildHotbar();
  updateHoldItem();
}

function respawnPlayer() {
  dropInventoryOnDeath();
  isFlying = false;   // 死亡退出飞行(否则生存模式可借死亡重生飞天)
  if (spawnPoint) playerPos.set(spawnPoint.x, spawnPoint.y, spawnPoint.z);
  else {
    const plazaH = SEA_LEVEL + 6;
    playerPos.set(0.5, plazaH + 1 + PLAYER_HEIGHT * 0.5, 0.5);
  }
  velocity.set(0, 0, 0);
  playerHP = PLAYER_MAX_HP;
  breathTimer = 0;
  hungerState.hunger = 20; hungerState.drain = 0; hungerState.regenT = 0; hungerState.starveT = 0;   // 经典:死亡重置饥饿
  xpState.level = Math.floor(xpState.level / 2);   // 经典:死亡损失大部分经验(R28 简化折半)
  xpState.points = Math.floor(xpState.points / 2);
  updateXPBar();
  updateHPBar(); updateHungerBar();
  // 显示"你死了"遮罩,2 秒后淡出
  const el = document.getElementById('death-overlay');
  if (el) { el.style.opacity = '1'; el.style.display = 'flex'; }
  deathOverlayTimer = 2.0;
  showToast('你死了');
  markDirtySave();
}
function updateDeathOverlay(dt) {
  if (deathOverlayTimer <= 0) return;
  deathOverlayTimer -= dt;
  const el = document.getElementById('death-overlay');
  if (!el) return;
  if (deathOverlayTimer <= 0) { el.style.display = 'none'; deathOverlayTimer = 0; }
  else if (deathOverlayTimer < 0.6) { el.style.opacity = String(deathOverlayTimer / 0.6); }
}

// 箭矢朝向更新用的临时向量(避免每箭每帧 clone 分配)
const _arrowLook = new THREE.Vector3();
function updateArrows(dt) {
  for (let i = arrows.length - 1; i >= 0; i--) {
    const a = arrows[i];
    a.userData.vel.y -= 9.8 * dt;
    a.position.addScaledVector(a.userData.vel, dt);
    _arrowLook.copy(a.position).add(a.userData.vel);
    a.lookAt(_arrowLook);
    a.userData.life -= dt;
    const bx = Math.floor(a.position.x), by = Math.floor(a.position.y), bz = Math.floor(a.position.z);
    // 命中生物:箭矢中心进入生物身体包围盒 → 伤害 + 顺飞行方向击退 + 箭消失
    // (玩家之箭打生物;怪物之箭只打玩家,避免生成瞬间命中射手自己)
    let hitMob = null;
    if (a.userData.fromPlayer) {
      for (const m of mobs) {
        const p = m.mesh.position;
        if (Math.abs(a.position.x - p.x) < 0.55 && Math.abs(a.position.y - p.y) < 0.75 && Math.abs(a.position.z - p.z) < 0.55) {
          hitMob = m;
          break;
        }
      }
    }
    // 命中玩家(骷髅之箭):身体包围盒 → 伤害 + 移除(玩家自己的箭豁免)
    if (!a.userData.fromPlayer
        && Math.abs(a.position.x - playerPos.x) < 0.5 && Math.abs(a.position.y - playerPos.y) < 0.9 && Math.abs(a.position.z - playerPos.z) < 0.5) {
      damagePlayer(2, 'combat');   // 骷髅之箭(经典普通难度均值)
      scene.remove(a);
      arrows.splice(i, 1);
      continue;
    }
    if (hitMob) {
      const vl = Math.max(0.001, Math.hypot(a.userData.vel.x, a.userData.vel.z));
      hurtMob(hitMob, 5 + bowPowerBonus(), a.userData.vel.x / vl, a.userData.vel.z / vl);   // 力量附魔 +1/级(R28)
      scene.remove(a);
      arrows.splice(i, 1);
      continue;
    }
    if (isSolidAt(bx, by, bz) || a.userData.life <= 0 || a.position.y < -10) {
      scene.remove(a); arrows.splice(i, 1);
    }
  }
}

function swingArm() {
  if (!playerModel) return;
  playerModel.userData.swingT = 0.001;
}

// 放置方块时检查是否与玩家重叠
// 设计:只在方块会"困住"玩家身体核心时阻止(玩家身体中心在方块内),
// 允许紧贴放置(Minecraft 行为),避免"挡住自己"的误判让玩家无法在身边建造
function overlapsPlayer(bx, by, bz) {
  const px = playerPos.x, py = playerPos.y, pz = playerPos.z;
  // 用比碰撞盒略小的核心区域判断(半宽 0.2,半高 0.6)
  const r = 0.2;
  const minX = px - r, maxX = px + r;
  const minZ = pz - r, maxZ = pz + r;
  const minY = py - 0.6, maxY = py + 0.6;
  return bx + 1 > minX && bx < maxX && by + 1 > minY && by < maxY && bz + 1 > minZ && bz < maxZ;
}

