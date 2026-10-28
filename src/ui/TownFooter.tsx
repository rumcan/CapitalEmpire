// The town footer (T250, #721; the owner 2026-10-28: "lets have course on the left drawer and have a new footer drawer for town"): a slim bar
// along the bottom of the screen with the TOWN groups (Traffic, Town decoration) as the rail's buttons, their flyouts opening upward from it.
// Where it stands and in which form is footer-layout.ts footerPlace (the footer moves aside: the free stretch of the bottom edge nearest the
// middle, full or compact; only on a crowded screen do the cards in its way move up); this measures the screen, the minimap and the bottom
// cards each render and applies it. It sets --foot-top (its top's height above the screen's bottom, local px) for the controls that stand
// above it (the hint bar, the shot panel) and marks a card it lifts with data-foot-lift (index.css).
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Rail, type RailProps } from './Rail';
import { FOOT_BOTTOM, FOOT_EST, footerPlace } from './footer-layout';
import { currentUiScale } from './uiScale';

/** the cards the footer keeps clear of: the bottom-right ones (the guide card, the leaderboard) and the tall right-hand ones that may reach
 *  down to its band (the range, clubhouse, hole and place cards); one counts only while it is on screen and reaches the footer's band */
export const FOOT_CARDS = ['range-guide', 'leaderboard', 'range-card', 'club-card', 'hole-card', 'place-card'].map(id => `[data-testid="${id}"]`).join(', ');

export interface TownFooterProps extends Omit<RailProps, 'drawer' | 'compact' | 'navRef'> {
  /** the footer's box (App.tsx: the upward flyouts' button positions are measured in it) and its bar */
  boxRef: React.RefObject<HTMLDivElement | null>; navRef: React.RefObject<HTMLElement | null>;
  /** its flyouts (open upward from it), drawn in its box */
  flyouts?: ReactNode;
  /** a flyout of it is open: it stands above the side drawer's box */
  raised?: boolean;
}

export function TownFooter({ boxRef, navRef, flyouts, raised = false, ...rail }: TownFooterProps) {
  const [place, setPlace] = useState<{ x: number | null; compact: boolean }>({ x: null, compact: false });
  const widths = useRef<{ full?: number; compact?: number }>({}), lifted = useRef<HTMLElement[]>([]);
  const [, setTick] = useState(0);
  useEffect(() => { const re = () => setTick(t => t + 1); window.addEventListener('resize', re); return () => window.removeEventListener('resize', re); }, []);
  useLayoutEffect(() => {
    const nav = navRef.current; if (!nav) return;
    const s = currentUiScale() || 1, sw = window.innerWidth / s, sh = window.innerHeight / s;
    widths.current[place.compact ? 'compact' : 'full'] = nav.offsetWidth;
    const h = nav.offsetHeight, top = sh - FOOT_BOTTOM - h;
    document.documentElement.style.setProperty('--foot-top', `${FOOT_BOTTOM + h}px`);
    const mm = document.querySelector('[data-testid="minimap"]')?.getBoundingClientRect();
    // a card blocks the bottom edge while it reaches the footer's band (or is lifted above it: it stays a bottom card, so nothing flickers)
    const cards = Array.from(document.querySelectorAll<HTMLElement>(FOOT_CARDS)).filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && (el.hasAttribute('data-foot-lift') || r.bottom / s > top - 4); });
    const p = footerPlace({
      w: sw, laneL: mm && mm.width > 0 ? mm.right / s : 0,
      blocks: cards.map(el => { const r = el.getBoundingClientRect(); return [r.left / s, r.right / s] as const; }),
      full: widths.current.full ?? FOOT_EST.full, compact: widths.current.compact ?? FOOT_EST.compact,
    });
    const lift = p.lift.map(i => cards[i]!);
    for (const el of new Set([...lifted.current, ...cards])) el.toggleAttribute('data-foot-lift', lift.includes(el));
    lifted.current = lift;
    if (p.x !== place.x || p.compact !== place.compact) setPlace({ x: p.x, compact: p.compact });
  });
  // gone (the lot lab, a new game): nothing stands above it, nothing stays lifted
  useEffect(() => () => { document.documentElement.style.setProperty('--foot-top', '0px'); for (const el of lifted.current) el.removeAttribute('data-foot-lift'); }, []);
  return (
    <div ref={boxRef} className={`town-foot pointer-events-none absolute inset-x-0 bottom-3 ${raised ? 'z-40' : 'z-20'} flex`} data-testid="town-footer">
      <div className="pointer-events-auto" style={place.x === null ? { marginInline: 'auto' } : { marginLeft: place.x }}>
        <Rail {...rail} drawer="footer" compact={place.compact} navRef={navRef} />
      </div>
      {flyouts}
    </div>
  );
}
