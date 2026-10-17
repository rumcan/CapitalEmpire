// The lane graph: directed lanes, junction connectors and movements derived from the road network. Pure TS, no DOM.
// Geometry is in tiles; lengths, s positions and speeds are in metres and m/s.
import { type Arm, type Node, type Pt, type RoadNetwork, type Seg, RB_LANE, SK, add, cross, dot, keyOf, mul, norm, perp, sub, vlen } from '../network';

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
}
/** a directed segment: one direction of a Seg */
export interface DSeg { id: number; key: string; seg: Seg; dir: 0 | 1; from: Node; to: Node; lanes: number[]; len: number; vmax: number; /** movements leaving its end */ out: number[] }
/** a way through a node from one dseg to another; paths[k] is a lane sequence [inLane, ...node lanes, outLane] */
export interface Movement { id: number; key: string; node: Node; from: number; to: number; turn: Turn; paths: number[][]; len: number }
/** fixed-time signal plan of a node: armPhase[i] = phase of arm i (node.arms order); times in seconds */
export interface SignalPlan { node: Node; armPhase: number[]; phases: number; green: number; amber: number; allRed: number; offset: number }

/** the arm of a node at one of its arms' directed segments */
interface ArmIO { a: Arm; i: number; inD: number; outD: number }

const TAU = Math.PI * 2;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const VMAX: Record<string, number> = { lane: 8, street: 11, road: 17, avenue: 14, boulevard: 17 };
const isLive = (net: RoadNetwork, n: Node) => n.segs.length > 0 && net.nodes.get(keyOf(n)) === n;
const armOf = (n: Node, s: Seg): Arm | undefined => n.arms.find(a => a.seg === s);
/** offset of lane k of a seg's class from the centre line, tiles (a single lane at [0] sits at 0.45) */
const laneOff = (s: Seg, k: number) => { const c = s.cls.laneCentres; return c.length === 1 && c[0] === 0 ? 0.45 : c[k]; };
const startPt = (l: Lane): Pt => ({ x: l.pts[0], y: l.pts[1] });
const endPt = (l: Lane): Pt => { const n = l.pts.length; return { x: l.pts[n - 2], y: l.pts[n - 1] }; };
const startDir = (l: Lane): Pt => norm(sub({ x: l.pts[2], y: l.pts[3] }, startPt(l)));
const endDir = (l: Lane): Pt => { const n = l.pts.length; return norm(sub(endPt(l), { x: l.pts[n - 4], y: l.pts[n - 3] })); };
const link = (a: Lane, b: Lane) => { a.next.push(b.id); b.prev.push(a.id); };
const connVmax = (P: Pt[], cap: number) => clamp(Math.sqrt(3 * minRadius(P)), 3, cap);

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
    return Math.max(0.25, 3 * Math.tan((Math.PI - Math.acos(clamp(d, -1, 1))) / 2));
  }
  return 0;
}
/** the insets at a seg's a end and b end, tiles, each at most 0.45 of the seg's length */
function segInsets(s: Seg): [number, number] {
  const m = 0.45 * (vlen(sub(s.b, s.a)) || 1);
  return [Math.min(inset(s.a, armOf(s.a, s)), m), Math.min(inset(s.b, armOf(s.b, s)), m)];
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
    // 1. purge what is gone
    for (const [s, ids] of this.segDs) if (!net.segs.has(s)) { for (const n of [s.a, s.b]) if (isLive(net, n)) A.add(n); this.dropSeg(s, ids); }
    for (const n of new Set<Node>([...this.nodeLanes.keys(), ...this.nodeMoves.keys(), ...this.signals.keys()])) if (!isLive(net, n)) this.dropNode(n);
    // 2. the nodes to re-analyse
    if (net.lastFull || this.segDs.size === 0) { for (const n of net.nodes.values()) if (isLive(net, n)) A.add(n); }
    else for (const n of net.lastNodes) if (isLive(net, n)) A.add(n);
    // 3. directed segs and link lanes of the segs between re-analysed nodes (and new segs)
    for (const s of net.segs) if ((A.has(s.a) && A.has(s.b)) || !this.segDs.has(s)) { const ids = this.segDs.get(s); if (ids) this.dropSeg(s, ids); this.buildSeg(s); }
    // 4. node lanes, movements and signal plans of the re-analysed nodes
    for (const n of A) this.buildNode(n);
    // 5. ids whose keys did not come back are free again
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
    const u = norm(sub(to, from)), r = perp(u), [ia, ib] = segInsets(s);
    const iF = dir ? ib : ia, iT = dir ? ia : ib, lanes: number[] = [];
    const d: DSeg = { id, key, seg: s, dir, from, to, lanes, len: 0, vmax: VMAX[s.cls.id], out: [] };
    this.dsegs[id] = d;
    for (let k = 0; k < s.cls.laneCentres.length; k++) {
      const off = laneOff(s, k);
      const p0 = add(add(from, mul(u, iF)), mul(r, off)), p1 = add(sub(to, mul(u, iT)), mul(r, off));
      lanes.push(this.mkLane(`${key}#${k}`, LK.LINK, [p0, p1], d.vmax, null, s.kind === SK.TUNNEL, id, k).id);
    }
    d.len = lanes.length ? this.L(lanes[0]).len : 0;
    lanes.forEach((lid, k) => { const l = this.L(lid); l.left = k > 0 ? lanes[k - 1] : -1; l.right = k < lanes.length - 1 ? lanes[k + 1] : -1; });
    return id;
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
    const c = this.mkLane(`C${inL.key}|${outL.key}`, LK.CONN, P, connVmax(P, Math.min(inL.vmax, outL.vmax)), n, inL.tunnel || outL.tunnel);
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
      const t = turnOf(this.uOf(x.inD), this.uOf(y.outD)), tt: Turn = t === 'U' ? 'S' : t;
      for (let k = 0; k < ins.length; k++) {
        const inL = this.L(ins[k]), outL = this.L(outs[Math.min(k, outs.length - 1)]), c = this.conn(n, inL, outL, false, nl);
        paths.push([inL.id, c.id, outL.id]);
      }
      this.move(n, x.inD, y.outD, tt, paths, mv);
    }
  }
  /** a junction of three or more arms, not a roundabout: signals, or priorities at a plain node */
  private junction(n: Node, io: ArmIO[], nl: number[], mv: number[]) {
    const M = io.length, sig = n.type === 'signal' || n.type === 'slip', major = sig ? [] : majorArms(io);
    let minorCtl: number = CTL.YIELD;
    if (!sig) { let hi = 0; for (const x of io) if (major[x.i]) hi = Math.max(hi, x.a.cls.order); minorCtl = hi >= 2 ? CTL.STOP : CTL.YIELD; }
    const armPhase = new Array<number>(M).fill(-1);
    let phases = 0;
    if (sig) {
      for (let i = 0; i < M; i++) {
        if (armPhase[i] >= 0) continue;
        let j = i + 1;
        while (j < M && (armPhase[j] >= 0 || dot(io[i].a.dir, io[j].a.dir) >= -0.7)) j++;
        armPhase[i] = phases; if (j < M) armPhase[j] = phases; phases++;
      }
      this.signals.set(n, { node: n, armPhase, phases, green: 18, amber: 3, allRed: 2, offset: Math.abs(n.x * 7 + n.y * 13) % (phases * 23) });
    }
    for (const x of io) for (const y of io) {
      if (x.i === y.i) continue;
      const t = turnOf(this.uOf(x.inD), this.uOf(y.outD));
      if (t === 'U') continue;
      const ins = this.dsegs[x.inD]!.lanes, outs = this.dsegs[y.outD]!.lanes, nIn = ins.length, nOut = outs.length, paths: number[][] = [];
      for (let k = 0; k < nIn; k++) {
        if (nIn > 1 && ((t === 'L' && k !== 0) || (t === 'R' && k !== nIn - 1))) continue;
        const inL = this.L(ins[k]), outL = this.L(outs[t === 'L' ? 0 : t === 'R' ? nOut - 1 : Math.min(k, nOut - 1)]);
        const c = this.conn(n, inL, outL, false, nl);
        if (sig) {
          c.ctl = CTL.SIGNAL; c.phase = armPhase[x.i]; c.prio = t === 'L' ? 2 : 3;
          if (n.type === 'slip' && t === 'R') { c.ctl = CTL.YIELD; c.phase = -1; c.prio = 1; }
        } else if (major[x.i]) { c.ctl = CTL.FREE; c.prio = t === 'L' ? 2 : 3; }
        else { c.ctl = minorCtl; c.prio = t === 'R' ? 1 : 0; }
        paths.push([inL.id, c.id, outL.id]);
      }
      if (paths.length) this.move(n, x.inD, y.outD, t, paths, mv);
    }
  }
  /** a roundabout: ring arcs (short and long per arm), entries (yield), exits, and a movement per arm pair */
  private ring(n: Node, io: ArmIO[], nl: number[], mv: number[]) {
    const M = io.length, rc = n.rb - RB_LANE / 2, th = io.map(x => x.a.ang);
    const dl = io.map(x => Math.asin(Math.min(0.8, laneOff(x.a.seg, x.a.seg.cls.laneCentres.length - 1) / rc)) + 0.12);
    const ord = io.map((_, i) => i).sort((p, q) => th[q] - th[p]), pos = new Array<number>(M);
    ord.forEach((a, p) => { pos[a] = p; });
    const gap = (p: number) => { let g = th[ord[p]] - th[ord[(p + 1) % M]]; while (g <= 0) g += TAU; return g; };
    // arms too close for their arcs: shrink the arm ends (the short arc keeps at least 0.1 rad)
    for (let p = 0; p < M; p++) { const a = ord[p], b = ord[(p + 1) % M], g = gap(p); if (g - dl[a] - dl[b] < 0.1) { const v = Math.max(0.05, (g - 0.1) / 2); dl[a] = Math.min(dl[a], v); dl[b] = Math.min(dl[b], v); } }
    const at = (t: number): Pt => ({ x: n.x + rc * Math.cos(t), y: n.y + rc * Math.sin(t) });
    const tan = (t: number): Pt => ({ x: Math.sin(t), y: -Math.cos(t) });
    const arc = (a0: number, a1: number): Pt[] => { const k = Math.max(1, Math.ceil(Math.abs(a1 - a0) / 0.25)), P: Pt[] = []; for (let j = 0; j <= k; j++) P.push(at(a0 + (a1 - a0) * j / k)); return P; };
    const rv = clamp(Math.sqrt(3 * rc * MPT), 4, 11), o = keyOf(n);
    const sh: Lane[] = [], lg: Lane[] = [], en: Pt[] = [], ex: Pt[] = [], entries: number[][] = [], exits: Lane[] = [];
    for (let i = 0; i < M; i++) {
      const oth = keyOf(io[i].a.other), nx = ord[(pos[i] + 1) % M], L = gap(pos[i]) - dl[i] - dl[nx];
      sh[i] = this.mkLane(`R${o}@${oth}:s`, LK.RING, arc(th[i] + dl[i], th[i] - dl[i]), rv, n, false);
      lg[i] = this.mkLane(`R${o}@${oth}:l`, LK.RING, arc(th[i] - dl[i], th[i] - dl[i] - L), rv, n, false);
      sh[i].prio = 3; lg[i].prio = 3; nl.push(sh[i].id, lg[i].id);
      en[i] = at(th[i] - dl[i]); ex[i] = at(th[i] + dl[i]);
    }
    for (let i = 0; i < M; i++) { link(sh[i], lg[i]); link(lg[i], sh[ord[(pos[i] + 1) % M]]); }
    for (let i = 0; i < M; i++) {
      entries[i] = [];
      for (const id of this.dsegs[io[i].inD]!.lanes) {
        const inL = this.L(id), P = bezier(endPt(inL), endDir(inL), en[i], tan(th[i] - dl[i]), false);
        const e = this.mkLane(`E${inL.key}`, LK.CONN, P, connVmax(P, Math.min(inL.vmax, lg[i].vmax)), n, inL.tunnel);
        e.ctl = CTL.YIELD; e.prio = 0; link(inL, e); link(e, lg[i]); nl.push(e.id); entries[i].push(e.id);
      }
    }
    for (let j = 0; j < M; j++) {
      const outs = this.dsegs[io[j].outD]!.lanes, outL = this.L(outs[outs.length - 1]);
      const P = bezier(ex[j], tan(th[j] + dl[j]), startPt(outL), startDir(outL), false);
      const x = this.mkLane(`X${outL.key}`, LK.CONN, P, connVmax(P, Math.min(rv, outL.vmax)), n, outL.tunnel);
      x.prio = 3; link(lg[ord[(pos[j] - 1 + M) % M]], x); link(x, outL); nl.push(x.id); exits[j] = x;
    }
    for (let i = 0; i < M; i++) for (let j = 0; j < M; j++) {
      const ins = this.dsegs[io[i].inD]!.lanes, outs = this.dsegs[io[j].outD]!.lanes, outL = outs[outs.length - 1], paths: number[][] = [];
      for (let k = 0; k < ins.length; k++) {
        const path = [ins[k], entries[i][k], lg[i].id];
        for (let q = (pos[i] + 1) % M; ord[q] !== j; q = (q + 1) % M) path.push(sh[ord[q]].id, lg[ord[q]].id);
        path.push(exits[j].id, outL);
        paths.push(path);
      }
      this.move(n, io[i].inD, io[j].outD, i === j ? 'U' : turnOf(this.uOf(io[i].inD), this.uOf(io[j].outD)), paths, mv);
    }
  }
  /** conflicts between the connectors and arcs of one node: merges at a shared lane end, crossings elsewhere */
  private conflicts(nl: number[]) {
    for (let p = 0; p < nl.length; p++) for (let q = p + 1; q < nl.length; q++) {
      const A = this.L(nl[p]), B = this.L(nl[q]);
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
    if (!d.lanes.length) out.push(`${d.key}: no lanes`);
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
