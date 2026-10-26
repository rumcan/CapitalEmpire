// Painted surfaces' edges (the owner, 2026-10-24: "the edges of painted texture needs a light feather and a bevel, with shadow and light").
// Every painted area's outline gets a light feather (its alpha fades to 0 over a short band, so it blends into what lies under it) and a
// gentle bevel lit by the one sun at the screen's upper right: edges facing the sun get a soft light rim, edges facing away a soft dark rim
// and a faint shadow cast outward (at 145° on screen, as cast-shadow.ts).
// T110 (the owner's light rule): the light rim is a mask; the renderer lays it as a shine textured by the surface under it (its own colour
// squared: its mid-tones and lit tips brighten, its dark gaps stay dark) starting a small gap inside the edge (renderer.ts areaLight); the
// dark rim and the cast shadow are multiplied in one cool shade colour (SHADE_RGB, the course shadows' and the edge shade's), so the
// texture stays visible in them. Greens and tees are raised (a stronger bevel), fairways gentle,
// a bunker is sunken (the light and dark sides swap, nothing is cast outside), water and the flat grasses only feather, paving stays crisp.
// Works on any simple polygon (rounded corners, the rounded unions of many cells): everything comes from the distance to the outline.
// The ground painter (renderer.ts drawPaints) bakes these images per area when its chunk re-bakes, never per frame.
// Pure TypeScript, no DOM, deterministic. Units: tiles of 2 m; res = image px per tile; L = the ground cache level (cache px per world px).
import { SUN_TILE_DIR } from './ext/course-height';
import { HH, HW } from './iso';
import { vnoise } from './living-ground';

/** how a painted surface's edge is drawn: crisp (as before: paving, kerbs), flat (feather only), turf (fairway: a gentle bevel), raised
 *  (green, tee: a stronger bevel and cast shadow), sunken (bunker: the bevel reversed), water (feather only) */
export type EdgeProfile = 'crisp' | 'flat' | 'turf' | 'raised' | 'sunken' | 'water';

/** the numbers of one edge profile */
export interface EdgeLook {
  /** the feather band, tiles: the surface's alpha ramps from 0 at the outline to 1 this far inside */
  feather: number;
  /** how far past the feather the bevel rim fades out, tiles */
  bevel: number;
  /** the strongest light rim on edges facing the sun: the alpha (0..1) of its mask, through which the renderer adds the surface's own colour
   *  squared times a warm tint (a textured shine, T110) */
  light: number;
  /** the strongest dark rim: alpha (0..1) of DARK_RGB laid in 'multiply' on edges facing away */
  dark: number;
  /** the strongest cast shadow on the ground outside: alpha (0..1) of SHADOW_RGB laid in 'multiply' (T110: the ground keeps its texture) */
  shadow: number;
  /** the cast shadow's reach outside an edge facing straight away from the sun, tiles */
  shadowLen: number;
  /** a sunken surface (bunker): light on the edges facing away from the sun, dark on those facing it, no shadow outside */
  sunken: boolean;
}

/** each profile's look (null: crisp, drawn as before); tuned at the closest zoom (cache level 0.6) and mid zooms. T110: the light is a
 *  textured shine's mask (about as bright as the old flat screen on the surface's mid-tones, brighter on its lit tips, none in its dark gaps),
 *  the dark rim and the shadow multiplies of SHADE_RGB (as dark in green as the old darker rim colour and the old near-black shadow, a touch
 *  cooler) */
export const EDGE_LOOKS: Readonly<Record<EdgeProfile, Readonly<EdgeLook> | null>> = {
  crisp: null,
  flat: { feather: 0.5, bevel: 0, light: 0, dark: 0, shadow: 0, shadowLen: 0, sunken: false },
  water: { feather: 0.45, bevel: 0, light: 0, dark: 0, shadow: 0, shadowLen: 0, sunken: false },
  turf: { feather: 0.6, bevel: 0.55, light: 0.22, dark: 0.29, shadow: 0.3, shadowLen: 0.55, sunken: false },
  raised: { feather: 0.55, bevel: 0.75, light: 0.42, dark: 0.53, shadow: 0.57, shadowLen: 0.95, sunken: false },
  sunken: { feather: 0.25, bevel: 1.8, light: 0.48, dark: 0.95, shadow: 0, shadowLen: 0, sunken: true },
};

/** the sunlight's colour (warm), RGB 0..255: the light mask images carry it (the renderer's textured shine uses its own warm tint) */
export const LIGHT_RGB: readonly [number, number, number] = [255, 236, 176];
/** the one cool shade every ground shadow multiplies in (T110: shade reads as sky light and the texture stays), RGB 0..255: the course
 *  shadows' SHADE_TINT in renderer.ts and the edge shade's AREA_SHADE.rgb */
export const SHADE_RGB: readonly [number, number, number] = [112, 120, 152];
/** the dark rim's colour (multiplied over the surface): the shade */
export const DARK_RGB: readonly [number, number, number] = SHADE_RGB;
/** the cast shadow's colour (multiplied over the ground under it): the shade */
export const SHADOW_RGB: readonly [number, number, number] = SHADE_RGB;

/** paved textures keep a crisp edge (their own dark rim) */
const PAVED = /^(asphalt|lotAsphalt|paving|pad|slabs|concrete|chipSeal|roadgravel)/;

/** the edge profile of a painted surface: from its golf surface or brush kind when it has one (green, tee, fairway, bunker, water, the rest
 *  of the course flat), else its texture (water feathers, paving and a kerb border stay crisp, any other ground feathers); btex: its border's
 *  texture, only when it has a border */
export function edgeProfileOf(surface: string | null | undefined, tex: string, btex?: string): EdgeProfile {
  if (btex === 'kerb' && !surface) return 'crisp';
  switch (surface) {
    case 'green': case 'tee': return 'raised';
    case 'fairway': return 'turf';
    case 'bunker': return 'sunken';
    case 'water': return 'water';
    case 'fringe': case 'firstCut': case 'rough': case 'fescue': case 'waste': case 'path': case 'other': return 'flat';
  }
  if (tex.startsWith('water')) return 'water';
  if (PAVED.test(tex)) return 'crisp';
  return 'flat';
}

/** a smooth 0..1 step of x over [0, 1] (clamped) */
export function smooth01(x: number): number { return x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x); }

/** the outward unit normal of each edge i (corner i to corner i+1) of a closed polygon x0 y0 x1 y1 ... (tiles), whichever way it winds;
 *  a zero-length edge gets (0, 0). Returns nx0 ny0 nx1 ny1 ... */
export function edgeNormals(pts: readonly number[]): Float64Array {
  const n = pts.length >> 1, out = new Float64Array(2 * n), s = windSign(pts);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, dx = pts[2 * j]! - pts[2 * i]!, dy = pts[2 * j + 1]! - pts[2 * i + 1]!, len = Math.hypot(dx, dy);
    if (len < 1e-9) continue;
    out[2 * i] = (dy / len) * s + 0; out[2 * i + 1] = (-dx / len) * s + 0;
  }
  return out;
}
/** +1 when the polygon's signed area (x right, y down) is >= 0, else -1: the sign that turns (dy, -dx) outward */
function windSign(pts: readonly number[]): number {
  const n = pts.length >> 1; let a = 0;
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; a += pts[2 * i]! * pts[2 * j + 1]! - pts[2 * j]! * pts[2 * i + 1]!; }
  return a >= 0 ? 1 : -1;
}

/** how much an outward normal (nx, ny) (tiles, unit) faces the sun at the screen's upper right: its dot with SUN_TILE_DIR, -1 (away) .. 1 (toward) */
export function sunFacing(nx: number, ny: number): number { return nx * SUN_TILE_DIR.x + ny * SUN_TILE_DIR.y; }

/** the light and dark weights (0..1) of an edge from its sun facing (-1..1): a raised surface is lit where it faces the sun and dark where it
 *  faces away; a sunken one (bunker) the other way round (its far wall, on the lower left, faces the sun) */
export function edgeShade(facing: number, sunken: boolean): { light: number; dark: number } {
  const toward = Math.max(0, Math.min(1, facing)) ** 0.8, away = Math.max(0, Math.min(1, -facing)) ** 0.8;
  return sunken ? { light: away, dark: toward } : { light: toward, dark: away };
}

/** true for a cell seam: an axis-aligned edge lying on a multiple of cell tiles (courseAreas cuts big course areas along such lines, and the
 *  next cell carries the surface on), which gets no feather, bevel or shadow; cell 0: no seams */
export function isCellSeam(ax: number, ay: number, bx: number, by: number, cell: number): boolean {
  if (!(cell > 0)) return false;
  const on = (v: number) => Math.abs(v / cell - Math.round(v / cell)) * cell < 1e-6;
  return (ax === bx && on(ax)) || (ay === by && on(ay));
}

/** the length of a tile's side on screen at zoom 1, px */
const TILE_PX = Math.hypot(HW, HH);

/** the feather band at cache level L, tiles: the look's band, widened at far zooms so it still spans about 2.5 cache px, at most 1.5 tiles */
export function featherTiles(look: Readonly<EdgeLook>, L: number): number {
  return Math.min(1.5, Math.max(look.feather, 2.5 / (TILE_PX * Math.max(L, 1e-3))));
}

/** the edge images' resolution at cache level L, px per tile: about one image px per 6 cache px, 1 to 5 (the bilinear stretch smooths between;
 *  at the closest level 5 px a tile keeps 2-3 px across the feather) */
export function edgeRes(L: number): number { return Math.max(1, Math.min(5, Math.round((TILE_PX * L) / 6))); }

/** how far from the outline the edge images reach (inside and out), tiles */
export function edgeReach(look: Readonly<EdgeLook>, feather: number): number {
  return Math.max(feather + look.bevel, look.sunken || !look.shadow ? 0 : look.shadowLen + 0.25) + 0.25;
}

/** the outline's signed distance near the edge of one polygon, sampled at px centres x0 + (u + 0.5) / res, y0 + (v + 0.5) / res */
export interface EdgeField {
  /** the sampled box: its corner (tiles), size (px) and resolution (px per tile) */
  x0: number; y0: number; W: number; H: number; res: number;
  /** signed distance to the nearest non-seam edge, tiles: + inside, - outside, clamped to +-reach */
  d: Float32Array;
  /** the outline's sun facing at that nearest point (-1..1; sunFacing of the outward direction, rounded about corners) */
  sun: Float32Array;
  /** 1 for an outside px nearer a seam edge than any other edge (the next cell's surface: nothing is cut or cast there) */
  seam: Uint8Array;
  /** some px lies within reach of a non-seam edge */
  any: boolean;
}

/** the signed distance field of a closed polygon pts (tiles, simple, either winding) over tiles [x0, x0 + w) x [y0, y0 + h) at res px per
 *  tile, out to reach tiles from the outline; edges on a multiple of seamCell tiles (isCellSeam) are seams. Cost: one scanline pass for
 *  inside, then only the px within reach of each edge (its band), so it scales with the outline's length, not the box */
export function edgeField(pts: readonly number[], x0: number, y0: number, w: number, h: number, res: number, reach: number, seamCell = 0): EdgeField {
  const W = Math.max(1, Math.ceil(w * res)), H = Math.max(1, Math.ceil(h * res)), N = W * H, n = pts.length >> 1;
  const d = new Float32Array(N).fill(reach), dSeam = new Float32Array(N).fill(reach), sun = new Float32Array(N), seam = new Uint8Array(N), inside = new Uint8Array(N);
  let any = false;
  if (n < 3) { d.fill(-reach); return { x0, y0, W, H, res, d, sun, seam, any }; }
  // inside: even-odd crossings along each px row
  const xs: number[] = [];
  for (let v = 0; v < H; v++) {
    const ty = y0 + (v + 0.5) / res; xs.length = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, ay = pts[2 * i + 1]!, by = pts[2 * j + 1]!;
      if ((ay <= ty) !== (by <= ty)) { const ax = pts[2 * i]!, bx = pts[2 * j]!; xs.push(ax + ((ty - ay) * (bx - ax)) / (by - ay)); }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const u0 = Math.max(0, Math.ceil((xs[k]! - x0) * res - 0.5)), u1 = Math.min(W - 1, Math.ceil((xs[k + 1]! - x0) * res - 0.5) - 1);
      for (let u = u0; u <= u1; u++) inside[v * W + u] = 1;
    }
  }
  // the distance to each edge over its band: per px row, the segment's x extent within reach of the row, grown by reach
  const ws = windSign(pts), sx = SUN_TILE_DIR.x, sy = SUN_TILE_DIR.y;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, ax = pts[2 * i]!, ay = pts[2 * i + 1]!, bx = pts[2 * j]!, by = pts[2 * j + 1]!, dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
    if (len2 < 1e-12) continue;
    const len = Math.sqrt(len2), isSeam = isCellSeam(ax, ay, bx, by, seamCell), fEdge = ((dy / len) * ws) * sx + ((-dx / len) * ws) * sy;
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
        if (isSeam) { if (dist < dSeam[k]!) dSeam[k] = dist; continue; }
        if (dist >= d[k]!) continue;
        d[k] = dist; any ||= dist < reach;
        // the facing: the edge's own normal along its length; about a corner the direction from the outline to the px (outside) or from the
        // px to the outline (inside), so a rounded or sharp corner turns smoothly from one edge's light to the next
        sun[k] = (t <= 0 || t >= 1) && dist > 1e-4 ? ((inside[k] ? -1 : 1) * (ex * sx + ey * sy)) / dist : fEdge;
      }
    }
  }
  for (let k = 0; k < N; k++) {
    if (inside[k]) continue;
    if (dSeam[k]! < d[k]!) seam[k] = 1;
    d[k] = -d[k]!;
  }
  return { x0, y0, W, H, res, d, sun, seam, any };
}

/** an RGBA image over a tile box (data row-major, W x H px), drawn stretched through the chunk's iso transform */
export interface EdgeImage { data: Uint8ClampedArray; W: number; H: number }
/** one area's edge images over the same box (null: nothing to draw): cut (alpha to remove from the surface: 'destination-out'), light (the
 *  mask of a textured shine, a gap inside the edge: renderer.ts areaLight), dark (DARK_RGB in 'multiply'), both over the surface before the
 *  cut; shadow (SHADOW_RGB in 'multiply') on the ground under it */
export interface EdgeImages { cut: EdgeImage | null; light: EdgeImage | null; dark: EdgeImage | null; shadow: EdgeImage | null }

/** the surface's alpha at signed distance d (tiles, + inside) with a feather band of f tiles: 0 at and outside the outline, 1 from f in */
export function featherAlpha(d: number, f: number): number { return d <= 0 ? 0 : smooth01(d / Math.max(f, 1e-6)); }
/** the bevel rim's weight (0..1) at distance d inside (tiles): full out to 35% of the feather, fading to 0 at feather + bevel */
export function rimWeight(d: number, feather: number, bevel: number): number {
  if (d < 0) return 0;
  const a = 0.35 * feather, b = feather + bevel;
  return b <= a ? 0 : 1 - smooth01((d - a) / (b - a));
}
/** a sunken surface's wall (bunker) at distance d inside (tiles): full from the outline through the feather, where the sand is solid, fading
 *  to 0 a bevel further in, so the far lip's shade and the near wall's light read as a hollow instead of being cut away with the feather */
export function sunkenWeight(d: number, feather: number, bevel: number): number {
  if (d < 0) return 0;
  return d <= feather ? 1 : 1 - smooth01((d - feather) / Math.max(bevel, 1e-6));
}
/** the cast shadow's weight (0..1) at signed distance d (tiles) by an edge of sun facing `facing`: under the feather band inside (where the
 *  surface is see-through), and outside out to 0.25 + shadowLen * (how much the edge faces away); 0 on edges facing the sun */
export function castWeight(d: number, facing: number, feather: number, look: Readonly<EdgeLook>): number {
  const away = Math.max(0, Math.min(1, -facing));
  if (!look.shadow || look.sunken || away <= 0) return 0;
  const k = away ** 0.75;
  if (d >= 0) return d < feather ? k : 0;
  return k * (1 - smooth01(-d / (0.25 + look.shadowLen * away)));
}

/** the edge images of one field with a look and its feather band (tiles), each null when it would draw nothing */
export function edgeImages(f: EdgeField, look: Readonly<EdgeLook>, feather: number): EdgeImages {
  const N = f.W * f.H, mk = () => new Uint8ClampedArray(N * 4);
  let cut: Uint8ClampedArray | null = null, light: Uint8ClampedArray | null = null, dark: Uint8ClampedArray | null = null, shadow: Uint8ClampedArray | null = null;
  if (!f.any) return { cut: null, light: null, dark: null, shadow: null };
  for (let k = 0; k < N; k++) {
    if (f.seam[k]) continue;
    const d = f.d[k]!, q = 4 * k;
    const rem = 1 - featherAlpha(d, feather);
    if (rem > 0.002) { cut ??= mk(); cut[q + 3] = rem * 255; }
    if (d >= 0 && (look.light > 0 || look.dark > 0)) {
      const rim = look.sunken ? sunkenWeight(d, feather, look.bevel) : rimWeight(d, feather, look.bevel);
      if (rim > 0) {
        const s = edgeShade(f.sun[k]!, look.sunken), la = rim * s.light * look.light, da = rim * s.dark * look.dark;
        if (la > 0.002) { light ??= mk(); light[q] = LIGHT_RGB[0]; light[q + 1] = LIGHT_RGB[1]; light[q + 2] = LIGHT_RGB[2]; light[q + 3] = la * 255; }
        if (da > 0.002) { dark ??= mk(); dark[q] = DARK_RGB[0]; dark[q + 1] = DARK_RGB[1]; dark[q + 2] = DARK_RGB[2]; dark[q + 3] = da * 255; }
      }
    }
    const sa = castWeight(d, f.sun[k]!, feather, look) * look.shadow;
    if (sa > 0.002) { shadow ??= mk(); shadow[q] = SHADOW_RGB[0]; shadow[q + 1] = SHADOW_RGB[1]; shadow[q + 2] = SHADOW_RGB[2]; shadow[q + 3] = sa * 255; }
  }
  const img = (data: Uint8ClampedArray | null): EdgeImage | null => (data ? { data, W: f.W, H: f.H } : null);
  return { cut: img(cut), light: img(light), dark: img(dark), shadow: img(shadow) };
}

/** a border band's soft inner edge (a band b tiles deep inside the outline, drawn as strokes of the outline clipped to the area): n strokes,
 *  widest first, each a half-width (tiles; the stroke is twice as wide) and an alpha, so the band covers 1 out to b - w/2, 0 from b + w/2 and
 *  steps evenly between (w = min(feather, b), n >= 2); step k's alpha is 1 / (n - k), so the coverage after it is (k + 1) / n */
export function bandRamp(b: number, feather: number, n = 6): { half: number; alpha: number }[] {
  const w = Math.max(0, Math.min(feather, b)), m = Math.max(2, Math.round(n)), out: { half: number; alpha: number }[] = [];
  for (let k = 0; k < m; k++) out.push({ half: b + w / 2 - (w * k) / (m - 1), alpha: 1 / (m - k) });
  return out;
}

/** the tile box [x0, y0, x1, y1] (integers) the edge images of an area with tile box pb need inside the chunk's tile box cb, or null when it is empty */
export function edgeBox(pb: readonly number[], cb: readonly number[], reach: number): [number, number, number, number] | null {
  const x0 = Math.max(cb[0]!, Math.floor(pb[0]! - reach) - 1), y0 = Math.max(cb[1]!, Math.floor(pb[1]! - reach) - 1);
  const x1 = Math.min(cb[2]!, Math.ceil(pb[2]! + reach) + 1), y1 = Math.min(cb[3]!, Math.ceil(pb[3]! + reach) + 1);
  return x1 > x0 && y1 > y0 ? [x0, y0, x1, y1] : null;
}

// ---- a painted area's edge shade (T136, the Shadow slider beside Border width) ----
// The Paint tool's areas are flat (their edge profile only feathers, or stays crisp). Their Shadow (0..1) makes one read as slightly raised under
// the sun at the upper right: a cool multiply inside the edges turned away from the sun (their outward side toward 145° on screen), strongest at
// the edge and fading inward over a few metres, so the texture stays visible in it (T110: never a flat dark band); and a faint light on the
// edges turned to the sun, a small gap inside the edge, laid by the renderer as a shine textured by the area's own colours (on its mid-tones
// and highlights, never its dark gaps). Both stay inside the area: nothing is cast on the course, a road or another area beside it.
// Depths are measured from where the edge reads: the outline for a crisp area; for a feathered one (its feather fades the outer part of the
// surface into the ground under it, so a shade or a light there would be lost) the shade stays full out to three quarters of the feather band,
// where the surface is nearly opaque, and the light's gap starts at its middle, where the edge is seen.
// The images come from the same signed distance field as the edge profile (edgeField), baked when the area's chunk bakes, never per frame.

/** the edge shade's numbers: its depth (how far in it fades out, tiles) at a faint and at a full Shadow, its strongest multiply alpha (an edge
 *  turned straight away at Shadow 1), its cool shade colour (RGB 0..255: the course shadows' SHADE_TINT in renderer.ts, so one shadow colour
 *  reads across the ground), how much a slow world-space noise varies the depth (so its inner edge is never one even band), and the light on
 *  the sun side: its strongest mask alpha, the gap inside the edge, the ramp in after it and the band's width (tiles: 0.2 m, 0.16 m, 0.8 m),
 *  drawn from cache level lightL up (its band about 3 cache px there; further out, and on district chunks, the shade alone) */
export const AREA_SHADE = { len0: 1, len1: 1.75, max: 0.8, rgb: SHADE_RGB, noise: 0.25, light: 0.5, gap: 0.1, ramp: 0.08, width: 0.4, lightL: 0.1 } as const;

/** an area's Shadow as its bake uses it: 0 (none: absent, not a number, or not above 0) .. 1 */
export function areaShadow(v: unknown): number { return typeof v === 'number' && v > 0 ? Math.min(1, v) : 0; }
/** how far in the shade fades out at Shadow s, tiles past the edge (0 with none): 2 m when faint, 3.5 m at full */
export function areaShadeLen(s: number): number { const v = areaShadow(s); return v > 0 ? AREA_SHADE.len0 + (AREA_SHADE.len1 - AREA_SHADE.len0) * v : 0; }
/** where an area with a feather band of `feather` tiles has its edge for the shade, tiles inside the outline: the outline itself when crisp,
 *  three quarters of the band in when feathered (the surface is nearly opaque there) */
export function areaShadeEdge(feather: number): number { return feather > 0 ? 0.75 * feather : 0; }
/** where it has its edge for the light: the outline when crisp, the middle of the feather band (where the edge is seen) when feathered */
export function areaLightEdge(feather: number): number { return feather > 0 ? 0.5 * feather : 0; }
/** how far from the outline the shade's images reach at Shadow s on an area with a feather band of `feather` tiles (its longest depth with the
 *  noise past its edge, and a margin for the stretch), tiles; 0 with none */
export function areaShadeReach(s: number, feather = 0): number { const len = areaShadeLen(s); return len > 0 ? areaShadeEdge(feather) + len * (1 + AREA_SHADE.noise) + 0.25 : 0; }
/** how much an edge of sun facing f (sunFacing of its outward normal, -1 away .. 1 toward) is shaded: all of it turned straight away (its
 *  outside toward 145° on screen), a little turned side-on (the shade wraps a touch past it, as light on a rounded edge does), none once it
 *  turns to the sun */
export function shadeFacing(f: number): number { const v = (0.2 - f) / 1.2; return v <= 0 ? 0 : v >= 1 ? 1 : v ** 1.2; }
/** how much an edge of sun facing f takes the light on the sun side: none side-on or turned away (or only a little to the sun: the light is
 *  for the edges that face it), all of it turned straight to the sun */
export function lightFacing(f: number): number { const v = (f - 0.3) / 0.7; return v <= 0 ? 0 : v >= 1 ? 1 : v ** 0.8; }
/** the shade's falloff at depth d tiles inside the outline over depth len past the edge e: 1 out to the edge, easing to 0 a depth further in
 *  (a soft S-curve: no line where it stops), 0 outside the outline */
export function shadeFalloff(d: number, len: number, e = 0): number { return d < 0 || !(len > 0) ? 0 : 1 - smooth01((d - e) / len); }
/** the slow noise (0..1) that varies the shade's depth at tile (x, y): world-space value noise of about 6 m, never periodic, the same in
 *  every chunk */
export function shadeNoise(x: number, y: number): number { return vnoise(x / 3.1 + 17.3, y / 3.1 - 5.9, 71); }
/** the shade's multiply alpha (0..1, of AREA_SHADE.rgb) at depth d tiles inside the outline, an edge of sun facing f, Shadow s, the noise n
 *  there (0.5: none) and the edge e tiles in */
export function areaShadeAlpha(d: number, f: number, s: number, n = 0.5, e = 0): number {
  const v = areaShadow(s); if (!v) return 0;
  return v * AREA_SHADE.max * shadeFacing(f) * shadeFalloff(d, areaShadeLen(v) * (1 + AREA_SHADE.noise * (2 * n - 1)), e);
}
/** the sun side's light band across the edge at depth d tiles (0..1) with the edge e tiles in: full from the outline through the gap and its
 *  ramp, fading out over the band's width. The low-resolution mask the renderer stretches; it cuts the gap out at full resolution (areaLightGap) */
export function lightBand(d: number, e = 0): number { return d < 0 ? 0 : 1 - smooth01((d - e - AREA_SHADE.gap - AREA_SHADE.ramp) / AREA_SHADE.width); }
/** the light's inset (0..1) at depth d with the edge e tiles in: nothing within the gap inside the edge, ramping in over the next
 *  AREA_SHADE.ramp (T110: a highlight starts a small gap inside the edge, never on the edge line) */
export function areaLightGap(d: number, e = 0): number { return smooth01((d - e - AREA_SHADE.gap) / AREA_SHADE.ramp); }
/** the light's mask alpha (0..1; the renderer's shine adds the area's own colour squared through it) at depth d, an edge of sun facing f,
 *  Shadow s, the edge e tiles in */
export function areaLightAlpha(d: number, f: number, s: number, e = 0): number {
  const v = areaShadow(s); return v ? v * AREA_SHADE.light * lightFacing(f) * lightBand(d, e) * areaLightGap(d, e) : 0;
}

/** the tile box an edge image's lit px cover (alpha above 0) from tile (x0, y0) at res px a tile, grown by a px (the bilinear stretch reaches
 *  half a px past them): where a light's textured shine is worked (renderer.ts areaLight); null when nothing is lit */
export function litBox(img: EdgeImage | null, x0: number, y0: number, res: number): [number, number, number, number] | null {
  if (!img) return null;
  let u0 = Infinity, v0 = Infinity, u1 = -Infinity, v1 = -Infinity;
  for (let v = 0; v < img.H; v++) for (let u = 0; u < img.W; u++) if (img.data[4 * (v * img.W + u) + 3]) { if (u < u0) u0 = u; if (u > u1) u1 = u; if (v < v0) v0 = v; if (v > v1) v1 = v; }
  return u1 < 0 ? null : [x0 + (u0 - 1) / res, y0 + (v0 - 1) / res, x0 + (u1 + 2) / res, y0 + (v1 + 2) / res];
}

/** an area's edge shade images over a field's box: shade (AREA_SHADE.rgb in 'multiply', clipped to the area; null: none) and the light's mask
 *  (white; its alpha the band times the facing and strength, the gap not yet cut: the renderer cuts it at full resolution; null: none), with
 *  the tile box the light covers */
export interface AreaShadeImages { shade: EdgeImage | null; light: EdgeImage | null; lightBox: [number, number, number, number] | null }
/** the edge shade images of one field (edgeField over the area's outline, out to at least areaShadeReach(s, feather)) at Shadow s on an area
 *  with a feather band of `feather` tiles (0: crisp); withLight false leaves the light out (far levels and district chunks, where its band is
 *  under a cache px) */
export function areaShadeImages(f: EdgeField, s: number, withLight = true, feather = 0): AreaShadeImages {
  const v = areaShadow(s), N = f.W * f.H;
  if (!v || !f.any) return { shade: null, light: null, lightBox: null };
  const e = areaShadeEdge(feather), le = areaLightEdge(feather);
  const [R, G, B] = AREA_SHADE.rgb, lenMax = e + areaShadeLen(v) * (1 + AREA_SHADE.noise), lightMax = le + AREA_SHADE.gap + AREA_SHADE.ramp + AREA_SHADE.width;
  let shade: Uint8ClampedArray | null = null, light: Uint8ClampedArray | null = null, u0 = Infinity, v0 = Infinity, u1 = -Infinity, v1 = -Infinity;
  for (let k = 0; k < N; k++) {
    const d = f.d[k]!; if (d < 0 || d >= lenMax) continue;
    const fc = f.sun[k]!, u = k % f.W, w = (k - u) / f.W;
    if (shadeFacing(fc) > 0) {
      const a = areaShadeAlpha(d, fc, v, shadeNoise(f.x0 + (u + 0.5) / f.res, f.y0 + (w + 0.5) / f.res), e);
      if (a > 0.002) { shade ??= new Uint8ClampedArray(N * 4); const q = 4 * k; shade[q] = R; shade[q + 1] = G; shade[q + 2] = B; shade[q + 3] = a * 255; }
    }
    if (withLight && d < lightMax && lightFacing(fc) > 0) {
      const a = v * AREA_SHADE.light * lightFacing(fc) * lightBand(d, le);
      if (a > 0.002) {
        light ??= new Uint8ClampedArray(N * 4); const q = 4 * k; light[q] = light[q + 1] = light[q + 2] = 255; light[q + 3] = a * 255;
        if (u < u0) u0 = u; if (u > u1) u1 = u; if (w < v0) v0 = w; if (w > v1) v1 = w;
      }
    }
  }
  const img = (data: Uint8ClampedArray | null): EdgeImage | null => (data ? { data, W: f.W, H: f.H } : null);
  // the light's box: its px grown by one (the bilinear stretch reaches half a px past them)
  const lightBox: [number, number, number, number] | null = light ? [f.x0 + (u0 - 1) / f.res, f.y0 + (v0 - 1) / f.res, f.x0 + (u1 + 2) / f.res, f.y0 + (v1 + 2) / f.res] : null;
  return { shade: img(shade), light: img(light), lightBox };
}
