// Progressive-exposure UI rules & first-run hints (UIX revamp T032, Owner choice 4B).
// Unlocks tools step-by-step during the player's first 10 minutes of Year 1 actions, with a persistent
// "Show all tools (Advanced)" toggle that opens every tool and fine control immediately.
// Pure TypeScript, no DOM globals, deterministic.

/** top-level rail tool group ids matching GROUPS in src/App.tsx */
export type RailGroupId = 'select' | 'roads' | 'paint' | 'course' | 'junction' | 'bulldoze' | 'transport' | 'business';

/** individual tool ids matching Tool in src/game/types.ts */
export type UiToolId = 'select' | 'road' | 'lane' | 'downgrade' | 'paint' | 'course' | 'junction' | 'bulldoze' | 'bus' | 'park' | 'toll' | 'business';

/** top-bar golf chip ids in src/App.tsx */
export type GolfChipId = 'courseStats' | 'land' | 'holes' | 'event' | 'skipTournament' | 'grass';

/** course builder brush surface kinds matching BrushKind in src/game/paint.ts */
export type CourseBrushId = 'tee' | 'fairway' | 'green' | 'bunker' | 'water' | 'rough' | 'path';

/** fine controls that live one level down unless Advanced mode is enabled */
export type FineControlId = 'snapToggle' | 'pieceAngle' | 'pieceScale' | 'heightBrush' | 'surfaceTone' | 'customStyle';

/** progressive onboarding stage during Year 1 (Owner choice 4B) */
export type OnboardingStage = 1 | 2 | 3;

/** player progress facts used to evaluate progressive tool visibility in Year 1 */
export interface PlayerProgressFacts {
  /** whether the player toggled "Show all tools (Advanced)" on */
  advancedMode: boolean;
  /** current game year (1 = first year; Year 2+ unlocks all stages automatically) */
  year: number;
  /** elapsed real or sim play time in seconds in the current game (600 s = 10 minutes) */
  elapsedSeconds: number;
  /** number of playable golf holes completed on the course */
  playableHoles: number;
  /** number of road segments built by the player */
  roadsBuilt: number;
  /** number of car parks built by the player */
  carParksBuilt: number;
  /** number of tournament entrance gates or event structures placed */
  eventStructuresPlaced: number;
  /** hint ids already dismissed by the player */
  dismissedHints?: readonly string[];
}

/** a one-line contextual first-run hint banner */
export interface FirstRunHint {
  id: string;
  stage: OnboardingStage;
  title: string;
  body: string;
  /** tool or button highlighted by the hint */
  targetTool: UiToolId | GolfChipId;
}

/** full computed visibility state for the UI rail, top bar, course palette, and fine controls */
export interface ProgressiveUiState {
  stage: OnboardingStage;
  advancedMode: boolean;
  visibleGroups: RailGroupId[];
  visibleTools: UiToolId[];
  visibleGolfChips: GolfChipId[];
  visibleCourseBrushes: CourseBrushId[];
  visibleFineControls: FineControlId[];
  /** human-readable unlock summary when a new stage was just reached */
  stageLabel: string;
  /** active contextual hint for the player's current step (null when none or all dismissed) */
  activeHint: FirstRunHint | null;
}

/** elapsed time threshold (10 minutes = 600 seconds) that unlocks Stage 3 automatically in Year 1 */
export const STAGE_3_TIME_SEC = 600;

const STAGE_1_GROUPS: readonly RailGroupId[] = ['select', 'roads', 'course', 'transport'];
const STAGE_2_GROUPS: readonly RailGroupId[] = ['select', 'roads', 'course', 'paint', 'bulldoze', 'transport'];
const STAGE_3_GROUPS: readonly RailGroupId[] = ['select', 'roads', 'paint', 'course', 'junction', 'bulldoze', 'transport', 'business'];

const STAGE_1_TOOLS: readonly UiToolId[] = ['select', 'road', 'course', 'park'];
const STAGE_2_TOOLS: readonly UiToolId[] = ['select', 'road', 'lane', 'downgrade', 'paint', 'course', 'bulldoze', 'park'];
const STAGE_3_TOOLS: readonly UiToolId[] = ['select', 'road', 'lane', 'downgrade', 'paint', 'course', 'junction', 'bulldoze', 'bus', 'park', 'toll', 'business'];

const STAGE_1_CHIPS: readonly GolfChipId[] = ['courseStats'];
const STAGE_2_CHIPS: readonly GolfChipId[] = ['courseStats', 'event', 'skipTournament'];
const STAGE_3_CHIPS: readonly GolfChipId[] = ['courseStats', 'land', 'holes', 'event', 'skipTournament', 'grass'];

const STAGE_1_BRUSHES: readonly CourseBrushId[] = ['tee', 'fairway', 'green'];
const STAGE_2_BRUSHES: readonly CourseBrushId[] = ['tee', 'fairway', 'green', 'bunker', 'water', 'rough', 'path'];

const ALL_FINE_CONTROLS: readonly FineControlId[] = ['snapToggle', 'pieceAngle', 'pieceScale', 'heightBrush', 'surfaceTone', 'customStyle'];

/** ordered first-run onboarding hints guiding a new player through Year 1 */
export const FIRST_RUN_HINTS: readonly FirstRunHint[] = [
  {
    id: 'hint-build-first-hole',
    stage: 1,
    title: 'Step 1: Lay out your first hole',
    body: 'Open Course (C) and click Tee, Fairway, and Green to snap a playable hole together.',
    targetTool: 'course',
  },
  {
    id: 'hint-connect-road-and-park',
    stage: 1,
    title: 'Step 2: Connect a road & car park',
    body: 'Use Roads (R) and Car park (P) so spectators can drive in from the town road.',
    targetTool: 'park',
  },
  {
    id: 'hint-place-gate-and-tents',
    stage: 2,
    title: 'Step 3: Add a tournament gate & hazards',
    body: 'New tools unlocked! Open Event at the top to place an entrance gate, or add bunkers and water on the course.',
    targetTool: 'event',
  },
  {
    id: 'hint-traffic-and-advanced',
    stage: 3,
    title: 'All tools unlocked',
    body: 'Junctions, Bus routes, Toll gates, and Land parcels are ready. Toggle Advanced any time for fine brush angles, heights, and snapping.',
    targetTool: 'junction',
  },
];

/** determines the onboarding stage (1..3) from the player's Year 1 actions and elapsed time (Owner choice 4B) */
export function resolveOnboardingStage(facts: PlayerProgressFacts): OnboardingStage {
  if (facts.advancedMode || facts.year > 1 || facts.elapsedSeconds >= STAGE_3_TIME_SEC) return 3;
  const hasStage2 = facts.playableHoles >= 1 || facts.roadsBuilt >= 1;
  if (!hasStage2) return 1;
  const hasStage3 =
    (facts.playableHoles >= 1 && facts.carParksBuilt >= 1 && facts.eventStructuresPlaced >= 1) ||
    facts.playableHoles >= 3 ||
    (facts.carParksBuilt >= 1 && facts.roadsBuilt >= 2);
  return hasStage3 ? 3 : 2;
}

/** selects the next undismissed first-run hint for the player's current progress */
export function nextFirstRunHint(facts: PlayerProgressFacts): FirstRunHint | null {
  const dismissed = new Set(facts.dismissedHints ?? []);
  if (facts.playableHoles < 1 && !dismissed.has('hint-build-first-hole')) {
    return FIRST_RUN_HINTS[0]!;
  }
  if (facts.carParksBuilt < 1 && !dismissed.has('hint-connect-road-and-park')) {
    return FIRST_RUN_HINTS[1]!;
  }
  const stage = resolveOnboardingStage(facts);
  if (stage >= 2 && facts.eventStructuresPlaced < 1 && !dismissed.has('hint-place-gate-and-tents')) {
    return FIRST_RUN_HINTS[2]!;
  }
  if (stage >= 3 && !dismissed.has('hint-traffic-and-advanced')) {
    return FIRST_RUN_HINTS[3]!;
  }
  return null;
}

/** computes the complete progressive-exposure UI state from player progress facts */
export function computeProgressiveUiState(facts: PlayerProgressFacts): ProgressiveUiState {
  const stage = resolveOnboardingStage(facts);
  const adv = Boolean(facts.advancedMode);
  const visibleGroups = (adv || stage === 3 ? STAGE_3_GROUPS : stage === 2 ? STAGE_2_GROUPS : STAGE_1_GROUPS).slice();
  const visibleTools = (adv || stage === 3 ? STAGE_3_TOOLS : stage === 2 ? STAGE_2_TOOLS : STAGE_1_TOOLS).slice();
  const visibleGolfChips = (adv || stage === 3 ? STAGE_3_CHIPS : stage === 2 ? STAGE_2_CHIPS : STAGE_1_CHIPS).slice();
  const visibleCourseBrushes = (adv || stage >= 2 ? STAGE_2_BRUSHES : STAGE_1_BRUSHES).slice();
  const visibleFineControls = adv ? ALL_FINE_CONTROLS.slice() : [];
  const stageLabel = adv
    ? 'Advanced Mode (All tools & fine controls)'
    : stage === 1
      ? 'Starter Tools (Hole 1 & Road Access)'
      : stage === 2
        ? 'Venue & Hazard Tools Unlocked'
        : 'Full Toolset Unlocked';
  return {
    stage,
    advancedMode: adv,
    visibleGroups,
    visibleTools,
    visibleGolfChips,
    visibleCourseBrushes,
    visibleFineControls,
    stageLabel,
    activeHint: nextFirstRunHint(facts),
  };
}

/** what the player did in the golf game (T033): the saved counters and the facts T032 reads */
export * from './progress';
