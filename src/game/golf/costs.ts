// Course surface build costs, seed/sod grow-in and monthly maintenance (docs/GOLF-PLAN.md sections 2.1, 4.1 and 7). Pure TS, no DOM.
import { polyArea, type PaintTex } from '../paint';
import { SURFACE_TEX } from './paintcourse';
import { TILE_M, type GolfSurface } from './types';

/** planting mode when painting a course surface: seed (needs grow-in) or sod (ready at once, 3-5x turf price) */
export type PlantKind = 'seed' | 'sod';

/** per-surface rates from GOLF-PLAN 4.1 (1985 $/m², grow-in months for seed, annual upkeep $/m²/year) */
export interface SurfaceCost { seed: number; sod: number | null; growIn: number; upkeepYear: number }

/** GOLF-PLAN 4.1 cost and grow-in table for every GolfSurface */
export const SURFACE_COST: Record<GolfSurface, SurfaceCost> = {
  green: { seed: 6, sod: 25, growIn: 6, upkeepYear: 3.0 },
  fringe: { seed: 4, sod: 15, growIn: 4, upkeepYear: 1.5 },
  tee: { seed: 3, sod: 12, growIn: 3, upkeepYear: 1.2 },
  fairway: { seed: 2, sod: 8, growIn: 3, upkeepYear: 0.6 },
  firstCut: { seed: 1.5, sod: 6, growIn: 2, upkeepYear: 0.4 },
  rough: { seed: 0.8, sod: 4, growIn: 2, upkeepYear: 0.15 },
  fescue: { seed: 0.5, sod: null, growIn: 3, upkeepYear: 0.05 },
  bunker: { seed: 4, sod: null, growIn: 0, upkeepYear: 0.5 },
  waste: { seed: 4, sod: null, growIn: 0, upkeepYear: 0.5 },
  water: { seed: 10, sod: null, growIn: 0, upkeepYear: 0.2 },
  path: { seed: 2, sod: null, growIn: 0, upkeepYear: 0.1 },
  other: { seed: 0, sod: null, growIn: 0, upkeepYear: 0 },
};

/** reverse lookup from SURFACE_TEX PaintTex ids to their GolfSurface */
export const TEX_SURFACE: Partial<Record<PaintTex, GolfSurface>> = Object.fromEntries(
  (Object.entries(SURFACE_TEX) as [GolfSurface, { tex: PaintTex; radius: number }][]).map(([s, { tex }]) => [tex, s]),
);

/** the GolfSurface for a PaintTex id in SURFACE_TEX, or null for non-course textures */
export function surfaceOfTex(tex: PaintTex): GolfSurface | null {
  return Object.prototype.hasOwnProperty.call(TEX_SURFACE, tex) ? (TEX_SURFACE[tex] ?? null) : null;
}

/** resolve either a GolfSurface key or a PaintTex id to a GolfSurface, or null when unmapped */
function resolveSurface(surfaceOrTex: GolfSurface | PaintTex): GolfSurface | null {
  if (Object.prototype.hasOwnProperty.call(SURFACE_COST, surfaceOrTex)) return surfaceOrTex as GolfSurface;
  return surfaceOfTex(surfaceOrTex as PaintTex);
}

/** whether a surface supports sod installation (true for green, fringe, tee, fairway, firstCut, rough) */
export function canSod(surface: GolfSurface): boolean { return SURFACE_COST[surface].sod !== null; }

/** polygon area in square metres (|polyArea(pts)| * TILE_M * TILE_M; 1 tile² = 4 m²) */
export function areaSqm(pts: number[]): number {
  return pts.length >= 6 ? Math.abs(polyArea(pts)) * TILE_M * TILE_M : 0;
}

/** build $/m² for surface and kind ('sod' uses sod price when available, else falls back to seed price) */
export function unitBuildCost(surface: GolfSurface, kind: PlantKind = 'seed'): number {
  const c = SURFACE_COST[surface];
  return kind === 'sod' ? (c.sod ?? c.seed) : c.seed;
}

/** total build cost ($) for sqm >= 0 of surface and kind (default 'seed') */
export function paintCostSqm(surface: GolfSurface, sqm: number, kind: PlantKind = 'seed'): number {
  return Math.max(0, sqm) * unitBuildCost(surface, kind);
}

/** build cost ($) for a polygon outline pts (tiles) of a GolfSurface or PaintTex (0 when tex is not a golf surface) */
export function areaBuildCost(pts: number[], surfaceOrTex: GolfSurface | PaintTex, kind: PlantKind = 'seed'): number {
  const s = resolveSurface(surfaceOrTex);
  return s ? paintCostSqm(s, areaSqm(pts), kind) : 0;
}

/** grow-in time in months for surface and kind (0 when kind === 'sod' or surface has no grow-in) */
export function growInMonths(surface: GolfSurface, kind: PlantKind = 'seed'): number {
  return kind === 'sod' ? 0 : SURFACE_COST[surface].growIn;
}

/** grow-in maturity in 0..1 after elapsedMonths >= 0 (1 at once for sod or 0-month surfaces; linear ramp for seed) */
export function growInShare(surface: GolfSurface, kind: PlantKind, elapsedMonths: number): number {
  const m = growInMonths(surface, kind);
  return m <= 0 ? 1 : Math.min(1, Math.max(0, elapsedMonths) / m);
}

/** monthly maintenance cost ($) for sqm >= 0 of surface (upkeepYear / 12 per m²) */
export function monthlyUpkeepSqm(surface: GolfSurface, sqm: number): number {
  return Math.max(0, sqm) * SURFACE_COST[surface].upkeepYear / 12;
}

/** monthly maintenance cost ($) for a single polygon outline pts (tiles) of a GolfSurface or PaintTex */
export function areaMonthlyUpkeep(pts: number[], surfaceOrTex: GolfSurface | PaintTex): number {
  const s = resolveSurface(surfaceOrTex);
  return s ? monthlyUpkeepSqm(s, areaSqm(pts)) : 0;
}

/** total monthly maintenance ($) across CourseArea[] or PaintArea[] (areas with non-golf tex are ignored) */
export function courseMonthlyUpkeep(areas: ReadonlyArray<{ pts: number[]; surface?: GolfSurface; tex?: PaintTex }>): number {
  let sum = 0;
  for (const a of areas) {
    const key = a.surface ?? a.tex;
    if (key !== undefined) sum += areaMonthlyUpkeep(a.pts, key);
  }
  return sum;
}
