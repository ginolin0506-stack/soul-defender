// Soul Defender — 平衡測試模擬器
// 用 Puppeteer 跑 N 場 bot 自動局，蒐集 telemetry，輸出 JSON + 摘要
//
// 用法：
//   node balance-sim.mjs [runs=10] [speed=3] [maxSec=900] [parallel=2] [easy=0|1] [bonusPerks=0]
//
// 預設：10 場、speed=3、最多模擬 15 分鐘 game-time、parallel 2、easy=0、bonusPerks=0
// easy=1       → 保留第一局保護（高 HP、慢 spawn、無 slinger/splitter）但強制 boss spawn
// bonusPerks=N → 開局自動套 N 個防守型 perk（模擬已進階玩家，用來打 boss）

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

// === 參數 ===
const args = process.argv.slice(2);
const cfg = {
  runs: parseInt(args[0] || '10', 10),
  speed: parseInt(args[1] || '3', 10),
  maxSec: parseInt(args[2] || '900', 10),
  parallel: parseInt(args[3] || '2', 10),
  easy: args[4] === '1' || args[4] === 'easy',
  bonusPerks: parseInt(args[5] || '0', 10),
  port: 18080,
};

// === 簡易 static server ===
function mkServer(rootDir, port) {
  const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js':   'application/javascript; charset=utf-8',
    '.mjs':  'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.css':  'text/css; charset=utf-8',
    '.png':  'image/png',
    '.svg':  'image/svg+xml',
  };
  const server = http.createServer((req, res) => {
    let urlPath = decodeURIComponent(req.url.split('?')[0]);
    if (urlPath === '/' || urlPath === '') urlPath = '/index.html';
    const filePath = path.join(rootDir, urlPath);
    if (!filePath.startsWith(rootDir)) { res.writeHead(403); res.end('forbidden'); return; }
    fs.stat(filePath, (err, st) => {
      if (err || !st.isFile()) { res.writeHead(404); res.end('not found: ' + urlPath); return; }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      fs.createReadStream(filePath).pipe(res);
    });
  });
  return new Promise(r => server.listen(port, () => r(server)));
}

// === 跑一場 ===
async function runOne(browser, { url, maxSec, runIdx }) {
  const page = await browser.newPage();
  const logs = [];
  page.on('console', msg => {
    const type = msg.type();
    if (type === 'error' || type === 'warning') {
      logs.push(`[${type}] ${msg.text()}`);
    }
  });
  page.on('pageerror', err => logs.push(`[pageerror] ${err.message}`));

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    // 等 bot telemetry 物件出現（CDN three.js 第一次抓會慢）
    await page.waitForFunction(() => window.__bot && window.__bot.botMode === true, { timeout: 60_000 });

    // 輪詢直到 gameOver 或超過 maxSec game-time
    const startWall = Date.now();
    let lastGameTime = 0;
    let lastProgressWall = Date.now();
    while (true) {
      const tel = await page.evaluate(() => {
        const t = window.__bot;
        if (!t) return null;
        return {
          time: t.time,
          gameOver: t.gameOver,
          kills: t.kills,
          level: t.level,
          crystalHp: t.crystalHp,
        };
      });
      if (!tel) break;
      if (tel.gameOver) break;
      if (tel.time >= maxSec) break;
      // 進度檢測：game-time 30 秒沒前進 → 視為 hang，放棄這場
      if (tel.time > lastGameTime + 0.5) {
        lastGameTime = tel.time;
        lastProgressWall = Date.now();
      } else if ((Date.now() - lastProgressWall) > 30_000) {
        // 30 wall-sec 沒進展 → hang
        return { ok: false, runIdx, error: `hang at t=${tel.time.toFixed(1)}s hp=${tel.crystalHp}`, logs };
      }
      // 硬性 wall-clock 上限：每場 4 分鐘 wall（speed=3 + headless 應該綽綽有餘）
      if ((Date.now() - startWall) > 240_000) {
        return { ok: false, runIdx, error: `wall timeout at t=${tel.time.toFixed(1)}s`, logs };
      }
      await new Promise(r => setTimeout(r, 500));
    }

    const finalTel = await page.evaluate(() => JSON.parse(JSON.stringify(window.__bot)));
    return { ok: true, runIdx, telemetry: finalTel, logs };
  } catch (err) {
    return { ok: false, runIdx, error: err.message, logs };
  } finally {
    await page.close();
  }
}

// === Pool runner — 同時最多 N 個 page ===
async function runAll(browser, total, parallel, makeOpts) {
  const results = [];
  let next = 0;
  async function worker(workerId) {
    while (true) {
      const idx = next++;
      if (idx >= total) return;
      process.stdout.write(`  [worker ${workerId}] run #${idx + 1}/${total} 開始\n`);
      const r = await runOne(browser, makeOpts(idx));
      const t = r.telemetry;
      if (t) {
        const cause = t.cause || (t.gameOver ? 'dead' : 'timeout');
        process.stdout.write(`  [worker ${workerId}] run #${idx + 1} ✓ ${cause} t=${t.time.toFixed(0)}s kills=${t.kills} lv=${t.level} hp=${t.crystalHp}\n`);
      } else {
        process.stdout.write(`  [worker ${workerId}] run #${idx + 1} ✗ ${r.error}\n`);
      }
      results.push(r);
    }
  }
  await Promise.all(Array.from({ length: parallel }, (_, i) => worker(i)));
  results.sort((a, b) => a.runIdx - b.runIdx);
  return results;
}

// === 摘要 ===
function summarize(results) {
  const ok = results.filter(r => r.ok && r.telemetry);
  const tels = ok.map(r => r.telemetry);
  if (tels.length === 0) return { error: 'no successful runs' };

  const avg = arr => arr.reduce((a, b) => a + b, 0) / arr.length;
  const pct = (arr, p) => {
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.floor(s.length * p)];
  };

  const times = tels.map(t => t.time);
  const kills = tels.map(t => t.kills);
  const levels = tels.map(t => t.level);
  const deaths = tels.filter(t => t.gameOver);

  // 各 boss 平均擊殺時間 (相對於 spawn time)
  const bossStats = {};
  for (const t of tels) {
    for (const ev of t.bossEvents || []) {
      bossStats[ev.name] = bossStats[ev.name] || { spawns: 0, kills: 0, killTimes: [] };
      if (ev.event === 'spawn') bossStats[ev.name].spawns++;
      if (ev.event === 'kill')  bossStats[ev.name].kills++;
    }
    // 推估擊殺 boss 花費時間（kill - 最近一次 spawn）
    const byName = {};
    for (const ev of t.bossEvents || []) {
      if (ev.event === 'spawn') byName[ev.name] = ev.t;
      else if (ev.event === 'kill' && byName[ev.name] != null) {
        const dur = ev.t - byName[ev.name];
        bossStats[ev.name].killTimes.push(dur);
      }
    }
  }

  // 統計 perk 採用頻率
  const perkCount = {};
  for (const t of tels) {
    const uniq = new Set(t.perks);
    for (const p of uniq) perkCount[p] = (perkCount[p] || 0) + 1;
  }
  const perkRank = Object.entries(perkCount)
    .sort((a, b) => b[1] - a[1])
    .map(([id, c]) => ({ id, count: c, pct: (c / tels.length * 100).toFixed(0) + '%' }));

  return {
    runs: tels.length,
    survival: {
      avgTime: +avg(times).toFixed(1),
      medianTime: +pct(times, 0.5).toFixed(1),
      minTime: +Math.min(...times).toFixed(1),
      maxTime: +Math.max(...times).toFixed(1),
      deaths: deaths.length,
    },
    kills: {
      avg: +avg(kills).toFixed(0),
      median: pct(kills, 0.5),
      min: Math.min(...kills),
      max: Math.max(...kills),
    },
    level: {
      avg: +avg(levels).toFixed(1),
      median: pct(levels, 0.5),
      max: Math.max(...levels),
    },
    bosses: Object.fromEntries(
      Object.entries(bossStats).map(([name, s]) => [
        name,
        {
          spawnsTotal: s.spawns,
          killsTotal: s.kills,
          killRate: s.spawns ? (s.kills / s.spawns * 100).toFixed(0) + '%' : '0%',
          avgKillDuration: s.killTimes.length ? +avg(s.killTimes).toFixed(1) : null,
        },
      ])
    ),
    perks: perkRank,
  };
}

// === main ===
(async () => {
  console.log(`[balance-sim] cfg = ${JSON.stringify(cfg)}`);
  console.log(`[balance-sim] 啟動 static server on :${cfg.port} (root=${ROOT})`);
  const server = await mkServer(ROOT, cfg.port);

  console.log(`[balance-sim] 啟動 puppeteer ...`);
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--mute-audio'],
  });

  const easyParam = cfg.easy ? '&easy=1' : '';
  const bpParam = cfg.bonusPerks > 0 ? `&bonusPerks=${cfg.bonusPerks}` : '';
  const url = `http://localhost:${cfg.port}/?bot=1&speed=${cfg.speed}&headless=1${easyParam}${bpParam}`;
  console.log(`[balance-sim] 跑 ${cfg.runs} 場（parallel=${cfg.parallel}）@ ${url}`);
  console.log(`[balance-sim] 每場最多 ${cfg.maxSec}s game-time\n`);

  const t0 = Date.now();
  const results = await runAll(browser, cfg.runs, cfg.parallel, (i) => ({
    url, maxSec: cfg.maxSec, runIdx: i,
  }));
  const wallSec = ((Date.now() - t0) / 1000).toFixed(1);

  const summary = summarize(results);
  console.log(`\n[balance-sim] 完成 — wall ${wallSec}s\n`);
  console.log('=== SUMMARY ===');
  console.log(JSON.stringify(summary, null, 2));

  // 寫檔
  const outDir = path.join(__dirname, 'sim-output');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const summaryPath = path.join(outDir, `summary-${stamp}.json`);
  const detailPath = path.join(outDir, `runs-${stamp}.json`);
  fs.writeFileSync(summaryPath, JSON.stringify({ cfg, summary, wallSec }, null, 2));
  fs.writeFileSync(detailPath, JSON.stringify(results, null, 2));
  console.log(`\n[balance-sim] 摘要 → ${summaryPath}`);
  console.log(`[balance-sim] 詳細 → ${detailPath}`);

  await browser.close();
  server.close();
})().catch(err => {
  console.error('[balance-sim] FATAL', err);
  process.exit(1);
});
