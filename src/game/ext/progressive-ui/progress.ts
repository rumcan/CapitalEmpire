// What the player did in a golf game (T033): the counters, and since plan P23 T117 the unlock stage reached and the tools opened (NEW badges);
// since plan P24 T132 a range start's ramp step reached.
// Pure TypeScript, no DOM. index.ts re-exports this file, so the imports from './index' are type-only or read inside function bodies (no
// import-cycle surprises).
import { normalizeRangeGuide, rangeGuideCurrent, type RangeGuideSave } from './guide';
import { NEW_BADGE_IDS, RAMP_TOOL_STEP, TOOL_GROUP, TOOL_STAGE, rampEarned, rampLock, resolveOnboardingStage, type OnboardingStage, type PlayerProgressFacts, type RampFacts, type RampStep, type UiToolId } from './index';

/** what the player did in this golf game (saved in GolfSave.progress): course pieces placed, road builds, car parks, event structures, real play
 *  seconds, the hints dismissed, Settings > "Show every tool now" (advanced), the highest unlock stage reached (T117; it never falls) and the
 *  tool and rail group ids opened since they unlocked (T117: their NEW badges are gone); ramp: a new range game's ramp step reached (T132: it
 *  never falls; missing: no ramp, as in every other start and in a range save from before T132, which keeps every tool) */
export interface GolfProgress { pieces: number; roads: number; parks: number; structures: number; playS: number; dismissed: string[]; advanced: boolean; stage: OnboardingStage; seen: string[]; ramp?: RampStep;
  /** T239: a new range game's guided build (guide.ts RANGE_GUIDE: the steps ticked and skipped, the guide skipped); missing: no guide card (every
   *  other start, and a range save from before T239) */
  guide?: RangeGuideSave }

/** a new game's progress: nothing done yet, stage 1 (a new range game sets ramp 0 itself) */
export function emptyProgress(): GolfProgress { return { pieces: 0, roads: 0, parks: 0, structures: 0, playS: 0, dismissed: [], advanced: false, stage: 1, seen: [] }; }

/** a non-negative finite number, else 0 (a bad saved value counts as nothing done) */
function count(x: unknown): number { return typeof x === 'number' && Number.isFinite(x) && x > 0 ? x : 0; }
/** the strings of a saved list (anything else is dropped) */
function strings(x: unknown): string[] { return Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string') : []; }

/** a loaded save's progress. A save from before T117 (no stage: the progress missing, as before T033, or kept under the old rules) opens with
 *  every tool, as it had them (the old stages opened Roads and the car park from the start, and the 10-minute rule everything; these now wait for
 *  stage 3): stage 3, with every NEW badge already seen. Bad numbers become 0; dismissed and seen keep only strings; a saved ramp step is kept
 *  (0..3), anything else dropped (no ramp) */
export function normalizeProgress(p: Partial<GolfProgress> | null | undefined): GolfProgress {
  const q: Partial<GolfProgress> = p ?? {}, old = typeof q.stage !== 'number', s = Math.floor(count(q.stage));
  const out: GolfProgress = {
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
  if (!old && typeof q.ramp === 'number' && Number.isFinite(q.ramp)) out.ramp = Math.min(3, Math.max(0, Math.floor(q.ramp))) as RampStep;
  const g = out.ramp !== undefined ? normalizeRangeGuide(q.guide) : null; if (g) out.guide = g; // T239: the guided build (a ramp's only)
  return out;
}

/** the course facts the unlocks read besides the saved progress (Engine.playerProgressFacts): the holes with a par, the seasons played (the
 *  tournaments and a range start's founding seasons) and whether the tour has invited the player; a range start's range (T132: its ramp reads
 *  the upgrades bought, the season's takings, whether the card was opened and a prop placed) */
export interface CourseProgress { holes: number; seasons: number; invited: boolean; range?: Omit<RampFacts, 'reached' | 'fresh' | 'cardSeen'> }

/** the id GolfProgress.seen keeps once the range card has been opened (the ramp's first hint moves on) */
export const RANGE_CARD_SEEN = 'range-card';

/** the facts the unlocks read: the saved progress and the course (a range start's ramp: its saved step, or 3 for a save from before T132) */
export function progressFacts(p: GolfProgress, c: CourseProgress): PlayerProgressFacts {
  const f: PlayerProgressFacts = {
    advancedMode: p.advanced, playableHoles: Math.max(0, Math.floor(c.holes)), seasonsDone: Math.max(0, Math.floor(c.seasons)), invited: c.invited,
    elapsedSeconds: p.playS, stageReached: p.stage, seen: p.seen,
    roadsBuilt: p.roads, carParksBuilt: p.parks, eventStructuresPlaced: p.structures, dismissedHints: p.dismissed,
  };
  if (c.range) f.ramp = { ...c.range, reached: p.ramp ?? 3, fresh: p.ramp !== undefined, cardSeen: p.seen.includes(RANGE_CARD_SEEN) };
  // T239: the guided build's step while it runs (the unlocks follow it)
  const gs = c.range ? rangeGuideCurrent(p.guide) : undefined; if (gs !== undefined) f.guideStep = gs;
  return f;
}

/** keeps the saved progress in step with the facts (the engine calls it a few times a second): the stage reached rises to the course's (it never
 *  falls), a range start's ramp step to the range's (T132), and the tool in hand, when it is open, counts as opened with its rail group, so their
 *  NEW badges go. True when anything changed (the caller saves) */
export function advanceProgress(p: GolfProgress, f: PlayerProgressFacts, tool: string | null): boolean {
  let changed = false;
  const stage = resolveOnboardingStage(f);
  if (stage > p.stage) { p.stage = stage; changed = true; }
  if (p.ramp !== undefined && f.ramp) { const r = rampEarned(f); if (r > p.ramp) { p.ramp = r; changed = true; } }
  const t = tool as UiToolId, ts = tool ? TOOL_STAGE[t] : undefined;
  if (tool && ts !== undefined && (f.advancedMode || (ts <= p.stage && !rampLock(f, t)))) {
    const badged = (id: string) => NEW_BADGE_IDS.includes(id) || (!!f.ramp?.fresh && RAMP_TOOL_STEP[id as UiToolId] !== undefined);
    for (const id of [tool, TOOL_GROUP[t]!]) if (badged(id) && !p.seen.includes(id)) { p.seen.push(id); changed = true; }
  }
  return changed;
}
