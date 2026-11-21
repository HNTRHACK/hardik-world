import { PROJECTS } from '../content/projects';
import { aboutEntry, contactEntry, projectEntry, winsEntry, type PanelEntry } from '../ui/views';
import { billboard, postBox, winsWall } from './LandmarkModels';
import { STALL_BUILDERS, type StallModel } from './StallModels';

/** Everything you can drive to: the six project stalls plus About / Contact / Wins. */
export interface Place {
  id: string;
  /** Plot id in layout.ts. */
  plot: string;
  short: string;
  /** What it is in the street, e.g. "Chai stall". */
  kind: string;
  group: 'Projects' | 'The lane';
  build: () => StallModel;
  entry: PanelEntry;
}

export const PLACES: Place[] = [
  ...PROJECTS.map(
    (p): Place => ({ id: p.id, plot: p.plot, short: p.short, kind: p.stall, group: 'Projects', build: STALL_BUILDERS[p.id]!, entry: projectEntry(p) }),
  ),
  { id: 'about', plot: 'about', short: 'About', kind: 'Billboard', group: 'The lane', build: billboard, entry: aboutEntry },
  { id: 'contact', plot: 'contact', short: 'Contact', kind: 'Post box', group: 'The lane', build: postBox, entry: contactEntry },
  { id: 'wins', plot: 'wins', short: 'Wins', kind: 'Wins wall', group: 'The lane', build: winsWall, entry: winsEntry },
];
