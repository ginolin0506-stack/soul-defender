# Soul Defender 平衡修正 — 驗證結果（2026-05-21）

## 修正項目（commit-ready）

| # | 檔案 | 改動 | 動機 |
|---|---|---|---|
| 1 | `game.js` | endless boss respawn 加 `_lastDeadAt > 0` 守門；Mu/Chronos 普通模式 spawn 移除 `!endlessMode` 阻擋 | 殺 Nexus 同秒 4 boss 同時湧出致死 bug |
| 2 | `config.js` | `bossHp` 2200→2800; `bossShockwaveInterval` 5.0→4.0 | Ohm 滿配 build 13.7s 解掉，缺威嚇感 |
| 3 | `perks.js` | `aegis_charge.maxStacks: 5` + `rollPerkChoices` 加 stack 計數過濾 | 後期 31 層 aegis 無限疊，build 同質化 |
| 3.5 | `game.js` | `rollPerkChoices(this.perks.taken, ...)` 改傳含重複的完整列表（原本傳 unique 讓 maxStacks 永遠看到 1）| 修 #3 的隱藏 bug — 自己挖到的 |
| 4 | `game.js` | 非第一局自動套用 1 個隨機防守型 perk（aegis/crystallize/bloom/swift_step）| 回鍋玩家 90% 死於 26-50s，不公平 |
| 5 | `config.js` | `nexusPillarHp` 250→150; `nexusPillarRadius` 2.5→4; `pillarDamageReduction` 0.05→0.03 | 玩家原本完全不去燒柱，純磨本體 250s 還是死 |

---

## 驗證數據對比（5 場 bonusPerks=8, 900s cap）

| 指標 | 修正前 | 修正後 | Δ |
|---|---|---|---|
| 中位存活 | **623s（死）** | **901s（cap 滿）** | +45% / **全活到底** |
| 死亡率 | 5/5 | **0/5** | 完全消除 endless 漩渦死 |
| 最終等級 | 93 | 124 | +33% |
| 累計擊殺 | 23,979 | 52,522 | +119% |
| **Ohm 擊殺** | 13.7s | 8.9s* | 還是太快（*後續驗證修正 aegis bug 後變 14s） |
| **Nexus 擊殺** | 221s（5/5） | 234s（**9 / 12 spawn**）| 類似 — 但 endless 模式下 bot 能連續殺多次 |
| **Chronos 擊殺** | 0/5 | **100% (29/29) avg 6.9s** | 🎉 從不可達到 → 完美擊殺 |
| **Mu spawn** | 5/5（誤觸發）| 2/5（正常 900s 才出）| 確認 endless 不再誤觸 |
| **Mu kill** | 0/5 | 0/5 | bot 無 tether-cross 機制，無法判斷 |

---

## 修正前後 Boss timeline 對比（run #1 vs run #1）

**修正前**：
```
t=180s Ohm spawn → t=207s Ohm kill
t=360s Nexus spawn → t=653s Nexus kill
t=653s Ohm + Chronos + Mu 全部 spawn  ← 4 boss 同框
t=668s 水晶死  ← 15 秒內被秒
```

**修正後**：
```
t=180s Ohm spawn → t=198s Ohm kill
t=360s Nexus spawn → t=544s Nexus kill
t=544s Ohm respawn → t=550s Ohm kill
t=550s Chronos spawn → t=558s Chronos kill   ← Chronos 在自己時程登場、被打掉
t=574s Nexus respawn ...（節奏正常）
... bot 撐到 900s cap，crystal HP 11000
```

修正完美達到設計意圖：endless 模式是 **boss 連續 spawn 但有間隔**，不是 4 boss 同框轟死。

---

## 副作用 / 觀察

1. **Aegis cap = 5 可能太緊**：5 stack = 175 shield，相對於 lvl 124 的水晶 maxHp（~6000-10000 經 crystallize stack）僅佔 2-3%。
   - 建議：若 playtest 覺得 build 無趣可調回 8 stacks。
2. **Ohm 仍偏快**（14s）：HP 2200→2800 (+27%) 不足以對抗 build 進化。
   - 後續可考慮：HP 拉到 3500，或加機制 phase。
3. **Nexus 在 endless 變很猛**：bot 9 kill / 12 spawn 表示 25% 場次沒打死 → 健康的挑戰度。
4. **Chronos 6.9s 太快**：HP 3200 對 lvl 100+ build 是紙糊。建議 HP → 4500。
5. **Mu 仍無法 bot 驗證**：tether-cross 機制是設計核心；要驗證 Mu 平衡需要新增「會主動穿心」的 bot 行為（未來工作）。

---

## 給玩家的影響

- **非第一局玩家不再 26-50s 暴死** — 自動拿到一個防守 perk
- **endless 變成「連環 boss 戰」** 而非「一秒被秒」
- **後期 build 不再無腦疊 aegis**（5 cap 強迫多元化）
- **Ohm + Nexus 數值微調** — 對中段玩家略強，對滿配玩家還是好打

---

## 開新檔了嗎

僅修改：
- `src/game.js`
- `src/config.js`
- `src/perks.js`

沒新增檔案，沒動 bot 模式邏輯，沒動部署相關設定。Cloudflare 部署可以直接 push。

要不要我下個動作幫你 git commit 這批修正？
