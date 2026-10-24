// The dev server's save endpoint (P20 / T071), shared by vite.config.ts (the plugin that writes) and its tests: which files the in-game dev
// editor may write, and the check of a save request. Pure, no imports: vite.config.ts loads it before the game's modules exist.

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

/** a save request checked: { file, json } with file a whitelisted name and json the file's whole text, which must parse as JSON (the presets
 *  an array, the studio files an object). ok: the repo path and the text to write; else the reason it is refused */
export function checkDevSave(body: unknown): { ok: true; path: string; text: string } | { ok: false; error: string } {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return { ok: false, error: 'the body must be { file, json }' };
  const { file, json } = body as { file?: unknown; json?: unknown };
  const path = devSavePath(file);
  if (!path) return { ok: false, error: `not a file the dev editor may write: ${String(file)}` };
  if (typeof json !== 'string') return { ok: false, error: 'json must be the file text' };
  if (json.length > DEV_SAVE_MAX) return { ok: false, error: 'too big' };
  let v: unknown;
  try { v = JSON.parse(json); } catch { return { ok: false, error: 'json does not parse' }; }
  const wantArray = file === 'lot-presets.json';
  if (wantArray ? !Array.isArray(v) : typeof v !== 'object' || v === null || Array.isArray(v)) return { ok: false, error: `${String(file)} must hold ${wantArray ? 'an array' : 'an object'}` };
  return { ok: true, path, text: json };
}
