// The new-art pictures (the owner, 2026-10-24: "remove all the old ones from showing until it was replaced"). By default no building is drawn
// with its old picture: a building whose four new views are not in the game yet is drawn as the new-art building of its family nearest in size,
// on the same footprint (a building with no stand-in at all is not drawn). Only the buildings of the art inventory are swapped: props (the golf
// flagsticks and benches, carts, boats) keep their own pictures. Trees keep their art. The URL flags:
//   ?newart: the preview: buildings AND trees are drawn as new art (the owner, 2026-10-23: "see what the game looks like with only the new corrected images").
//   ?oldart: the old pictures of the buildings without their four views, for comparison only.
// Only the picture changes: the props keep their ids, footprints, collisions and saves, so none of this alters a game.
//   new art: the four-view buildings (views-library.ts: VIEW_ART and view:*), the generated trees (trees-library.ts: gen:tree-*) and the screen-axis
//   pictures (axis-library.ts: the new car parks, plants and props, and the shops' and houses' extra headings)
//   sizes (the owner, 2026-10-24: "Some are even placed so big they pixelate"): no picture is drawn above the pixels its atlas rect holds at the
//   closest zoom (sizes.ts PIXEL_LIMIT), whatever asked for the size (a stand-in filling a bigger footprint, the player's resize, a studio size
//   above what the atlas holds): it is drawn at its limit instead. Only the drawing: the footprint, collisions and saves keep the prop's scale.
//   The packs size the pictures for this: prep-views.mjs packs each stand-in for the largest size any building drawn as it needs (standInNeeds).
import { LIBRARY } from './library';
import { isBuilding } from './mirror';
import { BUILDING_IDS, VIEW_ART, unmirror } from './views-library';
import { AXIS_HEADING } from './axis-library';
import { OWNER_SCALE } from './lots/scales';
import { CAR_SCALE } from './ext/car-art';
import { PIXEL_LIMIT, PIXEL_SLACK } from './sizes';
import type { LibItem } from './types';

const params = (() => { try { return new URLSearchParams(globalThis.location?.search ?? ''); } catch { return new URLSearchParams(); } })();
/** the preview (?newart): buildings AND trees are drawn as new art (no old picture) */
export const NEW_ART_ONLY = params.has('newart');
/** buildings without their four views show their old pictures, for comparison only (?oldart; ?newart wins) */
export const OLD_ART = params.has('oldart') && !NEW_ART_ONLY;
/** the default (the owner, 2026-10-24: "remove all the old ones from showing until it was replaced"): no building is drawn with its old picture */
export const NEW_BUILDINGS_ONLY = !OLD_ART;

/** what a prop is drawn as: its item, flip and scale; hidden: draw nothing (a building with no stand-in at all); x, y: the anchor it is drawn at
 *  (tiles) when that is not the prop's own (a stand-in is centred on its building's footprint) */
export interface Look { item: number; flip: boolean; scale: number; hidden?: boolean; x?: number; y?: number }

/** new art: the four-view buildings, their views, the generated trees and the screen-axis pictures (axis-library.ts, T154: the car parks and plants are new subjects) */
const isNew = (id: string) => VIEW_ART.has(id) || id.startsWith('view:') || id.startsWith('gen:tree-') || AXIS_HEADING[id] !== undefined;
/** a baked lot (kind 'lot': a whole house lot as one picture, the studio's Lots presets) is never swapped for a building: it is baked from the
 *  library's current art (the studio's Rebuild), and one building stretched over a whole lot would not be a house lot */
const BAKED_LOT = (it: LibItem) => it.kind === 'lot';
/** a building of the art inventory (views-library.ts BUILDING_IDS, art/building-views/COVERAGE.md): the pictures that get four views, so the only
 *  ones a stand-in replaces until theirs land. The props and vehicles packed with the business art (flagsticks, the bag trolley, the course-map
 *  bench, carts, buses, taxis, the bass boat, the dock props) and its course pieces (pond, bunker, footbridge) are kind 'business' too, so
 *  mirror.ts never mirrors them, but they are no buildings: drawn as themselves (T111: every pin, tee marker and bench of a course was drawn as a
 *  casino, a taxi depot or a tackle shop) */
const inInventory = (it: LibItem) => BUILDING_IDS.has(it.id) || VIEW_ART.has(it.id);
/** outbuildings (garages, sheds, yard buildings) stand in only for each other */
const OUTBUILDING = /garage|shed|carport|outhouse|lean-to|glasshouse|greenhouse|swingset|kennel|coop|shelter/;
/** the families a library category gets wrong: the starter clubhouse (a tin shack, filed under Golf tournament with the grandstands, tents and
 *  leaderboards) is a clubhouse, drawn as the clubhouse until its own four views land (T111: Grandstand S stood in for it) */
const FAMILY: Record<string, string> = { 'golf:clubhouse-shanty': 'clubhouse', 'business:golf-clubhouse': 'clubhouse' };
/** the family a picture can stand in for, so a house is only ever drawn as a house (the owner, 2026-10-24: tents and industrial garages turned up on
 *  house lots): trees; dwellings and outbuildings (the house categories and the yard buildings); the clubhouse; business art; every other building by
 *  its library category (golf tournament, industry, shops and services, landmarks, street furniture, parking). None for a baked lot (never swapped)
 *  and for a picture outside the art inventory (a prop: drawn as itself) */
export function standInFamily(it: LibItem): string | null {
  if (it.kind === 'tree') return 'tree';
  if (!isBuilding(it) || BAKED_LOT(it) || !inInventory(it)) return null;
  const f = FAMILY[it.id]; if (f) return f;
  if (it.kind === 'business') return 'business';
  if (it.kind === 'house' || it.cat === 'Houses' || it.cat === 'More houses' || it.cat === 'Yard') return it.cat === 'Yard' || OUTBUILDING.test(it.id) ? 'outbuilding' : 'dwelling';
  return `cat:${it.cat || it.kind}`;
}
const classOf = standInFamily;
const span = (it: LibItem) => { const b = it.boxes[0]; return b ? b.hx + b.hy : 1; };
/** the stand-ins of each family: new art, the front (NE) views only for buildings (a flip turns them, unmirror) */
const POOL = new Map<string, number[]>();
LIBRARY.forEach((it, i) => {
  const c = classOf(it); if (!c || !isNew(it.id) || it.id.startsWith('east:') || (c !== 'tree' && it.id.startsWith('view:'))) return;
  let list = POOL.get(c); if (!list) POOL.set(c, list = []); list.push(i);
});
const INDEX = new Map(LIBRARY.map((it, i) => [it.id, i] as const));
const hash = (x: number, y: number) => { let h = Math.imul(Math.floor(x * 7.3) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(Math.floor(y * 5.1), 0xc2b2ae35); h ^= h >>> 15; return (h >>> 0) / 4294967296; };

/** how much nearer than the nearest a stand-in may be and still be picked (by place, for variety): 10% (was 25%, the owner, 2026-10-24: stand-ins
 *  stretched far past their own size were the houses drawn too big) */
const NEAR = 0.1;
const own = (it: LibItem) => OWNER_SCALE[it.id] ?? 1;
/** a building's stand-in for a prop at scale k: the new-art building of its family that fills the footprint nearest its own size (its owner
 *  scale) without being stretched past its pixels (within 10% of the nearest, one picked by place); when every one would be stretched past its
 *  pixels, the least stretched (drawn at its limit by lookOf). None when its family has no new art (lookOf then hides it: a house is never drawn
 *  as a shop or a tent) */
function standIn(it: LibItem, x: number, y: number, k: number): number | undefined {
  const c = classOf(it); if (!c) return undefined;
  const pool = POOL.get(c);
  if (!pool?.length) return undefined;
  if (c === 'tree') return pool[Math.floor(hash(x, y) * pool.length)];
  const want = span(it) * k, fill = pool.map(i => want / span(LIBRARY[i]!)), over = pool.map((i, n) => fill[n]! / PIXEL_LIMIT[i]!);
  const ks = pool.map((_, n) => n), fits = ks.filter(n => over[n]! <= PIXEL_SLACK);
  let near: number[];
  if (fits.length) {
    const dist = pool.map((i, n) => Math.abs(Math.log(fill[n]! / own(LIBRARY[i]!)))), best = Math.min(...fits.map(n => dist[n]!));
    near = fits.filter(n => dist[n]! <= best + NEAR);
  } else { const best = Math.min(...over); near = ks.filter(n => over[n]! <= best * (1 + NEAR)); }
  return pool[near[Math.floor(hash(x, y) * near.length)]!];
}
/** the stand-ins a building (a library index) may be drawn as at scale k, by place: standIn's choice once every one of them is packed for it (the
 *  new-art buildings of its family nearest its size, within NEAR of the nearest, their pixels not counted). [] for an item drawn as itself or a tree */
export function standInCandidates(item: number, k: number): number[] {
  const it = LIBRARY[item]; if (!it || !SWAP[item] || it.kind === 'tree') return [];
  const c = classOf(it), pool = c ? POOL.get(c) : undefined; if (!pool?.length) return [];
  const want = span(it) * k, dist = pool.map(i => Math.abs(Math.log(want / span(LIBRARY[i]!) / own(LIBRARY[i]!)))), best = Math.min(...dist);
  return pool.filter((_, n) => dist[n]! <= best + NEAR);
}
/** the scale each new-art building must be packed at (prep-views.mjs, over its own owner scale) for every old building drawn as it, at its owner
 *  scale, to fill its footprint without stretching: id -> the largest of those buildings' scale x span(building) / span(stand-in). Only the
 *  stand-ins some building needs are listed */
export function standInNeeds(): Record<string, number> {
  const need: Record<string, number> = {};
  LIBRARY.forEach((it, i) => {
    const k = own(it);
    for (const s of standInCandidates(i, k)) { const n = LIBRARY[s]!, want = k * span(it) / span(n); if (!(need[n.id]! >= want)) need[n.id] = want; }
  });
  return need;
}
/** the anchor that centres a picture (item, flip, scale) on a footprint (tiles): the footprint's centre less the picture's own box offset */
function centred(n: LibItem, flip: boolean, k: number, d: { x0?: number; y0?: number; x1?: number; y1?: number }): { x: number; y: number } | null {
  if (d.x0 === undefined || d.y0 === undefined || d.x1 === undefined || d.y1 === undefined || !n.boxes.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const b of n.boxes) {
    const hx = (flip ? b.hy : b.hx) * k / 2, hy = (flip ? b.hx : b.hy) * k / 2, dx = (flip ? b.dy : b.dx) * k / 2, dy = (flip ? b.dx : b.dy) * k / 2;
    x0 = Math.min(x0, dx - hx); x1 = Math.max(x1, dx + hx); y0 = Math.min(y0, dy - hy); y1 = Math.max(y1, dy + hy);
  }
  return { x: (d.x0 + d.x1) / 2 - (x0 + x1) / 2, y: (d.y0 + d.y1) / 2 - (y0 + y1) / 2 };
}

/** which items are drawn as a stand-in (the flags above): an old tree with ?newart, an old building of the art inventory by default (or with
 *  ?newart); never a prop */
const swaps = (it: LibItem) => !isNew(it.id) && (it.kind === 'tree' ? NEW_ART_ONLY : isBuilding(it) && inInventory(it) && !BAKED_LOT(it) && (NEW_BUILDINGS_ONLY || NEW_ART_ONLY));
const SWAP = LIBRARY.map(swaps);
/** a library item the game never draws as itself: an old building drawn as a new-art stand-in picked by where it stands (the lot lab's palette leaves these out: a placed one would look different on every lot) */
export const drawnAsStandIn = (item: number): boolean => !!SWAP[item];

const CAR = LIBRARY.map(it => it.kind === 'car');
/** the largest scale a drawable's item is drawn at (sizes.ts PIXEL_LIMIT; a parked car is drawn CAR_SCALE smaller than its scale, sprites.ts) */
const limitOf = (item: number, moving?: boolean) => PIXEL_LIMIT[item]! / (CAR[item] && !moving ? CAR_SCALE : 1);

type Drawn = Look & { x: number; y: number; x0?: number; y0?: number; x1?: number; y1?: number; moving?: boolean };
const cache = new WeakMap<object, Look & { src: number; srcFlip: boolean; srcScale: number; srcX: number; srcY: number }>();
/** what a drawable is drawn as: itself, unless its art is swapped for a stand-in (centred on its footprint) or it would be drawn past its pixels
 *  at the closest zoom (then at its limit, about its anchor). The same object when neither, no allocation */
export function lookOf<T extends Drawn>(d: T): Look {
  if (!SWAP[d.item] && d.scale <= limitOf(d.item, d.moving) * PIXEL_SLACK) return d;
  const c = cache.get(d); if (c && c.src === d.item && c.srcFlip === d.flip && c.srcScale === d.scale && c.srcX === d.x && c.srcY === d.y) return c;
  const it = LIBRARY[d.item]!;
  let look: Look;
  if (!SWAP[d.item]) look = { item: d.item, flip: d.flip, scale: limitOf(d.item, d.moving) };
  else {
    const s = standIn(it, d.x, d.y, d.scale);
    if (s === undefined) look = { item: d.item, flip: false, scale: d.scale, hidden: true };
    else {
      const n = LIBRARY[s]!;
      if (n.kind === 'tree') look = { item: s, flip: false, scale: Math.min(d.scale * it.h / n.h, PIXEL_LIMIT[s]!) };
      else {
        // fills its building's footprint, never past its pixels (then drawn at its limit), centred on the footprint
        const [id, flip] = unmirror(n.id, d.flip), item = INDEX.get(id) ?? s, fill = d.scale * span(it) / span(n), lim = PIXEL_LIMIT[item]!;
        const scale = fill > lim * PIXEL_SLACK ? lim : fill;
        look = { item, flip, scale, ...centred(LIBRARY[item]!, flip, scale, d) };
      }
    }
  }
  cache.set(d, { ...look, src: d.item, srcFlip: d.flip, srcScale: d.scale, srcX: d.x, srcY: d.y });
  return look;
}

/** the largest scale a library item is placed at with its picture filling it (its pixel limit, sizes.ts); a stand-in fills any footprint (drawn
 *  at its limit past it), so a swapped item has none */
export function maxDrawScale(item: number): number { return SWAP[item] ? Infinity : limitOf(item) * PIXEL_SLACK; }

/** the item a library item is thumbnailed as (its stand-in at its owner scale, or itself when it is drawn as itself) */
export function thumbItem(it: LibItem): LibItem {
  const i = INDEX.get(it.id); if (i === undefined || !SWAP[i]) return it;
  const s = standIn(it, 0, 0, own(it));
  return (s === undefined ? undefined : LIBRARY[s]) ?? it;
}

/** a library item's plain name for a label: its display name without a variation or view suffix or a note in brackets ('Church — variation 1'
 *  is 'Church', 'Starter clubhouse (a tin and tarp shack)' is 'Starter clubhouse'), else its id tidied ('town:fire_station' is 'Fire station') */
export function plainName(it: Pick<LibItem, 'id' | 'name'>): string {
  const name = (it.name ?? '').replace(/\s*\([^)]*\)\s*$/, '').replace(/(\s+—\s+(variation \d+|[A-Z] (south|north) view|(side|front|rear|corner) view))+$/i, '').trim();
  if (name) return name;
  // the id's last part (a variation's ':1' dropped), less its hash and plain/north tail: 'variation:world-church-44e76535-plain:1' is 'world church'
  const id = it.id.replace(/:\d+$/, ''), raw = id.slice(id.lastIndexOf(':') + 1).replace(/-[0-9a-f]{8}\b.*$/, '').replace(/[-_]+/g, ' ').trim() || it.id;
  return raw[0]!.toUpperCase() + raw.slice(1);
}
/** the label over a stand-in (the owner, 2026-10-25: "if stand ins are required add a little text above it that says 'Stand In for Church'"):
 *  'Stand In for <its plain name>' for an item drawn as a stand-in (a building of the art inventory waiting for its four views, with a new-art
 *  building of its family to stand in), null for anything drawn as itself (new art, props, cars, trees) or not drawn at all. Cached per item, so
 *  the map overlay allocates nothing for it */
const LABEL: (string | null | undefined)[] = [];
export function standInLabel(item: number): string | null {
  let s = LABEL[item]; if (s !== undefined) return s;
  const it = LIBRARY[item];
  s = it && SWAP[item] && it.kind !== 'tree' && standIn(it, 0, 0, own(it)) !== undefined ? `Stand In for ${plainName(it)}` : null;
  LABEL[item] = s; return s;
}
