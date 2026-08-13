# worldgen.js — 世界生成模块 API

`worldgen.js` 是**确定性世界生成的纯函数层**:不依赖 DOM / Three.js,
可在浏览器(`game.js` 经 `<script>` 直引)和 Node(`test/unit.test.js` 经 `require`)中复用。

> 测试见 [`../test/unit.test.js`](../test/unit.test.js)(worldgen 部分 17 项;另有 craft 合成/破坏部分)。整体架构见 [`architecture.md`](./architecture.md)。

## 设计要点:确定性

所有函数以 `seed` 为参数,保证 **同 seed + 同坐标 → 永远同结果**。
这是"近似无限世界只需存种子 + 玩家改动 diff"的基础:区块卸载后重新生成,结果完全一致。

## 加载方式(UMD)

```js
// 浏览器(game.js 直接调用全局函数)
hash2(10, 20, 999);          // 或 window.WORLDGEN.hash2(...)
biomeAt(50, 50, 12345);

// Node(单测)
const { hash2, hash3, valueNoise2D, fbm2D, BIOMES, biomeAt, heightAt } = require('../worldgen.js');
```

---

## 哈希函数

### `hash2(x, z, seed) → number` (0..1)

整数坐标 → [0, 1] 的确定性哈希。基于 `x*374761393 + z*668265263 + seed*2147483647` 的位混淆。

| 参数 | 类型 | 说明 |
|---|---|---|
| `x`, `z` | number | 整数坐标(浮点会被 `Math.floor` 处理于噪声层) |
| `seed` | number | 世界种子 |

```js
hash2(10, 20, 999);          // 例如 0.5234...
hash2(10, 20, 999) === hash2(10, 20, 999);  // true,确定性
```

### `hash3(x, y, z, seed) → number` (0..1)

三维版本,加入 `y`。用于需要立体确定性的场景(如矿石/植被散布)。

---

## 噪声函数

### `valueNoise2D(x, z, seed) → number` (0..1)

平滑值噪声。对整数格点用 `hash2` 取值,再用平滑步长(`s = t*t*(3-2t)`)做双线性插值,
消除块状感。

```js
valueNoise2D(3.2, 7.8, 1);   // 0..1,连续平滑
```

### `fbm2D(x, z, seed, octaves?) → number` (0..1)

分形布朗运动:多倍频 `valueNoise2D` 叠加(默认 4 个 octaves),频率倍增、振幅减半,
产生自然的多尺度细节(大地形 + 细节起伏)。

| 参数 | 默认 | 说明 |
|---|---|---|
| `octaves` | 4 | 倍频数,越大细节越多、越贵 |

```js
fbm2D(10, 20, 999, 4);
```

---

## 生物群系

### `BIOMES` (常量表)

6 种群系定义。`game.js` 据此选择表层/次层方块与植被概率。

| biome | 名称 | baseH | amp | top | sub | treeChance |
|---|---|---|---|---|---|---|
| `plains` | 平原 | 16 | 3 | grass | dirt | 0.02 |
| `forest` | 森林 | 16 | 4 | grass | dirt | 0.12 |
| `desert` | 沙漠 | 15 | 2 | sand | sand | 0 |
| `mountains` | 山地 | 20 | 16 | stone | stone | 0.01 |
| `snow` | 雪原 | 17 | 4 | snow | dirt | 0.04 |
| `ocean` | 海洋 | 10 | 3 | sand | sand | 0 |

### `biomeAt(wx, wz, seed, preMtn?) → string`

由世界坐标判定群系。基于**温度 + 湿度 + 山地**三层独立 fbm 噪声组合判定:

```
mtn > 0.62            → mountains
temp < 0.32           → snow
temp > 0.62 & humid<0.4 → desert
humid > 0.6           → forest
temp<0.42 & humid<0.38 → ocean
else                  → plains
```

| 参数 | 类型 | 说明 |
|---|---|---|
| `wx`, `wz` | number | 世界坐标(整数) |
| `seed` | number | 世界种子 |
| `preMtn` | number? | 可选,预计算的山地噪声值,避免 `biomeAt`+`heightAt` 重复算 |

返回 `BIOMES` 的某个 key(`plains`/`forest`/`desert`/`mountains`/`snow`/`ocean`)。

```js
biomeAt(50, 50, 999);
// 性能优化:biomeAt 与 heightAt 共用 mtn,先算一次传入二者
const mtn = fbm2D(50*0.008, 50*0.008, 999+555, 4);
biomeAt(50, 50, 999, mtn);
heightAt(50, 50, 999, biomeAt(50,50,999,mtn), mtn);
```

---

## 地形高度

### `heightAt(wx, wz, seed, biome, preMtn?) → number` (2..44)

由世界坐标 + 群系确定地表高度(方块层数)。**连续函数,无断层**(相邻列高度差有限)。

逻辑概要:
- 基础高度 `16 + (baseNoise - 0.5) * 6`
- 山地抬升:`mtn > 0.5` 时按平滑曲线叠加最多 +18(并叠加细节)
- 海洋下凹:独立噪声 `> 0.6` 时最多 -8
- 夹取到 `[2, 44]`

| 参数 | 类型 | 说明 |
|---|---|---|
| `wx`, `wz` | number | 世界坐标 |
| `seed` | number | 世界种子 |
| `biome` | string | `biomeAt` 的返回值(由调用方先算) |
| `preMtn` | number? | 预计算山地噪声(与 `biomeAt` 共用,省一次 fbm) |

```js
const h = heightAt(30, 30, 555, 'plains');  // 例如 18
```

> 注:`biome` 由调用方传入而非内部再算,是为了让 `game.js` 在生成一列方块时
> 只算一次群系、复用于选表层方块与高度。

---

## 测试覆盖对照

| 被测函数 | 测试要点 |
|---|---|
| `hash2` / `hash3` | 返回 0..1、确定性 |
| `valueNoise2D` / `fbm2D` | 返回 0..1、确定性 |
| `biomeAt` | 返回有效群系 key、确定性、接受预计算 mtn、多种群系都出现 |
| `heightAt` | 返回 2..44、确定性、接受预计算 mtn、相邻列无断层(差≤6) |
| 存档序列化 | modifications Map 序列化/反序列化一致、记录结构完整、`seed=0` 正确保留 |

运行:`npm test`
