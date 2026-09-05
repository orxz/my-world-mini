// ============================================================
// machines.js - 状态机纯函数模块(无 DOM/Three.js 依赖,R25 治理轮提取)
// 从 game.js 提取:教程推进(TUTORIAL_STEPS/advanceTutorial)、熔炉
// (SMELT/FUELS/furnaceTick)、天气(weatherNext)、存档 schema 校验
// 可在 Node 测试和浏览器中共用。game.js 通过 <script> 加载后 MACHINES 可用。
// ============================================================
(function (global) {
  'use strict';

  // ---- 新手教程(分步引导;完成自动检测。R17-R19 的步骤定义,单一数据源) ----
  const TUTORIAL_STEPS = [
    { id: 'welcome', title: '👋 欢迎来到我的世界!', desc: '这是一个体素沙盒世界:挖矿、合成、建造、生存。跟着教程学会基本操作吧!(点下方「跳过教程」可随时跳过;教程期间夜晚不会刷怪,放心学)', goal: null },
    { id: 'move',   title: '① 移动', desc: '按 W/A/S/D 键走动起来', goal: { type: 'move', n: 8 } },
    { id: 'look',   title: '② 环顾四周', desc: '移动鼠标转动视角观察世界(转约半圈即可)', goal: { type: 'look', n: 2.5 } },
    { id: 'break',  title: '③ 挖掘方块', desc: '对准方块按住左键(出现裂纹进度条,现在可以长按连挖),破坏 3 个', goal: { type: 'break', n: 3 } },
    { id: 'pickup', title: '④ 拾取掉落物', desc: '走近地上旋转的小方块,自动拾取 2 个', goal: { type: 'pickup', n: 2 } },
    { id: 'place',  title: '⑤ 放置方块', desc: '手持方块对准地面按右键放置,放 2 个', goal: { type: 'place', n: 2 } },
    { id: 'slot',   title: '⑥ 切换快捷栏', desc: '按数字键 1-9 或滚轮切换手持物品,切换 2 次', goal: { type: 'slot', n: 2 } },
    { id: 'inventory', title: '⑦ 背包与合成', desc: '按 E 打开背包 —— 上方是物品目录(点击发放 ×64),下方有 2×2 合成格(试试 1 木头→4 木板)', goal: { type: 'inventory', n: 1 } },
    { id: 'survival1', title: '💡 生存须知(上)', desc: '夜晚会刷新僵尸/骷髅/苦力怕,白天它们会燃烧 —— 入夜前砍树做一张床(3 羊毛+3 木板),右键睡觉跳到早晨并设重生点;怪物太近时睡不了。', goal: null },
    { id: 'survival2', title: '💡 生存须知(下)', desc: '发展链:挖圆石→合成台(4 木板)→熔炉(8 圆石,烧铁锭/玻璃/熟肉);猪排烤熟回饥饿更多。按 Q 丢弃;死亡会掉落全部物品,回原地可拾回。', goal: null },
    { id: 'done',   title: '🎓 教程完成!', desc: '背包(E)里有全部物品目录随时取用;暂停菜单(Esc)→「操作说明」有完整手册。祝玩得开心!', goal: null },
  ];

  // 教程推进(就地修改 state:{active, step, progress};返回 'step'|'progress'|'none')
  // 不变量(R20 Critical 回归防线):step 永不超出 [0, length-1] —— 完成卡之后的
  // 结束由游戏层 renderTutorialCard 无步骤分支兜底 endTutorial
  function advanceTutorial(state, type, n) {
    if (!state.active) return 'none';
    const s = TUTORIAL_STEPS[state.step];
    if (!s || !s.goal || s.goal.type !== type) return 'none';
    state.progress[type] = (state.progress[type] || 0) + n;
    if (state.progress[type] >= s.goal.n) {
      state.step++;
      if (state.step > TUTORIAL_STEPS.length - 1) state.step = TUTORIAL_STEPS.length - 1;
      return 'step';
    }
    return 'progress';
  }

  // ---- 熔炉(经典:火点燃后烧完、5 秒/产物、中断进度归零) ----
  const COOK_TIME = 5;   // 每个产物冶炼秒数
  const SMELT = {
    iron_ore: { kind: 'item', id: 'iron_ingot' },
    sand: { kind: 'block', id: 'glass' },
    cobblestone: { kind: 'block', id: 'stone' },
    porkchop: { kind: 'item', id: 'cooked_porkchop' },
    beef: { kind: 'item', id: 'steak' },
    raw_fish: { kind: 'item', id: 'cooked_fish' },
  };
  const FUELS = { coal: 8, wood: 1.5, planks: 1.5, stick: 0.5 };   // 单位:可产能物个数

  function furnaceCanSmelt(f) {
    if (!f.input || !SMELT[f.input.id]) return false;
    const res = SMELT[f.input.id];
    if (f.output && (f.output.kind !== res.kind || f.output.id !== res.id || (f.output.count || 1) >= 64)) return false;
    return true;
  }

  // 熔炉状态机(就地修改 f:{input,fuel,output,burnT,burnMax,cookT});返回是否发生变化
  function furnaceTick(f, dt) {
    let changed = false;
    const can = furnaceCanSmelt(f);
    if (f.burnT > 0) f.burnT -= dt;
    // 火灭了且还能烧:消耗 1 个燃料点燃(经典:点燃后烧完)
    if (f.burnT <= 0 && can && f.fuel && FUELS[f.fuel.id]) {
      f.burnMax = f.burnT = FUELS[f.fuel.id] * COOK_TIME;
      f.fuel.count = (f.fuel.count || 1) - 1;
      if (f.fuel.count <= 0) f.fuel = null;
      changed = true;
    }
    if (f.burnT > 0 && can) {
      f.cookT += dt;
      if (f.cookT >= COOK_TIME) {
        f.cookT = 0;
        const res = SMELT[f.input.id];
        f.input.count = (f.input.count || 1) - 1;
        if (f.input.count <= 0) f.input = null;
        if (f.output) f.output.count = (f.output.count || 1) + 1;
        else f.output = { kind: res.kind, id: res.id, count: 1 };
        changed = true;
      }
    } else if (f.cookT > 0) {
      f.cookT = 0;   // 中断(没料/没火):进度归零
      changed = true;
    }
    return changed;
  }

  // ---- 天气(经典随机晴雨:晴天 120~240s 到期 roll 30% 下雨;雨 45~90s) ----
  // 纯函数:rand 注入;返回新状态 {weather, timer, changed}
  function weatherNext(weather, timer, dt, rand) {
    timer -= dt;
    if (timer > 0) return { weather, timer, changed: false };
    if (weather === 'clear') {
      if (rand() < 0.3) return { weather: 'rain', timer: 45 + rand() * 45, changed: true };
      return { weather: 'clear', timer: 120 + rand() * 120, changed: false };
    }
    return { weather: 'clear', timer: 120 + rand() * 120, changed: true };
  }

  // ---- 矿车轨道寻路(R26):给定四向邻居是否有轨与当前方向,决定下一格方向 ----
  // 优先直行;不能直行则转向任一「非回头」连接向(经典弯道);仅剩回头向才折返;
  // 无连接返回 null(到头停住)
  function cartNextDir(hasXPos, hasXNeg, hasZPos, hasZNeg, dx, dz) {
    if (dx !== 0 && ((dx > 0 && hasXPos) || (dx < 0 && hasXNeg))) return [dx, 0];
    if (dz !== 0 && ((dz > 0 && hasZPos) || (dz < 0 && hasZNeg))) return [0, dz];
    const opts = [];
    if (hasXPos) opts.push([1, 0]);
    if (hasXNeg) opts.push([-1, 0]);
    if (hasZPos) opts.push([0, 1]);
    if (hasZNeg) opts.push([0, -1]);
    if (!opts.length) return null;
    const ahead = opts.filter(o => !(dx !== 0 && o[0] === -dx) && !(dz !== 0 && o[1] === -dz));
    return (ahead.length ? ahead : opts)[0];
  }

  // ---- 经验系统(R28):等级/进度;升级阈值随等级递增(纯函数可单测) ----
  function xpToNext(level) { return 8 + level * 4; }
  // 就地修改 state:{level, points};返回本次升了几级
  function xpGain(state, amount) {
    state.points += amount;
    let gained = 0;
    while (state.points >= xpToNext(state.level)) {
      state.points -= xpToNext(state.level);
      state.level++;
      gained++;
      if (gained > 1000) break;   // 防御
    }
    return gained;
  }

  // ---- 附魔(R28):类型池按物品类别;随机 3 个选项(等级=消耗经验等级) ----
  const ENCHANT_NAMES = { sharpness: '锋利', efficiency: '效率', protection: '保护', unbreaking: '耐久', power: '力量' };
  const ENCHANT_POOL = {
    sword: ['sharpness', 'unbreaking'],
    axe: ['sharpness', 'efficiency', 'unbreaking'],
    pickaxe: ['efficiency', 'unbreaking'],
    shovel: ['efficiency', 'unbreaking'],
    bow: ['power', 'unbreaking'],
    armor: ['protection', 'unbreaking'],
    shield: ['unbreaking'],
  };
  // rand 注入保证可测;返回 3 个选项 [{type, level(1-3), cost(=level)}]
  function rollEnchants(toolKind, rand) {
    const pool = ENCHANT_POOL[toolKind] || ['unbreaking'];
    const opts = [];
    for (let i = 0; i < 3; i++) {
      const type = pool[Math.floor(rand() * pool.length) % pool.length];
      const level = 1 + Math.floor(rand() * 3);
      opts.push({ type, level, cost: level });
    }
    return opts;
  }

  // ---- 成就/进度系统(R34):经典里程碑链(顺序即典型进度线) ----
  // 触发埋点在 game.js(拾取/合成/击杀/钓鱼/繁殖/睡觉/矿车/附魔/交易/发现村庄)
  const ACHIEVEMENTS = [
    { id: 'get_wood',   icon: '🪵', name: '获得木头',     desc: '拾取一段原木' },
    { id: 'workbench',  icon: '🛠️', name: '工作台',       desc: '合成一张合成台' },
    { id: 'stone_age',  icon: '⛏️', name: '石器时代',     desc: '拾取一块圆石' },
    { id: 'furnace',    icon: '🔥', name: '热熔炉',       desc: '合成一台熔炉' },
    { id: 'iron_age',   icon: '🔩', name: '铁器时代',     desc: '获得一枚铁锭' },
    { id: 'diamonds',   icon: '💎', name: '钻石!',        desc: '获得一颗钻石' },
    { id: 'kill_zombie',icon: '⚔️', name: '怪物猎人',     desc: '击杀一只僵尸' },
    { id: 'kill_creeper',icon: '💥', name: '拆弹专家',    desc: '击杀一只苦力怕' },
    { id: 'bake_bread', icon: '🍞', name: '烤面包',       desc: '合成一个面包' },
    { id: 'fish',       icon: '🎣', name: '渔夫',         desc: '钓上一条鱼' },
    { id: 'breed',      icon: '💗', name: '牧场主',       desc: '繁殖出一只幼崽' },
    { id: 'sleep',      icon: '🛏️', name: '甜美的梦',    desc: '在床上睡到天亮' },
    { id: 'ride_cart',  icon: '🛒', name: '矿工之旅',     desc: '乘坐一次矿车' },
    { id: 'enchant',    icon: '✨', name: '附魔师',       desc: '附魔一件装备' },
    { id: 'trade',      icon: '🤝', name: '交易大师',     desc: '与村民完成一次交易' },
    { id: 'find_village',icon: '🏘️', name: '发现村庄',    desc: '找到一座村庄小屋' },
  ];
  const ACHV_BY_ID = {};
  for (const a of ACHIEVEMENTS) ACHV_BY_ID[a.id] = a;
  // 纯判定:未解锁且 id 合法 → 返回该成就对象(游戏层负责入集与播报);否则 null
  function awardAchievement(unlocked, id) {
    const a = ACHV_BY_ID[id];
    if (!a || unlocked.has(id)) return null;
    return a;
  }

  // ---- 存档 schema(R16 Critical 防漂移:字段清单单一来源) ----
  const SAVE_SCHEMA_FIELDS = [
    'seed', 'dayTime', 'playerPos', 'yaw', 'pitch', 'cameraMode', 'isFlying',
    'playerHP', 'playerHunger', 'hotbar', 'currentSlot', 'modifications',
    'cropTimersData', 'furnacesData', 'chestsData', 'spawnPoint',
    'armorSlotsData', 'doorsData', 'minecartsData', 'mobsData', 'xpData',
    'achvData', 'plazaBuilt', 'timestamp',
  ];
  // 返回缺失字段名数组(空数组 = 完整)
  function validateSaveRecord(rec) {
    return SAVE_SCHEMA_FIELDS.filter(f => rec[f] === undefined);
  }

  // 导出(Node 环境)
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { TUTORIAL_STEPS, advanceTutorial, COOK_TIME, SMELT, FUELS, furnaceCanSmelt, furnaceTick, weatherNext, cartNextDir, xpToNext, xpGain, ENCHANT_NAMES, ENCHANT_POOL, rollEnchants, ACHIEVEMENTS, ACHV_BY_ID, awardAchievement, SAVE_SCHEMA_FIELDS, validateSaveRecord };
  }
  // 浏览器:挂到全局
  global.MACHINES = {
    TUTORIAL_STEPS, advanceTutorial, COOK_TIME, SMELT, FUELS, furnaceCanSmelt, furnaceTick,
    weatherNext, cartNextDir, xpToNext, xpGain, ENCHANT_NAMES, ENCHANT_POOL, rollEnchants,
    ACHIEVEMENTS, ACHV_BY_ID, awardAchievement, SAVE_SCHEMA_FIELDS, validateSaveRecord,
  };

})(typeof window !== 'undefined' ? window : globalThis);
