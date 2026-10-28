// T269 (#810) part 2: the grounds crew's day (the owner, 2026-10-29: "I want to start seeing maintanance people moving holes on greens after each
// day. guys cutting lawns. there should be an active staff running the golf course"). From the day's jobs, the holes' ground (golf/crewground.ts)
// and the day's groups (their times on each hole, from the everyday plan's pace), each worker's day as legs in game minutes:
//  - the **greenkeepers** split the holes into runs of consecutive holes. From 06:00 each drives the utility cart green to green and changes the cup:
//    he walks to the new spot, kneels and cuts it, sets the flag there (the flag moves: a cup event), walks to the old cup, kneels and fills it,
//    and walks back to the cart. Every green is done before the first group can reach it (its tee time on that hole plus CUP_LEAD): the walks take
//    their time at the walk cap where the deadlines leave room, and are hurried (the pacer fades) where they do not. Then, on his holes, the
//    greens due today (the walk-behind, a few passes along the approach) and the sands (a few rake strokes), each when no group is on the hole;
//  - the **mower operators** cut the fairways due today, one pass along each of T218's stripe bands (a mown event each: the band's fresh stripe),
//    the ride-on at the cart cap. When a group is due on the hole the mower pulls off into the rough and waits for it to pass; a wait longer than
//    WAIT_HOME leaves the rest of that fairway for another day. Then the rough due today, one pass down each side;
//  - everyone goes back to the yard at the shift's end (the greenkeepers' GK_HOME, the mowers' MO_HOME), or when the day's work is done.
// With the caps (pace: #821's watchable golfers), a motion's time is its length at the cap, so the screen shows it at the cap; long drives between
// holes run at a cart's real speed (the pacer fades them, as the golfers' walks). Deterministic: no draw at all. Pure TS; game minutes, tiles.
import type { Pt } from './holes';
import type { CrewGround, Pass } from './crewground';

/** the crew come out at 06:00 (the golf hours' start: the night before it runs too fast to watch) */
export const CREW_OUT = 360;
/** the greenkeepers go back to the yard by 14:00, the mower operators by 18:00 */
export const GK_HOME = 14 * 60, MO_HOME = 18 * 60;
/** kneeling to cut a cup, to fill the old one, and standing to set the flag (game minutes) */
export const CUT_MIN = 3.5, FILL_MIN = 2, SET_MIN = 0.5;
/** a cup is cut by this long after the first group's tee time on its hole (the soonest a group reaches the green) */
export const CUP_LEAD = 6;
/** a worker who would wait longer than this for a hole leaves it (game minutes) */
export const WAIT_HOME = 60;
/** the real speeds, tiles a game minute (2 m tiles: a walk 4.8 km/h, the utility cart 19 km/h, the ride-on mowing 6.6 km/h, the walk-behind 3.6,
 *  the rotary 6, a rake stroke 1.4) */
export const SPEED = { walk: 40, cart: 160, reel: 55, push: 30, rotary: 50, rake: 12 } as const;
/** a mower pulls off this far into the rough to let a group by (tiles) */
const ASIDE_T = 4;

/** what a worker does on a leg, and the vehicle he rides or works (none: on foot; push: the walk-behind he walks behind) */
export type Act = 'walk' | 'drive' | 'mow' | 'push' | 'rake' | 'kneel' | 'stand' | 'wait' | 'away';
export type Veh = 'none' | 'cart' | 'reel' | 'push' | 'rotary';
export type Role = 'gk' | 'mo';
/** a leg: from t0 to t1 (game minutes) from (ax, ay) to (bx, by) (the same point when he stays), what he does and on what; where his cart or mower
 *  stands while he is off it (px, py: NaN when he rides it or has none) and which it is */
export interface CrewLeg { t0: number; t1: number; ax: number; ay: number; bx: number; by: number; act: Act; veh: Veh; px: number; py: number; pveh: Veh }
/** a worker's day: his role, his number in the role, his legs in time order (none before CREW_OUT: he is not out) */
export interface Worker { role: Role; k: number; legs: CrewLeg[] }
/** hole n's cup is set (the flag moves to today's cup) at minute t */
export interface CupEvent { hole: number; t: number }
/** hole n's fairway pass in stripe band `band` (of leg `leg`) is cut by minute t */
export interface MowEvent { hole: number; band: number; leg: number; t: number }
export interface CrewDay { workers: Worker[]; cups: CupEvent[]; mown: MowEvent[] }

/** a hole as the crew work it: its ground, yesterday's cup and today's (moved: the cup is changed today) */
export interface CrewHole { ground: CrewGround; oldCup: Pt; newCup: Pt; moved: boolean }
/** the day's crew: the holes in play order (the day's course view's), the yard, the crew, the holes (numbers) whose greens, sands, fairways and rough
 *  are worked today, each hole's groups' times on it (merged windows, by index) and the first group's tee time there (Infinity: none), and the caps as
 *  tiles a game minute (null: not capped, real speeds) */
export interface CrewInputs {
  holes: CrewHole[]; yard: Pt; gk: number; mo: number;
  greens: ReadonlySet<number>; sands: ReadonlySet<number>; fairways: ReadonlySet<number>; rough: ReadonlySet<number>;
  windows: readonly (readonly (readonly [number, number])[])[]; firstOn: readonly number[];
  pace: { walk: number; cart: number } | null;
}

const NOP = NaN;
/** a worker's legs as they are laid: the clock and where he is */
class Shift {
  legs: CrewLeg[] = [];
  constructor(public t: number, public x: number, public y: number) {}
  /** a leg to (bx, by) taking dur minutes */
  go(bx: number, by: number, act: Act, veh: Veh, dur: number, park: { x: number; y: number; veh: Veh } | null = null): void {
    const d = Math.max(0, dur);
    if (d <= 0 && bx === this.x && by === this.y) return;
    this.legs.push({ t0: this.t, t1: this.t + d, ax: this.x, ay: this.y, bx, by, act, veh, px: park ? park.x : NOP, py: park ? park.y : NOP, pveh: park ? park.veh : 'none' });
    this.t += d; this.x = bx; this.y = by;
  }
  /** a leg where he is, until minute t */
  stay(t: number, act: Act, veh: Veh, park: { x: number; y: number; veh: Veh } | null = null): void { if (t > this.t) this.go(this.x, this.y, act, veh, t - this.t, park); }
}
const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(bx - ax, by - ay);

/** the earliest start at or after t for dur minutes clear of every window [a, b) (sorted) */
export function firstFree(win: readonly (readonly [number, number])[], t: number, dur: number): number {
  let s = t;
  for (const [a, b] of win) { if (b <= s) continue; if (s + dur <= a) break; s = Math.max(s, b); }
  return s;
}
/** whether [t, t + dur) touches a window */
const clash = (win: readonly (readonly [number, number])[], t: number, dur: number) => firstFree(win, t, dur) > t;

/** a motion's minutes: its length at the cap with the caps (a real speed when that is slower), else at the real speed */
function mins(d: number, real: number, cap: number | undefined): number { return d / (cap !== undefined ? Math.min(real, cap) : real); }
/** a drive between places: at the cap when it is short (3 minutes or less at it), else at a cart's real speed (the pacer fades the rest) */
function driveMins(d: number, inp: CrewInputs): number { const c = inp.pace ? d / inp.pace.cart : Infinity; return c <= 3 ? c : d / SPEED.cart; }

/** the holes' indices split into n runs of consecutive holes, the first runs a hole longer */
export function runs(N: number, n: number): number[][] {
  const out: number[][] = []; if (n <= 0) return out;
  for (let k = 0; k < n; k++) { const a = Math.floor(k * N / n), b = Math.floor((k + 1) * N / n); out.push(Array.from({ length: b - a }, (_, i) => a + i)); }
  return out;
}

/** the greenkeeper's cup changes on his run, each by its deadline: each job's walks at the cap (comfortable) where the latest end that still lets the
 *  rest be done at real speeds allows it, else hurried down to real speeds (the pacer fades them); the flag's moment into cups */
function cupRound(sh: Shift, run: readonly number[], inp: CrewInputs, cups: CupEvent[]): void {
  const jobs = run.map(i => ({ i, h: inp.holes[i]! })).filter(j => j.h.moved);
  if (!jobs.length) return;
  const W = inp.pace?.walk;
  // each job's places: the cart's spot, the new cup, the old cup
  const spot = jobs.map(j => j.h.ground.park ?? j.h.newCup);
  const walks = (j: number) => { const P = spot[j]!, C = jobs[j]!.h.newCup, O = jobs[j]!.h.oldCup; return [dist(P.x, P.y, C.x, C.y), dist(C.x, C.y, O.x, O.y), dist(O.x, O.y, P.x, P.y)]; };
  const fixed = CUT_MIN + SET_MIN + FILL_MIN;
  const R: number[] = [], C: number[] = [], drive: number[] = [];
  let px = sh.x, py = sh.y;
  for (let j = 0; j < jobs.length; j++) {
    const P = spot[j]!, dv = driveMins(dist(px, py, P.x, P.y), inp), w = walks(j);
    drive.push(dv);
    R.push(dv + fixed + w.reduce((s, d) => s + d / SPEED.walk, 0)); C.push(dv + fixed + w.reduce((s, d) => s + mins(d, SPEED.walk, W), 0));
    px = P.x; py = P.y;
  }
  // the latest end of each job that still lets the jobs after it be done at real speeds by their deadlines
  const D = jobs.map(j => inp.firstOn[j.i]! + CUP_LEAD), E = new Array<number>(jobs.length);
  let next = Infinity;
  for (let j = jobs.length - 1; j >= 0; j--) { E[j] = Math.min(D[j]!, next); next = E[j]! - R[j]!; }
  for (let j = 0; j < jobs.length; j++) {
    const h = jobs[j]!.h, P = spot[j]!, Cn = h.newCup, O = h.oldCup, w = walks(j);
    const dur = Math.max(R[j]!, Math.min(C[j]!, E[j]! - sh.t)), s = C[j]! > R[j]! ? (dur - R[j]!) / (C[j]! - R[j]!) : 0;
    const walk = (k: number) => { const r = w[k]! / SPEED.walk, c = mins(w[k]!, SPEED.walk, W); return r + s * (c - r); };
    const cart = { x: P.x, y: P.y, veh: 'cart' as Veh };
    sh.go(P.x, P.y, 'drive', 'cart', drive[j]!);
    sh.go(Cn.x, Cn.y, 'walk', 'none', walk(0), cart);
    sh.go(Cn.x, Cn.y, 'kneel', 'none', CUT_MIN, cart);
    cups.push({ hole: h.ground.n, t: sh.t });
    sh.go(Cn.x, Cn.y, 'stand', 'none', SET_MIN, cart);
    sh.go(O.x, O.y, 'walk', 'none', walk(1), cart);
    sh.go(O.x, O.y, 'kneel', 'none', FILL_MIN, cart);
    sh.go(P.x, P.y, 'walk', 'none', walk(2), cart);
  }
}

/** a job on a hole the worker does from a parked cart: where the cart parks, and its legs from there (they start and end at the cart) */
interface SiteJob { i: number; park: Pt; dur: number; lay: (sh: Shift) => void }
/** the site jobs one after another, each when its hole is clear for its whole length: the job that can start soonest next; a start more than WAIT_HOME
 *  after he could be there sends him to the yard meanwhile; none can finish by `home`: the day's site work is over */
function siteRound(sh: Shift, jobs: SiteJob[], inp: CrewInputs, home: number, veh: Veh): void {
  const left = [...jobs];
  while (left.length) {
    let best = -1, bs = Infinity, bArr = 0;
    for (let k = 0; k < left.length; k++) {
      const j = left[k]!, arr = sh.t + driveMins(dist(sh.x, sh.y, j.park.x, j.park.y), inp), s = firstFree(inp.windows[j.i] ?? [], arr, j.dur);
      if (s < bs) { bs = s; best = k; bArr = arr; }
    }
    if (best < 0 || bs + left[best]!.dur > home) return;
    const j = left.splice(best, 1)[0]!;
    if (bs - bArr > WAIT_HOME) {
      // a long wait: back to the yard meanwhile, and out again in time
      sh.go(inp.yard.x, inp.yard.y, 'drive', veh, driveMins(dist(sh.x, sh.y, inp.yard.x, inp.yard.y), inp));
      const back = driveMins(dist(inp.yard.x, inp.yard.y, j.park.x, j.park.y), inp);
      sh.stay(bs - back, 'away', 'none');
      sh.go(j.park.x, j.park.y, 'drive', veh, back);
    } else {
      sh.go(j.park.x, j.park.y, 'drive', veh, bArr - sh.t);
      sh.stay(bs, 'wait', veh);
    }
    j.lay(sh);
  }
}

/** a run of passes worked on foot from a parked cart (the walk-behind on a green, a rake across a sand): walk to the first, each pass at its speed, a
 *  walk between them, and back to the cart; its length at the paces */
function footPasses(passes: readonly Pass[], park: Pt, act: Act, veh: Veh, real: number, inp: CrewInputs): { dur: number; lay: (sh: Shift) => void } {
  const W = inp.pace?.walk, steps: { x: number; y: number; act: Act; veh: Veh; d: number }[] = [];
  let x = park.x, y = park.y;
  for (const p of passes) {
    steps.push({ x: p.ax, y: p.ay, act: 'walk', veh: 'none', d: mins(dist(x, y, p.ax, p.ay), SPEED.walk, W) });
    steps.push({ x: p.bx, y: p.by, act, veh, d: mins(dist(p.ax, p.ay, p.bx, p.by), real, W) });
    x = p.bx; y = p.by;
  }
  steps.push({ x: park.x, y: park.y, act: 'walk', veh: 'none', d: mins(dist(x, y, park.x, park.y), SPEED.walk, W) });
  const dur = steps.reduce((s, q) => s + q.d, 0), cart = { x: park.x, y: park.y, veh: 'cart' as Veh };
  return { dur, lay: sh => { for (const q of steps) sh.go(q.x, q.y, q.act, q.veh, q.d, cart); } };
}

/** where the cart parks by a sand: off its middle toward the green's cart spot, past its strokes */
function sandPark(s: { cx: number; cy: number; strokes: readonly Pass[] }, toward: Pt): Pt {
  let r = 1; for (const p of s.strokes) r = Math.max(r, dist(s.cx, s.cy, p.ax, p.ay), dist(s.cx, s.cy, p.bx, p.by));
  const d = dist(s.cx, s.cy, toward.x, toward.y), ux = d > 1e-6 ? (toward.x - s.cx) / d : 0, uy = d > 1e-6 ? (toward.y - s.cy) / d : 1;
  return { x: s.cx + ux * (r + 2), y: s.cy + uy * (r + 2) };
}

/** the mower operator's passes on one hole (the fairway's or the rough's), in order, each when no group is due on the hole for its length: when one is,
 *  he pulls off ASIDE_T into the rough at the pass's start and waits; a wait over WAIT_HOME, or the shift's end, leaves the rest. Each pass cut is a
 *  mown event (the fairway's; the rough's are not striped). Returns whether he got to the hole at all */
function mowHole(sh: Shift, i: number, passes: readonly Pass[], veh: Veh, real: number, inp: CrewInputs, home: number, mown: MowEvent[] | null): void {
  if (!passes.length) return;
  const C = inp.pace?.cart, win = inp.windows[i] ?? [], n = inp.holes[i]!.ground.n;
  const p0 = passes[0]!;
  sh.go(p0.ax, p0.ay, 'drive', veh, driveMins(dist(sh.x, sh.y, p0.ax, p0.ay), inp));
  for (let k = 0; k < passes.length; k++) {
    const p = passes[k]!, q = passes[k + 1], len = mins(dist(p.ax, p.ay, p.bx, p.by), real, C), turn = q ? mins(dist(p.bx, p.by, q.ax, q.ay), real, C) : 0;
    if (sh.t + len > home) return;
    if (clash(win, sh.t, len + turn)) {
      const s = firstFree(win, sh.t, len + turn);
      if (s - sh.t > WAIT_HOME || s + len > home) return;
      // pull off into the rough, wait for the group, come back
      const L = dist(p.ax, p.ay, p.bx, p.by) || 1, ox = p.ax + (p.ax - p.bx) / L * ASIDE_T, oy = p.ay + (p.ay - p.by) / L * ASIDE_T, side = mins(ASIDE_T, real, C);
      sh.go(ox, oy, 'drive', veh, side); sh.stay(Math.max(sh.t, s - side), 'wait', veh); sh.go(p.ax, p.ay, 'drive', veh, side);
    }
    sh.go(p.bx, p.by, 'mow', veh, len);
    if (mown) mown.push({ hole: n, band: p.band, leg: p.leg, t: sh.t });
    if (q) sh.go(q.ax, q.ay, 'mow', veh, turn);
  }
}

/** the crew's day (see the file's head): the greenkeepers' cups then their greens and sands, the mower operators' fairways then their rough */
export function crewDay(inp: CrewInputs): CrewDay {
  const N = inp.holes.length, workers: Worker[] = [], cups: CupEvent[] = [], mown: MowEvent[] = [], Y = inp.yard;
  const home = (sh: Shift, veh: Veh, end: number) => {
    sh.go(Y.x, Y.y, 'drive', veh, driveMins(dist(sh.x, sh.y, Y.x, Y.y), inp)); sh.stay(Math.max(sh.t, end), 'away', 'none');
  };
  runs(N, Math.min(inp.gk, N)).forEach((run, k) => {
    const sh = new Shift(CREW_OUT, Y.x, Y.y);
    cupRound(sh, run, inp, cups);
    // his greens due today, then his sands, each when the hole is clear
    const site: SiteJob[] = [];
    for (const i of run) {
      const h = inp.holes[i]!, g = h.ground, park = g.park ?? h.newCup;
      if (inp.greens.has(g.n) && g.greenPasses.length) { const f = footPasses(g.greenPasses, park, 'push', 'push', SPEED.push, inp); site.push({ i, park, ...f }); }
      if (inp.sands.has(g.n)) for (const s of g.sands) { const sp = sandPark(s, park), f = footPasses(s.strokes, sp, 'rake', 'none', SPEED.rake, inp); site.push({ i, park: sp, ...f }); }
    }
    siteRound(sh, site, inp, GK_HOME, 'cart');
    home(sh, 'cart', GK_HOME);
    workers.push({ role: 'gk', k, legs: sh.legs });
  });
  // the mowers: the fairways due today on the holes of their run, the one play reaches last first; then the rough
  runs(N, Math.min(inp.mo, N)).forEach((run, k) => {
    const sh = new Shift(CREW_OUT, Y.x, Y.y);
    const order = [...run].sort((a, b) => (inp.firstOn[b] ?? Infinity) - (inp.firstOn[a] ?? Infinity) || a - b);
    for (const i of order) if (inp.fairways.has(inp.holes[i]!.ground.n)) mowHole(sh, i, inp.holes[i]!.ground.passes, 'reel', SPEED.reel, inp, MO_HOME, mown);
    for (const i of order) if (inp.rough.has(inp.holes[i]!.ground.n)) mowHole(sh, i, inp.holes[i]!.ground.rough, 'rotary', SPEED.rotary, inp, MO_HOME, null);
    home(sh, sh.legs.length && sh.legs[sh.legs.length - 1]!.veh === 'rotary' ? 'rotary' : 'reel', MO_HOME);
    workers.push({ role: 'mo', k, legs: sh.legs });
  });
  cups.sort((a, b) => a.t - b.t); mown.sort((a, b) => a.t - b.t);
  return { workers, cups, mown };
}

/** each hole's groups' times on it (index by the course view's holes): from a group's arrival at the hole's tee to its arrival at the next (the last
 *  hole: to its last golfer's done), merged and sorted; and the first group's tee time on each hole (Infinity: none). arrive: the plan's
 *  pace.arrive[group][hole] (Infinity until known); done: each group's last golfer's done minute */
export function holeWindows(arrive: readonly (readonly number[])[], done: readonly number[], N: number): { windows: [number, number][][]; firstOn: number[] } {
  const raw: [number, number][][] = Array.from({ length: N }, () => []), firstOn = new Array<number>(N).fill(Infinity);
  arrive.forEach((A, g) => {
    for (let h = 0; h < N; h++) {
      const a = A[h]; if (a === undefined || !Number.isFinite(a)) continue;
      const b = h + 1 < N && Number.isFinite(A[h + 1] ?? NaN) ? A[h + 1]! : done[g] ?? a + 15;
      raw[h]!.push([a, Number.isFinite(b) ? b : a + 15]); firstOn[h] = Math.min(firstOn[h]!, a);
    }
  });
  const windows = raw.map(w => {
    w.sort((p, q) => p[0] - q[0]); const out: [number, number][] = [];
    for (const [a, b] of w) { const l = out[out.length - 1]; if (l && a <= l[1]) l[1] = Math.max(l[1], b); else out.push([a, b]); }
    return out;
  });
  return { windows, firstOn };
}

/** the rota's jobs on town day `day` for the holes (numbers): every cup and every sand each day, a green every other day, a fairway every third and the
 *  rough once a week, the holes spread over the days so the work is even */
export function rotaJobs(day: number, holes: readonly number[]): { greens: Set<number>; sands: Set<number>; fairways: Set<number>; rough: Set<number> } {
  const greens = new Set<number>(), fairways = new Set<number>(), rough = new Set<number>(), sands = new Set(holes);
  for (const n of holes) { if ((day + n) % 2 === 0) greens.add(n); if ((day + n) % 3 === 0) fairways.add(n); if ((day + n * 3) % 7 === 0) rough.add(n); }
  return { greens, sands, fairways, rough };
}

/** the index of a worker's leg at minute m (binary search; -1 before his first or after his last) */
export function legIndex(w: Worker, m: number): number {
  const L = w.legs; if (!L.length || m < L[0]!.t0 || m >= L[L.length - 1]!.t1) return -1;
  let lo = 0, hi = L.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (L[mid]!.t0 <= m) lo = mid; else hi = mid - 1; }
  return lo;
}
/** the leg of a worker at minute m (null before his first or after his last) */
export function legAt(w: Worker, m: number): CrewLeg | null { const i = legIndex(w, m); return i < 0 ? null : w.legs[i]!; }

/** the crew needed for a course of `holes` holes (part 3 lets the player hire them): a greenkeeper and a mower operator each nine holes */
export function crewFor(holes: number): { gk: number; mo: number } { const n = Math.ceil(Math.max(0, holes) / 9); return { gk: n, mo: n }; }
