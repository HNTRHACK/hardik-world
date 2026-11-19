import * as THREE from 'three';
import type * as RAPIER from '@dimforge/rapier3d-compat';
import type { Physics } from '../physics/Physics';
import { GeoBuilder } from './geo/GeoBuilder';
import { Rng } from './geo/rng';
import type { RoadNet } from './layout';
import type { Spot } from './Roads';
import type { Spots } from './spots';
import { palette } from './palette';

interface Kind {
  geo: THREE.BufferGeometry;
  collider: (R: Physics['R']) => RAPIER.ColliderDesc;
  /** Height of the body centre above the ground when standing. */
  rest: number;
  tint?: number[];
  shadow?: boolean;
}

type Drop = { kind: string; x: number; y?: number; z: number; yaw: number };

/**
 * Things you can knock over: crates, matkas, cones (round the potholes),
 * dustbins, cycles and plastic chairs. One InstancedMesh per kind; each
 * instance slot is driven by its own Rapier body (sleeping ones cost nothing).
 */
export class Props {
  readonly group = new THREE.Group();
  private readonly disposables: { dispose(): void }[] = [];

  constructor(scene: THREE.Scene, physics: Physics, net: RoadNet, spots: Spots, potholes: Spot[]) {
    const rng = new Rng(4242);
    const kinds = this.kinds();
    const drops: Drop[] = [];

    // Cones ring a few potholes (the municipality's one-and-only fix).
    potholes.slice(0, 4).forEach((p) => {
      for (let i = 0; i < 4; i++) {
        const a = p.yaw + (i / 4) * Math.PI * 2 + Math.PI / 4;
        drops.push({ kind: 'cone', x: p.x + Math.cos(a) * 1.0, z: p.z + Math.sin(a) * 1.0, yaw: rng.range(0, 6) });
      }
    });

    // Clusters on the footpaths, in front of the shops.
    const clusters: [string, number, number][] = [
      ['crates', 6, 0],
      ['matkas', 3, 0],
      ['bins', 9, 0],
      ['cycle', 4, 0],
      ['chairs', 3, 0],
    ];
    const roads = net.roads.filter((r) => r.def.kind !== 'ring');
    for (const [type, count] of clusters) {
      let placed = 0;
      for (let i = 0; i < 300 && placed < count; i++) {
        const road = rng.pick(roads);
        const side = rng.chance(0.5) ? 1 : -1;
        const sp = spots.kerb(road, rng.range(0, road.length), side, road.def.footpath - 0.65, 0.9);
        if (!sp) continue;
        placed++;
        spots.claim(sp.x, sp.z, 1.4);
        const ax = sp.tx;
        const az = sp.tz;
        const at = (along: number, out = 0) => ({ x: sp.x + ax * along - Math.sin(sp.yaw) * out, z: sp.z + az * along - Math.cos(sp.yaw) * out });
        if (type === 'crates') {
          const n = rng.int(2, 3);
          for (let k = 0; k < n; k++) drops.push({ kind: 'crate', ...at(k * 0.66 - 0.33), yaw: sp.yaw + rng.range(-0.1, 0.1) });
          drops.push({ kind: 'crate', ...at(0), y: 0.62 + 0.31, yaw: sp.yaw + 0.3 });
        } else if (type === 'matkas') {
          for (let k = 0; k < 5; k++) drops.push({ kind: 'matka', ...at((k - 2) * 0.62, (k % 2) * 0.4), yaw: rng.range(0, 6) });
        } else if (type === 'bins') {
          drops.push({ kind: 'bin', ...at(0), yaw: rng.range(0, 6) });
          if (rng.chance(0.5)) drops.push({ kind: 'bin', ...at(0.75), yaw: rng.range(0, 6) });
        } else if (type === 'cycle') {
          drops.push({ kind: 'cycle', ...at(0), yaw: Math.atan2(ax, az) });
        } else {
          for (let k = 0; k < 4; k++) drops.push({ kind: 'chair', ...at((k % 2) * 0.8 - 0.4, Math.floor(k / 2) * 0.8 - 0.2), yaw: rng.range(0, 6) });
        }
      }
    }

    const byKind = new Map<string, Drop[]>();
    for (const d of drops) (byKind.get(d.kind) ?? byKind.set(d.kind, []).get(d.kind)!).push(d);
    const R = physics.R;
    for (const [name, list] of byKind) {
      const k = kinds[name]!;
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, flatShading: true });
      const mesh = new THREE.InstancedMesh(k.geo, mat, list.length);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.castShadow = k.shadow ?? true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false; // instances move anywhere; the bounding sphere would go stale
      const c = new THREE.Color();
      list.forEach((d, i) => {
        if (k.tint) mesh.setColorAt(i, c.set(rng.pick(k.tint)));
        const body = physics.world.createRigidBody(
          R.RigidBodyDesc.dynamic()
            .setTranslation(d.x, d.y ?? k.rest, d.z)
            .setRotation({ x: 0, y: Math.sin(d.yaw / 2), z: 0, w: Math.cos(d.yaw / 2) })
            .setLinearDamping(0.3)
            .setAngularDamping(0.5)
            .setSleeping(true),
        );
        physics.world.createCollider(k.collider(R).setFriction(0.7).setRestitution(0.15), body);
        physics.link(body, { mesh, index: i });
      });
      this.group.add(mesh);
      this.disposables.push(k.geo, mat);
    }
    // geometries of unused kinds
    for (const [name, k] of Object.entries(kinds)) if (!byKind.has(name)) k.geo.dispose();
    scene.add(this.group);
  }

  private kinds(): Record<string, Kind> {
    const crate = new GeoBuilder();
    crate.box(0, 0, 0, 0.62, 0.62, 0.62, palette.crate, { bottom: true });
    for (const y of [-0.2, 0.2]) crate.box(0, y, 0, 0.64, 0.07, 0.64, palette.crateSlat, { bottom: true });
    const matka = new GeoBuilder();
    const lathe = new THREE.LatheGeometry(
      [
        [0.0, -0.3],
        [0.18, -0.28],
        [0.3, -0.12],
        [0.32, 0.02],
        [0.25, 0.18],
        [0.12, 0.25],
        [0.13, 0.3],
      ].map(([x, y]) => new THREE.Vector2(x, y)),
      9,
    );
    matka.shape(lathe, palette.matka, 0, 0, 0, 1, 1, 1);
    lathe.dispose();
    matka.cylinder(0, 0.0, 0, 0.325, 0.325, 0.05, 9, palette.matkaBand);
    const cone = new GeoBuilder();
    cone.box(0, -0.37, 0, 0.5, 0.06, 0.5, palette.coneOrange, { bottom: true });
    cone.cylinder(0, 0.03, 0, 0.05, 0.22, 0.74, 8, palette.coneOrange);
    cone.cylinder(0, 0.05, 0, 0.14, 0.17, 0.14, 8, palette.cream, { cap: false });
    const bin = new GeoBuilder();
    bin.cylinder(0, 0, 0, 0.3, 0.25, 0.8, 9, 0xffffff);
    bin.cylinder(0, 0.43, 0, 0.32, 0.32, 0.06, 9, 0xdddddd);
    const cycle = new GeoBuilder();
    for (const z of [-0.52, 0.52]) {
      cycle.cylinder(0, -0.18, z, 0.33, 0.33, 0.04, 12, palette.kerbBlack, { rz: Math.PI / 2 });
      cycle.cylinder(0, -0.18, z, 0.08, 0.08, 0.05, 6, 0xb0b0b0, { rz: Math.PI / 2 });
    }
    const f = palette.cycleFrame;
    cycle.rod({ x: 0, y: -0.18, z: -0.52 }, { x: 0, y: 0.18, z: -0.05 }, 0.025, f);
    cycle.rod({ x: 0, y: 0.18, z: -0.05 }, { x: 0, y: 0.22, z: 0.4 }, 0.025, f);
    cycle.rod({ x: 0, y: -0.18, z: -0.05 }, { x: 0, y: 0.22, z: 0.4 }, 0.025, f);
    cycle.rod({ x: 0, y: -0.18, z: -0.52 }, { x: 0, y: -0.18, z: -0.05 }, 0.02, f);
    cycle.rod({ x: 0, y: -0.18, z: 0.52 }, { x: 0, y: 0.45, z: 0.42 }, 0.025, f);
    cycle.rod({ x: -0.25, y: 0.48, z: 0.42 }, { x: 0.25, y: 0.48, z: 0.42 }, 0.02, palette.kerbBlack);
    cycle.box(0, 0.28, -0.1, 0.12, 0.05, 0.24, palette.kerbBlack);
    cycle.box(0, 0.18, -0.62, 0.22, 0.03, 0.3, 0x777777); // carrier
    const chair = new GeoBuilder();
    chair.box(0, 0.0, 0, 0.46, 0.05, 0.44, 0xffffff, { bottom: true });
    chair.box(0, 0.27, -0.21, 0.46, 0.5, 0.05, 0xffffff, { rx: -0.12, bottom: true });
    for (const [x, z] of [
      [0.2, 0.19],
      [-0.2, 0.19],
      [0.2, -0.19],
      [-0.2, -0.19],
    ] as const)
      chair.box(x, -0.22, z, 0.05, 0.44, 0.05, 0xffffff, { rx: z * 0.4, rz: -x * 0.4 });

    return {
      crate: { geo: crate.build(), rest: 0.31, collider: (R) => R.ColliderDesc.cuboid(0.31, 0.31, 0.31).setDensity(30) },
      matka: { geo: matka.build(), rest: 0.31, collider: (R) => R.ColliderDesc.cylinder(0.29, 0.3).setDensity(28) },
      cone: { geo: cone.build(), rest: 0.4, collider: (R) => R.ColliderDesc.cone(0.38, 0.24).setDensity(25) },
      bin: { geo: bin.build(), rest: 0.4, collider: (R) => R.ColliderDesc.cylinder(0.4, 0.3).setDensity(35), tint: [0x2f6db5, 0x3f9d57, 0x3f9d57] },
      cycle: { geo: cycle.build(), rest: 0.52, collider: (R) => R.ColliderDesc.cuboid(0.22, 0.35, 0.8).setTranslation(0, -0.15, 0).setDensity(28) },
      chair: { geo: chair.build(), rest: 0.45, collider: (R) => R.ColliderDesc.cuboid(0.24, 0.45, 0.23).setTranslation(0, -0.0, 0).setDensity(30), tint: [0xd23b3b, 0xf5f5f0, 0x2f6db5, 0xd23b3b] },
    };
  }

  dispose(): void {
    this.group.removeFromParent();
    this.disposables.forEach((d) => d.dispose());
  }
}
