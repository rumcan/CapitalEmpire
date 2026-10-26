// The edge heal (T162, #350): a painting made to tile with itself, once, in the asset step (scripts/assets/prep-painted-tiles.mjs), never at
// runtime. The owner (2026-10-26): "here are better images for the roug. they should tile better"; laid edge to edge, a painting's opposite
// edges still differed about four times more than neighbouring pixels inside, so the repeat showed faint seams.
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
// Pure (no imports): the prep script and the tests use it.

/** the heal's name: recorded per level in the manifest and part of the family's revision (another heal re-bakes every chunk that laid it) */
export const HEAL_METHOD = 'wrap-bridge-v1';
const smooth = t => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/** the bridge's weight at a seam-zone position p (-band .. band - 1; p < 0 the far edge's band, p >= 0 the near edge's): 0 at a band's inner
 *  edge, rising to 1 at the wrap, symmetric about it */
export const bridgeWeight = (p, band) => (p < 0 ? smooth((p + band + 0.5) / band) : 1 - smooth((p + 0.5) / band));

/** one axis over lines of n px (stride `along` between a line's px, `across` between lines, m lines), in place on a copy */
function healLines(src, n, m, along, across, ch, band) {
  const out = Float32Array.from(src), d0 = Math.floor(n / 2) - band; // the bridge: [d0, d0 + 2 band), the painting's middle
  for (let p = -band; p < band; p++) {
    const x = p < 0 ? n + p : p, b = d0 + band + p, w = bridgeWeight(p, band);
    for (let l = 0; l < m; l++) {
      const o = (l * across + x * along) * ch, ob = (l * across + b * along) * ch;
      for (let c = 0; c < ch; c++) out[o + c] = (1 - w) * src[o + c] + w * src[ob + c];
    }
  }
  return out;
}

/**
 * The painting `px` (w x h, `ch` interleaved 8-bit channels, row-major) healed to tile with itself: a new Uint8Array of the same size in which
 * only the outer `band` px of each edge differ (see the method above). Throws when the painting is too small for the band (each side must be
 * at least 4 x band, so the bridge never overlaps a band).
 * @param {Uint8Array | Uint8ClampedArray | Buffer} px @param {number} w @param {number} h @param {number} ch @param {number} band
 * @returns {Uint8Array}
 */
export function healWrap(px, w, h, ch, band) {
  if (!Number.isInteger(band) || band < 1) throw new Error(`healWrap: band ${band} must be a whole number of px >= 1`);
  if (w < 4 * band || h < 4 * band) throw new Error(`healWrap: ${w}x${h} is too small for a ${band} px band (each side at least ${4 * band})`);
  if (px.length !== w * h * ch) throw new Error(`healWrap: ${px.length} values for ${w}x${h}x${ch}`);
  let f = Float32Array.from(px);
  f = healLines(f, w, h, 1, w, ch, band); // left-right: each row
  f = healLines(f, h, w, w, 1, ch, band); // top-bottom: each column (of the left-right result, so the corners agree)
  return Uint8Array.from(f, v => (v <= 0 ? 0 : v >= 255 ? 255 : Math.round(v)));
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
