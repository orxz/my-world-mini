// ============================================================
// craft.js - 合成与破坏计算(纯函数,无 DOM/Three.js 依赖)
// 从 game.js 提取:matchRecipe(配方匹配)、breakCost(破坏耗时)、RECIPES(配方表)
// 可在 Node 测试和浏览器中共用。game.js 通过 <script> 加载后,这些函数在全局可用。
// ============================================================
(function (global) {
  'use strict';

  // 合成配方表(2×2):pattern 是 4 格的方块/物品 id(或 null=空),result 是产出
  // shapeless:true 表示无序(任意位置都可),false 表示必须精确位置
  // 位置约定:pattern = [左上, 右上, 左下, 右下]
  // 工具类 result 不写 durability(纯函数层不依赖 TOOL_TYPES),由 game.js performCraft 注入满耐久

  // —— 基础材料链 ——
  const RECIPES = [
    // 木头→木板(1 木头 = 4 木板,无序)
    { name: '木板', pattern: ['wood', null, null, null], result: { kind: 'block', id: 'planks' }, count: 4, shapeless: true },
    // 木板→木棍(2 木板纵向 = 4 木棍)
    { name: '木棍', pattern: ['planks', null, 'planks', null], result: { kind: 'item', id: 'stick', count: 4 }, shapeless: false },
    // 木棍+沙砾→箭(沙砾中取燧石,1 组 4 支)
    { name: '箭', pattern: ['stick', 'gravel', null, null], result: { kind: 'item', id: 'arrow', count: 4 }, shapeless: true },

    // —— 建材 ——
    // 4 石头→石砖(用 brick 表示)
    { name: '石砖', pattern: ['stone', 'stone', 'stone', 'stone'], result: { kind: 'block', id: 'brick' }, count: 2, shapeless: true },
    // 4 沙子→沙砾
    { name: '沙砾', pattern: ['sand', 'sand', 'sand', 'sand'], result: { kind: 'block', id: 'gravel' }, count: 2, shapeless: true },
    // 4 雪块→冰(用 snow→water 表示,演示)
    { name: '融雪', pattern: ['snow', 'snow', 'snow', 'snow'], result: { kind: 'block', id: 'water' }, count: 1, shapeless: true },

    // —— 门(与工具/盾牌图案互不冲突) ——
    // 木门:2 木板(横向)→1 门
    { name: '木门', pattern: ['planks', 'planks', null, null], result: { kind: 'block', id: 'door' }, count: 1, shapeless: false },
    // 铁门:4 铁锭(2×2)→1 铁门
    { name: '铁门', pattern: ['gem_iron', 'gem_iron', 'gem_iron', 'gem_iron'], result: { kind: 'block', id: 'door_iron' }, count: 1, shapeless: true },
    // 石门:2 石头(纵向)→1 石门(有序,与石砖的4石头区分)
    { name: '石门', pattern: ['stone', null, 'stone', null], result: { kind: 'block', id: 'door_stone' }, count: 1, shapeless: false },
    // 金门:2 金锭(横向)→1 金门(有序,与铁门的4铁锭区分)
    { name: '金门', pattern: ['gem_gold', 'gem_gold', null, null], result: { kind: 'block', id: 'door_gold' }, count: 1, shapeless: false },
    // 钻石门:4 钻石(2×2)→1 钻石门
    { name: '钻石门', pattern: ['gem_diamond', 'gem_diamond', 'gem_diamond', 'gem_diamond'], result: { kind: 'block', id: 'door_diamond' }, count: 1, shapeless: true },
  ];

  // —— 工具配方(五档材质 × 镐/斧/铲/剑 = 20 种) ——
  // 统一 2×2 图案:M=材质, S=木棍, ∅=空
  //   镐 = [M,M,M,S]  斧 = [M,M,S,∅]  剑 = [M,M,∅,S]  铲 = [M,∅,S,∅]
  // wood 档材质用木板(planks),stone 档用石头(stone),金属档用对应锭
  const TOOL_TIERS = [
    ['wood', 'planks', '木'],
    ['stone', 'stone', '石'],
    ['iron', 'gem_iron', '铁'],
    ['gold', 'gem_gold', '金'],
    ['diamond', 'gem_diamond', '钻石'],
  ];
  const TOOL_SHAPES = [
    ['pickaxe', '镐', ['M', 'M', 'M', 'S']],
    ['axe', '斧', ['M', 'M', 'S', null]],
    ['sword', '剑', ['M', 'M', null, 'S']],
    ['shovel', '铲', ['M', null, 'S', null]],
  ];
  const TOOL_RECIPES = [];
  for (const [tierKey, matId, prefix] of TOOL_TIERS) {
    for (const [toolKey, shapeName, shape] of TOOL_SHAPES) {
      TOOL_RECIPES.push({
        name: prefix + shapeName,
        pattern: shape.map((c) => (c === 'M' ? matId : c === 'S' ? 'stick' : null)),
        result: { kind: 'tool', id: toolKey + '_' + tierKey },
        count: 1,
        shapeless: false,
      });
    }
  }

  // —— 弓/盾 ——
  const WEAPON_RECIPES = [
    // 弓:3 木棍(无序)
    { name: '弓', pattern: ['stick', 'stick', 'stick', null], result: { kind: 'tool', id: 'bow' }, count: 1, shapeless: true },
    // 木盾:4 木板(无序)
    { name: '木盾', pattern: ['planks', 'planks', 'planks', 'planks'], result: { kind: 'tool', id: 'shield_wood' }, count: 1, shapeless: true },
    // 铁盾:木板+铁锭 交错(有序)
    { name: '铁盾', pattern: ['planks', 'gem_iron', 'planks', 'gem_iron'], result: { kind: 'tool', id: 'shield_iron' }, count: 1, shapeless: false },
    // 钻石盾:木板+钻石 交错(有序)
    { name: '钻石盾', pattern: ['planks', 'gem_diamond', 'planks', 'gem_diamond'], result: { kind: 'tool', id: 'shield_diamond' }, count: 1, shapeless: false },
  ];

  const ALL_RECIPES = RECIPES.concat(TOOL_RECIPES, WEAPON_RECIPES);

  // 匹配配方:grid 是长度 4 的数组(每格 null 或 {kind,id}),返回配方对象或 null
  function matchRecipe(grid, recipes) {
    // 网格归一化(非空项的 id 列表)
    const gridItems = grid.filter(x => x !== null).map(x => x.id);
    if (gridItems.length === 0) return null;
    const gridSorted = [...gridItems].sort().join(',');
    for (const r of recipes) {
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
          const got = grid[i];
          if ((want === null) !== (got === null)) { ok = false; break; }
          if (want && (!got || got.id !== want)) { ok = false; break; }
        }
        if (ok) return r;
      }
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
    module.exports = { RECIPES: ALL_RECIPES, matchRecipe, breakCost };
  }
  // 浏览器:挂到全局
  global.CRAFTLIB = { RECIPES: ALL_RECIPES, matchRecipe, breakCost };

})(typeof window !== 'undefined' ? window : globalThis);
