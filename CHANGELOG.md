# 更新日志

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 规范,
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### 性能(modifications 反向索引,路线图 3)
- **`modsByChunk` 分桶索引**:`chunkKey → Set<改动键>`,`generateChunkData` 据此只遍历
  本区块的改动键,替代原先对 16×48×16=12288 格逐格拼 `blockKey` + `Map.has` 的全扫描
  (移动高峰 3 区块/帧 ≈ 3.7 万次字符串分配/帧);无改动的区块零成本
- **写点收敛**:`modsSet/modsDelete/modsClear/modsLoad` 四个入口同步双结构
  (setBlock/出生广场差量/清世界/读档),读仍走 `modifications` 本体,调用面不变
- **实测**:含 2401 条改动的区块(广场中心)50 次生成 52ms → 1.7ms(**31×**)
- **冒烟测试**:新增 T7(双结构互查不变式/写入同步/挖掉≠删除语义/桶遍历与全扫描
  等价),共 26 项

### 重构(模块拆分:game.js → audio.js / save.js / doors.js)
- **audio.js**:Web Audio 程序化音效对象整体迁出(IIFE + 全局,game.js 调用点零改动)
- **save.js**:IndexedDB 纯存储层(SAVELIB:add/overwrite/list/get/remove/count/latestId);
  game.js 保留 `collectSaveRecord`(rec 构造单一数据源,消除原先 saveSlot/overwriteSave
  两份重复字段列表)与 applySave/自动保存状态机
- **doors.js**:门渲染层(容器/键/材质缓存/createDoorMesh/disposeDoorGroup/纯查询);
  依赖玩家状态与音效/存档的交互逻辑(placeDoor/toggleDoor/raycastDoor 等)留在 game.js
- 修复拆分引入的 bug(冒烟测试第一时间拦截):`collectSaveRecord` 在 add 路径写入
  `id: undefined`,IndexedDB keyPath 求值非法抛 DataError;现 id 仅在覆盖保存时写入
- 单测新增 4 项(三模块可独立 require 加载、导出完整、doorBlocksAt/getDoorAt 查询
  语义:关门阻挡/开门放行/上半格回落),共 50 项
- game.js 3794 → 约 3560 行

### 修复(代码审查轮)
- **按住左键 + 弓自动连发(Important)**:复击节拍原先只排除材料,手持弓按住左键会以
  ~750ms/支 自动射光箭并耗尽耐久,剑则反复挥砍刷屏;现复击仅限空手/方块/镐斧铲
- **死亡不停止挖掘(Important)**:`respawnPlayer` 复位 `miningHeld` 与破坏进度,
  死亡遮罩期间不再在重生点继续自动挖掘
- **切槽位重置挖掘进度**:与 MC「换手持即重挖」语义一致,同时消除
  `breakTargetCost` 残留旧工具成本档的隐含契约
- **CI 就绪门控**:静态服务器启动后加 `curl --retry` 等待,消除 Chrome 先于服务器
  就绪的竞态
- **冒烟测试**:T6b 断言 mousedown/mouseup 真实事件路径驱动 `miningHeld`(此前 T6
  直接赋值状态,绕过了输入接线),共 25 项

### 工程与修复
- **CI 纳入浏览器冒烟测试(路线图 1)**:新增 `smoke` job —— setup-chrome + headless
  swiftshader 软件渲染 + CDP 9333,与本地 `test/smoke.cdp.mjs` 同一入口(24 项断言,
  本地已复现 CI 命令行全通过);Chrome 路径经环境变量传入避免 workflow 内插值
- **渲染距离档位与下拉值域不一致(P3)**:`settings.renderDist` clamp 到 1–10 任意整数,
  但设置面板下拉只提供 3/5/7/10,外部写入其他值时 select 显示为空;现 `loadSettings`
  将存储值吸附到最近合法档位(受控验证:4 → 5,且不写回存储)
- **范围调整**:移动端兼容不在当前目标内(触屏代码保留但不投入),优化方向转为对齐
  MC 原生桌面手感

### 功能(对齐 MC 原生挖掘手感)
- **按住左键持续挖掘**:按住期间以 250ms 固定节拍自动复击(对齐 MC 挥击节奏),
  松开/失锁/暂停即停;换目标自动重置进度;手持材料时不复击避免提示刷屏
- **破坏裂纹贴图(10 阶)**:挖掘进度在目标方块表面叠加程序化裂纹贴图,逐级加密;
  挖空/换目标即隐藏(懒构建单例,与准星高亮同生命周期)
- **Instant Mining**:手持工具与方块类别匹配(any 类装饰方块任意工具)时一击即碎,
  对齐 MC 创造模式手感;空手/错工具仍按 breakCost 次数
- **冒烟测试**:新增 T6(按住累积进度 + 裂纹阶段一致性 + 秒破),共 24 项

### 修复与优化(深度审查收尾轮)
- **启动/继续游戏全量反序列化所有存档(P2 性能)**:`hasSave` 改用 `count()`(只取条数),
  `loadGame` 改用 timestamp 索引反向 `openKeyCursor` 只取最新存档 id 再单条读取;
  原先二者都走 `getAll()` 把所有存档的全部 modifications 拉进内存,存档越多启动越慢
- **移除 `heightAt` 死参数 `biome`(P2)**:签名从未使用该形参,文档却声称"复用群系";
  同步清理 game.js 4 处调用、单测、冒烟测试与 `docs/worldgen.md` API 参考
- **操作文案与实现不符(P3)**:"破坏方块 左键(长按)"改为"持续点击"(实现为逐次点击累积进度)
- **favicon 404(P3)**:`<link rel="icon" href="data:,">` 消除控制台噪音
- **缓存版本号**:worldgen.js → 20260815a、game.js 随各轮修改逐次 bump(当前 20260815e)

### 修复(深度审查轮)
- **种植/成熟不触发自动保存(P1)**:`tryPlantCrop` 与 `updateCrops` 成功路径原先不调
  `markDirtySave()`,纯种植会话零改动判定导致 30 秒定时保存与暂停保存都不执行,
  刷新后 `cropTimers` 丢失、作物永远停在幼苗;现两处成功分支均标脏
- **game.js 缓存版本号未随最新提交更新(P1)**:8/15 大改后 `?v=` 仍停在 20260813e,
  8/13 后访问过的浏览器持续命中旧缓存;bump 至 20260815a

### 优化与健壮性收尾轮(性能 / 防御性)
- **区块材质三分离(性能)**:原先单一实体材质因树叶 alphaTest 而 `transparent: true`,全部
  实体几何都被追进透明队列(逐帧排序 + 丢失 early-z 剔除);现拆为实体(纯不透明)/
  树叶(alphaTest 镂空,仍在不透明队列)/水(半透明)三套共享材质与几何,新增
  `disposeChunkMesh` 统一释放三套 mesh(buildChunkMesh 重建/卸载/清世界共用)
- **树木重扫浪费(性能)**:`ensureChunk` 每个新区块会对 5×5 邻域重复调
  `growTreesInChunk`(~6400 列噪声重扫);新增 `treesGrown` 标记,已种过的区块直接跳过
- **hotbar 全量重建(性能)**:每破坏一个方块(工具耐久-1)原先重建整个 9 格 hotbar DOM;
  新增 `refreshSlotDurability` 只更新当前格耐久条(工具损坏清空格时仍全量重建)
- **箭矢朝向零分配(性能)**:`updateArrows` 的 lookAt 改用池化向量,不再每箭每帧 clone
- **存档名 HTML 转义(防御)**:存档管理列表的名称回显前经 `escapeHtml` 转义
- **自动保存失败不再静默**:失败时恢复脏标记,30 秒后自动重试(隐私模式/配额满不再无声丢档)
- **冒烟测试**:新增回归断言 —— 区块材质三分(T4)、耐久条局部刷新(T5),共 23 项

### 修复(体验审查轮:移动端暂停 / FOV / 保存策略)
- **出生广场存档差量化(P1 性能)**:广场原先把整根地柱全量写入 modifications(约 5.2 万条),
  每次自动保存都是 MB 级 IndexedDB 写入;现仅记录与自然地形的差异(地下 stone/dirt 层与
  生成结果一致的不记),条目数实测约减 40–60%(视种子地形而定)。`generateChunkData` 提取 `naturalColumnInfo`/
  `terrainBlockAt` 作为单一数据源,保证差量比较与地形生成永不分叉;广场圆盘内显式禁止
  种树(差量化后部分广场列无 modifications,原"树基未改动"检查会放行长出随机树)
- **移动端无法暂停/保存/进设置(P1)**:暂停菜单原先只能由 pointer lock 解锁事件唤起,
  触屏设备该事件永不触发;现触屏设备显示右上角「≡」按钮,与桌面共用 `showPauseMenu` 入口
- **Esc 暂停无条件全量覆盖存档(P1)**:解锁即 `autosave(true)`(force),零改动也写库;出生广场
  modifications 约 5 万条,每次都是 MB 级 IndexedDB 写入;现仅在 `saveDirty` 时保存
- **第三人称 FOV 硬编码(P1)**:`updateThirdPersonCamera` 固定 `camera.fov = 70`,切第三人称会
  覆盖用户 FOV 设置;现与第一人称分支一致使用 `settings.fov`
- **文档口径修正**:README 跌落伤害阈值 6.5 格 → 4.3 格(v=15 ⇒ h=v²/2g);
  「1 chunk = 1 draw call」→「实体与水至多 2 draw call」;触屏说明补「≡ 暂停按钮」
- **冒烟测试**:新增回归断言 —— 暂停菜单唤起 + 仅脏时保存(T1)、第三人称 FOV 遵循设置(T2)、
  广场差量不变式+布局完整+圆盘禁树(T3)

### 修复(生产级全面修复轮)
- **触屏设备无法移动(P0)**:`updatePlayer` 原以 pointer lock 状态为运行标志,触屏设备不请求锁定导致
  移动/重力/跳跃全部失效;现改为触屏设备用 `gameStarted` 标志,桌面保持 pointer lock 语义
- **门在区块卸载时被永久删除(P0)**:`updateChunks` 不再删除远离玩家的门数据,只释放 mesh,
  进入范围且区块已加载时重建;玩家建筑不再因走远而丢失
- **树木跨区块不渲染(P0)**:`plantTreeAt` 跨区块写入树叶/树干后未标脏相邻区块 mesh,
  导致"半棵树/隐形树";现写入即 `meshDirty = true`
- **农作物远离后永不成熟(P1)**:`updateCrops` 不再把"区块未加载(getBlock 返回 null)"误判为
  "被替换"而删除计时器;成熟后同帧清理计时器
- **第三人称切回第一人称后模型残留(P1)**:`updateThirdPersonCamera` 中 `cameraMode===0` 死分支移除,
  改在渲染循环第一人称分支隐藏模型
- **剑/弓/盾无冷却(P1)**:`toolCooldown` 原先只在"镐/斧/铲右键展示"分支写入,现所有成功动作都写入;
  举盾计时在切换武器后正常衰减
- **关闭背包后视角失效(P1)**:关闭背包自动重新请求指针锁定(失败时点击画面兜底重试)
- **门开关状态不存档(P1)**:`toggleDoor` 补 `markDirtySave()`
- **出生广场长树/浮空树冠(P2)**:种树前校验树基为未修改的自然地表(grass/dirt/sand/snow)且上方为空气
- **配方修正(P2)**:铁门改用 4×铁锭(新增 `gem_iron` 物品);移除"4 木板→1 木板"、"4 砖→1 砖"净亏配方
- **手持物 GPU 资源泄漏(P2)**:工具/材料 mesh 改为模板缓存 + 克隆复用,不再每次切槽位新建材质/几何体
- **损坏存档健壮性(P2)**:新增 `sanitizeItem` 丢弃非法物品 id;`itemName`/`updateHoldAnim` 防崩溃;
  `loadSlot` 读取异常不再挂起 promise;存档管理器位置显示防 `toFixed` 崩溃;playerPos/yaw/pitch/cameraMode 校验
- **死亡状态残留(P3)**:重生不再继承飞行状态;更新 `lastSafePos` 防止虚空救援回到坠落前危险位置
- **Shift 下蹲未实现(P3)**:地面按住 Shift 现在减速潜行(飞行下降不变)
- **FOV 设置从未生效(P3)**:设置面板新增视野(65/75/85/100)下拉,持久化并即时生效
- **昼夜时间不入存档(P3)**:存档记录新增 `dayTime`(含 `version` 字段),读档恢复当天时刻
- **隔墙开关门(P3)**:`raycastDoor` 增加固体遮挡检测
- **"重置世界(新地形)"名不副实(P3)**:`resetWorld` 现生成新随机种子(出生广场为确定性结构不受影响)
- **出生广场地形缺陷(P2,浏览器冒烟测试发现)**:出生点落在山地时天然山体穿透广场表面——
  广场范围内高于广场面的地形现在被平整清除;四角灯塔从 (±24,±24) 移入 (±18,±18)
  (原位置对角距离 33.9 > 广场圆半径 28,基座悬空);外围小山丘改为贴合各列天然地表高度,不再悬空

### 变更
- `settings.fov` / `settings.dayCycleSpeed` 等设置增加范围钳制与类型校验
- 工具/物品定义新增 `gem_iron`(铁锭),材料由 4 种增至 5 种
- `index.html` 脚本引入统一版本号(`?v=20260813b`)防缓存,设置面板新增 FOV 控件
- 单元测试更新至 33 项(沙砾配方用例 + 铁门/金门配方区分用例),ESLint 清零全部 12 个警告

### 移除
- 死代码:`findSafeSpawn`、`saveGame`、`lastSelectedBlock`、`holdItem`、`hasMesh`、
  `btn-load` 处理器、`raycastTarget` 未用变量、`updateDayNight` 未用变量等

### 新增
- **合成系统补全**:配方从 10 种扩至 **35 种** —— 新增木棍物品(木板纵向合成)与
  木棍+沙砾→箭的合理材料链;五档材质(木/石/铁/金/钻石)× 镐/斧/铲/剑共 20 种工具配方
  (统一 2×2 图案:镐`[材,材,材,棍]`/斧`[材,材,棍,∅]`/剑`[材,材,∅,棍]`/铲`[材,∅,棍,∅]`);
  3 木棍→弓、4 木板→木盾、木板+铁锭/钻石交错→铁盾/钻石盾;合成的工具自动注入满耐久
  (`performCraft` 注入,保持 craft.js 纯函数无 TOOL_TYPES 依赖);工具配方与门/建材图案互斥无歧义
- **浏览器端到端冒烟测试**(`test/smoke.cdp.mjs`,CDP 驱动 headless Chrome,可选开发工具):
  16 项断言覆盖触屏物理/门跨卸载持久化/树木跨区块标脏/农作物计时器/存档往返/
  损坏存档防御/FOV/死亡重生,可在本机 Chrome 上回归验证
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
