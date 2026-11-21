import * as THREE from 'three';

/*
 * Small, composable shader patches for built-in materials. A material can carry
 * several (cutaway + wind + rim); they're applied in order in one onBeforeCompile.
 * All uniforms are shared objects updated once per frame.
 */

type Shader = THREE.WebGLProgramParametersWithUniforms;
type Patch = { name: string; apply: (s: Shader) => void };

/** Scene-wide values every patched shader can read. */
export const globals = {
  uTime: { value: 0 },
  /** 0 = golden hour, 1 = dusk (lamps on). */
  uDusk: { value: 0 },
  uWind: { value: new THREE.Vector2(0.8, 0.45) },
};

function addPatch<T extends THREE.Material>(material: T, patch: Patch): T {
  const list: Patch[] = (material.userData.patches ??= []);
  if (list.some((p) => p.name === patch.name)) return material;
  list.push(patch);
  material.onBeforeCompile = (shader) => list.forEach((p) => p.apply(shader));
  material.customProgramCacheKey = () => list.map((p) => p.name).join('+');
  return material;
}

// ── Cutaway: anything between the camera and the rickshaw dissolves ──

/**
 * "See-through" cutaway with an ordered dither (no transparency sorting, shadows
 * untouched). The cut is a cone with its apex at the camera, so the hole has a
 * constant size on screen, plus a dollhouse cut of upper floors on the near side.
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
  return addPatch(material, {
    name: 'occ4',
    apply: (shader) => {
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
              float wide = r * 2.6;
              float above = smoothstep(uOccTarget.y + 2.4, uOccTarget.y + 4.2, vOccWorld.y);
              float hFrag = length(vOccWorld.xz - uOccCam.xz);
              float hTarget = length(uOccTarget.xz - uOccCam.xz);
              above *= smoothstep(hTarget - 0.5, hTarget - 3.0, hFrag);
              fade = max(fade, above * (1.0 - smoothstep(wide * 0.6, wide, d)));
              fade = max(fade, 1.0 - smoothstep(L * 0.22, L * 0.36, t));
              if (fade > occBayer(gl_FragCoord.xy)) discard;
            }
          }`,
        );
    },
  });
}

// ── Wind: vertices with a `sway` attribute (0 = fixed … 1 = free) move in the breeze ──

export function withWind<T extends THREE.Material>(material: T, amount = 0.14): T {
  return addPatch(material, {
    name: `wind${amount}`,
    apply: (shader) => {
      shader.uniforms.uTime = globals.uTime;
      shader.uniforms.uWind = globals.uWind;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float sway;\nuniform float uTime;\nuniform vec2 uWind;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          {
            vec3 wp = position;
            float gust = 0.65 + 0.35 * sin(uTime * 0.7 + wp.x * 0.05);
            float w = sin(uTime * 2.6 + wp.x * 0.9 + wp.z * 0.7) * 0.7 + sin(uTime * 4.1 + wp.y * 2.0) * 0.3;
            transformed.xz += uWind * (w * gust * sway * ${amount.toFixed(3)});
            transformed.y += abs(w) * sway * ${(amount * 0.25).toFixed(3)};
          }`,
        );
    },
  });
}

// ── Rim light: a warm fresnel edge so stalls read clearly from the follow camera ──

export const rim = {
  uRimColor: { value: new THREE.Color(1.0, 0.72, 0.42) },
  uRimStrength: { value: 0.55 },
};

export function withRim<T extends THREE.Material>(material: T): T {
  return addPatch(material, {
    name: 'rim',
    apply: (shader) => {
      Object.assign(shader.uniforms, rim);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uRimColor;\nuniform float uRimStrength;')
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          {
            float f = 1.0 - saturate(dot(normal, normalize(vViewPosition)));
            totalEmissiveRadiance += uRimColor * pow(f, 2.6) * uRimStrength;
          }`,
        );
    },
  });
}
