import far from '../assets/ground/painted/grass-painted-8m-far-v3.png';
import mid from '../assets/ground/painted/grass-painted-8m-mid-v3.png';
import near from '../assets/ground/painted/grass-painted-8m-near-v3.png';
import type { PaintedGrassFamily } from './painted-grass-lod';

/** Reviewed v3 paintings: each source patch covers8m; a shared translation-only48m composite removes obvious repetition. */
export const PAINTED_GRASS: Readonly<Record<string, PaintedGrassFamily>> = {
  grass: { far, mid, near, sourceWorldMetres: 8 },
};
