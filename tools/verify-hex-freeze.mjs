// 2026-05-22：驗證瞬獄雷鳴啟動時玩家也不能動
// 1. 進遊戲，給玩家 hex strike perk + 強制 CD = 0 + 刷一波怪
// 2. 確認進入 locking 狀態
// 3. 紀錄 hero position & dashCooldown，按 W + Space 5 幀
// 4. 確認位置與 dash CD 都沒變（玩家完全凍結）
import puppeteer from 'puppeteer';

const URL = 'http://localhost:8080/?nointro=1';
const errors = [];
const browser = await puppeteer.launch({ headless: 'new' });
const page = await browser.newPage();
page.on('pageerror', (e) => errors.push('[PAGEERROR] ' + e.message));
await page.setViewport({ width: 1280, height: 720 });

await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => { try { localStorage.clear(); } catch(e) {} });
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__game && window.__game.elapsed > 0.3', { timeout: 10000 });

// 給 hex strike perk + 觸發 lock-on
await page.evaluate(() => {
  const g = window.__game;
  g.perks.hexStrikeOverload = true;
  g.hexStrike.cooldown = 0;
  // 刷一波怪確保 minEnemies 過關
  g.swarm.spawnBurst(20, 8, 16);
});

// 等到 locking 狀態
await page.waitForFunction(() => window.__game.hexStrike.state === 'locking', { timeout: 3000 });
console.log('reached locking state ✓');

// 紀錄初始狀態
const before = await page.evaluate(() => {
  const g = window.__game;
  return {
    hexState: g.hexStrike.state,
    heroX: g.hero.position.x,
    heroZ: g.hero.position.z,
    dashCD: g.hero.dashCooldown,
    pulseTimer: g.hero.pulseTimer,
    elapsed: g.elapsed,
    leechAlive: g.swarm.activeCount,
  };
});
console.log('BEFORE:', JSON.stringify(before, null, 2));

// 嘗試移動 + dash + pulse 5 幀（KeyW 持續 + KeyD + Space）
for (let i = 0; i < 5; i++) {
  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', key: 'w', bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD', key: 'd', bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keyup',   { code: 'Space', key: ' ', bubbles: true }));
  });
  await new Promise(r => setTimeout(r, 40));
}

// 仍應在 locking 或 striking
const during = await page.evaluate(() => {
  const g = window.__game;
  return {
    hexState: g.hexStrike.state,
    heroX: g.hero.position.x,
    heroZ: g.hero.position.z,
    dashCD: g.hero.dashCooldown,
    dashTimer: g.hero.dashTimer,
    pulseTimer: g.hero.pulseTimer,
    elapsed: g.elapsed,
    leechAlive: g.swarm.activeCount,
  };
});
console.log('DURING freeze (after fake input):', JSON.stringify(during, null, 2));

// 釋放鍵
await page.evaluate(() => {
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', key: 'w', bubbles: true }));
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyD', key: 'd', bubbles: true }));
});

// 等待 hex strike 完成（state 回 idle）
await page.waitForFunction(() => window.__game.hexStrike.state === 'idle', { timeout: 8000 });
const after = await page.evaluate(() => {
  const g = window.__game;
  return {
    hexState: g.hexStrike.state,
    heroX: g.hero.position.x,
    heroZ: g.hero.position.z,
    elapsed: g.elapsed,
    leechAlive: g.swarm.activeCount,
  };
});
console.log('AFTER hex finished:', JSON.stringify(after, null, 2));

// 結論
const moved = Math.abs(during.heroX - before.heroX) > 0.001 || Math.abs(during.heroZ - before.heroZ) > 0.001;
const dashFired = during.dashTimer > 0 || during.dashCD !== before.dashCD;
const elapsedAdvanced = (during.elapsed - before.elapsed) > 0.001;
const leechChanged = during.leechAlive !== before.leechAlive;

console.log('\n=== 結論 ===');
console.log('hero 是否移動:', moved, '(應該 false)');
console.log('dash 是否觸發:', dashFired, '(應該 false)');
console.log('elapsed 是否前進:', elapsedAdvanced, '(應該 false — 整個世界時間凍結)');
console.log('leech 數量是否變化:', leechChanged, '(凍結期間應該 false — 但 hex strike 會清掉一些，仍可能 true)');

console.log('\nErrors:', errors.length);
for (const e of errors) console.log(e);
await browser.close();
process.exit((!moved && !dashFired && !elapsedAdvanced && errors.length === 0) ? 0 : 1);
