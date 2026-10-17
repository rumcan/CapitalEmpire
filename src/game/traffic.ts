/** Car sprite facings for the sim client (sim/client.ts): per car type, the sprite and footprint for each of the four
 *  headings (+x, +y, -x, -y). The cars themselves are simulated in the sim worker (sim/sim.worker.ts). */
import { LIBRARY } from './library';

const byId = (id: string) => LIBRARY.findIndex(i => i.id === id);
/** per car type and heading (+x, +y, -x, -y): sprite, flip, and the footprint around the lane point */
interface Facing { item: number; flip: boolean; ox: number; oy: number; hx: number; hy: number }
let FACINGS: Facing[][] = [];
/** the car sprite sets, one per car type, each with a facing per heading (built once) */
export function facings() {
  if (FACINGS.length) return FACINGS;
  const c = { e: byId('static:compact_e'), s: byId('static:compact_s'), w: byId('static:compact_w'), n: byId('static:compact_n'), van: byId('static:van_e'), vanB: byId('static:van_e-v2'), pick: byId('static:pickup_n'), pickB: byId('static:pickup_n-v2'), nb: byId('static:compact_n-v2') };
  const sets: [number, boolean][][] = [[[c.e, false], [c.s, false], [c.w, false], [c.n, false]]];
  if (c.van >= 0) sets.push([[c.van, false], [c.van, true], [c.w, false], [c.nb >= 0 ? c.nb : c.n, false]]);
  if (c.vanB >= 0) sets.push([[c.vanB, false], [c.vanB, true], [c.w, false], [c.n, false]]);
  if (c.pick >= 0) sets.push([[c.e, false], [c.s, false], [c.pick, true], [c.pick, false]]);
  if (c.pickB >= 0) sets.push([[c.e, false], [c.s, false], [c.pickB, true], [c.pickB, false]]);
  FACINGS = sets.map(set => set.map(([item, flip]) => {
    const b = LIBRARY[item].boxes[0];
    return { item, flip, ox: (flip ? b.dy : b.dx) / 2, oy: (flip ? b.dx : b.dy) / 2, hx: (flip ? b.hy : b.hx) / 2, hy: (flip ? b.hx : b.hy) / 2 };
  }));
  return FACINGS;
}
/** body colours of the cars (the planner dots), by car type */
export const CAR_COLOURS = [[0.95, 0.85, 0.55], [0.9, 0.45, 0.35], [0.6, 0.8, 0.95], [0.85, 0.85, 0.85], [0.7, 0.9, 0.6]];
