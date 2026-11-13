// The goal and the report card (jam ticket J3): a small goal chip that always shows the progress toward the two-season goal (9 holes, $250k net
// worth, out of overdraft by the end of season 2), and the report card (grade A to F with the reasons) that opens at the end of season 2 or on demand.
import { useEffect, useRef, useState } from 'react';
import { GOAL, reportCard, goalState, type Live, type Report } from '../../game/golf/reports';
import { money, onFinlit } from './finevents';

const TONE: Record<string, string> = { A: 'text-emerald-300', B: 'text-lime-300', C: 'text-amber-300', D: 'text-orange-300', F: 'text-rose-300' };
const VERDICT: Record<string, string> = {
  A: 'A thriving club, and the money was handled well.',
  B: 'A solid club. A little more cushion or less debt and it is an A.',
  C: 'The club stands, but money decisions held it back.',
  D: 'A hard two seasons. Debt and costs ate the gains.',
  F: 'The club is in trouble. Look at the reasons: each one is a lesson.',
};

/** the always-visible chip: the goal's three parts, and the months left */
export function GoalChip({ history, live }: { history: readonly Report[]; live: Live }) {
  const g = goalState(history, live);
  const bar = (pct: number) => <span className="relative inline-block h-1.5 w-10 overflow-hidden rounded bg-white/15 align-middle"><span className="absolute inset-y-0 left-0 bg-emerald-400" style={{ width: `${Math.round(pct * 100)}%` }} /></span>;
  return (
    <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('finlit:reportcard'))} data-testid="goal-chip"
      title="The goal: by the end of season 2, nine holes and $250,000 net worth, out of overdraft. Click for your report card so far."
      aria-label={`Goal: ${g.holes} of ${g.holesNeed} holes, net worth ${money(g.netWorth)} of ${money(g.netWorthNeed)}, ${g.monthsLeft} months left. Open the report card.`}
      className="pointer-events-auto flex items-center gap-2 rounded-full border border-white/10 bg-slate-950/80 px-3 py-1 text-xs text-slate-200 backdrop-blur hover:border-emerald-400/60">
      <span className="font-semibold text-amber-300">Goal</span>
      <span>{g.holes}/{g.holesNeed} holes {bar(g.holesPct)}</span>
      <span>{money(g.netWorth)}/{money(g.netWorthNeed)} {bar(g.netWorthPct)}</span>
      {g.overdraft && <span className="text-rose-300">overdrawn</span>}
      <span className="text-slate-400">{g.monthsLeft > 0 ? `${g.monthsLeft} mo left` : 'time is up'}</span>
    </button>
  );
}

/** the report card; opens on the event (the chip, the Bank panel) and by itself once, when the 24th month ends */
export function ReportCard({ history, live }: { history: readonly Report[]; live: Live }) {
  const [open, setOpen] = useState(false);
  const autoShown = useRef(history.length >= GOAL.months);
  useEffect(() => onFinlit('reportcard', () => setOpen(true)), []);
  useEffect(() => {
    if (history.length >= GOAL.months && !autoShown.current) { autoShown.current = true; setOpen(true); }
    if (history.length < GOAL.months) autoShown.current = false;
  }, [history.length]);
  if (!open) return null;
  const c = reportCard(history, live);
  return (
    <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center p-4" data-testid="report-card">
      <div role="dialog" aria-label="Report card" className="pointer-events-auto max-h-full w-[420px] max-w-full space-y-3 overflow-y-auto rounded-2xl border border-white/10 bg-slate-950/95 p-5 text-slate-200 shadow-2xl backdrop-blur">
        <div className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-amber-400/80">{c.final ? 'Your two seasons: the report card' : `Report card so far · month ${c.goal.monthsDone} of ${GOAL.months}`}</div>
        <div className="text-center">
          <div className={`text-7xl font-black ${TONE[c.grade]}`} data-testid="report-grade">{c.grade}</div>
          <div className="text-sm text-slate-300">{c.goal.met ? (c.final ? 'Goal reached: a nine-hole club, in the black.' : 'You are over the goal line right now. Keep it there.') : VERDICT[c.grade]}</div>
        </div>
        <ul className="space-y-1.5 text-sm">
          {c.reasons.map(r => <li key={r.text} className="flex gap-2"><span aria-hidden className={r.ok ? 'text-emerald-400' : 'text-rose-400'}>{r.ok ? '✓' : '✗'}</span><span className="sr-only">{r.ok ? 'Good: ' : 'Could be better: '}</span><span>{r.text}</span></li>)}
        </ul>
        <button type="button" className="btn-gold w-full py-2 text-sm" onClick={() => setOpen(false)}>{c.final ? 'Keep playing' : 'Back to the club'}</button>
      </div>
    </div>
  );
}
