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

// ── Cutaway: anything between the camera and the rickshaw gets out of the way ──

/**
 * Two cutaway modes, both dithered (no transparency sorting, shadows untouched):
 *
 * - Tagged occluders (buildings, with an `occId` vertex/instance attribute) are
 *   decided per building on the CPU (`updateOcclusion`): a building that sits in
 *   front of the rickshaw and covers the middle of the frame fades out as a
 *   whole over ~0.2 s, down to a low plinth that keeps its footprint readable.
 * - Untagged small things (trees, bunting, stall parts) use a narrow cone from
 *   the camera to the rickshaw with a crisp edge, plus a near-camera fade.
 */
const MAX_OCCLUDERS = 512;
const occFade = new Uint8Array(MAX_OCCLUDERS);
const occTexture = new THREE.DataTexture(occFade, MAX_OCCLUDERS, 1, THREE.RedFormat, THREE.UnsignedByteType);
occTexture.needsUpdate = true;

export const occlusion = {
  uOccCam: { value: new THREE.Vector3() },
  uOccTarget: { value: new THREE.Vector3() },
  uOccRadius: { value: 3.6 },
  uOccFade: { value: occTexture as THREE.Texture },
  /** Cutaway tuning (#debug → Look). */
  settings: { enabled: true, zoneX: 0.42, zoneTop: 0.32, fadeSeconds: 0.22, plinth: 0.2 },
};

/** An oriented box that can hide itself (building footprint + height). */
export interface Occluder {
  x: number;
  z: number;
  /** half extents in the box's local frame */
  hw: number;
  hd: number;
  height: number;
  yaw: number;
}

const occluders: { box: Occluder; corners: THREE.Vector3[]; fade: number }[] = [];
const tmpV = new THREE.Vector3();
const tmpTarget = new THREE.Vector3();
const camDir = new THREE.Vector3();

/** The id the next addOccluder() call will return (tag geometry before you know the box). */
export function nextOccluderId(): number {
  return occluders.length < MAX_OCCLUDERS ? occluders.length + 1 : 0;
}

/** Register an occluder; returns its id for the `occId` attribute (1-based, 0 = none). */
export function addOccluder(box: Occluder): number {
  if (occluders.length >= MAX_OCCLUDERS) return 0;
  const c = Math.cos(box.yaw);
  const s = Math.sin(box.yaw);
  const corners: THREE.Vector3[] = [];
  for (const y of [0, box.height])
    for (const [lx, lz] of [
      [-box.hw, -box.hd],
      [box.hw, -box.hd],
      [box.hw, box.hd],
      [-box.hw, box.hd],
    ] as const)
      corners.push(new THREE.Vector3(box.x + lx * c + lz * s, y, box.z - lx * s + lz * c));
  occluders.push({ box, corners, fade: 0 });
  return occluders.length;
}

/** Drop all occluders (world teardown). */
export function clearOccluders(): void {
  occluders.length = 0;
  occFade.fill(0);
  occTexture.needsUpdate = true;
}

/**
 * Per frame: decide which buildings stand between the camera and the rickshaw
 * (in front of it in depth, overlapping the "hero zone" on screen: the column
 * from the rickshaw down to the bottom edge) and ease each one's fade.
 */
export function updateOcclusion(camera: THREE.PerspectiveCamera, target: THREE.Vector3, delta: number): void {
  occlusion.uOccCam.value.copy(camera.position);
  occlusion.uOccTarget.value.copy(target);
  const set = occlusion.settings;
  camera.getWorldDirection(camDir);
  const targetDepth = tmpV.copy(target).sub(camera.position).dot(camDir);
  tmpTarget.copy(target).project(camera);
  const zx0 = tmpTarget.x - set.zoneX;
  const zx1 = tmpTarget.x + set.zoneX;
  const zy1 = tmpTarget.y + set.zoneTop;
  // Linear, so a fade is over in exactly `fadeSeconds` (no long dithered tail).
  const step = delta / Math.max(0.01, set.fadeSeconds);
  let changed = false;
  for (let i = 0; i < occluders.length; i++) {
    const o = occluders[i]!;
    let want = 0;
    if (set.enabled) {
      let minDepth = Infinity;
      let x0 = Infinity;
      let x1 = -Infinity;
      let y0 = Infinity;
      let y1 = -Infinity;
      let behindCam = false;
      for (const c of o.corners) {
        const depth = tmpV.copy(c).sub(camera.position).dot(camDir);
        minDepth = Math.min(minDepth, depth);
        if (depth < camera.near) {
          behindCam = true;
          continue;
        }
        tmpV.copy(c).project(camera);
        x0 = Math.min(x0, tmpV.x);
        x1 = Math.max(x1, tmpV.x);
        y0 = Math.min(y0, tmpV.y);
        y1 = Math.max(y1, tmpV.y);
      }
      // In front of the rickshaw, and on screen over the column between it and the bottom edge.
      if (minDepth < targetDepth - 1.5) {
        if (behindCam) want = x1 > zx0 && x0 < zx1 ? 1 : 0;
        else want = x1 > zx0 && x0 < zx1 && y0 < zy1 && y1 > -1.05 ? 1 : 0;
      }
    }
    const next = want > o.fade ? Math.min(want, o.fade + step) : Math.max(want, o.fade - step);
    if (next !== o.fade) {
      o.fade = next;
      const b = Math.round(next * 255);
      if (occFade[i] !== b) {
        occFade[i] = b;
        changed = true;
      }
    }
  }
  if (changed) occTexture.needsUpdate = true;
}

export function withOcclusion<T extends THREE.Material>(material: T): T {
  return addPatch(material, {
    name: 'occ5',
    apply: (shader) => {
      Object.assign(shader.uniforms, {
        uOccCam: occlusion.uOccCam,
        uOccTarget: occlusion.uOccTarget,
        uOccRadius: occlusion.uOccRadius,
        uOccFade: occlusion.uOccFade,
      });
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          attribute float occId;
          uniform sampler2D uOccFade;
          varying vec3 vOccWorld;
          flat varying float vOccFade;`,
        )
        .replace(
          '#include <project_vertex>',
          `#include <project_vertex>
          vec4 occW = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            occW = instanceMatrix * occW;
          #endif
          vOccWorld = (modelMatrix * occW).xyz;
          vOccFade = occId > 0.5 ? texelFetch(uOccFade, ivec2(int(occId + 0.5) - 1, 0), 0).r : -1.0;`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          varying vec3 vOccWorld;
          flat varying float vOccFade;
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
          if (vOccFade >= 0.0) {
            // Whole-building fade, decided on the CPU; a low plinth stays.
            if (vOccFade > occBayer(gl_FragCoord.xy) && vOccWorld.y > ${occlusion.settings.plinth.toFixed(2)}) discard;
          } else {
            vec3 ab = uOccTarget - uOccCam;
            float L = length(ab);
            vec3 dir = ab / L;
            vec3 ap = vOccWorld - uOccCam;
            float t = dot(ap, dir);
            if (t > 0.0 && t < L - 1.2) {
              float r = uOccRadius * clamp(t / L, 0.35, 1.0);
              float d = length(ap - dir * t);
              // crisp edge: almost all in or out, only a thin dithered rim
              float fade = (1.0 - smoothstep(r * 0.85, r, d)) * smoothstep(L - 1.2, L - 2.6, t);
              fade = max(fade, 1.0 - smoothstep(L * 0.25, L * 0.32, t));
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
