import { OBJECT_EIGHT_SETS } from '../object-eight-library';
import { objectFacings } from '../object-eight';
import { eventArtSet, legacyObjectFacing, type ObjectFacing } from '../object-eight-core';
import { OBJECT_FACING_KEYS, type ObjectEightSet, type ObjectFacingKey } from '../object-eight-types';
import { STRUCTURE_SPRITE, FALLBACK_STRUCTURE_SPRITE } from './structure-art';
import { STRUCTURE } from './tents';
import { facilityArtReadiness } from './facility-art';
export { structureSeating } from './facility-art';

export interface StructureFacingState { typeId: string; rotated?: boolean; facing?: ObjectFacingKey; visualTier?: string }
export function structureFacings(s: StructureFacingState, sets: readonly ObjectEightSet[] = OBJECT_EIGHT_SETS, lookup = objectFacings): ObjectFacing {
  const set = eventArtSet(sets, s.typeId, s.visualTier);
  return lookup(set?.subject ?? STRUCTURE_SPRITE[s.typeId] ?? FALLBACK_STRUCTURE_SPRITE);
}
export function structurePicture(s: StructureFacingState, sets: readonly ObjectEightSet[] = OBJECT_EIGHT_SETS, lookup = objectFacings): { id: string; facing: ObjectFacingKey; flip: false; info: ObjectFacing } {
  if (STRUCTURE[s.typeId]?.requiresEightArt && !structureArtReadiness(s, sets, lookup).ready) return {
    id: '', facing: s.facing ?? legacyObjectFacing(s.rotated), flip: false,
    info: { subject: `event:${s.typeId}`, ids: [], keys: [], at: 0, mode: 'single', missing: OBJECT_FACING_KEYS },
  };
  const info = structureFacings(s, sets, lookup), wanted = s.facing ?? legacyObjectFacing(s.rotated), at = Math.max(0, info.keys.indexOf(wanted));
  return { id: info.ids[at]!, facing: info.keys[at]!, flip: false, info };
}
export function nextStructureFacing(s: StructureFacingState, sets: readonly ObjectEightSet[] = OBJECT_EIGHT_SETS, lookup = objectFacings): ObjectFacingKey {
  const p = structurePicture(s, sets, lookup), at = p.info.keys.indexOf(p.facing);
  return p.info.keys.length ? p.info.keys[(at + 1) % p.info.keys.length]! : p.facing;
}

/** New facility availability follows reviewed native art AND valid seating for every authored facing, never a scaled legacy stand-in. */
export function structureArtReadiness(s: StructureFacingState, sets: readonly ObjectEightSet[] = OBJECT_EIGHT_SETS, lookup = objectFacings): { ready: boolean; reason: string } {
  const metadata = facilityArtReadiness(s, sets), def = STRUCTURE[s.typeId];
  if (!metadata.ready) return metadata;
  if (!def.requiresEightArt) return { ready: true, reason: '' };
  const set = eventArtSet(sets, s.typeId, s.visualTier ?? 'budget')!, info = lookup(set.subject);
  if (info.mode !== 'eight' || info.missing.length || info.ids.length !== 8) return { ready: false, reason: 'All eight reviewed pictures are required' };
  return { ready: true, reason: '' };
}
