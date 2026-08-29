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
    { name: '铁门', pattern: ['gem_gold', 'gem_gold', 'gem_gold', 'gem_gold'], result: { kind: 'block', id: 'door_iron' }, count: 1, shapeless: true },
    // 石门:2 石头(纵向)→1 石门(有序,与石砖的4石头区分)
    { name: '石门', pattern: ['stone', null, 'stone', null], result: { kind: 'block', id: 'door_stone' }, count: 1, shapeless: false },
    // 金门:2 金锭(横向)→1 金门(有序,与铁门的4金锭区分)
    { name: '金门', pattern: ['gem_gold', 'gem_gold', null, null], result: { kind: 'block', id: 'door_gold' }, count: 1, shapeless: false },
    // 钻石门:4 钻石(2×2)→1 钻石门
    { name: '钻石门', pattern: ['gem_diamond', 'gem_diamond', 'gem_diamond', 'gem_diamond'], result: { kind: 'block', id: 'door_diamond' }, count: 1, shapeless: true },
    // ---- 以下为 3×3 专属配方(合成台内可用) ----
    // 铁镐:3 金锭(代铁)上排 + 2 箭(代木棍)中列
    { name: '铁镐', pattern: ['gem_gold', 'gem_gold', 'gem_gold', null, 'arrow', null, null, 'arrow', null], result: { kind: 'tool', id: 'pickaxe_iron' }, shapeless: false },
    // 钻石镐:3 钻石上排 + 2 箭(代木棍)中列
    { name: '钻石镐', pattern: ['gem_diamond', 'gem_diamond', 'gem_diamond', null, 'arrow', null, null, 'arrow', null], result: { kind: 'tool', id: 'pickaxe_diamond' }, shapeless: false },
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
    // ---- 工具配方(3×3:3 材料上排 + 2 木棍中列,经典镐形)----
    { name: '木镐', pattern: ['planks', 'planks', 'planks', null, 'stick', null, null, 'stick', null], result: { kind: 'tool', id: 'pickaxe_wood' }, shapeless: false },
    { name: '石镐', pattern: ['cobblestone', 'cobblestone', 'cobblestone', null, 'stick', null, null, 'stick', null], result: { kind: 'tool', id: 'pickaxe_stone' }, shapeless: false },
    { name: '铁镐(矿石)', pattern: ['iron_ore', 'iron_ore', 'iron_ore', null, 'stick', null, null, 'stick', null], result: { kind: 'tool', id: 'pickaxe_iron' }, shapeless: false },
    // ---- 剑配方(3×3:2 材料竖列 + 1 木棍底,经典剑形)----
    { name: '木剑', pattern: ['planks', null, null, 'planks', null, null, 'stick', null, null], result: { kind: 'tool', id: 'sword_wood' }, shapeless: false },
    { name: '石剑', pattern: ['cobblestone', null, null, 'cobblestone', null, null, 'stick', null, null], result: { kind: 'tool', id: 'sword_stone' }, shapeless: false },
    { name: '铁剑', pattern: ['iron_ingot', null, null, 'iron_ingot', null, null, 'stick', null, null], result: { kind: 'tool', id: 'sword_iron' }, shapeless: false },
    { name: '钻石剑', pattern: ['gem_diamond', null, null, 'gem_diamond', null, null, 'stick', null, null], result: { kind: 'tool', id: 'sword_diamond' }, shapeless: false },
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
    if (toolDef && toolDef.tool === blockDef.tool) {
      return Math.max(1, Math.round(baseClicks / toolDef.speed));
    }
    return baseClicks;
  }

  // 导出(Node 环境)
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { RECIPES, matchRecipe, matchRecipeGrid, breakCost };
  }
  // 浏览器:挂到全局(CRAFTLIB 命名空间 + 裸函数,game.js 直接调用)
  global.CRAFTLIB = { RECIPES, matchRecipe, matchRecipeGrid, breakCost };
  global.matchRecipeGrid = matchRecipeGrid;

})(typeof window !== 'undefined' ? window : globalThis);
