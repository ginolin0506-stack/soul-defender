import * as THREE from 'three';
import { CONFIG } from './config.js';

export class Crystal {
  constructor(scene) {
    this.position = new THREE.Vector3(0, 0, 0);
    this.maxHp = CONFIG.crystalHp;
    this.hp = CONFIG.crystalHp;
    this.hitFlash = 0;

    const group = new THREE.Group();
    group.position.copy(this.position);

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
    core.position.y = 1.8;
    group.add(core);
    this.core = core;
    this.coreMat = coreMat;

    const shellGeo = new THREE.OctahedronGeometry(CONFIG.crystalRadius * 1.6, 0);
    const shellMat = new THREE.MeshBasicMaterial({
      color: 0xe0c0ff,
      wireframe: true,
      transparent: true,
      opacity: 0.35,
    });
    const shell = new THREE.Mesh(shellGeo, shellMat);
    shell.position.y = 1.8;
    group.add(shell);
    this.shell = shell;

    const baseGeo = new THREE.CylinderGeometry(1.4, 1.6, 0.6, 8);
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x2a2244,
      roughness: 0.7,
      flatShading: true,
    });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = 0.3;
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);

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

    this.hitFlash = Math.max(0, this.hitFlash - dt * 4);
    this.coreMat.emissiveIntensity = 1.2 + this.hitFlash * 3;

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
    this.hp = Math.min(this.maxHp, this.hp + amount);
  }
}
