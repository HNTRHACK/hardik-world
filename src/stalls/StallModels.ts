import * as THREE from 'three';
import { GeoBuilder } from '../world/geo/GeoBuilder';
import { Rng } from '../world/geo/rng';
import { withOcclusion } from '../world/geo/occlusion';
import { palette } from '../world/palette';

/** A collider in the stall's local frame (+Z faces the road). */
export interface LocalBox {
  x: number;
  z: number;
  hx: number;
  hy: number;
  hz: number;
}

export interface StallModel {
  root: THREE.Group;
  /** Local height for the floating label. */
  labelHeight: number;
  colliders: LocalBox[];
  update(elapsed: number, delta: number): void;
  /** Optional: the rickshaw just drove into this stall's ring (world position). */
  onEnter?(from: THREE.Vector3): void;
  dispose(): void;
}

const SIGN_FONT = '"Baloo 2", "Nirmala UI", system-ui, sans-serif';

/** Shared helpers for building one stall. */
export class Kit {
  readonly root = new THREE.Group();
  readonly g = new GeoBuilder();
  readonly colliders: LocalBox[] = [];
  readonly updates: ((t: number, dt: number) => void)[] = [];
  private readonly disposables: { dispose(): void }[] = [];
  readonly rng: Rng;

  constructor(seed: number) {
    this.rng = new Rng(seed);
  }

  track<T extends { dispose(): void }>(x: T): T {
    this.disposables.push(x);
    return x;
  }

  /** A flat canvas-textured board (signs, screens, tickers). */
  board(
    w: number,
    h: number,
    draw: (g: CanvasRenderingContext2D, cw: number, ch: number) => void,
    o: { px?: number; emissive?: number; repeat?: boolean } = {},
  ): { mesh: THREE.Mesh; texture: THREE.CanvasTexture } {
    const px = o.px ?? 256;
    const c = document.createElement('canvas');
    c.width = Math.round(w * px);
    c.height = Math.round(h * px);
    draw(c.getContext('2d')!, c.width, c.height);
    const texture = this.track(new THREE.CanvasTexture(c));
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    if (o.repeat) texture.wrapS = THREE.RepeatWrapping;
    const mat = this.track(
      withOcclusion(new THREE.MeshStandardMaterial({ map: texture, emissiveMap: texture, emissive: 0xffffff, emissiveIntensity: o.emissive ?? 0.3, roughness: 0.6 })),
    );
    const geo = this.track(new THREE.PlaneGeometry(w, h));
    const mesh = new THREE.Mesh(geo, mat);
    this.root.add(mesh);
    return { mesh, texture };
  }

  /** Bake the vertex-coloured geometry into one shadow-casting mesh. */
  finish(labelHeight: number): StallModel {
    const geo = this.track(this.g.build());
    const mat = this.track(withOcclusion(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, flatShading: true })));
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = mesh.receiveShadow = true;
    this.root.add(mesh);
    const updates = this.updates;
    const disposables = this.disposables;
    return {
      root: this.root,
      labelHeight,
      colliders: this.colliders,
      update: (t, dt) => updates.forEach((u) => u(t, dt)),
      dispose: () => disposables.forEach((d) => d.dispose()),
    };
  }

  /** A small animated mesh with its own glowing material. */
  glow(geo: THREE.BufferGeometry, color: number, intensity: number): THREE.Mesh {
    const mat = this.track(new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.4 }));
    const mesh = new THREE.Mesh(this.track(geo), mat);
    this.root.add(mesh);
    return mesh;
  }
}

export function signText(g: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, maxW: number, color: string, weight = 700): void {
  let s = size;
  do g.font = `${weight} ${s}px ${SIGN_FONT}`;
  while (g.measureText(text).width > maxW && --s > 10);
  g.fillStyle = color;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, x, y);
}

// ── Chai stall: ChaiPay ─────────────────────────────────────────────────

export function chaiStall(): StallModel {
  const k = new Kit(11);
  const { g } = k;
  const wood = palette.cartWood;
  // Back cabin + counter
  g.box(0, 1.25, -1.6, 3.6, 2.5, 1.4, 0x2f6b6b);
  g.box(0, 0.55, -0.4, 3.4, 1.1, 0.8, wood);
  g.box(0, 1.13, -0.4, 3.6, 0.06, 0.95, 0xb8b8b0); // steel top
  for (const x of [-1.75, 1.75]) for (const z of [-2.25, 0.2]) g.box(x, 1.3, z, 0.08, 2.6, 0.08, palette.kerbBlack);
  g.box(0, 2.62, -0.95, 4.2, 0.07, 3.4, palette.tarpBlue, { rx: -0.08, bottom: true }); // tarp roof
  // shelf with jars + biscuit packets
  for (let i = 0; i < 6; i++) g.cylinder(-1.3 + i * 0.5, 1.65, -0.95, 0.14, 0.14, 0.35, 7, [0xe9c46a, 0xd98f6a, 0xf2a33a][i % 3]!);
  for (let i = 0; i < 8; i++) g.box(-1.4 + i * 0.4, 2.05, -0.95, 0.3, 0.22, 0.08, [palette.apple, palette.banana, palette.tarpGreen][i % 3]!);
  // stove + brass kettle
  g.box(1.05, 1.3, -0.45, 0.6, 0.3, 0.5, 0x2a2523);
  const brass = 0xc9973a;
  g.cylinder(1.05, 1.68, -0.45, 0.2, 0.26, 0.46, 10, brass, { capColor: 0xb3832e });
  g.cylinder(1.05, 1.95, -0.45, 0.05, 0.12, 0.1, 8, brass);
  g.rod({ x: 0.85, y: 1.6, z: -0.45 }, { x: 0.62, y: 1.86, z: -0.45 }, 0.035, brass); // spout
  g.rod({ x: 1.2, y: 1.9, z: -0.45 }, { x: 1.36, y: 1.6, z: -0.45 }, 0.02, 0x2a2523);
  // cutting-chai glasses on a tray
  g.box(-0.6, 1.17, -0.3, 0.8, 0.02, 0.4, 0x9a9a92);
  for (let i = 0; i < 6; i++) g.cylinder(-0.9 + (i % 3) * 0.3, 1.24, -0.4 + Math.floor(i / 3) * 0.2, 0.05, 0.04, 0.12, 6, 0xc68642);
  // bench + stools out front
  g.box(-2.4, 0.42, 1.6, 2.2, 0.08, 0.5, wood);
  for (const x of [-3.3, -1.5]) g.box(x, 0.2, 1.6, 0.08, 0.4, 0.4, wood);
  for (const [x, c] of [
    [1.6, palette.apple],
    [2.5, 0x2f6db5],
  ] as const) {
    g.cylinder(x, 0.42, 1.8, 0.2, 0.2, 0.04, 8, c);
    g.cylinder(x, 0.2, 1.8, 0.16, 0.2, 0.4, 8, c, { cap: false });
  }
  // Signboard
  const sign = k.board(3.2, 0.7, (c, w, h) => {
    c.fillStyle = '#f2c230';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#9a1b14';
    c.fillRect(8, 8, w - 16, 6);
    c.fillRect(8, h - 14, w - 16, 6);
    signText(c, 'CHAIPAY', w * 0.33, h * 0.55, h * 0.56, w * 0.5, '#9a1b14');
    signText(c, 'चहा', w * 0.8, h * 0.56, h * 0.55, w * 0.3, '#9a1b14');
  });
  sign.mesh.position.set(0, 2.95, 0.55);
  sign.mesh.rotation.x = -0.12;
  g.box(0, 2.95, 0.5, 3.3, 0.8, 0.06, palette.signFrame, { rx: -0.12 });

  // Steam from the kettle: GPU particles, no per-frame CPU work.
  const n = 26;
  const seeds = new Float32Array(n);
  for (let i = 0; i < n; i++) seeds[i] = k.rng.next();
  const pg = k.track(new THREE.BufferGeometry());
  pg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
  pg.setAttribute('seed', new THREE.Float32BufferAttribute(seeds, 1));
  const steam = k.track(
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uTime: { value: 0 }, uScale: { value: 160 } },
      vertexShader: /* glsl */ `
        attribute float seed;
        uniform float uTime, uScale;
        varying float vA;
        void main() {
          float t = fract(uTime * 0.32 + seed);
          vec3 p = vec3(sin(seed * 31.0 + uTime * 1.3) * 0.18 * t - 0.15 * t, t * 1.7, cos(seed * 17.0) * 0.12 * t);
          vA = sin(3.14159 * t) * 0.42;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = uScale * (0.12 + t * 0.35) / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying float vA;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          gl_FragColor = vec4(vec3(1.0, 0.97, 0.92), vA * smoothstep(0.5, 0.1, d));
        }`,
    }),
  );
  const points = new THREE.Points(pg, steam);
  points.position.set(0.62, 1.9, -0.45);
  points.frustumCulled = false;
  k.root.add(points);
  k.updates.push((t) => (steam.uniforms.uTime!.value = t));

  k.colliders.push({ x: 0, z: -1.0, hx: 1.85, hy: 1.3, hz: 1.35 }, { x: -2.4, z: 1.6, hx: 1.1, hy: 0.3, hz: 0.3 });
  return k.finish(3.8);
}

// ── Courier depot: OMEN ─────────────────────────────────────────────────

export function courierDepot(): StallModel {
  const k = new Kit(22);
  const { g, rng } = k;
  const tin = 0x5f7a8a;
  // Corrugated shed with an open front
  g.box(0, 2.1, -1.9, 7.4, 4.2, 0.2, tin);
  g.box(-3.6, 2.1, -0.4, 0.2, 4.2, 3.2, tin);
  g.box(3.6, 2.1, -0.4, 0.2, 4.2, 3.2, tin);
  for (let x = -3.5; x <= 3.5; x += 0.35) g.box(x, 2.1, -2.02, 0.06, 4.2, 0.04, 0x4d6573); // ribs
  g.box(0, 4.3, -0.3, 7.9, 0.12, 4.0, 0x4d6573, { rx: 0.06 }); // roof
  g.box(0, 0.03, -0.4, 7.0, 0.06, 3.0, 0x6e6a64); // concrete apron
  g.box(0, 3.9, 1.12, 7.4, 0.3, 0.12, palette.kerbYellow); // header beam
  // Parcels: stacks of kraft boxes with tape bands
  const kraft = [0xc98b4a, 0xb7793c, 0xd9a25f, 0xa86f3a];
  const parcel = (x: number, y: number, z: number, s: number, ry = 0) => {
    const c = rng.pick(kraft);
    g.box(x, y + s / 2, z, s, s * 0.8, s, c, { ry });
    g.box(x, y + s / 2 + 0.002, z, s * 0.2, s * 0.81, s + 0.01, 0xe8dcc0, { ry });
  };
  for (const [sx, sz] of [
    [-2.6, -1.2],
    [-1.6, -1.3],
    [2.6, -1.1],
  ] as const) {
    let y = 0;
    for (let i = rng.int(2, 4); i > 0; i--) {
      const s = rng.range(0.5, 0.8);
      parcel(sx + rng.range(-0.1, 0.1), y, sz + rng.range(-0.1, 0.1), s, rng.range(-0.2, 0.2));
      y += s * 0.8;
    }
  }
  // Wooden pallet + scale
  g.box(1.4, 0.08, -1.3, 1.2, 0.16, 1.0, palette.cartWood);
  g.box(1.4, 0.45, -1.3, 0.7, 0.06, 0.6, 0x9aa0a6);
  g.box(1.4, 0.3, -1.3, 0.1, 0.3, 0.1, 0x9aa0a6);
  // Conveyor out of the shed toward the road
  g.box(-0.2, 0.65, 0.4, 0.9, 0.08, 3.2, 0x2a2523);
  for (const z of [-1.0, 0.4, 1.8]) for (const x of [-0.6, 0.2]) g.box(x, 0.32, z, 0.08, 0.64, 0.08, 0x9aa0a6);
  // Moving parcels on the belt
  const belt: THREE.Mesh[] = [];
  const boxGeo = k.track(new THREE.BoxGeometry(0.5, 0.36, 0.5));
  const boxMat = k.track(withOcclusion(new THREE.MeshStandardMaterial({ color: 0xc98b4a, roughness: 0.8, flatShading: true })));
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(boxGeo, boxMat);
    m.castShadow = true;
    k.root.add(m);
    belt.push(m);
  }
  k.updates.push((t) => {
    belt.forEach((m, i) => {
      const u = (t * 0.22 + i / belt.length) % 1;
      m.position.set(-0.2, 0.87, -1.1 + u * 3.0);
      m.visible = u < 0.97;
    });
  });
  // Handcart with parcels
  g.box(2.6, 0.7, 1.4, 1.0, 0.08, 1.4, palette.cartWood);
  g.cylinder(3.15, 0.3, 1.4, 0.3, 0.3, 0.06, 10, palette.kerbBlack, { rz: Math.PI / 2 });
  g.cylinder(2.05, 0.3, 1.4, 0.3, 0.3, 0.06, 10, palette.kerbBlack, { rz: Math.PI / 2 });
  parcel(2.45, 0.74, 1.2, 0.5);
  parcel(2.8, 0.74, 1.55, 0.45, 0.3);
  // Sign
  const sign = k.board(4.6, 0.8, (c, w, h) => {
    c.fillStyle = '#1b1310';
    c.fillRect(0, 0, w, h);
    signText(c, 'OMEN', w * 0.2, h * 0.55, h * 0.62, w * 0.3, '#f2c230');
    signText(c, 'COURIER DEPOT', w * 0.64, h * 0.56, h * 0.42, w * 0.6, '#f6ead7', 600);
  });
  sign.mesh.position.set(0, 4.55, 1.2);
  g.box(0, 4.55, 1.14, 4.75, 0.92, 0.08, palette.signFrame);
  k.colliders.push({ x: 0, z: -1.95, hx: 3.8, hy: 2.1, hz: 0.2 }, { x: -3.6, z: -0.4, hx: 0.15, hy: 2.1, hz: 1.6 }, { x: 3.6, z: -0.4, hx: 0.15, hy: 2.1, hz: 1.6 });
  k.colliders.push({ x: 2.6, z: 1.4, hx: 0.65, hy: 0.6, hz: 0.75 }, { x: -0.2, z: 0.4, hx: 0.5, hy: 0.4, hz: 1.6 });
  return k.finish(5.6);
}

// ── Clinic: Federated Clinical Platform ─────────────────────────────────

export function clinic(): StallModel {
  const k = new Kit(33);
  const { g } = k;
  const white = 0xf3f1ea;
  g.box(0, 1.8, -1.0, 7.0, 3.6, 5.2, white);
  g.box(0, 3.65, -1.0, 7.3, 0.14, 5.5, 0xd9d4c8);
  g.box(0, 0.15, 1.85, 2.4, 0.3, 0.9, 0xbdb2a2); // step
  g.box(0, 1.15, 1.62, 1.2, 2.3, 0.06, 0x5c8a7c); // door
  for (const x of [-2.4, 2.4]) {
    g.box(x, 1.8, 1.62, 1.5, 1.2, 0.08, 0xd9d4c8);
    g.box(x, 1.8, 1.67, 1.3, 1.0, 0.03, 0x9fc3c6);
    g.box(x, 2.5, 1.85, 1.7, 0.06, 0.5, 0x5c8a7c); // sunshade
  }
  g.box(0, 2.62, 1.68, 6.9, 0.08, 0.06, 0xc8302a); // red band
  // bench + plants
  g.box(2.9, 0.45, 2.6, 1.6, 0.08, 0.45, palette.cartWood);
  for (const x of [2.3, 3.5]) g.box(x, 0.22, 2.6, 0.08, 0.44, 0.4, palette.cartWood);
  for (const x of [-3.0, -1.6]) {
    g.cylinder(x, 0.25, 2.4, 0.26, 0.2, 0.5, 8, palette.terracotta);
    g.shape(new THREE.IcosahedronGeometry(0.4, 0), palette.peepal2, x, 0.75, 2.4, 1, 1, 1);
  }
  // Rooftop: three little "hospital node" dishes facing a central mast (federation, not centralisation)
  g.cylinder(0, 4.6, -1.0, 0.05, 0.07, 1.8, 6, 0x9aa0a6);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    g.cylinder(Math.cos(a) * 2.2, 4.05, -1.0 + Math.sin(a) * 1.6, 0.32, 0.05, 0.16, 8, white, { rx: -0.7 });
  }
  // Illuminated red-cross lightbox on a frame above the entrance
  g.box(0, 4.5, 1.2, 0.08, 1.6, 0.08, 0x9aa0a6);
  g.box(0, 5.3, 1.2, 1.7, 1.7, 0.3, white);
  const bar1 = k.glow(new THREE.BoxGeometry(1.2, 0.36, 0.34), 0xd8261c, 1.2);
  const bar2 = k.glow(new THREE.BoxGeometry(0.36, 1.2, 0.34), 0xd8261c, 1.2);
  bar1.position.set(0, 5.3, 1.22);
  bar2.position.set(0, 5.3, 1.22);
  const crossMat = bar1.material as THREE.MeshStandardMaterial;
  bar2.material = crossMat;
  k.updates.push((t) => (crossMat.emissiveIntensity = 1.0 + Math.sin(t * 1.6) * 0.35));
  // Name plate
  const sign = k.board(3.6, 0.55, (c, w, h) => {
    c.fillStyle = '#f3f1ea';
    c.fillRect(0, 0, w, h);
    signText(c, 'FEDERATED CLINIC', w * 0.5, h * 0.56, h * 0.5, w * 0.92, '#c8302a');
  });
  sign.mesh.position.set(0, 3.15, 1.62);
  k.colliders.push({ x: 0, z: -1.0, hx: 3.6, hy: 1.8, hz: 2.7 }, { x: 2.9, z: 2.6, hx: 0.85, hy: 0.3, hz: 0.3 });
  return k.finish(6.8);
}

// ── Job board: UMANG ────────────────────────────────────────────────────

export function jobBoard(): StallModel {
  const k = new Kit(44);
  const { g, rng } = k;
  const post = 0x3b3633;
  for (const x of [-2.5, 2.5]) g.box(x, 1.7, 0, 0.16, 3.4, 0.16, post);
  g.box(0, 2.0, 0, 5.2, 2.2, 0.12, 0x6b4f3a); // frame
  g.box(0, 2.0, 0.07, 4.9, 1.95, 0.04, 0x3f6f5a); // board
  g.box(0, 3.35, 0.1, 5.8, 0.06, 1.0, 0x9aa0a6, { rx: 0.25 }); // little tin canopy
  // Header
  const head = k.board(4.6, 0.42, (c, w, h) => {
    c.fillStyle = '#f6ead7';
    c.fillRect(0, 0, w, h);
    signText(c, 'UMANG', w * 0.14, h * 0.56, h * 0.62, w * 0.25, '#1b1310');
    signText(c, 'Work should find you.  ·  काम', w * 0.62, h * 0.56, h * 0.44, w * 0.7, '#3d3d3d', 600);
  });
  head.mesh.position.set(0, 2.78, 0.1);
  // Notices: individual meshes so they can flutter in the breeze.
  const papers = [0xfaf7f0, 0xf6ead7, 0xfff2b3, 0xd8ecf7, 0xf9d9d4, 0xe2f0d9];
  const notices: { m: THREE.Mesh; p: number }[] = [];
  const noteGeo = k.track(new THREE.PlaneGeometry(1, 1));
  for (let i = 0; i < 16; i++) {
    const mat = k.track(new THREE.MeshStandardMaterial({ color: rng.pick(papers), roughness: 0.9, side: THREE.DoubleSide }));
    const m = new THREE.Mesh(noteGeo, mat);
    const col = i % 6;
    const row = Math.floor(i / 6);
    m.scale.set(rng.range(0.42, 0.62), rng.range(0.5, 0.7), 1);
    m.position.set(-2.0 + col * 0.8 + rng.range(-0.12, 0.12), 2.35 - row * 0.62 + rng.range(-0.08, 0.08), 0.1 + i * 0.001);
    m.rotation.z = rng.range(-0.12, 0.12);
    k.root.add(m);
    notices.push({ m, p: rng.range(0, 6) });
    // pin
    g.cylinder(m.position.x, m.position.y + m.scale.y * 0.42, 0.13, 0.03, 0.03, 0.04, 5, rng.pick([palette.apple, palette.tarpBlue, palette.kerbYellow]), { rx: Math.PI / 2 });
  }
  k.updates.push((t) => notices.forEach((n) => (n.m.rotation.x = Math.max(0, Math.sin(t * 2.3 + n.p)) * 0.35)));
  // The naka: tools of the trade waiting for work
  g.box(-1.6, 0.25, 1.2, 0.7, 0.4, 0.35, 0xc8302a); // toolbox
  g.box(-1.6, 0.48, 1.2, 0.3, 0.06, 0.06, palette.kerbBlack);
  g.box(-0.6, 0.18, 1.3, 0.7, 0.36, 0.45, 0xd8cfbf, { ry: 0.3 }); // cement bag
  g.box(1.9, 1.25, -0.45, 0.06, 2.6, 0.06, palette.cartWood, { rx: 0.25, rz: 0.12 }); // ladder
  g.box(2.4, 1.25, -0.45, 0.06, 2.6, 0.06, palette.cartWood, { rx: 0.25, rz: 0.12 });
  for (let i = 0; i < 6; i++) g.box(2.15 - 0.16 * Math.sin(0.12), 0.3 + i * 0.4, -0.2 - i * 0.1, 0.5, 0.04, 0.04, palette.cartWood);
  g.box(1.0, 0.04, 1.2, 0.9, 0.08, 0.5, 0x9a9a92, { ry: -0.2 }); // trowel board
  k.colliders.push({ x: -2.5, z: 0, hx: 0.12, hy: 1.7, hz: 0.12 }, { x: 2.5, z: 0, hx: 0.12, hy: 1.7, hz: 0.12 }, { x: 0, z: 0, hx: 2.6, hy: 1.1, hz: 0.1 });
  return k.finish(4.4);
}

// ── Traffic signal + control cabin: ORION ───────────────────────────────

export function trafficSignal(): StallModel {
  const k = new Kit(55);
  const { g } = k;
  // Control cabin with a forecast screen
  g.box(-1.0, 1.4, -1.2, 4.2, 2.8, 2.8, 0xe6e0d4);
  g.box(-1.0, 2.9, -1.2, 4.5, 0.14, 3.1, 0x3b3633);
  g.box(-2.3, 1.05, 0.22, 0.9, 2.1, 0.06, 0x3b3633); // door
  // Signal pole at the front corner, lights facing up and down the street + the crossing
  const px = 2.6;
  const pz = 2.2;
  g.box(px, 0.15, pz, 0.5, 0.3, 0.5, 0x3b3633);
  g.cylinder(px, 2.4, pz, 0.08, 0.1, 4.8, 8, 0x2a2523);
  const heads: { m: THREE.Mesh[]; ry: number }[] = [];
  const lightGeo = k.track(new THREE.CylinderGeometry(0.13, 0.13, 0.08, 12));
  lightGeo.rotateX(Math.PI / 2);
  const mats = [0xd8261c, 0xf2a33a, 0x2fbf5a].map((c) => k.track(new THREE.MeshStandardMaterial({ color: 0x1a1a1a, emissive: c, emissiveIntensity: 0.06, roughness: 0.3 })));
  for (const ry of [Math.PI / 2, -Math.PI / 2, 0]) {
    const head = new THREE.Group();
    head.position.set(px, 3.9, pz);
    head.rotation.y = ry;
    k.root.add(head);
    const housing = new THREE.Mesh(k.track(new THREE.BoxGeometry(0.42, 1.25, 0.32)), k.track(new THREE.MeshStandardMaterial({ color: 0x2a2523, roughness: 0.7 })));
    housing.position.z = 0.2;
    housing.castShadow = true;
    head.add(housing);
    const lamps: THREE.Mesh[] = [];
    mats.forEach((mat, i) => {
      const l = new THREE.Mesh(lightGeo, mat);
      l.position.set(0, 0.38 - i * 0.38, 0.38);
      head.add(l);
      lamps.push(l);
      const visor = new THREE.Mesh(k.track(new THREE.BoxGeometry(0.34, 0.04, 0.16)), housing.material);
      visor.position.set(0, 0.55 - i * 0.38, 0.44);
      head.add(visor);
    });
    heads.push({ m: lamps, ry });
  }
  // Cycle: green 4 s → amber 1.2 s → red 4 s
  k.updates.push((t) => {
    const c = t % 9.2;
    const on = c < 4 ? 2 : c < 5.2 ? 1 : 0;
    mats.forEach((m, i) => (m.emissiveIntensity = i === on ? 2.6 : 0.06));
  });
  // Forecast screen on the cabin: a city grid with a route that keeps redrawing
  const screen = k.board(
    2.4,
    1.3,
    (c, w, h) => {
      c.fillStyle = '#0f1a1e';
      c.fillRect(0, 0, w, h);
      c.strokeStyle = 'rgba(160,200,210,0.25)';
      c.lineWidth = 2;
      for (let x = 0; x < w; x += w / 10) (c.beginPath(), c.moveTo(x, 0), c.lineTo(x, h), c.stroke());
      for (let y = 0; y < h; y += h / 6) (c.beginPath(), c.moveTo(0, y), c.lineTo(w, y), c.stroke());
      signText(c, 'ORION', w * 0.13, h * 0.12, h * 0.1, w * 0.2, '#f2a33a', 600);
    },
    { emissive: 0.9 },
  );
  screen.mesh.position.set(-0.5, 1.75, 0.23);
  g.box(-0.5, 1.75, 0.2, 2.6, 1.5, 0.06, 0x2a2523);
  const route = k.glow(new THREE.BufferGeometry(), 0xf2a33a, 1.8);
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 40; i++) {
    const u = i / 40;
    pts.push(new THREE.Vector3(-1.55 + u * 2.1, 1.3 + Math.sin(u * 5.2) * 0.25 + u * 0.4, 0.245));
  }
  route.geometry.dispose();
  route.geometry = k.track(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.03, 4));
  const routeGeo = route.geometry as THREE.BufferGeometry;
  const total = routeGeo.index ? routeGeo.index.count : routeGeo.attributes.position!.count;
  k.updates.push((t) => routeGeo.setDrawRange(0, Math.floor(((t * 0.25) % 1.2) * total)));
  k.colliders.push({ x: -1.0, z: -1.2, hx: 2.1, hy: 1.4, hz: 1.4 }, { x: px, z: pz, hx: 0.3, hy: 2.4, hz: 0.3 });
  return k.finish(5.4);
}

// ── Stock kiosk with an LED ticker: COBRA KAI ───────────────────────────

const TICKER = 'COBRA KAI   ·   GLACIER_GAS   ·   LEAKAGE-SAFE VALIDATION   ·   OUT-OF-SAMPLE BACKTESTS   ·   EVERY METRIC TRACES BACK TO DATA   ·   ';

export function stockKiosk(): StallModel {
  const k = new Kit(66);
  const { g } = k;
  const body = 0x1f3a32;
  g.box(0, 1.25, -0.3, 2.6, 2.5, 2.1, body);
  g.box(0, 2.6, -0.3, 2.9, 0.12, 2.4, 0x14261f);
  g.box(0, 1.0, 0.78, 2.2, 0.06, 0.4, 0xb8b8b0); // counter
  g.box(0, 1.55, 0.76, 2.0, 1.0, 0.02, 0x0c1512); // window opening
  g.box(1.6, 0.45, 0.8, 0.5, 0.06, 0.5, palette.cartWood); // stool
  g.box(1.6, 0.22, 0.8, 0.06, 0.44, 0.06, palette.kerbBlack);
  // Dashboard screen in the window
  const scr = k.board(
    1.6,
    0.8,
    (c, w, h) => {
      c.fillStyle = '#0c1512';
      c.fillRect(0, 0, w, h);
      c.strokeStyle = 'rgba(120,200,160,0.25)';
      for (let i = 1; i < 4; i++) (c.beginPath(), c.moveTo(0, (h * i) / 4), c.lineTo(w, (h * i) / 4), c.stroke());
      c.strokeStyle = '#f2c230';
      c.lineWidth = 4;
      c.beginPath();
      let y = h * 0.6;
      for (let x = 0; x <= w; x += 12) {
        y = Math.max(h * 0.15, Math.min(h * 0.85, y + Math.sin(x * 0.07) * 9 + Math.cos(x * 0.031) * 6));
        x === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
      }
      c.stroke();
      c.setLineDash([8, 8]);
      c.strokeStyle = 'rgba(246,234,215,0.5)';
      c.strokeRect(w * 0.66, 6, w * 0.32, h - 12);
    },
    { emissive: 0.85 },
  );
  scr.mesh.position.set(0, 1.55, 0.78);
  // LED ticker band on the front and both sides, scrolling
  const drawTicker = (c: CanvasRenderingContext2D, w: number, h: number) => {
    c.fillStyle = '#0a0705';
    c.fillRect(0, 0, w, h);
    c.font = `700 ${h * 0.62}px ui-monospace, "JetBrains Mono", monospace`;
    c.textBaseline = 'middle';
    c.fillStyle = '#ffb347';
    let x = 0;
    while (x < w) {
      c.fillText(TICKER, x, h * 0.54);
      x += c.measureText(TICKER).width;
    }
    // dot-matrix mask
    c.fillStyle = 'rgba(10,7,5,0.55)';
    for (let yy = 0; yy < h; yy += 4) c.fillRect(0, yy, w, 1.5);
    for (let xx = 0; xx < w; xx += 4) c.fillRect(xx, 0, 1.5, h);
  };
  const tickers: THREE.CanvasTexture[] = [];
  for (const [w, x, z, ry] of [
    [2.6, 0, 0.77, 0],
    [2.1, 1.31, -0.3, Math.PI / 2],
    [2.1, -1.31, -0.3, -Math.PI / 2],
  ] as const) {
    const t = k.board(w, 0.32, drawTicker, { px: 400, emissive: 1.4, repeat: true });
    t.texture.repeat.x = w / 2.6;
    t.mesh.position.set(x, 2.32, z);
    t.mesh.rotation.y = ry;
    tickers.push(t.texture);
  }
  g.box(0, 2.32, -0.3, 2.66, 0.4, 2.16, 0x0a0705);
  k.updates.push((_t, dt) => tickers.forEach((tx) => (tx.offset.x = (tx.offset.x + dt * 0.045) % 1)));
  k.colliders.push({ x: 0, z: -0.3, hx: 1.35, hy: 1.3, hz: 1.1 });
  return k.finish(3.6);
}

export const STALL_BUILDERS: Record<string, () => StallModel> = {
  chaipay: chaiStall,
  omen: courierDepot,
  'federated-clinical': clinic,
  umang: jobBoard,
  orion: trafficSignal,
  'cobra-kai': stockKiosk,
};
