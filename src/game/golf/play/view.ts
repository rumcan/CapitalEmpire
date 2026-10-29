// What the golf round looks like at a game minute (docs/GOLF-PLAY.md P2): each golfer as a golfer sprite (the drive clip through a swing, the walk while
// he moves, the address and idle poses otherwise) and each ball in the air (an arc, in real seconds from its swing) or at rest. Pure TS, no DOM: the
// engine packs the sprites and draws the balls. The minute is a game minute of the day (stateAt); the swings, flights and walk cycles run in real seconds.
import { clipFrame, golferRow, rowToward } from '../../crowdview';
import { GOLFER_CLIPS, SPECTATOR_CLIPS } from '../../library';
import { TILE_M } from '../types';
import { FLIGHT_TIME, PICK_UP, PUTT_FLIGHT, WALK_M, offOf, stateAt, stateOne, walkMin } from './round';
import { OWNER_ADDRESS } from './owner';
import { CartPlay, RIDE, STATE, WALK, type CartPaths, type PlayCart } from './carts';
import { CELEBRATE_S, celebrated } from './celebrate';
import type { OwnerTurn } from './live';
import type { CourseView, GolferState, Pt, RoundPlan, Shot } from './types';
import type { Pacer } from './pacer';
import { BallRoll, FX_NONE, ballRoll, type HeightAt } from './roll';

/** a golfer to draw: his position (tiles), his id, his sheet row and his frame (absolute, in the row: the golfer clips' frames), and (T213) how high he
 *  hops (world px, a celebration's) */
export interface PlayPerson { x: number; y: number; golfer: number; row: number; frame: number; lift?: number;
  /** T266: how visible he is (0..1; absent: 1): a watchable golfer fading out or in as he catches up his schedule (pacer.ts) */
  alpha?: number }
/** a ball to draw: its ground position (tiles) and its height above the ground (metres: the flight's arc, a bounce); T251: its effect (roll.ts FX_SPLASH:
 *  the ball gone into water, rings on it; FX_SAND: a puff of sand round a ball plugged in a bunker; 0 or absent: none) and the effect's progress (0..1) */
export interface PlayBall { x: number; y: number; h: number; fx?: number; fu?: number }
/** T213: a pro's caddie to draw: his position (tiles), his sheet row and frame (the spectator clips' frames: the stand-in is a spectator), the pro he
 *  walks with, and where his bag stands (tiles) */
export interface PlayCaddie { x: number; y: number; row: number; frame: number; golfer: number; bx: number; by: number; /** T266: how visible (0..1; absent: 1) */ alpha?: number }
/** T213: a celebration under way: where (tiles) and how long it has run (real seconds) */
export interface PlayCheer { x: number; y: number; t: number }
/** T213: the playback's extras: the cart paths (null: none) and where the carts go after the last green */
export interface PlayOpts { paths?: CartPaths | null; home?: Pt;
  /** T266: the watchable golfers (golf/pace.ts): the golfers', the carts' and (the tournament's) the caddies' pacers (pacer.ts), so they keep to a
   *  walk and a cart's speed */
  pace?: PlayPace | null;
  /** T251: the ground's height (the course height field, metres) the balls' rolls bend with and the putts break on (absent: flat) */
  height?: HeightAt }
/** T266: a playback's pacers */
export interface PlayPace { walkers: Pacer; carts: Pacer; caddies?: Pacer }

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
/** T251: a full shot's bounce and roll after its landing are over by the swing's end (real seconds from the swing), so the ball is at rest before a
 *  golfer faded out on his walk (pacer.ts: FADE_OUT_S after the swing) comes back at it */
export const ROLL_DONE_S = SWING_S;
/** a golfer stands on the first tee this many game minutes before his tee time (he is not drawn before that) */
const LEAD_MIN = 10;
/** the walk cycle's offset per golfer, real seconds, so the golfers' walks are not in step */
const STEP_S = 0.37;
/** a golfer has moved since the last update when his squared distance (tiles) is over this */
const MOVE2 = 1e-10;
/** a direction is an aim when its squared length (tiles) is over this: a zero one keeps the last row */
const AIM2 = 1e-12;
/** T213: a celebration's pose: the swing's high finish (the drive clip's time), turned to the camera (the screen's bottom), hopping HOP world px twice */
const POSE_T = 1.5, FACE_ROW = rowToward(1, 1), HOP = 7;
/** T213: a caddie walks up to this many tiles a game minute (a little faster than his pro, to keep up), snaps to his place after a jump in the minute
 *  of more than SNAP_MIN (or back) or when he is more than SNAP_TILES away; he walks beside his pro SIDE tiles across, stands BEHIND tiles back off
 *  the line of a full shot, and GREEN_OFF tiles off the green while his pro putts */
const CADDIE_PACE = 1.6 * WALK_M / TILE_M, SNAP_MIN = 2, SNAP_TILES = 30, SIDE = 0.9, BEHIND = 2.5, GREEN_OFF = 1.5;
/** T213: a caddie is walking when he moved more than this (tiles) since the last update */
const STEP2 = 1e-4;

/** the real seconds a shot's ball is in the air */
const flightS = (s: Shot): number => s.club === 'putter' ? PUTT_FLIGHT_S : s.club === 'pw' || s.club === 'sw' ? CHIP_S : FLIGHT_S;

/** the playback of a round plan on a course: call update every frame with the game minute and the real seconds, then draw people and balls.
 *  Its state is per golfer, in typed arrays by golfer id, so an update allocates nothing once warm */
export class PlayView {
  /** the golfers to draw and the balls, as of the last update (refilled in place) */
  people: PlayPerson[] = []; balls: PlayBall[] = [];
  /** T213: the carts, the caddies and the celebrations under way, as of the last update (refilled in place) */
  carts: PlayCart[] = []; caddies: PlayCaddie[] = []; cheers: PlayCheer[] = [];
  /** T213: the tile box on screen (x0 y0 x1 y1; the engine sets it): the carts outside it are not drawn and their drives not worked out */
  box: number[] | null = null;
  /** T213: the round's carts (null: nobody rides) */
  readonly cartPlay: CartPlay | null;
  /** T213: per golfer id, whether he rides a cart and whether a caddie walks with him; each caddie's position, the minute of it (NaN: not placed) and row */
  private rides: Uint8Array; private caddie: Uint8Array; private cx: Float64Array; private cy: Float64Array; private cm: Float64Array; private crow: Uint8Array;
  /** T213: the strokes celebrated (a birdie or better: celebrate.ts), and each caddie's place off the green while his pro putts (by golfer and hole) */
  private celebrate = new Set<Shot>(); private greenSpots = new Map<number, Pt>();
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
  /** T266: the pacers of the watchable golfers (null: the schedule as it is), and the sim time and the clock's rate (town minutes a sim second) of
   *  the update under way */
  private pace: PlayPace | null; private simT = 0; private rate = 1;
  /** T266: the watchable golfers on (their pacers) or off (null: the schedule as it is) */
  setPace(p: PlayPace | null): void { this.pace = p; }
  /** T251: the ground's height (null: flat), and per golfer id the bounce and roll (or the putt's line) of a shot of his (made on first use, then
   *  reused) and the shot it was set for */
  private height: HeightAt; private rolls: (BallRoll | undefined)[] = []; private rollFor: (Shot | null)[] = [];

  constructor(plan: RoundPlan, view: CourseView, opts: PlayOpts = {}) {
    this.plan = plan; this.view = view; this.pace = opts.pace ?? null; this.height = opts.height ?? null;
    const size = Math.max(0, ...plan.golfers.map(g => g.id)) + 1;
    this.k = new Int32Array(size); this.swingAt = new Float64Array(size).fill(-Infinity); this.tee = new Float64Array(size);
    this.lx = new Float64Array(size); this.ly = new Float64Array(size); this.rows = new Uint8Array(size); this.seen = new Uint8Array(size);
    this.rides = new Uint8Array(size); this.caddie = new Uint8Array(size);
    this.cx = new Float64Array(size); this.cy = new Float64Array(size); this.cm = new Float64Array(size).fill(NaN); this.crow = new Uint8Array(size);
    for (const g of plan.golfers) { if (g.cart !== undefined && !g.owner) this.rides[g.id] = 1; if (g.caddie) this.caddie[g.id] = 1; }
    this.cartPlay = this.rides.some(r => r === 1) ? new CartPlay(plan, view, opts.paths ?? null, opts.home ?? view.holes[0]?.tee ?? { x: 0, y: 0 }) : null;
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
  update(minute: number, now: number, pending: OwnerTurn | null = null, aim: Pt | null = null, only: Uint8Array | null = null, simT = 0, rate = 1): void {
    this.simT = simT; this.rate = rate > 0 ? rate : 1;
    if (this.count !== this.plan.shots.length) this.index();
    const G = this.plan.golfers, states = only ? this.states : stateAt(this.plan, this.view, minute, this.states), drive = GOLFER_CLIPS.golf_drive;
    const pa = pending ? (aim ?? pending.suggested.aim) : null, carts = this.cartPlay;
    let np = 0, nb = 0, nc = 0, nh = 0;
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
      // T213: a cart's golfer walks between the cart and his ball (WALK), rides in it (RIDE: not drawn, his ball still is), else as the round has him
      const mode = carts && this.rides[id] ? carts.rider(id, minute) : STATE;
      if (mode !== WALK && (s.action === 'done' || (s.action === 'waiting' && minute < this.tee[id]! - LEAD_MIN))) { this.cm[id] = NaN; continue; }
      // the frame: the swing (the drive clip, or a putt's first frames) in its real seconds, else walking while he moves, the address, else idle
      const putting = !!newest && newest.club === 'putter';
      let frame: number;
      if (newest && !putting && dt < SWING_S) frame = clipFrame(drive, drive.times[0]! + dt);
      else if (newest && putting && dt < PUTT_S) frame = drive.start + PUTT_FRAMES[Math.min(2, Math.floor(3 * dt / PUTT_S))]!;
      else if (s.action === 'walk' && moved) frame = clipFrame(GOLFER_CLIPS.walk, now + id * STEP_S);
      else frame = s.action === 'address' || s.action === 'putt' ? drive.start : GOLFER_CLIPS.idle.start;
      // the row: at the ball, turned to the shot he plays (the one in flight, else the next, else the pin); walking, to his heading (kept while he
      // stands); otherwise (waiting, holed out), turned to the pin
      let row = this.rows[id]!, tg: Pt | null | undefined = null;
      if (s.action === 'address' || s.action === 'putt' || s.action === 'swing') {
        const sh = s.flight ? newest : k < list.length ? list[k]! : null; tg = mine ? pa : sh ? sh.to : this.view.holes[s.hole]?.pin;
        if (tg && (tg.x - s.x) ** 2 + (tg.y - s.y) ** 2 > AIM2) row = golferRow(tg.x - s.x, tg.y - s.y);
      } else if (s.action === 'walk') {
        if (moved) row = rowToward(dx, dy);
      } else {
        const pin = this.view.holes[s.hole]?.pin;
        if (pin && (pin.x - s.x) ** 2 + (pin.y - s.y) ** 2 > AIM2) row = rowToward(pin.x - s.x, pin.y - s.y);
      }
      let x = s.x, y = s.y, lift = 0, show = mode !== RIDE;
      if (mode === WALK) {
        const w = carts!.walk; x = w.x; y = w.y; frame = clipFrame(GOLFER_CLIPS.walk, now + id * STEP_S);
        if (w.hx * w.hx + w.hy * w.hy > AIM2) row = rowToward(w.hx, w.hy);
      }
      // T266: the watchable golfers: shown where his pacer has him (a brisk walk after the schedule at most, still through his swing's natural
      // length, faded out and back at the walk's end when the schedule has run ahead); a shot struck away from where he is shown cuts to it
      let alpha = 1;
      const W = this.pace?.walkers;
      if (W && show) {
        const swinging = !!newest && dt < (putting ? PUTT_S : SWING_S), d = mode === WALK ? null : s.dest;
        if (newest && this.swingAt[id] === now && !W.near(id, newest.from.x, newest.from.y)) W.snap(id, newest.from.x, newest.from.y);
        // (his walk's end, or where the schedule has him standing: he walks there, never faded, when he can make it by his deadline)
        W.step(id, x, y, d ? d.x : mode === WALK ? NaN : x, d ? d.y : mode === WALK ? NaN : y, swinging, now, simT, d && s.by !== undefined ? (s.by - minute) / this.rate : NaN);
        x = W.x; y = W.y; alpha = W.alpha;
        if (!swinging) {
          if (W.walked) { frame = clipFrame(GOLFER_CLIPS.walk, now + id * STEP_S); if (W.hx * W.hx + W.hy * W.hy > AIM2) row = rowToward(W.hx, W.hy); }
          else if (s.action === 'walk' || mode === WALK) { frame = GOLFER_CLIPS.idle.start; const pin = this.view.holes[s.hole]?.pin; if (pin && (pin.x - x) ** 2 + (pin.y - y) ** 2 > AIM2) row = rowToward(pin.x - x, pin.y - y); }
        }
      }
      // T213: a birdie or better: once the ball drops, the celebration (at the cup, turned to the camera, hopping) and the gallery's cheer there
      if (newest && this.celebrate.has(newest)) {
        const c = dt - (newest.club === 'putter' ? Math.max(PUTT_S, PUTT_FLIGHT_S) : Math.max(SWING_S, flightS(newest)));
        if (c >= 0 && c < CELEBRATE_S) {
          x = newest.to.x; y = newest.to.y; frame = clipFrame(drive, POSE_T); row = FACE_ROW; show = true;
          lift = c < CELEBRATE_S / 2 ? HOP * Math.abs(Math.sin(c * 4 * Math.PI / CELEBRATE_S)) : 0;
          const ch = this.cheers[nh] ?? (this.cheers[nh] = { x: 0, y: 0, t: 0 }); ch.x = x; ch.y = y; ch.t = c; nh++;
        }
      }
      this.rows[id] = row;
      if (show) {
        const p = this.people[np] ?? (this.people[np] = { x: 0, y: 0, golfer: 0, row: 0, frame: 0 });
        p.x = x; p.y = y; p.golfer = id; p.row = row; p.frame = frame; p.lift = lift; p.alpha = alpha; np++;
        // T213: his caddie: beside him, behind him off the line of a full shot, or off the green while he putts
        if (this.caddie[id]) nc = this.caddieAt(nc, id, s, x, y, row, moved ? dx : 0, moved ? dy : 0, tg ?? null, k < list.length ? list[k]! : null, minute, now);
      } else this.cm[id] = NaN;
      // the ball: the newest shot's while it flies (its arc, in real seconds from its swing), else where it rests, unless it went in the hole. T251: a
      // full shot flies to its landing, then bounces and rolls to where the model has it stop (a splash in water, a puff of sand in a bunker), all by
      // ROLL_DONE_S; a putt rolls on its line as before, breaking on a sloped green
      const fs = newest ? flightS(newest) : 0, lg = newest && ballRoll.on ? newest.landing : undefined;
      if (newest && dt < fs) {
        const u = dt / fs, b = this.slot(nb++);
        if (newest.club === 'putter') { if (ballRoll.on) this.rollOf(id, newest).along(u, b); else { b.x = newest.from.x + (newest.to.x - newest.from.x) * u; b.y = newest.from.y + (newest.to.y - newest.from.y) * u; b.h = 0; } }
        else {
          const to = lg ? lg.at : newest.to, H = APEX * Math.hypot(to.x - newest.from.x, to.y - newest.from.y) * TILE_M;
          b.x = newest.from.x + (to.x - newest.from.x) * u; b.y = newest.from.y + (to.y - newest.from.y) * u; b.h = 4 * H * u * (1 - u);
        }
      } else if (newest && lg && dt < fs + this.rollOf(id, newest).end) {
        const r = this.rolls[id]!, b = this.slot(nb++); b.fx = r.at(dt - fs, b); b.fu = r.fu;
      } else if (s.ball && !(newest?.holed && s.ball.x === newest.to.x && s.ball.y === newest.to.y)) {
        const b = this.slot(nb++); b.x = s.ball.x; b.y = s.ball.y; b.h = 0;
      }
    }
    this.people.length = np; this.balls.length = nb; this.caddies.length = nc; this.cheers.length = nh; this.started = true;
    // T213: the carts (only those of the golfers played back, and only those on screen)
    if (carts) carts.update(minute, this.carts, only, this.box); else this.carts.length = 0;
    // (T266: the watchable golfers' carts keep to a cart's speed, fading out and back where the schedule parks them)
    const CP = this.pace?.carts;
    if (CP) for (const c of this.carts) { CP.step(c.cart, c.x, c.y, NaN, NaN, false, now, simT); c.x = CP.x; c.y = CP.y; c.alpha = CP.alpha; if (CP.walked) { c.hx = CP.hx; c.hy = CP.hy; } }
  }

  /** T213: golfer id's caddie at minute m, into caddies[n] (returns n + 1). His place: off the green while his pro putts (on the green: his next stroke a
   *  putt); behind his pro, off the line, while he addresses or swings a full shot (tg: the aim); else beside him (across his walk, or his line to the
   *  pin). The caddie walks there at CADDIE_PACE from where he was (he snaps after a jump in the minute, or from far) */
  private caddieAt(n: number, id: number, s: GolferState, x: number, y: number, row: number, mx: number, my: number, tg: Pt | null, next: Shot | null, m: number, now: number): number {
    const pin = this.view.holes[s.hole]?.pin ?? { x, y };
    let tx: number, ty: number, fx = x, fy = y;
    if (next && next.club === 'putter' && next.hole === s.hole && s.action !== 'holed') {
      const sp = this.greenSpot(id, s.hole, next.from, pin); tx = sp.x; ty = sp.y; fx = pin.x; fy = pin.y;
    } else if ((s.action === 'address' || s.action === 'swing') && tg) {
      const L = Math.hypot(tg.x - x, tg.y - y) || 1, ux = (tg.x - x) / L, uy = (tg.y - y) / L;
      tx = x - ux * BEHIND - uy * SIDE; ty = y - uy * BEHIND + ux * SIDE;
    } else {
      let hx = mx, hy = my;
      if (hx * hx + hy * hy <= AIM2) { hx = pin.x - x; hy = pin.y - y; }
      const L = Math.hypot(hx, hy) || 1, ux = hx / L, uy = hy / L;
      tx = x - uy * SIDE - ux * 0.3; ty = y + ux * SIDE - uy * 0.3;
    }
    const ox = this.cx[id]!, oy = this.cy[id]!, dm = m - this.cm[id]!;
    let cx = ox, cy = oy;
    if (!(dm >= 0 && dm <= SNAP_MIN) || (tx - cx) ** 2 + (ty - cy) ** 2 > SNAP_TILES * SNAP_TILES) { cx = tx; cy = ty; }
    else { const d = Math.hypot(tx - cx, ty - cy), step = CADDIE_PACE * dm; if (d <= step) { cx = tx; cy = ty; } else { cx += (tx - cx) / d * step; cy += (ty - cy) / d * step; } }
    let vx = cx - ox, vy = cy - oy, walking = dm >= 0 && dm <= SNAP_MIN && vx * vx + vy * vy > STEP2, alpha = 1;
    // T266: a watchable caddie walks to his place at his cap at most, fading out and back at it when his pro has gone on too far
    const C = this.pace?.caddies;
    if (C) { C.step(id, tx, ty, NaN, NaN, false, now, this.simT); cx = C.x; cy = C.y; alpha = C.alpha; walking = C.walked; vx = C.hx; vy = C.hy; }
    this.cx[id] = cx; this.cy[id] = cy; this.cm[id] = m;
    let crow = this.crow[id]!;
    if (walking) crow = rowToward(vx, vy); else if ((fx - cx) ** 2 + (fy - cy) ** 2 > AIM2) crow = rowToward(fx - cx, fy - cy); else crow = row;
    this.crow[id] = crow;
    const c = this.caddies[n] ?? (this.caddies[n] = { x: 0, y: 0, row: 0, frame: 0, golfer: 0, bx: 0, by: 0 });
    c.x = cx; c.y = cy; c.row = crow; c.golfer = id; c.alpha = alpha; c.frame = walking ? clipFrame(SPECTATOR_CLIPS.walk, now + id * STEP_S) : SPECTATOR_CLIPS.idle.start;
    // the bag stands at his side (the screen's right of him)
    c.bx = cx + 0.3; c.by = cy - 0.3;
    return n + 1;
  }
  /** T213: where golfer id's caddie stands while he putts on hole h: from the pin out past his ball, just off the green (GREEN_OFF), a little across */
  private greenSpot(id: number, h: number, ball: Pt, pin: Pt): Pt {
    const key = id * 64 + h, got = this.greenSpots.get(key); if (got) return got;
    let ux = ball.x - pin.x, uy = ball.y - pin.y;
    const L = Math.hypot(ux, uy);
    if (L < 1e-6) { ux = 1; uy = 0; } else { ux /= L; uy /= L; }
    let d = L;
    while (d < L + 30 && this.view.lieAt(pin.x + ux * d, pin.y + uy * d) === 'green') d += 1;
    d += GREEN_OFF;
    const sp = { x: pin.x + ux * d - uy * 1.2, y: pin.y + uy * d + ux * 1.2 };
    this.greenSpots.set(key, sp);
    return sp;
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
  private index(): void {
    for (const l of this.shots) l.length = 0; for (const s of this.plan.shots) this.shots[s.golfer]!.push(s); this.count = this.plan.shots.length;
    // T213: the celebrated strokes (a birdie or better, celebrate.ts)
    this.celebrate.clear();
    for (const s of this.plan.shots) { const hole = this.view.holes[s.hole]; if (s.holed && hole && celebrated(s.stroke + s.penalty, hole.par)) this.celebrate.add(s); }
  }

  /** the ball object at index i of balls (made on first use, then reused), its effect cleared */
  private slot(i: number): PlayBall { const b = this.balls[i] ?? (this.balls[i] = { x: 0, y: 0, h: 0, fx: FX_NONE, fu: 0 }); b.fx = FX_NONE; b.fu = 0; return b; }
  /** T251: golfer id's roll for shot s, set once for it: a full shot's bounce and roll from its landing (within what is left of ROLL_DONE_S after its
   *  flight), else (a putt, a shot made by hand) its line from the stroke to its end, breaking on the ground's slope */
  private rollOf(id: number, s: Shot): BallRoll {
    const r = this.rolls[id] ?? (this.rolls[id] = new BallRoll());
    if (this.rollFor[id] !== s) {
      this.rollFor[id] = s;
      const lg = s.landing;
      if (lg && s.club !== 'putter') r.set(lg.at, lg.rest, lg.lie, lg.restLie, Math.hypot(lg.at.x - s.from.x, lg.at.y - s.from.y) * TILE_M, ROLL_DONE_S - flightS(s), this.height);
      else r.line(s.from, s.to, this.height);
    }
    return r;
  }
}
