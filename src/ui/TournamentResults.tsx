// Golf tournament results screen view component (docs/GOLF-PLAN.md sections 2.3, 5.4, 7, and 8.1). React presentational component.
import type { TournamentDayScore } from '../game/golf/tournamentday';
import { trendKind, withIcon } from './status-icon';
import { tierInfo } from '../game/golf/tour';

/** format currency with explicit sign for net results */
export function formatResultMoney(amount: number, explicitPlus = false): string {
  const rounded = Math.round(amount);
  const abs = Math.abs(rounded).toLocaleString('en-US');
  if (rounded < 0) return `-$${abs}`;
  if (rounded > 0 && explicitPlus) return `+$${abs}`;
  return `$${abs}`;
}

/** format percentage from 0..100 */
export function formatPercent(score: number): string {
  return `${Math.round(score)}%`;
}

/** rating label and text color for a day satisfaction score */
export function satisfactionBadge(score: number): { label: string; text: string; bg: string } {
  if (score >= 85) return { label: 'Outstanding', text: 'text-emerald-300', bg: 'bg-emerald-500/20 border-emerald-500/40' };
  if (score >= 70) return { label: 'Good', text: 'text-sky-300', bg: 'bg-sky-500/20 border-sky-500/40' };
  if (score >= 55) return { label: 'Average', text: 'text-amber-300', bg: 'bg-amber-500/20 border-amber-500/40' };
  return { label: 'Poor', text: 'text-rose-300', bg: 'bg-rose-500/20 border-rose-500/40' };
}

/** reputation shift label and indicator */
export function repDelta(prev: number, next: number): { label: string; text: string; positive: boolean } {
  const diff = Math.round(next - prev);
  if (diff > 0) return { label: `+${diff}`, text: 'text-emerald-400', positive: true };
  if (diff < 0) return { label: `${diff}`, text: 'text-rose-400', positive: false };
  return { label: '0', text: 'text-slate-400', positive: true };
}

/** props for TournamentResults screen */
export interface TournamentResultsProps {
  score: TournamentDayScore;
  tier: number;
  year: number;
  prevReputation: number;
  onContinue?: () => void;
}

/** presentational results modal showing crowd arrival/exit, satisfaction, reputation shift, and itemized financial ledger */
export function TournamentResults({ score, tier, year, prevReputation, onContinue }: TournamentResultsProps) {
  const tInfo = tierInfo(tier);
  const sat = satisfactionBadge(score.satisfaction);
  const repChange = repDelta(prevReputation, score.reputationAfter);
  const m = score.money;

  return (
    <div className="pointer-events-auto max-h-[90vh] w-[560px] max-w-full space-y-3 overflow-y-auto rounded-2xl border border-white/10 bg-slate-950/90 p-5 text-slate-200 shadow-2xl backdrop-blur">
      <div className="flex items-center justify-between border-b border-white/10 pb-3">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.2em] text-amber-400">Tournament Results</div>
          <div className="text-lg font-bold text-white">{tInfo.name} ({year})</div>
          <div className="text-xs text-slate-400">Tier {tier} Championship</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase text-slate-400">Day Satisfaction</div>
          <div className={`text-base font-bold ${sat.text}`}>{formatPercent(score.satisfaction)}</div>
          <div className="text-[10px] text-slate-400">{sat.label}</div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 text-center text-xs">
        <div className="rounded-lg bg-white/5 p-2">
          <div className="text-[10px] uppercase text-slate-400">Admitted</div>
          <div className="text-sm font-bold text-white">{score.admitted.toLocaleString()}</div>
          <div className="text-[10px] text-slate-400">{score.facts.onTime.toLocaleString()} on time</div>
        </div>
        <div className="rounded-lg bg-white/5 p-2">
          <div className="text-[10px] uppercase text-slate-400">Late / Missed</div>
          <div className="text-sm font-bold text-amber-300">{score.facts.late} late</div>
          <div className="text-[10px] text-rose-400">{score.facts.missed} missed</div>
        </div>
        <div className="rounded-lg bg-white/5 p-2">
          <div className="text-[10px] uppercase text-slate-400">Exit P95</div>
          <div className="text-sm font-bold text-white">{Math.round(score.facts.exitP95Min)} min</div>
          <div className="text-[10px] text-slate-400">Queue: {score.facts.avgQueueMin.toFixed(1)}m</div>
        </div>
        <div className="rounded-lg bg-white/5 p-2">
          <div className="text-[10px] uppercase text-slate-400">Reputation</div>
          <div className="text-sm font-bold text-white">
            {prevReputation} → <span className={repChange.text}>{score.reputationAfter}</span>
          </div>
          <div className={`text-[10px] font-semibold ${repChange.text}`}>{repChange.label} shift</div>
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs">
        <div className="mb-2 font-semibold text-slate-300">Financial Ledger</div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="mb-1 text-[10px] font-bold uppercase text-emerald-400">Revenue</div>
            <div className="space-y-1 text-slate-300">
              <div className="flex justify-between">
                <span>Ticket Sales ({tInfo.ticket > 0 ? `$${tInfo.ticket}/ea` : 'Free'}):</span>
                <span className="tabular-nums font-medium text-white">{formatResultMoney(m.tickets)}</span>
              </div>
              <div className="flex justify-between">
                <span>Parking Fees:</span>
                <span className="tabular-nums font-medium text-white">{formatResultMoney(m.parking)}</span>
              </div>
              <div className="flex justify-between">
                <span>Tents & Merchandise:</span>
                <span className="tabular-nums font-medium text-white">{formatResultMoney(m.tents)}</span>
              </div>
              {m.sponsors > 0 && (
                <div className="flex justify-between">
                  <span>Sponsors:</span>
                  <span className="tabular-nums font-medium text-white">{formatResultMoney(m.sponsors)}</span>
                </div>
              )}
              {m.tv > 0 && (
                <div className="flex justify-between">
                  <span>TV Rights:</span>
                  <span className="tabular-nums font-medium text-white">{formatResultMoney(m.tv)}</span>
                </div>
              )}
            </div>
          </div>

          <div>
            <div className="mb-1 text-[10px] font-bold uppercase text-rose-400">Costs</div>
            <div className="space-y-1 text-slate-300">
              <div className="flex justify-between">
                <span>Purse & Sanctioning:</span>
                <span className="tabular-nums text-rose-300">{formatResultMoney(-m.purse)}</span>
              </div>
              {m.refunds > 0 && (
                <div className="flex justify-between">
                  <span>Missed Refunds:</span>
                  <span className="tabular-nums text-rose-300">{formatResultMoney(-m.refunds)}</span>
                </div>
              )}
              {m.rent > 0 && (
                <div className="flex justify-between">
                  <span>Structure Rent:</span>
                  <span className="tabular-nums text-rose-300">{formatResultMoney(-m.rent)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Staff & Operations:</span>
                <span className="tabular-nums text-rose-300">{formatResultMoney(-m.staff)}</span>
              </div>
              {m.upkeep > 0 && (
                <div className="flex justify-between">
                  <span>Upkeep:</span>
                  <span className="tabular-nums text-rose-300">{formatResultMoney(-m.upkeep)}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-2 text-sm font-bold">
          <span>Net Tournament Profit:</span>
          <span className={`text-base tabular-nums ${m.net >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {withIcon(trendKind(m.net), formatResultMoney(m.net, true))}
          </span>
        </div>
      </div>

      {onContinue && (
        <div className="pt-1 text-right">
          <button className="btn chip-on px-5 py-2 font-bold uppercase tracking-wider text-white" onClick={onContinue}>
            Continue to Next Season →
          </button>
        </div>
      )}
    </div>
  );
}
