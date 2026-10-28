// Course stats panel view component (docs/GOLF-PLAN.md sections 4.2, 5.1 and 8.2). React presentational component.
import type { CourseStatsPanel } from '../game/golf/coursestats';
import { tierInfo } from '../game/golf/tour';
import { Icon } from './Icon';
import { TEE_KINDS, TEE_SET } from '../game/golf/teesets';
import { formatCurrency, formatHoleLength, parColorClass, qualityBadgeClass } from './coursestatsFormat';
export { formatCurrency, formatHoleLength, parColorClass, qualityBadgeClass };
/** props for CourseStatsPanel */
export interface CourseStatsPanelProps {
  stats: CourseStatsPanel;
  onClose?: () => void;
  onSelectHole?: (hole: number) => void;
  /** T188: inside the Season card: no box and size of its own */
  bare?: boolean;
}

/** presentational panel displaying course holes, totals, upkeep, quality hints, and next-tier checklist */
export function CourseStatsPanel({ stats, onClose, onSelectHole, bare }: CourseStatsPanelProps) {
  const tInfo = tierInfo(stats.tier);
  const nextInfo = stats.nextTier !== null ? tierInfo(stats.nextTier) : null;
  const qBadge = qualityBadgeClass(stats.qualityScore);

  return (
    <div className={bare ? 'text-slate-200' : 'glass w-[360px] max-h-[calc(100vh-var(--hud-top,5.75rem)-4rem)] overflow-y-auto rounded-xl border border-white/10 bg-slate-950/85 p-3 text-slate-200 shadow-xl backdrop-blur'}>
      <div className="flex items-center justify-between border-b border-white/10 pb-2">
        <div className="flex items-center gap-2">
          <Icon name="trophy" className="h-4 w-4 text-amber-400" />
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.18em] text-amber-300">Course Stats</div>
            <div className="text-[12px] text-slate-400">{tInfo.name} (Tier {stats.tier})</div>
          </div>
        </div>
        {onClose && (
          <button className="btn h-6 w-6 p-0 text-slate-400 hover:text-white" onClick={onClose} aria-label="Close">
            ✕
          </button>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg bg-white/5 p-2">
          <div className="text-[12px] uppercase text-slate-400">Holes & Par</div>
          <div className="text-sm font-semibold text-white">{stats.totals.holes} holes · Par {stats.totals.par}</div>
          <div className="text-[12px] text-slate-400">
            {stats.totals.mix[3]}×P3 · {stats.totals.mix[4]}×P4 · {stats.totals.mix[5]}×P5
          </div>
        </div>
        <div className="rounded-lg bg-white/5 p-2">
          <div className="text-[12px] uppercase text-slate-400">Conditioning Quality</div>
          <div className="flex items-center gap-2">
            <span className={`rounded border px-1.5 py-0.5 text-xs font-bold ${qBadge.bg} ${qBadge.text}`}>
              {stats.qualityScore}/100
            </span>
            {stats.heightBonus > 0 && <span className="text-[12px] text-slate-400">+{stats.heightBonus} contours</span>}
          </div>
          <div className="text-[12px] text-slate-400">{stats.warningCount === 0 ? 'Clean layout' : `${stats.warningCount} warning(s)`}</div>
        </div>
        <div className="rounded-lg bg-white/5 p-2">
          <div className="text-[12px] uppercase text-slate-400">Championship Length</div>
          <div className="text-sm font-semibold text-white">{formatHoleLength(stats.totals.lengthM, stats.totals.lengthYards)}</div>
          <div className="text-[12px] text-slate-400">Member: {Math.round(stats.totals.memberLengthM)} m</div>
        </div>
        <div className="rounded-lg bg-white/5 p-2">
          <div className="text-[12px] uppercase text-slate-400">Monthly Upkeep</div>
          <div className="text-sm font-semibold text-amber-300">{formatCurrency(stats.monthlyUpkeep)}/mo</div>
          <div className="text-[12px] text-slate-400">{formatCurrency(stats.monthlyUpkeep * 12)}/yr</div>
        </div>
      </div>

      {stats.qualityHints.length > 0 && (
        <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/10 p-2 text-[12px] text-amber-200">
          <div className="mb-1 flex items-center gap-1 font-semibold">
            <Icon name="info" className="h-3 w-3 text-amber-400" /> Course Hints
          </div>
          <ul className="list-disc space-y-0.5 pl-4 text-slate-300">
            {stats.qualityHints.map((hint, i) => (
              <li key={i}>{hint}</li>
            ))}
          </ul>
        </div>
      )}

      {nextInfo && (
        <div className="mt-3 rounded-lg border border-white/10 bg-white/5 p-2 text-xs">
          <div className="mb-1 flex items-center justify-between">
            <span className="font-semibold text-slate-300">Next: Tier {stats.nextTier} ({nextInfo.name})</span>
            <span className="text-[12px] text-slate-400">Need rep {nextInfo.reputation}+</span>
          </div>
          {stats.missingLabels.length === 0 ? (
            <div className="text-[12px] font-medium text-emerald-400">✓ Ready for Tier {stats.nextTier} offer</div>
          ) : (
            <div className="space-y-1 text-[12px]">
              <div className="text-slate-400">Lacking {stats.missingLabels.length} requirement(s):</div>
              <div className="flex flex-wrap gap-1">
                {stats.missingLabels.map((lbl, i) => (
                  <span key={i} className="rounded bg-rose-500/20 px-1.5 py-0.5 text-rose-300 border border-rose-500/30">
                    ✕ {lbl}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mt-3">
        <div className="mb-1 text-[12px] font-semibold uppercase text-slate-400">Hole Breakdown</div>
        <div className="max-h-56 overflow-y-auto rounded-lg border border-white/10 bg-black/40 text-xs">
          <table className="w-full text-left">
            <thead className="border-b border-white/10 text-[12px] uppercase text-slate-400">
              <tr>
                <th className="px-2 py-1">Hole</th>
                <th className="px-1 py-1">Par</th>
                {TEE_KINDS.map(k => <th key={k} className="px-2 py-1 text-right" title={`The ${TEE_SET[k].colour} tees: ${TEE_SET[k].who}`}>{TEE_SET[k].name}</th>)}
                <th className="px-2 py-1">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {stats.rows.map(h => (
                <tr
                  key={h.hole}
                  className={`hover:bg-white/5 ${onSelectHole ? 'cursor-pointer' : ''}`}
                  onClick={() => onSelectHole?.(h.hole)}
                >
                  <td className="px-2 py-1 font-bold text-white">#{h.hole}</td>
                  <td className={`px-1 py-1 font-semibold ${parColorClass(h.par)}`}>P{h.par}</td>
                  {/* T254: each tee set's length (blue, white, yellow, red; – where the hole has none); the plays-like line under the back-most */}
                  {TEE_KINDS.map((k, i) => {
                    const s = (h.sets ?? []).find(q => q.kind === k), first = (h.sets ?? [])[0]?.kind === k || (!h.sets?.length && i === 0);
                    return (
                      <td key={k} className={`px-2 py-1 text-right tabular-nums ${first ? 'text-slate-200' : 'text-slate-400'}`} data-set={k}>
                        {s ? `${s.lengthM}m` : !h.sets?.length && i === 0 ? `${h.lengthM}m` : '–'}
                        {first && Math.abs(h.riseM) >= 0.5 && <div className="text-[12px] text-slate-400">plays {h.playsLikeM}m ({h.riseM > 0 ? '+' : ''}{h.riseM} m)</div>}
                      </td>
                    );
                  })}
                  <td className="px-2 py-1 text-[12px]">
                    {h.warnings.length === 0 ? (
                      <span className="text-emerald-400">✓ OK</span>
                    ) : (
                      <span className="text-rose-400" title={h.warnings.join('; ')}>
                        ⚠ {h.warnings.length}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
