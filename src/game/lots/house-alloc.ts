// House allocations (T155, #333; the owner, 2026-10-26: "Each house needs an allocation that says it will only work on which road angles and if
// its a build. upgraded or decrepit house"). Each house (a library id, its base view as presets store it) may carry the road angles it suits
// (presets.ts Road, 0..7) and the look states it suits (built, upgraded, declined: the owner's "decrepit"). A house with no allocation suits every
// road and state until the owner sets one. The lot lab's Generate, New lot and Change house deal only houses that suit the lot's road and state
// (src/game/dev/lot-houses.ts). The file (house-allocations.json) is written by the lot lab through the dev server, merged per house
// (mergeAllocations, POST /__dev/allocations), so two helpers' saves never overwrite each other.
// Pure, with no runtime imports: vite.config.ts loads it (through src/game/dev/dev-save.ts) before the game's modules exist.
import type { PresetState, Road } from './presets';

/** every road angle and every look state, in order (what an allocation that suits everything lists) */
export const ALL_ROADS: readonly Road[] = [0, 1, 2, 3, 4, 5, 6, 7];
export const ALL_STATES: readonly PresetState[] = ['built', 'upgraded', 'declined'];
/** one house's allocation: the road angles and the look states it suits (sorted, no repeats) */
export interface HouseAlloc { roads: Road[]; states: PresetState[] }
/** the file: the allocations by house (library id) */
export interface AllocFile { v: 1; houses: Record<string, HouseAlloc> }
/** an empty file (no house set: every house suits everything) */
export const NO_ALLOCATIONS: AllocFile = Object.freeze({ v: 1, houses: Object.freeze({}) as Record<string, HouseAlloc> }) as AllocFile;
/** a library id as the file keys it (no spaces, a sane length) */
const ID = /^[^\s"\\]{1,200}$/;

/** an allocation checked: its roads (whole numbers 0..7) and states (the three names), sorted, repeats dropped; null when it is not an object
 *  with both lists */
export function clampAlloc(v: unknown): HouseAlloc | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as { roads?: unknown; states?: unknown };
  if (!Array.isArray(o.roads) || !Array.isArray(o.states)) return null;
  const roads = ALL_ROADS.filter(r => (o.roads as unknown[]).includes(r)), states = ALL_STATES.filter(s => (o.states as unknown[]).includes(s));
  return { roads: [...roads], states: [...states] };
}
/** the file read: each house's allocation checked (a bad entry or id is dropped) */
export function parseAllocations(v: unknown): AllocFile {
  const houses: Record<string, HouseAlloc> = {}, h = v && typeof v === 'object' ? (v as { houses?: unknown }).houses : undefined;
  if (h && typeof h === 'object' && !Array.isArray(h)) for (const [id, a] of Object.entries(h)) { const c = ID.test(id) ? clampAlloc(a) : null; if (c) houses[id] = c; }
  return { v: 1, houses };
}
/** the file as text: the houses by id, one a line (so a merge or a hand look stays readable) */
export function formatAllocations(f: AllocFile): string {
  const ids = Object.keys(f.houses).sort();
  if (!ids.length) return '{\n "v": 1,\n "houses": {}\n}\n';
  return `{\n "v": 1,\n "houses": {\n${ids.map(id => `  ${JSON.stringify(id)}: ${JSON.stringify(f.houses[id])}`).join(',\n')}\n }\n}\n`;
}
/** a house's allocation, or null when it has none (it suits everything) */
export const allocOf = (f: AllocFile, id: string): HouseAlloc | null => (Object.prototype.hasOwnProperty.call(f.houses, id) ? f.houses[id]! : null);
/** whether a house suits a road angle and a look state: a house with no allocation suits everything; else both must be in its lists */
export function allows(f: AllocFile, id: string, road: Road, state: PresetState): boolean {
  const a = allocOf(f, id);
  return !a || (a.roads.includes(road) && a.states.includes(state));
}
/** the file with one house's allocation set (null: removed, the house suits everything again) */
export function withAlloc(f: AllocFile, id: string, a: HouseAlloc | null): AllocFile {
  const houses = { ...f.houses };
  const c = a ? clampAlloc(a) : null;
  if (c) houses[id] = c; else delete houses[id];
  return { v: 1, houses };
}
/** an allocation with one road or state toggled; a house with none starts from "everything" (what it suited before) */
export function toggled(a: HouseAlloc | null, what: { road: Road } | { state: PresetState }): HouseAlloc {
  const b = a ?? { roads: [...ALL_ROADS], states: [...ALL_STATES] };
  if ('road' in what) { const on = b.roads.includes(what.road); return { roads: ALL_ROADS.filter(r => (r === what.road ? !on : b.roads.includes(r))), states: [...b.states] }; }
  const on = b.states.includes(what.state);
  return { roads: [...b.roads], states: ALL_STATES.filter(s => (s === what.state ? !on : b.states.includes(s))) };
}

/** the allocations merged per house (POST /__dev/allocations): the file's houses with each upserted one replaced (an allocation) or removed (null),
 *  every other house kept as it is on disk. Refused: a file that does not parse, an upsert that is not an object of ids to allocations or null.
 *  ok: the text to write and the count of houses set */
export function mergeAllocations(fileText: string, upsert: unknown): { ok: true; text: string; count: number } | { ok: false; error: string } {
  let file: AllocFile;
  try { file = parseAllocations(fileText.trim() ? JSON.parse(fileText) : {}); } catch { return { ok: false, error: 'house-allocations.json on disk does not parse' }; }
  if (!upsert || typeof upsert !== 'object' || Array.isArray(upsert)) return { ok: false, error: 'upsert must be an object of house ids to allocations (or null)' };
  for (const [id, a] of Object.entries(upsert)) {
    if (!ID.test(id)) return { ok: false, error: `not a house id: ${id}` };
    if (a !== null && !clampAlloc(a)) return { ok: false, error: `${id}: an allocation is { roads: [...], states: [...] } or null` };
    file = withAlloc(file, id, a as HouseAlloc | null);
  }
  return { ok: true, text: formatAllocations(file), count: Object.keys(file.houses).length };
}

/** a road angle's short words (the inspector's line): its arrow and number */
export const ROAD_ARROWS = ['↙', '↓', '↘', '→', '↗', '↑', '↖', '←'] as const;
/** a look state as the owner names it: decrepit for the lab's declined */
export const STATE_WORDS: Readonly<Record<PresetState, string>> = { built: 'built', upgraded: 'upgraded', declined: 'decrepit' };
