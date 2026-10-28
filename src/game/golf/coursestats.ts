// Course stats panel model (docs/GOLF-PLAN.md sections 4.2, 4.3, 5.1 and 8.2): turns holes.ts derivation, costs.ts maintenance, and tour.ts missingFor into panel rows and quality hints. Pure TS, no DOM.
import { courseMonthlyUpkeep, growInShare } from './costs';
import { evaluateCourseHeightQuality, type CourseHeightField } from '../ext/course-height';
import { courseStats, deriveHoles, parFromLength, type CourseStats, type Hole } from './holes';
import { courseTerrain } from './hole-terrain';
import { missingFor, tierInfo, type CourseFacts, type Need } from './tour';
import type { CourseLayout, TeeKind } from './types';
import { TEE_KINDS, TEE_SET, teeSetsTerm } from './teesets';

/** quality lost per hole whose green is over 6% steep (T038), and the most it can cost */
export const STEEP_GREEN_PENALTY = 4, STEEP_GREEN_CAP = 12;
/** the steepest fairway slope along a hole's line that is still fair (m per m), the quality lost per hole over it, and the cap */
export const FAIRWAY_MAX_SLOPE = 0.12, STEEP_FAIRWAY_PENALTY = 3, STEEP_FAIRWAY_CAP = 9;
/** a hole is "shaped" when it climbs or falls this much tee to pin (m), or its relief along the line reaches this (m) */
export const SHAPED_RISE_M = 1, SHAPED_RELIEF_M = 1.5;
/** the plays-like line shows when the hole climbs or falls at least this much (m) */
export const PLAYS_LIKE_SHOW_M = 0.5;

/** metres to yards conversion factor */
export const YARDS_PER_M = 1.0936133;

/** human-readable label for each tour requirement or course shortfall returned by missingFor */
export const NEED_LABEL: Record<Need | 'holes' | 'length', string> = {
  holes: 'Required hole count',
  length: 'Minimum championship length',
  carpark: 'Car park',
  gate: 'Entrance gate',
  foodTent: 'Food tent',
  toilets: 'Toilet blocks',
  grandstand18: 'Grandstand at the 18th',
  leaderboard: 'Main leaderboard',
  merchTent: 'Merchandise tent',
  parkRide: 'Park-and-ride shuttle',
  range: 'Practice range',
  tvTowers: 'TV camera towers',
  broadcast: 'Broadcast compound',
  hospitality: 'Hospitality chalets',
  media: 'Media centre',
  parkRide2: 'Second park-and-ride lot',
  hotelRooms: 'Town hotel rooms',
  grandstands: 'Major grandstands',
  merchPavilion: 'Merchandise pavilion',
  hospitalityVillage: 'Corporate hospitality village',
  interchange: 'Highway interchange access',
  coachTerminal: 'Coach terminal',
};

/** one hole's row in the course stats panel */
export interface HolePanelRow {
  hole: number;
  par: 3 | 4 | 5;
  lengthM: number;
  lengthYards: number;
  memberLengthM: number;
  memberLengthYards: number;
  /** the plays-like length (m) and the tee-to-pin rise (m, > 0 uphill); 0 rise without a height field */
  playsLikeM: number;
  riseM: number;
  playable: boolean;
  warnings: string[];
  /** T254: each tee set's length (m), back (blue) to front (red): the scorecard's columns */
  sets: { kind: TeeKind; lengthM: number }[];
}

/** full view model for the course stats panel */
export interface CourseStatsPanel {
  rows: HolePanelRow[];
  totals: CourseStats & { lengthYards: number; memberLengthYards: number };
  warningCount: number;
  monthlyUpkeep: number;
  qualityScore: number;
  qualityHints: string[];
  /** the course height's quality bonus (0..5 points, already counted in qualityScore; 0 without a height field) */
  heightBonus: number;
  /** the holes whose putting green is over 6% steep (each row carries the warning; empty without a height field) */
  steepGreenHoles: number[];
  /** the slope adjustments to the quality score (T038): steep greens, steep fairways (both ≤ 0), the character bonus (≥ 0) */
  slopeQuality: { steepGreens: number; steepFairways: number; shaped: number };
  /** T254: the "for every golfer" term (0..3 quality points, already counted in qualityScore): more tee sets a hole, a little more appeal */
  everyGolfer: number;
  tier: number;
  nextTier: number | null;
  missingForCurrent: (Need | 'holes' | 'length')[];
  missingForNext: (Need | 'holes' | 'length')[];
  missingLabels: string[];
}

/** convert metres to rounded yards */
export function metresToYards(m: number): number { return Math.round(m * YARDS_PER_M); }

/** convert a derived Hole from holes.ts into a display row for the course stats panel */
export function toHoleRow(h: Hole): HolePanelRow {
  return {
    hole: h.n,
    par: h.par,
    lengthM: h.lengthM,
    lengthYards: metresToYards(h.lengthM),
    memberLengthM: h.memberLengthM,
    memberLengthYards: metresToYards(h.memberLengthM),
    playsLikeM: h.lengthM,
    riseM: 0,
    playable: h.line.length >= 2,
    warnings: h.warnings.slice(),
    sets: (h.sets ?? []).map(s => ({ kind: s.kind, lengthM: s.lengthM })),
  };
}

/** evaluate course quality (0..100) and actionable design/conditioning hints (GOLF-PLAN 4.2 and 4.3) */
export function courseQuality(layout: CourseLayout, holes: readonly Hole[], stats: CourseStats, currentMonth = 7): { score: number; hints: string[] } {
 const hints: string[] = [];
 let score = 100;
 let growPenalty = 0;
 const growingSurfaces = new Set<string>();
 for (const a of layout.areas) {
 if (a.plantKind === 'seed' && a.plantedMonth !== undefined) {
 const elapsed = Math.max(0, currentMonth - a.plantedMonth);
 const share = growInShare(a.surface, 'seed', elapsed);
 if (share < 1) {
 growPenalty += (1 - share) * 6;
 growingSurfaces.add(a.surface);
 }
 }
 }
 if (growPenalty > 0) {
 score -= Math.min(25, Math.round(growPenalty));
 hints.push(`Allow seeded surfaces to grow in (${Array.from(growingSurfaces).join(', ')})`);
 }
  if (stats.holes < 9) {
    score -= (9 - stats.holes) * 8;
    hints.push(`Complete at least 9 playable holes (currently ${stats.holes})`);
  }
  const warnHoles = holes.filter(h => h.warnings.length > 0);
  if (warnHoles.length > 0) {
    const totalW = warnHoles.reduce((s, h) => s + h.warnings.length, 0);
    score -= Math.min(40, totalW * 8);
    hints.push(`Resolve ${totalW} hole warning${totalW === 1 ? '' : 's'} (holes ${warnHoles.map(h => h.n).join(', ')})`);
  }
  // target par mix: 2/5/2 per 9 holes (4/10/4 for 18 holes, GOLF-PLAN 4.3)
  if (stats.holes >= 9) {
    const scale = stats.holes / 9;
    const d3 = Math.abs(stats.mix[3] - 2 * scale), d4 = Math.abs(stats.mix[4] - 5 * scale), d5 = Math.abs(stats.mix[5] - 2 * scale);
    const mixDiff = d3 + d4 + d5;
    if (mixDiff > 2) {
      score -= Math.min(15, Math.round(mixDiff * 3));
      hints.push('Balance par mix closer to 2 par 3s, 5 par 4s, and 2 par 5s per nine');
    }
  }
  const bunkers = layout.areas.filter(a => a.surface === 'bunker').length;
  if (bunkers < 4) {
    score -= (4 - bunkers) * 3;
    hints.push(`Add greenside or fairway bunkers (${bunkers}/4 minimum)`);
  }
  const hasWater = layout.areas.some(a => a.surface === 'water');
  if (!hasWater) {
    score -= 5;
    hints.push('Add a pond or water hazard for course beauty and shot variety');
  }
  return { score: Math.max(0, Math.min(100, Math.round(score))), hints };
}

/** build the complete CourseStatsPanel from a CourseLayout, current tournament tier (1..5), and present venue Needs; height (optional) adds the course height's quality bonus and steep-green warnings */
export function buildCourseStatsPanel(layout: CourseLayout, tier = 1, have: ReadonlySet<Need> = new Set(), currentMonth = 7, height?: { field: CourseHeightField; areas: readonly { hole?: number; surface: string; pts: readonly number[] }[] }): CourseStatsPanel {
 const holes = deriveHoles(layout.areas, layout.tees, layout.pins, layout.aims);
 const rows = holes.map(toHoleRow);
 const hq = height ? evaluateCourseHeightQuality(height.field, height.areas) : null;
 if (hq) for (const r of rows) if (hq.steepGreenHoles.includes(r.hole)) r.warnings.push('Green too steep (over 6%)');
 const baseTotals = courseStats(holes);
 const totals = {
 ...baseTotals,
 lengthYards: metresToYards(baseTotals.lengthM),
 memberLengthYards: metresToYards(baseTotals.memberLengthM),
 };
 const monthlyUpkeep = Math.round(courseMonthlyUpkeep(layout.areas));
 const quality = courseQuality(layout, holes, baseTotals, currentMonth);
 const qualityHints = quality.hints;
 let qualityScore = quality.score;
 if (hq) qualityHints.push(...hq.hints);
 // slope in play (T038): steep greens (from hq), steep fairways, shaped holes and the plays-like lengths come from the height field
 const steepGreenCost = hq ? Math.min(STEEP_GREEN_CAP, hq.steepGreenHoles.length * STEEP_GREEN_PENALTY) : 0;
 const slopeQuality = { steepGreens: steepGreenCost > 0 ? -steepGreenCost : 0, steepFairways: 0, shaped: 0 };
 if (height) {
  const terr = courseTerrain(height.field, holes);
  const steepFair: number[] = [];
  let shapedN = 0;
  for (const r of rows) {
   const t = terr.find(x => x.hole === r.hole);
   if (!t) continue;
   r.playsLikeM = Math.round(t.playsLikeM);
   r.riseM = Math.round(t.riseM * 10) / 10 + 0;
   if (t.fairwayMaxSlope > FAIRWAY_MAX_SLOPE) { steepFair.push(r.hole); r.warnings.push('Fairway slope over 12% (smooth it)'); }
   if (Math.abs(t.riseM) >= SHAPED_RISE_M || t.reliefM >= SHAPED_RELIEF_M) shapedN++;
   if (Math.abs(t.riseM) >= PLAYS_LIKE_SHOW_M && parFromLength(t.playsLikeM) !== r.par) qualityHints.push(`Hole ${r.hole} plays like a par ${parFromLength(t.playsLikeM)} (${t.riseM > 0 ? 'uphill' : 'downhill'})`);
  }
  const fairCost = Math.min(STEEP_FAIRWAY_CAP, steepFair.length * STEEP_FAIRWAY_PENALTY);
  slopeQuality.steepFairways = fairCost > 0 ? -fairCost : 0;
  slopeQuality.shaped = shapedN >= 6 ? 2 : shapedN >= 3 ? 1 : 0;
  if (steepFair.length > 0) qualityHints.push(`Smooth the steep fairway${steepFair.length === 1 ? '' : 's'} on hole${steepFair.length === 1 ? '' : 's'} ${steepFair.join(', ')}`);
 }
 const warningCount = rows.reduce((s, r) => s + r.warnings.length, 0);
 // T254: for every golfer: the tee sets a hole has (blue, white, yellow, red) lift the appeal a little
 const every = teeSetsTerm(holes);
 if (every.avg > 0 && every.avg < TEE_KINDS.length) qualityHints.push(`Add tee sets for every golfer (${TEE_KINDS.map(k => TEE_SET[k].name).join(', ')}): ${every.avg.toFixed(1)} a hole now`);
 qualityScore = Math.max(0, Math.min(100, qualityScore + (hq?.bonusPoints ?? 0) + slopeQuality.steepGreens + slopeQuality.steepFairways + slopeQuality.shaped + every.points));
  const clampedTier = tierInfo(tier).tier;
  const nextTier = clampedTier < 5 ? clampedTier + 1 : null;
  const facts: CourseFacts = { holes: totals.holes, lengthM: totals.lengthM, have };
  const missingForCurrent = missingFor(clampedTier, facts);
  const missingForNext = nextTier !== null ? missingFor(nextTier, facts) : [];
  if (nextTier !== null && missingForNext.includes('holes')) {
    qualityHints.push(`Tier ${nextTier} requires ${tierInfo(nextTier).holes} holes`);
  }
  if (nextTier !== null && missingForNext.includes('length')) {
    qualityHints.push(`Tier ${nextTier} requires at least ${tierInfo(nextTier).minLengthM} m championship length`);
  }
  const missingLabels = (nextTier !== null ? missingForNext : missingForCurrent).map(k => NEED_LABEL[k]);
  return {
    rows,
    totals,
    warningCount,
    monthlyUpkeep,
    qualityScore,
    qualityHints,
    heightBonus: hq?.bonusPoints ?? 0,
    steepGreenHoles: hq?.steepGreenHoles ?? [],
    slopeQuality,
    everyGolfer: every.points,
    tier: clampedTier,
    nextTier,
    missingForCurrent,
    missingForNext,
    missingLabels,
  };
}
