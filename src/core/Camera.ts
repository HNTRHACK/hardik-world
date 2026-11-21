import * as THREE from 'three';
import gsap from 'gsap';
import type { Sizes } from './Sizes';
import type { Debug } from './Debug';

/**
 * Follow camera on a high three-quarter "diorama" angle. It leads the rickshaw
 * a little in the direction of travel and pulls back slightly at speed.
 *
 * Players can take over: drag to orbit, scroll / pinch to zoom (pitch and zoom
 * are clamped). After ~3 s without input it eases back to the follow angle.
 * Under #debug, "free orbit" swaps in OrbitControls.
 */
export class Camera {
  readonly instance: THREE.PerspectiveCamera;
  /** Point the camera looks at (damped). */
  readonly target = new THREE.Vector3(0, 0.8, 0);
  /** The default follow offset from the target. */
  readonly offset = new THREE.Vector3(9.4, 13.2, 12.6); // ≈40° down, 21 m: the rickshaw is the hero
  readonly tuning = { lookAhead: 0.45, follow: 4.5, zoomAtSpeed: 0.2, idleReturn: 3, returnRate: 2.2 };
  /** Clamp for player pitch (radians above the horizon). */
  static readonly PITCH = { min: THREE.MathUtils.degToRad(22), max: THREE.MathUtils.degToRad(72) };
  static readonly ZOOM = { min: 0.55, max: 1.6 };

  /** Portrait screens pull the camera back so the lane keeps the same horizontal coverage. */
  private distanceScale = 1;
  private speedZoom = 1;
  private readonly base: { yaw: number; pitch: number; dist: number };
  /** Player-controlled view (absolute yaw/pitch, zoom multiplier). */
  private readonly view = { yaw: 0, pitch: 0, zoom: 1 };
  private idle = Infinity;
  /** An in-progress fly-to (projects menu / minimap teleports). */
  private flight: { from: THREE.Vector3; to: THREE.Vector3; t: number; tween: gsap.core.Tween } | null = null;
  private flightZoom = 1;
  /** Screen-space framing shift (px), eased: keeps the subject clear of an open panel. */
  private readonly shift = { x: 0, y: 0, gx: 0, gy: 0 };
  private readonly goal = new THREE.Vector3();
  private orbit: (THREE.EventDispatcher & { enabled: boolean; target: THREE.Vector3; update(): void; dispose(): void }) | null = null;
  private readonly off: () => void;
  private detachInput: (() => void) | null = null;

  constructor(
    private readonly sizes: Sizes,
    private readonly debug: Debug,
  ) {
    this.instance = new THREE.PerspectiveCamera(35, sizes.aspect, 0.3, 400);
    const o = this.offset;
    this.base = { yaw: Math.atan2(o.x, o.z), pitch: Math.atan2(o.y, Math.hypot(o.x, o.z)), dist: o.length() };
    this.view.yaw = this.base.yaw;
    this.view.pitch = this.base.pitch;
    this.fit();
    this.off = sizes.on('resize', () => this.fit());
  }

  /** True while the player is steering the view (or it hasn't eased back yet). */
  get userControlled(): boolean {
    return this.idle < this.tuning.idleReturn;
  }

  /** Drag-to-orbit and scroll/pinch-to-zoom on the canvas. */
  enableUserControl(dom: HTMLElement): void {
    const pointers = new Map<number, { x: number; y: number }>();
    let pinch = 0;
    const touch = () => (this.idle = 0);
    const down = (e: PointerEvent) => {
      if (this.orbit?.enabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
      dom.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) pinch = this.pinchDistance(pointers);
    };
    const move = (e: PointerEvent) => {
      const p = pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      if (pointers.size === 1) {
        this.view.yaw -= dx * 0.006;
        this.view.pitch = THREE.MathUtils.clamp(this.view.pitch + dy * 0.004, Camera.PITCH.min, Camera.PITCH.max);
      } else if (pointers.size === 2) {
        const d = this.pinchDistance(pointers);
        if (pinch > 0) this.zoomBy(pinch / d);
        pinch = d;
      }
      touch();
    };
    const up = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      pinch = pointers.size === 2 ? this.pinchDistance(pointers) : 0;
    };
    const wheel = (e: WheelEvent) => {
      if (this.orbit?.enabled) return;
      e.preventDefault();
      this.zoomBy(Math.exp(e.deltaY * 0.0012));
      touch();
    };
    dom.addEventListener('pointerdown', down);
    dom.addEventListener('pointermove', move);
    dom.addEventListener('pointerup', up);
    dom.addEventListener('pointercancel', up);
    dom.addEventListener('wheel', wheel, { passive: false });
    this.detachInput = () => {
      dom.removeEventListener('pointerdown', down);
      dom.removeEventListener('pointermove', move);
      dom.removeEventListener('pointerup', up);
      dom.removeEventListener('pointercancel', up);
      dom.removeEventListener('wheel', wheel);
    };
  }

  private pinchDistance(p: Map<number, { x: number; y: number }>): number {
    const [a, b] = [...p.values()];
    return Math.hypot(a!.x - b!.x, a!.y - b!.y) || 1;
  }

  private zoomBy(f: number): void {
    this.view.zoom = THREE.MathUtils.clamp(this.view.zoom * f, Camera.ZOOM.min, Camera.ZOOM.max);
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
    f?.add(this.tuning, 'idleReturn', 0.5, 10, 0.1).name('return after (s)');
  }

  /** Move the framing so the scene centre sits `x` px left / `y` px up (0, 0 = centred). */
  setFrameShift(x: number, y: number): void {
    this.shift.gx = x;
    this.shift.gy = y;
  }

  private applyShift(delta: number): void {
    const s = this.shift;
    const k = 1 - Math.exp(-5 * delta);
    s.x += (s.gx - s.x) * k;
    s.y += (s.gy - s.y) * k;
    const w = this.sizes.width;
    const h = this.sizes.height;
    if (Math.abs(s.x) < 0.5 && Math.abs(s.y) < 0.5 && s.gx === 0 && s.gy === 0) {
      if (this.instance.view?.enabled) this.instance.clearViewOffset();
      return;
    }
    this.instance.setViewOffset(w, h, s.x, s.y, w, h);
  }

  get flying(): boolean {
    return this.flight !== null;
  }

  /**
   * Glide the view to a new focus: eased, pulling back a little mid-flight so you
   * see where you're going, and settling on the default follow angle.
   */
  flyTo(focus: THREE.Vector3, duration = 1.5): Promise<void> {
    this.flight?.tween.kill();
    this.idle = Infinity; // let the player's orbit ease back while we travel
    const from = this.target.clone();
    const to = focus.clone();
    to.y += 0.4;
    return new Promise((resolve) => {
      const f = { from, to, t: 0, tween: null as unknown as gsap.core.Tween };
      f.tween = gsap.to(f, {
        t: 1,
        duration,
        ease: 'power2.inOut',
        onComplete: () => {
          this.flight = null;
          this.flightZoom = 1;
          resolve();
        },
      });
      this.flight = f;
    });
  }

  /** Snap straight to a focus point (spawn, teleport). */
  jump(focus: THREE.Vector3): void {
    this.target.copy(focus);
    this.target.y += 0.4;
    this.place();
  }

  /** Ease toward `focus`, leading along `velocity`. Frame-rate independent. */
  follow(focus: THREE.Vector3, velocity: THREE.Vector3, delta: number): void {
    if (this.flight) {
      const f = this.flight;
      this.target.lerpVectors(f.from, f.to, f.t);
      this.flightZoom = 1 + Math.sin(f.t * Math.PI) * 0.5;
      return;
    }
    const t = this.tuning;
    this.goal.copy(focus).addScaledVector(velocity, t.lookAhead);
    // Ignore vertical bounce from the suspension: the street is flat.
    this.goal.y = focus.y + 0.4;
    this.target.lerp(this.goal, 1 - Math.exp(-t.follow * delta));
    const speed = Math.hypot(velocity.x, velocity.z);
    const zoomGoal = 1 + Math.min(speed / 22, 1) * t.zoomAtSpeed;
    this.speedZoom += (zoomGoal - this.speedZoom) * (1 - Math.exp(-1.5 * delta));
  }

  private fit(): void {
    this.instance.aspect = this.sizes.aspect;
    this.instance.updateProjectionMatrix();
    this.distanceScale = THREE.MathUtils.clamp(1.25 / this.sizes.aspect, 1, 2.1);
    this.place();
  }

  private place(): void {
    if (this.orbit?.enabled) return;
    const v = this.view;
    const dist = this.base.dist * this.distanceScale * this.speedZoom * v.zoom * this.flightZoom;
    const c = Math.cos(v.pitch);
    this.instance.position.set(
      this.target.x + Math.sin(v.yaw) * c * dist,
      this.target.y + Math.sin(v.pitch) * dist,
      this.target.z + Math.cos(v.yaw) * c * dist,
    );
    this.instance.lookAt(this.target);
  }

  update(delta: number): void {
    this.applyShift(delta);
    if (this.orbit?.enabled) {
      this.orbit.update();
      return;
    }
    // Ease back to the follow angle once the player lets go for a while.
    this.idle += delta;
    if (this.idle > this.tuning.idleReturn) {
      const k = 1 - Math.exp(-this.tuning.returnRate * delta);
      const v = this.view;
      // shortest way round
      let dy = this.base.yaw - v.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      v.yaw += dy * k;
      v.pitch += (this.base.pitch - v.pitch) * k;
      v.zoom += (1 - v.zoom) * k;
    }
    this.place();
  }

  dispose(): void {
    this.flight?.tween.kill();
    this.off();
    this.detachInput?.();
    this.orbit?.dispose();
  }
}
