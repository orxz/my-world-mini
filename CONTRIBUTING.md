# 贡献指南

感谢你有兴趣为本项目做贡献!🎮 这是一个 Minecraft 风格 3D 体素沙盒,
纯前端、零构建运行时,改动门槛很低。

## 🚀 本地启动

需要 **Node.js ≥ 18**(仅用于跑测试和 lint,游戏运行时不需要 Node)。

```bash
# 安装开发依赖(ESLint 等)
npm install

# 跑确定性函数单元测试(17 项)
npm test

# 静态检查
npm run lint

# 启动本地静态服务器(然后在浏览器打开 http://localhost:8843/)
npm run serve
```

> 游戏本身**无需构建**:直接双击 `index.html` 即可游玩。`npm run serve` 只是为了
> 避免某些浏览器对 `file://` 的限制(如 IndexedDB、模块加载)。

## 📁 目录导览

```
myword/
├── index.html          # 页面结构 + 样式 + 面板(开始/暂停/背包/存档管理/设置)
├── game.js             # 游戏主逻辑(20 个模块,~3600 行:渲染/物理/物品/视角/存档/UI)
├── worldgen.js         # 世界生成模块(纯函数:噪声/群系/高度,可独立测试)
├── three.min.js        # Three.js r160(第三方,已内置,离线可玩 —— 请勿改动)
├── test/unit.test.js   # Node 单元测试(确定性函数验证)
├── docs/               # 架构与模块文档
│   ├── architecture.md
│   └── worldgen.md
├── eslint.config.mjs   # ESLint 9 flat config(仅开发期,ESM)
└── package.json        # npm scripts(test/serve/lint)
```

## 🧱 代码风格

- **缩进**:2 空格(见 `.editorconfig`)
- **语言**:原生 JavaScript,**不使用框架、不引入构建/打包工具**
- **运行时零依赖**:`game.js` / `worldgen.js` 由 `index.html` 以经典 `<script src>` 直引
- **浏览器全局**:`game.js` 直接使用 `window` / `document` / `THREE` / `indexedDB` / `AudioContext` 等,
  不做模块封装(顶层函数/变量视为全局,可被 HTML `onclick` 调用)
- **worldgen.js 是 UMD**:浏览器挂全局(`window.WORLDGEN`)+ Node `module.exports`,便于单测复用
- **中文注释**:函数/段落注释用中文说明意图,与现有风格一致
- **提交前必跑**:`npm test && npm run lint` 全绿(errors 必须为 0;`no-unused-vars` 设为 warn 级,既有历史代码的少量未用变量允许保留,但新代码请避免)

## 🧪 测试

- 现有测试覆盖 `worldgen.js` 的**确定性纯函数**(哈希、噪声、群系、高度、存档序列化)
- 新增/修改这些函数时,请同步更新 `test/unit.test.js`
- 涉及渲染/交互的逻辑(依赖 DOM / Three.js)目前**无自动化覆盖**,
  改动后请在浏览器中手动验证关键路径(移动、破坏、放置、存档读档、三视角)

## 📝 提交规范

现有提交历史沿用以下前缀(请保持一致):

| 前缀 | 用途 |
|---|---|
| `feat:` | 新功能 |
| `fix:` | Bug 修复 |
| `docs:` | 文档变更 |
| `refactor:` | 重构(不改行为) |
| `chore:` | 构建/工具/基础设施 |

示例:`feat: 新增钻石门方块` / `fix: 读档后玩家无法移动` / `docs: 补充架构文档`

## ✅ PR 清单

提交 PR 前,请确认:

- [ ] `npm test` 通过(17 项全绿)
- [ ] `npm run lint` 通过(无 error)
- [ ] 浏览器手动验证:游戏可启动、移动/破坏/放置正常、无控制台报错
- [ ] 若改了 `worldgen.js`,测试已同步更新
- [ ] 提交信息符合上述规范
- [ ] **未引入**构建工具 / 框架 / 运行时依赖(保持"打开即玩")

## 🐛 反馈

发现 bug 或有功能想法,欢迎提 Issue,描述清楚复现步骤与期望行为。
