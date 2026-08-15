// ============================================================
// doors.js - 门实体渲染层(2 格高,可开关)
// 从 game.js 提取:doors 容器 + 键/材质缓存/mesh 构建与释放 + 纯查询。
// 交互逻辑(placeDoor/toggleDoor/raycastDoor 等)留在 game.js(依赖玩家状态与音效/存档)。
// BLOCK_TYPES 在函数体内运行时引用(game.js 已加载),顶层不依赖。
// 浏览器经 <script> 加载后全局可用;Node 环境可 require(容器与查询无 DOM 依赖)。
// ============================================================
(function (global) {
  'use strict';

  // 门实体容器:key "x,y,z"(下半格) -> {x,y,z,type,open,facing,group,animT}
  const doors = new Map();
  function doorKey(x, y, z) { return x+','+y+','+z; }

  const doorMatCache = {};
  function getDoorMat(type) {
    // BLOCK_TYPES 是 game.js 顶层 const(全局词法环境,不在 window 上),
    // 裸标识符在运行时(游戏初始化后)可跨 script 解析;此处运行时才求值,加载顺序无碍
    if (!doorMatCache[type]) { const def = BLOCK_TYPES[type] || BLOCK_TYPES['door']; doorMatCache[type] = new THREE.MeshLambertMaterial({ color: def.side }); }
    return doorMatCache[type];
  }
  function createDoorMesh(door) {
    const mat = getDoorMat(door.type);
    const g = new THREE.Group();
    // pivot Group(铰链在左 x=-0.43):门板+凹槽+把手都挂在内,统一旋转
    const pivot = new THREE.Group();
    pivot.position.set(-0.43, 0, 0);
    pivot.userData.isDoorPivot = true;
    g.add(pivot);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.86, 1.9, 0.1), mat);
    panel.position.set(0.43, 0.95, 0);
    panel.userData.isDoorPanel = true;  // 标记:共享缓存材质,disposeDoorGroup 不释放
    pivot.add(panel);
    const grooveMat = new THREE.MeshLambertMaterial({ color: 0x000000, transparent: true, opacity: 0.2 });
    for (const gx of [0.23, 0.43, 0.63]) { const gr = new THREE.Mesh(new THREE.BoxGeometry(0.015, 1.6, 0.02), grooveMat); gr.position.set(gx, 0.95, 0.06); pivot.add(gr); }
    const knob = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.05), new THREE.MeshLambertMaterial({ color: 0xd4af37 }));
    knob.position.set(0.7, 1.0, 0.07); knob.userData.isDoorKnob = true; pivot.add(knob);
    const topFrame = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.06, 0.14), new THREE.MeshLambertMaterial({ color: 0x3a2412 }));
    topFrame.position.set(0, 1.95, 0); g.add(topFrame);
    if (door.open) pivot.rotation.y = -Math.PI / 2;
    g.position.set(door.x + 0.5, door.y, door.z + 0.5);
    g.rotation.y = door.facing === 1 ? Math.PI / 2 : 0;
    g.userData.doorKey = doorKey(door.x, door.y, door.z);
    return g;
  }
  // 释放门 mesh 的 geometry/material(避免 GPU 泄漏)
  function disposeDoorGroup(g) {
    if (!g) return;
    g.traverse(function(o) {
      if (o.isMesh) {
        if (o.geometry) o.geometry.dispose();
        // 门板材质用共享缓存(不释放),frame/groove/knob 每次新建(释放)
        if (o.material && !o.userData.isDoorPanel) o.material.dispose();
      }
    });
  }

  // 查询:该格是否被关闭的门占据(上半格查自身+下半格)
  function doorBlocksAt(x, y, z) {
    const d1 = doors.get(doorKey(x,y,z)); if (d1 && !d1.open) return true;
    const d2 = doors.get(doorKey(x,y-1,z)); if (d2 && !d2.open) return true;
    return false;
  }
  // 查询:该格的门实体(上半格回落到下半格的记录)
  function getDoorAt(x, y, z) {
    let d = doors.get(doorKey(x,y,z)); if (d) return d;
    return doors.get(doorKey(x,y-1,z)) || null;
  }

  const DOORLIB = { doors, doorKey, getDoorMat, createDoorMesh, disposeDoorGroup, doorBlocksAt, getDoorAt };

  // 导出(Node 环境)
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = DOORLIB;
  }
  // 浏览器:挂到全局(game.js 直接引用裸名,调用点零改动)
  global.DOORLIB = DOORLIB;
  global.doors = doors;
  global.doorKey = doorKey;
  global.getDoorMat = getDoorMat;
  global.createDoorMesh = createDoorMesh;
  global.disposeDoorGroup = disposeDoorGroup;
  global.doorBlocksAt = doorBlocksAt;
  global.getDoorAt = getDoorAt;

})(typeof window !== 'undefined' ? window : globalThis);
