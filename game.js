// ============================================================
// 第二十部分:启动
// ============================================================
init();
setupInput();
updateInfoCount();
animate();

// 检测是否有存档,显示"继续游戏"入口
hasSave().then(exists => {
  const cont = document.getElementById('btn-continue');
  if (cont) cont.style.display = exists ? '' : 'none';
});
