import * as THREE from 'three';
import type { Physics } from '../physics/Physics';
import { seaX } from './layout';
import { palette } from './palette';

/** Half-size of the drivable square; invisible walls stop you driving off the world. */
export const WORLD_HALF = 100;

/**
 * Dusty earth between everything, cut along the sea wall's curve, with a soft
 * painted variation baked into vertex colours (no texture download).
 */
export class Ground {
  readonly mesh: THREE.Mesh;

  constructor(scene: THREE.Scene, physics: Physics) {
    // Physics: one flat slab (top face at y = 0) plus four edge walls.
    const R = physics.R;
    const w = physics.world;
    w.createCollider(R.ColliderDesc.cuboid(WORLD_HALF + 10, 0.5, WORLD_HALF + 10).setTranslation(0, -0.5, 0).setFriction(0.9));
    for (const [x, z, hx, hz] of [
      [WORLD_HALF, 0, 0.5, WORLD_HALF],
      [-WORLD_HALF, 0, 0.5, WORLD_HALF],
      [0, WORLD_HALF, WORLD_HALF, 0.5],
      [0, -WORLD_HALF, WORLD_HALF, 0.5],
    ] as const) {
      w.createCollider(R.ColliderDesc.cuboid(hx, 3, hz).setTranslation(x, 3, z).setFriction(0.2));
    }

    // Visual: a plane whose west edge follows the sea wall.
    const span = 240;
    const geo = new THREE.PlaneGeometry(1, span, 60, 90);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position!;
    const colors: number[] = [];
    const base = new THREE.Color(palette.ground);
    const warm = new THREE.Color(palette.terracotta);
    const cool = new THREE.Color(palette.groundCool);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const u = pos.getX(i) + 0.5;
      const z = pos.getZ(i);
      const x0 = seaX(z) + 0.2;
      const x = THREE.MathUtils.lerp(x0, 125, u * u * 0.4 + u * 0.6); // denser near the sea
      pos.setX(i, x);
      const n = 0.5 + 0.5 * Math.sin(x * 0.11) * Math.cos(z * 0.09) + 0.15 * Math.sin(x * 0.37 + z * 0.29);
      c.copy(base).lerp(warm, THREE.MathUtils.clamp(n * 0.16, 0, 1)).lerp(cool, THREE.MathUtils.clamp(0.5 - n, 0, 0.5) * 0.25);
      colors.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.receiveShadow = true;
    scene.add(this.mesh);
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
