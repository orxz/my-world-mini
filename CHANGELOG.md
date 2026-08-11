# 更新日志

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 规范,
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### 新增
- 项目基础设施:`package.json`(npm scripts:`test` / `serve` / `lint`)
- ESLint 9 flat config(`eslint.config.js`),含 browser/node 环境与忽略规则
- GitHub Actions CI(`.github/workflows/ci.yml`):push/PR 自动跑测试 + lint
- `LICENSE`(MIT)、`.editorconfig`
- 产品文档:`docs/architecture.md`(架构与数据流)、`docs/worldgen.md`(世界生成模块 API)、
  `CONTRIBUTING.md`(贡献指南)、本 `CHANGELOG.md`
- README 精修:徽章、目录、Quick Start、Development、License 段

### 变更
- `.gitignore` 追加 `node_modules/`、`.eslintcache`

### 移除
- 清理游离的 0 字节垃圾文件 `_t`

## [2.0.0] - 2026-08-07

### 新增
- **动态区块加载**:世界分为 16×16 chunk,玩家走动自动加载/卸载,近似无限世界
- **确定性世界生成**:`worldgen.js` 纯函数层(哈希/值噪声/fbm/群系/高度),同种子同坐标永远一致
- **6 种生物群系**:平原 / 森林 / 沙漠 / 山地 / 雪原 / 海洋(温度+湿度+山地三层噪声)
- **多存档管理**(IndexedDB):任意数量独立存档,只存种子 + 玩家改动 diff,自动保存
- **程序化音效**(Web Audio,无外部文件):破坏/放置/走路/跳跃/落地/入水
- **物品系统(创造模式)**:11 种方块、24 种工具(5 档材质)、4 种材料、合成
- **5 种门方块**:木/铁/石/金/钻石门,真实物件实体(2 格高)+ 开关动画 + 存档持久化
- **出生广场**:确定性固定场景(圆形广场 + "Owen" 字样 + 灯塔 + 树篱 + 喷泉 + 像素艺术)
- **三视角**(F5 切换):第一人称 / 第三人称背后 / 第三人称正面,相机碰撞检测
- **视觉优化**:ACES 色调映射、顶点色烘焙、纹理图集 + 面剔除 + 几何合并(1 chunk = 1 draw call)
- **边界处理**:基岩层 y=0 不可破坏、虚空救援、固定出生点
- **Node 单元测试**(`test/unit.test.js`):17 项确定性函数验证
