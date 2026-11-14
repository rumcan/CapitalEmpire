// J7 (#1225; the owner, 2026-11-13: "the game pushes you to build stuff at the start but i dont like that"): in the jam build the range's guided build
// (guide.ts RANGE_GUIDE, a step list in the corner with rewards) is replaced by these tips: the player opens them (Build ▸ Tips), reads what helps and
// shuts them; nothing is ordered, nothing ticks, no ring pulls anywhere, and the practice area is described, never pushed. Pure TS, no DOM.
import { JAM_RAMP_TAKINGS } from '../../game/features';
import type { ToolTile } from '../tool-tiles';

/** what a tip's Show me does: the Build menu, the Bank, Walk out to the range's balls (absent: no Show me) */
export type TipShow = 'build' | 'bank' | 'balls';
/** tile (J8, #1261): the painted tile that shows beside the tip (tool-tiles.ts) */
export interface Tip { id: string; title: string; body: string; show?: TipShow; tile: ToolTile }

export const JAM_TIPS: readonly Tip[] = Object.freeze([
  { id: 'tip-build', title: 'Build what you like, when you like', body: 'Build lists everything with its price, its upkeep a month and how long it takes to pay itself back. There is no set order: grey cards say what they still need.', show: 'build', tile: 'clubhouse' },
  { id: 'tip-range', title: 'The old range earns quickly', body: 'Your plot has an old driving range for sale, with a dirt car park. Buy it (Build, or the range card) and drivers on the county road stop to hit a bucket. Gravel or pave the car park to fit more cars.', tile: 'buy-range' },
  { id: 'tip-junk', title: 'Junk on the range', body: 'Old cars, tyres and scrap lie on the outfield, each with its distance. While they lie there a few golfers stay away: clear any pile from the range card (its scrap is paid back), or keep some as targets.', tile: 'clear-junk' },
  { id: 'tip-balls', title: 'The balls', body: 'Hit balls stay out on the range. The range comes with a push picker and an attendant who picks them up on his shift (his wage is on your statement). If the ball room still runs dry, the range card says so and fixes it in one click; or take Walk, hold F over the balls and empty your basket at the ball room.', show: 'balls', tile: 'ball-washer' },
  { id: 'tip-course', title: 'Holes earn green fees', body: `New hole and the clubhouse open once the range has taken $${JAM_RAMP_TAKINGS.toLocaleString('en-US')} in a season. Each playable hole earns green fees once a clubhouse stands.`, tile: 'golf-hole' },
  { id: 'tip-bank', title: 'Borrow or save', body: 'Click your cash to open the Bank: a loan shows its total interest before you sign, and savings earn a little each month.', show: 'bank', tile: 'save-money' },
  { id: 'tip-practice', title: 'The practice area (optional)', body: 'A practice area with putting and chipping greens draws a few more golfers and lets you practise your own game. Build it if and when it suits you.', tile: 'putting-green' },
]);
