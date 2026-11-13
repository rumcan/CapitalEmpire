// The monthly statement (jam ticket J3): a small toast at each month end (profit and the net worth change); click it for the full statement:
// income by source, costs by type, interest, emergencies and the net-worth chart. Reads only the MonthReport history (finance.ts).
import { useEffect, useRef, useState } from 'react';
import { GOAL, emergencyTotals, interestToDate, netWorthSeries, statementOf, type Report } from '../../game/golf/reports';
import { emergencyLine } from '../../game/golf/risk';
import { NetWorthChart } from './NetWorthChart';
import { money, onFinlit, signed } from './finevents';

const TOAST_MS = 10_000;

function headline(profit: number): string {
  if (profit > 0) return `You made ${money(profit)} this month.`;
  if (profit < 0) return `You lost ${money(-profit)} this month. Check the costs.`;
  return 'Break-even this month.';
}

function Rows({ rows, tone }: { rows: { name: string; amount: number }[]; tone: string }) {
  if (!rows.length) return <div className="text-xs text-slate-500">Nothing this month.</div>;
  return <>{rows.map(r => <div key={r.name} className="flex justify-between text-xs"><span className="text-slate-300">{r.name}</span><span className={tone}>{money(r.amount)}</span></div>)}</>;
}

export function StatementCard({ history }: { history: readonly Report[] }) {
  const [seen, setSeen] = useState(history.length);
  const [toastAt, setToastAt] = useState<number | null>(null);
  const [full, setFull] = useState<number | null>(null);
  const hist = useRef(history); hist.current = history;

  useEffect(() => {
    if (history.length > seen) {
      setToastAt(history.length - 1);
      const t = window.setTimeout(() => setToastAt(null), TOAST_MS);
      setSeen(history.length);
      return () => window.clearTimeout(t);
    }
    if (history.length < seen) setSeen(history.length); // a different save was loaded
    return undefined;
  }, [history.length, seen]);

  useEffect(() => onFinlit('statement', () => { if (hist.current.length) setFull(hist.current.length - 1); }), []);

  const toast = toastAt !== null ? statementOf(history, toastAt) : null;
  const s = full !== null ? statementOf(history, full) : null;
  const upto = full !== null ? history.slice(0, full + 1) : [];
  const interest = interestToDate(upto), em = emergencyTotals(upto);

  return <>
    {toast && !s && (
      <button type="button" onClick={() => { setFull(toastAt); setToastAt(null); }} aria-live="polite" data-testid="statement-toast"
        className="pointer-events-auto absolute bottom-24 right-3 z-30 w-64 rounded-xl border border-white/10 bg-slate-950/90 p-3 text-left text-slate-200 shadow-xl backdrop-blur hover:border-emerald-400/60">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-300/80">{toast.label} statement</div>
        <div className="text-sm font-semibold text-white">{headline(toast.profit)}</div>
        <div className="text-xs text-slate-400">Net worth {money(toast.netWorth)} ({signed(toast.netWorthChange)}). Click for details.</div>
      </button>
    )}
    {s && full !== null && (
      <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center p-4" data-testid="statement-full">
        <div role="dialog" aria-label={`${s.label} statement`} className="pointer-events-auto max-h-full w-[420px] max-w-full space-y-3 overflow-y-auto rounded-2xl border border-white/10 bg-slate-950/95 p-5 text-slate-200 shadow-2xl backdrop-blur">
          <div className="flex items-center justify-between">
            <button type="button" className="chip px-2 py-0.5 disabled:opacity-30" disabled={full <= 0} onClick={() => setFull(full - 1)} aria-label="Previous month">‹</button>
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-400/80">{s.label} statement</div>
            <button type="button" className="chip px-2 py-0.5 disabled:opacity-30" disabled={full >= history.length - 1} onClick={() => setFull(full + 1)} aria-label="Next month">›</button>
          </div>
          <div className="text-center">
            <div className={`text-2xl font-bold ${s.profit >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{signed(s.profit)}</div>
            <div className="text-xs text-slate-400">profit this month · net worth {money(s.netWorth)} ({signed(s.netWorthChange)})</div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-white/10 bg-white/5 p-2">
              <div className="mb-1 text-[11px] uppercase text-slate-400">Money in · {money(s.incomeTotal)}</div>
              <Rows rows={s.income} tone="text-emerald-300" />
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-2">
              <div className="mb-1 text-[11px] uppercase text-slate-400">Money out · {money(s.costsTotal)}</div>
              <Rows rows={s.costs} tone="text-rose-300" />
            </div>
          </div>
          {(s.building > 0 || s.repaid > 0) && (
            <div className="text-xs text-slate-400">
              Not counted as costs: {s.building > 0 && <>{money(s.building)} spent building (you own it now)</>}{s.building > 0 && s.repaid > 0 && ', '}{s.repaid > 0 && <>{money(s.repaid)} of loans repaid (your debt shrank)</>}.
            </div>
          )}
          <div className="rounded-xl border border-white/10 bg-white/5 p-2 text-xs text-slate-300" data-testid="statement-interest">
            Interest so far: <span className="text-rose-300">{money(interest.paid)} paid</span>, <span className="text-emerald-300">{money(interest.earned)} earned</span>.
            {interest.paid > interest.earned ? ' Borrowing costs more than saving earns: pay debts down when you can.' : ''}
          </div>
          {s.emergencies.map(e => <div key={e.id + e.cost} className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-2 text-xs text-amber-100">{emergencyLine(e)}</div>)}
          {em.count > 0 && <div className="text-xs text-slate-400">Emergencies so far: {em.count}. Insurance paid {money(em.covered)}; you paid {money(em.outOfPocket)}.</div>}
          <NetWorthChart series={netWorthSeries(history)} goal={GOAL.netWorth} />
          <button type="button" className="btn-gold w-full py-2 text-sm" onClick={() => setFull(null)}>Close</button>
        </div>
      </div>
    )}
  </>;
}
