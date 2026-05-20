// === Meta 進度系統：localStorage 持久化 + 科技樹解鎖 + 健壯存檔引擎 ===

import { CONFIG } from './config.js';

export const META_NODES = {
  speed_boost: {
    name: '加速結晶',
    desc: '永久 +8% 移動速度',
    cost: 80,
    icon: '⚡',
  },
  hp_boost: {
    name: '結晶強化',
    desc: '開局水晶 +200 最大 HP',
    cost: 120,
    icon: '💎',
  },
  pulse_boost: {
    name: '震波擴張',
    desc: '脈衝半徑永久 +10%',
    cost: 150,
    icon: '🌊',
  },
  dash_boost: {
    name: '迅捷靴',
    desc: 'Dash 冷卻永久 -15%',
    cost: 100,
    icon: '👟',
  },
  starting_perk: {
    name: '靈感火花',
    desc: '開局立刻獲得 1 個隨機 Common 天賦',
    cost: 200,
    icon: '✨',
  },
  soul_gain: {
    name: '靈魂吸收',
    desc: '結算靈魂收益 +25%',
    cost: 250,
    icon: '🌀',
  },
};

const STORAGE_KEY = 'soulDefender_v4';
const STORAGE_KEY_BAK = 'soulDefender_v4_bak';
const SLOT_PREFIX = 'soulDefender_slot_';
const SLOT_BAK_SUFFIX = '_bak';
export const SLOT_COUNT = 3;
const SAVE_VERSION = '1.0.0';

// === FNV-1a 32-bit hash —— 不對抗惡意攻擊，僅偵測 JSON 損毀 ===
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0, n = str.length; i < n; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

// === Base64 UTF-8 安全編解碼 ===
function utf8ToB64(str) {
  return btoa(unescape(encodeURIComponent(str)));
}
function b64ToUtf8(b64) {
  return decodeURIComponent(escape(atob(b64)));
}

/** 把 Meta 狀態打包成標準 schema（不含 checksum）*/
function packMeta(meta) {
  return {
    version: SAVE_VERSION,
    timestamp: Date.now(),
    meta: {
      souls: meta.souls,
      unlocks: [...meta.unlocks],
      runs: meta.runs,
      bestKills: meta.bestKills,
      bestTime: meta.bestTime,
      bestLevel: meta.bestLevel,
      imprintUnlocked: meta.imprintUnlocked,
      imprinted: meta.imprinted,
      forbiddenUnlocked: [...meta.forbiddenUnlocked],
      forbiddenActive: [...meta.forbiddenActive],
      records: meta.records || [],
    },
  };
}

/** 序列化 + 加 checksum（穩定 key order）*/
function serialize(payload) {
  // payload 不含 checksum
  const body = JSON.stringify(payload);
  const checksum = fnv1a(body);
  return JSON.stringify({ ...payload, checksum });
}

/** 反序列化 + checksum 驗證；無 checksum 視為舊版本接受 */
function deserialize(str) {
  const obj = JSON.parse(str);
  if (obj.checksum) {
    const checksum = obj.checksum;
    const payload = {
      version: obj.version,
      timestamp: obj.timestamp,
      meta: obj.meta,
    };
    const actual = fnv1a(JSON.stringify(payload));
    if (actual !== checksum) {
      throw new Error('Checksum mismatch — save 可能被竄改或損毀');
    }
  }
  return obj;
}

/** 把 payload 寫進主存 + 備份；任一失敗都回 false */
function writeWithBackup(mainKey, payload) {
  const serialized = serialize(payload);
  try {
    localStorage.setItem(mainKey, serialized);
    localStorage.setItem(mainKey + SLOT_BAK_SUFFIX, serialized);
    return true;
  } catch (e) {
    console.warn('writeWithBackup failed', e);
    return false;
  }
}

/** 讀主存；若損毀自動 fallback 到備份 */
function readWithFallback(mainKey) {
  // 先試主存
  try {
    const raw = localStorage.getItem(mainKey);
    if (raw) return deserialize(raw);
  } catch (e) {
    console.warn(`[meta] main save corrupt for ${mainKey}:`, e.message);
  }
  // fallback 到備份
  try {
    const bak = localStorage.getItem(mainKey + SLOT_BAK_SUFFIX);
    if (bak) {
      const parsed = deserialize(bak);
      console.log(`[meta] recovered from backup for ${mainKey}`);
      // 順便修主存
      try { localStorage.setItem(mainKey, bak); } catch (e2) {}
      return parsed;
    }
  } catch (e) {
    console.warn(`[meta] backup also corrupt for ${mainKey}:`, e.message);
  }
  return null;
}

/** Slot 純資料 summary（給 boot menu / save UI 用）— 不解 checksum */
export function getSlotSummary(n) {
  try {
    const raw = localStorage.getItem(SLOT_PREFIX + n);
    if (!raw) return null;
    const d = JSON.parse(raw);
    const m = d.meta || d;   // 兼容舊 flat schema
    return {
      souls: m.souls || 0,
      runs: m.runs || 0,
      bestKills: m.bestKills || 0,
      bestTime: m.bestTime || 0,
      bestLevel: m.bestLevel || 0,
      savedAt: d.timestamp ? new Date(d.timestamp).toISOString() : (m.savedAt || ''),
    };
  } catch (e) { return null; }
}

export function hasAnySlot() {
  for (let n = 1; n <= SLOT_COUNT; n++) {
    try {
      if (localStorage.getItem(SLOT_PREFIX + n)) return true;
    } catch (e) {}
  }
  return false;
}

/** Import Base64 — 寫到 slot 1，呼叫端決定要不要 reload */
export function importFromBase64(b64str) {
  if (!b64str || typeof b64str !== 'string') {
    return { ok: false, error: '空字串' };
  }
  let parsed;
  try {
    const json = b64ToUtf8(b64str.trim());
    parsed = deserialize(json);
  } catch (e) {
    return { ok: false, error: 'Base64 解碼失敗或 checksum 不符: ' + e.message };
  }
  // 寫進 slot 1 主存 + bak
  try {
    const reserialized = serialize({
      version: parsed.version || SAVE_VERSION,
      timestamp: parsed.timestamp || Date.now(),
      meta: parsed.meta || {},
    });
    localStorage.setItem(SLOT_PREFIX + 1, reserialized);
    localStorage.setItem(SLOT_PREFIX + 1 + SLOT_BAK_SUFFIX, reserialized);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: '寫入 localStorage 失敗: ' + e.message };
  }
}

export class Meta {
  constructor() {
    this.souls = 0;
    this.unlocks = new Set();
    this.runs = 0;
    this.bestKills = 0;
    this.bestTime = 0;
    this.bestLevel = 0;
    this.lastRunSouls = 0;
    this.imprintUnlocked = false;
    this.imprinted = null;
    this.forbiddenUnlocked = new Set();
    this.forbiddenActive = new Set();
    this.records = [];
    this.load();
  }

  load() {
    // 嘗試讀新 schema（含 backup fallback）
    const obj = readWithFallback(STORAGE_KEY);
    if (obj) {
      this._applyPayload(obj);
      return;
    }
    // 嘗試讀舊 v3 schema (no version, no checksum)
    try {
      const oldRaw = localStorage.getItem('soulDefender_v3');
      if (oldRaw) {
        const d = JSON.parse(oldRaw);
        // 舊版是 flat object
        this._applyFlat(d);
        this.save();   // 升級到 v4
        console.log('[meta] migrated from v3 to v4');
      }
    } catch (e) {
      console.warn('Meta load v3 fallback failed', e);
    }
  }

  /** 內部：套用新 schema payload */
  _applyPayload(obj) {
    const m = obj.meta || {};
    this.souls = m.souls || 0;
    this.unlocks = new Set(m.unlocks || []);
    this.runs = m.runs || 0;
    this.bestKills = m.bestKills || 0;
    this.bestTime = m.bestTime || 0;
    this.bestLevel = m.bestLevel || 0;
    this.imprintUnlocked = !!m.imprintUnlocked;
    this.imprinted = m.imprinted || null;
    this.forbiddenUnlocked = new Set(m.forbiddenUnlocked || []);
    this.forbiddenActive = new Set(m.forbiddenActive || []);
    this.records = m.records || [];
  }

  /** 內部：套用舊版 flat 物件 */
  _applyFlat(d) {
    this.souls = d.souls || 0;
    this.unlocks = new Set(d.unlocks || []);
    this.runs = d.runs || 0;
    this.bestKills = d.bestKills || 0;
    this.bestTime = d.bestTime || 0;
    this.bestLevel = d.bestLevel || 0;
    this.imprintUnlocked = !!d.imprintUnlocked;
    this.imprinted = d.imprinted || null;
    this.forbiddenUnlocked = new Set(d.forbiddenUnlocked || []);
    this.forbiddenActive = new Set(d.forbiddenActive || []);
    this.records = d.records || [];
  }

  save() {
    writeWithBackup(STORAGE_KEY, packMeta(this));
  }

  hasUnlock(id) { return this.unlocks.has(id); }
  canAfford(id) {
    const n = META_NODES[id];
    if (!n) return false;
    return this.souls >= n.cost && !this.hasUnlock(id);
  }

  buy(id) {
    if (!this.canAfford(id)) return false;
    this.souls -= META_NODES[id].cost;
    this.unlocks.add(id);
    this.save();
    return true;
  }

  recordRun({ kills, time, level }) {
    this.runs++;
    this.bestKills = Math.max(this.bestKills, kills);
    this.bestTime = Math.max(this.bestTime, Math.floor(time));
    this.bestLevel = Math.max(this.bestLevel, level);
    let earned = kills;
    if (this.hasUnlock('soul_gain')) earned = Math.floor(earned * 1.25);
    this.souls += earned;
    this.lastRunSouls = earned;
    this.save();
    return earned;
  }

  applyStartingBonuses(perks, crystal) {
    if (this.hasUnlock('speed_boost')) perks.heroSpeedMult *= 1.08;
    if (this.hasUnlock('hp_boost')) {
      crystal.maxHp += 200;
      crystal.hp = crystal.maxHp;
    }
    if (this.hasUnlock('pulse_boost')) perks.pulseRadiusMult *= 1.10;
    if (this.hasUnlock('dash_boost')) perks.dashCooldownMult *= 0.85;
  }

  reset() {
    this.souls = 0;
    this.unlocks.clear();
    this.runs = 0;
    this.bestKills = 0;
    this.bestTime = 0;
    this.bestLevel = 0;
    this.imprintUnlocked = false;
    this.imprinted = null;
    this.forbiddenUnlocked.clear();
    this.forbiddenActive.clear();
    this.records = [];
    this.save();
  }

  // === W6 Imprint API ===
  buyImprintSlot(cost) {
    if (this.imprintUnlocked || this.souls < cost) return false;
    this.souls -= cost;
    this.imprintUnlocked = true;
    this.save();
    return true;
  }
  setImprint(perkId) {
    if (!this.imprintUnlocked) return false;
    this.imprinted = perkId;
    this.save();
    return true;
  }
  clearImprint() {
    this.imprinted = null;
    this.save();
  }

  // === W6 Forbidden API ===
  buyForbidden(id, cost) {
    if (this.forbiddenUnlocked.has(id) || this.souls < cost) return false;
    this.souls -= cost;
    this.forbiddenUnlocked.add(id);
    this.save();
    return true;
  }
  toggleForbidden(id) {
    if (!this.forbiddenUnlocked.has(id)) return false;
    if (this.forbiddenActive.has(id)) this.forbiddenActive.delete(id);
    else this.forbiddenActive.add(id);
    this.save();
    return true;
  }

  // === Slot API（手動存檔 + 健壯持久化）===
  saveToSlot(n) {
    if (n < 1 || n > SLOT_COUNT) return false;
    return writeWithBackup(SLOT_PREFIX + n, packMeta(this));
  }

  loadFromSlot(n) {
    if (n < 1 || n > SLOT_COUNT) return false;
    const obj = readWithFallback(SLOT_PREFIX + n);
    if (obj) {
      this._applyPayload(obj);
      return true;
    }
    // 兼容舊 flat slot
    try {
      const raw = localStorage.getItem(SLOT_PREFIX + n);
      if (raw) {
        const d = JSON.parse(raw);
        if (!d.meta) {   // 舊 flat
          this._applyFlat(d);
          this.saveToSlot(n);   // 升級
          return true;
        }
      }
    } catch (e) {}
    return false;
  }

  deleteSlot(n) {
    try {
      localStorage.removeItem(SLOT_PREFIX + n);
      localStorage.removeItem(SLOT_PREFIX + n + SLOT_BAK_SUFFIX);
      return true;
    } catch (e) { return false; }
  }

  // === Base64 Export — 把當前 meta 編成單一字串給玩家複製 ===
  exportToBase64() {
    const payload = packMeta(this);
    const serialized = serialize(payload);
    return utf8ToB64(serialized);
  }

  // === Terminal API for console（玩家在 F12 也能跑）===
  static __terminalImport(b64) {
    const result = importFromBase64(b64);
    if (result.ok) {
      console.log('[meta] 匯入成功，存到 SLOT 1。請 reload + 在 Boot Menu 選 Slot 1');
    } else {
      console.warn('[meta] 匯入失敗:', result.error);
    }
    return result;
  }
}

// 把 import API 暴露到 window，玩家可在 F12 直接呼叫
if (typeof window !== 'undefined') {
  window.SoulDefenderImport = importFromBase64;
}
