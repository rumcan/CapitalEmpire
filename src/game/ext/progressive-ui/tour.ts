// The start tutorial (T293, #878; the owner, 2026-11-01: "add tickets to explain it in a tutorial at the start", with T292: the town never
// builds its own roads): four short steps on a new game's start, before the golf start. 1 your town (the houses along the county road; it grows
// by itself, only on land with a road), 2 roads are your job (the road tool; done when the player has built a town road), 3 when the town is out
// of room (T292's toast; busy streets jam, upgrading them is the player's too), 4 into the golf start (a range start's welcome card and guided
// build; the old town start's course). It runs on the guide's machinery (guide.ts guideLines, the RangeGuideCard): the steps go in order, each
// can be skipped, Skip tutorial ends it, and it is saved (GolfProgress.tour) so it shows once; Help replays it. Pure TS, no DOM.
import { guideLines, type GuideLine, type GuideStep, type RangeGuideSave } from './guide';

/** the tutorial's steps in order (n = 1..4); target.ui: the control its ring points at (map rings: the engine's, Engine.tourShowMe) */
export const TOWN_TOUR: readonly GuideStep[] = Object.freeze([
  {
    id: 'tour-town',
    n: 1,
    title: 'Your town',
    body: 'The houses along the county road are the town. It grows by itself, but only on land that has a road.',
    done: 'next',
    target: {},
  },
  {
    id: 'tour-roads',
    n: 2,
    title: 'Roads are your job',
    body: 'The town never lays a road of its own. Build one with the road tool (Traffic › Build) to give it new lots: paved roads sell their lots to the town and pay you. Build a short road to go on.',
    done: 'auto',
    target: { ui: 'rail-traffic' },
  },
  {
    id: 'tour-room',
    n: 3,
    title: 'When the town is out of room',
    body: 'You are told when the town has no room left to grow: build another road to keep it growing. Busy streets jam, and upgrading them (Traffic › Upgrade) is your job too.',
    done: 'next',
    target: { ui: 'rail-traffic' },
  },
  {
    id: 'tour-golf',
    n: 4,
    title: 'Now your golf',
    body: 'Your driving range is next: the guide in the corner walks you through building it, step by step.',
    done: 'next',
    target: { ui: 'rail-range' },
  },
]);

/** the tutorial in the save (GolfProgress.tour): the guide's save (the steps done and skipped, the whole tutorial skipped) and the town roads
 *  the player has built while it ran (step 2's done-check) */
export interface TourSave extends RangeGuideSave { roads: number }
/** a new game's tutorial (and Help's replay): nothing done */
export function newTour(): TourSave { return { done: [], skipped: [], off: false, roads: 0 }; }
/** a loaded tutorial made well formed (null: none, a save from before T293) */
export function normalizeTour(x: unknown): TourSave | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Partial<TourSave>, ids = new Set(TOWN_TOUR.map(s => s.id));
  const list = (v: unknown) => (Array.isArray(v) ? [...new Set(v.filter((s): s is string => typeof s === 'string' && ids.has(s)))] : []);
  const done = list(o.done), r = Number(o.roads);
  return { done, skipped: list(o.skipped).filter(id => !done.includes(id)), off: o.off === true, roads: Number.isFinite(r) && r > 0 ? Math.floor(r) : 0 };
}

/** what the tutorial's steps read: the road tool's lock (its why; null: open) and the start (a range start's, or the old town start's) */
export interface TourFacts { roadLock: string | null; start: 'range' | 'town' }

/** a step as this game shows it: step 2 with the road tool still locked says when it opens and goes on with Next (it cannot wait for a road the
 *  player cannot build); step 4 in the old town start points at the course (no range there) */
export function tourStepFor(s: GuideStep, f: TourFacts): GuideStep {
  if (s.id === 'tour-roads' && f.roadLock) return { ...s, done: 'next', body: `The town never lays a road of its own. Build roads with the road tool (Traffic › Build) to give it new lots: paved roads sell their lots to the town and pay you. The road tool is locked for now: ${f.roadLock.replace(/^Unlocks/, 'it opens').replace(/\.$/, '')}.` };
  if (s.id === 'tour-golf' && f.start === 'town') return { ...s, body: 'Your golf course is beside the town: its holes, buildings and paths are in the Course drawer on the left.', target: { ui: 'rail-course' } };
  return s;
}
/** the tutorial card's lines (null: no tutorial: an old save's, skipped, or every step done or skipped), each step as this game shows it */
export function tourLines(g: TourSave | null | undefined, f: TourFacts): GuideLine[] | null {
  return guideLines(TOWN_TOUR, g)?.map(l => ({ ...l, step: tourStepFor(l.step, f) })) ?? null;
}
/** the current step (the first still to do), or null when the tutorial is not running */
export function tourCurrent(g: TourSave | null | undefined, f: TourFacts): GuideStep | null {
  return tourLines(g, f)?.find(l => l.current)?.step ?? null;
}
/** whether the tutorial is running (on, and a step still to do) */
export function tourRunning(g: TourSave | null | undefined): boolean { return !!guideLines(TOWN_TOUR, g); }

/** the done-check (a few times a second): the current step ticks when its goal is met (step 2: a town road built while the tutorial ran, the road
 *  tool open). Only the current step ticks: the steps go in order. Returns the step ticked, or null */
export function tourTick(g: TourSave, f: TourFacts): GuideStep | null {
  const s = tourCurrent(g, f);
  if (!s || s.done !== 'auto' || !tourMet(s.id, g)) return null;
  g.done.push(s.id); return s;
}
/** whether step id's goal is met by the save (only step 2 has one: a town road built while the tutorial ran) */
export function tourMet(id: string, g: TourSave): boolean { return id === 'tour-roads' && g.roads >= 1; }
/** Next on the current step (a 'next' step only, as this game shows it): it is done; false when there is nothing to move on */
export function tourNext(g: TourSave, f: TourFacts): boolean {
  const s = tourCurrent(g, f); if (!s || s.done !== 'next') return false;
  g.done.push(s.id); return true;
}
/** Skip on a step still to do (a done one stays done); false when there is no such step to skip */
export function tourSkip(g: TourSave, id: string): boolean {
  if (!TOWN_TOUR.some(s => s.id === id) || g.done.includes(id) || g.skipped.includes(id)) return false;
  g.skipped.push(id); return true;
}
/** Skip tutorial: it goes for good (Help replays it: newTour) */
export function tourOff(g: TourSave): void { g.off = true; }
