// The rail's buttons (plan P23 4.2, P1-E; the items and their states are rail-items.ts; T182 the groups): a rule after Select (no heading words: the owner, 2026-10-29), each item
// (no key letters on the rail, T182: the tooltip names the key), a locked item dimmed in place with a lock and its "Unlocks with …" (a click
// says it, nothing opens), and a NEW badge until its new tools are first opened.
// T250 (#721): one component for both drawers: the course drawer on the left (a column, Bulldoze set off from the Course groups by a rule) and
// the town footer along the bottom (a slim row: each group's icon beside its name; compact, its icons alone, the names in the tooltip and the
// buttons' labels). The buttons, their states and their anchors (data-rail, data-guide: the guide's Show me) are the same in both.
import { Icon } from './Icon';
import { ActionTile } from './ActionTile'; // J8 (#1261): an item with a painted tile draws it in place of its icon
import { tileUrl } from './tool-tiles';
import { railLabel, railTip, type Drawer, type RailEntry, type RailItem } from './rail-items';
import { tipAttrs } from './tip';


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

/** the rail: one button per entry, in order, with a rule above the Course groups. onPick opens an item (keyboard: it was pressed
 *  with Enter or Space, so its flyout takes the keyboard, T193); onLocked says why a locked one is not open yet; onHover (T193: a flyout is open:
 *  the pointer on another group opens that one's, like a menu bar); open: the item whose flyout is open. T250: drawer, the course drawer
 *  ('side', a column) or the town footer ('footer', a row); compact, the footer's icons alone */
/** T323 (#921): the Select slot's two cursors, a pointer (Select: a click inspects) and a walking figure (Walk: a click walks your character
 *  there); Alt swaps them. Present only while you have a character (a golf game) */
export interface RailWalk { on: boolean; set: (on: boolean) => void }
/** the pointer (an arrow) and the walking figure: simple line drawings in the rail's colour (stand-ins until icon art lands, GOLF-SPRITES.md) */
const PointerGlyph = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="pointer-events-none"><path d="M6 3 L6 19 L10.2 15.2 L13 21.2 L15.6 20 L12.9 14.1 L18.5 14 Z" fill="currentColor" stroke="#0f172a" strokeWidth="1.2" strokeLinejoin="round" /></svg>
);
const WalkerGlyph = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="pointer-events-none" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="13" cy="4" r="2.2" fill="currentColor" stroke="none" /><path d="M12.5 7.5 L10.5 14 L13.5 17 L14.5 22" /><path d="M10.5 14 L8 21.5" /><path d="M12 9 L8.5 11.5 L7 14.5" /><path d="M12 9 L15 12 L18 12.5" />
  </svg>
);
/** T323: the Select slot split in two (the pointer above the walking figure, each with its name): the lit one is the cursor in hand */
function CursorPair({ walk, sel }: { walk: RailWalk; sel: boolean }) {
  const b = (isWalk: boolean) => {
    const lit = sel && walk.on === isWalk;
    return (
      <button data-rail={isWalk ? 'walk' : 'select'} data-guide={isWalk ? 'rail-walk' : 'rail-select'} data-testid={isWalk ? 'cursor-walk' : 'cursor-select'}
        onClick={() => walk.set(isWalk)} aria-pressed={lit} aria-label={isWalk ? 'Walk' : 'Select'}
        {...tipAttrs({ name: isWalk ? 'Walk: a click walks your character there and uses what you clicked (Ctrl+click looks at once); WASD walk you, the arrows pan' : 'Select: a click inspects what is there; WASD still walk you, the arrows pan', key: 'Alt' })}
        className={`rail-tab rail-tab-half ${lit ? 'rail-tab-on' : ''}`}>
        {isWalk ? <WalkerGlyph size={28} /> : <PointerGlyph size={28} />}
        <span>{isWalk ? 'Walk' : 'Select'}</span>
      </button>
    );
  };
  return <div className="flex flex-col gap-1" role="group" aria-label="Cursor" data-testid="cursor-pair">{b(false)}{b(true)}</div>;
}
export interface RailProps { walk?: RailWalk; entries: RailEntry[]; onPick: (r: RailItem, keyboard?: boolean, el?: HTMLElement) => void; onLocked: (r: RailItem, why: string) => void; onHover?: (r: RailItem, el: HTMLElement) => void; open?: string | null; navRef?: React.Ref<HTMLElement>; drawer?: Drawer; compact?: boolean }
export function Rail({ walk, entries, onPick, onLocked, onHover, open = null, navRef, drawer = 'side', compact = false }: RailProps) {
  const foot = drawer === 'footer';
  return (
    // T193: never under the minimap: on a short screen (1366 x 768 at 125%) the rail scrolls, vertically only. T250: the footer never scrolls
    <nav ref={navRef} className={foot ? `glass rail-foot ${compact ? 'rail-foot-compact' : ''}` : 'glass rail-nav flex flex-col gap-1 p-1.5'}
      aria-label={foot ? 'Town tools' : 'Club tools'} data-testid={foot ? 'rail-footer' : 'rail'} data-drawer={drawer} {...(foot ? { 'data-compact': compact } : {})}>
      {entries.map((e, i) => { const { item: r, on, locked, isNew, heading } = e; return (
        <div key={r.id} className="contents">
          {/* the owner, 2026-10-29: "remove the words Course and Town from the menus": a rule sets the Course groups off from Select, the footer needs none */}
          {heading && !foot && i > 0 && <div className="rail-sep" aria-hidden />}
          {/* T250: Bulldoze (no section) set off from the Course groups above it */}
          {!foot && i > 0 && !r.section && !!entries[i - 1]!.item.section && <div className="rail-sep" aria-hidden />}
          {walk && !foot && r.id === 'select' ? <CursorPair walk={walk} sel={on} /> : <button
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
            {r.tile && tileUrl(r.tile) ? <ActionTile tile={r.tile} size={foot ? 24 : 30} /> : <Icon name={r.icon} size={foot ? 24 : 28} />}
            {!(foot && compact) && <span>{railLabel(r)}</span>}
          </button>}
        </div>
      ); })}
    </nav>
  );
}
