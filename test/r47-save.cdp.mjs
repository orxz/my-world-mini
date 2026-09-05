// ============================================================
// R47 存档迁移边界验收(CDP,--remote-debugging-port=9333):
//   S1 完整往返:富状态(熔炉/箱子/门/生物/护甲/经验/成就/蛋糕/活塞/
//      床重生点)→ buildSaveRecord → 深拷贝 → applySave → 逐项还原
//   S2 旧版档 v1(缺 R28+ 全部新字段):不崩 + 合理默认(经验 0/成就空/
//      蛋糕惰性 6 片/活寒空/护甲空)+ 游戏可继续玩
//   S3 极旧档(仅 seed+playerPos+hotbar):不崩 + 满血早晨开局
//   S4 损坏档:位置 NaN/越界 → 回广场;hp/hunger 越界 → clamp;
//      dayTime 非法 → 沿用早晨
//   S5 脏数据防御:未知生物类型/NaN 坐标跳过、hp clamp、未知成就忽略、
//      活塞朝向越界忽略、护甲错部位回空、热栏缺 count 归一化
//   S6 真实 IndexedDB 槽往返:saveSlot → loadSlot → 状态还原 + 删除
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
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, timeout: 120000 });
    if (r.result.exceptionDetails) {
      throw new Error('EVAL ERROR: ' + ((r.result.exceptionDetails.exception && r.result.exceptionDetails.exception.description) || r.result.exceptionDetails.text));
    }
    return r.result.result.value;
  };
  await send('Runtime.enable');
  await send('Console.enable');
  await send('Page.enable');
  await send('Page.navigate', { url: 'file://' + process.cwd() + '/index.html?fresh=' + Date.now() });
  await sleep(2500);

  const results = [];
  const check = (name, cond, extra = '') => results.push((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' | ' + extra : ''));

  await evl(`document.getElementById('overlay').click()`);
  await sleep(600);
  await evl(`endTutorial()`);

  // ---- S1 完整往返(富状态)----
  const s1 = await evl(`(() => {
    // 造富状态(真实函数路径)
    const px = Math.floor(playerPos.x), pz = Math.floor(playerPos.z);
    let gy = 0; for (let y = 40; y > 4; y--) if (getBlock(px + 2, y, pz)) { gy = y + 1; break; }
    // 熔炉(装料)
    setBlock(px + 2, gy, pz, 'furnace');
    furnaces.set(blockKey(px + 2, gy, pz), { x: px + 2, y: gy, z: pz, input: { kind: 'item', id: 'iron_ore', count: 3 }, fuel: { kind: 'item', id: 'coal', count: 2 }, output: { kind: 'item', id: 'iron_ingot', count: 1 }, burnT: 0.5, burnMax: 8, cookT: 2.5 });
    // 箱子(放物)
    setBlock(px + 3, gy, pz, 'chest');
    const cslots = new Array(CHEST_SLOTS).fill(null); cslots[0] = { kind: 'item', id: 'diamond', count: 5 };
    chests.set(blockKey(px + 3, gy, pz), { x: px + 3, y: gy, z: pz, slots: cslots });
    // 门(先清 2 格高净空,地形障碍会让 placeDoor 拒绝)
    setBlock(px + 4, gy, pz, null); setBlock(px + 4, gy + 1, pz, null); setBlock(px + 4, gy - 1, pz, 'stone');
    placeDoor(px + 4, gy, pz, 'door', 1);
    // 生物(羊 + 幼崽猪)
    clearMobs();
    spawnMob(px + 2.5, gy + 1, pz + 2.5, 'sheep');
    spawnMob(px + 3.5, gy + 1, pz + 2.5, 'pig');
    mobs[mobs.length - 1].baby = true; mobs[mobs.length - 1].growT = 55; mobs[mobs.length - 1].mesh.scale.setScalar(0.55);
    // 护甲/经验/成就/蛋糕/活塞/床
    armorSlots.head = { kind: 'tool', id: 'helmet_iron', durability: 100 };
    xpState.level = 5; xpState.points = 9;
    achvUnlocked.add('get_wood'); achvUnlocked.add('workbench');
    cakes.set('7,20,7', 3);
    pistons.set('8,20,8', 2);
    spawnPoint = { x: 1.5, y: 22, z: 1.5 };
    dayTime = 0.42; playerHP = 13; hungerState.hunger = 11;
    hotbar[0] = { kind: 'item', id: 'bread', count: 7 };
    currentSlot = 3;
    // 保存 → 深拷贝(模拟 IndexedDB 结构化克隆往返)→ 重载 → 逐项断言
    const rec = buildSaveRecord();
    const clone = JSON.parse(JSON.stringify(rec));
    applySave(clone);
    const f = furnaces.get(blockKey(px + 2, gy, pz));
    const c = chests.get(blockKey(px + 3, gy, pz));
    const out = {
      seed: worldSeed === rec.seed,
      dayTime: Math.abs(dayTime - 0.42) < 1e-9,
      hp: playerHP === 13, hunger: hungerState.hunger === 11,
      slot: currentSlot === 3, bread: INVLIB.countInHotbar(hotbar, 'bread') === 7,
      furnace: !!f && f.input && f.input.id === 'iron_ore' && f.output && f.output.count === 1 && Math.abs(f.cookT - 2.5) < 1e-9,
      chest: !!c && c.slots[0] && c.slots[0].id === 'diamond' && c.slots[0].count === 5,
      door: doors.size === 1,
      mobs: mobs.length === 2 && mobs.some((m) => m.type === 'sheep') && mobs.some((m) => m.type === 'pig' && m.baby),
      armor: armorSlots.head && armorSlots.head.id === 'helmet_iron',
      xp: xpState.level === 5 && xpState.points === 9,
      achv: achvUnlocked.size === 2 && achvUnlocked.has('get_wood'),
      cake: cakes.get('7,20,7') === 3,
      piston: pistons.get('8,20,8') === 2,
      spawn: spawnPoint && spawnPoint.x === 1.5,
      clean: saveDirty === false
    };
    return out;
  })()`);
  const s1keys = Object.keys(s1);
  check('S1 完整往返:16 项富状态逐项还原', s1keys.every((k) => s1[k]), JSON.stringify(Object.entries(s1).filter(([, v]) => !v).map(([k]) => k)));

  // ---- S2 旧版档 v1(缺 R28+ 新字段)----
  const s2 = await evl(`(() => {
    const old = {
      seed: worldSeed, dayTime: 0.3,
      playerPos: { x: 0.5, y: 21.9, z: 0.5 }, yaw: 0.5, pitch: 0.1, cameraMode: 0, isFlying: false,
      playerHP: 17, playerHunger: 15, hotbar: [{ kind: 'block', id: 'stone', count: 12 }, null, null, null, null, null, null, null, null], currentSlot: 0,
      modifications: []
    };
    applySave(old);
    const missing = MACHINES.validateSaveRecord(old).length;
    // 默认值断言 + 游戏可继续玩
    velocity.set(0, 0, 0); updatePlayer(0.1); updateMobs(0.1);
    return {
      missing,
      xp: xpState.level === 0 && xpState.points === 0,
      achv: achvUnlocked.size === 0,
      pistons: pistons.size === 0, furnaces: furnaces.size === 0, doors: doors.size === 0, mobs: mobs.length === 0,
      armor: armorSlots.head === null && armorSlots.feet === null,
      hp: playerHP === 17, hunger: hungerState.hunger === 15, stone: INVLIB.countInHotbar(hotbar, 'stone') === 12,
      playable: true
    };
  })()`);
  check('S2 旧版档(缺 14 个新字段):不崩 + 合理默认 + 可继续玩', s2.missing >= 13 && s2.xp && s2.achv && s2.pistons && s2.furnaces && s2.doors && s2.mobs && s2.armor && s2.hp && s2.hunger && s2.stone && s2.playable, JSON.stringify(s2));

  // ---- S3 极旧档(仅 3 字段)----
  const s3 = await evl(`(() => {
    applySave({ seed: 12345, playerPos: { x: 0.5, y: 21.9, z: 0.5 }, hotbar: [] });
    velocity.set(0, 0, 0); updatePlayer(0.1); updateMobs(0.1);
    return { hp: playerHP === 20, hunger: hungerState.hunger === 20, dayOk: dayTime >= 0 && dayTime < 1, noCrash: true };
  })()`);
  check('S3 极旧档(仅 seed+位置+空热栏):满血早晨开局不崩', s3.hp && s3.hunger && s3.dayOk && s3.noCrash, JSON.stringify(s3));

  // ---- S4 损坏档(位置/数值非法)----
  const s4 = await evl(`(() => {
    const mk = (over) => Object.assign({ seed: worldSeed, dayTime: 0.3, playerPos: { x: 0.5, y: 21.9, z: 0.5 }, playerHP: 10, playerHunger: 10, hotbar: [], currentSlot: 0, modifications: [] }, over);
    applySave(mk({ playerPos: { x: NaN, y: 21.9, z: 0.5 } }));
    const r1 = { x: playerPos.x, y: playerPos.y, z: playerPos.z };   // 应回广场
    applySave(mk({ playerPos: { x: 0.5, y: -5, z: 0.5 } }));
    const r2y = playerPos.y;   // 应回广场(越界)
    applySave(mk({ playerHP: 999, playerHunger: -3 }));
    const r3 = { hp: playerHP, hunger: hungerState.hunger };   // clamp 20/0
    applySave(mk({ dayTime: 7.25 }));
    const r4 = dayTime;   // 归一 0.25
    applySave(mk({ dayTime: NaN }));
    const r5ok = Number.isFinite(dayTime);   // 非法沿用(不 NaN)
    return { plaza1: r1.x === 0.5 && r1.z === 0.5 && r1.y > 5, high2: r2y > 5, hp: r3.hp === 20, hunger: r3.hunger === 0, day4: Math.abs(r4 - 0.25) < 1e-9, day5: r5ok };
  })()`);
  check('S4 损坏档:位置非法回广场 / hp·hunger clamp / dayTime 归一且不 NaN', s4.plaza1 && s4.high2 && s4.hp && s4.hunger && s4.day4 && s4.day5, JSON.stringify(s4));

  // ---- S5 脏数据防御 ----
  const s5 = await evl(`(() => {
    applySave({
      seed: worldSeed, dayTime: 0.3, playerPos: { x: 0.5, y: 21.9, z: 0.5 }, playerHP: 20, playerHunger: 20,
      hotbar: [{ kind: 'block', id: 'planks' }, null, null, null, null, null, null, null, null],   // 缺 count
      currentSlot: 0,
      modifications: [['not-a-key', 'stone'], ['NaN,20,5', 'stone'], ['5,20,5', 'stone']],   // 损坏 key 跳过、合法 key 保留(R47)
      mobsData: [
        { t: 'dragon', x: 1, y: 22, z: 1 },                     // 未知类型 → 跳过
        { t: 'sheep', x: NaN, y: 22, z: 1 },                    // NaN 坐标 → 跳过
        null,                                                     // 空条目 → 跳过
        { t: 'sheep', x: 1.5, y: 22, z: 1.5, hp: 999 }          // hp 越界 → clamp 8
      ],
      achvData: ['get_wood', 'not_an_achv'],                     // 未知成就 → 忽略
      pistonsData: [['9,20,9', 99], ['10,20,10', 1]],            // 朝向 99 → 忽略
      armorSlotsData: [['head', { id: 'chest_iron' }], ['tail', { id: 'helmet_iron' }]],   // 错部位 → 空
      xpData: { level: -4, points: 2.7 }                          // 负级 → 0
    });
    const norm = hotbar[0];
    const modBad = Array.from(modifications.keys()).filter((k) => { const p = k.split(','); return p.length !== 3 || p.some((x) => !Number.isFinite(+x)); }).length;
    return {
      mobs: mobs.length === 1 && mobs[0].type === 'sheep',
      hpClamp: mobs.length === 1 && mobs[0].hp === 8,
      achv: achvUnlocked.size === 1 && achvUnlocked.has('get_wood'),
      piston: pistons.size === 1 && pistons.get('10,20,10') === 1,
      armor: armorSlots.head === null,
      xp: xpState.level === 0 && xpState.points === 2,
      hotbarNorm: norm && norm.count === 64,
      modsClean: modifications.size === 1 && modBad === 0 && modifications.has('5,20,5')
    };
  })()`);
  check('S5 脏数据防御:未知类型/NaN 跳过、hp/朝向 clamp、成就过滤、护甲回空、热栏补 64、diff 损坏 key 跳过', s5.mobs && s5.hpClamp && s5.achv && s5.piston && s5.armor && s5.xp && s5.hotbarNorm && s5.modsClean, JSON.stringify(s5));

  // ---- S6 真实 IndexedDB 槽往返 ----
  const s6 = await evl(`(async () => {
    playerHP = 7; hungerState.hunger = 5; dayTime = 0.8; markDirtySave();
    const id = await saveSlot('R47 验收档');
    if (!id) return { saved: false };
    // 改脏状态 → 读档应还原
    playerHP = 20; hungerState.hunger = 20; dayTime = 0.3;
    const ok = await loadSlot(id);
    const restored = { hp: playerHP === 7, hunger: hungerState.hunger === 5, day: Math.abs(dayTime - 0.8) < 1e-9 };
    // 排水:暂停/指针锁定路径的强制自动保存可能仍有 in-flight 的
    // overwriteSave put(会落在 delete 事务之后把档"复活",真实游戏良性);
    // 解绑当前档 + 等 400ms 让其落地,再删除验证
    currentSaveId = null;
    await new Promise((r2) => setTimeout(r2, 400));
    const del = await deleteSave(id);
    const gone = await loadSlot(id);
    return { saved: true, id, ok, ...restored, del, gone: gone === false };
  })()`);
  check('S6 真实 IndexedDB:saveSlot→loadSlot 还原(HP/饥饿/时间)→ 删除后读不到', s6.saved && s6.ok && s6.hp && s6.hunger && s6.day && s6.del && s6.gone, JSON.stringify(s6));

  // ---- 0 JS error ----
  check('S7 页面 0 JS error(全程含损坏档/脏数据)', jsErrors.length === 0, jsErrors.slice(0, 2).join(' | '));

  console.log(results.join('\n'));
  const fails = results.filter((r) => r.startsWith('FAIL')).length;
  console.log(`\n结果: ${results.length - fails}/${results.length} PASS` + (fails ? '\n❌ 有失败项' : '\n✅ 全部通过 —— 存档迁移边界验收达标'));
  ws.close();
  process.exit(fails ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
