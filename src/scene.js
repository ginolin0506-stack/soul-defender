import * as THREE from 'three';
import { CONFIG } from './config.js';

export function buildScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(CONFIG.bgColor);
  scene.fog = new THREE.Fog(CONFIG.bgColor, CONFIG.fogNear, CONFIG.fogFar);

  // === Camera ===
  const camera = new THREE.PerspectiveCamera(
    52,
    window.innerWidth / window.innerHeight,
    0.1,
    200
  );
  camera.position.set(0, 26, 18);
  camera.lookAt(0, 0, 0);

  // === Lights ===
  const ambient = new THREE.HemisphereLight(0x8866ff, 0x110a22, 0.55);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xccddff, 0.9);
  sun.position.set(-12, 22, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -25;
  sun.shadow.camera.right = 25;
  sun.shadow.camera.top = 25;
  sun.shadow.camera.bottom = -25;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 60;
  sun.shadow.bias = -0.0008;
  scene.add(sun);

  // 補光：往水晶方向發紫光
  const fill = new THREE.PointLight(0xb266ff, 1.6, 22, 1.8);
  fill.position.set(0, 4, 0);
  scene.add(fill);

  // === Ground ===
  const groundGeo = new THREE.PlaneGeometry(CONFIG.groundSize, CONFIG.groundSize, 1, 1);
  groundGeo.rotateX(-Math.PI / 2);
  const groundMat = new THREE.MeshStandardMaterial({
    color: 0x1a1830,
    roughness: 0.95,
    metalness: 0.05,
  });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.receiveShadow = true;
  scene.add(ground);

  // 地板格線（純視覺）
  const gridHelper = new THREE.GridHelper(CONFIG.groundSize, 50, 0x332b55, 0x1f1a3a);
  gridHelper.position.y = 0.01;
  gridHelper.material.opacity = 0.35;
  gridHelper.material.transparent = true;
  scene.add(gridHelper);

  // === Platforms 已移除 ===
  // W1 時設計「高低差地形」但 hero 從未實作 jump，平台變成純擋眼睛的 dead feature。
  // 玩家反饋（2026-05-20）：藍色區域沒意義。已撤掉。
  const platforms = [];

  // === 場景邊界石柱 (純裝飾) ===
  const pillarMat = new THREE.MeshStandardMaterial({
    color: 0x14122a,
    roughness: 0.9,
    flatShading: true,
  });
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const r = 38;
    const h = 4 + Math.random() * 3;
    const pg = new THREE.BoxGeometry(1.2, h, 1.2);
    const pm = new THREE.Mesh(pg, pillarMat);
    pm.position.set(Math.cos(a) * r, h / 2, Math.sin(a) * r);
    pm.rotation.y = Math.random() * 0.4;
    pm.castShadow = true;
    scene.add(pm);
  }

  return { scene, camera, ambient, sun, ground, platforms };
}
