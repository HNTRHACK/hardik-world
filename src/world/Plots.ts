import * as THREE from 'three';
import type { Debug } from '../core/Debug';
import { GeoBuilder } from './geo/GeoBuilder';
import type { Plot } from './layout';
import { palette } from './palette';

/**
 * The empty lots reserved for the project stalls (milestone 4) and the
 * about / contact / wins pieces (milestone 5). Visitors see tidy vacant
 * plots; under #debug each one gets a wireframe box and a label.
 */
export class Plots {
  readonly group = new THREE.Group();
  private readonly debugGroup = new THREE.Group();
  private readonly disposables: { dispose(): void }[] = [];

  constructor(
    scene: THREE.Scene,
    readonly plots: Plot[],
    debug: Debug,
  ) {
    const g = new GeoBuilder();
    for (const p of plots) {
      g.frame(p.x, 0, p.z, p.yaw);
      const pad = p.id === 'cobrakai' ? palette.promenade : palette.plotEarth;
      if (p.id !== 'cobrakai') g.box(0, 0.025, 0, p.w, 0.05, p.d, pad);
      // Low stone edging so the plot reads as intentional, not missing.
      if (p.id !== 'cobrakai')
        for (let x = -p.w / 2; x <= p.w / 2 + 0.01; x += 0.7) {
          g.box(x, 0.06, -p.d / 2, 0.36, 0.12, 0.2, palette.plotStone);
        }
    }
    const geo = g.build();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    this.group.add(mesh);
    this.disposables.push(geo, mat);
    scene.add(this.group);

    if (debug.active) this.addDebug(scene, debug);
  }

  private addDebug(scene: THREE.Scene, debug: Debug): void {
    for (const p of this.plots) {
      const color = p.milestone === 4 ? 0x00e5ff : 0xff3df2;
      const box = new THREE.BoxGeometry(p.w, 4, p.d);
      const edges = new THREE.EdgesGeometry(box);
      box.dispose();
      const lineMat = new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.85 });
      const lines = new THREE.LineSegments(edges, lineMat);
      lines.position.set(p.x, 2, p.z);
      lines.rotation.y = p.yaw;
      lines.renderOrder = 10;
      this.debugGroup.add(lines);
      const label = this.label(`${p.label}  ·  M${p.milestone}`, color);
      label.position.set(p.x, 5, p.z);
      this.debugGroup.add(label);
      this.disposables.push(edges, lineMat);
    }
    scene.add(this.debugGroup);
    debug.folder('Plots')?.add(this.debugGroup, 'visible').name('show plot markers');
  }

  private label(text: string, color: number): THREE.Sprite {
    const c = document.createElement('canvas');
    const g = c.getContext('2d')!;
    g.font = '600 30px system-ui, sans-serif';
    c.width = Math.ceil(g.measureText(text).width) + 28;
    c.height = 48;
    g.font = '600 30px system-ui, sans-serif';
    g.fillStyle = 'rgba(10,10,20,0.78)';
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
    g.textBaseline = 'middle';
    g.fillText(text, 14, 25);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
    const s = new THREE.Sprite(mat);
    s.scale.set(c.width / 48, 1, 1);
    s.renderOrder = 11;
    this.disposables.push(tex, mat);
    return s;
  }

  dispose(): void {
    this.group.removeFromParent();
    this.debugGroup.removeFromParent();
    this.disposables.forEach((d) => d.dispose());
  }
}
