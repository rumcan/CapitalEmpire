// The lot generator (T158; P25 #348, step 1): a pure, seeded function from a lot (its size, its house, its drives, what already stands on it), its
// house size class, the learned model (lots/learn.ts) and a seed, to the items laid on it: a generous set of trees, bushes, flowerbeds, yard
// props, a car and decals, each kind's count scaled by the lot's area, each item's sector drawn by the model's keep rates (drawSector) and its
// place drawn inside that sector, inside the lot (the street verge for the verge), never on the house, the fences, the street items or another
// item. The same input and seed always give the same layout, so the game can compose its lots with it on the fly (T160) and a lot never changes
// on a reload. No DOM; the pools and footprints are passed in (item-kinds.ts kindPools; the lot frame's footprints).
// T161 (#379): a state's density scales each kind's count (kinds: lots/taste.ts stateKinds), and an item laid brings its partners (pairs: lots/taste.ts
// pairTable), each at its learnt rate and at one of its learnt offsets (a partner brings none of its own); with neither, it lays as before.
import { mulberry } from '../iso';
import type { PresetProp } from './presets';
import { keepRate, SECTORS, sectorOf, sectorRects, sectorWeights, VERGE, type Box, type HouseClass, type ItemKind, type Model, type SectorLot } from './learn';
import type { Partner } from './taste';

/** a laid item: its kind, library (or decal) id and place (lot frame, tiles: the footprint's centre; a decal's centre) */
export interface LaidItem { kind: ItemKind; id: string; x: number; y: number; /** a partner (T161): the index among the laid items of the item it goes with */ with?: number }
/** a footprint's half extents in the lot frame (tiles) */
export interface Half { ha: number; hb: number }
/** how many of each kind a lot of 160 tiles squared gets (scaled by its area, at least one of each but cars) */
export const PER_LOT: Readonly<Record<ItemKind, number>> = { tree: 4, bush: 7, flowerbed: 3, prop: 5, car: 1, decal: 4 };
/** the kinds in the order they are laid (the larger first, so they find room) */
const ORDER: readonly ItemKind[] = ['car', 'tree', 'bush', 'flowerbed', 'prop', 'decal'];
/** the overlap (tiles) that counts as overlapping; a decal's footprint (it is flat: only the lot's edges hold it) */
const TOUCH = 0.1, DECAL_HALF: Half = { ha: 0.4, hb: 0.4 };
/** an index drawn by the weights (r() once, as learn.ts drawSector draws); -1 when they are all zero */
function pickWeighted(w: readonly number[], r: () => number): number {
  const tot = w.reduce((a, b) => a + b, 0); if (!(tot > 0)) return -1;
  let t = r() * tot;
  for (let i = 0; i < w.length; i++) { t -= w[i]!; if (t < 0) return i; }
  return w.length - 1;
}
/** the generator's input: the lot (lots/learn.ts SectorLot: size, house box, drives), the house's size class, the model, the boxes already taken
 *  (the house, the fences, the street items), the pools by kind, each sprite's footprint half extents, the seed; density scales the counts
 *  (1: as PER_LOT); avoid: ground no item may stand on but the kinds it lets (the game's lots, T160: the walk takes nothing, the drive only a car;
 *  a decal is flat ground and goes anywhere); keep: the model keeps each item it lays with its keep rate there (the game's lots: the wizard offers
 *  more than a lot needs for the owner to click off, the game lets the learned taste click them off); kinds: each kind's count scaled (a state's
 *  density, T161); pairs: per anchor id the partners it brings (T161) */
export interface GenInput { lot: SectorLot; cls: HouseClass; model: Model; taken: readonly Box[]; pools: Readonly<Record<ItemKind, readonly string[]>>; half: (q: PresetProp) => Half; seed: number; density?: number; avoid?: readonly { box: Box; but?: readonly ItemKind[] }[]; keep?: boolean; kinds?: Readonly<Partial<Record<ItemKind, number>>>; pairs?: ReadonlyMap<string, readonly Partner[]> }
const overlap = (a: Box, b: Box) => Math.min(a[2], b[2]) - Math.max(a[0], b[0]) > TOUCH && Math.min(a[3], b[3]) - Math.max(a[1], b[1]) > TOUCH;
/** the items laid on a lot (see the file head); r: the random stream (the seed's mulberry32 unless given, for a caller that draws more from it) */
export function generateLayout(g: GenInput, r: () => number = mulberry(g.seed >>> 0)): LaidItem[] {
  const { lot } = g, out: LaidItem[] = [], boxes: Box[] = [...g.taken], f = Math.min(2.2, Math.max(0.6, (lot.w * lot.d) / 160)) * (g.density ?? 1);
  // the lot's sectors once (their rectangles, and per kind the weights drawSector gives them: the game composes every house lot with this, T160),
  // and each sprite's footprint once
  const rects = SECTORS.map(s => sectorRects(lot, s).filter(b => b[2] - b[0] > 0.05 && b[3] - b[1] > 0.05)), weights = new Map<ItemKind, number[]>(), halves = new Map<string, Half>();
  const weightsOf = (kind: ItemKind) => { let w = weights.get(kind); if (!w) weights.set(kind, w = sectorWeights(g.model, g.cls, kind, lot)); return w; };
  const halfOf = (id: string) => { let h = halves.get(id); if (!h) halves.set(id, h = g.half({ id, x: 0, y: 0, scale: 1, view: 0 })); return h; };
  // a kind's count on this lot (its turn draws it); the kind laid now and its tries left; the items of each kind laid; the partners of a kind laid
  // before its turn
  const mult = (k: ItemKind) => g.kinds?.[k] ?? 1, turn = new Map<ItemKind, number>(), laid = new Map<ItemKind, number>(), early = new Map<ItemKind, number>();
  let cur: ItemKind | null = null, left = 0;
  /** whether a partner of a kind fits the kind's count (a state's density sets how many, the pairs only how they stand): the kind laid now (a
   *  try of its own taken), one whose turn is to come (its count taken early, at most what its turn would draw) or one whose turn is gone (only
   *  what its tries left: those the model thinned, or found no room for) */
  const room = (k: ItemKind) => k === cur ? left > 1 : turn.has(k) ? (laid.get(k) ?? 0) < turn.get(k)! : (early.get(k) ?? 0) < Math.max(k === 'car' ? 0 : 1, Math.round(PER_LOT[k] * f * mult(k)));
  /** the partners of the item laid at index i: each at its rate, when its kind has room, at one of its offsets (a little jitter), in the lot (on
   *  the verge only by an item on the verge), on nothing taken; a partner it cannot place is left out */
  const partners = (i: number) => {
    const a = out[i]!, list = g.pairs!.get(a.id);
    if (!list) return;
    for (const p of list) {
      if (r() >= p.rate || !room(p.kind)) continue;
      const h = halfOf(p.id), n = p.offs.length >> 1;
      for (let t = 0; t < 6; t++) {
        const o = 2 * Math.floor(r() * n), x = a.x + p.offs[o]! + (r() - 0.5) * 0.5, y = a.y + p.offs[o + 1]! + (r() - 0.5) * 0.5;
        const box: Box = [x - h.ha, y - h.hb, x + h.ha, y + h.hb];
        if (box[0] < 0 || box[2] > lot.w || box[3] > lot.d || box[1] < (a.y < 0 ? -VERGE : 0)) continue;
        if (boxes.some(q => overlap(q, box)) || g.avoid?.some(v => !v.but?.includes(p.kind) && overlap(v.box, box))) continue;
        out.push({ kind: p.kind, id: p.id, x, y, with: i }); boxes.push(box);
        laid.set(p.kind, (laid.get(p.kind) ?? 0) + 1);
        if (p.kind === cur) left--; else if (!turn.has(p.kind)) early.set(p.kind, (early.get(p.kind) ?? 0) + 1);
        break;
      }
    }
  };
  for (const kind of ORDER) {
    const pool = g.pools[kind], n = Math.max(kind === 'car' ? 0 : 1, Math.round(PER_LOT[kind] * f * mult(kind) + (r() - 0.5)));
    if (!pool.length) continue;
    // its tries: its count, less its partners laid already (with no pairs: its count)
    cur = kind; turn.set(kind, n);
    for (left = n - (early.get(kind) ?? 0); left > 0; left--) {
      const id = pool[Math.floor(r() * pool.length)]!, decal = kind === 'decal';
      const h = decal ? DECAL_HALF : halfOf(id);
      const w = weightsOf(kind).slice();
      let placed: LaidItem | null = null;
      for (let s = 0; s < 4 && !placed; s++) {
        const si = pickWeighted(w, r); if (si < 0) break;
        const sec = SECTORS[si]!; w[si] = 0;
        const rs = rects[si]!;
        for (let t = 0; t < 14 && rs.length; t++) {
          const b = rs[Math.floor(r() * rs.length)]!, x = b[0] + r() * (b[2] - b[0]), y = b[1] + r() * (b[3] - b[1]);
          const box: Box = [x - h.ha, y - h.hb, x + h.ha, y + h.hb];
          if (sectorOf(lot, x, y) !== sec || box[0] < 0 || box[2] > lot.w || box[3] > lot.d || box[1] < (sec === 'verge' ? -VERGE : 0)) continue;
          if (!decal && (boxes.some(o => overlap(o, box)) || g.avoid?.some(a => !a.but?.includes(kind) && overlap(a.box, box)))) continue;
          // the learned taste keeps it, or the place stays free (no other place is tried: the model said no to this one)
          if (g.keep && r() >= keepRate(g.model, g.cls, kind, sec)) { s = 4; break; }
          placed = { kind, id, x, y };
          if (!decal) boxes.push(box);
          break;
        }
      }
      if (placed) { out.push(placed); laid.set(kind, (laid.get(kind) ?? 0) + 1); if (g.pairs && !decal) partners(out.length - 1); }
    }
  }
  return out;
}
