// 驗證 2026-05-23 新操控：pointer-follow + click-dash
// 1) 開遊戲、確認 hero 不動（pointer 尚未啟動）
// 2) 模擬 mousemove 到右上 → hero 朝右上移動
// 3) 模擬 mousedown 在 hero 右側 → 觸發 dash（dashTimer > 0）
// 4) 模擬 touchstart+touchend < 200ms 在 hero 左側 → 觸發 dash
import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';
import { dirname, resolve, extname } from 'path';
import { createServer } from 'http';
import { readFile } from 'fs/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const PORT = 8766;
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

const URL = `http://localhost:${PORT}/?nointro=1`;
const browser = await puppeteer.launch({ headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
const errs = [];
page.on('pageerror', e => errs.push('[pageerror] ' + (e.stack || e.message)));
page.on('console', m => { if (m.type() === 'error') errs.push('[console.error] ' + m.text()); });

const results = [];
function report(label, ok, info) {
  results.push({ label, ok, info });
  console.log(`${ok ? '✓' : '✗'} ${label}`, info || '');
}

try {
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 2500));

  // 1) 初始狀態：hero 沒有移動
  const initial = await page.evaluate(() => ({
    heroX: window.__game?.hero?.position?.x ?? null,
    heroZ: window.__game?.hero?.position?.z ?? null,
    pointerActive: window.__game?.input?.pointerActive ?? null,
  }));
  report('遊戲載入', initial.heroX !== null, JSON.stringify(initial));
  report('初始 pointerActive=false', initial.pointerActive === false);

  // 2) 模擬 mousemove 到 canvas 右上角，等 0.6 秒看 hero 是否朝右上跑
  const canvasBox = await page.evaluate(() => {
    const c = document.getElementById('game');
    const r = c.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  });
  // 右上角：x = 90%, y = 20%
  await page.mouse.move(canvasBox.x + canvasBox.w * 0.9, canvasBox.y + canvasBox.h * 0.2);
  await new Promise(r => setTimeout(r, 600));
  const afterMove = await page.evaluate(() => ({
    heroX: window.__game.hero.position.x,
    heroZ: window.__game.hero.position.z,
    pointerActive: window.__game.input.pointerActive,
    pointerWorldX: window.__game.input.pointerWorldX,
    pointerWorldZ: window.__game.input.pointerWorldZ,
  }));
  report('mousemove → pointerActive=true', afterMove.pointerActive === true, JSON.stringify(afterMove));
  // 右上角的 world X 應為 +、Z 應為 - (game-cam top-down，-Z 是前方)
  const dx = afterMove.heroX - initial.heroX;
  const dz = afterMove.heroZ - initial.heroZ;
  report('hero 朝右上方向移動（dx>0 且 dz<0）', dx > 0.05 && dz < -0.05, `dx=${dx.toFixed(2)} dz=${dz.toFixed(2)}`);

  // 3) 模擬左鍵 click，記錄 dashTimer
  const beforeDash = await page.evaluate(() => ({
    cooldown: window.__game.hero.dashCooldown,
    dashTimer: window.__game.hero.dashTimer,
  }));
  await page.mouse.down({ button: 'left' });
  await page.mouse.up({ button: 'left' });
  // 給 1-2 幀讓 consumeDash 被讀
  await new Promise(r => setTimeout(r, 80));
  const afterDash = await page.evaluate(() => ({
    dashTimer: window.__game.hero.dashTimer,
    invulnerable: window.__game.hero.invulnerable,
    cooldown: window.__game.hero.dashCooldown,
  }));
  // dashTimer > 0 OR cooldown 大幅上升 → dash 觸發了
  const dashTriggered = afterDash.dashTimer > 0 || afterDash.cooldown > beforeDash.cooldown + 0.5;
  report('mousedown 觸發 dash', dashTriggered, `dashTimer=${afterDash.dashTimer.toFixed(3)} cd=${afterDash.cooldown.toFixed(2)} inv=${afterDash.invulnerable}`);

  // 等 dash CD 過
  await new Promise(r => setTimeout(r, 1500));

  // 4) 模擬觸控 tap — 必須在右半才會觸發 dash（左半改為虛擬搖桿）
  const client = await page.target().createCDPSession();
  const tapX = Math.floor(canvasBox.x + canvasBox.w * 0.75);
  const tapY = Math.floor(canvasBox.y + canvasBox.h * 0.5);
  // 用 Input.dispatchTouchEvent (CDP) 模擬 mobile
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: tapX, y: tapY, id: 1 }],
  });
  await new Promise(r => setTimeout(r, 80));
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  await new Promise(r => setTimeout(r, 80));
  const afterTap = await page.evaluate(() => ({
    dashTimer: window.__game.hero.dashTimer,
    cooldown: window.__game.hero.dashCooldown,
  }));
  const tapDashed = afterTap.dashTimer > 0 || afterTap.cooldown > 1.0;
  report('右半 tap 觸發 dash', tapDashed, `dashTimer=${afterTap.dashTimer.toFixed(3)} cd=${afterTap.cooldown.toFixed(2)}`);

  // === Summary ===
  console.log('\n=== Summary ===');
  const passed = results.filter(r => r.ok).length;
  console.log(`${passed}/${results.length} pass`);
  console.log(`captured errors: ${errs.length}`);
  for (const e of errs) console.log(' ', e);
  process.exitCode = passed === results.length ? 0 : 1;
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
