// The owner's shot panel (docs/GOLF-PLAY.md decision 7, P4b): open while his shot is due (the game is paused for it). The hole, par and stroke, the distance
// to the pin in metres and yards, his lie, the clubs his lie allows (the suggested one first in the list's state), the power, the hint, and Hit or the
// caddie's finish. It sits bottom centre and reads game.shotState(); App mounts it while a shot is open.
import type { Game } from '../game/engine';
import { POWER, PUTT_POWER, allowedClubs, type Club, type Lie } from '../game/golf/play';

/** the clubs as the panel names them */
const CLUB_NAME: Record<Club, string> = { driver: 'Driver', wood3: '3-wood', iron4: '4-iron', iron6: '6-iron', iron8: '8-iron', pw: 'Pitching wedge', sw: 'Sand wedge', putter: 'Putter' };
/** the lies as the panel names them */
const LIE_NAME: Record<Lie, string> = { tee: 'Tee', fairway: 'Fairway', rough: 'Rough', fescue: 'Fescue', bunker: 'Bunker', green: 'Green', water: 'Water', out: 'Out of bounds' };
/** yards per metre */
const YARDS = 1.09361;

/** the shot panel: nothing with no shot open */
export function ShotPanel({ game }: { game: Game }) {
  const s = game.shotState();
  if (!s) return null;
  const t = s.turn, i = s.input, putting = i.club === 'putter', range = putting ? PUTT_POWER : POWER, clubs = allowedClubs(t.lie, t.lie === 'tee');
  // where 100% sits on the slider (a putt's 100% is its full length to the pin, at the middle of its 50% to 150%)
  const full = ((1 - range[0]!) / (range[1]! - range[0]!)) * 100;
  return (
    <div className="pointer-events-auto absolute bottom-[calc(var(--foot-top,0px)+0.75rem)] left-1/2 z-20 w-[26rem] max-w-[calc(100vw-1.5rem)] -translate-x-1/2 glass p-3 text-slate-200">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-display text-sm font-bold tracking-wide text-[var(--gold-hi)] uppercase">Your shot</span>
        <span className="text-xs tabular-nums text-slate-300">Hole {t.hole} · Par {t.par} · Stroke {t.stroke}</span>
      </div>
      <p className="mt-1 text-xs tabular-nums text-slate-300">{Math.round(t.distM)} m ({Math.round(t.distM * YARDS)} yd) to the pin · {LIE_NAME[t.lie]}</p>
      <div className="mt-2 flex flex-wrap gap-1">
        {clubs.map(c => <button key={c} className={`chip ${c === i.club ? 'chip-on' : ''}`} onClick={() => game.setShotClub(c)}>{CLUB_NAME[c]}</button>)}
      </div>
      <label className="mt-3 block text-xs">
        <span className="flex justify-between tabular-nums"><span>Power</span><span>{Math.round(i.power * 100)}%</span></span>
        <span className="relative block">
          <input type="range" className="w-full" min={range[0]} max={range[1]} step={0.01} value={i.power} onChange={e => game.setShotPower(+e.target.value)} />
          <span className="pointer-events-none absolute -top-1 h-3 w-px bg-amber-300" style={{ left: `${full}%` }} />
        </span>
      </label>
      <p className="mt-1 text-[12px] text-slate-400">Click the course to aim{putting ? ' (the putt runs the full distance at 100%)' : ''}.</p>
      <div className="mt-3 flex justify-end gap-2">
        <button className="btn" onClick={() => game.ownerCaddie()}>Let the caddie finish</button>
        <button className="btn-gold" onClick={() => game.ownerHit()}>Hit</button>
      </div>
    </div>
  );
}
