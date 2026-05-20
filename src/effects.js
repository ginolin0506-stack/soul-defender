import * as THREE from 'three';
import { CONFIG } from './config.js';

/**
 * 全部「爽感」基礎建設都塞這：
 * - Hit-stop（用 game timeScale）
 * - Screen shake（trauma 平方衰減）
 * - Damage numbers（DOM）
 * - 受擊閃白 / 鏡頭抖
 * - 簡易色差後處理（用 canvas filter，不用 EffectComposer 省事）
 */
export class Effects {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.canvas = renderer.domElement;

    this.trauma = 0;
    this.shakeOffsetX = 0;
    this.shakeOffsetY = 0;

    this.hitStopRemaining = 0;
    this.chromaIntensity = 0;

    this.dmgLayer = document.getElementById('damage-layer');

    this._tmpProj = new THREE.Vector3();
    this._baseCamPos = new THREE.Vector3();
    this._baseCamLook = new THREE.Vector3(0, 0, 0);

    this._dmgPool = [];           // 復用 DOM
    this._dmgInUse = [];
    this._dmgMaxTotal = 80;        // P1: DOM 元素總數上限（含 pool + inUse）
    this.endlessMode = false;      // W5: 灰階化開關
  }

  get hitStopActive() { return this.hitStopRemaining > 0; }

  addTrauma(amount) {
    this.trauma = Math.min(CONFIG.shakeTraumaMax, this.trauma + amount);
  }

  triggerHitStop(durationOverride) {
    const d = durationOverride ?? CONFIG.hitStopDuration;
    if (d > this.hitStopRemaining) this.hitStopRemaining = d;
  }

  addChroma(amount) {
    this.chromaIntensity = Math.min(0.04, this.chromaIntensity + amount);
  }

  /**
   * 在 (x, y, z) 世界座標位置彈出傷害數字
   */
  spawnDamageNumber(worldX, worldY, worldZ, amount, isCrit) {
    this._tmpProj.set(worldX, worldY + 0.5, worldZ).project(this.camera);
    if (this._tmpProj.z < -1 || this._tmpProj.z > 1) return;
    const sx = (this._tmpProj.x * 0.5 + 0.5) * window.innerWidth;
    const sy = (-this._tmpProj.y * 0.5 + 0.5) * window.innerHeight;

    let el = this._dmgPool.pop();
    if (!el) {
      // P1: 總量到頂時回收最舊的 in-use 元素，不再無限長 DOM
      const totalNow = this._dmgInUse.length + this._dmgPool.length;
      if (totalNow >= this._dmgMaxTotal) {
        const oldest = this._dmgInUse.shift();
        el = oldest.el;
        el.classList.remove('crit');
        el.style.animation = 'none';
        void el.offsetWidth;
        el.style.animation = '';
      } else {
        el = document.createElement('div');
        el.className = 'dmg-num';
        this.dmgLayer.appendChild(el);
      }
    } else {
      el.classList.remove('crit');
      el.style.animation = 'none';
      // 強制 reflow 重啟動畫
      void el.offsetWidth;
      el.style.animation = '';
    }
    el.className = isCrit ? 'dmg-num crit' : 'dmg-num';
    el.style.left = sx + 'px';
    el.style.top = sy + 'px';
    el.textContent = Math.round(amount);

    const entry = { el, expiresAt: performance.now() + 700 };
    this._dmgInUse.push(entry);
  }

  /** 每幀呼叫（用 rawDt — 不受 hit-stop 影響） */
  update(rawDt) {
    // === Trauma decay ===
    this.trauma = Math.max(0, this.trauma - CONFIG.shakeDecay * rawDt);
    const shake = this.trauma * this.trauma;
    this.shakeOffsetX = (Math.random() * 2 - 1) * CONFIG.shakeAmplitude * shake;
    this.shakeOffsetY = (Math.random() * 2 - 1) * CONFIG.shakeAmplitude * shake;

    // === Hit-stop tick ===
    if (this.hitStopRemaining > 0) this.hitStopRemaining -= rawDt;

    // === Chromatic + Endless filter 組合 ===
    this.chromaIntensity = Math.max(0, this.chromaIntensity - rawDt * 0.15);
    const parts = [];
    if (this.endlessMode) {
      // W5: 灰階化（CSS saturate 與後續 saturate 為乘法，所以 chroma 一閃還是會漏色）
      parts.push('saturate(0.08) contrast(1.25) brightness(1.06)');
    }
    if (this.chromaIntensity > 0.001) {
      const sat = 1 + this.chromaIntensity * 8;
      const hue = this.chromaIntensity * 35;
      parts.push(`saturate(${sat}) hue-rotate(${hue}deg)`);
    }
    const newFilter = parts.join(' ');
    if (this.canvas.style.filter !== newFilter) {
      this.canvas.style.filter = newFilter;
    }

    // === 回收過期傷害數字 ===
    const now = performance.now();
    for (let i = this._dmgInUse.length - 1; i >= 0; i--) {
      const e = this._dmgInUse[i];
      if (now > e.expiresAt) {
        this._dmgInUse.splice(i, 1);
        this._dmgPool.push(e.el);
      }
    }
  }

  /**
   * 套用相機抖動。game 在 render 前呼叫，render 後 restore。
   * P5: 移除 dead arg
   */
  applyShake() {
    this._baseCamPos.copy(this.camera.position);
    this.camera.position.x += this.shakeOffsetX;
    this.camera.position.y += this.shakeOffsetY;
  }
  restoreShake() {
    this.camera.position.copy(this._baseCamPos);
  }

  onResize() {
    // 沒有 EffectComposer，所以這裡空著
  }
}
