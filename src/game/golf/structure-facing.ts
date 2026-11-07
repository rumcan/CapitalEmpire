import { OBJECT_EIGHT_SETS } from '../object-eight-library';
import { objectFacings } from '../object-eight';
import { eventArtSet, legacyObjectFacing, type ObjectFacing } from '../object-eight-core';
import type { ObjectEightSet, ObjectFacingKey } from '../object-eight-types';
import { STRUCTURE_SPRITE, FALLBACK_STRUCTURE_SPRITE } from './structure-art';

export interface StructureFacingState { typeId: string; rotated?: boolean; facing?: ObjectFacingKey; visualTier?: string }
export function structureFacings(s: StructureFacingState, sets: readonly ObjectEightSet[] = OBJECT_EIGHT_SETS, lookup = objectFacings): ObjectFacing {
  const set = eventArtSet(sets, s.typeId, s.visualTier);
  return lookup(set?.subject ?? STRUCTURE_SPRITE[s.typeId] ?? FALLBACK_STRUCTURE_SPRITE);
}
export function structurePicture(s: StructureFacingState, sets: readonly ObjectEightSet[] = OBJECT_EIGHT_SETS, lookup = objectFacings): { id: string; facing: ObjectFacingKey; flip: false; info: ObjectFacing } {
  const info = structureFacings(s, sets, lookup), wanted = s.facing ?? legacyObjectFacing(s.rotated), at = Math.max(0, info.keys.indexOf(wanted));
  return { id: info.ids[at]!, facing: info.keys[at]!, flip: false, info };
}
export function nextStructureFacing(s: StructureFacingState, sets: readonly ObjectEightSet[] = OBJECT_EIGHT_SETS, lookup = objectFacings): ObjectFacingKey {
  const p = structurePicture(s, sets, lookup), at = p.info.keys.indexOf(p.facing);
  return p.info.keys[(at + 1) % p.info.keys.length]!;
}
