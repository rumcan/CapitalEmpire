// Trips: where vehicles start and where they want to go. An origin is a link lane weighted by length over the map; the
// destination zone is drawn by a gravity model (zone length times exp(-distance / 1500 m)), then a lane in it by length.
// Rebuilt on every graph update; the weights per origin zone are cached until the next one. Pure TS, no DOM.
import { MPT, LK, type LaneGraph, laneAt } from './lanes';
import { ZN, zoneOf } from './routing';

/** sim seconds per in-game day: one game minute per sim second */
export const DAY = 1440;
/** lanes shorter than this take no trips, metres */
const MIN_LEN = 10;
/** the gravity decay length, metres; the origin's own zone counts at OWN_ZONE_M */
const DECAY = 1500, OWN_ZONE_M = 400;
/** a destination is at least MIN_DEST metres (straight line) from its origin when one of DEST_TRIES draws is; else the farthest */
const MIN_DEST = 300, DEST_TRIES = 4;
/** zones: ZN x ZN, each 128 tiles square */
const NZ = ZN * ZN, ZONE_TILES = 128;
/** the demand curve's knots: [hour, share of the peak]; the curve runs from the first knot to the first knot + 24 h */
const KNOTS: [number, number][] = [[3, 0.35], [8, 1], [12, 0.7], [17, 1], [22, 0.5]];

/** the share of the peak demand at sim time t (seconds), hour = (t / 60) % 24: cosine-eased between the knots (3 h 0.35, 8 h 1,
 *  12 h 0.7, 17 h 1, 22 h 0.5, wrapping), so it is flat at each peak and never leaves [0.35, 1] */
export function demandAt(t: number): number {
  let h = (t / 60) % 24; if (h < 0) h += 24; if (h < KNOTS[0]![0]) h += 24;
  for (let k = 0; k < KNOTS.length; k++) {
    const last = k + 1 === KNOTS.length, h0 = KNOTS[k]![0], v0 = KNOTS[k]![1];
    const h1 = last ? KNOTS[0]![0] + 24 : KNOTS[k + 1]![0], v1 = KNOTS[last ? 0 : k + 1]![1];
    if (h >= h0 && h < h1) return v0 + (v1 - v0) * (1 - Math.cos(Math.PI * (h - h0) / (h1 - h0))) / 2;
  }
  return KNOTS[0]![1];
}

/** The trip generator of one Sim: origins over the map, destinations by zone; draws use the sim's random source */
export class Trips {
  private g!: LaneGraph;
  /** the spawn table: link lanes (not tunnels, at least MIN_LEN) and their cumulative lengths over the map */
  private sIds: number[] = []; private sCum: number[] = []; private sTot = 0;
  /** per zone: its link lanes, their cumulative lengths (m), and the total length (m) */
  private zLane: Int32Array[] = []; private zCum: Float64Array[] = []; private zLen = new Float64Array(NZ);
  /** per origin zone (row): cumulative gravity weights over the zones, their total, and 1 once built for this graph */
  private wCum = new Float64Array(NZ * NZ); private wTot = new Float64Array(NZ); private wOk = new Uint8Array(NZ);
  /** the s (m) of the last origin, and of the last destination */
  oS = 0; destS = 0;
  private rnd: () => number;
  /** a scratch lane position (allocation-free) */
  private pt = { x: 0, y: 0, hx: 0, hy: 0 };

  constructor(rnd: () => number) { this.rnd = rnd; }

  /** after a graph update: the spawn table, the zone lanes and their lengths; the weights are rebuilt on demand */
  onGraph(g: LaneGraph) {
    this.g = g; this.sIds = []; this.sCum = []; let tot = 0;
    const lists: number[][] = [];
    for (let z = 0; z < NZ; z++) lists.push([]);
    for (const ln of g.lanes) {
      if (!ln || ln.kind !== LK.LINK || ln.tunnel || ln.len < MIN_LEN) continue;
      tot += ln.len; this.sIds.push(ln.id); this.sCum.push(tot);
      laneAt(ln, ln.len / 2, this.pt); lists[zoneOf(this.pt.x, this.pt.y)]!.push(ln.id);
    }
    this.sTot = tot; this.zLane = []; this.zCum = [];
    for (let z = 0; z < NZ; z++) {
      const ids = Int32Array.from(lists[z]!), cum = new Float64Array(ids.length); let c = 0;
      for (let k = 0; k < ids.length; k++) { c += g.lanes[ids[k]!]!.len; cum[k] = c; }
      this.zLane.push(ids); this.zCum.push(cum); this.zLen[z] = c;
    }
    this.wOk.fill(0);
  }

  /** an origin: a link lane weighted by length over the map (its s in oS, in [5, len - 5]); -1 if there are no lanes */
  origin(): number {
    const n = this.sIds.length;
    if (!n) return -1;
    const r = this.rnd() * this.sTot, c = this.sCum;
    let lo = 0, hi = n - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (c[m]! > r) hi = m; else lo = m + 1; }
    const id = this.sIds[lo]!;
    this.oS = this.rnd() * (this.g.lanes[id]!.len - MIN_LEN) + 5;
    return id;
  }

  /** a destination for a trip from (ox, oy): up to DEST_TRIES draws, the first at least MIN_DEST metres away (else the farthest).
   *  Returns the dseg (-1 if there are no lanes); its s is in destS */
  dest(ox: number, oy: number): number {
    const oz = zoneOf(ox, oy);
    let best = -1, bestD = -1, bestS = 0;
    for (let k = 0; k < DEST_TRIES; k++) {
      const id = this.draw(oz);
      if (id < 0) break;
      const ln = this.g.lanes[id]!;
      laneAt(ln, this.destS, this.pt);
      const far = Math.hypot(this.pt.x - ox, this.pt.y - oy) * MPT;
      if (far >= MIN_DEST) return ln.dseg;
      if (far > bestD) { bestD = far; best = ln.dseg; bestS = this.destS; }
    }
    this.destS = bestS;
    return best;
  }

  /** a lane drawn from origin zone oz by the gravity weights, its s in destS; -1 if no zone has any weight */
  private draw(oz: number): number {
    if (!this.wOk[oz]) this.weights(oz);
    const tot = this.wTot[oz]!;
    if (!(tot > 0)) return -1;
    const row = oz * NZ, c = this.wCum, r = this.rnd() * tot;
    let lo = 0, hi = NZ - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (c[row + m]! > r) hi = m; else lo = m + 1; }
    const ids = this.zLane[lo]!, cum = this.zCum[lo]!, q = this.rnd() * cum[cum.length - 1]!;
    let a = 0, b = ids.length - 1;
    while (a < b) { const m = (a + b) >> 1; if (cum[m]! > q) b = m; else a = m + 1; }
    const id = ids[a]!;
    this.destS = this.rnd() * (this.g.lanes[id]!.len - MIN_LEN) + 5;
    return id;
  }

  /** the cumulative gravity weights from origin zone oz: zone length times exp(-d / DECAY), d the metres between the zone centres
   *  (OWN_ZONE_M for oz itself) */
  private weights(oz: number) {
    const row = oz * NZ, ox = oz % ZN, oy = (oz / ZN) | 0;
    let c = 0;
    for (let z = 0; z < NZ; z++) {
      const L = this.zLen[z]!;
      if (L > 0) {
        const d = z === oz ? OWN_ZONE_M : MPT * ZONE_TILES * Math.hypot(z % ZN - ox, ((z / ZN) | 0) - oy);
        c += L * Math.exp(-d / DECAY);
      }
      this.wCum[row + z] = c;
    }
    this.wTot[oz] = c; this.wOk[oz] = 1;
  }
}
