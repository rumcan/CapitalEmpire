// Fixed-time signal plans: the state of each phase at a time. Pure TS, no DOM.
import type { SignalPlan } from './lanes';

/** what a signal shows: green, amber or red */
export const SIG = { GREEN: 0, AMBER: 1, RED: 2 } as const;

/** the state a signal phase shows at time t (s): the plan cycles phases green, amber, all-red, one after another */
export function phaseState(p: SignalPlan, phase: number, t: number): number {
  const seg = p.green + p.amber + p.allRed, C = p.phases * seg;
  let tt = (t + p.offset) % C; if (tt < 0) tt += C;
  const cur = Math.floor(tt / seg), w = tt - cur * seg;
  if (cur !== phase) return SIG.RED;
  return w < p.green ? SIG.GREEN : w < p.green + p.amber ? SIG.AMBER : SIG.RED;
}
