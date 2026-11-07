import type { StructureType } from './tents';
import { proposedSeating, type AuthoredSeating } from './event-seating';
import { OBJECT_EIGHT_SETS } from '../object-eight-library';
import { eventArtSet } from '../object-eight-core';
import type { ObjectEightSet } from '../object-eight-types';

/** Exactly two visual conditions for event seating; tour tier and seat capacity remain separate. */
export type FacilityCondition = 'budget' | 'upgraded';
/** Older worn/rundown wording is an alias of the budget condition, never a third upgrade level. */
export const facilityCondition = (value?: string): FacilityCondition => value === 'upgraded' ? 'upgraded' : 'budget';

/** True when the type has a reviewed upgraded picture set (visual only; the condition's fee applies to it). */
export function hasUpgradedArt(typeId: string, sets: readonly ObjectEightSet[] = OBJECT_EIGHT_SETS): boolean {
  return eventArtSet(sets, typeId, 'upgraded')?.visualTier === 'upgraded';
}

/** The one-time upgraded-condition fee ($): upgradeCost when set, else half the rent (or a tenth of buy when rent is 0), to the nearest 50. */
export function improvementCost(def: StructureType): number {
  return def.upgradeCost ?? Math.round((def.rent > 0 ? def.rent / 2 : def.buy / 10) / 50) * 50;
}

/** A one-time visual improvement offer for a new facility; no offer means no fee can be charged again or applied to an existing type. */
export function facilityImprovement(def: StructureType | undefined, current: string | undefined, money: number, art: { ready: boolean; reason: string }) {
  if (!def || !(def.requiresEightArt || hasUpgradedArt(def.id)) || facilityCondition(current) === 'upgraded') return null;
  const cost = improvementCost(def);
  return { cost, available: art.ready && money >= cost, reason: !art.ready ? art.reason : money < cost ? 'Not enough money' : '' };
}

/** New seating types with provisional rental balance, approved by the lead on 2026-11-07. Existing catalogue prices are unchanged. */
export const SEATING_FACILITIES: StructureType[] = [
  { id: 'seatedPavilion24', name: 'Seated pavilion · 24', kind: 'grandstand', footprint: { w: 4, h: 3 }, rent: 600, buy: 0, capacity: 24, unit: 'seats', tier: 1, upgradeCost: 300, requiresEightArt: true, blurb: 'A compact roofed pavilion with three rows of eight seats.' },
  { id: 'seatedPavilion60', name: 'Seated pavilion · 60', kind: 'grandstand', footprint: { w: 6, h: 4 }, rent: 1200, buy: 0, capacity: 60, unit: 'seats', tier: 2, upgradeCost: 600, requiresEightArt: true, blurb: 'A medium roofed pavilion for a busier hole.' },
  { id: 'seatedPavilion120', name: 'Seated pavilion · 120', kind: 'grandstand', footprint: { w: 9, h: 5 }, rent: 2400, buy: 0, capacity: 120, unit: 'seats', tier: 3, upgradeCost: 1200, requiresEightArt: true, blurb: 'A spacious roofed pavilion for a larger gallery.' },
  { id: 'compactBleacher60', name: 'Compact bleacher · 60', kind: 'grandstand', footprint: { w: 4, h: 2 }, rent: 900, buy: 0, capacity: 60, unit: 'seats', tier: 1, upgradeCost: 450, requiresEightArt: true, blurb: 'Five short rows of bench seating with proper end access.' },
];

/** Planned geometry is a draft art brief, never a reviewed substitute for measured seat anchors. */
export const SEATING_PROPOSALS: Readonly<Record<string, AuthoredSeating>> = {
  seatedPavilion24: proposedSeating(8, 3), seatedPavilion60: proposedSeating(10, 6), seatedPavilion120: proposedSeating(15, 8), compactBleacher60: proposedSeating(12, 5, true),
};
