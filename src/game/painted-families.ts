import REGISTRY from './painted-families.json';
import { grassDetailWeights, type GrassDetail, type GrassDetailWeight } from './painted-grass-lod';

/** The hand-painted ground families (#147, the art model's new-painted-spatial-scales-20261025.json): each a palette and length of grass, a
 *  sand, the pond water or a wall's cut face, with three paintings of real spatial coverage (near 40 m: half a town block; mid 320 m: half a
 *  town; far 4096 m: the whole map), some in several versions. The registry (painted-families.json) is written by
 *  scripts/assets/prep-painted-families.mjs; a surface's look (painted-surfaces.ts) picks a family, a version, a scale, a tint and a tone.
 *  Pure: importable from node tests (the pictures' URLs are found by painted-grass-art.ts). */

export type PaintedKind = 'grass' | 'sand' | 'water' | 'cut';
export const LEVEL_NAMES: readonly GrassDetail[] = ['near', 'mid', 'far'];
/** one painting: its file under src/assets/ground/painted/, its mean colour and size (px, square) */
export interface FamilyPicture { file: string; mean: string; px: number; sha256: string | null }
export interface PaintedFamilyDef {
  id: string; name: string; kind: PaintedKind; palette?: string; length?: string;
  /** the metres one tile of each level covers, as the art was painted */
  coverage: Record<GrassDetail, number>;
  /** each level's paintings by version ('v1', 'v2', ...); a level borrowed from another family (borrowed) lists that family's */
  levels: Record<GrassDetail, Record<string, FamilyPicture>>;
  /** the version each level shows by default */
  pick: Partial<Record<GrassDetail, string>>;
  borrowed?: Partial<Record<GrassDetail, string>>;
  /** the first painted grass (T082): kept as it was, with its own zoom crossfade (painted-grass-lod.ts grassDetailWeights) */
  legacy?: boolean;
}
export const FAMILIES: readonly PaintedFamilyDef[] = (REGISTRY as unknown as { families: PaintedFamilyDef[] }).families;
const BY_ID = new Map(FAMILIES.map(f => [f.id, f]));
export const familyById = (id: string): PaintedFamilyDef | undefined => BY_ID.get(id);
/** every version any level of a family has, in order */
export const familyVersions = (f: PaintedFamilyDef) => [...new Set(LEVEL_NAMES.flatMap(l => Object.keys(f.levels[l])))].sort();

/** a surface's look: the family, the version (null: each level's default pick; a level without that version keeps its pick), the scale (1: as
 *  painted; 0.5: every brush mark half the size, the tile covering half the metres), the tint (multiplied: '#ffffff' leaves the colour) and
 *  the tone (-0.6 darker .. 0.6 lighter: each colour scaled by 1 + tone, so the dark gaps stay dark) */
export interface PaintedLook { family: string; version: string | null; scale: number; tint: string; tone: number }
export const LOOK_RANGES = { scale: [0.25, 4] as const, tone: [-0.6, 0.6] as const };
export const DEFAULT_LOOK: PaintedLook = { family: 'emerald-medium', version: null, scale: 1, tint: '#ffffff', tone: 0 };
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const HEX = /^#[0-9a-f]{6}$/i;
/** a look with every value held to its range; null when it names no family of the registry */
export function clampLook(v: unknown): PaintedLook | null {
  const o = v as Partial<PaintedLook> | null;
  if (!o || typeof o !== 'object' || typeof o.family !== 'string') return null;
  const f = familyById(o.family); if (!f) return null;
  const version = typeof o.version === 'string' && familyVersions(f).includes(o.version) ? o.version : null;
  return { family: f.id, version, scale: Math.round(clamp(num(o.scale, 1), LOOK_RANGES.scale[0], LOOK_RANGES.scale[1]) * 1000) / 1000, tint: typeof o.tint === 'string' && HEX.test(o.tint) ? o.tint.toLowerCase() : '#ffffff', tone: Math.round(clamp(num(o.tone, 0), LOOK_RANGES.tone[0], LOOK_RANGES.tone[1]) * 1000) / 1000 };
}

/** a level as a look lays it: the painting (its file), the metres one tile covers (the family's coverage times the look's scale), its mean colour and px */
export interface LevelArt { file: string; metres: number; mean: string; px: number; version: string }
export interface ResolvedFamily { id: string; kind: PaintedKind; legacy: boolean; near: LevelArt; mid: LevelArt; far: LevelArt }
/** the paintings a look lays at each level: the look's version where the level has it, else the level's pick, else its first version; a level
 *  with no painting at all (a cut face painted once) shows the next finer one at that one's coverage. null: no such family */
export function resolveFamily(look: Pick<PaintedLook, 'family' | 'version' | 'scale'>): ResolvedFamily | null {
  const f = familyById(look.family); if (!f) return null;
  const out: Partial<Record<GrassDetail, LevelArt>> = {};
  let prev: LevelArt | null = null;
  for (const l of LEVEL_NAMES) {
    const vs = f.levels[l], v = look.version && vs[look.version] ? look.version : f.pick[l] && vs[f.pick[l]!] ? f.pick[l]! : Object.keys(vs).sort()[0];
    const pic = v ? vs[v] : undefined;
    const art: LevelArt | null = pic ? { file: pic.file, metres: f.coverage[l] * look.scale, mean: pic.mean, px: pic.px, version: v! } : prev;
    if (!art) return null;
    out[l] = prev = art;
  }
  return { id: f.id, kind: f.kind, legacy: !!f.legacy, near: out.near!, mid: out.mid!, far: out.far! };
}
/** a look's key for the composed pictures (the family, version and scale: the tint and tone are applied over a copy) */
export const lookKey = (look: Pick<PaintedLook, 'family' | 'version' | 'scale'>) => `${look.family}/${look.version ?? '*'}@${look.scale}`;

/** device px per metre per unit of camera zoom on a dpr-2 screen (a 2 m tile edge is 71.55 world px: 35.8 px a metre at zoom 1, x2) */
export const PX_PER_M_ZOOM = 71.55;
/** the camera zoom at which a level is drawn at its own pixels on a dpr-2 screen (one picture px a screen px) */
export const nativeZoom = (a: Pick<LevelArt, 'px' | 'metres'>) => a.px / a.metres / PX_PER_M_ZOOM;
/** the half-width (in log zoom) of each crossfade */
const CROSS_W = Math.log(1.6);
const smoothLog = (centre: number, L: number) => { const t = clamp((Math.log(L) - Math.log(centre) + CROSS_W) / (2 * CROSS_W), 0, 1); return t * t * (3 - 2 * t); };
/** where a family hands one level to the next (the art levels, camera zoom, of the half-and-half mix): the geometric mean of the two levels'
 *  native zooms, so neither is ever much enlarged or shrunk there (40 m to 320 m: 12.6%; 320 m to 4096 m: 1.25%, the planner's map) */
/** a family's levels as the crossfade sees them (a ResolvedFamily, or a texture's painted pick) */
export type LevelsLike = { legacy?: boolean } & Record<GrassDetail, Pick<LevelArt, 'px' | 'metres'>>;
export function crossovers(r: LevelsLike): [number, number] {
  const zn = nativeZoom(r.near), zm = nativeZoom(r.mid), zf = nativeZoom(r.far);
  return [Math.sqrt(zn * zm), Math.sqrt(zm * zf)];
}
/** the levels a chunk baked at art level L (camera zoom) blends for this family, at most two, weights summing to 1: each level crossfades into
 *  the next around their crossover; the first painted grass keeps its own fixed crossfade; a weight under 2% is left out */
export function familyWeights(r: LevelsLike, L: number): GrassDetailWeight[] {
  if (r.legacy) return grassDetailWeights(L);
  const level = Number.isFinite(L) && L > 0 ? L : 0;
  if (level <= 0) return [{ detail: 'far', weight: 1 }];
  const [c1, c2] = crossovers(r), near = smoothLog(c1, level), mid = smoothLog(c2, level);
  const pair: GrassDetailWeight[] = near > 0 ? [{ detail: 'mid', weight: 1 - near }, { detail: 'near', weight: near }] : [{ detail: 'far', weight: 1 - mid }, { detail: 'mid', weight: mid }];
  const kept = pair.filter(x => x.weight >= 0.02), sum = kept.reduce((s, x) => s + x.weight, 0);
  return kept.map(x => ({ detail: x.detail, weight: x.weight / sum }));
}
/** the map's side in metres: a level covering at least this is laid once, aligned to the map (it cannot repeat on it) */
export const MAP_METRES = 4096;
export const coversMap = (a: Pick<LevelArt, 'metres'>) => a.metres >= MAP_METRES - 1e-6;

const rgb = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
/** a colour as a look shows it: multiplied by the tint, then scaled by 1 + tone (clamped) */
export function lookColour(mean: string, look: Pick<PaintedLook, 'tint' | 'tone'>): string {
  const m = rgb(HEX.test(mean) ? mean : '#808080'), t = rgb(HEX.test(look.tint) ? look.tint : '#ffffff'), k = 1 + look.tone;
  return '#' + m.map((v, i) => Math.round(clamp(v * t[i]! / 255 * k, 0, 255)).toString(16).padStart(2, '0')).join('');
}
