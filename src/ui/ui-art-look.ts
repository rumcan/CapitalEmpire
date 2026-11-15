// #1304 (the owner, 2026-11-14: "pls replace stand in vectors"): the UI's painted pictures (the icons as painted tiles, the event emblems, the swing
// meter's face, the spin ball, the club tiles) or the old look they replace (the gold line icons and the code-drawn vectors). The owner's rule (art goes
// straight in): the new art is the default and the old look stays as an option. `?uilook=vector` in the address, or localStorage 'ui-art-look' =
// 'vector', shows the old look; anything else, or no storage at all (a test, a private window), the painted one. A picture that has not landed yet
// (its file missing) falls back to its old look either way.

export type UiArtLook = 'painted' | 'vector';
const KEY = 'ui-art-look';
let cached: UiArtLook | null = null;

/** the look from an address's query and a stored value (pure: the tests' entry) */
export function readUiArtLook(search: string, stored: string | null): UiArtLook {
  const q = /[?&]uilook=(painted|vector)\b/.exec(search)?.[1];
  return (q ?? stored) === 'vector' ? 'vector' : 'painted';
}
/** the look this page shows (read once) */
export function uiArtLook(): UiArtLook {
  if (cached) return cached;
  let search = '', stored: string | null = null;
  try { search = globalThis.location?.search ?? ''; } catch { /* no window */ }
  try { stored = globalThis.localStorage?.getItem(KEY) ?? null; } catch { /* storage blocked */ }
  return (cached = readUiArtLook(search, stored));
}
/** remember a look (it shows from the next page load) */
export function setUiArtLook(look: UiArtLook): void {
  cached = look;
  try { globalThis.localStorage?.setItem(KEY, look); } catch { /* storage blocked: this page only */ }
}
/** true when the painted pictures are wanted */
export const paintedUi = (): boolean => uiArtLook() === 'painted';
