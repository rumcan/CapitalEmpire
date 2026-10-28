// Soft dirt edges (T247, issue #717; the owner, 2026-10-28, of a large dirt patch on the map's golden fescue at a mid zoom: "soften this
// transition between dirt and fescie at this zoom level"). Drawing only: what is owned, paid for or placed never changes.
// Where dirt or desert meets grass (the living ground's dirt patches on the fescue, renderer.ts drawLiving; the dirt and desert areas: painted,
// lot ground, desert lawns) the hard outline becomes a band whose world width grows as the cache level falls (it spans about SOFT.px cache px
// at every zoom, so it reads soft at mid and far zoom, not only close up). Across the band a world-space noise is thresholded: past the
// threshold the dirt, short of it the grass, each spot one or the other with a crisp tuft edge (never a blurred gradient, never two pictures
// cross-faded), so fescue tufts creep over the dirt and dirt shows between the tufts. The threshold runs from 0 at the band's inner edge to 1
// at its outer edge and the noise is symmetric about 0.5, so the dirt's 50% line is the old outline: no patch moves or changes its shape.
// The noise is world-space value noise (never periodic), the same in every chunk and on every bake; neighbouring chunks agree at their seams.
// Pure TypeScript, no DOM, deterministic. Units: tiles of 2 m; L = the ground cache level (cache px per world px); r = image px per tile.
import { HH, HW } from './iso';
import { vnoise } from './living-ground';
import { isCellSeam, smooth01 } from './paint-edges';

/** the length of a tile's side on screen at zoom 1, px */
const TILE_PX = Math.hypot(HW, HH);

/** the band's numbers:
 *  - px: its width in cache px (the world width is px / (TILE_PX L) tiles: wider in tiles at the far levels), held to [min, max] tiles;
 *  - imgPx: about how many cache px an image px covers (the bilinear stretch smooths between), at most resMax image px a tile; imgPxFar at
 *    the far levels (cache level farL and below: the district chunks, whose images span four chunks' width), eased between from 1.5 farL;
 *  - waves: the threshold noise's wavelengths as shares of the band width (a clump and its tufts), weights and seeds; each wave at least
 *    waveMin image px (finer would alias);
 *  - sd: the summed waves' spread about 0.5 (value noise bunches near its middle): the noise is evened out by it (a logistic stand-in for
 *    the normal curve), so the threshold's crossings spread across the whole band and the dirt thins out evenly from its inner to its
 *    outer edge;
 *  - flat: how the threshold runs across the band: |u|^flat of the way out from its middle (u -1 at the inner edge, 1 at the outer), so the
 *    mixed middle is wide (most of the band is tufts of both, not mostly one with a few of the other; 1 would be a straight run) and it still
 *    meets whole dirt and whole grass at the band's edges;
 *  - edge: half the threshold's soft step in noise units (a tuft's own edge: a px or so, never a fade);
 *  - probe: how far outside an area's outline (tiles, at least, and as a share of the band) the ground is read for what it meets;
 *  - areaK: an area's band is at most this share of the square root of its area (a small dirt patch keeps a body: a band as wide as the
 *    patch would leave only specks);
 *  - ease: the stretch of an outline (tiles, at least, and as a share of the band) over which the band eases to a hard edge where the area
 *    meets something it must not blend into (a later area, paving, water, a road) */
export const SOFT = {
  px: 64, min: 0.9, max: 10,
  imgPx: 1.75, imgPxFar: 3, farL: 0.1, resMax: 10,
  waves: [[0.4, 0.3, 401], [0.16, 0.35, 409], [0.07, 0.35, 419]] as readonly (readonly [number, number, number])[], waveMin: 2.2,
  sd: 0.125, flat: 1.7, edge: 0.07,
  probe: 0.4, probeK: 0.35, areaK: 0.4, ease: 1.5, easeK: 1,
} as const;

/** the band's width (tiles) at cache level L: SOFT.px cache px, held to [SOFT.min, SOFT.max] (wider in tiles as L falls) */
export function softWidth(L: number): number {
  return Math.min(SOFT.max, Math.max(SOFT.min, SOFT.px / (TILE_PX * Math.max(L, 1e-3))));
}
/** an area's band width (tiles) at cache level L: softWidth, at most SOFT.areaK of the square root of its area (tiles²), at least SOFT.min */
export function softAreaWidth(L: number, area: number): number {
  return Math.min(softWidth(L), Math.max(SOFT.min, SOFT.areaK * Math.sqrt(Math.max(0, area))));
}
/** the band images' resolution at cache level L, image px per tile: about one image px per SOFT.imgPx cache px, at most SOFT.resMax */
export function softRes(L: number): number {
  const k = Math.min(1, Math.max(0, (1.5 * SOFT.farL - L) / (0.5 * SOFT.farL))), px = SOFT.imgPx + (SOFT.imgPxFar - SOFT.imgPx) * k;
  return Math.min(SOFT.resMax, Math.max(0.5, (TILE_PX * Math.max(L, 1e-3)) / px));
}

/** the threshold noise at tile (x, y) for a band w tiles wide and images at r px a tile: 0..1, about evenly spread and symmetric about 0.5
 *  (world-space value noise, never periodic) */
export function softNoise(x: number, y: number, w: number, r: number): number {
  let n = 0, k = 0;
  for (const [f, wt, s] of SOFT.waves) {
    const l = Math.max(f * w, SOFT.waveMin / r);
    n += wt * vnoise(x / l + 0.37 * s, y / l - 0.53 * s, s); k += wt;
  }
  return 1 / (1 + Math.exp((-1.702 * (n / k - 0.5)) / SOFT.sd));
}

/** the dirt's share (0..1) at signed distance d (tiles: + inside the dirt, - outside) from its outline, in a band w tiles wide, with the
 *  threshold noise n there: 1 at and past the band's inner edge, 0 at and past its outer edge, between them the dirt where the noise passes
 *  the threshold (which runs from inner to outer edge), with a crisp step. w 0: the hard outline */
export function softCover(d: number, w: number, n: number): number {
  if (!(w > 1e-6)) return d > 0 ? 1 : d < 0 ? 0 : 0.5;
  const h = w / 2;
  if (d >= h) return 1;
  if (d <= -h) return 0;
  // the threshold from -edge (inner edge: every noise value passes) to 1 + edge (outer edge: none does), flat about the middle
  const u = (-2 * d) / w, ts = 0.5 + 0.5 * Math.sign(u) * Math.abs(u) ** SOFT.flat, e = SOFT.edge, t = -e + ts * (1 + 2 * e);
  return smooth01((n - (t - e)) / (2 * e));
}

/** a band image: one byte (alpha) a px over the tile box from (x0, y0), W x H px at r px a tile (px centres at x0 + (u + 0.5) / r) */
export interface SoftImage { a: Uint8ClampedArray; W: number; H: number; x0: number; y0: number; r: number }
/** a band image as RGBA (black, its alpha the band's) for putImageData */
export function softRGBA(img: SoftImage, out?: Uint8ClampedArray): Uint8ClampedArray {
  const n = img.W * img.H, o = out && out.length === n * 4 ? out : new Uint8ClampedArray(n * 4);
  for (let k = 0; k < n; k++) o[4 * k + 3] = img.a[k]!;
  return o;
}

/** the soft region of a living-ground mask (renderer.ts drawLiving): `a` RGBA, one px per sample (alpha the channel), W x H samples at res a
 *  tile, the first sample's corner at (x0, y0) as livingMasks has it; the region is where the mask passes `level` (0..1), as maskContours'
 *  outline (the same alpha threshold). Out: the dirt's share as an image over the region's box (within `clip`, a tile box) grown by the band,
 *  at r px a tile on the world grid (so two chunks' images agree where they overlap); 255 deep inside, 0 outside; null when the region does
 *  not reach the clip box. The signed distance is the mask's level offset over its gradient (first order: exact enough within a band of the
 *  outline, where the mask is smooth), the gradient from the samples' central differences stretched bilinear like the mask */
export function softMaskImage(a: ArrayLike<number>, W: number, H: number, x0: number, y0: number, res: number, level: number, w: number, r: number, clip: readonly [number, number, number, number]): SoftImage | null {
  const N = W * H, t = Math.floor(level * 255) + 0.5, h = w / 2, far = h + 2 / Math.min(r, res) + 1;
  if (W < 2 || H < 2) return null;
  const v = new Float32Array(N);
  for (let k = 0; k < N; k++) v[k] = a[4 * k + 3]! - t;
  // the signed distance at each sample (tiles), held to +-far
  const ds = new Float32Array(N);
  let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = j * W + i, il = i > 0 ? k - 1 : k, ir = i + 1 < W ? k + 1 : k, ju = j > 0 ? k - W : k, jd = j + 1 < H ? k + W : k;
    const gx = ((v[ir]! - v[il]!) / Math.max(1, (ir - il))) * res, gy = ((v[jd]! - v[ju]!) / Math.max(1, (jd - ju) / W)) * res, g = Math.hypot(gx, gy);
    let d = v[k]! / Math.max(g, 1e-3);
    d = d > far ? far : d < -far ? -far : d;
    ds[k] = d;
    if (d > -far) { const x = x0 + (i + 0.5) / res, y = y0 + (j + 0.5) / res; if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y; }
  }
  if (bx1 < bx0) return null;
  // the image box: the samples near or inside the region, grown by a sample, within the clip box and the grid, on the world grid at r
  const g = 1 / res;
  const X0 = Math.floor(Math.max(clip[0], bx0 - g, x0 + 0.5 / res) * r) / r, Y0 = Math.floor(Math.max(clip[1], by0 - g, y0 + 0.5 / res) * r) / r;
  const X1 = Math.min(clip[2], bx1 + g, x0 + (W - 0.5) / res), Y1 = Math.min(clip[3], by1 + g, y0 + (H - 0.5) / res);
  const IW = Math.ceil((X1 - X0) * r), IH = Math.ceil((Y1 - Y0) * r);
  if (IW <= 0 || IH <= 0) return null;
  const out = new Uint8ClampedArray(IW * IH);
  let any = false;
  for (let q = 0; q < IH; q++) {
    const y = Y0 + (q + 0.5) / r, fy0 = (y - y0) * res - 0.5, j0 = Math.max(0, Math.min(H - 2, Math.floor(fy0))), fy = Math.max(0, Math.min(1, fy0 - j0));
    for (let u = 0; u < IW; u++) {
      const x = X0 + (u + 0.5) / r, fx0 = (x - x0) * res - 0.5, i0 = Math.max(0, Math.min(W - 2, Math.floor(fx0))), fx = Math.max(0, Math.min(1, fx0 - i0));
      const k = j0 * W + i0, d = (ds[k]! * (1 - fx) + ds[k + 1]! * fx) * (1 - fy) + (ds[k + W]! * (1 - fx) + ds[k + W + 1]! * fx) * fy;
      let c: number;
      if (d >= h) c = 255;
      else if (d <= -h) continue;
      else c = Math.round(255 * softCover(d, w, softNoise(x, y, w, r)));
      if (c) { out[q * IW + u] = c; any = true; }
    }
  }
  return any ? { a: out, W: IW, H: IH, x0: X0, y0: Y0, r } : null;
}

/** an outline's weights eased along it: each point's weight (0 or 1: where the area meets something it must not blend into, 0) becomes its
 *  distance along the outline (either way round) to the nearest 0, over `ease` tiles, smoothed (1 from ease on); all 1 stays 1 */
export function easeWeights(pts: ArrayLike<number>, wt: ArrayLike<number>, ease: number): Float32Array {
  const n = pts.length >> 1, out = new Float32Array(n);
  let zeros = 0; for (let i = 0; i < n; i++) if (!(wt[i]! > 0)) zeros++;
  if (!zeros) { out.fill(1); return out; }
  if (zeros === n) return out;
  const dist = new Float64Array(n).fill(Infinity);
  // two passes each way round the ring (twice, so a run wraps past its start)
  for (const dir of [1, -1]) {
    let run = Infinity;
    for (let s = 0; s < 2 * n; s++) {
      const i = dir > 0 ? s % n : (2 * n - 1 - s) % n, h = (i - dir + n) % n;
      if (!(wt[i]! > 0)) run = 0;
      else if (run < Infinity) run += Math.hypot(pts[2 * i]! - pts[2 * h]!, pts[2 * i + 1]! - pts[2 * h + 1]!);
      if (run < dist[i]!) dist[i] = run;
    }
  }
  for (let i = 0; i < n; i++) out[i] = smooth01(dist[i]! / Math.max(ease, 1e-6));
  return out;
}

/** the soft band of a closed outline (pts, tiles, either winding; the area inside is the dirt) over the tile box `box` at r px a tile on the
 *  world grid: `a` the dirt's share (255 deep inside, 0 outside, the band between, each side's band eased to the hard outline as its weight
 *  wts eases to 0) and `p` where the band is laid (255 within it where the weight is up; 0 elsewhere: there the area keeps the hard outline it
 *  is drawn with); null when no band reaches the box. Sides on a multiple of seamCell tiles (the next cell's area carries the surface on) take no
 *  band. Cost: one scanline pass for inside, then only the px within the band of each side */
export function softRingImages(pts: ArrayLike<number>, wts: ArrayLike<number> | null, box: readonly [number, number, number, number], w: number, r: number, seamCell = 0): { a: SoftImage; p: SoftImage } | null {
  const n = pts.length >> 1; if (n < 3 || !(w > 0)) return null;
  const h = w / 2, m = 1.5 / r, reach = h + m;
  // the outline's box grown by the band, within box, on the world grid
  let px0 = Infinity, py0 = Infinity, px1 = -Infinity, py1 = -Infinity;
  for (let i = 0; i < n; i++) { const x = pts[2 * i]!, y = pts[2 * i + 1]!; if (x < px0) px0 = x; if (x > px1) px1 = x; if (y < py0) py0 = y; if (y > py1) py1 = y; }
  const X0 = Math.floor(Math.max(box[0], px0 - reach) * r) / r, Y0 = Math.floor(Math.max(box[1], py0 - reach) * r) / r;
  const X1 = Math.min(box[2], px1 + reach), Y1 = Math.min(box[3], py1 + reach);
  const W = Math.ceil((X1 - X0) * r), H = Math.ceil((Y1 - Y0) * r);
  if (W <= 0 || H <= 0) return null;
  const N = W * H, d = new Float32Array(N).fill(reach), wk = new Float32Array(N), inside = new Uint8Array(N);
  // inside: even-odd crossings along each px row
  const xs: number[] = [];
  for (let v = 0; v < H; v++) {
    const ty = Y0 + (v + 0.5) / r; xs.length = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, ay = pts[2 * i + 1]!, by = pts[2 * j + 1]!;
      if ((ay <= ty) !== (by <= ty)) { const ax = pts[2 * i]!, bx = pts[2 * j]!; xs.push(ax + ((ty - ay) * (bx - ax)) / (by - ay)); }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const u0 = Math.max(0, Math.ceil((xs[k]! - X0) * r - 0.5)), u1 = Math.min(W - 1, Math.ceil((xs[k + 1]! - X0) * r - 0.5) - 1);
      for (let u = u0; u <= u1; u++) inside[v * W + u] = 1;
    }
  }
  // the distance to each side over its band (seams excluded), and the weight along the nearest side
  let any = false;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, ax = pts[2 * i]!, ay = pts[2 * i + 1]!, bx = pts[2 * j]!, by = pts[2 * j + 1]!, dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
    if (len2 < 1e-12 || isCellSeam(ax, ay, bx, by, seamCell)) continue;
    const wa = wts ? wts[i]! : 1, wb = wts ? wts[j]! : 1;
    if (!(wa > 0) && !(wb > 0)) continue;
    const v0 = Math.max(0, Math.floor((Math.min(ay, by) - reach - Y0) * r - 0.5)), v1 = Math.min(H - 1, Math.ceil((Math.max(ay, by) + reach - Y0) * r - 0.5));
    for (let v = v0; v <= v1; v++) {
      const ty = Y0 + (v + 0.5) / r;
      let t0 = 0, t1 = 1;
      if (Math.abs(dy) < 1e-9) { if (Math.abs(ay - ty) > reach) continue; }
      else { let ta = (ty - reach - ay) / dy, tb = (ty + reach - ay) / dy; if (ta > tb) { const s = ta; ta = tb; tb = s; } t0 = Math.max(0, ta); t1 = Math.min(1, tb); if (t0 > t1) continue; }
      const xa = ax + dx * t0, xb = ax + dx * t1;
      const u0 = Math.max(0, Math.floor((Math.min(xa, xb) - reach - X0) * r - 0.5)), u1 = Math.min(W - 1, Math.ceil((Math.max(xa, xb) + reach - X0) * r - 0.5));
      for (let u = u0; u <= u1; u++) {
        const tx = X0 + (u + 0.5) / r, t = Math.max(0, Math.min(1, ((tx - ax) * dx + (ty - ay) * dy) / len2));
        const ex = tx - (ax + dx * t), ey = ty - (ay + dy * t), dist = Math.sqrt(ex * ex + ey * ey), k = v * W + u;
        if (dist >= d[k]!) continue;
        d[k] = dist; wk[k] = wa + (wb - wa) * t; any = true;
      }
    }
  }
  if (!any) return null;
  const a = new Uint8ClampedArray(N), p = new Uint8ClampedArray(N);
  let laid = false;
  for (let v = 0; v < H; v++) {
    const ty = Y0 + (v + 0.5) / r;
    for (let u = 0; u < W; u++) {
      const k = v * W + u, inK = inside[k]!, dist = d[k]!, wt = wk[k]!;
      if (dist >= reach || !(wt > 0)) { a[k] = inK ? 255 : 0; continue; }
      const we = w * wt, sd = inK ? dist : -dist;
      a[k] = Math.round(255 * (Math.abs(sd) >= we / 2 ? (inK ? 1 : 0) : softCover(sd, we, softNoise(X0 + (u + 0.5) / r, ty, w, r))));
      // laid where the band is (its eased width and a px past it), fully once the weight is a quarter up
      if (dist < we / 2 + m) { p[k] = Math.round(255 * Math.min(1, 4 * wt)); laid = true; }
    }
  }
  if (!laid) return null;
  return { a: { a, W, H, x0: X0, y0: Y0, r }, p: { a: p, W, H, x0: X0, y0: Y0, r } };
}

/** the dirt and desert the soft edge applies to: the painted dirt and desert families, or (no painted look: the photo textures) the dirt,
 *  field, rocky dirt and waste sand textures. Grass, sand traps, water, paving and the course's own surfaces keep their edges */
const SOFT_FAMILIES = new Set(['dirt-run', 'desert-run']);
const SOFT_TEXES = new Set(['dirt', 'field', 'rockyDirt', 'rockyDirtAlt', 'wasteSand']);
export function softDirt(tex: string, family: string | null | undefined): boolean {
  return family ? SOFT_FAMILIES.has(family) : SOFT_TEXES.has(tex);
}
