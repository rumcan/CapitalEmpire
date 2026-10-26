// Change house (T148, the lot lab's H): the pool a building of a lot is swapped within. A house is swapped only for a house, a shop for a shop:
// the buildings of its family (newart.ts standInFamily: dwellings, outbuildings, shops and services, industry, landmarks...) that the game draws
// as themselves (no stand-in), as their base view (presets store the NE view and a turn), front views only (no "-north-", back-of-house or rear
// sets: a house's front door faces its street), in its size class: the family's footprints at their owner size split in three by area (small,
// medium, large; a family of fewer than six is one class). The pool is in area order, then by id, so H steps to the nearest size first and
// Shift+H steps back. No DOM; reads the library.
import { LIBRARY } from '../library';
import { drawnAsStandIn, maxDrawScale, standInFamily } from '../newart';
import { isBuilding } from '../mirror';
import { footprintOf, fourViews, ownerScaleOf, turned } from '../lots/preset-art';
import type { PresetProp } from '../lots/presets';
import { cycle, type Half } from './lot-select';

const INDEX = new Map(LIBRARY.map((it, i) => [it.id, i] as const));
/** the largest drawn scale a sprite's art allows (newart.ts maxDrawScale: its picture's pixels at the closest zoom); four-view art takes the
 *  smallest of its four views, since a preset or a library size draws it in any of them; Infinity for a stand-in (it fills any footprint) */
export const artLimit = (id: string) => Math.min(...(fourViews(id)?.views ?? [id]).map(v => { const i = INDEX.get(v); return i === undefined ? Infinity : maxDrawScale(i); }));
/** a preset prop's footprint half extents in a lot's frame (tiles: ha along x, hb along y), as the lot draws it: its view turned by the frame's
 *  quarter (q), at its drawn scale (its preset scale times its owner scale), the world box projected on the frame's axes */
export const frameHalf = (f: { q: number; u: { x: number; y: number }; n: { x: number; y: number } }) => (q: PresetProp): Half => {
  const t = turned(q.id, f.q + q.view), fp = footprintOf(t.id, q.scale * ownerScaleOf(q.id), t.flip), hx = (fp[2] - fp[0]) / 2, hy = (fp[3] - fp[1]) / 2;
  return { ha: Math.abs(f.u.x) * hx + Math.abs(f.u.y) * hy, hb: Math.abs(f.n.x) * hx + Math.abs(f.n.y) * hy };
};
/** a rear or back-of-house set (the old rear views and the house backs): never dealt as a lot's front building */
const REAR = /-north-|gen[:-]back-|[-_]rear(?![a-z])/;
/** the size classes' names, small to large */
export const CLASS_NAMES = ['small', 'medium', 'large'] as const;

/** a sprite's footprint area at its owner size (tiles squared, as its base view stands) */
function areaOf(id: string): number { const fp = footprintOf(id, ownerScaleOf(id), false); return (fp[2] - fp[0]) * (fp[3] - fp[1]); }
/** the base (NE) id of a sprite: four-view art's first view, else itself */
const baseOf = (id: string) => fourViews(id)?.views[0] ?? id;

/** each family's pool (every class) in area order, and its two class bounds (areas: below the first small, below the second medium) */
let FAMILIES: Map<string, { ids: string[]; area: Map<string, number>; bounds: [number, number] }> | null = null;
function families() {
  if (FAMILIES) return FAMILIES;
  const m = new Map<string, { ids: string[]; area: Map<string, number>; bounds: [number, number] }>();
  LIBRARY.forEach((it, i) => {
    if (it.id.startsWith('view:') || it.id.startsWith('east:') || REAR.test(it.id) || !isBuilding(it) || drawnAsStandIn(i) || baseOf(it.id) !== it.id) return;
    const f = standInFamily(it); if (!f || f === 'tree') return;
    let e = m.get(f); if (!e) m.set(f, e = { ids: [], area: new Map(), bounds: [-Infinity, -Infinity] });
    e.ids.push(it.id); e.area.set(it.id, areaOf(it.id));
  });
  for (const e of m.values()) {
    e.ids.sort((a, b) => e.area.get(a)! - e.area.get(b)! || (a < b ? -1 : a > b ? 1 : 0));
    const n = e.ids.length, A = e.ids.map(id => e.area.get(id)!);
    e.bounds = n < 6 ? [Infinity, Infinity] : [A[Math.floor(n / 3)]!, A[Math.floor((2 * n) / 3)]!];
  }
  return (FAMILIES = m);
}
/** a library sprite's family for Change house (standInFamily of its base view), or null when it is no building the swap knows (a prop, a tree) */
export function houseFamily(id: string): string | null {
  const i = INDEX.get(baseOf(id)); if (i === undefined) return null;
  const it = LIBRARY[i]!;
  if (!isBuilding(it)) return null;
  const f = standInFamily(it);
  return f && f !== 'tree' ? f : null;
}
/** a building's size class (0 small, 1 medium, 2 large) within its family, by its footprint area at its owner size; null for no building */
export function sizeClassOf(id: string): 0 | 1 | 2 | null {
  const f = houseFamily(id), e = f ? families().get(f) : undefined; if (!e) return null;
  const a = areaOf(baseOf(id));
  return a < e.bounds[0] ? 0 : a < e.bounds[1] ? 1 : 2;
}
/** the pool a building is swapped within: its family's buildings of its size class, in area order (then id); [] for no building */
export function housePool(id: string): string[] {
  const f = houseFamily(id), e = f ? families().get(f) : undefined, k = sizeClassOf(id);
  if (!e || k === null) return [];
  return e.ids.filter(h => sizeClassOf(h) === k);
}
/** whether a sprite is a building Change house can swap */
export const isHouseLike = (id: string) => housePool(id).length > 0;
/** the next house for a building (dir 1: H) or the one before (dir -1: Shift+H), in its pool, wrapping; never the same one; null when its pool
 *  holds no other */
export function nextHouse(id: string, dir: 1 | -1): string | null {
  const b = baseOf(id), pool = housePool(b), e = families().get(houseFamily(b) ?? '');
  return cycle(pool, b, dir, h => e?.area.get(h) ?? areaOf(h));
}
/** a random other house of a building's pool (Generate's new building): r() in [0, 1); null when the pool holds no other */
export function otherHouse(id: string, r: () => number): string | null {
  const b = baseOf(id), others = housePool(b).filter(h => h !== b);
  return others.length ? others[Math.floor(r() * others.length)]! : null;
}
/** a size class and family as words, for the messages ('small dwelling') */
export function classWords(id: string): string {
  const f = houseFamily(id), k = sizeClassOf(id);
  return f === null || k === null ? 'no building' : `${CLASS_NAMES[k]} ${f.replace(/^cat:/, '').toLowerCase()}`;
}
