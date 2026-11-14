// The draw order of the painted areas and the course chunks on the ground (renderer drawPaints, the planner's map, the grass shine mask, the soft bands): a pure function of
// the patches, so a test can check it. #1298 (the owner, 2026-11-14: "when i paint there [on the driving range] it doesnt show above the fairway grass"): the course's cells (what the
// Texture Painter lays) are drawn under every painted area, as the old Paint tool's areas were the decals on top; the driving range's own ground (its outfield, bare or grassed) and the
// practice area's starter set were laid as painted areas too, so they were drawn over what the player painted. The ground the game lays UNDER what the player paints is flagged
// (PatchPaint.u) and drawn first, under the course. Pure TS, no DOM.
import type { LotPatch } from './ground-protocol';

/** a painted area's or course chunk's tier in the draw order: 0 an area under the course (PatchPaint.u: the range's outfield, the practice area's starter set), 1 the course (every
 *  chunk of it: side by side, in one pass), 2 the painted areas over it (the range's tee box, mats and target greens, the player's own areas) */
export const paintTier = (p: LotPatch): 0 | 1 | 2 => (p.course ? 1 : p.paint?.u ? 0 : 2);
/** the order of two painted areas or course chunks, for a sort: by tier, then (areas) by z, the course's chunks equal */
export const paintOrder = (a: LotPatch, b: LotPatch): number => paintTier(a) - paintTier(b) || (a.course || !a.paint || !b.paint ? 0 : a.paint.z - b.paint.z);
/** the soft bands' rank of the course (tier 2 of the soft-edge order, a z below every painted area's) */
export const COURSE_RANK: readonly [number, number, number] = [2, -1e300, 0];
/** a painted area's or course chunk's rank for the soft bands (renderer rankOf: lawns [0, ...], lot ground [1, ...], these [2, ...], car parks [3, ...]); an area under the course
 *  ranks below the course (-Infinity), the others above it by their z */
export const paintRank = (p: LotPatch): [number, number, number] => (p.course ? [COURSE_RANK[0], COURSE_RANK[1], COURSE_RANK[2]] : p.paint?.u ? [2, -Infinity, p.paint.z] : [2, p.paint?.z ?? 0, 0]);
