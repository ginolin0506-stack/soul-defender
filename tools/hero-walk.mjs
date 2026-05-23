// 拍走路動畫的 4 個關鍵 frame（phase 0, π/2, π, 3π/2）對照動作
import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';
import { dirname, resolve, extname } from 'path';
import { createServer } from 'http';
import { readFile } from 'fs/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const PORT = 8767;
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

// 暫停遊戲、清視覺、把 hero 放原點、模擬走路狀態
await page.evaluate(() => {
  const g = window.__game;
  g.userPaused = true;
  g.hero.position.set(0, 0.9, 0);
  g.hero.mesh.position.copy(g.hero.position);
  g.hero._spawnT = 0;
  g.hero.mesh.scale.set(1, 1, 1);
  if (g.crystal.group) g.crystal.group.visible = false;
  for (const sw of g._allSwarmsArr || []) if (sw.mesh) sw.mesh.visible = false;
  if (g.tether && g.tether.mesh) g.tether.mesh.visible = false;
  for (const sel of ['#title','#help','#hud','#stats','#tutorial-toast','#damage-layer','#boot-menu','#crystal-hp','#hero-hp','#xp-bar','#hero-hp-text','#hp-text','#kills','#time','#fps','#enemy-count','#soul-count','#bullet-count','#level','#boss-hp-wrap','#entropy-wrap','#mute-btn','.debug-only','#hud-top','#hud-bottom','#pause-overlay']) {
    document.querySelectorAll(sel).forEach(el => el.style.display = 'none');
  }
  // 自訂 RAF：每幀套相機、推進 walk phase + 渲染
  window.__heroCam = { x: -2.4, y: 1.0, z: -2.4, look: { x: 0, y: 0.4, z: 0 } };
  window.__phaseTarget = 0;
  window.__renderLoop = () => {
    if (!window.__heroCam) return;
    // 強制 walk phase 到目標值，並執行 hero 的 limb 動畫
    g.hero._walkPhase = window.__phaseTarget;
    g.hero.velocity.set(0, 0, -5);   // 模擬以 5u/s 朝 -Z 走（中速）
    // 手動跑一次 hero.update 的「肢體動畫」段落
    const moveLen = Math.sqrt(g.hero.velocity.x ** 2 + g.hero.velocity.z ** 2);
    const ratio = Math.min(1, moveLen / 9.5);
    const swingAmp = 0.42 * (0.4 + ratio * 0.6);
    const armAmp = 0.36 * (0.4 + ratio * 0.6);
    const armRAmp = armAmp * 0.35;
    const ph = g.hero._walkPhase;
    if (g.hero._legL) g.hero._legL.rotation.x = Math.sin(ph) * swingAmp;
    if (g.hero._legR) g.hero._legR.rotation.x = Math.sin(ph + Math.PI) * swingAmp;
    if (g.hero._armL) g.hero._armL.rotation.x = Math.sin(ph + Math.PI) * armAmp;
    if (g.hero._armR) g.hero._armR.rotation.x = Math.sin(ph) * armRAmp;
    g.camera.position.set(window.__heroCam.x, window.__heroCam.y, window.__heroCam.z);
    g.camera.lookAt(window.__heroCam.look.x, window.__heroCam.look.y, window.__heroCam.look.z);
    g.renderer.render(g.scene, g.camera);
    requestAnimationFrame(window.__renderLoop);
  };
  requestAnimationFrame(window.__renderLoop);
});
await new Promise(r => setTimeout(r, 500));

// 4 個關鍵 phase frame
const phases = [
  { name: '0-neutral', val: 0 },
  { name: '1-stride',  val: Math.PI / 2 },
  { name: '2-cross',   val: Math.PI },
  { name: '3-stride2', val: 3 * Math.PI / 2 },
];

for (const { name, val } of phases) {
  await page.evaluate((v) => { window.__phaseTarget = v; }, val);
  await new Promise(r => setTimeout(r, 200));
  await page.screenshot({ path: `hero-walk-${name}.png` });
}

await browser.close();
server.close();
console.log('done — wrote hero-walk-{0,1,2,3}.png');
