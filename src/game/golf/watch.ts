// T320 (#908, the owner 2026-11-03: "Slow speed for watching"): game speeds below 1x, and the watching speed. The 10-minute town day plays golf's
// hours at 1.5 game minutes a sim second, so a round's walks show at up to ~54 tiles a sim second at 1x (the walk cap is 1.4: golf/pace.ts).
// Below 1x the whole game slows together (the sim worker steps once every 1/k frames, the clock and the pacers read the sim time), and the golf
// pacers hold their caps in real seconds (play/pacer.ts setPaceSpeed), so golfers are shown at a natural pace. Following a golf group, or the
// owner's own live round, switches to WATCH_SPEED and leaving returns to the speed before. Pure TS.

/** the watching speed (sim seconds a real second): the speed following a group or playing your own round switches to. Tunable. At 1/40x the
 *  10-minute day's golf hours run at 0.0375 game minutes a real second, where the schedule's walk (72 m a game minute) shows at 1.35 tiles a
 *  real second, under the 1.4 cap (F:/ClaudeTemp/T320/slow.ts: p50 1.35, p90 1.5 tiles/s); at 1/16x they show at ~2.6 (p50), at 1/32x ~1.7 */
export const WATCH_SPEED = 1 / 40;
/** the speeds the time controls offer (sim seconds a real second; 0 is paused): the watching speed and the slow ones, 1x, and the fast ones */
export const SPEEDS: readonly number[] = [...new Set([WATCH_SPEED, 1 / 16, 1 / 4, 1 / 2, 1, 2, 4, 8, 20])].sort((a, b) => a - b);
/** a speed's label in the speed bar ("1/16", "1", "20"); the × goes after it */
export function speedLabel(k: number): string { return k > 0 && k < 1 ? `1/${Math.round(1 / k)}` : String(k); }

/** why the game watches: following golfers, or the owner's own live round */
export type WatchWhy = 'follow' | 'own';

/** the watch mode's speed: on while any reason holds, remembering the speed it switched from. set() returns the speed to set now, or null for
 *  no change: entering, WATCH_SPEED; leaving, the speed before, unless the player chose another speed while watching (his choice stands) */
export class WatchSpeed {
  private why = new Set<WatchWhy>();
  /** the speed before watching (null: not watching) */
  before: number | null = null;
  get on(): boolean { return this.why.size > 0; }
  has(why: WatchWhy): boolean { return this.why.has(why); }
  /** reason `why` on or off, `cur` the running speed now (the remembered one while paused or a shot is open) */
  set(why: WatchWhy, on: boolean, cur: number): number | null {
    const was = this.why.size > 0;
    if (on) this.why.add(why); else this.why.delete(why);
    const is = this.why.size > 0;
    if (!was && is) { this.before = cur; return cur === WATCH_SPEED ? null : WATCH_SPEED; }
    if (was && !is) { const b = this.before; this.before = null; return b !== null && cur === WATCH_SPEED && b !== WATCH_SPEED ? b : null; }
    return null;
  }
}

/** T320: the sim worker's steps at a speed: below 1x a fraction of a step a frame, carried until a whole one is due (the sim's steps and its
 *  time are the same at every speed, so nothing drifts and saves and replays are unaffected); 1x and faster (and paused) as before: k steps */
export class StepClock {
  private acc = 0;
  /** the whole steps of this frame at speed k */
  take(k: number): number {
    if (!(k > 0 && k < 1)) { this.acc = 0; return k; }
    this.acc += k; const n = Math.floor(this.acc + 1e-9); this.acc = Math.max(0, this.acc - n); return n;
  }
}
