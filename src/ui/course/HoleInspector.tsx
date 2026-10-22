import type { Game } from '../../game/engine';

/** the Course panel's inspector for the current hole: its par and lengths (metres and yards), then its checklist and warnings once it is started, or a
 *  note that it is not started yet */
export function HoleInspector({ game }: { game: Game }) {
  const v = game.courseHoleViews()[game.paint.brushHole - 1];
  if (!v) return null;
  return (
    <div className="mt-2 rounded border border-slate-700 p-2">
      <div className="text-xs text-slate-200 font-semibold">{`Hole ${v.n}${v.par ? ` · par ${v.par} · ${v.lengthM} m (${Math.round(v.lengthM * 1.0936)} yd)` : ''}`}</div>
      {v.par > 0 && v.memberLengthM !== v.lengthM && <div className="text-[11px] text-slate-400">{`Member tee ${v.memberLengthM} m (${Math.round(v.memberLengthM * 1.0936)} yd)`}</div>}
      {!v.started ? (
        <div className="mt-1 text-[11px] text-slate-400">Not started: paint a green and a tee, or place a preset.</div>
      ) : (
        <>
          <div className="mt-1 flex flex-col gap-0.5">
            {v.checks.map(c => (
              <div key={c.label} className="flex items-center gap-1.5 text-[11px]">
                <span className={c.ok ? 'text-emerald-400' : 'text-amber-400'}>{c.ok ? '✓' : '✗'}</span>
                <span className="text-slate-300">{c.label}</span>
              </div>
            ))}
            {v.warnings.map(w => (
              <div key={w} className="flex items-center gap-1.5 text-[11px]">
                <span className="text-amber-400">⚠</span>
                <span className="text-slate-300">{w}</span>
              </div>
            ))}
          </div>
          {v.virtual
            ? <div className="mt-1 text-[10px] text-slate-500">Pins and tee markers are worked out for this view; a golf game places them on the course.</div>
            : <div className="mt-1 text-[10px] text-slate-500">Pins and tee markers follow the painted green and tee; move them with the Holes tool.</div>}
        </>
      )}
    </div>
  );
}
