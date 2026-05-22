// 開場世界觀引導 — 打字機效果 + 右上跳過鍵
// 對外接口：showIntro(onComplete) — overlay 結束（推完或跳過）後呼叫 callback
// 與遊戲完全解耦：在 Game 物件建構前播放，結束才 startGame()

const SCENES = [
  {
    title: '系統終末已近',
    body: '不可逆熵增吞噬世代。光，被一格一格地抹去。',
  },
  {
    title: '最後一道意識',
    body: '你 — 唯一未被腐蝕的靈魂。你被指派守護「核心水晶」。水晶之內封存著本世代所有意識的源碼；它若崩落，一切將歸於無。',
  },
  {
    title: '靈魂繫帶',
    body: '你與水晶之間有一道繫帶。它將你擊殺的靈魂引回水晶，並為你緩慢回血。一旦被崩毀者切斷，回血即止 — 在重新接通前，每一刻都是消耗戰。',
  },
  {
    title: '常數崩毀者降臨',
    body: '熵將以怪潮湧現，並派出四位崩毀者：Ω · Ν · Χ · Μ。每一位都是這宇宙底層常數的崩壞具現。撐住，並擊破他們。',
    foot: '── 你，是靈魂防線。',
  },
];

const TYPE_INTERVAL_MS = 34;       // 中文字打字速度
const FOOT_DELAY_MS = 500;          // body 打完到 foot 出現的延遲
const FADE_OUT_MS = 480;            // 結束時的 fade-out 等待

export function showIntro(onComplete) {
  const overlay = document.getElementById('intro-overlay');
  if (!overlay) { onComplete(); return; }

  const titleEl = document.getElementById('intro-title');
  const bodyEl = document.getElementById('intro-body');
  const footEl = document.getElementById('intro-foot');
  const progressEl = document.getElementById('intro-progress');
  const skipBtn = document.getElementById('intro-skip');

  // 建立進度點
  progressEl.innerHTML = '';
  for (let i = 0; i < SCENES.length; i++) {
    const dot = document.createElement('div');
    dot.className = 'intro-progress-dot';
    progressEl.appendChild(dot);
  }

  let sceneIdx = -1;
  let typingTimer = null;
  let footTimer = null;
  let currentText = '';
  let typingDone = false;
  let finished = false;

  const showScene = (idx) => {
    if (idx >= SCENES.length) { finish(); return; }
    sceneIdx = idx;
    const scene = SCENES[idx];

    progressEl.querySelectorAll('.intro-progress-dot').forEach((d, i) => {
      d.classList.remove('active', 'done');
      if (i < idx) d.classList.add('done');
      else if (i === idx) d.classList.add('active');
    });

    titleEl.textContent = scene.title;
    titleEl.style.animation = 'none';
    void titleEl.offsetWidth;
    titleEl.style.animation = '';

    bodyEl.textContent = '';
    footEl.textContent = '';
    footEl.classList.remove('show');
    currentText = scene.body;
    typingDone = false;

    if (typingTimer) clearInterval(typingTimer);
    if (footTimer) clearTimeout(footTimer);

    let ch = 0;
    typingTimer = setInterval(() => {
      if (ch >= currentText.length) {
        clearInterval(typingTimer);
        typingTimer = null;
        typingDone = true;
        if (scene.foot) {
          footEl.textContent = scene.foot;
          footTimer = setTimeout(() => footEl.classList.add('show'), FOOT_DELAY_MS);
        }
        return;
      }
      bodyEl.textContent += currentText[ch++];
    }, TYPE_INTERVAL_MS);
  };

  const advance = () => {
    if (finished) return;
    if (!typingDone) {
      // 跳到當前場景結尾
      if (typingTimer) clearInterval(typingTimer);
      typingTimer = null;
      bodyEl.textContent = currentText;
      typingDone = true;
      const scene = SCENES[sceneIdx];
      if (scene.foot) {
        footEl.textContent = scene.foot;
        if (footTimer) clearTimeout(footTimer);
        footTimer = setTimeout(() => footEl.classList.add('show'), 80);
      }
      return;
    }
    showScene(sceneIdx + 1);
  };

  const finish = () => {
    if (finished) return;
    finished = true;
    if (typingTimer) clearInterval(typingTimer);
    if (footTimer) clearTimeout(footTimer);
    overlay.classList.add('fading');
    setTimeout(() => {
      overlay.classList.remove('show');
      overlay.classList.remove('fading');
      cleanup();
      onComplete();
    }, FADE_OUT_MS);
  };

  const onKey = (e) => {
    if (e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault();
      advance();
    } else if (e.code === 'Escape') {
      e.preventDefault();
      finish();
    }
  };
  const onOverlayClick = (e) => {
    // 跳過按鈕有獨立 handler，避免冒泡觸發 advance
    if (e.target.closest('#intro-skip')) return;
    advance();
  };
  const onSkip = (e) => {
    e.stopPropagation();
    finish();
  };

  const cleanup = () => {
    window.removeEventListener('keydown', onKey);
    overlay.removeEventListener('click', onOverlayClick);
    skipBtn.removeEventListener('click', onSkip);
  };

  window.addEventListener('keydown', onKey);
  overlay.addEventListener('click', onOverlayClick);
  skipBtn.addEventListener('click', onSkip);

  overlay.classList.add('show');
  showScene(0);
}
