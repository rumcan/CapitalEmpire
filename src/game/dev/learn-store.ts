// The lot wizard's samples as the lab holds them (T158, dev builds only): read from lot-learning.json (lots/learn.ts), the model built from them,
// a new sample added here at once (the model learns it) and appended through the dev server's merge (POST /__dev/learning), so several people
// can train together. A save from elsewhere hot-reloads the file here (the samples still in flight kept over it).
import FILE from '../lots/lot-learning.json';
import { buildModel, learn, parseLearning, type Model, type Sample } from '../lots/learn';
import { buildTaste, learnTaste, type Taste } from '../lots/taste';
import { layModelFrom, lotPresets, type LayModel } from '../lots/compose';
import { LATEST, LOT_MODELS } from '../lots/lot-models';
import { liveModelData } from './live-model';
import type { LotPreset } from '../lots/presets';

let samples: Sample[] = parseLearning(FILE).samples, model: Model = buildModel(samples), taste: Taste = buildTaste(samples);
const pending = new Map<string, Sample>();
let listener: (() => void) | null = null;

/** T173: the live model (live-model.ts: the latest shipped model's parts learnt again from the presets and the owner's samples, each group its
 *  own), made again when the samples, the presets or the latest model change; its data (what Ship model ships) and its LayModel (what the
 *  wizard and the gallery lay with: every group, on in the game or not) */
let live: { key: [readonly Sample[], readonly LotPreset[], unknown]; data: Record<string, unknown>; lay: LayModel } | null = null;
export function liveModel(): { data: Record<string, unknown>; lay: LayModel } {
  const pr = lotPresets(), latest = LOT_MODELS[LATEST];
  if (!live || live.key[0] !== samples || live.key[1] !== pr || live.key[2] !== latest) { const data = liveModelData(pr, samples, latest, new Date().toISOString()); live = { key: [samples, pr, latest], data, lay: layModelFrom(data, true) }; }
  return live;
}
/** the samples now, oldest first, and the model built from them */
export const learnedSamples = (): readonly Sample[] => samples;
export const learnedModel = (): Model => model;
/** the pairs and densities by state learnt from them (T161, lots/taste.ts) */
export const learnedTaste = (): Taste => taste;
/** calls fn when the samples changed on disk (another person's save); one listener (the wizard); returns the unsubscribe */
export function onLearning(fn: () => void): () => void { listener = fn; return () => { if (listener === fn) listener = null; }; }
/** a sample added: here at once (the model learns it), then appended to lot-learning.json through the dev server */
export function addSample(s: Sample): Promise<void> { return addSamples([s]); }
/** samples added in one save (T159: the presets' samples): a sample with an id held already replaces it (a preset's, learnt again), the model is
 *  built again then; else each is learnt. One request through the dev server's merge */
export async function addSamples(list: readonly Sample[]): Promise<void> {
  if (!list.length) return;
  const ids = new Set(list.map(s => s.id)), again = samples.some(s => ids.has(s.id));
  samples = [...samples.filter(s => !ids.has(s.id)), ...list];
  if (again) { model = buildModel(samples); taste = buildTaste(samples); } else for (const s of list) { learn(model, s); learnTaste(taste, s); }
  for (const s of list) pending.set(s.id, s);
  try {
    const r = await fetch('/__dev/learning', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ add: list }) });
    if (!r.ok) throw new Error(`save lot-learning.json: ${r.status} ${await r.text()}`);
  } finally { for (const s of list) if (pending.get(s.id) === s) pending.delete(s.id); }
}
// the dev server: a saved lot-learning.json replaces the samples (those in flight kept over it) and the model is built again
if (import.meta.hot) import.meta.hot.accept('../lots/lot-learning.json', m => {
  if (!m) return;
  const list = parseLearning(m.default).samples, have = new Set(list.map(s => s.id));
  for (const s of pending.values()) if (!have.has(s.id)) list.push(s);
  samples = list; model = buildModel(samples); taste = buildTaste(samples); listener?.();
});
