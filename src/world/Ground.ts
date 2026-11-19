import * as THREE from 'three';
import type { Physics } from '../physics/Physics';
import { palette } from './palette';

/** Half-size of the drivable square; invisible walls stop you driving off the world. */
export const WORLD_HALF = 100;

/**
 * Ground: warm dusty earth with a soft painted variation baked into vertex colours
 * (no texture download), plus a strip of asphalt where the lane will run.
 */
export class Ground {
  readonly group = new THREE.Group();
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];

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

    // Earth
    const earthGeo = new THREE.PlaneGeometry(220, 220, 64, 64);
    earthGeo.rotateX(-Math.PI / 2);
    const colors: number[] = [];
    const base = new THREE.Color(palette.ground);
    const warm = new THREE.Color(palette.terracotta);
    const c = new THREE.Color();
    const pos = earthGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const n = 0.5 + 0.5 * Math.sin(x * 0.11) * Math.cos(z * 0.09) + 0.15 * Math.sin(x * 0.37 + z * 0.29);
      c.copy(base).lerp(warm, THREE.MathUtils.clamp(n * 0.18, 0, 1));
      colors.push(c.r, c.g, c.b);
    }
    earthGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const earthMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
    const earth = new THREE.Mesh(earthGeo, earthMat);
    earth.receiveShadow = true;

    // Asphalt lane (placeholder strip; the street is built properly in milestone 3)
    const roadGeo = new THREE.PlaneGeometry(10, 160);
    roadGeo.rotateX(-Math.PI / 2);
    const roadMat = new THREE.MeshStandardMaterial({ color: palette.asphalt, roughness: 0.95, metalness: 0 });
    const road = new THREE.Mesh(roadGeo, roadMat);
    road.position.y = 0.01;
    road.receiveShadow = true;

    this.group.add(earth, road);
    this.geometries.push(earthGeo, roadGeo);
    this.materials.push(earthMat, roadMat);
    scene.add(this.group);
  }

  dispose(): void {
    this.group.removeFromParent();
    this.geometries.forEach((g) => g.dispose());
    this.materials.forEach((m) => m.dispose());
  }
}
