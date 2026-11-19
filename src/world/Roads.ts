import * as THREE from 'three';
import type { Physics } from '../physics/Physics';
import { GeoBuilder } from './geo/GeoBuilder';
import { Rng } from './geo/rng';
import { CHOWK, PROMENADE_WIDTH, normalOf, seaClearance, seaX, type Road, type RoadNet } from './layout';
import { palette } from './palette';

const FOOT_Y = 0.14;
const ROAD_Y = 0.02;

export interface Spot {
  x: number;
  z: number;
  yaw: number;
}

/**
 * Asphalt, footpaths with Mumbai's black-and-yellow kerbs, the promenade,
 * markings, zebra crossings, potholes, patches and speed breakers.
 * Footpaths break automatically where another road crosses them.
 */
export class Roads {
  readonly group = new THREE.Group();
  /** Where potholes are (the props module rings some with cones). */
  readonly potholes: Spot[] = [];
  private readonly disposables: { dispose(): void }[] = [];

  constructor(
    scene: THREE.Scene,
    private readonly physics: Physics,
    private readonly net: RoadNet,
  ) {
    const rng = new Rng(311);
    const base = new GeoBuilder();
    const marks = new GeoBuilder();
    for (const road of net.roads) {
      this.asphalt(base, road, rng);
      for (const side of [1, -1] as const) {
        if (road.def.kind === 'ring' && side === 1) continue; // the ring's inner side is the island
        this.footpath(base, road, side);
      }
      if (road.def.dashes) this.dashes(marks, road);
    }
    this.promenade(base);
    this.island(base);
    this.zebras(marks);
    this.wear(marks, rng);
    this.speedBreakers(base);

    const baseMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, flatShading: true });
    const markMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.8,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    for (const [b, mat] of [
      [base, baseMat],
      [marks, markMat],
    ] as const) {
      const geo = b.build();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.receiveShadow = true;
      this.group.add(mesh);
      this.disposables.push(geo);
    }
    this.disposables.push(baseMat, markMat);
    scene.add(this.group);
  }

  private edge(road: Road, i: number, off: number, side: 1 | -1) {
    const s = road.samples[i]!;
    const n = normalOf(s, side);
    return { x: s.x + n.x * off, z: s.z + n.z * off };
  }

  private asphalt(g: GeoBuilder, road: Road, rng: Rng): void {
    const h = road.def.halfWidth;
    const base = new THREE.Color(road.def.kind === 'lane' ? palette.asphaltLane : palette.asphalt);
    const c = new THREE.Color();
    const y = ROAD_Y + (road.def.kind === 'main' ? 0 : road.def.kind === 'ring' ? 0.003 : 0.0015);
    for (let i = 0; i < road.samples.length - 1; i++) {
      const a = this.edge(road, i, h, -1);
      const b = this.edge(road, i, h, 1);
      const d = this.edge(road, i + 1, h, 1);
      const e = this.edge(road, i + 1, h, -1);
      c.copy(base).multiplyScalar(1 + rng.range(-0.035, 0.035));
      g.quad([{ x: a.x, y, z: a.z }, { x: b.x, y, z: b.z }, { x: d.x, y, z: d.z }, { x: e.x, y, z: e.z }], c, { x: 0, y: 1, z: 0 });
    }
  }

  /** True where a footpath piece would sit on other asphalt, the chowk or the promenade. */
  private blocked(road: Road, x: number, z: number): boolean {
    if (this.net.clearance(x, z, road) < 0.25) return true;
    if (road.def.kind !== 'ring' && Math.hypot(x - CHOWK.x, z - CHOWK.z) < CHOWK.ringRadius + CHOWK.ringHalf + 0.4) return true;
    return seaClearance(x, z) < 0.3;
  }

  private footpath(g: GeoBuilder, road: Road, side: 1 | -1): void {
    const h = road.def.halfWidth;
    const w = road.def.footpath;
    const tileA = new THREE.Color(palette.footpath);
    const tileB = new THREE.Color(palette.footpath).multiplyScalar(0.9);
    const kerbY = new THREE.Color(palette.kerbYellow);
    const kerbK = new THREE.Color(palette.kerbBlack);
    const R = this.physics.R;
    let run: number[] = [];
    const flush = () => {
      // one collider per continuous run of up to 4 segments
      for (let k = 0; k < run.length; k += 4) {
        const i0 = run[k]!;
        const i1 = Math.min(run[Math.min(k + 3, run.length - 1)]! + 1, road.samples.length - 1);
        const a = this.edge(road, i0, h + w / 2, side);
        const b = this.edge(road, i1, h + w / 2, side);
        const len = Math.hypot(b.x - a.x, b.z - a.z);
        const yaw = Math.atan2(b.x - a.x, b.z - a.z);
        this.physics.world.createCollider(
          R.ColliderDesc.cuboid(w / 2, FOOT_Y / 2, len / 2 + 0.05)
            .setTranslation((a.x + b.x) / 2, FOOT_Y / 2, (a.z + b.z) / 2)
            .setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) })
            .setFriction(0.9),
        );
      }
      run = [];
    };
    for (let i = 0; i < road.samples.length - 1; i++) {
      const i0 = this.edge(road, i, h, side);
      const o0 = this.edge(road, i, h + w, side);
      const i1 = this.edge(road, i + 1, h, side);
      const o1 = this.edge(road, i + 1, h + w, side);
      const mid = this.edge(road, i, h + w / 2, side);
      if (this.blocked(road, i0.x, i0.z) || this.blocked(road, o0.x, o0.z) || this.blocked(road, mid.x, mid.z)) {
        flush();
        continue;
      }
      run.push(i);
      const y = FOOT_Y;
      g.quad([{ x: i0.x, y, z: i0.z }, { x: o0.x, y, z: o0.z }, { x: o1.x, y, z: o1.z }, { x: i1.x, y, z: i1.z }], i % 2 ? tileA : tileB, { x: 0, y: 1, z: 0 });
      // kerb face toward the road, painted in alternating 1 m bands
      const n = normalOf(road.samples[i]!, side);
      g.quad([{ x: i0.x, y: 0, z: i0.z }, { x: i1.x, y: 0, z: i1.z }, { x: i1.x, y, z: i1.z }, { x: i0.x, y, z: i0.z }], i % 2 ? kerbY : kerbK, { x: -n.x, y: 0, z: -n.z });
    }
    flush();
  }

  private promenade(g: GeoBuilder): void {
    const a = new THREE.Color(palette.promenade);
    const b = new THREE.Color(palette.promenade).multiplyScalar(0.92);
    const kerb = new THREE.Color(palette.kerbBlack);
    const R = this.physics.R;
    const y = FOOT_Y;
    g.frame();
    for (let z = -110; z < 110; z += 1) {
      for (let k = 0; k < 3; k++) {
        const u0 = (k / 3) * PROMENADE_WIDTH;
        const u1 = ((k + 1) / 3) * PROMENADE_WIDTH;
        const p = (zz: number, u: number) => ({ x: seaX(zz) + u, y, z: zz });
        g.quad([p(z, u0), p(z + 1, u0), p(z + 1, u1), p(z, u1)], (z + k) % 2 ? a : b, { x: 0, y: 1, z: 0 });
      }
      const x0 = seaX(z) + PROMENADE_WIDTH;
      const x1 = seaX(z + 1) + PROMENADE_WIDTH;
      g.quad([{ x: x0, y: 0, z }, { x: x1, y: 0, z: z + 1 }, { x: x1, y, z: z + 1 }, { x: x0, y, z }], kerb, { x: 1, y: 0, z: 0 });
    }
    for (let z = -110; z < 110; z += 4) {
      const x0 = seaX(z) + PROMENADE_WIDTH / 2;
      const x1 = seaX(z + 4) + PROMENADE_WIDTH / 2;
      const yaw = Math.atan2(x1 - x0, 4);
      this.physics.world.createCollider(
        R.ColliderDesc.cuboid(PROMENADE_WIDTH / 2, y / 2, 2.05)
          .setTranslation((x0 + x1) / 2, y / 2, z + 2)
          .setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }),
      );
    }
  }

  /** The chowk island: a low painted kerb ring around a paved disc (the peepal's katta sits on it). */
  private island(g: GeoBuilder): void {
    const r = CHOWK.island;
    const seg = 28;
    const top = new THREE.Color(palette.footpath).multiplyScalar(0.95);
    const kY = new THREE.Color(palette.kerbYellow);
    const kK = new THREE.Color(palette.kerbBlack);
    g.frame(CHOWK.x, 0, CHOWK.z);
    const y = 0.2;
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2;
      const a1 = ((i + 1) / seg) * Math.PI * 2;
      const P = (a: number, rr: number, yy: number) => ({ x: Math.cos(a) * rr, y: yy, z: Math.sin(a) * rr });
      g.tri(P(0, 0, y), P(a1, r, y), P(a0, r, y), top);
      g.quad([P(a0, r, 0), P(a0, r, y), P(a1, r, y), P(a1, r, 0)], i % 2 ? kY : kK, { x: Math.cos(a0), y: 0, z: Math.sin(a0) });
    }
    this.physics.world.createCollider(this.physics.R.ColliderDesc.cylinder(y / 2, r).setTranslation(CHOWK.x, y / 2, CHOWK.z));
  }

  private dashes(g: GeoBuilder, road: Road): void {
    const white = new THREE.Color(palette.marking);
    const y = ROAD_Y + 0.01;
    g.frame();
    for (let i = 0; i < road.samples.length - 3; i += 5) {
      const a = road.samples[i]!;
      const b = road.samples[i + 2]!;
      if (this.net.clearance(a.x, a.z, road) < 0.5 || this.net.clearance(b.x, b.z, road) < 0.5) continue;
      const na = normalOf(a, 1);
      const nb = normalOf(b, 1);
      const w = 0.08;
      g.quad(
        [
          { x: a.x - na.x * w, y, z: a.z - na.z * w },
          { x: a.x + na.x * w, y, z: a.z + na.z * w },
          { x: b.x + nb.x * w, y, z: b.z + nb.z * w },
          { x: b.x - nb.x * w, y, z: b.z - nb.z * w },
        ],
        white,
        { x: 0, y: 1, z: 0 },
      );
    }
  }

  /** Zebra crossings where the spokes and the lane meet the chowk, plus two on the loop. */
  private zebras(g: GeoBuilder): void {
    const white = new THREE.Color(palette.marking);
    const spots: [string, number][] = [
      ['west', 5],
      ['east', 5],
      ['lane', 4.5],
      ['loop', 44],
      ['loop', 190],
    ];
    for (const [id, s] of spots) {
      const road = this.net.get(id);
      const i = Math.min(road.samples.length - 1, Math.round(s));
      const p = road.samples[i]!;
      const h = road.def.halfWidth - 0.3;
      const yaw = Math.atan2(p.tx, p.tz); // local +Z along the road
      g.frame(p.x, ROAD_Y + 0.01, p.z, yaw);
      for (let x = -h + 0.25; x <= h - 0.25; x += 0.9) {
        g.quad([{ x: x - 0.25, y: 0, z: -1.4 }, { x: x + 0.25, y: 0, z: -1.4 }, { x: x + 0.25, y: 0, z: 1.4 }, { x: x - 0.25, y: 0, z: 1.4 }], white, { x: 0, y: 1, z: 0 });
      }
    }
    g.frame();
  }

  /** Potholes and tar patches: the honest wear of a Mumbai road. */
  private wear(g: GeoBuilder, rng: Rng): void {
    const hole = new THREE.Color(palette.pothole);
    const rim = new THREE.Color(palette.asphalt).multiplyScalar(0.8);
    const patch = new THREE.Color(palette.asphalt).multiplyScalar(0.78);
    const candidates = this.net.roads.filter((r) => r.def.kind !== 'ring');
    let holes = 0;
    let patches = 0;
    let guard = 0;
    while ((holes < 9 || patches < 8) && guard++ < 400) {
      const road = rng.pick(candidates);
      const s = road.at(rng.next());
      const off = rng.range(-road.def.halfWidth + 1, road.def.halfWidth - 1);
      const n = normalOf(s, 1);
      const x = s.x + n.x * off;
      const z = s.z + n.z * off;
      if (this.net.clearance(x, z, road) < 1.5 || Math.hypot(x, z) < 14) continue;
      const yaw = rng.range(0, Math.PI);
      g.frame(x, ROAD_Y + 0.008, z, yaw);
      if (holes < 9) {
        holes++;
        const seg = 9;
        const rx = rng.range(0.35, 0.7);
        const rz = rng.range(0.3, 0.55);
        const radii = Array.from({ length: seg }, () => rng.range(0.75, 1.1));
        for (let k = 0; k < seg; k++) {
          const a0 = (k / seg) * Math.PI * 2;
          const a1 = ((k + 1) / seg) * Math.PI * 2;
          const r0 = radii[k]!;
          const r1 = radii[(k + 1) % seg]!;
          const P = (a: number, r: number, sc: number) => ({ x: Math.cos(a) * rx * r * sc, y: 0, z: Math.sin(a) * rz * r * sc });
          g.quad([P(a0, r0, 1.25), P(a0, r0, 1), P(a1, r1, 1), P(a1, r1, 1.25)], rim, { x: 0, y: 1, z: 0 });
          g.tri({ x: 0, y: -0.001, z: 0 }, P(a1, r1, 1), P(a0, r0, 1), hole);
        }
        this.potholes.push({ x, z, yaw });
      } else {
        patches++;
        const w = rng.range(1.2, 2.6);
        const d = rng.range(0.9, 2);
        g.quad([{ x: -w / 2, y: 0, z: -d / 2 }, { x: w / 2, y: 0, z: -d / 2 }, { x: w / 2, y: 0, z: d / 2 }, { x: -w / 2, y: 0, z: d / 2 }], patch, { x: 0, y: 1, z: 0 });
      }
    }
    g.frame();
  }

  /** Yellow-and-black humps across the road; the vehicle actually bumps over them. */
  private speedBreakers(g: GeoBuilder): void {
    const R = this.physics.R;
    const yellow = new THREE.Color(palette.kerbYellow);
    const black = new THREE.Color(palette.kerbBlack);
    const spots: [string, number][] = [
      ['loop', 30],
      ['loop', 150],
      ['loop', 250],
      ['lane', 30],
      ['east', 24],
    ];
    for (const [id, s] of spots) {
      const road = this.net.get(id);
      const p = road.samples[Math.min(road.samples.length - 1, s)]!;
      const yaw = Math.atan2(p.tx, p.tz);
      const h = road.def.halfWidth;
      g.frame(p.x, ROAD_Y, p.z, yaw);
      const stripes = Math.round((h * 2) / 0.6);
      const sw = (h * 2) / stripes;
      for (let k = 0; k < stripes; k++) {
        const x = -h + sw * (k + 0.5);
        g.gable(x, 0, 0, sw + 0.002, 0.9, 0.1, k % 2 ? yellow : black, k % 2 ? yellow : black);
      }
      // Collider: a fat cylinder lying across the road, mostly buried.
      const axis = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)); // local +X in world
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
      this.physics.world.createCollider(
        R.ColliderDesc.cylinder(h, 0.5)
          .setTranslation(p.x, ROAD_Y + 0.1 - 0.5, p.z)
          .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }),
      );
    }
    g.frame();
  }

  dispose(): void {
    this.group.removeFromParent();
    this.disposables.forEach((d) => d.dispose());
  }
}
