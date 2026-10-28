// The town footer's place (T250, #721): a slim bar centred along the bottom of the screen, clear of the minimap at the lower left and of the
// cards at the bottom (the guide card, the leaderboard; a tall right-hand card such as the range card when it reaches the footer's band).
// The rule: the footer moves aside. It stands in the free stretch of the bottom edge nearest the screen's middle, in its full form (icon and
// name) where that fits, else in its compact form (icons only, the names in the tooltip); a full bar far off the middle loses to a compact one
// near it (COMPACT_COST). Only when no stretch holds even the compact bar (a crowded screen: 125% UI on a 1366 px screen with a panel, the
// range card and the guide card all open) does it stand compact near the middle, and the cards in its way move up above it (lift). Pure
// TypeScript, no DOM: TownFooter.tsx measures the screen and the cards and applies the result. All sizes in the UI layer's px.

/** the room kept at the screen's edges, the gap kept round a card or the minimap, and how far from the middle (px) a full bar may be
 *  pushed before the compact bar near the middle is preferred */
export const FOOT_MARGIN = 12, FOOT_GAP = 10, COMPACT_COST = 160;
/** the bar's distance from the screen's bottom (Tailwind bottom-3) */
export const FOOT_BOTTOM = 12;
/** the forms' widths before they are measured (the first frame) */
export const FOOT_EST = { full: 300, compact: 116 } as const;

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

/** where the footer stands (its left edge), in which form, and the cards that move up above it (indices into blocks; none but in the last
 *  resort) */
export function footerPlace(o: FootRoom): FootPlace {
  const cx = o.w / 2, free = freeStretches(o);
  let best: FootPlace | null = null, cost = Infinity;
  for (const [compact, w] of [[false, o.full], [true, o.compact]] as const) {
    for (const [a, b] of free) {
      if (b - a < w) continue;
      const x = Math.min(Math.max(cx - w / 2, a), b - w), c = Math.abs(x + w / 2 - cx) + (compact ? COMPACT_COST : 0);
      if (c < cost) { cost = c; best = { x: Math.round(x), compact, lift: [] }; }
    }
  }
  if (best) return best;
  const lo = Math.max(FOOT_MARGIN, o.laneL + FOOT_GAP), x = Math.round(Math.min(Math.max(cx - o.compact / 2, lo), Math.max(lo, o.w - FOOT_MARGIN - o.compact)));
  return { x, compact: true, lift: o.blocks.flatMap(([l, r], i) => (r + FOOT_GAP > x && l - FOOT_GAP < x + o.compact ? [i] : [])) };
}
