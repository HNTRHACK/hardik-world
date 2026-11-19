import type * as RAPIER from '@dimforge/rapier3d-compat';

/*
 * The rickshaw's rigid body + Rapier ray-cast vehicle, with the arcade layer on top.
 *
 * Kept free of three.js (and of TS-only syntax) on purpose: the same file is run
 * headless in Node to tune and regression-test the handling.
 *
 * Frame: forward is -Z, up is +Y, right is +X. The body origin sits ~0.7 m above the road.
 */

type Rapier = (typeof RAPIER)['default'];
type Vec = { x: number; y: number; z: number };
type Quat = { x: number; y: number; z: number; w: number };

/** What the driver asks for. Analog so the mobile joystick (milestone 7) plugs straight in. */
export interface DriveInput {
  /** -1 (reverse/brake) … 1 (accelerate) */
  throttle: number;
  /** -1 (left) … 1 (right) */
  steer: number;
  handbrake: boolean;
  boost: boolean;
}

export interface Spawn {
  x: number;
  z: number;
  /** Heading in radians around +Y; 0 faces -Z. */
  yaw: number;
}

export const RICKSHAW = {
  mass: 170,
  /** Low centre of mass: the single biggest "doesn't flip on every corner" lever. */
  centerOfMass: { x: 0, y: -0.38, z: 0.1 },
  body: { x: 0.6, y: 0.3, z: 1.2 },
  canopy: { half: { x: 0.58, y: 0.3, z: 0.72 }, offset: { x: 0, y: 0.62, z: 0.15 } },
  wheelRadius: 0.3,
  suspensionRest: 0.3,
  suspensionTravel: 0.25,
  suspensionStiffness: 34,
  suspensionCompression: 2.6,
  suspensionRelaxation: 3.4,
  frictionSlip: 2.4,
  sideFrictionStiffness: 1.1,
  /**
   * Two close front rays read as the single front wheel; one ray alone makes the
   * three-wheeler tip over at walking pace. Index 0/1 = front, 2/3 = rear (driven).
   */
  wheels: [
    { x: 0.2, y: -0.12, z: -0.98 },
    { x: -0.2, y: -0.12, z: -0.98 },
    { x: 0.6, y: -0.12, z: 0.78 },
    { x: -0.6, y: -0.12, z: 0.78 },
  ],
  engineForce: 900,
  reverseForce: 520,
  boostMultiplier: 1.6,
  maxSpeed: 15, // m/s ≈ 54 km/h: brisk for a rickshaw, still readable on a small street
  maxReverseSpeed: 6,
  boostMaxSpeed: 22,
  brakeForce: 6,
  rollingBrake: 0.6,
  handbrakeForce: 3,
  handbrakeRearSlip: 1.2,
  /** Steering lock in radians at standstill and at top speed. */
  steerLow: 0.6,
  steerHigh: 0.16,
  /** How fast the wheel turns toward the target (per second). */
  steerRate: 5,
  /** Torque that rights the body when it tilts; strongest in the air. */
  uprightStrength: 9,
  uprightDamping: 2.2,
  /** Seconds upside down / stuck before an automatic reset. */
  flipResetDelay: 1.4,
  /** Below this height you fell off the world: respawn. */
  killY: -8,
} as const;

function rotate(q: Quat, v: Vec): Vec {
  // v' = v + 2w(q×v) + 2q×(q×v)
  const tx = 2 * (q.y * v.z - q.z * v.y);
  const ty = 2 * (q.z * v.x - q.x * v.z);
  const tz = 2 * (q.x * v.y - q.y * v.x);
  return {
    x: v.x + q.w * tx + (q.y * tz - q.z * ty),
    y: v.y + q.w * ty + (q.z * tx - q.x * tz),
    z: v.z + q.w * tz + (q.x * ty - q.y * tx),
  };
}

function yawQuat(yaw: number): Quat {
  return { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) };
}

const approach = (from: number, to: number, rate: number, dt: number) =>
  from + (to - from) * (1 - Math.exp(-rate * dt));

export class RickshawPhysics {
  readonly body: RAPIER.RigidBody;
  readonly controller: RAPIER.DynamicRayCastVehicleController;
  /** Smoothed steering angle actually applied to the front wheels (radians, + = left). */
  steering = 0;
  /** Signed speed along the rickshaw's nose (m/s). */
  forwardSpeed = 0;
  /** Wheels touching the ground this step. */
  contacts = 0;
  /** Bumped on every teleport so the renderer can snap instead of interpolating across the map. */
  resets = 0;
  private stuckTime = 0;
  private readonly spawn: Spawn;
  private readonly world: RAPIER.World;

  constructor(R: Rapier, world: RAPIER.World, spawn: Spawn) {
    this.world = world;
    this.spawn = spawn;
    const S = RICKSHAW;
    const q = yawQuat(spawn.yaw);
    this.body = world.createRigidBody(
      R.RigidBodyDesc.dynamic()
        .setTranslation(spawn.x, 1.2, spawn.z)
        .setRotation(q)
        .setCanSleep(false)
        .setLinearDamping(0.05)
        .setAngularDamping(0.6),
    );

    // Mass lives on the main box (with a low centre of mass); the canopy only adds shape.
    const h = S.body;
    const ix = (S.mass / 12) * (4 * h.y * h.y + 4 * h.z * h.z);
    const iy = (S.mass / 12) * (4 * h.x * h.x + 4 * h.z * h.z);
    const iz = (S.mass / 12) * (4 * h.x * h.x + 4 * h.y * h.y);
    world.createCollider(
      R.ColliderDesc.cuboid(h.x, h.y, h.z)
        .setMassProperties(S.mass, S.centerOfMass, { x: ix, y: iy, z: iz }, { x: 0, y: 0, z: 0, w: 1 })
        .setFriction(0.4)
        .setRestitution(0.1),
      this.body,
    );
    const c = S.canopy;
    world.createCollider(
      R.ColliderDesc.cuboid(c.half.x, c.half.y, c.half.z)
        .setTranslation(c.offset.x, c.offset.y, c.offset.z)
        .setDensity(0)
        .setFriction(0.3),
      this.body,
    );

    const vc = world.createVehicleController(this.body);
    S.wheels.forEach((w) => {
      vc.addWheel(w, { x: 0, y: -1, z: 0 }, { x: 1, y: 0, z: 0 }, S.suspensionRest, S.wheelRadius);
    });
    for (let i = 0; i < S.wheels.length; i++) {
      vc.setWheelSuspensionStiffness(i, S.suspensionStiffness);
      vc.setWheelSuspensionCompression(i, S.suspensionCompression);
      vc.setWheelSuspensionRelaxation(i, S.suspensionRelaxation);
      vc.setWheelMaxSuspensionTravel(i, S.suspensionTravel);
      vc.setWheelMaxSuspensionForce(i, 60000);
      vc.setWheelFrictionSlip(i, S.frictionSlip);
      vc.setWheelSideFrictionStiffness(i, S.sideFrictionStiffness);
    }
    this.controller = vc;
  }

  /** One fixed physics step. Call right before `world.step()`. */
  update(input: DriveInput, dt: number): void {
    const S = RICKSHAW;
    const vc = this.controller;
    const body = this.body;
    const rot = body.rotation();
    const vel = body.linvel();
    const nose = rotate(rot, { x: 0, y: 0, z: -1 });
    this.forwardSpeed = vel.x * nose.x + vel.y * nose.y + vel.z * nose.z;
    const speed = this.forwardSpeed;
    const abs = Math.abs(speed);

    // Steering: less lock the faster you go, smoothed so keyboard taps don't jerk.
    const topSpeed = input.boost ? S.boostMaxSpeed : S.maxSpeed;
    const lock = S.steerLow + (S.steerHigh - S.steerLow) * Math.min(abs / S.maxSpeed, 1);
    this.steering = approach(this.steering, -input.steer * lock, S.steerRate, dt);
    vc.setWheelSteering(0, this.steering);
    vc.setWheelSteering(1, this.steering);

    // Throttle / brake / reverse.
    let engine = 0;
    let brake = 0;
    const t = input.throttle;
    if (t > 0.01) {
      if (speed < -0.5) brake = S.brakeForce * t; // moving backwards: brake first
      else {
        const headroom = Math.max(0, 1 - speed / topSpeed);
        engine = S.engineForce * t * (input.boost ? S.boostMultiplier : 1) * Math.min(1, headroom * 3);
      }
    } else if (t < -0.01) {
      if (speed > 0.5) brake = S.brakeForce * -t;
      else {
        const headroom = Math.max(0, 1 + speed / S.maxReverseSpeed);
        engine = S.reverseForce * t * Math.min(1, headroom * 3);
      }
    } else {
      brake = S.rollingBrake;
    }
    vc.setWheelEngineForce(2, engine / 2);
    vc.setWheelEngineForce(3, engine / 2);
    for (let i = 0; i < 4; i++) vc.setWheelBrake(i, brake);
    const rearSlip = input.handbrake ? S.handbrakeRearSlip : S.frictionSlip;
    vc.setWheelFrictionSlip(2, rearSlip);
    vc.setWheelFrictionSlip(3, rearSlip);
    if (input.handbrake) {
      vc.setWheelBrake(2, S.handbrakeForce);
      vc.setWheelBrake(3, S.handbrakeForce);
    }

    vc.updateVehicle(dt);

    this.contacts = 0;
    for (let i = 0; i < 4; i++) if (vc.wheelIsInContact(i)) this.contacts++;

    // Arcade "self-righting": a spring torque toward upright, damped on the roll/pitch axes.
    const up = rotate(rot, { x: 0, y: 1, z: 0 });
    const ang = body.angvel();
    const airborne = this.contacts < 3;
    const k = S.uprightStrength * (airborne ? 1 : Math.max(0, 1 - up.y) * 4);
    const d = S.uprightDamping * (airborne ? 1 : 0.35);
    const m = S.mass * dt;
    body.applyTorqueImpulse(
      { x: (-up.z * k - ang.x * d) * m, y: 0, z: (up.x * k - ang.z * d) * m },
      true,
    );

    // Stuck on its side / roof, or fell off the world → put it back.
    const pos = body.translation();
    if (pos.y < S.killY) return this.reset(this.spawn);
    this.stuckTime = up.y < 0.35 ? this.stuckTime + dt : 0;
    if (this.stuckTime > S.flipResetDelay) this.resetInPlace();
  }

  /** Heading in radians (0 = facing -Z), from the nose vector. */
  get yaw(): number {
    const n = rotate(this.body.rotation(), { x: 0, y: 0, z: -1 });
    return Math.atan2(-n.x, -n.z);
  }

  /** Lift it back onto its wheels where it is, keeping the heading. */
  resetInPlace(): void {
    const p = this.body.translation();
    this.reset({ x: p.x, z: p.z, yaw: this.yaw });
  }

  reset(spawn: Spawn): void {
    const b = this.body;
    b.setTranslation({ x: spawn.x, y: 1.2, z: spawn.z }, true);
    b.setRotation(yawQuat(spawn.yaw), true);
    b.setLinvel({ x: 0, y: 0, z: 0 }, true);
    b.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.steering = 0;
    this.stuckTime = 0;
    this.resets++;
  }

  dispose(): void {
    this.world.removeVehicleController(this.controller);
    this.world.removeRigidBody(this.body);
  }
}
