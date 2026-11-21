import * as THREE from 'three';
import type { Physics } from '../physics/Physics';
import { GeoBuilder } from './geo/GeoBuilder';
import { Rng } from './geo/rng';
import { withOcclusion, withWind } from './geo/patches';
import { CHOWK, normalOf, quadsOverlap, rectCorners, seaClearance, type Plot, type RoadNet } from './layout';
import type { SignAtlas } from './Signs';
import { palette } from './palette';

export interface Lot {
  x: number;
  z: number;
  w: number;
  d: number;
  /** local +Z (the facade) faces the road */
  yaw: number;
  /** On a street frontage: gets a shop, signboard and full detail. */
  front: boolean;
  corners: [number, number][];
  height: number;
}

// Faded old-Bombay paint, chawl pastels and the odd loud shopfront.
const PAINTS = [0x9cc7c9, 0xe8b4a6, 0xf0d9a8, 0x8fb3d9, 0xd98f6a, 0xb7c98c, 0xe6e0d4, 0xc9a3c9, 0xf2c98a, 0x7fb0a8, 0xdcc7b0, 0xa9c4a0, 0xe9c46a, 0xf4a7a0];
const TRIMS = [0xf4ecdc, 0xfaf7f0, 0xe8dcc4];
const SHUTTERS = [0x7f8c8d, 0x5b7da8, 0x4f7d5b, 0x9b3d2e, 0x8a8f7a];
const WOOD = [0x2f6b4f, 0x2d5d8a, 0x7a4a2a, 0x3f6f6a];
const RAILS = [0x2b2b2b, 0x3b6e8f, 0xf4ecdc, 0x2f5f4a];
const CLOTHES = [0xd23b3b, 0xf2c230, 0x2f6db5, 0xe86fa0, 0x3f9d57, 0xf5f5f0, 0xf08a24, 0x7a4fa0, 0x26a3a3];
const GOODS = [0xf2a33a, 0xd23b3b, 0x3f9d57, 0x2f6db5, 0xf2c230, 0xf5f5f0, 0x8a5a3c];

const WARM = new THREE.Color(0xe6c49a);
const H0 = 3.4; // ground floor (shops are tall)
const HF = 3.0; // upper floors
const CHUNK = 50;

export function placeLots(net: RoadNet, plots: Plot[], rng: Rng): Lot[] {
  const lots: Lot[] = [];
  const blockers = plots.map((p) => rectCorners(p.x, p.z, p.w, p.d, p.yaw, 1.2));

  const fits = (x: number, z: number, w: number, d: number, yaw: number, roadGap: number): [number, number][] | null => {
    const corners = rectCorners(x, z, w, d, yaw);
    for (const [cx, cz] of corners) {
      if (Math.abs(cx) > 95 || Math.abs(cz) > 95) return null;
      if (seaClearance(cx, cz) < 1.5) return null;
      if (Math.hypot(cx - CHOWK.x, cz - CHOWK.z) < CHOWK.ringRadius + CHOWK.ringHalf + 2.8) return null;
    }
    // Sample the footprint: nothing may sit on a road or footpath.
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const nx = Math.ceil(w / 2.5) + 1;
    const nz = Math.ceil(d / 2.5) + 1;
    for (let i = 0; i < nx; i++)
      for (let j = 0; j < nz; j++) {
        const lx = -w / 2 + (w * i) / (nx - 1);
        const lz = -d / 2 + (d * j) / (nz - 1);
        if (net.footClearance(x + lx * c + lz * s, z - lx * s + lz * c) < roadGap) return null;
      }
    for (const b of blockers) if (quadsOverlap(corners, b)) return null;
    const r = Math.hypot(w, d) / 2;
    for (const l of lots) {
      if (Math.hypot(l.x - x, l.z - z) > r + Math.hypot(l.w, l.d) / 2) continue;
      if (quadsOverlap(corners, rectCorners(l.x, l.z, l.w - 0.1, l.d - 0.1, l.yaw))) return null;
    }
    return corners;
  };
  const add = (x: number, z: number, w: number, d: number, yaw: number, front: boolean, gap: number) => {
    const corners = fits(x, z, w, d, yaw, gap);
    if (!corners) return null;
    const lot: Lot = { x, z, w, d, yaw, front, corners, height: 0 };
    lots.push(lot);
    return lot;
  };

  // 1. Frontage along every road edge (main road first so it gets the best plots).
  const order = ['loop', 'west', 'east', 'ring', 'lane'];
  const fronts: Lot[] = [];
  for (const id of order) {
    const road = net.get(id);
    for (const side of [1, -1] as const) {
      if (road.def.kind === 'ring' && side === 1) continue;
      const setback = road.def.kind === 'lane' ? 0.2 : 0.45;
      let s = 0;
      while (s < road.length) {
        const w0 = rng.range(6.5, road.def.kind === 'lane' ? 10 : 12.5);
        const d = rng.range(8, 12);
        // On the inside of a curve a straight facade's corners swing into the kerb:
        // retry deeper (a small forecourt) and narrower before moving on.
        let lot: Lot | null = null;
        let w = w0;
        for (const [extra, scale] of [
          [0, 1],
          [0.9, 1],
          [0.6, 0.72],
          [2.0, 0.72],
          [2.2, 0.55],
        ] as const) {
          w = Math.max(5.5, w0 * scale);
          const p = road.at(Math.min(1, (s + w / 2) / road.length));
          const n = normalOf(p, side);
          const off = road.def.halfWidth + road.def.footpath + setback + extra + d / 2;
          lot = add(p.x + n.x * off, p.z + n.z * off, w, d, Math.atan2(-n.x, -n.z), true, 0.15);
          if (lot) break;
        }
        if (lot) {
          fronts.push(lot);
          s += w + rng.range(0.05, 1.1);
        } else s += 1.5;
      }
    }
  }
  // 2. A second row behind each frontage building.
  for (const f of fronts) {
    const d2 = rng.range(8, 12);
    const back = f.d / 2 + rng.range(0.8, 2.2) + d2 / 2;
    const fx = Math.sin(f.yaw);
    const fz = Math.cos(f.yaw);
    add(f.x - fx * back, f.z - fz * back, f.w + rng.range(-1, 1), d2, f.yaw, false, 1);
  }
  // 3. Fill what's left of the blocks, aligned to the nearest neighbour.
  for (let i = 0; i < 2500; i++) {
    const x = rng.range(-95, 95);
    const z = rng.range(-95, 95);
    if (net.footClearance(x, z) < 6 || seaClearance(x, z) < 6) continue;
    let near: Lot | null = null;
    let best = Infinity;
    for (const l of lots) {
      const dd = Math.hypot(l.x - x, l.z - z);
      if (dd < best) {
        best = dd;
        near = l;
      }
    }
    add(x, z, rng.range(7, 12), rng.range(8, 12), near?.yaw ?? 0, false, 1);
  }
  return lots;
}

/** Collects instance transforms for things that repeat on every roof and wall. */
interface Instances {
  tanks: THREE.Matrix4[];
  acs: THREE.Matrix4[];
}

export class Buildings {
  readonly group = new THREE.Group();
  readonly lots: Lot[];
  /** Exposed for the dusk controller: lit windows / shop interiors and signboards. */
  windowMaterial!: THREE.MeshStandardMaterial;
  signMaterial!: THREE.MeshStandardMaterial;
  private readonly disposables: { dispose(): void }[] = [];

  constructor(scene: THREE.Scene, physics: Physics, net: RoadNet, plots: Plot[], atlas: SignAtlas) {
    const rng = new Rng(2024);
    this.lots = placeLots(net, plots, rng);

    const chunks = new Map<string, { g: GeoBuilder; lit: GeoBuilder; signs: GeoBuilder }>();
    const inst: Instances = { tanks: [], acs: [] };
    let sign = 0;
    for (const lot of this.lots) {
      const key = `${Math.floor(lot.x / CHUNK)},${Math.floor(lot.z / CHUNK)}`;
      let c = chunks.get(key);
      if (!c) chunks.set(key, (c = { g: new GeoBuilder(), lit: new GeoBuilder(), signs: new GeoBuilder({ uv: true }) }));
      sign = this.build(lot, c.g, c.lit, c.signs, inst, rng, atlas, sign);
      physics.world.createCollider(
        physics.R.ColliderDesc.cuboid(lot.w / 2, lot.height / 2, lot.d / 2)
          .setTranslation(lot.x, lot.height / 2, lot.z)
          .setRotation({ x: 0, y: Math.sin(lot.yaw / 2), z: 0, w: Math.cos(lot.yaw / 2) }),
      );
    }

    const mat = withWind(withOcclusion(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0, flatShading: true })));
    const litMat = withOcclusion(
      new THREE.MeshStandardMaterial({ vertexColors: true, emissive: palette.windowGlow, emissiveIntensity: 0.9, roughness: 0.6, flatShading: true }),
    );
    const signMat = withOcclusion(
      new THREE.MeshStandardMaterial({ map: atlas.texture, emissiveMap: atlas.texture, emissive: 0xffffff, emissiveIntensity: 0.28, roughness: 0.65 }),
    );
    this.windowMaterial = litMat;
    this.signMaterial = signMat;
    this.disposables.push(mat, litMat, signMat);
    for (const c of chunks.values()) {
      for (const [b, m, shadow] of [
        [c.g, mat, true],
        [c.lit, litMat, false],
        [c.signs, signMat, false],
      ] as const) {
        if (!b.vertexCount) continue;
        const geo = b.build();
        const mesh = new THREE.Mesh(geo, m);
        mesh.castShadow = shadow;
        mesh.receiveShadow = true;
        this.group.add(mesh);
        this.disposables.push(geo);
      }
    }
    this.instanced(inst);
    scene.add(this.group);
  }

  private instanced(inst: Instances): void {
    // Black plastic water tank on a little stand: the skyline of every Mumbai roof.
    const tg = new GeoBuilder();
    const black = new THREE.Color(palette.tank);
    tg.cylinder(0, 0.85, 0, 0.62, 0.62, 1.1, 10, black, { capColor: palette.tankLid });
    tg.cylinder(0, 1.47, 0, 0.18, 0.5, 0.14, 10, black);
    for (const [x, z] of [
      [0.45, 0.45],
      [-0.45, 0.45],
      [0.45, -0.45],
      [-0.45, -0.45],
    ] as const)
      tg.box(x, 0.15, z, 0.08, 0.3, 0.08, palette.kerbBlack);
    tg.box(0, 0.3, 0, 1.2, 0.06, 1.2, palette.kerbBlack);
    // AC outdoor unit: cream box, dark fan grille.
    const ag = new GeoBuilder();
    ag.box(0, 0, 0, 0.85, 0.55, 0.36, palette.acBody);
    ag.cylinder(0.12, 0, 0.181, 0.2, 0.2, 0.01, 10, palette.acGrille, { rx: Math.PI / 2 });
    ag.box(0, -0.3, -0.05, 0.9, 0.04, 0.3, palette.kerbBlack);
    for (const [b, list, shadow] of [
      [tg, inst.tanks, true],
      [ag, inst.acs, false],
    ] as const) {
      const geo = b.build();
      const m = withOcclusion(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, flatShading: true }));
      const mesh = new THREE.InstancedMesh(geo, m, Math.max(1, list.length));
      list.forEach((mx, i) => mesh.setMatrixAt(i, mx));
      mesh.count = list.length;
      mesh.castShadow = shadow;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      this.group.add(mesh);
      this.disposables.push(geo, m);
    }
  }

  /** One building. Returns the next sign index. */
  private build(lot: Lot, g: GeoBuilder, lit: GeoBuilder, sg: GeoBuilder, inst: Instances, rng: Rng, atlas: SignAtlas, signIndex: number): number {
    const { w, d } = lot;
    const style = rng.pick(['chawl', 'bombay', 'bombay', 'shop', 'shop'] as const);
    let floors = rng.int(2, 4);
    if (style === 'chawl') floors = Math.max(3, floors);
    const H = H0 + (floors - 1) * HF;
    lot.height = H + 0.8;
    const detail = lot.front;
    const fz = d / 2;
    const frame = (b: GeoBuilder) => b.frame(lot.x, 0, lot.z, lot.yaw);
    frame(g);
    frame(lit);
    frame(sg);
    const world = new THREE.Matrix4().makeRotationY(lot.yaw).setPosition(lot.x, 0, lot.z);
    const place = (list: THREE.Matrix4[], x: number, y: number, z: number, ry = 0, s = 1) =>
      list.push(
        new THREE.Matrix4()
          .compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(s, s, s))
          .premultiply(world),
      );

    // One golden-hour family: every paint is pulled toward warm sand and slightly desaturated.
    const paint = new THREE.Color(rng.pick(PAINTS))
      .offsetHSL(rng.range(-0.015, 0.015), rng.range(-0.06, 0.02), rng.range(-0.05, 0.03))
      .lerp(WARM, 0.2)
      .offsetHSL(0, -0.06, 0);
    const trim = new THREE.Color(rng.pick(TRIMS));
    const rail = rng.pick(RAILS);
    const wood = rng.pick(WOOD);
    const glass = new THREE.Color(palette.glassDark);
    const start = g.vertexCount;

    // Body + floor bands
    g.box(0, H / 2, 0, w, H, d, paint);
    for (let f = 1; f < floors; f++) g.box(0, H0 + (f - 1) * HF, 0, w + 0.14, 0.18, d + 0.14, trim);

    const pitched = style === 'chawl' ? rng.chance(0.5) : style === 'bombay' ? rng.chance(0.25) : false;
    const gd = 1.3; // chawl gallery depth

    // ── Ground floor ──
    const shopfront = detail && (style !== 'chawl' || rng.chance(0.35));
    if (shopfront) {
      const nb = Math.max(1, Math.round(w / 3.3));
      const bw = w / nb;
      for (let b = 0; b < nb; b++) {
        const cx = -w / 2 + bw * (b + 0.5);
        const ow = bw - 0.5;
        const state = rng.next();
        const shutter = new THREE.Color(rng.pick(SHUTTERS));
        const shutterDark = shutter.clone().multiplyScalar(0.7);
        const interior = new THREE.Color(palette.shopInterior).offsetHSL(rng.range(-0.03, 0.03), 0, rng.range(-0.05, 0.05));
        if (state < 0.45) {
          lit.box(cx, 1.35, fz - 0.01, ow, 2.6, 0.04, interior);
          g.box(cx, 0.45, fz + 0.32, ow * 0.85, 0.9, 0.55, rng.pick(WOOD)); // counter
          for (let k = 0; k < 4; k++) {
            const gw = rng.range(0.25, 0.5);
            g.box(cx + rng.range(-ow / 2 + 0.3, ow / 2 - 0.3), 0.9 + gw / 2, fz + 0.3 + rng.range(-0.1, 0.1), gw, gw, gw, rng.pick(GOODS));
          }
        } else if (state < 0.65) {
          lit.box(cx, 0.7, fz - 0.01, ow, 1.3, 0.04, interior);
          g.box(cx, 2.0, fz + 0.04, ow, 1.3, 0.08, shutter);
        } else {
          g.box(cx, 1.35, fz + 0.04, ow, 2.6, 0.08, shutter);
          for (let k = 0; k < 7; k++) g.box(cx, 0.2 + k * 0.37, fz + 0.09, ow, 0.05, 0.02, shutterDark);
        }
        g.box(cx, 2.78, fz + 0.12, ow + 0.1, 0.22, 0.24, shutterDark); // shutter drum
        // Signboard: framed board + atlas-textured face, never stretched past 4.2:1
        const sw = Math.min(bw - 0.3, 3.6);
        const sh = THREE.MathUtils.clamp(sw / 4.2, 0.5, 0.8);
        g.box(cx, 3.08, fz + 0.08, sw + 0.12, sh + 0.12, 0.12, palette.signFrame);
        const zf = fz + 0.146;
        sg.quad(
          [
            { x: cx - sw / 2, y: 3.08 - sh / 2, z: zf },
            { x: cx + sw / 2, y: 3.08 - sh / 2, z: zf },
            { x: cx + sw / 2, y: 3.08 + sh / 2, z: zf },
            { x: cx - sw / 2, y: 3.08 + sh / 2, z: zf },
          ],
          0xffffff,
          { x: 0, y: 0, z: 1 },
          atlas.uv(signIndex++),
        );
        // Tarp / striped awning over some shops
        if (rng.chance(0.45)) {
          const tarp = rng.pick([palette.tarpBlue, palette.tarpBlue, palette.tarpOrange, palette.tarpGreen]);
          const x0 = cx - ow / 2 - 0.1;
          const x1 = cx + ow / 2 + 0.1;
          const P = [
            { x: x0, y: 2.62, z: fz + 0.05 },
            { x: x1, y: 2.62, z: fz + 0.05 },
            { x: x1, y: 2.25, z: fz + 1.3 },
            { x: x0, y: 2.25, z: fz + 1.3 },
          ] as const;
          g.quad(P, tarp, { x: 0, y: 1, z: 0.3 });
          g.quad(P, new THREE.Color(tarp).multiplyScalar(0.55), { x: 0, y: -1, z: -0.3 });
        }
      }
    } else {
      // Residential ground floor: plinth step, doors and barred windows.
      if (style === 'chawl') g.box(0, 0.2, fz + 0.6, w, 0.4, 1.2, trim.clone().multiplyScalar(0.8));
      const n = Math.max(1, Math.floor(w / 2.8));
      for (let i = 0; i < n; i++) {
        const x = -w / 2 + (w / n) * (i + 0.5);
        if (i % 2 === 0) g.box(x, 1.1, fz + 0.03, 0.95, 2.2, 0.06, wood);
        else this.window(g, lit, x, 1.6, fz, trim, glass, rng, detail ? 0.1 : 0.04);
      }
    }
    g.grime(start, 0, 3.4, 0.28);

    // ── Upper floors ──
    for (let f = 1; f < floors; f++) {
      const y0 = H0 + (f - 1) * HF;
      if (style === 'chawl') {
        // Continuous gallery with railing, doors to each room, laundry everywhere.
        g.box(0, y0 + 0.06, fz + gd / 2, w + 0.1, 0.12, gd, trim);
        for (let x = -w / 2 + 0.15; x <= w / 2 - 0.1; x += Math.max(2.4, w / Math.round(w / 3.4))) {
          g.box(x, y0 + HF / 2, fz + gd - 0.1, 0.18, HF, 0.18, trim);
        }
        g.box(w / 2 - 0.15, y0 + HF / 2, fz + gd - 0.1, 0.18, HF, 0.18, trim);
        g.box(0, y0 + 1.0, fz + gd - 0.04, w, 0.06, 0.06, rail);
        g.box(0, y0 + 0.5, fz + gd - 0.04, w, 0.04, 0.04, rail);
        if (detail) for (let x = -w / 2 + 0.2; x < w / 2; x += 0.36) g.box(x, y0 + 0.55, fz + gd - 0.04, 0.035, 0.9, 0.035, rail);
        const rooms = Math.max(2, Math.floor(w / 2.9));
        for (let i = 0; i < rooms; i++) {
          const x = -w / 2 + (w / rooms) * (i + 0.5);
          g.box(x - 0.55, y0 + 1.05, fz + 0.03, 0.85, 2.1, 0.06, wood);
          this.window(g, lit, x + 0.55, y0 + 1.5, fz, trim, glass, rng, 0.12, 0.7);
        }
        if (detail && rng.chance(0.65)) {
          const lz = fz + gd - 0.35;
          g.rod({ x: -w / 2 + 0.3, y: y0 + 2.25, z: lz }, { x: w / 2 - 0.3, y: y0 + 2.25, z: lz }, 0.012, 0x444444);
          for (let k = rng.int(3, 8); k > 0; k--) {
            const cw = rng.range(0.35, 0.75);
            const ch = rng.range(0.45, 0.85);
            const s0 = g.vertexCount;
            g.box(rng.range(-w / 2 + 0.6, w / 2 - 0.6), y0 + 2.25 - ch / 2, lz, cw, ch, 0.02, rng.pick(CLOTHES), { skip: 0 });
            g.markSway(s0, y0 + 2.25, ch);
          }
          for (let k = rng.int(0, 3); k > 0; k--) {
            const s0 = g.vertexCount;
            g.box(rng.range(-w / 2 + 0.6, w / 2 - 0.6), y0 + 0.78, fz + gd + 0.02, 0.6, 0.55, 0.03, rng.pick(CLOTHES));
            g.markSway(s0, y0 + 1.05, 1.6); // draped over the rail: a gentle stir
          }
        }
      } else {
        const nw = Math.max(1, Math.floor((w - 0.8) / 2.25));
        const sp = w / nw;
        const balconies = style === 'bombay' ? rng.chance(0.55) : rng.chance(0.25);
        for (let i = 0; i < nw; i++) {
          const x = -w / 2 + sp * (i + 0.5);
          this.window(g, lit, x, y0 + 1.55, fz, trim, glass, rng, 0.13, 1, style === 'bombay' && detail ? wood : undefined);
          g.box(x, y0 + 2.45, fz + 0.3, 1.5, 0.07, 0.6, trim); // chajja (sunshade)
          if (balconies && detail) {
            g.box(x, y0 + 0.08, fz + 0.45, 1.9, 0.12, 0.9, trim);
            g.box(x, y0 + 1.0, fz + 0.88, 1.9, 0.05, 0.05, rail);
            g.box(x - 0.93, y0 + 1.0, fz + 0.45, 0.05, 0.05, 0.9, rail);
            g.box(x + 0.93, y0 + 1.0, fz + 0.45, 0.05, 0.05, 0.9, rail);
            for (let k = 0; k < 7; k++) g.box(x - 0.85 + k * 0.283, y0 + 0.55, fz + 0.88, 0.03, 0.85, 0.03, rail);
            if (rng.chance(0.35)) g.box(x + rng.range(-0.5, 0.5), y0 + 0.75, fz + 0.92, 0.55, 0.6, 0.02, rng.pick(CLOTHES));
            if (rng.chance(0.4)) g.box(x + 0.6, y0 + 0.35, fz + 0.6, 0.28, 0.3, 0.28, palette.terracotta); // potted tulsi
          } else if (detail && rng.chance(0.4)) {
            place(inst.acs, x + (rng.chance(0.5) ? 0.4 : -0.4), y0 + 0.5, fz + 0.2);
          }
        }
      }
    }

    // ── Roof ──
    if (pitched) {
      const extra = style === 'chawl' ? gd : 0;
      g.gable(0, H, extra / 2, w + 0.5, d + extra + 0.5, 1.5, palette.roofTile, paint);
      if (rng.chance(0.3)) place(inst.tanks, rng.range(-w / 3, w / 3), H + 0.2, -d / 4, 0, 0.9);
    } else {
      if (style === 'chawl') g.box(0, H + 0.05, fz + gd / 2, w + 0.2, 0.1, gd + 0.1, trim);
      g.box(0, H + 0.01, 0, w - 0.25, 0.04, d - 0.25, palette.roofConcrete);
      const ph = style === 'bombay' ? 1.0 : 0.75;
      const pc = style === 'bombay' ? trim : paint;
      g.box(0, H + ph / 2, fz - 0.08, w, ph, 0.16, pc);
      g.box(0, H + ph / 2, -fz + 0.08, w, ph, 0.16, pc);
      g.box(w / 2 - 0.08, H + ph / 2, 0, 0.16, ph, d - 0.32, pc);
      g.box(-w / 2 + 0.08, H + ph / 2, 0, 0.16, ph, d - 0.32, pc);
      if (style === 'bombay') {
        for (const sx of [-1, 1])
          for (const sz of [-1, 1]) g.box(sx * (w / 2 - 0.2), H + 0.75, sz * (d / 2 - 0.2), 0.45, 1.5, 0.45, trim);
        g.box(0, H + 1.15, fz - 0.05, w * 0.4, 0.5, 0.22, trim); // name pediment
      }
      // Stair room (mumty) with a tank on top, more tanks on the slab.
      const mx = rng.range(-w / 2 + 1.4, w / 2 - 1.4);
      const mz = -d / 2 + 1.5;
      if (rng.chance(0.65)) {
        g.box(mx, H + 1.2, mz, 2.2, 2.4, 2.4, paint.clone().multiplyScalar(0.93));
        g.box(mx, H + 1.0, mz + 1.21, 0.8, 1.9, 0.04, wood);
        place(inst.tanks, mx, H + 2.4, mz, rng.range(0, 6));
      }
      for (let k = rng.int(0, 2); k > 0; k--) place(inst.tanks, rng.range(-w / 2 + 1, w / 2 - 1), H, rng.range(-d / 2 + 1.2, d / 2 - 1.5), rng.range(0, 6), rng.range(0.8, 1.1));
      if (rng.chance(0.25)) g.box(rng.range(-w / 4, w / 4), H + 0.1, rng.range(0, d / 4), rng.range(2, 3.5), 0.04, rng.range(1.8, 3), palette.tarpBlue, { rx: rng.range(-0.06, 0.06), ry: rng.range(-0.3, 0.3) });
      if (rng.chance(0.2)) {
        const z = rng.range(-1, d / 4);
        g.rod({ x: -w / 2 + 0.8, y: H + 1.6, z }, { x: w / 2 - 0.8, y: H + 1.6, z }, 0.012, 0x444444);
        for (let k = rng.int(2, 5); k > 0; k--) {
          const s0 = g.vertexCount;
          g.box(rng.range(-w / 2 + 1, w / 2 - 1), H + 1.3, z, rng.range(0.4, 0.8), 0.6, 0.02, rng.pick(CLOTHES), { skip: 0 });
          g.markSway(s0, H + 1.6, 0.6);
        }
      }
      if (rng.chance(0.15)) g.cylinder(rng.range(-w / 3, w / 3), H + 1.0, d / 2 - 1, 0.45, 0.05, 0.18, 8, palette.acBody, { rx: -0.9 });
    }

    // ── Back: the side the follow camera sees across the street ──
    if (detail) {
      for (let f = 0; f < floors; f++) {
        const y = (f === 0 ? 0 : H0 + (f - 1) * HF) + 1.6;
        for (const x of [-w / 4, w / 4]) g.box(x, y, -fz - 0.03, 0.8, 1.1, 0.06, f === 0 ? wood : palette.glassDark);
      }
      g.rod({ x: w / 2 - 0.4, y: 0, z: -fz - 0.12 }, { x: w / 2 - 0.4, y: H + 0.4, z: -fz - 0.12 }, 0.07, palette.pipe);
      if (w > 9) g.rod({ x: -w / 2 + 0.6, y: 0, z: -fz - 0.12 }, { x: -w / 2 + 0.6, y: H + 0.4, z: -fz - 0.12 }, 0.07, palette.pipe);
    }
    return signIndex;
  }

  /** Framed window, sometimes lit from inside, optionally with open wooden shutters. */
  private window(
    g: GeoBuilder,
    lit: GeoBuilder,
    x: number,
    y: number,
    fz: number,
    trim: THREE.Color,
    glass: THREE.Color,
    rng: Rng,
    litChance: number,
    scale = 1,
    shutters?: number,
  ): void {
    g.box(x, y, fz + 0.03, 1.12 * scale, 1.55, 0.08, trim);
    const target = rng.chance(litChance) ? lit : g;
    target.box(x, y, fz + 0.075, 0.88 * scale, 1.3, 0.03, rng.chance(0.5) ? glass : new THREE.Color(palette.glassDark).multiplyScalar(1.3));
    g.box(x, y, fz + 0.09, 0.03, 1.3, 0.02, trim); // mullion
    if (shutters !== undefined && rng.chance(0.7)) {
      g.box(x - 0.72 * scale, y, fz + 0.08, 0.32 * scale, 1.32, 0.04, shutters);
      g.box(x + 0.72 * scale, y, fz + 0.08, 0.32 * scale, 1.32, 0.04, shutters);
    }
  }

  dispose(): void {
    this.group.removeFromParent();
    this.disposables.forEach((d) => d.dispose());
  }
}
