// The lot presets' file reader (P20), apart from presets.ts so the dev server's save check (src/game/dev/dev-save.ts, loaded by vite.config.ts)
// can validate a preset file without the game modules: no runtime imports, types only.
import type { LotPreset, PresetDecal, PresetMeta, PresetPatch, PresetProp, PresetState, PresetUse, Road, View } from './presets';

/** the uses, states and patch kinds a preset file may name */
const USES: readonly string[] = ['res', 'com', 'park', 'ind', 'tour', 'civic', 'farm'];
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

/** one decal read from JSON, or undefined when it is not valid (id a string; x, y, scale and alpha finite numbers) */
function readDecal(v: unknown): PresetDecal | undefined {
  if (!isObj(v)) return undefined;
  const { id, x, y, scale, alpha } = v;
  if (typeof id !== 'string' || !fin(x) || !fin(y) || !fin(scale) || !fin(alpha)) return undefined;
  return { id, x, y, scale, alpha };
}

/** one preset read from JSON, or undefined when it is not valid (props, patches and decals must all be valid; road, when present, an integer 0..7;
 *  whole is kept only when true, decals only when given as a list; derived and detached (T155), when present, a master's id). A file without the
 *  T155 fields reads as before: nothing to migrate */
function readPreset(v: unknown): LotPreset | undefined {
  if (!isObj(v)) return undefined;
  const { id, use, state, w, d, props, patches, curated, road, approved, whole, decals, derived, detached } = v;
  if (typeof id !== 'string' || typeof use !== 'string' || !USES.includes(use) || typeof state !== 'string' || !STATES.includes(state)) return undefined;
  if (!fin(w) || !fin(d) || w <= 0 || d <= 0 || !Array.isArray(props) || !Array.isArray(patches)) return undefined;
  if (road !== undefined && (!fin(road) || !Number.isInteger(road) || road < 0 || road > 7)) return undefined;
  if (decals !== undefined && !Array.isArray(decals)) return undefined;
  if ((derived !== undefined && typeof derived !== 'string') || (detached !== undefined && typeof detached !== 'string')) return undefined;
  const pr: PresetProp[] = [], pa: PresetPatch[] = [], pd: PresetDecal[] = [];
  for (const q of props) { const r = readProp(q); if (!r) return undefined; pr.push(r); }
  for (const a of patches) { const r = readPatch(a); if (!r) return undefined; pa.push(r); }
  for (const q of decals ?? []) { const r = readDecal(q); if (!r) return undefined; pd.push(r); }
  const out: LotPreset = { id, use: use as PresetUse, state: state as PresetState, w, d, props: pr, patches: pa };
  if (curated === true) out.curated = true;
  if (road !== undefined) out.road = road as Road;
  if (approved === true) out.approved = true;
  if (whole === true) out.whole = true;
  if (decals !== undefined) out.decals = pd;
  if (typeof derived === 'string') out.derived = derived;
  if (typeof detached === 'string') out.detached = detached;
  return out;
}

/** the header read from JSON, or undefined when the entry is not one ({ meta: { notes: string[] } }, nothing else) */
function readMeta(v: unknown): PresetMeta | undefined {
  if (!isObj(v) || Object.keys(v).length !== 1 || !isObj(v.meta)) return undefined;
  const { notes } = v.meta;
  return Array.isArray(notes) && notes.every(n => typeof n === 'string') ? { notes: notes.slice() } : undefined;
}

/** the presets read from a JSON array (the studio's file): the valid entries in file order, the others counted in invalid; the header entry
 *  ({ meta }), when there is one, as meta (neither a preset nor invalid); any other input gives none */
export function parsePresets(json: unknown): { presets: LotPreset[]; invalid: number; meta?: PresetMeta } {
  if (!Array.isArray(json)) return { presets: [], invalid: 0 };
  const presets: LotPreset[] = [];
  let invalid = 0, meta: PresetMeta | undefined;
  for (const v of json) { const m = meta ? undefined : readMeta(v); if (m) { meta = m; continue; } const p = readPreset(v); if (p) presets.push(p); else invalid++; }
  return meta ? { presets, invalid, meta } : { presets, invalid };
}

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
    const head = `{"id":${JSON.stringify(p.id)},"use":"${p.use}","state":"${p.state}","w":${num(p.w)},"d":${num(p.d)}${p.curated ? ',"curated":true' : ''}${p.road !== undefined ? `,"road":${p.road}` : ''}${p.approved ? ',"approved":true' : ''}${p.whole ? ',"whole":true' : ''}${p.derived !== undefined ? `,"derived":${JSON.stringify(p.derived)}` : ''}${p.detached !== undefined ? `,"detached":${JSON.stringify(p.detached)}` : ''}`;
    const props = p.props.map(q => `{"id":${JSON.stringify(q.id)},"x":${num(q.x)},"y":${num(q.y)},"scale":${num(q.scale)},"view":${q.view}}`);
    const patches = p.patches.map(a => `{"kind":"${a.kind}","tex":${JSON.stringify(a.tex)},"pts":${nlist(a.pts)}${a.lines ? `,"lines":${nlist(a.lines)}` : ''}}`);
    const decals = p.decals?.map(q => `{"id":${JSON.stringify(q.id)},"x":${num(q.x)},"y":${num(q.y)},"scale":${num(q.scale)},"alpha":${num(q.alpha)}}`);
    const block = (rows: string[]) => (rows.length ? `\n${rows.join(',\n')}\n` : '');
    return `${head},"props":[${block(props)}],"patches":[${block(patches)}]${decals ? `,"decals":[${block(decals)}]` : ''}}`;
  });
  return `[\n${[...top, ...out].join(',\n')}\n]\n`;
}
