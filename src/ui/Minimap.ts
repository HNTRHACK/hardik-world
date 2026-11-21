import { seaX, type RoadNet } from '../world/layout';
import type { Stall } from '../stalls/Stalls';
import { MAP_ICON } from '../stalls/icons';

const BOUNDS = { x0: -56, x1: 56, z0: -72, z1: 72 };
const KEY = 'lane.minimap';

/**
 * A small north-up map (bottom-left on desktop): roads and the sea drawn once,
 * then the place markers and the rickshaw every frame. Toggleable; the choice is
 * remembered in this browser. Clicking a marker flies there (the Projects menu
 * is the keyboard path to the same thing, so the canvas itself is aria-hidden).
 */
export class Minimap {
  private readonly root: HTMLElement;
  private readonly toggle: HTMLButtonElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly g: CanvasRenderingContext2D;
  private readonly base: HTMLCanvasElement;
  private readonly w: number;
  private readonly h: number;
  private readonly dpr = Math.min(window.devicePixelRatio, 2);
  onSelect: ((id: string) => void) | null = null;

  constructor(
    net: RoadNet,
    private readonly stalls: Stall[],
  ) {
    this.root = document.querySelector<HTMLElement>('[data-minimap]')!;
    const small = matchMedia('(max-width: 640px)').matches;
    this.w = small ? 112 : 150;
    this.h = Math.round((this.w * (BOUNDS.z1 - BOUNDS.z0)) / (BOUNDS.x1 - BOUNDS.x0));
    this.root.innerHTML = `
      <button class="minimap__toggle" type="button" aria-pressed="true" data-minimap-toggle>${MAP_ICON}<span class="visually-hidden">Map</span></button>
      <div class="minimap__frame"><canvas aria-hidden="true"></canvas></div>`;
    this.toggle = this.root.querySelector('[data-minimap-toggle]')!;
    this.canvas = this.root.querySelector('canvas')!;
    this.canvas.width = this.w * this.dpr;
    this.canvas.height = this.h * this.dpr;
    this.canvas.style.width = `${this.w}px`;
    this.canvas.style.height = `${this.h}px`;
    this.g = this.canvas.getContext('2d')!;
    this.base = this.drawBase(net);

    let visible = !small;
    try {
      const saved = localStorage.getItem(KEY);
      if (saved !== null) visible = saved === '1';
    } catch {
      /* storage unavailable: use the default */
    }
    this.setVisible(visible);
    this.toggle.addEventListener('click', () => {
      const v = !this.visible;
      this.setVisible(v);
      try {
        localStorage.setItem(KEY, v ? '1' : '0');
      } catch {
        /* ignore */
      }
    });
    this.canvas.addEventListener('click', (e) => this.pick(e));
  }

  private get visible(): boolean {
    return this.root.classList.contains('is-visible');
  }

  private setVisible(v: boolean): void {
    this.root.classList.toggle('is-visible', v);
    this.toggle.setAttribute('aria-pressed', String(v));
  }

  private px(x: number, z: number): [number, number] {
    return [((x - BOUNDS.x0) / (BOUNDS.x1 - BOUNDS.x0)) * this.w, ((z - BOUNDS.z0) / (BOUNDS.z1 - BOUNDS.z0)) * this.h];
  }

  private drawBase(net: RoadNet): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = this.canvas.width;
    c.height = this.canvas.height;
    const g = c.getContext('2d')!;
    g.scale(this.dpr, this.dpr);
    const s = this.w / (BOUNDS.x1 - BOUNDS.x0);
    g.fillStyle = '#efe6d4';
    g.fillRect(0, 0, this.w, this.h);
    // sea
    g.fillStyle = '#a9c9cc';
    g.beginPath();
    g.moveTo(0, 0);
    for (let z = BOUNDS.z0; z <= BOUNDS.z1; z += 2) g.lineTo(...this.px(seaX(z), z));
    g.lineTo(0, this.h);
    g.closePath();
    g.fill();
    // roads
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.strokeStyle = '#8b7d72';
    for (const r of net.roads) {
      g.lineWidth = Math.max(2, r.def.halfWidth * 2 * s);
      g.beginPath();
      r.samples.forEach((p, i) => (i ? g.lineTo(...this.px(p.x, p.z)) : g.moveTo(...this.px(p.x, p.z))));
      g.stroke();
    }
    return c;
  }

  update(x: number, z: number, yaw: number, activeId: string | null): void {
    if (!this.visible) return;
    const g = this.g;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(this.base, 0, 0);
    g.scale(this.dpr, this.dpr);
    for (const st of this.stalls) {
      const [px, py] = this.px(st.plot.ring.x, st.plot.ring.z);
      const active = st.place.id === activeId;
      g.beginPath();
      g.arc(px, py, active ? 5 : 3.6, 0, Math.PI * 2);
      g.fillStyle = active ? '#f2a33a' : st.place.group === 'Projects' ? '#1b1310' : '#f7f2e8';
      g.fill();
      g.lineWidth = 1.5;
      g.strokeStyle = '#1b1310';
      g.stroke();
    }
    // rickshaw: a small arrow, nose = heading (yaw 0 faces -Z = up)
    const [rx, ry] = this.px(x, z);
    g.save();
    g.translate(rx, ry);
    g.rotate(-yaw);
    g.beginPath();
    g.moveTo(0, -7);
    g.lineTo(5, 5);
    g.lineTo(0, 2.5);
    g.lineTo(-5, 5);
    g.closePath();
    g.fillStyle = '#e8c547';
    g.fill();
    g.lineWidth = 1.5;
    g.strokeStyle = '#1b1310';
    g.stroke();
    g.restore();
  }

  private pick(e: MouseEvent): void {
    const r = this.canvas.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;
    let best: Stall | null = null;
    let bd = 14;
    for (const st of this.stalls) {
      const [px, py] = this.px(st.plot.ring.x, st.plot.ring.z);
      const d = Math.hypot(px - mx, py - my);
      if (d < bd) {
        bd = d;
        best = st;
      }
    }
    if (best) this.onSelect?.(best.place.id);
  }

  dispose(): void {
    this.root.innerHTML = '';
  }
}
