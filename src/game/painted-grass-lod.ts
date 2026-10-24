import { levelFor, midLevelFor, MID_BELOW } from './iso';
/** Authored ground detail selection. Art level follows CSS camera zoom, independently of DPR and brush scale. */
export function grassZoomLevels(zoom: number, dpr: number) {
  const district = zoom < MID_BELOW, pick = district ? midLevelFor : levelFor;
  return { district, artL: pick(zoom), rasterL: pick(zoom * dpr) };
}
export type GrassDetail = 'far' | 'mid' | 'near';
export interface PaintedGrassFamily { far: string; mid: string; near: string; worldMetres: 8 }
export interface GrassDetailWeight { detail: GrassDetail; weight: number }
export const MAX_PAINTED_SOURCES = 24;
/** Map insertion order is the source LRU. Ordinary photos are outside this cache and never removed. */
export function trimPaintedSources<T>(sources: Map<string, T>, protectedKeys: ReadonlySet<string>, limit = MAX_PAINTED_SOURCES) {
  const painted = [...sources.keys()].filter(key => key.startsWith('@painted:'));
  let size = painted.length;
  for (const key of painted) { if (size <= limit) break; if (!protectedKeys.has(key)) { sources.delete(key); size--; } }
}
const smooth = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** At most two real authored images are required; their shared footprint never changes with zoom. */
export function grassDetailWeights(L: number): GrassDetailWeight[] {
  const level = Number.isFinite(L) && L > 0 ? L : 0;
  const near = smooth(.14, .3, level), mid = smooth(.05, .14, level);
  const candidates: GrassDetailWeight[] = near > 0
    ? [{ detail: 'mid', weight: 1 - near }, { detail: 'near', weight: near }]
    : [{ detail: 'far', weight: 1 - mid }, { detail: 'mid', weight: mid }];
  return candidates.filter(x => x.weight > 0);
}
/** A family revision changes identity when any authored image URL changes; workers never reuse stale blended art. */
export const grassFamilyKey = (name: string, family: PaintedGrassFamily) => JSON.stringify([name, family.worldMetres, family.far, family.mid, family.near]);
export const grassDetailSourceKey = (name: string, family: PaintedGrassFamily, detail: GrassDetail) => '@painted:' + grassFamilyKey(name, family) + ':' + detail;
export const grassFamilyPeriod = (family: PaintedGrassFamily) => family.worldMetres / 2;
