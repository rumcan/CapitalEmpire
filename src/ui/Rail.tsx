// The rail's buttons (plan P23 4.2, P1-E; the items and their states are rail-items.ts; T182 the groups): the Course and Town headings, each item
// (no key letters on the rail, T182: the tooltip names the key), a locked item dimmed in place with a lock and its "Unlocks with …" (a click
// says it, nothing opens), and a NEW badge until its new tools are first opened.
// T250 (#721): one component for both drawers: the course drawer on the left (a column, Bulldoze set off from the Course groups by a rule) and
// the town footer along the bottom (a slim row: each group's icon beside its name; compact, its icons alone, the names in the tooltip and the
// buttons' labels). The buttons, their states and their anchors (data-rail, data-guide: the guide's Show me) are the same in both.
import { Icon } from './Icon';
import { railTip, type Drawer, type RailEntry, type RailItem } from './rail-items';
import { tipAttrs } from './tip';

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

/** the rail: one button per entry, in order, with its heading above the first item under it. onPick opens an item (keyboard: it was pressed
 *  with Enter or Space, so its flyout takes the keyboard, T193); onLocked says why a locked one is not open yet; onHover (T193: a flyout is open:
 *  the pointer on another group opens that one's, like a menu bar); open: the item whose flyout is open. T250: drawer, the course drawer
 *  ('side', a column) or the town footer ('footer', a row); compact, the footer's icons alone */
export interface RailProps { entries: RailEntry[]; onPick: (r: RailItem, keyboard?: boolean, el?: HTMLElement) => void; onLocked: (r: RailItem, why: string) => void; onHover?: (r: RailItem, el: HTMLElement) => void; open?: string | null; navRef?: React.Ref<HTMLElement>; drawer?: Drawer; compact?: boolean }
export function Rail({ entries, onPick, onLocked, onHover, open = null, navRef, drawer = 'side', compact = false }: RailProps) {
  const foot = drawer === 'footer';
  return (
    // T193: never under the minimap: on a short screen (1366 x 768 at 125%) the rail scrolls, vertically only. T250: the footer never scrolls
    <nav ref={navRef} className={foot ? `glass rail-foot ${compact ? 'rail-foot-compact' : ''}` : 'glass rail-nav flex flex-col gap-1 p-1.5'}
      aria-label={foot ? 'Town tools' : 'Club tools'} data-testid={foot ? 'rail-footer' : 'rail'} data-drawer={drawer} {...(foot ? { 'data-compact': compact } : {})}>
      {entries.map((e, i) => { const { item: r, on, locked, isNew, heading } = e; return (
        <div key={r.id} className="contents">
          {heading && <div className={`rail-heading ${foot ? 'rail-heading-foot' : ''}`}>{HEADING[heading]}</div>}
          {/* T250: Bulldoze (no section) set off from the Course groups above it */}
          {!foot && i > 0 && !r.section && !!entries[i - 1]!.item.section && <div className="rail-sep" aria-hidden />}
          <button
            data-rail={r.id}
            data-guide={`rail-${r.id}`}
            onClick={(e?: React.MouseEvent<HTMLButtonElement>) => (locked ? onLocked(r, locked) : onPick(r, e?.detail === 0, e?.currentTarget))}
            onMouseEnter={e => { if (!locked) onHover?.(r, e.currentTarget); }}
            aria-disabled={locked ? true : undefined}
            aria-pressed={on}
            aria-expanded={open === r.id ? true : undefined}
            aria-label={locked ? `${r.label}: ${locked}` : isNew ? `${r.label} (new)` : r.label}
            {...tipAttrs(railTip(e))}
            className={`rail-tab ${foot ? 'rail-tab-foot' : ''} ${on || open === r.id ? 'rail-tab-on' : ''} ${locked ? 'rail-tab-locked' : ''}`}
          >
            {locked && <span className="rail-lock"><LockMark /></span>}
            {isNew && <NewBadge className="rail-new" />}
            <Icon name={r.icon} size={foot ? 24 : 28} />
            {!(foot && compact) && <span>{r.label}</span>}
          </button>
        </div>
      ); })}
    </nav>
  );
}
