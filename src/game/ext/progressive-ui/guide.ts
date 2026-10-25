// The guided Year 1 (P06/T045): the 7 steps, what completes each, and what each points at; and the stuck player's offer of New hole (P23 T117).
// Pure TS, no DOM. index.ts re-exports this file, so its import from './index' is read inside function bodies only.
import { STUCK_PLAY_SEC } from './index';

/** the facts the guide reads: the player's counters (T033a), placed course pieces by kind, tournaments run, and the guide's saved state */
export interface GuideFacts {
  pieces: number; roads: number; parks: number; structures: number;
  /** course pieces placed, by kind ('tee', 'fairway', 'green', 'bunker', 'water', 'path') */
  kinds: Partial<Record<string, number>>;
  /** tournaments finished (the round's runs) */
  runs: number;
  /** the course's holes with a par (T117: a hole built with New hole counts; missing = 0) */
  holes?: number;
  /** the seasons played, founding ones included (T117: the stuck player's offer; missing = 0) */
  seasons?: number;
  /** real play seconds (T117: the stuck player's offer; missing = 0) */
  playS?: number;
  /** 'on' while the guide runs, 'off' once skipped, finished, or for a returning player */
  tutorial: 'on' | 'off';
  /** the step the player is on (1..7; the guide never moves backwards) */
  step: number;
}

/** what a step points at: a UI element by its data-guide id, and/or a map spot the engine resolves */
export interface GuideTarget { ui?: string; map?: 'newHoleSpot' | 'nearestRoad' }

/** one step of the guide */
export interface GuideStep { id: string; n: number; title: string; body: string; done: 'next' | 'auto'; target: GuideTarget }

/** the number of steps */
export const GUIDE_STEPS = 7;

/** the steps in order (n = 1..7) */
export const GUIDE: readonly GuideStep[] = Object.freeze([
  {
    id: 'guide-welcome',
    n: 1,
    title: 'Welcome to your golf resort',
    body: 'Your course and town are ready; prepare for your first tournament at the end of August.',
    done: 'next',
    target: { ui: 'month' },
  },
  {
    id: 'guide-hole',
    n: 2,
    title: 'Lay out a new hole',
    body: 'Open Holes and press New hole: click a tee, then a green, and Build.',
    done: 'auto',
    target: { ui: 'rail-course', map: 'newHoleSpot' },
  },
  {
    id: 'guide-connect',
    n: 3,
    title: 'Connect your hole',
    body: 'Lay a cart path or build a road to link your hole to the road network.',
    done: 'auto',
    target: { ui: 'piece-path-stub', map: 'nearestRoad' },
  },
  {
    id: 'guide-park',
    n: 4,
    title: 'Build a car park',
    body: 'Place a car park beside a road so arriving spectators have space to park.',
    done: 'auto',
    target: { ui: 'tool-park', map: 'nearestRoad' },
  },
  {
    id: 'guide-gate',
    n: 5,
    title: 'Open an entrance gate',
    body: 'Place an entrance gate from Event so visitors can enter the venue.',
    done: 'auto',
    target: { ui: 'chip-event' },
  },
  {
    id: 'guide-tournament',
    n: 6,
    title: 'Play the tournament',
    body: 'Skip to the tournament and watch the spectator crowd arrive.',
    done: 'auto',
    target: { ui: 'chip-skip' },
  },
  {
    id: 'guide-results',
    n: 7,
    title: 'Review your results',
    body: 'Check the tournament verdict and get ready for Year 2 with full tools unlocked.',
    done: 'next',
    target: { ui: 'results' },
  },
]);

/** whether step n's goal is met by the facts (steps that finish on Next are never auto-met) */
export function stepMet(n: number, f: GuideFacts): boolean {
  switch (n) {
    case 1:
      return false;
    case 2:
      return (f.holes ?? 0) >= 1 || ((f.kinds?.tee ?? 0) >= 1 && (f.kinds?.fairway ?? 0) >= 1 && (f.kinds?.green ?? 0) >= 1);
    case 3:
      return (f.kinds?.path ?? 0) >= 1 || f.roads >= 1;
    case 4:
      return f.parks >= 1;
    case 5:
      return f.structures >= 1;
    case 6:
      return f.runs >= 1;
    case 7:
      return false;
    default:
      return false;
  }
}

/** the step to show (null when the guide is off or past step 7): the saved step, moved forward past every auto step already met */
export function guideStep(f: GuideFacts): GuideStep | null {
  if (f.tutorial === 'off' || f.step > GUIDE_STEPS) return null;
  let curr = Math.max(1, f.step);
  while (curr <= GUIDE_STEPS) {
    const stepDef = GUIDE[curr - 1]!;
    if (stepDef.done === 'auto' && stepMet(curr, f)) {
      curr++;
    } else {
      return stepDef;
    }
  }
  return null;
}

/** the saved step after the player presses Next on step f.step (Next only works on 'next' steps; on the last step it finishes: returns 8) */
export function guideNext(f: GuideFacts): number {
  const current = guideStep(f);
  if (!current) return f.step;
  if (current.done === 'next') return current.n + 1;
  return f.step;
}

/** the state after Skip tutorial */
export function guideSkip(): { tutorial: 'off' } {
  return { tutorial: 'off' };
}

/** the stuck player's offer (P23 4.2): New hole, pointing at the Course tool and a good spot */
export const GUIDE_STUCK: GuideStep = Object.freeze({
  id: 'guide-stuck',
  n: 2,
  title: 'Need a hand with your first hole?',
  body: 'Open Holes and press New hole: click a tee, then a green, and the whole hole is planned for you. Build when it looks right.',
  done: 'auto',
  target: Object.freeze({ ui: 'rail-course', map: 'newHoleSpot' }),
});

/** the step the guide shows: guideStep's; or, when the guide is off (skipped or finished) and the player is stuck (no hole after one season or
 *  STUCK_PLAY_SEC of play: the same fallback that opens stage 2), the offer of New hole; else null */
export function guideShown(f: GuideFacts): GuideStep | null {
  const s = guideStep(f);
  if (s) return s;
  const stuck = !stepMet(2, f) && ((f.seasons ?? 0) >= 1 || (f.playS ?? 0) >= STUCK_PLAY_SEC);
  return stuck ? GUIDE_STUCK : null;
}

/** the old first-run hint ids each step replaces (their dismissals count as that step already seen): step 2 'hint-build-first-hole', step 4 'hint-connect-road-and-park', step 5 'hint-place-gate-and-tents', step 7 'hint-traffic-and-advanced' */
export const LEGACY_HINT_STEP: Readonly<Record<string, number>> = Object.freeze({
  'hint-build-first-hole': 2,
  'hint-connect-road-and-park': 4,
  'hint-place-gate-and-tents': 5,
  'hint-traffic-and-advanced': 7,
});
