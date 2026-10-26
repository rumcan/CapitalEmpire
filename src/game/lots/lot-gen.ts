// The lot generator (T158; P25 #348, step 1): a pure, seeded function from a lot (its size, its house, its drives, what already stands on it), its
// house size class, the learned model (lots/learn.ts) and a seed, to the items laid on it: a generous set of trees, bushes, flowerbeds, yard
// props, a car and decals, each kind's count scaled by the lot's area, each item's sector drawn by the model's keep rates (drawSector) and its
// place drawn inside that sector, inside the lot (the street verge for the verge), never on the house, the fences, the street items or another
// item. The same input and seed always give the same layout, so the game can compose its lots with it on the fly (T160) and a lot never changes
// on a reload. No DOM; the pools and footprints are passed in (item-kinds.ts kindPools; the lot frame's footprints).
import { mulberry } from '../iso';
import type { PresetProp } from './presets';
import { keepRate, SECTORS, sectorOf, sectorRects, sectorWeights, VERGE, type Box, type HouseClass, type ItemKind, type Model, type SectorLot } from './learn';

/** a laid item: its kind, library (or decal) id and place (lot frame, tiles: the footprint's centre; a decal's centre) */
export interface LaidItem { kind: ItemKind; id: string; x: number; y: number }
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
 *  more than a lot needs for the owner to click off, the game lets the learned taste click them off) */
export interface GenInput { lot: SectorLot; cls: HouseClass; model: Model; taken: readonly Box[]; pools: Readonly<Record<ItemKind, readonly string[]>>; half: (q: PresetProp) => Half; seed: number; density?: number; avoid?: readonly { box: Box; but?: readonly ItemKind[] }[]; keep?: boolean }
const overlap = (a: Box, b: Box) => Math.min(a[2], b[2]) - Math.max(a[0], b[0]) > TOUCH && Math.min(a[3], b[3]) - Math.max(a[1], b[1]) > TOUCH;
/** the items laid on a lot (see the file head); r: the random stream (the seed's mulberry32 unless given, for a caller that draws more from it) */
export function generateLayout(g: GenInput, r: () => number = mulberry(g.seed >>> 0)): LaidItem[] {
  const { lot } = g, out: LaidItem[] = [], boxes: Box[] = [...g.taken], f = Math.min(2.2, Math.max(0.6, (lot.w * lot.d) / 160)) * (g.density ?? 1);
  // the lot's sectors once (their rectangles, and per kind the weights drawSector gives them: the game composes every house lot with this, T160),
  // and each sprite's footprint once
  const rects = SECTORS.map(s => sectorRects(lot, s).filter(b => b[2] - b[0] > 0.05 && b[3] - b[1] > 0.05)), weights = new Map<ItemKind, number[]>(), halves = new Map<string, Half>();
  const weightsOf = (kind: ItemKind) => { let w = weights.get(kind); if (!w) weights.set(kind, w = sectorWeights(g.model, g.cls, kind, lot)); return w; };
  for (const kind of ORDER) {
    const pool = g.pools[kind], n = Math.max(kind === 'car' ? 0 : 1, Math.round(PER_LOT[kind] * f + (r() - 0.5)));
    if (!pool.length) continue;
    for (let k = 0; k < n; k++) {
      const id = pool[Math.floor(r() * pool.length)]!, decal = kind === 'decal';
      let h = decal ? DECAL_HALF : halves.get(id);
      if (!h) halves.set(id, h = g.half({ id, x: 0, y: 0, scale: 1, view: 0 }));
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
      if (placed) out.push(placed);
    }
  }
  return out;
}
