// The lot wizard's learning (T158, #343; the owner, 2026-10-26: "a lot wizzard that just generates a house and you haveto quickly delete stuff
// that is in the wrong place and whats left is saved as a 'With this house at this size this item can be here' and then make sectors where things
// are placed ... you generate and i quickly pick off stuff and save and imidiatey teh new one generates and you learn from that").
// A SAMPLE is one wizard lot: its context (type, state, size, road angle, the house, its size class and footprint) and every item the wizard
// offered, with its kind, its place (in the lot's own frame: x along the street, y away from it; normalised by the lot's size; its side of the
// house and distance from the house's walls; its distance from the street edge), its SECTOR and whether the owner kept it.
// SECTORS cut the lot round its house: the street verge, the fence line, near the house, the driveway strip, the front and back yards, the left
// and right sides and the four corners. The MODEL: per house size class, item kind and sector, a keep rate with a Beta prior (a few samples move
// it, many settle it); the wizard's generator draws each item's sector by those rates. The samples live in lot-learning.json, appended through
// the dev server's merge (mergeSamples: by sample id, so several people can train together).
// Pure, with no runtime imports: vite.config.ts loads it (through src/game/dev/dev-save.ts).
import type { PresetState, PresetUse, Road } from './presets';

/** an offered item's kind */
export type ItemKind = 'tree' | 'bush' | 'flowerbed' | 'prop' | 'car' | 'decal';
export const ITEM_KINDS: readonly ItemKind[] = ['tree', 'bush', 'flowerbed', 'prop', 'car', 'decal'];
/** the sectors, and their names as the wizard shows them */
export type Sector = 'verge' | 'fence' | 'near' | 'drive' | 'front' | 'back' | 'left' | 'right' | 'front-left' | 'front-right' | 'back-left' | 'back-right';
export const SECTORS: readonly Sector[] = ['verge', 'fence', 'near', 'drive', 'front', 'back', 'left', 'right', 'front-left', 'front-right', 'back-left', 'back-right'];
export const SECTOR_NAMES: Readonly<Record<Sector, string>> = { verge: 'street verge', fence: 'fence line', near: 'near the house', drive: 'driveway strip', front: 'front yard', back: 'back yard', left: 'left side', right: 'right side', 'front-left': 'front-left corner', 'front-right': 'front-right corner', 'back-left': 'back-left corner', 'back-right': 'back-right corner' };
/** T169: the use groups the lot model learns apart: houses (res), shops and offices (com), industry (ind), the open uses (park, civic, tour); a
 *  farm draws its own preset whole (none) */
export type UseGroup = 'res' | 'com' | 'ind' | 'open';
export const USE_GROUPS: readonly UseGroup[] = ['res', 'com', 'ind', 'open'];
export const groupOf = (use: PresetUse): UseGroup | null => (use === 'res' ? 'res' : use === 'com' ? 'com' : use === 'ind' ? 'ind' : use === 'farm' ? null : 'open');
/** a house size class as the model keys it ('none': a lot with no house) */
export type HouseClass = 'small' | 'medium' | 'large' | 'none';
export const CLASSES: readonly HouseClass[] = ['small', 'medium', 'large', 'none'];
/** how deep the street verge in front of the lot is (tiles), how near an edge the fence line lies, how near the house's walls "near the house" is */
export const VERGE = 1.5, FENCE_BAND = 1, NEAR_BAND = 1.5;
/** the Beta prior of a keep rate: alpha kept, beta deleted (a mean of a half; three samples one way move it past 0.8) */
export const PRIOR = { a: 1, b: 1 };

/** a footprint box in the lot frame (tiles): x0, y0, x1, y1 */
export type Box = readonly [number, number, number, number];
/** the lot a sector is found on: its size (tiles), its house's footprint (null: none), its driveway polygons (x, y pairs, lot frame) */
export interface SectorLot { w: number; d: number; house: Box | null; drives?: readonly (readonly number[])[] }
/** whether a point lies inside a polygon given as x, y pairs (the even-odd rule) */
const inPoly = (pts: readonly number[], x: number, y: number): boolean => { let inside = false; for (let i = 0, j = pts.length - 2; i < pts.length; j = i, i += 2) { const xi = pts[i]!, yi = pts[i + 1]!, xj = pts[j]!, yj = pts[j + 1]!; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside; } return inside; };
/** the house's box, or the lot's middle third when there is none (the yards and sides are found round it) */
const core = (l: SectorLot): Box => l.house ?? [l.w / 3, l.d / 3, (2 * l.w) / 3, (2 * l.d) / 3];
/** the distance (tiles) from a point to a box (0 inside) */
export const boxDist = (b: Box, x: number, y: number) => Math.hypot(Math.max(b[0] - x, 0, x - b[2]), Math.max(b[1] - y, 0, y - b[3]));

/** the sector of a point (lot frame, tiles: x along the street, y away from it; the verge is y < 0), in order: the street verge, the fence line
 *  (within FENCE_BAND of the sides and the back), near the house (within NEAR_BAND of its walls), the driveway strip (on a drive patch), then by
 *  the house's spans: the front and back yards (in front of or behind it), the sides (beside it) and the four corners */
export function sectorOf(l: SectorLot, x: number, y: number): Sector {
  if (y < 0) return 'verge';
  if (x < FENCE_BAND || x > l.w - FENCE_BAND || y > l.d - FENCE_BAND) return 'fence';
  if (l.house && boxDist(l.house, x, y) <= NEAR_BAND) return 'near';
  if (l.drives?.some(p => inPoly(p, x, y))) return 'drive';
  const c = core(l), fb = y < c[1] ? 'front' : y > c[3] ? 'back' : '', lr = x < c[0] ? 'left' : x > c[2] ? 'right' : '';
  return (fb && lr ? `${fb}-${lr}` : fb || lr || 'near') as Sector;
}
/** the rectangles (lot frame, tiles) a sector may be found in (a point drawn in one must still be checked with sectorOf: the bands overlap) */
export function sectorRects(l: SectorLot, s: Sector): Box[] {
  const { w, d } = l, c = core(l), F = FENCE_BAND;
  switch (s) {
    case 'verge': return [[0, -VERGE, w, 0]];
    case 'fence': return [[0, 0, F, d], [w - F, 0, w, d], [0, d - F, w, d]];
    case 'near': return [[c[0] - NEAR_BAND, c[1] - NEAR_BAND, c[2] + NEAR_BAND, c[3] + NEAR_BAND]];
    case 'drive': return (l.drives ?? []).map(p => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (let i = 0; i + 1 < p.length; i += 2) { x0 = Math.min(x0, p[i]!); x1 = Math.max(x1, p[i]!); y0 = Math.min(y0, p[i + 1]!); y1 = Math.max(y1, p[i + 1]!); } return [x0, y0, x1, y1] as Box; });
    case 'front': return [[c[0], 0, c[2], c[1]]];
    case 'back': return [[c[0], c[3], c[2], d]];
    case 'left': return [[0, c[1], c[0], c[3]]];
    case 'right': return [[c[2], c[1], w, c[3]]];
    case 'front-left': return [[0, 0, c[0], c[1]]];
    case 'front-right': return [[c[2], 0, w, c[1]]];
    case 'back-left': return [[0, c[3], c[0], d]];
    case 'back-right': return [[c[2], c[3], w, d]];
  }
}
/** a sector's area on a lot (tiles squared; the rectangles' area, an estimate) */
export const sectorArea = (l: SectorLot, s: Sector) => sectorRects(l, s).reduce((a, b) => a + Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]), 0);

/** an offered item as a sample keeps it: its library (or decal) id and kind; its place (lot frame, tiles) and normalised by the lot's size; its side
 *  of the house ('inside' over it) and the distance from the house's walls (tiles); its distance from the street edge (tiles); its sector; kept */
export interface SampleItem { id: string; kind: ItemKind; x: number; y: number; nx: number; ny: number; side: 'front' | 'back' | 'left' | 'right' | 'inside'; house: number; street: number; sector: Sector; kept: boolean }
/** a sample's context: the lot's type, state, size (tiles) and road angle; its house (library id, size class, footprint w x d tiles; null id: none);
 *  the generator's seed when the lot was generated (lot-gen.ts: the same lot again) */
export interface SampleCtx { use: PresetUse; state: PresetState; w: number; d: number; road: Road; house: string | null; cls: HouseClass; hw: number; hd: number; seed?: number;
  /** T171: the lot's features its items' places are read against (lots/places.ts): the main building's box and the drives' and car parks' boxes
   *  (lot frame, tiles); absent in older samples (their items count for the sectors only) */
  hb?: Box; paved?: Box[] }
/** where a sample comes from (P25): the wizard (each offered item kept or deleted), a preset (every item in it "kept here": the owner's presets as
 *  a head start) or the gallery (a whole lot judged at once: verdict up or down) */
export type SampleSource = 'wizard' | 'preset' | 'gallery';
/** one lot: an id (unique: merged by it), when it was made (ISO), its context and its items; src (absent: the wizard); verdict (the gallery's) */
export interface Sample { id: string; at: string; ctx: SampleCtx; items: SampleItem[]; src?: SampleSource; verdict?: 'up' | 'down' }
/** the file */
export interface LearnFile { v: 1; samples: Sample[] }

const r3 = (v: number) => Math.round(v * 1000) / 1000;
/** an item's sample entry from its place on a lot (lot frame, tiles) */
export function sampleItem(l: SectorLot, id: string, kind: ItemKind, x: number, y: number, kept: boolean): SampleItem {
  const c = core(l), side = !l.house ? (y < c[1] ? 'front' : y > c[3] ? 'back' : x < (c[0] + c[2]) / 2 ? 'left' : 'right')
    : boxDist(l.house, x, y) === 0 ? 'inside' : y < l.house[1] ? 'front' : y > l.house[3] ? 'back' : x < l.house[0] ? 'left' : 'right';
  return { id, kind, x: r3(x), y: r3(y), nx: r3(x / l.w), ny: r3(y / l.d), side, house: r3(l.house ? boxDist(l.house, x, y) : 0), street: r3(y), sector: sectorOf(l, x, y), kept };
}
/** a sample's items checked (bad ones make the sample invalid) */
const KINDS = new Set<string>(ITEM_KINDS), SECT = new Set<string>(SECTORS), SIDES = new Set(['front', 'back', 'left', 'right', 'inside']), CLS = new Set<string>(CLASSES);
const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
function readItem(v: unknown): SampleItem | null {
  const o = v as Partial<SampleItem> | null;
  if (!o || typeof o !== 'object' || typeof o.id !== 'string' || !KINDS.has(o.kind as string) || !SECT.has(o.sector as string) || !SIDES.has(o.side as string) || typeof o.kept !== 'boolean') return null;
  if (![o.x, o.y, o.nx, o.ny, o.house, o.street].every(fin)) return null;
  return { id: o.id, kind: o.kind!, x: o.x!, y: o.y!, nx: o.nx!, ny: o.ny!, side: o.side!, house: o.house!, street: o.street!, sector: o.sector!, kept: o.kept };
}
/** a sample checked, or null */
export function readSample(v: unknown): Sample | null {
  const o = v as Partial<Sample> | null, c = o?.ctx as Partial<SampleCtx> | undefined;
  if (!o || typeof o !== 'object' || typeof o.id !== 'string' || !o.id || typeof o.at !== 'string' || !c || !Array.isArray(o.items)) return null;
  if (typeof c.use !== 'string' || typeof c.state !== 'string' || !fin(c.w) || !fin(c.d) || !fin(c.road) || !CLS.has(c.cls as string) || !fin(c.hw) || !fin(c.hd) || !(c.house === null || typeof c.house === 'string')) return null;
  if (o.src !== undefined && !['wizard', 'preset', 'gallery'].includes(o.src)) return null;
  if (o.verdict !== undefined && o.verdict !== 'up' && o.verdict !== 'down') return null;
  if (c.seed !== undefined && !fin(c.seed)) return null;
  const box4 = (b: unknown): b is Box => Array.isArray(b) && b.length === 4 && b.every(fin);
  if (c.hb !== undefined && !box4(c.hb)) return null;
  if (c.paved !== undefined && !(Array.isArray(c.paved) && c.paved.every(box4))) return null;
  const items: SampleItem[] = [];
  for (const i of o.items) { const r = readItem(i); if (!r) return null; items.push(r); }
  return { id: o.id, at: o.at, ctx: { use: c.use as PresetUse, state: c.state as PresetState, w: c.w!, d: c.d!, road: c.road as Road, house: c.house ?? null, cls: c.cls!, hw: c.hw!, hd: c.hd!, ...(c.seed !== undefined ? { seed: c.seed } : {}), ...(c.hb ? { hb: c.hb } : {}), ...(c.paved ? { paved: c.paved } : {}) }, items,
    ...(o.src !== undefined ? { src: o.src } : {}), ...(o.verdict !== undefined ? { verdict: o.verdict } : {}) };
}
/** the file read: its valid samples, in order (a bad one is dropped) */
export function parseLearning(v: unknown): LearnFile {
  const s = v && typeof v === 'object' ? (v as { samples?: unknown }).samples : undefined, out: Sample[] = [];
  if (Array.isArray(s)) for (const x of s) { const r = readSample(x); if (r) out.push(r); }
  return { v: 1, samples: out };
}
/** the file as text: one sample a line */
export function formatLearning(f: LearnFile): string {
  return f.samples.length ? `{\n "v": 1,\n "samples": [\n${f.samples.map(s => `  ${JSON.stringify(s)}`).join(',\n')}\n ]\n}\n` : '{\n "v": 1,\n "samples": []\n}\n';
}
/** the samples merged (POST /__dev/learning): the file's samples with each new one appended (one whose id the file has already is skipped), so
 *  two people's saves keep both; a preset's sample (src 'preset', id preset:<preset id>) replaces its earlier one in place, so learning from the
 *  presets again follows their edits without counting them twice. Refused: a file that does not parse, an add that is not a list of valid samples */
export function mergeSamples(fileText: string, add: unknown): { ok: true; text: string; count: number } | { ok: false; error: string } {
  let file: LearnFile;
  try { file = parseLearning(fileText.trim() ? JSON.parse(fileText) : {}); } catch { return { ok: false, error: 'lot-learning.json on disk does not parse' }; }
  if (!Array.isArray(add)) return { ok: false, error: 'add must be a list of samples' };
  const have = new Set(file.samples.map(s => s.id)), out = file.samples.slice();
  for (const v of add) {
    const s = readSample(v); if (!s) return { ok: false, error: 'add holds an invalid sample' };
    if (!have.has(s.id)) { have.add(s.id); out.push(s); } else if (s.src === 'preset') { const i = out.findIndex(o => o.id === s.id); out[i] = s; }
  }
  return { ok: true, text: formatLearning({ v: 1, samples: out }), count: out.length };
}

/** a keep rate's counts: offered and kept */
export interface Count { offered: number; kept: number }
/** the model: counts by house class, item kind and sector */
export type Model = Map<string, Count>;
const key = (c: HouseClass, k: ItemKind, s: Sector) => `${c}|${k}|${s}`;
/** the model of a list of samples: every item counted under its sample's house class, its kind and its sector (a gallery lot judged down says
 *  something is wrong but not which item: it is not counted) */
export function buildModel(samples: readonly Sample[]): Model { const m: Model = new Map(); for (const s of samples) learn(m, s); return m; }
/** a model with one more sample counted (the wizard after a save: no rebuild) */
export function learn(m: Model, s: Sample): Model {
  if (s.verdict === 'down') return m;
  for (const it of s.items) { const k = key(s.ctx.cls, it.kind, it.sector), c = m.get(k) ?? { offered: 0, kept: 0 }; c.offered++; if (it.kept) c.kept++; m.set(k, c); }
  return m;
}
/** the model as data (P25: the game ships it with its lots): the prior and every count, keys sorted */
export interface ModelData { v: 1; prior: { a: number; b: number }; counts: Record<string, [number, number]> }
export function modelData(m: Model): ModelData {
  const counts: Record<string, [number, number]> = {};
  for (const k of [...m.keys()].sort()) { const c = m.get(k)!; counts[k] = [c.offered, c.kept]; }
  return { v: 1, prior: { ...PRIOR }, counts };
}
/** a model read back from its data (bad entries dropped) */
export function modelFrom(d: unknown): Model {
  const m: Model = new Map(), c = d && typeof d === 'object' ? (d as Partial<ModelData>).counts : undefined;
  if (c && typeof c === 'object') for (const [k, v] of Object.entries(c)) if (/^[a-z]+\|[a-z]+\|[a-z-]+$/.test(k) && Array.isArray(v) && fin(v[0]) && fin(v[1]) && v[1] <= v[0]) m.set(k, { offered: v[0], kept: v[1] });
  return m;
}
/** the keep rate of a kind in a sector for a house class: the posterior mean of its Beta prior (PRIOR) and its counts */
export function keepRate(m: Model, c: HouseClass, k: ItemKind, s: Sector): number {
  const n = m.get(key(c, k, s)) ?? { offered: 0, kept: 0 };
  return (n.kept + PRIOR.a) / (n.offered + PRIOR.a + PRIOR.b);
}
/** the counts behind a keep rate */
export const countOf = (m: Model, c: HouseClass, k: ItemKind, s: Sector): Count => m.get(key(c, k, s)) ?? { offered: 0, kept: 0 };
/** a sector drawn for an item by the model (r() in [0, 1)): each sector of the lot weighted by its keep rate (squared: the model's word counts)
 *  times the square root of its area (so a large yard is not swamped by a thin band, nor a band starved); null when the lot has none */
export function drawSector(m: Model, c: HouseClass, k: ItemKind, l: SectorLot, r: () => number, skip: ReadonlySet<Sector> = new Set()): Sector | null {
  const ws = sectorWeights(m, c, k, l).map((w, i) => (skip.has(SECTORS[i]!) ? 0 : w)), tot = ws.reduce((a, b) => a + b, 0);
  if (!(tot > 0)) return null;
  let t = r() * tot;
  for (let i = 0; i < SECTORS.length; i++) { t -= ws[i]!; if (t < 0) return SECTORS[i]!; }
  return SECTORS[SECTORS.length - 1]!;
}

/** each sector's weight in drawSector, in SECTORS order: its keep rate squared times the square root of its area (0 for a sector of the lot
 *  under a quarter tile) */
export function sectorWeights(m: Model, c: HouseClass, k: ItemKind, l: SectorLot): number[] {
  return SECTORS.map(s => { const a = sectorArea(l, s); return a > 0.25 ? keepRate(m, c, k, s) ** 2 * Math.sqrt(a) : 0; });
}
/** the wizard's counter: the samples, by house class and by source; each wizard sample's share of offered items kept, in order (the trend: the
 *  presets keep everything and the gallery judges whole lots, so they are left out of it), the mean of the first and the last ten; the gallery's
 *  lots judged and the share judged up */
export function learningStats(samples: readonly Sample[]): { total: number; byClass: Record<HouseClass, number>; bySrc: Record<SampleSource, number>; shares: number[]; first: number; last: number; judged: number; up: number } {
  const byClass = { small: 0, medium: 0, large: 0, none: 0 } as Record<HouseClass, number>, bySrc: Record<SampleSource, number> = { wizard: 0, preset: 0, gallery: 0 }, shares: number[] = [];
  let judged = 0, up = 0;
  for (const s of samples) {
    byClass[s.ctx.cls]++; bySrc[s.src ?? 'wizard']++;
    if ((s.src ?? 'wizard') === 'wizard' && s.items.length) shares.push(s.items.filter(i => i.kept).length / s.items.length);
    if (s.verdict) { judged++; if (s.verdict === 'up') up++; }
  }
  const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  return { total: samples.length, byClass, bySrc, shares, first: mean(shares.slice(0, 10)), last: mean(shares.slice(-10)), judged, up: judged ? up / judged : 0 };
}
