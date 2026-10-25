// The round (docs/GOLF-PLAY.md decision 4): the whole day played at the start, group by group and hole by hole, then the state of each golfer at a
// game minute for the playback. Times are game minutes of the day; distances are tiles unless named M. Pure TS, no DOM.
import { TILE_M } from '../types';
import { chooseShot, hitShot, putt, rng } from './shot';
import type { Golfer, CourseView, Group, GolferState, Lie, Pt, RoundPlan, Shot, Standing } from './types';

/** the walking pace (metres per game minute) */
export const WALK_M = 72;
/** the time a club golfer takes before a full shot (game minutes: the look at the ball, the club) */
export const SHOT_TIME = 0.7;
/** the same for a pro (game minutes) */
export const PRO_SHOT_TIME = 0.6;
/** the time before a putt (game minutes) */
export const PUTT_TIME = 0.5;
/** the time a full shot's ball is in the air before the group's next shot (game minutes) */
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

/** a golfer's ball during a hole: where it lies and who stands where, its lie, his strokes, whether he is finished, when his last ball
 *  comes to rest, and his own random stream for this hole */
interface Player { id: number; pro: boolean; skill: number; ball: Pt; stand: Pt; lie: Lie; strokes: number; holed: boolean; cup: boolean; end: number; r: () => number }

/** plays the whole day: every group's holes in play order, the shots sorted by time, the strokes per hole and the minute each golfer is done.
 *  The golfer ids are 0..n-1. Groups play by tee time; a group waits on the tee until the group ahead has left it, and walks from each green to
 *  the next tee. Each golfer's random stream is rng(seed, golfer, hole), so one golfer's play never shifts another's */
export function playRound(view: CourseView, golfers: Golfer[], groups: Group[], seed: number): RoundPlan {
  const holes = view.holes, N = holes.length, size = Math.max(0, ...golfers.map(g => g.id)) + 1;
  const shots: Shot[] = [], strokes = Array.from({ length: size }, () => new Array<number>(N).fill(0)), done = new Array<number>(size).fill(0);
  const who = new Map(golfers.map(g => [g.id, g] as const));
  let ahead: number[] | null = null; // the group ahead's first tee shot on each hole
  for (const gr of groups.slice().sort((a, b) => a.tee - b.tee)) {
    const first = new Array<number>(N).fill(-1);
    let ready = gr.tee;
    for (const id of gr.players) done[id] = gr.tee; // with no holes, a golfer is done at his tee time
    for (let h = 0; h < N; h++) {
      const hole = holes[h], start = Math.max(ready, ahead ? ahead[h] + TEE_GAP : -Infinity);
      const ps: Player[] = gr.players.map(id => { const g = who.get(id)!; return { id, pro: g.pro, skill: g.skill, ball: { ...hole.tee }, stand: { ...hole.tee }, lie: 'tee', strokes: 0, holed: false, cup: false, end: start, r: rng(seed, id, h) }; });
      let now = start;
      for (;;) {
        // the player farthest from the pin plays next, after the last ball has flown
        let p: Player | undefined, far = -1;
        for (const b of ps) if (!b.holed) { const d = Math.hypot(hole.pin.x - b.ball.x, hole.pin.y - b.ball.y); if (d > far) { far = d; p = b; } }
        if (!p) break;
        const c = chooseShot(p.lie, p.ball, hole, p.skill, p.lie === 'tee'), putting = c.club === 'putter';
        const t = now + walkMin(p.stand, p.ball) + (putting ? PUTT_TIME : p.pro ? PRO_SHOT_TIME : SHOT_TIME);
        const from = { x: p.ball.x, y: p.ball.y };
        let to: Pt, lie: Lie, penalty: 0 | 1 = 0, holed = false, dur = FLIGHT_TIME;
        if (putting) {
          const k = putt(p.r, p.skill, Math.hypot(hole.pin.x - from.x, hole.pin.y - from.y) * TILE_M);
          holed = k.holed; dur = PUTT_FLIGHT;
          // a miss leaves the ball on the putt's line, on the far side of the pin
          const dx = hole.pin.x - from.x, dy = hole.pin.y - from.y, L = Math.hypot(dx, dy), s = L > 0 ? k.leaveM / TILE_M / L : 0;
          to = holed ? { x: hole.pin.x, y: hole.pin.y } : { x: hole.pin.x + dx * s, y: hole.pin.y + dy * s };
          lie = holed ? 'green' : view.lieAt(to.x, to.y);
        } else {
          const k = hitShot(p.r, p.skill, p.lie, from, c.aim, c.club, view);
          to = k.to; lie = k.lie; penalty = k.penalty;
        }
        if (first[h] < 0) first[h] = t;
        shots.push({ golfer: p.id, hole: h, stroke: p.strokes + 1, t, from, to, club: c.club, lie, penalty, holed });
        p.strokes += 1 + penalty;
        if (holed || p.strokes >= PICK_UP) { p.holed = true; p.strokes = Math.min(p.strokes, PICK_UP); }
        p.ball = to; p.stand = from; p.lie = lie; p.cup = holed; p.end = now = t + dur;
      }
      // a golfer is done once he has walked off the last green (the last hole's step-off, from the cup or where he stood to pick up: as build)
      for (const b of ps) { strokes[b.id][h] = b.strokes; if (h === N - 1) done[b.id] = offOf(b.cup ? b.ball : b.stand, hole.pin, b.stand, gr.players.indexOf(b.id), b.end).t1; }
      if (h + 1 < N) ready = now + walkMin(hole.pin, holes[h + 1].tee);
    }
    ahead = first;
  }
  shots.sort((a, b) => a.t - b.t || a.golfer - b.golfer);
  return { golfers, groups, shots, strokes, done };
}

/** one shot's playback row: the walk before it (from wf to wt, between ws and we, game minutes), the prep before the swing, the flight's length, and on
 *  the last shot of a hole the step-off (off) */
interface Row { s: Shot; hole: number; first: boolean; last: boolean; prep: number; dur: number; ws: number; we: number; wf: Pt; wt: Pt; off: Off | null }
/** a golfer's tee time and his shots' rows in order */
interface Track { tee: number; rows: Row[] }
/** the playback index of a plan, built once per plan and view */
interface Cache { view: CourseView; tracks: Track[] }
const cache = new WeakMap<RoundPlan, Cache>();

/** builds the playback index: each golfer's rows with their walks (a first stroke on a hole walks from the last green, starting when the group
 *  leaves it: the group's start on the hole is the earliest tee shot less its prep) */
function build(plan: RoundPlan, view: CourseView): Cache {
  const holes = view.holes, size = plan.strokes.length, grp: number[] = [], slot: number[] = [], tracks: Track[] = [], pro: boolean[] = [];
  plan.golfers.forEach(g => { pro[g.id] = g.pro; });
  plan.groups.forEach((gr, gi) => { gr.players.forEach((id, k) => { grp[id] = gi; slot[id] = k; tracks[id] = { tee: gr.tee, rows: [] }; }); });
  for (let id = 0; id < size; id++) if (!tracks[id]) tracks[id] = { tee: 0, rows: [] };
  const prep = (s: Shot) => s.club === 'putter' ? PUTT_TIME : pro[s.golfer] ? PRO_SHOT_TIME : SHOT_TIME;
  const start = plan.groups.map(() => new Array<number>(holes.length).fill(Infinity));
  for (const s of plan.shots) if (s.stroke === 1) start[grp[s.golfer]][s.hole] = Math.min(start[grp[s.golfer]][s.hole], s.t - prep(s));
  for (const s of plan.shots) {
    const tr = tracks[s.golfer], pr = tr.rows[tr.rows.length - 1], p = prep(s);
    let wf: Pt, we: number, ws: number;
    // a first stroke's walk starts from the last green's step-off (fixed below, once the rows are in)
    if (s.stroke === 1) { wf = s.from; we = start[grp[s.golfer]][s.hole]; ws = we - walkMin(wf, s.from); }
    else { wf = pr.s.from; we = s.t - p; ws = we - walkMin(wf, s.from); }
    tr.rows.push({ s, hole: s.hole, first: s.stroke === 1, last: false, prep: p, dur: s.club === 'putter' ? PUTT_FLIGHT : FLIGHT_TIME, ws, we, wf, wt: s.from, off: null });
  }
  // the last shot of each hole carries the golfer's step-off; the next hole's first walk starts there, and never before he has reached it
  for (const tr of tracks) tr.rows.forEach((r, i) => {
    r.last = i === tr.rows.length - 1 || tr.rows[i + 1]!.hole !== r.hole;
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

/** one golfer's state at a minute, written into out (see stateAt) */
function stateOf(plan: RoundPlan, c: Cache, id: number, m: number, out: GolferState): GolferState {
  const view = c.view, holes = view.holes, N = holes.length, tr = c.tracks[id], rows = tr.rows;
  const home = N ? holes[0].tee : { x: 0, y: 0 }, end = N ? holes[N - 1].pin : home, fl = out.flight;
  out.golfer = id; out.hole = 0; out.x = home.x; out.y = home.y; out.action = 'waiting'; out.ball = null; out.flight = null;
  out.strokes = 0; out.toPar = 0; out.thru = 0;
  if (m < tr.tee) return out;
  let cur = -1;
  while (cur + 1 < rows.length && rows[cur + 1].s.t <= m) cur++;
  // the score so far: the holes finished by minute m, and the strokes on the hole in play (capped at a pick-up)
  let thru = 0, toPar = 0, strokes = 0;
  for (let i = 0; i <= cur; i++) if (rows[i].last) { const k = plan.strokes[id][rows[i].hole]; thru++; strokes += k; toPar += k - holes[rows[i].hole].par; }
  if (cur >= 0 && !rows[cur].last) { let sum = 0; for (let i = cur; i >= 0 && rows[i].hole === rows[cur].hole; i--) sum += 1 + rows[i].s.penalty; strokes += Math.min(PICK_UP, sum); }
  out.strokes = strokes; out.toPar = toPar; out.thru = thru;
  // a ball in the air: the swing, then he stands where he struck from (a holed putt: he follows the ball into the cup, so no jump)
  if (cur >= 0 && m < rows[cur].s.t + rows[cur].dur) {
    const r = rows[cur], s = r.s, post = m >= s.t + SWING_TIME, v = (m - s.t - SWING_TIME) / (r.dur - SWING_TIME), into = post && r.last && s.holed;
    out.action = !post ? (s.club === 'putter' ? 'putt' : 'swing') : r.last ? 'holed' : 'walk';
    out.hole = r.hole; out.x = into ? s.from.x + (s.to.x - s.from.x) * v : s.from.x; out.y = into ? s.from.y + (s.to.y - s.from.y) * v : s.from.y;
    out.ball = s.to; out.flight = flightAt(fl, s.from, s.to, (m - s.t) / r.dur);
    return out;
  }
  // holed out (or picked up): he walks off the green from where his ball came to rest to his step-off, at the walking pace (m >= off.t0 here)
  const off = cur >= 0 ? rows[cur].off : null;
  if (off && m < off.t1) {
    const u = (m - off.t0) / (off.t1 - off.t0);
    out.action = 'walk'; out.hole = rows[cur].hole; out.x = off.rest.x + (off.at.x - off.rest.x) * u; out.y = off.rest.y + (off.at.y - off.rest.y) * u;
    return out;
  }
  const j = cur + 1 < rows.length ? rows[cur + 1] : null;
  if (!j) { const p = off ? off.at : end; out.action = 'done'; out.hole = N ? N - 1 : 0; out.x = p.x; out.y = p.y; out.ball = end; return out; }
  out.hole = j.hole;
  if (m >= j.ws && m < j.we) { // walking: from the step-off to the tee, or from where he stood to his ball
    const u = (m - j.ws) / (j.we - j.ws);
    out.action = 'walk'; out.x = j.wf.x + (j.wt.x - j.wf.x) * u; out.y = j.wf.y + (j.wt.y - j.wf.y) * u; out.ball = j.s.from;
    return out;
  }
  if (m < j.ws && off) { // holed out and standing at his step-off, turned to the pin, until he walks to the next tee
    out.hole = rows[cur].hole; out.action = 'holed'; out.x = off.at.x; out.y = off.at.y;
    return out;
  }
  // before his walk to the ball he waits where he last stood (so the walk starts from there, no jump)
  if (m < j.ws) { out.action = 'walk'; out.x = j.wf.x; out.y = j.wf.y; out.ball = j.s.from; return out; }
  // at his ball (or the tee): the address in the last part before the swing
  out.x = j.s.from.x; out.y = j.s.from.y; out.ball = j.s.from;
  out.action = m >= j.s.t - ADDRESS_TIME ? (j.s.club === 'putter' ? 'putt' : 'address') : 'walk';
  return out;
}

/** every golfer's state at a game minute, one per golfer in plan order: waiting before his tee time (at the first tee); walking, addressing,
 *  swinging or putting along his shots (the ball in flight in `flight`, u 0..1); waiting where he last stood until his walk to the ball, then
 *  addressing it ('address', or 'putt' for a putt) in the last part before the swing; holed out: walking off the green from the cup to his step-off
 *  (STEP_TILES from the pin toward the next tee, spread by his slot), then standing there ('holed', turned to the pin) until his walk to the next
 *  tee; and done (at his step-off) once he has walked off the last green. The strokes, toPar and thru count only the shots struck by minute.
 *  With out, its objects are refilled in place and it is returned (the playback calls this every frame, so it allocates little) */
export function stateAt(plan: RoundPlan, view: CourseView, minute: number, out?: GolferState[]): GolferState[] {
  const c = cacheOf(plan, view), res = out ?? [], n = plan.golfers.length;
  for (let i = 0; i < n; i++) { const id = plan.golfers[i].id; res[i] = stateOf(plan, c, id, minute, res[i] ?? blank(id)); }
  res.length = n;
  return res;
}

/** the leaderboard at a minute: everyone whose group has teed off, sorted by to par, then holes thru (more first), then name; golfers with
 *  the same to par share a position (the UI shows the tie) */
export function standings(plan: RoundPlan, view: CourseView, minute: number): Standing[] {
  const c = cacheOf(plan, view), rows: { s: Standing; name: string }[] = [], st = blank(0);
  for (const g of plan.golfers) {
    if (minute < c.tracks[g.id].tee) continue;
    stateOf(plan, c, g.id, minute, st);
    rows.push({ s: { golfer: g.id, pos: 0, toPar: st.toPar, thru: st.thru, strokes: st.strokes }, name: g.name });
  }
  rows.sort((a, b) => a.s.toPar - b.s.toPar || b.s.thru - a.s.thru || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  rows.forEach((r, i) => { r.s.pos = i > 0 && rows[i - 1].s.toPar === r.s.toPar ? rows[i - 1].s.pos : i + 1; });
  return rows.map(r => r.s);
}
