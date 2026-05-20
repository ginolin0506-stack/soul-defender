import * as THREE from 'three';
import { CONFIG } from './config.js';
import { SpatialHash } from './spatialHash.js';

/**
 * Boss Nexus — 反 Ohm 對位
 * - 不移動，固定在水晶正上方
 * - 3 個量子干擾柱（pillars）在環繞水晶的圓周上
 * - 斥力場：pillars 全活時把英雄推離水晶（強迫高張力）
 * - 玩家進入 pillar 半徑可「燒柱」(occupation damage)
 * - 三柱全毀 → Nexus 本體變脆（吃滿傷）
 * - swarm-like 介面相容 hero.autoAttack
 */
export class Nexus {
  constructor(scene) {
    this.maxCount = 1;
    this.alive = new Uint8Array(1);
    this.pos = new Float32Array(3);
    this.hp = new Float32Array(1);
    this.maxHp = CONFIG.nexusHp;
    this.flashTime = new Float32Array(1);
    this.dashHitTag = new Uint8Array(1);
    this.xpReward = CONFIG.nexusXp;
    this.isBoss = true;     // W4: 給 Regicide 用
    this.hash = new SpatialHash(3.0);

    this.pillarsAlive = 0;
    this.pillars = [];     // {x, z, hp, alive, mesh, glowMesh}

    // === 主體：浮空黑色巨眼 ===
    const group = new THREE.Group();

    const bodyGeo = new THREE.IcosahedronGeometry(CONFIG.nexusRadius, 1);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x0a0210,
      emissive: 0x220033,
      emissiveIntensity: 0.6,
      roughness: 0.3,
      metalness: 0.9,
      flatShading: true,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 5.5;
    body.castShadow = true;
    group.add(body);
    this.body = body;
    this.bodyMat = bodyMat;

    // 中央巨眼
    const eyeGeo = new THREE.SphereGeometry(0.75, 24, 16);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff2244 });
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.y = 5.5;
    eye.position.z = CONFIG.nexusRadius * 0.7;
    group.add(eye);
    this.eye = eye;
    this.eyeMat = eyeMat;

    // 連接 nexus 到水晶的能量柱（垂直）
    const conduitGeo = new THREE.CylinderGeometry(0.15, 0.15, 5.5, 8);
    const conduitMat = new THREE.MeshBasicMaterial({
      color: 0xff2244,
      transparent: true,
      opacity: 0.5,
    });
    const conduit = new THREE.Mesh(conduitGeo, conduitMat);
    conduit.position.y = 2.75;
    group.add(conduit);
    this.conduitMat = conduitMat;

    group.visible = false;
    scene.add(group);
    this.mesh = group;

    // === 斥力場視覺：地面圓環 ===
    const fieldGeo = new THREE.RingGeometry(CONFIG.nexusFieldRadius - 0.5, CONFIG.nexusFieldRadius, 96);
    fieldGeo.rotateX(-Math.PI / 2);
    const fieldMat = new THREE.MeshBasicMaterial({
      color: 0xff2266,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const field = new THREE.Mesh(fieldGeo, fieldMat);
    field.position.y = 0.08;
    field.visible = false;
    scene.add(field);
    this.field = field;
    this.fieldMat = fieldMat;

    // === Pillars (3 個) ===
    const pillarGeo = new THREE.CylinderGeometry(0.45, 0.6, 4.0, 6);
    const pillarMat = new THREE.MeshStandardMaterial({
      color: 0x180820,
      emissive: 0x661133,
      emissiveIntensity: 0.7,
      roughness: 0.5,
      metalness: 0.4,
      flatShading: true,
    });
    const pillarTopGeo = new THREE.OctahedronGeometry(0.55, 0);
    const pillarTopMat = new THREE.MeshBasicMaterial({ color: 0xff3366 });

    for (let i = 0; i < 3; i++) {
      const pg = new THREE.Group();
      const pm = new THREE.Mesh(pillarGeo, pillarMat);
      pm.position.y = 2.0;
      pm.castShadow = true;
      pg.add(pm);
      const top = new THREE.Mesh(pillarTopGeo, pillarTopMat.clone());
      top.position.y = 4.4;
      pg.add(top);

      // 燒蝕進度環（地面）
      const burnRingGeo = new THREE.RingGeometry(CONFIG.nexusPillarRadius - 0.3, CONFIG.nexusPillarRadius, 48);
      burnRingGeo.rotateX(-Math.PI / 2);
      const burnRingMat = new THREE.MeshBasicMaterial({
        color: 0xff7733,
        transparent: true,
        opacity: 0.25,
        side: THREE.DoubleSide,
      });
      const burnRing = new THREE.Mesh(burnRingGeo, burnRingMat);
      burnRing.position.y = 0.05;
      pg.add(burnRing);

      pg.visible = false;
      scene.add(pg);
      this.pillars.push({
        x: 0, z: 0,
        hp: 0, alive: false,
        mesh: pg, body: pm, topMat: top.material, burnMat: burnRingMat,
      });
    }
  }

  spawn(crystal) {
    this.alive[0] = 1;
    this.hp[0] = this.maxHp;
    this.flashTime[0] = 0;
    this.dashHitTag[0] = 0;
    this.pos[0] = crystal.position.x;
    this.pos[2] = crystal.position.z;
    this.mesh.position.set(crystal.position.x, 0, crystal.position.z);
    this.mesh.visible = true;
    this.field.visible = true;

    // 放置 3 pillars（120° 等分 + 隨機初始角度）
    const offsetAngle = Math.random() * Math.PI * 2;
    for (let i = 0; i < 3; i++) {
      const angle = offsetAngle + (i / 3) * Math.PI * 2;
      const px = crystal.position.x + Math.cos(angle) * CONFIG.nexusPillarRing;
      const pz = crystal.position.z + Math.sin(angle) * CONFIG.nexusPillarRing;
      const p = this.pillars[i];
      p.x = px; p.z = pz;
      p.hp = CONFIG.nexusPillarHp;
      p.alive = true;
      p.mesh.position.set(px, 0, pz);
      p.mesh.visible = true;
      p.topMat.color.setHex(0xff3366);
    }
    this.pillarsAlive = 3;
  }

  fillHash() {
    this.hash.clear();
    if (this.alive[0]) this.hash.insertXZ(0, this.pos[0], this.pos[2]);
  }

  update(dt, hero, crystal) {
    if (!this.alive[0]) {
      if (this.mesh.visible) {
        this.mesh.visible = false;
        this.field.visible = false;
        for (const p of this.pillars) p.mesh.visible = false;
      }
      return;
    }

    // === Body 動態：上下浮動 + 自轉 ===
    this.body.position.y = 5.5 + Math.sin(performance.now() * 0.0015) * 0.25;
    this.body.rotation.y += dt * 0.4;
    this.body.rotation.x += dt * 0.15;

    // B16: eye 是 group child（不隨 body 旋轉），所以直接用世界角度即可
    const worldDir = Math.atan2(hero.position.x - this.pos[0], hero.position.z - this.pos[2]);
    this.eye.position.x = Math.sin(worldDir) * CONFIG.nexusRadius * 0.7;
    this.eye.position.z = Math.cos(worldDir) * CONFIG.nexusRadius * 0.7;
    this.eye.position.y = this.body.position.y;

    // flash
    if (this.flashTime[0] > 0) this.flashTime[0] -= dt;
    const f = Math.max(0, this.flashTime[0] / 0.15);
    this.bodyMat.emissiveIntensity = 0.6 + f * 3;
    this.eyeMat.color.setRGB(1 + f * 4, 0.13 + f * 4, 0.27 + f * 4);

    // === 斥力場 ===
    if (this.pillarsAlive > 0) {
      // 視覺：斥力場環脈動
      this.fieldMat.opacity = 0.25 + 0.15 * Math.sin(performance.now() * 0.006);

      // 推力（持續推離水晶，只在 fieldRadius 內生效）
      const dx = hero.position.x - crystal.position.x;
      const dz = hero.position.z - crystal.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < CONFIG.nexusFieldRadius && dist > 0.01) {
        const t = 1 - dist / CONFIG.nexusFieldRadius;
        const force = t * CONFIG.nexusPushStrength * dt;
        hero.position.x += (dx / dist) * force;
        hero.position.z += (dz / dist) * force;
      } else if (dist < 0.01) {
        // 完全在水晶上的 edge case：朝隨機方向推
        const a = Math.random() * Math.PI * 2;
        const force = CONFIG.nexusPushStrength * dt;
        hero.position.x += Math.cos(a) * force;
        hero.position.z += Math.sin(a) * force;
      }
      // 邊界 clamp
      const half = CONFIG.groundSize / 2 - 2;
      hero.position.x = Math.max(-half, Math.min(half, hero.position.x));
      hero.position.z = Math.max(-half, Math.min(half, hero.position.z));
    } else {
      // 沒柱了 → 場域消失
      this.fieldMat.opacity = 0;
    }

    // === Pillar 燃燒（玩家在範圍內就持續扣 HP）===
    for (const p of this.pillars) {
      if (!p.alive) continue;
      const dx = hero.position.x - p.x;
      const dz = hero.position.z - p.z;
      const d2 = dx*dx + dz*dz;
      const inRange = d2 < CONFIG.nexusPillarRadius * CONFIG.nexusPillarRadius;

      if (inRange) {
        p.hp -= CONFIG.nexusPillarBurnRate * dt;
        // 燒蝕視覺：紅 → 黃 → 白
        const ratio = Math.max(0, p.hp / CONFIG.nexusPillarHp);
        const r = 1.0;
        const g = (1 - ratio);
        const b = 0.4 * (1 - ratio);
        p.topMat.color.setRGB(r, g, b);
        p.burnMat.opacity = 0.35 + 0.4 * Math.sin(performance.now() * 0.02);
        if (p.hp <= 0) {
          p.alive = false;
          p.mesh.visible = false;
          this.pillarsAlive--;
        }
      } else {
        // 不在範圍內 → 燒蝕環淡出
        p.burnMat.opacity = Math.max(0.1, p.burnMat.opacity - dt * 0.8);
      }
    }

    // === Conduit 隨 pillarsAlive 變色：紅 → 變脆橙 ===
    if (this.pillarsAlive === 0) {
      this.conduitMat.color.setRGB(1, 0.7, 0.3);
      this.conduitMat.opacity = 0.9;
    } else {
      this.conduitMat.opacity = 0.35 + 0.3 * (3 - this.pillarsAlive) / 3;
    }
  }

  damage(i, amount) {
    if (!this.alive[0]) return false;
    // pillars 還活著時，本體吃減傷
    if (this.pillarsAlive > 0) {
      amount *= CONFIG.nexusPillarDamageReduction;
    }
    this.hp[0] -= amount;
    this.flashTime[0] = 0.15;
    if (this.hp[0] <= 0) {
      this.alive[0] = 0;
      this.mesh.visible = false;
      this.field.visible = false;
      for (const p of this.pillars) p.mesh.visible = false;
      return true;
    }
    return false;
  }

  applyKnockback(i, kx, kz) { /* 免疫 */ }
}
