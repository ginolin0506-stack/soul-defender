import { CONFIG } from './config.js';

// === 9 個天賦定義 ===
// 4 個有獨特邏輯（active flag），其餘是純數值加成（stat mod）

export const PERKS = {
  fang_lunge: {
    id: 'fang_lunge',
    name: 'Fang Lunge',
    nameCn: '狼牙突刺',
    desc: 'Dash 直接命中敵人 → 該敵人被「狼牙印記」標記 3 秒，下一次脈衝對它造成 ×3.0 傷害（對小怪沒用，是 boss 殺手）',
    rarity: 'legendary',
    icon: '🗡️',
    weight: 0.45,
    apply(g) { g.perks.fangLunge = true; }
  },
  lone_wolf: {
    id: 'lone_wolf',
    name: 'Lone Wolf',
    nameCn: '孤狼',
    desc: '繫帶 > 15 時線性 ×1→×2 傷害；被擠在水晶旁 (<10) 且周圍 150+ 怪則強制 ×1.4 困獸暴擊',
    rarity: 'rare',
    icon: '🐺',
    weight: 0.75,
    apply(g) { g.perks.loneWolf = true; }
  },
  aegis_charge: {
    id: 'aegis_charge',
    name: 'Aegis Charge',
    nameCn: '靈光護甲',
    desc: '每 6 個靈魂回流，水晶獲得護盾（每層 +35 盾，最多 5 層）',
    rarity: 'rare',
    icon: '🛡️',
    weight: 0.75,
    stackable: true,
    maxStacks: 5,           // 平衡測試 2026-05-21：原本無限疊讓後期 build 同質化，全部都是 aegis 牆
    apply(g) { g.perks.aegisStacks += 1; }
  },
  pierce: {
    id: 'pierce',
    name: 'Pierce',
    nameCn: '穿刺',
    desc: '脈衝傷害 +60%，但脈衝間隔 +0.4 秒（0.85 → 1.25s）。對 boss 單體 DPS 提升，對清屏沒有優勢。',
    rarity: 'rare',
    icon: '⚔️',
    weight: 0.7,
    apply(g) { g.perks.pierce = true; }
  },
  // === 純數值加成 ===
  crit_frenzy: {
    id: 'crit_frenzy',
    name: 'Crit Frenzy',
    nameCn: '狂擊精通',
    desc: '暴擊率 +15%，暴擊倍率 +0.4×（最多疊 3 層）',
    rarity: 'common',
    icon: '🎯',
    weight: 1.3,
    stackable: true,
    maxStacks: 3,
    apply(g) {
      g.perks.critChanceBonus += 0.15;
      g.perks.critMultBonus += 0.4;
    }
  },
  bloom: {
    id: 'bloom',
    name: 'Bloom',
    nameCn: '盛綻',
    desc: '脈衝半徑 +15%（最多疊 3 層）',
    rarity: 'common',
    icon: '🌸',
    weight: 1.3,
    stackable: true,
    maxStacks: 3,
    apply(g) { g.perks.pulseRadiusMult *= 1.15; }
  },
  swift_step: {
    id: 'swift_step',
    name: 'Swift Step',
    nameCn: '輕步',
    desc: '移動速度 +18%、Dash 冷卻 -25%',
    rarity: 'common',
    icon: '👣',
    weight: 1.3,
    stackable: true,
    apply(g) {
      g.perks.heroSpeedMult *= 1.18;
      g.perks.dashCooldownMult *= 0.75;
    }
  },
  crystallize: {
    id: 'crystallize',
    name: 'Crystallize',
    nameCn: '水晶共鳴',
    desc: '水晶最大 HP +250，並立刻回滿',
    rarity: 'common',
    icon: '💎',
    weight: 1.1,
    stackable: true,
    apply(g) {
      g.crystal.maxHp += 250;
      g.crystal.hp = g.crystal.maxHp;
    }
  },
  soul_vacuum: {
    id: 'soul_vacuum',
    name: 'Soul Vacuum',
    nameCn: '靈魂引力',
    desc: '靈魂飛行速度 +60%，跳過英雄直接回流水晶',
    rarity: 'rare',
    icon: '🌀',
    weight: 0.75,
    apply(g) {
      g.perks.soulSpeedMult *= 1.6;
      g.perks.soulSkipHero = true;
    }
  },
  // === W4 新增 ===
  regicide: {
    id: 'regicide',
    name: 'Regicide',
    nameCn: '弒君者',
    desc: '對 Boss 傷害 +50%；Boss 出現時 Dash CD -30%；Dash 穿越 Boss 偷 1% HP 治療水晶',
    rarity: 'rare',
    icon: '👑',
    weight: 0.75,
    apply(g) { g.perks.regicide = true; }
  },
  spatial_folding: {
    id: 'spatial_folding',
    name: 'Spatial Folding',
    nameCn: '空間折疊',
    desc: '繫帶距離 ≥ 16 時，脈衝對場上 HP 最高目標造成 ×1.5 傷害（自動鎖王）',
    rarity: 'legendary',
    icon: '🌌',
    weight: 0.45,
    apply(g) { g.perks.spatialFolding = true; }
  },
  mass_collapse: {
    id: 'mass_collapse',
    name: 'Mass Collapse',
    nameCn: '質量崩塌',
    desc: '移速 -20%；靜止 1.5 秒後生成重力場（半徑 8）吸 Mites + 水晶受傷 -25%',
    rarity: 'rare',
    icon: '🕳️',
    weight: 0.75,
    apply(g) {
      g.perks.massCollapse = true;
      g.perks.heroSpeedMult *= 0.8;
    }
  },
  soul_debt: {
    id: 'soul_debt',
    name: 'Soul Debt',
    nameCn: '靈魂透支',
    desc: '靈魂飛到英雄軌道 3 秒（每顆 +1.5% 傷害，上限 20 顆）；過載釋放微脈衝後 2× 速衝回水晶',
    rarity: 'legendary',
    icon: '🌠',
    weight: 0.45,
    apply(g) { g.perks.soulDebt = true; }
  },
  // === W5 時間軸 ===
  critical_suspension: {
    id: 'critical_suspension',
    name: 'Critical Suspension',
    nameCn: '臨界滯留',
    desc: '所有 Hit-stop 觸發 0.6 秒「子彈時間」— 怪物速度降至 18%、英雄全速',
    rarity: 'legendary',
    icon: '⏱️',
    weight: 0.45,
    apply(g) { g.perks.criticalSuspension = true; }
  },
  kinetic_reversal: {
    id: 'kinetic_reversal',
    name: 'Kinetic Reversal',
    nameCn: '動能逆轉',
    desc: 'Dash 結束時製造 8u 反相環 — 環內敵人朝水晶外被擊退 + 吃 2 秒 +50% 增傷 debuff',
    rarity: 'rare',
    icon: '🔃',
    weight: 0.75,
    apply(g) { g.perks.kineticReversal = true; }
  },
};

// === W6 禁忌代碼（高風險高回報，從 Meta 面板手動開啟） ===
export const FORBIDDEN_PERKS = {
  glass_prism: {
    id: 'glass_prism',
    name: 'Glass Prism',
    nameCn: '玻璃稜鏡',
    desc: '英雄全傷害 ×2.0，但水晶最大 HP 強制 -50%',
    icon: '🔆',
    isForbidden: true,
    applyStart(g, CONFIG) {
      g.perks.heroDmgGlobal *= CONFIG.glassDmgMult;
      g.crystal.maxHp = Math.max(100, Math.floor(g.crystal.maxHp * CONFIG.glassCrystalHpMult));
      g.crystal.hp = g.crystal.maxHp;
    }
  },
  volatile_loop: {
    id: 'volatile_loop',
    name: 'Volatile Loop',
    nameCn: '不穩定迴路',
    desc: '脈衝傷害 +150%，但每 10 秒繫帶會自發失控斷裂 1.5 秒（期間倍率歸 1）',
    icon: '⚠️',
    isForbidden: true,
    applyStart(g, CONFIG) {
      g.perks.volatileLoop = true;
      g.perks.volatilePulseMult = (g.perks.volatilePulseMult || 1) * (1 + CONFIG.volatilePulseBonus);
    }
  },
};

const ALL_IDS = Object.keys(PERKS);

// Gemini Onboarding：第一局卡池對「範圍 / 防守 / 安全型」加權
// 避免新手首抽拿到 Fang Lunge / Soul Debt 這種高操作極端 perk
const FIRST_RUN_BOOST_IDS = new Set([
  'aegis_charge',   // 護盾，純防守
  'crystallize',    // 水晶 +HP，純安全
  'bloom',          // 脈衝範圍 +25%，強化清屏
  'swift_step',     // 移速 + dash CD，容錯
  'crit_frenzy',    // 暴擊，純數值線性 buff
]);

/**
 * 隨機選 N 個天賦（依 rarity 權重抽取，避免重複，除非 stackable）
 * @param isFirstRun 第一局時對防守/範圍 perk 加權
 */
export function rollPerkChoices(takenIds, count = 3, isFirstRun = false) {
  const result = [];
  const pool = [];
  for (const id of ALL_IDS) {
    const p = PERKS[id];
    if (!p.stackable && takenIds.includes(id)) continue;
    // maxStacks: 已疊到上限的可堆 perk 不再出現在卡池
    if (p.stackable && p.maxStacks) {
      const stacks = takenIds.reduce((n, t) => n + (t === id ? 1 : 0), 0);
      if (stacks >= p.maxStacks) continue;
    }
    pool.push(p);
  }
  if (pool.length === 0) return [];

  // 算「有效權重」— 第一局時，列在 FIRST_RUN_BOOST_IDS 的 perk weight 倍乘
  const effectiveWeight = (p) => {
    const boost = (isFirstRun && FIRST_RUN_BOOST_IDS.has(p.id)) ? CONFIG.firstRunPerkBoostMult : 1;
    return p.weight * boost;
  };

  for (let n = 0; n < count && pool.length > 0; n++) {
    const totalW = pool.reduce((s, p) => s + effectiveWeight(p), 0);
    let r = Math.random() * totalW;
    let picked = pool[0];
    let pickedIdx = 0;
    for (let i = 0; i < pool.length; i++) {
      r -= effectiveWeight(pool[i]);
      if (r <= 0) { picked = pool[i]; pickedIdx = i; break; }
    }
    result.push(picked);
    pool.splice(pickedIdx, 1);
  }
  return result;
}

/**
 * Level N → 升下一級所需 XP
 * 用平方根曲線，越後面越長但不過分爆
 * B13: 改用 CONFIG，使 dead config 變成 live config，方便調參
 */
export function getXpForLevel(level) {
  return Math.floor(CONFIG.xpBase + level * CONFIG.xpRamp + Math.pow(level, CONFIG.xpExponent) * 4);
}

export function rarityColor(rarity) {
  return {
    legendary: '#ffae00',
    rare: '#66b4ff',
    common: '#c8c8d8',
  }[rarity] || '#fff';
}
