import { Emitter } from './Emitter';

export interface TickInfo {
  /** Seconds since the previous frame, clamped so a hitch never explodes physics. */
  delta: number;
  /** Seconds since start, paused while the tab is hidden. */
  elapsed: number;
  /** Real, unclamped frame time (for the adaptive-quality monitor). */
  raw: number;
}

/**
 * The single rAF loop. Pauses when the tab is hidden and resumes without a
 * giant delta, so physics never "catches up" after you switch tabs.
 */
export class Time extends Emitter<{ tick: TickInfo }> {
  readonly info: TickInfo = { delta: 1 / 60, elapsed: 0, raw: 1 / 60 };
  private last = 0;
  private raf = 0;
  private running = false;
  private readonly onVisibility = () => (document.hidden ? this.stop() : this.start());

  constructor(private readonly maxDelta = 1 / 20) {
    super();
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  start(): void {
    if (this.running || document.hidden) return;
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private loop = (now: number): void => {
    if (!this.running) return;
    // rAF timestamps can be a hair older than the performance.now() taken in start(): never go negative.
    this.info.raw = Math.max(0, (now - this.last) / 1000);
    this.info.delta = Math.min(this.info.raw, this.maxDelta);
    this.info.elapsed += this.info.delta;
    this.last = now;
    this.emit('tick', this.info);
    this.raf = requestAnimationFrame(this.loop);
  };

  dispose(): void {
    this.stop();
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.clear();
  }
}
