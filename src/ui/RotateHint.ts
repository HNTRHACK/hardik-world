const KEY = 'lane.rotateHint';

/**
 * Phones held upright: a gentle, dismissible nudge that the lane is wider in
 * landscape. Shown once per visit; goes away by itself, on rotate, or on tap.
 */
export class RotateHint {
  private el: HTMLElement | null = null;
  private timer = 0;
  private readonly mq = matchMedia('(orientation: portrait) and (pointer: coarse) and (max-width: 640px)');
  private readonly onChange = () => {
    if (!this.mq.matches) this.hide();
  };

  constructor() {
    let seen = false;
    try {
      seen = sessionStorage.getItem(KEY) === '1';
    } catch {
      /* ignore */
    }
    if (seen || !this.mq.matches) return;
    try {
      sessionStorage.setItem(KEY, '1');
    } catch {
      /* ignore */
    }
    const el = document.createElement('div');
    el.className = 'rotate-hint';
    el.setAttribute('role', 'status');
    el.innerHTML = `
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <rect x="7" y="3" width="10" height="18" rx="2"/><path d="M2.5 14.5a9.5 9.5 0 004 5.5M3 19.5l3.6.6.3-3.6"/>
      </svg>
      <span>Turn your phone sideways for a wider view</span>
      <button type="button" aria-label="Dismiss">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
      </button>`;
    el.querySelector('button')!.addEventListener('click', () => this.hide());
    document.querySelector('#main')!.append(el);
    this.el = el;
    requestAnimationFrame(() => el.classList.add('is-visible'));
    this.timer = window.setTimeout(() => this.hide(), 7000);
    this.mq.addEventListener('change', this.onChange);
  }

  private hide(): void {
    const el = this.el;
    if (!el) return;
    this.el = null;
    clearTimeout(this.timer);
    el.classList.remove('is-visible');
    window.setTimeout(() => el.remove(), 400);
    this.mq.removeEventListener('change', this.onChange);
  }

  dispose(): void {
    this.hide();
  }
}
