// The lot presets (P20 / T062): the preset format, the size buckets, the look state of a lot, which presets fit a lot, the pick by street slot, and fitting a preset to a lot of another size. Pure, no DOM, no randomness. The lot's own frame: tiles of 2 m, x along the street, y away from it.
import { LV } from './town';

/** a lot's use, as its preset is filed */
export type PresetUse = 'res' | 'com' | 'ind' | 'tour' | 'civic';
/** a lot's look state: built, upgraded, or declined (decline 2 or more) */
export type PresetState = 'built' | 'upgraded' | 'declined';
/** the turn of a prop's four-view art against the lot's facing: 0 = its front faces the street, 1, 2, 3 = quarter turns */
export type View = 0 | 1 | 2 | 3;
/** a prop in a preset, in the lot's own frame (tiles): x along the street (0 at the left as seen from the street), y away from the street (0 at the street edge); scale: a multiplier, 1 = the prop's stored size */
export interface PresetProp { id: string; x: number; y: number; scale: number; view: View }
/** a ground patch in the lot's frame: pts as x, y pairs (tiles); lines: the patch's painted line offsets, kept as they are */
export interface PresetPatch { kind: 'drive' | 'walk' | 'lot' | 'yard' | 'bed'; tex: string; pts: number[]; lines?: number[] }
/** one preset: its id, use, state, the size it was laid out for (tiles), its props and ground patches; curated: the owner has edited it */
export interface LotPreset { id: string; use: PresetUse; state: PresetState; w: number; d: number; props: PresetProp[]; patches: PresetPatch[]; curated?: boolean }
/** a preset fitted to a lot: its props and patches as new objects (tiles of the lot), and how many props were dropped for lying outside it */
export interface Fitted { props: PresetProp[]; patches: PresetPatch[]; dropped: number }

/** the size bucket step (tiles): a lot's width and depth are rounded to it */
export const BUCKET = 2;
/** one side of a lot rounded to the bucket step, never below one bucket (tiles) */
const bucket1 = (v: number) => Math.max(BUCKET, Math.round(v / BUCKET) * BUCKET);

/** a lot's size (tiles) rounded to whole buckets, each side at least one bucket */
export function bucketOf(w: number, d: number): { w: number; d: number } { return { w: bucket1(w), d: bucket1(d) }; }

/** the look state of a lot from its level (LV) and decline (0..3): null unless the lot is built or upgraded; decline 2 or more is declined */
export function stateOf(level: number, decline: number): PresetState | null {
  if (level !== LV.BUILT && level !== LV.UPGRADED) return null;
  return decline >= 2 ? 'declined' : level === LV.UPGRADED ? 'upgraded' : 'built';
}

/** the presets that fit a lot of w x d tiles: those of the same use and state whose bucket is the lot's bucket, in file order; else every one of them at the nearest bucket distance (the sum of the width and depth gaps, tiles); [] when none has that use and state */
export function presetsFor(all: readonly LotPreset[], use: PresetUse, state: PresetState, w: number, d: number): LotPreset[] {
  const bw = bucket1(w), bd = bucket1(d);
  const pool = all.filter(p => p.use === use && p.state === state);
  const exact = pool.filter(p => bucket1(p.w) === bw && bucket1(p.d) === bd);
  if (exact.length) return exact;
  const dist = (p: LotPreset) => Math.abs(bucket1(p.w) - bw) + Math.abs(bucket1(p.d) - bd);
  let best = Infinity;
  for (const p of pool) best = Math.min(best, dist(p));
  return pool.filter(p => dist(p) === best);
}

/** a stable 32-bit hash of a street's name (FNV-1a over its UTF-16 code units): the same name always gives the same value; unitless */
export function streetHash(street: string): number {
  let h = 2166136261;
  for (let i = 0; i < street.length; i++) h = Math.imul(h ^ street.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** the preset for a lot's street slot: list[(slot + streetHash(street)) mod count]; slot in whole lots (fractions floored, below 0 as 0); undefined for an empty list */
export function pickPreset(list: readonly LotPreset[], slot: number, street: string): LotPreset | undefined {
  return list.length ? list[(Math.max(0, Math.floor(slot)) + streetHash(street)) % list.length] : undefined;
}

/** a preset laid out for p.w x p.d tiles, fitted to a lot of w x d tiles (tiles): a coordinate on the far half (x >= p.w / 2, y >= p.d / 2) moves by the change in size, the near half stays; a prop outside the lot is dropped and counted in dropped; patch points move the same way and are clamped into the lot; the preset itself is not changed */
export function fitPreset(p: LotPreset, w: number, d: number): Fitted {
  const dx = w - p.w, dy = d - p.d, eps = 1e-9;
  const fx = (x: number) => x < p.w / 2 ? x : x + dx;
  const fy = (y: number) => y < p.d / 2 ? y : y + dy;
  const props: PresetProp[] = [];
  let dropped = 0;
  for (const q of p.props) {
    const x = fx(q.x), y = fy(q.y);
    if (x < -eps || x > w + eps || y < -eps || y > d + eps) dropped++;
    else props.push({ ...q, x, y });
  }
  const patches = p.patches.map(a => {
    const pts: number[] = [];
    for (let i = 0; i < a.pts.length; i += 2) pts.push(Math.min(w, Math.max(0, fx(a.pts[i]))), Math.min(d, Math.max(0, fy(a.pts[i + 1]))));
    return { ...a, pts, ...(a.lines ? { lines: a.lines.slice() } : {}) };
  });
  return { props, patches, dropped };
}

/** the uses, states and patch kinds a preset file may name */
const USES: readonly string[] = ['res', 'com', 'ind', 'tour', 'civic'];
const STATES: readonly string[] = ['built', 'upgraded', 'declined'];
const KINDS: readonly string[] = ['drive', 'walk', 'lot', 'yard', 'bed'];
/** a plain object (not null, not an array) */
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
/** a finite number */
const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
/** an array of finite numbers */
const nums = (v: unknown): v is number[] => Array.isArray(v) && v.every(fin);

/** one prop read from JSON, or undefined when it is not a valid prop */
function readProp(v: unknown): PresetProp | undefined {
  if (!isObj(v)) return undefined;
  const { id, x, y, scale, view } = v;
  if (typeof id !== 'string' || !fin(x) || !fin(y) || !fin(scale) || !fin(view) || !Number.isInteger(view) || view < 0 || view > 3) return undefined;
  return { id, x, y, scale, view: view as View };
}

/** one ground patch read from JSON, or undefined when it is not valid (lines, when present, must be finite numbers) */
function readPatch(v: unknown): PresetPatch | undefined {
  if (!isObj(v)) return undefined;
  const { kind, tex, pts, lines } = v;
  if (typeof kind !== 'string' || !KINDS.includes(kind) || typeof tex !== 'string' || !nums(pts) || pts.length % 2) return undefined;
  const out: PresetPatch = { kind: kind as PresetPatch['kind'], tex, pts: pts.slice() };
  if (lines !== undefined) { if (!nums(lines)) return undefined; out.lines = lines.slice(); }
  return out;
}

/** one preset read from JSON, or undefined when it is not valid (props and patches must all be valid) */
function readPreset(v: unknown): LotPreset | undefined {
  if (!isObj(v)) return undefined;
  const { id, use, state, w, d, props, patches, curated } = v;
  if (typeof id !== 'string' || typeof use !== 'string' || !USES.includes(use) || typeof state !== 'string' || !STATES.includes(state)) return undefined;
  if (!fin(w) || !fin(d) || w <= 0 || d <= 0 || !Array.isArray(props) || !Array.isArray(patches)) return undefined;
  const pr: PresetProp[] = [], pa: PresetPatch[] = [];
  for (const q of props) { const r = readProp(q); if (!r) return undefined; pr.push(r); }
  for (const a of patches) { const r = readPatch(a); if (!r) return undefined; pa.push(r); }
  const out: LotPreset = { id, use: use as PresetUse, state: state as PresetState, w, d, props: pr, patches: pa };
  if (curated === true) out.curated = true;
  return out;
}

/** the presets read from a JSON array (the studio's file): the valid entries in file order, the others counted in invalid; any other input gives none */
export function parsePresets(json: unknown): { presets: LotPreset[]; invalid: number } {
  if (!Array.isArray(json)) return { presets: [], invalid: 0 };
  const presets: LotPreset[] = [];
  let invalid = 0;
  for (const v of json) { const p = readPreset(v); if (p) presets.push(p); else invalid++; }
  return { presets, invalid };
}
