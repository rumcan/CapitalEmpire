// T237 (#694): a paved car park that looks like one (the concept, docs/art/concept/maple-falls-concept.webp: kerbs, painted bays, tree islands,
// lamp posts). Beside its asphalt and painted bays (carpark.ts bayGrid, the engine's ground) a paved car park gets: a concrete kerb round its
// edge, open at each entrance; a kerbed planting island at both ends of each double row of bays (in the clear tile bayGrid leaves there), with a
// tree or a lamp post and a shrub, alternating along the edge; and a paved footpath from its edge nearest a venue's door to that door. All of it
// from the built park alone, so it is the same every time (no random: a hash of the park's id picks the trees). Pure TS, no DOM.
import type { Pt } from '../network';
import { toLocal, toWorld, type CarPark } from './carpark';
import { AISLE, BAY_D, BAY_W } from './config';

/** the kerb's width (tiles: 0.3 = 60 cm, the island kerbs the same) and the entrance's opening in it (tiles along the edge: a two-way mouth) */
export const KERB_W = 0.3, MOUTH = 4.5;
/** an island's inset from the row's clear end and from its double row's edges (tiles), and the grass inside its kerb */
const ISLAND_IN = 0.08;
/** the footpath's width (tiles: 2.4 m) and the longest one laid (tiles: past that the walk is across the grass) */
export const PATH_W = 1.2, PATH_MAX = 60;
/** the trees an island takes (the town's street trees, lit from the upper right; tree-sun.ts mirrors none of them at random) and its shrubs */
export const ISLAND_TREES: readonly string[] = ['world:tree_oak_1', 'ref:tree-maple-crimson', 'world:tree_oak_2', 'ref:tree-birch-gold'];
export const ISLAND_SHRUBS: readonly string[] = ['town:hydrangea', 'town:fern', 'town:ornamental_grass', 'world:bush_2'];

/** a polygon (x y pairs, world tiles) and its ground: a kerb or an island's kerb (concrete), its grass, or the footpath (paving) */
export interface LookPatch { pts: number[]; tex: 'slabs' | 'grass' | 'paving' }
/** a prop of the look: its library id, its point (world tiles: the foot's centre) and its size */
export interface LookProp { id: string; x: number; y: number; scale: number }
/** a paved car park's look: its ground patches (kerbs and islands drawn with the car park, over its asphalt; the footpath under the roads) and
 *  its props (the islands' trees, lamps and shrubs) */
export interface ParkLook { over: LookPatch[]; path: LookPatch[] | null; props: LookProp[] }

/** a number 0..2^32 from the park's id and a salt */
function hash(a: number, b: number): number {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return h >>> 0;
}
/** the world polygon of the local rect [x0, x1] x [y0, y1] of park d */
function quad(d: CarPark, x0: number, x1: number, y0: number, y1: number): number[] {
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].flatMap(([x, y]) => { const p = toWorld(d, { x: x!, y: y! }); return [p.x, p.y]; });
}

/** the depth spans (from the frontage edge, tiles) of each group of rows as bayGrid lays them: [AISLE][row][row][AISLE] repeated, a last single
 *  row on its own; depth: a row's depth (BAY_D at 90 degrees) */
export function rowGroups(D: number, depth: number): [number, number][] {
  const out: [number, number][] = [];
  let pos = AISLE;
  for (let r = 0; pos + depth <= D; r++) {
    if (r % 2 === 0) out.push([pos, pos + depth]); else out[out.length - 1]![1] = pos + depth;
    pos += depth; if (r % 2 === 1) pos += AISLE;
  }
  return out;
}

/** the look of built car park pk (paved: its def has no ground; an unpaved lot has none: empty) with its footpath to door (null: none). The
 *  islands stand in the clear tile at both ends of each group of rows (bayGrid: one tile clear at the start, one or more at the end); a group's
 *  islands take, in turn along the frontage, a tree, then a lamp post with a shrub, so a row of car parks reads lit and planted */
export function parkLook(pk: CarPark, door: Pt | null, walls: readonly (readonly [number, number, number, number])[] = []): ParkLook {
  if (pk.ground) return { over: [], path: null, props: [] };
  const side = pk.side, vert = side % 2 === 0, L = vert ? pk.h : pk.w, D = vert ? pk.w : pk.h;
  // the local point at (along t, depth q from the frontage edge)
  const edge = side === 0 ? pk.w : side === 1 ? pk.h : 0, sgn = side === 0 || side === 1 ? -1 : 1;
  const loc = (t: number, q: number): Pt => (vert ? { x: edge + sgn * q, y: t } : { x: t, y: edge + sgn * q });
  const rect = (t0: number, t1: number, q0: number, q1: number): number[] => {
    const a = loc(t0, q0), b = loc(t1, q1);
    return quad(pk, Math.min(a.x, b.x), Math.max(a.x, b.x), Math.min(a.y, b.y), Math.max(a.y, b.y));
  };
  const at = (t: number, q: number): Pt => toWorld(pk, loc(t, q));
  const over: LookPatch[] = [], props: LookProp[] = [];
  // the kerb: along each edge, inside it, the frontage's open at each entrance (its along-coordinate on the edge)
  const mouths = pk.entrances.map(e => { const q = toLocal(pk, e); return vert ? q.y : q.x; }).sort((a, b) => a - b);
  let t = 0;
  for (const m of mouths) { if (m - MOUTH / 2 > t) over.push({ pts: rect(t, m - MOUTH / 2, 0, KERB_W), tex: 'slabs' }); t = Math.max(t, m + MOUTH / 2); }
  if (t < L) over.push({ pts: rect(t, L, 0, KERB_W), tex: 'slabs' });
  over.push({ pts: rect(0, L, D - KERB_W, D), tex: 'slabs' }, { pts: rect(0, KERB_W, KERB_W, D - KERB_W), tex: 'slabs' }, { pts: rect(L - KERB_W, L, KERB_W, D - KERB_W), tex: 'slabs' });
  // the islands: the clear ends of each group of rows (bayGrid: bays from 1 tile in, BAY_W apart at 90 degrees; its pitch for angled bays)
  const pitch = pk.bay && pk.bay !== 90 ? BAY_W / Math.sin(pk.bay * Math.PI / 180) : BAY_W, n = Math.max(0, Math.floor((L - 2) / pitch));
  const depth = pk.bay && pk.bay !== 90 ? BAY_D * Math.sin(pk.bay * Math.PI / 180) + BAY_W * Math.cos(pk.bay * Math.PI / 180) : BAY_D;
  const ends: [number, number][] = [[KERB_W, 1], [1 + n * pitch, L - KERB_W]];
  let k = 0;
  for (const [g0, g1] of rowGroups(D, depth)) for (const [e0, e1] of ends) {
    if (e1 - e0 < 0.6) continue;
    const t0 = e0 + ISLAND_IN, t1 = e1 - ISLAND_IN, q0 = g0 + ISLAND_IN, q1 = Math.min(g1, D - KERB_W) - ISLAND_IN;
    over.push({ pts: rect(t0, t1, q0, q1), tex: 'slabs' }, { pts: rect(t0 + KERB_W * 0.6, t1 - KERB_W * 0.6, q0 + KERB_W * 0.6, q1 - KERB_W * 0.6), tex: 'grass' });
    const c = (t0 + t1) / 2, h = hash(pk.id, k);
    if (k % 2 === 0) { const p = at(c, (q0 + q1) / 2); props.push({ id: ISLAND_TREES[h % ISLAND_TREES.length]!, x: p.x, y: p.y, scale: 1 }); }
    else {
      const l = at(c, q0 + 0.7), s = at(c, q1 - 0.9);
      props.push({ id: 'world:streetlamp', x: l.x, y: l.y, scale: 0.9 }, { id: ISLAND_SHRUBS[h % ISLAND_SHRUBS.length]!, x: s.x, y: s.y, scale: 0.5 });
    }
    k++;
  }
  return { over, path: door ? footpath(pk, door, walls) : null, props };
}

/** where segment a-b first enters the axis rect [x, y, w, h] (0..1 along it; Infinity: it never does) */
function entry(a: Pt, b: Pt, r: readonly [number, number, number, number]): number {
  let t0 = 0, t1 = 1;
  const dx = b.x - a.x, dy = b.y - a.y;
  for (const [p, q] of [[-dx, a.x - r[0]], [dx, r[0] + r[2] - a.x], [-dy, a.y - r[1]], [dy, r[1] + r[3] - a.y]] as const) {
    if (p === 0) { if (q < 0) return Infinity; continue; }
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t);
    if (t0 > t1) return Infinity;
  }
  return t0;
}
/** a strip PATH_W wide from a to b (world tiles) */
function strip(a: Pt, b: Pt, ext = 0): LookPatch {
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1, ux = (b.x - a.x) / len, uy = (b.y - a.y) / len, nx = -uy * PATH_W / 2, ny = ux * PATH_W / 2;
  const B = { x: b.x + ux * ext, y: b.y + uy * ext };
  return { pts: [a.x + nx, a.y + ny, B.x + nx, B.y + ny, B.x - nx, B.y - ny, a.x - nx, a.y - ny], tex: 'paving' };
}
/** the footpath from car park pk to door: paved strips PATH_W wide from the point of its edge nearest the door to the door: straight, or (a
 *  building in the way: walls, footprints x, y, w, h) round it in one corner along the world axes, or else straight to half a tile short of
 *  the building's face; none when the door is inside the park or more than PATH_MAX tiles off */
export function footpath(pk: CarPark, door: Pt, walls: readonly (readonly [number, number, number, number])[] = []): LookPatch[] | null {
  const q = toLocal(pk, door), cx = Math.min(pk.w, Math.max(0, q.x)), cy = Math.min(pk.h, Math.max(0, q.y)), a = toWorld(pk, { x: cx, y: cy });
  const len = Math.hypot(door.x - a.x, door.y - a.y);
  if (len < 1 || len > PATH_MAX) return null;
  const clear = (p: Pt, r: Pt) => walls.every(w => entry(p, r, w) > 1);
  if (clear(a, door)) return [strip(a, door)];
  // round the building: one corner, first along the car park's edge's own axis
  for (const c of [{ x: a.x, y: door.y }, { x: door.x, y: a.y }]) if (Math.hypot(c.x - a.x, c.y - a.y) > 0.5 && clear(a, c) && clear(c, door)) return [strip(a, c, PATH_W / 2), strip(c, door)];
  const hit = Math.min(...walls.map(w => entry(a, door, w))), k = Math.max(0, hit - 0.5 / len), b = { x: a.x + (door.x - a.x) * k, y: a.y + (door.y - a.y) * k };
  return Math.hypot(b.x - a.x, b.y - a.y) < 1 ? null : [strip(a, b)];
}
