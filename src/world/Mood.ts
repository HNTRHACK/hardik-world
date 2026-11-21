import * as THREE from 'three';
import type { Debug } from '../core/Debug';
import { globals } from './geo/patches';

/**
 * Golden hour → dusk. While the lane sits idle the light slowly drains toward
 * dusk and the lamps, windows and signs come up; driving again brings the
 * golden hour back. Systems register a callback; shaders read `globals.uDusk`.
 */
export class Mood {
  /** 0 = golden hour, 1 = dusk. Starts at sunset (`settings.base`). */
  dusk = 0.36;
  /** base: the resting time of day while driving (sunset, between golden hour and dusk). */
  readonly settings = { auto: true, base: 0.36, idleBeforeDusk: 25, fadeSeconds: 14 };
  private idle = 0;
  private manual: number | null = null;
  private readonly listeners: ((d: number) => void)[] = [];
  private last = -1;

  constructor(debug: Debug) {
    globals.uDusk.value = this.dusk;
    const f = debug.folder('Time of day');
    if (f) {
      const state = { dusk: this.settings.base };
      f.add(this.settings, 'auto').name('dusk when idle');
      f.add(state, 'dusk', 0, 1, 0.01)
        .name('dusk (manual)')
        .onChange((v: number) => this.set(v));
      f.add(this.settings, 'base', 0, 1, 0.01).name('resting time (0 golden, 1 dusk)');
      f.add(this.settings, 'idleBeforeDusk', 3, 120, 1).name('idle seconds');
    }
  }

  /** Register a reaction to the dusk level (called whenever it changes noticeably). */
  on(fn: (d: number) => void): void {
    this.listeners.push(fn);
    fn(this.dusk);
  }

  /** Pin the level (debug / screenshots). */
  set(d: number): void {
    this.manual = d;
    this.dusk = d;
    this.emit();
  }

  update(delta: number, active: boolean): void {
    if (this.manual !== null) return;
    this.idle = active ? 0 : this.idle + delta;
    const target = this.settings.auto && this.idle > this.settings.idleBeforeDusk ? 1 : this.settings.base;
    // Brighten back quickly when you start driving; fade to dusk slowly.
    const rate = target < this.dusk ? 1 / 2.5 : 1 / this.settings.fadeSeconds;
    this.dusk += (target - this.dusk) * (1 - Math.exp(-rate * delta));
    if (Math.abs(this.dusk - this.last) > 0.002) this.emit();
  }

  private emit(): void {
    this.last = this.dusk;
    globals.uDusk.value = this.dusk;
    for (const fn of this.listeners) fn(this.dusk);
  }
}

/** Blend two colours by dusk into `out`. */
export function duskColor(out: THREE.Color, golden: THREE.ColorRepresentation, dusk: THREE.ColorRepresentation, t: number): THREE.Color {
  const a = new THREE.Color(golden);
  return out.copy(a).lerp(new THREE.Color(dusk), t);
}
