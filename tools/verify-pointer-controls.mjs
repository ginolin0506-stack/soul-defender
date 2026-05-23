// 2026-05-23 桌面操控驗證：WASD 移動 + 左鍵朝鼠標方向 dash
// 1) 不按鍵也不移鼠標 → hero 不動
// 2) 按 KeyD → hero 朝 +X（右）移動；放開後停下
// 3) 鼠標移到 hero 右上方 → mousedown → dashDir 朝右上（dx>0, dz<0）
// 4) 鼠標離開 canvas → pointerActive=false；按 KeyW + click → dash 朝 -Z（fallback move dir）
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

const URL = `http://localhost:${PORT}/?nointro=1&device=desktop`;
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
  await new Promise(r => setTimeout(r, 1500));

  // 1) 不移鼠標 / 不按鍵 → hero 不動
  const before = await page.evaluate(() => ({
    heroX: window.__game.hero.position.x,
    heroZ: window.__game.hero.position.z,
    mode: window.__game.input._mode,
  }));
  await new Promise(r => setTimeout(r, 600));
  const idle = await page.evaluate(() => ({
    heroX: window.__game.hero.position.x,
    heroZ: window.__game.hero.position.z,
  }));
  report('Desktop input mode = mouse', before.mode === 'mouse', JSON.stringify(before));
  report('idle 0.6s → hero 沒有自動移動', Math.abs(idle.heroX - before.heroX) < 0.05 && Math.abs(idle.heroZ - before.heroZ) < 0.05, `Δ=(${(idle.heroX-before.heroX).toFixed(2)}, ${(idle.heroZ-before.heroZ).toFixed(2)})`);

  // 2) 按 KeyD → hero 朝 +X 移動；放開後停下
  await page.keyboard.down('d');
  await new Promise(r => setTimeout(r, 700));
  const afterD = await page.evaluate(() => ({
    heroX: window.__game.hero.position.x,
    heroZ: window.__game.hero.position.z,
  }));
  await page.keyboard.up('d');
  await new Promise(r => setTimeout(r, 400));
  const afterRelease = await page.evaluate(() => ({
    heroX: window.__game.hero.position.x,
    heroZ: window.__game.hero.position.z,
  }));
  report('KeyD 按住 0.7s → hero 朝 +X 移動', afterD.heroX - idle.heroX > 0.5, `dx=${(afterD.heroX - idle.heroX).toFixed(2)}`);
  report('放開 KeyD 後 hero 停下', Math.abs(afterRelease.heroX - afterD.heroX) < 0.5, `Δ=${(afterRelease.heroX - afterD.heroX).toFixed(2)}`);

  // 3) 鼠標移到 hero 螢幕位置「右上方」 → mousedown → dashDir 朝右上
  const canvasBox = await page.evaluate(() => {
    const c = document.getElementById('game');
    const r = c.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  });
  // hero 大概在畫面中央偏下；右上 = x 70%, y 25%
  await page.mouse.move(canvasBox.x + canvasBox.w * 0.7, canvasBox.y + canvasBox.h * 0.25);
  await new Promise(r => setTimeout(r, 200));
  const beforeDash = await page.evaluate(() => ({
    pointerActive: window.__game.input.pointerActive,
    pwX: window.__game.input.pointerWorldX,
    pwZ: window.__game.input.pointerWorldZ,
    heroX: window.__game.hero.position.x,
    heroZ: window.__game.hero.position.z,
    cd: window.__game.hero.dashCooldown,
  }));
  await page.mouse.down({ button: 'left' });
  await page.mouse.up({ button: 'left' });
  await new Promise(r => setTimeout(r, 50));   // 抓 dash 觸發瞬間的 dashDir，要在 dash 還沒結束前
  const inDash = await page.evaluate(() => ({
    dashTimer: window.__game.hero.dashTimer,
    dashDirX: window.__game.hero.dashDir.x,
    dashDirZ: window.__game.hero.dashDir.z,
    cd: window.__game.hero.dashCooldown,
    inv: window.__game.hero.invulnerable,
  }));
  report('pointerActive=true（鼠標在 canvas）', beforeDash.pointerActive === true, JSON.stringify(beforeDash));
  const dashTriggered = inDash.dashTimer > 0 || inDash.cd > beforeDash.cd + 0.5;
  report('mousedown 觸發 dash', dashTriggered, `dashTimer=${inDash.dashTimer.toFixed(3)} cd=${inDash.cd.toFixed(2)}`);
  // 鼠標在 hero 右上 → dashDir.x > 0, dashDir.z < 0
  // （注意：鼠標 world 座標的 X 是 +、Z 是 -，hero 在 (0, 6)，差值方向就是右上）
  report('dashDir 朝鼠標方向（dx>0 且 dz<0）', inDash.dashDirX > 0.2 && inDash.dashDirZ < -0.2, `dashDir=(${inDash.dashDirX.toFixed(2)}, ${inDash.dashDirZ.toFixed(2)})`);

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
