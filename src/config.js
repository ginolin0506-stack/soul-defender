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

  // === Boss Ohm ===
  bossSpawnTime: 180,
  bossWarningLead: 10,
  // Bot 平衡測試 2026-05-21：滿配 build 平均 13.7s 解掉 Ohm，缺乏威嚇感
  // HP 2200 → 2800 (+27%)、震波 5.0s → 4.0s（更頻繁壓力）
  bossHp: 2800,
  bossRadius: 1.9,
  bossOrbitRadius: 13,
  bossSeverRadius: 2.0,
  bossOrbitSpeedP0: 0.12,
  bossOrbitSpeedP1: 0.26,
  bossOrbitSpeedP2: 0.45,
  bossShockwaveInterval: 4.0,
  bossShockwaveSpeed: 13,
  bossShockwaveMaxRadius: 16,
  bossShockwaveDamage: 55,
  bossXp: 80,
  bossKillSouls: 25,
  // 平衡 2026-05-21 Counter-build：Ohm Phase 3 Overload Resonance
  // 進入 phase 2（< 35% HP，閾值原 0.25 提前）時，把吃到的 pulse 傷害 50% 儲存
  // 每 2 秒沿 tether 把儲存值化為「連鎖閃電」打水晶 → 強迫高頻 build 暫停輸出
  bossPhase2HpRatio: 0.35,
  // P2 進入後：傷害「分流」— storePct 的比例變成 charge meter，其餘 (1-storePct) 才扣 HP
  // 等於 P2 時 Ohm 取得「軟性免傷」+「鏡像回打水晶」，延長戰鬥讓 discharge 有時間發
  // 之前是純疊加（不削 HP），導致 Ohm 在 4s 內死光，discharge 還沒 fire 過
  bossOverloadStorePct: 0.6,
  bossOverloadDischargeInterval: 1.5,  // 縮短間隔，P2 期間 fire 2-3 次
  bossOverloadDischargeMult: 1.0,
  bossOverloadBypassShield: true,      // discharge 沿 tether 直接打水晶，繞過 aegis 盾

  // === Boss Nexus (W4) ===
  nexusSpawnTime: 360,
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
  soulDebtOrbitTime: 5.0,
  soulDebtOrbitRadius: 2.2,
  soulDebtDmgPerSoul: 0.03,
  soulDebtMaxOrbit: 30,

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
  chronosSpawnTime: 540,              // 正常模式 9 分鐘登場
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
  muSpawnTime: 900,                   // 15 分鐘登場
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
