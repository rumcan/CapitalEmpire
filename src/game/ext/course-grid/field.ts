// The edge field of a course layer (plan P21 section 3.4, T077): the signed distance to a surface's true boundary and the sun facing
// there, sampled on a small image over a tile box, for paint-edges.ts edgeImages (its light rim, dark rim and cast shadow). Unlike
// paint-edges' edgeField (one closed polygon), the inside comes from the layer's fill rings (even-odd, clipped to the chunk) and the
// distance from its edge polylines only (the true boundary, cut at the chunk box; the neighbouring chunks' edges are passed too, so
// both sides of a seam see the same curve and the light runs on across it). The surface lies on the left of each polyline's travel, so
// the outward normal is (dy, -dx) for holes and outer rings alike.
// Pure TypeScript, no DOM, deterministic. Units: tiles of 2 m; res = image px per tile.
import { SUN_TILE_DIR } from '../course-height';
import { DARK_RGB, LIGHT_RGB, SHADOW_RGB, castWeight, edgeShade, rimWeight, sunkenWeight, type EdgeField, type EdgeImage, type EdgeLook } from '../../paint-edges';
import { HH, HW } from '../../iso';

/** the course fields' resolution at cache level L, px per tile: one image px per about 10 cache px, 1 to 4 (paint-edges' edgeRes takes 6:
 *  the course's rims and shadows are a tile or so wide and soft, so the coarser image looks the same and costs a third to a half) */
export function courseRes(L: number): number { return Math.max(1, Math.min(4, Math.round((Math.hypot(HW, HH) * L) / 10))); }

/** a course layer's edge images from its field: paint-edges' light rim, dark rim and cast shadow (its look, sun at the upper right; sunken
 *  inverted), without the feather cut (course surfaces feather outward with strokes); each null when it would draw nothing */
export function courseImages(f: EdgeField, look: Readonly<EdgeLook>, feather: number): { light: EdgeImage | null; dark: EdgeImage | null; shadow: EdgeImage | null } {
  const N = f.W * f.H, mk = () => new Uint8ClampedArray(N * 4);
  let light: Uint8ClampedArray | null = null, dark: Uint8ClampedArray | null = null, shadow: Uint8ClampedArray | null = null;
  if (f.any) for (let k = 0; k < N; k++) {
    const d = f.d[k]!, q = 4 * k;
    if (d >= 0) {
      if (look.light > 0 || look.dark > 0) {
        const rim = look.sunken ? sunkenWeight(d, feather, look.bevel) : rimWeight(d, feather, look.bevel); if (rim <= 0) continue;
        const s = edgeShade(f.sun[k]!, look.sunken), la = rim * s.light * look.light, da = rim * s.dark * look.dark;
        if (la > 0.002) { light ??= mk(); light[q] = LIGHT_RGB[0]; light[q + 1] = LIGHT_RGB[1]; light[q + 2] = LIGHT_RGB[2]; light[q + 3] = la * 255; }
        if (da > 0.002) { dark ??= mk(); dark[q] = DARK_RGB[0]; dark[q + 1] = DARK_RGB[1]; dark[q + 2] = DARK_RGB[2]; dark[q + 3] = da * 255; }
      }
      continue; // the cast shadow under the surface itself is hidden by its fill
    }
    const sa = castWeight(d, f.sun[k]!, feather, look) * look.shadow;
    if (sa > 0.002) { shadow ??= mk(); shadow[q] = SHADOW_RGB[0]; shadow[q + 1] = SHADOW_RGB[1]; shadow[q + 2] = SHADOW_RGB[2]; shadow[q + 3] = sa * 255; }
  }
  const img = (data: Uint8ClampedArray | null): EdgeImage | null => (data ? { data, W: f.W, H: f.H } : null);
  return { light: img(light), dark: img(dark), shadow: img(shadow) };
}

/** the edge field over tiles [x0, x0 + w) x [y0, y0 + h) at res px per tile, out to reach tiles from the boundary: inside = even-odd of
 *  rings (flat closed rings, tiles), d = signed distance to the nearest edge polyline (+ inside, clamped to +-reach), sun = the outward
 *  direction's sun facing there (rounded about a polyline's corners and ends); no seams. Cost: one scanline pass for inside, then the px
 *  within reach of each segment, so it scales with the edges' length, not the box. near (T253): also the nearest boundary point of each px
 *  within reach (nx, ny, tiles; the px itself beyond reach) */
export function lineField(rings: readonly ArrayLike<number>[], edges: readonly ArrayLike<number>[], x0: number, y0: number, w: number, h: number, res: number, reach: number, near = false): EdgeField & { nx?: Float32Array; ny?: Float32Array } {
  const W = Math.max(1, Math.ceil(w * res)), H = Math.max(1, Math.ceil(h * res)), N = W * H;
  const d = new Float32Array(N).fill(reach), sun = new Float32Array(N), seam = new Uint8Array(N), inside = new Uint8Array(N);
  const nx = near ? new Float32Array(N) : null, ny = near ? new Float32Array(N) : null;
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
        if (nx) { nx[k] = tx - ex; ny![k] = ty - ey; }
        // past a segment's end the facing turns with the direction from the boundary to the px (outside) or back (inside), so corners and
        // the polyline's ends round smoothly from one segment's light to the next
        sun[k] = (t <= 0 || t >= 1) && dist > 1e-4 ? ((inside[k] ? -1 : 1) * (ex * sx + ey * sy)) / dist : fEdge;
      }
    }
  }
  for (let k = 0; k < N; k++) if (!inside[k]) d[k] = -d[k]!;
  return { x0, y0, W, H, res, d, sun, seam, any, ...(nx ? { nx, ny: ny! } : {}) };
}
