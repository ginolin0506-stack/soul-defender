// 2026-05-23 裝置判定 + 兩套運行 profile（桌面 / 手機）
// 開啟遊戲時只判定一次。輸出 DEVICE_PROFILE 給 renderer / Input / HUD 文案 / 光照使用。
//
// 偵測優先序：
//   1. URL override：?device=mobile / ?device=desktop（測試用）
//   2. matchMedia(pointer:coarse)+(hover:none)：主要訊號 — 主輸入是手指且不能 hover
//   3. UA 包含 mobile 關鍵字：老瀏覽器 fallback
//   4. 都沒中 → desktop

function detect() {
  // === URL override（測試用）===
  try {
    if (typeof location !== 'undefined') {
      const p = new URLSearchParams(location.search).get('device');
      if (p === 'mobile')  return { isMobile: true,  source: 'url' };
      if (p === 'desktop') return { isMobile: false, source: 'url' };
    }
  } catch (e) {}

  // === Media Query：主輸入是手指 + 不能 hover ===
  if (typeof window !== 'undefined' && window.matchMedia) {
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const noHover = window.matchMedia('(hover: none)').matches;
    if (coarse && noHover) return { isMobile: true, source: 'media' };
  }

  // === UA fallback ===
  const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
  if (/iPhone|iPad|iPod|Android|Mobile|BlackBerry|IEMobile|Opera Mini/i.test(ua)) {
    return { isMobile: true, source: 'ua' };
  }

  return { isMobile: false, source: 'desktop' };
}

const det = detect();

export const DEVICE = {
  isMobile: det.isMobile,
  source: det.source,                              // 'url' | 'media' | 'ua' | 'desktop'
  devicePixelRatio: (typeof window !== 'undefined' && window.devicePixelRatio) || 1,
  userAgent: (typeof navigator !== 'undefined' && navigator.userAgent) || '',
};

// === 兩套 profile === ////////////////////////////////////////////////
const MOBILE_PROFILE = {
  label: 'mobile',
  renderer: {
    antialias: false,                              // 手機 fragment 預算緊 → 關 MSAA
    shadowsEnabled: false,                         // 2048×2048 shadow map 是手機 GPU 殺手
    pixelRatio: Math.min(DEVICE.devicePixelRatio, 1.5),
    toneMappingExposure: 1.05,
  },
  input: {
    mode: 'touch',                                 // 手機：左半虛擬搖桿 + 右半 tap dash
    deadZone: 0.45,                                // （桌面 mouse-follow 才會用到，留著沒影響）
  },
  hud: {
    helpHtml: '👆 左半螢幕拖移 = 搖桿移動　👆 右半螢幕點擊 = 衝刺<br><span>輕點卡片選天賦</span>',
    tutorialStart: '左半螢幕拖移控制方向（虛擬搖桿），右半螢幕點擊衝刺。撞到怪會扣自己血量（繫帶連著時慢回血）；水晶或英雄任一血量歸零都算結束。',
  },
};

const DESKTOP_PROFILE = {
  label: 'desktop',
  renderer: {
    antialias: true,
    shadowsEnabled: true,
    pixelRatio: Math.min(DEVICE.devicePixelRatio, 2),
    toneMappingExposure: 1.05,
  },
  input: {
    mode: 'mouse',                                 // 桌面：mouse-follow + left-click dash
    deadZone: 0.45,
  },
  hud: {
    helpHtml: '🖱️ 鼠標位置 = 自動移動　🖱️ 左鍵 = 衝刺<br><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> 升級選天賦',
    tutorialStart: '鼠標位置 → 英雄自動移動；左鍵 → 衝刺。撞到怪會扣自己血量（繫帶連著時慢回血）；水晶或英雄任一血量歸零都算結束。',
  },
};

export const DEVICE_PROFILE = DEVICE.isMobile ? MOBILE_PROFILE : DESKTOP_PROFILE;

// 印一行給開發者確認
try {
  console.log(`[device] ${DEVICE_PROFILE.label} (source=${DEVICE.source}, dpr=${DEVICE.devicePixelRatio}) → AA=${DEVICE_PROFILE.renderer.antialias} shadows=${DEVICE_PROFILE.renderer.shadowsEnabled} PR=${DEVICE_PROFILE.renderer.pixelRatio}`);
} catch (e) {}
