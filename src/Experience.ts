import * as THREE from 'three';
import { Time, type TickInfo } from './core/Time';
import { Sizes } from './core/Sizes';
import { Debug } from './core/Debug';
import { Camera } from './core/Camera';
import { Renderer } from './core/Renderer';
import { Progress } from './core/Progress';
import { Input } from './core/Input';
import { Physics } from './physics/Physics';
import { Loader } from './ui/Loader';
import { ControlsHint } from './ui/ControlsHint';
import { Environment } from './world/Environment';
import { Ground } from './world/Ground';
import { CalibrationProps } from './world/CalibrationProps';
import { Rickshaw } from './vehicle/Rickshaw';
import type { Spawn } from './vehicle/RickshawPhysics';

const SPAWN: Spawn = { x: 0, z: 8, yaw: 0 };

/** Owns every system. One instance per page; `dispose()` frees all GPU resources. */
export class Experience {
  readonly scene = new THREE.Scene();
  readonly time = new Time();
  readonly sizes = new Sizes();
  readonly debug = new Debug();
  readonly input = new Input();
  camera!: Camera;
  renderer!: Renderer;
  physics!: Physics;
  rickshaw!: Rickshaw;
  private environment!: Environment;
  private ground!: Ground;
  private props!: CalibrationProps;
  private hint!: ControlsHint;
  private readonly offTick: () => void;

  constructor(
    private readonly container: HTMLElement,
    private readonly loader: Loader,
  ) {
    this.offTick = this.time.on('tick', this.update);
  }

  async start(): Promise<void> {
    // Debug must exist before any system asks it for a folder.
    await this.debug.init();
    this.camera = new Camera(this.sizes, this.debug);
    this.renderer = new Renderer(this.container, this.sizes, this.debug);
    const progress = new Progress((ratio, label) => this.loader.set(ratio, label));
    const physicsReady = Physics.load();
    await progress.run([
      { label: 'Painting the sky', weight: 1, run: () => document.fonts.ready },
      { label: 'Fuelling the rickshaw', weight: 3, run: () => physicsReady },
      {
        label: 'Building the lane',
        weight: 2,
        run: async () => {
          this.physics = await physicsReady;
          this.build();
        },
      },
    ]);
    // Compile every shader up front so the first frame doesn't hitch (async where the GPU supports it).
    const r = this.renderer.instance;
    if (r.extensions.has('KHR_parallel_shader_compile')) await r.compileAsync(this.scene, this.camera.instance);
    else r.compile(this.scene, this.camera.instance);
    this.loader.set(1, 'Ready');
    await this.camera.enableDebugOrbit(this.renderer.instance.domElement);
    this.camera.jump(this.rickshaw.position);
    this.renderer.instance.render(this.scene, this.camera.instance);
    this.loader.done();
    this.hint = new ControlsHint(this.input);
    this.time.start();
    if (this.debug.active) (window as unknown as { __lane?: Experience }).__lane = this;
  }

  private build(): void {
    this.environment = new Environment(this.scene, this.debug);
    this.ground = new Ground(this.scene, this.physics);
    this.props = new CalibrationProps(this.scene, this.physics);
    this.rickshaw = new Rickshaw(this.scene, this.physics, this.input, SPAWN);
    this.rickshaw.update(0);
  }

  private readonly update = ({ delta }: TickInfo): void => {
    this.physics.update(delta, (dt) => this.rickshaw.fixedUpdate(dt));
    this.rickshaw.update(delta);
    this.camera.follow(this.rickshaw.position, this.rickshaw.velocity, delta);
    this.environment.follow(this.camera.target);
    this.camera.update();
    this.renderer.instance.render(this.scene, this.camera.instance);
  };

  dispose(): void {
    this.offTick();
    this.time.dispose();
    this.hint?.dispose();
    this.rickshaw?.dispose();
    this.props?.dispose();
    this.ground?.dispose();
    this.environment?.dispose();
    this.physics?.dispose();
    this.camera?.dispose();
    this.renderer?.dispose();
    this.input.dispose();
    this.sizes.dispose();
    this.debug.dispose();
    this.container.replaceChildren();
  }
}
