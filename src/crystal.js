import * as THREE from 'three';
import { CONFIG } from './config.js';

export class Crystal {
  constructor(scene) {
    this.position = new THREE.Vector3(0, 0, 0);
    this.maxHp = CONFIG.crystalHp;
    this.hp = CONFIG.crystalHp;
    this.hitFlash = 0;
    // 2026-05-23：靈魂回流補血視覺 — 受治療時短暫亮起 + 偏青色
    this.healFlash = 0;

    // === 2026-05-23 Crystal「Data Core」精緻化 ===
    // 三層底盤 + 連接光柱 + 主核 + 反向小核 + wireframe 外殼 + 4 顆軌道碎片 + 上射光束
    const group = new THREE.Group();
    group.position.copy(this.position);

    // (1) 三層六角底盤 — 從寬到窄堆疊
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x2a2244,
      roughness: 0.7,
      flatShading: true,
      metalness: 0.4,
    });
    const baseAccentMat = new THREE.MeshStandardMaterial({
      color: 0x553388,
      emissive: 0x331166,
      emissiveIntensity: 0.4,
      roughness: 0.5,
      flatShading: true,
    });
    const baseLower = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.9, 0.30, 6), baseMat);
    baseLower.position.y = 0.15;
    baseLower.castShadow = true;
    baseLower.receiveShadow = true;
    group.add(baseLower);

    const baseMid = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.55, 0.25, 6), baseAccentMat);
    baseMid.position.y = 0.42;
    baseMid.rotation.y = Math.PI / 6;
    baseMid.castShadow = true;
    group.add(baseMid);

    const baseUpper = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.2, 0.18, 6), baseMat);
    baseUpper.position.y = 0.64;
    baseUpper.castShadow = true;
    group.add(baseUpper);

    // (2) 連接光柱 — 從底盤頂到核心
    const pillarGeo = new THREE.CylinderGeometry(0.08, 0.12, 0.85, 6);
    const pillarMat = new THREE.MeshStandardMaterial({
      color: 0xaa66ff,
      emissive: 0x8844ff,
      emissiveIntensity: 1.0,
      transparent: true,
      opacity: 0.85,
    });
    const pillar = new THREE.Mesh(pillarGeo, pillarMat);
    pillar.position.y = 1.20;
    group.add(pillar);

    // (3) 主核心 — 主水晶（保留原本的 hitFlash / healFlash 路徑）
    const coreGeo = new THREE.OctahedronGeometry(CONFIG.crystalRadius, 0);
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0xb266ff,
      emissive: 0xaa44ff,
      emissiveIntensity: 1.2,
      roughness: 0.2,
      metalness: 0.4,
      flatShading: true,
    });
    const core = new THREE.Mesh(coreGeo, coreMat);
    core.castShadow = true;
    core.position.y = 1.95;
    group.add(core);
    this.core = core;
    this.coreMat = coreMat;

    // (4) 反向旋轉的內核小水晶 — 兩層獨立旋轉產生 parallax 感
    const innerGeo = new THREE.OctahedronGeometry(CONFIG.crystalRadius * 0.45, 0);
    const innerMat = new THREE.MeshStandardMaterial({
      color: 0xffaaff,
      emissive: 0xff66ff,
      emissiveIntensity: 1.6,
      roughness: 0.15,
      flatShading: true,
    });
    const inner = new THREE.Mesh(innerGeo, innerMat);
    inner.position.y = 1.95;
    group.add(inner);
    this._inner = inner;

    // (5) Wireframe 外殼（保留）
    const shellGeo = new THREE.OctahedronGeometry(CONFIG.crystalRadius * 1.6, 0);
    const shellMat = new THREE.MeshBasicMaterial({
      color: 0xe0c0ff,
      wireframe: true,
      transparent: true,
      opacity: 0.35,
    });
    const shell = new THREE.Mesh(shellGeo, shellMat);
    shell.position.y = 1.95;
    group.add(shell);
    this.shell = shell;

    // (6) 4 顆軌道碎片 — 在核心周圍環繞，給「資料碎片在 orbit」感
    this._fragments = [];
    const fragMat = new THREE.MeshStandardMaterial({
      color: 0xddaaff,
      emissive: 0xaa44ff,
      emissiveIntensity: 1.2,
      flatShading: true,
    });
    for (let i = 0; i < 4; i++) {
      const fg = new THREE.OctahedronGeometry(0.22, 0);
      const fm = new THREE.Mesh(fg, fragMat);
      const angle = (i / 4) * Math.PI * 2;
      fm.userData.baseAngle = angle;
      fm.userData.yOffset = 1.95 + Math.sin(i * 1.3) * 0.4;
      fm.userData.orbitR = 2.0 + Math.cos(i * 0.7) * 0.3;
      group.add(fm);
      this._fragments.push(fm);
    }

    // (7) 上射光束 — 細高柱往上，視覺暗示「資料上傳到天頂」
    const beamGeo = new THREE.CylinderGeometry(0.06, 0.18, 5.5, 6);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xddaaff,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.y = 4.5;
    group.add(beam);
    this._uploadBeam = beam;

    // (8) 地面光環（保留）
    const haloGeo = new THREE.RingGeometry(1.7, 2.0, 48);
    haloGeo.rotateX(-Math.PI / 2);
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0xb266ff,
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide,
    });
    const halo = new THREE.Mesh(haloGeo, haloMat);
    halo.position.y = 0.65;
    group.add(halo);
    this.halo = halo;

    // Aegis 盾視覺：藍色光暈球體（shield > 0 時顯示）
    const shieldGeo = new THREE.SphereGeometry(2.2, 16, 12);
    const shieldMat = new THREE.MeshBasicMaterial({
      color: 0x66ccff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const shield = new THREE.Mesh(shieldGeo, shieldMat);
    shield.position.y = 1.8;
    group.add(shield);
    this.shieldMesh = shield;
    this.shieldMat = shieldMat;

    const warnGeo = new THREE.RingGeometry(2.5, 3.0, 64);
    warnGeo.rotateX(-Math.PI / 2);
    const warnMat = new THREE.MeshBasicMaterial({
      color: 0xff3366,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
    });
    const warn = new THREE.Mesh(warnGeo, warnMat);
    warn.position.y = 0.05;
    group.add(warn);
    this.warn = warn;

    scene.add(group);
    this.group = group;
  }

  update(dt, shieldHp = 0) {
    this.core.rotation.y += dt * 0.8;
    this.core.rotation.x += dt * 0.3;
    this.shell.rotation.y -= dt * 0.5;
    this.shell.rotation.z += dt * 0.2;
    this.halo.rotation.y += dt * 0.6;

    // 2026-05-23：內核反向旋轉、軌道碎片繞行、上射光束輕微脈動
    if (this._inner) {
      this._inner.rotation.y -= dt * 1.6;
      this._inner.rotation.z += dt * 1.1;
    }
    if (this._fragments) {
      const t = performance.now() * 0.0008;
      for (const f of this._fragments) {
        const a = f.userData.baseAngle + t;
        const r = f.userData.orbitR;
        f.position.set(Math.cos(a) * r, f.userData.yOffset + Math.sin(t * 2 + f.userData.baseAngle) * 0.15, Math.sin(a) * r);
        f.rotation.y += dt * 2.4;
        f.rotation.x += dt * 1.3;
      }
    }
    if (this._uploadBeam) {
      const op = 0.14 + Math.sin(performance.now() * 0.003) * 0.06;
      this._uploadBeam.material.opacity = op;
    }

    this.hitFlash = Math.max(0, this.hitFlash - dt * 4);
    this.healFlash = Math.max(0, this.healFlash - dt * 2.5);
    // emissive intensity 受傷紅紫雙閃 + 治療時亮度疊加
    this.coreMat.emissiveIntensity = 1.2 + this.hitFlash * 3 + this.healFlash * 1.6;
    // emissive 色相：基色 0xaa44ff（紫），治療時往青藍混 0x66ffcc
    if (this.healFlash > 0) {
      const k = this.healFlash;
      this.coreMat.emissive.setRGB(
        0.667 * (1 - k * 0.65) + 0.4 * k * 0.65,    // R: 紫→淡
        0.267 * (1 - k) + 1.0 * k,                  // G: 拉高
        1.0                                          // B: 維持
      );
    } else {
      this.coreMat.emissive.setHex(0xaa44ff);
    }

    const hpRatio = this.hp / this.maxHp;
    if (hpRatio < 0.35 && shieldHp <= 0) {
      const pulse = 0.4 + Math.sin(performance.now() * 0.012) * 0.3;
      this.warn.material.opacity = (0.35 - hpRatio) * 2 * pulse;
    } else {
      this.warn.material.opacity = 0;
    }

    // 盾視覺
    if (shieldHp > 0) {
      const breathe = 0.5 + Math.sin(performance.now() * 0.006) * 0.3;
      const intensity = Math.min(1, shieldHp / 100);
      this.shieldMat.opacity = 0.15 + breathe * 0.18 * intensity;
      this.shieldMesh.rotation.y += dt * 0.4;
    } else {
      this.shieldMat.opacity = 0;
    }
  }

  takeDamage(amount) {
    this.hp = Math.max(0, this.hp - amount);
    this.hitFlash = 1.0;
  }

  heal(amount) {
    if (amount <= 0 || this.hp >= this.maxHp) return;
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    // 實際補到血才閃光（避免滿血空閃）；補越多閃越久
    const actual = this.hp - before;
    if (actual > 0) {
      this.healFlash = Math.min(1.0, this.healFlash + Math.min(1.0, actual / 30));
    }
  }
}
