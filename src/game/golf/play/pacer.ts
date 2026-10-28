// T266 (#800): the watchable golfers (?golfPace=walk or mix, golf/pace.ts). Everyday golf's schedule (round.ts, game minutes) plays at the town
// clock's rate, so a walk of 72 m a game minute reads on screen as 86 tiles a sim second at main's 2.4 town minutes a second, sprinting past cars
// that drive at their real speed. A pacer stands between the schedule and the screen, one mover per id: it walks toward where the schedule has it
// at its cap at most (tiles a sim second, as the cars drive), holds still while told to (a swing at its natural length), and when the schedule has
// run more than GAP ahead it fades out, comes back at the end of the schedule's walk (where it is going) and waits there for the schedule to
// arrive; with no known end it stays out until the schedule comes to rest. The schedule never changes. Pure TS; typed arrays, no allocation.

/** the gap (tiles) past which a mover stops walking after the schedule and fades out to catch it up */
export const GAP = 3;
/** a fade out or in, real seconds */
export const FADE_S = 0.25;
/** a mover not stepped for this many real seconds (off the screen, a jump of the clock) starts again where the schedule has it */
const STALE_S = 0.75;
/** close enough (tiles): the schedule has reached the mover waiting at its walk's end */
const NEAR = 0.3;
const FOLLOW = 1, OUT = 2, AHEAD = 3, HIDDEN = 4;

export class Pacer {
  /** the mover's point, how visible it is (0..1) and whether it walked, as of its last step */
  x = 0; y = 0; alpha = 1; walked = false;
  /** its heading when it walked (tiles; unnormalised) */
  hx = 0; hy = 0;
  private px: Float64Array; private py: Float64Array; private pa: Float32Array; private st: Uint8Array; private at: Float64Array;
  private lastR: Float64Array; private lastS: Float64Array; private tx: Float64Array; private ty: Float64Array; private ex: Float64Array; private ey: Float64Array;
  readonly cap: number;

  /** movers 0..size-1 (more grow it), walking at most cap tiles a sim second */
  constructor(size: number, cap: number) {
    this.cap = cap; const n = Math.max(1, size);
    this.px = new Float64Array(n); this.py = new Float64Array(n); this.pa = new Float32Array(n); this.st = new Uint8Array(n); this.at = new Float64Array(n);
    this.lastR = new Float64Array(n); this.lastS = new Float64Array(n); this.tx = new Float64Array(n); this.ty = new Float64Array(n); this.ex = new Float64Array(n); this.ey = new Float64Array(n);
  }
  private grow(n: number): void {
    const g = <T extends Float64Array | Float32Array | Uint8Array>(a: T): T => { const b = new (a.constructor as new (k: number) => T)(n); b.set(a); return b; };
    this.px = g(this.px); this.py = g(this.py); this.pa = g(this.pa); this.st = g(this.st); this.at = g(this.at); this.lastR = g(this.lastR); this.lastS = g(this.lastS);
    this.tx = g(this.tx); this.ty = g(this.ty); this.ex = g(this.ex); this.ey = g(this.ey);
  }

  /** mover id, the schedule at (tx, ty) walking to (ex, ey) (NaN: not walking, or its end not known), held still (hold) at real seconds now and sim
   *  seconds simT: its point, alpha and walk into x, y, alpha, walked (hx, hy) */
  step(id: number, tx: number, ty: number, ex: number, ey: number, hold: boolean, now: number, simT: number): void {
    if (id >= this.px.length) this.grow(Math.max(id + 1, this.px.length * 2));
    const dR = now - this.lastR[id]!, dS = simT - this.lastS[id]!;
    let st = this.st[id]!, x = this.px[id]!, y = this.py[id]!, a = this.pa[id]!;
    this.walked = false;
    if (st === 0 || dR > STALE_S || dR < 0 || dS < 0) { st = FOLLOW; x = tx; y = ty; a = 1; }
    else {
      const rest = (tx - this.tx[id]!) ** 2 + (ty - this.ty[id]!) ** 2 < 1e-8;
      if (st === AHEAD || st === HIDDEN) {
        // waiting at the walk's end (fading in) or out of sight: the schedule has arrived (follow it again), or gone on to another end (out again)
        if (st === AHEAD) a = Math.min(1, (now - this.at[id]!) / FADE_S);
        if ((tx - x) ** 2 + (ty - y) ** 2 < NEAR * NEAR) { st = FOLLOW; x = tx; y = ty; }
        else if (st === HIDDEN && rest) { st = AHEAD; x = tx; y = ty; this.at[id] = now; a = 0; }
        else if (st === AHEAD && Number.isFinite(ex) && (ex - this.ex[id]!) ** 2 + (ey - this.ey[id]!) ** 2 > NEAR * NEAR) { st = OUT; this.at[id] = now - (1 - a) * FADE_S; }
      }
      if (st === FOLLOW || st === OUT) {
        // walking after the schedule at the cap (still while held)
        const dx = tx - x, dy = ty - y, d = Math.hypot(dx, dy), s = hold ? 0 : this.cap * dS;
        if (d > 1e-9 && s > 0) { const k = Math.min(1, s / d); x += dx * k; y += dy * k; this.walked = true; this.hx = dx; this.hy = dy; }
        if (st === FOLLOW && d - s > GAP && !hold) { st = OUT; this.at[id] = now; }
        if (st === OUT) {
          a = Math.max(0, 1 - (now - this.at[id]!) / FADE_S);
          if (a <= 0) {
            // out of sight: back at the walk's end to wait for the schedule there, else out until the schedule comes to rest
            if (Number.isFinite(ex)) { st = AHEAD; x = ex; y = ey; this.at[id] = now; this.ex[id] = ex; this.ey[id] = ey; }
            else st = HIDDEN;
            this.walked = false;
          }
        }
      }
    }
    if (st === FOLLOW) a = Math.min(1, a + (dR > 0 ? dR / FADE_S : 0));
    if (st !== AHEAD || !Number.isFinite(this.ex[id]!)) { this.ex[id] = ex; this.ey[id] = ey; }
    this.st[id] = st; this.px[id] = x; this.py[id] = y; this.pa[id] = a; this.lastR[id] = now; this.lastS[id] = simT; this.tx[id] = tx; this.ty[id] = ty;
    this.x = x; this.y = y; this.alpha = st === HIDDEN ? 0 : a;
  }
  /** mover id cut to (x, y), fading in from there as it follows the schedule again (a shot struck while it was still catching up) */
  snap(id: number, x: number, y: number): void {
    if (id >= this.px.length) this.grow(Math.max(id + 1, this.px.length * 2));
    if (this.st[id] === 0) return;
    this.px[id] = x; this.py[id] = y; this.st[id] = FOLLOW; this.pa[id] = 0;
  }
  /** whether mover id is within NEAR of (x, y) */
  near(id: number, x: number, y: number): boolean { return id < this.px.length && this.st[id] !== 0 && (this.px[id]! - x) ** 2 + (this.py[id]! - y) ** 2 < NEAR * NEAR * 4; }
}
