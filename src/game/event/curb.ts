// On-street parking (curbs, PARKING.md section 2): a straight run of road between two junctions, its kerb lane parked, its bays along that kerb.
// Pure TS, no DOM: the City makes each run a car park, and the lane graph drops the kerb lane (LaneGraph.setCurbs).
import { type Node, type Pt, type RoadNetwork, type Seg, SK, add, dot, keyOf, mul, norm, perp, sub, vlen } from '../network';
import { straightChain } from '../netops';
import { laneOff } from '../sim/lanes';
import type { Bay } from './carpark';
import { CURB_BAY, CURB_END, CURB_MIN_BAYS } from './config';

/** an on-street parking run as the player places it: the straight run between nodes a and b, traffic from a to b, its bays on that direction's right-hand kerb */
export interface CurbDef { id: number; ax: number; ay: number; bx: number; by: number }
/** a resolved run: its segs in order from a to b, the directed seg keys (`${keyOf(from)}>${keyOf(to)}` in the a to b direction, as LaneGraph keys dsegs),
 *  the bays, the run's middle point on the centre line (the entrance), the seg holding it, and pv (the unit vector from the centre line towards the
 *  parking kerb: perp of the traffic direction, the side the lanes are offset to) */
export interface Curb extends CurbDef { segs: Seg[]; keys: string[]; bays: Bay[]; entrance: Pt; seg: Seg; pv: Pt; /** the kerb lane becomes parking (2+ lanes that way; the lane graph drops it); false: the bays stand on a wide shoulder beside the lane */ drop: boolean }

/** the facings of a bay: 0 +x, 1 +y, 2 -x, 3 -y */
const FACE: Pt[] = [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 }];
/** the cosine of 1 degree: a run's first seg may leave its end node this far off the a to b line */
const COS1 = Math.cos(Math.PI / 180);

/** the far end of seg s from node n */
const farEnd = (s: Seg, n: Node): Node => (s.a === n ? s.b : s.a);
/** the nearest of the four facings to the unit vector u */
const facing = (u: Pt): 0 | 1 | 2 | 3 => { let k = 0; for (let j = 1; j < 4; j++) if (dot(FACE[j], u) > dot(FACE[k], u)) k = j; return k as 0 | 1 | 2 | 3; };
/** the two end nodes of a chain of segs in order: the first seg's end not shared with the second, the last seg's end not shared with the one before */
function chainEnds(segs: Seg[]): [Node, Node] {
  if (segs.length === 1) return [segs[0].a, segs[0].b];
  const f = segs[0], g = segs[1], l = segs[segs.length - 1], h = segs[segs.length - 2];
  return [f.a === g.a || f.a === g.b ? f.b : f.a, l.a === h.a || l.a === h.b ? l.b : l.a];
}
/** the directed seg keys of a run's nodes (nodes[i] to nodes[i + 1], in the run's direction) */
const keysOf = (nodes: Node[]): string[] => nodes.slice(1).map((n, i) => `${keyOf(nodes[i])}>${keyOf(n)}`);

/** a run resolved to its nodes: segs in order from a to b, and nodes (one more than segs: nodes[i] is the node before segs[i]) */
interface Run { segs: Seg[]; nodes: Node[] }
/** the run of def on net, with its nodes; null if there is none */
function runOf(net: RoadNetwork, d: CurbDef): Run | null {
  const na = net.nodeAt({ x: d.ax, y: d.ay }), nb = net.nodeAt({ x: d.bx, y: d.by });
  if (!na || !nb || na === nb) return null;
  const u = norm(sub({ x: d.bx, y: d.by }, { x: d.ax, y: d.ay }));
  const s = na.segs.find(t => dot(norm(sub(farEnd(t, na), na)), u) >= COS1);
  if (!s) return null;
  const chain = straightChain(s), [e0, e1] = chainEnds(chain);
  const segs = e0 === na && e1 === nb ? chain : e0 === nb && e1 === na ? chain.reverse() : null;
  if (!segs) return null;
  const nodes: Node[] = [na];
  for (const t of segs) nodes.push(farEnd(t, nodes[nodes.length - 1]));
  return { segs, nodes };
}

/** the segs of the straight run from node a to node b, in order from a to b, or null: a and b must be the run's two ends, and the run must leave a
 *  on the a to b line (within 1 degree) */
export function curbRun(net: RoadNetwork, def: CurbDef): Seg[] | null { return runOf(net, def)?.segs ?? null; }

/** the lanes of a seg in one direction: its class's lane count (a two-way seg has that many lanes per direction; a one-way seg has all of them) */
export function lanesThatWay(s: Seg): number { return s.cls.laneCentres.length; }

/** the parking strip's offset (tiles, from the centre line) on the shoulder of a one-lane-each-way class: when the class leaves at least 1 tile between
 *  its kerb lane's edge (its centre + 0.8) and its edge h, the bays stand 0.6 tiles inside the edge; 0 when there is no room */
export function shoulderOf(s: Seg): number { const c = s.cls.laneCentres, last = Math.abs(c[c.length - 1] ?? 0); return s.cls.h - (last + 0.8) >= 1 ? s.cls.h - 0.6 : 0; }

/** '' if the run of def may take on-street parking, else the reason: no straight run between two junctions; a seg on a bridge or in a tunnel; a one-way
 *  seg against its traffic; under 2 lanes that way; a toll plaza on it (tollKeys: the toll dseg keys); a dseg shared with another run of others (by id);
 *  under CURB_MIN_BAYS bays */
export function curbCheck(net: RoadNetwork, def: CurbDef, tollKeys: Set<string> = new Set(), others: CurbDef[] = []): string {
  const run = runOf(net, def);
  if (!run) return 'pick a straight stretch of road between two junctions';
  const { segs, nodes } = run;
  if (segs.some(s => s.kind !== SK.GROUND)) return 'not on bridges or in tunnels';
  if (segs.some((s, i) => s.cls.oneway && s.a !== nodes[i])) return 'that way is against the one-way traffic';
  if (segs.some(s => lanesThatWay(s) < 2 && !shoulderOf(s))) return 'too narrow: needs 2 lanes this way or a wide shoulder';
  const keys = keysOf(nodes), mine = new Set(keys);
  if (keys.some(k => tollKeys.has(k))) return 'a toll plaza is on it';
  for (const o of others) {
    if (o.id === def.id) continue;
    const r = runOf(net, o);
    if (r && keysOf(r.nodes).some(k => mine.has(k))) return 'it already has parking';
  }
  if (build(def, run).bays.length < CURB_MIN_BAYS) return `too short for ${CURB_MIN_BAYS} bays`;
  return '';
}

/** the curb of def on a resolved run: its keys, its kerb's bays (every CURB_BAY tiles, CURB_END clear at each end, on the kerb lane's centre line),
 *  the entrance at the run's middle */
function build(def: CurbDef, { segs, nodes }: Run): Curb {
  const a = nodes[0], b = nodes[nodes.length - 1], u = norm(sub(b, a)), pv = perp(u);
  const cum = [0];
  for (let i = 0; i < segs.length; i++) cum.push(cum[i] + vlen(sub(nodes[i + 1], nodes[i])));
  const T = cum[segs.length];
  /** the index of the seg holding the run distance t (tiles) */
  const at = (t: number): number => { let i = 0; while (i < segs.length - 1 && cum[i + 1] < t) i++; return i; };
  /** the centre-line point at the run distance t (tiles) */
  const pt = (t: number): Pt => { const i = at(t), L = cum[i + 1] - cum[i]; return add(nodes[i], mul(sub(nodes[i + 1], nodes[i]), L ? (t - cum[i]) / L : 0)); };
  // the kerb lane is the outermost one of the run's class (its last lane centre), on the pv side, as makeDseg offsets the lanes
  // (a one-lane class with a wide shoulder parks on the shoulder instead and keeps its lane)
  const drop = lanesThatWay(segs[0]) >= 2, off = drop ? laneOff(segs[0], segs[0].cls.laneCentres.length - 1) : shoulderOf(segs[0]), dir = facing(u);
  const first = CURB_END + CURB_BAY / 2, last = T - CURB_END - CURB_BAY / 2, bays: Bay[] = [];
  for (let k = 0; first + k * CURB_BAY <= last + 1e-9; k++) {
    const c = pt(first + k * CURB_BAY);
    bays.push({ x: c.x + pv.x * off, y: c.y + pv.y * off, dir, hx: u.x, hy: u.y, tx: u.x, ty: u.y });
  }
  const mid = T / 2;
  return { ...def, segs, keys: keysOf(nodes), bays, entrance: pt(mid), seg: segs[at(mid)], pv, drop };
}

/** the curb of def on net (see Curb), or null when there is no run (see curbRun) */
export function resolveCurb(net: RoadNetwork, def: CurbDef): Curb | null { const run = runOf(net, def); return run ? build(def, run) : null; }

/** the def of the run through seg with its parking on the kerb nearest point p: traffic runs a to b along the chain when p is on the perp(a to b) side of
 *  seg, else b to a; its ends are the chain's end nodes in that order; id 0. Null if the chain is empty */
export function curbFrom(_net: RoadNetwork, seg: Seg, p: Pt): CurbDef | null {
  const chain = straightChain(seg);
  if (!chain.length) return null;
  const [e0, e1] = chainEnds(chain), fwd = dot(sub(p, seg.a), perp(norm(sub(seg.b, seg.a)))) >= 0;
  const [s, e] = fwd ? [e0, e1] : [e1, e0];
  return { id: 0, ax: s.x, ay: s.y, bx: e.x, by: e.y };
}

/** the painted marks of a curb as x0 y0 x1 y1 ...: the edge line between the parking strip and the traffic (from the first bay's start to the last
 *  bay's end) and a tick across the strip at every bay boundary; the strip is the kerb lane (1.6 tiles wide) or the shoulder strip (1.2 wide) */
export function curbLines(c: Curb): number[] {
  if (!c.bays.length) return [];
  const half = c.drop ? 0.8 : 0.6, b0 = c.bays[0], u = { x: b0.hx, y: b0.hy }, pv = c.pv, out: number[] = [];
  const at = (b: { x: number; y: number }, along: number, across: number) => [b.x + u.x * along + pv.x * across, b.y + u.y * along + pv.y * across];
  const first = at(b0, -CURB_BAY / 2, -half), last = at(c.bays[c.bays.length - 1], CURB_BAY / 2, -half);
  out.push(first[0], first[1], last[0], last[1]);
  for (let k = 0; k <= c.bays.length; k++) {
    const b = c.bays[Math.min(k, c.bays.length - 1)], along = k < c.bays.length ? -CURB_BAY / 2 : CURB_BAY / 2;
    out.push(...at(b, along, -half), ...at(b, along, half * 0.9));
  }
  return out;
}
/** the strip of a curb as a quad (x0 y0 ... x3 y3; the lot ground patch that carries its marks) */
export function curbQuad(c: Curb): number[] {
  if (!c.bays.length) return [];
  const half = c.drop ? 0.8 : 0.6, b0 = c.bays[0], bn = c.bays[c.bays.length - 1], u = { x: b0.hx, y: b0.hy }, pv = c.pv;
  const p = (b: { x: number; y: number }, along: number, across: number) => [b.x + u.x * along + pv.x * across, b.y + u.y * along + pv.y * across];
  return [...p(b0, -CURB_BAY / 2, -half), ...p(bn, CURB_BAY / 2, -half), ...p(bn, CURB_BAY / 2, half), ...p(b0, -CURB_BAY / 2, half)];
}
