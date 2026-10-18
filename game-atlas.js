// ============================================================
// 第三部分:像素纹理与图集(用于区块合并网格)
// ============================================================
function makePixelTexture(drawFn, size = 16) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  drawFn(ctx, size);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function parseHex(hex) {
  hex = hex.replace('#', '');
  return { r: parseInt(hex.slice(0, 2), 16), g: parseInt(hex.slice(2, 4), 16), b: parseInt(hex.slice(4, 6), 16) };
}
function rgbStr(r, g, b) {
  r = Math.max(0, Math.min(255, r | 0));
  g = Math.max(0, Math.min(255, g | 0));
  b = Math.max(0, Math.min(255, b | 0));
  return `rgb(${r},${g},${b})`;
}

// 单面纹理绘制:复用旧版本的细节画法
function drawBlockFace(ctx, type, face, s, seedRand) {
  const def = BLOCK_TYPES[type];
  const col = face === 'top' ? def.top : face === 'bottom' ? def.bottom : def.side;
  const base = parseHex(col);
  ctx.fillStyle = col; ctx.fillRect(0, 0, s, s);

  const noise = (amp) => {
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      if (seedRand() < 0.18) {
        const d = (seedRand() - 0.5) * amp;
        ctx.fillStyle = rgbStr(base.r + d, base.g + d, base.b + d);
        ctx.fillRect(x, y, 1, 1);
      }
    }
  };

  switch (type) {
    case 'grass':
      if (face === 'top') {
        noise(40);
      } else if (face === 'side') {
        noise(30);
        // 草皮过渡:每列不规则高度(2-5px)锯齿 + 底边深绿描边,贴近经典 MC 侧面
        const g = parseHex(def.top);
        for (let x = 0; x < s; x++) {
          const h = 2 + Math.floor(seedRand() * 4);
          for (let y = 0; y < h; y++) {
            const d = (seedRand() - 0.5) * 40;
            ctx.fillStyle = rgbStr(g.r + d, g.g + d, g.b + d * 0.5);
            ctx.fillRect(x, y, 1, 1);
          }
          // 草皮与泥土交界:深绿过渡行
          ctx.fillStyle = rgbStr(g.r - 34, g.g - 22, g.b - 10);
          ctx.fillRect(x, h, 1, 1);
        }
      } else noise(40);
      break;
    case 'stone': {
      // 石头:噪点 + 2-3 条随机裂纹折线(深灰)
      noise(40);
      ctx.strokeStyle = 'rgba(72,72,72,0.7)';
      ctx.lineWidth = 1;
      const cracks = 2 + Math.floor(seedRand() * 2);
      for (let i = 0; i < cracks; i++) {
        let cx = seedRand() * s, cy = seedRand() * s;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        const segs = 3 + Math.floor(seedRand() * 3);
        for (let k = 0; k < segs; k++) {
          cx = Math.max(0, Math.min(s - 1, cx + (seedRand() - 0.5) * 8));
          cy = Math.max(0, Math.min(s - 1, cy + (seedRand() - 0.5) * 8));
          ctx.lineTo(cx, cy);
        }
        ctx.stroke();
      }
      break;
    }
    case 'planks': {
      // 木板:横向板缝 + 错位竖缝 + 木纹短线
      noise(15);
      ctx.fillStyle = 'rgba(60,40,15,0.55)';
      for (let y = 0; y < s; y += 4) ctx.fillRect(0, y, s, 1);
      ctx.fillRect(Math.floor(s * 0.25), 0, 1, 4);
      ctx.fillRect(Math.floor(s * 0.7), 4, 1, 4);
      ctx.fillRect(Math.floor(s * 0.4), 8, 1, 4);
      ctx.fillRect(Math.floor(s * 0.8), 12, 1, 4);
      ctx.fillStyle = 'rgba(130,92,45,0.4)';
      for (let i = 0; i < 8; i++) ctx.fillRect((seedRand() * (s - 2)) | 0, (seedRand() * s) | 0, 2, 1);
      break;
    }
    case 'wood':
      if (face === 'side') {
        for (let x = 0; x < s; x++) {
          if (seedRand() < 0.35) {
            const d = (seedRand() - 0.5) * 50;
            ctx.fillStyle = rgbStr(base.r + d, base.g + d, base.b + d);
            ctx.fillRect(x, 0, 1, s);
          }
        }
      } else {
        // 年轮(双圈密纹,深浅交替 + 中心木芯点)
        ctx.strokeStyle = 'rgba(70,45,20,0.75)';
        ctx.lineWidth = 1;
        const cx = s / 2, cy = s / 2;
        for (let r = 2; r < s / 2; r += 2) { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke(); }
        ctx.fillStyle = 'rgba(90,60,30,0.6)';
        ctx.fillRect(cx - 0.5, cy - 0.5, 1.5, 1.5);
      }
      break;
    case 'leaves':
      // 2×2 块状明暗 + 块状孔洞:保留像素感的同时消除逐像素高频噪点(远看白斑)
      for (let y = 0; y < s; y += 2) for (let x = 0; x < s; x += 2) {
        const d = (seedRand() - 0.5) * 26;
        ctx.fillStyle = rgbStr(base.r + d, base.g + d, base.b + d);
        ctx.fillRect(x, y, 2, 2);
        if (seedRand() < 0.1) ctx.clearRect(x, y, 2, 2);
      }
      break;
    case 'brick':
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      for (let y = 0; y < s; y += 4) {
        ctx.fillRect(0, y, s, 1);
        const offset = (y / 4) % 2 === 0 ? 0 : 4;
        for (let x = offset; x < s; x += 8) ctx.fillRect(x, y, 1, 4);
      }
      break;
    case 'water':
      noise(25);
      break;
    case 'wool_red':
    case 'wool_yellow':
    case 'wool_white':
      break;
    case 'door': {
      // 木门:木板底 + 深棕门框 + 中线 + 金把手
      ctx.fillStyle = col; ctx.fillRect(0, 0, s, s);
      ctx.fillStyle = 'rgba(60,40,20,0.6)';
      ctx.fillRect(0,0,s,1); ctx.fillRect(0,s-1,s,1); ctx.fillRect(0,0,1,s); ctx.fillRect(s-1,0,1,s);
      ctx.fillRect(Math.floor(s/2),1,1,s-2);
      ctx.fillStyle = 'rgba(200,180,80,0.8)'; ctx.fillRect(Math.floor(s*0.7),Math.floor(s*0.4),1,1);
      break;
    }
    case 'door_iron': {
      // 铁门:金属灰底 + 铆钉点缀 + 中线 + 银把手
      ctx.fillStyle = col; ctx.fillRect(0, 0, s, s);
      ctx.fillStyle = 'rgba(40,40,40,0.5)';
      ctx.fillRect(0,0,s,1); ctx.fillRect(0,s-1,s,1); ctx.fillRect(0,0,1,s); ctx.fillRect(s-1,0,1,s);
      ctx.fillRect(Math.floor(s/2),1,1,s-2);
      // 铆钉(四角+中)
      ctx.fillStyle = 'rgba(180,180,180,0.6)';
      ctx.fillRect(1,1,1,1); ctx.fillRect(s-2,1,1,1); ctx.fillRect(1,s-2,1,1); ctx.fillRect(s-2,s-2,1,1);
      ctx.fillStyle = 'rgba(220,220,220,0.8)'; ctx.fillRect(Math.floor(s*0.7),Math.floor(s*0.4),1,1);
      break;
    }
    case 'door_stone': {
      // 石门:石质灰底 + 粗犷裂纹 + 中线
      ctx.fillStyle = col; ctx.fillRect(0, 0, s, s);
      ctx.fillStyle = 'rgba(50,50,50,0.4)';
      ctx.fillRect(0,0,s,1); ctx.fillRect(0,s-1,s,1); ctx.fillRect(0,0,1,s); ctx.fillRect(s-1,0,1,s);
      ctx.fillRect(Math.floor(s/2),1,1,s-2);
      // 裂纹(随机暗点)
      ctx.fillStyle = 'rgba(40,40,40,0.3)';
      ctx.fillRect(2,3,1,1); ctx.fillRect(s-3,s-4,1,1); ctx.fillRect(3,s-3,1,1);
      break;
    }
    case 'door_gold': {
      // 金门:金色底 + 华丽金边 + 宝石把手
      ctx.fillStyle = col; ctx.fillRect(0, 0, s, s);
      ctx.fillStyle = 'rgba(180,140,20,0.6)';
      ctx.fillRect(0,0,s,1); ctx.fillRect(0,s-1,s,1); ctx.fillRect(0,0,1,s); ctx.fillRect(s-1,0,1,s);
      ctx.fillRect(Math.floor(s/2),1,1,s-2);
      // 装饰金线
      ctx.fillStyle = 'rgba(255,230,100,0.5)';
      ctx.fillRect(1,2,s-2,1); ctx.fillRect(1,s-3,s-2,1);
      // 宝石把手(红宝石)
      ctx.fillStyle = 'rgba(220,60,60,0.9)'; ctx.fillRect(Math.floor(s*0.7),Math.floor(s*0.4),1,1);
      break;
    }
    case 'door_diamond': {
      // 钻石门:青蓝底 + 晶体纹路 + 钻石把手
      ctx.fillStyle = col; ctx.fillRect(0, 0, s, s);
      ctx.fillStyle = 'rgba(20,120,140,0.5)';
      ctx.fillRect(0,0,s,1); ctx.fillRect(0,s-1,s,1); ctx.fillRect(0,0,1,s); ctx.fillRect(s-1,0,1,s);
      ctx.fillRect(Math.floor(s/2),1,1,s-2);
      // 晶体高光(斜线)
      ctx.fillStyle = 'rgba(180,255,255,0.4)';
      ctx.fillRect(2,2,1,1); ctx.fillRect(3,3,1,1); ctx.fillRect(s-4,s-4,1,1); ctx.fillRect(s-3,s-3,1,1);
      // 钻石把手
      ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fillRect(Math.floor(s*0.7),Math.floor(s*0.4),1,1);
      break;
    }
    case 'cobblestone': {
      // 圆石:石底 + 深色卵石裂缝网
      noise(22);
      ctx.strokeStyle = 'rgba(40,40,40,0.55)';
      ctx.lineWidth = 1;
      for (let gy = 0; gy < s; gy += Math.floor(s / 4)) {
        ctx.beginPath();
        ctx.moveTo(0, gy + Math.floor(seedRand() * 3));
        for (let gx = 0; gx <= s; gx += 4) ctx.lineTo(gx, gy + Math.floor(seedRand() * 4));
        ctx.stroke();
      }
      break;
    }
    case 'bookshelf': {
      // 书架:木框 + 侧面三层彩色书脊(确定性),顶/底木板纹
      if (face === 'top' || face === 'bottom') { noise(18); break; }
      noise(18);
      ctx.fillStyle = '#6e4f2a';
      ctx.fillRect(0, 0, s, 2);
      ctx.fillRect(Math.floor(s / 3), 2, 2, Math.floor(s / 3));
      ctx.fillRect(Math.floor(s * 2 / 3), 2, 2, Math.floor(s / 3));
      ctx.fillRect(0, Math.floor(s / 3), s, 2);
      ctx.fillRect(Math.floor(s / 4), Math.floor(s / 3) + 2, 2, Math.floor(s / 3));
      ctx.fillRect(Math.floor(s * 3 / 4), Math.floor(s / 3) + 2, 2, Math.floor(s / 3));
      ctx.fillRect(0, Math.floor(s * 2 / 3), s, 2);
      ctx.fillRect(0, s - 2, s, 2);
      // 书脊(三层,确定性颜色)
      const spineColors = ['#a03030', '#3a6a3a', '#3050a0', '#a08030', '#7a3a7a'];
      let li = 0;
      for (let row = 0; row < 3; row++) {
        const y0 = 3 + row * Math.floor(s / 3);
        let x = 3;
        while (x < s - 3) {
          const w = 1 + Math.floor(seedRand() * 2);
          if (seedRand() < 0.82) {
            ctx.fillStyle = spineColors[li % spineColors.length];
            li++;
            ctx.fillRect(x, y0, w, Math.floor(s / 3) - 3);
          }
          x += w + 1;
        }
      }
      break;
    }
    case 'ladder': {
      // 梯子:两根竖轨 + 横档,间隙透明(alphaTest);攀爬体积(非固体)
      ctx.clearRect(0, 0, s, s);
      const rw = Math.max(1, Math.floor(s / 9));
      const railX0 = Math.floor(s * 0.18);
      const railX1 = s - Math.floor(s * 0.18) - rw;
      ctx.fillStyle = '#8a5a30';
      ctx.fillRect(railX0, 0, rw, s);
      ctx.fillRect(railX1, 0, rw, s);
      ctx.fillStyle = '#b5824f';
      const step = Math.max(2, Math.floor(s / 4));
      for (let gy = Math.floor(step * 0.5); gy < s; gy += step) {
        ctx.fillRect(railX0, gy, railX1 + rw - railX0, rw);
      }
      break;
    }
    case 'bed': {
      // 床:顶面 = 白枕头(头端 1/3)+ 红毯;侧面红毯+木底
      if (face === 'top') {
        ctx.fillStyle = '#f0f0f0';
        ctx.fillRect(0, 0, s, Math.floor(s / 3));
        ctx.fillStyle = '#b03028';
        ctx.fillRect(0, Math.floor(s / 3), s, s - Math.floor(s / 3));
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.fillRect(0, Math.floor(s / 3), s, 2);
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        for (let gx = 0; gx < s; gx += 4) ctx.fillRect(gx, Math.floor(s / 3) + 3, 1, s);
      } else {
        ctx.fillStyle = col; ctx.fillRect(0, 0, s, s);
        ctx.fillStyle = '#8a5f28';
        ctx.fillRect(0, Math.floor(s * 0.8), s, Math.floor(s * 0.2));
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fillRect(0, Math.floor(s * 0.35), s, 2);
      }
      break;
    }
    case 'chest': {
      // 箱子:木板底 + 深色箱沿 + 中间搭扣
      noise(18);
      ctx.fillStyle = 'rgba(70,45,18,0.85)';
      ctx.fillRect(0, 0, s, 2);
      ctx.fillRect(0, Math.floor(s * 0.42), s, 2);
      ctx.fillRect(0, s - 2, s, 2);
      ctx.fillRect(0, 0, 2, s);
      ctx.fillRect(s - 2, 0, 2, s);
      ctx.fillStyle = '#d8d8d8';
      ctx.fillRect(Math.floor(s / 2) - 1, Math.floor(s * 0.42), 3, Math.floor(s * 0.18));
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(3, 3, s - 6, 2);
      break;
    }
    case 'furnace': {
      // 熔炉:石底 + 深色炉口 + 炉火 + 顶部通风口
      noise(25);
      ctx.fillStyle = '#2a2a2a';
      ctx.fillRect(Math.floor(s * 0.2), Math.floor(s * 0.45), Math.floor(s * 0.6), Math.floor(s * 0.35));
      ctx.fillStyle = '#ff8830';
      ctx.fillRect(Math.floor(s * 0.28), Math.floor(s * 0.62), Math.floor(s * 0.44), Math.floor(s * 0.14));
      ctx.fillStyle = '#3a3a3a';
      ctx.fillRect(Math.floor(s * 0.3), Math.floor(s * 0.2), Math.floor(s * 0.4), Math.floor(s * 0.12));
      break;
    }
    case 'enchanting_table': {
      // 附魔台(R28):暗紫底 + 石台 + 红书页 + 钻石亮点
      noise(14);
      ctx.fillStyle = '#1a1024';
      ctx.fillRect(0, 0, s, s);
      ctx.fillStyle = '#3a2a4a';
      ctx.fillRect(0, Math.floor(s * 0.62), s, Math.floor(s * 0.38));
      ctx.fillStyle = '#d8d8e0';
      ctx.fillRect(Math.floor(s * 0.18), Math.floor(s * 0.5), Math.floor(s * 0.64), Math.floor(s * 0.14));
      ctx.fillStyle = '#a03030';
      ctx.fillRect(Math.floor(s * 0.3), Math.floor(s * 0.14), Math.floor(s * 0.4), Math.floor(s * 0.32));
      ctx.fillStyle = '#5fe3e8';
      ctx.fillRect(Math.floor(s * 0.42), Math.floor(s * 0.2), Math.floor(s * 0.16), Math.floor(s * 0.18));
      ctx.fillStyle = 'rgba(95,227,232,0.5)';
      ctx.fillRect(Math.floor(s * 0.08), Math.floor(s * 0.08), Math.floor(s * 0.1), Math.floor(s * 0.1));
      ctx.fillRect(Math.floor(s * 0.82), Math.floor(s * 0.3), Math.floor(s * 0.1), Math.floor(s * 0.1));
      break;
    }
    case 'rail': {
      // 铁轨(R26):顶/底面 = 俯视轨道(双钢轨 + 横向枕木);侧面 = 仅底部薄轨线(贴地,透明挖空)
      ctx.clearRect(0, 0, s, s);
      if (face === 'top' || face === 'bottom') {
        ctx.fillStyle = '#6e4f2a';
        for (let i = 0; i < 4; i++) ctx.fillRect(0, Math.floor(s * (0.1 + i * 0.24)), s, Math.max(1, Math.floor(s * 0.1)));
        ctx.fillStyle = '#b8b8c0';
        ctx.fillRect(Math.floor(s * 0.3), 0, Math.max(1, Math.floor(s * 0.08)), s);
        ctx.fillRect(Math.floor(s * 0.62), 0, Math.max(1, Math.floor(s * 0.08)), s);
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.fillRect(Math.floor(s * 0.3), 0, Math.max(1, Math.floor(s * 0.03)), s);
      } else {
        ctx.fillStyle = '#b8b8c0';
        ctx.fillRect(0, s - Math.max(1, Math.floor(s * 0.1)), s, Math.max(1, Math.floor(s * 0.1)));
        ctx.fillStyle = '#6e4f2a';
        ctx.fillRect(Math.floor(s * 0.18), s - Math.max(1, Math.floor(s * 0.08)), Math.floor(s * 0.2), Math.max(1, Math.floor(s * 0.06)));
        ctx.fillRect(Math.floor(s * 0.62), s - Math.max(1, Math.floor(s * 0.08)), Math.floor(s * 0.2), Math.max(1, Math.floor(s * 0.06)));
      }
      break;
    }
    case 'torch': {
      // 火把:透明底(alphaTest)+ 细木棍 + 发光头部(火焰芯 + 光晕)
      ctx.clearRect(0, 0, s, s);
      ctx.fillStyle = '#8a6430';
      ctx.fillRect(Math.floor(s * 0.44), Math.floor(s * 0.32), Math.max(1, Math.floor(s * 0.12)), Math.floor(s * 0.62));
      ctx.fillStyle = 'rgba(120,80,40,0.5)';
      ctx.fillRect(Math.floor(s * 0.52), Math.floor(s * 0.32), Math.max(1, Math.floor(s * 0.05)), Math.floor(s * 0.62));
      ctx.fillStyle = '#ffd86b';
      ctx.fillRect(Math.floor(s * 0.38), Math.floor(s * 0.18), Math.floor(s * 0.24), Math.floor(s * 0.18));
      ctx.fillStyle = '#ff9a3c';
      ctx.fillRect(Math.floor(s * 0.42), Math.floor(s * 0.12), Math.floor(s * 0.16), Math.floor(s * 0.1));
      ctx.fillStyle = 'rgba(255,200,90,0.35)';
      ctx.fillRect(Math.floor(s * 0.3), Math.floor(s * 0.06), Math.floor(s * 0.4), Math.floor(s * 0.3));
      break;
    }
    case 'glass': {
      // 玻璃:浅色边框 + 斜高光,中心透明(alphaTest 挖空)
      ctx.clearRect(0, 0, s, s);
      ctx.strokeStyle = 'rgba(205,232,240,0.9)';
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, 0.5, s - 1, s - 1);
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath(); ctx.moveTo(s * 0.58, s * 0.16); ctx.lineTo(s * 0.84, s * 0.42); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(s * 0.7, s * 0.1); ctx.lineTo(s * 0.9, s * 0.3); ctx.stroke();
      break;
    }
    case 'slime': {
      // 黏液块(R35):半透明胶质 —— 外圈凝胶边框 + 内部深一档胶芯 + 斜高光 + 两粒气泡
      ctx.fillStyle = face === 'top' ? '#6fc05a' : face === 'bottom' ? '#4f9c40' : '#5eae4c';
      ctx.fillRect(0, 0, s, s);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(0, 0, s, Math.max(1, Math.floor(s * 0.08)));
      ctx.fillRect(0, 0, Math.max(1, Math.floor(s * 0.08)), s);
      ctx.fillStyle = face === 'top' ? 'rgba(70,140,55,0.55)' : 'rgba(60,120,48,0.55)';
      ctx.fillRect(Math.floor(s * 0.22), Math.floor(s * 0.22), Math.floor(s * 0.56), Math.floor(s * 0.56));
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(Math.floor(s * 0.3), Math.floor(s * 0.3), Math.max(1, Math.floor(s * 0.09)), Math.max(1, Math.floor(s * 0.09)));
      ctx.fillRect(Math.floor(s * 0.68), Math.floor(s * 0.16), Math.max(1, Math.floor(s * 0.06)), Math.max(1, Math.floor(s * 0.06)));
      ctx.fillStyle = 'rgba(220,255,210,0.3)';
      ctx.fillRect(Math.floor(s * 0.6), Math.floor(s * 0.62), Math.max(1, Math.floor(s * 0.07)), Math.max(1, Math.floor(s * 0.07)));
      break;
    }
    case 'spawner': {
      // 刷怪笼(R37):深色笼格(横竖栏杆)+ 内部暗红芯 + 四角铆钉
      ctx.clearRect(0, 0, s, s);
      ctx.fillStyle = '#232330';
      ctx.fillRect(0, 0, s, s);
      ctx.fillStyle = '#3a3a48';
      for (let i = 0; i < 4; i++) ctx.fillRect(0, Math.floor(s * (0.14 + i * 0.24)), s, Math.max(1, Math.floor(s * 0.07)));
      for (let i = 0; i < 4; i++) ctx.fillRect(Math.floor(s * (0.14 + i * 0.24)), 0, Math.max(1, Math.floor(s * 0.07)), s);
      ctx.strokeStyle = '#4a4a5a'; ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, s - 2, s - 2);
      ctx.fillStyle = 'rgba(200,60,30,0.45)';   // 笼芯暗火
      ctx.fillRect(Math.floor(s * 0.36), Math.floor(s * 0.36), Math.floor(s * 0.28), Math.floor(s * 0.28));
      ctx.fillStyle = 'rgba(255,120,50,0.35)';
      ctx.fillRect(Math.floor(s * 0.42), Math.floor(s * 0.42), Math.floor(s * 0.16), Math.floor(s * 0.16));
      break;
    }
    case 'redstone': {
      // 红石线(R38):透明底 + 十字红粉轨迹(顶/底面);侧面仅底部细线
      ctx.clearRect(0, 0, s, s);
      const dust = '#c03028', dustHi = '#e05040';
      if (face === 'top' || face === 'bottom') {
        ctx.fillStyle = dust;
        ctx.fillRect(Math.floor(s * 0.06), Math.floor(s * 0.42), Math.floor(s * 0.88), Math.floor(s * 0.16));
        ctx.fillRect(Math.floor(s * 0.42), Math.floor(s * 0.06), Math.floor(s * 0.16), Math.floor(s * 0.88));
        ctx.fillStyle = dustHi;
        ctx.fillRect(Math.floor(s * 0.4), Math.floor(s * 0.4), Math.floor(s * 0.2), Math.floor(s * 0.2));
        ctx.fillRect(Math.floor(s * 0.1), Math.floor(s * 0.46), Math.floor(s * 0.12), Math.floor(s * 0.08));
      } else {
        ctx.fillStyle = dust;
        ctx.fillRect(0, s - Math.max(1, Math.floor(s * 0.08)), s, Math.max(1, Math.floor(s * 0.08)));
      }
      break;
    }
    case 'redstone_torch': {
      // 红石火把(R38):木棍 + 红色发光头 + 暗红光晕(透明底)
      ctx.clearRect(0, 0, s, s);
      ctx.fillStyle = '#8a6430';
      ctx.fillRect(Math.floor(s * 0.44), Math.floor(s * 0.34), Math.max(1, Math.floor(s * 0.12)), Math.floor(s * 0.6));
      ctx.fillStyle = 'rgba(200,40,30,0.35)';
      ctx.fillRect(Math.floor(s * 0.28), Math.floor(s * 0.04), Math.floor(s * 0.44), Math.floor(s * 0.36));
      ctx.fillStyle = '#ff5040';
      ctx.fillRect(Math.floor(s * 0.38), Math.floor(s * 0.18), Math.floor(s * 0.24), Math.floor(s * 0.2));
      ctx.fillStyle = '#ffd0c0';
      ctx.fillRect(Math.floor(s * 0.43), Math.floor(s * 0.22), Math.floor(s * 0.12), Math.floor(s * 0.1));
      break;
    }
    case 'lever_off':
    case 'lever_on': {
      // 拉杆(R38):圆石底座 + 斜杆(关=灰暗斜靠 / 开=橙亮竖起)
      ctx.clearRect(0, 0, s, s);
      const on = type === 'lever_on';
      ctx.fillStyle = '#6a6a72';
      ctx.fillRect(Math.floor(s * 0.2), Math.floor(s * 0.74), Math.floor(s * 0.6), Math.floor(s * 0.14));
      ctx.fillStyle = '#8a8a92';
      ctx.fillRect(Math.floor(s * 0.26), Math.floor(s * 0.7), Math.floor(s * 0.48), Math.floor(s * 0.08));
      ctx.strokeStyle = on ? '#e08030' : '#7a7a82';
      ctx.lineWidth = Math.max(2, Math.floor(s * 0.1)); ctx.lineCap = 'round';
      ctx.beginPath();
      if (on) { ctx.moveTo(Math.floor(s * 0.5), Math.floor(s * 0.72)); ctx.lineTo(Math.floor(s * 0.5), Math.floor(s * 0.24)); }
      else { ctx.moveTo(Math.floor(s * 0.5), Math.floor(s * 0.72)); ctx.lineTo(Math.floor(s * 0.76), Math.floor(s * 0.4)); }
      ctx.stroke();
      if (on) {
        ctx.fillStyle = '#ffb060';
        ctx.beginPath(); ctx.arc(Math.floor(s * 0.5), Math.floor(s * 0.24), Math.floor(s * 0.07), 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    case 'sugarcane': {
      // 甘蔗(R40):透明底 + 数根绿色节节秆(节环高光)
      ctx.clearRect(0, 0, s, s);
      const canes = [[-0.22, 0], [0.02, 0.06], [0.24, -0.04]];
      for (const [fx, off] of canes) {
        ctx.fillStyle = '#6ab840';
        ctx.fillRect(Math.floor(s * (fx - 0.045)), Math.floor(s * 0.06), Math.max(2, Math.floor(s * 0.09)), Math.floor(s * 0.9));
        ctx.fillStyle = '#8ed860';
        for (let k = 0; k < 4; k++) ctx.fillRect(Math.floor(s * (fx - 0.045)), Math.floor(s * (0.14 + k * 0.22 + off * 0.1)), Math.max(2, Math.floor(s * 0.09)), Math.max(1, Math.floor(s * 0.05)));
      }
      break;
    }
    case 'cake': {
      // 蛋糕(R40):白奶油层 + 黄糕体 + 顶面红果点缀
      ctx.fillStyle = '#d8b890';
      ctx.fillRect(Math.floor(s * 0.06), Math.floor(s * 0.5), Math.floor(s * 0.88), Math.floor(s * 0.44));
      ctx.fillStyle = '#f0e0d0';
      ctx.fillRect(Math.floor(s * 0.1), Math.floor(s * 0.34), Math.floor(s * 0.8), Math.floor(s * 0.2));
      ctx.fillStyle = '#f8f0e8';
      ctx.fillRect(Math.floor(s * 0.06), Math.floor(s * 0.12), Math.floor(s * 0.88), Math.floor(s * 0.24));
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1;
      ctx.strokeRect(Math.floor(s * 0.06), Math.floor(s * 0.12), Math.floor(s * 0.88), Math.floor(s * 0.82));
      ctx.fillStyle = '#d03040';
      for (const fx of [0.22, 0.5, 0.78]) { ctx.beginPath(); ctx.arc(Math.floor(s * fx), Math.floor(s * 0.2), Math.max(1, Math.floor(s * 0.045)), 0, Math.PI * 2); ctx.fill(); }
      break;
    }
    case 'fence': {
      // 栅栏(R41):透明底 + 中柱 + 上下双横栏(alphaTest 镂空)
      ctx.clearRect(0, 0, s, s);
      const wood = '#96702f', woodHi = '#a0763a';
      ctx.fillStyle = wood;
      ctx.fillRect(Math.floor(s * 0.42), 0, Math.floor(s * 0.16), s);   // 中柱
      ctx.fillStyle = woodHi;
      ctx.fillRect(Math.floor(s * 0.42), 0, Math.floor(s * 0.06), s);   // 柱高光
      for (const fy of [0.18, 0.66]) {   // 双横栏
        ctx.fillStyle = wood;
        ctx.fillRect(0, Math.floor(s * fy), s, Math.max(2, Math.floor(s * 0.1)));
        ctx.fillStyle = woodHi;
        ctx.fillRect(0, Math.floor(s * fy), s, Math.max(1, Math.floor(s * 0.035)));
      }
      break;
    }
    case 'stairs_planks':
    case 'stairs_cobble': {
      // 楼梯(R41):底半实心 + 上半靠一侧的台阶(侧面阶梯纹理;顶/底面纯色)
      const wood = type === 'stairs_planks';
      ctx.fillStyle = wood ? '#a0763a' : '#7a7a7a';
      ctx.fillRect(0, 0, s, s);
      if (face === 'side') {
        ctx.fillStyle = wood ? '#8a6430' : '#6f6f6f';
        ctx.fillRect(0, 0, Math.floor(s * 0.5), Math.floor(s * 0.5));   // 台阶暗面(左上)
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(Math.floor(s * 0.5), 0, Math.max(1, Math.floor(s * 0.04)), Math.floor(s * 0.5));   // 台阶立沿
      }
      ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, Math.floor(s * 0.5)); ctx.lineTo(s, Math.floor(s * 0.5)); ctx.stroke();
      break;
    }
    case 'repeater_off':
    case 'repeater_on': {
      // 中继器(R42):石底座 + 前后两支小火把(开态亮红发光)
      const on = type === 'repeater_on';
      ctx.clearRect(0, 0, s, s);
      ctx.fillStyle = on ? '#c8b8a8' : '#98988f';
      ctx.fillRect(Math.floor(s * 0.08), Math.floor(s * 0.3), Math.floor(s * 0.84), Math.floor(s * 0.62));
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(Math.floor(s * 0.08), Math.floor(s * 0.3), Math.floor(s * 0.84), Math.max(1, Math.floor(s * 0.06)));
      const torchCol = on ? '#ff5040' : '#7a3a30';
      for (const fx of [0.26, 0.62]) {
        ctx.fillStyle = '#8a6430';
        ctx.fillRect(Math.floor(s * fx), Math.floor(s * 0.5), Math.max(2, Math.floor(s * 0.1)), Math.floor(s * 0.34));
        ctx.fillStyle = torchCol;
        ctx.fillRect(Math.floor(s * (fx - 0.02)), Math.floor(s * 0.34), Math.floor(s * 0.14), Math.floor(s * 0.18));
        if (on) { ctx.fillStyle = '#ffd0c0'; ctx.fillRect(Math.floor(s * (fx + 0.01)), Math.floor(s * 0.37), Math.floor(s * 0.07), Math.floor(s * 0.08)); }
      }
      break;
    }
    case 'piston':
    case 'piston_ext': {
      // 活塞(R42):木板框 + 铁芯;伸出态顶面带推出杆(浅灰杆+深框)
      const ext = type === 'piston_ext';
      ctx.fillStyle = '#96702f';
      ctx.fillRect(0, 0, s, s);
      ctx.fillStyle = '#a0763a';
      for (let i = 0; i < 4; i++) ctx.fillRect(0, Math.floor(s * (0.08 + i * 0.24)), s, Math.max(1, Math.floor(s * 0.08)));
      const core = face === 'top' || face === 'bottom';
      if (ext) {
        // 伸出态:顶面 = 木质推出头;侧面 = 杆
        if (core) { ctx.fillStyle = '#b08243'; ctx.fillRect(Math.floor(s * 0.1), Math.floor(s * 0.1), Math.floor(s * 0.8), Math.floor(s * 0.8)); ctx.strokeStyle = '#6e4f2a'; ctx.lineWidth = 2; ctx.strokeRect(Math.floor(s * 0.1) + 1, Math.floor(s * 0.1) + 1, Math.floor(s * 0.8) - 2, Math.floor(s * 0.8) - 2); }
        else { ctx.fillStyle = '#c8c8d2'; ctx.fillRect(Math.floor(s * 0.38), Math.floor(s * 0.06), Math.floor(s * 0.24), Math.floor(s * 0.9)); ctx.fillStyle = '#9a9aa8'; ctx.fillRect(Math.floor(s * 0.52), Math.floor(s * 0.06), Math.floor(s * 0.1), Math.floor(s * 0.9)); }
      } else if (core) {
        ctx.fillStyle = '#c8c8d2';
        ctx.fillRect(Math.floor(s * 0.24), Math.floor(s * 0.24), Math.floor(s * 0.52), Math.floor(s * 0.52));
        ctx.fillStyle = '#8a6a20';
        ctx.fillRect(Math.floor(s * 0.4), Math.floor(s * 0.4), Math.floor(s * 0.2), Math.floor(s * 0.2));
      }
      break;
    }
    case 'redstone_ore': {
      // 红石矿(R38):石底 + 分层红斑(暗圈→红芯→高光)
      ctx.fillStyle = '#7c7c7c';
      ctx.fillRect(0, 0, s, s);
      const spots = [[0.24, 0.28], [0.62, 0.2], [0.4, 0.62], [0.72, 0.58], [0.18, 0.66]];
      for (const [fx, fy] of spots) {
        ctx.fillStyle = '#7a2018';
        ctx.fillRect(Math.floor(s * (fx - 0.06)), Math.floor(s * (fy - 0.06)), Math.floor(s * 0.12), Math.floor(s * 0.12));
        ctx.fillStyle = '#c03028';
        ctx.fillRect(Math.floor(s * (fx - 0.03)), Math.floor(s * (fy - 0.03)), Math.floor(s * 0.06), Math.floor(s * 0.06));
        ctx.fillStyle = '#ff7060';
        ctx.fillRect(Math.floor(s * fx), Math.floor(s * fy), Math.max(1, Math.floor(s * 0.02)), Math.max(1, Math.floor(s * 0.02)));
      }
      break;
    }
    case 'tnt': {
      // TNT:红底 + 白色中带 + 深色字样点
      noise(20);
      ctx.fillStyle = '#e8e0d0';
      ctx.fillRect(0, Math.floor(s * 0.4), s, Math.floor(s * 0.22));
      ctx.fillStyle = '#3a2a20';
      const gy = Math.floor(s * 0.46);
      ctx.fillRect(Math.floor(s * 0.16), gy, 1, Math.floor(s * 0.1));
      ctx.fillRect(Math.floor(s * 0.3), gy, Math.floor(s * 0.08), 1);
      ctx.fillRect(Math.floor(s * 0.3), gy, 1, Math.floor(s * 0.1));
      ctx.fillRect(Math.floor(s * 0.46), gy, 1, Math.floor(s * 0.1));
      ctx.fillRect(Math.floor(s * 0.58), gy, Math.floor(s * 0.08), 1);
      ctx.fillRect(Math.floor(s * 0.66), gy, 1, Math.floor(s * 0.1));
      ctx.fillRect(Math.floor(s * 0.8), gy, 1, Math.floor(s * 0.1));
      ctx.fillRect(Math.floor(s * 0.76), gy + Math.floor(s * 0.08), Math.floor(s * 0.08), 1);
      break;
    }
    case 'coal_ore':
    case 'iron_ore':
    case 'gold_ore':
    case 'diamond_ore': {
      // 矿石:石底 + 分层色斑(暗色外圈 → 矿色内芯 → 高光点),立体矿粒感
      noise(25);
      const speck = type === 'coal_ore' ? '#232323' : type === 'iron_ore' ? '#d8af8a' : type === 'gold_ore' ? '#e8c040' : '#5fe3e8';
      const speckDark = type === 'coal_ore' ? 'rgba(10,10,10,0.55)' : type === 'iron_ore' ? 'rgba(120,80,50,0.5)' : type === 'gold_ore' ? 'rgba(120,90,20,0.55)' : 'rgba(30,110,130,0.5)';
      const spots = 4 + Math.floor(seedRand() * 2);
      for (let i = 0; i < spots; i++) {
        const px = 1 + Math.floor(seedRand() * (s - 4));
        const py = 1 + Math.floor(seedRand() * (s - 4));
        ctx.fillStyle = speckDark;
        ctx.fillRect(px - 1, py - 1, 4, 4);      // 暗色外圈(嵌入感)
        ctx.fillStyle = speck;
        ctx.fillRect(px, py, 2, 2);               // 矿色内芯
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.fillRect(px, py, 1, 1);               // 高光点
      }
      break;
    }
    case 'crafting_table': {
      // 合成台:木板底 + 顶面 3×3 网格纹 + 侧面工具图案
      ctx.fillStyle = col; ctx.fillRect(0, 0, s, s);
      if (face === 'top') {
        ctx.fillStyle = 'rgba(60,40,20,0.55)';
        const g = Math.floor(s / 3);
        for (let i = 1; i < 3; i++) { ctx.fillRect(g * i, 0, 1, s); ctx.fillRect(0, g * i, s, 1); }
        ctx.strokeStyle = 'rgba(60,40,20,0.8)'; ctx.lineWidth = 1;
        ctx.strokeRect(0.5, 0.5, s - 1, s - 1);
      } else {
        ctx.fillStyle = 'rgba(60,40,20,0.75)';
        ctx.fillRect(Math.floor(s * 0.15), Math.floor(s * 0.2), Math.floor(s * 0.28), Math.floor(s * 0.28));
        ctx.fillRect(Math.floor(s * 0.57), Math.floor(s * 0.2), Math.floor(s * 0.28), Math.floor(s * 0.1));
        ctx.fillStyle = 'rgba(220,210,190,0.5)';
        ctx.fillRect(Math.floor(s * 0.2), Math.floor(s * 0.55), Math.floor(s * 0.6), Math.floor(s * 0.08));
      }
      break;
    }
    case 'wool_black':
      // 羊毛:接近纯色,仅 ~5% 像素加微弱噪点(比默认 18% 干净),适合装饰
      for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
        if (seedRand() < 0.05) {
          const d = (seedRand() - 0.5) * 12;   // 极小幅度,保持扁平纯色感
          ctx.fillStyle = rgbStr(base.r + d, base.g + d, base.b + d);
          ctx.fillRect(x, y, 1, 1);
        }
      }
      break;
    case 'iron_bars': {
      // 铁栏杆:透明底 + 三根竖栏 + 两道横栏(alphaTest 镂空)
      ctx.clearRect(0, 0, s, s);
      ctx.fillStyle = '#b8b8c4';
      const bw = Math.max(1, Math.floor(s * 0.1));
      for (const fx of [0.2, 0.45, 0.7]) ctx.fillRect(Math.floor(s * fx), 0, bw, s);
      ctx.fillStyle = '#8a8a96';
      ctx.fillRect(0, Math.floor(s * 0.25), s, Math.max(1, Math.floor(s * 0.08)));
      ctx.fillRect(0, Math.floor(s * 0.67), s, Math.max(1, Math.floor(s * 0.08)));
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fillRect(Math.floor(s * 0.2), 0, 1, s);
      break;
    }
    case 'obsidian': {
      // 黑曜石:深紫黑底 + 紫色裂纹高光
      noise(20);
      ctx.strokeStyle = 'rgba(120,80,180,0.45)'; ctx.lineWidth = 1;
      for (let i = 0; i < 4; i++) {
        let cx = seedRand() * s, cy = seedRand() * s;
        ctx.beginPath(); ctx.moveTo(cx, cy);
        for (let k = 0; k < 4; k++) { cx = Math.max(0, Math.min(s - 1, cx + (seedRand() - 0.5) * 9)); cy = Math.max(0, Math.min(s - 1, cy + (seedRand() - 0.5) * 9)); ctx.lineTo(cx, cy); }
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(180,140,240,0.5)';
      ctx.fillRect(Math.floor(s * 0.3), Math.floor(s * 0.3), 1, 1);
      ctx.fillRect(Math.floor(s * 0.7), Math.floor(s * 0.6), 1, 1);
      break;
    }
    case 'vault': {
      // 封印宝库:黑曜石框 + 中央紫色符文
      ctx.fillStyle = '#1a1226'; ctx.fillRect(0, 0, s, s);
      ctx.strokeStyle = '#6a4a9a'; ctx.lineWidth = 1;
      ctx.strokeRect(1, 1, s - 2, s - 2);
      ctx.fillStyle = '#b06ee0';
      ctx.fillRect(Math.floor(s * 0.28), Math.floor(s * 0.28), Math.floor(s * 0.44), Math.floor(s * 0.44));
      ctx.fillStyle = '#e8c8ff';
      ctx.fillRect(Math.floor(s * 0.4), Math.floor(s * 0.4), Math.floor(s * 0.2), Math.floor(s * 0.2));
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillRect(Math.floor(s * 0.42), Math.floor(s * 0.42), 1, 1);
      break;
    }
    case 'beacon': {
      // 信标:深青石框 + 中央发光核
      ctx.fillStyle = '#2a8898'; ctx.fillRect(0, 0, s, s);
      ctx.fillStyle = '#1a5a68';
      ctx.fillRect(0, 0, s, 2); ctx.fillRect(0, s - 2, s, 2); ctx.fillRect(0, 0, 2, s); ctx.fillRect(s - 2, 0, 2, s);
      ctx.fillStyle = '#7fe8d8';
      ctx.fillRect(Math.floor(s * 0.3), Math.floor(s * 0.3), Math.floor(s * 0.4), Math.floor(s * 0.4));
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(Math.floor(s * 0.44), Math.floor(s * 0.44), Math.floor(s * 0.12), Math.floor(s * 0.12));
      break;
    }
    case 'pumpkin':
    case 'carved_pumpkin':
    case 'pumpkin_lantern': {
      // 南瓜系(R57):顶/底 = 瓜蒂 + 放射沟;侧面 = 竖瓜棱,雕刻款带脸(灯款发光)
      const carved = type !== 'pumpkin';
      const lantern = type === 'pumpkin_lantern';
      if (face === 'top' || face === 'bottom') {
        noise(18);
        ctx.fillStyle = 'rgba(120,74,18,0.5)';
        for (let k = 0; k < 8; k++) {
          const a = k * Math.PI / 4;
          ctx.fillRect(Math.round(s / 2 + Math.cos(a) * 6), Math.round(s / 2 + Math.sin(a) * 6), 1, 1);
        }
        ctx.fillStyle = 'rgba(96,60,16,0.85)';
        ctx.fillRect(s / 2 - 2, s / 2 - 2, 4, 4);
      } else {
        noise(14);
        // 瓜棱:深沟 + 紧邻高光,3px 一个循环
        ctx.fillStyle = 'rgba(96,52,6,0.6)';
        for (let x = 1; x < s; x += 3) ctx.fillRect(x, 0, 1, s);
        ctx.fillStyle = 'rgba(255,214,140,0.35)';
        for (let x = 2; x < s; x += 3) ctx.fillRect(x, 0, 1, s);
        if (carved) {
          ctx.fillStyle = lantern ? '#fff0b0' : '#2a1404';
          // 三角眼(尖朝上)
          const eye = (ox) => {
            ctx.fillRect(ox + 1, 4, 2, 1);
            ctx.fillRect(ox, 5, 4, 1);
            ctx.fillRect(ox, 6, 4, 1);
          };
          eye(2); eye(9);
          // 锯齿嘴
          ctx.fillRect(3, 10, 10, 2);
          ctx.fillStyle = col;
          ctx.fillRect(5, 11, 1, 1);
          ctx.fillRect(8, 11, 1, 1);
          ctx.fillRect(11, 11, 1, 1);
          if (lantern) {                // 灯:整面透出暖光
            ctx.fillStyle = 'rgba(255,224,140,0.22)';
            ctx.fillRect(0, 0, s, s);
            ctx.fillStyle = 'rgba(255,236,170,0.4)';
            ctx.fillRect(0, 0, s, 2);
            ctx.fillRect(0, s - 2, s, 2);
          }
        }
      }
      break;
    }
    default:
      noise(40);
  }
}

// 构建纹理图集:每种方块占 top/side/bottom 三格(共 N×3 格,横向排列)
const ATLAS_TILE = 16;       // 每格 16 像素
let atlasTexture = null;     // CanvasTexture
let matSolidChunk = null;    // 共享区块实体材质(性能:避免每区块 new)
let matWaterChunk = null;    // 共享水材质
let atlasUV = {};            // type -> { top:[u0,v0,u1,v1], side, bottom } (已归一化到 0..1)

function buildAtlas() {
  const blockList = Object.keys(BLOCK_TYPES);
  const cols = blockList.length;
  const c = document.createElement('canvas');
  c.width = cols * ATLAS_TILE;
  c.height = 3 * ATLAS_TILE; // 行: 0=top 1=side 2=bottom
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  blockList.forEach((type, ci) => {
    // 每种方块用固定种子的伪随机,保证纹理稳定
    let st = (BLOCK_ID[type] * 2654435761) >>> 0;
    const rand = () => { st = (st * 1664525 + 1013904223) >>> 0; return st / 4294967296; };
    const faces = ['top', 'side', 'bottom'];
    faces.forEach((face, ri) => {
      const sub = document.createElement('canvas');
      sub.width = sub.height = ATLAS_TILE;
      const sctx = sub.getContext('2d');
      drawBlockFace(sctx, type, face, ATLAS_TILE, rand);
      ctx.drawImage(sub, ci * ATLAS_TILE, ri * ATLAS_TILE);
    });
    const u0 = (ci * ATLAS_TILE) / c.width;
    const u1 = ((ci + 1) * ATLAS_TILE) / c.width;
    atlasUV[type] = {
      // CanvasTexture 默认 flipY=true:UV v=0 对应画布底部。
      // 画布行序为 top(0..15)/side(16..31)/bottom(32..47),
      // 因此 top 必须取 v=2/3..1、side 取 1/3..2/3、bottom 取 0..1/3;
      // 旧映射把 top/bottom 取反,导致草方块顶面显示成泥土色(整体偏棕)。
      top:    [u0, 1, u1, 2 / 3],
      side:   [u0, 2 / 3, u1, 1 / 3],
      bottom: [u0, 1 / 3, u1, 0],
    };
  });

  atlasTexture = new THREE.CanvasTexture(c);
  atlasTexture.magFilter = THREE.NearestFilter;
  atlasTexture.minFilter = THREE.NearestFilter;
  atlasTexture.colorSpace = THREE.SRGBColorSpace;

  // 共享区块材质:所有区块的 solid/water mesh 复用这两个材质,避免每区块 new ~242 个 Material
  matSolidChunk = new THREE.MeshLambertMaterial({ map: atlasTexture, alphaTest: 0.1, transparent: true, vertexColors: true });  // vertexColors:烘焙面色
  // R22 火把光照:顶点 aTorch 属性注入自发光 —— 与场景昼夜光解耦,夜晚火光不灭。
  // emissive = 纹理色 × 面烘焙色 × 光级曲线 × uTorchGlow(暖色偏置)
  matSolidChunk.onBeforeCompile = (shader) => {
    shader.uniforms.uTorchGlow = torchGlowUniform;
    shader.vertexShader = 'attribute float aTorch;\nattribute float aSky;\nvarying float vTorch;\nvarying float vSky;\n' + shader.vertexShader
      .replace('#include <color_vertex>', '#include <color_vertex>\n\tvTorch = aTorch;\n\tvSky = aSky;');
    // 火光 emissive:diffuseColor 已含天光遮蔽(vColor = 面色 × 天光),火把光不应被遮蔽 ——
    // 除回 vSky(下限 0.34 防爆)补偿;地表 vSky=1 时与原行为完全一致
    shader.fragmentShader = 'uniform float uTorchGlow;\nvarying float vTorch;\nvarying float vSky;\n' + shader.fragmentShader
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += diffuseColor.rgb * (vTorch * uTorchGlow) * vec3(1.0, 0.92, 0.78) * (1.0 / max(vSky, 0.34));');
  };
  matSolidChunk.customProgramCacheKey = () => 'torchglow';
  // 水用 MeshBasicMaterial(不受光照影响,显示纯清水蓝;Lambert 受法线/光照会压暗变灰)
  matWaterChunk = new THREE.MeshBasicMaterial({ color: 0x2a8fd6, transparent: true, opacity: 0.78, depthWrite: false });
}

// 给图标/手持物用的独立材质(保留旧的单方块材质,用于 UI 图标和手持模型)
let materials = {};
function makeBlockMaterials(type) {
  let st = (BLOCK_ID[type] * 2654435761) >>> 0;
  const rand = () => { st = (st * 1664525 + 1013904223) >>> 0; return st / 4294967296; };

  const faceTex = (face) => makePixelTexture((ctx, s) => drawBlockFace(ctx, type, face, s, rand));
  const top = faceTex('top'), side = faceTex('side'), bottom = faceTex('bottom');
  const M = (map) => new THREE.MeshLambertMaterial({ map });
  if (type === 'leaves') {
    const lm = M(side); lm.transparent = true; lm.alphaTest = 0.1;
    return [lm, lm.clone(), M(top), M(bottom), lm.clone(), lm.clone()];
  }
  if (type === 'torch' || type === 'fence' || type === 'ladder' || type === 'iron_bars') {
    // 透明贴图(镂空,alphaTest;R55 铁栏杆接入)
    const tm = M(side); tm.transparent = true; tm.alphaTest = 0.1;
    return [tm, tm.clone(), M(top), M(bottom), tm.clone(), tm.clone()];
  }
  return [M(side), M(side), M(top), M(bottom), M(side), M(side)];
}

