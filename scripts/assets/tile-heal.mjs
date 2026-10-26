// The edge heal (T162, #350; T165, #365): a painting made to tile with itself, once, in the asset step (scripts/assets/prep-painted-tiles.mjs),
// never at runtime. The owner (2026-10-26): "here are better images for the roug. they should tile better"; laid edge to edge, a painting's
// opposite edges still differed about four times more than neighbouring pixels inside, so the repeat showed faint seams. Then (T165) "fix that
// seam in the fairway textures".
//
// The method, `wrap-bridge-v1`, one axis at a time (left-right on every row, then top-bottom on every column of that result, so the corners
// agree): in the tiled picture the seam zone is the right edge's `band` px followed by the left edge's `band` px. A bridge strip, 2 x band px
// of the painting's own middle (the same rows for left-right, the same columns for top-bottom), is cross-faded in over that zone: its weight
// rises smoothly (smoothstep) from 0 at each band's inner edge to 1 at the wrap. So each band starts exactly as painted where it meets the
// untouched interior, and at the wrap the last and the first pixel are two neighbouring pixels of the bridge: the picture is continuous across
// the wrap, edge to edge and corner to corner. The middle strip keeps the edge's own scale and light, and its tone lies between the two edges'
// (a painting lighter on one side than the other ramps across both bands, not at a line); being from the middle, it repeats no content next
// to where it came from. Nothing outside the bands changes; nothing is mirrored, rotated, resized or regraded (only cross-faded with the
// painting's own pixels).
//
// T165 adds, for paintings with a pattern (the fairway's diagonal mowing stripes):
// - `wrap-bridge-match-v1`: the same heal with the bridge strip taken where the painting best matches the seam zone (the least difference of
//   its blurred luminance from the two bands' own), not at the middle: a striped bridge in phase with the bands, so the stripes cross-fade
//   into themselves instead of ghosting.
// - the stripe crop (stripeCrop): the stripes' period along each axis by autocorrelation of the luminance, then a crop (only: never rotated,
//   mirrored, rescaled, regraded or repainted) to a whole number of periods each way, at the offsets where the stripes' phase across the wrap
//   matches best (stripePhase: the fundamental's phase just inside each edge, compared line by line).
// - the shared-strip heal (healShared): a set of tiles of one size healed so that any tile's right edge meets any tile's left edge (and any
//   bottom any top) with the same pixels: every tile cross-faded to ONE bridge strip from the first tile, matched to all of their seam zones.
// Pure (no imports): the prep script and the tests use it.

/** the heal's name: recorded per level in the manifest and part of the family's revision (another heal re-bakes every chunk that laid it) */
export const HEAL_METHOD = 'wrap-bridge-v1';
/** the matched-bridge heal (T165) */
export const HEAL_MATCH = 'wrap-bridge-match-v1';
/** the shared-strip heal of a set of tiles (T165) */
export const HEAL_SHARED = 'shared-strip-match-v1';
/** no heal (T170): a finished set of tiles that already meet one another, shipped as the art session made it (its numbers still recorded) */
export const HEAL_AS_MADE = 'finished-set-as-made';
const smooth = t => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/** the bridge's weight at a seam-zone position p (-band .. band - 1; p < 0 the far edge's band, p >= 0 the near edge's): 0 at a band's inner
 *  edge, rising to 1 at the wrap, symmetric about it */
export const bridgeWeight = (p, band) => (p < 0 ? smooth((p + band + 0.5) / band) : 1 - smooth((p + 0.5) / band));

/** one axis over lines of n px (stride `along` between a line's px, `across` between lines, m lines), on a copy: the bridge is `bsrc` (the
 *  picture itself, or the shared strip's tile) at [centre - band, centre + band) */
function healLines(src, n, m, along, across, ch, band, centre = Math.floor(n / 2), bsrc = src) {
  const out = Float32Array.from(src);
  for (let p = -band; p < band; p++) {
    const x = p < 0 ? n + p : p, b = centre + p, w = bridgeWeight(p, band);
    for (let l = 0; l < m; l++) {
      const o = (l * across + x * along) * ch, ob = (l * across + b * along) * ch;
      for (let c = 0; c < ch; c++) out[o + c] = (1 - w) * src[o + c] + w * bsrc[ob + c];
    }
  }
  return out;
}
const toBytes = f => Uint8Array.from(f, v => (v <= 0 ? 0 : v >= 255 ? 255 : Math.round(v)));
function checkSize(px, w, h, ch, band, name) {
  if (!Number.isInteger(band) || band < 1) throw new Error(`${name}: band ${band} must be a whole number of px >= 1`);
  if (w < 4 * band || h < 4 * band) throw new Error(`${name}: ${w}x${h} is too small for a ${band} px band (each side at least ${4 * band})`);
  if (px.length !== w * h * ch) throw new Error(`${name}: ${px.length} values for ${w}x${h}x${ch}`);
}

/* ---- luminance helpers (the matching and the stripes look at the luminance only) ---- */
/** a picture's luminance (Rec. 601, 0..255), one value a px */
function luminance(px, w, h, ch) {
  const L = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) L[i] = ch >= 3 ? 0.299 * px[i * ch] + 0.587 * px[i * ch + 1] + 0.114 * px[i * ch + 2] : px[i * ch];
  return L;
}
/** three passes of a box blur of radius r each way (about a gaussian of sigma r), the edges clamped */
function blur(L, w, h, r) {
  if (r < 1) return Float64Array.from(L);
  const pass = (src, horiz) => {
    const out = new Float64Array(w * h), n = horiz ? w : h, m = horiz ? h : w;
    for (let l = 0; l < m; l++) {
      const at = i => (horiz ? src[l * w + Math.min(n - 1, Math.max(0, i))] : src[Math.min(n - 1, Math.max(0, i)) * w + l]);
      let s = 0; for (let i = -r; i <= r; i++) s += at(i);
      for (let i = 0; i < n; i++) { out[horiz ? l * w + i : i * w + l] = s / (2 * r + 1); s += at(i + r + 1) - at(i - r); }
    }
    return out;
  };
  let o = L; for (let k = 0; k < 3; k++) o = pass(pass(o, true), false);
  return o;
}

/* ---- the matched bridge ---- */
/** the bridge centre along an axis ('x': left-right, 'y': top-bottom) that best matches the seam zones: the c in [2 band, n - 2 band] whose
 *  strip [c - band, c + band) of `src` (blurred luminance) differs least from each edge picture's own seam zone (its far band, then its near
 *  band), summed over the edge pictures */
function bestCentre(src, edges, w, h, axis, band) {
  const n = axis === 'x' ? w : h, m = axis === 'x' ? h : w, at = (L, i, l) => (axis === 'x' ? L[l * w + i] : L[i * w + l]);
  let best = -1, bestCost = Infinity;
  for (let c = 2 * band; c <= n - 2 * band; c++) {
    let s = 0;
    for (const E of edges) for (let l = 0; l < m; l += 3) for (let p = -band; p < band; p++) s += Math.abs(at(src, c + p, l) - at(E, p < 0 ? n + p : p, l));
    if (s < bestCost) { bestCost = s; best = c; }
  }
  return best;
}
const BLUR_MATCH = 6;

/**
 * The heal of one picture with its bridge where it is wanted: `bridge` 'middle' (wrap-bridge-v1, the default) or 'match' (wrap-bridge-match-v1:
 * each axis's bridge where the picture best matches its seam zone; top-bottom matched on the left-right result). Returns the healed pixels and
 * the bridge centres used (px along each axis), which the prep script records.
 * @param {Uint8Array | Uint8ClampedArray | Buffer} px @param {number} w @param {number} h @param {number} ch @param {number} band
 * @param {{ bridge?: 'middle' | 'match' }} [opts]
 * @returns {{ pixels: Uint8Array, centre: { x: number, y: number } }}
 */
export function healWrapWith(px, w, h, ch, band, opts = {}) {
  checkSize(px, w, h, ch, band, 'healWrap');
  const match = opts.bridge === 'match';
  let f = Float32Array.from(px);
  const cx = match ? bestCentre(blur(luminance(f, w, h, ch), w, h, BLUR_MATCH), [blur(luminance(f, w, h, ch), w, h, BLUR_MATCH)], w, h, 'x', band) : Math.floor(w / 2);
  f = healLines(f, w, h, 1, w, ch, band, cx); // left-right: each row
  const Ly = match ? blur(luminance(f, w, h, ch), w, h, BLUR_MATCH) : null;
  const cy = match ? bestCentre(Ly, [Ly], w, h, 'y', band) : Math.floor(h / 2);
  f = healLines(f, h, w, w, 1, ch, band, cy); // top-bottom: each column (of the left-right result, so the corners agree)
  return { pixels: toBytes(f), centre: { x: cx, y: cy } };
}

/**
 * The painting `px` (w x h, `ch` interleaved 8-bit channels, row-major) healed to tile with itself: a new Uint8Array of the same size in which
 * only the outer `band` px of each edge differ (see the method above). Throws when the painting is too small for the band (each side must be
 * at least 4 x band, so the bridge never overlaps a band).
 * @param {Uint8Array | Uint8ClampedArray | Buffer} px @param {number} w @param {number} h @param {number} ch @param {number} band
 * @returns {Uint8Array}
 */
export function healWrap(px, w, h, ch, band) {
  return healWrapWith(px, w, h, ch, band).pixels;
}

/**
 * The shared-strip heal (T165): tiles of one size healed so that every tile's left and right bands cross-fade to ONE bridge strip at the wrap
 * (and every tile's top and bottom bands to one strip): any tile's right edge then meets any tile's left edge with the same pixels, and any
 * bottom any top, corners included. The strips come from the first tile, where it best matches all the tiles' seam zones (the top-bottom one
 * from its left-right result). Each tile's interior is untouched.
 * @param {(Uint8Array | Uint8ClampedArray | Buffer)[]} tiles @param {number} w @param {number} h @param {number} ch @param {number} band
 * @returns {{ tiles: Uint8Array[], centre: { x: number, y: number } }}
 */
export function healShared(tiles, w, h, ch, band) {
  if (!tiles.length) throw new Error('healShared: no tiles');
  for (const t of tiles) checkSize(t, w, h, ch, band, 'healShared');
  let fs = tiles.map(t => Float32Array.from(t));
  let Ls = fs.map(f => blur(luminance(f, w, h, ch), w, h, BLUR_MATCH));
  const cx = bestCentre(Ls[0], Ls, w, h, 'x', band), sx = fs[0];
  fs = fs.map(f => healLines(f, w, h, 1, w, ch, band, cx, sx));
  Ls = fs.map(f => blur(luminance(f, w, h, ch), w, h, BLUR_MATCH));
  const cy = bestCentre(Ls[0], Ls, w, h, 'y', band), sy = fs[0];
  fs = fs.map(f => healLines(f, h, w, w, 1, ch, band, cy, sy));
  return { tiles: fs.map(toBytes), centre: { x: cx, y: cy } };
}

/**
 * How well a painting tiles with itself: the mean absolute RGB difference (0..255, the first three channels) across the wrap, left-right (the
 * last column against the first) and top-bottom (the last row against the first), and inside: between every pair of neighbouring columns (h)
 * and of neighbouring rows (v). A painting that tiles has its wrap differences about its inside ones.
 * @param {Uint8Array | Uint8ClampedArray | Buffer} px @param {number} w @param {number} h @param {number} ch
 * @returns {{ lr: number, tb: number, h: number, v: number }}
 */
export function wrapMismatch(px, w, h, ch) {
  const at = (x, y, c) => px[(y * w + x) * ch + c];
  let lr = 0, tb = 0, dh = 0, dv = 0;
  for (let y = 0; y < h; y++) for (let c = 0; c < 3; c++) lr += Math.abs(at(w - 1, y, c) - at(0, y, c));
  for (let x = 0; x < w; x++) for (let c = 0; c < 3; c++) tb += Math.abs(at(x, h - 1, c) - at(x, 0, c));
  for (let y = 0; y < h; y++) for (let x = 0; x < w - 1; x++) for (let c = 0; c < 3; c++) dh += Math.abs(at(x + 1, y, c) - at(x, y, c));
  for (let y = 0; y < h - 1; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 3; c++) dv += Math.abs(at(x, y + 1, c) - at(x, y, c));
  return { lr: lr / (h * 3), tb: tb / (w * 3), h: dh / ((w - 1) * h * 3), v: dv / ((h - 1) * w * 3) };
}

/** two pairs of tiles' cross edges (T165, a set healed with the shared strip): the mean |RGB| difference where tile a's right edge meets
 *  tile b's left edge (lr) and a's bottom b's top (tb) */
export function crossMismatch(a, b, w, h, ch) {
  let lr = 0, tb = 0;
  for (let y = 0; y < h; y++) for (let c = 0; c < 3; c++) lr += Math.abs(a[(y * w + w - 1) * ch + c] - b[(y * w) * ch + c]);
  for (let x = 0; x < w; x++) for (let c = 0; c < 3; c++) tb += Math.abs(a[((h - 1) * w + x) * ch + c] - b[x * ch + c]);
  return { lr: lr / (h * 3), tb: tb / (w * 3) };
}

/** a set of tiles' cross edges (every ordered pair, a tile with itself included) and their inside: the mean |RGB| difference where any tile's
 *  right edge meets any tile's left edge (lr) and any bottom any top (tb), and the tiles' mean neighbour difference inside (h, v) */
export function setMismatch(tiles, w, h, ch) {
  let lr = 0, tb = 0, dh = 0, dv = 0;
  for (const a of tiles) { const m = wrapMismatch(a, w, h, ch); dh += m.h; dv += m.v; for (const b of tiles) { const c = crossMismatch(a, b, w, h, ch); lr += c.lr; tb += c.tb; } }
  const n = tiles.length;
  return { lr: lr / (n * n), tb: tb / (n * n), h: dh / n, v: dv / n };
}

/* ---- the stripes (T165): their period, their phase across the wrap, and the crop that lines them up ---- */
/**
 * A pattern's period along an axis ('x': along each row, 'y': along each column) by autocorrelation of the luminance (each line's mean
 * removed, every third line): the first peak past the first zero crossing at least half the highest one, refined at its highest multiple that
 * is still a peak (sub-pixel, parabolic). strength: the autocorrelation there (stripes about 0.4-0.7; a plain lawn under 0.1). null: no peak.
 * @returns {{ period: number, strength: number } | null}
 */
export function stripePeriod(px, w, h, ch, axis) {
  const L = luminance(px, w, h, ch), n = axis === 'x' ? w : h, m = axis === 'x' ? h : w, at = (i, l) => (axis === 'x' ? L[l * w + i] : L[i * w + l]);
  const maxLag = Math.floor(n / 2), r = new Float64Array(maxLag + 1), s = new Float64Array(n);
  for (let l = 0; l < m; l += 3) {
    let mu = 0; for (let i = 0; i < n; i++) mu += at(i, l); mu /= n;
    for (let i = 0; i < n; i++) s[i] = at(i, l) - mu;
    for (let lag = 0; lag <= maxLag; lag++) { let a = 0; for (let i = 0; i + lag < n; i++) a += s[i] * s[i + lag]; r[lag] += a / (n - lag); }
  }
  if (!(r[0] > 0)) return null;
  for (let lag = maxLag; lag >= 0; lag--) r[lag] /= r[0];
  let z = 1; while (z < maxLag && r[z] > 0) z++;
  const peaks = []; for (let i = Math.max(z, 2); i < maxLag; i++) if (r[i] > r[i - 1] && r[i] >= r[i + 1]) peaks.push(i);
  if (!peaks.length) return null;
  const top = Math.max(...peaks.map(i => r[i])), p0 = peaks.find(i => r[i] >= 0.5 * top);
  const par = i => { const a = r[i - 1], b = r[i], c = r[i + 1], den = a - 2 * b + c; return i + (den ? (0.5 * (a - c)) / den : 0); };
  let best = { lag: par(p0), k: 1 };
  for (let k = 2; Math.round(k * best.lag / best.k) + 4 < maxLag; k++) {
    const c = Math.round((k * best.lag) / best.k); let i = c;
    for (let d = -3; d <= 3; d++) if (r[c + d] > r[i]) i = c + d;
    if (r[i] > 0.3 * top && r[i] > r[i - 1] && r[i] >= r[i + 1]) best = { lag: par(i), k };
  }
  return { period: best.lag / best.k, strength: r[p0] };
}

/** the stripes alone: the luminance blurred a little (the grain gone) less blurred a lot (the light gone) */
const stripeBand = (px, w, h, ch, period) => { const L = luminance(px, w, h, ch), a = blur(L, w, h, Math.max(1, Math.round(period / 24))), b = blur(L, w, h, Math.max(2, Math.round(period / 2))); return a.map((v, i) => v - b[i]); };
/** per line, the fundamental (period P) summed over every window of round(P) px: re/im arrays [line][start] (absolute positions' phase) */
function slidingFundamental(S, w, h, axis, P) {
  const n = axis === 'x' ? w : h, m = axis === 'x' ? h : w, at = (i, l) => (axis === 'x' ? S[l * w + i] : S[i * w + l]), L = Math.round(P), k = n - L + 1;
  const re = new Float64Array(m * k), im = new Float64Array(m * k), cs = new Float64Array(n), sn = new Float64Array(n);
  for (let i = 0; i < n; i++) { cs[i] = Math.cos((2 * Math.PI * i) / P); sn[i] = Math.sin((2 * Math.PI * i) / P); }
  for (let l = 0; l < m; l++) {
    let a = 0, b = 0; for (let i = 0; i < L; i++) { a += at(i, l) * cs[i]; b -= at(i, l) * sn[i]; }
    for (let s = 0; s < k; s++) { re[l * k + s] = a; im[l * k + s] = b; if (s + L < n) { a += at(s + L, l) * cs[s + L] - at(s, l) * cs[s]; b -= at(s + L, l) * sn[s + L] - at(s, l) * sn[s]; } }
  }
  return { re, im, k, L };
}
/** the mean |phase step| (px) of the stripes across the wrap of the crop [o, o + size) along an axis, over lines [l0, l1) (every second) */
function wrapPhase(F, P, o, size, l0, l1) {
  const { re, im, k, L } = F, rot = (2 * Math.PI * size) / P, cr = Math.cos(rot), sr = Math.sin(rot);
  let s = 0, n = 0;
  for (let l = l0; l < l1; l += 2) {
    const a = l * k + o, b = l * k + o + size - L, ar = re[a], ai = im[a], br = re[b] * cr - im[b] * sr, bi = re[b] * sr + im[b] * cr;
    s += Math.abs(Math.atan2(ai * br - ar * bi, ar * br + ai * bi)); n++;
  }
  return ((s / n) * P) / (2 * Math.PI);
}

/**
 * How straight the stripes run across a picture's own wrap: per axis, the mean |phase step| (px) of the stripes (period P on that axis) where
 * the last px meets the first, line by line (0: straight across; P/4: a quarter period, as random as it gets).
 * @returns {{ x: number, y: number }}
 */
export function stripePhase(px, w, h, ch, periodX, periodY) {
  const S = stripeBand(px, w, h, ch, Math.min(periodX, periodY));
  return { x: wrapPhase(slidingFundamental(S, w, h, 'x', periodX), periodX, 0, w, 0, h), y: wrapPhase(slidingFundamental(S, w, h, 'y', periodY), periodY, 0, h, 0, w) };
}

/**
 * The stripe crop (T165): the stripes' periods along x and y (stripePeriod), then the crop of a whole number of periods each way (at least
 * minFrac of each side) at the offsets where the stripes' phase across the wrap matches best (searched x, then y over the chosen columns, then
 * x again over the chosen rows). Only a crop: the picture is never rotated, mirrored, rescaled, regraded or repainted. null when a pattern has
 * no stripes (either period's strength under minStrength).
 * @returns {{ x0: number, y0: number, w: number, h: number, periodX: number, periodY: number, kx: number, ky: number, phase: { before: { x: number, y: number }, after: { x: number, y: number } } } | null}
 */
export function stripeCrop(px, w, h, ch, { minFrac = 0.8, minStrength = 0.25 } = {}) {
  const sx = stripePeriod(px, w, h, ch, 'x'), sy = stripePeriod(px, w, h, ch, 'y');
  if (!sx || !sy || sx.strength < minStrength || sy.strength < minStrength) return null;
  const Px = sx.period, Py = sy.period, S = stripeBand(px, w, h, ch, Math.min(Px, Py));
  const Fx = slidingFundamental(S, w, h, 'x', Px), Fy = slidingFundamental(S, w, h, 'y', Py);
  const before = { x: wrapPhase(Fx, Px, 0, w, 0, h), y: wrapPhase(Fy, Py, 0, h, 0, w) };
  const search = (P, n, F, l0, l1) => {
    let best = null;
    for (let k = Math.floor(n / P); k >= 1 && Math.round(k * P) >= minFrac * n; k--) {
      const size = Math.round(k * P);
      for (let o = 0; o + size <= n; o++) { const c = wrapPhase(F, P, o, size, l0, l1); if (!best || c < best.c - 1e-9) best = { c, o, size, k }; }
    }
    return best;
  };
  let bx = search(Px, w, Fx, 0, h);
  if (!bx) return null;
  let by = search(Py, h, Fy, bx.o, bx.o + bx.size);
  if (!by) return null;
  bx = search(Px, w, Fx, by.o, by.o + by.size);
  return { x0: bx.o, y0: by.o, w: bx.size, h: by.size, periodX: Px, periodY: Py, kx: bx.k, ky: by.k, phase: { before, after: { x: bx.c, y: wrapPhase(Fy, Py, by.o, by.size, bx.o, bx.o + bx.size) } } };
}

/** a crop of a picture (whole pixels, nothing resampled) */
export function cropPixels(px, w, h, ch, r) {
  if (r.x0 < 0 || r.y0 < 0 || r.x0 + r.w > w || r.y0 + r.h > h) throw new Error(`cropPixels: ${JSON.stringify(r)} outside ${w}x${h}`);
  const out = new Uint8Array(r.w * r.h * ch);
  for (let y = 0; y < r.h; y++) out.set(px.subarray(((r.y0 + y) * w + r.x0) * ch, ((r.y0 + y) * w + r.x0 + r.w) * ch), y * r.w * ch);
  return out;
}
