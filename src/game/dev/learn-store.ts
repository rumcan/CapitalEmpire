// The lot wizard's samples as the lab holds them (T158, dev builds only): read from lot-learning.json (lots/learn.ts), the model built from them,
// a new sample added here at once (the model learns it) and appended through the dev server's merge (POST /__dev/learning), so several people
// can train together. A save from elsewhere hot-reloads the file here (the samples still in flight kept over it).
import FILE from '../lots/lot-learning.json';
import { buildModel, learn, parseLearning, type Model, type Sample } from '../lots/learn';

let samples: Sample[] = parseLearning(FILE).samples, model: Model = buildModel(samples);
const pending = new Map<string, Sample>();
let listener: (() => void) | null = null;

/** the samples now, oldest first, and the model built from them */
export const learnedSamples = (): readonly Sample[] => samples;
export const learnedModel = (): Model => model;
/** calls fn when the samples changed on disk (another person's save); one listener (the wizard); returns the unsubscribe */
export function onLearning(fn: () => void): () => void { listener = fn; return () => { if (listener === fn) listener = null; }; }
/** a sample added: here at once (the model learns it), then appended to lot-learning.json through the dev server */
export async function addSample(s: Sample): Promise<void> {
  samples = [...samples, s]; learn(model, s); pending.set(s.id, s);
  try {
    const r = await fetch('/__dev/learning', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ add: [s] }) });
    if (!r.ok) throw new Error(`save lot-learning.json: ${r.status} ${await r.text()}`);
  } finally { pending.delete(s.id); }
}
// the dev server: a saved lot-learning.json replaces the samples (those in flight kept over it) and the model is built again
if (import.meta.hot) import.meta.hot.accept('../lots/lot-learning.json', m => {
  if (!m) return;
  const list = parseLearning(m.default).samples, have = new Set(list.map(s => s.id));
  for (const s of pending.values()) if (!have.has(s.id)) list.push(s);
  samples = list; model = buildModel(samples); listener?.();
});
