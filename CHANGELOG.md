# 更新日志

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 规范,
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### 新增
- **天空系统升级**:渐变天穹(天顶深蓝 → 地平线与雾色无缝衔接)+ 夜晚星空(320 颗,
  随昼夜淡入淡出)+ 太阳/月亮光晕(叠加混合 Sprite);水下自动隐藏天穹
- **块状云**:像素化云纹理(3 个确定性变体)替换纯色面片,MC 风格观感
- **破坏裂纹覆盖层**:被瞄准的方块表面显示 4 阶段裂纹(确定性程序化纹理),
  随破坏进度推进,配合底部进度条
- **移动反馈**:第一人称行走视角摆动(起伏 + 微 roll)、落地尘土粒子
- **水面呼吸波动**:所有水网格整体微幅升降
- **动物系统(被动生物 · 粉红猪)**:草地随机生成(上限 10 头,离玩家 10格外),
  游荡 AI(随机换向/闲置)+ 重力/水浮力 + 碰撞(撞墙跳一格或转向)+ 行走摆腿;
  左键可攻击(剑/斧伤害更高),受击闪红 + 击退,HP 归零粒子消散;带叫声音效;
  暂停菜单/设置面板可开关,不入存档,暂停时冻结
- 项目基础设施:`package.json`(npm scripts:`test` / `serve` / `lint`)
- ESLint 9 flat config(`eslint.config.mjs`),含 browser/node 环境与忽略规则
- GitHub Actions CI(`.github/workflows/ci.yml`):push/PR 自动跑测试 + lint
- `LICENSE`(MIT)、`.editorconfig`
- 产品文档:`docs/architecture.md`(架构与数据流)、`docs/worldgen.md`(世界生成模块 API)、
  `CONTRIBUTING.md`(贡献指南)、本 `CHANGELOG.md`
- README 精修:徽章、目录、Quick Start、Development、License 段
- **`craft.js` 纯函数模块**:`RECIPES` / `matchRecipe` / `breakCost` 从 `game.js` 提取(UMD,
  浏览器挂 `CRAFTLIB` + Node `module.exports`),新增 15 项配方/破坏耗时单元测试(共 32 项)
- README 补充合成(2×2 配方)、农作物(小麦 60 秒成熟)、健康系统(20 HP / 跌落 / 溺水)文档,
  方块数修正为 20 种(8 基础 + 水/雪/沙砾 + 4 羊毛 + 5 门)

### 变更
- `.gitignore` 追加 `node_modules/`、`.eslintcache`
- 射线检测完全移除 `raycastTargets` 死代码(数组/脏标记/重建函数 + 2 处残留调用),
  `docs/architecture.md` 同步更新为 DDA 体素步进描述

### 移除
- 清理游离的 0 字节垃圾文件 `_t`
- 删除 `raycastTargets` / `rebuildRaycastTargets` / `markRaycastDirty`、未使用的
  `Raycaster` / `screenCenter` 死代码

### 修复
- 农作物跨会话成熟回归:`updateCrops`/`tryPlantCrop` 改回 `Date.now()`(cropTimers 持久化,需绝对时间),并加注释防止再次回归
- 移除未使用的 `_daytimeEl` 死代码

### 性能
- `updatePlayer` 向量池化:触屏摇杆输入改用 `addScaledVector`(不再 `clone()` 分配);
  `raycastTarget` 命中结果/法线改池化对象与向量 —— 每帧主循环热路径零 GC 分配
- **区块生成 ~7× 提速**(基准:64 个新区块的生成+建网格 283ms → 39ms):
  - 树生成一次性化:`ensureChunk` 不再对周围 25 个区块重复跑种树扫描,每个区块只在创建时
    种自己的树;树冠伸入未生成区块的部分写入 `pendingBlocks` 队列,由该区块创建时应用
  - `growTreesInChunk` 哈希预过滤(treeChance ≤ 0.12,~88% 的列跳过多层噪声计算)
  - 玩家改动 diff 按区块分桶(`modsByChunk`):`generateChunkData` 只应用本区块桶内条目,
    不再对全量 16×48×16 个位置做字符串 key 探测
- **区块网格构建**:邻接面剔除改按 id 查表(`SOLID_BY_ID`)+ 区块内直读 `data`,
  消除每个面一次 `getBlock` 的字符串 key + Map 查找 + `BLOCK_TYPES` 哈希查找;UV 复用缓冲
- `updateChunks` 脏区块改用持久 `Set`(`dirtyChunks`),不再每帧分配数组并全量排序;
  mesh 构建按距离挑最近的 budget 个
- 昼夜时间 HUD 仅在显示的分钟变化时写 DOM(原先每帧写 `textContent`)
- 粒子材质按颜色缓存(原每次破坏新建并销毁 8 个材质);箭矢朝向更新复用临时向量

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
