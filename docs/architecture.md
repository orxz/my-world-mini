# 架构文档

本文描述「我的世界·体素沙盒」(myword)的整体架构、模块划分与核心数据流。
目的是让新贡献者快速理解代码组织,定位到要改动的模块。

> 关于**世界生成**的具体函数 API,见 [`worldgen.md`](./worldgen.md)。
> 关于**如何本地运行/测试**,见 [`../CONTRIBUTING.md`](../CONTRIBUTING.md)。

## 1. 设计原则

- **纯前端·零构建运行时**:不引入打包/编译工具,`index.html` 以经典 `<script src>` 直引四个脚本
  (worldgen / craft / three / game);双击即玩,可完全离线。
- **确定性优先**:世界由种子 + 纯函数生成,同种子同坐标永远一致 → 存档只需存"种子 + 玩家改动 diff"。
- **运行时无框架**:原生 JavaScript + Three.js,DOM 直接操作。
- **可测部分与渲染解耦**:世界生成/合成破坏的纯逻辑抽到 `worldgen.js` 与 `craft.js`,可在 Node 单测中复用。

## 2. 三层结构

```
┌─────────────────────────────────────────────────────────┐
│  index.html  ── DOM 结构 + CSS + 各 UI 面板             │  UI 层
│   (开始遮罩/暂停菜单/背包/存档管理/设置/HUD)           │
└───────────────┬─────────────────────────────────────────┘
                │ <script src> 直引 + onclick 回调
┌───────────────▼─────────────────────────────────────────┐
│  game.js  ── 游戏引擎(20 个模块,~3600 行)             │  引擎层
│   渲染 / 物理 / 输入 / 物品 / 视角 / 存档 / 音效 / UI   │
└───────────────┬─────────────────────────────────────────┘
                │ 函数调用(hash2/fbm2D/biomeAt/heightAt + CRAFTLIB)
┌───────────────▼─────────────────────────────────────────┐
│  worldgen.js + craft.js ── 纯函数层(无 DOM/Three 依赖) │  纯函数层
│   worldgen: 哈希 / 值噪声 / fbm / 群系 / 高度           │
│   craft:    RECIPES / matchRecipe / breakCost           │
│   ← 均可单测                                            │
└─────────────────────────────────────────────────────────┘
                ▲
┌───────────────┴─────────────────────────────────────────┐
│  test/unit.test.js  ── Node 单元测试(32 项)           │  测试
│    require('../worldgen.js') + require('../craft.js')   │
└─────────────────────────────────────────────────────────┘

three.min.js  ── Three.js r160(第三方渲染库,内置,离线)
```

`worldgen.js` 与 `craft.js` 均为 UMD:浏览器里挂全局(`window.WORLDGEN` / `window.CRAFTLIB`),
`game.js` 直接调用;Node 里通过 `module.exports` 导出供测试 require。
这是"浏览器与测试共用单一数据源"的关键:所有可测的纯逻辑(地形、配方、破坏耗时)
都不放在 `game.js` 里,避免 DOM/Three 依赖污染测试。

## 3. game.js 模块划分(20 部分)

`game.js` 按顺序分为 20 个带注释段落的模块,改动时按职责定位:

| # | 模块 | 职责 |
|---|---|---|
| 1 | 方块定义 | `BLOCK_TYPES` / `BLOCK_ID` / `ID_TO_BLOCK`(数字 id↔名称) |
| 2 | 工具与物品 | `TOOL_TYPES`(镐/斧/铲/剑/盾/弓 ×5 档)、`ITEM_TYPES`(材料) |
| 3 | 像素纹理与图集 | `makePixelTexture` / `buildAtlas` / `makeBlockMaterials` |
| 4 | 区块系统 | `chunks` Map、`modifications` Map、`generateChunkData`、`getBlock`/`setBlock`/`isSolidAt` |
| 5 | 区块网格构建 | `buildChunkMesh`:面剔除 + atlas UV + 合并为单 BufferGeometry |
| 6 | 区块加载/卸载 | `updateChunks`(分帧)、远端门清理 |
| 7 | 全局状态 | 玩家 pos/velocity/keys/hotbar、相机、云朵、池化向量(热路径零 GC) |
| 8 | 玩家模型 | `buildPlayerModel`(第三人称人形) |
| 9 | 手持物品与工具模型 | `buildHoldGroup` / `updateHoldItem` / `buildToolMesh` |
| 10 | 第三人称相机 | `updateThirdPersonCamera` / 相机碰撞 / 视角切换 |
| 11 | 初始化 | `init` / 出生广场 `buildSpawnPlaza` / `findSafeSpawn` / `clearWorld` / `resetWorld` |
| 12 | 快捷栏/背包 | `initInventory` / `buildHotbar` / 图标渲染 |
| 13 | 输入 | 键盘/鼠标/触屏事件、Pointer Lock、音频初始化钩子 |
| 14 | 射线检测 | DDA 体素步进(`raycastTarget`)+ 门实体射线(`raycastDoor`),结果池化零分配 |
| 15 | 物理/移动 | 重力、跳跃、飞行、游泳、碰撞(`isSolidAt` 查 chunk) |
| 16 | 渲染循环 | `requestAnimationFrame` 主循环、区块更新、雾色随水位、昼夜 |
| 17 | 背包面板 | 背包 DOM 渲染、物品分类、合成(2×2;配方匹配在 craft.js) |
| 18 | 音效系统 | Web Audio 程序化合成(Oscillator + 白噪声) |
| 19 | 存档/读档 | IndexedDB 多存档、seed + modifications diff、自动保存 |
| 20 | 启动 | 入口:DOM 就绪 → `init` → 主循环 |

## 4. 核心数据流

### 4.1 区块生命周期

```
玩家移动 → updateChunks(playerX, playerZ) 每帧调用
         ├─ 卸载半径外 chunk: scene.remove + geometry.dispose(数据保留在 modifications)
         └─ 加载半径内未生成 chunk(分帧,避免卡顿):
              generateChunkData(cx,cz) ──► 确定性生成地形 + 应用 modifications diff
              buildChunkMesh(ch)      ──► 面剔除 + 合并 → 加入 scene
```

- `chunks`:`Map<chunkKey, {cx,cz,data:Uint8Array,mesh,...}>`
- `modifications`:`Map<"x,y,z", type|null>` —— **玩家改动**,全局唯一真相,卸载不丢
- 渲染半径默认 `RENDER_DISTANCE=5`(11×11=121 chunk),世界高 48,海平面 14

### 4.2 渲染管线(性能关键)

每个 chunk 的网格构建(`buildChunkMesh`):
1. 遍历 chunk 内每个方块的 6 个面
2. **面剔除**:只生成暴露在空气/水外的面(相邻是固体则跳过该面)
3. 从**纹理图集**取对应方块/面的 UV
4. **顶点色烘焙**:顶面亮/侧面中/底面暗(固定立体感,不依赖光照方向)
5. 合并为**单个 BufferGeometry** → 1 chunk = 1 draw call

材质:`MeshLambertMaterial({ map: atlasTexture })`;水/树叶用透明/alphaTest。
结果:上千方块只有 ~121 draw call,性能稳定。

### 4.3 射线检测(破坏/放置,纯 DDA,无 mesh 遍历)

由于 mesh 是整个 chunk(不再是单个方块 mesh),命中后不能直接取方块坐标。
早期实现用 `Raycaster.intersect(raycastTargets 数组)`,但每次区块 mesh 变化
都要重建目标数组(脏标记),且每帧遍历上百个 mesh 的所有三角形。现已改为
**DDA 体素步进**(Amanatides-Woo):

```
raycastTarget():
  起点 = 玩家眼睛位置,方向 = 由 yaw/pitch 推导
  沿 3 轴逐体素步进(只检查视线穿过的 ~6 个体素)
  首个固体方块 → 返回 {x, y, z, normal}(法线 = 进入面方向,反推 step 轴)
```

- 不再维护 `raycastTargets` 数组,无需脏标记/重建(相关死代码已删除)
- 命中结果与法线用**池化对象/向量**复用,每帧调用零 GC 分配
- 门实体另走 `raycastDoor`(沿射线固定步长查 `doors` Map)
- 破坏坐标 = 命中体素;放置坐标 = 命中体素 + 法线取整偏移

### 4.4 存档/读档(IndexedDB)

```
存档记录 = { id, name, seed, playerPos, yaw, pitch, cameraMode, isFlying,
             hotbar, currentSlot, modifications: [[key, type|null], ...], timestamp }
```

- **只存种子 + 玩家改动 diff**(非全量方块)→ 容量小、加载快
- 读档:恢复 seed + modifications + 玩家状态 → `clearWorld` → 重新生成中心区块(自动应用 diff)
- 自动保存:有当前存档时,30 秒 + 暂停 + 改动防抖
- 多存档:IndexedDB 自增 id,每个存档独立

### 4.5 出生广场(确定性)

`buildSpawnPlaza` 把广场所有方块写入 `modifications`(作为玩家改动记录),
因此每次生成(新游戏/重置/读档回原点)都得到同一个固定场景:
圆形广场 + 中央 "Owen" 树叶字样 + 四角灯塔 + 环形树篱 + 南北拱门 + 喷泉 + 像素艺术。

## 5. 边界与安全网

- **基岩层**:y=0 不可破坏(防挖穿掉虚空)
- **虚空救援**:掉入虚空返回最后安全位置(非原点)
- **出生点**:固定广场中心,海平面以上干燥陆地
- **相机碰撞**:第三人称背靠墙自动拉近,不穿模

## 6. 可扩展点

- **新方块**:在 `BLOCK_TYPES` / `BLOCK_ID` / `ID_TO_BLOCK` 注册 → `buildAtlas` 加纹理 → 必要时进 `HOTBAR_ORDER`
- **新配方**:在 `craft.js` 的 `RECIPES` 加条目(pattern 长度 4 + shapeless 标记)→ `matchRecipe` 自动生效,并在 `test/unit.test.js` 补一个配方用例
- **新破坏规则**:改 `craft.js` 的 `breakCost(blockDef, toolDef)`(纯函数,单测覆盖)
- **新群系**:在 `worldgen.js` 的 `BIOMES` 加定义 → `biomeAt` 的判定分支加条件
- **新工具**:在 `TOOL_TYPES` / `TOOL_ORDER` 注册 + `buildToolMesh` 加建模分支
- **新音效**:`audio.play(type)` 加合成分支,在对应事件调用
