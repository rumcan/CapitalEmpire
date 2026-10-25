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
  /** mowing stripes baked over the mix (off unless the owner turns them on) */
  stripes: Stripes;
  /** the town's lawns may use it (lawns.ts: each lot's yard, the road blocks' grass); the owner's switch in the studio */
  lawn: boolean;
  /** the painted set it is laid with instead of its mixed picture (painted-grass-art.ts PAINTED_GRASS, e.g. 'grass': three zoom levels), or
   *  null: its picture, as the studio baked it. The game's Grass setting 'photo' lays the picture whatever this says (T082) */
  painted: string | null;
}
/** the surfaces that are not grass: a preset for one of them is never a lawn unless the owner says so */
const NOT_GRASS = new Set(['bunker', 'waste', 'water', 'path']);
/** mowing stripes: light and dark bands over the mixed grass, baked into the picture. Laid in tile space, so they run along the iso
 *  diagonals: dir 'x' bands run along the tile x axis (↘ on screen), 'y' along y (↙), 'check' both (a checkerboard). width: one band in
 *  tiles (snapped so a whole number of light + dark pairs fills one repeat); light / dark: how much lighter / darker the bands get;
 *  lightCol / darkCol and tint: the colours washed into them; soft: the edge between bands (0 hard .. 1 a smooth wave) */
export interface Stripes { on: boolean; dir: 'x' | 'y' | 'check'; width: number; light: number; dark: number; lightCol: string; darkCol: string; tint: number; soft: number }
export const DEFAULT_STRIPES: Stripes = { on: false, dir: 'x', width: 3, light: 0.12, dark: 0.12, lightCol: '#b4d46c', darkCol: '#2e5a1c', tint: 0.25, soft: 0.3 };
/** the stripe controls' ranges */
export const STRIPE_RANGES = { width: [0.5, 16], light: [0, 0.5], dark: [0, 0.5], tint: [0, 1], soft: [0, 1] } as const;
/** stripes with every value held to its range (missing: the defaults, off) */
export function clampStripes(s: Partial<Stripes> | null | undefined): Stripes {
  const D = DEFAULT_STRIPES, r = (k: keyof typeof STRIPE_RANGES, v: unknown) => clamp(typeof v === 'number' && Number.isFinite(v) ? v : D[k], STRIPE_RANGES[k][0], STRIPE_RANGES[k][1]);
  const col = (v: unknown, d: string) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : d;
  return { on: s?.on === true, dir: s?.dir === 'y' || s?.dir === 'check' ? s.dir : 'x', width: r('width', s?.width), light: r('light', s?.light), dark: r('dark', s?.dark), lightCol: col(s?.lightCol, D.lightCol), darkCol: col(s?.darkCol, D.darkCol), tint: r('tint', s?.tint), soft: r('soft', s?.soft) };
}
/** the light + dark pairs in one repeat of `size` tiles for a band width (at least one), and the band width they give */
export function stripePairs(size: number, width: number): { pairs: number; width: number } { const pairs = Math.max(1, Math.round(size / (2 * width))); return { pairs, width: size / (2 * pairs) }; }
/** paints the stripes over a baked picture (W x H px, one repeat of `size` tiles), in place; seamless when the picture is */
export function stripePixels(D: Uint8ClampedArray, W: number, H: number, s: Stripes, size: number) {
  if (!s.on) return;
  const { pairs } = stripePairs(size, s.width), e = Math.max(0.002, s.soft * 0.25);
  // one axis's wave: +1 in the light half of a pair, -1 in the dark half, eased over e (in pairs) at each edge
  const wave = (u: number) => { const f = (((u * pairs) % 1) + 1) % 1, d = Math.min(Math.abs(f - 0.25), Math.abs(f - 1.25), Math.abs(f + 0.75)); return clamp((0.25 - d) / e, -1, 1); };
  const hex = (c: string) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
  const L = hex(s.lightCol), K = hex(s.darkCol), wx = new Float32Array(W), wy = new Float32Array(H);
  for (let x = 0; x < W; x++) wx[x] = wave((x + 0.5) / W);
  for (let y = 0; y < H; y++) wy[y] = wave((y + 0.5) / H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const b = s.dir === 'x' ? wy[y]! : s.dir === 'y' ? wx[x]! : wx[x]! * wy[y]!, o = (y * W + x) * 4, C = b >= 0 ? L : K, k = b >= 0 ? 1 + s.light * b : 1 + s.dark * b, t = s.tint * Math.abs(b);
    for (let c = 0; c < 3; c++) D[o + c] = clamp(D[o + c]! * k * (1 - t) + C[c]! * t, 0, 255);
  }
}
/** the presets file: the presets, and the road blocks' grass (lawns.ts): blocks, the preset the empty ground inside a road block takes (null: any
 *  lawn preset, picked per block), and blockShare, how much of the block it covers in soft patches (1: all of it) */
export interface PresetsFile { v: 1; presets: PaintPreset[]; blocks: string | null; blockShare: number }
/** the block coverage slider's range, and its default */
export const BLOCK_SHARE: [number, number] = [0.2, 1]; const BLOCK_SHARE_DEFAULT = 0.55;
/** the size slider's range (tiles) */
export const PRESET_SIZE: [number, number] = [1, 64];

export const presetSlug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
export const presetTex = (id: string) => `preset:${id}` as const;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

/** a painted set's id ([a-z0-9-], the game ignores one it does not have), or null */
export const clampPainted = (v: unknown): string | null => (typeof v === 'string' && /^[a-z0-9-]{1,40}$/.test(v) ? v : null);
/** a preset with every value held to its range, or null when it has no usable name or pictures */
export function clampPreset(p: Partial<PaintPreset> | null | undefined): PaintPreset | null {
  if (!p || typeof p.name !== 'string' || !p.name.trim() || typeof p.a?.src !== 'string' || typeof p.b?.src !== 'string') return null;
  const name = p.name.trim().slice(0, 40), id = presetSlug(typeof p.id === 'string' && p.id ? p.id : name); if (!id) return null;
  const surface = (PRESET_SURFACES as readonly string[]).includes(p.surface as string) ? (p.surface as PresetSurface) : null;
  const size = clamp(typeof p.size === 'number' && Number.isFinite(p.size) ? p.size : 8, PRESET_SIZE[0], PRESET_SIZE[1]);
  return { id, name, surface, size, col: typeof p.col === 'string' && /^#[0-9a-f]{6}$/i.test(p.col) ? p.col : '#55602a', a: clampSide(p.a), b: clampSide(p.b), mix: clampMix(p.mix ?? {}), stripes: clampStripes(p.stripes), lawn: typeof p.lawn === 'boolean' ? p.lawn : !NOT_GRASS.has(surface ?? ''), painted: clampPainted(p.painted) };
}
/** the file with its presets checked: bad ones dropped, a repeated id kept once (the first) */
export function clampPresets(f: Partial<PresetsFile> | null | undefined): PresetsFile {
  const out: PaintPreset[] = [], seen = new Set<string>();
  for (const p of Array.isArray(f?.presets) ? f!.presets : []) { const c = clampPreset(p); if (c && !seen.has(c.id)) { seen.add(c.id); out.push(c); } }
  const blocks = typeof f?.blocks === 'string' && seen.has(f.blocks) ? f.blocks : null;
  const blockShare = clamp(typeof f?.blockShare === 'number' && Number.isFinite(f.blockShare) ? f.blockShare : BLOCK_SHARE_DEFAULT, BLOCK_SHARE[0], BLOCK_SHARE[1]);
  return { v: 1, presets: out, blocks, blockShare };
}
/** the presets the game was built with */
const FILE = clampPresets(file as Partial<PresetsFile>);
export const PRESETS: PaintPreset[] = FILE.presets;
/** the road blocks' grass the game was built with (PresetsFile blocks, blockShare) */
export const BLOCK_GRASS = { id: FILE.blocks, share: FILE.blockShare };
/** the preset a golf surface paints with, as a Paint texture id, or null: the first preset standing for it; for fescue, else the owner's
 *  preset with id 'fescue' (the Paint tool's Fescue), so the course's fescue, the woodland floor (terrain-paint.ts woodlandTex) and the
 *  Paint tool's Fescue always match (the lead, 2026-10-24) */
export function surfacePreset(surface: string, presets: readonly Pick<PaintPreset, 'id' | 'surface'>[] = PRESETS): `preset:${string}` | null {
  const p = presets.find(q => q.surface === surface) ?? (surface === 'fescue' ? presets.find(q => q.id === 'fescue') : undefined);
  return p ? presetTex(p.id) : null;
}
