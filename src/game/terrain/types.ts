import { MAP, clamp } from '../iso';

/** terrain classes, one per 2 m tile: GROUND and PATCH are buildable, HILL is not (roads tunnel through), CREEK is a dry channel */
export const TC = { GROUND: 0, PATCH: 1, HILL: 2, WATER: 3, CREEK: 4, BANK: 5 } as const;
export type TerrainClass = (typeof TC)[keyof typeof TC];
/** height samples per side, and tiles per sample */
export const HS = 256, HSTEP = 8;
/** map edges: N is y=0, S is y=MAP, W is x=0, E is x=MAP */
export type Edge = 'N' | 'E' | 'S' | 'W';
/** a point on a waterway centreline, in tiles; w is the full water width in tiles */
export interface WaterPoint { x: number; y: number; w: number }
export interface Waterway { kind: 'river' | 'creek'; pts: WaterPoint[] }
export interface Chokepoint { kind: 'bridge' | 'gorge'; x: number; y: number; width: number }
export interface Terrain {
  /** the seed the player's save stores */ seed: number;
  /** which retry produced this map (0 = first try) */ attempt: number;
  /** HS*HS heights in metres; sample (i, j) sits at tile (i*HSTEP + HSTEP/2, j*HSTEP + HSTEP/2) */ height: Float32Array;
  /** MAP*MAP terrain classes (TC) */ cls: Uint8Array;
  waters: Waterway[];
  mountainEdges: Edge[];
  /** where the highway enters: a tile on the map border */ highway: { x: number; y: number; edge: Edge };
  /** top-left tile of the buildable start block */ start: { x: number; y: number; size: number };
  /** the three town sites: top-left tiles of 64 x 64 fully buildable blocks (the town centre is x + 32, y + 32), 1.5–3 km apart */ towns: { x: number; y: number; size: number }[];
  chokepoints: Chokepoint[];
}

/** bilinear sample of an HS*HS sample field at tile (x, y), clamped at the borders */
export function sampleField(f: Float32Array, x: number, y: number): number {
  const fx = clamp((x - HSTEP / 2) / HSTEP, 0, HS - 1), fy = clamp((y - HSTEP / 2) / HSTEP, 0, HS - 1);
  const i = Math.min(HS - 2, Math.floor(fx)), j = Math.min(HS - 2, Math.floor(fy));
  const tx = fx - i, ty = fy - j, k = j * HS + i;
  const a = f[k], b = f[k + 1], c = f[k + HS], d = f[k + HS + 1];
  const top = a + (b - a) * tx, bot = c + (d - c) * tx;
  return top + (bot - top) * ty;
}

/** ground height in metres at tile (x, y) */
export function heightAt(t: Terrain, x: number, y: number): number { return sampleField(t.height, x, y); }

/** terrain class of the tile under (x, y); off the map is HILL */
export function classAt(t: Terrain, x: number, y: number): number {
  const ix = Math.floor(x), iy = Math.floor(y);
  if (ix < 0 || iy < 0 || ix >= MAP || iy >= MAP) return TC.HILL;
  return t.cls[iy * MAP + ix];
}
