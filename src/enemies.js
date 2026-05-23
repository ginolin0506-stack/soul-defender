import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG } from './config.js';
import { injectFx } from './glitch.js';

/**
 * 2026-05-23 Leech「Corrupted Crawler」精緻化
 * 結構：頭顱 (icosahedron) + 雙鉗顎 + 單眼 + 胸甲 + 腹節 (3 段) + 尾刺 + 4 支腳
 * 朝向：-Z 方向是「頭」，+Z 方向是「尾」
 */
function buildLeechGeo() {
  const parts = [];
  // 頭顱
  const head = new THREE.IcosahedronGeometry(0.22, 0);
  head.translate(0, 0.32, -0.55);
  parts.push(head);
  // 單眼（前方小錐）
  const eye = new THREE.ConeGeometry(0.06, 0.12, 6);
  eye.rotateX(-Math.PI / 2);
  eye.translate(0, 0.34, -0.78);
  parts.push(eye);
  // 雙鉗顎（向前突出兩根刺）
  for (const sx of [-0.12, 0.12]) {
    const mandible = new THREE.ConeGeometry(0.045, 0.22, 4);
    mandible.rotateX(-Math.PI / 2);
    mandible.translate(sx, 0.26, -0.74);
    parts.push(mandible);
  }
  // 胸甲（Box，肩部高）
  const thorax = new THREE.BoxGeometry(0.46, 0.42, 0.38);
  thorax.translate(0, 0.30, -0.20);
  parts.push(thorax);
  // 胸甲背刺（兩塊小盔）
  for (const sx of [-0.25, 0.25]) {
    const spine = new THREE.BoxGeometry(0.10, 0.22, 0.30);
    spine.translate(sx, 0.48, -0.18);
    parts.push(spine);
  }
  // 腹節 3 段（中、後、尾，逐漸縮小）
  const seg1 = new THREE.BoxGeometry(0.42, 0.36, 0.30);
  seg1.translate(0, 0.26, 0.14);
  parts.push(seg1);
  const seg2 = new THREE.BoxGeometry(0.34, 0.30, 0.28);
  seg2.translate(0, 0.22, 0.42);
  parts.push(seg2);
  const seg3 = new THREE.BoxGeometry(0.24, 0.24, 0.22);
  seg3.translate(0, 0.18, 0.66);
  parts.push(seg3);
  // 尾刺
  const tailSpike = new THREE.ConeGeometry(0.06, 0.18, 4);
  tailSpike.rotateX(Math.PI / 2);
  tailSpike.translate(0, 0.18, 0.85);
  parts.push(tailSpike);
  // 4 支腳（左右各兩支，斜向下外伸）
  for (const sx of [-0.26, 0.26]) {
    for (const sz of [-0.08, 0.18]) {
      const leg = new THREE.BoxGeometry(0.05, 0.20, 0.05);
      leg.translate(sx, 0.10, sz);
      parts.push(leg);
    }
  }
  // mergeGeometries 要求所有 geo 的 index 屬性一致；Polyhedron 系（Icosahedron/Octahedron）無 index、
  // 其餘 Box/Cone/Cylinder/Torus 有 index → 統一轉非索引化才能 merge
  return mergeGeometries(parts.map(g => g.index ? g.toNonIndexed() : g));
}

/**
 * Leech 群：用 InstancedMesh 渲染所有怪物
 * - 不為每隻怪建立 Object3D，全部用平行陣列管理
 * - 朝水晶移動 + 分離力（避免堆疊）
 */
export class Swarm {
  constructor(scene, maxCount) {
    this.maxCount = maxCount;
    this.activeCount = 0;
    // 2026-05-23 通用死亡碎片：leech 紅紫骨甲粉碎
    this.deathFragColor = 0xff3344;
    this.deathFragScale = 1.0;

    // W9 升級：複合幾何 leech（外骨骼甲殼感）
    const geo = buildLeechGeo();

    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0x331111,
      emissiveIntensity: 0.5,
      roughness: 0.55,
      metalness: 0.2,
      flatShading: true,
    });
    // W9 + W10: 紅紫 rim、強 AO、呼吸 + 蠕動 + 受擊壓扁
    injectFx(mat, {
      rimColor: [0.8, 0.3, 0.5],
      rimStrength: 0.55,
      aoStrength: 0.4,
      breathAmp: 0.02,
      breathSpeed: 3.2,
      proceduralAnim: true,
      crawlAmp: 0.14,         // 「肥美蠕動」
      crawlFreq: 11.0,
      crawlSpatialFreq: 4.5,
      squashAmp: 0.4,
      normalTint: 0.05,
    });

    // W10: per-instance attribute — aSpeed (蠕動驅動) / aKnock (squash 驅動)
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
    this.mesh.castShadow = false;     // 千隻同屏陰影會炸
    this.mesh.receiveShadow = false;
    scene.add(this.mesh);

    // === 平行資料陣列 ===
    this.pos = new Float32Array(maxCount * 3);
    this.vel = new Float32Array(maxCount * 3);
    this.knockback = new Float32Array(maxCount * 3);
    this.hp = new Float32Array(maxCount);
    this.alive = new Uint8Array(maxCount);
    this.flashTime = new Float32Array(maxCount);
    this.dashHitTag = new Uint8Array(maxCount);
    this.slowTimer = new Float32Array(maxCount);   // 2026-05-22 Soul Vacuum 緩速倒數
    // 2026-05-23：spawn-in 動畫倒數（生成時設 SPAWN_DUR，每幀遞減；scale = 1 - t）
    this.spawnT = new Float32Array(maxCount);
    this._SPAWN_DUR = 0.28;
    // P4 + P6: 追蹤前一幀狀態避免重複寫入 GPU buffer
    this._wasFlashing = new Uint8Array(maxCount);
    this._hidden = new Uint8Array(maxCount).fill(1);  // 構造時全部 scale-0

    // 預先初始化 instanceColor
    const colorBase = new THREE.Color(0xff3344);
    for (let i = 0; i < maxCount; i++) {
      this.mesh.setColorAt(i, colorBase);
    }
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor.needsUpdate = true;   // B9: 確保初始色彩首次上傳

    // 一開始全藏起來（scale 0）
    const m = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < maxCount; i++) this.mesh.setMatrixAt(i, m);
    this.mesh.instanceMatrix.needsUpdate = true;

    // tmp objects
    this._tmpM = new THREE.Matrix4();
    this._tmpV = new THREE.Vector3();
    this._tmpQ = new THREE.Quaternion();
    this._tmpScale = new THREE.Vector3(1, 1, 1);
    this._tmpColor = new THREE.Color();
    this._upVec = new THREE.Vector3(0, 1, 0);
  }

  spawnBurst(count, ringMin, ringMax) {
    let spawned = 0;
    for (let i = 0; i < this.maxCount && spawned < count; i++) {
      if (this.alive[i]) continue;
      const a = Math.random() * Math.PI * 2;
      const r = ringMin + Math.random() * (ringMax - ringMin);
      this.pos[i*3+0] = Math.cos(a) * r;
      this.pos[i*3+1] = 0.0;
      this.pos[i*3+2] = Math.sin(a) * r;
      this.vel[i*3+0] = 0;
      this.vel[i*3+1] = 0;
      this.vel[i*3+2] = 0;
      this.knockback[i*3+0] = 0;
      this.knockback[i*3+2] = 0;
      this.hp[i] = CONFIG.leechHp;
      this.alive[i] = 1;
      this.flashTime[i] = 0;
      this.dashHitTag[i] = 0;
      this.slowTimer[i] = 0;
      this.spawnT[i] = this._SPAWN_DUR;
      this.activeCount++;
      spawned++;
    }
    return spawned;
  }

  /** 把所有活著的 leech 塞進 spatial hash */
  fillHash(hash) {
    hash.clear();
    for (let i = 0; i < this.maxCount; i++) {
      if (!this.alive[i]) continue;
      hash.insertXZ(i, this.pos[i*3+0], this.pos[i*3+2]);
    }
  }

  update(dt, targetX, targetZ, hash) {
    const speed = CONFIG.leechSpeed;
    const sepR = CONFIG.leechSeparationRadius;
    const sepR2 = sepR * sepR;
    const sepStr = CONFIG.leechSeparationStrength;
    const kbDecay = Math.exp(-CONFIG.leechKnockbackRecover * dt);

    for (let i = 0; i < this.maxCount; i++) {
      if (!this.alive[i]) continue;
      const px = this.pos[i*3+0];
      const pz = this.pos[i*3+2];

      // 朝水晶
      let dx = targetX - px, dz = targetZ - pz;
      const d = Math.hypot(dx, dz);
      if (d > 0.0001) { dx /= d; dz /= d; }

      // 分離力（用 hash 查鄰居）
      let sx = 0, sz = 0;
      const nbrs = hash.queryXZ(px, pz, sepR);
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

      // 擊退衰減
      const kbx = this.knockback[i*3+0] * kbDecay;
      const kbz = this.knockback[i*3+2] * kbDecay;
      this.knockback[i*3+0] = kbx;
      this.knockback[i*3+2] = kbz;

      let vx = dx * speed + sx * speed * sepStr + kbx;
      let vz = dz * speed + sz * speed * sepStr + kbz;
      // Soul Vacuum 緩速：靈魂飛過時施加 slowTimer，期間移速 ×soulVacuumSlowMult
      if (this.slowTimer[i] > 0) {
        this.slowTimer[i] = Math.max(0, this.slowTimer[i] - dt);
        const m = CONFIG.soulVacuumSlowMult;
        vx *= m; vz *= m;
      }
      this.vel[i*3+0] = vx;
      this.vel[i*3+2] = vz;
      this.pos[i*3+0] = px + vx * dt;
      this.pos[i*3+2] = pz + vz * dt;

      if (this.flashTime[i] > 0) this.flashTime[i] -= dt;
      if (this.spawnT[i] > 0) this.spawnT[i] = Math.max(0, this.spawnT[i] - dt);
    }
  }

  /** W10 升級：除 matrix/color 外，也寫 aSpeed (蠕動) / aKnock (squash) per-instance attribute */
  syncInstances() {
    let colorDirty = false;
    const invMaxSpeed = 1 / CONFIG.leechSpeed;
    const knockNorm = 1 / 12.0;     // knockback magnitude 12 = 100% squash

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
          this._tmpColor.setRGB(1.0, 0.2, 0.27);
          this.mesh.setColorAt(i, this._tmpColor);
          this._wasFlashing[i] = 0;
          colorDirty = true;
        }
        continue;
      }
      this._hidden[i] = 0;

      this._tmpV.set(this.pos[i*3+0], this.pos[i*3+1], this.pos[i*3+2]);
      const vx = this.vel[i*3+0], vz = this.vel[i*3+2];
      const speed = Math.hypot(vx, vz);
      const yaw = (vx*vx + vz*vz > 0.0001) ? Math.atan2(vx, vz) : 0;
      this._tmpQ.setFromAxisAngle(this._upVec, yaw);
      // 2026-05-23 spawn-in 動畫：spawnT 從 SPAWN_DUR 倒數到 0，scale 從 0→overshoot→1
      // 用 smoothstep + 輕微 overshoot 給「資料化身」浮現感
      if (this.spawnT[i] > 0) {
        const t = 1 - this.spawnT[i] / this._SPAWN_DUR;          // 0→1
        const s = t * t * (3 - 2 * t);                             // smoothstep
        const overshoot = s + Math.sin(t * Math.PI) * 0.15;         // 中段微凸
        this._tmpScale.set(overshoot, overshoot, overshoot);
      } else {
        this._tmpScale.set(1, 1, 1);
      }
      this._tmpM.compose(this._tmpV, this._tmpQ, this._tmpScale);
      this.mesh.setMatrixAt(i, this._tmpM);

      // W10: per-instance attributes
      this.aSpeed[i] = Math.min(1, speed * invMaxSpeed);
      const km = Math.hypot(this.knockback[i*3+0], this.knockback[i*3+2]);
      this.aKnock[i] = Math.min(1, km * knockNorm);

      // 顏色：只在 flash 中或剛結束 flash 時更新
      const flashing = this.flashTime[i] > 0;
      if (flashing) {
        const f = this.flashTime[i] / 0.1;
        this._tmpColor.setRGB(1.0 + f * 4, 0.2 + f * 5, 0.27 + f * 5);
        this.mesh.setColorAt(i, this._tmpColor);
        this._wasFlashing[i] = 1;
        colorDirty = true;
      } else if (this._wasFlashing[i]) {
        // flash 剛結束 → 寫回基色一次
        this._tmpColor.setRGB(1.0, 0.2, 0.27);
        this.mesh.setColorAt(i, this._tmpColor);
        this._wasFlashing[i] = 0;
        colorDirty = true;
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (colorDirty && this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    // W10: 每幀都更新 procedural anim 屬性（小成本，視覺立即反應）
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
    this.knockback[i*3+0] += kx;
    this.knockback[i*3+2] += kz;
  }

  /** 把所有活著的 leech 跟水晶距離檢查，回傳「碰到水晶」的 index 列表 */
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

  /** 摧毀並標記死亡（用於水晶引爆） */
  consumeAt(i) {
    if (!this.alive[i]) return;
    this.alive[i] = 0;
    this.activeCount--;
  }

  getPos(i, out) {
    out.set(this.pos[i*3+0], this.pos[i*3+1], this.pos[i*3+2]);
    return out;
  }
}
