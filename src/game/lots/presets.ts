// The lot presets (P20 / T062): the preset format, the size buckets, the look state of a lot, which presets fit a lot, the pick by street slot, and fitting a preset to a lot of another size. Pure, no DOM, no randomness. The lot's own frame: tiles of 2 m, x along the street, y away from it.
import { LV } from './town';

/** a lot's use, as its preset is filed; 'park' is the public car park (a commercial lot with no building, compose.ts isCarPark) */
export type PresetUse = 'res' | 'com' | 'park' | 'ind' | 'tour' | 'civic';
/** a lot's look state: built, upgraded, or declined (decline 2 or more) */
export type PresetState = 'built' | 'upgraded' | 'declined';
/** the turn of a prop's four-view art against the lot's facing: 0 = its front faces the street, 1, 2, 3 = quarter turns (one turn takes the front from the street to the lot's +x side; preset-art.ts turned) */
export type View = 0 | 1 | 2 | 3;
/** a prop in a preset, in the lot's own frame (tiles): x, y the centre of its footprint, x along the street (0 at the left as seen from the street), y away from the street (0 at the street edge); scale: a multiplier of the sprite's owner scale (scales.ts OWNER_SCALE; vehicles: of 1), 1 = the prop's stored size */
export interface PresetProp { id: string; x: number; y: number; scale: number; view: View }
/** a ground patch in the lot's frame: pts as x, y pairs (tiles); lines: its painted lines (parking bays, furrows) as segment end points x0, y0, x1, y1 in the same frame (tiles) */
export interface PresetPatch { kind: 'drive' | 'walk' | 'lot' | 'yard' | 'bed'; tex: string; pts: number[]; lines?: number[] }
/** one preset: its id, use, state, the size it was laid out for (tiles), its props and ground patches; curated: the owner has edited it */
export interface LotPreset { id: string; use: PresetUse; state: PresetState; w: number; d: number; props: PresetProp[]; patches: PresetPatch[]; curated?: boolean }
/** a preset fitted to a lot: its props and patches as new objects (tiles of the lot), each prop's index in the preset's props (from), and how
 *  many props were dropped for lying outside it */
export interface Fitted { props: PresetProp[]; patches: PresetPatch[]; from: number[]; dropped: number }

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

/** a preset laid out for p.w x p.d tiles, fitted to a lot of w x d tiles (tiles): a coordinate on the far half (x >= p.w / 2, y >= p.d / 2) moves by the change in size, the near half stays; a prop outside the lot is dropped and counted in dropped; patch points and their lines move the same way and are clamped into the lot; the preset itself is not changed */
export function fitPreset(p: LotPreset, w: number, d: number): Fitted {
  const dx = w - p.w, dy = d - p.d, eps = 1e-9;
  const fx = (x: number) => x < p.w / 2 ? x : x + dx;
  const fy = (y: number) => y < p.d / 2 ? y : y + dy;
  const props: PresetProp[] = [], from: number[] = [];
  let dropped = 0;
  p.props.forEach((q, i) => {
    const x = fx(q.x), y = fy(q.y);
    if (x < -eps || x > w + eps || y < -eps || y > d + eps) dropped++;
    else { props.push({ ...q, x, y }); from.push(i); }
  });
  const fit = (a: readonly number[]) => { const out: number[] = []; for (let i = 0; i + 1 < a.length; i += 2) out.push(Math.min(w, Math.max(0, fx(a[i]!))), Math.min(d, Math.max(0, fy(a[i + 1]!)))); return out; };
  const patches = p.patches.map(a => ({ ...a, pts: fit(a.pts), ...(a.lines ? { lines: fit(a.lines) } : {}) }));
  return { props, patches, from, dropped };
}

/** the preset file's header (an entry { "meta": ... } before the presets): dated notes on how the file was made, newest last */
export interface PresetMeta { notes: string[] }
/** the presets read from the file's JSON: preset-read.ts (dependency-free, for the dev server's save check too) */
export { parsePresets } from './preset-read';

/** a number as the preset file writes it: rounded to 3 decimals, never -0 */
const num = (v: number) => { const r = Math.round(v * 1000) / 1000; return Object.is(r, -0) ? '0' : String(r); };
/** a list of numbers as the preset file writes it */
const nlist = (a: readonly number[]) => `[${a.map(num).join(',')}]`;

/** the preset file's text (src/game/lots/lot-presets.json): a JSON array, one preset's header per line and each prop and patch on its own line
 *  (an edit to one prop is a one-line diff), numbers rounded to 3 decimals (tiles); parsePresets reads it back. The freeze script and the dev
 *  editor's save both write with it; meta, when given, goes first, one note per line */
export function formatPresets(list: readonly LotPreset[], meta?: PresetMeta): string {
  const top = meta ? [`{"meta":{"notes":[${meta.notes.length ? `\n${meta.notes.map(n => JSON.stringify(n)).join(',\n')}\n` : ''}]}}`] : [];
  const out = list.map(p => {
    const head = `{"id":${JSON.stringify(p.id)},"use":"${p.use}","state":"${p.state}","w":${num(p.w)},"d":${num(p.d)}${p.curated ? ',"curated":true' : ''}`;
    const props = p.props.map(q => `{"id":${JSON.stringify(q.id)},"x":${num(q.x)},"y":${num(q.y)},"scale":${num(q.scale)},"view":${q.view}}`);
    const patches = p.patches.map(a => `{"kind":"${a.kind}","tex":${JSON.stringify(a.tex)},"pts":${nlist(a.pts)}${a.lines ? `,"lines":${nlist(a.lines)}` : ''}}`);
    const block = (rows: string[]) => (rows.length ? `\n${rows.join(',\n')}\n` : '');
    return `${head},"props":[${block(props)}],"patches":[${block(patches)}]}`;
  });
  return `[\n${[...top, ...out].join(',\n')}\n]\n`;
}
