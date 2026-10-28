// T253 (#735; the owner, 2026-10-28: "We also need to get our bunkers to look like the reffrence image",
// docs/art/reference/bunkers-and-pond-reference.png): a bunker's look as light and shade over its own textures, from its edge field (the
// signed distance to the sand's edge and that edge's sun facing, course-grid field.ts lineField; the sun at the screen's upper right):
// - the sand **bowl**: the sand sinks into a hollow whose slope is steepest at the edge and flattens over BUNKER_LOOK.bowl. Under the far rim
//   (the rim facing the sun) the slope turns from the sun and the lip shades the sand under it (a cool multiply, darkest at the rim); inside
//   the near rim the slope faces the sun (a shine textured by the sand, a gap in from the edge). This takes the place of T110's sunken floor
//   shade and T227's crescent and near light (never both);
// - **rake lines** along the bowl's contours (lines at a steady distance from the edge, their spacing wavering with the place so no two
//   bunkers or stretches repeat), fading where the sand flattens out and at far zooms; and fine streaks down the far face (the slope's fall
//   line, from the place along the rim), as the reference's sand has;
// - the **rolled grass lip** round the sand (a low ridge just outside the edge: lit on its sun-facing slope, shaded on the other) and the soft
//   **grass mounds** round it (a broad, low swell on the same rule, stronger in places): shading only, so the grass's texture stays.
// The red-brown soil edge where the turf meets the sand is the far wall's face (renderer WALL_SOIL). Everything reads world positions only,
// so a bunker across a chunk seam is lit as one. Pure: no DOM, importable from node tests. Units: tiles of 2 m.
import { vnoise } from './living-ground';
import { DARK_RGB, smooth01, type EdgeField, type EdgeImage } from './paint-edges';

/** the look's numbers (tiles, alphas at strength 1) */
export const BUNKER_LOOK = {
  /** the bowl's slope band in from the edge, tiles, at its widest (a small bunker's is its own half-width: the field's reach) */
  bowl: 2.6,
  /** the shade under the far rim (bowl: over the slope; cast: the lip's shadow on the sand just under it, out to castLen) */
  dark: 1.0, cast: 0.45, castLen: 1.9,
  /** the light on the near face: its strength, its gap in from the edge and its ramp in */
  light: 0.32, gap: 0.05, ramp: 0.2,
  /** the rake lines: spacing (tiles), how much the spacing wavers (of a line), their dark and light (alphas), and the smallest spacing on
   *  screen they are drawn at (px; faded in up to twice that) */
  rake: 0.22, waver: 0.6, rakeDark: 0.16, rakeLight: 0.12, rakeMinPx: 3,
  /** the streaks down the far face: their frequency along the rim (per tile) and strength */
  streak: 5, streakA: 0.16,
  /** the rolled grass lip: its crest out from the edge, its half-width, its light and shade */
  lipAt: 0.14, lipW: 0.42, lipLight: 0.4, lipDark: 0.36,
  /** the grass mounds: their crest out from the edge, half-width, light and shade (scaled by the place: some swell more) */
  moundAt: 0.55, moundW: 2.1, moundLight: 0.3, moundDark: 0.3,
} as const;
/** how far past the sand's edge the look reaches, tiles (the mounds' outer foot) */
export const BUNKER_OUT = BUNKER_LOOK.moundAt + BUNKER_LOOK.moundW;
/** how far in from the edge the field must reach, tiles (the bowl; past it the rake lines run on the flat floor at the field's clamp) */
export const BUNKER_IN = BUNKER_LOOK.bowl + 0.25;

/** a bump of half-width w centred on c: its height (0..1) and slope (d height / d o) at o */
function bump(o: number, c: number, w: number): [number, number] {
  const t = (o - c) / w; if (t <= -1 || t >= 1) return [0, 0];
  const a = (Math.PI / 2) * t, cs = Math.cos(a);
  return [cs * cs, (-Math.PI / w) * cs * Math.sin(a)];
}
/** a box blur of radius r px over a W x H field, twice (a tent), edges clamped: the rims' facing, so where the nearest rim changes (the
 *  middle of a bunker, an inner corner) the light turns smoothly instead of in a crease */
function blur(src: Float32Array, W: number, H: number, r: number): Float32Array {
  if (r < 1) return src;
  let a = Float32Array.from(src), b = new Float32Array(src.length);
  for (let pass = 0; pass < 2; pass++) {
    for (let v = 0; v < H; v++) {
      const row = v * W; let acc = 0;
      for (let u = -r; u <= r; u++) acc += a[row + Math.min(W - 1, Math.max(0, u))]!;
      for (let u = 0; u < W; u++) { b[row + u] = acc / (2 * r + 1); acc += a[row + Math.min(W - 1, u + r + 1)]! - a[row + Math.max(0, u - r)]!; }
    }
    for (let u = 0; u < W; u++) {
      let acc = 0;
      for (let v = -r; v <= r; v++) acc += b[Math.min(H - 1, Math.max(0, v)) * W + u]!;
      for (let v = 0; v < H; v++) { a[v * W + u] = acc / (2 * r + 1); acc += b[Math.min(H - 1, v + r + 1) * W + u]! - b[Math.max(0, v - r) * W + u]!; }
    }
  }
  return a;
}
/** how far the rims' facing is blurred, tiles */
const FACING_BLUR = 0.4;
/** the far rim's weight from a sun facing (-1 turned from the sun .. 1 facing it) and the near rim's */
const farOf = (f: number) => smooth01((f + 0.15) / 0.9), nearOf = (f: number) => smooth01((0.15 - f) / 0.9);

/** a bunker's light on the sand and on the grass round it (the masks of textured shines: the sand's squared, the grass's a lift in
 *  proportion, renderer shine) and its shade (DARK_RGB multiplied) from its edge field (lineField with near: the nearest rim point per px),
 *  at strength k (0..2); pxPerTile, the cache's px per tile (the rake lines fade out where they would alias) */
export function bunkerImages(f: EdgeField & { nx?: Float32Array; ny?: Float32Array }, k: number, pxPerTile: number): { light: EdgeImage | null; lift: EdgeImage | null; dark: EdgeImage | null } {
  const B = BUNKER_LOOK, N = f.W * f.H, light = new Uint8ClampedArray(N * 4), lift = new Uint8ClampedArray(N * 4), dark = new Uint8ClampedArray(N * 4);
  const rakePx = B.rake * pxPerTile, rakeK = k * smooth01((rakePx - B.rakeMinPx) / B.rakeMinPx), streakK = k * smooth01((pxPerTile / B.streak - 1.5) / 1.5); // the streaks, too, only where they are a px or more apart
  let anyL = false, anyG = false, anyD = false;
  const sun = blur(f.sun, f.W, f.H, Math.round(FACING_BLUR * f.res));
  for (let v = 0; v < f.H; v++) {
    const ty = f.y0 + (v + 0.5) / f.res;
    for (let u = 0; u < f.W; u++) {
      const q = v * f.W + u, d = f.d[q]!, tx = f.x0 + (u + 0.5) / f.res, fc = sun[q]!;
      let la = 0, da = 0;
      if (d > 0) {
        // the bowl: its slope (1 at the rim, 0 where the floor flattens), turned from the sun under the far rim, to it inside the near rim
        const sl = d < B.bowl ? (1 - d / B.bowl) ** 1.2 : 0, far = farOf(fc), near = nearOf(fc);
        da += B.dark * sl * far + B.cast * far * (1 - smooth01(d / B.castLen));
        la += B.light * sl * near * smooth01((d - B.gap) / B.ramp);
        // the rake lines along the contours: a groove every `rake` tiles of distance in, its phase wavering with the place, light on its
        // far side; fainter on the flat floor, and in patches
        if (rakeK > 0 && d > 0.08) {
          const ph = d / B.rake + B.waver * (vnoise(tx / 2.7 + 11.3, ty / 2.7 - 4.1, 61) - 0.5) * 2, t = ph - Math.floor(ph);
          const patch = 0.45 + 0.55 * vnoise(tx / 1.9 - 7.7, ty / 1.9 + 2.2, 67), str = rakeK * patch * (0.55 + 0.45 * sl) * smooth01((d - 0.08) / 0.15);
          const groove = Math.exp(-(((t - 0.3) / 0.13) ** 2)), crest = Math.exp(-(((t - 0.62) / 0.15) ** 2));
          da += B.rakeDark * str * groove; la += B.rakeLight * str * crest;
        }
        // the streaks down the far face: a value noise of the rim point the px lies in from (it runs on down the slope's fall line)
        if (f.nx && sl > 0 && streakK > 0) {
          const sn = vnoise(f.nx[q]! * B.streak + 3.1, f.ny![q]! * B.streak - 9.4, 71) - 0.5, str = B.streakA * streakK * sl * (0.3 + 0.7 * far);
          if (sn < 0) da -= 2 * sn * str; else la += 1.2 * sn * str;
        }
      } else {
        // outside: the rolled lip and the mounds, lit where their slope faces the sun (the far rim's outer slope, the near rim's inner one)
        const o = -d, [, sLip] = bump(o, B.lipAt, B.lipW), [, sMound] = bump(o, B.moundAt, B.moundW);
        if (sLip || sMound) {
          const swell = 0.55 + 0.9 * vnoise(tx / 3.3 - 1.9, ty / 3.3 + 6.6, 73);
          // the outward normal's sun facing times the slope down and out: + lit, - shaded
          const bl = -fc * sLip * B.lipW, bm = -fc * sMound * B.moundW * swell;
          if (bl > 0) la += B.lipLight * bl; else da -= B.lipDark * bl;
          if (bm > 0) la += B.moundLight * bm; else da -= B.moundDark * bm;
        }
      }
      la *= k; da *= k;
      if (la > 0.004) { const p = 4 * q, im = d > 0 ? light : lift; im[p] = im[p + 1] = im[p + 2] = 255; im[p + 3] = Math.min(1, la) * 255; if (d > 0) anyL = true; else anyG = true; }
      if (da > 0.004) { const p = 4 * q; dark[p] = DARK_RGB[0]; dark[p + 1] = DARK_RGB[1]; dark[p + 2] = DARK_RGB[2]; dark[p + 3] = Math.min(0.92, da) * 255; anyD = true; }
    }
  }
  return { light: anyL ? { data: light, W: f.W, H: f.H } : null, lift: anyG ? { data: lift, W: f.W, H: f.H } : null, dark: anyD ? { data: dark, W: f.W, H: f.H } : null };
}

// ---- T253 part 3: the green's edge roll ----
/** the green's soft roll where it meets the fringe (the reference's greens round off into their collar): the green's top curving down over
 *  `w` tiles in from its edge and on down `out` tiles over the fringe, lit where that slope faces the sun (the far, upper-right edge),
 *  shaded where it turns from it (the near edge), a gap in from the edge (highlights inset); alphas at strength 1 */
export const GREEN_ROLL = { w: 0.9, out: 0.55, light: 0.4, dark: 0.32, gap: 0.04, ramp: 0.12 } as const;
/** how far the roll reaches from the green's edge, tiles (in and out) */
export const GREEN_ROLL_REACH = Math.max(GREEN_ROLL.w, GREEN_ROLL.out) + 0.2;
/** a green's roll as a light mask (a shine textured by the grass, a lift in proportion) and a shade (DARK_RGB multiplied) from its edge
 *  field, at strength k (0..2) */
export function greenRollImages(f: EdgeField, k: number): { light: EdgeImage | null; dark: EdgeImage | null } {
  const G = GREEN_ROLL, N = f.W * f.H, light = new Uint8ClampedArray(N * 4), dark = new Uint8ClampedArray(N * 4), sun = blur(f.sun, f.W, f.H, Math.round(FACING_BLUR * f.res));
  let anyL = false, anyD = false;
  for (let q = 0; q < N; q++) {
    const d = f.d[q]!;
    // the slope down and out (1 at the edge): inside the top's curve, outside its run-out over the fringe
    const sl = d >= 0 ? (d < G.w ? (1 - d / G.w) * smooth01((d - G.gap) / G.ramp) : 0) : -d < G.out ? (1 + d / G.out) ** 2 : 0;
    if (sl <= 0) continue;
    const b = sun[q]! * sl * k;
    if (b > 0) { const a = G.light * b; if (a > 0.004) { const p = 4 * q; light[p] = light[p + 1] = light[p + 2] = 255; light[p + 3] = Math.min(1, a) * 255; anyL = true; } }
    else { const a = -G.dark * b; if (a > 0.004) { const p = 4 * q; dark[p] = DARK_RGB[0]; dark[p + 1] = DARK_RGB[1]; dark[p + 2] = DARK_RGB[2]; dark[p + 3] = Math.min(0.9, a) * 255; anyD = true; } }
  }
  return { light: anyL ? { data: light, W: f.W, H: f.H } : null, dark: anyD ? { data: dark, W: f.W, H: f.H } : null };
}
