// T394 (#1061): the cards at the right edge stand side by side, never one under another. The card on the right (the Range card, the Clubhouse
// card, a place's card, a hole's card or the event announcement) is the first column from the edge; then the Staff card, your profile ("Your
// golf"), and last your bag or your cards (a card's detail opens to ITS left). Each card stands one column left of every card open before it, so
// the Staff card beside your profile never hides under it (it did: both took the first column when no card stood on the right). Esc peels them the
// other way, the outermost first (tool-modes.ts ESC_CARDS). Pure: no DOM; App.tsx reads the offsets.

/** the stack's cards from the edge in: the card on the right, the Staff card, your profile, your bag or your cards */
export type StackCard = 'main' | 'staff' | 'player' | 'bag';
export const STACK_ORDER: readonly StackCard[] = ['main', 'staff', 'player', 'bag'];
/** which of them are open */
export type StackOpen = Record<StackCard, boolean>;

/** the column (0 at the right edge) card stands in: one for each card open before it in the stack. A card that is closed still has a column (where it would
 *  open), which is where a card of another kind (the guides) stands beside the open ones */
export function stackCol(open: StackOpen, card: StackCard): number {
  let n = 0;
  for (const c of STACK_ORDER) { if (c === card) break; if (open[c]) n++; }
  return n;
}

/** the offsets from the right edge, in Tailwind's classes (written whole: its scanner reads this file): [no side panel, with it] for columns 0 to 3 (a column is 22rem
 *  wide: a 340 px card and a gap; the first step is 23rem from the 0.75rem margin, 41rem from the Budget panel's 19.5rem) */
const RIGHT: readonly (readonly [string, string])[] = [
  ['right-3', 'right-[19.5rem]'], ['right-[23rem]', 'right-[41rem]'], ['right-[45rem]', 'right-[63rem]'], ['right-[67rem]', 'right-[85rem]'],
];
/** how many columns fit in a window width (the UI layer's units: window width over its scale), left of the rail (about 100 px) and of the Budget panel when it
 *  is open: at least one. Past that a card stands over the last column's (the one opened later on top) rather than off the screen */
export function stackFit(width: number, panel: boolean): number {
  const edge = panel ? 312 : 12; // (px: the offset of column 0)
  return Math.min(RIGHT.length, Math.max(1, Math.floor((width - 100 - edge) / 352)));
}
/** the class that puts a card at column col from the right edge (col is held to what fits, fit: stackFit) */
export function stackRight(col: number, panel: boolean, fit: number = RIGHT.length): string {
  const c = Math.max(0, Math.min(Math.floor(col), fit - 1, RIGHT.length - 1));
  return RIGHT[c]![panel ? 1 : 0];
}
