// The range car park's ground before it is paved (T239): a new range start's lot is packed dirt, then gravel, then asphalt (the range
// upgrades 'gravel' and 'pave', golf/rangesave.ts). An unpaved lot has no painted bays: its cars stand in loose rows, fewer of them, each
// a little off the line and askew, the same way every time (a hash of the bay's place, no random). Pure and import-free: the car park
// builder (event/carpark.ts buildPark) runs it in the city worker too, so the worker's bays and the game's agree.

/** an unpaved lot's ground (absent on a car park def: paved) */
export type LooseGround = 'dirt' | 'gravel';
/** the share of a paved lot's bays an unpaved one holds: loose rows on packed dirt, tidier ones on gravel */
export const LOT_SHARE: Readonly<Record<LooseGround, number>> = { dirt: 0.55, gravel: 0.8 };
/** how far a loose car stands off its bay's spot (tiles, along the row and along its heading) and turns off its heading (radians), by ground */
const SLOP: Readonly<Record<LooseGround, { along: number; deep: number; turn: number }>> = {
  dirt: { along: 0.35, deep: 0.3, turn: 0.14 },
  gravel: { along: 0.15, deep: 0.12, turn: 0.06 },
};

/** a bay as the builder makes it: its centre, its facing (0..3), its heading and its row's direction (unit vectors) */
interface BayLike { x: number; y: number; dir: 0 | 1 | 2 | 3; hx: number; hy: number; tx: number; ty: number }
/** a number in -1..1 from a point and a salt: the same for the same place every time */
function wobble(x: number, y: number, salt: number): number {
  let h = (Math.round(x * 16) * 374761393 + Math.round(y * 16) * 668265263 + salt * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return ((h >>> 0) / 4294967295) * 2 - 1;
}
/** a paved lot's bays (nearest the entrance first) as the unpaved lot holds them: taken in their order, a bay is kept while the kept share
 *  stays within the ground's LOT_SHARE (so the lot thins out evenly: wider gaps between the cars), each moved and turned a little. The order is
 *  kept */
export function looseBays<B extends BayLike>(bays: readonly B[], ground: LooseGround): B[] {
  const share = LOT_SHARE[ground], sl = SLOP[ground], out: B[] = [];
  for (let i = 0; i < bays.length; i++) {
    if (Math.floor((i + 1) * share) === Math.floor(i * share)) continue;
    const b = bays[i]!, a = wobble(b.x, b.y, 1) * sl.along, d = wobble(b.x, b.y, 2) * sl.deep, t = wobble(b.x, b.y, 3) * sl.turn;
    const c = Math.cos(t), s = Math.sin(t);
    out.push({ ...b, x: b.x + b.tx * a + b.hx * d, y: b.y + b.ty * a + b.hy * d, hx: b.hx * c - b.hy * s, hy: b.hx * s + b.hy * c });
  }
  return out;
}
