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

    // 2026-05-23：通用死亡碎片粒子池 — 所有怪物死亡共用
    // 設計：InstancedMesh 一個小八面體，per-instance 顏色 + 矩陣
    // 任何 swarm 死亡時 game._onKill 呼叫 spawnDeathBurst(x,z,hex,scale)
    // → 從 ring buffer 取 ~6 顆碎片，給隨機向外速度 + lifetime
    // 統一視覺：「資料殘骸炸散」感，符合世界觀（數據被刪除 → 像素塵爆）
    this._deathFragMax = 256;
    this._deathFragNext = 0;
    const dfGeo = new THREE.OctahedronGeometry(0.18, 0);
    const dfMat = new THREE.MeshBasicMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this._deathFrags = new THREE.InstancedMesh(dfGeo, dfMat, this._deathFragMax);
    this._deathFrags.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this._deathFrags.frustumCulled = false;
    const fragHide = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < this._deathFragMax; i++) {
      this._deathFrags.setMatrixAt(i, fragHide);
      this._deathFrags.setColorAt(i, new THREE.Color(0xffffff));
    }
    this._deathFrags.instanceMatrix.needsUpdate = true;
    if (this._deathFrags.instanceColor) {
      this._deathFrags.instanceColor.setUsage(THREE.DynamicDrawUsage);
      this._deathFrags.instanceColor.needsUpdate = true;
    }
    this.scene.add(this._deathFrags);
    // 平行資料：每顆碎片的位置 / 速度 / 年齡 / 壽命 / 顏色 / 縮放
    this._dfPos = new Float32Array(this._deathFragMax * 3);
    this._dfVel = new Float32Array(this._deathFragMax * 3);
    this._dfAge = new Float32Array(this._deathFragMax);
    this._dfLife = new Float32Array(this._deathFragMax);
    this._dfScale = new Float32Array(this._deathFragMax);
    this._dfActive = new Uint8Array(this._deathFragMax);
    this._dfTmpM = new THREE.Matrix4();
    this._dfTmpV = new THREE.Vector3();
    this._dfTmpQ = new THREE.Quaternion();
    this._dfTmpS = new THREE.Vector3();
    this._dfTmpC = new THREE.Color();
    this._dfRotAxis = new THREE.Vector3(0.6, 0.7, 0.4).normalize();
  }

  /**
   * 生成一波死亡碎片爆散（從 ring buffer 取出 6 顆，從中心向外飛）
   * @param x 世界 x
   * @param z 世界 z
   * @param hexColor 顏色（hex int）— 通常傳該怪的主色，符合「他炸出來的就是他的色」
   * @param scale 碎片視覺大小倍率（mites→0.5、leech→1、sentinel→1.6）
   */
  spawnDeathBurst(x, z, hexColor, scale = 1) {
    const N = 6;
    const baseY = 0.4;
    this._dfTmpC.setHex(hexColor);
    const r = this._dfTmpC.r, g = this._dfTmpC.g, b = this._dfTmpC.b;
    for (let n = 0; n < N; n++) {
      const i = this._deathFragNext;
      this._deathFragNext = (this._deathFragNext + 1) % this._deathFragMax;
      // 半球向外（向上略偏），加一點隨機
      const a = Math.random() * Math.PI * 2;
      const vmag = 2.5 + Math.random() * 2.5;
      this._dfPos[i*3+0] = x;
      this._dfPos[i*3+1] = baseY;
      this._dfPos[i*3+2] = z;
      this._dfVel[i*3+0] = Math.cos(a) * vmag;
      this._dfVel[i*3+1] = 1.2 + Math.random() * 2.0;
      this._dfVel[i*3+2] = Math.sin(a) * vmag;
      this._dfAge[i] = 0;
      this._dfLife[i] = 0.35 + Math.random() * 0.15;
      this._dfScale[i] = scale * (0.7 + Math.random() * 0.5);
      this._dfActive[i] = 1;
      this._deathFrags.setColorAt(i, this._dfTmpC.setRGB(r, g, b));
    }
    if (this._deathFrags.instanceColor) this._deathFrags.instanceColor.needsUpdate = true;
  }

  /** Tick 所有死亡碎片：速度、重力下墜、淡出、回收 */
  _updateDeathFrags(rawDt) {
    const GRAV = 6.0;        // 向下重力
    const DRAG = 2.0;         // 水平阻尼（per-second 衰減比例）
    let dirty = false;
    for (let i = 0; i < this._deathFragMax; i++) {
      if (!this._dfActive[i]) continue;
      this._dfAge[i] += rawDt;
      const t = this._dfAge[i] / this._dfLife[i];
      if (t >= 1) {
        this._dfActive[i] = 0;
        this._dfTmpM.makeScale(0, 0, 0);
        this._deathFrags.setMatrixAt(i, this._dfTmpM);
        dirty = true;
        continue;
      }
      // 重力 + 阻尼
      this._dfVel[i*3+1] -= GRAV * rawDt;
      const dragF = Math.exp(-DRAG * rawDt);
      this._dfVel[i*3+0] *= dragF;
      this._dfVel[i*3+2] *= dragF;
      // 積分位置
      this._dfPos[i*3+0] += this._dfVel[i*3+0] * rawDt;
      this._dfPos[i*3+1] += this._dfVel[i*3+1] * rawDt;
      this._dfPos[i*3+2] += this._dfVel[i*3+2] * rawDt;
      // 撞地反彈一次（衰減地）
      if (this._dfPos[i*3+1] < 0.05) {
        this._dfPos[i*3+1] = 0.05;
        this._dfVel[i*3+1] = Math.abs(this._dfVel[i*3+1]) * 0.3;
      }
      // 視覺：scale 從 base 收縮到 0；旋轉飛行
      const s = this._dfScale[i] * (1 - t);
      this._dfTmpV.set(this._dfPos[i*3+0], this._dfPos[i*3+1], this._dfPos[i*3+2]);
      const yaw = this._dfAge[i] * 18;
      this._dfTmpQ.setFromAxisAngle(this._dfRotAxis, yaw);
      this._dfTmpS.set(s, s, s);
      this._dfTmpM.compose(this._dfTmpV, this._dfTmpQ, this._dfTmpS);
      this._deathFrags.setMatrixAt(i, this._dfTmpM);
      dirty = true;
    }
    if (dirty) this._deathFrags.instanceMatrix.needsUpdate = true;
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

    // 2026-05-23：通用死亡碎片粒子
    this._updateDeathFrags(rawDt);
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
