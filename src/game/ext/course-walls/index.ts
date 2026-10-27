/** Course walls (T099, the owner 2026-10-25: "make the fringes on bunkers and greens and fairways and edges on the T boxes and water holes to be
 * like the pavement we have next to our roads ... look 3d with alot of depth and build seamlessless and automatic"). Every course surface
 * has a height (SURF_HEIGHT: water and bunkers sunk, greens and tees raised, the fairway a touch), and every drawn edge of a course chunk
 * (droplet outlines, course-blobs) is sorted by the heights on its two sides:
 * - a **wall**: the heights differ. The higher side's face shows only where it looks toward the camera (screen down: tile direction (1, 1)),
 *   like a kerb face: a raised green's lower edges on screen, a bunker's or a pond's far (upper) edges. Wall runs keep only those faces;
 *   the renderer hangs each one straight down the screen from the edge by its height difference (the top stays where the grid says, so
 *   sprites, cursors and markers still line up) and lights it by its normal against the sun at the upper right;
 * - a **joint**: a surface against its own collar band at the same height (green and fringe, tee or fairway and first cut): a crisp mowing
 *   line, like the joint between a kerb's top and the road;
 * - **soft**: the same height on both sides otherwise (rough into the map grass, a lip into the rough): feathered as before;
 * - hidden: the edge is covered by a layer drawn later, or the boundary belongs to the layer drawn later (its own edge carries it), so
 *   each boundary of the picture is classified exactly once and a green beside a bunker shows one wall from the green down to the sand.
 * Height steps whose face turns to the sun also give lit top edges (RimRun), on the higher top. The bunker's lip and the pond's bank are
 * overlays (isOverlay): they lie on the ground under them, take its height and take no part in the walls, which stand on the solid layers'
 * outlines (those meet cleanly where three surfaces meet). Which layer is on top at a point comes from the droplet fields of the very cells
 * the outlines were contoured from (SurfaceOutline.cover) and the renderer's draw order (DRAW_ORDER), sampled just inside and just outside
 * each edge point; where a segment's two ends disagree it is sampled along and cut where the kind changes. Every value at a point depends
 * only on that point and the global grid, and a chunk cut point lies on its uncut segment, so the walls of two chunks meet exactly at their
 * border. Pure TypeScript, no DOM, deterministic. Units: tiles of 2 m for positions; metres for heights. */
import { CELL_T, SURF, type Grid } from '../course-grid';
import { BLOB_STYLE, ISO_T, coverField, type BlobStyle, type CellCover, type SurfaceOutline } from '../course-blobs';
import { SUN_LIGHT, SUN_TILE_DIR } from '../course-height';

const { water: WATER, fairway: FAIRWAY, tee: TEE, bunker: BUNKER, green: GREEN } = SURF;
/** the number of surface ids (0..8) */
const N_SURF = Object.keys(SURF).length;

/** each surface id's height in metres above the map grass (the owner's terraces, tuned by eye at 30% and 15% zoom): water -0.8, bunker sand
 *  -0.6, rough and fescue 0, fairway +0.05, tee +0.6 (T127, the owner 2026-10-25: "make the tee higher like as high as bunkers are deep"),
 *  waste 0, green +0.25. A tee's and a green's can be set with the Height slider (HEIGHT_RANGE, surfHeights) */
export const SURF_HEIGHT: readonly number[] = [0, 0, 0, -0.8, 0.05, 0.6, -0.6, 0, 0.25];
/** the Height slider's range per surface id, metres (T127): a tee from a low grass bank to a tall rock face, a green from a hint to a high
 *  bank; null: the surface's height is fixed */
export const HEIGHT_RANGE: readonly (readonly [number, number] | null)[] = [null, null, null, null, null, [0.15, 1.6], null, null, [0.05, 0.8]];
/** SURF_HEIGHT with the Height slider's settings (metres by surface id; clamped to HEIGHT_RANGE; a missing or bad entry, or a surface with a
 *  fixed height, keeps the default) */
export function surfHeights(over?: readonly (number | undefined)[]): readonly number[] {
  if (!over?.length) return SURF_HEIGHT;
  return SURF_HEIGHT.map((h, s) => { const v = over[s], r = HEIGHT_RANGE[s]; return r && v !== undefined && Number.isFinite(v) ? Math.min(r[1], Math.max(r[0], v)) : h; });
}
/** height differences below this (m) are flat */
export const FLAT_DH = 0.02;
/** how tall a metre of wall stands on the screen, world px (a true metre in this projection is about 40, the kerb's face 42 a metre: the course
 *  stands twice as tall, so a green's 25 cm reads at 15% zoom too) */
export const WALL_PX_PER_M = 80;
/** a wall's drop on the ground plane per metre, tiles along the direction (1, 1) (straight down the screen: a tile step (1, 1) is 2 HH world
 *  px down) */
export const WALL_DROP = WALL_PX_PER_M / (2 * 32);
/** a wall's cast shadow per metre of height, tiles along the shadows' direction (the sun about 46° up, with the walls' stretch) */
export const WALL_SHADOW = 0.9;
/** the Shadow slider's hairline (the owner's test, 2026-10-25: "the shadow under the fairway or whatever you paint is a bit too strong make
 *  it hairline"): 0 is no shadow at all, this a thin soft contact line, 1 the strong cast shadow T099 drew */
export const SHADOW_HAIRLINE = 0.15;
/** the Shadow by default: the hairline */
export const DEFAULT_SHADOW = SHADOW_HAIRLINE;
/** each surface's Shadow by default: a green none at all (the owner, 2026-10-25: "no shadows under greens please"), every other the hairline */
export const defaultShadow = (s: number) => (s === GREEN ? 0 : SHADOW_HAIRLINE);
/** how the walls' shadows are drawn at Shadow s (0 none, SHADOW_HAIRLINE a hairline, 1 strong; T110: every part multiplied in the cool shade
 *  colour, so the ground keeps its texture): the cast shadow's length per metre of drop (tiles) and alpha, and the contact shade along the
 *  foot as a soft wide stroke and a tight dark line (widths in tiles, with their least widths in screen px, and alphas). From none to the
 *  hairline the hairline's strokes fade in; the hairline is a thin soft contact line with a faint short cast, not a broad dark band; from
 *  there to 1 they widen and darken to the full cast shadow and contact shade */
export interface WallShade { cast: number; castA: number; soft: number; softPx: number; softA: number; line: number; linePx: number; lineA: number }
export function wallShade(s: number = DEFAULT_SHADOW): WallShade {
  const v = Math.min(1, Math.max(0, Number.isFinite(s) ? s : DEFAULT_SHADOW));
  const fade = Math.min(1, v / SHADOW_HAIRLINE), t = Math.max(0, (v - SHADOW_HAIRLINE) / (1 - SHADOW_HAIRLINE)), mix = (a: number, b: number) => a + (b - a) * t;
  // T196 (the owner, 2026-10-27: borders "blurred to be a shadow not a hard line"): the hairline's contact is soft, its tight line wider and
  // lighter (it was 0.6 px at 0.4: a crisp dark line round every bunker lip and tee); strong (s = 1) is unchanged
  return { cast: WALL_SHADOW * mix(0.15, 1), castA: fade * mix(0.14, 0.34), soft: mix(0.05, 0.12), softPx: mix(2, 3), softA: fade * mix(0.3, 0.45), line: mix(0.025, 0.05), linePx: mix(1.2, 1.5), lineA: fade * mix(0.18, 0.8) };
}
/** whose Shadow a wall takes: a bunker's or a pond's cut face (it drops into the sand or the water) the bunker's or the pond's, any other the
 *  raised surface on its higher side (a green's, a tee's or a fairway's bank) */
export const shadowOwner = (w: { m: WallMat; hs: number }) => (w.m === WallMat.Sand ? BUNKER : w.m === WallMat.Water ? WATER : w.hs);
/** how tall a green's grassy bank is drawn, as a share of a wall's height (the owner, 2026-10-25: a green reads crisp, its raised edge only a
 *  hairline lit edge and a very slim face, never outlined in dark) */
export const GREEN_FACE = 0.4;
/** the share of its height a wall's face is drawn at: a green's bank over turf slim (GREEN_FACE), every other face whole */
export const faceScale = (w: { m: WallMat; hs: number }) => (w.hs === GREEN && w.m === WallMat.Turf ? GREEN_FACE : 1);

/** a drawn layer's code: 2 s for surface s's fill, 2 s + 1 for its collar band; 0 is the map grass under the course */
export const layerCode = (s: number, collar: boolean) => 2 * s + (collar ? 1 : 0);
/** whether a collar sits on top of its surface's platform (fringe, first cut: at the surface's height) rather than on the ground it is laid
 *  over (the bunker's grass lip, the pond's bank: at that ground's height) */
export const collarOnTop = (name: string) => name === 'fringe' || name === 'first-cut';

/** whether a layer is laid over the ground without a height of its own (the bunker's grass lip, the pond's bank: they lie on what is under
 *  them). Such a band takes no part in the walls: they stand on the solid layers' outlines, which meet cleanly wherever three surfaces meet
 *  (a band straddling a step has no outline along it, so walls drawn from its edges broke off at its ends), and the renderer keeps the band's
 *  paint off the wall faces */
export const isOverlay = (code: number, styles: readonly BlobStyle[] = BLOB_STYLE) => (code & 1) === 1 && !collarOnTop(styles[code >> 1]?.collar?.name ?? '');

/** the surface after whose fill the collar of surface s is drawn: s itself (the collar goes just before it) unless the collar lies over a
 *  higher surface (the bunker's grass lip over a green), then the highest one it lies over */
export function collarAfter(s: number, styles: readonly BlobStyle[] = BLOB_STYLE): number {
  let m = s;
  for (const t of styles[s]?.collar?.over ?? []) if (t > m && t < N_SURF) m = t;
  return m;
}
/** the renderer's draw order of the layer codes (drawCourses): for each surface 1..8, its collar (unless laid after a higher surface), the
 *  surface's fill, then the collars laid over it */
export function drawOrder(styles: readonly BlobStyle[] = BLOB_STYLE): number[] {
  const out: number[] = [];
  for (let s = 1; s < N_SURF; s++) {
    if (styles[s]?.collar && collarAfter(s, styles) === s) out.push(layerCode(s, true));
    out.push(layerCode(s, false));
    for (let t = 1; t < s; t++) if (styles[t]?.collar && collarAfter(t, styles) === s) out.push(layerCode(t, true));
  }
  return out;
}
/** the default draw order (BLOB_STYLE): rough, fescue, bank, water, first cut, fairway, first cut, tee, bunker, waste, fringe, green, lip */
export const DRAW_ORDER: readonly number[] = drawOrder();

/** a wall's material, from the ground it drops to: turf (a raised green's or tee's grassy bank), sand (a bunker's cut face), water (a pond's
 *  wet bank) */
export const enum WallMat { Turf = 0, Sand = 1, Water = 2 }
/** each WallMat's art slot: the name a grass-art PHOTO_TEX entry takes when the wall art lands (docs/art/WALL-PROMPTS.md: a front-on painted
 *  cut face, 1024 px square, seamless, painted at 48 px per metre, uniform top to bottom). Until a slot is registered the renderer paints the
 *  wall itself; once it is, the renderer lays the art in the wall's body with no other change */
export const WALL_TEX: readonly string[] = ['wallTurf', 'wallSand', 'wallBank'];
/** the material of a wall hanging over layer code lo */
export const wallMat = (lo: number): WallMat => (lo === layerCode(BUNKER, false) ? WallMat.Sand : lo === layerCode(WATER, false) ? WallMat.Water : WallMat.Turf);

// ---------- the raised faces' forms (T127) ----------
/** how a raised surface meets the ground below it (T127, the owner 2026-10-25: "this T box should have a angled slope to a flat top not a
 *  hard 3d edge that strong. and if we are going that strong with raised ones the sides textures would be rocky with built in steps to the
 *  top"; "make the tee higher like as high as bunkers are deep and add stairs"):
 *  - a **wall**: a crisp kerb face (T099), for a cut face (a bunker's or a pond's) and the fairway's few centimetres;
 *  - a **bank**: an angled grass slope from the flat top down to the ground, a band round the platform as wide as its height times a run
 *    (a tee set low, every green: gentle);
 *  - **rock**: painted stone and earth on the slope, steeper the higher the tee (a tee from ROCK_FROM up: the default tee and above) */
export const enum FaceForm { Wall = 0, Bank = 1, Rock = 2 }
/** a tee's grass bank: metres of run per metre of rise (1 : 2.5, tuned by eye at 30% and 15% zoom) */
export const BANK_RATIO = 2.5;
/** a green's bank, gentler (and drawn GREEN_FACE tall) */
export const GREEN_BANK_RATIO = 3;
/** a tee this high (m) and up has rocky sides (the default tee, 0.6 m, has; a tee set lower falls back to a grass bank) */
export const ROCK_FROM = 0.5;
/** the rock slope's run per metre of rise at ROCK_FROM, and at ROCK_STEEP_H and above (a steep retaining face) */
export const ROCK_RATIO_LOW = 1.3, ROCK_RATIO_HIGH = 0.45, ROCK_STEEP_H = 1.6;
/** a raised face's form and its run, tiles of ground per metre of drop (0 for a wall), for a face over material m whose higher side is
 *  surface hs, with the surfaces at heights `heights` (surfHeights) */
export function faceForm(hs: number, m: WallMat, heights: readonly number[] = SURF_HEIGHT): { f: FaceForm; r: number } {
  if (m !== WallMat.Turf) return { f: FaceForm.Wall, r: 0 };
  const h = heights[hs] ?? 0;
  if (hs === TEE) {
    if (h < ROCK_FROM) return { f: FaceForm.Bank, r: BANK_RATIO * 0.5 };
    const t = Math.min(1, Math.max(0, (h - ROCK_FROM) / (ROCK_STEEP_H - ROCK_FROM)));
    return { f: FaceForm.Rock, r: (ROCK_RATIO_LOW + (ROCK_RATIO_HIGH - ROCK_RATIO_LOW) * t) * 0.5 };
  }
  if (hs === GREEN) return { f: FaceForm.Bank, r: GREEN_BANK_RATIO * 0.5 };
  return { f: FaceForm.Wall, r: 0 };
}
/** a bank's width on the ground, tiles, at a drop of dh metres (its run r: faceForm) */
export const bankWidth = (r: number, dh: number) => r * Math.max(0, dh);
/** how far a bank's face shows round past side-on: a face shows while its normal against the camera (cosine) is above minus this. A sloped
 *  face whose foot lies farther out than its drop reaches down the screen still faces the camera past side-on (its foot offset n w + (t, t)
 *  points out of the platform while w + t (nx + ny) > 0); a wall (r 0) only toward the camera. k: the face's share of its height (faceScale);
 *  kept a little inside the silhouette, where the face turns edge-on */
export const faceVis = (r: number, k = 1) => (r > 0 ? 0.9 * r / (Math.SQRT2 * WALL_DROP * k) : 0);
/** how bright a slope with outward unit normal (nx, ny) (tiles) and run `ratio` metres per metre is lit by the sun at the upper right,
 *  against flat ground (1): above 1 turned to the sun, below 1 turned away (T110: the renderer lays it as a textured shine or a cool multiply) */
export function slopeLight(nx: number, ny: number, ratio: number): number {
  const l = Math.hypot(1, ratio), sx = nx / l, sy = ny / l, sz = ratio / l; // the slope's normal: rise 1 over run `ratio`
  return Math.max(0, sx * SUN_LIGHT.lx + sy * SUN_LIGHT.ly + sz * SUN_LIGHT.lz) / SUN_LIGHT.lz;
}

/** one wall run: the top edge as flat x, y, dh triples (tiles, tiles, metres: the drop below that point, > 0), the higher side on the left of
 *  travel, so the face's normal (from high to low) is the right-hand normal (dy, -dx) and looks toward the camera all along; lo: the layer
 *  code it hangs over (the renderer draws it right after that layer, so later layers cover it where they overlap); m: its WallMat */
export interface WallRun { p: number[]; lo: number; m: WallMat;
  /** the surface id on its higher side (0 the map grass): a green's bank is drawn slim and takes the green's Shadow (faceScale, shadowOwner) */
  hs: number;
  /** its form (T127: a wall, a grass bank or rock) and run (tiles of ground per metre of drop; 0 for a wall): faceForm */
  f: FaceForm; r: number }
/** one lit top edge: a height step whose face (from high to low) turns toward the sun at the upper right (a raised green's upper right
 *  edges, a bunker's near rim), as flat x, y pairs (tiles), the higher side on the left; hi: the layer code of the higher side, whose top
 *  the renderer lights along it */
export interface RimRun { p: number[]; hi: number }
/** a face counts as turned to the sun past this (its normal against the sun's direction) */
export const RIM_SUN = 0.12;
/** one layer's edges sorted: soft runs (feathered) and joint runs (a crisp mowing line); walls and hidden edges are in neither */
export interface EdgeRuns { soft: number[][]; joint: number[][] }
/** a chunk's walls, lit top edges and, per layer code, its sorted edges */
export interface ChunkWalls { walls: WallRun[]; rims: RimRun[]; runs: Map<number, EdgeRuns> }

/** the cells each surface's outlines were contoured from, by surface id: s its own (closed), c its own and its collar band's */
export interface Covers { s: (CellCover | null)[]; c: (CellCover | null)[] }
/** the covers of a chunk's outlines (chunkOutlines with cover) */
export function coversOf(outs: readonly SurfaceOutline[]): Covers {
  const K: Covers = { s: new Array(N_SURF).fill(null), c: new Array(N_SURF).fill(null) };
  for (const o of outs) if (o.cover) { K.s[o.surf] = o.cover.s; K.c[o.surf] = o.cover.c; }
  return K;
}

/** whether global cell coordinates (u, v) lie inside the outline contoured from a cover (its droplet field at least ISO_T; never outside
 *  its window, where it holds no cells) */
function inCover(cv: CellCover | null, u: number, v: number): boolean {
  if (!cv) return false;
  const i = Math.floor(u) - cv.ci0, j = Math.floor(v) - cv.cj0;
  if (i < 1 || j < 1 || i >= cv.cw - 1 || j >= cv.ch - 1) return false;
  // no set cell among the 3 x 3 round it: outside (the kernel reaches 1.25 cells), without summing the field
  const w = cv.cw, o = cv.occ, k = j * w + i;
  if (!(o[k - w - 1]! | o[k - w]! | o[k - w + 1]! | o[k - 1]! | o[k]! | o[k + 1]! | o[k + w - 1]! | o[k + w]! | o[k + w + 1]!)) return false;
  return coverField(cv, u, v) >= ISO_T;
}

/** the reader of one chunk's layers at points (global cell coordinates u, v: u = (x - grid.x0) / 0.5): which layer covers a point (inside
 *  the outline it is drawn with, read from the same droplet field), which is on top, and the height of the top */
export class LayerStack {
  private rank = new Int16Array(2 * N_SURF).fill(-1);
  constructor(private K: Covers, private styles: readonly BlobStyle[] = BLOB_STYLE, private order: readonly number[] = DRAW_ORDER, private heights: readonly number[] = SURF_HEIGHT) {
    order.forEach((c, r) => { this.rank[c] = r; });
  }
  /** the draw rank of a layer code (-1: the map grass, under everything) */
  rankOf(code: number): number { return code > 0 ? this.rank[code]! : -1; }
  /** whether layer `code` covers (u, v): a surface inside its outline, a collar band inside its outer outline and outside its surface's */
  covers(code: number, u: number, v: number): boolean {
    const s = code >> 1;
    return code & 1 ? inCover(this.K.c[s]!, u, v) && !inCover(this.K.s[s]!, u, v) : inCover(this.K.s[s]!, u, v);
  }
  /** whether (u, v) lies inside the outline layer `code`'s edges are drawn on: a surface's own, a collar's outer one (its surface and its
   *  band together: for a collar on its surface's platform, the platform's outline) */
  within(code: number, u: number, v: number): boolean { return inCover((code & 1 ? this.K.c : this.K.s)[code >> 1]!, u, v); }
  /** surface s's height (m) */
  surfHeight(s: number): number { return this.heights[s] ?? 0; }
  /** the outward unit normal at (u, v) of the outline layer `code`'s edges are drawn on, from its droplet field (down its slope), or null
   *  where the field is flat: it depends only on the point and the grid, not on how a chunk's edge was cut or simplified there */
  outward(code: number, u: number, v: number): { x: number; y: number } | null {
    const cv = (code & 1 ? this.K.c : this.K.s)[code >> 1]; if (!cv) return null;
    const h = 0.02, gx = coverField(cv, u + h, v) - coverField(cv, u - h, v), gy = coverField(cv, u, v + h) - coverField(cv, u, v - h), l = Math.hypot(gx, gy);
    return l > 1e-9 ? { x: -gx / l, y: -gy / l } : null;
  }
  /** the code of the layer on top at (u, v) (0: none, the map grass); solid: of the layers with a height of their own (no lip or bank) */
  top(u: number, v: number, solid = false): number {
    for (let r = this.order.length - 1; r >= 0; r--) { const c = this.order[r]!; if ((!solid || !isOverlay(c, this.styles)) && this.covers(c, u, v)) return c; }
    return 0;
  }
  /** the height (m) of the ground seen at (u, v): the top layer's (a lip or bank lies on what is under it, a fringe or first cut on its
   *  surface's platform) */
  height(u: number, v: number): number {
    for (let r = this.order.length - 1; r >= 0; r--) {
      const c = this.order[r]!;
      if (!this.covers(c, u, v)) continue;
      if (c & 1 && !collarOnTop(this.styles[c >> 1]?.collar?.name ?? '')) continue; // laid on the ground below it: look under it
      return this.heights[c >> 1] ?? 0;
    }
    return 0;
  }
}

/** what one edge point is: hidden, soft, joint, or a wall (out: the edge's own layer is higher, the face looks outward; in: the outside is
 *  higher, the face looks inward) */
const enum Cls { Hidden = 0, Soft = 1, Joint = 2, WallOut = 3, WallIn = 4 }
/** how far from an edge point the inside and outside are sampled, tiles: the first sample inside (or outside) the edge's own outline counts,
 *  so an edge the relax or the simplify moved a little off the droplet's iso-line still reads the right side */
const PROBE = [0.07, 0.16, 0.3];
/** a segment whose ends are of different kinds is sampled this often (tiles) to find where the kind changes */
const REFINE = 0.08;

/** one sampled edge point: its class, its raw height step (inside less outside), the layer codes of its lower and higher sides, and the
 *  solid surface on its higher side (no lip or bank: a bunker's lip lying over a green's edge leaves the green's bank the green's) */
interface Probe { cls: Cls; dh: number; lo: number; hi: number; hs: number }

/** whether layer `code` is a platform's outline: a collar on its surface's platform (fringe, first cut), whose outer edge runs round the
 *  surface and the band together, at one height (T137) */
const isPlatform = (code: number, styles: readonly BlobStyle[] = BLOB_STYLE) => (code & 1) === 1 && collarOnTop(styles[code >> 1]?.collar?.name ?? '');

/** classifies one point of an edge of layer `code` at (x, y) with outward unit normal (nx, ny). plats: the platform layers present (a surface
 *  with one of them hands every boundary but its joint to it) */
function probe(st: LayerStack, g: Grid, code: number, styles: readonly BlobStyle[], plats: ReadonlySet<number>, x: number, y: number, nx: number, ny: number, out: Probe): void {
  const u = (x - g.x0) / CELL_T, v = (y - g.y0) / CELL_T, cx = nx / CELL_T, cy = ny / CELL_T;
  // a platform's outline (T137): its inside is the surface and the band alike, so its edge goes on where the band thins to nothing (beside
  // a pond or a bunker the fringe is not laid) and one polyline carries the whole platform's walls
  const plat = isPlatform(code, styles), inside = (a: number, b: number) => (plat ? st.within(code, a, b) : st.covers(code, a, b));
  let iu = u - PROBE[0]! * cx, iv = v - PROBE[0]! * cy, found = false;
  for (const e of PROBE) { const a = u - e * cx, b = v - e * cy; if (inside(a, b)) { iu = a; iv = b; found = true; break; } }
  out.dh = 0; out.lo = 0; out.hi = 0; out.hs = 0; out.cls = Cls.Hidden;
  if (!found) return;
  let ou = 0, ov = 0; found = false;
  for (const e of PROBE) { const a = u + e * cx, b = v + e * cy; if (!inside(a, b)) { ou = a; ov = b; found = true; break; } }
  if (!found) return; // no outside within reach
  // a lip or bank: only feathered where it is on top inside, never a wall (the solid layers under it carry those)
  if (isOverlay(code, styles)) { if (st.top(iu, iv) === code) out.cls = Cls.Soft; return; }
  // a pit (a pond, a bunker: a surface below the map grass) carries every wall of its own rim, whatever stands above it (the rough, a green,
  // a bank) and whichever is drawn later, and no other edge carries one over a pit (T137). A far wall so runs on round the rim in one piece
  // where the ground above it changes, instead of handing over to the green's outline, which meets the rim only roughly: each outline is
  // relaxed off the droplet field the sides are read from (by up to a fifth of a tile on a staircase of cells), so the two outlines' ends,
  // judged each on its own, missed each other by a sliver, a gap or a double wall where three surfaces meet. Nothing drawn later lies over a
  // pit's cells (none may claim them), only a neighbour's rounded outline over its rim, which then hides the face's top as it would its own
  const s = code >> 1, own = layerCode(s, true), pit = !(code & 1) && st.surfHeight(s) < 0;
  const hIn = pit ? st.surfHeight(s) : st.height(iu, iv), hOut = st.height(ou, ov), dh = hIn - hOut;
  const lout = st.top(ou, ov, true), tin = st.top(iu, iv, true);
  out.dh = dh;
  if (tin !== code && !pit && !(plat && tin === code - 1)) return; // covered inside by a later layer (a platform's own surface is its own)
  // a surface on a platform carries only its joint with the band: every other boundary is the platform's (its outline carries it, so no
  // wall hands over from the surface's edge to the band's where the band ends: the ends missed each other and left a gap, T137)
  if (!(code & 1) && lout !== own && plats.has(own)) return;
  // the boundary belongs to the layer drawn later: a later layer outside carries it on its own edge (a surface's own collar band has no
  // inner edge, so the surface carries that one)
  const later = st.rankOf(lout) > st.rankOf(code) && !(!(code & 1) && lout === own);
  if (Math.abs(dh) < FLAT_DH) {
    if (later) return;
    out.cls = !(code & 1) && lout === own && collarOnTop(styles[s]?.collar?.name ?? '') ? Cls.Joint : Cls.Soft;
    return;
  }
  // a step down into a pit is the pit's; a step up out of one is ours whichever is drawn later; any other step the later layer's
  if (dh > 0 && hOut < 0 && st.surfHeight(lout >> 1) < 0 && !(lout & 1)) return;
  if (!(pit && dh < 0) && later) return;
  // hi: the layer seen on the higher side (a lip included: its top is the one lit along the edge)
  if (dh > 0) { out.cls = Cls.WallOut; out.lo = lout; out.hi = st.top(iu, iv); out.hs = s; } else { out.cls = Cls.WallIn; out.lo = code; out.hi = st.top(ou, ov); out.hs = lout >> 1; }
}

/** the walls and sorted edges of one chunk's layers. layers: each drawn layer's code and edge polylines (the layer on the left of travel; a
 *  closed ring repeats its first point), exactly as the renderer will draw them; K: the cells they were contoured from */
export function chunkWalls(g: Grid, layers: readonly { code: number; edges: readonly ArrayLike<number>[] }[], K: Covers, styles: readonly BlobStyle[] = BLOB_STYLE, heights: readonly number[] = SURF_HEIGHT): ChunkWalls {
  const st = new LayerStack(K, styles, DRAW_ORDER, heights), walls: WallRun[] = [], rims: RimRun[] = [], runs = new Map<number, EdgeRuns>();
  const cam = Math.SQRT1_2, P: Probe = { cls: Cls.Hidden, dh: 0, lo: 0, hi: 0, hs: 0 };
  /** how far round past side-on a face over layer lo with surface hs above it still shows (a wall: none; a bank to its silhouette, T127) */
  const vis = (lo: number, hs: number) => { const m = wallMat(lo); return faceVis(faceForm(hs, m, heights).r, faceScale({ m, hs })); };
  // the platforms drawn in this chunk (a collar on its surface's platform: its outer edge carries the platform's walls)
  const plats = new Set(layers.map(l => l.code).filter(c => isPlatform(c, styles)));
  /** the draw rank of surface s's first layer (the renderer draws a bank just before it) */
  const firstRank = (s: number) => { const c = DRAW_ORDER.find(q => q >> 1 === s); return c === undefined ? -1 : st.rankOf(c); };
  /** a wall's run key: its class, lower layer and higher surface, as far as they change the look (T137). A pit's wall (sand, water) looks
   *  the same whatever is above it, the rough, a green or the map grass in a junction's chink, so it runs on round the rim in one piece (a
   *  tee above one is kept apart: the renderer lays its rock band on it); a bank drawn before its surface looks the same over any flat
   *  ground below it (the renderer draws them all in one pass) */
  const wallKey = (c: Cls, lo: number, hs: number) => {
    const m = wallMat(lo);
    let lk = lo, hk = hs;
    if (m !== WallMat.Turf) { if (hs !== TEE) hk = 0; }
    else if (faceForm(hs, m, heights).f !== FaceForm.Wall && (lo === 0 || st.rankOf(lo) < firstRank(hs))) lk = 0;
    return 1 + c * 64 + lk + 512 * hk;
  };
  for (const { code, edges } of layers) {
    const er: EdgeRuns = { soft: [], joint: [] };
    for (const e of edges) {
      const n = e.length >> 1; if (n < 2) continue;
      const closed = n >= 4 && e[0] === e[2 * n - 2] && e[1] === e[2 * n - 1], m = closed ? n - 1 : n; // m distinct points
      const segs = closed ? m : m - 1;
      const X = (k: number) => e[2 * (k % m)]!, Y = (k: number) => e[2 * (k % m) + 1]!;
      // segment unit outward normals (dy, -dx)
      const snx = new Float64Array(segs), sny = new Float64Array(segs);
      for (let k = 0; k < segs; k++) { const dx = X(k + 1) - X(k), dy = Y(k + 1) - Y(k), l = Math.hypot(dx, dy) || 1; snx[k] = dy / l; sny[k] = -dx / l; }
      // per point: its class, raw height step and lower and higher layers, sampled along the mean of its segments' normals
      const pc = new Uint8Array(m), pd = new Float64Array(m), pl = new Int16Array(m), ph = new Int16Array(m), ps = new Int16Array(m);
      for (let k = 0; k < m; k++) {
        const a = closed ? (k + segs - 1) % segs : k - 1, b = closed ? k % segs : k < segs ? k : -1;
        let nx = (a >= 0 ? snx[a]! : 0) + (b >= 0 ? snx[b]! : 0), ny = (a >= 0 ? sny[a]! : 0) + (b >= 0 ? sny[b]! : 0);
        const l = Math.hypot(nx, ny); if (l < 1e-9) { nx = b >= 0 ? snx[b]! : snx[a]!; ny = b >= 0 ? sny[b]! : sny[a]!; } else { nx /= l; ny /= l; }
        // an open end lies on the chunk's border, where the neighbour chunk's edge starts or ends too: read it along the field's own normal
        // there, so both chunks read the same (each simplified its piece of the edge on its own, so their end segments differ, T137)
        if (!closed && (k === 0 || k === m - 1)) { const f = st.outward(code, (X(k) - g.x0) / CELL_T, (Y(k) - g.y0) / CELL_T); if (f && f.x * nx + f.y * ny > 0) { nx = f.x; ny = f.y; } }
        probe(st, g, code, styles, plats, X(k), Y(k), nx, ny, P); pc[k] = P.cls; pd[k] = P.dh; pl[k] = P.lo; ph[k] = P.hi; ps[k] = P.hs;
      }
      // refined pieces: a segment whose ends disagree is sampled every REFINE tiles and cut where its kind changes (bisected to a few mm), so
      // each kind runs right up to where the next layer takes over (a long segment no longer takes its midpoint's kind whole: a junction of
      // two layers' outlines left a gap in the wall). Per point x, y; per piece (point i to i + 1) its main and rim keys, its lower layer and
      // higher surface, and the raw step at its start and its end, each read on its own side: where the kind changes the old piece ends at the
      // cut with its own step and the new one starts there with its own, so a wall ends square at its height (T137: the new piece used to
      // start a few mm back, with the step read on the old side, a sliver hanging from every run that began at a change)
      const qx: number[] = [], qy: number[] = [], q0: number[] = [], q1: number[] = [], qMain: number[] = [], qRim: number[] = [], qLo: number[] = [], qHs: number[] = [];
      const raw = (c: number, lo: number, hi: number, hs: number) => ((c * 64 + lo) * 64 + hi) * 16 + hs;
      let lead: number | undefined, leadHs = 0;
      for (let k = 0; k < segs; k++) {
        const a = k, b = (k + 1) % m, x0 = X(a), y0 = Y(a), dx = X(a + 1) - x0, dy = Y(a + 1) - y0, nx = snx[k]!, ny = sny[k]!;
        // the face (from high to low) of a wall on this segment, judged on its normal with its neighbours' (weights 1, 2, 1), so a wiggle that
        // turns one short segment away does not cut a tooth out of a wall
        const pa = closed ? (k + segs - 1) % segs : k - 1, pb = closed ? (k + 1) % segs : k + 1 < segs ? k + 1 : -1;
        let fx = 2 * nx, fy = 2 * ny;
        if (pa >= 0) { fx += snx[pa]!; fy += sny[pa]!; }
        if (pb >= 0) { fx += snx[pb]!; fy += sny[pb]!; }
        const fl = Math.hypot(fx, fy) || 1, camF = (fx + fy) * cam / fl, sunF = (fx * SUN_TILE_DIR.x + fy * SUN_TILE_DIR.y) / fl;
        /** a piece's main key: its class, lower layer and solid higher surface (wallKey); a face turned from the camera hidden (a wall past
         *  side-on, a bank past its silhouette) */
        const mainOf = (c: Cls, lo: number, hs: number) => {
          const wall = c === Cls.WallOut || c === Cls.WallIn, sgn = c === Cls.WallOut ? 1 : -1;
          return c === Cls.Hidden || (wall && sgn * camF <= -vis(lo, hs)) ? 0 : wall ? wallKey(c, lo, hs) : 1 + c * 64;
        };
        /** one piece from the last point pushed: its keys (main; rim: a step facing the sun) and its steps at its ends */
        const piece = (c: Cls, lo: number, hi: number, hs: number, d0: number, d1: number) => {
          const wall = c === Cls.WallOut || c === Cls.WallIn, sgn = c === Cls.WallOut ? 1 : -1;
          qRim.push(wall && sgn * sunF > RIM_SUN ? 1 + 2 * hi + (sgn < 0 ? 1 : 0) : 0);
          qMain.push(mainOf(c, lo, hs));
          qLo.push(lo); qHs.push(hs); q0.push(d0); q1.push(d1);
        };
        qx.push(x0); qy.push(y0);
        const len = Math.hypot(dx, dy);
        let cc = pc[a]! as Cls, cl = pl[a]!, ch = ph[a]!, cs = ps[a]!, cd = pd[a]!, sd = pd[a]!, tp = 0; // sd, tp: the current piece's start
        if (raw(cc, cl, ch, cs) !== raw(pc[b]!, pl[b]!, ph[b]!, ps[b]!)) {
          const N = Math.max(2, Math.ceil(len / REFINE));
          for (let i = 1, t0 = 0; i <= N; i++) {
            const t = i / N;
            let c: Cls, lo: number, hi: number, hs: number, dd: number;
            if (i < N) { probe(st, g, code, styles, plats, x0 + t * dx, y0 + t * dy, nx, ny, P); c = P.cls; lo = P.lo; hi = P.hi; hs = P.hs; dd = P.dh; } else { c = pc[b]! as Cls; lo = pl[b]!; hi = ph[b]!; hs = ps[b]!; dd = pd[b]!; }
            // the kind changes between t0 and t: bisect to a few mm (ta the last of the old kind, tb the first of another) and cut there: the old
            // piece ends with the step read on its side, the next starts with the kind and the step read at tb (T137: not the kind at t, as
            // three kinds can lie between two samples where three surfaces meet); then on from tb to t, until the kind at t is reached
            for (let rep = 0; rep < 4 && raw(c, lo, hi, hs) !== raw(cc, cl, ch, cs); rep++) {
              let ta = t0, tb = t, da = cd, db = dd, kc = c, kl = lo, kh = hi, ks = hs;
              for (let it = 0; it < 6; it++) {
                const tm = (ta + tb) / 2; probe(st, g, code, styles, plats, x0 + tm * dx, y0 + tm * dy, nx, ny, P);
                if (raw(P.cls, P.lo, P.hi, P.hs) === raw(cc, cl, ch, cs)) { ta = tm; da = P.dh; } else { tb = tm; db = P.dh; kc = P.cls; kl = P.lo; kh = P.hi; ks = P.hs; }
              }
              // (an old kind with no length here, a change right at the segment's start, leaves no piece; at an open polyline's first point, a
              // chunk border, a wall that steps there starts from the drop read at the point itself, as the neighbour chunk's run ends with it)
              if ((ta - tp) * len > 1e-6) { piece(cc, cl, ch, cs, sd, da); qx.push(x0 + ta * dx); qy.push(y0 + ta * dy); tp = ta; }
              else if (k === 0 && !closed && tp === 0 && mainOf(cc, cl, cs) === mainOf(kc, kl, ks)) { lead = pd[0]!; leadHs = ps[0]!; }
              cc = kc; cl = kl; ch = kh; cs = ks; sd = db; cd = db; t0 = tb;
              if (rep === 3) { cc = c; cl = lo; ch = hi; cs = hs; } // (never in practice: take the kind at t)
            }
            cd = dd; t0 = t;
          }
        }
        piece(cc, cl, ch, cs, sd, pd[b]!);
      }
      if (!closed) { qx.push(X(m - 1)); qy.push(Y(m - 1)); }
      const np = qx.length, nq = qMain.length, QX = (i: number) => qx[i % np]!, QY = (i: number) => qy[i % np]!;
      // the pieces' lengths, then a junction's crumbs healed into the runs beside them (heal)
      const ql = new Float64Array(nq);
      for (let i = 0; i < nq; i++) ql[i] = Math.hypot(QX(i + 1) - QX(i), QY(i + 1) - QY(i));
      heal(qMain, ql, q0, q1, [qLo, qHs], closed);
      groupRuns(Int32Array.from(qMain), closed, (k0, len) => {
        const key = qMain[k0 % nq]! - 1, c = Math.floor((key % 512) / 64) as Cls, lo = qLo[k0 % nq]!, hs = qHs[k0 % nq]!;
        const pts: number[] = [];
        for (let q = 0; q <= len; q++) pts.push(QX(k0 + q), QY(k0 + q));
        if (c === Cls.Soft) { er.soft.push(pts); return; }
        if (c === Cls.Joint) { er.joint.push(pts); return; }
        // a wall: the higher side on the left (an inward wall runs backwards), each point with its own drop (its raw step, never below 0),
        // a step in it eased (easedRun)
        const sign = c === Cls.WallOut ? 1 : -1, J = (j: number) => (k0 + j) % nq, from = k0 === 0 && lead !== undefined ? { d: Math.max(0, sign * lead), hs: leadHs } : undefined;
        const p = easedRun(len, q => QX(k0 + q), q => QY(k0 + q), j => Math.max(0, sign * q0[J(j)]!), j => Math.max(0, sign * q1[J(j)]!), j => qHs[J(j)]!, heights, from);
        // an end that reads (nearly) flat beside a tall neighbour is the corner where the step meets another surface (an island's wall beside
        // a bunker cut into it): a clean vertical cut there, not a ramp down to nothing that would stand as a spike
        const last = p.length - 1;
        if (p[2]! < 0.5 * p[5]!) p[2] = p[5]!;
        if (p[last]! < 0.5 * p[last - 3]!) p[last] = p[last - 3]!;
        if (sign < 0) reverse(p, 3);
        const fm = faceForm(hs, wallMat(lo), heights);
        walls.push({ p, lo, m: wallMat(lo), hs, f: fm.f, r: fm.r });
      });
      groupRuns(Int32Array.from(qRim), closed, (k0, len) => {
        const key = qRim[k0 % qRim.length]! - 1, hi = key >> 1, p: number[] = [];
        for (let q = 0; q <= len; q++) p.push(QX(k0 + q), QY(k0 + q));
        if (key & 1) reverse(p, 2);
        rims.push({ p, hi });
      });
    }
    runs.set(code, er);
  }
  return { walls, rims, runs };
}

/** the least width a step in a wall's drop is eased over, tiles (T137) */
export const RAMP_MIN = 0.2;
/** the points a step's easing is drawn with */
const RAMP_N = 6;
const smooth = (u: number) => { const t = Math.min(1, Math.max(0, u)); return t * t * (3 - 2 * t); };
/** a wall run's points as flat x, y, drop triples, from its len pieces (X, Y: point q's place, q 0..len; d0, d1: piece j's drop at its ends,
 *  metres; hs: piece j's higher surface). Where the drop steps between two pieces (a pit's rim where the ground above it changes: a green
 *  above it, then the rough) the higher ground's bank comes down to the lower ground there, so the drop eases from the one to the other
 *  over that bank's width (bankWidth, at least RAMP_MIN) on the lower ground's side, instead of a square step in the wall's foot (T137):
 *  extra points are laid on the run's own segments, so its top edge keeps its place. The easing stays inside the run, so its ends keep their
 *  own drops (and two chunks' runs still meet at their border with the same). from: the drop the run starts from at its first point and the
 *  higher surface there, when the step lies right on that point (a chunk border: the neighbour chunk's run ends with that drop) */
function easedRun(len: number, X: (q: number) => number, Y: (q: number) => number, d0: (j: number) => number, d1: (j: number) => number, hs: (j: number) => number, heights: readonly number[], from?: { d: number; hs: number }): number[] {
  const s = new Float64Array(len + 1);
  for (let q = 1; q <= len; q++) s[q] = s[q - 1]! + Math.hypot(X(q) - X(q - 1), Y(q) - Y(q - 1));
  // the steps: at point q, the jump dd from the piece before (at q 0: the drop it starts from) to the piece after, eased over [a, b]
  const steps: { q: number; dd: number; a: number; b: number }[] = [];
  const width = (high: number, dd: number) => Math.max(RAMP_MIN, bankWidth(faceForm(high, WallMat.Turf, heights).r, Math.abs(dd)));
  if (from && Math.abs(d0(0) - from.d) >= FLAT_DH) { const dd = d0(0) - from.d; steps.push({ q: 0, dd, a: 0, b: Math.min(s[len]!, width(dd < 0 ? from.hs : hs(0), dd)) }); }
  for (let q = 1; q < len; q++) {
    const L = d1(q - 1), R = d0(q), dd = R - L;
    if (Math.abs(dd) < FLAT_DH) continue;
    const w = width(L > R ? hs(q - 1) : hs(q), dd);
    if (dd < 0) steps.push({ q, dd, a: s[q]!, b: Math.min(s[len]!, s[q]! + w) }); else steps.push({ q, dd, a: Math.max(0, s[q]! - w), b: s[q]! });
  }
  const out: number[] = [];
  /** the eased drop on piece j at arc position at, its own drop there being base: each step's jump taken out ([q <= j]: the piece is past
   *  it) and laid back in eased over its span */
  const at = (j: number, pos: number, base: number) => {
    let v = base;
    for (const k of steps) v += k.dd * ((k.b > k.a ? smooth((pos - k.a) / (k.b - k.a)) : pos >= k.b ? 1 : 0) - (k.q <= j ? 1 : 0));
    return Math.max(0, v);
  };
  for (let j = 0; j < len; j++) {
    const l = s[j + 1]! - s[j]!, x0 = X(j), y0 = Y(j), x1 = X(j + 1), y1 = Y(j + 1);
    out.push(x0, y0, at(j, s[j]!, d0(j)));
    // the easing's points inside this piece
    if (steps.length && l > 1e-6) {
      const ts: number[] = [];
      for (const k of steps) for (let i = 0; i <= RAMP_N; i++) { const t = (k.a + ((k.b - k.a) * i) / RAMP_N - s[j]!) / l; if (t > 1e-4 && t < 1 - 1e-4) ts.push(t); }
      ts.sort((a, b) => a - b);
      for (let i = 0; i < ts.length; i++) { const t = ts[i]!; if (i && t - ts[i - 1]! < 1e-4) continue; out.push(x0 + t * (x1 - x0), y0 + t * (y1 - y0), at(j, s[j]! + t * l, d0(j) + (d1(j) - d0(j)) * t)); }
    }
  }
  out.push(X(len), Y(len), at(len - 1, s[len]!, d1(len - 1)));
  return out;
}

/** the shortest run of one kind a polyline keeps between two others, tiles (T137: 0.5 m, a few px at 30% zoom). Where three surfaces meet
 *  the sampled sides flicker for a few cm (the droplet outlines round off near the junction, so the point just outside reads one neighbour,
 *  then the other, then the map grass in the chink between them) and left crumbs: a pixel-wide wall of another kind, or a gap, standing in
 *  a run */
export const MIN_RUN = 0.25;
/** heals a polyline's crumbs in place: a run of pieces (keys: their main keys, len: their lengths) shorter than MIN_RUN with runs either side
 *  takes the kind of the run before it, with its step (d0, d1: at each piece's ends) held from that run's end (a change of drop at its far
 *  end is a step between pieces, which easedRun eases) and its other per-piece values (more) copied from it; the shortest first, until none
 *  is left. Runs at an open end (a chunk border) are kept as they are, so each chunk heals only what it holds whole and two chunks' walls
 *  still meet at their border */
function heal(keys: number[], len: Float64Array, d0: number[], d1: number[], more: number[][], closed: boolean): void {
  const n = keys.length;
  for (let pass = 0; pass < n; pass++) {
    // the runs in order: first piece, how many, kind, length (a closed ring's start at a change)
    let start = 0;
    if (closed) { start = -1; for (let k = 0; k < n; k++) if (keys[k] !== keys[(k + n - 1) % n]) { start = k; break; } if (start < 0) return; }
    const runs: { k0: number; c: number; key: number; L: number }[] = [];
    for (let q = 0; q < n;) {
      const k0 = (start + q) % n; let q1 = q, L = 0;
      while (q1 < n && keys[(start + q1) % n] === keys[k0]) { L += len[(start + q1) % n]!; q1++; }
      runs.push({ k0, c: q1 - q, key: keys[k0]!, L }); q = q1;
    }
    const R = runs.length; if (R < (closed ? 2 : 3)) return;
    let best = -1, bl = MIN_RUN;
    for (let r = closed ? 0 : 1; r < (closed ? R : R - 1); r++) if (runs[r]!.L < bl) { bl = runs[r]!.L; best = r; }
    if (best < 0) return;
    const run = runs[best]!, A = runs[(best + R - 1) % R]!;
    const la = (A.k0 + A.c - 1) % n, da = d1[la]!;
    for (let q = 0; q < run.c; q++) {
      const i = (run.k0 + q) % n;
      keys[i] = A.key; d0[i] = d1[i] = da;
      for (const a of more) a[i] = a[la]!;
    }
  }
}

/** calls emit(k0, len) for each run of equal nonzero keys among a polyline's segments (k0 its first segment, len how many; on a closed ring
 *  the runs start at a change, so none is split at the ring's arbitrary first point, and k0 + len may pass the end) */
function groupRuns(keys: Int32Array, closed: boolean, emit: (k0: number, len: number) => void): void {
  const segs = keys.length; if (!segs) return;
  let start = 0;
  if (closed) {
    start = -1;
    for (let k = 0; k < segs; k++) if (keys[k] !== keys[(k + segs - 1) % segs]) { start = k; break; }
    if (start < 0) { if (keys[0]) emit(0, segs); return; } // the whole ring is one kind
  }
  for (let q0 = 0; q0 < segs;) {
    const k0 = (start + q0) % segs;
    let q1 = q0 + 1;
    while (q1 < segs && keys[(start + q1) % segs] === keys[k0]) q1++;
    if (keys[k0]) emit(start + q0, q1 - q0);
    q0 = q1;
  }
}
/** reverses a flat array of points of `w` numbers each, in place */
function reverse(p: number[], w: number): void {
  for (let i = 0, j = p.length - w; i < j; i += w, j -= w) for (let t = 0; t < w; t++) { const v = p[i + t]!; p[i + t] = p[j + t]!; p[j + t] = v; }
}

// ---------- a tee's stairs (T127: "built in steps to the top"; "add stairs") ----------
/** a tee's stairs, built into its side facing the nearest cart path or drive (else its fairway, else the camera), lined up with the 1 m
 *  grid: (x, y) the middle of the stairs' top on that side (tiles), (nx, ny) the side's outward axis, (1, 0) or (0, 1) (the camera-facing
 *  sides: the only ones a raised tee's face shows on), half: half the stairs' width along the side (tiles; its ends lie on cell lines). The
 *  renderer cuts the steps into the face of the tee's wall run that crosses that stretch of the side */
export interface Stair { x: number; y: number; nx: number; ny: number; half: number }
/** the stairs' width in cells (2 m; one on a side too narrow) */
export const STAIR_CELLS = 2;
/** a cart path or drive this near a tee's middle (tiles: 80 m) is the one its stairs face; else its fairway this near */
export const STAIR_REACH = 40, STAIR_FAIRWAY = 40;
/** a tee lower than this (m) is a step up: no stairs */
export const STAIR_MIN_H = 0.3;
/** a stair's rise and tread (m): a face of drop dh takes stairSteps(dh) steps, each STAIR_TREAD deep, so a flight is shallower than a steep
 *  rock face and stands out from its foot as a built-in flight would */
export const STAIR_RISE = 0.2, STAIR_TREAD = 0.32;
export const stairSteps = (dh: number) => Math.max(2, Math.round(dh / STAIR_RISE));
/** the most cells a tee box has (a bigger patch of tee gets no stairs; it also bounds the flood fill) */
const STAIR_MAX_CELLS = 6000;
/** the ground a tee's stairs may come down onto: flat (map grass, rough, fescue, fairway, waste), never a bunker, a pond or a green */
const FLAT_FOOT = new Set<number>([0, SURF.rough, SURF.fescue, FAIRWAY, SURF.waste]);

/** the stairs of every tee box with a cell in box (tiles x0, y0, x1, y1; its whole connected patch of tee cells counts, even past the box,
 *  so every chunk a tee touches gives the same stairs). paths: the cart paths and drives as flat segments ax, ay, bx, by (tiles). A tee
 *  lower than STAIR_MIN_H has none. Deterministic: each tee's cells are taken in index order and its middle from integer sums */
export function teeStairs(g: Grid, box: readonly number[], paths?: ArrayLike<number> | null, heights: readonly number[] = SURF_HEIGHT): Stair[] {
  if ((heights[TEE] ?? 0) < STAIR_MIN_H) return [];
  const i0 = Math.max(0, Math.floor((box[0]! - g.x0) / CELL_T)), i1 = Math.min(g.w, Math.ceil((box[2]! - g.x0) / CELL_T));
  const j0 = Math.max(0, Math.floor((box[1]! - g.y0) / CELL_T)), j1 = Math.min(g.h, Math.ceil((box[3]! - g.y0) / CELL_T));
  const seen = new Set<number>(), out: Stair[] = [];
  for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) {
    const k = j * g.w + i; if (g.surf[k] !== TEE || seen.has(k)) continue;
    const cells: number[] = [], stack = [k]; seen.add(k);
    let big = false;
    while (stack.length) {
      const c = stack.pop()!; cells.push(c);
      if (cells.length > STAIR_MAX_CELLS) { big = true; break; }
      const ci = c % g.w, cj = (c - ci) / g.w;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const ni = ci + di, nj = cj + dj; if (ni < 0 || nj < 0 || ni >= g.w || nj >= g.h) continue;
        const nk = nj * g.w + ni; if (g.surf[nk] === TEE && !seen.has(nk)) { seen.add(nk); stack.push(nk); }
      }
    }
    if (big) continue;
    const st = stairOf(g, cells.sort((a, b) => a - b), paths);
    if (st) out.push(st);
  }
  return out;
}
/** the stairs of one tee box (its cells in index order) */
function stairOf(g: Grid, cells: readonly number[], paths?: ArrayLike<number> | null): Stair | null {
  const w = g.w, surfAt = (i: number, j: number) => (i < 0 || j < 0 || i >= w || j >= g.h ? 0 : g.surf[j * w + i]!);
  let si = 0, sj = 0, bi0 = Infinity, bj0 = Infinity, bi1 = -Infinity, bj1 = -Infinity;
  for (const c of cells) { const i = c % w, j = (c - i) / w; si += i; sj += j; bi0 = Math.min(bi0, i); bi1 = Math.max(bi1, i); bj0 = Math.min(bj0, j); bj1 = Math.max(bj1, j); }
  const mx = g.x0 + (si / cells.length + 0.5) * CELL_T, my = g.y0 + (sj / cells.length + 0.5) * CELL_T;
  // what the stairs face: the nearest point of a cart path or drive within reach, else the nearest fairway cell, else the camera (far out
  // past the middle of the longer camera-facing side, so the stairs sit in its middle)
  const wide = bi1 - bi0 >= bj1 - bj0;
  let tx = wide ? mx : mx + 1000, ty = wide ? my + 1000 : my, best = STAIR_REACH * STAIR_REACH;
  let found = false;
  if (paths) for (let q = 0; q + 3 < paths.length; q += 4) {
    const ax = paths[q]!, ay = paths[q + 1]!, dx = paths[q + 2]! - ax, dy = paths[q + 3]! - ay, l2 = dx * dx + dy * dy;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((mx - ax) * dx + (my - ay) * dy) / l2)) : 0, px = ax + t * dx, py = ay + t * dy, d = (px - mx) ** 2 + (py - my) ** 2;
    if (d < best) { best = d; tx = px; ty = py; found = true; }
  }
  if (!found) {
    const R = Math.round(STAIR_FAIRWAY / CELL_T);
    let bd = Infinity;
    for (let j = Math.max(0, bj0 - R); j <= Math.min(g.h - 1, bj1 + R); j++) for (let i = Math.max(0, bi0 - R); i <= Math.min(w - 1, bi1 + R); i++) {
      if (g.surf[j * w + i] !== FAIRWAY) continue;
      const x = g.x0 + (i + 0.5) * CELL_T, y = g.y0 + (j + 0.5) * CELL_T, d = (x - mx) ** 2 + (y - my) ** 2;
      if (d < bd) { bd = d; tx = x; ty = y; }
    }
  }
  // the candidates: on a camera-facing side (outward axis d), a stretch of STAIR_CELLS boundary cells side by side whose outer neighbours
  // (two deep) are flat ground; one with a boundary cell either side too (a straight stretch, clear of the rounded corners) is preferred
  const isTee = (i: number, j: number) => surfAt(i, j) === TEE;
  const edge = (i: number, j: number, dx: number, dy: number) => isTee(i, j) && !isTee(i + dx, j + dy) && FLAT_FOOT.has(surfAt(i + dx, j + dy)) && FLAT_FOOT.has(surfAt(i + 2 * dx, j + 2 * dy));
  let pick: Stair | null = null, score = Infinity;
  for (const n of [STAIR_CELLS, 1]) {
    for (const [dx, dy] of [[1, 0], [0, 1]] as const) {
      const ex = dy, ey = dx; // along the side
      for (const c of cells) {
        const i = c % w, j = (c - i) / w;
        let ok = true; for (let q = 0; q < n && ok; q++) ok = edge(i + q * ex, j + q * ey, dx, dy);
        if (!ok) continue;
        const straight = edge(i - ex, j - ey, dx, dy) && edge(i + n * ex, j + n * ey, dx, dy);
        // the middle of the stretch on the side's outer cell line
        const x = g.x0 + (i + 0.5 + dx * 0.5 + ex * (n - 1) * 0.5) * CELL_T, y = g.y0 + (j + 0.5 + dy * 0.5 + ey * (n - 1) * 0.5) * CELL_T;
        const s = (x - tx) ** 2 + (y - ty) ** 2 + (straight ? 0 : 16);
        if (s < score) { score = s; pick = { x, y, nx: dx, ny: dy, half: n * CELL_T * 0.5 }; }
      }
    }
    if (pick) break;
  }
  return pick;
}

/** the sun's horizontal direction in tiles (toward the upper right of the screen) */
export const SUN_DIR = SUN_TILE_DIR;
/** how much a wall face with unit normal (nx, ny) (tiles, horizontal, from high to low) is lit: 0 (facing away from the sun) .. 1 (facing it) */
export function faceLight(nx: number, ny: number): number { return Math.max(0, Math.min(1, 0.5 + 0.5 * (nx * SUN_DIR.x + ny * SUN_DIR.y))); }
/** whether a face with unit normal (nx, ny) looks toward the camera (screen down, tile direction (1, 1)) */
export const facesCamera = (nx: number, ny: number) => nx + ny > 0;
