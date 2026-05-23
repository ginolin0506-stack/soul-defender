import { CONFIG } from './config.js';

// === 12 個天賦定義（2026-05-22 大改） ===
// - 移除：fang_lunge、mass_collapse
// - 新增：hex_strike_overload（瞬獄雷鳴）
// - 機制重寫：pierce、soul_vacuum、soul_debt、critical_suspension
// - 數值微調：aegis_charge、regicide、crit_frenzy、swift_step、crystallize

export const PERKS = {
  // ============== 傳奇 Legendary ==============
  hex_strike_overload: {
    id: 'hex_strike_overload',
    name: 'Synaptic Overload: Hex Strike',
    nameCn: '瞬獄雷鳴·六芒鎖定',
    desc: '啟動時時間凍結。準心依序鎖定畫面中血量最高的 6 個目標並閃爍，隨後 6 道赤紅落雷依序轟擊被鎖定的敵人。落雷結束後時間恢復運作。',
    rarity: 'legendary',
    icon: '⚡',
    weight: 0.35,
    apply(g) {
      g.perks.hexStrikeOverload = true;
      g.hexStrike.cooldown = 4.0;   // 拿到就先給個前置 CD，避免一拿到就觸發
    }
  },
  soul_debt: {
    id: 'soul_debt',
    name: 'Soul Debt',
    nameCn: '靈魂透支',
    desc: '擊殺敵人或觸發特定條件時，靈魂飛向玩家並轉化為「星體護盾」環繞自身（上限 6 顆）；環繞期間碰撞敵人造成基礎傷害，3 秒後靈魂回到水晶、效果消失。',
    rarity: 'legendary',
    icon: '🌠',
    weight: 0.45,
    apply(g) { g.perks.soulDebt = true; }
  },
  critical_suspension: {
    id: 'critical_suspension',
    name: 'Critical Suspension',
    nameCn: '臨界滯留',
    desc: '所有飛行物的速度減慢',
    // 2026-05-23 PERKS.md：回到 legendary 等級
    // 雖然只影響 Slinger 子彈與 Splitter 炸彈，但這是目前唯一兩種敵方投射物 → 等同「所有飛行物」
    rarity: 'legendary',
    icon: '⏱️',
    weight: 0.45,
    apply(g) { g.perks.criticalSuspension = true; }
  },

  // ============== 稀有 Rare ==============
  aegis_charge: {
    id: 'aegis_charge',
    name: 'Aegis Charge',
    nameCn: '靈光護甲',
    desc: '每 10 個靈魂回流，水晶獲得護盾（每層 +20 盾，最多 3 層）',
    rarity: 'rare',
    icon: '🛡️',
    weight: 0.75,
    stackable: true,
    maxStacks: 3,
    apply(g) { g.perks.aegisStacks += 1; }
  },
  pierce: {
    id: 'pierce',
    name: 'Pierce',
    nameCn: '穿刺',
    desc: '每兩秒射出一道劍氣，朝最近的敵人發射，路徑上造成傷害',
    rarity: 'rare',
    icon: '⚔️',
    weight: 0.7,
    apply(g) {
      g.perks.pierce = true;
      g.perks.pierceTimer = 0;   // 立刻準備發射
    }
  },
  soul_vacuum: {
    id: 'soul_vacuum',
    name: 'Soul Vacuum',
    nameCn: '靈魂引力',
    desc: '靈魂飛行路徑上會造成範圍緩速',
    rarity: 'rare',
    icon: '🌀',
    weight: 0.75,
    apply(g) { g.perks.soulVacuum = true; }
  },
  regicide: {
    id: 'regicide',
    name: 'Regicide',
    nameCn: '弒君者',
    desc: '對 Boss 傷害 +50%',
    rarity: 'rare',
    icon: '👑',
    weight: 0.75,
    apply(g) { g.perks.regicide = true; }
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

  // ============== 普通 Common ==============
  crit_frenzy: {
    id: 'crit_frenzy',
    name: 'Crit Frenzy',
    nameCn: '狂擊精通',
    desc: '暴擊率 +15%（最多疊 3 層）',
    rarity: 'common',
    icon: '🎯',
    weight: 1.3,
    stackable: true,
    maxStacks: 3,
    apply(g) {
      g.perks.critChanceBonus += 0.15;
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
    desc: '移動速度 +18%、Dash 冷卻 -10%',
    rarity: 'common',
    icon: '👣',
    weight: 1.3,
    stackable: true,
    apply(g) {
      g.perks.heroSpeedMult *= 1.18;
      g.perks.dashCooldownMult *= 0.90;
    }
  },
  crystallize: {
    id: 'crystallize',
    name: 'Crystallize',
    nameCn: '水晶共鳴',
    desc: '水晶最大 HP +250，水晶血量回 250（最多 3 層）',
    rarity: 'common',
    icon: '💎',
    weight: 1.1,
    stackable: true,
    maxStacks: 3,
    apply(g) {
      g.crystal.maxHp += 250;
      g.crystal.hp = Math.min(g.crystal.maxHp, g.crystal.hp + 250);
    }
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
    desc: '脈衝傷害 +150%，但每 10 秒繫帶會自發失控斷裂 1.5 秒（期間水晶停止回血）',
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
// 避免新手首抽拿到 Soul Debt / Hex Strike 這種高操作極端 perk
const FIRST_RUN_BOOST_IDS = new Set([
  'aegis_charge',         // 護盾，純防守
  'crystallize',          // 水晶 +HP，純安全
  'bloom',                // 脈衝範圍，強化清屏
  'swift_step',           // 移速 + dash CD，容錯
  'crit_frenzy',          // 暴擊率，純數值線性 buff
  // 2026-05-23 PERKS.md：critical_suspension 改回 legendary，移出首抽加權清單
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
