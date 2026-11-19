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
  readonly stats: Record<string, number>;

  private constructor(scene: THREE.Scene, physics: Physics, debug: Debug, sun: THREE.Vector3, atlas: SignAtlas) {
    this.plots = makePlots(this.net);
    this.spawn = makeSpawn(this.net);
    const ground = new Ground(scene, physics);
    const roads = new Roads(scene, physics, this.net);
    this.sea = new Sea(scene, physics, sun);
    const buildings = new Buildings(scene, physics, this.net, this.plots, atlas);
    const spots = new Spots(this.net, this.plots, buildings.lots);
    // keep the spawn point clear
    spots.claim(this.spawn.x, this.spawn.z, 4);
    const street = new StreetLife(scene, physics, this.net, spots, buildings.lots);
    const props = new Props(scene, physics, this.net, spots, roads.potholes);
    this.critters = new Critters(scene, physics, this.net, spots);
    const plots = new Plots(scene, this.plots, debug);
    this.parts.push(ground, roads, this.sea, buildings, street, props, this.critters, plots, atlas);
    this.stats = { buildings: buildings.lots.length, frontage: buildings.lots.filter((l) => l.front).length };
  }

  static async create(scene: THREE.Scene, physics: Physics, debug: Debug, sun: THREE.Vector3): Promise<World> {
    const atlas = await SignAtlas.create();
    return new World(scene, physics, debug, sun, atlas);
  }

  update(elapsed: number, delta: number, rickshaw: THREE.Vector3): void {
    this.sea.update(elapsed);
    this.critters.update(elapsed, delta, rickshaw);
  }

  dispose(): void {
    this.parts.forEach((p) => p.dispose());
  }
}
