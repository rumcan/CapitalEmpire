// Actuated signal plans: each phase's state, stepped once per sim step from the cars on its approaches. Pure TS, no DOM.
import type { SignalPlan } from './lanes';

/** what a signal shows: green, amber or red */
export const SIG = { GREEN: 0, AMBER: 1, RED: 2 } as const;
/** a green lasts at least MIN_GREEN s and at most MAX_GREEN s; a car within EXT_M m of the line on the green phase's lanes extends it;
 *  a car within DEMAND_M m of the line on a phase's lanes calls that phase (s and m) */
export const MIN_GREEN = 7, MAX_GREEN = 40, EXT_M = 30, DEMAND_M = 60;
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
/** true if a phase other than the one served calls (a car within DEMAND_M on its lanes) */
export function demandElsewhere(p: SignalPlan, onLane: number[][], s: ArrayLike<number>, lLen: ArrayLike<number>): boolean {
  for (let k = 0; k < p.phases; k++) if (k !== p.idx && near(p.phaseLanes[k]!, DEMAND_M, onLane, s, lLen)) return true;
  return false;
}
/** the phase after the one served that is called, in order; none called: the next one */
function nextPhase(p: SignalPlan, onLane: number[][], s: ArrayLike<number>, lLen: ArrayLike<number>): number {
  for (let k = 1; k <= p.phases; k++) { const ph = (p.idx + k) % p.phases; if (near(p.phaseLanes[ph]!, DEMAND_M, onLane, s, lLen)) return ph; }
  return (p.idx + 1) % p.phases;
}

/** the fixed-time reference (Sim.fixedSignals): the state at time t from the cycle of green, amber and all-red, phase after phase, with the offset.
 *  Writes idx, stage and el */
function fixedStep(p: SignalPlan, t: number) {
  const seg = p.green + p.amber + p.allRed, C = p.phases * seg;
  let tt = (t + p.offset) % C; if (tt < 0) tt += C;
  const cur = Math.floor(tt / seg), w = tt - cur * seg;
  p.idx = cur; p.stage = w < p.green ? 0 : w < p.green + p.amber ? 1 : 2;
  p.el = p.stage === 0 ? w : p.stage === 1 ? w - p.green : w - p.green - p.amber;
}
/** the fixed-time reference's seconds until the phase now green or amber turns red (the plan is not red for its phase) */
export function fixedToRed(p: SignalPlan, t: number): number {
  const seg = p.green + p.amber + p.allRed, C = p.phases * seg;
  let tt = (t + p.offset) % C; if (tt < 0) tt += C;
  return Math.floor(tt / seg) * seg + p.green + p.amber - tt;
}

/** one sim step of the signal plans ps (dt s): actuated. Green lasts at least MIN_GREEN s, then ends (amber) when another phase is called and no car
 *  is within EXT_M m of the line on its lanes (or at MAX_GREEN s); with no call elsewhere it rests on green. Amber lasts amber s, all-red allRed s,
 *  then the next phase that is called (the next one, if none). fixed: the state comes from the fixed-time cycle at time t instead.
 *  onLane, s and lLen are the sim's lane lists, vehicle positions (m) and lane lengths (m) */
export function stepSignals(ps: SignalPlan[], onLane: number[][], s: ArrayLike<number>, lLen: ArrayLike<number>, dt: number, fixed: boolean, t: number) {
  for (const p of ps) {
    if (fixed) { fixedStep(p, t); continue; }
    const el = p.el + dt;
    if (p.stage === 0) {
      p.el = el;
      if (el < MIN_GREEN - EPS || !demandElsewhere(p, onLane, s, lLen)) continue;
      if (el >= MAX_GREEN - EPS || !near(p.phaseLanes[p.idx]!, EXT_M, onLane, s, lLen)) { p.stage = 1; p.el = 0; }
    } else if (p.stage === 1) {
      if (el >= p.amber - EPS) { p.stage = 2; p.el = 0; } else p.el = el;
    } else if (el >= p.allRed - EPS) {
      p.idx = nextPhase(p, onLane, s, lLen); p.stage = 0; p.el = 0;
    } else p.el = el;
  }
}
