/** The base grass the game uses (main thread): the owner's, saved by the sprite studio's Ground tab (base-grass.json and the two adjusted pictures
 *  src/assets/ground/base-grass-a.webp / -b.webp), else the generated backyard + meadow pair with the game's original mix. */
import grassCapitalBackyard from '../assets/ground/grass-capital-backyard.webp';
import grassCapitalMeadow from '../assets/ground/grass-capital-meadow.webp';
import saved from './base-grass.json';
import { clampMix, clampSide, type BaseGrassArt, type BaseGrassFile } from './base-grass';

// optional files: the glob is empty until the studio first saves
const PICS = import.meta.glob('../assets/ground/base-grass-*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

/** a copy of the ground art with the base grass pictures (and, when the owner saved one, the mix and sizes) */
export function withBaseGrass<T extends { grassA: string; grassB: string }>(art: T): T & { grassMix?: BaseGrassArt } {
  const f = saved as BaseGrassFile, a = PICS['../assets/ground/base-grass-a.webp'], b = PICS['../assets/ground/base-grass-b.webp'];
  if (!f.saved || !a || !b) return { ...art, grassA: grassCapitalBackyard, grassB: grassCapitalMeadow };
  const A = clampSide(f.a), B = clampSide(f.b);
  return { ...art, grassA: a, grassB: b, grassMix: { mix: clampMix(f.mix), px: [256 * A.scale, 256 * B.scale], stamp: f.stamp } };
}
