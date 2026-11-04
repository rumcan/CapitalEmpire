// T315 (#900): a straight-on view rendered turned a few degrees toward the sun (the owner, 2026-11-03: "it needs a slight turn of 5 to 10
// degrees ... we also have to account for that in the lots"; the art pipe renders yaw -7: the right-hand, sun-side wall shows). The building's
// footprint stays square to its street (its W x D from the dead-square views: the lots' boxes do not change); only the picture turns. So a turned
// picture needs (prep-axis-views.mjs):
//   - its size from the square views: its expected width is the square view's width x cos(yaw) + its side view's x sin(yaw);
//   - its anchor at the footprint's centre, which is no longer the middle of its lowest row (its lowest point is the near corner, off to one
//     side): the turned footprint's near edge (a gentle slope along the front, a steep one up the side wall) fitted to the picture's base.
// Pure but for bottomProfile (sharp): the fit is unit tested (tests/axis-turn.test.ts).

/** display px a tile along a screen axis (axis-foot.ts AXIS_K) */
export const K = 128 / Math.SQRT2;

/** a footprint corner (u along the front, v toward the back, tiles from its centre) on screen, display px about its centre (x right, y down),
 *  turned by yaw degrees (negative: the right-hand end comes forward, its right-hand wall shows); axis-foot.ts axisFootPoint */
export function footPoint(yaw, u, v) {
  const t = -yaw * Math.PI / 180, c = Math.cos(t), s = Math.sin(t), p = u * c + v * s, q = -u * s + v * c;
  return [K * p, -K / 2 * q];
}
/** the footprint's ring [[x, y], ...] (display px about its centre): front left, front right, back right, back left */
export const footRing = (front, depth, yaw) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => footPoint(yaw, a * front / 2, b * depth / 2));
/** the near (lowest on screen) edge of a convex ring at x, or null outside it */
export function nearAt(ring, x) {
  let hi = -Infinity;
  for (let i = 0; i < ring.length; i++) {
    const [ax, ay] = ring[i], [bx, by] = ring[(i + 1) % ring.length];
    if ((ax <= x) === (bx <= x)) continue;
    hi = Math.max(hi, ay + (by - ay) * (x - ax) / (bx - ax));
  }
  return Number.isFinite(hi) ? hi : null;
}

/** the expected display height of a turned picture: the square view's display height, its ground's depth (K / 2 a tile) swapped for the
 *  turned footprint's (depth x cos + front x sin). The height, not the width: a turn hardly changes how tall a thing stands, but a porch, steps
 *  or eaves out at the side change the width a lot (and each picture is cropped and painted on its own) */
export const turnedHeight = (hSquare, front, depth, yaw) => { const t = Math.abs(yaw) * Math.PI / 180; return hSquare + K / 2 * (depth * Math.cos(t) + front * Math.sin(t) - depth); };

/** the footprint of a turned picture, read from its own base (picture px; any uniform scale): bot[x] is each column's lowest opaque row + 1
 *  (-1: an empty column), yaw degrees (negative: the right-hand wall shows), aspect the footprint's depth over its front (the square views'
 *  D / W for this view). The base of a turned box is a V: the front wall's foot rising gently to the left (tan(yaw) / 2 a px) from the near
 *  corner, the side wall's rising steeply to the right (1 / (2 tan(yaw)) a px). Every corner column is tried, the V's offset to each column's foot
 *  binned, and the corner that stands the most columns on it wins (steps, a porch or bushes in front stand lower and are left out, eaves higher).
 *  The front wall's run on the V gives the front (its leftmost column is the front-left corner); the side wall's foot is short and often hidden
 *  (a porch, steps, a deck), so the depth is the front times the aspect. Returns the footprint's centre (cx, cy), its near corners, and its front
 *  and depth in px of the screen's x (a tile is K px at display scale) */
export function fitTurnedFoot(bot, yaw, aspect, tol = 2, known = 0) {
  const t = Math.abs(yaw) * Math.PI / 180, m1 = Math.tan(t) / 2, m2 = 1 / (2 * Math.tan(t)), w = bot.length;
  // known (T315 packing): the front in picture px, from the square views (the building's own size): only the columns over a footprint that wide
  // are counted, and the front is that, not the run found (a porch, steps or a deck in front of the wall otherwise cut the run short)
  const span = known > 0 ? [known * Math.cos(t) + tol, known * aspect * Math.sin(t) + tol] : [Infinity, Infinity];
  const rel = d => (d <= 0 ? m1 * d : -m2 * d); // the V's y below its corner (negative: higher), d px right of it
  let best = null;
  for (let xc = 0; xc < w; xc++) {
    if (bot[xc] < 0) continue;
    const offs = [];
    for (let x = Math.max(0, Math.ceil(xc - span[0])); x < Math.min(w, xc + span[1] + 1); x++) if (bot[x] >= 0) offs.push(bot[x] - rel(x - xc));
    offs.sort((a, b) => a - b);
    // the densest window of 2 tol (two pointers)
    let j = 0, n = 0, at = 0;
    for (let i = 0; i < offs.length; i++) { while (offs[i] - offs[j] > 2 * tol) j++; if (i - j + 1 >= n) { n = i - j + 1; at = (offs[i] + offs[j]) / 2; } }
    // with a known front, the footprint's span across the screen (front-left corner to back-right) stays near the picture's middle: a porch,
    // a wing or a deck off to one side cannot pull the corner a long way out (the turned picture spans its footprint, eaves on both sides)
    const off = known > 0 ? Math.abs(xc + (span[1] - span[0]) / 2 - w / 2) / w : 0;
    if (off <= (known > 0 ? 0.12 : Infinity) && (!best || n > best.n)) best = { xc, yc: at, n };
  }
  if (!best && known > 0) return fitTurnedFoot(bot, yaw, aspect, tol, 0);
  if (!best) return null;
  const c = Math.cos(t), sn = Math.sin(t);
  let l = known > 0 ? best.xc - known * c : best.xc;
  if (!(known > 0)) for (let x = 0; x < best.xc; x++) if (bot[x] >= 0 && Math.abs(bot[x] - rel(x - best.xc) - best.yc) <= tol) { l = x; break; }
  const fr = [best.xc, best.yc], fl = [l, best.yc + rel(l - best.xc)];
  // the near corner from the centre: x = a cos - b sin, y = (b cos + a sin) / 2 (a, b the half front and half depth)
  const front = known > 0 ? known : (fr[0] - fl[0]) / c, depth = front * aspect, a = front / 2, b = depth / 2;
  return { cx: fr[0] - (a * c - b * sn), cy: fr[1] - (b * c + a * sn) / 2, fl, fr, front, depth, inliers: best.n };
}

/** each column's lowest opaque row + 1 (-1: none) of a picture, with sharp */
export async function bottomProfile(sharp, png, alpha = 128) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const bot = new Float64Array(info.width).fill(-1);
  for (let x = 0; x < info.width; x++) for (let y = info.height - 1; y >= 0; y--) if (data[(y * info.width + x) * 4 + 3] >= alpha) { bot[x] = y + 1; break; }
  return { bot, width: info.width, height: info.height };
}
