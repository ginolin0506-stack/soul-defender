import * as THREE from 'three';
import { CONFIG } from './config.js';
import { SpatialHash } from './spatialHash.js';

/**
 * Boss Ohm — 切繫帶王（2026-05-21 完全重設計）
 *
 * 共通：壓在 hero-crystal 繫帶上時對水晶造成 DPS + 觸發 3s hero 鎖回血
 * P0 (HP > 50%): 每 1 秒面朝玩家射出光束（0.4s 預警 + 0.18s 主光束）
 * P1 (50%-20%):  P0 機制 + 每 3 秒順移到「hero 與 crystal 連線上、緊鄰 hero 朝 crystal 一側」
 *                順移有 1 秒動畫，期間 boss 物理位置為原位（可被閃避）
 * P2 (< 20%):    P0+P1 機制 + 以 0.5× hero 速度衝向水晶，碰到水晶自爆（造成大量傷害）
 *
 * 介面：與 swarm 相同（alive[i], pos[i*3], damage, applyKnockback...）
 * 外部信號（game.js 每幀讀取後清除）：
 *   - selfDestructFired: 自爆當幀
 *   - beamHitHeroFired: 主光束命中 hero
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
    this.isBoss = true;

    this.phase = 0;

    // 光束狀態機：idle → telegraph → active → idle
    // 啟動 telegraph 當下鎖定 origin + direction（世界座標），boss 移動時光束不會跟著飄
    this.beamTimer = CONFIG.bossBeamInterval;
    this.beamState = 'idle';
    this.beamStateTimer = 0;
    this.beamOriginX = 0;
    this.beamOriginZ = 0;
    this.beamDirX = 0;
    this.beamDirZ = 1;
    this.beamHitHeroFired = false;
    this._beamShotHit = false;     // 本次 shot 是否已扣血（避免 active 期間重複）

    // 順移狀態
    this.teleportTimer = CONFIG.bossTeleportInterval;
    this.teleportAnimT = 0;            // > 0 = 動畫中（boss 視為原位）
    this.teleportTargetX = 0;
    this.teleportTargetZ = 0;

    // P2 自爆
    this.selfDestructFired = false;

    this.hash = new SpatialHash(3.5);

    // === 視覺 ===
    const group = new THREE.Group();

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

    const topGeo = new THREE.ConeGeometry(CONFIG.bossRadius * 0.9, 1.5, 6);
    const top = new THREE.Mesh(topGeo, bodyMat);
    top.position.y = 5.0;
    group.add(top);

    const eyeGeo = new THREE.SphereGeometry(0.42, 16, 12);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff3344 });
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.y = 3.2;
    eye.position.z = CONFIG.bossRadius;
    group.add(eye);
    this.eye = eye;
    this.eyeMat = eyeMat;

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

    // === 光束視覺（單一 mesh，靠 scale + color + opacity 切換 telegraph / active）===
    const beamGeo = new THREE.BoxGeometry(1, 0.45, 1);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xff1133,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.beamMesh = new THREE.Mesh(beamGeo, beamMat);
    this.beamMesh.visible = false;
    scene.add(this.beamMesh);
    this.beamMat = beamMat;

    // === 順移目標 ghost：使用 boss 形狀的線框 + 地面圈 ===
    const ghostGroup = new THREE.Group();
    // 地面標靶圈
    const targetRingGeo = new THREE.RingGeometry(CONFIG.bossRadius * 1.0, CONFIG.bossRadius * 1.3, 36);
    targetRingGeo.rotateX(-Math.PI / 2);
    const targetRingMat = new THREE.MeshBasicMaterial({
      color: 0xff4488,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const targetRing = new THREE.Mesh(targetRingGeo, targetRingMat);
    targetRing.position.y = 0.04;
    ghostGroup.add(targetRing);
    this.ghostRingMat = targetRingMat;
    // 線框 boss 輪廓（六角柱）
    const ghostBodyGeo = new THREE.CylinderGeometry(CONFIG.bossRadius, CONFIG.bossRadius * 1.2, 4.5, 6);
    const ghostBodyMat = new THREE.MeshBasicMaterial({
      color: 0xff66aa,
      wireframe: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const ghostBody = new THREE.Mesh(ghostBodyGeo, ghostBodyMat);
    ghostBody.position.y = 2.25;
    ghostGroup.add(ghostBody);
    this.ghostBodyMat = ghostBodyMat;
    ghostGroup.visible = false;
    scene.add(ghostGroup);
    this.ghostGroup = ghostGroup;
  }

  spawn(crystal) {
    this.alive[0] = 1;
    this.hp[0] = this.maxHp;
    this.flashTime[0] = 0;
    this.dashHitTag[0] = 0;
    this.phase = 0;
    const spawnAngle = Math.random() * Math.PI * 2;
    this.pos[0] = crystal.position.x + Math.cos(spawnAngle) * CONFIG.bossSpawnDistance;
    this.pos[1] = 0;
    this.pos[2] = crystal.position.z + Math.sin(spawnAngle) * CONFIG.bossSpawnDistance;
    this.mesh.visible = true;
    this.beamTimer = CONFIG.bossBeamInterval;
    this.beamState = 'idle';
    this.beamStateTimer = 0;
    this.beamHitHeroFired = false;
    this._beamShotHit = false;
    this.beamMesh.visible = false;
    this.teleportTimer = CONFIG.bossTeleportInterval;
    this.teleportAnimT = 0;
    this.ghostGroup.visible = false;
    this.selfDestructFired = false;
  }

  fillHash() {
    this.hash.clear();
    if (this.alive[0]) this.hash.insertXZ(0, this.pos[0], this.pos[2]);
  }

  /** game.js 每幀讀取後 reset；本幀 hero 是否吃到主光束 */
  consumeBeamHit() {
    const fired = this.beamHitHeroFired;
    this.beamHitHeroFired = false;
    return fired;
  }

  /** game.js 每幀讀取後 reset；本幀是否自爆 */
  consumeSelfDestruct() {
    const fired = this.selfDestructFired;
    this.selfDestructFired = false;
    return fired;
  }

  update(dt, hero, crystal) {
    if (!this.alive[0]) {
      if (this.mesh.visible) this.mesh.visible = false;
      if (this.beamMesh.visible) this.beamMesh.visible = false;
      if (this.ghostGroup.visible) this.ghostGroup.visible = false;
      return null;
    }

    // === 階段判定 ===
    const ratio = this.hp[0] / this.maxHp;
    this.phase = (ratio < CONFIG.bossBerserkHpRatio)
      ? 2
      : (ratio < CONFIG.bossPhase1HpRatio) ? 1 : 0;

    // === 移動：依階段 + 順移狀態 ===
    // 設計（2026-05-21 重做）：拋棄繞圓軌道，P0/P1 改為「追擊繫帶中點」
    // → boss 會持續壓在 hero ↔ crystal 連線中央，玩家必須走位讓繫帶繞開它
    if (this.teleportAnimT > 0) {
      // 順移動畫中：boss 物理位置「凍結」於動畫起始位置
      this.teleportAnimT -= dt;
      if (this.teleportAnimT <= 0) {
        // 動畫結束 → 瞬移到目標位置（追擊邏輯下一幀從新位置繼續，無需軌道復原）
        this.pos[0] = this.teleportTargetX;
        this.pos[2] = this.teleportTargetZ;
        this.teleportAnimT = 0;
        this.ghostGroup.visible = false;
      }
    } else if (this.phase === 2) {
      // P2 狂暴：直線衝向水晶（自爆模式，保留原行為）
      const dx = crystal.position.x - this.pos[0];
      const dz = crystal.position.z - this.pos[2];
      const d = Math.hypot(dx, dz);
      if (d > 0.001) {
        const speed = CONFIG.heroSpeed * CONFIG.bossBerserkSpeedMult;
        const step = Math.min(speed * dt, d);
        this.pos[0] += (dx / d) * step;
        this.pos[2] += (dz / d) * step;
      }
    } else {
      // P0/P1：追擊繫帶中點（hero / crystal 連線中央）
      const midX = (hero.position.x + crystal.position.x) * 0.5;
      const midZ = (hero.position.z + crystal.position.z) * 0.5;
      const dx = midX - this.pos[0];
      const dz = midZ - this.pos[2];
      const d = Math.hypot(dx, dz);
      if (d > 0.001) {
        const speed = this.phase === 0 ? CONFIG.bossChaseSpeedP0 : CONFIG.bossChaseSpeedP1;
        const step = Math.min(speed * dt, d);  // clamp 避免越過中點抖動
        this.pos[0] += (dx / d) * step;
        this.pos[2] += (dz / d) * step;
      }
    }

    // === P1+ 順移計時（P2 也保留：teleport 會打斷衝刺）===
    if (this.phase >= 1 && this.teleportAnimT <= 0) {
      this.teleportTimer -= dt;
      if (this.teleportTimer <= 0) {
        this.teleportTimer = CONFIG.bossTeleportInterval;
        this._startTeleport(hero, crystal);
      }
    }

    // === 光束（全階段）===
    this._updateBeam(dt, hero);

    // === P2 自爆：碰到水晶觸發 ===
    if (this.phase === 2 && this.teleportAnimT <= 0) {
      const dx = crystal.position.x - this.pos[0];
      const dz = crystal.position.z - this.pos[2];
      const d = Math.hypot(dx, dz);
      if (d < CONFIG.bossRadius + CONFIG.crystalRadius) {
        this.selfDestructFired = true;
        this.alive[0] = 0;
        this.mesh.visible = false;
        this.beamMesh.visible = false;
        this.ghostGroup.visible = false;
      }
    }

    // === 視覺更新 ===
    this.mesh.position.set(this.pos[0], 0, this.pos[2]);
    this.mesh.rotation.y += dt * 0.4;

    // 眼睛看 hero（local space）
    const eyeWorldDir = Math.atan2(hero.position.x - this.pos[0], hero.position.z - this.pos[2]);
    const eyeLocalDir = eyeWorldDir - this.mesh.rotation.y;
    this.eye.position.x = Math.sin(eyeLocalDir) * CONFIG.bossRadius;
    this.eye.position.z = Math.cos(eyeLocalDir) * CONFIG.bossRadius;

    // flash + 階段色
    if (this.flashTime[0] > 0) this.flashTime[0] -= dt;
    const f = Math.max(0, this.flashTime[0] / 0.15);
    // 順移動畫中：boss 半透明 + 暗化以暗示「分身狀態」
    const teleFade = this.teleportAnimT > 0 ? 0.55 : 1.0;
    this.bodyMat.emissiveIntensity = (0.5 + f * 3) * teleFade;
    this.eyeMat.color.setRGB((1 + f * 4) * teleFade, (0.2 + f * 4) * teleFade, (0.27 + f * 4) * teleFade);

    // 環色：P0 紅 / P1 橘 / P2 深紅 + P2 狂暴脈動
    const phaseColor = [0xff3366, 0xff7733, 0xff0011][this.phase];
    this.ringMat.color.setHex(phaseColor);
    const ringPulse = this.phase === 2
      ? 0.65 + 0.25 * Math.sin(performance.now() * 0.012)
      : 0.35 + 0.15 * Math.sin(performance.now() * 0.005);
    this.ringMat.opacity = ringPulse;

    return null;
  }

  /** 啟動順移：鎖定目標位置（hero 與 crystal 連線上、緊鄰 hero 朝 crystal 一側） */
  _startTeleport(hero, crystal) {
    const dx = crystal.position.x - hero.position.x;
    const dz = crystal.position.z - hero.position.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.1) {
      // 水晶與 hero 重疊（退化情況）→ 隨機方向
      const a = Math.random() * Math.PI * 2;
      const r = CONFIG.bossTeleportBehindDistance;
      this.teleportTargetX = hero.position.x + Math.cos(a) * r;
      this.teleportTargetZ = hero.position.z + Math.sin(a) * r;
    } else {
      // 目標：在 hero→crystal 線段上、距 hero 朝 crystal 方向 N units
      // clamp 到一半距離避免越過 crystal
      const distAlong = Math.min(CONFIG.bossTeleportBehindDistance, d * 0.5);
      this.teleportTargetX = hero.position.x + (dx / d) * distAlong;
      this.teleportTargetZ = hero.position.z + (dz / d) * distAlong;
    }
    this.teleportAnimT = CONFIG.bossTeleportAnimDuration;
    // ghost 顯示在目標位置
    this.ghostGroup.position.set(this.teleportTargetX, 0, this.teleportTargetZ);
    this.ghostGroup.visible = true;
    // 重置光束 — 順移會打斷任何進行中的 shot（避免動畫結束後從新位置射出鎖死於舊方向的光束）
    this.beamState = 'idle';
    this.beamStateTimer = 0;
    this.beamTimer = CONFIG.bossBeamInterval;
    this._beamShotHit = false;
    this.beamMesh.visible = false;
  }

  _updateBeam(dt, hero) {
    // 順移動畫中暫停光束狀態機（避免 boss 假裝在原位卻射出新光束）
    if (this.teleportAnimT > 0) {
      this.beamMesh.visible = false;
    } else {
      if (this.beamState === 'idle') {
        this.beamTimer -= dt;
        if (this.beamTimer <= 0) {
          // 啟動 telegraph：鎖定 origin（boss 當前位置）+ direction（朝 hero）
          // 之後 boss 移動光束不會跟著飄 → 視覺與 hit 判定一致
          this.beamOriginX = this.pos[0];
          this.beamOriginZ = this.pos[2];
          const dx = hero.position.x - this.pos[0];
          const dz = hero.position.z - this.pos[2];
          const d = Math.max(0.0001, Math.hypot(dx, dz));
          this.beamDirX = dx / d;
          this.beamDirZ = dz / d;
          this.beamState = 'telegraph';
          this.beamStateTimer = CONFIG.bossBeamTelegraph;
          this._beamShotHit = false;
        }
      } else if (this.beamState === 'telegraph') {
        this.beamStateTimer -= dt;
        if (this.beamStateTimer <= 0) {
          this.beamState = 'active';
          this.beamStateTimer = CONFIG.bossBeamActive;
        }
      } else if (this.beamState === 'active') {
        this.beamStateTimer -= dt;
        // hit 判定：hero 到光束軸（origin + dir）的垂直距離 < beamWidth 且投影在 [0, maxRange]
        if (!this._beamShotHit) {
          const toX = hero.position.x - this.beamOriginX;
          const toZ = hero.position.z - this.beamOriginZ;
          const along = toX * this.beamDirX + toZ * this.beamDirZ;
          if (along >= 0 && along <= CONFIG.bossBeamMaxRange) {
            const perpX = toX - along * this.beamDirX;
            const perpZ = toZ - along * this.beamDirZ;
            const perpDist = Math.hypot(perpX, perpZ);
            if (perpDist < CONFIG.bossBeamWidth) {
              this.beamHitHeroFired = true;
              this._beamShotHit = true;
            }
          }
        }
        if (this.beamStateTimer <= 0) {
          this.beamState = 'idle';
          this.beamTimer = CONFIG.bossBeamInterval;
        }
      }

      // 視覺：依狀態描繪（使用鎖定的 origin，boss 移動不會帶走光束）
      if (this.beamState === 'idle') {
        this.beamMesh.visible = false;
      } else {
        const isTele = this.beamState === 'telegraph';
        const length = CONFIG.bossBeamMaxRange;
        const widthVis = isTele ? 0.18 : CONFIG.bossBeamWidth * 2;
        const midX = this.beamOriginX + this.beamDirX * length / 2;
        const midZ = this.beamOriginZ + this.beamDirZ * length / 2;
        this.beamMesh.position.set(midX, 2.5, midZ);
        this.beamMesh.rotation.y = Math.atan2(this.beamDirX, this.beamDirZ);
        this.beamMesh.scale.set(widthVis, 1, length);
        this.beamMat.color.setHex(isTele ? 0xff1133 : 0xffe680);
        const tActive = this.beamState === 'active'
          ? this.beamStateTimer / CONFIG.bossBeamActive
          : 1.0;
        this.beamMat.opacity = isTele ? 0.45 : Math.max(0.3, 0.95 * tActive);
        this.beamMesh.visible = true;
      }
    }

    // ghost 動畫（teleport anim 中才會顯示，獨立於 beam 狀態）
    if (this.ghostGroup.visible) {
      const t = 1.0 - (this.teleportAnimT / CONFIG.bossTeleportAnimDuration);
      const op = 0.35 + 0.45 * Math.sin(t * Math.PI * 5) + t * 0.4;
      this.ghostRingMat.opacity = Math.min(1, op);
      this.ghostBodyMat.opacity = Math.min(1, op * 0.75);
      const s = 1.0 + Math.sin(t * Math.PI * 4) * 0.08;
      this.ghostGroup.scale.set(s, 1, s);
    }
  }

  /**
   * 檢查 Boss 是否正擋在繫帶上（hero → crystal 線段距離 < bossSeverRadius）
   * 順移動畫中 boss 仍視為原位（pos 在動畫期間未被改寫）
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
    this.hp[0] -= amount;
    if (this.hp[0] <= 0) {
      this.alive[0] = 0;
      this.mesh.visible = false;
      this.beamMesh.visible = false;
      this.ghostGroup.visible = false;
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
