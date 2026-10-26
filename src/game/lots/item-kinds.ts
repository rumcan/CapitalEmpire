// What a library sprite is to the lots (T155, T158; P25 #348): its group (plants, props, buildings, vehicles), whether the lab offers it, a fence
// (it follows the lot's edges), a tree, and its kind for the lot generator (tree, bush, flowerbed, prop, car; decals are the lot decals), with
// the pools of each kind. Read from the library's own fields (kind, category, name), so new art joins its group and pool by itself. No DOM:
// the lab, the lot generator (lot-gen.ts) and, later, the game's own lots read it.
import { LIBRARY } from '../library';
import type { LibItem } from '../types';
import { drawnAsStandIn } from '../newart';
import { LOT_DECALS } from '../lot-decals';
import { AXIS_HEADING, AXIS_SETS } from '../axis-library';
import { footprintOf, ownerScaleOf } from './preset-art';
import type { ItemKind } from './learn';

const INDEX = new Map(LIBRARY.map((it, i) => [it.id, i] as const));
/** the library categories the lots never offer (the people) */
export const SKIP_CAT = new Set(['Townspeople', 'Spectators', 'Golfers']);
/** a sprite's group, from its kind and category (whole words: "Street furniture" is no tree) */
export function spriteGroup(it: Pick<LibItem, 'id' | 'kind' | 'cat' | 'big'>): 'plants' | 'props' | 'buildings' | 'vehicles' {
  if (it.kind === 'car' || it.cat === 'Vehicles' || it.id.startsWith('cars:')) return 'vehicles';
  if (it.kind === 'tree' || it.kind === 'bush' || it.kind === 'plant' || /\b(trees?|plants?|vegetation|flowers?|hedges?|shrubs?|bush(es)?|garden beds?|grass(es)?)\b/i.test(it.cat)) return 'plants';
  if (it.kind === 'building' || it.kind === 'house' || it.kind === 'venue' || it.kind === 'lot' || it.big) return 'buildings';
  return 'props';
}
/** the screen-axis sets' first pictures (T154: the N view, the front facing screen down; R turns it through E, S, W): the lab offers a set once,
 *  by it, the extra headings of the shops, houses and props among them (view:<id>:n) */
const AXIS_FIRST: ReadonlySet<string> = new Set(Object.values(AXIS_SETS).map(v => v[0]));
/** whether a library sprite may be placed on a lot in the lab: not a turned view (but a screen-axis set's first) or an east copy, not a walker or
 *  one of the people, not an old building drawn as a stand-in */
export const placeable = (it: LibItem, i: number) => (!it.id.startsWith('view:') || AXIS_FIRST.has(it.id)) && !it.id.startsWith('east:') && it.kind !== 'walker' && !SKIP_CAT.has(it.cat) && !drawnAsStandIn(i);
/** a fence, a hedge or a wall piece (it follows the lot's edge) */
export const isFence = (id: string) => { const it = LIBRARY[INDEX.get(id) ?? -1]; return /fence|hedge|wall|railing/i.test(id) || (!!it && (it.kind.startsWith('fence') || it.cat === 'Fences')); };
/** a tree */
export const isTree = (id: string) => { const it = LIBRARY[INDEX.get(id) ?? -1]; return (!!it && it.kind === 'tree') || /(^|[:_\-/ ])(trees?|pines?|oaks?|maples?|birch(es)?|spruces?|firs?|palms?|willows?|elms?|cedars?|aspens?)(?![a-z])/i.test(id); };
/** a sprite's footprint area at its own size (tiles squared) */
export function ownArea(id: string): number { const fp = footprintOf(id, ownerScaleOf(id), false); return (fp[2] - fp[0]) * (fp[3] - fp[1]); }
/** the most a pool's sprite may cover (tiles squared at its own size): no giant trees or sheds among a yard's items */
const MAX_AREA: Readonly<Record<ItemKind, number>> = { tree: 9, bush: 4, flowerbed: 6, prop: 4, car: 6, decal: Infinity };
/** a library sprite's kind for the lot generator, or null for one it does not offer (buildings, fences, signs, the people) */
export function itemKind(it: LibItem, i: number, area = ownArea(it.id)): ItemKind | null {
  // the town's lots leave the screen-axis art (its pictures, view:... and the sets' first) to the Props tool and the lab (T154): the generator,
  // which lays the town's lots on the map axes (T160), never offers it
  if (!placeable(it, i) || it.id.startsWith('view:') || AXIS_HEADING[it.id] !== undefined || isFence(it.id)) return null;
  const g = spriteGroup(it), t = `${it.id} ${it.name}`.toLowerCase();
  // a car a house keeps on its drive: no bus, no truck
  if (g === 'vehicles') return it.kind === 'car' && area <= MAX_AREA.car && !/bus|truck|tractor|trailer/i.test(`${it.id} ${it.name}`) ? 'car' : null;
  if (g === 'buildings') return null;
  if (isTree(it.id) || it.kind === 'tree') return area <= MAX_AREA.tree ? 'tree' : null;
  if (/flower|planter|flowerbed|garden bed|tulip|rose|daisy|pot\b|potted/.test(t)) return area <= MAX_AREA.flowerbed ? 'flowerbed' : null;
  if (g === 'plants' || it.kind === 'bush' || /bush|shrub|hedge|fern|boxwood|hydrangea|azalea/.test(t)) return area <= MAX_AREA.bush ? 'bush' : null;
  if ((it.cat === 'Yard' || it.cat === 'Odds & ends') && area <= MAX_AREA.prop) return 'prop';
  return null;
}
/** the kind of any lot item by its id (a sprite or a lot decal; a sprite the generator does not offer still gets the nearest kind: a vehicle a car,
 *  a plant a bush, the rest a prop), for samples made from items the generator did not offer (P25: the presets as samples) */
export function kindOfId(id: string): ItemKind {
  if (id.startsWith('decal:') || LOT_DECALS.some(d => d.id === id)) return 'decal';
  const i = INDEX.get(id), it = i === undefined ? undefined : LIBRARY[i];
  if (!it) return 'prop';
  const k = itemKind(it, i!, Infinity);
  if (k) return k;
  const g = spriteGroup(it);
  return g === 'vehicles' ? 'car' : g === 'plants' ? (isTree(id) ? 'tree' : 'bush') : 'prop';
}
/** the pools by kind (library ids; the lot decals' ids), in library order, made once */
let POOLS: Record<ItemKind, string[]> | null = null;
export function kindPools(): Record<ItemKind, string[]> {
  if (POOLS) return POOLS;
  const p: Record<ItemKind, string[]> = { tree: [], bush: [], flowerbed: [], prop: [], car: [], decal: LOT_DECALS.map(d => d.id) };
  LIBRARY.forEach((it, i) => { const k = itemKind(it, i); if (k) p[k].push(it.id); });
  return (POOLS = p);
}
