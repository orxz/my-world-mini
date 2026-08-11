/* ============================================================
   我的世界 - 体素小游戏(增强版)
   基于 Three.js,纯前端实现
   增强:动态区块加载(近似无限世界)/ 6 种生物群系 / Web Audio 音效 / IndexedDB 存档
   ============================================================ */
const { THREE } = window;

// ============================================================
// 第一部分:方块定义(扩展 water/snow/gravel)
// ============================================================
const BLOCK_TYPES = {
  grass:   { name: '草方块',   top: '#6b9c3e', side: '#7a5a3a', bottom: '#8b6b45', solid: true,  tool: 'shovel',   hardness: 0.6 },
  dirt:    { name: '泥土',     top: '#8b6b45', side: '#7a5a3a', bottom: '#6b4e30', solid: true,  tool: 'shovel',   hardness: 0.5 },
  stone:   { name: '石头',     top: '#888888', side: '#7c7c7c', bottom: '#6e6e6e', solid: true,  tool: 'pickaxe',  hardness: 1.5 },
  wood:    { name: '木头',     top: '#b8945f', side: '#6e4f2a', bottom: '#b8945f', solid: true,  tool: 'axe',      hardness: 1.0 },
  leaves:  { name: '树叶',     top: '#3f7a2e', side: '#356827', bottom: '#2c5520', solid: true,  tool: 'axe',      hardness: 0.3 },
  sand:    { name: '沙子',     top: '#e6d59a', side: '#d8c68a', bottom: '#c4b276', solid: true,  tool: 'shovel',   hardness: 0.5 },
  planks:  { name: '木板',     top: '#b08243', side: '#a0763a', bottom: '#8a6430', solid: true,  tool: 'axe',      hardness: 1.0 },
  brick:   { name: '砖块',     top: '#a44a32', side: '#923f2a', bottom: '#7e3523', solid: true,  tool: 'pickaxe',  hardness: 2.0 },
  water:   { name: '水',       top: '#2a8fd6', side: '#2480c0', bottom: '#1f72b0', solid: false, tool: 'any',      hardness: 100, liquid: true },
  snow:    { name: '雪',       top: '#f4f8ff', side: '#e4ecf4', bottom: '#d4dce8', solid: true,  tool: 'shovel',   hardness: 0.3 },
  gravel:  { name: '沙砾',     top: '#8a8278', side: '#7a7268', bottom: '#6a6258', solid: true,  tool: 'shovel',   hardness: 0.6 },
  // 纯色装饰方块(羊毛):接近零噪点,扁平纯色,适合像素艺术
  wool_red:    { name: '红色羊毛', top: '#c0392b', side: '#c0392b', bottom: '#c0392b', solid: true, tool: 'any', hardness: 0.8 },
  wool_yellow: { name: '黄色羊毛', top: '#f1c40f', side: '#f1c40f', bottom: '#f1c40f', solid: true, tool: 'any', hardness: 0.8 },
  wool_white:  { name: '白色羊毛', top: '#ecf0f1', side: '#ecf0f1', bottom: '#ecf0f1', solid: true, tool: 'any', hardness: 0.8 },
  wool_black:  { name: '黑色羊毛', top: '#2c3e50', side: '#2c3e50', bottom: '#2c3e50', solid: true, tool: 'any', hardness: 0.8 },
  door:        { name: '木门',     top: '#8a6334', side: '#a0763a', bottom: '#8a6334', solid: true, tool: 'axe',      hardness: 1.0 },
  door_iron:   { name: '铁门',     top: '#888888', side: '#a0a0a0', bottom: '#707070', solid: true, tool: 'pickaxe', hardness: 3.0 },
  door_stone:  { name: '石门',     top: '#777777', side: '#888888', bottom: '#666666', solid: true, tool: 'pickaxe', hardness: 2.5 },
  door_gold:   { name: '金门',     top: '#c8a030', side: '#ffd54a', bottom: '#b89020', solid: true, tool: 'pickaxe', hardness: 2.0 },
  door_diamond:{ name: '钻石门',   top: '#3aa8b8', side: '#5fe3e8', bottom: '#2a8898', solid: true, tool: 'pickaxe', hardness: 4.0 },
};
const HOTBAR_ORDER = ['grass', 'dirt', 'stone', 'wood', 'leaves', 'sand', 'planks', 'brick'];

// 方块数字 id(用于紧凑的 Uint8Array 区块存储)
const BLOCK_ID = { air: 0, grass: 1, dirt: 2, stone: 3, wood: 4, leaves: 5, sand: 6, planks: 7, brick: 8, water: 9, snow: 10, gravel: 11, wool_red: 12, wool_yellow: 13, wool_white: 14, wool_black: 15, door: 16, door_iron: 17, door_stone: 18, door_gold: 19, door_diamond: 20 };
const ID_TO_BLOCK = Object.keys(BLOCK_ID);

// ============================================================
// 第二部分:工具与物品定义(保持不变)
// ============================================================
const TOOL_TYPES = {
  pickaxe_wood: { name: '木镐',   tool: 'pickaxe', durability: 60,  speed: 1.5, tier: 'wood' },
  pickaxe_stone:{ name: '石镐',   tool: 'pickaxe', durability: 132, speed: 2.5, tier: 'stone' },
  pickaxe_iron: { name: '铁镐',   tool: 'pickaxe', durability: 251, speed: 4.0, tier: 'iron' },
  pickaxe_gold: { name: '金镐',   tool: 'pickaxe', durability: 33,  speed: 6.0, tier: 'gold' },
  pickaxe_diamond:{ name: '钻石镐', tool: 'pickaxe', durability: 1562, speed: 8.0, tier: 'diamond' },
  axe_wood:     { name: '木斧',   tool: 'axe',     durability: 60,  speed: 1.5, tier: 'wood' },
  axe_stone:    { name: '石斧',   tool: 'axe',     durability: 132, speed: 2.5, tier: 'stone' },
  axe_iron:     { name: '铁斧',   tool: 'axe',     durability: 251, speed: 4.0, tier: 'iron' },
  axe_gold:     { name: '金斧',   tool: 'axe',     durability: 33,  speed: 6.0, tier: 'gold' },
  axe_diamond:  { name: '钻石斧', tool: 'axe',     durability: 1562, speed: 8.0, tier: 'diamond' },
  shovel_wood:  { name: '木铲',   tool: 'shovel',  durability: 60,  speed: 1.5, tier: 'wood' },
  shovel_stone: { name: '石铲',   tool: 'shovel',  durability: 132, speed: 2.5, tier: 'stone' },
  shovel_iron:  { name: '铁铲',   tool: 'shovel',  durability: 251, speed: 4.0, tier: 'iron' },
  shovel_gold:  { name: '金铲',   tool: 'shovel',  durability: 33,  speed: 6.0, tier: 'gold' },
  shovel_diamond:{ name: '钻石铲', tool: 'shovel', durability: 1562, speed: 8.0, tier: 'diamond' },
  sword_wood:   { name: '木剑',   tool: 'sword',   durability: 60,  damage: 3,  tier: 'wood' },
  sword_stone:  { name: '石剑',   tool: 'sword',   durability: 132, damage: 4,  tier: 'stone' },
  sword_iron:   { name: '铁剑',   tool: 'sword',   durability: 251, damage: 6,  tier: 'iron' },
  sword_gold:   { name: '金剑',   tool: 'sword',   durability: 33,  damage: 4,  tier: 'gold' },
  sword_diamond:{ name: '钻石剑', tool: 'sword',   durability: 1562, damage: 8, tier: 'diamond' },
  shield_wood:  { name: '木盾',   tool: 'shield',  durability: 80,  tier: 'wood' },
  shield_iron:  { name: '铁盾',   tool: 'shield',  durability: 400, tier: 'iron' },
  shield_diamond:{ name: '钻石盾', tool: 'shield', durability: 800, tier: 'diamond' },
  bow:          { name: '弓',     tool: 'bow',     durability: 384, tier: 'wood' },
};
const TOOL_ORDER = [
  'sword_diamond','sword_gold','sword_iron','sword_stone','sword_wood',
  'pickaxe_diamond','pickaxe_gold','pickaxe_iron','pickaxe_stone','pickaxe_wood',
  'axe_diamond','axe_gold','axe_iron','axe_stone','axe_wood',
  'shovel_diamond','shovel_gold','shovel_iron','shovel_stone','shovel_wood',
  'bow',
  'shield_diamond','shield_iron','shield_wood',
];
const ITEM_TYPES = {
  gem_diamond: { name: '钻石',   color: '#5fe3e8', shape: 'gem' },
  gem_gold:    { name: '金锭',   color: '#ffd54a', shape: 'ingot' },
  gem_emerald: { name: '绿宝石', color: '#3fd17a', shape: 'gem' },
  arrow:       { name: '箭',     color: '#caa472', shape: 'arrow' },
};
const ITEM_ORDER = ['gem_diamond','gem_gold','gem_emerald','arrow'];

// ============================================================
// 第三部分:像素纹理与图集(用于区块合并网格)
// ============================================================
function makePixelTexture(drawFn, size = 16) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  drawFn(ctx, size);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function parseHex(hex) {
  hex = hex.replace('#', '');
  return { r: parseInt(hex.slice(0, 2), 16), g: parseInt(hex.slice(2, 4), 16), b: parseInt(hex.slice(4, 6), 16) };
}
function rgbStr(r, g, b) {
  r = Math.max(0, Math.min(255, r | 0));
  g = Math.max(0, Math.min(255, g | 0));
  b = Math.max(0, Math.min(255, b | 0));
  return `rgb(${r},${g},${b})`;
}

// 单面纹理绘制:复用旧版本的细节画法
function drawBlockFace(ctx, type, face, s, seedRand) {
  const def = BLOCK_TYPES[type];
  const col = face === 'top' ? def.top : face === 'bottom' ? def.bottom : def.side;
  const base = parseHex(col);
  ctx.fillStyle = col; ctx.fillRect(0, 0, s, s);

  const noise = (amp) => {
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      if (seedRand() < 0.18) {
        const d = (seedRand() - 0.5) * amp;
        ctx.fillStyle = rgbStr(base.r + d, base.g + d, base.b + d);
        ctx.fillRect(x, y, 1, 1);
      }
    }
  };

  switch (type) {
    case 'grass':
      if (face === 'top') {
        noise(40);
      } else if (face === 'side') {
        noise(30);
        const g = parseHex(def.top);
        for (let x = 0; x < s; x++) {
          const h = 3 + Math.floor(seedRand() * 3);
          for (let y = 0; y < h; y++) {
            const d = (seedRand() - 0.5) * 40;
            ctx.fillStyle = rgbStr(g.r + d, g.g + d, g.b + d * 0.5);
            ctx.fillRect(x, y, 1, 1);
          }
        }
      } else noise(40);
      break;
    case 'wood':
      if (face === 'side') {
        for (let x = 0; x < s; x++) {
          if (seedRand() < 0.35) {
            const d = (seedRand() - 0.5) * 50;
            ctx.fillStyle = rgbStr(base.r + d, base.g + d, base.b + d);
            ctx.fillRect(x, 0, 1, s);
          }
        }
      } else {
        // 年轮
        ctx.strokeStyle = 'rgba(80,55,25,0.6)'; ctx.lineWidth = 1;
        const cx = s / 2, cy = s / 2;
        for (let r = 2; r < s / 2; r += 3) { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke(); }
      }
      break;
    case 'leaves':
      for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
        if (seedRand() < 0.15) { ctx.clearRect(x, y, 1, 1); continue; }
        const d = (seedRand() - 0.5) * 50;
        ctx.fillStyle = rgbStr(base.r + d, base.g + d, base.b + d);
        ctx.fillRect(x, y, 1, 1);
      }
      break;
    case 'brick':
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      for (let y = 0; y < s; y += 4) {
        ctx.fillRect(0, y, s, 1);
        const offset = (y / 4) % 2 === 0 ? 0 : 4;
        for (let x = offset; x < s; x += 8) ctx.fillRect(x, y, 1, 4);
      }
      break;
    case 'water':
      noise(25);
      break;
    case 'wool_red':
    case 'wool_yellow':
    case 'wool_white':
      break;
    case 'door': {
      // 木门:木板底 + 深棕门框 + 中线 + 金把手
      ctx.fillStyle = col; ctx.fillRect(0, 0, s, s);
      ctx.fillStyle = 'rgba(60,40,20,0.6)';
      ctx.fillRect(0,0,s,1); ctx.fillRect(0,s-1,s,1); ctx.fillRect(0,0,1,s); ctx.fillRect(s-1,0,1,s);
      ctx.fillRect(Math.floor(s/2),1,1,s-2);
      ctx.fillStyle = 'rgba(200,180,80,0.8)'; ctx.fillRect(Math.floor(s*0.7),Math.floor(s*0.4),1,1);
      break;
    }
    case 'door_iron': {
      // 铁门:金属灰底 + 铆钉点缀 + 中线 + 银把手
      ctx.fillStyle = col; ctx.fillRect(0, 0, s, s);
      ctx.fillStyle = 'rgba(40,40,40,0.5)';
      ctx.fillRect(0,0,s,1); ctx.fillRect(0,s-1,s,1); ctx.fillRect(0,0,1,s); ctx.fillRect(s-1,0,1,s);
      ctx.fillRect(Math.floor(s/2),1,1,s-2);
      // 铆钉(四角+中)
      ctx.fillStyle = 'rgba(180,180,180,0.6)';
      ctx.fillRect(1,1,1,1); ctx.fillRect(s-2,1,1,1); ctx.fillRect(1,s-2,1,1); ctx.fillRect(s-2,s-2,1,1);
      ctx.fillStyle = 'rgba(220,220,220,0.8)'; ctx.fillRect(Math.floor(s*0.7),Math.floor(s*0.4),1,1);
      break;
    }
    case 'door_stone': {
      // 石门:石质灰底 + 粗犷裂纹 + 中线
      ctx.fillStyle = col; ctx.fillRect(0, 0, s, s);
      ctx.fillStyle = 'rgba(50,50,50,0.4)';
      ctx.fillRect(0,0,s,1); ctx.fillRect(0,s-1,s,1); ctx.fillRect(0,0,1,s); ctx.fillRect(s-1,0,1,s);
      ctx.fillRect(Math.floor(s/2),1,1,s-2);
      // 裂纹(随机暗点)
      ctx.fillStyle = 'rgba(40,40,40,0.3)';
      ctx.fillRect(2,3,1,1); ctx.fillRect(s-3,s-4,1,1); ctx.fillRect(3,s-3,1,1);
      break;
    }
    case 'door_gold': {
      // 金门:金色底 + 华丽金边 + 宝石把手
      ctx.fillStyle = col; ctx.fillRect(0, 0, s, s);
      ctx.fillStyle = 'rgba(180,140,20,0.6)';
      ctx.fillRect(0,0,s,1); ctx.fillRect(0,s-1,s,1); ctx.fillRect(0,0,1,s); ctx.fillRect(s-1,0,1,s);
      ctx.fillRect(Math.floor(s/2),1,1,s-2);
      // 装饰金线
      ctx.fillStyle = 'rgba(255,230,100,0.5)';
      ctx.fillRect(1,2,s-2,1); ctx.fillRect(1,s-3,s-2,1);
      // 宝石把手(红宝石)
      ctx.fillStyle = 'rgba(220,60,60,0.9)'; ctx.fillRect(Math.floor(s*0.7),Math.floor(s*0.4),1,1);
      break;
    }
    case 'door_diamond': {
      // 钻石门:青蓝底 + 晶体纹路 + 钻石把手
      ctx.fillStyle = col; ctx.fillRect(0, 0, s, s);
      ctx.fillStyle = 'rgba(20,120,140,0.5)';
      ctx.fillRect(0,0,s,1); ctx.fillRect(0,s-1,s,1); ctx.fillRect(0,0,1,s); ctx.fillRect(s-1,0,1,s);
      ctx.fillRect(Math.floor(s/2),1,1,s-2);
      // 晶体高光(斜线)
      ctx.fillStyle = 'rgba(180,255,255,0.4)';
      ctx.fillRect(2,2,1,1); ctx.fillRect(3,3,1,1); ctx.fillRect(s-4,s-4,1,1); ctx.fillRect(s-3,s-3,1,1);
      // 钻石把手
      ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fillRect(Math.floor(s*0.7),Math.floor(s*0.4),1,1);
      break;
    }
    case 'wool_black':
      // 羊毛:接近纯色,仅 ~5% 像素加微弱噪点(比默认 18% 干净),适合装饰
      for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
        if (seedRand() < 0.05) {
          const d = (seedRand() - 0.5) * 12;   // 极小幅度,保持扁平纯色感
          ctx.fillStyle = rgbStr(base.r + d, base.g + d, base.b + d);
          ctx.fillRect(x, y, 1, 1);
        }
      }
      break;
    default:
      noise(40);
  }
}

// 构建纹理图集:每种方块占 top/side/bottom 三格(共 N×3 格,横向排列)
const ATLAS_TILE = 16;       // 每格 16 像素
let atlasTexture = null;     // CanvasTexture
let matSolidChunk = null;    // 共享区块实体材质(性能:避免每区块 new)
let matWaterChunk = null;    // 共享水材质
let atlasUV = {};            // type -> { top:[u0,v0,u1,v1], side, bottom } (已归一化到 0..1)

function buildAtlas() {
  const blockList = Object.keys(BLOCK_TYPES);
  const cols = blockList.length;
  const c = document.createElement('canvas');
  c.width = cols * ATLAS_TILE;
  c.height = 3 * ATLAS_TILE; // 行: 0=top 1=side 2=bottom
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  blockList.forEach((type, ci) => {
    // 每种方块用固定种子的伪随机,保证纹理稳定
    let st = (BLOCK_ID[type] * 2654435761) >>> 0;
    const rand = () => { st = (st * 1664525 + 1013904223) >>> 0; return st / 4294967296; };
    const faces = ['top', 'side', 'bottom'];
    faces.forEach((face, ri) => {
      const sub = document.createElement('canvas');
      sub.width = sub.height = ATLAS_TILE;
      const sctx = sub.getContext('2d');
      drawBlockFace(sctx, type, face, ATLAS_TILE, rand);
      ctx.drawImage(sub, ci * ATLAS_TILE, ri * ATLAS_TILE);
    });
    const u0 = (ci * ATLAS_TILE) / c.width;
    const u1 = ((ci + 1) * ATLAS_TILE) / c.width;
    const vTop0 = 0, vTop1 = ATLAS_TILE / c.height;
    const vSide0 = ATLAS_TILE / c.height, vSide1 = (2 * ATLAS_TILE) / c.height;
    const vBot0 = (2 * ATLAS_TILE) / c.height, vBot1 = 1;
    atlasUV[type] = {
      top:    [u0, vTop1, u1, vTop0],  // [u0,v0,u1,v1] 注意纹理 v 朝上,canvas y 朝下
      side:   [u0, vSide1, u1, vSide0],
      bottom: [u0, vBot1, u1, vBot0],
    };
  });

  atlasTexture = new THREE.CanvasTexture(c);
  atlasTexture.magFilter = THREE.NearestFilter;
  atlasTexture.minFilter = THREE.NearestFilter;
  atlasTexture.colorSpace = THREE.SRGBColorSpace;

  // 共享区块材质:所有区块的 solid/water mesh 复用这两个材质,避免每区块 new ~242 个 Material
  matSolidChunk = new THREE.MeshLambertMaterial({ map: atlasTexture, alphaTest: 0.1, transparent: true, vertexColors: true });  // vertexColors:烘焙面色
  // 水用 MeshBasicMaterial(不受光照影响,显示纯清水蓝;Lambert 受法线/光照会压暗变灰)
  matWaterChunk = new THREE.MeshBasicMaterial({ color: 0x2a8fd6, transparent: true, opacity: 0.78, depthWrite: false });
}

// 给图标/手持物用的独立材质(保留旧的单方块材质,用于 UI 图标和手持模型)
let materials = {};
function makeBlockMaterials(type) {
  const def = BLOCK_TYPES[type];
  let st = (BLOCK_ID[type] * 2654435761) >>> 0;
  const rand = () => { st = (st * 1664525 + 1013904223) >>> 0; return st / 4294967296; };

  const faceTex = (face) => makePixelTexture((ctx, s) => drawBlockFace(ctx, type, face, s, rand));
  const top = faceTex('top'), side = faceTex('side'), bottom = faceTex('bottom');
  const M = (map) => new THREE.MeshLambertMaterial({ map });
  if (type === 'leaves') {
    const lm = M(side); lm.transparent = true; lm.alphaTest = 0.1;
    return [lm, lm.clone(), M(top), M(bottom), lm.clone(), lm.clone()];
  }
  return [M(side), M(side), M(top), M(bottom), M(side), M(side)];
}

// ============================================================
// 第四部分:区块系统(核心)
// ============================================================
const CHUNK_SIZE = 16;
const WORLD_HEIGHT = 48;        // 世界最大高度(方块层数)
let RENDER_DISTANCE = 5;  // let:可被设置修改      // 加载半径(chunk 数,不含中心)
const FOG_NEAR = 30;
let FOG_FAR = (RENDER_DISTANCE * CHUNK_SIZE) + 8;  // let:随 RENDER_DISTANCE 设置变化
const SEA_LEVEL = 14;           // 海平面

// 区块存储: key "cx,cz" -> chunk
const chunks = new Map();
// 玩家改动 diff: key "x,y,z" -> type|null(覆盖生成结果)
const modifications = new Map();

function chunkKey(cx, cz) { return `${cx},${cz}`; }
function blockKey(x, y, z) { return `${x},${y},${z}`; }

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
      const height = heightAt(wx, wz, worldSeed, biome, mtn);
      const b = BIOMES[biome];

      for (let y = 0; y <= Math.max(height, SEA_LEVEL); y++) {
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
    }
  }

  // 应用玩家改动 diff
  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      const wx = ox + lx, wz = oz + lz;
      for (let y = 0; y < WORLD_HEIGHT; y++) {
        const mk = blockKey(wx, y, wz);
        if (modifications.has(mk)) {
          const t = modifications.get(mk);
          data[chunkIdx(lx, y, lz)] = t ? BLOCK_ID[t] : 0;
        }
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
function plantTreeAt(wx, baseY, wz, biome) {
  const trunk = 3 + Math.floor(hash3(wx, baseY, wz, worldSeed + 11) * 3);
  const leafType = BLOCK_ID.leaves;
  const trunkType = BLOCK_ID.wood;
  // 写入世界坐标处的方块(跨区块),返回是否实际写入
  const putWorld = (x, y, z, id) => {
    if (y < 0 || y >= WORLD_HEIGHT) return;
    // 玩家改动优先:已被玩家改动的位置不被生成覆盖
    if (modifications.has(blockKey(x, y, z))) return;
    const ccx = Math.floor(x / CHUNK_SIZE), ccz = Math.floor(z / CHUNK_SIZE);
    const ch = chunks.get(chunkKey(ccx, ccz));
    if (!ch) return; // 该区块尚未生成,跳过(会在自己生成时由 plantQueue 处理)
    const lx = x - ccx * CHUNK_SIZE, lz = z - ccz * CHUNK_SIZE;
    const idx = chunkIdx(lx, y, lz);
    // 仅在空气或树叶位置写入(不覆盖树干/地形)
    if (ch.data[idx] === 0 || ch.data[idx] === leafType) ch.data[idx] = id;
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

// 获取/创建 chunk 对象(仅数据,不含 mesh)
function ensureChunk(cx, cz) {
  const key = chunkKey(cx, cz);
  let ch = chunks.get(key);
  if (!ch) {
    ch = { cx, cz, key, data: generateChunkData(cx, cz), mesh: null, meshDirty: true, hasMesh: false };
    chunks.set(key, ch);
    // 本区块生成时积累的待种树:现在本区块数据已就绪,种下
    // 同时检查相邻区块(半径2,树冠最远延伸)中可能伸入本区块的树
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        growTreesInChunk(cx + dx, cz + dz);
      }
    }
    // 新区块出现时,已存在(已构建 mesh)的相邻区块边界面可能需要重算
    markChunkDirty(cx - 1, cz);
    markChunkDirty(cx + 1, cz);
    markChunkDirty(cx, cz - 1);
    markChunkDirty(cx, cz + 1);
  }
  return ch;
}

// 为指定区块内每一列重新计算是否种树并种下(跨区块写树叶)
// 确定性:同 seed 同坐标永远种同样的树,所以多次调用幂等(树叶只在空气/树叶位写入)
function growTreesInChunk(cx, cz) {
  const ch = chunks.get(chunkKey(cx, cz));
  if (!ch) return;
  const ox = cx * CHUNK_SIZE, oz = cz * CHUNK_SIZE;
  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      const wx = ox + lx, wz = oz + lz;
      const biome = biomeAt(wx, wz, worldSeed);
      const b = BIOMES[biome];
      if (b.treeChance <= 0) continue;
      const height = heightAt(wx, wz, worldSeed, biome);
      if (height <= SEA_LEVEL) continue;
      const r = hash2(wx, wz, worldSeed + 999);
      if (r < b.treeChance) plantTreeAt(wx, height, wz, biome);
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
  const lx = x - cx * CHUNK_SIZE, lz = z - cz * CHUNK_SIZE;
  const idx = chunkIdx(lx, y, lz);
  const newId = type ? BLOCK_ID[type] : 0;
  if (ch.data[idx] === newId) return false;
  ch.data[idx] = newId;
  ch.meshDirty = true;
  // 记录改动 diff(用于存档)
  modifications.set(blockKey(x, y, z), type);
  // 相邻 chunk 在边界时也需重建(面剔除跨边界)
  if (lx === 0) markChunkDirty(cx - 1, cz);
  if (lx === CHUNK_SIZE - 1) markChunkDirty(cx + 1, cz);
  if (lz === 0) markChunkDirty(cx, cz - 1);
  if (lz === CHUNK_SIZE - 1) markChunkDirty(cx, cz + 1);
  return true;
}
function markChunkDirty(cx, cz) {
  const ch = chunks.get(chunkKey(cx, cz));
  if (ch) ch.meshDirty = true;
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
function buildChunkMesh(ch) {
  // 按面法线烘焙顶点色(Minecraft 风格:顶亮/侧中/底暗),不依赖光照方向就有立体感
  const FACE_SHADE = [0.86, 0.86, 1.0, 0.55, 0.72, 0.72];  // +x,-x,+y(top),-y(bottom),+z,-z
  const ox = ch.cx * CHUNK_SIZE, oz = ch.cz * CHUNK_SIZE;
  const positions = [], normals = [], uvs = [], indices = [], colors = [];
  const wPositions = [], wNormals = [], wUvs = [], wIndices = []; // 水面/透明

  for (let y = 0; y < WORLD_HEIGHT; y++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const id = ch.data[chunkIdx(lx, y, lz)];
        if (id === 0) continue;
        const type = ID_TO_BLOCK[id];
        const wx = ox + lx, wz = oz + lz;
        const isWater = type === 'water';

        for (let f = 0; f < 6; f++) {
          const F = FACES[f];
          const nbx = wx + F.n[0], nby = y + F.n[1], nbz = wz + F.n[2];
          const neighbor = getBlock(nbx, nby, nbz);
          // 面剔除规则:
          //  - 当前是水:相邻"水"或"固体"都不显示(水内部界面)
          //  - 当前是固体:相邻"固体"不显示;但相邻"水"仍要显示(透过半透明水能看到海底/水边)
          if (neighbor) {
            const ndef = BLOCK_TYPES[neighbor];
            if (isWater) {
              if (ndef.solid || neighbor === 'water') continue;
            } else {
              if (ndef.solid) continue;
            }
          }

          // UV
          const uvBox = atlasUV[type][F.face];
          const [u0, v0, u1, v1] = uvBox;
          const base = F.v;
          // 顶点顺序对应 UV: (u0,v0),(u1,v0),(u1,v1),(u0,v1)
          const faceUV = [[u0, v1], [u1, v1], [u1, v0], [u0, v0]];

          const tgtP = isWater ? wPositions : positions;
          const tgtN = isWater ? wNormals : normals;
          const tgtU = isWater ? wUvs : uvs;
          const tgtI = isWater ? wIndices : indices;
          // 烘焙顶点色(按面方向,非水才加)
          const shade = FACE_SHADE[f];
          const start = tgtP.length / 3;
          for (let k = 0; k < 4; k++) {
            tgtP.push(wx + base[k][0], y + base[k][1], wz + base[k][2]);
            tgtN.push(F.n[0], F.n[1], F.n[2]);
            tgtU.push(faceUV[k][0], faceUV[k][1]);
            if (!isWater) colors.push(shade, shade, shade);
          }
          tgtI.push(start, start + 1, start + 2, start, start + 2, start + 3);
        }
      }
    }
  }

  // 释放旧 mesh
  if (ch.mesh) {
    if (ch.mesh.solid) { scene.remove(ch.mesh.solid); ch.mesh.solid.geometry.dispose(); }
    if (ch.mesh.water) { scene.remove(ch.mesh.water); ch.mesh.water.geometry.dispose(); }
  }
  ch.mesh = {};
  ch.meshDirty = false;
  ch.hasMesh = false;

  const buildGeo = (P, N, U, I, C) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    if (C) g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    g.setIndex(I);
    return g;
  };

  if (positions.length) {
    const m = new THREE.Mesh(buildGeo(positions, normals, uvs, indices, colors), matSolidChunk);
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
    ch.hasMesh = true;
  }
  markRaycastDirty();   // mesh 变化,raycast 目标需重建
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
        if (ch.mesh.water) { scene.remove(ch.mesh.water); ch.mesh.water.geometry.dispose(); }
      }
      chunks.delete(key);
      markRaycastDirty();   // 卸载区块,raycast 目标需重建
    }
  }
  // 清理远离玩家的门(距离 > 渲染范围 + 2 chunk,避免内存泄漏)
  const _doorMaxDist = (RENDER_DISTANCE + 2) * CHUNK_SIZE;
  for (const [key, d] of doors) {
    const dist = Math.max(Math.abs(d.x - playerWX), Math.abs(d.z - playerWZ));
    if (dist > _doorMaxDist) {
      if (d.group) { disposeDoorGroup(d.group); scene.remove(d.group); }
      doors.delete(key);
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

  // 分帧构建 mesh(优先 dirty 且近的)
  let buildLeft = chunkMeshBuildBudget;
  const dirtyList = [];
  for (const ch of chunks.values()) {
    if (ch.meshDirty) dirtyList.push(ch);
  }
  dirtyList.sort((a, b) => {
    const da = (a.cx - pcx) ** 2 + (a.cz - pcz) ** 2;
    const db = (b.cx - pcx) ** 2 + (b.cz - pcz) ** 2;
    return da - db;
  });
  for (const ch of dirtyList) {
    buildChunkMesh(ch);
    if (--buildLeft <= 0) break;
  }
}

// 收集所有 chunk 的 mesh(供 raycast)
let raycastTargets = [];
let raycastTargetsDirty = true;   // 区块 mesh 变化时置脏,animate 仅在脏时重建
function rebuildRaycastTargets() {
  raycastTargets.length = 0;
  for (const ch of chunks.values()) {
    if (ch.mesh && ch.mesh.solid) raycastTargets.push(ch.mesh.solid);
  }
  raycastTargetsDirty = false;
}
function markRaycastDirty() { raycastTargetsDirty = true; }

// ============================================================
// 第七部分:全局状态(玩家/物品/视角,沿用旧逻辑)
// ============================================================
let scene, camera, renderer;
const PLAYER_HEIGHT = 1.8;
const PLAYER_RADIUS = 0.3;
const GRAVITY = 26;
const JUMP_SPEED = 9;
const WALK_SPEED = 5.5;
const FLY_SPEED = 9;

let selected = { kind: 'block', id: 'grass' };
let selectedType = 'grass';
let lastSelectedBlock = 'grass';

let hotbar = [];
const HOTBAR_SIZE = 9;

const keys = {};
let pitch = 0, yaw = 0;
let isFlying = false;
let onGround = false;
let cameraMode = 0;
let playerModel = null;

let holdGroup = null;
let holdItem = null;
let holdSwingT = 0;
let shieldActive = 0;

let breakTargetKey = null;
let breakProgress = 0;
let inventoryOpen = false;

const velocity = new THREE.Vector3();
const playerPos = new THREE.Vector3(0, 30, 0);

// 掉落物(创造模式:仅视觉趣味,无物品栏变动)
const droppedItems = [];
let dropItems = false;   // 默认关,保留创造模式无限物品栏的体验;暂停菜单可切换

// 玩家生命系统(无怪物,先建立基础设施:跌落/溺水伤害 + HUD + 存档)
let playerHP = 20;       // 10 颗心,每心 2 点
let breathTimer = 0;     // 持续在水下憋气计时(秒);浮出水面归零
const lastSafePos = new THREE.Vector3(0, 30, 0);  // 最后安全位置(虚空救援用)
let lastSpaceTime = 0;
let worldSeed = (Math.random() * 4294967296) >>> 0;

const raycaster = new THREE.Raycaster();
raycaster.far = 6;
const screenCenter = new THREE.Vector2(0, 0);
const highlightBox = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1.002, 1.002, 1.002)),
  new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4 })
);

// 云朵系统:扁平白色半透明面片,漂浮在高空,缓慢飘动
const clouds = [];
let cloudGeo = null;
function createClouds() {
  if (cloudGeo) return;   // 幂等:只构建一次几何体
  cloudGeo = new THREE.PlaneGeometry(20, 12);
  const COUNT = 8;
  for (let i = 0; i < COUNT; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide,
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
// userData 契约:{armL, armR, legL, legR, heldMount, walkPhase, swingT}
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
  // 右手挂点(手持物):在手部位置
  const heldMount = new THREE.Group();
  heldMount.position.set(0, -0.46, 0.04);
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
  playerModel.userData = { armL, armR, legL, legR, walkPhase: 0, swingT: 0, heldMount };
  playerModel.visible = false;
  scene.add(playerModel);
}

// ============================================================
// 第九部分:手持物品与工具模型(沿用旧实现)
// ============================================================
// 第一人称手持物容器:挂在相机上(屏幕右下角),本地坐标
function buildHoldGroup() {
  holdGroup = new THREE.Group();
  holdGroup.position.set(0.55, -0.45, -0.85);   // 右下前方
  holdGroup.rotation.set(0, 0, 0);
  camera.add(holdGroup);
  updateHoldItem();
}

// 刷新手持物(FP 屏幕右下 + TP 玩家右手),在 selectSlot 时调用
// 刷新手持物:方块/工具/材料都在 FP(屏幕右下)和 TP(玩家右手)显示
// 在 selectSlot 时调用。默认第1格是方块 → 持续手持显示。
// 刷新手持物:方块/工具/材料都在 FP(屏幕右下)和 TP(玩家右手)显示
function updateHoldItem() {
  if (holdGroup) { while (holdGroup.children.length) holdGroup.remove(holdGroup.children[0]); }
  const heldMount = playerModel ? playerModel.userData.heldMount : null;
  if (heldMount) { while (heldMount.children.length) heldMount.remove(heldMount.children[0]); }

  const item = hotbar[currentSlot];
  if (!item) { holdItem = null; return; }

  let base;
  if (item.kind === 'block') {
    base = new THREE.Mesh(blockGeo, materials[item.id]);   // 1x1x1
  } else if (item.kind === 'tool') {
    base = buildToolMesh(item.id);                          // Group,内部已缩放好
  } else if (item.kind === 'item') {
    base = buildMaterialMesh(item.id);                      // Group
  } else { holdItem = null; return; }

  // 第一人称(屏幕右下)
  if (holdGroup) {
    const fp = base.clone();
    if (item.kind === 'block') { fp.scale.setScalar(0.42); fp.rotation.set(0.2, 0.55, 0); }
    else if (item.kind === 'tool') { fp.scale.setScalar(1.0); fp.rotation.set(0.1, 0.3, 0); }   // 工具保留原尺寸
    else { fp.scale.setScalar(0.6); fp.rotation.set(0.3, 0.6, 0.2); }
    holdGroup.add(fp);
    holdItem = fp;
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
  return g;
}

function buildMaterialMesh(itemId) {
  const def = ITEM_TYPES[itemId];
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: def.color });
  if (def.shape === 'gem') { g.add(new THREE.Mesh(new THREE.OctahedronGeometry(0.14), mat)); }
  else if (def.shape === 'ingot') { g.add(new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.08, 0.14), mat)); }
  else { g.add(new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.3), mat)); }
  g.rotation.set(0.3, 0.6, 0.2);
  g.position.set(0, -0.05, 0);
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
  // 举盾:盾抬到正前方居中
  if (isShield && shieldActive > 0) {
    shieldActive -= dt;
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
// 设计:距离 3.5 米(人物占屏幕较大),相机高度=玩家眼睛+0.5(略俯视),碰撞时拉近
function updateThirdPersonCamera() {
  if (cameraMode === 0) {
    playerModel.visible = false;
    if (camera.fov !== 75) { camera.fov = 75; camera.updateProjectionMatrix(); }
    return;
  }
  playerModel.visible = true;
  // 模型锚点:碰撞盒底(模型 model-space 脚底=0,故脚踩地)
  playerModel.position.set(playerPos.x, playerPos.y - PLAYER_HEIGHT * 0.5, playerPos.z);
  playerModel.rotation.y = yaw;

  // 理想相机位置:玩家身后(或身前),沿水平朝向偏移
  const dist = 3.5;                       // 距离(比旧 6.0 近,人物更大更清晰)
  const dir = cameraMode === 1 ? 1 : -1;  // 1=背后, -1=正面
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  const eyeY = playerPos.y + 0.2;         // 眼睛高度
  // 相机略高于眼睛,自然俯视
  const idealX = playerPos.x - fx * dist * dir;
  const idealZ = playerPos.z - fz * dist * dir;
  const idealY = eyeY + 0.6;

  // 相机碰撞:沿"眼睛→理想位置"步进,遇方块拉近(避免穿墙)
  const clear = raycastCameraClearDist(playerPos.x, eyeY, playerPos.z, idealX, idealY, idealZ);
  const safe = Math.max(0.8, clear);      // 最小 0.8 避免贴脸
  const t = safe / dist;
  camera.position.set(
    playerPos.x + (idealX - playerPos.x) * t,
    eyeY + (idealY - eyeY) * t,
    playerPos.z + (idealZ - playerPos.z) * t
  );
  camera.rotation.order = 'YXZ';
  // 相机朝向:背后视角看玩家背影;正面视角相机转向玩家( yaw+π )
  camera.rotation.y = yaw + (dir < 0 ? Math.PI : 0);
  // 略俯视(-0.15 弧度≈-8.6°)+ 鼠标 pitch 的一半
  camera.rotation.x = -0.15 + pitch * 0.5;
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

// ============================================================
// 第十一部分:初始化
// ============================================================
function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87CEEB);
  scene.fog = new THREE.Fog(0x87CEEB, FOG_NEAR, FOG_FAR);

  camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 1000);

  try {
    renderer = new THREE.WebGLRenderer({ antialias: true });
  } catch (e) {
    showFatalError('无法创建 WebGL 上下文,请使用支持 WebGL 的浏览器(Chrome/Edge/Firefox)。\n\n错误: ' + e.message);
    throw e;
  }
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;   // 色调映射,防止高光过曝,画面更通透
  renderer.toneMappingExposure = 1.0;
  document.body.appendChild(renderer.domElement);

  // 加载设置(音量/FOV/渲染距离)
  loadSettings();
  // 光照(引用保存供昼夜循环动态调整)
  const ambient = new THREE.AmbientLight(0xffffff, 0.42);   // 降低环境光,恢复方块立体感
  scene.add(ambient);
  ambientLight = ambient;
  const sun = new THREE.DirectionalLight(0xffffff, 0.8);
  sun.position.set(60, 90, -40);   // 光线方向对齐太阳视觉位置
  scene.add(sun);
  sunLight = sun;
  const hemi = new THREE.HemisphereLight(0xbfdfff, 0x6b8f3e, 0.25); // 降低半球光
  scene.add(hemi);
  hemiLight = hemi;

  const sunMesh = new THREE.Mesh(new THREE.SphereGeometry(4, 16, 16), new THREE.MeshBasicMaterial({ color: 0xfff2a8, fog: false }));
  sunMesh.position.set(62, 88, -42);   // 太阳球与光线同向
  scene.add(sunMesh);
  sunMeshRef = sunMesh;

  // 月亮:较小、苍白,与太阳相对;夜晚可见(由 updateDayNight 调整可见性)
  const moonMesh = new THREE.Mesh(new THREE.SphereGeometry(2.5, 16, 16), new THREE.MeshBasicMaterial({ color: 0xd8d8e8, fog: false }));
  moonMesh.position.set(-62, 88, 42);
  scene.add(moonMesh);
  moonMeshRef = moonMesh;

  scene.add(highlightBox);

  // 云朵(场景设置完毕后创建,高空扁平半透明面片)
  createClouds();

  // 纹理:图集(区块网格用)+ 单方块材质(UI/手持用)
  buildAtlas();
  for (const t of Object.keys(BLOCK_TYPES)) materials[t] = makeBlockMaterials(t);

  // 生成初始区块(玩家中心区域)
  for (let dx = -2; dx <= 2; dx++)
    for (let dz = -2; dz <= 2; dz++)
      ensureChunk(dx, dz);

  // 建造出生广场(广场+Owen字样+灯塔+树篱+路径,确定性生成)
  buildSpawnPlaza();
  // 广场覆盖的区块(半径22 → ±2 区块)重新生成数据(应用 modifications)+ 重建 mesh
  for (let dx = -2; dx <= 2; dx++)
    for (let dz = -2; dz <= 2; dz++) {
      const ch = chunks.get(chunkKey(dx, dz));
      if (ch) { ch.data = generateChunkData(dx, dz); ch.meshDirty = true; }
    }

  // 构建全部已生成区块的 mesh
  for (const ch of chunks.values()) buildChunkMesh(ch);

  // 出生点固定在广场中心(不用 findSafeSpawn,确保每次都在广场)
  const plazaH = SEA_LEVEL + 6;
  playerPos.set(0.5, plazaH + 1 + PLAYER_HEIGHT * 0.5, 0.5);

  initInventory();
  buildPlayerModel();
  buildHoldGroup();
  buildHotbar();
  updateHPBar();   // 初始化生命条 HUD
}

// 在中心区域找安全出生点
// "Owen" 4 个字母点阵(5×7,1点=1方块)
// "Owen" 4 个字母点阵(5×7,1点=1方块)
const OWEN_FONT = {
  O: ["01110","10001","10001","10001","10001","10001","01110"],
  w: ["10001","10001","10001","10101","10101","10101","01010"],
  e: ["01110","10001","10000","11110","10000","10001","01110"],
  n: ["00000","10001","10001","11001","10101","10011","10001"],
};
const OWEN_TEXT = ['O','w','e','n'];

// 俯视像素艺术点阵
const PIXEL_ART = {
  SMILEY: ["..yyyyy..",".yyyyyyy.","yykyykyy.","yykyykyy.","yyyyyyyyy","yyyyyyyyy","yykyyykyy",".ykkkkky.","..yyyyy.."],
  HEART:  [".rr...rr.","rrrr.rrrr","rrrrrrrrr","rrrrrrrrr",".rrrrrrr.","..rrrrr..","...rrr...","....r...."],
  STAR:   ["....w....","....w....","wwwwwwwww",".wwwwwww.","..wwwww..",".www.www.","www...www","w.......w"],
};

// 出生广场:确定性生成(modifications 记录,存档保留,每次固定)
function buildSpawnPlaza() {
  const plazaR = 28;
  const platH = SEA_LEVEL + 6;
  const set = (x, y, z, t) => { if (y >= 0 && y < WORLD_HEIGHT) modifications.set(blockKey(x, y, z), t); };
  const setArt = (ox, oz, font, colorMap) => {
    for (let row = 0; row < font.length; row++)
      for (let col = 0; col < font[row].length; col++) {
        const ch = font[row][col];
        if (ch !== '.' && ch !== ' ' && colorMap[ch]) set(ox + col, platH, oz + row, colorMap[ch]);
      }
  };

  // 1. 圆形广场地基(草地)+ 石砖环形纹理
  for (let dx = -plazaR; dx <= plazaR; dx++) {
    for (let dz = -plazaR; dz <= plazaR; dz++) {
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d <= plazaR) {
        for (let y = 0; y <= platH; y++) {
          let t = 'stone';
          if (y === platH) t = 'grass';
          else if (y >= platH - 3) t = 'dirt';
          set(dx, y, dz, t);
        }
        if (d > plazaR - 3) set(dx, platH, dz, 'stone');
        else if (d > plazaR - 6) set(dx, platH, dz, 'planks');
      }
    }
  }

  // 2. 中央 Owen 字样(木板底座 + 树叶字)
  const padR = 11;
  for (let dx = -padR; dx <= padR; dx++)
    for (let dz = -4; dz <= 4; dz++)
      if (dx * dx + dz * dz * 4 <= padR * padR) { set(dx, platH, dz, 'planks'); set(dx, platH + 1, dz, null); }
  const cellW = 5, cellH = 7, gap = 2;
  const startX = -((OWEN_TEXT.length * cellW + (OWEN_TEXT.length - 1) * gap) / 2 | 0);
  const startZ = -((cellH) / 2 | 0);
  for (let ci = 0; ci < OWEN_TEXT.length; ci++) {
    const font = OWEN_FONT[OWEN_TEXT[ci]];
    const ox = startX + ci * (cellW + gap);
    for (let row = 0; row < cellH; row++)
      for (let col = 0; col < cellW; col++)
        if (font[row][col] === '1') set(ox + col, platH + 1, startZ + row, 'leaves');
  }

  // 3. 四角灯塔
  const tR = plazaR - 4;
  for (const [tx, tz] of [[tR,tR],[-tR,tR],[tR,-tR],[-tR,-tR]]) {
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) set(tx + dx, platH + 1, tz + dz, 'stone');
    for (let h = 2; h <= 5; h++) set(tx, platH + h, tz, 'brick');
    set(tx, platH + 6, tz, 'wood');
    set(tx, platH + 3, tz, 'leaves');
  }

  // 4. 环形树篱
  for (let a = 0; a < 360; a += 15) {
    const tx = Math.round(Math.cos(a * Math.PI / 180) * plazaR);
    const tz = Math.round(Math.sin(a * Math.PI / 180) * plazaR);
    set(tx, platH + 1, tz, 'wood'); set(tx, platH + 2, tz, 'wood');
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) set(tx + dx, platH + 3, tz + dz, 'leaves');
    set(tx, platH + 4, tz, 'leaves');
  }

  // 5. 南北入口路径
  for (let d = plazaR + 1; d <= plazaR + 8; d++) for (let w = -1; w <= 1; w++) { set(w, platH, d, 'planks'); set(w, platH, -d, 'planks'); }

  // 6. 俯视像素艺术(广场外围,增加趣味)
  // 像素艺术改用纯色羊毛:更鲜艳干净(SMILEY 黄+黑,HEART 红,STAR 白)
  setArt(-15, plazaR - 14, PIXEL_ART.SMILEY, { y: 'wool_yellow', k: 'wool_black' });
  setArt(  6, plazaR - 14, PIXEL_ART.HEART,  { r: 'wool_red' });
  setArt(-15, -(plazaR - 6), PIXEL_ART.HEART, { r: 'wool_red' });
  setArt(  6, -(plazaR - 6), PIXEL_ART.STAR,  { w: 'wool_white' });
  setArt(-(plazaR - 6), -5, PIXEL_ART.SMILEY, { y: 'wool_yellow', k: 'wool_black' });
  setArt(  plazaR - 6,  -5, PIXEL_ART.STAR,  { w: 'wool_white' });

  // 7. 中心喷泉(广场正中央偏东,Owen 字样前方):圆形水池 + 中央石柱水花
  const fx = 0, fz = 8;   // 喷泉中心(字样南侧)
  for (let dx = -2; dx <= 2; dx++) {
    for (let dz = -2; dz <= 2; dz++) {
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d <= 2) {
        set(fx + dx, platH, fz + dz, 'water');     // 水池
        set(fx + dx, platH + 1, fz + dz, null);     // 水面上方留空
      }
      if (d > 1.5 && d <= 2.5) set(fx + dx, platH, fz + dz, 'stone'); // 石沿
    }
  }
  // 中央石柱(喷泉核心)
  set(fx, platH + 1, fz, 'stone');
  set(fx, platH + 2, fz, 'stone');
  set(fx, platH + 3, fz, 'water');   // 柱顶"水花"
  set(fx, platH + 4, fz, 'water');

  // 8. 四向拱门(南北路径入口处,标志性建筑)
  // 拱门:两根石柱 + 顶部横梁(木板),框住路径
  const archZ = [plazaR + 1, -(plazaR + 1)];   // 南北各一个
  for (const az of archZ) {
    for (let h = 1; h <= 4; h++) {
      set(-2, platH + h, az, 'stone');    // 左柱
      set(2, platH + h, az, 'stone');     // 右柱
    }
    set(-1, platH + 4, az, 'planks'); set(0, platH + 4, az, 'planks'); set(1, platH + 4, az, 'planks'); // 横梁
    set(0, platH + 5, az, 'leaves');      // 横梁装饰
  }

  // 9. 蘑菇装饰(广场内散布几个红白蘑菇):菌柄 wood + 菌盖 leaves/brick
  const mushrooms = [[-10, 4], [12, -4], [-8, -10], [10, 12]];
  for (const [mx, mz] of mushrooms) {
    set(mx, platH + 1, mz, 'wood');        // 菌柄
    set(mx, platH + 2, mz, 'wood');
    set(mx, platH + 3, mz, 'wool_red');    // 菌盖中心红(纯色羊毛)
    set(mx + 1, platH + 3, mz, 'wool_red'); set(mx - 1, platH + 3, mz, 'wool_red');
    set(mx, platH + 3, mz + 1, 'wool_red'); set(mx, platH + 3, mz - 1, 'wool_red');
    set(mx, platH + 4, mz, 'snow');        // 菌盖顶白点
  }

  // 10. 花坛(广场内环形小花坛,leaves 围圈 + 中心 sand)
  const flowers = [[-12, -6], [13, 8], [4, -12], [-4, 13]];
  for (const [flx, flz] of flowers) {
    for (let a = 0; a < 360; a += 60) {
      const r = 1.5;
      const px = Math.round(flx + Math.cos(a * Math.PI / 180) * r);
      const pz = Math.round(flz + Math.sin(a * Math.PI / 180) * r);
      set(px, platH + 1, pz, 'leaves');    // 花叶围边
    }
    set(flx, platH + 1, flz, 'sand');      // 花坛中心沙
    set(flx, platH + 2, flz, 'leaves');    // 中心一朵花
  }

  // 11. 旗杆(广场东西两侧):高木杆 + 顶部砖旗
  for (const [gx, gz] of [[plazaR - 8, 0], [-(plazaR - 8), 0]]) {
    for (let h = 1; h <= 6; h++) set(gx, platH + h, gz, 'wood');   // 旗杆
    set(gx + 1, platH + 6, gz, 'brick');   // 旗帜(飘向东)
    set(gx + 1, platH + 5, gz, 'brick');
  }

  // 12. 起伏小山丘(广场南侧外围,地形层次):用 dirt/grass 堆几个圆丘
  const hills = [[0, plazaR + 6], [10, plazaR + 8], [-10, plazaR + 8]];
  for (const [hx, hz] of hills) {
    for (let dx = -3; dx <= 3; dx++) {
      for (let dz = -3; dz <= 3; dz++) {
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d <= 3) {
          const h = Math.round(3 - d);     // 中心高,边缘低
          for (let y = 1; y <= h; y++) set(hx + dx, platH + y, hz + dz, y === h ? 'grass' : 'dirt');
        }
      }
    }
  }
}


// 寻找安全出生点:返回 {x, y, z},y 是脚下方块的 y(玩家站在 y+1 上)
// 必须是干燥陆地(海平面之上)、非树叶/木头/水、有实地支撑、头顶两格空
function findSafeSpawn() {
  const isDryGround = (x, y, z) => {
    if (y <= SEA_LEVEL) return false;
    const b = getBlock(x, y, z);
    if (!b) return false;
    if (b === 'leaves' || b === 'wood' || b === 'water') return false;
    if (!isSolidAt(x, y - 1, z)) return false;
    return true;
  };
  const tryAt = (x, z) => {
    ensureChunk(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE));
    for (let y = WORLD_HEIGHT - 1; y >= 1; y--) {
      if (isDryGround(x, y, z) && !isSolidAt(x, y + 1, z) && !isSolidAt(x, y + 2, z)) return { x, y, z };
    }
    return null;
  };
  // 原点优先(广场中心),螺旋向外搜
  const origin = tryAt(0, 0);
  if (origin) return origin;
  for (let r = 1; r <= 48; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (const dz of [-r, r]) { const s = tryAt(dx, dz); if (s) return s; }
    }
    for (let dz = -r + 1; dz <= r - 1; dz++) {
      for (const dx of [-r, r]) { const s = tryAt(dx, dz); if (s) return s; }
    }
  }
  return { x: 0, y: SEA_LEVEL + 1, z: 0 };
}

function clearWorld() {
  for (const ch of chunks.values()) {
    if (ch.mesh) {
      if (ch.mesh.solid) { scene.remove(ch.mesh.solid); ch.mesh.solid.geometry.dispose(); }
      if (ch.mesh.water) { scene.remove(ch.mesh.water); ch.mesh.water.geometry.dispose(); }
    }
  }
  chunks.clear();
  modifications.clear();
  for (const a of arrows) scene.remove(a);
  arrows.length = 0;
  clearDroppedItems();   // 清掉落物,避免旧世界残留
  breakTargetKey = null; breakProgress = 0;
  hideBreakOverlay();
  // 清理粒子/农作物计时器(避免跨世界残留)
  for (const pt of particles) { scene.remove(pt); pt.material.dispose(); }
  particles.length = 0;
  cropTimers.clear();
  clearDoors();
}

function resetWorld() {
  clearWorld();
  // 固定种子:重置仍回到同一个出生广场场景(不换随机种子)
  velocity.set(0, 0, 0);
  isFlying = false;
  yaw = 0; pitch = 0;
  // 重置瞬态状态,避免新世界继承旧世界的落地/入水边沿误触发
  wasOnGround = false;
  wasInWater = false;
  // 关键:清除"脏"标记并刷新自动保存计时,确保新世界不会在 30 秒后被
  // scheduleAutosave 静默覆盖旧存档(否则"重置不覆盖存档"的保护失效)。
  // 玩家在新世界手动编辑后才会再次标记脏,由手动保存/暂停时保存覆盖。
  saveDirty = false;
  lastAutosaveTime = performance.now();
  if (autosaveTimer) { clearTimeout(autosaveTimer); autosaveTimer = null; }
  currentSaveId = null;           // 重置世界:不关联任何存档(新游戏)
  initInventory();              // 重置快捷栏
  buildHotbar();
  playerHP = PLAYER_MAX_HP; breathTimer = 0; updateHPBar();   // 重置生命
  for (let dx = -2; dx <= 2; dx++)
    for (let dz = -2; dz <= 2; dz++)
      ensureChunk(dx, dz);
  // 固定生成出生广场(确保重置后仍有广场场景)
  buildSpawnPlaza();
  // 广场覆盖区块重新生成数据(应用 modifications)+ 重建 mesh
  for (let dx = -2; dx <= 2; dx++)
    for (let dz = -2; dz <= 2; dz++) {
      const ch = chunks.get(chunkKey(dx, dz));
      if (ch) { ch.data = generateChunkData(dx, dz); ch.meshDirty = true; }
    }
  for (const ch of chunks.values()) buildChunkMesh(ch);
  // 出生点固定在广场中心(原点)
  const plazaH = SEA_LEVEL + 6;
  playerPos.set(0.5, plazaH + 1 + PLAYER_HEIGHT * 0.5, 0.5);  // 精确站在广场表面(无余量)
  yaw = 0; pitch = 0;
  updateInfoCount();
  showToast('已重置到出生广场');
}

// ============================================================
// 第十二部分:快捷栏 / 背包(沿用旧实现)
// ============================================================
function initInventory() {
  hotbar = HOTBAR_ORDER.map(id => ({ kind: 'block', id }));
  while (hotbar.length < HOTBAR_SIZE) hotbar.push(null);
  hotbar[8] = { kind: 'tool', id: 'pickaxe_wood', durability: TOOL_TYPES.pickaxe_wood.durability };
  selectSlot(0);
}

// 方块图标的伪 3D 等距渲染:顶面(亮)+ 右侧面(中)+ 左侧面(暗),模拟立体感
function drawBlockIcon3D(ctx, id, size) {
  const def = BLOCK_TYPES[id];
  const topTex = materials[id][2].map, sideTex = materials[id][1].map;
  if (!topTex || !topTex.image || !sideTex || !sideTex.image) return;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  // 等距菱形顶面:用变换把方形纹理压成菱形。简化:画三层平行四边形。
  const cx = size / 2, topY = size * 0.12, midY = size * 0.46, botY = size * 0.88;
  const halfW = size * 0.42;
  // 顶面(亮):菱形,贴顶面纹理后整体提亮
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx, topY); ctx.lineTo(cx + halfW, midY); ctx.lineTo(cx, midY + (midY - topY)); ctx.lineTo(cx - halfW, midY); ctx.closePath();
  ctx.clip();
  ctx.drawImage(topTex.image, cx - halfW, topY, halfW * 2, (midY - topY) * 2);
  ctx.restore();
  // 右侧面(中暗):贴侧面纹理 + 半透明黑遮罩
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx, midY); ctx.lineTo(cx + halfW, midY); ctx.lineTo(cx + halfW, botY - (midY - topY)); ctx.lineTo(cx, botY); ctx.closePath();
  ctx.clip();
  ctx.drawImage(sideTex.image, cx, midY, halfW, botY - midY);
  ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(cx, midY, halfW, botY - midY);
  ctx.restore();
  // 左侧面(更暗)
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx, midY); ctx.lineTo(cx - halfW, midY); ctx.lineTo(cx - halfW, botY - (midY - topY)); ctx.lineTo(cx, botY); ctx.closePath();
  ctx.clip();
  ctx.drawImage(sideTex.image, cx - halfW, midY, halfW, botY - midY);
  ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(cx - halfW, midY, halfW, botY - midY);
  ctx.restore();
  ctx.restore();
}

function drawItemIcon(item, cv) {
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, cv.width, cv.height);
  if (!item) return;
  if (item.kind === 'block') {
    drawBlockIcon3D(ctx, item.id, cv.width);
  } else if (item.kind === 'tool') {
    drawToolIcon(ctx, item.id, cv.width);
  } else if (item.kind === 'item') {
    drawMaterialIcon(ctx, item.id, cv.width);
  }
}

function tierColorOf(tier) {
  return ({ wood: '#8a6430', stone: '#9a9a9a', iron: '#d8d8e0', gold: '#ffd54a', diamond: '#5fe3e8' })[tier] || '#888';
}

function drawToolIcon(ctx, toolId, size) {
  const def = TOOL_TYPES[toolId];
  const tc = tierColorOf(def.tier);
  const handleColor = '#6e4f2a';
  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (def.tool === 'sword') {
    ctx.strokeStyle = handleColor; ctx.lineWidth = size * 0.12;
    ctx.beginPath(); ctx.moveTo(0, size * 0.34); ctx.lineTo(0, size * 0.05); ctx.stroke();
    ctx.strokeStyle = '#5a4030'; ctx.lineWidth = size * 0.08;
    ctx.beginPath(); ctx.moveTo(-size * 0.14, size * 0.05); ctx.lineTo(size * 0.14, size * 0.05); ctx.stroke();
    ctx.fillStyle = tc; ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-size * 0.07, size * 0.03); ctx.lineTo(size * 0.07, size * 0.03);
    ctx.lineTo(0, -size * 0.4); ctx.closePath(); ctx.fill(); ctx.stroke();
  } else if (def.tool === 'bow') {
    ctx.strokeStyle = handleColor; ctx.lineWidth = size * 0.1;
    ctx.beginPath(); ctx.arc(size * 0.12, 0, size * 0.34, Math.PI * 0.62, Math.PI * 1.38); ctx.stroke();
    ctx.strokeStyle = '#e8e8e8'; ctx.lineWidth = 1.5;
    const a1 = Math.PI * 0.62, a2 = Math.PI * 1.38;
    ctx.beginPath();
    ctx.moveTo(size * 0.12 + Math.cos(a1) * size * 0.34, Math.sin(a1) * size * 0.34);
    ctx.lineTo(size * 0.12 + Math.cos(a2) * size * 0.34, Math.sin(a2) * size * 0.34); ctx.stroke();
    ctx.strokeStyle = '#caa472'; ctx.lineWidth = size * 0.05;
    ctx.beginPath(); ctx.moveTo(-size * 0.22, 0); ctx.lineTo(size * 0.2, 0); ctx.stroke();
  } else if (def.tool === 'shield') {
    ctx.fillStyle = tc; ctx.strokeStyle = '#3a3a3a'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-size * 0.3, -size * 0.34); ctx.lineTo(size * 0.3, -size * 0.34);
    ctx.lineTo(size * 0.3, size * 0.1);
    ctx.quadraticCurveTo(size * 0.3, size * 0.36, 0, size * 0.38);
    ctx.quadraticCurveTo(-size * 0.3, size * 0.36, -size * 0.3, size * 0.1);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(-size * 0.04, -size * 0.2, size * 0.08, size * 0.32);
    ctx.fillRect(-size * 0.12, -size * 0.06, size * 0.24, size * 0.08);
  } else {
    ctx.strokeStyle = handleColor; ctx.lineWidth = size * 0.12;
    ctx.beginPath(); ctx.moveTo(size * 0.32, size * 0.32); ctx.lineTo(-size * 0.3, -size * 0.3); ctx.stroke();
    ctx.fillStyle = tc; ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1;
    if (def.tool === 'pickaxe') {
      ctx.lineWidth = size * 0.1; ctx.strokeStyle = tc;
      for (const a of [-1.0, -Math.PI / 2, -2.14]) {
        ctx.beginPath(); ctx.moveTo(0, -size * 0.28);
        ctx.lineTo(Math.cos(a) * size * 0.32, Math.sin(a) * size * 0.32 - size * 0.28); ctx.stroke();
      }
    } else if (def.tool === 'axe') {
      ctx.beginPath();
      ctx.moveTo(0, -size * 0.42); ctx.lineTo(size * 0.28, -size * 0.28);
      ctx.lineTo(size * 0.18, -size * 0.08); ctx.lineTo(-size * 0.08, -size * 0.2);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(-size * 0.12, -size * 0.42); ctx.lineTo(size * 0.12, -size * 0.42);
      ctx.lineTo(size * 0.14, -size * 0.12); ctx.lineTo(-size * 0.14, -size * 0.12);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  }
  ctx.restore();
}

function drawMaterialIcon(ctx, itemId, size) {
  const def = ITEM_TYPES[itemId];
  if (!def) return;
  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1;
  if (def.shape === 'gem') {
    ctx.fillStyle = def.color;
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.34); ctx.lineTo(size * 0.26, 0);
    ctx.lineTo(0, size * 0.34); ctx.lineTo(-size * 0.26, 0);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.28); ctx.lineTo(size * 0.1, -size * 0.05);
    ctx.lineTo(-size * 0.1, -size * 0.05); ctx.closePath(); ctx.fill();
  } else if (def.shape === 'ingot') {
    ctx.fillStyle = def.color;
    ctx.beginPath();
    ctx.moveTo(-size * 0.3, size * 0.16); ctx.lineTo(size * 0.3, size * 0.16);
    ctx.lineTo(size * 0.22, -size * 0.16); ctx.lineTo(-size * 0.22, -size * 0.16);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(-size * 0.18, -size * 0.12, size * 0.36, size * 0.06);
  } else {
    ctx.strokeStyle = def.color; ctx.lineWidth = size * 0.06;
    ctx.beginPath(); ctx.moveTo(-size * 0.28, size * 0.2); ctx.lineTo(size * 0.22, -size * 0.22); ctx.stroke();
    ctx.fillStyle = '#9a9a9a';
    ctx.beginPath();
    ctx.moveTo(size * 0.22, -size * 0.22); ctx.lineTo(size * 0.1, -size * 0.28);
    ctx.lineTo(size * 0.28, -size * 0.1); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillRect(-size * 0.3, size * 0.16, size * 0.1, size * 0.04);
  }
  ctx.restore();
}

function buildHotbar() {
  const bar = document.getElementById('hotbar');
  bar.innerHTML = '';
  for (let i = 0; i < HOTBAR_SIZE; i++) {
    const item = hotbar[i];
    const slot = document.createElement('div');
    slot.className = 'slot' + (i === currentSlot ? ' active' : '');
    slot.dataset.slot = i;
    slot.innerHTML = `<span class="num">${i + 1}</span><span class="name">${itemName(item)}</span>`;
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    slot.appendChild(cv);
    drawItemIcon(item, cv);
    if (item && item.kind === 'tool') {
      const bar2 = document.createElement('div');
      bar2.className = 'dur';
      const ratio = item.durability / TOOL_TYPES[item.id].durability;
      bar2.innerHTML = `<span style="width:${Math.max(0, ratio) * 100}%;background:${ratio > 0.5 ? '#5fd35f' : ratio > 0.2 ? '#e0c040' : '#d35f5f'}"></span>`;
      slot.appendChild(bar2);
    }
    slot.addEventListener('click', () => selectSlot(i));
    bar.appendChild(slot);
  }
}

function itemName(item) {
  if (!item) return '(空)';
  if (item.kind === 'block') return BLOCK_TYPES[item.id].name;
  if (item.kind === 'tool') return TOOL_TYPES[item.id].name;
  if (item.kind === 'item') {
    const n = item.count || 1;
    return ITEM_TYPES[item.id].name + (n > 1 ? ` ×${n}` : '');
  }
  return '?';
}

let currentSlot = 0;
function selectSlot(i) {
  if (i < 0 || i >= HOTBAR_SIZE || !Number.isInteger(i)) return;
  currentSlot = i;
  const item = hotbar[i];
  if (item) {
    selected = { ...item };
    if (item.kind === 'block') { selectedType = item.id; lastSelectedBlock = item.id; }
  }
  document.querySelectorAll('#hotbar .slot').forEach(s => {
    s.classList.toggle('active', +s.dataset.slot === i);
  });
  updateHoldItem();
}

function putInSlot(i, item) {
  if (i < 0 || i >= HOTBAR_SIZE || !Number.isInteger(i)) return;
  hotbar[i] = item;
  buildHotbar();
  if (i === currentSlot) selectSlot(i);
  markDirtySave();
}

// ============================================================
// 第十三部分:输入(沿用旧实现 + 音频初始化钩子)
// ============================================================
function setupInput() {
  addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
    keys[e.code] = true;
    if (inventoryOpen) {
      if (e.code === 'KeyE' || e.code === 'Escape') toggleInventory(false);
      return;
    }
    if (e.code.startsWith('Digit')) {
      const n = parseInt(e.code.slice(5)) - 1;
      if (n >= 0 && n < HOTBAR_SIZE) selectSlot(n);
    }
    if (e.code === 'Space') {
      const now = performance.now();
      if (now - lastSpaceTime < 300) isFlying = !isFlying;
      lastSpaceTime = now;
    }
    if (e.code === 'F5') { e.preventDefault(); cycleCameraMode(); }
    if (e.code === 'KeyE') toggleInventory(true);
    if (e.code === 'KeyQ') { hotbar[currentSlot] = null; buildHotbar(); updateHoldItem(); showToast('空手'); markDirtySave(); }
  });
  addEventListener('keyup', (e) => { keys[e.code] = false; });

  const overlay = document.getElementById('overlay');
  const pauseMenu = document.getElementById('pause-menu');
  let gameStarted = false;

  function enterGame() {
    // 1. 最重要:先隐藏开始遮罩(无论后续音频/锁定是否成功,游戏都能进入)
    overlay.classList.add('hidden');
    const pm = document.getElementById('pause-menu');
    if (pm) pm.classList.add('hidden');
    // 2. 尝试锁定鼠标指针(失败不影响游戏,只是不能用鼠标转视角)
    if (renderer) {
      try {
        const p = renderer.domElement.requestPointerLock();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch (e) {}
    }
    // 3. 初始化音频(失败静默,不影响游戏)
    try { audio.init(); } catch (e) {}
  }

  overlay.addEventListener('click', () => {
    if (!gameStarted) gameStarted = true;
    overlay.classList.add('hidden');   // 直接隐藏开始遮罩(不依赖 pointer lock)
    enterGame();                        // 尝试锁定指针(失败也不影响进入)
  });

  // 继续上次游戏入口(若有存档)
  const cont = document.getElementById('btn-continue');
  if (cont) cont.addEventListener('click', (e) => {
    e.stopPropagation();
    loadGame().then(ok => {
      if (ok) { if (!gameStarted) gameStarted = true; enterGame(); }
      else showToast('没有存档,开始新世界');
    });
  });

  document.addEventListener('pointerlockchange', () => {
    const locked = document.pointerLockElement === renderer.domElement;
    if (!locked) for (const code in keys) keys[code] = false;
    if (locked) {
      overlay.classList.add('hidden');
      pauseMenu.classList.add('hidden');
    } else if (gameStarted && !inventoryOpen) {
      pauseMenu.classList.remove('hidden');
      autosave(true);
    }
  });

  document.getElementById('btn-resume').addEventListener('click', enterGame);
  document.getElementById('btn-reset').addEventListener('click', () => {
    resetWorld();
    enterGame();
  });
  // 暂停菜单:音效快捷开关 + 设置面板入口
  const btnSettings = document.getElementById('btn-settings');
  if (btnSettings) btnSettings.addEventListener('click', openSettingsPanel);
  const btnEmpty = document.getElementById('btn-empty-hand');
  if (btnEmpty) btnEmpty.addEventListener('click', () => {
    hotbar[currentSlot] = null; buildHotbar(); updateHoldItem(); showToast('已清空当前手持(空手)');
  });
  document.getElementById('btn-controls').addEventListener('click', () => {
    document.getElementById('pause-controls').classList.toggle('hidden');
  });
  // 存档按钮

  const btnLoad = document.getElementById('btn-load');
  if (btnLoad) btnLoad.addEventListener('click', () => {
    loadGame().then(ok => {
      if (ok) { showToast('已读取,点击继续游戏'); document.getElementById('pause-menu').classList.remove('hidden'); }
      else showToast('没有存档');
    });
  });

  // ---------- 设置面板 ----------
  const setPanel = document.getElementById('settings-panel');
  const setSound = document.getElementById('set-sound');
  const setVolume = document.getElementById('set-volume');
  const setRender = document.getElementById('set-render');
  const setDrops = document.getElementById('set-drops');
  const setDN = document.getElementById('set-daynight');
  const setDNSpeed = document.getElementById('set-dayspeed');
  const setDNTime = document.getElementById('set-daytime');
  const setDNTimeLabel = document.getElementById('set-daytime-label');
  const setClose = document.getElementById('set-close');
  const daynightControls = document.getElementById('daynight-controls');

  function dayTimeToLabel(t) {
    const totalMin = Math.floor(t * 24 * 60);
    const h = Math.floor(totalMin / 60) % 24;
    const m = totalMin % 60;
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }
  function refreshSettingsUI() {
    if (setSound) setSound.textContent = settings.soundEnabled ? '开' : '关';
    if (setVolume) setVolume.value = Math.round(settings.volume * 100);
    if (setRender) setRender.value = String(settings.renderDist);
    if (setDrops) setDrops.textContent = settings.dropItems ? '开' : '关';
    if (setDN) {
      setDN.textContent = settings.dayNightEnabled ? '开' : '关';
      if (daynightControls) {
        daynightControls.style.opacity = settings.dayNightEnabled ? '1' : '0.4';
        daynightControls.style.pointerEvents = settings.dayNightEnabled ? '' : 'none';  // 禁用交互
      }
    }
    if (setDNSpeed) setDNSpeed.value = String(settings.dayCycleSpeed);
    if (setDNTime) { setDNTime.value = Math.round(dayTime * 100); if (setDNTimeLabel) setDNTimeLabel.textContent = dayTimeToLabel(dayTime); }
  }
  function openSettingsPanel() {
    if (document.pointerLockElement) document.exitPointerLock();
    if (setPanel) { setPanel.classList.remove('hidden'); refreshSettingsUI(); }
  }
  if (setSound) setSound.addEventListener('click', () => {
    settings.soundEnabled = !settings.soundEnabled;
    audio.enabled = settings.soundEnabled;
    if (audio.masterGain) audio.masterGain.gain.value = settings.soundEnabled ? settings.volume : 0;
    saveSettings(); refreshSettingsUI();
  });
  if (setVolume) setVolume.addEventListener('input', () => {
    settings.volume = parseInt(setVolume.value) / 100;
    audio.volume = settings.volume;  // 同步 audio.volume(避免 btn-sound 读旧值)
    if (audio.masterGain && settings.soundEnabled) audio.masterGain.gain.value = settings.volume;
    saveSettings();
  });
  if (setRender) setRender.addEventListener('change', () => {
    settings.renderDist = parseInt(setRender.value);
    RENDER_DISTANCE = Math.max(1, settings.renderDist | 0);
    FOG_FAR = (RENDER_DISTANCE * CHUNK_SIZE) + 8;
    saveSettings();
  });
  if (setDrops) setDrops.addEventListener('click', () => {
    settings.dropItems = !settings.dropItems;
    dropItems = settings.dropItems;
    saveSettings(); refreshSettingsUI();
  });
  if (setDN) setDN.addEventListener('click', () => {
    settings.dayNightEnabled = !settings.dayNightEnabled;
    saveSettings(); refreshSettingsUI();
  });
  if (setDNSpeed) setDNSpeed.addEventListener('change', () => {
    settings.dayCycleSpeed = parseInt(setDNSpeed.value);
    saveSettings();
  });
  if (setDNTime) setDNTime.addEventListener('input', () => {
    dayTime = parseInt(setDNTime.value) / 100;
    if (setDNTimeLabel) setDNTimeLabel.textContent = dayTimeToLabel(dayTime);
  });
  if (setClose) setClose.addEventListener('click', () => {
    if (setPanel) setPanel.classList.add('hidden');
    // 刷新暂停菜单标签(与设置面板同步)
    const bs2 = document.getElementById('btn-sound');
    if (bs2) bs2.textContent = '音效:' + (settings.soundEnabled ? '开' : '关');
    const bd2 = document.getElementById('btn-drops');
    if (bd2) bd2.textContent = '掉落物:' + (settings.dropItems ? '开' : '关');
    saveSettings();
  });

// 存档管理面板
  const btnMgr = document.getElementById('btn-mgr');
  const saveMgr = document.getElementById('save-manager');
  const btnMgrClose = document.getElementById('btn-mgr-close');
  const btnSaveNew = document.getElementById('btn-save-new');
  if (btnMgr) btnMgr.addEventListener('click', () => { if (document.pointerLockElement) document.exitPointerLock(); openSaveManager(); });
  if (btnMgrClose) btnMgrClose.addEventListener('click', () => { saveMgr.classList.add('hidden'); });
  if (btnSaveNew) btnSaveNew.addEventListener('click', () => {
    const name = '存档 ' + new Date().toLocaleString('zh-CN', {month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
    saveSlot(name).then(id => { if (id) { showToast('已保存为新存档'); openSaveManager(); } else showToast('保存失败'); });
  });
  // 保存到新存档(暂停菜单的 btn-save)
  const btnSave2 = document.getElementById('btn-save');
  if (btnSave2) btnSave2.addEventListener('click', () => {
    const name = '存档 ' + new Date().toLocaleString('zh-CN', {month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
    saveSlot(name).then(id => { showToast(id ? '已保存为新存档 #'+id : '保存失败'); });
  });

  // 音效开关
  const btnSound = document.getElementById('btn-sound');
  if (btnSound) btnSound.addEventListener('click', () => {
    audio.enabled = !audio.enabled;
    if (audio.masterGain) audio.masterGain.gain.value = audio.enabled ? settings.volume : 0;
    settings.soundEnabled = audio.enabled;
    btnSound.textContent = '音效:' + (audio.enabled ? '开' : '关');
    saveSettings();
  });
  // 掉落物开关(创造模式:默认关,避免影响无限物品栏体验)
  const btnDrops = document.getElementById('btn-drops');
  if (btnDrops) btnDrops.addEventListener('click', () => {
    dropItems = !dropItems;
    btnDrops.textContent = '掉落物:' + (dropItems ? '开' : '关');
    settings.dropItems = dropItems;
    saveSettings();
    showToast('掉落物已' + (dropItems ? '开启' : '关闭'));
  });

  document.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement !== renderer.domElement) return;
    yaw -= e.movementX * 0.0025;
    pitch -= e.movementY * 0.0025;
    pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, pitch));
  });

  renderer.domElement.addEventListener('mousedown', (e) => {
    if (document.pointerLockElement !== renderer.domElement) return;
    if (e.button === 0) breakBlock();
    else if (e.button === 2) placeBlock();
  });
  renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

  addEventListener('wheel', (e) => {
    if (document.pointerLockElement !== renderer.domElement) return;
    let next = currentSlot + (e.deltaY > 0 ? 1 : -1);
    next = (next + HOTBAR_SIZE) % HOTBAR_SIZE;
    selectSlot(next);
  });


  // ---------- 移动端触屏 ----------
  const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  if (isTouch) {
    const tc = document.getElementById('touch-controls');
    if (tc) tc.style.display = '';
    // 摇杆
    const joy = document.getElementById('joystick');
    const knob = document.getElementById('joystick-knob');
    let joyActive = false, joyDX = 0, joyDZ = 0;
    if (joy) {
      const onStart = (e) => { joyActive = true; e.preventDefault(); };
      const onMove = (e) => {
        if (!joyActive) return;
        const t = e.touches ? e.touches[0] : e;
        const r = joy.getBoundingClientRect();
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        let dx = t.clientX - cx, dy = t.clientY - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const max = 40;
        if (dist > max) { dx = dx / dist * max; dy = dy / dist * max; }
        if (knob) knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
        joyDX = dx / max; joyDZ = dy / max;
        e.preventDefault();
      };
      const onEnd = () => { joyActive = false; joyDX = 0; joyDZ = 0; if (knob) knob.style.transform = ''; };
      joy.addEventListener('touchstart', onStart, { passive: false });
      joy.addEventListener('touchmove', onMove, { passive: false });
      joy.addEventListener('touchend', onEnd);
    }
    // 摇杆驱动移动(在 updatePlayer 里读 touchMove)
    window.__touchMove = () => { return { x: joyDX, z: joyDZ }; };
    // 按钮
    const bindBtn = (id, onDown, onUp) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('touchstart', (e) => { e.preventDefault(); onDown(); }, { passive: false });
      el.addEventListener('touchend', (e) => { e.preventDefault(); if (onUp) onUp(); }, { passive: false });
    };
    bindBtn('touch-jump', () => { keys['Space'] = true; }, () => { keys['Space'] = false; });
  const tj = document.getElementById('touch-jump'); if (tj) tj.addEventListener('touchcancel', () => { keys['Space'] = false; });
  addEventListener('blur', () => { keys['Space'] = false; });
    bindBtn('touch-break', () => { breakBlock(); });
    bindBtn('touch-place', () => { placeBlock(); });
    // 拖拽转视角(画面右半区拖动)
    let lookActive = false, lastX = 0, lastY = 0;
    renderer.domElement.addEventListener('touchstart', (e) => {
      // 排除触屏控件区域
      const t = e.touches[0];
      if (t.clientX > window.innerWidth * 0.4) { lookActive = true; lastX = t.clientX; lastY = t.clientY; }
    }, { passive: true });
    renderer.domElement.addEventListener('touchmove', (e) => {
      if (!lookActive) return;
      const t = e.touches[0];
      yaw -= (t.clientX - lastX) * 0.005;
      pitch -= (t.clientY - lastY) * 0.005;
      pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, pitch));
      lastX = t.clientX; lastY = t.clientY;
    }, { passive: true });
    renderer.domElement.addEventListener('touchend', () => { lookActive = false; }, { passive: true });
  }

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });
}

// ============================================================
// 第十四部分:射线检测(改造:基于 chunk mesh + 法线反查)
// ============================================================
// DDA 体素射线:逐体素步进找第一个固体方块(替代 intersectObjects,无需遍历 mesh 数组)
// 性能优势:只检查视线穿过的 ~6 个体素,而非 121 个 chunk mesh 的所有三角形
function raycastTarget() {
  // 起点:第一人称=相机位置(playerPos);第三人称=玩家眼睛
  const eye = new THREE.Vector3(playerPos.x, playerPos.y, playerPos.z);
  const dir = new THREE.Vector3(
    -Math.sin(yaw) * Math.cos(pitch),
    Math.sin(pitch),
    -Math.cos(yaw) * Math.cos(pitch)
  );
  const maxDist = raycaster.far || 6;  // 最远 6 格

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
  const fracX = stepX > 0 ? (x + 1 - eye.x) : (eye.x - x);
  const fracY = stepY > 0 ? (y + 1 - eye.y) : (eye.y - y);
  const fracZ = stepZ > 0 ? (z + 1 - eye.z) : (eye.z - z);
  let tMaxX = dir.x !== 0 ? (stepX > 0 ? (x + 1 - eye.x) / dir.x : (eye.x - x) / -dir.x) : Infinity;
  let tMaxY = dir.y !== 0 ? (stepY > 0 ? (y + 1 - eye.y) / dir.y : (eye.y - y) / -dir.y) : Infinity;
  let tMaxZ = dir.z !== 0 ? (stepZ > 0 ? (z + 1 - eye.z) / dir.z : (eye.z - z) / -dir.z) : Infinity;

  let lastStep = null;  // 记录最后跨过的轴(用于反推法线)
  let traveled = 0;

  // 检查起点是否已在方块内(眼睛嵌墙)
  if (isSolidAt(x, y, z)) return { x, y, z, normal: new THREE.Vector3(0, 1, 0) };

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
      // 命中:法线 = 进入面方向(反 step)
      const normal = new THREE.Vector3(
        lastStep === 'x' ? -stepX : 0,
        lastStep === 'y' ? -stepY : 0,
        lastStep === 'z' ? -stepZ : 0
      );
      return { x, y, z, normal };
    }
  }
  return null;  // 射线未命中固体
}

function currentTool() {
  const item = hotbar[currentSlot];
  if (item && item.kind === 'tool') return item;
  return null;
}

function breakCost(blockType) {
  const def = BLOCK_TYPES[blockType];
  const tool = currentTool();
  const baseClicks = Math.max(1, Math.round(def.hardness * 3));
  if (tool && TOOL_TYPES[tool.id].tool === def.tool) {
    return Math.max(1, Math.round(baseClicks / TOOL_TYPES[tool.id].speed));
  }
  return baseClicks;
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
  // 门:左键=移除门(任何手持,和破坏方块一致);右键=开关门
  const lookDoor = raycastDoor();
  if (lookDoor) { removeDoor(lookDoor.x, lookDoor.y, lookDoor.z); showToast('移除门'); audio.play('break'); markDirtySave(); return; }
  const t = raycastTarget();
  if (!t) return;
  const type = getBlock(t.x, t.y, t.z);
  if (!type) return;
  if (t.y === 0) { showToast('基岩无法破坏'); return; }  // 基岩层不可挖
  if (type === 'water') { showToast('水不能破坏'); return; }
  const def = BLOCK_TYPES[type];

  const cost = breakCost(type);
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
  if (dropItems) spawnDroppedItem(t.x, t.y, t.z, type);   // 创造模式:仅视觉趣味,默认关
  breakProgress = 0; breakTargetKey = null;
  hideBreakOverlay();
  showToast(`破坏:${def.name}`);
  audio.play('break', type);
  if (tool) {
    tool.durability = Math.max(0, tool.durability - 1);
    if (tool.durability <= 0) {
      showToast(`${TOOL_TYPES[tool.id].name} 坏了!`);
      hotbar[currentSlot] = null;
      buildHotbar();
    } else {
      buildHotbar();
    }
  }
  rebuildRaycastTargets();
  markDirtySave();
}

function placeBlock() {
  const lookDoor = raycastDoor();
  const holdingDoor = selectedType && selectedType.indexOf('door') === 0;
  if (lookDoor && !holdingDoor) { toggleDoor(lookDoor.x, lookDoor.y, lookDoor.z); return; }
  const item = hotbar[currentSlot];
  if (item && item.kind === 'tool') { useTool(item); return; }
  if (item && item.kind === 'item') {
    showToast(`${itemName(item)} 不能放置,选中方块再放`);
    return;
  }
  if (!item) { showToast('快捷栏该格为空,从背包(E)取方块'); return; }
  const t = raycastTarget();
  if (!t) { showToast('未对准任何方块'); return; }
  const nx = t.x + Math.round(t.normal.x);
  const ny = t.y + Math.round(t.normal.y);
  const nz = t.z + Math.round(t.normal.z);
  if (getBlock(nx, ny, nz) || doorBlocksAt(nx, ny, nz)) { showToast('此处已有方块或门'); return; }
  if (overlapsPlayer(nx, ny, nz)) { showToast('挡住自己了,换个方向'); return; }
  if (selectedType && selectedType.indexOf('door') === 0) {
    const facing = Math.abs(Math.sin(yaw)) > 0.5 ? 1 : 0;
    if (placeDoor(nx, ny, nz, selectedType, facing)) { showToast('放置:'+(BLOCK_TYPES[selectedType]?BLOCK_TYPES[selectedType].name:'门')); audio.play('place'); markDirtySave(); }
    else { showToast('门需 2 格高空间'); }
    return;
  }
  if (tryPlantCrop(nx, ny, nz)) { showToast('种下小麦(60秒成熟)'); audio.play('place'); return; }
  if (setBlock(nx, ny, nz, selectedType)) {
    spawnParticles(nx, ny, nz, new THREE.Color(BLOCK_TYPES[selectedType].top).getHex(), 4);
    showToast(`放置:${BLOCK_TYPES[selectedType].name}`);
    audio.play('place');
    rebuildRaycastTargets();
    markDirtySave();
  }
}

const toolCooldown = {};
function useTool(item) {
  const def = TOOL_TYPES[item.id];
  const now = performance.now();
  const cd = { sword: 350, bow: 600, shield: 500 }[def.tool] || 200;
  if (toolCooldown[item.id] && now - toolCooldown[item.id] < cd) return;
  // cooldown set AFTER success checks (not before, to avoid locking failed actions)
  if (def.tool === 'sword') {
    swingArm();
    swingHoldItem();
    const t = raycastTarget();
    showToast(`挥砍:${def.name} · 伤害${def.damage}` + (t ? ' · 命中' : ''));
    audio.play('break');
    consumeToolDurability(item);
  } else if (def.tool === 'bow') {
    const arrowSlot = hotbar.findIndex(s => s && s.kind === 'item' && s.id === 'arrow' && s.count > 0);
    if (arrowSlot < 0) { showToast('没有箭,无法射击(背包取箭)'); return; }
    hotbar[arrowSlot].count--;
    if (hotbar[arrowSlot].count <= 0) hotbar[arrowSlot] = null;
    buildHotbar();
    consumeToolDurability(item);
    shootArrow();
    swingHoldItem();
    audio.play('place');
    showToast(`射箭 · 剩余 ${hotbar[arrowSlot] ? hotbar[arrowSlot].count : 0} 支`);
  } else if (def.tool === 'shield') {
    shieldActive = 0.6;
    swingHoldItem();
    showToast(`举盾:${def.name}`);
    consumeToolDurability(item);
  } else {
    showToast(`${def.name}:用于破坏方块(左键),右键只是展示`);
    toolCooldown[item.id] = now;
    swingHoldItem();
  }
}

function consumeToolDurability(item) {
  item.durability = Math.max(0, item.durability - 1);
  if (item.durability <= 0) {
    showToast(`${TOOL_TYPES[item.id].name} 坏了!`);
    hotbar[currentSlot] = null;
  }
  buildHotbar();
  markDirtySave();
}

const arrows = [];
let arrowGeo = null, arrowMat = null;
function shootArrow() {
  if (!arrowGeo) { arrowGeo = new THREE.BoxGeometry(0.08, 0.08, 0.4); arrowMat = new THREE.MeshLambertMaterial({ color: 0xcaa472 }); }
  const m = new THREE.Mesh(arrowGeo, arrowMat);
  m.position.copy(playerPos);
  const dir = new THREE.Vector3(
    -Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)
  );
  m.userData = { vel: dir.multiplyScalar(28), life: 2.5 };
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
  d.open = !d.open;
  d.animT = 0;  // 触发动画(在 animate 里推进)
  audio.play('step');
  showToast(d.open ? '🚪 开门' : '🚪 关门');
  return true;
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
  const eye = new THREE.Vector3(playerPos.x, playerPos.y, playerPos.z);
  const dir = new THREE.Vector3(-Math.sin(yaw)*Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw)*Math.cos(pitch));
  for (let t = 0.3; t <= 4; t += 0.25) { const d = getDoorAt(Math.floor(eye.x+dir.x*t), Math.floor(eye.y+dir.y*t), Math.floor(eye.z+dir.z*t)); if (d) return d; }
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
function spawnParticles(x, y, z, colorHex, count) {
  if (!particleGeo) particleGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
  for (let i = 0; i < count; i++) {
    const m = new THREE.Mesh(particleGeo, new THREE.MeshLambertMaterial({ color: colorHex }));
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
    if (p.userData.life <= 0) { scene.remove(p); p.material.dispose(); particles.splice(i, 1); }
  }
}

// ============================================================
// 掉落物实体(创造模式:视觉趣味 + 未来生存模式钩子)
// ============================================================
// 小旋转方块(0.3 大小),从被破坏方块中心生成,受重力 + 地面支撑,30 秒后淡出消失
// pickupDelay 期间不可拾取;之后玩家走近播放拾取音(创造模式不增加物品,物品栏本就无限)
let dropItemGeo = null;
function spawnDroppedItem(x, y, z, blockType) {
  if (!dropItemGeo) dropItemGeo = new THREE.BoxGeometry(0.3, 0.3, 0.3);
  const mesh = new THREE.Mesh(dropItemGeo, materials[blockType]);
  mesh.position.set(x + 0.5, y + 0.5, z + 0.5);
  mesh.userData = {
    type: blockType,
    life: 30,          // 30 秒后消失
    pickupDelay: 0.5,  // 生成后 0.5 秒内不可拾取,避免刚破坏就吸回
    vy: 1.5 + Math.random() * 1.0,   // 初始上抛一点
    baseY: 0,
  };
  scene.add(mesh);
  droppedItems.push(mesh);
}

function updateDroppedItems(dt) {
  for (let i = droppedItems.length - 1; i >= 0; i--) {
    const d = droppedItems[i];
    const u = d.userData;
    // 旋转(绕 Y 轴自旋,经典 Minecraft 掉落物观感)
    d.rotation.y += dt * 1.8;

    // 重力 + 地面支撑:垂直方向积分,落到固体方块顶部即停
    u.vy -= GRAVITY * dt;
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

    // 拾取:玩家走近(1.2 格内)且延迟已过 → 创造模式仅播放音效,不改物品栏
    if (u.pickupDelay <= 0) {
      const dx = d.position.x - playerPos.x;
      const dz = d.position.z - playerPos.z;
      const dy = d.position.y - playerPos.y;
      if (dx * dx + dy * dy + dz * dz < 1.44) {
        audio.play('place');
        scene.remove(d);
        droppedItems.splice(i, 1);
        continue;
      }
    }

    // 寿命到点:淡出后移除(最后 1 秒闪烁式收缩)
    if (u.life <= 0) {
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
  for (const d of droppedItems) scene.remove(d);
  droppedItems.length = 0;
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

// 扣血(统一入口:扣血 + 红屏渐晕 + 音效;若 HP<=0 触发死亡)
function damagePlayer(amount) {
  if (amount <= 0) return;
  playerHP = Math.max(0, playerHP - amount);
  showDamageVignette();
  audio.play('hurt');
  updateHPBar();
  markDirtySave();
  if (playerHP <= 0) respawnPlayer();
}

// 死亡/重生:回到出生广场中心,满血,掉落物不丢(创造模式)
let deathOverlayTimer = 0;
function respawnPlayer() {
  // 重生到出生广场中心(确定性,与 resetWorld 一致)
  const plazaH = SEA_LEVEL + 6;
  playerPos.set(0.5, plazaH + 1 + PLAYER_HEIGHT * 0.5, 0.5);
  velocity.set(0, 0, 0);
  playerHP = PLAYER_MAX_HP;
  breathTimer = 0;
  updateHPBar();
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

function updateArrows(dt) {
  for (let i = arrows.length - 1; i >= 0; i--) {
    const a = arrows[i];
    a.userData.vel.y -= 9.8 * dt;
    a.position.addScaledVector(a.userData.vel, dt);
    a.lookAt(a.position.clone().add(a.userData.vel));
    a.userData.life -= dt;
    const bx = Math.floor(a.position.x), by = Math.floor(a.position.y), bz = Math.floor(a.position.z);
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
  playerPos[axis] += delta;
  const px = playerPos.x, py = playerPos.y, pz = playerPos.z;
  const minX = Math.floor(px - r), maxX = Math.floor(px + r);
  const minY = Math.floor(py - H * 0.5), maxY = Math.floor(py + H * 0.5);
  const minZ = Math.floor(pz - r), maxZ = Math.floor(pz + r);
  for (let x = minX; x <= maxX; x++)
    for (let y = minY; y <= maxY; y++)
      for (let z = minZ; z <= maxZ; z++) {
        if (!isSolidAt(x, y, z)) continue;
        if (axis === 'x') {
          if (delta > 0) playerPos.x = x - r - 1e-4;
          else playerPos.x = x + 1 + r + 1e-4;
          velocity.x = 0; return;
        } else if (axis === 'z') {
          if (delta > 0) playerPos.z = z - r - 1e-4;
          else playerPos.z = z + 1 + r + 1e-4;
          velocity.z = 0; return;
        } else {
          if (delta > 0) { playerPos.y = y - H * 0.5 - 1e-4; }
          else { playerPos.y = y + 1 + H * 0.5 + 1e-4; onGround = true; }
          velocity.y = 0; return;
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
  let forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  if (cameraMode === 2) { forward = forward.clone().negate(); }

  const move = new THREE.Vector3();
  // 触屏摇杆输入
  const tm = (typeof window.__touchMove === 'function') ? window.__touchMove() : null;
  if (tm && (Math.abs(tm.x) > 0.1 || Math.abs(tm.z) > 0.1)) {
    move.add(forward.clone().multiplyScalar(-tm.z));
    move.add(right.clone().multiplyScalar(tm.x));
  } else {
    if (keys['KeyW']) move.add(forward);
  if (keys['KeyS']) move.sub(forward);
  if (keys['KeyD']) move.add(right);
  if (keys['KeyA']) move.sub(right);
  }
  if (move.lengthSq() > 0) move.normalize();

  const water = inWater();
  const speed = isFlying ? FLY_SPEED : (water ? WALK_SPEED * 0.5 : WALK_SPEED);
  const sprint = keys['ShiftLeft'] || keys['ShiftRight'];

  if (isFlying) {
    velocity.x = move.x * speed;
    velocity.z = move.z * speed;
    velocity.y = 0;
    if (keys['Space']) velocity.y = speed;
    if (sprint) velocity.y = -speed;
  } else if (water) {
    // 水中:有浮力(缓慢上浮到水面),按空格加速上浮;下落速度有上限避免一直沉底
    velocity.x = move.x * speed;
    velocity.z = move.z * speed;
    if (keys['Space']) {
      velocity.y = 4.5;                       // 主动上浮
    } else {
      velocity.y -= GRAVITY * 0.3 * dt;       // 重力(被浮力部分抵消)
      velocity.y += 6.0 * dt;                 // 浮力:净效果是缓慢上浮
      if (velocity.y < -3) velocity.y = -3;   // 下沉速度上限,避免加速到海底
    }
  } else {
    velocity.x = move.x * speed;
    velocity.z = move.z * speed;
    velocity.y -= GRAVITY * dt;
    if (keys['Space'] && onGround) {
      velocity.y = JUMP_SPEED;
      const now = performance.now();
      if (now - lastJumpTime > 250) { audio.play('jump'); lastJumpTime = now; }
    }
  }

  collidePlayer(dt);

  // 落地音效:仅在"从空中→触地"这一帧触发(边沿检测),避免着地后重复播放
  if (onGround && !wasOnGround && prevVy < -6) audio.play('jump');
  // Fall damage: when landing with prevVy < -15 (~4+ blocks), scale by speed. Flying immune.
  if (onGround && !wasOnGround && !isFlying && prevVy < -15 && !inWater()) {
    const dmg = Math.floor((-prevVy - 15) / 3);
    if (dmg > 0) damagePlayer(dmg);
  }
  wasOnGround = onGround;
  // 记录最后安全位置(用于虚空救援):仅当稳稳站在实体方块上时更新
  if (onGround && !isFlying) lastSafePos.copy(playerPos);

  // 走路音效(按节拍)
  if (onGround && !isFlying) {
    const horiz = Math.hypot(velocity.x, velocity.z);
    if (horiz > 1) {
      const now = performance.now();
      const interval = 320;
      if (now - lastStepTime > interval) {
        audio.play('step');
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
  // Drowning: head underwater continuously >15s -> 1 HP/sec. Reset on surfacing.
  const headInWater = getBlock(Math.floor(playerPos.x), Math.floor(playerPos.y + 0.2), Math.floor(playerPos.z)) === 'water';
  if (headInWater) {
    breathTimer += dt;
    if (breathTimer > 15) {
      const over = breathTimer - 15;
      const before = Math.floor(over - dt);
      const after = Math.floor(over);
      if (after > before) damagePlayer(after - before);
    }
  } else {
    breathTimer = 0;
  }

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
      playerPos.set(0.5, plazaH + 1 + PLAYER_HEIGHT * 0.5, 0.5);
    }
    velocity.set(0, 0, 0);
    showToast('已从虚空中救回');
  }
}
let wasOnGround = false;   // 落地边沿检测

// ============================================================
// 第十六部分:渲染循环(增加区块更新 + 雾色随水位变化)
// ============================================================
let lastTime = performance.now();
let fpsAcc = 0, fpsFrames = 0, fpsTimer = 0;

// 昼夜循环:dayTime 0..1(0=午夜,0.25=日出,0.5=正午,0.75=日落),起步 0.3(早晨)
let dayTime = 0.3;
let _daytimeEl = null;  // 缓存 DOM 元素(避免每帧 getElementById)
// updateDayNight 用的临时颜色对象(避免每帧分配)
const _dayColor = new THREE.Color();
const _dayColorB = new THREE.Color();
// 光源/天体引用(在 init 中赋值)
let sunLight = null, ambientLight = null, hemiLight = null;
let sunMeshRef = null, moonMeshRef = null;

// 昼夜循环更新:根据 dayTime 调整光照强度/方向、天空与雾色、太阳/月亮位置
// 注意:仅在非水下时覆盖背景/雾色(水下色调由 animate 的 inWater 逻辑接管,优先级最高)
// 全周期 = 120 秒,昼夜由平滑函数(sin/cos)过渡
function updateDayNight(dt) {
  // 昼夜循环:受设置控制(可关闭/调速度)
  if (settings.dayNightEnabled) {
    dayTime += dt / (settings.dayCycleSpeed || 120);  // 速度可调(秒/周期)
    if (dayTime >= 1) dayTime -= 1;
  }

  // 太阳角度:0=午夜,0.25=日出(东升),0.5=正午,0.75=日落(西落)
  const sunAngle = dayTime * Math.PI * 2 - Math.PI / 2;
  const sunH = Math.sin(sunAngle);       // -1..1(高度,>0 为白天)
  const dayFactor = Math.max(0, sunH);   // 0..1,白天强度因子

  // 光照强度:白天明亮(正午最强),夜晚昏暗
  // 用 dayFactor 平方做非线性过渡,白天更"亮得稳",黄昏过渡更柔和
  if (sunLight) {
    sunLight.intensity = 0.15 + dayFactor * dayFactor * 0.9;   // 夜 0.15 ~ 正午 ~1.05
    // 太阳沿圆轨道运动,半径足够大覆盖世界;方向与天体一致
    const R = 120;
    sunLight.position.set(Math.cos(sunAngle) * R, Math.sin(sunAngle) * R, -40);
  }
  if (ambientLight) {
    ambientLight.intensity = 0.18 + dayFactor * 0.45;          // 夜 0.18 ~ 正午 ~0.63
  }
  if (hemiLight) {
    hemiLight.intensity = 0.1 + dayFactor * 0.25;
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
  // 黄昏/黎明出现在 dayTime≈0.25(日出)与 0.75(日落):用 |sunH| 在低角度时凸显橙红
  // 简化:用 cos(sunAngle) 的正负区分日出/日落,但颜色相同;用 sunH 控制日夜,|水平分量|控制黄昏
  const horiz = Math.cos(sunAngle);          // -1..1(日出时为正,日落后为负;|horiz|小=靠近地平线)
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
  if (!inWater()) {
    if (scene.background.getHex() !== _dayColor.getHex()) {
      scene.background.setHex(_dayColor.getHex());
    }
    scene.fog.color.setHex(_dayColor.getHex());
    scene.fog.near = FOG_NEAR; scene.fog.far = FOG_FAR;
  }

  // 信息面板昼夜进度显示
  const el = document.getElementById('daytime');
  if (el) {
    const hh = Math.floor(dayTime * 24);
    const mm = Math.floor((dayTime * 24 - hh) * 60);
    el.textContent = (hh < 10 ? '0' + hh : hh) + ':' + (mm < 10 ? '0' + mm : mm);
  }
}

function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  let dt = (now - lastTime) / 1000;
  lastTime = now;
  if (dt > 0.05) dt = 0.05;

  const locked = document.pointerLockElement === renderer.domElement;
  const prevVy = velocity.y;
  if (locked) updatePlayer(dt, prevVy);
  updateArrows(dt);
  updateDroppedItems(dt);
  updateParticles(dt);   // 粒子效果
  updateDoorAnim(dt);    // 门开关动画
  updateDamageVignette(dt);
  updateDeathOverlay(dt);
  updateClouds(dt);   // 云朵飘动(无论是否锁定都执行)

  // 区块动态加载/卸载(无论是否锁定都执行,保证世界持续生成)
  updateChunks(playerPos.x, playerPos.z);
  if (Math.floor(now / 1000) !== window.__lastCropCheck) { window.__lastCropCheck = Math.floor(now / 1000); updateCrops(); }
  // raycast 目标:仅在区块 mesh 变化时重建(脏标记),避免每帧遍历全部区块
  if (raycastTargetsDirty) rebuildRaycastTargets();

  if (holdGroup) {
    holdGroup.visible = (cameraMode === 0);
    updateHoldAnim(dt);
  }

  if (cameraMode === 0) {
    camera.position.copy(playerPos);
    camera.rotation.order = 'YXZ';
    camera.rotation.y = yaw;
    camera.rotation.x = pitch;
    if (camera.fov !== 75) { camera.fov = 75; camera.updateProjectionMatrix(); }
  } else {
    updateThirdPersonCamera();
  }

  // 玩家模型:每帧跟随玩家位置/朝向(无论 cameraMode),避免切换人称时模型停留原地
  if (playerModel) {
    playerModel.position.set(playerPos.x, playerPos.y - PLAYER_HEIGHT * 0.5, playerPos.z);
    playerModel.rotation.y = yaw;
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

  const target = raycastTarget();
  if (target) {
    highlightBox.visible = true;
    highlightBox.position.set(target.x + 0.5, target.y + 0.5, target.z + 0.5);
  } else {
    highlightBox.visible = false;
  }
  const curKey = target ? blockKey(target.x, target.y, target.z) : null;
  if (curKey !== breakTargetKey && breakProgress > 0) {
    breakProgress = 0;
    hideBreakOverlay();
  }

  // 昼夜循环:推进 dayTime 并调整光照/天空/天体(updateDayNight 内部仅在非水下时覆盖背景/雾)
  updateDayNight(dt);
  // 雾/背景:水中色调优先级最高(覆盖昼夜色调),水下视野大幅拉近(沉浸感)
  // 出水后由 updateDayNight 在下一帧重新应用昼夜色
  const _waterBg = 0x1f5fa8, _waterBg2 = 0x143d6e;
  if (inWater()) {
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
    document.getElementById('fps').textContent = fpsAcc;
    document.getElementById('pos').textContent =
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
function tryPlantCrop(nx, ny, nz) {
  if (selectedType !== 'snow') return false;
  if (getBlock(nx, ny - 1, nz) !== 'grass') return false;
  if (setBlock(nx, ny, nz, 'snow')) { cropTimers.set(blockKey(nx, ny, nz), performance.now()); return true; }
  return false;
}
function updateCrops() {
  const now = performance.now();
  for (const [key, plantTime] of cropTimers.entries()) {
    if (now - plantTime < 60000) continue;
    const [x, y, z] = key.split(',').map(Number);
    if (getBlock(x, y, z) === 'snow') { setBlock(x, y, z, 'leaves'); showToast('小麦成熟了'); }
    else if (getBlock(x, y, z) !== 'snow') cropTimers.delete(key);
  }
}

function applySave(rec) {
  if (autosaveTimer) { clearTimeout(autosaveTimer); autosaveTimer = null; }
  clearWorld();
  worldSeed = (typeof rec.seed === 'number') ? rec.seed : worldSeed;
  modifications.clear();
  if (rec.modifications) for (const [k, v] of rec.modifications) modifications.set(k, v);
  if (rec.playerPos && rec.playerPos.y > 1 && rec.playerPos.y < WORLD_HEIGHT
      && Number.isFinite(rec.playerPos.x) && Number.isFinite(rec.playerPos.z)) {
    playerPos.set(rec.playerPos.x, rec.playerPos.y, rec.playerPos.z);
  } else {
    // 存档位置异常 → 回广场中心
    const plazaH = SEA_LEVEL + 6;
    playerPos.set(0.5, plazaH + 1 + PLAYER_HEIGHT * 0.5, 0.5);
  }
  yaw = rec.yaw || 0; pitch = rec.pitch || 0;
  cameraMode = rec.cameraMode || 0; isFlying = rec.isFlying || false;
  velocity.set(0, 0, 0);
  wasOnGround = false; wasInWater = false;
  playerHP = (typeof rec.playerHP === 'number') ? Math.max(0, Math.min(PLAYER_MAX_HP, rec.playerHP)) : PLAYER_MAX_HP;
  breathTimer = 0;
  if (rec.hotbar) { hotbar = rec.hotbar; } else initInventory();
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
  rebuildRaycastTargets();
  // 恢复门实体(clearWorld 已调 clearDoors)
  if (rec.doorsData) {
    for (const [key, d] of rec.doorsData) {
      try {
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
  saveDirty = false;
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

// ============================================================
// 第十七部分:背包面板(沿用旧实现)
// ============================================================
// 存档管理:打开面板 + 渲染存档列表
function openSaveManager() {
  const panel = document.getElementById('save-manager');
  const list = document.getElementById('save-list');
  if (!panel || !list) return;
  panel.classList.remove('hidden');
  list.innerHTML = '<div style="color:#9fb0c8;text-align:center;padding:20px;">加载中...</div>';
  listSaves().then(saves => {
    if (saves.length === 0) {
      list.innerHTML = '<div style="color:#9fb0c8;text-align:center;padding:20px;">暂无存档<br><span style="font-size:12px">点击下方"保存当前为新存档"创建</span></div>';
      return;
    }
    list.innerHTML = saves.map(s => {
      const time = new Date(s.timestamp).toLocaleString('zh-CN', {month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
      const pos = s.playerPos ? `(${s.playerPos.x.toFixed(0)},${s.playerPos.y.toFixed(0)},${s.playerPos.z.toFixed(0)})` : '';
      const cur = (s.id === currentSaveId) ? ' <span style="color:#5fd35f;">●当前</span>' : '';
      return `<div class="save-item">
        <div class="save-info">
          <div class="save-name">${s.name || '未命名'}${cur}</div>
          <div class="save-meta">#${s.id} · ${time} · 位置${pos} · ${(s.modifications||[]).length}处改动</div>
        </div>
        <button class="load" onclick="loadSaveFromMgr(${s.id})">读取</button>
        <button class="del" onclick="delSaveFromMgr(${s.id})">删除</button>
      </div>`;
    }).join('');
  });
}
// 从存档管理面板读取/删除(全局函数,供 onclick 调用)
window.loadSaveFromMgr = function(id) {
  loadSlot(id).then(ok => {
    if (ok) {
      showToast('已读取,点击继续游戏');
      document.getElementById('save-manager').classList.add('hidden');
      document.getElementById('pause-menu').classList.remove('hidden');
    } else showToast('读取失败');
  });
};
window.delSaveFromMgr = function(id) {
  deleteSave(id).then(ok => {
    if (ok) { showToast('已删除存档 #' + id); openSaveManager(); }
    else showToast('删除失败');
  });
};

function toggleInventory(open) {
  inventoryOpen = open;
  const panel = document.getElementById('inventory');
  if (!panel) return;
  if (open) {
    buildInventoryPanel();
    panel.classList.remove('hidden');
    if (document.pointerLockElement) document.exitPointerLock();
  } else {
    panel.classList.add('hidden');
    clearCraftGrid();
  }
}

function buildInventoryPanel() {
  const panel = document.getElementById('inventory');
  const grid = panel.querySelector('.inv-grid');
  grid.innerHTML = '';
  const hint = panel.querySelector('.inv-hint');
  hint.textContent = `点击物品放入快捷栏第 ${currentSlot + 1} 格;合成格点击切换方块,再次点击清空`;

  // 绑定合成按钮(每次打开背包都重新绑定,避免重复绑定/失效)
  const craftBtn = document.getElementById('craft-btn');
  if (craftBtn) craftBtn.onclick = performCraft;
  const craftClear = document.getElementById('craft-clear');
  if (craftClear) craftClear.onclick = clearCraftGrid;
  // 合成格:点击切换方块种类(HOTBAR_ORDER 循环),右键清空
  const craftBlockList = HOTBAR_ORDER.slice();
  document.querySelectorAll('#craft-grid .inv-cell').forEach((cell, i) => {
    cell.onclick = () => {
      const cur = craftGrid[i];
      let idx = cur ? craftBlockList.indexOf(cur.id) : -1;
      idx = (idx + 1) % craftBlockList.length;
      craftGrid[i] = { kind: 'block', id: craftBlockList[idx] };
      renderCraftGrid();
      refreshCraftResult();
    };
    cell.oncontextmenu = (e) => { e.preventDefault(); craftGrid[i] = null; renderCraftGrid(); refreshCraftResult(); };
  });
  renderCraftGrid();
  refreshCraftResult();

  const addCell = (item) => {
    const cell = document.createElement('div');
    cell.className = 'inv-cell';
    const cv = document.createElement('canvas');
    cv.width = cv.height = 48;
    drawItemIcon(item, cv);
    cell.appendChild(cv);
    const label = document.createElement('span');
    label.className = 'inv-label';
    label.textContent = itemName(item);
    cell.appendChild(label);
    cell.addEventListener('click', () => {
      let copy;
      if (item.kind === 'tool') {
        copy = { kind: 'tool', id: item.id, durability: TOOL_TYPES[item.id].durability };
      } else if (item.kind === 'item') {
        copy = { kind: 'item', id: item.id, count: 64 };
      } else {
        copy = { kind: 'block', id: item.id };
      }
      putInSlot(currentSlot, copy);
      showToast(`已放入快捷栏:${itemName(item)}`);
    });
    // 右键:放入合成格(找第一个空位)
    cell.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      // 合成格接受方块和材料(物品)
      for (let gi = 0; gi < 4; gi++) {
        if (craftGrid[gi] === null) {
          craftGrid[gi] = { kind: item.kind || 'block', id: item.id };
          renderCraftGrid();
          refreshCraftResult();
          showToast(`放入合成格:${itemName(item)}`);
          return;
        }
      }
      showToast('合成格已满');
    });
    grid.appendChild(cell);
  };
  addSection(grid, '工具 · 武器');
  TOOL_ORDER.forEach(id => addCell({ kind: 'tool', id }));
  addSection(grid, '方块');
  HOTBAR_ORDER.forEach(id => addCell({ kind: 'block', id }));
  // 新增方块也可取用
  ['water', 'snow', 'gravel', 'door', 'door_iron', 'door_stone', 'door_gold', 'door_diamond'].forEach(id => addCell({ kind: 'block', id }));
  addSection(grid, '材料 · 宝石');
  ITEM_ORDER.forEach(id => addCell({ kind: 'item', id, count: 64 }));
}

function addSection(grid, title) {
  const h = document.createElement('div');
  h.className = 'inv-section-title';
  h.textContent = title;
  grid.appendChild(h);
}

// ============================================================
// 合成系统(2x2 网格 + 结果;创造模式主要为演示/未来生存钩子)
// ============================================================
// 配方:pattern 是长度 4 的数组,元素为方块 id 或 null。null 表示该格必须为空。
// result 为 {kind,id,count?}。可放置的 crafting_table 方块本游戏未定义,故用 planks 作演示结果。
// 合成配方表(2×2):pattern 是 4 格的方块 id(或 null=空),result 是产出
// shapeless:true 表示无序(任意位置都可),false 表示必须精确位置
const RECIPES = [
  // 基础:木头→木板(1 木头 = 4 木板,无序)
  { name: '木板', pattern: ['wood',null,null,null], result: { kind: 'block', id: 'planks' }, count: 4, shapeless: true },
  // 木板→木棍(2 木板 = 4 木棍,纵向排列)
  { name: '木棍', pattern: ['planks',null,'planks',null], result: { kind: 'item', id: 'arrow', count: 4 }, shapeless: false },
  // 4 木板→工作台(用 planks 表示,演示)
  { name: '压缩木板', pattern: ['planks','planks','planks','planks'], result: { kind: 'block', id: 'planks' }, count: 1, shapeless: true },
  // 4 石头→石砖(用 brick 表示)
  { name: '石砖', pattern: ['stone','stone','stone','stone'], result: { kind: 'block', id: 'brick' }, count: 2, shapeless: true },
  // 4 砖块→砖块(压缩,演示)
  { name: '砖块', pattern: ['brick','brick','brick','brick'], result: { kind: 'block', id: 'brick' }, count: 1, shapeless: true },
  // 4 沙子→沙砾
  { name: '沙砾', pattern: ['sand','sand','sand','sand'], result: { kind: 'block', id: 'gravel' }, count: 2, shapeless: true },
  // 4 雪块→冰(用 snow→water 表示,演示)
  { name: '融雪', pattern: ['snow','snow','snow','snow'], result: { kind: 'block', id: 'water' }, count: 1, shapeless: true },
  // 木门:2 木板(横向)→1 门
  { name: '木门', pattern: ['planks','planks',null,null], result: { kind: 'block', id: 'door' }, count: 1, shapeless: false },
  // 铁门:4 铁锭(2×2)→1 铁门
  { name: '铁门', pattern: ['gem_gold','gem_gold','gem_gold','gem_gold'], result: { kind: 'block', id: 'door_iron' }, count: 1, shapeless: true },
  // 石门:2 石头(纵向)→1 石门(有序,与石砖的4石头区分)
  { name: '石门', pattern: ['stone',null,'stone',null], result: { kind: 'block', id: 'door_stone' }, count: 1, shapeless: false },
  // 金门:2 金锭(横向)→1 金门(有序,与铁门的4金锭区分)
  { name: '金门', pattern: ['gem_gold','gem_gold',null,null], result: { kind: 'block', id: 'door_gold' }, count: 1, shapeless: false },
  // 钻石门:4 钻石(2×2)→1 钻石门
  { name: '钻石门', pattern: ['gem_diamond','gem_diamond','gem_diamond','gem_diamond'], result: { kind: 'block', id: 'door_diamond' }, count: 1, shapeless: true },
];

// 合成格状态:长度 4 的数组,每格为 null 或 {kind,id}(方块演示)
const craftGrid = [null, null, null, null];

// 当前配方匹配结果(null = 无匹配)
function matchRecipe() {
  // 网格归一化(非空项的 id 列表)
  const gridItems = craftGrid.filter(x => x !== null).map(x => x.id);
  if (gridItems.length === 0) return null;
  const gridSorted = [...gridItems].sort().join(',');
  for (const r of RECIPES) {
    const recipeItems = r.pattern.filter(x => x !== null);
    if (r.shapeless) {
      // 无序:排序后比较
      const recipeSorted = [...recipeItems].sort().join(',');
      if (recipeSorted === gridSorted) return r;
    } else {
      // 有序:精确位置匹配
      let ok = true;
      for (let i = 0; i < 4; i++) {
        const want = r.pattern[i] || null;
        const got = craftGrid[i];
        if ((want === null) !== (got === null)) { ok = false; break; }
        if (want && (!got || got.id !== want)) { ok = false; break; }
      }
      if (ok) return r;
    }
  }
  return null;
}

function renderCraftGrid() {
  const cells = document.querySelectorAll('#craft-grid .inv-cell');
  cells.forEach((cell, i) => {
    const old = cell.querySelector('canvas'); if (old) old.remove();
    const item = craftGrid[i];
    if (item) { const cv = document.createElement('canvas'); cv.width = cv.height = 48; drawItemIcon(item, cv); cell.appendChild(cv); }
  });
}

function refreshCraftResult() {
  const resBox = document.getElementById('craft-result');
  const btn = document.getElementById('craft-btn');
  const hint = document.getElementById('craft-hint');
  const r = matchRecipe();
  resBox.innerHTML = '';
  if (r) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 48;
    drawItemIcon(r.result, cv);
    resBox.appendChild(cv);
    if (btn) btn.disabled = false;
    if (hint) hint.textContent = '可合成:' + r.name;
  } else {
    if (btn) btn.disabled = true;
    const hasItem = craftGrid.some(x => x !== null);
    if (hint) hint.textContent = hasItem ? '无匹配配方(尝试 4 个同种方块)' : '右键点击下方物品放入合成格,左键放入快捷栏';
  }
}

function performCraft() {
  const r = matchRecipe();
  if (!r) return;
  // 产出物品(含数量)
  const res = { ...r.result };
  if (!res.count) res.count = r.count || 1;
  // 放入当前快捷栏格
  putInSlot(currentSlot, res);
  // 清空合成格(创造模式不消耗材料,但仍清空格表示完成)
  for (let i = 0; i < 4; i++) craftGrid[i] = null;
  renderCraftGrid();
  refreshCraftResult();
  showToast('合成:' + r.name + ' ×' + res.count);
  audio.play('place');
}

function clearCraftGrid() {
  for (let i = 0; i < 4; i++) craftGrid[i] = null;
  renderCraftGrid();
  refreshCraftResult();
}

// ============================================================
// 第十八部分:音效系统(Web Audio 程序化合成)
// ============================================================
const audio = {
  ctx: null,
  masterGain: null,
  enabled: true,
  volume: 0.35,
  noiseBuffer: null,
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.enabled ? this.volume : 0;
      this.masterGain.connect(this.ctx.destination);
      // 预生成白噪声 buffer
      const len = this.ctx.sampleRate * 0.5;
      this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) {
      this.enabled = false;
    }
  },
  play(type, blockType) {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    // 破坏音按方块类型调频率:石=低频,木=中频,叶=沙沙,沙/雪=高频软
    if (type === 'break' && blockType) {
      let freq = 600;
      if (blockType === 'stone' || blockType === 'brick') freq = 350;
      else if (blockType === 'wood' || blockType === 'planks') freq = 500;
      else if (blockType === 'leaves') freq = 900;
      else if (blockType === 'sand' || blockType === 'snow' || blockType === 'gravel') freq = 1200;
      this._noise(0.12, freq, 0.4, t);
      return;
    }
    switch (type) {
      case 'break': this._noise(0.12, 600, 0.4, t); break;
      case 'place': this._tone('square', 220, 0.07, 0.3, t); this._tone('square', 160, 0.06, 0.25, t + 0.03); break;
      case 'step':  this._noise(0.05, 1200, 0.15, t); break;
      case 'jump':  this._sweep(300, 600, 0.12, t); break;
      case 'water': this._tone('sine', 180, 0.4, 0.25, t); this._tone('sine', 240, 0.4, 0.15, t + 0.05); break;
      case 'hurt':  this._tone('sawtooth', 200, 0.15, 0.3, t); break;
    }
  },
  _tone(wave, freq, dur, gain, t0) {
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = wave; osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(this.masterGain);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  },
  _noise(dur, filterFreq, gain, t0) {
    if (!this.noiseBuffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass'; filt.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filt); filt.connect(g); g.connect(this.masterGain);
    src.start(t0); src.stop(t0 + dur + 0.02);
  },
  _sweep(f0, f1, dur, t0) {
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(f0, t0);
    osc.frequency.linearRampToValueAtTime(f1, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(this.masterGain);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  },
};

// ============================================================
// 第十九部分:存档/读档(IndexedDB)
// ============================================================

// ============================================================
// 设置持久化(localStorage)
// ============================================================
const SETTINGS_KEY = 'myword_settings';
let settings = { volume: 0.35, soundEnabled: true, fov: 75, renderDist: 5, dropItems: false, dayNightEnabled: true, dayCycleSpeed: 120 };
function loadSettings() {
  try {
    const s = localStorage.getItem(SETTINGS_KEY);
    if (s) Object.assign(settings, JSON.parse(s));
  } catch (e) {}
  // 应用设置
  if (audio.masterGain) audio.masterGain.gain.value = settings.soundEnabled ? settings.volume : 0;
  audio.enabled = settings.soundEnabled;
  audio.volume = settings.volume;
  dropItems = settings.dropItems;
  RENDER_DISTANCE = settings.renderDist;
  FOG_FAR = (RENDER_DISTANCE * CHUNK_SIZE) + 8;
  // 刷新暂停菜单按钮标签(与持久化设置同步)
  const bs = document.getElementById('btn-sound');
  if (bs) bs.textContent = '音效:' + (settings.soundEnabled ? '开' : '关');
  const bd = document.getElementById('btn-drops');
  if (bd) bd.textContent = '掉落物:' + (settings.dropItems ? '开' : '关');
}
function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) {}
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
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const d = e.target.result;
      const tx = e.target.transaction;
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
    const rec = {
      name: name || ('存档 ' + new Date().toLocaleString('zh-CN')),
      seed: worldSeed,
      playerPos: { x: playerPos.x, y: playerPos.y, z: playerPos.z },
      yaw, pitch, cameraMode, isFlying,
      playerHP, breathTimer: 0,
      hotbar, currentSlot,
      modifications: Array.from(modifications.entries()),
      cropTimersData: Array.from(cropTimers.entries()),
      doorsData: Array.from(doors.entries()).map(function(e){return [e[0], {x:e[1].x,y:e[1].y,z:e[1].z,type:e[1].type,open:e[1].open,facing:e[1].facing}];}),
      timestamp: Date.now(),
    };
    const tx = db.transaction(STORE, 'readwrite');
    return new Promise((resolve) => {
      const r = tx.objectStore(STORE).add(rec);
      r.onsuccess = () => { currentSaveId = r.result; resolve(r.result); };
      r.onerror = () => resolve(null);
    });
  } catch (e) { return null; }
}

// 覆盖保存当前存档(若 currentSaveId 存在)
async function saveGame() {
  if (currentSaveId !== null) return overwriteSave(currentSaveId);
  return saveSlot();  // 无当前存档则新建
}
async function overwriteSave(id) {
  try {
    const db = await openDB();
    if (!db) return false;
    const rec = {
      id, name: ('存档 ' + new Date().toLocaleString('zh-CN')),
      seed: worldSeed,
      playerPos: { x: playerPos.x, y: playerPos.y, z: playerPos.z },
      yaw, pitch, cameraMode, isFlying,
      playerHP, breathTimer: 0,
      hotbar, currentSlot,
      doorsData: Array.from(doors.entries()).map(function(e){return [e[0], {x:e[1].x,y:e[1].y,z:e[1].z,type:e[1].type,open:e[1].open,facing:e[1].facing}];}),
      modifications: Array.from(modifications.entries()),  // C2:不能丢失!
      cropTimersData: Array.from(cropTimers.entries()),
      timestamp: Date.now(),
    };
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

// ============================================================
// 第二十部分:启动
// ============================================================
init();
setupInput();
updateInfoCount();
animate();

// 检测是否有存档,显示"继续游戏"入口
hasSave().then(exists => {
  const cont = document.getElementById('btn-continue');
  if (cont) cont.style.display = exists ? '' : 'none';
});
