// T226 (#652): the gear menu's Colour grade (src/game/grade.ts): the golden-hour grade On (the default) or Off, its strength 0..150%, and the
// edge blur (the miniature feel). Each change applies at once and is remembered.
import type { Game } from '../game/engine';
import { GRADE_STRENGTH_MAX } from '../game/grade';

export function GradePanel({ game, bump }: { game: Game; bump: () => void }) {
  const g = game.grade, set = (v: Parameters<Game['setGrade']>[0]) => { game.setGrade(v); bump(); };
  return (
    <div className="flex flex-col border-t border-white/10 pt-1" data-testid="grade-panel">
      <div className="flex items-center gap-2 px-2 py-2 text-sm" role="group" aria-label="Colour grade"
        data-tip="The golden-hour look: warmer highlights, cooler deep shadows, a little more colour and contrast, and slightly darker corners. A curve, not a tint: the textures keep their detail. It eases off after dusk so the lamps' light stays true">
        <span className="flex-1">Colour grade</span>
        {([[true, 'On'], [false, 'Off']] as const).map(([on, label]) => (
          <button key={label} className={`chip ${g.on === on ? 'chip-on' : ''}`} aria-pressed={g.on === on} data-grade={on ? 'on' : 'off'} onClick={() => set({ on })}>{label}</button>
        ))}
      </div>
      {g.on && (<>
        <label className="flex items-center gap-2 px-2 py-1 text-xs" data-tip="How strong the grade is: 100% = the default, 0 = none">
          <span className="w-16 shrink-0">Strength</span>
          <input type="range" className="min-w-0 flex-1" min={0} max={GRADE_STRENGTH_MAX} step={0.05} value={g.strength} onChange={e => set({ strength: +e.target.value })} />
          <span className="w-10 text-right tabular-nums">{Math.round(g.strength * 100)}%</span>
        </label>
        <label className="flex cursor-pointer items-center gap-2 px-2 py-1 text-xs" data-tip="A soft blur toward the top and bottom of the screen, as in a tilt-shift photo: the town looks like a miniature">
          <input type="checkbox" checked={g.edgeBlur} onChange={e => set({ edgeBlur: e.target.checked })} />
          Edge blur (miniature)
        </label>
      </>)}
    </div>
  );
}
