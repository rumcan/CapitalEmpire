// T219 (P27, #594): the iconic places. A place is one hand-built whole preset (iconic-places.json, the lot presets' format) with one footprint
// of its own, bigger than any lot: the drive-in (30 x 20 tiles), the high school (50 x 35). Every map gets each place once, when its town reaches
// the place's residents, on the best free frontage of an axis street near the town centre (the main roads first, a jitter seeded by the map seed
// and the place). It faces its street: the preset frame turned to the street's side (four-view art its turned view), never mirrored. Pure, no
// DOM: the engine gives the streets and says which land is free (findSite), and draws the place with compose.ts composeWhole.
import PLACES_JSON from './iconic-places.json';
import { parsePresets } from './preset-read';
import type { LotPreset } from './presets';

/** a point or direction in world tiles */
export interface Pt { x: number; y: number }
/** a box in world tiles: x0, y0, x1, y1 */
export type Box4 = [number, number, number, number];
/** a place as its file holds it: id, name ('{town}' is the town's name), what it is, the name it takes in a town with no name yet, the residents
 *  its town needs before it opens, the stand-ins (library id: the art it waits for; the map labels the first of each), and its whole preset */
export interface PlaceDef { id: string; name: string; kind: string; alone: string; pop: number; standIns: Readonly<Record<string, string>>; preset: LotPreset }
/** a place on the map: its id, its front corner (the preset frame's origin: x = 0 at the street edge, world tiles) and its quarter turn q (the
 *  street's side: 0 on +y, 1 on +x, 2 on -y, 3 on -x; preset-frame.ts facingOf) */
export interface PlacedPlace { id: string; x: number; y: number; q: 0 | 1 | 2 | 3 }
/** a placed place as the save keeps it: id, x, y, q */
export type PlaceTuple = [string, number, number, number];

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
/** the places read from the place file's JSON ({ places: [...] }): a place that does not read (a bad field, a preset the preset reader drops, not
 *  whole) is left out, never the rest */
export function placeDefsFrom(json: unknown): PlaceDef[] {
  const out: PlaceDef[] = [];
  if (!isObj(json) || !Array.isArray(json.places)) return out;
  for (const v of json.places) {
    if (!isObj(v)) continue;
    const { id, name, kind, alone, pop, standIns, preset } = v;
    if (typeof id !== 'string' || !id || typeof name !== 'string' || typeof kind !== 'string' || typeof pop !== 'number' || !Number.isFinite(pop) || pop < 0) continue;
    if (out.some(p => p.id === id)) continue;
    const p = parsePresets([preset]).presets[0];
    if (!p || !p.whole) continue;
    const si: Record<string, string> = {};
    if (isObj(standIns)) for (const [k, s] of Object.entries(standIns)) if (typeof s === 'string') si[k] = s;
    out.push({ id, name, kind, alone: typeof alone === 'string' ? alone : `The ${kind}`, pop, standIns: si, preset: p });
  }
  return out;
}
/** the places every map gets, in the file's order */
export const PLACE_DEFS: readonly PlaceDef[] = placeDefsFrom(PLACES_JSON);
export const placeDef = (id: string, defs: readonly PlaceDef[] = PLACE_DEFS): PlaceDef | undefined => defs.find(d => d.id === id);

/** a place's name in its town: '{town} Drive-In' with the town's name, or its name alone ("The Drive-In") while the town has none */
export function placeName(def: PlaceDef, town: string | null): string { return town ? def.name.split('{town}').join(town) : def.alone; }

/** the places due in a town of pop residents that this map has not placed (placed: their ids), the smallest first: each is placed once */
export function duePlaces(pop: number, placed: ReadonlySet<string>, defs: readonly PlaceDef[] = PLACE_DEFS): PlaceDef[] {
  return defs.filter(d => pop >= d.pop && !placed.has(d.id)).sort((a, b) => a.pop - b.pop);
}

/** the away vector (from the street into the place) of each quarter turn */
const AWAY: readonly Pt[] = [{ x: 0, y: -1 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 0 }];
/** a placed place's frame as a lot's (compose.ts LotGeom): origin, along u (the preset's x: n turned a quarter, so preset-frame.ts frameOf keeps
 *  the origin), away n and its size (tiles) */
export function placeGeom(p: PlacedPlace, def: { preset: { w: number; d: number } }): { o: Pt; u: Pt; n: Pt; w: number; d: number } {
  const n = AWAY[p.q]!;
  return { o: { x: p.x, y: p.y }, u: { x: -n.y, y: n.x }, n: { x: n.x, y: n.y }, w: def.preset.w, d: def.preset.d };
}
/** a place's footprint (world tiles) */
export function placeBox(p: PlacedPlace, def: { preset: { w: number; d: number } }): Box4 {
  const g = placeGeom(p, def), ax = g.o.x + g.u.x * g.w, ay = g.o.y + g.u.y * g.w, bx = g.o.x + g.n.x * g.d, by = g.o.y + g.n.y * g.d, cx = ax + g.n.x * g.d, cy = ay + g.n.y * g.d;
  return [Math.min(g.o.x, ax, bx, cx), Math.min(g.o.y, ay, by, cy), Math.max(g.o.x, ax, bx, cx), Math.max(g.o.y, ay, by, cy)];
}

/** a street a place may front: its key (stable: the save's order is not), its centre line from a to b (tiles), the verge edge's distance from
 *  the line (the road's half width and its walk, tiles) and its class order (network.ts RoadClass.order: the main roads are higher) */
export interface SiteSeg { key: string; ax: number; ay: number; bx: number; by: number; off: number; order: number }
/** what a site search reads: the town's streets, its centre, the map seed, how far from the centre a place may stand (tiles), and whether a
 *  footprint's land is free (no road, built lot, water, golf land, business, car park, painted ground or other place: the engine's) */
export interface SiteCtx { segs: readonly SiteSeg[]; centre: Pt; seed: number; free: (box: Box4) => boolean; reach?: number }
/** the step along a street between the spots tried, the gap kept from the verge, the share of a place's width that must front its own street,
 *  the most off-axis a street may run (its across extent over its length), the reach, and the most spots tried */
export const SITE_STEP = 2, SITE_GAP = 0.25, SITE_FRONT = 0.6, SITE_SKEW = 0.03, SITE_REACH = 1000, SITE_TRIES = 20000;
/** how much a road class step is worth against a tile of distance from the centre, and the seeded jitter's span (tiles of distance) */
const ORDER_W = 40, JITTER = 40;

/** a stable hash of a string to [0, 1) (FNV-1a) */
function unit(s: string): number { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15; return (h >>> 0) / 4294967296; }

/** a spot a place could take: the place, its score and its footprint */
interface Spot { p: PlacedPlace; score: number; box: Box4; tie: string }
/** the place's site on this map: along every axis street side (within SITE_SKEW of an axis), the footprint at the verge edge every SITE_STEP
 *  tiles (at least SITE_FRONT of its width along its own street), within the reach of the centre; scored by the road's class, the nearness to
 *  the centre and a jitter seeded by the map seed, the place and the spot; the spots tried best first, the first free one taken. null: none free.
 *  The same streets, seed and free land give the same site */
export function findSite(def: PlaceDef, ctx: SiteCtx): PlacedPlace | null {
  const W = def.preset.w, D = def.preset.d, reach = ctx.reach ?? SITE_REACH, spots: Spot[] = [];
  for (const s of ctx.segs) {
    const dx = s.bx - s.ax, dy = s.by - s.ay, L = Math.hypot(dx, dy);
    if (L < 1) continue;
    const alongX = Math.abs(dy) <= SITE_SKEW * L, alongY = Math.abs(dx) <= SITE_SKEW * L;
    if (!alongX && !alongY) continue;
    // the line's across coordinate (its mean), its along range
    const across = alongX ? (s.ay + s.by) / 2 : (s.ax + s.bx) / 2, lo = alongX ? Math.min(s.ax, s.bx) : Math.min(s.ay, s.by), hi = lo + L;
    for (const side of [-1, 1] as const) {
      // the away vector: across the line, to this side; the quarter it gives (the street on the other side)
      const n: Pt = alongX ? { x: 0, y: side } : { x: side, y: 0 };
      const q = AWAY.findIndex(a => a.x === n.x && a.y === n.y) as 0 | 1 | 2 | 3, u: Pt = { x: -n.y, y: n.x };
      const edge = across + side * (s.off + SITE_GAP);
      for (let t = lo - (1 - SITE_FRONT) * W; t <= hi - SITE_FRONT * W + 1e-9; t += SITE_STEP) {
        // the footprint: along [t, t + W], across from the verge edge D away
        const a0 = Math.round(t * 2) / 2, c0 = side > 0 ? edge : edge - D;
        const box: Box4 = alongX ? [a0, c0, a0 + W, c0 + D] : [c0, a0, c0 + D, a0 + W];
        const cx = (box[0] + box[2]) / 2, cy = (box[1] + box[3]) / 2, dist = Math.hypot(cx - ctx.centre.x, cy - ctx.centre.y);
        if (dist > reach) continue;
        // the frame's origin: the street-edge corner at the start of u
        const ox = u.x !== 0 ? (u.x > 0 ? box[0] : box[2]) : (n.x > 0 ? box[0] : box[2]), oy = u.y !== 0 ? (u.y > 0 ? box[1] : box[3]) : (n.y > 0 ? box[1] : box[3]);
        const tie = `${s.key}|${side}|${a0}`;
        spots.push({ p: { id: def.id, x: ox, y: oy, q }, box, tie, score: ORDER_W * s.order - dist + JITTER * unit(`${ctx.seed}|${def.id}|${tie}`) });
      }
    }
  }
  spots.sort((a, b) => b.score - a.score || (a.tie < b.tie ? -1 : a.tie > b.tie ? 1 : 0));
  const n = Math.min(spots.length, SITE_TRIES);
  for (let i = 0; i < n; i++) if (ctx.free(spots[i]!.box)) return spots[i]!.p;
  return null;
}

/** the places as the save keeps them, and back (a tuple of an unknown place or a bad shape is dropped; one per id) */
export const placeTuples = (list: readonly PlacedPlace[]): PlaceTuple[] => list.map(p => [p.id, p.x, p.y, p.q]);
export function placesFromTuples(t: unknown, defs: readonly PlaceDef[] = PLACE_DEFS): PlacedPlace[] {
  const out: PlacedPlace[] = [];
  if (!Array.isArray(t)) return out;
  for (const v of t) {
    if (!Array.isArray(v) || v.length < 4) continue;
    const [id, x, y, q] = v;
    if (typeof id !== 'string' || !placeDef(id, defs) || out.some(p => p.id === id) || typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y) || ![0, 1, 2, 3].includes(q as number)) continue;
    out.push({ id, x, y, q: q as 0 | 1 | 2 | 3 });
  }
  return out;
}
