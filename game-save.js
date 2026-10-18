// ============================================================
// 第十九部分:存档/读档(IndexedDB)
// ============================================================

// ============================================================
// 设置持久化(localStorage)
// ============================================================
const SETTINGS_KEY = 'myword_settings';
let settings = { volume: 0.35, soundEnabled: true, fov: 75, renderDist: 5, dayNightEnabled: true, dayCycleSpeed: 480, mobs: true, hostiles: true, weather: true, fpHeld: false, mode: 'survival', fontScale: 1, reduceMotion: false, keymap: null };
function loadSettings() {
  try {
    const s = localStorage.getItem(SETTINGS_KEY);
    if (s) { const parsed = JSON.parse(s); Object.assign(settings, parsed); }
    settings.renderDist = Math.max(1, Math.min(10, settings.renderDist|0 || 5));
    let _vol = Number(settings.volume); settings.volume = Math.max(0, Math.min(1, Number.isFinite(_vol) ? _vol : 0.35));
    settings.dayCycleSpeed = [240, 480, 900].includes(settings.dayCycleSpeed) ? settings.dayCycleSpeed : 480;
    settings.fontScale = [1, 1.15, 1.3].includes(settings.fontScale) ? settings.fontScale : 1;
    settings.fov = [65, 75, 85, 100].includes(settings.fov) ? settings.fov : 75;
    if (settings.keymap && typeof settings.keymap === 'object') Object.assign(keymap, settings.keymap);
  } catch (e) { console.debug('设置读取失败(用默认值):', e); }
  gameMode = settings.mode === 'creative' ? 'creative' : 'survival';
  // 应用设置
  if (audio.masterGain) audio.masterGain.gain.value = settings.soundEnabled ? settings.volume : 0;
  audio.enabled = settings.soundEnabled;
  audio.volume = settings.volume;
  RENDER_DISTANCE = settings.renderDist;
  FOG_FAR = (RENDER_DISTANCE * CHUNK_SIZE) + 8;
  // 刷新暂停菜单按钮标签(与持久化设置同步)
  const bs = document.getElementById('btn-sound');
  if (bs) bs.textContent = '音效:' + (settings.soundEnabled ? '开' : '关');
  const bm = document.getElementById('btn-mobs');
  if (bm) bm.textContent = '动物:' + (settings.mobs ? '开' : '关');
  const bh = document.getElementById('btn-hostiles');
  if (bh) bh.textContent = '怪物:' + (settings.hostiles ? '开' : '关');
  const bw = document.getElementById('btn-weather');
  if (bw) bw.textContent = '天气:' + (settings.weather ? '开' : '关');
}
function saveSettings() {
  settings.keymap = Object.assign({}, keymap);
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) { console.debug('设置写入失败(忽略):', e); }
}

// ============================================================
// 存档系统(多存档,IndexedDB)
// ============================================================
const DB_NAME = 'myword_save';
const DB_VERSION = 2;            // v2:多存档(自增 id keyPath)
const STORE = 'saves';           // 存档存储(v1 是 'world',v2 升级)
let dbReady = null;
let currentSaveId = null;        // 当前游玩的存档 id(null=未存档/新游戏)
let saveDirty = false;            // 有未保存改动
let lastAutosaveTime = 0;         // 上次自动保存时间
let autosaveTimer = null;         // 自动保存防抖定时器

function openDB() {
  if (dbReady) return dbReady;
  dbReady = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined' || !indexedDB) { reject(new Error('IndexedDB unavailable')); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const d = e.target.result;
      // v2:新建自增 id 的 saves store
      if (!d.objectStoreNames.contains(STORE)) {
        const os = d.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        os.createIndex('timestamp', 'timestamp', { unique: false });
      }
      // 删除旧的 v1 'world' store(如果有)
      if (d.objectStoreNames.contains('world')) d.deleteObjectStore('world');
    };
    req.onblocked = () => {
      console.warn('IndexedDB 升级被阻塞,请关闭其他标签页');
      dbReady = null;  // 重置缓存,允许重试(和 onerror 一致)
      reject(new Error('DB blocked'));
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { dbReady = null; reject(req.error); };  // 失败时重置缓存,允许重试
  });
  return dbReady;
}

// 保存当前游戏到新存档槽(可命名),返回存档 id
async function saveSlot(name) {
  try {
    const db = await openDB();
    if (!db) return null;
    const rec = buildSaveRecord();
    rec.name = name || ('存档 ' + new Date().toLocaleString('zh-CN'));
    const tx = db.transaction(STORE, 'readwrite');
    return new Promise((resolve) => {
      const r = tx.objectStore(STORE).add(rec);
      r.onsuccess = () => { currentSaveId = r.result; resolve(r.result); };
      r.onerror = () => resolve(null);
    });
  } catch (e) { return null; }
}

// 构建存档记录(字段单一来源:saveSlot 新建与 overwriteSave 覆盖共用,防止字段漂移)
// 固化瞬态实体为方块(存档前调用):点燃的 TNT 回 TNT 块、下落沙砾回原块
function solidifyTransientEntities() {
  for (let i = tntEnts.length - 1; i >= 0; i--) {
    const e = tntEnts[i];
    const bx = Math.floor(e.mesh.position.x), by = Math.floor(e.mesh.position.y), bz = Math.floor(e.mesh.position.z);
    scene.remove(e.mesh);
    tntEnts.splice(i, 1);
    if (!getBlock(bx, by, bz)) setBlock(bx, by, bz, 'tnt');
    else spawnDroppedItem(bx, by, bz, 'tnt', 1, 'block');   // 落点被占则掉落物品
  }
  for (let i = fallingBlocks.length - 1; i >= 0; i--) {
    const f = fallingBlocks[i];
    const bx = Math.floor(f.mesh.position.x), by = Math.floor(f.mesh.position.y), bz = Math.floor(f.mesh.position.z);
    scene.remove(f.mesh);
    fallingBlocks.splice(i, 1);
    if (!getBlock(bx, by, bz)) setBlock(bx, by, bz, f.type);
    else spawnDroppedItem(bx, by, bz, f.type, 1, 'block');
  }
}

function buildSaveRecord() {
  // 存档前固化瞬态实体:点燃的 TNT / 下落中的沙砾还原为方块
  // (否则 setBlock(null) 已写进 modifications,读档后实体凭空消失 = 物品损失)
  solidifyTransientEntities();
  // 乘坐设施时存档:存地面出口,避免读档后悬在摩天轮/木马座位上空
  const savePos = ridingRide && ridingRide.ride && ridingRide.ride.data.exit
    ? { x: ridingRide.ride.data.exit.x, y: SEA_LEVEL + 7.9, z: ridingRide.ride.data.exit.z }
    : { x: playerPos.x, y: playerPos.y, z: playerPos.z };
  return {
    seed: worldSeed,
    dayTime,   // 世界时间随档走(0..1,0=午夜):防跨存档时间串档、床跳夜成果入档
    playerPos: savePos,
    yaw, pitch, cameraMode, isFlying,
    playerHP, breathTimer: 0, playerHunger: hungerState.hunger,
    hotbar, currentSlot,
    modifications: Array.from(modifications.entries()).filter(([k, v]) => !(worldPlazaBuilt && plazaBlocks.get(k) === v)),   // R25 瘦身:未变的广场 diff 不落盘(读档重建)
    plazaBuilt: worldPlazaBuilt,   // R25:读档据此先重建广场已知 diff 再覆盖用户 diff
    cropTimersData: Array.from(cropTimers.entries()),
    furnacesData: Array.from(furnaces.values()).map(f => ({ x: f.x, y: f.y, z: f.z, input: f.input, fuel: f.fuel, output: f.output, burnT: f.burnT, burnMax: f.burnMax, cookT: f.cookT })),
    chestsData: Array.from(chests.values()).map(c => ({ x: c.x, y: c.y, z: c.z, slots: c.slots })),
    spawnPoint,
    armorSlotsData: ['head', 'chest', 'legs', 'feet'].map(s => armorSlots[s] ? [s, { id: armorSlots[s].id, durability: armorSlots[s].durability }] : [s, null]),
    minecartsData: minecarts.map(c => ({ x: c.cx, y: Math.round(c.y), z: c.cz })),
    mobsData: mobs.map(mm => ({ t: mm.type, x: Math.round(mm.mesh.position.x * 100) / 100, y: Math.round(mm.mesh.position.y * 100) / 100, z: Math.round(mm.mesh.position.z * 100) / 100, hp: mm.hp, baby: !!mm.baby, s: mm.type === 'slime' ? mm.slimeSize : undefined, pc: mm.playerCreated ? 1 : undefined })),
    xpData: { level: xpState.level, points: xpState.points },
    mode: gameMode,
    dayCount,
    statsData: { playTime: stats.playTime, blocksMined: stats.blocksMined, blocksPlaced: stats.blocksPlaced, distance: stats.distance, deaths: stats.deaths, kills: stats.kills, fish: stats.fish, trades: stats.trades },
    goalClaimedData: Array.from(goalClaimed),
    discoveredData: Array.from(discovered),
    beaconsData: Array.from(beacons),
    vaultsData: Array.from(vaults),
    achvData: Array.from(achvUnlocked),   // 成就解锁清单(R34)
    cakesData: Array.from(cakes.entries()),   // 蛋糕剩余片数(R40)
    pistonsData: Array.from(pistons.entries()),   // 活塞朝向(R42)
    doorsData: Array.from(doors.entries()).map(function(e){return [e[0], {x:e[1].x,y:e[1].y,z:e[1].z,type:e[1].type,open:e[1].open,facing:e[1].facing}];}),
    timestamp: Date.now(),
  };
}

async function overwriteSave(id) {
  try {
    const db = await openDB();
    if (!db) return false;
    const rec = buildSaveRecord();
    rec.id = id;
    rec.name = ('存档 ' + new Date().toLocaleString('zh-CN'));
    // 保留原名称:先读旧记录的 name
    const tx = db.transaction(STORE, 'readwrite');
    return new Promise((resolve) => {
      const gr = tx.objectStore(STORE).get(id);
      gr.onsuccess = () => {
        if (gr.result) rec.name = gr.result.name;
        const pr = tx.objectStore(STORE).put(rec);
        pr.onsuccess = () => resolve(true);
        pr.onerror = () => resolve(false);
      };
      gr.onerror = () => resolve(false);
    });
  } catch (e) { return false; }
}

// 列出所有存档(按时间倒序)
async function listSaves() {
  try {
    const db = await openDB();
    if (!db) return [];
    const tx = db.transaction(STORE, 'readonly');
    return new Promise((resolve) => {
      const r = tx.objectStore(STORE).getAll();
      r.onsuccess = () => {
        const saves = r.result || [];
        saves.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        resolve(saves);
      };
      r.onerror = () => resolve([]);
    });
  } catch (e) { return []; }
}

// 读取指定存档
async function loadSlot(id) {
  try {
    const db = await openDB();
    if (!db) return false;
    const tx = db.transaction(STORE, 'readonly');
    return new Promise((resolve) => {
      const r = tx.objectStore(STORE).get(id);
      r.onsuccess = () => {
        if (!r.result) { resolve(false); return; }
        currentSaveId = id;
        applySave(r.result);
        resolve(true);
      };
      r.onerror = () => resolve(false);
    });
  } catch (e) { return false; }
}

// 兼容旧接口:读取最新存档
async function loadGame() {
  const saves = await listSaves();
  if (saves.length === 0) return false;
  return loadSlot(saves[0].id);
}

// 删除存档
async function deleteSave(id) {
  try {
    const db = await openDB();
    if (!db) return false;
    const tx = db.transaction(STORE, 'readwrite');
    return new Promise((resolve) => {
      const r = tx.objectStore(STORE).delete(id);
      r.onsuccess = () => { if (currentSaveId === id) currentSaveId = null; resolve(true); };
      r.onerror = () => resolve(false);
    });
  } catch (e) { return false; }
}

// 是否有存档
async function hasSave() {
  const saves = await listSaves();
  return saves.length > 0;
}

// 自动保存(覆盖当前存档,若无则不存避免无意义堆积)
function markDirtySave() { saveDirty = true; debouncedAutosave(); }
function debouncedAutosave() {
  if (autosaveTimer) clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => autosave(true), 3000);
}
function scheduleAutosave() {
  const now = performance.now();
  if (saveDirty && now - lastAutosaveTime > 30000) autosave(true);
}
function autosave(force) {
  if (!saveDirty && !force) return;
  if (currentSaveId === null) { saveDirty = false; return; } // 避免无命名存档堆积
  saveDirty = false;
  lastAutosaveTime = performance.now();
  overwriteSave(currentSaveId);
}

