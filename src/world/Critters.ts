import * as THREE from 'three';
import type { Physics } from '../physics/Physics';
import { GeoBuilder } from './geo/GeoBuilder';
import { Rng } from './geo/rng';
import { CHOWK, seaX, type RoadNet } from './layout';
import type { Spots } from './spots';
import { palette } from './palette';

interface Dog {
  root: THREE.Group;
  head: THREE.Object3D;
  tail: THREE.Object3D;
  phase: number;
  lying: boolean;
}

type PigeonState = 'idle' | 'flee' | 'circle' | 'land';
interface Pigeon {
  home: THREE.Vector3;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  yaw: number;
  state: PigeonState;
  t: number;
  phase: number;
  flock: number;
  /** where the landing leg started */
  from: THREE.Vector3;
}

const SCARE = 6.5;
const CALM = 14;

/**
 * A few street dogs (they lift their heads and track the rickshaw, tails
 * wagging) and two pigeon flocks that burst into the air when you drive
 * close, circle, then settle back once you've gone.
 */
export class Critters {
  readonly group = new THREE.Group();
  private readonly dogs: Dog[] = [];
  readonly pigeons: Pigeon[] = [];
  private readonly flockCentres: THREE.Vector3[] = [];
  private bodies!: THREE.InstancedMesh;
  private wingsL!: THREE.InstancedMesh;
  private wingsR!: THREE.InstancedMesh;
  private readonly disposables: { dispose(): void }[] = [];
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly s = new THREE.Vector3(1, 1, 1);
  private readonly tmp = new THREE.Vector3();

  constructor(scene: THREE.Scene, physics: Physics, net: RoadNet, spots: Spots) {
    const rng = new Rng(808);
    this.makeDogs(physics, net, spots, rng);
    this.makePigeons(spots, rng);
    scene.add(this.group);
  }

  // ── dogs ──

  private makeDogs(physics: Physics, net: RoadNet, spots: Spots, rng: Rng): void {
    const coats = [palette.dogTan, palette.dogTan, palette.dogBlack, palette.dogWhite];
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });
    this.disposables.push(mat);
    const spotsFor: { x: number; z: number; yaw: number }[] = [
      { x: CHOWK.x + 3.4, z: CHOWK.z - 3.0, yaw: 2.2 }, // on the island edge, under the peepal
    ];
    const roads = ['west', 'east', 'loop', 'lane'];
    for (let i = 0; i < 80 && spotsFor.length < 5; i++) {
      const road = net.get(rng.pick(roads));
      const sp = spots.kerb(road, rng.range(0, road.length), rng.chance(0.5) ? 1 : -1, road.def.footpath * 0.6, 0.6);
      if (!sp || spotsFor.some((d) => Math.hypot(d.x - sp.x, d.z - sp.z) < 25)) continue;
      spotsFor.push({ x: sp.x, z: sp.z, yaw: sp.yaw + rng.range(-1.2, 1.2) });
    }
    spotsFor.forEach((p, i) => {
      const coat = new THREE.Color(coats[i % coats.length]!);
      const belly = coat.clone().lerp(new THREE.Color(0xf3e6cf), 0.45);
      const lying = i % 2 === 0;
      const body = new GeoBuilder();
      const y0 = lying ? 0.2 : 0.42;
      body.box(0, y0, 0, 0.3, 0.26, 0.66, coat);
      body.box(0, y0 - 0.08, 0.02, 0.26, 0.12, 0.56, belly);
      if (lying) {
        for (const x of [-0.14, 0.14]) body.box(x, 0.06, 0.36, 0.08, 0.08, 0.3, coat);
      } else {
        for (const [x, z] of [
          [-0.1, 0.24],
          [0.1, 0.24],
          [-0.1, -0.24],
          [0.1, -0.24],
        ] as const)
          body.box(x, 0.16, z, 0.08, 0.34, 0.08, coat);
      }
      const head = new GeoBuilder();
      head.box(0, 0.05, 0.1, 0.22, 0.2, 0.24, coat);
      head.box(0, 0.0, 0.26, 0.12, 0.1, 0.14, belly); // snout
      head.box(0, 0.02, 0.335, 0.05, 0.04, 0.02, palette.kerbBlack); // nose
      head.box(-0.08, 0.18, 0.06, 0.06, 0.1, 0.04, coat, { rz: 0.3 });
      head.box(0.08, 0.18, 0.06, 0.06, 0.1, 0.04, coat, { rz: -0.3 });
      const tail = new GeoBuilder();
      tail.box(0, 0.12, -0.12, 0.05, 0.05, 0.28, coat, { rx: -0.7 });
      const root = new THREE.Group();
      const parts = [body, head, tail].map((b) => {
        const geo = b.build();
        this.disposables.push(geo);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        return mesh;
      });
      const bodyMesh = parts[0]!;
      const headMesh = parts[1]!;
      const tailMesh = parts[2]!;
      const headPivot = new THREE.Group();
      headPivot.position.set(0, lying ? 0.28 : 0.6, 0.33);
      headPivot.add(headMesh);
      const tailPivot = new THREE.Group();
      tailPivot.position.set(0, y0 + 0.05, -0.33);
      tailPivot.add(tailMesh);
      root.add(bodyMesh, headPivot, tailPivot);
      const onIsland = i === 0;
      root.position.set(p.x, onIsland ? 0.2 : 0.14, p.z);
      root.rotation.y = p.yaw;
      this.group.add(root);
      spots.claim(p.x, p.z, 0.8);
      physics.world.createCollider(physics.R.ColliderDesc.ball(0.32).setTranslation(p.x, 0.32, p.z));
      this.dogs.push({ root, head: headPivot, tail: tailPivot, phase: rng.range(0, 6), lying });
    });
  }

  // ── pigeons ──

  private makePigeons(spots: Spots, rng: Rng): void {
    // Flock 1 around the chowk island; flock 2 on the promenade.
    const centres = [new THREE.Vector3(CHOWK.x - 5.2, 0.2, CHOWK.z + 4.2), new THREE.Vector3(seaX(-30) + 3, 0.14, -30)];
    const counts = [26, 18];
    centres.forEach((c, f) => {
      this.flockCentres.push(c.clone());
      for (let i = 0; i < counts[f]!; i++) {
        const a = rng.range(0, Math.PI * 2);
        const r = Math.sqrt(rng.next()) * 2.6;
        const home = new THREE.Vector3(c.x + Math.cos(a) * r, c.y, c.z + Math.sin(a) * r);
        this.pigeons.push({ home, pos: home.clone(), vel: new THREE.Vector3(), yaw: rng.range(0, 6), state: 'idle', t: 0, phase: rng.range(0, 10), flock: f, from: home.clone() });
      }
      spots.claim(c.x, c.z, 2.8);
    });

    const body = new GeoBuilder();
    body.box(0, 0.09, 0, 0.11, 0.1, 0.22, palette.pigeon);
    body.box(0, 0.13, 0.12, 0.08, 0.08, 0.08, palette.pigeonHead);
    body.box(0, 0.12, 0.17, 0.02, 0.02, 0.03, palette.kerbBlack);
    body.box(0, 0.1, -0.15, 0.09, 0.03, 0.1, palette.pigeonHead);
    body.box(0, 0.1, 0.07, 0.115, 0.06, 0.04, palette.pigeonNeck);
    const wing = new GeoBuilder();
    wing.box(0.12, 0, -0.02, 0.24, 0.015, 0.14, palette.pigeon, { bottom: true });
    const wingGeo = wing.build();
    const bodyGeo = body.build();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, flatShading: true });
    const n = this.pigeons.length;
    this.bodies = new THREE.InstancedMesh(bodyGeo, mat, n);
    this.wingsL = new THREE.InstancedMesh(wingGeo, mat, n);
    this.wingsR = new THREE.InstancedMesh(wingGeo, mat, n);
    for (const im of [this.bodies, this.wingsL, this.wingsR]) {
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.frustumCulled = false;
      this.group.add(im);
    }
    this.bodies.castShadow = true;
    this.disposables.push(bodyGeo, wingGeo, mat);
  }

  update(elapsed: number, delta: number, rickshaw: THREE.Vector3): void {
    // Dogs: tails wag, heads turn to watch you when you're close.
    for (const d of this.dogs) {
      d.tail.rotation.y = Math.sin(elapsed * 9 + d.phase) * 0.6;
      const dist = d.root.position.distanceTo(rickshaw);
      let look = 0;
      if (dist < 11) {
        this.tmp.copy(rickshaw);
        d.root.worldToLocal(this.tmp);
        look = THREE.MathUtils.clamp(Math.atan2(this.tmp.x, this.tmp.z), -1.1, 1.1);
      }
      d.head.rotation.y += (look - d.head.rotation.y) * (1 - Math.exp(-5 * delta));
      d.head.rotation.x = d.lying && dist > 11 ? 0.25 : Math.sin(elapsed * 2 + d.phase) * 0.04;
    }

    // Pigeons: a tiny state machine per bird, the flock reacts together.
    const scared = this.flockCentres.map((c) => Math.hypot(c.x - rickshaw.x, c.z - rickshaw.z) < SCARE + 2.6);
    const calm = this.flockCentres.map((c) => Math.hypot(c.x - rickshaw.x, c.z - rickshaw.z) > CALM);
    this.pigeons.forEach((p, i) => {
      p.t += delta;
      const c = this.flockCentres[p.flock]!;
      let flap = 0;
      let pitch = 0;
      switch (p.state) {
        case 'idle': {
          // peck, shuffle, turn
          pitch = Math.max(0, Math.sin(elapsed * 5 + p.phase * 3)) > 0.7 ? 0.6 : 0;
          if (Math.sin(elapsed * 0.7 + p.phase) > 0.995) p.yaw += 0.8;
          if (scared[p.flock] && p.pos.distanceTo(rickshaw) < SCARE + 1.5 + (p.phase % 2)) this.go(p, 'flee');
          else if (scared[p.flock] && p.t > 0.2 && this.pigeons.some((o) => o.flock === p.flock && o.state === 'flee')) this.go(p, 'flee');
          break;
        }
        case 'flee': {
          if (p.t < 0.05) {
            this.tmp.subVectors(p.pos, rickshaw).setY(0).normalize();
            p.vel.set(this.tmp.x * 4 + Math.sin(p.phase) * 1.2, 5.5 + (p.phase % 1.5), this.tmp.z * 4 + Math.cos(p.phase) * 1.2);
          }
          p.vel.y *= 1 - 0.6 * delta;
          p.pos.addScaledVector(p.vel, delta);
          flap = 1;
          pitch = -0.4;
          p.yaw = Math.atan2(p.vel.x, p.vel.z);
          if (p.t > 2.2) this.go(p, 'circle');
          break;
        }
        case 'circle': {
          const ang = elapsed * 0.6 + p.phase;
          const target = this.tmp.set(c.x + Math.cos(ang) * (7 + (p.phase % 3)), 11 + Math.sin(elapsed + p.phase) * 1.5, c.z + Math.sin(ang) * (7 + (p.phase % 3)));
          p.vel.lerp(target.sub(p.pos).multiplyScalar(0.9), 1 - Math.exp(-2 * delta));
          p.pos.addScaledVector(p.vel, delta);
          p.yaw = Math.atan2(p.vel.x, p.vel.z);
          flap = 0.6 + 0.4 * Math.sin(elapsed * 2 + p.phase);
          if (p.t > 6 && calm[p.flock]) {
            p.from.copy(p.pos);
            this.go(p, 'land');
          }
          break;
        }
        case 'land': {
          const k = Math.min(p.t / 3, 1);
          const e = 1 - Math.pow(1 - k, 3);
          this.tmp.copy(p.pos);
          p.pos.lerpVectors(p.from, p.home, e);
          p.pos.y = THREE.MathUtils.lerp(p.from.y, p.home.y, e * e);
          this.tmp.subVectors(p.pos, this.tmp);
          if (this.tmp.lengthSq() > 1e-6) p.yaw = Math.atan2(this.tmp.x, this.tmp.z);
          flap = k < 0.85 ? 0.5 : 1;
          pitch = -0.2 * (1 - k);
          if (k >= 1) this.go(p, 'idle');
          if (scared[p.flock] && p.pos.distanceTo(rickshaw) < SCARE) this.go(p, 'flee');
          break;
        }
      }
      // body
      this.q.setFromEuler(this.e.set(pitch, p.yaw, 0, 'YXZ'));
      this.m.compose(p.pos, this.q, this.s);
      this.bodies.setMatrixAt(i, this.m);
      // wings: folded when idle, flapping in the air
      const beat = flap > 0 ? Math.sin(elapsed * 26 + p.phase * 5) * 0.9 * flap : 0;
      const fold = flap > 0 ? 0 : 1;
      for (const [im, side] of [
        [this.wingsL, -1],
        [this.wingsR, 1],
      ] as const) {
        // each wing is authored along its own +X, so both take the same roll
        this.e.set(side * pitch, p.yaw + (side < 0 ? Math.PI : 0), beat, 'YXZ');
        this.q.setFromEuler(this.e);
        const sc = fold ? 0.55 : 1;
        this.m.compose(this.tmp.set(p.pos.x, p.pos.y + 0.13, p.pos.z), this.q, this.s.set(sc, 1, sc));
        im.setMatrixAt(i, this.m);
        this.s.set(1, 1, 1);
      }
    });
    this.bodies.instanceMatrix.needsUpdate = true;
    this.wingsL.instanceMatrix.needsUpdate = true;
    this.wingsR.instanceMatrix.needsUpdate = true;
  }

  private go(p: Pigeon, s: PigeonState): void {
    p.state = s;
    p.t = 0;
  }

  dispose(): void {
    this.group.removeFromParent();
    this.disposables.forEach((d) => d.dispose());
  }
}
