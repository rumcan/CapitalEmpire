// The bottleneck report: where the sim loses time, ranked by junction and by link (from Sim.lossL, lossQ and enterL). Pure TS, no DOM.
import { classOf, type Node } from '../network';
import { LK, MPT, type DSeg, type LaneGraph } from './lanes';

/** level of service bounds, s of delay per vehicle, at a signal and elsewhere: A at or below the first, F above the last */
export const LOS_SIGNAL = [10, 20, 35, 55, 80], LOS_OTHER = [10, 15, 25, 35, 50];
/** vehicles per lane per game hour (a game hour is 60 sim s) at 13.4 m/s or more; scaled by the speed limit below that, halved at a signal */
export const CAP_LANE = 30;
/** the speed, m/s, from which CAP_LANE holds */
const V_CAP = 13.4;
const LN2 = Math.LN2, LOS_LETTERS = 'ABCDEF';
const TYPE_NAME: Record<string, string> = { plain: 'Junction', stop: 'All-way stop', mini: 'Mini-roundabout', signal: 'Traffic lights', slip: 'Lights + slipways', roundabout: 'Roundabout' };

/** a junction (a node of 3 or more segs, or a roundabout): loss in veh-s per game hour, through in veh per game hour, delay in s per veh */
export interface Junction { key: string; x: number; y: number; type: string; arms: number; loss: number; through: number; delay: number; los: string }
/** a link (a seg, both directions): loss in veh-s per game hour, vc the larger v/c of its two directions */
export interface Link { key: string; ax: number; ay: number; bx: number; by: number; cls: string; loss: number; vc: number }
/** one ranked entry: a junction or a link; los is '' for a link */
export interface Item { kind: 'junction' | 'link'; key: string; x: number; y: number; loss: number; label: string; los: string; vc: number }
/** the report: the junctions, the links, the top entries by loss, and flow: 6 floats per dseg with traffic (from x, y, to x, y in tiles; v/c; half width in tiles) */
export interface Report { junctions: Junction[]; links: Link[]; top: Item[]; flow: Float32Array }

/** the level of service (A to F) of a delay of delay s per vehicle, at a signal (signal) or not */
export function los(delay: number, signal: boolean): string {
  const b = signal ? LOS_SIGNAL : LOS_OTHER;
  let k = 0; while (k < b.length && delay > b[k]) k++;
  return LOS_LETTERS[k];
}
/** a signal or a slip-road junction */
const sigType = (t: string) => t === 'signal' || t === 'slip';
/** a junction: 3 or more segs, or a roundabout */
const isJunction = (n: Node) => n.segs.length >= 3 || n.type === 'roundabout';
/** vehicles per lane per game hour a dseg carries */
const capOf = (d: DSeg) => CAP_LANE * Math.min(1, d.vmax / V_CAP) * (sigType(d.to.type) ? 0.5 : 1);

/** the bottleneck report of graph g and the sim's decaying sums m (rates are the sums times ln 2); top holds the topN entries with loss > 0 */
export function bottlenecks(g: LaneGraph, m: { lossL: Float64Array; lossQ: Float64Array; enterL: Float64Array }, topN = 10): Report {
  const D = g.dsegs, L = g.lanes;
  const jn = new Map<Node, Junction>(), jv = new Map<Junction, number>(), links = new Map<string, Link>();
  const dK: Link[] = [], dr = new Float64Array(D.length), dv = new Float64Array(D.length);
  // the junctions, the link of each seg, and each dseg's entries per game hour and v/c
  for (let k = 0; k < D.length; k++) {
    const d = D[k]; if (!d) continue;
    for (const n of [d.from, d.to]) if (isJunction(n) && !jn.has(n)) { const J: Junction = { key: `${n.x},${n.y}`, x: n.x, y: n.y, type: n.type, arms: n.arms.length, loss: 0, through: 0, delay: 0, los: 'A' }; jn.set(n, J); jv.set(J, 0); }
    let e = 0; for (const id of d.lanes) e += m.enterL[id];
    dr[k] = e * LN2; dv[k] = dr[k] / Math.max(1, d.lanes.length) / capOf(d);
    const a = d.seg.a, b = d.seg.b, sk = `${a.x},${a.y}-${b.x},${b.y}`;
    let K = links.get(sk);
    if (!K) { K = { key: sk, ax: a.x, ay: a.y, bx: b.x, by: b.y, cls: d.seg.cls.id, loss: 0, vc: 0 }; links.set(sk, K); }
    dK[k] = K; K.vc = Math.max(K.vc, dv[k]);
    const J = jn.get(d.to); if (J) jv.set(J, Math.max(jv.get(J)!, dv[k]));
  }
  // the losses: a link's lane away from its end; a link's queue, which belongs to the junction ahead when it is one; a junction's own lanes
  for (let id = 0; id < L.length; id++) {
    const l = L[id]; if (!l) continue;
    if (l.kind === LK.LINK) {
      const d = D[l.dseg]; if (!d) continue;
      const J = jn.get(d.to), K = dK[l.dseg]!;
      K.loss += (m.lossL[id] + (J ? 0 : m.lossQ[id])) * LN2;
      if (J) J.loss += m.lossQ[id] * LN2;
    } else if (l.node) {
      const J = jn.get(l.node); if (!J) continue;
      J.loss += (m.lossL[id] + m.lossQ[id]) * LN2;
      if (l.prev.some(p => L[p]?.kind === LK.LINK)) J.through += m.enterL[id] * LN2;
    }
  }
  const junctions = [...jn.values()];
  for (const J of junctions) { J.delay = J.through > 0 ? J.loss / J.through : 0; J.los = los(J.delay, sigType(J.type)); }
  // the flow: the dsegs with entries
  let nf = 0; for (let k = 0; k < D.length; k++) if (D[k] && dr[k] > 0) nf++;
  const flow = new Float32Array(6 * nf);
  for (let k = 0, f = 0; k < D.length; k++) {
    const d = D[k]; if (!d || !(dr[k] > 0)) continue;
    const o = 6 * f++;
    flow[o] = d.from.x; flow[o + 1] = d.from.y; flow[o + 2] = d.to.x; flow[o + 3] = d.to.y; flow[o + 4] = dv[k]; flow[o + 5] = d.seg.cls.h;
  }
  // the ranking: junctions and links with loss, the largest first
  const items: Item[] = [];
  for (const J of junctions) if (J.loss > 0) items.push({ kind: 'junction', key: J.key, x: J.x, y: J.y, loss: J.loss, label: `${TYPE_NAME[J.type] ?? J.type} · ${J.arms} arms`, los: J.los, vc: jv.get(J) ?? 0 });
  const lks = [...links.values()];
  for (const K of lks) if (K.loss > 0) items.push({ kind: 'link', key: K.key, x: (K.ax + K.bx) / 2, y: (K.ay + K.by) / 2, loss: K.loss, label: `${classOf(K.cls).name} · ${Math.round(Math.hypot(K.bx - K.ax, K.by - K.ay) * MPT)} m`, los: '', vc: K.vc });
  items.sort((p, q) => q.loss - p.loss);
  return { junctions, links: lks, top: items.slice(0, topN), flow };
}
