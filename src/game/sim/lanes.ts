// The lane graph: directed lanes, junction connectors and movements derived from the road network. Pure TS, no DOM.
// Geometry is in tiles; lengths, s positions and speeds are in metres and m/s.
import { type Arm, type Node, type Pt, type RoadNetwork, type Seg, type SpeedTier, MINI_ISLAND, RB_LANE, SK, speedOf, add, cross, dot, keyOf, mul, norm, perp, slipCorner, slipOn, sub, vlen } from '../network';
import { BOOTH_W, PLAZA_LEN, TAPER } from '../event/config';
import { plazaKey, type TollDef } from '../event/toll';
import { GREEN_CAP, MIN_GREEN } from './signals';

/** metres per tile */
export const MPT = 2;
/** lane kinds: LINK a directed road lane, CONN a junction connector, RING a roundabout arc */
export const LK = { LINK: 0, CONN: 1, RING: 2 } as const; export type LaneKind = 0 | 1 | 2;
export type Turn = 'L' | 'S' | 'R' | 'U';
/** junction control at a connector's entry */
export const CTL = { FREE: 0, YIELD: 1, STOP: 2, SIGNAL: 3 } as const;
/** a crossing (or, merge = true, a merge at the shared end) with another lane of the same node; s and os in metres */
export interface Conflict { lane: number; s: number; os: number; merge: boolean }
/** one directed lane, or a connector or ring arc */
export interface Lane {
  id: number; kind: LaneKind; key: string;
  /** polyline in tiles, x0 y0 x1 y1 ...; cum[i] = metres from the start to point i; len = cum[last] */
  pts: Float64Array; cum: Float64Array; len: number;
  /** speed limit, m/s */
  vmax: number;
  /** lanes this one feeds and is fed by (a LINK lane's next are at its dseg's `to` node, prev at its `from` node) */
  next: number[]; prev: number[];
  /** LINK only: directed segment, index (0 = innermost, next to the centre line), same-direction neighbours (-1 = none) */
  dseg: number; idx: number; left: number; right: number;
  /** CONN and RING: the owning node (null for LINK) */
  node: Node | null;
  conflicts: Conflict[];
  ctl: number;
  /** gap acceptance: a lane waits only for conflicting lanes whose prio is >= its own */
  prio: number;
  /** signal phase this connector is green in (-1 = not signalled) */
  phase: number;
  tunnel: boolean;
  /** toll booth lanes only: metres along the lane to the booth line (at the plaza's middle); undefined elsewhere */
  booth?: number;
  /** slip junctions only: 1 = a node lane before the junction's gate (an approach lane, or a slip body: a vehicle queues on it); 2 = a departure
   *  lane (after the box, up to the exit road's link lanes); undefined elsewhere */
  flare?: 1 | 2;
}
/** a directed segment: one direction of a Seg */
export interface DSeg { id: number; key: string; seg: Seg; dir: 0 | 1; from: Node; to: Node; lanes: number[]; len: number; vmax: number; /** movements leaving its end */ out: number[]; /** a toll gate's booths (undefined: not a toll dseg; its lanes are the booth lanes) */ toll?: number }
/** a way through a node from one dseg to another; paths[k] is a lane sequence [inLane, ...node lanes, outLane] */
export interface Movement { id: number; key: string; node: Node; from: number; to: number; turn: Turn; paths: number[][]; len: number }
/** signal plan of a node: armPhase[i] = phase of arm i (node.arms order); times in seconds. green, amber, allRed and offset are the fixed-time
 *  reference cycle (Sim.fixedSignals); the runtime state is actuated (signals.ts): idx the phase served, stage 0 green, 1 amber, 2 all-red,
 *  el the seconds in the stage; phaseLanes[k] are the LINK lanes feeding the connectors of phase k. mode: the lights' tier (0 fixed-time, 1 actuated,
 *  2 adaptive; from node.sig); greens[k]: phase k's green seconds in the fixed-time cycle (node.split, clamped, else green) */
export interface SignalPlan { node: Node; mode: 0 | 1 | 2; armPhase: number[]; phases: number; green: number; greens: number[]; amber: number; allRed: number; offset: number;
  idx: number; stage: number; el: number; phaseLanes: number[][] }

/** the arm of a node at one of its arms' directed segments */
interface ArmIO { a: Arm; i: number; inD: number; outD: number }

const TAU = Math.PI * 2;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const isLive = (net: RoadNetwork, n: Node) => n.segs.length > 0 && net.nodes.get(keyOf(n)) === n;
const armOf = (n: Node, s: Seg): Arm | undefined => n.arms.find(a => a.seg === s);
/** offset of lane k of a seg's class from the centre line, tiles (a single lane at [0] sits at 0.45) */
export const laneOff = (s: Seg, k: number) => { const c = s.cls.laneCentres; return c.length === 1 && c[0] === 0 ? 0.45 : c[k]; };
const startPt = (l: Lane): Pt => ({ x: l.pts[0], y: l.pts[1] });
const endPt = (l: Lane): Pt => { const n = l.pts.length; return { x: l.pts[n - 2], y: l.pts[n - 1] }; };
const startDir = (l: Lane): Pt => norm(sub({ x: l.pts[2], y: l.pts[3] }, startPt(l)));
const endDir = (l: Lane): Pt => { const n = l.pts.length; return norm(sub(endPt(l), { x: l.pts[n - 4], y: l.pts[n - 3] })); };
const link = (a: Lane, b: Lane) => { a.next.push(b.id); b.prev.push(a.id); };
/** a connector's speed limit: sqrt(3 r) for its tightest radius r (k = 2 at a widened-turns node: the same radius counts double), within [3, cap] */
const connVmax = (P: Pt[], cap: number, k = 1) => clamp(Math.sqrt(3 * k * minRadius(P)), 3, cap);

/** the inset from a node centre where a link lane stops or starts at this arm, tiles */
function inset(n: Node, a: Arm | undefined): number {
  if (!a) return 0;
  if (n.rb > 0) return n.rb + 0.6;
  const m = n.arms.length;
  if (m >= 3) return a.stop >= 0 ? a.stop : a.xw >= 0 ? a.xw + 1.6 : a.reachEdge + 0.3;
  if (m === 2) {
    const b = n.arms[0] === a ? n.arms[1] : n.arms[0], d = dot(a.dir, b.dir);
    // straight on; where the class (and so the lane offsets) changes, a 4-tile taper each side so the lanes shift gently
    if (d < -0.996) return a.cls !== b.cls ? 4 : 0.25;
    // a bend: the lanes stop where a curve of radius r (3 tiles, or the widest lane offset of the two arms plus 1.5) leaves each arm, so the inner
    // lanes keep a curve (at 3 tiles an arterial's inner lanes, 3 off the centre line, ended and started on one point at a right angle: a
    // connector of length 0; a six-lane's crossed over. The road builder's stress test, 2026-10-19)
    const off = (x: Arm) => Math.max(...x.cls.laneCentres.map(Math.abs)), r = Math.max(3, Math.max(off(a), off(b)) + 1.5);
    return Math.max(0.25, r * Math.tan((Math.PI - Math.acos(clamp(d, -1, 1))) / 2));
  }
  return 0;
}
/** a slip node's right-turn plan: each planned right turn (in arm, out arm) with the tangent points where the in arm's link lanes end (inT)
 *  and the out arm's start (outT), tiles from the node; pairs in arm order. Empty unless the node is a plain slip of three or more arms */
interface SlipPlan { inT: Map<Arm, number>; outT: Map<Arm, number>; pairs: [Arm, Arm][] }
const NO_PLAN: SlipPlan = { inT: new Map(), outT: new Map(), pairs: [] };
function slipPlan(n: Node): SlipPlan {
  const k = n.arms.length;
  if (n.type !== 'slip' || n.rb > 0 || k < 3) return NO_PLAN;
  const p: SlipPlan = { inT: new Map(), outT: new Map(), pairs: [] };
  for (let i = 0; i < k; i++) {
    const A = n.arms[i]!, B = n.arms[(i + 1) % k]!, g = slipCorner(n, A, B);
    if (!g) continue;
    const pr: [Arm, Arm] | null = turnOf(mul(A.dir, -1), B.dir) === 'R' ? [A, B] : turnOf(mul(B.dir, -1), A.dir) === 'R' ? [B, A] : null;
    if (!pr) continue;
    const [inA, outA] = pr, tIn = dot(sub(g.Q, n), inA.dir), tOut = dot(sub(g.Q, n), outA.dir);
    if (!(tIn > inset(n, inA) + 2 && tOut > inset(n, outA) + 2)) continue;
    p.inT.set(inA, Math.max(p.inT.get(inA) ?? 0, tIn)); p.outT.set(outA, Math.max(p.outT.get(outA) ?? 0, tOut)); p.pairs.push([inA, outA]);
  }
  return p;
}
/** the inset where a dseg's link lanes reach node n's arm a (inbound: the in inset, else the out inset): a planned slip's tangent point, else the plain inset */
function endInset(n: Node, a: Arm | undefined, inbound: boolean): number {
  if (!a) return 0;
  const p = slipPlan(n); return (inbound ? p.inT : p.outT).get(a) ?? inset(n, a);
}
/** the insets of a dseg from node `from` (its out inset) and into node `to` (its in inset), tiles, each at most 0.45 of the seg's length */
function dsegInsets(s: Seg, from: Node, to: Node): [number, number] {
  const m = 0.45 * (vlen(sub(s.b, s.a)) || 1);
  return [Math.min(endInset(from, armOf(from, s), false), m), Math.min(endInset(to, armOf(to, s), true), m)];
}
/** sampled cubic from P0 (leaving along h0) to P1 (arriving along h1): 9 points; a U-turn is at least 1.5 tiles across */
function bezier(P0: Pt, h0: Pt, P1: Pt, h1: Pt, uturn: boolean): Pt[] {
  const phi = Math.abs(Math.atan2(cross(h0, h1), dot(h0, h1))), D = sub(P1, P0), den = cross(h0, h1);
  const t = Math.abs(den) > 1e-9 ? cross(D, h1) / den : -1, s = Math.abs(den) > 1e-9 ? cross(h0, D) / den : -1;
  let c1: Pt, c2: Pt;
  if (phi >= 0.1 && t > 0 && s > 0) {
    const k = (4 / 3) * Math.tan(phi / 4) / Math.tan(phi / 2);
    c1 = add(P0, mul(h0, t * k)); c2 = sub(P1, mul(h1, s * k));
  } else {
    const d = uturn ? Math.max(vlen(D), 1.5) : vlen(D);
    c1 = add(P0, mul(h0, d / 3)); c2 = sub(P1, mul(h1, d / 3));
  }
  const out: Pt[] = [];
  for (let i = 0; i <= 8; i++) {
    const u = i / 8, v = 1 - u, a = v * v * v, b = 3 * v * v * u, c = 3 * v * u * u, e = u * u * u;
    out.push({ x: a * P0.x + b * c1.x + c * c2.x + e * P1.x, y: a * P0.y + b * c1.y + c * c2.y + e * P1.y });
  }
  return out;
}
/** the tightest circumradius over consecutive point triples, metres (Infinity when straight) */
function minRadius(P: Pt[]): number {
  let r = Infinity;
  for (let i = 0; i + 2 < P.length; i++) {
    const a = P[i], b = P[i + 1], c = P[i + 2], area2 = Math.abs(cross(sub(b, a), sub(c, a)));
    if (area2 < 1e-12) continue;
    r = Math.min(r, vlen(sub(b, a)) * vlen(sub(c, b)) * vlen(sub(c, a)) / (2 * area2) * MPT);
  }
  return r;
}
/** turn type from the in heading to the out heading (positive cross = toward the right in tile space) */
function turnOf(hin: Pt, hout: Pt): Turn {
  const ang = Math.atan2(cross(hin, hout), dot(hin, hout));
  return Math.abs(ang) > 2.7 ? 'U' : ang > 0.35 ? 'R' : ang < -0.35 ? 'L' : 'S';
}
/** the arms that are the major road of a plain junction: the opposed pair with the highest class sum, else the two highest classes */
function majorArms(io: ArmIO[]): boolean[] {
  const M = io.length;
  let bi = -1, bj = -1, bs = -Infinity, bd = 0;
  for (let i = 0; i < M; i++) for (let j = i + 1; j < M; j++) {
    const d = dot(io[i].a.dir, io[j].a.dir);
    if (d >= -0.7) continue;
    const s = io[i].a.cls.order + io[j].a.cls.order;
    if (s > bs || (s === bs && d < bd)) { bi = i; bj = j; bs = s; bd = d; }
  }
  if (bi < 0) { const ord = io.map((_, i) => i).sort((p, q) => io[q].a.cls.order - io[p].a.cls.order || p - q); bi = ord[0]; bj = ord[1]; }
  return io.map((_, i) => i === bi || i === bj);
}
/** the first crossing of two lanes' polylines as metres along each; hits at both starts or both ends (within 0.5 m) are ignored */
function crossing(A: Lane, B: Lane): [number, number] | null {
  let best: [number, number] | null = null, bs = Infinity;
  const pa = A.pts, pb = B.pts, na = pa.length / 2 - 1, nb = pb.length / 2 - 1;
  for (let i = 0; i < na; i++) {
    const px = pa[2 * i], py = pa[2 * i + 1], rx = pa[2 * i + 2] - px, ry = pa[2 * i + 3] - py;
    for (let j = 0; j < nb; j++) {
      const qx = pb[2 * j], qy = pb[2 * j + 1], sx = pb[2 * j + 2] - qx, sy = pb[2 * j + 3] - qy;
      const den = rx * sy - ry * sx;
      if (Math.abs(den) < 1e-12) continue;
      const wx = qx - px, wy = qy - py, t = (wx * sy - wy * sx) / den, u = (wx * ry - wy * rx) / den;
      if (t < 0 || t > 1 || u < 0 || u > 1) continue;
      const sa = A.cum[i] + t * (A.cum[i + 1] - A.cum[i]), sb = B.cum[j] + u * (B.cum[j + 1] - B.cum[j]);
      if ((sa < 0.5 && sb < 0.5) || (A.len - sa < 0.5 && B.len - sb < 0.5)) continue;
      if (sa < bs) { bs = sa; best = [sa, sb]; }
    }
  }
  return best;
}

/** The lane graph of a road network. Call update() after every RoadNetwork.rebuild. */
export class LaneGraph {
  lanes: (Lane | null)[] = []; dsegs: (DSeg | null)[] = []; moves: (Movement | null)[] = [];
  signals = new Map<Node, SignalPlan>(); version = 0;
  /** lane ids freed by the last update and not reused */
  removed: number[] = [];
  /** lane ids rebuilt, reused or new in the last update */
  changed: number[] = [];
  /** the toll gates' booths by inbound dseg key (setTolls); a dseg with a key here is a toll dseg when its seg qualifies (tollBooths) */
  tolls = new Map<string, number>();
  /** the dseg keys whose kerb lane is on-street parking (setCurbs): their outermost lane is not built */
  curbs = new Set<string>();
  private segDs = new Map<Seg, [number, number]>();
  private nodeLanes = new Map<Node, number[]>();
  private nodeMoves = new Map<Node, number[]>();
  private freeL: number[] = []; private freeD: number[] = []; private freeM: number[] = [];
  /** ids of objects deleted in this update, by key, until a new object takes the key or the id is freed */
  private deadL = new Map<string, number>(); private deadD = new Map<string, number>(); private deadM = new Map<string, number>();

  /** after RoadNetwork.rebuild: rebuild the lanes, movements and signal plans of the edited area */
  update(net: RoadNetwork) {
    this.version++; this.removed = []; this.changed = [];
    const A = new Set<Node>();
    // a new speed-limit tier: every lane is built again at its new limit
    const respeed = this.speed !== net.speedTier; this.speed = net.speedTier;
    // 1. purge what is gone
    for (const [s, ids] of this.segDs) if (!net.segs.has(s)) { for (const n of [s.a, s.b]) if (isLive(net, n)) A.add(n); this.dropSeg(s, ids); }
    for (const n of new Set<Node>([...this.nodeLanes.keys(), ...this.nodeMoves.keys(), ...this.signals.keys()])) if (!isLive(net, n)) this.dropNode(n);
    // 2. the nodes to re-analyse
    if (net.lastFull || respeed || this.segDs.size === 0) { for (const n of net.nodes.values()) if (isLive(net, n)) A.add(n); }
    else for (const n of net.lastNodes) if (isLive(net, n)) A.add(n);
    // 3. directed segs and link lanes of the segs between re-analysed nodes (and new segs); 4. the node lanes, and 5. the ids freed
    const S: Seg[] = [];
    for (const s of net.segs) if ((A.has(s.a) && A.has(s.b)) || !this.segDs.has(s)) S.push(s);
    this.rebuildArea(A, S);
  }
  /** the speed-limit tier the lanes were built at (see speedOf) */
  private speed: SpeedTier = 0;

  /** the toll gates as the player placed them (defs, the full list; the graph keeps the map, so later updates build the booths too):
   *  the segs whose toll changed (added, removed or the booths changed) and their end nodes are rebuilt as update() rebuilds edited ones.
   *  Returns false if no toll changed */
  setTolls(defs: TollDef[], net: RoadNetwork): boolean {
    const next = new Map<string, number>();
    for (const d of defs) next.set(plazaKey(d), d.booths);
    const diff = new Set<string>();
    for (const [k, b] of next) if (this.tolls.get(k) !== b) diff.add(k);
    for (const k of this.tolls.keys()) if (!next.has(k)) diff.add(k);
    this.tolls = next;
    if (!diff.size) return false;
    this.version++; this.removed = []; this.changed = [];
    const A = new Set<Node>(), S: Seg[] = [];
    for (const [s, ids] of this.segDs) {
      if (!ids.some(id => { const d = this.dsegs[id]; return !!d && diff.has(d.key); })) continue;
      S.push(s); for (const n of [s.a, s.b]) if (isLive(net, n)) A.add(n);
    }
    this.rebuildArea(A, S);
    return true;
  }

  /** the on-street parking kerbs as the player placed them (keys: the directed seg keys of the parked runs, the full list; the graph keeps the set, so
   *  later updates build the curbs too): the segs whose kerb changed and their end nodes are rebuilt as setTolls rebuilds them. Returns false if none changed */
  setCurbs(keys: string[], net: RoadNetwork): boolean {
    const next = new Set(keys), diff = new Set<string>();
    for (const k of next) if (!this.curbs.has(k)) diff.add(k);
    for (const k of this.curbs) if (!next.has(k)) diff.add(k);
    this.curbs = next;
    if (!diff.size) return false;
    this.version++; this.removed = []; this.changed = [];
    const A = new Set<Node>(), S: Seg[] = [];
    for (const [s, ids] of this.segDs) {
      if (!ids.some(id => { const d = this.dsegs[id]; return !!d && diff.has(d.key); })) continue;
      S.push(s); for (const n of [s.a, s.b]) if (isLive(net, n)) A.add(n);
    }
    this.rebuildArea(A, S);
    return true;
  }

  /** rebuilds the segs S (both directed segs and their link lanes), then the nodes A (connectors, movements, signal plans), then frees the
   *  ids whose keys did not come back */
  private rebuildArea(A: Set<Node>, S: Seg[]) {
    for (const s of S) { const ids = this.segDs.get(s); if (ids) this.dropSeg(s, ids); this.buildSeg(s); }
    for (const n of A) this.buildNode(n);
    for (const id of this.deadL.values()) { this.freeL.push(id); this.removed.push(id); }
    for (const id of this.deadD.values()) this.freeD.push(id);
    for (const id of this.deadM.values()) this.freeM.push(id);
    this.deadL.clear(); this.deadD.clear(); this.deadM.clear();
  }

  private alloc<T>(dead: Map<string, number>, free: number[], list: (T | null)[], key: string): number {
    const d = dead.get(key); if (d !== undefined) { dead.delete(key); return d; }
    if (free.length) return free.pop()!;
    list.push(null); return list.length - 1;
  }
  private L(id: number): Lane { return this.lanes[id]!; }
  private uOf(id: number): Pt { const d = this.dsegs[id]!; return norm(sub(d.to, d.from)); }

  private mkLane(key: string, kind: LaneKind, P: Pt[], vmax: number, node: Node | null, tunnel: boolean, dseg = -1, idx = -1): Lane {
    const id = this.alloc(this.deadL, this.freeL, this.lanes, key);
    const pts = new Float64Array(P.length * 2), cum = new Float64Array(P.length);
    for (let i = 0; i < P.length; i++) { pts[2 * i] = P[i].x; pts[2 * i + 1] = P[i].y; if (i) cum[i] = cum[i - 1] + vlen(sub(P[i], P[i - 1])) * MPT; }
    const l: Lane = { id, kind, key, pts, cum, len: cum[P.length - 1], vmax, next: [], prev: [], dseg, idx, left: -1, right: -1, node, conflicts: [], ctl: CTL.FREE, prio: 0, phase: -1, tunnel };
    this.lanes[id] = l; this.changed.push(id);
    return l;
  }
  private killLane(id: number) {
    const l = this.lanes[id]; if (!l) return;
    for (const n of l.next) { const o = this.lanes[n]; if (o) o.prev = o.prev.filter(x => x !== id); }
    for (const p of l.prev) { const o = this.lanes[p]; if (o) o.next = o.next.filter(x => x !== id); }
    for (const c of l.conflicts) { const o = this.lanes[c.lane]; if (o) o.conflicts = o.conflicts.filter(x => x.lane !== id); }
    this.lanes[id] = null; this.deadL.set(l.key, id);
  }
  private killDseg(id: number) {
    const d = this.dsegs[id]; if (!d) return;
    for (const l of d.lanes) this.killLane(l);
    this.dsegs[id] = null; this.deadD.set(d.key, id);
  }
  private killMove(id: number) {
    const m = this.moves[id]; if (!m) return;
    const f = this.dsegs[m.from]; if (f) f.out = f.out.filter(x => x !== id);
    this.moves[id] = null; this.deadM.set(m.key, id);
  }
  private dropSeg(s: Seg, ids: [number, number]) { this.killDseg(ids[0]); this.killDseg(ids[1]); this.segDs.delete(s); }
  private dropNode(n: Node) {
    for (const id of this.nodeLanes.get(n) ?? []) this.killLane(id);
    for (const id of this.nodeMoves.get(n) ?? []) this.killMove(id);
    this.nodeLanes.delete(n); this.nodeMoves.delete(n); this.signals.delete(n);
  }

  /** both directed segs of a seg, with their link lanes (dir 0 = a to b, dir 1 = b to a) */
  private buildSeg(s: Seg) { this.segDs.set(s, [this.makeDseg(s, 0), this.makeDseg(s, 1)]); }
  private makeDseg(s: Seg, dir: 0 | 1): number {
    const from = dir ? s.b : s.a, to = dir ? s.a : s.b, key = `${keyOf(from)}>${keyOf(to)}`;
    const id = this.alloc(this.deadD, this.freeD, this.dsegs, key);
    const u = norm(sub(to, from)), r = perp(u), [iF, iT] = dsegInsets(s, from, to), lanes: number[] = [];
    const d: DSeg = { id, key, seg: s, dir, from, to, lanes, len: 0, vmax: speedOf(s.cls, this.speed), out: [] };
    this.dsegs[id] = d;
    // a one-way seg runs a to b only: its b to a dseg is kept (segDs stays a pair) but has no lanes, booths or movements
    const none = s.cls.oneway && dir === 1;
    const booths = none ? 0 : this.tollBooths(key, s, from, to, iF + iT);
    if (booths) { d.toll = booths; this.boothLanes(d, s, booths, iF, iT, u, r); }
    else if (!none) for (let k = 0; k < s.cls.laneCentres.length - (this.curbs.has(key) && s.cls.laneCentres.length >= 2 ? 1 : 0); k++) {
      const off = laneOff(s, k);
      const p0 = add(add(from, mul(u, iF)), mul(r, off)), p1 = add(sub(to, mul(u, iT)), mul(r, off));
      lanes.push(this.mkLane(`${key}#${k}`, LK.LINK, [p0, p1], d.vmax, null, s.kind === SK.TUNNEL, id, k).id);
    }
    d.len = lanes.length ? this.L(lanes[0]).len : 0;
    lanes.forEach((lid, k) => { const l = this.L(lid); l.left = k > 0 ? lanes[k - 1] : -1; l.right = k < lanes.length - 1 ? lanes[k + 1] : -1; });
    return id;
  }

  /** the booths of the toll gate on this directed seg (0 if it is not one): a tolled key on a straight ground seg of PLAZA_LEN - 1 tiles or more,
   *  with room for the taper and plain two-arm ends (a junction at either end is not a toll; the def is ignored) */
  private tollBooths(key: string, s: Seg, from: Node, to: Node, ins: number): number {
    const b = this.tolls.get(key), L = vlen(sub(s.b, s.a));
    if (!b || s.kind !== SK.GROUND || L < PLAZA_LEN - 1 || L - ins <= 2 * TAPER) return 0;
    if (from.rb > 0 || to.rb > 0 || from.arms.length !== 2 || to.arms.length !== 2) return 0;
    return b;
  }
  /** a toll dseg's booth lanes (LINK, n of them, pushed onto d.lanes): booth k starts at lane 0's start, fans out over TAPER tiles to its offset
   *  (BOOTH_W apart from lane 0, the innermost), runs straight, fans back in over the last TAPER tiles to lane 0's end; its booth line is at the
   *  middle of the straight part, metres along the lane */
  private boothLanes(d: DSeg, s: Seg, n: number, iF: number, iT: number, u: Pt, r: Pt) {
    const from = d.from, L = vlen(sub(s.b, s.a)), off0 = laneOff(s, 0), a0 = iF, a1 = L - iT, mid = (a0 + a1) / 2;
    const at = (t: number, o: number): Pt => add(add(from, mul(u, t)), mul(r, o));
    const ease = (t: number) => 0.5 - 0.5 * Math.cos(Math.PI * t);
    for (let k = 0; k < n; k++) {
      const offK = off0 + BOOTH_W * k, P: Pt[] = [];
      for (let i = 0; i <= 8; i++) P.push(at(a0 + TAPER * i / 8, off0 + (offK - off0) * ease(i / 8)));
      for (let i = 0; i <= 8; i++) P.push(at(a1 - TAPER + TAPER * i / 8, offK + (off0 - offK) * ease(i / 8)));
      const l = this.mkLane(`${d.key}#b${k}`, LK.LINK, P, d.vmax, null, false, d.id, k);
      // point 8 ends the fan-out; the straight part runs from there to the fan-in, and the middle of it is the booth line
      l.booth = l.cum[8]! + (mid - (a0 + TAPER)) * MPT;
      d.lanes.push(l.id);
    }
  }
  /** rebuild one node: its connectors, arcs, movements and signal plan; the link lanes around it are re-linked */
  private buildNode(n: Node) {
    for (const id of this.nodeLanes.get(n) ?? []) this.killLane(id);
    for (const id of this.nodeMoves.get(n) ?? []) this.killMove(id);
    this.signals.delete(n);
    const io: ArmIO[] = n.arms.map((a, i) => { const ids = this.segDs.get(a.seg)!, fwd = a.seg.a === n; return { a, i, inD: fwd ? ids[1] : ids[0], outD: fwd ? ids[0] : ids[1] }; });
    for (const x of io) {
      this.dsegs[x.inD]!.out = [];
      for (const id of this.dsegs[x.inD]!.lanes) this.L(id).next = [];
      for (const id of this.dsegs[x.outD]!.lanes) this.L(id).prev = [];
    }
    const nl: number[] = [], mv: number[] = [];
    if (n.rb > 0) this.ring(n, io, nl, mv);
    else if (io.length === 1) this.deadEnd(io, nl, mv, n);
    else if (io.length === 2) this.twoArms(io, nl, mv, n);
    else this.junction(n, io, nl, mv);
    this.conflicts(nl);
    this.nodeLanes.set(n, nl); this.nodeMoves.set(n, mv);
  }
  /** a connector from the end of inL to the start of outL */
  private conn(n: Node, inL: Lane, outL: Lane, uturn: boolean, nl: number[]): Lane {
    const P = bezier(endPt(inL), endDir(inL), startPt(outL), startDir(outL), uturn);
    const c = this.mkLane(`C${inL.key}|${outL.key}`, LK.CONN, P, connVmax(P, Math.min(inL.vmax, outL.vmax), n.wide ? 2 : 1), n, inL.tunnel || outL.tunnel);
    c.prio = 3; link(inL, c); link(c, outL); nl.push(c.id);
    return c;
  }
  private move(n: Node, from: number, to: number, turn: Turn, paths: number[][], mv: number[]) {
    const F = this.dsegs[from]!, T = this.dsegs[to]!, key = `${F.key}|${T.key}`;
    const id = this.alloc(this.deadM, this.freeM, this.moves, key);
    const len = Math.max(...paths.map(p => p.reduce((s, l) => s + this.L(l).len, 0)));
    this.moves[id] = { id, key, node: n, from, to, turn, paths, len };
    F.out.push(id); mv.push(id);
  }
  private deadEnd(io: ArmIO[], nl: number[], mv: number[], n: Node) {
    for (const x of io) {
      const ins = this.dsegs[x.inD]!.lanes, outs = this.dsegs[x.outD]!.lanes, paths: number[][] = [];
      if (!ins.length || !outs.length) continue;
      for (let k = 0; k < ins.length; k++) {
        const inL = this.L(ins[k]), outL = this.L(outs[Math.min(k, outs.length - 1)]), c = this.conn(n, inL, outL, true, nl);
        paths.push([inL.id, c.id, outL.id]);
      }
      this.move(n, x.inD, x.outD, 'U', paths, mv);
    }
  }
  private twoArms(io: ArmIO[], nl: number[], mv: number[], n: Node) {
    for (const x of io) {
      const y = io[x.i === 0 ? 1 : 0], ins = this.dsegs[x.inD]!.lanes, outs = this.dsegs[y.outD]!.lanes, paths: number[][] = [];
      if (!ins.length || !outs.length) continue;
      const t = turnOf(this.uOf(x.inD), this.uOf(y.outD)), tt: Turn = t === 'U' ? 'S' : t;
      // a toll gate ahead: every in lane to every booth (one connector each); out of a toll gate: every booth lane to the next dseg's lane 0
      if (this.dsegs[y.outD]!.toll) {
        for (const ik of ins) for (const ok of outs) { const inL = this.L(ik), outL = this.L(ok), c = this.conn(n, inL, outL, false, nl); paths.push([inL.id, c.id, outL.id]); }
      } else if (this.dsegs[x.inD]!.toll) {
        // booth k exits to lane floor(k * nOut / booths) of the next dseg: the booths spread over the out road's lanes (one lane: all merge)
        for (let k = 0; k < ins.length; k++) {
          const inL = this.L(ins[k]), outL = this.L(outs[Math.min(outs.length - 1, Math.floor(k * outs.length / ins.length))]), c = this.conn(n, inL, outL, false, nl);
          paths.push([inL.id, c.id, outL.id]);
        }
      } else for (let k = 0; k < ins.length; k++) {
        const inL = this.L(ins[k]), outL = this.L(outs[Math.min(k, outs.length - 1)]), c = this.conn(n, inL, outL, false, nl);
        paths.push([inL.id, c.id, outL.id]);
      }
      this.move(n, x.inD, y.outD, tt, paths, mv);
    }
  }
  /** a junction of three or more arms, not a roundabout: signals, or priorities at a plain node */
  private junction(n: Node, io: ArmIO[], nl: number[], mv: number[]) {
    const M = io.length, sig = n.type === 'signal' || n.type === 'slip', stop = n.type === 'stop', major = sig || stop ? [] : majorArms(io);
    let minorCtl: number = CTL.YIELD;
    if (!sig && !stop) { let hi = 0; for (const x of io) if (major[x.i]) hi = Math.max(hi, x.a.cls.order); minorCtl = hi >= 2 ? CTL.STOP : CTL.YIELD; }
    const armPhase = new Array<number>(M).fill(-1);
    // an arm with no inbound lanes (a one-way road running out) gets no phase: its signals never go green
    const hasIn = io.map(x => this.dsegs[x.inD]!.lanes.length > 0);
    let phases = 0, sp: SignalPlan | null = null;
    if (sig) {
      for (let i = 0; i < M; i++) {
        if (armPhase[i] >= 0 || !hasIn[i]) continue;
        let j = i + 1;
        while (j < M && (armPhase[j] >= 0 || !hasIn[j] || dot(io[i].a.dir, io[j].a.dir) >= -0.7)) j++;
        armPhase[i] = phases; if (j < M) armPhase[j] = phases; phases++;
      }
    }
    if (sig && phases) {
      const green = 18;
      sp = { node: n, mode: n.sig ?? 1, armPhase, phases, green, greens: Array.from({ length: phases }, (_, k) => n.split?.[k] !== undefined ? Math.min(GREEN_CAP, Math.max(MIN_GREEN, n.split[k]!)) : green),
        amber: 3, allRed: 2, offset: Math.abs(n.x * 7 + n.y * 13) % (phases * 23), idx: 0, stage: 0, el: 0, phaseLanes: Array.from({ length: phases }, () => []) };
      this.signals.set(n, sp);
    }
    // a planned slip (slipPlan): an approach lane (flare 1) on each inbound link lane that reaches past its stop line, a departure lane (flare 2)
    // on each outbound one that starts past it; the connectors run between them
    const plan = slipPlan(n), apr = new Map<number, Lane>(), dep = new Map<number, Lane>();
    if (plan.pairs.length) {
      for (const x of io) {
        const stop = inset(n, x.a);
        for (const id of this.dsegs[x.inD]!.lanes) {
          const inL = this.L(id), e = endPt(inL), tEnd = dot(sub(e, n), x.a.dir);
          if (tEnd - stop < 0.5) continue;
          const ap = this.mkLane(`A${inL.key}`, LK.CONN, [e, add(e, mul(endDir(inL), tEnd - stop))], inL.vmax, n, inL.tunnel);
          ap.flare = 1; ap.prio = 3; link(inL, ap); nl.push(ap.id); apr.set(inL.id, ap);
        }
        for (const id of this.dsegs[x.outD]!.lanes) {
          const outL = this.L(id), s0 = startPt(outL), tStart = dot(sub(s0, n), x.a.dir);
          if (tStart - stop < 0.5) continue;
          const dp = this.mkLane(`D${outL.key}`, LK.CONN, [add(s0, mul(startDir(outL), stop - tStart)), s0], outL.vmax, n, outL.tunnel);
          dp.flare = 2; dp.prio = 3; link(dp, outL); nl.push(dp.id); dep.set(outL.id, dp);
        }
      }
    }
    for (const x of io) for (const y of io) {
      if (x.i === y.i) continue;
      const t = turnOf(this.uOf(x.inD), this.uOf(y.outD));
      if (t === 'U') continue;
      const ins = this.dsegs[x.inD]!.lanes, outs = this.dsegs[y.outD]!.lanes, nIn = ins.length, nOut = outs.length, paths: number[][] = [];
      if (!nIn || !nOut) continue;
      const planned = t === 'R' && plan.pairs.some(([a, b]) => a === x.a && b === y.a);
      for (let k = 0; k < nIn; k++) {
        // turn lanes (n.tl): lane 0 is for the left turns only; straight on from the other lanes, right from the last one
        if (nIn > 1 && ((t === 'L' && k !== 0) || (t === 'R' && k !== nIn - 1) || (n.tl && t === 'S' && k === 0))) continue;
        const inL = this.L(ins[k]), outL = this.L(outs[t === 'L' ? 0 : t === 'R' ? nOut - 1 : Math.min(k, nOut - 1)]);
        if (planned) {
          // a planned slip right turn: from the link lane through the slip body (flare 1, free) and its mouth (yields to the merge), to the link lane
          const P = bezier(endPt(inL), endDir(inL), startPt(outL), startDir(outL), false), vm = connVmax(P, Math.min(inL.vmax, outL.vmax)), tn = inL.tunnel || outL.tunnel;
          const body = this.mkLane(`S${inL.key}|${outL.key}`, LK.CONN, P.slice(0, 7), vm, n, tn), mouth = this.mkLane(`M${inL.key}|${outL.key}`, LK.CONN, P.slice(6), vm, n, tn);
          body.flare = 1; body.prio = 3; mouth.ctl = CTL.YIELD; mouth.prio = 1;
          link(inL, body); link(body, mouth); link(mouth, outL); nl.push(body.id, mouth.id);
          paths.push([inL.id, body.id, mouth.id, outL.id]); continue;
        }
        // the connector starts at the in lane's approach lane and ends at the out lane's departure lane, where the node has them
        const aL = apr.get(inL.id), dL = dep.get(outL.id);
        const c = this.conn(n, aL ?? inL, dL ?? outL, false, nl);
        if (sig) {
          c.ctl = CTL.SIGNAL; c.phase = armPhase[x.i]; c.prio = t === 'L' ? 2 : 3;
          // a right turn at a slipway corner too short for a plan yields from the stop line; at an off corner it is an ordinary signal connector
          if (t === 'R' && slipOn(n, x.a, y.a)) { c.ctl = CTL.YIELD; c.phase = -1; c.prio = 1; }
          if (sp && c.ctl === CTL.SIGNAL) { const pl = sp.phaseLanes[c.phase]!, f = (aL ?? inL).id; if (!pl.includes(f)) pl.push(f); }
        } else if (stop) { c.ctl = CTL.STOP; c.prio = 1; }
        else if (major[x.i]) { c.ctl = CTL.FREE; c.prio = t === 'L' ? 2 : 3; }
        else { c.ctl = minorCtl; c.prio = t === 'R' ? 1 : 0; }
        paths.push([inL.id, ...(aL ? [aL.id] : []), c.id, ...(dL ? [dL.id] : []), outL.id]);
      }
      if (paths.length) this.move(n, x.inD, y.outD, t, paths, mv);
    }
  }
  /** a roundabout of rl ring lanes (lane 0 the outer one), each with ring arcs (short and long per arm). Entries (yield): an approach lane
   *  enters the ring lane of its rank from the right (the rightmost to lane 0, the next to lane 1, clamped), and the leftmost lane also
   *  enters the innermost. Exits: from every ring lane to the exit road's lane of the same rank (an inner exit crosses the outer lanes,
   *  so it has prio 2 and gives way). Movements: the first exit (right) only from the outer lane, the last exit (left) and U-turns only
   *  from the innermost, straight on from any. (Lane by exit, as spiral markings, was tried 2026-10-19: it starved 2-lane rings and let an
   *  inner exit clip a car just in on the outer lane of a 3-lane ring.) With one ring lane every lane goes through lane 0, as before. */
  private ring(n: Node, io: ArmIO[], nl: number[], mv: number[]) {
    // a mini-roundabout has one ring lane, on a small circle inside the crossing (its island is MINI_ISLAND across)
    const mini = n.type === 'mini', M = io.length, RL = mini ? 1 : n.rl ?? 1, inner = RL - 1, o = keyOf(n), th = io.map(x => x.a.ang);
    const rcOf = (k: number) => mini ? MINI_ISLAND + 1.4 : n.rb - RB_LANE * (k + 0.5);
    const dl = io.map(x => Math.asin(Math.min(0.8, laneOff(x.a.seg, x.a.seg.cls.laneCentres.length - 1) / rcOf(0))) + 0.12);
    const ord = io.map((_, i) => i).sort((p, q) => th[q] - th[p]), pos = new Array<number>(M);
    ord.forEach((a, p) => { pos[a] = p; });
    const gap = (p: number) => { let g = th[ord[p]] - th[ord[(p + 1) % M]]; while (g <= 0) g += TAU; return g; };
    // arms too close for their arcs: shrink the arm ends (the short arc keeps at least 0.1 rad)
    for (let p = 0; p < M; p++) { const a = ord[p], b = ord[(p + 1) % M], g = gap(p); if (g - dl[a] - dl[b] < 0.1) { const v = Math.max(0.05, (g - 0.1) / 2); dl[a] = Math.min(dl[a], v); dl[b] = Math.min(dl[b], v); } }
    const at = (t: number, k: number): Pt => { const r = rcOf(k); return { x: n.x + r * Math.cos(t), y: n.y + r * Math.sin(t) }; };
    const tan = (t: number): Pt => ({ x: Math.sin(t), y: -Math.cos(t) });
    const arc = (a0: number, a1: number, k: number): Pt[] => { const seg = Math.max(1, Math.ceil(Math.abs(a1 - a0) / 0.25)), P: Pt[] = []; for (let j = 0; j <= seg; j++) P.push(at(a0 + (a1 - a0) * j / seg, k)); return P; };
    const rvOf = (k: number) => mini ? 6 : clamp(Math.sqrt(3 * rcOf(k) * MPT), 4, 11);
    // the ring arcs of each ring lane: sh[k][i] runs through arm i's mouth, lg[k][i] on to the next arm
    const sh: Lane[][] = [], lg: Lane[][] = [];
    for (let k = 0; k < RL; k++) {
      sh.push([]); lg.push([]);
      const sfx = k ? `:${k}` : '';
      for (let i = 0; i < M; i++) {
        const oth = keyOf(io[i].a.other), L = gap(pos[i]) - dl[i] - dl[ord[(pos[i] + 1) % M]];
        sh[k][i] = this.mkLane(`R${o}@${oth}:s${sfx}`, LK.RING, arc(th[i] + dl[i], th[i] - dl[i], k), rvOf(k), n, false);
        lg[k][i] = this.mkLane(`R${o}@${oth}:l${sfx}`, LK.RING, arc(th[i] - dl[i], th[i] - dl[i] - L, k), rvOf(k), n, false);
        sh[k][i].prio = 3; lg[k][i].prio = 3; nl.push(sh[k][i].id, lg[k][i].id);
      }
    }
    for (let k = 0; k < RL; k++) for (let i = 0; i < M; i++) { link(sh[k][i], lg[k][i]); link(lg[k][i], sh[k][ord[(pos[i] + 1) % M]]); }
    // entries: ent[i][k] lists [ring lane, entry lane] for approach lane k of arm i (k 0 the leftmost)
    const ent: [number, number][][][] = [];
    for (let i = 0; i < M; i++) {
      const ins = this.dsegs[io[i].inD]!.lanes, nIn = ins.length;
      ent.push([]);
      for (let k = 0; k < nIn; k++) {
        // an approach of two or more lanes per ring lane spreads evenly over the ring lanes (six into three: two each), so cars enter side by side
        // and a pair zips into each ring lane; clamped, four of six lanes fed the inner ring lane one car at a time (the owner, 2026-10-19)
        const inL = this.L(ins[k]!), nat = nIn >= 2 * RL && RL > 1 ? Math.min(inner, Math.floor((nIn - 1 - k) * RL / nIn)) : Math.min(nIn - 1 - k, inner), want = [nat];
        if (k === 0 && inner !== nat) want.push(inner);
        ent[i].push([]);
        for (const m of want) {
          const P = bezier(endPt(inL), endDir(inL), at(th[i] - dl[i], m), tan(th[i] - dl[i]), false);
          const e = this.mkLane(`E${inL.key}${m ? `:${m}` : ''}`, LK.CONN, P, connVmax(P, Math.min(inL.vmax, lg[m][i].vmax)), n, inL.tunnel);
          e.ctl = CTL.YIELD; e.prio = 0; link(inL, e); link(e, lg[m][i]); nl.push(e.id); ent[i][k]!.push([m, e.id]);
        }
      }
    }
    // exits: exX[m][j] the connector from ring lane m to arm j, exOut[m][j] the exit road's lane it joins (lane m from the outside, 0 at least)
    const exX: number[][] = [], exOut: number[][] = [];
    for (let m = 0; m < RL; m++) {
      exX.push([]); exOut.push([]);
      for (let j = 0; j < M; j++) {
        const outs = this.dsegs[io[j].outD]!.lanes;
        // an arm with no outbound lanes (a one-way road running in) has no exit connectors (-1 placeholders)
        if (!outs.length) { exX[m]!.push(-1); exOut[m]!.push(-1); continue; }
        const outL = this.L(outs[Math.max(0, outs.length - 1 - m)]!), t = th[j] + dl[j];
        const P = bezier(at(t, m), tan(t), startPt(outL), startDir(outL), false);
        const x = this.mkLane(`X${outL.key}${m ? `:${m}` : ''}`, LK.CONN, P, connVmax(P, Math.min(rvOf(m), outL.vmax)), n, outL.tunnel);
        x.prio = m ? 2 : 3; link(lg[m][ord[(pos[j] - 1 + M) % M]]!, x); link(x, outL); nl.push(x.id);
        exX[m]!.push(x.id); exOut[m]!.push(outL.id);
      }
    }
    // the movement's ring lanes for an approach lane's entries: right from lane 0 only, left and U-turns from the innermost, straight on any
    // lane use (as the painted arrows of real rings): 1-2 ring lanes: R outer, S any, L and U inner; 3 ring lanes: R outer, S outer and
    // middle, L middle and inner, U inner (every left turn on the inner lane saturated it in an event surge: the owner's 3-lane ring)
    const want = (cat: 'R' | 'L' | 'U' | 'S', list: [number, number][]) => list.filter(([m]) => RL < 3
      ? cat === 'S' || (cat === 'R' ? m === 0 : m === inner)
      : cat === 'R' ? m === 0 : cat === 'S' ? m <= 1 : cat === 'L' ? m >= 1 : m === inner);
    for (let i = 0; i < M; i++) for (let j = 0; j < M; j++) {
      const cat = i === j ? 'U' : j === ord[(pos[i] + 1) % M] ? 'R' : j === ord[(pos[i] - 1 + M) % M] ? 'L' : 'S';
      const ins = this.dsegs[io[i].inD]!.lanes, paths: number[][] = [];
      if (!ins.length || !this.dsegs[io[j].outD]!.lanes.length) continue;
      for (let k = 0; k < ins.length; k++) for (const [m, eid] of want(cat, ent[i][k]!)) {
        const path = [ins[k]!, eid, lg[m][i]!.id];
        for (let q = (pos[i] + 1) % M; ord[q] !== j; q = (q + 1) % M) path.push(sh[m][ord[q]]!.id, lg[m][ord[q]]!.id);
        path.push(exX[m]![j]!, exOut[m]![j]!);
        paths.push(path);
      }
      if (paths.length) this.move(n, io[i].inD, io[j].outD, i === j ? 'U' : turnOf(this.uOf(io[i].inD), this.uOf(io[j].outD)), paths, mv);
    }
  }
  /** conflicts between the connectors and arcs of one node: merges at a shared lane end, crossings elsewhere */
  private conflicts(nl: number[]) {
    for (let p = 0; p < nl.length; p++) for (let q = p + 1; q < nl.length; q++) {
      const A = this.L(nl[p]), B = this.L(nl[q]);
      // a lane and its successor meet at one point: that is not a crossing (a ring exit starts where its ring arc ends)
      if (A.next.includes(B.id) || B.next.includes(A.id)) continue;
      if (A.next.length === 1 && B.next.length === 1 && A.next[0] === B.next[0]) {
        A.conflicts.push({ lane: B.id, s: A.len, os: B.len, merge: true }); B.conflicts.push({ lane: A.id, s: B.len, os: A.len, merge: true });
        continue;
      }
      if (A.prev.some(id => B.prev.includes(id))) continue;
      const h = crossing(A, B);
      if (h) { A.conflicts.push({ lane: B.id, s: h[0], os: h[1], merge: false }); B.conflicts.push({ lane: A.id, s: h[1], os: h[0], merge: false }); }
    }
  }
}

/** a list of problems in the graph (empty = fine) */
export function checkGraph(g: LaneGraph): string[] {
  const out: string[] = [], L = g.lanes;
  for (const l of L) {
    if (!l) continue;
    if (!(l.len > 0)) out.push(`${l.key}: length ${l.len}`);
    if (l.pts.some(v => Number.isNaN(v))) out.push(`${l.key}: NaN point`);
    for (const n of l.next) {
      const o = L[n];
      if (!o) { out.push(`${l.key}: next ${n} missing`); continue; }
      if (!o.prev.includes(l.id)) out.push(`${l.key}: next ${o.key} not back-linked`);
      const gap = vlen(sub(endPt(l), startPt(o)));
      if (gap > 0.05) out.push(`${l.key}: ends ${gap.toFixed(3)} tiles from ${o.key}`);
    }
    for (const p of l.prev) { const o = L[p]; if (!o) out.push(`${l.key}: prev ${p} missing`); else if (!o.next.includes(l.id)) out.push(`${l.key}: prev ${o.key} not back-linked`); }
  }
  for (const m of g.moves) {
    if (!m) continue;
    for (const path of m.paths) for (let k = 0; k + 1 < path.length; k++) {
      const a = L[path[k]], b = L[path[k + 1]];
      if (!a || !b || !a.next.includes(b.id)) out.push(`${m.key}: ${a?.key} not linked to ${b?.key}`);
    }
  }
  for (const d of g.dsegs) {
    if (!d) continue;
    if (!d.lanes.length && !(d.seg.cls.oneway && d.dir === 1)) out.push(`${d.key}: no lanes`);
    for (const id of d.lanes) if (!L[id]) out.push(`${d.key}: lane ${id} missing`);
  }
  return out;
}

/** point (tiles) and unit heading at s metres along a lane (clamped), by binary search on cum; allocation free */
export function laneAt(l: Lane, s: number, out: { x: number; y: number; hx: number; hy: number }) {
  const c = l.cum, p = l.pts, n = c.length - 1, sc = s < 0 ? 0 : s > c[n] ? c[n] : s;
  let lo = 0, hi = n;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c[m] <= sc) lo = m; else hi = m; }
  const span = c[hi] - c[lo], f = span > 0 ? (sc - c[lo]) / span : 0;
  const ax = p[2 * lo], ay = p[2 * lo + 1], dx = p[2 * hi] - ax, dy = p[2 * hi + 1] - ay, dl = Math.hypot(dx, dy) || 1;
  out.x = ax + dx * f; out.y = ay + dy * f; out.hx = dx / dl; out.hy = dy / dl;
}

/** the link lane and metres along it nearest the point (x, y, tiles) over the whole graph (a scan: for the rare moves, such as a bus that
 *  lost its lane to an edit); null if there is no link lane */
export function nearestLink(g: LaneGraph, x: number, y: number): { id: number; s: number } | null {
  let best: { id: number; s: number } | null = null, bd = Infinity;
  for (const ln of g.lanes) {
    if (!ln || ln.kind !== LK.LINK) continue;
    const p = ln.pts, c = ln.cum;
    for (let k = 0; k + 1 < c.length; k++) {
      const ax = p[2 * k]!, ay = p[2 * k + 1]!, ex = p[2 * k + 2]! - ax, ey = p[2 * k + 3]! - ay, L2 = ex * ex + ey * ey;
      const t = L2 > 0 ? Math.min(1, Math.max(0, ((x - ax) * ex + (y - ay) * ey) / L2)) : 0;
      const px = ax + ex * t - x, py = ay + ey * t - y, d = px * px + py * py;
      if (d < bd) { bd = d; best = { id: ln.id, s: c[k]! + t * (c[k + 1]! - c[k]!) }; }
    }
  }
  return best;
}
