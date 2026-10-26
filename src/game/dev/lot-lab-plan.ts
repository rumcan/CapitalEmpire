// The lot lab's plans (T148): what Generate, New lot and the Neighbours toggle stage, as pure answers the lab (lot-lab.ts) carries out.
// Generate keeps the lot (its type, state, size and road angle) and rolls a new layout: another variant of its cell when there is one, a new seed
// (the fences, street items and decals compose again) and, in the lab, a new building of the same size class. New lot is the old Generate: a
// random size and road angle as the locks allow, then the first variant. The neighbours are the lots round the lab lot on its street: two on each
// side along it and three across it, as the game would draw them there. Pure, no DOM, no library, no randomness of its own (r() is passed in).
import type { Road } from '../lots/presets';
import type { Pt } from '../lots/preset-frame';

/** the lot the lab shows: its type and state (as the lab names them), size (tiles) and road angle */
export interface LabLot { use: string; state: string; w: number; d: number; road: Road }
/** a plan: the lot to compose (Generate keeps the caller's), the variant of its cell (an index into its candidates) and its seed's number (the
 *  lab turns it into a seed of the type: seedOf) */
export interface GenPlan { lot: LabLot; variant: number; seed: number }

/** Generate in place: the same lot (type, state, size, road angle); another variant of its n candidates when it has more than one (never the
 *  one shown, picked by r), else the same; a new seed number (never the last one) */
export function planInPlace(lot: LabLot, n: number, variant: number, seed: number, r: () => number): GenPlan {
  const v = n > 1 ? (variant + 1 + Math.floor(r() * (n - 1))) % n : Math.max(0, Math.min(variant, n - 1));
  let s = Math.floor(r() * 100000);
  if (s === seed) s = (s + 1) % 100000;
  return { lot: { ...lot }, variant: v, seed: s };
}

/** a size the lab offers for a type and state: its bucket key and the lot size it is composed at (tiles) */
export interface LabSize { key: string; w: number; d: number }
/** New lot: a random size (unless lockSize) and road angle (unless lockAngle), another cell than the one shown when the locks leave a choice (up
 *  to 8 tries, as the old Generate); both locked: the same cell. The variant starts again at the first (-1: generate's step goes to 0) */
export function planNewLot(sizes: readonly LabSize[], size: string, road: Road, lockSize: boolean, lockAngle: boolean, r: () => number): { size: string; road: Road; fresh: boolean } {
  if (!sizes.length || (lockSize && lockAngle)) return { size, road, fresh: false };
  for (let t = 0; t < 8; t++) {
    const s = lockSize ? size : sizes[Math.floor(r() * sizes.length)]!.key, a = (lockAngle ? road : Math.floor(r() * 8)) as Road;
    if (s === size && a === road) continue;
    return { size: s, road: a, fresh: true };
  }
  return { size, road, fresh: false };
}

/** a lot's geometry (world tiles): origin (the front corner), along u and away n (unit vectors), size w x d */
export interface Geo { o: Pt; u: Pt; n: Pt; w: number; d: number }
/** a neighbour: its key ('lab-n' and its place), side ('along' the street beside the lab lot, or 'across' it) and geometry */
export interface Neighbour { key: string; side: 'along' | 'across'; g: Geo }
/** the lots round the lab lot g on its street, as wide as widths(k) says (k = 0..6, the neighbours' order: left 1 and 2, right 1 and 2, then
 *  across: opposite the lab lot, then its left and right): along the street, on the lab lot's side, two each way, side by side with it; across
 *  the street, facing it (away vector -n), three: one opposite and one each way. street: the distance (tiles) from the lab lot's front edge to the
 *  far side's front edge (twice the street's half width and walk). Every one keeps the lab lot's depth */
export function neighbourLots(g: Geo, street: number, widths: (k: number) => number): Neighbour[] {
  const out: Neighbour[] = [], { o, u, n, d } = g, at = (p: Pt, k: number, v: Pt): Pt => ({ x: p.x + v.x * k, y: p.y + v.y * k });
  // along: the left ones end where the lab lot starts (along -u), the right ones start where it ends
  let left = 0, right = g.w;
  for (let k = 0; k < 2; k++) { const w = widths(k); left -= w; out.push({ key: `lab-n${k}`, side: 'along', g: { o: at(o, left, u), u: { ...u }, n: { ...n }, w, d } }); }
  for (let k = 0; k < 2; k++) { const w = widths(2 + k); out.push({ key: `lab-n${2 + k}`, side: 'along', g: { o: at(o, right, u), u: { ...u }, n: { ...n }, w, d } }); right += w; }
  // across: the front edge's centre opposite the lab lot's, the street's width away (along -n); the lot faces back (n' = -n, u' = -u), so its
  // origin is its front edge's centre plus half its width along u
  const C = at(at(o, g.w / 2, u), -street, n), nb = { x: -n.x, y: -n.y }, ub = { x: -u.x, y: -u.y };
  const w4 = widths(4), w5 = widths(5), w6 = widths(6);
  const cs: [number, number][] = [[0, w4], [-(g.w / 2 + w5 / 2), w5], [g.w / 2 + w6 / 2, w6]];
  cs.forEach(([shift, w], k) => { const c = at(C, shift, u); out.push({ key: `lab-n${4 + k}`, side: 'across', g: { o: at(c, w / 2, u), u: ub, n: nb, w, d } }); });
  return out;
}
