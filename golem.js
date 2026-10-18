// ============================================================
// golem.js - 铁傀儡召唤结构判定(纯函数,无 DOM/Three.js 依赖)
// 还原原版 Minecraft:
//   4 块铁块摆成 T 形,雕刻南瓜/南瓜灯放在 T 的缺口(竖杆的反方向),
//   南瓜必须最后放置;T 形"双臂"的上下共 4 格必须是空气。
//   朝向不限 —— 正立 / 倒立 / 平躺都算。
//
//     [南瓜]        ← head
//  [铁][铁][铁]     ← 横杠 3 块
//     [铁]         ← 竖杆
//
// Node 可 require,浏览器 <script> 加载后挂到全局(golemTAt)。
// ============================================================
(function (global) {
  'use strict';

  const HEAD_BLOCKS = ['carved_pumpkin', 'pumpkin_lantern'];
  const DIRS6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  const AXES3 = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

  // getBlock(x, y, z) → 方块 id 字符串(空气为 null)
  // (x, y, z) = 南瓜所在格。命中返回:
  //   { iron: [[x,y,z] × 4], head: [x,y,z], center: [x,y,z] }
  // 否则 null。center 是横杠中块,铁傀儡在它这格生成。
  function golemTAt(getBlock, x, y, z) {
    if (!HEAD_BLOCKS.includes(getBlock(x, y, z))) return null;
    for (const d of DIRS6) {
      // d 从南瓜指向横杠中块;竖杆在更远处(南瓜的反方向)
      const c = [x + d[0], y + d[1], z + d[2]];
      if (getBlock(c[0], c[1], c[2]) !== 'iron_block') continue;
      const stem = [c[0] + d[0], c[1] + d[1], c[2] + d[2]];
      if (getBlock(stem[0], stem[1], stem[2]) !== 'iron_block') continue;
      for (const bar of AXES3) {
        if (bar[0] * d[0] + bar[1] * d[1] + bar[2] * d[2] !== 0) continue;
        const b1 = [c[0] + bar[0], c[1] + bar[1], c[2] + bar[2]];
        const b2 = [c[0] - bar[0], c[1] - bar[1], c[2] - bar[2]];
        if (getBlock(b1[0], b1[1], b1[2]) !== 'iron_block') continue;
        if (getBlock(b2[0], b2[1], b2[2]) !== 'iron_block') continue;
        // 双臂上下 4 格必须为空气(原版结构要求,防止贴着别的方块误判)
        const armsClear = [b1, b2].every((b) =>
          getBlock(b[0] + d[0], b[1] + d[1], b[2] + d[2]) === null &&
          getBlock(b[0] - d[0], b[1] - d[1], b[2] - d[2]) === null);
        if (!armsClear) continue;
        return { iron: [c, stem, b1, b2], head: [x, y, z], center: c };
      }
    }
    return null;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { golemTAt, GOLEM_HEAD_BLOCKS: HEAD_BLOCKS };
  }
  global.golemTAt = golemTAt;

})(typeof window !== 'undefined' ? window : globalThis);
