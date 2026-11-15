// #1302 (the owner, 2026-11-15, a green painted on the desert outfield: "drew a green on the range but the rocks stayed and i cant bulldoze them ... drawing texture on
// the range should auto bulldoze rocks and plants and props but you can still put props down"): what a change of the course grid laid ground under. The Texture
// Painter's stroke (or shape) is one merged GridDiff when it is done (paint-tool.ts commit); a piece standing on a cell it laid a surface on goes, as the bulldozer
// would take it: the range's own desert plants and rocks (rangebiz.ts rangeScene's `desert<i>` and `oasis<i>`, kept gone by RangeBizSave.cleared) and the player's
// props on the range's plot. A rub out lays none (its cells go to no surface), so it takes nothing. Pure: no DOM, no engine.
import { CELL_T, type GridDiff } from '../ext/course-grid';
import { CLEARABLE_KEY } from './rangesave';

/** how far round a piece's foot a laid cell still counts as under it (tiles): its foot's spread, so a rock half on the paint goes too */
export const FOOT_R = 0.4;

/** the cells (d's own indices: x0, y0 and w are its frame) a grid change laid a surface on; null: none (a rub out, nothing changed) */
export function laidCells(d: GridDiff): Set<number> | null {
  let out: Set<number> | null = null;
  for (let k = 0; k < d.n; k++) if (d.s1[k] !== 0) (out ??= new Set()).add(d.idx[k]!);
  return out;
}

/** whether the foot at tile point (x, y) stands on a cell the change d laid (laid: laidCells(d)): its middle or a point FOOT_R from it each way */
export function laidAt(d: GridDiff, laid: ReadonlySet<number>, x: number, y: number, r = FOOT_R): boolean {
  for (const [ox, oy] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]] as const) {
    const cx = Math.floor((x + ox - d.x0) / CELL_T), cy = Math.floor((y + oy - d.y0) / CELL_T);
    if (cx >= 0 && cx < d.w && cy >= 0 && laid.has(cy * d.w + cx)) return true;
  }
  return false;
}

/** the range scene's natural pieces (their keys: CLEARABLE_KEY) the change d laid ground under */
export function scatterUnder(pieces: readonly { key: string; x: number; y: number }[], d: GridDiff): string[] {
  const laid = laidCells(d); if (!laid) return [];
  return pieces.filter(p => CLEARABLE_KEY.test(p.key) && laidAt(d, laid, p.x, p.y)).map(p => p.key);
}

/** a natural piece's name in a sentence ("Removed the yellow desert broom"): its picture's name, lower case */
export const scatterName = (it: { name: string }): string => it.name.toLowerCase();

/** several steps aside as one (null: none): undone last first, redone in order */
export function joinAside<T extends { undo(): void; redo(): void }>(list: readonly (T | null | undefined)[]): { undo(): void; redo(): void } | null {
  const xs = list.filter((a): a is T => !!a); if (!xs.length) return null; if (xs.length === 1) return xs[0]!;
  return { undo: () => { for (let i = xs.length - 1; i >= 0; i--) xs[i]!.undo(); }, redo: () => { for (const a of xs) a.redo(); } };
}
