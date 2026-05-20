import * as THREE from 'three';
import { CONFIG } from './config.js';

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);

/**
 * Soul Tether — 3D 能量管道
 * - 自寫 tube（parallel-transport frame）每幀零 GC 重建
 * - Shader：UV scroll + 倍率影響顏色 + severed 紅化
 * - severed 時倍率強制 ×1
 */
export class Tether {
  constructor(scene, hero, crystal) {
    this.hero = hero;
    this.crystal = crystal;
    this.scene = scene;
    this.distance = 0;
    this.heroDmgMult = 1.0;
    this.crystalVulnMult = 1.0;
    this.heroDmgMultNatural = 1.0;
    this.crystalVulnMultNatural = 1.0;
    this.flashAmount = 0;
    this.severed = false;
    this.selfSeveredRemaining = 0;       // W6 Volatile Loop 用

    this.segs = CONFIG.tetherSegments;
    this.radial = CONFIG.tetherRadialSegs;
    this.radius = CONFIG.tetherTubeRadius;

    // === Tube 幾何 ===
    const vCount = (this.segs + 1) * (this.radial + 1);
    const fCount = this.segs * this.radial * 2;

    this.positions = new Float32Array(vCount * 3);
    this.normals = new Float32Array(vCount * 3);
    this.uvs = new Float32Array(vCount * 2);
    const indices = new Uint16Array(fCount * 3);

    let idx = 0;
    for (let i = 0; i < this.segs; i++) {
      for (let j = 0; j < this.radial; j++) {
        const a = (this.radial + 1) * i + j;
        const b = (this.radial + 1) * (i + 1) + j;
        const c = (this.radial + 1) * (i + 1) + (j + 1);
        const d = (this.radial + 1) * i + (j + 1);
        indices[idx++] = a; indices[idx++] = b; indices[idx++] = d;
        indices[idx++] = b; indices[idx++] = c; indices[idx++] = d;
      }
    }
    for (let i = 0; i <= this.segs; i++) {
      for (let j = 0; j <= this.radial; j++) {
        const u = i / this.segs;
        const v = j / this.radial;
        const k = (this.radial + 1) * i + j;
        this.uvs[k*2+0] = u;
        this.uvs[k*2+1] = v;
      }
    }

    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geo.setAttribute('normal', new THREE.BufferAttribute(this.normals, 3));
    this.geo.setAttribute('uv', new THREE.BufferAttribute(this.uvs, 2));
    this.geo.setIndex(new THREE.BufferAttribute(indices, 1));

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uTension: { value: 0 },
        uFlash: { value: 0 },
        uSevered: { value: 0 },
        uColorCool: { value: new THREE.Color(0x8866ff) },
        uColorHot: { value: new THREE.Color(0xff5599) },
        uColorSever: { value: new THREE.Color(0xff1133) },
        uFlashColor: { value: new THREE.Color(0xffffff) },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uTension;
        uniform float uFlash;
        uniform float uSevered;
        uniform vec3 uColorCool;
        uniform vec3 uColorHot;
        uniform vec3 uColorSever;
        uniform vec3 uFlashColor;
        varying vec2 vUv;

        // 簡易 1D noise
        float noise(float x) {
          return fract(sin(x * 12.9898) * 43758.5453);
        }

        void main() {
          // 主流條紋
          float scroll = vUv.x * 14.0 - uTime * (3.5 + uTension * 6.0);
          float stripe = sin(scroll) * 0.5 + 0.5;
          stripe = pow(stripe, 2.2);

          // 副條紋
          float scroll2 = vUv.x * 6.0 - uTime * 1.8;
          float stripe2 = sin(scroll2) * 0.5 + 0.5;

          // 徑向（管內外）
          float radial = abs(vUv.y - 0.5) * 2.0;
          float core = 1.0 - radial * 0.75;
          core = pow(core, 1.4);

          // 基礎顏色：cool ↔ hot
          vec3 baseColor = mix(uColorCool, uColorHot, uTension);
          vec3 brightColor = baseColor + vec3(0.5, 0.4, 0.6);
          vec3 color = mix(baseColor, brightColor, stripe);
          color = mix(color, brightColor + vec3(0.3), stripe2 * 0.3);

          // severed：紅化 + 雜訊閃爍
          float severNoise = step(0.5, noise(vUv.x * 30.0 + uTime * 6.0)) * uSevered;
          color = mix(color, uColorSever, uSevered * 0.85);
          color += vec3(severNoise * 0.4);

          // flash
          color = mix(color, uFlashColor, uFlash);

          float alpha = core * (0.45 + stripe * 0.5 + uFlash * 0.5);
          // severed 時降透明度（破碎感）
          alpha *= mix(1.0, 0.5 + 0.5 * sin(vUv.x * 40.0 - uTime * 8.0), uSevered);
          alpha = clamp(alpha, 0.0, 1.0);

          gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });

    this.mesh = new THREE.Mesh(this.geo, this.material);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);

    this.pathX = new Float32Array(this.segs + 1);
    this.pathY = new Float32Array(this.segs + 1);
    this.pathZ = new Float32Array(this.segs + 1);

    // === Soul 池 ===
    this.maxSouls = CONFIG.maxSouls;
    const soulGeo = new THREE.IcosahedronGeometry(0.18, 0);
    const soulMat = new THREE.MeshBasicMaterial({
      color: 0xaaeeff,
      transparent: true,
      opacity: 1.0,
    });
    this.soulMesh = new THREE.InstancedMesh(soulGeo, soulMat, this.maxSouls);
    this.soulMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.soulMesh.frustumCulled = false;
    scene.add(this.soulMesh);

    this.soulPos = new Float32Array(this.maxSouls * 3);
    this.soulStage = new Uint8Array(this.maxSouls);   // 0=→hero, 1=→crystal, 2=orbital
    this.soulAlive = new Uint8Array(this.maxSouls);
    this.soulHidden = new Uint8Array(this.maxSouls).fill(1);
    this.soulOrbitTime = new Float32Array(this.maxSouls);   // W4: 軌道剩餘時間
    this.soulOrbitAngle = new Float32Array(this.maxSouls);  // W4: 軌道初始角度
    this.soulCount = 0;
    this.orbitalCount = 0;                                  // W4: 當前軌道靈魂數
    this._hideM = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < this.maxSouls; i++) this.soulMesh.setMatrixAt(i, this._hideM);
    this.soulMesh.instanceMatrix.needsUpdate = true;

    this._tmpM = new THREE.Matrix4();
    this._tmpV = new THREE.Vector3();
    this._tmpQ = new THREE.Quaternion();
    this._tmpScale = new THREE.Vector3(1, 1, 1);

    this.timeAccum = 0;
  }

  update(dt) {
    this.timeAccum += dt;

    const hx = this.hero.position.x, hz = this.hero.position.z;
    const cx = this.crystal.position.x, cz = this.crystal.position.z;
    this.distance = Math.hypot(hx - cx, hz - cz);

    const minR = CONFIG.tetherMinRange;
    const maxR = CONFIG.tetherMaxRange;
    const tRaw = clamp((this.distance - minR) / (maxR - minR), 0, 1);

    // Gemini 找的 bug: 在 sever 之外保留「自然倍率」給 Tether Snap 判定用
    this.heroDmgMultNatural = lerp(1, CONFIG.tetherDmgMultMax, tRaw);
    this.crystalVulnMultNatural = lerp(1, CONFIG.tetherVulnMultMax, tRaw);

    // 玩家反饋：站水晶旁完全沒代價 → 加 inner penalty zone
    // 距離 0 → tetherInnerPenaltyRange 之間，hero damage 倍率從 penaltyMin 線性升到 1.0
    // 這讓玩家不能站樁，必須走到 3.5 units 外才能打出完整輸出
    if (this.distance < CONFIG.tetherInnerPenaltyRange) {
      const innerT = this.distance / CONFIG.tetherInnerPenaltyRange;
      const penalty = lerp(CONFIG.tetherInnerPenaltyMin, 1.0, innerT);
      this.heroDmgMultNatural *= penalty;
      // 同步降低水晶受傷倍率（站近水晶 = 怪打到水晶比較痛，但玩家輸出也廢 → 平衡）
      this.crystalVulnMultNatural *= lerp(0.85, 1.0, innerT);
    }

    if (this.severed) {
      this.heroDmgMult = 1.0;
      this.crystalVulnMult = 1.0;
    } else {
      this.heroDmgMult = this.heroDmgMultNatural;
      this.crystalVulnMult = this.crystalVulnMultNatural;
    }

    // === 路徑計算 ===
    const heroY = 1.0, crystalY = 1.85;
    const dx = cx - hx, dz = cz - hz;
    const len = Math.max(0.001, Math.hypot(dx, dz));
    const nx = -dz / len, nz = dx / len;
    const waveAmp = 0.15 + tRaw * 0.55 + (this.severed ? 0.4 : 0);  // severed 時抖更兇
    const waveFreq = 6 + tRaw * 8 + (this.severed ? 6 : 0);
    const arcH = 0.45 + tRaw * 0.25;

    for (let i = 0; i <= this.segs; i++) {
      const f = i / this.segs;
      const envelope = Math.sin(f * Math.PI);
      const w = Math.sin(f * waveFreq + this.timeAccum * 5) * waveAmp * envelope;
      this.pathX[i] = hx + dx * f + nx * w;
      this.pathY[i] = heroY + (crystalY - heroY) * f + arcH * envelope;
      this.pathZ[i] = hz + dz * f + nz * w;
    }

    // Tube 頂點（parallel-transport frame）
    let prevNx = 0, prevNy = 1, prevNz = 0;
    let initialized = false;
    const radius = this.radius;

    for (let i = 0; i <= this.segs; i++) {
      let tx, ty, tz;
      if (i === 0) { tx = this.pathX[1] - this.pathX[0]; ty = this.pathY[1] - this.pathY[0]; tz = this.pathZ[1] - this.pathZ[0]; }
      else if (i === this.segs) { tx = this.pathX[i] - this.pathX[i-1]; ty = this.pathY[i] - this.pathY[i-1]; tz = this.pathZ[i] - this.pathZ[i-1]; }
      else { tx = this.pathX[i+1] - this.pathX[i-1]; ty = this.pathY[i+1] - this.pathY[i-1]; tz = this.pathZ[i+1] - this.pathZ[i-1]; }
      const tlen = Math.max(0.0001, Math.hypot(tx, ty, tz));
      tx /= tlen; ty /= tlen; tz /= tlen;

      let nxv, nyv, nzv;
      if (!initialized) {
        let ux = 0, uy = 1, uz = 0;
        if (Math.abs(ty) > 0.95) { ux = 1; uy = 0; uz = 0; }
        nxv = uy*tz - uz*ty; nyv = uz*tx - ux*tz; nzv = ux*ty - uy*tx;
        const nl = Math.max(0.0001, Math.hypot(nxv, nyv, nzv));
        nxv /= nl; nyv /= nl; nzv /= nl;
        initialized = true;
      } else {
        const dot = prevNx*tx + prevNy*ty + prevNz*tz;
        nxv = prevNx - tx*dot; nyv = prevNy - ty*dot; nzv = prevNz - tz*dot;
        const nl = Math.max(0.0001, Math.hypot(nxv, nyv, nzv));
        nxv /= nl; nyv /= nl; nzv /= nl;
      }
      prevNx = nxv; prevNy = nyv; prevNz = nzv;

      const bx = ty*nzv - tz*nyv;
      const by = tz*nxv - tx*nzv;
      const bz = tx*nyv - ty*nxv;

      for (let j = 0; j <= this.radial; j++) {
        const ang = (j / this.radial) * Math.PI * 2;
        const cosA = Math.cos(ang), sinA = Math.sin(ang);
        const offX = nxv*cosA + bx*sinA;
        const offY = nyv*cosA + by*sinA;
        const offZ = nzv*cosA + bz*sinA;
        const k = (this.radial + 1) * i + j;
        this.positions[k*3+0] = this.pathX[i] + offX * radius;
        this.positions[k*3+1] = this.pathY[i] + offY * radius;
        this.positions[k*3+2] = this.pathZ[i] + offZ * radius;
        this.normals[k*3+0] = offX;
        this.normals[k*3+1] = offY;
        this.normals[k*3+2] = offZ;
      }
    }

    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.normal.needsUpdate = true;

    this.material.uniforms.uTime.value = this.timeAccum;
    this.material.uniforms.uTension.value = tRaw;
    this.material.uniforms.uSevered.value = this.severed ? 1 : 0;

    if (this.flashAmount > 0) {
      this.flashAmount = Math.max(0, this.flashAmount - dt * 3.5);
    }
    this.material.uniforms.uFlash.value = this.flashAmount;
  }

  flashSnap() {
    this.flashAmount = 1.0;
  }

  spawnSoul(x, z) {
    for (let i = 0; i < this.maxSouls; i++) {
      if (this.soulAlive[i]) continue;
      this.soulPos[i*3+0] = x;
      this.soulPos[i*3+1] = 0.6;
      this.soulPos[i*3+2] = z;
      this.soulStage[i] = 0;
      this.soulAlive[i] = 1;
      this.soulHidden[i] = 0;
      this.soulOrbitTime[i] = 0;
      this.soulOrbitAngle[i] = Math.random() * Math.PI * 2;   // W4: 進軌道時起始角度
      this.soulCount++;
      return true;
    }
    return false;
  }

  /** B15: 跟 P6 同模式 — 死掉的 soul 只在剛死那幀寫 hide matrix
   *  W4: 加入 Soul Debt 軌道狀態 (stage=2) */
  updateSouls(dt, crystal, hero, perks) {
    let arrived = 0;
    let matrixDirty = false;
    const speedMult = perks ? (perks.soulSpeedMult || 1) : 1;
    const skipHero = perks ? perks.soulSkipHero : false;
    const useOrbit = perks ? perks.soulDebt : false;
    const speed = CONFIG.soulSpeed * speedMult;

    for (let i = 0; i < this.maxSouls; i++) {
      if (!this.soulAlive[i]) {
        if (!this.soulHidden[i]) {
          this.soulMesh.setMatrixAt(i, this._hideM);
          this.soulHidden[i] = 1;
          matrixDirty = true;
        }
        continue;
      }
      this.soulHidden[i] = 0;

      // === Stage 2: 軌道環繞英雄 ===
      if (this.soulStage[i] === 2) {
        this.soulOrbitTime[i] -= dt;
        if (this.soulOrbitTime[i] <= 0) {
          // 軌道結束 → 朝水晶
          this.soulStage[i] = 1;
          this.orbitalCount--;
        } else {
          // 持續軌道
          const ang = this.soulOrbitAngle[i] + this.timeAccum * 2.0;
          const r = CONFIG.soulDebtOrbitRadius;
          this.soulPos[i*3+0] = hero.position.x + Math.cos(ang) * r;
          this.soulPos[i*3+1] = 1.0 + Math.sin(this.timeAccum * 6 + i * 0.7) * 0.25;
          this.soulPos[i*3+2] = hero.position.z + Math.sin(ang) * r;
          this._tmpV.set(this.soulPos[i*3+0], this.soulPos[i*3+1], this.soulPos[i*3+2]);
          const s = 0.85 + 0.2 * Math.sin(this.timeAccum * 14 + i);
          this._tmpScale.set(s, s, s);
          this._tmpM.compose(this._tmpV, this._tmpQ, this._tmpScale);
          this.soulMesh.setMatrixAt(i, this._tmpM);
          matrixDirty = true;
          continue;
        }
      }

      // === Stage 0/1: 朝目標 lerp ===
      const sx = this.soulPos[i*3+0];
      const sy = this.soulPos[i*3+1];
      const sz = this.soulPos[i*3+2];
      let tx, ty, tz;
      if (skipHero || this.soulStage[i] === 1) {
        tx = crystal.position.x; ty = 1.85; tz = crystal.position.z;
      } else {
        tx = hero.position.x; ty = 1.0; tz = hero.position.z;
      }
      const ddx = tx - sx, ddy = ty - sy, ddz = tz - sz;
      const dd = Math.hypot(ddx, ddy, ddz);
      const step = speed * dt;
      if (dd <= step) {
        // 到達目標
        if (this.soulStage[i] === 0 && !skipHero) {
          // 到達英雄 → 看是否進軌道
          if (useOrbit && this.orbitalCount < CONFIG.soulDebtMaxOrbit) {
            this.soulStage[i] = 2;
            this.soulOrbitTime[i] = CONFIG.soulDebtOrbitTime;
            this.orbitalCount++;
          } else {
            this.soulStage[i] = 1;
            this.soulPos[i*3+0] = tx; this.soulPos[i*3+1] = ty; this.soulPos[i*3+2] = tz;
          }
        } else {
          // 到達水晶（或 skipHero 直接到水晶）
          this.soulAlive[i] = 0;
          this.soulCount--;
          arrived++;
          this.soulMesh.setMatrixAt(i, this._hideM);
          this.soulHidden[i] = 1;
          matrixDirty = true;
          continue;
        }
      } else {
        this.soulPos[i*3+0] = sx + ddx / dd * step;
        this.soulPos[i*3+1] = sy + ddy / dd * step;
        this.soulPos[i*3+2] = sz + ddz / dd * step;
      }
      this._tmpV.set(this.soulPos[i*3+0], this.soulPos[i*3+1], this.soulPos[i*3+2]);
      const s = 0.75 + 0.25 * Math.sin(this.timeAccum * 10 + i * 0.5);
      this._tmpScale.set(s, s, s);
      this._tmpM.compose(this._tmpV, this._tmpQ, this._tmpScale);
      this.soulMesh.setMatrixAt(i, this._tmpM);
      matrixDirty = true;
    }
    if (matrixDirty) this.soulMesh.instanceMatrix.needsUpdate = true;
    return arrived;
  }
}
