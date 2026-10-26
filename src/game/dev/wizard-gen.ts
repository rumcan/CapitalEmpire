// The lot wizard's generator (T158): a generous set of items for a lot round its house (more than a finished lot needs: the owner clicks off
// what is wrong), each item's sector drawn by the learned keep rates (lots/learn.ts drawSector) and its place drawn inside that sector, never
// over the house, the fences, the street items or another item. The kinds' pools come from the library (trees, bushes, flowerbeds, yard props,
// cars) and the lot decals, so new art joins them by itself. No DOM.
import { LIBRARY } from '../library';
import { LOT_DECALS } from '../lot-decals';
import type { PresetProp } from '../lots/presets';
import { drawSector, sectorOf, sectorRects, VERGE, type Box, type HouseClass, type ItemKind, type Model, type Sector, type SectorLot } from '../lots/learn';
import { placeable, spriteGroup } from './lot-lab-palette';
import { isFence, isTree } from './lot-derive';
import type { Half } from './lot-select';

/** an offered item: its kind, library (or decal) id and place (lot frame, tiles: the footprint's centre; a decal's centre) */
export interface Offer { kind: ItemKind; id: string; x: number; y: number }
/** the most a pool's sprite may cover (tiles squared at its own size): no giant trees or sheds among the yard items */
const MAX_AREA: Readonly<Record<ItemKind, number>> = { tree: 9, bush: 4, flowerbed: 6, prop: 4, car: 12, decal: Infinity };
/** how many of each kind a lot of 160 tiles squared is offered (scaled by its area) */
const PER_LOT: Readonly<Record<ItemKind, number>> = { tree: 4, bush: 7, flowerbed: 3, prop: 5, car: 1, decal: 4 };
/** the overlap (tiles) that counts as overlapping */
const TOUCH = 0.1;
const text = (id: string, name: string) => `${id} ${name}`.toLowerCase();
/** a library sprite's wizard kind, or null for one the wizard does not offer (buildings, fences, signs, the people) */
export function wizardKind(it: { id: string; name: string; kind: string; cat: string; big: boolean }, i: number, area: number): ItemKind | null {
  if (!placeable(it as never, i) || isFence(it.id)) return null;
  const g = spriteGroup(it), t = text(it.id, it.name);
  if (g === 'vehicles') return it.kind === 'car' && area <= MAX_AREA.car ? 'car' : null;
  if (g === 'buildings') return null;
  if (isTree(it.id) || it.kind === 'tree') return area <= MAX_AREA.tree ? 'tree' : null;
  if (/flower|planter|flowerbed|garden bed|tulip|rose|daisy|pot\b|potted/.test(t)) return area <= MAX_AREA.flowerbed ? 'flowerbed' : null;
  if (g === 'plants' || it.kind === 'bush' || /bush|shrub|hedge|fern|boxwood|hydrangea|azalea/.test(t)) return area <= MAX_AREA.bush ? 'bush' : null;
  if ((it.cat === 'Yard' || it.cat === 'Odds & ends' || it.cat === 'Street furniture') && area <= MAX_AREA.prop) return 'prop';
  return null;
}
/** the pools by kind (library ids; the decals' ids), made once; area: a sprite's footprint area at its own size */
let POOLS: Record<ItemKind, string[]> | null = null;
export function pools(area: (id: string) => number): Record<ItemKind, string[]> {
  if (POOLS) return POOLS;
  const p: Record<ItemKind, string[]> = { tree: [], bush: [], flowerbed: [], prop: [], car: [], decal: LOT_DECALS.map(d => d.id) };
  LIBRARY.forEach((it, i) => { const k = wizardKind(it, i, area(it.id)); if (k) p[k].push(it.id); });
  return (POOLS = p);
}

/** what the generator needs: the lot (its size, house box and drives: lots/learn.ts SectorLot), the house's size class, the model, the boxes
 *  already taken (the house, the fences, the street items), the pools, each sprite's footprint half extents, and r() in [0, 1) */
export interface GenInput { lot: SectorLot; cls: HouseClass; model: Model; taken: readonly Box[]; pools: Record<ItemKind, readonly string[]>; half: (q: PresetProp) => Half; r: () => number; scale?: number }
const overlap = (a: Box, b: Box) => Math.min(a[2], b[2]) - Math.max(a[0], b[0]) > TOUCH && Math.min(a[3], b[3]) - Math.max(a[1], b[1]) > TOUCH;
/** the offered items: for each kind its share of the lot (PER_LOT scaled by the lot's area), each item a random sprite of its pool, its sector drawn
 *  by the model (a sector where it found no room is not drawn again for it), its place drawn in the sector's rectangles until one lies in the
 *  sector, inside the lot (the street verge for the verge) and on nothing taken; an item with no place after a few tries is not offered */
export function generateOffers(g: GenInput): Offer[] {
  const { lot, r } = g, out: Offer[] = [], boxes: Box[] = [...g.taken], f = Math.min(2.2, Math.max(0.6, (lot.w * lot.d) / 160)) * (g.scale ?? 1);
  for (const kind of ['car', 'tree', 'bush', 'flowerbed', 'prop', 'decal'] as ItemKind[]) {
    const pool = g.pools[kind], n = Math.max(kind === 'car' ? 0 : 1, Math.round(PER_LOT[kind] * f + (r() - 0.5)));
    if (!pool.length) continue;
    for (let k = 0; k < n; k++) {
      const id = pool[Math.floor(r() * pool.length)]!, decal = kind === 'decal', h = decal ? { ha: 0.4, hb: 0.4 } : g.half({ id, x: 0, y: 0, scale: 1, view: 0 });
      const tried = new Set<Sector>();
      let placed: Offer | null = null;
      for (let s = 0; s < 4 && !placed; s++) {
        const sec = drawSector(g.model, g.cls, kind, lot, r, tried); if (!sec) break;
        tried.add(sec);
        const rects = sectorRects(lot, sec).filter(b => b[2] - b[0] > 0.05 && b[3] - b[1] > 0.05);
        for (let t = 0; t < 14 && rects.length; t++) {
          const b = rects[Math.floor(r() * rects.length)]!, x = b[0] + r() * (b[2] - b[0]), y = b[1] + r() * (b[3] - b[1]);
          const box: Box = [x - h.ha, y - h.hb, x + h.ha, y + h.hb];
          if (sectorOf(lot, x, y) !== sec || box[0] < 0 || box[2] > lot.w || box[3] > lot.d || box[1] < (sec === 'verge' ? -VERGE : 0)) continue;
          if (!decal && boxes.some(o => overlap(o, box))) continue;
          placed = { kind, id, x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 };
          if (!decal) boxes.push(box);
          break;
        }
      }
      if (placed) out.push(placed);
    }
  }
  return out;
}
