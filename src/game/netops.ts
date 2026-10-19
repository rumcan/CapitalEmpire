import type { NetOp } from './ground-protocol';
import { RoadNetwork, classOf, cross, dot, sub, vlen, type ClassId, type Leg, type Node, type NodeType, type PieceSel, type RoadClass, type Seg, type SegKind } from './network';
import type { LineStyle } from './types';

/** the ops that rebuild net from nothing: a worker that replays them holds the same network (the sim worker, a new ground worker) */
export function netToOps(net: RoadNetwork): NetOp[] {
  const ops: NetOp[] = [{ k: 'clear' }], groups = new Map<string, { cls: ClassId; style: LineStyle; legs: number[]; kinds: number[] }>();
  for (const s of net.segs) {
    const key = s.cls.id + '|' + s.style;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { cls: s.cls.id, style: s.style, legs: [], kinds: [] }));
    g.legs.push(s.a.x, s.a.y, s.b.x, s.b.y); g.kinds.push(s.kind);
  }
  for (const g of groups.values()) ops.push({ k: 'legs', legs: g.legs, cls: g.cls, style: g.style, kinds: g.kinds });
  for (const n of net.nodes.values()) if (n.type !== 'plain') ops.push({ k: 'type', x: n.x, y: n.y, type: n.type });
  for (const n of net.nodes.values()) if (n.wide || n.tl || (n.rl ?? 1) > 1) ops.push({ k: 'flags', x: n.x, y: n.y, wide: !!n.wide, tl: !!n.tl, rl: n.rl ?? 1 });
  for (const n of net.nodes.values()) if (n.slipOff?.length) ops.push({ k: 'slips', x: n.x, y: n.y, off: n.slipOff });
  for (const n of net.nodes.values()) if (n.sig !== undefined || n.split?.length) ops.push({ k: 'signal', x: n.x, y: n.y, sig: n.sig ?? 1, split: n.split });
  if (net.speedTier) ops.push({ k: 'speed', tier: net.speedTier });
  ops.push({ k: 'rebuild', full: true });
  return ops;
}

/** replay network edits (in a ground worker, or a test) */
export function applyOps(n: RoadNetwork, ops: NetOp[]) {
  for (const op of ops) {
    switch (op.k) {
      case 'legs': {
        const legs: Leg[] = [];
        for (let i = 0; i + 3 < op.legs.length; i += 4) legs.push({ a: { x: op.legs[i], y: op.legs[i + 1] }, b: { x: op.legs[i + 2], y: op.legs[i + 3] } });
        n.addLegs(legs, classOf(op.cls), op.style, false, op.kinds as SegKind[] | undefined); break;
      }
      case 'piece': {
        const a = n.nodeAt({ x: op.seg[0], y: op.seg[1] });
        const seg = a?.segs.find(s => { const o = s.a === a ? s.b : s.a; return Math.abs(o.x - op.seg[2]) < 1e-6 && Math.abs(o.y - op.seg[3]) < 1e-6; });
        if (seg) n.removePiece({ seg, p0: { x: op.p0[0], y: op.p0[1] }, p1: { x: op.p1[0], y: op.p1[1] } }, false);
        break;
      }
      case 'type': { const nd = n.nodeAt({ x: op.x, y: op.y }); if (nd) n.setNodeType(nd, op.type, false); break; }
      case 'flags': { const nd = n.nodeAt({ x: op.x, y: op.y }); if (nd) n.setNodeFlags(nd, op.wide, op.tl, op.rl ?? nd.rl ?? 1, false); break; }
      case 'slips': { const nd = n.nodeAt({ x: op.x, y: op.y }); if (nd) n.setSlipOff(nd, op.off, false); break; }
      case 'signal': { const nd = n.nodeAt({ x: op.x, y: op.y }); if (nd) n.setSignal(nd, op.sig, op.split, false); break; }
      case 'speed': n.setSpeedTier(op.tier, false); break;
      case 'rebuild': n.rebuild(op.full); break;
      case 'clear': n.clear(); break;
    }
  }
}

/** the other end of seg s from node n */
const farEnd = (s: Seg, n: Node): Node => (s.a === n ? s.b : s.a);
/** whether p, m, q run on straight (the turn at m under about one degree; as fix-gate's runs) */
const straightAt = (p: Node, m: Node, q: Node) => { const d1 = sub(m, p), d2 = sub(q, m); return dot(d1, d2) > 0 && Math.abs(cross(d1, d2)) <= 0.02 * vlen(d1) * vlen(d2); };
/** a bound on the segs of one straight run (a loop of segs cannot run on forever) */
const MAX_CHAIN = 4096;

/** the straight run through seg s, in order from one end to the other: s, and on from each end through nodes of exactly two segs, of the same class,
 *  straight on; it stops at a junction (3+ arms), a dead end, a bend, a class change, and before any seg skip() names (a toll plaza); s itself is
 *  not in the run when skip() names it (an empty run) */
export function straightChain(s: Seg, skip: (x: Seg) => boolean = () => false): Seg[] {
  if (skip(s)) return [];
  const ahead: Seg[] = [], behind: Seg[] = [];
  extendRun(s.b, s, s, skip, ahead); extendRun(s.a, s, s, skip, behind);
  return [...behind.reverse(), s, ...ahead];
}
/** appends to out the segs on from node n past seg cur (see straightChain) */
function extendRun(n: Node, cur: Seg, s: Seg, skip: (x: Seg) => boolean, out: Seg[]) {
  let from = n, c = cur;
  while (out.length < MAX_CHAIN) {
    const to = farEnd(c, from);
    if (to.segs.length !== 2) return;
    const nx = to.segs[0] === c ? to.segs[1]! : to.segs[0]!;
    if (nx === s || nx.cls !== s.cls || skip(nx) || !straightAt(from, to, farEnd(nx, to))) return;
    out.push(nx); from = to; c = nx;
  }
}

/** a node's save entry: [x, y, type], with a 4th element when it has flags: 1 widened turns, 2 turn lanes, and bits 4 and 8 the
 *  roundabout's ring lanes less one (rl = 1 + (f >> 2 & 3)); a 5th element when a slip node has corners without a slipway (their in-arms, armDeg;
 *  the 4th is then 0 when there are no flags); a 6th element when the lights have a tier or a split: [sig, ...split] (sig 0 fixed-time, 1 actuated,
 *  2 adaptive; the 4th and 5th are then written too, 0 and [] when absent) */
export type NodeEntry = [number, number, string, number?, number[]?, number[]?];
export function nodeEntry(n: Node): NodeEntry {
  const f = (n.wide ? 1 : 0) | (n.tl ? 2 : 0) | (((n.rl ?? 1) - 1) << 2), off = n.slipOff?.length ? n.slipOff : null;
  const sg = n.sig !== undefined || n.split?.length ? [n.sig ?? 1, ...(n.split ?? [])] : null;
  if (sg) return [n.x, n.y, n.type, f, off ?? [], sg];
  if (off) return [n.x, n.y, n.type, f, off];
  return f ? [n.x, n.y, n.type, f] : [n.x, n.y, n.type];
}
/** a saved node entry as edits: its type, flags, slipways and signal tier on the node there (no node there: skipped; no 4th element: no flags; no 5th:
 *  every corner has its slipway; no 6th: the default tier and split) */
export function applyNodeEntry(e: NetEditor, [x, y, type, f, off, sg]: NodeEntry) {
  const n = e.net.nodeAt({ x, y }); if (!n) return;
  e.setNodeType(n, type as NodeType);
  if (f) e.setNodeFlags(n, !!(f & 1), !!(f & 2), Math.min(3, 1 + ((f >> 2) & 3)) as 1 | 2 | 3);
  if (off?.length && type === 'slip') e.setSlipOff(n, off);
  if (sg?.length && (type === 'signal' || type === 'slip')) e.setSignal(n, sg[0] as 0 | 1 | 2, sg.length > 1 ? sg.slice(1) : undefined);
}

/** Edits the main thread's network and records the same edits for the ground workers. */
export class NetEditor {
  ops: NetOp[] = [];
  constructor(public net: RoadNetwork) {}
  addLegs(legs: Leg[], cls: RoadClass, style: LineStyle, kinds?: SegKind[]) {
    this.net.addLegs(legs, cls, style, false, kinds);
    this.ops.push({ k: 'legs', legs: legs.flatMap(l => [l.a.x, l.a.y, l.b.x, l.b.y]), cls: cls.id, style, ...(kinds ? { kinds } : {}) });
  }
  removePiece(sel: PieceSel) {
    const s = sel.seg;
    this.ops.push({ k: 'piece', seg: [s.a.x, s.a.y, s.b.x, s.b.y], p0: [sel.p0.x, sel.p0.y], p1: [sel.p1.x, sel.p1.y] });
    this.net.removePiece(sel, false);
  }
  setNodeType(n: Node, type: NodeType) { this.ops.push({ k: 'type', x: n.x, y: n.y, type }); this.net.setNodeType(n, type, false); }
  /** the node's flags and ring lanes (rl keeps the node's own when not given) */
  setNodeFlags(n: Node, wide: boolean, tl: boolean, rl: 1 | 2 | 3 = n.rl ?? 1) { this.ops.push({ k: 'flags', x: n.x, y: n.y, wide, tl, rl }); this.net.setNodeFlags(n, wide, tl, rl, false); }
  /** the slip node's corners without a slipway (their in-arms, armDeg; empty = all have one) */
  setSlipOff(n: Node, off: number[]) { this.ops.push({ k: 'slips', x: n.x, y: n.y, off }); this.net.setSlipOff(n, off, false); }
  /** the lights' tier (0 fixed-time, 1 actuated, 2 adaptive) and the fixed-time green seconds of each phase (split; none = 18 s each) */
  /** every road's speed-limit tier (see speedOf) */
  setSpeedTier(t: 0 | 1 | 2 | 3) { this.ops.push({ k: 'speed', tier: t }); this.net.setSpeedTier(t, false); }
  setSignal(n: Node, sig: 0 | 1 | 2, split?: number[]) { this.ops.push({ k: 'signal', x: n.x, y: n.y, sig, split }); this.net.setSignal(n, sig, split, false); }
  clear() { this.net.clear(); this.ops = [{ k: 'clear' }]; }
  /** rebuild here, and hand back the ops (ending in the same rebuild) for the workers */
  commit(full = false): NetOp[] {
    this.net.rebuild(full); this.ops.push({ k: 'rebuild', full });
    const ops = this.ops; this.ops = []; return ops;
  }
}
