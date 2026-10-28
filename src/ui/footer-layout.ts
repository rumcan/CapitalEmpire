// The town footer's place (T250, #721): a slim bar along the bottom of the screen, clear of the minimap at the lower left and of the
// cards at the bottom (the guide card, the leaderboard; a tall right-hand card such as the range card when it reaches the footer's band).
// The owner, 2026-10-29: "move center footer menu to the right corner": it stands in the bottom right corner (FOOT_ANCHOR).
// The rule: the footer moves aside. It stands in the free stretch of the bottom edge nearest the screen's right corner, in its full form (icon
// and name) where that fits, else in its compact form (icons only, the names in the tooltip); a full bar far off the corner loses to a compact
// one near it (COMPACT_COST). Only when no stretch holds even the compact bar (a crowded screen: 125% UI on a 1366 px screen with a panel, the
// range card and the guide card all open) does it stand compact in the corner, and the cards in its way move up above it (lift). Pure
// TypeScript, no DOM: TownFooter.tsx measures the screen and the cards and applies the result. All sizes in the UI layer's px.
// T255 (#739, the owner 2026-10-29: "these windows need to move to the center footer where town moved to"): a town tool's panel docks above
// the footer (panelPlace), centred on it, and moves aside the same way: the free stretch nearest the footer's middle that holds it, clear of
// the minimap and of every card beside it (a tall right-hand card as well as a bottom one: the panel is taller than the bar).

/** the room kept at the screen's edges, the gap kept round a card or the minimap, and how far from the middle (px) a full bar may be
 *  pushed before the compact bar near the middle is preferred */
export const FOOT_MARGIN = 12, FOOT_GAP = 10, COMPACT_COST = 160;
/** the bar's distance from the screen's bottom (Tailwind bottom-3) */
export const FOOT_BOTTOM = 12;
/** the forms' widths before they are measured (the first frame) */
export const FOOT_EST = { full: 300, compact: 116 } as const;
/** where the footer stands on a w px wide screen: as near this point of the bottom edge as the cards allow (the right corner) */
export const FOOT_ANCHOR = (w: number) => w;
/** the half width of the bottom edge's middle (the shot panel's 26rem): the hint bar and the shot panel stand above the footer (and its
 *  panel) only where those reach into it */
export const MID_HALF = 208;

export interface FootPlace { x: number; compact: boolean; lift: number[] }
export interface FootRoom {
  /** the screen's width */
  w: number;
  /** the minimap's (and its town chip's) right edge */
  laneL: number;
  /** the cards on the footer's band, as their left and right edges */
  blocks: readonly (readonly [number, number])[];
  /** the bar's width in each form */
  full: number; compact: number;
}

/** the free stretches of the bottom edge: from the minimap to the screen's right edge, less each card (with a gap round it) */
export function freeStretches(o: Pick<FootRoom, 'w' | 'laneL' | 'blocks'>): [number, number][] {
  let free: [number, number][] = [[Math.max(FOOT_MARGIN, o.laneL + FOOT_GAP), o.w - FOOT_MARGIN]];
  for (const [l, r] of o.blocks) {
    const L = l - FOOT_GAP, R = r + FOOT_GAP;
    free = free.flatMap(([a, b]): [number, number][] => (R <= a || L >= b ? [[a, b]] : [...(L > a ? [[a, L] as [number, number]] : []), ...(R < b ? [[R, b] as [number, number]] : [])]));
  }
  return free.filter(([a, b]) => b > a);
}

/** the left edge of a w-wide box in the free stretches that hold it, its centre as near cx as they allow, and that centre's distance from cx
 *  (null: no stretch holds it) */
export function nearest(free: readonly (readonly [number, number])[], w: number, cx: number): { x: number; off: number } | null {
  let best: { x: number; off: number } | null = null;
  for (const [a, b] of free) {
    if (b - a < w) continue;
    const x = Math.min(Math.max(cx - w / 2, a), b - w), off = Math.abs(x + w / 2 - cx);
    if (!best || off < best.off) best = { x: Math.round(x), off };
  }
  return best;
}

/** where the footer stands (its left edge), in which form, and the cards that move up above it (indices into blocks; none but in the last
 *  resort) */
export function footerPlace(o: FootRoom): FootPlace {
  const cx = FOOT_ANCHOR(o.w), free = freeStretches(o);
  let best: FootPlace | null = null, cost = Infinity;
  for (const [compact, w] of [[false, o.full], [true, o.compact]] as const) {
    const n = nearest(free, w, cx), c = n ? n.off + (compact ? COMPACT_COST : 0) : Infinity;
    if (n && c < cost) { cost = c; best = { x: n.x, compact, lift: [] }; }
  }
  if (best) return best;
  const lo = Math.max(FOOT_MARGIN, o.laneL + FOOT_GAP), x = Math.round(Math.min(Math.max(cx - o.compact / 2, lo), Math.max(lo, o.w - FOOT_MARGIN - o.compact)));
  return { x, compact: true, lift: o.blocks.flatMap(([l, r], i) => (r + FOOT_GAP > x && l - FOOT_GAP < x + o.compact ? [i] : [])) };
}

/** T255 (#739): the footer panel (a town tool's panel above the footer): the left tool panel's width (App.tsx w-[330px]), its gap above the
 *  bar, and its height at most, as a share of the screen's (index.css .tool-panel-foot: the map's middle stays in view; a longer panel scrolls) */
export const PANEL_W = 330, PANEL_GAP = 8, PANEL_VH = 0.6;
export interface PanelRoom extends Pick<FootRoom, 'w' | 'laneL' | 'blocks'> {
  /** the footer's middle (the panel stands centred on it where it can) */
  cx: number;
  /** the panel's width */
  width: number;
}
/** where the footer panel stands (its left edge): centred on the footer where that is clear, else moved aside to the free stretch nearest the
 *  footer's middle that holds it, clear of everything that reaches its band, from its top down to its bottom (blocks: the cards, the minimap's
 *  map and town chip, the course drawer; laneL 0, as the minimap is a block like the others: a short panel may stand over the town chip, which
 *  stays below it). null: no stretch holds it (a crowded screen: 125% UI on a 1366 px screen with the range card and the guide card beside it):
 *  it then stands in the left tool panel's place, beside the course drawer, as a club tool's panel does on that screen */
export function panelPlace(o: PanelRoom): number | null {
  return nearest(freeStretches(o), o.width, o.cx)?.x ?? null;
}
