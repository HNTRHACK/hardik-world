import * as THREE from 'three';
import type { Debug } from '../core/Debug';
import type { Physics } from '../physics/Physics';
import type { Spawn } from '../vehicle/RickshawPhysics';
import { Buildings } from './Buildings';
import { Critters } from './Critters';
import { Ground } from './Ground';
import { RoadNet, makePlots, makeSpawn, type Plot } from './layout';
import { Plots } from './Plots';
import { Props } from './Props';
import { Roads } from './Roads';
import { Sea } from './Sea';
import { SignAtlas } from './Signs';
import { Spots } from './spots';
import { StreetLife } from './StreetLife';
import { Atmosphere } from './Atmosphere';
import { ContactShadows } from './ContactShadows';
import type { Mood } from './Mood';
import { globals, occlusion, rim } from './geo/patches';

/**
 * The neighbourhood: one place that builds every street system in the right
 * order (layout → roads → buildings → furniture → props → critters) and ticks
 * the animated ones.
 */
export class World {
  readonly net = new RoadNet();
  readonly plots: Plot[];
  readonly spawn: Spawn;
  private readonly parts: { dispose(): void }[] = [];
  private readonly sea: Sea;
  readonly critters: Critters;
  private readonly buildings: Buildings;
  private readonly street: StreetLife;
  private readonly atmosphere: Atmosphere;
  private readonly contact: ContactShadows;
  readonly stats: Record<string, number>;

  private constructor(scene: THREE.Scene, physics: Physics, debug: Debug, sun: THREE.Vector3, atlas: SignAtlas) {
    this.plots = makePlots(this.net);
    this.spawn = makeSpawn(this.net);
    const ground = new Ground(scene, physics);
    const roads = new Roads(scene, physics, this.net);
    this.sea = new Sea(scene, physics, sun);
    const buildings = (this.buildings = new Buildings(scene, physics, this.net, this.plots, atlas));
    const spots = new Spots(this.net, this.plots, buildings.lots);
    // keep the spawn point and every stall's trigger ring clear
    spots.claim(this.spawn.x, this.spawn.z, 4);
    for (const p of this.plots) spots.claim(p.ring.x, p.ring.z, p.ring.r + 0.9);
    const street = (this.street = new StreetLife(scene, physics, this.net, spots, buildings.lots));
    const props = new Props(scene, physics, this.net, spots, roads.potholes);
    this.critters = new Critters(scene, physics, this.net, spots);
    const plots = new Plots(scene, this.plots, debug);
    this.atmosphere = new Atmosphere(scene);
    // Soft contact shadows under every building and stall (cheap "baked AO").
    const contact = (this.contact = new ContactShadows(scene, [
      ...buildings.lots,
      ...this.plots.filter((p) => p.id !== 'cobrakai').map((p) => ({ ...p, w: p.w * 0.8, d: p.d * 0.7 })),
    ]));
    this.addDebug(debug);
    this.parts.push(ground, roads, this.sea, buildings, street, props, this.critters, plots, this.atmosphere, contact, atlas);
    this.stats = { buildings: buildings.lots.length, frontage: buildings.lots.filter((l) => l.front).length };
  }

  static async create(scene: THREE.Scene, physics: Physics, debug: Debug, sun: THREE.Vector3): Promise<World> {
    const atlas = await SignAtlas.create();
    return new World(scene, physics, debug, sun, atlas);
  }

  /** Lamps, lit windows, signboards and the skyline follow the golden-hour → dusk mood. */
  bindMood(mood: Mood): void {
    this.street.bindMood(mood);
    this.atmosphere.bindMood(mood);
    const win = this.buildings.windowMaterial;
    const sign = this.buildings.signMaterial;
    mood.on((t) => {
      win.emissiveIntensity = THREE.MathUtils.lerp(0.55, 1.9, t);
      sign.emissiveIntensity = THREE.MathUtils.lerp(0.26, 0.75, t);
    });
  }

  /** Art toggles under #debug → Look. */
  addDebug(debug: Debug): void {
    const f = debug.folder('Look');
    if (!f) return;
    f.add(rim.uRimStrength, 'value', 0, 2, 0.01).name('stall rim light');
    const o = occlusion.settings;
    f.add(o, 'enabled').name('cutaway buildings');
    f.add(o, 'zoneX', 0.1, 1, 0.01).name('cutaway zone width');
    f.add(o, 'zoneTop', -0.3, 1, 0.01).name('cutaway zone top');
    f.add(o, 'fadeSeconds', 0.02, 1, 0.01).name('cutaway fade (s)');
    f.add(globals.uWind.value, 'x', -2, 2, 0.01).name('wind x');
    f.add(globals.uWind.value, 'y', -2, 2, 0.01).name('wind z');
    f.add(this.contact.mesh, 'visible').name('contact shadows');
    f.add(this.atmosphere.group, 'visible').name('skyline + birds');
    f.add(this.street.group.children.find((c) => (c as THREE.Mesh).material && ((c as THREE.Mesh).material as THREE.Material).side === THREE.DoubleSide) ?? { visible: true }, 'visible').name('bunting');
  }

  update(elapsed: number, delta: number, rickshaw: THREE.Vector3): void {
    this.sea.update(elapsed);
    this.atmosphere.update(elapsed);
    this.critters.update(elapsed, delta, rickshaw);
  }

  dispose(): void {
    this.parts.forEach((p) => p.dispose());
  }
}
