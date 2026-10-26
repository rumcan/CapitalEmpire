// The lot presets' file reader (P20), apart from presets.ts so the dev server's save check (src/game/dev/dev-save.ts, loaded by vite.config.ts)
// can validate a preset file without the game modules: no runtime imports, types only.
import type { LotPreset, PresetMeta, PresetPatch, PresetProp, PresetState, PresetUse, Road, View } from './presets';

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

/** one preset read from JSON, or undefined when it is not valid (props and patches must all be valid; road, when present, an integer 0..7) */
function readPreset(v: unknown): LotPreset | undefined {
  if (!isObj(v)) return undefined;
  const { id, use, state, w, d, props, patches, curated, road, approved } = v;
  if (typeof id !== 'string' || typeof use !== 'string' || !USES.includes(use) || typeof state !== 'string' || !STATES.includes(state)) return undefined;
  if (!fin(w) || !fin(d) || w <= 0 || d <= 0 || !Array.isArray(props) || !Array.isArray(patches)) return undefined;
  if (road !== undefined && (!fin(road) || !Number.isInteger(road) || road < 0 || road > 7)) return undefined;
  const pr: PresetProp[] = [], pa: PresetPatch[] = [];
  for (const q of props) { const r = readProp(q); if (!r) return undefined; pr.push(r); }
  for (const a of patches) { const r = readPatch(a); if (!r) return undefined; pa.push(r); }
  const out: LotPreset = { id, use: use as PresetUse, state: state as PresetState, w, d, props: pr, patches: pa };
  if (curated === true) out.curated = true;
  if (road !== undefined) out.road = road as Road;
  if (approved === true) out.approved = true;
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
