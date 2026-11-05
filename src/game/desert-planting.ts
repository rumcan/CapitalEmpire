// T342 (#970; the owner, 2026-11-05: "make sure the holes you make doesnt add the normal trees in desert mode. that doesnt mean you cant make
// them yourself"): what the game plants by itself on a hole in a desert game. The hole frames (golf/holeframe.ts), the starter course's
// dressing (golf/dressing.ts) and a saved hole's frame trees (My holes) deal from these sets instead of the autumn broadleaves and conifers:
// palms (the T289 date palms and the kit's palms), desert trees (acacias, Joshua trees), tall cacti, desert shrubs and big rocks, each sized
// by its owner size as today's trees are. The Props tool and the plant brushes still offer every tree (the player plants what they like).
// Pure TS (no DOM, no library): the tests run it in node and hold every id to the library.
import { DESERT_PROP_IDS } from './new-props-library';
import { KIT_PALM_IDS } from './kit';
import { REMOVED_IDS } from './lots/scales';
import { ownerSize } from './forest';

const removed = new Set(REMOVED_IDS);
const keep = (ids: readonly string[]) => ids.filter(id => !removed.has(id));
/** the tall cacti (a hole's frame stands among them as among trees): the saguaros, ocotillos and chollas */
const TALL_CACTI = keep((DESERT_PROP_IDS.cactus ?? []).filter(id => /saguaro|ocotillo|cholla/.test(id)));
/** the bigger rocks (outcrops, boulder groups, ledges): a tree's stand-in */
const BIG_ROCKS = keep((DESERT_PROP_IDS.rock ?? []).filter(id => /big|group|outcrop|ledge|stacked|blocks|boulders/.test(id)));
/** a hole's desert planting: each set and its share (palms first: the owner's desert is "palm trees and rocks") */
export const DESERT_HOLE_SETS: readonly { name: string; w: number; ids: readonly string[] }[] = [
  { name: 'palm', w: 0.38, ids: keep([...(DESERT_PROP_IDS.palm ?? []), ...KIT_PALM_IDS]) },
  { name: 'tree', w: 0.22, ids: keep(DESERT_PROP_IDS.tree ?? []) },
  { name: 'cactus', w: 0.15, ids: TALL_CACTI },
  { name: 'shrub', w: 0.15, ids: keep(DESERT_PROP_IDS.shrub ?? []) },
  { name: 'rock', w: 0.10, ids: BIG_ROCKS },
].filter(s => s.ids.length);
const TOTAL = DESERT_HOLE_SETS.reduce((a, s) => a + s.w, 0);
/** every id a desert hole can plant (the tests hold it to the library) */
export const DESERT_HOLE_IDS: readonly string[] = DESERT_HOLE_SETS.flatMap(s => s.ids);
const HOLE_SET: ReadonlySet<string> = new Set(DESERT_HOLE_IDS);
/** whether an id is one a desert hole plants */
export const isDesertHolePlant = (id: string) => HOLE_SET.has(id);

/** the desert plant a uniform u in [0, 1) deals: the set by its share, then the plant within it (u's rest, so one number decides both) */
export function desertHolePlant(u: number): string {
  let x = Math.max(0, Math.min(0.999999, u)) * TOTAL;
  for (const s of DESERT_HOLE_SETS) {
    if (x < s.w) return s.ids[Math.min(s.ids.length - 1, Math.floor((x / s.w) * s.ids.length))]!;
    x -= s.w;
  }
  const last = DESERT_HOLE_SETS[DESERT_HOLE_SETS.length - 1]!; return last.ids[last.ids.length - 1]!;
}
/** a uniform hash of a spot (tiles) in [0, 1): the same spot always the same plant */
export function spotU(x: number, y: number, salt = 0x6d2b79f5): number {
  let h = Math.imul(Math.round(x * 100) ^ 0x3c6ef372, 0x85ebca6b) ^ Math.imul(Math.round(y * 100) ^ salt, 0xc2b2ae35);
  h ^= h >>> 15; h = Math.imul(h, 0x297a2d39); h ^= h >>> 13; return (h >>> 0) / 4294967296;
}
/** a saved hole's frame tree (My holes, a hole preset) planted in a desert game: an autumn tree or conifer becomes the desert plant its spot
 *  deals, at the same share of its owner size (a tree at 110% of its size is a palm at 110% of the palm's); a desert plant stays as it is */
export function desertFrameTree<T extends { id: string; x: number; y: number; scale: number; flip?: boolean }>(t: T): T {
  if (HOLE_SET.has(t.id)) return t;
  const id = desertHolePlant(spotU(t.x, t.y));
  return { ...t, id, scale: Math.round(t.scale / ownerSize(t.id) * ownerSize(id) * 100) / 100, ...(t.flip !== undefined ? { flip: false } : {}) };
}

/** the plant brushes' Desert filter (Facilities › Plants: Trees, Bushes, Flowers): the desert sets of each. Trees: the palms, the desert
 *  trees and the tall cacti; Bushes: the desert shrubs, the low cacti and the desert grasses; Flowers: the flowering desert plants (the
 *  shrubs and cacti in bloom, the yuccas, the succulents) */
export type DesertPlantKind = 'trees' | 'bushes' | 'flowers';
const LOW_CACTI = keep((DESERT_PROP_IDS.cactus ?? []).filter(id => !/saguaro|ocotillo|cholla/.test(id)));
const BLOOM = /flower|bloom|torch|pink|red|purple|succulent|yucca|brittlebush|hedgehog|prickly-pear|aloe/;
const DESERT_PLANTS: Readonly<Record<DesertPlantKind, readonly string[]>> = {
  trees: [...new Set([...keep(DESERT_PROP_IDS.palm ?? []), ...keep(KIT_PALM_IDS), ...keep(DESERT_PROP_IDS.tree ?? []), ...TALL_CACTI])],
  bushes: [...new Set([...keep(DESERT_PROP_IDS.shrub ?? []), ...LOW_CACTI, ...keep(DESERT_PROP_IDS.grass ?? [])])],
  flowers: [...new Set([...keep(DESERT_PROP_IDS.shrub ?? []), ...keep(DESERT_PROP_IDS.cactus ?? [])].filter(id => BLOOM.test(id)))],
};
/** the desert plants of a plant brush's kind (library ids) */
export const desertPlantIds = (kind: DesertPlantKind): readonly string[] => DESERT_PLANTS[kind];
