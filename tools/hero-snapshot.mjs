// Hero 近照 — 用近距離 + 純色背景把英雄拍下來對照原圖
import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';
import { dirname, resolve, extname } from 'path';
import { createServer } from 'http';
import { readFile } from 'fs/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const PORT = 8766;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  try {
    let p = req.url.split('?')[0];
    if (p === '/' || p === '') p = '/index.html';
    const full = resolve(ROOT, '.' + p);
    if (!full.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
    const data = await readFile(full);
    res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
    res.end(data);
  } catch (e) { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(PORT, r));

const browser = await puppeteer.launch({ headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: 800, height: 800 });
page.on('pageerror', e => console.log('[pageerror]', e.message));
page.on('console', m => { if (m.type() === 'error') console.log('[err]', m.text()); });

await page.goto(`http://localhost:${PORT}/?nointro=1`, { waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 2500));

// 隱掉一切非 hero 視覺、暫停遊戲循環、把英雄放原點完成 spawn-in
await page.evaluate(() => {
  const g = window.__game;
  if (!g) return;
  // **暫停遊戲** — 否則 _tickInner 會每幀覆蓋相機位置
  g.userPaused = true;
  g.hero.position.set(0, 0.9, 0);
  g.hero.mesh.position.copy(g.hero.position);
  g.hero._spawnT = 0;
  g.hero.mesh.scale.set(1, 1, 1);
  if (g.crystal.group) g.crystal.group.visible = false;
  for (const sw of g._allSwarmsArr || []) if (sw.mesh) sw.mesh.visible = false;
  if (g.tether && g.tether.mesh) g.tether.mesh.visible = false;
  // 隱 HUD（包含右上角 mute / 升等鈕、暫停 overlay）
  for (const sel of ['#title','#help','#hud','#stats','#tutorial-toast','#damage-layer','#boot-menu','#crystal-hp','#hero-hp','#xp-bar','#hero-hp-text','#hp-text','#kills','#time','#fps','#enemy-count','#soul-count','#bullet-count','#level','#boss-hp-wrap','#entropy-wrap','#mute-btn','.debug-only','#hud-top','#hud-bottom','#pause-overlay']) {
    document.querySelectorAll(sel).forEach(el => el.style.display = 'none');
  }
  // 用 RAF 強制每幀重畫且套用我們的相機
  window.__renderLoop = () => {
    if (!window.__heroCam) return;
    g.camera.position.set(window.__heroCam.x, window.__heroCam.y, window.__heroCam.z);
    g.camera.lookAt(window.__heroCam.look.x, window.__heroCam.look.y, window.__heroCam.look.z);
    g.renderer.render(g.scene, g.camera);
    requestAnimationFrame(window.__renderLoop);
  };
  window.__heroCam = { x: 0, y: 1.3, z: 4.0, look: { x: 0, y: 0.9, z: 0 } };
  requestAnimationFrame(window.__renderLoop);
});
await new Promise(r => setTimeout(r, 600));

// hero 朝 -Z 方向；要看「正面」相機放在 -Z 方向
await page.evaluate(() => {
  window.__heroCam.x = 0; window.__heroCam.y = 1.2; window.__heroCam.z = -3.0;
  window.__heroCam.look = { x: 0, y: 0.3, z: 0 };
});
await new Promise(r => setTimeout(r, 400));
await page.screenshot({ path: 'hero-snapshot-front.png' });

// 側面 — 從 +X 拍
await page.evaluate(() => {
  window.__heroCam.x = 3.0; window.__heroCam.y = 1.2; window.__heroCam.z = -0.5;
  window.__heroCam.look = { x: 0, y: 0.3, z: -0.3 };
});
await new Promise(r => setTimeout(r, 400));
await page.screenshot({ path: 'hero-snapshot-side.png' });

// 遊戲實際視角 — top-down isometric
await page.evaluate(() => {
  window.__heroCam.x = 0; window.__heroCam.y = 4.0; window.__heroCam.z = 3.0;
  window.__heroCam.look = { x: 0, y: 0.3, z: 0 };
});
await new Promise(r => setTimeout(r, 400));
await page.screenshot({ path: 'hero-snapshot-topdown.png' });

// 額外：3/4 視角 — 最能呈現參考圖姿態
await page.evaluate(() => {
  window.__heroCam.x = -2.2; window.__heroCam.y = 1.4; window.__heroCam.z = -2.4;
  window.__heroCam.look = { x: 0, y: 0.3, z: 0 };
});
await new Promise(r => setTimeout(r, 400));
await page.screenshot({ path: 'hero-snapshot-3q.png' });

await browser.close();
server.close();
console.log('done — wrote hero-snapshot-{front,side,topdown}.png');
