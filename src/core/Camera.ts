import * as THREE from 'three';
import type { Sizes } from './Sizes';
import type { Debug } from './Debug';

/**
 * Follow camera on a fixed high three-quarter "diorama" angle (it never swings
 * behind the vehicle, so the street always reads the same way). It leads the
 * rickshaw a little in the direction of travel and pulls back slightly at speed.
 * Under #debug, "free orbit" swaps in OrbitControls.
 */
export class Camera {
  readonly instance: THREE.PerspectiveCamera;
  /** Point the camera looks at (damped). */
  readonly target = new THREE.Vector3(0, 0.8, 0);
  /** Offset from the target. */
  readonly offset = new THREE.Vector3(9.4, 5.8, 12.8);
  readonly tuning = { lookAhead: 0.45, follow: 4.5, zoomAtSpeed: 0.2 };
  /** Portrait screens pull the camera back so the lane keeps the same horizontal coverage. */
  private distanceScale = 1;
  private zoom = 1;
  private readonly goal = new THREE.Vector3();
  private readonly scaled = new THREE.Vector3();
  private orbit: (THREE.EventDispatcher & { enabled: boolean; target: THREE.Vector3; update(): void; dispose(): void }) | null = null;
  private readonly off: () => void;

  constructor(
    private readonly sizes: Sizes,
    private readonly debug: Debug,
  ) {
    this.instance = new THREE.PerspectiveCamera(35, sizes.aspect, 0.1, 220);
    this.fit();
    this.off = sizes.on('resize', () => this.fit());
  }

  /** Debug-only orbit controls (dynamically imported, never on normal visitors' critical path). */
  async enableDebugOrbit(dom: HTMLElement): Promise<void> {
    if (!this.debug.active) return;
    const { OrbitControls } = await import('three/addons/controls/OrbitControls.js');
    const controls = new OrbitControls(this.instance, dom);
    controls.enableDamping = true;
    controls.enabled = false;
    this.orbit = controls;
    const state = { freeOrbit: false };
    const f = this.debug.folder('Camera');
    f?.add(state, 'freeOrbit')
      .name('free orbit')
      .onChange((on: boolean) => {
        controls.enabled = on;
        if (on) controls.target.copy(this.target);
      });
    f?.add(this.instance, 'fov', 15, 75, 1).onChange(() => this.instance.updateProjectionMatrix());
    f?.add(this.tuning, 'lookAhead', 0, 1.5, 0.01);
    f?.add(this.tuning, 'follow', 0.5, 15, 0.1).name('follow stiffness');
    f?.add(this.tuning, 'zoomAtSpeed', 0, 0.6, 0.01);
  }

  /** Snap straight to a focus point (spawn, teleport). */
  jump(focus: THREE.Vector3): void {
    this.target.copy(focus);
    this.target.y += 0.4;
    this.place();
  }

  /** Ease toward `focus`, leading along `velocity`. Frame-rate independent. */
  follow(focus: THREE.Vector3, velocity: THREE.Vector3, delta: number): void {
    const t = this.tuning;
    this.goal.copy(focus).addScaledVector(velocity, t.lookAhead);
    // Ignore vertical bounce from the suspension: the street is flat.
    this.goal.y = focus.y + 0.4;
    const k = 1 - Math.exp(-t.follow * delta);
    this.target.lerp(this.goal, k);
    const speed = Math.hypot(velocity.x, velocity.z);
    const zoomGoal = 1 + Math.min(speed / 22, 1) * t.zoomAtSpeed;
    this.zoom += (zoomGoal - this.zoom) * (1 - Math.exp(-1.5 * delta));
  }

  private fit(): void {
    this.instance.aspect = this.sizes.aspect;
    this.instance.updateProjectionMatrix();
    this.distanceScale = THREE.MathUtils.clamp(1.25 / this.sizes.aspect, 1, 2.1);
    this.place();
  }

  private place(): void {
    if (this.orbit?.enabled) return;
    this.scaled.copy(this.offset).multiplyScalar(this.distanceScale * this.zoom);
    this.instance.position.copy(this.target).add(this.scaled);
    this.instance.lookAt(this.target);
  }

  update(): void {
    if (this.orbit?.enabled) this.orbit.update();
    else this.place();
  }

  dispose(): void {
    this.off();
    this.orbit?.dispose();
  }
}
