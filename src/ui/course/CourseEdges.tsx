import type { Game } from '../../game/engine';
import { BORDER_MAX_M, BORDER_MIN_M } from '../../game/ext/course-grid/patch';
import { BORDER_KINDS } from '../../game/paint-tool';
import { BRUSH_PRESETS, borderStep, borderW } from '../../game/paint';
import { HEIGHT_RANGE, ROCK_FROM, ROCK_STEEP_H, SHADOW_HAIRLINE, STAIR_MIN_H } from '../../game/ext/course-walls';
import { roundCornerM } from '../../game/ext/course-blobs';

/** the Border slider's steps: its position (0..STEPS) maps to a width on a square curve, so the hairline end has fine control and the far
 *  end reaches several metres */
const STEPS = 1000;
export const BORDER_STEPS = STEPS;
/** a Border slider position for a width in metres, and back */
export const borderPos = (m: number) => Math.round(STEPS * Math.sqrt(Math.max(0, Math.min(1, (m - BORDER_MIN_M) / (BORDER_MAX_M - BORDER_MIN_M)))));
export const borderAt = (pos: number) => BORDER_MIN_M + (BORDER_MAX_M - BORDER_MIN_M) * (Math.max(0, Math.min(STEPS, pos)) / STEPS) ** 2;
/** a painted area's Border slider position for its border step (paint.ts BorderSize: 0 none, the old 1, 2, 3 at 0.5, 1 and 2 m), and back:
 *  position 0 is none, the rest the same curve as the course's, a hairline to 8 m */
export const paintBorderPos = (b: number) => (b > 0 ? Math.max(1, borderPos(2 * borderW(b))) : 0);
export const paintBorderAt = (pos: number) => (pos > 0 ? borderStep(borderAt(pos) / 2) : 0);
/** T260 (#763): the course Border slider's position for a width in metres, and back: position 0 is none (no band at all), the rest the same
 *  curve, a hairline to BORDER_MAX_M (as the painted area's slider, paintBorderPos) */
export const courseBorderPos = (m: number) => (m > 0 ? Math.max(1, borderPos(m)) : 0);
export const courseBorderAt = (pos: number) => (pos > 0 ? borderAt(pos) : 0);
/** a width as the slider reads it */
export const borderLabel = (m: number) => (m < 0.15 ? 'hairline' : m < 1 ? `${Math.round(m * 100)} cm` : `${m.toFixed(1)} m`);
/** a brush's name in the plural, lower case (Tee box: tee boxes, Bunker: bunkers, Water: ponds) */
const plural = (name: string) => { const n = name.toLowerCase(); return n === 'water' ? 'ponds' : /(s|sh|ch|x)$/.test(n) ? `${n}es` : `${n}s`; };
/** a Shadow value as the slider reads it (0 none, SHADOW_HAIRLINE the hairline, 1 strong) */
export const shadowLabel = (s: number) => (s <= 0.005 ? 'none' : Math.abs(s - SHADOW_HAIRLINE) < 0.015 ? 'hairline' : s >= 0.98 ? 'strong' : `${Math.round(s * 100)}%`);

/** T253: a Smoothness as the slider reads it: its share and about how round a corner comes out */
export const smoothLabel = (v: number) => `${Math.round(v * 100)}% · ${roundCornerM(v).toFixed(1)} m`;
/** a Height as the slider reads it, with the form a tee takes there (T127: a grass bank, rock with stairs, a steep rock face) */
export const heightLabel = (m: number, tee: boolean) => `${m.toFixed(2)} m${!tee ? '' : m < STAIR_MIN_H ? ' · bank' : m < ROCK_FROM ? ' · bank, steps' : m < 0.75 * ROCK_STEEP_H ? ' · rock, steps' : ' · rock face'}`;

/** the course look's Border and Shadow for the surface in the brush (the owner's test, 2026-10-25: "the border size changes nothing ... it
 *  should be a slider to make the border huge if you want or hairline if you want"; "the shadow ... make it hairline"; "no shadows under
 *  greens please"). Border sets the collar band round every surface of this kind (a green's fringe, a fairway's or tee's first cut, a
 *  bunker's lip, a pond's bank); Shadow its walls' shadow (none by default for a green, a hairline for the rest); Height how high a tee or
 *  a green stands (T127: a tee's bank turns to rock with stairs from ROCK_FROM, a steep rock face higher). All apply live (the course is
 *  drawn again as the slider moves) and are remembered with the brush look */
export function CourseEdges({ game }: { game: Game }) {
  const p = game.paint, kind = p.brushKind, band = BORDER_KINDS[kind], bw = p.courseBorder(kind), sh = p.courseShadow(kind), ht = p.surfaceHeight(kind), hr = band ? HEIGHT_RANGE[band.s] : null, rd = p.roundOff(kind);
  const name = BRUSH_PRESETS.find(b => b.kind === kind)?.name ?? '';
  // T260 (#763; the owner, 2026-10-29: "an accordion for border that doesnt open anything"): never empty. A surface with no band on the
  // course grid (the waste area, the rough, the long grass) reads Border: none with a note; a banded one's slider starts at none
  return (
    <div className="mt-2" data-edges={kind}>
      {band && bw !== null ? (<>
        <div className="flex items-center gap-2 text-[12px] text-slate-400" title={`The ${band.band} round every ${name.toLowerCase()}: none, a hairline, up to ${BORDER_MAX_M} m`}>
          <span className="w-12 shrink-0">Border</span>
          <input type="range" aria-label={`Border: the ${band.band} round every ${name.toLowerCase()}`} min={0} max={STEPS} step={1} value={courseBorderPos(bw)} onChange={e => p.setCourseBorder(courseBorderAt(+e.target.value))} className="min-w-0 flex-1" />
          <span className="w-16 text-right text-xs text-slate-200" data-border={bw > 0 ? 'on' : 'none'}>{bw > 0 ? borderLabel(bw) : 'none'}</span>
        </div>
        {!(bw > 0) && <div className="text-[11px] text-slate-500">{`No ${band.band} round the ${plural(name)}: slide right to lay one.`}</div>}
      </>) : (<>
        <div className="flex items-center gap-2 text-[12px] text-slate-400" title={`The ${name.toLowerCase()} has no border band on the course`}>
          <span className="w-12 shrink-0">Border</span>
          <span className="text-xs text-slate-200" data-border="none">none</span>
        </div>
        <div className="text-[11px] text-slate-500">{`The ${name.toLowerCase()} has no border band on the course.`}</div>
      </>)}
      {/* T253 (#735; the owner, 2026-10-28: "bunkers and greens and all painted elements should have a tick box to round it with a slider to
          make the shape rounder and smoother"): every course surface. The look in hand takes it (the hole open in Edit hole or in hand, the
          property, a facility, My looks' Course default), so only its cells are rounded; play still reads the cells, the lie the drawn shape */}
      {rd && (<>
        <label className="mt-1 flex items-center gap-2 text-[12px] text-slate-300" data-round={rd.on ? 'on' : 'off'} title={`Round off every ${name.toLowerCase()} ${p.lookOwner === 'default' ? 'new holes start with' : 'here'}: its stepped 1 m outline becomes a smooth curve, its corners rounded`}>
          <input type="checkbox" aria-label={`Round off every ${name.toLowerCase()}`} checked={rd.on} onChange={e => p.setRoundOff({ round: e.target.checked })} />
          <span>Round off</span>
        </label>
        <div className={`mt-1 flex items-center gap-2 text-[12px] ${rd.on ? 'text-slate-400' : 'text-slate-600'}`} title="Smoothness: how far the outline is smoothed, from just the steps gone to broad rounded corners (about how round a corner comes out)">
          <span className="w-[4.5rem] shrink-0">Smoothness</span>
          <input type="range" aria-label={`Smoothness of every ${name.toLowerCase()}`} min={0} max={100} step={1} disabled={!rd.on} value={Math.round(rd.smooth * 100)} onChange={e => p.setRoundOff({ smooth: +e.target.value / 100 })} className="min-w-0 flex-1" />
          <span className="w-20 text-right text-xs text-slate-200 whitespace-nowrap" data-smooth={Math.round(rd.smooth * 100)}>{rd.on ? smoothLabel(rd.smooth) : 'off'}</span>
        </div>
      </>)}
      {sh !== null && (
        <div className="mt-1 flex items-center gap-2 text-[12px] text-slate-400" title={`The shadow of every ${name.toLowerCase()}'s raised or sunken edge: none, a hairline contact line, up to a strong cast shadow`}>
          <span className="w-12 shrink-0">Shadow</span>
          <input type="range" aria-label={`Shadow of every ${name.toLowerCase()}`} min={0} max={100} step={1} value={Math.round(sh * 100)} onChange={e => p.setCourseShadow(+e.target.value / 100)} className="min-w-0 flex-1" />
          <span className="w-16 text-right text-xs text-slate-200">{shadowLabel(sh)}</span>
        </div>
      )}
      {ht !== null && hr && (
        <div className="mt-1 flex items-center gap-2 text-[12px] text-slate-400" title={kind === 'tee' ? `How high every tee box stands: low on a grass bank, from ${ROCK_FROM} m on rocky sides with stairs up from the nearest cart path, higher a steep rock face` : `How high every ${name.toLowerCase()} stands on its gentle grass bank`}>
          <span className="w-12 shrink-0">Height</span>
          <input type="range" aria-label={`Height of every ${name.toLowerCase()}`} min={Math.round(hr[0] * 100)} max={Math.round(hr[1] * 100)} step={5} value={Math.round(ht * 100)} onChange={e => p.setSurfaceHeight(+e.target.value / 100)} className="min-w-0 flex-1" />
          <span className="w-24 text-right text-xs text-slate-200 whitespace-nowrap">{heightLabel(ht, kind === 'tee')}</span>
        </div>
      )}
    </div>
  );
}
