// B10: 遊戲鍵 — 沒有 modifier 時要 preventDefault 避免捲頁/瀏覽器快捷衝突
const GAME_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Space',
  'KeyB', 'KeyV', 'KeyC', 'KeyJ', 'KeyN',   // debug spawn keys
  'Digit1', 'Digit2', 'Digit3',
  'Numpad1', 'Numpad2', 'Numpad3',
]);

export class Input {
  constructor() {
    this.keys = new Set();
    this.justPressed = new Set();
    this._pending = new Set();

    window.addEventListener('keydown', (e) => {
      const k = e.code;
      if (!this.keys.has(k)) this._pending.add(k);
      this.keys.add(k);
      // B10: 只在「無 modifier 且為遊戲鍵」時阻止瀏覽器預設行為
      // 這樣 Ctrl+R/F5/F12/Ctrl+W 等系統快捷依然可用
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
    });
  }

  /** 每幀開頭呼叫一次，把剛按下的鍵切到 justPressed */
  beginFrame() {
    this.justPressed = this._pending;
    this._pending = new Set();
  }

  isDown(code) { return this.keys.has(code); }
  wasPressed(code) { return this.justPressed.has(code); }

  /** 取得移動向量 (x, z) 已標準化 */
  getMoveVec(out) {
    let x = 0, z = 0;
    if (this.isDown('KeyW') || this.isDown('ArrowUp'))    z -= 1;
    if (this.isDown('KeyS') || this.isDown('ArrowDown'))  z += 1;
    if (this.isDown('KeyA') || this.isDown('ArrowLeft'))  x -= 1;
    if (this.isDown('KeyD') || this.isDown('ArrowRight')) x += 1;
    const len = Math.hypot(x, z);
    if (len > 0) { x /= len; z /= len; }
    out.x = x; out.z = z;
    return out;
  }
}
