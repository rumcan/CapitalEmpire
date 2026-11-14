// The range start (plan P22 section 2.1, T085): a new golf game begins with one county road crossing the map edge to edge and the player's
// driving range beside it, on an owned parcel big enough for a first nine. The town has a seed across the road, not streets. Pure TS, no DOM.
import { MAP, mulberry } from '../iso';
import { BLOCK } from '../lots/roads';
import { SITE_MARGIN } from '../event/config';
import { CLASS, SK, type Leg, type Pt, type SegKind } from '../network';
import { classAt, TC, type Edge, type Terrain } from '../terrain';
import { STRUCT_COST, STRUCT_MAX, groundClass, splitByTerrain, structureLengths } from '../structures';
import { COURSE_SIZES } from './place';
import { RANGE_FRONT, RANGE_PLOT } from './range';
import { GOLF_REP_START } from './start';
import type { GolfSave, Rect } from './mode';

/** T280 (#859): the distances below are the 4 km map's, scaled with the map (MAP / 2048: half on the 2 km map); the course's own sizes stay */
const MS = MAP / 2048;
/** the county road's straight run each side of the range's junction J, tiles: the town's 40-tile lattice meets it square. T329: a whole number of
 *  lattice blocks (600 on the 4 km map; 300 on the 2 km map is 7.5 blocks, which put the bend and every ground join after it off the lattice: 320) */
export const STRAIGHT = Math.ceil((600 * MS) / BLOCK) * BLOCK;
/** where a half of the county road may take its one 45° bend: from STRAIGHT out, every BEND_STEP tiles */
const BEND_STEP = 80 * MS;
/** the most bridge runs the county road may have, and the cost (in tiles of ground road) of an end on a mountain edge */
const MAX_BRIDGES = 2, MOUNTAIN_END = 4000;
/** the range plot's gap to the drive's centre line, tiles (the plot and its front: golf/range.ts RANGE_PLOT, RANGE_FRONT) */
export const DRIVE_GAP = 2;
/** the car park, [along the road, deep] tiles, and its gap to the drive's centre line. T237: it stands in the frontage strip, its edge on the
 *  parcel's road edge (the county road its frontage: the entrance on the road), its back FRONT_SPARE short of the range's plot */
const PARK: [number, number] = [20, 16], PARK_OFF = 3;
/** T237: the range's car park's size, [along the road, deep] tiles (the scene's lot in the frontage strip: rangebiz.ts) */
export const RANGE_LOT: readonly [number, number] = PARK;
/** T237 (#694, the owner: "move the entire driving range forward so we can make bigger and bigger parking lots along the road"): the range's plot
 *  (the tee line, the shop, the outfield) stands this far behind the parcel's road edge (36 m), leaving a frontage strip along the road where car
 *  parks grow lot by lot, their entrances on the road; a car park in it never reaches the tee box (the plot's own front, 36 m more, lies between) */
export const SETBACK = 18;
/** the drive runs this far past the road side of the front (so its far end is beside the car park) */
const DRIVE_IN = 16;
/** the town seed's distance across the road from J, tiles */
export const SEED_ACROSS = 40;
/** the town window across the road: [along the road, deep] tiles, and the share of it that must be buildable */
export const TOWN_WINDOW: [number, number] = [600 * MS, 400 * MS];
const TOWN_BUILD = 0.75;
/** the parcel's playable share (open land or woodland, as the old course's COURSE_BUILD) */
const PARCEL_BUILD = 0.98;
/** the camera's zoom on a new range start: the street tier (plan 2.1.4) */
export const RANGE_CAM_ZOOM = 0.17;
/** the second J candidates: lattice points within this many tiles of the map centre, nearest first */
const SCAN_REACH = 640 * MS;

/** the road's half width plus its walk, tiles: its verge */
const VERGE = CLASS.road!.h + CLASS.road!.walk;
/** the parcel's near edge off the road's centre line, tiles (plan 2.1.2's V: the verge plus 2, whole tiles) */
export const NEAR = Math.ceil(VERGE + 2);

/** a county road: its legs (split at J and by the terrain), their kinds, the two border points it leaves the map by (exits[0] first along the
 *  legs) and their edges */
export interface CountyRoad { legs: Leg[]; kinds: SegKind[]; exits: [Pt, Pt]; edges: [Edge, Edge] }
/** a range start's site, tiles: J (the range's junction on the road, on the 40-tile lattice), the road's axis ('x': it runs east-west), the side
 *  of the road the course lies on (+1: toward +y or +x), dir (that side as a compass side: 0 north, 1 east, 2 south, 3 west; the range's golfers hit
 *  that way), the owned parcel, the range plot, its front (the range business), the car park, the drive (one leg from J into the front) and the
 *  town's seed */
export interface RangeSite {
  J: Pt; axis: 'x' | 'y'; side: 1 | -1; dir: 0 | 1 | 2 | 3;
  parcel: Rect; rangePlot: Rect; rangeFront: Rect; carpark: Rect; drive: Leg[]; centre: Pt;
  /** T237: the range's set-back from the parcel's road edge (tiles: SETBACK) and the frontage strip it leaves along the road (the parcel's width
   *  by the set-back: the car parks' land) */
  setback: number; strip: Rect;
}
/** the golf state of a range start: a GolfSave with its start and exits */
export type RangeSave = GolfSave & { start: 'range'; exits: Pt[] };
/** a range start's plan: the county road, the site, the golf state and the camera's point (the range front's centre) */
export interface RangeStart { road: CountyRoad; site: RangeSite; save: RangeSave; cam: Pt }

/** the frame of a site: t across the road toward the course, s along it, turned so (s, t) is a rotation of (x, y), never a mirror (the range's
 *  layout then turns with its facing: golf/range.ts) */
function frameOf(axis: 'x' | 'y', side: 1 | -1): { s: Pt; t: Pt; dir: 0 | 1 | 2 | 3 } {
  if (axis === 'x') return side > 0 ? { s: { x: 1, y: 0 }, t: { x: 0, y: 1 }, dir: 2 } : { s: { x: -1, y: 0 }, t: { x: 0, y: -1 }, dir: 0 };
  return side > 0 ? { s: { x: 0, y: -1 }, t: { x: 1, y: 0 }, dir: 1 } : { s: { x: 0, y: 1 }, t: { x: -1, y: 0 }, dir: 3 };
}
/** the world point (s, t) of a frame around J */
const at = (J: Pt, f: { s: Pt; t: Pt }, s: number, t: number): Pt => ({ x: J.x + s * f.s.x + t * f.t.x, y: J.y + s * f.s.y + t * f.t.y });
/** the world rect of s in [s0, s1] by t in [t0, t1] in a frame around J */
function rectOf(J: Pt, f: { s: Pt; t: Pt }, s0: number, s1: number, t0: number, t1: number): Rect {
  const a = at(J, f, s0, t0), b = at(J, f, s1, t1);
  return [Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y)];
}

/** the edge a border point lies on (null: not on the border) */
function edgeAt(p: Pt): Edge | null { return p.y <= 0 ? 'N' : p.y >= MAP - 1 ? 'S' : p.x <= 0 ? 'W' : p.x >= MAP - 1 ? 'E' : null; }
/** the county road's ground legs are cut where they cross a multiple of CUT tiles (along their main axis; on the 40-tile lattice): pieces of
 *  at most CUT tiles straight (CUT x sqrt 2 on a 45° leg), so the farms' seg-midpoint rule (ext/farms TOWN_CLEAR, EVENT_CLEAR) keeps them away
 *  from the town seed and the course land, and the planner's corner arms at the cuts stay on the town's lattice. No cut within CUT_END of an end */
const CUT = 200, CUT_END = 20;
function cutLegs(legs: Leg[], kinds: SegKind[]): { legs: Leg[]; kinds: SegKind[] } {
  const L: Leg[] = [], K: SegKind[] = [];
  legs.forEach((l, i) => {
    const k = kinds[i]!, dx = l.b.x - l.a.x, dy = l.b.y - l.a.y, ax = Math.abs(dx) >= Math.abs(dy), a0 = ax ? l.a.x : l.a.y, d = ax ? dx : dy;
    let from = l.a;
    if (k === SK.GROUND && Math.abs(d) > CUT) {
      const sg = Math.sign(d), lo = Math.min(a0, a0 + d) + CUT_END, hi = Math.max(a0, a0 + d) - CUT_END, cuts: number[] = [];
      for (let c = Math.ceil(lo / CUT) * CUT; c <= hi; c += CUT) cuts.push(c);
      if (sg < 0) cuts.reverse();
      for (const c of cuts) { const p = ax ? { x: c, y: l.a.y + dy * (c - a0) / dx } : { x: l.a.x + dx * (c - a0) / dy, y: c }; L.push({ a: from, b: p }); K.push(k); from = p; }
    }
    L.push({ a: from, b: l.b }); K.push(k);
  });
  return { legs: L, kinds: K };
}
/** the runs of consecutive bridge pieces */
export function bridgeRuns(kinds: SegKind[]): number { let n = 0; for (let i = 0; i < kinds.length; i++) if (kinds[i] === SK.BRIDGE && kinds[i - 1] !== SK.BRIDGE) n++; return n; }

interface Half { legs: Leg[]; kinds: SegKind[]; end: Pt; edge: Edge; cost: number; bridges: number }
/** one half of the county road from J along u (a unit axis step), as the polyline pts: its pieces (woodland is ground since the flat map, so no
 *  tunnel), its cost (STRUCT_COST by kind, plus MOUNTAIN_END on a mountain edge) and its bridge runs; null with a bridge over STRUCT_MAX */
function halfOf(t: Terrain, pts: Pt[]): Half | null {
  const legs0: Leg[] = []; for (let i = 1; i < pts.length; i++) legs0.push({ a: pts[i - 1]!, b: pts[i]! });
  const { legs, kinds } = splitByTerrain(legs0, VERGE, (x, y) => groundClass(classAt(t, x, y)));
  if (kinds.includes(SK.TUNNEL)) return null;
  // a bridge run (its pieces across a bend count together) longer than STRUCT_MAX
  for (let i = 0, run = 0; i < legs.length; i++) {
    run = kinds[i] === SK.BRIDGE ? run + Math.hypot(legs[i]!.b.x - legs[i]!.a.x, legs[i]!.b.y - legs[i]!.a.y) : 0;
    if (run > STRUCT_MAX[SK.BRIDGE]!) return null;
  }
  const end = pts[pts.length - 1]!, edge = edgeAt(end)!, lens = structureLengths(legs, kinds);
  const cost = STRUCT_COST[SK.GROUND]! * lens[SK.GROUND] + STRUCT_COST[SK.BRIDGE]! * lens[SK.BRIDGE] + (t.mountainEdges.includes(edge) ? MOUNTAIN_END : 0);
  return { legs, kinds, end, edge, cost, bridges: bridgeRuns(kinds) };
}
/** the candidate halves from J along u: straight to the border, or straight for at least STRAIGHT tiles then one 45° bend (either way) to it */
function halves(t: Terrain, J: Pt, u: Pt): Half[] {
  const B = MAP - 1, out: Half[] = [];
  /** the steps from p along d to the border */
  const reach = (p: Pt, d: Pt) => Math.min(d.x > 0 ? B - p.x : d.x < 0 ? p.x : Infinity, d.y > 0 ? B - p.y : d.y < 0 ? p.y : Infinity);
  const n = reach(J, u);
  if (n < STRAIGHT) return out;
  const straight = halfOf(t, [J, { x: J.x + u.x * n, y: J.y + u.y * n }]); if (straight) out.push(straight);
  for (let b = STRAIGHT; b <= n - BEND_STEP; b += BEND_STEP) {
    const P = { x: J.x + u.x * b, y: J.y + u.y * b };
    for (const k of [1, -1]) {
      const d = { x: u.x || k, y: u.y || k }, m = reach(P, d);
      if (m < BEND_STEP / 2) continue;
      const h = halfOf(t, [J, P, { x: P.x + d.x * m, y: P.y + d.y * m }]); if (h) out.push(h);
    }
  }
  return out;
}

/** the county road through J along axis (plan 2.1.1): straight through J for at least STRAIGHT tiles each way, then straight on or one 45° bend
 *  per half to the border. The cheapest pair of halves by structure cost (as highwayRoute) with at most MAX_BRIDGES bridge runs, no tunnel and no
 *  bridge over STRUCT_MAX wins; an end on a mountain edge costs MOUNTAIN_END, so open edges win wherever a route reaches them (decision: on maps
 *  with three mountain edges no edge-to-edge road has two open ends, and mountains are woodland on the flat map, so the road may run out through
 *  the woods). Its legs run from exits[0] to exits[1] and meet at J, the ground ones cut on the lattice (cutLegs). Null when no pair fits.
 *  Deterministic. */
export function regionalRoute(t: Terrain, J: Pt, axis: 'x' | 'y'): CountyRoad | null {
  const u = axis === 'x' ? { x: 1, y: 0 } : { x: 0, y: 1 };
  const A = halves(t, J, { x: -u.x, y: -u.y }), Bh = halves(t, J, u);
  let best: [Half, Half] | null = null, bc = Infinity;
  for (const a of A) for (const b of Bh) {
    if (a.bridges + b.bridges > MAX_BRIDGES) continue;
    const c = a.cost + b.cost;
    if (c < bc - 1e-6) { bc = c; best = [a, b]; }
  }
  if (!best) return null;
  const [a, b] = best;
  // the first half reversed (from its exit in to J), then the second (from J out)
  const { legs, kinds } = cutLegs([...a.legs.map(l => ({ a: l.b, b: l.a })).reverse(), ...b.legs], [...[...a.kinds].reverse(), ...b.kinds]);
  return { legs, kinds, exits: [a.end, b.end], edges: [a.edge, b.edge] };
}

/** the terrain's integral images: S counts the buildable tiles (GROUND, PATCH), H the playable ones (those and woodland, HILL) */
type Integrals = ReturnType<typeof integrals>;
function integrals(cls: Uint8Array) {
  const N = MAP + 1, S = new Int32Array(N * N), H = new Int32Array(N * N);
  for (let y = 0; y < MAP; y++) for (let x = 0; x < MAP; x++) {
    const c = cls[y * MAP + x], b = c === TC.GROUND || c === TC.PATCH ? 1 : 0, h = b || c === TC.HILL ? 1 : 0, i = (y + 1) * N + x + 1;
    S[i] = S[y * N + x + 1]! + S[(y + 1) * N + x]! - S[y * N + x]! + b;
    H[i] = H[y * N + x + 1]! + H[(y + 1) * N + x]! - H[y * N + x]! + h;
  }
  /** the tiles of r (inside the map) counted by I */
  const count = (r: Rect, I: Int32Array) => I[(r[1] + r[3]) * N + r[0] + r[2]]! - I[r[1] * N + r[0] + r[2]]! - I[(r[1] + r[3]) * N + r[0]]! + I[r[1] * N + r[0]]!;
  return { S, H, count };
}
/** whether r lies inside the map, m tiles in from each edge */
const inside = (r: Rect, m: number) => r[0] >= m && r[1] >= m && r[0] + r[2] <= MAP - m && r[1] + r[3] <= MAP - m;

/** the J candidates: the terrain's town sites nearest the map centre first, then the lattice points within SCAN_REACH of the centre, nearest
 *  first; each on the 40-tile lattice, once */
function candidates(t: Terrain): Pt[] {
  const C = MAP / 2, snap = (v: number) => Math.round(v / BLOCK) * BLOCK, d = (p: Pt) => Math.hypot(p.x - C, p.y - C);
  const sites = t.towns.map(s => ({ x: snap(s.x + s.size / 2), y: snap(s.y + s.size / 2) })).sort((a, b) => d(a) - d(b) || a.y - b.y || a.x - b.x);
  const scan: Pt[] = [];
  for (let y = snap(C - SCAN_REACH); y <= C + SCAN_REACH; y += BLOCK) for (let x = snap(C - SCAN_REACH); x <= C + SCAN_REACH; x += BLOCK) if (d({ x, y }) <= SCAN_REACH) scan.push({ x, y });
  scan.sort((a, b) => d(a) - d(b) || a.y - b.y || a.x - b.x);
  const seen = new Set<string>(), out: Pt[] = [];
  for (const p of [...sites, ...scan]) { const k = p.x + ',' + p.y; if (!seen.has(k)) { seen.add(k); out.push(p); } }
  return out;
}

/** the site at J for axis and side with a parcel of [along the road, deep] tiles, by plan 2.1.2 (shifted DRIVE_GAP off the drive: the drive's
 *  corridor stays off the range plot and the range's door lands on the drive; T237: the plot SETBACK behind the parcel's road edge, the car park
 *  in the frontage strip that leaves, beside the drive, on the road), or null when a fit rule fails: the parcel PARCEL_BUILD playable, the
 *  range front, car park and drive corridor all buildable, the town window across the road TOWN_BUILD buildable, all of it SITE_MARGIN from the edges.
 *  T391 (#1055): with dry, the whole range plot too must be dry (no creek, bank or open water in the outfield behind the front: the placement's own test, golf/placing.ts
 *  landWhy, refuses a plot with one wet tile, so a creek through it refused the range at its start spot on a third of the maps) */
function siteAt(I: Integrals, J: Pt, axis: 'x' | 'y', side: 1 | -1, size: [number, number], dry: boolean): RangeSite | null {
  const g = geomAt(J, axis, side, size);
  return geomWhy(I, g, dry) ? null : g.site;
}

/** a site's rects at J for axis and side and a parcel size (plan 2.1.2), with no test against the terrain, and the two rects the fit rules also read: the
 *  drive's corridor and the town window across the road */
interface Geom { site: RangeSite; corridor: Rect; town: Rect }
function geomAt(J: Pt, axis: 'x' | 'y', side: 1 | -1, size: [number, number]): Geom {
  const f = frameOf(axis, side), [along, deep] = size, s0 = -DRIVE_GAP - RANGE_PLOT[0];
  const parcel = rectOf(J, f, s0, s0 + along, NEAR, NEAR + deep);
  const B = NEAR + SETBACK, rangePlot = rectOf(J, f, s0, -DRIVE_GAP, B, B + RANGE_PLOT[1]);
  const rangeFront = rectOf(J, f, s0, -DRIVE_GAP, B, B + RANGE_FRONT);
  const carpark = rectOf(J, f, -PARK_OFF - PARK[0], -PARK_OFF, NEAR, NEAR + PARK[1]), strip = rectOf(J, f, s0, s0 + along, NEAR, B);
  const corridor = rectOf(J, f, -2, 2, Math.floor(VERGE), B + DRIVE_IN);
  const town = rectOf(J, f, -TOWN_WINDOW[0] / 2, TOWN_WINDOW[0] / 2, -NEAR - TOWN_WINDOW[1], -NEAR);
  return { site: { J, axis, side, dir: f.dir, parcel, rangePlot, rangeFront, carpark, drive: [{ a: J, b: at(J, f, 0, B + DRIVE_IN) }], centre: at(J, f, 0, -SEED_ACROSS), setback: SETBACK, strip }, corridor, town };
}
/** J9: why a start cannot lie on the land the fit rules read, in the words the placement's ghost shows by the pointer */
export const START_WHY = {
  edge: "Too near the map's edge for the road and the town",
  ground: 'Needs clear, flat ground for the shop and car park',
  parcel: 'Not enough open land beside it for a course',
  town: 'No room for the town across the road',
  wet: 'Water or a creek on the range land',
  road: 'The county road cannot get past the water from here',
} as const;
/** the first fit rule a geometry fails ('' when it fits: the rules siteAt has always applied, in its order: inside the map's margin, the range front, car
 *  park and drive corridor buildable, the parcel playable, the town window buildable, with dry the range plot dry too) */
function geomWhy(I: Integrals, g: Geom, dry: boolean): string {
  const { parcel, rangePlot, rangeFront, carpark } = g.site, { corridor, town } = g, area = (r: Rect) => r[2] * r[3];
  for (const r of [parcel, town]) if (!inside(r, SITE_MARGIN)) return START_WHY.edge;
  if (I.count(rangeFront, I.S) !== area(rangeFront) || I.count(carpark, I.S) !== area(carpark) || I.count(corridor, I.S) !== area(corridor)) return START_WHY.ground;
  if (I.count(parcel, I.H) < PARCEL_BUILD * area(parcel)) return START_WHY.parcel;
  if (I.count(town, I.S) < TOWN_BUILD * area(town)) return START_WHY.town;
  if (dry && I.count(rangePlot, I.H) !== area(rangePlot)) return START_WHY.wet; // (I.H: grass, patch and woodland: every tile the placement accepts; water, creek and bank are the others)
  return '';
}

/** the axes (the one with more open edges first: fewer road ends in the mountains) and the sides (in a seeded order) a start is tried in */
function preference(t: Terrain, seed: number): [('x' | 'y')[], (1 | -1)[]] {
  const open = (e: Edge) => (t.mountainEdges.includes(e) ? 0 : 1);
  const axes: ('x' | 'y')[] = open('W') + open('E') >= open('N') + open('S') ? ['x', 'y'] : ['y', 'x'];
  const sides: (1 | -1)[] = mulberry(seed)() < 0.5 ? [1, -1] : [-1, 1];
  return [axes, sides];
}

/** the site and its road: first a site whose range plot is dry (T391: no creek through the outfield, so the range can be placed at its start spot; only a map
 *  with no such site takes the old rule, which kept every start it had), then sizes (COURSE_SIZES) outermost, then the axes (the one with more open edges
 *  first: fewer road ends in the mountains), then the J candidates, then the sides (in a seeded order); the first site that fits and whose J has a county
 *  road wins */
function findStart(t: Terrain, seed: number, I: Integrals = integrals(t.cls)): { site: RangeSite; road: CountyRoad } | null {
  const [axes, sides] = preference(t, seed);
  const roads = new Map<string, CountyRoad | null>(), Js = candidates(t);
  for (const dry of [true, false]) for (const size of COURSE_SIZES) for (const axis of axes) for (const J of Js) {
    const a = axis === 'x' ? J.x : J.y;
    if (a < STRAIGHT || a > MAP - 1 - STRAIGHT) continue;
    for (const side of sides) {
      const site = siteAt(I, J, axis, side, size, dry); if (!site) continue;
      const k = `${J.x},${J.y},${axis}`;
      if (!roads.has(k)) roads.set(k, regionalRoute(t, J, axis));
      const road = roads.get(k); if (road) return { site, road };
    }
  }
  return null;
}

/** the range start's site on a terrain (plan 2.1.2), or null when none fits. Deterministic per terrain and seed */
export function placeRangeSite(t: Terrain, seed: number): RangeSite | null { return findStart(t, seed)?.site ?? null; }

/** the door point of the range front: the middle of its side on the drive, tiles */
function frontDoor(s: RangeSite): Pt {
  const f = frameOf(s.axis, s.side);
  return at(s.J, f, -DRIVE_GAP, NEAR + s.setback + RANGE_FRONT / 2);
}

/** a new range start on a terrain for a seed (plan 2.1): the county road, the site, the golf state (start 'range', tier 1, the starting
 *  reputation, the exits; the town is the seed, the course and the parcel the owned parcel, the clubhouse the range front's door; no holes yet)
 *  and the camera's point. Null when no site fits. Deterministic */
export function planRangeStart(t: Terrain, seed: number, probe?: StartProbe): RangeStart | null {
  const r = findStart(t, seed, probe?.I); return r ? startOf(r.site, r.road) : null;
}
/** the range start of a site and its county road: the golf state (start 'range', tier 1, the starting reputation, the exits; the town is the seed, the course
 *  and the parcel the owned parcel, the clubhouse the range front's door) and the camera's point (the range front's centre) */
function startOf(site: RangeSite, road: CountyRoad): RangeStart {
  const [fx, fy, fw, fh] = site.rangeFront;
  const save: RangeSave = {
    v: 1, tier: 1, rep: GOLF_REP_START, start: 'range', exits: [...road.exits], town: site.centre, course: site.parcel, parcel: site.parcel, dir: site.dir,
    tees: [], pins: [], aims: [], clubhouse: frontDoor(site),
  };
  return { road, site, save, cam: { x: fx + fw / 2, y: fy + fh / 2 } };
}

// ---------- J9 (#1268, the owner 2026-11-14: "the start should be placing the driving range ... so the guy can start where he wants"): the start around a chosen spot
/** a facing's frame: dir (0 north, 1 east, 2 south, 3 west: the way the golfers hit, the side of the road the course lies on) as the road's axis and side */
const DIR_FRAME: readonly { axis: 'x' | 'y'; side: 1 | -1 }[] = [{ axis: 'x', side: -1 }, { axis: 'y', side: 1 }, { axis: 'x', side: 1 }, { axis: 'y', side: -1 }];
/** what a start spot is checked against, made once for a terrain: its integral images (a spot's fit is a few lookups), the county road of each J and axis
 *  tried (about 5 to 9 ms each, kept), the spots seen (a pointer that stays in one lattice cell costs nothing) and the facings in the order the automatic
 *  start prefers them */
export interface StartProbe { t: Terrain; seed: number; I: Integrals; order: (0 | 1 | 2 | 3)[]; roads: Map<string, CountyRoad | null>; spots: Map<string, StartSpot> }
/** the probe of a terrain and its seed (about 40 ms: the same integral images the automatic start reads; planRangeStart takes the probe to share them) */
export function startProbe(t: Terrain, seed: number): StartProbe {
  const [axes, sides] = preference(t, seed), order: (0 | 1 | 2 | 3)[] = [];
  for (const axis of axes) for (const side of sides) order.push(DIR_FRAME.findIndex(f => f.axis === axis && f.side === side) as 0 | 1 | 2 | 3);
  return { t, seed, I: integrals(t.cls), order, roads: new Map(), spots: new Map() };
}
/** a start spot: the site a start at this place and facing would have (its rects, whether it fits or not: a refused spot's ghost is drawn from them), why
 *  it does not fit ('' when it does: START_WHY) and the county road it comes with (null when it does not fit) */
export interface StartSpot { site: RangeSite; why: string; road: CountyRoad | null; dir: 0 | 1 | 2 | 3 }
/** the lattice (the 40-tile town grid) J a facing's start puts the range front's middle nearest to the point (x, y), tiles */
function jFor(dir: 0 | 1 | 2 | 3, x: number, y: number): Pt {
  const { axis, side } = DIR_FRAME[dir]!, f = frameOf(axis, side), sc = -(2 * DRIVE_GAP + RANGE_PLOT[0]) / 2, tc = NEAR + SETBACK + RANGE_FRONT / 2, snap = (v: number) => Math.round(v / BLOCK) * BLOCK;
  return { x: snap(x - sc * f.s.x - tc * f.t.x), y: snap(y - sc * f.s.y - tc * f.t.y) };
}
/** the start spot for a facing nearest the point (x, y): J on the lattice, then the rules siteAt has always applied (a first nine's room: the largest
 *  COURSE_SIZES parcel that fits, with the range plot dry), the straight run of the county road each side of J, and a county road through J (regionalRoute) */
function spotFor(p: StartProbe, x: number, y: number, dir: 0 | 1 | 2 | 3): StartSpot {
  const J = jFor(dir, x, y), key = `${J.x},${J.y},${dir}`, seen = p.spots.get(key); if (seen) return seen;
  const { axis, side } = DIR_FRAME[dir]!, sizes = COURSE_SIZES, a = axis === 'x' ? J.x : J.y;
  // (the smallest parcel is drawn when nothing fits, and gives the reason: it asks the least)
  let g = geomAt(J, axis, side, sizes[sizes.length - 1]!), why = a < STRAIGHT || a > MAP - 1 - STRAIGHT ? START_WHY.edge : geomWhy(p.I, g, true), road: CountyRoad | null = null;
  if (!why) {
    for (const size of sizes) { const q = geomAt(J, axis, side, size); if (!geomWhy(p.I, q, true)) { g = q; break; } }
    const rk = `${J.x},${J.y},${axis}`;
    if (!p.roads.has(rk)) p.roads.set(rk, regionalRoute(p.t, J, axis));
    road = p.roads.get(rk) ?? null; if (!road) why = START_WHY.road;
  }
  const spot: StartSpot = { site: g.site, why, road, dir };
  p.spots.set(key, spot); return spot;
}
/** the start spot for the point (x, y), tiles (the range front's middle there, moved to the town lattice): with dir the one facing, else the first facing that
 *  fits (prefer first, then the automatic start's order); a spot that fits nowhere is the first facing's, with its reason */
export function startSpotAt(p: StartProbe, x: number, y: number, dir: 0 | 1 | 2 | 3 | null = null, prefer: 0 | 1 | 2 | 3 | null = null): StartSpot {
  const dirs = dir !== null ? [dir] : prefer !== null ? [prefer, ...p.order.filter(d => d !== prefer)] : p.order;
  let first: StartSpot | null = null;
  for (const d of dirs) { const s = spotFor(p, x, y, d); if (!s.why) return s; first ??= s; }
  return first!;
}
/** the range start a start spot that fits gives (null when it does not fit): what planRangeStart gives for its site */
export function startOfSpot(s: StartSpot): RangeStart | null { return s.why || !s.road ? null : startOf(s.site, s.road); }
/** the range start around the point (x, y) (see startSpotAt), or why it cannot be there. The automatic start (no point) is planRangeStart's */
export function planRangeStartAt(p: StartProbe, x: number, y: number, dir: 0 | 1 | 2 | 3 | null = null): RangeStart | { why: string } {
  const s = startSpotAt(p, x, y, dir); return startOfSpot(s) ?? { why: s.why };
}
