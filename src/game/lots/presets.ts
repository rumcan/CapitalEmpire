// The lot presets (P20 / T062): the preset format, the size buckets, the look state of a lot, which presets fit a lot, the pick by street slot, and fitting a preset to a lot of another size. Pure, no DOM, no randomness. The lot's own frame: tiles of 2 m, x along the street, y away from it.
import { LV } from './town';

/** a lot's use, as its preset is filed; 'park' is the public car park (a commercial lot with no building, compose.ts isCarPark); 'farm' is a farm parcel
 *  along a country road: its preset holds everything, fences and gate furniture included, since nothing procedural is added to a farm drawn from a preset */
export type PresetUse = 'res' | 'com' | 'park' | 'ind' | 'tour' | 'civic' | 'farm';
/** a lot's look state: built, upgraded, or declined (decline 2 or more) */
export type PresetState = 'built' | 'upgraded' | 'declined';
/** the turn of a prop's four-view art against the lot's facing: 0 = its front faces the street, 1, 2, 3 = quarter turns (one turn takes the front from the street to the lot's +x side; preset-art.ts turned) */
export type View = 0 | 1 | 2 | 3;
/** a lot's road angle: the side its street lies on, in eighth turns from the preset frame's canonical facing: 0 the street on +y (screen bottom-left), 1 +x+y (screen bottom), 2 +x (bottom-right), 3 +x-y (right), 4 -y (top-right), 5 -x-y (top), 6 -x (top-left), 7 -x+y (left) */
export type Road = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
/** a prop in a preset, in the lot's own frame (tiles): x, y the centre of its footprint, x along the street (0 at the left as seen from the street), y away from the street (0 at the street edge); scale: a multiplier of the sprite's owner scale (scales.ts OWNER_SCALE; vehicles: of 1), 1 = the prop's stored size */
export interface PresetProp { id: string; x: number; y: number; scale: number; view: View }
/** a ground patch in the lot's frame: pts as x, y pairs (tiles); lines: its painted lines (parking bays, furrows) as segment end points x0, y0, x1, y1 in the same frame (tiles) */
export interface PresetPatch { kind: 'drive' | 'walk' | 'lot' | 'yard' | 'bed'; tex: string; pts: number[]; lines?: number[] }
/** a flat ground decal (lot-decals.ts) in a lot's preset frame: x, y its centre (tiles); scale a multiplier (negative: mirrored); alpha 0..1 */
export interface PresetDecal { id: string; x: number; y: number; scale: number; alpha: number }
/** one preset: its id, use, state, the size it was laid out for (tiles), its props and ground patches; curated: the owner has edited it; road: set on a
 *  preset made in the lot lab, the road angle it was made for (absent: a frozen preset, drawn at any of the four axis facings, turned); approved: the
 *  owner approved a lab preset, so the game draws it on matching lots (a lab preset without it is a draft, drawn only in the lab); whole: a lab preset
 *  that holds everything its lot draws (fences, street items and decals included: compose adds nothing procedural to it); decals: its flat ground
 *  decals, drawn as the lot's ground marks */
export interface LotPreset { id: string; use: PresetUse; state: PresetState; w: number; d: number; props: PresetProp[]; patches: PresetPatch[]; curated?: boolean; road?: Road; approved?: boolean; whole?: boolean; decals?: PresetDecal[] }
/** a preset fitted to a lot: its props, patches and decals as new objects (tiles of the lot), each prop's index in the preset's props (from), how
 *  many props were dropped for lying outside it, and its decals kept inside it */
export interface Fitted { props: PresetProp[]; patches: PresetPatch[]; from: number[]; dropped: number; decals: PresetDecal[] }

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

/** the approved lot-lab presets a lot of w x d tiles on road angle road draws, by tier: those made for that road, at the lot's size (sized: the
 *  lot's bucket in file order, else the presets within one bucket step on each side at the smallest summed gap, all ties; a farm (use 'farm') has
 *  no one-step cap: its parcels are too varied for buckets, so the nearest at the smallest summed gap, however far); else, on an axis road
 *  only, the approved presets of another axis road, turned to this one; a diagonal road takes no other diagonal's preset; [] when none fits.
 *  Drafts (no approved) and frozen presets (no road) are never returned */
export function approvedFor(all: readonly LotPreset[], use: PresetUse, state: PresetState, w: number, d: number, road: Road): LotPreset[] {
  const bw = bucket1(w), bd = bucket1(d);
  const pool = all.filter(p => p.approved === true && p.road !== undefined && p.use === use && p.state === state);
  const sized = (list: LotPreset[]) => {
    const exact = list.filter(p => bucket1(p.w) === bw && bucket1(p.d) === bd);
    if (exact.length) return exact;
    const gap = (p: LotPreset) => Math.abs(bucket1(p.w) - bw) + Math.abs(bucket1(p.d) - bd);
    const near = list.filter(p => use === 'farm' || (Math.abs(bucket1(p.w) - bw) <= BUCKET && Math.abs(bucket1(p.d) - bd) <= BUCKET));
    let best = Infinity;
    for (const p of near) best = Math.min(best, gap(p));
    return near.filter(p => gap(p) === best);
  };
  const own = sized(pool.filter(p => p.road === road));
  if (own.length) return own;
  return road % 2 === 0 ? sized(pool.filter(p => p.road! % 2 === 0)) : [];
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

/** how far in front of its lot (tiles) a whole preset's props and decals may stand: the verge, where its bins, mailbox and hydrant are */
export const WHOLE_FRONT = 1.5;
/** a preset laid out for p.w x p.d tiles, fitted to a lot of w x d tiles (tiles): a coordinate on the far half (x >= p.w / 2, y >= p.d / 2) moves by the change in size, the near half stays; a prop or decal outside the lot is dropped (a prop counted in dropped; a whole preset's may stand WHOLE_FRONT in front of the lot); patch points and their lines move the same way and are clamped into the lot; the preset itself is not changed */
export function fitPreset(p: LotPreset, w: number, d: number): Fitted {
  const dx = w - p.w, dy = d - p.d, eps = 1e-9, lo = p.whole ? -WHOLE_FRONT : 0;
  const fx = (x: number) => x < p.w / 2 ? x : x + dx;
  const fy = (y: number) => y < p.d / 2 ? y : y + dy;
  const out = (x: number, y: number) => x < -eps || x > w + eps || y < lo - eps || y > d + eps;
  const props: PresetProp[] = [], from: number[] = [];
  let dropped = 0;
  p.props.forEach((q, i) => {
    const x = fx(q.x), y = fy(q.y);
    if (out(x, y)) dropped++;
    else { props.push({ ...q, x, y }); from.push(i); }
  });
  const decals: PresetDecal[] = [];
  for (const q of p.decals ?? []) { const x = fx(q.x), y = fy(q.y); if (!out(x, y)) decals.push({ ...q, x, y }); }
  const fit = (a: readonly number[]) => { const o: number[] = []; for (let i = 0; i + 1 < a.length; i += 2) o.push(Math.min(w, Math.max(0, fx(a[i]!))), Math.min(d, Math.max(0, fy(a[i + 1]!)))); return o; };
  const patches = p.patches.map(a => ({ ...a, pts: fit(a.pts), ...(a.lines ? { lines: fit(a.lines) } : {}) }));
  return { props, patches, from, dropped, decals };
}

/** the preset file's header (an entry { "meta": ... } before the presets): dated notes on how the file was made, newest last */
export interface PresetMeta { notes: string[] }
/** the presets read from the file's JSON: preset-read.ts (dependency-free, for the dev server's save check too) */
export { parsePresets } from './preset-read';

/** a number as the preset file writes it: rounded to 3 decimals, never -0 */
const num = (v: number) => { const r = Math.round(v * 1000) / 1000; return Object.is(r, -0) ? '0' : String(r); };
/** a list of numbers as the preset file writes it */
const nlist = (a: readonly number[]) => `[${a.map(num).join(',')}]`;

/** the preset file's text (src/game/lots/lot-presets.json): a JSON array, one preset's header per line and each prop, patch and decal on its own line
 *  (an edit to one prop is a one-line diff), numbers rounded to 3 decimals (tiles); parsePresets reads it back. The freeze script and the dev
 *  editor's save both write with it; meta, when given, goes first, one note per line. Decals are written only when the preset has the list */
export function formatPresets(list: readonly LotPreset[], meta?: PresetMeta): string {
  const top = meta ? [`{"meta":{"notes":[${meta.notes.length ? `\n${meta.notes.map(n => JSON.stringify(n)).join(',\n')}\n` : ''}]}}`] : [];
  const out = list.map(p => {
    const head = `{"id":${JSON.stringify(p.id)},"use":"${p.use}","state":"${p.state}","w":${num(p.w)},"d":${num(p.d)}${p.curated ? ',"curated":true' : ''}${p.road !== undefined ? `,"road":${p.road}` : ''}${p.approved ? ',"approved":true' : ''}${p.whole ? ',"whole":true' : ''}`;
    const props = p.props.map(q => `{"id":${JSON.stringify(q.id)},"x":${num(q.x)},"y":${num(q.y)},"scale":${num(q.scale)},"view":${q.view}}`);
    const patches = p.patches.map(a => `{"kind":"${a.kind}","tex":${JSON.stringify(a.tex)},"pts":${nlist(a.pts)}${a.lines ? `,"lines":${nlist(a.lines)}` : ''}}`);
    const decals = p.decals?.map(q => `{"id":${JSON.stringify(q.id)},"x":${num(q.x)},"y":${num(q.y)},"scale":${num(q.scale)},"alpha":${num(q.alpha)}}`);
    const block = (rows: string[]) => (rows.length ? `\n${rows.join(',\n')}\n` : '');
    return `${head},"props":[${block(props)}],"patches":[${block(patches)}]${decals ? `,"decals":[${block(decals)}]` : ''}}`;
  });
  return `[\n${[...top, ...out].join(',\n')}\n]\n`;
}
