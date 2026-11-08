// Holes worked out from the fairways (T340 stage 2, #967): a course whose map data has no hole lines at all (Wingate Park: tees, fairways, greens and
// bunkers, no `golf=hole`, no pins, no numbers) still shows where its holes are. Each fairway has a long axis (the two points of its outline farthest
// apart); the green within DERIVE_GREEN of one end is the hole's green, and the tee polygons beyond the other end (roughly on the axis, at most
// DERIVE_TEE_BEYOND m from it) are its tees, the largest of them the main one. The line runs tee, fairway, green. The holes are numbered by walking: the
// first is the one whose tee is farthest from every other hole's green, then from each green to the nearest unused tee. The converter marks every one of
// these with the `holes-derived` warning, so they are never passed off as mapped data. Pure TypeScript, no DOM, deterministic.
import { distToPoly, interiorPoint, polyArea, type P, type Poly } from './geom';

/** a polygon of the map as the derivation reads it: its outline and a point inside it */
export interface DArea { poly: Poly; c: P }
/** a hole worked out: its line (the main tee, a point of the fairway when it lies between, the green), its fairway, its green, and its tee polygons (the main one first) */
export interface Derived { pts: P[]; fairway: DArea; green: DArea; tees: DArea[] }

/** the green must be within this of an end of the fairway's long axis, m */
export const DERIVE_GREEN = 40;
/** the tees lie beyond the other end: at most this far along the axis, at most TEE_INSIDE m back inside the fairway, at most TEE_SIDE m off the axis, m */
export const DERIVE_TEE_BEYOND = 300;
const TEE_INSIDE = 40, TEE_SIDE = 80;
/** tee polygons within this of one another are one hole's tees, m */
const TEE_LINK = 80;
/** a fairway shorter than this (its long axis) is not a hole, m */
const MIN_AXIS = 60;

const dist = (a: P, b: P): number => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** the two points of a polygon's outer ring farthest apart: the ends of its long axis (the ring is thinned to at most 240 points to find them, then the
 *  ends are refined over every point) */
export function longAxis(poly: Poly): [P, P] {
  const r = poly.outer, step = Math.max(1, Math.ceil(r.length / 240)), pts: P[] = [];
  for (let i = 0; i < r.length; i += step) pts.push(r[i]!);
  let best = -1, a = pts[0]!, b = pts[0]!;
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) { const d = (pts[i]![0] - pts[j]![0]) ** 2 + (pts[i]![1] - pts[j]![1]) ** 2; if (d > best) { best = d; a = pts[i]!; b = pts[j]!; } }
  const far = (from: P): P => { let m = -1, q = r[0]!; for (const p of r) { const d = (p[0] - from[0]) ** 2 + (p[1] - from[1]) ** 2; if (d > m) { m = d; q = p; } } return q; };
  a = far(b); b = far(a);
  return [a, b];
}

/** the holes the fairways, greens and tees make (see the file's header), in the order they are walked, and a line of text for each fairway that made none */
export function deriveHoleLines(fairways: readonly DArea[], greens: readonly DArea[], tees: readonly DArea[]): { holes: Derived[]; skipped: string[] } {
  interface Cand extends Derived { gd: number }
  const cands: Cand[] = [], skipped: string[] = [];
  const where = (p: P) => `(${Math.round(p[0])}, ${Math.round(p[1])} m)`;
  for (const f of fairways) {
    const [a, b] = longAxis(f.poly);
    if (dist(a, b) < MIN_AXIS) { skipped.push(`The fairway at ${where(f.c)} is under ${MIN_AXIS} m long: not made into a hole`); continue; }
    // the green nearest to either end: that end is the green's, the other is the tee's
    let g: DArea | null = null, gd = Infinity, X = a, Y = b;
    for (const [e, o] of [[a, b], [b, a]] as const) for (const q of greens) { const d = distToPoly(q.poly, e[0], e[1]); if (d < gd) { gd = d; g = q; X = e; Y = o; } }
    if (!g || gd > DERIVE_GREEN) { skipped.push(`The fairway at ${where(f.c)} has no green within ${DERIVE_GREEN} m of either end: not made into a hole`); continue; }
    const L = dist(X, Y), dx = (X[0] - Y[0]) / L, dy = (X[1] - Y[1]) / L;
    // the tees beyond the far end: their distance along the axis past it, and off it
    const near = tees.filter(t => { const vx = t.c[0] - Y[0], vy = t.c[1] - Y[1], along = -(vx * dx + vy * dy), side = Math.abs(vx * dy - vy * dx); return along >= -TEE_INSIDE && along <= DERIVE_TEE_BEYOND && side <= TEE_SIDE; });
    if (!near.length) { skipped.push(`The fairway at ${where(f.c)} has a green but no tee within ${DERIVE_TEE_BEYOND} m beyond its far end: not made into a hole`); continue; }
    near.sort((p, q) => dist(p.c, Y) - dist(q.c, Y));
    const cluster = [near[0]!];
    for (let i = 0; i < cluster.length; i++) for (const t of near) {
      if (cluster.includes(t)) continue;
      if (Math.min(distToPoly(cluster[i]!.poly, t.c[0], t.c[1]), distToPoly(t.poly, cluster[i]!.c[0], cluster[i]!.c[1])) <= TEE_LINK) cluster.push(t);
    }
    cluster.sort((p, q) => polyArea(q.poly) - polyArea(p.poly)); // the main tee (the largest) first
    const start = cluster[0]!.c, end = interiorPoint(g.poly), mid = interiorPoint(f.poly);
    const cx = end[0] - start[0], cy = end[1] - start[1], cl = Math.hypot(cx, cy) || 1, t = ((mid[0] - start[0]) * cx + (mid[1] - start[1]) * cy) / (cl * cl);
    cands.push({ pts: t >= 0.15 && t <= 0.85 ? [start, mid, end] : [start, end], fairway: f, green: g, tees: cluster, gd });
  }
  // each green and each tee set serves one hole: the fairway whose green is nearest to its end keeps it
  cands.sort((p, q) => p.gd - q.gd);
  const holes: Cand[] = [];
  for (const c of cands) {
    const clash = holes.find(h => h.green === c.green || h.tees.some(t => c.tees.includes(t)));
    if (clash) { skipped.push(`The fairway at ${where(c.fairway.c)} shares its ${clash.green === c.green ? 'green' : 'tee'} with another: left out`); continue; }
    holes.push(c);
  }
  if (holes.length > 18) { skipped.push(`${holes.length - 18} more fairways than the game's 18 holes: left out`); holes.length = 18; }
  if (holes.length < 2) return { holes, skipped };
  // the order: the first hole's tee is farthest from every other hole's green; then from each green to the nearest unused tee
  const start = (h: Derived) => h.pts[0]!, end = (h: Derived) => h.pts[h.pts.length - 1]!;
  let first = 0, score = -1;
  holes.forEach((h, i) => { const s = Math.min(...holes.filter((_, j) => j !== i).map(o => dist(start(h), end(o)))); if (s > score) { score = s; first = i; } });
  const order: Cand[] = [holes[first]!], left = holes.filter((_, i) => i !== first);
  while (left.length) {
    const cur = end(order[order.length - 1]!);
    let bi = 0, bd = Infinity;
    left.forEach((h, i) => { const d = dist(cur, start(h)); if (d < bd) { bd = d; bi = i; } });
    order.push(left.splice(bi, 1)[0]!);
  }
  return { holes: order, skipped };
}
