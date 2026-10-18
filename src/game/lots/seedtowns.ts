// The street grid of a town built at once (Phase 5 step 1b): a square lattice of BLOCK-tile blocks around a centre, the legs
// laid only where the ground takes a road. Pure TS, no DOM.
import { CLASS, type ClassId, type Leg, type Pt } from '../network';
import { BLOCK } from './roads';
import { TC } from '../terrain/types';

/** the blocks a town grid spans each way (even: the two middle lines are avenues) */
export const TOWN_BLOCKS = 6;

/** true if every tile along the leg a-b (one sample per tile, at 0 and +-hw across) is GROUND or PATCH; a and b are axis aligned */
function landOk(a: Pt, b: Pt, hw: number, classAt: (x: number, y: number) => number): boolean {
  const vert = a.x === b.x, L = vert ? b.y - a.y : b.x - a.x;
  for (let t = 0; t <= L; t++) for (const o of [-hw, 0, hw]) {
    const tc = vert ? classAt(Math.floor(a.x + o), Math.floor(a.y + t)) : classAt(Math.floor(a.x + t), Math.floor(a.y + o));
    if (tc !== TC.GROUND && tc !== TC.PATCH) return false;
  }
  return true;
}

/** a town grid of n blocks each way around c (tiles): the lines i = 0..n (vertical) and j = 0..n (horizontal), each cut into its
 *  n block-edge legs; a leg is kept only if its ground is GROUND or PATCH across its verges. The two middle lines are avenues, the
 *  rest streets. classAt(x, y) is the terrain class of the tile with integer coordinates x, y. Returns the kept legs and their class. */
export function townGrid(c: Pt, n: number, classAt: (x: number, y: number) => number): { legs: Leg[]; cls: ClassId[] } {
  const x0 = Math.round((c.x - n * BLOCK / 2) / BLOCK) * BLOCK, y0 = Math.round((c.y - n * BLOCK / 2) / BLOCK) * BLOCK;
  const mid = n / 2, legs: Leg[] = [], cls: ClassId[] = [];
  for (let i = 0; i <= n; i++) for (let j = 0; j < n; j++) {
    const id: ClassId = i === mid ? 'avenue' : 'street', x = x0 + i * BLOCK, y = y0 + j * BLOCK;
    const a = { x, y }, b = { x, y: y + BLOCK };
    if (landOk(a, b, CLASS[id].h + CLASS[id].walk, classAt)) { legs.push({ a, b }); cls.push(id); }
  }
  for (let j = 0; j <= n; j++) for (let i = 0; i < n; i++) {
    const id: ClassId = j === mid ? 'avenue' : 'street', x = x0 + i * BLOCK, y = y0 + j * BLOCK;
    const a = { x, y }, b = { x: x + BLOCK, y };
    if (landOk(a, b, CLASS[id].h + CLASS[id].walk, classAt)) { legs.push({ a, b }); cls.push(id); }
  }
  return { legs, cls };
}
