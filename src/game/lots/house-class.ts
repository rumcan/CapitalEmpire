// A building's family and size class (T148's Change house, moved here for T160: the lot generator in the game keys its learned model by the house's
// size class). The family: newart.ts standInFamily of its base view (dwellings, outbuildings, shops and services, industry, landmarks...), the
// buildings the game draws as themselves, front views only (no "-north-", back-of-house or rear sets); the class: the family's footprint areas at
// their owner size split in three (small, medium, large; a family of fewer than six is one class). And a preset prop's footprint in a lot's
// frame. No DOM; reads the library.
import { LIBRARY } from '../library';
import { drawnAsStandIn, standInFamily } from '../newart';
import { isBuilding } from '../mirror';
import { drawnView, footprintOf, fourViews, ownerScaleOf } from './preset-art';
import type { PresetProp } from './presets';

const INDEX = new Map(LIBRARY.map((it, i) => [it.id, i] as const));
/** a footprint's half extents in a lot's frame (tiles: ha along x, hb along y) */
export interface Half { ha: number; hb: number }
/** a preset prop's footprint half extents in a lot's frame (tiles: ha along x, hb along y), as the lot draws it (preset-art.ts drawnView): its view
 *  turned by the frame's quarter (q), at its drawn scale (its preset scale times its owner scale), the world box projected on the frame's axes; a
 *  building facing its road at 45 degrees (T154 Phase 2: a screen-axis view, its footing along the lot's axes) the square inside its world box */
export const frameHalf = (f: { q: number; u: { x: number; y: number }; n: { x: number; y: number } }) => (q: PresetProp): Half => {
  const t = drawnView(q.id, f, q.view), fp = footprintOf(t.id, q.scale * ownerScaleOf(q.id), t.flip), hx = (fp[2] - fp[0]) / 2, hy = (fp[3] - fp[1]) / 2;
  if (t.diag) { const h = Math.max(hx, hy) / Math.SQRT2; return { ha: h, hb: h }; }
  return { ha: Math.abs(f.u.x) * hx + Math.abs(f.u.y) * hy, hb: Math.abs(f.n.x) * hx + Math.abs(f.n.y) * hy };
};
/** a rear or back-of-house set (the old rear views and the house backs): never dealt as a lot's front building */
const REAR = /-north-|gen[:-]back-|[-_]rear(?![a-z])/;
/** the size classes' names, small to large */
export const CLASS_NAMES = ['small', 'medium', 'large'] as const;

/** a sprite's footprint area at its owner size (tiles squared, as its base view stands) */
export function areaOf(id: string): number { const fp = footprintOf(id, ownerScaleOf(id), false); return (fp[2] - fp[0]) * (fp[3] - fp[1]); }
/** the base (NE) id of a sprite: four-view art's first view, else itself (the id presets store, and the house allocations' key) */
export const baseOf = (id: string) => fourViews(id)?.views[0] ?? id;
/** each family's pool (every class) in area order, and its two class bounds (areas: below the first small, below the second medium) */
let FAMILIES: Map<string, { ids: string[]; area: Map<string, number>; bounds: [number, number] }> | null = null;
export function houseFamilies() {
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
  const f = houseFamily(id), e = f ? houseFamilies().get(f) : undefined; if (!e) return null;
  const a = areaOf(baseOf(id));
  return a < e.bounds[0] ? 0 : a < e.bounds[1] ? 1 : 2;
}
/** the pool a building is swapped within: its family's buildings of its size class, in area order (then id); [] for no building */
export function housePool(id: string): string[] {
  const f = houseFamily(id), e = f ? houseFamilies().get(f) : undefined, k = sizeClassOf(id);
  if (!e || k === null) return [];
  return e.ids.filter(h => sizeClassOf(h) === k);
}
