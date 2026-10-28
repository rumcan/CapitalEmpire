import { BRUSH_PRESETS, type BrushKind, type PaintArea } from './paint';
import type { CourseTex } from './ground-protocol';
import { surfacePreset } from './paint-presets';
import { collarToneOf, tonedCollar, type CourseFinish } from './course-finish';

/** The course look of a surface (the Course brush's style, PaintTool.brush[kind].style) as the course grid lays it (T128: every control of the
 *  style editor works on the course, the owner 2026-10-25: "there's still this Blend with function when painting the course that does nothing
 *  and you cant change the border texture"): the fill's texture, scale, angle, tone and blend, and the collar band's own texture, scale, angle
 *  and tone. Pure: importable from node tests. */
export type LookStyle = Omit<PaintArea, 'id' | 'pts' | 'hole' | 'kind'>;

/** a surface's fill as its course texture: the texture, scale and angle, the tone when one is set, the blend when one is picked */
export function courseTexOf(st: LookStyle): CourseTex {
  return {
    tex: st.tex, sc: st.scale, a: st.angle,
    ...(st.tone ? { t: st.tone, ta: st.toneAmt, tc: st.tint } : {}),
    ...(st.mtex ? { m: { t: st.mtex, s: st.mshare ?? 0.5, f: st.msoft ?? 0.12, p: st.mpatch ?? 1 } } : {}),
  };
}
/** whether a brush's Border texture is its own pick (not the kerb, which a course band cannot be, and not the brush's default) */
const ownBorder = (kind: BrushKind, st: LookStyle) => st.btex !== 'kerb' && st.btex !== BRUSH_PRESETS.find(b => b.kind === kind)?.style.btex;
/** a surface's collar band (the fringe round a green, the first cut round a fairway or tee, a bunker's lip, a pond's bank) as its course
 *  texture: the brush's Border texture when the owner picked one (else the band's own, dflt), its Border scale and angle when they are set
 *  (else the band's own), and its Border tone */
export function courseBandOf(kind: BrushKind, st: LookStyle, dflt: CourseTex): CourseTex {
  const follow = st.bscale === 1 && st.bangle === 0;
  return {
    tex: ownBorder(kind, st) ? st.btex : dflt.tex, sc: follow ? dflt.sc : st.bscale, a: follow ? dflt.a : st.bangle,
    ...(st.btone ? { t: st.btone, ta: st.btoneAmt, tc: st.btint } : dflt.t ? { t: dflt.t, ta: dflt.ta, tc: dflt.tc } : {}),
  };
}
/** the style fields the course grid's look reads: a change to any of them draws the course again */
export const LOOK_FIELDS = ['tex', 'scale', 'angle', 'tone', 'toneAmt', 'tint', 'mtex', 'mshare', 'msoft', 'mpatch', 'btex', 'bscale', 'bangle', 'btone', 'btoneAmt', 'btint'] as const;
export const lookChanged = (a: Partial<LookStyle>, b: Partial<LookStyle>) => LOOK_FIELDS.some(k => a[k] !== b[k]);

/** a course collar band's name (course-blobs BLOB_STYLE): the green's fringe, the fairway's and the tee's first cut, a bunker's lip, a pond's bank */
export type BandName = 'first-cut' | 'fringe' | 'lip' | 'bank';
/** T252: the collar band each brush's surface wears on the course grid (BLOB_STYLE's collars); the rough, the long grass, the waste area and the
 *  cart path have none */
export const SURFACE_BAND: Readonly<Partial<Record<BrushKind, BandName>>> = { green: 'fringe', fairway: 'first-cut', tee: 'first-cut', bunker: 'lip', water: 'bank' };
/** the brushes' looks, as PaintTool.brush holds them */
export type BrushLooks = Readonly<Partial<Record<BrushKind, { style: LookStyle }>>>;
/** the collars' own textures (a Border texture the player picks replaces one: courseBandOf): the first cut's and the fringe's presets, and the
 *  bunker's lip and the pond's bank in the rough's grass (the renderer paints the bank's wet soil and stones, T099) */
export function collarTexes(b: BrushLooks): Record<BandName, CourseTex> {
  const pre = (s: string, old: string): CourseTex => ({ tex: surfacePreset(s) ?? old, sc: 1, a: 0 });
  const r = (b.rough ?? BRUSH_PRESETS.find(p => p.kind === 'rough')!).style, rough: CourseTex = { tex: r.tex, sc: r.scale, a: r.angle };
  return { 'first-cut': pre('firstCut', 'golfFirstCut'), fringe: pre('fringe', 'golfFringe'), lip: rough, bank: rough };
}
/** each banded surface's collar as the course grid lays it (engine courseLooks): courseBandOf over its collar's own texture; T227: lipGrass,
 *  the fairway's first cut a bunker's lip is laid in with the course finish, unless the player gave the bunker a Border texture of its own */
export function surfaceBands(b: BrushLooks): { collar: Record<BandName, CourseTex>; band: Partial<Record<BrushKind, CourseTex>>; lipGrass?: CourseTex } {
  const collar = collarTexes(b), band: Partial<Record<BrushKind, CourseTex>> = {};
  for (const [k, n] of Object.entries(SURFACE_BAND) as [BrushKind, BandName][]) {
    const st = (b[k] ?? BRUSH_PRESETS.find(p => p.kind === k)!).style;
    band[k] = courseBandOf(k, st, collar[n]);
  }
  const lipGrass = band.bunker?.tex === collar.lip.tex ? band.fairway : undefined;
  return { collar, band, ...(lipGrass ? { lipGrass } : {}) };
}
/** T252: a surface's border as its puck shows it (the Holes swatches and the brush cursor's chip): the collar band the course lays round it
 *  (surfaceBands; with the course finish a bunker's lip in the fairway's first cut), with the finish's collar tone where the course takes it
 *  (every first cut, the fringe, a lip laid in the first cut: renderer drawCourses) */
export interface PuckBand { name: BandName; tex: CourseTex; tone: { tc: string; ta: number } | null }
export function puckBandOf(kind: string, b: BrushLooks, fin: CourseFinish): PuckBand | null {
  const name = SURFACE_BAND[kind as BrushKind]; if (!name) return null;
  const { band, lipGrass } = surfaceBands(b), g = name === 'lip' && fin.on && lipGrass ? lipGrass : null, ct = collarToneOf(fin);
  return { name, tex: g ?? band[kind as BrushKind]!, tone: ct && (tonedCollar(name) || g) ? ct : null };
}

/** T256: what the course grid lays for one set of looks (the course default's, or one owner's: a hole, the property, a facility): each surface
 *  id's fill (courseTexOf; the fescue and the waste area wear their presets, pre), the collars by name, each banded surface's own band, and with
 *  the course finish a bunker's lip grass (surfaceBands). The engine's CourseLooks takes the default's as its base and an owner's where it differs */
export interface CourseLookSet { surf: (CourseTex | undefined)[]; collar: Record<BandName, CourseTex>; band: (CourseTex | undefined)[]; lipGrass?: CourseTex }
export function courseLookSet(b: BrushLooks, pre: (s: string, old: string) => CourseTex): CourseLookSet {
  const st = (k: BrushKind) => (b[k] ?? BRUSH_PRESETS.find(p => p.kind === k)!).style;
  // by surface id (ext/course-grid SURF): rough 1, fescue 2, water 3, fairway 4, tee 5, bunker 6, waste 7, green 8, long grass 9 (T238: its brush's look)
  const surf = [undefined, courseTexOf(st('rough')), pre('fescue', 'golfFescue'), courseTexOf(st('water')), courseTexOf(st('fairway')), courseTexOf(st('tee')), courseTexOf(st('bunker')), pre('waste', 'wasteSand'), courseTexOf(st('green')), courseTexOf(st('longGrass'))];
  const { collar, band: by, lipGrass } = surfaceBands(b), band: (CourseTex | undefined)[] = [];
  band[4] = by.fairway; band[5] = by.tee; band[8] = by.green; band[6] = by.bunker; band[3] = by.water;
  return { surf, collar, band, ...(lipGrass ? { lipGrass } : {}) };
}
