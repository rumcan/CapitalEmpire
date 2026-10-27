// What the golf round looks like at a game minute (docs/GOLF-PLAY.md P2): each golfer as a golfer sprite (the drive clip through a swing, the walk while
// he moves, the address and idle poses otherwise) and each ball in the air (an arc, in real seconds from its swing) or at rest. Pure TS, no DOM: the
// engine packs the sprites and draws the balls. The minute is a game minute of the day (stateAt); the swings, flights and walk cycles run in real seconds.
import { clipFrame, golferRow, rowToward } from '../../crowdview';
import { GOLFER_CLIPS } from '../../library';
import { TILE_M } from '../types';
import { FLIGHT_TIME, PICK_UP, PUTT_FLIGHT, offOf, stateAt, stateOne, walkMin } from './round';
import { OWNER_ADDRESS } from './owner';
import type { OwnerTurn } from './live';
import type { CourseView, GolferState, Pt, RoundPlan, Shot } from './types';

/** a golfer to draw: his position (tiles), his id, his sheet row and his frame (absolute, in the row: the golfer clips' frames) */
export interface PlayPerson { x: number; y: number; golfer: number; row: number; frame: number }
/** a ball to draw: its ground position (tiles) and its height above the ground (metres: the flight's arc) */
export interface PlayBall { x: number; y: number; h: number }

/** a swing's drive clip plays for this many real seconds, then holds its finish until the golfer moves on */
const SWING_S = 2.2;
/** a putt's address and takeaway play for this many real seconds, in three equal parts */
const PUTT_S = 1.2;
/** a putt's frames (offsets from the drive clip's start): the address, the takeaway, the address again */
const PUTT_FRAMES = [0, 1, 0];
/** the flights in real seconds: a full shot, a chip (pitching or sand wedge), a putt */
const FLIGHT_S = 1.4, CHIP_S = 0.9, PUTT_FLIGHT_S = 0.8;
/** the apex of a full shot's arc: metres of height per metre of its length (a putt rolls: no arc) */
const APEX = 0.12;
/** a golfer stands on the first tee this many game minutes before his tee time (he is not drawn before that) */
const LEAD_MIN = 10;
/** the walk cycle's offset per golfer, real seconds, so the golfers' walks are not in step */
const STEP_S = 0.37;
/** a golfer has moved since the last update when his squared distance (tiles) is over this */
const MOVE2 = 1e-10;
/** a direction is an aim when its squared length (tiles) is over this: a zero one keeps the last row */
const AIM2 = 1e-12;

/** the real seconds a shot's ball is in the air */
const flightS = (s: Shot): number => s.club === 'putter' ? PUTT_FLIGHT_S : s.club === 'pw' || s.club === 'sw' ? CHIP_S : FLIGHT_S;

/** the playback of a round plan on a course: call update every frame with the game minute and the real seconds, then draw people and balls.
 *  Its state is per golfer, in typed arrays by golfer id, so an update allocates nothing once warm */
export class PlayView {
  /** the golfers to draw and the balls, as of the last update (refilled in place) */
  people: PlayPerson[] = []; balls: PlayBall[] = [];
  private plan: RoundPlan; private view: CourseView;
  /** the owner's stand before his pending turn (standOf), worked out once for the turn standFor */
  private standFor: OwnerTurn | null = null; private stand: { at: Pt; free: number } = { at: { x: 0, y: 0 }, free: 0 };
  /** the states (stateAt refills them) and each golfer's shots in time order; per golfer id: how many of his shots are struck (k), the real second his
   *  newest was first seen (swingAt; -Infinity: none), his tee time, and his position and sheet row at the last update */
  private states: GolferState[] = []; private shots: Shot[][] = [];
  private k: Int32Array; private swingAt: Float64Array; private tee: Float64Array; private lx: Float64Array; private ly: Float64Array; private rows: Uint8Array;
  /** whether an update has run: the first one swings nothing (the shots struck before it, a page load mid-round, are shown at rest) */
  private started = false;
  /** T208: per golfer id, whether the last update played him back (an update given `only` skips the others: they swing nothing when they come back) */
  private seen: Uint8Array;
  /** the shots per golfer as indexed, and how many the plan had then (a live group appends shots: the index follows) */
  private count = -1;

  constructor(plan: RoundPlan, view: CourseView) {
    this.plan = plan; this.view = view;
    const size = Math.max(0, ...plan.golfers.map(g => g.id)) + 1;
    this.k = new Int32Array(size); this.swingAt = new Float64Array(size).fill(-Infinity); this.tee = new Float64Array(size);
    this.lx = new Float64Array(size); this.ly = new Float64Array(size); this.rows = new Uint8Array(size); this.seen = new Uint8Array(size);
    this.shots = Array.from({ length: size }, () => [] as Shot[]);
    this.index();
    for (const gr of plan.groups) for (const id of gr.players) this.tee[id] = gr.tee;
  }

  /** the playback at a game minute of the day and real seconds (now). A golfer's newest shot that the minute has passed since the last update starts
   *  its swing and its flight at now; a shot the minute has gone back before is forgotten without a swing. Then the people (not the done, nor the
   *  waiting more than LEAD_MIN before their tee) and the balls (in the air, or at rest unless holed). `pending` is the owner's turn while his stroke
   *  is not played yet (P4b; see pendingAt): his walk to the ball and his address there, facing `aim` (his open shot's aim; else the suggested aim).
   *  T208: with `only` (per golfer id, 1: play him back), the others are skipped, their states not even worked out (everyday golf's groups off the
   *  screen); one coming back swings nothing for the shots he struck meanwhile */
  update(minute: number, now: number, pending: OwnerTurn | null = null, aim: Pt | null = null, only: Uint8Array | null = null): void {
    if (this.count !== this.plan.shots.length) this.index();
    const G = this.plan.golfers, states = only ? this.states : stateAt(this.plan, this.view, minute, this.states), drive = GOLFER_CLIPS.golf_drive;
    const pa = pending ? (aim ?? pending.suggested.aim) : null;
    let np = 0, nb = 0;
    for (let i = 0; i < G.length; i++) {
      if (only) { const gid = G[i]!.id; if (!only[gid]) { this.seen[gid] = 0; continue; } states[i] = stateOne(this.plan, this.view, gid, minute, states[i] ?? { golfer: gid, hole: 0, x: 0, y: 0, action: 'waiting', ball: null, flight: null, strokes: 0, toPar: 0, thru: 0 }); }
      const s = states[i]!, id = s.golfer, list = this.shots[id]!, mine = pending !== null && pa !== null && id === pending.golfer, fresh = this.started && (!only || this.seen[id] === 1);
      this.seen[id] = 1;
      if (mine) this.pendingAt(s, minute, pending);
      // the shots struck by the minute: the newest of them is the one in play
      const old = this.k[id]!;
      let k = old;
      while (k > 0 && list[k - 1]!.t > minute) k--;
      while (k < list.length && list[k]!.t <= minute) k++;
      if (k !== old) { this.k[id] = k; this.swingAt[id] = k > old && fresh ? now : -Infinity; }
      const newest = k > 0 ? list[k - 1]! : null, dt = now - this.swingAt[id]!;
      // where he moved since the last update (at the first update: nowhere)
      const dx = s.x - this.lx[id]!, dy = s.y - this.ly[id]!, moved = fresh && dx * dx + dy * dy > MOVE2;
      this.lx[id] = s.x; this.ly[id] = s.y;
      if (s.action === 'done' || (s.action === 'waiting' && minute < this.tee[id]! - LEAD_MIN)) continue;
      // the frame: the swing (the drive clip, or a putt's first frames) in its real seconds, else walking while he moves, the address, else idle
      const putting = !!newest && newest.club === 'putter';
      let frame: number;
      if (newest && !putting && dt < SWING_S) frame = clipFrame(drive, drive.times[0]! + dt);
      else if (newest && putting && dt < PUTT_S) frame = drive.start + PUTT_FRAMES[Math.min(2, Math.floor(3 * dt / PUTT_S))]!;
      else if (s.action === 'walk' && moved) frame = clipFrame(GOLFER_CLIPS.walk, now + id * STEP_S);
      else frame = s.action === 'address' || s.action === 'putt' ? drive.start : GOLFER_CLIPS.idle.start;
      // the row: at the ball, turned to the shot he plays (the one in flight, else the next, else the pin); walking, to his heading (kept while he
      // stands); otherwise (waiting, holed out), turned to the pin
      let row = this.rows[id]!;
      if (s.action === 'address' || s.action === 'putt' || s.action === 'swing') {
        const sh = s.flight ? newest : k < list.length ? list[k]! : null, tg = mine ? pa : sh ? sh.to : this.view.holes[s.hole]?.pin;
        if (tg && (tg.x - s.x) ** 2 + (tg.y - s.y) ** 2 > AIM2) row = golferRow(tg.x - s.x, tg.y - s.y);
      } else if (s.action === 'walk') {
        if (moved) row = rowToward(dx, dy);
      } else {
        const pin = this.view.holes[s.hole]?.pin;
        if (pin && (pin.x - s.x) ** 2 + (pin.y - s.y) ** 2 > AIM2) row = rowToward(pin.x - s.x, pin.y - s.y);
      }
      this.rows[id] = row;
      const p = this.people[np] ?? (this.people[np] = { x: 0, y: 0, golfer: 0, row: 0, frame: 0 });
      p.x = s.x; p.y = s.y; p.golfer = id; p.row = row; p.frame = frame; np++;
      // the ball: the newest shot's while it flies (its arc, in real seconds from its swing), else where it rests, unless it went in the hole
      if (newest && dt < flightS(newest)) {
        const u = dt / flightS(newest), H = newest.club === 'putter' ? 0 : APEX * Math.hypot(newest.to.x - newest.from.x, newest.to.y - newest.from.y) * TILE_M;
        const b = this.slot(nb++);
        b.x = newest.from.x + (newest.to.x - newest.from.x) * u; b.y = newest.from.y + (newest.to.y - newest.from.y) * u; b.h = 4 * H * u * (1 - u);
      } else if (s.ball && !(newest?.holed && s.ball.x === newest.to.x && s.ball.y === newest.to.y)) {
        const b = this.slot(nb++); b.x = s.ball.x; b.y = s.ball.y; b.h = 0;
      }
    }
    this.people.length = np; this.balls.length = nb; this.started = true;
  }

  /** the owner's pending turn (P4b, docs/GOLF-PLAY.md decision 7): his next stroke is not in the plan yet, so the playback gives him the walk to it. From
   *  where he stands (standOf) he walks to the turn's ball at the walking pace, starting when he is free there and no later than it lets him arrive by
   *  the address (turn.t less OWNER_ADDRESS); then he stands at the ball in address. The ball is the turn's, at rest. Written over his stateAt state */
  private pendingAt(s: GolferState, minute: number, turn: OwnerTurn): void {
    // his stand is worked out once per turn (the turn object changes when his strokes do): the playback calls this every frame
    if (this.standFor !== turn) { this.stand = this.standOf(turn.golfer); this.standFor = turn; }
    const st = this.stand, ball = turn.ball, W = walkMin(st.at, ball), A = turn.t - OWNER_ADDRESS, T = A - st.free;
    // at the walking pace, starting when there is time for it (he waits at his stand until then). Free too late for that (a long walk after a hole, the
    // hole-out's flight and the step-off leave T < W), he walks faster for the time there is, so he is at the ball by the address; with no time at all
    // (T <= 0) he walks at the pace from when he is free
    const window = T >= W || T <= 0 ? W : T, ws = T >= W ? A - W : st.free;
    s.ball = ball;
    if (minute < ws) return;
    s.hole = turn.holeIdx;
    if (minute < ws + window) {
      const u = window > 0 ? (minute - ws) / window : 1;
      s.x = st.at.x + (ball.x - st.at.x) * u; s.y = st.at.y + (ball.y - st.at.y) * u; s.action = 'walk';
      return;
    }
    s.x = ball.x; s.y = ball.y; s.action = 'address';
  }
  /** where golfer id stands before his next stroke, and the minute he is free there: his tee before any stroke; after his last stroke on a hole that
   *  ended it (holed out or picked up), his step-off (round.ts offOf, free once his walk to it is over); else the ball he last struck to, free once its
   *  flight and his walk to it are over */
  private standOf(id: number): { at: Pt; free: number } {
    const list = this.shots[id]!, holes = this.view.holes, ls: Shot | undefined = list[list.length - 1];
    if (!ls) return { at: holes[0]!.tee, free: -Infinity };
    const dur = ls.club === 'putter' ? PUTT_FLIGHT : FLIGHT_TIME;
    if (!(ls.holed || ls.stroke + ls.penalty >= PICK_UP)) return { at: ls.to, free: ls.t + Math.max(dur, walkMin(ls.from, ls.to)) };
    // the same step-off the playback gives him after this hole (round.ts build: toward the next tee, his slot in the group)
    const toward = ls.hole + 1 < holes.length ? holes[ls.hole + 1]!.tee : ls.from, gr = this.plan.groups.find(g => g.players.includes(id)), slot = gr ? gr.players.indexOf(id) : 0;
    const off = offOf(ls.holed ? ls.to : ls.from, holes[ls.hole]!.pin, toward, slot, ls.t + dur);
    return { at: off.at, free: off.t1 };
  }
  /** the shots of each golfer in time order, from the plan (refilled in place) */
  private index(): void { for (const l of this.shots) l.length = 0; for (const s of this.plan.shots) this.shots[s.golfer]!.push(s); this.count = this.plan.shots.length; }

  /** the ball object at index i of balls (made on first use, then reused) */
  private slot(i: number): PlayBall { return this.balls[i] ?? (this.balls[i] = { x: 0, y: 0, h: 0 }); }
}
