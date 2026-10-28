// The round (docs/GOLF-PLAY.md decision 4): the whole day played at the start, group by group and hole by hole, then the state of each golfer at a
// game minute for the playback. Times are game minutes of the day; distances are tiles unless named M. Pure TS, no DOM.
// The stepping (HoleRun, GroupRun) is shared by playRound and the owner's live group (live.ts), so both keep one time model.
import { TILE_M } from '../types';
import { carryM, chooseShot, hitShot, putt, rng } from './shot';
import { CART_PACE } from './entourage';
import type { Club, CourseView, Golfer, Group, GolferState, Lie, Pace, PlayHole, Pt, RoundPlan, Shot, Standing, Wait } from './types';
import type { TeeKind } from '../types';
import { holeFrom } from './courseview';

/** the walking pace (metres per game minute) */
export const WALK_M = 72;
/** the routine of a club golfer's full shot: the minutes from his strike to the next strike of his group (the look, the club, the swing) */
export const FULL_ROUTINE = 0.85;
/** the same for a pro's full shot (game minutes) */
export const PRO_ROUTINE = 0.75;
/** the same for a putt (game minutes) */
export const PUTT_ROUTINE = 0.55;
/** the time a full shot's ball is in the air (game minutes) */
export const FLIGHT_TIME = 0.25;
/** the same for a putt, a slow roll to the hole (game minutes) */
export const PUTT_FLIGHT = 0.4;
/** the last part of the wait before a shot, when the golfer addresses the ball (game minutes) */
export const ADDRESS_TIME = 0.25;
/** the stroke itself, from the start of the swing to the ball leaving (game minutes) */
export const SWING_TIME = 0.15;
/** T211 pace of play: a tee shot's landing area, metres from the tee. The group behind tees off once every ball of the group ahead lies farther than
 *  this from the tee, or is holed (on a hole shorter than this, once the group ahead has holed out) */
export const LANDING_M = 300;
/** T211: the green is clear this long (game minutes) after the group ahead's last ball drops: its golfers walk off */
export const GREEN_CLEAR = 0.2;
/** T211: the owner may hit any club at any power, so his shot waits for the green when the pin is within this share of his driver's carry plus
 *  OWNER_REACH_M metres (the model's golfers wait when they aim at the pin or their ball would finish on the green) */
export const OWNER_REACH = 1.4, OWNER_REACH_M = 15;
/** the strokes on a hole at which a golfer picks up (the score is then 10) */
export const PICK_UP = 10;
/** a holed golfer steps off the green this far from the pin, toward the next tee (the last hole: toward his last stand), tiles */
export const STEP_TILES = 4;
/** the holed golfers of a group stand apart across that direction: (slot - 1) times this, tiles (slot: his place in the group, 0..3) */
export const SPREAD_TILES = 1.2;
/** T211: a group waiting on a tee (after the first) stands this far behind it, away from the hole, spread across by slot as at a step-off (tiles) */
export const TEE_BACK = 1.5;
/** T211: the minutes a waiting golfer takes to step up from his place behind the tee to the tee, before his address */
export const STEP_IN = 0.1;

/** the walk in game minutes between two points */
export const walkMin = (a: Pt, b: Pt): number => Math.hypot(b.x - a.x, b.y - a.y) * TILE_M / WALK_M;
/** T213: a golfer's move between two points, game minutes: the walk, or CART_PACE of it when he rides a cart (entourage.ts) */
export const moveMin = (a: Pt, b: Pt, cart: boolean): number => walkMin(a, b) * (cart ? CART_PACE : 1);

/** the routine of a stroke: the minutes before the group's next strike (a putt, a pro's full shot, a club golfer's full shot) */
export const routineOf = (club: Club, pro: boolean): number => club === 'putter' ? PUTT_ROUTINE : pro ? PRO_ROUTINE : FULL_ROUTINE;

/** what a golfer does after his last ball on a hole: he walks off from rest (the cup, or where he stood to pick up) to his step-off point at, from
 *  minute t0 to t1 (the walking pace), then stands there until his walk to the next tee */
interface Off { rest: Pt; at: Pt; t0: number; t1: number }

/** the step-off for a golfer who finished a hole at minute t0: STEP_TILES from the pin toward `toward` (the next tee, or on the last hole his last
 *  stand), spread across that direction by his slot in the group. He walks there from rest at the walking pace */
export function offOf(rest: Pt, pin: Pt, toward: Pt, slot: number, t0: number): Off {
  const dx = toward.x - pin.x, dy = toward.y - pin.y, L = Math.hypot(dx, dy), ux = L > 0 ? dx / L : 1, uy = L > 0 ? dy / L : 0, k = (slot - 1) * SPREAD_TILES;
  const at = { x: pin.x + ux * STEP_TILES - uy * k, y: pin.y + uy * STEP_TILES + ux * k };
  return { rest, at, t0, t1: t0 + walkMin(rest, at) };
}

/** a golfer's ball during a hole: where it lies and where he stands, its lie, his strokes, whether he is holed out or picked up (holed), whether his
 *  last stroke went in (cup), when its flight ends (end), the minute he is ready to strike again (ready: his walk from his stand to his ball starts
 *  when he strikes), whether his shots come from the owner's input (owner, live.ts), his own random stream for this hole, and the model's next stroke
 *  once worked out (pend, T211: its outcome does not depend on the minute, so whether it must wait for the green can follow from where it ends); T213:
 *  whether he rides a cart (his moves take CART_PACE of the walk) */
export interface Player { id: number; pro: boolean; skill: number; owner: boolean; cart: boolean; ball: Pt; stand: Pt; lie: Lie; strokes: number; holed: boolean; cup: boolean; end: number; ready: number; r: () => number; pend: Pending | null;
  /** T254: the tee set he plays from (absent: the hole's furthest back) */ set?: TeeKind }

/** the model's next stroke for a golfer, worked out before its minute: the club, where the ball ends and its lie, the penalty, whether it goes in, its
 *  flight, and whether it plays to the green (T211: aimed at the pin, or ending on the green), so it waits until the group ahead is off the green */
interface Pending { club: Club; to: Pt; lie: Lie; penalty: 0 | 1; holed: boolean; dur: number; green: boolean }

/** what a round's play writes to: the course, the seed, the golfers by id, the shots (in the order struck), the done minutes and the pace (T211) */
export interface PlayCtx { view: CourseView; seed: number; who: Map<number, Golfer>; out: Shot[]; done: number[]; pace: Pace }

/** one group's play of one hole. A golfer strikes when he is ready (his walk to his ball is done), the group's last strike's routine is over and the
 *  group ahead on the hole lets him (T211, gate), the farthest from the pin first. `first` is the group's first strike on the hole; `now` is when the last
 *  flight ends */
export class HoleRun {
  /** each golfer's ball and state, in the group's order */
  readonly ps: Player[]; readonly h: number;
  /** the group playing the hole, and the group ahead on it (null: none), whose landing-area and green minutes gate this group's strikes (T211) */
  readonly g: GroupRun; readonly ahead: GroupRun | null;
  /** the end of the last flight, the group's first strike, and the group's last strike and its routine (none yet: -Infinity) */
  now: number; first = -1; private last = -Infinity; private routine = 0; private c: PlayCtx;
  constructor(c: PlayCtx, gr: Group, h: number, start: number, g: GroupRun, ahead: GroupRun | null) {
    this.c = c; this.h = h; this.now = start; this.g = g; this.ahead = ahead;
    const hole = c.view.holes[h]!;
    // T254: each golfer tees off from his own set (the nearest the hole has)
    this.ps = gr.players.map(id => { const q = c.who.get(id)!, tee = holeFrom(hole, q.tees).tee; return { id, pro: q.pro, skill: q.skill, owner: !!q.owner, cart: q.cart !== undefined && !q.owner, ball: { ...tee }, stand: { ...tee }, lie: 'tee' as Lie, strokes: 0, holed: false, cup: false, end: start, ready: start, r: rng(c.seed, id, h), pend: null, ...(q.tees ? { set: q.tees } : {}) }; });
  }
  /** the golfer to strike next: the one farthest from the pin among those not holed (the group's order on a tie); null when the hole is over */
  next(): Player | null {
    const pin = this.c.view.holes[this.h]!.pin; let p: Player | null = null, far = -1;
    for (const b of this.ps) if (!b.holed) { const d = Math.hypot(pin.x - b.ball.x, pin.y - b.ball.y); if (d > far) { far = d; p = b; } }
    return p;
  }
  /** the minute p strikes by his own group's pace: when he is ready, and no sooner than the group's last strike plus its routine */
  strikeAt(p: Player): number { return Math.max(p.ready, this.last + this.routine); }
  /** T211: the earliest minute the group ahead on this hole lets p strike (-Infinity with none; Infinity while it has not happened yet, so the group
   *  waits): a tee shot once the group ahead is out of the landing area; a shot that plays to the green once the group ahead is off it. The owner's
   *  green is by reach (any shot within OWNER_REACH of his driver), the model's by its worked-out stroke. One look at the group ahead only */
  gate(p: Player): number {
    const a = this.ahead; if (!a) return -Infinity;
    const h = this.h, hole = this.c.view.holes[h]!;
    let g = p.lie === 'tee' ? a.clear[h]! : -Infinity;
    const green = p.owner ? Math.hypot(hole.pin.x - p.ball.x, hole.pin.y - p.ball.y) * TILE_M <= OWNER_REACH * carryM('driver', p.skill) + OWNER_REACH_M : this.pending(p).green;
    if (green) g = Math.max(g, a.out[h]!);
    return g;
  }
  /** the minute p strikes: his group's pace and the group ahead's gate (Infinity while the group ahead holds him up) */
  timeOf(p: Player): number { return Math.max(this.strikeAt(p), this.gate(p)); }
  /** records p's stroke, from his ball to `to`, struck at t (its flight dur): his strokes (a penalty adds one), his ball and stand, his walk to the new ball
   *  (ready at t + walk), and the group's last strike; a golfer holed out or picked up at PICK_UP is out of the hole. A strike later than the group's own
   *  pace is a wait on the group ahead (T211, pace.waits), and the first time every ball is out of the landing area is the group's clear minute */
  record(p: Player, club: Club, t: number, dur: number, to: Pt, lie: Lie, penalty: 0 | 1, holed: boolean): Shot {
    const from = { x: p.ball.x, y: p.ball.y }, s: Shot = { golfer: p.id, hole: this.h, stroke: p.strokes + 1, t, from, to, club, lie, penalty, holed };
    const free = this.strikeAt(p);
    if (t > free + 1e-9) { this.c.pace.waits.push({ group: this.g.idx, hole: this.h, at: p.lie === 'tee' ? 'tee' : 'green', from: free, to: t }); this.g.waited = this.h; }
    if (this.first < 0) this.first = t;
    this.c.out.push(s);
    p.strokes += 1 + penalty;
    if (holed || p.strokes >= PICK_UP) { p.holed = true; p.strokes = Math.min(p.strokes, PICK_UP); }
    p.ball = to; p.stand = from; p.lie = lie; p.cup = holed; p.end = this.now = t + dur; p.pend = null;
    p.ready = t + moveMin(from, to, p.cart); this.last = t; this.routine = routineOf(club, p.pro);
    // the landing area: clear once every ball is holed or beyond LANDING_M from the tee (all holed: once they have walked off the green too)
    const cl = this.g.clear;
    if (cl[this.h] === Infinity) {
      const tee = this.c.view.holes[this.h]!.tee, R = LANDING_M / TILE_M;
      let clear = true, all = true;
      for (const b of this.ps) if (!b.holed) { all = false; if (Math.hypot(b.ball.x - tee.x, b.ball.y - tee.y) <= R) { clear = false; break; } }
      if (clear) cl[this.h] = t + dur + (all ? GREEN_CLEAR : 0);
    }
    return s;
  }
  /** the model's stroke for p, worked out once (the club and aim from his lie, chooseShot; a putt by putt, else hitShot) */
  private pending(p: Player): Pending {
    if (p.pend) return p.pend;
    const hole = holeFrom(this.c.view.holes[this.h]!, p.set), k = chooseShot(p.lie, p.ball, hole, p.skill, p.lie === 'tee'); // T254: his set's line
    if (k.club === 'putter') {
      const from = p.ball, dx = hole.pin.x - from.x, dy = hole.pin.y - from.y, L = Math.hypot(dx, dy), o = putt(p.r, p.skill, L * TILE_M);
      // a miss leaves the ball on the putt's line, on the far side of the pin
      const s = L > 0 ? o.leaveM / TILE_M / L : 0, to = o.holed ? { x: hole.pin.x, y: hole.pin.y } : { x: hole.pin.x + dx * s, y: hole.pin.y + dy * s };
      return p.pend = { club: 'putter', to, lie: o.holed ? 'green' : this.c.view.lieAt(to.x, to.y), penalty: 0, holed: o.holed, dur: PUTT_FLIGHT, green: true };
    }
    const o = hitShot(p.r, p.skill, p.lie, p.ball, k.aim, k.club, this.c.view), atPin = k.aim.x === hole.pin.x && k.aim.y === hole.pin.y;
    return p.pend = { club: k.club, to: o.to, lie: o.lie, penalty: o.penalty, holed: false, dur: FLIGHT_TIME, green: atPin || o.lie === 'green' };
  }
  /** the model's stroke for p at its minute (timeOf, which must be known). Recorded, and returned */
  model(p: Player): Shot {
    const k = this.pending(p), t = this.timeOf(p);
    if (!Number.isFinite(t)) throw new Error(`HoleRun.model: golfer ${p.id} is held up on hole ${this.h}`);
    return this.record(p, k.club, t, k.dur, k.to, k.lie, k.penalty, k.holed);
  }
}

/** one group's day: its holes in play order, each from the minute it reaches the tee (its walk from the last green). Per hole (T211; Infinity until
 *  known): the minute it reached the tee (arrive), its first strike (first, -1 until then), when its balls were out of the landing area (clear) and
 *  when it was off the green (out); the groups behind wait on the last two */
export class GroupRun {
  readonly idx: number; readonly first: number[]; readonly arrive: number[]; readonly clear: number[]; readonly out: number[];
  h = 0; hole: HoleRun | null = null;
  /** the minute it reaches its next tee */
  ready: number;
  /** T211: the group it stands aside for on its next tee (a wave-through), until that group has begun the hole */
  hold: GroupRun | null = null;
  /** T211: the group that began each hole right behind this one (the wave-through looks one group back) */
  readonly behind: (GroupRun | null)[];
  /** T211: the last hole it waited on the group ahead (-1: none), and the groups it was waved through (it never waves them back) */
  waited = -1; readonly passed: GroupRun[] = [];
  /** T211: the hole it was last waved through on (-1: none): it does not wave others through there (the groups held up behind a slow group would all
   *  look slow on that tee and wave each other on) */
  waved = -1;
  private c: PlayCtx; private gr: Group;
  constructor(c: PlayCtx, gr: Group, idx: number) {
    const N = c.view.holes.length;
    this.c = c; this.gr = gr; this.idx = idx; this.ready = gr.tee;
    this.first = new Array<number>(N).fill(-1); this.arrive = new Array<number>(N).fill(Infinity); this.clear = new Array<number>(N).fill(Infinity);
    this.out = new Array<number>(N).fill(Infinity); this.behind = new Array<GroupRun | null>(N).fill(null);
    if (N) this.arrive[0] = gr.tee;
  }
  /** starts the next hole from its arrival at the tee, behind `ahead` (the group that began it before, or null); false once every hole is played */
  begin(ahead: GroupRun | null = null): boolean {
    if (this.h >= this.c.view.holes.length) return false;
    this.hole = new HoleRun(this.c, this.gr, this.h, this.ready, this, ahead);
    return true;
  }
  /** ends the hole: off the green (out); the group's walk to the next tee; on the last hole, each golfer's done minute (his walk off the last green) */
  finish(): void {
    const run = this.hole!, holes = this.c.view.holes, h = this.h, N = holes.length, pin = holes[h]!.pin;
    this.first[h] = run.first; this.out[h] = run.now + GREEN_CLEAR;
    if (this.clear[h] === Infinity) this.clear[h] = this.out[h]!;
    // (T213: a group all in carts drives to the next tee, CART_PACE of the walk)
    if (h + 1 < N) { this.ready = run.now + moveMin(pin, holes[h + 1]!.tee, run.ps.every(b => b.cart)); this.arrive[h + 1] = this.ready; }
    if (h === N - 1) for (const b of run.ps) this.c.done[b.id] = offOf(b.cup ? b.ball : b.stand, pin, b.stand, this.gr.players.indexOf(b.id), b.end).t1;
    this.hole = null; this.h++;
  }
  /** whether it has begun hole h (reached the tee and is playing it, or past it) */
  begun(h: number): boolean { return this.h > h || (this.h === h && this.hole !== null); }
  /** whether it has struck its first tee shot on hole h (or is past it) */
  teedOff(h: number): boolean { return this.h > h || (this.h === h && this.hole !== null && this.hole.first >= 0); }
}

/** the owner's next strike, where the field stops for his input (live.ts): his group, his player and the minute */
export interface Due { g: GroupRun; p: Player; t: number }

/** T211: the field's play, every group in one time order, so a group waits for the group ahead on each hole (the group that began the hole before it):
 *  its tee shot until the group ahead is out of the landing area, a shot to the green until the group ahead is off it. The owner's live group (ownerId)
 *  plays in the same order: the field stops at his strike for his input, so the groups behind him wait for him, and resume as he plays. When a slow group
 *  reaches a tee with two holes open ahead of it (the group ahead has teed off two holes on) and the next group right behind (it has teed off the hole
 *  before), the marshal waves that group through: the slow group stands aside on the tee until it has begun the hole, then waits on it.
 *  Each step looks at each group's next event once, against the group ahead only */
export class Field {
  readonly c: PlayCtx; readonly runs: GroupRun[];
  /** the live owner's golfer id (-1: none), and whether he has handed over to the caddie (then the model plays him) */
  ownerId = -1; caddied = false;
  /** the group that began each hole last: the group ahead of the next to begin it */
  private lastOn: (GroupRun | null)[];
  constructor(c: PlayCtx, groups: Group[]) {
    this.c = c;
    this.runs = groups.map((gr, i) => ({ gr, i })).sort((a, b) => a.gr.tee - b.gr.tee || a.i - b.i).map(x => new GroupRun(c, x.gr, x.i));
    for (const r of this.runs) c.pace.arrive[r.idx] = r.arrive;
    this.lastOn = new Array<GroupRun | null>(c.view.holes.length).fill(null);
  }
  /** plays on in time order until every group is done (null), or until the next strike is the live owner's (returned, not played: play it with the
   *  group's HoleRun.record, then settle and run again). The open waits (pace.open) are those as of the stop */
  run(): Due | null {
    for (;;) {
      let best: GroupRun | null = null, bt = Infinity, bp: Player | null = null, any = false;
      for (const g of this.runs) {
        const e = this.next(g);
        if (!e) continue;
        any = true;
        if (e.t < bt) { bt = e.t; best = g; bp = e.p; }
      }
      if (!any) { this.c.pace.open = []; return null; }
      if (!best) throw new Error('Field.run: every group is held up');
      if (!bp) { this.begin(best); continue; }
      if (bp.id === this.ownerId && !this.caddied) { this.c.pace.open = this.open(); return { g: best, p: bp, t: bt }; }
      best.hole!.model(bp);
      this.settle(best);
    }
  }
  /** ends a group's hole once its last ball is in (call after each strike) */
  settle(g: GroupRun): void { if (g.hole && !g.hole.next()) g.finish(); }
  /** a group's next event: its next strike and its minute, or its arrival on its next tee (p null); null once it is done. Infinity: held up */
  private next(g: GroupRun): { p: Player | null; t: number } | null {
    if (g.hole) { const p = g.hole.next()!; return { p, t: g.hole.timeOf(p) }; }
    if (g.h >= this.c.view.holes.length) return null;
    if (g.hold) return { p: null, t: g.hold.begun(g.h) ? Math.max(g.ready, g.hold.arrive[g.h]!) : Infinity };
    return { p: null, t: g.ready };
  }
  /** whether group b (on the hole before) is held up by g: it waited there, or its next strike waits now (on the group ahead: g) */
  private heldBy(b: GroupRun, g: GroupRun): boolean {
    if (b.waited === b.h) return true;
    const run = b.hole; if (!run || run.ahead !== g) return false;
    const p = run.next(); return !!p && run.timeOf(p) > run.strikeAt(p) + 1e-9;
  }
  /** a group at its next tee: it waves the group behind through when it holds two holes open and that group is held up by it (it stands aside: hold),
   *  else begins the hole behind the group that began it last. A group never waves back a group that went through it, nor one it went through, and a
   *  group waved through on a hole does not wave others through there */
  private begin(g: GroupRun): void {
    const h = g.h, a = this.lastOn[h]!, N = this.c.view.holes.length;
    if (!g.hold && g.waved !== h && a && h >= 1 && h + 2 < N && a.teedOff(h + 2)) {
      const b = g.behind[h - 1];
      if (b && b.h === h - 1 && b.teedOff(h - 1) && this.heldBy(b, g) && !g.passed.includes(b) && !b.passed.includes(g)) {
        g.hold = b; b.passed.push(g); b.waved = h; this.c.pace.waves.push({ t: g.ready, hole: h, slow: g.idx, through: b.idx }); return;
      }
    }
    g.hold = null;
    g.begin(a);
    if (a) a.behind[h] = g;
    this.lastOn[h] = g;
  }
  /** the waits under way at a stop: each group whose next strike is later than its own pace allows (to Infinity while the group ahead has not let it),
   *  and a group standing aside on its tee */
  private open(): Wait[] {
    const out: Wait[] = [];
    for (const g of this.runs) {
      if (g.hole) {
        const p = g.hole.next()!, free = g.hole.strikeAt(p), t = g.hole.timeOf(p);
        if (t > free + 1e-9) out.push({ group: g.idx, hole: g.h, at: p.lie === 'tee' ? 'tee' : 'green', from: free, to: t });
      } else if (g.hold && g.h < this.c.view.holes.length) out.push({ group: g.idx, hole: g.h, at: 'tee', from: g.ready, to: Infinity });
    }
    return out;
  }
}

/** a shot's effect on the score: a stroke that holes a golfer out, or takes him to a pick-up, is his strokes on that hole (penalties included, at most PICK_UP) */
function score(plan: RoundPlan, s: Shot): void { const k = s.stroke + s.penalty; if (s.holed || k >= PICK_UP) plan.strokes[s.golfer]![s.hole] = Math.min(PICK_UP, k); }

/** the field of a plan made with { live } (live.ts takes it up), and the live group's index */
const fields = new WeakMap<RoundPlan, { field: Field; live: number }>();
/** the live field of a plan made by playRound with { live }, and its live group's index; undefined otherwise */
export function liveField(plan: RoundPlan): { field: Field; live: number } | undefined { return fields.get(plan); }

/** plays the whole day: every group's holes in play order, the shots sorted by time, the strokes per hole and the minute each golfer is done.
 *  The golfer ids are 0..n-1. Groups play by tee time, all in one time order (Field, T211): a group waits on each tee until the group ahead is out of the
 *  landing area and before each shot to the green until the group ahead is off it, a slow group waves the next through, and each walks from each green
 *  to the next tee; the waits and wave-throughs are in plan.pace. Each golfer's random stream is rng(seed, golfer, hole), so one golfer's play never
 *  shifts another's, and the waits only move the minutes. With opts.live (an index into groups), the owner of that group plays by his input: the day is
 *  played up to his first strike, and LiveGroup (live.ts) plays on from there; the golfers not done yet (his group, and the groups behind that wait on
 *  it) have done Infinity */
export function playRound(view: CourseView, golfers: Golfer[], groups: Group[], seed: number, opts?: { live?: number }): RoundPlan {
  const N = view.holes.length, size = Math.max(0, ...golfers.map(g => g.id)) + 1;
  const pace: Pace = { arrive: groups.map(() => new Array<number>(N).fill(Infinity)), waits: [], open: [], waves: [] };
  const plan: RoundPlan = { golfers, groups, shots: [], strokes: Array.from({ length: size }, () => new Array<number>(N).fill(0)), done: new Array<number>(size).fill(0), pace };
  for (const gr of groups) for (const id of gr.players) plan.done[id] = N ? Infinity : gr.tee; // with no holes, a golfer is done at his tee time
  const c: PlayCtx = { view, seed, who: new Map(golfers.map(g => [g.id, g] as const)), out: [], done: plan.done, pace };
  const field = new Field(c, groups), live = opts?.live !== undefined ? groups[opts.live] : undefined;
  if (live) {
    field.ownerId = live.players.find(id => c.who.get(id)?.owner) ?? -1;
    // with no owner in it the live group plays by the model (nothing waits for an input)
    if (field.ownerId < 0) field.caddied = true;
    fields.set(plan, { field, live: opts!.live! });
  }
  field.run();
  plan.shots.push(...c.out); c.out.length = 0;
  plan.shots.sort((a, b) => a.t - b.t || a.golfer - b.golfer);
  for (const s of plan.shots) score(plan, s);
  return plan;
}

/** adds shots to a plan as they are played (the live group's): each goes in at its place by time, and its score is set when it holes out or picks up.
 *  The playback index is rebuilt on its next use. A golfer's done minute is set by his group's last hole (GroupRun.finish) */
export function appendShots(plan: RoundPlan, shots: Shot[]): void {
  for (const s of shots) {
    let lo = 0, hi = plan.shots.length;
    while (lo < hi) { const mid = (lo + hi) >> 1, m = plan.shots[mid]!; if (m.t < s.t || (m.t === s.t && m.golfer <= s.golfer)) lo = mid + 1; else hi = mid; }
    plan.shots.splice(lo, 0, s);
    score(plan, s);
  }
  cache.delete(plan);
}

/** one shot's playback row: the walk toward it (from wf to wt, between ws and we, game minutes: from his stand to his ball, starting when he struck
 *  the shot before), whether it is the golfer's last on its hole, the flight's length, and on the last shot of a hole the step-off (off) */
interface Row { s: Shot; hole: number; last: boolean; dur: number; ws: number; we: number; wf: Pt; wt: Pt; off: Off | null }
/** a golfer's tee time and his shots' rows in order */
interface Track { tee: number; g: number; slot: number; rows: Row[]; /** T254: his tee set (his place behind the tee is behind his own set's) */ set?: TeeKind }
/** the playback index of a plan, built once per plan and view */
interface Cache { view: CourseView; tracks: Track[] }
const cache = new WeakMap<RoundPlan, Cache>();

/** T211: where a golfer of a group waits on a hole's tee: TEE_BACK behind it (away from its first aim point) and spread across by his slot (0..3) */
export function teeSpot(hole: PlayHole, slot: number): Pt {
  const t = hole.tee, a = hole.line[1] ?? hole.pin, dx = a.x - t.x, dy = a.y - t.y, L = Math.hypot(dx, dy), ux = L > 0 ? dx / L : 1, uy = L > 0 ? dy / L : 0;
  const k = (slot - 1) * SPREAD_TILES;
  return { x: t.x - ux * TEE_BACK - uy * k, y: t.y - uy * TEE_BACK + ux * k };
}

/** T211: the minute group g reached the tee of hole h (plan.pace), or `or` when it is not known (a plan made by hand) */
function arriveOf(plan: RoundPlan, g: number, h: number, or: number): number { const a = plan.pace?.arrive[g]?.[h]; return a !== undefined && Number.isFinite(a) ? a : or; }

/** the walk from a step-off (off: its point and the minute he is there) to the next tee, for a group that reaches that tee at minute A: he sets off when
 *  he is free and no sooner than arriving with his group needs (A less the walk), and is there no later than his strike (by) */
function teeWalk(off: Off, tee: Pt, A: number, by: number): { ws: number; we: number } {
  const W = walkMin(off.at, tee); let ws = Math.max(off.t1, A - W); const we = Math.min(ws + W, by); if (ws > we) ws = we;
  return { ws, we };
}

/** builds the playback index: each golfer's rows with their walks. A first stroke on a hole walks from the step-off to the tee with his group, then he
 *  waits there for his turn (linked below); a later stroke walks from his last stand, starting when he struck the shot before, so he walks while the
 *  group waits its turn */
function build(plan: RoundPlan, view: CourseView): Cache {
  const holes = view.holes, size = plan.strokes.length, slot: number[] = [], tracks: Track[] = [];
  plan.groups.forEach((gr, g) => { gr.players.forEach((id, k) => { slot[id] = k; tracks[id] = { tee: gr.tee, g, slot: k, rows: [] }; }); });
  for (let id = 0; id < size; id++) if (!tracks[id]) tracks[id] = { tee: 0, g: -1, slot: 0, rows: [] };
  for (const g of plan.golfers) if (g.tees && tracks[g.id]) tracks[g.id]!.set = g.tees; // T254
  // (T213: a cart's golfer moves between shots at CART_PACE of the walk, as the round timed him)
  const rides = new Uint8Array(size); for (const g of plan.golfers) if (g.cart !== undefined && !g.owner) rides[g.id] = 1;
  for (const s of plan.shots) {
    const tr = tracks[s.golfer]!, pr = tr.rows[tr.rows.length - 1];
    const first = s.stroke === 1, wf = first ? s.from : pr!.s.from, ws = first ? s.t : pr!.s.t, we = first ? s.t : ws + moveMin(wf, s.from, rides[s.golfer] === 1);
    tr.rows.push({ s, hole: s.hole, last: false, dur: s.club === 'putter' ? PUTT_FLIGHT : FLIGHT_TIME, ws, we, wf, wt: s.from, off: null });
  }
  // the last shot of each hole (the golfer is holed out or picked up) carries his step-off; the next hole's first walk starts there, never before he has reached it
  for (const tr of tracks) tr.rows.forEach((r, i) => {
    r.last = r.s.holed || r.s.stroke + r.s.penalty >= PICK_UP;
    if (!r.last) return;
    const toward = r.hole + 1 < holes.length ? holes[r.hole + 1]!.tee : r.s.from;
    r.off = offOf(r.s.holed ? r.s.to : r.s.from, holes[r.hole]!.pin, toward, slot[r.s.golfer]!, r.s.t + r.dur); // the cup, else where he stood (a pick-up)
    const nx = tr.rows[i + 1];
    // (to his place behind the tee, where he waits: teeSpot; he steps up to the tee for his shot)
    if (nx) { nx.wt = teeSpot(holeFrom(holes[nx.hole]!, tr.set), tr.slot); const w = teeWalk(r.off, nx.wt, arriveOf(plan, tr.g, nx.hole, nx.s.t), nx.s.t - STEP_IN - ADDRESS_TIME); nx.wf = r.off.at; nx.ws = w.ws; nx.we = w.we; }
  });
  return { view, tracks };
}

/** the playback index of a plan on a view (built once) */
function cacheOf(plan: RoundPlan, view: CourseView): Cache {
  let c = cache.get(plan);
  if (!c || c.view !== view) { c = build(plan, view); cache.set(plan, c); }
  return c;
}

/** a flight record, reusing the given one when there is one (the playback asks every frame) */
function flightAt(f: GolferState['flight'], from: Pt, to: Pt, u: number): GolferState['flight'] {
  if (f) { f.from = from; f.to = to; f.u = u; return f; }
  return { from, to, u };
}

/** a blank state for a golfer, to be filled by stateOf */
function blank(id: number): GolferState {
  return { golfer: id, hole: 0, x: 0, y: 0, action: 'waiting', ball: null, flight: null, strokes: 0, toPar: 0, thru: 0 };
}

/** the point of a walk at minute m, from wf to wt over [ws, we] (at wf before it starts, at wt once it is over), written into out */
function walkAt(wf: Pt, wt: Pt, ws: number, we: number, m: number, out: GolferState): void {
  const u = we > ws ? Math.min(1, Math.max(0, (m - ws) / (we - ws))) : 1;
  out.x = wf.x + (wt.x - wf.x) * u; out.y = wf.y + (wt.y - wf.y) * u;
}

/** one golfer's state at a minute, written into out (see stateAt). A golfer whose group still plays (done not known yet) and who has no next shot
 *  stands where he is: waiting at his tee (walked there with his group once it has finished the hole before, T211), or holed out at his step-off */
function stateOf(plan: RoundPlan, c: Cache, id: number, m: number, out: GolferState): GolferState {
  const view = c.view, holes = view.holes, N = holes.length, tr = c.tracks[id]!, rows = tr.rows;
  const home = N ? holeFrom(holes[0]!, tr.set).tee : { x: 0, y: 0 }, end = N ? holes[N - 1]!.pin : home, fl = out.flight;
  out.golfer = id; out.hole = 0; out.x = home.x; out.y = home.y; out.action = 'waiting'; out.ball = null; out.flight = null;
  out.strokes = 0; out.toPar = 0; out.thru = 0;
  if (m < tr.tee) return out;
  let cur = -1;
  while (cur + 1 < rows.length && rows[cur + 1]!.s.t <= m) cur++;
  // the score so far: the holes finished by minute m, and the strokes on the hole in play (capped at a pick-up)
  let thru = 0, toPar = 0, strokes = 0;
  for (let i = 0; i <= cur; i++) if (rows[i]!.last) { const k = plan.strokes[id]![rows[i]!.hole]!; thru++; strokes += k; toPar += k - holes[rows[i]!.hole]!.par; }
  if (cur >= 0 && !rows[cur]!.last) { let sum = 0; for (let i = cur; i >= 0 && rows[i]!.hole === rows[cur]!.hole; i--) sum += 1 + rows[i]!.s.penalty; strokes += Math.min(PICK_UP, sum); }
  out.strokes = strokes; out.toPar = toPar; out.thru = thru;
  const j = cur + 1 < rows.length ? rows[cur + 1]! : null;
  // a ball in the air: the swing, then he walks on toward his next ball (on the walk's point); a holed putt follows the ball into the cup
  if (cur >= 0 && m < rows[cur]!.s.t + rows[cur]!.dur) {
    const r = rows[cur]!, s = r.s, post = m >= s.t + SWING_TIME, v = (m - s.t - SWING_TIME) / (r.dur - SWING_TIME), into = post && r.last && s.holed;
    out.action = !post ? (s.club === 'putter' ? 'putt' : 'swing') : r.last ? 'holed' : 'walk';
    out.hole = r.hole; out.ball = s.to; out.flight = flightAt(fl, s.from, s.to, (m - s.t) / r.dur);
    if (into) { out.x = s.from.x + (s.to.x - s.from.x) * v; out.y = s.from.y + (s.to.y - s.from.y) * v; }
    else if (!r.last) { if (j) walkAt(j.wf, j.wt, j.ws, j.we, m, out); else walkAt(s.from, s.to, s.t, s.t + walkMin(s.from, s.to), m, out); }
    else { out.x = s.from.x; out.y = s.from.y; }
    return out;
  }
  // holed out (or picked up): he walks off the green from where his ball came to rest to his step-off, at the walking pace (m >= off.t0 here)
  const off = cur >= 0 ? rows[cur]!.off : null;
  if (off && m < off.t1) {
    const u = (m - off.t0) / (off.t1 - off.t0);
    out.action = 'walk'; out.hole = rows[cur]!.hole; out.x = off.rest.x + (off.at.x - off.rest.x) * u; out.y = off.rest.y + (off.at.y - off.rest.y) * u;
    return out;
  }
  if (!j) {
    if (!Number.isFinite(plan.done[id]!)) { // the group still plays: holed out at his step-off, or walking to his next ball (its stroke not yet played)
      if (off) {
        // T211: his group has reached (or will reach) the next tee but has not struck there yet (it waits on the group ahead): he walks there with
        // his group and waits on the tee, as the row of his tee shot will have it
        const h = rows[cur]!.hole, A = h + 1 < N ? arriveOf(plan, tr.g, h + 1, Infinity) : Infinity;
        if (Number.isFinite(A)) {
          const tee = teeSpot(holeFrom(holes[h + 1]!, tr.set), tr.slot), w = teeWalk(off, tee, A, Infinity);
          if (m >= w.ws) { out.hole = h + 1; if (m < w.we) { walkAt(off.at, tee, w.ws, w.we, m, out); out.action = 'walk'; } else { out.x = tee.x; out.y = tee.y; out.action = 'waiting'; } return out; }
        }
        out.hole = h; out.action = 'holed'; out.x = off.at.x; out.y = off.at.y; return out;
      }
      if (cur >= 0) { const s = rows[cur]!.s; out.hole = s.hole; out.ball = s.to; out.action = 'walk'; walkAt(s.from, s.to, s.t, s.t + walkMin(s.from, s.to), m, out); }
      return out;
    }
    const p = off ? off.at : end; out.action = 'done'; out.hole = N ? N - 1 : 0; out.x = p.x; out.y = p.y; out.ball = end; return out;
  }
  out.hole = j.hole;
  if (m >= j.ws && m < j.we) { // walking: from the step-off to the tee, or from where he stood to his ball
    walkAt(j.wf, j.wt, j.ws, j.we, m, out);
    out.action = 'walk'; out.ball = j.s.from;
    return out;
  }
  if (m < j.ws && off) { // holed out and standing at his step-off, turned to the pin, until he walks to the next tee
    out.hole = rows[cur]!.hole; out.action = 'holed'; out.x = off.at.x; out.y = off.at.y;
    return out;
  }
  // before his walk to the ball he waits where he last stood (so the walk starts from there, no jump)
  // (on the first tee before his strike: waiting there)
  if (m < j.ws) { out.action = j.s.stroke === 1 ? 'waiting' : 'walk'; out.x = j.wf.x; out.y = j.wf.y; out.ball = j.s.from; return out; }
  // at his ball: the address in the last part before the strike; before it, on a tee, waiting for his turn or for the group ahead (T211)
  out.x = j.s.from.x; out.y = j.s.from.y; out.ball = j.s.from;
  out.action = m >= j.s.t - ADDRESS_TIME ? (j.s.club === 'putter' ? 'putt' : 'address') : j.s.stroke === 1 ? 'waiting' : 'walk';
  // on a tee after the first he waits at his place behind it (the row's walk ends there), and steps up to the tee in the STEP_IN before his address
  if (j.s.stroke === 1 && j.hole > 0 && m < j.s.t - ADDRESS_TIME) {
    const a = j.s.t - ADDRESS_TIME - STEP_IN;
    if (m < a) { out.x = j.wt.x; out.y = j.wt.y; }
    else { walkAt(j.wt, j.s.from, a, a + STEP_IN, m, out); out.action = 'walk'; }
  }
  return out;
}

/** every golfer's state at a game minute, one per golfer in plan order: waiting before his tee time (at the first tee); walking, addressing,
 *  swinging or putting along his shots (the ball in flight in `flight`, u 0..1); walking to his ball from the moment he struck the shot before (he
 *  walks while the flight is in the air and the group waits its turn), then addressing it ('address', or 'putt' for a putt) in the last part before
 *  the strike; holed out: walking off the green from the cup to his step-off (STEP_TILES from the pin toward the next tee, spread by his slot), then
 *  standing there ('holed', turned to the pin) until his walk to the next tee; and done (at his step-off) once he has walked off the last green.
 *  A golfer whose group still plays (done not known) stands where he is with no next shot. The strokes, toPar and thru count only the shots struck by
 *  minute. With out, its objects are refilled in place and it is returned (the playback calls this every frame, so it allocates little) */
export function stateAt(plan: RoundPlan, view: CourseView, minute: number, out?: GolferState[]): GolferState[] {
  const c = cacheOf(plan, view), res = out ?? [], n = plan.golfers.length;
  for (let i = 0; i < n; i++) { const id = plan.golfers[i]!.id; res[i] = stateOf(plan, c, id, minute, res[i] ?? blank(id)); }
  res.length = n;
  return res;
}

/** one golfer's state at a game minute (as stateAt has it), written into out: the playback of a part of the field (T208: everyday golf computes only the
 *  golfers on screen) */
export function stateOne(plan: RoundPlan, view: CourseView, id: number, minute: number, out: GolferState): GolferState { return stateOf(plan, cacheOf(plan, view), id, minute, out); }

/** the leaderboard at a minute: everyone whose group has teed off, sorted by to par, then holes thru (more first), then name; golfers with
 *  the same to par share a position (the UI shows the tie) */
export function standings(plan: RoundPlan, view: CourseView, minute: number): Standing[] {
  const c = cacheOf(plan, view), rows: { s: Standing; name: string }[] = [], st = blank(0);
  for (const g of plan.golfers) {
    if (minute < c.tracks[g.id]!.tee) continue;
    stateOf(plan, c, g.id, minute, st);
    rows.push({ s: { golfer: g.id, pos: 0, toPar: st.toPar, thru: st.thru, strokes: st.strokes }, name: g.name });
  }
  rows.sort((a, b) => a.s.toPar - b.s.toPar || b.s.thru - a.s.thru || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  rows.forEach((r, i) => { r.s.pos = i > 0 && rows[i - 1]!.s.toPar === r.s.toPar ? rows[i - 1]!.s.pos : i + 1; });
  return rows.map(r => r.s);
}
