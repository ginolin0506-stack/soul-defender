import * as THREE from 'three';
import { CONFIG } from './config.js';

export class Hero {
  constructor(scene, perks) {
    this.perks = perks;
    this.position = new THREE.Vector3(0, 0.9, 6);
    this.velocity = new THREE.Vector3();
    this.facing = 0;

    const group = new THREE.Group();

    const bodyGeo = new THREE.CapsuleGeometry(0.5, 0.7, 6, 12);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x00d9ff,
      emissive: 0x004466,
      emissiveIntensity: 0.7,
      roughness: 0.35,
      metalness: 0.3,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.castShadow = true;
    group.add(body);
    this._bodyMat = bodyMat;

    const tipGeo = new THREE.ConeGeometry(0.25, 0.5, 6);
    const tipMat = new THREE.MeshStandardMaterial({
      color: 0x66ffff,
      emissive: 0x00aabb,
      emissiveIntensity: 1.0,
    });
    const tip = new THREE.Mesh(tipGeo, tipMat);
    tip.position.set(0, 0, -0.7);
    tip.rotation.x = Math.PI / 2;
    group.add(tip);

    const ringGeo = new THREE.RingGeometry(0.7, 0.95, 28);
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

    // === 英雄獨立血量（2026-05-21）===
    this.maxHp = CONFIG.heroMaxHp;
    this.hp = this.maxHp;
    this.damageIframeTimer = 0;       // 受傷後共用無敵秒數（觸怪 / 光束都會設）
    this.healBlockTimer = 0;          // boss 壓繫帶後 N 秒鎖回血
    this.hitFlash = 0;                // 視覺：受傷時 body 短閃

    // W4: Mass Collapse 用
    this.stationaryTime = 0;
    this.gravityWellActive = false;

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

    this.dashCooldown -= dt;
    if (input.wasPressed('Space') && this.dashCooldown <= 0 && this.dashTimer <= 0) {
      let dx = this._tmpMove.x, dz = this._tmpMove.z;
      if (dx === 0 && dz === 0) {
        dx = Math.sin(this.facing + Math.PI);
        dz = Math.cos(this.facing + Math.PI);
      }
      this.dashDir.set(dx, 0, dz).normalize();
      this.dashTimer = CONFIG.heroDashDuration;
      // W4 Regicide: Boss 存活時 Dash CD 額外 -30%
      const regicideBonus = (this.perks?.regicide && this.perks?.bossActive)
        ? CONFIG.regicideDashCdMult : 1;
      this.dashCooldown = CONFIG.heroDashCooldown
        * (this.perks?.dashCooldownMult || 1)
        * regicideBonus;
      this.invulnerable = true;
      this.dashJustTriggered = true;
    }

    // W4 Mass Collapse: 追蹤靜止時間
    if (this.perks?.massCollapse) {
      const moving = this._tmpMove.x !== 0 || this._tmpMove.z !== 0 || this.dashTimer > 0;
      if (moving) {
        this.stationaryTime = 0;
        this.gravityWellActive = false;
      } else {
        this.stationaryTime += dt;
        this.gravityWellActive = this.stationaryTime >= CONFIG.massCollapseStandTime;
      }
    } else {
      this.gravityWellActive = false;
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
   * @param orbitalSoulCount Soul Debt 軌道靈魂數，每顆 +3% 傷害
   */
  autoAttack(swarms, hashes, orbitalSoulCount = 0) {
    const hits = [];
    if (this.pulseTimer > 0) return hits;
    // AoE 重整 2026-05-21：Pierce 把脈衝間隔 +0.4 秒（trade-off：對 boss 單體 +60% 傷害但降頻）
    this.pulseTimer = CONFIG.heroPulseInterval
      + (this.perks?.pierce ? CONFIG.pierceIntervalAdd : 0);

    const radiusMult = this.perks?.pulseRadiusMult || 1;
    // 玩家反饋：開局攻擊範圍太小 → 套用 game.js 算好的 earlyRadiusBonus
    const earlyBonus = this.perks?._earlyRadiusBonus ?? 1;
    const radius = CONFIG.heroPulseRadius * radiusMult * earlyBonus;
    const r2 = radius * radius;

    // W4 Soul Debt 傷害加成
    const soulDebtBonus = (this.perks?.soulDebt && orbitalSoulCount > 0)
      ? (1 + orbitalSoulCount * CONFIG.soulDebtDmgPerSoul) : 1;
    // AoE 重整 2026-05-21：Pierce 單體傷害倍率
    const pierceMult = this.perks?.pierce ? CONFIG.pierceDamageMult : 1;
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
        let dmg = CONFIG.heroPulseBaseDamage * soulDebtBonus * pierceMult * volatilePulseMult;
        if (crit) dmg *= (CONFIG.heroPulseCritMult + (this.perks?.critMultBonus || 0));
        // W4 Regicide: 對 Boss 傷害 +50%
        if (this.perks?.regicide && swarm.isBoss) dmg *= CONFIG.regicideBossDmgMult;
        // W6 Glass Prism / 其他全域傷害倍率
        dmg *= (this.perks?.heroDmgGlobal || 1);
        // AoE 重整 2026-05-21：Fang Lunge 印記 — 被 dash 命中的敵人下一次脈衝吃 ×3
        let fangCrit = false;
        if (this.perks?.fangLunge && swarm.fangMark && swarm.fangMark[i] > 0) {
          dmg *= CONFIG.fangLungeMult;
          swarm.fangMark[i] = 0; // 消耗印記
          fangCrit = true;
        }
        hits.push({ swarm, idx: i, killed: false, x: ex, z: ez, dmg, crit: crit || fangCrit, dx, dz });
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
        // AoE 重整 2026-05-21：Fang Lunge — 對未死的敵人下「狼牙印記」，下一次脈衝 ×3
        if (this.perks?.fangLunge && !killed) {
          if (!swarm.fangMark) swarm.fangMark = new Float32Array(swarm.maxCount);
          swarm.fangMark[i] = CONFIG.fangLungeDuration;
        }
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
}
