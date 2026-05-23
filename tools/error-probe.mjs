// 直接掃 console error / page error，不需要本機 server — 用 puppeteer 內建 file server 模式
import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const PORT = 8765;
const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
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
  } catch (e) {
    res.writeHead(404); res.end(String(e));
  }
});
await new Promise(r => server.listen(PORT, r));
const URL = `http://localhost:${PORT}/?nointro=1`;

const browser = await puppeteer.launch({ headless: 'new' });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', e => errs.push('[pageerror] ' + (e.stack || e.message)));
page.on('console', m => { if (m.type() === 'error') errs.push('[console.error] ' + m.text()); });

try {
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 5000));
  // 模擬按 debug 鍵叫一隻每種怪
  await page.evaluate(() => {
    for (const c of ['KeyV','KeyC','KeyG','KeyH','KeyK','KeyL','KeyU']) {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: c, bubbles: true }));
      window.dispatchEvent(new KeyboardEvent('keyup', { code: c, bubbles: true }));
    }
  });
  await new Promise(r => setTimeout(r, 1500));
  const state = await page.evaluate(() => ({
    hasGame: !!window.__game,
    elapsed: window.__game ? window.__game.elapsed : null,
    heroPos: window.__game ? [window.__game.hero.position.x, window.__game.hero.position.z] : null,
    crystalHp: window.__game ? window.__game.crystal.hp : null,
    leech: window.__game ? window.__game.swarm.activeCount : null,
    slingers: window.__game ? window.__game.slingers.activeCount : null,
    splitters: window.__game ? window.__game.splitters.activeCount : null,
    sentinels: window.__game ? window.__game.sentinels.activeCount : null,
    wraiths: window.__game ? window.__game.wraiths.activeCount : null,
    lancers: window.__game ? window.__game.lancers.activeCount : null,
    conduits: window.__game ? window.__game.conduits.activeCount : null,
    mires: window.__game ? window.__game.mires.activeCount : null,
  }));
  console.log('STATE:', JSON.stringify(state, null, 2));
  const title = await page.evaluate(() => document.getElementById('title')?.textContent);
  console.log('TITLE:', JSON.stringify(title));
  await page.screenshot({ path: 'screenshot-after-fix.png', fullPage: false });
} catch (e) {
  console.log('GOTO_ERR:', e.message);
}

console.log('--- captured errors (' + errs.length + ') ---');
for (const e of errs) console.log(e);

await browser.close();
server.close();
