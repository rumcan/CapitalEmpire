// J7 (#1225; the owner, 2026-11-13: "the game pushes you to build stuff at the start but i dont like that"): in the jam build the range's guided build
// (guide.ts RANGE_GUIDE, a step list in the corner with rewards) is replaced by these tips: the player opens them (Build ▸ Tips), reads what helps and
// shuts them; nothing is ordered, nothing ticks, no ring pulls anywhere, and the practice area is described, never pushed. Pure TS, no DOM.
import { JAM_RAMP_TAKINGS } from '../../game/features';

/** what a tip's Show me does: the Build menu, the Bank, Walk out to the range's balls (absent: no Show me) */
export type TipShow = 'build' | 'bank' | 'balls';
export interface Tip { id: string; title: string; body: string; show?: TipShow }

export const JAM_TIPS: readonly Tip[] = Object.freeze([
  { id: 'tip-build', title: 'Build what you like, when you like', body: 'Build lists everything with its price, its upkeep a month and how long it takes to pay itself back. There is no set order: grey cards say what they still need.', show: 'build' },
  { id: 'tip-range', title: 'A driving range earns quickly', body: 'Drivers on the county road stop to hit a bucket at your range. It comes with a dirt car park; gravel or pave it from Build to fit more cars.' },
  { id: 'tip-balls', title: 'Fetch the balls', body: 'Hit balls stay out on the range, and when the ball room runs dry golfers drive on. Take Walk, hold F over the balls (or click a pile), then empty your basket at the ball room.', show: 'balls' },
  { id: 'tip-course', title: 'Holes earn green fees', body: `New hole and the clubhouse open once the range has taken $${JAM_RAMP_TAKINGS.toLocaleString('en-US')} in a season. Each playable hole earns green fees once a clubhouse stands.` },
  { id: 'tip-bank', title: 'Borrow or save', body: 'Click your cash to open the Bank: a loan shows its total interest before you sign, and savings earn a little each month.', show: 'bank' },
  { id: 'tip-practice', title: 'The practice area (optional)', body: 'A practice area with putting and chipping greens draws a few more golfers and lets you practise your own game. Build it if and when it suits you.' },
]);
