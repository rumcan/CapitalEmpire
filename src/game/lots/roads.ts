// The town's road planner (Phase 3 step 4): when the town is short of land it lays one gravel extension out to the land it
// needs: a dead end continued, a branch off a road on the parcel lattice, or a leg that closes a block. Pure TS, no DOM.
// The candidates are scored first and validated best first, so a call stays cheap.
import { CLASS, SK, dot, mul, norm, sub, vlen, type Leg, type Node, type Pt, type RoadNetwork, type Seg } from '../network';
import { MAP } from '../iso';
import { ringClear, type Lot, type LotMap } from './lots';
import { LV, type Town } from './town';
import { TC } from '../terrain/types';

/** centre and built: the town centre to plan around and that town's built lots (default: the Town's whole built area); blocked: the no-go
 *  tiles, no leg may pass through one (see valid); towns: the town's roads with centres: a leg joins only the town's own classes (BRANCH_IDS)
 *  and never touches a main road (any other class) */
export interface RoadPlanCtx { net: RoadNetwork; lots: LotMap; town: Town; cls: Uint8Array /* terrain classes */; entry: Pt; rnd: () => number; centre?: Pt; built?: number; blocked?: (x: number, y: number) => boolean; towns?: boolean /** T091: whether an EMPTY lot can build (golf games: not on golf land); short() counts only those. Absent: every EMPTY lot counts */
  canBuild?: (l: Lot) => boolean;
  /** T091: a term added to a candidate leg's score by its midpoint (range starts: +40 within 40 tiles of golf land, so the town grows away from it) */
  penalty?: (mid: Pt) => number }

/** the block size (tiles), the reach of the land counted from the centre (tiles), and the least land kept (lots) */
export const BLOCK = 40;
const NEAR = 100, MIN_LAND = 24;
/** diagnostics: why candidates were rejected (cumulative) */
export const planWhy = { cands: 0, margin: 0, terrain: 0, verge: 0, lot: 0 };
/** the gravel corridor: its half width (h + walk), the terrain sample offset across (h + walk + 1), the verge gap kept, the map margin (tiles) */
const GR = CLASS.gravel.h + CLASS.gravel.walk, GR_T = GR + 1, GAP = 3, MARGIN = 16;
/** the shortest leg, and how far past its length a road may be to close it */
const MIN_LEG = 8, CLOSE = 14;
/** an open leg reaches the next lattice line at least this far away (tiles) */
const MIN_TO_LATTICE = 16;
/** the length from A along an axis-aligned u to the first lattice line (a multiple of BLOCK) at least MIN_TO_LATTICE away; BLOCK otherwise */
function toLattice(A: Pt, u: Pt): number {
  const ax = Math.abs(u.x) > 0.999 ? 'x' : Math.abs(u.y) > 0.999 ? 'y' : null;
  if (!ax) return BLOCK;
  const p = A[ax], d = Math.sign(u[ax]), goal = p + d * MIN_TO_LATTICE;
  const q = d > 0 ? Math.ceil(goal / BLOCK) * BLOCK : Math.floor(goal / BLOCK) * BLOCK;
  return Math.abs(q - p);
}
/** the score terms: a dead-end leg that closes nothing, a new junction with a paved road, a block closed */
const DEAD_PEN = 30, JUNC_PEN = 20, CLOSE_BONUS = 25;
const BRANCH_IDS = new Set<string>(['gravel', 'lane', 'street', 'road']);

/** a candidate leg: from A along u (length L), starting on seg `start`, closing on `close` (null = open); the score (lower is better) and a tie-break */
interface Cand { A: Pt; u: Pt; L: number; start: Seg; close: Seg | null; dead: boolean; score: number; tie: number }

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const paved = (s: Seg) => s.cls.id !== 'gravel';
const isEmpty = (t: Town, l: Lot) => (t.states.get(l.key)?.level ?? LV.EMPTY) === LV.EMPTY;
const bad = (c: number) => c === TC.WATER || c === TC.CREEK || c === TC.BANK;
/** does the seg pass through p (within 0.05 tiles) */
const through = (s: Seg, p: Pt) => segDist(p, s) < 0.05;
/** does the leg A → E touch seg s: its centre line crosses s, or an end of the leg is on s (within 0.05 tiles) */
function touches(A: Pt, E: Pt, s: Seg): boolean {
  if (segDist(A, s) < 0.05 || segDist(E, s) < 0.05) return true;
  const d1x = E.x - A.x, d1y = E.y - A.y, d2x = s.b.x - s.a.x, d2y = s.b.y - s.a.y, den = d1x * d2y - d1y * d2x;
  if (Math.abs(den) < 1e-12) return false;
  const wx = s.a.x - A.x, wy = s.a.y - A.y, t = (wx * d2y - wy * d2x) / den, w = (wx * d1y - wy * d1x) / den;
  return t >= 0 && t <= 1 && w >= 0 && w <= 1;
}
/** the distance from p to the centre line of a seg */
function segDist(p: Pt, s: Seg): number {
  const dx = s.b.x - s.a.x, dy = s.b.y - s.a.y, L2 = dx * dx + dy * dy;
  let t = L2 > 0 ? ((p.x - s.a.x) * dx + (p.y - s.a.y) * dy) / L2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(s.a.x + dx * t - p.x, s.a.y + dy * t - p.y);
}

/** the segs reachable by road from the node nearest the entry (none for an empty network) */
export function reachableSegs(net: RoadNetwork, entry: Pt): Set<Seg> {
  const out = new Set<Seg>(); let start: Node | null = null, best = Infinity;
  for (const n of net.nodes.values()) { const d = (n.x - entry.x) ** 2 + (n.y - entry.y) ** 2; if (d < best) { best = d; start = n; } }
  if (!start) return out;
  const seen = new Set<Node>([start]), q: Node[] = [start];
  for (let i = 0; i < q.length; i++) for (const s of q[i].segs) { out.add(s); const o = s.a === q[i] ? s.b : s.a; if (!seen.has(o)) { seen.add(o); q.push(o); } }
  return out;
}

/** the segs reachable by road from the node nearest each anchor (the union), for the anchors whose nearest node is within maxD[i] tiles */
export function reachableFrom(net: RoadNetwork, anchors: Pt[], maxD: number[]): Set<Seg> {
  const out = new Set<Seg>(), seen = new Set<Node>();
  for (let i = 0; i < anchors.length; i++) {
    const p = anchors[i]; let start: Node | null = null, best = Infinity;
    for (const n of net.nodes.values()) { const d = (n.x - p.x) ** 2 + (n.y - p.y) ** 2; if (d < best) { best = d; start = n; } }
    if (!start || Math.sqrt(best) > maxD[i] || seen.has(start)) continue;
    seen.add(start); const q: Node[] = [start];
    for (let j = 0; j < q.length; j++) for (const s of q[j].segs) { out.add(s); const o = s.a === q[j] ? s.b : s.a; if (!seen.has(o)) { seen.add(o); q.push(o); } }
  }
  return out;
}

/** a seeded stream (mulberry32, as the Town's): [0, 1) */
export function seededRnd(seed: number): () => number {
  let s = seed >>> 0;
  return () => { let t = (s = (s + 0x6d2b79f5) | 0); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** the built centre: the mean of the BUILT lots (the entry while none is built) */
function builtCentre(c: RoadPlanCtx): Pt {
  if (c.centre) return c.centre;
  let sx = 0, sy = 0, m = 0;
  for (const s of c.town.states.values()) if (s.level >= LV.BUILT) { const l = c.lots.lots.get(s.key); if (l) { sx += l.c.x; sy += l.c.y; m++; } }
  return m ? { x: sx / m, y: sy / m } : c.entry;
}

/** short of land: fewer reachable EMPTY lots within reach of the centre (NEAR + 10 x sqrt(built lots) tiles: the radius grows
 *  with the town, so a spread-out town does not keep asking for roads) than max(24, 1.5 × the Town's daily growth) */
function short(c: RoadPlanCtx, cen: Pt, reach: Set<Seg>): boolean {
  let n = 0; const B = c.built ?? c.town.built, R = NEAR + 10 * Math.sqrt(B);
  for (const l of c.lots.lots.values()) if (reach.has(l.seg) && isEmpty(c.town, l) && dist(l.c, cen) <= R && (!c.canBuild || c.canBuild(l))) n++;
  return n < Math.max(MIN_LAND, 1.5 * (20 + 0.1 * B));
}

/** is the town short of land (see short) */
export function needsLand(c: RoadPlanCtx): boolean { return short(c, builtCentre(c), reachableSegs(c.net, c.entry)); }

/** the nearest ground road ahead of A along u, within the leg's length plus CLOSE (its distance and seg), or null */
function ahead(c: RoadPlanCtx, A: Pt, u: Pt, L: number, start: Seg): { t: number; seg: Seg } | null {
  const R = L + CLOSE, cx = A.x + u.x * R / 2, cy = A.y + u.y * R / 2;
  let best = Infinity, hit: Seg | null = null;
  for (const s of c.net.segsNear({ x: cx, y: cy }, R / 2 + 1)) {
    if (s === start || s.kind !== SK.GROUND) continue;
    if (c.towns && !BRANCH_IDS.has(s.cls.id)) continue; // a town's leg never closes onto a main road
    const vx = s.b.x - s.a.x, vy = s.b.y - s.a.y, den = u.x * vy - u.y * vx;
    if (Math.abs(den) < 1e-9) continue;
    const wx = s.a.x - A.x, wy = s.a.y - A.y, t = (wx * vy - wy * vx) / den, w = (wx * u.y - wy * u.x) / den;
    if (t > 1 && t <= R && w >= -1e-9 && w <= 1 + 1e-9 && t < best) { best = t; hit = s; }
  }
  return hit && best >= MIN_LEG ? { t: best, seg: hit } : null;
}

/** one candidate: its score (the midpoint's distance to the centre, the penalties and bonus) */
function push(c: RoadPlanCtx, cen: Pt, out: Cand[], A: Pt, u: Pt, L: number, start: Seg, close: Seg | null, dead: boolean) {
  const mid = { x: A.x + u.x * L / 2, y: A.y + u.y * L / 2 };
  const junctions = (!dead && paved(start) ? 1 : 0) + (close && paved(close) ? 1 : 0);
  const score = dist(mid, cen) + (close ? -CLOSE_BONUS : dead ? DEAD_PEN : 0) + JUNC_PEN * junctions + (c.penalty ? c.penalty(mid) : 0);
  out.push({ A, u, L, start, close, dead, score, tie: c.rnd() });
}

/** the candidates of one base leg: open (BLOCK long), and closing on the road ahead when there is one */
function addCands(c: RoadPlanCtx, cen: Pt, out: Cand[], A: Pt, u: Pt, start: Seg, dead: boolean) {
  // the open leg ends on the town's street lattice (the next multiple of BLOCK across u, at least MIN_TO_LATTICE away), so the
  // streets the town lays line up into 40-tile blocks whatever the road it starts from (a non-axis u keeps a full BLOCK)
  push(c, cen, out, A, u, toLattice(A, u), start, null, dead);
  const hit = ahead(c, A, u, BLOCK, start);
  if (hit) push(c, cen, out, A, u, hit.t, start, hit.seg, dead);
}

/** all the candidates from reachable roads: dead ends continued, branches off the parcel lattice (both sides, away from junctions) */
function candidates(c: RoadPlanCtx, cen: Pt, reach: Set<Seg>): Cand[] {
  const out: Cand[] = [], junc: Pt[] = [];
  for (const n of c.net.nodes.values()) if (n.segs.length >= 3) junc.push(n);
  for (const n of c.net.nodes.values()) {
    if (n.segs.length !== 1 || n.type !== 'plain') continue;
    const s = n.segs[0];
    if (!BRANCH_IDS.has(s.cls.id) || !reach.has(s)) continue;
    // straight on, and turning left or right (a T at the dead end: the highway's end in the start block grows this way)
    const u = norm(sub(n, s.a === n ? s.b : s.a)), A = { x: n.x, y: n.y };
    addCands(c, cen, out, A, u, s, true);
    addCands(c, cen, out, A, { x: -u.y, y: u.x }, s, true); addCands(c, cen, out, A, { x: u.y, y: -u.x }, s, true);
  }
  // the missing arms of corners and T-junctions (the free side of a T, the open sides of a bend): axis directions with no arm
  for (const n of c.net.nodes.values()) {
    if (n.segs.length < 2 || n.segs.length > 3 || n.type !== 'plain') continue;
    const own = n.segs.filter(s => s.kind === SK.GROUND && BRANCH_IDS.has(s.cls.id) && reach.has(s));
    if (own.length !== n.segs.length) continue;
    const dirs = n.segs.map(s => norm(sub(s.a === n ? s.b : s.a, n))), A = { x: n.x, y: n.y };
    for (const u of [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }]) if (!dirs.some(d => dot(d, u) > 0.98)) addCands(c, cen, out, A, u, own[0], false);
  }
  for (const s of c.net.segs) {
    if (s.kind !== SK.GROUND || !BRANCH_IDS.has(s.cls.id) || !reach.has(s)) continue;
    const dv = sub(s.b, s.a), L = vlen(dv); if (L < 6) continue;
    const u = mul(dv, 1 / L), t0 = dot(s.a, u), t1 = dot(s.b, u);
    for (let k = Math.ceil((t0 + 3) / BLOCK); k * BLOCK <= t1 - 3; k++) {
      const t = k * BLOCK, p = { x: s.a.x + u.x * (t - t0), y: s.a.y + u.y * (t - t0) };
      if (junc.some(j => dist(j, p) < 6)) continue;
      for (const side of [1, -1]) addCands(c, cen, out, p, { x: -u.y * side, y: u.x * side }, s, false);
    }
  }
  return out;
}

/** is the candidate buildable: no bad terrain (every tile along, at the centre and the verge edges), no no-go zone (with towns),
 *  no main road touched (with towns), inside the map margin,
 *  no other road's verge within GAP of the corridor (the start and a closing end excepted), no corridor through a lot that is not EMPTY */
function valid(c: RoadPlanCtx, k: Cand): boolean {
  const { A, u, L, start, close } = k, n = { x: -u.y, y: u.x };
  const E = { x: A.x + u.x * L, y: A.y + u.y * L };
  const inside = (x: number, y: number) => x >= MARGIN && y >= MARGIN && x < MAP - MARGIN && y < MAP - MARGIN;
  if (!inside(Math.floor(A.x), Math.floor(A.y)) || !inside(Math.floor(E.x), Math.floor(E.y))) { planWhy.margin++; return false; }
  // the terrain: one sample per tile along, at 0 and +-GR_T across
  const N = Math.ceil(L);
  for (let i = 0; i <= N; i++) {
    const t = Math.min(i, L);
    for (const o of [0, GR_T, -GR_T]) {
      const tx = Math.floor(A.x + u.x * t + n.x * o), ty = Math.floor(A.y + u.y * t + n.y * o);
      if (!inside(tx, ty) || bad(c.cls[ty * MAP + tx])) { planWhy.terrain++; return false; }
    }
  }
  // the no-go zones (with towns): every tile along, across the corridor's width (counted as terrain: ground the town may not use)
  if (c.blocked) for (let i = 0; i <= N; i++) {
    const t = Math.min(i, L);
    for (const o of [0, GR, -GR]) if (c.blocked(A.x + u.x * t + n.x * o, A.y + u.y * t + n.y * o)) { planWhy.terrain++; return false; }
  }
  // the other roads: the verges of the segs near the corridor, at 0.5 tile steps
  const mx = (A.x + E.x) / 2, my = (A.y + E.y) / 2;
  for (const s of c.net.segsNear({ x: mx, y: my }, L / 2 + GR + 16)) {
    // with towns, a leg never touches a main road (crossing it or ending on it; counted as a verge clash)
    if (c.towns && !BRANCH_IDS.has(s.cls.id) && touches(A, E, s)) { planWhy.verge++; return false; }
    if (s === start || s === close || through(s, A) || (close && through(s, E))) continue;
    const need = GR + s.cls.h + s.cls.walk + GAP;
    // a seg meeting the start seg at a node (a corner of the road we branch from) is only checked past `need` from A: near A
    // the new leg joins that junction anyway
    const adj = s.a === start.a || s.a === start.b || s.b === start.a || s.b === start.b;
    for (let i = adj ? Math.ceil(2 * need) : 0; i <= 2 * L; i++) if (segDist({ x: A.x + u.x * Math.min(i / 2, L), y: A.y + u.y * Math.min(i / 2, L) }, s) < need) { planWhy.verge++; return false; }
  }
  // the rings: no point of the corridor within a roundabout's (or a mini's) circle, its walk and GAP (a branch off a ring's arm, or a leg
  // closing on one, ran into the island: the owner's 3-lane ring, 2026-10-19)
  for (const nd of c.net.nodes.values()) {
    const r = ringClear(nd); if (r <= 0) continue;
    const need = r + GR + GAP;
    if (segDist(nd, { a: A, b: E } as Seg) >= need) continue;
    planWhy.verge++; return false;
  }
  // the lots: the corridor (0.5 tile steps along and across) through no lot that is not EMPTY
  const x0 = Math.min(A.x, E.x) - GR_T, y0 = Math.min(A.y, E.y) - GR_T, x1 = Math.max(A.x, E.x) + GR_T, y1 = Math.max(A.y, E.y) + GR_T;
  for (const l of c.lots.query(x0, y0, x1, y1)) {
    if (isEmpty(c.town, l)) continue;
    for (let i = 0; i <= 2 * L; i++) for (let j = 0; j <= 8; j++) {
      const t = Math.min(i / 2, L), o = -GR + j * GR / 4;
      const x = A.x + u.x * t + n.x * o - l.o.x, y = A.y + u.y * t + n.y * o - l.o.y;
      const a = x * l.u.x + y * l.u.y, b = x * l.n.x + y * l.n.y;
      if (a >= -0.5 && a <= l.w + 0.5 && b >= -0.5 && b <= l.d + 0.5) { planWhy.lot++; return false; }
    }
  }
  return true;
}

/** one gravel extension (one leg, in tiles) when the town is short of land, else null: the best valid candidate by score */
export function planExtension(c: RoadPlanCtx): Leg[] | null {
  const cen = builtCentre(c), reach = reachableSegs(c.net, c.entry);
  if (!short(c, cen, reach)) return null;
  const cands = candidates(c, cen, reach); planWhy.cands += cands.length; cands.sort((p, q) => (p.score - q.score) || (p.tie - q.tie));
  for (const k of cands) {
    if (!valid(c, k)) continue;
    return [{ a: { x: k.A.x, y: k.A.y }, b: { x: k.A.x + k.u.x * k.L, y: k.A.y + k.u.y * k.L } }];
  }
  return null;
}
