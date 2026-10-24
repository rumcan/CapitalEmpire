// The new-art pictures (the owner, 2026-10-24: "remove all the old ones from showing until it was replaced"). By default no building is drawn
// with its old picture: a building whose four new views are not in the game yet is drawn as the new-art building of its class nearest in size,
// on the same footprint (a building with no stand-in at all is not drawn). Trees keep their art. The URL flags:
//   ?newart: the preview: buildings AND trees are drawn as new art (the owner, 2026-10-23: "see what the game looks like with only the new corrected images").
//   ?oldart: the old pictures of the buildings without their four views, for comparison only.
// Only the picture changes: the props keep their ids, footprints, collisions and saves, so none of this alters a game.
//   new art: the four-view buildings (views-library.ts: VIEW_ART and view:*) and the generated trees (trees-library.ts: gen:tree-*)
import { LIBRARY } from './library';
import { isBuilding } from './mirror';
import { VIEW_ART, unmirror } from './views-library';
import type { LibItem } from './types';

const params = (() => { try { return new URLSearchParams(globalThis.location?.search ?? ''); } catch { return new URLSearchParams(); } })();
/** the preview (?newart): buildings AND trees are drawn as new art (no old picture) */
export const NEW_ART_ONLY = params.has('newart');
/** buildings without their four views show their old pictures, for comparison only (?oldart; ?newart wins) */
export const OLD_ART = params.has('oldart') && !NEW_ART_ONLY;
/** the default (the owner, 2026-10-24: "remove all the old ones from showing until it was replaced"): no building is drawn with its old picture */
export const NEW_BUILDINGS_ONLY = !OLD_ART;

/** what a prop is drawn as: its item, flip and scale; hidden: draw nothing (a building with no stand-in at all) */
export interface Look { item: number; flip: boolean; scale: number; hidden?: boolean }

const isNew = (id: string) => VIEW_ART.has(id) || id.startsWith('view:') || id.startsWith('gen:tree-');
/** the class a picture can stand in for: trees, shops, and every other building (houses, lot buildings, baked lots, business pictures, golf and event structures) */
const classOf = (it: LibItem) => it.kind === 'tree' ? 'tree' : isBuilding(it) ? (it.kind === 'venue' ? 'venue' : 'building') : null;
const span = (it: LibItem) => { const b = it.boxes[0]; return b ? b.hx + b.hy : 1; };
/** the stand-ins of each class: new art, the front (NE) views only for buildings (a flip turns them, unmirror) */
const POOL = new Map<string, number[]>();
LIBRARY.forEach((it, i) => {
  const c = classOf(it); if (!c || !isNew(it.id) || it.id.startsWith('east:') || (c !== 'tree' && it.id.startsWith('view:'))) return;
  let list = POOL.get(c); if (!list) POOL.set(c, list = []); list.push(i);
});
const INDEX = new Map(LIBRARY.map((it, i) => [it.id, i] as const));
const hash = (x: number, y: number) => { let h = Math.imul(Math.floor(x * 7.3) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(Math.floor(y * 5.1), 0xc2b2ae35); h ^= h >>> 15; return (h >>> 0) / 4294967296; };

/** a building's stand-in: the new-art building of its class whose footprint is nearest in size (within 25% of the nearest, one picked by place);
 *  a venue with no venue art uses the building stand-ins */
function standIn(it: LibItem, x: number, y: number): number | undefined {
  const c = classOf(it); if (!c) return undefined;
  let pool = POOL.get(c); if ((!pool || !pool.length) && c !== 'tree') pool = POOL.get('building');
  if (!pool?.length) return undefined;
  if (c === 'tree') return pool[Math.floor(hash(x, y) * pool.length)];
  const want = span(it), d = pool.map(i => Math.abs(Math.log(span(LIBRARY[i]!) / want))), best = Math.min(...d);
  const near = pool.filter((_, k) => d[k]! <= best + 0.25);
  return near[Math.floor(hash(x, y) * near.length)];
}

/** which items are drawn as a stand-in (the flags above): an old tree with ?newart, an old building by default (or with ?newart) */
const swaps = (it: LibItem) => !isNew(it.id) && (it.kind === 'tree' ? NEW_ART_ONLY : isBuilding(it) && (NEW_BUILDINGS_ONLY || NEW_ART_ONLY));
const SWAP = LIBRARY.map(swaps);

const cache = new WeakMap<object, Look & { src: number; srcFlip: boolean; srcScale: number }>();
/** what a drawable is drawn as (itself, unless its art is swapped for a stand-in): the same object when not swapped, no allocation */
export function lookOf<T extends Look & { x: number; y: number }>(d: T): Look {
  if (!SWAP[d.item]) return d;
  const c = cache.get(d); if (c && c.src === d.item && c.srcFlip === d.flip && c.srcScale === d.scale) return c;
  const it = LIBRARY[d.item]!;
  let look: Look;
  const s = standIn(it, d.x, d.y);
  if (s === undefined) look = { item: d.item, flip: false, scale: d.scale, hidden: true };
  else {
    const n = LIBRARY[s]!;
    if (n.kind === 'tree') look = { item: s, flip: false, scale: d.scale * it.h / n.h };
    else { const [id, flip] = unmirror(n.id, d.flip); look = { item: INDEX.get(id) ?? s, flip, scale: d.scale * span(it) / span(n) }; }
  }
  cache.set(d, { ...look, src: d.item, srcFlip: d.flip, srcScale: d.scale });
  return look;
}

/** the item a library item is thumbnailed as (its stand-in, or itself when it is drawn as itself) */
export function thumbItem(it: LibItem): LibItem {
  const i = INDEX.get(it.id); if (i === undefined || !SWAP[i]) return it;
  const s = standIn(it, 0, 0);
  return (s === undefined ? undefined : LIBRARY[s]) ?? it;
}
