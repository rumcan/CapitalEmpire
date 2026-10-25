// The rail's buttons (plan P23 4.2, P1-E; the items and their states are rail-items.ts): the Course and Town headings, each item with its key letter,
// a locked item dimmed in place with a lock and its "Unlocks with …" (a click says it, nothing opens), and a NEW badge until first opened.
import { Icon } from './Icon';
import type { RailEntry, RailItem } from './rail-items';

const HEADING = { course: 'Course', town: 'Town' } as const;

/** a small padlock (the locked tools' mark; colour never alone, P23 4.11) */
export function LockMark({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden className="shrink-0">
      <path d="M3.5 5.5 V4 a2.5 2.5 0 0 1 5 0 V5.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <rect x="2" y="5.2" width="8" height="6" rx="1.2" fill="currentColor" />
    </svg>
  );
}

/** the gold NEW badge (P23 4.2: until the tool is first opened) */
export const NewBadge = ({ className = '' }: { className?: string }) => <span className={`new-badge ${className}`}>NEW</span>;

/** the rail: one button per entry, in order, with its heading above the first item under it. onPick opens an item; onLocked says why a
 *  locked one is not open yet */
export function Rail({ entries, onPick, onLocked }: { entries: RailEntry[]; onPick: (r: RailItem) => void; onLocked: (r: RailItem, why: string) => void }) {
  return (
    <nav className="glass flex flex-col gap-1 p-1.5" aria-label="Tools">
      {entries.map(({ item: r, on, locked, isNew, heading }) => (
        <div key={r.id} className="contents">
          {heading && <div className="rail-heading">{HEADING[heading]}</div>}
          <button
            data-rail={r.id}
            onClick={() => (locked ? onLocked(r, locked) : onPick(r))}
            aria-disabled={locked ? true : undefined}
            aria-pressed={on}
            aria-label={locked ? `${r.label}: ${locked}` : isNew ? `${r.label} (new)` : r.label}
            title={locked ? `${r.label} · ${locked}` : r.key ? `${r.label} (${r.key})` : r.label}
            className={`rail-tab ${on ? 'rail-tab-on' : ''} ${locked ? 'rail-tab-locked' : ''}`}
          >
            {r.key && <span className="rail-key">{r.key}</span>}
            {locked && <span className="rail-lock"><LockMark /></span>}
            {isNew && <NewBadge className="rail-new" />}
            <Icon name={r.icon} size={28} />
            <span>{r.label}</span>
          </button>
        </div>
      ))}
    </nav>
  );
}
