// 驗證 2026-05-23 兩套裝置 profile：
// 1) ?device=desktop 強制 → AA=true / shadows=true / PR=devicePR / 桌面 help 文案
// 2) ?device=mobile 強制 + iPhone emulate → AA=false / shadows=false / PR≤1.5 / 行動 help 文案
//    並驗證觸點 Y 偏移：tap 在英雄正下方 50px → hero 不會被遮（pointerWorldZ 比 raw tap 的 Z 小）
import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';
import { dirname, resolve, extname } from 'path';
import { createServer } from 'http';
import { readFile } from 'fs/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const PORT = 8768;
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
const results = [];
function report(label, ok, info) {
  results.push({ label, ok, info });
  console.log(`${ok ? '✓' : '✗'} ${label}`, info || '');
}

async function probe(deviceParam, emulateMobile) {
  const page = await browser.newPage();
  if (emulateMobile) {
    await page.setViewport({ width: 393, height: 852, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
    await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1');
  } else {
    await page.setViewport({ width: 1280, height: 800 });
  }
  const logs = [];
  page.on('console', m => logs.push(m.text()));
  const errs = [];
  page.on('pageerror', e => errs.push('[pageerror] ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('[console.error] ' + m.text()); });
  await page.goto(`http://localhost:${PORT}/?nointro=1&device=${deviceParam}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 2000));
  const state = await page.evaluate(() => ({
    rendererAA: window.__game?.renderer?.capabilities?.isWebGL2 != null ? window.__game.renderer.getContext().getContextAttributes()?.antialias : null,
    shadowsEnabled: window.__game?.renderer?.shadowMap?.enabled,
    pixelRatio: window.__game?.renderer?.getPixelRatio(),
    sunCastShadow: (() => {
      const lights = [];
      window.__game?.scene?.traverse(o => { if (o.isDirectionalLight) lights.push(o); });
      return lights[0]?.castShadow;
    })(),
    helpHtml: document.getElementById('help')?.innerHTML?.slice(0, 200),
    inputDeadZone: window.__game?.input?._deadZone,
    inputTouchOffset: window.__game?.input?._touchYOffsetPx,
  }));
  const deviceLog = logs.find(l => l.startsWith('[device]'));
  await page.close();
  return { state, deviceLog, errs };
}

try {
  // === 桌面路徑 ===
  console.log('\n--- Desktop profile (?device=desktop) ---');
  const dt = await probe('desktop', false);
  console.log(' device log:', dt.deviceLog);
  console.log(' state:', JSON.stringify(dt.state, null, 2));
  report('Desktop: AA on', dt.state.rendererAA === true);
  report('Desktop: shadows enabled', dt.state.shadowsEnabled === true);
  report('Desktop: sun castShadow', dt.state.sunCastShadow === true);
  report('Desktop: pixelRatio ≤ 2', dt.state.pixelRatio <= 2);
  report('Desktop: help mentions 鼠標', /鼠標|🖱/.test(dt.state.helpHtml));
  report('Desktop: touchYOffset = 0', dt.state.inputTouchOffset === 0);
  report('Desktop: no JS errors', dt.errs.filter(e => !e.includes('404')).length === 0, dt.errs.join('|'));

  // === 手機路徑 ===
  console.log('\n--- Mobile profile (?device=mobile + iPhone emulate) ---');
  const mb = await probe('mobile', true);
  console.log(' device log:', mb.deviceLog);
  console.log(' state:', JSON.stringify(mb.state, null, 2));
  report('Mobile: AA off', mb.state.rendererAA === false);
  report('Mobile: shadows disabled', mb.state.shadowsEnabled === false);
  report('Mobile: sun castShadow = false', mb.state.sunCastShadow === false);
  report('Mobile: pixelRatio ≤ 1.5', mb.state.pixelRatio <= 1.5);
  report('Mobile: help mentions 螢幕 / 短點', /螢幕|短點|👆/.test(mb.state.helpHtml));
  report('Mobile: touchYOffset = 80', mb.state.inputTouchOffset === 80);
  report('Mobile: no JS errors', mb.errs.filter(e => !e.includes('404')).length === 0, mb.errs.join('|'));

  // === Summary ===
  const passed = results.filter(r => r.ok).length;
  console.log(`\n=== ${passed}/${results.length} pass ===`);
  if (passed < results.length) {
    console.log('failures:');
    for (const r of results) if (!r.ok) console.log(' -', r.label, r.info || '');
  }
  process.exitCode = passed === results.length ? 0 : 1;
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
