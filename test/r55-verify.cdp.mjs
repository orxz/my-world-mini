// ============================================================
// R55 生存地基验收(CDP,可选开发工具)
// 覆盖:模式分离 / 采矿层级 / 数值曲线 / 冲刺潜行 / 攻击冷却 /
//   配方书 / 章节目标 / 地牢分级 / 宝库 / 信标 / 铁傀儡修复 / 新存档字段
// 用法(先按 smoke.cdp.mjs 头部启动 headless Chrome):
//   CDP_PORT=9333 node test/r55-verify.cdp.mjs
// ============================================================
const PORT = process.env.CDP_PORT || '9333';
const CDP = 'http://127.0.0.1:' + PORT;
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
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, timeout: 60000 });
    if (r.result.exceptionDetails) throw new Error('EVAL ERROR: ' + ((r.result.exceptionDetails.exception && r.result.exceptionDetails.exception.description) || r.result.exceptionDetails.text));
    return r.result.result.value;
  };

  await send('Runtime.enable');
  await sleep(1800);

  const results = [];
  const check = (name, cond, extra = '') => results.push((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' | ' + extra : ''));

  // 1. 模块与数据量
  const g = await evl(`({balance:typeof BALANCE,craft:typeof CRAFTLIB,goals:typeof MACHINES.goalState,blocks:Object.keys(BLOCK_TYPES).length,recipes:CRAFTLIB.RECIPES.length,achv:MACHINES.ACHIEVEMENTS.length})`);
  check('balance/craft/machines loaded', g.balance === 'object' && g.craft === 'object' && g.goals === 'function', JSON.stringify(g));
  check('blocks>=59 / recipes>=80 / achv>=29', g.blocks >= 59 && g.recipes >= 80 && g.achv >= 29, JSON.stringify(g));

  // 2. 进入游戏
  await evl(`document.getElementById('overlay').click()`);
  await sleep(600);
  const st = await evl(`({hidden:document.getElementById('overlay').classList.contains('hidden'),chunks:chunks.size,mode:gameMode,day:dayCount})`);
  check('enter game / 121 chunks / valid mode+day', st.hidden === true && st.chunks >= 100 && (st.mode === 'survival' || st.mode === 'creative') && st.day >= 1, JSON.stringify(st));

  // 2b. 视觉:图集顶/底 UV 与出生点净空
  const vis = await evl(`({top:atlasUV.grass.top,bottom:atlasUV.grass.bottom,z:playerPos.z,head:getBlock(0,22,0),above:getBlock(0,23,0)})`);
  check('atlas top samples top tile / bottom samples bottom', vis.top[1] > 0.6 && vis.top[3] > 0.6 && vis.bottom[1] < 0.4 && vis.bottom[3] < 0.4, JSON.stringify(vis));
  check('spawn clear: no blocks above head', Math.abs(vis.z - 0.5) < 0.01 && vis.head === null && vis.above === null, JSON.stringify(vis));

  // 2c. 面板压暗(等过渡结束再读 computed opacity)
  await evl(`toggleInventory(true)`);
  await sleep(400);
  const dimOn = await evl(`document.body.classList.contains('panel-open') && getComputedStyle(document.getElementById('panel-dim')).opacity === '1'`);
  await evl(`toggleInventory(false)`);
  await sleep(400);
  const dimOff = await evl(`!document.body.classList.contains('panel-open') && getComputedStyle(document.getElementById('panel-dim')).opacity === '0'`);
  check('panel dim toggles with inventory', dimOn && dimOff, JSON.stringify({ dimOn, dimOff }));

  // 2d. 生存背包名称始终可见(不再用 ??? 遮蔽)
  const names = await evl(`(() => {
    toggleInventory(true);
    const labels = [...document.querySelectorAll('#inventory .inv-label')].map(e => e.textContent.trim());
    toggleInventory(false);
    return { n: labels.length, unknown: labels.filter(x => !x || x === '???').length, sample: labels.slice(0, 5) };
  })()`);
  check('inventory labels always show names', names.n > 50 && names.unknown === 0, JSON.stringify(names));

  // 3. 生存图鉴点击放入 1 个,且不覆盖当前手持
  const surv = await evl(`(()=>{
    gameMode='survival'; toggleInventory(true);
    const saved=hotbar.slice();
    const before=INVLIB.hotbarCounts(hotbar).dirt||0;
    const c=[...document.querySelectorAll('#inventory .inv-cell')].find(e=>e.textContent.trim()==='泥土');
    if(c)c.click();
    const after=INVLIB.hotbarCounts(hotbar).dirt||0;
    const pick=saved[0]&&saved[0].id;
    const kept=hotbar.some(x=>x&&x.id===pick);
    for(let i=0;i<hotbar.length;i++)hotbar[i]=saved[i]||null;
    buildHotbar(); toggleInventory(false);
    return {added:after-before,kept,pick};
  })()`);
  check('survival catalog adds 1 and does not overwrite held tool', surv.added === 1 && surv.kept === true, JSON.stringify(surv));

  // 4. 采矿层级
  const tier = await evl(`(()=>{hotbar[0]={kind:'tool',id:'pickaxe_wood',durability:60};currentSlot=0;selectSlot(0);const wood={can:canHarvestBlock('diamond_ore'),cost:breakCost('diamond_ore')};hotbar[0]={kind:'tool',id:'pickaxe_iron',durability:251};const iron={can:canHarvestBlock('diamond_ore'),cost:breakCost('diamond_ore')};return {wood,iron};})()`);
  check('wood pick cannot harvest diamond', tier.wood.can === false && tier.wood.cost === 20, JSON.stringify(tier));
  check('iron pick harvests diamond in 3 clicks', tier.iron.can === true && tier.iron.cost === 3, JSON.stringify(tier));

  // 5. 数值曲线
  const bal = await evl(`({f10:BALANCE_LIB.fallDamage(10),f30:BALANCE_LIB.fallDamage(30),cap3:BALANCE_LIB.nightCap(3),cap9:BALANCE_LIB.nightCap(9),walk:Math.round(BALANCE_LIB.timeToStarve(0.22)),idle:Math.round(BALANCE_LIB.timeToStarve(0.08))})`);
  check('fall 10=6 / 30=20', bal.f10 === 6 && bal.f30 === 20, JSON.stringify(bal));
  check('night cap day3=8 day9=10', bal.cap3 === 8 && bal.cap9 === 10, JSON.stringify(bal));
  check('starve walk=364s idle=1000s', bal.walk === 364 && bal.idle === 1000, JSON.stringify(bal));

  // 6. 冲刺/潜行速度(净空平台)
  const move = await evl(`(()=>{for(let x=-8;x<=8;x++)for(let z=-8;z<=8;z++){setBlock(x,40,z,'stone');for(let y=41;y<=44;y++)setBlock(x,y,z,null);}
    const m=(sprint,sneak)=>{playerPos.set(0.5,41.9,0.5);velocity.set(0,0,0);yaw=0;onGround=true;isFlying=false;hungerState.hunger=20;for(const k in keys)keys[k]=false;keys[keymap.forward]=true;if(sprint)sprintLock=true;if(sneak)keys.ShiftLeft=true;const x0=playerPos.x,z0=playerPos.z;for(let i=0;i<60;i++){onGround=true;updatePlayer(1/60,0);}const d=Math.hypot(playerPos.x-x0,playerPos.z-z0);keys[keymap.forward]=false;keys.ShiftLeft=false;sprintLock=false;isSprinting=false;isSneaking=false;return +d.toFixed(2);};
    return {walk:m(false,false),sprint:m(true,false),sneak:m(false,true)};})()`);
  check('walk 5.5 / sprint 7.7 / sneak 1.9', move.walk === 5.5 && move.sprint === 7.7 && move.sneak === 1.9, JSON.stringify(move));

  // 7. 攻击冷却(铁剑 0.45s)
  const atk = await evl(`(()=>{playerPos.set(0.5,41.9,0.5);velocity.set(0,0,0);yaw=0;pitch=0;onGround=true;for(let i=mobs.length-1;i>=0;i--)removeMob(i);spawnMob(0.5,41.0,-2.2,'zombie');const z=mobs[mobs.length-1];z.hp=20;hotbar[0]={kind:'tool',id:'sword_iron',durability:251};currentSlot=0;selectSlot(0);for(const k in toolCooldown)delete toolCooldown[k];breakBlock();const hp1=z.hp;breakBlock();const hp2=z.hp;return {hp1,hp2};})()`);
  check('iron sword first hit 6, second blocked by cooldown', atk.hp1 === 14 && atk.hp2 === 14, JSON.stringify(atk));

  // 8. 配方书
  const rec = await evl(`(()=>{gameMode='creative';recipeCat='全部';document.getElementById('recipe-search').value='';openRecipeBook();const total=document.querySelectorAll('#recipe-list .recipe-card').length;document.getElementById('recipe-search').value='镐';renderRecipeBook();const picks=document.querySelectorAll('#recipe-list .recipe-card').length;closeRecipeBook();return {total,picks};})()`);
  check('recipe book total>=80 / search 镐>=5', rec.total >= 80 && rec.picks >= 5, JSON.stringify(rec));

  // 3b. 合成台格内材料名称/汇总(解决图标无法区分材料)
  const tableLabels = await evl(`(() => {
    openTablePanel();
    tableGrid[0] = { kind: 'item', id: 'iron_ingot' };
    tableGrid[1] = { kind: 'item', id: 'iron_ingot' };
    tableGrid[3] = { kind: 'item', id: 'stick' };
    tableGrid[4] = { kind: 'item', id: 'stick' };
    renderTableGrid();
    const labels = [...document.querySelectorAll('#table-grid .craft-label')].map(e => e.textContent);
    const summary = document.getElementById('table-materials').textContent;
    closeTablePanel();
    return { labels, summary };
  })()`);
  check('craft table labels + material summary', tableLabels.labels.includes('铁锭') && tableLabels.labels.includes('木棍') && tableLabels.summary.includes('铁锭 ×2') && tableLabels.summary.includes('木棍 ×2'), JSON.stringify(tableLabels));

  // 9. 章节目标
  const goal = await evl(`(()=>{unlockAchv('get_wood');return {done:MACHINES.goalDoneCount(achvUnlocked),txt:document.getElementById('goals-hud').innerText};})()`);
  check('goal HUD updates after first achievement', goal.done >= 1 && goal.txt.indexOf('第 1 章') >= 0, JSON.stringify(goal));

  // 10. 地牢分级 + 宝库布局
  const dun = await evl(`(()=>{let core=null;for(let x=-120;x<120&&!core;x++)for(let z=-120;z<120;z++){const d=dungeonInCell(x,z,worldSeed);if(d&&d.tier==='core'){core=d;break;}}if(!core)return {found:false};return {found:true,size:core.size,rooms:core.rooms.length,spawners:core.spawners.length,chests:core.chestSpots.length,vault:dungeonBlockAt(core.vault.x,core.vault.z,2,core,worldSeed),frame:dungeonBlockAt(core.vault.x,core.vault.z-1,2,core,worldSeed)};})()`);
  check('core dungeon 11×11 / 3 rooms / 3 chests / vault+obsidian', dun.found && dun.size === 11 && dun.rooms === 3 && dun.chests === 3 && dun.vault === 'vault' && dun.frame === 'obsidian', JSON.stringify(dun));

  // 11. 宝库开启
  const vault = await evl(`(()=>{const x=2,y=41,z=2;setBlock(x,y,z,'vault');hotbar[0]={kind:'item',id:'ender_pearl',count:12};currentSlot=0;buildHotbar();tryOpenVault(x,y,z);return {block:getBlock(x,y,z),pearls:INVLIB.countInHotbar(hotbar,'ender_pearl'),achv:achvUnlocked.has('vault')};})()`);
  check('vault opens with 12 pearls', vault.block === null && vault.pearls === 0 && vault.achv === true, JSON.stringify(vault));

  // 12. 信标光环
  const beacon = await evl(`(()=>{playerPos.set(0.5,41.9,0.5);setBlock(3,41,3,'beacon');beacons.add(blockKey(3,41,3));playerHP=10;updateBeaconAura(4.1);return {aura:beaconAura,hp:playerHP};})()`);
  check('beacon aura + regen', beacon.aura === true && beacon.hp === 11, JSON.stringify(beacon));

  // 13. 铁傀儡修复
  const golem = await evl(`(()=>{for(let i=mobs.length-1;i>=0;i--)removeMob(i);spawnMob(0.5,41.0,1.5,'golem');const m=mobs[mobs.length-1];m.hp=50;hotbar[2]={kind:'item',id:'iron_ingot',count:2};currentSlot=2;repairGolem(m,hotbar[2]);return {hp:m.hp,left:hotbar[2]&&hotbar[2].count};})()`);
  check('iron golem repair +25', golem.hp === 75 && golem.left === 1, JSON.stringify(golem));

  // 14. 新存档字段往返
  const save = await evl(`(()=>{gameMode='creative';dayCount=7;stats.blocksMined=12;goalClaimed.add('g_wood');discovered.add('coal');beacons.add('1,2,3');vaults.add('4,5,6');const rec=buildSaveRecord();const missing=MACHINES.validateSaveRecord(rec);gameMode='survival';dayCount=1;stats.blocksMined=0;goalClaimed.clear();discovered.clear();beacons.clear();vaults.clear();applySave(rec);return {missing:missing.length,mode:gameMode,day:dayCount,mined:stats.blocksMined,beacons:beacons.size};})()`);
  check('save schema complete + new fields roundtrip', save.missing === 0 && save.mode === 'creative' && save.day === 7 && save.mined === 12 && save.beacons >= 1, JSON.stringify(save));

  // 15. 无未捕获异常
  check('no uncaught JS exceptions', jsErrors.length === 0, jsErrors.slice(0, 3).join(' | '));

  console.log('\n=== R55 VERIFY ===');
  results.forEach((r) => console.log(r));
  const failed = results.filter((r) => r.startsWith('FAIL')).length;
  console.log(`\n${results.length - failed}/${results.length} PASS`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
