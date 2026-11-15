// #1305 (the owner, 2026-11-14: "make course building an unlock later. let the guy play the range for a bit first and make it pretty"): the progress toward an unlock,
// drawn under a locked control's reason so a locked New hole or clubhouse says what opens it and how far along it is, never only greyed out: a thin bar with
// "$1,234 of $5,000 this season" and, in the game build, the range's looks as a small checklist (done ones ticked).
import { unlockPct } from './unlock-bar';

export interface UnlockLooks { done: number; need: number; items: readonly { id: string; label: string; done: boolean }[] }

export function UnlockBar({ have, need, looks, testId }: { have: number; need: number; looks?: UnlockLooks | undefined; testId?: string }) {
  const pct = unlockPct(have, need), usd = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
  return (
    <span className="mt-1 block" data-testid={testId}>
      <span className="block h-1.5 w-full overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={need} aria-valuenow={Math.min(have, need)} aria-label={`Range takings this season: ${usd(have)} of ${usd(need)}`}>
        <span className="block h-full rounded-full bg-amber-400" style={{ width: `${pct}%` }} />
      </span>
      <span className="mt-0.5 block text-[11px] tabular-nums text-slate-400">{usd(have)} of {usd(need)} this season</span>
      {looks && (
        <span className="mt-1 block text-[11px] leading-snug" data-testid={testId ? `${testId}-looks` : undefined}>
          <span className="block text-slate-300">Make the range look cared for: {looks.done} of {looks.need}</span>
          {looks.items.map(l => (
            <span key={l.id} className={`block ${l.done ? 'text-emerald-300' : 'text-slate-400'}`} data-look={l.id} data-done={l.done ? '1' : '0'}>{l.done ? '✓' : '○'} {l.label}</span>
          ))}
        </span>
      )}
    </span>
  );
}
