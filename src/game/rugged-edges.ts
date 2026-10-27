// Rugged grass edges (T204, issue #534; the owner, 2026-10-27: "we need better transition from fescue and rough and long gress to short. there
// needs to be a rugged edge of grass that spills over to the shorter grass and we should not see any exactly straight line or perfect 90 degree
// corners"). Drawing only: gameplay keeps the true cells and rectangles (what is owned, paid for, legal or placed never changes).
// - The outline: a painted area's corners are rounded (a radius scaled to its size, RUGGED.rMin to rMax tiles) and every soft outline (the
//   painted areas, a lot's lawn, the course's layers) is moved by one world-space wobble (wobbleAt: value noise of about 5.2, 2.5 and 1.2 tiles,
//   never periodic, a quarter of a tile on average and at most 0.8), so neighbouring chunks, rebakes and zoom levels agree, two outlines that share an edge move
//   together, and an edit elsewhere never moves an edge. Hard man-made surfaces (paving, paths, kerbs) keep their line.
// - The spill: where tall grass (fescue, rough, the map's open ground) meets short grass or dirt, the tall grass reaches over it in a ragged
//   fringe of blades (spillBlades: a clumpy world-space noise sets their length, up to SPILL.max tiles, a hash each one's lean and width), cut
//   from the tall ground's own picture and laid over the short side with a cool multiplied shade under the overhang (renderer.ts).
// Pure TypeScript, no DOM, deterministic. Units: tiles of 2 m.
import { vnoise } from './living-ground';
import { isCellSeam, smooth01 } from './paint-edges';
import { SUN_TILE_DIR } from './ext/course-height';

/** the outline's numbers:
 *  - amp: the wobble's scale (tiles, each axis; the noise keeps its mean near a fifth of this, and |offset| is eased to at most `limit`, so a
 *    point never leaves the tile of margin its patch is indexed with); its slope stays under about 0.65, so no outline folds over itself;
 *  - waves: the noise's wavelengths (tiles), weights and seeds (a long sway, a shorter waver and a faint ripple, none periodic: a value noise
 *    alone has flat spots, where a side would run straight for several tiles);
 *  - step: the longest side a painted outline keeps after rounding (so a straight side follows the wobble), courseStep a course line's;
 *  - rK, rMin, rMax: a corner's radius, rK x the square root of the area, clamped to [rMin, rMax] tiles; rSide: at most this share of
 *    either side it joins (so a narrow area's corners never overlap);
 *  - minSize: an area whose square root of area is under this keeps its outline (the range's hitting mats, a small sign plinth) */
export const RUGGED = {
  amp: 1.15, limit: 0.8,
  waves: [[5.2, 0.66, 311], [2.5, 0.25, 313], [1.2, 0.09, 317]] as readonly (readonly [number, number, number])[],
  step: 0.35, courseStep: 0.5,
  rK: 0.13, rMin: 0.6, rMax: 1.5, rSide: 0.42,
  minSize: 2.2,
} as const;

/** the wobble at tile (x, y): the offset (tiles) every soft outline point there is drawn at, written into out[0], out[1]; the same in every
 *  chunk, at every level and on every bake */
export function wobbleAt(x: number, y: number, out: number[] | Float64Array = [0, 0]): number[] | Float64Array {
  let dx = 0, dy = 0;
  for (const [w, k, s] of RUGGED.waves) {
    dx += k * (2 * vnoise(x / w + 3.17, y / w - 7.31, s) - 1);
    dy += k * (2 * vnoise(x / w - 5.53, y / w + 1.91, s + 101) - 1);
  }
  dx *= RUGGED.amp; dy *= RUGGED.amp;
  // eased to at most `limit` (a smooth tanh, no kink), so no outline moves out of the chunk margin its patch is indexed by
  const m = Math.hypot(dx, dy);
  if (m > 1e-9) { const k = (RUGGED.limit * Math.tanh(m / RUGGED.limit)) / m; dx *= k; dy *= k; }
  out[0] = dx; out[1] = dy;
  return out;
}

/** a closed polygon's signed area (x right, y down), tiles² */
export function signedArea(pts: ArrayLike<number>): number {
  const n = pts.length >> 1; let a = 0;
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; a += pts[2 * i]! * pts[2 * j + 1]! - pts[2 * j]! * pts[2 * i + 1]!; }
  return a / 2;
}

/** a corner's radius for an area of `area` tiles²: rK x its square root, clamped to [rMin, rMax] */
export function cornerRadius(area: number): number { return Math.min(RUGGED.rMax, Math.max(RUGGED.rMin, RUGGED.rK * Math.sqrt(Math.max(0, area)))); }

/** a closed polygon (flat x y, tiles) with each corner rounded (a quadratic curve from a point t back along the side in, through the corner, to a
 *  point t along the side out; t from the radius r and the turn, at most rSide of either side) and every side split into pieces of at most
 *  `step`. keep[i]: corner i stays sharp; flat[i]: side i (corner i to i + 1) is not split (a seam: it must stay exactly as it is). A corner that
 *  hardly turns (under 3.5 degrees) is left as it is */
export function roundedRing(pts: ArrayLike<number>, r: number, step: number, keep?: ArrayLike<number>, flat?: ArrayLike<number>): number[] {
  const n = pts.length >> 1, out: number[] = [];
  if (n < 3) { for (let i = 0; i < pts.length; i++) out.push(pts[i]!); return out; }
  const ax = new Float64Array(n), ay = new Float64Array(n), bx = new Float64Array(n), by = new Float64Array(n), T = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const h = (i + n - 1) % n, j = (i + 1) % n, cx = pts[2 * i]!, cy = pts[2 * i + 1]!;
    const ix = cx - pts[2 * h]!, iy = cy - pts[2 * h + 1]!, li = Math.hypot(ix, iy), ox = pts[2 * j]! - cx, oy = pts[2 * j + 1]! - cy, lo = Math.hypot(ox, oy);
    let t = 0;
    if (!keep?.[i] && li > 1e-9 && lo > 1e-9) {
      const c = (ix * ox + iy * oy) / (li * lo), th = Math.acos(Math.max(-1, Math.min(1, c)));
      if (th > 0.06) t = Math.min(r * Math.tan(Math.min(th, 2.7) / 2), RUGGED.rSide * li, RUGGED.rSide * lo);
    }
    T[i] = t;
    ax[i] = li > 1e-9 ? cx - (ix / li) * t : cx; ay[i] = li > 1e-9 ? cy - (iy / li) * t : cy;
    bx[i] = lo > 1e-9 ? cx + (ox / lo) * t : cx; by[i] = lo > 1e-9 ? cy + (oy / lo) * t : cy;
  }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, cx = pts[2 * i]!, cy = pts[2 * i + 1]!;
    if (T[i]! > 0) {
      // the corner: A, then the curve's inner points, then B (its length is a little under 2t)
      const k = Math.max(2, Math.ceil((2 * T[i]!) / step));
      for (let s = 0; s <= k; s++) {
        const u = s / k, a = (1 - u) * (1 - u), b = 2 * u * (1 - u), c = u * u;
        out.push(a * ax[i]! + b * cx + c * bx[i]!, a * ay[i]! + b * cy + c * by[i]!);
      }
    } else out.push(cx, cy);
    // the side on to the next corner's start, its inner points only
    if (flat?.[i]) continue;
    const sx = bx[i]!, sy = by[i]!, ex = ax[j]!, ey = ay[j]!, m = Math.ceil(Math.hypot(ex - sx, ey - sy) / step);
    for (let q = 1; q < m; q++) out.push(sx + ((ex - sx) * q) / m, sy + ((ey - sy) * q) / m);
  }
  return out;
}

/** how far a point may move near a seam's end: none at it, all of it 1.5 tiles away */
const SEAM_FADE = 1.5;

/** a painted area's drawn outline (closed polygon pts, tiles, either winding): its corners rounded (cornerRadius of its area), its sides split,
 *  every point moved by the wobble. Sides on a multiple of seamCell tiles (isCellSeam: a big area cut into cells, the next cell's area carries the
 *  surface on) stay exactly where they are, their corners sharp, the wobble eased to nothing at their ends. An area under RUGGED.minSize keeps
 *  its outline (the same array). Never changes pts */
export function ruggedRing(pts: readonly number[], seamCell = 0): readonly number[] {
  const n = pts.length >> 1; if (n < 3) return pts;
  const area = Math.abs(signedArea(pts)); if (!(Math.sqrt(area) >= RUGGED.minSize)) return pts;
  const keep = new Uint8Array(n), flat = new Uint8Array(n), seamPts: number[] = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    if (isCellSeam(pts[2 * i]!, pts[2 * i + 1]!, pts[2 * j]!, pts[2 * j + 1]!, seamCell)) { flat[i] = 1; keep[i] = keep[j] = 1; }
  }
  for (let i = 0; i < n; i++) if (keep[i]) seamPts.push(pts[2 * i]!, pts[2 * i + 1]!);
  const ring = roundedRing(pts, cornerRadius(area), RUGGED.step, keep, flat), o = [0, 0];
  for (let k = 0; k + 1 < ring.length; k += 2) {
    const x = ring[k]!, y = ring[k + 1]!;
    let w = 1;
    for (let q = 0; q + 1 < seamPts.length; q += 2) w = Math.min(w, smooth01(Math.hypot(x - seamPts[q]!, y - seamPts[q + 1]!) / SEAM_FADE));
    if (w <= 0) continue;
    wobbleAt(x, y, o); ring[k] = x + w * o[0]!; ring[k + 1] = y + w * o[1]!;
  }
  return ring;
}

/** a course line (flat x y, tiles) with every side split into pieces of at most `step` and every point moved by the wobble. closed: a ring
 *  (its closing side, last point back to the first, is split too). The pieces of one side are the same whichever line it belongs to and
 *  whichever way it runs, so a fill ring, an edge and a wall drawn from one outline move together */
export function warpLine(q: ArrayLike<number>, closed = false, step: number = RUGGED.courseStep): Float32Array {
  const n = q.length >> 1, out: number[] = [], o = [0, 0];
  const sides = closed ? n : n - 1;
  for (let i = 0; i < n; i++) {
    const x = q[2 * i]!, y = q[2 * i + 1]!;
    out.push(x, y);
    if (i >= sides) continue;
    const j = (i + 1) % n, ex = q[2 * j]!, ey = q[2 * j + 1]!, m = Math.ceil(Math.hypot(ex - x, ey - y) / step);
    for (let k = 1; k < m; k++) out.push(x + ((ex - x) * k) / m, y + ((ey - y) * k) / m);
  }
  const r = new Float32Array(out.length);
  for (let k = 0; k + 1 < out.length; k += 2) { wobbleAt(out[k]!, out[k + 1]!, o); r[k] = out[k]! + o[0]!; r[k + 1] = out[k + 1]! + o[1]!; }
  return r;
}

/** a course wall's top (x, y, drop triples) split and moved as warpLine moves its edge: the drop eased linearly along each piece */
export function warpTriples(p: ArrayLike<number>, step: number = RUGGED.courseStep): Float32Array {
  const n = Math.floor(p.length / 3), out: number[] = [], o = [0, 0];
  for (let i = 0; i < n; i++) {
    const x = p[3 * i]!, y = p[3 * i + 1]!, d = p[3 * i + 2]!;
    out.push(x, y, d);
    if (i + 1 >= n) continue;
    const ex = p[3 * i + 3]!, ey = p[3 * i + 4]!, ed = p[3 * i + 5]!, m = Math.ceil(Math.hypot(ex - x, ey - y) / step);
    for (let k = 1; k < m; k++) out.push(x + ((ex - x) * k) / m, y + ((ey - y) * k) / m, d + ((ed - d) * k) / m);
  }
  const r = new Float32Array(out.length);
  for (let k = 0; k + 2 < out.length; k += 3) { wobbleAt(out[k]!, out[k + 1]!, o); r[k] = out[k]! + o[0]!; r[k + 1] = out[k + 1]! + o[1]!; r[k + 2] = out[k + 2]!; }
  return r;
}

/** one point moved by the wobble (a tee's stairs, a marker) */
export function warpPoint(x: number, y: number): [number, number] { const o = wobbleAt(x, y); return [x + o[0]!, y + o[1]!]; }

// ---- the spill ----

/** the spill's numbers (tiles unless said): the longest and shortest blade into the short side (max at a full clump, the owner's 0.3 to 0.8),
 *  how far a blade's root starts back inside the tall side (so its base merges with the ground it grows from), the blades' spacing and base
 *  width at the closest levels (the renderer scales both up at far ones), a tip's lean along the edge (a share of its length: a clump leans
 *  one way, its blades about it), how often a blade in a full clump has a second one fanning from its root (fan); the shade under
 *  the overhang: the blades again, moved toward the shadows (145 degrees on screen) by shadeOff and multiplied in the cool shade at shadeA, and
 *  a soft contact band band tiles into the short side at bandA; sparse: a hard surface's edge keeps its line with only a few short tufts (the
 *  clump past sparseAt, at sparseLen of the length) */
export const SPILL = { max: 0.8, min: 0.08, root: 0.12, spacing: 0.075, width: 0.065, lean: 0.6, fan: 0.5, shadeOff: 0.045, shadeA: 0.18, band: 0.32, bandA: 0.16, sparseAt: 0.62, sparseLen: 0.45 } as const;

/** a 0..1 hash of a point (quantized to 1/64 tile) and a seed */
function hash01(x: number, y: number, s: number): number {
  let h = Math.imul(Math.round(x * 64) | 0, 374761393) ^ Math.imul(Math.round(y * 64) | 0, 668265263) ^ Math.imul(s, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** the spill's clump at tile (x, y): 0 (a bare stretch, the shortest blades) .. 1 (a long tuft); world-space value noise of about 1.7 and
 *  0.6 tiles, never periodic, the same in every chunk */
export function spillClump(x: number, y: number): number {
  const n = 0.62 * vnoise(x / 1.7 + 9.13, y / 1.7 - 3.37, 211) + 0.38 * vnoise(x / 0.63 - 2.21, y / 0.63 + 6.71, 223);
  return smooth01((n - 0.3) / 0.42);
}

/** the blades of the spill along a line (flat x y, tiles) whose tall side lies along side x (dy, -dx) of each piece (side 1: its right-hand
 *  normal in these axes, -1 the other), as triangles (six numbers each: the root's two corners, then the tip), appended to out; `owner` (when
 *  given) gets each blade's line point index (the point its piece starts at). k: the blades' spacing and width scale (1 at the closest levels,
 *  2 and 4 further out), sparse: a hard edge's few tufts. A closed line repeats its first point last. Deterministic: each blade's place,
 *  length, lean and width come from where it is */
export function spillBlades(line: ArrayLike<number>, side: 1 | -1, k = 1, sparse = false, out: number[] = [], owner?: number[]): number[] {
  const n = line.length >> 1, gap = SPILL.spacing * k, wid = SPILL.width * k;
  for (let i = 0; i + 1 < n; i++) {
    const ax = line[2 * i]!, ay = line[2 * i + 1]!, dx = line[2 * i + 2]! - ax, dy = line[2 * i + 3]! - ay, len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;
    const tx = dx / len, ty = dy / len, nx = side * ty, ny = -side * tx;
    // the blades sit every `gap` along the piece, each nudged by its own hash (the first half a gap in, so pieces end to end keep the spacing)
    for (let s = gap / 2; s < len; s += gap) {
      const h0 = hash01(ax + tx * s, ay + ty * s, 17), p = Math.min(len, Math.max(0, s + (h0 - 0.5) * 0.7 * gap)), px = ax + tx * p, py = ay + ty * p;
      const c = spillClump(px, py);
      if (sparse && c < SPILL.sparseAt) continue;
      const h1 = hash01(px, py, 29), h2 = hash01(px, py, 31), h3 = hash01(px, py, 37), h4 = hash01(px, py, 41);
      let reach = SPILL.min + (SPILL.max - SPILL.min) * c * (0.5 + 0.5 * h1);
      if (sparse) reach *= SPILL.sparseLen;
      // the lean: the clump's own way (a slow noise) and the blade's about it
      const way = 2 * vnoise(px / 0.9 + 4.41, py / 0.9 - 8.83, 229) - 1, lean = (0.55 * way + 0.45 * (2 * h2 - 1)) * SPILL.lean * reach, w = wid * (0.6 + 0.8 * h3) / 2;
      const rx = px + nx * SPILL.root, ry = py + ny * SPILL.root;
      out.push(rx - tx * w, ry - ty * w, rx + tx * w, ry + ty * w, px - nx * reach + tx * lean, py - ny * reach + ty * lean);
      owner?.push(i);
      // a full clump's blades fan: now and then a second, shorter one from the same root, leaning the other way
      if (h4 < SPILL.fan * c && !sparse) {
        const r2 = reach * (0.55 + 0.35 * h1), l2 = -0.7 * lean + (h3 - 0.5) * 0.3 * r2;
        out.push(rx - tx * w * 0.8, ry - ty * w * 0.8, rx + tx * w * 0.8, ry + ty * w * 0.8, px - nx * r2 + tx * l2, py - ny * r2 + ty * l2);
        owner?.push(i);
      }
    }
  }
  return out;
}

/** the blades' scale (spacing and width) at cache level L with tilePx screen px a tile at zoom 1: 1 while a blade is at least about 1.2 cache
 *  px wide, else 2, else 4 (the far levels: fewer, wider blades, the same reach) */
export function spillScale(L: number, tilePx: number): 1 | 2 | 4 {
  const px = SPILL.width * tilePx * L;
  return px >= 1.2 ? 1 : px >= 0.6 ? 2 : 4;
}

/** the offset (tiles) the blades' shade is drawn at: toward where the shadows fall (away from the sun at the upper right) */
export const SPILL_SHADE_OFF: readonly [number, number] = [-SUN_TILE_DIR.x * SPILL.shadeOff, -SUN_TILE_DIR.y * SPILL.shadeOff];

// ---- which surfaces take part ----

/** hard man-made textures: their outline keeps its line (a kerb, paving, a path), only a few tufts over it */
const HARD = /asphalt|paving|^pad$|slabs|concrete|chipSeal|gravel|kerb|path|cart|marks|brick|tarmac|road/i;
/** tall grass: fescue, rough, long and dry grass, the meadows, the woodland floor (the map's open ground counts as tall wherever it shows) */
const TALL = /fescue|rough|meadow|grassDry|woodland|long|wild|lawnDeclined/i;
/** water and sand keep their own edge looks (the bank's wet soil, the bunker's lip) */
const NO_SPILL = /water|sand|bunker|creek|bank|snow/i;
/** how a painted surface's edge is drawn (T204): 'hard' (its line kept, a few tufts over it), 'tall' (a wobble, no spill over itself), 'short'
 *  (a wobble and tall grass spilling over it: short grass, a lawn, dirt), 'soft' (a wobble, no spill: water, sand) */
export type RuggedKind = 'hard' | 'tall' | 'short' | 'soft';
export function ruggedKind(tex: string, border?: string): RuggedKind {
  if (border === 'kerb' || HARD.test(tex)) return 'hard';
  if (NO_SPILL.test(tex)) return 'soft';
  if (TALL.test(tex)) return 'tall';
  return 'short';
}

/** whether a point lies inside a closed polygon (even-odd) */
export function inPoly(pts: ArrayLike<number>, x: number, y: number): boolean {
  const n = pts.length >> 1; let c = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const yi = pts[2 * i + 1]!, yj = pts[2 * j + 1]!;
    if ((yi > y) !== (yj > y) && x < ((pts[2 * j]! - pts[2 * i]!) * (y - yi)) / (yj - yi) + pts[2 * i]!) c = !c;
  }
  return c;
}
