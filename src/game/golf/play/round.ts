// The round (docs/GOLF-PLAY.md decision 4): the whole day played at the start, group by group and hole by hole, then the state of each golfer at a
// game minute for the playback. Times are game minutes of the day; distances are tiles unless named M. Pure TS, no DOM.
// The stepping (HoleRun, GroupRun) is shared by playRound and the owner's live group (live.ts), so both keep one time model.
import { TILE_M } from '../types';
import { chooseShot, hitShot, putt, rng } from './shot';
import type { Club, CourseView, Golfer, Group, GolferState, Lie, Pt, RoundPlan, Shot, Standing } from './types';

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
/** a group may tee off this long (game minutes) after the group ahead has left the tee */
export const TEE_GAP = 3;
/** the strokes on a hole at which a golfer picks up (the score is then 10) */
export const PICK_UP = 10;
/** a holed golfer steps off the green this far from the pin, toward the next tee (the last hole: toward his last stand), tiles */
export const STEP_TILES = 4;
/** the holed golfers of a group stand apart across that direction: (slot - 1) times this, tiles (slot: his place in the group, 0..3) */
export const SPREAD_TILES = 1.2;

/** the walk in game minutes between two points */
const walkMin = (a: Pt, b: Pt): number => Math.hypot(b.x - a.x, b.y - a.y) * TILE_M / WALK_M;

/** the routine of a stroke: the minutes before the group's next strike (a putt, a pro's full shot, a club golfer's full shot) */
export const routineOf = (club: Club, pro: boolean): number => club === 'putter' ? PUTT_ROUTINE : pro ? PRO_ROUTINE : FULL_ROUTINE;

/** what a golfer does after his last ball on a hole: he walks off from rest (the cup, or where he stood to pick up) to his step-off point at, from
 *  minute t0 to t1 (the walking pace), then stands there until his walk to the next tee */
interface Off { rest: Pt; at: Pt; t0: number; t1: number }

/** the step-off for a golfer who finished a hole at minute t0: STEP_TILES from the pin toward `toward` (the next tee, or on the last hole his last
 *  stand), spread across that direction by his slot in the group. He walks there from rest at the walking pace */
function offOf(rest: Pt, pin: Pt, toward: Pt, slot: number, t0: number): Off {
  const dx = toward.x - pin.x, dy = toward.y - pin.y, L = Math.hypot(dx, dy), ux = L > 0 ? dx / L : 1, uy = L > 0 ? dy / L : 0, k = (slot - 1) * SPREAD_TILES;
  const at = { x: pin.x + ux * STEP_TILES - uy * k, y: pin.y + uy * STEP_TILES + ux * k };
  return { rest, at, t0, t1: t0 + walkMin(rest, at) };
}

/** a golfer's ball during a hole: where it lies and where he stands, its lie, his strokes, whether he is holed out or picked up (holed), whether his
 *  last stroke went in (cup), when its flight ends (end), the minute he is ready to strike again (ready: his walk from his stand to his ball starts
 *  when he strikes), whether his shots come from the owner's input (owner, live.ts), and his own random stream for this hole */
export interface Player { id: number; pro: boolean; skill: number; owner: boolean; ball: Pt; stand: Pt; lie: Lie; strokes: number; holed: boolean; cup: boolean; end: number; ready: number; r: () => number }

/** what a round's play writes to: the course, the seed, the golfers by id, the shots (in the order struck) and the done minutes */
export interface PlayCtx { view: CourseView; seed: number; who: Map<number, Golfer>; out: Shot[]; done: number[] }

/** one group's play of one hole. A golfer strikes when he is ready (his walk to his ball is done) and the group's last strike's routine is over, the
 *  farthest from the pin first. `first` is the group's first strike on the hole; `now` is when the last flight ends */
export class HoleRun {
  /** each golfer's ball and state, in the group's order */
  readonly ps: Player[]; readonly h: number;
  /** the end of the last flight, the group's first strike, and the group's last strike and its routine (none yet: -Infinity) */
  now: number; first = -1; private last = -Infinity; private routine = 0; private c: PlayCtx;
  constructor(c: PlayCtx, gr: Group, h: number, start: number) {
    this.c = c; this.h = h; this.now = start;
    const tee = c.view.holes[h]!.tee;
    this.ps = gr.players.map(id => { const g = c.who.get(id)!; return { id, pro: g.pro, skill: g.skill, owner: !!g.owner, ball: { ...tee }, stand: { ...tee }, lie: 'tee' as Lie, strokes: 0, holed: false, cup: false, end: start, ready: start, r: rng(c.seed, id, h) }; });
  }
  /** the golfer to strike next: the one farthest from the pin among those not holed (the group's order on a tie); null when the hole is over */
  next(): Player | null {
    const pin = this.c.view.holes[this.h]!.pin; let p: Player | null = null, far = -1;
    for (const b of this.ps) if (!b.holed) { const d = Math.hypot(pin.x - b.ball.x, pin.y - b.ball.y); if (d > far) { far = d; p = b; } }
    return p;
  }
  /** the minute p strikes: when he is ready, and no sooner than the group's last strike plus its routine */
  strikeAt(p: Player): number { return Math.max(p.ready, this.last + this.routine); }
  /** records p's stroke, from his ball to `to`, struck at t (its flight dur): his strokes (a penalty adds one), his ball and stand, his walk to the new ball
   *  (ready at t + walk), and the group's last strike; a golfer holed out or picked up at PICK_UP is out of the hole */
  record(p: Player, club: Club, t: number, dur: number, to: Pt, lie: Lie, penalty: 0 | 1, holed: boolean): Shot {
    const from = { x: p.ball.x, y: p.ball.y }, s: Shot = { golfer: p.id, hole: this.h, stroke: p.strokes + 1, t, from, to, club, lie, penalty, holed };
    if (this.first < 0) this.first = t;
    this.c.out.push(s);
    p.strokes += 1 + penalty;
    if (holed || p.strokes >= PICK_UP) { p.holed = true; p.strokes = Math.min(p.strokes, PICK_UP); }
    p.ball = to; p.stand = from; p.lie = lie; p.cup = holed; p.end = this.now = t + dur;
    p.ready = t + walkMin(from, to); this.last = t; this.routine = routineOf(club, p.pro);
    return s;
  }
  /** the model's stroke for p: the club and aim from his lie (chooseShot); a putt by putt, else hitShot. Recorded, and returned */
  model(p: Player): Shot {
    const hole = this.c.view.holes[this.h]!, k = chooseShot(p.lie, p.ball, hole, p.skill, p.lie === 'tee'), t = this.strikeAt(p);
    if (k.club === 'putter') {
      const from = p.ball, dx = hole.pin.x - from.x, dy = hole.pin.y - from.y, L = Math.hypot(dx, dy), o = putt(p.r, p.skill, L * TILE_M);
      // a miss leaves the ball on the putt's line, on the far side of the pin
      const s = L > 0 ? o.leaveM / TILE_M / L : 0, to = o.holed ? { x: hole.pin.x, y: hole.pin.y } : { x: hole.pin.x + dx * s, y: hole.pin.y + dy * s };
      return this.record(p, 'putter', t, PUTT_FLIGHT, to, o.holed ? 'green' : this.c.view.lieAt(to.x, to.y), 0, o.holed);
    }
    const o = hitShot(p.r, p.skill, p.lie, p.ball, k.aim, k.club, this.c.view);
    return this.record(p, k.club, t, FLIGHT_TIME, o.to, o.lie, o.penalty, false);
  }
}

/** one group's day: its holes in play order, each from its tee minute (the group's walk from the last green; no earlier than TEE_GAP after the group
 *  ahead's first strike on the hole, `ahead`, if there is one). `first` is the group's first strike on each hole (the group behind waits on it) */
export class GroupRun {
  readonly first: number[]; h = 0; hole: HoleRun | null = null;
  private ready: number; private c: PlayCtx; private gr: Group; private ahead: number[] | null;
  constructor(c: PlayCtx, gr: Group, ahead: number[] | null) {
    this.c = c; this.gr = gr; this.ahead = ahead; this.ready = gr.tee; this.first = new Array<number>(c.view.holes.length).fill(-1);
  }
  /** starts the next hole; false once the group has played every hole */
  begin(): boolean {
    if (this.h >= this.c.view.holes.length) return false;
    const start = Math.max(this.ready, this.ahead ? this.ahead[this.h]! + TEE_GAP : -Infinity);
    this.hole = new HoleRun(this.c, this.gr, this.h, start);
    return true;
  }
  /** ends the hole: the group's walk to the next tee; on the last hole, each golfer's done minute (his walk off the last green) */
  finish(): void {
    const run = this.hole!, holes = this.c.view.holes, h = this.h, N = holes.length, pin = holes[h]!.pin;
    this.first[h] = run.first;
    if (h + 1 < N) this.ready = run.now + walkMin(pin, holes[h + 1]!.tee);
    if (h === N - 1) for (const b of run.ps) this.c.done[b.id] = offOf(b.cup ? b.ball : b.stand, pin, b.stand, this.gr.players.indexOf(b.id), b.end).t1;
    this.hole = null; this.h++;
  }
  /** plays every remaining hole by the model (the field's groups) */
  playAll(): void { while (this.begin()) { for (let p = this.hole!.next(); p; p = this.hole!.next()) this.hole!.model(p); this.finish(); } }
}

/** a shot's effect on the score: a stroke that holes a golfer out, or takes him to a pick-up, is his strokes on that hole (penalties included, at most PICK_UP) */
function score(plan: RoundPlan, s: Shot): void { const k = s.stroke + s.penalty; if (s.holed || k >= PICK_UP) plan.strokes[s.golfer]![s.hole] = Math.min(PICK_UP, k); }

/** plays the whole day: every group's holes in play order, the shots sorted by time, the strokes per hole and the minute each golfer is done.
 *  The golfer ids are 0..n-1. Groups play by tee time; a group waits on the tee until the group ahead has left it, and walks from each green to the
 *  next tee. Each golfer's random stream is rng(seed, golfer, hole), so one golfer's play never shifts another's. With opts.live (an index into
 *  groups), that group is not played: its golfers have no shots, strokes 0 and done Infinity, until LiveGroup (live.ts) plays it */
export function playRound(view: CourseView, golfers: Golfer[], groups: Group[], seed: number, opts?: { live?: number }): RoundPlan {
  const N = view.holes.length, size = Math.max(0, ...golfers.map(g => g.id)) + 1;
  const plan: RoundPlan = { golfers, groups, shots: [], strokes: Array.from({ length: size }, () => new Array<number>(N).fill(0)), done: new Array<number>(size).fill(0) };
  const c: PlayCtx = { view, seed, who: new Map(golfers.map(g => [g.id, g] as const)), out: plan.shots, done: plan.done };
  const live = opts?.live !== undefined ? groups[opts.live] : undefined;
  let ahead: number[] | null = null; // the group ahead's first strike on each hole
  for (const gr of groups.slice().sort((a, b) => a.tee - b.tee)) {
    if (gr === live) { for (const id of gr.players) plan.done[id] = N ? Infinity : gr.tee; ahead = null; continue; }
    for (const id of gr.players) plan.done[id] = gr.tee; // with no holes, a golfer is done at his tee time
    const run: GroupRun = new GroupRun(c, gr, ahead);
    run.playAll();
    ahead = run.first;
  }
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
interface Track { tee: number; rows: Row[] }
/** the playback index of a plan, built once per plan and view */
interface Cache { view: CourseView; tracks: Track[] }
const cache = new WeakMap<RoundPlan, Cache>();

/** builds the playback index: each golfer's rows with their walks. A first stroke on a hole walks from the step-off (linked below); a later stroke
 *  walks from his last stand, starting when he struck the shot before, so he walks while the group waits its turn */
function build(plan: RoundPlan, view: CourseView): Cache {
  const holes = view.holes, size = plan.strokes.length, slot: number[] = [], tracks: Track[] = [];
  plan.groups.forEach(gr => { gr.players.forEach((id, k) => { slot[id] = k; tracks[id] = { tee: gr.tee, rows: [] }; }); });
  for (let id = 0; id < size; id++) if (!tracks[id]) tracks[id] = { tee: 0, rows: [] };
  for (const s of plan.shots) {
    const tr = tracks[s.golfer]!, pr = tr.rows[tr.rows.length - 1];
    const first = s.stroke === 1, wf = first ? s.from : pr!.s.from, ws = first ? s.t : pr!.s.t, we = first ? s.t : ws + walkMin(wf, s.from);
    tr.rows.push({ s, hole: s.hole, last: false, dur: s.club === 'putter' ? PUTT_FLIGHT : FLIGHT_TIME, ws, we, wf, wt: s.from, off: null });
  }
  // the last shot of each hole (the golfer is holed out or picked up) carries his step-off; the next hole's first walk starts there, never before he has reached it
  for (const tr of tracks) tr.rows.forEach((r, i) => {
    r.last = r.s.holed || r.s.stroke + r.s.penalty >= PICK_UP;
    if (!r.last) return;
    const toward = r.hole + 1 < holes.length ? holes[r.hole + 1]!.tee : r.s.from;
    r.off = offOf(r.s.holed ? r.s.to : r.s.from, holes[r.hole]!.pin, toward, slot[r.s.golfer]!, r.s.t + r.dur); // the cup, else where he stood (a pick-up)
    const nx = tr.rows[i + 1];
    if (nx) { nx.wf = r.off.at; nx.ws = Math.max(nx.we - walkMin(nx.wf, nx.wt), r.off.t1); }
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
 *  stands where he is: waiting at his tee, or holed out at his step-off */
function stateOf(plan: RoundPlan, c: Cache, id: number, m: number, out: GolferState): GolferState {
  const view = c.view, holes = view.holes, N = holes.length, tr = c.tracks[id]!, rows = tr.rows;
  const home = N ? holes[0]!.tee : { x: 0, y: 0 }, end = N ? holes[N - 1]!.pin : home, fl = out.flight;
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
      if (off) { out.hole = rows[cur]!.hole; out.action = 'holed'; out.x = off.at.x; out.y = off.at.y; return out; }
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
  if (m < j.ws) { out.action = 'walk'; out.x = j.wf.x; out.y = j.wf.y; out.ball = j.s.from; return out; }
  // at his ball: the address in the last part before the strike
  out.x = j.s.from.x; out.y = j.s.from.y; out.ball = j.s.from;
  out.action = m >= j.s.t - ADDRESS_TIME ? (j.s.club === 'putter' ? 'putt' : 'address') : 'walk';
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
