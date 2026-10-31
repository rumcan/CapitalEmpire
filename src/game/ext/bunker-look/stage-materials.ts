import type { BunkerTextureSlot } from './settings';

/** One picture the bake worker loads: crop = [x, y, w, h] as fractions of the image (the pack's atlas holds four pictures). */
export interface BunkerMaterial { id: string; url: string; crop?: readonly [number, number, number, number] }
export type BunkerMaterials = Record<BunkerTextureSlot, BunkerMaterial>;
export interface BunkerTextureEntry extends BunkerMaterial { label: string; group: string }

/** Literal URLs let Vite emit the preserved approved material set; the edit worker receives resolved browser URLs. */
const ATLAS = new URL('./package/textures/material-atlas.png', import.meta.url).href;
const PACK = 'Bunker pack';
/** The approved look's pictures: the atlas quadrants (TL grass, TR sand, BL edge soil, BR grass) and the pack's own textures. */
export const BUNKER_PACK_TEXTURES: readonly BunkerTextureEntry[] = Object.freeze([
  // the Sand slot's default: the bunker's My looks texture where it has a picture, else this sand (stage-bridge materialsOf)
  { id: 'bunker:sand', label: 'Bunker sand', group: PACK, url: ATLAS, crop: [0.5, 0, 0.5, 0.5] },
  // the same sand picked on purpose: it stays whatever My looks says
  { id: 'bunker:sand-fixed', label: 'Bunker sand (not My looks)', group: PACK, url: ATLAS, crop: [0.5, 0, 0.5, 0.5] },
  { id: 'bunker:soil', label: 'Edge soil and roots', group: PACK, url: ATLAS, crop: [0, 0.5, 0.5, 0.5] },
  { id: 'bunker:border-grass', label: 'Border grass', group: PACK, url: new URL('./package/textures/border-grass.png', import.meta.url).href },
  { id: 'bunker:first-cut', label: 'First cut', group: PACK, url: new URL('./package/textures/first-cut.png', import.meta.url).href },
  { id: 'bunker:wall-earth', label: 'Wall earth', group: PACK, url: new URL('./package/textures/wall-earth.png', import.meta.url).href },
  { id: 'bunker:fairway', label: 'Fairway', group: PACK, url: new URL('./package/textures/fairway-seamless.png', import.meta.url).href },
  { id: 'bunker:grass-a', label: 'Atlas grass A', group: PACK, url: ATLAS, crop: [0, 0, 0.5, 0.5] },
  { id: 'bunker:grass-b', label: 'Atlas grass B', group: PACK, url: ATLAS, crop: [0.5, 0.5, 0.5, 0.5] },
] as BunkerTextureEntry[]);
