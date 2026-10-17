/** World units are tiles (2 m). At zoom 1 a tile is a 128x64 px diamond (the town builder's native scale). */
export const TW = 128;
export const TH = 64;
export const HW = 64;
export const HH = 32;
/** tiles per side of the map */
export const MAP = 160;
/** The builder's 30% zoom is the closest the game camera gets. */
export const ZOOM_MAX = 0.3;
export const ZOOM_MIN = 0.07;
/** cache resolutions (px per world px) for the baked ground chunks */
export const LEVELS = [0.6, 0.45, 0.3, 0.2, 0.15, 0.1];
/** ground chunk size in world px (at zoom 1) */
export const CHUNK_W = 2000;
export const CHUNK_H = 1000;

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
