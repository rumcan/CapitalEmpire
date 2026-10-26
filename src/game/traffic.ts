/** Per vehicle type, eight painted headings in world-angle order (+x through +x-y).
 *  The cars themselves are simulated in the sim worker (sim/sim.worker.ts). */
import { LIBRARY } from './library';
import { CAR_DIRECTIONS, carHeading, carOwnerScale } from './ext/car-art';
export { carHeading } from './ext/car-art';

const byId = (id: string) => LIBRARY.findIndex(i => i.id === id);
/** Sprite, flip and tile footprint around the lane point; size: the car's owner size (ext/car-art carOwnerScale), read when the facings are built */
export interface Facing { item: number; flip: boolean; ox: number; oy: number; hx: number; hy: number; size: number }
let FACINGS: Facing[][] = [];
/** the car sprite sets, one per car type, each with a facing per heading (built once) */
export function facings() {
  if (FACINGS.length) return FACINGS;
  const models = ['burgundy-wagon', 'navy-wood-panel-wagon'];
  const sets: [number, boolean][][] = Array.from({ length: 5 }, (_, type) => CAR_DIRECTIONS.map(dir => [byId(`cars:${models[type % models.length]}:${dir}`), false]));
  // Shuttle bus (vehicle type 5): separate placeholder art until a complete bus pack is supplied.
  const bus = byId('world:schoolbus');
  sets.push(Array.from({ length: 8 }, (_, heading) => [bus, Math.round(heading / 2) % 2 === 1]));
  FACINGS = sets.map(set => set.map(([item, flip]) => {
    if (item < 0) throw new Error('Missing directional vehicle art; rebuild supplemental cars atlas');
    const b = LIBRARY[item].boxes[0];
    return { item, flip, ox: (flip ? b.dy : b.dx) / 2, oy: (flip ? b.dx : b.dy) / 2, hx: (flip ? b.hy : b.hx) / 2, hy: (flip ? b.hx : b.hy) / 2, size: carOwnerScale(LIBRARY[item].id) };
  }));
  return FACINGS;
}
/** Painted car for a parking bay's cardinal direction: 0 +x, 1 +y, 2 -x, 3 -y. */
export function parkedCar(type: number, direction: number): Facing { return facings()[type % 5]![carHeading(direction * Math.PI / 2)]!; }
/** body colours of the cars (the planner dots), by car type */
export const CAR_COLOURS = [[0.48, 0.13, 0.18], [0.12, 0.19, 0.3], [0.48, 0.13, 0.18], [0.12, 0.19, 0.3], [0.48, 0.13, 0.18], [0.95, 0.6, 0.15]];
