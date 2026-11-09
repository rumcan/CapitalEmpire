// T359 (#1006, part 3; the owner, 2026-11-08: "I see no way to edit the mowing lines over the fairway. they used to be editable."): the mowing lines
// of a surface's look. The course finish (course-finish.ts, T227) lays the fairway's wide light and dark bands along each hole's line of play and
// the greens' fine stripes; its numbers lived in the Studio alone. A look (a hole's, or the Course default's) now carries its own settings for
// them, edited in the surface's panel (Mowing lines): on or off, the pattern (along the hole, today's look; straight at an angle; a checkerboard;
// a diamond), the band width, how light the light bands and how dark the dark ones are (the texture made lighter or darker, never a wash: the
// owner's rule) and the angle. Every field absent is the finish's own, so a look with none lays the course exactly as before.
// T365 (#1020; the owner, 2026-11-08: "add fairway mowing lines that have patterns like the image attached", a real course's bold wide stripes with
// a crossed cut, and another's broad two-tone split): four more patterns, wide stripes, a crosscut, two-tone halves and a collar ring, each with
// its own tuned numbers (PATTERN_LOOKS); the fairway's own pattern, when a look sets none, is the course finish's `pattern` (wide stripes).
// Pure: no DOM, importable from node tests and the workers.

/** the patterns: the bands follow the hole's line of play (T218's look, the finish's own numbers); wide stripes (the same, bold: 10 m bands at the full
 *  lift and multiply, T365); a crosscut (two diagonal sets of stripes crossed, their lifts and multiplies adding: diamonds, T365); two-tone halves
 *  (the fairway split down the line of play, one half light and the other dark, T365); a collar ring (two passes of stripes round the fairway's
 *  edge, the wide stripes inside them, T365); parallel bands at an angle (one direction over the whole hole); a checkerboard of squares as wide as a
 *  band; a diamond (the checkerboard turned a quarter) */
export type MowPattern = 'along' | 'wide' | 'crosscut' | 'halves' | 'collar' | 'straight' | 'check' | 'diamond';
export const MOW_PATTERNS: readonly { id: MowPattern; name: string; note: string }[] = [
  { id: 'along', name: 'Along the hole', note: 'The bands follow the hole: the line of play runs down the middle of one' },
  { id: 'wide', name: 'Wide stripes', note: "Bold bands about 10 m across along the hole, strongly light and dark: a tournament fairway's broad stripes" },
  { id: 'crosscut', name: 'Crosscut', note: 'Two diagonal sets of stripes crossed: light where both are light, dark where both are dark, diamonds. The angle is how they cross, 90 or 45 degrees' },
  { id: 'halves', name: 'Two-tone halves', note: "The fairway split down the line of play: one half light, the other dark, a crisp line where they meet" },
  { id: 'collar', name: 'Collar ring', note: "Two passes of stripes going round the fairway's edge, the wide stripes inside them" },
  { id: 'straight', name: 'Straight', note: 'Parallel bands at the angle you set, the same way over the whole hole' },
  { id: 'check', name: 'Checkerboard', note: "Squares as wide as a band, light and dark, across the hole's line of play; the angle turns them" },
  { id: 'diamond', name: 'Diamond', note: "The checkerboard turned a quarter: diamonds on the hole's line, then the angle on top" },
];
/** the surfaces that have mowing lines: the fairway (on by default, the finish's bands), the green (the finish's fine stripes), the tee and the
 *  rough (off by default: the tee wears the green's grass with no lines, the owner's calls of 2026-10-29 and 2026-11-08) */
export const MOW_KINDS = ['fairway', 'green', 'tee', 'rough'] as const;
export type MowKind = (typeof MOW_KINDS)[number];
/** a look's mowing lines, as the player set them: every field absent is the course finish's (and, for on, the surface's default) */
export interface MowOpts { on?: boolean; pattern?: MowPattern; /** the band's width, tiles (2 m) */ width?: number; /** how light the light bands are, 0 none .. 1 full */ light?: number; /** how dark the dark bands are, 0 none .. 1 full */ dark?: number; /** degrees in tile space (a crosscut: the angle its two sets cross at) */ angle?: number }
/** the ranges of the numbers (width in tiles) */
export const MOW_RANGES = { width: [0.5, 16], light: [0, 1], dark: [0, 1], angle: [-90, 90] } as const;
/** a crosscut's crossing angle: its range, and the default (square diamonds) */
export const CROSS_RANGE = [15, 90] as const, CROSS_DEFAULT = 90;
const PATTERN_IDS: readonly string[] = MOW_PATTERNS.map(p => p.id);

/** the numbers a pattern lays where the look sets none (the fairway's, tee's and rough's; a green keeps its own fine stripes): the band's width
 *  (tiles), the light and dark strengths (0..1 of the full lift and multiply), the soft edge (0 hard .. 1 smooth) and, for a crosscut, the angle it
 *  crosses at. Absent: the finish's own. The bold patterns lay the full strength; the wide ones 5 tiles (10 m), inside the 8 to 12 m of the real
 *  fairways the owner showed */
export interface PatternLook { w?: number; l?: number; k?: number; f?: number; angle?: number }
export const PATTERN_LOOKS: Readonly<Partial<Record<MowPattern, PatternLook>>> = {
  wide: { w: 5, l: 1, k: 1, f: 0.08 },
  crosscut: { w: 4, l: 1, k: 1, f: 0.1, angle: CROSS_DEFAULT },
  halves: { l: 1, k: 1 },
  collar: { w: 5, l: 1, k: 1, f: 0.08 },
};
/** the patterns laid as bands along the hole's line of play, one band a pass of the grounds crew's mower (engine crewGroundsNow, course-finish crewBandLook):
 *  the bands along the hole, wide stripes and a collar ring's inside; the halves, the crosscut and the straight, checkered and diamond patterns are
 *  not mown pass by pass */
export const BAND_PATTERNS: readonly MowPattern[] = ['along', 'wide', 'collar'];
/** the pattern a fairway lays when its look sets none, as the course finish ships it (course-finish.ts `pattern`): the strongest look, wide stripes;
 *  the old look, the bands along the hole at the finish's own width and strength, is the pattern 'along' (the dev server's ?mow=along lays it) */
export const DEFAULT_FAIRWAY_PATTERN: MowPattern = 'wide';

/** a number held to its range and rounded to a step (q), or undefined when it is not one */
function num(v: unknown, range: readonly [number, number], q: number): number | undefined {
  if (typeof v !== 'number' || !Number.isFinite(v)) return undefined;
  return Number((Math.round(Math.min(range[1], Math.max(range[0], v)) / q) * q).toFixed(4));
}
/** a look's mowing lines held to their ranges (anything missing or bad left out; undefined when nothing is set: the finish's own) */
export function clampMow(m: unknown): MowOpts | undefined {
  if (!m || typeof m !== 'object' || Array.isArray(m)) return undefined;
  const o = m as Record<string, unknown>, out: MowOpts = {};
  if (typeof o.on === 'boolean') out.on = o.on;
  if (typeof o.pattern === 'string' && PATTERN_IDS.includes(o.pattern)) out.pattern = o.pattern as MowPattern;
  const w = num(o.width, MOW_RANGES.width, 0.25), l = num(o.light, MOW_RANGES.light, 0.01), k = num(o.dark, MOW_RANGES.dark, 0.01), a = num(o.angle, MOW_RANGES.angle, 1);
  if (w !== undefined) out.width = w; if (l !== undefined) out.light = l; if (k !== undefined) out.dark = k; if (a !== undefined) out.angle = a;
  return Object.keys(out).length ? out : undefined;
}
/** two mowing settings are the same */
export const sameMow = (a: MowOpts | undefined, b: MowOpts | undefined): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** a surface's mowing lines as the contour worker hands them to the ground painter (CourseLayer.stripes[].m): on 1 / 0, the pattern's index in
 *  MOW_PATTERNS, the band width (tiles), the light and dark strengths (0..1) and the angle (degrees); every field absent is the finish's */
export interface MowRec { on?: 0 | 1; p?: number; w?: number; l?: number; k?: number; a?: number }
/** the worker's form of a look's mowing lines (undefined: none set). T365: every pattern a look names is carried, the bands along the hole too (the
 *  fairway's own pattern, where a look names none, is no longer that one) */
export function mowRecOf(o: MowOpts | undefined): MowRec | undefined {
  if (!o) return undefined;
  const r: MowRec = {};
  if (o.on !== undefined) r.on = o.on ? 1 : 0;
  if (o.pattern !== undefined) r.p = PATTERN_IDS.indexOf(o.pattern);
  if (o.width !== undefined) r.w = o.width; if (o.light !== undefined) r.l = o.light; if (o.dark !== undefined) r.k = o.dark; if (o.angle !== undefined) r.a = o.angle;
  return Object.keys(r).length ? r : undefined;
}
/** a pattern from a record's index (undefined: the record names none, an unknown index too: the kind's own default pattern) */
export const patternOf = (r: MowRec | undefined): MowPattern | undefined => (r?.p === undefined ? undefined : MOW_PATTERNS[r.p]?.id);
/** whether a record changes the look itself (any field but on / off; the bands along the hole are the finish's own look, so naming them alone
 *  does not: the Studio's finish off keeps T218's untextured look for them) */
export const mowCustom = (r: MowRec | undefined): boolean => !!r && ((r.p !== undefined && r.p !== 0) || r.w !== undefined || r.l !== undefined || r.k !== undefined || r.a !== undefined);

/** one surface's mowing lines by hole, as the engine hands them to the contour worker (CourseLooks.mow): base, the Course default's (or what a
 *  hole with looks of no kind of its own wears); hole[n], hole n's own (hole 0: your property's), {} where the hole has looks of its own with
 *  no mowing settings (the finish's), missing where it wears the base */
export interface MowTable { base?: MowRec; hole?: readonly (MowRec | undefined)[] }
/** the record that hole h (0: no hole, or your property) lays its lines with */
export const mowOfHole = (t: MowTable | undefined, h: number): MowRec | undefined => (t ? t.hole?.[h] ?? t.base : undefined);
/** whether any hole of a table turns its lines on by hand (a surface that has none by default is striped only then) */
export const mowAnyOn = (t: MowTable | undefined): boolean => !!t && (t.base?.on === 1 || !!t.hole?.some(r => r?.on === 1));
