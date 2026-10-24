// The edge field of a course layer (plan P21 section 3.4, T077): the signed distance to a surface's true boundary and the sun facing
// there, sampled on a small image over a tile box, for paint-edges.ts edgeImages (its light rim, dark rim and cast shadow). Unlike
// paint-edges' edgeField (one closed polygon), the inside comes from the layer's fill rings (even-odd, clipped to the chunk) and the
// distance from its edge polylines only (the true boundary, cut at the chunk box; the neighbouring chunks' edges are passed too, so
// both sides of a seam see the same curve and the light runs on across it). The surface lies on the left of each polyline's travel, so
// the outward normal is (dy, -dx) for holes and outer rings alike.
// Pure TypeScript, no DOM, deterministic. Units: tiles of 2 m; res = image px per tile.
import { SUN_TILE_DIR } from '../course-height';
import type { EdgeField } from '../../paint-edges';

/** the edge field over tiles [x0, x0 + w) x [y0, y0 + h) at res px per tile, out to reach tiles from the boundary: inside = even-odd of
 *  rings (flat closed rings, tiles), d = signed distance to the nearest edge polyline (+ inside, clamped to +-reach), sun = the outward
 *  direction's sun facing there (rounded about a polyline's corners and ends); no seams. Cost: one scanline pass for inside, then the px
 *  within reach of each segment, so it scales with the edges' length, not the box */
export function lineField(rings: readonly (readonly number[])[], edges: readonly (readonly number[])[], x0: number, y0: number, w: number, h: number, res: number, reach: number): EdgeField {
  const W = Math.max(1, Math.ceil(w * res)), H = Math.max(1, Math.ceil(h * res)), N = W * H;
  const d = new Float32Array(N).fill(reach), sun = new Float32Array(N), seam = new Uint8Array(N), inside = new Uint8Array(N);
  // inside: even-odd crossings of every ring along each px row
  const xs: number[] = [];
  for (let v = 0; v < H; v++) {
    const ty = y0 + (v + 0.5) / res; xs.length = 0;
    for (const p of rings) {
      const n = p.length >> 1;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n, ay = p[2 * i + 1]!, by = p[2 * j + 1]!;
        if ((ay <= ty) !== (by <= ty)) { const ax = p[2 * i]!, bx = p[2 * j]!; xs.push(ax + ((ty - ay) * (bx - ax)) / (by - ay)); }
      }
    }
    if (xs.length < 2) continue;
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const u0 = Math.max(0, Math.ceil((xs[k]! - x0) * res - 0.5)), u1 = Math.min(W - 1, Math.ceil((xs[k + 1]! - x0) * res - 0.5) - 1);
      for (let u = u0; u <= u1; u++) inside[v * W + u] = 1;
    }
  }
  // the distance to each segment over its band (the rows within reach, each row's x extent grown by reach)
  const sx = SUN_TILE_DIR.x, sy = SUN_TILE_DIR.y, bx0 = x0 - reach, by0 = y0 - reach, bx1 = x0 + w + reach, by1 = y0 + h + reach;
  let any = false;
  for (const p of edges) for (let i = 0; i + 3 < p.length; i += 2) {
    const ax = p[i]!, ay = p[i + 1]!, bx = p[i + 2]!, by = p[i + 3]!;
    if (Math.max(ax, bx) < bx0 || Math.min(ax, bx) > bx1 || Math.max(ay, by) < by0 || Math.min(ay, by) > by1) continue;
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
    if (len2 < 1e-12) continue;
    const len = Math.sqrt(len2), fEdge = (dy / len) * sx + (-dx / len) * sy;
    const v0 = Math.max(0, Math.floor((Math.min(ay, by) - reach - y0) * res - 0.5)), v1 = Math.min(H - 1, Math.ceil((Math.max(ay, by) + reach - y0) * res - 0.5));
    for (let v = v0; v <= v1; v++) {
      const ty = y0 + (v + 0.5) / res;
      let t0 = 0, t1 = 1;
      if (Math.abs(dy) < 1e-9) { if (Math.abs(ay - ty) > reach) continue; }
      else { let ta = (ty - reach - ay) / dy, tb = (ty + reach - ay) / dy; if (ta > tb) { const s = ta; ta = tb; tb = s; } t0 = Math.max(0, ta); t1 = Math.min(1, tb); if (t0 > t1) continue; }
      const xa = ax + dx * t0, xb = ax + dx * t1;
      const u0 = Math.max(0, Math.floor((Math.min(xa, xb) - reach - x0) * res - 0.5)), u1 = Math.min(W - 1, Math.ceil((Math.max(xa, xb) + reach - x0) * res - 0.5));
      for (let u = u0; u <= u1; u++) {
        const tx = x0 + (u + 0.5) / res, t = Math.max(0, Math.min(1, ((tx - ax) * dx + (ty - ay) * dy) / len2));
        const ex = tx - (ax + dx * t), ey = ty - (ay + dy * t), dist = Math.sqrt(ex * ex + ey * ey), k = v * W + u;
        if (dist >= d[k]!) continue;
        d[k] = dist; any ||= dist < reach;
        // past a segment's end the facing turns with the direction from the boundary to the px (outside) or back (inside), so corners and
        // the polyline's ends round smoothly from one segment's light to the next
        sun[k] = (t <= 0 || t >= 1) && dist > 1e-4 ? ((inside[k] ? -1 : 1) * (ex * sx + ey * sy)) / dist : fEdge;
      }
    }
  }
  for (let k = 0; k < N; k++) if (!inside[k]) d[k] = -d[k]!;
  return { x0, y0, W, H, res, d, sun, seam, any };
}
