import * as THREE from 'three';
import { palette } from './palette';

/**
 * Gradient sky dome with a soft sun glow, centred on the camera every frame.
 * The horizon colour equals the fog colour so distant geometry melts into it.
 */
export class Sky {
  readonly mesh: THREE.Mesh;
  private readonly material: THREE.ShaderMaterial;

  constructor(scene: THREE.Scene, sunDirection: THREE.Vector3) {
    this.material = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTop: { value: new THREE.Color(palette.skyTop) },
        uMid: { value: new THREE.Color(palette.skyHorizon) },
        uHorizon: { value: new THREE.Color(palette.fog) },
        uGlow: { value: new THREE.Color(palette.skyGlow) },
        uSunDir: { value: sunDirection },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = p.xyww; // pinned to the far plane
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uTop, uMid, uHorizon, uGlow, uSunDir;
        varying vec3 vDir;
        void main() {
          float h = clamp(vDir.y, -0.2, 1.0);
          vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.16, h));
          col = mix(col, uTop, smoothstep(0.14, 0.7, h));
          float s = max(dot(normalize(vDir), normalize(uSunDir)), 0.0);
          col += uGlow * (pow(s, 6.0) * 0.45 + pow(s, 60.0) * 0.6);
          col += vec3(1.0, 0.93, 0.8) * smoothstep(0.9993, 0.9997, s) * 1.6; // sun disc
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
