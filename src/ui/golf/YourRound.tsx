// T317 (#903): your own round's UI: the first tee's hole choice (inside the tee card), the round's bar at the top (the hole, the stroke, your lie and the
// distance, the score so far, "Jump to ball", the cart, the scorecard, quit), and the scorecard (strokes, par, to par, putts per hole) that opens between
// holes and at the end. The engine plays the round (golf/play/yours.ts); these only show it and send the clicks.
import { useState } from 'react';
import type { CardRow, HoleChoice, YourRoundView } from '../../game/golf/play/yours';
import { Icon } from '../Icon';

const toPar = (d: number): string => d === 0 ? 'E' : d > 0 ? `+${d}` : `${d}`;
const LIE: Record<string, string> = { tee: 'on the tee', fairway: 'in the fairway', rough: 'in the rough', fescue: 'in the deep grass', bunker: 'in a bunker', green: 'on the green', water: 'in the water', out: 'out of bounds' };

/** the first tee's choice (the owner: "you should be asked if you are playing all the holes"): all of them, the front 9, the back 9, or a pick */
export function HoleChoiceBox({ choices, onStart }: { choices: { options: { id: HoleChoice; label: string; holes: number[] }[]; holes: { i: number; n: number; par: number }[]; why: string | null }; onStart: (c: HoleChoice, picked: number[]) => void }) {
  const [pick, setPick] = useState<number[] | null>(null);
  if (choices.why) return <div className="rounded-lg border border-white/10 bg-white/5 p-2 text-xs text-slate-400" data-testid="tee-play-why">Play a round yourself: {choices.why}</div>;
  return (
    <div className="space-y-1.5 rounded-lg border border-emerald-300/30 bg-emerald-400/5 p-2 text-xs" data-testid="tee-play">
      <div className="font-semibold text-emerald-200">Play a round yourself: which holes?</div>
      {pick === null ? (
        <div className="grid grid-cols-2 gap-1">
          {choices.options.map(o => (
            <button key={o.id} className={`chip justify-center ${o.id === 'all' ? 'chip-on' : ''}`} data-testid={`tee-play-${o.id}`}
              onClick={() => (o.id === 'pick' ? setPick([]) : onStart(o.id, []))}>{o.label}</button>
          ))}
        </div>
      ) : (
        <div className="space-y-1.5">
          <div className="grid grid-cols-6 gap-1" data-testid="tee-pick-grid">
            {choices.holes.map(h => (
              <button key={h.i} title={`Hole ${h.n}, par ${h.par}`} data-testid={`tee-pick-${h.i}`}
                className={`rounded border px-1 py-0.5 tabular-nums ${pick.includes(h.i) ? 'border-amber-300 bg-amber-300/20 text-white' : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'}`}
                onClick={() => setPick(p => p!.includes(h.i) ? p!.filter(x => x !== h.i) : [...p!, h.i])}>{h.n}</button>
            ))}
          </div>
          <div className="flex justify-between gap-1">
            <button className="chip" onClick={() => setPick(null)}>Back</button>
            <button className="chip chip-on disabled:opacity-40" disabled={!pick.length} onClick={() => onStart('pick', pick)} data-testid="tee-pick-go">Play {pick.length} hole{pick.length === 1 ? '' : 's'}</button>
          </div>
        </div>
      )}
      <p className="text-[11px] text-slate-500">You walk or drive your cart to each ball; near it you address it and swing (the 3-click meter).</p>
    </div>
  );
}

/** the round's bar (top centre): where you are in the round, the score so far, and the buttons */
export function RoundBar({ v, onJump, onCart, onCallCart, onCard, onQuit }: { v: YourRoundView; onJump: () => void; onCart: () => void; onCallCart: () => void; onCard: () => void; onQuit: () => void }) {
  const t = v.totals, r = v.round;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[calc(var(--hud-top,6rem)+2.75rem)] z-20 flex justify-center px-3">
      <div className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-slate-950/85 px-3 py-1.5 text-xs text-slate-200 shadow-xl backdrop-blur" data-testid="round-bar">
        <span className="font-display font-bold text-[var(--gold-hi)]">Hole {v.hole}</span>
        <span className="tabular-nums text-slate-300">Par {v.par} · {r.holed ? 'holed' : `stroke ${v.stroke}`}{!r.holed && !r.over ? ` · ${Math.round(v.distM)} m to the pin, ${LIE[v.lie] ?? v.lie}` : ''}</span>
        <span className="rounded bg-white/10 px-1.5 py-0.5 font-semibold tabular-nums text-white" data-testid="round-score">{t.thru ? `${toPar(t.toPar)} thru ${t.thru}` : 'E'}</span>
        {v.canJump && <button className="btn-gold px-2 py-0.5 text-xs" onClick={onJump} data-testid="you-jump" data-tip="Skip the trip: you are at your ball, addressing it"><Icon name="forward2" size={14} />Jump to ball</button>}
        {(v.inCart || v.nearCart) && !v.addressing && <button className="chip" onClick={onCart} data-testid="you-cart">{v.inCart ? 'Get out (E)' : 'Get in the cart (E)'}</button>}
        {v.cartFar && <button className="chip" onClick={onCallCart} data-testid="you-cart-call" data-tip="Your cart drives to you (C); then E gets in"><Icon name="compass" size={14} />Cart (C)</button>}
        <button className="chip" onClick={onCard} data-testid="round-card-btn">Scorecard</button>
        <button className="chip" onClick={onQuit} title="Stop your round here: the holes done go into your rounds" data-testid="round-quit">Quit</button>
      </div>
    </div>
  );
}

/** a block of the scorecard: up to nine holes across (hole, par, score, putts), with its total */
function CardBlock({ rows, label, at }: { rows: CardRow[]; label: string; at: number }) {
  const done = rows.filter(r => r.done), sum = (f: (r: CardRow) => number) => done.reduce((a, r) => a + f(r), 0);
  const cell = 'w-8 px-0.5 py-0.5 text-center tabular-nums';
  const mark = (r: CardRow) => { const d = r.strokes - r.par; return !r.done ? '' : d <= -2 ? 'rounded-full ring-2 ring-amber-300' : d === -1 ? 'rounded-full ring-1 ring-amber-300' : d === 1 ? 'ring-1 ring-sky-300' : d >= 2 ? 'ring-2 ring-sky-300' : ''; };
  return (
    <table className="text-xs">
      <tbody>
        <tr className="text-slate-400"><th className="pr-2 text-left font-medium">Hole</th>{rows.map((r, k) => <td key={k} className={`${cell} ${k === at ? 'text-amber-300' : ''}`}>{r.n}</td>)}<td className={`${cell} w-10 font-semibold`}>{label}</td></tr>
        <tr className="text-slate-400"><th className="pr-2 text-left font-medium">Par</th>{rows.map((r, k) => <td key={k} className={cell}>{r.par}</td>)}<td className={`${cell} w-10`}>{rows.reduce((a, r) => a + r.par, 0)}</td></tr>
        <tr className="text-white"><th className="pr-2 text-left font-medium text-slate-300">Score</th>{rows.map((r, k) => <td key={k} className={cell}><span className={`inline-block min-w-[1.4rem] ${mark(r)}`}>{r.done ? r.strokes : ''}{r.up ? '*' : ''}</span></td>)}<td className={`${cell} w-10 font-semibold`}>{done.length ? sum(r => r.strokes) : ''}</td></tr>
        <tr className="text-slate-300"><th className="pr-2 text-left font-medium">Putts</th>{rows.map((r, k) => <td key={k} className={cell}>{r.done || r.putts ? r.putts : ''}</td>)}<td className={`${cell} w-10`}>{done.length ? sum(r => r.putts) : ''}</td></tr>
      </tbody>
    </table>
  );
}

/** the scorecard (the owner: "it should keep score"): the holes in blocks of nine, the totals and to par; between holes "Next hole", at the end "Done" */
export function ScoreCard({ v, onNext, onDone, onClose }: { v: YourRoundView; onNext: () => void; onDone: () => void; onClose: () => void }) {
  const r = v.round, t = v.totals, blocks: CardRow[][] = [];
  for (let k = 0; k < r.card.length; k += 9) blocks.push(r.card.slice(k, k + 9));
  const next = r.holed && !r.over ? r.card[r.at + 1] : undefined;
  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center p-4">
      <div className="pointer-events-auto max-w-full space-y-3 rounded-2xl border border-white/10 bg-slate-950/92 p-4 text-slate-200 shadow-2xl backdrop-blur" data-testid="scorecard">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-400/80">Your round · scorecard</div>
            <div className="font-display text-xl font-bold text-[var(--gold-hi)]">{r.over ? 'Round over' : r.holed ? `Hole ${v.hole} done` : `Hole ${v.hole}, stroke ${v.stroke}`}</div>
          </div>
          {!r.holed && !r.over && <button className="btn-icon" onClick={onClose} title="Close"><Icon name="close" size={18} /></button>}
        </div>
        <div className="space-y-2">{blocks.map((b, k) => <CardBlock key={k} rows={b} label={blocks.length > 1 ? (k === 0 ? 'Out' : 'In') : 'Tot'} at={r.at - k * 9} />)}</div>
        <div className="flex flex-wrap items-baseline justify-between gap-3 border-t border-white/10 pt-2 text-sm" data-testid="scorecard-total">
          <span>Total <b className="text-white tabular-nums">{t.strokes}</b> · par {t.par} · <b className="text-white">{toPar(t.toPar)}</b> · {t.putts} putts · thru {t.thru} of {t.holes}</span>
          <span className="text-[11px] text-slate-500">◯ birdie or better · ▢ bogey or worse · * picked up</span>
        </div>
        <div className="flex justify-end gap-2">
          {next && <button className="btn-gold px-3 py-1.5 text-sm" onClick={onNext} data-testid="round-next"><Icon name="play" size={16} />Next hole: {next.n} (par {next.par})</button>}
          {r.over && <button className="btn-gold px-3 py-1.5 text-sm" onClick={onDone} data-testid="round-done">Done: into your rounds</button>}
        </div>
      </div>
    </div>
  );
}
