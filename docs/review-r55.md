# R55 代码审查与优化记录

> 日期：2026-10-18｜版本：v2.5.0｜范围：R55 全部新增/改动代码
> 方法：逐文件 diff 审查 + `npm test` / `npm run lint` + 20 套 CDP 实机回归 + 页面内微基准

## 一、结论

R55 的玩法结构成立，但首版存在 **1 个可重复崩溃、2 个读档副作用、4 个交互/状态正确性问题**。
本轮全部修复；单测 160/160、ESLint 0/0、R55 验收 22/22、既有套件全部通过（含 R44 端到端旅程 13/13）。

## 二、缺陷与修复

### Critical

**C1 `buildChunkMesh(null)` 每帧崩溃**
- 现象：存档往返/脏数据场景下 `animate → updateChunks → buildChunkMesh` 抛
  `TypeError: Cannot read properties of null (reading 'cx')`，每帧重复。
- 证据：R34 套件堆栈 `game-chunks.js:574 ← :801 ← game-render.js:171`。
- 原因：`dirtyChunks` 中混入 NaN/空 chunk（损坏门数据经 `ensureChunk(NaN,NaN)` 可生成幽灵区块），
  `best` 保持 null 仍被传入 `buildChunkMesh`。
- 修复：
  - `ensureChunk` 拒绝非有限坐标；
  - `buildChunkMesh` 入口判空/判有限；
  - `updateChunks` 构建前清理异常条目，`best` 为空则清空脏集退出；
  - `applySave` 门数据先校验 `x/y/z` 有限再 `ensureChunk`；
  - `setBlock` 对 `ensureChunk` 返回 null 做防御。

### Important

**I1 读档补发目标经验，篡改存档 XP**
- 现象：R47 S1/S5 存档往返后 XP 与入档值不一致。
- 原因：`applySave` 末尾 `updateGoalsHUD()` 会为“已完成但未领取”的目标发 5 XP。
- 修复：`updateGoalsHUD(noReward)`；读档传 `true`，只标记已领取、不发经验/不播报。

**I2 读档触发防抖自动保存**
- 现象：读档 3 秒后强制覆盖一次存档（旧档迁移时尤其明显）。
- 原因：`updateGoalsHUD` 内 `markDirtySave()` 排入 3 秒防抖定时器，而 `applySave` 只清 `saveDirty`。
- 修复：`markDirtySave` 仅在本次真正领取目标时调用；`applySave` 结束时 `clearTimeout(autosaveTimer)`。

**I3 未加载区块的信标被误删**
- 现象：走远后信标从 `beacons` 集合消失，回来不再发光。
- 原因：`getBlock` 对未加载区块返回 null，`updateBeaconAura` 把 null 当成“方块没了”。
- 修复：先查 `chunks.has(...)`，未加载则保留条目；仅已加载且方块非 beacon 时删除。

**I4 持镐/斧/铲时右键打不开箱子/熔炉/合成台**
- 现象：手持工具右键功能方块，只弹出“用于破坏方块”，交互被 `useTool` 截胡。
- 原因：`placeBlock` 的 `if (item.kind === 'tool') { useTool(); return; }` 位于方块交互分发之前。
- 修复：方块交互优先；无方块交互时才走 `useTool`（剑/弓/盾/钓鱼/穿甲）。
  准星提示同步：手持剑/弓时显示“左键攻击/射击”，但箱子等方块提示仍优先。

### Medium

**M1 行走统计把传送/飞行/重生计入**
- 修复：每帧记录上次位置，仅 `onGround && !isFlying` 时累加；重生/读档清空 `_lx/_lz`；
  存档不再写入瞬时 `_lx/_lz`。

**M2 受击方向指示左右/前后颠倒**
- 原因：屏幕指示环 0 弧度朝上，而玩家前方是 -z；`atan2(dx, dz)` 把前方映射到 180°。
- 修复：`atan2(dx, -dz)`；且仅 `combat/explosion` 更新方向，摔落/溺水不再显示怪物方向。

**M3 生存合成消耗材料后 `selectedType` 残留**
- 现象：合成消耗掉当前手持方块后，仍可放置旧方块。
- 修复：消耗后 `selectSlot(currentSlot)` 重置 `selectedType`。

**M4 地牢埋深规则放宽过度**
- 现象：`surf ≥ floor + 3` 时顶板（floor+4）可能露出地表，导致破口/漏水。
- 修复：恢复 `surf ≥ floor + 6`（顶板上至少 2 层岩层）；核心档仍限高山。

**M5 分层保底战利品覆盖随机战利品**
- 现象：核心箱保底钻石直接写 `slots[0]`，可能顶掉已 roll 的物品。
- 修复：`put()` 优先放入空槽，不覆盖随机产出。

**M6 无限世界生成侧登记表只增不减**
- 范围：`dungeonSpawns/dungeonLootSpots/vaultSpots/ancientGolemSpots/redstoneParts`。
- 修复：区块卸载时按 chunkKey 删除；重新加载时由 `generateChunkData` 重新登记。
- `villageTorches` 保留（相邻区块建 mesh 仍需读取，体量小）。

### Minor / 性能

- `updateStatusHUD` 从每帧写 DOM 改为 **10Hz 节流**；300 次调用 0.4ms → 0.2ms。
- 配方书 85 张卡改为 `DocumentFragment` 一次性挂载；10 次渲染 20.4ms → 18.6ms。
- 设置面板补上 README 宣称但缺失的 **FOV 65/75/85/100**；`settings.fov` 真正作用于第一人称。
- 帮助/提示修正：剑/弓左键语义、信标提示、宝库幂等（登记已开但方块仍在时允许重试）。

## 三、微基准（headless Chrome / SwiftShader，同机同场景）

| 项 | 修复前 | 修复后 | 阈值 |
|---|---|---|---|
| 区块生成 | 0.575 ms/块 | **0.267 ms/块** | ≤2 ms |
| HUD 更新 ×300 | 0.40 ms | **0.20 ms** | — |
| 目标 HUD ×50 | 0.40 ms | **0.30 ms** | — |
| 配方书渲染 ×10 | 20.4 ms | **18.6 ms** | — |

> 绝对值受 SwiftShader/JIT 影响；以同机前后对比为准。

## 四、回归结果

| 套件 | 结果 |
|---|---|
| `npm test` | **160/160** |
| `npm run lint` | **0 error / 0 warning** |
| `smoke` | 全部 PASS（含合成消耗真实材料） |
| r33 村民交易 | 19/19 |
| r34 成就 | 24/24 |
| r35 史莱姆/剪刀 | 12/12（重跑稳定） |
| r36 铁桶 / r37 地牢 / r38 红石 | 8/8 / 10/10 / 8/8 |
| r39 铁傀儡 / r40 蛋糕 / r41 建筑 | 11/11 / 10/10 / 9/9 |
| r42 活塞 / r43 打磨 | 8/8 / 7/7 |
| r44 端到端旅程 | **13/13** |
| r45 生存数值 | 19/19（R55 新基线） |
| r46 教程 / r47 存档 | 18/18 / 7/7 |
| r48 移动端 / r49 性能 | 9/9 / 7/7 |
| r50 收官 / r51 视觉 / r52 视角 | 9/9 / 12/12 / 18/18 |
| r55 生存地基 | **22/22** |

## 五、测试基线更新（均因 R55 有意改动）

- 合成必须持有真实材料：smoke / r44 / r48 改为先入栏/补材料。
- 小麦交易 18→12：r33 余量断言 2→8。
- 成就 23→29：r34/r50 动态总数；R55 新增 6 条由测试末段补齐。
- 饥饿 0.7/0.25→0.22/0.08：r45 A1/A2/G1 基线。
- 铁镐改为 3 铁锭+2 木棍：r44 不再使用已删除的“铁矿石配方”。
- 史莱姆第 4 夜解锁：r35 生成池测试设 `dayCount=4`。

## 六、剩余风险

- `buildChunkMesh` 的防御会吞掉 NaN chunk，属于兜底；门/存档数据现在入口校验，根因路径已收窄。
- r35 的史莱姆 AI/弹跳断言依赖随机地形，偶发波动；本轮连续两次通过，未改游戏逻辑。
- 配方书每张卡仍各建一个 canvas；85 条下 2ms/次可接受，超过 150 条时再考虑图标缓存。
- 下界/末地、酿造、多人等仍不在范围内（见 `roadmap-r55.md`）。
