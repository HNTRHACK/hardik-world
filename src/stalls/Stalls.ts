import * as THREE from 'three';
import type { Physics } from '../physics/Physics';
import type { Plot } from '../world/layout';
import type { Rickshaw } from '../vehicle/Rickshaw';
import type { ProjectPanel } from '../ui/ProjectPanel';
import type { StallModel } from './StallModels';
import { PLACES, type Place } from './places';
import { ICONS } from './icons';

/** Ring speed cap (m/s) and how long you must be inside before the panel opens. */
const RING_LIMIT = 3.0;
const DWELL = 0.25;
const CLOSE_MARGIN = 2.5;
const LABEL_FAR = 95;

export interface Stall {
  place: Place;
  plot: Plot;
  model: StallModel;
  ring: THREE.Mesh;
  ringMat: THREE.ShaderMaterial;
  glow: number;
  dwell: number;
  inside: boolean;
  /** Closed by the player while inside: don't reopen until they leave. */
  dismissed: boolean;
  anchor: THREE.Vector3;
  label: HTMLButtonElement;
}

/**
 * Every place on the lane (six project stalls + About / Contact / Wins):
 * models on their plots, colliders, a glowing ground ring each, a floating
 * label (a real button), and the ring logic that slows the rickshaw and opens
 * the panel.
 */
export class Stalls {
  readonly stalls: Stall[] = [];
  /** While true (e.g. mid-teleport), rings don't open panels or cap speed. */
  suspended = false;
  private readonly ringGeo = new THREE.CircleGeometry(1, 64);
  private readonly labels: HTMLElement;
  /** Tapping a floating label: travel there (set by Experience). */
  onLabel: ((id: string) => void) | null = null;
  /** Bottom edge of the top bar (safe-area aware), measured on resize, not per frame. */
  private barBottom = 58;
  private readonly measureBar = () => {
    const r = document.querySelector('.corner')?.getBoundingClientRect();
    if (r && r.height) this.barBottom = r.bottom + 6;
  };
  private readonly v = new THREE.Vector3();

  constructor(
    scene: THREE.Scene,
    physics: Physics,
    plots: Plot[],
    private readonly panel: ProjectPanel,
  ) {
    this.ringGeo.rotateX(-Math.PI / 2);
    this.labels = document.querySelector<HTMLElement>('[data-labels]')!;
    this.measureBar();
    window.addEventListener('resize', this.measureBar);
    void document.fonts.ready.then(this.measureBar);
    for (const place of PLACES) {
      const plot = plots.find((p) => p.id === place.plot);
      if (!plot) continue;
      const model = place.build();
      model.root.position.set(plot.x, 0, plot.z);
      model.root.rotation.y = plot.yaw;
      scene.add(model.root);
      model.root.updateMatrixWorld(true);
      const c = Math.cos(plot.yaw);
      const s = Math.sin(plot.yaw);
      for (const b of model.colliders) {
        physics.world.createCollider(
          physics.R.ColliderDesc.cuboid(b.hx, b.hy, b.hz)
            .setTranslation(plot.x + b.x * c + b.z * s, b.hy, plot.z - b.x * s + b.z * c)
            .setRotation({ x: 0, y: Math.sin(plot.yaw / 2), z: 0, w: Math.cos(plot.yaw / 2) }),
        );
      }
      const ringMat = this.ringMaterial();
      const ring = new THREE.Mesh(this.ringGeo, ringMat);
      ring.position.set(plot.ring.x, 0.19, plot.ring.z);
      ring.scale.setScalar(plot.ring.r);
      ring.renderOrder = 2;
      scene.add(ring);
      const anchor = new THREE.Vector3(plot.x, model.labelHeight + 0.6, plot.z);
      const label = this.makeLabel(place);
      this.stalls.push({ place, plot, model, ring, ringMat, glow: 0.3, dwell: 0, inside: false, dismissed: false, anchor, label });
    }
    panel.onClose = (entry, by) => {
      const st = this.get(entry.id);
      if (st && by === 'user') st.dismissed = st.inside;
    };
  }

  get(id: string): Stall | undefined {
    return this.stalls.find((s) => s.place.id === id);
  }

  private makeLabel(p: Place): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'stall-label';
    b.setAttribute('aria-label', `${p.short}, ${p.kind}. Open`);
    b.innerHTML = `<span class="stall-label__icon">${ICONS[p.id] ?? ''}</span><span class="stall-label__text"><span class="stall-label__name">${p.short}</span><span class="stall-label__kind">${p.kind}</span></span>`;
    b.addEventListener('click', () => (this.onLabel ? this.onLabel(p.id) : this.panel.open(p.entry, 'label')));
    this.labels.append(b);
    return b;
  }

  private ringMaterial(): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uGlow: { value: 0.3 }, uColor: { value: new THREE.Color(0xffb35c) } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uTime, uGlow;
        uniform vec3 uColor;
        varying vec2 vUv;
        void main() {
          float r = length(vUv);
          float a = atan(vUv.y, vUv.x);
          float edge = smoothstep(0.84, 0.92, r) * (1.0 - smoothstep(0.96, 1.0, r));
          float dashes = step(0.5, fract(a * 6.0 / 3.14159 + uTime * 0.12));
          float inner = smoothstep(0.9, 0.2, r) * 0.18;
          float ticks = smoothstep(0.7, 0.74, r) * (1.0 - smoothstep(0.76, 0.8, r)) * dashes;
          float alpha = (edge * (0.55 + 0.45 * uGlow) + ticks * 0.6 * uGlow + inner * uGlow) * (0.35 + 0.65 * uGlow);
          gl_FragColor = vec4(uColor * (0.8 + uGlow), alpha);
        }`,
    });
  }

  /** Open a place's panel directly. */
  open(id: string, by: 'ring' | 'label' = 'label'): void {
    const st = this.get(id);
    if (!st) return;
    st.dismissed = false;
    this.panel.open(st.place.entry, by);
  }

  update(elapsed: number, delta: number, rickshaw: Rickshaw, camera: THREE.PerspectiveCamera, width: number, height: number): void {
    const pos = rickshaw.position;
    camera.updateMatrixWorld(); // labels must use this frame's camera, not last frame's
    let limit = Infinity;
    for (const st of this.stalls) {
      st.model.update(elapsed, delta);
      const d = Math.hypot(pos.x - st.plot.ring.x, pos.z - st.plot.ring.z);
      const r = st.plot.ring.r;
      const inside = d < r;
      // Entering only counts once a teleport has landed, so the postcard drop is seen.
      if (!this.suspended) {
        if (inside && !st.inside) st.model.onEnter?.(pos);
        st.inside = inside;
      }
      if (!this.suspended) {
        if (inside) {
          limit = RING_LIMIT;
          st.dwell += delta;
          if (st.dwell > DWELL && !st.dismissed && this.panel.current?.id !== st.place.id) this.panel.open(st.place.entry, 'ring');
        } else {
          st.dwell = 0;
          // Approach zone: the cap ramps down as you near the ring, so you arrive slow.
          if (d < r + 9) limit = Math.min(limit, RING_LIMIT + (d - r) * 1.3);
          if (d > r + CLOSE_MARGIN) {
            st.dismissed = false;
            if (this.panel.current?.id === st.place.id && this.panel.openedBy === 'ring') this.panel.close('away');
          }
        }
      }
      const target = inside ? 1 : d < r + 12 ? 0.55 : 0.28;
      st.glow += (target - st.glow) * (1 - Math.exp(-6 * delta));
      st.ringMat.uniforms.uGlow!.value = st.glow;
      st.ringMat.uniforms.uTime!.value = elapsed;
      this.placeLabel(st, camera, width, height);
    }
    rickshaw.physics.speedLimit = limit;
  }

  private placeLabel(st: Stall, camera: THREE.PerspectiveCamera, w: number, h: number): void {
    const dist = camera.position.distanceTo(st.anchor);
    this.v.copy(st.anchor).project(camera);
    const onScreen = this.v.z < 1 && Math.abs(this.v.x) < 1.1 && Math.abs(this.v.y) < 1.1 && dist < LABEL_FAR;
    const el = st.label;
    if (!onScreen) {
      if (!el.classList.contains('is-hidden')) el.classList.add('is-hidden');
      return;
    }
    el.classList.remove('is-hidden');
    const x = ((this.v.x + 1) / 2) * w;
    const y = ((1 - this.v.y) / 2) * h;
    const scale = THREE.MathUtils.clamp(34 / dist, 0.72, 1.05);
    // Fade out before the label slides under the top bar (Projects, sound, Classic site).
    const top = y - 48 * scale;
    const fade = (1 - THREE.MathUtils.smoothstep(dist, LABEL_FAR - 25, LABEL_FAR)) * THREE.MathUtils.smoothstep(top, this.barBottom, this.barBottom + 38);
    if (fade < 0.04) {
      if (!el.classList.contains('is-hidden')) el.classList.add('is-hidden');
      return;
    }
    el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -100%) scale(${scale.toFixed(3)})`;
    el.style.opacity = fade.toFixed(2);
    el.classList.toggle('is-active', this.panel.current?.id === st.place.id);
  }

  dispose(): void {
    window.removeEventListener('resize', this.measureBar);
    for (const st of this.stalls) {
      st.model.root.removeFromParent();
      st.model.dispose();
      st.ring.removeFromParent();
      st.ringMat.dispose();
      st.label.remove();
    }
    this.ringGeo.dispose();
  }
}
