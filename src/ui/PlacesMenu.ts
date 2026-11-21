import type { Place } from '../stalls/places';
import { GRID_ICON, ICONS } from '../stalls/icons';
import { esc } from './views';

/**
 * Top-left "Projects" menu (disclosure pattern): a button that opens a list of
 * every place on the lane. Arrow keys / Home / End move between items, Escape
 * closes and returns focus, clicking outside or tabbing away closes it.
 */
export class PlacesMenu {
  private readonly root: HTMLElement;
  private readonly toggle: HTMLButtonElement;
  private readonly list: HTMLElement;
  private readonly items: HTMLButtonElement[] = [];
  onSelect: ((id: string) => void) | null = null;

  private readonly onDocDown = (e: PointerEvent) => {
    if (this.isOpen && !this.root.contains(e.target as Node)) this.close(false);
  };

  constructor(places: Place[]) {
    this.root = document.querySelector<HTMLElement>('[data-places]')!;
    const groups = ['Projects', 'The lane'] as const;
    this.root.innerHTML = `
      <button class="places__toggle" type="button" aria-expanded="false" aria-controls="places-list" data-places-toggle>
        ${GRID_ICON}<span>Projects</span>
      </button>
      <div class="places__list" id="places-list" hidden>
        ${groups
          .map(
            (g, gi) => `
          <p class="places__group" id="places-g${gi}">${g}</p>
          <ul aria-labelledby="places-g${gi}">
            ${places
              .filter((p) => p.group === g)
              .map(
                (p) => `<li><button type="button" class="places__item" data-go="${esc(p.id)}">
                  <span class="places__icon">${ICONS[p.id] ?? ''}</span>
                  <span class="places__text"><span class="places__name">${esc(p.short)}</span><span class="places__kind">${esc(p.kind)}</span></span>
                </button></li>`,
              )
              .join('')}
          </ul>`,
          )
          .join('')}
        <p class="places__foot">Pick one to drive there.</p>
      </div>`;
    this.toggle = this.root.querySelector('[data-places-toggle]')!;
    this.list = this.root.querySelector('#places-list')!;
    this.items.push(...this.root.querySelectorAll<HTMLButtonElement>('[data-go]'));

    this.toggle.addEventListener('click', () => (this.isOpen ? this.close(true) : this.open()));
    this.list.addEventListener('click', (e) => {
      const b = (e.target as Element).closest<HTMLButtonElement>('[data-go]');
      if (!b) return;
      this.close(false);
      this.onSelect?.(b.dataset.go!);
    });
    this.root.addEventListener('keydown', (e) => this.onKey(e));
    this.root.addEventListener('focusout', (e) => {
      if (this.isOpen && !this.root.contains(e.relatedTarget as Node | null)) this.close(false);
    });
    document.addEventListener('pointerdown', this.onDocDown);
  }

  get isOpen(): boolean {
    return !this.list.hidden;
  }

  open(): void {
    this.list.hidden = false;
    this.toggle.setAttribute('aria-expanded', 'true');
    requestAnimationFrame(() => this.root.classList.add('is-open'));
    this.items[0]?.focus();
  }

  close(returnFocus: boolean): void {
    if (!this.isOpen) return;
    this.list.hidden = true;
    this.root.classList.remove('is-open');
    this.toggle.setAttribute('aria-expanded', 'false');
    if (returnFocus) this.toggle.focus();
  }

  private onKey(e: KeyboardEvent): void {
    if (!this.isOpen) return;
    const i = this.items.indexOf(document.activeElement as HTMLButtonElement);
    const go = (n: number) => {
      e.preventDefault();
      this.items[(n + this.items.length) % this.items.length]?.focus();
    };
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation(); // don't also close an open panel
      this.close(true);
    } else if (e.key === 'ArrowDown') go(i + 1);
    else if (e.key === 'ArrowUp') go(i < 0 ? this.items.length - 1 : i - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(this.items.length - 1);
  }

  dispose(): void {
    document.removeEventListener('pointerdown', this.onDocDown);
    this.root.innerHTML = '';
  }
}
