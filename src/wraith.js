import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG } from './config.js';
import { SpatialHash } from './spatialHash.js';
import { injectFx } from './glitch.js';

/**
 * 2026-05-23 Wraith「Hooded Phantom」精緻化
 * 結構：頭顱八面體 + 兜帽錐 + 雙下垂觸鬚 + 後方拖尾 + 漂浮符印
 */
function buildWraithGeo() {
  const r = CONFIG.wraithRadius;
  const parts = [];
  // 頭顱核
  const skull = new THREE.OctahedronGeometry(r * 0.85, 0);
  skull.translate(0, 0, 0);
  parts.push(skull);
  // 兜帽錐（罩在頭頂）
  const hood = new THREE.ConeGeometry(r * 1.05, r * 1.30, 6);
  hood.translate(0, r * 0.75, 0);
  parts.push(hood);
  // 雙下垂觸鬚（從下方延伸出兩根尖錐）
  for (const sx of [-0.4, 0.4]) {
    const tendril = new THREE.ConeGeometry(r * 0.12, r * 0.85, 4);
    tendril.rotateX(Math.PI);
    tendril.translate(sx * r, -r * 0.55, 0);
    parts.push(tendril);
  }
  // 後方拖尾（三條漸縮的薄片在背後）
  for (let i = 0; i < 3; i++) {
    const tail = new THREE.BoxGeometry(r * 0.28, r * 0.04, r * 0.6 + i * r * 0.2);
    tail.translate(0, r * 0.1 - i * r * 0.15, r * 0.55 + i * r * 0.35);
    parts.push(tail);
  }
  // 漂浮符印（頭頂上方一個小八面體）
  const sigil = new THREE.OctahedronGeometry(r * 0.20, 0);
  sigil.translate(0, r * 1.65, 0);
  parts.push(sigil);
  // 統一轉非索引避免 Polyhedron / 其餘 indexed 混合報錯
  return mergeGeometries(parts.map(g => g.index ? g.toNonIndexed() : g));
}

/**
 * Wraith — 鬼影 / 短距 blink 騷擾型（2026-05-22 新增）
 * 行為：平時緩慢漂移朝 hero，每 wraithBlinkInterval 秒朝 hero 瞬移 wraithBlinkDistance
 * blink 前有 wraithBlinkTelegraph 視覺預警（紫色閃爍）→ 玩家可預判 dash 躲開
 * 設計：低 HP（一次脈衝就死），但 blink 會穿過 dash knockback，逼玩家保持位置警覺
 */
export class Wraiths {
  constructor(scene, maxCount) {
    this.maxCount = maxCount;
    this.activeCount = 0;
    this.xpReward = CONFIG.wraithXp;
    // 2026-05-23 死亡碎片：鬼影紫光散去
    this.deathFragColor = 0xaa66ff;
    this.deathFragScale = 0.9;

    // 2026-05-23：兜帽幽靈造型（頭顱 + 兜帽 + 觸鬚 + 拖尾 + 浮空符印）
    const geo = buildWraithGeo();
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0x6622aa,
      emissiveIntensity: 0.95,
      roughness: 0.3,
      metalness: 0.1,
      flatShading: true,
      transparent: true,
      opacity: 0.78,
    });
    injectFx(mat, {
      rimColor: [0.7, 0.4, 1.0],
      rimStrength: 1.05,
      aoStrength: 0.2,
      breathAmp: 0.08,
      breathSpeed: 4.5,
      proceduralAnim: true,
      crawlAmp: 0.04,
      crawlFreq: 7.0,
      crawlSpatialFreq: 3.5,
      squashAmp: 0.35,
      normalTint: 0.08,
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
    this.blinkTimer = new Float32Array(maxCount);  // 倒數到 0 → blink
    this.telegraph = new Float32Array(maxCount);   // > 0 = blink 預警中
    this._wasFlashing = new Uint8Array(maxCount);
    this._hidden = new Uint8Array(maxCount).fill(1);

    const baseColor = new THREE.Color(0x9966dd);
    const warnColor = new THREE.Color(0xffaaff);
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
    this._warnColor = warnColor;

    this.hash = new SpatialHash(1.5);
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
      this.hp[i] = CONFIG.wraithHp;
      this.alive[i] = 1;
      this.flashTime[i] = 0;
      this.dashHitTag[i] = 0;
      // 第一次 blink 各自隨機延遲，避免同時 blink
      this.blinkTimer[i] = CONFIG.wraithBlinkInterval * (0.4 + Math.random() * 0.8);
      this.telegraph[i] = 0;
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

  update(dt, heroX, heroZ) {
    this.fillHash();
    const driftSpeed = CONFIG.wraithDriftSpeed;
    const blinkDist = CONFIG.wraithBlinkDistance;
    const telegraphMax = CONFIG.wraithBlinkTelegraph;
    const kbDecay = Math.exp(-5.0 * dt);

    for (let i = 0; i < this.maxCount; i++) {
      if (!this.alive[i]) continue;
      const px = this.pos[i*3+0], pz = this.pos[i*3+2];

      // blink 倒數 / 預警
      if (this.telegraph[i] > 0) {
        this.telegraph[i] -= dt;
        if (this.telegraph[i] <= 0) {
          // 觸發 blink：朝 hero 方向瞬移 blinkDist
          let dx = heroX - px, dz = heroZ - pz;
          const d = Math.hypot(dx, dz);
          if (d > 0.001) {
            dx /= d; dz /= d;
            this.pos[i*3+0] = px + dx * blinkDist;
            this.pos[i*3+2] = pz + dz * blinkDist;
          }
          this.blinkTimer[i] = CONFIG.wraithBlinkInterval * (0.85 + Math.random() * 0.3);
        }
      } else {
        this.blinkTimer[i] -= dt;
        if (this.blinkTimer[i] <= 0) {
          this.telegraph[i] = telegraphMax;
        }
      }

      // 慢速漂移朝 hero（telegraph 中減速 50%，補強「蓄力」視覺）
      let dx = heroX - px, dz = heroZ - pz;
      const d = Math.hypot(dx, dz);
      if (d > 0.001) { dx /= d; dz /= d; }
      const sp = (this.telegraph[i] > 0) ? driftSpeed * 0.5 : driftSpeed;

      const kbx = this.knockback[i*3+0] * kbDecay;
      const kbz = this.knockback[i*3+2] * kbDecay;
      this.knockback[i*3+0] = kbx;
      this.knockback[i*3+2] = kbz;

      const vx = dx * sp + kbx;
      const vz = dz * sp + kbz;
      this.vel[i*3+0] = vx;
      this.vel[i*3+2] = vz;
      this.pos[i*3+0] += vx * dt;
      this.pos[i*3+2] += vz * dt;

      if (this.flashTime[i] > 0) this.flashTime[i] -= dt;
    }
  }

  syncInstances(timeNow) {
    let colorDirty = false;
    const invMaxSpeed = 1 / CONFIG.wraithDriftSpeed;
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

      const yOsc = 0.55 + Math.sin(timeNow * 0.005 + i) * 0.12;
      this._tmpV.set(this.pos[i*3+0], yOsc, this.pos[i*3+2]);
      const yaw = timeNow * 0.003 + i;
      this._tmpQ.setFromAxisAngle(this._up, yaw);
      this._tmpM.compose(this._tmpV, this._tmpQ, this._tmpScale);
      this.mesh.setMatrixAt(i, this._tmpM);

      const flashing = this.flashTime[i] > 0;
      const inTelegraph = this.telegraph[i] > 0;
      if (flashing) {
        const f = this.flashTime[i] / 0.08;
        this._tmpColor.setRGB(
          this._baseColor.r + f * 3,
          this._baseColor.g + f * 3,
          this._baseColor.b + f * 3
        );
        this.mesh.setColorAt(i, this._tmpColor);
        this._wasFlashing[i] = 1;
        colorDirty = true;
      } else if (inTelegraph) {
        // 強烈閃爍預警 — 用 sin pulse 在 base/warn 兩色間切換（每秒 ~6 次閃，眼睛抓得到節奏）
        const pulse = 0.5 + 0.5 * Math.sin(timeNow * 0.001 * 6 * Math.PI * 2);
        this._tmpColor.copy(this._baseColor).lerp(this._warnColor, pulse);
        this.mesh.setColorAt(i, this._tmpColor);
        this._wasFlashing[i] = 1;  // 標記為需在 telegraph 結束後還原
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
    this.flashTime[i] = 0.08;
    if (this.hp[i] <= 0) {
      this.alive[i] = 0;
      this.activeCount--;
      return true;
    }
    return false;
  }

  applyKnockback(i, kx, kz) {
    this.knockback[i*3+0] += kx * 1.1;
    this.knockback[i*3+2] += kz * 1.1;
  }

  consumeAt(i) {
    if (!this.alive[i]) return;
    this.alive[i] = 0;
    this.activeCount--;
  }
}
