import * as THREE from 'three';
import type * as RAPIER from '@dimforge/rapier3d-compat';

export type Rapier = (typeof RAPIER)['default'];

/** A rendered object that mirrors a rigid body, interpolated between fixed steps. */
interface Link {
  body: RAPIER.RigidBody;
  object: THREE.Object3D;
  prevPos: THREE.Vector3;
  prevQuat: THREE.Quaternion;
  currPos: THREE.Vector3;
  currQuat: THREE.Quaternion;
}

/**
 * Rapier world on a fixed 60 Hz step with render interpolation, so motion is
 * identical (and smooth) on 60, 120 and 144 Hz screens.
 */
export class Physics {
  static readonly STEP = 1 / 60;
  /** Slightly heavy gravity: low-poly toys feel floaty at real 9.81. */
  static readonly GRAVITY = 9.81 * 1.6;

  readonly world: RAPIER.World;
  /** 0…1, how far the render frame sits between the last two physics steps. */
  alpha = 0;
  private accumulator = 0;
  private readonly links: Link[] = [];

  /** Loads the Rapier wasm (its own lazy chunk) and builds the world. */
  static async load(): Promise<Physics> {
    const R = (await import('@dimforge/rapier3d-compat')).default;
    await R.init();
    return new Physics(R);
  }

  private constructor(readonly R: Rapier) {
    this.world = new R.World({ x: 0, y: -Physics.GRAVITY, z: 0 });
    this.world.timestep = Physics.STEP;
  }

  /** Make `object` follow `body` every frame. */
  link(body: RAPIER.RigidBody, object: THREE.Object3D): void {
    const t = body.translation();
    const r = body.rotation();
    const pos = new THREE.Vector3(t.x, t.y, t.z);
    const quat = new THREE.Quaternion(r.x, r.y, r.z, r.w);
    this.links.push({ body, object, prevPos: pos.clone(), prevQuat: quat.clone(), currPos: pos, currQuat: quat });
    object.position.copy(pos);
    object.quaternion.copy(quat);
  }

  unlink(object: THREE.Object3D): void {
    const i = this.links.findIndex((l) => l.object === object);
    if (i >= 0) this.links.splice(i, 1);
  }

  /** Snap a link to its body (after a teleport/reset), so it doesn't interpolate across the map. */
  snap(body: RAPIER.RigidBody): void {
    const l = this.links.find((x) => x.body === body);
    if (!l) return;
    this.read(l);
    l.prevPos.copy(l.currPos);
    l.prevQuat.copy(l.currQuat);
  }

  /**
   * Advance by the frame's delta. `beforeStep` runs once per fixed step
   * (vehicle controllers, forces) right before Rapier integrates.
   */
  update(delta: number, beforeStep: (dt: number) => void): void {
    this.accumulator += delta;
    while (this.accumulator >= Physics.STEP) {
      for (const l of this.links) {
        l.prevPos.copy(l.currPos);
        l.prevQuat.copy(l.currQuat);
      }
      beforeStep(Physics.STEP);
      this.world.step();
      for (const l of this.links) this.read(l);
      this.accumulator -= Physics.STEP;
    }
    this.alpha = this.accumulator / Physics.STEP;
    for (const l of this.links) {
      l.object.position.lerpVectors(l.prevPos, l.currPos, this.alpha);
      l.object.quaternion.slerpQuaternions(l.prevQuat, l.currQuat, this.alpha);
    }
  }

  private read(l: Link): void {
    const t = l.body.translation();
    const r = l.body.rotation();
    l.currPos.set(t.x, t.y, t.z);
    l.currQuat.set(r.x, r.y, r.z, r.w);
  }

  dispose(): void {
    this.links.length = 0;
    this.world.free();
  }
}
