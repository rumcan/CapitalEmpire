/** Managed surface families; the existing ground texture remains underneath this condition layer. */
export const GRASS_SURFACES = ['golf-green', 'golf-fairway', 'golf-tee', 'golf-fringe', 'golf-first-cut', 'golf-rough', 'golf-fescue', 'driving-range', 'town-park', 'road-verge', 'residential-lawn', 'meadow', 'clover-lawn', 'estate-lawn', 'shaded-lawn', 'damp-lawn'] as const;
/** Grass material family, independent of the owner's selected lawn preset. */
export type GrassSurface = typeof GRASS_SURFACES[number];
/** Five visual recovery bands, from neglected to immaculate. */
export type GrassCondition = 'neglected' | 'stressed' | 'recovering' | 'maintained' | 'pristine';
/** An opaque top-down 16 m material; ids match the independent asset generation catalogue. */
export interface GroundMaterial { id: string; family: string; kind: 'grass' | 'soil'; condition: string; worldMetres: number }
const conditions: GrassCondition[] = ['neglected', 'stressed', 'recovering', 'maintained', 'pristine'];
/** All 80 grass and 20 soil choices. Their presence here does not imply their artwork has been generated. */
export const GROUND_MATERIALS: readonly GroundMaterial[] = [...GRASS_SURFACES.flatMap(family => conditions.map(condition => ({ id: `${family}-${condition}`, family, kind: 'grass' as const, condition, worldMetres: 16 }))), ...['loam', 'sandy-soil', 'clay-soil', 'gravel-soil'].flatMap(family => ['dry', 'damp', 'compacted', 'churned', 'prepared'].map(condition => ({ id: `${family}-${condition}`, family, kind: 'soil' as const, condition, worldMetres: 16 })))];
/** Transparent decal sheets, four independently usable variants per sheet (row-major). */
export const GRASS_DECALS = ['mowing-stripes', 'mowing-patterns', 'crowd-light', 'crowd-heavy', 'divots-fresh', 'divots-repair', 'cart-tracks', 'mud-footprints', 'dry-patches', 'maintenance', 'leaves-litter', 'surface-transitions'] as const;
/** Texture presets with no golf surface that are still managed turf, by preset id (T096): the driving range's own outfield (its mown stripes) is
 *  the driving-range family, its target greens are greens (golf/rangehost.ts RANGE_PRESET: 'range-outfield', 'range-green') */
export const PRESET_FAMILY: Readonly<Record<string, GrassSurface>> = { 'range-outfield': 'driving-range', 'range-green': 'golf-green', 'range-tee-turf': 'golf-tee' }; // T223: the range's turfed tee box (its desert and dirt are no grass)
/** Existing paint texture to managed family; non-grass surfaces are excluded. */
export function grassSurface(tex: string, lawn = false, presetSurface?: string | null): GrassSurface | null {
  if (lawn) return 'residential-lawn';
  if (tex.startsWith('preset:') && PRESET_FAMILY[tex.slice(7)]) return PRESET_FAMILY[tex.slice(7)]!;
  if (tex.startsWith('preset:')) { const families: Record<string, GrassSurface> = { green: 'golf-green', fairway: 'golf-fairway', tee: 'golf-tee', fringe: 'golf-fringe', firstCut: 'golf-first-cut', rough: 'golf-rough', fescue: 'golf-fescue' }; return presetSurface ? families[presetSurface] ?? null : null; }
  const known: Record<string, GrassSurface> = { grass: 'town-park', grassDry: 'road-verge', lawnLush: 'residential-lawn', lawnWorn: 'residential-lawn', lawnClover: 'clover-lawn', golfGreen: 'golf-green', golfFairway: 'golf-fairway', golfTee: 'golf-tee', golfFringe: 'golf-fringe', golfFirstCut: 'golf-first-cut', golfRough: 'golf-rough', golfFescue: 'golf-fescue', golfSod: 'golf-fairway', meadowLush: 'meadow', meadowFlowers: 'meadow' };
  return known[tex] ?? null;
}
