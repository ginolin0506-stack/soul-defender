import * as THREE from 'three';
import { CONFIG } from './config.js';
import { SpatialHash } from './spatialHash.js';
import { injectFx } from './glitch.js';

/**
 * Sentinel — 哨衛 / 慢速高 HP 大型 tank（2026-05-22 新增）
 * 行為：緩慢朝水晶移動，HP 大池，撞水晶造成大量傷害；玩家必須優先 dash + 連續脈衝擊破
 * 與 Splitter 對位：Splitter 快但脆、會爆；Sentinel 慢但厚、純撞傷
 */
export class Sentinels {
  constructor(scene, maxCount) {
    this.maxCount = maxCount;
    this.activeCount = 0;
    this.xpReward = CONFIG.sentinelXp;

    // 八面體 detail 2 → 質感較細緻；綠色金屬感
    const geo = new THREE.IcosahedronGeometry(CONFIG.sentinelRadius, 2);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0x224422,
      emissiveIntensity: 0.55,
      roughness: 0.6,
      metalness: 0.5,
      flatShading: true,
    });
    injectFx(mat, {
      rimColor: [0.4, 0.9, 0.5],
      rimStrength: 0.7,
      aoStrength: 0.45,
      breathAmp: 0.03,
      breathSpeed: 1.2,         // 慢沉重的呼吸
      proceduralAnim: true,
      crawlAmp: 0.05,
      crawlFreq: 2.5,
      crawlSpatialFreq: 2.0,
      squashAmp: 0.25,          // 龐然大物受擊壓得保守
      normalTint: 0.06,
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

    this.pos = new Float32Array(maxCount * 3);
    this.vel = new Float32Array(maxCount * 3);
    this.knockback = new Float32Array(maxCount * 3);
    this.hp = new Float32Array(maxCount);
    this.alive = new Uint8Array(maxCount);
    this.flashTime = new Float32Array(maxCount);
    this.dashHitTag = new Uint8Array(maxCount);
    this._wasFlashing = new Uint8Array(maxCount);
    this._hidden = new Uint8Array(maxCount).fill(1);

    const baseColor = new THREE.Color(0x3a8855);
    for (let i = 0; i < maxCount; i++) this.mesh.setColorAt(i, baseColor);
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor.needsUpdate = true;

    const hide = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < maxCount; i++) this.mesh.setMatrixAt(i, hide);
    this.mesh.instanceMatrix.needsUpdate = true;

    this._tmpM = new THREE.Matrix4();
    this._tmpV = new THREE.Vector3();
    this._tmpQ = new THREE.Quaternion();
    this._tmpScale = new THREE.Vector3(1, 1, 1);
    this._tmpColor = new THREE.Color();
    this._up = new THREE.Vector3(0, 1, 0);
    this._baseColor = baseColor;

    this.hash = new SpatialHash(3.0);
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
      this.hp[i] = CONFIG.sentinelHp;
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
    const speed = CONFIG.sentinelSpeed;
    const kbDecay = Math.exp(-3.5 * dt);  // 較重 → 擊退衰減較慢

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
    let colorDirty = false;
    const invMaxSpeed = 1 / CONFIG.sentinelSpeed;
    const knockNorm = 1 / 10.0;
    for (let i = 0; i < this.maxCount; i++) {
      if (!this.alive[i]) {
        if (!this._hidden[i]) {
          this._tmpM.makeScale(0, 0, 0);
          this.mesh.setMatrixAt(i, this._tmpM);
          this._hidden[i] = 1;
          this.aSpeed[i] = 0;
          this.aKnock[i] = 0;
        }
        if (this._wasFlashing[i]) {
          this._tmpColor.setRGB(this._baseColor.r, this._baseColor.g, this._baseColor.b);
          this.mesh.setColorAt(i, this._tmpColor);
          this._wasFlashing[i] = 0;
          colorDirty = true;
        }
        continue;
      }
      this._hidden[i] = 0;

      this._tmpV.set(this.pos[i*3+0], this.pos[i*3+1] + 1.0, this.pos[i*3+2]);
      const yaw = timeNow * 0.0008 + i * 0.7;
      this._tmpQ.setFromAxisAngle(this._up, yaw);
      this._tmpM.compose(this._tmpV, this._tmpQ, this._tmpScale);
      this.mesh.setMatrixAt(i, this._tmpM);

      const flashing = this.flashTime[i] > 0;
      if (flashing) {
        const f = this.flashTime[i] / 0.12;
        this._tmpColor.setRGB(
          this._baseColor.r + f * 3,
          this._baseColor.g + f * 3,
          this._baseColor.b + f * 3
        );
        this.mesh.setColorAt(i, this._tmpColor);
        this._wasFlashing[i] = 1;
        colorDirty = true;
      } else if (this._wasFlashing[i]) {
        this._tmpColor.setRGB(this._baseColor.r, this._baseColor.g, this._baseColor.b);
        this.mesh.setColorAt(i, this._tmpColor);
        this._wasFlashing[i] = 0;
        colorDirty = true;
      }

      const sp = Math.hypot(this.vel[i*3+0], this.vel[i*3+2]);
      this.aSpeed[i] = Math.min(1, sp * invMaxSpeed);
      const km = Math.hypot(this.knockback[i*3+0], this.knockback[i*3+2]);
      this.aKnock[i] = Math.min(1, km * knockNorm);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (colorDirty && this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this._aSpeedAttr.needsUpdate = true;
    this._aKnockAttr.needsUpdate = true;
  }

  damage(i, amount) {
    if (!this.alive[i]) return false;
    this.hp[i] -= amount;
    this.flashTime[i] = 0.14;
    if (this.hp[i] <= 0) {
      this.alive[i] = 0;
      this.activeCount--;
      return true;
    }
    return false;
  }

  applyKnockback(i, kx, kz) {
    // tank：擊退打三折
    this.knockback[i*3+0] += kx * 0.3;
    this.knockback[i*3+2] += kz * 0.3;
  }

  collectCrystalHits(targetX, targetZ, range) {
    const r2 = range * range;
    const hits = [];
    for (let i = 0; i < this.maxCount; i++) {
      if (!this.alive[i]) continue;
      const dx = this.pos[i*3+0] - targetX;
      const dz = this.pos[i*3+2] - targetZ;
      if (dx*dx + dz*dz < r2) hits.push(i);
    }
    return hits;
  }

  consumeAt(i) {
    if (!this.alive[i]) return;
    this.alive[i] = 0;
    this.activeCount--;
  }
}
