import * as THREE from 'three';
import { CONFIG } from './config.js';
import { SpatialHash } from './spatialHash.js';
import { injectFx } from './glitch.js';

/**
 * Lancer — 突刺兵 / 蓄力直線衝刺型（2026-05-22 新增）
 * 狀態機：
 *   0 WALK    — 朝 hero 走，進入 lancerWalkRange 後考慮蓄力
 *   1 WINDUP  — 紅色預警線，蓄力 lancerWindupDuration 秒，期間鎖定方向但不動
 *   2 CHARGE  — 沿鎖定方向以 lancerChargeSpeed 衝刺 lancerChargeDuration 秒，撞到 hero 重擊
 *   3 COOLDOWN — 停下 lancerCooldown 秒，視覺淡色，給玩家反擊空檔
 * 視覺：紅色錐體 + 蓄力時 emissive 跳脈，charge 時拉長
 */
export class Lancers {
  constructor(scene, maxCount) {
    this.maxCount = maxCount;
    this.activeCount = 0;
    this.xpReward = CONFIG.lancerXp;

    // 錐形造型 — 槍尖朝前
    const geo = new THREE.ConeGeometry(0.32, 1.1, 5);
    geo.rotateX(Math.PI / 2);   // 改朝 +Z（face forward）
    geo.translate(0, 0.55, 0);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xaa1133,
      emissiveIntensity: 0.7,
      roughness: 0.4,
      metalness: 0.4,
      flatShading: true,
    });
    injectFx(mat, {
      rimColor: [1.0, 0.3, 0.4],
      rimStrength: 0.9,
      aoStrength: 0.3,
      breathAmp: 0.02,
      breathSpeed: 3.5,
      proceduralAnim: true,
      crawlAmp: 0.05,
      crawlFreq: 4.5,
      crawlSpatialFreq: 2.2,
      squashAmp: 0.35,
      hasCharge: true,
      chargeStretch: 0.55,        // 蓄力時拉長
      normalTint: 0.07,
    });

    this.aSpeed = new Float32Array(maxCount);
    this.aKnock = new Float32Array(maxCount);
    this.aCharge = new Float32Array(maxCount);
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

    this.pos = new Float32Array(maxCount * 3);
    this.vel = new Float32Array(maxCount * 3);
    this.knockback = new Float32Array(maxCount * 3);
    this.hp = new Float32Array(maxCount);
    this.alive = new Uint8Array(maxCount);
    this.flashTime = new Float32Array(maxCount);
    this.dashHitTag = new Uint8Array(maxCount);
    this.state = new Uint8Array(maxCount);              // 0=walk, 1=windup, 2=charge, 3=cooldown
    this.stateTimer = new Float32Array(maxCount);       // 當前 state 剩餘秒
    this.chargeDir = new Float32Array(maxCount * 2);    // 鎖定的衝刺方向 (x, z)
    this.heroHitInCharge = new Uint8Array(maxCount);    // 本次衝刺是否已撞到 hero（避免重複扣血）
    this._hidden = new Uint8Array(maxCount).fill(1);

    const baseColor = new THREE.Color(0x882233);
    const windupColor = new THREE.Color(0xff5566);
    const chargeColor = new THREE.Color(0xffaa44);
    this._baseColor = baseColor;
    this._windupColor = windupColor;
    this._chargeColor = chargeColor;
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

    this.hash = new SpatialHash(1.8);
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
      this.hp[i] = CONFIG.lancerHp;
      this.alive[i] = 1;
      this.flashTime[i] = 0;
      this.dashHitTag[i] = 0;
      this.state[i] = 0;
      this.stateTimer[i] = 0;
      this.chargeDir[i*2+0] = 0;
      this.chargeDir[i*2+1] = 0;
      this.heroHitInCharge[i] = 0;
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

  /**
   * @returns 本幀觸發 charge 命中 hero 的 lancer index 陣列（game 取走後扣 hero 血）
   */
  update(dt, heroX, heroZ) {
    this.fillHash();
    const walkSp = CONFIG.lancerWalkSpeed;
    const chargeSp = CONFIG.lancerChargeSpeed;
    const walkRange = CONFIG.lancerWalkRange;
    const kbDecay = Math.exp(-4.5 * dt);
    const heroHits = [];
    const heroHitR2 = (CONFIG.heroRadius + CONFIG.lancerRadius) ** 2;

    for (let i = 0; i < this.maxCount; i++) {
      if (!this.alive[i]) continue;
      const px = this.pos[i*3+0], pz = this.pos[i*3+2];

      this.stateTimer[i] -= dt;

      // state 機
      let vx = 0, vz = 0;
      const dxh = heroX - px, dzh = heroZ - pz;
      const dh = Math.hypot(dxh, dzh);

      if (this.state[i] === 0) {
        // WALK：朝 hero 走
        if (dh > 0.001) { vx = (dxh / dh) * walkSp; vz = (dzh / dh) * walkSp; }
        // 進入射程 + 隨機觸發蓄力（避免所有 lancer 同步蓄力）
        if (dh < walkRange && this.stateTimer[i] <= 0) {
          this.state[i] = 1;
          this.stateTimer[i] = CONFIG.lancerWindupDuration;
          if (dh > 0.001) {
            this.chargeDir[i*2+0] = dxh / dh;
            this.chargeDir[i*2+1] = dzh / dh;
          }
        }
      } else if (this.state[i] === 1) {
        // WINDUP：原地不動但持續鎖方向（給 hero 預判時間，方向已凍結）
        vx = 0; vz = 0;
        if (this.stateTimer[i] <= 0) {
          this.state[i] = 2;
          this.stateTimer[i] = CONFIG.lancerChargeDuration;
          this.heroHitInCharge[i] = 0;
        }
      } else if (this.state[i] === 2) {
        // CHARGE：以鎖定方向衝刺
        vx = this.chargeDir[i*2+0] * chargeSp;
        vz = this.chargeDir[i*2+1] * chargeSp;
        if (this.stateTimer[i] <= 0) {
          this.state[i] = 3;
          this.stateTimer[i] = CONFIG.lancerCooldown;
        }
        // 撞 hero 判定（中段就觸發，不靠 _processHeroTouchDamage）
        if (!this.heroHitInCharge[i]) {
          if (dxh*dxh + dzh*dzh < heroHitR2) {
            this.heroHitInCharge[i] = 1;
            heroHits.push(i);
          }
        }
      } else {
        // COOLDOWN：停下，慢慢加 ~0.5x walk 漂回 hero
        if (dh > 0.001) { vx = (dxh / dh) * walkSp * 0.4; vz = (dzh / dh) * walkSp * 0.4; }
        if (this.stateTimer[i] <= 0) {
          this.state[i] = 0;
          this.stateTimer[i] = 0.5 + Math.random() * 0.8;   // walk 期下次蓄力的隨機 jitter
        }
      }

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
    return heroHits;
  }

  syncInstances() {
    const invMaxSpeed = 1 / CONFIG.lancerChargeSpeed;
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
      // Lancer 朝向：windup/charge 期間用鎖定方向，walk/cooldown 用速度方向
      let yaw;
      if (this.state[i] === 1 || this.state[i] === 2) {
        yaw = Math.atan2(this.chargeDir[i*2+0], this.chargeDir[i*2+1]);
      } else {
        const vx = this.vel[i*3+0], vz = this.vel[i*3+2];
        yaw = (vx*vx + vz*vz > 0.0001) ? Math.atan2(vx, vz) : 0;
      }
      this._tmpQ.setFromAxisAngle(this._up, yaw);
      this._tmpM.compose(this._tmpV, this._tmpQ, this._tmpScale);
      this.mesh.setMatrixAt(i, this._tmpM);

      // 顏色：base / windup（紅黃 pulse） / charge（橘紅） / cooldown（暗）
      let r, g, b;
      if (this.flashTime[i] > 0) {
        const f = this.flashTime[i] / 0.1;
        r = 1 + f * 3; g = 1 + f * 3; b = 1 + f * 3;
      } else if (this.state[i] === 1) {
        const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.03);
        r = this._baseColor.r + (this._windupColor.r - this._baseColor.r) * pulse + 0.3 * pulse;
        g = this._baseColor.g + (this._windupColor.g - this._baseColor.g) * pulse;
        b = this._baseColor.b + (this._windupColor.b - this._baseColor.b) * pulse;
      } else if (this.state[i] === 2) {
        r = this._chargeColor.r;
        g = this._chargeColor.g;
        b = this._chargeColor.b;
      } else if (this.state[i] === 3) {
        r = this._baseColor.r * 0.5;
        g = this._baseColor.g * 0.5;
        b = this._baseColor.b * 0.5;
      } else {
        r = this._baseColor.r;
        g = this._baseColor.g;
        b = this._baseColor.b;
      }
      this._tmpColor.setRGB(r, g, b);
      this.mesh.setColorAt(i, this._tmpColor);

      const sp = Math.hypot(this.vel[i*3+0], this.vel[i*3+2]);
      this.aSpeed[i] = Math.min(1, sp * invMaxSpeed);
      const km = Math.hypot(this.knockback[i*3+0], this.knockback[i*3+2]);
      this.aKnock[i] = Math.min(1, km * knockNorm);
      // aCharge：windup 進度 0→1 用來把 cone 拉長（視覺上像拉弓）
      this.aCharge[i] = (this.state[i] === 1)
        ? Math.max(0, 1 - this.stateTimer[i] / CONFIG.lancerWindupDuration)
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
    // 衝刺中擊退打折（otherwise 一推就脫離方向）
    const mult = (this.state[i] === 2) ? 0.2 : 0.8;
    this.knockback[i*3+0] += kx * mult;
    this.knockback[i*3+2] += kz * mult;
  }

  consumeAt(i) {
    if (!this.alive[i]) return;
    this.alive[i] = 0;
    this.activeCount--;
  }
}
