import * as THREE from 'three';

/**
 * "See-through" cutaway: anything standing between the camera and the rickshaw
 * dissolves with an ordered dither (no transparency sorting, shadows untouched).
 * The cut is a cone with its apex at the camera, so the hole has a constant size
 * on screen. Uniforms are shared by every patched material and updated once a frame.
 */
export const occlusion = {
  uOccCam: { value: new THREE.Vector3() },
  uOccTarget: { value: new THREE.Vector3() },
  uOccRadius: { value: 4.2 },
};

export function updateOcclusion(camera: THREE.Vector3, target: THREE.Vector3): void {
  occlusion.uOccCam.value.copy(camera);
  occlusion.uOccTarget.value.copy(target);
}

export function withOcclusion<T extends THREE.Material>(material: T): T {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, occlusion);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vOccWorld;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vec4 occW = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          occW = instanceMatrix * occW;
        #endif
        vOccWorld = (modelMatrix * occW).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vOccWorld;
        uniform vec3 uOccCam;
        uniform vec3 uOccTarget;
        uniform float uOccRadius;
        float occBayer(vec2 p) {
          vec2 q = mod(floor(p), 4.0);
          // 4x4 Bayer matrix, row-major
          const float m[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
          return (m[int(q.x + q.y * 4.0)] + 0.5) / 16.0;
        }`,
      )
      .replace(
        'void main() {',
        `void main() {
        {
          vec3 ab = uOccTarget - uOccCam;
          float L = length(ab);
          vec3 dir = ab / L;
          vec3 ap = vOccWorld - uOccCam;
          float t = dot(ap, dir);
          if (t > 0.0 && t < L - 1.2) {
            float r = uOccRadius * clamp(t / L, 0.25, 1.0);
            float d = length(ap - dir * t);
            float fade = (1.0 - smoothstep(r * 0.55, r, d)) * smoothstep(L - 1.2, L - 3.5, t);
            // Dollhouse cut: on the camera side, everything well above the rickshaw
            // (upper floors, roofs, tanks) dissolves in a wider cone, so near-side
            // buildings drop to their ground floor instead of hiding the street.
            float wide = r * 2.6;
            float above = smoothstep(uOccTarget.y + 2.4, uOccTarget.y + 4.2, vOccWorld.y);
            // ...but only on the camera's side of the rickshaw, never beyond it
            float hFrag = length(vOccWorld.xz - uOccCam.xz);
            float hTarget = length(uOccTarget.xz - uOccCam.xz);
            above *= smoothstep(hTarget - 0.5, hTarget - 3.0, hFrag);
            fade = max(fade, above * (1.0 - smoothstep(wide * 0.6, wide, d)));
            // and anything right under the camera
            fade = max(fade, 1.0 - smoothstep(L * 0.22, L * 0.36, t));
            if (fade > occBayer(gl_FragCoord.xy)) discard;
          }
        }`,
      );
  };
  material.customProgramCacheKey = () => 'occlusion-v4';
  return material;
}
