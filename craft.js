// ============================================================
// craft.js - 合成与破坏计算(纯函数,无 DOM/Three.js 依赖)
// 从 game.js 提取:matchRecipe(配方匹配)、breakCost(破坏耗时)、RECIPES(配方表)
// 可在 Node 测试和浏览器中共用。game.js 通过 <script> 加载后,这些函数在全局可用。
// ============================================================
(function (global) {
  'use strict';

  // 合成配方表(2×2):pattern 是 4 格的方块 id(或 null=空),result 是产出
  // shapeless:true 表示无序(任意位置都可),false 表示必须精确位置
  const RECIPES = [
    // 基础:木头→木板(1 木头 = 4 木板,无序)
    { name: '木板', pattern: ['wood', null, null, null], result: { kind: 'block', id: 'planks' }, count: 4, shapeless: true },
    // 木板→木棍(2 木板纵向 = 4 木棍,经典配方;后续工具的必需材料)
    { name: '木棍', pattern: ['planks', null, 'planks', null], result: { kind: 'item', id: 'stick' }, count: 4, shapeless: false },
    // 木棍→箭(2 木棍纵向 = 4 箭)
    { name: '箭', pattern: ['stick', null, 'stick', null], result: { kind: 'item', id: 'arrow' }, count: 4, shapeless: false },
    // 4 木板→合成台(经典工作台配方,放入世界后右键打开 3×3 合成)
    { name: '合成台', pattern: ['planks', 'planks', 'planks', 'planks'], result: { kind: 'block', id: 'crafting_table' }, count: 1, shapeless: true },
    // 4 石头→石砖(用 brick 表示)
    { name: '石砖', pattern: ['stone', 'stone', 'stone', 'stone'], result: { kind: 'block', id: 'brick' }, count: 2, shapeless: true },
    // 4 砖块→砖块(压缩,演示)
    { name: '砖块', pattern: ['brick', 'brick', 'brick', 'brick'], result: { kind: 'block', id: 'brick' }, count: 1, shapeless: true },
    // 4 沙子→沙砾
    { name: '沙砾', pattern: ['sand', 'sand', 'sand', 'sand'], result: { kind: 'block', id: 'gravel' }, count: 2, shapeless: true },
    // 4 雪块→冰(用 snow→water 表示,演示)
    { name: '融雪', pattern: ['snow', 'snow', 'snow', 'snow'], result: { kind: 'block', id: 'water' }, count: 1, shapeless: true },
    // 木门:2 木板(横向)→1 门
    { name: '木门', pattern: ['planks', 'planks', null, null], result: { kind: 'block', id: 'door' }, count: 1, shapeless: false },
    // 铁门:4 铁锭(2×2)→1 铁门
    { name: '铁门', pattern: ['iron_ingot', 'iron_ingot', 'iron_ingot', 'iron_ingot'], result: { kind: 'block', id: 'door_iron' }, count: 1, shapeless: false },
    // 石门:2 石头(纵向)→1 石门(有序,与石砖的4石头区分)
    { name: '石门', pattern: ['stone', null, 'stone', null], result: { kind: 'block', id: 'door_stone' }, count: 1, shapeless: false },
    // 金门:2 金锭(横向)→1 金门(有序,与铁门的4金锭区分)
    { name: '金门', pattern: ['gem_gold', 'gem_gold', null, null], result: { kind: 'block', id: 'door_gold' }, count: 1, shapeless: false },
    // 钻石门:4 钻石(2×2)→1 钻石门
    { name: '钻石门', pattern: ['gem_diamond', 'gem_diamond', 'gem_diamond', 'gem_diamond'], result: { kind: 'block', id: 'door_diamond' }, count: 1, shapeless: false },
    // ---- 以下为 3×3 专属配方(合成台内可用) ----
    // 铁镐:3 铁锭上排 + 2 木棍中列(经典镐形)
    { name: '铁镐', pattern: ['iron_ingot', 'iron_ingot', 'iron_ingot', null, 'stick', null, null, 'stick', null], result: { kind: 'tool', id: 'pickaxe_iron' }, shapeless: false },
    // 钻石镐:3 钻石上排 + 2 木棍中列
    { name: '钻石镐', pattern: ['gem_diamond', 'gem_diamond', 'gem_diamond', null, 'stick', null, null, 'stick', null], result: { kind: 'tool', id: 'pickaxe_diamond' }, shapeless: false },
    // 石砖墙块:8 石头围一圈(中心空)→ 4 石砖(3×3 专属,演示环形图案)
    { name: '石砖(大量)', pattern: ['stone', 'stone', 'stone', 'stone', null, 'stone', 'stone', 'stone', 'stone'], result: { kind: 'block', id: 'brick' }, count: 4, shapeless: false },
    // 圆石→石头(经典烧制的合成演示;无熔炉版本)
    { name: '石头', pattern: ['cobblestone', null, null, null], result: { kind: 'block', id: 'stone' }, count: 1, shapeless: true },
    // TNT:1 煤炭 + 3 沙(无序,火药替代演示)
    { name: 'TNT', pattern: ['coal', 'sand', 'sand', 'sand'], result: { kind: 'block', id: 'tnt' }, count: 1, shapeless: true },
    // 熔炉:8 圆石围一圈(经典配方)
    { name: '熔炉', pattern: ['cobblestone', 'cobblestone', 'cobblestone', 'cobblestone', null, 'cobblestone', 'cobblestone', 'cobblestone', 'cobblestone'], result: { kind: 'block', id: 'furnace' }, count: 1, shapeless: false },
    // 箱子:8 木板围一圈(经典配方)
    { name: '箱子', pattern: ['planks', 'planks', 'planks', 'planks', null, 'planks', 'planks', 'planks', 'planks'], result: { kind: 'block', id: 'chest' }, count: 1, shapeless: false },
    // 床:3 羊毛 + 3 木板(经典;红/白两色羊毛任选)
    { name: '床', pattern: ['wool_red', 'wool_red', 'wool_red', 'planks', 'planks', 'planks', null, null, null], result: { kind: 'block', id: 'bed' }, count: 1, shapeless: false },
    { name: '床(白)', pattern: ['wool_white', 'wool_white', 'wool_white', 'planks', 'planks', 'planks', null, null, null], result: { kind: 'block', id: 'bed' }, count: 1, shapeless: false },
    // 梯子:7 木棍 H 形(经典配方)
    { name: '梯子', pattern: ['stick', null, 'stick', 'stick', 'stick', 'stick', 'stick', null, 'stick'], result: { kind: 'block', id: 'ladder' }, count: 3, shapeless: false },
    // 书:2 皮革 + 1 木棍(无序;经典纸+皮革的简化链)
    { name: '书', pattern: ['leather', 'leather', 'stick', null], result: { kind: 'item', id: 'book' }, count: 1, shapeless: true },
    // 书架:6 木板 + 3 书(经典配方)
    { name: '书架', pattern: ['planks', 'planks', 'planks', 'book', 'book', 'book', 'planks', 'planks', 'planks'], result: { kind: 'block', id: 'bookshelf' }, count: 1, shapeless: false },
    // 火把:煤炭上 + 木棍下(经典配方 → 4 支;光源,R22)
    { name: '火把', pattern: ['coal', null, 'stick', null], result: { kind: 'block', id: 'torch' }, count: 4, shapeless: false },
    // 剪刀:2 铁锭对角(经典配方,R35;剪羊毛)
    { name: '剪刀', pattern: ['iron_ingot', null, null, 'iron_ingot'], result: { kind: 'tool', id: 'shears' }, count: 1, shapeless: false },
    // 黏液块:4 黏液球(经典配方,R35;落地弹跳)
    { name: '黏液块', pattern: ['slime_ball', 'slime_ball', 'slime_ball', 'slime_ball'], result: { kind: 'block', id: 'slime' }, count: 1, shapeless: true },
    // 铁桶:3 铁锭 V 形(经典配方,R36;舀水/放水)
    { name: '铁桶', pattern: ['iron_ingot', null, 'iron_ingot', null, 'iron_ingot', null, null, null, null], result: { kind: 'item', id: 'bucket' }, count: 1, shapeless: false },
    // 红石火把:红石粉上 + 木棍下(经典配方,R38;常开电源)
    { name: '红石火把', pattern: ['redstone_dust', null, 'stick', null], result: { kind: 'block', id: 'redstone_torch' }, count: 1, shapeless: false },
    // 拉杆:木棍上 + 圆石下(经典配方,R38;右键开关电源)
    { name: '拉杆', pattern: ['stick', null, 'cobblestone', null], result: { kind: 'block', id: 'lever_off' }, count: 1, shapeless: false },
    // 红石线:1 红石粉无序(经典直接撒粉,R38)
    { name: '红石线', pattern: ['redstone_dust', null, null, null], result: { kind: 'block', id: 'redstone' }, count: 1, shapeless: true },
    // 铁块:9 铁锭(经典压缩,R39;铁傀儡构造材料)
    { name: '铁块', pattern: ['iron_ingot', 'iron_ingot', 'iron_ingot', 'iron_ingot', 'iron_ingot', 'iron_ingot', 'iron_ingot', 'iron_ingot', 'iron_ingot'], result: { kind: 'block', id: 'iron_block' }, count: 1, shapeless: false },
    // 南瓜灯(R57,经典):雕刻南瓜 + 火把 = 南瓜灯(无序,可当铁傀儡头部/发光光源)
    { name: '南瓜灯', pattern: ['carved_pumpkin', 'torch', null, null], result: { kind: 'block', id: 'pumpkin_lantern' }, count: 1, shapeless: true },
    // 铁块分解:1 块 → 9 铁锭(经典,R39)
    { name: '铁锭(分解)', pattern: ['iron_block', null, null, null], result: { kind: 'item', id: 'iron_ingot' }, count: 9, shapeless: true },
    // 糖:1 甘蔗(R40)
    { name: '糖', pattern: ['sugarcane', null, null, null], result: { kind: 'item', id: 'sugar' }, count: 1, shapeless: true },
    // 蛋糕:2 糖 + 1 蛋 + 3 小麦(经典配方简化:无奶链,R40)
    { name: '蛋糕', pattern: ['sugar', 'sugar', 'egg', 'wheat', 'wheat', 'wheat', null, null, null], result: { kind: 'block', id: 'cake' }, count: 1, shapeless: true },
    // ---- 建筑方块(R41)----
    // 木台阶:3 木板一排 → 6(经典)
    { name: '木台阶', pattern: ['planks', 'planks', 'planks', null, null, null, null, null, null], result: { kind: 'block', id: 'slab_planks' }, count: 6, shapeless: false },
    // 石台阶:3 圆石一排 → 6(经典)
    { name: '石台阶', pattern: ['cobblestone', 'cobblestone', 'cobblestone', null, null, null, null, null, null], result: { kind: 'block', id: 'slab_cobble' }, count: 6, shapeless: false },
    // 木楼梯:6 木板阶梯形 → 4(经典)
    { name: '木楼梯', pattern: ['planks', null, null, 'planks', 'planks', null, 'planks', 'planks', 'planks'], result: { kind: 'block', id: 'stairs_planks' }, count: 4, shapeless: false },
    // 石楼梯:6 圆石阶梯形 → 4(经典)
    { name: '石楼梯', pattern: ['cobblestone', null, null, 'cobblestone', 'cobblestone', null, 'cobblestone', 'cobblestone', 'cobblestone'], result: { kind: 'block', id: 'stairs_cobble' }, count: 4, shapeless: false },
    // 栅栏:4 木板 + 2 木棍 → 3(经典)
    { name: '栅栏', pattern: ['planks', 'stick', 'planks', 'planks', 'stick', 'planks', null, null, null], result: { kind: 'block', id: 'fence' }, count: 3, shapeless: false },
    // 中继器:2 红石火把 + 3 石头(经典,R42;信号延长/延迟)
    { name: '中继器', pattern: ['redstone_torch', 'stone', 'redstone_torch', 'stone', 'stone', 'stone', null, null, null], result: { kind: 'block', id: 'repeater_off' }, count: 1, shapeless: false },
    // 活塞:3 木板 + 4 圆石 + 1 铁锭 + 1 红石粉(经典,R42)
    { name: '活塞', pattern: ['planks', 'planks', 'planks', 'cobblestone', 'iron_ingot', 'cobblestone', 'cobblestone', 'redstone_dust', 'cobblestone'], result: { kind: 'block', id: 'piston' }, count: 1, shapeless: false },
    // 铁轨:6 铁锭 + 1 木棍(经典配方 → 16 节)
    { name: '铁轨', pattern: ['iron_ingot', 'iron_ingot', 'iron_ingot', 'iron_ingot', 'stick', 'iron_ingot', null, null, null], result: { kind: 'block', id: 'rail' }, count: 16, shapeless: false },
    // 矿车:5 铁锭 U 形(经典配方 → 1 辆)
    { name: '矿车', pattern: ['iron_ingot', null, 'iron_ingot', 'iron_ingot', 'iron_ingot', 'iron_ingot', null, null, null], result: { kind: 'item', id: 'minecart' }, count: 1, shapeless: false },
    // 附魔台:2 钻石 + 3 书 + 1 石头(R28 简化配方;经典为黑曜石)
    { name: '附魔台', pattern: ['gem_diamond', 'book', 'gem_diamond', 'book', 'stone', 'book', null, null, null], result: { kind: 'block', id: 'enchanting_table' }, count: 1, shapeless: false },
    // 钓鱼竿:3 木棍斜排 + 2 蛛丝(经典配方,R29)
    { name: '钓鱼竿', pattern: [null, null, 'stick', null, 'stick', 'string', 'stick', null, 'string'], result: { kind: 'tool', id: 'fishing_rod' }, count: 1, shapeless: false },
    // 面包:3 小麦一排(经典配方,R29)
    { name: '面包', pattern: ['wheat', 'wheat', 'wheat', null, null, null, null, null, null], result: { kind: 'item', id: 'bread' }, count: 1, shapeless: false },
    // ---- 工具配方(3×3:3 材料上排 + 2 木棍中列,经典镐形)----
    { name: '木镐', pattern: ['planks', 'planks', 'planks', null, 'stick', null, null, 'stick', null], result: { kind: 'tool', id: 'pickaxe_wood' }, shapeless: false },
    { name: '石镐', pattern: ['cobblestone', 'cobblestone', 'cobblestone', null, 'stick', null, null, 'stick', null], result: { kind: 'tool', id: 'pickaxe_stone' }, shapeless: false },
    { name: '金镐', pattern: ['gem_gold', 'gem_gold', 'gem_gold', null, 'stick', null, null, 'stick', null], result: { kind: 'tool', id: 'pickaxe_gold' }, shapeless: false },
    // ---- 斧(2 材料上排 + 材料/木棍中排 + 木棍底)----
    { name: '木斧', pattern: ['planks', 'planks', null, 'planks', 'stick', null, null, 'stick', null], result: { kind: 'tool', id: 'axe_wood' }, shapeless: false },
    { name: '石斧', pattern: ['cobblestone', 'cobblestone', null, 'cobblestone', 'stick', null, null, 'stick', null], result: { kind: 'tool', id: 'axe_stone' }, shapeless: false },
    { name: '铁斧', pattern: ['iron_ingot', 'iron_ingot', null, 'iron_ingot', 'stick', null, null, 'stick', null], result: { kind: 'tool', id: 'axe_iron' }, shapeless: false },
    { name: '金斧', pattern: ['gem_gold', 'gem_gold', null, 'gem_gold', 'stick', null, null, 'stick', null], result: { kind: 'tool', id: 'axe_gold' }, shapeless: false },
    { name: '钻石斧', pattern: ['gem_diamond', 'gem_diamond', null, 'gem_diamond', 'stick', null, null, 'stick', null], result: { kind: 'tool', id: 'axe_diamond' }, shapeless: false },
    // ---- 铲(1 材料 + 2 木棍竖列)----
    { name: '木铲', pattern: ['planks', null, null, 'stick', null, null, 'stick', null, null], result: { kind: 'tool', id: 'shovel_wood' }, shapeless: false },
    { name: '石铲', pattern: ['cobblestone', null, null, 'stick', null, null, 'stick', null, null], result: { kind: 'tool', id: 'shovel_stone' }, shapeless: false },
    { name: '铁铲', pattern: ['iron_ingot', null, null, 'stick', null, null, 'stick', null, null], result: { kind: 'tool', id: 'shovel_iron' }, shapeless: false },
    { name: '金铲', pattern: ['gem_gold', null, null, 'stick', null, null, 'stick', null, null], result: { kind: 'tool', id: 'shovel_gold' }, shapeless: false },
    { name: '钻石铲', pattern: ['gem_diamond', null, null, 'stick', null, null, 'stick', null, null], result: { kind: 'tool', id: 'shovel_diamond' }, shapeless: false },
    // ---- 剑配方(3×3:2 材料竖列 + 1 木棍底,经典剑形)----
    { name: '木剑', pattern: ['planks', null, null, 'planks', null, null, 'stick', null, null], result: { kind: 'tool', id: 'sword_wood' }, shapeless: false },
    { name: '石剑', pattern: ['cobblestone', null, null, 'cobblestone', null, null, 'stick', null, null], result: { kind: 'tool', id: 'sword_stone' }, shapeless: false },
    { name: '铁剑', pattern: ['iron_ingot', null, null, 'iron_ingot', null, null, 'stick', null, null], result: { kind: 'tool', id: 'sword_iron' }, shapeless: false },
    { name: '金剑', pattern: ['gem_gold', null, null, 'gem_gold', null, null, 'stick', null, null], result: { kind: 'tool', id: 'sword_gold' }, shapeless: false },
    { name: '钻石剑', pattern: ['gem_diamond', null, null, 'gem_diamond', null, null, 'stick', null, null], result: { kind: 'tool', id: 'sword_diamond' }, shapeless: false },
    // ---- 护甲配方(3×3 经典形状:帽 5 材料981形 / 甲 8 围形 / 裤 7 / 靴 4 两侧列)----
    // 皮革(牛掉皮革的下游)
    { name: '皮革帽子', pattern: ['leather', 'leather', 'leather', 'leather', null, 'leather', null, null, null], result: { kind: 'tool', id: 'helmet_leather' }, shapeless: false },
    { name: '皮革上衣', pattern: ['leather', null, 'leather', 'leather', 'leather', 'leather', 'leather', 'leather', 'leather'], result: { kind: 'tool', id: 'chestplate_leather' }, shapeless: false },
    { name: '皮革裤子', pattern: ['leather', 'leather', 'leather', 'leather', null, 'leather', 'leather', null, 'leather'], result: { kind: 'tool', id: 'leggings_leather' }, shapeless: false },
    { name: '皮革鞋子', pattern: ['leather', null, 'leather', 'leather', null, 'leather', null, null, null], result: { kind: 'tool', id: 'boots_leather' }, shapeless: false },
    // 铁(熔炉冶炼铁锭的下游)
    { name: '铁头盔', pattern: ['iron_ingot', 'iron_ingot', 'iron_ingot', 'iron_ingot', null, 'iron_ingot', null, null, null], result: { kind: 'tool', id: 'helmet_iron' }, shapeless: false },
    { name: '铁胸甲', pattern: ['iron_ingot', null, 'iron_ingot', 'iron_ingot', 'iron_ingot', 'iron_ingot', 'iron_ingot', 'iron_ingot', 'iron_ingot'], result: { kind: 'tool', id: 'chestplate_iron' }, shapeless: false },
    { name: '铁护腿', pattern: ['iron_ingot', 'iron_ingot', 'iron_ingot', 'iron_ingot', null, 'iron_ingot', 'iron_ingot', null, 'iron_ingot'], result: { kind: 'tool', id: 'leggings_iron' }, shapeless: false },
    { name: '铁靴子', pattern: ['iron_ingot', null, 'iron_ingot', 'iron_ingot', null, 'iron_ingot', null, null, null], result: { kind: 'tool', id: 'boots_iron' }, shapeless: false },
    // 金
    { name: '金头盔', pattern: ['gem_gold', 'gem_gold', 'gem_gold', 'gem_gold', null, 'gem_gold', null, null, null], result: { kind: 'tool', id: 'helmet_gold' }, shapeless: false },
    { name: '金胸甲', pattern: ['gem_gold', null, 'gem_gold', 'gem_gold', 'gem_gold', 'gem_gold', 'gem_gold', 'gem_gold', 'gem_gold'], result: { kind: 'tool', id: 'chestplate_gold' }, shapeless: false },
    { name: '金护腿', pattern: ['gem_gold', 'gem_gold', 'gem_gold', 'gem_gold', null, 'gem_gold', 'gem_gold', null, 'gem_gold'], result: { kind: 'tool', id: 'leggings_gold' }, shapeless: false },
    { name: '金靴子', pattern: ['gem_gold', null, 'gem_gold', 'gem_gold', null, 'gem_gold', null, null, null], result: { kind: 'tool', id: 'boots_gold' }, shapeless: false },
    // 钻石
    { name: '钻石头盔', pattern: ['gem_diamond', 'gem_diamond', 'gem_diamond', 'gem_diamond', null, 'gem_diamond', null, null, null], result: { kind: 'tool', id: 'helmet_diamond' }, shapeless: false },
    { name: '钻石胸甲', pattern: ['gem_diamond', null, 'gem_diamond', 'gem_diamond', 'gem_diamond', 'gem_diamond', 'gem_diamond', 'gem_diamond', 'gem_diamond'], result: { kind: 'tool', id: 'chestplate_diamond' }, shapeless: false },
    { name: '钻石护腿', pattern: ['gem_diamond', 'gem_diamond', 'gem_diamond', 'gem_diamond', null, 'gem_diamond', 'gem_diamond', null, 'gem_diamond'], result: { kind: 'tool', id: 'leggings_diamond' }, shapeless: false },
    { name: '钻石靴子', pattern: ['gem_diamond', null, 'gem_diamond', 'gem_diamond', null, 'gem_diamond', null, null, null], result: { kind: 'tool', id: 'boots_diamond' }, shapeless: false },
    // ---- R55:铁/终局新增 ----
    // 铁栏杆:6 铁锭 → 16 根(经典 6 铁锭 → 16 铁栏杆)
    { name: '铁栏杆', pattern: ['iron_ingot', 'iron_ingot', 'iron_ingot', 'iron_ingot', 'iron_ingot', 'iron_ingot', null, null, null], result: { kind: 'block', id: 'iron_bars' }, count: 16, shapeless: true },
    // 金苹果:8 金锭围 1 苹果(经典;提供 60 秒伤害吸收)
    { name: '金苹果', pattern: ['gem_gold', 'gem_gold', 'gem_gold', 'gem_gold', 'apple', 'gem_gold', 'gem_gold', 'gem_gold', 'gem_gold'], result: { kind: 'item', id: 'gold_apple' }, count: 1, shapeless: false },
    // 信标:4 铁块 + 地心核心 + 钻石(终局光环)
    { name: '信标', pattern: ['iron_block', 'iron_block', 'iron_block', 'iron_block', 'golem_core', 'iron_block', 'iron_block', 'gem_diamond', 'iron_block'], result: { kind: 'block', id: 'beacon' }, count: 1, shapeless: false },
  ];

  // 匹配配方:grid 是长度 4 的数组(每格 null 或 {kind,id}),返回配方对象或 null
  // (保持原签名;内部走通用网格匹配,2×2 语义与旧版一致)
  function matchRecipe(grid, recipes) {
    return matchRecipeGrid(grid, 2, recipes);
  }

  // 通用网格匹配:grid 长度为 w*w(2=背包 2×2,3=合成台 3×3)
  // - 无序配方:非空 id 多重集合相等(数量不限格位)
  // - 有序配方:取网格非空格的最小包围盒,与配方的包围盒逐格比较 ——
  //   经典 MC 行为:图案在网格内平移仍然匹配(尺寸必须一致)
  function matchRecipeGrid(grid, w, recipes) {
    // 收集非空格
    const cells = [];
    for (let i = 0; i < w * w; i++) {
      if (grid[i]) cells.push({ i, id: grid[i].id });
    }
    if (cells.length === 0) return null;
    const gridSorted = cells.map(c => c.id).sort().join(',');
    for (const r of recipes) {
      const recipeItems = r.pattern.filter(x => x !== null);
      if (r.shapeless) {
        if (cells.length !== recipeItems.length) continue;
        if ([...recipeItems].sort().join(',') === gridSorted) return r;
        continue;
      }
      if (cells.length !== recipeItems.length) continue;
      // 配方包围盒(按配方自身边长索引:2×2 配方宽 2,3×3 配方宽 3)
      const rw = Math.sqrt(r.pattern.length);
      let minR = 9, maxR = -1, minC = 9, maxC = -1;
      for (let i = 0; i < r.pattern.length; i++) {
        if (r.pattern[i] === null) continue;
        const rr = Math.floor(i / rw), cc = i % rw;
        if (rr < minR) minR = rr;
        if (rr > maxR) maxR = rr;
        if (cc < minC) minC = cc;
        if (cc > maxC) maxC = cc;
      }
      const ph = maxR - minR + 1, pw = maxC - minC + 1;
      // 网格包围盒
      let gMinR = 9, gMaxR = -1, gMinC = 9, gMaxC = -1;
      for (const c of cells) {
        const rr = Math.floor(c.i / w), cc = c.i % w;
        if (rr < gMinR) gMinR = rr;
        if (rr > gMaxR) gMaxR = rr;
        if (cc < gMinC) gMinC = cc;
        if (cc > gMaxC) gMaxC = cc;
      }
      const gh = gMaxR - gMinR + 1, gw = gMaxC - gMinC + 1;
      if (ph !== gh || pw !== gw) continue;
      // 逐格比较
      let ok = true;
      for (let rr = 0; rr < ph && ok; rr++) {
        for (let cc = 0; cc < pw; cc++) {
          const want = r.pattern[(minR + rr) * rw + (minC + cc)] || null;
          const got = grid[(gMinR + rr) * w + (gMinC + cc)] || null;
          if ((want === null) !== (got === null)) { ok = false; break; }
          if (want && (!got || got.id !== want)) { ok = false; break; }
        }
      }
      if (ok) return r;
    }
    return null;
  }

  // 破坏耗时:blockDef 是 BLOCK_TYPES 条目 {hardness, tool},toolDef 是 TOOL_TYPES 条目或 null
  // 返回破坏所需点击次数(至少 1)
  function breakCost(blockDef, toolDef) {
    const baseClicks = Math.max(1, Math.round(blockDef.hardness * 3));
    let clicks = baseClicks;
    if (toolDef && toolDef.tool === blockDef.tool) {
      clicks = Math.max(1, Math.round(baseClicks / toolDef.speed));
    }
    // R55:层级不足可挖掉但更慢(×2.5),且不掉落(由 canHarvest 判定)
    if (!canHarvest(blockDef, toolDef)) clicks = Math.ceil(clicks * 2.5);
    return clicks;
  }

  // 采矿层级(R55):方块 tier 0 任何人都能收获;>0 必须手持同类工具且层级达标。
  // 工具层级见 game-defs.js 的 TOOL_TYPES[].level;空手/非镐视为 0。
  function canHarvest(blockDef, toolDef) {
    const need = (blockDef && blockDef.tier) || 0;
    if (need <= 0) return true;
    if (!toolDef || toolDef.tool !== 'pickaxe') return false;
    return (toolDef.level || 0) >= need;
  }

  // ---- 配方书(R55):分类/搜索/材料缺口(纯函数,可单测) ----
  const FOOD_RESULTS = { bread: 1, cake: 1, gold_apple: 1, cooked_porkchop: 1, steak: 1, cooked_fish: 1, cooked_chicken: 1 };
  function recipeCategory(r) {
    if (!r || !r.result) return '杂项';
    const id = r.result.id;
    if (/^sword_|^bow$/.test(id)) return '武器';
    if (/^(helmet|chestplate|leggings|boots)_/.test(id)) return '护甲';
    if (/^(pickaxe|axe|shovel)_|^(fishing_rod|shears)$/.test(id)) return '工具';
    if (r.result.kind === 'block') {
      if (/^(redstone|lever|repeater|piston|torch)/.test(id)) return '红石';
      if (id === 'cake') return '食物';
      return '建材';
    }
    if (FOOD_RESULTS[id]) return '食物';
    if (id === 'redstone_dust') return '红石';
    return '杂项';
  }

  function recipeMaterials(r) {
    const need = {};
    if (!r || !r.pattern) return need;
    for (const p of r.pattern) if (p) need[p] = (need[p] || 0) + 1;
    return need;
  }

  // counts: {itemId: 持有数量};返回 [{id, need, have}] 缺口(空数组=可合成)
  function recipeMissing(r, counts) {
    const need = recipeMaterials(r);
    const miss = [];
    for (const id in need) {
      const have = (counts && counts[id]) || 0;
      if (have < need[id]) miss.push({ id, need: need[id], have });
    }
    return miss;
  }

  // 配方能否放进 size×size 网格(2 或 3):按图案包围盒判断
  function recipeFits(r, size) {
    if (!r || !r.pattern) return false;
    const w = Math.sqrt(r.pattern.length) | 0;
    let minR = 9, maxR = -1, minC = 9, maxC = -1;
    for (let i = 0; i < r.pattern.length; i++) {
      if (!r.pattern[i]) continue;
      const rr = Math.floor(i / w), cc = i % w;
      if (rr < minR) minR = rr;
      if (rr > maxR) maxR = rr;
      if (cc < minC) minC = cc;
      if (cc > maxC) maxC = cc;
    }
    if (maxR < 0) return false;
    return (maxR - minR + 1) <= size && (maxC - minC + 1) <= size;
  }

  function filterRecipes(recipes, query, cat) {
    const q = (query || '').trim().toLowerCase();
    return recipes.filter(r => {
      if (cat && cat !== '全部' && recipeCategory(r) !== cat) return false;
      if (!q) return true;
      return (r.name || '').toLowerCase().indexOf(q) >= 0
        || (r.result && String(r.result.id).toLowerCase().indexOf(q) >= 0);
    });
  }

  // 把配方图案按包围盒左上角对齐铺进 size×size 网格(R57)
  // 返回长度 size*size 的数组:id 或 null。2×2 配方 w=2、3×3 配方 w=3 —— 写死 w 会让 2×2 错位
  function recipeFillGrid(r, size) {
    const out = new Array(size * size).fill(null);
    if (!r || !r.pattern) return out;
    const w = Math.sqrt(r.pattern.length) | 0;
    let minR = 9, minC = 9;
    for (let i = 0; i < r.pattern.length; i++) {
      if (!r.pattern[i]) continue;
      minR = Math.min(minR, Math.floor(i / w));
      minC = Math.min(minC, i % w);
    }
    for (let i = 0; i < r.pattern.length; i++) {
      const id = r.pattern[i];
      if (!id) continue;
      const rr = Math.floor(i / w) - minR, cc = (i % w) - minC;
      if (rr >= size || cc >= size) continue;
      out[rr * size + cc] = id;
    }
    return out;
  }

  // 导出(Node 环境)
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { RECIPES, matchRecipe, matchRecipeGrid, breakCost, canHarvest, recipeCategory, recipeMaterials, recipeMissing, recipeFits, filterRecipes, recipeFillGrid };
  }
  // 浏览器:挂到全局(CRAFTLIB 命名空间 + 裸函数,game.js 直接调用)
  global.CRAFTLIB = { RECIPES, matchRecipe, matchRecipeGrid, breakCost, canHarvest, recipeCategory, recipeMaterials, recipeMissing, recipeFits, filterRecipes, recipeFillGrid };
  global.matchRecipeGrid = matchRecipeGrid;

})(typeof window !== 'undefined' ? window : globalThis);
