// ============================================================
// 第四部分:区块系统(核心)
// ============================================================
const CHUNK_SIZE = 16;
const WORLD_HEIGHT = 48;        // 世界最大高度(方块层数)
let RENDER_DISTANCE = 5;  // let:可被设置修改      // 加载半径(chunk 数,不含中心)
const FOG_NEAR = 30;
let FOG_FAR = (RENDER_DISTANCE * CHUNK_SIZE) + 8;  // let:随 RENDER_DISTANCE 设置变化
const SEA_LEVEL = 14;           // 海平面
const PLAZA_RADIUS = 46;   // 广场外再留 8 格平坦草甸,避免门外直接是地形断崖        // R55:出生广场半径(与 buildSpawnPlaza 一致)
const PLAZA_HEIGHT = SEA_LEVEL + 6;

// 区块存储: key "cx,cz" -> chunk
const chunks = new Map();
// 玩家改动 diff: key "x,y,z" -> type|null(覆盖生成结果)
const modifications = new Map();
// 玩家改动按区块分桶: chunkKey -> Map<chunkIdx, type|null>
// 性能:generateChunkData 应用 diff 时只遍历本区块桶,不再扫全量 16×48×16 个字符串 key
const modsByChunk = new Map();
// 跨区块种树的待写队列: chunkKey -> Map<chunkIdx, id>
// 树叶可伸入尚未生成的区块;区块创建时应用队列(树只在自己区块创建时种一次,不再重复扫描)
const pendingBlocks = new Map();
// 出生广场已知 diff(R25 存档瘦身):key -> 广场放置的方块类型。
// 存档时值未变的广场条目不落盘(省 ~1MB/档);读档先重建广场再覆盖用户 diff
const plazaBlocks = new Map();
let worldPlazaBuilt = false;
// 待重建 mesh 的区块集合(替代每帧扫描 chunks + 分配数组 + 排序)
const dirtyChunks = new Set();
// 村庄小屋的生成侧火把(R31):chunkKey -> [[x,y,z],...];随区块生成登记,
// 不进 modifications(零存档成本),作为光照引擎的额外光源
const villageTorches = new Map();
// 地牢登记表(R37,生成侧写入时登记;chunkKey → 数组):
// dungeonSpawns 刷怪笼 {x,y,z,mob} / dungeonLootSpots 战利品箱 {x,y,z}
const dungeonSpawns = new Map();
const dungeonLootSpots = new Map();
// R55:核心地牢的宝库/远古铁傀儡登记(生成侧,零存档 diff)
const vaultSpots = new Map();          // chunkKey -> [{x,y,z}]
const ancientGolemSpots = new Map();   // chunkKey -> [{x,y,z}]
// 红石元件登记表(R38):chunkKey → Map("x,y,z" → 方块 id);
// 放置/破坏/拉杆切换走 setBlock 实时更新,区块(重)装载时从 diff 桶扫描登记
const REDSTONE_FAMILY = { redstone: 1, redstone_torch: 1, lever_off: 1, lever_on: 1, repeater_off: 1, repeater_on: 1, piston: 1, piston_ext: 1 };   // R42 +中继器/活塞(登记/采样破坏共用)
const pistons = new Map();        // 活塞朝向(R42):key "x,y,z" → facing(0:+x 1:-x 2:+z 3:-z)
const repeaterTimers = new Map(); // 中继器导通延迟(R42):key → 导通时刻(Date.now)
const CANE_ID = 'sugarcane';   // 非固体采样破坏同样覆盖甘蔗(R40)
const redstoneParts = new Map();
function registerRedstone(x, y, z, id) {
  const ck = chunkKey(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE));
  let m = redstoneParts.get(ck);
  if (!m) { m = new Map(); redstoneParts.set(ck, m); }
  m.set(x + ',' + y + ',' + z, id);
}
function unregisterRedstone(x, y, z) {
  const ck = chunkKey(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE));
  const m = redstoneParts.get(ck);
  if (m) m.delete(x + ',' + y + ',' + z);
}

function chunkKey(cx, cz) { return `${cx},${cz}`; }
function blockKey(x, y, z) { return `${x},${y},${z}`; }

// 记录一条玩家改动(全局 diff 表 + 所在区块桶,两处同步)
function addModification(x, y, z, type) {
  modifications.set(blockKey(x, y, z), type);
  const bcx = Math.floor(x / CHUNK_SIZE), bcz = Math.floor(z / CHUNK_SIZE);
  const ck = chunkKey(bcx, bcz);
  let bucket = modsByChunk.get(ck);
  if (!bucket) { bucket = new Map(); modsByChunk.set(ck, bucket); }
  bucket.set(chunkIdx(x - bcx * CHUNK_SIZE, y, z - bcz * CHUNK_SIZE), type);
}

// 噪声/生物群系/地形函数已提取到 worldgen.js(由 <script> 全局加载,此处不再定义)


// 生成一个区块的数据(16×WORLD_HEIGHT×16)
function generateChunkData(cx, cz) {
  const data = new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);
  const ox = cx * CHUNK_SIZE, oz = cz * CHUNK_SIZE;

  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      const wx = ox + lx, wz = oz + lz;
      const mtn = fbm2D(wx * 0.008, wz * 0.008, worldSeed + 555, 4);  // 山地强度(算一次,biome/height 共用)
      const biome = biomeAt(wx, wz, worldSeed, mtn);
      const rawHeight = heightAt(wx, wz, worldSeed, mtn);
      // R55:广场范围内削平山地 —— 否则山地会高过广场,玩家出生在石壳里,
      // 且上方天然方块不属于 modifications,读档也不会被修正
      const height = (Math.abs(wx) <= PLAZA_RADIUS && Math.abs(wz) <= PLAZA_RADIUS)
        ? Math.min(rawHeight, PLAZA_HEIGHT) : rawHeight;
      const b = BIOMES[biome];
      const yTop = Math.max(height, SEA_LEVEL);

      for (let y = 0; y <= yTop; y++) {
        let type = null;
        if (y > height) {
          // 海平面以下填水
          if (y <= SEA_LEVEL) type = 'water';
        } else if (y === height) {
          type = b.top;
          // 海岸:海平面附近表层变沙
          if (height <= SEA_LEVEL && (b.top === 'grass')) type = 'sand';
        } else if (y >= height - 3) {
          type = b.sub;
        } else {
          type = 'stone';
        }
        if (type) data[chunkIdx(lx, y, lz)] = BLOCK_ID[type];
      }

      // 植被:树由 growTreesInChunk 在区块数据就绪后跨区块种植(generateChunkData 仅生成地形)
      // 这样树叶可跨越区块边界,不会出现半棵树

      // 甘蔗(R40,经典):海岸线自然生成 —— 草/沙岸边 + 邻列是水面,
      // hash ~10% 一株,1-3 节;生成侧写入(零存档 diff)
      if (hash2(wx, wz, worldSeed + 811) < 0.10 && height + 1 <= SEA_LEVEL && height + 1 < WORLD_HEIGHT
          && (b.top === 'grass' || b.top === 'sand')) {
        let waterAdj = false;
        for (const [nx, nz] of [[wx + 1, wz], [wx - 1, wz], [wx, wz + 1], [wx, wz - 1]]) {
          const mtn2 = fbm2D(nx * 0.008, nz * 0.008, worldSeed + 555, 4);
          const nh = heightAt(nx, nz, worldSeed, mtn2);
          if (nh < height + 1) { waterAdj = true; break; }   // 邻列此层没入水下
        }
        if (waterAdj) {
          const caneH = 1 + Math.floor(hash2(wx, wz, worldSeed + 812) * 3);   // 1-3 节
          for (let k = 1; k <= caneH && height + k < WORLD_HEIGHT; k++) data[chunkIdx(lx, height + k, lz)] = BLOCK_ID.sugarcane;
        }
      }

      // 矿石(确定性):煤 1.2% / 铁 0.7% / 金 0.4%(y<20) /
      // 钻石 0.3%(y<12)/ 红石 0.4%(y<14)
      for (let y = 1; y < height - 3; y++) {
        const idx2 = chunkIdx(lx, y, lz);
        if (data[idx2] !== BLOCK_ID.stone) continue;
        const r = hash3(wx, y, wz, worldSeed + 4242);
        if (r < 0.012) data[idx2] = BLOCK_ID.coal_ore;
        else if (r < 0.019) data[idx2] = BLOCK_ID.iron_ore;
        else if (r < 0.023 && y < 20) data[idx2] = BLOCK_ID.gold_ore;
        else if (r < 0.026 && y < 12) data[idx2] = BLOCK_ID.diamond_ore;
        else if (r < 0.030 && y < 14) data[idx2] = BLOCK_ID.redstone_ore;   // 红石矿(R38,深层)
      }

      // 洞穴挖空(R24,经典):3D 噪声隧道 + 深处空腔。保护:
      //  - 出生广场 |x|,|z| ≤ 30 一律不挖(重生区地下完整)
      //  - 陆地保留地表 2 格壳(防树悬空/顶板塌口),海底保留 3 格壳(防水漏进洞)
      if (wx < -30 || wx > 30 || wz < -30 || wz > 30) {
        const carveTop = (height < SEA_LEVEL) ? height - 3 : height - 2;
        for (let y = 2; y <= Math.min(carveTop, 38); y++) {
          const idx2 = chunkIdx(lx, y, lz);
          const cid = data[idx2];
          if (cid === 0 || cid === WATER_ID) continue;
          if (caveAt(wx, y, wz, worldSeed)) data[idx2] = 0;
        }
      }
    }
  }

  // 地牢(R37/R55):确定性生成侧结构(石室+刷怪笼+战利品箱),先于村庄写入;
  // 覆盖洞穴空气保证石室完整;玩家 diff 在其后应用(挖掉的笼自然为 null)
  {
    const dc0 = Math.floor(ox / 64) - 1, dc1 = Math.floor((ox + 15) / 64) + 1;
    const dn0 = Math.floor(oz / 64) - 1, dn1 = Math.floor((oz + 15) / 64) + 1;
    const ck = chunkKey(cx, cz);
    for (let dcx = dc0; dcx <= dc1; dcx++) for (let dcz = dn0; dcz <= dn1; dcz++) {
      const dg = dungeonInCell(dcx, dcz, worldSeed);
      if (!dg) continue;
      const half = dg.size >> 1;
      const gx0 = dg.cx - half, gz0 = dg.cz - half;
      for (let lx = 0; lx < dg.size; lx++) for (let lz = 0; lz < dg.size; lz++) {
        const wx2 = gx0 + lx, wz2 = gz0 + lz;
        const bx = wx2 - ox, bz = wz2 - oz;
        if (bx < 0 || bx > 15 || bz < 0 || bz > 15) continue;
        for (let rel = 0; rel <= 4; rel++) {
          const y = dg.floor + rel;
          if (y < 1 || y >= WORLD_HEIGHT) continue;
          const t = dungeonBlockAt(lx, lz, rel, dg, worldSeed);
          const idx3 = chunkIdx(bx, y, bz);
          if (t) {
            data[idx3] = BLOCK_ID[t];
            if (t === 'spawner') {
              let arr = dungeonSpawns.get(ck);
              if (!arr) { arr = []; dungeonSpawns.set(ck, arr); }
              if (!arr.some(e => e.x === wx2 && e.y === y && e.z === wz2)) arr.push({ x: wx2, y, z: wz2, mob: dg.mob });
            }
            if (t === 'chest') {
              let arr = dungeonLootSpots.get(ck);
              if (!arr) { arr = []; dungeonLootSpots.set(ck, arr); }
              if (!arr.some(e => e.x === wx2 && e.y === y && e.z === wz2)) arr.push({ x: wx2, y, z: wz2, tier: dg.tier });
            }
            if (t === 'vault') {
              let arr = vaultSpots.get(ck);
              if (!arr) { arr = []; vaultSpots.set(ck, arr); }
              if (!arr.some(e => e.x === wx2 && e.y === y && e.z === wz2)) arr.push({ x: wx2, y, z: wz2 });
            }
          } else {
            data[idx3] = 0;   // 室内空气
          }
        }
      }
      // 核心档:第一室中央登记远古铁傀儡(首次靠近时唤醒)
      if (dg.guard) {
        const r0 = dg.rooms[0];
        const gx = gx0 + Math.floor((r0.x0 + r0.x1) / 2);
        const gz = gz0 + Math.floor((r0.z0 + r0.z1) / 2);
        let arr = ancientGolemSpots.get(ck);
        if (!arr) { arr = []; ancientGolemSpots.set(ck, arr); }
        if (!arr.some(e => e.x === gx && e.z === gz)) arr.push({ x: gx, y: dg.floor + 1, z: gz });
      }
    }
  }

  // 村庄小屋(R31):确定性生成侧结构(不进 modifications,零存档成本);
  // 检查与本区块相交的村格(±1 格余量),逐格写入小屋与门前农田
  {
    const vc0 = Math.floor(ox / 48) - 1, vc1 = Math.floor((ox + 15) / 48) + 1;
    const wz0 = Math.floor(oz / 48) - 1, wz1 = Math.floor((oz + 15) / 48) + 1;
    for (let vcx = vc0; vcx <= vc1; vcx++) for (let vcz = wz0; vcz <= wz1; vcz++) {
      const hut = villageInCell(vcx, vcz, worldSeed);
      if (!hut) continue;
      const hx0 = hut.cx - 2, hz0 = hut.cz - 2;
      for (let lx = 0; lx < 5; lx++) for (let lz = 0; lz < 5; lz++) {
        const wx2 = hx0 + lx, wz2 = hz0 + lz;
        const bx = wx2 - ox, bz = wz2 - oz;
        if (bx < 0 || bx > 15 || bz < 0 || bz > 15) continue;
        for (let rel = 0; rel <= 5; rel++) {
          const y = hut.base + rel;
          if (y < 1 || y >= WORLD_HEIGHT) continue;
          const t = hutBlockAt(lx, lz, rel);
          const idx3 = chunkIdx(bx, y, bz);
          if (t) {
            data[idx3] = BLOCK_ID[t];
            if (t === 'torch') {
              let arr = villageTorches.get(chunkKey(cx, cz));
              if (!arr) { arr = []; villageTorches.set(chunkKey(cx, cz), arr); }
              if (!arr.some(e => e[0] === wx2 && e[1] === y && e[2] === wz2)) arr.push([wx2, y, wz2]);
            }
          } else if (rel >= 2 && rel <= 4) {
            data[idx3] = 0;   // 室内/门洞保证为空
          }
        }
      }
      // 门前农田:3×2 泥土 + 1 格水(替换地表)
      for (let fx = hut.cx - 1; fx <= hut.cx + 1; fx++) for (let fz = hut.cz - 4; fz <= hut.cz - 3; fz++) {
        const bx = fx - ox, bz = fz - oz;
        if (bx < 0 || bx > 15 || bz < 0 || bz > 15) continue;
        const mtnF = fbm2D(fx * 0.008, fz * 0.008, worldSeed + 555, 4);
        const gh = heightAt(fx, fz, worldSeed, mtnF);
        if (gh >= 1 && gh < WORLD_HEIGHT - 1) data[chunkIdx(bx, gh, bz)] = BLOCK_ID.dirt;
      }
      const bxw = hut.cx + 2 - ox, bzw = hut.cz - 4 - oz;
      if (bxw >= 0 && bxw <= 15 && bzw >= 0 && bzw <= 15) {
        const mtnW = fbm2D((hut.cx + 2) * 0.008, (hut.cz - 4) * 0.008, worldSeed + 555, 4);
        const gh2 = heightAt(hut.cx + 2, hut.cz - 4, worldSeed, mtnW);
        if (gh2 >= 1 && gh2 < WORLD_HEIGHT - 1) data[chunkIdx(bxw, gh2, bzw)] = BLOCK_ID.water;
      }
    }
  }

  // 应用玩家改动 diff(只遍历本区块桶,避免全量 16×48×16 字符串 key 探测)
  const bucket = modsByChunk.get(chunkKey(cx, cz));
  if (bucket) {
    for (const [idx, t] of bucket) {
      data[idx] = t ? BLOCK_ID[t] : 0;
      // 红石元件随 diff 入册(R38):读档/重装区块后信号网络可恢复
      if (t && REDSTONE_FAMILY[t]) {
        const y = Math.floor(idx / (CHUNK_SIZE * CHUNK_SIZE));
        const rem = idx - y * CHUNK_SIZE * CHUNK_SIZE;
        // chunkIdx = lx + lz*16 + y*256 → lx = rem%16, lz = floor(rem/16)
        registerRedstone(ox + (rem % CHUNK_SIZE), y, oz + Math.floor(rem / CHUNK_SIZE), t);
      }
    }
  }

  return data;
}

function chunkIdx(lx, y, lz) {
  return lx + lz * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE;
}

// 在世界坐标系种一棵树:树干/树叶可跨越区块边界,写入对应区块的数据数组
// 玩家改动 diff 优先级最高 —— 如果玩家在该位置改过方块,保留玩家的改动
// 目标区块未生成时,写入 pendingBlocks 队列,由该区块创建时应用(保证树冠完整)
function plantTreeAt(wx, baseY, wz) {
  const trunk = 3 + Math.floor(hash3(wx, baseY, wz, worldSeed + 11) * 3);
  const leafType = BLOCK_ID.leaves;
  const trunkType = BLOCK_ID.wood;
  // 写入世界坐标处的方块(跨区块);未加载区块进队列,返回是否实际写入
  const putWorld = (x, y, z, id) => {
    if (y < 0 || y >= WORLD_HEIGHT) return;
    // 玩家改动优先:已被玩家改动的位置不被生成覆盖
    if (modifications.has(blockKey(x, y, z))) return;
    const ccx = Math.floor(x / CHUNK_SIZE), ccz = Math.floor(z / CHUNK_SIZE);
    const ch = chunks.get(chunkKey(ccx, ccz));
    const lx = x - ccx * CHUNK_SIZE, lz = z - ccz * CHUNK_SIZE;
    const idx = chunkIdx(lx, y, lz);
    if (ch) {
      // 仅在空气或树叶位置写入(不覆盖树干/地形)
      if (ch.data[idx] === 0 || ch.data[idx] === leafType) ch.data[idx] = id;
    } else {
      // 队列:区块创建时按写入顺序应用同样的覆盖规则(先到先得,树干可覆盖树叶)
      const pk = chunkKey(ccx, ccz);
      let pending = pendingBlocks.get(pk);
      if (!pending) { pending = new Map(); pendingBlocks.set(pk, pending); }
      if (!pending.has(idx)) pending.set(idx, id);
    }
  };
  for (let i = 1; i <= trunk; i++) putWorld(wx, baseY + i, wz, trunkType);
  const top = baseY + trunk;
  for (let dx = -2; dx <= 2; dx++)
    for (let dz = -2; dz <= 2; dz++)
      for (let dy = 0; dy <= 2; dy++) {
        if (Math.abs(dx) + Math.abs(dz) + dy > 3) continue;
        if (dx === 0 && dz === 0 && dy < 2) continue;
        putWorld(wx + dx, top + dy, wz + dz, leafType);
      }
}

// 应用区块创建前积累的待写树方块(来自邻近已生成区块的树冠)
function applyPendingBlocks(ch) {
  const pending = pendingBlocks.get(ch.key);
  if (!pending) return;
  pendingBlocks.delete(ch.key);
  for (const [idx, id] of pending) {
    const lx = idx % CHUNK_SIZE, lz = ((idx / CHUNK_SIZE) | 0) % CHUNK_SIZE, y = (idx / (CHUNK_SIZE * CHUNK_SIZE)) | 0;
    // 玩家改动优先(与 plantTreeAt 写入时一致)
    if (modifications.has(blockKey(ch.cx * CHUNK_SIZE + lx, y, ch.cz * CHUNK_SIZE + lz))) continue;
    // 仅在空气或树叶位置写入(不覆盖树干/地形)
    if (ch.data[idx] === 0 || ch.data[idx] === BLOCK_ID.leaves) ch.data[idx] = id;
  }
}

// 获取/创建 chunk 对象(仅数据,不含 mesh)
function ensureChunk(cx, cz) {
  if (!Number.isFinite(cx) || !Number.isFinite(cz)) return null;   // 防御 NaN 坐标生成"幽灵区块"
  const key = chunkKey(cx, cz);
  let ch = chunks.get(key);
  if (!ch) {
    ch = { cx, cz, key, data: generateChunkData(cx, cz), mesh: null, meshDirty: true, hasMesh: false };
    chunks.set(key, ch);
    // 1) 应用邻近区块种树时留给本区块的树冠(pendingBlocks)
    applyPendingBlocks(ch);
    // 2) 种本区块的树(每个区块只在创建时种一次;伸入未加载区块的部分进 pendingBlocks)
    growTreesInChunk(cx, cz);
    dirtyChunks.add(ch);
    // 新区块出现时,已存在(已构建 mesh)的相邻区块边界面可能需要重算
    // (含对角:树冠可跨区块角落伸入对角区块)
    markChunkDirty(cx - 1, cz);
    markChunkDirty(cx + 1, cz);
    markChunkDirty(cx, cz - 1);
    markChunkDirty(cx, cz + 1);
    markChunkDirty(cx - 1, cz - 1);
    markChunkDirty(cx - 1, cz + 1);
    markChunkDirty(cx + 1, cz - 1);
    markChunkDirty(cx + 1, cz + 1);
  }
  return ch;
}

// 为指定区块内每一列重新计算是否种树并种下(跨区块写树叶)
// 确定性:同 seed 同坐标永远种同样的树,所以多次调用幂等(树叶只在空气/树叶位写入)
// 性能:先用一次 hash2 预过滤(treeChance 最大 0.12,~88% 列直接跳过多层噪声计算)
function growTreesInChunk(cx, cz) {
  const ch = chunks.get(chunkKey(cx, cz));
  if (!ch) return;
  const ox = cx * CHUNK_SIZE, oz = cz * CHUNK_SIZE;
  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      const wx = ox + lx, wz = oz + lz;
      // R55:广场内不种自然树(广场自带树篱/灯塔/Owen 字样),避免树冠盖住出生点
      if (Math.abs(wx) <= PLAZA_RADIUS && Math.abs(wz) <= PLAZA_RADIUS) continue;
      const r = hash2(wx, wz, worldSeed + 999);
      if (r >= 0.12) continue;   // 预过滤:所有群系 treeChance ≤ 0.12,r 偏大必不种树
      const mtnT = fbm2D(wx * 0.008, wz * 0.008, worldSeed + 555, 4);
      const biome = biomeAt(wx, wz, worldSeed, mtnT);
      const b = BIOMES[biome];
      if (b.treeChance <= 0) continue;
      const height = heightAt(wx, wz, worldSeed, mtnT);
      if (height <= SEA_LEVEL) continue;
      // 村庄小屋附近不种树(R31):树冠(半径 ~2)不伸进屋体/挡门洞
      const hut = villageInCell(Math.floor(wx / 48), Math.floor(wz / 48), worldSeed);
      if (hut && Math.abs(wx - hut.cx) <= 4 && Math.abs(wz - hut.cz) <= 4) continue;
      if (r < b.treeChance) plantTreeAt(wx, height, wz);
    }
  }
}

// 方块读写(世界坐标)
function getBlock(x, y, z) {
  if (y < 0 || y >= WORLD_HEIGHT) return null;
  const cx = Math.floor(x / CHUNK_SIZE), cz = Math.floor(z / CHUNK_SIZE);
  const ch = chunks.get(chunkKey(cx, cz));
  if (!ch) return null;
  const lx = x - cx * CHUNK_SIZE, lz = z - cz * CHUNK_SIZE;
  const id = ch.data[chunkIdx(lx, y, lz)];
  const name = id === 0 ? null : ID_TO_BLOCK[id]; return name || null;
}
function isSolidAt(x, y, z) {
  const t = getBlock(x, y, z);
  if (!!t && BLOCK_TYPES[t].solid) return true;
  if (doorBlocksAt(x, y, z)) return true;
  return false;
}

// 设置方块(玩家破坏/放置)
function setBlock(x, y, z, type) {
  if (y < 0 || y >= WORLD_HEIGHT) return false;
  if (y === 0) return false;  // 基岩层(y=0)不可破坏/覆盖,防止挖穿掉入虚空
  const cx = Math.floor(x / CHUNK_SIZE), cz = Math.floor(z / CHUNK_SIZE);
  const ch = ensureChunk(cx, cz);
  if (!ch) return false;
  const lx = x - cx * CHUNK_SIZE, lz = z - cz * CHUNK_SIZE;
  const idx = chunkIdx(lx, y, lz);
  const newId = type ? BLOCK_ID[type] : 0;
  const oldId = ch.data[idx];
  if (ch.data[idx] === newId) return false;
  ch.data[idx] = newId;
  ch.meshDirty = true;
  dirtyChunks.add(ch);
  // 记录改动 diff(用于存档;全局表 + 区块桶同步)
  addModification(x, y, z, type);
  // 红石元件登记表实时更新(R38):放入/拉杆切换 upsert,清空则移除登记
  if (type && REDSTONE_FAMILY[type]) registerRedstone(x, y, z, type);
  else unregisterRedstone(x, y, z);   // 幂等:非红石格删除无副作用
  // 铁傀儡构造检测(R39):放下铁块时若构成 T 形结构 → 生成(内部递归 setBlock 无害)
  if (type === 'iron_block') trySpawnGolem(x, y, z);
  // 活塞朝向维护(R42):伸出/收回只是 id 切换,朝向存于 Map 天然保留;
  // 方块被彻底移除时清登记(被推动的活塞朝向重置为默认,边缘情况可接受)
  if (!type) pistons.delete(x + ',' + y + ',' + z);
  // 相邻 chunk 在边界时也需重建(面剔除跨边界)
  if (lx === 0) markChunkDirty(cx - 1, cz);
  if (lx === CHUNK_SIZE - 1) markChunkDirty(cx + 1, cz);
  if (lz === 0) markChunkDirty(cx, cz - 1);
  if (lz === CHUNK_SIZE - 1) markChunkDirty(cx, cz + 1);
  // 光照缓存失效(R22):火把增删 → 3×3 重算重绘;在火把照亮范围内的其他改动
  // (遮挡物增删)同样需要 —— 缓存中已有光照网格即说明半径内有光源
  if (newId === TORCH_ID || oldId === TORCH_ID) {
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      lightGridCache.delete(chunkKey(cx + dx, cz + dz));
      markChunkDirty(cx + dx, cz + dz);
    }
  } else {
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const k = chunkKey(cx + dx, cz + dz);
      if (lightGridCache.get(k)) { lightGridCache.delete(k); markChunkDirty(cx + dx, cz + dz); }
    }
  }
  // 沙砾重力:检查本格(新放/爆炸暴露)与上格(失去支撑)
  scheduleFallCheck(x, y, z);
  scheduleFallCheck(x, y + 1, z);
  return true;
}
function markChunkDirty(cx, cz) {
  const ch = chunks.get(chunkKey(cx, cz));
  if (ch) { ch.meshDirty = true; dirtyChunks.add(ch); }
}

// ============================================================
// 第五部分:区块网格构建(面剔除 + atlas UV + 合并)
// ============================================================
// 面定义:法线、4 个顶点偏移(相对方块原点 min 角)、对应纹理 face
// 顺序: px(+x), nx(-x), py(+y top), ny(-y bottom), pz(+z), nz(-z)
const FACES = [
  { n: [1, 0, 0], v: [[1,0,1],[1,0,0],[1,1,0],[1,1,1]], face: 'side' },   // +x
  { n: [-1,0, 0], v: [[0,0,0],[0,0,1],[0,1,1],[0,1,0]], face: 'side' },   // -x
  { n: [0, 1, 0], v: [[0,1,1],[1,1,1],[1,1,0],[0,1,0]], face: 'top' },    // +y
  { n: [0,-1, 0], v: [[0,0,0],[1,0,0],[1,0,1],[0,0,1]], face: 'bottom' }, // -y
  { n: [0, 0, 1], v: [[0,0,1],[1,0,1],[1,1,1],[0,1,1]], face: 'side' },   // +z
  { n: [0, 0,-1], v: [[1,0,0],[0,0,0],[0,1,0],[1,1,0]], face: 'side' },   // -z
];

// 实心方块网格(不透明 + 树叶 alphaTest)

// 面剔除按 id 查表(热路径避免字符串名称 + BLOCK_TYPES 哈希查找)
const WATER_ID = BLOCK_ID.water;
const SOLID_BY_ID = new Uint8Array(64);
for (const name in BLOCK_TYPES) SOLID_BY_ID[BLOCK_ID[name]] = BLOCK_TYPES[name].solid ? 1 : 0;

// 按 id 直接读方块(区块未加载/越界返回 0;供网格构建热路径使用)
function getBlockId(x, y, z) {
  if (y < 0 || y >= WORLD_HEIGHT) return 0;
  const cx = Math.floor(x / CHUNK_SIZE), cz = Math.floor(z / CHUNK_SIZE);
  const ch = chunks.get(chunkKey(cx, cz));
  if (!ch) return 0;
  return ch.data[chunkIdx(x - cx * CHUNK_SIZE, y, z - cz * CHUNK_SIZE)];
}

// ============================================================
// 火把逐方块光照(R22):光源 BFS 光级 14→1,不透明方块挡光,跨区块传播
// ============================================================
const TORCH_ID = BLOCK_ID.torch;
const TORCH_LIGHT_LEVEL = 14;                    // 火把光级(经典)
const LIGHT_MARGIN = TORCH_LIGHT_LEVEL;          // 光照网格外扩半径 = 最大传播距离(14 < 16,影响至多相邻区块)
const DIR6 = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
// 挡光表:不透明实体挡光;玻璃/树叶透光(经典近似);非固体(空气/水/梯子/火把)透光
const LIGHT_BLOCK_BY_ID = new Uint8Array(64);
for (const name in BLOCK_TYPES) {
  const d = BLOCK_TYPES[name];
  LIGHT_BLOCK_BY_ID[BLOCK_ID[name]] = (d.solid && name !== 'glass' && name !== 'leaves') ? 1 : 0;
}
// 光级 → 顶点自发光强度(非线性衰减曲线,近亮远暗更自然)
const LIGHT_CURVE = new Float32Array(TORCH_LIGHT_LEVEL + 1);
for (let li = 1; li <= TORCH_LIGHT_LEVEL; li++) LIGHT_CURVE[li] = Math.pow(li / TORCH_LIGHT_LEVEL, 1.5);
// 火光总强度(昼夜调节:白天微光/夜晚全亮),由 updateDayNight 更新
const torchGlowUniform = { value: 0.9 };
// 光照网格缓存:chunkKey -> {grid, gx0, gz0, W} | null(无光源零开销);火把增删时失效
const lightGridCache = new Map();

// 重建区块光照网格:chunk ± 14 格范围 BFS;光源来自 modifications 中的火把(与存档一致)
function rebuildLightGrid(cx, cz) {
  const W = CHUNK_SIZE + 2 * LIGHT_MARGIN;
  const gx0 = cx * CHUNK_SIZE - LIGHT_MARGIN, gz0 = cz * CHUNK_SIZE - LIGHT_MARGIN;
  // 收集相邻 3×3 区块内的火把(光级 14 < 区块边长 16,更远的不可能照到本区块)
  // 来源:玩家放置(modsByChunk)+ 村庄小屋生成侧(villageTorches,R31)
  const sources = [];
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
    const bucket = modsByChunk.get(chunkKey(cx + dx, cz + dz));
    if (bucket) {
      for (const [cidx, type] of bucket) {
        if (type !== 'torch') continue;
        const y = (cidx / (CHUNK_SIZE * CHUNK_SIZE)) | 0, rem = cidx % (CHUNK_SIZE * CHUNK_SIZE);
        const lz = (rem / CHUNK_SIZE) | 0, lx = rem % CHUNK_SIZE;
        sources.push((cx + dx) * CHUNK_SIZE + lx, y, (cz + dz) * CHUNK_SIZE + lz);
      }
    }
    const vt = villageTorches.get(chunkKey(cx + dx, cz + dz));
    if (vt) for (const tp of vt) sources.push(tp[0], tp[1], tp[2]);
  }
  if (!sources.length) return null;
  const grid = new Uint8Array(W * WORLD_HEIGHT * W);
  const gi = (x, y, z) => ((y * W) + (z - gz0)) * W + (x - gx0);
  // 种子:火把格 = 14(BFS 起点)
  const queue = [];
  for (let i = 0; i < sources.length; i += 3) {
    const x = sources[i], y = sources[i + 1], z = sources[i + 2];
    if (x < gx0 || x >= gx0 + W || z < gz0 || z >= gz0 + W || y < 0 || y >= WORLD_HEIGHT) continue;
    const ii = gi(x, y, z);
    if (grid[ii] < TORCH_LIGHT_LEVEL) { grid[ii] = TORCH_LIGHT_LEVEL; queue.push(x, y, z); }
  }
  let head = 0;
  while (head < queue.length) {
    const x = queue[head++], y = queue[head++], z = queue[head++];
    const lv = grid[gi(x, y, z)];
    if (lv <= 1) continue;
    for (let d = 0; d < 6; d++) {
      const nx = x + DIR6[d][0], ny = y + DIR6[d][1], nz = z + DIR6[d][2];
      if (ny < 0 || ny >= WORLD_HEIGHT || nx < gx0 || nx >= gx0 + W || nz < gz0 || nz >= gz0 + W) continue;
      const ni = gi(nx, ny, nz);
      if (grid[ni] >= lv - 1) continue;                 // 已有更亮值
      const nid = getBlockId(nx, ny, nz);
      if (nid !== 0 && LIGHT_BLOCK_BY_ID[nid]) continue; // 不透明挡光
      grid[ni] = lv - 1;
      queue.push(nx, ny, nz);
    }
  }
  return { grid, gx0, gz0, W };
}

function getLightGrid(cx, cz) {
  const k = chunkKey(cx, cz);
  if (!lightGridCache.has(k)) lightGridCache.set(k, rebuildLightGrid(cx, cz));
  return lightGridCache.get(k);
}

// 采样世界坐标处的火把光级(测试/调试用;0=无光)
function lightAtWorld(x, y, z) {
  const cx = Math.floor(x / CHUNK_SIZE), cz = Math.floor(z / CHUNK_SIZE);
  const light = getLightGrid(cx, cz);
  if (!light) return 0;
  const gx = x - light.gx0, gz = z - light.gz0;
  if (gx < 0 || gx >= light.W || gz < 0 || gz >= light.W || y < 0 || y >= WORLD_HEIGHT) return 0;
  return light.grid[((y * light.W) + gz) * light.W + gx];
}
window.__lightAt = lightAtWorld;   // 调试/测试钩子(Playwright 光照断言用)

// 面方向烘焙亮度(+x,-x,+y,-y,+z,-z),模块级常量
const FACE_SHADE = [0.86, 0.86, 1.0, 0.55, 0.72, 0.72];
// 每面 UV 复用缓冲,避免每面分配 [ [u,v]×4 ] 小数组
const faceUV = new Float64Array(8);

// 水面 mesh 注册表(buildChunkMesh 维护):水面波动每帧只遍历水块,不扫全部 chunk
const waterMeshes = [];
function registerWaterMesh(wm) { waterMeshes.push(wm); }
function unregisterWaterMesh(wm) { const i = waterMeshes.indexOf(wm); if (i >= 0) waterMeshes.splice(i, 1); }

function buildChunkMesh(ch) {
  // 防御:NaN/空 chunk 不得进入网格构建(否则每帧动画在 buildChunkMesh 抛错)
  if (!ch || !Number.isFinite(ch.cx) || !Number.isFinite(ch.cz)) {
    if (ch) dirtyChunks.delete(ch);
    return;
  }
  const ox = ch.cx * CHUNK_SIZE, oz = ch.cz * CHUNK_SIZE;
  const data = ch.data;
  const positions = [], normals = [], uvs = [], indices = [], colors = [];
  const torch = [];   // 顶点火把光级强度(R22 光照;无光源区块全 0)
  const sky = [];     // 顶点天光遮蔽系数(R24:地下/洞内变暗;0.15 下限)
  const wPositions = [], wNormals = [], wUvs = [], wIndices = []; // 水面/透明
  const light = getLightGrid(ch.cx, ch.cz);   // 光照网格(无光源时为 null,零采样开销)
  // 天光遮蔽(R24):每列首个挡光方块高度(列顶);面朝向格低于列顶越深越暗 ——
  // 洞穴天然黑暗;火把自发光经补偿(见材质注入)不受遮蔽,火把照常点亮洞内
  const topY = new Int16Array(CHUNK_SIZE * CHUNK_SIZE);
  for (let tlx = 0; tlx < CHUNK_SIZE; tlx++) for (let tlz = 0; tlz < CHUNK_SIZE; tlz++) {
    let t = -1;
    for (let yy = WORLD_HEIGHT - 1; yy >= 0; yy--) {
      const id2 = data[chunkIdx(tlx, yy, tlz)];
      if (id2 !== 0 && LIGHT_BLOCK_BY_ID[id2]) { t = yy; break; }
    }
    topY[tlx * CHUNK_SIZE + tlz] = t;
  }
  const borderMemo = new Map();   // 边界列顶缓存(跨区块面少量采样)
  const colTop = (ax, az) => {
    const bx = ax - ox, bz = az - oz;
    if (bx >= 0 && bx < CHUNK_SIZE && bz >= 0 && bz < CHUNK_SIZE) return topY[bx * CHUNK_SIZE + bz];
    const k = ax + ',' + az;
    let t = borderMemo.get(k);
    if (t === undefined) {
      t = -1;
      for (let yy = WORLD_HEIGHT - 1; yy >= 0; yy--) {
        const id2 = getBlockId(ax, yy, az);
        if (id2 !== 0 && LIGHT_BLOCK_BY_ID[id2]) { t = yy; break; }
      }
      borderMemo.set(k, t);
    }
    return t;
  };

  for (let y = 0; y < WORLD_HEIGHT; y++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const id = data[chunkIdx(lx, y, lz)];
        if (id === 0) continue;
        const type = ID_TO_BLOCK[id];
        const wx = ox + lx, wz = oz + lz;
        const isWater = id === WATER_ID;
        const uvRow = atlasUV[type];

        for (let f = 0; f < 6; f++) {
          const F = FACES[f];
          const nlx = lx + F.n[0], nly = y + F.n[1], nlz = lz + F.n[2];
          // 邻接查询:区块内直读 data(绝大多数),跨边界才走 getBlockId
          let nid;
          if (nlx >= 0 && nlx < CHUNK_SIZE && nlz >= 0 && nlz < CHUNK_SIZE && nly >= 0 && nly < WORLD_HEIGHT) {
            nid = data[chunkIdx(nlx, nly, nlz)];
          } else {
            nid = getBlockId(wx + F.n[0], nly, wz + F.n[2]);
          }
          // 面剔除规则:
          //  - 当前是水:相邻"水"或"固体"都不显示(水内部界面)
          //  - 当前是固体:相邻"固体"不显示;但相邻"水"仍要显示(透过半透明水能看到海底/水边)
          if (nid !== 0) {
            if (isWater) {
              if (SOLID_BY_ID[nid] || nid === WATER_ID) continue;
            } else {
              if (SOLID_BY_ID[nid]) continue;
            }
          }

          // UV
          const uvBox = uvRow[F.face];
          const u0 = uvBox[0], v0 = uvBox[1], u1 = uvBox[2], v1 = uvBox[3];
          const base = F.v;
          // 顶点顺序对应 UV: (u0,v0),(u1,v0),(u1,v1),(u0,v1)
          faceUV[0] = u0; faceUV[1] = v1;
          faceUV[2] = u1; faceUV[3] = v1;
          faceUV[4] = u1; faceUV[5] = v0;
          faceUV[6] = u0; faceUV[7] = v0;

          const tgtP = isWater ? wPositions : positions;
          const tgtN = isWater ? wNormals : normals;
          const tgtU = isWater ? wUvs : uvs;
          const tgtI = isWater ? wIndices : indices;
          // 烘焙顶点色(按面方向,非水才加)
          const shade = FACE_SHADE[f];
          // 面朝向的相邻格(空气/透明):火把光级(R22)与天光遮蔽(R24)共用采样
          const ax = wx + F.n[0], ay = y + F.n[1], az = wz + F.n[2];
          let torchV = 0, skyV = 1;
          if (!isWater) {
            if (light) {
              const gx = ax - light.gx0, gz2 = az - light.gz0;
              if (gx >= 0 && gx < light.W && gz2 >= 0 && gz2 < light.W && ay >= 0 && ay < WORLD_HEIGHT) {
                torchV = LIGHT_CURVE[light.grid[((ay * light.W) + gz2) * light.W + gx]];
              }
            }
            const depth = colTop(ax, az) - ay;
            if (depth > 0) skyV = Math.max(0.15, 1 - depth * 0.22);
          }
          const col = shade * skyV;
          const start = tgtP.length / 3;
          const hScale = (BLOCK_TYPES[type] && BLOCK_TYPES[type].slab) ? 0.5 : 1;   // 半砖半高(R41)
          for (let k = 0; k < 4; k++) {
            tgtP.push(wx + base[k][0], y + base[k][1] * hScale, wz + base[k][2]);
            tgtN.push(F.n[0], F.n[1], F.n[2]);
            tgtU.push(faceUV[k * 2], faceUV[k * 2 + 1]);
            if (!isWater) colors.push(col, col, col);
          }
          if (!isWater) { torch.push(torchV, torchV, torchV, torchV); sky.push(skyV, skyV, skyV, skyV); }
          tgtI.push(start, start + 1, start + 2, start, start + 2, start + 3);
        }
      }
    }
  }

  // 释放旧 mesh
  if (ch.mesh) {
    if (ch.mesh.solid) { scene.remove(ch.mesh.solid); ch.mesh.solid.geometry.dispose(); }
    if (ch.mesh.water) { scene.remove(ch.mesh.water); unregisterWaterMesh(ch.mesh.water); ch.mesh.water.geometry.dispose(); }
  }
  ch.mesh = {};
  ch.meshDirty = false;
  dirtyChunks.delete(ch);
  ch.hasMesh = false;

  const buildGeo = (P, N, U, I, C, T, S) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    if (C) g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    if (T) g.setAttribute('aTorch', new THREE.Float32BufferAttribute(T, 1));   // R22 火把光照
    if (S) g.setAttribute('aSky', new THREE.Float32BufferAttribute(S, 1));     // R24 天光遮蔽
    g.setIndex(I);
    return g;
  };

  if (positions.length) {
    const m = new THREE.Mesh(buildGeo(positions, normals, uvs, indices, colors, torch, sky), matSolidChunk);
    m.userData.isChunk = true;
    m.userData.cx = ch.cx; m.userData.cz = ch.cz;
    scene.add(m);
    ch.mesh.solid = m;
    ch.hasMesh = true;
  }
  if (wPositions.length) {
    const wm = new THREE.Mesh(buildGeo(wPositions, wNormals, wUvs, wIndices), matWaterChunk);
    wm.userData.isChunk = true;
    wm.userData.isWater = true;
    wm.userData.cx = ch.cx; wm.userData.cz = ch.cz;
    wm.renderOrder = 1;
    scene.add(wm);
    ch.mesh.water = wm;
    registerWaterMesh(wm);
    ch.hasMesh = true;
  }
}

// ============================================================
// 第六部分:区块加载/卸载(分帧)
// ============================================================
let chunkMeshBuildBudget = 2;       // 每帧最多构建几个 mesh
let chunkDataGenBudget = 3;         // 每帧最多生成几个 chunk 数据

function updateChunks(playerWX, playerWZ) {
  const pcx = Math.floor(playerWX / CHUNK_SIZE);
  const pcz = Math.floor(playerWZ / CHUNK_SIZE);
  const R = RENDER_DISTANCE;

  // 卸载范围外的 chunk
  for (const [key, ch] of chunks) {
    if ((Math.abs(ch.cx - pcx) > R + 1 || Math.abs(ch.cz - pcz) > R + 1) && !(ch.cx === pcx && ch.cz === pcz)) {
      if (ch.mesh) {
        if (ch.mesh.solid) { scene.remove(ch.mesh.solid); ch.mesh.solid.geometry.dispose(); }
        if (ch.mesh.water) { scene.remove(ch.mesh.water); unregisterWaterMesh(ch.mesh.water); ch.mesh.water.geometry.dispose(); }
      }
      dirtyChunks.delete(ch);   // 已卸载的区块不再参与 mesh 重建
      chunks.delete(key);
      // R55:生成侧登记表随区块卸载清理,防无限世界长期游玩时 Map 只增不减
      dungeonSpawns.delete(key);
      dungeonLootSpots.delete(key);
      vaultSpots.delete(key);
      ancientGolemSpots.delete(key);
      redstoneParts.delete(key);
    }
  }
  // 门与渲染范围联动:超出(渲染范围 + 2 chunk)仅释放 mesh 保留表项(数据轻),
  // 玩家回到附近按需重建 —— 避免内存泄漏的同时,走远再回来门不消失
  const _doorMaxDist = (RENDER_DISTANCE + 2) * CHUNK_SIZE;
  for (const d of doors.values()) {
    const dist = Math.max(Math.abs(d.x - playerWX), Math.abs(d.z - playerWZ));
    if (dist > _doorMaxDist) {
      if (d.group) { disposeDoorGroup(d.group); scene.remove(d.group); d.group = null; }
    } else if (!d.group) {
      d.group = createDoorMesh(d); scene.add(d.group);   // 回到附近:重建
    }
  }

  // 加载:先生成数据(由近到远),再构建 mesh
  // 优先保证玩家所在 chunk 及周围 1 圈的数据存在(物理碰撞需要)
  for (let r = 0; r <= 1; r++) {
    for (let dx = -r; dx <= r; dx++)
      for (let dz = -r; dz <= r; dz++) {
        ensureChunk(pcx + dx, pcz + dz);
      }
  }

  // 分帧生成数据(螺旋)
  let genLeft = chunkDataGenBudget;
  outer:
  for (let r = 0; r <= R; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const key = chunkKey(pcx + dx, pcz + dz);
        if (!chunks.has(key)) {
          ensureChunk(pcx + dx, pcz + dz);
          if (--genLeft <= 0) break outer;
        }
      }
    }
  }

  // 分帧构建 mesh:从 dirtyChunks 挑最近的 budget 个(不分配数组、不排序)
  let buildLeft = chunkMeshBuildBudget;
  while (buildLeft > 0 && dirtyChunks.size > 0) {
    // 清理异常条目(旧档/损坏门数据可能带入 NaN 坐标)
    for (const ch of dirtyChunks) if (!ch || !Number.isFinite(ch.cx) || !Number.isFinite(ch.cz)) dirtyChunks.delete(ch);
    if (dirtyChunks.size === 0) break;
    let best = null, bestD = Infinity;
    for (const ch of dirtyChunks) {
      const d = (ch.cx - pcx) * (ch.cx - pcx) + (ch.cz - pcz) * (ch.cz - pcz);
      if (d < bestD) { bestD = d; best = ch; }
    }
    if (!best) { dirtyChunks.clear(); break; }
    buildChunkMesh(best);   // 内部重置 meshDirty 并从 dirtyChunks 移除
    buildLeft--;
  }
}

