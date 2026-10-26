/** World units are tiles (2 m). At zoom 1 a tile is a 128x64 px diamond (the town builder's native scale). */
export const TW = 128;
export const TH = 64;
export const HW = 64;
export const HH = 32;
/** tiles per side of the map: 4 x 4 km */
export const MAP = 2048;
/** simulation / content cells (tiles per side) */
export const CELL = 64;
/** The builder's 30% zoom is the closest the game camera gets. */
export const ZOOM_MAX = 0.3;
/** one zoom step: a zoom button press or a + / - key (the wheel zooms smoothly, about 1.15 a notch) */
export const ZOOM_STEP = 1.25;
/** The furthest zoom: one ZOOM_STEP closer than the old 0.006 (T153, #327; the owner, 2026-10-26: "remove the final furthest zoom out
 *  level"). The 4 km map is then 1966 CSS px wide and 983 tall. FAR's tile set is native here (painted-tiles.json anchors.far). */
export const ZOOM_MIN = 0.0075;
/** a camera zoom held to the game's range (a save, a jump or a key; a zoom that is no number: the closest zoom) */
export const clampZoom = (z: number): number => (Number.isFinite(z) ? Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z)) : ZOOM_MAX);
/** zoom tiers (CSS zoom): below DISTRICT_Z small props are culled, below PLANNER_Z the planner map replaces the art */
export const DISTRICT_Z = 0.12;
export const PLANNER_Z = 0.035;
/** cache resolutions (px per world px) for the baked ground chunks */
export const LEVELS = [0.6, 0.45, 0.3, 0.2, 0.15, 0.1, 0.07];
/** ground chunk size in world px (at zoom 1); sprite draw tiles use the same grid */
export const CHUNK_W = 2000;
export const CHUNK_H = 1000;
/** planner chunks: 8 x 8 ground chunks each, baked with a simplified painter */
export const PLAN_K = 8;
export const PLAN_W = CHUNK_W * PLAN_K;
export const PLAN_H = CHUNK_H * PLAN_K;
export const PLAN_LEVELS = [0.06, 0.03, 0.015];
/** district chunks (below 10% effective zoom): 4 x 4 ground chunks, baked without the fine litter and slab sprites */
export const MID_K = 4;
export const MID_W = CHUNK_W * MID_K;
export const MID_H = CHUNK_H * MID_K;
export const MID_LEVELS = [0.14, 0.1, 0.07, 0.05, 0.035];
/** below this CSS zoom the district chunks replace the full ground chunks (whatever the screen density) */
export const MID_BELOW = 0.1;
/** sprite draw tiles (world px): each keeps its own painter's order and clips its instances to its rectangle */
export const SPR_W = 4000;
export const SPR_H = 2000;

export const worldX = (x: number, y: number) => (x - y) * HW;
export const worldY = (x: number, y: number) => (x + y) * HH;
export function tileOf(X: number, Y: number) {
  const a = X / HW, b = Y / HH;
  return { x: (a + b) / 2, y: (b - a) / 2 };
}
export function levelFor(z: number) {
  for (let i = LEVELS.length - 1; i >= 0; i--) if (z <= LEVELS[i] + 1e-9) return LEVELS[i];
  return LEVELS[0];
}
export function midLevelFor(z: number) {
  for (let i = MID_LEVELS.length - 1; i >= 0; i--) if (z <= MID_LEVELS[i] + 1e-9) return MID_LEVELS[i];
  return MID_LEVELS[0];
}
export function planLevelFor(z: number) {
  for (let i = PLAN_LEVELS.length - 1; i >= 0; i--) if (z <= PLAN_LEVELS[i] + 1e-9) return PLAN_LEVELS[i];
  return PLAN_LEVELS[0];
}
export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export function mulberry(seed: number) {
  let s = seed >>> 0;
  return () => {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
