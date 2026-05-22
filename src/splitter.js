import * as THREE from 'three';
import { CONFIG } from './config.js';
import { SpatialHash } from './spatialHash.js';
import { injectFx } from './glitch.js';

/**
 * Splitter — 炸彈衝刺怪（2026-05-22 重做）
 * 行為：高速朝水晶衝（leech 之上），HP 低易爆；死亡 / 撞水晶時拋出 3 顆引信炸彈
 * 炸彈飛行 → 引信到 → AoE 對 hero + crystal 同時造成傷害
 */
export class Splitters {
  constructor(scene, maxCount) {
    this.maxCount = maxCount;
    this.activeCount = 0;
    this.xpReward = CONFIG.splitterXp;

    // 2026-05-22：改炸彈衝刺怪 — 多面體 + 強橘紅 emissive，視覺暗示「會爆」
    const geo = new THREE.IcosahedronGeometry(CONFIG.splitterRadius, 1);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xff4422,
      emissiveIntensity: 0.95,
      roughness: 0.4,
      metalness: 0.3,
      flatShading: true,
    });
    // 高速衝刺 → crawl/squash 提速，rim 更亮警告即將爆炸
    injectFx(mat, {
      rimColor: [1.0, 0.45, 0.2],
      rimStrength: 1.0,
      aoStrength: 0.3,
      breathAmp: 0.05,
      breathSpeed: 5.5,         // 急促心跳
      proceduralAnim: true,
      crawlAmp: 0.10,
      crawlFreq: 9.0,
      crawlSpatialFreq: 3.0,
      squashAmp: 0.45,
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
    this._wasFlashing = new Uint8Array(maxCount);          // P4
    this._hidden = new Uint8Array(maxCount).fill(1);       // P6

    // 死亡位置佇列 — Game 取走後 spawn bombs（2026-05-22：mites 改成獨立 spawn 後改餵炸彈）
    this.deathQueue = [];

    const baseColor = new THREE.Color(0xff5533);
    for (let i = 0; i < maxCount; i++) this.mesh.setColorAt(i, baseColor);
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor.needsUpdate = true;   // B9

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

    this.hash = new SpatialHash(2.2);
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
      this.hp[i] = CONFIG.splitterHp;
      this.alive[i] = 1;
      this.flashTime[i] = 0;
      this.dashHitTag[i] = 0;
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
    const speed = CONFIG.splitterSpeed;
    const kbDecay = Math.exp(-5.0 * dt);

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

      if (this.flashTime[i] > 0) this.flashTime[i] -= dt;
    }
  }

  syncInstances(timeNow) {
    let colorDirty = false;
    for (let i = 0; i < this.maxCount; i++) {
      if (!this.alive[i]) {
        if (!this._hidden[i]) {
          this._tmpM.makeScale(0, 0, 0);
          this.mesh.setMatrixAt(i, this._tmpM);
          this._hidden[i] = 1;
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

      this._tmpV.set(this.pos[i*3+0], this.pos[i*3+1] + 0.8, this.pos[i*3+2]);
      const yaw = timeNow * 0.0015 + i * 0.5;
      this._tmpQ.setFromAxisAngle(this._up, yaw);
      this._tmpM.compose(this._tmpV, this._tmpQ, this._tmpScale);
      this.mesh.setMatrixAt(i, this._tmpM);

      const flashing = this.flashTime[i] > 0;
      if (flashing) {
        const f = this.flashTime[i] / 0.12;
        this._tmpColor.setRGB(
          this._baseColor.r + f * 3,
          this._baseColor.g + f * 3,
          this._baseColor.b + f * 3
        );
        this.mesh.setColorAt(i, this._tmpColor);
        this._wasFlashing[i] = 1;
        colorDirty = true;
      } else if (this._wasFlashing[i]) {
        this._tmpColor.setRGB(this._baseColor.r, this._baseColor.g, this._baseColor.b);
        this.mesh.setColorAt(i, this._tmpColor);
        this._wasFlashing[i] = 0;
        colorDirty = true;
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (colorDirty && this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  damage(i, amount) {
    if (!this.alive[i]) return false;
    this.hp[i] -= amount;
    this.flashTime[i] = 0.12;
    if (this.hp[i] <= 0) {
      this.alive[i] = 0;
      this.activeCount--;
      this.deathQueue.push({ x: this.pos[i*3+0], z: this.pos[i*3+2] });
      return true;
    }
    return false;
  }

  applyKnockback(i, kx, kz) {
    // 重型怪：擊退打折
    this.knockback[i*3+0] += kx * 0.5;
    this.knockback[i*3+2] += kz * 0.5;
  }

  /** Splitter 撞水晶 → 引爆 */
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

  consumeAt(i) {
    if (!this.alive[i]) return;
    this.alive[i] = 0;
    this.activeCount--;
  }

  consumeDeathQueue() {
    const q = this.deathQueue;
    this.deathQueue = [];
    return q;
  }
}


/**
 * Mites — Splitter 死亡產生的 3 隻小蟲
 * 行為：追蹤英雄（不是水晶），撞到英雄會死 + 推英雄朝水晶方向
 */
export class Mites {
  constructor(scene, maxCount) {
    this.maxCount = maxCount;
    this.activeCount = 0;
    this.xpReward = CONFIG.mitesXp;

    const geo = new THREE.IcosahedronGeometry(CONFIG.mitesRadius, 0);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xff4488,
      emissiveIntensity: 0.8,
      roughness: 0.3,
      flatShading: true,
    });
    // W9 + W10: mites 小但飛快，強烈活物感
    injectFx(mat, {
      rimColor: [1.0, 0.5, 0.7],
      rimStrength: 0.9,
      aoStrength: 0.2,
      breathAmp: 0.06,
      breathSpeed: 6.0,
      proceduralAnim: true,
      crawlAmp: 0.05,
      crawlFreq: 18.0,        // 高頻顫動
      crawlSpatialFreq: 8.0,
      squashAmp: 0.5,         // 強烈彈跳
      normalTint: 0.10,
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
    this._wasFlashing = new Uint8Array(maxCount);          // P4
    this._hidden = new Uint8Array(maxCount).fill(1);       // P6

    const baseColor = new THREE.Color(0xff7799);
    for (let i = 0; i < maxCount; i++) this.mesh.setColorAt(i, baseColor);
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor.needsUpdate = true;   // B9

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

    this.hash = new SpatialHash(1.2);
  }

  /** 從一個 (x, z) 產生 N 隻 mites（小爆散圖樣） */
  spawnFrom(x, z, count) {
    let spawned = 0;
    for (let i = 0; i < this.maxCount && spawned < count; i++) {
      if (this.alive[i]) continue;
      const a = (spawned / count) * Math.PI * 2 + Math.random() * 0.5;
      const r = 0.6 + Math.random() * 0.4;
      this.pos[i*3+0] = x + Math.cos(a) * r;
      this.pos[i*3+1] = 0.3;
      this.pos[i*3+2] = z + Math.sin(a) * r;
      this.vel[i*3+0] = Math.cos(a) * 4;
      this.vel[i*3+2] = Math.sin(a) * 4;
      this.knockback[i*3+0] = 0; this.knockback[i*3+2] = 0;
      this.hp[i] = CONFIG.mitesHp;
      this.alive[i] = 1;
      this.flashTime[i] = 0;
      this.dashHitTag[i] = 0;
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
    const speed = CONFIG.mitesSpeed;
    const kbDecay = Math.exp(-6.0 * dt);

    for (let i = 0; i < this.maxCount; i++) {
      if (!this.alive[i]) continue;
      const px = this.pos[i*3+0], pz = this.pos[i*3+2];
      let dx = heroX - px, dz = heroZ - pz;
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

      if (this.flashTime[i] > 0) this.flashTime[i] -= dt;
    }
  }

  syncInstances(timeNow) {
    let colorDirty = false;
    const invMaxSpeed = 1 / CONFIG.mitesSpeed;
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

      const yOsc = Math.sin(timeNow * 0.012 + i) * 0.08;
      this._tmpV.set(this.pos[i*3+0], 0.3 + yOsc, this.pos[i*3+2]);
      const yaw = timeNow * 0.004 + i;
      this._tmpQ.setFromAxisAngle(this._up, yaw);
      this._tmpM.compose(this._tmpV, this._tmpQ, this._tmpScale);
      this.mesh.setMatrixAt(i, this._tmpM);

      const flashing = this.flashTime[i] > 0;
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
      } else if (this._wasFlashing[i]) {
        this._tmpColor.setRGB(this._baseColor.r, this._baseColor.g, this._baseColor.b);
        this.mesh.setColorAt(i, this._tmpColor);
        this._wasFlashing[i] = 0;
        colorDirty = true;
      }

      // W10
      const speed = Math.hypot(this.vel[i*3+0], this.vel[i*3+2]);
      this.aSpeed[i] = Math.min(1, speed * invMaxSpeed);
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
    this.knockback[i*3+0] += kx * 1.3;  // mites 輕巧，擊退更強
    this.knockback[i*3+2] += kz * 1.3;
  }

  /** 找碰到英雄的 mites — 回傳 index 陣列 */
  collectHeroHits(heroX, heroZ, range) {
    const r2 = range * range;
    const hits = [];
    const cand = this.hash.queryXZ(heroX, heroZ, range);
    for (const i of cand) {
      if (!this.alive[i]) continue;
      const dx = this.pos[i*3+0] - heroX;
      const dz = this.pos[i*3+2] - heroZ;
      if (dx*dx + dz*dz < r2) hits.push(i);
    }
    return hits;
  }

  consumeAt(i) {
    if (!this.alive[i]) return;
    this.alive[i] = 0;
    this.activeCount--;
  }
}


/**
 * SplitterBombs — Splitter 死亡 / 撞水晶時拋出的引信炸彈池（2026-05-22 新增）
 * 行為：120° 等距 3 顆向外飛、線性減速、引信到爆炸；AoE 同時對 hero + crystal 造成傷害
 * 不屬於 enemy 池：脈衝/dash 打不到（玩家要躲），不參與 _allSwarmsArr
 */
export class SplitterBombs {
  constructor(scene, maxCount) {
    this.maxCount = maxCount;
    this.activeCount = 0;

    const geo = new THREE.IcosahedronGeometry(CONFIG.splitterBombRadius, 0);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xff3300,
      emissiveIntensity: 1.4,
      roughness: 0.4,
      metalness: 0.2,
      flatShading: true,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, maxCount);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);

    this.pos = new Float32Array(maxCount * 3);
    this.vel = new Float32Array(maxCount * 3);
    this.fuse = new Float32Array(maxCount);    // 剩餘引信秒數（>0 飛行，<=0 爆炸）
    this.alive = new Uint8Array(maxCount);
    this._hidden = new Uint8Array(maxCount).fill(1);

    const baseColor = new THREE.Color(0xff5522);
    for (let i = 0; i < maxCount; i++) this.mesh.setColorAt(i, baseColor);
    if (this.mesh.instanceColor) this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this._baseColor = baseColor;
    this._warnColor = new THREE.Color(0xffff66);

    const hide = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < maxCount; i++) this.mesh.setMatrixAt(i, hide);
    this.mesh.instanceMatrix.needsUpdate = true;

    this._tmpM = new THREE.Matrix4();
    this._tmpV = new THREE.Vector3();
    this._tmpQ = new THREE.Quaternion();
    this._tmpScale = new THREE.Vector3(1, 1, 1);
    this._tmpColor = new THREE.Color();
  }

  /** 從 (x, z) 噴出 N 顆 — 等角度向外發散 */
  spawnFrom(x, z, count) {
    const base = Math.random() * Math.PI * 2;
    let spawned = 0;
    for (let i = 0; i < this.maxCount && spawned < count; i++) {
      if (this.alive[i]) continue;
      const a = base + (spawned / count) * Math.PI * 2;
      this.pos[i*3+0] = x;
      this.pos[i*3+1] = 0.55;
      this.pos[i*3+2] = z;
      this.vel[i*3+0] = Math.cos(a) * CONFIG.splitterBombSpeed;
      this.vel[i*3+2] = Math.sin(a) * CONFIG.splitterBombSpeed;
      this.fuse[i] = CONFIG.splitterBombFuse;
      this.alive[i] = 1;
      this.activeCount++;
      spawned++;
    }
    return spawned;
  }

  /**
   * 推進炸彈 + 引信倒數，引信到觸發爆炸事件。
   * 回傳本幀「需要結算傷害的爆炸事件」陣列：[{x, z}, ...]
   * Game 收到事件後負責對 hero / crystal / 視覺做後處理。
   */
  update(dt) {
    const decel = CONFIG.splitterBombDecel;
    const events = [];
    for (let i = 0; i < this.maxCount; i++) {
      if (!this.alive[i]) {
        if (!this._hidden[i]) {
          this._tmpM.makeScale(0, 0, 0);
          this.mesh.setMatrixAt(i, this._tmpM);
          this._hidden[i] = 1;
        }
        continue;
      }

      // 線性減速（vx, vz 各自往 0 收斂）
      const vx0 = this.vel[i*3+0], vz0 = this.vel[i*3+2];
      const sp = Math.hypot(vx0, vz0);
      if (sp > 0.001) {
        const newSp = Math.max(0, sp - decel * dt);
        const m = newSp / sp;
        this.vel[i*3+0] = vx0 * m;
        this.vel[i*3+2] = vz0 * m;
      }

      this.pos[i*3+0] += this.vel[i*3+0] * dt;
      this.pos[i*3+2] += this.vel[i*3+2] * dt;
      this.fuse[i] -= dt;

      if (this.fuse[i] <= 0) {
        events.push({ x: this.pos[i*3+0], z: this.pos[i*3+2] });
        this.alive[i] = 0;
        this.activeCount--;
        this._tmpM.makeScale(0, 0, 0);
        this.mesh.setMatrixAt(i, this._tmpM);
        this._hidden[i] = 1;
        continue;
      }

      // 同步 instance matrix
      this._hidden[i] = 0;
      const yOsc = 0.55 + Math.sin(this.fuse[i] * 18) * 0.06;
      this._tmpV.set(this.pos[i*3+0], yOsc, this.pos[i*3+2]);
      this._tmpM.compose(this._tmpV, this._tmpQ, this._tmpScale);
      this.mesh.setMatrixAt(i, this._tmpM);

      // 引信越短越警告色 — 從橘紅 lerp 到亮黃
      const warn = 1 - Math.min(1, this.fuse[i] / CONFIG.splitterBombFuse);
      // pulse 加成（短引信時頻率快）
      const pulse = 0.6 + 0.4 * Math.sin(this.fuse[i] * 24);
      const t = Math.min(1, warn * (0.6 + 0.4 * pulse));
      this._tmpColor.copy(this._baseColor).lerp(this._warnColor, t);
      this.mesh.setColorAt(i, this._tmpColor);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    return events;
  }

  /** 取消所有炸彈（debug / 重置用） */
  clearAll() {
    for (let i = 0; i < this.maxCount; i++) {
      if (this.alive[i]) {
        this.alive[i] = 0;
        this.activeCount--;
      }
    }
  }
}
