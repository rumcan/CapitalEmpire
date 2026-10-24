// The season card of a range start's founding season (plan P22 2.5.3, T088): a season that ends with no tournament shows this short card in place of
// the results: the season's takings, the residents and the tour's invitation checklist. One button, Continue; the clock never stops for it.
import type { SeasonReport } from '../../game/engine';
import { Icon } from '../Icon';

const money = (n: number) => '$' + Math.round(n).toLocaleString();
const tick = (ok: boolean) => <span className={ok ? 'text-emerald-400' : 'text-rose-400'}>{ok ? '✓' : '✗'}</span>;

/** the card over the map (centred, like the results screen) */
export function SeasonReportCard({ report, onContinue }: { report: SeasonReport; onContinue: () => void }) {
  const c = report.check;
  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center p-4">
      <div className="pointer-events-auto w-[420px] max-w-full space-y-3 rounded-2xl border border-white/10 bg-slate-950/90 p-5 text-slate-200 shadow-2xl backdrop-blur">
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-400/80">Founding season · {report.year}</div>
        <p className="text-sm text-slate-300">
          {report.invited ? 'The tour invited you too late for this season: your first tournament closes the next one.' : 'No tournament this year: the tour has not invited you yet.'}
        </p>
        <div className="grid grid-cols-2 gap-2 text-center">
          <div className="rounded-xl border border-white/10 bg-white/5 p-2">
            <div className="text-[10px] uppercase text-slate-400">Range takings</div>
            <div className="text-base font-bold text-emerald-300">{money(report.takings)}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-2">
            <div className="text-[10px] uppercase text-slate-400">Residents</div>
            <div className="text-base font-bold text-white">{report.residents.toLocaleString()}</div>
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs">
          <div className="mb-1 text-[10px] uppercase text-slate-400">The tour's invitation</div>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            <span>{Math.min(c.holes, c.holesNeeded)} of {c.holesNeeded} holes {tick(c.holes >= c.holesNeeded)}</span>
            <span>car park {tick(c.carpark)}</span>
            <span>clubhouse {tick(c.clubhouse)}</span>
          </div>
        </div>
        <button className="btn-gold w-full py-2 text-sm" onClick={onContinue}><Icon name="start" size={18} />Continue</button>
      </div>
    </div>
  );
}
