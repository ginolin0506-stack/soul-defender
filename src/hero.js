import * as THREE from 'three';
import { CONFIG } from './config.js';

export class Hero {
  constructor(scene, perks) {
    this.perks = perks;
    this.position = new THREE.Vector3(0, 0.9, 6);
    this.velocity = new THREE.Vector3();
    this.facing = 0;

    // === 2026-05-23 Hero「Wireframe Construct Bot」全面重塑 ===
    // 參照玩家提供的線框機械昆蟲意象：4 足機械蟻 — 大型雙眼頭、雙觸鬚、faceted 胸節 + 腹節、
    // 後翹尾針、4 條多關節機械腿，全身 EdgesGeometry 線框疊加營造資料化身體感
    //
    // 結構（朝 -Z 是頭部方向，跟原本 facing 系統一致）：
    //   頭 (-Z, 0.45y) ← 兩眼 + 雙觸鬚 + 雙顎刺
    //   胸 (中央, 0.55y) ← 兩側突起 + 中央光脈
    //   腹 (+Z, 0.50y) ← 兩道分節環 + 後翹尾針
    //   4 腿 ← 肩關節 + 上腿 + 膝關節 + 下腿 + 爪
    //   腳光環 (-0.85y) ← 地面投影暗示
    const group = new THREE.Group();

    // === 材質：3 種共用 ===
    // shellMat 主殼：深藍金屬底 + 強青色 emissive（hitFlash 仍走這條材質）
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x0a2440,
      emissive: 0x114488,
      emissiveIntensity: 0.7,
      roughness: 0.4,
      metalness: 0.7,
      flatShading: true,
    });
    this._bodyMat = bodyMat;

    // glowMat：眼睛 / 觸鬚尖 / 尾針 — 全亮，模仿線框圖中的高亮光點
    const glowMat = new THREE.MeshStandardMaterial({
      color: 0xaaffff,
      emissive: 0x00ddff,
      emissiveIntensity: 2.6,
      roughness: 0.15,
      metalness: 0.2,
      flatShading: true,
    });

    // jointMat：關節 / 觸鬚桿 / 腿節 — 中等亮度的青色金屬
    const jointMat = new THREE.MeshStandardMaterial({
      color: 0x336688,
      emissive: 0x0088aa,
      emissiveIntensity: 0.9,
      roughness: 0.3,
      metalness: 0.6,
      flatShading: true,
    });

    // 線框材質 — EdgesGeometry overlay 用，重現參考圖的「全身光線」感
    const wireMat = new THREE.LineBasicMaterial({
      color: 0x88eeff,
      transparent: true,
      opacity: 0.85,
    });

    // helper：給 mesh 套線框 overlay（讓子線框繼承父 mesh transform）
    const addWire = (mesh, threshold = 8) => {
      const edges = new THREE.EdgesGeometry(mesh.geometry, threshold);
      const wire = new THREE.LineSegments(edges, wireMat);
      mesh.add(wire);
    };

    // === 頭部 — 三角面顱（icosahedron）+ 雙眼 + 雙觸鬚 + 雙顎刺 ===
    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.34, 1), bodyMat);
    head.position.set(0, 0.45, -0.55);
    head.castShadow = true;
    group.add(head);
    addWire(head);
    this._head = head;

    // 雙眼 — 大型八面體鏡片，前方突出
    for (const sx of [-0.13, +0.13]) {
      const eye = new THREE.Mesh(new THREE.OctahedronGeometry(0.10, 0), glowMat);
      eye.position.set(sx, 0.50, -0.77);
      group.add(eye);
      if (sx < 0) this._eyeL = eye; else this._eyeR = eye;
    }

    // 雙觸鬚 — 從頭頂前向上後散開，桿 + 末端光球
    for (const sx of [-0.11, +0.11]) {
      const antennaPivot = new THREE.Object3D();
      antennaPivot.position.set(sx, 0.62, -0.62);
      antennaPivot.rotation.x = -0.55;
      antennaPivot.rotation.z = sx > 0 ? -0.20 : 0.20;
      group.add(antennaPivot);

      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.55, 5), jointMat);
      shaft.position.y = 0.275;
      antennaPivot.add(shaft);

      // 半途的小節（增加機械感）
      const mid = new THREE.Mesh(new THREE.OctahedronGeometry(0.035, 0), jointMat);
      mid.position.y = 0.30;
      antennaPivot.add(mid);

      const tip = new THREE.Mesh(new THREE.OctahedronGeometry(0.055, 0), glowMat);
      tip.position.y = 0.58;
      antennaPivot.add(tip);

      if (sx < 0) this._antennaL = antennaPivot; else this._antennaR = antennaPivot;
    }

    // 雙顎刺 — 兩側往外突的小錐（參考圖頰邊那兩根小探針）
    for (const sx of [-1, 1]) {
      const probePivot = new THREE.Object3D();
      probePivot.position.set(sx * 0.27, 0.42, -0.62);
      probePivot.rotation.z = sx > 0 ? -Math.PI / 2.3 : Math.PI / 2.3;
      probePivot.rotation.x = -0.25;
      group.add(probePivot);

      const probe = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.028, 0.18, 4), jointMat);
      probe.position.y = 0.09;
      probePivot.add(probe);

      const probeTip = new THREE.Mesh(new THREE.OctahedronGeometry(0.04, 0), glowMat);
      probeTip.position.y = 0.20;
      probePivot.add(probeTip);
    }

    // === 胸節 — 主軀幹 ===
    const thorax = new THREE.Mesh(new THREE.IcosahedronGeometry(0.40, 1), bodyMat);
    thorax.position.set(0, 0.55, -0.05);
    thorax.castShadow = true;
    group.add(thorax);
    addWire(thorax);

    // 胸節兩側突起 — 機械腔感
    for (const sx of [-1, 1]) {
      const bump = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.22), jointMat);
      bump.position.set(sx * 0.34, 0.55, -0.05);
      group.add(bump);
      addWire(bump);
    }

    // 中央光脈 — 從頭到腹的能量帶
    const spine = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.65), glowMat);
    spine.position.set(0, 0.76, -0.05);
    spine.scale.y = 0.5;
    group.add(spine);

    // === 腹節 — 後段較大球體 + 分節環 ===
    const abdomen = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 1), bodyMat);
    abdomen.position.set(0, 0.48, 0.42);
    abdomen.castShadow = true;
    group.add(abdomen);
    addWire(abdomen);

    // 兩道分節環
    for (let i = 0; i < 2; i++) {
      const ringSeg = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.022, 4, 16), jointMat);
      ringSeg.position.set(0, 0.48, 0.20 + i * 0.30);
      ringSeg.rotation.y = Math.PI / 2;
      ringSeg.rotation.z = Math.PI / 2;
      group.add(ringSeg);
    }

    // === 尾針 — 從腹部後上翹 ===
    const tailPivot = new THREE.Object3D();
    tailPivot.position.set(0, 0.62, 0.60);
    tailPivot.rotation.x = -0.45;       // 朝後上方
    group.add(tailPivot);

    const tailShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.038, 0.50, 5), jointMat);
    tailShaft.position.y = 0.25;
    tailPivot.add(tailShaft);

    const tailTip = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.18, 5), glowMat);
    tailTip.position.y = 0.59;
    tailPivot.add(tailTip);

    this._tail = tailPivot;

    // === 4 條多關節腿 ===
    // 規格：[sx 肩 x, sz 肩 z, splay 外張弧度, fb 前後傾, phase 走路相位]
    this._legs = [];
    const legSpecs = [
      [-0.32, -0.22, +0.85, -0.30, 0.00],   // 前左
      [+0.32, -0.22, -0.85, -0.30, 0.50],   // 前右
      [-0.34, +0.28, +0.75, +0.40, 0.50],   // 後左
      [+0.34, +0.28, -0.75, +0.40, 0.00],   // 後右
    ];

    for (const [sx, sz, splay, fb, phase] of legSpecs) {
      // 肩關節 pivot — 走路時整條腿擺動的中心
      const shoulder = new THREE.Object3D();
      shoulder.position.set(sx, 0.48, sz);
      shoulder.rotation.z = splay;
      shoulder.rotation.x = fb;
      group.add(shoulder);

      // 肩關節球
      const shoulderBall = new THREE.Mesh(new THREE.OctahedronGeometry(0.07, 0), jointMat);
      shoulder.add(shoulderBall);

      // 上腿節
      const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.040, 0.050, 0.32, 5), jointMat);
      upper.position.y = -0.16;
      shoulder.add(upper);

      // 膝關節 pivot — 走路時下腿屈伸的軸
      const knee = new THREE.Object3D();
      knee.position.y = -0.32;
      knee.rotation.x = -1.10;            // 初始彎曲（下腿往內勾向地面）
      shoulder.add(knee);

      // 膝關節球（亮）
      const kneeBall = new THREE.Mesh(new THREE.OctahedronGeometry(0.05, 0), glowMat);
      knee.add(kneeBall);

      // 下腿節
      const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.040, 0.36, 5), jointMat);
      lower.position.y = -0.18;
      knee.add(lower);

      // 爪尖（小錐）
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.12, 4), jointMat);
      claw.position.y = -0.40;
      claw.rotation.x = Math.PI;
      knee.add(claw);

      this._legs.push({ shoulder, knee, phase, baseRotX: fb, baseKneeX: -1.10 });
    }

    // === 腳光環（保留 — 地面位置提示） ===
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

    // === 2026-05-23 Wireframe Bot 動作系統 ===
    // 注意：上方 breathe 區塊已宣告 const moving；speed 變數則在 dash 區段被用過 → 用新名字 motionSpeed
    const now = performance.now();
    const motionSpeed = Math.hypot(this.velocity.x, this.velocity.z);

    // (a) 雙眼脈動 — 緩慢呼吸 + 受傷時亮度爆閃由 hitFlash 在 _bodyMat 上處理，眼本身只做尺度脈動
    const eyePulse = 1.0 + Math.sin(now * 0.005) * 0.12;
    if (this._eyeL) this._eyeL.scale.setScalar(eyePulse);
    if (this._eyeR) this._eyeR.scale.setScalar(eyePulse);

    // (b) 觸鬚擺動 — 移動時左右反相擺，靜止時微微抖
    const antAmp = moving ? 0.20 : 0.08;
    const antPhase = now * 0.006;
    if (this._antennaL) this._antennaL.rotation.z = +0.20 + Math.sin(antPhase) * antAmp;
    if (this._antennaR) this._antennaR.rotation.z = -0.20 - Math.sin(antPhase) * antAmp;

    // (c) 尾針擺動 — 略慢，給「平衡尾巴」的反向擺動感
    if (this._tail) {
      this._tail.rotation.z = Math.sin(now * 0.004) * 0.18;
      this._tail.rotation.x = -0.45 + Math.sin(now * 0.005) * 0.05;
    }

    // (d) 四腿走路循環 — 對角步態（前左+後右 / 前右+後左）
    if (this._legs) {
      const walkSpeed = Math.min(1.2, motionSpeed / CONFIG.heroSpeed);   // 動的越快循環越快
      const walkPhase = now * 0.012 * (moving ? walkSpeed * 5 + 1.0 : 0.4);
      for (const leg of this._legs) {
        const t = walkPhase + leg.phase * Math.PI * 2;
        const lift = moving ? Math.max(0, Math.sin(t)) * walkSpeed : 0;
        // 肩擺動：前後揮（X 軸）+ 微微外張擺動（Z 軸保留 splay）
        leg.shoulder.rotation.x = leg.baseRotX + Math.sin(t) * 0.30 * (moving ? walkSpeed : 0.15);
        // 膝彎曲：lift 高時更直、low 時更彎
        leg.knee.rotation.x = leg.baseKneeX + lift * 0.55;
      }
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
