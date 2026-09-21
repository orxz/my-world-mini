// ============================================================
// 第十二部分:快捷栏 / 背包(沿用旧实现)
// ============================================================
function initInventory() {
  // 生存模式开局:仅一把木镐,其余靠破坏方块掉落拾取(经典 MC 采集循环)
  hotbar = new Array(HOTBAR_SIZE).fill(null);
  hotbar[8] = { kind: 'tool', id: 'pickaxe_wood', durability: TOOL_TYPES.pickaxe_wood.durability };
  selectSlot(0);
}

// 方块图标的伪 3D 等距渲染:顶面(亮)+ 右侧面(中)+ 左侧面(暗),模拟立体感
function drawBlockIcon3D(ctx, id, size) {
  const mats = materials[id];
  if (!mats || !mats[2] || !mats[1]) return;   // 防御:无方块材质(如脏数据的 kind/id 不匹配)时不绘制
  const topTex = mats[2].map, sideTex = mats[1].map;
  if (!topTex || !topTex.image || !sideTex || !sideTex.image) return;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  // 等距菱形顶面:用变换把方形纹理压成菱形。简化:画三层平行四边形。
  const cx = size / 2, topY = size * 0.12, midY = size * 0.46, botY = size * 0.88;
  const halfW = size * 0.42;
  // 顶面(亮):菱形,贴顶面纹理后整体提亮
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx, topY); ctx.lineTo(cx + halfW, midY); ctx.lineTo(cx, midY + (midY - topY)); ctx.lineTo(cx - halfW, midY); ctx.closePath();
  ctx.clip();
  ctx.drawImage(topTex.image, cx - halfW, topY, halfW * 2, (midY - topY) * 2);
  ctx.restore();
  // 右侧面(中暗):贴侧面纹理 + 半透明黑遮罩
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx, midY); ctx.lineTo(cx + halfW, midY); ctx.lineTo(cx + halfW, botY - (midY - topY)); ctx.lineTo(cx, botY); ctx.closePath();
  ctx.clip();
  ctx.drawImage(sideTex.image, cx, midY, halfW, botY - midY);
  ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(cx, midY, halfW, botY - midY);
  ctx.restore();
  // 左侧面(更暗)
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx, midY); ctx.lineTo(cx - halfW, midY); ctx.lineTo(cx - halfW, botY - (midY - topY)); ctx.lineTo(cx, botY); ctx.closePath();
  ctx.clip();
  ctx.drawImage(sideTex.image, cx - halfW, midY, halfW, botY - midY);
  ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(cx - halfW, midY, halfW, botY - midY);
  ctx.restore();
  ctx.restore();
}

function drawItemIcon(item, cv) {
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, cv.width, cv.height);
  if (!item) return;
  if (item.kind === 'block') {
    if (item.id === 'torch') { drawTorchIconFlat(ctx, cv.width); return; }
    drawBlockIcon3D(ctx, item.id, cv.width);
  } else if (item.kind === 'tool') {
    drawToolIcon(ctx, item.id, cv.width);
  } else if (item.kind === 'item') {
    drawMaterialIcon(ctx, item.id, cv.width);
  }
}

// 火把扁平图标:木棍 + 发光头部(透明贴图块不适合 3D 块图标)
function drawTorchIconFlat(ctx, size) {
  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1;
  ctx.fillStyle = '#8a6430';
  ctx.fillRect(-size * 0.07, -size * 0.12, size * 0.14, size * 0.46);
  ctx.strokeRect(-size * 0.07, -size * 0.12, size * 0.14, size * 0.46);
  ctx.fillStyle = 'rgba(255,160,60,0.4)';
  ctx.fillRect(-size * 0.2, -size * 0.4, size * 0.4, size * 0.34);
  ctx.fillStyle = '#ffd86b';
  ctx.fillRect(-size * 0.13, -size * 0.34, size * 0.26, size * 0.24);
  ctx.strokeRect(-size * 0.13, -size * 0.34, size * 0.26, size * 0.24);
  ctx.fillStyle = '#ff9a3c';
  ctx.fillRect(-size * 0.07, -size * 0.3, size * 0.12, size * 0.12);
  ctx.restore();
}

function tierColorOf(tier) {
  return ({ wood: '#8a6430', stone: '#9a9a9a', iron: '#d8d8e0', gold: '#ffd54a', diamond: '#5fe3e8', leather: '#a8784a' })[tier] || '#888';
}

function drawToolIcon(ctx, toolId, size) {
  const def = TOOL_TYPES[toolId];
  const tc = tierColorOf(def.tier);
  const handleColor = '#6e4f2a';
  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (def.tool === 'sword') {
    ctx.strokeStyle = handleColor; ctx.lineWidth = size * 0.12;
    ctx.beginPath(); ctx.moveTo(0, size * 0.34); ctx.lineTo(0, size * 0.05); ctx.stroke();
    ctx.strokeStyle = '#5a4030'; ctx.lineWidth = size * 0.08;
    ctx.beginPath(); ctx.moveTo(-size * 0.14, size * 0.05); ctx.lineTo(size * 0.14, size * 0.05); ctx.stroke();
    ctx.fillStyle = tc; ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-size * 0.07, size * 0.03); ctx.lineTo(size * 0.07, size * 0.03);
    ctx.lineTo(0, -size * 0.4); ctx.closePath(); ctx.fill(); ctx.stroke();
  } else if (def.tool === 'bow') {
    ctx.strokeStyle = handleColor; ctx.lineWidth = size * 0.1;
    ctx.beginPath(); ctx.arc(size * 0.12, 0, size * 0.34, Math.PI * 0.62, Math.PI * 1.38); ctx.stroke();
    ctx.strokeStyle = '#e8e8e8'; ctx.lineWidth = 1.5;
    const a1 = Math.PI * 0.62, a2 = Math.PI * 1.38;
    ctx.beginPath();
    ctx.moveTo(size * 0.12 + Math.cos(a1) * size * 0.34, Math.sin(a1) * size * 0.34);
    ctx.lineTo(size * 0.12 + Math.cos(a2) * size * 0.34, Math.sin(a2) * size * 0.34); ctx.stroke();
    ctx.strokeStyle = '#caa472'; ctx.lineWidth = size * 0.05;
    ctx.beginPath(); ctx.moveTo(-size * 0.22, 0); ctx.lineTo(size * 0.2, 0); ctx.stroke();
  } else if (def.tool === 'shield') {
    ctx.fillStyle = tc; ctx.strokeStyle = '#3a3a3a'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-size * 0.3, -size * 0.34); ctx.lineTo(size * 0.3, -size * 0.34);
    ctx.lineTo(size * 0.3, size * 0.1);
    ctx.quadraticCurveTo(size * 0.3, size * 0.36, 0, size * 0.38);
    ctx.quadraticCurveTo(-size * 0.3, size * 0.36, -size * 0.3, size * 0.1);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(-size * 0.04, -size * 0.2, size * 0.08, size * 0.32);
    ctx.fillRect(-size * 0.12, -size * 0.06, size * 0.24, size * 0.08);
  } else if (def.tool === 'rod') {
    // 钓鱼竿(R29):斜杆 + 垂线 + 红白浮标
    ctx.strokeStyle = handleColor; ctx.lineWidth = size * 0.09; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-size * 0.3, size * 0.34); ctx.lineTo(size * 0.26, -size * 0.3); ctx.stroke();
    ctx.strokeStyle = '#e8e8e8'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(size * 0.26, -size * 0.3); ctx.lineTo(size * 0.3, -size * 0.05); ctx.stroke();
    ctx.fillStyle = '#d03030';
    ctx.beginPath(); ctx.arc(size * 0.3, size * 0.0, size * 0.09, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f0f0f0';
    ctx.beginPath(); ctx.arc(size * 0.3, size * 0.0, size * 0.05, 0, Math.PI * 2); ctx.fill();
  } else if (def.tool === 'shears') {
    // 剪刀(R35):两片交叉铁刃 + 中心铆钉 + 双环柄
    ctx.strokeStyle = '#d8d8e0'; ctx.lineWidth = size * 0.11; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-size * 0.3, -size * 0.3); ctx.lineTo(size * 0.26, size * 0.26); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(size * 0.3, -size * 0.3); ctx.lineTo(-size * 0.26, size * 0.26); ctx.stroke();
    ctx.strokeStyle = handleColor; ctx.lineWidth = size * 0.08;
    ctx.beginPath(); ctx.arc(-size * 0.3, size * 0.3, size * 0.12, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(size * 0.3, size * 0.3, size * 0.12, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#8a8a92';
    ctx.beginPath(); ctx.arc(0, 0, size * 0.07, 0, Math.PI * 2); ctx.fill();
  } else if (def.tool === 'armor') {
    // 护甲四件套:帽(圆顶+护颊)/甲(背心)/裤(腰+双腿)/靴(双短筒),材质色区分
    ctx.fillStyle = tc; ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1;
    if (def.slot === 'head') {
      ctx.beginPath();
      ctx.moveTo(-size * 0.3, size * 0.02);
      ctx.quadraticCurveTo(-size * 0.3, -size * 0.38, 0, -size * 0.38);
      ctx.quadraticCurveTo(size * 0.3, -size * 0.38, size * 0.3, size * 0.02);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillRect(-size * 0.36, size * 0.02, size * 0.16, size * 0.12);
      ctx.strokeRect(-size * 0.36, size * 0.02, size * 0.16, size * 0.12);
      ctx.fillRect(size * 0.2, size * 0.02, size * 0.16, size * 0.12);
      ctx.strokeRect(size * 0.2, size * 0.02, size * 0.16, size * 0.12);
    } else if (def.slot === 'chest') {
      ctx.beginPath();
      ctx.moveTo(-size * 0.28, -size * 0.34); ctx.lineTo(size * 0.28, -size * 0.34);
      ctx.lineTo(size * 0.2, -size * 0.08); ctx.lineTo(size * 0.26, size * 0.36);
      ctx.lineTo(-size * 0.26, size * 0.36); ctx.lineTo(-size * 0.2, -size * 0.08);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.fillRect(-size * 0.07, -size * 0.3, size * 0.14, size * 0.6);
    } else if (def.slot === 'legs') {
      ctx.fillRect(-size * 0.26, -size * 0.34, size * 0.52, size * 0.3);
      ctx.strokeRect(-size * 0.26, -size * 0.34, size * 0.52, size * 0.3);
      ctx.fillRect(-size * 0.24, -size * 0.06, size * 0.2, size * 0.44);
      ctx.strokeRect(-size * 0.24, -size * 0.06, size * 0.2, size * 0.44);
      ctx.fillRect(size * 0.04, -size * 0.06, size * 0.2, size * 0.44);
      ctx.strokeRect(size * 0.04, -size * 0.06, size * 0.2, size * 0.44);
    } else {
      ctx.fillRect(-size * 0.28, -size * 0.12, size * 0.22, size * 0.44);
      ctx.strokeRect(-size * 0.28, -size * 0.12, size * 0.22, size * 0.44);
      ctx.fillRect(size * 0.06, -size * 0.12, size * 0.22, size * 0.44);
      ctx.strokeRect(size * 0.06, -size * 0.12, size * 0.22, size * 0.44);
    }
  } else {
    ctx.strokeStyle = handleColor; ctx.lineWidth = size * 0.12;
    ctx.beginPath(); ctx.moveTo(size * 0.32, size * 0.32); ctx.lineTo(-size * 0.3, -size * 0.3); ctx.stroke();
    ctx.fillStyle = tc; ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1;
    if (def.tool === 'pickaxe') {
      ctx.lineWidth = size * 0.1; ctx.strokeStyle = tc;
      for (const a of [-1.0, -Math.PI / 2, -2.14]) {
        ctx.beginPath(); ctx.moveTo(0, -size * 0.28);
        ctx.lineTo(Math.cos(a) * size * 0.32, Math.sin(a) * size * 0.32 - size * 0.28); ctx.stroke();
      }
    } else if (def.tool === 'axe') {
      ctx.beginPath();
      ctx.moveTo(0, -size * 0.42); ctx.lineTo(size * 0.28, -size * 0.28);
      ctx.lineTo(size * 0.18, -size * 0.08); ctx.lineTo(-size * 0.08, -size * 0.2);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(-size * 0.12, -size * 0.42); ctx.lineTo(size * 0.12, -size * 0.42);
      ctx.lineTo(size * 0.14, -size * 0.12); ctx.lineTo(-size * 0.14, -size * 0.12);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  }
  ctx.restore();
}

function drawMaterialIcon(ctx, itemId, size) {
  const def = ITEM_TYPES[itemId];
  if (!def) return;
  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1;
  if (def.shape === 'gem') {
    ctx.fillStyle = def.color;
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.34); ctx.lineTo(size * 0.26, 0);
    ctx.lineTo(0, size * 0.34); ctx.lineTo(-size * 0.26, 0);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.28); ctx.lineTo(size * 0.1, -size * 0.05);
    ctx.lineTo(-size * 0.1, -size * 0.05); ctx.closePath(); ctx.fill();
  } else if (def.shape === 'ingot') {
    ctx.fillStyle = def.color;
    ctx.beginPath();
    ctx.moveTo(-size * 0.3, size * 0.16); ctx.lineTo(size * 0.3, size * 0.16);
    ctx.lineTo(size * 0.22, -size * 0.16); ctx.lineTo(-size * 0.22, -size * 0.16);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(-size * 0.18, -size * 0.12, size * 0.36, size * 0.06);
  } else if (def.shape === 'cart') {
    // 矿车:灰斗 + 深口沿 + 两个黑轮
    ctx.fillStyle = def.color;
    ctx.fillRect(-size * 0.3, -size * 0.1, size * 0.6, size * 0.36);
    ctx.strokeRect(-size * 0.3, -size * 0.1, size * 0.6, size * 0.36);
    ctx.fillStyle = '#3a3a42';
    ctx.fillRect(-size * 0.34, -size * 0.2, size * 0.68, size * 0.1);
    ctx.fillStyle = '#232328';
    ctx.beginPath();
    ctx.arc(-size * 0.18, size * 0.32, size * 0.09, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath();
    ctx.arc(size * 0.18, size * 0.32, size * 0.09, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fillRect(-size * 0.22, -size * 0.06, size * 0.16, size * 0.2);
  } else if (def.shape === 'stick') {
    // 木棍:斜放棕色小棍(无箭头)
    ctx.strokeStyle = def.color; ctx.lineWidth = size * 0.09; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-size * 0.24, size * 0.26); ctx.lineTo(size * 0.24, -size * 0.26); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,235,200,0.35)'; ctx.lineWidth = size * 0.03;
    ctx.beginPath(); ctx.moveTo(-size * 0.2, size * 0.22); ctx.lineTo(size * 0.2, -size * 0.22); ctx.stroke();
  } else if (def.shape === 'book') {
    // 书:红色封面 + 白色书页边 + 书脊线
    ctx.fillStyle = def.color;
    ctx.fillRect(-size * 0.22, -size * 0.28, size * 0.44, size * 0.56);
    ctx.strokeRect(-size * 0.22, -size * 0.28, size * 0.44, size * 0.56);
    ctx.fillStyle = '#f0ead8';
    ctx.fillRect(size * 0.14, -size * 0.24, size * 0.06, size * 0.48);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-size * 0.1, -size * 0.28); ctx.lineTo(-size * 0.1, size * 0.28); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fillRect(-size * 0.18, -size * 0.2, size * 0.05, size * 0.3);
  } else if (def.shape === 'meat') {
    // 猪排:粉色带骨肉排
    ctx.fillStyle = def.color;
    ctx.beginPath();
    ctx.ellipse(0, size * 0.05, size * 0.26, size * 0.16, -0.35, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#f6d3cd';
    ctx.beginPath();
    ctx.ellipse(-size * 0.08, size * 0.02, size * 0.1, size * 0.06, -0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#f2e6d8'; ctx.lineWidth = size * 0.07;
    ctx.beginPath(); ctx.moveTo(size * 0.22, -size * 0.12); ctx.lineTo(size * 0.3, -size * 0.2); ctx.stroke();
  } else if (def.shape === 'apple') {
    // 苹果:红果 + 叶柄
    ctx.fillStyle = def.color;
    ctx.beginPath();
    ctx.arc(0, size * 0.06, size * 0.22, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#6b4f2a'; ctx.lineWidth = size * 0.05;
    ctx.beginPath(); ctx.moveTo(0, -size * 0.14); ctx.lineTo(size * 0.04, -size * 0.26); ctx.stroke();
    ctx.fillStyle = '#4f9e3f';
    ctx.beginPath();
    ctx.ellipse(size * 0.12, -size * 0.22, size * 0.09, size * 0.045, 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath();
    ctx.ellipse(-size * 0.08, -size * 0.02, size * 0.05, size * 0.08, 0.4, 0, Math.PI * 2);
    ctx.fill();
  } else if (def.shape === 'bucket') {
    // 铁桶(R36):梯形桶身 + 提梁;水桶 = 桶口蓝色水面 + 高光
    ctx.fillStyle = '#c8c8d0';
    ctx.beginPath();
    ctx.moveTo(-size * 0.26, -size * 0.12); ctx.lineTo(size * 0.26, -size * 0.12);
    ctx.lineTo(size * 0.2, size * 0.3); ctx.lineTo(-size * 0.2, size * 0.3);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#8a8a94'; ctx.lineWidth = size * 0.05;
    ctx.beginPath(); ctx.arc(0, -size * 0.12, size * 0.16, Math.PI, 0); ctx.stroke();
    if (itemId === 'water_bucket') {
      ctx.fillStyle = '#2a8fd6';
      ctx.fillRect(-size * 0.24, -size * 0.12, size * 0.48, size * 0.11);
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fillRect(-size * 0.16, -size * 0.09, size * 0.1, size * 0.05);
    } else {
      ctx.fillStyle = 'rgba(60,60,70,0.45)';
      ctx.fillRect(-size * 0.22, -size * 0.12, size * 0.44, size * 0.08);
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fillRect(-size * 0.16, -size * 0.02, size * 0.08, size * 0.24);
    }
  } else {
    ctx.strokeStyle = def.color; ctx.lineWidth = size * 0.06;
    ctx.beginPath(); ctx.moveTo(-size * 0.28, size * 0.2); ctx.lineTo(size * 0.22, -size * 0.22); ctx.stroke();
    ctx.fillStyle = '#9a9a9a';
    ctx.beginPath();
    ctx.moveTo(size * 0.22, -size * 0.22); ctx.lineTo(size * 0.1, -size * 0.28);
    ctx.lineTo(size * 0.28, -size * 0.1); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillRect(-size * 0.3, size * 0.16, size * 0.1, size * 0.04);
  }
  ctx.restore();
}

// 单格轻量刷新(数量/耐久/图标变化时用,替代整条热栏 9 格 DOM 重建)
function refreshHotbarSlot(i) {
  const bar = document.getElementById('hotbar');
  const slot = bar && bar.children[i];
  if (!slot) { buildHotbar(); return; }
  const item = hotbar[i];
  slot.className = 'slot' + (i === currentSlot ? ' active' : '');
  // 图标仅在物品种类变化时重画(耐久/数量刷新不重建 canvas,部分刷新)
  const iconKey = item ? (item.kind + ':' + item.id) : '';
  if (slot.dataset.icon !== iconKey) {
    slot.dataset.icon = iconKey;
    const oldCv = slot.querySelector('canvas'); if (oldCv) oldCv.remove();
    if (item) {
      const cv = document.createElement('canvas');
      cv.width = cv.height = 64;
      slot.appendChild(cv);
      drawItemIcon(item, cv);
    }
  }
  const oldCnt = slot.querySelector('.cnt'); if (oldCnt) oldCnt.remove();
  const oldDur = slot.querySelector('.dur'); if (oldDur) oldDur.remove();
  const nameEl = slot.querySelector('.name');
  if (nameEl) nameEl.textContent = itemName(item);
  if (item) {
    if ((item.count || 1) > 1) {
      const cnt = document.createElement('span');
      cnt.className = 'cnt';
      cnt.textContent = item.count;
      slot.appendChild(cnt);
    }
    if (item.kind === 'tool') {
      const bar2 = document.createElement('div');
      bar2.className = 'dur';
      const ratio = item.durability / TOOL_TYPES[item.id].durability;
      bar2.innerHTML = `<span style="width:${Math.max(0, ratio) * 100}%;background:${ratio > 0.5 ? '#5fd35f' : ratio > 0.2 ? '#e0c040' : '#d35f5f'}"></span>`;
      slot.appendChild(bar2);
    }
  }
}

function buildHotbar() {
  const bar = document.getElementById('hotbar');
  bar.innerHTML = '';
  for (let i = 0; i < HOTBAR_SIZE; i++) {
    const item = hotbar[i];
    const slot = document.createElement('div');
    slot.className = 'slot' + (i === currentSlot ? ' active' : '');
    slot.dataset.slot = i;
    slot.dataset.icon = item ? (item.kind + ':' + item.id) : '';   // 与 refreshHotbarSlot 的图标缓存约定一致
    slot.innerHTML = `<span class="num">${i + 1}</span><span class="name">${itemName(item)}</span>`;
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    slot.appendChild(cv);
    drawItemIcon(item, cv);
    if (item && (item.count || 1) > 1) {
      const cnt = document.createElement('span');
      cnt.className = 'cnt';
      cnt.textContent = item.count;
      slot.appendChild(cnt);
    }
    if (item && item.kind === 'tool') {
      const bar2 = document.createElement('div');
      bar2.className = 'dur';
      const ratio = item.durability / TOOL_TYPES[item.id].durability;
      bar2.innerHTML = `<span style="width:${Math.max(0, ratio) * 100}%;background:${ratio > 0.5 ? '#5fd35f' : ratio > 0.2 ? '#e0c040' : '#d35f5f'}"></span>`;
      slot.appendChild(bar2);
    }
    slot.addEventListener('click', () => selectSlot(i));
    bar.appendChild(slot);
  }
}

function itemName(item) {
  if (!item) return '(空)';
  if (item.kind === 'block') {
    const n = item.count || 1;
    const bt = BLOCK_TYPES[item.id];
    return (bt ? bt.name : '?') + (n > 1 ? ' ×' + n : '');
  }
  if (item.kind === 'tool') return (TOOL_TYPES[item.id] || { name: '?' }).name;
  if (item.kind === 'item') {
    const n = item.count || 1;
    const it = ITEM_TYPES[item.id];
    return (it ? it.name : '?') + (n > 1 ? ` ×${n}` : '');
  }
  return '?';
}

let currentSlot = 0;
function selectSlot(i) {
  if (i < 0 || i >= HOTBAR_SIZE || !Number.isInteger(i)) return;
  if (i !== currentSlot) tutEvent('slot', 1);
  currentSlot = i;
  const item = hotbar[i];
  // 选中方块格记录可放置类型;工具/物品/空格置空(放置走各自分支)
  selectedType = (item && item.kind === 'block') ? item.id : null;
  document.querySelectorAll('#hotbar .slot').forEach(s => {
    s.classList.toggle('active', +s.dataset.slot === i);
  });
  updateHoldItem();
}

function putInSlot(i, item) {
  if (i < 0 || i >= HOTBAR_SIZE || !Number.isInteger(i)) return;
  hotbar[i] = item;
  buildHotbar();
  if (i === currentSlot) selectSlot(i);
  markDirtySave();
}

// ============================================================
// 第十三部分:输入(沿用旧实现 + 音频初始化钩子)
// ============================================================
function setupInput() {
  addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
    // 门控:仅"游玩中"(已开始 且 暂停菜单/开始遮罩都隐藏)才响应游戏按键,
    // 否则标题屏按 Q 会把开局木镐丢出去、暂停中按 E 叠开面板等
    const inPlay = document.getElementById('overlay').classList.contains('hidden')
      && document.getElementById('pause-menu').classList.contains('hidden');
    keys[e.code] = inPlay ? true : false;
    if (!inPlay) return;
    if (tableOpen) {
      if (e.code === 'KeyE' || e.code === 'Escape') closeTablePanel();
      return;
    }
    if (furnaceOpen) {
      if (e.code === 'KeyE' || e.code === 'Escape') closeFurnacePanel();
      return;
    }
    if (chestOpen) {
      if (e.code === 'KeyE' || e.code === 'Escape') closeChestPanel();
      return;
    }
    if (tradeOpen) {
      if (e.code === 'KeyE' || e.code === 'Escape') closeTradePanel();
      return;
    }
    if (enchantOpen) {
      if (e.code === 'KeyE' || e.code === 'Escape') closeEnchantPanel();
      return;
    }
    if (inventoryOpen) {
      if (e.code === 'KeyE' || e.code === 'Escape') toggleInventory(false);
      return;
    }
    if (e.code.startsWith('Digit')) {
      const n = parseInt(e.code.slice(5)) - 1;
      if (n >= 0 && n < HOTBAR_SIZE) selectSlot(n);
    }
    if (e.code === 'Space') {
      const now = performance.now();
      if (now - lastSpaceTime < 300) isFlying = !isFlying;
      lastSpaceTime = now;
    }
    if (e.code === 'F5') { e.preventDefault(); cycleCameraMode(); }
    if (e.code === 'KeyE') toggleInventory(true);
    if (e.code === 'KeyQ') {
      // 经典丢弃:手持任意物品整组丢出(掉落物保留类型/数量/工具耐久,可再拾回)
      const it = hotbar[currentSlot];
      if (it) {
        const fx = -Math.sin(yaw) * Math.cos(pitch), fy = Math.sin(pitch), fz = -Math.cos(yaw) * Math.cos(pitch);
        const d = spawnDroppedItem(playerPos.x + fx * 1.2, playerPos.y + fy * 1.2, playerPos.z + fz * 1.2,
          it.id, it.kind === 'tool' ? 1 : (it.count || 1), it.kind, it.durability);
        d.userData.pickupDelay = 0.8;   // 丢弃后稍等再可拾取,避免瞬间吸回
        hotbar[currentSlot] = null;
        if (it.kind === 'block') selectedType = null;
        showToast('丢弃:' + itemName(it));
        buildHotbar(); updateHoldItem(); markDirtySave();
      }
    }
  });
  addEventListener('keyup', (e) => { keys[e.code] = false; });

  const overlay = document.getElementById('overlay');
  const pauseMenu = document.getElementById('pause-menu');
  let gameStarted = false;

  function enterGame() {
    // 1. 最重要:先隐藏开始遮罩(无论后续音频/锁定是否成功,游戏都能进入)
    overlay.classList.add('hidden');
    const pm = document.getElementById('pause-menu');
    if (pm) pm.classList.add('hidden');
    // 2. 尝试锁定鼠标指针(失败不影响游戏,只是不能用鼠标转视角)
    if (renderer) {
      try {
        if (!('ontouchstart' in window)) { const p = renderer.domElement.requestPointerLock();
        if (p && typeof p.catch === 'function') p.catch(() => {}); }
      } catch (e) { console.debug('指针锁请求失败(忽略):', e); }
    }
    // 3. 初始化音频(失败静默,不影响游戏)
    try { audio.init(); } catch (e) { console.debug('音频初始化失败(静音运行):', e); }
  }

  overlay.addEventListener('click', () => {
    if (!gameStarted) gameStarted = true;
    overlay.classList.add('hidden');   // 直接隐藏开始遮罩(不依赖 pointer lock)
    enterGame();                        // 尝试锁定指针(失败也不影响进入)
    startTutorial(false);               // 首次游戏(未完成过教程)自动开启
  });
  // 开始屏「新手教程」入口:强制开启
  const btnTut = document.getElementById('btn-tutorial');
  if (btnTut) btnTut.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!gameStarted) gameStarted = true;
    overlay.classList.add('hidden');
    enterGame();
    startTutorial(true);
  });

  // 继续上次游戏入口(若有存档)
  const cont = document.getElementById('btn-continue');
  if (cont) cont.addEventListener('click', (e) => {
    e.stopPropagation();
    loadGame().then(ok => {
      if (ok) { if (!gameStarted) gameStarted = true; enterGame(); }
      else showToast('没有存档,开始新世界');
    });
  });

  document.addEventListener('pointerlockchange', () => {
    const locked = document.pointerLockElement === renderer.domElement;
    // 解锁(开面板/Esc)时同步清按住状态:mouseup 只绑在画布上,落在菜单 DOM 上收不到,
    // 不清零会在恢复游戏后无操作自动连挖
    if (!locked) { for (const code in keys) keys[code] = false; mouseHeld = false; touchBreakHeld = false; }
    if (locked) {
      overlay.classList.add('hidden');
      pauseMenu.classList.add('hidden');
    } else if (gameStarted && !inventoryOpen && !tableOpen && !furnaceOpen && !chestOpen && !tradeOpen && !enchantOpen) {
      pauseMenu.classList.remove('hidden');
      autosave(true);
    }
  });

  document.getElementById('btn-resume').addEventListener('click', enterGame);
  document.getElementById('btn-reset').addEventListener('click', () => {
    resetWorld();
    enterGame();
  });
  // 暂停菜单:音效快捷开关 + 设置面板入口
  const btnSettings = document.getElementById('btn-settings');
  if (btnSettings) btnSettings.addEventListener('click', openSettingsPanel);
  // 成就面板入口(R34)
  const btnAchv = document.getElementById('btn-achv');
  if (btnAchv) btnAchv.addEventListener('click', () => {
    document.getElementById('pause-menu').classList.add('hidden');
    openAchvPanel();
  });
  const achvClose = document.getElementById('achv-close');
  if (achvClose) achvClose.addEventListener('click', () => {
    closeAchvPanel();
    document.getElementById('pause-menu').classList.remove('hidden');
  });
  const achvPanelEl = document.getElementById('achv-panel');
  if (achvPanelEl) achvPanelEl.addEventListener('click', (e) => {
    if (e.target === achvPanelEl) { closeAchvPanel(); document.getElementById('pause-menu').classList.remove('hidden'); }
  });
  updateAchvBtn();   // 初始计数 0/16
  const btnEmpty = document.getElementById('btn-empty-hand');
  if (btnEmpty) btnEmpty.addEventListener('click', () => {
    hotbar[currentSlot] = null; buildHotbar(); updateHoldItem(); markDirtySave(); showToast('已清空当前手持(空手)');
  });
  document.getElementById('btn-controls').addEventListener('click', () => {
    document.getElementById('pause-controls').classList.toggle('hidden');
  });
  // 存档按钮

  const btnLoad = document.getElementById('btn-load');
  if (btnLoad) btnLoad.addEventListener('click', () => {
    loadGame().then(ok => {
      if (ok) { showToast('已读取,点击继续游戏'); document.getElementById('pause-menu').classList.remove('hidden'); }
      else showToast('没有存档');
    });
  });

  // ---------- 设置面板 ----------
  const setPanel = document.getElementById('settings-panel');
  const setSound = document.getElementById('set-sound');
  const setVolume = document.getElementById('set-volume');
  const setRender = document.getElementById('set-render');
  const setMobs = document.getElementById('set-mobs');
  const setHostiles = document.getElementById('set-hostiles');
  const setFpHeld = document.getElementById('set-fpheld');
  const setDN = document.getElementById('set-daynight');
  const setDNSpeed = document.getElementById('set-dayspeed');
  const setDNTime = document.getElementById('set-daytime');
  const setDNTimeLabel = document.getElementById('set-daytime-label');
  const setClose = document.getElementById('set-close');
  const daynightControls = document.getElementById('daynight-controls');

  function dayTimeToLabel(t) {
    const totalMin = Math.floor(t * 24 * 60);
    const h = Math.floor(totalMin / 60) % 24;
    const m = totalMin % 60;
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }
  function refreshSettingsUI() {
    if (setSound) setSound.textContent = settings.soundEnabled ? '开' : '关';
    if (setVolume) setVolume.value = Math.round(settings.volume * 100);
    if (setRender) setRender.value = String(settings.renderDist);
    if (setMobs) setMobs.textContent = settings.mobs ? '开' : '关';
    if (setHostiles) setHostiles.textContent = settings.hostiles ? '开' : '关';
    if (setFpHeld) setFpHeld.textContent = settings.fpHeld ? '开' : '关';
    if (setDN) {
      setDN.textContent = settings.dayNightEnabled ? '开' : '关';
      if (daynightControls) {
        daynightControls.style.opacity = settings.dayNightEnabled ? '1' : '0.4';
        daynightControls.style.pointerEvents = settings.dayNightEnabled ? '' : 'none';  // 禁用交互
      }
    }
    if (setDNSpeed) setDNSpeed.value = String(settings.dayCycleSpeed);
    if (setDNTime) { setDNTime.value = Math.round(dayTime * 100); if (setDNTimeLabel) setDNTimeLabel.textContent = dayTimeToLabel(dayTime); }
  }
  function openSettingsPanel() {
    if (document.pointerLockElement) document.exitPointerLock();
    if (setPanel) { setPanel.classList.remove('hidden'); refreshSettingsUI(); }
  }
  if (setSound) setSound.addEventListener('click', () => {
    settings.soundEnabled = !settings.soundEnabled;
    audio.enabled = settings.soundEnabled;
    if (audio.masterGain) audio.masterGain.gain.value = settings.soundEnabled ? settings.volume : 0;
    saveSettings(); refreshSettingsUI();
  });
  if (setVolume) setVolume.addEventListener('input', () => {
    settings.volume = parseInt(setVolume.value) / 100;
    audio.volume = settings.volume;  // 同步 audio.volume(避免 btn-sound 读旧值)
    if (audio.masterGain && settings.soundEnabled) audio.masterGain.gain.value = settings.volume;
    saveSettings();
  });
  if (setRender) setRender.addEventListener('change', () => {
    settings.renderDist = parseInt(setRender.value);
    RENDER_DISTANCE = Math.max(1, settings.renderDist | 0);
    FOG_FAR = (RENDER_DISTANCE * CHUNK_SIZE) + 8;
    saveSettings();
  });
  if (setMobs) setMobs.addEventListener('click', () => {
    settings.mobs = !settings.mobs;
    if (!settings.mobs) clearMobs();
    saveSettings(); refreshSettingsUI();
  });
  if (setHostiles) setHostiles.addEventListener('click', () => {
    settings.hostiles = !settings.hostiles;
    if (!settings.hostiles) clearHostiles();
    saveSettings(); refreshSettingsUI();
  });
  // 第一人称手持:关=纯净视角(看不到手臂/物品,不挡视线);开=MC 经典手持观感
  if (setFpHeld) setFpHeld.addEventListener('click', () => {
    settings.fpHeld = !settings.fpHeld;
    saveSettings(); refreshSettingsUI();
  });
  if (setDN) setDN.addEventListener('click', () => {
    settings.dayNightEnabled = !settings.dayNightEnabled;
    saveSettings(); refreshSettingsUI();
  });
  if (setDNSpeed) setDNSpeed.addEventListener('change', () => {
    settings.dayCycleSpeed = parseInt(setDNSpeed.value);
    saveSettings();
  });
  if (setDNTime) setDNTime.addEventListener('input', () => {
    dayTime = parseInt(setDNTime.value) / 100;
    if (setDNTimeLabel) setDNTimeLabel.textContent = dayTimeToLabel(dayTime);
  });
  if (setClose) setClose.addEventListener('click', () => {
    if (setPanel) setPanel.classList.add('hidden');
    // 刷新暂停菜单标签(与设置面板同步)
    const bs2 = document.getElementById('btn-sound');
    if (bs2) bs2.textContent = '音效:' + (settings.soundEnabled ? '开' : '关');
    saveSettings();
  });

// 存档管理面板
  const btnMgr = document.getElementById('btn-mgr');
  const saveMgr = document.getElementById('save-manager');
  const btnMgrClose = document.getElementById('btn-mgr-close');
  const btnSaveNew = document.getElementById('btn-save-new');
  if (btnMgr) btnMgr.addEventListener('click', () => { if (document.pointerLockElement) document.exitPointerLock(); openSaveManager(); });
  if (btnMgrClose) btnMgrClose.addEventListener('click', () => { saveMgr.classList.add('hidden'); });
  if (btnSaveNew) btnSaveNew.addEventListener('click', () => {
    const name = '存档 ' + new Date().toLocaleString('zh-CN', {month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
    saveSlot(name).then(id => { if (id) { showToast('已保存为新存档'); openSaveManager(); } else showToast('保存失败'); });
  });
  // 保存到新存档(暂停菜单的 btn-save)
  const btnSave2 = document.getElementById('btn-save');
  if (btnSave2) btnSave2.addEventListener('click', () => {
    const name = '存档 ' + new Date().toLocaleString('zh-CN', {month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
    saveSlot(name).then(id => { showToast(id ? '已保存为新存档 #'+id : '保存失败'); });
  });

  // 音效开关
  const btnSound = document.getElementById('btn-sound');
  if (btnSound) btnSound.addEventListener('click', () => {
    audio.enabled = !audio.enabled;
    if (audio.masterGain) audio.masterGain.gain.value = audio.enabled ? settings.volume : 0;
    settings.soundEnabled = audio.enabled;
    btnSound.textContent = '音效:' + (audio.enabled ? '开' : '关');
    saveSettings();
  });
  // 动物开关(暂停菜单)
  const btnMobs = document.getElementById('btn-mobs');
  if (btnMobs) btnMobs.addEventListener('click', () => {
    settings.mobs = !settings.mobs;
    btnMobs.textContent = '动物:' + (settings.mobs ? '开' : '关');
    if (!settings.mobs) clearMobs();
    saveSettings();
    showToast('动物已' + (settings.mobs ? '开启' : '关闭'));
  });
  // 怪物开关(暂停菜单;关闭=和平模式,清除敌对生物)
  const btnHostiles = document.getElementById('btn-hostiles');
  if (btnHostiles) btnHostiles.addEventListener('click', () => {
    settings.hostiles = !settings.hostiles;
    btnHostiles.textContent = '怪物:' + (settings.hostiles ? '开' : '关');
    if (!settings.hostiles) clearHostiles();
    saveSettings();
    showToast('怪物已' + (settings.hostiles ? '开启' : '关闭'));
  });
  // 重新新手教程(暂停菜单)
  const btnReplayTut = document.getElementById('btn-replay-tutorial');
  if (btnReplayTut) btnReplayTut.addEventListener('click', () => {
    document.getElementById('pause-menu').classList.add('hidden');
    startTutorial(true);
    showToast('教程已重新开始');
  });
  // 背包与合成(暂停菜单;R46 —— 触屏无 E 键,这是移动端背包的唯一入口)
  const btnInv = document.getElementById('btn-inventory');
  if (btnInv) btnInv.addEventListener('click', () => {
    document.getElementById('pause-menu').classList.add('hidden');
    toggleInventory(true);
  });
  // 天气开关(暂停菜单;关闭=强制晴天)
  const btnWeather = document.getElementById('btn-weather');
  if (btnWeather) btnWeather.addEventListener('click', () => {
    settings.weather = !settings.weather;
    btnWeather.textContent = '天气:' + (settings.weather ? '开' : '关');
    saveSettings();
    showToast('天气已' + (settings.weather ? '开启' : '关闭'));
  });

  document.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement !== renderer.domElement) return;
    yaw -= e.movementX * 0.0025;
    if (tutorial.active) tutorial.progress.look = (tutorial.progress.look || 0) + Math.abs(e.movementX * 0.0025) + Math.abs(e.movementY * 0.0025), tutEvent('look', 0);
    pitch -= e.movementY * 0.0025;
    pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, pitch));
  });

  renderer.domElement.addEventListener('mousedown', (e) => {
    if (document.pointerLockElement !== renderer.domElement) {
      // 未锁定(刚关面板/菜单返回):点击画面重新锁定,不触发破坏/放置
      try {
        const p = renderer.domElement.requestPointerLock();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch (err) { /* 忽略锁定失败 */ }
      return;
    }
    if (e.button === 0) { breakBlock(); mouseHeld = true; }
    else if (e.button === 2) placeBlock();
  });
  renderer.domElement.addEventListener('mouseup', (e) => { if (e.button === 0) mouseHeld = false; });
  renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

  addEventListener('wheel', (e) => {
    if (document.pointerLockElement !== renderer.domElement) return;
    let next = currentSlot + (e.deltaY > 0 ? 1 : -1);
    next = (next + HOTBAR_SIZE) % HOTBAR_SIZE;
    selectSlot(next);
  });


  // ---------- 移动端触屏 ----------
  const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  if (isTouch) {
    const tc = document.getElementById('touch-controls');
    if (tc) tc.style.display = '';
    // 摇杆
    const joy = document.getElementById('joystick');
    const knob = document.getElementById('joystick-knob');
    let joyActive = false, joyDX = 0, joyDZ = 0;
    if (joy) {
      const onStart = (e) => { joyActive = true; e.preventDefault(); };
      const onMove = (e) => {
        if (!joyActive) return;
        const t = e.touches ? e.touches[0] : e;
        const r = joy.getBoundingClientRect();
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        let dx = t.clientX - cx, dy = t.clientY - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const max = 40;
        if (dist > max) { dx = dx / dist * max; dy = dy / dist * max; }
        if (knob) knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
        joyDX = dx / max; joyDZ = dy / max;
        e.preventDefault();
      };
      const onEnd = () => { joyActive = false; joyDX = 0; joyDZ = 0; if (knob) knob.style.transform = ''; };
      joy.addEventListener('touchstart', onStart, { passive: false });
      joy.addEventListener('touchmove', onMove, { passive: false });
      joy.addEventListener('touchend', onEnd);
    }
    // 摇杆驱动移动(在 updatePlayer 里读 touchMove)
    window.__touchMove = () => { return { x: joyDX, z: joyDZ }; };
    // 按钮
    const bindBtn = (id, onDown, onUp) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('touchstart', (e) => { e.preventDefault(); onDown(); }, { passive: false });
      el.addEventListener('touchend', (e) => { e.preventDefault(); if (onUp) onUp(); }, { passive: false });
      el.addEventListener('touchcancel', () => { if (onUp) onUp(); });   // 手势被系统取消时同样复位(防「挖」卡在连挖)
    };
    bindBtn('touch-jump', () => { keys['Space'] = true; }, () => { keys['Space'] = false; });
  const tj = document.getElementById('touch-jump'); if (tj) tj.addEventListener('touchcancel', () => { keys['Space'] = false; });
  addEventListener('blur', () => { keys['Space'] = false; });
    bindBtn('touch-break', () => { breakBlock(); touchBreakHeld = true; }, () => { touchBreakHeld = false; });
    bindBtn('touch-place', () => { placeBlock(); });
    // 拖拽转视角(画面右半区拖动)
    let lookActive = false, lastX = 0, lastY = 0;
    renderer.domElement.addEventListener('touchstart', (e) => {
      // 排除触屏控件区域
      const t = e.touches[0];
      if (t.clientX > window.innerWidth * 0.4) { lookActive = true; lastX = t.clientX; lastY = t.clientY; }
    }, { passive: true });
    renderer.domElement.addEventListener('touchmove', (e) => {
      if (!lookActive) return;
      const t = e.touches[0];
      const dx = t.clientX - lastX, dy = t.clientY - lastY;
      yaw -= dx * 0.005;
      pitch -= dy * 0.005;
      pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, pitch));
      // 触屏拖视角与鼠标同样累计教程「环顾四周」进度(否则移动端教程卡死在这一步)
      if (tutorial.active) tutorial.progress.look = (tutorial.progress.look || 0) + Math.abs(dx * 0.005) + Math.abs(dy * 0.005), tutEvent('look', 0);
      lastX = t.clientX; lastY = t.clientY;
    }, { passive: true });
    renderer.domElement.addEventListener('touchend', () => { lookActive = false; }, { passive: true });
  }

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  // ≡ 暂停按钮(R43 打磨):触屏打开暂停菜单(保存/设置/存档管理入口)。
  // 绑定放在 isTouch 之外:按钮仅在触屏显示,桌面隐藏;统一绑定便于测试
  const pauseBtn = document.getElementById('touch-pause');
  if (pauseBtn) {
    const openPauseFromTouch = () => {
      const pm = document.getElementById('pause-menu');
      if (pm && pm.classList.contains('hidden')) pm.classList.remove('hidden');
    };
    pauseBtn.addEventListener('touchstart', (e) => { e.preventDefault(); openPauseFromTouch(); }, { passive: false });
    pauseBtn.addEventListener('click', openPauseFromTouch);
  }

  // 🎥 切视角按钮(R52):触屏无 F5 键,此前移动端无法切第三人称;
  // 绑定放在 isTouch 之外(按钮仅触屏显示),统一绑定便于测试
  const camBtn = document.getElementById('touch-camera');
  if (camBtn) {
    const switchCamFromTouch = () => { cycleCameraMode(); };
    camBtn.addEventListener('touchstart', (e) => { e.preventDefault(); switchCamFromTouch(); }, { passive: false });
    camBtn.addEventListener('click', switchCamFromTouch);
  }
}

