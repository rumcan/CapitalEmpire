// The top bar's stat chips (T233, #674; stat-chips.ts words them): the concept's money with its change a month, reputation, golfers a month
// and course rating, one box of segments. Each chip: its icon (on a small tile from 1900 px), its figure, and under it the money's change (from
// 1600 px) or the chip's words, which show from 2200 px only (the owner's T135 rule: narrower, the icon and the figure, the words in the
// tooltip). Narrower than 1600 px the money's figure is short ($842k), so the bar keeps one row at 1366 px. A chip with an
// action is a button (the money: the books; the golfers: the Club card; the rating: the Season card's Course stats); the money's drawer (the
// town's population, jobs, day and daily income) opens under it on hover.
import type { ReactNode } from 'react';
import { Icon } from './Icon';
import type { StatChipView } from './stat-chips';

/** the words under a figure: from 2200 px only (T135, as App's WIDE) */
export const WIDE_LINE = 'hidden min-[2200px]:block';
/** the money's change under its figure, and the long figure and the units: from 1600 px (narrower: the short figure, the rest in the tooltip) */
export const MID_LINE = 'hidden min-[1600px]:block', MID = 'hidden min-[1600px]:inline', NARROW = 'min-[1600px]:hidden';
const TONE = { up: 'stat-up', down: 'stat-down', flat: 'stat-flat' } as const;

export function StatChip({ c, onClick }: { c: StatChipView; onClick?: () => void }) {
  const say = `${c.label ?? 'Money'}: ${c.value}${c.unit ?? ''}${c.sub ? `, ${c.sub}` : ''}`;
  const body = <>
    <span className="stat-chip-icon"><Icon name={c.icon} size={22} /></span>
    <span className="stat-chip-text">
      <span className={`stat-chip-value ${c.tone ? TONE[c.tone] : ''}`}>
        {c.short ? <><span className={MID}>{c.value}</span><span className={NARROW}>{c.short}</span></> : c.value}
        {c.unit && <span className={`stat-chip-unit ${MID}`}>{c.unit}</span>}
      </span>
      {c.sub && <span className={`stat-chip-sub ${c.subAlways ? '' : MID_LINE} ${c.subTone ? TONE[c.subTone] : ''}`} data-testid={`stat-${c.id}-sub`}>{c.sub}</span>}
      {c.label && <span className={`stat-chip-label ${WIDE_LINE}`}>{c.label}</span>}
    </span>
  </>;
  return onClick
    ? <button type="button" className="stat-chip" data-stat={c.id} data-tip={c.tip} aria-label={say} onClick={onClick}>{body}</button>
    : <div className="stat-chip" data-stat={c.id} data-tip={c.tip} role="group" aria-label={say}>{body}</div>;
}

/** the chips in a row; on: a chip's action by its id (none: no action); drawer: what opens under the money chip on hover */
export function StatChips({ chips, on = {}, drawer }: { chips: StatChipView[]; on?: Partial<Record<StatChipView['id'], (() => void) | undefined>>; drawer?: ReactNode }) {
  return (
    <div className="stat-chips" data-testid="stat-chips">
      {chips.map(c => c.id === 'money' && drawer
        ? <div key={c.id} className="group relative flex">
            <StatChip c={c} onClick={on.money} />
            <div className="absolute left-0 top-full z-30 hidden pt-1 group-hover:block"><div className="glass flex flex-col gap-2 p-2">{drawer}</div></div>
          </div>
        : <StatChip key={c.id} c={c} onClick={on[c.id]} />)}
    </div>
  );
}
