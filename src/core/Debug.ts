import type GUI from 'lil-gui';

/**
 * lil-gui debug panel, only under `#debug`. It's dynamically imported, so
 * normal visitors never download it.
 */
export class Debug {
  readonly active = location.hash === '#debug';
  gui: GUI | null = null;

  async init(): Promise<void> {
    if (!this.active) return;
    const { default: LilGUI } = await import('lil-gui');
    this.gui = new LilGUI({ title: 'Hardik’s Lane · debug', width: 300 });
    // Left side, so it never covers the always-visible “Skip to classic site” button.
    Object.assign(this.gui.domElement.style, { left: '12px', right: 'auto', top: '12px' });
  }

  /** A folder, or null when debug is off; callers do `debug.folder('x')?.add(...)`. */
  folder(name: string): GUI | null {
    return this.gui?.addFolder(name).close() ?? null;
  }

  dispose(): void {
    this.gui?.destroy();
    this.gui = null;
  }
}
