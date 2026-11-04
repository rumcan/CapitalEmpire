// T244 (#706): money matches' UI (docs/plans/P28.md section 5): the challenge box on a golfer's card (the talk card: T243's portrait card later), the
// match bar's line (vs whom, the stake, holes up or down, dormie, whose turn, Skip to result), the scorecard's match rows, the result card and a
// rival's return challenge. The engine plays the match (golf/play/match.ts); these only show it and send the clicks.
import { useState } from 'react';
import { MIN_STAKE, STAKE_STEP, firstName, type HoleWin, type MatchView } from '../../game/golf/play/match';
import type { CardRow } from '../../game/golf/play/yours';
import { Icon } from '../Icon';

const money = (n: number) => `$${Math.abs(n).toLocaleString('en-US')}`;
const hcpT = (h: number) => h < 0 ? `+${(-h).toFixed(1)}` : h.toFixed(1);

export interface MatchOffer { name: string; hcp: number; yourHcp: number; purse: number; money: number; max: number; lengths: number[]; rival: string | null; why: string | null; answer: { yes: boolean; line: string } | null }

/** the challenge on a golfer's card: their handicap against yours, 9 or 18 holes, the stake (MIN_STAKE..what both can afford), Challenge; their answer */
export function ChallengeBox({ o, onChallenge }: { o: MatchOffer; onChallenge: (stake: number, holes: number) => void }) {
  const [n, setN] = useState(o.lengths[o.lengths.length - 1] ?? 9);
  const [stake, setStake] = useState(Math.min(o.max || MIN_STAKE, 50));
  const f = firstName(o.name), d = o.yourHcp - o.hcp;
  return (
    <div className="space-y-1.5 rounded-lg border border-amber-300/30 bg-amber-400/5 p-2 text-xs" data-testid="match-offer">
      <div className="flex items-baseline justify-between">
        <span className="font-semibold text-amber-200">Money match</span>
        <span className="text-slate-400">Handicap <b className="text-white">{hcpT(o.hcp)}</b> · you {hcpT(o.yourHcp)}</span>
      </div>
      <div className="text-[11px] text-slate-400">{Math.abs(d) < 2 ? 'An even match.' : d > 0 ? `${f} is the better golfer by about ${Math.round(d)} shots.` : `You are the better golfer by about ${Math.round(-d)} shots.`} Level match play, no strokes given.{o.rival ? <> · <span className="text-sky-200" data-testid="match-rival">{o.rival}</span></> : null}</div>
      {o.answer && <p className={`rounded px-2 py-1 italic ${o.answer.yes ? 'bg-emerald-400/10 text-emerald-200' : 'bg-rose-400/10 text-rose-200'}`} data-testid="match-answer">"{o.answer.line}"</p>}
      {o.why ? <div className="text-slate-400" data-testid="match-why">{o.why}</div> : <>
        <div className="flex items-center gap-1">
          <span className="text-slate-400">Holes:</span>
          {o.lengths.map(L => <button key={L} className={`chip px-2 py-0.5 text-[11px] ${n === L ? 'chip-on' : ''}`} onClick={() => setN(L)} data-testid={`match-holes-${L}`}>{L}</button>)}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-slate-400">Stake:</span>
          <input type="range" min={MIN_STAKE} max={o.max} step={STAKE_STEP} value={Math.min(stake, o.max)} onChange={e => setStake(Number(e.target.value))} className="flex-1 accent-amber-300" data-testid="match-stake" />
          <b className="w-14 text-right tabular-nums text-white" data-testid="match-stake-val">{money(Math.min(stake, o.max))}</b>
        </div>
        <div className="text-[11px] text-slate-500">Up to {money(o.max)}: you have {money(o.money)}, {f} carries {money(o.purse)}.</div>
        <button className="btn-gold w-full py-1 text-xs" onClick={() => onChallenge(Math.min(stake, o.max), n)} data-testid="match-challenge"><Icon name="trophy" size={14} />Challenge {f}: {n} holes for {money(Math.min(stake, o.max))}</button>
      </>}
    </div>
  );
}

/** the match bar's line (inside the round bar): vs whom, the stake, the state (2 up thru 7, dormie), whose turn, Skip to result */
export function MatchStrip({ m, onSkip }: { m: MatchView; onSkip: () => void }) {
  const f = firstName(m.name), s = m.score, tone = s.up > 0 ? 'bg-emerald-500/25 text-emerald-100' : s.up < 0 ? 'bg-rose-500/25 text-rose-100' : 'bg-white/10 text-white';
  return (
    <div className="flex w-full flex-wrap items-center gap-2 border-b border-white/10 pb-1" data-testid="match-bar">
      <span className="font-semibold text-amber-200">Money match vs {m.name}</span>
      <span className="text-slate-400">({hcpT(m.hcp)}) · {money(m.stake)}</span>
      <span className={`rounded px-1.5 py-0.5 font-semibold tabular-nums ${tone}`} data-testid="match-state">{s.dormie ? s.short : s.text}</span>
      <span className="flex gap-0.5" title="Each hole: won (green), halved (grey), lost (red)">{m.res.map((w, k) => <i key={k} className={`h-2 w-2 rounded-full ${w === 1 ? 'bg-emerald-400' : w === -1 ? 'bg-rose-400' : 'bg-slate-400'}`} />)}</span>
      <span className="text-slate-300" data-testid="match-turn">{m.turn === 'opp' ? `${f} to play (${m.oppStrokes} so far)` : m.turn === 'you' ? `Your shot · ${f} ${m.oppHoled ? `holed in ${m.oppStrokes}` : `on ${m.oppStrokes}`}` : ''}</span>
      <button className="chip ml-auto" onClick={onSkip} data-testid="match-skip" data-tip="The rest of the match played by the model for both of you: straight to the result"><Icon name="forward2" size={14} />Skip to result</button>
    </div>
  );
}

/** the scorecard's match rows for a block of holes: their score and each hole's result (W won, H halved, L lost) */
export function MatchRows({ rows, from, m, cell }: { rows: CardRow[]; from: number; m: { name: string; res: readonly HoleWin[]; ocard: readonly number[] }; cell: string }) {
  const res = rows.map((_, k) => m.res[from + k]), oc = rows.map((_, k) => m.ocard[from + k]);
  const w = res.filter(x => x === 1).length, l = res.filter(x => x === -1).length;
  return (<>
    <tr className="text-orange-200"><th className="pr-2 text-left font-medium">{firstName(m.name)}</th>{oc.map((o, k) => <td key={k} className={cell}>{res[k] !== undefined ? o || '-' : ''}</td>)}<td className={`${cell} w-10`} /></tr>
    <tr className="text-slate-300" data-testid="card-match"><th className="pr-2 text-left font-medium">Match</th>{res.map((x, k) => <td key={k} className={`${cell} font-semibold ${x === 1 ? 'text-emerald-300' : x === -1 ? 'text-rose-300' : 'text-slate-400'}`}>{x === 1 ? 'W' : x === -1 ? 'L' : x === 0 ? 'H' : ''}</td>)}<td className={`${cell} w-10 text-[10px]`}>{w}-{l}</td></tr>
  </>);
}

/** the result card: who won and by how much, the money, the reputation, your record against them now */
export function MatchResultCard({ r, onClose }: { r: { name: string; text: string; result: 'w' | 'l' | 'h'; stake: number; money: number; rep: number; res: HoleWin[]; card: CardRow[]; ocard: number[]; rival: string }; onClose: () => void }) {
  const head = r.result === 'w' ? 'You won the match' : r.result === 'l' ? `${firstName(r.name)} won the match` : 'Match halved';
  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center p-4">
      <div className="pointer-events-auto w-[420px] max-w-full space-y-3 rounded-2xl border border-white/10 bg-slate-950/92 p-4 text-slate-200 shadow-2xl backdrop-blur" data-testid="match-result">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-400/80">Money match · vs {r.name}</div>
            <div className={`font-display text-2xl font-bold ${r.result === 'w' ? 'text-emerald-300' : r.result === 'l' ? 'text-rose-300' : 'text-[var(--gold-hi)]'}`}>{head}</div>
          </div>
          <button className="btn-icon" onClick={onClose} title="Close"><Icon name="close" size={18} /></button>
        </div>
        <p className="text-sm text-slate-200">{r.text}</p>
        <div className="flex flex-wrap gap-1">{r.res.map((w, k) => <span key={k} title={`Hole ${r.card[k]?.n}: ${r.card[k]?.up ? '-' : r.card[k]?.strokes} to ${r.ocard[k] || '-'}`} className={`rounded px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${w === 1 ? 'bg-emerald-500/25 text-emerald-100' : w === -1 ? 'bg-rose-500/25 text-rose-100' : 'bg-white/10 text-slate-300'}`}>{r.card[k]?.n}</span>)}</div>
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-lg bg-white/5 p-2"><div className="text-slate-400">Money</div><b className={`text-base ${r.money > 0 ? 'text-emerald-300' : r.money < 0 ? 'text-rose-300' : 'text-white'}`} data-testid="match-result-money">{r.money > 0 ? '+' : r.money < 0 ? '-' : ''}{money(r.money)}</b></div>
          <div className="rounded-lg bg-white/5 p-2"><div className="text-slate-400">Reputation</div><b className="text-base text-white">{r.rep > 0 ? `+${r.rep}` : '±0'}</b></div>
          <div className="rounded-lg bg-white/5 p-2"><div className="text-slate-400">Your record</div><b className="text-[11px] text-sky-200">{r.rival.replace('You ', '')}</b></div>
        </div>
        <p className="text-[11px] text-slate-500">{firstName(r.name)} will remember this: a rival may ask for a rematch on a later day.</p>
        <button className="btn-gold w-full py-1.5 text-sm" onClick={onClose} data-testid="match-result-ok">Done</button>
      </div>
    </div>
  );
}

/** a rival's return challenge (a card at the side): who, the stake, the holes, your record; Accept starts the match, Decline lets it go */
export function ReturnChallengeCard({ c, right, onAnswer }: { c: { name: string; stake: number; holes: number; rival: string; why: string | null }; right: string; onAnswer: (yes: boolean) => void }) {
  return (
    <div className={`pointer-events-auto absolute ${right} top-[calc(var(--hud-top,6rem)+3rem)] z-20 w-[300px] space-y-2 rounded-xl border border-amber-300/30 bg-slate-950/90 p-3 text-slate-200 shadow-2xl backdrop-blur`} data-testid="return-challenge">
      <div className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-400/80">A challenge</div>
      <div className="font-semibold text-amber-100">{c.name} wants a rematch</div>
      <p className="text-sm text-slate-300">{c.holes} holes of match play for <b className="text-white">{money(c.stake)}</b>.{c.rival ? <span className="text-sky-200"> {c.rival}</span> : null}</p>
      {c.why && <div className="text-xs text-slate-400">{c.why}</div>}
      <div className="flex gap-2">
        <button className="btn-gold flex-1 py-1 text-xs disabled:opacity-40" disabled={!!c.why} onClick={() => onAnswer(true)} data-testid="return-accept">Accept</button>
        <button className="chip flex-1 justify-center" onClick={() => onAnswer(false)} data-testid="return-decline">Decline</button>
      </div>
    </div>
  );
}
