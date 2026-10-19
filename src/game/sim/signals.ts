// Signal plans: each phase's state, stepped once per sim step from the cars on its approaches. Three tiers (SignalPlan.mode): fixed-time,
// actuated, adaptive. Pure TS, no DOM.
import type { SignalPlan } from './lanes';

/** what a signal shows: green, amber or red */
export const SIG = { GREEN: 0, AMBER: 1, RED: 2 } as const;
/** a green lasts at least MIN_GREEN s and at most MAX_GREEN s; a car within EXT_M m of the line on the green phase's lanes extends it;
 *  a car within DEMAND_M m of the line on a phase's lanes calls that phase (s and m) */
export const MIN_GREEN = 7, MAX_GREEN = 40, EXT_M = 30, DEMAND_M = 60;
/** the adaptive tier (mode 2): a green lasts at most GREEN_CAP s (also the longest green of a fixed-time split); a car within ADAPT_M m of the line on
 *  a served lane moving faster than ADAPT_V m/s holds the green when no car waits elsewhere; a car waiting is one moving under WAIT_V m/s within
 *  DEMAND_M m of a line */
export const GREEN_CAP = 60, ADAPT_M = 120, ADAPT_V = 5, WAIT_V = 2;
/** adaptive: a queue elsewhere this many cars longer than the served phase's demand ends its green (about the cars a switch's lost time costs) */
export const PRESSURE = 8;
/** the stage timers are compared with this tolerance (the DT sums are not exact) */
const EPS = 1e-6;

/** the key of a plan's node in SimClient.sigs: its x and y as float32 (what the frame carries) */
export const sigKey = (x: number, y: number) => `${Math.fround(x)},${Math.fround(y)}`;

/** what phase k shows when the plan is in stage (0 green, 1 amber, 2 all-red) of phase idx: SIG */
export function shown(phase: number, idx: number, stage: number): number {
  return phase !== idx || stage === 2 ? SIG.RED : stage === 0 ? SIG.GREEN : SIG.AMBER;
}

/** the state a signal phase shows: from the plan's runtime state (stepSignals). t is not read; it stays so the callers keep their signature */
export function phaseState(p: SignalPlan, phase: number, _t: number): number { return shown(phase, p.idx, p.stage); }

/** true if a car on one of lanes is within m metres of its line. onLane lists are kept in descending s, so the leader (the first) is the nearest */
function near(lanes: number[], m: number, onLane: number[][], s: ArrayLike<number>, lLen: ArrayLike<number>): boolean {
  for (const id of lanes) { const q = onLane[id]!; if (q.length && lLen[id]! - s[q[0]!]! <= m) return true; }
  return false;
}
/** the cars within m metres of the line on lanes and moving under vMax m/s (the count; the lists run nearest first, so the scan stops at the first one beyond m) */
function count(lanes: number[], m: number, vMax: number, onLane: number[][], s: ArrayLike<number>, spd: ArrayLike<number>, lLen: ArrayLike<number>): number {
  let c = 0;
  for (const id of lanes) { const q = onLane[id]!, L = lLen[id]!; for (let i = 0; i < q.length && L - s[q[i]!]! <= m; i++) if (spd[q[i]!]! < vMax) c++; }
  return c;
}
/** true if a car within m metres of the line on lanes moves faster than v m/s */
function fastNear(lanes: number[], m: number, v: number, onLane: number[][], s: ArrayLike<number>, spd: ArrayLike<number>, lLen: ArrayLike<number>): boolean {
  for (const id of lanes) { const q = onLane[id]!, L = lLen[id]!; for (let i = 0; i < q.length && L - s[q[i]!]! <= m; i++) if (spd[q[i]!]! > v) return true; }
  return false;
}
/** true if a phase other than the one served calls (a car within DEMAND_M on its lanes) */
export function demandElsewhere(p: SignalPlan, onLane: number[][], s: ArrayLike<number>, lLen: ArrayLike<number>): boolean {
  for (let k = 0; k < p.phases; k++) if (k !== p.idx && near(p.phaseLanes[k]!, DEMAND_M, onLane, s, lLen)) return true;
  return false;
}
/** the longest queue on another phase (cars under WAIT_V m/s within DEMAND_M m of its line) */
function worstQueue(p: SignalPlan, onLane: number[][], s: ArrayLike<number>, spd: ArrayLike<number>, lLen: ArrayLike<number>): number {
  let w = 0;
  for (let k = 0; k < p.phases; k++) if (k !== p.idx) w = Math.max(w, count(p.phaseLanes[k]!, DEMAND_M, WAIT_V, onLane, s, spd, lLen));
  return w;
}
/** the phase to serve next (adaptive): the other phase with the most cars within DEMAND_M m of its line; none: the next one in order */
function busiestPhase(p: SignalPlan, onLane: number[][], s: ArrayLike<number>, spd: ArrayLike<number>, lLen: ArrayLike<number>): number {
  let best = (p.idx + 1) % p.phases, bc = 0;
  for (let j = 1; j <= p.phases; j++) { const k = (p.idx + j) % p.phases, c = count(p.phaseLanes[k]!, DEMAND_M, Infinity, onLane, s, spd, lLen); if (c > bc) { bc = c; best = k; } }
  return best;
}
/** the phase after the one served that is called, in order; none called: the next one */
function nextPhase(p: SignalPlan, onLane: number[][], s: ArrayLike<number>, lLen: ArrayLike<number>): number {
  for (let k = 1; k <= p.phases; k++) { const ph = (p.idx + k) % p.phases; if (near(p.phaseLanes[ph]!, DEMAND_M, onLane, s, lLen)) return ph; }
  return (p.idx + 1) % p.phases;
}

/** phase k's slot in the fixed-time cycle: its green, then amber and all-red */
function slot(p: SignalPlan, k: number): number { return p.greens[k]! + p.amber + p.allRed; }
/** the fixed-time reference's position at time t (with the offset): fx[0] the phase whose slot holds it, fx[1] the seconds into that slot */
const fx = new Float64Array(2);
function fixedAt(p: SignalPlan, t: number) {
  let C = 0; for (let k = 0; k < p.phases; k++) C += slot(p, k);
  let tt = (t + p.offset) % C; if (tt < 0) tt += C;
  let k = 0; while (k < p.phases - 1 && tt >= slot(p, k)) { tt -= slot(p, k); k++; }
  fx[0] = k; fx[1] = tt;
}

/** the fixed-time reference (Sim.fixedSignals, and the fixed-time tier): the state at time t from the cycle of each phase's green (greens), amber
 *  and all-red, phase after phase, with the offset. Writes idx, stage and el */
function fixedStep(p: SignalPlan, t: number) {
  fixedAt(p, t);
  const k = fx[0], w = fx[1], g = p.greens[k]!;
  p.idx = k; p.stage = w < g ? 0 : w < g + p.amber ? 1 : 2;
  p.el = p.stage === 0 ? w : p.stage === 1 ? w - g : w - g - p.amber;
}
/** the fixed-time reference's seconds until the phase now green or amber turns red (the plan is not red for its phase) */
export function fixedToRed(p: SignalPlan, t: number): number {
  fixedAt(p, t);
  return p.greens[fx[0]]! + p.amber - fx[1];
}

/** one sim step of the signal plans ps (dt s), each by its mode: fixed-time (mode 0, and every plan when fixed) from the fixed-time cycle at time t;
 *  actuated (mode 1): a green lasts at least MIN_GREEN s, then ends (amber) when another phase is called and no car is within EXT_M m of the line on
 *  its lanes (or at MAX_GREEN s); with no call elsewhere it rests on green. Adaptive (mode 2) ends the green at MIN_GREEN s or later when no car is
 *  within EXT_M m (a car within ADAPT_M m moving faster than ADAPT_V m/s holds it while no car waits elsewhere), when the queue elsewhere is PRESSURE
 *  cars longer than the served phase's demand, or at GREEN_CAP s; the next phase is the busiest one (busiestPhase). Amber lasts amber s, all-red
 *  allRed s, then the next phase that is called (the next one, if none).
 *  onLane, s, spd and lLen are the sim's lane lists, vehicle positions (m), speeds (m/s) and lane lengths (m) */
export function stepSignals(ps: SignalPlan[], onLane: number[][], s: ArrayLike<number>, spd: ArrayLike<number>, lLen: ArrayLike<number>, dt: number, fixed: boolean, t: number) {
  for (const p of ps) {
    if (fixed || p.mode === 0) { fixedStep(p, t); continue; }
    const el = p.el + dt;
    if (p.stage === 0) {
      p.el = el;
      if (el < MIN_GREEN - EPS || !demandElsewhere(p, onLane, s, lLen)) continue;
      const lanes = p.phaseLanes[p.idx]!;
      let end: boolean;
      if (p.mode === 2) {
        // max pressure with a lost-time margin: gap out as actuated; hand over early only when another phase's queue beats the served phase's
        // demand by PRESSURE cars (a switch costs amber + all-red); a busy phase may run to GREEN_CAP s; a platoon holds only when none waits
        const served = count(lanes, DEMAND_M, Infinity, onLane, s, spd, lLen), worst = worstQueue(p, onLane, s, spd, lLen);
        const hold = near(lanes, EXT_M, onLane, s, lLen) || (worst === 0 && fastNear(lanes, ADAPT_M, ADAPT_V, onLane, s, spd, lLen));
        end = el >= GREEN_CAP - EPS || !hold || worst >= served + PRESSURE;
      } else end = el >= MAX_GREEN - EPS || !near(lanes, EXT_M, onLane, s, lLen);
      if (end) { p.stage = 1; p.el = 0; }
    } else if (p.stage === 1) {
      if (el >= p.amber - EPS) { p.stage = 2; p.el = 0; } else p.el = el;
    } else if (el >= p.allRed - EPS) {
      p.idx = p.mode === 2 ? busiestPhase(p, onLane, s, spd, lLen) : nextPhase(p, onLane, s, lLen); p.stage = 0; p.el = 0;
    } else p.el = el;
  }
}
