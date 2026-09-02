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
  crafting_table: { name: '合成台', top: '#a0763a', side: '#8a6430', bottom: '#b08243', solid: true, tool: 'axe', hardness: 1.2 },
  // 经典采矿循环方块:圆石 + 三种矿石
  cobblestone: { name: '圆石',   top: '#828282', side: '#7a7a7a', bottom: '#6f6f6f', solid: true, tool: 'pickaxe', hardness: 2.0 },
  coal_ore:     { name: '煤矿',   top: '#888888', side: '#7c7c7c', bottom: '#6e6e6e', solid: true, tool: 'pickaxe', hardness: 3.0 },
  iron_ore:     { name: '铁矿',   top: '#888888', side: '#7c7c7c', bottom: '#6e6e6e', solid: true, tool: 'pickaxe', hardness: 3.0 },
  diamond_ore:  { name: '钻石矿', top: '#888888', side: '#7c7c7c', bottom: '#6e6e6e', solid: true, tool: 'pickaxe', hardness: 3.0 },
  tnt:          { name: 'TNT',     top: '#b03a2e', side: '#a83226', bottom: '#8a2820', solid: true, tool: 'any', hardness: 0.5 },
  furnace:      { name: '熔炉',   top: '#888888', side: '#7c7c7c', bottom: '#6e6e6e', solid: true, tool: 'pickaxe', hardness: 3.5 },
  glass:        { name: '玻璃',   top: '#c8e6f0', side: '#c8e6f0', bottom: '#c8e6f0', solid: true, tool: 'any', hardness: 0.4 },
  bed:          { name: '床',     top: '#c0392b', side: '#8a2820', bottom: '#6e4f2a', solid: true, tool: 'axe', hardness: 0.3 },
  chest:        { name: '箱子',   top: '#a0763a', side: '#96682e', bottom: '#8a5f28', solid: true, tool: 'axe', hardness: 1.8 },
  ladder:       { name: '梯子',   top: '#9a6b3f', side: '#9a6b3f', bottom: '#9a6b3f', solid: false, tool: 'axe', hardness: 0.5 },
  torch:        { name: '火把',   top: '#ffd86b', side: '#ffd86b', bottom: '#8a6430', solid: false, tool: 'any', hardness: 0.05, light: 14 },
  rail:         { name: '铁轨',   top: '#b8b8c0', side: '#b8b8c0', bottom: '#b8b8c0', solid: false, tool: 'pickaxe', hardness: 0.5 },
  enchanting_table: { name: '附魔台', top: '#2a1a3a', side: '#1a1024', bottom: '#1a1024', solid: true, tool: 'pickaxe', hardness: 3 },
  bookshelf:    { name: '书架',   top: '#a0763a', side: '#96682e', bottom: '#8a5f28', solid: true, tool: 'axe', hardness: 1.5 },
};
const HOTBAR_ORDER = ['grass', 'dirt', 'stone', 'wood', 'leaves', 'sand', 'planks', 'brick'];

// 方块数字 id(用于紧凑的 Uint8Array 区块存储)
const BLOCK_ID = { air: 0, grass: 1, dirt: 2, stone: 3, wood: 4, leaves: 5, sand: 6, planks: 7, brick: 8, water: 9, snow: 10, gravel: 11, wool_red: 12, wool_yellow: 13, wool_white: 14, wool_black: 15, door: 16, door_iron: 17, door_stone: 18, door_gold: 19, door_diamond: 20, crafting_table: 21, cobblestone: 22, coal_ore: 23, iron_ore: 24, diamond_ore: 25, tnt: 26, furnace: 27, glass: 28, bed: 29, chest: 30, ladder: 31, bookshelf: 32, torch: 33, rail: 34, enchanting_table: 35 };
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
  // ---- 护甲(4 部位 × 4 材质;armor=护甲点数,每点 4% 减伤,经典数值) ----
  helmet_leather:      { name: '皮革帽子',  tool: 'armor', slot: 'head',  armor: 1, durability: 55,  tier: 'leather' },
  chestplate_leather:  { name: '皮革上衣',  tool: 'armor', slot: 'chest', armor: 3, durability: 80,  tier: 'leather' },
  leggings_leather:    { name: '皮革裤子',  tool: 'armor', slot: 'legs',  armor: 2, durability: 75,  tier: 'leather' },
  boots_leather:       { name: '皮革鞋子',  tool: 'armor', slot: 'feet',  armor: 1, durability: 65,  tier: 'leather' },
  helmet_iron:         { name: '铁头盔',    tool: 'armor', slot: 'head',  armor: 2, durability: 165, tier: 'iron' },
  chestplate_iron:     { name: '铁胸甲',    tool: 'armor', slot: 'chest', armor: 6, durability: 240, tier: 'iron' },
  leggings_iron:       { name: '铁护腿',    tool: 'armor', slot: 'legs',  armor: 5, durability: 225, tier: 'iron' },
  boots_iron:          { name: '铁靴子',    tool: 'armor', slot: 'feet',  armor: 2, durability: 195, tier: 'iron' },
  helmet_gold:         { name: '金头盔',    tool: 'armor', slot: 'head',  armor: 2, durability: 77,  tier: 'gold' },
  chestplate_gold:     { name: '金胸甲',    tool: 'armor', slot: 'chest', armor: 5, durability: 112, tier: 'gold' },
  leggings_gold:       { name: '金护腿',    tool: 'armor', slot: 'legs',  armor: 3, durability: 105, tier: 'gold' },
  boots_gold:          { name: '金靴子',    tool: 'armor', slot: 'feet',  armor: 1, durability: 91,  tier: 'gold' },
  helmet_diamond:      { name: '钻石头盔',  tool: 'armor', slot: 'head',  armor: 3, durability: 363, tier: 'diamond' },
  chestplate_diamond:  { name: '钻石胸甲',  tool: 'armor', slot: 'chest', armor: 8, durability: 528, tier: 'diamond' },
  leggings_diamond:    { name: '钻石护腿',  tool: 'armor', slot: 'legs',  armor: 6, durability: 495, tier: 'diamond' },
  boots_diamond:       { name: '钻石靴子',  tool: 'armor', slot: 'feet',  armor: 3, durability: 461, tier: 'diamond' },
  bow:          { name: '弓',     tool: 'bow',     durability: 384, tier: 'wood' },
};
const TOOL_ORDER = [
  'sword_diamond','sword_gold','sword_iron','sword_stone','sword_wood',
  'pickaxe_diamond','pickaxe_gold','pickaxe_iron','pickaxe_stone','pickaxe_wood',
  'axe_diamond','axe_gold','axe_iron','axe_stone','axe_wood',
  'shovel_diamond','shovel_gold','shovel_iron','shovel_stone','shovel_wood',
  'bow',
  'shield_diamond','shield_iron','shield_wood',
  'chestplate_diamond','leggings_diamond','helmet_diamond','boots_diamond',
  'chestplate_iron','leggings_iron','helmet_iron','boots_iron',
  'chestplate_gold','leggings_gold','helmet_gold','boots_gold',
  'chestplate_leather','leggings_leather','helmet_leather','boots_leather',
];
const ITEM_TYPES = {
  gem_diamond: { name: '钻石',   color: '#5fe3e8', shape: 'gem' },
  gem_gold:    { name: '金锭',   color: '#ffd54a', shape: 'ingot' },
  gem_emerald: { name: '绿宝石', color: '#3fd17a', shape: 'gem' },
  arrow:       { name: '箭',     color: '#caa472', shape: 'arrow' },
  porkchop:    { name: '猪排',   color: '#e8938a', shape: 'meat' },
  apple:       { name: '苹果',   color: '#d63a2f', shape: 'apple' },
  stick:       { name: '木棍',   color: '#9a6b3f', shape: 'stick' },
  coal:        { name: '煤炭',   color: '#262626', shape: 'gem' },
  iron_ingot:  { name: '铁锭',   color: '#d8d8e0', shape: 'ingot' },
  cooked_porkchop: { name: '熟猪排', color: '#b56b46', shape: 'meat' },
  beef:        { name: '生牛肉', color: '#c04040', shape: 'meat' },
  steak:       { name: '牛排',   color: '#8a4a2e', shape: 'meat' },
  mutton:      { name: '羊肉',   color: '#d07868', shape: 'meat' },
  leather:     { name: '皮革',   color: '#a8784a', shape: 'ingot' },
  book:        { name: '书',     color: '#b03030', shape: 'book' },
  minecart:    { name: '矿车',   color: '#b8b8c0', shape: 'cart' },
  string:      { name: '蛛丝',   color: '#e8e8e8', shape: 'stick' },
  ender_pearl: { name: '末影珍珠', color: '#b06ee0', shape: 'gem' },
};
const ITEM_ORDER = ['gem_diamond','gem_gold','gem_emerald','arrow','porkchop','cooked_porkchop','beef','steak','mutton','apple','stick','coal','iron_ingot','leather','book','minecart','string','ender_pearl'];
// 食物表与堆叠上限来自纯函数模块 inventory.js(INVLIB)
const FOODS = INVLIB.FOODS;

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
        // 草皮过渡:每列不规则高度(2-5px)锯齿 + 底边深绿描边,贴近经典 MC 侧面
        const g = parseHex(def.top);
        for (let x = 0; x < s; x++) {
          const h = 2 + Math.floor(seedRand() * 4);
          for (let y = 0; y < h; y++) {
            const d = (seedRand() - 0.5) * 40;
            ctx.fillStyle = rgbStr(g.r + d, g.g + d, g.b + d * 0.5);
            ctx.fillRect(x, y, 1, 1);
          }
          // 草皮与泥土交界:深绿过渡行
          ctx.fillStyle = rgbStr(g.r - 34, g.g - 22, g.b - 10);
          ctx.fillRect(x, h, 1, 1);
        }
      } else noise(40);
      break;
    case 'stone': {
      // 石头:噪点 + 2-3 条随机裂纹折线(深灰)
      noise(40);
      ctx.strokeStyle = 'rgba(72,72,72,0.7)';
      ctx.lineWidth = 1;
      const cracks = 2 + Math.floor(seedRand() * 2);
      for (let i = 0; i < cracks; i++) {
        let cx = seedRand() * s, cy = seedRand() * s;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        const segs = 3 + Math.floor(seedRand() * 3);
        for (let k = 0; k < segs; k++) {
          cx = Math.max(0, Math.min(s - 1, cx + (seedRand() - 0.5) * 8));
          cy = Math.max(0, Math.min(s - 1, cy + (seedRand() - 0.5) * 8));
          ctx.lineTo(cx, cy);
        }
        ctx.stroke();
      }
      break;
    }
    case 'planks': {
      // 木板:横向板缝 + 错位竖缝 + 木纹短线
      noise(15);
      ctx.fillStyle = 'rgba(60,40,15,0.55)';
      for (let y = 0; y < s; y += 4) ctx.fillRect(0, y, s, 1);
      ctx.fillRect(Math.floor(s * 0.25), 0, 1, 4);
      ctx.fillRect(Math.floor(s * 0.7), 4, 1, 4);
      ctx.fillRect(Math.floor(s * 0.4), 8, 1, 4);
      ctx.fillRect(Math.floor(s * 0.8), 12, 1, 4);
      ctx.fillStyle = 'rgba(130,92,45,0.4)';
      for (let i = 0; i < 8; i++) ctx.fillRect((seedRand() * (s - 2)) | 0, (seedRand() * s) | 0, 2, 1);
      break;
    }
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
        // 年轮(双圈密纹,深浅交替 + 中心木芯点)
        ctx.strokeStyle = 'rgba(70,45,20,0.75)';
        ctx.lineWidth = 1;
        const cx = s / 2, cy = s / 2;
        for (let r = 2; r < s / 2; r += 2) { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke(); }
        ctx.fillStyle = 'rgba(90,60,30,0.6)';
        ctx.fillRect(cx - 0.5, cy - 0.5, 1.5, 1.5);
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
    case 'cobblestone': {
      // 圆石:石底 + 深色卵石裂缝网
      noise(22);
      ctx.strokeStyle = 'rgba(40,40,40,0.55)';
      ctx.lineWidth = 1;
      for (let gy = 0; gy < s; gy += Math.floor(s / 4)) {
        ctx.beginPath();
        ctx.moveTo(0, gy + Math.floor(seedRand() * 3));
        for (let gx = 0; gx <= s; gx += 4) ctx.lineTo(gx, gy + Math.floor(seedRand() * 4));
        ctx.stroke();
      }
      break;
    }
    case 'bookshelf': {
      // 书架:木框 + 侧面三层彩色书脊(确定性),顶/底木板纹
      if (face === 'top' || face === 'bottom') { noise(18); break; }
      noise(18);
      ctx.fillStyle = '#6e4f2a';
      ctx.fillRect(0, 0, s, 2);
      ctx.fillRect(Math.floor(s / 3), 2, 2, Math.floor(s / 3));
      ctx.fillRect(Math.floor(s * 2 / 3), 2, 2, Math.floor(s / 3));
      ctx.fillRect(0, Math.floor(s / 3), s, 2);
      ctx.fillRect(Math.floor(s / 4), Math.floor(s / 3) + 2, 2, Math.floor(s / 3));
      ctx.fillRect(Math.floor(s * 3 / 4), Math.floor(s / 3) + 2, 2, Math.floor(s / 3));
      ctx.fillRect(0, Math.floor(s * 2 / 3), s, 2);
      ctx.fillRect(0, s - 2, s, 2);
      // 书脊(三层,确定性颜色)
      const spineColors = ['#a03030', '#3a6a3a', '#3050a0', '#a08030', '#7a3a7a'];
      let li = 0;
      for (let row = 0; row < 3; row++) {
        const y0 = 3 + row * Math.floor(s / 3);
        let x = 3;
        while (x < s - 3) {
          const w = 1 + Math.floor(seedRand() * 2);
          if (seedRand() < 0.82) {
            ctx.fillStyle = spineColors[li % spineColors.length];
            li++;
            ctx.fillRect(x, y0, w, Math.floor(s / 3) - 3);
          }
          x += w + 1;
        }
      }
      break;
    }
    case 'ladder': {
      // 梯子:两根竖轨 + 横档,间隙透明(alphaTest);攀爬体积(非固体)
      ctx.clearRect(0, 0, s, s);
      const rw = Math.max(1, Math.floor(s / 9));
      const railX0 = Math.floor(s * 0.18);
      const railX1 = s - Math.floor(s * 0.18) - rw;
      ctx.fillStyle = '#8a5a30';
      ctx.fillRect(railX0, 0, rw, s);
      ctx.fillRect(railX1, 0, rw, s);
      ctx.fillStyle = '#b5824f';
      const step = Math.max(2, Math.floor(s / 4));
      for (let gy = Math.floor(step * 0.5); gy < s; gy += step) {
        ctx.fillRect(railX0, gy, railX1 + rw - railX0, rw);
      }
      break;
    }
    case 'bed': {
      // 床:顶面 = 白枕头(头端 1/3)+ 红毯;侧面红毯+木底
      if (face === 'top') {
        ctx.fillStyle = '#f0f0f0';
        ctx.fillRect(0, 0, s, Math.floor(s / 3));
        ctx.fillStyle = '#b03028';
        ctx.fillRect(0, Math.floor(s / 3), s, s - Math.floor(s / 3));
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.fillRect(0, Math.floor(s / 3), s, 2);
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        for (let gx = 0; gx < s; gx += 4) ctx.fillRect(gx, Math.floor(s / 3) + 3, 1, s);
      } else {
        ctx.fillStyle = col; ctx.fillRect(0, 0, s, s);
        ctx.fillStyle = '#8a5f28';
        ctx.fillRect(0, Math.floor(s * 0.8), s, Math.floor(s * 0.2));
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fillRect(0, Math.floor(s * 0.35), s, 2);
      }
      break;
    }
    case 'chest': {
      // 箱子:木板底 + 深色箱沿 + 中间搭扣
      noise(18);
      ctx.fillStyle = 'rgba(70,45,18,0.85)';
      ctx.fillRect(0, 0, s, 2);
      ctx.fillRect(0, Math.floor(s * 0.42), s, 2);
      ctx.fillRect(0, s - 2, s, 2);
      ctx.fillRect(0, 0, 2, s);
      ctx.fillRect(s - 2, 0, 2, s);
      ctx.fillStyle = '#d8d8d8';
      ctx.fillRect(Math.floor(s / 2) - 1, Math.floor(s * 0.42), 3, Math.floor(s * 0.18));
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(3, 3, s - 6, 2);
      break;
    }
    case 'furnace': {
      // 熔炉:石底 + 深色炉口 + 炉火 + 顶部通风口
      noise(25);
      ctx.fillStyle = '#2a2a2a';
      ctx.fillRect(Math.floor(s * 0.2), Math.floor(s * 0.45), Math.floor(s * 0.6), Math.floor(s * 0.35));
      ctx.fillStyle = '#ff8830';
      ctx.fillRect(Math.floor(s * 0.28), Math.floor(s * 0.62), Math.floor(s * 0.44), Math.floor(s * 0.14));
      ctx.fillStyle = '#3a3a3a';
      ctx.fillRect(Math.floor(s * 0.3), Math.floor(s * 0.2), Math.floor(s * 0.4), Math.floor(s * 0.12));
      break;
    }
    case 'enchanting_table': {
      // 附魔台(R28):暗紫底 + 石台 + 红书页 + 钻石亮点
      noise(14);
      ctx.fillStyle = '#1a1024';
      ctx.fillRect(0, 0, s, s);
      ctx.fillStyle = '#3a2a4a';
      ctx.fillRect(0, Math.floor(s * 0.62), s, Math.floor(s * 0.38));
      ctx.fillStyle = '#d8d8e0';
      ctx.fillRect(Math.floor(s * 0.18), Math.floor(s * 0.5), Math.floor(s * 0.64), Math.floor(s * 0.14));
      ctx.fillStyle = '#a03030';
      ctx.fillRect(Math.floor(s * 0.3), Math.floor(s * 0.14), Math.floor(s * 0.4), Math.floor(s * 0.32));
      ctx.fillStyle = '#5fe3e8';
      ctx.fillRect(Math.floor(s * 0.42), Math.floor(s * 0.2), Math.floor(s * 0.16), Math.floor(s * 0.18));
      ctx.fillStyle = 'rgba(95,227,232,0.5)';
      ctx.fillRect(Math.floor(s * 0.08), Math.floor(s * 0.08), Math.floor(s * 0.1), Math.floor(s * 0.1));
      ctx.fillRect(Math.floor(s * 0.82), Math.floor(s * 0.3), Math.floor(s * 0.1), Math.floor(s * 0.1));
      break;
    }
    case 'rail': {
      // 铁轨(R26):顶/底面 = 俯视轨道(双钢轨 + 横向枕木);侧面 = 仅底部薄轨线(贴地,透明挖空)
      ctx.clearRect(0, 0, s, s);
      if (face === 'top' || face === 'bottom') {
        ctx.fillStyle = '#6e4f2a';
        for (let i = 0; i < 4; i++) ctx.fillRect(0, Math.floor(s * (0.1 + i * 0.24)), s, Math.max(1, Math.floor(s * 0.1)));
        ctx.fillStyle = '#b8b8c0';
        ctx.fillRect(Math.floor(s * 0.3), 0, Math.max(1, Math.floor(s * 0.08)), s);
        ctx.fillRect(Math.floor(s * 0.62), 0, Math.max(1, Math.floor(s * 0.08)), s);
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.fillRect(Math.floor(s * 0.3), 0, Math.max(1, Math.floor(s * 0.03)), s);
      } else {
        ctx.fillStyle = '#b8b8c0';
        ctx.fillRect(0, s - Math.max(1, Math.floor(s * 0.1)), s, Math.max(1, Math.floor(s * 0.1)));
        ctx.fillStyle = '#6e4f2a';
        ctx.fillRect(Math.floor(s * 0.18), s - Math.max(1, Math.floor(s * 0.08)), Math.floor(s * 0.2), Math.max(1, Math.floor(s * 0.06)));
        ctx.fillRect(Math.floor(s * 0.62), s - Math.max(1, Math.floor(s * 0.08)), Math.floor(s * 0.2), Math.max(1, Math.floor(s * 0.06)));
      }
      break;
    }
    case 'torch': {
      // 火把:透明底(alphaTest)+ 细木棍 + 发光头部(火焰芯 + 光晕)
      ctx.clearRect(0, 0, s, s);
      ctx.fillStyle = '#8a6430';
      ctx.fillRect(Math.floor(s * 0.44), Math.floor(s * 0.32), Math.max(1, Math.floor(s * 0.12)), Math.floor(s * 0.62));
      ctx.fillStyle = 'rgba(120,80,40,0.5)';
      ctx.fillRect(Math.floor(s * 0.52), Math.floor(s * 0.32), Math.max(1, Math.floor(s * 0.05)), Math.floor(s * 0.62));
      ctx.fillStyle = '#ffd86b';
      ctx.fillRect(Math.floor(s * 0.38), Math.floor(s * 0.18), Math.floor(s * 0.24), Math.floor(s * 0.18));
      ctx.fillStyle = '#ff9a3c';
      ctx.fillRect(Math.floor(s * 0.42), Math.floor(s * 0.12), Math.floor(s * 0.16), Math.floor(s * 0.1));
      ctx.fillStyle = 'rgba(255,200,90,0.35)';
      ctx.fillRect(Math.floor(s * 0.3), Math.floor(s * 0.06), Math.floor(s * 0.4), Math.floor(s * 0.3));
      break;
    }
    case 'glass': {
      // 玻璃:浅色边框 + 斜高光,中心透明(alphaTest 挖空)
      ctx.clearRect(0, 0, s, s);
      ctx.strokeStyle = 'rgba(205,232,240,0.9)';
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, 0.5, s - 1, s - 1);
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath(); ctx.moveTo(s * 0.58, s * 0.16); ctx.lineTo(s * 0.84, s * 0.42); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(s * 0.7, s * 0.1); ctx.lineTo(s * 0.9, s * 0.3); ctx.stroke();
      break;
    }
    case 'tnt': {
      // TNT:红底 + 白色中带 + 深色字样点
      noise(20);
      ctx.fillStyle = '#e8e0d0';
      ctx.fillRect(0, Math.floor(s * 0.4), s, Math.floor(s * 0.22));
      ctx.fillStyle = '#3a2a20';
      const gy = Math.floor(s * 0.46);
      ctx.fillRect(Math.floor(s * 0.16), gy, 1, Math.floor(s * 0.1));
      ctx.fillRect(Math.floor(s * 0.3), gy, Math.floor(s * 0.08), 1);
      ctx.fillRect(Math.floor(s * 0.3), gy, 1, Math.floor(s * 0.1));
      ctx.fillRect(Math.floor(s * 0.46), gy, 1, Math.floor(s * 0.1));
      ctx.fillRect(Math.floor(s * 0.58), gy, Math.floor(s * 0.08), 1);
      ctx.fillRect(Math.floor(s * 0.66), gy, 1, Math.floor(s * 0.1));
      ctx.fillRect(Math.floor(s * 0.8), gy, 1, Math.floor(s * 0.1));
      ctx.fillRect(Math.floor(s * 0.76), gy + Math.floor(s * 0.08), Math.floor(s * 0.08), 1);
      break;
    }
    case 'coal_ore':
    case 'iron_ore':
    case 'diamond_ore': {
      // 矿石:石底 + 分层色斑(暗色外圈 → 矿色内芯 → 高光点),立体矿粒感
      noise(25);
      const speck = type === 'coal_ore' ? '#232323' : type === 'iron_ore' ? '#d8af8a' : '#5fe3e8';
      const speckDark = type === 'coal_ore' ? 'rgba(10,10,10,0.55)' : type === 'iron_ore' ? 'rgba(120,80,50,0.5)' : 'rgba(30,110,130,0.5)';
      const spots = 4 + Math.floor(seedRand() * 2);
      for (let i = 0; i < spots; i++) {
        const px = 1 + Math.floor(seedRand() * (s - 4));
        const py = 1 + Math.floor(seedRand() * (s - 4));
        ctx.fillStyle = speckDark;
        ctx.fillRect(px - 1, py - 1, 4, 4);      // 暗色外圈(嵌入感)
        ctx.fillStyle = speck;
        ctx.fillRect(px, py, 2, 2);               // 矿色内芯
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.fillRect(px, py, 1, 1);               // 高光点
      }
      break;
    }
    case 'crafting_table': {
      // 合成台:木板底 + 顶面 3×3 网格纹 + 侧面工具图案
      ctx.fillStyle = col; ctx.fillRect(0, 0, s, s);
      if (face === 'top') {
        ctx.fillStyle = 'rgba(60,40,20,0.55)';
        const g = Math.floor(s / 3);
        for (let i = 1; i < 3; i++) { ctx.fillRect(g * i, 0, 1, s); ctx.fillRect(0, g * i, s, 1); }
        ctx.strokeStyle = 'rgba(60,40,20,0.8)'; ctx.lineWidth = 1;
        ctx.strokeRect(0.5, 0.5, s - 1, s - 1);
      } else {
        ctx.fillStyle = 'rgba(60,40,20,0.75)';
        ctx.fillRect(Math.floor(s * 0.15), Math.floor(s * 0.2), Math.floor(s * 0.28), Math.floor(s * 0.28));
        ctx.fillRect(Math.floor(s * 0.57), Math.floor(s * 0.2), Math.floor(s * 0.28), Math.floor(s * 0.1));
        ctx.fillStyle = 'rgba(220,210,190,0.5)';
        ctx.fillRect(Math.floor(s * 0.2), Math.floor(s * 0.55), Math.floor(s * 0.6), Math.floor(s * 0.08));
      }
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
  // R22 火把光照:顶点 aTorch 属性注入自发光 —— 与场景昼夜光解耦,夜晚火光不灭。
  // emissive = 纹理色 × 面烘焙色 × 光级曲线 × uTorchGlow(暖色偏置)
  matSolidChunk.onBeforeCompile = (shader) => {
    shader.uniforms.uTorchGlow = torchGlowUniform;
    shader.vertexShader = 'attribute float aTorch;\nattribute float aSky;\nvarying float vTorch;\nvarying float vSky;\n' + shader.vertexShader
      .replace('#include <color_vertex>', '#include <color_vertex>\n\tvTorch = aTorch;\n\tvSky = aSky;');
    // 火光 emissive:diffuseColor 已含天光遮蔽(vColor = 面色 × 天光),火把光不应被遮蔽 ——
    // 除回 vSky(下限 0.34 防爆)补偿;地表 vSky=1 时与原行为完全一致
    shader.fragmentShader = 'uniform float uTorchGlow;\nvarying float vTorch;\nvarying float vSky;\n' + shader.fragmentShader
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += diffuseColor.rgb * (vTorch * uTorchGlow) * vec3(1.0, 0.92, 0.78) * (1.0 / max(vSky, 0.34));');
  };
  matSolidChunk.customProgramCacheKey = () => 'torchglow';
  // 水用 MeshBasicMaterial(不受光照影响,显示纯清水蓝;Lambert 受法线/光照会压暗变灰)
  matWaterChunk = new THREE.MeshBasicMaterial({ color: 0x2a8fd6, transparent: true, opacity: 0.78, depthWrite: false });
}

// 给图标/手持物用的独立材质(保留旧的单方块材质,用于 UI 图标和手持模型)
let materials = {};
function makeBlockMaterials(type) {
  let st = (BLOCK_ID[type] * 2654435761) >>> 0;
  const rand = () => { st = (st * 1664525 + 1013904223) >>> 0; return st / 4294967296; };

  const faceTex = (face) => makePixelTexture((ctx, s) => drawBlockFace(ctx, type, face, s, rand));
  const top = faceTex('top'), side = faceTex('side'), bottom = faceTex('bottom');
  const M = (map) => new THREE.MeshLambertMaterial({ map });
  if (type === 'leaves') {
    const lm = M(side); lm.transparent = true; lm.alphaTest = 0.1;
    return [lm, lm.clone(), M(top), M(bottom), lm.clone(), lm.clone()];
  }
  if (type === 'torch') {
    // 火把:透明贴图(手持/图标用,与树叶同款 alphaTest)
    const tm = M(side); tm.transparent = true; tm.alphaTest = 0.1;
    return [tm, tm.clone(), M(top), M(bottom), tm.clone(), tm.clone()];
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
      const height = heightAt(wx, wz, worldSeed, biome, mtn);
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

      // 矿石(确定性,复刻经典采矿循环):石头层内按 hash 生成矿点;
      // 煤 1.2% / 铁 0.7%,钻石 0.3% 且仅在 y<12 深层
      for (let y = 1; y < height - 3; y++) {
        const idx2 = chunkIdx(lx, y, lz);
        if (data[idx2] !== BLOCK_ID.stone) continue;
        const r = hash3(wx, y, wz, worldSeed + 4242);
        if (r < 0.012) data[idx2] = BLOCK_ID.coal_ore;
        else if (r < 0.019) data[idx2] = BLOCK_ID.iron_ore;
        else if (r < 0.022 && y < 12) data[idx2] = BLOCK_ID.diamond_ore;
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

  // 应用玩家改动 diff(只遍历本区块桶,避免全量 16×48×16 字符串 key 探测)
  const bucket = modsByChunk.get(chunkKey(cx, cz));
  if (bucket) {
    for (const [idx, t] of bucket) data[idx] = t ? BLOCK_ID[t] : 0;
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
      const r = hash2(wx, wz, worldSeed + 999);
      if (r >= 0.12) continue;   // 预过滤:所有群系 treeChance ≤ 0.12,r 偏大必不种树
      const biome = biomeAt(wx, wz, worldSeed);
      const b = BIOMES[biome];
      if (b.treeChance <= 0) continue;
      const height = heightAt(wx, wz, worldSeed, biome);
      if (height <= SEA_LEVEL) continue;
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
  const sources = [];
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
    const bucket = modsByChunk.get(chunkKey(cx + dx, cz + dz));
    if (!bucket) continue;
    for (const [cidx, type] of bucket) {
      if (type !== 'torch') continue;
      const y = (cidx / (CHUNK_SIZE * CHUNK_SIZE)) | 0, rem = cidx % (CHUNK_SIZE * CHUNK_SIZE);
      const lz = (rem / CHUNK_SIZE) | 0, lx = rem % CHUNK_SIZE;
      sources.push((cx + dx) * CHUNK_SIZE + lx, y, (cz + dz) * CHUNK_SIZE + lz);
    }
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
          for (let k = 0; k < 4; k++) {
            tgtP.push(wx + base[k][0], y + base[k][1], wz + base[k][2]);
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

  // 分帧构建 mesh:从 dirtyChunks 挑最近的 budget 个(不分配数组、不排序)
  let buildLeft = chunkMeshBuildBudget;
  while (buildLeft > 0 && dirtyChunks.size > 0) {
    let best = null, bestD = Infinity;
    for (const ch of dirtyChunks) {
      const d = (ch.cx - pcx) * (ch.cx - pcx) + (ch.cz - pcz) * (ch.cz - pcz);
      if (d < bestD) { bestD = d; best = ch; }
    }
    buildChunkMesh(best);   // 内部重置 meshDirty 并从 dirtyChunks 移除
    buildLeft--;
  }
}

// ============================================================
// 第七部分:全局状态(玩家/物品/视角)
// ============================================================
let scene, camera, renderer;
const PLAYER_HEIGHT = 1.8;
const PLAYER_RADIUS = 0.3;
const GRAVITY = 26;
const JUMP_SPEED = 9;
const WALK_SPEED = 5.5;
const FLY_SPEED = 9;

let selectedType = 'grass';

let hotbar = [];
const HOTBAR_SIZE = 9;

const keys = {};
let pitch = 0, yaw = 0;
let isFlying = false;
let onGround = false;
let cameraMode = 0;
let playerModel = null;

let holdGroup = null;
let holdSwingT = 0;
let shieldActive = 0;
let raisedShield = null;   // 举盾时手持的盾引用(格挡成功扣耐久用)

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
      setTimeout(() => { try { src.stop(); } catch (e2) {} }, 1600);
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
  if (!item) return;

  let base;
  if (item.kind === 'block') {
    base = new THREE.Mesh(blockGeo, materials[item.id]);   // 1x1x1
  } else if (item.kind === 'tool') {
    base = buildToolMesh(item.id);                          // Group,内部已缩放好
  } else if (item.kind === 'item') {
    base = buildMaterialMesh(item.id);                      // Group
  } else { return; }

  // 第一人称(屏幕右下)
  if (holdGroup) {
    const fp = base.clone();
    if (item.kind === 'block') { fp.scale.setScalar(0.42); fp.rotation.set(0.2, 0.55, 0); }
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

// ============================================================
// 第十一部分:初始化
// ============================================================
// 经典 MC 标题屏:程序化泥土像素贴图平铺 + 半透明暗化(CSS 渐变叠加)
// ============================================================
// 新手教程(分步引导 + 完成自动检测;localStorage 记忆已完成)
// 步骤定义与推进状态机提取到纯模块 machines.js(R25 治理轮,可单测)
// ============================================================
const TUTORIAL_STEPS = MACHINES.TUTORIAL_STEPS;

const tutorial = {
  active: false,
  step: 0,
  progress: {},   // 各检测类型的累计量
};

function tutorialStep() { return TUTORIAL_STEPS[tutorial.step]; }

// 步骤描述动态化:place 步骤检测当前手持是否为方块,不是则追加引导
function tutorialDesc(s) {
  if (s.id === 'place') {
    const held = hotbar[currentSlot];
    if (!held || held.kind !== 'block') return s.desc + '<br><b style="color:#8a4a20;">→ 先按数字键选中刚才拾取的方块(快捷栏亮框那格)再放置</b>';
  }
  return s.desc;
}

// 目标进度的人类可读显示(look 用百分比,move 用格,其余用次)
function tutorialProgressText(goal) {
  const cur = Math.min(tutorial.progress[goal.type] || 0, goal.n);
  if (goal.type === 'look') return Math.round(cur / goal.n * 100) + '%';
  if (goal.type === 'move') return cur.toFixed(1) + ' / ' + goal.n + ' 格';
  return Math.round(cur) + ' / ' + goal.n + ' 次';
}

function renderTutorialCard() {
  const el = document.getElementById('tutorial-card');
  if (!el || !tutorial.active) return;
  const s = tutorialStep();
  if (!s) { endTutorial(); return; }   // 走完完成卡后正常结束(否则 active 永真,教程守卫会永久压制刷怪)
  el.classList.remove('hidden');
  const goal = s.goal;
  let prog = '', bar = '';
  if (goal) {
    const pct = Math.min(100, Math.round((tutorial.progress[goal.type] || 0) / goal.n * 100));
    prog = `<div class="tut-progress">${tutorialProgressText(goal)}</div>`;
    bar = `<div class="tut-bar"><div class="tut-bar-fill" style="width:${pct}%;"></div></div>`;
  }
  const btn = goal ? '' : `<button class="craft-btn" id="tut-next" style="margin-top:8px;">继续 ▶</button>`;
  el.innerHTML = `<div class="tut-title">${s.title}</div><div class="tut-desc">${tutorialDesc(s)}</div>${prog}${bar}${btn}
    <div class="tut-skip" id="tut-skip">跳过教程</div><div class="tut-step-ind">${tutorial.step + 1} / ${TUTORIAL_STEPS.length}</div>`;
  // 到达完成卡即标记教程已完成(不再自动弹出)
  if (s.id === 'done') { try { localStorage.setItem('myword_tutorial_done', '1'); } catch (e2) {} }
  const nextBtn = document.getElementById('tut-next');
  if (nextBtn) nextBtn.onclick = () => { tutorial.step++; renderTutorialCard(); };
  const skipBtn = document.getElementById('tut-skip');
  if (skipBtn) skipBtn.onclick = endTutorial;
}

function startTutorial(force) {
  if (tutorial.active) return;
  if (!force) {
    try { if (localStorage.getItem('myword_tutorial_done')) return; } catch (e) {}
  }
  tutorial.active = true;
  tutorial.step = 0;
  tutorial.progress = { move: 0, look: 0, break: 0, pickup: 0, place: 0, slot: 0, inventory: 0 };
  delete tutorial._lx; delete tutorial._lz;   // 重开时清除上次的位移基准
  renderTutorialCard();
}

function endTutorial() {
  tutorial.active = false;
  const el = document.getElementById('tutorial-card');
  if (el) el.classList.add('hidden');
  try { localStorage.setItem('myword_tutorial_done', '1'); } catch (e) {}
}

// 各系统上报进度(推进逻辑在 machines.advanceTutorial,纯函数可单测)
function tutEvent(type, n) {
  if (!tutorial.active) return;
  const res = MACHINES.advanceTutorial(tutorial, type, n);
  if (res !== 'none') renderTutorialCard();
}

function applyClassicMenuBackground() {
  const overlay = document.getElementById('overlay');
  if (!overlay) return;
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const ctx = c.getContext('2d');
  let st = 424242;   // 确定性泥土噪点
  const rand = () => { st = (st * 1664525 + 1013904223) >>> 0; return st / 4294967296; };
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 32; x++) {
      const v = 0.72 + rand() * 0.28;
      ctx.fillStyle = 'rgb(' + ((134 * v) | 0) + ',' + ((96 * v) | 0) + ',' + ((67 * v) | 0) + ')';
      ctx.fillRect(x, y, 1, 1);
    }
  const url = c.toDataURL();
  overlay.style.backgroundImage = 'linear-gradient(rgba(0,0,0,0.6), rgba(0,0,0,0.6)), url(' + url + ')';
  overlay.style.backgroundSize = 'auto, 128px 128px';
  overlay.style.imageRendering = 'pixelated';
}

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
  // 手持火把照明(R23):暖色点光源跟随玩家,举火把时点亮(影响 Lambert 区块网格,真实距离衰减)
  const thl = new THREE.PointLight(0xffc46b, 0, 11, 2);
  scene.add(thl);
  torchHoldLight = thl;

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

  // 云朵(场景设置完毕后创建,高空块状半透明面片)
  createClouds();
  // 天空系统:渐变天穹 + 星星 + 日/月光晕(依赖 sunMeshRef/moonMeshRef)
  createSky();
  createRain();   // 天气系统:雨滴粒子(默认隐藏,随机调度)
  // 破坏裂纹覆盖层
  createCrackOverlay();

  // 纹理:图集(区块网格用)+ 单方块材质(UI/手持用)
  buildAtlas();
  for (const t of Object.keys(BLOCK_TYPES)) materials[t] = makeBlockMaterials(t);

  // 生成初始区块(玩家中心区域)
  for (let dx = -2; dx <= 2; dx++)
    for (let dz = -2; dz <= 2; dz++)
      ensureChunk(dx, dz);

  // 建造出生广场(广场+Owen字样+灯塔+树篱+路径,确定性生成)
  buildSpawnPlaza();
  // 广场覆盖的区块(半径22 → ±2 区块)重新生成数据(应用 modifications)
  // 先全部重建数据,再统一补种树(树冠跨区块写入的才是最终数据)
  for (let dx = -2; dx <= 2; dx++)
    for (let dz = -2; dz <= 2; dz++) {
      const ch = chunks.get(chunkKey(dx, dz));
      if (ch) { ch.data = generateChunkData(dx, dz); markChunkDirty(dx, dz); }
    }
  for (let dx = -2; dx <= 2; dx++)
    for (let dz = -2; dz <= 2; dz++) {
      const ch = chunks.get(chunkKey(dx, dz));
      if (ch) { applyPendingBlocks(ch); growTreesInChunk(dx, dz); }
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
  updateHungerBar();   // 初始化饥饿条 HUD
  applyClassicMenuBackground();   // 经典泥土贴图标题屏
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
  const set = (x, y, z, t) => { if (y >= 0 && y < WORLD_HEIGHT) { addModification(x, y, z, t); plazaBlocks.set(blockKey(x, y, z), t); } };
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
  worldPlazaBuilt = true;   // 广场已知 diff 已登记(存档可瘦身)
}


function clearWorld() {
  for (const ch of chunks.values()) {
    if (ch.mesh) {
      if (ch.mesh.solid) { scene.remove(ch.mesh.solid); ch.mesh.solid.geometry.dispose(); }
      if (ch.mesh.water) { scene.remove(ch.mesh.water); unregisterWaterMesh(ch.mesh.water); ch.mesh.water.geometry.dispose(); }
    }
  }
  chunks.clear();
  modifications.clear();
  modsByChunk.clear();
  pendingBlocks.clear();
  dirtyChunks.clear();
  plazaBlocks.clear();          // 广场已知 diff 随世界重置(重建时重新登记)
  worldPlazaBuilt = false;
  for (const a of arrows) scene.remove(a);
  arrows.length = 0;
  clearDroppedItems();   // 清掉落物,避免旧世界残留
  clearMobs();           // 清生物,避免旧世界残留
  clearFallingBlocks();  // 清下落中的沙砾
  clearTNT();            // 清点燃的 TNT
  clearFurnaces();       // 清熔炉状态
  clearChests();         // 清箱子内容
  clearMinecarts();      // 清矿车实体(R26)
  clearXPOrbs();         // 清经验球(R28)
  closeEnchantPanel();   // 关附魔面板(R28)
  spawnPoint = null;     // 重生点回出生广场(读档会按存档恢复)
  tableOpen = false;
  for (let i = 0; i < 9; i++) tableGrid[i] = null;
  const tPanel = document.getElementById('craft-table-panel');
  if (tPanel) tPanel.classList.add('hidden');
  breakTargetKey = null; breakProgress = 0;
  hideBreakOverlay();
  // 清理粒子/农作物计时器(避免跨世界残留)
  for (const pt of particles) { scene.remove(pt); pt.material.dispose(); }
  particles.length = 0;
  cropTimers.clear();
  clearDoors();
  lightGridCache.clear();   // 光照网格随世界重置(读档后首次建 mesh 重算)
  dayTime = 0.3;   // 新世界/切换存档前重置为早晨;读档由 applySave 按存档恢复(防跨存档时间串档)
  armorSlots.head = armorSlots.chest = armorSlots.legs = armorSlots.feet = null;   // 护甲随世界重置(读档按存档恢复)
  updateArmorBar();
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
  hungerState.hunger = 20; hungerState.drain = 0; hungerState.regenT = 0; hungerState.starveT = 0; updateHungerBar();   // 重置饥饿
  for (let dx = -2; dx <= 2; dx++)
    for (let dz = -2; dz <= 2; dz++)
      ensureChunk(dx, dz);
  // 固定生成出生广场(确保重置后仍有广场场景)
  buildSpawnPlaza();
  // 广场覆盖区块重新生成数据(应用 modifications);先重建数据再统一补种树
  for (let dx = -2; dx <= 2; dx++)
    for (let dz = -2; dz <= 2; dz++) {
      const ch = chunks.get(chunkKey(dx, dz));
      if (ch) { ch.data = generateChunkData(dx, dz); markChunkDirty(dx, dz); }
    }
  for (let dx = -2; dx <= 2; dx++)
    for (let dz = -2; dz <= 2; dz++) {
      const ch = chunks.get(chunkKey(dx, dz));
      if (ch) { applyPendingBlocks(ch); growTreesInChunk(dx, dz); }
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
  // 生存模式开局:仅一把木镐,其余靠破坏方块掉落拾取(经典 MC 采集循环)
  hotbar = new Array(HOTBAR_SIZE).fill(null);
  hotbar[8] = { kind: 'tool', id: 'pickaxe_wood', durability: TOOL_TYPES.pickaxe_wood.durability };
  selectSlot(0);
}

// 方块图标的伪 3D 等距渲染:顶面(亮)+ 右侧面(中)+ 左侧面(暗),模拟立体感
function drawBlockIcon3D(ctx, id, size) {
  const mats = materials[id];
  if (!mats || !mats[2] || !mats[1]) return;   // 防御:无方块材质(如脏数据的 kind/id 不匹配)时不绘制
  const topTex = mats[2].map, sideTex = mats[1].map;
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
    if (item.id === 'torch') { drawTorchIconFlat(ctx, cv.width); return; }
    drawBlockIcon3D(ctx, item.id, cv.width);
  } else if (item.kind === 'tool') {
    drawToolIcon(ctx, item.id, cv.width);
  } else if (item.kind === 'item') {
    drawMaterialIcon(ctx, item.id, cv.width);
  }
}

// 火把扁平图标:木棍 + 发光头部(透明贴图块不适合 3D 块图标)
function drawTorchIconFlat(ctx, size) {
  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1;
  ctx.fillStyle = '#8a6430';
  ctx.fillRect(-size * 0.07, -size * 0.12, size * 0.14, size * 0.46);
  ctx.strokeRect(-size * 0.07, -size * 0.12, size * 0.14, size * 0.46);
  ctx.fillStyle = 'rgba(255,160,60,0.4)';
  ctx.fillRect(-size * 0.2, -size * 0.4, size * 0.4, size * 0.34);
  ctx.fillStyle = '#ffd86b';
  ctx.fillRect(-size * 0.13, -size * 0.34, size * 0.26, size * 0.24);
  ctx.strokeRect(-size * 0.13, -size * 0.34, size * 0.26, size * 0.24);
  ctx.fillStyle = '#ff9a3c';
  ctx.fillRect(-size * 0.07, -size * 0.3, size * 0.12, size * 0.12);
  ctx.restore();
}

function tierColorOf(tier) {
  return ({ wood: '#8a6430', stone: '#9a9a9a', iron: '#d8d8e0', gold: '#ffd54a', diamond: '#5fe3e8', leather: '#a8784a' })[tier] || '#888';
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
  } else if (def.tool === 'armor') {
    // 护甲四件套:帽(圆顶+护颊)/甲(背心)/裤(腰+双腿)/靴(双短筒),材质色区分
    ctx.fillStyle = tc; ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1;
    if (def.slot === 'head') {
      ctx.beginPath();
      ctx.moveTo(-size * 0.3, size * 0.02);
      ctx.quadraticCurveTo(-size * 0.3, -size * 0.38, 0, -size * 0.38);
      ctx.quadraticCurveTo(size * 0.3, -size * 0.38, size * 0.3, size * 0.02);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillRect(-size * 0.36, size * 0.02, size * 0.16, size * 0.12);
      ctx.strokeRect(-size * 0.36, size * 0.02, size * 0.16, size * 0.12);
      ctx.fillRect(size * 0.2, size * 0.02, size * 0.16, size * 0.12);
      ctx.strokeRect(size * 0.2, size * 0.02, size * 0.16, size * 0.12);
    } else if (def.slot === 'chest') {
      ctx.beginPath();
      ctx.moveTo(-size * 0.28, -size * 0.34); ctx.lineTo(size * 0.28, -size * 0.34);
      ctx.lineTo(size * 0.2, -size * 0.08); ctx.lineTo(size * 0.26, size * 0.36);
      ctx.lineTo(-size * 0.26, size * 0.36); ctx.lineTo(-size * 0.2, -size * 0.08);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.fillRect(-size * 0.07, -size * 0.3, size * 0.14, size * 0.6);
    } else if (def.slot === 'legs') {
      ctx.fillRect(-size * 0.26, -size * 0.34, size * 0.52, size * 0.3);
      ctx.strokeRect(-size * 0.26, -size * 0.34, size * 0.52, size * 0.3);
      ctx.fillRect(-size * 0.24, -size * 0.06, size * 0.2, size * 0.44);
      ctx.strokeRect(-size * 0.24, -size * 0.06, size * 0.2, size * 0.44);
      ctx.fillRect(size * 0.04, -size * 0.06, size * 0.2, size * 0.44);
      ctx.strokeRect(size * 0.04, -size * 0.06, size * 0.2, size * 0.44);
    } else {
      ctx.fillRect(-size * 0.28, -size * 0.12, size * 0.22, size * 0.44);
      ctx.strokeRect(-size * 0.28, -size * 0.12, size * 0.22, size * 0.44);
      ctx.fillRect(size * 0.06, -size * 0.12, size * 0.22, size * 0.44);
      ctx.strokeRect(size * 0.06, -size * 0.12, size * 0.22, size * 0.44);
    }
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
  } else if (def.shape === 'cart') {
    // 矿车:灰斗 + 深口沿 + 两个黑轮
    ctx.fillStyle = def.color;
    ctx.fillRect(-size * 0.3, -size * 0.1, size * 0.6, size * 0.36);
    ctx.strokeRect(-size * 0.3, -size * 0.1, size * 0.6, size * 0.36);
    ctx.fillStyle = '#3a3a42';
    ctx.fillRect(-size * 0.34, -size * 0.2, size * 0.68, size * 0.1);
    ctx.fillStyle = '#232328';
    ctx.beginPath();
    ctx.arc(-size * 0.18, size * 0.32, size * 0.09, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath();
    ctx.arc(size * 0.18, size * 0.32, size * 0.09, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fillRect(-size * 0.22, -size * 0.06, size * 0.16, size * 0.2);
  } else if (def.shape === 'stick') {
    // 木棍:斜放棕色小棍(无箭头)
    ctx.strokeStyle = def.color; ctx.lineWidth = size * 0.09; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-size * 0.24, size * 0.26); ctx.lineTo(size * 0.24, -size * 0.26); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,235,200,0.35)'; ctx.lineWidth = size * 0.03;
    ctx.beginPath(); ctx.moveTo(-size * 0.2, size * 0.22); ctx.lineTo(size * 0.2, -size * 0.22); ctx.stroke();
  } else if (def.shape === 'book') {
    // 书:红色封面 + 白色书页边 + 书脊线
    ctx.fillStyle = def.color;
    ctx.fillRect(-size * 0.22, -size * 0.28, size * 0.44, size * 0.56);
    ctx.strokeRect(-size * 0.22, -size * 0.28, size * 0.44, size * 0.56);
    ctx.fillStyle = '#f0ead8';
    ctx.fillRect(size * 0.14, -size * 0.24, size * 0.06, size * 0.48);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-size * 0.1, -size * 0.28); ctx.lineTo(-size * 0.1, size * 0.28); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fillRect(-size * 0.18, -size * 0.2, size * 0.05, size * 0.3);
  } else if (def.shape === 'meat') {
    // 猪排:粉色带骨肉排
    ctx.fillStyle = def.color;
    ctx.beginPath();
    ctx.ellipse(0, size * 0.05, size * 0.26, size * 0.16, -0.35, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#f6d3cd';
    ctx.beginPath();
    ctx.ellipse(-size * 0.08, size * 0.02, size * 0.1, size * 0.06, -0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#f2e6d8'; ctx.lineWidth = size * 0.07;
    ctx.beginPath(); ctx.moveTo(size * 0.22, -size * 0.12); ctx.lineTo(size * 0.3, -size * 0.2); ctx.stroke();
  } else if (def.shape === 'apple') {
    // 苹果:红果 + 叶柄
    ctx.fillStyle = def.color;
    ctx.beginPath();
    ctx.arc(0, size * 0.06, size * 0.22, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#6b4f2a'; ctx.lineWidth = size * 0.05;
    ctx.beginPath(); ctx.moveTo(0, -size * 0.14); ctx.lineTo(size * 0.04, -size * 0.26); ctx.stroke();
    ctx.fillStyle = '#4f9e3f';
    ctx.beginPath();
    ctx.ellipse(size * 0.12, -size * 0.22, size * 0.09, size * 0.045, 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath();
    ctx.ellipse(-size * 0.08, -size * 0.02, size * 0.05, size * 0.08, 0.4, 0, Math.PI * 2);
    ctx.fill();
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

// 单格轻量刷新(数量/耐久/图标变化时用,替代整条热栏 9 格 DOM 重建)
function refreshHotbarSlot(i) {
  const bar = document.getElementById('hotbar');
  const slot = bar && bar.children[i];
  if (!slot) { buildHotbar(); return; }
  const item = hotbar[i];
  slot.className = 'slot' + (i === currentSlot ? ' active' : '');
  const oldCv = slot.querySelector('canvas'); if (oldCv) oldCv.remove();
  const oldCnt = slot.querySelector('.cnt'); if (oldCnt) oldCnt.remove();
  const oldDur = slot.querySelector('.dur'); if (oldDur) oldDur.remove();
  const nameEl = slot.querySelector('.name');
  if (nameEl) nameEl.textContent = itemName(item);
  if (item) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    slot.appendChild(cv);
    drawItemIcon(item, cv);
    if ((item.count || 1) > 1) {
      const cnt = document.createElement('span');
      cnt.className = 'cnt';
      cnt.textContent = item.count;
      slot.appendChild(cnt);
    }
    if (item.kind === 'tool') {
      const bar2 = document.createElement('div');
      bar2.className = 'dur';
      const ratio = item.durability / TOOL_TYPES[item.id].durability;
      bar2.innerHTML = `<span style="width:${Math.max(0, ratio) * 100}%;background:${ratio > 0.5 ? '#5fd35f' : ratio > 0.2 ? '#e0c040' : '#d35f5f'}"></span>`;
      slot.appendChild(bar2);
    }
  }
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
    if (item && (item.count || 1) > 1) {
      const cnt = document.createElement('span');
      cnt.className = 'cnt';
      cnt.textContent = item.count;
      slot.appendChild(cnt);
    }
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
  if (item.kind === 'block') {
    const n = item.count || 1;
    return BLOCK_TYPES[item.id].name + (n > 1 ? ' ×' + n : '');
  }
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
  if (i !== currentSlot) tutEvent('slot', 1);
  currentSlot = i;
  const item = hotbar[i];
  // 选中方块格记录可放置类型;工具/物品/空格置空(放置走各自分支)
  selectedType = (item && item.kind === 'block') ? item.id : null;
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
    if (tableOpen) {
      if (e.code === 'KeyE' || e.code === 'Escape') closeTablePanel();
      return;
    }
    if (furnaceOpen) {
      if (e.code === 'KeyE' || e.code === 'Escape') closeFurnacePanel();
      return;
    }
    if (chestOpen) {
      if (e.code === 'KeyE' || e.code === 'Escape') closeChestPanel();
      return;
    }
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
    if (e.code === 'KeyQ') {
      // 经典丢弃:手持任意物品整组丢出(掉落物保留类型/数量/工具耐久,可再拾回)
      const it = hotbar[currentSlot];
      if (it) {
        const fx = -Math.sin(yaw) * Math.cos(pitch), fy = Math.sin(pitch), fz = -Math.cos(yaw) * Math.cos(pitch);
        const d = spawnDroppedItem(playerPos.x + fx * 1.2, playerPos.y + fy * 1.2, playerPos.z + fz * 1.2,
          it.id, it.kind === 'tool' ? 1 : (it.count || 1), it.kind, it.durability);
        d.userData.pickupDelay = 0.8;   // 丢弃后稍等再可拾取,避免瞬间吸回
        hotbar[currentSlot] = null;
        if (it.kind === 'block') selectedType = null;
        showToast('丢弃:' + itemName(it));
        buildHotbar(); updateHoldItem(); markDirtySave();
      }
    }
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
        if (!('ontouchstart' in window)) { const p = renderer.domElement.requestPointerLock();
        if (p && typeof p.catch === 'function') p.catch(() => {}); }
      } catch (e) {}
    }
    // 3. 初始化音频(失败静默,不影响游戏)
    try { audio.init(); } catch (e) {}
  }

  overlay.addEventListener('click', () => {
    if (!gameStarted) gameStarted = true;
    overlay.classList.add('hidden');   // 直接隐藏开始遮罩(不依赖 pointer lock)
    enterGame();                        // 尝试锁定指针(失败也不影响进入)
    startTutorial(false);               // 首次游戏(未完成过教程)自动开启
  });
  // 开始屏「新手教程」入口:强制开启
  const btnTut = document.getElementById('btn-tutorial');
  if (btnTut) btnTut.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!gameStarted) gameStarted = true;
    overlay.classList.add('hidden');
    enterGame();
    startTutorial(true);
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
    // 解锁(开面板/Esc)时同步清按住状态:mouseup 只绑在画布上,落在菜单 DOM 上收不到,
    // 不清零会在恢复游戏后无操作自动连挖
    if (!locked) { for (const code in keys) keys[code] = false; mouseHeld = false; touchBreakHeld = false; }
    if (locked) {
      overlay.classList.add('hidden');
      pauseMenu.classList.add('hidden');
    } else if (gameStarted && !inventoryOpen && !tableOpen && !furnaceOpen && !chestOpen) {
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
    hotbar[currentSlot] = null; buildHotbar(); updateHoldItem(); markDirtySave(); showToast('已清空当前手持(空手)');
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
  const setMobs = document.getElementById('set-mobs');
  const setHostiles = document.getElementById('set-hostiles');
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
    if (setMobs) setMobs.textContent = settings.mobs ? '开' : '关';
    if (setHostiles) setHostiles.textContent = settings.hostiles ? '开' : '关';
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
  if (setMobs) setMobs.addEventListener('click', () => {
    settings.mobs = !settings.mobs;
    if (!settings.mobs) clearMobs();
    saveSettings(); refreshSettingsUI();
  });
  if (setHostiles) setHostiles.addEventListener('click', () => {
    settings.hostiles = !settings.hostiles;
    if (!settings.hostiles) clearHostiles();
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
  // 动物开关(暂停菜单)
  const btnMobs = document.getElementById('btn-mobs');
  if (btnMobs) btnMobs.addEventListener('click', () => {
    settings.mobs = !settings.mobs;
    btnMobs.textContent = '动物:' + (settings.mobs ? '开' : '关');
    if (!settings.mobs) clearMobs();
    saveSettings();
    showToast('动物已' + (settings.mobs ? '开启' : '关闭'));
  });
  // 怪物开关(暂停菜单;关闭=和平模式,清除敌对生物)
  const btnHostiles = document.getElementById('btn-hostiles');
  if (btnHostiles) btnHostiles.addEventListener('click', () => {
    settings.hostiles = !settings.hostiles;
    btnHostiles.textContent = '怪物:' + (settings.hostiles ? '开' : '关');
    if (!settings.hostiles) clearHostiles();
    saveSettings();
    showToast('怪物已' + (settings.hostiles ? '开启' : '关闭'));
  });
  // 重新新手教程(暂停菜单)
  const btnReplayTut = document.getElementById('btn-replay-tutorial');
  if (btnReplayTut) btnReplayTut.addEventListener('click', () => {
    document.getElementById('pause-menu').classList.add('hidden');
    startTutorial(true);
    showToast('教程已重新开始');
  });
  // 天气开关(暂停菜单;关闭=强制晴天)
  const btnWeather = document.getElementById('btn-weather');
  if (btnWeather) btnWeather.addEventListener('click', () => {
    settings.weather = !settings.weather;
    btnWeather.textContent = '天气:' + (settings.weather ? '开' : '关');
    saveSettings();
    showToast('天气已' + (settings.weather ? '开启' : '关闭'));
  });

  document.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement !== renderer.domElement) return;
    yaw -= e.movementX * 0.0025;
    if (tutorial.active) tutorial.progress.look = (tutorial.progress.look || 0) + Math.abs(e.movementX * 0.0025) + Math.abs(e.movementY * 0.0025), tutEvent('look', 0);
    pitch -= e.movementY * 0.0025;
    pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, pitch));
  });

  renderer.domElement.addEventListener('mousedown', (e) => {
    if (document.pointerLockElement !== renderer.domElement) {
      // 未锁定(刚关面板/菜单返回):点击画面重新锁定,不触发破坏/放置
      try {
        const p = renderer.domElement.requestPointerLock();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch (err) { /* 忽略锁定失败 */ }
      return;
    }
    if (e.button === 0) { breakBlock(); mouseHeld = true; }
    else if (e.button === 2) placeBlock();
  });
  renderer.domElement.addEventListener('mouseup', (e) => { if (e.button === 0) mouseHeld = false; });
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
      el.addEventListener('touchcancel', () => { if (onUp) onUp(); });   // 手势被系统取消时同样复位(防「挖」卡在连挖)
    };
    bindBtn('touch-jump', () => { keys['Space'] = true; }, () => { keys['Space'] = false; });
  const tj = document.getElementById('touch-jump'); if (tj) tj.addEventListener('touchcancel', () => { keys['Space'] = false; });
  addEventListener('blur', () => { keys['Space'] = false; });
    bindBtn('touch-break', () => { breakBlock(); touchBreakHeld = true; }, () => { touchBreakHeld = false; });
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
      const dx = t.clientX - lastX, dy = t.clientY - lastY;
      yaw -= dx * 0.005;
      pitch -= dy * 0.005;
      pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, pitch));
      // 触屏拖视角与鼠标同样累计教程「环顾四周」进度(否则移动端教程卡死在这一步)
      if (tutorial.active) tutorial.progress.look = (tutorial.progress.look || 0) + Math.abs(dx * 0.005) + Math.abs(dy * 0.005), tutEvent('look', 0);
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
// 第十四部分:射线检测(DDA 体素步进 + 门实体射线)
// ============================================================
// DDA 体素射线:逐体素步进找第一个固体方块(替代 intersectObjects,无需遍历 mesh 数组)
// 性能优势:只检查视线穿过的 ~6 个体素,而非 121 个 chunk mesh 的所有三角形
// 池化命中结果:animate 每帧调用 raycastTarget,命中时不再分配对象字面量
// 调用方都是同步消费(读取 x/y/z/normal 后立即使用),复用引用安全
const _rayHitResult = { x: 0, y: 0, z: 0, normal: null };
function _rayHit(x, y, z) {
  _rayHitResult.x = x; _rayHitResult.y = y; _rayHitResult.z = z;
  _rayHitResult.normal = _rayNormal;
  return _rayHitResult;
}

function raycastTarget() {
  // 起点:第一人称=相机位置(playerPos);第三人称=玩家眼睛
  _rayEye.set(playerPos.x, playerPos.y, playerPos.z);
  _rayDir.set(-Math.sin(yaw)*Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw)*Math.cos(pitch));
  const eye = _rayEye, dir = _rayDir;
  const maxDist = 6;  // 最远 6 格

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
  let tMaxX = dir.x !== 0 ? (stepX > 0 ? (x + 1 - eye.x) / dir.x : (eye.x - x) / -dir.x) : Infinity;
  let tMaxY = dir.y !== 0 ? (stepY > 0 ? (y + 1 - eye.y) / dir.y : (eye.y - y) / -dir.y) : Infinity;
  let tMaxZ = dir.z !== 0 ? (stepZ > 0 ? (z + 1 - eye.z) / dir.z : (eye.z - z) / -dir.z) : Infinity;

  let lastStep = null;  // 记录最后跨过的轴(用于反推法线)
  let traveled = 0;

  // 检查起点是否已在方块内(眼睛嵌墙)
  if (isSolidAt(x, y, z)) {
    _rayNormal.set(0, 1, 0);
    return _rayHit(x, y, z);
  }

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
      // 命中:法线 = 进入面方向(反 step),池化向量避免每帧命中时分配
      _rayNormal.set(
        lastStep === 'x' ? -stepX : 0,
        lastStep === 'y' ? -stepY : 0,
        lastStep === 'z' ? -stepZ : 0
      );
      return _rayHit(x, y, z);
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
  // 核心计算在 craft.js(纯函数,可单测);这里只做依赖注入(BLOCK_TYPES/TOOL_TYPES/currentTool)
  // 效率附魔(R28):工具速度 ×(1 + 0.45×级)
  const def = BLOCK_TYPES[blockType];
  const tool = currentTool();
  let tdef = tool ? TOOL_TYPES[tool.id] : null;
  if (tdef && tool.ench && tool.ench.efficiency) {
    tdef = Object.assign({}, tdef, { speed: tdef.speed * (1 + 0.45 * tool.ench.efficiency) });
  }
  return CRAFTLIB.breakCost(def, tdef);
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
  // 左键优先命中动物(剑/斧伤害更高,空手/其他工具 1 点)
  const mobHit = raycastMob(3.5);
  if (mobHit) {
    const heldDef = (item && item.kind === 'tool') ? TOOL_TYPES[item.id] : null;
    const dmg = (heldDef && (heldDef.tool === 'sword' || heldDef.tool === 'axe')) ? (heldDef.damage || 4) : 1;
    // 锋利附魔(R28):近战伤害 +1/级
    hurtMob(mobHit, dmg + ((item && item.ench && item.ench.sharpness) || 0), -Math.sin(yaw), -Math.cos(yaw));
    swingArm();
    swingHoldItem();
    return;
  }
  // 矿车(R26):左键击打 —— 移动中顺向助推,静止回收掉落
  const lookCart = raycastCart(3.5);
  if (lookCart) { punchCart(lookCart); return; }
  // 门:左键=移除门(任何手持,和破坏方块一致);右键=开关门
  const lookDoor = raycastDoor();
  if (lookDoor) {
    removeDoor(lookDoor.x, lookDoor.y, lookDoor.z);
    spawnDroppedItem(lookDoor.x, lookDoor.y, lookDoor.z, lookDoor.type, 1);   // 掉落门物品
    showToast('移除门'); audio.play('break'); markDirtySave(); return;
  }
  const t = raycastTarget();
  if (!t) return;
  const type = getBlock(t.x, t.y, t.z);
  if (!type) return;
  if (t.y === 0) { showToast('基岩无法破坏'); return; }  // 基岩层不可挖
  if (type === 'water') { showToast('水不能破坏'); return; }

  const cost = breakCost(type);
  breakCostTotal = cost;   // 供裂纹覆盖层换算阶段
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
  // 火把附着:拆掉支撑后,上面的火把一并掉落(经典)
  if (getBlock(t.x, t.y + 1, t.z) === 'torch') {
    setBlock(t.x, t.y + 1, t.z, null);
    spawnDroppedItem(t.x, t.y + 1, t.z, 'torch', 1, 'block');
  }
  // 箱子被拆:掉落全部内容
  if (type === 'chest') {
    const ck = blockKey(t.x, t.y, t.z);
    const c = chests.get(ck);
    if (c) {
      for (const it of c.slots) {
        if (it) spawnDroppedItem(t.x, t.y, t.z, it.id, it.count || 1, it.kind || 'block', it.durability);
      }
      chests.delete(ck);
      if (chestOpen === ck) closeChestPanel();
    }
  }
  // 床被拆:若是当前重生床则清除重生点
  if (type === 'bed' && spawnPoint) {
    if (Math.floor(spawnPoint.x) === t.x && Math.floor(spawnPoint.z) === t.z
        && Math.floor(spawnPoint.y - 1.1) === t.y) {
      spawnPoint = null;
      showToast('重生床已拆除,重生点重置');
    }
  }
  // 熔炉被拆:掉落内含物(待冶炼/燃料/产物)
  if (type === 'furnace') {
    const fk = blockKey(t.x, t.y, t.z);
    const f = furnaces.get(fk);
    if (f) {
      for (const it of [f.input, f.fuel, f.output]) {
        if (it) spawnDroppedItem(t.x, t.y, t.z, it.id, it.count || 1, it.kind || 'block', it.durability);
      }
      furnaces.delete(fk);
      if (furnaceOpen === fk) closeFurnacePanel();
    }
  }
  // 经典掉落(生存采集):石头→圆石;煤矿→煤炭(1-2);钻石矿→钻石;树叶 15% 掉苹果
  let dropType = type, dropKind = 'block', dropCount = 1;
  if (type === 'stone') dropType = 'cobblestone';
  else if (type === 'coal_ore') { dropType = 'coal'; dropKind = 'item'; dropCount = 1 + (Math.random() < 0.3 ? 1 : 0); }
  else if (type === 'diamond_ore') { dropType = 'gem_diamond'; dropKind = 'item'; }
  else if (type === 'leaves' && Math.random() < 0.15) { dropType = 'apple'; dropKind = 'item'; }
  spawnDroppedItem(t.x, t.y, t.z, dropType, dropCount, dropKind);
  breakProgress = 0; breakTargetKey = null;
  hideBreakOverlay();
  // 交互减噪:破坏不再逐次 toast(粒子/音效/裂纹已是充分反馈)
  tutEvent('break', 1);
  audio.play('break', type);
  if (tool) {
    tool.durability = Math.max(0, tool.durability - 1);
    if (tool.durability <= 0) {
      showToast(`${TOOL_TYPES[tool.id].name} 坏了!`);
      hotbar[currentSlot] = null;
    }
    refreshHotbarSlot(currentSlot);   // 单格轻量刷新(每击一次都触发)
  }
  markDirtySave();
}

// 放置消耗:当前手持方块格扣减数量,用尽清格(生存模式,替代无限方块)
function consumeSelected() {
  const item = hotbar[currentSlot];
  if (!item || item.kind !== 'block') return;
  item.count = (item.count || 1) - 1;
  if (item.count <= 0) {
    showToast('用完了:' + BLOCK_TYPES[item.id].name);
    hotbar[currentSlot] = null;
    selectedType = null;
  }
  refreshHotbarSlot(currentSlot);   // 单格轻量刷新(替代 9 格重建)
}

function placeBlock() {
  const lookDoor = raycastDoor();
  const holdingDoor = selectedType && selectedType.indexOf('door') === 0;
  if (lookDoor && !holdingDoor) { toggleDoor(lookDoor.x, lookDoor.y, lookDoor.z); return; }
  // 矿车(R26):右键乘坐(手持矿车点铁轨放车,走下方交互分发)
  {
    const item0 = hotbar[currentSlot];
    const lookCart = raycastCart(3.5);
    if (lookCart && !(item0 && item0.kind === 'item' && item0.id === 'minecart')) {
      mountCart(lookCart);
      return;
    }
  }
  const item = hotbar[currentSlot];
  if (item && item.kind === 'tool') { useTool(item); return; }
  // 交互方块(右键):合成台 / TNT / 熔炉 / 床 / 箱子 —— 单次射线统一分发
  // (先于食物分支:经典 MC 交互方块优先,持食物也能打开熔炉/箱子/床)
  const tHit = raycastTarget();
  if (tHit) {
    const hitType = getBlock(tHit.x, tHit.y, tHit.z);
    if (item && item.kind === 'item' && item.id === 'minecart') {
      // 手持矿车右键:铁轨非固体射线穿不中,改看命中实心块的放置位(格+法线)是否为铁轨
      const rx = tHit.x + Math.round(tHit.normal.x), ry = tHit.y + Math.round(tHit.normal.y), rz = tHit.z + Math.round(tHit.normal.z);
      if (getBlock(rx, ry, rz) === 'rail') {
        spawnMinecart(rx, ry, rz);
        item.count = (item.count || 1) - 1;
        if (item.count <= 0) hotbar[currentSlot] = null;
        buildHotbar();
        showToast('放下矿车(右键乘坐 · 左键击打助推/回收)');
      } else showToast('矿车要放在铁轨上');
      return;
    }
    if (hitType === 'crafting_table') { openTablePanel(); return; }
    if (hitType === 'enchanting_table') { openEnchantPanel(); return; }
    if (hitType === 'tnt') { igniteTNT(tHit.x, tHit.y, tHit.z); return; }
    if (hitType === 'furnace') { openFurnacePanel(tHit.x, tHit.y, tHit.z); return; }
    if (hitType === 'bed') { trySleep(tHit.x, tHit.y, tHit.z); return; }
    if (hitType === 'chest') { openChestPanel(tHit.x, tHit.y, tHit.z); return; }
  }
  if (item && item.kind === 'item' && FOODS[item.id]) {
    // 食物:右键进食恢复饥饿值
    if (hungerState.hunger >= 20) { showToast('已经很饱了'); return; }
    hungerState.hunger = Math.min(20, hungerState.hunger + FOODS[item.id]);
    item.count = (item.count || 1) - 1;
    if (item.count <= 0) hotbar[currentSlot] = null;
    buildHotbar(); updateHungerBar(); markDirtySave();
    audio.play('eat');
    swingHoldItem();
    showToast('吃掉:' + ITEM_TYPES[item.id].name + '(饥饿 +' + FOODS[item.id] + ')');
    return;
  }
  if (item && item.kind === 'item') {
    showToast(`${itemName(item)} 不能放置,选中方块再放`);
    return;
  }
  const t = raycastTarget();
  if (!t) { showToast('未对准任何方块'); return; }
  const nx = t.x + Math.round(t.normal.x);
  const ny = t.y + Math.round(t.normal.y);
  const nz = t.z + Math.round(t.normal.z);
  if (getBlock(nx, ny, nz) || doorBlocksAt(nx, ny, nz)) { showToast('此处已有方块或门'); return; }
  // 梯子:需贴墙/贴地放置(经典附着),且非固体可放在自己脚下
  if (selectedType === 'ladder') {
    const hasSupport = isSolidAt(nx - 1, ny, nz) || isSolidAt(nx + 1, ny, nz)
      || isSolidAt(nx, ny, nz - 1) || isSolidAt(nx, ny, nz + 1) || isSolidAt(nx, ny - 1, nz);
    if (!hasSupport) { showToast('梯子需要贴着实体墙或地面放置'); return; }
  }
  // 火把:需放在固体方块上面(经典附着;R22 先做立式火把)
  if (selectedType === 'torch' && !isSolidAt(nx, ny - 1, nz)) {
    showToast('火把需要放在固体方块上面'); return;
  }
  // 铁轨:需放在固体方块上面(R26;平地铁轨,坡道暂不支持)
  if (selectedType === 'rail' && !isSolidAt(nx, ny - 1, nz)) {
    showToast('铁轨需要放在固体方块上面'); return;
  }
  if (selectedType !== 'ladder' && overlapsPlayer(nx, ny, nz)) { showToast('挡住自己了,换个方向'); return; }
  if (selectedType && selectedType.indexOf('door') === 0) {
    const facing = Math.abs(Math.sin(yaw)) > 0.5 ? 1 : 0;
    if (placeDoor(nx, ny, nz, selectedType, facing)) {
      showToast('放置:'+(BLOCK_TYPES[selectedType]?BLOCK_TYPES[selectedType].name:'门'));
      audio.play('place'); markDirtySave(); consumeSelected();
    }
    else { showToast('门需 2 格高空间'); }
    return;
  }
  if (tryPlantCrop(nx, ny, nz)) { showToast('种下小麦(60秒成熟)'); audio.play('place'); consumeSelected(); return; }
  if (setBlock(nx, ny, nz, selectedType)) {
    spawnParticles(nx, ny, nz, new THREE.Color(BLOCK_TYPES[selectedType].top).getHex(), 4);
    showToast(`放置:${BLOCK_TYPES[selectedType].name}`);
    tutEvent('place', 1);
    audio.play('place');
    markDirtySave();
    consumeSelected();
  }
}

const toolCooldown = {};
function useTool(item) {
  const def = TOOL_TYPES[item.id];
  const now = performance.now();
  const cd = { sword: 350, bow: 600, shield: 500 }[def.tool] || 200;
  if (toolCooldown[item.id] && now - toolCooldown[item.id] < cd) return;
  if (def.tool === 'sword') {
    toolCooldown[item.id] = now;   // 交互:挥砍即进入冷却(经典攻击间隔)
    swingArm();
    swingHoldItem();
    const m = raycastMob(3.5);
    if (m) {
      hurtMob(m, (def.damage || 3) + ((item.ench && item.ench.sharpness) || 0), -Math.sin(yaw), -Math.cos(yaw));   // 锋利附魔 +1/级(R28)
      showToast(`挥砍:${def.name} · 伤害${(def.damage || 3) + ((item.ench && item.ench.sharpness) || 0)} · 命中生物`);
      audio.play('break');
      consumeToolDurability(item);   // 经典:命中才损耗耐久,空挥不扣
    }
  } else if (def.tool === 'bow') {
    const arrowSlot = hotbar.findIndex(s => s && s.kind === 'item' && s.id === 'arrow' && s.count > 0);
    if (arrowSlot < 0) { showToast('没有箭,无法射击(背包取箭)'); return; }
    toolCooldown[item.id] = now;   // 交互:射出才进入冷却(拉弓时间)
    hotbar[arrowSlot].count--;
    if (hotbar[arrowSlot].count <= 0) hotbar[arrowSlot] = null;
    refreshHotbarSlot(arrowSlot);
    consumeToolDurability(item);
    shootArrow();
    swingHoldItem();
    audio.play('place');
    showToast(`射箭 · 剩余 ${hotbar[arrowSlot] ? hotbar[arrowSlot].count : 0} 支`);
  } else if (def.tool === 'shield') {
    toolCooldown[item.id] = now;   // 交互:举盾进入冷却
    shieldActive = 0.6;
    raisedShield = item;           // 记住举起的盾(格挡成功扣耐久)
    swingHoldItem();
    showToast(`举盾:${def.name}`);
    consumeToolDurability(item);
  } else if (def.tool === 'armor') {
    toolCooldown[item.id] = now;
    equipArmor(item);
  } else {
    showToast(`${def.name}:用于破坏方块(左键),右键只是展示`);
    toolCooldown[item.id] = now;
    swingHoldItem();
  }
}

// 耐久附魔(R28):等级 l → 消耗概率 1/(l+1)(经典近似);返回 true 表示本次免损耗
function enchUnbreakingSkip(item) {
  return !!(item && item.ench && item.ench.unbreaking && Math.random() < item.ench.unbreaking / (item.ench.unbreaking + 1));
}

function consumeToolDurability(item) {
  if (enchUnbreakingSkip(item)) return;   // 耐久附魔:本次不损耗
  item.durability = Math.max(0, item.durability - 1);
  if (item.durability <= 0) {
    showToast(`${TOOL_TYPES[item.id].name} 坏了!`);
    hotbar[currentSlot] = null;
  }
  refreshHotbarSlot(currentSlot);   // 单格轻量刷新(破坏方块每次都触发,避免 9 格重建)
  markDirtySave();
}

const arrows = [];
let arrowGeo = null, arrowMat = null;
// 力量附魔等级(扫描快捷栏的弓,R28)
function bowPowerBonus() {
  for (let i = 0; i < HOTBAR_SIZE; i++) {
    const it = hotbar[i];
    if (it && it.kind === 'tool' && TOOL_TYPES[it.id] && TOOL_TYPES[it.id].tool === 'bow' && it.ench && it.ench.power) return it.ench.power;
  }
  return 0;
}
function shootArrow() {
  if (!arrowGeo) { arrowGeo = new THREE.BoxGeometry(0.08, 0.08, 0.4); arrowMat = new THREE.MeshLambertMaterial({ color: 0xcaa472 }); }
  const m = new THREE.Mesh(arrowGeo, arrowMat);
  m.position.copy(playerPos);
  const dir = new THREE.Vector3(
    -Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)
  );
  m.userData = { vel: dir.multiplyScalar(28), life: 2.5, fromPlayer: true };
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
  _rayEye.set(playerPos.x, playerPos.y, playerPos.z);
  _rayDir.set(-Math.sin(yaw)*Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw)*Math.cos(pitch));
  for (let t = 0.3; t <= 4; t += 0.25) { const d = getDoorAt(Math.floor(_rayEye.x+_rayDir.x*t), Math.floor(_rayEye.y+_rayDir.y*t), Math.floor(_rayEye.z+_rayDir.z*t)); if (d) return d; }
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
    tutEvent('pickup', absorbed);
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
          if (got >= want) { scene.remove(d); droppedItems.splice(i, 1); continue; }
          u.count = want - got;   // 部分吸收:剩余留在地上
        }
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
// 生物系统(猪=被动氛围生物;僵尸/苦力怕=夜间敌对生物,复刻经典 MC)
// 统一物理(重力/浮力/碰撞) + 按类型 AI;不入存档;暂停时冻结;可在设置中开关
// ============================================================
const mobs = [];
const MOB_CAP = 10;        // 被动生物上限(猪)
const HOSTILE_CAP = 8;     // 敌对生物上限(僵尸 + 苦力怕)
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

function spawnMob(x, groundY, z, type) {
  const t = type || 'pig';
  const mesh = t === 'zombie' ? buildZombieMesh()
    : t === 'creeper' ? buildCreeperMesh()
    : t === 'skeleton' ? buildSkeletonMesh()
    : t === 'spider' ? buildSpiderMesh()
    : t === 'enderman' ? buildEndermanMesh()
    : t === 'cow' ? buildCowMesh()
    : t === 'sheep' ? buildSheepMesh()
    : buildPigMesh();
  mesh.position.set(x, groundY + 0.45, z);   // 身体中心离地 0.45
  scene.add(mesh);
  mobs.push({
    mesh, type: t, vy: 0, kvx: 0, kvz: 0,
    yaw: Math.random() * Math.PI * 2,
    turnT: 1 + Math.random() * 2, speed: 0,
    hp: MOB_DEFS[t].hp, hurtT: 0, walkPhase: Math.random() * 6, onGround: false,
    attackCd: 0, fuse: 0, burnT: 0, fireT: 0, groanT: 2 + Math.random() * 3,
  });
}

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
  g.userData = { legs: legGroups, mats: [woolMat, faceMat, legMat], baseColors: [0xe8e8e4, 0xd8c8b8, 0x9a8a78] };
  return g;
}

function removeMob(i) {
  const m = mobs[i];
  m.mesh.traverse(function(o) {
    if (o.isMesh) {
      if (o.geometry) o.geometry.dispose();
      // 材质可能是单材质或多材质数组(苦力怕头 6 面)
      if (Array.isArray(o.material)) { for (let k = 0; k < o.material.length; k++) o.material[k].dispose(); }
      else if (o.material) o.material.dispose();
    }
  });
  scene.remove(m.mesh);
  mobs.splice(i, 1);
}
function clearMobs() { for (let i = mobs.length - 1; i >= 0; i--) removeMob(i); }

// 尝试生成:随机挑一个已加载区块,找草地面(离玩家 >10 格,水下/沙漠不刷)
function trySpawnMob() {
  if (!settings.mobs || mobs.length >= MOB_CAP || chunks.size === 0) return;
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
      // 被动生物池:猪 40% / 牛 30% / 羊 30%
      const pr = Math.random();
      spawnMob(wx, y + 1, wz, pr < 0.4 ? 'pig' : pr < 0.7 ? 'cow' : 'sheep');
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
    m.attackCd = 1.0;
    damagePlayer(7, 'combat');
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
        setBlock(bx, by, bz, null);
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
}

function clearMinecarts() {
  for (const c of minecarts) scene.remove(c.mesh);
  minecarts.length = 0;
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
      if (gained > 0) showToast('⭐ 升级!经验等级 ' + xpState.level);
      audio.play('place');
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
function openEnchantPanel() {
  if (!enchantPanelEl) {
    enchantPanelEl = document.createElement('div');
    enchantPanelEl.id = 'enchant-panel';
    enchantPanelEl.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:80;background:#c6c6c6;border:4px solid;border-color:#fff #555 #555 #fff;padding:16px 18px;min-width:330px;max-width:90vw;box-shadow:0 8px 30px rgba(0,0,0,.5);font-size:14px;color:#222;';
    document.body.appendChild(enchantPanelEl);
  }
  const item = hotbar[currentSlot];
  currentEnchantOptions = (item && item.kind === 'tool')
    ? MACHINES.rollEnchants(TOOL_TYPES[item.id].tool, Math.random)
    : null;
  renderEnchantPanel();
  enchantPanelEl.style.display = '';
  if (document.pointerLockElement) document.exitPointerLock();
}
function closeEnchantPanel() {
  if (enchantPanelEl) enchantPanelEl.style.display = 'none';
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
      currentEnchantOptions = MACHINES.rollEnchants(TOOL_TYPES[item2.id].tool, Math.random);
      renderEnchantPanel();
    };
  });
  const cb = enchantPanelEl.querySelector('#ench-close');
  if (cb) cb.onclick = closeEnchantPanel;
}

// 夜间在距玩家 ≥12 格处生成敌对生物(僵尸 65% / 苦力怕 35%);关闭怪物或昼夜循环 = 和平模式
function trySpawnHostile() {
  if (!settings.hostiles || !settings.dayNightEnabled) return;
  if (tutorial.active) return;   // 新手教程期间不刷敌对生物(安全学习;跳过教程即恢复)
  if (sunHeight() > -0.05) return;   // 仅夜间
  if (countHostiles() >= HOSTILE_CAP || chunks.size === 0) return;
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
      // 光照判定(经典,R23):生成点火把光级 ≥8 过亮 → 不刷(火把防刷怪;无光源区域光级 0 正常刷)
      if (lightAtWorld(fx, y + 1, fz) < 8) {
        // 敌对生物池:僵尸 50% / 苦力怕 30% / 骷髅 20%
        const hr = Math.random();
        spawnMob(wx, y + 1, fz, hr < 0.4 ? 'zombie' : hr < 0.65 ? 'creeper' : hr < 0.85 ? 'skeleton' : hr < 0.95 ? 'spider' : 'enderman');
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
  if (hostileSpawnTimer <= 0) { hostileSpawnTimer = 3; trySpawnHostile(); }
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
    if (m.type === 'pig') {
      wanderStep(m, dt, 1.3, 0.65);
    } else if (m.type === 'cow' || m.type === 'sheep') {
      wanderStep(m, dt, 1.1, 0.6);
    } else if (m.type === 'zombie') {
      if (zombieAI(m, dt, distP)) continue;
    } else if (m.type === 'spider') {
      if (spiderAI(m, dt, distP)) continue;
    } else if (m.type === 'enderman') {
      if (endermanAI(m, dt, distP)) continue;
    } else if (m.type === 'skeleton') {
      if (skeletonAI(m, dt, distP)) continue;
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
    const footY = Math.floor(p.y - 0.35), midY = Math.floor(p.y + 0.1);
    const dlen = Math.hypot(dirx, dirz);
    if (dlen > 0.01 && m.onGround) {
      const ax = p.x + dirx / dlen * 0.5, az = p.z + dirz / dlen * 0.5;
      if (isSolidAt(Math.floor(ax), footY, Math.floor(az)) || isSolidAt(Math.floor(ax), midY, Math.floor(az))) {
        if (Math.random() < 0.5) m.vy = 7.2;
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
      const supportY = Math.floor(ny - 0.45);
      if (isSolidAt(Math.floor(p.x), supportY, Math.floor(p.z))) { ny = supportY + 1 + 0.45; m.vy = 0; m.onGround = true; }
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
    } else {
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
function hurtMob(m, dmg, kx, kz, silent) {
  m.hp -= dmg;
  m.hurtT = 0.25;
  // 末影人被攻击即激怒,并短暂延迟后瞬移(经典)
  if (m.type === 'enderman') { m.angered = true; m.tpT = 0.35; }
  m.kvx += kx * 6; m.kvz += kz * 6; m.vy = 4;
  const mats = m.mesh.userData.mats;
  for (let k = 0; k < mats.length; k++) mats[k].color.setHex(0xd05a5a);
  if (!silent) audio.play(m.type === 'zombie' ? 'zombie' : m.type === 'creeper' ? 'hurt' : 'pig');
  if (m.hp <= 0) {
    const p = m.mesh.position;
    spawnParticles(p.x - 0.5, p.y - 0.5, p.z - 0.5, m.type === 'pig' ? 0xeba3a9 : m.type === 'cow' ? 0x6b4a2f : m.type === 'sheep' ? 0xe8e8e4 : m.type === 'spider' ? 0x2a2a30 : m.type === 'enderman' ? 0x7a4a9a : 0x7a9a7a, 12);
    // 经典掉落(按生物类型)
    const dropAt = (id, kind, count) => spawnDroppedItem(p.x - 0.5, p.y - 0.2, p.z - 0.5, id, count, kind);
    if (m.type === 'pig') dropAt('porkchop', 'item', 1 + (Math.random() < 0.5 ? 1 : 0));
    else if (m.type === 'cow') { dropAt('beef', 'item', 1 + (Math.random() < 0.5 ? 1 : 0)); dropAt('leather', 'item', 1); }
    else if (m.type === 'sheep') { dropAt('mutton', 'item', 1 + (Math.random() < 0.5 ? 1 : 0)); dropAt('wool_white', 'block', 1); }
    else if (m.type === 'skeleton') dropAt('arrow', 'item', Math.random() < 0.7 ? 2 : 1);
    else if (m.type === 'spider') dropAt('string', 'item', Math.random() < 0.5 ? 2 : 1);
    else if (m.type === 'enderman' && Math.random() < 0.6) dropAt('ender_pearl', 'item', 1);
    // 经验球(R28):敌对 5(末影人 10)/被动 1-3
    spawnXPOrbs(p.x, p.y, p.z, MOB_DEFS[m.type].hostile ? (m.type === 'enderman' ? 10 : 5) : 1 + (Math.random() * 3 | 0));
    killMob(m);
    showToast(m.type === 'zombie' ? '🧟 击倒了僵尸' : m.type === 'creeper' ? '💥 击倒了苦力怕' : m.type === 'skeleton' ? '💀 击倒了骷髅' : m.type === 'spider' ? '🕷 击倒了蜘蛛' : m.type === 'enderman' ? '🟣 击倒了末影人' : m.type === 'cow' ? '🐮 击倒了牛' : m.type === 'sheep' ? '🐑 击倒了羊' : '🐷 击倒了猪');
  }
}

// 视线命中生物(球体近似:沿视线 3.5 格内、夹角最小者)
function raycastMob(maxDist) {
  const dx = -Math.sin(yaw) * Math.cos(pitch), dy = Math.sin(pitch), dz = -Math.cos(yaw) * Math.cos(pitch);
  let best = null, bestT = maxDist;
  for (const m of mobs) {
    const p = m.mesh.position;
    const tx = p.x - playerPos.x, ty = p.y - playerPos.y, tz = p.z - playerPos.z;
    const proj = tx * dx + ty * dy + tz * dz;
    if (proj <= 0.3 || proj > bestT) continue;
    const perp2 = tx * tx + ty * ty + tz * tz - proj * proj;
    if (perp2 < 0.55) { best = m; bestT = proj; }
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
  if (inventoryOpen || tableOpen || furnaceOpen || chestOpen) return;   // 还有面板开着则不抢
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
    cell.oncontextmenu = (e) => { e.preventDefault(); c.slots[i] = null; renderChestPanel(); };
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
    if (shieldActive > 0) {
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
  // 乘坐矿车(R26):位置由矿车驱动,玩家物理挂起;空格下车
  if (ridingCart) {
    if (keys['Space']) dismountCart();
    return;
  }
  const forward = _fwd.set(-Math.sin(yaw), 0, -Math.cos(yaw));
  const right = _right.set(Math.cos(yaw), 0, -Math.sin(yaw));
  if (cameraMode === 2) { forward.negate(); }

  const move = _move.set(0, 0, 0);
  // 触屏摇杆输入
  const tm = (typeof window.__touchMove === 'function') ? window.__touchMove() : null;
  if (tm && (Math.abs(tm.x) > 0.1 || Math.abs(tm.z) > 0.1)) {
    move.addScaledVector(forward, -tm.z);   // 池化:不 clone,零分配
    move.addScaledVector(right, tm.x);
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
    // 梯子攀爬(经典):在梯子体积内 —— 空格上升 / Shift 悬停 / 其余缓慢下滑;
    // 水平移动不受限,可左右挪出梯子
    const onLadder = getBlock(Math.floor(playerPos.x), Math.floor(playerPos.y - 0.3), Math.floor(playerPos.z)) === 'ladder'
      || getBlock(Math.floor(playerPos.x), Math.floor(playerPos.y + 0.3), Math.floor(playerPos.z)) === 'ladder';
    if (onLadder) {
      if (keys['Space']) velocity.y = 3.2;
      else if (keys['ShiftLeft'] || keys['ShiftRight']) velocity.y = 0;
      else velocity.y = Math.max(velocity.y - GRAVITY * dt, -1.8);
    } else {
      velocity.y -= GRAVITY * dt;
      if (keys['Space'] && onGround) {
        velocity.y = JUMP_SPEED;
        const now = performance.now();
        if (now - lastJumpTime > 250) { audio.play('jump'); lastJumpTime = now; }
      }
    }
  }

  collidePlayer(dt);

  // 落地音效:仅在"从空中→触地"这一帧触发(边沿检测),避免着地后重复播放
  if (onGround && !wasOnGround && prevVy < -6) {
    audio.play('jump');
    if (!water) spawnParticles(playerPos.x, playerPos.y - 0.7, playerPos.z, 0x9a8a6a, 6);   // 落地尘土
  }
  // Fall damage: when landing with prevVy < -15 (~4+ blocks), scale by speed. Flying immune.
  if (onGround && !wasOnGround && !isFlying && prevVy < -15 && !inWater()) {
    const dmg = Math.floor((-prevVy - 15) / 3);
    if (dmg > 0) damagePlayer(dmg, 'fall');
  }
  wasOnGround = onGround;
  // 记录最后安全位置(用于虚空救援):仅当稳稳站在实体方块上时更新
  if (onGround && !isFlying) lastSafePos.copy(playerPos);
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
      if (after > before) damagePlayer(after - before, 'drown');
    }
  } else {
    breathTimer = 0;
  }

  // 饥饿系统(状态机在 inventory.js:hungerTick):移动消耗更快(飞行减半);
  // 速率平衡:移动 0.7(≈5.7 秒 1 点,20 点约 2 分钟)/ 静止 0.25(16 秒 1 点)
  const hres = INVLIB.hungerTick(hungerState, dt,
    (Math.hypot(velocity.x, velocity.z) > 0.5 ? 0.7 : 0.25) * (isFlying ? 0.4 : 1),
    playerHP < PLAYER_MAX_HP);
  if (hres.hungerChanged) updateHungerBar();
  if (hres.regen) {
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
let bobPhase = 0, bobAmp = 0;   // 第一人称行走视角摆动
// 交互:按住左键/长按挖矿按钮 连续挖掘(经典 MC 手感)
let mouseHeld = false;
let touchBreakHeld = false;
let autoMineTimer = 0;

// 昼夜循环:dayTime 0..1(0=午夜,0.25=日出,0.5=正午,0.75=日落),起步 0.3(早晨)
let dayTime = 0.3;
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
  // 昼夜循环:受设置控制(可关闭/调速度)
  if (settings.dayNightEnabled) {
    dayTime += dt / (settings.dayCycleSpeed || 120);  // 速度可调(秒/周期)
    if (dayTime >= 1) dayTime -= 1;
  }

  // 太阳角度:0=午夜,0.25=日出(东升),0.5=正午,0.75=日落(西落)
  const sunAngle = dayTime * Math.PI * 2 - Math.PI / 2;
  const sunH = Math.sin(sunAngle);       // -1..1(高度,>0 为白天)
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
    ambientLight.intensity = 0.18 + dayFactor * 0.45;          // 夜 0.18 ~ 正午 ~0.63
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
    const str = (hh < 10 ? '0' + hh : hh) + ':' + (mm < 10 ? '0' + mm : mm);
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
  const prevVy = velocity.y;
  if (locked) updatePlayer(dt, prevVy);
  if (locked) updateFallingBlocks(dt);             // 沙砾重力(暂停时冻结)
  if (locked) updateTNT(dt);                       // 点燃的 TNT(暂停时冻结)
  if (locked) updateMinecarts(dt);                 // 矿车(暂停时冻结,R26)
  if (locked) updateXPOrbs(dt);                    // 经验球(R28)
  updateWeather(dt);                               // 天气(晴雨随机调度,暂停也推进)
  updateFurnaces(dt);                              // 熔炉冶炼(经典:暂停也持续燃烧)
  if (locked) updateDroppedItems(dt);              // 掉落物(暂停时冻结;每帧仅一次)
  if (locked && settings.mobs) updateMobs(dt);     // 生物(暂停时冻结)
  if (locked) updateArrows(dt);                    // 箭矢(暂停时冻结,避免面板开着被骷髅射中)
  updateParticles(dt);   // 粒子效果
  updateDoorAnim(dt);    // 门开关动画
  updateDamageVignette(dt);
  updateDeathOverlay(dt);
  updateClouds(dt);   // 云朵飘动(无论是否锁定都执行)

  // 区块动态加载/卸载(无论是否锁定都执行,保证世界持续生成)
  updateChunks(playerPos.x, playerPos.z);
  if (Math.floor(now / 1000) !== window.__lastCropCheck) { window.__lastCropCheck = Math.floor(now / 1000); updateCrops(); }

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
    // 行走视角摆动(轻微起伏 + 微 roll,落地感/移动感)
    const hspd = Math.hypot(velocity.x, velocity.z);
    const bobTarget = (onGround && !isFlying && hspd > 0.8) ? 1 : 0;
    bobAmp += (bobTarget - bobAmp) * Math.min(1, dt * 8);
    bobPhase += dt * hspd * 1.7;
    camera.position.y += Math.sin(bobPhase * 2) * 0.042 * bobAmp;
    camera.rotation.z = Math.sin(bobPhase) * 0.007 * bobAmp;
  } else {
    updateThirdPersonCamera();
  }

  // 天空穹顶/星星跟随相机(无视差),缓慢旋转(星星周日视运动)
  skyGroup.position.copy(camera.position);
  skyGroup.rotation.y += dt * 0.004;

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

  // 交互:按住左键(或长按移动端挖矿键)连续挖掘 —— 每 0.22 秒自动追加一次破坏点击
  if (locked && (mouseHeld || touchBreakHeld)) {
    autoMineTimer -= dt;
    if (autoMineTimer <= 0) { autoMineTimer = 0.22; breakBlock(); }
  } else {
    autoMineTimer = 0;
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
  if (setBlock(nx, ny, nz, 'snow')) { cropTimers.set(blockKey(nx, ny, nz), Date.now()); return true; }
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
    // getBlock 对「未加载区块」与「空气」都返回 null:区块不在内存时保留计时器,
    // 等玩家回访再判定(否则远离后计时器被误删,小麦永久停在幼苗)
    else if (b === null && !chunks.has(chunkKey(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE)))) continue;
    else if (b !== 'snow') cropTimers.delete(key);
  }
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
  if (worldPlazaBuilt) buildSpawnPlaza();
  // 重建全局 diff 表 + 区块桶(读档一次性解析 key,游戏期间按桶直接应用)
  if (rec.modifications) {
    for (const [k, v] of rec.modifications) {
      const c1 = k.indexOf(','), c2 = k.indexOf(',', c1 + 1);
      addModification(+k.slice(0, c1), +k.slice(c1 + 1, c2), +k.slice(c2 + 1), v);
    }
  }
  if (rec.playerPos && rec.playerPos.y > 1 && rec.playerPos.y < WORLD_HEIGHT
      && Number.isFinite(rec.playerPos.x) && Number.isFinite(rec.playerPos.z)) {
    playerPos.set(rec.playerPos.x, rec.playerPos.y, rec.playerPos.z);
  } else {
    // 存档位置异常 → 回广场中心
    const plazaH = SEA_LEVEL + 6;
    playerPos.set(0.5, plazaH + 1 + PLAYER_HEIGHT * 0.5, 0.5);
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
    hotbar = rec.hotbar;
    // 旧存档归一化:无数量字段的方块格补满一组(逻辑在 inventory.js)
    INVLIB.normalizeHotbar(hotbar);
  } else initInventory();
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
      spawnMob(md.x, md.y - 0.45, md.z, md.t);   // spawnMob 内部再 +0.45 回中心位
      const mm = mobs[mobs.length - 1];
      mm.hp = Math.max(1, Math.min(MOB_DEFS[md.t].hp, (typeof md.hp === 'number') ? md.hp : MOB_DEFS[md.t].hp));
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
  if (open) tutEvent('inventory', 1);
  const panel = document.getElementById('inventory');
  if (!panel) return;
  if (open) {
    buildInventoryPanel();
    panel.classList.remove('hidden');
    if (document.pointerLockElement) document.exitPointerLock();
  } else {
    panel.classList.add('hidden');
    clearCraftGrid();
    tryRelockPointer();   // 交互:关背包无缝回到游戏
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
        copy = { kind: 'block', id: item.id, count: 64 };   // 发放整组(放置按数量消耗)
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
  // 护甲装备槽(经典 4 部位):点击卸下回快捷栏;穿上 = 游戏内手持护甲右键
  addSection(grid, '护甲装备(穿上:手持护甲右键 · 点击卸下)');
  const armorRow = document.createElement('div');
  armorRow.style.cssText = 'grid-column:1/-1;display:flex;gap:8px;margin:2px 0 6px;';
  for (const s of ['head', 'chest', 'legs', 'feet']) {
    const it = armorSlots[s];
    const cell = document.createElement('div');
    cell.className = 'inv-cell';
    const cv = document.createElement('canvas');
    cv.width = cv.height = 48;
    if (it) drawItemIcon(it, cv);
    cell.appendChild(cv);
    const label = document.createElement('span');
    label.className = 'inv-label';
    label.textContent = it ? itemName(it) : ARMOR_SLOT_NAMES[s] + '(空)';
    cell.appendChild(label);
    cell.addEventListener('click', () => unequipArmor(s));
    armorRow.appendChild(cell);
  }
  grid.appendChild(armorRow);
  addSection(grid, '工具 · 武器');
  TOOL_ORDER.forEach(id => addCell({ kind: 'tool', id }));
  addSection(grid, '方块');
  HOTBAR_ORDER.forEach(id => addCell({ kind: 'block', id }));
  // 新增方块也可取用
  ['water', 'snow', 'gravel', 'door', 'door_iron', 'door_stone', 'door_gold', 'door_diamond', 'crafting_table', 'cobblestone', 'coal_ore', 'iron_ore', 'diamond_ore', 'tnt', 'furnace', 'glass', 'bed', 'chest', 'ladder', 'bookshelf', 'torch', 'rail', 'enchanting_table'].forEach(id => addCell({ kind: 'block', id }));
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
// 合成配方表与匹配逻辑已提取到 craft.js(CRAFTLIB.RECIPES / CRAFTLIB.matchRecipe,可单测)

// 合成格状态:长度 4 的数组,每格为 null 或 {kind,id}(方块演示)
const craftGrid = [null, null, null, null];

// 当前配方匹配结果(null = 无匹配);核心逻辑在 craft.js(纯函数,可单测)
function matchRecipe() {
  return CRAFTLIB.matchRecipe(craftGrid, CRAFTLIB.RECIPES);
}

function renderCraftGrid() {
  const cells = document.querySelectorAll('#craft-grid .inv-cell');
  cells.forEach((cell, i) => {
    const old = cell.querySelector('canvas'); if (old) old.remove();
    const badge = cell.querySelector('.cnt'); if (badge) badge.remove();
    const item = craftGrid[i];
    if (item) {
      const cv = document.createElement('canvas');
      cv.width = cv.height = 48;
      drawItemIcon(item, cv);
      cell.appendChild(cv);
      if ((item.count || 1) > 1) {
        const c = document.createElement('span');
        c.className = 'cnt';
        c.textContent = item.count;
        cell.appendChild(c);
      }
    }
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
  craftGiveResult(r);
  // 生存模式:消耗合成格内物品(每格 1 个)
  for (let i = 0; i < 4; i++) {
    if (craftGrid[i]) {
      craftGrid[i].count = (craftGrid[i].count || 1) - 1;
      if (craftGrid[i].count <= 0) craftGrid[i] = null;
    }
  }
  renderCraftGrid();
  refreshCraftResult();
}

// 发放合成产物到当前快捷栏格(工具补耐久)
function craftGiveResult(r) {
  const res = { ...r.result };
  if (res.kind === 'tool' && !res.durability) res.durability = TOOL_TYPES[res.id].durability;
  if (!res.count) res.count = r.count || 1;
  putInSlot(currentSlot, res);
  showToast('合成:' + r.name + ' ×' + res.count);
  audio.play('place');
}

function clearCraftGrid() {
  for (let i = 0; i < 4; i++) craftGrid[i] = null;
  renderCraftGrid();
  refreshCraftResult();
}

// ============================================================
// 合成台 3×3(对放置的合成台方块右键打开;支持全部 2×2 配方 + 3×3 专属配方)
// ============================================================
const tableGrid = [null, null, null, null, null, null, null, null, null];
let tableOpen = false;

function openTablePanel() {
  tableOpen = true;
  const panel = document.getElementById('craft-table-panel');
  if (!panel) return;
  panel.classList.remove('hidden');
  if (document.pointerLockElement) document.exitPointerLock();
  const craftBtn = document.getElementById('table-craft');
  if (craftBtn) craftBtn.onclick = performTableCraft;
  const clearBtn = document.getElementById('table-clear');
  if (clearBtn) clearBtn.onclick = clearTableGrid;
  const closeBtn = document.getElementById('table-close');
  if (closeBtn) closeBtn.onclick = closeTablePanel;
  // 目录循环列表:方块 + 材料物品(矿石/圆石/木棍等,按 kind 区分图标)
  const catalog = HOTBAR_ORDER.map(id => ({ kind: 'block', id }))
    .concat(['water', 'snow', 'gravel', 'crafting_table', 'cobblestone', 'coal_ore', 'iron_ore', 'diamond_ore', 'tnt', 'furnace', 'glass', 'sand', 'bed', 'chest', 'ladder', 'bookshelf', 'wool_red', 'wool_white', 'torch', 'rail', 'enchanting_table'].map(id => ({ kind: 'block', id })))
    .concat(['leather', 'book'].map(id => ({ kind: 'item', id })))
    .concat(['gem_gold', 'gem_diamond', 'gem_emerald', 'arrow', 'stick', 'coal', 'iron_ingot'].map(id => ({ kind: 'item', id })));
  document.querySelectorAll('#table-grid .inv-cell').forEach((cell, i) => {
    cell.onclick = () => {
      const cur = tableGrid[i];
      let idx = cur ? catalog.findIndex(c => c.kind === cur.kind && c.id === cur.id) : -1;
      idx = (idx + 1) % catalog.length;
      tableGrid[i] = { kind: catalog[idx].kind, id: catalog[idx].id };
      renderTableGrid(); refreshTableResult();
    };
    cell.oncontextmenu = (e) => { e.preventDefault(); tableGrid[i] = null; renderTableGrid(); refreshTableResult(); };
  });
  renderTableGrid();
  refreshTableResult();
}

function closeTablePanel() {
  tableOpen = false;
  const panel = document.getElementById('craft-table-panel');
  if (panel) panel.classList.add('hidden');
  // 面板格内物品为目录演示来源:关闭/清空不退回(仅合成时消耗每格 1 个)
  for (let i = 0; i < 9; i++) tableGrid[i] = null;
  renderTableGrid();
  refreshTableResult();
  tryRelockPointer();
}

function clearTableGrid() {
  for (let i = 0; i < 9; i++) tableGrid[i] = null;
  renderTableGrid();
  refreshTableResult();
}

function renderTableGrid() {
  document.querySelectorAll('#table-grid .inv-cell').forEach((cell, i) => {
    const old = cell.querySelector('canvas'); if (old) old.remove();
    const badge = cell.querySelector('.cnt'); if (badge) badge.remove();
    const item = tableGrid[i];
    if (item) {
      const cv = document.createElement('canvas');
      cv.width = cv.height = 48;
      drawItemIcon(item, cv);
      cell.appendChild(cv);
      if ((item.count || 1) > 1) {
        const c = document.createElement('span');
        c.className = 'cnt';
        c.textContent = item.count;
        cell.appendChild(c);
      }
    }
  });
}

function refreshTableResult() {
  const resBox = document.getElementById('table-result');
  const btn = document.getElementById('table-craft');
  const r = matchRecipeGrid(tableGrid, 3, CRAFTLIB.RECIPES);
  resBox.innerHTML = '';
  if (r) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 48;
    drawItemIcon(r.result, cv);
    resBox.appendChild(cv);
    if (btn) btn.disabled = false;
  } else if (btn) btn.disabled = true;
}

function performTableCraft() {
  const r = matchRecipeGrid(tableGrid, 3, CRAFTLIB.RECIPES);
  if (!r) return;
  craftGiveResult(r);
  // 消耗合成格内物品(每格 1 个)
  for (let i = 0; i < 9; i++) {
    if (tableGrid[i]) {
      tableGrid[i].count = (tableGrid[i].count || 1) - 1;
      if (tableGrid[i].count <= 0) tableGrid[i] = null;
    }
  }
  renderTableGrid();
  refreshTableResult();
  markDirtySave();
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
      case 'pig':   this._tone('triangle', 330, 0.1, 0.22, t); this._tone('triangle', 250, 0.12, 0.18, t + 0.09); break;
      case 'zombie':  this._tone('sawtooth', 95, 0.32, 0.2, t); this._tone('sawtooth', 72, 0.3, 0.16, t + 0.18); break;
      case 'fuse':    this._noise(0.9, 5200, 0.28, t); break;
      case 'explode': this._noise(0.5, 280, 0.75, t); this._tone('sawtooth', 55, 0.4, 0.35, t); break;
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
let settings = { volume: 0.35, soundEnabled: true, fov: 75, renderDist: 5, dayNightEnabled: true, dayCycleSpeed: 120, mobs: true, hostiles: true, weather: true };
function loadSettings() {
  try {
    const s = localStorage.getItem(SETTINGS_KEY);
    if (s) { const parsed = JSON.parse(s); Object.assign(settings, parsed); }
    settings.renderDist = Math.max(1, Math.min(10, settings.renderDist|0 || 5));
    var _vol = Number(settings.volume); settings.volume = Math.max(0, Math.min(1, Number.isFinite(_vol) ? _vol : 0.35));
  } catch (e) {}
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
function buildSaveRecord() {
  return {
    seed: worldSeed,
    dayTime,   // 世界时间随档走(0..1,0=午夜):防跨存档时间串档、床跳夜成果入档
    playerPos: { x: playerPos.x, y: playerPos.y, z: playerPos.z },
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
    mobsData: mobs.map(mm => ({ t: mm.type, x: Math.round(mm.mesh.position.x * 100) / 100, y: Math.round(mm.mesh.position.y * 100) / 100, z: Math.round(mm.mesh.position.z * 100) / 100, hp: mm.hp })),
    xpData: { level: xpState.level, points: xpState.points },
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
