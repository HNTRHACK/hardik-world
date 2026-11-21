import * as THREE from 'three';
import { GeoBuilder } from './geo/GeoBuilder';
import { Rng } from './geo/rng';
import { globals } from './geo/patches';
import { seaX } from './layout';
import type { Mood } from './Mood';

/**
 * Depth cues beyond the lane: a hazy silhouette of the city on the landward
 * horizon (never over the sea) and a few flocks of birds wheeling over the roofs.
 */
export class Atmosphere {
  readonly group = new THREE.Group();
  private readonly skylineMat: THREE.MeshBasicMaterial;
  private readonly birds: THREE.InstancedMesh;
  private readonly flock: { cx: number; cz: number; r: number; y: number; speed: number; phase: number }[] = [];
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3(0.6, 0.6, 0.6);
  private readonly e = new THREE.Euler();
  private readonly disposables: { dispose(): void }[] = [];

  constructor(scene: THREE.Scene) {
    const rng = new Rng(616);
    // ── Distant skyline: towers and blocks on an arc, coloured like haze (no fog: it IS the haze) ──
    const g = new GeoBuilder();
    const near = new THREE.Color(1, 1, 1);
    const far = new THREE.Color(0.86, 0.86, 0.86);
    for (let a = -Math.PI * 0.62; a < Math.PI * 0.62; a += rng.range(0.018, 0.04)) {
      // a = 0 points east; skip anything that would stand in the sea
      const r = rng.range(150, 172);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r * 1.15;
      if (x < seaX(Math.max(-110, Math.min(110, z))) + 20) continue;
      const tower = rng.chance(0.22);
      const h = tower ? rng.range(30, 62) : rng.range(8, 24);
      const w = tower ? rng.range(6, 11) : rng.range(9, 22);
      g.frame(x, 0, z, -a + Math.PI / 2);
      g.box(0, h / 2, 0, w, h, 6, rng.chance(0.5) ? near : far);
      if (tower && rng.chance(0.5)) g.box(0, h + 1.5, 0, w * 0.5, 3, 4, near); // crown
    }
    const geo = g.build();
    this.skylineMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: 0xc79a86, fog: false });
    const skyline = new THREE.Mesh(geo, this.skylineMat);
    skyline.renderOrder = -0.5;
    this.group.add(skyline);
    this.disposables.push(geo, this.skylineMat);

    // ── Birds: simple V wings that flap in the vertex shader ──
    const bg = new THREE.BufferGeometry();
    bg.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([0, 0, 0.18, -0.55, 0, -0.1, 0, 0, -0.08, 0, 0, 0.18, 0, 0, -0.08, 0.55, 0, -0.1], 3),
    );
    bg.computeVertexNormals();
    const n = 18;
    const phases = new Float32Array(n);
    for (let i = 0; i < n; i++) phases[i] = rng.range(0, 6.28);
    bg.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));
    const bm = new THREE.MeshBasicMaterial({ color: 0x5a4842, side: THREE.DoubleSide });
    bm.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = globals.uTime;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aPhase;\nuniform float uTime;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.y += abs(position.x) * sin(uTime * 9.0 + aPhase) * 0.7;');
    };
    this.birds = new THREE.InstancedMesh(bg, bm, n);
    this.birds.frustumCulled = false;
    this.group.add(this.birds);
    this.disposables.push(bg, bm);
    for (let f = 0; f < 3; f++) {
      const cx = rng.range(-20, 30);
      const cz = rng.range(-40, 40);
      for (let i = 0; i < 6; i++)
        this.flock.push({ cx: cx + rng.range(-3, 3), cz: cz + rng.range(-3, 3), r: rng.range(14, 26), y: rng.range(15, 21), speed: rng.range(0.16, 0.24) * (f % 2 ? 1 : -1), phase: f * 2 + i * 0.12 });
    }
    scene.add(this.group);
  }

  bindMood(mood: Mood): void {
    const golden = new THREE.Color(0xc79a86);
    const dusk = new THREE.Color(0x5e4a64);
    mood.on((t) => this.skylineMat.color.copy(golden).lerp(dusk, t));
  }

  update(elapsed: number): void {
    this.flock.forEach((b, i) => {
      const a = elapsed * b.speed + b.phase;
      this.p.set(b.cx + Math.cos(a) * b.r, b.y + Math.sin(elapsed * 0.5 + i) * 0.8, b.cz + Math.sin(a) * b.r);
      const heading = Math.atan2(-Math.sin(a) * Math.sign(b.speed), Math.cos(a) * Math.sign(b.speed));
      this.q.setFromEuler(this.e.set(0, heading, Math.sign(b.speed) * 0.25));
      this.birds.setMatrixAt(i, this.m.compose(this.p, this.q, this.s));
    });
    this.birds.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.group.removeFromParent();
    this.disposables.forEach((d) => d.dispose());
  }
}
