// === 靈魂防線 全部數值集中地 ===

export const CONFIG = {
  // === 世界 ===
  groundSize: 100,
  fogNear: 30,
  fogFar: 75,
  bgColor: 0x08081a,

  // === 水晶 ===
  crystalHp: 1000,
  crystalRadius: 1.2,
  crystalHitRange: 1.8,
  crystalHealPerSoul: 1,
  bulletDamage: 18,

  // === 英雄 ===
  heroSpeed: 9.5,
  heroRadius: 0.55,
  // 英雄獨立血量系統（2026-05-21 設計重做）
  // 玩家觸怪會扣血，繫帶連著時慢回；hero HP → 0 = Game Over（與水晶 HP 並列死亡條件）
  heroMaxHp: 100,
  // 2026-05-22 平衡：站樁無代價（單次傷害 3s 即回滿）→ heal 4→1.5、觸怪 12→18
  // 連續觸怪 DPS 20→30，扣回血淨 28.5 HP/s = 3.5s 死；單次傷害需 12s 才回滿
  heroTouchDamage: 18,              // 觸怪一次扣的血量（leech / splitter / mite 共用）
  heroTouchIframe: 0.6,             // 觸怪後無敵時間，避免擠進怪堆秒死
  heroTetherHealRate: 1.5,          // HP / 秒；繫帶未斷且未被 boss 鎖回血時生效
  heroHealBlockOnBossTether: 3.0,   // boss 壓繫帶後鎖回血秒數
  heroBeamDamage: 18,               // boss 光束打中 hero 一次的傷害
  heroPulseInterval: 0.85,
  heroPulseRadius: 4.0,            // base radius
  // 玩家反饋（2026-05-20 再次）：開局攻擊範圍太小 → 前 30 秒 ease-in bonus
  // AoE 重整 2026-05-21：bonus 從 0.25 降到 0.12，避免開局 + Bloom 疊加成超大清屏
  heroPulseEarlyRadiusBoost: 0.12,
  heroPulseEarlyRadiusDuration: 30,
  heroPulseBaseDamage: 37,         // 2026-05-22：定錨 Leech HP × 2/3（55 × 0.667 ≈ 36.67 → 37），2 發殺 leech
  heroPulseCritChance: 0.18,
  heroPulseCritMult: 2.2,
  heroDashDistance: 6.5,
  heroDashDuration: 0.16,
  // 2026-05-22 平衡：開局 dash 過強（DPS ≈ 89、一擊秒 leech）逼退脈衝定位
  // 改為「位移工具」走向 — damage / CD 砍、knockback 倍增
  heroDashCooldown: 1.5,
  heroDashDamage: 45,
  heroDashRadius: 1.1,
  heroDashKnockback: 28,           // 配 leechKnockbackRecover 5.5 → 位移 ≈ 5.1u（脈衝 4 → 0.7u）

  // === Soul Tether ===
  // 視覺管道；不再附帶距離倍率（已移除「離越遠傷害越高」機制）
  tetherTubeRadius: 0.22,
  tetherSegments: 36,
  tetherRadialSegs: 8,

  // === Leech ===
  maxEnemies: 1500,
  leechSpeed: 3.4,
  leechHp: 55,
  leechDamage: 14,
  leechRadius: 0.42,
  leechSeparationRadius: 0.85,
  leechSeparationStrength: 0.7,
  leechKnockbackRecover: 5.5,
  leechXp: 3,

  // === Slinger ===
  maxSlingers: 80,
  slingerSpeed: 2.6,
  slingerHp: 32,
  slingerStopRange: 13,
  slingerChargeTime: 0.55,
  slingerFireInterval: 2.2,
  slingerSeparationRadius: 1.8,
  slingerXp: 7,
  slingerStartTime: 30,    // 2026-05-22：搭配新怪變化，提前到 30s

  // === Splitter（炸彈衝刺怪，2026-05-22 重設計）===
  // 機制：高速衝向水晶（leech 之上），HP 低，死亡 / 撞水晶時拋出 3 顆炸彈
  // 炸彈飛行 → 引信到 → AoE 同時對 hero 與 crystal 造成傷害（兩段威脅）
  maxSplitters: 40,
  splitterSpeed: 6.6,          // 高速衝刺（leech 3.4 × 1.94）→ 玩家必須優先處理
  splitterHp: 90,              // 從 180 砍半 — 高速 trade-off，較好點掉
  splitterDamage: 28,          // 撞水晶傷害提高，補償血量降低
  splitterRadius: 0.85,
  splitterXp: 14,
  splitterStartTime: 50,    // 2026-05-22：和其他類型錯開，提前 10s
  splitterSpawnInterval: 3.5,
  splitterSpawnTargetBase: 1,
  splitterSpawnTargetRamp: 0.05,
  splitterSpawnTargetMax: 8,

  // === Splitter Bomb（死亡 / 撞水晶時拋出 3 顆）===
  maxSplitterBombs: 96,
  splitterBombCount: 3,
  splitterBombSpeed: 7.2,           // 初速（線性減速）
  splitterBombDecel: 5.5,           // 減速度 u/s²，會在 ~1.3s 完全停下
  splitterBombFuse: 1.2,            // 引信時間（秒）
  splitterBombRadius: 0.28,         // 視覺 / 飛行碰撞半徑
  splitterBombExplosionRadius: 2.8, // 爆炸 AoE 半徑
  splitterBombHeroDamage: 22,       // 玩家被炸一發扣的血
  splitterBombCrystalDamage: 30,    // 水晶被炸一發扣的血

  // === Mites（小蟲，2026-05-22：脫離 Splitter，獨立 spawn）===
  // 原為 Splitter 死後產物，現改為類似 Slinger 的獨立 ramp schedule
  maxMites: 256,
  mitesSpeed: 5.6,
  mitesHp: 12,
  mitesRadius: 0.22,
  mitesXp: 1,
  mitesPushForce: 1.4,         // 撞到英雄推幾單位（朝水晶方向）
  mitesStartTime: 70,          // 2026-05-22：提前到 70s 讓同框變化更早
  mitesSpawnInterval: 5.0,
  mitesSpawnBurst: 4,          // 一波 4 隻（小蟲群聚感）
  mitesTargetMax: 32,
  mitesTargetRamp: 0.15,

  // === Sentinel（哨衛 — 慢速高 HP tank，2026-05-22 新增）===
  // 設計：玩家必須投入時間 + 多次脈衝才能擊破，否則撞水晶就是一大坨傷害
  maxSentinels: 16,
  sentinelSpeed: 1.6,
  sentinelHp: 480,
  sentinelDamage: 55,          // 撞水晶傷害（高，但數量稀少）
  sentinelRadius: 1.3,
  sentinelXp: 28,
  sentinelStartTime: 95,       // 2026-05-22：提前 25s
  sentinelSpawnInterval: 12,
  sentinelTargetMax: 4,
  sentinelTargetRamp: 0.015,

  // === Wraith（鬼影 — 短距 blink 騷擾型，2026-05-22 新增）===
  // 設計：平時緩慢漂移，每 N 秒朝 hero 瞬移；逼玩家保持移動 + 視野警覺
  maxWraiths: 40,
  wraithDriftSpeed: 1.4,       // 平時漂移速度（明顯比 leech 慢）
  wraithBlinkInterval: 2.8,    // 兩次 blink 之間的冷卻
  wraithBlinkDistance: 4.8,    // 朝 hero 方向瞬移距離
  wraithBlinkTelegraph: 0.45,  // blink 前的視覺預警時間（給玩家反應）
  wraithHp: 26,
  wraithRadius: 0.4,
  wraithXp: 8,
  wraithStartTime: 55,         // 2026-05-22：提前 25s
  wraithSpawnInterval: 6.0,
  wraithSpawnBurst: 1,
  wraithTargetMax: 8,
  wraithTargetRamp: 0.06,

  // === Lancer（突刺兵 — 蓄力後直線衝刺，2026-05-22 新增）===
  // 設計：走→蓄力（紅線預警）→ 直線衝刺 12u → 冷卻；玩家需 dash 預判躲開
  maxLancers: 32,
  lancerWalkSpeed: 2.8,
  lancerHp: 60,
  lancerRadius: 0.5,
  lancerXp: 9,
  lancerWindupDuration: 0.6,    // 蓄力時間（紅色預警線）
  lancerChargeSpeed: 16,        // 衝刺中的瞬間速度
  lancerChargeDuration: 0.45,   // 衝刺持續時間（× speed ≈ 7.2u 位移）
  lancerCooldown: 1.8,          // 衝完之後的冷卻
  lancerWalkRange: 14,          // 進入此距離開始考慮蓄力（外圍不蓄）
  lancerStartTime: 40,
  lancerSpawnInterval: 5.0,
  lancerSpawnBurst: 1,
  lancerTargetMax: 6,
  lancerTargetRamp: 0.04,

  // === Conduit（導體 — Buff support，2026-05-22 新增）===
  // 設計：慢漂、低 HP，但活著時所有其他怪 +25% 速度。優先擊破不然其他怪變猛
  maxConduits: 8,
  conduitSpeed: 1.5,
  conduitHp: 75,
  conduitRadius: 0.55,
  conduitXp: 18,
  conduitBuffSpeedMult: 1.25,   // 活著時其他怪的速度倍率
  conduitAuraRadius: 6,          // 視覺光環（不影響邏輯，目前 buff 是全圖）
  conduitStartTime: 75,
  conduitSpawnInterval: 14,
  conduitTargetMax: 3,
  conduitTargetRamp: 0.012,

  // === Mire（沼 — 走路掉落減速地形，2026-05-22 新增）===
  // 設計：sluggish 中型怪，每 N 秒在腳下生成減速 patch；hero 走進 patch 速度 -40%
  maxMires: 16,
  mireSpeed: 2.0,
  mireHp: 110,
  mireRadius: 0.7,
  mireXp: 14,
  mirePatchDropInterval: 1.5,
  mirePatchLifetime: 6.0,
  mirePatchRadius: 1.4,
  mireSlowFactor: 0.4,           // hero 在 patch 內 movement × (1 - 0.4) = 60%
  maxMirePatches: 96,
  mireStartTime: 110,
  mireSpawnInterval: 9,
  mireTargetMax: 5,
  mireTargetRamp: 0.025,

  // === Boss Ohm（2026-05-21 完全重設計：光束 + 順移切繫帶 + 自爆狂暴）===
  bossSpawnLevel: 15,
  bossWarningLead: 15,
  bossSpawnTime: 180,                  // fallback
  bossHp: 2800,
  bossRadius: 1.9,
  bossOrbitRadius: 13,
  bossSeverRadius: 2.0,                // boss 到「hero-crystal 線段」垂直距離 < 此值 = 壓繫帶
  // 角度追蹤速率（2026-05-21 重整：拋棄定速繞圓，改為一直往最靠近玩家的軌道點移動）
  // hero 最大切向角速度 ≈ heroSpeed / orbitRadius = 9.5/13 ≈ 0.73 rad/s
  // P0 略低於該值 → 玩家會被慢慢追上；P1 高於該值 → 玩家無法純切向跑掉
  bossOrbitSpeedP0: 0.6,
  bossOrbitSpeedP1: 1.0,
  bossXp: 80,
  bossKillSouls: 25,

  // P0/P1/P2 HP 閾值（新）
  bossPhase1HpRatio: 0.50,             // < 50% 進入 P1（加上順移）
  bossBerserkHpRatio: 0.20,            // < 20% 進入狂暴（自爆衝刺）

  // 壓繫帶懲罰（所有階段共用）
  bossOnTetherCrystalDps: 35,          // boss 在繫帶上時對水晶的 DPS
  bossOnTetherHeroDps: 12,             // 同時對 hero 的 chip DPS（繞過 iframe）
  // heroHealBlockOnBossTether 已在 hero 區塊（共用）

  // P0+ 光束
  bossBeamInterval: 1.0,               // 每 1 秒一發
  bossBeamTelegraph: 0.4,              // 紅色預警時間
  bossBeamActive: 0.18,                // 主光束持續時間
  bossBeamWidth: 0.7,                  // 主光束半寬度
  bossBeamMaxRange: 35,
  // bossBeamDamage 用 heroBeamDamage（hero 區塊）
  bossBeamCrystalDamage: 22,           // 光束打到水晶時的傷害（水晶 HP 池大故略高於 hero 18）

  // P1+ 順移
  bossTeleportInterval: 3.0,
  bossTeleportAnimDuration: 1.0,       // 動畫時長，期間 boss 位置 = 原位（可被閃避）
  bossTeleportBehindDistance: 4.0,     // 順移到 hero 後方距離（hero-from-crystal 延長線上）

  // P2 狂暴自爆
  bossBerserkSpeedMult: 0.5,           // × heroSpeed = 4.75 u/s
  bossSelfDestructDamage: 500,         // 撞到水晶造成的傷害（水晶上限 1000 → 一次掉一半）
  bossSelfDestructRadius: 2.5,         // hero 在此範圍內也吃殘餘衝擊波（× 0.5 傷害）

  // === Boss Nexus (W4) ===
  nexusSpawnLevel: 40,           // Gemini Level-Gated：LV40 觸發倒數
  nexusSpawnTime: 360,           // fallback
  nexusWarningLead: 12,
  nexusHp: 2800,
  nexusRadius: 2.2,
  nexusFieldRadius: 16,           // 斥力場半徑（外緣到水晶距離）
  nexusPushStrength: 22,          // 推力強度
  nexusPillarRing: 18,            // pillars 環繞水晶半徑（保留：在斥力場外、玩家被推出後容易到達）
  // 平衡測試 2026-05-21：玩家原本 100% 純磨本體 250s 都不去燒柱（5% 減傷不夠痛）
  // pillarHp 250→150 + pillarRadius 2.5→4：玩家路過 4 單位內就燒，2.5s/柱 → 7.5s 燒完全部
  // 鼓勵玩家短暫離開水晶燒柱再回防，而不是死磨本體
  nexusPillarHp: 150,
  nexusPillarRadius: 4,           // 玩家進入這個半徑才會燒柱
  nexusPillarBurnRate: 60,        // HP/sec
  nexusPillarDamageReduction: 0.03, // pillars 全活時 Nexus 本體吃 3% 傷害（原 0.05 → 0.03，硬磨變更慢）
  nexusXp: 120,
  nexusKillSouls: 35,

  // === W4 新 perks 數值 ===
  // 弒君者 Regicide（2026-05-22 簡化：移除 Dash CD bonus / Dash 偷血）
  regicideBossDmgMult: 1.5,

  // 靈魂透支 Soul Debt（2026-05-22 重構：星體護盾碰撞傷害，上限 6）
  soulDebtOrbitTime: 3.0,
  soulDebtOrbitRadius: 2.2,
  soulDebtMaxOrbit: 6,                 // 20 → 6（變成貼身護盾不是 dps engine）
  soulDebtReturnSpeedMult: 2.0,
  soulDebtOrbitDamageRadius: 0.7,      // 環繞靈魂的「碰撞範圍」
  soulDebtOrbitDamageDPS: 35,          // 每秒對範圍內敵人造成的傷害
  soulDebtOrbitTickInterval: 0.2,      // DOT 結算間隔（避免每 frame 都算）

  // === W5 時間軸天賦 ===
  // 臨界滯留 Critical Suspension（2026-05-22 重寫：被動讓所有飛行物減速）
  criticalSuspensionProjMult: 0.5,    // 持有時敵方飛行物速度倍率
  kineticReversalRadius: 8,
  kineticReversalForce: 24,           // 推力強度
  kineticReversalDamage: 14,          // 2026-05-22：定錨 Leech HP × 1/4（55 × 0.25 ≈ 13.75 → 14），純控場非清屏
  kineticReversalDebuffDuration: 2.0, // 被擊退敵人 2 秒內吃額外 50% 傷害
  kineticReversalDebuffMult: 1.5,

  // === W5 無盡熵增 ===
  endlessEntropyRate: 0.06,
  endlessBossRespawnDelay: 30,
  endlessSpawnRampMult: 2.2,
  endlessMaxEnemies: 2500,

  // === W6 Boss Chronos ===
  chronosSpawnLevel: 60,              // Gemini Level-Gated：LV60 觸發倒數
  chronosSpawnTime: 540,              // fallback
  chronosWarningLead: 12,
  chronosHp: 3200,
  chronosRadius: 1.6,
  chronosOrbitRadius: 11,
  chronosOrbitSpeed: 0.5,
  chronosAccelMult: 2.0,              // 怪物時間流速 ×2（hero 不受影響）
  chronosCalmMult: 0.5,               // hero dash / snap 期間怪物降速
  chronosCalmDuration: 1.0,           // snap 後保持 calm 多久
  chronosXp: 130,
  chronosKillSouls: 40,
  chronosSpeedLerp: 0.08,              // 平滑度
  // 平衡 2026-05-21 Counter-build：Chronos Temporal Hourglass
  // 受傷倍率 = lerp(min, max, (chronosTimeMult-0.5)/1.5)
  // - chronosTimeMult=2.0（怪潮全速）→ 倍率 0.15（85% 免傷，逼玩家觸發 bullet-time）
  // - chronosTimeMult=0.5（dash/snap calm）→ 倍率 1.0（解禁，全力輸出黃金窗口）
  // 0.15 (85% 免傷) 對 bot 太兇導致 wall timeout；0.3 (70% 免傷) 仍迫使玩家管理 dash 節奏但 bot 可測
  chronosDmgReductionMin: 0.3,
  chronosDmgReductionMax: 1.0,

  // === W6 Meta 擴張 ===
  metaImprintSlotCost: 800,           // 一次性解鎖「烙印」功能
  metaForbiddenUnlockCost: 600,       // 每個禁忌代碼解鎖成本

  // === W6 禁忌代碼數值 ===
  glassDmgMult: 2.0,
  glassCrystalHpMult: 0.5,
  // AoE 重整 2026-05-21：Tether Snap 刪除後 Volatile Loop 改掛 +150% 脈衝傷害
  volatilePulseBonus: 1.5,
  volatileSelfSeverInterval: 10,
  volatileSelfSeverDuration: 1.5,

  // === W6 程序化大鼓 ===
  kickMinBpm: 60,                     // 100 隻怪以下的基線
  kickMaxBpm: 140,                    // 滿載狀態
  kickDensityCap: 1500,               // 怪物數量達這個就是滿密度

  // === W7 終局 Boss Mu ===
  muSpawnLevel: 80,                   // Gemini Level-Gated：LV80 觸發倒數
  muSpawnTime: 900,                   // fallback
  muWarningLead: 15,
  muHp: 3500,                         // Core HP
  muRadius: 2.0,
  muTetherCrossRadius: 2.4,           // tether 線段在這距離內視為穿過 Mu
  muOrbitRadius: 9,                   // 比其他 boss 近，逼玩家近距離
  muOrbitSpeed: 0.18,
  muXp: 200,
  muKillSouls: 80,

  // === W7 Terminal 排行榜 ===
  leaderboardMaxEntries: 10,

  // === W7 Vertex Glitch ===
  glitchDecayRate: 4.5,               // 每秒衰減速率
  glitchMaxAmount: 0.25,

  // === Bullets ===
  maxBullets: 256,
  bulletSpeed: 13,
  bulletLife: 4.0,
  bulletRadius: 0.18,

  // === 生怪節奏 ===
  spawnInterval: 0.18,
  spawnBurstBase: 2,           // 玩家反饋：開局太多怪，每波 burst 從 3 降到 2
  spawnBurstRamp: 0.02,
  spawnTargetBase: 12,         // 玩家反饋：開局壓力過大，從 80 降到 12
  earlyRampDuration: 30,       // 前 30 秒 spawn ramp 用 quadratic ease-in，慢慢回到原本曲線
  spawnTargetRamp: 8,
  spawnTargetMax: 1100,
  spawnRingRadiusMin: 24,
  spawnRingRadiusMax: 32,

  slingerSpawnInterval: 4.0,
  slingerSpawnBurst: 1,
  slingerTargetMax: 12,
  slingerTargetRamp: 0.1,

  // === Souls ===
  maxSouls: 512,
  soulSpeed: 14,

  // === 空間雜湊 ===
  hashCell: 1.6,

  // === 打擊感 ===
  hitStopDuration: 0.06,
  shakeTraumaMax: 1.0,
  shakeDecay: 1.6,
  shakeAmplitude: 0.35,
  chromaticOnHit: 0.012,

  // === XP / Level ===
  xpBase: 12,                   // Gemini Onboarding：18→12，首級 XP 34→28 (~10 隻 leech 升)
  xpRamp: 12,
  xpExponent: 1.18,

  // === 天賦 ===
  // 靈光護甲 Aegis Charge（2026-05-22：6→10、+35→+20、5 層→3 層）
  aegisSoulsPerShield: 10,
  aegisShieldPerStack: 20,

  // === 2026-05-22 機制重寫 ===
  // 穿刺 Pierce：每 N 秒對最近敵人發射一道劍氣，沿線段造成傷害
  pierceInterval: 2.0,
  pierceDamage: 32,         // 約等於兩次脈衝傷害
  pierceRange: 14,          // 劍氣總長度
  pierceWidth: 0.6,         // 劍氣命中半徑（線到敵人距離）
  pierceLifetime: 0.18,     // 視覺殘留時間
  // 靈魂引力 Soul Vacuum：靈魂飛行時對周圍敵人施加緩速
  soulVacuumSlowRadius: 1.8,
  soulVacuumSlowMult: 0.5,
  soulVacuumSlowDuration: 0.6,
  // 瞬獄雷鳴 Hex Strike Overload：CD 自動觸發，凍結時間 → 鎖定 6 目標 → 6 道紅雷
  hexStrikeCooldown: 15.0,
  hexStrikeMinEnemies: 3,
  hexStrikeTargetCount: 6,
  hexStrikeLockDuration: 1.2,   // 鎖定動畫總時長
  hexStrikeLockDelay: 0.18,     // 每個鎖定環依序出現的間隔
  hexStrikeStrikeInterval: 0.16,// 雷擊間隔
  hexStrikeDamage: 600,         // 單發傷害（足以一擊清掉非 boss）
  hexStrikeRadius: 1.6,         // 雷擊命中半徑（範圍打擊周邊敵人）

  // === 第一局保護 ===
  firstRunEnemyCap: 55,
  firstRunCrystalBonus: 200,
  // Gemini Onboarding：前 45s spawn interval ×1.25（生怪頻率降 20%），45s 後恢復
  firstWaveSlowDuration: 45,
  firstWaveIntervalMult: 1.25,
  // Gemini Onboarding：第一局卡池對「範圍/防守型」加權
  firstRunPerkBoostMult: 2.5,

  // === Meta 結算 ===
  soulsPerKill: 1,

  // === 場景 ===
  platformCount: 6,
};
