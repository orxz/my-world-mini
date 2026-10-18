// ============================================================
// 第十七部分:背包面板(沿用旧实现)
// ============================================================
// 存档管理:打开面板 + 渲染存档列表
function openSaveManager() {
  const panel = document.getElementById('save-manager');
  const list = document.getElementById('save-list');
  if (!panel || !list) return;
  panel.classList.remove('hidden');
  list.innerHTML = '<div style="color:#9fb0c8;text-align:center;padding:20px;">加载中...</div>';
  listSaves().then(saves => {
    if (saves.length === 0) {
      list.innerHTML = '<div style="color:#9fb0c8;text-align:center;padding:20px;">暂无存档<br><span style="font-size:12px">点击下方"保存当前为新存档"创建</span></div>';
      return;
    }
    list.innerHTML = saves.map(s => {
      const time = new Date(s.timestamp).toLocaleString('zh-CN', {month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
      const pos = s.playerPos ? `(${s.playerPos.x.toFixed(0)},${s.playerPos.y.toFixed(0)},${s.playerPos.z.toFixed(0)})` : '';
      const cur = (s.id === currentSaveId) ? ' <span style="color:#5fd35f;">●当前</span>' : '';
      return `<div class="save-item">
        <div class="save-info">
          <div class="save-name">${s.name || '未命名'}${cur}</div>
          <div class="save-meta">#${s.id} · ${time} · 位置${pos} · ${(s.modifications||[]).length}处改动</div>
        </div>
        <button class="load" onclick="loadSaveFromMgr(${s.id})">读取</button>
        <button class="del" onclick="delSaveFromMgr(${s.id})">删除</button>
      </div>`;
    }).join('');
  });
}
// 从存档管理面板读取/删除(全局函数,供 onclick 调用)
window.loadSaveFromMgr = function(id) {
  loadSlot(id).then(ok => {
    if (ok) {
      showToast('已读取,点击继续游戏');
      document.getElementById('save-manager').classList.add('hidden');
      document.getElementById('pause-menu').classList.remove('hidden');
    } else showToast('读取失败');
  });
};
window.delSaveFromMgr = function(id) {
  deleteSave(id).then(ok => {
    if (ok) { showToast('已删除存档 #' + id); openSaveManager(); }
    else showToast('删除失败');
  });
};

function toggleInventory(open) {
  inventoryOpen = open;
  if (open) tutEvent('inventory', 1);
  const panel = document.getElementById('inventory');
  if (!panel) return;
  if (open) {
    buildInventoryPanel();
    panel.classList.remove('hidden');
    if (typeof syncPanelDim === 'function') syncPanelDim();
    if (document.pointerLockElement) document.exitPointerLock();
  } else {
    panel.classList.add('hidden');
    clearCraftGrid();
    if (typeof syncPanelDim === 'function') syncPanelDim();
    tryRelockPointer();   // 交互:关背包无缝回到游戏
  }
}

function buildInventoryPanel() {
  const panel = document.getElementById('inventory');
  const grid = panel.querySelector('.inv-grid');
  grid.innerHTML = '';
  const hint = panel.querySelector('.inv-hint');
  hint.textContent = gameMode === 'creative'
    ? `创造模式:点击物品放入快捷栏第 ${currentSlot + 1} 格;右键放入合成格`
    : `生存模式:图鉴仅供查看,物品靠采集/合成获得;右键放入合成格,点「📖 配方书」查配方`;
  const titleEl = document.getElementById('inv-title');
  if (titleEl) titleEl.textContent = '背包 · ' + (gameMode === 'creative' ? '创造' : '生存');

  // 绑定合成按钮(每次打开背包都重新绑定,避免重复绑定/失效)
  const craftBtn = document.getElementById('craft-btn');
  if (craftBtn) craftBtn.onclick = performCraft;
  const craftClear = document.getElementById('craft-clear');
  if (craftClear) craftClear.onclick = clearCraftGrid;
  // 合成格:点击切换方块种类(HOTBAR_ORDER 循环),右键清空
  const craftBlockList = HOTBAR_ORDER.slice();
  document.querySelectorAll('#craft-grid .inv-cell').forEach((cell, i) => {
    cell.onclick = () => {
      const cur = craftGrid[i];
      let idx = cur ? craftBlockList.indexOf(cur.id) : -1;
      idx = (idx + 1) % craftBlockList.length;
      craftGrid[i] = { kind: 'block', id: craftBlockList[idx] };
      renderCraftGrid();
      refreshCraftResult();
    };
    cell.oncontextmenu = (e) => { e.preventDefault(); craftGrid[i] = null; renderCraftGrid(); refreshCraftResult(); };
  });
  renderCraftGrid();
  refreshCraftResult();

  const addCell = (item) => {
    const cell = document.createElement('div');
    cell.className = 'inv-cell';
    const cv = document.createElement('canvas');
    cv.width = cv.height = 48;
    drawItemIcon(item, cv);
    cell.appendChild(cv);
    const label = document.createElement('span');
    label.className = 'inv-label';
    // R55 修复:名称始终显示;是否已发现只影响「生存模式提示」,不再把名称替换成 ???
    label.textContent = itemName(item);
    cell.dataset.search = (itemName(item) + ' ' + item.id).toLowerCase();
    cell.appendChild(label);
    cell.addEventListener('mouseenter', () => showItemTooltip(item, cell));
    cell.addEventListener('mouseleave', hideItemTooltip);
    cell.addEventListener('click', () => {
      if (gameMode !== 'creative') {
        showToast('生存模式:通过采集/合成获得 ' + itemName(item));
        showItemTooltip(item, cell);
        return;
      }
      let copy;
      if (item.kind === 'tool') {
        copy = { kind: 'tool', id: item.id, durability: TOOL_TYPES[item.id].durability };
      } else if (item.kind === 'item') {
        copy = { kind: 'item', id: item.id, count: 64 };
      } else {
        copy = { kind: 'block', id: item.id, count: 64 };   // 发放整组(放置按数量消耗)
      }
      putInSlot(currentSlot, copy);
      showToast(`已放入快捷栏:${itemName(item)}`);
    });
    // 右键:放入合成格(找第一个空位)
    cell.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      // 合成格接受方块和材料(物品)
      for (let gi = 0; gi < 4; gi++) {
        if (craftGrid[gi] === null) {
          craftGrid[gi] = { kind: item.kind || 'block', id: item.id };
          renderCraftGrid();
          refreshCraftResult();
          showToast(`放入合成格:${itemName(item)}`);
          return;
        }
      }
      showToast('合成格已满');
    });
    grid.appendChild(cell);
  };
  // 护甲装备槽(经典 4 部位):点击卸下回快捷栏;穿上 = 游戏内手持护甲右键
  addSection(grid, '护甲装备(穿上:手持护甲右键 · 点击卸下)');
  const armorRow = document.createElement('div');
  armorRow.style.cssText = 'grid-column:1/-1;display:flex;gap:8px;margin:2px 0 6px;';
  for (const s of ['head', 'chest', 'legs', 'feet']) {
    const it = armorSlots[s];
    const cell = document.createElement('div');
    cell.className = 'inv-cell';
    const cv = document.createElement('canvas');
    cv.width = cv.height = 48;
    if (it) drawItemIcon(it, cv);
    cell.appendChild(cv);
    const label = document.createElement('span');
    label.className = 'inv-label';
    label.textContent = it ? itemName(it) : ARMOR_SLOT_NAMES[s] + '(空)';
    cell.appendChild(label);
    cell.addEventListener('click', () => unequipArmor(s));
    armorRow.appendChild(cell);
  }
  grid.appendChild(armorRow);
  addSection(grid, '工具 · 武器');
  TOOL_ORDER.forEach(id => addCell({ kind: 'tool', id }));
  addSection(grid, '方块');
  HOTBAR_ORDER.forEach(id => addCell({ kind: 'block', id }));
  // 新增方块也可取用
  ['water', 'snow', 'gravel', 'door', 'door_iron', 'door_stone', 'door_gold', 'door_diamond', 'crafting_table', 'cobblestone', 'coal_ore', 'iron_ore', 'gold_ore', 'diamond_ore', 'tnt', 'furnace', 'glass', 'bed', 'chest', 'ladder', 'bookshelf', 'torch', 'rail', 'enchanting_table', 'slime', 'iron_bars', 'beacon'].forEach(id => addCell({ kind: 'block', id }));
  addSection(grid, '材料 · 宝石');
  ITEM_ORDER.forEach(id => addCell({ kind: 'item', id, count: 64 }));

  // R55 UX:物品搜索(按名称/id 过滤,隐藏空分组标题与护甲槽)
  const search = document.getElementById('inv-search');
  if (search) {
    search.value = '';
    const applyFilter = () => {
      const q = (search.value || '').trim().toLowerCase();
      let visible = 0;
      grid.querySelectorAll('.inv-cell').forEach(cell => {
        if (!cell.dataset.search) { cell.style.display = q ? 'none' : ''; return; }
        const hit = !q || cell.dataset.search.indexOf(q) >= 0;
        cell.style.display = hit ? '' : 'none';
        if (hit) visible++;
      });
      armorRow.style.display = q ? 'none' : 'flex';
      grid.querySelectorAll('.inv-section-title').forEach(h => { h.style.display = q ? 'none' : ''; });
      const empty = document.getElementById('inv-empty');
      if (empty) empty.classList.toggle('hidden', !q || visible > 0);
    };
    search.oninput = applyFilter;
    search.onkeydown = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); toggleInventory(false); }
    };
    applyFilter();
  }
}

function addSection(grid, title) {
  const h = document.createElement('div');
  h.className = 'inv-section-title';
  h.textContent = title;
  grid.appendChild(h);
}

// ============================================================
// 合成系统(2x2 网格 + 结果;创造模式主要为演示/未来生存钩子)
// ============================================================
// 配方:pattern 是长度 4 的数组,元素为方块 id 或 null。null 表示该格必须为空。
// result 为 {kind,id,count?}。可放置的 crafting_table 方块本游戏未定义,故用 planks 作演示结果。
// 合成配方表与匹配逻辑已提取到 craft.js(CRAFTLIB.RECIPES / CRAFTLIB.matchRecipe,可单测)

// 合成格状态:长度 4 的数组,每格为 null 或 {kind,id}(方块演示)
const craftGrid = [null, null, null, null];

// 当前配方匹配结果(null = 无匹配);核心逻辑在 craft.js(纯函数,可单测)
function matchRecipe() {
  return CRAFTLIB.matchRecipe(craftGrid, CRAFTLIB.RECIPES);
}

function renderCraftGrid() {
  const cells = document.querySelectorAll('#craft-grid .inv-cell');
  cells.forEach((cell, i) => {
    const old = cell.querySelector('canvas'); if (old) old.remove();
    const badge = cell.querySelector('.cnt'); if (badge) badge.remove();
    const item = craftGrid[i];
    if (item) {
      const cv = document.createElement('canvas');
      cv.width = cv.height = 48;
      drawItemIcon(item, cv);
      cell.appendChild(cv);
      if ((item.count || 1) > 1) {
        const c = document.createElement('span');
        c.className = 'cnt';
        c.textContent = item.count;
        cell.appendChild(c);
      }
    }
  });
}

function refreshCraftResult() {
  const resBox = document.getElementById('craft-result');
  const btn = document.getElementById('craft-btn');
  const hint = document.getElementById('craft-hint');
  const r = matchRecipe();
  resBox.innerHTML = '';
  if (r) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 48;
    drawItemIcon(r.result, cv);
    resBox.appendChild(cv);
    if (btn) btn.disabled = false;
    if (hint) hint.textContent = '可合成:' + r.name;
  } else {
    if (btn) btn.disabled = true;
    const hasItem = craftGrid.some(x => x !== null);
    if (hint) hint.textContent = hasItem ? '无匹配配方(尝试 4 个同种方块)' : '右键点击下方物品放入合成格,左键放入快捷栏';
  }
}

// R55:生存模式合成消耗真实材料(快捷栏);创造模式不受限
function consumeCraftMaterials(r) {
  if (gameMode !== 'survival') return true;
  const need = CRAFTLIB.recipeMaterials(r);
  const counts = INVLIB.hotbarCounts(hotbar);
  const miss = [];
  for (const id in need) if ((counts[id] || 0) < need[id]) miss.push(itemDisplayName(id) + '×' + (need[id] - (counts[id] || 0)));
  if (miss.length) { showToast('材料不足:' + miss.join('、')); return false; }
  for (const id in need) INVLIB.consumeFromHotbar(hotbar, id, need[id]);
  buildHotbar(); selectSlot(currentSlot); markDirtySave();   // selectSlot 同时刷新 selectedType,防材料耗尽后还能放旧方块
  return true;
}

function performCraft() {
  const r = matchRecipe();
  if (!r) return;
  if (!consumeCraftMaterials(r)) return;
  craftGiveResult(r);
  // 生存模式:消耗合成格内物品(每格 1 个)
  for (let i = 0; i < 4; i++) {
    if (craftGrid[i]) {
      craftGrid[i].count = (craftGrid[i].count || 1) - 1;
      if (craftGrid[i].count <= 0) craftGrid[i] = null;
    }
  }
  renderCraftGrid();
  refreshCraftResult();
}

// 发放合成产物到当前快捷栏格(工具补耐久)
function craftGiveResult(r) {
  const res = { ...r.result };
  if (res.kind === 'tool' && !res.durability) res.durability = TOOL_TYPES[res.id].durability;
  if (!res.count) res.count = r.count || 1;
  discovered.add(res.id);   // R55:合成解锁图鉴
  // R44 可玩性修复:结果并入快捷栏(同 id 叠加/入空格),不再盲覆写当前格 ——
  // 此前连续合成会销毁当前格残留物品(合成木板后,剩余木板被木棍结果覆盖丢失);
  // 满栏时余量掉在脚下(经典行为,不再静默消失)
  const got = pickupIntoInventory(res.kind, res.id, res.count, res.durability);
  const overflow = got < res.count;
  if (overflow) spawnDroppedItem(playerPos.x - 0.5, playerPos.y - 0.2, playerPos.z - 0.5, res.id, res.count - got, res.kind, res.durability);
  showToast('合成:' + r.name + ' ×' + res.count + (overflow ? ' · 快捷栏已满,余量掉在脚下' : ''));
  audio.play('place');
  const ca = CRAFT_ACHV[res.id];   // 成就:合成里程碑(R34,2×2 与合成台共用此路径)
  if (ca) unlockAchv(ca);
}

function clearCraftGrid() {
  for (let i = 0; i < 4; i++) craftGrid[i] = null;
  renderCraftGrid();
  refreshCraftResult();
}

// ============================================================
// 合成台 3×3(对放置的合成台方块右键打开;支持全部 2×2 配方 + 3×3 专属配方)
// ============================================================
const tableGrid = [null, null, null, null, null, null, null, null, null];
let tableOpen = false;

function openTablePanel() {
  tableOpen = true;
  const panel = document.getElementById('craft-table-panel');
  if (!panel) return;
  panel.classList.remove('hidden');
  if (document.pointerLockElement) document.exitPointerLock();
  const craftBtn = document.getElementById('table-craft');
  if (craftBtn) craftBtn.onclick = performTableCraft;
  const clearBtn = document.getElementById('table-clear');
  if (clearBtn) clearBtn.onclick = clearTableGrid;
  const closeBtn = document.getElementById('table-close');
  if (closeBtn) closeBtn.onclick = closeTablePanel;
  // 目录循环列表:方块 + 材料物品(矿石/圆石/木棍等,按 kind 区分图标)
  const catalog = HOTBAR_ORDER.map(id => ({ kind: 'block', id }))
    .concat(['water', 'snow', 'gravel', 'crafting_table', 'cobblestone', 'coal_ore', 'iron_ore', 'gold_ore', 'diamond_ore', 'tnt', 'furnace', 'glass', 'sand', 'bed', 'chest', 'ladder', 'bookshelf', 'wool_red', 'wool_white', 'torch', 'rail', 'enchanting_table', 'slime', 'redstone', 'redstone_torch', 'lever_off', 'iron_block', 'sugarcane', 'cake', 'slab_planks', 'slab_cobble', 'stairs_planks', 'stairs_cobble', 'fence', 'repeater_off', 'piston', 'iron_bars', 'beacon'].map(id => ({ kind: 'block', id })))
    .concat(['leather', 'book'].map(id => ({ kind: 'item', id })))
    .concat(['gem_gold', 'gem_diamond', 'gem_emerald', 'arrow', 'stick', 'coal', 'iron_ingot'].map(id => ({ kind: 'item', id })));
  document.querySelectorAll('#table-grid .inv-cell').forEach((cell, i) => {
    cell.onclick = () => {
      const cur = tableGrid[i];
      let idx = cur ? catalog.findIndex(c => c.kind === cur.kind && c.id === cur.id) : -1;
      idx = (idx + 1) % catalog.length;
      tableGrid[i] = { kind: catalog[idx].kind, id: catalog[idx].id };
      renderTableGrid(); refreshTableResult();
    };
    cell.oncontextmenu = (e) => { e.preventDefault(); tableGrid[i] = null; renderTableGrid(); refreshTableResult(); };
  });
  renderTableGrid();
  refreshTableResult();
}

function closeTablePanel() {
  tableOpen = false;
  const panel = document.getElementById('craft-table-panel');
  if (panel) panel.classList.add('hidden');
  // 面板格内物品为目录演示来源:关闭/清空不退回(仅合成时消耗每格 1 个)
  for (let i = 0; i < 9; i++) tableGrid[i] = null;
  renderTableGrid();
  refreshTableResult();
  tryRelockPointer();
}

function clearTableGrid() {
  for (let i = 0; i < 9; i++) tableGrid[i] = null;
  renderTableGrid();
  refreshTableResult();
}

function renderTableGrid() {
  document.querySelectorAll('#table-grid .inv-cell').forEach((cell, i) => {
    const old = cell.querySelector('canvas'); if (old) old.remove();
    const badge = cell.querySelector('.cnt'); if (badge) badge.remove();
    const item = tableGrid[i];
    if (item) {
      const cv = document.createElement('canvas');
      cv.width = cv.height = 48;
      drawItemIcon(item, cv);
      cell.appendChild(cv);
      if ((item.count || 1) > 1) {
        const c = document.createElement('span');
        c.className = 'cnt';
        c.textContent = item.count;
        cell.appendChild(c);
      }
    }
  });
}

function refreshTableResult() {
  const resBox = document.getElementById('table-result');
  const btn = document.getElementById('table-craft');
  const r = matchRecipeGrid(tableGrid, 3, CRAFTLIB.RECIPES);
  resBox.innerHTML = '';
  if (r) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 48;
    drawItemIcon(r.result, cv);
    resBox.appendChild(cv);
    if (btn) btn.disabled = false;
  } else if (btn) btn.disabled = true;
}

function performTableCraft() {
  const r = matchRecipeGrid(tableGrid, 3, CRAFTLIB.RECIPES);
  if (!r) return;
  if (!consumeCraftMaterials(r)) return;
  craftGiveResult(r);
  // 消耗合成格内物品(每格 1 个)
  for (let i = 0; i < 9; i++) {
    if (tableGrid[i]) {
      tableGrid[i].count = (tableGrid[i].count || 1) - 1;
      if (tableGrid[i].count <= 0) tableGrid[i] = null;
    }
  }
  renderTableGrid();
  refreshTableResult();
  markDirtySave();
}

