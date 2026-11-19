import * as THREE from 'three';
import type { Sizes } from './Sizes';
import type { Debug } from './Debug';

/** WebGL renderer: filmic tone mapping, sRGB output, soft shadows, DPR capped by Sizes. */
export class Renderer {
  readonly instance: THREE.WebGLRenderer;
  private readonly off: () => void;

  constructor(
    container: HTMLElement,
    sizes: Sizes,
    debug: Debug,
  ) {
    this.instance = new THREE.WebGLRenderer({
      antialias: sizes.pixelRatio < 2, // MSAA is wasted at DPR 2
      powerPreference: 'high-performance',
      stencil: false,
    });
    const r = this.instance;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap; // r187: PCF + shadow.radius gives the soft edge
    r.setPixelRatio(sizes.pixelRatio);
    r.setSize(sizes.width, sizes.height);
    container.appendChild(r.domElement);

    this.off = sizes.on('resize', (s) => {
      r.setPixelRatio(s.pixelRatio);
      r.setSize(s.width, s.height);
    });

    const f = debug.folder('Renderer');
    f?.add(r, 'toneMappingExposure', 0.3, 2.5, 0.01).name('exposure');
  }

  dispose(): void {
    this.off();
    this.instance.dispose();
    this.instance.domElement.remove();
  }
}
