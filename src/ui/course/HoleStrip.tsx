import type { Game } from '../../game/engine';
import { HOLE_COUNT } from '../../game/paint-tool';

const HOLES = Array.from({ length: HOLE_COUNT }, (_, i) => i + 1);

/** the Course panel's hole strip: holes 1-18 in two rows (the current one lit, a green dot where a hole has areas; a click makes it current
 *  and moves the camera there) and + New hole, which goes to the next free number */
export function HoleStrip({ game }: { game: Game }) {
  const p = game.paint, used = p.usedHoles();
  return (
    <div className="mt-2">
      <div className="text-[11px] text-slate-400">{`Holes · ${used.size} of ${HOLE_COUNT} started`}</div>
      <div className="grid grid-cols-9 gap-1">
        {HOLES.map(n => (
          <button key={n} className={`chip relative justify-center px-0 ${p.brushHole === n ? 'chip-on' : ''} ${used.has(n) ? '' : 'opacity-50'}`} title={`Hole ${n}${used.has(n) ? '' : ' (empty)'}`} onClick={() => game.goToHole(n)}>
            {n}
            {used.has(n) && <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-emerald-400" />}
          </button>
        ))}
      </div>
      <button className="chip mt-1" onClick={() => { const f = p.nextFreeHole(); if (f) game.goToHole(f); else game.toast(`All ${HOLE_COUNT} holes have areas`, 'warn'); }}>+ New hole</button>
    </div>
  );
}
