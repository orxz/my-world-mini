# 设计:完善项目基础建设与产品文档

- 日期: 2026-08-11
- 范围: 「我的世界·体素沙盒」项目(myword),纯前端 Three.js 体素游戏
- 方案: Approach A(标准开源仓库布局,基础设施与文档并重)

## 1. 背景与目标

项目是一个 Minecraft 风格 3D 体素沙盒,纯前端、零构建运行时(双击 `index.html` 即玩)。
当前有完整游戏逻辑(game.js 3667 行 / 20 个模块)、确定性世界生成模块(worldgen.js)、
17 项 Node 单元测试,以及一份较完整的中文 README。但工程基础设施与产品文档存在明显缺口:

- 无 `package.json`(无法 `npm test`/`npm run lint`)
- 无 `LICENSE`
- 无 lint / CI
- 垃圾文件 `_t`(0 字节)游离于版本控制外
- 无架构文档、无模块 API 文档、无 CHANGELOG / CONTRIBUTING
- README 缺目录、徽章、许可证、开发说明

**目标**: 在不破坏「运行时零构建」特性的前提下,补齐工程基础设施与产品文档,
使仓库具备标准开源项目的可发现性、可贡献性与可验证性。

## 2. 关键约束

- **运行时零构建**: 游戏运行时仍只需打开 `index.html`;ESLint/devDependencies 仅用于开发与测试,
  不引入打包/编译步骤,不改变 `index.html` 的 `<script src>` 直引方式。
- **保持现有游戏逻辑不变**: 本次只新增/完善基础设施与文档,**不重构 game.js 逻辑**
  (仅可能在 ESLint 首跑时做最小必要的代码修复,且不改变行为)。
- **中文优先**: 现有文档为中文,新文档(CONTRIBUTING/CHANGELOG/docs)沿用中文,
  必要术语保留英文。
- **license**: MIT。

## 3. 交付物清单

### 3.1 基础设施

| 文件 | 内容 |
|---|---|
| `package.json` | name/description/version=2.0.0/license=MIT/private=true;`scripts`: `test`→`node test/unit.test.js`、`serve`→`python3 -m http.server 8843`、`lint`→`eslint .`;`devDependencies`: eslint@9、@eslint/js@9、globals@15;`engines.node`≥18 |
| `LICENSE` | MIT 文本(版权 myword contributors) |
| `eslint.config.js` | ESLint 9 flat config:`@eslint/js` recommended;`game.js`/`worldgen.js` 用 `sourceType:"script"` + `globals.browser`(+ node 全局以兼容 worldgen 的 UMD);`test/**` 用 node globals;忽略 `three.min.js`、`node_modules/`、`.zcode/` |
| `.github/workflows/ci.yml` | push/PR 触发:checkout → setup-node(20) → `npm ci` → `npm test` → `npm run lint` |
| `.editorconfig` | UTF-8 / LF / 末尾换行 / 2 空格 / `*.md` 保留 wrap |
| `.gitignore` | 追加 `node_modules/`、`.eslintcache` |
| 清理 | 删除 `_t`(0 字节垃圾文件) |

### 3.2 产品文档

| 文件 | 内容 |
|---|---|
| `README.md`(精修) | 顶部:标题+标语+徽章(CI/license/node/纯前端)+截图位;可点击 TOC;Quick Start(双击 index.html / `npm install && npm run serve`);保留并精简现有功能文档(操作/核心系统/视觉/边界/技术栈/关键实现),关键处链向 `docs/`;新增 **Development**(`npm test`/`npm run lint`/`npm run serve`、Node 要求、ESLint 说明、目录布局);Contributing 链向 CONTRIBUTING.md;License 段(MIT) |
| `docs/architecture.md` | 高层架构;三层模块映射(worldgen.js 纯函数层 / game.js 引擎层×20 部分 / index.html DOM+UI 层);核心数据流:区块生命周期、渲染管线(atlas+面剔除+合并几何→1 chunk=1 draw call)、raycast 反查(`point ± normal·0.5`)、存档/读档(seed + modifications diff via IndexedDB) |
| `docs/worldgen.md` | worldgen.js 模块 API 参考:`hash2`/`hash3`/`valueNoise2D`/`fbm2D`/`BIOMES`/`biomeAt`/`heightAt` — 签名、返回范围、确定性保证、Node+浏览器双环境用法;交叉引用 `test/unit.test.js` 的 17 项测试 |
| `CONTRIBUTING.md` | 本地运行方式;代码风格(2 空格、浏览器全局、无框架/无构建);测试与 lint 流程;提交规范(沿用现有 `feat:`/`fix:` 前缀,记为约定);PR 清单;目录导览 |
| `CHANGELOG.md` | Keep a Changelog 格式;从 git 历史回填 v2.0(2026-08-07 起的功能/修复里程碑);本次产出记入 `[Unreleased]` |

## 4. 验证标准(DoD)

1. `npm install` 成功,生成 `node_modules/` 且被 `.gitignore` 忽略
2. `npm test` 通过(17 项全绿,退出码 0)
3. `npm run lint` 通过(退出码 0,无 error)
4. 所有交付物文件存在且内容非空
5. `_t` 已删除
6. README 含 TOC / License(MIT)/ Development 段
7. 游戏运行时未被破坏:`index.html` 仍直引 `worldgen.js` / `three.min.js` / `game.js`(无打包)
8. 全部改动提交到 git(不推送)

## 5. 风险与对策

- **ESLint 首跑报错多**: game.js 从未 lint 过。对策:先以 `eslint:recommended` 跑一遍,
  统计真实问题;只做不改变行为的最小修复(未用变量、缺分号风格不在 recommended 内);
  纯样式类问题若量大则降到 warn 并在 CONTRIBUTING 记录,避免为过 lint 而大改逻辑。
- **flat config 的 `sourceType`**: game.js/worldgen.js 是经典 `<script>` 直引(非 ES module),
  需 `sourceType:"script"`,否则顶层声明被当作模块私有、`toggleInventory`(HTML onclick 调用)
  会被误报未用。worldgen.js 是 UMD(浏览器挂全局 + Node `module.exports`),需同时给 browser+node 全局。
- **CI 依赖 python3**: `serve` 脚本用 python3,但 CI 只跑 test+lint,不依赖 serve,故无影响。
- **`three.min.js` 被 lint**: 体积大且为第三方压缩代码,必须 ignore,否则 eslint 内存爆炸。

## 6. 非目标(本次不做)

- 不重构 game.js 游戏逻辑
- 不引入打包/构建工具(Webpack/Vite 等)
- 不引入 TypeScript
- 不做端到端浏览器自动化测试(已有 Node 单元测试覆盖确定性函数)
- 不拆分 game.js 为多文件
