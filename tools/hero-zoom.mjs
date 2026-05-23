// 把 hero 拉到視野中央、暫停遊戲、隱藏 toast，截一張清楚的 hero 大圖
import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const PORT = 8766;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css' };

const server = createServer(async (req, res) => {
  try {
    let p = req.url.split('?')[0];
    if (p === '/' || p === '') p = '/index.html';
    const full = resolve(ROOT, '.' + p);
    if (!full.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
    const data = await readFile(full);
    res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
    res.end(data);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(PORT, r));

const browser = await puppeteer.launch({ headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1200, deviceScaleFactor: 2 });
page.on('pageerror', e => console.log('[pageerror]', e.message));

await page.goto(`http://localhost:${PORT}/?nointro=1`, { waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 2500));

// 把 hero 放到 (0, 0)、隱藏 toast、暫停、把相機 zoom 進去
await page.evaluate(() => {
  const g = window.__game;
  if (!g) return;
  g.hero.position.set(0, 0.9, 4);
  g.hero.mesh.position.set(0, 0.9, 4);
  // 隱藏 tutorial / overlay
  for (const id of ['tutorial-toast','help','title','damage-layer']) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  }
  // 暫停
  g.userPaused = true;
  // 用接近實機的相機角度但拉近：原本 (0, 26, 18) 是俯瞰，這裡縮成 (0, 7, 5) 維持同角度
  g._camOffset.set(0, 7, 5);
});

await new Promise(r => setTimeout(r, 500));
await page.screenshot({ path: 'hero-zoom.png', fullPage: false });
console.log('saved hero-zoom.png');

await browser.close();
server.close();
