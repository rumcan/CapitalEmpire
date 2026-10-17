import type { NetOp } from './ground-protocol';
import { CLASS, RoadNetwork, type ClassId, type Leg, type Node, type NodeType, type PieceSel, type RoadClass, type SegKind } from './network';
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
        n.addLegs(legs, CLASS[op.cls], op.style, false, op.kinds as SegKind[] | undefined); break;
      }
      case 'piece': {
        const a = n.nodeAt({ x: op.seg[0], y: op.seg[1] });
        const seg = a?.segs.find(s => { const o = s.a === a ? s.b : s.a; return Math.abs(o.x - op.seg[2]) < 1e-6 && Math.abs(o.y - op.seg[3]) < 1e-6; });
        if (seg) n.removePiece({ seg, p0: { x: op.p0[0], y: op.p0[1] }, p1: { x: op.p1[0], y: op.p1[1] } }, false);
        break;
      }
      case 'type': { const nd = n.nodeAt({ x: op.x, y: op.y }); if (nd) n.setNodeType(nd, op.type, false); break; }
      case 'rebuild': n.rebuild(op.full); break;
      case 'clear': n.clear(); break;
    }
  }
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
  clear() { this.net.clear(); this.ops = [{ k: 'clear' }]; }
  /** rebuild here, and hand back the ops (ending in the same rebuild) for the workers */
  commit(full = false): NetOp[] {
    this.net.rebuild(full); this.ops.push({ k: 'rebuild', full });
    const ops = this.ops; this.ops = []; return ops;
  }
}
