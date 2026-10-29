import { clampLook, DEFAULT_LOOK, familyById, type PaintedKind, type PaintedLook } from './painted-families';
import type { PresetState } from './lots/presets';
import { clampCourseFinish, type CourseFinish } from './course-finish';
import { clampWaterLook, type WaterLook } from './water-look';
import { clampRangeLook, type RangeLook } from './golf/range-look';

/** Which hand-painted family each surface of the game wears (#147, T128): the golf surfaces, the town's lawns (several looks, one picked per lot
 *  and per road block so streets are not uniform), the map's ground, the living ground's lush and patchy grass, the course walls' cut faces,
 *  and any texture preset the owner gives a look of its own. The owner edits the file (painted-surfaces.json) in the studio (Painted
 *  surfaces): a family and version, scale, tint and tone per surface; the running dev game takes a saved file at once (painted-surfaces-live.ts).
 *  The game's Grass setting 'photo' lays the photo textures as before. Pure: importable from node tests. */

/** the woodland floor's texture id when the painted art is on (renderer.ts lays it under the forests; with the photo grass the floor is the
 *  course's Fescue, terrain-paint.ts WOODLAND_TEX) */
export const WOODLAND = 'woodland';
/** T194: what a town block's grass lies over where its soft patches leave the block (the rough's texture: the rough's painted look, the owner's
 *  rough paintings), never the map's fescue */
export const BLOCK_UNDER = 'wasteSand'; // the owner, 2026-10-27: "change the block grass to desert": blocks lie over the Waste area sand (the desert) now, was the rough
export type SurfaceGroup = 'Golf' | 'Map' | 'Town' | 'Living ground' | 'Course walls';
/** a surface the studio lists by its plain name: the textures it stands for (a photo texture id, or a preset's golf surface), its group and the
 *  families that fit it (the picker shows those first) */
export interface SurfaceDef { key: string; name: string; group: SurfaceGroup; tex: readonly string[]; kinds: readonly PaintedKind[]; /** T259: an art slot waiting for its art (no look until it lands: its stand-in draws meanwhile) */ slot?: true }
export const SURFACES: readonly SurfaceDef[] = [
  { key: 'green', name: 'Green', group: 'Golf', tex: ['golfGreen'], kinds: ['grass'] },
  { key: 'fringe', name: 'Fringe (the collar round a green)', group: 'Golf', tex: ['golfFringe'], kinds: ['grass'] },
  { key: 'fairway', name: 'Fairway', group: 'Golf', tex: ['golfFairway'], kinds: ['grass'] },
  { key: 'firstCut', name: 'First cut (round fairways and tees)', group: 'Golf', tex: ['golfFirstCut'], kinds: ['grass'] },
  { key: 'tee', name: 'Tee', group: 'Golf', tex: ['golfTee'], kinds: ['grass'] },
  { key: 'sod', name: 'Sod (fresh turf)', group: 'Golf', tex: ['golfSod'], kinds: ['grass'] },
  { key: 'rough', name: 'Rough', group: 'Golf', tex: ['golfRough'], kinds: ['grass'] },
  // T238: the course's Long grass (the brush), wearing the owner's rough paintings now the rough wears the town lawns' grass (#696)
  { key: 'longGrass', name: 'Long grass', group: 'Golf', tex: ['golfLongGrass'], kinds: ['grass'] },
  { key: 'fescue', name: 'Fescue', group: 'Golf', tex: ['golfFescue'], kinds: ['grass'] },
  { key: 'bunker', name: 'Bunker sand', group: 'Golf', tex: ['bunkerSand'], kinds: ['sand'] },
  { key: 'waste', name: 'Waste area sand', group: 'Golf', tex: ['wasteSand'], kinds: ['sand'] },
  { key: 'water', name: 'Pond water', group: 'Golf', tex: ['waterDark', 'waterDeep', 'waterClear'], kinds: ['water'] },
  { key: 'growSoil', name: 'Grow-in soil (seeded turf before it grows)', group: 'Golf', tex: ['growSoil'], kinds: ['cut', 'sand', 'grass'] },
  { key: 'base', name: 'Map grass (the open ground)', group: 'Map', tex: ['grass'], kinds: ['grass'] },
  { key: 'meadow', name: 'Meadow', group: 'Map', tex: ['meadow', 'meadowLush', 'meadowFlowers'], kinds: ['grass'] },
  { key: 'dry', name: 'Dry grass', group: 'Map', tex: ['grassDry'], kinds: ['grass'] },
  { key: 'worn', name: 'Worn ground', group: 'Map', tex: ['lawnWorn'], kinds: ['grass'] },
  { key: 'dirt', name: 'Dirt and bare soil', group: 'Map', tex: ['dirt', 'rockyDirt', 'rockyDirtAlt'], kinds: ['cut', 'sand'] },
  { key: 'bank', name: 'River banks and creek beds', group: 'Map', tex: ['bank', 'creek'], kinds: ['cut', 'sand'] },
  { key: 'river', name: 'River and creek water', group: 'Map', tex: ['water'], kinds: ['water'] },
  // T199: the small streams' banks widen into swamp (swamp.ts); unpainted, a stream keeps its old creek bed
  { key: 'swamp', name: 'Swamp (round the small streams)', group: 'Map', tex: ['swamp'], kinds: ['water', 'grass'] },
  { key: 'field', name: 'Farm fields', group: 'Map', tex: ['field'], kinds: ['cut', 'grass'] },
  // T259: the farms' crop states (ext/farms/crops.ts CROP_SURFACE: the art 185 and 186, a picture for rows along the map's x and one for its y).
  // Unset, a field of that state is its soil (Farm fields) with the stand-in rows; naming a family here swaps the art in
  ...([['fieldPloughed', 'ploughed'], ['cornYoung', 'corn, young'], ['cornRipe', 'corn, ripe'], ['cornStubble', 'corn stubble']] as const).flatMap(([k, n]) => [
    { key: k, name: `Farm fields: ${n} (rows along x)`, group: 'Map' as const, tex: [k], kinds: ['cut', 'grass'] as const, slot: true as const },
    { key: `${k}Y`, name: `Farm fields: ${n} (rows along y)`, group: 'Map' as const, tex: [`${k}Y`], kinds: ['cut', 'grass'] as const, slot: true as const },
  ]),
  // T259: the farm lane (art 189; unset: the Dirt surface with its wheel ruts)
  { key: 'farmLane', name: 'Farm lane (the dirt lane to a farmhouse)', group: 'Map', tex: ['farmLane'], kinds: ['cut', 'sand'], slot: true },
  { key: 'woodland', name: 'Woodland floor (under the trees; the forests on the planner map)', group: 'Map', tex: [WOODLAND], kinds: ['grass', 'cut'] },
  { key: 'outside', name: 'Outside the map', group: 'Map', tex: ['outside'], kinds: ['grass'] },
  { key: 'lawn', name: 'Lawn (the Paint tool\'s lawn textures)', group: 'Town', tex: ['lawnLush', 'lawnClover'], kinds: ['grass'] },
  { key: 'lawnBuilt', name: 'Lot lawn: built lots (T155: the fairway)', group: 'Town', tex: ['lawnBuilt'], kinds: ['grass'] },
  { key: 'lawnUpgraded', name: 'Lot lawn: upgraded lots (T155: the putting green)', group: 'Town', tex: ['lawnUpgraded'], kinds: ['grass'] },
  { key: 'mulch', name: 'Bark mulch (flower beds: the Paint tool\'s Bark mulch)', group: 'Town', tex: ['barkMulch'], kinds: ['cut'] },
  { key: 'lawnDeclined', name: 'Lot lawn: decrepit (declined) lots (T155: the rough)', group: 'Town', tex: ['lawnDeclined'], kinds: ['grass'] },
  { key: 'lush', name: 'Lush grass (along fences, walls and water)', group: 'Living ground', tex: ['grass-lush'], kinds: ['grass'] },
  { key: 'patchy', name: 'Patchy grass (under trees, at doors)', group: 'Living ground', tex: ['grass-patchy'], kinds: ['grass'] },
  { key: 'wallTurf', name: 'Turf wall (raised greens and tees)', group: 'Course walls', tex: ['wallTurf'], kinds: ['cut'] },
  { key: 'wallSand', name: 'Bunker wall', group: 'Course walls', tex: ['wallSand'], kinds: ['cut'] },
  { key: 'wallBank', name: 'Pond bank wall', group: 'Course walls', tex: ['wallBank'], kinds: ['cut'] },
];
const SURFACE_KEYS = new Set(SURFACES.map(s => s.key));
/** the golf surface keys a preset's golf surface (paint-presets.ts PresetSurface) stands for */
const PRESET_SURFACE: Readonly<Record<string, string>> = { green: 'green', fringe: 'fringe', tee: 'tee', fairway: 'fairway', firstCut: 'firstCut', rough: 'rough', longGrass: 'longGrass', fescue: 'fescue', bunker: 'bunker', waste: 'waste', water: 'water' };
const TEX_SURFACE = new Map<string, string>(SURFACES.flatMap(s => s.tex.map(t => [t, s.key] as const)));
/** a town lawn's look and how often it is picked (its weight among the lawns) */
export interface LawnLook extends PaintedLook { weight: number }
/** the file: the surfaces' looks by key, the town lawns, and the presets with a look of their own (by preset id); T227: the course finish's
 *  knobs (course-finish.ts: the fairway bands, the green stripes, the collar, the bunker lips; absent: the tuned look); T230: the water look's
 *  (water-look.ts: the depth toward the middle, the light edge, the shore's reflections; absent: the tuned look, `on: false` the water as before);
 *  T258: the range's ground art (golf/range-look.ts: the mats and the target greens as their pictures or their stand-ins, and the bullseye
 *  green; absent: the pictures) */
export interface SurfacesFile { v: 1; surfaces: Record<string, PaintedLook>; lawns: LawnLook[]; presets: Record<string, PaintedLook>; course?: CourseFinish; water?: WaterLook; range?: RangeLook }
export const LAWN_SLOTS = 8;
/** a lawn's texture id (the town's lawns, when the painted art is on: one per lot and per road block, picked by lawnSlot) */
export const lawnTex = (i: number) => `lawn:${i}`;
/** each look state's lot lawn (T155, the owner: "green grass for upgraded house lawns, fairway for the built ones and rough for the decrepit ones"):
 *  the surface key, which is also its texture id */
export const STATE_LAWN: Readonly<Record<PresetState, string>> = { built: 'lawnBuilt', upgraded: 'lawnUpgraded', declined: 'lawnDeclined' };

/** the file with every look checked: a look naming no family is dropped (that surface keeps its photo), at most LAWN_SLOTS lawns */
export function clampSurfaces(f: unknown): SurfacesFile {
  const o = (f && typeof f === 'object' ? f : {}) as Partial<SurfacesFile>, surfaces: Record<string, PaintedLook> = {}, presets: Record<string, PaintedLook> = {}, lawns: LawnLook[] = [];
  for (const [k, v] of Object.entries(o.surfaces ?? {})) { const l = SURFACE_KEYS.has(k) ? clampLook(v) : null; if (l) surfaces[k] = l; }
  for (const [k, v] of Object.entries(o.presets ?? {})) { const l = /^[a-z0-9-]{1,40}$/.test(k) ? clampLook(v) : null; if (l) presets[k] = l; }
  for (const v of Array.isArray(o.lawns) ? o.lawns.slice(0, LAWN_SLOTS) : []) {
    const l = clampLook(v), w = (v as { weight?: unknown })?.weight;
    if (l) lawns.push({ ...l, weight: Math.round(Math.min(10, Math.max(0, typeof w === 'number' && Number.isFinite(w) ? w : 1)) * 100) / 100 });
  }
  return { v: 1, surfaces, lawns, presets, ...(o.course && typeof o.course === 'object' ? { course: clampCourseFinish(o.course) } : {}), ...(o.water && typeof o.water === 'object' ? { water: clampWaterLook(o.water) } : {}), ...(o.range && typeof o.range === 'object' ? { range: clampRangeLook(o.range) } : {}) };
}
/** what the game knows of a preset: its id, the golf surface it stands for, and the old painted set it named (T082) */
export interface PresetRef { id: string; surface?: string | null; painted?: string | null }
/** the look a texture is laid with, or null (its photo): a lawn slot's, a surface's (by its photo texture id, or a preset by its golf surface;
 *  the preset 'fescue' is the course's fescue, paint-presets.ts surfacePreset), a preset's own, or the old painted set a preset named */
export function lookOfTex(tex: string, file: SurfacesFile, presets: readonly PresetRef[] = []): PaintedLook | null {
  if (tex.startsWith('lawn:')) { const l = file.lawns[+tex.slice(5)]; return l ?? null; }
  // T271: a custom grass (golf/grasses.ts grassTex: own:<play>:<family>) wears its painted family as painted: no tint, no tone (its exposure
  // rides on the course texture), the scale its course texture's
  if (tex.startsWith('own:')) { const i = tex.indexOf(':', 4); return i > 0 ? clampLook({ family: tex.slice(i + 1), version: null, scale: 1, tint: '#ffffff', tone: 0 }) : null; }
  if (tex.startsWith('preset:')) {
    const id = tex.slice(7), own = file.presets[id]; if (own) return own;
    const p = presets.find(q => q.id === id), key = p?.surface ? PRESET_SURFACE[p.surface] : id === 'fescue' ? 'fescue' : undefined;
    if (key && file.surfaces[key]) return file.surfaces[key]!;
    // a preset that named the first painted grass (T082 'grass') wears the map grass's look
    if (p?.painted && file.surfaces.base) return file.surfaces.base;
    return null;
  }
  const key = TEX_SURFACE.get(tex);
  return key ? file.surfaces[key] ?? null : null;
}
/** the surface key a texture stands for (the studio's labels), or null */
export const surfaceOfTex = (tex: string) => TEX_SURFACE.get(tex) ?? null;

/** 32-bit FNV-1a of numbers (a patch's corners), for a stable pick */
function fnvNums(a: ArrayLike<number>, n = 8) { let h = 0x811c9dc5; for (let i = 0; i < Math.min(n, a.length); i++) { const v = Math.round(a[i]! * 8); h ^= v & 0xff; h = Math.imul(h, 0x01000193); h ^= (v >>> 8) & 0xff; h = Math.imul(h, 0x01000193); h ^= (v >>> 16) & 0xff; h = Math.imul(h, 0x01000193); } return h >>> 0; }
/** the lawn a town patch (a lot's yard or a road block's grass) wears: one of the lawns, by weight, picked from where the patch is (its corners),
 *  so it stays put and neighbouring lots differ; -1 when there are no lawns */
export function lawnSlot(pts: ArrayLike<number>, lawns: readonly Pick<LawnLook, 'weight'>[]): number {
  const total = lawns.reduce((s, l) => s + Math.max(0, l.weight), 0); if (!(total > 0)) return -1;
  let r = (fnvNums(pts) / 4294967296) * total;
  for (let i = 0; i < lawns.length; i++) { r -= Math.max(0, lawns[i]!.weight); if (r < 0) return i; }
  return lawns.length - 1;
}
/** the painted texture a lawn patch wears (the painted art on): a lot's look state's lawn (STATE_LAWN) when the file gives that surface a look,
 *  else one of the town lawns by where it lies (lawnSlot); '' when there is neither */
export function lawnTexFor(lawn: { st?: PresetState } | undefined, pts: ArrayLike<number>, file: Pick<SurfacesFile, 'surfaces' | 'lawns'>): string {
  const k = lawn?.st ? STATE_LAWN[lawn.st] : undefined;
  if (k && file.surfaces[k]) return k;
  const slot = lawnSlot(pts, file.lawns);
  return slot >= 0 ? lawnTex(slot) : '';
}
/** the kinds of family a surface key fits (the studio's picker), grass for a preset or a lawn */
export const surfaceKinds = (key: string): readonly PaintedKind[] => SURFACES.find(s => s.key === key)?.kinds ?? ['grass'];
/** a look for a surface that has none yet (the studio's starting point) */
export const newLook = (kind: PaintedKind = 'grass'): PaintedLook => ({ ...DEFAULT_LOOK, family: kind === 'grass' ? DEFAULT_LOOK.family : kind === 'sand' ? 'sand-raked' : kind === 'water' ? 'water-pond' : 'underground-earth' });
export const knownFamily = (id: string) => !!familyById(id);
