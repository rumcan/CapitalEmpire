// T396 (#1064; the owner, 2026-11-08: "ctrl/z should always work to reset your prev menu setting change"): the roads the player builds are undo steps, on
// the same stack as the course, the paint, the props and the settings (paint-tool.ts), in time order. A step that changed the road network keeps a diff:
// the segs it took away and the segs it made (with their class, line style, structure kind and owner), and the junctions (type, options, slipways, signal
// tier) it touched, before and after. Undo takes the made segs away, lays the removed ones again and puts the junctions back; redo does the reverse. The
// diff is by seg (its two ends), so a seg another action cut in two, or took away, in between is simply found or missed: nothing else of the network is
// held, and a step can never put back more than it changed. The network is changed through the NetEditor (the workers get the same edits), and the engine
// re-bakes the ground where it changed (commitNetwork), as a bulldoze does. Pure: no DOM, no engine.
import { RoadNetwork, classOf, keyOf, type Node, type NodeType, type Seg, type SegKind } from './network';
import { NetEditor, nodeEntry, type NodeEntry } from './netops';
import type { LineStyle } from './types';

/** a seg as the save and the workers hold it: [ax, ay, bx, by, class id, line style, kind, town (1: the towns')] */
export type SegRec = [number, number, number, number, string, number, number, 0 | 1];
/** a seg's key (its two ends; a two-way road has the same key either way round, a one-way its direction) and what the seg is (class, style, kind, owner) */
const segKey = (s: Seg): string => {
  let a = s.a, b = s.b;
  if (!s.cls.oneway && (a.x > b.x || (a.x === b.x && a.y > b.y))) [a, b] = [b, a];
  return `${keyOf(a)}>${keyOf(b)}`;
};
const segVal = (s: Seg): string => `${s.cls.id}|${s.style}|${s.kind}|${s.town ? 1 : 0}`;
const recOf = (s: Seg): SegRec => [s.a.x, s.a.y, s.b.x, s.b.y, s.cls.id, s.style, s.kind, s.town ? 1 : 0];

/** the network as it is: its segs by key, and the junctions with something on them (a type, options, slipways, a signal tier) as their save entries */
export interface NetState { segs: Map<string, { rec: SegRec; val: string }>; nodes: Map<string, NodeEntry> }
/** whether a node has nothing on it (a plain node, no options, no slipways, no signal tier) */
const plainNode = (n: Node): boolean => n.type === 'plain' && !n.wide && !n.tl && (n.rl ?? 1) === 1 && !n.slipOff?.length && n.sig === undefined && !n.split?.length;
export function netState(net: RoadNetwork): NetState {
  const segs = new Map<string, { rec: SegRec; val: string }>(), nodes = new Map<string, NodeEntry>();
  for (const s of net.segs) segs.set(segKey(s), { rec: recOf(s), val: segVal(s) });
  for (const n of net.nodes.values()) if (!plainNode(n)) nodes.set(keyOf(n), nodeEntry(n));
  return { segs, nodes };
}

/** what a step did to the network: out: the segs it took away (or changed: their old look), inn: the segs it made (their new look), nodes: the junctions at
 *  the ends of those and any whose type or options changed, as they were (before) and as they were left (after; null: a plain node) */
export interface NetDiff { out: SegRec[]; inn: SegRec[]; nodes: { x: number; y: number; before: NodeEntry | null; after: NodeEntry | null }[] }
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
/** the diff between two states of the network (null: nothing changed) */
export function diffNet(before: NetState, after: NetState): NetDiff | null {
  const out: SegRec[] = [], inn: SegRec[] = [], keys = new Set<string>(), pts = new Map<string, [number, number]>();
  const note = (r: SegRec) => { for (const [x, y] of [[r[0], r[1]], [r[2], r[3]]] as const) { const k = keyOf({ x, y }); keys.add(k); pts.set(k, [x, y]); } };
  for (const [k, e] of before.segs) { const f = after.segs.get(k); if (!f || f.val !== e.val) { out.push(e.rec); note(e.rec); } }
  for (const [k, e] of after.segs) { const f = before.segs.get(k); if (!f || f.val !== e.val) { inn.push(e.rec); note(e.rec); } }
  for (const [k, e] of before.nodes) if (!same(e, after.nodes.get(k))) { keys.add(k); pts.set(k, [e[0], e[1]]); }
  for (const [k, e] of after.nodes) if (!same(e, before.nodes.get(k))) { keys.add(k); pts.set(k, [e[0], e[1]]); }
  const nodes: NetDiff['nodes'] = [];
  for (const k of keys) { const b = before.nodes.get(k) ?? null, a = after.nodes.get(k) ?? null, [x, y] = pts.get(k)!; if (b || a) nodes.push({ x, y, before: b, after: a }); }
  return out.length || inn.length || nodes.some(n => !same(n.before, n.after)) ? { out, inn, nodes } : null;
}

/** the live seg a record names (its two ends), or undefined when the network no longer has it */
function findSeg(net: RoadNetwork, r: SegRec): Seg | undefined {
  const a = net.nodeAt({ x: r[0], y: r[1] }), far = keyOf({ x: r[2], y: r[3] });
  return a?.segs.find(s => keyOf(s.a === a ? s.b : s.a) === far);
}
/** a node put as its entry says (null: plain, with nothing on it): its type, options, slipways and signal tier, each only when it differs */
function restoreNode(edit: NetEditor, n: Node | undefined, t: NodeEntry | null) {
  if (!n) return;
  const want: NodeEntry = t ?? [n.x, n.y, 'plain'];
  if (same(nodeEntry(n), want)) return;
  const type = want[2] as NodeType, f = want[3] ?? 0, rl = Math.min(3, 1 + ((f >> 2) & 3)) as 1 | 2 | 3, off = want[4] ?? [], sg = want[5];
  if (n.type !== type) edit.setNodeType(n, type); // (a type other than a slip drops the slipways, one other than lights or a slip the signal tier)
  if (!!n.wide !== !!(f & 1) || !!n.tl !== !!(f & 2) || (n.rl ?? 1) !== rl) edit.setNodeFlags(n, !!(f & 1), !!(f & 2), rl);
  if (type === 'slip' && !same(n.slipOff ?? [], off)) edit.setSlipOff(n, off);
  if ((type === 'signal' || type === 'slip') && sg?.length && (n.sig !== sg[0] || !same(n.split ?? [], sg.slice(1)))) edit.setSignal(n, sg[0] as 0 | 1 | 2, sg.length > 1 ? sg.slice(1) : undefined);
}
/** takes a step back (undo) or does it again (redo) through the editor, without rebuilding (the caller commits): the segs on the other side go, the segs of this
 *  side are laid, then the junctions are put as that side had them. True when it found anything to change */
export function applyNetDiff(edit: NetEditor, d: NetDiff, undo: boolean): boolean {
  const net = edit.net, kill = undo ? d.inn : d.out, make = undo ? d.out : d.inn;
  let changed = false;
  for (const r of kill) { const s = findSeg(net, r); if (s) { edit.removePiece({ seg: s, p0: { x: s.a.x, y: s.a.y }, p1: { x: s.b.x, y: s.b.y } }); changed = true; } }
  // laid again by class, style and owner (a leg of each kind: bridges and tunnels keep their kind)
  const groups = new Map<string, { cls: string; style: LineStyle; town: boolean; legs: { a: { x: number; y: number }; b: { x: number; y: number } }[]; kinds: SegKind[] }>();
  for (const r of make) {
    const k = `${r[4]}|${r[5]}|${r[7]}`; let g = groups.get(k);
    if (!g) groups.set(k, (g = { cls: r[4], style: r[5] as LineStyle, town: !!r[7], legs: [], kinds: [] }));
    g.legs.push({ a: { x: r[0], y: r[1] }, b: { x: r[2], y: r[3] } }); g.kinds.push(r[6] as SegKind);
  }
  for (const g of groups.values()) { edit.addLegs(g.legs, classOf(g.cls), g.style, g.kinds, g.town ? true : undefined); changed = true; }
  for (const n of d.nodes) {
    const node = net.nodeAt({ x: n.x, y: n.y }), t = undo ? n.before : n.after;
    const was = node ? nodeEntry(node) : null; restoreNode(edit, node, t);
    if (node && was && !same(was, nodeEntry(node))) changed = true;
  }
  return changed;
}

/** the engine's side of the journal (the paint tool's netJournal host hook): a step opens it (begin), the first change the editor makes inside it keeps the network
 *  as it was (touch: the NetEditor's onEdit), and closing it (end) gives the diff, or null when the network did not change; undo and redo apply a diff and
 *  commit it (the engine's commitNetwork: the workers get the edits, the ground re-bakes where the network changed). The diff stays valid for the other way */
export interface NetJournal { begin(): void; end(): NetDiff | null; undo(d: NetDiff): NetDiff; redo(d: NetDiff): NetDiff; touch(): void }
export function createNetJournal(h: { net: () => RoadNetwork; edit: () => NetEditor; commit: () => void }): NetJournal {
  let open = false, before: NetState | null = null;
  const apply = (d: NetDiff, undo: boolean): NetDiff => { if (applyNetDiff(h.edit(), d, undo)) h.commit(); return d; };
  return {
    touch() { if (open && !before) before = netState(h.net()); },
    begin() { open = true; before = null; },
    end() { const b = before; open = false; before = null; return b ? diffNet(b, netState(h.net())) : null; },
    undo: d => apply(d, true),
    redo: d => apply(d, false),
  };
}
