// ESLint 9 flat config —— 仅用于开发期静态检查,游戏运行时无任何依赖、无构建。
//
// 用 .mjs 后缀:本文件用 ESM import 语法,但 package.json 不设 "type":"module",
// 否则 worldgen.js(UMD,Node 端用 require/module.exports)会被当成 ESM 导致测试失败。
//
// 说明:
// - game.js / worldgen.js 由 index.html 以经典 <script src> 直引(非 ES module),
//   故 sourceType 设为 "script",顶层声明视为全局(可被 HTML onclick 等外部调用)。
// - game.js 调用 worldgen.js 暴露的全局函数(hash2/fbm2D/biomeAt/heightAt 等),
//   需在 globals 显式声明(它们由另一个 <script> 提供,ESLint 无法跨文件推断)。
// - worldgen.js 是 UMD(浏览器挂全局 + Node module.exports),故同时给 browser + node 全局。
// - test/ 为 Node 脚本,给 node 全局。
// - three.min.js 为第三方压缩库,必须忽略。

import js from '@eslint/js';
import globals from 'globals';

// worldgen.js 在浏览器以 <script> 加载后挂到全局的函数/常量(game.js 直接调用)
const WORLDGEN_GLOBALS = {
  hash2: 'readonly',
  hash3: 'readonly',
  valueNoise2D: 'readonly',
  fbm2D: 'readonly',
  BIOMES: 'readonly',
  biomeAt: 'readonly',
  heightAt: 'readonly',
};

export default [
  // —— 全局忽略 ——
  {
    ignores: [
      'three.min.js',      // 第三方压缩库(Three.js r160)
      'node_modules/**',
      '.zcode/**',
    ],
  },

  // —— 基础规则集 ——
  js.configs.recommended,

  // —— 浏览器脚本:game.js(经典 script,调用 worldgen.js 的全局函数)——
  {
    files: ['game.js'],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'script',
      globals: {
        ...globals.browser,
        ...WORLDGEN_GLOBALS,
      },
    },
    rules: {
      // 故意留空的 catch 块(吞掉可忽略的错误)是本项目的既有写法
      'no-empty': ['error', { allowEmptyCatch: true }],
      // 经典 script 顶层声明可被 HTML/其他脚本引用;catch 的 e 普遍未用
      'no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrors: 'none',
      }],
    },
  },

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
