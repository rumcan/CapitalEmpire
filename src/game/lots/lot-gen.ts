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
import { lineLen, PLACE_MIN, placesOf, pointAt, rowOf, type Anchor, type PlaceLot, type Places } from './places';
/** T171: the share of a kind's items in rows that makes it a row kind (rowy) */
const ROWY = 0.7;
/** T171: a row kind's mean run (items) that makes it a hedge an inventory group still lays as rows */
const HEDGE = 5;
/** T171: how far (tiles) an item at a learnt place may reach past the lot's sides and back (compose-core REACH) */
const PLACE_REACH = 0.3;

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
/** T171: per model's places (a Places object: one per shipped model and group), what never changes per lot: each item's anchors (placesOf),
 *  each kind's row habit, each pool's distinct and rare ids, the items seen at each kind's anchor */
interface PlaceCache { items: Map<string, ReturnType<typeof placesOf>>; rowy: Map<ItemKind, { len: number } | null>; pools: Map<readonly string[], { uniq: string[]; rare: string[] }>; rowPools: Map<string, readonly string[]> }
const PLACE_CACHE = new WeakMap<Places, PlaceCache>();
const placeCache = (t: Places): PlaceCache => { let c = PLACE_CACHE.get(t); if (!c) PLACE_CACHE.set(t, c = { items: new Map(), rowy: new Map(), pools: new Map(), rowPools: new Map() }); return c; };
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
 *  density, T161); pairs: per anchor id the partners it brings (T161); minOne (default true): at least one of each kind but cars (false, T169:
 *  the other uses' lots, whose densities are their own, may have none of a kind); places (T171): the items' learnt anchors (lots/places.ts) and the
 *  lot's features they are read against: an item known there is laid at one of its anchors and places, a row as a row */
export interface GenInput { lot: SectorLot; cls: HouseClass; model: Model; taken: readonly Box[]; pools: Readonly<Record<ItemKind, readonly string[]>>; half: (q: PresetProp) => Half; seed: number; density?: number; avoid?: readonly { box: Box; but?: readonly ItemKind[] }[]; keep?: boolean; kinds?: Readonly<Partial<Record<ItemKind, number>>>; pairs?: ReadonlyMap<string, readonly Partner[]>; minOne?: boolean; places?: { t: Places; lot: PlaceLot } }
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
  const room = (k: ItemKind) => k === cur ? left > 1 : turn.has(k) ? (laid.get(k) ?? 0) < turn.get(k)! : (early.get(k) ?? 0) < Math.max(k === 'car' || g.minOne === false ? 0 : 1, Math.round(PER_LOT[k] * f * mult(k)));
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
  // T171: the items the places know (their anchors, cached), whether a box fits (in the lot: on the verge only at the kerb; on nothing taken), and
  // an item laid at one of its anchors: an anchor drawn by its share among those the lot has, one of its places there with a little jitter (the
  // model keeps it with its keep rate where it lands, as a sector's item); null when none fits
  // (what a model's places say never changes per lot: read once per model, PLACE_CACHE)
  const PL = g.places, PC = PL ? placeCache(PL.t) : null;
  const placesFor = (id: string) => { if (!PC) return null; if (!PC.items.has(id)) PC.items.set(id, placesOf(PL!.t, id)); return PC.items.get(id)!; };
  // (a learnt place may reach PLACE_REACH past the lot's sides and back, as compose's lot line allows: the owner's hedge stands a bush's depth off the fence)
  const fits = (box: Box, kind: ItemKind, verge: boolean) => box[0] >= -PLACE_REACH && box[2] <= lot.w + PLACE_REACH && box[3] <= lot.d + PLACE_REACH && box[1] >= (verge ? -VERGE : 0) && !boxes.some(q => overlap(q, box)) && !g.avoid?.some(v => !v.but?.includes(kind) && overlap(v.box, box));
  const anchored = (id: string, kind: ItemKind, h: Half, list: NonNullable<ReturnType<typeof placesOf>>): (LaidItem & { a: Anchor; along: number; off: number; p: number }) | null => {
    const P = PL!.lot, avail = list.filter(x => pointAt(P, x.a, 0.5, 0, 0) !== null);
    if (!avail.length) return null;
    for (let t = 0; t < 8; t++) {
      const k = pickWeighted(avail.map(x => x.w), r); if (k < 0) return null;
      const A = avail[k]!, j = 2 * Math.floor(r() * (A.pts.length >> 1)), p = A.a.startsWith('paved') ? Math.floor(r() * P.paved.length) : 0, free = A.a === 'free';
      const along = A.pts[j]! + (r() - 0.5) * (free ? 0.06 : 0.08), off = A.pts[j + 1]! + (r() - 0.5) * (free ? 0.06 : 0.3), pt = pointAt(P, A.a, along, off, p)!;
      const box: Box = [pt.x - h.ha, pt.y - h.hb, pt.x + h.ha, pt.y + h.hb];
      if (!fits(box, kind, A.a === 'kerb')) continue;
      if (g.keep && r() >= keepRate(g.model, g.cls, kind, sectorOf(lot, pt.x, pt.y))) return null;
      boxes.push(box);
      return { kind, id, x: pt.x, y: pt.y, a: A.a, along, off, p };
    }
    return null;
  };
  /** T171: the pool's items seen at an anchor (by the pool's own weights: its repeats), else the pool; made once per kind and anchor */
  const rowPool = (kind: ItemKind, a: Anchor, pool: readonly string[]) => {
    const key = `${kind}|${a}`; let rp = PC!.rowPools.get(key);
    if (!rp) { const at = pool.filter(id => placesFor(id)?.some(x => x.a === a)); PC!.rowPools.set(key, rp = at.length ? at : pool); }
    return rp;
  };
  /** T171: the row an item laid at a line anchor runs on (its kind's habit there: its share of rows, their length and spacing): more of the kind
   *  along the line from it, a spacing apart, toward the line's longer side and, when the line ends or a place is taken, on the other side of it,
   *  while its kind has tries left and each fits */
  const row = (it: { kind: ItemKind; a: Anchor; along: number; off: number; p: number }, pool: readonly string[]) => {
    const R = rowOf(PL!.t, it.kind, it.a), L = lineLen(PL!.lot, it.a, it.p), whole = !!rowy(it.kind);
    if (!R || L <= 0 || r() >= R.share) return;
    const step = R.gap / L, first = it.along > 0.5 ? -1 : 1;
    // a row's items are those of the kind seen at its anchor (a kerb's bench and bin, not the hvac of the building's side)
    const here = rowPool(it.kind, it.a, pool);
    let n = Math.round(R.len) - 1;
    for (const dir of [first, -first]) for (let i = 1; n > 0 && (whole || left > 1); i++) {
      const u = it.along + dir * i * step; if (u < -0.05 || u > 1.05) break;
      const id = here[Math.floor(r() * here.length)]!, h = halfOf(id), pt = pointAt(PL!.lot, it.a, u, it.off + (r() - 0.5) * 0.1, it.p)!;
      const box: Box = [pt.x - h.ha, pt.y - h.hb, pt.x + h.ha, pt.y + h.hb];
      // a spot that is taken (a car, a building's corner) is skipped: the row runs on past it to its line's end
      if (!fits(box, it.kind, it.a === 'kerb')) continue;
      boxes.push(box); out.push({ kind: it.kind, id, x: pt.x, y: pt.y }); laid.set(it.kind, (laid.get(it.kind) ?? 0) + 1); if (!whole) left--; n--;
    }
  };
  /** T171: a kind its lots mostly set in rows (ROWY of its items at the line anchors in a row: a shop's hedge): its count is of rows to start (its
   *  count over a row's mean length, rounded at random), each run to its length; null for the others */
  const rowy = (k: ItemKind): { len: number } | null => {
    if (!PL) return null;
    if (PC!.rowy.has(k)) return PC!.rowy.get(k)!;
    let items = 0, inRows = 0, runs = 0, len = 0;
    for (const [key, c] of PL.t.rows) if (key.startsWith(k + '|')) { items += c.items; inRows += c.inRows; runs += c.runs; len += c.len; }
    const v = items >= PLACE_MIN && runs && inRows / items >= ROWY ? { len: len / runs } : null;
    PC!.rowy.set(k, v); return v;
  };
  /** a pool's distinct ids and its rare ones (none known), once per pool */
  const split = (pool: readonly string[]) => { let v = PC!.pools.get(pool); if (!v) PC!.pools.set(pool, v = { uniq: [...new Set(pool)], rare: pool.filter(id => !placesFor(id)) }); return v; };
  // T171: a group whose lots are composed (inventory): each known item by its own count per lot, at the lot's size (no pairs: the set is the set)
  const inv = !!PL?.t.inventory && PL.t.lots > 0, invSize = inv ? Math.min(1.6, Math.max(0.6, (lot.w * lot.d) / (PL!.t.area / PL!.t.lots))) : 1;
  for (const kind of ORDER) {
    const pool = g.pools[kind], n0 = Math.max(kind === 'car' || g.minOne === false ? 0 : 1, Math.round(PER_LOT[kind] * f * mult(kind) + (r() - 0.5)));
    const ry = PL && pool.length ? rowy(kind) : null, n = ry ? Math.floor((PER_LOT[kind] * f * mult(kind)) / ry.len + r()) : n0;
    // (a kind set in long runs keeps them: a hedge; a short run of a set's pieces, the kerb's bench, bike rack and bin, is the set, each at its place)
    // the pool its sector tries draw from and how many (an inventory kind: its rare items, the rest of its count after its known ones' share)
    // (an inventory group's hedge is tried on every lot: its presets set one wherever the fence is free; it stands where it fits)
    let draw: readonly string[] = pool, tries = inv && ry && ry.len >= HEDGE ? Math.max(n, 1) : n;
    if (inv && !(ry && ry.len >= HEDGE) && kind !== 'car' && kind !== 'decal' && pool.length) {
      let share = 0;
      const sp = split(pool);
      for (const id of sp.uniq) {
        const list = placesFor(id); if (!list) continue;
        const rate = (PL!.t.items.get(id)!.n / PL!.t.lots) * invSize, cnt = Math.floor(rate + r()), h = halfOf(id);
        share += rate;
        for (let c = 0; c < cnt; c++) { const at = anchored(id, kind, h, list); if (at) { out.push({ kind, id, x: at.x, y: at.y }); laid.set(kind, (laid.get(kind) ?? 0) + 1); } }
      }
      // rare items keep their kind's sectors (as before T171): the kind's count less its known items' share, from the pool's rare ones
      draw = sp.rare; tries = Math.max(0, Math.round(n - share));
    }
    if (!draw.length || !tries) continue;
    // its tries: its count, less its partners laid already (with no pairs: its count)
    cur = kind; turn.set(kind, tries);
    for (left = tries - (early.get(kind) ?? 0); left > 0; left--) {
      const id = draw[Math.floor(r() * draw.length)]!, decal = kind === 'decal';
      const h = decal ? DECAL_HALF : halfOf(id);
      // T171: an item the places know is laid at its anchors (and nowhere else: when none fits, its place stays free)
      const list = PL && !decal ? placesFor(id) : null;
      if (list) {
        const at = anchored(id, kind, h, list);
        if (at) { out.push({ kind, id, x: at.x, y: at.y }); laid.set(kind, (laid.get(kind) ?? 0) + 1); if (g.pairs && !inv) partners(out.length - 1); row(at, pool); }
        continue;
      }
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
      if (placed) { out.push(placed); laid.set(kind, (laid.get(kind) ?? 0) + 1); if (g.pairs && !decal && !inv) partners(out.length - 1); }
    }
  }
  return out;
}
