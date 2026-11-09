import { OBJECT_FACING_KEYS, type ObjectEightSet, type ObjectFacingKey } from './object-eight-types';

export interface ObjectFacing {
  subject: string; ids: readonly string[]; keys: readonly ObjectFacingKey[]; at: number;
  mode: 'eight' | 'four' | 'single'; missing: readonly ObjectFacingKey[]; set?: ObjectEightSet;
}
/** The manifest is explicit authority for yaw8. Merely having a square-axis set never qualifies. */
export function createObjectFacings(sets: readonly ObjectEightSet[], has: (id: string) => boolean,
  legacy: (id: string) => { views: readonly string[]; at: number } | null,
  subjectOf: (id: string) => string = id => id): (id: string) => ObjectFacing {
  const by = new Map<string, ObjectEightSet>();
  for (const s of sets) {
    if (s.review !== 'approved' || s.projection !== 'normal+yaw8') continue;
    for (const id of [s.subject, ...(s.aliases ?? []), ...OBJECT_FACING_KEYS.map(k => s.views[k]?.id).filter(Boolean)]) by.set(id, s);
  }
  return id => {
    const s = by.get(id) ?? by.get(subjectOf(id));
    if (s) {
      const missing = OBJECT_FACING_KEYS.filter(k => !s.views[k] || !has(s.views[k].id));
      if (!missing.length && new Set(OBJECT_FACING_KEYS.map(k => s.views[k].id)).size === 8) return { subject: s.subject, ids: OBJECT_FACING_KEYS.map(k => s.views[k].id), keys: OBJECT_FACING_KEYS, at: Math.max(0, OBJECT_FACING_KEYS.findIndex(k => s.views[k].id === id)), mode: 'eight', missing, set: s };
      const v = legacy(id);
      return { subject: s.subject, ids: v?.views ?? [id], keys: v ? ['normalNE','normalSE','normalSW','normalNW'] : ['normalNE'], at: v?.at ?? 0, mode: v ? 'four' : 'single', missing };
    }
    const v = legacy(id);
    return { subject: subjectOf(id), ids: v?.views ?? [id], keys: v ? ['normalNE','normalSE','normalSW','normalNW'] : ['normalNE'], at: v?.at ?? 0, mode: v ? 'four' : 'single', missing: ['yaw8N','yaw8E','yaw8S','yaw8W'] };
  };
}
export function facingAt(v: ObjectFacing, turn: number): { id: string; key: ObjectFacingKey; flip: false } {
  const at = ((Math.round(turn) % v.ids.length) + v.ids.length) % v.ids.length;
  return { id: v.ids[at]!, key: v.keys[at]!, flip: false };
}
/** Legacy boolean meant an x/y quarter turn. Existing saves keep that exact physical orientation. */
export const legacyObjectFacing = (rotated?: boolean): ObjectFacingKey => rotated ? 'normalSE' : 'normalNE';
/** Explicit legacy aliases replace normal corner art only, retaining the old flip-to-partner contract. */
export function objectNormalReplacements(sets: readonly ObjectEightSet[], cornersOf: (base: string) => readonly string[] | null): ReadonlyMap<string, readonly [string, string]> {
  const out = new Map<string, readonly [string, string]>();
  for (const s of sets) {
    if (s.runtimeReuse) continue;
    const normal = [s.views.normalNE.id, s.views.normalSE.id, s.views.normalSW.id, s.views.normalNW.id];
    for (const base of [s.subject, ...(s.aliases ?? [])]) cornersOf(base)?.forEach((id, i) => {
      if (i > 3 || (i && id === base)) return;
      out.set(id, [normal[i]!, normal[i ^ 1]!]);
    });
  }
  return out;
}
export function eventArtSet(sets: readonly ObjectEightSet[], typeId: string, visualTier?: string): ObjectEightSet | undefined {
  const matches = sets.filter(s => s.review === 'approved' && s.projection === 'normal+yaw8' && s.eventTypes?.includes(typeId));
  const canonical = (tier?: string) => tier === 'worn' || tier === 'rundown' ? 'budget' : tier;
  const tier = canonical(visualTier) ?? (matches.some(s => canonical(s.visualTier) === 'budget') ? 'budget' : matches[0]?.visualTier);
  return [...matches].reverse().find(s => !tier || canonical(s.visualTier) === tier);
}
