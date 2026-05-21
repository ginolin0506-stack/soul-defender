# Soul Defender 平衡測試 — 第一輪結果與修正建議

測試日期：2026-05-21
工具：`tools/balance-sim.mjs`，總計約 50 場 puppeteer 模擬

---

## 數據摘要

| 情境 | runs | 中位存活 | boss 擊殺 | 備註 |
|---|---|---|---|---|
| 早期裸跑 `bonusPerks=0`, 120s cap | 20 | **32.6s** | 0 / 0 | 90% 死於 26-50s |
| 中段 `bonusPerks=4`, 400s cap | 2+ | **≥401s (cap)** | 全活到 boss | 4 perk 就完全翻轉強度 |
| 滿配 `bonusPerks=8`, 900s cap | 5 | **623s** | Ohm 5/5, Nexus 5/5, Chronos 0/5, Mu 0/5 | 全部死在 Nexus 死後幾秒 |

---

## 🔴 BUG-LEVEL：Endless 模式四 boss 同時湧出

**證據**：所有 5 場 bonusPerks=8 的長場測試，bot 都在「殺 Nexus」的**同一秒**死於 Ohm + Chronos + Mu 一起 spawn：

```
run #1: t=653s Nexus kill → t=653s Ohm + Chronos + Mu 全部 spawn
run #2: t=560s Nexus kill → t=560s Ohm + Chronos + Mu 全部 spawn
... (5/5 一模一樣)
```

死亡曲線：8 秒內水晶從 5000+ HP → 0。

**根因**（`src/game.js:198-215`）：

```js
this._bossLastDeadAt = -999;    // 從未死過
this._nexusLastDeadAt = -999;
this._chronosLastDeadAt = -999;
this._muLastDeadAt = -999;
```

進 endless 模式後（`src/game.js:741-769`）：

```js
if (!this.boss.alive[0] && this.elapsed - this._bossLastDeadAt > respawnDelay) {
  // elapsed - (-999) > 30 → 永遠為真，立刻 spawn
```

`-999` 是 sentinel，導致進 endless 的瞬間，**還沒在普通模式出生過**的 Chronos 與 Mu 立即 spawn，加上 Ohm respawn，三 boss 同框。玩家殺完 Nexus 還在喘氣 → 直接被秒。

### ✏️ 建議修正

進入 endless 時把所有 `_lastDeadAt` 重設成當下時間，給玩家正常的冷卻緩衝：

```js
// src/game.js _tickInner，在進入 endless 模式那一段（找 `this.endlessMode = true`）
if (this.endlessMode && !this._endlessStartTime) {
  this._endlessStartTime = this.elapsed;
  // 還沒登場的 boss 用 normal spawn time；已登場的用「剛剛這一瞬」
  if (this._chronosLastDeadAt < 0) this._chronosLastDeadAt = this.elapsed + (CONFIG.chronosSpawnTime - this.elapsed) - CONFIG.endlessBossRespawnDelay;
  if (this._muLastDeadAt < 0) this._muLastDeadAt = this.elapsed + (CONFIG.muSpawnTime - this.elapsed) - 90;
  if (this._bossLastDeadAt < 0) this._bossLastDeadAt = this.elapsed;
  // nexus 剛死，本來就是 elapsed，不用動
}
```

或更簡單：在 endless 條件式加上「上次死過才能 respawn」：

```js
if (this._chronosLastDeadAt > 0 && !this.chronos.alive[0] && ...) { ... }
```

---

## 🟡 HIGH：Ohm 在中後期被秒，缺少威脅感

**證據**：bonusPerks=8 場 5/5 在 7-27s 內擊殺，平均 **13.7s**。
這還是 bot 不會「主動跑」打 boss、只用脈衝清屏的情況。

**原因（推算）**：
- bot 連點 13.7s = ~16 個脈衝 = 16 × ~140 dmg = ~2240 dmg ≈ Ohm 2200 HP
- 每脈衝 140 dmg 來自：base 28 × tether mult 1.7 × regicide 1.5 × echo 1.5 × crit boost ~2.3
- 換句話說，**Ohm 的 HP 比一個正常進度玩家的 16 個脈衝還少**。

### ✏️ 建議修正（任挑一個或組合）

A. **直接拉 HP**：`CONFIG.bossHp: 2200 → 3500`（+59%）
B. **加機制壓力**：bossShockwaveInterval 5.0 → 3.5（震波更頻繁），dmg 55 → 80
C. **後期縮放**：把 regicide 的 boss dmg mult 從 1.5 砍到 1.25（其他 boss 也吃到）

我建議 **A + 弱化 B**：HP 2800 + shockwave interval 4.0。Ohm 應該感覺像 30-45 秒的硬仗，不是 15 秒。

---

## 🟡 HIGH：Nexus 機制可暴力跳過

**證據**：5/5 擊殺，但花了 90-293 秒（中位 ~250s）。
bot **完全不去燒柱**（半徑 18 的柱，bot 守在半徑 5.5 的防守圈內），純打本體吃 5% 傷害（pillarDamageReduction）。
2800 HP / 0.05 / ~10 effective DPS ≈ 200-300s — 對得上。

**機制設計初衷**：必須毀柱才能讓 Nexus 暴露。但 0.05 倍率「太溫柔」，給了不知道機制的玩家「我硬打也能死硬」的選擇。

### ✏️ 建議修正

`CONFIG.nexusPillarDamageReduction: 0.05 → 0.02`（或乾脆 0.01）— 把「3 分鐘暴打」拉長到「10+ 分鐘磨柱前耗死」，逼玩家正確玩機制。
或者反過來：把 `nexusPillarRing` 從 18 縮到 12，讓玩家從正常防守圈就能波及柱子 — 機制門檻降低，新手友善。

---

## 🟢 MED：Aegis Charge 100% 必抓

**證據**：所有「能撐」的場次 aegis_charge 採用率 100%。`bonusPerks=8` 的滿配 build 也是 5/5 開局就堆 aegis。

`aegis_charge` 是 stackable rare，靈魂回流每 6 顆給 35 盾，沒上限。配合 soul_vacuum（靈魂直回水晶）= 無限增益。

實測：bonusPerks=8 場 lvl 61-93、crystal HP 5000-8000，這幾乎都是 aegis 盾 + crystallize 疊出來的。

### ✏️ 建議修正

- **加上限**：aegisStacks cap 5（或 6）— 後期被動回盾還是可怕，但不會線性放大到無限。
- **或加衰減**：盾持續 30 秒沒被打就開始衰減。讓 build 還是強，但不是「無腦堆完事」。

---

## 🟢 MED：早期死亡懸崖（非第一局）

**證據**：bonusPerks=0 + 非第一局，**90% 死於 26-50s**，幾乎都在 slinger 還沒出（35s）、splitter 還沒出（60s）、第一個 perk 還沒升到（lvl 1-3）之前就死於純 leech 海。

中位數 32.6s = 玩家「死亡前 4 秒才剛升完第一個 perk」。

對「已經玩過第一局的回鍋玩家」極其不友善 — 第一局有 +200 HP 與慢 spawn 緩衝，第二局直接全配。

### ✏️ 建議修正

A. **保留弱化版緩衝給非第一局**：前 20 秒 spawn interval × 1.15、crystal +50 HP
B. **改首 perk 邏輯**：每次 run 開局先送一個隨機防守型 perk（aegis / crystallize / bloom 任一），免費。
C. **拉低 leech damage 早期**：前 30 秒 leech dmg × 0.7（之後恢復），給玩家一個「警告，不致命」的窗口。

我建議 **B**：開局即時的選擇感，又給玩家 buffer，且不會永久弱化遊戲。

---

## 🟢 LOW：bot AI 限制（不是遊戲問題，但要記錄）

工具上的限制：
- bot 不會 kite slinger（slinger 在 stopRange 13 開火，bot 守半徑 5.5，被一直打）
- bot 不會主動燒 Nexus 柱
- bot 不會用 tether 穿心打 Mu（所以 Mu 完全無法測）
- bot 不會用 dash 衝撞 boss（dash damage 80 高於 pulse 28）

未來迭代可加進 bot 行為，現在就理解：bot 是「**怪潮防禦**」的良好測試者，不適合測機制 boss。

---

## 推薦修正優先順序

1. **🔴 endless boss 同框 bug** — 真實 bug，必修
2. **🟡 Ohm HP / 機制** — 玩家體驗：第一個 boss 應該有威嚇感，13s 解掉太陽春
3. **🟢 Aegis 加上限** — 後期 build 多樣性問題
4. **🟢 非第一局早期送一個 perk** — 回鍋玩家挫敗感
5. **🟡 Nexus 柱機制門檻** — 看設計傾向再決定

要不要我直接動 config.js 改 #1 + #2 + #3 然後重跑驗證？
