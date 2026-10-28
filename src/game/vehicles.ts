// T236 (#693, the owner, 2026-10-28: "audit and remove badly pained cars and replace them with a diffrent color truck maybe"): the vehicles a car is
// drawn as. T228's paints were audited (car-paint.ts: none was clean on both wagons at every heading), so the colours come from the library's other
// vehicles, each in its own painted colours. A vehicle has pictures for some of the eight headings (ext/car-art CAR_DIRECTIONS, world-angle order:
// 0 SE (+x), 1 S, 2 SW (+y), 3 W, 4 NW (-x), 5 N, 6 NE (-y), 7 E), never mirrored:
//   the two eight-way wagons (art/cars, burgundy and navy) have all eight: only they drive (the traffic, the range's and the club's golfers' cars)
//   the yellow pickup (static:pickup_n): NE, SW (its variation :4) and the four screen-axis views of T154 (view:static:pickup_n:n|e|s|w: S, E, N, W);
//     its variations :1 (E), :2 (S) and :3 (N) are older takes of the same views
//   world:car_0..3 (a red, a navy, a green and a cream wood-panel wagon): SE, SW (:4; car_0's :4 is a second SE) and E (:1)
//   the compacts (red static:compact_e, light blue static:compact_w, teal static:compact_n, dark teal static:compact_n-v2, and the cream compact_s's
//     views; the old town cars the house lots park): one or two corners each, NW among them (the light blue one), and E (:1)
//   the rusty pickup (expansion:scrap-pickup-rear): NE, SW (:4) and E (:1); on farm and junk lots only (RUSTY_PICKUPS, lotPickup)
// Every vehicle's :2 and :3 front and rear views come from a steeper camera (half as tall again as the wagons' S and N), so none is used.
// A car park's bay faces one of the four world axes, so its car shows heading 2 x dir (SE, SW, NW or NE): bayCar picks, for each bay, one of the
// vehicles with that picture, by weight, from where the bay is (always the same vehicle in the same bay). The lots' parked wagons take the same mix
// (parkedAs, from where each stands).
import { LIBRARY } from './library';
import { CAR_DIRECTIONS, carHeading } from './ext/car-art';
import { HH, HW } from './iso';
import { hash3 } from './car-paint';
import { facings, type Facing } from './traffic';

type Dir = (typeof CAR_DIRECTIONS)[number];
/** a vehicle model: its picture at each heading (CAR_DIRECTIONS order; null: none that way, and it is never mirrored into one), its weight in a
 *  car park's mix */
export interface Vehicle { model: string; name: string; weight: number; views: readonly (string | null)[] }
const at = (o: Partial<Record<Dir, string>>): (string | null)[] => CAR_DIRECTIONS.map(d => o[d] ?? null);
const eight = (model: string) => CAR_DIRECTIONS.map(d => `cars:${model}:${d}`);
/** every vehicle a car may be drawn as (the rusty pickup apart: lots only, RUSTY_PICKUPS) */
export const VEHICLES: readonly Vehicle[] = [
  { model: 'cars:burgundy-wagon', name: 'burgundy wagon', weight: 3, views: eight('burgundy-wagon') },
  { model: 'cars:navy-wood-panel-wagon', name: 'navy wagon', weight: 3, views: eight('navy-wood-panel-wagon') },
  { model: 'static:pickup', name: 'yellow pickup', weight: 2, views: at({ S: 'view:static:pickup_n:n', SW: 'variation:static-pickup_n-b8165928:4', W: 'view:static:pickup_n:w', N: 'view:static:pickup_n:s', NE: 'static:pickup_n', E: 'view:static:pickup_n:e' }) },
  { model: 'world:car_0', name: 'red wagon', weight: 1, views: at({ SE: 'world:car_0', E: 'variation:world-car_0-cf8f927b:1' }) },
  { model: 'world:car_1', name: 'blue wagon', weight: 1, views: at({ SE: 'world:car_1', SW: 'variation:world-car_1-a53c4fd9:4', E: 'variation:world-car_1-a53c4fd9:1' }) },
  { model: 'world:car_2', name: 'green wagon', weight: 1, views: at({ SE: 'world:car_2', SW: 'variation:world-car_2-3ef8eade:4', E: 'variation:world-car_2-3ef8eade:1' }) },
  { model: 'world:car_3', name: 'cream wagon', weight: 1, views: at({ SE: 'world:car_3', SW: 'variation:world-car_3-22c3340d:4', E: 'variation:world-car_3-22c3340d:1' }) },
  { model: 'static:compact_e', name: 'red compact', weight: 1, views: at({ SE: 'static:compact_e', SW: 'variation:static-compact_e-c2ad7436:4', E: 'variation:static-compact_e-c2ad7436:1' }) },
  { model: 'static:compact_w', name: 'light blue compact', weight: 1, views: at({ SE: 'variation:static-compact_w-3465d046:4', NW: 'static:compact_w', E: 'variation:static-compact_w-3465d046:1' }) },
  { model: 'static:compact_n', name: 'teal compact', weight: 1, views: at({ SW: 'variation:static-compact_n-82988799:4', NE: 'static:compact_n', E: 'variation:static-compact_n-82988799:1' }) },
  { model: 'static:compact_n-v2', name: 'dark teal compact', weight: 1, views: at({ SW: 'variation:static-compact_n-v2-ea89d6fd:4', NE: 'static:compact_n-v2', E: 'variation:static-compact_n-v2-ea89d6fd:1' }) },
  { model: 'static:compact_s', name: 'cream compact', weight: 1, views: at({ SW: 'variation:static-compact_s-0c90743f:4', E: 'variation:static-compact_s-0c90743f:1' }) },
];
/** the rusty pickup: farm and junk lots only (lotPickup; the lots' vehicle pools read a facing letter: n -y (NE), s +y (SW)) */
export const RUSTY_PICKUP: Vehicle = { model: 'expansion:scrap-pickup-rear', name: 'rusty pickup', weight: 1, views: at({ SW: 'variation:expansion-scrap-pickup-rear-7e2d1193:4', NE: 'expansion:scrap-pickup-rear', E: 'variation:expansion-scrap-pickup-rear-7e2d1193:1' }) };
/** the farm and junk lots' pickups with their facing letters (lots/compose-core.ts and ext/farms vehicle(): the facing that suits the road best) */
export const RUSTY_PICKUPS: Readonly<Record<string, 'n' | 's'>> = { 'expansion:scrap-pickup-rear': 'n', 'variation:expansion-scrap-pickup-rear-7e2d1193:4': 's' };

const INDEX = new Map(LIBRARY.map((it, i) => [it.id, i] as const));
/** the vehicles with all eight headings: the ones that may drive (the two wagons) */
export const DRIVERS: readonly Vehicle[] = VEHICLES.filter(v => v.views.every(id => id !== null));
/** the vehicles with a picture at heading h (0..7) that the library has */
export function vehiclesAt(h: number): Vehicle[] { return VEHICLES.filter(v => { const id = v.views[h]; return !!id && INDEX.has(id); }); }
const POOLS: Vehicle[][] = [];
/** the vehicle of a seed among those with a picture at heading h, by weight (null when none has one) */
export function vehicleOf(h: number, seed: number): Vehicle | null {
  const pool = POOLS[h] ??= vehiclesAt(h);
  let total = 0; for (const v of pool) total += v.weight;
  if (!total) return null;
  let r = (seed >>> 0) % total;
  for (const v of pool) { r -= v.weight; if (r < 0) return v; }
  return pool[pool.length - 1]!;
}
/** the seed of a parked car's spot (tiles; to a twentieth of a tile, so the same bay or lot spot always gets the same vehicle) */
export const spotSeed = (x: number, y: number): number => hash3(Math.round(x * 20), Math.round(y * 20), 0x7236);

/** a corner picture's ground centre about its anchor (picture px at scale 1): the middle of its width, a quarter of its width above its bottom (a
 *  car at a corner heading spans its footprint's screen width, and its footprint half that in height; the eight-way wagons' anchors sit there
 *  exactly, the old art's up to 15 px below it) */
export function groundOffset(item: number): [number, number] {
  const it = LIBRARY[item]!, q = it.quad;
  return [(q[0] + q[2]) / 2 - it.ax, q[3] - (q[2] - q[0]) / 4 - it.ay];
}
/** world px to tiles (iso.ts worldX / worldY inverted) */
const toTiles = (X: number, Y: number): [number, number] => [(X / HW + Y / HH) / 2, (Y / HH - X / HW) / 2];
/** the size a vehicle other than the wagons takes in a bay or on a lot's parking: the wagons' (the mean of their owner sizes). The old art is drawn
 *  at the wagons' pixel scale (a corner view about 200 px wide for a 4.5 m car), and its studio sizes (1.26 to 1.47, set for the house lots'
 *  driveways) would make it 30 to 50% longer than the wagons beside it and run it over the bay lines */
export function wagonSize(h: number): number { const F = facings(); return (F[0]![h]!.size + F[1]![h]!.size) / 2; }

/** the bays' cars, built once per picture: the sprite, its anchor's offset from the bay's centre, its body footprint and its size */
const BAY = new Map<string, Facing>();
/** the car of a car park's bay (dir 0 +x, 1 +y, 2 -x, 3 -y, as traffic.ts parkedCar) at (x, y): one of the vehicles with a picture at the bay's
 *  heading, from where the bay is (vehicleOf, spotSeed). An eight-way wagon is its traffic facing; another vehicle stands with its ground centre on
 *  the bay's (ox, oy: the anchor is placed at the bay's point less them, groundOffset), with the wagon's body footprint at its heading (the old
 *  art's boxes are rough squares: bayFoot), at the wagons' size (wagonSize) */
export function bayCar(dir: number, x: number, y: number): Facing {
  const h = carHeading(dir * Math.PI / 2), v = vehicleOf(h, spotSeed(x, y)), F = facings(), id = v?.views[h];
  // (facings' types 0 and 1 are the two wagons, in DRIVERS' order)
  if (!v || !id) return F[0]![h]!;
  const d = DRIVERS.indexOf(v); if (d >= 0) return F[d]![h]!;
  return bayFacing(id, h);
}
/** a picture other than the wagons' as a bay's car at heading h (bayCar): its anchor's offset from the bay's centre, the wagon's body footprint,
 *  the wagons' size (built once per picture, and again when the wagons' size changed: the studio, traffic.ts resetFacings) */
export function bayFacing(id: string, h: number): Facing {
  let f = BAY.get(id); const size = wagonSize(h);
  if (!f || f.size !== size) {
    const wagon = facings()[0]![h]!, item = INDEX.get(id)!, [gx, gy] = groundOffset(item), [ox, oy] = toTiles(gx * size, gy * size);
    BAY.set(id, f = { item, flip: false, ox, oy, hx: wagon.hx, hy: wagon.hy, size });
  }
  return f;
}
/** the footprint (world tiles x0 y0 x1 y1) of a bay's car standing in the bay centred at (x, y): its body at its heading, at its size (as addProp
 *  gives an eight-way wagon from its boxes) */
export const bayFoot = (f: Facing, x: number, y: number): [number, number, number, number] => [x - f.hx * f.size, y - f.hy * f.size, x + f.hx * f.size, y + f.hy * f.size];
/** whether a library item is one of the two eight-way wagons' pictures */
export const isWagon = (item: number): boolean => wagonHeading(LIBRARY[item]?.id ?? '') >= 0;

/** an eight-way wagon picture's heading (cars:<model>:<heading>), or -1 */
function wagonHeading(id: string): number {
  const m = /^cars:(burgundy-wagon|navy-wood-panel-wagon):([A-Z]+)$/.exec(id);
  return m ? CAR_DIRECTIONS.indexOf(m[2] as Dir) : -1;
}
/** what a lot's parked car (a preset's or the generator's picture, turned to the lot) is drawn as, its footprint centred at (x, y): an eight-way
 *  wagon at a corner heading (SE, SW, NW, NE: how a parked car stands) takes the car park mix's vehicle for its spot (vehicleOf, spotSeed), at
 *  the wagon's size s, its footprint h (about its anchor, tiles) moved so its ground centre stands where the wagon's did; any other picture is
 *  kept as it is */
export function parkedAs(id: string, s: number, h: readonly [number, number, number, number], x: number, y: number): { id: string; h: [number, number, number, number] } {
  const k = wagonHeading(id), same = { id, h: [h[0], h[1], h[2], h[3]] as [number, number, number, number] };
  if (k < 0 || k % 2) return same;
  const v = vehicleOf(k, spotSeed(x, y)), to = v?.views[k], item = to ? INDEX.get(to) : undefined;
  if (!v || !to || item === undefined || DRIVERS.includes(v)) return same;
  const [gx, gy] = groundOffset(item), [ox, oy] = toTiles(gx * s, gy * s);
  return { id: to, h: [h[0] + ox, h[1] + oy, h[2] + ox, h[3] + oy] };
}
/** the yellow pickup a farm or junk lot draws (a preset's static:pickup_n) is the rusty one on about half of them, by the lot's seed and the
 *  pickup's place in it */
export function lotPickup(id: string, seed: number, k = 0): string {
  return id === 'static:pickup_n' && hash3(seed, k, 0x7236) % 2 === 0 ? RUSTY_PICKUP.views[6]! : id;
}
