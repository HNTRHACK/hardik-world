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
      // MSAA lives in the post-processing render target (adaptive); canvas MSAA would be paid twice.
      antialias: false,
      powerPreference: 'high-performance',
      stencil: false,
    });
    const r = this.instance;
    r.outputColorSpace = THREE.SRGBColorSpace;
    // ACES: filmic roll-off with rich, warm saturation (AgX is selectable under #debug).
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap; // r187: PCF + shadow.radius gives the soft edge
    r.setPixelRatio(sizes.pixelRatio);
    r.setSize(sizes.width, sizes.height);
    container.appendChild(r.domElement);

    this.off = sizes.on('resize', (s) => {
      r.setPixelRatio(s.pixelRatio);
      r.setSize(s.width, s.height);
    });

    void debug; // exposure lives in the post-processing folder
  }

  dispose(): void {
    this.off();
    this.instance.dispose();
    this.instance.domElement.remove();
  }
}
