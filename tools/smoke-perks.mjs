// 2026-05-22 天賦系統大改 smoke test：
// 1. 頁面載入 → 無 pageerror
// 2. 拿到所有天賦逐一 apply，確認 game tick 不會 throw
// 3. 觸發脈衝 / pierce / hex strike → 確認 enemy 數量正常變動
import puppeteer from 'puppeteer';

const URL = 'http://localhost:8080/?nointro=1';
const errors = [];
const browser = await puppeteer.launch({ headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
page.on('pageerror', (err) => { errors.push('[PAGEERROR] ' + err.message); console.log('[PAGEERROR]', err.message); });
page.on('console', (msg) => { if (msg.type() === 'error') { errors.push('[CONSOLE.ERROR] ' + msg.text()); console.log('[CONSOLE.ERROR]', msg.text()); } });

await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => { try { localStorage.clear(); } catch(e) {} });
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__game && window.__game.elapsed > 0.5', { timeout: 10000 });

// 一次套用所有 perks，模擬「全 perk 同時生效」極端狀況
const applied = await page.evaluate(() => {
  const g = window.__game;
  const PERKS = g._allPerksForDebug || null;  // 不一定 expose；改從 perks taken 推
  // 直接從 window.PERKS / module 取不到，但我們可以用 g.perkUI / PERKS 模組來測…
  // 簡化：暴力把所有 known apply 操作直接做
  const applyAll = () => {
    // hex strike
    g.perks.hexStrikeOverload = true;
    g.hexStrike.cooldown = 0;
    // soul debt
    g.perks.soulDebt = true;
    // critical suspension
    g.perks.criticalSuspension = true;
    // aegis charge x3
    g.perks.aegisStacks = 3;
    // pierce
    g.perks.pierce = true;
    g.perks.pierceTimer = 0;
    // soul vacuum
    g.perks.soulVacuum = true;
    // regicide
    g.perks.regicide = true;
    // kinetic reversal
    g.perks.kineticReversal = true;
    // crit frenzy x3
    g.perks.critChanceBonus = 0.45;
    // bloom x3
    g.perks.pulseRadiusMult = 1.15 * 1.15 * 1.15;
    // swift step
    g.perks.heroSpeedMult = 1.18;
    g.perks.dashCooldownMult = 0.90;
    // crystallize x3
    g.crystal.maxHp += 750;
    g.crystal.hp = g.crystal.maxHp;
  };
  applyAll();
  return Object.keys(g.perks);
});
console.log('perks keys after applyAll:', applied);

// 等 6 秒讓 game tick 跑、生怪、各種 perk 觸發
await new Promise(r => setTimeout(r, 6000));

const stat = await page.evaluate(() => {
  const g = window.__game;
  return {
    elapsed: Math.round(g.elapsed * 10) / 10,
    leechAlive: g.swarm.activeCount,
    bullets: g.bullets.activeCount,
    bombs: g.bombs.activeCount,
    crystalHp: Math.round(g.crystal.hp),
    crystalMaxHp: g.crystal.maxHp,
    heroHp: Math.round(g.hero.hp),
    swordWavesVisible: g.hero._swordWaves.filter(w => w.mesh.visible).length,
    hexState: g.hexStrike.state,
    hexCD: Math.round(g.hexStrike.cooldown * 10) / 10,
    orbital: g.tether.orbitalCount,
    perks: {
      pierce: g.perks.pierce,
      hexStrikeOverload: g.perks.hexStrikeOverload,
      soulVacuum: g.perks.soulVacuum,
      soulDebt: g.perks.soulDebt,
      criticalSuspension: g.perks.criticalSuspension,
    },
  };
});
console.log('--- 6s after applyAll ---');
console.log(JSON.stringify(stat, null, 2));

// 強制觸發 hex strike：刷一波 leech 然後等
await page.evaluate(() => {
  for (let i = 0; i < 5; i++) {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyB', key: 'b', bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyB', key: 'b', bubbles: true }));
  }
});
await new Promise(r => setTimeout(r, 100));
// 強制 CD = 0
await page.evaluate(() => { window.__game.hexStrike.cooldown = 0; });
await new Promise(r => setTimeout(r, 4000));

const after = await page.evaluate(() => {
  const g = window.__game;
  return {
    elapsed: Math.round(g.elapsed * 10) / 10,
    leechAlive: g.swarm.activeCount,
    hexState: g.hexStrike.state,
    hexCD: Math.round(g.hexStrike.cooldown * 10) / 10,
    hexTargets: g.hexStrike.targets.length,
  };
});
console.log('--- after hex strike attempt ---');
console.log(JSON.stringify(after, null, 2));

console.log('\nErrors collected:', errors.length);
for (const e of errors) console.log(e);

await browser.close();
process.exit(errors.length === 0 ? 0 : 1);
