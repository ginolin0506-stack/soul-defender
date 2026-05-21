import * as THREE from 'three';
import { CONFIG } from './config.js';
import { SpatialHash } from './spatialHash.js';

/**
 * Boss Chronos — 時界主宰（W6）
 * - 不擋線、不推人，存在感全靠「時間流速」
 * - 活著時敵人時間 ×2（hero 不受影響 → hero 顯得「慢但精準」）
 * - Hero dash 中 → 敵人時間 ×0.5（給玩家秀操作）
 * - swarm-like 介面相容 hero.autoAttack
 */
export class Chronos {
  constructor(scene) {
    this.maxCount = 1;
    this.alive = new Uint8Array(1);
    this.pos = new Float32Array(3);
    this.hp = new Float32Array(1);
    this.maxHp = CONFIG.chronosHp;
    this.flashTime = new Float32Array(1);
    this.dashHitTag = new Uint8Array(1);
    this.xpReward = CONFIG.chronosXp;
    this.isBoss = true;
    this.hash = new SpatialHash(3.0);

    this.orbitAngle = 0;
    // W7+ Temporal Hourglass：受傷倍率，由 game.js 每幀依 chronosTimeMult 更新
    // 1.0 = 全力受傷（bullet-time 黃金窗口）； 0.15 = 85% 免傷（全速怪潮時）
    this.damageTakenMult = CONFIG.chronosDmgReductionMin;

    // === 視覺：浮空時鐘盤 ===
    const group = new THREE.Group();

    // 中心球體（boss 本體）
    const coreGeo = new THREE.SphereGeometry(CONFIG.chronosRadius, 24, 16);
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0x1a1530,
      emissive: 0x66ddff,
      emissiveIntensity: 0.7,
      roughness: 0.25,
      metalness: 0.9,
      flatShading: false,
    });
    const core = new THREE.Mesh(coreGeo, coreMat);
    core.position.y = 5;
    core.castShadow = true;
    group.add(core);
    this.core = core;
    this.coreMat = coreMat;

    // 時鐘環（外圈大環）
    const ringGeo = new THREE.TorusGeometry(2.6, 0.18, 8, 64);
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0xaaffee,
      emissive: 0x66ddff,
      emissiveIntensity: 0.9,
      roughness: 0.2,
      metalness: 0.7,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.y = 5;
    ring.rotation.x = Math.PI / 2;
    group.add(ring);
    this.ring = ring;
    this.ringMat = ringMat;

    // 內圈小環（反向自轉，秀「時鐘」感）
    const ring2Geo = new THREE.TorusGeometry(1.9, 0.08, 6, 48);
    const ring2 = new THREE.Mesh(ring2Geo, ringMat.clone());
    ring2.position.y = 5;
    ring2.rotation.x = Math.PI / 2 + 0.3;
    group.add(ring2);
    this.ring2 = ring2;

    // 指針（細長條）
    const handGeo = new THREE.BoxGeometry(2.4, 0.1, 0.08);
    const handMat = new THREE.MeshBasicMaterial({ color: 0xffeebb });
    const hand = new THREE.Mesh(handGeo, handMat);
    hand.position.y = 5;
    hand.position.x = 1.2;
    group.add(hand);
    this.hand = hand;
    this.handMat = handMat;

    // 地面投影圈（標記 Chronos 位置）
    const shadowGeo = new THREE.RingGeometry(1.4, 1.8, 32);
    shadowGeo.rotateX(-Math.PI / 2);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x66ddff,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
    });
    const shadow = new THREE.Mesh(shadowGeo, shadowMat);
    shadow.position.y = 0.04;
    group.add(shadow);
    this.shadow = shadow;
    this.shadowMat = shadowMat;

    group.visible = false;
    scene.add(group);
    this.mesh = group;
  }

  spawn(crystal) {
    this.alive[0] = 1;
    this.hp[0] = this.maxHp;
    this.flashTime[0] = 0;
    this.dashHitTag[0] = 0;
    this.orbitAngle = Math.random() * Math.PI * 2;
    this.pos[0] = crystal.position.x + Math.cos(this.orbitAngle) * CONFIG.chronosOrbitRadius;
    this.pos[2] = crystal.position.z + Math.sin(this.orbitAngle) * CONFIG.chronosOrbitRadius;
    this.mesh.visible = true;
  }

  fillHash() {
    this.hash.clear();
    if (this.alive[0]) this.hash.insertXZ(0, this.pos[0], this.pos[2]);
  }

  update(dt, hero, crystal) {
    if (!this.alive[0]) {
      if (this.mesh.visible) this.mesh.visible = false;
      return;
    }

    // 軌道移動（不沿 tether 線）
    this.orbitAngle += CONFIG.chronosOrbitSpeed * dt;
    const radius = CONFIG.chronosOrbitRadius + Math.sin(this.orbitAngle * 1.3) * 1.8;
    this.pos[0] = crystal.position.x + Math.cos(this.orbitAngle) * radius;
    this.pos[2] = crystal.position.z + Math.sin(this.orbitAngle) * radius;
    this.mesh.position.set(this.pos[0], 0, this.pos[2]);

    // 時鐘動畫
    this.core.rotation.y += dt * 0.6;
    this.ring.rotation.z += dt * 0.4;
    this.ring2.rotation.z -= dt * 1.1;
    // 指針：根據 elapsed 旋轉（不真的對應遊戲時間，純視覺）
    const handAngle = performance.now() * 0.003;
    this.hand.position.x = Math.cos(handAngle) * 1.2;
    this.hand.position.z = Math.sin(handAngle) * 1.2;
    this.hand.rotation.y = -handAngle;

    // flash
    if (this.flashTime[0] > 0) this.flashTime[0] -= dt;
    const f = Math.max(0, this.flashTime[0] / 0.15);
    this.coreMat.emissiveIntensity = 0.7 + f * 4;
    this.handMat.color.setRGB(1 + f * 3, 0.93 + f * 3, 0.73 + f * 3);

    // 地面陰影圈呼吸（脈動表現「時間扭曲」感）
    // W7+ Hourglass：受傷倍率高（玩家在 bullet-time 窗口）時陰影圈更亮，提示「現在能打」
    const vulnT = (this.damageTakenMult - CONFIG.chronosDmgReductionMin)
      / (CONFIG.chronosDmgReductionMax - CONFIG.chronosDmgReductionMin);
    this.shadowMat.opacity = 0.15 + 0.25 * vulnT + 0.1 * Math.sin(performance.now() * 0.008);
    this.shadowMat.color.setRGB(0.4 + vulnT * 0.6, 0.87 + vulnT * 0.1, 1.0);  // 偏白藍 = 易受傷
  }

  damage(i, amount) {
    if (!this.alive[0]) return false;
    // W7+ Temporal Hourglass：受傷倍率與全域時間流速反向掛鉤
    const effectiveDmg = amount * this.damageTakenMult;
    this.hp[0] -= effectiveDmg;
    this.flashTime[0] = 0.15;
    if (this.hp[0] <= 0) {
      this.alive[0] = 0;
      this.mesh.visible = false;
      return true;
    }
    return false;
  }

  applyKnockback() { /* 免疫 */ }

  get position() {
    return { x: this.pos[0], z: this.pos[2] };
  }
}
