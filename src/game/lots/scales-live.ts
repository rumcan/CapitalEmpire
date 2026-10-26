// The studio's sizes, live in a running dev game (T163, the owner: "parked cars on the lots are not the same size as the ones saved in the
// library?"). scales.ts (generated) reads scripts/assets/scale-overrides.json once; when the studio saves a size, Vite hot-updates the modules
// above it (App.tsx is a React refresh boundary) and the running game keeps its old copy, so its lots draw the old size while the studio's card
// shows the new one, until the page is reloaded by hand. Here the saved file is applied to the running game's own tables in place (STUDIO_SCALE,
// OWNER_SCALE: the same rule scales.ts applies at load) and the listeners are told (the dev editor: the car facings again, every lot composed
// again). Dev builds load it (lot-editor.ts); a production build never changes its sizes.
import STUDIO from '../../../scripts/assets/scale-overrides.json';
import { OWNER_SCALE, STUDIO_SCALE, TABLE_SCALE } from './scales';
import { forgetCarSizes } from '../ext/car-art';

const listeners = new Set<() => void>();
/** calls fn after the studio's sizes changed in the running game; returns the unsubscribe */
export function onStudioScales(fn: () => void): () => void { listeners.add(fn); return () => { listeners.delete(fn); }; }
/** the studio's sizes now: next replaces them in the running game's tables, in place (scales.ts's rule: a studio size wins; a size no longer set
 *  falls back to the owner's table, TABLE_SCALE, or to none); the listeners are told. Returns the ids whose size changed */
export function applyStudioScales(next: Readonly<Record<string, number>>): string[] {
  const studio = STUDIO_SCALE as Record<string, number>, changed: string[] = [];
  for (const id of new Set([...Object.keys(studio), ...Object.keys(next)])) {
    const v = typeof next[id] === 'number' ? next[id] : TABLE_SCALE[id];
    if (v === undefined) delete OWNER_SCALE[id]; else OWNER_SCALE[id] = v;
    if (studio[id] !== next[id]) changed.push(id);
  }
  for (const id of Object.keys(studio)) if (!(id in next)) delete studio[id];
  Object.assign(studio, next);
  forgetCarSizes();
  if (changed.length) for (const f of listeners) f();
  return changed;
}
// the dev server: a saved scale-overrides.json (the studio's Library, the dev editor's "this sprite everywhere") reaches the running game at once
if (import.meta.hot) import.meta.hot.accept('../../../scripts/assets/scale-overrides.json', m => { if (m) applyStudioScales((m as unknown as { default: Record<string, number> }).default); });
/** the sizes file this module was loaded with (the tests' starting point) */
export const STUDIO_AT_LOAD: Readonly<Record<string, number>> = { ...STUDIO };
