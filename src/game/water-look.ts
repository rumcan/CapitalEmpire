/** T230 (#669): the concept's water (docs/art/CONCEPT-LOOK.md step 5; the owner, 2026-10-27, with the concept picture
 *  docs/art/concept/maple-falls-concept.webp: "this is the look and feel we need to get to"): deep teal water, lighter at its edges and darker
 *  toward its middle, soft dark reflections of the trees and buildings on its shore, and T215's camera glint on every pond and river (T215
 *  phase 2; T199 lit only the swamp's pools).
 *
 *  - **Depth.** The ground worker measures how far each point of the water lies from its shore (WaterField: an exact Euclidean distance
 *    transform over a world-anchored lattice, padded past the chunk by the deepest reach, so neighbouring chunks agree) and shades the water's
 *    own picture by it: a multiply toward DEEP (deeper and more teal toward the middle, over `reach` tiles, a smooth curve), and near the shore
 *    a screen toward BED (the edge lighter, a hint of the bed). Both are curves over the texture's own pixels, never a flat wash (the owner's
 *    rule): every ripple keeps its contrast. They fade to nothing at the shore line itself, so nothing bleeds onto the bank.
 *  - **Reflections.** The tall things on the shore (the casters the living ground knows: trees, buildings) reflect as soft dark shapes straight
 *    down the screen from their foot, the mirror image of their crown or walls (a blurred silhouette: the worker has no sprite pixels), clipped
 *    to the water, fading out by REFLECT.reach tiles below the foot (the chunks know every caster that far: living-ground CHUNK_CASTER_REACH).
 *    Cheap: a sample loop over each nearby caster's box, a fraction of a millisecond a chunk.
 *  - **Glint.** With T215's switch on (window.__game.specCam, the Night panel), the water's gloss goes onto the chunk's gloss mask beside the
 *    swamp's (renderer.ts glossMask), and the GPU lights it by T199's glossLight as it does the swamp's pools: the same falloff, knobs and dusk
 *    fade, textured by the water's own ripples (the pixel's distance from the local mean the mask holds: the shaded water's mean colour), inset
 *    from the shore (GLINT.inset) and dimmed under the reflections (a tree's reflection hides the sky).
 *
 *  The look rides in the painted surfaces file (painted-surfaces.json `water`, Studio > Painted > Water look; the console
 *  window.__game.ground.setWaterLook): a missing block is the tuned look, `on: false` is the water exactly as before T230 (bit for bit: no
 *  field is made, nothing is drawn), and each knob at 0 leaves its part out. The swamp's own pools and the stream water inside its band keep
 *  T199's look (the creeks are not shaded). Pure: no DOM, importable from node tests. Units: tiles of 2 m; world px at zoom 1 (iso.ts). */
import { CASTER_STRIDE, CK } from './living-ground';
import { fbm, makeNoise } from './terrain/noise';

/** the water look's knobs */
export interface WaterLook {
  /** the look on; off: the water exactly as before T230 */
  on: boolean;
  /** the deep multiply's strength (0: none .. 1 the tuned look .. 2 strong) and how far from the shore it reaches its whole depth (tiles) */
  depth: number; reach: number;
  /** the rivers' own depth strength (the lead, 2026-10-28: the rivers wear the brighter lake picture, the concept's turquoise lake, and go a
   *  little less deep than the ponds); it stands in for `depth` on a river's water (renderer.ts waterOver, riverLook) */
  riverDepth: number;
  /** the light edge's strength (0: none .. 1 the tuned look .. 2) */
  edge: number;
  /** the shore's reflections' strength (0: none .. 1 the tuned look .. 2) */
  reflect: number;
  /** (not in the file: the palette riverLook sets for a river's water; absent: the ponds', POND_PAL) */
  pal?: WaterPalette;
}
/** the tuned look (against the concept's course pond and lake, at 30%, 15% and 8%) */
export const DEFAULT_WATER_LOOK: Readonly<WaterLook> = { on: true, depth: 1, reach: 7, riverDepth: 0.6, edge: 1, reflect: 1 };
/** the look off: the water exactly as before T230 */
export const WATER_OFF: Readonly<WaterLook> = { ...DEFAULT_WATER_LOOK, on: false };
/** the knobs' ranges */
export const WATER_RANGES = { depth: [0, 2], reach: [2, 12], riverDepth: [0, 2], edge: [0, 2], reflect: [0, 2] } as const;
type Ranged = keyof typeof WATER_RANGES;
/** a look with every knob held to its range (missing or bad: the tuned look's) */
export function clampWaterLook(f: unknown): WaterLook {
  const o = (f && typeof f === 'object' ? f : {}) as Partial<Record<keyof WaterLook, unknown>>, D = DEFAULT_WATER_LOOK;
  const num = (k: Ranged) => { const v = o[k], [lo, hi] = WATER_RANGES[k]; return Math.round(Math.min(hi, Math.max(lo, typeof v === 'number' && Number.isFinite(v) ? v : D[k])) * 1000) / 1000; };
  return { on: typeof o.on === 'boolean' ? o.on : D.on, depth: num('depth'), reach: num('reach'), riverDepth: num('riverDepth'), edge: num('edge'), reflect: num('reflect') };
}
/** the look a river's water is shaded with: the rivers' own depth strength in place of the ponds', and the rivers' palette */
export const riverLook = (l: WaterLook): WaterLook => ({ ...l, depth: l.riverDepth, pal: RIVER_PAL });
const memo = new WeakMap<object, WaterLook>();
/** the look a surfaces file carries (painted-surfaces.ts SurfacesFile.water), clamped and kept per file (the file is never changed) */
export function waterLookOf(file: { water?: unknown } | null | undefined): WaterLook {
  if (!file) return clampWaterLook(null);
  let f = memo.get(file); if (!f) memo.set(file, f = clampWaterLook(file.water)); return f;
}
/** the look draws anything at all */
export const waterLookActive = (l: WaterLook) => l.on && (l.depth > 0 || l.edge > 0 || l.reflect > 0);

// ---------- the colours and curves ----------
/** the deep water at depth 1: a multiply (0..1 a channel: darker, the red going most), then a faint screen of a deep blue (0..255, DEEP_LIFT:
 *  the blue lifted a little, so the middle reads deeper and more teal-blue, the concept's, not just darker; a screen keeps the ripples) */
export const DEEP = [0.66, 0.8, 0.95] as const;
export const DEEP_LIFT = [0, 6, 24] as const;
/** the light edge: a screen toward a warm pale bed colour (0..255) at most EDGE.a, rising over the first EDGE.rise tiles in from the shore
 *  line (none on the line: no bleed onto the bank) and fading out between EDGE.fade[0] and EDGE.fade[1]; the shallows' width varies along
 *  the shore (vary: the distance's scale, from a world-space noise of `wave` tiles, so chunks agree and no shore draws an even band) */
export const BED = [150, 146, 104] as const;
export const EDGE = { a: 0.24, rise: 0.7, fade: [0.8, 3.6], vary: [0.55, 1.5], wave: 9 } as const;
/** a water picture's palette: the deep's multiply and blue lift, the light edge's screen colour */
export interface WaterPalette { deep: readonly number[]; lift: readonly number[]; bed: readonly number[] }
/** the ponds' (the concept's deep pond water, teal-green: the deep pushes it teal-blue, the edge shows a warm hint of the bed) */
export const POND_PAL: WaterPalette = { deep: DEEP, lift: DEEP_LIFT, bed: BED };
/** the rivers' (the brighter lake picture, already the concept lake's turquoise: the deep keeps its teal, darkening the blue as much as the
 *  green and the red most, with no blue lift; the edge goes bright turquoise, as the concept lake's shallows) */
export const RIVER_PAL: WaterPalette = { deep: [0.8, 0.84, 0.81], lift: [0, 0, 0], bed: [70, 170, 150] };
/** the palette a look shades with (riverLook sets the rivers'; else the ponds') */
const palOf = (l: { pal?: WaterPalette }) => l.pal ?? POND_PAL;
const NOISE = makeNoise(0x7a7e);
/** the shallows' width scale at tile (x, y) (EDGE.vary): the light edge reads d / s tiles in */
export const shallowAt = (x: number, y: number) => EDGE.vary[0] + (EDGE.vary[1] - EDGE.vary[0]) * (0.5 + 0.5 * clamp(1.7 * fbm(NOISE, x / EDGE.wave + 3.7, y / EDGE.wave - 1.3, 2), -1, 1));
/** the depth curve's start (tiles in from the shore line: the edge keeps the texture as it is there) */
export const DEPTH_START = 0.3;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const smooth = (a: number, b: number, v: number) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
/** how deep the water reads d tiles in from its shore (0 at the edge .. 1 past the reach): a smooth curve that drops off the bank and
 *  levels out toward the middle */
export function depthAt(d: number, reach: number): number {
  const p = clamp((d - DEPTH_START) / Math.max(0.1, reach - DEPTH_START), 0, 1);
  return p * (2 - p) * smooth(0, 0.25, p * 4); // (an ease-out, its very start eased in: no crease at DEPTH_START)
}
/** the light edge's alpha d tiles in from the shore at the edge knob k */
export const edgeAt = (d: number, k: number) => EDGE.a * k * smooth(0, EDGE.rise, d) * (1 - smooth(EDGE.fade[0], EDGE.fade[1], d));
/** the reflections: a dark, cool multiply at reflection 1 (the shore's thing hides the sky the water mirrors) at REFLECT_A of the reflect
 *  knob, then a faint screen of its own colour (REFLECT_TINTS, by what it is: a maple's red, an oak's russet, a birch's gold, a mixed
 *  broadleaf's orange, a conifer's deep green, a building's walls) at REFLECT_TINT of it, so a red maple mirrors as a dark red */
export const REFLECT_COL = [0.42, 0.5, 0.54] as const;
export const REFLECT_A = 0.72;
export const REFLECT_TINT = 0.24;
/** the reflection tints (0..255) by index: 0 a building's walls, 1..4 a broadleaf by its leaves' mood (leaf-fall.ts MOOD + 1: maple, oak,
 *  birch, mixed), 5 a conifer */
export const REFLECT_TINTS: readonly (readonly number[])[] = [[96, 84, 74], [196, 58, 36], [166, 92, 44], [214, 162, 58], [206, 108, 42], [44, 84, 62]];
/** the multiply factor (0..1 a channel) of a point at depth curve t (depthAt) and reflection r (0..1) under look l */
export function shadeFactor(t: number, r: number, l: Pick<WaterLook, 'depth' | 'reflect' | 'pal'>): number[] {
  const kd = clamp(t * l.depth, 0, 2), kr = clamp(r * REFLECT_A * l.reflect, 0, 1);
  return palOf(l).deep.map((c, i) => Math.max(0, 1 - kd * (1 - c)) * (1 - kr * (1 - REFLECT_COL[i]!)));
}
const screen = (v: number, s: number) => 255 - ((255 - v) * (255 - s)) / 255;
/** the last screen's share a channel (0..1): the deep's blue lift at depth curve t and the reflection's tint at reflection r, one after the
 *  other (two screens of alpha a1 colour S1 and a2 S2 are one of a S = 1 - (1 - a1 S1)(1 - a2 S2), so the bake lays them as one image) */
export function liftShare(t: number, r: number, l: Pick<WaterLook, 'depth' | 'reflect' | 'pal'>, tint: readonly number[], i: number): number {
  const ad = clamp(t * l.depth, 0, 1), at = clamp(r * REFLECT_TINT * l.reflect, 0, 1);
  return 1 - (1 - (ad * palOf(l).lift[i]!) / 255) * (1 - (at * tint[i]!) / 255);
}
/** the CPU twin of the bake (the canvas's 'screen', 'multiply' and 'screen' again, as renderer.ts waterOver lays them): pixel c (0..255) d tiles
 *  in from the shore, at reflection r of tint `tint` (REFLECT_TINTS), where the shallows' width scale is s (shallowAt), under look l. Off
 *  (l.on false): c itself */
export function waterPixel(c: readonly number[], d: number, r: number, l: WaterLook, s = 1, tint: readonly number[] = REFLECT_TINTS[0]!): number[] {
  if (!waterLookActive(l)) return [...c];
  const a = edgeAt(d / s, l.edge), t = depthAt(d, l.reach), f = shadeFactor(t, r, l), bed = palOf(l).bed;
  return c.map((v, i) => { const lifted = v + (screen(v, bed[i]!) - v) * a, shaded = lifted * f[i]!; return shaded + (255 - shaded) * liftShare(t, r, l, tint, i); });
}

// ---------- the glint ----------
/** the water's glint on the gloss mask (swamp.ts glossLight lights it): its gloss (alpha) at most `a`, inset from the shore (none within
 *  inset[0] tiles, whole past inset[1]: the textured-highlights rule, a gap inside the edge then a soft rise), dimmed by `refl` of a
 *  reflection's strength (a tree's reflection hides the sky) */
export const GLINT = { a: 0.42, inset: [0.35, 1.8], refl: 0.85 } as const;
export const glintAt = (d: number, r: number) => GLINT.a * smooth(GLINT.inset[0], GLINT.inset[1], d) * (1 - GLINT.refl * clamp(r, 0, 1));

// ---------- the reflections ----------
/** the reflections' numbers: a tree's height in its canopy radii (a broadleaf's, a conifer's: leafiness under `conifer`), its crown's
 *  half-width in canopy radii, the crown's centre and half-height as shares of the height, the share of the crown's ellipse (squared) that
 *  reflects whole (core: soft from there to its rim); a building's height (world px at zoom 1); the fade down the screen (tiles below the
 *  foot: whole until fade, none past reach; reach x sqrt 2 stays within the casters a chunk knows, living-ground CHUNK_CASTER_REACH) */
export const REFLECT = { broad: 2.6, needle: 3.4, conifer: 0.75, crownW: 0.95, crownY: 0.55, crownH: 0.42, core: 0.3, building: 230, fade: 4.4, reach: 6.2 } as const;
/** a tile's length across the screen (world px at zoom 1): a ground circle of radius c tiles is c x this wide each side of its centre */
const TILE_ACROSS = 64 * Math.SQRT2; // 90.5

// ---------- the field ----------
/** the field's resolution (samples a tile): a district chunk 1 (a tile is a few px there), a full chunk 2 (a sample 19 px at 30%: the depth,
 *  the edge and the glint are smooth, laid bilinear), 4 at the hi-DPI levels (L 0.45 and 0.6, where a tile is 58..77 px). Measured in node on
 *  a 30% river chunk: res 2 makes the field, its images and the glint in about 1.1 ms, res 4 in 5.7 */
export const fieldRes = (L: number, lite: boolean) => (lite ? 1 : L >= 0.45 ? 4 : 2);
/** how far (tiles) the field reaches past the chunk's box: the reach plus a tile (the distance past it is capped alike everywhere) */
export const fieldPad = (l: Pick<WaterLook, 'reach'>) => Math.ceil(l.reach) + 1;
/** the sites a sample of water belongs to (bits): a river, the course's water, a painted water area */
export const SITE = { river: 1, course: 2, paint: 4 } as const;

/** the water over a chunk's tile box: which samples are water (by site) and how far each lies from its shore. Sample (u, v) is the tile
 *  point (x0 + (u + 0.5) / res, y0 + (v + 0.5) / res); x0 y0 are whole tiles, so every chunk samples the same world lattice */
export class WaterField {
  readonly W: number; readonly H: number;
  /** the site bits of each sample (0: land) */
  readonly site: Uint8Array;
  /** each sample's distance in from its shore (tiles; 0 on land, at most cap), set by shore() */
  readonly d: Float32Array;
  /** each sample's reflection (0..1), set by reflect() */
  refl: Float32Array | null = null;
  private shallow: Float32Array | null = null;
  /** each water sample's shallows' width scale (shallowAt) where the light edge can reach, else 1: the noise on the whole-tile lattice,
   *  bilinear between (world-anchored, so every chunk reads the same), made once */
  shallows(): Float32Array {
    if (this.shallow) return this.shallow;
    const { W, H, res, x0, y0, site, d } = this, out = new Float32Array(W * H).fill(1), far = EDGE.fade[1] * EDGE.vary[1], LW = Math.ceil(W / res) + 2;
    const lat = new Float32Array(LW * (Math.ceil(H / res) + 2)).fill(NaN);
    const L = (i: number, j: number) => { const k = j * LW + i; let v = lat[k]!; if (v !== v) v = lat[k] = shallowAt(x0 + i, y0 + j); return v; };
    const [iu0, iv0, iu1, iv1] = this.inner;
    for (let v = iv0; v <= iv1 && v < H; v++) {
      const fy = (v + 0.5) / res, j = Math.floor(fy), ty = fy - j;
      for (let u = iu0; u <= iu1 && u < W; u++) {
        const k = v * W + u; if (!site[k] || d[k]! >= far) continue;
        const fx = (u + 0.5) / res, i = Math.floor(fx), tx = fx - i, a = L(i, j) + (L(i + 1, j) - L(i, j)) * tx, b = L(i, j + 1) + (L(i + 1, j + 1) - L(i, j + 1)) * tx;
        out[k] = a + (b - a) * ty;
      }
    }
    return (this.shallow = out);
  }
  /** the samples the images are made over (u0, v0, u1, v1, inclusive): the chunk's own box and a sample round it (the padding only feeds the
   *  distance; nothing is drawn there) */
  readonly inner: [number, number, number, number];
  constructor(readonly x0: number, readonly y0: number, w: number, h: number, readonly res: number, pad = 0) {
    this.W = Math.max(1, Math.ceil(w * res)); this.H = Math.max(1, Math.ceil(h * res));
    this.site = new Uint8Array(this.W * this.H); this.d = new Float32Array(this.W * this.H);
    const p = Math.max(0, pad * res - 1); this.inner = [Math.min(p, this.W - 1), Math.min(p, this.H - 1), Math.max(0, this.W - 1 - p), Math.max(0, this.H - 1 - p)];
  }
  /** a field over tile box b (whole tiles) grown by pad */
  static over(b: readonly number[], pad: number, res: number) { return new WaterField(Math.floor(b[0]!) - pad, Math.floor(b[1]!) - pad, Math.ceil(b[2]!) - Math.floor(b[0]!) + 2 * pad, Math.ceil(b[3]!) - Math.floor(b[1]!) + 2 * pad, res, pad); }
  /** the field's tile box */
  get box(): [number, number, number, number] { return [this.x0, this.y0, this.x0 + this.W / this.res, this.y0 + this.H / this.res]; }
  /** any water at all (of the sites in mask) */
  any(mask = 0xff) { for (let k = 0; k < this.site.length; k++) if (this.site[k]! & mask) return true; return false; }
  /** T248 (water-motion.ts): the water motion's extras, made by motion() before the sites are marked (null: none): each water sample's
   *  downstream direction (x, y a sample: a river's, from its spline; 0 on still water) and its waves' strength (the lap amplitude, 0..1: by
   *  the river's width, by a pond's area), written by waterway and rings with their `lap` */
  flow: Float32Array | null = null; amp: Float32Array | null = null;
  /** T248: keep the motion's extras as the sites are marked */
  motion(): this { const N = this.W * this.H; this.flow ??= new Float32Array(2 * N); this.amp ??= new Float32Array(N); return this; }
  /** a ring set (flat x, y rings, tiles) filled even-odd, as one surface (a course chunk's rings, an area's outline), marked with bit; with
   *  the motion's extras (motion()) and lap, each water sample takes the waves' strength lap(area) of the ring round it (its tiles squared; the
   *  largest where rings nest) */
  rings(rings: readonly ArrayLike<number>[], bit: number, lap?: (area: number) => number) {
    const { W, H, res, x0, y0, site } = this, xs: number[] = [];
    let ya = Infinity, yb = -Infinity;
    for (const p of rings) for (let i = 1; i < p.length; i += 2) { const y = p[i]!; if (y < ya) ya = y; if (y > yb) yb = y; }
    /** the spans of the rings (all: even-odd) on each row, to f(v, u0, u1) */
    const spans = (list: readonly ArrayLike<number>[], ya: number, yb: number, f: (v: number, u0: number, u1: number) => void) => {
      const v0 = Math.max(0, Math.floor((ya - y0) * res - 0.5)), v1 = Math.min(H - 1, Math.ceil((yb - y0) * res - 0.5));
      for (let v = v0; v <= v1; v++) {
        const ty = y0 + (v + 0.5) / res; xs.length = 0;
        for (const p of list) {
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
          if (u1 >= u0) f(v, u0, u1);
        }
      }
    };
    spans(rings, ya, yb, (v, u0, u1) => { for (let u = u0; u <= u1; u++) site[v * W + u] |= bit; });
    const am = this.amp; if (!am || !lap) return;
    for (const p of rings) {
      // (the ring's own area, shoelace; its own spans: a pond's samples take its strength, an island's ring marks only land)
      let A = 0, ra = Infinity, rb = -Infinity; const n = p.length >> 1;
      for (let i = 0; i < n; i++) { const j = (i + 1) % n, y = p[2 * i + 1]!; A += p[2 * i]! * p[2 * j + 1]! - p[2 * j]! * y; if (y < ra) ra = y; if (y > rb) rb = y; }
      const a = lap(Math.abs(A) / 2);
      spans([p], ra, rb, (v, u0, u1) => { for (let u = u0; u <= u1; u++) { const k = v * W + u; if (site[k]! & bit && a > am[k]!) am[k] = a; } });
    }
  }
  /** a waterway (terrain-paint.ts waterShape at extra 0: a disc at each point, a trapezoid between each two) marked with bit; with the motion's
   *  extras (motion()), each sample takes the way's direction there (its spline runs downstream: terrain generate, the source edge to the
   *  exit) and, with lap, the waves' strength lap(width) of its width (tiles) */
  waterway(pts: readonly { x: number; y: number; w: number }[], bit: number, widthScale = 1, lap?: (width: number) => number) {
    const { W, H, res, x0, y0, site } = this, rad = (p: { w: number }) => Math.max(0.05, (p.w / 2) * widthScale), fl = this.flow, am = this.amp;
    const [bx0, by0, bx1, by1] = this.box;
    const each = (xa: number, ya: number, xb: number, yb: number, f: (x: number, y: number) => boolean, fx = 0, fy = 0, a = 0) => {
      if (xb < bx0 || xa > bx1 || yb < by0 || ya > by1) return;
      const u0 = Math.max(0, Math.floor((xa - x0) * res - 0.5)), u1 = Math.min(W - 1, Math.ceil((xb - x0) * res - 0.5));
      const v0 = Math.max(0, Math.floor((ya - y0) * res - 0.5)), v1 = Math.min(H - 1, Math.ceil((yb - y0) * res - 0.5));
      for (let v = v0; v <= v1; v++) {
        const y = y0 + (v + 0.5) / res;
        for (let u = u0; u <= u1; u++) {
          const k = v * W + u; if (site[k]! & bit) continue;
          if (f(x0 + (u + 0.5) / res, y)) { site[k] |= bit; if (fl) { fl[2 * k] = fx; fl[2 * k + 1] = fy; am![k] = a; } }
        }
      }
    };
    /** the way's unit direction at point i (its neighbours' chord; one-sided at the ends) */
    const dirAt = (i: number): [number, number] => {
      const a = pts[Math.max(0, i - 1)]!, b = pts[Math.min(pts.length - 1, i + 1)]!, l = Math.hypot(b.x - a.x, b.y - a.y);
      return l > 1e-6 ? [(b.x - a.x) / l, (b.y - a.y) / l] : [0, 0];
    };
    pts.forEach((p, i) => { const r = rad(p), r2 = r * r, [fx, fy] = fl ? dirAt(i) : [0, 0]; each(p.x - r, p.y - r, p.x + r, p.y + r, (x, y) => (x - p.x) ** 2 + (y - p.y) ** 2 <= r2, fx, fy, fl && lap ? lap(p.w * widthScale) : 0); });
    for (let k = 0; k + 1 < pts.length; k++) {
      const a = pts[k]!, b = pts[k + 1]!, ra = rad(a), rb = rad(b), g = Math.max(ra, rb), dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
      if (!(len > 1e-6)) continue;
      const ux = dx / len, uy = dy / len;
      each(Math.min(a.x, b.x) - g, Math.min(a.y, b.y) - g, Math.max(a.x, b.x) + g, Math.max(a.y, b.y) + g, (x, y) => {
        const t = ((x - a.x) * ux + (y - a.y) * uy) / len; if (t < 0 || t > 1) return false;
        return Math.abs((x - a.x) * uy - (y - a.y) * ux) <= ra + (rb - ra) * t;
      }, ux, uy, fl && lap ? lap(((a.w + b.w) / 2) * widthScale) : 0);
    }
  }
  /** the squared distance (in samples) from each sample to the nearest seed: D holds 0 at the seeds and INF elsewhere, and is overwritten (an
   *  exact Euclidean distance transform, Felzenszwalb and Huttenlocher: one pass down each column, one along each row) */
  private edt(D: Float64Array) {
    const { W, H } = this;
    const n = Math.max(W, H), f = new Float64Array(n), out = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
    const pass = (len: number) => {
      let k = 0; v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
      for (let q = 1; q < len; q++) {
        let s = ((f[q]! + q * q) - (f[v[k]!]! + v[k]! * v[k]!)) / (2 * q - 2 * v[k]!);
        while (s <= z[k]!) { k--; s = ((f[q]! + q * q) - (f[v[k]!]! + v[k]! * v[k]!)) / (2 * q - 2 * v[k]!); }
        k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
      }
      k = 0;
      for (let q = 0; q < len; q++) { while (z[k + 1]! < q) k++; const t = q - v[k]!; out[q] = t * t + f[v[k]!]!; }
    };
    for (let x = 0; x < W; x++) { for (let y = 0; y < H; y++) f[y] = D[y * W + x]!; pass(H); for (let y = 0; y < H; y++) D[y * W + x] = out[y]!; }
    for (let y = 0; y < H; y++) { for (let x = 0; x < W; x++) f[x] = D[y * W + x]!; pass(W); for (let x = 0; x < W; x++) D[y * W + x] = out[x]!; }
  }
  /** each water sample's distance in from its shore (tiles, at most cap): an exact Euclidean distance transform (Felzenszwalb and
   *  Huttenlocher) to the nearest land sample, less half a sample (the shore lies between the two). Past the field's border counts as more
   *  of what lies there (no shore), so with the field padded by the cap every sample of the chunk reads its true distance */
  shore(cap: number) {
    const { W, H, res, site, d } = this, N = W * H, INF = 1e20, D = new Float64Array(N);
    for (let k = 0; k < N; k++) D[k] = site[k] ? INF : 0;
    this.edt(D);
    for (let k = 0; k < N; k++) d[k] = site[k] ? Math.min(cap, Math.max(0, (Math.sqrt(D[k]!) - 0.5) / res)) : 0;
  }
  /** T248: each land sample's distance out from the water (tiles, at most cap; 0 on the water): shore's twin the other way (the bank side of
   *  the waves: water-motion.ts), the same transform to the nearest water sample, less half a sample */
  bank(cap: number): Float32Array {
    const { W, H, res, site } = this, N = W * H, INF = 1e20, D = new Float64Array(N), out = new Float32Array(N);
    for (let k = 0; k < N; k++) D[k] = site[k] ? 0 : INF;
    this.edt(D);
    for (let k = 0; k < N; k++) out[k] = site[k] ? 0 : Math.min(cap, Math.max(0, (Math.sqrt(D[k]!) - 0.5) / res));
    return out;
  }
  /** the reflections of the casters (living-ground.ts records: trees and buildings; the rest are low) on the water, 0..1 a sample (the
   *  strongest of them, with its tint's index into REFLECT_TINTS: reflTint): each a soft silhouette straight down the screen from its foot,
   *  whole over its core */
  reflect(casters: ArrayLike<number>) {
    const { W, H, res, x0, y0, site } = this, out = new Float32Array(W * H), tint = new Uint8Array(W * H); let any = false, now = 0;
    // which samples are water, summed (a caster whose reflection's box holds none is skipped whole)
    const S = new Int32Array((W + 1) * (H + 1));
    for (let v = 0; v < H; v++) { let row = 0; for (let u = 0; u < W; u++) { row += site[v * W + u] ? 1 : 0; S[(v + 1) * (W + 1) + u + 1] = S[v * (W + 1) + u + 1]! + row; } }
    const has = (u0: number, v0: number, u1: number, v1: number) => S[(v1 + 1) * (W + 1) + u1 + 1]! - S[v0 * (W + 1) + u1 + 1]! - S[(v1 + 1) * (W + 1) + u0]! + S[v0 * (W + 1) + u0]! > 0;
    const [iu0, iv0, iu1, iv1] = this.inner;
    /** the water samples in tile box (xa, ya, xb, yb) through f (its value at the sample's tile point) */
    const each = (xa: number, ya: number, xb: number, yb: number, f: (px: number, py: number) => number) => {
      // (only over the chunk's own samples: nothing is drawn over the padding)
      const u0 = Math.max(iu0, Math.floor((xa - x0) * res - 0.5)), u1 = Math.min(iu1, Math.ceil((xb - x0) * res - 0.5));
      const v0 = Math.max(iv0, Math.floor((ya - y0) * res - 0.5)), v1 = Math.min(iv1, Math.ceil((yb - y0) * res - 0.5));
      if (u1 < u0 || v1 < v0 || !has(u0, v0, u1, v1)) return;
      for (let v = v0; v <= v1; v++) {
        const py = y0 + (v + 0.5) / res;
        for (let u = u0; u <= u1; u++) {
          const k = v * W + u; if (!site[k]) continue;
          const val = f(x0 + (u + 0.5) / res, py);
          if (val > out[k]!) { out[k] = val; tint[k] = now; any = true; }
        }
      }
    };
    /** the fade down the screen, t tiles (each way) below the foot */
    const fadeAt = (t: number) => 1 - smooth(REFLECT.fade, REFLECT.reach, t);
    const R = REFLECT.reach;
    for (let o = 0; o + CASTER_STRIDE <= casters.length; o += CASTER_STRIDE) {
      const kind = casters[o]!;
      if (kind === CK.TREE) {
        // the crown's mirror image: an ellipse down the screen from the trunk's foot (its centre crownY of the height below it), soft to its rim
        const x = casters[o + 1]!, y = casters[o + 2]!, c = casters[o + 3]!, lf = casters[o + 4]!, mood = casters[o + 5]!; if (!(c > 0)) continue;
        const needle = lf > 0 && lf < REFLECT.conifer, ht = c * TILE_ACROSS * (needle ? REFLECT.needle : REFLECT.broad), rx = c * TILE_ACROSS * REFLECT.crownW * (needle ? 0.7 : 1);
        const yc = ht * REFLECT.crownY, ry = ht * REFLECT.crownH, g = rx / 64 + 0.5;
        now = needle ? 5 : mood >= 1 && mood <= 4 ? mood : 4;
        each(x - g, y - g, x + R + g, y + R + g, (px, py) => {
          const ox = px - x, oy = py - y, dY = (ox + oy) * 32; if (dY <= 0) return 0;
          const q = (((ox - oy) * 64) / rx) ** 2 + ((dY - yc) / ry) ** 2;
          return q < 1 ? (1 - smooth(REFLECT.core, 1, q)) * fadeAt(dY / 64) : 0;
        });
      } else if (kind === CK.BUILDING) {
        // the walls' mirror image: the footprint swept down the screen by the height (a point is in it when some point up the screen by t,
        // 0 <= t <= T tiles each way, lies in the footprint); soft by the length of that run of t (thin at the sides and the far end), fading
        // by how far below the footprint it starts
        const ax = Math.min(casters[o + 1]!, casters[o + 3]!), bx = Math.max(casters[o + 1]!, casters[o + 3]!), ay = Math.min(casters[o + 2]!, casters[o + 4]!), by = Math.max(casters[o + 2]!, casters[o + 4]!);
        const T = REFLECT.building / 64; now = 0;
        each(ax, ay, bx + T, by + T, (px, py) => {
          const lo = Math.max(px - bx, py - by, 0), hi = Math.min(px - ax, py - ay, T);
          return hi > lo ? smooth(0, 0.8, hi - lo) * fadeAt(lo) : 0;
        });
      }
    }
    this.refl = any ? out : null; this.reflTint = any ? tint : null;
  }
  /** each sample's reflection's tint (an index into REFLECT_TINTS), set by reflect() */
  reflTint: Uint8Array | null = null;
}

/** the bake's images over the field (RGBA, W x H, sample (u, v) at the field's lattice), for the samples of the sites in mask: the light edge
 *  (lay with 'screen': colour BED, alpha its strength), the shade (lay with 'multiply': colour and alpha such that dest x (1 - a + a c) is
 *  the depth's and the reflection's factor) and the deep's blue lift with the reflections' own colours (lay with 'screen' last: liftShare); null where nothing is
 *  drawn. Samples off the mask are transparent */
export function waterImages(f: WaterField, mask: number, l: WaterLook): { edge: Uint8ClampedArray | null; shade: Uint8ClampedArray | null; tint: Uint8ClampedArray | null } {
  if (!waterLookActive(l)) return { edge: null, shade: null, tint: null };
  const N = f.W * f.H, edge = l.edge > 0 ? new Uint8ClampedArray(N * 4) : null, shade = l.depth > 0 || l.reflect > 0 ? new Uint8ClampedArray(N * 4) : null;
  const tint = l.depth > 0 || (l.reflect > 0 && f.refl && f.reflTint) ? new Uint8ClampedArray(N * 4) : null, s = edge ? f.shallows() : null;
  const { site, d: dist, refl, reflTint, W } = f, P = palOf(l), [u0, v0, u1, v1] = f.inner, kdMax = 2, ka = REFLECT_A * l.reflect, kt = REFLECT_TINT * l.reflect;
  let anyE = false, anyS = false, anyT = false;
  for (let v = v0; v <= v1; v++) for (let u = u0; u <= u1; u++) {
    const k = v * W + u; if (!(site[k]! & mask)) continue;
    const d = dist[k]!, r = refl ? refl[k]! : 0, q = 4 * k;
    if (edge) { const a = Math.round(edgeAt(d / s![k]!, l.edge) * 255); if (a > 0) { edge[q] = P.bed[0]!; edge[q + 1] = P.bed[1]!; edge[q + 2] = P.bed[2]!; edge[q + 3] = a; anyE = true; } }
    const t = depthAt(d, l.reach);
    if (shade) {
      // shadeFactor, inline (no arrays: a chunk has tens of thousands of samples)
      const kd = clamp(t * l.depth, 0, kdMax), kr = clamp(r * ka, 0, 1);
      const F0 = Math.max(0, 1 - kd * (1 - P.deep[0]!)) * (1 - kr * (1 - REFLECT_COL[0])), F1 = Math.max(0, 1 - kd * (1 - P.deep[1]!)) * (1 - kr * (1 - REFLECT_COL[1])), F2 = Math.max(0, 1 - kd * (1 - P.deep[2]!)) * (1 - kr * (1 - REFLECT_COL[2]));
      const a = 1 - Math.min(F0, F1, F2);
      if (a > 0.5 / 255) { const A = Math.round(a * 255) / 255; shade[q] = Math.round((1 - (1 - F0) / A) * 255); shade[q + 1] = Math.round((1 - (1 - F1) / A) * 255); shade[q + 2] = Math.round((1 - (1 - F2) / A) * 255); shade[q + 3] = Math.round(A * 255); anyS = true; }
    }
    if (tint && (t > 0 || r > 0)) {
      // the deep's blue lift and the reflection's tint as one screen (liftShare): alpha the largest share, colour the shares over it
      const c = r > 0 && reflTint ? REFLECT_TINTS[reflTint[k]!] ?? REFLECT_TINTS[0]! : REFLECT_TINTS[0]!, ad = clamp(t * l.depth, 0, 1), at = clamp(r * kt, 0, 1);
      const P0 = 1 - (1 - (ad * P.lift[0]!) / 255) * (1 - (at * c[0]!) / 255), P1 = 1 - (1 - (ad * P.lift[1]!) / 255) * (1 - (at * c[1]!) / 255), P2 = 1 - (1 - (ad * P.lift[2]!) / 255) * (1 - (at * c[2]!) / 255);
      const a = Math.max(P0, P1, P2);
      if (a > 0.5 / 255) { const A = Math.round(a * 255) / 255; tint[q] = Math.round((P0 / A) * 255); tint[q + 1] = Math.round((P1 / A) * 255); tint[q + 2] = Math.round((P2 / A) * 255); tint[q + 3] = Math.round(A * 255); anyT = true; }
    }
  }
  return { edge: anyE ? edge : null, shade: anyS ? shade : null, tint: anyT ? tint : null };
}
/** the glint's image over the field for the sites in mask (RGBA: alpha the gloss, glintAt; colour the water's local mean colour as the bake
 *  shades it: `mean` (the water's picture's mean, 0..255) through waterPixel), or null when it has none */
export function glintImage(f: WaterField, mask: number, l: WaterLook, mean: readonly number[]): Uint8ClampedArray | null {
  const N = f.W * f.H, out = new Uint8ClampedArray(N * 4); let any = false;
  const look = waterLookActive(l) ? l : null, s = look && look.edge > 0 ? f.shallows() : null, [u0, v0, u1, v1] = f.inner, W = f.W;
  // the mean through the look at a depth step (the depth curve and the edge are smooth: a 32nd of a tile apart reads the same to 8 bits),
  // cached by (depth step, shallows step, reflection step, tint); a plain loop otherwise
  const memo = new Map<number, number[]>();
  for (let v = v0; v <= v1; v++) for (let u = u0; u <= u1; u++) {
    const k = v * W + u; if (!(f.site[k]! & mask)) continue;
    const d = f.d[k]!, r = look && f.refl ? f.refl[k]! : 0, a = Math.round(glintAt(d, r * (look ? look.reflect : 0)) * 255); if (a <= 0) continue;
    let m = mean;
    if (look) {
      const ti = f.reflTint && r > 0 ? f.reflTint[k]! : 0, sh = s ? s[k]! : 1, key = ((Math.round(d * 32) * 64 + Math.round(sh * 32)) * 64 + Math.round(r * 32)) * 8 + ti;
      let c = memo.get(key); if (!c) memo.set(key, c = waterPixel(mean, Math.round(d * 32) / 32, Math.round(r * 32) / 32, look, Math.round(sh * 32) / 32, REFLECT_TINTS[ti]));
      m = c;
    }
    const q = 4 * k; out[q] = Math.round(m[0]!); out[q + 1] = Math.round(m[1]!); out[q + 2] = Math.round(m[2]!); out[q + 3] = a; any = true;
  }
  return any ? out : null;
}
/** a hex colour (#rrggbb) as 0..255 numbers (bad: a dark teal) */
export function hexRgb(h: string | null | undefined): number[] {
  const m = /^#?([0-9a-f]{6})$/i.exec(h ?? ''); if (!m) return [30, 67, 66];
  const n = parseInt(m[1]!, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
