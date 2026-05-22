import * as THREE from 'three';
import { CONFIG } from './config.js';
import { SpatialHash } from './spatialHash.js';
import { injectFx } from './glitch.js';

/**
 * Slinger 遠程怪：
 * - 接近到 stopRange 後停下，charge → fire → cooldown
 * - 子彈瞄準水晶（不是英雄）→ 玩家必須衝出去清掉
 * - Hit-by-pulse / dash 也會死
 */
export class Slingers {
  constructor(scene, maxCount) {
    this.maxCount = maxCount;
    this.activeCount = 0;
    this.xpReward = CONFIG.slingerXp;

    // W9 升級：4-sided cylinder（窄頂寬底）→ 暗黑法師塔造型
    const geo = new THREE.CylinderGeometry(0.10, 0.55, 1.4, 4);
    geo.translate(0, 0.7, 0);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0x002255,
      emissiveIntensity: 0.55,
      roughness: 0.5,
      metalness: 0.3,
      flatShading: true,
    });
    // W9 + W10: 藍紫 rim + 蠕動 + 蓄力 Y 拉長 + 受擊壓扁
    injectFx(mat, {
      rimColor: [0.3, 0.5, 1.0],
      rimStrength: 0.65,
      aoStrength: 0.35,
      breathAmp: 0.02,
      breathSpeed: 2.5,
      proceduralAnim: true,
      crawlAmp: 0.06,         // slinger 不太蠕動，幅度小
      crawlFreq: 4.0,
      crawlSpatialFreq: 2.0,
      squashAmp: 0.4,
      hasCharge: true,        // ★ 蓄力拉長
      chargeStretch: 0.45,
      normalTint: 0.07,
    });

    // W10: per-instance attributes
    this.aSpeed = new Float32Array(maxCount);
    this.aKnock = new Float32Array(maxCount);
    this.aCharge = new Float32Array(maxCount);   // slinger 專用
    this._aSpeedAttr = new THREE.InstancedBufferAttribute(this.aSpeed, 1);
    this._aKnockAttr = new THREE.InstancedBufferAttribute(this.aKnock, 1);
    this._aChargeAttr = new THREE.InstancedBufferAttribute(this.aCharge, 1);
    this._aSpeedAttr.setUsage(THREE.DynamicDrawUsage);
    this._aKnockAttr.setUsage(THREE.DynamicDrawUsage);
    this._aChargeAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aSpeed', this._aSpeedAttr);
    geo.setAttribute('aKnock', this._aKnockAttr);
    geo.setAttribute('aCharge', this._aChargeAttr);
    this.mesh = new THREE.InstancedMesh(geo, mat, maxCount);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);

    // 平行陣列
    this.pos = new Float32Array(maxCount * 3);
    this.vel = new Float32Array(maxCount * 3);
    this.knockback = new Float32Array(maxCount * 3);
    this.hp = new Float32Array(maxCount);
    this.alive = new Uint8Array(maxCount);
    this.flashTime = new Float32Array(maxCount);
    this.dashHitTag = new Uint8Array(maxCount);
    this.fireCooldown = new Float32Array(maxCount);
    this.chargeTime = new Float32Array(maxCount);
    this.state = new Uint8Array(maxCount);   // 0=moving, 1=charging, 2=cooldown
    this._hidden = new Uint8Array(maxCount).fill(1);   // P6

    // 預設顏色
    const baseColor = new THREE.Color(0x2a5577);
    const chargeColor = new THREE.Color(0xff6655);
    this._baseColor = baseColor;
    this._chargeColor = chargeColor;
    for (let i = 0; i < maxCount; i++) this.mesh.setColorAt(i, baseColor);
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);

    const hide = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < maxCount; i++) this.mesh.setMatrixAt(i, hide);
    this.mesh.instanceMatrix.needsUpdate = true;

    this._tmpM = new THREE.Matrix4();
    this._tmpV = new THREE.Vector3();
    this._tmpQ = new THREE.Quaternion();
    this._tmpScale = new THREE.Vector3(1, 1, 1);
    this._tmpColor = new THREE.Color();
    this._up = new THREE.Vector3(0, 1, 0);

    // 自己的小型 hash（提供 hero 查 slinger）
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
      this.hp[i] = CONFIG.slingerHp;
      this.alive[i] = 1;
      this.flashTime[i] = 0;
      this.dashHitTag[i] = 0;
      this.fireCooldown[i] = 0.8 + Math.random() * 0.6;  // 一開始小冷卻
      this.chargeTime[i] = 0;
      this.state[i] = 0;
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

  update(dt, targetX, targetZ, bullets, audio) {
    this.fillHash();
    const speed = CONFIG.slingerSpeed;
    const sepR = CONFIG.slingerSeparationRadius;
    const sepR2 = sepR * sepR;
    const stopR = CONFIG.slingerStopRange;
    const stopR2 = stopR * stopR;
    const kbDecay = Math.exp(-4.0 * dt);

    for (let i = 0; i < this.maxCount; i++) {
      if (!this.alive[i]) continue;
      const px = this.pos[i*3+0], pz = this.pos[i*3+2];
      const dx0 = targetX - px, dz0 = targetZ - pz;
      const d2 = dx0*dx0 + dz0*dz0;

      // 分離力（避免疊在一起）
      let sx = 0, sz = 0;
      const nbrs = this.hash.queryXZ(px, pz, sepR);
      for (let n = 0; n < nbrs.length; n++) {
        const j = nbrs[n];
        if (j === i || !this.alive[j]) continue;
        const ox = px - this.pos[j*3+0];
        const oz = pz - this.pos[j*3+2];
        const od2 = ox*ox + oz*oz;
        if (od2 > 0 && od2 < sepR2) {
          const od = Math.sqrt(od2);
          const k = (sepR - od) / sepR;
          sx += (ox / od) * k;
          sz += (oz / od) * k;
        }
      }

      let vx, vz;
      if (d2 > stopR2) {
        // moving toward crystal
        this.state[i] = 0;
        const d = Math.sqrt(d2);
        const dx = dx0 / d, dz = dz0 / d;
        vx = dx * speed + sx * speed * 0.6;
        vz = dz * speed + sz * speed * 0.6;
      } else {
        // in firing range — stop and fire
        vx = sx * speed * 0.4;
        vz = sz * speed * 0.4;

        if (this.state[i] === 0) {
          // just arrived → cooldown
          this.state[i] = 2;
          this.fireCooldown[i] = 0.4;
        }

        if (this.state[i] === 2) {
          this.fireCooldown[i] -= dt;
          if (this.fireCooldown[i] <= 0) {
            this.state[i] = 1;
            this.chargeTime[i] = CONFIG.slingerChargeTime;
          }
        } else if (this.state[i] === 1) {
          this.chargeTime[i] -= dt;
          if (this.chargeTime[i] <= 0) {
            // FIRE！
            const d = Math.sqrt(d2);
            const bvx = (targetX - px) / d * CONFIG.bulletSpeed;
            const bvz = (targetZ - pz) / d * CONFIG.bulletSpeed;
            bullets.spawn(px, pz, bvx, bvz);
            if (audio) audio.playSlingerShoot();
            this.state[i] = 2;
            this.fireCooldown[i] = CONFIG.slingerFireInterval;
          }
        }
      }

      // knockback
      const kbx = this.knockback[i*3+0] * kbDecay;
      const kbz = this.knockback[i*3+2] * kbDecay;
      this.knockback[i*3+0] = kbx;
      this.knockback[i*3+2] = kbz;
      vx += kbx; vz += kbz;

      this.vel[i*3+0] = vx; this.vel[i*3+2] = vz;
      this.pos[i*3+0] = px + vx * dt;
      this.pos[i*3+2] = pz + vz * dt;

      if (this.flashTime[i] > 0) this.flashTime[i] -= dt;
    }
  }

  syncInstances() {
    const invMaxSpeed = 1 / CONFIG.slingerSpeed;
    const knockNorm = 1 / 10.0;
    for (let i = 0; i < this.maxCount; i++) {
      if (!this.alive[i]) {
        if (!this._hidden[i]) {
          this._tmpM.makeScale(0, 0, 0);
          this.mesh.setMatrixAt(i, this._tmpM);
          this._hidden[i] = 1;
          this.aSpeed[i] = 0;
          this.aKnock[i] = 0;
          this.aCharge[i] = 0;
        }
        continue;
      }
      this._hidden[i] = 0;
      this._tmpV.set(this.pos[i*3+0], this.pos[i*3+1], this.pos[i*3+2]);
      const vx = this.vel[i*3+0], vz = this.vel[i*3+2];
      const yaw = (vx*vx + vz*vz > 0.0001) ? Math.atan2(vx, vz) : 0;
      this._tmpQ.setFromAxisAngle(this._up, yaw);
      this._tmpM.compose(this._tmpV, this._tmpQ, this._tmpScale);
      this.mesh.setMatrixAt(i, this._tmpM);

      let r, g, b;
      if (this.flashTime[i] > 0) {
        const f = this.flashTime[i] / 0.1;
        r = 1 + f * 3; g = 1 + f * 3; b = 1 + f * 3;
      } else if (this.state[i] === 1) {
        const c = this.chargeTime[i] / CONFIG.slingerChargeTime;
        const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.03);
        r = this._baseColor.r + (1.5 + pulse) * (1 - c);
        g = this._baseColor.g + 0.3 * pulse * (1 - c);
        b = this._baseColor.b;
      } else {
        r = this._baseColor.r; g = this._baseColor.g; b = this._baseColor.b;
      }
      this._tmpColor.setRGB(r, g, b);
      this.mesh.setColorAt(i, this._tmpColor);

      // W10
      const sp = Math.hypot(vx, vz);
      this.aSpeed[i] = Math.min(1, sp * invMaxSpeed);
      const km = Math.hypot(this.knockback[i*3+0], this.knockback[i*3+2]);
      this.aKnock[i] = Math.min(1, km * knockNorm);
      // 蓄力進度 = 1 - chargeTime/duration（chargeTime 0→duration 倒數，所以 1-x 是 0→1 上升）
      this.aCharge[i] = (this.state[i] === 1)
        ? Math.max(0, 1 - this.chargeTime[i] / CONFIG.slingerChargeTime)
        : 0;
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this._aSpeedAttr.needsUpdate = true;
    this._aKnockAttr.needsUpdate = true;
    this._aChargeAttr.needsUpdate = true;
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
    this.knockback[i*3+0] += kx;
    this.knockback[i*3+2] += kz;
  }

  getPos(i, out) {
    out.set(this.pos[i*3+0], this.pos[i*3+1], this.pos[i*3+2]);
    return out;
  }
}


/**
 * 子彈池：InstancedMesh 256 個
 * 直線飛行 → 碰水晶或超出生命 → 回收
 */
export class BulletPool {
  constructor(scene, maxCount) {
    this.maxCount = maxCount;
    this.activeCount = 0;

    const geo = new THREE.SphereGeometry(CONFIG.bulletRadius, 8, 8);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xff8866,
      transparent: true,
      opacity: 1,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, maxCount);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);

    this.pos = new Float32Array(maxCount * 3);
    this.vel = new Float32Array(maxCount * 3);
    this.life = new Float32Array(maxCount);
    this.alive = new Uint8Array(maxCount);
    this._hidden = new Uint8Array(maxCount).fill(1);   // P6

    this._hide = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < maxCount; i++) this.mesh.setMatrixAt(i, this._hide);
    this.mesh.instanceMatrix.needsUpdate = true;

    this._tmpM = new THREE.Matrix4();
    this._tmpV = new THREE.Vector3();
    this._tmpQ = new THREE.Quaternion();
    this._tmpScale = new THREE.Vector3(1, 1, 1);
  }

  spawn(x, z, vx, vz) {
    for (let i = 0; i < this.maxCount; i++) {
      if (this.alive[i]) continue;
      this.pos[i*3+0] = x; this.pos[i*3+1] = 1.0; this.pos[i*3+2] = z;
      this.vel[i*3+0] = vx; this.vel[i*3+1] = 0; this.vel[i*3+2] = vz;
      this.life[i] = CONFIG.bulletLife;
      this.alive[i] = 1;
      this.activeCount++;
      return true;
    }
    return false;
  }

  /** 推進 + 檢查水晶碰撞，回傳這幀命中數量
   *  P6: 死掉的 bullet 只在剛死那幀寫 scale-0，後續跳過
   *  2026-05-22: 加 perks 參數，Critical Suspension 持有時飛行物減速
   */
  update(dt, crystal, perks) {
    let hits = 0;
    const cx = crystal.position.x, cz = crystal.position.z;
    const cR = CONFIG.crystalRadius * 1.4;
    const cR2 = cR * cR;
    // Critical Suspension：被動讓敵方飛行物速度倍率（用 dt scaling 等效於 vel 縮放）
    const projMult = (perks && perks.criticalSuspension) ? CONFIG.criticalSuspensionProjMult : 1.0;
    const moveDt = dt * projMult;
    for (let i = 0; i < this.maxCount; i++) {
      if (!this.alive[i]) {
        if (!this._hidden[i]) {
          this.mesh.setMatrixAt(i, this._hide);
          this._hidden[i] = 1;
        }
        continue;
      }
      this.pos[i*3+0] += this.vel[i*3+0] * moveDt;
      this.pos[i*3+2] += this.vel[i*3+2] * moveDt;
      this.life[i] -= dt;

      const dx = this.pos[i*3+0] - cx;
      const dz = this.pos[i*3+2] - cz;
      if (dx*dx + dz*dz < cR2) {
        this.alive[i] = 0;
        this.activeCount--;
        hits++;
        this.mesh.setMatrixAt(i, this._hide);
        this._hidden[i] = 1;
        continue;
      }
      if (this.life[i] <= 0) {
        this.alive[i] = 0;
        this.activeCount--;
        this.mesh.setMatrixAt(i, this._hide);
        this._hidden[i] = 1;
        continue;
      }

      this._hidden[i] = 0;
      this._tmpV.set(this.pos[i*3+0], this.pos[i*3+1], this.pos[i*3+2]);
      this._tmpM.compose(this._tmpV, this._tmpQ, this._tmpScale);
      this.mesh.setMatrixAt(i, this._tmpM);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    return hits;
  }
}
