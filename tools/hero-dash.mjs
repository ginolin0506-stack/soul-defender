// 拍 dash 蹲衝刺 + 持矛前刺姿勢
import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';
import { dirname, resolve, extname } from 'path';
import { createServer } from 'http';
import { readFile } from 'fs/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const PORT = 8768;
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

await page.goto(`http://localhost:${PORT}/?nointro=1`, { waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 2500));

// 鎖定畫面、放 hero 原點、清視覺、強制 dashTimer + 跑 hero.update 套姿勢
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
  window.__heroCam = { x: -2.4, y: 1.0, z: -2.4, look: { x: 0, y: 0.4, z: 0 } };
  // 完全自製的 mini update — 直接套用 dash pose，不依賴 hero.update
  window.__dashT = 0.5;    // 0=起手刃右、0.5=中段刃前、1=收勢刃左
  window.__renderLoop = () => {
    if (!window.__heroCam) return;
    const ph = g.hero;
    const dt = 1/60;
    ph._wobble += dt;
    ph._spawnT = 0;
    ph.mesh.scale.set(1, 1, 1);
    // crouch drop（加深到 -0.50 讓俯角看清楚）
    ph._crouchDrop += (-0.50 - ph._crouchDrop) * Math.min(1, dt * 18);
    ph.mesh.position.set(0, 0.9 + ph._crouchDrop, 0);
    // lean（加深到 -1.00 = 57° 大彎腰）— 套在 upperPivot
    ph._lean += (-1.00 - ph._lean) * Math.min(1, dt * 12);
    ph.mesh.rotation.set(0, 0, 0);
    if (ph._upperPivot) ph._upperPivot.rotation.x = ph._lean;
    if (ph._ring) ph._ring.position.y = -0.88 - ph._crouchDrop;
    // limbs
    const limbBlend = Math.min(1, dt * 30);
    const apply = (p, t) => { if (p) p.rotation.x += (t - p.rotation.x) * limbBlend; };
    apply(ph._legL, -0.70);
    apply(ph._legR, +1.00);
    apply(ph._kneeL, -0.20);
    apply(ph._kneeR, -1.00);
    apply(ph._armL, +1.00);
    // armR — DON'T lerp rotation.x here (controlled by armR.quaternion below)
    // armR + spear collinear sweep — armR 整個轉到揮舞方向，矛鎖定共線
    const sweepAngle = Math.PI * (1 - 2 * window.__dashT);
    ph._armRTmpV.set(Math.sin(sweepAngle), 0, -Math.cos(sweepAngle));
    if (ph._upperPivot) {
      ph._upperInvQ.setFromEuler(ph._upperPivot.rotation).invert();
      ph._armRTmpV.applyQuaternion(ph._upperInvQ);
    }
    ph._armRTargetQ.setFromUnitVectors(ph._armRDownAxis, ph._armRTmpV);
    ph._armR.quaternion.slerp(ph._armRTargetQ, Math.min(1, dt * 35));
    // 矛鎖到手腕 + 180° X 翻轉（+Y blade = armR -Y outward）
    ph._spear.position.lerp(ph._spearDashPos, Math.min(1, dt * 30));
    ph._spear.quaternion.slerp(ph._spearDashQ, Math.min(1, dt * 30));
    // camera
    g.camera.position.set(window.__heroCam.x, window.__heroCam.y, window.__heroCam.z);
    g.camera.lookAt(window.__heroCam.look.x, window.__heroCam.look.y, window.__heroCam.look.z);
    g.renderer.render(g.scene, g.camera);
    requestAnimationFrame(window.__renderLoop);
  };
  requestAnimationFrame(window.__renderLoop);
});

// 拍 5 個揮舞時點（360° 旋擊）：身後 → 右 → 前 → 左 → 身後
const dashPhases = [
  { name: '00-back-start', t: 0.0 },     // 起手刃在身後
  { name: '25-right',      t: 0.25 },    // 刃揮到右側
  { name: '50-front',      t: 0.5 },     // 刃揮到正前
  { name: '75-left',       t: 0.75 },    // 刃揮到左側
  { name: '99-back-end',   t: 0.99 },    // 收勢刃回身後另一側
];

for (const phase of dashPhases) {
  await page.evaluate((tt) => { window.__dashT = tt; }, phase.t);
  await new Promise(r => setTimeout(r, 600));   // 給 blend 收斂
  // 3/4 角度（側前 45°）
  await page.evaluate(() => {
    window.__heroCam.x = -2.6; window.__heroCam.y = 0.9; window.__heroCam.z = -2.4;
    window.__heroCam.look = { x: 0, y: 0.2, z: 0 };
  });
  await new Promise(r => setTimeout(r, 200));
  await page.screenshot({ path: `hero-dash-${phase.name}-3q.png` });
  // top-down（遊戲視角）
  await page.evaluate(() => {
    window.__heroCam.x = 0; window.__heroCam.y = 4.0; window.__heroCam.z = 3.0;
    window.__heroCam.look = { x: 0, y: 0.0, z: 0 };
  });
  await new Promise(r => setTimeout(r, 200));
  await page.screenshot({ path: `hero-dash-${phase.name}-topdown.png` });

  // 真實遊戲視角（hero 在原點：camera (0, 26, 18) lookAt (0, 0, 0)）
  await page.evaluate(() => {
    window.__heroCam.x = 0; window.__heroCam.y = 26; window.__heroCam.z = 18;
    window.__heroCam.look = { x: 0, y: 0, z: 0 };
  });
  await new Promise(r => setTimeout(r, 200));
  await page.screenshot({ path: `hero-dash-${phase.name}-gamecam.png` });
}

await browser.close();
server.close();
console.log('done — wrote hero-dash-{start,mid,end}-{3q,topdown}.png');
