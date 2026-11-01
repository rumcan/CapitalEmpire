// The way along the roads between two points (the owner, 2026-11-01: "new parking lot and now the cars drive over the course to get into the
// parking lot"): the range's cars drew a straight line from the county road to a car park off the range's drive. This finds the shortest drive
// on the car roads (no cart paths, no walking paths: noCars) from the road nearest one point to the road nearest the other, as the centre
// lines' points. Pure: the network only, no Game. Headless test: tests/road-route.test.ts.
import type { Node, Pt, RoadNetwork, Seg } from './network';

/** how far from a road the ends may be (tiles) */
const REACH = 12;

/** the nearest point on segment s to p, its share t (0 at a, 1 at b) and its distance */
function onSeg(s: Seg, p: Pt): { x: number; y: number; t: number; d: number } {
  const dx = s.b.x - s.a.x, dy = s.b.y - s.a.y, L2 = dx * dx + dy * dy, t = L2 > 0 ? Math.max(0, Math.min(1, ((p.x - s.a.x) * dx + (p.y - s.a.y) * dy) / L2)) : 0;
  const x = s.a.x + dx * t, y = s.a.y + dy * t; return { x, y, t, d: Math.hypot(p.x - x, p.y - y) };
}
/** the car road nearest p within REACH, and the point on it */
function nearestRoad(net: RoadNetwork, p: Pt, ok: (s: Seg) => boolean): { s: Seg; x: number; y: number; t: number } | null {
  let best: { s: Seg; x: number; y: number; t: number } | null = null, bd = REACH;
  for (const s of net.segsNear(p, REACH)) { if (!ok(s)) continue; const q = onSeg(s, p); if (q.d < bd) { bd = q.d; best = { s, x: q.x, y: q.y, t: q.t }; } }
  return best;
}
const len = (s: Seg) => Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);

/** the drive along the car roads from the road nearest `from` to the road nearest `to`: the point on the first road, the junctions on the way and
 *  the point on the last road (tiles); null when either end is off the roads or no road joins them. ok: the roads a car may take */
export function roadRoute(net: RoadNetwork, from: Pt, to: Pt, ok: (s: Seg) => boolean = s => !s.cls.noCars): Pt[] | null {
  const A = nearestRoad(net, from, ok), B = nearestRoad(net, to, ok);
  if (!A || !B) return null;
  const pa = { x: A.x, y: A.y }, pb = { x: B.x, y: B.y };
  if (A.s === B.s) return [pa, pb];
  // Dijkstra from A's two ends (each at its distance along A) to B's two ends (plus the rest of the way along B)
  const dist = new Map<Node, number>(), prev = new Map<Node, Node>(), done = new Set<Node>(), heap: [number, Node][] = [];
  const push = (d: number, n: Node) => { heap.push([d, n]); let i = heap.length - 1; while (i > 0) { const j = (i - 1) >> 1; if (heap[j]![0] <= heap[i]![0]) break; [heap[i], heap[j]] = [heap[j]!, heap[i]!]; i = j; } };
  const pop = (): [number, Node] => {
    const top = heap[0]!, last = heap.pop()!;
    if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l]![0] < heap[m]![0]) m = l; if (r < heap.length && heap[r]![0] < heap[m]![0]) m = r; if (m === i) break; [heap[i], heap[m]] = [heap[m]!, heap[i]!]; i = m; } }
    return top;
  };
  const relax = (n: Node, d: number, from: Node | null) => { if (d < (dist.get(n) ?? Infinity)) { dist.set(n, d); if (from) prev.set(n, from); else prev.delete(n); push(d, n); } };
  relax(A.s.a, A.t * len(A.s), null); relax(A.s.b, (1 - A.t) * len(A.s), null);
  const tail = new Map<Node, number>([[B.s.a, B.t * len(B.s)], [B.s.b, (1 - B.t) * len(B.s)]]);
  let end: Node | null = null, endD = Infinity;
  while (heap.length) {
    const [d, n] = pop(); if (done.has(n)) continue; done.add(n);
    if (d >= endD) break;
    const t = tail.get(n); if (t !== undefined && d + t < endD) { endD = d + t; end = n; }
    for (const s of n.segs) { if (!ok(s)) continue; const o = s.a === n ? s.b : s.a; if (!done.has(o)) relax(o, d + len(s), n); }
  }
  if (!end) return null;
  const nodes: Node[] = []; for (let n: Node | undefined = end; n; n = prev.get(n)) nodes.push(n);
  nodes.reverse();
  // (an end on a junction itself is that junction once: no leg of no length)
  const out: Pt[] = [];
  for (const p of [pa, ...nodes.map(n => ({ x: n.x, y: n.y })), pb]) { const q = out[out.length - 1]; if (!q || Math.hypot(p.x - q.x, p.y - q.y) > 1e-6) out.push(p); }
  return out;
}
