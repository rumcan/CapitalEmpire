// The way to a place the roads do not reach (T321, #912; the owner, 2026-11-03: "the main road has been removed and cars drive on grass to get
// to the course ... we need see if they can use the road untill they get closer and then drive on the grass if you delete the road"). A car keeps
// to the town's main road network for as long as it brings it closer: it drives the roads to the road point nearest its destination (a car park's
// entrance), and only then leaves them for a short drive over the grass (a grid A* round what it may not cross: buildings, water, greens, tees and
// bunkers; the rough and the fescue cheapest); home, the same the other way. It never builds or mends a road (the roads are the player's job).
// Pure: the network and a cost function only, no Game. Worked out once per network edit (the engine caches it by the network's version), never
// per frame. Headless test: tests/offroad.test.ts.
import type { Node, Pt, RoadNetwork, Seg } from './network';

/** how far back along the roads from the point it leaves them a car is first drawn (tiles), as the range's cars down the county road */
export const APPROACH = 46;
/** the roads a car may drive: every road but the cart and walking paths */
export const carRoad = (s: Seg): boolean => !s.cls.noCars;
const len = (s: Seg) => Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);

/** the town's main road network: the connected car roads with the most length (a piece cut off by a deleted road is not the way in) */
export function mainRoads(net: RoadNetwork, ok: (s: Seg) => boolean = carRoad): Set<Seg> {
  const seen = new Set<Seg>(); let best = new Set<Seg>(), bestL = 0;
  for (const s0 of net.segs) {
    if (seen.has(s0) || !ok(s0)) continue;
    const comp = new Set<Seg>([s0]), stack: Node[] = [s0.a, s0.b]; let L = len(s0); seen.add(s0);
    while (stack.length) {
      const n = stack.pop()!;
      for (const s of n.segs) { if (seen.has(s) || !ok(s)) continue; seen.add(s); comp.add(s); L += len(s); stack.push(s.a === n ? s.b : s.a); }
    }
    if (L > bestL) { bestL = L; best = comp; }
  }
  return best;
}

/** a point on a road: its seg, the point, its share t along the seg (0 at a) and its distance from the point asked about */
export interface RoadPoint { s: Seg; x: number; y: number; t: number; d: number }
function onSeg(s: Seg, p: Pt): RoadPoint {
  const dx = s.b.x - s.a.x, dy = s.b.y - s.a.y, L2 = dx * dx + dy * dy, t = L2 > 0 ? Math.max(0, Math.min(1, ((p.x - s.a.x) * dx + (p.y - s.a.y) * dy) / L2)) : 0;
  const x = s.a.x + dx * t, y = s.a.y + dy * t; return { s, x, y, t, d: Math.hypot(p.x - x, p.y - y) };
}
/** the point of the roads `roads` nearest p (searched near p first, rings of growing reach, then all of them), or null with none */
export function nearestOn(net: RoadNetwork, roads: Set<Seg>, p: Pt): RoadPoint | null {
  if (!roads.size) return null;
  for (let r = 12; r <= 768; r *= 4) {
    let best: RoadPoint | null = null;
    for (const s of net.segsNear(p, r)) { if (!roads.has(s)) continue; const q = onSeg(s, p); if (!best || q.d < best.d) best = q; }
    if (best && best.d <= r) return best;
  }
  let best: RoadPoint | null = null;
  for (const s of roads) { const q = onSeg(s, p); if (!best || q.d < best.d) best = q; }
  return best;
}
/** whether a car road (of `roads`; null: any) passes within tol tiles of p */
export function nearRoads(net: RoadNetwork, roads: Set<Seg> | null, p: Pt, tol: number): boolean {
  for (const s of net.segsNear(p, tol)) if ((roads ? roads.has(s) : carRoad(s)) && onSeg(s, p).d <= tol) return true;
  return false;
}
/** whether polylines run on car roads all along (sampled every `every` tiles, each sample within tol of one) */
export function linesOnRoads(net: RoadNetwork, lines: readonly (readonly Pt[])[], tol = 3, every = 3): boolean {
  for (const l of lines) for (let i = 1; i < l.length; i++) {
    const a = l[i - 1]!, b = l[i]!, n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / every));
    for (let k = 0; k <= n; k++) if (!nearRoads(net, null, { x: a.x + (b.x - a.x) * k / n, y: a.y + (b.y - a.y) * k / n }, tol)) return false;
  }
  return true;
}

/** the drive along the roads `roads` that ends at road point `at`, from `back` tiles before it along the roads (or from the road point furthest
 *  from it, a network shorter than that): its points, the first `back` tiles out, the last `at` itself */
export function approach(roads: Set<Seg>, at: RoadPoint, back = APPROACH): Pt[] {
  const end = { x: at.x, y: at.y }, L0 = len(at.s);
  // (along at's own seg far enough already)
  const da = at.t * L0, db = (1 - at.t) * L0;
  if (Math.max(da, db) >= back) {
    const n = da >= db ? at.s.a : at.s.b, k = back / Math.max(da >= db ? da : db, 1e-9);
    return [{ x: end.x + (n.x - end.x) * k, y: end.y + (n.y - end.y) * k }, end];
  }
  const dist = new Map<Node, number>(), prev = new Map<Node, Node>(), done = new Set<Node>(), heap: [number, Node][] = [];
  const push = (d: number, n: Node) => { heap.push([d, n]); let i = heap.length - 1; while (i > 0) { const j = (i - 1) >> 1; if (heap[j]![0] <= heap[i]![0]) break; [heap[i], heap[j]] = [heap[j]!, heap[i]!]; i = j; } };
  const pop = (): [number, Node] => {
    const top = heap[0]!, last = heap.pop()!;
    if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l]![0] < heap[m]![0]) m = l; if (r < heap.length && heap[r]![0] < heap[m]![0]) m = r; if (m === i) break; [heap[i], heap[m]] = [heap[m]!, heap[i]!]; i = m; } }
    return top;
  };
  const relax = (n: Node, d: number, from: Node | null) => { if (d < (dist.get(n) ?? Infinity)) { dist.set(n, d); if (from) prev.set(n, from); else prev.delete(n); push(d, n); } };
  relax(at.s.a, da, null); relax(at.s.b, db, null);
  let far: Node | null = null, farD = -1, cut: Pt | null = null, cutFrom: Node | null = null;
  while (heap.length && !cut) {
    const [d, n] = pop(); if (done.has(n)) continue; done.add(n);
    if (d > farD) { farD = d; far = n; }
    for (const s of n.segs) {
      if (!roads.has(s) || s === at.s) continue; // (never back past the end over its own seg)
      const o = s.a === n ? s.b : s.a, l = len(s);
      if (d + l >= back) { const k = (back - d) / Math.max(l, 1e-9); cut = { x: n.x + (o.x - n.x) * k, y: n.y + (o.y - n.y) * k }; cutFrom = n; break; }
      if (!done.has(o)) relax(o, d + l, n);
    }
  }
  const from = cut ? cutFrom : far;
  const pts: Pt[] = cut ? [cut] : [];
  for (let n: Node | undefined = from ?? undefined; n; n = prev.get(n)) pts.push({ x: n.x, y: n.y });
  pts.push(end);
  // (no leg of no length)
  const out: Pt[] = [];
  for (const p of pts) { const q = out[out.length - 1]; if (!q || Math.hypot(p.x - q.x, p.y - q.y) > 1e-6) out.push(p); }
  if (out.length < 2) out.unshift({ x: end.x, y: end.y });
  return out;
}

/** the drive over open ground from a to b (tiles): a grid A* on cells of `step` tiles over the box round a and b (grown by pad, at most maxSide
 *  cells a side), each cell's cost cost(x, y) per tile (1 the cheapest; Infinity: never crossed), then pulled straight where a straight line
 *  crosses nothing dearer than the cells it skips. Its points, a first and b last; the straight line when nothing better is found */
export function gridPath(a: Pt, b: Pt, cost: (x: number, y: number) => number, maxSide = 192, pad = 16): Pt[] {
  // (shut in within the box: a wider one, twice; then the straight line, never stuck)
  for (const k of [1, 4, 16]) { const p = gridSearch(a, b, cost, maxSide, pad * k); if (p) return p; }
  return [{ x: a.x, y: a.y }, { x: b.x, y: b.y }];
}
function gridSearch(a: Pt, b: Pt, cost: (x: number, y: number) => number, maxSide: number, pad: number): Pt[] | null {
  const x0 = Math.min(a.x, b.x) - pad, y0 = Math.min(a.y, b.y) - pad, W = Math.abs(a.x - b.x) + 2 * pad, H = Math.abs(a.y - b.y) + 2 * pad;
  const step = Math.max(1, Math.ceil(Math.max(W, H) / maxSide)), gw = Math.ceil(W / step) + 1, gh = Math.ceil(H / step) + 1, N = gw * gh;
  const c = new Float32Array(N);
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) { const v = cost(x0 + i * step, y0 + j * step); c[j * gw + i] = v > 0 ? v : 1; }
  const cellOf = (p: Pt) => Math.max(0, Math.min(gw - 1, Math.round((p.x - x0) / step))) + Math.max(0, Math.min(gh - 1, Math.round((p.y - y0) / step))) * gw;
  const s = cellOf(a), t = cellOf(b);
  // (the ends are where the car is: open whatever lies there)
  if (!Number.isFinite(c[s]!)) c[s] = 1; if (!Number.isFinite(c[t]!)) c[t] = 1;
  const g = new Float64Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
  const hi: number[] = [], hf: number[] = [];
  const push = (i: number, f: number) => { hi.push(i); hf.push(f); let k = hi.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (hf[p]! <= hf[k]!) break; [hi[k], hi[p]] = [hi[p]!, hi[k]!]; [hf[k], hf[p]] = [hf[p]!, hf[k]!]; k = p; } };
  const pop = (): number => {
    const top = hi[0]!, li = hi.pop()!, lf = hf.pop()!;
    if (hi.length) { hi[0] = li; hf[0] = lf; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < hi.length && hf[l]! < hf[m]!) m = l; if (r < hi.length && hf[r]! < hf[m]!) m = r; if (m === k) break; [hi[k], hi[m]] = [hi[m]!, hi[k]!]; [hf[k], hf[m]] = [hf[m]!, hf[k]!]; k = m; } }
    return top;
  };
  const tx = t % gw, ty = (t - tx) / gw;
  const h = (i: number) => { const dx = Math.abs(i % gw - tx), dy = Math.abs(Math.floor(i / gw) - ty); return (Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy)) * step; };
  g[s] = 0; push(s, h(s));
  while (hi.length) {
    const u = pop(); if (closed[u]) continue; closed[u] = 1;
    if (u === t) break;
    const ux = u % gw, uy = (u - ux) / gw;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const vx = ux + dx, vy = uy + dy; if (vx < 0 || vy < 0 || vx >= gw || vy >= gh) continue;
      const v = vy * gw + vx; if (closed[v] || !Number.isFinite(c[v]!)) continue;
      // (no corner cut past something it may not cross)
      if (dx && dy && (!Number.isFinite(c[uy * gw + vx]!) || !Number.isFinite(c[vy * gw + ux]!))) continue;
      const nd = g[u]! + (dx && dy ? Math.SQRT2 : 1) * step * (c[u]! + c[v]!) / 2;
      if (nd < g[v]!) { g[v] = nd; from[v] = u; push(v, nd + h(v)); }
    }
  }
  if (!Number.isFinite(g[t]!)) return null;
  const cells: number[] = []; for (let i = t; i >= 0; i = from[i]!) { cells.push(i); if (i === s) break; }
  cells.reverse();
  const at = (i: number): Pt => ({ x: x0 + (i % gw) * step, y: y0 + Math.floor(i / gw) * step });
  // pulled straight: from each kept cell, on to the furthest cell a straight line reaches crossing nothing dearer than the cells it skips
  const clear = (i: number, j: number, lim: number) => {
    const p = at(cells[i]!), q = at(cells[j]!), n = Math.max(1, Math.ceil(Math.hypot(q.x - p.x, q.y - p.y) / (step * 0.5)));
    for (let k = 1; k < n; k++) { const v = c[cellOf({ x: p.x + (q.x - p.x) * k / n, y: p.y + (q.y - p.y) * k / n })]!; if (!(v <= lim)) return false; }
    return true;
  };
  const out: Pt[] = [{ x: a.x, y: a.y }];
  for (let i = 0; i < cells.length - 1;) {
    let j = i + 1, lim = Math.max(c[cells[i]!]!, c[cells[j]!]!);
    while (j + 1 < cells.length) { const l2 = Math.max(lim, c[cells[j + 1]!]!); if (!clear(i, j + 1, l2)) break; j++; lim = l2; }
    out.push(j === cells.length - 1 ? { x: b.x, y: b.y } : at(cells[j]!)); i = j;
  }
  if (out.length === 1) out.push({ x: b.x, y: b.y });
  return out;
}

/** a car's way to a place the roads do not reach: road, its drive along the roads (from APPROACH tiles back to the point it leaves them); grass,
 *  the drive over the ground from there (the points after it, the place last) */
export interface OffRoad { road: Pt[]; grass: Pt[] }
/** the way to e for a car coming by the roads `roads` (mainRoads): along them to their point nearest e, then over the ground (gridPath with
 *  cost); null when there are no roads */
export function offRoadTo(net: RoadNetwork, roads: Set<Seg>, e: Pt, cost: (x: number, y: number) => number): OffRoad | null {
  const at = nearestOn(net, roads, e); if (!at) return null;
  const road = approach(roads, at), p = road[road.length - 1]!;
  const grass = at.d < 0.5 ? [{ x: e.x, y: e.y }] : gridPath(p, e, cost).slice(1);
  return { road, grass };
}
