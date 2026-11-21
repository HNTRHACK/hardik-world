import type { Debug } from '../core/Debug';

export interface QualityLevel {
  name: string;
  post: boolean;
  bloom: boolean;
  msaa: number;
  maxPixelRatio: number;
  shadowMap: number;
}

/** From best to cheapest. Post effects go first, then resolution, then shadow detail. */
export const LEVELS: QualityLevel[] = [
  { name: 'ultra', post: true, bloom: true, msaa: 4, maxPixelRatio: 2, shadowMap: 2048 },
  { name: 'high', post: true, bloom: true, msaa: 0, maxPixelRatio: 1.5, shadowMap: 2048 },
  { name: 'medium', post: true, bloom: false, msaa: 0, maxPixelRatio: 1.25, shadowMap: 2048 },
  { name: 'low', post: false, bloom: false, msaa: 0, maxPixelRatio: 1, shadowMap: 1024 },
];

/**
 * Adaptive quality: watches the real frame time and steps down when the GPU
 * can't hold ~50 fps for a couple of seconds; after a long stretch of headroom
 * it tries one step up again. Lockable under #debug (and for screenshots).
 */
export class Quality {
  level: number;
  locked = false;
  private window = 0;
  private frames = 0;
  private cooldown = 1;
  private good = 0;
  private readonly apply: (l: QualityLevel) => void;

  constructor(apply: (l: QualityLevel) => void, debug: Debug) {
    this.apply = apply;
    // Phones and small screens start at "high" (MSAA is wasted at DPR 2+).
    this.level = matchMedia('(pointer: coarse)').matches || window.devicePixelRatio >= 2 ? 1 : 0;
    this.apply(LEVELS[this.level]!);
    const f = debug.folder('Quality');
    if (f) {
      const state = { level: LEVELS[this.level]!.name, auto: true };
      f.add(state, 'level', LEVELS.map((l) => l.name))
        .name('level')
        .listen()
        .onChange((name: string) => this.set(LEVELS.findIndex((l) => l.name === name), true));
      f.add(state, 'auto')
        .name('adaptive')
        .onChange((on: boolean) => (this.locked = !on));
      this.onChange = (l) => (state.level = l.name);
    }
  }

  private onChange: ((l: QualityLevel) => void) | null = null;

  get current(): QualityLevel {
    return LEVELS[this.level]!;
  }

  set(level: number, lock = false): void {
    this.level = Math.max(0, Math.min(LEVELS.length - 1, level));
    this.locked = lock;
    this.window = 0;
    this.frames = 0;
    this.cooldown = 1;
    this.apply(this.current);
    this.onChange?.(this.current);
  }

  /** Feed the unclamped frame time in seconds. */
  sample(frameSeconds: number): void {
    if (this.locked) return;
    // Time-based window (~1.5 s, at least 4 frames): reacts fast even when frames are very slow.
    if (this.cooldown > 0) {
      this.cooldown -= frameSeconds;
      return;
    }
    this.window += frameSeconds;
    this.frames++;
    if (this.window < 1.5 || this.frames < 4) return;
    const avg = this.window / this.frames;
    this.window = 0;
    this.frames = 0;
    if (avg > 1 / 48 && this.level < LEVELS.length - 1) {
      this.set(this.level + 1);
      this.good = 0;
    } else if (avg < 1 / 75) {
      this.good += 1.5; // seconds of headroom
      if (this.good > 12 && this.level > 0) {
        this.good = -1e9; // only one step back up per session, no ping-pong
        this.set(this.level - 1);
      }
    }
  }
}
