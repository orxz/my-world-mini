// ============================================================
// R34 成就系统轮 实机验证(CDP,headless Chrome)
// 用法同 test/smoke.cdp.mjs(--remote-debugging-port=9333)。
// 覆盖:16 条成就全触发链(拾取×4/合成×3/击杀×2/钓鱼/睡觉/矿车/
// 附魔/交易/发现村庄/繁殖)、金色 toast、去重幂等、暂停按钮计数、
// 成就面板(锁/解锁态/计数)、存档往返+脏 id 防御、0 报错。
// ============================================================
const CDP = 'http://127.0.0.1:9333';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  let targets = null;
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(CDP + '/json/list');
      targets = await res.json();
      if (targets.some((t) => t.type === 'page')) break;
    } catch (e) { /* chrome not up yet */ }
    await sleep(500);
  }
  const page = targets && targets.find((t) => t.type === 'page');
  if (!page) { console.error('FATAL: no page target'); process.exit(1); }

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  let id = 0;
  const pending = new Map();
  const jsErrors = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    else if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      jsErrors.push((d.exception && d.exception.description) || d.text);
    }
  };
  const send = (method, params = {}) => new Promise((res) => {
    const mid = ++id;
    pending.set(mid, res);
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
  const evl = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, timeout: 60000 });
    if (r.result.exceptionDetails) {
      throw new Error('EVAL ERROR: ' + ((r.result.exceptionDetails.exception && r.result.exceptionDetails.exception.description) || r.result.exceptionDetails.text));
    }
    return r.result.result.value;
  };
  await send('Runtime.enable');

  const results = [];
  const check = (name, cond, extra = '') => results.push((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' | ' + extra : ''));

  // ---- 0. 进游戏 ----
  await sleep(1500);
  await evl(`document.getElementById('overlay').click()`);
  await sleep(600);
  check('进入游戏', await evl(`document.getElementById('overlay').classList.contains('hidden') && typeof unlockAchv === 'function'`));
  check('初始按钮 0/16', (await evl(`document.getElementById('btn-achv').textContent`)).includes('(0/16)'));

  // ---- 1. 拾取链(走 pickupIntoInventory 真实包装层)----
  const pick = await evl(`(() => {
    for (let i = 0; i < 9; i++) hotbar[i] = null;
    pickupIntoInventory('block', 'wood', 1);
    pickupIntoInventory('block', 'cobblestone', 1);
    pickupIntoInventory('item', 'iron_ingot', 1);
    pickupIntoInventory('item', 'gem_diamond', 1);
    const toast = document.querySelector('#achv-toasts .achv-toast');
    return { n: achvUnlocked.size,
             has: ['get_wood','stone_age','iron_age','diamonds'].every(x => achvUnlocked.has(x)),
             btn: document.getElementById('btn-achv').textContent,
             toastText: toast ? toast.textContent : '' };
  })()`);
  check('拾取里程碑 ×4(木头/圆石/铁/钻)+ toast + 按钮 4/16', pick.n === 4 && pick.has && pick.btn.includes('(4/16)') && pick.toastText.includes('进度已达成') && pick.toastText.includes('获得木头'), JSON.stringify(pick));

  // ---- 2. 去重:重复拾取不重复解锁 ----
  const dedup = await evl(`(() => {
    pickupIntoInventory('block', 'wood', 1);
    return { n: achvUnlocked.size, award: MACHINES.awardAchievement(achvUnlocked, 'get_wood') === null };
  })()`);
  check('重复触发幂等(不重复解锁/播报)', dedup.n === 4 && dedup.award, JSON.stringify(dedup));

  // ---- 3. 面板中间态:4 解锁 / 12 锁定 ----
  const panelMid = await evl(`(() => {
    openAchvPanel();
    const rows = document.querySelectorAll('#achv-list .achv-row');
    const done = document.querySelectorAll('#achv-list .achv-row.done').length;
    const locks = document.querySelectorAll('#achv-list .achv-row-icon').length;
    const lockText = [...document.querySelectorAll('#achv-list .achv-row')].filter(r => !r.classList.contains('done')).every(r => r.querySelector('.achv-row-icon').textContent === '🔒');
    closeAchvPanel();
    return { rows: rows.length, done, allLockedIcon: lockText, count: document.getElementById('achv-count').textContent };
  })()`);
  check('成就面板:16 行 / 4 解锁金框 / 未解锁 🔒 / 计数 4 / 16', panelMid.rows === 16 && panelMid.done === 4 && panelMid.allLockedIcon && panelMid.count === '4 / 16', JSON.stringify(panelMid));

  // ---- 4. 合成链(craftGiveResult,2×2 与合成台共用)----
  const craft = await evl(`(() => {
    craftGiveResult({ result: { kind: 'block', id: 'crafting_table', count: 1 }, name: '合成台', count: 1 });
    craftGiveResult({ result: { kind: 'block', id: 'furnace', count: 1 }, name: '熔炉', count: 1 });
    craftGiveResult({ result: { kind: 'item', id: 'bread', count: 1 }, name: '面包', count: 1 });
    return { n: achvUnlocked.size, has: ['workbench','furnace','bake_bread'].every(x => achvUnlocked.has(x)) };
  })()`);
  check('合成里程碑 ×3(合成台/熔炉/面包)', craft.n === 7 && craft.has, JSON.stringify(craft));

  // ---- 5. 击杀链 ----
  const kills = await evl(`(() => {
    const z = spawnMob(2.5, 30, 2.5, 'zombie'); hurtMob(z, 99, 0, 0, true);
    const c = spawnMob(2.5, 30, 2.5, 'creeper'); hurtMob(c, 99, 0, 0, true);
    return { n: achvUnlocked.size, has: achvUnlocked.has('kill_zombie') && achvUnlocked.has('kill_creeper') };
  })()`);
  check('击杀里程碑 ×2(僵尸/苦力怕)', kills.n === 9 && kills.has, JSON.stringify(kills));

  // ---- 6. 钓鱼 ----
  const fish = await evl(`(() => { catchFish({ x: 0.5, y: 10, z: 0.5 }); return achvUnlocked.has('fish'); })()`);
  check('钓鱼里程碑(渔夫)', fish === true);

  // ---- 7. 睡觉 ----
  const sleepA = await evl(`(() => { dayTime = 0.8; trySleep(0, 25, 0); return achvUnlocked.has('sleep'); })()`);
  check('睡觉里程碑(甜美的梦)', sleepA === true);

  // ---- 8. 矿车 ----
  const cart = await evl(`(() => { const c = { cx: 0, cy: 30, cz: 0, dx: 0, dz: 0, speed: 0 }; mountCart(c); dismountCart(); return achvUnlocked.has('ride_cart'); })()`);
  check('矿车里程碑(矿工之旅)', cart === true);

  // ---- 9. 附魔(走面板真实点击路径)----
  const ench = await evl(`(() => {
    for (let i = 0; i < 9; i++) hotbar[i] = null;
    hotbar[0] = { kind: 'tool', id: 'sword_diamond', durability: 1000 }; currentSlot = 0; buildHotbar();
    xpState.level = 3; xpState.points = 0;
    openEnchantPanel();
    currentEnchantOptions = [{ type: 'sharpness', level: 1, cost: 1 }];
    renderEnchantPanel();
    const btn = document.querySelector('#enchant-panel button[data-ei="0"]');
    if (btn) btn.click();
    closeEnchantPanel();
    return { has: achvUnlocked.has('enchant'), level: xpState.level, n: achvUnlocked.size };
  })()`);
  check('附魔里程碑(附魔师,真实点击)', ench.has && ench.level === 2 && ench.n === 13, JSON.stringify(ench));

  // ---- 10. 交易(喂 hotbar + doTrade 真实路径)----
  const trade = await evl(`(() => {
    for (let i = 0; i < 9; i++) hotbar[i] = null;
    hotbar[0] = { kind: 'item', id: 'wheat', count: 20 };
    const v = spawnMob(3.5, 30, 3.5, 'villager');
    openTradePanel(v);
    doTrade(INVLIB.VILLAGER_TRADES[0]);
    closeTradePanel();
    return { has: achvUnlocked.has('trade'), wheat: INVLIB.countInHotbar(hotbar, 'wheat'), n: achvUnlocked.size };
  })()`);
  check('交易里程碑(交易大师,真实交易)', trade.has && trade.wheat === 2 && trade.n === 14, JSON.stringify(trade));

  // ---- 11. 发现村庄(节流探测的真实入口 checkVillageAchv)----
  const hut = await evl(`(() => { for (let cx=-6;cx<=6;cx++) for (let cz=-6;cz<=6;cz++){ const h=villageInCell(cx,cz,worldSeed); if(h) return h; } })()`);
  const village = await evl(`(() => {
    playerPos.set(${hut.cx + 3.5}, ${hut.base + 4}, ${hut.cz + 3.5});
    checkVillageAchv();
    return { has: achvUnlocked.has('find_village'), n: achvUnlocked.size };
  })()`);
  check('发现村庄里程碑(小屋 24 格内)', !!hut && village.has && village.n === 15, JSON.stringify(village));
  await sleep(2600);   // 等传送目的地区块加载完成(否则后续生成的猪会掉出未加载世界)

  // ---- 12. 繁殖(两只求爱猪 → 幼崽;跟随玩家当前位置生成)----
  const breed = await evl(`(() => {
    clearMobs();
    const px = playerPos.x, py = playerPos.y + 2, pz = playerPos.z;
    const a = spawnMob(px - 0.5, py, pz - 0.5, 'pig');
    const b = spawnMob(px + 0.5, py, pz + 0.5, 'pig');
    a.loveT = 6; b.loveT = 6; a.breedCd = 0; b.breedCd = 0;
    a.fleeT = 0; b.fleeT = 0;
    a.turnT = 999; b.turnT = 999;   // 冻结游荡,保持 3 格内确保配对
    for (let i = 0; i < 120; i++) updateMobs(0.05);
    return { has: achvUnlocked.has('breed'), n: achvUnlocked.size, mobs: mobs.length };
  })()`);
  check('繁殖里程碑(牧场主,幼崽诞生)', breed.has && breed.n === 16 && breed.mobs >= 3, JSON.stringify(breed));

  // ---- 13. 终态面板:16/16 全金 ----
  const panelEnd = await evl(`(() => {
    openAchvPanel();
    const done = document.querySelectorAll('#achv-list .achv-row.done').length;
    const anyLock = [...document.querySelectorAll('#achv-list .achv-row .achv-row-icon')].some(el => el.textContent === '🔒');
    const cnt = document.getElementById('achv-count').textContent;
    closeAchvPanel();
    return { done, anyLock, cnt, btn: document.getElementById('btn-achv').textContent };
  })()`);
  check('终态面板 16/16 全解锁无锁图标 + 按钮计数', panelEnd.done === 16 && !panelEnd.anyLock && panelEnd.cnt === '16 / 16' && panelEnd.btn.includes('(16/16)'), JSON.stringify(panelEnd));

  // ---- 14. 存档往返 + 脏 id 防御 ----
  const roundtrip = await evl(`(() => {
    const rec = JSON.parse(JSON.stringify(buildSaveRecord()));
    const saved = rec.achvData ? rec.achvData.length : -1;
    applySave(rec);
    const restored = achvUnlocked.size;
    // 脏档:未知 id 忽略,只恢复合法 1 条
    const dirty = JSON.parse(JSON.stringify(buildSaveRecord()));
    achvUnlocked.clear();
    if (Array.isArray(dirty.achvData)) dirty.achvData = ['nope', 'get_wood'];
    applySave(dirty);
    const dirtyN = achvUnlocked.size;
    return { saved, restored, dirtyN, hasWood: achvUnlocked.has('get_wood') };
  })()`);
  check('存档往返 16 条恢复 / 脏 id 只恢复合法条目', roundtrip.saved === 16 && roundtrip.restored === 16 && roundtrip.dirtyN === 1 && roundtrip.hasWood, JSON.stringify(roundtrip));

  // ---- 15. 报错 ----
  await sleep(800);
  check('页面 0 JS error', jsErrors.length === 0, jsErrors.slice(0, 3).join(' || '));

  console.log('\n===== R34 成就系统轮 实机验证 =====');
  for (const r of results) console.log(r);
  const fails = results.filter(r => r.startsWith('FAIL'));
  console.log(`\n结果: ${results.length - fails.length}/${results.length} PASS`);
  if (fails.length) { console.log('❌ 有失败项'); process.exit(1); }
  console.log('✅ 全部通过');
  ws.close();
  process.exit(0);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
