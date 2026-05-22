import * as THREE from 'three';
import { Game } from './game.js';
import { hasAnySlot, getSlotSummary, SLOT_COUNT } from './meta.js';
import { parseBotCfg } from './bot.js';
import { showIntro } from './intro.js';

// === Bot 模式：?bot=1 自動跑 + 自動 AI；?headless=1 把 RAF 換成最快的 setTimeout ===
const botCfg = parseBotCfg(location.search);
if (botCfg && botCfg.headless) {
  // headless 模式下強制最快速 RAF，puppeteer 才能跑出有意義的速度
  window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 0);
}

// === 雲端版隱藏 debug 召喚鍵的說明（B/V/C/J/N），這些鍵也只在 localhost game.js 才執行 ===
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '0.0.0.0', '']);
const IS_LOCALHOST = LOCAL_HOSTS.has(location.hostname);
if (!IS_LOCALHOST) {
  for (const el of document.querySelectorAll('.debug-only')) el.style.display = 'none';
}

// === 每次開啟自動清掉「自動存檔」，但保留「手動 slot」===
const RESET_ON_LOAD = true;
if (RESET_ON_LOAD) {
  try {
    localStorage.removeItem('soulDefender_v3');         // 舊版 flat 存檔
    localStorage.removeItem('soulDefender_v4');         // 新版主存檔
    localStorage.removeItem('soulDefender_v4_bak');     // 新版備份
    localStorage.removeItem('soulDefender_mute');       // mute 偏好
    // 不清：soulDefender_slot_1/2/3 + 對應 _bak（手動存檔，玩家自己控制）
  } catch (e) {}
}
if (botCfg) {
  // bot 模式：把全部存檔清空，每次都是新局
  try {
    for (let n = 1; n <= SLOT_COUNT; n++) {
      localStorage.removeItem(`soulDefender_slot_${n}`);
      localStorage.removeItem(`soulDefender_slot_${n}_bak`);
    }
  } catch (e) {}
}

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

function startGame(loadSlotN = null) {
  const game = new Game(renderer, loadSlotN, { bot: botCfg });
  game.start();
  window.addEventListener('resize', () => game.onResize(window.innerWidth, window.innerHeight));
  window.__game = game;
}

// 新遊戲入口：先播世界觀 intro，結束才真正建構 Game
// （讀取 slot 不走這條路 — 老玩家不必再看一次）
function startNewGameWithIntro() {
  showIntro(() => startGame(null));
}

/** 偵測到任一 slot 有存檔 → 顯示 boot menu */
function showBootMenu() {
  const overlay = document.getElementById('boot-menu');
  if (!overlay) { startGame(null); return; }

  // 填 slot 按鈕資訊
  for (let n = 1; n <= SLOT_COUNT; n++) {
    const btn = overlay.querySelector(`[data-slot="${n}"]`);
    if (!btn) continue;
    const info = getSlotSummary(n);
    if (info) {
      const date = info.savedAt ? info.savedAt.slice(0, 10) : '—';
      btn.innerHTML = `<span class="slot-num">SLOT ${n}</span>
        <span class="slot-meta">💠 ${info.souls} · 最佳 ${info.bestKills} kills · LV ${info.bestLevel}</span>
        <span class="slot-date">${date}</span>`;
      btn.removeAttribute('disabled');
      btn.classList.add('has-data');
    } else {
      btn.innerHTML = `<span class="slot-num">SLOT ${n}</span><span class="slot-meta">空</span>`;
      btn.setAttribute('disabled', 'true');
    }
  }

  overlay.classList.add('show');
  overlay.addEventListener('click', (e) => {
    const target = e.target.closest('button');
    if (!target) return;
    const action = target.getAttribute('data-action');
    const slot = target.getAttribute('data-slot');
    if (action === 'new') {
      overlay.classList.remove('show');
      startNewGameWithIntro();
    } else if (slot && !target.hasAttribute('disabled')) {
      overlay.classList.remove('show');
      startGame(parseInt(slot, 10));
    }
  });

  // === Boot Menu 內的 Base64 Import 入口 ===
  const importBtn = document.getElementById('boot-import-btn');
  const importPanel = document.getElementById('boot-import-panel');
  const importText = document.getElementById('boot-import-text');
  const importStatus = document.getElementById('boot-import-status');
  const importConfirm = document.getElementById('boot-import-confirm');
  if (importBtn) {
    importBtn.addEventListener('click', () => {
      importPanel.style.display = importPanel.style.display === 'none' ? 'block' : 'none';
      if (importPanel.style.display !== 'none') importText.focus();
    });
  }
  if (importConfirm) {
    importConfirm.addEventListener('click', async () => {
      const val = importText.value.trim();
      if (!val) {
        importStatus.textContent = '請先貼上 Base64 字串';
        importStatus.className = 'boot-io-status err';
        return;
      }
      const mod = await import('./meta.js');
      const r = mod.importFromBase64(val);
      if (r.ok) {
        importStatus.textContent = '✓ 已寫入 SLOT 1，2 秒後重啟';
        importStatus.className = 'boot-io-status ok';
        setTimeout(() => location.reload(), 2000);
      } else {
        importStatus.textContent = '✗ ' + r.error;
        importStatus.className = 'boot-io-status err';
      }
    });
  }
}

if (botCfg) {
  // bot 模式跳過 boot menu 與 intro，直接開新局
  startGame(null);
} else if (hasAnySlot()) {
  showBootMenu();
} else {
  // 第一次開遊戲，沒有任何 slot → 直接走 intro 路徑
  startNewGameWithIntro();
}
