// Park-and-ride lot qualification for golf tournament tiers (G6; docs/GOLF-PLAN.md sections 5.1 and 5.2). Pure TS, no DOM.
import type { BusRouteDef } from '../event/bus';
import type { CarParkDef } from '../event/carpark';
import type { Pt } from '../network';
import type { Need } from './tour';

/** minimum Euclidean distance in tiles from the clubhouse to a car park's centre to qualify as a remote park-and-ride lot */
export const MIN_PARK_RIDE_DIST_TILES = 80;

/** minimal car park rectangle with id */
export type ParkRideLotInput = Pick<CarParkDef, 'id' | 'x' | 'y' | 'w' | 'h'>;

/** minimal shuttle bus route referencing its lot stop's car park id */
export type ParkRideBusInput = Pick<BusRouteDef, 'park'> & Partial<Pick<BusRouteDef, 'id' | 'sx' | 'sy' | 'dx' | 'dy' | 'buses' | 'seats' | 'town'>>;

/** centre point (tiles) of a car park rectangle */
export function parkCentre(park: Pick<CarParkDef, 'x' | 'y' | 'w' | 'h'>): Pt {
  return { x: park.x + park.w / 2, y: park.y + park.h / 2 };
}

/** Euclidean distance in tiles between the clubhouse and a car park's centre */
export function distFromClubhouse(clubhouse: Pt, park: Pick<CarParkDef, 'x' | 'y' | 'w' | 'h'>): number {
  const c = parkCentre(park);
  return Math.hypot(c.x - clubhouse.x, c.y - clubhouse.y);
}

/** whether a car park is served by at least one active shuttle bus route in busDefs */
export function hasBusRouteForPark(parkId: number, busDefs: readonly ParkRideBusInput[]): boolean {
  if (parkId <= 0) return false;
  return busDefs.some(b => b.park === parkId && (b.buses === undefined || b.buses > 0));
}

/** whether a car park qualifies as a remote park-and-ride lot (centre >= 80 tiles from clubhouse and served by a bus route) */
export function isParkAndRideLot(
  clubhouse: Pt,
  park: ParkRideLotInput,
  busDefs: readonly ParkRideBusInput[],
  minDistTiles = MIN_PARK_RIDE_DIST_TILES,
): boolean {
  return distFromClubhouse(clubhouse, park) >= minDistTiles && hasBusRouteForPark(park.id, busDefs);
}

/**
 * Determine which of 'parkRide' (1+ qualifying lots) and 'parkRide2' (2+ qualifying lots) are satisfied
 * given the clubhouse position, placed car parks (parkDefs), and shuttle bus routes (busDefs).
 */
export function parkRideNeeds(
  clubhouse: Pt | null | undefined,
  parkDefs: readonly ParkRideLotInput[],
  busDefs: readonly ParkRideBusInput[],
  minDistTiles = MIN_PARK_RIDE_DIST_TILES,
): Need[] {
  if (!clubhouse) return [];
  const seenIds = new Set<number>();
  let count = 0;
  for (const p of parkDefs) {
    if (seenIds.has(p.id)) continue;
    if (isParkAndRideLot(clubhouse, p, busDefs, minDistTiles)) {
      seenIds.add(p.id);
      count++;
    }
  }
  const needs: Need[] = [];
  if (count >= 1) needs.push('parkRide');
  if (count >= 2) needs.push('parkRide2');
  return needs;
}

/** alias for parkRideNeeds */
export const evaluateParkRide = parkRideNeeds;
