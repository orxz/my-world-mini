// ============================================================
// 第十一部分:初始化
// ============================================================
// 经典 MC 标题屏:程序化泥土像素贴图平铺 + 半透明暗化(CSS 渐变叠加)
// ============================================================
// 新手教程(分步引导 + 完成自动检测;localStorage 记忆已完成)
// 步骤定义与推进状态机提取到纯模块 machines.js(R25 治理轮,可单测)
// ============================================================
const TUTORIAL_STEPS = MACHINES.TUTORIAL_STEPS;
// R55 视觉:出生点移到广场中轴南侧(避开中央 Owen 字样/喷泉柱,开场即是开阔视角)
const SPAWN_X = 0.5, SPAWN_Z = 0.5;

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
  if (typeof updateGoalsHUD === 'function') updateGoalsHUD();
}

function endTutorial() {
  tutorial.active = false;
  const el = document.getElementById('tutorial-card');
  if (el) { el.classList.add('hidden'); el.dataset.built = ''; }
  _tutRenderedStep = -1; _tutRenderedDesc = '';
  try { localStorage.setItem('myword_tutorial_done', '1'); } catch (e) { console.debug('教程完成标记写入失败(忽略):', e); }
  if (typeof updateGoalsHUD === 'function') updateGoalsHUD();
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
  camera.fov = settings.fov || 75;
  camera.updateProjectionMatrix();
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
  buildPlaygroundProps();
  ensurePlaygroundCart();
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
  playerPos.set(SPAWN_X, plazaH + 1 + PLAYER_HEIGHT * 0.5, SPAWN_Z);

  initInventory();
  buildPlayerModel();
  buildHoldGroup();
  buildHotbar();
  updateHPBar();   // 初始化生命条 HUD
  updateHungerBar();   // 初始化饥饿条 HUD
  updateAchvBtn();
  if (typeof updateGoalsHUD === 'function') updateGoalsHUD();
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
  F: ["11111","10000","10000","11110","10000","10000","10000"],
  U: ["10001","10001","10001","10001","10001","10001","01110"],
  N: ["10001","11001","10101","10101","10011","10001","10001"],
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
  const plazaR = 38;
  const platH = SEA_LEVEL + 6;
  const set = (x, y, z, t) => { if (y >= 0 && y < WORLD_HEIGHT) { addModification(x, y, z, t); plazaBlocks.set(blockKey(x, y, z), t); } };
  const fill = (x0, x1, y0, y1, z0, z1, t) => {
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) set(x, y, z, t);
  };
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
  // 内环石径(28):保留原广场边界视觉,同时区分内游乐场/外探索区
  for (let a = 0; a < 360; a += 2) {
    set(Math.round(Math.cos(a * Math.PI / 180) * 28), platH, Math.round(Math.sin(a * Math.PI / 180) * 28), 'stone');
  }

  // 2. Owen 字样(木板底座 + 树叶字):整体北移,给出生点留出开阔视野
  const padR = 11, padZ = -12;
  for (let dx = -padR; dx <= padR; dx++)
    for (let dz = -4; dz <= 4; dz++)
      if (dx * dx + dz * dz * 4 <= padR * padR) { set(dx, platH, dz + padZ, 'planks'); set(dx, platH + 1, dz + padZ, null); }
  const cellW = 5, cellH = 7, gap = 2;
  const startX = -((OWEN_TEXT.length * cellW + (OWEN_TEXT.length - 1) * gap) / 2 | 0);
  const startZ = -((cellH) / 2 | 0) + padZ;
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
  const gateAngles = [0, 90, 180, 270];
  for (let a = 0; a < 360; a += 15) {
    const nearGate = gateAngles.some(g => Math.min(Math.abs(a - g), 360 - Math.abs(a - g)) <= 15);
    if (nearGate) continue;   // 四向留出通往外部探索区的门洞
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
  // 中央石柱(喷泉核心):2 格石座 + 1 格水花,避免高柱挡住出生视野
  set(fx, platH + 1, fz, 'stone');
  set(fx, platH + 2, fz, 'water');

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
  const mushrooms = [[-17, 8], [12, -4], [-8, 0], [10, 12]];
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
  for (const [gx, gz] of [[plazaR - 9, 0], [-(plazaR - 9), 0]]) {
    for (let h = 1; h <= 6; h++) set(gx, platH + h, gz, 'wood');   // 旗杆
    set(gx + 1, platH + 6, gz, 'brick');   // 旗帜(飘向东)
    set(gx + 1, platH + 5, gz, 'brick');
  }

  // 12. 起伏小山丘(广场南侧外围,地形层次):用 dirt/grass 堆几个圆丘
  const hills = [[24, plazaR + 6], [-24, plazaR + 6], [0, plazaR + 10]];
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
  // 13. 儿童游乐场(R55):环场矿车过山车、旋转木马、摩天轮、秋千、水滑梯、
  //     沙坑、蹦床、村民+铁傀儡雕像、FUN 门牌。全部走 set()(不触发实体生成)。
  const rideR = 20, rideY = platH + 3;
  // 13.1 环场轨道:矩形闭环,四角可自动转向;每 4 格一根砖柱
  for (let x = -rideR; x <= rideR; x++) {
    set(x, rideY, -rideR, 'rail');
    set(x, rideY, rideR, 'rail');
  }
  for (let z = -rideR + 1; z <= rideR - 1; z++) {
    set(-rideR, rideY, z, 'rail');
    set(rideR, rideY, z, 'rail');
  }
  const trackSupport = (x, z) => {
    set(x, platH + 1, z, 'brick');
    set(x, platH + 2, z, 'brick');
  };
  for (let x = -rideR; x <= rideR; x += 4) {
    if (x !== 0) trackSupport(x, rideR);       // 南侧中段留车站
    trackSupport(x, -rideR);
  }
  for (let z = -rideR + 4; z <= rideR - 4; z += 4) {
    trackSupport(-rideR, z); trackSupport(rideR, z);
  }
  // 13.2 南侧车站:平台/台阶/雨棚/灯(前侧留空,不挡视线)
  fill(-2, 2, platH + 2, platH + 2, 18, 20, 'planks');
  fill(-2, 2, platH + 1, platH + 1, 20, 20, 'brick');
  set(0, platH + 1, 17, 'stone');
  for (const px of [-3, 3]) {
    for (let y = platH + 3; y <= platH + 6; y++) set(px, y, 18, 'fence');
    set(px, platH + 6, 18, 'torch');
  }
  fill(-3, 3, platH + 7, platH + 7, 18, 20, 'wool_red');
  set(0, platH + 7, 17, 'wool_yellow');
  for (let x = -3; x <= 3; x += 2) set(x, platH + 8, 18, x % 2 ? 'wool_white' : 'wool_yellow');
  // 13.3 旋转木马底座(东侧)
  const carX = 13, carZ = 2;
  for (let dx = -5; dx <= 5; dx++) for (let dz = -5; dz <= 5; dz++) {
    if (Math.hypot(dx, dz) <= 5.4) set(carX + dx, platH, carZ + dz, 'planks');
  }
  set(carX, platH + 1, carZ, 'brick'); set(carX, platH + 2, carZ, 'brick');
  set(carX, platH + 3, carZ, 'brick'); set(carX, platH + 4, carZ, 'brick');
  for (const [ox, oz] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) {
    for (let y = platH + 1; y <= platH + 4; y++) set(carX + ox, y, carZ + oz, 'fence');
    set(carX + ox, platH + 5, carZ + oz, 'wool_yellow');
  }
  // 13.4 摩天轮支架(西北)
  const ferX = 14.5, ferZ = -6;
  fill(ferX - 4, ferX + 4, platH, platH, ferZ - 2, ferZ + 2, 'planks');
  for (const ox of [-4, 4]) {
    for (let y = platH + 1; y <= platH + 6; y++) set(ferX + ox, y, ferZ, 'brick');
  }
  for (let x = ferX - 2; x <= ferX + 2; x++) set(x, platH + 7, ferZ, 'brick');
  // 13.5 秋千架(西侧)
  const swX = -13, swZ = 4;
  fill(swX - 2, swX + 2, platH, platH, swZ, swZ, 'sand');
  for (const ox of [-3, 3]) for (let y = platH + 1; y <= platH + 4; y++) set(swX + ox, y, swZ, 'fence');
  for (let x = swX - 2; x <= swX + 2; x++) set(x, platH + 4, swZ, 'planks');
  // 13.6 水滑梯(南偏西):石塔 + 台阶 + 四段水面 + 底部水池
  const slX = -8, slZ = 15;
  fill(slX - 1, slX + 1, platH, platH, slZ - 1, slZ + 1, 'stone');
  fill(slX - 1, slX + 1, platH + 1, platH + 3, slZ - 1, slZ + 1, 'stone');
  fill(slX - 1, slX + 1, platH + 4, platH + 4, slZ - 1, slZ + 1, 'planks');
  set(slX, platH + 1, slZ + 2, 'stone'); set(slX, platH + 2, slZ + 2, 'planks');
  for (let i = 0; i < 4; i++) {
    const y = platH + 3 - i, z = slZ - 1 - i;
    set(slX, y, z, 'water'); set(slX - 1, y, z, 'stone'); set(slX + 1, y, z, 'stone');
  }
  fill(slX - 1, slX + 1, platH, platH, slZ - 5, slZ - 4, 'water');
  // 13.7 蹦床(南偏东)
  fill(7, 9, platH, platH, 14, 16, 'slime');
  set(7, platH + 1, 14, 'fence'); set(9, platH + 1, 16, 'fence');
  // 13.8 沙坑(西南):沙地 + 栅栏 + 彩色球
  fill(-16, -12, platH, platH, 11, 15, 'sand');
  for (let x = -16; x <= -12; x++) for (let z = 11; z <= 15; z++) {
    if ((x === -16 || x === -12 || z === 11 || z === 15) && !(x === -12 && z === 13)) set(x, platH + 1, z, 'fence');
  }
  set(-15, platH + 1, 12, 'wool_yellow'); set(-13, platH + 1, 14, 'wool_red');
  set(-14, platH + 1, 13, 'wool_white');
  // 13.9 村民 + 铁傀儡雕像(东南)
  fill(13, 17, platH, platH, 10, 14, 'stone');
  fill(14, 16, platH + 1, platH + 1, 11, 13, 'brick');
  for (let y = platH + 2; y <= platH + 4; y++) set(14, y, 12, 'iron_block');
  set(12, platH + 3, 12, 'iron_block'); set(16, platH + 3, 12, 'iron_block');
  set(14, platH + 5, 12, 'wool_yellow');   // 南瓜头(无 pumpkin 方块:黄羊毛+黑脸)
  set(14, platH + 5, 11, 'wool_black');
  set(14, platH + 4, 11, 'wool_red');      // 领结/鼻子
  set(17, platH + 2, 12, 'brick'); set(17, platH + 3, 12, 'brick'); set(17, platH + 4, 12, 'brick');
  set(17, platH + 5, 12, 'sand'); set(17, platH + 5, 13, 'brick');
  set(13, platH + 2, 10, 'torch'); set(17, platH + 2, 14, 'torch');
  // 13.10 入口气球拱门(轨道外侧,不挡视野):砖柱 + 三色横梁 + 气球
  const balloonArchZ = 30;
  for (const px of [-4, 4]) {
    for (let y = platH + 1; y <= platH + 4; y++) set(px, y, balloonArchZ, 'brick');
    set(px, platH + 5, balloonArchZ, 'wool_white');
    set(px, platH + 6, balloonArchZ, 'torch');
    set(px, platH + 7, balloonArchZ, px < 0 ? 'wool_red' : 'wool_yellow');
  }
  for (let x = -3; x <= 3; x++) set(x, platH + 5, balloonArchZ, x % 2 ? 'wool_yellow' : 'wool_red');
  // 13.11 长椅与路灯(休息区)
  for (const [bx, bz] of [[7, 10], [-11, 9], [6, 12]]) {
    set(bx, platH + 1, bz, 'stairs_planks');
    set(bx + 1, platH + 1, bz, 'stairs_planks');
    set(bx, platH + 2, bz, 'torch');
  }

  buildOuterSpawn(set, fill, platH, plazaR);

  worldPlazaBuilt = true;   // 广场已知 diff 已登记(存档可瘦身)
}

// ============================================================
// 出生地外环:四门 + 环形步道 + 瞭望塔/迷宫/池塘/野餐林/跳跳石
// 内环 28 保留原游乐场边界;外环 38 扩大探索体积但不挡开场动线
// ============================================================
let spawnPOIs = [];
function buildOuterSpawn(set, fill, platH, plazaR) {
  spawnPOIs = [];
  const reserved = [
    { x0: -31, x1: -23, z0: -23, z1: -15 },   // 瞭望塔
    { x0: 20, x1: 32, z0: -28, z1: -18 },    // 树篱迷宫
    { x0: -32, x1: -20, z0: 12, z1: 22 },    // 池塘
    { x0: 21, x1: 31, z0: 10, z1: 19 },      // 野餐林
    { x0: 4, x1: 16, z0: -30, z1: -22 },     // 跳跳石
  ];
  const inReserved = (x, z) => reserved.some(r => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1);

  // 0. 中央到四门的主轴步道(23..30),让开场视线有明确去处
  for (let d = 23; d <= 30; d++) {
    for (let w = -1; w <= 1; w++) {
      set(w, platH, d, 'planks'); set(w, platH, -d, 'planks');
      set(d, platH, w, 'planks'); set(-d, platH, w, 'planks');
    }
  }
  // 1. 外环环形步道(半径 30/31),绕开五个探索区
  for (let a = 0; a < 360; a += 2) {
    for (const r of [30, 31]) {
      const x = Math.round(Math.cos(a * Math.PI / 180) * r);
      const z = Math.round(Math.sin(a * Math.PI / 180) * r);
      if (!inReserved(x, z)) set(x, platH, z, 'planks');
    }
  }
  // 1b. 主轴灯柱与花点:让 23..30 的通道有节奏
  for (const [lx, lz] of [[4, 26], [-4, 26], [4, -26], [-4, -26], [26, 4], [26, -4], [-26, 4], [-26, -4]]) {
    set(lx, platH + 1, lz, 'fence'); set(lx, platH + 2, lz, 'fence');
    set(lx, platH + 3, lz, 'torch');
    set(lx + (lx > 0 ? 1 : -1), platH + 1, lz, 'leaves');
    set(lx + (lx > 0 ? 1 : -1), platH + 2, lz, 'wool_yellow');
  }
  // 2. 四向门洞 + 门外路径 + 彩球拱门
  const gates = [
    { x: 0, z: -plazaR, axis: 'z' }, { x: 0, z: plazaR, axis: 'z' },
    { x: plazaR, z: 0, axis: 'x' }, { x: -plazaR, z: 0, axis: 'x' },
  ];
  for (const g of gates) {
    for (let d = 31; d <= plazaR + 1; d++) {
      if (g.axis === 'z') for (let w = -1; w <= 1; w++) set(w, platH, g.z < 0 ? -d : d, 'planks');
      else for (let w = -1; w <= 1; w++) set(g.x < 0 ? -d : d, platH, w, 'planks');
    }
    const side = g.axis === 'z' ? 'x' : 'z';
    for (const off of [-3, 3]) {
      for (let y = platH + 1; y <= platH + 4; y++) {
        if (side === 'x') set(g.x + off, y, g.z, 'brick');
        else set(g.x, y, g.z + off, 'brick');
      }
      const bx = side === 'x' ? g.x + off : g.x;
      const bz = side === 'x' ? g.z : g.z + off;
      set(bx, platH + 5, bz, off < 0 ? 'wool_red' : 'wool_yellow');
      set(bx, platH + 6, bz, 'torch');
      set(bx, platH + 7, bz, off < 0 ? 'wool_white' : 'wool_red');
    }
    for (let t = -2; t <= 2; t++) {
      const bx = side === 'x' ? g.x + t : g.x;
      const bz = side === 'x' ? g.z : g.z + t;
      set(bx, platH + 5, bz, t % 2 ? 'wool_yellow' : 'wool_red');
    }
  }
  // 3. 内环灯柱(不压住探索区)
  for (let a = 10; a < 360; a += 45) {
    const x = Math.round(Math.cos(a * Math.PI / 180) * 29);
    const z = Math.round(Math.sin(a * Math.PI / 180) * 29);
    if (inReserved(x, z)) continue;
    set(x, platH + 1, z, 'fence'); set(x, platH + 2, z, 'fence');
    set(x, platH + 3, z, 'torch');
  }
  // 4. 外环花点(彩色羊毛 + 叶),与设施错开
  const flowerColors = ['wool_red', 'wool_yellow', 'wool_white'];
  for (let a = 20, i = 0; a < 360; a += 30, i++) {
    const x = Math.round(Math.cos(a * Math.PI / 180) * 33);
    const z = Math.round(Math.sin(a * Math.PI / 180) * 33);
    if (inReserved(x, z)) continue;
    set(x, platH + 1, z, 'leaves');
    set(x, platH + 2, z, flowerColors[i % 3]);
  }

  // 5. 瞭望塔(西北):石塔 + 外挂梯 + 顶层平台
  {
    const lx = -27, lz = -20;
    fill(lx - 2, lx + 2, platH, platH, lz - 2, lz + 2, 'stone');
    for (let y = platH + 1; y <= platH + 7; y++) {
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        if (dx === 0 && dz === 0) continue;
        set(lx + dx, y, lz + dz, 'brick');
      }
    }
    fill(lx - 2, lx + 2, platH + 8, platH + 8, lz - 2, lz + 2, 'planks');
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
      if (Math.abs(dx) === 2 || Math.abs(dz) === 2) set(lx + dx, platH + 9, lz + dz, 'fence');
    }
    for (let y = platH + 1; y <= platH + 7; y++) set(lx, y, lz + 2, 'ladder');
    set(lx, platH + 8, lz, 'torch'); set(lx - 1, platH + 8, lz - 1, 'torch');
    spawnPOIs.push({ x: lx, z: lz, label: '瞭望塔', radius: 7, tip: '爬梯子登顶,俯瞰整座游乐场' });
  }

  // 6. 树篱迷宫(东北):11×9,南/北入口,中心黏液蹦床
  {
    const ox = 21, oz = -27, w = 11, h = 9;
    for (let dx = 0; dx < w; dx++) for (let dz = 0; dz < h; dz++) {
      const x = ox + dx, z = oz + dz;
      const border = dx === 0 || dx === w - 1 || dz === 0 || dz === h - 1;
      const entrance = (dx === 5 && (dz === 0 || dz === h - 1));
      if (border && !entrance) { set(x, platH + 1, z, 'leaves'); set(x, platH + 2, z, 'leaves'); }
    }
    for (let dz = 1; dz <= h - 2; dz++) {
      if (dz === 4) continue;
      set(ox + 3, platH + 1, oz + dz, 'leaves'); set(ox + 3, platH + 2, oz + dz, 'leaves');
      if (dz !== 2) { set(ox + 7, platH + 1, oz + dz, 'leaves'); set(ox + 7, platH + 2, oz + dz, 'leaves'); }
    }
    for (let dx = 1; dx <= w - 2; dx++) {
      if (dx === 5 || dx === 2) continue;
      set(ox + dx, platH + 1, oz + 4, 'leaves'); set(ox + dx, platH + 2, oz + 4, 'leaves');
    }
    fill(ox + 4, ox + 6, platH, platH, oz + 3, oz + 5, 'slime');
    set(ox + 5, platH + 1, oz + 4, 'torch');
    spawnPOIs.push({ x: ox + 5, z: oz + 4, label: '树篱迷宫', radius: 9, tip: '从南/北入口进,中心是黏液蹦床' });
  }

  // 7. 池塘(西南):水面 + 沙岸 + 木栈道
  {
    const px = -26, pz = 17;
    fill(px - 4, px + 4, platH, platH, pz - 2, pz + 2, 'water');
    for (let dx = -5; dx <= 5; dx++) for (let dz = -3; dz <= 3; dz++) {
      if (Math.abs(dx) === 5 || Math.abs(dz) === 3) set(px + dx, platH, pz + dz, 'sand');
    }
    fill(px - 2, px + 2, platH, platH, pz - 3, pz - 3, 'planks');
    for (let dx = -1; dx <= 1; dx++) set(px + dx, platH + 1, pz - 3, 'fence');
    set(px - 3, platH, pz - 1, 'wool_white'); set(px + 2, platH, pz + 1, 'wool_yellow');
    set(px + 4, platH + 1, pz - 3, 'torch');
    spawnPOIs.push({ x: px, z: pz, label: '池塘', radius: 8, tip: '在水边钓鱼,或沿木栈道散步' });
  }

  // 8. 野餐林(东南):小树 + 野餐桌 + 篝火
  {
    const ox = 26, oz = 15;
    for (const [tx, tz] of [[-4, -2], [4, -2], [-4, 2], [4, 2]]) {
      for (let y = platH + 1; y <= platH + 3; y++) set(ox + tx, y, oz + tz, 'wood');
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) set(ox + tx + dx, platH + 4, oz + tz + dz, 'leaves');
      set(ox + tx, platH + 5, oz + tz, 'leaves');
    }
    fill(ox - 1, ox + 1, platH + 1, platH + 1, oz, oz, 'planks');
    set(ox, platH + 1, oz - 1, 'fence'); set(ox, platH + 1, oz + 1, 'fence');
    set(ox - 2, platH + 1, oz, 'stairs_planks'); set(ox + 2, platH + 1, oz, 'stairs_planks');
    set(ox, platH, oz + 3, 'wood'); set(ox, platH + 1, oz + 3, 'torch');
    spawnPOIs.push({ x: ox, z: oz, label: '野餐林', radius: 8, tip: '在树荫下野餐,篝火旁休息' });
  }

  // 9. 跳跳石(北偏东):高低石块 + 终点黏液
  {
    const pads = [[6, -26, 21], [9, -26, 22], [12, -26, 23], [14, -25, 22], [16, -24, 21]];
    for (const [x, z, y] of pads) fill(x, x + 1, y, y, z, z + 1, y >= 23 ? 'stone' : 'planks');
    fill(17, 18, platH, platH, -24, -23, 'slime');
    set(6, platH + 1, -25, 'torch');
    spawnPOIs.push({ x: 11, z: -26, label: '跳跳石', radius: 7, tip: '踩着高低石块跳向终点黏液' });
  }

  // 10. 外环导览牌(四门内侧),给儿童一个方向锚点
  for (const [sx, sz, label] of [[2, 31, '南门 · 野餐林/池塘'], [-2, -31, '北门 · 迷宫/跳跳石'], [31, 2, '东门 · 树篱迷宫'], [-31, -2, '西门 · 瞭望塔/池塘']]) {
    set(sx, platH + 1, sz, 'fence'); set(sx, platH + 2, sz, 'fence');
    set(sx, platH + 3, sz, 'wool_yellow');
    spawnPOIs.push({ x: sx, z: sz, label: label, radius: 4, tip: '沿环形步道探索' });
  }
}

function getNearbySpawnPOI() {
  let best = null, bestD = Infinity;
  for (const p of spawnPOIs) {
    const d = Math.hypot(playerPos.x - p.x, playerPos.z - p.z);
    if (d <= p.radius && d < bestD) { best = p; bestD = d; }
  }
  return best;
}
// ============================================================
// R55 儿童游乐场:动态设施(方块风格 Three 组)与过山车矿车
// ============================================================
function playgroundBox(group, w, h, d, x, y, z, color) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color })
  );
  mesh.position.set(x, y, z);
  group.add(mesh);
  return mesh;
}

function clearPlaygroundProps() {
  if (!playgroundRides) return;
  for (const g of [playgroundRides.carousel, playgroundRides.ferris, playgroundRides.swing]) {
    if (!g) continue;
    scene.remove(g);
    g.traverse((o) => {
      if (o.isMesh) {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          if (o.material.map) o.material.map.dispose();
          o.material.dispose();
        }
      }
    });
  }
  playgroundRides = null;
  ridingRide = null;
}

function buildPlaygroundProps() {
  clearPlaygroundProps();
  const platH = SEA_LEVEL + 6;

  // 旋转木马:放大到 1.3 倍,四匹小马可乘坐
  const carousel = new THREE.Group();
  carousel.position.set(13, platH + 1, 2);
  carousel.scale.set(1.3, 1.15, 1.3);
  const carouselSeats = [];
  const roofColors = [0xd94b4b, 0xf1c40f, 0xecf0f1, 0x3498db];
  for (let i = 0; i < 4; i++) {
    playgroundBox(carousel, 2.15, 0.35, 8.6, -3.225 + i * 2.15, 4.1, 0, roofColors[i]);
  }
  playgroundBox(carousel, 0.45, 4.1, 0.45, 0, 2.05, 0, 0xf1c40f);
  playgroundBox(carousel, 0.9, 0.5, 0.9, 0, 4.35, 0, 0xf1c40f);
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + Math.PI / 4;
    const pony = new THREE.Group();
    pony.position.set(Math.cos(a) * 2.7, 1.05, Math.sin(a) * 2.7);
    pony.rotation.y = -a;
    const bodyColor = [0xecf0f1, 0xf5b7b1, 0xf9e79f, 0xaed6f1][i];
    playgroundBox(pony, 1.35, 0.7, 0.55, 0, 0.2, 0, bodyColor);
    playgroundBox(pony, 0.55, 0.55, 0.5, 0.7, 0.55, 0, bodyColor);
    playgroundBox(pony, 0.18, 0.5, 0.18, -0.5, -0.25, 0.17, 0x8a6430);
    playgroundBox(pony, 0.18, 0.5, 0.18, -0.5, -0.25, -0.17, 0x8a6430);
    playgroundBox(pony, 0.18, 0.5, 0.18, 0.5, -0.25, 0.17, 0x8a6430);
    playgroundBox(pony, 0.18, 0.5, 0.18, 0.5, -0.25, -0.17, 0x8a6430);
    playgroundBox(pony, 0.5, 0.2, 0.2, 0.9, 0.75, 0, 0x5a3a1a);
    carousel.add(pony);
    carouselSeats.push({ node: pony, offsetY: 1.35, label: '旋转木马' });
  }
  carousel.userData.ride = {
    type: 'carousel', label: '旋转木马', board: new THREE.Vector3(13, platH, 2), boardRadius: 7.5,
    seats: carouselSeats, exit: { x: 13, z: 8 },
  };
  scene.add(carousel);

  // 摩天轮:放大到 1.25 倍,6 个座舱可乘坐
  const ferris = new THREE.Group();
  ferris.position.set(14.5, platH + 7, -6);
  ferris.scale.set(1.25, 1.25, 1.25);
  const cabins = [];
  const ferrisSeats = [];
  const ferrisRim = new THREE.Mesh(
    new THREE.TorusGeometry(4, 0.2, 6, 24),
    new THREE.MeshLambertMaterial({ color: 0xecf0f1 })
  );
  ferris.add(ferrisRim);
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2;
    playgroundBox(ferris, 0.72, 0.72, 0.4, Math.cos(a) * 4, Math.sin(a) * 4, 0, i % 2 ? 0xf1c40f : 0xd94b4b);
  }
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2;
    const spoke = playgroundBox(ferris, 4, 0.12, 0.12, Math.cos(a) * 2, Math.sin(a) * 2, 0, 0x95a5a6);
    spoke.rotation.z = a;
    const cabin = new THREE.Group();
    cabin.position.set(Math.cos(a) * 4, Math.sin(a) * 4, 0);
    cabin.rotation.z = -a;
    cabin.userData.baseRot = -a;
    playgroundBox(cabin, 1.0, 0.85, 0.65, 0, -0.6, 0, [0xe74c3c, 0xf1c40f, 0x3498db, 0x2ecc71, 0xe67e22, 0x9b59b6][i]);
    ferris.add(cabin);
    cabins.push(cabin);
    ferrisSeats.push({ node: cabin, offsetY: 0.35, label: '摩天轮' });
  }
  playgroundBox(ferris, 0.6, 0.6, 0.6, 0, 0, 0, 0x7f8c8d);
  ferris.userData.cabins = cabins;
  ferris.userData.ride = {
    type: 'ferris', label: '摩天轮', board: new THREE.Vector3(14.5, platH, -6), boardRadius: 7,
    seats: ferrisSeats, exit: { x: 14.5, z: -10 },
  };
  scene.add(ferris);

  // 秋千:放大到 1.3 倍,两组座椅可乘坐
  const swing = new THREE.Group();
  swing.position.set(-13, platH + 4, 4);
  swing.scale.set(1.3, 1.15, 1.3);
  const swingSeats = [];
  for (const ox of [-1.25, 1.25]) {
    playgroundBox(swing, 0.1, 1.8, 0.1, ox - 0.45, -1.0, 0, 0x7f8c8d);
    playgroundBox(swing, 0.1, 1.8, 0.1, ox + 0.45, -1.0, 0, 0x7f8c8d);
    playgroundBox(swing, 1.1, 0.18, 0.55, ox, -1.9, 0, ox < 0 ? 0xf1c40f : 0xe74c3c);
    swingSeats.push({ local: new THREE.Vector3(ox, -0.8, 0), label: '秋千' });
  }
  swing.userData.ride = {
    type: 'swing', label: '秋千', board: new THREE.Vector3(-13, platH, 4), boardRadius: 6,
    seats: swingSeats, exit: { x: -13, z: 8 },
  };
  scene.add(swing);

  playgroundRides = { carousel, ferris, swing };
}

function getNearbyRide() {
  if (!playgroundRides || ridingRide || ridingCart) return null;
  let best = null, bestD = Infinity;
  for (const root of [playgroundRides.carousel, playgroundRides.ferris, playgroundRides.swing]) {
    const data = root && root.userData.ride;
    if (!data) continue;
    const dx = playerPos.x - data.board.x, dz = playerPos.z - data.board.z;
    const d = Math.hypot(dx, dz);
    const dy = Math.abs(playerPos.y - data.board.y);
    if (d <= data.boardRadius && dy < 4 && d < bestD) {
      best = { root, data, distance: d };
      bestD = d;
    }
  }
  return best;
}

function rideSeatWorld(ride, seat, out) {
  if (seat.node) {
    seat.node.getWorldPosition(out);
    out.y += seat.offsetY || 0;
  } else {
    out.copy(seat.local);
    ride.root.localToWorld(out);
  }
  return out;
}

function tryMountNearbyRide() {
  if (ridingRide) return false;
  const near = getNearbyRide();
  if (!near) return false;
  const seat = near.data.seats[0];
  if (!seat) return false;
  const world = new THREE.Vector3();
  rideSeatWorld(near, seat, world);
  ridingRide = { ride: near, seat, label: near.data.label };
  playerPos.copy(world);
  velocity.set(0, 0, 0);
  isFlying = false;
  // 坐下时朝设施外侧看,避免第一人称正对中心柱/座椅靠背
  if (near.data.type === 'carousel' || near.data.type === 'ferris') {
    const dx = world.x - near.root.position.x, dz = world.z - near.root.position.z;
    yaw = Math.atan2(-dx, -dz);
    pitch = 0;
  }
  showToast('坐上' + near.data.label + ' · 空格键下车');
  return true;
}

function dismountRide() {
  if (!ridingRide) return;
  const exit = ridingRide.ride.data.exit;
  ridingRide = null;
  playerPos.set(exit.x, SEA_LEVEL + 6 + 1 + PLAYER_HEIGHT * 0.5, exit.z);
  velocity.set(0, 0, 0);
  showToast('下车');
}

function updateRidePlayer() {
  if (!ridingRide) return;
  const world = new THREE.Vector3();
  rideSeatWorld(ridingRide.ride, ridingRide.seat, world);
  playerPos.copy(world);
  velocity.set(0, 0, 0);
}

function updatePlaygroundRides(dt, now) {
  if (!playgroundRides) return;
  const speed = settings.reduceMotion ? 0.15 : 1;
  if (playgroundRides.carousel) playgroundRides.carousel.rotation.y += dt * 0.55 * speed;
  if (playgroundRides.ferris) {
    const f = playgroundRides.ferris;
    f.rotation.z += dt * 0.18 * speed;
    for (const cabin of f.userData.cabins || []) cabin.rotation.z = cabin.userData.baseRot - f.rotation.z;
  }
  if (playgroundRides.swing) playgroundRides.swing.rotation.x = Math.sin(now * 0.0016) * 0.35 * speed;
}

function ensurePlaygroundCart() {
  if (typeof spawnMinecart !== 'function' || !Array.isArray(minecarts)) return;
  if (minecarts.some(c => c.cx === 0 && c.cz === 20 && Math.round(c.y) === SEA_LEVEL + 9)) return;
  spawnMinecart(0, SEA_LEVEL + 9, 20);
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
  vaultSpots.clear();           // R55:宝库/远古傀儡登记
  ancientGolemSpots.clear();
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
  clearPlaygroundProps(); // 游乐场动态设施(R55)
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
  dayCount = 1;
  stats.playTime = 0; stats.blocksMined = 0; stats.blocksPlaced = 0; stats.distance = 0;
  stats.deaths = 0; stats.kills = 0; stats.fish = 0; stats.trades = 0;
  stats._lx = undefined; stats._lz = undefined;
  goalClaimed.clear();
  discovered.clear();
  beacons.clear();
  vaults.clear();
  absorption = 0; absorptionT = 0; beaconAura = false; beaconRegenT = 0;
  shakeT = 0; shakeAmp = 0;
  if (typeof updateGoalsHUD === 'function') updateGoalsHUD();
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
  buildPlaygroundProps();
  ensurePlaygroundCart();
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
  playerPos.set(SPAWN_X, plazaH + 1 + PLAYER_HEIGHT * 0.5, SPAWN_Z);  // 精确站在广场表面(无余量)
  yaw = 0; pitch = 0;
  updateInfoCount();
  showToast('已重置到出生广场');
}

