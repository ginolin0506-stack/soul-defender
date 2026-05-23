import * as THREE from 'three';
import { CONFIG } from './config.js';

export class Hero {
  constructor(scene, perks) {
    this.perks = perks;
    this.position = new THREE.Vector3(0, 0.9, 6);
    this.velocity = new THREE.Vector3();
    this.facing = 0;

    // === 2026-05-23 Hero「Crystal Guardian Construct」重建 ===
    // 世界觀：玩家是水晶構念體 — 半 AI 半結晶守護單位，造型呼應中央水晶但更具機械感
    // 結構（自下而上）：六角平台 → 腳光環 → 漸縮下身 → 胸口能量核 → 上身軀幹 →
    //   雙肩盔 → 頭部感應器 → 前向能量矛 + 雙旋轉光環
    const group = new THREE.Group();

    // 共用材質：主體深色金屬青藍 + 高亮細節
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x1f5566,
      emissive: 0x004466,
      emissiveIntensity: 0.55,
      roughness: 0.4,
      metalness: 0.65,
      flatShading: true,
    });
    this._bodyMat = bodyMat;

    const glowMat = new THREE.MeshStandardMaterial({
      color: 0x66ffff,
      emissive: 0x00ccee,
      emissiveIntensity: 1.4,
      roughness: 0.25,
      metalness: 0.3,
      flatShading: true,
    });

    const accentMat = new THREE.MeshStandardMaterial({
      color: 0xaaeeff,
      emissive: 0x0088aa,
      emissiveIntensity: 0.9,
      roughness: 0.3,
      metalness: 0.55,
      flatShading: true,
    });

    // (1) 六角底盤 — 構念體浮空的承載
    const baseGeo = new THREE.CylinderGeometry(0.55, 0.68, 0.18, 6);
    const base = new THREE.Mesh(baseGeo, bodyMat);
    base.position.y = -0.78;
    base.castShadow = true;
    group.add(base);

    // (2) 漸縮下身 — 八角錐台
    const lowerGeo = new THREE.CylinderGeometry(0.32, 0.55, 0.55, 8);
    const lower = new THREE.Mesh(lowerGeo, bodyMat);
    lower.position.y = -0.4;
    lower.castShadow = true;
    group.add(lower);

    // (3) 胸口能量核 — 小水晶八面體（呼應大水晶，是「攜帶資料」的視覺暗示）
    const coreGeo = new THREE.OctahedronGeometry(0.22, 0);
    const core = new THREE.Mesh(coreGeo, glowMat);
    core.position.y = 0;
    group.add(core);
    this._chestCore = core;

    // (4) 上身軀幹 — 倒置六角柱（肩寬腰窄）
    const torsoGeo = new THREE.CylinderGeometry(0.42, 0.30, 0.55, 6);
    const torso = new THREE.Mesh(torsoGeo, bodyMat);
    torso.position.y = 0.28;
    torso.castShadow = true;
    group.add(torso);

    // (5) 雙肩盔 — 對稱兩塊小盔甲
    for (const sx of [-0.42, 0.42]) {
      const paulGeo = new THREE.BoxGeometry(0.22, 0.18, 0.32);
      const paul = new THREE.Mesh(paulGeo, accentMat);
      paul.position.set(sx, 0.46, 0);
      paul.castShadow = true;
      group.add(paul);
    }

    // (6) 頸環 + 頭部感應器
    const neckGeo = new THREE.CylinderGeometry(0.16, 0.18, 0.1, 6);
    const neck = new THREE.Mesh(neckGeo, accentMat);
    neck.position.y = 0.58;
    group.add(neck);

    const headGeo = new THREE.OctahedronGeometry(0.20, 0);
    const head = new THREE.Mesh(headGeo, glowMat);
    head.position.y = 0.80;
    head.castShadow = true;
    group.add(head);
    this._headCore = head;

    // (7) 前向能量矛 — 細桿 + 尖頭（取代原本的小三角）
    const shaftGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.7, 6);
    const shaft = new THREE.Mesh(shaftGeo, accentMat);
    shaft.position.set(0, 0.05, -0.6);
    shaft.rotation.x = Math.PI / 2;
    group.add(shaft);

    const lanceTipGeo = new THREE.ConeGeometry(0.10, 0.30, 6);
    const lanceTip = new THREE.Mesh(lanceTipGeo, glowMat);
    lanceTip.position.set(0, 0.05, -1.05);
    lanceTip.rotation.x = -Math.PI / 2;
    group.add(lanceTip);

    // (8) 雙旋轉光環 — 大外環順時針、小內環逆時針，給構念體 "tech aura" 感
    const haloOuterGeo = new THREE.TorusGeometry(0.85, 0.025, 6, 36);
    haloOuterGeo.rotateX(-Math.PI / 2);
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0x66ffff,
      transparent: true,
      opacity: 0.7,
    });
    const haloOuter = new THREE.Mesh(haloOuterGeo, haloMat);
    haloOuter.position.y = 0.15;
    group.add(haloOuter);
    this._haloOuter = haloOuter;

    const haloInnerGeo = new THREE.TorusGeometry(0.55, 0.02, 6, 28);
    haloInnerGeo.rotateX(-Math.PI / 2);
    haloInnerGeo.rotateZ(Math.PI / 6);
    const haloInner = new THREE.Mesh(haloInnerGeo, haloMat);
    haloInner.position.y = 0.05;
    group.add(haloInner);
    this._haloInner = haloInner;

    // (9) 腳光環（保留原本的呼吸節奏）
    const ringGeo = new THREE.RingGeometry(0.7, 0.95, 32);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x66ffff,
      transparent: true,
      opacity: 0.55,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.y = -0.85;
    group.add(ring);

    group.position.copy(this.position);
    scene.add(group);
    this.mesh = group;
    this._ring = ring;

    // 脈衝視覺池
    this._pulseRings = [];
    for (let i = 0; i < 8; i++) {
      const g = new THREE.RingGeometry(0.95, 1.0, 48);
      g.rotateX(-Math.PI / 2);
      const m = new THREE.MeshBasicMaterial({
        color: 0x88ffff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const r = new THREE.Mesh(g, m);
      r.position.y = 0.05;
      r.visible = false;
      scene.add(r);
      this._pulseRings.push({ mesh: r, age: 0, lifetime: 0.42, finalRadius: 1 });
    }
    this._pulseNext = 0;

    // 穿刺劍氣視覺池
    this._swordWaves = [];
    {
      const g = new THREE.PlaneGeometry(1, 1);
      g.rotateX(-Math.PI / 2);
      for (let i = 0; i < 6; i++) {
        const m = new THREE.MeshBasicMaterial({
          color: 0xccff77,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
        const mesh = new THREE.Mesh(g, m);
        mesh.position.y = 0.45;
        mesh.visible = false;
        scene.add(mesh);
        this._swordWaves.push({ mesh, age: 0, lifetime: CONFIG.pierceLifetime });
      }
    }
    this._swordWaveNext = 0;

    // Dash trail
    this._dashTrail = [];
    for (let i = 0; i < 5; i++) {
      const g = new THREE.SphereGeometry(0.3, 8, 6);
      const m = new THREE.MeshBasicMaterial({
        color: 0x66ffff,
        transparent: true,
        opacity: 0,
      });
      const t = new THREE.Mesh(g, m);
      t.visible = false;
      scene.add(t);
      this._dashTrail.push({ mesh: t, age: 0, lifetime: 0.3 });
    }
    this._trailNext = 0;
    this._trailTimer = 0;

    this.pulseTimer = 0;
    this.dashCooldown = 0;
    this.dashTimer = 0;
    this.dashDir = new THREE.Vector3();
    this.invulnerable = false;
    this.dashJustEnded = false;
    this.dashJustTriggered = false;

    // 2026-05-23：spawn-in（出場縮放）+ 走動傾斜（cosmetic lean）
    this._spawnT = 0.6;     // 倒數到 0；scale 從 0 浮現
    this._lean = 0;          // 移動傾斜插值
    this._wobble = 0;        // 站立呼吸相位

    // === 英雄獨立血量（2026-05-21）===
    this.maxHp = CONFIG.heroMaxHp;
    this.hp = this.maxHp;
    this.damageIframeTimer = 0;       // 受傷後共用無敵秒數（觸怪 / 光束都會設）
    this.healBlockTimer = 0;          // boss 壓繫帶後 N 秒鎖回血
    this.hitFlash = 0;                // 視覺：受傷時 body 短閃

    // 2026-05-22 Mire patches：游 hero 走進沼澤時的減速倍率（0 = 不減速，0.4 = 60% 速度）
    this.mireSlowFactor = 0;

    this._tmpMove = new THREE.Vector3();
  }

  update(dt, input) {
    input.getMoveVec(this._tmpMove);
    // 沼澤減速：dash 期間免疫（位移工具應該突破地形）
    const slowMult = (this.dashTimer > 0) ? 1 : (1 - this.mireSlowFactor);
    const speed = CONFIG.heroSpeed * (this.perks?.heroSpeedMult || 1) * slowMult;

    this.dashJustEnded = false;
    this.dashJustTriggered = false;

    if (this.dashTimer > 0) {
      const dashSpeed = CONFIG.heroDashDistance / CONFIG.heroDashDuration;
      this.velocity.set(this.dashDir.x * dashSpeed, 0, this.dashDir.z * dashSpeed);
      this.dashTimer -= dt;
      if (this.dashTimer <= 0) {
        this.invulnerable = false;
        this.dashJustEnded = true;
      }

      this._trailTimer -= dt;
      if (this._trailTimer <= 0) {
        const t = this._dashTrail[this._trailNext];
        this._trailNext = (this._trailNext + 1) % this._dashTrail.length;
        t.mesh.position.copy(this.position);
        t.mesh.material.opacity = 0.7;
        t.mesh.visible = true;
        t.age = 0;
        this._trailTimer = 0.025;
      }
    } else {
      this.velocity.set(this._tmpMove.x * speed, 0, this._tmpMove.z * speed);
    }
    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;

    const half = CONFIG.groundSize / 2 - 2;
    this.position.x = Math.max(-half, Math.min(half, this.position.x));
    this.position.z = Math.max(-half, Math.min(half, this.position.z));

    if (this.velocity.lengthSq() > 0.5) {
      this.facing = Math.atan2(this.velocity.x, this.velocity.z) + Math.PI;
    }
    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.facing;

    // === 2026-05-23：spawn-in + 呼吸 + 走動傾斜 ===
    if (this._spawnT > 0) {
      this._spawnT = Math.max(0, this._spawnT - dt);
      const t = 1 - this._spawnT / 0.6;                // 0→1
      const s = t * t * (3 - 2 * t);                    // smoothstep
      const overshoot = s + Math.sin(t * Math.PI) * 0.12;
      this.mesh.scale.set(overshoot, overshoot, overshoot);
    } else if (this.mesh.scale.x !== 1) {
      this.mesh.scale.set(1, 1, 1);
    }

    // 呼吸：站立時 body 輕微 Y 縮放（dash / spawn 時不疊加避免抽搐）
    this._wobble += dt;
    const moving = this.velocity.lengthSq() > 0.5;
    if (this._spawnT <= 0) {
      const breathe = 1 + Math.sin(this._wobble * 3.2) * 0.025;
      this.mesh.scale.y = breathe;
    }

    // 走動前傾：在 mesh.rotation.x 上插值（雷霆衝刺時更傾）
    const targetLean = this.dashTimer > 0 ? -0.45 : (moving ? -0.18 : 0);
    this._lean += (targetLean - this._lean) * Math.min(1, dt * 10);
    this.mesh.rotation.x = this._lean;

    this.dashCooldown -= dt;
    if (input.wasPressed('Space') && this.dashCooldown <= 0 && this.dashTimer <= 0) {
      let dx = this._tmpMove.x, dz = this._tmpMove.z;
      if (dx === 0 && dz === 0) {
        dx = Math.sin(this.facing + Math.PI);
        dz = Math.cos(this.facing + Math.PI);
      }
      this.dashDir.set(dx, 0, dz).normalize();
      this.dashTimer = CONFIG.heroDashDuration;
      this.dashCooldown = CONFIG.heroDashCooldown * (this.perks?.dashCooldownMult || 1);
      this.invulnerable = true;
      this.dashJustTriggered = true;
    }

    this.pulseTimer -= dt;

    // 脈衝視覺更新
    for (const p of this._pulseRings) {
      if (!p.mesh.visible) continue;
      p.age += dt;
      const t = p.age / p.lifetime;
      if (t >= 1) { p.mesh.visible = false; continue; }
      const s = 1.0 + t * (p.finalRadius - 1.0);
      p.mesh.scale.set(s, 1, s);
      p.mesh.material.opacity = (1 - t) * 0.8;
    }

    // 穿刺劍氣衰減
    for (const w of this._swordWaves) {
      if (!w.mesh.visible) continue;
      w.age += dt;
      const f = w.age / w.lifetime;
      if (f >= 1) { w.mesh.visible = false; continue; }
      w.mesh.material.opacity = (1 - f) * 0.85;
    }

    // Dash trail 衰減
    for (const t of this._dashTrail) {
      if (!t.mesh.visible) continue;
      t.age += dt;
      const f = t.age / t.lifetime;
      if (f >= 1) { t.mesh.visible = false; continue; }
      t.mesh.material.opacity = (1 - f) * 0.6;
      const s = 1 - f * 0.5;
      t.mesh.scale.set(s, s, s);
    }

    // 腳光環呼吸
    const breathe = 0.5 + Math.sin(performance.now() * 0.005) * 0.15;
    this._ring.material.opacity = breathe;

    // 2026-05-23：雙旋轉光環 + 胸口/頭部能量核脈動
    if (this._haloOuter) this._haloOuter.rotation.y += dt * 1.4;
    if (this._haloInner) this._haloInner.rotation.y -= dt * 2.1;
    const pulse = 1.0 + Math.sin(performance.now() * 0.008) * 0.12;
    if (this._chestCore) {
      this._chestCore.rotation.y += dt * 1.8;
      this._chestCore.rotation.x += dt * 0.9;
      this._chestCore.scale.setScalar(pulse);
    }
    if (this._headCore) {
      this._headCore.rotation.y -= dt * 1.2;
      this._headCore.rotation.z += dt * 0.6;
    }

    // === 受傷無敵 / 鎖回血 / 受傷視覺衰減 ===
    if (this.damageIframeTimer > 0) this.damageIframeTimer = Math.max(0, this.damageIframeTimer - dt);
    if (this.healBlockTimer > 0) this.healBlockTimer = Math.max(0, this.healBlockTimer - dt);
    if (this.hitFlash > 0) this.hitFlash = Math.max(0, this.hitFlash - dt * 3.0);
    // hit flash → 紅閃 emissive
    if (this._bodyMat) {
      const f = this.hitFlash;
      this._bodyMat.emissiveIntensity = 0.7 + f * 6;
      this._bodyMat.emissive.setRGB(0.0 + f * 5, 0.27 - f * 0.27, 0.40 - f * 0.40);
    }
  }

  /** 受到傷害；回傳是否「這次造成死亡」（HP 從 >0 變 ≤0）。dash 中無敵 + iframe 期間吸收 */
  takeDamage(amount) {
    if (this.hp <= 0) return false;
    if (this.invulnerable) return false;
    if (this.damageIframeTimer > 0) return false;
    this.hp -= amount;
    this.damageIframeTimer = CONFIG.heroTouchIframe;
    this.hitFlash = 0.35;
    if (this.hp <= 0) {
      this.hp = 0;
      return true;
    }
    return false;
  }

  /** 治療（會 clamp 到 maxHp） */
  heal(amount) {
    if (this.hp <= 0) return;
    this.hp = Math.min(this.maxHp, this.hp + amount);
  }

  /**
   * AOE 脈衝攻擊（覆蓋多 swarm）
   * @param swarms array of swarm
   * @param hashes array of hash（一一對應）
   */
  autoAttack(swarms, hashes) {
    const hits = [];
    if (this.pulseTimer > 0) return hits;
    this.pulseTimer = CONFIG.heroPulseInterval;

    const radiusMult = this.perks?.pulseRadiusMult || 1;
    // 玩家反饋：開局攻擊範圍太小 → 套用 game.js 算好的 earlyRadiusBonus
    const earlyBonus = this.perks?._earlyRadiusBonus ?? 1;
    const radius = CONFIG.heroPulseRadius * radiusMult * earlyBonus;
    const r2 = radius * radius;

    // Volatile Loop（禁忌代碼）+150% 脈衝傷害（脈衝專屬，不波及 Dash / KineticReversal）
    const volatilePulseMult = this.perks?.volatilePulseMult || 1;

    this.spawnPulseRing(this.position.x, this.position.z, radius, 0x88ffff, 0.85);

    for (let s = 0; s < swarms.length; s++) {
      const swarm = swarms[s];
      const hash = hashes[s];
      const candidates = hash.queryXZ(this.position.x, this.position.z, radius);
      for (let k = 0; k < candidates.length; k++) {
        const i = candidates[k];
        if (!swarm.alive[i]) continue;
        const ex = swarm.pos[i*3+0], ez = swarm.pos[i*3+2];
        const dx = ex - this.position.x, dz = ez - this.position.z;
        if (dx*dx + dz*dz > r2) continue;

        const crit = Math.random() < (CONFIG.heroPulseCritChance + (this.perks?.critChanceBonus || 0));
        let dmg = CONFIG.heroPulseBaseDamage * volatilePulseMult;
        if (crit) dmg *= CONFIG.heroPulseCritMult;
        // W4 Regicide: 對 Boss 傷害 +50%
        if (this.perks?.regicide && swarm.isBoss) dmg *= CONFIG.regicideBossDmgMult;
        // W6 Glass Prism / 其他全域傷害倍率
        dmg *= (this.perks?.heroDmgGlobal || 1);
        hits.push({ swarm, idx: i, killed: false, x: ex, z: ez, dmg, crit, dx, dz });
      }
    }

    // 結算傷害 + 擊退
    for (const h of hits) {
      h.killed = h.swarm.damage(h.idx, h.dmg);
      const len = Math.max(0.001, Math.hypot(h.dx, h.dz));
      h.swarm.applyKnockback(h.idx, (h.dx/len) * 4, (h.dz/len) * 4);
    }
    return hits;
  }

  /** Dash 接觸傷害（多 swarm 版） */
  dashHits(swarms, hashes) {
    if (this.dashTimer <= 0 && !this.dashJustTriggered) return [];
    const hits = [];
    const r = CONFIG.heroDashRadius;
    const r2 = r * r;

    for (let s = 0; s < swarms.length; s++) {
      const swarm = swarms[s];
      const hash = hashes[s];
      const cand = hash.queryXZ(this.position.x, this.position.z, r);
      for (let k = 0; k < cand.length; k++) {
        const i = cand[k];
        if (!swarm.alive[i] || swarm.dashHitTag[i]) continue;
        const ex = swarm.pos[i*3+0], ez = swarm.pos[i*3+2];
        const dx = ex - this.position.x, dz = ez - this.position.z;
        if (dx*dx + dz*dz > r2) continue;
        swarm.dashHitTag[i] = 1;
        // W4 Regicide: dash 穿越 Boss 多 50% 傷害
        let dmg = CONFIG.heroDashDamage;
        if (this.perks?.regicide && swarm.isBoss) dmg *= CONFIG.regicideBossDmgMult;
        // W6 Glass Prism 全域倍率
        dmg *= (this.perks?.heroDmgGlobal || 1);
        const killed = swarm.damage(i, dmg);
        const len = Math.max(0.001, Math.hypot(dx, dz));
        const kb = CONFIG.heroDashKnockback;
        swarm.applyKnockback(i, (dx/len) * kb, (dz/len) * kb);
        hits.push({ swarm, idx: i, killed, x: ex, z: ez, dmg, crit: true });
      }
    }
    return hits;
  }

  clearDashTags(...swarms) {
    if (this.dashTimer > 0) return;
    for (const sw of swarms) {
      if (!sw) continue;
      for (let i = 0; i < sw.maxCount; i++) sw.dashHitTag[i] = 0;
    }
  }

  /** B14: 公開 API — game 不再需要摸 hero 內部 ring 池 */
  spawnPulseRing(x, z, radius, colorHex = 0x88ffff, opacity = 0.85) {
    const ring = this._pulseRings[this._pulseNext];
    this._pulseNext = (this._pulseNext + 1) % this._pulseRings.length;
    ring.mesh.position.set(x, 0.06, z);
    ring.mesh.scale.set(1, 1, 1);
    ring.mesh.material.color.setHex(colorHex);
    ring.mesh.material.opacity = opacity;
    ring.mesh.visible = true;
    ring.age = 0;
    ring.finalRadius = radius;
  }

  /**
   * 穿刺 Pierce：每 N 秒朝最近敵人射出一道劍氣，沿線段對所有敵人造成範圍傷害
   * @returns array of hit objects（同 autoAttack）— 給 game.js 結算 onKill / 傷害數字
   */
  firePierce(swarms, dt) {
    if (!this.perks?.pierce) return null;
    this.perks.pierceTimer = (this.perks.pierceTimer || 0) - dt;
    if (this.perks.pierceTimer > 0) return null;
    this.perks.pierceTimer = CONFIG.pierceInterval;

    // 找最近敵人（用 swarms 直接掃，不走 hash 因為 pierceRange 大）
    let nearest = null;
    let bestD2 = Infinity;
    for (const sw of swarms) {
      for (let i = 0; i < sw.maxCount; i++) {
        if (!sw.alive[i]) continue;
        const dx = sw.pos[i*3+0] - this.position.x;
        const dz = sw.pos[i*3+2] - this.position.z;
        const d2 = dx*dx + dz*dz;
        if (d2 < bestD2) { bestD2 = d2; nearest = { x: sw.pos[i*3+0], z: sw.pos[i*3+2] }; }
      }
    }
    if (!nearest) return null;

    const dx = nearest.x - this.position.x;
    const dz = nearest.z - this.position.z;
    const dist = Math.sqrt(dx*dx + dz*dz) || 1;
    const ndx = dx / dist, ndz = dz / dist;
    const range = CONFIG.pierceRange;
    const endX = this.position.x + ndx * range;
    const endZ = this.position.z + ndz * range;

    const width = CONFIG.pierceWidth;
    const w2 = width * width;
    const dmg = CONFIG.pierceDamage * (this.perks?.heroDmgGlobal || 1);
    const hits = [];
    for (const sw of swarms) {
      for (let i = 0; i < sw.maxCount; i++) {
        if (!sw.alive[i]) continue;
        const ex = sw.pos[i*3+0], ez = sw.pos[i*3+2];
        const dot = (ex - this.position.x) * ndx + (ez - this.position.z) * ndz;
        if (dot < 0 || dot > range) continue;
        const px = this.position.x + ndx * dot;
        const pz = this.position.z + ndz * dot;
        const ddx = ex - px, ddz = ez - pz;
        if (ddx*ddx + ddz*ddz > w2) continue;
        let d = dmg;
        if (sw.isBoss && this.perks?.regicide) d *= CONFIG.regicideBossDmgMult;
        const killed = sw.damage(i, d);
        hits.push({ swarm: sw, idx: i, killed, x: ex, z: ez, dmg: d, crit: false });
      }
    }

    this._spawnSwordWave(this.position.x, this.position.z, endX, endZ);
    return hits;
  }

  _spawnSwordWave(x1, z1, x2, z2) {
    const w = this._swordWaves[this._swordWaveNext];
    this._swordWaveNext = (this._swordWaveNext + 1) % this._swordWaves.length;
    const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
    const dx = x2 - x1, dz = z2 - z1;
    const len = Math.sqrt(dx*dx + dz*dz);
    w.mesh.position.set(cx, 0.45, cz);
    w.mesh.scale.set(len, 1, CONFIG.pierceWidth * 2.2);
    w.mesh.rotation.y = Math.atan2(dx, dz) - Math.PI / 2;
    w.mesh.material.opacity = 0.85;
    w.mesh.visible = true;
    w.age = 0;
    w.lifetime = CONFIG.pierceLifetime;
  }
}
