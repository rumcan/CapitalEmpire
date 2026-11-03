// T266 (#800): the watchable golfers (golf/pace.ts). Golf's schedule (round.ts, game minutes) plays at the town clock's rate, so a walk of 72 m a
// game minute reads on screen as 54 tiles a sim second even on the day/night clock's slow golf hours (86 at the old 2.4, 36 on the tournament day),
// sprinting past cars that drive at their real speed. A pacer stands between the schedule and the screen, one mover per id: it walks after where
// the schedule has it at its cap (tiles a sim second, as the cars drive) and holds still while told to (a swing at its natural length).
// T294 (#879, the owner: "they teleport and disappear while playing golf"): T266 faded a mover out and cut him to his walk's end whenever the walk
// could not be made at the cap in time, which on the 10-minute day is nearly every walk (the schedule walks a round at ~19 tiles a sim second).
// Now he always walks: at the cap when that gets him to his walk's end by its deadline (his next address, say), else just as fast as he must (the
// walk spread over all the time the schedule gives him, the waits on his group included), and with no deadline fast enough to stay within GAP of the
// schedule: never more than GAP behind it. The schedule never changes. Pure TS; typed arrays, no allocation once warm.

/** with no deadline: the most (tiles) a mover trails the schedule by */
export const GAP = 3;
/** a fade in, real seconds (a mover snapped to a shot struck away from where he was shown: view.ts) */
export const FADE_IN_S = 0.24;
/** the time (sim seconds) a mover takes to close most of what is left of his walk once its deadline has gone */
export const CATCH_S = 0.25;
/** a mover not stepped for this many real seconds (off the screen, a jump of the clock) starts again where the schedule has it */
const STALE_S = 0.75;
/** close enough (tiles): near(), and the slack of a hold */
const NEAR = 0.3;
const FOLLOW = 1;

export class Pacer {
  /** the mover's point, how visible it is (0..1) and whether it walked, as of its last step */
  x = 0; y = 0; alpha = 1; walked = false;
  /** its heading when it walked (tiles; unnormalised) */
  hx = 0; hy = 0;
  private px: Float64Array; private py: Float64Array; private pa: Float32Array; private st: Uint8Array; private lastR: Float64Array; private lastS: Float64Array;
  readonly cap: number;

  /** movers 0..size-1 (more grow it), walking at cap tiles a sim second unless they must walk faster */
  constructor(size: number, cap: number) {
    this.cap = cap; const n = Math.max(1, size);
    this.px = new Float64Array(n); this.py = new Float64Array(n); this.pa = new Float32Array(n); this.st = new Uint8Array(n); this.lastR = new Float64Array(n); this.lastS = new Float64Array(n);
  }
  private grow(n: number): void {
    const g = <T extends Float64Array | Float32Array | Uint8Array>(a: T): T => { const b = new (a.constructor as new (k: number) => T)(n); b.set(a); return b; };
    this.px = g(this.px); this.py = g(this.py); this.pa = g(this.pa); this.st = g(this.st); this.lastR = g(this.lastR); this.lastS = g(this.lastS);
  }

  /** mover id, the schedule at (tx, ty) walking to (ex, ey) (NaN: not walking, or its end not known), needed there within `left` sim seconds
   *  (Infinity or NaN: no deadline known), held still (hold) at real seconds now and sim seconds simT: its point, alpha and walk into x, y, alpha,
   *  walked (hx, hy). T294: a mover is never faded out or cut to his walk's end: he walks at the cap, or as fast as he must to be at his walk's end
   *  by its deadline (what is left of it, to the schedule's point and on to the end, over the time left; a deadline gone, over CATCH_S); with no
   *  deadline, never more than GAP behind the schedule. A hold gives way when he could no longer make his walk at the cap after it (walked tells) */
  step(id: number, tx: number, ty: number, ex: number, ey: number, hold: boolean, now: number, simT: number, left = NaN): void {
    if (id >= this.px.length) this.grow(Math.max(id + 1, this.px.length * 2));
    const dR = now - this.lastR[id]!, dS = simT - this.lastS[id]!, end = Number.isFinite(ex);
    let x = this.px[id]!, y = this.py[id]!, a = this.pa[id]!;
    this.walked = false;
    if (this.st[id] === 0 || dR > STALE_S || dR < 0 || dS < 0) { x = tx; y = ty; a = 1; } // (new on the screen, or back after a while: where the schedule has him)
    else {
      const dx = tx - x, dy = ty - y, d = Math.hypot(dx, dy), due = end && Number.isFinite(left);
      // what is left of his walk: to the schedule's point, then on to the end; or straight to the end once he is ahead of the schedule
      let rem = 0;
      if (due) { const toEnd = Math.hypot(ex - x, ey - y), tEnd = Math.hypot(ex - tx, ey - ty); rem = toEnd > tEnd ? d + tEnd : toEnd; }
      // (held only while he can still make his walk at the cap after it: a swing's natural length gives way to his next address)
      if (hold && due && rem > this.cap * Math.max(0, left) + NEAR) hold = false;
      if (!hold && d > 1e-9 && dS > 0) {
        let v = this.cap;
        if (due) v = Math.max(v, rem / (left > 0 ? left : CATCH_S)); // (in time: at his walk's end right at the deadline; a deadline gone: within about CATCH_S)
        // (no deadline: never more than GAP behind the schedule)
        const k = Math.min(1, Math.max(v * dS, due ? 0 : d - GAP) / d); x += dx * k; y += dy * k; this.walked = true; this.hx = dx; this.hy = dy;
      }
      // (a mover snapped to a shot struck away from where he was shown fades in from there)
      if (a < 1) a = Math.min(1, a + (dR > 0 ? dR / FADE_IN_S : 0));
    }
    this.st[id] = FOLLOW; this.px[id] = x; this.py[id] = y; this.pa[id] = a; this.lastR[id] = now; this.lastS[id] = simT;
    this.x = x; this.y = y; this.alpha = a;
  }
  /** mover id out of sight (a rider in his cart, say): he starts again where the schedule has him when he is next stepped */
  drop(id: number): void { if (id < this.st.length) this.st[id] = 0; }
  /** mover id cut to (x, y), following the schedule again from there (a shot struck while he was still a little short of his ball) */
  snap(id: number, x: number, y: number): void {
    if (id >= this.px.length) this.grow(Math.max(id + 1, this.px.length * 2));
    if (this.st[id] === 0) return;
    this.px[id] = x; this.py[id] = y; this.st[id] = FOLLOW; // (T294: no blink: a short cut, he walks to his ball in time now)
  }
  /** whether mover id is within a little of (x, y) */
  near(id: number, x: number, y: number): boolean { return id < this.px.length && this.st[id] !== 0 && (this.px[id]! - x) ** 2 + (this.py[id]! - y) ** 2 < NEAR * NEAR * 4; }
}
