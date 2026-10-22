// The town's lawns (the owner, 2026-10-22: "each lot picks one of the preset grasses, and any road enclosed space some preset grass, so the
// town gets more natural lawns"): each house lot's yard is one of the owner's lawn presets (paint-presets.ts `lawn`), the whole lot, its mow
// lines along the street or across it; each road block's grass is one of them in soft patches over the map grass. Picked from the lot's or
// the block's key, so they stay put. Pure: the engine sends the patches (a lot's ground, 'lawn:' + block key); the renderer draws them
// under the lots' own ground (drawLawns).
import type { Block } from './blocks';
import type { LotPatch } from './ground-protocol';
import { PRESETS, presetTex } from './paint-presets';

/** the presets the lawns use (the owner's Use on lawns switch) */
export const LAWN_IDS: string[] = PRESETS.filter(p => p.lawn).map(p => p.id);
/** a road block's grass: how much of the block it covers, the patches' soft edge and their size (1 = 24 tiles a period) */
export const BLOCK_LAWN = { share: 0.55, soft: 0.15, patch: 2.5 };

/** 32-bit FNV-1a hash of a string */
const fnv = (s: string) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; };

/** a lot's lawn: the whole lot (o + u * w across the front, n * d deep) in a lawn preset picked by its key, its mow lines along the
 *  street or across it; null with no lawn presets */
export function lotLawn(key: string, g: { o: { x: number; y: number }; u: { x: number; y: number }; n: { x: number; y: number }; w: number; d: number }, ids = LAWN_IDS): LotPatch | null {
  if (!ids.length) return null;
  const h = fnv(key), { o, u, n, w, d } = g;
  const pts = [o.x, o.y, o.x + u.x * w, o.y + u.y * w, o.x + u.x * w + n.x * d, o.y + u.y * w + n.y * d, o.x + n.x * d, o.y + n.y * d];
  const a = Math.atan2(u.y, u.x) * 180 / Math.PI + (h & 1 ? 90 : 0);
  return { pts, tex: presetTex(ids[(h >>> 1) % ids.length]!), lawn: { a, share: 1, soft: 0.1, patch: 1, z: 1 } };
}

/** a road block's grass: the block in a lawn preset picked by its key, in soft patches over the map grass; null with no lawn presets */
export function blockLawn(b: Block, ids = LAWN_IDS): LotPatch | null {
  if (!ids.length) return null;
  const h = fnv(b.key);
  return { pts: b.pts.slice(), tex: presetTex(ids[h % ids.length]!), lawn: { a: ((h >>> 8) & 3) * 45, ...BLOCK_LAWN, z: 0 } };
}
