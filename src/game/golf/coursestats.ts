// Course stats panel model (docs/GOLF-PLAN.md sections 4.2, 4.3, 5.1 and 8.2): turns holes.ts derivation, costs.ts maintenance, and tour.ts missingFor into panel rows and quality hints. Pure TS, no DOM.
import { courseMonthlyUpkeep, growInShare } from './costs';
import { evaluateCourseHeightQuality, type CourseHeightField } from '../ext/course-height';
import { courseStats, deriveHoles, type CourseStats, type Hole } from './holes';
import { missingFor, tierInfo, type CourseFacts, type Need } from './tour';
import type { CourseLayout } from './types';

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
  playable: boolean;
  warnings: string[];
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
    playable: h.line.length >= 2,
    warnings: h.warnings.slice(),
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
 const warningCount = rows.reduce((s, r) => s + r.warnings.length, 0);
 const monthlyUpkeep = Math.round(courseMonthlyUpkeep(layout.areas));
 const quality = courseQuality(layout, holes, baseTotals, currentMonth);
 const qualityHints = quality.hints;
 let qualityScore = quality.score;
 if (hq) { qualityScore = Math.min(100, qualityScore + hq.bonusPoints); qualityHints.push(...hq.hints); }
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
    tier: clampedTier,
    nextTier,
    missingForCurrent,
    missingForNext,
    missingLabels,
  };
}
