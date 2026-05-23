// 2026-05-23 重構：純鼠標 / 觸控操控
// 玩家朝 pointer 自動移動；左鍵 / 短 tap 觸發 dash。
// WASD / Arrow / Space 移動已全部捨棄；只保留系統/UI 鍵：P / R / M / 1-3 / debug B V C J K L U N
import * as THREE from 'three';

const GAME_KEYS = new Set([
  'KeyP',                                                       // 暫停
  'KeyR', 'KeyM',                                               // 重啟、靜音
  'KeyB', 'KeyV', 'KeyC', 'KeyG', 'KeyH', 'KeyJ',
  'KeyK', 'KeyL', 'KeyU', 'KeyN',                               // debug 召喚
  'Digit1', 'Digit2', 'Digit3',
  'Numpad1', 'Numpad2', 'Numpad3',
  // Space 不再用於 dash，但仍保留 preventDefault 避免捲頁；intro 自己也聽 Space
  'Space',
]);

// Default 閾值 — 若沒給 profile，回退到桌面值
const DEFAULT_TAP_MAX_DURATION = 0.20;
const DEFAULT_TAP_MAX_MOVE_PX = 14;
const DEFAULT_POINTER_DEAD_ZONE = 0.45;

export class Input {
  constructor(domElement, camera, profile = {}) {
    this.keys = new Set();
    this.justPressed = new Set();
    this._pending = new Set();
    this._dashPending = false;

    // pointer 世界座標（射線打到 y=0 平面）
    this.pointerWorldX = 0;
    this.pointerWorldZ = 0;
    this.pointerActive = false;        // mouse 在 canvas 內 / 手指仍按住

    this._domElement = domElement;
    this._camera = camera;
    this._ndc = new THREE.Vector2();
    this._raycaster = new THREE.Raycaster();
    this._groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this._hit = new THREE.Vector3();

    // 2026-05-23 從 device profile 注入閾值；mobile 觸點 Y 偏移避免手指遮住英雄
    this._deadZone = profile.deadZone ?? DEFAULT_POINTER_DEAD_ZONE;
    this._tapMaxDuration = profile.tapMaxDuration ?? DEFAULT_TAP_MAX_DURATION;
    this._tapMaxMovePx = profile.tapMaxMovePx ?? DEFAULT_TAP_MAX_MOVE_PX;
    this._touchYOffsetPx = profile.touchYOffsetPx ?? 0;

    // 觸控 tap 偵測
    this._touchStartTime = 0;
    this._touchStartX = 0;
    this._touchStartY = 0;
    this._touchMoved = false;

    this._installKeyboard();
    this._installPointer();
    this._installTouch();
  }

  // === 內部：把 client 座標轉為地面 (y=0) 世界座標 ===
  _updatePointerFromClient(clientX, clientY) {
    const rect = this._domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    this._ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this._ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this._raycaster.setFromCamera(this._ndc, this._camera);
    const got = this._raycaster.ray.intersectPlane(this._groundPlane, this._hit);
    if (got) {
      this.pointerWorldX = this._hit.x;
      this.pointerWorldZ = this._hit.z;
      this.pointerActive = true;
      return true;
    }
    return false;
  }

  _installKeyboard() {
    window.addEventListener('keydown', (e) => {
      const k = e.code;
      if (!this.keys.has(k)) this._pending.add(k);
      this.keys.add(k);
      if (GAME_KEYS.has(k) && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this._pending.clear();
      this.pointerActive = false;
    });
    // 擋掉右鍵選單偷 focus（舊註解：避免 keyup 漏接）
    window.addEventListener('contextmenu', (e) => { e.preventDefault(); });
  }

  _installPointer() {
    const el = this._domElement;
    el.addEventListener('mousemove', (e) => {
      this._updatePointerFromClient(e.clientX, e.clientY);
    });
    el.addEventListener('mouseenter', (e) => {
      this._updatePointerFromClient(e.clientX, e.clientY);
    });
    el.addEventListener('mouseleave', () => {
      this.pointerActive = false;
    });
    el.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;   // 只接左鍵
      this._updatePointerFromClient(e.clientX, e.clientY);
      this._dashPending = true;
      e.preventDefault();
    });
  }

  _installTouch() {
    const el = this._domElement;
    // 觸點 Y 偏移：手指實際座標 → 真正用來 raycast 的 screen 座標往上推 offset px
    // → 英雄目標位置會在「手指上方」 → 玩家看得到自己
    const yOffset = this._touchYOffsetPx;

    el.addEventListener('touchstart', (e) => {
      if (e.touches.length === 0) return;
      const t = e.touches[0];
      this._touchStartTime = performance.now() / 1000;
      this._touchStartX = t.clientX;
      this._touchStartY = t.clientY;
      this._touchMoved = false;
      this._updatePointerFromClient(t.clientX, t.clientY - yOffset);
      e.preventDefault();
    }, { passive: false });

    el.addEventListener('touchmove', (e) => {
      if (e.touches.length === 0) return;
      const t = e.touches[0];
      if (!this._touchMoved) {
        const dx = t.clientX - this._touchStartX;
        const dy = t.clientY - this._touchStartY;
        if (Math.hypot(dx, dy) > this._tapMaxMovePx) this._touchMoved = true;
      }
      this._updatePointerFromClient(t.clientX, t.clientY - yOffset);
      e.preventDefault();
    }, { passive: false });

    el.addEventListener('touchend', (e) => {
      const now = performance.now() / 1000;
      const dur = now - this._touchStartTime;
      // 短時間 + 未顯著移動 → tap → dash 觸發
      if (dur <= this._tapMaxDuration && !this._touchMoved) {
        this._dashPending = true;
      }
      this.pointerActive = false;
      e.preventDefault();
    }, { passive: false });

    el.addEventListener('touchcancel', () => {
      this.pointerActive = false;
    });
  }

  beginFrame() {
    this.justPressed = this._pending;
    this._pending = new Set();
  }

  isDown(code) { return this.keys.has(code); }
  wasPressed(code) { return this.justPressed.has(code); }

  /**
   * 取得這幀的移動方向（單位向量）。pointer 距 hero 太近 → 回 (0,0) 表示「不要動」。
   * @param heroX, heroZ 目前英雄世界座標
   * @param out THREE.Vector3 或 {x,z} 物件 — 會被填寫
   */
  getMoveDir(heroX, heroZ, out) {
    if (!this.pointerActive) {
      out.x = 0; out.z = 0; return out;
    }
    const dx = this.pointerWorldX - heroX;
    const dz = this.pointerWorldZ - heroZ;
    const len = Math.hypot(dx, dz);
    if (len < this._deadZone) {
      out.x = 0; out.z = 0;
    } else {
      out.x = dx / len; out.z = dz / len;
    }
    return out;
  }

  /** 取出並清掉這幀的 dash 請求（左鍵 click 或 tap）。回傳 boolean。 */
  consumeDash() {
    if (this._dashPending) { this._dashPending = false; return true; }
    return false;
  }
}
