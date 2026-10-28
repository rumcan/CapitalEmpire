// The town footer (T250, #721; the owner 2026-10-28: "lets have course on the left drawer and have a new footer drawer for town"): a slim bar
// along the bottom of the screen with the TOWN groups (Traffic, Town decoration) as the rail's buttons, their flyouts opening upward from it.
// Where it stands and in which form is footer-layout.ts footerPlace (the footer moves aside: the free stretch of the bottom edge nearest the
// middle, full or compact; only on a crowded screen do the cards in its way move up); this measures the screen, the minimap and the bottom
// cards each render and applies it. It sets --foot-top (its top's height above the screen's bottom, local px) for the controls that stand
// above it (the hint bar, the shot panel) and marks a card it lifts with data-foot-lift (index.css).
// T255 (#739, the owner 2026-10-29: "these windows need to move to the center footer where town moved to"): a town tool's panel (App.tsx's
// tool panel body: its crumb and its panel, the same JSX the left tool panel draws) docks above the footer, centred on it, in the left panel's
// width and look, opening upward (as tall as the room up to the top bar, then it scrolls, vertically only). It moves aside like the footer
// (footer-layout.ts panelPlace): never over the minimap or a card beside it; with no stretch to hold it, it stands in the left tool panel's
// place. It hides while the footer's flyouts are open (they open where it stands), as the left panel does for the drawer's. --foot-stack is
// the top of what stands on the bottom edge's middle (the bar, and the panel above it): the hint bar and the shot panel stand on it.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Rail, type RailProps } from './Rail';
import { hudTop } from './Flyouts';
import { FOOT_BOTTOM, FOOT_EST, FOOT_MARGIN, PANEL_GAP, PANEL_W, footerPlace, panelPlace } from './footer-layout';
import { currentUiScale } from './uiScale';

/** the cards the footer keeps clear of: the bottom-right ones (the guide card, the leaderboard) and the tall right-hand ones that may reach
 *  down to its band (the range, clubhouse, hole and place cards); one counts only while it is on screen and reaches the footer's band */
export const FOOT_CARDS = ['range-guide', 'leaderboard', 'range-card', 'club-card', 'hole-card', 'place-card'].map(id => `[data-testid="${id}"]`).join(', ');

/** T255: a town tool's panel: the tool in hand (data-tool) and the panel's body (App.tsx: the crumb and the tool's panel) */
export interface FootPanel { tool: string; body: ReactNode }

export interface TownFooterProps extends Omit<RailProps, 'drawer' | 'compact' | 'navRef'> {
  /** the footer's box (App.tsx: the upward flyouts' button positions are measured in it) and its bar */
  boxRef: React.RefObject<HTMLDivElement | null>; navRef: React.RefObject<HTMLElement | null>;
  /** its flyouts (open upward from it), drawn in its box */
  flyouts?: ReactNode;
  /** a flyout of it is open: it stands above the side drawer's box (and its panel hides) */
  raised?: boolean;
  /** T255: the tool panel docked above it (a town tool in hand; null: none, or a club tool's in the left panel) */
  panel?: FootPanel | null;
}

/** T255: the footer panel's place: its left edge in the footer's box (null: not measured yet, centred), and whether it stands in the left
 *  tool panel's place (no room above the footer) at top (its top in the box) */
interface PanelAt { x: number | null; side: boolean; top: number }

export function TownFooter({ boxRef, navRef, flyouts, raised = false, panel = null, ...rail }: TownFooterProps) {
  const [place, setPlace] = useState<{ x: number | null; compact: boolean }>({ x: null, compact: false });
  const [pan, setPan] = useState<PanelAt>({ x: null, side: false, top: 0 });
  const widths = useRef<{ full?: number; compact?: number }>({}), lifted = useRef<HTMLElement[]>([]), panelRef = useRef<HTMLDivElement | null>(null);
  const [, setTick] = useState(0);
  useEffect(() => { const re = () => setTick(t => t + 1); window.addEventListener('resize', re); return () => window.removeEventListener('resize', re); }, []);
  useLayoutEffect(() => {
    const nav = navRef.current; if (!nav) return;
    const s = currentUiScale() || 1, sw = window.innerWidth / s, sh = window.innerHeight / s;
    widths.current[place.compact ? 'compact' : 'full'] = nav.offsetWidth;
    const h = nav.offsetHeight, top = sh - FOOT_BOTTOM - h;
    document.documentElement.style.setProperty('--foot-top', `${FOOT_BOTTOM + h}px`);
    const mm = document.querySelector('[data-testid="minimap"]')?.getBoundingClientRect(), laneL = mm && mm.width > 0 ? mm.right / s : 0;
    const all = Array.from(document.querySelectorAll<HTMLElement>(FOOT_CARDS));
    // a card blocks the bottom edge while it reaches the footer's band (or is lifted above it: it stays a bottom card, so nothing flickers)
    const cards = all.filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && (el.hasAttribute('data-foot-lift') || r.bottom / s > top - 4); });
    const p = footerPlace({
      w: sw, laneL,
      blocks: cards.map(el => { const r = el.getBoundingClientRect(); return [r.left / s, r.right / s] as const; }),
      full: widths.current.full ?? FOOT_EST.full, compact: widths.current.compact ?? FOOT_EST.compact,
    });
    const lift = p.lift.map(i => cards[i]!);
    for (const el of new Set([...lifted.current, ...cards])) el.toggleAttribute('data-foot-lift', lift.includes(el));
    lifted.current = lift;
    if (p.x !== place.x || p.compact !== place.compact) setPlace({ x: p.x, compact: p.compact });
    // T255: the panel above the footer: its band runs from its top down to the bar (its height as it would stand there: its content's, up to
    // the room under the top bar, so the place it takes never changes the height it is placed by); every card reaching that band blocks it
    let stack = FOOT_BOTTOM + h;
    const pe = panelRef.current;
    if (pe && pe.offsetWidth > 0) {
      const hud = hudTop(), ph = Math.min(pe.scrollHeight, top - PANEL_GAP - hud - 8), pTop = top - PANEL_GAP - ph;
      const blocks = all.filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.bottom / s > pTop - 4 && r.top / s < top; })
        .map(el => { const r = el.getBoundingClientRect(); return [r.left / s, r.right / s] as const; });
      const fw = p.compact ? (widths.current.compact ?? FOOT_EST.compact) : (widths.current.full ?? FOOT_EST.full);
      const x = panelPlace({ w: sw, laneL, blocks, cx: p.x + fw / 2, width: pe.offsetWidth || PANEL_W });
      let next: PanelAt;
      if (x !== null) { next = { x, side: false, top: 0 }; stack += PANEL_GAP + ph; } else {
        // no room above the footer: the left tool panel's place, beside the course drawer (gap-2), under the top bar
        const rr = document.querySelector('[data-testid="rail"]')?.getBoundingClientRect(), box = boxRef.current?.getBoundingClientRect();
        next = { x: Math.round(rr && rr.width > 0 ? rr.right / s + 8 : FOOT_MARGIN), side: true, top: Math.round(hud - (box ? box.top / s : top)) };
      }
      if (next.x !== pan.x || next.side !== pan.side || next.top !== pan.top) setPan(next);
    }
    document.documentElement.style.setProperty('--foot-stack', `${stack}px`);
  });
  // gone (the lot lab, a new game): nothing stands above it, nothing stays lifted
  useEffect(() => () => { for (const v of ['--foot-top', '--foot-stack']) document.documentElement.style.setProperty(v, '0px'); for (const el of lifted.current) el.removeAttribute('data-foot-lift'); }, []);
  return (
    <div ref={boxRef} className={`town-foot pointer-events-none absolute inset-x-0 bottom-3 ${raised ? 'z-40' : 'z-20'} flex`} data-testid="town-footer">
      <div className="pointer-events-auto" style={place.x === null ? { marginInline: 'auto' } : { marginLeft: place.x }}>
        <Rail {...rail} drawer="footer" compact={place.compact} navRef={navRef} />
      </div>
      {flyouts}
      {/* T255: the town tool's panel, docked above the footer (the left panel's width and look); hidden while the footer's flyouts are open */}
      {panel && (
        <div ref={panelRef} className={`glass tool-panel tool-panel-foot pointer-events-auto w-[330px] overflow-y-auto overflow-x-hidden p-3 ${raised ? 'hidden' : ''}`}
          style={pan.x === null ? { left: '50%', marginLeft: -PANEL_W / 2 } : pan.side ? { left: pan.x, top: pan.top } : { left: pan.x }}
          data-tool={panel.tool} data-testid="tool-panel" data-dock="footer" data-place={pan.side ? 'side' : 'foot'}>
          {panel.body}
        </div>
      )}
    </div>
  );
}
