// The Toll Gate's definition (Phase 5 step 5a): a plaza seg of road with booths, identified by its end points and inbound direction. Pure TS, no DOM.
import { keyOf, type Pt } from '../network';
import { BOOTH_W, PLAZA_LEN, TAPER } from './config';

/** a toll gate: the plaza seg's end points (tiles; inbound traffic runs a to b), its id and its booths */
export interface TollDef { id: number; ax: number; ay: number; bx: number; by: number /* the plaza seg's ends, tiles; inbound runs a → b */; booths: number }

/** the lane graph's key of the inbound directed seg of a toll gate: the same keys as lanes.ts dseg keys (`${keyOf(a)}>${keyOf(b)}`) */
export function plazaKey(d: TollDef): string { return `${keyOf({ x: d.ax, y: d.ay })}>${keyOf({ x: d.bx, y: d.by })}`; }

/** a tile point on the plaza: t tiles along it from a (the inbound way) and o tiles across it (+o: the inbound lanes' side, perp of the inbound unit) */
export function plazaPoint(d: TollDef, t: number, o: number): Pt {
  const dx = d.bx - d.ax, dy = d.by - d.ay, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
  return { x: d.ax + ux * t - uy * o, y: d.ay + uy * t + ux * o };
}
/** the plaza's local coordinates (t, o) of tile (x, y): the inverse of plazaPoint */
export function plazaLocal(d: TollDef, x: number, y: number): { t: number; o: number } {
  const dx = d.bx - d.ax, dy = d.by - d.ay, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, px = x - d.ax, py = y - d.ay;
  return { t: px * ux + py * uy, o: py * ux - px * uy };
}
/** the plaza's outer edge on the inbound side, o: the last booth lane (off0: the first lane's offset, lanes.ts laneOff) plus a verge */
export const plazaEdge = (booths: number, off0: number): number => off0 + BOOTH_W * (booths - 1) + 1.2;
/** a flat x y list of plaza points (t, o) in tile coords */
const flat = (d: TollDef, c: [number, number][]): number[] => c.flatMap(([t, o]) => { const p = plazaPoint(d, t, o); return [p.x, p.y]; });
/** the plaza's asphalt: three quads (flat x y lists, tile coords): the straight part over the road's width h (TAPER to PLAZA_LEN - TAPER), and the two tapers widening from the road's edges to the plaza's edge */
export function plazaQuads(d: TollDef, h: number, off0: number): number[][] {
  const W = plazaEdge(d.booths, off0), L = PLAZA_LEN, T = TAPER;
  return [flat(d, [[T, -h], [L - T, -h], [L - T, W], [T, W]]), flat(d, [[0, -h], [T, -h], [T, W], [0, h]]), flat(d, [[L - T, -h], [L, -h], [L, h], [L - T, W]])];
}
/** the plaza's outline (flat x y list, tile coords): the road's width at each end, the plaza's edge between the tapers */
export function plazaOutline(d: TollDef, h: number, off0: number): number[] {
  const W = plazaEdge(d.booths, off0);
  return flat(d, [[0, -h], [PLAZA_LEN, -h], [PLAZA_LEN, h], [PLAZA_LEN - TAPER, W], [TAPER, W], [0, h]]);
}
/** the booth islands: one between each pair of booth lanes and one at each outer side (booths + 1 in all); each is a flat quad (3 tiles along the plaza's middle, 0.6 across) and its centre */
export function plazaIslands(d: TollDef, off0: number): { quad: number[]; c: Pt }[] {
  const mid = PLAZA_LEN / 2, out: { quad: number[]; c: Pt }[] = [];
  for (let j = 0; j <= d.booths; j++) { const o = off0 + BOOTH_W * (j - 0.5); out.push({ quad: flat(d, [[mid - 1.5, o - 0.3], [mid + 1.5, o - 0.3], [mid + 1.5, o + 0.3], [mid - 1.5, o + 0.3]]), c: plazaPoint(d, mid, o) }); }
  return out;
}
