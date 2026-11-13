// Money moments (jam ticket J3): a one-line lesson the first time something happens to the player's club (a first loan, a first emergency, a first
// profit...). Dismissible, shown once each: the ids are kept on finance.moments, which the save carries. Teaches by what just happened, not by a lecture.
import { useEffect, useRef, useState } from 'react';
import { MOMENTS, pendingMoments, type Report } from '../../game/golf/reports';
import { onFinlit } from './finevents';

/** the slice of the finance save this reads (finance.ts FinanceSave) and writes (`moments`) */
export interface MomentsFinance { loans: readonly unknown[]; history: readonly Report[]; moments: string[] }

export function MoneyMoments({ finance, cash }: { finance: MomentsFinance; cash: number }) {
  const [now, setNow] = useState<string | null>(null);
  const queue = useRef<string[]>([]);
  const fin = useRef(finance); fin.current = finance;

  const pump = () => {
    if (now !== null) return;
    const id = queue.current.shift();
    if (!id) return;
    if (!fin.current.moments.includes(id)) { fin.current.moments.push(id); setNow(id); } else pump();
  };

  const key = `${finance.history.length}|${finance.loans.length}|${cash < 0 ? 1 : 0}|${finance.moments.length}`;
  useEffect(() => {
    for (const id of pendingMoments(fin.current, cash)) if (!queue.current.includes(id)) queue.current.push(id);
    pump();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, now]);

  useEffect(() => onFinlit<string>('moment', id => {
    if (!MOMENTS[id] || fin.current.moments.includes(id) || queue.current.includes(id)) return;
    queue.current.push(id); pump();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [now]);

  useEffect(() => {
    if (now === null) return undefined;
    const t = window.setTimeout(() => setNow(null), 24_000);
    return () => window.clearTimeout(t);
  }, [now]);

  if (now === null) return null;
  return (
    <div role="status" aria-live="polite" data-testid="money-moment"
      className="pointer-events-auto absolute bottom-3 left-1/2 z-30 flex max-w-[min(34rem,calc(100%-1.5rem))] -translate-x-1/2 items-start gap-2 rounded-xl border border-amber-400/40 bg-slate-950/90 px-3 py-2 text-sm text-slate-100 shadow-xl backdrop-blur">
      <span aria-hidden className="mt-0.5 text-amber-300">$</span>
      <span className="flex-1">{MOMENTS[now]}</span>
      <button type="button" className="chip px-2 py-0.5 text-xs" onClick={() => setNow(null)} aria-label="Dismiss">Got it</button>
    </div>
  );
}
