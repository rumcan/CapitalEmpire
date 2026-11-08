// T350 (#993; the owner, 2026-11-08: "there should be a start round button and we move the time to the tee time and the round starts and time now slows down to the pace of play"):
// the pure rules of starting your own round. The game never plays your round for you unless you say so:
// - A booking (golf/player.ts Booking) is a tee time to play yourself. The model plays it only when `auto` is set, which only "Let the game play it" does.
// - Start round fast-forwards the clock to the tee time (FF_SPEED), then begins your round (your booked round, today's club event at the next free tee time, the tournament's group).
// - On the course the clock runs no faster than the pace of play (watch.ts WATCH_SPEED); a pause and the slower speeds go through.
// - When the booked tee time has come and no round is under way, the game asks ("play now or let the game play it?"); a booking whose day is over lapses.
// Pure TS, no DOM.
import { WATCH_SPEED } from './watch';

/** the clock's speed while it runs to your tee time, far off (the speed bar's fastest) */
export const FF_SPEED = 20;
/** the speed the clock runs at with `left` game minutes to the tee time (by what the sim has really done, Infinity: another day): the fastest far off, slower as it nears. The clock shown runs ahead of
 *  the sim by about a second of its speed (the sim client moves it on between the worker's frames) and steps back when the speed drops, so a fast arrival would show a time past the tee time and then an earlier
 *  one: it arrives at 1x, where the difference is about a minute. Each is a speed the speed bar has */
export function ffSpeed(left: number): number { return left > 80 ? FF_SPEED : left > 25 ? 8 : left > 8 ? 4 : 1; }
/** what a Start round is for: your booked tee time, today's club event (the next free tee time on the sheet), the tournament you joined (the minute before its tee time) */
export type StartKind = 'booked' | 'event' | 'tournament';
/** a Start round waiting for the clock: what it starts, the town day and the minute it waits for, the speed the clock goes back to, and the event (for kind 'event') */
export interface StartPlan { kind: StartKind; day: number; min: number; before: number; id?: string }

/** what the clock does for a plan at town day `day`, minute `dayMin`: keep running to the tee time ('forward'), the tee time has come ('start'), or the plan's day is over ('drop') */
export function planStep(plan: Pick<StartPlan, 'day' | 'min'>, day: number, dayMin: number): 'forward' | 'start' | 'drop' {
  if (day > plan.day) return 'drop';
  return day < plan.day || dayMin < plan.min ? 'forward' : 'start';
}

/** the speed the clock may run at: on the course no faster than the pace of play, a pause (0) and the slower speeds as asked; off the course as asked */
export function roundSpeed(k: number, onCourse: boolean): number { return onCourse && k > WATCH_SPEED ? WATCH_SPEED : k; }

/** a booking as far as starting needs it */
export interface BookingLike { day: number; tee: number; auto?: boolean }
/** what a booking is on town day `day` at minute `dayMin`: none, 'wait' (the tee time is ahead), 'due' (it has come: the game asks, unless a round is under way), 'auto' (the game plays it, because you said
 *  so), or 'over' (its day is past: it lapses) */
export function bookingStep(b: BookingLike | null | undefined, day: number, dayMin: number): 'none' | 'wait' | 'due' | 'auto' | 'over' {
  if (!b) return 'none';
  if (b.day < day) return 'over';
  if (b.day > day) return 'wait';
  if (b.auto) return 'auto';
  return dayMin >= b.tee ? 'due' : 'wait';
}

/** the line the first-tee card says about a booking that is yours to play: "Your tee time: 11:20", "Your tee time has passed: 11:20", or the game's: "The game plays your round: 11:20" */
export function bookingLine(b: { tee: number; auto?: boolean; late?: boolean }, clock: (m: number) => string): string {
  return `${b.auto ? 'The game plays your round' : b.late ? 'Your tee time has passed' : 'Your tee time'}: ${clock(b.tee)}`;
}
