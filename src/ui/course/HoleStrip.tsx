import type { Game } from '../../game/engine';
import { HOLE_COUNT } from '../../game/paint-tool';

const HOLES = Array.from({ length: HOLE_COUNT }, (_, i) => i + 1);

/** the Course panel's hole strip: holes 1-18 in two rows (the current one lit, a dot where a hole is started: green when it is ok, amber when it
 *  needs attention; a click makes it current and moves the camera there), the started count with par and length, and + New hole, which goes to the next free number */
export function HoleStrip({ game }: { game: Game }) {
  const p = game.paint, views = game.courseHoleViews();
  const started = views.filter(v => v.started).length;
  const scored = views.filter(v => v.par > 0);
  const totalPar = scored.reduce((s, v) => s + v.par, 0), totalM = scored.reduce((s, v) => s + v.lengthM, 0);
  return (
    <div className="mt-2">
      <div className="text-[11px] text-slate-400">{`Holes · ${started} of ${HOLE_COUNT} started${scored.length ? ` · par ${totalPar} · ${totalM} m` : ''}`}</div>
      <div className="grid grid-cols-9 gap-1">
        {HOLES.map(n => {
          const v = views[n - 1]!;
          const title = v.started ? `Hole ${n}${v.par ? ` · par ${v.par} · ${v.lengthM} m` : ' · no playable line yet'}${v.ok ? '' : ' · needs attention'}` : `Hole ${n} (empty)`;
          return (
            <button key={n} className={`chip relative justify-center px-0 ${p.brushHole === n ? 'chip-on' : ''} ${v.started ? '' : 'opacity-50'}`} title={title} onClick={() => game.goToHole(n)}>
              {n}
              {v.started && <span className={`absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full ${v.ok ? 'bg-emerald-400' : 'bg-amber-400'}`} />}
            </button>
          );
        })}
      </div>
      <button className={`chip mt-1 ${p.mode === 'plan' && !p.wizard.base ? 'chip-on' : ''}`} title={game.golfMode ? 'Click the tee, then the green: the whole hole is planned, ready to shape and build' : undefined} onClick={() => { if (game.golfMode) { p.setPlan(); return; } const f = p.nextFreeHole(); if (f) game.goToHole(f); else game.toast(`All ${HOLE_COUNT} holes have areas`, 'warn'); }}>+ New hole</button>
    </div>
  );
}
