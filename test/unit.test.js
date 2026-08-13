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
const { hash2, hash3, valueNoise2D, fbm2D, BIOMES, biomeAt, heightAt } = require('../worldgen.js');

// ---- 从 craft.js 模块加载(合成/破坏计算的单一数据源) ----
const { RECIPES, matchRecipe, breakCost } = require('../craft.js');

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
test('RECIPES 结构完整(pattern 长度 4)', () => {
  assert(RECIPES.length >= 10, 'recipes missing');
  for (const r of RECIPES) {
    assert.strictEqual(r.pattern.length, 4, r.name + ' pattern length');
    assert(r.result && r.result.id, r.name + ' result');
    assert((r.count >= 1) || (r.result.count >= 1), r.name + ' count');
  }
});
test('matchRecipe 空网格返回 null', () => {
  assert.strictEqual(matchRecipe([null, null, null, null], RECIPES), null);
});
test('matchRecipe 无匹配返回 null', () => {
  const grid = [{ id: 'grass' }, { id: 'dirt' }, null, null];
  assert.strictEqual(matchRecipe(grid, RECIPES), null);
});
test('matchRecipe 无序配方(4 木板→压缩木板)', () => {
  const grid = [{ id: 'planks' }, { id: 'planks' }, { id: 'planks' }, { id: 'planks' }];
  const r = matchRecipe(grid, RECIPES);
  assert(r && r.name === '压缩木板', 'got: ' + (r && r.name));
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

console.log('\n=== 总结 ===');
console.log(`通过: ${passed}/${passed+failed}`);
if (failed > 0) { console.log('❌ 有失败'); process.exit(1); }
else console.log('✅ 全部通过');
