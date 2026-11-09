// The desert theme (T341, #968; the owner, 2026-11-05: "a desert version of the town ... a quick toggle switch to change all the trees to palm
// trees and cactus and all the grass and fescue to desert and dirt"; then "this is for world only not the golf course", "replace bush sprites
// with rocks and desert plants", "leave the grass in the backyards ... golden grass instead of the bright green grass", "I dont want to see any
// of the normal trees on the map. All palm trees and rocks", "you can also use bunker sand"). The gear menu's Desert theme switch (saved).
// Existing art only, and nothing regenerated or saved differently:
//   sprites: a draw-time substitution (newart.ts lookOf): every world tree is drawn as a palm (the T289 date palms, the kit's palms) or a desert
//     rock, every world bush, shrub, flower bed or hedge piece as a desert plant or rock (T289: shrubs, agaves, small cacti, grasses, boulders);
//     picked from where it stands (the same spot, the same plant), sized by the owner sizes, never mirrored. The course's and the range's own
//     props (on the club's land, decor and frame trees) keep their art (the engine's keep predicate).
//   ground: the painted surfaces file's world looks swapped (desertSurfaces): the map's open ground desert sand with dirt and pale (unraked)
//     bunker-sand areas, the woodland floor dirt; the lot lawns golden fescue (their shapes and edges as they are). The golf surfaces are not
//     touched, so the course keeps every surface and edge. The ground re-bakes once through the normal path (the surfaces file changed).
// Pure TS (no DOM): the tests run it in node.
import { LIBRARY } from './library';
import { DESERT_PROP_IDS } from './new-props-library';
import { OWNER_SCALE, REMOVED_IDS } from './lots/scales';
import type { LibItem } from './types';
import type { PaintedLook } from './painted-families';
import type { SurfacesFile } from './painted-surfaces';

/** the switch's localStorage key ('1' on) */
export const DESERT_KEY = 'capitalempire.desertTheme';

// ---------------------------------------------------------------- the ground

const look = (family: string, scale = 1, tone = 0, tint = '#ffffff'): PaintedLook => ({ family, version: null, scale, tint, tone });
/** the pale sand's warm tint and tone: the bunker's unraked sand brought toward the desert sand, so its patches blend in as paler ground */
const PALE_TINT = '#fff0dc';
/** the open ground's looks: desert sand (the Waste area sand's painting) for the map's ground, pale unraked sand (the bunker's ripples) over
 *  the meadow's soft patches and dirt for the woodland floor, worn and dry ground, so the desert is three blended materials, never one colour */
export const DESERT_SAND = 'desert-run', DESERT_DIRT = 'dirt-run', DESERT_PALE = 'sand-ripples', LAWN_FESCUE = 'golden-fescue';
/** the world's grass surfaces (painted-surfaces.ts SURFACES keys) and the look each wears in the desert */
export const DESERT_GROUND: Readonly<Record<string, PaintedLook>> = {
  base: look(DESERT_SAND), outside: look(DESERT_SAND),
  // T382 (the owner, 2026-11-08: "more small sand blotches but no big sandy spaces"): the meadow and dry grass classes (the map's large soft patches) are the ground itself, no big pale spaces; the pale sand is the Sand drifts surface (dune),
  // laid by the living ground as many small blended blotches (living-ground.ts sandBlotch)
  meadow: look(DESERT_SAND), dry: look(DESERT_SAND),
  worn: look(DESERT_DIRT), woodland: look(DESERT_DIRT, 1, -0.03),
  // the living ground's patchy grass (under trees, at doors) is bare dirt in the desert; its lush grass (along fences and water) is dirt already
  patchy: look(DESERT_DIRT), lush: look(DESERT_DIRT),
};
/** the town's lot lawns: golden fescue for the bright green (the owner: "leave the grass in the backyards the way it is now but replace it with
 *  the fescue golden grass"), the yards' shapes, mow lines and feathering as they are */
export const DESERT_LAWN: Readonly<Record<string, PaintedLook>> = {
  lawn: look(DESERT_DIRT), lawnBuilt: look(DESERT_DIRT), lawnUpgraded: look(DESERT_DIRT, 1, 0.03), lawnDeclined: look(DESERT_DIRT, 1, -0.04),
};
/** T382: the sand blotches' look, the pale rippled sand over the dirt (the surfaces file's `dune`, an art slot: autumn has none and lays none) */
/** the sand blotches are painted with the hand-painted sand-ripples TILE set (painted-tiles.ts: fine ripples and grain at the picture's own resolution, as sharp as the desert ground's tiles); the classic sand-ripples family (DESERT_PALE, 1024 px pictures laid at a coarser scale) is a smooth painting, and a blotch of it read as a glossy smear */
export const DESERT_DUNE_FAMILY = 'sand-ripples-tiles';
export const DESERT_DUNE: PaintedLook = look(DESERT_DUNE_FAMILY);
/** the desert as it was before T382 (the dev server's ?sand=old, the A/B of the shots and the bench): big pale patches over the meadow and dry grass classes, golden fescue yards, no blotches */
const OLD_SAND: Readonly<Record<string, PaintedLook>> = {
  meadow: look(DESERT_PALE, 1, -0.04, PALE_TINT), dry: look(DESERT_PALE, 1, -0.08, PALE_TINT),
  lawn: look(LAWN_FESCUE), lawnBuilt: look(LAWN_FESCUE), lawnUpgraded: look(LAWN_FESCUE, 1, 0.03), lawnDeclined: look(LAWN_FESCUE, 1, -0.04),
};
/** the course's and the range's surfaces: never touched by the theme (the owner: "this is for world only not the golf course") */
export const COURSE_SURFACES: readonly string[] = ['green', 'fringe', 'fairway', 'firstCut', 'tee', 'sod', 'rough', 'longGrass', 'fescue', 'bunker', 'waste', 'water', 'growSoil', 'wallTurf', 'wallSand', 'wallBank'];
/** the green lawn families a lawn slot or a lawn preset may wear, swapped for the golden fescue (a desert or fescue one stays as it is) */
const GREEN_LAWN = /lawn|meadow|emerald|fairway|green|rough-concept|clover/;
const toFescue = <T extends PaintedLook>(l: T): T => GREEN_LAWN.test(l.family) ? { ...l, family: LAWN_FESCUE, version: null } : l;
/** T382 (the owner: "no sand-rectangle yards: yards are dirt with drifts and desert plants"): the green lawn families a yard may wear are the desert's dirt (the sand blotches lay a few small drifts over it) */
const toDirt = <T extends PaintedLook>(l: T): T => GREEN_LAWN.test(l.family) ? { ...l, family: DESERT_DIRT, version: null } : l;
/** the surfaces file with the desert theme on: the world's grass surfaces as DESERT_GROUND, the lot lawns golden fescue (DESERT_LAWN, the lawn
 *  slots and the lawns preset), the course's surfaces and every other preset (the range's) as they were; desert: true tells the ground
 *  workers (no fallen leaves in the desert) */
export function desertSurfaces(f: SurfacesFile, o: { oldSand?: boolean } = {}): SurfacesFile {
  const old = !!o.oldSand, yard = old ? toFescue : toDirt, presets = { ...f.presets }; if (presets.lawns) presets.lawns = yard(presets.lawns);
  return { ...f, desert: true, surfaces: { ...f.surfaces, ...DESERT_GROUND, ...(old ? OLD_SAND : { ...DESERT_LAWN, dune: DESERT_DUNE }) }, lawns: f.lawns.map(yard), presets };
}

// ---------------------------------------------------------------- the sprites

const removed = new Set(REMOVED_IDS);
const INDEX = new Map(LIBRARY.map((it, i) => [it.id, i] as const));
const ids = (list: readonly string[]) => list.filter(id => !removed.has(id) && INDEX.has(id)).map(id => INDEX.get(id)!);
const isDesertArt = (it: LibItem) => it.cat.startsWith('Desert:') || it.id.startsWith('newprop:desert-');
/** what a world plant becomes: 'tree', a palm or a big rock; 'bush', a desert plant or a rock */
export type DesertClass = 'tree' | 'bush';
/** the world plants the theme swaps: every tree (any kind 'tree', and the course-props trees when they stand in the world), every bush, flower,
 *  shrub, hedge piece and flower bed that is not desert art already. The kit's palms are palms already and stay */
export function desertClassOf(it: LibItem): DesertClass | null {
  if (isDesertArt(it) || it.kind === 'palm') return null;
  if (it.kind === 'tree' || it.id === 'newprop:small-tree' || it.id === 'newprop:flowering-tree') return 'tree';
  if (it.kind === 'bush' || it.kind === 'flower' || it.kind === 'shrub' || it.id === 'newprop:flower-bed') return 'bush';
  if ((it.kind === 'fencex' || it.kind === 'fencey') && /hedge/.test(it.id)) return 'bush';
  return null;
}
/** the palms a tree is drawn as: the T289 date palms and the kit's canary, windmill and fan palms */
const PALMS = ids([...(DESERT_PROP_IDS.palm ?? []), ...LIBRARY.filter(it => it.kind === 'palm' && it.id.startsWith('kit:palm-')).map(it => it.id)]);
const ROCKS = ids(DESERT_PROP_IDS.rock ?? []);
/** the big rocks (a tree's stand-in): the wider half of the desert rocks; the small ones go with the bushes */
const ROCK_W = [...ROCKS].map(i => LIBRARY[i]!.w).sort((a, b) => a - b)[Math.floor(ROCKS.length / 2)] ?? 0;
const BIG_ROCKS = ROCKS.filter(i => LIBRARY[i]!.w >= ROCK_W), SMALL_ROCKS = ROCKS.filter(i => LIBRARY[i]!.w < ROCK_W);
/** the low cacti (no saguaro or ocotillo among the bushes: a bush is never taller than a person) */
const LOW_CACTI = ids((DESERT_PROP_IDS.cactus ?? []).filter(id => !/saguaro|ocotillo|thicket|garden/.test(id)));
/** each class's pools and their shares: the trees all palms and rocks (the owner: "All palm trees and rocks"), the bushes desert plants and rocks */
export const DESERT_POOLS: Readonly<Record<DesertClass, readonly { w: number; items: readonly number[] }[]>> = {
  tree: [{ w: 0.8, items: PALMS }, { w: 0.2, items: BIG_ROCKS }],
  bush: [{ w: 0.42, items: ids(DESERT_PROP_IDS.shrub ?? []) }, { w: 0.26, items: SMALL_ROCKS }, { w: 0.16, items: LOW_CACTI }, { w: 0.16, items: ids(DESERT_PROP_IDS.grass ?? []) }],
};
/** per library index: its class (null: drawn as itself) */
export const DESERT_CLASS: readonly (DesertClass | null)[] = LIBRARY.map(desertClassOf);
/** a uniform hash of a spot (tiles) and a salt, in [0, 1) */
function spotHash(x: number, y: number, salt: number): number {
  let h = Math.imul(Math.floor(x * 16) ^ 0x2c1b3c6d, 0x85ebca6b) ^ Math.imul(Math.floor(y * 16) ^ salt, 0xc2b2ae35);
  h ^= h >>> 15; h = Math.imul(h, 0x297a2d39); h ^= h >>> 13; return (h >>> 0) / 4294967296;
}
const own = (i: number) => (OWNER_SCALE as Record<string, number>)[LIBRARY[i]!.id] ?? 1;
/** the desert picture (a library index) a world plant (item) standing at x, y (tiles) is drawn as, and its scale for the plant's scale: the
 *  same spot always the same picture; the scale keeps the plant's share of its own owner size (a forest tree at 55% of its size is a palm at
 *  55% of the palm's). null for an item the theme leaves alone */
export function desertPick(item: number, x: number, y: number, scale: number): { item: number; scale: number } | null {
  const c = DESERT_CLASS[item]; if (!c) return null;
  const pools = DESERT_POOLS[c]; let u = spotHash(x, y, 0x5bd1e995), pool = pools[pools.length - 1]!;
  for (const p of pools) { if (u < p.w && p.items.length) { pool = p; break; } u -= p.w; }
  if (!pool.items.length) return null;
  const n = pool.items[Math.floor(spotHash(x, y, 0x1b873593) * pool.items.length)]!;
  return { item: n, scale: scale / own(item) * own(n) };
}
