// 一次性視覺驗證腳本：截 game over screen 的桌面 + mobile 版
// 用法：cd tools && node screenshot-gameover.mjs

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = 18081;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/' || urlPath === '') urlPath = '/index.html';
  const filePath = path.join(ROOT, urlPath);
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  fs.stat(filePath, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });
});

await new Promise(r => server.listen(PORT, r));
console.log(`[shot] server ready :${PORT}`);

const browser = await puppeteer.launch({ headless: 'new' });

async function shot(viewport, file, scrollTop = 0) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  await page.goto(`http://localhost:${PORT}/?bot=1&speed=4&easy=1&bonusPerks=4`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game, { timeout: 30_000 });
  await new Promise(r => setTimeout(r, 4000));
  await page.evaluate(() => {
    window.__game.crystal.hp = 0;
    window.__game.perks.shieldHp = 0;
    window.__game.usedFirstRunSave = true;
    window.__game._endGame();
  });
  await new Promise(r => setTimeout(r, 1000));
  // #gameover 是 fixed + overflow-y:auto，scroll 它而不是 window
  await page.evaluate((y) => {
    const el = document.getElementById('gameover');
    if (el) el.scrollTop = y;
  }, scrollTop);
  await new Promise(r => setTimeout(r, 300));
  const outPath = path.join(__dirname, 'sim-output', file);
  await page.screenshot({ path: outPath, fullPage: false });
  console.log(`[shot] ${file} → ${outPath}`);
  await page.close();
}

// 桌面：viewport 超高，讓整個 game over 塞下不被 cropped
await shot({ width: 1920, height: 2400 }, 'gameover-desktop-full.png', 0);
// Mobile：viewport 也加高
await shot({ width: 390, height: 2400 }, 'gameover-mobile-full.png', 0);

await browser.close();
server.close();
console.log('[shot] done');
