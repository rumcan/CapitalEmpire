import { BRUSH_PRESETS, type BrushKind, type PaintArea } from './paint';
import type { CourseTex } from './ground-protocol';

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
