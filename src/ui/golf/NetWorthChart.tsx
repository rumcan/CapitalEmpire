// The net-worth chart (jam ticket J3): one light SVG line of the net worth at each month end, with the goal as a dashed line. No library.
import type { Point } from '../../game/golf/reports';
import { money } from './finevents';

export function NetWorthChart({ series, goal, height = 120 }: { series: readonly Point[]; goal?: number; height?: number }) {
  const W = 360, H = height, L = 8, R = 8, T = 10, B = 18;
  if (series.length < 2) {
    return <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-center text-xs text-slate-400" data-testid="networth-chart">The chart draws once you have two month ends.</div>;
  }
  const vals = series.map(p => p.value).concat(goal !== undefined ? [goal] : [], [0]);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const span = hi - lo || 1;
  const x = (i: number) => L + ((W - L - R) * i) / (series.length - 1);
  const y = (v: number) => T + (H - T - B) * (1 - (v - lo) / span);
  const path = series.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ');
  const last = series[series.length - 1], first = series[0];
  return (
    <figure className="m-0" data-testid="networth-chart">
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label={`Net worth by month: from ${money(first.value)} in ${first.label} to ${money(last.value)} in ${last.label}`}>
        <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} stroke="currentColor" strokeOpacity="0.25" />
        {goal !== undefined && <>
          <line x1={L} x2={W - R} y1={y(goal)} y2={y(goal)} stroke="#fbbf24" strokeOpacity="0.7" strokeDasharray="4 4" />
          <text x={W - R} y={y(goal) - 3} textAnchor="end" fontSize="10" fill="#fbbf24">goal {money(goal)}</text>
        </>}
        <path d={path} fill="none" stroke="#34d399" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(series.length - 1)} cy={y(last.value)} r="3.5" fill="#34d399" />
        <text x={L} y={H - 4} fontSize="10" fill="currentColor" fillOpacity="0.6">{first.label}</text>
        <text x={W - R} y={H - 4} textAnchor="end" fontSize="10" fill="currentColor" fillOpacity="0.6">{last.label}: {money(last.value)}</text>
      </svg>
    </figure>
  );
}
