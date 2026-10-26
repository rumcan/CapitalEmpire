// The house allocations as the lot lab holds them (T155, dev builds only): read from house-allocations.json (lots/house-alloc.ts), changed one
// house at a time and saved through the dev server's per-house merge (POST /__dev/allocations), so two helpers' saves never overwrite each other.
// A save from elsewhere (another lab tab, a helper on the network) hot-reloads the file here with no page reload.
import FILE from '../lots/house-allocations.json';
import { parseAllocations, withAlloc, type AllocFile, type HouseAlloc } from '../lots/house-alloc';

let file: AllocFile = parseAllocations(FILE);
/** the edits sent and not yet answered: a reload from disk meanwhile keeps them (it may predate them) */
const pending = new Map<string, HouseAlloc | null>();
let listener: (() => void) | null = null;

/** the allocations now (what the lab filters houses with) */
export const allocations = (): AllocFile => file;
/** calls fn when the allocations changed on disk (another tab's or helper's save); one listener (the lab); returns the unsubscribe */
export function onAllocations(fn: () => void): () => void { listener = fn; return () => { if (listener === fn) listener = null; }; }
/** sets one house's allocation (null: unset, the house suits everything again) here at once, and saves it through the dev server's merge */
export async function saveAllocation(id: string, a: HouseAlloc | null): Promise<void> {
  file = withAlloc(file, id, a); pending.set(id, a);
  try {
    const r = await fetch('/__dev/allocations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ upsert: { [id]: a } }) });
    if (!r.ok) throw new Error(`save house-allocations.json: ${r.status} ${await r.text()}`);
  } finally { if (pending.get(id) === a) pending.delete(id); }
}
// the dev server: a saved house-allocations.json replaces the allocations in place (the edits still in flight kept over it)
if (import.meta.hot) import.meta.hot.accept('../lots/house-allocations.json', m => {
  if (!m) return;
  let f = parseAllocations(m.default);
  for (const [id, a] of pending) f = withAlloc(f, id, a);
  file = f; listener?.();
});
