import * as THREE from 'three';
import { CONFIG } from './config.js';
// 2026-05-23 Hero「Wireframe Hologram Warrior」用 Line2 系統做有粗細的線框（一般 LineSegments 在大部分平台 gl.lineWidth 永遠是 1px）
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';

export class Hero {
  constructor(scene, perks) {
    this.perks = perks;
    this.position = new THREE.Vector3(0, 0.9, 6);
    this.velocity = new THREE.Vector3();
    this.facing = 0;

    // === 2026-05-23 Hero「Wireframe Hologram Warrior」重建 ===
    // 參照藍圖式線框戰士：低面數人形機械體 + 厚實線框 + 持矛姿勢
    // 結構：腿(大腿+膝+小腿+腳) → 髖 → 下身 → 上胸 → 肩盔+刺 → 頸 → 頭+面甲+雙眼 → 頭頂脊
    //       手(雙臂+肘+前臂+手指) → 右手持「水晶矛」(柄+護手+鑽石刃)
    // 朝向：-Z 是「前方」(facing 0 對應 -Z)，與既有 facing 系統一致
    const group = new THREE.Group();

    // === 材質：3 種共用 ===
    // bodyMat：主殼 — 深藍金屬底 + 強青色 emissive，半透明造「全息圖」感
    // hitFlash 走這條 → 受傷時整身泛紅
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x0a2a4a,
      emissive: 0x0a3866,
      emissiveIntensity: 0.85,
      roughness: 0.45,
      metalness: 0.6,
      flatShading: true,
      transparent: true,
      opacity: 0.62,
    });
    this._bodyMat = bodyMat;

    // glowMat：眼、刃尖、能量核 — 強亮 emissive
    const glowMat = new THREE.MeshStandardMaterial({
      color: 0xaaffff,
      emissive: 0x00ddff,
      emissiveIntensity: 2.4,
      roughness: 0.2,
      metalness: 0.2,
      flatShading: true,
    });

    // wireMat：所有線框共用 — Line2 在 screen-space 用 px 寬度，gl.lineWidth 限制無關
    const wireMat = new LineMaterial({
      color: 0x6ee9ff,
      linewidth: 2.6,                              // px，2.6 是「明顯但不過粗」的甜蜜點
      transparent: true,
      opacity: 0.95,
      depthTest: true,
      depthWrite: false,
      dashed: false,
      worldUnits: false,
    });
    wireMat.resolution.set(window.innerWidth, window.innerHeight);
    this._wireMat = wireMat;

    // === Helper：建一個 body mesh 並自動套線框 overlay；最後 parent 預設為 group，可改成肢體 pivot ===
    const addBody = (geo, mat, x = 0, y = 0, z = 0, opts = {}, parent = group) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      if (opts.rx !== undefined) m.rotation.x = opts.rx;
      if (opts.ry !== undefined) m.rotation.y = opts.ry;
      if (opts.rz !== undefined) m.rotation.z = opts.rz;
      if (opts.sx || opts.sy || opts.sz) m.scale.set(opts.sx ?? 1, opts.sy ?? 1, opts.sz ?? 1);
      m.castShadow = true;
      // 線框：用 EdgesGeometry → LineSegmentsGeometry → LineSegments2
      const edges = new THREE.EdgesGeometry(geo, 1);
      const wireGeo = new LineSegmentsGeometry().fromEdgesGeometry(edges);
      const wire = new LineSegments2(wireGeo, wireMat);
      wire.computeLineDistances();
      m.add(wire);
      parent.add(m);
      return m;
    };

    // ============================================================
    //  下半身 — 髖、雙腿（大腿 / 膝 / 小腿 / 腳）
    // ============================================================
    // 髖盤（hip plate）
    addBody(new THREE.BoxGeometry(0.46, 0.18, 0.30), bodyMat, 0, 0.05, 0);
    // 髖部前方 V 接片
    addBody(new THREE.BoxGeometry(0.22, 0.16, 0.06), bodyMat, 0, 0.02, -0.16);

    // 雙腿：兩層 pivot — 髖 (leg group) + 膝 (knee sub-group)
    // leg: 髖關節 (sx*0.16, 0.05, 0) → 走路 / dash 用 rotation.x 前後擺
    // knee: 膝關節 (相對 leg 的局部 sx*0.03, -0.45, 0) → dash 蹲下時 rotation.x 折疊小腿
    for (const [sx, hipKey, kneeKey] of [[-1, '_legL', '_kneeL'], [+1, '_legR', '_kneeR']]) {
      const leg = new THREE.Group();
      leg.position.set(sx * 0.16, 0.05, 0);
      group.add(leg);
      this[hipKey] = leg;
      // 大腿（leg 局部 y：-0.23）
      addBody(new THREE.CylinderGeometry(0.11, 0.10, 0.35, 6), bodyMat, 0, -0.23, 0, { rz: sx * 0.06 }, leg);
      // 膝關節 + 膝甲（仍在 leg 直接子層，跟著大腿一起轉）
      addBody(new THREE.OctahedronGeometry(0.12, 0), bodyMat, sx * 0.03, -0.45, -0.02, {}, leg);
      addBody(new THREE.BoxGeometry(0.16, 0.14, 0.10), bodyMat, sx * 0.03, -0.45, -0.10, { rx: -0.3 }, leg);
      // 膝 sub-pivot — 小腿+腳 移進來，rotation.x 折疊
      const knee = new THREE.Group();
      knee.position.set(sx * 0.03, -0.45, 0);
      leg.add(knee);
      this[kneeKey] = knee;
      // 小腿（在 knee 局部 y：-0.20）
      addBody(new THREE.CylinderGeometry(0.085, 0.075, 0.32, 6), bodyMat, sx * 0.02, -0.20, 0, {}, knee);
      // 腳（在 knee 局部 y：-0.40）
      addBody(new THREE.BoxGeometry(0.20, 0.08, 0.32), bodyMat, sx * 0.02, -0.40, -0.04, {}, knee);
    }

    // ============================================================
    //  上半身 pivot — lean rotation 只作用此 pivot，雙腿不會跟著轉
    //  pivot 在腰部（hero local y=0.30）→ 上身彎腰時繞腰旋轉，腳留地
    // ============================================================
    const upperPivot = new THREE.Group();
    upperPivot.position.set(0, 0.30, 0);
    group.add(upperPivot);
    this._upperPivot = upperPivot;

    // ============================================================
    //  軀幹 — 下身、上胸、胸甲 V 凹、能量核（全部掛在 upperPivot 內，Y 已減去 0.30）
    // ============================================================
    // 下身（pelvis-to-chest 過渡）
    addBody(new THREE.CylinderGeometry(0.26, 0.30, 0.32, 6), bodyMat, 0, 0.00, 0, {}, upperPivot);

    // 上胸（trapezoidal —— 肩寬腰窄）
    addBody(new THREE.CylinderGeometry(0.38, 0.28, 0.42, 8), bodyMat, 0, 0.28, 0, {}, upperPivot);

    // 胸甲 V 凹
    addBody(new THREE.BoxGeometry(0.36, 0.28, 0.10), bodyMat, 0, 0.26, -0.20, { rx: -0.15 }, upperPivot);

    // 胸口能量核
    const chestCore = addBody(new THREE.OctahedronGeometry(0.06, 0), glowMat, 0, 0.25, -0.28, {}, upperPivot);
    this._chestCore = chestCore;

    // ============================================================
    //  雙肩盔 + 尖刺
    // ============================================================
    for (const sx of [-1, 1]) {
      addBody(new THREE.OctahedronGeometry(0.22, 0), bodyMat, sx * 0.42, 0.42, 0, { sy: 0.75 }, upperPivot);
      addBody(new THREE.ConeGeometry(0.08, 0.26, 4), bodyMat, sx * 0.50, 0.62, -0.04, { rz: sx * -0.55, rx: -0.15 }, upperPivot);
      addBody(new THREE.BoxGeometry(0.10, 0.10, 0.18), bodyMat, sx * 0.42, 0.40, -0.18, { rx: -0.25 }, upperPivot);
    }

    // ============================================================
    //  頸 + 頭 + 面甲 + 雙眼 + 頭頂脊
    // ============================================================
    addBody(new THREE.CylinderGeometry(0.10, 0.14, 0.12, 6), bodyMat, 0, 0.56, 0, {}, upperPivot);
    addBody(new THREE.IcosahedronGeometry(0.20, 0), bodyMat, 0, 0.72, 0, {}, upperPivot);
    for (const sx of [-1, 1]) {
      addBody(new THREE.BoxGeometry(0.10, 0.16, 0.18), bodyMat, sx * 0.18, 0.67, -0.04, { rz: sx * 0.32 }, upperPivot);
    }
    const eyeL = addBody(new THREE.OctahedronGeometry(0.038, 0), glowMat, -0.06, 0.72, -0.17, {}, upperPivot);
    const eyeR = addBody(new THREE.OctahedronGeometry(0.038, 0), glowMat, +0.06, 0.72, -0.17, {}, upperPivot);
    this._headCore = eyeL;
    this._eyeR = eyeR;
    addBody(new THREE.OctahedronGeometry(0.028, 0), glowMat, 0, 0.80, -0.14, {}, upperPivot);
    addBody(new THREE.ConeGeometry(0.07, 0.22, 4), bodyMat, 0, 0.96, 0.02, { rx: 0.15 }, upperPivot);

    // ============================================================
    //  雙臂 — 掛在 upperPivot 內（彎腰時手也跟著一起轉）
    //  arm pivot 位於 (sx*0.46, 0.40, 0) — 已減去 upperPivot 的 y=0.30
    // ============================================================
    for (const [sx, key] of [[-1, '_armL'], [+1, '_armR']]) {
      const arm = new THREE.Group();
      arm.position.set(sx * 0.46, 0.40, 0);
      upperPivot.add(arm);
      this[key] = arm;
      // 上臂（pivot 局部 y：-0.16 = hero-y 0.54 - pivot-y 0.70）
      addBody(new THREE.CylinderGeometry(0.095, 0.085, 0.32, 6), bodyMat, 0, -0.16, 0, { rz: sx * 0.15 }, arm);
      // 肘關節
      addBody(new THREE.OctahedronGeometry(0.095, 0), bodyMat, sx * 0.06, -0.34, 0, {}, arm);
      // 前臂（右手前傾持矛）
      const forearmZ = (sx > 0) ? -0.10 : 0.02;
      const forearmRx = (sx > 0) ? -0.35 : 0.05;
      addBody(new THREE.CylinderGeometry(0.078, 0.070, 0.30, 6), bodyMat, sx * 0.09, -0.52, forearmZ, { rx: forearmRx, rz: sx * 0.10 }, arm);
      // 拳
      const fistY = (sx > 0) ? -0.66 : -0.68;
      const fistZ = (sx > 0) ? -0.20 : 0.05;
      addBody(new THREE.OctahedronGeometry(0.08, 0), bodyMat, sx * 0.11, fistY, fistZ, {}, arm);
      // 三指
      for (let f = -1; f <= 1; f++) {
        const fingerZ = (sx > 0) ? fistZ - 0.02 : fistZ + 0.02;
        addBody(new THREE.ConeGeometry(0.022, 0.10, 3), bodyMat, sx * 0.11 + f * 0.035, fistY - 0.10, fingerZ, { rx: Math.PI }, arm);
      }
    }

    // ============================================================
    //  水晶矛 — 持於右手，向前下方延伸（參考圖 spear assembly）
    //  結構（沿 +Y 軸）：尾錘 → 柄 → 護手 → 鑽石刃 → 刃尖光點
    //  最後整支旋轉到右手前方，刃尖在 -Z 前方
    // ============================================================
    const spear = new THREE.Group();
    // 柄
    const shaftGeo = new THREE.CylinderGeometry(0.025, 0.030, 1.30, 6);
    const shaft = new THREE.Mesh(shaftGeo, bodyMat);
    spear.add(shaft);
    {
      const edges = new THREE.EdgesGeometry(shaftGeo, 1);
      const wireGeo = new LineSegmentsGeometry().fromEdgesGeometry(edges);
      const w = new LineSegments2(wireGeo, wireMat);
      w.computeLineDistances();
      shaft.add(w);
    }
    // 尾錘（pommel —— 矛底 -Y 方向）
    const pommelGeo = new THREE.OctahedronGeometry(0.06, 0);
    const pommel = new THREE.Mesh(pommelGeo, bodyMat);
    pommel.position.y = -0.68;
    spear.add(pommel);
    {
      const edges = new THREE.EdgesGeometry(pommelGeo, 1);
      const wireGeo = new LineSegmentsGeometry().fromEdgesGeometry(edges);
      const w = new LineSegments2(wireGeo, wireMat);
      w.computeLineDistances();
      pommel.add(w);
    }
    // 護手（crossguard — 柄與刃交界，扁長盒）
    const guardGeo = new THREE.BoxGeometry(0.16, 0.06, 0.10);
    const guard = new THREE.Mesh(guardGeo, bodyMat);
    guard.position.y = 0.58;
    spear.add(guard);
    {
      const edges = new THREE.EdgesGeometry(guardGeo, 1);
      const wireGeo = new LineSegmentsGeometry().fromEdgesGeometry(edges);
      const w = new LineSegments2(wireGeo, wireMat);
      w.computeLineDistances();
      guard.add(w);
    }
    // 鑽石刃（octahedron 拉長 — 沿矛軸 +Y 方向）
    const bladeGeo = new THREE.OctahedronGeometry(0.10, 0);
    const blade = new THREE.Mesh(bladeGeo, glowMat);
    blade.position.y = 0.88;
    blade.scale.set(0.85, 3.2, 0.85);
    spear.add(blade);
    {
      const edges = new THREE.EdgesGeometry(bladeGeo, 1);
      const wireGeo = new LineSegmentsGeometry().fromEdgesGeometry(edges);
      const w = new LineSegments2(wireGeo, wireMat);
      w.computeLineDistances();
      blade.add(w);
    }
    // 刃尖光點
    const tipGlowGeo = new THREE.OctahedronGeometry(0.05, 0);
    const tipGlow = new THREE.Mesh(tipGlowGeo, glowMat);
    tipGlow.position.y = 1.20;
    spear.add(tipGlow);

    // 矛掛到右手 pivot 內。中立時在原本位置 + 前向持矛
    // 用 literal 而非 this._spearIdlePos（後者在後面才宣告）
    spear.position.set(0.02, -0.50, -0.18);
    this._spearNeutralRotX = -Math.PI / 2 + 0.30;   // -1.27 rad
    spear.rotation.x = this._spearNeutralRotX;
    spear.rotation.y = 0.05;
    this._armR.add(spear);
    this._spear = spear;

    // ============================================================
    //  腳光環（地面投影暗示，保留既有 breathing opacity 系統）
    // ============================================================
    const ringGeo = new THREE.RingGeometry(0.55, 0.80, 32);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x66ffff,
      transparent: true,
      opacity: 0.55,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.y = -0.88;
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

    // 2026-05-23：spawn-in（出場縮放）+ 走動傾斜（cosmetic lean）+ 走路相位 + 蹲下垂直位移
    this._spawnT = 0.6;     // 倒數到 0；scale 從 0 浮現
    this._lean = 0;          // 移動傾斜插值
    this._wobble = 0;        // 站立呼吸相位
    this._walkPhase = 0;     // 走路週期相位（雙腿 + 雙手 sin 擺動）
    this._crouchDrop = 0;    // dash 時身體 Y 向下位移（補償膝彎讓腳留地）
    // dash 姿勢保持計時器 — 比 dashTimer 還長，讓蹲伏動作視覺上能看清楚
    // dashTimer = 0.16s（控速度/無敵），但姿勢保持 0.40s 才視覺可讀
    this._dashPoseTimer = 0;
    this._DASH_POSE_DURATION = 0.40;

    // 矛 + 手臂旋轉控制用 quaternion 暫存
    // Dash 揮舞：armR 整個轉到揮舞方向（肩為圓心），矛鎖定在 armR 的 -Y 軸（與 arm 共線）
    this._spearTargetQ = new THREE.Quaternion();
    this._spearWorldQ = new THREE.Quaternion();
    this._spearArmInvQ = new THREE.Quaternion();
    this._spearTmpV = new THREE.Vector3();
    this._spearTmpEuler = new THREE.Euler();
    this._spearYAxis = new THREE.Vector3(0, 1, 0);
    this._armRTargetQ = new THREE.Quaternion();
    this._armRTmpV = new THREE.Vector3();
    this._armRDownAxis = new THREE.Vector3(0, -1, 0);
    this._upperInvQ = new THREE.Quaternion();
    // 矛 dash 鎖定姿勢 = 180° 繞 X 軸翻轉（spear 的 +Y blade 方向 → armR 的 -Y outward 方向）
    this._spearDashQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);
    // 中立持矛 quaternion（idle / walk 時的目標）
    this._spearNeutralQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2 + 0.30, 0.05, 0));
    // armR 中立 quaternion（walk-cycle 取代 rotation.x 用）
    this._armRNeutralRotZ = 0.15;   // 構造時 rz 值（右手）
    // dash 時矛位置（at hand）vs idle 時位置
    this._spearIdlePos = new THREE.Vector3(0.02, -0.50, -0.18);
    this._spearDashPos = new THREE.Vector3(0.11, -0.66, -0.20);    // hand position in armR local

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
    // 2026-05-23 控制改為 pointer-follow：輸入回傳「pointer 相對 hero 的單位方向」
    input.getMoveDir(this.position.x, this.position.z, this._tmpMove);
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
    // dash 姿勢計時器倒數 — 比 dashTimer 更長，0.4s 內保持蹲伏 + 揮舞姿勢
    if (this._dashPoseTimer > 0) this._dashPoseTimer = Math.max(0, this._dashPoseTimer - dt);
    const inDashPose = this._dashPoseTimer > 0 && this._spawnT <= 0;

    // 蹲下 Y 位移（dash 時身體下沉 0.50 — 加深從俯角看也能看到）
    const crouchDropTarget = inDashPose ? -0.50 : 0;
    this._crouchDrop += (crouchDropTarget - this._crouchDrop) * Math.min(1, dt * 18);
    this.mesh.position.x = this.position.x;
    this.mesh.position.z = this.position.z;
    this.mesh.position.y = this.position.y + this._crouchDrop;
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

    // 呼吸：站立時 body 輕微 Y 縮放（蹲下改用真實膝彎 + Y 位移，不再壓 scale）
    this._wobble += dt;
    const moving = this.velocity.lengthSq() > 0.5;
    if (this._spawnT <= 0) {
      const breathe = 1 + Math.sin(this._wobble * 3.2) * 0.025;
      this.mesh.scale.y += (breathe - this.mesh.scale.y) * Math.min(1, dt * 14);
    }

    // 走動前傾：lean 只套用在 upperPivot（上半身），雙腿不會跟著轉 → 腳留地
    // dash 時上半身重壓 -1.0 rad (≈ 57°) 大幅前傾，俯角從上方也能清楚看到頭垂下
    const targetLean = inDashPose ? -1.00 : (moving ? -0.18 : 0);
    this._lean += (targetLean - this._lean) * Math.min(1, dt * 12);
    this.mesh.rotation.x = 0;                            // 整體 mesh 不再做 X 軸旋轉
    if (this._upperPivot) this._upperPivot.rotation.x = this._lean;

    // === 2026-05-23 走路動畫：雙腿前後擺、雙手反相擺（右手持矛擺幅縮小）===
    // 步頻：移動時 6-10 Hz（隨速度升）；靜止時 0（idle 走 sway）
    const moveLen = Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z);
    const movingRatio = Math.min(1, moveLen / CONFIG.heroSpeed);
    const stepHz = moving ? 6 + movingRatio * 4 : 0;
    this._walkPhase += dt * stepHz;
    const blend = Math.min(1, dt * 12);

    // 重要：肢體 pivot 的旋轉慣例 — pivot 內部子物件掛在 -Y 方向（手腳向下垂）。
    // rotation.x > 0 → -Y 軸往 -Z 旋轉 → 肢體往前擺；rotation.x < 0 → 肢體往後擺。
    // 膝關節同理：knee.rotation.x < 0 → 小腿往後折（蹲下時 calf 折在大腿後方）
    let tLegL, tLegR, tArmL, tArmR, tKneeL, tKneeR, limbBlend;
    if (inDashPose) {
      // === Dash 衝刺刺擊 ===
      // 腿、膝、左手用 limbBlend 慢慢套；右手 armR 由下方 quaternion 整支轉到揮舞方向（與矛共線）
      tLegL = -0.70;
      tLegR = +1.00;
      tKneeL = -0.20;
      tKneeR = -1.00;
      tArmL = +1.00;
      tArmR = null;       // sentinel — 跳過 rotation.x lerp，armR.quaternion 由 spear sweep 區段控制
      limbBlend = Math.min(1, dt * 30);
    } else if (moving) {
      const swingAmp = 0.42 * (0.4 + movingRatio * 0.6);          // 雙腿擺幅（最大 0.42 rad ≈ 24°）
      const armAmp = 0.36 * (0.4 + movingRatio * 0.6);             // 左手反相擺幅
      const armRAmp = armAmp * 0.35;                                // 右手持矛 → 擺幅縮小到 35%
      tLegL = Math.sin(this._walkPhase) * swingAmp;
      tLegR = Math.sin(this._walkPhase + Math.PI) * swingAmp;       // 反相
      tArmL = Math.sin(this._walkPhase + Math.PI) * armAmp;         // 對角步態：左手 vs 右腿同相
      tArmR = Math.sin(this._walkPhase) * armRAmp;                  // 右手 vs 左腿同相
      tKneeL = 0;
      tKneeR = 0;
      limbBlend = blend;
    } else {
      // 靜止：腿全停、雙手極小幅度晃，模擬呼吸帶動的微擺
      const idleSway = Math.sin(this._wobble * 1.2) * 0.04;
      tLegL = 0;
      tLegR = 0;
      tArmL = idleSway;
      tArmR = -idleSway * 0.3;
      tKneeL = 0;
      tKneeR = 0;
      limbBlend = blend;
    }
    if (this._legL) this._legL.rotation.x += (tLegL - this._legL.rotation.x) * limbBlend;
    if (this._legR) this._legR.rotation.x += (tLegR - this._legR.rotation.x) * limbBlend;
    if (this._kneeL) this._kneeL.rotation.x += (tKneeL - this._kneeL.rotation.x) * limbBlend;
    if (this._kneeR) this._kneeR.rotation.x += (tKneeR - this._kneeR.rotation.x) * limbBlend;
    if (this._armL) this._armL.rotation.x += (tArmL - this._armL.rotation.x) * limbBlend;
    if (this._armR && tArmR !== null) this._armR.rotation.x += (tArmR - this._armR.rotation.x) * limbBlend;

    // === Dash 揮舞：armR + spear 共線繞肩揮（user 要的「用力揮」感）/ 中立持矛（idle/walk）===
    if (this._spear && this._armR) {
      if (inDashPose) {
        // 揮舞分兩階段（同前次）
        //   階段 1 (timer 0.40 → 0.24)：位移期間，arm + spear 共線指向 +π (身後) — windup
        //   階段 2 (timer 0.24 → 0)：位移結束，arm + spear 共同繞肩 360° 揮舞
        const SWEEP_DURATION = this._DASH_POSE_DURATION - CONFIG.heroDashDuration;
        let sweepT;
        if (this._dashPoseTimer > SWEEP_DURATION) {
          sweepT = 0;
        } else {
          sweepT = 1 - this._dashPoseTimer / SWEEP_DURATION;
        }
        const sweepAngle = Math.PI * (1 - 2 * sweepT);

        // 想要的「手臂朝向」(在 hero 局部水平面)
        this._armRTmpV.set(Math.sin(sweepAngle), 0, -Math.cos(sweepAngle));
        // armR.parent = upperPivot。要 undo upperPivot 的 lean，這樣 armR 在 upperPivot 局部要朝向
        // upper.invQ × heroDir
        if (this._upperPivot) {
          this._upperInvQ.setFromEuler(this._upperPivot.rotation).invert();
          this._armRTmpV.applyQuaternion(this._upperInvQ);
        }
        // armR.quaternion 要把它的 -Y 軸（手臂垂下方向）轉到 _armRTmpV 方向
        this._armRTargetQ.setFromUnitVectors(this._armRDownAxis, this._armRTmpV);
        this._armR.quaternion.slerp(this._armRTargetQ, Math.min(1, dt * 35));

        // 矛：位置移到手腕、orientation 鎖定 180° X 翻轉
        // → spear +Y blade 方向 = armR 局部 -Y outward 方向 = 手臂前伸方向
        // → 結果：shoulder → arm → hand → blade 為一直線
        this._spear.position.lerp(this._spearDashPos, Math.min(1, dt * 30));
        this._spear.quaternion.slerp(this._spearDashQ, Math.min(1, dt * 30));
      } else {
        // Idle / walk：矛回到中立持矛位置 + 角度；armR.rotation.y/.z 也歸 0 清掉 dash 殘留
        this._spear.position.lerp(this._spearIdlePos, Math.min(1, dt * 18));
        this._spear.quaternion.slerp(this._spearNeutralQ, Math.min(1, dt * 18));
        // armR.rotation.y/z 由 dash quaternion 可能殘留非 0，這裡 lerp 回 0（rotation.x 由 walk 控）
        this._armR.rotation.y += (0 - this._armR.rotation.y) * Math.min(1, dt * 14);
        this._armR.rotation.z += (0 - this._armR.rotation.z) * Math.min(1, dt * 14);
      }
    }

    this.dashCooldown -= dt;
    if (input.consumeDash() && this.dashCooldown <= 0 && this.dashTimer <= 0) {
      // 2026-05-23 dash 方向優先序：
      // 1) 鼠標方向（桌面：左鍵 = 朝鼠標方向 dash；mobile pointerActive=false 自然跳過）
      // 2) 移動方向（WASD / 搖桿）
      // 3) 當前 facing
      let dx = 0, dz = 0;
      if (input.pointerActive) {
        const pdx = input.pointerWorldX - this.position.x;
        const pdz = input.pointerWorldZ - this.position.z;
        const plen = Math.hypot(pdx, pdz);
        // dead zone 0.5u：鼠標壓在英雄身上 → 跳過、由移動方向接手
        if (plen > 0.5) { dx = pdx / plen; dz = pdz / plen; }
      }
      if (dx === 0 && dz === 0) {
        dx = this._tmpMove.x;
        dz = this._tmpMove.z;
      }
      if (dx === 0 && dz === 0) {
        dx = Math.sin(this.facing + Math.PI);
        dz = Math.cos(this.facing + Math.PI);
      }
      this.dashDir.set(dx, 0, dz).normalize();
      this.dashTimer = CONFIG.heroDashDuration;
      this.dashCooldown = CONFIG.heroDashCooldown * (this.perks?.dashCooldownMult || 1);
      this.invulnerable = true;
      this.dashJustTriggered = true;
      // 姿勢保持 0.40s — 比 dashTimer 0.16s 還長，視覺上才看得到蹲伏動作
      this._dashPoseTimer = this._DASH_POSE_DURATION;
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
    // 腳光環 Y 位置動態抵消 crouchDrop → 不論身體下沉多少，光環永遠在地面（避免 dash 時光環被埋）
    this._ring.position.y = -0.88 - this._crouchDrop;

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
      this._bodyMat.emissiveIntensity = 0.85 + f * 6;
      // 受傷時 wire 也染紅，符合「全息圖警報」感
      this._bodyMat.emissive.setRGB(0.04 + f * 5, 0.22 - f * 0.22, 0.40 - f * 0.40);
      if (this._wireMat) {
        if (f > 0.01) this._wireMat.color.setRGB(0.4 + f * 4, 0.9 - f * 0.5, 1.0 - f * 0.6);
        else this._wireMat.color.setHex(0x6ee9ff);
      }
    }
  }

  /** 視窗 resize 時呼叫，更新 LineMaterial 的螢幕解析度（Line2 線寬以 px 計算） */
  onResize(w, h) {
    if (this._wireMat) this._wireMat.resolution.set(w, h);
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
