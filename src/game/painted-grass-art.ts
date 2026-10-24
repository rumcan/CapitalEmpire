import far from '../assets/ground/painted/grass-painted-8m-far-v1.png';
import mid from '../assets/ground/painted/grass-painted-8m-mid-v1.png';
import near from '../assets/ground/painted/grass-painted-8m-near-v1.png';
import type { PaintedGrassFamily } from './painted-grass-lod';

/** Functional-preview family only: v1's repeated diagonal motif was rejected for final art; replace with reviewed v2 before root delivery. */
export const PAINTED_GRASS: Readonly<Record<string, PaintedGrassFamily>> = {
  grass: { far, mid, near, worldMetres: 8 },
};
