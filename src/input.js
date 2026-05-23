// 2026-05-23 重構 v3：
//   桌面 → WASD/Arrows 移動 + 左鍵朝鼠標方向 dash
//   手機 → 左半虛擬搖桿 + 右半 tap dash
import * as THREE from 'three';

const GAME_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD',                               // 桌面移動
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
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
const DEFAULT_POINTER_DEAD_ZONE = 0.45;
const JOY_MAX_RADIUS_PX = 60;             // 搖桿 knob 最遠拖到的像素距離
const JOY_DEAD_ZONE = 0.15;               // 0..1 magnitude 小於此 → 不移動

export class Input {
  constructor(domElement, camera, profile = {}) {
    this.keys = new Set();
    this.justPressed = new Set();
    this._pending = new Set();
    this._dashPending = false;

    // pointer 世界座標（桌面 mouse-follow 用）
    this.pointerWorldX = 0;
    this.pointerWorldZ = 0;
    this.pointerActive = false;        // mouse 在 canvas 內

    this._mode = profile.mode || 'mouse';   // 'mouse' | 'touch'
    this._domElement = domElement;
    this._camera = camera;
    this._ndc = new THREE.Vector2();
    this._raycaster = new THREE.Raycaster();
    this._groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this._hit = new THREE.Vector3();

    this._deadZone = profile.deadZone ?? DEFAULT_POINTER_DEAD_ZONE;

    // === 手機虛擬搖桿狀態 ===
    this._joyTouchId = -1;        // 持有搖桿的 touch identifier；-1 = 無
    this._joyBaseX = 0;            // 搖桿基準點（client px）
    this._joyBaseY = 0;
    this._joyDx = 0;               // 搖桿方向（0..1 magnitude 帶方向）
    this._joyDz = 0;

    this._joyBaseEl = typeof document !== 'undefined' ? document.getElementById('joystick-base') : null;
    this._joyKnobEl = typeof document !== 'undefined' ? document.getElementById('joystick-knob') : null;

    this._installKeyboard();
    this._installPointer();
    this._installTouch();
  }

  // === 內部：把 client 座標轉為地面 (y=0) 世界座標（桌面 mouse-follow 用） ===
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
      this._resetJoystick();
    });
    // 擋掉右鍵選單偷 focus
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
      if (e.button !== 0) return;
      this._updatePointerFromClient(e.clientX, e.clientY);
      this._dashPending = true;
      e.preventDefault();
    });
  }

  // === 觸控：左半搖桿、右半 dash ===
  _installTouch() {
    const el = this._domElement;

    const isLeftHalf = (clientX) => clientX < window.innerWidth / 2;

    el.addEventListener('touchstart', (e) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (isLeftHalf(t.clientX)) {
          // 左半 → 搖桿（已有搖桿時忽略額外的左半觸點）
          if (this._joyTouchId === -1) {
            this._joyTouchId = t.identifier;
            this._joyBaseX = t.clientX;
            this._joyBaseY = t.clientY;
            this._joyDx = 0;
            this._joyDz = 0;
            this._showJoystick();
            this._updateJoystickVisual();
          }
        } else {
          // 右半 → dash（立即觸發；多指則只 fire 一次）
          this._dashPending = true;
        }
      }
      e.preventDefault();
    }, { passive: false });

    el.addEventListener('touchmove', (e) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier === this._joyTouchId) {
          this._updateJoystickFromTouch(t.clientX, t.clientY);
        }
      }
      e.preventDefault();
    }, { passive: false });

    el.addEventListener('touchend', (e) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier === this._joyTouchId) this._resetJoystick();
      }
      e.preventDefault();
    }, { passive: false });

    el.addEventListener('touchcancel', (e) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier === this._joyTouchId) this._resetJoystick();
      }
    });
  }

  _updateJoystickFromTouch(clientX, clientY) {
    const dx = clientX - this._joyBaseX;
    const dy = clientY - this._joyBaseY;
    const len = Math.hypot(dx, dy);
    const r = JOY_MAX_RADIUS_PX;
    // magnitude 0..1（超過半徑後 clip 為 1）
    const mag = Math.min(len, r) / r;
    if (len < 0.001 || mag < JOY_DEAD_ZONE) {
      this._joyDx = 0; this._joyDz = 0;
    } else {
      // 螢幕座標 → 世界座標：screen +x = world +x；screen +y(下) = world +z(後)
      // top-down camera 看著 -Z 為「前方」，所以這對應正確
      const nx = dx / len, ny = dy / len;
      this._joyDx = nx * mag;
      this._joyDz = ny * mag;
    }
    this._updateJoystickVisual();
  }

  _resetJoystick() {
    this._joyTouchId = -1;
    this._joyDx = 0;
    this._joyDz = 0;
    this._hideJoystick();
  }

  _showJoystick() {
    if (this._joyBaseEl) this._joyBaseEl.classList.add('active');
    if (this._joyKnobEl) this._joyKnobEl.classList.add('active');
  }

  _hideJoystick() {
    if (this._joyBaseEl) this._joyBaseEl.classList.remove('active');
    if (this._joyKnobEl) this._joyKnobEl.classList.remove('active');
  }

  _updateJoystickVisual() {
    if (!this._joyBaseEl || !this._joyKnobEl) return;
    this._joyBaseEl.style.transform = `translate(${this._joyBaseX}px, ${this._joyBaseY}px) translate(-50%, -50%)`;
    const knobX = this._joyBaseX + this._joyDx * JOY_MAX_RADIUS_PX;
    const knobY = this._joyBaseY + this._joyDz * JOY_MAX_RADIUS_PX;
    this._joyKnobEl.style.transform = `translate(${knobX}px, ${knobY}px) translate(-50%, -50%)`;
  }

  beginFrame() {
    this.justPressed = this._pending;
    this._pending = new Set();
  }

  isDown(code) { return this.keys.has(code); }
  wasPressed(code) { return this.justPressed.has(code); }

  /**
   * 取得這幀的移動方向。
   * - mobile (mode='touch')：回搖桿向量（含 0..1 magnitude）
   * - desktop (mode='mouse')：讀 WASD / Arrow 鍵，回標準化 8 方向（單位向量）
   * heroX / heroZ 桌面模式現在用不到（保留 API 一致）
   */
  getMoveDir(heroX, heroZ, out) {
    if (this._mode === 'touch') {
      out.x = this._joyDx;
      out.z = this._joyDz;
      return out;
    }
    // Mouse mode: WASD + Arrows
    let mx = 0, mz = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp'))    mz -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown'))  mz += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft'))  mx -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) mx += 1;
    const len = Math.hypot(mx, mz);
    if (len > 0) { mx /= len; mz /= len; }
    out.x = mx; out.z = mz;
    return out;
  }

  /** 取出並清掉這幀的 dash 請求（左鍵 click 或右半 tap）。回傳 boolean。 */
  consumeDash() {
    if (this._dashPending) { this._dashPending = false; return true; }
    return false;
  }
}
