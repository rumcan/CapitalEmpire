/** T259 (#759): the farms' fields through the year (the owner, 2026-10-29: "corn fields ... so we can plant these fields you created for the
 *  farms and make a better texture for the un planted fields").
 *
 *  - **A field's use** is fixed by its farm (farms.ts layoutOf2, its own random stream): corn, ploughed (left unplanted this year) or fallow
 *    grass; a field never changes use with the month, so the farm's other draws never move.
 *  - **A corn field's state** follows the calendar month (golf/calendar.ts seasonMonth: 0 is January): ploughed in winter and spring, young
 *    corn in early summer, ripe corn in late summer and autumn, stubble after the harvest (CORN_YEAR). Each field runs a month early, on time or
 *    a month late (cornShift, from its farm's stream), so neighbouring fields differ and a farm's fields turn over two months, not all at once.
 *  - **The orchard's trees** go through the leaf stages of the library's capital trees (ORCHARD_YEAR), the same month on every farm.
 *  - **The look** (renderer.ts drawCrops): a crop patch is the field's soil (the 'field' surface, painted dirt) with its rows drawn over it
 *    along the field's direction (rowSegments), each state in its own rows (ROW_LOOK). These are the stand-ins for the art items 185 (corn:
 *    young, ripe, stubble) and 186 (ploughed): when a state's picture lands it is named in painted-surfaces.json under CROP_SURFACE's key (one
 *    line), and the fields of that state wear it in place of the stand-in rows.
 *
 *  Pure TypeScript, no DOM: the node tests run it. Units: tiles of 2 m. */

/** a field's use for the year: corn (CORN_YEAR), ploughed bare all year, or fallow grass */
export type FieldUse = 'corn' | 'plough' | 'fallow';
/** what a crop field shows: ploughed furrows, young (knee-high green) corn, ripe (tall golden) corn, or the stubble after the harvest */
export type CropState = 'plough' | 'young' | 'ripe' | 'stubble';
export const CROP_STATES: readonly CropState[] = ['plough', 'young', 'ripe', 'stubble'];

/** corn's year by calendar month (0 January .. 11 December), on time: ploughed December to May (winter and spring), young in June and July, ripe
 *  August to October, stubble in November */
export const CORN_YEAR: readonly CropState[] = ['plough', 'plough', 'plough', 'plough', 'plough', 'young', 'young', 'ripe', 'ripe', 'ripe', 'stubble', 'plough'];
/** a corn field's months early (-1), on time (0) or late (+1) from a uniform u in [0, 1): a quarter early, half on time, a quarter late */
export const cornShift = (u: number): -1 | 0 | 1 => (u < 0.25 ? -1 : u < 0.75 ? 0 : 1);
/** a calendar month as 0..11 (any integer: 12 is January again) */
export const monthOfYear = (m: number) => ((Math.floor(m) % 12) + 12) % 12;
/** what a field of this use shows in calendar month m (0 January), shifted by shift months (a late field shows last month's state): null for
 *  fallow grass (no crop) */
export function cropState(use: FieldUse, month: number, shift = 0): CropState | null {
  if (use === 'fallow') return null;
  if (use === 'plough') return 'plough';
  return CORN_YEAR[monthOfYear(month - shift)]!;
}

/** the orchard trees' leaf stage (the library's capital trees: forest.ts stages) by calendar month: bare in winter, leafing in April and
 *  May, in full leaf June to September, turning in October and November */
export type OrchardStage = 'open' | 'moderate' | 'patchy' | 'near-bare';
export const ORCHARD_YEAR: readonly OrchardStage[] = ['near-bare', 'near-bare', 'near-bare', 'patchy', 'moderate', 'open', 'open', 'open', 'open', 'moderate', 'patchy', 'near-bare'];
export const orchardStage = (month: number): OrchardStage => ORCHARD_YEAR[monthOfYear(month)]!;

/** the painted surfaces (painted-surfaces.ts SURFACES: the studio's Map group) each crop state wears once its art lands, by the axis its rows
 *  run along on the map: x, or y (the owner's method paints a field on a game screenshot, so a picture's rows keep the direction they were
 *  painted in; a field takes the axis nearest its rows). Unnamed in painted-surfaces.json, the stand-in rows are drawn. The swap is one line
 *  there: "cornYoung": { "family": "<the 185 family>", ... } */
export const CROP_SURFACE: Readonly<Record<CropState, { x: string; y: string }>> = {
  plough: { x: 'fieldPloughed', y: 'fieldPloughedY' },
  young: { x: 'cornYoung', y: 'cornYoungY' },
  ripe: { x: 'cornRipe', y: 'cornRipeY' },
  stubble: { x: 'cornStubble', y: 'cornStubbleY' },
};
/** the farm lane's painted surface (GOLF-ART-LIST 189): unnamed in painted-surfaces.json, the lane is the Dirt surface with its wheel ruts drawn
 *  over it (renderer.ts); named, the lane wears it (the ruts stay: they follow the lane, which a picture laid unturned cannot) */
export const LANE_SURFACE = 'farmLane';
/** the surface (texture id) a crop patch's art would be, by its state and its rows' direction (dx, dy) */
export const cropSurface = (st: CropState, dx: number, dy: number): string => (Math.abs(dx) >= Math.abs(dy) ? CROP_SURFACE[st].x : CROP_SURFACE[st].y);

/** the stand-in rows of each state (tiles; renderer.ts drawCrops):
 *  - pitch: the rows' spacing (corn at 0.76 m, the furrows at 0.9 m);
 *  - width: a row's stroke; dash: its plants (on, off; null: a solid furrow), the dashes start anywhere along each row;
 *  - colour: the crop's colour; detail: how strongly the map grass's painted texture is laid over it (overlay: the rows keep their colour and
 *    take the painting's detail, never a flat stroke);
 *  - wear: how much of the row the wear noise eats (0 none .. 1 a broken row);
 *  - shadow: the row's shadow toward the lower left (the sun at the upper right, shadows at 145 degrees), its offset and depth (the cool shade
 *    multiplied onto the soil, its texture kept); a tall crop's falls further;
 *  - shine: a thin lit edge toward the upper right (0: none), inset into the row and laid in soft light (the texture masks it);
 *  - ridge: the furrows' turned soil, a light edge beside each furrow toward the sun (0: none) */
export interface RowLook { pitch: number; width: number; dash: readonly [number, number] | null; colour: string; detail: number; wear: number; shadow: { off: number; depth: number }; shine: number; ridge: number }
export const ROW_LOOK: Readonly<Record<CropState, RowLook>> = {
  plough: { pitch: 0.45, width: 0.15, dash: null, colour: '#3f2c1d', detail: 0.55, wear: 0.2, shadow: { off: 0.05, depth: 0.5 }, shine: 0, ridge: 0.4 },
  young: { pitch: 0.38, width: 0.2, dash: [0.14, 0.07], colour: '#5a9a26', detail: 0.3, wear: 0.1, shadow: { off: 0.08, depth: 0.6 }, shine: 0.35, ridge: 0 },
  ripe: { pitch: 0.38, width: 0.3, dash: null, colour: '#b39257', detail: 0.65, wear: 0.14, shadow: { off: 0.15, depth: 0.75 }, shine: 0.4, ridge: 0 },
  stubble: { pitch: 0.38, width: 0.12, dash: [0.07, 0.06], colour: '#f4e7c0', detail: 0.25, wear: 0.05, shadow: { off: 0.07, depth: 0.7 }, shine: 0, ridge: 0 },
};
/** the least spacing (device px) the stand-in rows are drawn at: further out the rows are drawn every second, fourth ... one, wider (no moire) */
export const ROW_MIN_PX = 4;
/** the step (1, 2, 4, ...) that keeps rows of pitch p tiles at least ROW_MIN_PX apart at px device px a tile */
export function rowStep(pitch: number, px: number): number { let k = 1; while (pitch * k * px < ROW_MIN_PX && k < 64) k *= 2; return k; }

/** The rows over a convex quad (8 numbers, its corners in order, tiles): lines along the unit direction (dx, dy), `pitch` apart, on a grid
 *  anchored at the world origin shifted by phase (a fraction of the pitch), each cut to the quad and pulled in by inset at its ends, then
 *  (box: x0 y0 x1 y1, tiles) cut to the box: x0 y0 x1 y1 ... (tiles). A row whose cut is shorter than 2 x inset is left out, and one that
 *  misses the box */
export function rowSegments(quad: readonly number[], dx: number, dy: number, pitch: number, phase = 0, inset = 0, box?: readonly number[]): number[] {
  const out: number[] = [], L = Math.hypot(dx, dy); if (!(L > 0) || !(pitch > 0) || quad.length < 6) return out;
  const ux = dx / L, uy = dy / L, nx = -uy, ny = ux, n = quad.length / 2;
  // the quad's extent across the rows (along n): the rows' offsets k * pitch + phase * pitch inside it
  let s0 = Infinity, s1 = -Infinity;
  for (let i = 0; i < n; i++) { const s = quad[2 * i]! * nx + quad[2 * i + 1]! * ny; s0 = Math.min(s0, s); s1 = Math.max(s1, s); }
  // (a box: only the rows that cross it, their offsets within its corners' extent across the rows)
  if (box) {
    let b0 = Infinity, b1 = -Infinity;
    for (const [x, y] of [[box[0]!, box[1]!], [box[2]!, box[1]!], [box[2]!, box[3]!], [box[0]!, box[3]!]] as const) { const s = x * nx + y * ny; b0 = Math.min(b0, s); b1 = Math.max(b1, s); }
    s0 = Math.max(s0, b0); s1 = Math.min(s1, b1); if (s0 > s1) return out;
  }
  const ph = ((phase % 1) + 1) % 1;
  for (let k = Math.ceil(s0 / pitch - ph); (k + ph) * pitch <= s1; k++) {
    const s = (k + ph) * pitch;
    // the row's span along u: the quad's edges it crosses (a convex quad: the least and most of the crossings)
    let t0 = Infinity, t1 = -Infinity;
    for (let i = 0; i < n; i++) {
      const ax = quad[2 * i]!, ay = quad[2 * i + 1]!, bx = quad[2 * ((i + 1) % n)]!, by = quad[2 * ((i + 1) % n) + 1]!;
      const sa = ax * nx + ay * ny - s, sb = bx * nx + by * ny - s;
      if ((sa > 0 && sb > 0) || (sa < 0 && sb < 0)) continue;
      const f = sa === sb ? 0 : sa / (sa - sb), px = ax + (bx - ax) * f, py = ay + (by - ay) * f, t = px * ux + py * uy;
      t0 = Math.min(t0, t); t1 = Math.max(t1, t);
      if (sa === sb) { const t2 = bx * ux + by * uy; t0 = Math.min(t0, t2); t1 = Math.max(t1, t2); }
    }
    if (!(t1 - t0 > 2 * inset)) continue;
    t0 += inset; t1 -= inset;
    // (the box: the row's span along u inside it, x and y each bounding t: p(t) = u t + n s)
    if (box) {
      for (const [uc, pc, lo, hi] of [[ux, nx * s, box[0]!, box[2]!], [uy, ny * s, box[1]!, box[3]!]] as const) {
        if (Math.abs(uc) < 1e-12) { if (pc < lo || pc > hi) { t1 = -Infinity; break; } continue; }
        const ta = (lo - pc) / uc, tb = (hi - pc) / uc; t0 = Math.max(t0, Math.min(ta, tb)); t1 = Math.min(t1, Math.max(ta, tb));
      }
      if (!(t1 > t0)) continue;
    }
    out.push(ux * t0 + nx * s, uy * t0 + ny * s, ux * t1 + nx * s, uy * t1 + ny * s);
  }
  return out;
}
