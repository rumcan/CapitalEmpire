import type { Game } from '../../game/engine';
import { BORDER_MAX_M, BORDER_MIN_M } from '../../game/ext/course-grid/patch';
import { BORDER_KINDS } from '../../game/paint-tool';
import { BRUSH_PRESETS, borderStep, borderW } from '../../game/paint';
import { SHADOW_HAIRLINE } from '../../game/ext/course-walls';

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
/** a width as the slider reads it */
export const borderLabel = (m: number) => (m < 0.15 ? 'hairline' : m < 1 ? `${Math.round(m * 100)} cm` : `${m.toFixed(1)} m`);
/** a Shadow value as the slider reads it (0 none, SHADOW_HAIRLINE the hairline, 1 strong) */
export const shadowLabel = (s: number) => (s <= 0.005 ? 'none' : Math.abs(s - SHADOW_HAIRLINE) < 0.015 ? 'hairline' : s >= 0.98 ? 'strong' : `${Math.round(s * 100)}%`);

/** the course look's Border and Shadow for the surface in the brush (the owner's test, 2026-10-25: "the border size changes nothing ... it
 *  should be a slider to make the border huge if you want or hairline if you want"; "the shadow ... make it hairline"; "no shadows under
 *  greens please"). Border sets the collar band round every surface of this kind (a green's fringe, a fairway's or tee's first cut, a
 *  bunker's lip, a pond's bank); Shadow its walls' shadow (none by default for a green, a hairline for the rest). Both apply live (the
 *  course is drawn again as the slider moves) and are remembered with the brush look */
export function CourseEdges({ game }: { game: Game }) {
  const p = game.paint, kind = p.brushKind, band = BORDER_KINDS[kind], bw = p.courseBorder(kind), sh = p.courseShadow(kind);
  const name = BRUSH_PRESETS.find(b => b.kind === kind)?.name ?? '';
  return (
    <div className="mt-2">
      {band && bw !== null && (
        <div className="flex items-center gap-2 text-[11px] text-slate-400" title={`The ${band.band} round every ${name.toLowerCase()}: from a hairline to ${BORDER_MAX_M} m`}>
          <span className="w-12 shrink-0">Border</span>
          <input type="range" aria-label={`Border: the ${band.band} round every ${name.toLowerCase()}`} min={0} max={STEPS} step={1} value={borderPos(bw)} onChange={e => p.setCourseBorder(borderAt(+e.target.value))} className="min-w-0 flex-1" />
          <span className="w-16 text-right text-xs text-slate-200">{borderLabel(bw)}</span>
        </div>
      )}
      {sh !== null && (
        <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-400" title={`The shadow of every ${name.toLowerCase()}'s raised or sunken edge: none, a hairline contact line, up to a strong cast shadow`}>
          <span className="w-12 shrink-0">Shadow</span>
          <input type="range" aria-label={`Shadow of every ${name.toLowerCase()}`} min={0} max={100} step={1} value={Math.round(sh * 100)} onChange={e => p.setCourseShadow(+e.target.value / 100)} className="min-w-0 flex-1" />
          <span className="w-16 text-right text-xs text-slate-200">{shadowLabel(sh)}</span>
        </div>
      )}
    </div>
  );
}
