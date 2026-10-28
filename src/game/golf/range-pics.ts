// T258 (#755): the range's ground pictures (GOLF-ART-LIST 19 the hitting mat, 20 the target green, 27 the bullseye green; made by
// scripts/assets/prep-range-art.mjs from the art agent's top-down pictures) as the ground painter's photo textures: a painted area of one of
// them lays the picture flat in tile space, turned, scaled and placed by its paint (PatchPaint a, s, o: renderer.ts drawPaint), one picture
// a period. rangebiz.ts rangeScene says where (the mats per bay, the greens at their size), rangehost.ts lays them. The worker's textures
// build them on first use (textures.ts: they are photos with a plain period).
import type { PhotoTexEntry } from '../grass-art';
import mats from '../../assets/ground/range-mats.webp';
import green from '../../assets/ground/range-green.webp';
import bullseye from '../../assets/ground/range-bullseye.webp';

/** every range picture's period at paint scale 1 (tiles a picture's width): a patch's scale is its picture's width over this */
export const PIC_TILES = 10;
/** the textures (ids 'pic:<name>') */
export const RANGE_PIC_TEX = { mats: 'pic:range-mats', green: 'pic:range-green', bullseye: 'pic:range-bullseye' } as const;
/** the photo textures (plain: no hex mixing, one picture a period) */
export const RANGE_PICS: PhotoTexEntry[] = [
  { tex: RANGE_PIC_TEX.mats, src: mats, mix: 0, tiles: PIC_TILES },
  { tex: RANGE_PIC_TEX.green, src: green, mix: 0, tiles: PIC_TILES },
  { tex: RANGE_PIC_TEX.bullseye, src: bullseye, mix: 0, tiles: PIC_TILES },
];
/** a range picture's texture (laid in tile space as a photo: paint.ts isPaintPhoto) */
export const isRangePic = (t: string) => t.startsWith('pic:');
