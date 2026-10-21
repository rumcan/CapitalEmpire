/** Dev-only: which two pictures the map's base grass is hex-mixed from (picked in the gear menu, reloads the game). */
import grassBase from '../assets/ground/grass-base.webp';
import grassV2Base from '../assets/ground/grass-v2-base.webp';
import grassCapitalBackyard from '../assets/ground/grass-capital-backyard.webp';
import grassCapitalMeadow from '../assets/ground/grass-capital-meadow.webp';
import lawnLush from '../assets/ground/paint-photo-lawn-lush.webp';
import lawnWorn from '../assets/ground/paint-photo-lawn-worn.webp';
import lawnClover from '../assets/ground/paint-photo-lawn-clover.webp';
import photoGrass from '../assets/ground/paint-photo-grass.webp';
import photoGrassDry from '../assets/ground/paint-photo-grass-dry.webp';
import meadowLush from '../assets/ground/paint-photo-meadow-lush.webp';
import meadowFlowers from '../assets/ground/paint-photo-meadow-flowers.webp';
import golfFirstCut from '../assets/ground/paint-photo-golf-first-cut.webp';

/** the grass pairs the dev setting offers; a = grassA, b = grassB of the ground art */
export const BASE_GRASSES: { id: string; name: string; a: string; b: string }[] = [
  { id: 'original', name: 'Original painted', a: grassBase, b: grassV2Base },
  { id: 'capital', name: 'Generated backyard + meadow', a: grassCapitalBackyard, b: grassCapitalMeadow },
  { id: 'lawns', name: 'Photo lush + worn lawn', a: lawnLush, b: lawnWorn },
  { id: 'clover', name: 'Photo lush + clover lawn', a: lawnLush, b: lawnClover },
  { id: 'grass', name: 'Photo grass + dry grass', a: photoGrass, b: photoGrassDry },
  { id: 'meadow', name: 'Photo meadow + wildflowers', a: meadowLush, b: meadowFlowers },
  { id: 'firstcut', name: 'Photo first cut + lush lawn', a: golfFirstCut, b: lawnLush },
];
/** what main draws when no dev choice is saved */
export const BASE_GRASS_DEFAULT = 'capital';
const KEY = 'capitalempire.dev.baseGrass';

/** the chosen base grass id (a saved id that is no longer known falls back to the default) */
export function baseGrassId(): string {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved && BASE_GRASSES.some(g => g.id === saved)) return saved;
  } catch { /* storage may be unavailable */ }
  return BASE_GRASS_DEFAULT;
}

/** stores the base grass choice and reloads, so the ground workers rebuild with it */
export function setBaseGrass(id: string) {
  try { localStorage.setItem(KEY, id); } catch { /* storage may be unavailable */ }
  location.reload();
}

/** a copy of the ground art with grassA / grassB taken from the chosen base grass */
export function withBaseGrass<T extends { grassA: string; grassB: string }>(art: T): T {
  const g = BASE_GRASSES.find(x => x.id === baseGrassId()) ?? BASE_GRASSES[0];
  return { ...art, grassA: g.a, grassB: g.b };
}
