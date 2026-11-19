import * as THREE from 'three';
import type { Debug } from '../core/Debug';
import { palette } from './palette';
import { Sky } from './Sky';

/**
 * Golden-hour lighting:
 *  - one low, warm directional "sun" from the south-west (over the sea), whose
 *    shadow box follows the camera's focus so long shadows stay crisp
 *  - a warm hemisphere fill so shadows read terracotta, not black
 *  - a sky dome with a sun glow + matching fog for depth
 */
export class Environment {
  readonly sun = new THREE.DirectionalLight(palette.sun, 3.0);
  readonly hemi = new THREE.HemisphereLight(palette.hemiSky, palette.hemiGround, 1.6);
  /** Unit vector toward the sun; shared by the sky and sea shaders. */
  readonly sunDirection = new THREE.Vector3();
  readonly sky: Sky;
  /** Sun direction (scaled for the light position). Low elevation = long shadows. */
  private readonly sunOffset = new THREE.Vector3(-30, 17, 26);
  private readonly lightDistance = 55;
  private readonly tmp = new THREE.Vector3();

  constructor(
    private readonly scene: THREE.Scene,
    debug: Debug,
  ) {
    scene.background = new THREE.Color(palette.fog);
    scene.fog = new THREE.Fog(palette.fog, 40, 125);
    this.sunDirection.copy(this.sunOffset).normalize();
    this.sky = new Sky(scene, this.sunDirection);

    const s = this.sun;
    s.castShadow = true;
    s.shadow.mapSize.set(2048, 2048);
    s.shadow.bias = -0.0005;
    s.shadow.normalBias = 0.04;
    s.shadow.radius = 3;
    const cam = s.shadow.camera;
    cam.left = -30;
    cam.right = 30;
    cam.top = 30;
    cam.bottom = -30;
    cam.near = 5;
    cam.far = 110;
    cam.updateProjectionMatrix();
    scene.add(s, s.target, this.hemi);

    this.addDebug(debug);
  }

  /** Keep the shadow frustum centred on what matters (called every frame, no allocations). */
  follow(target: THREE.Vector3, camera: THREE.Vector3): void {
    this.sunDirection.copy(this.sunOffset).normalize();
    // Snap to shadow texels so edges don't shimmer as the focus moves.
    const texel = (this.sun.shadow.camera.right * 2) / this.sun.shadow.mapSize.x;
    this.tmp.set(Math.round(target.x / texel) * texel, 0, Math.round(target.z / texel) * texel);
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
    f.add(this.sunOffset, 'x', -40, 40, 0.1).name('sun x');
    f.add(this.sunOffset, 'y', 2, 40, 0.1).name('sun height');
    f.add(this.sunOffset, 'z', -40, 40, 0.1).name('sun z');
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
