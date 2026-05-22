# 靈魂防線 — 天賦清單（PERKS）

> 這份檔案對應 `src/perks.js`，請直接編輯本檔案的數值/描述/旗標，我會依你的修改更新原始碼。
>
> 每個欄位的意義：
> - **id**：程式內部識別碼（請勿亂改，改名會影響存檔與感應條件）
> - **rarity**：`legendary` / `rare` / `common`
> - **weight**：抽卡權重（傳奇預設 0.45、稀有 0.75、普通 1.1–1.3）
> - **stackable**：是否可重複抽到
> - **maxStacks**：堆疊上限（無此欄＝無上限）
> - **icon**：HUD 已獲得天賦欄顯示的圖示
> - **desc**：升級三選一畫面顯示給玩家的描述

---

## 🟧 傳奇 Legendary

⚡ 瞬獄雷鳴·六芒鎖定 Synaptic Overload: Hex Strike
id: hex_strike_overload

rarity: legendary

weight: 0.35

icon: ⚡

desc: 啟動時時間凍結。準心依序鎖定畫面中隨機 6 個目標的頭部並閃爍，隨後 6 道赤紅落雷依序轟擊被鎖定的敵人。落雷結束後時間恢復運作。

🌠 靈魂透支 Soul Debt
id: soul_debt

rarity: legendary

weight: 0.45

icon: 🌠

desc:
擊殺敵人或觸發特定條件時，靈魂將飛向玩家並轉化為「星體護盾」環繞自身（上限 6 顆）
靈魂環繞期間，碰撞到敵人會造成基礎傷害，環繞 3 秒後，靈魂回到水晶，效果也消失

### ⏱️ 臨界滯留 Critical Suspension
- **id**: `critical_suspension`
- **rarity**: legendary
- **weight**: 0.45
- **icon**: ⏱️
- **desc**: 所有飛行物的速度減慢

---

## 🟦 稀有 Rare

### 🛡️ 靈光護甲 Aegis Charge
- **id**: `aegis_charge`
- **rarity**: rare
- **weight**: 0.75
- **stackable**: true
- **maxStacks**: 5
- **icon**: 🛡️
- **desc**: 每 10個靈魂回流，水晶獲得護盾（每層 +20 盾，最多 3層）

### ⚔️ 穿刺 Pierce
- **id**: `pierce`
- **rarity**: rare
- **weight**: 0.7
- **icon**: ⚔️
- **desc**: 每兩秒射出一道劍氣，朝最近的敵人發射，路徑上造成傷害

### 🌀 靈魂引力 Soul Vacuum
- **id**: `soul_vacuum`
- **rarity**: rare
- **weight**: 0.75
- **icon**: 🌀
- **desc**: 靈魂飛行的路徑上，會造成範圍緩速

### 👑 弒君者 Regicide
- **id**: `regicide`
- **rarity**: rare
- **weight**: 0.75
- **icon**: 👑
- **desc**: 對 Boss 傷害 +50%

### 🔃 動能逆轉 Kinetic Reversal
- **id**: `kinetic_reversal`
- **rarity**: rare
- **weight**: 0.75
- **icon**: 🔃
- **desc**: Dash 結束時製造 8u 反相環 — 環內敵人朝水晶外被擊退 + 吃 2 秒 +50% 增傷 debuff

---

## ⬜ 普通 Common

### 🎯 狂擊精通 Crit Frenzy
- **id**: `crit_frenzy`
- **rarity**: common
- **weight**: 1.3
- **stackable**: true
- **maxStacks**: 3
- **icon**: 🎯
- **desc**: 暴擊率 +15%（最多疊 3 層）

### 🌸 盛綻 Bloom
- **id**: `bloom`
- **rarity**: common
- **weight**: 1.3
- **stackable**: true
- **maxStacks**: 3
- **icon**: 🌸
- **desc**: 脈衝半徑 +15%（最多疊 3 層）

### 👣 輕步 Swift Step
- **id**: `swift_step`
- **rarity**: common
- **weight**: 1.3
- **stackable**: true
- **icon**: 👣
- **desc**: 移動速度 +18%、Dash 冷卻 -10%

### 💎 水晶共鳴 Crystallize
- **id**: `crystallize`
- **rarity**: common
- **weight**: 1.1
- **stackable**: true
- **icon**: 💎
- **desc**: 水晶最大 HP +250，水晶血量回250(最多3層)

---

## 🚫 禁忌代碼 Forbidden Codes

> 不會出現在升級三選一卡池。需要在 Meta 面板手動啟用，整局生效。屬於高風險高回報設計。

### 🔆 玻璃稜鏡 Glass Prism
- **id**: `glass_prism`
- **isForbidden**: true
- **icon**: 🔆
- **desc**: 英雄全傷害 ×2.0，但水晶最大 HP 強制 -50%

### ⚠️ 不穩定迴路 Volatile Loop
- **id**: `volatile_loop`
- **isForbidden**: true
- **icon**: ⚠️
- **desc**: 脈衝傷害 +150%，但每 10 秒繫帶會自發失控斷裂 1.5 秒（期間水晶停止回血）

---

## 第一局新手加權 First-Run Boost

第一局時，以下 5 個「範圍/防守/安全型」天賦的抽中權重會乘以 `CONFIG.firstRunPerkBoostMult`，避免新手首抽拿到高操作極端 perk：

- 🛡️ `aegis_charge` 靈光護甲
- 💎 `crystallize` 水晶共鳴
- 🌸 `bloom` 盛綻
- 👣 `swift_step` 輕步
- 🎯 `crit_frenzy` 狂擊精通

---

## 統計

| 類別 | 數量 |
|---|---|
| 傳奇 Legendary | 3 |
| 稀有 Rare | 5 |
| 普通 Common | 4 |
| **常規天賦小計** | **12** |
| 禁忌代碼 Forbidden | 2 |
| **總計** | **14** |
