import type { Game } from '../../game/engine';

const STEPS = ['Click the tee', 'Click the green', 'Drag the handles, then Build'] as const;

/** the New hole wizard's panel (T102, plan P21 3.3 A), shown in the Course panel while the plan mode is on: the hole and the step, the
 *  live par, length and price, and Build, Cancel, Delete and Done. The map shows the ghost (exactly the cells a Build lays), the handles,
 *  the gold Build pill and the label beside the pointer. Self-contained: it reads and drives game.paint (the plan mode) only */
export function HoleWizardPanel({ game }: { game: Game }) {
  const p = game.paint, w = p.wizard;
  const gh = w.step !== 'tee' && w.plan ? w.ghost() : null;
  const c = w.step === 'shape' ? w.check() : null;
  const step = w.step === 'tee' ? 0 : w.step === 'green' ? 1 : 2;
  const cur = p.brushHole, canEdit = w.step === 'tee' && p.hasPlan(cur);
  return (
    <div className="mt-2 rounded border border-amber-400/40 p-2">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-xs font-semibold text-amber-200">{w.base ? `Edit hole ${w.hole}` : `New hole ${w.hole}`}</span>
        <span className="text-[11px] text-slate-400">{`${step + 1}/3 · ${STEPS[step]}`}</span>
      </div>
      {gh && (
        <div className="mt-1 text-[11px] text-slate-200">
          {`Par ${gh.info.par} · ${gh.info.lengthM} m · $${gh.cost.toLocaleString()}`}
          {gh.refused ? <span className="text-slate-400">{` · ${gh.refused.toLocaleString()} cells left out`}</span> : null}
        </div>
      )}
      {c && !c.ok && c.why !== 'Nothing to change' && <div className="mt-0.5 text-[11px] text-red-300">{c.why}</div>}
      <div className="mt-1 flex flex-wrap gap-1">
        {w.step === 'shape' && <button className={`chip ${c?.ok ? 'chip-on' : 'opacity-40'}`} disabled={!c?.ok} title="Enter, or the gold pill by the green" onClick={() => p.buildPlan()}>Build</button>}
        {w.step !== 'tee' && <button className="chip" title="Esc" onClick={() => p.cancelPlan()}>Cancel</button>}
        {w.base && w.step === 'shape' && <button className="chip" title="Clears the hole's planned cells (your touch-ups stay); undo brings it back" onClick={() => p.deletePlan()}>Delete hole</button>}
        {canEdit && <button className="chip" onClick={() => p.editPlan(cur)}>{`Edit hole ${cur}`}</button>}
        <button className="chip" title="Back to the brush" onClick={() => p.setBrush(p.brushKind)}>Done</button>
      </div>
      <div className="mt-1 text-[10px] leading-snug text-slate-500">
        {w.step === 'shape'
          ? 'Drag the line (or a +) to bend it, up to 3 bends; amber handles set the width; drag the tee or green to move them. R turns the green, [ ] sizes it; right-click a bend to take it out.'
          : 'Everything snaps to the 1 m grid. Click a built hole\'s line to edit its plan.'}
      </div>
    </div>
  );
}
