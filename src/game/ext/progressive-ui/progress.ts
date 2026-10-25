// What the player did in a golf game (T033): the counters, and since plan P23 T117 the unlock stage reached and the tools opened (NEW badges).
// Pure TypeScript, no DOM. index.ts re-exports this file, so the imports from './index' are type-only or read inside function bodies (no
// import-cycle surprises).
import { NEW_BADGE_IDS, TOOL_GROUP, TOOL_STAGE, resolveOnboardingStage, type OnboardingStage, type PlayerProgressFacts, type UiToolId } from './index';

/** what the player did in this golf game (saved in GolfSave.progress): course pieces placed, road builds, car parks, event structures, real play
 *  seconds, the hints dismissed, Settings > "Show every tool now" (advanced), the highest unlock stage reached (T117; it never falls) and the
 *  tool and rail group ids opened since they unlocked (T117: their NEW badges are gone) */
export interface GolfProgress { pieces: number; roads: number; parks: number; structures: number; playS: number; dismissed: string[]; advanced: boolean; stage: OnboardingStage; seen: string[] }

/** a new game's progress: nothing done yet, stage 1 */
export function emptyProgress(): GolfProgress { return { pieces: 0, roads: 0, parks: 0, structures: 0, playS: 0, dismissed: [], advanced: false, stage: 1, seen: [] }; }

/** a non-negative finite number, else 0 (a bad saved value counts as nothing done) */
function count(x: unknown): number { return typeof x === 'number' && Number.isFinite(x) && x > 0 ? x : 0; }
/** the strings of a saved list (anything else is dropped) */
function strings(x: unknown): string[] { return Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string') : []; }

/** a loaded save's progress. A save from before T117 (no stage: the progress missing, as before T033, or kept under the old rules) opens with
 *  every tool, as it had them (the old stages opened Roads and the car park from the start, and the 10-minute rule everything; these now wait for
 *  stage 3): stage 3, with every NEW badge already seen. Bad numbers become 0; dismissed and seen keep only strings */
export function normalizeProgress(p: Partial<GolfProgress> | null | undefined): GolfProgress {
  const q: Partial<GolfProgress> = p ?? {}, old = typeof q.stage !== 'number', s = Math.floor(count(q.stage));
  return {
    pieces: Math.floor(count(q.pieces)),
    roads: Math.floor(count(q.roads)),
    parks: Math.floor(count(q.parks)),
    structures: Math.floor(count(q.structures)),
    playS: count(q.playS),
    dismissed: strings(q.dismissed),
    advanced: q.advanced === true,
    stage: old || s >= 3 ? 3 : s === 2 ? 2 : 1,
    seen: old ? NEW_BADGE_IDS.slice() : strings(q.seen),
  };
}

/** the course facts the unlocks read besides the saved progress (Engine.playerProgressFacts): the holes with a par, the seasons played (the
 *  tournaments and a range start's founding seasons) and whether the tour has invited the player */
export interface CourseProgress { holes: number; seasons: number; invited: boolean }

/** the facts the unlocks read: the saved progress and the course */
export function progressFacts(p: GolfProgress, c: CourseProgress): PlayerProgressFacts {
  return {
    advancedMode: p.advanced, playableHoles: Math.max(0, Math.floor(c.holes)), seasonsDone: Math.max(0, Math.floor(c.seasons)), invited: c.invited,
    elapsedSeconds: p.playS, stageReached: p.stage, seen: p.seen,
    roadsBuilt: p.roads, carParksBuilt: p.parks, eventStructuresPlaced: p.structures, dismissedHints: p.dismissed,
  };
}

/** keeps the saved progress in step with the facts (the engine calls it a few times a second): the stage reached rises to the course's (it never
 *  falls), and the tool in hand, when it is open, counts as opened with its rail group, so their NEW badges go. True when anything changed (the
 *  caller saves) */
export function advanceProgress(p: GolfProgress, f: PlayerProgressFacts, tool: string | null): boolean {
  let changed = false;
  const stage = resolveOnboardingStage(f);
  if (stage > p.stage) { p.stage = stage; changed = true; }
  const ts = tool ? TOOL_STAGE[tool as UiToolId] : undefined;
  if (tool && ts !== undefined && (f.advancedMode || ts <= p.stage)) {
    for (const id of [tool, TOOL_GROUP[tool as UiToolId]!]) if (NEW_BADGE_IDS.includes(id) && !p.seen.includes(id)) { p.seen.push(id); changed = true; }
  }
  return changed;
}
