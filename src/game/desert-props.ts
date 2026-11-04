// The desert and oasis props (T289, #874: the owner's sheets in F:/Art/newArt, cut by scripts/assets/prep-desert-props.mjs, packed by
// prep-new-props.mjs): their pools by type, and the scatter that dresses desert ground with them (the desert start's outfield, golf/rangebiz.ts).
// Each is one picture, painted with the sun at the upper right: never mirrored. A prop the owner removed in the studio is in no pool.
// Pure TS, no DOM.
import { DESERT_PROP_IDS } from './new-props-library';
import { REMOVED_IDS } from './lots/scales';

/** a desert prop's type, as prep-desert-props.mjs's manifest names it */
export type DesertType = 'palm' | 'tree' | 'cactus' | 'shrub' | 'grass' | 'reed' | 'rock' | 'wood' | 'water' | 'lily';
const removed = new Set(REMOVED_IDS);
/** the desert props of each type (library ids), the removed ones left out */
export const DESERT: Readonly<Record<DesertType, readonly string[]>> = Object.fromEntries(
  (['palm', 'tree', 'cactus', 'shrub', 'grass', 'reed', 'rock', 'wood', 'water', 'lily'] as const).map(t => [t, (DESERT_PROP_IDS[t] ?? []).filter(id => !removed.has(id))]),
) as unknown as Record<DesertType, readonly string[]>;
/** every desert prop id */
export const DESERT_IDS: readonly string[] = Object.values(DESERT).flat();

/** the dry desert's mix (the share of each type in open desert): scrub and grass tufts most, cacti and rocks, a dead branch, now and then a tree */
export const DRY_MIX: Readonly<Partial<Record<DesertType, number>>> = { shrub: 5, grass: 4, cactus: 3, rock: 3, wood: 1, tree: 0.35 };

/** a placed desert prop: its id and its spot (the caller's frame) */
export interface DesertSpot { id: string; u: number; v: number }

/** a small seeded random (mulberry32) */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** a type drawn by its weight in a mix */
function drawType(mix: Readonly<Partial<Record<DesertType, number>>>, r: number): DesertType {
  const e = (Object.entries(mix) as [DesertType, number][]).filter(([t, w]) => w > 0 && DESERT[t].length);
  let x = r * e.reduce((s, [, w]) => s + w, 0);
  for (const [t, w] of e) { x -= w; if (x < 0) return t; }
  return e[e.length - 1]![0];
}

/** desert props scattered over a box (u0..u1 x v0..v1, the caller's frame) on a jittered grid of cells `cell` across, each cell taking one with
 *  the chance `fill`; a spot `ok` refuses (a green, a marker, a path) is left empty. The same seed lays the same props. No picture repeats among the
 *  last `fresh` drawn, so no two alike stand side by side */
export function desertScatter(seed: number, box: readonly [number, number, number, number], cell: number, fill: number, ok: (u: number, v: number) => boolean,
  mix: Readonly<Partial<Record<DesertType, number>>> = DRY_MIX, fresh = 8): DesertSpot[] {
  const r = rng(seed), out: DesertSpot[] = [], recent: string[] = [];
  const [u0, u1, v0, v1] = box;
  for (let v = v0; v + cell <= v1 + 1e-9; v += cell) for (let u = u0; u + cell <= u1 + 1e-9; u += cell) {
    const pu = u + (0.15 + 0.7 * r()) * cell, pv = v + (0.15 + 0.7 * r()) * cell, take = r() < fill, tr = r(), pr = r();
    if (!take || !ok(pu, pv)) continue;
    const pool = DESERT[drawType(mix, tr)], fresher = pool.filter(id => !recent.includes(id)), from = fresher.length ? fresher : pool;
    const id = from[Math.floor(pr * from.length)]!;
    out.push({ id, u: pu, v: pv }); recent.push(id); if (recent.length > fresh) recent.shift();
  }
  return out;
}
