import * as THREE from 'three';
import { CONFIG } from './config.js';
import { SpatialHash } from './spatialHash.js';
import { injectFx } from './glitch.js';

/**
 * Conduit — 導體 / Buff support（2026-05-22 新增）
 * 慢速漂向水晶、低 HP，但只要場上有任何 Conduit 存活，所有其他怪 × conduitBuffSpeedMult 速度
 * 玩家必須優先擊破，否則其他怪更難對付。
 *
 * Buff 邏輯放 game.js 統一（單一 global flag 而非 per-enemy aura，省 CPU）
 * 視覺：青色八面體 + 環繞光暈 ring，明顯區別於其他怪
 */
export class Conduits {
  constructor(scene, maxCount) {
    this.maxCount = maxCount;
    this.activeCount = 0;
    this.xpReward = CONFIG.conduitXp;

    // 八面體（IcosahedronGeometry detail 1）+ 半透明青色
    const geo = new THREE.OctahedronGeometry(CONFIG.conduitRadius, 1);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0x00cccc,
      emissiveIntensity: 1.2,
      roughness: 0.25,
      metalness: 0.4,
      flatShading: true,
    });
    injectFx(mat, {
      rimColor: [0.4, 1.0, 1.0],
      rimStrength: 1.1,
      aoStrength: 0.2,
      breathAmp: 0.06,
      breathSpeed: 3.0,
      proceduralAnim: true,
      crawlAmp: 0.05,
      crawlFreq: 5.0,
      crawlSpatialFreq: 2.5,
      squashAmp: 0.3,
      normalTint: 0.08,
    });

    this.aSpeed = new Float32Array(maxCount);
    this.aKnock = new Float32Array(maxCount);
    this._aSpeedAttr = new THREE.InstancedBufferAttribute(this.aSpeed, 1);
    this._aKnockAttr = new THREE.InstancedBufferAttribute(this.aKnock, 1);
    this._aSpeedAttr.setUsage(THREE.DynamicDrawUsage);
    this._aKnockAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aSpeed', this._aSpeedAttr);
    geo.setAttribute('aKnock', this._aKnockAttr);
    this.mesh = new THREE.InstancedMesh(geo, mat, maxCount);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);

    // 光環 ring — 每隻 Conduit 一個獨立 ring 跟隨；視覺強調 buff 範圍
    this._auraRings = [];
    for (let i = 0; i < maxCount; i++) {
      const rg = new THREE.RingGeometry(CONFIG.conduitAuraRadius - 0.15, CONFIG.conduitAuraRadius, 64);
      rg.rotateX(-Math.PI / 2);
      const rm = new THREE.MeshBasicMaterial({
        color: 0x66ffff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(rg, rm);
      mesh.position.y = 0.05;
      mesh.visible = false;
      scene.add(mesh);
      this._auraRings.push(mesh);
    }

    this.pos = new Float32Array(maxCount * 3);
    this.vel = new Float32Array(maxCount * 3);
    this.knockback = new Float32Array(maxCount * 3);
    this.hp = new Float32Array(maxCount);
    this.alive = new Uint8Array(maxCount);
    this.flashTime = new Float32Array(maxCount);
    this.dashHitTag = new Uint8Array(maxCount);
    this._hidden = new Uint8Array(maxCount).fill(1);

    const baseColor = new THREE.Color(0x44ddee);
    for (let i = 0; i < maxCount; i++) this.mesh.setColorAt(i, baseColor);
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor.needsUpdate = true;
    this._baseColor = baseColor;

    const hide = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < maxCount; i++) this.mesh.setMatrixAt(i, hide);
    this.mesh.instanceMatrix.needsUpdate = true;

    this._tmpM = new THREE.Matrix4();
    this._tmpV = new THREE.Vector3();
    this._tmpQ = new THREE.Quaternion();
    this._tmpScale = new THREE.Vector3(1, 1, 1);
    this._tmpColor = new THREE.Color();
    this._up = new THREE.Vector3(0, 1, 0);

    this.hash = new SpatialHash(2.0);
  }

  spawnBurst(count, ringMin, ringMax) {
    let spawned = 0;
    for (let i = 0; i < this.maxCount && spawned < count; i++) {
      if (this.alive[i]) continue;
      const a = Math.random() * Math.PI * 2;
      const r = ringMin + Math.random() * (ringMax - ringMin);
      this.pos[i*3+0] = Math.cos(a) * r;
      this.pos[i*3+1] = 0;
      this.pos[i*3+2] = Math.sin(a) * r;
      this.vel[i*3+0] = 0; this.vel[i*3+2] = 0;
      this.knockback[i*3+0] = 0; this.knockback[i*3+2] = 0;
      this.hp[i] = CONFIG.conduitHp;
      this.alive[i] = 1;
      this.flashTime[i] = 0;
      this.dashHitTag[i] = 0;
      this.activeCount++;
      spawned++;
    }
    return spawned;
  }

  fillHash() {
    this.hash.clear();
    for (let i = 0; i < this.maxCount; i++) {
      if (!this.alive[i]) continue;
      this.hash.insertXZ(i, this.pos[i*3+0], this.pos[i*3+2]);
    }
  }

  update(dt, targetX, targetZ) {
    this.fillHash();
    const speed = CONFIG.conduitSpeed;
    const kbDecay = Math.exp(-4.5 * dt);

    for (let i = 0; i < this.maxCount; i++) {
      if (!this.alive[i]) continue;
      const px = this.pos[i*3+0], pz = this.pos[i*3+2];
      let dx = targetX - px, dz = targetZ - pz;
      const d = Math.hypot(dx, dz);
      if (d > 0.001) { dx /= d; dz /= d; }

      const kbx = this.knockback[i*3+0] * kbDecay;
      const kbz = this.knockback[i*3+2] * kbDecay;
      this.knockback[i*3+0] = kbx;
      this.knockback[i*3+2] = kbz;

      const vx = dx * speed + kbx;
      const vz = dz * speed + kbz;
      this.vel[i*3+0] = vx;
      this.vel[i*3+2] = vz;
      this.pos[i*3+0] = px + vx * dt;
      this.pos[i*3+2] = pz + vz * dt;

      if (this.flashTime[i] > 0) this.flashTime[i] -= dt;
    }
  }

  syncInstances(timeNow) {
    const invMaxSpeed = 1 / CONFIG.conduitSpeed;
    const knockNorm = 1 / 10.0;
    for (let i = 0; i < this.maxCount; i++) {
      const ring = this._auraRings[i];
      if (!this.alive[i]) {
        if (!this._hidden[i]) {
          this._tmpM.makeScale(0, 0, 0);
          this.mesh.setMatrixAt(i, this._tmpM);
          this._hidden[i] = 1;
          this.aSpeed[i] = 0;
          this.aKnock[i] = 0;
        }
        if (ring && ring.visible) {
          ring.visible = false;
          ring.material.opacity = 0;
        }
        continue;
      }
      this._hidden[i] = 0;

      // Conduit 浮空 — y 升到 1.2
      const yOsc = 1.2 + Math.sin(timeNow * 0.004 + i) * 0.18;
      this._tmpV.set(this.pos[i*3+0], yOsc, this.pos[i*3+2]);
      const yaw = timeNow * 0.002 + i * 0.5;
      this._tmpQ.setFromAxisAngle(this._up, yaw);
      this._tmpM.compose(this._tmpV, this._tmpQ, this._tmpScale);
      this.mesh.setMatrixAt(i, this._tmpM);

      // 顏色：base + flash + 慢脈動
      const flashing = this.flashTime[i] > 0;
      if (flashing) {
        const f = this.flashTime[i] / 0.1;
        this._tmpColor.setRGB(
          this._baseColor.r + f * 3,
          this._baseColor.g + f * 3,
          this._baseColor.b + f * 3
        );
      } else {
        const pulse = 0.85 + 0.15 * Math.sin(timeNow * 0.005);
        this._tmpColor.setRGB(this._baseColor.r * pulse, this._baseColor.g * pulse, this._baseColor.b * pulse);
      }
      this.mesh.setColorAt(i, this._tmpColor);

      // ring 跟著走 + 緩慢呼吸
      if (ring) {
        ring.visible = true;
        ring.position.set(this.pos[i*3+0], 0.05, this.pos[i*3+2]);
        const ringPulse = 0.18 + 0.10 * Math.sin(timeNow * 0.004 + i);
        ring.material.opacity = ringPulse;
      }

      const sp = Math.hypot(this.vel[i*3+0], this.vel[i*3+2]);
      this.aSpeed[i] = Math.min(1, sp * invMaxSpeed);
      const km = Math.hypot(this.knockback[i*3+0], this.knockback[i*3+2]);
      this.aKnock[i] = Math.min(1, km * knockNorm);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this._aSpeedAttr.needsUpdate = true;
    this._aKnockAttr.needsUpdate = true;
  }

  damage(i, amount) {
    if (!this.alive[i]) return false;
    this.hp[i] -= amount;
    this.flashTime[i] = 0.1;
    if (this.hp[i] <= 0) {
      this.alive[i] = 0;
      this.activeCount--;
      return true;
    }
    return false;
  }

  applyKnockback(i, kx, kz) {
    this.knockback[i*3+0] += kx * 0.7;
    this.knockback[i*3+2] += kz * 0.7;
  }

  consumeAt(i) {
    if (!this.alive[i]) return;
    this.alive[i] = 0;
    this.activeCount--;
  }
}
