import * as THREE from 'three';
import { CONFIG } from './config.js';
import { SpatialHash } from './spatialHash.js';

/**
 * Boss Mu — 虛無之神（W7 終局）
 * - 召喚時整場 perk 暫停（由 game.js 處理 snapshot/restore）
 * - Shell 階段：只有「tether 線段穿過 Mu 中心」時，shell 才會被傷害（任何傷害量碎殼一擊）
 * - Core 階段：shell 碎了，剩 maxHp HP，正常受傷
 * - swarm-like 介面相容 hero.autoAttack
 */
export class Mu {
  constructor(scene) {
    this.maxCount = 1;
    this.alive = new Uint8Array(1);
    this.pos = new Float32Array(3);
    this.hp = new Float32Array(1);
    this.maxHp = CONFIG.muHp;
    this.flashTime = new Float32Array(1);
    this.dashHitTag = new Uint8Array(1);
    this.xpReward = CONFIG.muXp;
    this.isBoss = true;
    this.hash = new SpatialHash(3.5);

    this.shellAlive = true;
    this.tetherCrossing = false;     // 由 game.js 每幀寫
    this.orbitAngle = 0;
    this.spawnAnimT = 0;

    // === 視覺：黑色虛無球體 + 環形扭曲帶 ===
    const group = new THREE.Group();

    // Core
    const coreGeo = new THREE.SphereGeometry(CONFIG.muRadius, 28, 20);
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0x000000,
      emissive: 0x110022,
      emissiveIntensity: 1.0,
      roughness: 0.05,
      metalness: 1.0,
    });
    const core = new THREE.Mesh(coreGeo, coreMat);
    core.position.y = 4;
    core.castShadow = true;
    group.add(core);
    this.core = core;
    this.coreMat = coreMat;

    // Shell（外殼）— 半透明發光球，shell 碎了就 hidden
    const shellGeo = new THREE.IcosahedronGeometry(CONFIG.muRadius * 1.4, 1);
    const shellMat = new THREE.MeshBasicMaterial({
      color: 0xff44ff,
      transparent: true,
      opacity: 0.35,
      wireframe: true,
      depthWrite: false,
    });
    const shell = new THREE.Mesh(shellGeo, shellMat);
    shell.position.y = 4;
    group.add(shell);
    this.shell = shell;
    this.shellMat = shellMat;

    // 環形扭曲帶（吸入感）
    const ringGeo = new THREE.TorusGeometry(CONFIG.muRadius * 2.2, 0.12, 8, 64);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xff66ff,
      transparent: true,
      opacity: 0.65,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.y = 4;
    ring.rotation.x = Math.PI / 2;
    group.add(ring);
    this.ring = ring;
    this.ringMat = ringMat;

    // 地面虛無圈（標記範圍）
    const voidGeo = new THREE.RingGeometry(CONFIG.muRadius * 1.6, CONFIG.muRadius * 2.0, 64);
    voidGeo.rotateX(-Math.PI / 2);
    const voidMat = new THREE.MeshBasicMaterial({
      color: 0x661166,
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide,
    });
    const voidRing = new THREE.Mesh(voidGeo, voidMat);
    voidRing.position.y = 0.05;
    group.add(voidRing);
    this.voidRing = voidRing;
    this.voidMat = voidMat;

    group.visible = false;
    scene.add(group);
    this.mesh = group;
  }

  spawn(crystal) {
    this.alive[0] = 1;
    this.hp[0] = this.maxHp;
    this.flashTime[0] = 0;
    this.dashHitTag[0] = 0;
    this.shellAlive = true;
    this.tetherCrossing = false;
    this.orbitAngle = Math.random() * Math.PI * 2;
    this.spawnAnimT = 0;

    this.pos[0] = crystal.position.x + Math.cos(this.orbitAngle) * CONFIG.muOrbitRadius;
    this.pos[2] = crystal.position.z + Math.sin(this.orbitAngle) * CONFIG.muOrbitRadius;
    this.mesh.visible = true;
    this.shell.visible = true;
    this.shellMat.opacity = 0.35;
    this.ringMat.color.setHex(0xff66ff);
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

    this.spawnAnimT = Math.min(1, this.spawnAnimT + dt * 0.6);

    // 軌道（緩慢）
    this.orbitAngle += CONFIG.muOrbitSpeed * dt;
    const r = CONFIG.muOrbitRadius + Math.sin(this.orbitAngle * 0.7) * 1.5;
    this.pos[0] = crystal.position.x + Math.cos(this.orbitAngle) * r;
    this.pos[2] = crystal.position.z + Math.sin(this.orbitAngle) * r;
    this.mesh.position.set(this.pos[0], 0, this.pos[2]);

    // Core 自轉
    this.core.rotation.y += dt * 0.8;
    this.core.rotation.x += dt * 0.5;

    // Shell 反向自轉 + 脈動
    if (this.shellAlive) {
      this.shell.rotation.y -= dt * 1.4;
      this.shell.rotation.z += dt * 0.7;
      // 當 tether 穿過 → shell 發亮提示玩家「可以打」
      const baseOpacity = this.tetherCrossing ? 0.85 : 0.3;
      this.shellMat.opacity += (baseOpacity - this.shellMat.opacity) * 0.15;
      this.shellMat.color.setHex(this.tetherCrossing ? 0xffff77 : 0xff44ff);
    } else {
      this.shellMat.opacity *= 0.85;
      if (this.shellMat.opacity < 0.02) this.shell.visible = false;
    }

    // 環自轉 + 上下浮動
    this.ring.rotation.z += dt * 0.4;
    this.ring.position.y = 4 + Math.sin(performance.now() * 0.002) * 0.3;
    this.voidRing.rotation.y -= dt * 0.3;
    this.voidMat.opacity = 0.35 + 0.18 * Math.sin(performance.now() * 0.005);

    // flash
    if (this.flashTime[0] > 0) this.flashTime[0] -= dt;
    const f = Math.max(0, this.flashTime[0] / 0.18);
    this.coreMat.emissiveIntensity = 1.0 + f * 5;
  }

  damage(i, amount) {
    this.lastHitRejected = false;     // B24: 給 game.js 判斷要不要噴傷害數字
    if (!this.alive[0]) return false;
    if (this.shellAlive) {
      // Shell 只有 tether 穿過時可被打
      if (!this.tetherCrossing) {
        this.lastHitRejected = true;
        // 視覺反饋：shell 反彈閃光
        this.shellMat.opacity = 0.9;
        return false;
      }
      // 任何傷害量 → 碎殼一擊
      this.shellAlive = false;
      this.flashTime[0] = 0.3;
      return false;
    }
    // Core 階段：正常受傷
    this.hp[0] -= amount;
    this.flashTime[0] = 0.15;
    if (this.hp[0] <= 0) {
      this.alive[0] = 0;
      this.mesh.visible = false;
      return true;
    }
    return false;
  }

  applyKnockback() { /* 免疫 */ }

  /** 給 game.js 每幀計算 tether 線段是否穿過 Mu */
  static segmentIntersectsCircle(ax, az, bx, bz, cx, cz, radius) {
    const dx = bx - ax, dz = bz - az;
    const lenSq = dx*dx + dz*dz;
    if (lenSq < 0.001) return false;
    const t = ((cx - ax) * dx + (cz - az) * dz) / lenSq;
    const tClamped = Math.max(0, Math.min(1, t));
    const closestX = ax + tClamped * dx;
    const closestZ = az + tClamped * dz;
    const perpX = cx - closestX;
    const perpZ = cz - closestZ;
    return perpX*perpX + perpZ*perpZ < radius * radius;
  }
}
