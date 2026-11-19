/** Drives the loading screen from real task progress. */
export class Loader {
  private readonly root: HTMLElement;
  private readonly bar: HTMLElement;
  private readonly status: HTMLElement;

  constructor(doc: Document = document) {
    this.root = doc.querySelector<HTMLElement>('[data-loader]')!;
    this.bar = doc.querySelector<HTMLElement>('[data-loader-bar]')!;
    this.status = doc.querySelector<HTMLElement>('[data-loader-status]')!;
  }

  set(ratio: number, label: string): void {
    const pct = Math.round(ratio * 100);
    this.bar.style.transform = `scaleX(${ratio})`;
    this.root.setAttribute('aria-valuenow', String(pct));
    if (label) this.status.textContent = label;
  }

  done(): void {
    this.root.classList.add('is-done');
    this.root.setAttribute('aria-hidden', 'true');
  }

  fail(message: string): void {
    this.status.textContent = message;
  }
}
