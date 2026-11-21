import './touch.css';
import type { Action, Input } from '../core/Input';

const ICONS: Record<string, string> = {
  boost: '<path d="M6 17l6-6 6 6M6 11l6-6 6 6"/>',
  handbrake: '<path d="M4 15c3-6 13-6 16 0"/><path d="M8 19h8"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/>',
  horn: '<path d="M4 10v4h3l6 4V6L7 10H4z"/><path d="M16.5 9a4 4 0 010 6M19 6.5a7.5 7.5 0 010 11"/>',
};
const BUTTONS: { action: Action; label: string }[] = [
  { action: 'boost', label: 'Boost' },
  { action: 'handbrake', label: 'Drift' },
  { action: 'horn', label: 'Horn' },
];

/**
 * Phone / tablet driving: an analog stick on the left and thumb buttons on the
 * right (boost, handbrake, horn). Every control tracks its own pointer, so
 * steering, boosting and honking all work at once. They feed the same Input
 * state as the keyboard. Hidden where an open panel would sit underneath them.
 *
 * aria-hidden: screen-reader and keyboard users get the Projects menu (teleport)
 * and the keyboard; these are purely a touch affordance.
 */
export class TouchControls {
  private readonly root: HTMLElement;
  private readonly stick: HTMLElement;
  private readonly knob: HTMLElement;
  private stickPointer: number | null = null;
  private readonly centre = { x: 0, y: 0, r: 1 };
  private shown = false;
  private readonly cleanups: (() => void)[] = [];

  constructor(private readonly input: Input) {
    this.root = document.createElement('div');
    this.root.className = 'touch';
    this.root.setAttribute('aria-hidden', 'true');
    this.root.dataset.ui = '';
    this.root.innerHTML = `
      <div class="touch__stick" data-stick><div class="touch__ring"></div><div class="touch__knob" data-knob></div></div>
      <div class="touch__buttons">
        ${BUTTONS.map(
          (b) => `<button type="button" tabindex="-1" class="touch__btn touch__btn--${b.action}" data-hold="${b.action}">
            <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[b.action]}</svg>
            <span>${b.label}</span></button>`,
        ).join('')}
      </div>`;
    document.querySelector('#main')!.append(this.root);
    this.stick = this.root.querySelector('[data-stick]')!;
    this.knob = this.root.querySelector('[data-knob]')!;
    this.bindStick();
    this.root.querySelectorAll<HTMLButtonElement>('[data-hold]').forEach((b) => this.bindButton(b, b.dataset.hold as Action));

    // Show on touch-first devices, or the moment a hybrid laptop is touched.
    if (matchMedia('(pointer: coarse)').matches) this.show();
    else {
      const onTouch = (e: PointerEvent) => e.pointerType === 'touch' && this.show();
      window.addEventListener('pointerdown', onTouch, { passive: true });
      this.cleanups.push(() => window.removeEventListener('pointerdown', onTouch));
    }
    // No long-press menus or text selection on the controls.
    const noMenu = (e: Event) => e.preventDefault();
    this.root.addEventListener('contextmenu', noMenu);
  }

  get visible(): boolean {
    return this.shown;
  }

  private show(): void {
    if (this.shown) return;
    this.shown = true;
    this.root.classList.add('is-visible');
    document.documentElement.classList.add('has-touch-controls');
  }

  /**
   * Called when the panel opens or closes: the CSS hides whatever it would cover.
   * A control that's being held stays live and visible until it's let go, so you
   * can roll through a ring and drive straight on (which closes the panel).
   */
  setPanelOpen(open: boolean): void {
    this.root.classList.toggle('is-panel-open', open);
  }

  private bindStick(): void {
    const s = this.stick;
    const move = (x: number, y: number) => {
      let dx = (x - this.centre.x) / this.centre.r;
      let dy = (y - this.centre.y) / this.centre.r;
      const len = Math.hypot(dx, dy);
      if (len > 1) {
        dx /= len;
        dy /= len;
      }
      this.knob.style.transform = `translate(${dx * this.centre.r}px, ${dy * this.centre.r}px)`;
      // Dead zone, then a gentle curve: small thumb moves = fine control.
      const shape = (v: number) => {
        const a = Math.max(0, (Math.abs(v) - 0.12) / 0.88);
        return Math.sign(v) * Math.min(1, a * (0.55 + 0.45 * a)) ;
      };
      this.input.setAnalog(shape(-dy), shape(dx));
    };
    const down = (e: PointerEvent) => {
      if (this.stickPointer !== null) return;
      e.preventDefault();
      this.stickPointer = e.pointerId;
      s.setPointerCapture(e.pointerId);
      const r = s.getBoundingClientRect();
      this.centre.x = r.left + r.width / 2;
      this.centre.y = r.top + r.height / 2;
      this.centre.r = r.width * 0.36;
      s.classList.add('is-down');
      move(e.clientX, e.clientY);
    };
    const drag = (e: PointerEvent) => {
      if (e.pointerId === this.stickPointer) move(e.clientX, e.clientY);
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId !== this.stickPointer) return;
      this.stickPointer = null;
      s.classList.remove('is-down');
      this.knob.style.transform = '';
      this.input.releaseAnalog();
    };
    s.addEventListener('pointerdown', down);
    s.addEventListener('pointermove', drag);
    s.addEventListener('pointerup', up);
    s.addEventListener('pointercancel', up);
    s.addEventListener('lostpointercapture', up);
  }

  private bindButton(b: HTMLButtonElement, action: Action): void {
    let id: number | null = null;
    const down = (e: PointerEvent) => {
      e.preventDefault();
      if (id !== null) return;
      id = e.pointerId;
      b.setPointerCapture(e.pointerId);
      b.classList.add('is-down');
      this.input.hold(action, true);
      navigator.vibrate?.(8);
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      id = null;
      b.classList.remove('is-down');
      this.input.hold(action, false);
    };
    b.addEventListener('pointerdown', down);
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('lostpointercapture', up);
    this.cleanups.push(() => this.input.hold(action, false));
  }

  private releaseAll(): void {
    this.input.releaseAnalog();
    for (const b of BUTTONS) this.input.hold(b.action, false);
    this.root.querySelectorAll('.is-down').forEach((el) => el.classList.remove('is-down'));
    this.knob.style.transform = '';
    this.stickPointer = null;
  }

  dispose(): void {
    this.releaseAll();
    this.cleanups.forEach((f) => f());
    this.root.remove();
    document.documentElement.classList.remove('has-touch-controls');
  }
}
