// The golf leaderboard (docs/GOLF-PLAY.md decision 8): the tournament day's live board over the map, from the tee-off to the results. It sits bottom
// right (the round panel is top right): the position, the name, to par and the holes thru, the owner's row highlighted, and the champion's line under
// the rows once everyone is done. It reads game.playBoard() and refreshes on its own twice a second. Before the join window closes (P4b) it offers
// "Play in it" (as a man or a woman); once he is in it says when he tees off. After the 15:00 kick-off it says the results wait for the last group (and
// offers them early); when the last group walks onto the 18th a banner names it and offers to watch it (T210).
// T211: a group waiting on the group ahead shows it under its golfer's row ("waiting on the 7th tee").
import { useEffect, useReducer } from 'react';
import type { Game } from '../game/engine';

/** a game minute of the day as HH:MM */
const clock = (m: number) => { const t = Math.floor(m) % 1440; return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };
/** a game minute of the day as the board says a tee time: 7:30 */
const teeText = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
/** the columns: position, name, to par, thru */
const COLS = 'grid-cols-[2.25rem_1fr_2.5rem_2.5rem]';

/** the board panel (nothing with no play): its title row ("Leaderboard" and the game time), the join row while he may join, the rows, and the champion's line */
export function GolfLeaderboard({ game }: { game: Game }) {
  const [, tick] = useReducer((x: number) => x + 1, 0);
  // the board refreshes itself twice a second (the interval is cleared on unmount)
  useEffect(() => { const iv = window.setInterval(tick, 500); return () => clearInterval(iv); }, []);
  const b = game.playBoard();
  if (!b) return null;
  const join = game.canJoinTournament();
  return (
    <div className={`pointer-events-auto absolute ${game.panel ? 'right-[19.5rem]' : 'right-3'} bottom-3 z-20 w-72 max-w-[calc(100vw-1.5rem)] max-h-[calc(100vh-var(--hud-top,6rem)-19rem)] overflow-y-auto glass p-3`} data-testid="leaderboard">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-display text-sm font-bold tracking-wide text-[var(--gold-hi)] uppercase">Leaderboard</span>
        <span className="text-sm font-bold tabular-nums text-[var(--gold-hi)]">{clock(b.minute)}</span>
      </div>
      {join && (
        <div className="mt-2 flex items-center justify-between gap-2 rounded bg-white/5 px-2 py-1.5 text-xs text-slate-200">
          <span>Play in it</span>
          <span className="flex gap-1">
            <button className="chip" onClick={() => game.joinTournament('m')}>as a man</button>
            <button className="chip" onClick={() => game.joinTournament('w')}>as a woman</button>
          </span>
        </div>
      )}
      {b.ownerTee !== null && <p className="mt-2 text-xs text-amber-200">You tee off at {teeText(b.ownerTee)}</p>}
      {b.last && (
        <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-amber-400/40 bg-amber-400/15 px-2 py-1.5 text-xs text-amber-100" data-guide="last-group">
          <span><span className="font-semibold text-amber-200">Last group on the 18th</span><br /><span className="text-slate-200">{b.last.join(', ')}</span></span>
          <button className="chip shrink-0" onClick={() => game.watchLastGroup()}>Watch</button>
        </div>
      )}
      {b.waiting && (
        <div className="mt-2 flex items-center justify-between gap-2 text-[12px] text-slate-300">
          <span>The results come when the last group is in.</span>
          <button className="chip shrink-0" onClick={() => game.showResultsNow()}>Results now</button>
        </div>
      )}
      <div className="mt-2 space-y-0.5 text-xs tabular-nums">
        <div className={`grid ${COLS} gap-2 text-[12px] uppercase text-slate-400`}><span>Pos</span><span>Name</span><span className="text-right">To par</span><span className="text-right">Thru</span></div>
        {b.rows.map(r => (
          <div key={r.golfer} className={`grid ${COLS} gap-2 rounded px-1 py-0.5 ${r.owner ? 'bg-amber-400/15 font-semibold text-amber-200' : 'text-slate-200'}`}>
            <span>{r.pos}</span><span className="truncate">{r.name}</span><span className="text-right">{r.toPar}</span><span className="text-right">{r.thru}</span>
            {r.wait && <span className="col-start-2 col-span-3 -mt-0.5 truncate text-[11px] font-normal italic text-slate-400">{r.wait}</span>}
          </div>
        ))}
      </div>
      {b.champion && <p className="mt-2 rounded-lg bg-amber-400/15 px-2 py-1.5 text-xs font-semibold text-amber-200">{b.champion}</p>}
    </div>
  );
}
