// The Props tool's catalogue and rules (plan P24 Phase 3, T131): the decor a player dresses the course and the range with (pot plants, shrubs and
// grasses, flower beds, fountains, statues, pillars, an arch, benches, bins, lamp posts, flag poles), each a library picture with a price and
// an appeal; where to put one (the player's land only: never a road or path, water, a green, a bunker, the range's mats and target greens, a
// building or another prop); and the appeal the props near the range's shop and mats add to it (capped). Pure TS, no DOM: the engine's side
// is golf/propstool.ts. Prices are $; appeal a fraction (0.01 = +1% visitors, and +1% on the fair price).
import type { Pt } from '../network';
import { PROPS_APPEAL_CAP } from './rangesave';

/** the panel's groups, in order */
export type DecorGroup = 'plants' | 'water' | 'stone' | 'furniture';
export const DECOR_GROUPS: readonly { id: DecorGroup; name: string }[] = [
  { id: 'plants', name: 'Plants' }, { id: 'water', name: 'Water' }, { id: 'stone', name: 'Stone' }, { id: 'furniture', name: 'Furniture' },
];

/** a catalogue item: its key (saved with the prop), plain name, group, library picture (the NE view of four-view art), price ($), appeal (a
 *  fraction), its size (absent: the studio's or the library's own) and, for a stand-in picture, the real thing it stands in for (the card and the
 *  map's pill say "Stand In for <standIn>": the art is requested in docs/GOLF-SPRITES.md "Props kit") */
export interface DecorItem { key: string; name: string; group: DecorGroup; id: string; price: number; appeal: number; scale?: number; standIn?: string; desc: string }

/** the appeal of each kind (plan P24 Phase 3): a plant +1%, a fountain +5%, a statue +3%, a pillar +1%, a bench +0.5% */
export const APPEAL = { plant: 0.01, fountain: 0.05, statue: 0.03, pillar: 0.01, bench: 0.005 } as const;

/** the catalogue: real library art (the Trees & plants, Street furniture, Yard and Landmarks categories, T113's golf props) and labelled stand-ins */
export const DECOR: readonly DecorItem[] = [
  // ---- plants: +1% each
  { key: 'pot-terracotta', name: 'Terracotta pot plant', group: 'plants', id: 'town:planter_terracotta', price: 120, appeal: APPEAL.plant, desc: 'A clipped shrub in a terracotta pot: line the shop front' },
  { key: 'pot-palm', name: 'Potted palm', group: 'plants', id: 'arcade:arcade_v2_clutter_plant', price: 90, appeal: APPEAL.plant, desc: 'A leafy palm in a pot, for doors and corners' },
  { key: 'planter-stone', name: 'Stone planter box', group: 'plants', id: 'town:planter_square', price: 250, appeal: APPEAL.plant, desc: 'A square civic planter in stone' },
  { key: 'shrub-hydrangea', name: 'Hydrangea shrub', group: 'plants', id: 'town:hydrangea', price: 60, appeal: APPEAL.plant, desc: 'An ornamental flowering shrub' },
  { key: 'grass-ornamental', name: 'Ornamental grass', group: 'plants', id: 'town:ornamental_grass', price: 50, appeal: APPEAL.plant, desc: 'A tall clump of ornamental grass' },
  { key: 'fern', name: 'Fern clump', group: 'plants', id: 'town:fern', price: 50, appeal: APPEAL.plant, desc: 'A soft green fern for shady beds' },
  { key: 'hedge', name: 'Clipped hedge', group: 'plants', id: 'world:hedge', price: 80, appeal: APPEAL.plant, desc: 'A low box hedge: edge a path or a bed' },
  { key: 'flower-bed', name: 'Flower bed', group: 'plants', id: 'world:bush_2', price: 150, appeal: APPEAL.plant, standIn: 'Flower bed', desc: 'A bed of seasonal flowers' },
  { key: 'tree-maple', name: 'Ornamental maple', group: 'plants', id: 'ref:tree-maple-crimson', price: 300, appeal: APPEAL.plant, desc: 'A crimson maple for shade and colour' },
  // ---- water
  { key: 'fountain', name: 'Plaza fountain', group: 'water', id: 'ref:landmark-fountain-v2', price: 12000, appeal: APPEAL.fountain, desc: 'A tiered stone fountain: the centrepiece of the front' },
  { key: 'well', name: 'Wishing well', group: 'water', id: 'expansion:wooden-well', price: 1200, appeal: 0.02, desc: 'A covered garden well: golfers toss a coin for luck' },
  // ---- stone
  { key: 'statue', name: 'Golfer statue', group: 'stone', id: 'expansion:coin-horse-ride', price: 6000, appeal: APPEAL.statue, standIn: 'Bronze golfer statue', desc: 'A bronze golfer at the top of his swing, on a stone plinth' },
  { key: 'pillar', name: 'Stone pillar', group: 'stone', id: 'world:grave_2', price: 400, appeal: APPEAL.pillar, standIn: 'Stone pillar', desc: 'A dressed stone column with a ball finial: pair them at a gate' },
  { key: 'arch', name: 'Ivy garden arch', group: 'stone', id: 'expansion:ivy-arbor', price: 900, appeal: 0.02, desc: 'An arbor grown over with ivy: an entrance to walk through' },
  // ---- furniture: +0.5% each (a flag pole +1%)
  { key: 'bench', name: 'Park bench', group: 'furniture', id: 'world:bench', price: 300, appeal: APPEAL.bench, desc: 'A slatted bench to watch the golfers from' },
  { key: 'bench-map', name: 'Course-map bench', group: 'furniture', id: 'business:golf-bench-course-map', price: 600, appeal: APPEAL.bench, desc: 'A bench beside a board with the course map' },
  { key: 'picnic', name: 'Picnic table', group: 'furniture', id: 'town:picnic_table', price: 450, appeal: APPEAL.bench, desc: 'A timber table for the family day out' },
  { key: 'trolley', name: 'Bag trolley', group: 'furniture', id: 'business:golf-bag-trolley', price: 150, appeal: APPEAL.bench, desc: 'A golf bag on its trolley, parked for show' },
  { key: 'bin', name: 'Litter bin', group: 'furniture', id: 'world:trashcan', price: 80, appeal: APPEAL.bench, desc: 'A tidy front is a busy front' },
  { key: 'lamp', name: 'Lamp post', group: 'furniture', id: 'world:streetlamp', price: 350, appeal: APPEAL.bench, desc: 'Lit at night' },
  { key: 'board', name: 'Welcome board', group: 'furniture', id: 'golf:leaderboard', price: 2500, appeal: 0.01, scale: 0.45, desc: 'A tall board to greet golfers at the drive: four views' },
  { key: 'flagpole', name: 'Flag pole', group: 'furniture', id: 'business:golf-pin-red', price: 500, appeal: 0.01, scale: 0.6, standIn: 'Club flag pole', desc: 'A tall white pole flying the club flag' },
];
export const DECOR_BY_KEY: ReadonlyMap<string, DecorItem> = new Map(DECOR.map(d => [d.key, d]));

/** what selling a prop gives back: half its price */
export const sellBack = (d: DecorItem): number => Math.round(d.price / 2);
/** a loaded prop's catalogue key, or null when it is not one (an old save, a renamed item) */
export const decorKeyOf = (x: unknown): string | null => (typeof x === 'string' && DECOR_BY_KEY.has(x) ? x : null);

// ---------------------------------------------------------------- appeal

/** a prop counts for the range within this many tiles of its shop or any of its mats */
export const PROPS_APPEAL_RADIUS = 15;
/** the appeal the placed props add to the range (plan P24 Phase 3): each prop within PROPS_APPEAL_RADIUS of an anchor (the shop, the mats)
 *  counts its appeal once; the sum is capped at PROPS_APPEAL_CAP. Unknown keys count nothing */
export function decorAppeal(placed: Iterable<{ key: string; x: number; y: number }>, anchors: readonly Pt[]): number {
  if (!anchors.length) return 0;
  const r2 = PROPS_APPEAL_RADIUS * PROPS_APPEAL_RADIUS;
  let sum = 0;
  for (const p of placed) {
    const d = DECOR_BY_KEY.get(p.key); if (!d) continue;
    if (anchors.some(a => (a.x - p.x) ** 2 + (a.y - p.y) ** 2 <= r2)) sum += d.appeal;
  }
  return Math.min(PROPS_APPEAL_CAP, Math.round(sum * 1e6) / 1e6);
}
/** an appeal as the card says it: +12%, +0.5% */
export const appealText = (a: number): string => `+${Math.round(a * 1000) / 10}%`;

// ---------------------------------------------------------------- where a prop may stand

/** a footprint (tiles): x0 y0 x1 y1 */
export type Box = [number, number, number, number];
/** what the spot check needs to know of the map */
export interface DecorSpot {
  /** the tile is the player's (a golf parcel: the range plot, the practice area, the course) */
  owned(x: number, y: number): boolean;
  /** the box touches water (the map's or a course pond); a road, path, sidewalk or car park */
  water(b: Box): boolean; road(b: Box): boolean;
  /** what the course grid has at a tile: 'green', 'bunker' or '' */
  course(x: number, y: number): 'green' | 'bunker' | '';
  /** what the range's own ground is at a tile: 'mats' (the hitting deck), 'target' (a target green) or '' */
  range(x: number, y: number): 'mats' | 'target' | '';
  /** the name of a building or prop the box overlaps, or '' */
  overlaps(b: Box): string;
}
/** the points of a footprint the checks sample: its corners, edges' midpoints and centre, and a 0.5-tile lattice inside a big one */
function samples(b: Box): Pt[] {
  const out: Pt[] = [], e = 0.02, x0 = b[0] + e, y0 = b[1] + e, x1 = b[2] - e, y1 = b[3] - e;
  const nx = Math.max(2, Math.ceil((x1 - x0) / 0.5)), ny = Math.max(2, Math.ceil((y1 - y0) / 0.5));
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) out.push({ x: x0 + (x1 - x0) * i / nx, y: y0 + (y1 - y0) * j / ny });
  return out;
}
/** why a prop of footprint b cannot stand there ('' when it can), in the order a player fixes them: the land first, then what is in the way */
export function decorSpotWhy(b: Box, s: DecorSpot): string {
  const pts = samples(b);
  if (!pts.every(p => s.owned(p.x, p.y))) return 'Only on your land: the range, the practice area and the course';
  if (s.water(b)) return 'Not on water';
  if (s.road(b)) return 'Not on a road, path or car park';
  for (const p of pts) {
    const c = s.course(p.x, p.y); if (c === 'green') return 'Not on a green'; if (c === 'bunker') return 'Not in a bunker';
    const r = s.range(p.x, p.y); if (r === 'mats') return 'Not on the hitting mats'; if (r === 'target') return 'Not on a target green';
  }
  const o = s.overlaps(b); if (o) return `Overlaps ${o}`;
  return '';
}

/** whether point (x, y) is inside polygon pts (flat x y pairs) */
export function inPoly(pts: readonly number[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 2; i < pts.length; j = i, i += 2) {
    const xi = pts[i]!, yi = pts[i + 1]!, xj = pts[j]!, yj = pts[j + 1]!;
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// ---------------------------------------------------------------- the save

/** a placed prop as the save keeps it: library id, x, y, flip, scale; then 1 for a plant brush's prop, or 0 and the catalogue key for a Props
 *  tool prop (T131). An old save's tuples (five or six long) read the same */
export type PropTuple = [string, number, number, number, number, (0 | 1)?, string?];
export function propTuple(id: string, p: { x: number; y: number; flip: boolean; scale: number; plant?: 1; decor?: string }): PropTuple {
  const t: PropTuple = [id, +p.x.toFixed(3), +p.y.toFixed(3), p.flip ? 1 : 0, p.scale];
  if (p.decor) t.push(0, p.decor); else if (p.plant) t.push(1);
  return t;
}
/** what a saved tuple adds to its prop: the plant mark and the catalogue key (an unknown key is dropped: the prop loads as a plain prop) */
export function tupleMarks(t: readonly unknown[]): { plant?: 1; decor?: string } {
  const out: { plant?: 1; decor?: string } = {};
  if (t[5] === 1) out.plant = 1;
  const k = decorKeyOf(t[6]); if (k) out.decor = k;
  return out;
}
