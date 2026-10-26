// The dev server's save endpoint (P20 / T071), shared by vite.config.ts (the plugin that writes) and its tests: which files the in-game dev
// editor may write, the check of a request's origin (no other site may write them: a cross-site page can POST a "simple" request with no
// preflight), and the check of a save's body. vite.config.ts loads it before the game's modules exist: its only import (preset-read.ts) has no
// runtime imports of its own.
import { formatPresets, parsePresets } from '../lots/preset-read';

/** the files the dev editor may write, by the name it sends, with their path in the repo: the lot presets, and the studio Library tab's
 *  sprite sizes and removals (the same JSON the studio writes) */
export const DEV_SAVE_FILES: Readonly<Record<string, string>> = Object.freeze({
  'lot-presets.json': 'src/game/lots/lot-presets.json',
  'scale-overrides.json': 'scripts/assets/scale-overrides.json',
  'removed.json': 'scripts/assets/removed.json',
});
/** the largest file text the endpoint takes (characters) */
export const DEV_SAVE_MAX = 32 * 1024 * 1024;

/** the repo path of a file the dev editor may write, or null for any other name (paths, other files, anything not a string) */
export function devSavePath(file: unknown): string | null {
  return typeof file === 'string' && Object.prototype.hasOwnProperty.call(DEV_SAVE_FILES, file) ? DEV_SAVE_FILES[file]! : null;
}

/** what the origin check reads of a request: its method and headers (absent: undefined) */
export interface DevRequest { method: string; host?: string; origin?: string; secFetchSite?: string; contentType?: string }
/** the origin check of a dev endpoint request: null when it may proceed, else why it is refused. A browser names the page that sent it: an
 *  Origin other than the dev server's own (http://<host>), or a Sec-Fetch-Site other than same-origin, is another site's; a save must also say
 *  it is application/json (a cross-site form or a no-cors fetch can only send text/plain, form or multipart bodies without a preflight) */
export function checkDevRequest(r: DevRequest): string | null {
  if (r.origin !== undefined && (!r.host || r.origin !== `http://${r.host}`)) return `refused: a request from ${r.origin}`;
  if (r.secFetchSite !== undefined && r.secFetchSite !== 'same-origin') return `refused: a ${r.secFetchSite} request`;
  if (r.method === 'POST' && !/^application\/json\s*(;|$)/i.test(r.contentType ?? '')) return 'refused: a save must be sent as application/json';
  return null;
}

/** a save request checked: { file, json } with file a whitelisted name and json the file's whole text, which must parse as JSON: the presets
 *  a list of at least one preset with none invalid (an empty or broken list would turn every lot vacant), the studio files an object. ok: the
 *  repo path and the text to write; else the reason it is refused */
export function checkDevSave(body: unknown): { ok: true; path: string; text: string } | { ok: false; error: string } {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return { ok: false, error: 'the body must be { file, json }' };
  const { file, json } = body as { file?: unknown; json?: unknown };
  const path = devSavePath(file);
  if (!path) return { ok: false, error: `not a file the dev editor may write: ${String(file)}` };
  if (typeof json !== 'string') return { ok: false, error: 'json must be the file text' };
  if (json.length > DEV_SAVE_MAX) return { ok: false, error: 'too big' };
  let v: unknown;
  try { v = JSON.parse(json); } catch { return { ok: false, error: 'json does not parse' }; }
  if (file === 'lot-presets.json') {
    if (!Array.isArray(v)) return { ok: false, error: 'lot-presets.json must hold an array' };
    const r = parsePresets(v);
    if (r.invalid) return { ok: false, error: `lot-presets.json has ${r.invalid} invalid entries` };
    if (!r.presets.length) return { ok: false, error: 'lot-presets.json holds no preset' };
  } else if (typeof v !== 'object' || v === null || Array.isArray(v)) return { ok: false, error: `${String(file)} must hold an object` };
  return { ok: true, path, text: json };
}

/** the lot presets merged per preset (POST /__dev/presets): the file's presets with each upserted preset replaced in place by id (appended when
 *  new), then the removed ids dropped (a removal wins over an upsert of the same id); the header kept. Refused: a file that does not parse, an upsert
 *  that is not a list of valid presets, a remove that is not a list of strings, and a result with no preset (every lot would turn vacant). Invalid
 *  entries on disk are dropped, as the game's reader drops them. ok: the text to write and the preset count */
export function mergePresets(fileText: string, upsert: unknown, remove: unknown): { ok: true; text: string; count: number } | { ok: false; error: string } {
  let file: ReturnType<typeof parsePresets>;
  try { file = parsePresets(JSON.parse(fileText)); } catch { return { ok: false, error: 'lot-presets.json on disk does not parse' }; }
  if (!Array.isArray(upsert)) return { ok: false, error: 'upsert must be a list of presets' };
  const up = parsePresets(upsert);
  if (up.invalid || up.presets.length !== upsert.length) return { ok: false, error: `upsert: ${upsert.length - up.presets.length} entries are not valid presets` };
  if (!Array.isArray(remove) || !remove.every(id => typeof id === 'string')) return { ok: false, error: 'remove must be a list of preset ids' };
  const list = file.presets.slice();
  for (const p of up.presets) { const i = list.findIndex(q => q.id === p.id); if (i >= 0) list[i] = p; else list.push(p); }
  const gone = new Set<string>(remove as string[]), out = list.filter(p => !gone.has(p.id));
  if (!out.length) return { ok: false, error: 'the merge would leave no preset: refused (every lot would turn vacant)' };
  return { ok: true, text: formatPresets(out, file.meta), count: out.length };
}
