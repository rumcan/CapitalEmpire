// City blocks: the areas a closed ring of ground streets encloses. A planar face walk over the ground segs (bridges and tunnels do not wall a block)
// gives each face a key (stable while its corners stay put), a lawn variant and its area. Pure geometry, no rendering: the ground painter reads it later.
import { SK, type Node, type RoadNetwork, type Seg } from './network';

export interface Block { key: string; pts: number[] /* x0 y0 x1 y1 ... tiles, counter-clockwise or as found */; area: number /* tiles² */; tex: number /* 0..BLOCK_TEX-1 */ }
/** the lawn variants */
export const BLOCK_TEX = 3;
/** tiles²: a 400 x 400 tile loop; bigger loops are countryside, not a block */
export const BLOCK_MAX_AREA = 160000;
/** tiles²: smaller faces are slivers, not a block */
export const BLOCK_MIN_AREA = 9;

/** rounds a coordinate to 0.01 for the key */
const r2 = (v: number) => Math.round(v * 100) / 100;
/** 32-bit FNV-1a hash of a string */
const fnv = (s: string) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; };

/** drops dead-end excursions (u v u: the vertex v and the second u) from a face's node ids, until none is left */
function spikeFree(s: number[]): number[] {
  for (let ch = true; ch && s.length > 2;) {
    ch = false; const n = s.length;
    for (let i = 0; i < n; i++) if (s[i] === s[(i + 2) % n]) { const a = (i + 1) % n, b = (i + 2) % n; s = s.filter((_, k) => k !== a && k !== b); ch = true; break; }
  }
  return s;
}

/** drops corners whose two edges run on one straight line the same way, until none is left (xy = node coords) */
function straight(s: number[], xy: number[]): number[] {
  for (let ch = true; ch && s.length > 2;) {
    ch = false; const n = s.length;
    for (let i = 0; i < n; i++) {
      const p = s[(i + n - 1) % n]!, v = s[i]!, q = s[(i + 1) % n]!;
      const ix = xy[2 * v]! - xy[2 * p]!, iy = xy[2 * v + 1]! - xy[2 * p + 1]!, ox = xy[2 * q]! - xy[2 * v]!, oy = xy[2 * q + 1]! - xy[2 * v + 1]!;
      if (Math.abs(ix * oy - iy * ox) <= 1e-6 * Math.hypot(ix, iy) * Math.hypot(ox, oy) && ix * ox + iy * oy > 0) { s = s.filter((_, k) => k !== i); ch = true; break; }
    }
  }
  return s;
}

/** the blocks of the ground roads: every interior face with an area in [BLOCK_MIN_AREA, maxArea]. With a box, the face walk runs only on
 *  the segs whose bbox touches it (ends outside are fine): the faces that touch the box are exact when the box is padded by more than a block's reach */
export function enclosedBlocks(net: RoadNetwork, maxArea = BLOCK_MAX_AREA, box?: [number, number, number, number]): Block[] {
  const segs: Seg[] = [];
  for (const s of net.segs) {
    if (s.kind !== SK.GROUND || (s.a.x === s.b.x && s.a.y === s.b.y)) continue;
    if (box && (Math.max(s.a.x, s.b.x) < box[0] || Math.min(s.a.x, s.b.x) > box[2] || Math.max(s.a.y, s.b.y) < box[1] || Math.min(s.a.y, s.b.y) > box[3])) continue;
    segs.push(s);
  }
  // nodes get indices; each seg gives half-edges 2k (a->b) and 2k+1 (b->a)
  const ids = new Map<Node, number>(), xy: number[] = [];
  const idOf = (n: Node) => { let i = ids.get(n); if (i === undefined) { i = ids.size; ids.set(n, i); xy.push(n.x, n.y); } return i; };
  const E = segs.length * 2;
  const org = new Int32Array(E), dst = new Int32Array(E), ang = new Float64Array(E);
  segs.forEach((s, k) => {
    const a = idOf(s.a), b = idOf(s.b), h = 2 * k;
    org[h] = a; dst[h] = b; org[h + 1] = b; dst[h + 1] = a;
    ang[h] = Math.atan2(s.b.y - s.a.y, s.b.x - s.a.x); ang[h + 1] = Math.atan2(s.a.y - s.b.y, s.a.x - s.b.x);
  });
  // each node's half-edges, sorted by angle (ascending), in one array; pos[h] = where h sits in it
  const N = ids.size, start = new Int32Array(N + 1);
  for (let h = 0; h < E; h++) start[org[h]! + 1]++;
  for (let i = 0; i < N; i++) start[i + 1] += start[i]!;
  const fill = start.slice(0, N), order = new Int32Array(E), pos = new Int32Array(E);
  for (let h = 0; h < E; h++) order[fill[org[h]!]!++] = h;
  for (let i = 0; i < N; i++) {
    const hs = Array.from(order.subarray(start[i]!, start[i + 1]!)).sort((p, q) => ang[p]! - ang[q]!);
    hs.forEach((h, j) => { order[start[i]! + j] = h; });
  }
  for (let j = 0; j < E; j++) pos[order[j]!] = j;
  // face walk: arrive at v by h, leave by the edge just before the twin in v's sorted list (the clockwise next)
  const seen = new Uint8Array(E), cap = 4 * segs.length + 8, out: Block[] = [];
  for (let h0 = 0; h0 < E; h0++) {
    if (seen[h0]) continue;
    const seq: number[] = [];
    let h = h0, steps = 0, ok = true;
    do {
      seen[h] = 1; seq.push(org[h]!);
      const d = dst[h]!, deg = start[d + 1]! - start[d]!, li = pos[h ^ 1]! - start[d]!;
      h = order[start[d]! + ((li - 1 + deg) % deg)]!;
      if (++steps > cap) { ok = false; break; }
    } while (h !== h0);
    if (!ok) continue;
    // the simplified outline: no dead-end spikes, no collinear corners (its corners are the block's identity)
    const s = straight(spikeFree(seq), xy);
    if (s.length < 3) continue;
    const pts: number[] = [], names: string[] = [];
    let area2 = 0;
    for (let i = 0; i < s.length; i++) {
      const o = s[i]!, d = s[(i + 1) % s.length]!, ox = xy[2 * o]!, oy = xy[2 * o + 1]!, dx = xy[2 * d]!, dy = xy[2 * d + 1]!;
      pts.push(ox, oy); names.push(r2(ox) + ',' + r2(oy)); area2 += ox * dy - dx * oy;
    }
    const area = area2 / 2;
    // the interior faces have a positive area here (the outer face of a lone square is the same size, negative)
    if (area < BLOCK_MIN_AREA || area > maxArea) continue;
    const hash = fnv([...new Set(names)].sort().join(';'));
    out.push({ key: 'block:' + hash.toString(36), pts, area, tex: hash % BLOCK_TEX });
  }
  return out;
}

/** what changed between the known blocks (by key) and the new ones: set = new keys, drop = keys gone */
export function blockDiff(prev: Map<string, Block>, next: Block[]): { set: Block[]; drop: string[] } {
  const keep = new Set<string>(), set: Block[] = [];
  for (const b of next) { keep.add(b.key); if (!prev.has(b.key)) set.push(b); }
  const drop: string[] = [];
  for (const k of prev.keys()) if (!keep.has(k)) drop.push(k);
  return { set, drop };
}
