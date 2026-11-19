import * as THREE from 'three';
import type { Physics } from '../physics/Physics';
import type { Input } from '../core/Input';
import { RickshawPhysics, RICKSHAW, type Spawn } from './RickshawPhysics';
import { RickshawModel } from './RickshawModel';

const damp = (from: number, to: number, rate: number, dt: number) =>
  THREE.MathUtils.lerp(from, to, 1 - Math.exp(-rate * dt));

/** The player's auto-rickshaw: input → arcade physics → interpolated low-poly model. */
export class Rickshaw {
  readonly physics: RickshawPhysics;
  readonly model = new RickshawModel();
  /** Interpolated world position, the camera's focus. */
  readonly position = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  private seenResets = 0;
  private lean = 0;
  private pitch = 0;
  private lastSpeed = 0;
  private wheelAngle = 0;
  private readonly offPress: () => void;

  constructor(
    scene: THREE.Scene,
    private readonly world: Physics,
    private readonly input: Input,
    spawn: Spawn,
  ) {
    this.physics = new RickshawPhysics(world.R, world.world, spawn);
    scene.add(this.model.root);
    world.link(this.physics.body, this.model.root);
    this.offPress = input.on('press', (a) => {
      if (a === 'reset') this.physics.resetInPlace();
    });
  }

  /** Once per fixed physics step. */
  fixedUpdate(dt: number): void {
    this.physics.update(
      {
        throttle: this.input.throttle,
        steer: this.input.steer,
        handbrake: this.input.down.has('handbrake'),
        boost: this.input.down.has('boost'),
      },
      dt,
    );
  }

  /** Once per rendered frame, after physics. */
  update(delta: number): void {
    const p = this.physics;
    if (p.resets !== this.seenResets) {
      this.seenResets = p.resets;
      this.world.snap(p.body);
    }
    this.position.copy(this.model.root.position);
    const v = p.body.linvel();
    this.velocity.set(v.x, v.y, v.z);

    // Wheels: suspension travel, front steering, roll from forward speed.
    const vc = p.controller;
    const w = RICKSHAW.wheels;
    const wheelY = (i: number) => w[i].y - (vc.wheelSuspensionLength(i) ?? RICKSHAW.suspensionRest);
    this.wheelAngle -= (p.forwardSpeed * delta) / RICKSHAW.wheelRadius;
    const m = this.model;
    m.frontWheel.position.y = (wheelY(0) + wheelY(1)) / 2;
    m.frontWheel.rotation.y = p.steering;
    m.rearWheels[0].position.y = wheelY(2);
    m.rearWheels[1].position.y = wheelY(3);
    for (const wheel of [m.frontWheel, ...m.rearWheels]) RickshawModel.spinOf(wheel).rotation.x = this.wheelAngle;

    // Body language: lean out of corners, squat on throttle, dive on brakes (visual only).
    const yawRate = p.body.angvel().y;
    const lateral = THREE.MathUtils.clamp(-yawRate * p.forwardSpeed, -30, 30);
    const accel = delta > 0 ? (p.forwardSpeed - this.lastSpeed) / delta : 0;
    this.lastSpeed = p.forwardSpeed;
    this.lean = damp(this.lean, lateral * 0.0045, 8, delta);
    this.pitch = damp(this.pitch, THREE.MathUtils.clamp(accel, -25, 15) * 0.0035, 6, delta);
    m.shell.rotation.set(this.pitch, 0, this.lean);
  }

  get speed(): number {
    return this.physics.forwardSpeed;
  }

  dispose(): void {
    this.offPress();
    this.world.unlink(this.model.root);
    this.physics.dispose();
    this.model.dispose();
  }
}
