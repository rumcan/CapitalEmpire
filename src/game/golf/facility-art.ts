import { OBJECT_EIGHT_SETS } from '../object-eight-library';
import { eventArtSet, legacyObjectFacing } from '../object-eight-core';
import { OBJECT_FACING_KEYS, isObjectFacing, type ObjectEightSet, type ObjectFacingKey } from '../object-eight-types';
import { STRUCTURE } from './tents';
import { seatingProblems } from './event-seating';

/** Minimal physical/art state, shared with the worker without importing the full sprite library. */
export interface FacilityArtState { typeId: string; rotated?: boolean; facing?: ObjectFacingKey; visualTier?: string }

/** New facility metadata must contain all eight reviewed pictures and approved real rows for the catalogue seat count. */
export function facilityArtReadiness(s: FacilityArtState, sets: readonly ObjectEightSet[] = OBJECT_EIGHT_SETS): { ready: boolean; reason: string } {
  const def = STRUCTURE[s.typeId];
  if (!def) return { ready: false, reason: 'Unknown facility' };
  if (!def.requiresEightArt) return { ready: true, reason: '' };
  const set = eventArtSet(sets, s.typeId, s.visualTier ?? 'budget');
  if (!set) return { ready: false, reason: 'Eight-view pictures are still being prepared' };
  const ids = OBJECT_FACING_KEYS.map(key => set.views[key]?.id);
  if (ids.some(id => !id) || new Set(ids).size !== 8) return { ready: false, reason: 'All eight reviewed pictures are required' };
  if (Math.abs(set.footprintMetres.width - def.footprint.w * 2) > 1e-6 || Math.abs(set.footprintMetres.depth - def.footprint.h * 2) > 1e-6) return { ready: false, reason: 'Physical size does not match this facility' };
  if (set.capacity !== undefined && set.capacity !== def.capacity) return { ready: false, reason: 'Seat count does not match this facility' };
  for (const key of OBJECT_FACING_KEYS) {
    if (!Number.isFinite(set.views[key]?.headingDegrees)) return { ready: false, reason: 'A reviewed physical view heading is required' };
    const issues = seatingProblems(set.views[key]?.seating ?? set.seating, def.capacity, set.footprintMetres);
    if (issues.length) return { ready: false, reason: issues[0]! };
  }
  return { ready: true, reason: '' };
}

/** Actual authored physical heading and seating; missing rows stay missing instead of becoming an accepted generic stand. */
export function structureSeating(s: FacilityArtState, sets: readonly ObjectEightSet[] = OBJECT_EIGHT_SETS) {
  const set = eventArtSet(sets, s.typeId, s.visualTier), key = isObjectFacing(s.facing) ? s.facing : legacyObjectFacing(s.rotated), view = set?.views[key];
  const headingDegrees = view?.headingDegrees ?? ({ normalNE: 0, yaw8N: 37, normalSE: 90, yaw8E: 127, normalSW: 180, yaw8S: 217, normalNW: 270, yaw8W: 307 })[key];
  return { layout: view?.seating ?? set?.seating, headingDegrees, footprint: set?.footprintMetres };
}
