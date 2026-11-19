import * as THREE from 'three';
import type { Spawn } from '../vehicle/RickshawPhysics';

/*
 * The neighbourhood plan (top view: +X east, +Z south, sea to the west).
 *
 *            side lane (gali) ──┐
 *    sea │ promenade │  main loop road curves round the whole block
 *        │           │──── west spoke ──( chowk )── east spoke ────│
 *
 * Everything else (buildings, footpaths, poles, props) is derived from these
 * curves, so moving a control point re-flows the whole street.
 */

/** Sea wall line: a gentle "Queen's Necklace" arc. */
export const seaX = (z: number): number => -48 + 0.0024 * z * z;
export const PROMENADE_WIDTH = 6.3;
export const CHOWK = { x: 0, z: 0, island: 4.5, ringRadius: 7.75, ringHalf: 3.25 } as const;

export type RoadKind = 'main' | 'spoke' | 'lane' | 'ring';
export interface RoadDef {
  id: string;
  kind: RoadKind;
  halfWidth: number;
  footpath: number;
  closed: boolean;
  points: [number, number][];
  /** Dashed centre line. */
  dashes: boolean;
}

const westSide: [number, number][] = [-40, -30, -20, -10, 0, 10, 20, 30, 40].map((z) => [seaX(z) + 11, z]);

export const ROADS: RoadDef[] = [
  {
    id: 'loop',
    kind: 'main',
    halfWidth: 4.5,
    footpath: 2.6,
    closed: true,
    dashes: true,
    points: [...westSide, [-24, 56], [-4, 63], [18, 60], [36, 48], [46, 26], [48, 6], [45, -18], [36, -42], [18, -58], [-4, -63], [-22, -55]],
  },
  {
    id: 'ring',
    kind: 'ring',
    halfWidth: CHOWK.ringHalf,
    footpath: 2.2,
    closed: true,
    dashes: false,
    points: Array.from({ length: 16 }, (_, i) => {
      const a = (i / 16) * Math.PI * 2;
      return [CHOWK.x + Math.cos(a) * CHOWK.ringRadius, CHOWK.z + Math.sin(a) * CHOWK.ringRadius] as [number, number];
    }),
  },
  { id: 'west', kind: 'spoke', halfWidth: 3.5, footpath: 2.2, closed: false, dashes: true, points: [[-10.4, 0], [-18, 1.2], [-27, 0.8], [-36.6, 0]] },
  { id: 'east', kind: 'spoke', halfWidth: 3.5, footpath: 2.2, closed: false, dashes: true, points: [[10.4, 0], [20, 2.5], [32, 4.5], [47.4, 6]] },
  { id: 'lane', kind: 'lane', halfWidth: 2.6, footpath: 1.4, closed: false, dashes: false, points: [[0, -10.4], [-3, -20], [-1, -32], [4, -44], [2, -61.2]] },
];

export interface Sample {
  x: number;
  z: number;
  /** Unit tangent. */
  tx: number;
  tz: number;
  /** Arc length from the start. */
  s: number;
}

/** A road as a dense polyline (≈1 m spacing) plus its definition. */
export class Road {
  readonly samples: Sample[] = [];
  readonly length: number;
  readonly curve: THREE.CatmullRomCurve3;

  constructor(readonly def: RoadDef) {
    this.curve = new THREE.CatmullRomCurve3(
      def.points.map(([x, z]) => new THREE.Vector3(x, 0, z)),
      def.closed,
      'centripetal',
    );
    this.length = this.curve.getLength();
    const n = Math.max(2, Math.ceil(this.length));
    const pts = this.curve.getSpacedPoints(n);
    for (let i = 0; i <= n; i++) {
      const p = pts[i]!;
      const t = this.curve.getTangentAt(Math.min(i / n, 1));
      const len = Math.hypot(t.x, t.z) || 1;
      this.samples.push({ x: p.x, z: p.z, tx: t.x / len, tz: t.z / len, s: (i / n) * this.length });
    }
  }

  /** Point + tangent at a fraction 0…1 of the length. */
  at(f: number): Sample {
    const i = Math.min(this.samples.length - 1, Math.max(0, Math.round(f * (this.samples.length - 1))));
    return this.samples[i]!;
  }
}

/** Normal of a sample: side +1 = right of the direction of travel, −1 = left (India keeps left). */
export const normalOf = (s: Sample, side: 1 | -1) => ({ x: -s.tz * side, z: s.tx * side });

/** Spatial index over all road segments for "how far am I from asphalt?" queries. */
export class RoadNet {
  readonly roads: Road[];
  private readonly cell = 4;
  private readonly grid = new Map<number, [number, number][]>();

  constructor(defs: RoadDef[] = ROADS) {
    this.roads = defs.map((d) => new Road(d));
    this.roads.forEach((r, ri) => {
      for (let i = 0; i < r.samples.length - 1; i++) {
        const a = r.samples[i]!;
        const b = r.samples[i + 1]!;
        const pad = r.def.halfWidth + r.def.footpath + 4;
        const x0 = Math.floor((Math.min(a.x, b.x) - pad) / this.cell);
        const x1 = Math.floor((Math.max(a.x, b.x) + pad) / this.cell);
        const z0 = Math.floor((Math.min(a.z, b.z) - pad) / this.cell);
        const z1 = Math.floor((Math.max(a.z, b.z) + pad) / this.cell);
        for (let gx = x0; gx <= x1; gx++)
          for (let gz = z0; gz <= z1; gz++) {
            const k = this.key(gx, gz);
            let list = this.grid.get(k);
            if (!list) this.grid.set(k, (list = []));
            list.push([ri, i]);
          }
      }
    });
  }

  private key(gx: number, gz: number): number {
    return (gx + 1000) * 4096 + (gz + 1000);
  }

  get(id: string): Road {
    return this.roads.find((r) => r.def.id === id)!;
  }

  /**
   * Distance from (x,z) to the nearest asphalt edge (negative = on the road).
   * Only roads within ~footpath+4 m are indexed per cell; beyond that returns `far`.
   */
  clearance(x: number, z: number, exclude?: Road, far = 99): number {
    const list = this.grid.get(this.key(Math.floor(x / this.cell), Math.floor(z / this.cell)));
    let best = far;
    if (!list) return best;
    for (const [ri, si] of list) {
      const r = this.roads[ri]!;
      if (r === exclude) continue;
      const d = this.segDist(r, si, x, z) - r.def.halfWidth;
      if (d < best) best = d;
    }
    return best;
  }

  /** Clearance to the nearest *footpath* edge (≥ 0 means off both road and footpath). */
  footClearance(x: number, z: number, exclude?: Road): number {
    const list = this.grid.get(this.key(Math.floor(x / this.cell), Math.floor(z / this.cell)));
    let best = 99;
    if (!list) return best;
    for (const [ri, si] of list) {
      const r = this.roads[ri]!;
      if (r === exclude) continue;
      const d = this.segDist(r, si, x, z) - r.def.halfWidth - r.def.footpath;
      if (d < best) best = d;
    }
    return best;
  }

  private segDist(r: Road, i: number, x: number, z: number): number {
    const a = r.samples[i]!;
    const b = r.samples[i + 1]!;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / l2));
    return Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t));
  }
}

/** Inside the sea / on the promenade? */
export const seaClearance = (x: number, z: number) => x - (seaX(z) + PROMENADE_WIDTH);

// ── Plots ───────────────────────────────────────────────────────────────

export interface Plot {
  id: string;
  /** What will stand here (milestone 4/5). */
  label: string;
  milestone: 4 | 5;
  x: number;
  z: number;
  w: number;
  d: number;
  /** Yaw so that local +Z faces the road. */
  yaw: number;
}

interface PlotDef {
  id: string;
  label: string;
  milestone: 4 | 5;
  road: string;
  at: number;
  side: 1 | -1;
  w: number;
  d: number;
}

const PLOT_DEFS: PlotDef[] = [
  { id: 'chaipay', label: 'Chai stall · ChaiPay', milestone: 4, road: 'west', at: 0.42, side: 1, w: 8, d: 6 },
  { id: 'orion', label: 'Traffic signal · ORION', milestone: 4, road: 'east', at: 0.8, side: -1, w: 7, d: 6 },
  { id: 'omen', label: 'Courier depot · OMEN', milestone: 4, road: 'loop', at: 0.4, side: -1, w: 11, d: 8 },
  { id: 'clinic', label: 'Clinic · Federated Clinical Platform', milestone: 4, road: 'lane', at: 0.52, side: -1, w: 10, d: 8 },
  { id: 'umang', label: 'Job board · UMANG', milestone: 4, road: 'east', at: 0.38, side: 1, w: 7, d: 5 },
  { id: 'about', label: 'About billboard', milestone: 5, road: 'west', at: 0.72, side: -1, w: 9, d: 3 },
  { id: 'contact', label: 'Contact post box', milestone: 5, road: 'east', at: 0.14, side: -1, w: 3, d: 2.5 },
  { id: 'wins', label: 'Wins wall', milestone: 5, road: 'loop', at: 0.71, side: -1, w: 14, d: 3 },
];

export function makePlots(net: RoadNet): Plot[] {
  const plots = PLOT_DEFS.map((p): Plot => {
    const road = net.get(p.road);
    const s = road.at(p.at);
    const n = normalOf(s, p.side);
    const off = road.def.halfWidth + road.def.footpath + 0.6 + p.d / 2;
    const x = s.x + n.x * off;
    const z = s.z + n.z * off;
    // Face the road: local +Z points back along -n.
    return { id: p.id, label: p.label, milestone: p.milestone, x, z, w: p.w, d: p.d, yaw: Math.atan2(-n.x, -n.z) };
  });
  // The stock kiosk lives on the sea-facing promenade.
  const kz = -16;
  plots.push({ id: 'cobrakai', label: 'Stock kiosk · COBRA KAI', milestone: 4, x: seaX(kz) + 3.3, z: kz, w: 3.6, d: 3.6, yaw: Math.PI / 2 });
  return plots;
}

/** Corners of an oriented rectangle (centre, size, yaw). */
export function rectCorners(x: number, z: number, w: number, d: number, yaw: number, pad = 0): [number, number][] {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const hw = w / 2 + pad;
  const hd = d / 2 + pad;
  return [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd],
  ].map(([lx, lz]) => [x + lx! * c + lz! * s, z - lx! * s + lz! * c] as [number, number]);
}

/** Separating-axis overlap test for two convex quads. */
export function quadsOverlap(a: [number, number][], b: [number, number][]): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < 4; i++) {
      const p = poly[i]!;
      const q = poly[(i + 1) % 4]!;
      const nx = q[1] - p[1];
      const nz = p[0] - q[0];
      let aMin = Infinity, aMax = -Infinity, bMin = Infinity, bMax = -Infinity;
      for (const v of a) {
        const d = v[0] * nx + v[1] * nz;
        aMin = Math.min(aMin, d);
        aMax = Math.max(aMax, d);
      }
      for (const v of b) {
        const d = v[0] * nx + v[1] * nz;
        bMin = Math.min(bMin, d);
        bMax = Math.max(bMax, d);
      }
      if (aMax < bMin || bMax < aMin) return false;
    }
  }
  return true;
}

/** Start on the west spoke, nose to the sea. */
export function makeSpawn(net: RoadNet): Spawn {
  const s = net.get('west').at(0.58);
  return { x: s.x + s.tz * 1.6, z: s.z - s.tx * 1.6, yaw: Math.atan2(-s.tx, -s.tz) };
}
