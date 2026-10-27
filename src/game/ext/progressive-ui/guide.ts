// The guided Year 1 (P06/T045): the 7 steps, what completes each, and what each points at; and the stuck player's offer of New hole (P23 T117).
// A range start (plan P22 2.8, T095) has its own 7 steps, chosen by GuideFacts.start, and the ring's tee spot until P06's newHoleSpot lands.
// Pure TS, no DOM. index.ts re-exports this file, so its import from './index' is read inside function bodies only.
import { STUCK_PLAY_SEC } from './index';
import type { Rect } from '../../golf/mode';

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
  /** the game's start (T095): 'range' picks the range start's steps (RANGE_GUIDE); anything else, or missing, the old start's (GUIDE) */
  start?: string;
  /** a range start's clubhouse is placed (T095; missing = no) */
  clubhouse?: boolean;
  /** the tour has invited the player (T095; missing = no) */
  invited?: boolean;
  /** real seconds since the tour's invitation came in this session (T095: the invitation's step holds INVITE_HOLD_S); missing = long ago */
  invitedAgoS?: number;
  /** false for an old save without the guide's progress (T095: a save from before the range start's ramp): no guide at all; missing = true */
  progress?: boolean;
}

/** what a step points at: a UI element by its data-guide id, and/or a map spot the engine resolves */
export interface GuideTarget { ui?: string; map?: 'newHoleSpot' | 'nearestRoad' }

/** one step of the guide */
export interface GuideStep { id: string; n: number; title: string; body: string; done: 'next' | 'auto'; target: GuideTarget }

/** an engine event that moves the guide on at once (T188): a hole built, the clubhouse placed, a car park built */
export type GuideEvent = 'hole' | 'clubhouse' | 'carpark';
/** the facts after an event, before the next count catches up (the guide reads them at once): a hole more, the clubhouse placed, a car park more */
export function applyGuideEvent(f: GuideFacts, e: GuideEvent): GuideFacts {
  if (e === 'hole') return { ...f, holes: (f.holes ?? 0) + 1 };
  if (e === 'clubhouse') return { ...f, clubhouse: true };
  return { ...f, parks: f.parks + 1 };
}

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
    target: { ui: 'new-hole', map: 'newHoleSpot' },
  },
  {
    id: 'guide-connect',
    n: 3,
    title: 'Connect your hole',
    body: 'Lay a cart path or build a road to link your hole to the road network.',
    done: 'auto',
    target: { ui: 'rail-course', map: 'nearestRoad' }, // T206: Course › Cart paths & roads
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

/** a range start's steps (plan P22 2.8, T095): the welcome, hole 1, the clubhouse, the nine, the tour's invitation, the tournament, the results */
export const RANGE_GUIDE: readonly GuideStep[] = Object.freeze([
  {
    id: 'guide-range-welcome',
    n: 1,
    title: 'Welcome to your driving range',
    body: 'Drivers on the county road stop to hit a bucket. Grow the range, build a course behind it, and a town will grow around you.',
    done: 'next',
    target: { ui: 'range-chip' },
  },
  {
    id: 'guide-range-hole',
    n: 2,
    title: 'Lay hole 1',
    body: 'Open Holes and press New hole: click a tee, then a green, and Build. The ring marks a good tee near the range.',
    done: 'auto',
    target: { ui: 'new-hole', map: 'newHoleSpot' },
  },
  {
    id: 'guide-range-clubhouse',
    n: 3,
    title: 'Place the clubhouse',
    body: 'Open Buildings and place the clubhouse by the road or the drive: the tour will not come without one.',
    done: 'auto',
    target: { ui: 'clubhouse-card' },
  },
  {
    id: 'guide-range-nine',
    n: 4,
    title: 'Finish the nine',
    body: 'Build holes until the course has nine. The town grows faster with every hole you open.',
    done: 'auto',
    target: { ui: 'new-hole', map: 'newHoleSpot' },
  },
  {
    id: 'guide-range-invite',
    n: 5,
    title: "The tour's invitation",
    body: "Nine holes, a car park and a clubhouse bring the tour's invitation to the Club Championship. Your range's car park already counts.",
    done: 'auto',
    target: { ui: 'season-chip' },
  },
  {
    id: 'guide-range-tournament',
    n: 6,
    title: 'Play the tournament',
    body: 'The first tournament closes the season the invitation names. Skip to it and watch the crowd arrive.',
    done: 'auto',
    target: { ui: 'chip-skip' },
  },
  {
    id: 'guide-range-results',
    n: 7,
    title: 'Review your results',
    body: 'Check the verdict and the takings, then plan the next season.',
    done: 'next',
    target: { ui: 'results' },
  },
]);

/** how long a range start's invitation step stays up after the invitation comes, real seconds (T095): the clubhouse step comes before the nine,
 *  so the invitation follows the ninth hole at once and the step would otherwise never be seen */
export const INVITE_HOLD_S = 8;

/** the steps for the facts' start: a range start's (RANGE_GUIDE), else the old start's (GUIDE) */
export function guideTable(f: Pick<GuideFacts, 'start'>): readonly GuideStep[] { return f.start === 'range' ? RANGE_GUIDE : GUIDE; }

/** whether a range start's step n is met (T095): 2 hole 1 built, 3 the clubhouse placed, 4 nine holes, 5 invited (INVITE_HOLD_S ago), 6 a
 *  tournament run */
function rangeStepMet(n: number, f: GuideFacts): boolean {
  switch (n) {
    case 2: return (f.holes ?? 0) >= 1;
    case 3: return !!f.clubhouse;
    case 4: return (f.holes ?? 0) >= 9;
    case 5: return !!f.invited && (f.invitedAgoS ?? Infinity) >= INVITE_HOLD_S;
    case 6: return f.runs >= 1;
    default: return false;
  }
}

/** whether step n's goal is met by the facts (steps that finish on Next are never auto-met); a range start's by its own table */
export function stepMet(n: number, f: GuideFacts): boolean {
  if (f.start === 'range') return rangeStepMet(n, f);
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

/** the step to show (null when the guide is off, past step 7, or an old save without its progress): the saved step, moved forward past every
 *  auto step already met, from the start's table */
export function guideStep(f: GuideFacts): GuideStep | null {
  if (f.tutorial === 'off' || f.step > GUIDE_STEPS || f.progress === false) return null;
  const table = guideTable(f);
  let curr = Math.max(1, f.step);
  while (curr <= GUIDE_STEPS) {
    const stepDef = table[curr - 1]!;
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
  target: Object.freeze({ ui: 'new-hole', map: 'newHoleSpot' }),
});

/** the step the guide shows: guideStep's; or, when the guide is off (skipped or finished) and the player is stuck (no hole after one season or
 *  STUCK_PLAY_SEC of play: the same fallback that opens stage 2), the offer of New hole; else null. A range start is never stuck (P24 D32): its
 *  ramp opens New hole */
export function guideShown(f: GuideFacts): GuideStep | null {
  const s = guideStep(f);
  if (s || f.start === 'range' || f.progress === false) return s;
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

/** how far past the range plot's side the ring's tee spot is, tiles, and how far past the practice area's far side when that lies beside the
 *  plot (P24 T130: the putting and chipping greens; a tee there is refused) (T095: until P06's newHoleSpot lands) */
export const FALLBACK_TEE_PAST = 30, FALLBACK_PRACTICE_PAST = 15;
/** how far behind the range front's back edge (the way its golfers hit) the ring's tee spot is, tiles: off the road's verge, so the tee box and
 *  its rough lie on the land */
export const FALLBACK_TEE_BEHIND = 10;

/** the ring's suggested tee spot in a range start until P06's newHoleSpot lands (T095): FALLBACK_TEE_PAST tiles past the range plot's side along
 *  the road, on the side with more of the parcel, or FALLBACK_PRACTICE_PAST past the practice area (practice: its box, x0 y0 x1 y1) when that is
 *  further; FALLBACK_TEE_BEHIND past the range front's back edge; kept 2 tiles inside the parcel. dir: the way the range's golfers hit (0 north,
 *  1 east, 2 south, 3 west), so the road runs along x for 0 and 2 and along y for 1 and 3 */
export function fallbackTeeSpot(plot: Rect, front: Rect, parcel: Rect, dir: 0 | 1 | 2 | 3, practice?: readonly [number, number, number, number]): { x: number; y: number } {
  const alongX = dir === 0 || dir === 2, [qx, qy, qw, qh] = parcel;
  const a0 = alongX ? plot[0] : plot[1], a1 = a0 + (alongX ? plot[2] : plot[3]), p0 = alongX ? qx : qy, p1 = p0 + (alongX ? qw : qh);
  const up = p1 - a1 >= a0 - p0;
  let along = up ? a1 + FALLBACK_TEE_PAST : a0 - FALLBACK_TEE_PAST;
  if (practice) {
    const b0 = alongX ? practice[0] : practice[1], b1 = alongX ? practice[2] : practice[3];
    along = up ? Math.max(along, b1 + FALLBACK_PRACTICE_PAST) : Math.min(along, b0 - FALLBACK_PRACTICE_PAST);
  }
  const across = dir === 0 ? front[1] - FALLBACK_TEE_BEHIND : dir === 1 ? front[0] + front[2] + FALLBACK_TEE_BEHIND : dir === 2 ? front[1] + front[3] + FALLBACK_TEE_BEHIND : front[0] - FALLBACK_TEE_BEHIND;
  const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo + 2), hi - 2);
  return alongX ? { x: clamp(along, qx, qx + qw), y: clamp(across, qy, qy + qh) } : { x: clamp(across, qx, qx + qw), y: clamp(along, qy, qy + qh) };
}
