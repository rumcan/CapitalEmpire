// The guided Year 1 (P06/T045): the 7 steps, what completes each, and what each points at; and the stuck player's offer of New hole (P23 T117).
// A range start (plan P22 2.8, T095) has its own 7 steps, chosen by GuideFacts.start, and the ring's tee spot until P06's newHoleSpot lands.
// Pure TS, no DOM. index.ts re-exports this file, so its import from './index' is read inside function bodies only.
import { STUCK_PLAY_SEC } from './index';
import type { Rect } from '../../golf/mode';
import { JAM } from '../../features';
import { practicePath } from '../../golf/menu-path';
import type { ToolTile } from '../../../ui/tool-tiles'; // (a type only: J8, #1261, each step names its painted tile)

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
  /** false for an old save without the guide's progress (T095: a save from before the range start's ramp): no guide at all; missing = true */
  progress?: boolean;
  /** T239, a range start's guided build: the range's lifetime golfers who bought a bucket, its upgrades owned, whether a walking path joins
   *  the car park, the shack and the tee, whether the practice area is still for sale, and the putting green's state (missing: none of it) */
  golfers?: number; owned?: readonly string[]; walkway?: boolean; practiceForSale?: boolean; putting?: string;
  /** T288 (#873), a bare start's placements: the driving range placed, the range's own car park placed, the practice area placed (missing: no) */
  rangePlaced?: boolean; lotPlaced?: boolean; practicePlaced?: boolean;
  /** T459 (#1211): the range balls picked up (any way) and brought back to the ball room, lifetime (missing: no ball loop, the step does not wait for it) */
  ballsBack?: number;
}

/** what a step points at: a UI element by its data-guide id, and/or a map spot the engine resolves (T239: 'walkway', rings at the car park's
 *  edge, the shack and the tee a walking path joins) */
export interface GuideTarget { ui?: string; map?: 'newHoleSpot' | 'nearestRoad' | 'walkway' }

/** one step of the guide; reward (T239, a range start's steps): the dollars its tick pays; tile (J8, #1261; the owner: a picture on every step of the tutorial
 *  and the guide): the painted tile (ui/tool-tiles.ts) the guide card shows at the left of the step's row, bigger on the open step */
export interface GuideStep { id: string; n: number; title: string; body: string; done: 'next' | 'auto'; target: GuideTarget; reward?: number; tile?: ToolTile }

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
    tile: 'front-door',
    n: 1,
    title: 'Welcome to your golf resort',
    body: 'Your course and town are ready; prepare for your first tournament at the end of August.',
    done: 'next',
    target: { ui: 'month' },
  },
  {
    id: 'guide-hole',
    tile: 'golf-hole',
    n: 2,
    title: 'Lay out a new hole',
    body: 'Open Holes and press New hole: click a tee, then a green, and Build.',
    done: 'auto',
    target: { ui: 'new-hole', map: 'newHoleSpot' },
  },
  {
    id: 'guide-connect',
    tile: 'cart-path',
    n: 3,
    title: 'Connect your hole',
    body: 'Lay a cart path or build a road to link your hole to the road network.',
    done: 'auto',
    target: { ui: 'rail-paths', map: 'nearestRoad' }, // T288: the rail's Cart paths & roads
  },
  {
    id: 'guide-park',
    tile: 'gravel-car-park',
    n: 4,
    title: 'Build a car park',
    body: 'Place a car park beside a road so arriving spectators have space to park.',
    done: 'auto',
    target: { ui: 'tool-park', map: 'nearestRoad' },
  },
  {
    id: 'guide-gate',
    tile: 'draw-drive',
    n: 5,
    title: 'Open an entrance gate',
    body: 'Place an entrance gate from Event so visitors can enter the venue.',
    done: 'auto',
    target: { ui: 'chip-event' },
  },
  {
    id: 'guide-tournament',
    tile: 'grandstand-scoreboard',
    n: 6,
    title: 'Play the tournament',
    body: 'Open the Season card and skip to the tournament, then watch the spectator crowd arrive.',
    done: 'auto',
    target: { ui: 'chip-skip' },
  },
  {
    id: 'guide-results',
    tile: 'statement',
    n: 7,
    title: 'Review your results',
    body: 'Check the tournament verdict and get ready for Year 2 with full tools unlocked.',
    done: 'next',
    target: { ui: 'results' },
  },
]);

/** a range start's steps (T239, the owner 2026-10-28: "the starting tutorial on how to build to upgrade and build some of the first driving range
 *  features"): the guided build. T288 (#873, the owner: "only his trailer and plot is there"): place the driving range, then its car park; sell the first buckets, place the target greens, lay the walking path, gravel and pave the car park, turf the tee
 *  box, buy the practice area and build its putting green, then the first hole. Every step ticks itself when its build is done (in any order),
 *  pays its reward, and can be skipped; the guide's card lists them all (RangeGuideCard) */
export const RANGE_GUIDE: readonly GuideStep[] = Object.freeze([
  {
    id: 'guide-range-place',
    tile: 'place-range',
    n: 1,
    title: 'Place your driving range',
    body: 'Your land is bare: only your trailer. Range › Place the driving range puts it in your hand: move it along the county road and click to build it.',
    done: 'auto',
    target: { ui: 'rail-range' },
    reward: 1000,
  },
  {
    id: 'guide-range-lot',
    tile: 'gravel-car-park',
    n: 2,
    title: 'Place its car park',
    body: 'Range › Place the car park: a packed-dirt lot beside the road, near the shack. Golfers drive on without one.',
    done: 'auto',
    target: { ui: 'rail-range' },
    reward: 500,
  },
  {
    id: 'guide-range-buckets',
    tile: 'sell-buckets',
    n: 3,
    title: 'Sell your first buckets, then fetch the balls',
    // (T459 #1211: the ball room's 200 balls are gone in a month; a player never told to pick them up took $1,200 in a whole season)
    body: 'Drivers on the county road stop to hit a bucket at your shack, and their balls stay out on the range: when the ball room runs dry, golfers drive on. Take Walk, go out onto the range, hold F over the balls (or click a pile) and empty your basket at the ball room.',
    done: 'auto',
    target: { ui: 'rail-walk' },
    reward: 500,
  },
  {
    id: 'guide-range-greens',
    tile: 'target-green',
    n: 4,
    title: 'Place the target greens',
    body: 'On the range card, Target greens puts three greens with flags in your hand: click them onto your range, and more golfers stop.',
    done: 'auto',
    target: { ui: 'range-buy-greens' },
    reward: 1000,
  },
  {
    id: 'guide-range-path',
    tile: 'walking-path',
    n: 5,
    title: 'Lay a walking path',
    body: 'Cart paths & roads › Walking path: drag from the car park to the shack, then along behind the mats. Your golfers walk it instead of the dirt.',
    done: 'auto',
    target: { ui: 'rail-paths', map: 'walkway' },
    reward: 1000,
  },
  {
    id: 'guide-range-carpark',
    tile: 'paved-car-park',
    n: 6,
    title: 'Gravel, then pave, the car park',
    body: 'On the range card: Gravel the car park (more cars, tidier rows), then Pave the car park (painted bays and lamps).',
    done: 'auto',
    target: { ui: 'range-buy-gravel' },
    reward: 1000,
  },
  {
    id: 'guide-range-turf',
    tile: 'turf-tee',
    n: 7,
    title: 'Turf the tee box',
    body: 'On the range card, Turf the tee box: grass under the mats, golfers pay a dollar more.',
    done: 'auto',
    target: { ui: 'range-buy-teeturf' },
    reward: 1000,
  },
  {
    id: 'guide-range-practice',
    tile: 'putting-green',
    n: 8,
    title: 'Place the practice area, build a putting green',
    body: `Range › Place the practice area: put it on your land near the car park (it comes with a few dirt greens and a bunker scrape). Then ${practicePath('›')} › Putting green on it. Or click the area, or its name.`, // (#1282: Facilities is the Course menu's sixth tile; #1281: the area's own window)
    done: 'auto',
    target: { ui: 'rail-range' },
    reward: 1000,
  },
  {
    id: 'guide-range-hole',
    tile: 'golf-hole',
    n: 9,
    title: 'Build the first hole',
    body: 'Your land has room for a first nine; Land for sale buys more as the course grows. Open Holes, press New hole, click a tee, then a green, and Build.',
    done: 'auto',
    target: { ui: 'new-hole', map: 'newHoleSpot' },
    reward: 2500,
  },
]);
/** the golfers a range start's first step waits for (T239: the range's lifetime golfers who bought a bucket) */
export const FIRST_BUCKETS = 3;
/** T459 (#1211): the balls the buckets step then waits for, picked up and brought back to the ball room (a bucket's worth) */
export const FIRST_FETCH = 40;

/** a range start's guide in the save (T239, GolfProgress.guide): the steps ticked (done: their reward paid) and skipped, and whether the whole
 *  guide was skipped. A save without it (made before T239) has no guide card */
export interface RangeGuideSave { done: string[]; skipped: string[]; off: boolean }
/** T288: the steps a range from before T288 has done already (it was built for the player): a load ticks them with no reward */
export const PLACED_STEPS: readonly string[] = ['guide-range-place', 'guide-range-lot'];
/** a new range game's guide: nothing done */
export function newRangeGuide(): RangeGuideSave { return { done: [], skipped: [], off: false }; }
/** a loaded guide made well formed (null: none, an old save's) */
export function normalizeRangeGuide(x: unknown): RangeGuideSave | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Partial<RangeGuideSave>, ids = new Set(RANGE_GUIDE.map(s => s.id));
  const list = (v: unknown) => (Array.isArray(v) ? [...new Set(v.filter((s): s is string => typeof s === 'string' && ids.has(s)))] : []);
  const done = list(o.done);
  return { done, skipped: list(o.skipped).filter(id => !done.includes(id)), off: o.off === true };
}
/** a step line's state: ticked (done), skipped, or still to do */
export type GuideLineState = 'done' | 'skipped' | 'todo';
/** the guide card's line for a step: the step, its state, and whether it is the current one (the first still to do) */
export interface GuideLine { step: GuideStep; state: GuideLineState; current: boolean }
/** the guide card's lines (null: no guide: an old save's, skipped, or every step done or skipped) */
export function rangeGuideLines(g: RangeGuideSave | null | undefined): GuideLine[] | null { return JAM ? null : guideLines(RANGE_GUIDE, g); } // (J7 #1225: the jam build has no step list: its tips are ui/jam/tips.ts)
/** a guide card's lines for any table of steps (the range's guided build, T293's start tutorial): null when there is no guide, it is off, or
 *  every step is done or skipped */
export function guideLines(table: readonly GuideStep[], g: RangeGuideSave | null | undefined): GuideLine[] | null {
  if (!g || g.off) return null;
  let cur = false;
  const lines = table.map(step => {
    const state: GuideLineState = g.done.includes(step.id) ? 'done' : g.skipped.includes(step.id) ? 'skipped' : 'todo';
    const current = state === 'todo' && !cur; if (current) cur = true;
    return { step, state, current };
  });
  return cur ? lines : null;
}
/** the step the guide is on (1..9: the first still to do), or undefined when there is no guide running (an old save's, skipped, or finished) */
export function rangeGuideCurrent(g: RangeGuideSave | null | undefined): number | undefined {
  return rangeGuideLines(g)?.find(l => l.current)?.step.n;
}
/** the steps whose build is done now and not yet ticked (or skipped), ticked in the save; the caller pays their rewards */
export function rangeGuideTick(g: RangeGuideSave, f: GuideFacts): GuideStep[] {
  if (g.off || JAM) return []; // (J7: nothing ticks or pays in the jam build: no build order is rewarded)
  const out = RANGE_GUIDE.filter(s => !g.done.includes(s.id) && !g.skipped.includes(s.id) && rangeStepMet(s.n, f));
  for (const s of out) g.done.push(s.id);
  return out;
}
/** Skip on a step's line (a ticked one stays ticked); false when there is no such step to skip */
export function rangeGuideSkip(g: RangeGuideSave, id: string): boolean {
  if (!RANGE_GUIDE.some(s => s.id === id) || g.done.includes(id) || g.skipped.includes(id)) return false;
  g.skipped.push(id); return true;
}
/** Skip the guide: the whole card goes for good */
export function rangeGuideOff(g: RangeGuideSave): void { g.off = true; }

/** the steps for the facts' start: a range start's (RANGE_GUIDE), else the old start's (GUIDE) */
export function guideTable(f: Pick<GuideFacts, 'start'>): readonly GuideStep[] { return f.start === 'range' ? RANGE_GUIDE : GUIDE; }

/** whether a range start's step n is met (T239): 1 FIRST_BUCKETS golfers served, 2 the target greens built, 3 a walking path joining the car
 *  park, the shack and the tee, 4 the car park paved (after its gravel), 5 the tee box turfed, 6 the practice area bought and its putting green
 *  open, 7 a hole built */
function rangeStepMet(n: number, f: GuideFacts): boolean {
  const own = (id: string) => !!f.owned?.includes(id);
  switch (n) {
    case 1: return f.rangePlaced !== false; // (T288: a fact missing is a range from before T288: placed)
    case 2: return f.lotPlaced !== false;
    case 3: return (f.golfers ?? 0) >= FIRST_BUCKETS && (f.ballsBack === undefined || f.ballsBack >= FIRST_FETCH); // (a fact missing: a save from before T386's balls)
    case 4: return own('greens');
    case 5: return !!f.walkway;
    case 6: return own('pave');
    case 7: return own('teeturf');
    case 8: return !f.practiceForSale && f.practicePlaced !== false && f.putting === 'open';
    case 9: return (f.holes ?? 0) >= 1;
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
  const table = guideTable(f); // (T288: a range start's has nine steps, the old start's GUIDE_STEPS)
  if (f.tutorial === 'off' || f.step > table.length || f.progress === false) return null;
  let curr = Math.max(1, f.step);
  while (curr <= table.length) {
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
  tile: 'golf-hole',
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
