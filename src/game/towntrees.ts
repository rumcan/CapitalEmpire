// Trees in the town: the free ground between the lots, on the verges and the town edges. Pure TypeScript (no DOM), so the tests can run it in Node.
import { MAP, mulberry } from './iso';
import { fbm, hash2, type Noise } from './terrain/noise';
import { TC } from './terrain/types';
import { FOREST_BROADLEAF, FOREST_CELL, FOREST_CONIFERS, dealTree, ownerSize, treeDeal, type ForestTree } from './forest';

/** spacing of the jittered global grid of the town trees, in tiles */
export const TOWN_TREE_S = 4.5;
const S = TOWN_TREE_S;
/** the clearance a town tree needs from the roads, lots and the rest, in tiles (its trunk and footprint) */
const CLEAR = 1.6;
/** the town trees' deals: every live tree of the forest pools (no dead snags beside the lots) */
export const TOWN_CONIFER_DEAL = treeDeal(FOREST_CONIFERS, true), TOWN_BROAD_DEAL = treeDeal(FOREST_BROADLEAF, true);

/** the town trees of cell (ci, cj): a pure function of the seed, the terrain, the clump noise and the predicates, so cells plant in any order and never overlap.
 *  A point is kept when it is in a town (near), on GROUND or PATCH, and free of the roads and lots (free, with CLEAR tiles); clumps keep most of their points and the open lawn some */
export function townTreeCell(seed: number, cls: Uint8Array, clump: Noise, ci: number, cj: number, free: (x: number, y: number, r: number) => boolean, near: (x: number, y: number) => boolean): ForestTree[] {
  const out: ForestTree[] = [];
  for (let gx = Math.floor(ci * FOREST_CELL / S) - 1; gx <= Math.ceil((ci + 1) * FOREST_CELL / S) + 1; gx++) {
    for (let gy = Math.floor(cj * FOREST_CELL / S) - 1; gy <= Math.ceil((cj + 1) * FOREST_CELL / S) + 1; gy++) {
      const bx = (gx + 0.5) * S, by = (gy + 0.5) * S;
      if (Math.floor(bx / FOREST_CELL) !== ci || Math.floor(by / FOREST_CELL) !== cj) continue;
      const r = mulberry(hash2(hash2(seed ^ 0x7a11, gx), gy));
      const x = bx + (r() - 0.5) * 0.9 * S, y = by + (r() - 0.5) * 0.9 * S;
      if (x < 1 || y < 1 || x >= MAP - 1 || y >= MAP - 1) continue;
      const c = cls[Math.floor(y) * MAP + Math.floor(x)];
      if (c !== TC.GROUND && c !== TC.PATCH) continue;
      if (!near(x, y) || !free(x, y, CLEAR)) continue;
      const clumped = fbm(clump, x / 20, y / 20, 2) > 0.1;
      if (r() >= (clumped ? 0.85 : 0.35)) continue;
      const id = dealTree(r() < 0.2 ? TOWN_CONIFER_DEAL : TOWN_BROAD_DEAL, r());
      const scale = ownerSize(id) * (0.9 + r() * 0.2), flip = r() < 0.5;
      out.push({ x, y, id, scale, flip });
    }
  }
  return out;
}
