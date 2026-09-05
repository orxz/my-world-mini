// ============================================================
// R44 视觉复验(CDP,--remote-debugging-port=9333):
//   1) 交易面板 7 行无滚动完整显示(修复:行格 46→42 / gap 6→4)
//   2) 移动端 挖/放 按钮与饥饿条/经验条矩形不相交(修复:bottom 120→146)
//   3) 经验条高度 8px(修复:6→8)
// ============================================================
import { writeFileSync } from 'node:fs';

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
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
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
  await send('Page.enable');

  const results = [];
  const check = (name, cond, extra = '') => results.push((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' | ' + extra : ''));

  // ---- 1. 桌面视口:进游戏 → 真实开交易面板 ----
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await Page_navigate(send, 'file://' + process.cwd() + '/index.html?fresh=' + Date.now());
  await sleep(2500);
  await evl(`document.getElementById('overlay').click()`);
  await sleep(1500);
  await evl(`endTutorial()`);
  await evl(`(() => {
    const v = spawnMob(playerPos.x + 1.5, playerPos.y, playerPos.z, 'villager');
    pickupIntoInventory('item', 'coal', 15);
    openTradePanel(v);
  })()`);
  await sleep(1000);

  const trade = await evl(`(() => {
    const list = document.getElementById('trade-list');
    const rows = list.querySelectorAll('.trade-row');
    const noScroll = list.scrollHeight <= list.clientHeight + 1;
    const last = rows[rows.length - 1].getBoundingClientRect();
    const panel = document.getElementById('trade-panel').getBoundingClientRect();
    return { rows: rows.length, scrollHeight: list.scrollHeight, clientHeight: list.clientHeight, noScroll, lastBottom: Math.round(last.bottom), panelBottom: Math.round(panel.bottom) };
  })()`);
  check('交易面板 7 行完整(无需滚动)', trade.rows >= 7 && trade.noScroll, JSON.stringify(trade));

  const shot1 = await shoot(send);
  writeFileSync('/tmp/r44b-trade.png', Buffer.from(shot1, 'base64'));

  // ---- 2. 移动端视口 375×667:触屏层注入 → 按钮与条不重叠 ----
  await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 667, deviceScaleFactor: 2, mobile: true });
  await Page_navigate(send, 'file://' + process.cwd() + '/index.html?fresh=' + Date.now() + '&m=1');
  await sleep(2500);
  await evl(`document.getElementById('overlay').click()`);
  await sleep(1200);
  await evl(`endTutorial()`);
  await evl(`['touch-controls','touch-pause'].forEach((id) => { const el = document.getElementById(id); if (el) el.style.display = 'block'; })`);
  await sleep(500);

  const mob = await evl(`(() => {
    const inter = (a, b) => !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
    const brk = document.getElementById('touch-break').getBoundingClientRect();
    const plc = document.getElementById('touch-place').getBoundingClientRect();
    const jmp = document.getElementById('touch-jump').getBoundingClientRect();
    const hun = document.getElementById('hunger-bar').getBoundingClientRect();
    const xpb = document.getElementById('xp-bar').getBoundingClientRect();
    return {
      overlapBreak: inter(brk, hun) || inter(brk, xpb),
      overlapPlace: inter(plc, hun) || inter(plc, xpb),
      overlapJump: inter(jmp, hun) || inter(jmp, xpb),
      gapBreakToHunger: Math.round(hun.top - brk.bottom),
      xpHeight: document.getElementById('xp-bar').offsetHeight
    };
  })()`);
  check('移动端 挖/放/跳 不压饥饿与经验条', !mob.overlapBreak && !mob.overlapPlace && !mob.overlapJump, JSON.stringify(mob));
  check('经验条加粗 8px', mob.xpHeight === 8, 'height=' + mob.xpHeight);

  const shot2 = await shoot(send);
  writeFileSync('/tmp/r44b-mobile.png', Buffer.from(shot2, 'base64'));

  console.log(results.join('\n'));
  const fails = results.filter((r) => r.startsWith('FAIL')).length;
  console.log(fails === 0 ? `\nALL ${results.length} CHECKS PASS` : `\n${fails} FAILURES`);
  ws.close();
  process.exit(fails === 0 ? 0 : 1);
}

async function Page_navigate(send, url) {
  await send('Page.navigate', { url });
  await sleep(400);
}

async function shoot(send) {
  let last = null;
  for (let i = 0; i < 5; i++) {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    if (r.result && r.result.data) return r.result.data;
    last = r;
    await sleep(600);
  }
  throw new Error('captureScreenshot failed after retries: ' + JSON.stringify((last && (last.error || last.result)) || last));
}

main().catch((e) => { console.error(e); process.exit(1); });
