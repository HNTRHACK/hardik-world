import type { Input } from '../core/Input';

/** Keyboard hint at the bottom of the screen; fades a few seconds after you start driving. */
export class ControlsHint {
  private readonly el = document.querySelector<HTMLElement>('[data-hint]');
  private timer = 0;
  private readonly off: () => void;

  constructor(input: Input) {
    // Keyboard hints only make sense with a keyboard-ish setup (touch controls come in milestone 7).
    if (this.el && matchMedia('(hover: hover) and (pointer: fine)').matches) {
      this.el.hidden = false;
      requestAnimationFrame(() => this.el?.classList.add('is-visible'));
    }
    this.off = input.on('first', () => {
      this.timer = window.setTimeout(() => this.el?.classList.remove('is-visible'), 5000);
    });
  }

  dispose(): void {
    this.off();
    clearTimeout(this.timer);
    this.el?.classList.remove('is-visible');
  }
}
