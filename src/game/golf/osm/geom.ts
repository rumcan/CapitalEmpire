// Plane geometry for the map-data course converter (T340, #967). Metres, x east and y north: the frame of the stage-1 JSON
// (scripts/dev/osm-course.mjs). Pure TypeScript, no DOM, deterministic.

/** a point [x, y], metres */
export type P = readonly [number, number];
/** a polygon: its outer ring and its inner rings (holes); every ring is implicitly closed (the first point is not repeated) */
export interface Poly { outer: readonly P[]; inner: readonly (readonly P[])[] }
/** a box [minX, minY, maxX, maxY] */
export type Box = [number, number, number, number];

/** the signed area of a ring, m2 (positive when it runs counter-clockwise with y up) */
export function ringArea(r: readonly P[]): number {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j]![0] * r[i]![1] - r[i]![0] * r[j]![1];
  return a / 2;
}

/** whether (x, y) lies inside ring r (even-odd rule) */
export function inRing(r: readonly P[], x: number, y: number): boolean {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const xi = r[i]![0], yi = r[i]![1], xj = r[j]![0], yj = r[j]![1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/** whether (x, y) lies inside polygon p: inside its outer ring and in none of its holes */
export function inPoly(p: Poly, x: number, y: number): boolean {
  if (!inRing(p.outer, x, y)) return false;
  for (const h of p.inner) if (inRing(h, x, y)) return false;
  return true;
}

/** the distance from (px, py) to segment a-b */
export function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
  const t = L2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2)) : 0;
  return Math.hypot(px - ax - dx * t, py - ay - dy * t);
}

/** the distance from (x, y) to a polyline (Infinity for fewer than two points) */
export function distToLine(line: readonly P[], x: number, y: number): number {
  let best = Infinity;
  for (let i = 0; i + 1 < line.length; i++) best = Math.min(best, segDist(x, y, line[i]![0], line[i]![1], line[i + 1]![0], line[i + 1]![1]));
  return best;
}

/** the distance from (x, y) to the edge of ring r */
export function distToRing(r: readonly P[], x: number, y: number): number {
  let best = Infinity;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) best = Math.min(best, segDist(x, y, r[j]![0], r[j]![1], r[i]![0], r[i]![1]));
  return best;
}

/** the distance from (x, y) to polygon p: 0 inside it, else to the nearest edge */
export function distToPoly(p: Poly, x: number, y: number): number {
  if (inPoly(p, x, y)) return 0;
  let best = distToRing(p.outer, x, y);
  for (const h of p.inner) best = Math.min(best, distToRing(h, x, y));
  return best;
}

/** the area of polygon p, m2 (outer less its holes) */
export function polyArea(p: Poly): number {
  let a = Math.abs(ringArea(p.outer));
  for (const h of p.inner) a -= Math.abs(ringArea(h));
  return Math.max(0, a);
}

/** the box of some points, or null with none */
export function boxOf(pts: Iterable<P>): Box | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
  return x0 <= x1 ? [x0, y0, x1, y1] : null;
}
/** whether two boxes overlap */
export const boxesMeet = (a: Box, b: Box): boolean => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];

/** the area-weighted centroid of a ring (the mean of its points when it has no area) */
export function ringCentroid(r: readonly P[]): P {
  let cx = 0, cy = 0, a2 = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const c = r[j]![0] * r[i]![1] - r[i]![0] * r[j]![1];
    a2 += c; cx += (r[j]![0] + r[i]![0]) * c; cy += (r[j]![1] + r[i]![1]) * c;
  }
  if (Math.abs(a2) > 1e-9) return [cx / (3 * a2), cy / (3 * a2)];
  let sx = 0, sy = 0;
  for (const p of r) { sx += p[0]; sy += p[1]; }
  return r.length ? [sx / r.length, sy / r.length] : [0, 0];
}

/** a point inside polygon p: its centroid when that is inside, else the middle of the widest inside span over a few rows of its box */
export function interiorPoint(p: Poly): P {
  const c = ringCentroid(p.outer);
  if (inPoly(p, c[0], c[1])) return c;
  const b = boxOf(p.outer);
  if (!b) return c;
  let best = -1, bx = p.outer[0]![0], by = p.outer[0]![1];
  for (const f of [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8]) {
    const y = b[1] + (b[3] - b[1]) * f, xs: number[] = [];
    for (const ring of [p.outer, ...p.inner]) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const y0 = ring[j]![1], y1 = ring[i]![1];
        if ((y0 > y) !== (y1 > y)) xs.push(ring[j]![0] + ((y - y0) * (ring[i]![0] - ring[j]![0])) / (y1 - y0));
      }
    }
    xs.sort((u, v) => u - v);
    for (let k = 0; k + 1 < xs.length; k += 2) if (xs[k + 1]! - xs[k]! > best) { best = xs[k + 1]! - xs[k]!; bx = (xs[k]! + xs[k + 1]!) / 2; by = y; }
  }
  return best >= 0 ? [bx, by] : c;
}

/** the length of a polyline, m */
export function lineLen(line: readonly P[]): number {
  let s = 0;
  for (let i = 1; i < line.length; i++) s += Math.hypot(line[i]![0] - line[i - 1]![0], line[i]![1] - line[i - 1]![1]);
  return s;
}

/** points every `step` metres along a polyline, the first and the last included */
export function sampleLine(line: readonly P[], step: number): P[] {
  const out: P[] = [];
  if (!line.length) return out;
  out.push(line[0]!);
  let carry = 0;
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i]!, b = line[i + 1]!, L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let d = step - carry; d < L; d += step) out.push([a[0] + ((b[0] - a[0]) * d) / L, a[1] + ((b[1] - a[1]) * d) / L]);
    carry = (carry + L) % step;
  }
  const last = line[line.length - 1]!, prev = out[out.length - 1]!;
  if (Math.hypot(last[0] - prev[0], last[1] - prev[1]) > 1e-6) out.push(last);
  return out;
}

/** the part of a polyline between arc lengths d0 and d1 (m) */
export function sliceLine(line: readonly P[], d0: number, d1: number): P[] {
  const out: P[] = [];
  let acc = 0;
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i]!, b = line[i + 1]!, L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L > 0 && acc + L >= d0 && acc <= d1) {
      const u0 = (Math.max(d0, acc) - acc) / L, u1 = (Math.min(d1, acc + L) - acc) / L;
      const p: P = [a[0] + (b[0] - a[0]) * u0, a[1] + (b[1] - a[1]) * u0], q: P = [a[0] + (b[0] - a[0]) * u1, a[1] + (b[1] - a[1]) * u1];
      if (!out.length || Math.hypot(out[out.length - 1]![0] - p[0], out[out.length - 1]![1] - p[1]) > 1e-6) out.push(p);
      out.push(q);
    }
    acc += L;
  }
  return out;
}

/** the turn at b on the way a, b, c, degrees (0: straight on) */
export function bendDeg(a: P, b: P, c: P): number {
  const u = Math.atan2(b[1] - a[1], b[0] - a[0]), v = Math.atan2(c[1] - b[1], c[0] - b[0]);
  let d = Math.abs(v - u);
  if (d > Math.PI) d = 2 * Math.PI - d;
  return (d * 180) / Math.PI;
}

/** a ring of n points round c at radius r */
export function circleRing(c: P, r: number, n = 16): P[] {
  const out: P[] = [];
  for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2; out.push([c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r]); }
  return out;
}

/** a polyline widened to a band of half width `half`, as rings to be filled together (even-odd would cancel overlaps, so fill each on its own):
 *  a quad per segment and a round joint at each inner vertex */
export function bandRings(line: readonly P[], half: number): P[][] {
  const out: P[][] = [];
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i]!, b = line[i + 1]!, L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < 1e-6) continue;
    const nx = (-(b[1] - a[1]) / L) * half, ny = ((b[0] - a[0]) / L) * half;
    out.push([[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]]);
    if (i > 0) out.push(circleRing(a, half, 10));
  }
  return out;
}
