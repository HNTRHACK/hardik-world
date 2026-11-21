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
import { World } from './world/World';
import { updateOcclusion } from './world/geo/occlusion';
import { Rickshaw } from './vehicle/Rickshaw';
import { Stalls } from './stalls/Stalls';
import { ProjectPanel } from './ui/ProjectPanel';
import { PlacesMenu } from './ui/PlacesMenu';
import { Minimap } from './ui/Minimap';
import { PLACES } from './stalls/places';
import { PostFX } from './render/PostFX';
import { Quality } from './render/Quality';
import { Mood } from './world/Mood';
import { globals } from './world/geo/patches';
import { RickshawFX } from './vehicle/RickshawFX';
import { TouchControls } from './ui/TouchControls';
import { RotateHint } from './ui/RotateHint';
import { Sound, type SoundSource } from './audio/Sound';
import { seaX } from './world/layout';

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
  world!: World;
  stalls!: Stalls;
  readonly panel = new ProjectPanel();
  private hint!: ControlsHint;
  private menu!: PlacesMenu;
  post!: PostFX;
  quality!: Quality;
  mood!: Mood;
  private fx!: RickshawFX;
  private minimap!: Minimap;
  private touch!: TouchControls;
  private rotateHint!: RotateHint;
  sound!: Sound;
  private panelWasOpen = false;
  private readonly right = new THREE.Vector3();
  private readonly soundSource: SoundSource = {
    speed: 0, throttle: 0, boost: false, horn: false, skid: 0, x: 0, z: 0, vx: 0, vz: 0,
    rightX: 1, rightZ: 0, seaDistance: 100, teleporting: false, chai: null, omen: null,
  };
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
    this.mood = new Mood(this.debug);
    this.camera = new Camera(this.sizes, this.debug);
    this.renderer = new Renderer(this.container, this.sizes, this.debug);
    this.post = new PostFX(this.renderer.instance, this.debug);
    this.quality = new Quality((l) => {
      this.post.params.enabled = l.post;
      this.post.params.bloom = l.bloom;
      this.post.setSamples(l.msaa);
      this.sizes.setMaxPixelRatio(l.maxPixelRatio);
      this.environment?.setShadowMapSize(l.shadowMap);
    }, this.debug);
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
          await this.build();
        },
      },
    ]);
    // Compile every shader up front, for the same output the first frame will use (the post
    // target or the screen: they compile differently), so the first frame doesn't hitch.
    const r = this.renderer.instance;
    r.setRenderTarget(this.post.enabled ? this.post.target : null);
    if (r.extensions.has('KHR_parallel_shader_compile')) await r.compileAsync(this.scene, this.camera.instance);
    else r.compile(this.scene, this.camera.instance);
    r.setRenderTarget(null);
    this.loader.set(1, 'Ready');
    await this.camera.enableDebugOrbit(this.renderer.instance.domElement);
    this.camera.enableUserControl(this.renderer.instance.domElement);
    this.camera.jump(this.rickshaw.position);
    if (this.post.enabled) this.post.render(this.scene, this.camera.instance);
    else this.renderer.instance.render(this.scene, this.camera.instance);
    this.loader.done();
    this.hint = new ControlsHint(this.input);
    this.menu = new PlacesMenu(PLACES);
    this.menu.onSelect = (id) => void this.travelTo(id);
    this.minimap = new Minimap(this.world.net, this.stalls.stalls);
    this.minimap.onSelect = (id) => void this.travelTo(id);
    this.stalls.onLabel = (id) => void this.travelTo(id);
    this.touch = new TouchControls(this.input);
    this.rotateHint = new RotateHint();
    this.sound = new Sound();
    const at = (id: string) => {
      const p = this.stalls.get(id)?.plot;
      return p ? { x: p.x, z: p.z } : null;
    };
    this.soundSource.chai = at('chaipay');
    this.soundSource.omen = at('omen');
    this.time.start();
    if (this.debug.active) (window as unknown as { __lane?: Experience }).__lane = this;
  }

  private async build(): Promise<void> {
    // The hoarding, clippings and panels paint with these faces: load them before any canvas draws.
    await Promise.all(
      ['400 40px "Instrument Serif"', '600 20px "Instrument Sans"', '700 40px "Baloo 2"'].map((f) => document.fonts.load(f).catch(() => [])),
    );
    this.environment = new Environment(this.scene, this.renderer.instance, this.debug);
    this.environment.setShadowMapSize(this.quality.current.shadowMap);
    this.world = await World.create(this.scene, this.physics, this.debug, this.environment.sunDirection);
    this.stalls = new Stalls(this.scene, this.physics, this.world.plots, this.panel);
    this.rickshaw = new Rickshaw(this.scene, this.physics, this.input, this.world.spawn);
    this.rickshaw.update(0);
    this.fx = new RickshawFX(this.scene, this.rickshaw, this.input);
    this.environment.bindMood(this.mood);
    this.post.bindMood(this.mood);
    this.world.bindMood(this.mood);
  }

  /**
   * Projects menu / minimap: put the rickshaw at a place's ring, glide the camera
   * there, then open its panel (as if you'd driven in, so driving away closes it).
   */
  async travelTo(id: string): Promise<void> {
    const st = this.stalls.get(id);
    if (!st || this.camera.flying) return;
    // Already parked at it: just open.
    const here = this.rickshaw.position;
    if (Math.hypot(here.x - st.plot.ring.x, here.z - st.plot.ring.z) < 4) {
      this.stalls.open(id, 'label');
      return;
    }
    if (this.panel.current) this.panel.close('away');
    this.stalls.suspended = true;
    const r = st.plot.ring;
    // face along the road, toward the stall's side
    const yaw = st.plot.yaw + Math.PI / 2;
    this.rickshaw.physics.reset({ x: r.x, z: r.z, yaw });
    this.panel.announce(`Travelling to ${st.place.short}.`);
    await this.camera.flyTo(new THREE.Vector3(r.x, 0.6, r.z), 1.5);
    this.stalls.suspended = false;
    this.stalls.open(id, 'ring');
  }

  private readonly update = ({ delta, elapsed, raw }: TickInfo): void => {
    globals.uTime.value = elapsed;
    this.quality.sample(raw);
    const active = this.input.active || Math.abs(this.rickshaw.speed) > 0.6 || this.camera.userControlled;
    this.mood.update(delta, active);
    this.physics.update(delta, (dt) => this.rickshaw.fixedUpdate(dt));
    this.rickshaw.update(delta);
    this.world.update(elapsed, delta, this.rickshaw.position);
    this.fx.update(elapsed, delta);
    this.camera.follow(this.rickshaw.position, this.rickshaw.velocity, delta);
    // Keep the stall and rickshaw in view beside (desktop) or above (phone) an open panel.
    const w = this.sizes.width;
    if (this.panel.current) this.camera.setFrameShift(w > 640 ? (Math.min(480, w - 32) + 16) / 2 : 0, w > 640 ? 0 : this.sizes.height * 0.27);
    else this.camera.setFrameShift(0, 0);
    this.camera.update(delta);
    this.stalls.update(elapsed, delta, this.rickshaw, this.camera.instance, this.sizes.width, this.sizes.height);
    this.environment.follow(this.camera.target, this.camera.instance.position);
    updateOcclusion(this.camera.instance, this.rickshaw.position, delta);
    const panelOpen = !!this.panel.current;
    if (panelOpen !== this.panelWasOpen) {
      this.panelWasOpen = panelOpen;
      this.touch?.setPanelOpen(panelOpen);
    }
    if (this.sound) this.updateSound(delta);
    this.minimap?.update(this.rickshaw.position.x, this.rickshaw.position.z, this.rickshaw.physics.yaw, this.panel.current?.id ?? null);
    if (this.post.enabled) this.post.render(this.scene, this.camera.instance);
    else {
      this.renderer.instance.setRenderTarget(null);
      this.renderer.instance.render(this.scene, this.camera.instance);
    }
  };

  private updateSound(delta: number): void {
    const s = this.soundSource;
    const p = this.rickshaw.physics;
    const pos = this.rickshaw.position;
    const v = p.body.linvel();
    this.right.setFromMatrixColumn(this.camera.instance.matrixWorld, 0);
    s.speed = p.forwardSpeed;
    s.throttle = this.input.throttle;
    s.boost = this.input.down.has('boost');
    s.horn = this.input.down.has('horn');
    s.skid = this.fx.skid;
    s.x = pos.x;
    s.z = pos.z;
    s.vx = v.x;
    s.vz = v.z;
    s.rightX = this.right.x;
    s.rightZ = this.right.z;
    s.seaDistance = Math.max(0, pos.x - seaX(Math.max(-110, Math.min(110, pos.z))));
    s.teleporting = this.camera.flying || this.input.down.has('reset');
    this.sound.update(delta, s);
  }

  dispose(): void {
    this.offTick();
    this.sound?.dispose();
    this.touch?.dispose();
    this.rotateHint?.dispose();
    this.time.dispose();
    this.hint?.dispose();
    this.fx?.dispose();
    this.post?.dispose();
    this.menu?.dispose();
    this.minimap?.dispose();
    this.rickshaw?.dispose();
    this.stalls?.dispose();
    this.panel.dispose();
    this.world?.dispose();
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
