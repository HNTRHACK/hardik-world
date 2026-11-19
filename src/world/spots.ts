import { CHOWK, normalOf, quadsOverlap, rectCorners, seaClearance, type Plot, type Road, type RoadNet } from './layout';
import type { Lot } from './Buildings';

export interface KerbSpot {
  x: number;
  z: number;
  /** Yaw that makes local +Z face the road. */
  yaw: number;
  /** Road tangent at the spot. */
  tx: number;
  tz: number;
}

/**
 * Finds places along footpaths and road edges and keeps a list of claimed
 * circles, so lamps, poles, trees, parked scooters and props never overlap
 * each other, the plots or the buildings.
 */
export class Spots {
  private readonly claimed: { x: number; z: number; r: number }[] = [];
  private readonly plotRects: [number, number][][];

  constructor(
    readonly net: RoadNet,
    plots: Plot[],
    private readonly lots: Lot[],
  ) {
    this.plotRects = plots.map((p) => rectCorners(p.x, p.z, p.w, p.d, p.yaw, 0.6));
  }

  /**
   * A point `fromKerb` metres outward from the kerb (negative = on the road),
   * or null if it lands on another road, a gap in the footpath, a plot, a building or the sea.
   */
  kerb(road: Road, s: number, side: 1 | -1, fromKerb: number, radius = 0.5): KerbSpot | null {
    const p = road.at(Math.min(1, Math.max(0, s / road.length)));
    const n = normalOf(p, side);
    const off = road.def.halfWidth + fromKerb;
    const x = p.x + n.x * off;
    const z = p.z + n.z * off;
    // Check the footpath strip itself exists here (same rule the footpath builder uses).
    const fx = p.x + n.x * (road.def.halfWidth + road.def.footpath / 2);
    const fz = p.z + n.z * (road.def.halfWidth + road.def.footpath / 2);
    if (this.net.clearance(fx, fz, road) < 0.6) return null;
    if (this.net.clearance(x, z, road) < radius + 0.3) return null;
    if (road.def.kind !== 'ring' && Math.hypot(x - CHOWK.x, z - CHOWK.z) < CHOWK.ringRadius + CHOWK.ringHalf + 1.5) return null;
    if (seaClearance(fx, fz) < 0.5) return null;
    if (!this.free(x, z, radius)) return null;
    return { x, z, yaw: Math.atan2(-n.x, -n.z), tx: p.tx, tz: p.tz };
  }

  free(x: number, z: number, r: number): boolean {
    for (const c of this.claimed) if (Math.hypot(c.x - x, c.z - z) < c.r + r) return false;
    const box = rectCorners(x, z, r * 2, r * 2, 0);
    for (const p of this.plotRects) if (quadsOverlap(box, p)) return false;
    for (const l of this.lots) {
      if (Math.abs(l.x - x) > 9 || Math.abs(l.z - z) > 9) continue;
      if (quadsOverlap(box, l.corners)) return false;
    }
    return true;
  }

  claim(x: number, z: number, r: number): void {
    this.claimed.push({ x, z, r });
  }
}
