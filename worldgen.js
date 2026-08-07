// ============================================================
// worldgen.js - 世界生成确定性函数(纯函数,无 DOM/Three.js 依赖)
// 可在 Node 测试和浏览器中共用。game.js 通过 <script> 加载后,这些函数在全局可用。
// ============================================================
(function (global) {
  'use strict';

  // 确定性哈希(基于 seed),返回 0..1
  function hash2(x, z, seed) {
    let h = (x * 374761393 + z * 668265263 + seed * 2147483647) >>> 0;
    h = (h ^ (h >>> 13)) * 1274126177 >>> 0;
    h = (h ^ (h >>> 16)) >>> 0;
    return h / 4294967296;
  }
  function hash3(x, y, z, seed) {
    let h = (x * 374761393 + y * 668265263 + z * 2147483647 + seed * 1013904223) >>> 0;
    h = (h ^ (h >>> 13)) * 1274126177 >>> 0;
    h = (h ^ (h >>> 16)) >>> 0;
    return h / 4294967296;
  }

  // 平滑值噪声(双线性插值)
  function valueNoise2D(x, z, seed) {
    const xi = Math.floor(x), zi = Math.floor(z);
    const xf = x - xi, zf = z - zi;
    const sx = xf * xf * (3 - 2 * xf);
    const sz = zf * zf * (3 - 2 * zf);
    const n00 = hash2(xi, zi, seed);
    const n10 = hash2(xi + 1, zi, seed);
    const n01 = hash2(xi, zi + 1, seed);
    const n11 = hash2(xi + 1, zi + 1, seed);
    const nx0 = n00 + (n10 - n00) * sx;
    const nx1 = n01 + (n11 - n01) * sx;
    return nx0 + (nx1 - nx0) * sz;
  }

  // 分形噪声(多倍频叠加)
  function fbm2D(x, z, seed, octaves) {
    octaves = octaves || 4;
    let v = 0, amp = 0.5, freq = 1, max = 0;
    for (let i = 0; i < octaves; i++) {
      v += valueNoise2D(x * freq, z * freq, seed + i * 101) * amp;
      max += amp; amp *= 0.5; freq *= 2;
    }
    return v / max;
  }

  // 生物群系定义
  const BIOMES = {
    plains:    { name: '平原', baseH: 16, amp: 3,  top: 'grass',  sub: 'dirt',  treeChance: 0.02 },
    forest:    { name: '森林', baseH: 16, amp: 4,  top: 'grass',  sub: 'dirt',  treeChance: 0.12 },
    desert:    { name: '沙漠', baseH: 15, amp: 2,  top: 'sand',   sub: 'sand',  treeChance: 0 },
    mountains: { name: '山地', baseH: 20, amp: 16, top: 'stone',  sub: 'stone', treeChance: 0.01 },
    snow:      { name: '雪原', baseH: 17, amp: 4,  top: 'snow',   sub: 'dirt',  treeChance: 0.04 },
    ocean:     { name: '海洋', baseH: 10, amp: 3,  top: 'sand',   sub: 'sand',  treeChance: 0 },
  };

  // 由世界坐标确定生物群系(温度+湿度+山地三层噪声)
  function biomeAt(wx, wz, seed, preMtn) {
    const temp = fbm2D(wx * 0.01 + 1000, wz * 0.01, seed + 7777, 3);
    const humid = fbm2D(wx * 0.012, wz * 0.012 + 500, seed + 3333, 3);
    const mtn = (preMtn !== undefined) ? preMtn : fbm2D(wx * 0.008, wz * 0.008, seed + 555, 4);
    if (mtn > 0.62) return 'mountains';
    if (temp < 0.32) return 'snow';
    if (temp > 0.62 && humid < 0.4) return 'desert';
    if (humid > 0.6) return 'forest';
    if (temp < 0.42 && humid < 0.38) return 'ocean';
    return 'plains';
  }

  // 由世界坐标确定地表高度(连续函数,无断层)
  function heightAt(wx, wz, seed, biome, preMtn) {
    const base = fbm2D(wx * 0.045, wz * 0.045, seed, 4);
    const mtn = (preMtn !== undefined) ? preMtn : fbm2D(wx * 0.008, wz * 0.008, seed + 555, 4);
    let h = 16 + (base - 0.5) * 6;
    if (mtn > 0.5) {
      const t = (mtn - 0.5) / 0.5;
      const lift = t * t * (3 - 2 * t);
      h += lift * 18;
      h += (base - 0.5) * 10 * lift;
    }
    const ocean = fbm2D(wx * 0.02 + 200, wz * 0.02 + 200, seed + 111, 3);
    if (ocean > 0.6) {
      const t = (ocean - 0.6) / 0.4;
      h -= t * 8;
    }
    return Math.max(2, Math.min(44, Math.floor(h)));
  }

  // 导出(Node 环境)
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { hash2, hash3, valueNoise2D, fbm2D, BIOMES, biomeAt, heightAt };
  }
  // 浏览器:挂到全局
  global.WORLDGEN = { hash2, hash3, valueNoise2D, fbm2D, BIOMES, biomeAt, heightAt };
  // 同时保持全局函数名(game.js 直接调用)
  global.hash2 = hash2;
  global.hash3 = hash3;
  global.valueNoise2D = valueNoise2D;
  global.fbm2D = fbm2D;
  global.BIOMES = BIOMES;
  global.biomeAt = biomeAt;
  global.heightAt = heightAt;

})(typeof window !== 'undefined' ? window : globalThis);
