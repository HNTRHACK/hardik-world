import * as THREE from 'three';

/**
 * Accumulates flat-shaded, vertex-coloured triangles straight into arrays,
 * so a whole block of buildings becomes ONE BufferGeometry (one draw call)
 * without allocating a geometry per part. Optional UVs for atlas-textured parts.
 *
 * Everything is authored in a local frame set with `frame()` (position + yaw).
 */
export class GeoBuilder {
  readonly pos: number[] = [];
  readonly col: number[] = [];
  readonly uv: number[] = [];
  private readonly withUv: boolean;
  private readonly m = new THREE.Matrix4();
  private readonly tmpM = new THREE.Matrix4();
  private readonly c = new THREE.Color();
  private readonly v = Array.from({ length: 8 }, () => new THREE.Vector3());
  private readonly a = new THREE.Vector3();
  private readonly b = new THREE.Vector3();
  private readonly n = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly one = new THREE.Vector3(1, 1, 1);

  constructor(opts: { uv?: boolean } = {}) {
    this.withUv = !!opts.uv;
  }

  get vertexCount(): number {
    return this.pos.length / 3;
  }

  /** Set the local frame: translate then rotate around Y. */
  frame(x = 0, y = 0, z = 0, yaw = 0): this {
    this.m.makeRotationY(yaw).setPosition(x, y, z);
    return this;
  }

  private colorOf(color: THREE.ColorRepresentation | THREE.Color): THREE.Color {
    return color instanceof THREE.Color ? color : this.c.set(color);
  }

  private push(p: THREE.Vector3, c: THREE.Color, u = 0, v = 0): void {
    this.pos.push(p.x, p.y, p.z);
    this.col.push(c.r, c.g, c.b);
    if (this.withUv) this.uv.push(u, v);
  }

  /** Triangle in world space (already transformed). */
  private triW(p0: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3, c: THREE.Color): void {
    this.push(p0, c);
    this.push(p1, c);
    this.push(p2, c);
  }

  /**
   * Quad from 4 local points (any winding). If `outward` (local direction) is given the
   * face is flipped to point that way; otherwise the winding as given is used (CCW = front).
   */
  quad(
    p: readonly [THREE.Vector3Like, THREE.Vector3Like, THREE.Vector3Like, THREE.Vector3Like],
    color: THREE.ColorRepresentation | THREE.Color,
    outward?: THREE.Vector3Like,
    uv?: readonly [number, number, number, number],
  ): this {
    const c = this.colorOf(color).clone();
    const w = p.map((x, i) => this.v[i]!.set(x.x, x.y, x.z).applyMatrix4(this.m));
    let flip = false;
    if (outward) {
      this.a.subVectors(w[1]!, w[0]!);
      this.b.subVectors(w[2]!, w[0]!);
      this.n.crossVectors(this.a, this.b);
      const o = this.b.set(outward.x, outward.y, outward.z).transformDirection(this.m);
      flip = this.n.dot(o) < 0;
    }
    const idx = flip ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3];
    // uv: [u0, v0, u1, v1] rect mapped to corners 0..3 as (u0,v0)(u1,v0)(u1,v1)(u0,v1)
    const uvs = uv
      ? [
          [uv[0], uv[1]],
          [uv[2], uv[1]],
          [uv[2], uv[3]],
          [uv[0], uv[3]],
        ]
      : null;
    for (const i of idx) this.push(w[i]!, c, uvs?.[i]![0], uvs?.[i]![1]);
    return this;
  }

  tri(p0: THREE.Vector3Like, p1: THREE.Vector3Like, p2: THREE.Vector3Like, color: THREE.ColorRepresentation | THREE.Color): this {
    const c = this.colorOf(color);
    this.triW(
      this.v[0]!.set(p0.x, p0.y, p0.z).applyMatrix4(this.m),
      this.v[1]!.set(p1.x, p1.y, p1.z).applyMatrix4(this.m),
      this.v[2]!.set(p2.x, p2.y, p2.z).applyMatrix4(this.m),
      c,
    );
    return this;
  }

  /**
   * Axis-aligned (in the local frame) box centred at (x,y,z) with size (sx,sy,sz),
   * optionally rotated by (rx,ry,rz). Bottom face skipped by default (never seen).
   */
  box(
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    color: THREE.ColorRepresentation | THREE.Color,
    o: { rx?: number; ry?: number; rz?: number; bottom?: boolean; skip?: number } = {},
  ): this {
    const c = this.colorOf(color);
    this.q.setFromEuler(this.e.set(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0));
    this.tmpM.compose(this.a.set(x, y, z), this.q, this.b.set(sx, sy, sz)).premultiply(this.m);
    const v = this.v;
    for (let i = 0; i < 8; i++) v[i]!.set(i & 1 ? 0.5 : -0.5, i & 2 ? 0.5 : -0.5, i & 4 ? 0.5 : -0.5).applyMatrix4(this.tmpM);
    // faces as CCW-from-outside corner indices; bit flags for skip: 1=+x 2=-x 4=+y 8=-y 16=+z 32=-z
    const skip = (o.skip ?? 0) | (o.bottom ? 0 : 8);
    const faces: [number, number, number, number, number][] = [
      [1, 3, 7, 5, 1],
      [0, 4, 6, 2, 2],
      [2, 6, 7, 3, 4],
      [0, 1, 5, 4, 8],
      [4, 5, 7, 6, 16],
      [0, 2, 3, 1, 32],
    ];
    for (const [i0, i1, i2, i3, flag] of faces) {
      if (skip & flag) continue;
      this.triW(v[i0]!, v[i1]!, v[i2]!, c);
      this.triW(v[i0]!, v[i2]!, v[i3]!, c);
    }
    return this;
  }

  /** Upright cylinder / cone / frustum (no bottom cap). */
  cylinder(
    x: number,
    y: number,
    z: number,
    rTop: number,
    rBottom: number,
    h: number,
    seg: number,
    color: THREE.ColorRepresentation | THREE.Color,
    o: { rx?: number; rz?: number; ry?: number; cap?: boolean; capColor?: THREE.ColorRepresentation } = {},
  ): this {
    const c = this.colorOf(color).clone();
    const cc = o.capColor !== undefined ? new THREE.Color(o.capColor) : c;
    this.q.setFromEuler(this.e.set(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0));
    this.tmpM.compose(this.a.set(x, y, z), this.q, this.one).premultiply(this.m);
    const P = (r: number, ang: number, yy: number) =>
      new THREE.Vector3(Math.cos(ang) * r, yy, Math.sin(ang) * r).applyMatrix4(this.tmpM);
    const top = new THREE.Vector3(0, h / 2, 0).applyMatrix4(this.tmpM);
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2;
      const a1 = ((i + 1) / seg) * Math.PI * 2;
      const b0 = P(rBottom, a0, -h / 2);
      const b1 = P(rBottom, a1, -h / 2);
      const t0 = P(rTop, a0, h / 2);
      const t1 = P(rTop, a1, h / 2);
      this.triW(b0, t1, b1, c);
      if (rTop > 0) this.triW(b0, t0, t1, c);
      if (o.cap !== false && rTop > 0) this.triW(top, t1, t0, cc);
    }
    return this;
  }

  /** A gabled (pitched) roof: ridge along local X. */
  gable(x: number, y: number, z: number, w: number, d: number, h: number, color: THREE.ColorRepresentation, gableColor: THREE.ColorRepresentation): this {
    const hw = w / 2;
    const hd = d / 2;
    const V = (a: number, b: number, c: number) => new THREE.Vector3(x + a, y + b, z + c);
    const ridgeL = V(-hw, h, 0);
    const ridgeR = V(hw, h, 0);
    this.quad([V(-hw, 0, hd), V(hw, 0, hd), ridgeR, ridgeL], color, { x: 0, y: 1, z: 1 });
    this.quad([V(-hw, 0, -hd), ridgeL, ridgeR, V(hw, 0, -hd)], color, { x: 0, y: 1, z: -1 });
    const g = new THREE.Color(gableColor);
    this.tri(V(-hw, 0, -hd), V(-hw, 0, hd), ridgeL, g);
    this.tri(V(hw, 0, hd), V(hw, 0, -hd), ridgeR, g);
    return this;
  }

  /** Thin 3-sided tube between two local points (wires, rails). */
  rod(p0: THREE.Vector3Like, p1: THREE.Vector3Like, r: number, color: THREE.ColorRepresentation | THREE.Color): this {
    const c = this.colorOf(color).clone();
    const A = new THREE.Vector3(p0.x, p0.y, p0.z).applyMatrix4(this.m);
    const B = new THREE.Vector3(p1.x, p1.y, p1.z).applyMatrix4(this.m);
    const dir = new THREE.Vector3().subVectors(B, A).normalize();
    const ref = Math.abs(dir.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const u = new THREE.Vector3().crossVectors(dir, ref).normalize();
    const w = new THREE.Vector3().crossVectors(dir, u).normalize();
    const ring = [0, 1, 2].map((i) => {
      const ang = (i / 3) * Math.PI * 2;
      return u.clone().multiplyScalar(Math.cos(ang) * r).addScaledVector(w, Math.sin(ang) * r);
    });
    for (let i = 0; i < 3; i++) {
      const o0 = ring[i]!;
      const o1 = ring[(i + 1) % 3]!;
      const a0 = A.clone().add(o0);
      const a1 = A.clone().add(o1);
      const b0 = B.clone().add(o0);
      const b1 = B.clone().add(o1);
      this.triW(a0, b1, b0, c);
      this.triW(a0, a1, b1, c);
    }
    return this;
  }

  /**
   * Append any three.js geometry (e.g. an icosahedron canopy blob), placed in the
   * local frame. `jitter` varies the colour per triangle for a hand-painted look.
   */
  shape(
    geo: THREE.BufferGeometry,
    color: THREE.ColorRepresentation,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    o: { rx?: number; ry?: number; rz?: number; jitter?: () => number } = {},
  ): this {
    const src = geo.index ? geo.toNonIndexed() : geo;
    const p = src.attributes.position!;
    this.q.setFromEuler(this.e.set(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0));
    this.tmpM.compose(this.a.set(x, y, z), this.q, this.b.set(sx, sy, sz)).premultiply(this.m);
    const base = new THREE.Color(color);
    const c = new THREE.Color();
    for (let i = 0; i < p.count; i += 3) {
      c.copy(base);
      if (o.jitter) c.multiplyScalar(1 + o.jitter());
      for (let k = 0; k < 3; k++) this.push(this.v[k]!.fromBufferAttribute(p, i + k).applyMatrix4(this.tmpM), c);
    }
    if (src !== geo) src.dispose();
    return this;
  }

  /** Multiply the colour of every vertex added since `from` by a height-based grime factor. */
  grime(from: number, baseY: number, height: number, strength = 0.22): this {
    for (let i = from; i < this.vertexCount; i++) {
      const y = this.pos[i * 3 + 1]! - baseY;
      const f = 1 - strength * (1 - THREE.MathUtils.smoothstep(y, 0, height));
      this.col[i * 3] *= f;
      this.col[i * 3 + 1] *= f;
      this.col[i * 3 + 2] *= f;
    }
    return this;
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    if (this.withUv) g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeVertexNormals(); // non-indexed → face normals (needed for shadow normal bias)
    g.computeBoundingSphere();
    return g;
  }
}
