// Bot 模式：自動英雄 AI + 自動選 perk + telemetry
// 透過 URL ?bot=1 啟用，?speed=N 加速（cap=4），?headless=1 把 RAF 換成 setTimeout 跑最快
// 安全防線：?bot=1 僅在 localhost / 127.0.0.1 / [::1] 生效；雲端網址外部訪客觸發無效
// 對外接口：parseBotCfg(), createBotInput(game), installBotHooks(game, cfg)

// === Bot 策略參數 ===
// 半徑 5.5 默認；水晶低血退到 3.8（AoE 重整 2026-05-21：Tether Snap 已刪除）
const DEFEND_RADIUS_BASE = 5.5;
const DEFEND_RADIUS_LOW_HP = 3.8;
const LOW_HP_THRESHOLD = 0.30;
const DASH_DANGER_RADIUS = 2.0;
const DASH_PROC_INTERVAL = 1.0;         // 更積極使用 dash
const THREAT_SCAN_RADIUS = 14;          // 評估「怪潮中心」用
const DASH_OFFENSIVE_MIN_TARGETS = 3;   // dash 路徑上至少幾隻怪才衝
const DASH_OFFENSIVE_RADIUS = 2.5;      // dash 視為「擊中」的擴散半徑

// === Perk 優先序 — 數字越大越優先（生存優先；避開對 bot 行為有副作用的 perk）===
// AoE 重整 2026-05-21：echo_pulse / tether_snap 已刪除；新增 pierce / fang_lunge
const PERK_PRIORITY = {
  aegis_charge:        100,  // 堆盾 / 6 靈魂回盾，生存核心
  crystallize:          95,  // +250 HP + 回滿，生存核心
  bloom:                85,  // 範圍 +15%/層，清屏（已加上限 3 層）
  swift_step:           80,  // 速度 + dash CD
  pierce:               70,  // 單體傷害 +60%，間隔 +0.4s
  crit_frenzy:          65,  // 暴擊堆疊（已加上限 3 層）
  fang_lunge:           55,  // Dash 標記 → 下一脈衝 ×3
  kinetic_reversal:     50,  // dash 後擊退 + debuff
  regicide:             45,  // 對 boss 強，前期沒用
  critical_suspension:  35,
  soul_vacuum:          25,
  soul_debt:             5,  // 軌道機制 bot 不會用
  mass_collapse:         1,  // 移速 -20% 直接拖累 bot 移動
};

// localhost / 本機 IP 才允許 bot 模式 — 部署到雲端後外部訪客碰不到
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]', '0.0.0.0', '']);

export function parseBotCfg(search) {
  const p = new URLSearchParams(search);
  if (p.get('bot') !== '1') return null;
  // 防線：非本機 host 直接無視 ?bot=1，避免雲端網址被外部觸發
  if (typeof location !== 'undefined' && !LOCAL_HOSTNAMES.has(location.hostname)) {
    console.warn('[bot] ?bot=1 ignored — only allowed on localhost');
    return null;
  }
  const speed = Math.max(1, Math.min(4, parseInt(p.get('speed') || '1', 10)));
  const headless = p.get('headless') === '1';
  const seed = p.get('seed') ? parseInt(p.get('seed'), 10) : null;
  // easy: 保留 first-run 保護（高 HP、慢 spawn、無 slinger/splitter）但仍強制 boss spawn
  const easy = p.get('easy') === '1';
  // bonusPerks: 開局自動套用 N 個防守型 perk（模擬玩家已升一段時間）
  const bonusPerks = Math.max(0, Math.min(15, parseInt(p.get('bonusPerks') || '0', 10)));
  return { speed, headless, seed, easy, bonusPerks };
}

/**
 * BotInput 偽裝成 Input 物件，僅實作 hero / dash 會用到的兩個 method
 * 真正 AI 邏輯放在 think()，每幀由 game._tickInner 開頭呼叫
 */
export class BotInput {
  constructor(realInput) {
    this.real = realInput;          // 鍵盤事件仍綁定（R/M 等）
    this._moveX = 0;
    this._moveZ = 0;
    this._dashPressed = false;
    this.keys = realInput.keys;     // 沿用真實 key set 給 audioStarted 偵測
    this.justPressed = realInput.justPressed;
  }

  beginFrame() {
    this.real.beginFrame();
    this.justPressed = this.real.justPressed;
  }

  isDown(code) { return this.real.isDown(code); }

  wasPressed(code) {
    if (code === 'Space' && this._dashPressed) {
      this._dashPressed = false;
      return true;
    }
    return this.real.wasPressed(code);
  }

  getMoveVec(out) {
    out.x = this._moveX;
    out.z = this._moveZ;
    return out;
  }

  setMove(x, z) {
    const len = Math.hypot(x, z);
    if (len > 0) { this._moveX = x / len; this._moveZ = z / len; }
    else { this._moveX = 0; this._moveZ = 0; }
  }

  triggerDash() { this._dashPressed = true; }
}

/**
 * 每幀的 AI 決策 — 直接讀 game 狀態
 */
export function botThink(game, dt) {
  const bot = game._botInput;
  if (!bot) return;

  // 節流：每 3 個 sub-tick 才重算策略；其餘 tick 沿用上次 setMove
  // bot 反應 ~50ms 已經比人類快很多，少跑 2/3 的 O(N) 掃描換來大幅加速
  game._botThinkSkip = (game._botThinkSkip || 0) + 1;
  if (game._botThinkSkip < 3) return;
  game._botThinkSkip = 0;
  const adt = dt * 3;  // 補回累計時間給 dash timer

  const hx = game.hero.position.x, hz = game.hero.position.z;
  const cx = game.crystal.position.x, cz = game.crystal.position.z;

  // === 步驟 1：掃描怪 — 收集 (a)最近威脅 (b)怪潮質心 (c)dash 路徑可擊中數 ===
  let nearestThreat = null;
  let nearestThreatDist = Infinity;
  let nearestToCrystalDist = Infinity;
  let nearestToCrystalX = 0, nearestToCrystalZ = 0;
  let threatSumX = 0, threatSumZ = 0, threatN = 0;
  let bossX = null, bossZ = null;

  // Dash 路徑掃描：算當前 facing 方向上多少敵人會被打到
  const facing = game.hero.facing;
  const dashDirX = Math.sin(facing + Math.PI);
  const dashDirZ = Math.cos(facing + Math.PI);
  const dashLen = 6.5; // CONFIG.heroDashDistance
  let dashHitCount = 0;

  const swarms = game._allSwarmsArr;
  for (let s = 0; s < swarms.length; s++) {
    const sw = swarms[s];
    if (!sw || !sw.pos || !sw.alive) continue;
    const isBoss = !!sw.isBoss;
    const n = sw.maxCount;
    for (let i = 0; i < n; i++) {
      if (!sw.alive[i]) continue;
      const ex = sw.pos[i*3+0], ez = sw.pos[i*3+2];
      const dx = ex - hx, dz = ez - hz;
      const dHero = Math.hypot(dx, dz);
      if (dHero < nearestThreatDist) {
        nearestThreatDist = dHero;
        nearestThreat = { x: ex, z: ez };
      }
      const dCryX = ex - cx, dCryZ = ez - cz;
      const dCry = Math.hypot(dCryX, dCryZ);
      if (dCry < nearestToCrystalDist) {
        nearestToCrystalDist = dCry;
        nearestToCrystalX = ex; nearestToCrystalZ = ez;
      }
      if (isBoss) { bossX = ex; bossZ = ez; }
      else if (dCry < THREAT_SCAN_RADIUS) {
        threatSumX += dCryX; threatSumZ += dCryZ; threatN++;
      }

      // Dash 路徑投影距離 — 在 0..dashLen 之間且側距 < DASH_OFFENSIVE_RADIUS
      if (dHero < dashLen + DASH_OFFENSIVE_RADIUS) {
        const proj = dx * dashDirX + dz * dashDirZ;
        if (proj > 0 && proj < dashLen) {
          const sideX = dx - proj * dashDirX;
          const sideZ = dz - proj * dashDirZ;
          const side2 = sideX * sideX + sideZ * sideZ;
          if (side2 < DASH_OFFENSIVE_RADIUS * DASH_OFFENSIVE_RADIUS) dashHitCount++;
        }
      }
    }
  }

  // === 步驟 2：dash 決策（防守 + 攻擊雙觸發）===
  game._botDashTimer = (game._botDashTimer || 0) - adt;
  if (game.hero.dashCooldown <= 0 && game.hero.dashTimer <= 0) {
    let wantDash = false;
    // 緊急防守：怪很近
    if (nearestThreat && nearestThreatDist < DASH_DANGER_RADIUS) wantDash = true;
    // 攻擊性 dash：路徑上有 3+ 隻怪
    if (dashHitCount >= DASH_OFFENSIVE_MIN_TARGETS) wantDash = true;
    // 怪潮密集 → 主動 dash 觸發 Kinetic Reversal AoE
    if (game._botDashTimer <= 0 && threatN >= 3) wantDash = true;
    if (wantDash) {
      bot.triggerDash();
      game._botDashTimer = DASH_PROC_INTERVAL;
    }
  }

  // === 步驟 3：選擇朝向角度 ===
  let dirX, dirZ;
  if (bossX != null) {
    dirX = bossX - cx; dirZ = bossZ - cz;
  } else if (threatN >= 2) {
    dirX = threatSumX / threatN; dirZ = threatSumZ / threatN;
  } else if (nearestToCrystalDist < Infinity) {
    dirX = nearestToCrystalX - cx; dirZ = nearestToCrystalZ - cz;
  } else {
    game._botAngle = (game._botAngle || 0) + adt * 0.4;
    dirX = Math.cos(game._botAngle); dirZ = Math.sin(game._botAngle);
  }
  const dlen = Math.max(0.001, Math.hypot(dirX, dirZ));
  dirX /= dlen; dirZ /= dlen;

  // === 步驟 4：自適應半徑 ===
  const hpFrac = game.crystal.hp / Math.max(1, game.crystal.maxHp);
  let targetR;
  if (hpFrac < LOW_HP_THRESHOLD) {
    targetR = DEFEND_RADIUS_LOW_HP;
  } else {
    targetR = DEFEND_RADIUS_BASE;
  }
  const desiredX = cx + dirX * targetR;
  const desiredZ = cz + dirZ * targetR;

  let mvx = desiredX - hx;
  let mvz = desiredZ - hz;

  if (nearestThreat && nearestThreatDist < DASH_DANGER_RADIUS * 1.4) {
    const ax = hx - nearestThreat.x;
    const az = hz - nearestThreat.z;
    const al = Math.max(0.001, Math.hypot(ax, az));
    mvx += (ax / al) * 3;
    mvz += (az / al) * 3;
  }

  bot.setMove(mvx, mvz);
}

/**
 * 把 game.perkUI.show 改寫成自動選擇（傾向 legendary > rare > common）
 * 把 main loop 改寫成 botSpeed × steps
 * 設定 telemetry 寫到 window.__bot
 */
export function installBotHooks(game, cfg) {
  // === Bot 模式下完全跳過渲染：headless 軟體 GL 是最大效能殺手 ===
  // 模擬只關心邏輯，不需要 WebGL render
  if (cfg.headless) {
    game.renderer.render = () => {};
  }

  // === 自動選 perk — 用 PERK_PRIORITY 而非 rarity 排序 ===
  game.perkUI.show = (level, choices, onPick) => {
    if (!choices || choices.length === 0) { onPick(null); return; }
    const score = (p) => PERK_PRIORITY[p.id] ?? 0;
    const sorted = [...choices].sort((a, b) => score(b) - score(a));
    setTimeout(() => onPick(sorted[0]), 0);
  };

  // === Telemetry ===
  game._botTelemetry = {
    botMode: true,
    speed: cfg.speed,
    startedAt: Date.now(),
    finishedAt: null,
    cause: null,
    time: 0,
    kills: 0,
    level: 1,
    crystalHp: 0,
    crystalMaxHp: 0,
    perks: [],
    bossEvents: [],   // { name, event: 'spawn'|'kill', t }
    samples: [],      // 每秒一筆 { t, kills, level, hp, enemies }
    gameOver: false,
  };
  window.__bot = game._botTelemetry;

  let lastSample = 0;
  const prevBossAlive = { ohm: false, nexus: false, chronos: false, mu: false };

  game._botUpdateTelemetry = () => {
    const tel = game._botTelemetry;
    tel.time = game.elapsed;
    tel.kills = game.kills;
    tel.level = game.level;
    tel.crystalHp = game.crystal.hp;
    tel.crystalMaxHp = game.crystal.maxHp;
    tel.perks = [...game.perks.taken];
    tel.gameOver = game.gameOver;

    // Boss 進出事件
    const bosses = [
      { key: 'ohm', name: 'Ohm', alive: !!game.boss.alive[0] },
      { key: 'nexus', name: 'Nexus', alive: !!game.nexus.alive[0] },
      { key: 'chronos', name: 'Chronos', alive: !!game.chronos.alive[0] },
      { key: 'mu', name: 'Mu', alive: !!game.mu.alive[0] },
    ];
    for (const b of bosses) {
      if (b.alive && !prevBossAlive[b.key]) {
        tel.bossEvents.push({ name: b.name, event: 'spawn', t: game.elapsed });
      } else if (!b.alive && prevBossAlive[b.key]) {
        tel.bossEvents.push({ name: b.name, event: 'kill', t: game.elapsed });
      }
      prevBossAlive[b.key] = b.alive;
    }

    // 每秒一筆 sample
    if (game.elapsed - lastSample >= 1.0) {
      lastSample = game.elapsed;
      const totalEnemies = game.swarm.activeCount
        + game.slingers.activeCount
        + game.splitters.activeCount
        + game.mites.activeCount
        + game.sentinels.activeCount
        + game.wraiths.activeCount
        + game.lancers.activeCount
        + game.conduits.activeCount
        + game.mires.activeCount;
      tel.samples.push({
        t: +game.elapsed.toFixed(1),
        kills: game.kills,
        level: game.level,
        hp: +game.crystal.hp.toFixed(0),
        enemies: totalEnemies,
      });
    }

    if (game.gameOver && tel.finishedAt == null) {
      tel.finishedAt = Date.now();
      tel.cause = 'crystal_dead';
    }
  };
}

/**
 * 把 game._tick 包成 N 步模式：每個 RAF 跑 botSpeed 次 _tickInner
 * 每次給 _tickInner 一個合成的 now，使 dt 穩定為 ~16.67ms
 */
export function wrapTickForBot(game, cfg) {
  const stepMs = 1000 / 60;
  game._botSimTime = performance.now();
  const origTick = game._tick;

  game._tick = function(realNow) {
    requestAnimationFrame(game._tick);
    if (game.gameOver) {
      // 結束後仍跑一次給 renderer 更新，但 telemetry 已固化
      try { game._tickInner(realNow); } catch (e) {}
      return;
    }
    for (let i = 0; i < cfg.speed; i++) {
      // 合成 lastTime 使 dt 穩定為 stepMs
      game.lastTime = game._botSimTime;
      game._botSimTime += stepMs;
      try {
        game._tickInner(game._botSimTime);
        if (game._botUpdateTelemetry) game._botUpdateTelemetry();
      } catch (err) {
        console.error('[bot tick]', err);
      }
      if (game.gameOver) break;  // 不要再多跑 sub-step
    }
  };
}
