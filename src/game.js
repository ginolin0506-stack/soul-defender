import * as THREE from 'three';
import { CONFIG } from './config.js';
import { buildScene } from './scene.js';
import { Input } from './input.js';
import { SpatialHash } from './spatialHash.js';
import { Hero } from './hero.js';
import { Crystal } from './crystal.js';
import { Swarm } from './enemies.js';
import { Slingers, BulletPool } from './slinger.js';
import { Splitters, Mites, SplitterBombs } from './splitter.js';
import { Sentinels } from './sentinel.js';
import { Wraiths } from './wraith.js';
import { Lancers } from './lancer.js';
import { Conduits } from './conduit.js';
import { Mires, MirePatchPool } from './mire.js';
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
      heroSpeedMult: 1.0,
      dashCooldownMult: 1.0,
      pulseRadiusMult: 1.0,
      critChanceBonus: 0,
      aegisStacks: 0,
      soulSinceShield: 0,
      shieldHp: 0,
      heroDmgGlobal: 1.0,        // W6: Glass Prism 倍率
      volatileLoop: false,       // W6: Volatile Loop flag
      pierce: false,
      pierceTimer: 0,            // 2026-05-22：穿刺劍氣 CD
      soulVacuum: false,         // 2026-05-22：靈魂路徑緩速
      hexStrikeOverload: false,  // 2026-05-22：瞬獄雷鳴
    };

    // === 瞬獄雷鳴 Hex Strike 狀態機 ===
    this.hexStrike = {
      state: 'idle',    // idle | locking | striking | done
      cooldown: 0,      // > 0：尚未準備好
      timer: 0,         // 當前狀態經過時間
      targets: [],      // {pool, idx, x, z, hitAt} 鎖定的 6 個目標
      effects: [],      // 視覺效果列表 {type:'lock'|'bolt', x, z, life, lifeMax}
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
    this.bombs = new SplitterBombs(this.scene, CONFIG.maxSplitterBombs);
    this.sentinels = new Sentinels(this.scene, CONFIG.maxSentinels);
    this.wraiths = new Wraiths(this.scene, CONFIG.maxWraiths);
    this.lancers = new Lancers(this.scene, CONFIG.maxLancers);
    this.conduits = new Conduits(this.scene, CONFIG.maxConduits);
    this.mirePatches = new MirePatchPool(this.scene, CONFIG.maxMirePatches);
    this.mires = new Mires(this.scene, CONFIG.maxMires, this.mirePatches);
    this.boss = new Boss(this.scene);
    this.nexus = new Nexus(this.scene);
    this.chronos = new Chronos(this.scene);     // W6
    this.mu = new Mu(this.scene);                // W7
    this.tether = new Tether(this.scene, this.hero, this.crystal);
    this.effects = new Effects(this.renderer, this.scene, this.camera);
    this.hash = new SpatialHash(CONFIG.hashCell);
    this.perkUI = new PerkUI();

    // 瞬獄雷鳴視覺池（鎖定環 + 雷柱 各 N 個）
    this._initHexStrikeVisuals();

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

    // 開局基礎 BUFF：所有玩家 Lv1 自動獲得「動能逆轉」
    // 玩家反饋 2026-05-21：開局難度過高，給 Dash 一個主動清場手段降低早期壓力
    {
      const baseline = PERKS.kinetic_reversal;
      if (baseline && !this.perks.taken.includes(baseline.id)) {
        baseline.apply(this);
        this.perks.taken.push(baseline.id);
        this.perkUI.renderActiveList(this.perks.taken, PERKS);
      }
    }

    // Bot 模式：bonusPerks=N → 自動套 N 個防守型 perk（模擬已升等玩家）
    if (this._botCfg && this._botCfg.bonusPerks > 0) {
      const order = ['aegis_charge', 'crystallize', 'bloom', 'swift_step', 'crystallize',
                     'aegis_charge', 'crystallize', 'bloom', 'crit_frenzy', 'aegis_charge',
                     'crystallize', 'swift_step', 'pierce', 'aegis_charge', 'crystallize'];
      for (let i = 0; i < this._botCfg.bonusPerks && i < order.length; i++) {
        const p = PERKS[order[i]];
        if (!p) continue;
        if (!p.stackable && this.perks.taken.includes(order[i])) continue;
        p.apply(this);
        this.perks.taken.push(order[i]);
      }
      this.perkUI.renderActiveList(this.perks.taken, PERKS);
    }

    // 2026-05-22：取消第一局差異，所有局內容相同（保留 tutorial UI 為新手提示）

    this.xp = 0;
    this.level = 1;
    this.xpToNext = getXpForLevel(this.level);

    this.elapsed = 0;
    this.kills = 0;
    this.gameOver = false;
    this.paused = false;          // perk overlay 顯示時用
    this.userPaused = false;      // 玩家按 P 主動暫停（與 perk overlay 互斥）
    this.pauseOverlay = document.getElementById('pause-overlay');
    this.audioStarted = false;

    this.spawnTimer = 0;
    this.slingerSpawnTimer = 0;
    this.splitterSpawnTimer = 0;
    this.mitesSpawnTimer = 0;
    this.sentinelSpawnTimer = 0;
    this.wraithSpawnTimer = 0;
    this.lancerSpawnTimer = 0;
    this.conduitSpawnTimer = 0;
    this.mireSpawnTimer = 0;
    this.bossSpawned = false;
    this.bossWarningShown = false;
    this._bossWarningStartElapsed = 0;       // Level-Gated 倒數起點
    this._nexusWarningStartElapsed = 0;
    this._chronosWarningStartElapsed = 0;
    this._muWarningStartElapsed = 0;
    this._pendingLevelUps = 0;       // B1: 多重升級佇列
    this._splitterTutorialFired = false;  // B4: splitter 教學觸發旗

    this.lastTime = performance.now();
    this.fpsFrames = 0;
    this.fpsLast = this.lastTime;

    this.ui = {
      hpBar: document.getElementById('crystal-hp'),
      shieldOverlay: document.getElementById('crystal-shield-overlay'),
      shieldMult: document.getElementById('shield-mult'),
      hpText: document.getElementById('hp-text'),
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
      heroHpBar: document.getElementById('hero-hp'),
      heroHpText: document.getElementById('hero-hp-text'),
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

    // B11 + W4 + W6 + 2026-05-22 新怪：預先 hoist 成員陣列
    // 注意：bombs / mirePatches 不在內 — 不是 enemy，玩家脈衝/dash 不該打到它們
    this._allSwarmsArr = [this.swarm, this.slingers, this.splitters, this.mites, this.sentinels, this.wraiths,
      this.lancers, this.conduits, this.mires,
      this.boss, this.nexus, this.chronos, this.mu];
    this._allHashesArr = [this.hash, this.slingers.hash, this.splitters.hash, this.mites.hash, this.sentinels.hash, this.wraiths.hash,
      this.lancers.hash, this.conduits.hash, this.mires.hash,
      this.boss.hash, this.nexus.hash, this.chronos.hash, this.mu.hash];

    // W4: Nexus 召喚旗
    this.nexusSpawned = false;
    this.nexusWarningShown = false;

    // W5: Endless / 子彈時間 / 動能逆轉
    this.endlessMode = false;
    this.entropy = 0;
    this._bossLastDeadAt = -999;
    this._nexusLastDeadAt = -999;
    this._chronosLastDeadAt = -999;
    this._bossAlivePrev = false;
    this._nexusAlivePrev = false;

    // W6: Chronos 時間調制
    this.chronosSpawned = false;
    this.chronosWarningShown = false;
    this.chronosTimeMult = 1.0;
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

    // 暫停切換：perk overlay 開啟中（this.paused）或 gameOver 時鎖定，避免吃掉決策狀態
    if (this.input.wasPressed('KeyP') && !this.gameOver && !this.paused) {
      this.userPaused = !this.userPaused;
      if (this.pauseOverlay) this.pauseOverlay.classList.toggle('show', this.userPaused);
      if (this.userPaused) this.audio.suspend();
      else this.audio.resume();
    }

    if (this.gameOver || this.paused || this.userPaused) {
      this.renderer.render(this.scene, this.camera);
      return;
    }

    // 瞬獄雷鳴 Hex Strike 狀態機 — 用真實時間 tick（即使凍結也要持續）
    this._hexStrikeTick(rawDtSec);
    const hexFrozen = (this.hexStrike.state === 'locking' || this.hexStrike.state === 'striking');

    // === 凍結整個世界（包括玩家）— 視覺/音效仍維持流暢 ===
    // 凍結時 rawDtSec / dt / enemyDt 都歸零：玩家無法移動 / dash / pulse / pierce、
    // 敵人停止、生怪暫停、回血暫停、tether 暫停、子彈暫停。
    // 視覺層（shake、chroma、hit-stop 衰減、kick BPM、教學）改用 visualRaw 保持動畫。
    const visualRaw = rawDtSec;
    if (hexFrozen) rawDtSec = 0;

    this.elapsed += rawDtSec;

    // 開局攻擊範圍 ease-in bonus（前 N 秒 +X% 半徑，線性降回 1.0）
    const earlyT = Math.min(1, this.elapsed / CONFIG.heroPulseEarlyRadiusDuration);
    this.perks._earlyRadiusBonus = 1 + CONFIG.heroPulseEarlyRadiusBoost * (1 - earlyT);

    const timeScale = this.effects.hitStopActive ? 0.08 : 1.0;
    const dt = rawDtSec * timeScale;

    // W6: Chronos 時間調制 — Chronos 活著時 enemyDt ×2，hero dash 時 0.5×
    // AoE 重整 2026-05-21：原本 Tether Snap 後也會 calm，現 Snap 已刪除
    let chronosTarget = 1.0;
    if (this.chronos.alive[0]) {
      chronosTarget = CONFIG.chronosAccelMult;
      if (this.hero.dashTimer > 0) {
        chronosTarget = CONFIG.chronosCalmMult;
      }
    }
    this.chronosTimeMult += (chronosTarget - this.chronosTimeMult) * CONFIG.chronosSpeedLerp;
    // W7+ Temporal Hourglass：受傷倍率隨時間流速反向掛鉤
    // chronosTimeMult ∈ [0.5, 2.0] → t ∈ [1.0, 0.0]，再 lerp(min, max, t)
    // 結果：accel 全速時 0.15（85% 免傷），calm bullet-time 時 1.0（解禁）
    {
      const cMin = CONFIG.chronosCalmMult, cMax = CONFIG.chronosAccelMult;
      const t = Math.max(0, Math.min(1, (cMax - this.chronosTimeMult) / (cMax - cMin)));
      this.chronos.damageTakenMult =
        CONFIG.chronosDmgReductionMin + (CONFIG.chronosDmgReductionMax - CONFIG.chronosDmgReductionMin) * t;
    }

    // 最終敵人時間 = dt × chronos（hex 凍結時 dt 已經是 0，敵人自然停下）
    const enemyDt = dt * this.chronosTimeMult;

    // W5: Endless 模式 entropy 增加
    if (this.endlessMode) {
      this.entropy += rawDtSec * CONFIG.endlessEntropyRate;
    }

    // === Hero ===
    // 瞬獄雷鳴啟動中完全跳過 hero.update — 即使 dt=0 也要避免 input.wasPressed 觸發新 dash
    if (!hexFrozen) {
      this.hero.update(dt, this.input);
      if (this.hero.dashJustTriggered) this.audio.playDash();
    }

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
    const bossOnTether = this.boss.isOnTether(this.hero, this.crystal);
    let severed = bossOnTether;
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

    // === 2026-05-21：boss 壓繫帶 → 水晶 DPS + hero chip DPS + 鎖回血 3s ===
    if (bossOnTether) {
      let dmg = CONFIG.bossOnTetherCrystalDps * rawDtSec;
      if (this.perks.shieldHp > 0) {
        const absorbed = Math.min(this.perks.shieldHp, dmg);
        this.perks.shieldHp -= absorbed;
        dmg -= absorbed;
      }
      if (dmg > 0) this.crystal.takeDamage(dmg);
      this.crystal.hitFlash = Math.max(this.crystal.hitFlash, 0.18);
      this.hero.healBlockTimer = Math.max(this.hero.healBlockTimer, CONFIG.heroHealBlockOnBossTether);
      // hero 也吃 chip damage（繞過 iframe，連續 drain；dash 無敵期間免疫）
      if (this.hero.hp > 0 && !this.hero.invulnerable) {
        this.hero.hp = Math.max(0, this.hero.hp - CONFIG.bossOnTetherHeroDps * rawDtSec);
        this.hero.hitFlash = Math.max(this.hero.hitFlash, 0.18);
      }
    }

    this.tether.update(dt);

    // === 繫帶慢回血（2026-05-21）===
    // 條件：繫帶未斷 + 未被 boss 鎖血 + hero 未死
    if (!this.tether.severed && this.hero.healBlockTimer <= 0 && this.hero.hp > 0 && this.hero.hp < this.hero.maxHp) {
      this.hero.heal(CONFIG.heroTetherHealRate * rawDtSec);
    }

    // === Hashes ===
    this.swarm.fillHash(this.hash);

    // === Spawn ===
    this._spawnLogic(rawDtSec);

    // === Enemy update ===
    // W5: enemyDt 給敵人類使用（子彈時間下降速）
    // 2026-05-22 Conduit Buff：場上有任何 Conduit 存活 → 其他怪 × conduitBuffSpeedMult 速度
    // 用 enemyDt 倍率實作 — Conduit 自己也吃一點 buff 但仍然慢，影響可忽略
    const conduitBuff = this.conduits.activeCount > 0 ? CONFIG.conduitBuffSpeedMult : 1;
    const buffedEnemyDt = enemyDt * conduitBuff;

    this.swarm.update(buffedEnemyDt, this.crystal.position.x, this.crystal.position.z, this.hash);
    this.slingers.update(buffedEnemyDt, this.crystal.position.x, this.crystal.position.z, this.bullets, this.audio);
    this.splitters.update(buffedEnemyDt, this.crystal.position.x, this.crystal.position.z);
    this.mites.update(buffedEnemyDt, this.hero.position.x, this.hero.position.z);
    this.sentinels.update(buffedEnemyDt, this.crystal.position.x, this.crystal.position.z);
    this.wraiths.update(buffedEnemyDt, this.hero.position.x, this.hero.position.z);

    // Lancer：返回本幀 charge 撞到 hero 的 lancer index 陣列
    const lancerHeroHits = this.lancers.update(buffedEnemyDt, this.hero.position.x, this.hero.position.z);
    this.conduits.update(enemyDt, this.crystal.position.x, this.crystal.position.z);   // Conduit 不吃自己的 buff
    this.mires.update(buffedEnemyDt, this.crystal.position.x, this.crystal.position.z);

    // Lancer charge 撞 hero → 一次性大傷害（繞過 iframe 但 dash 期間免疫）
    if (lancerHeroHits.length > 0 && !this.hero.invulnerable && this.hero.hp > 0) {
      this.hero.takeDamage(CONFIG.heroTouchDamage);
      this.effects.addTrauma(0.15);
      this.effects.addChroma(0.02);
      this.audio.playTake();
    }

    // Mire 沼澤地形：每幀更新 + 設 hero 減速倍率
    this.mirePatches.update(rawDtSec);
    this.hero.mireSlowFactor = this.mirePatches.isInsideAny(this.hero.position.x, this.hero.position.z)
      ? CONFIG.mireSlowFactor : 0;
    this.boss.update(enemyDt, this.hero, this.crystal);
    this.boss.fillHash();
    // Boss 光束打中 hero
    if (this.boss.consumeBeamHit()) {
      this.hero.takeDamage(CONFIG.heroBeamDamage);
      this.effects.addTrauma(0.10);
      this.effects.addChroma(0.018);
      this.audio.playTake();
    }
    // Boss 光束打中 crystal（如果光束軸線經過水晶半徑）
    if (this.boss.consumeBeamHitCrystal()) {
      this._damageCrystal(CONFIG.bossBeamCrystalDamage);
      this.effects.addTrauma(0.10);
      this.effects.addChroma(0.015);
    }
    // Boss 自爆：對水晶造成大量傷害，hero 若在範圍內吃一半
    if (this.boss.consumeSelfDestruct()) {
      const sdDmg = CONFIG.bossSelfDestructDamage;
      this._damageCrystal(sdDmg);
      this.effects.addTrauma(1.5);
      this.effects.addChroma(0.08);
      this.audio.playTetherSnap();
      const bx = this.boss.position.x, bz = this.boss.position.z;
      this.hero.spawnPulseRing(bx, bz, CONFIG.bossSelfDestructRadius * 2.4, 0xff4422, 1.0);
      const ddx = this.hero.position.x - bx, ddz = this.hero.position.z - bz;
      if (Math.hypot(ddx, ddz) < CONFIG.bossSelfDestructRadius) {
        this.hero.takeDamage(CONFIG.heroBeamDamage);
      }
      // 沿用既有 boss kill 流程：給 souls / XP / 標記 dead 時間
      this._onKill(this.boss, bx, bz);
    }
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
        // 2026-05-21 新血量系統：mites 撞 hero 也扣血（iframe 期間自動吸收）
        this.hero.takeDamage(CONFIG.heroTouchDamage);
      }
    }

    // === 觸怪扣血（leech / slinger / splitter / bosses）===
    this._processHeroTouchDamage();

    // === 英雄脈衝（所有 swarm + W4 perks 參數）===
    const swarms = this._allSwarms();
    const hashes = this._allHashes();
    const pulseHits = this.hero.autoAttack(swarms, hashes);
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
    }

    // === 穿刺劍氣 Pierce（2 秒一道）===
    const pierceHits = this.hero.firePierce(swarms, rawDtSec);
    if (pierceHits && pierceHits.length > 0) {
      this.audio.playHit(0.7);
      this.effects.addTrauma(0.05);
      for (const h of pierceHits) {
        if (!(h.swarm === this.mu && h.swarm.lastHitRejected)) {
          this.effects.spawnDamageNumber(h.x, 0.7, h.z, h.dmg, false);
        }
        if (h.killed) this._onKill(h.swarm, h.x, h.z);
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
        if (h.killed) this._onKill(h.swarm, h.x, h.z);
      }
    }
    this.hero.clearDashTags(this.swarm, this.slingers, this.splitters, this.mites, this.sentinels, this.wraiths,
      this.lancers, this.conduits, this.mires,
      this.boss, this.nexus, this.chronos, this.mu);

    // W5 Kinetic Reversal: Dash 結束製造反相環
    if (this.hero.dashJustEnded && this.perks.kineticReversal) {
      this._triggerKineticReversal();
    }


    // === 怪撞水晶 ===
    const leechHits = this.swarm.collectCrystalHits(this.crystal.position.x, this.crystal.position.z, CONFIG.crystalHitRange);
    const splitterHits = this.splitters.collectCrystalHits(this.crystal.position.x, this.crystal.position.z, CONFIG.crystalHitRange + 0.5);
    const sentinelHits = this.sentinels.collectCrystalHits(this.crystal.position.x, this.crystal.position.z, CONFIG.crystalHitRange + CONFIG.sentinelRadius);
    if (leechHits.length > 0 || splitterHits.length > 0 || sentinelHits.length > 0) {
      const damage = leechHits.length * CONFIG.leechDamage
        + splitterHits.length * CONFIG.splitterDamage
        + sentinelHits.length * CONFIG.sentinelDamage;
      this._damageCrystal(damage);
      const totalHits = leechHits.length + splitterHits.length + sentinelHits.length;
      this.effects.addTrauma(0.08 + totalHits * 0.02);
      this.effects.addChroma(CONFIG.chromaticOnHit);
      this.audio.playCrystalHit();
      for (const i of leechHits) this.swarm.consumeAt(i);
      for (const i of splitterHits) {
        // Splitter 撞水晶死照常觸發爆炸（雙重威脅：撞傷 + 炸傷）
        this.splitters.deathQueue.push({ x: this.splitters.pos[i*3+0], z: this.splitters.pos[i*3+2] });
        this.splitters.consumeAt(i);
      }
      for (const i of sentinelHits) this.sentinels.consumeAt(i);
    }

    // === 子彈 → 水晶（W5: 子彈時間也讓子彈變慢） ===
    const bulletHits = this.bullets.update(enemyDt, this.crystal, this.perks);
    if (bulletHits > 0) {
      const damage = bulletHits * CONFIG.bulletDamage;
      this._damageCrystal(damage);
      this.effects.addTrauma(0.06 + bulletHits * 0.02);
      this.audio.playCrystalHit();
    }

    // === Splitter 死亡 → spawn bombs（2026-05-22 重做：mites → 引信炸彈）===
    const deathPositions = this.splitters.consumeDeathQueue();
    for (const p of deathPositions) {
      this.bombs.spawnFrom(p.x, p.z, CONFIG.splitterBombCount);
    }

    // === Bombs 推進 + 引信到 → 爆炸 AoE 同時對 hero + crystal 結算傷害 ===
    const bombEvents = this.bombs.update(enemyDt, this.perks);
    if (bombEvents.length > 0) this._processBombExplosions(bombEvents);

    // === Sync GPU ===
    this.swarm.syncInstances();
    this.slingers.syncInstances();
    this.splitters.syncInstances(now);
    this.mites.syncInstances(now);
    this.sentinels.syncInstances(now);
    this.wraiths.syncInstances(now);
    this.lancers.syncInstances();
    this.conduits.syncInstances(now);
    this.mires.syncInstances(now);

    // === Souls + 護盾累積 ===
    const arrived = this.tether.updateSouls(dt, this.crystal, this.hero, this.perks, this.swarm, this.hash);
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
    // 視覺/教學 tick — 用 visualRaw 維持凍結期間的流暢動畫
    this.effects.update(visualRaw);
    this.tutorial.tick(visualRaw);
    // W4 + W6: 環境音 + Kick 動態
    const totalEnemies = this.swarm.activeCount + this.slingers.activeCount
      + this.splitters.activeCount + this.mites.activeCount
      + this.sentinels.activeCount + this.wraiths.activeCount
      + this.lancers.activeCount + this.conduits.activeCount + this.mires.activeCount
      + (this.boss.alive[0] ? 1 : 0) + (this.nexus.alive[0] ? 1 : 0)
      + (this.chronos.alive[0] ? 1 : 0);
    this._lastEnemyCount = totalEnemies;
    if (this.audio.ambient) {
      this.audio.ambient.update(
        visualRaw,
        totalEnemies,
        this.boss.alive[0] === 1 || this.nexus.alive[0] === 1 || this.chronos.alive[0] === 1
      );
    }
    if (this.audio.kick) {
      this.audio.kick.update(visualRaw, totalEnemies);
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
      if (this.input.wasPressed('KeyG')) this.sentinels.spawnBurst(2, CONFIG.spawnRingRadiusMin, CONFIG.spawnRingRadiusMax);
      if (this.input.wasPressed('KeyH')) this.wraiths.spawnBurst(5, CONFIG.spawnRingRadiusMin, CONFIG.spawnRingRadiusMax);
      if (this.input.wasPressed('KeyK')) this.lancers.spawnBurst(3, CONFIG.spawnRingRadiusMin, CONFIG.spawnRingRadiusMax);
      if (this.input.wasPressed('KeyL')) this.conduits.spawnBurst(2, CONFIG.spawnRingRadiusMin + 4, CONFIG.spawnRingRadiusMax + 4);
      if (this.input.wasPressed('KeyU')) this.mires.spawnBurst(2, CONFIG.spawnRingRadiusMin, CONFIG.spawnRingRadiusMax);
      if (this.input.wasPressed('KeyJ') && !this.boss.alive[0]) {
        this.boss.spawn(this.crystal);
        this.bossSpawned = true;
        this.tutorial.showCustom('OHM 強制召喚 (debug)', 4);
      }
    }

    this._updateHUD();

    // === 死亡判定 ===（2026-05-22 取消第一局庇護，所有局相同）
    const crystalDead = this.crystal.hp <= 0 && this.perks.shieldHp <= 0;
    const heroDead = this.hero.hp <= 0;
    if ((crystalDead || heroDead) && !this.gameOver) {
      this._endGame();
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
      this.spawnTimer = CONFIG.spawnInterval;
      // W5: 無盡模式提升 spawn target cap
      const baseCap = CONFIG.spawnTargetMax;
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

    // Slinger
    if (this.elapsed >= CONFIG.slingerStartTime) {
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

    // Splitter
    if (this.elapsed >= CONFIG.splitterStartTime) {
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

    // Wraith — 鬼影 blink 騷擾型
    if (this.elapsed >= CONFIG.wraithStartTime) {
      this.wraithSpawnTimer -= rawDt;
      if (this.wraithSpawnTimer <= 0) {
        this.wraithSpawnTimer = CONFIG.wraithSpawnInterval;
        const target = Math.min(
          CONFIG.wraithTargetMax,
          1 + Math.floor((this.elapsed - CONFIG.wraithStartTime) * CONFIG.wraithTargetRamp)
        );
        if (this.wraiths.activeCount < target) {
          this.wraiths.spawnBurst(CONFIG.wraithSpawnBurst, CONFIG.spawnRingRadiusMin + 2, CONFIG.spawnRingRadiusMax);
        }
      }
    }

    // Mites — 獨立 spawn（舊版靠 Splitter 死後產生，現脫鉤）
    if (this.elapsed >= CONFIG.mitesStartTime) {
      this.mitesSpawnTimer -= rawDt;
      if (this.mitesSpawnTimer <= 0) {
        this.mitesSpawnTimer = CONFIG.mitesSpawnInterval;
        const target = Math.min(
          CONFIG.mitesTargetMax,
          CONFIG.mitesSpawnBurst + Math.floor((this.elapsed - CONFIG.mitesStartTime) * CONFIG.mitesTargetRamp)
        );
        if (this.mites.activeCount < target) {
          // mites 群聚感：以一個隨機點為中心爆散
          const a = Math.random() * Math.PI * 2;
          const r = CONFIG.spawnRingRadiusMin + Math.random() * (CONFIG.spawnRingRadiusMax - CONFIG.spawnRingRadiusMin);
          this.mites.spawnFrom(Math.cos(a) * r, Math.sin(a) * r, CONFIG.mitesSpawnBurst);
        }
      }
    }

    // Sentinel — 慢速高 HP tank
    if (this.elapsed >= CONFIG.sentinelStartTime) {
      this.sentinelSpawnTimer -= rawDt;
      if (this.sentinelSpawnTimer <= 0) {
        this.sentinelSpawnTimer = CONFIG.sentinelSpawnInterval;
        const target = Math.min(
          CONFIG.sentinelTargetMax,
          1 + Math.floor((this.elapsed - CONFIG.sentinelStartTime) * CONFIG.sentinelTargetRamp)
        );
        if (this.sentinels.activeCount < target) {
          this.sentinels.spawnBurst(1, CONFIG.spawnRingRadiusMin + 4, CONFIG.spawnRingRadiusMax + 4);
        }
      }
    }

    // Lancer — 蓄力衝刺型
    if (this.elapsed >= CONFIG.lancerStartTime) {
      this.lancerSpawnTimer -= rawDt;
      if (this.lancerSpawnTimer <= 0) {
        this.lancerSpawnTimer = CONFIG.lancerSpawnInterval;
        const target = Math.min(
          CONFIG.lancerTargetMax,
          1 + Math.floor((this.elapsed - CONFIG.lancerStartTime) * CONFIG.lancerTargetRamp)
        );
        if (this.lancers.activeCount < target) {
          this.lancers.spawnBurst(CONFIG.lancerSpawnBurst, CONFIG.spawnRingRadiusMin + 2, CONFIG.spawnRingRadiusMax);
        }
      }
    }

    // Conduit — buff support（數量限制較嚴）
    if (this.elapsed >= CONFIG.conduitStartTime) {
      this.conduitSpawnTimer -= rawDt;
      if (this.conduitSpawnTimer <= 0) {
        this.conduitSpawnTimer = CONFIG.conduitSpawnInterval;
        const target = Math.min(
          CONFIG.conduitTargetMax,
          1 + Math.floor((this.elapsed - CONFIG.conduitStartTime) * CONFIG.conduitTargetRamp)
        );
        if (this.conduits.activeCount < target) {
          this.conduits.spawnBurst(1, CONFIG.spawnRingRadiusMin + 6, CONFIG.spawnRingRadiusMax + 6);
        }
      }
    }

    // Mire — 沼澤地形危險
    if (this.elapsed >= CONFIG.mireStartTime) {
      this.mireSpawnTimer -= rawDt;
      if (this.mireSpawnTimer <= 0) {
        this.mireSpawnTimer = CONFIG.mireSpawnInterval;
        const target = Math.min(
          CONFIG.mireTargetMax,
          1 + Math.floor((this.elapsed - CONFIG.mireStartTime) * CONFIG.mireTargetRamp)
        );
        if (this.mires.activeCount < target) {
          this.mires.spawnBurst(1, CONFIG.spawnRingRadiusMin, CONFIG.spawnRingRadiusMax);
        }
      }
    }

    // Boss Ohm — Gemini Level-Gated Timeline
    // Trigger：level ≥ 15 啟動 15 秒倒數；或絕對時間 fallback（避免完全卡住升等的玩家無 boss 體驗）
    // 不額外鎖 isFirstRun：LV gate 已自我保護新手；舊版鎖 + 自動清存檔會讓無 slot 玩家永遠看不到 boss
    if (!this.bossSpawned && !this.boss.alive[0]) {
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
    if (!this.nexusSpawned && !this.nexus.alive[0] && !this.boss.alive[0]) {
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
    if (!this.muSpawned && !this.mu.alive[0]) {
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
    if (!this.chronosSpawned && !this.chronos.alive[0]) {
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
        this.tutorial.showCustom('CHRONOS 降臨！怪物時間 ×2 — Dash 期間可短暫減速', 13);
        this.effects.addTrauma(0.9);
        this.effects.addChroma(0.04);
        this.audio.playTetherSnap();
        if (this.audio.ambient) this.audio.ambient.bossDrop();
      }
    }
  }

  /** 包裝：hit-stop（W5 bullet-time 在 2026-05-22 重寫後改成被動，不再由此觸發） */
  _impact(hsDur) {
    this.effects.triggerHitStop(hsDur);
  }

  /** 2026-05-21 新血量系統：每幀檢查 hero 與「非 mite」敵人 / boss 觸碰，iframe 期間吸收 */
  _processHeroTouchDamage() {
    if (this.hero.hp <= 0) return;
    if (this.hero.invulnerable) return;
    if (this.hero.damageIframeTimer > 0) return;
    const hx = this.hero.position.x, hz = this.hero.position.z;
    const heroR = CONFIG.heroRadius;
    // [pool, enemyRadius, hash]
    const slingerR = 0.6;
    const pools = [
      [this.swarm, CONFIG.leechRadius, this.hash],
      [this.slingers, slingerR, this.slingers.hash],
      [this.splitters, CONFIG.splitterRadius, this.splitters.hash],
      [this.sentinels, CONFIG.sentinelRadius, this.sentinels.hash],
      [this.wraiths, CONFIG.wraithRadius, this.wraiths.hash],
      // Lancer 不在這 — 它的 charge 期 hit 由 lancers.update() 自行返回；非 charge 不傷 hero（design）
      [this.conduits, CONFIG.conduitRadius, this.conduits.hash],
      [this.mires, CONFIG.mireRadius, this.mires.hash],
      [this.boss, CONFIG.bossRadius, this.boss.hash],
      [this.nexus, CONFIG.nexusRadius, this.nexus.hash],
      [this.chronos, CONFIG.chronosRadius, this.chronos.hash],
      [this.mu, CONFIG.muRadius, this.mu.hash],
    ];
    for (const [pool, eR, hash] of pools) {
      const touchR = heroR + eR;
      const touchR2 = touchR * touchR;
      const ids = hash.queryXZ(hx, hz, touchR);
      for (const i of ids) {
        if (!pool.alive[i]) continue;
        const dx = pool.pos[i*3+0] - hx;
        const dz = pool.pos[i*3+2] - hz;
        if (dx*dx + dz*dz < touchR2) {
          if (this.hero.takeDamage(CONFIG.heroTouchDamage)) {
            // 死亡：交給 _tickInner 末端的死亡判定處理
          }
          this.effects.addTrauma(0.07);
          this.effects.addChroma(0.012);
          this.audio.playTake();
          return; // iframe 已啟動，本幀不再檢查
        }
      }
    }
  }

  /**
   * 2026-05-22：Splitter 炸彈引信到 → AoE 同時對 hero + crystal 結算傷害
   * 視覺：橘紅大環 + trauma + chroma；音效：playTetherSnap（沿用爆炸感）
   */
  _processBombExplosions(events) {
    const radius = CONFIG.splitterBombExplosionRadius;
    const r2 = radius * radius;
    const heroDmg = CONFIG.splitterBombHeroDamage;
    const crystalDmg = CONFIG.splitterBombCrystalDamage;
    const cx = this.crystal.position.x, cz = this.crystal.position.z;
    const hx = this.hero.position.x, hz = this.hero.position.z;

    for (const ev of events) {
      this.hero.spawnPulseRing(ev.x, ev.z, radius, 0xff5522, 0.95);
      this.effects.addTrauma(0.18);
      this.effects.addChroma(0.015);

      // 水晶在爆炸範圍內 → crystal damage
      {
        const dx = cx - ev.x, dz = cz - ev.z;
        if (dx*dx + dz*dz < (radius + CONFIG.crystalRadius) * (radius + CONFIG.crystalRadius)) {
          this._damageCrystal(crystalDmg);
          this.crystal.hitFlash = Math.max(this.crystal.hitFlash, 0.22);
        }
      }

      // Hero 在爆炸範圍內 → hero damage（dash 無敵期間自動吸收於 takeDamage iframe）
      {
        const dx = hx - ev.x, dz = hz - ev.z;
        if (dx*dx + dz*dz < r2) {
          if (this.hero.hp > 0 && !this.hero.invulnerable) {
            this.hero.takeDamage(heroDmg);
            this.effects.addTrauma(0.12);
          }
        }
      }
    }
    this.audio.playTetherSnap();
  }

  /** W5 動能逆轉：環內敵人朝水晶外推 + 立即傷害 50 */
  _triggerKineticReversal() {
    const hx = this.hero.position.x, hz = this.hero.position.z;
    const cx = this.crystal.position.x, cz = this.crystal.position.z;
    const r = CONFIG.kineticReversalRadius;
    const r2 = r * r;
    const dmg = CONFIG.kineticReversalDamage * (this.perks.heroDmgGlobal || 1);

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

  /** ⚡ 瞬獄雷鳴 — 視覺池初始化（在 constructor 呼叫） */
  _initHexStrikeVisuals() {
    this._hexLockMeshes = [];
    this._hexBoltMeshes = [];
    const N = CONFIG.hexStrikeTargetCount;

    // 鎖定環（赤紅雙環）
    const ringGeo = new THREE.RingGeometry(0.55, 0.95, 32);
    ringGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < N; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xff2244,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(ringGeo, mat);
      mesh.position.y = 0.06;
      mesh.visible = false;
      this.scene.add(mesh);
      this._hexLockMeshes.push({ mesh, blink: 0 });
    }

    // 雷柱（從天而降的圓柱）
    const boltGeo = new THREE.CylinderGeometry(0.35, 0.08, 14, 6);
    boltGeo.translate(0, 7, 0);
    for (let i = 0; i < N; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xff3344,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(boltGeo, mat);
      mesh.visible = false;
      this.scene.add(mesh);
      this._hexBoltMeshes.push({ mesh, life: 0, lifeMax: 0.35 });
    }
  }

  /** ⚡ 瞬獄雷鳴 — 每幀狀態機 tick */
  _hexStrikeTick(rawDtSec) {
    const hs = this.hexStrike;
    if (hs.cooldown > 0) hs.cooldown -= rawDtSec;

    if (hs.state === 'idle') {
      if (!this.perks.hexStrikeOverload || hs.cooldown > 0) return;
      // 嘗試觸發：找夠多敵人才動
      const targets = this._findHexStrikeTargets();
      if (targets.length < CONFIG.hexStrikeMinEnemies) return;
      hs.targets = targets;
      for (let i = 0; i < hs.targets.length; i++) {
        hs.targets[i].lockTime = i * CONFIG.hexStrikeLockDelay;
        hs.targets[i].struck = false;
      }
      hs.state = 'locking';
      hs.timer = 0;
      for (const m of this._hexLockMeshes) { m.mesh.visible = false; m.blink = 0; }
      for (const m of this._hexBoltMeshes) m.mesh.visible = false;
      this.audio.playDashHit();   // 進入鎖定的音效（暫用 dash 命中音）
      return;
    }

    if (hs.state === 'locking') {
      hs.timer += rawDtSec;
      for (let i = 0; i < hs.targets.length; i++) {
        const t = hs.targets[i];
        const m = this._hexLockMeshes[i];
        if (hs.timer < t.lockTime) continue;
        if (!m.mesh.visible) {
          m.mesh.position.set(t.x, 0.06, t.z);
          m.mesh.visible = true;
          m.blink = 0;
        }
        m.blink += rawDtSec * 18;
        m.mesh.material.opacity = 0.55 + 0.45 * Math.sin(m.blink);
      }
      if (hs.timer >= CONFIG.hexStrikeLockDuration) {
        hs.state = 'striking';
        hs.timer = 0;
      }
      return;
    }

    if (hs.state === 'striking') {
      hs.timer += rawDtSec;
      for (let i = 0; i < hs.targets.length; i++) {
        const t = hs.targets[i];
        if (t.struck) continue;
        if (hs.timer < i * CONFIG.hexStrikeStrikeInterval) continue;
        this._applyHexStrike(t);
        t.struck = true;
        const bolt = this._hexBoltMeshes[i];
        bolt.mesh.position.set(t.x, 0, t.z);
        bolt.mesh.visible = true;
        bolt.life = bolt.lifeMax;
        this._hexLockMeshes[i].mesh.visible = false;
      }
      // 雷柱衰減
      let anyVisible = false;
      for (const bolt of this._hexBoltMeshes) {
        if (!bolt.mesh.visible) continue;
        bolt.life -= rawDtSec;
        if (bolt.life <= 0) { bolt.mesh.visible = false; continue; }
        bolt.mesh.material.opacity = bolt.life / bolt.lifeMax;
        anyVisible = true;
      }
      const allStruck = hs.targets.every(t => t.struck);
      if (allStruck && !anyVisible) {
        hs.state = 'idle';
        hs.cooldown = CONFIG.hexStrikeCooldown;
        hs.targets = [];
      }
    }
  }

  /** 從所有 swarm 中找 N 個隨機活敵人（不打 boss 主體，避免一秒秒掉） */
  _findHexStrikeTargets() {
    const candidates = [];
    const bossPools = new Set([this.boss, this.nexus, this.chronos, this.mu]);
    for (const sw of this._allSwarmsArr) {
      if (bossPools.has(sw)) continue;
      for (let i = 0; i < sw.maxCount; i++) {
        if (!sw.alive[i]) continue;
        candidates.push({ pool: sw, idx: i, x: sw.pos[i*3+0], z: sw.pos[i*3+2] });
      }
    }
    // Fisher-Yates partial shuffle
    const n = Math.min(CONFIG.hexStrikeTargetCount, candidates.length);
    for (let i = 0; i < n; i++) {
      const j = i + Math.floor(Math.random() * (candidates.length - i));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    return candidates.slice(0, n);
  }

  /** 範圍打擊：以目標位置為圓心，半徑內所有敵人吃同樣傷害 */
  _applyHexStrike(target) {
    const r = CONFIG.hexStrikeRadius;
    const r2 = r * r;
    const dmg = CONFIG.hexStrikeDamage * (this.perks?.heroDmgGlobal || 1);
    for (const sw of this._allSwarmsArr) {
      for (let i = 0; i < sw.maxCount; i++) {
        if (!sw.alive[i]) continue;
        const ex = sw.pos[i*3+0], ez = sw.pos[i*3+2];
        const dx = ex - target.x, dz = ez - target.z;
        if (dx*dx + dz*dz > r2) continue;
        const killed = sw.damage(i, dmg);
        this.effects.spawnDamageNumber(ex, 0.9, ez, dmg, true);
        if (killed) this._onKill(sw, ex, ez);
      }
    }
    this.effects.addTrauma(0.22);
    this.effects.addChroma(0.012);
  }

  _damageCrystal(amount, bypassShield = false) {
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
    // 2026-05-22：移除第一局防守型 perk 加權，所有局選池一致
    // 傳完整 taken 列表（含重複），讓 rollPerkChoices 能正確算 stackable perk 的 maxStacks
    const choices = rollPerkChoices(this.perks.taken, 3, false);
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
    this.ui.kills.textContent = this.kills;
    this.ui.time.textContent = this.elapsed.toFixed(0) + 's';
    const totalEnemies = this.swarm.activeCount + this.slingers.activeCount + this.splitters.activeCount + this.mites.activeCount
      + this.sentinels.activeCount + this.wraiths.activeCount
      + this.lancers.activeCount + this.conduits.activeCount + this.mires.activeCount
      + (this.boss.alive[0] ? 1 : 0);
    this.ui.enemyCount.textContent = totalEnemies;
    this.ui.soulCount.textContent = this.tether.soulCount;
    this.ui.bulletCount.textContent = this.bullets.activeCount;
    this.ui.level.textContent = this.level;
    const xpPct = Math.min(1, this.xp / this.xpToNext);
    this.ui.xpBar.style.width = (xpPct * 100).toFixed(1) + '%';

    // 護盾覆蓋層（2026-05-21 重整）：在水晶 HP 上覆蓋更深紫色 + 右側 ×N 倍率
    // 倍率 = Aegis 護盾層數（aegisStacks 1-5，對應「每次充能 ×N 護盾量」）
    if (this.ui.shieldOverlay && this.ui.shieldMult) {
      const shield = this.perks.shieldHp;
      const stacks = this.perks.aegisStacks || 0;
      if (shield > 0 && stacks > 0) {
        // 覆蓋寬度跟隨 HP 填滿區段（蓋在「目前還活著的 HP」上）
        this.ui.shieldOverlay.style.width = (hpPct * 100).toFixed(1) + '%';
        this.ui.shieldOverlay.classList.add('active');
        this.ui.shieldMult.textContent = `×${stacks}`;
        this.ui.shieldMult.classList.add('active');
      } else {
        this.ui.shieldOverlay.classList.remove('active');
        this.ui.shieldOverlay.style.width = '0%';
        this.ui.shieldMult.classList.remove('active');
      }
    }

    // 英雄獨立 HP 條
    if (this.ui.heroHpBar) {
      const heroPct = Math.max(0, this.hero.hp / this.hero.maxHp);
      this.ui.heroHpBar.style.width = (heroPct * 100).toFixed(1) + '%';
      this.ui.heroHpBar.classList.toggle('low', heroPct < 0.3);
      this.ui.heroHpBar.classList.toggle('blocked', this.hero.healBlockTimer > 0);
    }
    if (this.ui.heroHpText) {
      this.ui.heroHpText.textContent = `${Math.ceil(this.hero.hp)} / ${this.hero.maxHp}`;
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

    for (const sw of [this.swarm, this.slingers, this.splitters, this.mites, this.sentinels, this.wraiths, this.lancers, this.conduits, this.mires]) {
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
      soulDebt: this.perks.soulDebt,
      volatileLoop: this.perks.volatileLoop,
      regicide: this.perks.regicide,
      kineticReversal: this.perks.kineticReversal,
      criticalSuspension: this.perks.criticalSuspension,
      pierce: this.perks.pierce,
      pierceTimer: this.perks.pierceTimer,
      soulVacuum: this.perks.soulVacuum,
      hexStrikeOverload: this.perks.hexStrikeOverload,
      volatilePulseMult: this.perks.volatilePulseMult,
      heroSpeedMult: this.perks.heroSpeedMult,
      dashCooldownMult: this.perks.dashCooldownMult,
      pulseRadiusMult: this.perks.pulseRadiusMult,
      critChanceBonus: this.perks.critChanceBonus,
      heroDmgGlobal: this.perks.heroDmgGlobal,
      aegisStacks: this.perks.aegisStacks,
      shieldHp: this.perks.shieldHp,
    };
    // 全部重設為預設
    this.perks.soulDebt = false;
    this.perks.volatileLoop = false;
    this.perks.regicide = false;
    this.perks.kineticReversal = false;
    this.perks.criticalSuspension = false;
    this.perks.pierce = false;
    this.perks.pierceTimer = 0;
    this.perks.soulVacuum = false;
    this.perks.hexStrikeOverload = false;
    this.perks.volatilePulseMult = 1;
    this.perks.heroSpeedMult = 1.0;
    this.perks.dashCooldownMult = 1.0;
    this.perks.pulseRadiusMult = 1.0;
    this.perks.critChanceBonus = 0;
    this.perks.heroDmgGlobal = 1.0;
    this.perks.aegisStacks = 0;
    this.perks.shieldHp = 0;
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
