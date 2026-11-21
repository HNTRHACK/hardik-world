import * as THREE from 'three';
import type { Input } from '../core/Input';
import { globals } from '../world/geo/patches';
import type { Rickshaw } from './Rickshaw';

const DUST = 96;
const SKIDS = 480;
const SKID_LIFE = 9;

/**
 * The rickshaw's small life: a headlight cone + light pool (stronger at dusk),
 * dust puffs from the rear wheels when braking or drifting, and skid marks that
 * fade. All GPU-side after emission; one draw each.
 */
export class RickshawFX {
  readonly group = new THREE.Group();
  private readonly disposables: { dispose(): void }[] = [];
  private readonly dust: THREE.Points;
  private readonly dustAttr: { pos: THREE.BufferAttribute; birth: THREE.BufferAttribute; seed: THREE.BufferAttribute };
  private dustHead = 0;
  private readonly skids: THREE.InstancedMesh;
  private readonly skidBirth: THREE.InstancedBufferAttribute;
  private skidHead = 0;
  private readonly lastWheel: (THREE.Vector3 | null)[] = [null, null];
  private readonly w = new THREE.Vector3();
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly v = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private emitClock = 0;
  /** 0..1 how hard the tyres are sliding (read by the sound layer). */
  skid = 0;

  constructor(
    scene: THREE.Scene,
    private readonly rickshaw: Rickshaw,
    private readonly input: Input,
  ) {
    // ── Headlight: soft additive cone + pool on the road, attached to the rickshaw ──
    const coneLen = 7;
    const coneGeo = new THREE.ConeGeometry(2.0, coneLen, 20, 1, true);
    coneGeo.translate(0, -coneLen / 2, 0);
    coneGeo.rotateX(-Math.PI / 2 - 0.12); // point forward (-Z) and slightly down
    const coneMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: { uDusk: globals.uDusk },
      vertexShader: /* glsl */ `
        varying float vAlong;
        varying vec3 vN, vV;
        void main() {
          vAlong = clamp(-position.z / ${coneLen.toFixed(1)}, 0.0, 1.0);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vN = normalize(normalMatrix * normal);
          vV = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uDusk;
        varying float vAlong;
        varying vec3 vN, vV;
        void main() {
          float edge = pow(abs(dot(vN, vV)), 1.6);
          float a = edge * (1.0 - vAlong) * (1.0 - vAlong) * (0.05 + 0.33 * uDusk);
          gl_FragColor = vec4(vec3(1.0, 0.86, 0.6) * a, a);
        }`,
    });
    const cone = new THREE.Mesh(coneGeo, coneMat);
    cone.position.set(0, 0.37, -1.2);
    cone.renderOrder = 4;
    rickshaw.model.root.add(cone);
    const poolGeo = new THREE.PlaneGeometry(3.2, 5.2);
    poolGeo.rotateX(-Math.PI / 2);
    const poolMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uDusk: globals.uDusk },
      vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uDusk;
        varying vec2 vUv;
        void main() {
          vec2 p = (vUv - vec2(0.5, 0.15)) * vec2(2.0, 1.25);
          float a = smoothstep(1.0, 0.0, length(p)) * (0.04 + 0.5 * uDusk);
          gl_FragColor = vec4(vec3(1.0, 0.85, 0.6) * a, a);
        }`,
    });
    const pool = new THREE.Mesh(poolGeo, poolMat);
    pool.position.set(0, -0.58, -4.0);
    pool.renderOrder = 4;
    rickshaw.model.root.add(pool);
    this.disposables.push(coneGeo, coneMat, poolGeo, poolMat);

    // ── Dust: a pool of points that each live ~1.3 s, animated entirely in the shader ──
    const dg = new THREE.BufferGeometry();
    const pos = new THREE.BufferAttribute(new Float32Array(DUST * 3), 3);
    const birth = new THREE.BufferAttribute(new Float32Array(DUST).fill(-100), 1);
    const seed = new THREE.BufferAttribute(new Float32Array(DUST).map(() => Math.random()), 1);
    pos.setUsage(THREE.DynamicDrawUsage);
    birth.setUsage(THREE.DynamicDrawUsage);
    dg.setAttribute('position', pos);
    dg.setAttribute('aBirth', birth);
    dg.setAttribute('aSeed', seed);
    this.dustAttr = { pos, birth, seed };
    const dm = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uTime: globals.uTime, uScale: { value: window.innerHeight * 0.5 } },
      vertexShader: /* glsl */ `
        attribute float aBirth, aSeed;
        uniform float uTime, uScale;
        varying float vA;
        void main() {
          float age = uTime - aBirth;
          float life = 1.3;
          float t = clamp(age / life, 0.0, 1.0);
          vec3 p = position + vec3(sin(aSeed * 40.0) * 0.6, 0.9 + aSeed * 0.5, cos(aSeed * 23.0) * 0.6) * (1.0 - pow(1.0 - t, 2.0));
          vA = (age < 0.0 || age > life) ? 0.0 : (1.0 - t) * (1.0 - t) * 0.42;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = uScale * (1.1 + t * 2.6) / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying float vA;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          gl_FragColor = vec4(vec3(0.86, 0.74, 0.6), vA * pow(smoothstep(0.5, 0.0, d), 1.6));
        }`,
    });
    this.dust = new THREE.Points(dg, dm);
    this.dust.frustumCulled = false;
    this.group.add(this.dust);
    this.disposables.push(dg, dm);

    // ── Skid marks: a ring buffer of dark quads that fade out over SKID_LIFE seconds ──
    const sg = new THREE.PlaneGeometry(0.22, 1);
    sg.rotateX(-Math.PI / 2);
    const skidBirth = new Float32Array(SKIDS).fill(-100);
    this.skidBirth = new THREE.InstancedBufferAttribute(skidBirth, 1);
    this.skidBirth.setUsage(THREE.DynamicDrawUsage);
    sg.setAttribute('aBirth', this.skidBirth);
    const sm = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
      uniforms: { uTime: globals.uTime },
      vertexShader: /* glsl */ `
        attribute float aBirth;
        uniform float uTime;
        varying float vA;
        varying vec2 vUv;
        void main() {
          float age = uTime - aBirth;
          vA = age < 0.0 ? 0.0 : 0.62 * (1.0 - smoothstep(${(SKID_LIFE * 0.4).toFixed(1)}, ${SKID_LIFE.toFixed(1)}, age));
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        varying float vA;
        varying vec2 vUv;
        void main() {
          float edge = smoothstep(0.0, 0.35, vUv.x) * smoothstep(1.0, 0.65, vUv.x);
          gl_FragColor = vec4(0.09, 0.07, 0.06, vA * edge);
        }`,
    });
    this.skids = new THREE.InstancedMesh(sg, sm, SKIDS);
    this.skids.frustumCulled = false;
    this.skids.renderOrder = 1;
    this.m.makeScale(0, 0, 0);
    for (let i = 0; i < SKIDS; i++) this.skids.setMatrixAt(i, this.m);
    this.group.add(this.skids);
    this.disposables.push(sg, sm);
    scene.add(this.group);
  }

  update(elapsed: number, delta: number): void {
    const r = this.rickshaw;
    const p = r.physics;
    const speed = Math.abs(p.forwardSpeed);
    // lateral slip from the body's velocity against its right axis
    const rot = p.body.rotation();
    this.q.set(rot.x, rot.y, rot.z, rot.w);
    const right = this.s.set(1, 0, 0).applyQuaternion(this.q);
    const lin = p.body.linvel();
    const slip = Math.abs(lin.x * right.x + lin.z * right.z);
    const braking = (this.input.throttle < -0.1 && p.forwardSpeed > 4) || (this.input.down.has('handbrake') && speed > 3);
    const skidding = p.contacts >= 3 && (slip > 2.4 || braking);
    this.skid = skidding ? Math.min(1, 0.25 + Math.max(0, slip - 2.4) / 6 + (braking ? 0.25 : 0)) * Math.min(1, speed / 4) : 0;

    // Dust: emit at the rear wheels while skidding, a few per wheel per second-ish.
    this.emitClock += delta;
    if (skidding && this.emitClock > 0.035) {
      this.emitClock = 0;
      for (const wheel of r.model.rearWheels) {
        wheel.getWorldPosition(this.w);
        const i = this.dustHead;
        this.dustHead = (this.dustHead + 1) % DUST;
        this.dustAttr.pos.setXYZ(i, this.w.x, 0.1, this.w.z);
        this.dustAttr.birth.setX(i, elapsed);
      }
      this.dustAttr.pos.needsUpdate = true;
      this.dustAttr.birth.needsUpdate = true;
    }

    // Skid marks: lay a segment from each rear wheel's last mark to where it is now.
    r.model.rearWheels.forEach((wheel, k) => {
      wheel.getWorldPosition(this.w);
      this.w.y = 0.035;
      const last = this.lastWheel[k];
      if (!skidding) {
        this.lastWheel[k] = null;
        return;
      }
      if (!last) {
        this.lastWheel[k] = this.w.clone();
        return;
      }
      const len = last.distanceTo(this.w);
      if (len < 0.25) return;
      this.v.addVectors(last, this.w).multiplyScalar(0.5);
      const yaw = Math.atan2(this.w.x - last.x, this.w.z - last.z);
      this.m.compose(this.v, this.q.setFromAxisAngle(this.s.set(0, 1, 0), yaw), this.s.set(1, 1, len + 0.04));
      const i = this.skidHead;
      this.skidHead = (this.skidHead + 1) % SKIDS;
      this.skids.setMatrixAt(i, this.m);
      this.skidBirth.setX(i, elapsed);
      this.skids.instanceMatrix.needsUpdate = true;
      this.skidBirth.needsUpdate = true;
      last.copy(this.w);
    });
  }

  dispose(): void {
    this.group.removeFromParent();
    this.disposables.forEach((d) => d.dispose());
  }
}
