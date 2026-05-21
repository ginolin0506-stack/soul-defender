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
  heroTouchDamage: 12,              // 觸怪一次扣的血量（leech / splitter / mite 共用）
  heroTouchIframe: 0.6,             // 觸怪後無敵時間，避免擠進怪堆秒死
  heroTetherHealRate: 4.0,          // HP / 秒；繫帶未斷且未被 boss 鎖回血時生效
  heroHealBlockOnBossTether: 3.0,   // boss 壓繫帶後鎖回血秒數
  heroBeamDamage: 18,               // boss 光束打中 hero 一次的傷害
  heroPulseInterval: 0.85,
  heroPulseRadius: 4.0,            // base radius（站樁懲罰已由 tetherInnerPenalty 處理）
  // 玩家反饋（2026-05-20 再次）：開局攻擊範圍太小 → 前 30 秒 ease-in bonus
  heroPulseEarlyRadiusBoost: 0.25,    // 開局多 25%（4.0 → 5.0）
  heroPulseEarlyRadiusDuration: 30,   // 線性降回 base 的時間
  heroPulseBaseDamage: 28,         // Gemini Onboarding 修正：+17%（24→28），白字玩家更易清 leech
  heroPulseCritChance: 0.18,
  heroPulseCritMult: 2.2,
  heroDashDistance: 6.5,
  heroDashDuration: 0.16,
  heroDashCooldown: 0.9,           // Gemini Onboarding：1.0→0.9 配合 damage buff 強化白字
  heroDashDamage: 80,
  heroDashRadius: 1.1,

  // === Soul Tether ===
  tetherMaxRange: 18,
  tetherMinRange: 2.0,
  tetherDmgMultMax: 3.0,
  tetherVulnMultMax: 2.0,
  // 玩家反饋：站樁完全沒代價 → 加「水晶旁懲罰區」執行 tether 設計初衷
  tetherInnerPenaltyRange: 3.5,   // 距離 < 此值時 hero damage 打折
  tetherInnerPenaltyMin: 0.45,    // 站樁正中央時的最低倍率
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
  slingerStartTime: 35,    // 玩家反饋：太早出現，改成 35s 才出

  // === Splitter（分裂怪） ===
  maxSplitters: 40,
  splitterSpeed: 2.0,
  splitterHp: 180,
  splitterDamage: 22,
  splitterRadius: 0.95,
  splitterXp: 12,
  splitterStartTime: 60,    // 配合 slinger 延後，splitter 更晚
  splitterSpawnInterval: 3.5,
  splitterSpawnTargetBase: 1,
  splitterSpawnTargetRamp: 0.05,
  splitterSpawnTargetMax: 8,

  // === Mites（分裂怪死後產生的小蟲） ===
  maxMites: 256,
  mitesPerSplitter: 3,
  mitesSpeed: 5.6,
  mitesHp: 12,
  mitesRadius: 0.22,
  mitesXp: 1,
  mitesPushForce: 1.4,         // 撞到英雄推幾單位（朝水晶方向）

  // === Boss Ohm（2026-05-21 完全重設計：光束 + 順移切繫帶 + 自爆狂暴）===
  bossSpawnLevel: 15,
  bossWarningLead: 15,
  bossSpawnTime: 180,                  // fallback
  bossHp: 2800,
  bossRadius: 1.9,
  bossOrbitRadius: 13,
  bossSeverRadius: 2.0,                // boss 到「hero-crystal 線段」垂直距離 < 此值 = 壓繫帶
  bossOrbitSpeedP0: 0.18,              // 三階段都繞圈（P2 改為衝刺），保留 P0/P1 軌道速度
  bossOrbitSpeedP1: 0.30,
  bossXp: 80,
  bossKillSouls: 25,

  // P0/P1/P2 HP 閾值（新）
  bossPhase1HpRatio: 0.50,             // < 50% 進入 P1（加上順移）
  bossBerserkHpRatio: 0.20,            // < 20% 進入狂暴（自爆衝刺）

  // 壓繫帶懲罰（所有階段共用）
  bossOnTetherCrystalDps: 35,          // boss 在繫帶上時對水晶的 DPS
  // heroHealBlockOnBossTether 已在 hero 區塊（共用）

  // P0+ 光束
  bossBeamInterval: 1.0,               // 每 1 秒一發
  bossBeamTelegraph: 0.4,              // 紅色預警時間
  bossBeamActive: 0.18,                // 主光束持續時間
  bossBeamWidth: 0.7,                  // 主光束半寬度
  bossBeamMaxRange: 35,
  // bossBeamDamage 用 heroBeamDamage（hero 區塊）

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
  regicideBossDmgMult: 1.5,
  regicideDashCdMult: 0.7,
  regicideLifestealPct: 0.01,
  spatialFoldingDistance: 16,     // tether 距離超過這個就觸發
  spatialFoldingMult: 2.0,
  massCollapseSpeedMult: 0.8,
  massCollapseStandTime: 1.5,
  massCollapseRadius: 8,
  massCollapseCrystalDmgReduction: 0.25,
  // Gemini 2026-05-21 Soul Debt 重構：「動態延遲回流」
  // 原本 5s 攔截 → 改 3s 半衰期，過載釋放微脈衝後沿 tether 2× 速衝回水晶
  // 解決「靈魂在英雄旁繞圈，水晶沒充能而暴斃」的卡池內鬼問題
  soulDebtOrbitTime: 3.0,
  soulDebtOrbitRadius: 2.2,
  soulDebtDmgPerSoul: 0.03,
  soulDebtMaxOrbit: 30,
  soulDebtReturnSpeedMult: 2.0,       // 軌道結束後沿 tether 衝回水晶的速度倍率
  soulDebtMicroPulseDmgMult: 0.3,     // 過載釋放：以 hero 正常脈衝傷害的 30% 觸發 AOE
  soulDebtMicroPulseRadiusMult: 0.6,  // 半徑 60%

  // === W5 時間軸天賦 ===
  criticalSuspensionDuration: 0.6,   // hit-stop 觸發後子彈時間總時長（含 hit-stop）
  criticalSuspensionEnemyScale: 0.18, // 子彈時間內怪物速度倍率
  kineticReversalRadius: 8,
  kineticReversalForce: 24,           // 推力強度
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
  volatileSnapBonus: 4.0,             // tetherSnapDamage * (1+4) 倍率
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
  // Gemini 2026-05-21 Lone Wolf 重構：「張力補償」雙模式
  // 解決原本「3+ 敵人 ×1」讓 bot 強、真人後期擠在水晶旁倍率歸零的相剋問題
  // 外圈：距離 > 15 線性加成；困獸：距離 < 10 + 密度 > 150 強制 +40% 倍率
  loneWolfDistanceTrigger: 15,        // 距離大於這個值起開始線性加成
  loneWolfDistanceCap: 30,            // 線性加成到頂的距離
  loneWolfDistanceMaxMult: 2.0,       // 在 cap 距離時的最大倍率
  loneWolfInnerDistance: 10,          // 困獸模式：距離小於這個才偵測密度
  loneWolfDensityRadius: 5,           // 困獸密度偵測半徑
  loneWolfDensityThreshold: 150,      // 密度門檻
  loneWolfTrappedMult: 1.4,           // 困獸觸發的暴擊加成倍率
  aegisSoulsPerShield: 6,
  aegisShieldPerStack: 35,
  echoPulseDelay: 0.32,
  echoPulseDamageMult: 0.5,
  tetherSnapDamage: 140,
  tetherSnapRadius: 1.7,

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
