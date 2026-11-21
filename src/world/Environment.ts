import * as THREE from 'three';
import type { Debug } from '../core/Debug';
import type { Mood } from './Mood';
import { Sky } from './Sky';

/** Golden-hour and dusk values for everything the light touches. */
const LOOK = {
  sun: [0xffc48a, 0xff8f62],
  sunIntensity: [4.6, 1.2],
  hemiSky: [0xbcc6dc, 0x5b6aa6],
  hemiGround: [0xcf9160, 0x6d4660],
  hemiIntensity: [0.85, 1.0],
  fog: [0xe4ab80, 0x8c6c88],
  /** distance fog near/far: golden hour sees far, dusk closes in */
  fogNear: [80, 40],
  fogFar: [230, 125],
  skyTop: [0x6f92bd, 0x2a3765],
  skyMid: [0xf4c08c, 0xd98a72],
  skyGlow: [0xffa260, 0xff6f4a],
  cloudLit: [0xffe1bd, 0xffa98a],
  cloudShade: [0xb89aa8, 0x5e4b6e],
  exposure: [1.08, 1.05],
} as const;

/**
 * Light rig: one low, warm sun from the south-west (over the sea) with long,
 * soft shadows whose box follows the camera focus (snapped to shadow texels in
 * light space, so edges never shimmer); a cool sky fill so shadows read blue
 * and a warm ground bounce; sky dome + matching fog. Blends toward dusk.
 */
export class Environment {
  readonly sun = new THREE.DirectionalLight(LOOK.sun[0], LOOK.sunIntensity[0]);
  readonly hemi = new THREE.HemisphereLight(LOOK.hemiSky[0], LOOK.hemiGround[0], LOOK.hemiIntensity[0]);
  /** Unit vector toward the sun; shared by the sky and sea shaders. */
  readonly sunDirection = new THREE.Vector3();
  readonly sky: Sky;
  /** Toward the sun. Elevation ≈ 18°: long golden-hour shadows, still lighting the street. */
  private readonly sunOffset = new THREE.Vector3(-34, 13.2, 23);
  private readonly lightDistance = 60;
  private readonly tmp = new THREE.Vector3();
  private readonly lightRot = new THREE.Matrix4();
  private readonly lightRotInv = new THREE.Matrix4();
  private readonly c = new THREE.Color();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly renderer: THREE.WebGLRenderer,
    debug: Debug,
  ) {
    scene.background = new THREE.Color(LOOK.fog[0]);
    scene.fog = new THREE.Fog(LOOK.fog[0], 40, 125);
    this.sunDirection.copy(this.sunOffset).normalize();
    this.sky = new Sky(scene, this.sunDirection);

    const s = this.sun;
    s.castShadow = true;
    s.shadow.mapSize.set(2048, 2048);
    s.shadow.bias = -0.0004;
    s.shadow.normalBias = 0.05;
    s.shadow.radius = 4;
    const cam = s.shadow.camera;
    cam.left = -32;
    cam.right = 32;
    cam.top = 32;
    cam.bottom = -32;
    cam.near = 5;
    cam.far = 130;
    cam.updateProjectionMatrix();
    scene.add(s, s.target, this.hemi);
    this.updateLightBasis();
    this.addDebug(debug);
  }

  /** Re-tint everything for a dusk level (0 golden hour … 1 dusk). */
  bindMood(mood: Mood): void {
    mood.on((t) => {
      const lerp = (pair: readonly [number, number], out: THREE.Color) => out.set(pair[0]).lerp(this.c.set(pair[1]), t);
      lerp(LOOK.sun, this.sun.color);
      this.sun.intensity = THREE.MathUtils.lerp(LOOK.sunIntensity[0], LOOK.sunIntensity[1], t);
      lerp(LOOK.hemiSky, this.hemi.color);
      lerp(LOOK.hemiGround, this.hemi.groundColor);
      this.hemi.intensity = THREE.MathUtils.lerp(LOOK.hemiIntensity[0], LOOK.hemiIntensity[1], t);
      const fog = this.scene.fog as THREE.Fog;
      lerp(LOOK.fog, fog.color);
      fog.near = THREE.MathUtils.lerp(LOOK.fogNear[0], LOOK.fogNear[1], t);
      fog.far = THREE.MathUtils.lerp(LOOK.fogFar[0], LOOK.fogFar[1], t);
      (this.scene.background as THREE.Color).copy(fog.color);
      const u = this.sky.uniforms;
      lerp(LOOK.skyTop, u.uTop!.value);
      lerp(LOOK.skyMid, u.uMid!.value);
      (u.uHorizon!.value as THREE.Color).copy(fog.color);
      lerp(LOOK.skyGlow, u.uGlow!.value);
      lerp(LOOK.cloudLit, u.uCloudLit!.value);
      lerp(LOOK.cloudShade, u.uCloudShade!.value);
      this.renderer.toneMappingExposure = THREE.MathUtils.lerp(LOOK.exposure[0], LOOK.exposure[1], t);
    });
  }

  setShadowMapSize(size: number): void {
    if (this.sun.shadow.mapSize.x === size) return;
    this.sun.shadow.mapSize.set(size, size);
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null;
  }

  private updateLightBasis(): void {
    this.sunDirection.copy(this.sunOffset).normalize();
    this.lightRot.lookAt(this.sunDirection, new THREE.Vector3(), new THREE.Vector3(0, 1, 0));
    this.lightRotInv.copy(this.lightRot).invert();
  }

  /** Keep the shadow frustum centred on the focus (called every frame, no allocations). */
  follow(target: THREE.Vector3, camera: THREE.Vector3): void {
    // Snap the focus to whole shadow texels *in light space*: no edge shimmer while driving.
    const texel = (this.sun.shadow.camera.right * 2) / this.sun.shadow.mapSize.x;
    this.tmp.set(target.x, 0, target.z).applyMatrix4(this.lightRotInv);
    this.tmp.x = Math.round(this.tmp.x / texel) * texel;
    this.tmp.y = Math.round(this.tmp.y / texel) * texel;
    this.tmp.applyMatrix4(this.lightRot);
    this.sun.target.position.copy(this.tmp);
    this.sun.position.copy(this.tmp).addScaledVector(this.sunDirection, this.lightDistance);
    this.sky.follow(camera);
  }

  private addDebug(debug: Debug): void {
    const f = debug.folder('Environment');
    if (!f) return;
    f.add(this.sun, 'intensity', 0, 8, 0.01).name('sun intensity');
    f.addColor(this.sun, 'color').name('sun colour');
    f.add(this.hemi, 'intensity', 0, 4, 0.01).name('fill intensity');
    for (const [k, lo, hi, n] of [
      ['x', -40, 40, 'sun x'],
      ['y', 2, 40, 'sun height'],
      ['z', -40, 40, 'sun z'],
    ] as const)
      f.add(this.sunOffset, k, lo, hi, 0.1)
        .name(n)
        .onChange(() => this.updateLightBasis());
    f.add(this.sun.shadow, 'radius', 0, 10, 0.1).name('shadow softness');
    f.add(this.sun.shadow, 'normalBias', 0, 0.2, 0.001).name('shadow normal bias');
    const fog = this.scene.fog as THREE.Fog;
    f.add(fog, 'near', 0, 100, 0.5).name('fog near');
    f.add(fog, 'far', 10, 250, 0.5).name('fog far');
    const helper = new THREE.CameraHelper(this.sun.shadow.camera);
    helper.visible = false;
    this.scene.add(helper);
    f.add(helper, 'visible').name('shadow frustum');
  }

  dispose(): void {
    this.sky.dispose();
    this.sun.shadow.map?.dispose();
    this.scene.remove(this.sun, this.sun.target, this.hemi);
  }
}

