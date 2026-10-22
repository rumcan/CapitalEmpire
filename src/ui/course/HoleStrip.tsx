import type { Game } from '../../game/engine';
import { HOLE_COUNT } from '../../game/paint-tool';

const HOLES = Array.from({ length: HOLE_COUNT }, (_, i) => i + 1);

/** the Course tool's hole strip under the top bar: holes 1-18 (the current one lit, a green dot where a hole has areas) and + New hole, which goes to the next free number */
export function HoleStrip({ game }: { game: Game }) {
  const p = game.paint, used = p.usedHoles();
  return (
    <div className="pointer-events-auto glass absolute left-1/2 top-[calc(var(--hud-top,5.75rem)_+_0.5rem)] z-20 flex -translate-x-1/2 items-center gap-1 px-2 py-1">
      <span className="text-[11px] text-slate-400">Holes</span>
      {HOLES.map(n => (
        <button key={n} className={`chip relative ${p.brushHole === n ? 'chip-on' : ''} ${used.has(n) ? '' : 'opacity-50'}`} title={`Hole ${n}`} onClick={() => game.goToHole(n)}>
          {n}
          {used.has(n) && <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-emerald-400" />}
        </button>
      ))}
      <button className="chip" onClick={() => { const f = p.nextFreeHole(); if (f) game.goToHole(f); else game.toast(`All ${HOLE_COUNT} holes have areas`, 'warn'); }}>+ New hole</button>
    </div>
  );
}
