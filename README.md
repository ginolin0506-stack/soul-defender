# 靈魂防線 · Soul Defender

3D 俯視角動作 Roguelite 防守遊戲。純瀏覽器 + Three.js + Vanilla JS，**零外部資產**（無音檔、無模型、無貼圖），所有視覺與音效都用程序化生成。

## 🎮 操作

| 鍵位 | 動作 |
|---|---|
| **WASD** | 移動 |
| **Space** | Dash 衝刺（短暫無敵 + 撞死敵人） |
| **1 / 2 / 3** | 升級時選擇天賦 |
| **R** | 重開 |
| **M** | 靜音 / 取消靜音 |

## 🎯 核心機制

- **Soul Tether（靈魂繫帶）**：英雄與水晶間有可見能量繫帶 — 把擊殺的靈魂引回水晶，並為英雄緩慢回血；被 boss 切斷時停回血。
- **4 個 Boss**：Ohm（切繫帶）/ Nexus（推開繫帶）/ Chronos（加速怪潮）/ Mu（禁用所有 perk）
- **14 個天賦 + 2 個禁忌代碼**：每局升級三選一
- **Endless Mode**：擊破 Nexus 後解鎖灰階熵增模式
- **Terminal 排行榜**：Top 10 by Entropy
- **跨裝置存檔**：Base64 export / import

## 🏃 本地執行

需要 Python 3 或 Node.js。

```
雙擊 start.bat
```

會自動啟動 http://localhost:8080 並開瀏覽器。

## 🛠️ 技術棧

- Three.js（CDN via importmap）
- ES Modules
- Web Audio API（程序化合成）
- localStorage 持久化（含 FNV-1a checksum + 雙重備份）
- Custom Vertex/Fragment Shader（onBeforeCompile 注入 MeshStandardMaterial）

## 📁 專案結構

```
index.html          # 入口 + HUD + CSS
start.bat           # 本地伺服器啟動腳本
src/
  main.js           # 進入點 + boot menu
  game.js           # 主迴圈 orchestrator
  config.js         # 全部數值
  ...
```

## 📦 部署

純靜態網站，可部署到任何 static host：
- Cloudflare Pages（推薦）
- GitHub Pages
- Netlify / Vercel

無 build step 必要。
