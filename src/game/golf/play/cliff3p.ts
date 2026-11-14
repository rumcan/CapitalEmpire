// T372 (#1027): a raised tee as the view from behind the golfer sees it. On the map a tee's raise is drawn, not stored in the course height field
// (ext/course-walls SURF_HEIGHT and the Height slider), so the exporter adds it to the ground it samples: the tee's cells stand `raise` metres up with a
// sharp edge (the export's 1.5 m lattice turns a 3 m raise into a face steeper than the view's cliff slope, so it draws a rock face and the golfer
// cannot walk up it: Cinderlinks canStand, #1115), and a walkable ramp runs down from the tee where the map draws its stairs (course-walls teeStairs),
// so he can walk on and off. Pure TS, no DOM.
import { TILE_M } from '../types';

/** a tee's stairs as the map lays them (ext/course-walls Stair): the middle of the stretch on the tee's side (tiles), its outward unit normal, half its width (tiles) */
export interface StairLike { x: number; y: number; nx: number; ny: number; half: number }
/** what the lift reads: the tees' raise (m), whether a tile point is on a tee, and the tees' stairs */
export interface TeeLiftInput { raise: number; isTee(x: number, y: number): boolean; stairs: readonly StairLike[] }

/** the ramp's rise per metre of run (the view's walker climbs 0.65 m in half a metre at most, and calls 0.62 a rocky slope: a gentle path) */
export const RAMP_GRADE = 0.4;
/** a raise below this (m) is a step, not a cliff: no ramp (the walker steps up it) */
export const RAMP_MIN_RAISE = 0.6;
/** the ramp's margin either side of the stairs' width, tiles */
const RAMP_MARGIN = 0.5;
/** the side of the squares the ramps are binned in, tiles */
const RAMP_BIN = 16;

/** the lift at a tile point (m): the raise on a tee, the ramp's height on a ramp, else 0. Null when there is nothing to lift */
export function teeLift(inp: TeeLiftInput): ((x: number, y: number) => number) | null {
  const raise = inp.raise;
  if (!(raise > 0)) return null;
  const ramps = raise >= RAMP_MIN_RAISE ? inp.stairs.map(s => ({ ...s, len: raise / RAMP_GRADE / TILE_M })) : [];
  // (the ramps binned by RAMP_BIN-tile squares they touch: the export asks for a million points or more, and each looks only at the ramps near it)
  const bins = new Map<number, typeof ramps>(), key = (bx: number, by: number) => bx * 65536 + by;
  for (const r of ramps) {
    const ex = r.x + r.nx * r.len, ey = r.y + r.ny * r.len, m = r.half + RAMP_MARGIN;
    const bx0 = Math.floor((Math.min(r.x, ex) - m) / RAMP_BIN), bx1 = Math.floor((Math.max(r.x, ex) + m) / RAMP_BIN);
    const by0 = Math.floor((Math.min(r.y, ey) - m) / RAMP_BIN), by1 = Math.floor((Math.max(r.y, ey) + m) / RAMP_BIN);
    for (let by = by0; by <= by1; by++) for (let bx = bx0; bx <= bx1; bx++) { const k = key(bx, by), l = bins.get(k); if (l) l.push(r); else bins.set(k, [r]); }
  }
  return (x, y) => {
    if (inp.isTee(x, y)) return raise;
    const near = bins.size ? bins.get(key(Math.floor(x / RAMP_BIN), Math.floor(y / RAMP_BIN))) : undefined;
    if (!near) return 0;
    let best = 0;
    for (const r of near) {
      const dx = x - r.x, dy = y - r.y, d = dx * r.nx + dy * r.ny, side = Math.abs(-dx * r.ny + dy * r.nx);
      if (d < 0 || d > r.len || side > r.half + RAMP_MARGIN) continue;
      best = Math.max(best, raise * (1 - d / r.len));
    }
    return best;
  };
}
