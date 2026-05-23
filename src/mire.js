import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG } from './config.js';
import { SpatialHash } from './spatialHash.js';
import { injectFx } from './glitch.js';

/**
 * 2026-05-23 Mire「Corrupted Sludge」精緻化
 * 結構：主乾癟身體（球） + 3 個側邊腫塊 + 下垂底錐 + 頂部不規則突起
 */
function buildMireGeo() {
  const r = CONFIG.mireRadius;
  const parts = [];
  // 主身體（八面體 detail 1）
  const body = new THREE.IcosahedronGeometry(r * 0.95, 1);
  body.translate(0, r * 0.1, 0);
  parts.push(body);
  // 側邊腫塊（3 個小球，非對稱位置給「腫塊」感）
  const bumpOffsets = [
    [r * 0.65, r * 0.0, r * 0.20],
    [-r * 0.55, r * 0.15, -r * 0.30],
    [r * 0.15, r * 0.10, -r * 0.65],
  ];
  for (const [bx, by, bz] of bumpOffsets) {
    const bump = new THREE.IcosahedronGeometry(r * 0.35, 0);
    bump.translate(bx, by, bz);
    parts.push(bump);
  }
  // 下垂底錐（淤泥滴落感）
  const drip = new THREE.ConeGeometry(r * 0.40, r * 0.55, 5);
  drip.rotateX(Math.PI);
  drip.translate(0, -r * 0.50, 0);
  parts.push(drip);
  // 頂部不規則突起（兩塊小盒）
  const top1 = new THREE.BoxGeometry(r * 0.30, r * 0.40, r * 0.30);
  top1.translate(r * 0.30, r * 0.65, 0);
  parts.push(top1);
  const top2 = new THREE.BoxGeometry(r * 0.22, r * 0.30, r * 0.22);
  top2.translate(-r * 0.20, r * 0.80, r * 0.10);
  parts.push(top2);
  // 統一轉非索引避免 Polyhedron / 其餘 indexed 混合報錯
  return mergeGeometries(parts.map(g => g.index ? g.toNonIndexed() : g));
}

/**
 * Mire — 沼 / 走路掉落減速地形（2026-05-22 新增）
 * 中型怪，移動 sluggish；每 N 秒在腳下生成 patch，hero 走進 patch 速度大幅下降
 * 創造「地形危險」維度 — 玩家必須走路徑規劃而非無腦穿越
 */
export class Mires {
  constructor(scene, maxCount, patches) {
    this.maxCount = maxCount;
    this.activeCount = 0;
    this.xpReward = CONFIG.mireXp;
    this.patches = patches;   // 共用 MirePatchPool，由 game.js 注入
    // 2026-05-23 死亡碎片：沼澤怪暗綠淤泥噴濺
    this.deathFragColor = 0x44aa55;
    this.deathFragScale = 1.2;

    // 2026-05-23：腫塊淤泥造型（主身 + 3 個側腫 + 下垂底錐 + 頂部突起）
    const geo = buildMireGeo();
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0x224422,
      emissiveIntensity: 0.55,
      roughness: 0.85,
      metalness: 0.1,
      flatShading: true,
    });
    injectFx(mat, {
      rimColor: [0.5, 1.0, 0.4],
      rimStrength: 0.7,
      aoStrength: 0.5,
      breathAmp: 0.07,
      breathSpeed: 1.5,            // 緩慢黏稠
      proceduralAnim: true,
      crawlAmp: 0.12,
      crawlFreq: 3.0,              // 蠕動慢且大
      crawlSpatialFreq: 2.5,
      squashAmp: 0.5,              // 黏黏受擊壓得明顯
      normalTint: 0.07,
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
    this.dropTimer = new Float32Array(maxCount);   // 倒數到 0 → 掉 patch
    this._hidden = new Uint8Array(maxCount).fill(1);

    const baseColor = new THREE.Color(0x556633);
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
      this.hp[i] = CONFIG.mireHp;
      this.alive[i] = 1;
      this.flashTime[i] = 0;
      this.dashHitTag[i] = 0;
      this.dropTimer[i] = CONFIG.mirePatchDropInterval * (0.5 + Math.random() * 0.6);
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
    const speed = CONFIG.mireSpeed;
    const kbDecay = Math.exp(-4.0 * dt);

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

      // 掉 patch
      this.dropTimer[i] -= dt;
      if (this.dropTimer[i] <= 0) {
        this.dropTimer[i] = CONFIG.mirePatchDropInterval;
        if (this.patches) this.patches.spawn(this.pos[i*3+0], this.pos[i*3+2]);
      }

      if (this.flashTime[i] > 0) this.flashTime[i] -= dt;
    }
  }

  syncInstances(timeNow) {
    const invMaxSpeed = 1 / CONFIG.mireSpeed;
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
        continue;
      }
      this._hidden[i] = 0;
      this._tmpV.set(this.pos[i*3+0], 0.5, this.pos[i*3+2]);
      const yaw = timeNow * 0.0012 + i * 0.4;
      this._tmpQ.setFromAxisAngle(this._up, yaw);
      this._tmpM.compose(this._tmpV, this._tmpQ, this._tmpScale);
      this.mesh.setMatrixAt(i, this._tmpM);

      const flashing = this.flashTime[i] > 0;
      if (flashing) {
        const f = this.flashTime[i] / 0.1;
        this._tmpColor.setRGB(
          this._baseColor.r + f * 3,
          this._baseColor.g + f * 3,
          this._baseColor.b + f * 3
        );
      } else {
        this._tmpColor.copy(this._baseColor);
      }
      this.mesh.setColorAt(i, this._tmpColor);

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
    this.knockback[i*3+0] += kx * 0.6;
    this.knockback[i*3+2] += kz * 0.6;
  }

  consumeAt(i) {
    if (!this.alive[i]) return;
    this.alive[i] = 0;
    this.activeCount--;
  }
}


/**
 * MirePatchPool — 沼澤地形 patch 池
 * 不是 enemy 池：只是地形 hazard，hero 進入時減速
 * 視覺：扁平 disc 鋪在地面，半透明綠
 */
export class MirePatchPool {
  constructor(scene, maxCount) {
    this.maxCount = maxCount;
    this.activeCount = 0;

    const geo = new THREE.CircleGeometry(CONFIG.mirePatchRadius, 24);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x55aa44,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, maxCount);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);

    this.pos = new Float32Array(maxCount * 3);
    this.life = new Float32Array(maxCount);
    this.alive = new Uint8Array(maxCount);
    this._hidden = new Uint8Array(maxCount).fill(1);

    const hide = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < maxCount; i++) this.mesh.setMatrixAt(i, hide);
    this.mesh.instanceMatrix.needsUpdate = true;

    this._tmpM = new THREE.Matrix4();
    this._tmpV = new THREE.Vector3();
    this._tmpQ = new THREE.Quaternion();
    this._tmpScale = new THREE.Vector3(1, 1, 1);
  }

  spawn(x, z) {
    for (let i = 0; i < this.maxCount; i++) {
      if (this.alive[i]) continue;
      this.pos[i*3+0] = x;
      this.pos[i*3+1] = 0.04;
      this.pos[i*3+2] = z;
      this.life[i] = CONFIG.mirePatchLifetime;
      this.alive[i] = 1;
      this.activeCount++;
      return true;
    }
    return false;
  }

  update(dt) {
    for (let i = 0; i < this.maxCount; i++) {
      if (!this.alive[i]) {
        if (!this._hidden[i]) {
          this._tmpM.makeScale(0, 0, 0);
          this.mesh.setMatrixAt(i, this._tmpM);
          this._hidden[i] = 1;
        }
        continue;
      }
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.alive[i] = 0;
        this.activeCount--;
        continue;
      }
      this._hidden[i] = 0;
      // fade-out 最後 1.5 秒
      const fadeT = Math.min(1, this.life[i] / 1.5);
      const scale = 0.85 + 0.15 * fadeT;
      this._tmpV.set(this.pos[i*3+0], this.pos[i*3+1], this.pos[i*3+2]);
      this._tmpScale.set(scale, 1, scale);
      this._tmpM.compose(this._tmpV, this._tmpQ, this._tmpScale);
      this.mesh.setMatrixAt(i, this._tmpM);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this._tmpScale.set(1, 1, 1);
  }

  /** 是否有任何 patch 覆蓋 (x, z) — 用於 hero 減速判定 */
  isInsideAny(x, z) {
    const r2 = CONFIG.mirePatchRadius * CONFIG.mirePatchRadius;
    for (let i = 0; i < this.maxCount; i++) {
      if (!this.alive[i]) continue;
      const dx = this.pos[i*3+0] - x;
      const dz = this.pos[i*3+2] - z;
      if (dx*dx + dz*dz < r2) return true;
    }
    return false;
  }
}
