// ============================================================
// inventory.js - 库存/掉落/饥饿核心逻辑(纯函数,无 DOM/Three.js 依赖)
// 从 game.js 提取:拾取堆叠、旧档归一化、饥饿状态机、食物表
// 可在 Node 测试和浏览器中共用。game.js 通过 <script> 加载后 INVLIB 可用。
// ============================================================
(function (global) {
  'use strict';

  const STACK_MAX = 64;   // 方块/材料最大堆叠数
  // 食物 → 恢复的饥饿值(右键进食)
  const FOODS = { porkchop: 8, apple: 4, cooked_porkchop: 12, beef: 6, mutton: 6, steak: 10, bread: 5, raw_fish: 5, cooked_fish: 9 };
  // 护甲减伤(经典):每点护甲 4% 减伤,上限 20 点(钻石全套)= 80%
  const ARMOR_MAX_POINTS = 20;
  const ARMOR_PCT_PER_POINT = 0.04;
  // 饥饿参数
  const HUNGER_DRAIN_PER_POINT = 4;  // 消耗累计 4 单位 → 扣 1 点饥饿
  const HUNGER_REGEN_LEVEL = 18;     // 饥饿 ≥18 缓慢回血
  const HUNGER_TICK = 4;             // 回血/饥饿伤害间隔(秒)

  // 拾取入栏:优先叠加同 kind+id 未满格,其次放入空格;工具不堆叠(带耐久进空格)
  // 就地修改 hotbar 数组;返回吸收数量(0=快捷栏全满,物品留在地上)
  // opts.durability 掉落物携带的耐久;opts.defaultDurability 工具表默认耐久
  function pickupIntoInventory(hotbar, kind, id, count, opts) {
    opts = opts || {};
    const stackMax = opts.stackMax || STACK_MAX;
    let left = count;
    if (kind === 'tool') {
      // 工具不堆叠:逐个进空格,保留耐久
      for (let i = 0; i < hotbar.length && left > 0; i++) {
        if (!hotbar[i]) {
          hotbar[i] = {
            kind, id,
            durability: (opts.durability !== undefined ? opts.durability : opts.defaultDurability),
          };
          left -= 1;
        }
      }
      return count - left;
    }
    for (let i = 0; i < hotbar.length && left > 0; i++) {
      const it = hotbar[i];
      if (it && it.kind === kind && it.id === id && (it.count || 1) < stackMax) {
        const take = Math.min(stackMax - (it.count || 1), left);
        it.count = (it.count || 1) + take;
        left -= take;
      }
    }
    for (let i = 0; i < hotbar.length && left > 0; i++) {
      if (!hotbar[i]) {
        const put = Math.min(stackMax, left);
        hotbar[i] = { kind, id, count: put };
        left -= put;
      }
    }
    return count - left;
  }

  // 旧档归一化:方块/材料格无数量字段(创造时代数据)时补满一组;返回修正格数
  function normalizeHotbar(hotbar, stackMax) {
    stackMax = stackMax || STACK_MAX;
    let fixed = 0;
    for (const it of hotbar) {
      if (it && it.kind !== 'tool' && (it.count === undefined || it.count === null)) {
        it.count = stackMax;
        fixed++;
      }
    }
    return fixed;
  }

  // 饥饿状态机(每帧推进):state = {hunger(0..20), drain, regenT, starveT}
  // activityRate = 消耗倍率(静止 0.45 / 移动 1.2;飞行折算由调用方处理)
  // canRegen = HP 未满时才回血;返回 {hungerChanged, regen, starve}
  // (regen/starve 由游戏层应用:直接 +HP / 走 damagePlayer)
  function hungerTick(state, dt, activityRate, canRegen) {
    state.drain += dt * activityRate;
    let hungerChanged = false;
    if (state.drain >= HUNGER_DRAIN_PER_POINT) {
      state.drain -= HUNGER_DRAIN_PER_POINT;
      if (state.hunger > 0) { state.hunger--; hungerChanged = true; }
    }
    let regen = false;
    if (state.hunger >= HUNGER_REGEN_LEVEL && canRegen) {
      state.regenT += dt;
      if (state.regenT >= HUNGER_TICK) { state.regenT -= HUNGER_TICK; regen = true; }
    } else {
      state.regenT = 0;
    }
    let starve = false;
    if (state.hunger <= 0) {
      state.starveT += dt;
      if (state.starveT >= HUNGER_TICK) { state.starveT -= HUNGER_TICK; starve = true; }
    } else {
      state.starveT = 0;
    }
    return { hungerChanged, regen, starve };
  }

  // 护甲减伤:damage 原始伤害,points 装备护甲总点数
  // 返回实际伤害(0 点 = 原伤害取整;减伤后至少 1;非法输入返回 0)
  function armorReduce(damage, points) {
    if (!Number.isFinite(damage) || damage <= 0) return 0;
    const p = Math.max(0, Math.min(ARMOR_MAX_POINTS, Math.round(points) || 0));
    if (p === 0) return Math.round(damage);
    return Math.max(1, Math.round(damage * (1 - p * ARMOR_PCT_PER_POINT)));
  }

  // ---- 村民交易(R33):经典绿宝石经济,物品均为可堆叠 item(无工具) ----
  // 卖(物资 → 绿宝石)前 4 条,买(绿宝石 → 物资)后 3 条;数值取经典区间中位
  const VILLAGER_TRADES = [
    { give: { id: 'wheat',        n: 18 }, get: { id: 'gem_emerald', n: 1 } },   // 农夫:小麦
    { give: { id: 'coal',         n: 15 }, get: { id: 'gem_emerald', n: 1 } },   // 屠夫系:煤炭
    { give: { id: 'raw_fish',     n: 6  }, get: { id: 'gem_emerald', n: 1 } },   // 渔夫:生鱼
    { give: { id: 'leather',      n: 8  }, get: { id: 'gem_emerald', n: 1 } },   // 皮匠:皮革
    { give: { id: 'gem_emerald',  n: 1  }, get: { id: 'bread',        n: 4 } },   // 农夫卖面包
    { give: { id: 'gem_emerald',  n: 2  }, get: { id: 'arrow',        n: 12 } },  // 制箭匠
    { give: { id: 'gem_emerald',  n: 2  }, get: { id: 'cooked_porkchop', n: 5 } }, // 屠夫卖熟猪排
  ];
  // 数快捷栏内某 id 的总数(跨堆叠;工具格 count 视为 1 不参与交易)
  function countInHotbar(hotbar, id) {
    let n = 0;
    for (const it of hotbar) {
      if (it && it.id === id && it.kind !== 'tool') n += it.count || 1;
    }
    return n;
  }
  // 从快捷栏跨格消耗 n 个 id(调用方需先用 countInHotbar 保证足量)
  // 用尽清格;返回实际消耗数(不足时消耗到 0)
  function consumeFromHotbar(hotbar, id, n) {
    let left = n;
    for (let i = 0; i < hotbar.length && left > 0; i++) {
      const it = hotbar[i];
      if (it && it.id === id && it.kind !== 'tool') {
        const take = Math.min(it.count || 1, left);
        it.count = (it.count || 1) - take;
        left -= take;
        if (it.count <= 0) hotbar[i] = null;
      }
    }
    return n - left;
  }
  // 交易可行性:支付物足量(canTrade 不判断收入空间,满栏由游戏层兜底掉落)
  function canTrade(hotbar, trade) {
    return !!trade && countInHotbar(hotbar, trade.give.id) >= trade.give.n;
  }

  // 导出(Node 环境)
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { STACK_MAX, FOODS, ARMOR_MAX_POINTS, ARMOR_PCT_PER_POINT, armorReduce, pickupIntoInventory, normalizeHotbar, hungerTick, VILLAGER_TRADES, countInHotbar, consumeFromHotbar, canTrade };
  }
  // 浏览器:挂到全局
  global.INVLIB = { STACK_MAX, FOODS, ARMOR_MAX_POINTS, ARMOR_PCT_PER_POINT, armorReduce, pickupIntoInventory, normalizeHotbar, hungerTick, VILLAGER_TRADES, countInHotbar, consumeFromHotbar, canTrade };

})(typeof window !== 'undefined' ? window : globalThis);
