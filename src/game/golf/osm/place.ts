// Placing a real course into a game under way (T356, #998): what a pose of the turned course costs and takes, and whether it may go there. The owner
// (2026-11-08): "place the golf course he imported into his map, seeing a outline and then having to rotate the course to fit. it should auto buy any
// property ... the placing highlight can turn red if you cant place it coz you dont have enough money. It should auto build over other roads and
// buildings by buying the land and destroying everything under it. Add a notification pop up and tell the user that, that will happen."
//
// planPlace(world, spec, pose) works out, for the course turned and put with its land's middle at a tile:
//   - the land: the turned land covered by a few rects (rotate.ts coverStrips; that is the land bought), the part of it not yours already priced
//     by the land classes of the 40-tile blocks it lies in (golf/parcels.ts: the Land for sale rates), the town's growth on top;
//   - what goes: the town's built lots under it (bought out at their compensation), the public roads under it (their value, by the length cut), the
//     lots left with no road in front of them or no way to the county road (cleared too, and counted), the club's own cart paths and drives (free);
//   - what stops it: off the map, the river, the club's own buildings, the town's centre, a cut that would leave the town or the clubhouse with no way
//     to the county road, a tournament under way;
//   - what it costs: land + demolition + the course's build price (given: the surfaces at the paint prices), against the treasury.
// Pure TypeScript, no DOM: the engine hands it a PlaceWorld made of its live collections (no copies), the tests hand it small made-up ones.
import { LAND_BLOCK, LAND_PRICE_SQM, POP_GROWTH_RATE, rectsOverlap, type ParcelLandClass } from '../parcels';
import type { Rect } from '../mode';
import { TILE_M } from '../types';
import { boundsOf, coverStrips, outlineAt, originFor, rectsArea } from './rotate';
import type { OsmCourseSpec } from './types';

/** the land the course keeps from the map's edges, tiles */
export const PLACE_EDGE = 4;
/** the river rule. A generated valley has its river (and creeks) through every 700-tile window of the 2 km map (docs/OSM-COURSES.md, T340), so a course that
 *  may not lie over any river tile could never be placed in the game. 'features': a tee, a green or a pin on the river, or a hole's line running mostly
 *  along it, refuses the pose ("The river runs over hole 7's green"); the river elsewhere stays where it is and the course is laid round it (the cells
 *  on river tiles are left unpainted: a stream across a fairway is a hazard, as on a real course). 'cover': any river tile under the land refuses */
export const RIVER_RULE: 'features' | 'cover' = 'features';
/** a hole's line with more than this share of its samples on the river is refused (the river runs along the hole, not across it) */
const RIVER_ALONG = 0.25;
/** the town's centre is kept clear this far round it, tiles (the course's land may not come nearer) */
export const TOWN_KEEP = 26;
/** a road end counts as an entry's (or a place's) own node within this, tiles */
const NODE_NEAR = 14;
/** a lot is served by a road whose centre line lies within the road's verge (its half width and walk) and this many tiles of the lot's front */
const FRONT_SLACK = 3;
/** a lot this near the cover (tiles) may have lost the road in front of it */
const NEAR_COVER = 40;

/** a town lot as the planner reads it (the city worker's LotView fits): its frame (corner o, along u, away n, w by d) and its state (use: 1 homes,
 *  2 shops, 3 works, 4 and up others; level 0 empty, 1 building, 2 built, 3 upgraded; decline 0..3) */
export interface PlaceLot { key: string; o: readonly number[]; u: readonly number[]; n: readonly number[]; w: number; d: number; use: number; level: number; decline: number }
/** a road end */
export interface PlaceNode { x: number; y: number }
/** a road piece: its two ends and its class (id, half width h and verge walk, tiles) and kind (0 ground, 1 bridge, 2 tunnel) */
export interface PlaceSeg { a: PlaceNode; b: PlaceNode; cls: { id: string; h: number; walk: number }; kind: number }

/** what the planner reads of the game */
export interface PlaceWorld {
  /** the map's side, tiles */
  map: number;
  /** the land the player owns already (rects; they may overlap) */
  owned: readonly Rect[];
  /** whether the tile at (x, y) is the river (or a lake): the course cannot lie on it */
  river(x: number, y: number): boolean;
  /** the town's lots, and the farms (their parcels' middles: farm land is the cheap class) */
  lots: Iterable<PlaceLot>;
  farms: Iterable<{ x: number; y: number }>;
  /** every road piece, and the pieces within r tiles of a point */
  segs: Iterable<PlaceSeg>;
  segsNear(x: number, y: number, r: number): Iterable<PlaceSeg>;
  /** whether a road piece is the club's own (a cart path or a drive: free to clear) and its price a tile (what building it cost: class cost times the kind's factor) */
  isCourseRoad(s: PlaceSeg): boolean;
  valuePerTile(s: PlaceSeg): number;
  /** a lot's compensation (budget.ts compensation) */
  compensation(l: PlaceLot): number;
  /** the town's people (the land price rises gently with them) and its centre (null: none) */
  pop: number;
  townCentre: { x: number; y: number } | null;
  /** where the county road meets the map's edge: the road ends that must stay joined to the town and the clubhouse */
  entries: readonly { x: number; y: number }[];
  /** the places that must keep a way to the entries (the town's centre, the clubhouse's door): [name, x, y] */
  targets: readonly { name: string; x: number; y: number }[];
  /** the club's own things the course cannot cover: the clubhouse, the car parks, the range, the practice area, a tournament's structures */
  keep: readonly { name: string; rect: Rect }[];
  /** how far back from the cover's edge a cut leaves the end of a road piece, tiles (its turning circle and verge, so the dead end stays off the course's land);
   *  absent: 0 */
  endMargin?(s: PlaceSeg): number;
  /** a key that changes whenever the lots, the roads or the land do, and what it belongs to (the game): the planner keeps what it works out once for a state of the
   *  world (the lots' boxes, the land classes, the road graph) and reads it again for the next pose; absent: worked out every time */
  revision?: string; owner?: object;
  /** the treasury, and whether a tournament day is under way (the course cannot change under it) */
  money: number;
  roundLive: boolean;
  /** how many of the player's placed items (not trees) stand in a rect (the pop-up counts them; they go for nothing) */
  props?(r: Rect): number;
}

/** the pose of the course on the map: where its land's middle goes (whole tiles) and how far the course is turned (degrees clockwise) */
export interface PlacePose { x: number; y: number; deg: number }

/** the reasons a pose is refused (the first found is the one told: a tournament under way first, as it stops every pose, then the map, the river, the club's
 *  own buildings, the town's centre, the way to the county road) */
export type PlaceWhyKind = '' | 'map' | 'river' | 'club' | 'town' | 'link' | 'round';

/** a pose's plan: the land and what it takes, the price and whether it may go there */
export interface PlacePlan {
  /** the turned spec's frame on the map (its north-west corner), the land's outline there (4 corners x, y) and the rects that cover it */
  ox: number; oy: number; outline: number[]; cover: Rect[];
  /** the box round the cover (null: nothing) */
  bounds: Rect | null;
  /** inside the map, with PLACE_EDGE tiles to spare */
  fits: boolean;
  /** the first reason it cannot go there ('' when it can) and its kind */
  why: string; whyKind: PlaceWhyKind;
  /** the land bought: tiles (the cover less what is the player's already), hectares, the price, the tiles of it that were his */
  land: { tiles: number; ha: number; price: number; mine: number };
  /** the built lots under the cover (keys, counts by use) and what bringing them down costs */
  lots: { keys: string[]; houses: number; shops: number; works: number; others: number; comp: number };
  /** the lots left with no road or no way to the county road: cleared too (keys, counts, compensation) */
  orphans: { keys: string[]; houses: number; shops: number; works: number; others: number; comp: number };
  /** the public road under the cover: pieces, metres, its value (paid as compensation), and the club's own cart paths and drives (pieces, metres: free) */
  roads: { segs: number; m: number; value: number; ownSegs: number; ownM: number };
  /** the player's placed items under the cover (they go for nothing) */
  props: number;
  /** what the demolition costs (lots, orphans, roads), the course's build price, the whole price and the treasury, and what is short of it */
  demolish: number; build: number; total: number; money: number; short: number;
  /** may be laid: no reason against it and the money is there */
  affordable: boolean; ok: boolean;
}

/** the money of an amount: "$3,214,800" */
export const money = (n: number): string => `${n < 0 ? '-' : ''}$${Math.round(Math.abs(n)).toLocaleString('en-US')}`;

/** the tiles-squared area of the union of some rects (they may overlap) */
export function unionArea(rects: readonly Rect[]): number {
  const R = rects.filter(r => r[2] > 0 && r[3] > 0);
  if (!R.length) return 0;
  if (R.length === 1) return R[0]![2] * R[0]![3];
  const xs = [...new Set(R.flatMap(r => [r[0], r[0] + r[2]]))].sort((a, b) => a - b);
  let area = 0;
  for (let i = 0; i + 1 < xs.length; i++) {
    const x0 = xs[i]!, x1 = xs[i + 1]!, ys: [number, number][] = [];
    for (const r of R) if (r[0] <= x0 && r[0] + r[2] >= x1) ys.push([r[1], r[1] + r[3]]);
    ys.sort((a, b) => a[0] - b[0]);
    let cur = -Infinity, len = 0;
    for (const [a, b] of ys) { if (b <= cur) continue; len += b - Math.max(a, cur); cur = b; }
    area += len * (x1 - x0);
  }
  return area;
}

/** r clipped to the box (null: nothing is left) */
function clip(r: Rect, x0: number, y0: number, x1: number, y1: number): Rect | null {
  const a = Math.max(r[0], x0), b = Math.max(r[1], y0), c = Math.min(r[0] + r[2], x1), d = Math.min(r[1] + r[3], y1);
  return c > a && d > b ? [a, b, c - a, d - b] : null;
}

/** the share of segment A-B (parameters 0..1) inside the rect, as [in, out] (Liang-Barsky), or null when it misses it */
function segInRect(r: Rect, ax: number, ay: number, bx: number, by: number): [number, number] | null {
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dy = by - ay, p = [-dx, dx, -dy, dy], q = [ax - r[0], r[0] + r[2] - ax, ay - r[1], r[1] + r[3] - ay];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) { if (q[i]! < 0) return null; continue; }
    const t = q[i]! / p[i]!;
    if (p[i]! < 0) { if (t > t1) return null; if (t > t0) t0 = t; } else { if (t < t0) return null; if (t < t1) t1 = t; }
  }
  return t1 > t0 ? [t0, t1] : null;
}

/** where a road piece lies inside the cover: the parameters [in, out] from its first end (the cover's rects merged: a piece that grazes a corner of
 *  the staircase counts whole between), or null when it keeps out of it (a pass of under 0.04 of a tile is no pass) */
export function spanIn(cover: readonly Rect[], s: { a: PlaceNode; b: PlaceNode }): [number, number] | null {
  let lo = Infinity, hi = -Infinity;
  for (const r of cover) {
    const t = segInRect(r, s.a.x, s.a.y, s.b.x, s.b.y);
    if (t) { if (t[0] < lo) lo = t[0]; if (t[1] > hi) hi = t[1]; }
  }
  const L = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);
  return hi > lo && (hi - lo) * L >= 0.04 ? [lo, hi] : null;
}

/** where a road piece is cut: spanIn widened at both ends by `margin` tiles (never past the piece's own ends), so the ends the cut leaves keep off the cover */
export function cutSpan(cover: readonly Rect[], s: { a: PlaceNode; b: PlaceNode }, margin = 0): [number, number] | null {
  const sp = spanIn(cover, s);
  if (!sp) return null;
  const L = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y), m = L > 0 ? margin / L : 0;
  return [Math.max(0, sp[0] - m), Math.min(1, sp[1] + m)];
}

/** the distance from a point to the part of segment A-B between parameters t0 and t1 */
function distToPart(px: number, py: number, s: { a: PlaceNode; b: PlaceNode }, t0: number, t1: number): number {
  if (t1 <= t0) return Infinity;
  const ax = s.a.x + (s.b.x - s.a.x) * t0, ay = s.a.y + (s.b.y - s.a.y) * t0, bx = s.a.x + (s.b.x - s.a.x) * t1, by = s.a.y + (s.b.y - s.a.y) * t1;
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy, t = L2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2)) : 0;
  return Math.hypot(px - ax - dx * t, py - ay - dy * t);
}

const nodeKey = (n: PlaceNode): string => `${Math.round(n.x * 100)},${Math.round(n.y * 100)}`;
/** the road graph: each road end's key to its neighbours (the road end across each piece, and the piece) */
type Adj = Map<string, { to: string; seg: PlaceSeg }[]>;
function adjacency(segs: readonly PlaceSeg[]): Adj {
  const adj: Adj = new Map();
  const add = (a: string, to: string, seg: PlaceSeg) => { const l = adj.get(a); if (l) l.push({ to, seg }); else adj.set(a, [{ to, seg }]); };
  for (const s of segs) { const a = nodeKey(s.a), b = nodeKey(s.b); add(a, b, s); add(b, a, s); }
  return adj;
}
/** the road ends joined to the starts by roads that are not cut (the pieces touching the cover are cut: a piece the cover takes any of is no way through) */
function reachable(adj: Adj, starts: readonly string[], cut: ReadonlySet<PlaceSeg>): Set<string> {
  const seen = new Set<string>(), todo: string[] = [];
  for (const k of starts) if (!seen.has(k)) { seen.add(k); todo.push(k); }
  while (todo.length) for (const e of adj.get(todo.pop()!) ?? []) if (!seen.has(e.to) && !cut.has(e.seg)) { seen.add(e.to); todo.push(e.to); }
  return seen;
}
/** the key of the road end nearest a point within NODE_NEAR tiles (null: none) */
function nearestNode(segs: readonly PlaceSeg[], x: number, y: number): string | null {
  let best: PlaceNode | null = null, bd = NODE_NEAR;
  for (const s of segs) for (const n of [s.a, s.b]) { const d = Math.hypot(n.x - x, n.y - y); if (d < bd) { bd = d; best = n; } }
  return best ? nodeKey(best) : null;
}

/** the lattice block (40 x 40 tiles from the map's corner) a tile lies in, as one key */
const blockKey = (bx: number, by: number): number => by * 4096 + bx;

/** the land class of each lattice block the lots and farms give it (as the engine's blockLandClass has it, for every block at once): shops
 *  make it commercial, works industrial, homes or other buildings town, a farm's parcel farm, else open */
function classTally(lots: Iterable<PlaceLot>, farms: Iterable<{ x: number; y: number }>): Map<number, ParcelLandClass> {
  const t = new Map<number, { com: boolean; ind: boolean; town: boolean; farm: boolean }>();
  const at = (x: number, y: number) => { const k = blockKey(Math.floor(x / LAND_BLOCK), Math.floor(y / LAND_BLOCK)); let v = t.get(k); if (!v) t.set(k, (v = { com: false, ind: false, town: false, farm: false })); return v; };
  for (const l of lots) {
    if (l.level < 1) continue;
    const v = at(l.o[0]!, l.o[1]!);
    if (l.use === 2) v.com = true; else if (l.use === 3) v.ind = true; else if (l.use >= 1) v.town = true;
  }
  for (const f of farms) at(f.x, f.y).farm = true;
  const out = new Map<number, ParcelLandClass>();
  for (const [k, v] of t) out.set(k, v.com ? 'commercial' : v.ind ? 'industrial' : v.town ? 'town' : v.farm ? 'farm' : 'open');
  return out;
}

/** the box of a lot's rectangle */
function lotBox(l: PlaceLot): [number, number, number, number] {
  const ax = l.u[0]! * l.w, ay = l.u[1]! * l.w, bx = l.n[0]! * l.d, by = l.n[1]! * l.d, x = l.o[0]!, y = l.o[1]!;
  return [Math.min(x, x + ax, x + bx, x + ax + bx), Math.min(y, y + ay, y + by, y + ay + by), Math.max(x, x + ax, x + bx, x + ax + bx), Math.max(y, y + ay, y + by, y + ay + by)];
}
/** whether a lot stands on land: its box meets one of the rects by more than half a tile each way (the city worker's own rule, City.onLand) */
function lotOn(b: readonly number[], rects: readonly Rect[]): boolean {
  for (const [x, y, w, h] of rects) if (Math.min(b[2]!, x + w) - Math.max(b[0]!, x) > 0.5 && Math.min(b[3]!, y + h) - Math.max(b[1]!, y) > 0.5) return true;
  return false;
}

/** what the land of the cover costs: the cover cut into the 40-tile blocks, each piece less what the player owns already, at its block's class rate a
 *  square metre, the town's growth on top (golf/parcels.ts adjacentBlockPrice's rule, without its surcharge for buildings: they are bought out
 *  at their compensation here) */
function landCost(cover: readonly Rect[], owned: readonly Rect[], classes: Map<number, ParcelLandClass>, pop: number): { tiles: number; mine: number; price: number } {
  const grow = 1 + (Math.max(0, pop - 1000) / 1000) * POP_GROWTH_RATE;
  let tiles = 0, mine = 0, price = 0;
  for (const r of cover) {
    const bx0 = Math.floor(r[0] / LAND_BLOCK), bx1 = Math.floor((r[0] + r[2] - 1e-9) / LAND_BLOCK), by0 = Math.floor(r[1] / LAND_BLOCK), by1 = Math.floor((r[1] + r[3] - 1e-9) / LAND_BLOCK);
    for (let by = by0; by <= by1; by++) for (let bx = bx0; bx <= bx1; bx++) {
      const piece = clip(r, bx * LAND_BLOCK, by * LAND_BLOCK, (bx + 1) * LAND_BLOCK, (by + 1) * LAND_BLOCK);
      if (!piece) continue;
      const own: Rect[] = [];
      for (const o of owned) { const c = clip(o, piece[0], piece[1], piece[0] + piece[2], piece[1] + piece[3]); if (c) own.push(c); }
      const have = unionArea(own), free = piece[2] * piece[3] - have, rate = LAND_PRICE_SQM[classes.get(blockKey(bx, by)) ?? 'open'];
      tiles += free; mine += have; price += free * TILE_M * TILE_M * rate * grow;
    }
  }
  return { tiles, mine, price: Math.round(price) };
}

/** whether any tile of the cover, sampled every 4 tiles, is the river */
function onRiver(world: PlaceWorld, cover: readonly Rect[]): boolean {
  for (const r of cover) for (let y = r[1] + 2; y < r[1] + r[3]; y += 4) for (let x = r[0] + 2; x < r[0] + r[2]; x += 4) if (world.river(x, y)) return true;
  return false;
}

/** the words for a refusal */
export const WHY = {
  map: 'Off the map (the map cannot grow): move it inward or turn it',
  river: 'The river is in the way',
  riverOn: (hole: number, what: 'tee' | 'green') => (hole > 0 ? `The river runs over hole ${hole}'s ${what}` : `The river runs over a practice ${what}`),
  riverAlong: (hole: number) => `The river runs along hole ${hole}: turn the course or move it`,
  town: "The town's centre is there: place the course beside the town",
  link: (name: string) => `That would cut ${name} off from the county road`,
  club: (name: string) => `Your ${name} is in the way`,
  round: 'Not while a tournament is under way',
} as const;

const empty = () => ({ keys: [] as string[], houses: 0, shops: 0, works: 0, others: 0, comp: 0 });
/** a lot added to a count: by use */
function tally(c: ReturnType<typeof empty>, l: PlaceLot, comp: number) {
  c.keys.push(l.key); c.comp += comp;
  if (l.use === 1) c.houses++; else if (l.use === 2) c.shops++; else if (l.use === 3) c.works++; else c.others++;
}

/** the part of a (turned) spec the planner reads: its frame and outline, and, for the river rule, its areas and holes (a spec without them is judged by its cover) */
export type PlaceSpec = Pick<OsmCourseSpec, 'w' | 'h' | 'outline'> & Partial<Pick<OsmCourseSpec, 'areas' | 'holes'>>;

/** why the river forbids the spec at (ox, oy), or '' when it does not (RIVER_RULE 'features'): a hole's green with a corner or its middle on the river, a tee
 *  marker or the pin on it, or a hole whose line runs more than RIVER_ALONG of its length along it (a tee box the river only clips is a bitten box: the cells
 *  on the river are left unpainted; a practice green or tee is no hole's) */
function riverOnFeatures(world: PlaceWorld, spec: PlaceSpec, ox: number, oy: number): string {
  const wet = (x: number, y: number): boolean => world.river(Math.floor(ox + x), Math.floor(oy + y));
  for (const a of spec.areas ?? []) {
    if (a.surf !== 'green' || a.hole <= 0) continue;
    const r = a.rings[0]; if (!r || r.length < 6) continue;
    let sx = 0, sy = 0, n = 0, hit = false;
    for (let i = 0; i + 1 < r.length; i += 2) { sx += r[i]!; sy += r[i + 1]!; n++; if (wet(r[i]!, r[i + 1]!)) hit = true; }
    if (hit || wet(sx / n, sy / n)) return WHY.riverOn(a.hole, a.surf);
  }
  for (const h of spec.holes ?? []) {
    for (const t of h.tees) if (wet(t.x, t.y)) return WHY.riverOn(h.n, 'tee');
    if (wet(h.pin.x, h.pin.y)) return WHY.riverOn(h.n, 'green');
    const l = h.line; let n = 0, w = 0;
    for (let i = 0; i + 3 < l.length; i += 2) {
      const dx = l[i + 2]! - l[i]!, dy = l[i + 3]! - l[i + 1]!, k = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 4));
      for (let j = 0; j < k; j++) { n++; if (wet(l[i]! + (dx * j) / k, l[i + 1]! + (dy * j) / k)) w++; }
    }
    if (n && w / n > RIVER_ALONG) return WHY.riverAlong(h.n);
  }
  return '';
}

/** what the planner works out once for a state of the world, not for every pose: the lots with their boxes and fronts, the land classes of the 40-tile blocks, the
 *  road graph and the road ends the county road reaches before any cut (a replan per pointer move then reads these, not the whole town) */
interface Prep {
  rev: string | undefined; owner: object | undefined;
  lots: { l: PlaceLot; box: [number, number, number, number]; fx: number; fy: number }[];
  classes: Map<number, ParcelLandClass>;
  segs: PlaceSeg[]; adj: Adj; entries: string[]; targets: { name: string; key: string | null }[]; before: Set<string>;
}
let memo: Prep | null = null;
function prep(world: PlaceWorld): Prep {
  if (world.revision !== undefined && memo && memo.rev === world.revision && memo.owner === world.owner) return memo;
  const lots: Prep['lots'] = [];
  for (const l of world.lots) if (l.level >= 1) lots.push({ l, box: lotBox(l), fx: l.o[0]! + l.u[0]! * (l.w / 2), fy: l.o[1]! + l.u[1]! * (l.w / 2) });
  const segs = [...world.segs], adj = adjacency(segs);
  const entries = world.entries.map(e => nearestNode(segs, e.x, e.y)).filter((k): k is string => !!k);
  const p: Prep = {
    rev: world.revision, owner: world.owner, lots, classes: classTally(world.lots, world.farms), segs, adj, entries,
    targets: world.targets.map(t => ({ name: t.name, key: nearestNode(segs, t.x, t.y) })), before: entries.length ? reachable(adj, entries, new Set()) : new Set(),
  };
  if (world.revision !== undefined) memo = p;
  return p;
}

/** the plan of the spec (as it is converted, or already turned: `deg` turns it from there) with its land's middle at (pose.x, pose.y). `rotated` is the
 *  spec turned by the pose's angle (rotate.ts rotateSpec; the caller keeps it per angle) and `build` the price of its surfaces (the same at every angle) */
export function planPlace(world: PlaceWorld, rotated: PlaceSpec, pose: PlacePose, build: number): PlacePlan {
  const { ox, oy } = originFor(rotated, pose.x, pose.y), outline = outlineAt(rotated, ox, oy), cover = coverStrips(outline), bounds = boundsOf(cover);
  // inside the map with PLACE_EDGE tiles to spare (the outline's corners; the cover, rounded outward, is on the map)
  const E = PLACE_EDGE, fits = !!bounds && outline.every(v => v >= E - 1e-6 && v <= world.map - E + 1e-6) && bounds[0] >= 0 && bounds[1] >= 0 && bounds[0] + bounds[2] <= world.map && bounds[1] + bounds[3] <= world.map;
  const plan: PlacePlan = {
    ox, oy, outline, cover, bounds, fits, why: '', whyKind: '',
    land: { tiles: 0, ha: 0, price: 0, mine: 0 }, lots: empty(), orphans: empty(), roads: { segs: 0, m: 0, value: 0, ownSegs: 0, ownM: 0 }, props: 0,
    demolish: 0, build, total: 0, money: world.money, short: 0, affordable: false, ok: false,
  };
  const refuse = (kind: PlaceWhyKind, why: string) => { if (!plan.why) { plan.why = why; plan.whyKind = kind; } };
  if (!fits) { refuse('map', WHY.map); plan.total = build; plan.short = Math.max(0, build - world.money); return plan; }

  // ---- what stops it ----
  if (world.roundLive) refuse('round', WHY.round);
  for (const k of world.keep) if (cover.some(r => rectsOverlap(r, k.rect))) { refuse('club', WHY.club(k.name)); break; }
  const tc = world.townCentre;
  if (tc && cover.some(r => Math.hypot(Math.max(r[0] - tc.x, 0, tc.x - (r[0] + r[2])), Math.max(r[1] - tc.y, 0, tc.y - (r[1] + r[3]))) < TOWN_KEEP)) refuse('town', WHY.town);

  // ---- the land ----
  const P = prep(world), L = landCost(cover, world.owned, P.classes, world.pop);
  plan.land = { tiles: L.tiles, ha: Math.round((L.tiles * TILE_M * TILE_M) / 100) / 100, price: L.price, mine: L.mine };

  // ---- the roads under the cover ----
  const bx0 = bounds![0] - NEAR_COVER - 8, by0 = bounds![1] - NEAR_COVER - 8, bx1 = bounds![0] + bounds![2] + NEAR_COVER + 8, by1 = bounds![1] + bounds![3] + NEAR_COVER + 8;
  const cut = new Set<PlaceSeg>(), spans = new Map<PlaceSeg, [number, number]>();
  for (const s of P.segs) {
    if (s.kind === 2) continue; // (a tunnel runs under the land)
    if (Math.max(s.a.x, s.b.x) < bx0 || Math.min(s.a.x, s.b.x) > bx1 || Math.max(s.a.y, s.b.y) < by0 || Math.min(s.a.y, s.b.y) > by1) continue;
    const sp = cutSpan(cover, s, world.endMargin?.(s) ?? 0);
    if (!sp) continue;
    cut.add(s); spans.set(s, sp);
    const m = (sp[1] - sp[0]) * Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);
    if (world.isCourseRoad(s)) { plan.roads.ownSegs++; plan.roads.ownM += m * TILE_M; } else { plan.roads.segs++; plan.roads.m += m * TILE_M; plan.roads.value += m * world.valuePerTile(s); }
  }
  plan.roads.value = Math.round(plan.roads.value); plan.roads.m = Math.round(plan.roads.m); plan.roads.ownM = Math.round(plan.roads.ownM);
  if (world.props) for (const r of cover) plan.props += world.props(r);

  // ---- the way to the county road: kept for the town's centre and the clubhouse ----
  const before = P.before;
  let after = before;
  if (P.entries.length && cut.size) {
    after = reachable(P.adj, P.entries, cut);
    for (const t of P.targets) if (t.key && before.has(t.key) && !after.has(t.key)) { refuse('link', WHY.link(t.name)); break; }
  }

  // the river (RIVER_RULE) is looked at last: the place's own reasons come first (the club's buildings, the town's centre, the county road), the river's, which a
  // turn or a move often cures, after
  if (RIVER_RULE === 'features' && rotated.areas && rotated.holes) { const why = riverOnFeatures(world, rotated, ox, oy); if (why) refuse('river', why); }
  else if (onRiver(world, cover)) refuse('river', WHY.river);

  // ---- the built lots under the cover, and the lots left with no road in front of them or no way out: cleared too ----
  // (only a lot within a road's reach of the cover can have lost the road in front of it, and only a lot beside a road the cut leaves with no way out can
  //  have lost its way out: the pieces that hang on a road end the entries no longer reach)
  const padded: Rect[] = cover.map(r => [r[0] - NEAR_COVER, r[1] - NEAR_COVER, r[2] + 2 * NEAR_COVER, r[3] + 2 * NEAR_COVER]);
  const stranded = after === before ? [] : P.segs.filter(s => !cut.has(s) && ((before.has(nodeKey(s.a)) && !after.has(nodeKey(s.a))) || (before.has(nodeKey(s.b)) && !after.has(nodeKey(s.b)))));
  const reachOf = (s: PlaceSeg) => s.cls.h + s.cls.walk + FRONT_SLACK;
  const maybe: Prep['lots'] = [];
  for (const pl of P.lots) {
    const b = pl.box;
    // (a lot well clear of the cover's box, with no stranded road in the town, has lost nothing)
    const far = b[2] < bx0 || b[0] > bx1 || b[3] < by0 || b[1] > by1;
    if (!far && lotOn(b, cover)) { tally(plan.lots, pl.l, world.compensation(pl.l)); continue; }
    if (!far || stranded.length > 0) maybe.push(pl);
  }
  for (const pl of maybe) {
    if (!lotOn(pl.box, padded) && !stranded.some(s => distToPart(pl.fx, pl.fy, s, 0, 1) <= reachOf(s))) continue;
    const { fx, fy } = pl;
    let had = false, served = false;
    for (const s of world.segsNear(fx, fy, 14)) {
      const r = reachOf(s);
      if (distToPart(fx, fy, s, 0, 1) > r) continue;
      had = true;
      const sp = spans.get(s);
      // the part of the piece that stays: all of it, or the pieces before and after the cover's bite (each hangs on its own end)
      const parts: [number, number, PlaceNode][] = sp ? [[0, sp[0], s.a], [sp[1], 1, s.b]] : [[0, 1, s.a]];
      for (const [t0, t1, end] of parts) {
        if (distToPart(fx, fy, s, t0, t1) > r) continue;
        // (the end it hangs on must still reach the county road, when it did before)
        const k = nodeKey(end);
        if (sp ? (!before.has(k) || after.has(k)) : (!before.has(nodeKey(s.a)) || after.has(nodeKey(s.a)) || after.has(nodeKey(s.b)))) { served = true; break; }
      }
      if (served) break;
    }
    if (had && !served) tally(plan.orphans, pl.l, world.compensation(pl.l));
  }

  // ---- the price ----
  plan.demolish = plan.lots.comp + plan.orphans.comp + plan.roads.value;
  plan.total = plan.land.price + plan.demolish + build;
  plan.short = Math.max(0, plan.total - world.money);
  plan.affordable = plan.short <= 0;
  plan.ok = !plan.why && plan.affordable;
  return plan;
}

/** the plan's words for the cursor: why not, the shortfall, or the price and a click */
export function placeLabel(plan: PlacePlan, name: string): { text: string; bad: boolean } {
  if (plan.why) return { text: plan.why, bad: true };
  if (!plan.affordable) return { text: `Not enough money: ${money(plan.total)} (short ${money(plan.short)})`, bad: true };
  return { text: `${name} · ${money(plan.total)} · click to place`, bad: false };
}

const plural = (n: number, one: string, many = one + 's'): string => `${n} ${n === 1 ? one : many}`;
/** what goes, as a phrase ("14 houses, 2 shops and 1.3 km of road"), or '' when nothing does */
export function goesPhrase(plan: PlacePlan): string {
  const houses = plan.lots.houses + plan.orphans.houses, shops = plan.lots.shops + plan.orphans.shops, works = plan.lots.works + plan.orphans.works, others = plan.lots.others + plan.orphans.others;
  const parts: string[] = [];
  if (houses) parts.push(plural(houses, 'house'));
  if (shops) parts.push(plural(shops, 'shop'));
  if (works) parts.push(works === 1 ? '1 works' : `${works} works`);
  if (others) parts.push(plural(others, 'other building'));
  if (plan.roads.m) parts.push(`${plan.roads.m >= 1000 ? `${(Math.round(plan.roads.m / 100) / 10).toLocaleString('en-US')} km` : `${plan.roads.m} m`} of road`);
  if (plan.roads.ownM) parts.push(`${plan.roads.ownM >= 1000 ? `${(Math.round(plan.roads.ownM / 100) / 10).toLocaleString('en-US')} km` : `${plan.roads.ownM} m`} of your own paths and drives`);
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0] ?? '';
}
/** the pop-up's sentence: "This will buy 112 ha, demolish 14 houses, 2 shops and 1.3 km of road ($X). Roads cut by the course ..." */
export function popupText(plan: PlacePlan): string {
  const ha = plan.land.ha >= 10 ? Math.round(plan.land.ha) : plan.land.ha, goes = goesPhrase(plan), orph = plan.orphans.keys.length;
  const head = `This will buy ${ha.toLocaleString('en-US')} ha${goes ? `, demolish ${goes}` : ''} (${money(plan.total)}).`;
  const tail = plan.roads.segs ? ' Roads cut by the course end at its boundary (a lot left with no road is cleared too).' : '';
  return `${head}${tail}${orph ? ` ${plural(orph, 'building')} left with no road or no way out ${orph === 1 ? 'is' : 'are'} cleared too.` : ''}`;
}

/** the sum the pop-up lists, line by line: the label and the money */
export function priceLines(plan: PlacePlan): { label: string; amount: number }[] {
  const lines: { label: string; amount: number }[] = [{ label: `Land · ${plan.land.ha.toLocaleString('en-US')} ha`, amount: plan.land.price }];
  if (plan.lots.comp + plan.orphans.comp) lines.push({ label: `Buildings bought out · ${plan.lots.keys.length + plan.orphans.keys.length}`, amount: plan.lots.comp + plan.orphans.comp });
  if (plan.roads.value) lines.push({ label: 'Roads taken', amount: plan.roads.value });
  lines.push({ label: 'The course laid', amount: plan.build });
  return lines;
}

/** how much of the land the cover takes that was not the turned land's own, as a share (the staircase's extra): for the tests and the card */
export function coverExtra(plan: PlacePlan, rotated: Pick<OsmCourseSpec, 'w' | 'h' | 'outline'>): number {
  const o = rotated.outline ?? [0, 0, rotated.w, 0, rotated.w, rotated.h, 0, rotated.h];
  let a = 0; for (let i = 0, n = o.length >> 1; i < n; i++) { const j = (i + 1) % n; a += o[2 * i]! * o[2 * j + 1]! - o[2 * j]! * o[2 * i + 1]!; }
  const exact = Math.abs(a) / 2;
  return exact > 0 ? rectsArea(plan.cover) / exact - 1 : 0;
}
