// T381 (#1037, the owner, 2026-11-08: "I wanted to bulldoze some trees but I could not." / "tried the Rub out button on paint for trees and it does nothing."):
// the trees the map plants by itself (the forest, the river belts of T265, the town's street trees, and the trees along the roads) are not props, so the
// Rub out brush (which takes the props a plant brush placed) and the bulldozer (which picks props) never saw them. Each of them stands where its cell's grid
// puts it, the same every time the cell is planted (forest.ts forestCell, river-trees.ts riverBeltCell, towntrees.ts townTreeCell: pure functions of the
// seed), so a tree taken away is remembered by its place: its key. A cell planted again (the camera reaching it, something built beside it, the river belts
// switched) leaves the cut ones out (TreeCut.keep), the save keeps the list, and undo takes a key off it. Pure TS, no DOM; tiles of 2 m.

/** a tree's key: its place to 1/64 of a tile, packed (the map is under 4096 tiles a side: x * 64 < 2^18) */
const ROW = 262144, UNIT = 64;
export const treeKey = (x: number, y: number): number => Math.round(x * UNIT) * ROW + Math.round(y * UNIT);
/** the place a key stands for (tiles) */
export const keyPos = (k: number): { x: number; y: number } => ({ x: Math.floor(k / ROW) / UNIT, y: (k % ROW) / UNIT });

/** a tree taken away, as undo and redo keep it: its key (its source place), the cell it stood in (cj * N + ci) and the store it was in (the town's trees or
 *  the forest's, with the river belts at the tail of the forest's list). Undo drops the cells round it and they plant it again (nothing else is kept) */
export interface TreeRec { k: number; cell: number; town: boolean }

/** the trees taken away (by the Rub out brush and the bulldozer), for good until undone: the keys of the forest's, the belts' and the town's trees (one
 *  set: their places never meet), and the keys of the road network's own trees (AutoProp: the median, street and roundabout trees, which the network
 *  makes again after every rebuild) */
export class TreeCut {
  private keys = new Set<number>();
  private auto = new Set<string>();
  /** how many trees are taken away */
  get size(): number { return this.keys.size + this.auto.size; }
  /** whether the tree at key k is taken away */
  has(k: number): boolean { return this.keys.has(k); }
  /** takes key k away; false when it was already */
  add(k: number): boolean { if (this.keys.has(k)) return false; this.keys.add(k); return true; }
  /** gives key k back; false when it was not taken */
  remove(k: number): boolean { return this.keys.delete(k); }
  /** the same for a road tree's key (AutoProp: kind@x,y) */
  hasAuto(a: string): boolean { return this.auto.has(a); }
  addAuto(a: string): boolean { if (this.auto.has(a)) return false; this.auto.add(a); return true; }
  removeAuto(a: string): boolean { return this.auto.delete(a); }
  /** the trees of a planted cell (anything with a source place x, y) without the taken ones: the same array when none is taken */
  keep<T extends { x: number; y: number }>(trees: T[]): T[] {
    if (!this.keys.size) return trees;
    let n = 0; for (const t of trees) if (this.keys.has(treeKey(t.x, t.y))) n++;
    return n ? trees.filter(t => !this.keys.has(treeKey(t.x, t.y))) : trees;
  }
  /** forgets every tree taken away (a new game) */
  clear(): void { this.keys.clear(); this.auto.clear(); }
  /** the save: the keys sorted (a steady file), the road trees' keys sorted; undefined with none */
  save(): TreeCutSave | undefined {
    if (!this.size) return undefined;
    const s: TreeCutSave = {};
    if (this.keys.size) s.trees = [...this.keys].sort((a, b) => a - b);
    if (this.auto.size) s.auto = [...this.auto].sort();
    return s;
  }
  /** the taken trees from a save (junk dropped: a key must be a whole number inside the map, a road key a short string) */
  load(s: TreeCutSave | undefined): void {
    this.clear();
    if (!s) return;
    if (Array.isArray(s.trees)) for (const k of s.trees) if (Number.isSafeInteger(k) && k >= 0 && k < ROW * ROW) this.keys.add(k);
    if (Array.isArray(s.auto)) for (const a of s.auto) if (typeof a === 'string' && a.length > 0 && a.length < 48) this.auto.add(a);
  }
}
/** the taken trees as the save keeps them */
export interface TreeCutSave { trees?: number[]; auto?: string[] }

/** what the bulldozer's blade takes at each pointer position: the trees whose place is within this many tiles of the pointer (a drag sweeps them; a
 *  click takes the one tree under the pointer) */
export const BLADE_R = 1.6;
