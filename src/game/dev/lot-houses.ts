// Change house (T148, the lot lab's H): the pool a building of a lot is swapped within. A house is swapped only for a house, a shop for a shop:
// the buildings of its family (newart.ts standInFamily: dwellings, outbuildings, shops and services, industry, landmarks...) that the game draws
// as themselves (no stand-in), as their base view (presets store the NE view and a turn), front views only (no "-north-", back-of-house or rear
// sets: a house's front door faces its street), in its size class: the family's footprints at their owner size split in three by area (small,
// medium, large; a family of fewer than six is one class). The pool is in area order, then by id, so H steps to the nearest size first and
// Shift+H steps back. No DOM; reads the library.
import { LIBRARY } from '../library';
import { maxDrawScale } from '../newart';
import { fourViews } from '../lots/preset-art';
import { cycle } from './lot-select';
import { areaOf, baseOf, CLASS_NAMES, houseFamilies, houseFamily, housePool, sizeClassOf } from '../lots/house-class';
// the family, the size class and the frame footprints live in the game (lots/house-class.ts: the lot generator reads them too)
export { areaOf, baseOf, CLASS_NAMES, frameHalf, houseFamily, housePool, sizeClassOf } from '../lots/house-class';

const INDEX = new Map(LIBRARY.map((it, i) => [it.id, i] as const));
/** the largest drawn scale a sprite's art allows (newart.ts maxDrawScale: its picture's pixels at the closest zoom); four-view art takes the
 *  smallest of its four views, since a preset or a library size draws it in any of them; Infinity for a stand-in (it fills any footprint) */
export const artLimit = (id: string) => Math.min(...(fourViews(id)?.views ?? [id]).map(v => { const i = INDEX.get(v); return i === undefined ? Infinity : maxDrawScale(i); }));
/** which houses may be dealt (T155: the house allocations for the lot's road angle and state, lots/house-alloc.ts allows); absent: every one */
export type HouseOk = (id: string) => boolean;
const ANY: HouseOk = () => true;

/** whether a sprite is a building Change house can swap */
export const isHouseLike = (id: string) => housePool(id).length > 0;
/** the next house for a building (dir 1: H) or the one before (dir -1: Shift+H), in its pool, wrapping; never the same one; only houses ok allows
 *  (T155: the allocations; the building itself need not be allowed: the next allowed one above or below it by area); null when its pool holds no
 *  other allowed one */
export function nextHouse(id: string, dir: 1 | -1, ok: HouseOk = ANY): string | null {
  const b = baseOf(id), e = houseFamilies().get(houseFamily(b) ?? '');
  return cycle(housePool(b).filter(ok), b, dir, h => e?.area.get(h) ?? areaOf(h));
}
/** a random other house of a building's pool (Generate's new building), of the houses ok allows: r() in [0, 1); null when the pool holds no other
 *  allowed one */
export function otherHouse(id: string, r: () => number, ok: HouseOk = ANY): string | null {
  const b = baseOf(id), others = housePool(b).filter(h => h !== b && ok(h));
  return others.length ? others[Math.floor(r() * others.length)]! : null;
}
/** the house a freshly dealt lot keeps (New lot, T155): the building itself when ok allows it, else a random allowed one of its pool; null when no
 *  house of its pool is allowed (it stays, and the lab says so) */
export function allowedHouse(id: string, r: () => number, ok: HouseOk = ANY): string | null {
  const b = baseOf(id);
  return ok(b) ? b : otherHouse(b, r, ok);
}
/** how many houses suit (ok): of a building's pool (its family and size class) and of its family (every class), with their sizes */
export function suitCounts(id: string, ok: HouseOk): { pool: number; poolAll: number; family: number; familyAll: number } {
  const b = baseOf(id), pool = housePool(b), e = houseFamilies().get(houseFamily(b) ?? ''), fam = e?.ids ?? [];
  return { pool: pool.filter(ok).length, poolAll: pool.length, family: fam.filter(ok).length, familyAll: fam.length };
}
/** a size class and family as words, for the messages ('small dwelling') */
export function classWords(id: string): string {
  const f = houseFamily(id), k = sizeClassOf(id);
  return f === null || k === null ? 'no building' : `${CLASS_NAMES[k]} ${f.replace(/^cat:/, '').toLowerCase()}`;
}
