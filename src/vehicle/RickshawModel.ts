import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { palette } from '../world/palette';
import { RICKSHAW } from './RickshawPhysics';

/**
 * Procedural low-poly Mumbai auto-rickshaw: yellow body, black canopy, green trim.
 *
 * Built in metres, forward = -Z, in the physics body's frame. Parts are merged
 * per material, so the whole shell is 7 draw calls and the wheels add 2 each.
 */

type Part = { geo: THREE.BufferGeometry; mat: keyof ReturnType<typeof makeMaterials> };

function makeMaterials() {
  const std = (color: number, o: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0, flatShading: true, ...o });
  return {
    yellow: std(palette.rickshawYellow, { roughness: 0.55 }),
    green: std(palette.rickshawGreen, { roughness: 0.6 }),
    canopy: std(palette.canopy, { roughness: 0.85 }),
    trim: std(palette.ink, { roughness: 0.6 }),
    seat: std(palette.seat, { roughness: 0.8 }),
    glass: std(palette.glass, { roughness: 0.15, metalness: 0.2 }),
    lamp: std(palette.cream, { emissive: palette.headlight, emissiveIntensity: 0.6 }),
    tail: std(palette.terracotta, { emissive: palette.terracotta, emissiveIntensity: 0.5 }),
    tire: std(palette.tire, { roughness: 0.95 }),
    hub: std(palette.cream, { roughness: 0.4, metalness: 0.3 }),
  };
}

/** A box whose front (-Z) top edge is pulled back and narrowed: a tapered nose / cowl. */
function taperedBox(w: number, h: number, d: number, topBack: number, frontNarrow: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const front = p.getZ(i) < 0;
    const top = p.getY(i) > 0;
    if (front) p.setX(i, p.getX(i) * frontNarrow);
    if (front && top) p.setZ(i, p.getZ(i) + topBack);
  }
  g.computeVertexNormals();
  return g;
}

const at = (g: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => {
  g.applyMatrix4(
    new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
      new THREE.Vector3(1, 1, 1),
    ),
  );
  return g;
};

export class RickshawModel {
  readonly root = new THREE.Group();
  /** Everything but the wheels; leans and squats on its own. */
  readonly shell = new THREE.Group();
  readonly frontWheel = new THREE.Group();
  readonly rearWheels: [THREE.Group, THREE.Group] = [new THREE.Group(), new THREE.Group()];
  private readonly materials = makeMaterials();
  private readonly geometries: THREE.BufferGeometry[] = [];

  constructor() {
    // Everything below is authored as "height above the road"; this offset puts it in the
    // body frame. 0.61 m is the body origin's measured ride height at rest (headless sim).
    const restHeight = 0.61;
    this.shell.position.y = -restHeight;
    this.root.add(this.shell);
    this.buildShell();
    this.buildWheels(restHeight);
  }

  private buildShell(): void {
    const parts: Part[] = [];
    const add = (mat: Part['mat'], geo: THREE.BufferGeometry) => parts.push({ geo, mat });
    const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);

    // Floor pan and rear tub (passenger bench box)
    add('trim', at(box(1.14, 0.1, 1.95), 0, 0.4, 0.15));
    add('yellow', at(box(1.24, 0.52, 1.05), 0, 0.7, 0.62));
    add('green', at(box(1.27, 0.08, 1.07), 0, 0.5, 0.62)); // trim stripe
    add('trim', at(box(1.26, 0.06, 1.07), 0, 0.97, 0.62)); // tub lip
    // Driver footwell sides + floor up to the cowl
    add('yellow', at(box(1.16, 0.26, 0.6), 0, 0.56, -0.2));
    // Front cowl: the auto's "nose", over the single front wheel
    add('yellow', at(taperedBox(1.1, 0.62, 0.62, 0.26, 0.72), 0, 0.84, -0.86));
    add('green', at(taperedBox(1.12, 0.08, 0.64, 0.02, 0.72), 0, 0.56, -0.86));
    add('trim', at(box(0.34, 0.06, 0.62), 0, 0.62, -1.08)); // mudguard
    add('lamp', at(new THREE.CylinderGeometry(0.1, 0.11, 0.08, 10), 0, 0.98, -1.15, Math.PI / 2 - 0.25));
    add('trim', at(new THREE.CylinderGeometry(0.13, 0.13, 0.04, 10), 0, 0.98, -1.12, Math.PI / 2 - 0.25));
    // Windscreen in a yellow frame, raked back
    add('yellow', at(box(1.02, 0.06, 0.06), 0, 1.15, -0.98, -0.28));
    add('glass', at(box(0.92, 0.52, 0.03), 0, 1.44, -0.92, -0.28));
    add('trim', at(box(1.0, 0.05, 0.06), 0, 1.71, -0.84, -0.28));
    // Handlebar + stem
    add('trim', at(new THREE.CylinderGeometry(0.02, 0.02, 0.62, 6), 0, 1.12, -0.66, 0, 0, Math.PI / 2));
    add('trim', at(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6), 0, 0.88, -0.74, 0.5));
    add('seat', at(box(0.12, 0.06, 0.06), 0.31, 1.12, -0.66));
    add('seat', at(box(0.12, 0.06, 0.06), -0.31, 1.12, -0.66));
    // Seats
    add('seat', at(box(0.5, 0.12, 0.36), 0, 0.98, -0.28)); // driver
    add('seat', at(box(1.08, 0.14, 0.46), 0, 1.06, 0.55)); // passenger bench
    add('seat', at(box(1.08, 0.42, 0.12), 0, 1.3, 0.98, -0.12)); // backrest
    // Canopy: a flattened half-cylinder roof on four pillars, sloping down at the back
    const roof = new THREE.CylinderGeometry(0.68, 0.68, 2.08, 9, 1, false, -Math.PI / 2, Math.PI);
    roof.rotateX(-Math.PI / 2); // axis along Z, arch up (+Y)
    roof.scale(0.98, 0.42, 1);
    add('canopy', at(roof, 0, 1.72, 0.08));
    add('canopy', at(box(1.32, 0.66, 0.05), 0, 1.42, 1.11, 0.12)); // rear flap
    for (const [x, z] of [
      [0.56, -0.84],
      [-0.56, -0.84],
      [0.62, 1.02],
      [-0.62, 1.02],
    ] as const) {
      add('trim', at(box(0.05, z < 0 ? 0.62 : 0.78, 0.05), x, z < 0 ? 1.42 : 1.34, z));
    }
    // Tail lights + number-plate block
    add('tail', at(box(0.12, 0.09, 0.04), 0.48, 0.78, 1.16));
    add('tail', at(box(0.12, 0.09, 0.04), -0.48, 0.78, 1.16));
    add('lamp', at(box(0.36, 0.14, 0.03), 0, 0.66, 1.16));

    // Merge by material → one mesh per material.
    const byMat = new Map<Part['mat'], THREE.BufferGeometry[]>();
    for (const p of parts) {
      const list = byMat.get(p.mat) ?? [];
      list.push(p.geo.index ? p.geo.toNonIndexed() : p.geo);
      byMat.set(p.mat, list);
    }
    for (const [mat, geos] of byMat) {
      const merged = mergeGeometries(geos, false);
      geos.forEach((g) => g.dispose());
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, this.materials[mat]);
      mesh.castShadow = mat !== 'glass';
      mesh.receiveShadow = true;
      this.shell.add(mesh);
      this.geometries.push(merged);
    }
    parts.forEach((p) => p.geo.dispose());
  }

  private buildWheels(restHeight: number): void {
    const r = RICKSHAW.wheelRadius;
    const tire = new THREE.CylinderGeometry(r, r, 0.2, 12);
    tire.rotateZ(Math.PI / 2);
    const hub = new THREE.CylinderGeometry(r * 0.48, r * 0.48, 0.22, 8);
    hub.rotateZ(Math.PI / 2);
    this.geometries.push(tire, hub);
    const make = (g: THREE.Group) => {
      const spin = new THREE.Group();
      spin.name = 'spin';
      for (const [geo, mat] of [
        [tire, this.materials.tire],
        [hub, this.materials.hub],
      ] as const) {
        const m = new THREE.Mesh(geo, mat);
        m.castShadow = true;
        spin.add(m);
      }
      g.add(spin);
      this.root.add(g);
    };
    make(this.frontWheel);
    this.rearWheels.forEach(make);
    // Rest pose (the vehicle updates these from the suspension every frame).
    const w = RICKSHAW.wheels;
    const y = r - restHeight;
    this.frontWheel.position.set(0, y, w[0].z);
    this.rearWheels[0].position.set(w[2].x - 0.06, y, w[2].z);
    this.rearWheels[1].position.set(w[3].x + 0.06, y, w[3].z);
  }

  static spinOf(wheel: THREE.Group): THREE.Object3D {
    return wheel.getObjectByName('spin')!;
  }

  dispose(): void {
    this.root.removeFromParent();
    this.geometries.forEach((g) => g.dispose());
    Object.values(this.materials).forEach((m) => m.dispose());
  }
}
