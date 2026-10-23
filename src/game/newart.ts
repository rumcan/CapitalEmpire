// The new-art preview (the owner, 2026-10-23: "see what the game looks like with only the new corrected images"). Open the game with ?newart in
// the URL: every building or tree without new art is drawn as the new-art one of its class nearest in size, on the same footprint. Only the
// picture changes: the props keep their ids, footprints, collisions and saves, so the preview never alters a game.
//   new art: the four-view buildings (views-library.ts: VIEW_ART and view:*) and the generated trees (trees-library.ts: gen:tree-*)
import { LIBRARY } from './library';
import { VIEW_ART, unmirror } from './views-library';
import type { LibItem } from './types';

export const NEW_ART_ONLY = (() => { try { return new URLSearchParams(globalThis.location?.search ?? '').has('newart'); } catch { return false; } })();

/** what a prop is drawn as: its item, flip and scale */
export interface Look { item: number; flip: boolean; scale: number }

const isNew = (id: string) => VIEW_ART.has(id) || id.startsWith('view:') || id.startsWith('gen:tree-');
/** the class a picture can stand in for: trees, shops, and houses with the other lot buildings */
const classOf = (it: LibItem) => it.kind === 'tree' ? 'tree' : it.kind === 'venue' ? 'venue' : it.kind === 'house' || it.kind === 'building' ? 'building' : null;
const span = (it: LibItem) => { const b = it.boxes[0]; return b ? b.hx + b.hy : 1; };
/** the stand-ins of each class: new art, the front (NE) views only for buildings (a flip turns them, unmirror) */
const POOL = new Map<string, number[]>();
LIBRARY.forEach((it, i) => {
  const c = classOf(it); if (!c || !isNew(it.id) || it.id.startsWith('east:') || (c !== 'tree' && it.id.startsWith('view:'))) return;
  let list = POOL.get(c); if (!list) POOL.set(c, list = []); list.push(i);
});
const INDEX = new Map(LIBRARY.map((it, i) => [it.id, i] as const));
const hash = (x: number, y: number) => { let h = Math.imul(Math.floor(x * 7.3) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(Math.floor(y * 5.1), 0xc2b2ae35); h ^= h >>> 15; return (h >>> 0) / 4294967296; };

/** a building's stand-in: the new-art building of its class whose footprint is nearest in size (within 25% of the nearest, one picked by place) */
function standIn(it: LibItem, x: number, y: number): number | undefined {
  const c = classOf(it), pool = c && POOL.get(c); if (!pool?.length) return undefined;
  if (c === 'tree') return pool[Math.floor(hash(x, y) * pool.length)];
  const want = span(it), d = pool.map(i => Math.abs(Math.log(span(LIBRARY[i]!) / want))), best = Math.min(...d);
  const near = pool.filter((_, k) => d[k]! <= best + 0.25);
  return near[Math.floor(hash(x, y) * near.length)];
}

const cache = new WeakMap<object, Look & { src: number; srcFlip: boolean; srcScale: number }>();
/** what a drawable is drawn as (itself, unless the preview is on and its art is old) */
export function lookOf<T extends Look & { x: number; y: number }>(d: T): Look {
  if (!NEW_ART_ONLY) return d;
  const c = cache.get(d); if (c && c.src === d.item && c.srcFlip === d.flip && c.srcScale === d.scale) return c;
  const it = LIBRARY[d.item]!;
  let look: Look = d;
  if (!isNew(it.id)) {
    const s = standIn(it, d.x, d.y);
    if (s !== undefined) {
      const n = LIBRARY[s]!;
      if (n.kind === 'tree') look = { item: s, flip: false, scale: d.scale * it.h / n.h };
      else { const [id, flip] = unmirror(n.id, d.flip); look = { item: INDEX.get(id) ?? s, flip, scale: d.scale * span(it) / span(n) }; }
    }
  }
  cache.set(d, { ...look, src: d.item, srcFlip: d.flip, srcScale: d.scale });
  return look;
}
