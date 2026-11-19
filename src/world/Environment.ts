import * as THREE from 'three';
import type { Debug } from '../core/Debug';
import { palette } from './palette';

/**
 * Golden-hour lighting:
 *  - one low, warm directional "sun" with a tight shadow frustum (so shadows stay crisp)
 *  - a warm hemisphere fill so shadows read terracotta, not black
 *  - a gradient sky + matching fog for depth
 */
export class Environment {
  readonly sun = new THREE.DirectionalLight(palette.sun, 2.6);
  readonly hemi = new THREE.HemisphereLight(palette.hemiSky, palette.hemiGround, 1.9);
  private readonly sky: THREE.CanvasTexture;
  /** Sun direction relative to its target. The shadow box follows the target (the rickshaw, later). */
  private readonly sunOffset = new THREE.Vector3(-18, 14, 10);

  constructor(
    private readonly scene: THREE.Scene,
    debug: Debug,
  ) {
    this.sky = this.makeSky();
    scene.background = this.sky;
    scene.fog = new THREE.Fog(palette.fog, 35, 110);

    const s = this.sun;
    s.castShadow = true;
    s.shadow.mapSize.set(2048, 2048);
    s.shadow.bias = -0.0004;
    s.shadow.normalBias = 0.03;
    s.shadow.radius = 4; // soft PCF edges
    const cam = s.shadow.camera;
    cam.left = -16;
    cam.right = 16;
    cam.top = 16;
    cam.bottom = -16;
    cam.near = 1;
    cam.far = 60;
    cam.updateProjectionMatrix();
    s.position.copy(this.sunOffset);
    scene.add(s, s.target, this.hemi);

    this.addDebug(debug);
  }

  /** Keep the shadow frustum centred on what matters (called every frame, no allocations). */
  follow(target: THREE.Vector3): void {
    this.sun.target.position.copy(target);
    this.sun.position.copy(target).add(this.sunOffset);
  }

  private makeSky(): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = 2;
    c.height = 256;
    const g = c.getContext('2d')!;
    const grad = g.createLinearGradient(0, 0, 0, 256);
    const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
    grad.addColorStop(0, hex(palette.skyTop));
    grad.addColorStop(0.55, hex(palette.skyHorizon));
    grad.addColorStop(0.78, hex(palette.skyGlow));
    grad.addColorStop(1, hex(palette.fog));
    g.fillStyle = grad;
    g.fillRect(0, 0, 2, 256);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
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
    f.add(fog, 'far', 10, 200, 0.5).name('fog far');
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
