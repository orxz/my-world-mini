// ============================================================
// 第十一部分:初始化
// ============================================================
// 经典 MC 标题屏:程序化泥土像素贴图平铺 + 半透明暗化(CSS 渐变叠加)
// ============================================================
// 新手教程(分步引导 + 完成自动检测;localStorage 记忆已完成)
// 步骤定义与推进状态机提取到纯模块 machines.js(R25 治理轮,可单测)
// ============================================================
const TUTORIAL_STEPS = MACHINES.TUTORIAL_STEPS;

const tutorial = {
  active: false,
  step: 0,
  progress: {},   // 各检测类型的累计量
};
let _tutRenderedStep = -1, _tutRenderedDesc = '';   // M1:同步增量渲染的标记

function tutorialStep() { return TUTORIAL_STEPS[tutorial.step]; }

// 步骤描述动态化:place 步骤检测当前手持是否为方块,不是则追加引导
function tutorialDesc(s) {
  // 触屏版文案(R46):与事件绑定的 isTouch 判定保持一致,渲染时实时取
  const useTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  const desc = useTouch && s.descTouch ? s.descTouch : s.desc;
  if (s.id === 'place') {
    const held = hotbar[currentSlot];
    if (!held || held.kind !== 'block') return desc + '<br><b style="color:#8a4a20;">→ 先按数字键选中刚才拾取的方块(快捷栏亮框那格)再放置</b>';
  }
  return desc;
}

// 目标进度的人类可读显示(look 用百分比,move 用格,其余用次)
function tutorialProgressText(goal) {
  const cur = Math.min(tutorial.progress[goal.type] || 0, goal.n);
  if (goal.type === 'look') return Math.round(cur / goal.n * 100) + '%';
  if (goal.type === 'move') return cur.toFixed(1) + ' / ' + goal.n + ' 格';
  return Math.round(cur) + ' / ' + goal.n + ' 次';
}

function renderTutorialCard() {
  const el = document.getElementById('tutorial-card');
  if (!el || !tutorial.active) return;
  const s = tutorialStep();
  if (!s) { endTutorial(); return; }
  // M1:同一步内仅进度变化 → 只更新进度文本与条宽,不整卡 innerHTML 重建
  // (move/look 步每帧上报,整卡重建会造成 DOM churn + 进度条动画重启抖动)
  const descHtml = tutorialDesc(s);
  if (tutorial.step === _tutRenderedStep && descHtml === _tutRenderedDesc && el.dataset.built === '1') {
    if (s.goal) {
      const progEl = el.querySelector('.tut-progress');
      const fillEl = el.querySelector('.tut-bar-fill');
      if (progEl) progEl.textContent = tutorialProgressText(s.goal);
      const pct = Math.min(100, Math.round((tutorial.progress[s.goal.type] || 0) / s.goal.n * 100));
      if (fillEl) fillEl.style.width = pct + '%';
    }
    return;
  }
  el.classList.remove('hidden');
  const goal = s.goal;
  let prog = '', bar = '';
  if (goal) {
    const pct = Math.min(100, Math.round((tutorial.progress[goal.type] || 0) / goal.n * 100));
    prog = `<div class="tut-progress">${tutorialProgressText(goal)}</div>`;
    bar = `<div class="tut-bar"><div class="tut-bar-fill" style="width:${pct}%;"></div></div>`;
  }
  const btn = goal ? '' : `<button class="craft-btn" id="tut-next" style="margin-top:8px;">继续 ▶</button>`;
  el.innerHTML = `<div class="tut-title">${s.title}</div><div class="tut-desc">${tutorialDesc(s)}</div>${prog}${bar}${btn}
    <div class="tut-skip" id="tut-skip">跳过教程</div><div class="tut-step-ind">${tutorial.step + 1} / ${TUTORIAL_STEPS.length}</div>`;
  // 到达完成卡即标记教程已完成(不再自动弹出)
  if (s.id === 'done') { try { localStorage.setItem('myword_tutorial_done', '1'); } catch (e2) { console.debug('教程完成标记写入失败(忽略):', e2); } }
  const nextBtn = document.getElementById('tut-next');
  if (nextBtn) nextBtn.onclick = () => { tutorial.step++; renderTutorialCard(); };
  const skipBtn = document.getElementById('tut-skip');
  if (skipBtn) skipBtn.onclick = endTutorial;
  _tutRenderedStep = tutorial.step;
  _tutRenderedDesc = descHtml;
  el.dataset.built = '1';
}

function startTutorial(force) {
  if (tutorial.active) return;
  if (!force) {
    try { if (localStorage.getItem('myword_tutorial_done')) return; } catch (e) { console.debug('教程完成标记读取失败(忽略):', e); }
  }
  tutorial.active = true;
  tutorial.step = 0;
  tutorial.progress = { move: 0, look: 0, break: 0, pickup: 0, place: 0, slot: 0, inventory: 0 };
  delete tutorial._lx; delete tutorial._lz;   // 重开时清除上次的位移基准
  _tutRenderedStep = -1; _tutRenderedDesc = '';
  renderTutorialCard();
}

function endTutorial() {
  tutorial.active = false;
  const el = document.getElementById('tutorial-card');
  if (el) { el.classList.add('hidden'); el.dataset.built = ''; }
  _tutRenderedStep = -1; _tutRenderedDesc = '';
  try { localStorage.setItem('myword_tutorial_done', '1'); } catch (e) { console.debug('教程完成标记写入失败(忽略):', e); }
}

// 各系统上报进度(推进逻辑在 machines.advanceTutorial,纯函数可单测)
function tutEvent(type, n) {
  if (!tutorial.active) return;
  const res = MACHINES.advanceTutorial(tutorial, type, n);
  if (res !== 'none') renderTutorialCard();
}

function applyClassicMenuBackground() {
  const overlay = document.getElementById('overlay');
  if (!overlay) return;
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const ctx = c.getContext('2d');
  let st = 424242;   // 确定性泥土噪点
  const rand = () => { st = (st * 1664525 + 1013904223) >>> 0; return st / 4294967296; };
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 32; x++) {
      const v = 0.72 + rand() * 0.28;
      ctx.fillStyle = 'rgb(' + ((134 * v) | 0) + ',' + ((96 * v) | 0) + ',' + ((67 * v) | 0) + ')';
      ctx.fillRect(x, y, 1, 1);
    }
  const url = c.toDataURL();
  overlay.style.backgroundImage = 'linear-gradient(rgba(0,0,0,0.6), rgba(0,0,0,0.6)), url(' + url + ')';
  overlay.style.backgroundSize = 'auto, 128px 128px';
  overlay.style.imageRendering = 'pixelated';
}

function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87CEEB);
  scene.fog = new THREE.Fog(0x87CEEB, FOG_NEAR, FOG_FAR);

  camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 1000);
  scene.add(camera);   // 手持物挂在相机下,相机必须进入场景图其子节点才会渲染

  try {
    renderer = new THREE.WebGLRenderer({ antialias: true });
  } catch (e) {
    showFatalError('无法创建 WebGL 上下文,请使用支持 WebGL 的浏览器(Chrome/Edge/Firefox)。\n\n错误: ' + e.message);
    throw e;
  }
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;   // 色调映射,防止高光过曝,画面更通透
  renderer.toneMappingExposure = 1.0;
  document.body.appendChild(renderer.domElement);

  // 加载设置(音量/FOV/渲染距离)
  loadSettings();
  // 光照(引用保存供昼夜循环动态调整)
  const ambient = new THREE.AmbientLight(0xffffff, 0.42);   // 降低环境光,恢复方块立体感
  scene.add(ambient);
  ambientLight = ambient;
  const sun = new THREE.DirectionalLight(0xffffff, 0.8);
  sun.position.set(60, 90, -40);   // 光线方向对齐太阳视觉位置
  scene.add(sun);
  sunLight = sun;
  const hemi = new THREE.HemisphereLight(0xbfdfff, 0x6b8f3e, 0.25); // 降低半球光
  scene.add(hemi);
  hemiLight = hemi;
  // 手持火把照明(R23):暖色点光源跟随玩家,举火把时点亮(影响 Lambert 区块网格,真实距离衰减)
  const thl = new THREE.PointLight(0xffc46b, 0, 11, 2);
  scene.add(thl);
  torchHoldLight = thl;

  const sunMesh = new THREE.Mesh(new THREE.SphereGeometry(4, 16, 16), new THREE.MeshBasicMaterial({ color: 0xfff2a8, fog: false }));
  sunMesh.position.set(62, 88, -42);   // 太阳球与光线同向
  scene.add(sunMesh);
  sunMeshRef = sunMesh;

  // 月亮:较小、苍白,与太阳相对;夜晚可见(由 updateDayNight 调整可见性)
  const moonMesh = new THREE.Mesh(new THREE.SphereGeometry(2.5, 16, 16), new THREE.MeshBasicMaterial({ color: 0xd8d8e8, fog: false }));
  moonMesh.position.set(-62, 88, 42);
  scene.add(moonMesh);
  moonMeshRef = moonMesh;

  scene.add(highlightBox);

  // 云朵(场景设置完毕后创建,高空块状半透明面片)
  createClouds();
  // 天空系统:渐变天穹 + 星星 + 日/月光晕(依赖 sunMeshRef/moonMeshRef)
  createSky();
  createRain();   // 天气系统:雨滴粒子(默认隐藏,随机调度)
  // 破坏裂纹覆盖层
  createCrackOverlay();

  // 纹理:图集(区块网格用)+ 单方块材质(UI/手持用)
  buildAtlas();
  for (const t of Object.keys(BLOCK_TYPES)) materials[t] = makeBlockMaterials(t);

  // 生成初始区块(玩家中心区域)
  for (let dx = -2; dx <= 2; dx++)
    for (let dz = -2; dz <= 2; dz++)
      ensureChunk(dx, dz);

  // 建造出生广场(广场+Owen字样+灯塔+树篱+路径,确定性生成)
  buildSpawnPlaza();
  // 广场覆盖的区块(半径22 → ±2 区块)重新生成数据(应用 modifications)
  // 先全部重建数据,再统一补种树(树冠跨区块写入的才是最终数据)
  for (let dx = -2; dx <= 2; dx++)
    for (let dz = -2; dz <= 2; dz++) {
      const ch = chunks.get(chunkKey(dx, dz));
      if (ch) { ch.data = generateChunkData(dx, dz); markChunkDirty(dx, dz); }
    }
  for (let dx = -2; dx <= 2; dx++)
    for (let dz = -2; dz <= 2; dz++) {
      const ch = chunks.get(chunkKey(dx, dz));
      if (ch) { applyPendingBlocks(ch); growTreesInChunk(dx, dz); }
    }

  // 构建全部已生成区块的 mesh
  for (const ch of chunks.values()) buildChunkMesh(ch);

  // 出生点固定在广场中心(不用 findSafeSpawn,确保每次都在广场)
  const plazaH = SEA_LEVEL + 6;
  playerPos.set(0.5, plazaH + 1 + PLAYER_HEIGHT * 0.5, 0.5);

  initInventory();
  buildPlayerModel();
  buildHoldGroup();
  buildHotbar();
  updateHPBar();   // 初始化生命条 HUD
  updateHungerBar();   // 初始化饥饿条 HUD
  applyClassicMenuBackground();   // 经典泥土贴图标题屏
}

// 在中心区域找安全出生点
// "Owen" 4 个字母点阵(5×7,1点=1方块)
// "Owen" 4 个字母点阵(5×7,1点=1方块)
const OWEN_FONT = {
  O: ["01110","10001","10001","10001","10001","10001","01110"],
  w: ["10001","10001","10001","10101","10101","10101","01010"],
  e: ["01110","10001","10000","11110","10000","10001","01110"],
  n: ["00000","10001","10001","11001","10101","10011","10001"],
};
const OWEN_TEXT = ['O','w','e','n'];

// 俯视像素艺术点阵
const PIXEL_ART = {
  SMILEY: ["..yyyyy..",".yyyyyyy.","yykyykyy.","yykyykyy.","yyyyyyyyy","yyyyyyyyy","yykyyykyy",".ykkkkky.","..yyyyy.."],
  HEART:  [".rr...rr.","rrrr.rrrr","rrrrrrrrr","rrrrrrrrr",".rrrrrrr.","..rrrrr..","...rrr...","....r...."],
  STAR:   ["....w....","....w....","wwwwwwwww",".wwwwwww.","..wwwww..",".www.www.","www...www","w.......w"],
};

// 出生广场:确定性生成(modifications 记录,存档保留,每次固定)
function buildSpawnPlaza() {
  const plazaR = 28;
  const platH = SEA_LEVEL + 6;
  const set = (x, y, z, t) => { if (y >= 0 && y < WORLD_HEIGHT) { addModification(x, y, z, t); plazaBlocks.set(blockKey(x, y, z), t); } };
  const setArt = (ox, oz, font, colorMap) => {
    for (let row = 0; row < font.length; row++)
      for (let col = 0; col < font[row].length; col++) {
        const ch = font[row][col];
        if (ch !== '.' && ch !== ' ' && colorMap[ch]) set(ox + col, platH, oz + row, colorMap[ch]);
      }
  };

  // 1. 圆形广场地基(草地)+ 石砖环形纹理
  for (let dx = -plazaR; dx <= plazaR; dx++) {
    for (let dz = -plazaR; dz <= plazaR; dz++) {
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d <= plazaR) {
        for (let y = 0; y <= platH; y++) {
          let t = 'stone';
          if (y === platH) t = 'grass';
          else if (y >= platH - 3) t = 'dirt';
          set(dx, y, dz, t);
        }
        if (d > plazaR - 3) set(dx, platH, dz, 'stone');
        else if (d > plazaR - 6) set(dx, platH, dz, 'planks');
      }
    }
  }

  // 2. 中央 Owen 字样(木板底座 + 树叶字)
  const padR = 11;
  for (let dx = -padR; dx <= padR; dx++)
    for (let dz = -4; dz <= 4; dz++)
      if (dx * dx + dz * dz * 4 <= padR * padR) { set(dx, platH, dz, 'planks'); set(dx, platH + 1, dz, null); }
  const cellW = 5, cellH = 7, gap = 2;
  const startX = -((OWEN_TEXT.length * cellW + (OWEN_TEXT.length - 1) * gap) / 2 | 0);
  const startZ = -((cellH) / 2 | 0);
  for (let ci = 0; ci < OWEN_TEXT.length; ci++) {
    const font = OWEN_FONT[OWEN_TEXT[ci]];
    const ox = startX + ci * (cellW + gap);
    for (let row = 0; row < cellH; row++)
      for (let col = 0; col < cellW; col++)
        if (font[row][col] === '1') set(ox + col, platH + 1, startZ + row, 'leaves');
  }

  // 3. 四角灯塔
  const tR = plazaR - 4;
  for (const [tx, tz] of [[tR,tR],[-tR,tR],[tR,-tR],[-tR,-tR]]) {
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) set(tx + dx, platH + 1, tz + dz, 'stone');
    for (let h = 2; h <= 5; h++) set(tx, platH + h, tz, 'brick');
    set(tx, platH + 6, tz, 'wood');
    set(tx, platH + 3, tz, 'leaves');
  }

  // 4. 环形树篱
  for (let a = 0; a < 360; a += 15) {
    const tx = Math.round(Math.cos(a * Math.PI / 180) * plazaR);
    const tz = Math.round(Math.sin(a * Math.PI / 180) * plazaR);
    set(tx, platH + 1, tz, 'wood'); set(tx, platH + 2, tz, 'wood');
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) set(tx + dx, platH + 3, tz + dz, 'leaves');
    set(tx, platH + 4, tz, 'leaves');
  }

  // 5. 南北入口路径
  for (let d = plazaR + 1; d <= plazaR + 8; d++) for (let w = -1; w <= 1; w++) { set(w, platH, d, 'planks'); set(w, platH, -d, 'planks'); }

  // 6. 俯视像素艺术(广场外围,增加趣味)
  // 像素艺术改用纯色羊毛:更鲜艳干净(SMILEY 黄+黑,HEART 红,STAR 白)
  setArt(-15, plazaR - 14, PIXEL_ART.SMILEY, { y: 'wool_yellow', k: 'wool_black' });
  setArt(  6, plazaR - 14, PIXEL_ART.HEART,  { r: 'wool_red' });
  setArt(-15, -(plazaR - 6), PIXEL_ART.HEART, { r: 'wool_red' });
  setArt(  6, -(plazaR - 6), PIXEL_ART.STAR,  { w: 'wool_white' });
  setArt(-(plazaR - 6), -5, PIXEL_ART.SMILEY, { y: 'wool_yellow', k: 'wool_black' });
  setArt(  plazaR - 6,  -5, PIXEL_ART.STAR,  { w: 'wool_white' });

  // 7. 中心喷泉(广场正中央偏东,Owen 字样前方):圆形水池 + 中央石柱水花
  const fx = 0, fz = 8;   // 喷泉中心(字样南侧)
  for (let dx = -2; dx <= 2; dx++) {
    for (let dz = -2; dz <= 2; dz++) {
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d <= 2) {
        set(fx + dx, platH, fz + dz, 'water');     // 水池
        set(fx + dx, platH + 1, fz + dz, null);     // 水面上方留空
      }
      if (d > 1.5 && d <= 2.5) set(fx + dx, platH, fz + dz, 'stone'); // 石沿
    }
  }
  // 中央石柱(喷泉核心)
  set(fx, platH + 1, fz, 'stone');
  set(fx, platH + 2, fz, 'stone');
  set(fx, platH + 3, fz, 'water');   // 柱顶"水花"
  set(fx, platH + 4, fz, 'water');

  // 8. 四向拱门(南北路径入口处,标志性建筑)
  // 拱门:两根石柱 + 顶部横梁(木板),框住路径
  const archZ = [plazaR + 1, -(plazaR + 1)];   // 南北各一个
  for (const az of archZ) {
    for (let h = 1; h <= 4; h++) {
      set(-2, platH + h, az, 'stone');    // 左柱
      set(2, platH + h, az, 'stone');     // 右柱
    }
    set(-1, platH + 4, az, 'planks'); set(0, platH + 4, az, 'planks'); set(1, platH + 4, az, 'planks'); // 横梁
    set(0, platH + 5, az, 'leaves');      // 横梁装饰
  }

  // 9. 蘑菇装饰(广场内散布几个红白蘑菇):菌柄 wood + 菌盖 leaves/brick
  const mushrooms = [[-10, 4], [12, -4], [-8, -10], [10, 12]];
  for (const [mx, mz] of mushrooms) {
    set(mx, platH + 1, mz, 'wood');        // 菌柄
    set(mx, platH + 2, mz, 'wood');
    set(mx, platH + 3, mz, 'wool_red');    // 菌盖中心红(纯色羊毛)
    set(mx + 1, platH + 3, mz, 'wool_red'); set(mx - 1, platH + 3, mz, 'wool_red');
    set(mx, platH + 3, mz + 1, 'wool_red'); set(mx, platH + 3, mz - 1, 'wool_red');
    set(mx, platH + 4, mz, 'snow');        // 菌盖顶白点
  }

  // 10. 花坛(广场内环形小花坛,leaves 围圈 + 中心 sand)
  const flowers = [[-12, -6], [13, 8], [4, -12], [-4, 13]];
  for (const [flx, flz] of flowers) {
    for (let a = 0; a < 360; a += 60) {
      const r = 1.5;
      const px = Math.round(flx + Math.cos(a * Math.PI / 180) * r);
      const pz = Math.round(flz + Math.sin(a * Math.PI / 180) * r);
      set(px, platH + 1, pz, 'leaves');    // 花叶围边
    }
    set(flx, platH + 1, flz, 'sand');      // 花坛中心沙
    set(flx, platH + 2, flz, 'leaves');    // 中心一朵花
  }

  // 11. 旗杆(广场东西两侧):高木杆 + 顶部砖旗
  for (const [gx, gz] of [[plazaR - 8, 0], [-(plazaR - 8), 0]]) {
    for (let h = 1; h <= 6; h++) set(gx, platH + h, gz, 'wood');   // 旗杆
    set(gx + 1, platH + 6, gz, 'brick');   // 旗帜(飘向东)
    set(gx + 1, platH + 5, gz, 'brick');
  }

  // 12. 起伏小山丘(广场南侧外围,地形层次):用 dirt/grass 堆几个圆丘
  const hills = [[0, plazaR + 6], [10, plazaR + 8], [-10, plazaR + 8]];
  for (const [hx, hz] of hills) {
    for (let dx = -3; dx <= 3; dx++) {
      for (let dz = -3; dz <= 3; dz++) {
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d <= 3) {
          const h = Math.round(3 - d);     // 中心高,边缘低
          for (let y = 1; y <= h; y++) set(hx + dx, platH + y, hz + dz, y === h ? 'grass' : 'dirt');
        }
      }
    }
  }
  worldPlazaBuilt = true;   // 广场已知 diff 已登记(存档可瘦身)
}


function clearWorld() {
  for (const ch of chunks.values()) {
    if (ch.mesh) {
      if (ch.mesh.solid) { scene.remove(ch.mesh.solid); ch.mesh.solid.geometry.dispose(); }
      if (ch.mesh.water) { scene.remove(ch.mesh.water); unregisterWaterMesh(ch.mesh.water); ch.mesh.water.geometry.dispose(); }
    }
  }
  chunks.clear();
  modifications.clear();
  modsByChunk.clear();
  pendingBlocks.clear();
  dirtyChunks.clear();
  plazaBlocks.clear();          // 广场已知 diff 随世界重置(重建时重新登记)
  worldPlazaBuilt = false;
  villageTorches.clear();       // 村庄火把随区块生成重新登记(R31)
  dungeonSpawns.clear();        // 地牢登记随区块生成重新登记(R37)
  dungeonLootSpots.clear();
  redstoneParts.clear();        // 红石登记随区块 diff 重新入册(R38)
  caneTimers.clear();           // 甘蔗计时随存档(R40)
  cakes.clear();                // 蛋糕片数随存档(R40)
  pistons.clear();              // 活塞朝向随存档(R42)
  repeaterTimers.clear();       // 中继器延迟计时(R42)
  for (const a of arrows) scene.remove(a);
  arrows.length = 0;
  clearDroppedItems();   // 清掉落物,避免旧世界残留
  clearMobs();           // 清生物,避免旧世界残留
  weather = 'clear'; weatherTimer = 90;   // 天气不跨世界残留(读档世界不继承上一场的雨)
  if (rainMesh) rainMesh.visible = false;
  updateRainAudio();
  clearFallingBlocks();  // 清下落中的沙砾
  clearTNT();            // 清点燃的 TNT
  clearFurnaces();       // 清熔炉状态
  clearChests();         // 清箱子内容
  clearMinecarts();      // 清矿车实体(R26)
  clearXPOrbs();         // 清经验球(R28)
  endFishing();          // 收鱼线(R29)
  closeEnchantPanel();   // 关附魔面板(R28)
  closeTradePanel();     // 关交易面板(R33)
  achvUnlocked.clear();  // 成就随存档走,重置世界清空(R34)
  updateAchvBtn();
  spawnPoint = null;     // 重生点回出生广场(读档会按存档恢复)
  tableOpen = false;
  for (let i = 0; i < 9; i++) tableGrid[i] = null;
  const tPanel = document.getElementById('craft-table-panel');
  if (tPanel) tPanel.classList.add('hidden');
  breakTargetKey = null; breakProgress = 0;
  hideBreakOverlay();
  // 清理粒子/农作物计时器(避免跨世界残留)
  for (const pt of particles) { scene.remove(pt); pt.material.dispose(); }
  particles.length = 0;
  cropTimers.clear();
  clearDoors();
  lightGridCache.clear();   // 光照网格随世界重置(读档后首次建 mesh 重算)
  dayTime = 0.3;   // 新世界/切换存档前重置为早晨;读档由 applySave 按存档恢复(防跨存档时间串档)
  armorSlots.head = armorSlots.chest = armorSlots.legs = armorSlots.feet = null;   // 护甲随世界重置(读档按存档恢复)
  updateArmorBar();
}

function resetWorld() {
  clearWorld();
  // 固定种子:重置仍回到同一个出生广场场景(不换随机种子)
  velocity.set(0, 0, 0);
  isFlying = false;
  yaw = 0; pitch = 0;
  // 重置瞬态状态,避免新世界继承旧世界的落地/入水边沿误触发
  wasOnGround = false;
  wasInWater = false;
  // 关键:清除"脏"标记并刷新自动保存计时,确保新世界不会在 30 秒后被
  // scheduleAutosave 静默覆盖旧存档(否则"重置不覆盖存档"的保护失效)。
  // 玩家在新世界手动编辑后才会再次标记脏,由手动保存/暂停时保存覆盖。
  saveDirty = false;
  lastAutosaveTime = performance.now();
  if (autosaveTimer) { clearTimeout(autosaveTimer); autosaveTimer = null; }
  currentSaveId = null;           // 重置世界:不关联任何存档(新游戏)
  initInventory();              // 重置快捷栏
  buildHotbar();
  playerHP = PLAYER_MAX_HP; breathTimer = 0; updateHPBar();   // 重置生命
  hungerState.hunger = 20; hungerState.drain = 0; hungerState.regenT = 0; hungerState.starveT = 0; updateHungerBar();   // 重置饥饿
  for (let dx = -2; dx <= 2; dx++)
    for (let dz = -2; dz <= 2; dz++)
      ensureChunk(dx, dz);
  // 固定生成出生广场(确保重置后仍有广场场景)
  buildSpawnPlaza();
  // 广场覆盖区块重新生成数据(应用 modifications);先重建数据再统一补种树
  for (let dx = -2; dx <= 2; dx++)
    for (let dz = -2; dz <= 2; dz++) {
      const ch = chunks.get(chunkKey(dx, dz));
      if (ch) { ch.data = generateChunkData(dx, dz); markChunkDirty(dx, dz); }
    }
  for (let dx = -2; dx <= 2; dx++)
    for (let dz = -2; dz <= 2; dz++) {
      const ch = chunks.get(chunkKey(dx, dz));
      if (ch) { applyPendingBlocks(ch); growTreesInChunk(dx, dz); }
    }
  for (const ch of chunks.values()) buildChunkMesh(ch);
  // 出生点固定在广场中心(原点)
  const plazaH = SEA_LEVEL + 6;
  playerPos.set(0.5, plazaH + 1 + PLAYER_HEIGHT * 0.5, 0.5);  // 精确站在广场表面(无余量)
  yaw = 0; pitch = 0;
  updateInfoCount();
  showToast('已重置到出生广场');
}

