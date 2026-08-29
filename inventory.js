// ============================================================
// inventory.js - 库存/掉落/饥饿核心逻辑(纯函数,无 DOM/Three.js 依赖)
// 从 game.js 提取:拾取堆叠、旧档归一化、饥饿状态机、食物表
// 可在 Node 测试和浏览器中共用。game.js 通过 <script> 加载后 INVLIB 可用。
// ============================================================
(function (global) {
  'use strict';

  const STACK_MAX = 64;   // 方块/材料最大堆叠数
  // 食物 → 恢复的饥饿值(右键进食)
  const FOODS = { porkchop: 8, apple: 4, cooked_porkchop: 12, beef: 6, mutton: 6, steak: 10 };
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

  // 导出(Node 环境)
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { STACK_MAX, FOODS, pickupIntoInventory, normalizeHotbar, hungerTick };
  }
  // 浏览器:挂到全局
  global.INVLIB = { STACK_MAX, FOODS, pickupIntoInventory, normalizeHotbar, hungerTick };

})(typeof window !== 'undefined' ? window : globalThis);
