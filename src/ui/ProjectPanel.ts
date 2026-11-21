import './panel.css';
import type { PanelEntry } from './views';

export type OpenedBy = 'ring' | 'label';
export type ClosedBy = 'user' | 'away';

/**
 * The content panel: a non-blocking side sheet (bottom sheet on phones) for
 * projects, About, Contact and Wins. Opening moves focus to the title and
 * announces it; Escape or the close button closes it and returns focus.
 * Driving away closes it too.
 */
export class ProjectPanel {
  private readonly el: HTMLElement;
  private readonly announcer: HTMLElement | null;
  current: PanelEntry | null = null;
  openedBy: OpenedBy | null = null;
  private returnFocus: Element | null = null;
  private closeTimer = 0;
  /** Called after any close, with who closed it. */
  onClose: ((entry: PanelEntry, by: ClosedBy) => void) | null = null;

  private readonly onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && this.current) {
      e.preventDefault();
      this.close('user');
    }
  };

  constructor() {
    this.el = document.querySelector<HTMLElement>('[data-panel]')!;
    this.announcer = document.querySelector<HTMLElement>('[data-announce]');
    document.addEventListener('keydown', this.onKey);
    this.el.addEventListener('click', (e) => {
      const t = e.target as Element;
      if (t.closest('[data-close]')) this.close('user');
      const copy = t.closest<HTMLElement>('[data-copy]');
      if (copy) void this.copy(copy);
    });
  }

  announce(text: string): void {
    if (this.announcer) this.announcer.textContent = text;
  }

  open(entry: PanelEntry, by: OpenedBy): void {
    if (this.current?.id === entry.id) return;
    clearTimeout(this.closeTimer);
    if (!this.current) this.returnFocus = document.activeElement;
    this.current = entry;
    this.openedBy = by;
    this.el.innerHTML = entry.html();
    this.el.setAttribute('aria-labelledby', 'panel-title');
    this.el.hidden = false;
    requestAnimationFrame(() => this.el.classList.add('is-open'));
    this.el.scrollTop = 0;
    this.el.querySelector<HTMLElement>('#panel-title')?.focus({ preventScroll: true });
    this.announce(`${entry.title} opened. Press Escape to close.`);
  }

  close(by: ClosedBy): void {
    const entry = this.current;
    if (!entry) return;
    this.current = null;
    this.openedBy = null;
    this.el.classList.remove('is-open');
    this.closeTimer = window.setTimeout(() => {
      this.el.hidden = true;
      this.el.innerHTML = '';
    }, 320);
    if (this.el.contains(document.activeElement)) {
      const back = this.returnFocus as HTMLElement | null;
      if (back && back !== document.body && document.contains(back)) back.focus({ preventScroll: true });
      else (document.activeElement as HTMLElement | null)?.blur();
    }
    this.announce(`${entry.title} closed.`);
    this.onClose?.(entry, by);
  }

  /** Click-to-copy (email). Falls back to selecting the text if the clipboard is unavailable. */
  private async copy(el: HTMLElement): Promise<void> {
    const value = el.dataset.copy ?? '';
    const status = this.el.querySelector<HTMLElement>('#copy-status');
    let ok = false;
    try {
      await navigator.clipboard.writeText(value);
      ok = true;
    } catch {
      const sel = window.getSelection();
      const target = el.querySelector('.panel__email-addr');
      if (sel && target) {
        const range = document.createRange();
        range.selectNodeContents(target);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }
    el.classList.toggle('is-copied', ok);
    if (status) status.textContent = ok ? 'Email copied to clipboard.' : 'Selected. Press Ctrl+C (or Cmd+C) to copy.';
    window.setTimeout(() => {
      el.classList.remove('is-copied');
      if (status) status.textContent = '';
    }, 2600);
  }

  dispose(): void {
    document.removeEventListener('keydown', this.onKey);
    clearTimeout(this.closeTimer);
  }
}
