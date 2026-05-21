import * as THREE from 'three';
import { CONFIG } from './config.js';
import { SpatialHash } from './spatialHash.js';

/**
 * Boss Ohm — 切繫帶王
 * 行為：軌道環繞水晶，三階段加速。軀體與英雄→水晶線段交集時切斷 tether
 * 介面：與 swarm 相同（alive[i], pos[i*3], damage, applyKnockback...）→ 可直接套到 hero.autoAttack
 */
export class Boss {
  constructor(scene) {
    this.maxCount = 1;
    this.alive = new Uint8Array(1);
    this.pos = new Float32Array(3);
    this.vel = new Float32Array(3);
    this.knockback = new Float32Array(3);
    this.hp = new Float32Array(1);
    this.maxHp = CONFIG.bossHp;
    this.flashTime = new Float32Array(1);
    this.dashHitTag = new Uint8Array(1);
    this.xpReward = CONFIG.bossXp;
    this.isBoss = true;     // W4: 給 Regicide 用

    this.phase = 0;
    this.orbitAngle = 0;
    this.shockwaveTimer = CONFIG.bossShockwaveInterval;
    this.activeShockwave = null;       // {x, z, radius, hitFlag}
    // W7+ Overload Resonance: phase 2 把 pulse 傷害的一部分儲存，定期打水晶
    this.overloadCharge = 0;
    this.overloadTimer = 0;
    this.overloadDischargeDmg = 0;     // game.js 每 tick 讀+清
    this.overloadFlash = 0;            // 視覺：discharge 後短閃

    this.hash = new SpatialHash(3.5);

    // === 視覺 ===
    const group = new THREE.Group();

    // 主體：六角柱
    const bodyGeo = new THREE.CylinderGeometry(CONFIG.bossRadius, CONFIG.bossRadius * 1.2, 4.5, 6);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x0a0518,
      emissive: 0x441166,
      emissiveIntensity: 0.5,
      roughness: 0.4,
      metalness: 0.75,
      flatShading: true,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 2.25;
    body.castShadow = true;
    group.add(body);
    this.bodyMat = bodyMat;

    // 上錐
    const topGeo = new THREE.ConeGeometry(CONFIG.bossRadius * 0.9, 1.5, 6);
    const top = new THREE.Mesh(topGeo, bodyMat);
    top.position.y = 5.0;
    group.add(top);

    // 紅眼
    const eyeGeo = new THREE.SphereGeometry(0.42, 16, 12);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff3344 });
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.y = 3.2;
    eye.position.z = CONFIG.bossRadius;
    group.add(eye);
    this.eye = eye;
    this.eyeMat = eyeMat;

    // 底環（軌道光環）
    const ringGeo = new THREE.RingGeometry(CONFIG.bossRadius * 1.5, CONFIG.bossRadius * 1.8, 32);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xff3366,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.y = 0.05;
    group.add(ring);
    this.ring = ring;
    this.ringMat = ringMat;

    group.visible = false;
    scene.add(group);
    this.mesh = group;

    // === 衝擊波視覺 ===
    const swGeo = new THREE.RingGeometry(0.95, 1.05, 64);
    swGeo.rotateX(-Math.PI / 2);
    const swMat = new THREE.MeshBasicMaterial({
      color: 0xff4477,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const sw = new THREE.Mesh(swGeo, swMat);
    sw.visible = false;
    scene.add(sw);
    this.shockwaveMesh = sw;
    this.shockwaveMat = swMat;
  }

  spawn(crystal) {
    this.alive[0] = 1;
    this.hp[0] = this.maxHp;
    this.flashTime[0] = 0;
    this.dashHitTag[0] = 0;
    this.phase = 0;
    this.orbitAngle = Math.random() * Math.PI * 2;
    this.pos[0] = crystal.position.x + Math.cos(this.orbitAngle) * CONFIG.bossOrbitRadius;
    this.pos[1] = 0;
    this.pos[2] = crystal.position.z + Math.sin(this.orbitAngle) * CONFIG.bossOrbitRadius;
    this.mesh.visible = true;
    this.shockwaveTimer = CONFIG.bossShockwaveInterval;
    this.activeShockwave = null;
    this.overloadCharge = 0;
    this.overloadTimer = CONFIG.bossOverloadDischargeInterval;
    this.overloadDischargeDmg = 0;
    this.overloadFlash = 0;
  }

  fillHash() {
    this.hash.clear();
    if (this.alive[0]) this.hash.insertXZ(0, this.pos[0], this.pos[2]);
  }

  update(dt, hero, crystal) {
    if (!this.alive[0]) {
      if (this.mesh.visible) this.mesh.visible = false;
      this._updateShockwave(dt, crystal);
      return null;
    }

    // === 階段判定 ===
    // W7+ Counter-build：phase 2 閾值從 0.25 提前到 0.35（Overload Resonance + 衝擊波並行）
    const ratio = this.hp[0] / this.maxHp;
    const prevPhase = this.phase;
    if (ratio < CONFIG.bossPhase2HpRatio) this.phase = 2;
    else if (ratio < 0.5) this.phase = 1;
    else this.phase = 0;
    // 首次進入 P2 立刻把 timer 歸零，讓首發 discharge 1 tick 內就 fire（避免 fast kill 完全 skip 機制）
    if (this.phase === 2 && prevPhase !== 2) this.overloadTimer = 0;

    // === 軌道移動 ===
    const orbitSpeed = [CONFIG.bossOrbitSpeedP0, CONFIG.bossOrbitSpeedP1, CONFIG.bossOrbitSpeedP2][this.phase];
    this.orbitAngle += orbitSpeed * dt;
    const radius = CONFIG.bossOrbitRadius + Math.sin(this.orbitAngle * 0.6) * 2.5;
    this.pos[0] = crystal.position.x + Math.cos(this.orbitAngle) * radius;
    this.pos[2] = crystal.position.z + Math.sin(this.orbitAngle) * radius;
    this.mesh.position.set(this.pos[0], 0, this.pos[2]);
    this.mesh.rotation.y += dt * 0.4;

    // 眼睛 look at hero（P3: 補上 group rotation 的反向，才能在 local space 精準對準）
    const eyeWorldDir = Math.atan2(hero.position.x - this.pos[0], hero.position.z - this.pos[2]);
    const eyeLocalDir = eyeWorldDir - this.mesh.rotation.y;
    this.eye.position.x = Math.sin(eyeLocalDir) * CONFIG.bossRadius;
    this.eye.position.z = Math.cos(eyeLocalDir) * CONFIG.bossRadius;

    // flash + W7+ overload discharge 視覺強閃
    if (this.flashTime[0] > 0) this.flashTime[0] -= dt;
    const f = Math.max(0, this.flashTime[0] / 0.15);
    const od = Math.max(0, this.overloadFlash / 0.25);
    this.bodyMat.emissiveIntensity = 0.5 + f * 3 + od * 5;
    this.eyeMat.color.setRGB(1 + f * 4 + od * 6, 0.2 + f * 4, 0.27 + f * 4);

    // 環脈動 — 隨階段顏色變
    const phaseColor = [0xff3366, 0xff7733, 0xff0011][this.phase];
    this.ringMat.color.setHex(phaseColor);
    this.ringMat.opacity = 0.35 + 0.15 * Math.sin(performance.now() * 0.005);

    // 階段 2：衝擊波 + W7+ Overload Resonance discharge
    if (this.phase === 2) {
      this.shockwaveTimer -= dt;
      if (this.shockwaveTimer <= 0 && !this.activeShockwave) {
        this.shockwaveTimer = CONFIG.bossShockwaveInterval;
        this._emitShockwave();
      }
      // Overload：tick timer，到了就把儲存值打出去
      this.overloadTimer -= dt;
      if (this.overloadTimer <= 0) {
        this.overloadTimer = CONFIG.bossOverloadDischargeInterval;
        if (this.overloadCharge > 0) {
          this.overloadDischargeDmg = this.overloadCharge * CONFIG.bossOverloadDischargeMult;
          this.overloadCharge = 0;
          this.overloadFlash = 0.25;  // body 短暫白閃
        }
      }
    } else {
      // 退出 phase 2（不太可能但保險）→ 清掉儲存避免下次進 P2 直接放
      this.overloadCharge = 0;
    }
    // overloadFlash 衰減（疊在 phase 2 之外也要跑，閃完才結束）
    if (this.overloadFlash > 0) this.overloadFlash -= dt;
    return this._updateShockwave(dt, crystal);
  }

  /** 衝擊波推進，回傳這幀有沒有命中水晶 */
  _updateShockwave(dt, crystal) {
    if (!this.activeShockwave) {
      this.shockwaveMesh.visible = false;
      return null;
    }
    const sw = this.activeShockwave;
    sw.radius += CONFIG.bossShockwaveSpeed * dt;
    this.shockwaveMesh.position.set(sw.x, 0.1, sw.z);
    this.shockwaveMesh.scale.set(sw.radius, 1, sw.radius);
    this.shockwaveMat.opacity = Math.max(0, 0.8 * (1 - sw.radius / CONFIG.bossShockwaveMaxRadius));

    let crystalHit = false;
    if (!sw.hitCrystal) {
      const dx = crystal.position.x - sw.x;
      const dz = crystal.position.z - sw.z;
      const d = Math.hypot(dx, dz);
      if (Math.abs(d - sw.radius) < 1.0) {
        sw.hitCrystal = true;
        crystalHit = true;
      }
    }

    if (sw.radius >= CONFIG.bossShockwaveMaxRadius) {
      this.activeShockwave = null;
      this.shockwaveMesh.visible = false;
    }
    return crystalHit;
  }

  _emitShockwave() {
    this.activeShockwave = {
      x: this.pos[0],
      z: this.pos[2],
      radius: 1,
      hitCrystal: false,
    };
    this.shockwaveMesh.visible = true;
    this.shockwaveMat.opacity = 0.8;
  }

  /**
   * 檢查 Boss 是否正擋在繫帶上（hero → crystal 線段距離 < bossSeverRadius）
   */
  isOnTether(hero, crystal) {
    if (!this.alive[0]) return false;
    const ax = hero.position.x, az = hero.position.z;
    const bx = crystal.position.x, bz = crystal.position.z;
    const dx = bx - ax, dz = bz - az;
    const lenSq = dx*dx + dz*dz;
    if (lenSq < 0.01) return false;

    const t = ((this.pos[0] - ax) * dx + (this.pos[2] - az) * dz) / lenSq;
    if (t < 0 || t > 1) return false;

    const cx = ax + t * dx;
    const cz = az + t * dz;
    const perpX = this.pos[0] - cx;
    const perpZ = this.pos[2] - cz;
    return perpX*perpX + perpZ*perpZ < CONFIG.bossSeverRadius * CONFIG.bossSeverRadius;
  }

  damage(i, amount) {
    if (!this.alive[0]) return false;
    this.flashTime[0] = 0.15;
    // W7+ Overload Resonance：P2 時傷害「分流」— storePct 變 charge，剩下才削 HP
    // 效果：P2 延長 → discharge 有時間 fire → 反過來把儲存能量打回水晶（bypass shield）
    if (this.phase === 2) {
      const stored = amount * CONFIG.bossOverloadStorePct;
      const hpDmg = amount - stored;
      this.hp[0] -= hpDmg;
      this.overloadCharge += stored;
    } else {
      this.hp[0] -= amount;
    }
    if (this.hp[0] <= 0) {
      this.alive[0] = 0;
      this.mesh.visible = false;
      return true;
    }
    return false;
  }

  applyKnockback(i, kx, kz) {
    // 免疫擊退
  }

  get position() {
    return { x: this.pos[0], z: this.pos[2] };
  }
}
