// ============================================================
// balance.js - 数值单一来源(纯数据 + 派生函数,无 DOM/Three.js 依赖)
// R55:把散落在 8 个文件里的可调数值集中到一处;单测锁定派生值。
// 加载顺序:必须在 game-defs.js / craft.js / inventory.js 之前。
// ============================================================
(function (global) {
  'use strict';

  const BALANCE = {
    // 世界
    world: { height: 48, seaLevel: 14, chunkSize: 16, renderDistance: 5 },
    // 昼夜(秒/整轮)
    day: { cycle: 480, options: [240, 480, 900], defaultTime: 0.3 },
    // 饥饿:速率单位 = 饥饿点/秒;4 单位消耗 1 点见 INVLIB.HUNGER_DRAIN_PER_POINT
    hunger: {
      drainIdle: 0.08, drainWalk: 0.22, drainSprint: 0.55,
      lowWarn: 6, regenThreshold: 18, regenInterval: 4, regenCost: 0.5,
    },
    // 玩家移动
    player: {
      height: 1.8, radius: 0.3, gravity: 26, jump: 9,
      walk: 5.5, sprint: 7.7, sneak: 1.9, fly: 9,
      swimSpeed: 3.2, swimUp: 5.2, sinkMax: 4,
      sprintFov: 6, sprintMinHunger: 6, maxHP: 20, breath: 20,
      sneakEyeOffset: -0.3,
    },
    // 坠落:安全 3 格,每格 0.9 伤,上限 20
    fall: { safeBlocks: 3, perBlock: 0.9, maxDamage: 20 },
    // 战斗
    combat: {
      cooldown: { sword: 0.45, axe: 0.55, other: 0.30, hand: 0.30 },
      invuln: 0.30, critMultiplier: 1.5, critVelocity: -3,
    },
    // 怪物
    mobs: {
      capBase: 2, capPerDay: 2, capMax: 10,
      spawnInterval: 5, caveCap: 4, caveChance: 0.35,
      villageGolemHeal: 25,
    },
    // 经验/附魔
    xp: { base: 10, perLevel: 5, enchantCosts: [2, 4, 6] },
    // 工具层级:木1 石2 金2 铁3 钻4;方块层级见 game-defs.js tier
    tools: { tiers: { wood: 1, stone: 2, gold: 2, iron: 3, diamond: 4 } },
    // 结构
    dungeon: { cell: 64, chance: 0.42, shallow: [8, 12], deep: [16, 22], core: [24, 30] },
  };

  const HUNGER_DRAIN_PER_POINT = 4;   // 与 inventory.js 保持一致

  // 满饥饿条在给定速率下耗尽所需秒数
  function timeToStarve(rate, maxHunger) {
    const mh = (maxHunger === undefined) ? 20 : maxHunger;
    if (!Number.isFinite(rate) || rate <= 0) return Infinity;
    return (mh * HUNGER_DRAIN_PER_POINT) / rate;
  }

  // 坠落伤害:h 为下落格数(可由落地速度换算),安全高度内 0,上限 20
  function fallDamage(height) {
    if (!Number.isFinite(height) || height <= BALANCE.fall.safeBlocks) return 0;
    return Math.min(BALANCE.fall.maxDamage, Math.floor((height - BALANCE.fall.safeBlocks) * BALANCE.fall.perBlock));
  }

  // 由落地速度换算下落高度(等价 h = v^2 / 2g)
  function fallHeightFromVelocity(vy) {
    if (!Number.isFinite(vy) || vy >= 0) return 0;
    return (vy * vy) / (2 * BALANCE.player.gravity);
  }

  function attackDps(damage, cooldown) {
    if (!Number.isFinite(damage) || !Number.isFinite(cooldown) || cooldown <= 0) return 0;
    return damage / cooldown;
  }

  function nightCap(day) {
    const d = Math.max(1, Math.floor(day) || 1);
    return Math.min(BALANCE.mobs.capMax, BALANCE.mobs.capBase + BALANCE.mobs.capPerDay * d);
  }

  function xpToNext(level) {
    const l = Math.max(0, Math.floor(level) || 0);
    return BALANCE.xp.base + BALANCE.xp.perLevel * l;
  }

  function enchantCost(level) {
    const i = Math.max(1, Math.min(3, Math.floor(level) || 1)) - 1;
    return BALANCE.xp.enchantCosts[i];
  }

  // 工具是否达到方块层级(与 craft.js canHarvest 同一规则,供 UI/测试复用)
  function meetsTier(toolTier, blockTier) {
    return (Math.max(0, toolTier | 0)) >= (Math.max(0, blockTier | 0));
  }

  const API = { BALANCE, timeToStarve, fallDamage, fallHeightFromVelocity, attackDps, nightCap, xpToNext, enchantCost, meetsTier };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  global.BALANCE = BALANCE;
  global.BALANCE_LIB = API;
})(typeof window !== 'undefined' ? window : globalThis);
