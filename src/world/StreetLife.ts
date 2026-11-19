import * as THREE from 'three';
import type { Physics } from '../physics/Physics';
import { GeoBuilder } from './geo/GeoBuilder';
import { Rng } from './geo/rng';
import { withOcclusion } from './geo/occlusion';
import { CHOWK, PROMENADE_WIDTH, seaX, type RoadNet } from './layout';
import type { Lot } from './Buildings';
import type { Spots } from './spots';
import { palette } from './palette';

type Placement = { x: number; y?: number; z: number; yaw: number; s?: number; color?: number };

/**
 * Static street furniture: lamp posts, electric poles with sagging wires,
 * the chowk's peepal tree on its katta, gulmohars, promenade palms, parked
 * scooters and fruit handcarts. Repeated things are InstancedMeshes.
 */
export class StreetLife {
  readonly group = new THREE.Group();
  private readonly disposables: { dispose(): void }[] = [];
  private readonly rng = new Rng(909);

  constructor(
    scene: THREE.Scene,
    private readonly physics: Physics,
    private readonly net: RoadNet,
    private readonly spots: Spots,
    lots: Lot[],
  ) {
    this.peepal();
    this.lamps();
    this.poles(lots);
    this.trees();
    this.scooters();
    this.handcarts();
    scene.add(this.group);
  }

  // ── helpers ──

  private instanced(b: GeoBuilder, list: Placement[], o: { shadow?: boolean; emissive?: number; tint?: boolean; occlude?: boolean } = {}): void {
    if (!list.length) return;
    const geo = b.build();
    const params: THREE.MeshStandardMaterialParameters = { vertexColors: true, roughness: 0.75, flatShading: true };
    if (o.emissive !== undefined) Object.assign(params, { emissive: o.emissive, emissiveIntensity: 1.1 });
    const raw = new THREE.MeshStandardMaterial(params);
    const mat = o.occlude ? withOcclusion(raw) : raw;
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const c = new THREE.Color();
    list.forEach((p, i) => {
      const s = p.s ?? 1;
      m.compose(new THREE.Vector3(p.x, p.y ?? 0, p.z), q.setFromAxisAngle(up, p.yaw), new THREE.Vector3(s, s, s));
      mesh.setMatrixAt(i, m);
      if (o.tint) mesh.setColorAt(i, c.set(p.color ?? 0xffffff));
    });
    mesh.castShadow = !!o.shadow;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    this.group.add(mesh);
    this.disposables.push(geo, mat);
  }

  private fixedCylinder(x: number, z: number, r: number, h: number): void {
    this.physics.world.createCollider(this.physics.R.ColliderDesc.cylinder(h / 2, r).setTranslation(x, h / 2, z));
  }

  private fixedBox(x: number, z: number, yaw: number, hx: number, hy: number, hz: number): void {
    this.physics.world.createCollider(
      this.physics.R.ColliderDesc.cuboid(hx, hy, hz)
        .setTranslation(x, hy, z)
        .setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }),
    );
  }

  private blobs(g: GeoBuilder, cx: number, cy: number, cz: number, n: number, spread: number, rMin: number, rMax: number, colors: number[]): void {
    const ico = new THREE.IcosahedronGeometry(1, 0);
    const rng = this.rng;
    for (let i = 0; i < n; i++) {
      const a = rng.range(0, Math.PI * 2);
      const d = Math.sqrt(rng.next()) * spread;
      const r = rng.range(rMin, rMax);
      g.shape(ico, rng.pick(colors), cx + Math.cos(a) * d, cy + rng.range(-0.6, 0.9) * (spread * 0.35), cz + Math.sin(a) * d, r, r * 0.8, r, {
        ry: rng.range(0, 3),
        jitter: () => rng.range(-0.12, 0.08),
      });
    }
    ico.dispose();
  }

  // ── the chowk's peepal on its katta ──

  private peepal(): void {
    const g = new GeoBuilder();
    g.frame(CHOWK.x, 0, CHOWK.z);
    g.cylinder(0, 0.47, 0, 3.0, 3.1, 0.55, 18, palette.katta, { capColor: palette.kattaTop });
    g.cylinder(0, 0.78, 0, 1.25, 1.3, 0.1, 14, palette.kerbYellow); // painted ring round the trunk
    const bark = palette.bark;
    g.cylinder(0, 2.6, 0, 0.5, 0.78, 4.2, 9, bark);
    // sacred threads tied round the trunk
    g.cylinder(0, 1.6, 0, 0.74, 0.74, 0.12, 9, palette.thread);
    g.cylinder(0, 1.85, 0, 0.72, 0.72, 0.08, 9, palette.kerbYellow);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.4;
      g.frame(CHOWK.x, 0, CHOWK.z, a);
      g.cylinder(0, 5.2, 1.3, 0.16, 0.36, 3.2, 6, bark, { rx: 0.55 });
      g.cylinder(0.6 * Math.sin(i), 0.9, 0.85, 0.06, 0.1, 1.2, 4, bark, { rx: -0.25 }); // root
    }
    g.frame(CHOWK.x, 0, CHOWK.z);
    this.blobs(g, 0, 8.0, 0, 18, 4.6, 1.7, 2.7, [palette.peepal1, palette.peepal2, palette.peepal3]);
    // tiny roadside shrine on the katta
    g.box(2.1, 1.15, 0.9, 0.7, 0.8, 0.6, palette.shrine);
    g.box(2.1, 1.65, 0.9, 0.8, 0.12, 0.7, palette.terracotta);
    g.box(2.1, 0.95, 1.21, 0.35, 0.4, 0.02, palette.marigold);
    const geo = g.build();
    const mat = withOcclusion(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true }));
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = mesh.receiveShadow = true;
    this.group.add(mesh);
    this.disposables.push(geo, mat);
    this.fixedCylinder(CHOWK.x, CHOWK.z, 3.05, 0.75);
    this.fixedCylinder(CHOWK.x, CHOWK.z, 0.8, 5);
    this.spots.claim(CHOWK.x, CHOWK.z, CHOWK.island + 0.5);
  }

  // ── lamps ──

  private lamps(): void {
    const posts: Placement[] = [];
    const tryAt = (id: string, step: number, sides: (1 | -1)[]) => {
      const road = this.net.get(id);
      let k = 0;
      for (let s = step / 2; s < road.length; s += step) {
        const side = sides[k++ % sides.length]!;
        const sp = this.spots.kerb(road, s, side, 0.45, 0.4);
        if (!sp) continue;
        posts.push({ x: sp.x, z: sp.z, yaw: sp.yaw });
        this.spots.claim(sp.x, sp.z, 1.2);
        this.fixedCylinder(sp.x, sp.z, 0.13, 3);
      }
    };
    tryAt('loop', 21, [1, -1]);
    tryAt('west', 14, [1, -1]);
    tryAt('east', 14, [-1, 1]);
    tryAt('ring', 12, [-1]);
    tryAt('lane', 15, [1, -1]);
    // Marine Drive's lamp row along the promenade, arms out over the walk.
    for (let z = -96; z <= 96; z += 16) {
      const x = seaX(z) + 0.95;
      posts.push({ x, z, yaw: Math.PI / 2 });
      this.spots.claim(x, z, 1.2);
      this.fixedCylinder(x, z, 0.13, 3);
    }

    const g = new GeoBuilder();
    g.box(0, 0.25, 0, 0.34, 0.5, 0.34, palette.lampPost);
    g.cylinder(0, 3.3, 0, 0.07, 0.11, 6.2, 7, palette.lampPost);
    g.rod({ x: 0, y: 6.2, z: 0 }, { x: 0, y: 6.45, z: 1.5 }, 0.05, palette.lampPost);
    g.box(0, 6.4, 1.6, 0.3, 0.14, 0.62, palette.lampPost);
    this.instanced(g, posts, { shadow: true });
    const glow = new GeoBuilder();
    glow.box(0, 6.31, 1.6, 0.24, 0.05, 0.5, palette.lampGlow, { bottom: true, skip: 4 });
    this.instanced(glow, posts, { emissive: palette.lampGlow });
  }

  // ── electric poles + wires ──

  private poles(lots: Lot[]): void {
    const rng = this.rng;
    const poles: Placement[] = [];
    const wires = new GeoBuilder();
    const wireColor = new THREE.Color(palette.wire);
    const arm = [-0.7, 0, 0.7];
    const attach = (p: Placement, i: number) => {
      const c = Math.cos(p.yaw);
      const s = Math.sin(p.yaw);
      // local x across the arm (arm runs along the road, i.e. local X)
      return new THREE.Vector3(p.x + arm[i]! * c, 7.45, p.z - arm[i]! * s);
    };
    const span = (a: THREE.Vector3, b: THREE.Vector3, sag: number) => {
      const seg = 8;
      let prev = a;
      for (let k = 1; k <= seg; k++) {
        const t = k / seg;
        const p = new THREE.Vector3().lerpVectors(a, b, t);
        p.y -= sag * 4 * t * (1 - t);
        wires.rod(prev, p, 0.022, wireColor);
        prev = p;
      }
    };
    const run = (id: string, step: number, side: 1 | -1) => {
      const road = this.net.get(id);
      let last: Placement | null = null;
      for (let s = 3; s < road.length; s += step) {
        const sp = this.spots.kerb(road, s, side, 0.25, 0.35);
        if (!sp) {
          last = null;
          continue;
        }
        // Arm runs along the road: yaw so local X follows the tangent.
        const p: Placement = { x: sp.x, z: sp.z, yaw: Math.atan2(-sp.tz, sp.tx) };
        poles.push(p);
        this.spots.claim(sp.x, sp.z, 1);
        this.fixedBox(sp.x, sp.z, p.yaw, 0.15, 3, 0.15);
        if (last && Math.hypot(last.x - p.x, last.z - p.z) < 34) {
          const d = Math.hypot(last.x - p.x, last.z - p.z);
          for (let i = 0; i < 3; i++) span(attach(last, i), attach(p, i), 0.35 + d * 0.022 + rng.range(0, 0.25));
        }
        // Drops to the nearest facades: Mumbai's famous tangle.
        for (let k = 0; k < 2; k++) {
          if (!rng.chance(0.55)) continue;
          let best: Lot | null = null;
          let bd = 18;
          for (const l of lots) {
            if (!l.front) continue;
            const fx = l.x + Math.sin(l.yaw) * (l.d / 2);
            const fz = l.z + Math.cos(l.yaw) * (l.d / 2);
            const dd = Math.hypot(fx - p.x, fz - p.z) + rng.range(0, 6);
            if (dd < bd) {
              bd = dd;
              best = l;
            }
          }
          if (!best) continue;
          const lat = rng.range(-best.w / 2 + 0.5, best.w / 2 - 0.5);
          const c = Math.cos(best.yaw);
          const s2 = Math.sin(best.yaw);
          const target = new THREE.Vector3(
            best.x + Math.sin(best.yaw) * (best.d / 2 + 0.05) + lat * c,
            Math.min(best.height - 1.2, rng.range(4.2, 6.2)),
            best.z + Math.cos(best.yaw) * (best.d / 2 + 0.05) - lat * s2,
          );
          span(attach(p, rng.int(0, 2)), target, 0.5 + rng.range(0, 0.6));
        }
        last = p;
      }
    };
    run('loop', 25, -1);
    run('west', 18, -1);
    run('east', 18, 1);
    run('lane', 16, 1);

    const g = new GeoBuilder();
    g.cylinder(0, 4, 0, 0.11, 0.17, 8, 6, palette.pole);
    g.box(0, 7.4, 0, 1.7, 0.12, 0.12, palette.pole);
    for (const x of arm) g.cylinder(x, 7.55, 0, 0.04, 0.05, 0.16, 5, palette.insulator);
    g.box(0, 5.6, 0.16, 0.36, 0.5, 0.2, palette.kerbBlack); // transformer box / meter
    this.instanced(g, poles, { shadow: true, occlude: true });
    const geo = wires.build();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 });
    const mesh = new THREE.Mesh(geo, mat);
    this.group.add(mesh);
    this.disposables.push(geo, mat);
  }

  // ── trees ──

  private trees(): void {
    const rng = this.rng;
    // Gulmohar: flame-orange canopy over the footpaths.
    const gul: Placement[] = [];
    const roads = ['loop', 'loop', 'west', 'east'];
    for (let i = 0; i < 120 && gul.length < 12; i++) {
      const road = this.net.get(rng.pick(roads));
      const sp = this.spots.kerb(road, rng.range(0, road.length), rng.chance(0.5) ? 1 : -1, road.def.footpath - 0.55, 0.5);
      if (!sp || gul.some((t) => Math.hypot(t.x - sp.x, t.z - sp.z) < 16)) continue;
      gul.push({ x: sp.x, z: sp.z, yaw: rng.range(0, 6), s: rng.range(0.85, 1.1) });
      this.spots.claim(sp.x, sp.z, 3);
      this.fixedCylinder(sp.x, sp.z, 0.3, 3);
    }
    const gg = new GeoBuilder();
    gg.cylinder(0, 1.8, 0, 0.2, 0.32, 3.6, 7, palette.bark);
    gg.cylinder(0.5, 3.9, 0.2, 0.08, 0.16, 1.8, 5, palette.bark, { rz: -0.6 });
    gg.cylinder(-0.4, 3.8, -0.3, 0.08, 0.16, 1.6, 5, palette.bark, { rz: 0.6, rx: 0.3 });
    this.blobs(gg, 0, 5.2, 0, 9, 2.4, 1.1, 1.7, [palette.gulmohar1, palette.gulmohar2, palette.gulmohar1, palette.peepal2]);
    this.instanced(gg, gul, { shadow: true, occlude: true });

    // Coconut palms leaning over the promenade.
    const palms: Placement[] = [];
    for (let z = -88; z <= 88; z += 16) {
      const zz = z + rng.range(-2, 2);
      const x = seaX(zz) + PROMENADE_WIDTH - 1.2;
      if (!this.spots.free(x, zz, 0.6)) continue;
      palms.push({ x, z: zz, yaw: rng.range(0, 6), s: rng.range(0.9, 1.15) });
      this.spots.claim(x, zz, 1);
      this.fixedCylinder(x, zz, 0.25, 3);
    }
    const pg = new GeoBuilder();
    let px = 0;
    let py = 0;
    for (let k = 0; k < 6; k++) {
      const lean = 0.05 + k * 0.05;
      pg.cylinder(px, py + 0.75, 0, 0.16, 0.2, 1.55, 6, k % 2 ? palette.palmTrunk : palette.bark, { rz: -lean });
      px += Math.sin(lean) * 1.5;
      py += Math.cos(lean) * 1.5;
    }
    for (let f = 0; f < 8; f++) {
      const a = (f / 8) * Math.PI * 2;
      pg.frame(px, py, 0, a);
      const droop = 0.35 + (f % 2) * 0.25;
      pg.box(0, -Math.sin(droop) * 1.3, Math.cos(droop) * 1.3, 0.55, 0.04, 2.7, f % 2 ? palette.palm1 : palette.palm2, { rx: droop, bottom: true });
    }
    pg.frame();
    pg.cylinder(px, py - 0.1, 0, 0.3, 0.3, 0.35, 6, palette.coconut);
    this.instanced(pg, palms, { shadow: true, occlude: true });
  }

  // ── parked scooters ──

  private scooters(): void {
    const rng = this.rng;
    const list: Placement[] = [];
    const colors = [0xd23b3b, 0xf5f5f0, 0x2b2b2b, 0x2f6db5, 0x9aa0a6, 0x6d1a36, 0xf2c230, 0x3f9d57];
    const roads = ['loop', 'loop', 'west', 'east', 'lane', 'ring'];
    for (let i = 0; i < 80 && list.length < 30; i++) {
      const road = this.net.get(rng.pick(roads));
      const side = road.def.kind === 'ring' ? -1 : rng.chance(0.5) ? 1 : -1;
      const s0 = rng.range(0, road.length);
      const n = rng.int(2, 5);
      const group: Placement[] = [];
      let ok = true;
      for (let k = 0; k < n && ok; k++) {
        const sp = this.spots.kerb(road, s0 + k * 0.85, side, -0.75, 0.45);
        if (!sp) ok = false;
        // nose out to the road, rear to the kerb, all at the same jaunty angle
        else group.push({ x: sp.x, z: sp.z, yaw: sp.yaw + 0.45, color: rng.pick(colors) });
      }
      if (!ok) continue;
      for (const p of group) {
        list.push(p);
        this.spots.claim(p.x, p.z, 0.45);
        this.fixedBox(p.x, p.z, p.yaw, 0.32, 0.5, 0.85);
      }
    }
    const g = new GeoBuilder();
    const body = 0xffffff; // tinted per instance
    const dark = 0x222222;
    g.cylinder(0, 0.22, 0.6, 0.22, 0.22, 0.1, 10, dark, { rz: Math.PI / 2 });
    g.cylinder(0, 0.22, -0.6, 0.22, 0.22, 0.1, 10, dark, { rz: Math.PI / 2 });
    g.box(0, 0.32, 0.05, 0.34, 0.08, 0.8, 0x555555); // floorboard
    g.box(0, 0.55, -0.45, 0.5, 0.5, 0.7, body); // rear body
    g.box(0, 0.86, -0.45, 0.34, 0.1, 0.72, dark); // seat
    g.box(0, 0.75, 0.58, 0.44, 0.85, 0.12, body, { rx: -0.25 }); // front shield
    g.cylinder(0, 1.2, 0.68, 0.025, 0.025, 0.62, 5, dark, { rz: Math.PI / 2 }); // handlebar
    g.box(0, 1.08, 0.72, 0.18, 0.12, 0.1, 0xfff1c8); // headlight
    this.instanced(g, list, { shadow: true, tint: true });
  }

  // ── fruit handcarts ──

  private handcarts(): void {
    const rng = this.rng;
    const list: Placement[] = [];
    const roads = ['west', 'east', 'loop', 'ring'];
    for (let i = 0; i < 60 && list.length < 5; i++) {
      const road = this.net.get(rng.pick(roads));
      const side = road.def.kind === 'ring' ? -1 : rng.chance(0.5) ? 1 : -1;
      const sp = this.spots.kerb(road, rng.range(0, road.length), side, -0.9, 1.1);
      if (!sp || list.some((c) => Math.hypot(c.x - sp.x, c.z - sp.z) < 22)) continue;
      const yaw = Math.atan2(sp.tx, sp.tz) + Math.PI / 2;
      list.push({ x: sp.x, z: sp.z, yaw });
      this.spots.claim(sp.x, sp.z, 1.4);
      this.fixedBox(sp.x, sp.z, yaw, 0.7, 0.6, 1.0);
    }
    const g = new GeoBuilder();
    g.box(0, 0.8, 0, 1.2, 0.1, 1.8, palette.cartWood);
    g.box(0, 0.92, 0.9, 1.2, 0.18, 0.06, palette.cartWood);
    g.box(0, 0.92, -0.9, 1.2, 0.18, 0.06, palette.cartWood);
    g.cylinder(0.68, 0.4, 0.2, 0.4, 0.4, 0.06, 10, palette.cartWood, { rz: Math.PI / 2 });
    g.cylinder(-0.68, 0.4, 0.2, 0.4, 0.4, 0.06, 10, palette.cartWood, { rz: Math.PI / 2 });
    g.box(0, 0.45, -0.85, 0.08, 0.7, 0.08, palette.cartWood);
    g.rod({ x: -0.4, y: 0.85, z: -0.9 }, { x: -0.4, y: 0.95, z: -1.7 }, 0.03, palette.cartWood);
    g.rod({ x: 0.4, y: 0.85, z: -0.9 }, { x: 0.4, y: 0.95, z: -1.7 }, 0.03, palette.cartWood);
    const fruit = [palette.banana, palette.orange, palette.apple, palette.guava];
    const ico = new THREE.IcosahedronGeometry(1, 0);
    for (let i = 0; i < 26; i++) {
      const r = rng.range(0.1, 0.15);
      g.shape(ico, fruit[i % 4]!, rng.range(-0.45, 0.45), 0.95 + rng.range(0, 0.18), rng.range(-0.75, 0.75), r, r, r);
    }
    ico.dispose();
    // umbrella
    g.cylinder(0.5, 1.5, 0.6, 0.02, 0.02, 1.4, 4, palette.kerbBlack);
    g.cylinder(0.5, 2.25, 0.6, 0.02, 1.1, 0.35, 8, palette.umbrella);
    this.instanced(g, list, { shadow: true });
  }

  dispose(): void {
    this.group.removeFromParent();
    this.disposables.forEach((d) => d.dispose());
  }
}
