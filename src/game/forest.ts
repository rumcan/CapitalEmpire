// Forest planting on the hills: pure TypeScript (no DOM, no library import), so the tests can run it in Node.
import { MAP, mulberry } from './iso';
import { fbm, hash2, smoothstep, type Noise } from './terrain/noise';
import { TC, sampleField } from './terrain/types';

/** tiles per forest cell: the engine plants the trees of one cell at a time, as the camera reaches it */
export const FOREST_CELL = 64;
/** library ids of the forest trees */
export const FOREST_BROAD = ['ref:tree-maple-crimson', 'world:tree_oak_0', 'world:tree_oak_1', 'world:tree_oak_2', 'ref:tree-birch-gold'];
const BROAD_W = [0.4, 0.15, 0.15, 0.15, 0.15];
/** library ids of the conifers */
export const FOREST_CONIFER = ['world:tree_pine_0', 'world:tree_pine_1', 'ref:tree-spruce-blue'];
/** one planted tree: x, y is its ground point in tiles, id a library id, scale and flip as for a prop */
export interface ForestTree { x: number; y: number; id: string; scale: number; flip: boolean }

/** spacing of the jittered global grid, in tiles */
const S = 2.4;

/** the trees of cell (ci, cj): a pure function of the seed, terrain and clearing noise, so cells plant in any order and never overlap */
export function forestCell(seed: number, cls: Uint8Array, height: Float32Array, slope: Float32Array, clearing: Noise, ci: number, cj: number): ForestTree[] {
  const out: ForestTree[] = [];
  const hill = (x: number, y: number) => x >= 0 && y >= 0 && x < MAP && y < MAP && cls[y * MAP + x] === TC.HILL;
  for (let gx = Math.floor(ci * FOREST_CELL / S) - 1; gx <= Math.ceil((ci + 1) * FOREST_CELL / S) + 1; gx++) {
    for (let gy = Math.floor(cj * FOREST_CELL / S) - 1; gy <= Math.ceil((cj + 1) * FOREST_CELL / S) + 1; gy++) {
      const bx = (gx + 0.5) * S, by = (gy + 0.5) * S;
      if (Math.floor(bx / FOREST_CELL) !== ci || Math.floor(by / FOREST_CELL) !== cj) continue;
      const r = mulberry(hash2(hash2(seed, gx), gy));
      const x = bx + (r() - 0.5) * 0.9 * S, y = by + (r() - 0.5) * 0.9 * S;
      if (x < 1 || y < 1 || x >= MAP - 1 || y >= MAP - 1 || cls[Math.floor(y) * MAP + Math.floor(x)] !== TC.HILL) continue;
      const s = sampleField(slope, x, y);
      if (s > 1.5) continue;
      if (s > 1.15 && r() < (s - 1.15) / 0.35) continue;
      if (fbm(clearing, x / 48, y / 48, 3) < -0.32) continue;
      const fx = Math.floor(x), fy = Math.floor(y);
      if ((!hill(fx + 2, fy) || !hill(fx - 2, fy) || !hill(fx, fy + 2) || !hill(fx, fy - 2)) && r() < 0.3) continue;
      const h = sampleField(height, x, y), pc = 0.08 + 0.85 * smoothstep(150, 400, h);
      let id: string;
      if (r() < pc) id = FOREST_CONIFER[Math.floor(r() * 3)];
      else {
        const u = r(); let acc = 0, k = 0;
        for (; k < BROAD_W.length - 1; k++) { acc += BROAD_W[k]; if (u < acc) break; }
        id = FOREST_BROAD[k];
      }
      const scale = 1.05 + r() * 0.45, flip = r() < 0.5;
      out.push({ x, y, id, scale, flip });
    }
  }
  return out;
}
