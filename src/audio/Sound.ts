import type { SoundEngine, SoundFrame } from './SoundEngine';

const KEY = 'lane.sound';

/** What the sound layer needs to read from the game each frame. */
export interface SoundSource {
  speed: number;
  throttle: number;
  boost: boolean;
  horn: boolean;
  skid: number;
  x: number;
  z: number;
  /** planar velocity, for collision thuds */
  vx: number;
  vz: number;
  rightX: number;
  rightZ: number;
  seaDistance: number;
  /** camera is flying (teleport): ignore velocity jumps */
  teleporting: boolean;
  chai: { x: number; z: number } | null;
  omen: { x: number; z: number } | null;
}

/**
 * The top-right sound toggle. Muted by default; the choice is remembered. The
 * synthesiser (its own chunk) is only downloaded and started after the visitor
 * turns sound on, and it pauses while the tab is hidden.
 */
export class Sound {
  private readonly button: HTMLButtonElement | null;
  private on = false;
  private ctx: AudioContext | null = null;
  private engine: SoundEngine | null = null;
  private loading: Promise<void> | null = null;
  private readonly frame: SoundFrame = {
    dt: 0, speed: 0, throttle: 0, boost: false, horn: false, skid: 0, impact: 0,
    x: 0, z: 0, rightX: 1, rightZ: 0, seaDistance: 100, chai: null, omen: null,
  };
  private last = { x: 0, z: 0, vx: 0, vz: 0, primed: false };
  private impactCooldown = 0;
  private readonly cleanups: (() => void)[] = [];

  constructor() {
    this.button = document.querySelector<HTMLButtonElement>('[data-sound]');
    if (!this.button) return;
    this.button.hidden = false;
    this.button.addEventListener('click', () => this.set(!this.on));
    let saved = false;
    try {
      saved = localStorage.getItem(KEY) === '1';
    } catch {
      /* storage unavailable: stay muted */
    }
    this.render(saved);
    if (saved) {
      // Browsers only allow audio after a gesture: start on the first one.
      const start = () => {
        window.removeEventListener('pointerdown', start, true);
        window.removeEventListener('keydown', start, true);
        if (this.button?.getAttribute('aria-pressed') === 'true' && !this.on) void this.set(true, false);
      };
      window.addEventListener('pointerdown', start, true);
      window.addEventListener('keydown', start, true);
      this.cleanups.push(() => {
        window.removeEventListener('pointerdown', start, true);
        window.removeEventListener('keydown', start, true);
      });
    }
    const vis = () => {
      if (!this.ctx) return;
      if (document.hidden) void this.ctx.suspend();
      else if (this.on) void this.ctx.resume();
    };
    document.addEventListener('visibilitychange', vis);
    this.cleanups.push(() => document.removeEventListener('visibilitychange', vis));
  }

  private render(on: boolean): void {
    if (!this.button) return;
    this.button.setAttribute('aria-pressed', String(on));
    this.button.title = on ? 'Sound on (click to mute)' : 'Sound off (click to unmute)';
    this.button.classList.toggle('is-on', on);
  }

  async set(on: boolean, remember = true): Promise<void> {
    this.on = on;
    this.render(on);
    if (remember) {
      try {
        localStorage.setItem(KEY, on ? '1' : '0');
      } catch {
        /* ignore */
      }
    }
    if (on) {
      // Create the context inside the gesture (iOS needs that), then fetch the synth.
      this.ctx ??= new AudioContext({ latencyHint: 'interactive' });
      void this.ctx.resume();
      this.loading ??= import('./SoundEngine').then(({ SoundEngine }) => {
        this.engine = new SoundEngine(this.ctx!);
      });
      await this.loading;
    }
    this.engine?.setEnabled(this.on);
  }

  update(dt: number, s: SoundSource): void {
    // Collision thuds: a sudden change in planar velocity that braking can't explain.
    const L = this.last;
    let impact = 0;
    this.impactCooldown = Math.max(0, this.impactCooldown - dt);
    if (L.primed && !s.teleporting && dt > 0) {
      const jump = Math.hypot(s.x - L.x, s.z - L.z);
      const dv = Math.hypot(s.vx - L.vx, s.vz - L.vz);
      if (jump < 2.5 && dv > 3 && this.impactCooldown === 0) {
        impact = Math.min(1, (dv - 3) / 7 + 0.25);
        this.impactCooldown = 0.25;
      }
    }
    Object.assign(L, { x: s.x, z: s.z, vx: s.vx, vz: s.vz, primed: true });
    if (!this.engine || !this.on) return;
    const f = this.frame;
    f.dt = dt;
    f.speed = s.speed;
    f.throttle = s.throttle;
    f.boost = s.boost;
    f.horn = s.horn;
    f.skid = s.skid;
    f.impact = impact;
    f.x = s.x;
    f.z = s.z;
    f.rightX = s.rightX;
    f.rightZ = s.rightZ;
    f.seaDistance = s.seaDistance;
    f.chai = s.chai;
    f.omen = s.omen;
    this.engine.update(f);
  }

  dispose(): void {
    this.cleanups.forEach((c) => c());
    this.engine?.dispose();
    void this.ctx?.close();
  }
}
