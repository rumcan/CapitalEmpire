import file from './paint-presets.json';
import { clampMix, clampSide, type GrassMix, type GrassSide } from './base-grass';

/** The owner's texture presets: made in the sprite studio (Ground tab → Texture presets) like the map's base grass (two pictures, each sized
 *  and coloured, mixed in soft patches), saved with a name, the golf surface they stand for (or none) and the tiles one repeat covers; the
 *  studio bakes each into a seamless picture (src/assets/ground/preset-<id>.webp). They are the only textures the Paint tool offers
 *  (paint.ts MENU_TEXES); the game lays them in tile space like the photo textures (id 'preset:<id>'). Pure: importable from node tests
 *  (the pictures are found by paint-presets-saved.ts). */

/** the golf surfaces a preset can stand for (golf/types.ts GolfSurface without 'other') */
export const PRESET_SURFACES = ['green', 'fringe', 'tee', 'fairway', 'firstCut', 'rough', 'fescue', 'bunker', 'waste', 'water', 'path'] as const;
export type PresetSurface = (typeof PRESET_SURFACES)[number];
export interface PaintPreset {
  /** a slug of the name ([a-z0-9-]) */
  id: string; name: string;
  /** the golf surface it stands for (costs, grow-in, course quality, the Course tool's surfaces), or null */
  surface: PresetSurface | null;
  /** the tiles one repeat of the baked picture covers (2 m tiles) */
  size: number;
  /** its average colour (the Paint panel's swatch) */
  col: string;
  a: GrassSide; b: GrassSide; mix: GrassMix;
}
export interface PresetsFile { v: 1; presets: PaintPreset[] }
/** the size slider's range (tiles) */
export const PRESET_SIZE: [number, number] = [1, 64];

export const presetSlug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
export const presetTex = (id: string) => `preset:${id}` as const;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

/** a preset with every value held to its range, or null when it has no usable name or pictures */
export function clampPreset(p: Partial<PaintPreset> | null | undefined): PaintPreset | null {
  if (!p || typeof p.name !== 'string' || !p.name.trim() || typeof p.a?.src !== 'string' || typeof p.b?.src !== 'string') return null;
  const name = p.name.trim().slice(0, 40), id = presetSlug(typeof p.id === 'string' && p.id ? p.id : name); if (!id) return null;
  const surface = (PRESET_SURFACES as readonly string[]).includes(p.surface as string) ? (p.surface as PresetSurface) : null;
  const size = clamp(typeof p.size === 'number' && Number.isFinite(p.size) ? p.size : 8, PRESET_SIZE[0], PRESET_SIZE[1]);
  return { id, name, surface, size, col: typeof p.col === 'string' && /^#[0-9a-f]{6}$/i.test(p.col) ? p.col : '#55602a', a: clampSide(p.a), b: clampSide(p.b), mix: clampMix(p.mix ?? {}) };
}
/** the file with its presets checked: bad ones dropped, a repeated id kept once (the first) */
export function clampPresets(f: Partial<PresetsFile> | null | undefined): PresetsFile {
  const out: PaintPreset[] = [], seen = new Set<string>();
  for (const p of Array.isArray(f?.presets) ? f!.presets : []) { const c = clampPreset(p); if (c && !seen.has(c.id)) { seen.add(c.id); out.push(c); } }
  return { v: 1, presets: out };
}
/** the presets the game was built with */
export const PRESETS: PaintPreset[] = clampPresets(file as Partial<PresetsFile>).presets;
/** the first preset standing for a golf surface, as a Paint texture id, or null */
export function surfacePreset(surface: string): `preset:${string}` | null { const p = PRESETS.find(q => q.surface === surface); return p ? presetTex(p.id) : null; }
