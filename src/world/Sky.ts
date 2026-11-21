import * as THREE from 'three';
import { globals } from './geo/patches';
import { palette } from './palette';

/**
 * Gradient sky dome centred on the camera: a low sun with a soft halo, and a
 * layer of slowly drifting, sun-lit clouds. Colours are blended toward dusk by
 * the Mood controller. The horizon colour matches the fog.
 */
export class Sky {
  readonly mesh: THREE.Mesh;
  readonly uniforms: Record<string, THREE.IUniform>;
  private readonly material: THREE.ShaderMaterial;

  constructor(scene: THREE.Scene, sunDirection: THREE.Vector3) {
    this.uniforms = {
      uTop: { value: new THREE.Color(palette.skyTop) },
      uMid: { value: new THREE.Color(palette.skyHorizon) },
      uHorizon: { value: new THREE.Color(palette.fog) },
      uGlow: { value: new THREE.Color(palette.skyGlow) },
      uCloudLit: { value: new THREE.Color(0xffe1bd) },
      uCloudShade: { value: new THREE.Color(0xb89aa8) },
      uSunDir: { value: sunDirection },
      uTime: globals.uTime,
    };
    this.material = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = p.xyww; // pinned to the far plane
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uTop, uMid, uHorizon, uGlow, uCloudLit, uCloudShade, uSunDir;
        uniform float uTime;
        varying vec3 vDir;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
        }
        float fbm(vec2 p) {
          float v = 0.0, a = 0.5;
          for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; }
          return v;
        }
        void main() {
          vec3 d = normalize(vDir);
          float h = clamp(d.y, -0.2, 1.0);
          vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.14, h));
          col = mix(col, uTop, smoothstep(0.12, 0.65, h));
          vec3 L = normalize(uSunDir);
          float s = max(dot(d, L), 0.0);
          col += uGlow * (pow(s, 5.0) * 0.55 + pow(s, 48.0) * 0.7);
          col += vec3(1.0, 0.9, 0.72) * smoothstep(0.9990, 0.9996, s) * 3.0; // sun disc (blooms)
          // Clouds: a flat layer projected onto the dome, drifting slowly.
          if (d.y > 0.0) {
            vec2 uv = d.xz / (d.y + 0.18) * 1.6 + vec2(uTime * 0.012, uTime * 0.004);
            float c = smoothstep(0.52, 0.78, fbm(uv));
            c *= smoothstep(0.02, 0.12, d.y) * (1.0 - smoothstep(0.55, 0.9, d.y));
            float lit = pow(max(dot(normalize(vec3(d.x, 0.0, d.z)), normalize(vec3(L.x, 0.0, L.z))), 0.0), 2.0);
            vec3 cc = mix(uCloudShade, uCloudLit, 0.35 + 0.65 * lit) + uGlow * pow(s, 8.0) * 0.6;
            col = mix(col, cc, c * 0.85);
          }
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(180, 32, 16), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1;
    scene.add(this.mesh);
  }

  follow(camera: THREE.Vector3): void {
    this.mesh.position.copy(camera);
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
