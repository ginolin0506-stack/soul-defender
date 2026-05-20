// W7 + W9 + W10 共享 shader uniform 與 fx 注入
// - W7：vertex glitch（kick 起拍時頂點撕裂）
// - W9：Fresnel Rim Glow + Pseudo-AO + Breathing squash
// - W10：Procedural Animation — speed-driven crawl、knockback squash、charge stretch、normal tint

import * as THREE from 'three';

export const glitchUniform = { value: 0 };
export const timeUniform = { value: 0 };

/**
 * 注入 fx 到 MeshStandardMaterial（onBeforeCompile）— 保留標準 PBR 照明
 *
 * @param material
 * @param opts.rimColor       邊緣光顏色 vec3
 * @param opts.rimStrength    邊緣光強度
 * @param opts.aoStrength     底部暗化強度
 * @param opts.breathAmp      呼吸縮放幅度
 * @param opts.breathSpeed    呼吸頻率
 * @param opts.skipGlitch     是否跳過 W7 glitch
 * @param opts.proceduralAnim 啟用 W10 蠕動 + squash（需要 geometry 上有 aSpeed + aKnock attribute）
 * @param opts.crawlAmp       蠕動振幅（aSpeed=1 時的 Y 偏移上限，預設 0.12）
 * @param opts.crawlFreq      蠕動頻率
 * @param opts.crawlSpatialFreq 蠕動空間頻率（沿 position.z 變化的速率，產生「從尾到頭」的波）
 * @param opts.squashAmp      受擊壓扁強度（aKnock=1 時 Y 縮短比例，預設 0.35）
 * @param opts.hasCharge      啟用蓄力拉長（需要 geometry 上有 aCharge attribute）— Slinger 專用
 * @param opts.chargeStretch  蓄力 Y 拉長最大比例（預設 0.4）
 * @param opts.normalTint     法線方向染色強度（產生「水晶折射」假象，預設 0.06）
 */
export function injectFx(material, opts = {}) {
  const rimColor = opts.rimColor || [0.45, 0.7, 1.0];
  const rimStrength = opts.rimStrength ?? 0.7;
  const aoStrength = opts.aoStrength ?? 0.35;
  const breathAmp = opts.breathAmp ?? 0.03;
  const breathSpeed = opts.breathSpeed ?? 3.5;
  const skipGlitch = !!opts.skipGlitch;
  // W10
  const procAnim = !!opts.proceduralAnim;
  const crawlAmp = opts.crawlAmp ?? 0.12;
  const crawlFreq = opts.crawlFreq ?? 10.0;
  const crawlSpatialFreq = opts.crawlSpatialFreq ?? 4.0;
  const squashAmp = opts.squashAmp ?? 0.35;
  const hasCharge = !!opts.hasCharge;
  const chargeStretch = opts.chargeStretch ?? 0.4;
  const normalTint = opts.normalTint ?? 0.06;

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uGlitch = glitchUniform;
    shader.uniforms.uTime = timeUniform;
    shader.uniforms.uRimColor = { value: new THREE.Vector3(...rimColor) };
    shader.uniforms.uRimStrength = { value: rimStrength };
    shader.uniforms.uAoStrength = { value: aoStrength };
    shader.uniforms.uBreathAmp = { value: breathAmp };
    shader.uniforms.uBreathSpeed = { value: breathSpeed };
    shader.uniforms.uCrawlAmp = { value: crawlAmp };
    shader.uniforms.uCrawlFreq = { value: crawlFreq };
    shader.uniforms.uCrawlSpatial = { value: crawlSpatialFreq };
    shader.uniforms.uSquashAmp = { value: squashAmp };
    shader.uniforms.uChargeStretch = { value: chargeStretch };
    shader.uniforms.uNormalTint = { value: normalTint };

    // === VERTEX ===
    let vs = shader.vertexShader;
    let vsHeader = 'uniform float uGlitch;\nuniform float uTime;\n'
      + 'uniform float uBreathAmp;\nuniform float uBreathSpeed;\n'
      + 'uniform float uCrawlAmp;\nuniform float uCrawlFreq;\nuniform float uCrawlSpatial;\n'
      + 'uniform float uSquashAmp;\nuniform float uChargeStretch;\n'
      + 'varying float vYNorm;\nvarying vec3 vObjNormal;\n';
    if (procAnim) vsHeader += 'attribute float aSpeed;\nattribute float aKnock;\n';
    if (hasCharge) vsHeader += 'attribute float aCharge;\n';
    vs = vsHeader + vs;

    vs = vs.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      vObjNormal = normal;
      ${skipGlitch ? '' : `
      // W7 vertex glitch
      if (uGlitch > 0.001) {
        float seed = position.x * 12.9898 + position.z * 78.233;
        #ifdef USE_INSTANCING
          seed += instanceMatrix[3].x * 0.317 + instanceMatrix[3].z * 0.273;
        #endif
        float n = sin(seed + uTime * 13.7) * cos(seed * 1.7 + uTime * 8.3);
        vec3 dispDir = vec3(sin(seed * 3.1), cos(seed * 5.3), sin(seed * 2.7));
        transformed += dispDir * n * uGlitch;
      }
      `}
      // W9 呼吸 squash（per-instance phase）
      #ifdef USE_INSTANCING
        float instOff = instanceMatrix[3].x * 0.31 + instanceMatrix[3].z * 0.27;
      #else
        float instOff = 0.0;
      #endif
      float breathe = sin(uTime * uBreathSpeed + instOff) * uBreathAmp;
      transformed.y *= (1.0 + breathe);

      ${procAnim ? `
      // W10 蠕動 — speed-driven sine wave，沿 position.z 形成「從尾到頭」的波
      if (aSpeed > 0.01) {
        float waveY = sin(uTime * uCrawlFreq + position.z * uCrawlSpatial + instOff) * uCrawlAmp * aSpeed;
        transformed.y += waveY;
        // 沿 X 軸的 secondary 擺動（小幅）
        float waveX = sin(uTime * uCrawlFreq * 0.7 + position.z * uCrawlSpatial * 0.8) * uCrawlAmp * 0.5 * aSpeed;
        transformed.x += waveX;
      }
      // W10 受擊 squash — knockback magnitude 驅動的「壓扁 + 變寬」
      if (aKnock > 0.01) {
        float sq = clamp(aKnock, 0.0, 1.0) * uSquashAmp;
        transformed.y *= (1.0 - sq);
        transformed.x *= (1.0 + sq * 0.5);
        transformed.z *= (1.0 + sq * 0.5);
      }
      ` : ''}
      ${hasCharge ? `
      // W10 蓄力拉長 — Slinger 蓄力時 Y 軸延伸，X/Z 微縮（變成更瘦更高的法師塔）
      if (aCharge > 0.01) {
        float c = clamp(aCharge, 0.0, 1.0);
        transformed.y *= (1.0 + c * uChargeStretch);
        float taper = c * 0.18;
        transformed.x *= (1.0 - taper);
        transformed.z *= (1.0 - taper);
      }
      ` : ''}

      vYNorm = clamp(position.y * 0.5 + 0.5, 0.0, 1.0);
    `);

    // === FRAGMENT ===
    let fs = shader.fragmentShader;
    fs = 'uniform vec3 uRimColor;\nuniform float uRimStrength;\nuniform float uAoStrength;\nuniform float uNormalTint;\nvarying float vYNorm;\nvarying vec3 vObjNormal;\n' + fs;
    fs = fs.replace('#include <dithering_fragment>', `
      // W9 Fresnel rim glow
      vec3 viewDirN = normalize(vViewPosition);
      float fresnel = pow(1.0 - clamp(dot(normal, viewDirN), 0.0, 1.0), 2.5);
      gl_FragColor.rgb += uRimColor * fresnel * uRimStrength;

      // W10 Normal flashing — 物件空間 normal 方向染色（不同朝向有 subtle color shift，水晶折射感）
      gl_FragColor.rgb += vObjNormal * uNormalTint;

      // W9 Pseudo-AO
      float aoF = mix(1.0 - uAoStrength, 1.0, vYNorm);
      gl_FragColor.rgb *= aoF;

      #include <dithering_fragment>
    `);

    shader.vertexShader = vs;
    shader.fragmentShader = fs;
  };
  material.needsUpdate = true;
}

// 向後兼容
export function injectGlitch(material) {
  injectFx(material);
}
