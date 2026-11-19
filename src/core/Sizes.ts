import { Emitter } from './Emitter';

/** Viewport size + device pixel ratio (capped; the quality system can lower the cap later). */
export class Sizes extends Emitter<{ resize: Sizes }> {
  width = window.innerWidth;
  height = window.innerHeight;
  maxPixelRatio = 2;
  pixelRatio = Math.min(window.devicePixelRatio, this.maxPixelRatio);
  private readonly onResize = () => this.update();

  constructor() {
    super();
    window.addEventListener('resize', this.onResize);
  }

  setMaxPixelRatio(max: number): void {
    this.maxPixelRatio = max;
    this.update();
  }

  private update(): void {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.pixelRatio = Math.min(window.devicePixelRatio, this.maxPixelRatio);
    this.emit('resize', this);
  }

  get aspect(): number {
    return this.width / this.height;
  }

  dispose(): void {
    window.removeEventListener('resize', this.onResize);
    this.clear();
  }
}
