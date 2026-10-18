// ESLint 9 flat config —— 仅用于开发期静态检查,游戏运行时无任何依赖、无构建。
//
// 用 .mjs 后缀:本文件用 ESM import 语法,但 package.json 不设 "type":"module",
// 否则 worldgen.js(UMD,Node 端用 require/module.exports)会被当成 ESM 导致测试失败。
//
// 说明:
// - 游戏脚本由 index.html 以经典 <script src> 直引(非 ES module),按加载顺序共享全局
//   词法环境。game.js 家族 17 个分片(game-defs/atlas/.../save + game.js 启动入口)是
//   原 9000 行单文件按行序的字节等价切分(R54),顺序不得调换。
// - 各分片调用其他分片/worldgen.js 暴露的全局符号,ESLint 无法跨文件推断:
//   worldgen/craft 侧用下方手工清单;game 家族分片在配置期自动读取各分片顶层声明
//   (function/async function/const/let/var/class 及顶层解构)互评 readonly globals,
//   并为"定义于本文件、被其他分片引用"的符号生成 varsIgnorePattern,免手工维护。
// - worldgen.js 是 UMD(浏览器挂全局 + Node module.exports),故同时给 browser + node 全局。
// - test/ 为 Node 脚本,给 node 全局。
// - three.min.js 为第三方压缩库,必须忽略。

import js from '@eslint/js';
import globals from 'globals';
import fs from 'node:fs';

// worldgen.js 在浏览器以 <script> 加载后挂到全局的函数/常量(game.js 直接调用)
const WORLDGEN_GLOBALS = {
  hash2: 'readonly',
  hash3: 'readonly',
  valueNoise2D: 'readonly',
  valueNoise3D: 'readonly',
  fbm2D: 'readonly',
  BIOMES: 'readonly',
  biomeAt: 'readonly',
  heightAt: 'readonly',
  caveAt: 'readonly',
  villageInCell: 'readonly',
  hutBlockAt: 'readonly',
  dungeonInCell: 'readonly',
  dungeonBlockAt: 'readonly',
};

// craft.js 在浏览器以 <script> 加载后挂到全局的命名空间(game.js 直接调用)
const CRAFTLIB_GLOBALS = {
  CRAFTLIB: 'readonly',
  matchRecipeGrid: 'readonly',
  INVLIB: 'readonly',
  MACHINES: 'readonly',
  BALANCE: 'readonly',
  BALANCE_LIB: 'readonly',
};

// —— game.js 家族分片的跨文件符号自动推导 ——
// 按index.html 加载顺序排列(顺序本身无 eslint 语义,仅为可读与对照)。
const GAME_FILES = [
  'game.js', 'game-defs.js', 'game-atlas.js', 'game-chunks.js', 'game-scene.js',
  'game-init.js', 'game-ui.js', 'game-interact.js', 'game-redstone.js',
  'game-entities.js', 'game-systems.js', 'game-block-entities.js',
  'game-physics.js', 'game-render.js', 'game-panels.js', 'game-audio.js', 'game-save.js',
];

const GAME_TEXT = Object.fromEntries(GAME_FILES.map((f) => [f, fs.readFileSync(f, 'utf8')]));

// 按顶层逗号切分声明列表(忽略 ()[]{} 与引号内的逗号;// 注释直接截断)
const splitTopLevel = (s) => {
  const parts = []; let depth = 0, cur = '', q = null;
  for (const ch of s) {
    if (q) { cur += ch; if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { q = ch; cur += ch; continue; }
    if (!cur.trim() && ch === '/') { break; }              // 行内 // 注释开头
    if ('([{'.includes(ch)) depth++;
    if (')]}'.includes(ch)) depth--;
    if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; continue; }
    cur += ch;
  }
  parts.push(cur);
  return parts;
};

// 提取一个分片顶层声明的 [名字, 可变性]:
// function/async function/class 直取名;const/let/var 按顶层逗号拆多声明,
// 每段取首标识符(含 {a, b} / [x, y] 解构形态,剥 :默认值/=初始化器)。
// let/var 声明是跨分片可变共享状态(globals 标 writable),const/function 标 readonly。
const topLevelNames = (f) => GAME_TEXT[f].split('\n').flatMap((line) => {
  let m = line.match(/^(?:async\s+)?(function|class)\s+([A-Za-z_$][\w$]*)/);
  if (m) return [[m[2], false]];
  m = line.match(/^(const|let|var)\s+(.+?);?\s*$/);
  if (!m) return [];
  const mut = m[1] !== 'const';
  return splitTopLevel(m[2]).map((seg) => {
    const id = seg.trim().match(/^(?:\{([^}]*)\}|\[([^\]]*)\]|([A-Za-z_$][\w$]*))/);
    if (!id) return [];
    if (id[3]) return [[id[3], mut]];
    const inner = id[1] || id[2] || '';
    return inner.split(',').map((s) => s.trim().split(/[:=]/)[0].trim()).filter((n) => /^[A-Za-z_$][\w$]*$/.test(n)).map((n) => [n, mut]);
  }).flat();
});

// 每个分片:其他分片定义的符号 → globals(let/var=writable 可变共享,const/function=readonly)
const gameSiblingGlobals = GAME_FILES.map((f, i) => {
  const set = {};
  GAME_FILES.forEach((g, j) => { if (i !== j) topLevelNames(g).forEach(([n, mut]) => { if (!set[n]) set[n] = mut ? 'writable' : 'readonly'; }); });
  return set;
});

// 每个分片:定义于本文件、且被任一其他分片文本引用的符号 → varsIgnorePattern
// (这些符号是跨文件"导出",no-unused-vars 在本文件内看不到引用,会误报 unused)
const gameExportedPattern = GAME_FILES.map((f, i) => {
  const others = GAME_FILES.filter((_, j) => j !== i).map((g) => GAME_TEXT[g]).join('\n');
  const names = topLevelNames(f).map(([n]) => n).filter((n) => new RegExp(`\\b${n.replace(/\$/g, '\\$')}\\b`).test(others));
  return names.length ? `^(?:${names.map((n) => n.replace(/\$/g, '\\$')).join('|')})$` : '(?!)';
});

export default [
  // —— 全局忽略 ——
  {
    ignores: [
      'three.min.js',      // 第三方压缩库(Three.js r160)
      'node_modules/**',
      '.zcode/**',
      'test/smoke.cdp.mjs',   // CDP 冒烟测试(Node 脚本,跑在 headless Chrome 侧,不参与 lint)
      'test/r33-villager.cdp.mjs',   // R33 村民轮 CDP 实机验证(同上)
      'test/r34-achv.cdp.mjs',       // R34 成就轮 CDP 实机验证(同上)
      'test/r35-slime.cdp.mjs',      // R35 史莱姆+剪刀轮 CDP 实机验证(同上)
      'test/r36-bucket.cdp.mjs',     // R36 铁桶与水轮 CDP 实机验证(同上)
      'test/r37-dungeon.cdp.mjs',    // R37 地牢轮 CDP 实机验证(同上)
      'test/r38-redstone.cdp.mjs',   // R38 红石轮 CDP 实机验证(同上)
      'test/r39-golem.cdp.mjs',      // R39 村民繁殖+铁傀儡轮 CDP 实机验证(同上)
      'test/r40-cake.cdp.mjs',       // R40 蛋糕/糖/蛋链 CDP 实机验证(同上)
      'test/r41-build.cdp.mjs',      // R41 建筑方块轮 CDP 实机验证(同上)
      'test/r42-piston.cdp.mjs',     // R42 红石扩展轮 CDP 实机验证(同上)
      'test/r43-polish.cdp.mjs',     // R43 打磨轮 CDP 实机验证(同上)
      'test/r44-journey.cdp.mjs',    // R44 可玩性验收:端到端真实旅程(同上)
      'test/r44-visual-recheck.cdp.mjs',   // R44 视觉复验(同上)
      'test/r45-survival.cdp.mjs',   // R45 生存数值验收(同上)
      'test/r46-tutorial.cdp.mjs',   // R46 教程引导流验收(同上)
      'test/r47-save.cdp.mjs',       // R47 存档迁移边界验收(同上)
      'test/r48-mobile.cdp.mjs',     // R48 移动端全流程验收(同上)
      'test/r49-perf.cdp.mjs',       // R49 性能长测复验(同上)
      'test/r50-final.cdp.mjs',      // R50 收官细审(同上)
      'test/r51-visual.cdp.mjs',     // R51 视觉/视角修复回归(同上)
      'test/r52-verify.cdp.mjs',     // R52 视角体验修复复验(同上)
      'test/r55-verify.cdp.mjs',     // R55 生存地基验收(同上)
      'test/r56-playground.cdp.mjs', // R56 出生地游乐场验收(同上)
      'test/reload.cdp.mjs',         // 回归运行助手:套件连跑前重载新世界(同上)
    ],
  },

  // —— 基础规则集 ——
  js.configs.recommended,

  // —— 浏览器脚本:game.js 家族 17 个分片(经典 script,共享全局词法环境)——
  ...GAME_FILES.map((f, i) => ({
    files: [f],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'script',
      globals: {
        ...globals.browser,
        ...WORLDGEN_GLOBALS,
        ...CRAFTLIB_GLOBALS,
        ...gameSiblingGlobals[i],
      },
    },
    rules: {
      // catch 块自 R54 起统一带 console.debug 日志;允许空块仅作兜底
      'no-empty': ['error', { allowEmptyCatch: true }],
      // 经典 script 顶层声明可被 HTML/其他分片引用;catch 的 e 普遍未用
      'no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: gameExportedPattern[i],
        caughtErrors: 'none',
      }],
    },
  })),

  // —— UMD 模块:worldgen.js(浏览器挂全局 + Node module.exports)——
  {
    files: ['worldgen.js'],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'script',
      globals: {
        ...globals.browser,
        ...globals.node,   // UMD 用到 module/require/global
      },
    },
    rules: {
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrors: 'none',
      }],
    },
  },

  // —— UMD 模块:craft.js / inventory.js(浏览器挂全局 + Node module.exports)——
  {
    files: ['craft.js', 'inventory.js', 'machines.js', 'balance.js'],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'script',
      globals: {
        ...globals.browser,
        ...globals.node,   // UMD 用到 module/require/global
        BALANCE: 'readonly',
        BALANCE_LIB: 'readonly',
      },
    },
    rules: {
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrors: 'none',
      }],
    },
  },

  // —— Node 测试脚本:test/**——
  {
    files: ['test/**/*.js'],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'script',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        caughtErrors: 'none',
      }],
    },
  },
];
