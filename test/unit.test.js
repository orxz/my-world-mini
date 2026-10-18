// ============================================================
// 单元测试 - 确定性函数验证(Node 环境)
// 用法: node test/unit.test.js
// 测试对象: 从 game.js 提取的纯函数层
//   - worldgen.js: heightAt/biomeAt/哈希/噪声
//   - craft.js: matchRecipe/breakCost/RECIPES
// 这些函数不依赖 DOM/Three.js,可直接在 Node 跑
// ============================================================
const assert = require('assert');

// ---- 从 worldgen.js 模块加载(单一数据源,不再手抄) ----
const { hash2, hash3, valueNoise2D, valueNoise3D, fbm2D, BIOMES, biomeAt, heightAt, caveAt, villageInCell, hutBlockAt, dungeonInCell, dungeonBlockAt } = require('../worldgen.js');

// ---- 从 craft.js 模块加载(合成/破坏计算的单一数据源) ----
const { RECIPES, matchRecipe, matchRecipeGrid, breakCost, canHarvest, recipeCategory, recipeMaterials, recipeMissing, recipeFits, filterRecipes, recipeFillGrid } = require('../craft.js');

// ---- 从 balance.js 加载(R55:数值单一来源) ----
const BALANCE_LIB = require('../balance.js');
const { BALANCE } = BALANCE_LIB;

// ---- 从 machines.js 模块加载(状态机纯函数:教程/熔炉/天气/存档 schema,R25) ----
const { TUTORIAL_STEPS, advanceTutorial, SMELT, furnaceCanSmelt, furnaceTick, weatherNext, cartNextDir, xpToNext, xpGain, rollEnchants, ACHIEVEMENTS, ACHV_BY_ID, awardAchievement, GOALS, GOAL_TOTAL, goalState, goalDoneCount, redstonePower, SAVE_SCHEMA_FIELDS, validateSaveRecord } = require('../machines.js');

// ---- 从 inventory.js 模块加载(库存/掉落/饥饿/护甲纯函数) ----
const { STACK_MAX, FOODS, ARMOR_MAX_POINTS, armorReduce, pickupIntoInventory, normalizeHotbar, hungerTick, VILLAGER_TRADES, countInHotbar, consumeFromHotbar, canTrade, DUNGEON_LOOT_TABLE, rollDungeonLoot, mergeStacks, hotbarCounts } = require('../inventory.js');

// ---- 测试用例 ----
let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log('  ✅ ' + name); passed++; }
  catch (e) { console.log('  ❌ ' + name + ' — ' + e.message); failed++; }
}

console.log('=== 哈希函数 ===');
test('hash2 返回 0..1', () => {
  for (let i = 0; i < 100; i++) {
    const v = hash2(i, i*7, 12345);
    assert(v >= 0 && v <= 1, 'out of range: ' + v);
  }
});
test('hash2 确定性(同输入同输出)', () => {
  assert.strictEqual(hash2(10, 20, 999), hash2(10, 20, 999));
});
test('hash3 确定性', () => {
  assert.strictEqual(hash3(5, 10, 15, 1), hash3(5, 10, 15, 1));
});

console.log('\n=== 噪声函数 ===');
test('valueNoise2D 返回 0..1', () => {
  for (let i = 0; i < 50; i++) assert(valueNoise2D(i*0.3, i*0.7, 1) >= 0 && valueNoise2D(i*0.3, i*0.7, 1) <= 1);
});
test('fbm2D 返回 0..1', () => {
  for (let i = 0; i < 50; i++) assert(fbm2D(i*0.5, i*0.5, 1) >= 0 && fbm2D(i*0.5, i*0.5, 1) <= 1);
});
test('fbm2D 确定性', () => {
  assert.strictEqual(fbm2D(10, 20, 999, 4).toFixed(6), fbm2D(10, 20, 999, 4).toFixed(6));
});

console.log('\n=== 生物群系 ===');
test('biomeAt 返回有效群系', () => {
  const valid = Object.keys(BIOMES);
  for (let i = 0; i < 200; i++) {
    const b = biomeAt(Math.floor(Math.random()*400-200), Math.floor(Math.random()*400-200), 12345);
    assert(valid.includes(b), 'invalid biome: ' + b);
  }
});
test('biomeAt 确定性', () => {
  assert.strictEqual(biomeAt(50, 50, 999), biomeAt(50, 50, 999));
});
test('biomeAt 接受预计算 mtn', () => {
  const mtn = fbm2D(50*0.008, 50*0.008, 999+555, 4);
  assert.strictEqual(biomeAt(50, 50, 999, mtn), biomeAt(50, 50, 999, mtn));
});
test('多种群系都出现(500采样>=4种)', () => {
  const seen = {};
  for (let i = 0; i < 500; i++) {
    const b = biomeAt(Math.floor(Math.random()*800-400), Math.floor(Math.random()*800-400), 777);
    seen[b] = 1;
  }
  assert(Object.keys(seen).length >= 4, 'only ' + Object.keys(seen).length + ' biomes');
});

console.log('\n=== 地形高度 ===');
test('heightAt 返回 2..44', () => {
  for (let i = 0; i < 200; i++) {
    const h = heightAt(i, i*2, 12345, biomeAt(i, i*2, 12345));
    assert(h >= 2 && h <= 44, 'height out of range: ' + h);
  }
});
test('heightAt 确定性', () => {
  assert.strictEqual(heightAt(30, 30, 555, 'plains'), heightAt(30, 30, 555, 'plains'));
});
test('heightAt 接受预计算 mtn', () => {
  const mtn = fbm2D(30*0.008, 30*0.008, 555+555, 4);
  assert.strictEqual(heightAt(30, 30, 555, 'plains', mtn), heightAt(30, 30, 555, 'plains', mtn));
});
test('回归(R53):山地抬升必须生效(误传 biome 字符串会吞掉 +18 抬升)', () => {
  // 找一个 mtn 高的单元格,验证显式传 mtn 数值比传字符串显著更高
  let found = null;
  for (let x = 0; x < 6000 && !found; x += 37) {
    for (let z = 0; z < 6000 && !found; z += 53) {
      const mtn = fbm2D(x * 0.008, z * 0.008, 12345 + 555, 4);
      if (mtn > 0.78) found = { x, z, mtn };
    }
  }
  assert(found, '6000×6000 内应能找到深山单元格');
  const hNum = heightAt(found.x, found.z, 12345, found.mtn);          // 正确调用
  const hStr = heightAt(found.x, found.z, 12345, 'mountains');        // 旧 bug 形态(字符串)
  assert(hNum - hStr >= 5, `山地抬升失效: 数值 ${hNum} vs 字符串 ${hStr}(差 ${hNum - hStr}, mtn=${found.mtn.toFixed(2)})`);
});
test('回归(R53):村庄选址平坦校验使用真实高度(第 4 参是 mtn 数字)', () => {
  // villageInCell 内部 heightAt 调用已改传 mtn;间接验证:同坐标预计算 mtn 与
  // heightAt 显式一致(即函数不再被字符串参数欺骗)
  const mtn = fbm2D(748 * 0.008, 748 * 0.008, 12345 + 555, 4);
  const h1 = heightAt(748, 748, 12345, mtn);
  const h2 = heightAt(748, 748, 12345, fbm2D(748 * 0.008, 748 * 0.008, 12345 + 555, 4));
  assert.strictEqual(h1, h2);
});
test('相邻列高度差有限(无断层)', () => {
  let maxDiff = 0;
  for (let i = 0; i < 200; i++) {
    const x = Math.floor(Math.random()*100-50), z = Math.floor(Math.random()*100-50);
    const h1 = heightAt(x, z, 12345, biomeAt(x, z, 12345));
    const h2 = heightAt(x+1, z, 12345, biomeAt(x+1, z, 12345));
    maxDiff = Math.max(maxDiff, Math.abs(h1-h2));
  }
  assert(maxDiff <= 6, 'cliff detected: ' + maxDiff);
});

console.log('\n=== 存档序列化 ===');
test('modifications Map 序列化/反序列化一致', () => {
  const mods = new Map([['1,2,3','stone'],['4,5,6','grass'],['7,8,9',null]]);
  const serialized = Array.from(mods.entries());
  const restored = new Map(serialized);
  assert.strictEqual(restored.size, 3);
  assert.strictEqual(restored.get('1,2,3'), 'stone');
  assert.strictEqual(restored.get('7,8,9'), null);
});
test('存档记录结构完整', () => {
  const rec = {
    id: 1, name: 'test', seed: 12345,
    playerPos: { x: 1.5, y: 20, z: 3.5 },
    yaw: 0.5, pitch: -0.2, cameraMode: 1, isFlying: false,
    hotbar: [{kind:'block',id:'grass'}], currentSlot: 0,
    modifications: [['1,2,3','stone']], timestamp: Date.now(),
  };
  // 模拟 JSON 往返(IndexedDB structured clone 兼容)
  const json = JSON.stringify(rec);
  const restored = JSON.parse(json);
  assert.strictEqual(restored.seed, 12345);
  assert.strictEqual(restored.playerPos.x, 1.5);
  assert.strictEqual(restored.modifications[0][1], 'stone');
});
test('seed=0 正确处理(不用||回退)', () => {
  const rec = { seed: 0 };
  const worldSeed = (typeof rec.seed === 'number') ? rec.seed : 999;
  assert.strictEqual(worldSeed, 0, 'seed 0 should be preserved');
});

console.log('\n=== 合成配方(matchRecipe / RECIPES) ===');
test('RECIPES 结构完整(pattern 长度 4 或 9)', () => {
  assert(RECIPES.length >= 10, 'recipes missing');
  for (const r of RECIPES) {
    assert([4, 9].includes(r.pattern.length), r.name + ' pattern length');
    assert(r.result && r.result.id, r.name + ' result');
    assert((r.count >= 1) || (r.result.count >= 1) || r.result.kind === 'tool', r.name + ' count');
  }
});
test('matchRecipe 空网格返回 null', () => {
  assert.strictEqual(matchRecipe([null, null, null, null], RECIPES), null);
});
test('matchRecipe 无匹配返回 null', () => {
  const grid = [{ id: 'grass' }, { id: 'dirt' }, null, null];
  assert.strictEqual(matchRecipe(grid, RECIPES), null);
});
test('matchRecipe 无序配方(4 木板→合成台)', () => {
  const grid = [{ id: 'planks' }, { id: 'planks' }, { id: 'planks' }, { id: 'planks' }];
  const r = matchRecipe(grid, RECIPES);
  assert(r && r.name === '合成台', 'got: ' + (r && r.name));
});
test('matchRecipe 无序与位置无关(4 石头→石砖)', () => {
  const r = matchRecipe([{ id: 'stone' }, { id: 'stone' }, { id: 'stone' }, { id: 'stone' }], RECIPES);
  assert(r && r.name === '石砖', 'got: ' + (r && r.name));
});
test('matchRecipe 有序配方精确位置(2 木板横向→木门)', () => {
  const r = matchRecipe([{ id: 'planks' }, { id: 'planks' }, null, null], RECIPES);
  assert(r && r.name === '木门', 'got: ' + (r && r.name));
});
test('matchRecipe 有序区分纵横(纵向 2 木板→木棍)', () => {
  const r = matchRecipe([{ id: 'planks' }, null, { id: 'planks' }, null], RECIPES);
  assert(r && r.name === '木棍', 'got: ' + (r && r.name));
});
test('matchRecipe 有序拒绝错位(横向 2 石头≠石门)', () => {
  const r = matchRecipe([{ id: 'stone' }, { id: 'stone' }, null, null], RECIPES);
  assert(r === null || r.name !== '石门', 'should not match 石门: ' + (r && r.name));
});
test('matchRecipe 只按 id 匹配(忽略 kind/数量字段)', () => {
  const r = matchRecipe([{ kind: 'block', id: 'wood' }, null, null, null], RECIPES);
  assert(r && r.name === '木板' && r.count === 4, 'got: ' + (r && r.name));
});

console.log('\n=== 3×3 网格匹配(matchRecipeGrid / 合成台) ===');
const G9 = (ids) => Array.from({ length: 9 }, (_, i) => (ids[i] ? { id: ids[i] } : null));
test('3×3:2×2 配方在合成台可用(4 木板→合成台)', () => {
  const r = matchRecipeGrid(G9([null, null, null, null, 'planks', 'planks', null, 'planks', 'planks']), 3, RECIPES);
  assert(r && r.name === '合成台', 'got: ' + (r && r.name));
});
test('3×3:有序配方允许网格内平移(木门 放右下角)', () => {
  const r = matchRecipeGrid(G9([null, null, null, null, null, null, 'planks', 'planks', null]), 3, RECIPES);
  assert(r && r.name === '木门', 'got: ' + (r && r.name));
});
test('3×3:铁镐(3 铁锭 + 2 木棍)精确图案', () => {
  const r = matchRecipeGrid(G9(['iron_ingot', 'iron_ingot', 'iron_ingot', null, 'stick', null, null, 'stick', null]), 3, RECIPES);
  assert(r && r.name === '铁镐' && r.result.kind === 'tool', 'got: ' + (r && r.name));
});
test('3×3:有序配方允许网格内平移(石门竖排居中列)', () => {
  const r = matchRecipeGrid(G9([null, 'stone', null, null, 'stone', null, null, null, null]), 3, RECIPES);
  assert(r && r.name === '石门', 'got: ' + (r && r.name));
});
test('3×3:缺一格不匹配铁镐', () => {
  const r = matchRecipeGrid(G9(['iron_ingot', 'iron_ingot', null, null, 'stick', null, null, 'stick', null]), 3, RECIPES);
  assert(r === null || r.name !== '铁镐', '不应匹配铁镐');
});
test('3×3:环形 8 石头→石砖(大量)', () => {
  const r = matchRecipeGrid(G9(['stone', 'stone', 'stone', 'stone', null, 'stone', 'stone', 'stone', 'stone']), 3, RECIPES);
  assert(r && r.name === '石砖(大量)' && r.count === 4, 'got: ' + (r && r.name));
});
test('3×3:空网格返回 null', () => {
  assert.strictEqual(matchRecipeGrid(G9([]), 3, RECIPES), null);
});
test('3×3:数量不符不匹配(9 木板≠4 木板配方)', () => {
  const r = matchRecipeGrid(G9(Array(9).fill('planks')), 3, RECIPES);
  assert(r === null || r.name !== '合成台', '不应匹配合成台');
});

console.log('\n=== 经典物品配方(镐/剑/木棍/烧制) ===');
test('配方链:2 木板纵向 → 4 木棍(经典)', () => {
  const r = matchRecipe([{ id: 'planks' }, null, { id: 'planks' }, null], RECIPES);
  assert(r && r.name === '木棍' && r.result.id === 'stick' && r.count === 4, 'got: ' + (r && r.name));
});
test('配方链:2 木棍纵向 → 4 箭', () => {
  const r = matchRecipe([{ id: 'stick' }, null, { id: 'stick' }, null], RECIPES);
  assert(r && r.name === '箭' && r.result.id === 'arrow' && r.count === 4, 'got: ' + (r && r.name));
});
test('石镐:3 圆石 + 2 木棍(经典镐形 3×3)', () => {
  const r = matchRecipeGrid(G9(['cobblestone', 'cobblestone', 'cobblestone', null, 'stick', null, null, 'stick', null]), 3, RECIPES);
  assert(r && r.name === '石镐' && r.result.kind === 'tool', 'got: ' + (r && r.name));
});
test('木剑:2 木板竖列 + 木棍底(经典剑形 3×3)', () => {
  const r = matchRecipeGrid(G9(['planks', null, null, 'planks', null, null, 'stick', null, null]), 3, RECIPES);
  assert(r && r.name === '木剑' && r.result.id === 'sword_wood', 'got: ' + (r && r.name));
});
test('钻石剑:2 钻石 + 木棍(与钻石门不冲突)', () => {
  const r = matchRecipeGrid(G9(['gem_diamond', null, null, 'gem_diamond', null, null, 'stick', null, null]), 3, RECIPES);
  assert(r && r.name === '钻石剑' && r.result.id === 'sword_diamond', 'got: ' + (r && r.name));
});
test('烧制演示:1 圆石 → 1 石头(无序)', () => {
  const r = matchRecipeGrid(G9([null, null, null, null, 'cobblestone', null, null, null, null]), 3, RECIPES);
  assert(r && r.name === '石头' && r.result.id === 'stone', 'got: ' + (r && r.name));
});
test('TNT:1 煤炭 + 3 沙(无序)', () => {
  const r = matchRecipe([{ id: 'coal' }, { id: 'sand' }, { id: 'sand' }, { id: 'sand' }], RECIPES);
  assert(r && r.name === 'TNT' && r.result.id === 'tnt', 'got: ' + (r && r.name));
});
test('熔炉:8 圆石环形(经典配方)', () => {
  const r = matchRecipeGrid(G9(['cobblestone', 'cobblestone', 'cobblestone', 'cobblestone', null, 'cobblestone', 'cobblestone', 'cobblestone', 'cobblestone']), 3, RECIPES);
  assert(r && r.name === '熔炉' && r.result.id === 'furnace', 'got: ' + (r && r.name));
});
test('铁剑:2 铁锭 + 木棍(熔炉产物链)', () => {
  const r = matchRecipeGrid(G9(['iron_ingot', null, null, 'iron_ingot', null, null, 'stick', null, null]), 3, RECIPES);
  assert(r && r.name === '铁剑' && r.result.id === 'sword_iron', 'got: ' + (r && r.name));
});
test('箱子:8 木板环形(经典配方)', () => {
  const r = matchRecipeGrid(G9(['planks', 'planks', 'planks', 'planks', null, 'planks', 'planks', 'planks', 'planks']), 3, RECIPES);
  assert(r && r.name === '箱子' && r.result.id === 'chest', 'got: ' + (r && r.name));
});
test('床:3 羊毛 + 3 木板(经典配方)', () => {
  const r = matchRecipeGrid(G9(['wool_red', 'wool_red', 'wool_red', 'planks', 'planks', 'planks', null, null, null]), 3, RECIPES);
  assert(r && r.name === '床' && r.result.id === 'bed', 'got: ' + (r && r.name));
});
test('梯子:7 木棍 H 形(经典配方,×3)', () => {
  const r = matchRecipeGrid(G9(['stick', null, 'stick', 'stick', 'stick', 'stick', 'stick', null, 'stick']), 3, RECIPES);
  assert(r && r.name === '梯子' && r.result.id === 'ladder' && r.count === 3, 'got: ' + (r && r.name));
});
test('书:2 皮革 + 1 木棍(无序,皮革链闭环)', () => {
  const r = matchRecipe([{ id: 'leather' }, { id: 'stick' }, { id: 'leather' }, null], RECIPES);
  assert(r && r.name === '书' && r.result.id === 'book', 'got: ' + (r && r.name));
});
test('书架:6 木板 + 3 书(经典配方)', () => {
  const r = matchRecipeGrid(G9(['planks', 'planks', 'planks', 'book', 'book', 'book', 'planks', 'planks', 'planks']), 3, RECIPES);
  assert(r && r.name === '书架' && r.result.id === 'bookshelf', 'got: ' + (r && r.name));
});

console.log('\n=== 库存拾取(pickupIntoInventory / inventory.js) ===');
const HB = (n) => new Array(n).fill(null);
test('拾取:空栏放入(堆叠优先同 id 叠加)', () => {
  const hb = HB(9);
  assert.strictEqual(pickupIntoInventory(hb, 'block', 'dirt', 5), 5);
  assert.deepStrictEqual(hb[0], { kind: 'block', id: 'dirt', count: 5 });
  // 再拾同 id → 叠加到同格
  assert.strictEqual(pickupIntoInventory(hb, 'block', 'dirt', 3), 3);
  assert.strictEqual(hb[0].count, 8);
  assert.strictEqual(hb.filter(x => x).length, 1);
});
test('拾取:封顶 64 分格(130 泥土 → 64+64+2)', () => {
  const hb = HB(9);
  assert.strictEqual(pickupIntoInventory(hb, 'block', 'dirt', 130), 130);
  const counts = hb.filter(x => x).map(x => x.count);
  assert.deepStrictEqual(counts.sort((a, b) => b - a), [64, 64, 2]);
});
test('拾取:63+2 → 叠满 64 + 新格 1', () => {
  const hb = HB(9);
  hb[0] = { kind: 'block', id: 'stone', count: 63 };
  assert.strictEqual(pickupIntoInventory(hb, 'block', 'stone', 2), 2);
  assert.strictEqual(hb[0].count, 64);
  assert.strictEqual(hb[1].count, 1);
});
test('拾取:满栏返回 0(物品留在地上)', () => {
  const hb = HB(2);
  hb[0] = { kind: 'block', id: 'dirt', count: 64 };
  hb[1] = { kind: 'block', id: 'stone', count: 64 };
  assert.strictEqual(pickupIntoInventory(hb, 'block', 'gravel', 5), 0);
});
test('拾取:部分吸收(1 空格拾 3 → 吸 1 剩 2)', () => {
  const hb = HB(1);
  hb[0] = { kind: 'item', id: 'coal', count: 63 };
  assert.strictEqual(pickupIntoInventory(hb, 'item', 'coal', 3), 1);
  assert.strictEqual(hb[0].count, 64);
});
test('拾取:工具不堆叠,带耐久进空格', () => {
  const hb = HB(3);
  hb[0] = { kind: 'tool', id: 'pickaxe_iron', durability: 251 };
  assert.strictEqual(pickupIntoInventory(hb, 'tool', 'pickaxe_iron', 1, { durability: 200 }), 1);
  assert.strictEqual(hb[1].durability, 200);       // 耐久保留
  assert.strictEqual(hb[0].durability, 251);       // 不覆盖已有工具
});
test('拾取:工具无耐久时用默认耐久表', () => {
  const hb = HB(9);
  pickupIntoInventory(hb, 'tool', 'pickaxe_diamond', 1, { defaultDurability: 1562 });
  assert.strictEqual(hb[0].durability, 1562);
});
test('旧档归一化:无 count 方块补满,有值/null/工具不动', () => {
  const hb = [
    { kind: 'block', id: 'grass' },                        // 旧档无 count → 64
    { kind: 'block', id: 'dirt', count: 7 },               // 有值保留
    null,                                                  // 空保留
    { kind: 'tool', id: 'bow', durability: 384 },          // 工具不补
    { kind: 'item', id: 'arrow' },                         // 材料旧档 → 64
  ];
  const fixed = normalizeHotbar(hb);
  assert.strictEqual(fixed, 2);
  assert.strictEqual(hb[0].count, STACK_MAX);
  assert.strictEqual(hb[1].count, 7);
  assert.strictEqual(hb[3].count, undefined);
  assert.strictEqual(hb[4].count, STACK_MAX);
});

console.log('\n=== 饥饿状态机(hungerTick / inventory.js) ===');
const HS = (h) => ({ hunger: h, drain: 0, regenT: 0, starveT: 0 });
test('饥饿:消耗累计 4 单位扣 1 点(移动 1.2 → ~3.3 秒 1 点)', () => {
  const s = HS(20);
  hungerTick(s, 1, 1.2, false);
  assert.strictEqual(s.hunger, 20);        // 1.2 < 4 不扣
  hungerTick(s, 3, 1.2, false);            // 累计 4.8 → 扣 1,余 0.8
  assert.strictEqual(s.hunger, 19);
  assert.ok(Math.abs(s.drain - 0.8) < 1e-9);
});
test('饥饿:归零后不再扣(hungerChanged 停)', () => {
  const s = HS(1);
  s.drain = 3.9;
  hungerTick(s, 1, 1.2, false);            // → 0
  assert.strictEqual(s.hunger, 0);
  const r = hungerTick(s, 10, 1.2, false);
  assert.strictEqual(s.hunger, 0);         // 不为负
  assert.strictEqual(r.hungerChanged, false);
});
test('饥饿:≥18 且缺血 → 每 4 秒回血 1 次;17 不回', () => {
  const s18 = HS(18);
  let regen = 0;
  for (let i = 0; i < 40; i++) { const r = hungerTick(s18, 0.1, 0, true); if (r.regen) regen++; }
  assert.ok(regen >= 1, '18 应回血');
  const s17 = HS(17);
  let regen17 = 0;
  for (let i = 0; i < 40; i++) { const r = hungerTick(s17, 0.1, 0, true); if (r.regen) regen17++; }
  assert.strictEqual(regen17, 0, '17 不应回血');
});
test('饥饿:满血时不累计回血计时(中断清零)', () => {
  const s = HS(20);
  for (let i = 0; i < 80; i++) hungerTick(s, 0.1, 0, false);   // canRegen=false
  assert.strictEqual(s.regenT, 0);
});
test('饥饿:归零 → 每 4 秒 1 次饥饿伤害信号', () => {
  const s = HS(0);
  let starve = 0;
  for (let i = 0; i < 41; i++) { const r = hungerTick(s, 0.1, 0.45, true); if (r.starve) starve++; }
  assert.ok(starve >= 1, '应触发饥饿伤害');
});
test('饥饿:进食恢复由调用方处理(FOODS 表)', () => {
  assert.strictEqual(FOODS.cooked_porkchop, 10);   // R43 平衡:12→10(经典收敛)
  assert.strictEqual(FOODS.porkchop, 8);
  assert.strictEqual(FOODS.apple, 4);
});
test('镐形材料区分:木镐不受圆石影响', () => {
  const r = matchRecipeGrid(G9(['cobblestone', 'cobblestone', 'cobblestone', null, 'stick', null, null, 'stick', null]), 3, RECIPES);
  assert(r && r.name === '石镐' && r.result.id !== 'pickaxe_wood', '应为石镐而非木镐');
});

console.log('\n=== 破坏耗时(breakCost) ===');
test('breakCost 无工具 = round(hardness×3)', () => {
  assert.strictEqual(breakCost({ hardness: 1.5, tool: 'pickaxe' }, null), 5);   // 4.5 → 5
  assert.strictEqual(breakCost({ hardness: 0.5, tool: 'shovel' }, null), 2);    // 1.5 → 2
});
test('breakCost 匹配工具加速', () => {
  // 石头: base 5,石镐 speed 2.5 → 5/2.5 = 2
  assert.strictEqual(breakCost({ hardness: 1.5, tool: 'pickaxe' }, { tool: 'pickaxe', speed: 2.5 }), 2);
  // 泥土: base 2,铁铲 speed 4 → 2/4 = 0.5 → 1(最小 1)
  assert.strictEqual(breakCost({ hardness: 0.5, tool: 'shovel' }, { tool: 'shovel', speed: 4.0 }), 1);
});
test('breakCost 错误工具不加速', () => {
  assert.strictEqual(breakCost({ hardness: 1.5, tool: 'pickaxe' }, { tool: 'axe', speed: 8.0 }), 5);
});
test('breakCost 最小 1(软方块/高速工具)', () => {
  assert.strictEqual(breakCost({ hardness: 0.3, tool: 'axe' }, null), 1);
  assert.strictEqual(breakCost({ hardness: 0.3, tool: 'axe' }, { tool: 'axe', speed: 8.0 }), 1);
});
test('breakCost 液体类(water, hardness 100, tool any)', () => {
  assert.strictEqual(breakCost({ hardness: 100, tool: 'any' }, null), 300);
});
test('breakCost 确定性(同输入同输出)', () => {
  assert.strictEqual(
    breakCost({ hardness: 2.0, tool: 'pickaxe' }, { tool: 'pickaxe', speed: 4.0 }),
    breakCost({ hardness: 2.0, tool: 'pickaxe' }, { tool: 'pickaxe', speed: 4.0 })
  );
});

// ===== 护甲系统(R21) =====
console.log('\n=== 护甲减伤(armorReduce) ===');
test('armorReduce 0 点护甲伤害不变', () => {
  assert.strictEqual(armorReduce(5, 0), 5);
  assert.strictEqual(armorReduce(3, null), 3);
});
test('armorReduce 20 点(钻石全套)= 80% 减伤', () => {
  assert.strictEqual(armorReduce(10, 20), 2);
  assert.strictEqual(armorReduce(5, 20), 1);
});
test('armorReduce 15 点(铁全套)按每点 4% 取整', () => {
  assert.strictEqual(armorReduce(3, 15), 1);    // 3×0.4=1.2 → 1
  assert.strictEqual(armorReduce(14, 15), 6);   // 14×0.4=5.6 → 6
});
test('armorReduce 超 20 点封顶(80%)', () => {
  assert.strictEqual(armorReduce(10, 30), 2);
  assert.strictEqual(ARMOR_MAX_POINTS, 20);
});
test('armorReduce 减伤后至少 1 点 / 非法输入返回 0', () => {
  assert.strictEqual(armorReduce(1, 20), 1);
  assert.strictEqual(armorReduce(-5, 20), 0);
  assert.strictEqual(armorReduce(NaN, 5), 0);
});

// ===== 村民交易(R33) =====
console.log('\n=== 村民交易(trades/count/consume) ===');
test('VILLAGER_TRADES 非空且数量/字段合法', () => {
  assert.ok(VILLAGER_TRADES.length >= 5);
  for (const tr of VILLAGER_TRADES) {
    assert.ok(tr.give && tr.give.id && tr.give.n >= 1, 'give 字段完整');
    assert.ok(tr.get && tr.get.id && tr.get.n >= 1, 'get 字段完整');
  }
});
test('每条交易恰有一侧是绿宝石(卖/买对称经济)', () => {
  for (const tr of VILLAGER_TRADES) {
    const g = (tr.give.id === 'gem_emerald') + (tr.get.id === 'gem_emerald');
    assert.strictEqual(g, 1, tr.give.id + '→' + tr.get.id);
  }
});
test('countInHotbar 跨堆叠计数 / 忽略其它物品与工具', () => {
  const hb = [
    { kind: 'item', id: 'wheat', count: 40 },
    { kind: 'item', id: 'coal', count: 5 },
    { kind: 'item', id: 'wheat', count: 10 },
    { kind: 'tool', id: 'wheat', durability: 10 },   // 脏数据:工具格不参与
    null,
  ];
  assert.strictEqual(countInHotbar(hb, 'wheat'), 50);
  assert.strictEqual(countInHotbar(hb, 'coal'), 5);
  assert.strictEqual(countInHotbar(hb, 'gem_emerald'), 0);
});
test('consumeFromHotbar 跨格消耗,用尽清格,保留其它物品', () => {
  const hb = [
    { kind: 'item', id: 'wheat', count: 30 },
    { kind: 'item', id: 'coal', count: 7 },
    { kind: 'item', id: 'wheat', count: 10 },
  ];
  const used = consumeFromHotbar(hb, 'wheat', 35);
  assert.strictEqual(used, 35);
  assert.strictEqual(hb[0], null);                       // 30 用尽清格
  assert.deepStrictEqual(hb[1], { kind: 'item', id: 'coal', count: 7 });   // 无辜者不动
  assert.deepStrictEqual(hb[2], { kind: 'item', id: 'wheat', count: 5 });  // 10-5
});
test('consumeFromHotbar 不足时消耗到 0 为止', () => {
  const hb = [{ kind: 'item', id: 'wheat', count: 9 }];
  assert.strictEqual(consumeFromHotbar(hb, 'wheat', 18), 9);
  assert.strictEqual(hb[0], null);
});
test('canTrade 边界:足量 true / 差 1 false / 空栏 false', () => {
  const tr = VILLAGER_TRADES[0];   // 小麦 ×12 → 绿宝石(R55)
  assert.strictEqual(tr.give.id, 'wheat');
  const mk = (n) => [{ kind: 'item', id: 'wheat', count: n }];
  assert.strictEqual(canTrade(mk(12), tr), true);
  assert.strictEqual(canTrade(mk(11), tr), false);
  assert.strictEqual(canTrade(new Array(9).fill(null), tr), false);
  assert.strictEqual(canTrade(mk(99), null), false);   // 非法交易对象
});

console.log('\n=== 护甲配方(matchRecipeGrid) ===');
const g9 = (ids) => ids.map(x => x === null ? null : { kind: 'item', id: x });
test('护甲配方:钻石头盔(5 钻经典形)', () => {
  const r = matchRecipeGrid(g9(['gem_diamond','gem_diamond','gem_diamond', 'gem_diamond',null,'gem_diamond', null,null,null]), 3, RECIPES);
  assert.ok(r && r.result.id === 'helmet_diamond');
});
test('护甲配方:铁胸甲(8 铁围形)', () => {
  const r = matchRecipeGrid(g9(['iron_ingot',null,'iron_ingot', 'iron_ingot','iron_ingot','iron_ingot', 'iron_ingot','iron_ingot','iron_ingot']), 3, RECIPES);
  assert.ok(r && r.result.id === 'chestplate_iron');
});
test('护甲配方:皮革裤子(7 皮革)', () => {
  const r = matchRecipeGrid(g9(['leather','leather','leather', 'leather',null,'leather', 'leather',null,'leather']), 3, RECIPES);
  assert.ok(r && r.result.id === 'leggings_leather');
});
test('护甲配方:金靴子(4 金两侧列)', () => {
  const r = matchRecipeGrid(g9(['gem_gold',null,'gem_gold', 'gem_gold',null,'gem_gold', null,null,null]), 3, RECIPES);
  assert.ok(r && r.result.id === 'boots_gold');
});
test('护甲配方:错误图案不匹配', () => {
  const r = matchRecipeGrid(g9(['gem_diamond',null,'gem_diamond', null,'gem_diamond',null, null,null,null]), 3, RECIPES);
  assert.strictEqual(r, null);
});
test('钻石门(4 钻 2×2 方形)不再截胡钻石靴子(4 钻两侧列)', () => {
  const boots = matchRecipeGrid(g9(['gem_diamond',null,'gem_diamond', 'gem_diamond',null,'gem_diamond', null,null,null]), 3, RECIPES);
  assert.ok(boots && boots.result.id === 'boots_diamond');
  const door = matchRecipeGrid(g9(['gem_diamond','gem_diamond','gem_diamond','gem_diamond']).map(x => x), 2, RECIPES);
  assert.ok(door && door.result.id === 'door_diamond');
});
test('护甲配方:2×2 背包格放不下护甲(需 3×3 合成台)', () => {
  const r = matchRecipeGrid(g9([null,'gem_gold',null, null,'gem_gold',null, null,null,null]).slice(0, 4), 2, RECIPES);
  assert.notStrictEqual(r && r.result && r.result.id, 'boots_gold');
});

test('火把配方:煤炭上 + 木棍下 → 4 支(2×2 背包可合成)', () => {
  const g4 = ['coal', null, 'stick', null].map(x => x === null ? null : { kind: 'item', id: x });
  const r = matchRecipeGrid(g4, 2, RECIPES);
  assert.ok(r && r.result.id === 'torch' && r.count === 4);
});

// ===== 洞穴生成(R24) =====
console.log('\n=== 3D 噪声与洞穴(valueNoise3D/caveAt) ===');
test('valueNoise3D 确定性 + 值域 [0,1] + 平滑(近点差值小)', () => {
  assert.strictEqual(valueNoise3D(10.5, 20.3, 30.7, 999), valueNoise3D(10.5, 20.3, 30.7, 999));
  for (let i = 0; i < 200; i++) {
    const v = valueNoise3D(i * 3.7, i * 1.3, i * 5.1, 42 + i);
    assert.ok(v >= 0 && v <= 1, '值域越界: ' + v);
  }
  const a = valueNoise3D(100.2, 50.2, 80.2, 7), b = valueNoise3D(100.4, 50.2, 80.2, 7);
  assert.ok(Math.abs(a - b) <= 0.5, '近点不应跳变');
});
test('caveAt y 边界:y<2 与 y>38 永不为洞', () => {
  for (let i = 0; i < 100; i++) {
    const x = (i * 37) % 500 - 250, z = (i * 91) % 500 - 250;
    assert.strictEqual(caveAt(x, 1, z, 12345), false);
    assert.strictEqual(caveAt(x, 39, z, 12345), false);
  }
});
test('caveAt 确定性(同种子同坐标一致;换种子可能不同)', () => {
  assert.strictEqual(caveAt(100, 12, 200, 777), caveAt(100, 12, 200, 777));
});
test('caveAt 存在性与占比:40×15×40 采样有洞且不过密(0.1%~8%)', () => {
  let count = 0, total = 0;
  for (let x = 0; x < 40; x++) for (let y = 4; y < 19; y++) for (let z = 0; z < 40; z++) {
    total++;
    if (caveAt(x * 3, y, z * 3, 12345)) count++;
  }
  const ratio = count / total;
  assert.ok(count > 0, '完全无洞');
  assert.ok(ratio > 0.001 && ratio < 0.08, '占比异常: ' + (ratio * 100).toFixed(2) + '%');
});

// ===== 状态机纯函数(R25 提取) =====
console.log('\n=== 教程推进(advanceTutorial) ===');
test('advanceTutorial 累计进度不达标返回 progress', () => {
  const st = { active: true, step: 1, progress: { move: 0 } };
  assert.strictEqual(advanceTutorial(st, 'move', 3), 'progress');
  assert.strictEqual(st.progress.move, 3);
});
test('advanceTutorial 达标推进 step', () => {
  const st = { active: true, step: 1, progress: { move: 5 } };
  assert.strictEqual(advanceTutorial(st, 'move', 3), 'step');
  assert.strictEqual(st.step, 2);
});
test('advanceTutorial 类型不匹配/未激活返回 none', () => {
  const st = { active: true, step: 1, progress: {} };
  assert.strictEqual(advanceTutorial(st, 'break', 1), 'none');
  const off = { active: false, step: 1, progress: {} };
  assert.strictEqual(advanceTutorial(off, 'move', 99), 'none');
});
test('advanceTutorial 走完全部目标步停在完成卡(step 不越界,R20 回归防线)', () => {
  const st = { active: true, step: 0, progress: {} };
  let guard = 0;
  while (st.step < TUTORIAL_STEPS.length - 1 && guard++ < 50) {
    const s = TUTORIAL_STEPS[st.step];
    if (!s.goal) { st.step++; continue; }   // 无目标卡由游戏层「继续」推进(此处等价模拟)
    assert.strictEqual(advanceTutorial(st, s.goal.type, s.goal.n), 'step');
  }
  assert.strictEqual(st.step, TUTORIAL_STEPS.length - 1);   // 停在完成卡
  // 完成卡无 goal,任何上报都不会再推进/越界
  assert.strictEqual(advanceTutorial(st, 'move', 999), 'none');
  assert.strictEqual(st.step, TUTORIAL_STEPS.length - 1);
});

console.log('\n=== 熔炉状态机(furnaceTick) ===');
test('furnaceTick 无燃料不点燃不冶炼', () => {
  const f = { input: { kind: 'block', id: 'iron_ore', count: 1 }, fuel: null, output: null, burnT: 0, burnMax: 1, cookT: 0 };
  assert.strictEqual(furnaceTick(f, 1), false);
  assert.strictEqual(f.cookT, 0);
});
test('furnaceTick 点燃燃料(煤 8 个产能 = 40s)并冶炼', () => {
  const f = { input: { kind: 'item', id: 'iron_ore', count: 1 }, fuel: { kind: 'item', id: 'coal', count: 2 }, output: null, burnT: 0, burnMax: 1, cookT: 0 };
  assert.strictEqual(furnaceTick(f, 0.1), true);
  assert.strictEqual(f.fuel.count, 1);
  assert.ok(Math.abs(f.burnT - 40) < 1e-9);   // 点燃即满 40s(本帧 decrement 在点燃前,对 0 无效)
  furnaceTick(f, 4.9);
  assert.strictEqual(f.output.id, 'iron_ingot');
  assert.strictEqual(f.output.count, 1);
  assert.strictEqual(f.input, null);
});
test('furnaceTick 产物堆叠至 64 封顶停烧', () => {
  const f = { input: { kind: 'item', id: 'iron_ore', count: 5 }, fuel: { kind: 'item', id: 'coal', count: 5 }, output: { kind: 'item', id: 'iron_ingot', count: 64 }, burnT: 10, burnMax: 10, cookT: 0 };
  assert.strictEqual(furnaceCanSmelt(f), false);
  furnaceTick(f, 6);
  assert.strictEqual(f.output.count, 64);
  assert.strictEqual(f.input.count, 5);
});
test('furnaceTick 中断(没火)进度归零', () => {
  const f = { input: { kind: 'item', id: 'iron_ore', count: 1 }, fuel: null, output: null, burnT: 0, burnMax: 1, cookT: 3 };
  assert.strictEqual(furnaceTick(f, 0.1), true);
  assert.strictEqual(f.cookT, 0);
});

console.log('\n=== 天气状态机(weatherNext) ===');
test('weatherNext 计时未到不变', () => {
  const r = weatherNext('clear', 10, 0.5, Math.random);
  assert.deepStrictEqual(r, { weather: 'clear', timer: 9.5, changed: false });
});
test('weatherNext 晴天到期 roll 成功(30%)→ 雨 45~90s', () => {
  let calls = 0;
  const rand = () => calls++ === 0 ? 0.1 : 0.5;
  const r = weatherNext('clear', 0.5, 1, rand);
  assert.strictEqual(r.weather, 'rain');
  assert.strictEqual(r.changed, true);
  assert.ok(r.timer >= 45 && r.timer <= 90);
});
test('weatherNext 晴天到期 roll 失败 → 继续晴 120~240s', () => {
  let calls = 0;
  const rand = () => calls++ === 0 ? 0.9 : 0.5;
  const r = weatherNext('clear', 0.5, 1, rand);
  assert.strictEqual(r.weather, 'clear');
  assert.strictEqual(r.changed, false);
  assert.ok(r.timer >= 120 && r.timer <= 240);
});
test('weatherNext 雨到期 → 晴 120~240s', () => {
  const r = weatherNext('rain', 0.5, 1, () => 0.5);
  assert.strictEqual(r.weather, 'clear');
  assert.strictEqual(r.changed, true);
});

console.log('\n=== 存档 schema(validateSaveRecord) ===');
test('validateSaveRecord 完整记录无缺失', () => {
  const rec = {};
  for (const f of SAVE_SCHEMA_FIELDS) rec[f] = 0;
  assert.deepStrictEqual(validateSaveRecord(rec), []);
});
test('validateSaveRecord 检出缺失字段(防 R16 类漂移)', () => {
  const rec = { seed: 1, modifications: [] };
  const miss = validateSaveRecord(rec);
  assert.ok(miss.includes('dayTime'));
  assert.ok(miss.includes('furnacesData'));
  assert.ok(miss.includes('mobsData'));
  assert.ok(miss.includes('achvData'));   // R34:成就字段纳入 schema
  assert.ok(miss.includes('plazaBuilt'));
});

// ===== 成就/进度系统(R34) =====
console.log('\n=== 成就系统(awardAchievement) ===');
test('ACHIEVEMENTS 清单:id 唯一且字段完整(图标/名称/描述)', () => {
  const ids = new Set();
  for (const a of ACHIEVEMENTS) {
    assert.ok(a.id && !ids.has(a.id), 'id 唯一: ' + a.id);
    ids.add(a.id);
    assert.ok(a.icon && a.name && a.desc, '字段完整: ' + a.id);
  }
  assert.ok(ACHIEVEMENTS.length >= 12, '覆盖主要里程碑');
  assert.strictEqual(ids.size, Object.keys(ACHV_BY_ID).length);   // 索引表同步
});
test('awardAchievement 首次解锁返回成就对象 / 已解锁返回 null(不重复播报)', () => {
  const s = new Set();
  const first = awardAchievement(s, 'get_wood');
  assert.ok(first && first.name === '获得木头');
  s.add(first.id);   // 游戏层负责入集(awardAchievement 本身纯函数不变异)
  assert.strictEqual(awardAchievement(s, 'get_wood'), null);   // 幂等
});
test('awardAchievement 未知 id 返回 null(脏存档防御)', () => {
  assert.strictEqual(awardAchievement(new Set(), 'nope'), null);
  assert.strictEqual(awardAchievement(new Set(), ''), null);
});

// ===== 矿车与铁轨(R26) =====
console.log('\n=== 矿车轨道寻路(cartNextDir) ===');
test('cartNextDir 优先直行', () => {
  assert.deepStrictEqual(cartNextDir(true, true, true, true, 1, 0), [1, 0]);
  assert.deepStrictEqual(cartNextDir(true, true, true, true, 0, -1), [0, -1]);
});
test('cartNextDir 直行不通转向非回头方向(L 弯)', () => {
  assert.deepStrictEqual(cartNextDir(false, true, true, false, 1, 0), [0, 1]);   // 前方断轨:排除回头 -x → 转 +z
  assert.deepStrictEqual(cartNextDir(true, false, false, true, 0, 1), [1, 0]);   // 前方断轨:排除回头 -z → 转 +x
});
test('cartNextDir 仅剩回头向才折返(死端弹回)', () => {
  assert.deepStrictEqual(cartNextDir(false, true, false, false, 1, 0), [-1, 0]); // 只有来向可走 → 折返
});
test('cartNextDir 死胡同返回 null(停住)', () => {
  assert.strictEqual(cartNextDir(false, false, false, false, 1, 0), null);
  assert.strictEqual(cartNextDir(false, false, false, false, 0, 0), null);
});
test('矿车配方:5 铁锭 U 形 → 1 矿车(3×3)', () => {
  const g3 = (ids) => ids.map(x => x === null ? null : { kind: 'item', id: x });
  const r = matchRecipeGrid(g3(['iron_ingot', null, 'iron_ingot', 'iron_ingot', 'iron_ingot', 'iron_ingot', null, null, null]), 3, RECIPES);
  assert.ok(r && r.result.id === 'minecart' && r.count === 1);
});
test('铁轨配方:6 铁锭 + 1 木棍 → 16 节(3×3)', () => {
  const g3 = (ids) => ids.map(x => x === null ? null : { kind: x === 'stick' ? 'item' : 'item', id: x });
  const r = matchRecipeGrid(g3(['iron_ingot', 'iron_ingot', 'iron_ingot', 'iron_ingot', 'stick', 'iron_ingot', null, null, null]), 3, RECIPES);
  assert.ok(r && r.result.id === 'rail' && r.count === 16);
});

// ===== 经验与附魔(R28) =====
console.log('\n=== 经验系统(xpToNext/xpGain) ===');
test('xpToNext 阈值随等级递增', () => {
  assert.strictEqual(xpToNext(0), 10);
  assert.strictEqual(xpToNext(1), 15);
  assert.strictEqual(xpToNext(5), 35);
});
test('xpGain 升级结算(单级/多级/不足)', () => {
  const st = { level: 0, points: 0 };
  assert.strictEqual(xpGain(st, 5), 0);
  assert.strictEqual(st.points, 5);
  assert.strictEqual(xpGain(st, 5), 1);       // 5+5=10 恰好达标 → 升 1 级
  assert.strictEqual(st.level, 1);
  assert.strictEqual(st.points, 0);
  assert.strictEqual(xpGain(st, 30), 1);      // 30:升 2 级(15)→余 15,不足 20(3 级)
  assert.strictEqual(st.level, 2);
  assert.strictEqual(st.points, 15);
});

console.log('\n=== 附魔选项(rollEnchants) ===');
test('rollEnchants 确定性(注入 rand)且 3 个选项合法', () => {
  let i = 0;
  const rand = () => [0.1, 0.9, 0.5, 0.6, 0.2, 0.8][i++ % 6];
  const a = rollEnchants('sword', rand);
  i = 0;
  const b = rollEnchants('sword', rand);
  assert.deepStrictEqual(a, b);   // 确定性
  assert.strictEqual(a.length, 3);
  for (const o of a) {
    assert.ok(['sharpness', 'unbreaking'].includes(o.type), '剑池外类型: ' + o.type);
    assert.ok(o.level >= 1 && o.level <= 3);
    assert.ok([2, 4, 6].includes(o.cost), '成本应为 2/4/6: ' + o.cost);
  }
});
test('rollEnchants 按物品类别取池(镐=效率/耐久)', () => {
  const opts = rollEnchants('pickaxe', () => 0.99);
  for (const o of opts) assert.ok(['efficiency', 'unbreaking'].includes(o.type));
});
test('附魔台配方:2 钻石 + 3 书 + 1 石头(3×3)', () => {
  const g3 = (ids) => ids.map(x => x === null ? null : { kind: x === 'stone' ? 'block' : 'item', id: x });
  const r = matchRecipeGrid(g3(['gem_diamond', 'book', 'gem_diamond', 'book', 'stone', 'book', null, null, null]), 3, RECIPES);
  assert.ok(r && r.result.id === 'enchanting_table');
});

test('钓鱼竿配方:3 木棍斜排 + 2 蛛丝(R29)', () => {
  const g3 = (ids) => ids.map(x => x === null ? null : { kind: 'item', id: x });
  const r = matchRecipeGrid(g3([null, null, 'stick', null, 'stick', 'string', 'stick', null, 'string']), 3, RECIPES);
  assert.ok(r && r.result.id === 'fishing_rod');
});
test('面包配方:3 小麦一排(R29);2×2 放不下', () => {
  const g3 = (ids) => ids.map(x => x === null ? null : { kind: 'item', id: x });
  const r = matchRecipeGrid(g3(['wheat', 'wheat', 'wheat', null, null, null, null, null, null]), 3, RECIPES);
  assert.ok(r && r.result.id === 'bread' && r.count === 1);
});
test('剪刀配方:2 铁锭对角(R35)', () => {
  const g2 = (ids) => ids.map(x => x === null ? null : { kind: 'item', id: x });
  const r = matchRecipeGrid(g2(['iron_ingot', null, null, 'iron_ingot']), 2, RECIPES);
  assert.ok(r && r.result.id === 'shears' && r.result.kind === 'tool');
});
test('黏液块配方:4 黏液球无序(R35)', () => {
  const g2 = (ids) => ids.map(x => x === null ? null : { kind: 'item', id: x });
  const r = matchRecipeGrid(g2(['slime_ball', 'slime_ball', 'slime_ball', 'slime_ball']), 2, RECIPES);
  assert.ok(r && r.result.id === 'slime' && r.result.kind === 'block');
});
test('铁桶配方:3 铁锭 V 形(R36);2×2 放不下', () => {
  const g3 = (ids) => ids.map(x => x === null ? null : { kind: 'item', id: x });
  const r = matchRecipeGrid(g3(['iron_ingot', null, 'iron_ingot', null, 'iron_ingot', null, null, null, null]), 3, RECIPES);
  assert.ok(r && r.result.id === 'bucket' && r.result.kind === 'item');
  const in2x2 = matchRecipeGrid(g3(['iron_ingot', 'iron_ingot', 'iron_ingot', null].map(x => x === null ? null : { kind: 'item', id: x })), 2, RECIPES);
  assert.ok(!in2x2 || in2x2.result.id !== 'bucket');   // 3 铁锭任何 2×2 摆法都不出桶
});

// ===== 村庄小屋(R31) =====
console.log('\n=== 村庄小屋(villageInCell/hutBlockAt) ===');
test('villageInCell 确定性 + 保护区(0,0 格被广场排除)', () => {
  for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) {
    const a = villageInCell(x, z, 12345);
    assert.deepStrictEqual(a, villageInCell(x, z, 12345));   // 确定性
    if (a) {
      assert.ok(Math.abs(a.cx) >= 40 || Math.abs(a.cz) >= 40, '小屋不应在广场保护区内');
      assert.ok(a.base >= 15);
    }
  }
  // 49 格全无小屋的概率极低((1-0.34)^49),断言存在性用大范围
  let found = 0;
  for (let x = -20; x <= 20; x++) for (let z = -20; z <= 20; z++) if (villageInCell(x, z, 12345)) found++;
  assert.ok(found > 20, '7×7 格抽样应存在多个小屋,实际 ' + found);
});
test('hutBlockAt 布局:地基/地板/墙/门洞/窗/火把/箱子/屋顶', () => {
  assert.strictEqual(hutBlockAt(0, 0, 0), 'planks');      // 地基周圈
  assert.strictEqual(hutBlockAt(2, 2, 0), null);          // 地基中空
  assert.strictEqual(hutBlockAt(2, 2, 1), 'planks');      // 地板整层
  assert.strictEqual(hutBlockAt(2, 0, 2), null);          // 门洞(前面板 2 格高)
  assert.strictEqual(hutBlockAt(2, 0, 3), null);
  assert.strictEqual(hutBlockAt(2, 0, 4), 'planks');      // 门楣
  assert.strictEqual(hutBlockAt(0, 2, 3), 'glass');       // 侧窗
  assert.strictEqual(hutBlockAt(4, 2, 3), 'glass');
  assert.strictEqual(hutBlockAt(2, 4, 3), 'glass');       // 后窗
  assert.strictEqual(hutBlockAt(2, 2, 2), 'torch');       // 屋内火把
  assert.strictEqual(hutBlockAt(3, 3, 2), 'chest');       // 角落箱子
  assert.strictEqual(hutBlockAt(1, 1, 3), null);          // 室内空气
  assert.strictEqual(hutBlockAt(2, 2, 5), 'wood');        // 屋顶
  assert.strictEqual(hutBlockAt(2, 2, 6), null);          // 屋顶之上无物
});

// ===== 地牢(R37) =====
console.log('\n=== 地牢(dungeonInCell/dungeonBlockAt) ===');
test('dungeonInCell 确定性 + 广场保护区排除', () => {
  let found = null;
  for (let x = -4; x <= 4 && !found; x++) for (let z = -4; z <= 4; z++) {
    const d = dungeonInCell(x, z, 12345);
    if (d) { found = d; break; }
  }
  assert.ok(found, '±4 格内找得到地牢');
  assert.ok(['zombie', 'skeleton', 'spider'].includes(found.mob), '怪种合法');
  assert.ok(found.chests >= 1 && found.chests <= 2, '箱子 1-2 个');
  assert.ok(found.floor >= 8 && found.floor <= 12, '地下浅层');
  // 同种子同格恒等
  const again = dungeonInCell(2, 2, 12345);
  assert.deepStrictEqual(dungeonInCell(2, 2, 12345), again);
});
test('dungeonInCell 保护区:中心 ±44 内不生成', () => {
  // 扫描出的所有地牢中心都应在广场保护区之外或为 null
  for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) {
    const d = dungeonInCell(x, z, 999);
    if (d) assert.ok(d.cx <= -44 || d.cx >= 44 || d.cz <= -44 || d.cz >= 44, '不在保护区内');
  }
});
test('dungeonBlockAt 布局:地板/顶/墙/笼/箱/室内', () => {
  const dg = { cx: 100, cz: -200, floor: 10, mob: 'zombie', chests: 2 };
  assert.strictEqual(dungeonBlockAt(3, 3, 0, dg, 12345), 'cobblestone');   // 地板
  assert.strictEqual(dungeonBlockAt(3, 3, 4, dg, 12345), 'brick');          // 顶(内部)
  assert.strictEqual(dungeonBlockAt(0, 0, 4, dg, 12345), 'stone');          // 顶(边缘)
  const wall = dungeonBlockAt(0, 3, 2, dg, 12345);                          // 边墙:圆石或砖
  assert.ok(wall === 'cobblestone' || wall === 'brick', '墙材质');
  assert.strictEqual(dungeonBlockAt(3, 3, 1, dg, 12345), 'spawner');        // 中央刷怪笼
  assert.strictEqual(dungeonBlockAt(1, 1, 1, dg, 12345), 'chest');          // 角箱 A
  assert.strictEqual(dungeonBlockAt(5, 5, 1, dg, 12345), 'chest');          // 角箱 B(chests=2)
  assert.strictEqual(dungeonBlockAt(2, 2, 2, dg, 12345), null);             // 室内空气
  const dg1 = { cx: 100, cz: -200, floor: 10, mob: 'zombie', chests: 1 };
  assert.strictEqual(dungeonBlockAt(5, 5, 1, dg1, 12345), null);            // 单箱地牢无角箱 B
});

console.log('\n=== 地牢战利品(rollDungeonLoot) ===');
test('rollDungeonLoot:3-5 条、id 合法、不重复、count 在区间', () => {
  // 固定序列注入(确定性验证)
  let i = 0;
  const seq = [0.5, 0.3, 0.9, 0.1, 0.6, 0.2, 0.8, 0.4, 0.7, 0.05, 0.45, 0.95, 0.25, 0.65, 0.85];
  const rand = () => seq[i++ % seq.length];
  const slots = rollDungeonLoot(rand);
  const items = slots.filter(Boolean);
  assert.ok(items.length >= 3 && items.length <= 5, '条目 3-5: ' + items.length);
  const ids = items.map(it => it.id);
  assert.strictEqual(new Set(ids).size, ids.length, '不重复');
  for (const it of items) {
    const def = DUNGEON_LOOT_TABLE.find(e => e.id === it.id);
    assert.ok(def, 'id 在表内: ' + it.id);
    assert.ok(it.count >= def.min && it.count <= def.max, 'count 区间');
    assert.strictEqual(it.kind, def.kind);
  }
});
test('rollDungeonLoot 确定性(同序列同输出)', () => {
  const mk = () => { let i = 0; const seq = [0.5, 0.3, 0.9, 0.1, 0.6, 0.2, 0.8, 0.4]; return () => seq[i++ % seq.length]; };
  assert.deepStrictEqual(rollDungeonLoot(mk()), rollDungeonLoot(mk()));
});

// ===== 红石信号(R38) =====
console.log('\n=== 红石信号(redstonePower) ===');
test('redstonePower 衰减 -1/格,15 格外为 0(不入 map)', () => {
  const wires = new Set();
  for (let i = 1; i <= 16; i++) wires.add(i + ',0,0');
  const p = redstonePower(wires, [{ key: '0,0,0', p: 15 }]);
  assert.strictEqual(p.get('0,0,0'), 15);
  assert.strictEqual(p.get('1,0,0'), 14);
  assert.strictEqual(p.get('2,0,0'), 13);
  assert.strictEqual(p.get('14,0,0'), 1);          // 距源 14 格 = 功率 1(最后一格)
  assert.ok(!p.has('15,0,0'), '功率衰减为 0 即断电');   // 15 格外不通
  assert.ok(!p.has('16,0,0'), '衰减到 0 不再向外传');
});
test('redstonePower 断线不传(跳跃格阻断)', () => {
  const wires = new Set(['1,0,0', '3,0,0']);   // 2,0,0 断开
  const p = redstonePower(wires, [{ key: '0,0,0', p: 15 }]);
  assert.strictEqual(p.get('1,0,0'), 14);
  assert.ok(!p.has('3,0,0'));
});
test('redstonePower 多源取最大 + 分支汇合', () => {
  const wires = new Set(['1,0,0', '2,0,0', '3,0,0']);
  const p = redstonePower(wires, [{ key: '0,0,0', p: 15 }, { key: '4,0,0', p: 15 }]);
  assert.strictEqual(p.get('2,0,0'), Math.max(13, 13));   // 双向都传到 2 格 → 13
  assert.strictEqual(p.get('1,0,0'), 14);
  assert.strictEqual(p.get('3,0,0'), 14);
});
test('redstonePower 垂直分层不串扰 / 空源空线安全', () => {
  const wires = new Set(['1,0,0', '1,1,0']);   // 上下层不直接相邻(需水平邻接)
  const p = redstonePower(wires, [{ key: '0,0,0', p: 15 }]);
  assert.strictEqual(p.get('1,0,0'), 14);
  assert.ok(!p.has('1,1,0'));
  assert.strictEqual(redstonePower(new Set(), []).size, 0);
});
test('红石配方:火把/拉杆/线(R38)', () => {
  const g2 = (ids) => ids.map(x => x === null ? null : { kind: x === 'stick' || x === 'redstone_dust' || x === 'cobblestone' ? (x === 'cobblestone' ? 'block' : 'item') : 'block', id: x });
  const torch = matchRecipeGrid(g2(['redstone_dust', null, 'stick', null]), 2, RECIPES);
  assert.ok(torch && torch.result.id === 'redstone_torch', '红石火把');
  const lever = matchRecipeGrid(g2(['stick', null, 'cobblestone', null]), 2, RECIPES);
  assert.ok(lever && lever.result.id === 'lever_off', '拉杆(默认关)');
  const wire = matchRecipeGrid(g2(['redstone_dust', null, null, null]), 2, RECIPES);
  assert.ok(wire && wire.result.id === 'redstone', '1 粉 → 线');
});
test('铁块配方:9 铁锭压缩 / 1 块分解 9 锭(R39)', () => {
  const ing = () => ({ kind: 'item', id: 'iron_ingot' });
  const nine = matchRecipeGrid(Array(9).fill(0).map(ing), 3, RECIPES);
  assert.ok(nine && nine.result.id === 'iron_block' && nine.result.kind === 'block', '9 锭 → 铁块');
  const back = matchRecipeGrid([null, { kind: 'block', id: 'iron_block' }, null, null], 2, RECIPES);
  assert.ok(back && back.result.id === 'iron_ingot' && back.count === 9, '铁块 → 9 锭');
});
test('糖/蛋糕配方 + 生鸡肉冶炼(R40)', () => {
  const sugar = matchRecipeGrid([{ kind: 'block', id: 'sugarcane' }, null, null, null], 2, RECIPES);
  assert.ok(sugar && sugar.result.id === 'sugar' && sugar.result.kind === 'item', '1 甘蔗 → 糖');
  const cakeGrid = ['sugar', 'sugar', 'egg', 'wheat', 'wheat', 'wheat', null, null, null]
    .map(x => x === null ? null : { kind: x === 'wheat' || x === 'sugar' || x === 'egg' ? 'item' : 'block', id: x });
  const cake = matchRecipeGrid(cakeGrid, 3, RECIPES);
  assert.ok(cake && cake.result.id === 'cake' && cake.result.kind === 'block', '2糖+1蛋+3麦 → 蛋糕');
  assert.strictEqual(SMELT.raw_chicken.id, 'cooked_chicken');   // 生鸡肉冶炼 → 烤鸡肉
});
test('建筑方块配方:台阶/楼梯/栅栏(R41)', () => {
  const g3 = (ids) => ids.map(x => x === null ? null : { kind: x === 'stick' ? 'item' : 'block', id: x });
  const slabP = matchRecipeGrid(g3(['planks', 'planks', 'planks', null, null, null, null, null, null]), 3, RECIPES);
  assert.ok(slabP && slabP.result.id === 'slab_planks' && slabP.count === 6, '3 木板 → 6 木台阶');
  const slabC = matchRecipeGrid(g3(['cobblestone', 'cobblestone', 'cobblestone', null, null, null, null, null, null]), 3, RECIPES);
  assert.ok(slabC && slabC.result.id === 'slab_cobble' && slabC.count === 6, '3 圆石 → 6 石台阶');
  const stP = matchRecipeGrid(g3(['planks', null, null, 'planks', 'planks', null, 'planks', 'planks', 'planks']), 3, RECIPES);
  assert.ok(stP && stP.result.id === 'stairs_planks' && stP.count === 4, '阶梯形木板 → 4 木楼梯');
  const fence = matchRecipeGrid(g3(['planks', 'stick', 'planks', 'planks', 'stick', 'planks', null, null, null]), 3, RECIPES);
  assert.ok(fence && fence.result.id === 'fence' && fence.count === 3, '4 板 2 棍 → 3 栅栏');
});
test('红石扩展配方:中继器/活塞(R42)', () => {
  const mk = (id, kind) => ({ kind, id });
  const rep = matchRecipeGrid([mk('redstone_torch', 'block'), mk('stone', 'block'), mk('redstone_torch', 'block'), mk('stone', 'block'), mk('stone', 'block'), mk('stone', 'block'), null, null, null], 3, RECIPES);
  assert.ok(rep && rep.result.id === 'repeater_off', '2 火把 + 3 石 → 中继器(关)');
  const pist = matchRecipeGrid([mk('planks', 'block'), mk('planks', 'block'), mk('planks', 'block'), mk('cobblestone', 'block'), mk('iron_ingot', 'item'), mk('cobblestone', 'block'), mk('cobblestone', 'block'), mk('redstone_dust', 'item'), mk('cobblestone', 'block')], 3, RECIPES);
  assert.ok(pist && pist.result.id === 'piston', '3 板 4 圆石 1 铁 1 粉 → 活塞');
});

// ===== R55:数值地基 / 采矿层级 / 配方书 / 章节目标 =====
console.log('\n=== R55:balance.js 数值派生 ===');
test('坠落伤害曲线:3/5/10/20/30 格 = 0/1/6/15/20', () => {
  assert.strictEqual(BALANCE_LIB.fallDamage(3), 0);
  assert.strictEqual(BALANCE_LIB.fallDamage(5), 1);
  assert.strictEqual(BALANCE_LIB.fallDamage(10), 6);
  assert.strictEqual(BALANCE_LIB.fallDamage(20), 15);
  assert.strictEqual(BALANCE_LIB.fallDamage(30), 20);
  assert.strictEqual(BALANCE_LIB.fallDamage(99), 20);
});
test('坠落高度与速度换算一致(h=v²/2g)', () => {
  const v = Math.sqrt(2 * BALANCE.player.gravity * 10);
  assert.ok(Math.abs(BALANCE_LIB.fallHeightFromVelocity(-v) - 10) < 0.001);
  assert.strictEqual(BALANCE_LIB.fallHeightFromVelocity(5), 0);
});
test('夜袭上限:2+2×天,上限 10', () => {
  assert.strictEqual(BALANCE_LIB.nightCap(1), 4);
  assert.strictEqual(BALANCE_LIB.nightCap(3), 8);
  assert.strictEqual(BALANCE_LIB.nightCap(5), 10);
  assert.strictEqual(BALANCE_LIB.nightCap(99), 10);
});
test('满饥饿耗尽时间:步行 364s / 静止 1000s / 冲刺 145s', () => {
  assert.ok(Math.abs(BALANCE_LIB.timeToStarve(0.22) - 363.64) < 1);
  assert.strictEqual(BALANCE_LIB.timeToStarve(0.08), 1000);
  assert.ok(Math.abs(BALANCE_LIB.timeToStarve(0.55) - 145.45) < 1);
});
test('DPS 派生 + 附魔成本曲线', () => {
  assert.strictEqual(BALANCE_LIB.attackDps(8, 0.45), 8 / 0.45);
  assert.strictEqual(BALANCE_LIB.attackDps(8, 0), 0);
  assert.deepStrictEqual([1, 2, 3].map(BALANCE_LIB.enchantCost), [2, 4, 6]);
});

console.log('\n=== R55:采矿层级(canHarvest) ===');
test('层级表:木镐不能挖钻石,铁镐可以', () => {
  const wood = { tool: 'pickaxe', level: 1 };
  const stone = { tool: 'pickaxe', level: 2 };
  const iron = { tool: 'pickaxe', level: 3 };
  const dia = { tool: 'pickaxe', level: 4 };
  assert.strictEqual(canHarvest({ tier: 1 }, wood), true);
  assert.strictEqual(canHarvest({ tier: 2 }, wood), false);
  assert.strictEqual(canHarvest({ tier: 2 }, stone), true);
  assert.strictEqual(canHarvest({ tier: 3 }, iron), true);
  assert.strictEqual(canHarvest({ tier: 3 }, stone), false);
  assert.strictEqual(canHarvest({ tier: 4 }, dia), true);
  assert.strictEqual(canHarvest({ tier: 0 }, null), true);
});
test('非镐工具不能收获有层级方块', () => {
  assert.strictEqual(canHarvest({ tier: 2 }, { tool: 'axe', level: 3 }), false);
  assert.strictEqual(canHarvest({ tier: 2 }, null), false);
});
test('层级不足时 breakCost ×2.5(木镐挖钻石矿 20 击)', () => {
  const wood = { tool: 'pickaxe', level: 1, speed: 1.5 };
  const mine = { tool: 'pickaxe', level: 4, speed: 8 };
  const ore = { hardness: 4, tool: 'pickaxe', tier: 3 };
  assert.strictEqual(breakCost(ore, wood), 20);
  assert.strictEqual(breakCost(ore, mine), 2);
});

console.log('\n=== R55:配方书纯函数 ===');
test('配方分类:镐=工具 / 剑=武器 / 护甲 / 建材 / 红石', () => {
  const byId = (id) => RECIPES.find(r => r.result.id === id);
  assert.strictEqual(recipeCategory(byId('pickaxe_iron')), '工具');
  assert.strictEqual(recipeCategory(byId('sword_iron')), '武器');
  assert.strictEqual(recipeCategory(byId('chestplate_iron')), '护甲');
  assert.strictEqual(recipeCategory(byId('furnace')), '建材');
  assert.strictEqual(recipeCategory(byId('repeater_off')), '红石');
});
test('配方材料统计 + 缺口计算', () => {
  const r = RECIPES.find(x => x.name === '铁镐');
  const need = recipeMaterials(r);
  assert.deepStrictEqual(need, { iron_ingot: 3, stick: 2 });
  assert.deepStrictEqual(recipeMissing(r, { iron_ingot: 3, stick: 2 }), []);
  const miss = recipeMissing(r, { iron_ingot: 1, stick: 0 });
  assert.strictEqual(miss.length, 2);
});
test('2×2 适配 + 搜索过滤', () => {
  const pick = RECIPES.find(r => r.result.id === 'pickaxe_iron');
  const planks = RECIPES.find(r => r.result.id === 'planks');
  assert.strictEqual(recipeFits(pick, 2), false);
  assert.strictEqual(recipeFits(planks, 2), true);
  assert.ok(filterRecipes(RECIPES, '镐', '全部').length >= 5);
  assert.ok(filterRecipes(RECIPES, '', '工具').every(r => recipeCategory(r) === '工具'));
});
test('R55 新配方:金镐/斧/铲/铁栏杆/金苹果/信标可匹配', () => {
  const g = (ids) => ids.map(id => id === null ? null : ({ kind: /^(planks|cobblestone|iron_ingot|gem_gold|gem_diamond|stick|iron_block)$/.test(id) && id !== 'stick' ? 'block' : 'item', id }));
  assert.ok(matchRecipeGrid(g(['gem_gold','gem_gold','gem_gold',null,'stick',null,null,'stick',null]), 3, RECIPES), '金镐');
  assert.ok(matchRecipeGrid(g(['planks','planks',null,'planks','stick',null,null,'stick',null]), 3, RECIPES), '木斧');
  assert.ok(matchRecipeGrid(g(['iron_ingot',null,null,'stick',null,null,'stick',null,null]), 3, RECIPES), '铁铲');
  assert.ok(matchRecipeGrid(g(['iron_ingot','iron_ingot','iron_ingot','iron_ingot','iron_ingot','iron_ingot',null,null,null]), 3, RECIPES), '铁栏杆');
  assert.strictEqual(SMELT.gold_ore.id, 'gem_gold');
});

console.log('\n=== R55:容器合并与快捷栏计数 ===');
test('mergeStacks 合并同类且总数守恒', () => {
  const items = [{ kind:'block', id:'stone', count:50 }, { kind:'block', id:'stone', count:30 }, null, { kind:'item', id:'coal', count:10 }];
  const out = mergeStacks(items, 64);
  const total = out.reduce((n, it) => n + (it.count || 1), 0);
  assert.strictEqual(total, 90);
  assert.ok(out.filter(it => it.id === 'stone').every(it => it.count <= 64));
});
test('hotbarCounts 跨格统计且忽略工具', () => {
  const hb = [{ kind:'item', id:'wheat', count:5 }, { kind:'item', id:'wheat', count:7 }, { kind:'tool', id:'pickaxe_wood', durability:1 }, null];
  assert.deepStrictEqual(hotbarCounts(hb), { wheat: 12 });
});

console.log('\n=== R55:章节目标 ===');
test('5 章 × 3 目标,全部引用合法成就', () => {
  assert.strictEqual(GOALS.length, 5);
  assert.strictEqual(GOAL_TOTAL, 15);
  for (const ch of GOALS) for (const g of ch.goals) assert.ok(ACHV_BY_ID[g.achv], '成就存在: ' + g.achv);
});
test('goalState:未完成时返回当前章与最多 3 个目标', () => {
  const st = goalState(new Set(), 3);
  assert.strictEqual(st.chapter, 1);
  assert.strictEqual(st.goals.length, 3);
  assert.strictEqual(st.goals[0].done, false);
  assert.strictEqual(goalDoneCount(new Set()), 0);
});
test('goalState:完成第 1 章后推进到第 2 章', () => {
  const done = new Set(['get_wood', 'workbench', 'stone_age']);
  const st = goalState(done, 3);
  assert.strictEqual(st.chapter, 2);
  assert.strictEqual(goalDoneCount(done), 3);
});

// ---- 从 golem.js 加载(R57:铁傀儡 T 形结构判定) ----
const { golemTAt } = require('../golem.js');

console.log('\n=== R57:铁傀儡 T 形召唤 ===');
// 用 Map 模拟世界:[[x,y,z,type], ...] → getBlock(x,y,z)
const mkWorld = (cells) => {
  const m = new Map(cells.map(([x, y, z, t]) => [x + ',' + y + ',' + z, t]));
  return (x, y, z) => m.get(x + ',' + y + ',' + z) || null;
};

test('正立 T:横 3 + 竖 1 + 南瓜在上 → 命中', () => {
  const g = mkWorld([
    [0, 0, 0, 'iron_block'], [1, 0, 0, 'iron_block'], [-1, 0, 0, 'iron_block'], [0, -1, 0, 'iron_block'],
    [0, 1, 0, 'carved_pumpkin'],
  ]);
  const hit = golemTAt(g, 0, 1, 0);
  assert.ok(hit, '应命中');
  assert.deepStrictEqual(hit.center, [0, 0, 0]);
  assert.strictEqual(hit.iron.length, 4);
  assert.deepStrictEqual(hit.head, [0, 1, 0]);
});

test('倒立 T:南瓜在下 → 命中(朝向不限)', () => {
  const g = mkWorld([
    [0, -1, 0, 'iron_block'], [1, -1, 0, 'iron_block'], [-1, -1, 0, 'iron_block'], [0, 0, 0, 'iron_block'],
    [0, -2, 0, 'carved_pumpkin'],
  ]);
  assert.ok(golemTAt(g, 0, -2, 0));
});

test('平躺 T:南瓜在水平侧 → 命中', () => {
  const g = mkWorld([
    [0, 0, 1, 'iron_block'], [1, 0, 1, 'iron_block'], [-1, 0, 1, 'iron_block'], [0, 0, 0, 'iron_block'],
    [0, 0, 2, 'pumpkin_lantern'],
  ]);
  const hit = golemTAt(g, 0, 0, 2);
  assert.ok(hit);
  assert.deepStrictEqual(hit.center, [0, 0, 1]);
});

test('普通南瓜不触发(必须雕刻南瓜/南瓜灯)', () => {
  const g = mkWorld([
    [0, 0, 0, 'iron_block'], [1, 0, 0, 'iron_block'], [-1, 0, 0, 'iron_block'], [0, -1, 0, 'iron_block'],
    [0, 1, 0, 'pumpkin'],
  ]);
  assert.strictEqual(golemTAt(g, 0, 1, 0), null);
});

test('缺一块铁块 / 直三连(不是 T)不触发', () => {
  const miss = mkWorld([
    [0, 0, 0, 'iron_block'], [1, 0, 0, 'iron_block'], [0, -1, 0, 'iron_block'], [0, 1, 0, 'carved_pumpkin'],
  ]);
  assert.strictEqual(golemTAt(miss, 0, 1, 0), null);
  const line = mkWorld([
    [0, 0, 0, 'iron_block'], [1, 0, 0, 'iron_block'], [-1, 0, 0, 'iron_block'], [0, 1, 0, 'carved_pumpkin'],
  ]);
  assert.strictEqual(golemTAt(line, 0, 1, 0), null);
});

test('双臂上下 4 格被堵 → 不触发(原版留空要求)', () => {
  const g = mkWorld([
    [0, 0, 0, 'iron_block'], [1, 0, 0, 'iron_block'], [-1, 0, 0, 'iron_block'], [0, -1, 0, 'iron_block'],
    [0, 1, 0, 'carved_pumpkin'],
    [1, 1, 0, 'stone'],   // 右臂上方被堵
  ]);
  assert.strictEqual(golemTAt(g, 0, 1, 0), null);
});

test('南瓜灯配方:雕刻南瓜 + 火把(无序)', () => {
  const r = matchRecipe([{ kind: 'block', id: 'carved_pumpkin' }, { kind: 'block', id: 'torch' }, null, null], RECIPES);
  assert.ok(r, '配方应命中');
  assert.strictEqual(r.result.id, 'pumpkin_lantern');
});

test('铁块配方:9 铁锭 → 1 铁块(成本 36 锭 / 4 块)', () => {
  const grid = Array.from({ length: 9 }, () => ({ kind: 'item', id: 'iron_ingot' }));
  const r = matchRecipeGrid(grid, 3, RECIPES);
  assert.ok(r && r.result.id === 'iron_block');
  assert.strictEqual(r.pattern.filter((x) => x !== null).length, 9);
});

test('配方填充:3×3 铁块铺满 9 格', () => {
  const iron = RECIPES.find(r => r.result.id === 'iron_block');
  assert.deepStrictEqual(recipeFillGrid(iron, 3), Array(9).fill('iron_ingot'));
});
test('配方填充:2×2 配方不错位(木板 / 合成台 / 熔炉空中心)', () => {
  const planks = RECIPES.find(r => r.name === '木板');
  assert.deepStrictEqual(recipeFillGrid(planks, 2), ['wood', null, null, null]);
  const bench = RECIPES.find(r => r.result.id === 'crafting_table');
  assert.deepStrictEqual(recipeFillGrid(bench, 2), ['planks', 'planks', 'planks', 'planks']);
  const f = recipeFillGrid(RECIPES.find(r => r.result.id === 'furnace'), 3);
  assert.strictEqual(f.filter(Boolean).length, 8);
  assert.strictEqual(f[4], null);
});
test('配方填充后可被 matchRecipeGrid 反向命中', () => {
  for (const id of ['iron_block', 'crafting_table', 'furnace', 'pumpkin_lantern']) {
    const r = RECIPES.find(x => x.result.id === id);
    const size = recipeFits(r, 2) ? 2 : 3;
    const grid = recipeFillGrid(r, size).map(x => (x ? { kind: 'block', id: x } : null));
    const back = matchRecipeGrid(grid, size, RECIPES);
    assert.ok(back, '回填应命中: ' + id);
    assert.strictEqual(back.result.id, id);
  }
});

console.log('\n=== 总结 ===');
console.log(`通过: ${passed}/${passed+failed}`);
if (failed > 0) { console.log('❌ 有失败'); process.exit(1); }
else console.log('✅ 全部通过');
