// 2026-05-23 驗證 mobile 雙觸點：左下角搖桿 + 右半 tap dash
// CDP Input.dispatchTouchEvent 可同時送多個 touchPoint
import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';
import { dirname, resolve, extname } from 'path';
import { createServer } from 'http';
import { readFile } from 'fs/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const PORT = 8770;
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json',
};
const server = createServer(async (req, res) => {
  try {
    let p = req.url.split('?')[0];
    if (p === '/' || p === '') p = '/index.html';
    const full = resolve(ROOT, '.' + p);
    if (!full.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
    const data = await readFile(full);
    res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
    res.end(data);
  } catch (e) { res.writeHead(404); res.end(String(e)); }
});
await new Promise(r => server.listen(PORT, r));

const browser = await puppeteer.launch({ headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: 393, height: 852, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
const errs = [];
page.on('pageerror', e => errs.push('[pageerror] ' + (e.stack || e.message)));
page.on('console', m => { if (m.type() === 'error') errs.push('[console.error] ' + m.text()); });

const results = [];
function report(label, ok, info) {
  results.push({ label, ok, info });
  console.log(`${ok ? '✓' : '✗'} ${label}`, info || '');
}

try {
  await page.goto(`http://localhost:${PORT}/?nointro=1&device=mobile`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 2000));

  // 初始狀態：搖桿未啟動、hero 在 (0,6)
  const initial = await page.evaluate(() => ({
    heroX: window.__game.hero.position.x,
    heroZ: window.__game.hero.position.z,
    joyId: window.__game.input._joyTouchId,
    joyDx: window.__game.input._joyDx,
    joyDz: window.__game.input._joyDz,
    inputMode: window.__game.input._mode,
  }));
  report('初始 _mode = touch', initial.inputMode === 'touch', JSON.stringify(initial));
  report('初始 joystick 未啟動', initial.joyId === -1);

  const client = await page.target().createCDPSession();

  // === 步驟 1：在左下角 (50, 750) touchstart → 搖桿應啟動
  const joyBaseX = 50, joyBaseY = 750;
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: joyBaseX, y: joyBaseY, id: 1 }],
  });
  await new Promise(r => setTimeout(r, 250));  // 等 180ms CSS transition 跑完
  const afterStart = await page.evaluate(() => ({
    joyId: window.__game.input._joyTouchId,
    baseX: window.__game.input._joyBaseX,
    baseY: window.__game.input._joyBaseY,
    knobActive: document.getElementById('joystick-knob').classList.contains('active'),
    baseActive: document.getElementById('joystick-base').classList.contains('active'),
  }));
  report('搖桿啟動 _joyTouchId 不為 -1', afterStart.joyId !== -1, JSON.stringify(afterStart));
  report('搖桿 base 設在觸點位置', afterStart.baseX === joyBaseX && afterStart.baseY === joyBaseY);
  report('搖桿視覺顯示（.active class 已加）', afterStart.knobActive && afterStart.baseActive);

  // === 步驟 2：touchmove 拖到右上方 100px → 搖桿往右上、hero 應朝右上移動
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: joyBaseX + 100, y: joyBaseY - 100, id: 1 }],
  });
  await new Promise(r => setTimeout(r, 600));
  const afterMove = await page.evaluate(() => ({
    heroX: window.__game.hero.position.x,
    heroZ: window.__game.hero.position.z,
    joyDx: window.__game.input._joyDx,
    joyDz: window.__game.input._joyDz,
  }));
  report('搖桿方向：dx>0、dz<0（右上）', afterMove.joyDx > 0.5 && afterMove.joyDz < -0.5, JSON.stringify(afterMove));
  const dx1 = afterMove.heroX - initial.heroX;
  const dz1 = afterMove.heroZ - initial.heroZ;
  report('hero 朝右上方向移動（dx>0 且 dz<0）', dx1 > 0.1 && dz1 < -0.1, `dx=${dx1.toFixed(2)} dz=${dz1.toFixed(2)}`);

  // === 步驟 3：搖桿持續按住，右半 touchstart → dash 觸發（多指）
  const beforeDash = await page.evaluate(() => ({
    cooldown: window.__game.hero.dashCooldown,
    dashTimer: window.__game.hero.dashTimer,
  }));
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { x: joyBaseX + 100, y: joyBaseY - 100, id: 1 },     // 搖桿（沿用）
      { x: 350, y: 400, id: 2 },                            // 右半新觸點 → dash
    ],
  });
  await new Promise(r => setTimeout(r, 120));
  const afterDash = await page.evaluate(() => ({
    dashTimer: window.__game.hero.dashTimer,
    cooldown: window.__game.hero.dashCooldown,
    invulnerable: window.__game.hero.invulnerable,
    joyId: window.__game.input._joyTouchId,
  }));
  const dashTriggered = afterDash.dashTimer > 0 || afterDash.cooldown > beforeDash.cooldown + 0.5;
  report('右半 tap 觸發 dash（搖桿持續按住）', dashTriggered, `dashTimer=${afterDash.dashTimer.toFixed(3)} cd=${afterDash.cooldown.toFixed(2)} inv=${afterDash.invulnerable}`);
  report('dash 後搖桿仍然啟動', afterDash.joyId !== -1, `joyId=${afterDash.joyId}`);

  // === 步驟 4：右半觸點放開（dash 那指）→ 搖桿不受影響
  // CDP touchEnd 的 touchPoints = 正在結束的觸點（不是剩下的）
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [{ x: 350, y: 400, id: 2 }],
  });
  await new Promise(r => setTimeout(r, 80));
  const afterRightRelease = await page.evaluate(() => ({
    joyId: window.__game.input._joyTouchId,
  }));
  report('右半放開後搖桿仍啟動', afterRightRelease.joyId !== -1, `joyId=${afterRightRelease.joyId}`);

  // === 步驟 5：搖桿那指放開 → 搖桿關閉、knob 隱藏
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [{ x: joyBaseX + 100, y: joyBaseY - 100, id: 1 }],
  });
  await new Promise(r => setTimeout(r, 250));
  const final = await page.evaluate(() => ({
    joyId: window.__game.input._joyTouchId,
    joyDx: window.__game.input._joyDx,
    joyDz: window.__game.input._joyDz,
    knobActive: document.getElementById('joystick-knob').classList.contains('active'),
  }));
  report('搖桿關閉 _joyTouchId = -1', final.joyId === -1, JSON.stringify(final));
  report('搖桿方向歸零', final.joyDx === 0 && final.joyDz === 0);
  report('knob .active class 已移除', !final.knobActive);

  // === Summary ===
  console.log('\n=== Summary ===');
  const passed = results.filter(r => r.ok).length;
  console.log(`${passed}/${results.length} pass`);
  const realErrs = errs.filter(e => !e.includes('404'));
  console.log(`errors: ${realErrs.length}`);
  for (const e of realErrs) console.log(' ', e);
  process.exitCode = passed === results.length && realErrs.length === 0 ? 0 : 1;
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
