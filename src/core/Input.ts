import { Emitter } from './Emitter';

export type Action = 'forward' | 'backward' | 'left' | 'right' | 'handbrake' | 'boost' | 'reset' | 'horn';

const KEYS: Record<string, Action> = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyS: 'backward',
  ArrowDown: 'backward',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  Space: 'handbrake',
  ShiftLeft: 'boost',
  ShiftRight: 'boost',
  KeyR: 'reset',
  KeyH: 'horn',
};

/**
 * Keyboard state by action (physical key codes, so WASD works on AZERTY too).
 * The touch controls write into the same state: `analog` axes from the
 * joystick and `hold()` for the buttons, so the rest of the game can't tell.
 */
export class Input extends Emitter<{ press: Action; first: void }> {
  readonly down = new Set<Action>();
  /** Analog overrides from touch controls; null = use the keyboard. */
  analog: { throttle: number; steer: number } | null = null;
  private touched = false;

  private readonly onDown = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey || this.isTyping(e.target)) return;
    const action = KEYS[e.code];
    if (!action) return;
    // Inside a panel, arrows/space scroll and press buttons; WASD still drives (and drives away).
    if (e.target instanceof Element && e.target.closest('[data-panel], [data-ui]') && !e.code.startsWith('Key')) return;
    // Space/arrows would scroll or activate a focused button; the canvas owns them.
    if (e.target === document.body || e.target instanceof HTMLCanvasElement) e.preventDefault();
    if (!this.down.has(action)) {
      this.down.add(action);
      this.emit('press', action);
    }
    this.markFirst();
  };

  /** Touch buttons: hold an action down (or release it). */
  hold(action: Action, on: boolean): void {
    if (on && !this.down.has(action)) {
      this.down.add(action);
      this.emit('press', action);
      this.markFirst();
    } else if (!on) this.down.delete(action);
  }

  /** Joystick axes (null releases them back to the keyboard). */
  setAnalog(throttle: number, steer: number): void {
    this.analog = { throttle, steer };
    if (throttle || steer) this.markFirst();
  }

  releaseAnalog(): void {
    this.analog = null;
  }

  /** Anything is being driven right now (keys, buttons or stick). */
  get active(): boolean {
    return this.down.size > 0 || (this.analog !== null && (this.analog.throttle !== 0 || this.analog.steer !== 0));
  }

  private markFirst(): void {
    if (this.touched) return;
    this.touched = true;
    this.emit('first', undefined);
  }

  private readonly onUp = (e: KeyboardEvent) => {
    const action = KEYS[e.code];
    if (action) this.down.delete(action);
  };

  /** Alt-tab with a key held must not leave the rickshaw driving off on its own. */
  private readonly onBlur = () => this.down.clear();

  constructor() {
    super();
    window.addEventListener('keydown', this.onDown);
    window.addEventListener('keyup', this.onUp);
    window.addEventListener('blur', this.onBlur);
  }

  private isTyping(t: EventTarget | null): boolean {
    return t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || (t instanceof HTMLElement && t.isContentEditable);
  }

  get throttle(): number {
    if (this.analog) return this.analog.throttle;
    return (this.down.has('forward') ? 1 : 0) - (this.down.has('backward') ? 1 : 0);
  }

  get steer(): number {
    if (this.analog) return this.analog.steer;
    return (this.down.has('right') ? 1 : 0) - (this.down.has('left') ? 1 : 0);
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onDown);
    window.removeEventListener('keyup', this.onUp);
    window.removeEventListener('blur', this.onBlur);
    this.clear();
  }
}
