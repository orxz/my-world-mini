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

  // 平滑值噪声(三线性插值;R24 洞穴生成用)
  function valueNoise3D(x, y, z, seed) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const xf = x - xi, yf = y - yi, zf = z - zi;
    const sx = xf * xf * (3 - 2 * xf);
    const sy = yf * yf * (3 - 2 * yf);
    const sz = zf * zf * (3 - 2 * zf);
    const c000 = hash3(xi, yi, zi, seed),         c100 = hash3(xi + 1, yi, zi, seed);
    const c010 = hash3(xi, yi + 1, zi, seed),     c110 = hash3(xi + 1, yi + 1, zi, seed);
    const c001 = hash3(xi, yi, zi + 1, seed),     c101 = hash3(xi + 1, yi, zi + 1, seed);
    const c011 = hash3(xi, yi + 1, zi + 1, seed), c111 = hash3(xi + 1, yi + 1, zi + 1, seed);
    const x00 = c000 + (c100 - c000) * sx;
    const x10 = c010 + (c110 - c010) * sx;
    const x01 = c001 + (c101 - c001) * sx;
    const x11 = c011 + (c111 - c011) * sx;
    const y0 = x00 + (x10 - x00) * sy;
    const y1 = x01 + (x11 - x01) * sy;
    return y0 + (y1 - y0) * sz;
  }

  // 洞穴判定(R24):两条脊状噪声交集 → 蜿蜒隧道(意大利面洞);深处奶酪大空腔
  // y 限 2..38(不碰基岩与浅表);确定性(同种子同坐标永远一致)
  function caveAt(wx, y, wz, seed) {
    if (y < 2 || y > 38) return false;
    const n1 = valueNoise3D(wx * 0.055, y * 0.09, wz * 0.055, seed + 4451);
    if (Math.abs(n1 - 0.5) >= 0.043) return false;   // 早退:大多数格子只算一次噪声
    const n2 = valueNoise3D(wx * 0.055, y * 0.09, wz * 0.055, seed + 8892);
    if (Math.abs(n2 - 0.5) < 0.047) return true;
    if (y < 20) {
      const n3 = valueNoise3D(wx * 0.042, y * 0.07, wz * 0.042, seed + 9313);
      if (n3 > 0.805) return true;
    }
    return false;
  }

  // ---- 村庄小屋(R31):确定性生成侧结构(平原,零存档 diff) ----
  const VILLAGE_CELL = 48;   // 村格边长(格内 12..36 放 5×5 小屋,不跨格)
  // 村格判定:~50% 格子有小屋;广场保护区(中心 ±40)不生成;
  // 仅平原/森林且中心四角高度平坦(差 ≤1)、离水面足够高
  function villageInCell(vcx, vcz, seed) {
    if (hash2(vcx, vcz, seed + 626) > 0.5) return null;
    const ox = 12 + Math.floor(hash2(vcx, vcz, seed + 627) * (VILLAGE_CELL - 24));
    const oz = 12 + Math.floor(hash2(vcx, vcz, seed + 628) * (VILLAGE_CELL - 24));
    const cx = vcx * VILLAGE_CELL + ox, cz = vcz * VILLAGE_CELL + oz;
    if (cx > -40 && cx < 40 && cz > -40 && cz < 40) return null;   // 出生广场保护区
    const mtn = fbm2D(cx * 0.008, cz * 0.008, seed + 555, 4);
    const biome = biomeAt(cx, cz, seed, mtn);
    if (biome !== 'plains' && biome !== 'forest') return null;
    const base = heightAt(cx, cz, seed, biome, mtn);
    if (base < 15) return null;   // 别泡水
    for (const [dx, dz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) {
      if (Math.abs(heightAt(cx + dx, cz + dz, seed, biome, mtn) - base) > 1) return null;
    }
    return { cx, cz, base };
  }
  // 小屋局部方块(5×5,lx/lz ∈ 0..4;rel = y - base):
  // 0=地基周圈 1=地板 2-4=墙(门洞/窗/火把/箱子)5=屋顶
  function hutBlockAt(lx, lz, rel) {
    if (rel === 5) return 'wood';                     // 屋顶(原木,与木板墙区分)
    if (rel === 0) return (lx === 0 || lx === 4 || lz === 0 || lz === 4) ? 'planks' : null;   // 地基
    if (rel === 1) return 'planks';                   // 地板整层
    if (rel >= 2 && rel <= 4) {
      const per = lx === 0 || lx === 4 || lz === 0 || lz === 4;
      if (per) {
        if (lz === 0 && lx === 2 && rel <= 3) return null;   // 门洞(前面板 z=0,2 格高)
        if (rel === 3 && ((lx === 2 && lz === 4) || (lz === 2 && (lx === 0 || lx === 4)))) return 'glass';   // 三面窗
        return 'planks';
      }
      if (rel === 2) {
        if (lx === 2 && lz === 2) return 'torch';     // 屋内火把(照亮)
        if (lx === 3 && lz === 3) return 'chest';     // 角落箱子(惰性内容)
      }
      return null;   // 室内空气
    }
    return null;
  }

  // 导出(Node 环境)
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { hash2, hash3, valueNoise2D, valueNoise3D, fbm2D, BIOMES, biomeAt, heightAt, caveAt, villageInCell, hutBlockAt };
  }
  // 浏览器:挂到全局
  global.WORLDGEN = { hash2, hash3, valueNoise2D, valueNoise3D, fbm2D, BIOMES, biomeAt, heightAt, caveAt, villageInCell, hutBlockAt };
  // 同时保持全局函数名(game.js 直接调用)
  global.hash2 = hash2;
  global.hash3 = hash3;
  global.valueNoise2D = valueNoise2D;
  global.valueNoise3D = valueNoise3D;
  global.fbm2D = fbm2D;
  global.BIOMES = BIOMES;
  global.biomeAt = biomeAt;
  global.heightAt = heightAt;
  global.caveAt = caveAt;
  global.villageInCell = villageInCell;
  global.hutBlockAt = hutBlockAt;

})(typeof window !== 'undefined' ? window : globalThis);
