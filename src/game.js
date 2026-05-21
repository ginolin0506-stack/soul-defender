import * as THREE from 'three';
import { CONFIG } from './config.js';
import { buildScene } from './scene.js';
import { Input } from './input.js';
import { SpatialHash } from './spatialHash.js';
import { Hero } from './hero.js';
import { Crystal } from './crystal.js';
import { Swarm } from './enemies.js';
import { Slingers, BulletPool } from './slinger.js';
import { Splitters, Mites } from './splitter.js';
import { Boss } from './boss.js';
import { Nexus } from './nexus.js';
import { Chronos } from './chronos.js';
import { Mu } from './mu.js';
import { glitchUniform, timeUniform } from './glitch.js';
import { Tether } from './tether.js';
import { Effects } from './effects.js';
import { AudioMgr } from './audio.js';
import { PERKS, FORBIDDEN_PERKS, rollPerkChoices, getXpForLevel } from './perks.js';
import { PerkUI } from './perkUI.js';
import { Meta, META_NODES, getSlotSummary, SLOT_COUNT } from './meta.js';
import { Tutorial } from './tutorial.js';
import { BotInput, botThink, installBotHooks, wrapTickForBot } from './bot.js';

export class Game {
  constructor(renderer, loadSlotN = null, options = {}) {
    this.renderer = renderer;
    this._loadSlotN = loadSlotN;
    this._botCfg = options.bot || null;
    // Debug 召喚鍵僅在 localhost 啟用，避免雲端玩家用 B/V/C/J/N 破壞遊戲體驗
    const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '0.0.0.0', '']);
    this._debugAllowed = typeof location === 'undefined' || LOCAL_HOSTS.has(location.hostname);

    const built = buildScene();
    this.scene = built.scene;
    this.camera = built.camera;

    this.perks = {
      taken: [],
      tetherSnap: false,
      loneWolf: false,
      echoPulse: false,
      soulSkipHero: false,
      heroSpeedMult: 1.0,
      dashCooldownMult: 1.0,
      pulseRadiusMult: 1.0,
      critChanceBonus: 0,
      critMultBonus: 0,
      soulSpeedMult: 1.0,
      aegisStacks: 0,
      soulSinceShield: 0,
      shieldHp: 0,
      heroDmgGlobal: 1.0,        // W6: Glass Prism 倍率
      volatileLoop: false,       // W6: Volatile Loop flag
    };

    const realInput = new Input();
    if (this._botCfg) {
      this._botInput = new BotInput(realInput);
      this.input = this._botInput;
    } else {
      this.input = realInput;
    }
    this.audio = new AudioMgr();
    this.meta = new Meta();
    // 若 boot menu 指定 slot，先 load 進來，之後的 starting bonuses 用 slot 內容
    if (this._loadSlotN) this.meta.loadFromSlot(this._loadSlotN);
    // Bot 模式：強制非第一局以解鎖 slinger/splitter/boss
    // 若 ?easy=1 則保留第一局保護（+HP / 慢 spawn）但仍強制 boss 出生
    if (this._botCfg && !this._botCfg.easy) this.meta.runs = 1;
    this.isFirstRun = (this.meta.runs === 0);
    // bot easy 模式專用 flag：仍視為 firstRun 但 boss 允許 spawn
    this._botForceBoss = !!(this._botCfg && this._botCfg.easy);
    this.tutorial = new Tutorial(this.isFirstRun);

    this.hero = new Hero(this.scene, this.perks);
    this.crystal = new Crystal(this.scene);
    // W5: 用 endless 池大小（2500），允許後期 2000+ instance 壓測
    this.swarm = new Swarm(this.scene, CONFIG.endlessMaxEnemies);
    this.swarm.xpReward = CONFIG.leechXp;
    this.slingers = new Slingers(this.scene, CONFIG.maxSlingers);
    this.bullets = new BulletPool(this.scene, CONFIG.maxBullets);
    this.splitters = new Splitters(this.scene, CONFIG.maxSplitters);
    this.mites = new Mites(this.scene, CONFIG.maxMites);
    this.boss = new Boss(this.scene);
    this.nexus = new Nexus(this.scene);
    this.chronos = new Chronos(this.scene);     // W6
    this.mu = new Mu(this.scene);                // W7
    this.tether = new Tether(this.scene, this.hero, this.crystal);
    this.effects = new Effects(this.renderer, this.scene, this.camera);
    this.hash = new SpatialHash(CONFIG.hashCell);
    this.perkUI = new PerkUI();

    // Meta starting bonuses
    this.meta.applyStartingBonuses(this.perks, this.crystal);
    if (this.meta.hasUnlock('starting_perk')) {
      const commons = Object.values(PERKS).filter(p => p.rarity === 'common');
      const pick = commons[Math.floor(Math.random() * commons.length)];
      pick.apply(this);
      this.perks.taken.push(pick.id);
      this.perkUI.renderActiveList(this.perks.taken, PERKS);
    }

    // W6: 啟用禁忌代碼（applyStart 在 crystal 建好之後執行）
    for (const id of this.meta.forbiddenActive) {
      const fp = FORBIDDEN_PERKS[id];
      if (fp && fp.applyStart) fp.applyStart(this, CONFIG);
    }

    // 回鍋玩家補貼（非第一局）：開局自動套用 1 個防守型 perk
    // 平衡測試 2026-05-21：非第一局裸跑 90% 死於 26-50s（中位 32.6s），
    // 第一個 perk 還沒升到就被秒。送 1 個 perk 避免「回鍋就死」挫敗感
    if (!this.isFirstRun && !this._botCfg) {
      const defensives = ['aegis_charge', 'crystallize', 'bloom', 'swift_step'];
      const pick = defensives[Math.floor(Math.random() * defensives.length)];
      const p = PERKS[pick];
      if (p) {
        p.apply(this);
        this.perks.taken.push(pick);
        this.perkUI.renderActiveList(this.perks.taken, PERKS);
      }
    }

    // Bot 模式：bonusPerks=N → 自動套 N 個防守型 perk（模擬已升等玩家）
    if (this._botCfg && this._botCfg.bonusPerks > 0) {
      const order = ['aegis_charge', 'crystallize', 'bloom', 'swift_step', 'crystallize',
                     'aegis_charge', 'crystallize', 'bloom', 'crit_frenzy', 'aegis_charge',
                     'crystallize', 'swift_step', 'echo_pulse', 'aegis_charge', 'crystallize'];
      for (let i = 0; i < this._botCfg.bonusPerks && i < order.length; i++) {
        const p = PERKS[order[i]];
        if (!p) continue;
        if (!p.stackable && this.perks.taken.includes(order[i])) continue;
        p.apply(this);
        this.perks.taken.push(order[i]);
      }
      this.perkUI.renderActiveList(this.perks.taken, PERKS);
    }

    // 第一局保護
    if (this.isFirstRun) {
      this.crystal.maxHp += CONFIG.firstRunCrystalBonus;
      this.crystal.hp = this.crystal.maxHp;
      this.usedFirstRunSave = false;
    } else {
      this.usedFirstRunSave = true;
    }

    this.xp = 0;
    this.level = 1;
    this.xpToNext = getXpForLevel(this.level);

    this.elapsed = 0;
    this.kills = 0;
    this.gameOver = false;
    this.paused = false;
    this.audioStarted = false;

    this.spawnTimer = 0;
    this.slingerSpawnTimer = 0;
    this.splitterSpawnTimer = 0;
    this.bossSpawned = false;
    this.bossWarningShown = false;
    this._bossWarningStartElapsed = 0;       // Level-Gated 倒數起點
    this._nexusWarningStartElapsed = 0;
    this._chronosWarningStartElapsed = 0;
    this._muWarningStartElapsed = 0;
    this._echoQueue = [];
    this._pendingLevelUps = 0;       // B1: 多重升級佇列
    this._splitterTutorialFired = false;  // B4: splitter 教學觸發旗

    this.lastTime = performance.now();
    this.fpsFrames = 0;
    this.fpsLast = this.lastTime;

    this.ui = {
      hpBar: document.getElementById('crystal-hp'),
      shieldBar: document.getElementById('crystal-shield'),
      hpText: document.getElementById('hp-text'),
      tether: document.getElementById('tether-mult'),
      kills: document.getElementById('kills'),
      time: document.getElementById('time'),
      fps: document.getElementById('fps'),
      enemyCount: document.getElementById('enemy-count'),
      soulCount: document.getElementById('soul-count'),
      bulletCount: document.getElementById('bullet-count'),
      gameover: document.getElementById('gameover'),
      finalKills: document.getElementById('final-kills'),
      finalTime: document.getElementById('final-time'),
      finalLevel: document.getElementById('final-level'),
      runSouls: document.getElementById('run-souls'),
      totalSouls: document.getElementById('total-souls'),
      runCount: document.getElementById('run-count'),
      techGrid: document.getElementById('tech-tree-grid'),
      xpBar: document.getElementById('xp-bar'),
      level: document.getElementById('level'),
      bossHpWrap: document.getElementById('boss-hp-wrap'),
      bossHpBar: document.getElementById('boss-hp'),
      bossName: document.getElementById('boss-name'),    // B18: hoist
      entropy: document.getElementById('entropy'),       // W5
      entropyWrap: document.getElementById('entropy-wrap'),  // W5
    };

    this._camOffset = new THREE.Vector3(0, 26, 18);
    this._camTarget = new THREE.Vector3();
    this._camLook = new THREE.Vector3();

    // B11 + W4 + W6: 預先 hoist 成員陣列
    this._allSwarmsArr = [this.swarm, this.slingers, this.splitters, this.mites, this.boss, this.nexus, this.chronos, this.mu];
    this._allHashesArr = [this.hash, this.slingers.hash, this.splitters.hash, this.mites.hash, this.boss.hash, this.nexus.hash, this.chronos.hash, this.mu.hash];

    // W4: Nexus 召喚旗
    this.nexusSpawned = false;
    this.nexusWarningShown = false;

    // W5: Endless / 子彈時間 / 動能逆轉
    this.endlessMode = false;
    this.entropy = 0;
    this.bulletTimeRemaining = 0;
    this._bossLastDeadAt = -999;
    this._nexusLastDeadAt = -999;
    this._chronosLastDeadAt = -999;
    this._bossAlivePrev = false;
    this._nexusAlivePrev = false;

    // W6: Chronos 時間調制
    this.chronosSpawned = false;
    this.chronosWarningShown = false;
    this.chronosTimeMult = 1.0;
    this.tetherSnapCalmTimer = 0;
    this._volatileLoopTimer = CONFIG.volatileSelfSeverInterval;
    this._lastEnemyCount = 0;

    // W7: Mu 狀態 + perks snapshot
    this.muSpawned = false;
    this.muWarningShown = false;
    this._muLastDeadAt = -999;
    this._perksBackup = null;

    this._tick = this._tick.bind(this);

    // 教學第一步
    if (this.isFirstRun) {
      setTimeout(() => this.tutorial.trigger('start'), 800);
    }

    // === Bot 模式 hooks（必須在 _tick bind 之後）===
    if (this._botCfg) {
      installBotHooks(this, this._botCfg);
      wrapTickForBot(this, this._botCfg);
    }
  }

  _allSwarms() { return this._allSwarmsArr; }
  _allHashes() { return this._allHashesArr; }

  start() {
    requestAnimationFrame(this._tick);
  }

  _tick(now) {
    requestAnimationFrame(this._tick);
    try {
      this._tickInner(now);
    } catch (err) {
      // R1: 防 freeze — 任一行 throw 都不該卡住整個 RAF 循環
      console.error('[Soul Defender] frame error:', err);
      try { this.renderer.render(this.scene, this.camera); } catch (e2) {}
    }
  }

  _tickInner(now) {
    const rawDtSec = Math.min((now - this.lastTime) / 1000, 1 / 30);
    this.lastTime = now;
    this.input.beginFrame();

    // Bot 模式：先讓 AI 決定本幀的移動 / dash 訊號
    if (this._botInput) botThink(this, rawDtSec);

    if (!this.audioStarted && this.input.justPressed.size > 0) {
      this.audio.ensureInit();
      this.audio.resume();
      this.audioStarted = true;
    }

    this.fpsFrames++;
    if (now - this.fpsLast > 500) {
      const fps = (this.fpsFrames * 1000) / (now - this.fpsLast);
      this.ui.fps.textContent = fps.toFixed(0);
      this.fpsLast = now;
      this.fpsFrames = 0;
    }

    if (this.input.wasPressed('KeyR')) { location.reload(); return; }
    if (this.input.wasPressed('KeyM')) this.audio.setMute(!this.audio.muted);

    if (this.gameOver || this.paused) {
      this.renderer.render(this.scene, this.camera);
      return;
    }

    this.elapsed += rawDtSec;

    // 開局攻擊範圍 ease-in bonus（前 N 秒 +X% 半徑，線性降回 1.0）
    const earlyT = Math.min(1, this.elapsed / CONFIG.heroPulseEarlyRadiusDuration);
    this.perks._earlyRadiusBonus = 1 + CONFIG.heroPulseEarlyRadiusBoost * (1 - earlyT);

    const timeScale = this.effects.hitStopActive ? 0.08 : 1.0;
    const dt = rawDtSec * timeScale;

    // W5: 子彈時間倒數（rawDt-based 不受 hit-stop 影響）
    if (this.bulletTimeRemaining > 0) this.bulletTimeRemaining -= rawDtSec;
    const bulletTimeScale = (this.bulletTimeRemaining > 0) ? CONFIG.criticalSuspensionEnemyScale : 1.0;

    // W6: Chronos 時間調制 — Chronos 活著時 enemyDt ×2，hero dash / snap calm 時 0.5×
    let chronosTarget = 1.0;
    if (this.chronos.alive[0]) {
      chronosTarget = CONFIG.chronosAccelMult;
      if (this.hero.dashTimer > 0 || this.tetherSnapCalmTimer > 0) {
        chronosTarget = CONFIG.chronosCalmMult;
      }
    }
    this.chronosTimeMult += (chronosTarget - this.chronosTimeMult) * CONFIG.chronosSpeedLerp;
    if (this.tetherSnapCalmTimer > 0) this.tetherSnapCalmTimer -= rawDtSec;
    // W7+ Temporal Hourglass：受傷倍率隨時間流速反向掛鉤
    // chronosTimeMult ∈ [0.5, 2.0] → t ∈ [1.0, 0.0]，再 lerp(min, max, t)
    // 結果：accel 全速時 0.15（85% 免傷），calm bullet-time 時 1.0（解禁）
    {
      const cMin = CONFIG.chronosCalmMult, cMax = CONFIG.chronosAccelMult;
      const t = Math.max(0, Math.min(1, (cMax - this.chronosTimeMult) / (cMax - cMin)));
      this.chronos.damageTakenMult =
        CONFIG.chronosDmgReductionMin + (CONFIG.chronosDmgReductionMax - CONFIG.chronosDmgReductionMin) * t;
    }

    // 最終敵人時間 = hero dt × bullet time × chronos
    const enemyDt = dt * bulletTimeScale * this.chronosTimeMult;

    // W5: Endless 模式 entropy 增加
    if (this.endlessMode) {
      this.entropy += rawDtSec * CONFIG.endlessEntropyRate;
    }

    // === Hero ===
    this.hero.update(dt, this.input);
    if (this.hero.dashJustTriggered) this.audio.playDash();

    // === W4 + W6: bossActive 給 Regicide / Chronos 等用
    this.perks.bossActive = this.boss.alive[0] === 1 || this.nexus.alive[0] === 1 || this.chronos.alive[0] === 1 || this.mu.alive[0] === 1;

    // W7: 計算 tether 是否穿過 Mu（供 Mu.damage 用）
    if (this.mu.alive[0]) {
      this.mu.tetherCrossing = Mu.segmentIntersectsCircle(
        this.hero.position.x, this.hero.position.z,
        this.crystal.position.x, this.crystal.position.z,
        this.mu.pos[0], this.mu.pos[2],
        CONFIG.muTetherCrossRadius
      );
    }

    // === Tether sever (Boss 切繫帶 + W6 Volatile Loop 自斷) ===
    let severed = this.boss.isOnTether(this.hero, this.crystal);
    // W6 Volatile Loop: 每 10s 自發失控
    if (this.perks.volatileLoop) {
      this._volatileLoopTimer -= rawDtSec;
      if (this._volatileLoopTimer <= 0) {
        this._volatileLoopTimer = CONFIG.volatileSelfSeverInterval;
        this.tether.selfSeveredRemaining = CONFIG.volatileSelfSeverDuration;
      }
      if (this.tether.selfSeveredRemaining > 0) {
        this.tether.selfSeveredRemaining -= rawDtSec;
        severed = true;
      }
    }
    this.tether.severed = severed;
    if (severed) this.effects.addChroma(0.003);

    this.tether.update(dt);

    // === Hashes ===
    this.swarm.fillHash(this.hash);

    // === Spawn ===
    this._spawnLogic(rawDtSec);

    // === Enemy update ===
    // W5: enemyDt 給敵人類使用（子彈時間下降速）
    this.swarm.update(enemyDt, this.crystal.position.x, this.crystal.position.z, this.hash);
    this.slingers.update(enemyDt, this.crystal.position.x, this.crystal.position.z, this.bullets, this.audio);
    this.splitters.update(enemyDt, this.crystal.position.x, this.crystal.position.z);
    this.mites.update(enemyDt, this.hero.position.x, this.hero.position.z);
    if (this.perks.massCollapse && this.hero.gravityWellActive) {
      this._applyGravityWell();
    }
    const bossCrystalShockHit = this.boss.update(enemyDt, this.hero, this.crystal);
    this.boss.fillHash();
    this.nexus.update(enemyDt, this.hero, this.crystal);
    this.nexus.fillHash();
    // W6 Chronos
    this.chronos.update(enemyDt, this.hero, this.crystal);
    this.chronos.fillHash();
    // W7 Mu
    this.mu.update(enemyDt, this.hero, this.crystal);
    this.mu.fillHash();

    // === Mites 撞英雄 → 推回水晶（B2: dash 中無敵） ===
    const miteHits = this.mites.collectHeroHits(
      this.hero.position.x,
      this.hero.position.z,
      0.85
    );
    if (miteHits.length > 0) {
      if (this.hero.invulnerable) {
        // B2 fix: dash 中清掉 mites 但不被推
        for (const i of miteHits) this.mites.consumeAt(i);
        this.effects.addTrauma(0.04);
      } else {
        // 推英雄朝水晶
        const dx = this.crystal.position.x - this.hero.position.x;
        const dz = this.crystal.position.z - this.hero.position.z;
        const d = Math.max(0.001, Math.hypot(dx, dz));
        const force = CONFIG.mitesPushForce * miteHits.length;
        this.hero.position.x += (dx / d) * force;
        this.hero.position.z += (dz / d) * force;
        // B6 fix: 推完立刻 clamp 邊界
        const half = CONFIG.groundSize / 2 - 2;
        this.hero.position.x = Math.max(-half, Math.min(half, this.hero.position.x));
        this.hero.position.z = Math.max(-half, Math.min(half, this.hero.position.z));
        this.effects.addTrauma(0.06 + miteHits.length * 0.02);
        this.effects.addChroma(0.01);
        this.audio.playTake();
        for (const i of miteHits) this.mites.consumeAt(i);
        this.tutorial.trigger('splitter');
      }
    }

    // === 英雄脈衝（所有 swarm + W4 perks 參數）===
    const swarms = this._allSwarms();
    const hashes = this._allHashes();
    const pulseHits = this.hero.autoAttack(
      swarms, hashes,
      this.tether.heroDmgMult,
      this.tether.distance,            // 給 Spatial Folding
      this.tether.orbitalCount          // 給 Soul Debt
    );
    if (pulseHits.length > 0) {
      this.audio.playHit(1.0);
      this.effects.addTrauma(0.04 + Math.min(pulseHits.length, 8) * 0.01);
      for (const h of pulseHits) {
        // B24: Mu shell 反彈時不顯示誤導性的傷害數字
        if (!(h.swarm === this.mu && h.swarm.lastHitRejected)) {
          this.effects.spawnDamageNumber(h.x, 0.8, h.z, h.dmg, h.crit);
        }
        if (h.killed) this._onKill(h.swarm, h.x, h.z);
      }
      if (this.perks.echoPulse) {
        this._echoQueue.push({
          x: this.hero.position.x,
          z: this.hero.position.z,
          expireAt: this.elapsed + CONFIG.echoPulseDelay,
          dmgMult: CONFIG.echoPulseDamageMult,
        });
      }
    }

    // === Dash hits ===
    const dashHits = this.hero.dashHits(swarms, hashes);
    if (dashHits.length > 0) {
      this._impact(0.06);  // W5: 包裝後同時觸發 bullet time（若 perk）
      this.effects.addTrauma(0.18 + Math.min(dashHits.length, 6) * 0.03);
      this.effects.addChroma(CONFIG.chromaticOnHit * 1.5);
      this.audio.playDashHit();
      for (const h of dashHits) {
        // B24: Mu shell 反彈時不顯示誤導性的傷害數字
        if (!(h.swarm === this.mu && h.swarm.lastHitRejected)) {
          this.effects.spawnDamageNumber(h.x, 0.9, h.z, h.dmg, true);
        }
        // W4 Regicide: Dash 穿越 Boss 偷血治療水晶
        if (this.perks.regicide && h.swarm.isBoss && !h.killed) {
          const stolen = h.swarm.maxHp * CONFIG.regicideLifestealPct;
          this.crystal.heal(stolen);
        }
        if (h.killed) this._onKill(h.swarm, h.x, h.z);
      }
    }
    this.hero.clearDashTags(this.swarm, this.slingers, this.splitters, this.mites, this.boss, this.nexus, this.chronos, this.mu);

    // === Tether Snap ===
    // Gemini 找的 bug: 用 natural mult，玩家主動斷線優先於 Boss 砍線懲罰
    if (this.hero.dashJustEnded && this.perks.tetherSnap && this.tether.heroDmgMultNatural >= 1.5) {
      this._triggerTetherSnap();
      // W6: tether snap 給 Chronos 制造 calm 緩衝
      if (this.chronos.alive[0]) this.tetherSnapCalmTimer = CONFIG.chronosCalmDuration;
    }
    // W5 Kinetic Reversal: Dash 結束製造反相環
    if (this.hero.dashJustEnded && this.perks.kineticReversal) {
      this._triggerKineticReversal();
    }

    // === Echo pulse ===
    this._processEchoes();

    // === Soul Debt micro pulse（半衰期過載釋放）===
    this._processSoulDebtMicroPulses();

    // === 怪撞水晶 ===
    const leechHits = this.swarm.collectCrystalHits(this.crystal.position.x, this.crystal.position.z, CONFIG.crystalHitRange);
    const splitterHits = this.splitters.collectCrystalHits(this.crystal.position.x, this.crystal.position.z, CONFIG.crystalHitRange + 0.5);
    if (leechHits.length > 0 || splitterHits.length > 0) {
      const damage = (leechHits.length * CONFIG.leechDamage + splitterHits.length * CONFIG.splitterDamage) * this.tether.crystalVulnMult;
      this._damageCrystal(damage);
      this.effects.addTrauma(0.08 + (leechHits.length + splitterHits.length) * 0.02);
      this.effects.addChroma(CONFIG.chromaticOnHit);
      this.audio.playCrystalHit();
      for (const i of leechHits) this.swarm.consumeAt(i);
      for (const i of splitterHits) {
        // Splitter 撞水晶死也算死，照樣分裂（更狠！）
        this.splitters.deathQueue.push({ x: this.splitters.pos[i*3+0], z: this.splitters.pos[i*3+2] });
        this.splitters.consumeAt(i);
      }
    }

    // === 子彈 → 水晶（W5: 子彈時間也讓子彈變慢） ===
    const bulletHits = this.bullets.update(enemyDt, this.crystal);
    if (bulletHits > 0) {
      const damage = bulletHits * CONFIG.bulletDamage * this.tether.crystalVulnMult;
      this._damageCrystal(damage);
      this.effects.addTrauma(0.06 + bulletHits * 0.02);
      this.audio.playCrystalHit();
    }

    // === Boss 衝擊波 → 水晶 ===
    if (bossCrystalShockHit) {
      this._damageCrystal(CONFIG.bossShockwaveDamage * this.tether.crystalVulnMult);
      this.effects.addTrauma(0.35);
      this.effects.addChroma(0.025);
      this.audio.playCrystalHit();
    }

    // === W7+ Ohm Overload Resonance：把儲存的傷害沿 tether 打到水晶 ===
    if (this.boss.overloadDischargeDmg > 0) {
      const dmg = this.boss.overloadDischargeDmg * this.tether.crystalVulnMult;
      this.boss.overloadDischargeDmg = 0;
      // bypass shield：閃電沿 tether 內部直擊水晶核心，aegis 盾無法吸收（設計意圖：強迫玩家暫停輸出）
      this._damageCrystal(dmg, CONFIG.bossOverloadBypassShield);
      this.effects.addTrauma(0.4);
      this.effects.addChroma(0.03);
      this.audio.playTetherSnap();
    }

    // === Splitter 死亡 → spawn mites（B3: 移到所有死亡來源之後、syncInstances 之前） ===
    const deathPositions = this.splitters.consumeDeathQueue();
    for (const p of deathPositions) {
      this.mites.spawnFrom(p.x, p.z, CONFIG.mitesPerSplitter);
    }

    // === Sync GPU ===
    this.swarm.syncInstances();
    this.slingers.syncInstances();
    this.splitters.syncInstances(now);
    this.mites.syncInstances(now);

    // === Souls + 護盾累積 ===
    const arrived = this.tether.updateSouls(dt, this.crystal, this.hero, this.perks);
    if (arrived > 0) {
      this.crystal.heal(arrived * CONFIG.crystalHealPerSoul);
      if (this.perks.aegisStacks > 0) {
        this.perks.soulSinceShield += arrived;
        const threshold = CONFIG.aegisSoulsPerShield;
        while (this.perks.soulSinceShield >= threshold) {
          this.perks.soulSinceShield -= threshold;
          this.perks.shieldHp += CONFIG.aegisShieldPerStack * this.perks.aegisStacks;
          this.audio.playShield();
        }
      }
    }

    this.crystal.update(dt, this.perks.shieldHp);
    this.effects.update(rawDtSec);
    this.tutorial.tick(rawDtSec);
    // W4 + W6: 環境音 + Kick 動態
    const totalEnemies = this.swarm.activeCount + this.slingers.activeCount
      + this.splitters.activeCount + this.mites.activeCount
      + (this.boss.alive[0] ? 1 : 0) + (this.nexus.alive[0] ? 1 : 0)
      + (this.chronos.alive[0] ? 1 : 0);
    this._lastEnemyCount = totalEnemies;
    if (this.audio.ambient) {
      this.audio.ambient.update(
        rawDtSec,
        this.tether.distance,
        CONFIG.tetherMaxRange,
        totalEnemies,
        this.boss.alive[0] === 1 || this.nexus.alive[0] === 1 || this.chronos.alive[0] === 1
      );
    }
    if (this.audio.kick) {
      this.audio.kick.update(rawDtSec, totalEnemies);
    }

    // W7: vertex glitch — endless 模式或 Mu 戰時 enable
    const glitchSrc = this.audio.kick ? this.audio.kick.glitch : 0;
    const baseFactor = (this.endlessMode || this.mu.alive[0]) ? 1.0 : 0;
    glitchUniform.value = glitchSrc * baseFactor * CONFIG.glitchMaxAmount;
    timeUniform.value = this.elapsed;

    // === 教學觸發點 ===
    if (this.isFirstRun) {
      if (this.tether.distance > 8) this.tutorial.trigger('tether');
    }

    // === 相機 ===
    this._camTarget.set(this.hero.position.x * 0.5, 0, this.hero.position.z * 0.5);
    this._camLook.copy(this._camTarget);
    this.camera.position.set(
      this._camTarget.x + this._camOffset.x,
      this._camOffset.y,
      this._camTarget.z + this._camOffset.z
    );
    this.camera.lookAt(this._camLook);
    this.effects.applyShake();

    // === Debug ===（只在本機 localhost 啟用；雲端部署後玩家無法召喚怪物/boss/強升）
    if (this._debugAllowed) {
      if (this.input.wasPressed('KeyB')) {
        this.swarm.spawnBurst(100, CONFIG.spawnRingRadiusMin, CONFIG.spawnRingRadiusMax);
      }
      if (this.input.wasPressed('KeyN')) this._gainXP(this.xpToNext);
      if (this.input.wasPressed('KeyV')) this.slingers.spawnBurst(3, CONFIG.spawnRingRadiusMin, CONFIG.spawnRingRadiusMax);
      if (this.input.wasPressed('KeyC')) this.splitters.spawnBurst(3, CONFIG.spawnRingRadiusMin, CONFIG.spawnRingRadiusMax);
      if (this.input.wasPressed('KeyJ') && !this.boss.alive[0]) {
        this.boss.spawn(this.crystal);
        this.bossSpawned = true;
        this.tutorial.showCustom('OHM 強制召喚 (debug)', 4);
      }
    }

    this._updateHUD();

    // === 死亡判定（含第一局庇護 — 原子操作，同幀完成所有狀態切換） ===
    if (this.crystal.hp <= 0 && this.perks.shieldHp <= 0 && !this.gameOver) {
      if (this.isFirstRun && !this.usedFirstRunSave) {
        // R1+R2 修正：原子化 + 視覺強化
        this.usedFirstRunSave = true;
        this.crystal.hp = 250;
        this.crystal.hitFlash = 2.0;       // 強閃白
        this.effects.triggerHitStop(0.18);  // 強行 hit-stop 給玩家視覺凝固感
        this.effects.addTrauma(0.9);        // 0.5 → 0.9
        this.effects.addChroma(0.06);       // 0.03 → 0.06
        this.tutorial.trigger('save');
        this.audio.playLevelUp();
        this.audio.playTetherSnap();        // 額外的「震波」音效
        this._triggerShieldNova();          // 推開 25u 內所有怪 + 清場
      } else {
        this._endGame();
      }
    }

    this.renderer.render(this.scene, this.camera);
    this.effects.restoreShake();
  }

  _onKill(swarm, x, z) {
    this.kills++;
    this.tether.spawnSoul(x, z);
    this._gainXP(swarm.xpReward || CONFIG.leechXp);
    this.audio.playKill();
    this.tutorial.trigger('kill');
    if (swarm.isBoss) {
      const souls = swarm === this.nexus ? CONFIG.nexusKillSouls : CONFIG.bossKillSouls;
      this._impact(swarm === this.nexus ? 0.25 : 0.18);   // W5: bullet time hook
      this.effects.addTrauma(swarm === this.nexus ? 1.0 : 0.8);
      this.effects.addChroma(swarm === this.nexus ? 0.05 : 0.04);
      for (let s = 0; s < souls; s++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * 3;
        this.tether.spawnSoul(x + Math.cos(a) * r, z + Math.sin(a) * r);
      }
      this.audio.playTetherSnap();

      // W5: 標記 boss 死亡時間
      if (swarm === this.boss) this._bossLastDeadAt = this.elapsed;
      if (swarm === this.nexus) {
        this._nexusLastDeadAt = this.elapsed;
        // 第一次擊殺 Nexus → 進入無盡熵增
        if (!this.endlessMode) {
          this.endlessMode = true;
          this.effects.endlessMode = true;
          this.tutorial.showCustom('★ ENTROPY 釋放 ── 進入無盡熵增模式 ★', 14);
          this.audio.playLevelUp();
          if (this.audio.ambient) this.audio.ambient.bossDrop();
        }
      }
      if (swarm === this.chronos) this._chronosLastDeadAt = this.elapsed;
      if (swarm === this.mu) {
        this._muLastDeadAt = this.elapsed;
        this._muRestorePerks();   // W7: 恢復 perks
        this.tutorial.showCustom('★ MU 已被解構 ── PERKS 重新通電 ★', 12);
      }
    }
  }

  _spawnLogic(rawDt) {
    // Leech
    this.spawnTimer -= rawDt;
    if (this.spawnTimer <= 0) {
      // Gemini Onboarding：前 45 秒 spawn interval ×1.25（怪生產速度降 20%）
      const intervalMult = this.elapsed < CONFIG.firstWaveSlowDuration
        ? CONFIG.firstWaveIntervalMult : 1.0;
      this.spawnTimer = CONFIG.spawnInterval * intervalMult;
      // W5: 無盡模式提升 spawn target cap
      const baseCap = this.isFirstRun ? CONFIG.firstRunEnemyCap : CONFIG.spawnTargetMax;
      const cap = this.endlessMode ? Math.floor(baseCap * CONFIG.endlessSpawnRampMult) : baseCap;

      // 玩家反饋：開局難度過高 → 前 earlyRampDuration 秒用 quadratic ease-in
      // 從 0 漸進到 1.0，讓 ramp 在初期幾乎沒效果，再平滑回歸原本曲線
      const easeT = Math.min(1, this.elapsed / CONFIG.earlyRampDuration);
      const earlyMult = easeT * easeT;
      const target = Math.min(
        cap,
        CONFIG.spawnTargetBase + Math.floor(this.elapsed * CONFIG.spawnTargetRamp * earlyMult)
      );
      if (this.swarm.activeCount < target) {
        const burst = Math.min(
          target - this.swarm.activeCount,
          Math.floor(CONFIG.spawnBurstBase + this.elapsed * CONFIG.spawnBurstRamp)
        );
        if (burst > 0) this.swarm.spawnBurst(burst, CONFIG.spawnRingRadiusMin, CONFIG.spawnRingRadiusMax);
      }
    }

    // Slinger（第一局關閉）
    if (!this.isFirstRun && this.elapsed >= CONFIG.slingerStartTime) {
      this.slingerSpawnTimer -= rawDt;
      if (this.slingerSpawnTimer <= 0) {
        this.slingerSpawnTimer = CONFIG.slingerSpawnInterval;
        const target = Math.min(
          CONFIG.slingerTargetMax,
          1 + Math.floor((this.elapsed - CONFIG.slingerStartTime) * CONFIG.slingerTargetRamp)
        );
        if (this.slingers.activeCount < target) {
          this.slingers.spawnBurst(CONFIG.slingerSpawnBurst, CONFIG.spawnRingRadiusMin + 4, CONFIG.spawnRingRadiusMax);
          if (this.slingers.activeCount === 1) this.tutorial.trigger('slinger');
        }
      }
    }

    // Splitter（第一局關閉）
    if (!this.isFirstRun && this.elapsed >= CONFIG.splitterStartTime) {
      this.splitterSpawnTimer -= rawDt;
      if (this.splitterSpawnTimer <= 0) {
        this.splitterSpawnTimer = CONFIG.splitterSpawnInterval;
        const target = Math.min(
          CONFIG.splitterSpawnTargetMax,
          CONFIG.splitterSpawnTargetBase + Math.floor((this.elapsed - CONFIG.splitterStartTime) * CONFIG.splitterSpawnTargetRamp)
        );
        if (this.splitters.activeCount < target) {
          const spawned = this.splitters.spawnBurst(1, CONFIG.spawnRingRadiusMin, CONFIG.spawnRingRadiusMax);
          // B4 fix: 第一隻 splitter 出現時就觸發教學，不靠 mite 撞英雄
          if (spawned > 0 && !this._splitterTutorialFired) {
            this._splitterTutorialFired = true;
            this.tutorial.trigger('splitter');
          }
        }
      }
    }

    // Boss Ohm — Gemini Level-Gated Timeline
    // Trigger：level ≥ 15 啟動 15 秒倒數；或絕對時間 fallback（避免完全卡住升等的玩家無 boss 體驗）
    if ((!this.isFirstRun || this._botForceBoss) && !this.bossSpawned && !this.boss.alive[0]) {
      if (!this.bossWarningShown) {
        const levelTriggered = this.level >= CONFIG.bossSpawnLevel;
        const timeFallback = this.elapsed >= CONFIG.bossSpawnTime - CONFIG.bossWarningLead;
        if (levelTriggered || timeFallback) {
          this.bossWarningShown = true;
          this._bossWarningStartElapsed = this.elapsed;
          this.tutorial.trigger('bossWarning');
          this.audio.playGameOver();
        }
      }
      if (this.bossWarningShown && this.elapsed - this._bossWarningStartElapsed >= CONFIG.bossWarningLead) {
        this.bossSpawned = true;
        this.boss.spawn(this.crystal);
        this.tutorial.trigger('boss');
        this.effects.addTrauma(0.6);
        this.audio.playTetherSnap();
      }
    }

    // W4 Nexus — Level-Gated（LV40）+ Ohm 已死才生
    if ((!this.isFirstRun || this._botForceBoss) && !this.nexusSpawned && !this.nexus.alive[0] && !this.boss.alive[0]) {
      if (!this.nexusWarningShown) {
        const levelTriggered = this.level >= CONFIG.nexusSpawnLevel;
        const timeFallback = this.elapsed >= CONFIG.nexusSpawnTime - CONFIG.nexusWarningLead;
        if (levelTriggered || timeFallback) {
          this.nexusWarningShown = true;
          this._nexusWarningStartElapsed = this.elapsed;
          this.tutorial.showCustom('⚠ NEXUS 接近中...將強制隔絕你與水晶', 11);
          this.audio.playGameOver();
        }
      }
      if (this.nexusWarningShown && this.elapsed - this._nexusWarningStartElapsed >= CONFIG.nexusWarningLead) {
        this.nexusSpawned = true;
        this.nexus.spawn(this.crystal);
        this.tutorial.showCustom('NEXUS 降臨！毀掉 3 根量子干擾柱才能擊破本體', 13);
        this.effects.addTrauma(0.8);
        this.effects.addChroma(0.035);
        this.audio.playTetherSnap();
        if (this.audio.ambient) this.audio.ambient.bossDrop();
      }
    }

    // W5: 無盡熵增 — 雙 boss 同場生成
    // 修：原本 _lastDeadAt=-999 sentinel 會讓尚未登場的 Chronos / Mu 一進 endless 就被秒生 →
    // 玩家殺完 Nexus 立刻被 4 boss 同框轟死。改為「只有曾經死過才在 endless 模式 respawn」。
    // 還沒首登場的 boss 走下方 normal-mode 區塊的 spawn time 自然出生。
    if (this.endlessMode) {
      const respawnDelay = CONFIG.endlessBossRespawnDelay;
      if (this._bossLastDeadAt > 0 && !this.boss.alive[0] && this.elapsed - this._bossLastDeadAt > respawnDelay) {
        this.boss.spawn(this.crystal);
        this.effects.addTrauma(0.5);
        this.audio.playTetherSnap();
        if (this.audio.ambient) this.audio.ambient.bossDrop();
      }
      if (this._nexusLastDeadAt > 0 && !this.nexus.alive[0] && this.elapsed - this._nexusLastDeadAt > respawnDelay) {
        this.nexus.spawn(this.crystal);
        this.effects.addTrauma(0.6);
        this.audio.playTetherSnap();
        if (this.audio.ambient) this.audio.ambient.bossDrop();
      }
      // W6: Chronos 在 endless 也會循環（曾死過才 respawn；未登場仍由 normal-mode 區塊負責）
      if (this._chronosLastDeadAt > 0 && !this.chronos.alive[0] && this.elapsed - this._chronosLastDeadAt > respawnDelay + 10) {
        this.chronos.spawn(this.crystal);
        this.effects.addTrauma(0.7);
        this.audio.playTetherSnap();
        if (this.audio.ambient) this.audio.ambient.bossDrop();
      }
      // W7: Mu 在 endless 也循環（90 秒間隔；同樣只在 Mu 曾死過後重生）
      if (this._muLastDeadAt > 0 && !this.mu.alive[0] && this.elapsed - this._muLastDeadAt > 90 && !this._perksBackup) {
        this._muSnapshotPerks();
        this.mu.spawn(this.crystal);
        this.effects.addTrauma(1.0);
        this.effects.addChroma(0.05);
        this.tutorial.showCustom('☢ MU 再臨 ── PERKS 全面停用，僅靠 tether 穿心碎殼 ☢', 12);
        this.audio.playTetherSnap();
        if (this.audio.ambient) this.audio.ambient.bossDrop();
      }
    }

    // W7 Mu — Level-Gated（LV80）+ 其他 boss 都不在場才生
    if ((!this.isFirstRun || this._botForceBoss) && !this.muSpawned && !this.mu.alive[0]) {
      if (!this.muWarningShown) {
        const levelTriggered = this.level >= CONFIG.muSpawnLevel;
        const timeFallback = this.elapsed >= CONFIG.muSpawnTime - CONFIG.muWarningLead;
        if (levelTriggered || timeFallback) {
          this.muWarningShown = true;
          this._muWarningStartElapsed = this.elapsed;
          this.tutorial.showCustom('☢ MU 接近中... PERKS 將被解構，tether 穿心是唯一解 ☢', 14);
          this.audio.playGameOver();
        }
      }
      if (this.muWarningShown && this.elapsed - this._muWarningStartElapsed >= CONFIG.muWarningLead
          && !this.boss.alive[0] && !this.nexus.alive[0] && !this.chronos.alive[0]) {
        this.muSpawned = true;
        this._muSnapshotPerks();
        this.mu.spawn(this.crystal);
        this.tutorial.showCustom('MU 降臨！讓 tether 線段穿過 Mu 才能擊破其外殼', 14);
        this.effects.addTrauma(1.0);
        this.effects.addChroma(0.05);
        this.audio.playTetherSnap();
        if (this.audio.ambient) this.audio.ambient.bossDrop();
      }
    }

    // W6 Chronos — Level-Gated（LV60）+ Ohm/Nexus 不在場才生
    if ((!this.isFirstRun || this._botForceBoss) && !this.chronosSpawned && !this.chronos.alive[0]) {
      if (!this.chronosWarningShown) {
        const levelTriggered = this.level >= CONFIG.chronosSpawnLevel;
        const timeFallback = this.elapsed >= CONFIG.chronosSpawnTime - CONFIG.chronosWarningLead;
        if (levelTriggered || timeFallback) {
          this.chronosWarningShown = true;
          this._chronosWarningStartElapsed = this.elapsed;
          this.tutorial.showCustom('⚠ CHRONOS 接近中... 將全面加速怪潮', 11);
          this.audio.playGameOver();
        }
      }
      if (this.chronosWarningShown && this.elapsed - this._chronosWarningStartElapsed >= CONFIG.chronosWarningLead
          && !this.boss.alive[0] && !this.nexus.alive[0]) {
        this.chronosSpawned = true;
        this.chronos.spawn(this.crystal);
        this.tutorial.showCustom('CHRONOS 降臨！怪物時間 ×2 — Dash 或 Tether Snap 可短暫減速', 13);
        this.effects.addTrauma(0.9);
        this.effects.addChroma(0.04);
        this.audio.playTetherSnap();
        if (this.audio.ambient) this.audio.ambient.bossDrop();
      }
    }
  }

  _processEchoes() {
    if (this._echoQueue.length === 0) return;
    const remaining = [];
    for (const e of this._echoQueue) {
      if (this.elapsed < e.expireAt) { remaining.push(e); continue; }
      const radius = CONFIG.heroPulseRadius * this.perks.pulseRadiusMult * (this.perks._earlyRadiusBonus ?? 1);
      const r2 = radius * radius;
      const baseDmg = CONFIG.heroPulseBaseDamage * this.tether.heroDmgMult * e.dmgMult
        * (this.perks.heroDmgGlobal || 1);

      // B14: 用公開 API 取代摸 hero 內部
      this.hero.spawnPulseRing(e.x, e.z, radius, 0xff66dd, 0.7);

      for (const sw of this._allSwarms()) {
        for (let i = 0; i < sw.maxCount; i++) {
          if (!sw.alive[i]) continue;
          const dx = sw.pos[i*3+0] - e.x;
          const dz = sw.pos[i*3+2] - e.z;
          if (dx*dx + dz*dz > r2) continue;
          const killed = sw.damage(i, baseDmg);
          this.effects.spawnDamageNumber(sw.pos[i*3+0], 0.8, sw.pos[i*3+2], baseDmg, false);
          if (killed) this._onKill(sw, sw.pos[i*3+0], sw.pos[i*3+2]);
        }
      }
      this.audio.playHit(1.3);
    }
    this._echoQueue = remaining;
  }

  /** Soul Debt 半衰期：靈魂軌道結束時釋放微脈衝（30% 傷害、60% 半徑）然後 2× 速衝回水晶 */
  _processSoulDebtMicroPulses() {
    const queue = this.tether.microPulseQueue;
    if (!queue || queue.length === 0) return;
    const radius = CONFIG.heroPulseRadius * (this.perks.pulseRadiusMult || 1)
      * (this.perks._earlyRadiusBonus ?? 1) * CONFIG.soulDebtMicroPulseRadiusMult;
    const r2 = radius * radius;
    const baseDmg = CONFIG.heroPulseBaseDamage * this.tether.heroDmgMult
      * CONFIG.soulDebtMicroPulseDmgMult * (this.perks.heroDmgGlobal || 1);
    for (const ev of queue) {
      this.hero.spawnPulseRing(ev.x, ev.z, radius, 0xddaaff, 0.55);
      for (const sw of this._allSwarms()) {
        for (let i = 0; i < sw.maxCount; i++) {
          if (!sw.alive[i]) continue;
          const dx = sw.pos[i*3+0] - ev.x;
          const dz = sw.pos[i*3+2] - ev.z;
          if (dx*dx + dz*dz > r2) continue;
          const killed = sw.damage(i, baseDmg);
          if (killed) this._onKill(sw, sw.pos[i*3+0], sw.pos[i*3+2]);
        }
      }
    }
    queue.length = 0;
  }

  _triggerTetherSnap() {
    const hx = this.hero.position.x, hz = this.hero.position.z;
    const cx = this.crystal.position.x, cz = this.crystal.position.z;
    const dx = cx - hx, dz = cz - hz;
    const len = Math.max(0.001, Math.hypot(dx, dz));
    const nx = dx / len, nz = dz / len;
    // W6: Volatile Loop +400% snap dmg；heroDmgGlobal 全域倍率
    let snapMult = 1.0;
    if (this.perks.volatileLoop) snapMult *= (1 + CONFIG.volatileSnapBonus);
    const damage = CONFIG.tetherSnapDamage * this.tether.heroDmgMultNatural
      * snapMult * (this.perks.heroDmgGlobal || 1);
    const radius2 = CONFIG.tetherSnapRadius * CONFIG.tetherSnapRadius;

    for (const sw of this._allSwarms()) {
      for (let i = 0; i < sw.maxCount; i++) {
        if (!sw.alive[i]) continue;
        const ex = sw.pos[i*3+0], ez = sw.pos[i*3+2];
        const relX = ex - hx, relZ = ez - hz;
        const along = relX * nx + relZ * nz;
        if (along < 0 || along > len) continue;
        const perpX = relX - nx * along, perpZ = relZ - nz * along;
        if (perpX*perpX + perpZ*perpZ > radius2) continue;
        const killed = sw.damage(i, damage);
        this.effects.spawnDamageNumber(ex, 1.0, ez, damage, true);
        if (killed) this._onKill(sw, ex, ez);
      }
    }
    this.tether.flashSnap();
    this.audio.playTetherSnap();
    this._impact(0.1);  // W5
    this.effects.addTrauma(0.45);
    this.effects.addChroma(0.025);
  }

  /** W5 包裝：hit-stop + 可能觸發 bullet time（取決於 Critical Suspension perk） */
  _impact(hsDur) {
    this.effects.triggerHitStop(hsDur);
    if (this.perks.criticalSuspension) {
      this.bulletTimeRemaining = Math.max(this.bulletTimeRemaining, CONFIG.criticalSuspensionDuration);
    }
  }

  /** W5 動能逆轉：環內敵人朝水晶外推 + 立即傷害 50 */
  _triggerKineticReversal() {
    const hx = this.hero.position.x, hz = this.hero.position.z;
    const cx = this.crystal.position.x, cz = this.crystal.position.z;
    const r = CONFIG.kineticReversalRadius;
    const r2 = r * r;
    const dmg = 50 * this.tether.heroDmgMultNatural * (this.perks.heroDmgGlobal || 1);

    // 視覺：藍色反相環
    this.hero.spawnPulseRing(hx, hz, r, 0x44aaff, 0.8);

    for (const sw of this._allSwarms()) {
      for (let i = 0; i < sw.maxCount; i++) {
        if (!sw.alive[i]) continue;
        const ex = sw.pos[i*3+0], ez = sw.pos[i*3+2];
        const dx = ex - hx, dz = ez - hz;
        if (dx*dx + dz*dz > r2) continue;
        // 推力方向：從水晶向外（敵人「相對於水晶」的徑向）
        let outX = ex - cx, outZ = ez - cz;
        const outLen = Math.max(0.001, Math.hypot(outX, outZ));
        outX /= outLen; outZ /= outLen;
        sw.applyKnockback(i, outX * CONFIG.kineticReversalForce, outZ * CONFIG.kineticReversalForce);
        const killed = sw.damage(i, dmg);
        this.effects.spawnDamageNumber(ex, 1.0, ez, dmg, true);
        if (killed) this._onKill(sw, ex, ez);
      }
    }
    this.effects.addTrauma(0.18);
    this.audio.playDashHit();
  }

  _damageCrystal(amount, bypassShield = false) {
    // W4 Mass Collapse: 重力場啟動時，水晶受所有傷害減 25%
    if (this.perks.massCollapse && this.hero.gravityWellActive) {
      amount *= (1 - CONFIG.massCollapseCrystalDmgReduction);
    }
    if (!bypassShield && this.perks.shieldHp > 0) {
      const absorbed = Math.min(this.perks.shieldHp, amount);
      this.perks.shieldHp -= absorbed;
      amount -= absorbed;
      if (amount <= 0) {
        this.crystal.hitFlash = 0.4;
        return;
      }
    }
    this.crystal.takeDamage(amount);
    this.audio.playTake();
  }

  /** W4 Mass Collapse: 重力場拉 mites 朝英雄 */
  _applyGravityWell() {
    const hx = this.hero.position.x, hz = this.hero.position.z;
    const r = CONFIG.massCollapseRadius;
    const r2 = r * r;
    const pullStr = 9;
    for (let i = 0; i < this.mites.maxCount; i++) {
      if (!this.mites.alive[i]) continue;
      const dx = hx - this.mites.pos[i*3+0];
      const dz = hz - this.mites.pos[i*3+2];
      const d2 = dx*dx + dz*dz;
      if (d2 < r2 && d2 > 0.0001) {
        const d = Math.sqrt(d2);
        this.mites.knockback[i*3+0] += (dx/d) * pullStr;
        this.mites.knockback[i*3+2] += (dz/d) * pullStr;
      }
    }
  }

  _gainXP(amount) {
    // W7: Mu 戰中 XP 暫停（perks 反正也是停用）
    if (this.mu.alive[0]) return;
    this.xp += amount;
    while (this.xp >= this.xpToNext) {
      this.xp -= this.xpToNext;
      this.level++;
      this.xpToNext = getXpForLevel(this.level);
      this._pendingLevelUps++;
    }
    this._drainLevelUps();
  }

  /** B1 fix: 序列化顯示等級提升 — 同步迴圈絕對不能呼叫第二次 perkUI.show */
  _drainLevelUps() {
    if (this._pendingLevelUps <= 0 || this.paused) return;
    this._pendingLevelUps--;
    this.audio.playLevelUp();
    this.effects.addTrauma(0.3);
    this.paused = true;
    this.tutorial.trigger('levelup');
    // Gemini Onboarding：第一局時把 isFirstRun 傳給 rollPerkChoices，加權防守型 perk
    // 傳完整 taken 列表（含重複），讓 rollPerkChoices 能正確算 stackable perk 的 maxStacks
    const choices = rollPerkChoices(this.perks.taken, 3, this.isFirstRun);
    // W6 Soul Imprint: 第一次升級保證烙印的天賦出現在三選一中
    // B21: 用「還沒拿過任何 perk」判定首升，避免一次升 2+ 級時誤判
    if (this.perks.taken.length === 0 && this.meta.imprintUnlocked && this.meta.imprinted) {
      const imp = PERKS[this.meta.imprinted];
      if (imp && !this._uniqueTakenIds().includes(this.meta.imprinted)
          && !choices.find(c => c.id === imp.id)) {
        if (choices.length >= 1) choices[0] = imp;
        else choices.push(imp);
      }
    }
    this.perkUI.show(this.level, choices, (chosen) => {
      if (chosen) {
        chosen.apply(this);
        this.perks.taken.push(chosen.id);
        this.perkUI.renderActiveList(this.perks.taken, PERKS);
      }
      this.tutorial.dismissIf('levelup');
      this.paused = false;
      this._drainLevelUps();  // 鏈式處理下一個升級
    });
  }

  _uniqueTakenIds() {
    return Array.from(new Set(this.perks.taken));
  }

  _updateHUD() {
    const hpPct = Math.max(0, this.crystal.hp / this.crystal.maxHp);
    this.ui.hpBar.style.width = (hpPct * 100).toFixed(1) + '%';
    this.ui.hpText.textContent = `${Math.ceil(this.crystal.hp)} / ${this.crystal.maxHp}`;
    this.ui.tether.textContent = (this.tether.severed ? '✕ ' : '') + '×' + this.tether.heroDmgMult.toFixed(2);
    this.ui.kills.textContent = this.kills;
    this.ui.time.textContent = this.elapsed.toFixed(0) + 's';
    const totalEnemies = this.swarm.activeCount + this.slingers.activeCount + this.splitters.activeCount + this.mites.activeCount + (this.boss.alive[0] ? 1 : 0);
    this.ui.enemyCount.textContent = totalEnemies;
    this.ui.soulCount.textContent = this.tether.soulCount;
    this.ui.bulletCount.textContent = this.bullets.activeCount;
    this.ui.level.textContent = this.level;
    const xpPct = Math.min(1, this.xp / this.xpToNext);
    this.ui.xpBar.style.width = (xpPct * 100).toFixed(1) + '%';

    if (this.ui.shieldBar) {
      const shieldPct = Math.min(1, this.perks.shieldHp / this.crystal.maxHp);
      this.ui.shieldBar.style.width = shieldPct > 0 ? (shieldPct * 100).toFixed(1) + '%' : '0';
    }

    // W5 Entropy
    if (this.ui.entropy) {
      this.ui.entropy.textContent = this.entropy.toFixed(2);
      if (this.endlessMode && this.ui.entropyWrap) {
        this.ui.entropyWrap.classList.add('endless');
      }
    }

    // Boss HP 條（W7: Mu 優先 — 終局 boss）
    if (this.ui.bossHpWrap) {
      if (this.mu.alive[0]) {
        this.ui.bossHpWrap.style.display = 'block';
        if (this.ui.bossName) {
          this.ui.bossName.textContent = this.mu.shellAlive
            ? 'MU ── 虛無之神　[SHELL // 讓 tether 穿心]'
            : 'MU ── 虛無之神　[CORE 暴露 // 全力輸出]';
        }
        const pct = this.mu.shellAlive ? 1.0 : Math.max(0, this.mu.hp[0] / this.mu.maxHp);
        this.ui.bossHpBar.style.width = (pct * 100).toFixed(1) + '%';
        this.ui.bossHpBar.style.background = this.mu.shellAlive
          ? 'linear-gradient(90deg, #aa44aa, #ff77ff)'
          : 'linear-gradient(90deg, #220033, #770099)';
      } else if (this.boss.alive[0]) {
        this.ui.bossHpWrap.style.display = 'block';
        if (this.ui.bossName) this.ui.bossName.textContent = 'OHM ── 繫帶終結者';
        const pct = Math.max(0, this.boss.hp[0] / this.boss.maxHp);
        this.ui.bossHpBar.style.width = (pct * 100).toFixed(1) + '%';
        this.ui.bossHpBar.style.background = 'linear-gradient(90deg, #ff1133, #ff6677)';
      } else if (this.nexus.alive[0]) {
        this.ui.bossHpWrap.style.display = 'block';
        if (this.ui.bossName) this.ui.bossName.textContent = `NEXUS ── 連結之巢　(柱 ${this.nexus.pillarsAlive}/3)`;
        const pct = Math.max(0, this.nexus.hp[0] / this.nexus.maxHp);
        this.ui.bossHpBar.style.width = (pct * 100).toFixed(1) + '%';
        this.ui.bossHpBar.style.background = 'linear-gradient(90deg, #ff2266, #ff88dd)';
      } else if (this.chronos.alive[0]) {
        this.ui.bossHpWrap.style.display = 'block';
        if (this.ui.bossName) this.ui.bossName.textContent = 'CHRONOS ── 時界主宰　[怪潮 ×2]';
        const pct = Math.max(0, this.chronos.hp[0] / this.chronos.maxHp);
        this.ui.bossHpBar.style.width = (pct * 100).toFixed(1) + '%';
        this.ui.bossHpBar.style.background = 'linear-gradient(90deg, #66ddff, #aaffee)';
      } else {
        this.ui.bossHpWrap.style.display = 'none';
      }
    }
  }

  _endGame() {
    this.gameOver = true;
    // ★ 先強制彈出 game over screen — 即使後面任何 render 操作 throw，玩家也看得到 UI
    //   修「水晶死了但 UI 沒出現 = 看起來像 freeze」的真實風險
    if (this.ui.gameover) {
      this.ui.gameover.classList.add('show');
    }

    let earned = 0;
    try {
      earned = this.meta.recordRun({
        kills: this.kills,
        time: this.elapsed,
        level: this.level,
      });
      this.meta.addRecord({
        entropy: parseFloat(this.entropy.toFixed(2)),
        kills: this.kills,
        time: Math.floor(this.elapsed),
        level: this.level,
        perks: Array.from(new Set(this.perks.taken || [])),
        forbidden: Array.from(this.meta.forbiddenActive),
        muKilled: this._muLastDeadAt > 0,
        date: new Date().toISOString().slice(0, 10),
      }, CONFIG.leaderboardMaxEntries);
    } catch (e) { console.error('[_endGame] meta record failed:', e); }

    try {
      this.ui.finalKills.textContent = this.kills;
      this.ui.finalTime.textContent = this.elapsed.toFixed(0);
      if (this.ui.finalLevel) this.ui.finalLevel.textContent = this.level;
      if (this.ui.runSouls) this.ui.runSouls.textContent = earned;
      if (this.ui.totalSouls) this.ui.totalSouls.textContent = this.meta.souls;
      if (this.ui.runCount) this.ui.runCount.textContent = this.meta.runs;
    } catch (e) { console.error('[_endGame] hud text failed:', e); }

    // 三個 render 各自獨立 try/catch — 任一失敗不影響其他
    try { this._renderTechTree(); } catch (e) { console.error('[_endGame] tech tree:', e); }
    try { this._renderLeaderboard(); } catch (e) { console.error('[_endGame] leaderboard:', e); }
    try { this._renderSaveSlots(); } catch (e) { console.error('[_endGame] save slots:', e); }

    try {
      this.effects.addTrauma(0.8);
      this.effects.addChroma(0.04);
      this.audio.playGameOver();
    } catch (e) { console.error('[_endGame] fx:', e); }
  }

  /** W7 Terminal-style 排行榜 — ASCII 風格 */
  _renderLeaderboard() {
    const wrap = document.getElementById('leaderboard-wrap');
    if (!wrap) return;
    const records = this.meta.getRecords();
    let html = `<pre class="terminal-board">┌─[ ENTROPY LEADERBOARD // TOP ${CONFIG.leaderboardMaxEntries} ]──────────────────────────────┐
│ RANK   ENTROPY   TIME    LV   KILLS  MU   PERKS / FORBIDDEN                       │
├──────────────────────────────────────────────────────────────────────────────────┤`;
    if (records.length === 0) {
      html += '\n│   (no records yet — survive long enough to enter the void)                       │';
    } else {
      records.forEach((r, idx) => {
        const rank = String(idx + 1).padStart(2, ' ');
        const ent = r.entropy.toFixed(2).padStart(7, ' ');
        const time = (r.time + 's').padStart(6, ' ');
        const lv = String(r.level).padStart(3, ' ');
        const kills = String(r.kills).padStart(6, ' ');
        const muMark = r.muKilled ? '★' : ' ';
        const perksList = (r.perks || []).slice(0, 5).join(',');
        const fbList = r.forbidden && r.forbidden.length > 0 ? ` ☣${r.forbidden.join(',')}` : '';
        const detail = (perksList + fbList).slice(0, 56).padEnd(56, ' ');
        html += `\n│  ${rank}   ${ent}   ${time}   ${lv}  ${kills}   ${muMark}   ${detail} │`;
      });
    }
    html += '\n└──────────────────────────────────────────────────────────────────────────────────┘</pre>';
    wrap.innerHTML = html;
  }

  _renderTechTree() {
    if (!this.ui.techGrid) return;
    this.ui.techGrid.innerHTML = '';
    for (const id in META_NODES) {
      const n = META_NODES[id];
      const owned = this.meta.hasUnlock(id);
      const canBuy = this.meta.canAfford(id);
      const card = document.createElement('div');
      card.className = 'tech-card' + (owned ? ' owned' : '') + (canBuy ? ' can-buy' : '');
      card.innerHTML = `
        <div class="tech-icon">${n.icon}</div>
        <div class="tech-name">${n.name}</div>
        <div class="tech-desc">${n.desc}</div>
        <div class="tech-cost">${owned ? '已擁有' : (n.cost + ' 💠')}</div>
      `;
      if (!owned) {
        card.addEventListener('click', () => {
          if (this.meta.buy(id)) {
            this.audio.playShield();
            if (this.ui.totalSouls) this.ui.totalSouls.textContent = this.meta.souls;
            this._renderTechTree();
          }
        });
      }
      this.ui.techGrid.appendChild(card);
    }
    // W6
    this._renderImprintSection();
    this._renderForbiddenSection();
  }

  /** W6: 靈魂烙印 UI */
  _renderImprintSection() {
    const wrap = document.getElementById('imprint-wrap');
    if (!wrap) return;
    if (!this.meta.imprintUnlocked) {
      const canAfford = this.meta.souls >= CONFIG.metaImprintSlotCost;
      wrap.innerHTML = `
        <div class="meta-section-title">✦ 靈魂烙印</div>
        <div class="meta-section-desc">解鎖後可指定 1 個 Rare/Legendary 天賦保證 100% 出現在開局選池</div>
        <button class="meta-action ${canAfford ? 'can-buy' : ''}" id="imprint-buy">
          解鎖烙印槽 — ${CONFIG.metaImprintSlotCost} 💠
        </button>`;
      const btn = wrap.querySelector('#imprint-buy');
      if (btn && canAfford) {
        btn.addEventListener('click', () => {
          if (this.meta.buyImprintSlot(CONFIG.metaImprintSlotCost)) {
            this.audio.playLevelUp();
            this._refreshMetaUI();
          }
        });
      }
    } else {
      const cur = this.meta.imprinted ? PERKS[this.meta.imprinted] : null;
      const imprintables = Object.values(PERKS).filter(p => p.rarity !== 'common');
      let opts = '';
      for (const p of imprintables) {
        const active = p.id === this.meta.imprinted;
        opts += `<button class="imprint-pick rarity-${p.rarity} ${active ? 'active' : ''}" data-perk="${p.id}" title="${p.desc}">
          ${p.icon} ${p.nameCn}
        </button>`;
      }
      wrap.innerHTML = `
        <div class="meta-section-title">✦ 靈魂烙印 <span class="unlocked-mark">已解鎖</span></div>
        <div class="meta-section-desc">當前烙印：${cur ? `<b>${cur.icon} ${cur.nameCn}</b>` : '<i style="opacity:0.5">未設定（再點同個又會取消）</i>'}</div>
        <div class="imprint-options">${opts}</div>`;
      wrap.querySelectorAll('.imprint-pick').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-perk');
          if (id === this.meta.imprinted) this.meta.clearImprint();
          else this.meta.setImprint(id);
          this.audio.playHit();
          this._refreshMetaUI();
        });
      });
    }
  }

  /** W6: 禁忌代碼 UI */
  _renderForbiddenSection() {
    const wrap = document.getElementById('forbidden-wrap');
    if (!wrap) return;
    let html = `<div class="meta-section-title">☣ 禁忌代碼</div>
      <div class="meta-section-desc">高風險高回報雙面刃，可在 Meta 面板自由開關</div>
      <div class="forbidden-list">`;
    for (const id in FORBIDDEN_PERKS) {
      const fp = FORBIDDEN_PERKS[id];
      const owned = this.meta.forbiddenUnlocked.has(id);
      const active = this.meta.forbiddenActive.has(id);
      const canAfford = this.meta.souls >= CONFIG.metaForbiddenUnlockCost;
      if (!owned) {
        html += `<div class="forbidden-card locked">
          <div class="fb-icon">${fp.icon}</div>
          <div class="fb-info">
            <div class="fb-name">${fp.nameCn}</div>
            <div class="fb-desc">${fp.desc}</div>
          </div>
          <button class="meta-action ${canAfford ? 'can-buy' : ''}" data-buy="${id}">解鎖 ${CONFIG.metaForbiddenUnlockCost} 💠</button>
        </div>`;
      } else {
        html += `<div class="forbidden-card ${active ? 'active' : ''}">
          <div class="fb-icon">${fp.icon}</div>
          <div class="fb-info">
            <div class="fb-name">${fp.nameCn}</div>
            <div class="fb-desc">${fp.desc}</div>
          </div>
          <button class="forbidden-toggle ${active ? 'on' : 'off'}" data-toggle="${id}">${active ? '啟用中' : '關閉'}</button>
        </div>`;
      }
    }
    html += '</div>';
    wrap.innerHTML = html;
    wrap.querySelectorAll('[data-buy]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-buy');
        if (this.meta.buyForbidden(id, CONFIG.metaForbiddenUnlockCost)) {
          this.audio.playTetherSnap();
          this._refreshMetaUI();
        }
      });
    });
    wrap.querySelectorAll('[data-toggle]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-toggle');
        this.meta.toggleForbidden(id);
        this.audio.playHit();
        this._refreshMetaUI();
      });
    });
  }

  _refreshMetaUI() {
    if (this.ui.totalSouls) this.ui.totalSouls.textContent = this.meta.souls;
    this._renderTechTree();
  }

  /** 庇護啟動時的「震波清場」— 推開水晶 25u 內所有敵人 + 立即傷害，給玩家戲劇化視覺 + 喘息時間 */
  _triggerShieldNova() {
    const cx = this.crystal.position.x, cz = this.crystal.position.z;
    const r = 25;
    const r2 = r * r;
    const dmg = 80;
    // 用 hero 的 pulse ring 池畫一個大藍環在水晶位置
    this.hero.spawnPulseRing(cx, cz, r, 0x66ccff, 1.0);

    for (const sw of [this.swarm, this.slingers, this.splitters, this.mites]) {
      for (let i = 0; i < sw.maxCount; i++) {
        if (!sw.alive[i]) continue;
        const dx = sw.pos[i*3+0] - cx;
        const dz = sw.pos[i*3+2] - cz;
        const d2 = dx*dx + dz*dz;
        if (d2 > r2) continue;
        const len = Math.max(0.001, Math.sqrt(d2));
        sw.applyKnockback(i, (dx/len) * 35, (dz/len) * 35);
        const killed = sw.damage(i, dmg);
        if (killed) {
          this.kills++;
          this.tether.spawnSoul(sw.pos[i*3+0], sw.pos[i*3+2]);
        }
      }
    }
  }

  /** 手動存檔 UI — Game Over 螢幕的 3 個 Slot 按鈕 + Export/Import Base64 */
  _renderSaveSlots() {
    const wrap = document.getElementById('save-slots-wrap');
    if (!wrap) return;
    let html = `<div class="meta-section-title">💾 手動存檔</div>
      <div class="meta-section-desc">把當前進度存到 Slot；雙重備份 + checksum 防損毀；下次開遊戲在 Boot Menu 載入</div>
      <div class="save-slot-list">`;
    for (let n = 1; n <= SLOT_COUNT; n++) {
      const info = getSlotSummary(n);
      let summary;
      if (info) {
        const d = info.savedAt ? info.savedAt.slice(0, 10) : '';
        summary = `SLOT ${n} ── 💠 ${info.souls} · ${info.bestKills} kills · ${d}　<span class="save-action">覆蓋</span>`;
      } else {
        summary = `SLOT ${n} ── <i>空</i>　<span class="save-action">存到此</span>`;
      }
      html += `<button class="save-slot-btn" data-save-slot="${n}">${summary}</button>`;
    }
    html += '</div>';

    // === Export / Import Base64 區 ===
    html += `<div class="save-io-section">
      <div class="save-io-title">📤 跨裝置備份（Base64 明文）</div>
      <div class="save-io-actions">
        <button class="save-io-btn" data-action="export">📤 匯出當前進度</button>
        <button class="save-io-btn" data-action="import-show">📥 匯入存檔（貼 Base64）</button>
      </div>
      <textarea id="save-io-text" placeholder="點「匯出」會自動填入；或貼 Base64 字串後點「確認匯入」" rows="3" readonly></textarea>
      <div class="save-io-actions">
        <button class="save-io-btn" data-action="copy">📋 複製到剪貼簿</button>
        <button class="save-io-btn save-io-confirm" data-action="import-confirm">✅ 確認匯入並重啟</button>
      </div>
      <div id="save-io-status" class="save-io-status"></div>
    </div>`;

    wrap.innerHTML = html;

    // Slot 存檔按鈕
    wrap.querySelectorAll('[data-save-slot]').forEach(btn => {
      btn.addEventListener('click', () => {
        const n = parseInt(btn.getAttribute('data-save-slot'), 10);
        if (this.meta.saveToSlot(n)) {
          this.audio.playLevelUp();
          this._renderSaveSlots();
        }
      });
    });

    // Export / Import 按鈕
    const textArea = wrap.querySelector('#save-io-text');
    const statusEl = wrap.querySelector('#save-io-status');
    const setStatus = (msg, ok = true) => {
      statusEl.textContent = msg;
      statusEl.className = 'save-io-status ' + (ok ? 'ok' : 'err');
    };

    wrap.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const act = btn.getAttribute('data-action');
        if (act === 'export') {
          const b64 = this.meta.exportToBase64();
          textArea.readOnly = false;
          textArea.value = b64;
          textArea.select();
          setStatus(`已匯出 ${b64.length} 字元，可手動複製或按上方按鈕`, true);
          this.audio.playHit();
        } else if (act === 'import-show') {
          textArea.readOnly = false;
          textArea.value = '';
          textArea.placeholder = '貼上 Base64 字串...';
          textArea.focus();
          setStatus('請貼入 Base64 字串後按「確認匯入並重啟」', true);
        } else if (act === 'copy') {
          if (!textArea.value) { setStatus('沒有內容可複製，請先匯出', false); return; }
          try {
            navigator.clipboard.writeText(textArea.value);
            setStatus('已複製到剪貼簿 ✓', true);
          } catch (e) {
            textArea.select(); document.execCommand('copy');
            setStatus('已複製（fallback）', true);
          }
        } else if (act === 'import-confirm') {
          const val = textArea.value.trim();
          if (!val) { setStatus('輸入框是空的', false); return; }
          // 動態 import — 避免 circular
          import('./meta.js').then(mod => {
            const result = mod.importFromBase64(val);
            if (result.ok) {
              setStatus('✓ 匯入成功！已寫入 SLOT 1，3 秒後重啟 → 在 Boot Menu 選 Slot 1', true);
              setTimeout(() => location.reload(), 3000);
            } else {
              setStatus('✗ ' + result.error, false);
            }
          });
        }
      });
    });
  }

  /** W7: 召喚 Mu 時備份所有 perk 效果欄位後重設為預設 */
  _muSnapshotPerks() {
    this._perksBackup = {
      tetherSnap: this.perks.tetherSnap,
      loneWolf: this.perks.loneWolf,
      echoPulse: this.perks.echoPulse,
      soulSkipHero: this.perks.soulSkipHero,
      soulDebt: this.perks.soulDebt,
      volatileLoop: this.perks.volatileLoop,
      regicide: this.perks.regicide,
      spatialFolding: this.perks.spatialFolding,
      massCollapse: this.perks.massCollapse,
      kineticReversal: this.perks.kineticReversal,
      criticalSuspension: this.perks.criticalSuspension,
      heroSpeedMult: this.perks.heroSpeedMult,
      dashCooldownMult: this.perks.dashCooldownMult,
      pulseRadiusMult: this.perks.pulseRadiusMult,
      critChanceBonus: this.perks.critChanceBonus,
      critMultBonus: this.perks.critMultBonus,
      soulSpeedMult: this.perks.soulSpeedMult,
      heroDmgGlobal: this.perks.heroDmgGlobal,
      aegisStacks: this.perks.aegisStacks,
      shieldHp: this.perks.shieldHp,
    };
    // 全部重設為預設
    this.perks.tetherSnap = false;
    this.perks.loneWolf = false;
    this.perks.echoPulse = false;
    this.perks.soulSkipHero = false;
    this.perks.soulDebt = false;
    this.perks.volatileLoop = false;
    this.perks.regicide = false;
    this.perks.spatialFolding = false;
    this.perks.massCollapse = false;
    this.perks.kineticReversal = false;
    this.perks.criticalSuspension = false;
    this.perks.heroSpeedMult = 1.0;
    this.perks.dashCooldownMult = 1.0;
    this.perks.pulseRadiusMult = 1.0;
    this.perks.critChanceBonus = 0;
    this.perks.critMultBonus = 0;
    this.perks.soulSpeedMult = 1.0;
    this.perks.heroDmgGlobal = 1.0;
    this.perks.aegisStacks = 0;
    this.perks.shieldHp = 0;
    this._echoQueue.length = 0;     // 清掉殘留的 echo 佇列
  }

  /** W7: Mu 死亡時恢復 perks */
  _muRestorePerks() {
    if (!this._perksBackup) return;
    Object.assign(this.perks, this._perksBackup);
    this._perksBackup = null;
  }

  onResize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.effects.onResize();
  }
}
