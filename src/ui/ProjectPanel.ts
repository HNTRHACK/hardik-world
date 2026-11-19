import './panel.css';
import type { Project } from '../content/projects';
import { ARROW_ICON, CLOSE_ICON } from '../stalls/icons';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export type OpenedBy = 'ring' | 'label';
export type ClosedBy = 'user' | 'away';

/**
 * The project panel: a non-blocking side sheet (bottom sheet on phones).
 * Opening moves focus to the title and announces it; Escape or the close
 * button closes it and returns focus. Driving away closes it too.
 */
export class ProjectPanel {
  private readonly el: HTMLElement;
  private readonly announcer: HTMLElement | null;
  current: Project | null = null;
  openedBy: OpenedBy | null = null;
  private returnFocus: Element | null = null;
  private closeTimer = 0;
  /** Called after any close, with who closed it. */
  onClose: ((project: Project, by: ClosedBy) => void) | null = null;

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
      if ((e.target as Element).closest('[data-close]')) this.close('user');
    });
  }

  open(p: Project, by: OpenedBy): void {
    if (this.current?.id === p.id) return;
    clearTimeout(this.closeTimer);
    if (!this.current) this.returnFocus = document.activeElement;
    this.current = p;
    this.openedBy = by;
    this.el.innerHTML = this.render(p);
    this.el.setAttribute('aria-labelledby', 'panel-title');
    this.el.hidden = false;
    // next frame so the transition runs from the hidden state
    requestAnimationFrame(() => this.el.classList.add('is-open'));
    this.el.scrollTop = 0;
    this.el.querySelector<HTMLElement>('#panel-title')?.focus({ preventScroll: true });
    if (this.announcer) this.announcer.textContent = `${p.title} opened. Press Escape to close.`;
  }

  close(by: ClosedBy): void {
    const p = this.current;
    if (!p) return;
    this.current = null;
    this.openedBy = null;
    this.el.classList.remove('is-open');
    this.closeTimer = window.setTimeout(() => {
      this.el.hidden = true;
      this.el.innerHTML = '';
    }, 320);
    // Give focus back if it was inside the panel.
    if (this.el.contains(document.activeElement)) {
      const back = this.returnFocus as HTMLElement | null;
      if (back && back !== document.body && document.contains(back)) back.focus({ preventScroll: true });
      else (document.activeElement as HTMLElement | null)?.blur();
    }
    if (this.announcer) this.announcer.textContent = `${p.title} closed.`;
    this.onClose?.(p, by);
  }

  private render(p: Project): string {
    const link = (href: string, label: string, primary = false) =>
      `<a class="panel__btn${primary ? ' panel__btn--primary' : ''}" href="${esc(href)}" target="_blank" rel="noopener">${esc(label)}${ARROW_ICON}<span class="visually-hidden"> (opens in a new tab)</span></a>`;
    const actions = [
      p.links.live ? link(p.links.live, 'Live site', true) : '',
      p.links.github ? link(p.links.github, 'Source on GitHub', !p.links.live) : '',
      link(p.links.classic, 'Full write-up'),
    ].join('');
    const shots = p.shots
      .map(
        (s) => `<figure class="panel__shot${s.placeholder ? ' is-placeholder' : ''}">
          <img src="${esc(s.src)}" alt="${esc(s.alt)}" width="1280" height="800" loading="lazy" decoding="async" />
          <figcaption>${esc(s.caption)}</figcaption>
        </figure>`,
      )
      .join('');
    const details = p.details
      .map((d) => `<section><h3>${esc(d.heading)}</h3>${d.body.map((b) => `<p>${esc(b)}</p>`).join('')}</section>`)
      .join('');
    return `
      <header class="panel__head">
        <p class="panel__kicker">${esc(p.context)} <span aria-hidden="true">·</span> ${p.team}</p>
        <button class="panel__close" type="button" data-close aria-label="Close ${esc(p.short)}">${CLOSE_ICON}</button>
      </header>
      <h2 class="panel__title" id="panel-title" tabindex="-1">${esc(p.title)}</h2>
      <p class="panel__lede">${esc(p.oneLiner)}</p>
      <div class="panel__gallery" role="group" aria-label="Screenshots" tabindex="0">${shots}</div>
      <dl class="panel__facts">
        <div><dt>My role</dt><dd>${esc(p.role)}</dd></div>
        <div><dt>Stack</dt><dd><ul class="panel__stack">${p.stack.map((s) => `<li>${esc(s)}</li>`).join('')}</ul></dd></div>
        <div><dt>Year</dt><dd>${p.year}</dd></div>
      </dl>
      <div class="panel__actions">${actions}</div>
      ${p.note ? `<p class="panel__note"><strong>Note.</strong> ${esc(p.note)}</p>` : ''}
      <details class="panel__more">
        <summary>Read more</summary>
        <div class="panel__details">${details}</div>
      </details>
      <p class="panel__hint" aria-hidden="true">Esc to close · drive away to leave</p>`;
  }

  dispose(): void {
    document.removeEventListener('keydown', this.onKey);
    clearTimeout(this.closeTimer);
  }
}
