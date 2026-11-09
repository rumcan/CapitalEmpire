import FILE from './object-eight-existing.json';
import type { LibItem } from './types';
import { OBJECT_FACING_KEYS, type ObjectEightSet, type ObjectFacingKey } from './object-eight-types';
interface ExistingSet extends ObjectEightSet { sourceIds: Record<ObjectFacingKey, string>; runtimeEnabled?: boolean }
const REGISTERED_ROWS = FILE.sets as unknown as readonly ExistingSet[];
export const EXISTING_OBJECT_EIGHT_SETS = REGISTERED_ROWS.filter(s => s.runtimeEnabled !== false);
/** Reuse packed native art, with standalone yaw8 bounds; preserve all old rows/UVs and road-lot boxes. */
export function appendExistingObjectEight(library: LibItem[]): void {
  const by = new Map(library.map(i => [i.id, i]));
  for (const s of REGISTERED_ROWS) for (const key of OBJECT_FACING_KEYS) {
    const source = by.get(s.sourceIds[key]); if (!source) continue;
    library.push({ ...source, id: s.views[key].id, name: `${s.name} (${key})`, cat: 'New: Eight-view objects', boxes: s.views[key].boxes, ...(s.person ? { person: true as const } : {}) });
  }
}
