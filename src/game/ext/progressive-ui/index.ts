// Progressive-exposure UI rules & first-run hints (UIX revamp T032; unlocks from the course since plan P23 T117).
// Tools unlock from the course in three stages (docs/plans/P23-UX.md 4.2): a real hole with a par, then the tour's invitation, 3 holes or two
// seasons. Never from stroke counts, and no timer alone; a stuck player (no hole after one season or 20 minutes of play) is helped on to stage 2.
// Locked tools are listed with what unlocks them, so the rail can show them in place, dimmed; a tool unlocked past stage 1 carries a NEW badge
// until it is first opened (the seen ids are saved in golf.progress). Settings > "Show every tool now" opens every tool and fine control at once.
// Pure TypeScript, no DOM globals, deterministic.

/** top-level rail tool group ids matching GROUPS in src/App.tsx */
export type RailGroupId = 'select' | 'roads' | 'paint' | 'course' | 'junction' | 'bulldoze' | 'transport' | 'business';

/** individual tool ids matching Tool in src/game/types.ts, plus 'buildings': the Course tool's Buildings tab (the clubhouse), a rail item of its
 *  own from plan P23 P1-E */
export type UiToolId = 'select' | 'road' | 'lane' | 'downgrade' | 'paint' | 'course' | 'path' | 'buildings' | 'props' | 'junction' | 'bulldoze' | 'bus' | 'park' | 'toll' | 'business';

/** top-bar golf chip ids in src/App.tsx */
export type GolfChipId = 'courseStats' | 'land' | 'holes' | 'event' | 'skipTournament' | 'grass';

/** course builder brush surface kinds matching BrushKind in src/game/paint.ts */
export type CourseBrushId = 'tee' | 'fairway' | 'green' | 'bunker' | 'water' | 'rough' | 'path';

/** fine controls that live one level down unless "Show every tool now" is on */
export type FineControlId = 'snapToggle' | 'pieceAngle' | 'pieceScale' | 'heightBrush' | 'surfaceTone' | 'customStyle';

/** the unlock stage (P23 4.2): 1 your first hole, 2 founding the club, 3 the town */
export type OnboardingStage = 1 | 2 | 3;

/** what the unlocks read: the course (holes with a par, seasons, the invitation), the saved progress (the stage reached, the tools opened) and
 *  the counters the first-run hints read */
export interface PlayerProgressFacts {
  /** Settings > "Show every tool now" (saved as GolfProgress.advanced) */
  advancedMode: boolean;
  /** the course's holes with a par (a tee and a pin): built with New hole or made by hand */
  playableHoles: number;
  /** the seasons played: the tournaments held and a range start's founding seasons (Engine.seasonsDone) */
  seasonsDone: number;
  /** whether the tour has invited the player (a range start's golf.invited) */
  invited: boolean;
  /** real play seconds in this game (the stuck player's fallback reads STUCK_PLAY_SEC) */
  elapsedSeconds: number;
  /** the highest stage reached so far (saved; a stage never closes again; missing = 1) */
  stageReached?: OnboardingStage;
  /** the tool and rail group ids already opened (their NEW badges are gone) */
  seen?: readonly string[];
  /** number of road segments built by the player */
  roadsBuilt: number;
  /** number of car parks built by the player */
  carParksBuilt: number;
  /** number of tournament entrance gates or event structures placed */
  eventStructuresPlaced: number;
  /** hint ids already dismissed by the player */
  dismissedHints?: readonly string[];
  /** a range start's practice facilities (plan P24 Phase 2, T130: golf/practice.ts PracticeState); missing outside range starts. Their hints
   *  teach the brush before the first hole, and the Green and Bunker brushes are open from stage 1 to paint them */
  practice?: { putting: 'none' | 'small' | 'nobunker' | 'open'; chipping: 'none' | 'small' | 'nobunker' | 'open' };
  /** a range start's ramp from the range to the first hole (plan P24 Phase 4a, T132); missing outside range starts */
  ramp?: RampFacts;
}

/** a range start's ramp step (P24 Phase 4a): 0 the range card, 1 the practice area (after the first range upgrade), 2 Props (after the putting
 *  green opens), 3 New hole and the course (once the range takes RAMP_TAKINGS in a season, or the second season starts, or a hole exists) */
export type RampStep = 0 | 1 | 2 | 3;
/** what the ramp reads (Engine.playerProgressFacts, range starts only) */
export interface RampFacts {
  /** the step reached so far (saved as GolfProgress.ramp; it never falls); an old range save has none: 3, every tool open */
  reached: RampStep;
  /** the range upgrades bought, and the range's takings this season ($) */
  upgrades: number; seasonTakings: number;
  /** the range card has been opened once (the first hint then moves on to the first upgrade) */
  cardSeen: boolean;
  /** a Props tool prop stands near the range (its hint is done) */
  propsPlaced: boolean;
  /** a new game's ramp: its tools carry NEW badges as they open (an old save's do not: it had them all) */
  fresh: boolean;
}

/** a one-line contextual first-run hint banner */
export interface FirstRunHint {
  id: string;
  stage: OnboardingStage;
  title: string;
  body: string;
  /** tool or button highlighted by the hint */
  targetTool: UiToolId | GolfChipId;
  /** the hint bar offers Show me (Engine.showHint: the camera on the spot and the tool armed) */
  show?: boolean;
}

/** a tool, rail group or course path class that is not open yet: the stage it opens at and the tooltip line that says so */
export interface LockedItem<T extends string> { id: T; stage: OnboardingStage; why: string }

/** full computed visibility state for the UI rail, top bar, course palette, and fine controls */
export interface ProgressiveUiState {
  /** the stage reached (the course's; "Show every tool now" does not change it) */
  stage: OnboardingStage;
  advancedMode: boolean;
  /** the rail groups open, and the ones locked (shown in place, dimmed, with their why); together every golf rail group, in the rail's order */
  visibleGroups: RailGroupId[];
  lockedGroups: LockedItem<RailGroupId>[];
  /** the tools open and locked; together every golf tool */
  visibleTools: UiToolId[];
  lockedTools: LockedItem<UiToolId>[];
  /** the open rail groups and tools that carry a NEW badge: unlocked past stage 1 and not opened yet (none while every tool is shown) */
  newGroups: RailGroupId[];
  newTools: UiToolId[];
  visibleGolfChips: GolfChipId[];
  visibleCourseBrushes: CourseBrushId[];
  /** the Holes panel's Shape by hand and the rest of its options (stage 2); false = New hole only */
  shapeByHand: boolean;
  /** the course paths and drives held back by the stage (the cement slab path until stage 2); the tour levels lock theirs apart (courseTierNeeded) */
  lockedCourseClasses: LockedItem<string>[];
  visibleFineControls: FineControlId[];
  /** the stage's name, or the Settings toggle's */
  stageLabel: string;
  /** active contextual hint for the player's current step (null when none or all dismissed) */
  activeHint: FirstRunHint | null;
  /** a range start's ramp step in force (T132; null outside range starts, and with "Show every tool now": every step open) */
  ramp: RampStep | null;
  /** why New hole is not open yet (a range start before ramp step 3: the Holes panel shows the button locked with it), or null */
  newHoleLock: string | null;
}

/** the stuck player's fallback (P23 4.2): with no hole after 20 minutes of play (or one season), stage 2 opens and the hint offers New hole */
export const STUCK_PLAY_SEC = 1200;

/** the stage each golf rail group opens at, in the rail's order (P23 4.2; golf games have no Business tool, so it is never listed) */
export const GROUP_STAGE: Readonly<Partial<Record<RailGroupId, OnboardingStage>>> = Object.freeze({
  select: 1, course: 1, roads: 3, junction: 3, transport: 3, paint: 2, bulldoze: 1,
});
/** the stage each golf tool opens at: Holes, Paths and Buildings from the start, Paint with the first hole, the town's tools at stage 3 */
export const TOOL_STAGE: Readonly<Partial<Record<UiToolId, OnboardingStage>>> = Object.freeze({
  select: 1, course: 1, path: 1, buildings: 1, props: 1, road: 3, lane: 3, downgrade: 3, junction: 3, bus: 3, park: 3, toll: 3, paint: 2, bulldoze: 1,
});
/** the rail group each golf tool sits in */
export const TOOL_GROUP: Readonly<Partial<Record<UiToolId, RailGroupId>>> = Object.freeze({
  select: 'select', course: 'course', path: 'course', buildings: 'course', props: 'course', road: 'roads', lane: 'roads', downgrade: 'roads', junction: 'junction',
  bus: 'transport', park: 'transport', toll: 'transport', paint: 'paint', bulldoze: 'bulldoze',
});
/** the stage each top-bar chip shows at: the course stats from the start; skip and the grass with the first hole; the pins and tees, the Event
 *  catalogue and Land with the town (as before T117, so the top bar does not grow at stage 2) */
export const CHIP_STAGE: Readonly<Record<GolfChipId, OnboardingStage>> = Object.freeze({ courseStats: 1, skipTournament: 2, grass: 2, holes: 3, event: 3, land: 3 });
/** the stage each course brush opens at: Shape by hand's six surfaces at stage 2 (stage 1 is New hole only); the painted cart path, which the
 *  Paths tool replaced, at stage 3 */
export const BRUSH_STAGE: Readonly<Record<CourseBrushId, OnboardingStage>> = Object.freeze({ fairway: 2, green: 2, tee: 2, rough: 2, bunker: 2, water: 2, path: 3 });
/** the course path classes the stage holds back: the walking and dirt paths and the gravel drive are open from the start, the cement slabs with
 *  the first hole (the paved ones and the avenues wait for their tour level: network.ts courseTierNeeded) */
export const COURSE_CLASS_STAGE: Readonly<Record<string, OnboardingStage>> = Object.freeze({ 'cart-slab': 2 });

/** what unlocks a stage, as a locked tool's tooltip says it */
export const STAGE_WHY: Readonly<Record<OnboardingStage, string>> = Object.freeze({
  1: '',
  2: 'Unlocks with your first hole',
  3: "Unlocks with your third hole or the tour's invitation",
});
/** each stage's name (P23 4.2) */
export const STAGE_NAME: Readonly<Record<OnboardingStage, string>> = Object.freeze({ 1: 'Your first hole', 2: 'Founding the club', 3: 'The town' });

const ALL_FINE_CONTROLS: readonly FineControlId[] = ['snapToggle', 'pieceAngle', 'pieceScale', 'heightBrush', 'surfaceTone', 'customStyle'];

/** every id that can carry a NEW badge: the tools and rail groups that open after stage 1 (an old save counts them all as seen) */
export const NEW_BADGE_IDS: readonly string[] = Object.freeze([...new Set([
  ...Object.entries(GROUP_STAGE).filter(([, s]) => s! > 1).map(([id]) => id),
  ...Object.entries(TOOL_STAGE).filter(([, s]) => s! > 1).map(([id]) => id),
])]);

/** ordered first-run hints (the bottom bar's), each pointing at a tool its stage has open */
export const FIRST_RUN_HINTS: readonly FirstRunHint[] = [
  {
    id: 'hint-build-first-hole',
    stage: 1,
    title: 'Step 1: Build your first hole',
    body: 'Open Holes (C), press New hole, click a tee, then a green, and Build.',
    targetTool: 'course',
  },
  {
    id: 'hint-connect-road-and-park',
    stage: 3,
    title: 'Roads and car parks are open',
    body: 'Use Roads (R) and Car park (P) so spectators can drive in from the town road.',
    targetTool: 'park',
  },
  {
    id: 'hint-place-gate-and-tents',
    stage: 3,
    title: 'Add a tournament gate',
    body: 'Open Event at the top to place an entrance gate and tents for the crowd.',
    targetTool: 'event',
  },
  {
    id: 'hint-traffic-and-advanced',
    stage: 3,
    title: 'The town tools are open',
    body: 'Roads, Junctions and Transport are ready. Settings > Show every tool now adds fine brush angles, heights and snapping.',
    targetTool: 'junction',
  },
];

/** a range start's teaching ramp (plan P24 Phase 2, T130): paint the putting green, then the chipping green and its bunker, in the practice area
 *  beside the range (the hint bar's Show me pans there and picks the brush) */
export const PRACTICE_HINTS: readonly FirstRunHint[] = [
  {
    id: 'hint-practice-putting',
    stage: 1,
    title: 'Paint a putting green',
    body: 'Drag the Green brush in the Practice area beside the car park: 300 m² with its fringe opens it (+10% visitors, $2 a golfer).',
    targetTool: 'course',
    show: true,
  },
  {
    id: 'hint-practice-chipping',
    stage: 1,
    title: 'Now a chipping green and a bunker',
    body: 'Paint a second, smaller green in the Practice area (200 m²), then a bunker beside it with the Bunker brush.',
    targetTool: 'course',
    show: true,
  },
];

/** the stuck player's hint (P23 4.2: no hole after one season or 20 minutes of play): New hole again, even when Step 1 was dismissed */
export const STUCK_HINT: FirstRunHint = Object.freeze({
  id: 'hint-stuck-new-hole',
  stage: 2,
  title: 'Need a hand? Start with New hole',
  body: 'Open Holes (C), press New hole, click a tee, then a green: the whole hole is planned for you. Shape by hand and Paint are open too.',
  targetTool: 'course',
});

/** whether the player is stuck (P23 4.2): no hole with a par after one season or STUCK_PLAY_SEC of play. Never in a range start (T132): the
 *  range is the job until New hole opens, and the ramp's own hint then offers the first hole */
export function isStuck(f: PlayerProgressFacts): boolean {
  return !f.ramp && f.playableHoles < 1 && (f.seasonsDone >= 1 || f.elapsedSeconds >= STUCK_PLAY_SEC);
}

// ---------------------------------------------------------------- a range start's ramp (plan P24 Phase 4a, T132)

/** the range's takings in one season that open New hole ($) */
export const RAMP_TAKINGS = 20000;
/** the ramp step each tool opens at in a range start (the rest follow the stages): Holes and Paths with the first upgrade (to paint the
 *  practice greens), Props once the putting green opens, Buildings (the clubhouse) with New hole */
export const RAMP_TOOL_STEP: Readonly<Partial<Record<UiToolId, RampStep>>> = Object.freeze({ course: 1, path: 1, props: 2, buildings: 3 });
/** what opens each ramp step, as a locked tool's tooltip says it */
export const RAMP_WHY: Readonly<Record<RampStep, string>> = Object.freeze({
  0: '',
  1: 'Unlocks with your first range upgrade',
  2: 'Unlocks when your putting green opens',
  3: 'Unlocks when the range takes $20,000 in a season, or in season 2',
});
/** the toast as each ramp step opens */
export const RAMP_TOAST: Readonly<Partial<Record<RampStep, string>>> = Object.freeze({
  1: 'The Practice area is open: paint a putting green beside the car park (Holes)',
  2: 'Props are open (Z): dress the range to draw more golfers',
  3: 'New hole is open: build your first hole, a par-3',
});
/** the length the first hole's plan suggests in a range start (m): a par-3 (the wizard's short first hole) */
export const FIRST_PAR3_M = 150;

/** the step the range has earned now, without the step reached before: 3 with a hole, the second season or RAMP_TAKINGS this season; 2 with
 *  the putting green open; 1 with a range upgrade; else 0 (outside range starts: 3) */
export function rampEarned(f: PlayerProgressFacts): RampStep {
  const r = f.ramp; if (!r) return 3;
  if (f.playableHoles >= 1 || f.seasonsDone >= 1 || r.seasonTakings >= RAMP_TAKINGS) return 3;
  if (f.practice?.putting === 'open') return 2;
  if (r.upgrades >= 1) return 1;
  return 0;
}
/** the ramp step in force: the earned one, never below the step reached (null outside range starts) */
export function rampStep(f: PlayerProgressFacts): RampStep | null {
  return f.ramp ? (Math.max(f.ramp.reached, rampEarned(f)) as RampStep) : null;
}
/** why tool t is held back by the ramp, or null (open, not a range start, or every tool shown) */
export function rampLock(f: PlayerProgressFacts, t: UiToolId): string | null {
  const s = rampStep(f), need = RAMP_TOOL_STEP[t];
  return s === null || f.advancedMode || need === undefined || s >= need ? null : RAMP_WHY[need];
}

/** the ramp's hints (the hint bar's Show me does what each says: Engine.showHint) */
export const RANGE_HINTS: Readonly<Record<'open' | 'upgrade' | 'props' | 'wait' | 'firstHole', FirstRunHint>> = Object.freeze({
  open: { id: 'hint-range-open', stage: 1, title: 'Your driving range is open', body: 'Golfers are already driving in. Click the range (or the Range chip) to open its card: the takings, the bucket price and the upgrades.', targetTool: 'select', show: true },
  upgrade: { id: 'hint-range-upgrade', stage: 1, title: 'Buy your first upgrade', body: 'More bays, target greens or a ball dispenser on the range card: the first one opens the Practice area beside the car park.', targetTool: 'select', show: true },
  props: { id: 'hint-range-props', stage: 1, title: 'Props are open (Z)', body: 'Pot plants, a fountain, a statue: props within 15 tiles of the shop or the mats draw more golfers. Each more of a kind counts less.', targetTool: 'props', show: true },
  wait: { id: 'hint-range-wait', stage: 1, title: 'Next: your first hole', body: 'New hole opens when the range takes $20,000 in a season, or in season 2. Grow the range meanwhile.', targetTool: 'select' },
  firstHole: { id: 'hint-range-first-hole', stage: 1, title: 'New hole is open: start with a par-3', body: `Open Holes (C) and press New hole: click a tee and point the way, and a ${FIRST_PAR3_M} m par-3 is planned for you. Build when it looks right.`, targetTool: 'course', show: true },
});
/** a whole number of dollars as the hints say it: $20,000 */
const dollars = (n: number) => '$' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
/** the ramp's hint for the facts until the first hole (null: none left, or every one dismissed) */
function rampHint(f: PlayerProgressFacts, dismissed: ReadonlySet<string>): FirstRunHint | null {
  const s = rampStep(f)!, r = f.ramp!, H = RANGE_HINTS, [pp, pc] = PRACTICE_HINTS, pr = f.practice;
  const pick = (...hs: (FirstRunHint | false | undefined)[]) => hs.find((h): h is FirstRunHint => !!h && !dismissed.has(h.id)) ?? null;
  const chip = pr?.putting === 'open' && pr.chipping !== 'open' && pc;
  if (s === 0) return pick(!r.cardSeen && H.open, H.upgrade);
  if (s === 1) return pick(pr?.putting !== 'open' && pp);
  if (s === 2) {
    const h = pick(!r.propsPlaced && H.props, chip, H.wait);
    return h?.id === H.wait.id ? { ...h, body: `New hole opens when the range takes ${dollars(RAMP_TAKINGS)} in a season (${dollars(r.seasonTakings)} so far), or in season 2. Grow the range meanwhile.` } : h;
  }
  return pick(H.firstHole, pr && pr.putting !== 'open' && pp, chip);
}

/** the stage the course has earned now (P23 4.2's table), without the stage reached before: 3 with the tour's invitation, 3 holes or two seasons
 *  (founding ones count); 2 with a hole with a par, or for a stuck player; else 1 */
export function courseStage(f: PlayerProgressFacts): OnboardingStage {
  if (f.invited || f.playableHoles >= 3 || f.seasonsDone >= 2) return 3;
  if (f.playableHoles >= 1 || isStuck(f)) return 2;
  return 1;
}

/** the unlock stage (1..3): the course's, never below the stage reached before (a stage never closes again) */
export function resolveOnboardingStage(f: PlayerProgressFacts): OnboardingStage {
  return Math.max(f.stageReached ?? 1, courseStage(f)) as OnboardingStage;
}

/** selects the next undismissed first-run hint: the stuck player's New hole, Step 1 until the first hole, then (at stage 3) the town's tools */
export function nextFirstRunHint(f: PlayerProgressFacts): FirstRunHint | null {
  const dismissed = new Set(f.dismissedHints ?? []), stage = resolveOnboardingStage(f), [h1, h2, h3, h4] = FIRST_RUN_HINTS;
  if (isStuck(f) && !dismissed.has(STUCK_HINT.id)) return STUCK_HINT;
  // a range start (T132): the ramp's hints until the first hole (never Step 1's: the range is the job), then the stages' as everywhere
  if (f.ramp && f.playableHoles < 1) return rampHint(f, dismissed);
  // a range start's practice facilities first (T130): the putting green, then the chipping green and bunker
  const [pp, pc] = PRACTICE_HINTS;
  if (!f.ramp && f.practice && f.playableHoles < 1) {
    if (f.practice.putting !== 'open' && !dismissed.has(pp!.id)) return pp!;
    if (f.practice.putting === 'open' && f.practice.chipping !== 'open' && !dismissed.has(pc!.id)) return pc!;
  }
  if (f.playableHoles < 1 && !dismissed.has(h1!.id)) return h1!;
  if (stage < 3) return null;
  if (f.carParksBuilt < 1 && !dismissed.has(h2!.id)) return h2!;
  if (f.eventStructuresPlaced < 1 && !dismissed.has(h3!.id)) return h3!;
  if (!dismissed.has(h4!.id)) return h4!;
  return null;
}

/** the ids of a stage table open at stage s (every one with "Show every tool now"), in the table's order */
function openAt<T extends string>(table: Readonly<Partial<Record<T, OnboardingStage>>>, s: OnboardingStage, all: boolean): T[] {
  return (Object.keys(table) as T[]).filter(id => all || table[id]! <= s);
}
/** the ids of a stage table still locked at stage s, with their stage and why (none with "Show every tool now") */
function lockedAt<T extends string>(table: Readonly<Partial<Record<T, OnboardingStage>>>, s: OnboardingStage, all: boolean): LockedItem<T>[] {
  return all ? [] : (Object.keys(table) as T[]).filter(id => table[id]! > s).map(id => ({ id, stage: table[id]!, why: STAGE_WHY[table[id]!] }));
}

/** computes the complete progressive-exposure UI state from player progress facts */
export function computeProgressiveUiState(f: PlayerProgressFacts): ProgressiveUiState {
  const stage = resolveOnboardingStage(f), adv = Boolean(f.advancedMode), seen = new Set(f.seen ?? []), ramp = adv ? null : rampStep(f);
  const visibleGroups = openAt(GROUP_STAGE, stage, adv);
  // a range start's ramp (T132) holds back Holes, Paths, Props and Buildings until their step: in place, with its why, besides the stages
  const stageTools = openAt(TOOL_STAGE, stage, adv), visibleTools = stageTools.filter(id => !rampLock(f, id));
  const lockedTools: LockedItem<UiToolId>[] = [...stageTools.filter(id => rampLock(f, id)).map(id => ({ id, stage: 1 as OnboardingStage, why: rampLock(f, id)! })), ...lockedAt(TOOL_STAGE, stage, adv)];
  // a new range game's ramp tools carry NEW as they open (Holes opens with the first upgrade)
  const rampNew = (id: string) => !!f.ramp?.fresh && RAMP_TOOL_STEP[id as UiToolId] !== undefined;
  const isNew = (id: string, s: OnboardingStage | undefined) => !adv && ((s ?? 1) > 1 || rampNew(id)) && !seen.has(id);
  return {
    stage,
    advancedMode: adv,
    visibleGroups,
    lockedGroups: lockedAt(GROUP_STAGE, stage, adv),
    visibleTools,
    lockedTools,
    newGroups: visibleGroups.filter(id => !adv && (GROUP_STAGE[id] ?? 1) > 1 && !seen.has(id)),
    newTools: visibleTools.filter(id => isNew(id, TOOL_STAGE[id])),
    visibleGolfChips: openAt(CHIP_STAGE, stage, adv),
    // a range start paints its practice greens and bunker by hand from stage 1 (T130)
    visibleCourseBrushes: f.practice ? [...new Set<CourseBrushId>([...openAt(BRUSH_STAGE, stage, adv), 'green', 'bunker'])] : openAt(BRUSH_STAGE, stage, adv),
    shapeByHand: adv || stage >= 2 || !!f.practice,
    lockedCourseClasses: lockedAt(COURSE_CLASS_STAGE, stage, adv),
    visibleFineControls: adv ? ALL_FINE_CONTROLS.slice() : [],
    stageLabel: adv ? 'Every tool shown (Settings)' : `Stage ${stage}: ${STAGE_NAME[stage]}`,
    activeHint: nextFirstRunHint(f),
    ramp,
    newHoleLock: ramp !== null && ramp < 3 ? RAMP_WHY[3] : null,
  };
}

/** what the player did in the golf game (T033): the saved counters and the facts T032 reads */
export * from './progress';

/** which Transport panel controls show (T039) */
export * from './transport';

/** the guided Year 1 (P06/T045) */
export * from './guide';
