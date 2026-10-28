// T227 (#656): the concept's course finish (docs/art/CONCEPT-LOOK.md steps 3 and 4; the owner, 2026-10-27, with the concept picture
// docs/art/concept/maple-falls-concept.webp: "this is the look and feel we need to get to"): wide light and dark mowing bands that follow each
// hole (the range outfield's too), fine stripes on the greens, a clearly darker first-cut collar round the fairways and the greens, and the
// bunkers' lips (a dark textured crescent inside the far rim, a light near lip, a thin raised grass lip round the sand). The sun is at the
// screen's upper right (course-height SUN_TILE_DIR), so a bunker's far rim is the one whose outward normal faces it.
// Its knobs ride in the painted surfaces file (painted-surfaces.json `course`, Studio > Painted > Course finish; the console
// window.__game.ground.setCourseFinish): a missing block is the tuned look, `on: false` is the course exactly as before T227 (T218's stripes,
// BLOB_STYLE's collars, no green stripes, no lips), and each additive knob at 0 leaves its part as before. Everything is baked into the
// ground chunks (renderer.ts drawCourses). Pure: no DOM, importable from node tests.
import type { MowStripes } from './ground-protocol';
import { SURF } from './ext/course-grid';
import { borderBase } from './ext/course-grid/patch';
import { SUN_TILE_DIR } from './ext/course-height';
import type { StripeLook } from './course-stripes';

/** the course finish's knobs */
export interface CourseFinish {
  /** the finish on; off: the course exactly as before T227 */
  on: boolean;
  /** the fairways' and the range outfield's mowing bands: along the line of play (they follow the hole, as in the concept; else across it, as
   *  T218 laid them), one band's width (tiles) and strength (0: no bands .. 1 strong: how much lighter the light ones and darker the dark ones) */
  along: boolean; bandWidth: number; bandStrength: number;
  /** the greens' fine stripes: one band's width (tiles) and strength (0: none, the green as before) */
  greenWidth: number; greenStrength: number;
  /** the first-cut collar round the fairways and the fringe round the greens: the width the Border slider starts from (metres; the fringe
   *  half of it, at least BLOB_STYLE's metre; a Border the player set wins) and its tone (0: as the texture is .. 1: darkest, a multiply that
   *  keeps the texture; the tees' first cut takes it too, so the first cut is one grass) */
  collarWidth: number; collarTone: number;
  /** the bunkers' lips: 0 none (as before) .. 1 the tuned look .. 2 strong */
  lip: number;
}
/** the tuned look (against the concept, at 30% and 15%) */
export const DEFAULT_COURSE_FINISH: Readonly<CourseFinish> = { on: true, along: true, bandWidth: 3, bandStrength: 0.8, greenWidth: 0.75, greenStrength: 0.3, collarWidth: 4, collarTone: 0.45, lip: 1 };
/** the finish off: the course exactly as before T227 */
export const FINISH_OFF: Readonly<CourseFinish> = { ...DEFAULT_COURSE_FINISH, on: false };
/** the knobs' ranges (collarWidth: the Border slider's, ext/course-grid/patch BORDER_MIN_M .. BORDER_MAX_M) */
export const FINISH_RANGES = { bandWidth: [1, 16], bandStrength: [0, 1], greenWidth: [0.25, 4], greenStrength: [0, 1], collarWidth: [0.1, 8], collarTone: [0, 1], lip: [0, 2] } as const;
type Ranged = keyof typeof FINISH_RANGES;

/** a finish with every knob held to its range (missing or bad: the tuned look's) */
export function clampCourseFinish(f: unknown): CourseFinish {
  const o = (f && typeof f === 'object' ? f : {}) as Partial<Record<keyof CourseFinish, unknown>>, D = DEFAULT_COURSE_FINISH;
  const num = (k: Ranged) => { const v = o[k], [lo, hi] = FINISH_RANGES[k]; return Math.round(Math.min(hi, Math.max(lo, typeof v === 'number' && Number.isFinite(v) ? v : D[k])) * 1000) / 1000; };
  return { on: typeof o.on === 'boolean' ? o.on : D.on, along: typeof o.along === 'boolean' ? o.along : D.along, bandWidth: num('bandWidth'), bandStrength: num('bandStrength'), greenWidth: num('greenWidth'), greenStrength: num('greenStrength'), collarWidth: num('collarWidth'), collarTone: num('collarTone'), lip: num('lip') };
}
/** the finish a surfaces file carries (painted-surfaces.ts SurfacesFile.course), clamped and kept per file (the file is never changed) */
const memo = new WeakMap<object, CourseFinish>();
export function finishOf(file: { course?: unknown } | null | undefined): CourseFinish {
  if (!file) return clampCourseFinish(null);
  let f = memo.get(file); if (!f) memo.set(file, f = clampCourseFinish(file.course)); return f;
}

// ---------- the mowing bands ----------
/** the bands' light (a lift in proportion to the grass's own colour times BAND_TINT, renderer.ts mowBands) and dark (a multiply of the dark
 *  colour) at full strength, and their soft edge (0 hard .. 1 a smooth wave; the concept's bands meet at a crisp mowing line). The concept's
 *  bands differ by about 20% in lightness on a smooth painting; ours, on a busier one, by about a third at the default strength (light x1.13,
 *  dark x0.82: stronger than T218's washes, which flattened the texture), the mean a touch darker than the grass, so the fairway never reads
 *  brighter or more saturated than it is */
export const BAND_LIGHT = 0.16, BAND_DARK = 0.34, BAND_SOFT = 0.14;
/** the light bands' tint: a warm pale yellow, so a light band leans a touch yellower than a dark one (as the concept's), never more saturated */
export const BAND_TINT = '#fff0b4';
/** the greens' fine stripes at full strength: subtle, as the concept's smooth greens */
export const GREEN_LIGHT = 0.2, GREEN_DARK = 0.2;
/** the fairways' band look with the finish (null: off, T218's look stands): its width, its strengths in renderer mowBands' terms (l the
 *  light's lift, k the dark multiply, no tint wash), BAND_TINT for the light, the dark colour of base (T218's: course-stripes
 *  fairwayStripeLook, the range outfield preset's) and along or across the line of play */
export function finishStripeLook(f: CourseFinish, base: StripeLook): StripeLook | null {
  if (!f.on) return null;
  return { w: f.bandWidth, l: BAND_LIGHT * f.bandStrength, k: BAND_DARK * f.bandStrength, lc: BAND_TINT, dc: base.dc, t: 0, f: BAND_SOFT, across: !f.along };
}
/** the greens' fine stripe look (null: off or strength 0, the green as before): along the line of play, as the fairway's */
export function greenStripeLook(f: CourseFinish, base: StripeLook): StripeLook | null {
  if (!f.on || !(f.greenStrength > 0)) return null;
  return { w: f.greenWidth, l: GREEN_LIGHT * f.greenStrength, k: GREEN_DARK * f.greenStrength, lc: BAND_TINT, dc: base.dc, t: 0, f: BAND_SOFT, across: false };
}
/** the range outfield's bands with the finish (rangehost outfieldStripes gives its line of play, lx ly): the fairways' width and strength,
 *  along the line of play (a band centred on the line through the mow origin) or across it; null: the finish off, or a stripe set with no
 *  line (it keeps its own look) */
export function finishMow(m: MowStripes, f: CourseFinish, base: StripeLook): MowStripes | null {
  const look = finishStripeLook(f, base); if (!look || m.lx === undefined || m.ly === undefined) return null;
  const n = Math.hypot(m.lx, m.ly) || 1, lx = m.lx / n, ly = m.ly / n, w = look.w;
  const [ux, uy] = look.across ? [lx, ly] : [-ly, lx], ox = look.across ? m.ox : m.ox - ux * w / 2, oy = look.across ? m.oy : m.oy - uy * w / 2;
  return { ux, uy, ox, oy, w, l: look.l, k: look.k, lc: look.lc, dc: look.dc, t: 0, f: look.f };
}

// ---------- the collar ----------
/** the collar's multiply colour: a deep green, so the band reads as darker grass, not shade */
export const COLLAR_TINT = '#5b7a45';
/** the collar's tone over its texture (renderer drawCourses: the first cut's and the fringe's fill and feather): a multiply of COLLAR_TINT at
 *  ta; null: off or tone 0 (the collar as before) */
export function collarToneOf(f: CourseFinish): { tc: string; ta: number } | null {
  return f.on && f.collarTone > 0 ? { tc: COLLAR_TINT, ta: f.collarTone } : null;
}
/** whether a collar band takes the collar tone: every first cut (the fairways' and the tees') and the greens' fringe */
export const tonedCollar = (name: string) => name === 'first-cut' || name === 'fringe';
/** the collar width the Border slider starts from for surface s (metres), or null where the finish leaves BLOB_STYLE's (off, or a surface
 *  other than the fairway and the green) */
export function collarDefault(s: number, f: CourseFinish): number | null {
  if (!f.on) return null;
  if (s === SURF.fairway) return f.collarWidth;
  if (s === SURF.green) return Math.max(1, Math.round(f.collarWidth * 50) / 100);
  return null;
}
/** T260 (#763): the Border a surface's band is laid at when the player has set none (metres; 0: none): the fairway's first cut and the
 *  green's fringe at the finish's widths (BLOB_STYLE's with the finish off), none round a tee, a bunker or a pond */
export function borderDefault(s: number, f: CourseFinish): number { return collarDefault(s, f) ?? borderBase(s); }
/** the surfaces with a collar band (course-blobs BLOB_STYLE), whose Border the defaults fill in */
const BANDED = [SURF.water, SURF.fairway, SURF.tee, SURF.bunker, SURF.green];
/** the Border widths by surface id (paint-tool courseBorders: the ones the player set) with the defaults filled in where unset: the finish's
 *  first cut and fringe (T227), none for the rest (T260: a tee's, a bunker's or a pond's band only where the player set a Border) */
export function finishBorders(border: readonly (number | undefined)[], f: CourseFinish): (number | undefined)[] {
  const out = border.slice();
  for (const s of BANDED) if (out[s] === undefined) out[s] = borderDefault(s, f);
  return out;
}

// ---------- the bunker lips ----------
/** the lips' numbers at lip strength 1, tiles and alphas: the dark crescent inside the far rim (a cool multiply that keeps the sand's texture,
 *  reaching `reach` in from `foot` of the far wall's drop down the screen), the light near lip (a textured shine a gap inside the near rim, `w` wide), the raised grass lip round the sand (on the
 *  lip band: a shine on its far side, inset from the sand's edge by a gap; a light shade on its near side); bare: the grass lip's width round
 *  a bunker with no lip band (T260, a Border of none: on the ground round the sand, as wide as the old default band, 1 m) */
export const LIP = { dark: 0.7, reach: 1.1, foot: 0.85, light: 0.75, gap: 0.07, w: 0.36, grass: 0.4, grassGap: 0.05, shade: 0.3, bare: 0.5 } as const;
/** how many weight steps a rim is drawn in */
export const LIP_BINS = 4;
/** a segment's sun facing: its outward normal (dy, -dx) (the surface lies on the left of travel, course-grid patch edges) against the sun at the
 *  upper right, -1 turned from it .. 1 facing it */
export function edgeFacing(dx: number, dy: number): number { const l = Math.hypot(dx, dy); return l < 1e-9 ? 0 : (dy * SUN_TILE_DIR.x - dx * SUN_TILE_DIR.y) / l; }
const smooth = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
/** a rim segment's weight from its facing: full facing the sun (far) or turned from it (near), easing to none side-on */
export const farWeight = (facing: number) => smooth((facing + 0.1) / 0.8), nearWeight = (facing: number) => smooth((0.1 - facing) / 0.8);
/** a bunker's edges sorted for its lip: each segment (flat x0 y0 x1 y1) of the sand's edges in the step of its far weight and of its near
 *  weight (index k of LIP_BINS: weight k / (LIP_BINS - 1); step 0, a side-on segment, is left out) */
export function lipRuns(edges: readonly ArrayLike<number>[]): { far: number[][]; near: number[][] } {
  const far = Array.from({ length: LIP_BINS }, () => [] as number[]), near = Array.from({ length: LIP_BINS }, () => [] as number[]);
  for (const q of edges) for (let i = 0; i + 3 < q.length; i += 2) {
    const ax = q[i]!, ay = q[i + 1]!, bx = q[i + 2]!, by = q[i + 3]!; if (ax === bx && ay === by) continue;
    const fc = edgeFacing(bx - ax, by - ay), kf = Math.round(farWeight(fc) * (LIP_BINS - 1)), kn = Math.round(nearWeight(fc) * (LIP_BINS - 1));
    if (kf > 0) far[kf]!.push(ax, ay, bx, by);
    if (kn > 0) near[kn]!.push(ax, ay, bx, by);
  }
  return { far, near };
}
