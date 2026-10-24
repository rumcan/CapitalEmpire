// Forest planting on the hills: pure TypeScript (no DOM, no library import), so the tests can run it in Node.
import { MAP, mulberry } from './iso';
import { fbm, hash2, smoothstep, type Noise } from './terrain/noise';
import { TC, sampleField } from './terrain/types';
import { OWNER_SCALE } from './lots/scales';

/** tiles per forest cell: the engine plants the trees of one cell at a time, as the camera reaches it */
export const FOREST_CELL = 64;
/** one species of the tree pools: its library ids (the four views of a generated tree, the foliage stages of a capital tree, the numbered
 *  pictures of an old one), dealt evenly; w, its share among the species of its pool; dead, a dead snag (the woods only, never the town) */
export interface TreeSpecies { name: string; ids: readonly string[]; w: number; dead?: true }
const views = (s: string) => ['ne', 'se', 'sw', 'nw'].map(d => `gen:tree-${s}:${d}`);
const stages = (s: string) => ['open', 'moderate', 'patchy', 'near-bare'].map(k => `capital:tree-${s}-${k}`);
/** the conifers: every pine, spruce and fir of the library (the owner, 2026-10-24: "it's not using all the trees in the generating") */
export const FOREST_CONIFERS: readonly TreeSpecies[] = [
  { name: 'pine', ids: stages('pine'), w: 1 },
  { name: 'spruce', ids: stages('spruce'), w: 1 },
  { name: 'old pine', ids: ['world:tree_pine_0', 'world:tree_pine_1', 'world:tree_pine_2'], w: 1 },
  { name: 'blue spruce', ids: ['ref:tree-spruce-blue'], w: 0.5 },
  { name: 'young spruce', ids: views('spruce-young'), w: 1 },
  { name: 'tall fir', ids: views('fir-tall'), w: 1 },
];
/** the broadleaf trees: every maple, oak, birch and aspen of the library, and the dead snags (rare, the woods only) */
export const FOREST_BROADLEAF: readonly TreeSpecies[] = [
  { name: 'maple', ids: stages('maple'), w: 1 },
  { name: 'birch', ids: stages('birch'), w: 1 },
  { name: 'oak', ids: stages('oak'), w: 1 },
  { name: 'old oak', ids: ['world:tree_oak_0', 'world:tree_oak_1', 'world:tree_oak_2'], w: 1 },
  { name: 'crimson maple', ids: ['ref:tree-maple-crimson'], w: 0.5 },
  { name: 'gold birch', ids: ['ref:tree-birch-gold'], w: 0.5 },
  { name: 'scarlet maple', ids: views('maple-scarlet'), w: 1 },
  { name: 'amber oak', ids: views('oak-amber'), w: 1 },
  { name: 'young aspen', ids: views('aspen-young'), w: 1 },
  { name: 'crimson oak', ids: views('oak-crimson'), w: 1 },
  { name: 'ember maple', ids: views('maple-ember'), w: 1 },
  { name: 'dead snag', ids: ['world:tree_dead_0', 'world:tree_dead_1', 'world:tree_dead_2'], w: 0.25, dead: true },
];
/** every library id the pools can deal (the tests hold it to the library's trees) */
export const TREE_POOL_IDS: readonly string[] = [...FOREST_CONIFERS, ...FOREST_BROADLEAF].flatMap(s => s.ids);
/** the conifer ids (the conifer share of a stand counts these) */
export const CONIFER_IDS: ReadonlySet<string> = new Set(FOREST_CONIFERS.flatMap(s => s.ids));

/** a weighted deal over species: each id carries its species' weight shared evenly among the species' ids */
export interface TreeDeal { ids: string[]; cum: number[] }
/** the deal of a list of species (the dead snags left out when live): ids and their cumulative weights, normalised to end at 1 */
export function treeDeal(species: readonly TreeSpecies[], live = false): TreeDeal {
  const ids: string[] = [], cum: number[] = []; let acc = 0;
  for (const s of species) { if (live && s.dead) continue; for (const id of s.ids) { acc += s.w / s.ids.length; ids.push(id); cum.push(acc); } }
  return { ids, cum: cum.map(c => c / acc) };
}
/** the id a uniform u in [0, 1) deals (deterministic: the same u, the same tree) */
export function dealTree(d: TreeDeal, u: number): string {
  let lo = 0, hi = d.ids.length - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (u < d.cum[mid]!) hi = mid; else lo = mid + 1; }
  return d.ids[lo]!;
}
/** the deals of the woods: every conifer, every broadleaf tree with the snags */
export const FOREST_CONIFER_DEAL = treeDeal(FOREST_CONIFERS), FOREST_BROAD_DEAL = treeDeal(FOREST_BROADLEAF);
/** the deals of the trees beside the town and the course (towntrees.ts, golf/dressing.ts): every live tree, no dead snags */
export const LIVE_CONIFER_DEAL = treeDeal(FOREST_CONIFERS, true), LIVE_BROAD_DEAL = treeDeal(FOREST_BROADLEAF, true);
/** a tree's size at owner scale (lots/scales.ts OWNER_SCALE: the size the owner set in the studio; 1, the art's own size, when unset) */
export const ownerSize = (id: string) => (OWNER_SCALE as Record<string, number>)[id] ?? 1;
/** the woods' trees stand at this share of their owner size (about the size the forest drew its old trees at), times 0.82..1.18 */
export const FOREST_SIZE = 0.55;
/** one planted tree: x, y is its ground point in tiles, id a library id, scale and flip as for a prop */
export interface ForestTree { x: number; y: number; id: string; scale: number; flip: boolean }

/** spacing of the jittered global grid, in tiles */
const S = 2.4;

/** the conifer share at tile (x, y) from the clearing noise at a coarser scale and an offset (stands about 300 m across): 0.08 in the broadleaf woods, up to 0.9 inside a stand */
export function conifer(clearing: Noise, x: number, y: number): number {
  return 0.08 + 0.82 * smoothstep(0.05, 0.3, fbm(clearing, x / 150 + 71.3, y / 150 - 23.9, 3));
}

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
      const h = sampleField(height, x, y), pc = Math.max(0.08 + 0.85 * smoothstep(150, 400, h), conifer(clearing, x, y));
      const id = dealTree(r() < pc ? FOREST_CONIFER_DEAL : FOREST_BROAD_DEAL, r());
      const scale = ownerSize(id) * FOREST_SIZE * (0.82 + r() * 0.36), flip = r() < 0.5;
      out.push({ x, y, id, scale, flip });
    }
  }
  return out;
}
