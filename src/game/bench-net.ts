// The benchmark's road network: a street grid (40 tiles apart) with avenues and boulevards, and junction types at the big
// crossings. Pure TS, no DOM and no engine imports: the in-game benchmark, the sim gate and the tests share it.
import { MAP } from './iso';
import { CLASS, type NodeType } from './network';
import type { NetEditor } from './netops';

/** the grid's spacing and margin, tiles; the bench lines per side of the full map */
export const GRID = 40, M0 = 96;

/** the lines per side and their positions for a size (the fraction of the full grid; 1 = everything) */
export function benchLayout(size = 1): { lines: number; at: (k: number) => number; last: number } {
  const LINES = Math.floor((MAP - 2 * M0) / GRID) + 1;
  const lines = Math.max(3, Math.round(LINES * Math.sqrt(size))), at = (k: number) => M0 + k * GRID;
  return { lines, at, last: at(lines - 1) };
}

/** the bench roads through the editor: every 15th line a boulevard, every 5th an avenue, the rest streets; then a junction at every
 *  5th crossing (plain at the boulevards' crossings, a roundabout where (a + b) is a multiple of 10, else signals). Commits in full. */
export function benchNetwork(e: NetEditor, size = 1): void {
  const { lines, at, last } = benchLayout(size);
  const clsOf = (k: number) => (k % 15 === 0 ? CLASS.boulevard : k % 5 === 0 ? CLASS.avenue : CLASS.street);
  for (let k = 0; k < lines; k++) {
    e.addLegs([{ a: { x: M0, y: at(k) }, b: { x: last, y: at(k) } }], clsOf(k), 0);
    e.addLegs([{ a: { x: at(k), y: M0 }, b: { x: at(k), y: last } }], clsOf(k), 0);
  }
  e.net.rebuild(true);
  for (let a = 0; a < lines; a++) for (let b = 0; b < lines; b++) {
    const big = a % 5 === 0 && b % 5 === 0; if (!big) continue;
    const n = e.net.nodeAt({ x: at(a), y: at(b) }); if (!n) continue;
    const type: NodeType = a % 15 === 0 && b % 15 === 0 ? 'plain' : (a + b) % 10 === 0 ? 'roundabout' : 'signal';
    if (type !== 'plain') e.setNodeType(n, type);
  }
  e.commit(true);
}
