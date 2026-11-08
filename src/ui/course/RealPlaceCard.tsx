// T356 (#998): placing a real course into the game you are playing. While a course is in hand a small card sits over the map: its name, the turn, what the
// pose under the pointer costs (green when it may go and the money holds, red with the reason or the shortfall when not), buttons to turn it and put it
// down. A click on the map asks, and the pop-up lists what goes (the land bought, the buildings and roads taken down, the price line by line); Place it
// lays the course, Cancel leaves everything as it was. The owner (2026-11-08): "Add a notification pop up and tell the user that, that will happen."
import type { Game } from '../../game/engine';
import { goesPhrase, money } from '../../game/golf/osm/place';
import { Icon } from '../Icon';

/** the card while a course is in hand (hidden while the pop-up is open) */
export function RealPlaceHud({ game }: { game: Game }) {
  const v = game.realView();
  if (!v || v.popup) return null;
  const bad = !!v.label?.bad;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-6 z-20 flex justify-center px-3" data-testid="real-place-hud">
      <div className="pointer-events-auto flex max-w-[31rem] flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl border border-white/10 bg-slate-950/90 px-4 py-2 text-slate-200 shadow-2xl backdrop-blur">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-sky-200">Placing {v.name} <span className="font-normal text-slate-400">(from map data{v.place ? ` · ${v.place}` : ''})</span></div>
          <div className={`text-xs font-semibold ${bad ? 'text-red-300' : 'text-emerald-300'}`} data-testid="real-place-verdict">{v.label ? v.label.text : 'Move over the map to place it'}</div>
          {v.plan && v.plan.fits && <div className="text-[11px] text-slate-300" data-testid="real-place-takes">{v.plan.land.ha >= 10 ? Math.round(v.plan.land.ha) : v.plan.land.ha} ha of land{goesPhrase(v.plan) ? `, takes ${goesPhrase(v.plan)}` : ', nothing in the way'}{v.plan.orphans.keys.length ? ` (${v.plan.orphans.keys.length} left with no road)` : ''}</div>}
          <div className="text-[11px] text-slate-400">R turns it 15° (Shift+R back, Alt for any angle) · Shift+wheel turns it · click to place · Esc puts it down</div>
        </div>
        <div className="flex items-center gap-1.5">
          <button className="btn-icon" title="Turn it left 15° (Shift+R)" aria-label="Turn left" data-testid="real-turn-left" onClick={() => game.real.turn(-1)}><Icon name="rewind" size={18} /></button>
          <div className="w-12 text-center text-sm tabular-nums" data-testid="real-place-deg">{Math.round(v.deg * 10) / 10}°</div>
          <button className="btn-icon" title="Turn it right 15° (R)" aria-label="Turn right" data-testid="real-turn-right" onClick={() => game.real.turn(1)}><Icon name="forward2" size={18} /></button>
          <button className="btn-icon ml-1" title="Put it down (Esc)" aria-label="Put it down" data-testid="real-place-cancel-hud" onClick={() => game.real.cancel()}><Icon name="close" size={18} /></button>
        </div>
      </div>
    </div>
  );
}

/** one line of the sum */
function Row({ label, amount, strong }: { label: string; amount: number; strong?: boolean }) {
  return <div className={`flex items-baseline justify-between gap-4 ${strong ? 'border-t border-white/10 pt-1 font-semibold text-slate-100' : 'text-slate-300'}`}><span>{label}</span><span className="tabular-nums">{money(amount)}</span></div>;
}

/** what the click asked: the pop-up with the sentence the owner asked for, the price line by line, Place it and Cancel */
export function RealPlaceDialog({ game }: { game: Game }) {
  const v = game.realView();
  if (!v?.popup) return null;
  const { plan, text, lines, replaces } = v.popup;
  const have = game.money;
  return (
    <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center p-4">
      <div className="pointer-events-auto w-[460px] max-w-full space-y-3 rounded-2xl border border-white/10 bg-slate-950/95 p-5 text-slate-200 shadow-2xl backdrop-blur" role="dialog" aria-label={`Place ${v.name}`} data-testid="real-place-card">
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-400/80">Place a real course</div>
        <div className="font-display text-xl font-bold leading-tight text-[var(--gold-hi)]">{v.name} <span className="text-sm font-normal text-slate-400">{Math.round(v.deg * 10) / 10 ? `turned ${Math.round(v.deg * 10) / 10}°` : ''}</span></div>
        <p className="text-sm leading-snug text-slate-100" data-testid="real-place-text">{text}</p>
        {replaces > 0 && <p className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-2 py-1.5 text-xs text-amber-100" data-testid="real-place-replaces">Your {replaces} hole{replaces === 1 ? '' : 's'} {replaces === 1 ? 'is' : 'are'} replaced by its {v.holes}. The land they stand on stays yours.</p>}
        {plan.props > 0 && <p className="text-xs text-slate-400">{plan.props} placed item{plan.props === 1 ? '' : 's'} on the land go with it, for nothing.</p>}
        {v.scale < 1 && <p className="text-xs text-amber-200/80">Scaled to {Math.round(v.scale * 100)}% to fit the 2 km map: its holes are that much shorter.</p>}
        <div className="space-y-1 rounded-xl border border-white/10 bg-white/5 p-3 text-sm" data-testid="real-place-sum">
          {lines.map(l => <Row key={l.label} label={l.label} amount={l.amount} />)}
          <Row label="Total" amount={plan.total} strong />
          {Number.isFinite(have) && <div className="flex justify-between gap-4 text-xs text-slate-400"><span>You have</span><span className="tabular-nums">{money(have)}</span></div>}
        </div>
        <div className="text-[11px] text-slate-500">{v.credit}</div>
        <div className="flex gap-2">
          <button className="btn-gold flex-1 py-2 text-sm" data-testid="real-place-go" onClick={() => { game.real.confirm(); }}><Icon name="trophy" size={18} />Place it</button>
          <button className="chip flex-1 justify-center py-2 text-sm" data-testid="real-place-cancel" onClick={() => game.real.closePopup()}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
