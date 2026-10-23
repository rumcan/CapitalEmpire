// Golf tournament parking fee demand curve and parking income helpers (docs/GOLF-PLAN.md sections 5.2, 7, and 9). Pure TS, no DOM.

/** default parking fee per car ($/car) in ParkingTool (parking-tool.ts fee = 5) and City (city.ts parkFee = 5) */
export const DEFAULT_PARKING_FEE = 5;

/** fee ($/car) at or below which parking demand multiplier is 1.0 */
export const PARKING_FEE_FREE = 0;

/** fee ($/car) at or above which parking demand multiplier reaches its clamped floor (0.7) */
export const PARKING_FEE_HIGH = 20;

/** maximum parking demand multiplier at $0 fee */
export const PARKING_DEMAND_MAX = 1.0;

/** minimum parking demand multiplier at $20+ fee (clamped) */
export const PARKING_DEMAND_MIN = 0.7;

/**
 * Pure demand multiplier for tournament arrivals as a function of the parking fee ($/car).
 * Falls linearly from 1.0 at $0 to 0.7 at $20, clamped to [0.7, 1.0].
 */
export function parkingDemandMultiplier(fee: number): number {
  if (!Number.isFinite(fee) || fee <= PARKING_FEE_FREE) return PARKING_DEMAND_MAX;
  if (fee >= PARKING_FEE_HIGH) return PARKING_DEMAND_MIN;
  const share = (fee - PARKING_FEE_FREE) / (PARKING_FEE_HIGH - PARKING_FEE_FREE);
  const mul = PARKING_DEMAND_MAX - share * (PARKING_DEMAND_MAX - PARKING_DEMAND_MIN);
  return Math.round(mul * 10000) / 10000;
}

/** scale tournament crowd (spectators or cars) by the parking fee demand multiplier */
export function applyParkingFeeDemand(crowd: number, fee: number): number {
  if (crowd <= 0) return 0;
  return Math.max(0, Math.round(crowd * parkingDemandMultiplier(fee)));
}

/** sum the cars that actually parked from car park views, the surge's per-town parked counts, or TownResult rows */
export function countParkedCars(
  parks?: readonly { readonly parked: number }[] | null,
  surge?: { readonly parked?: readonly number[] } | null,
  byTown?: readonly { readonly parked?: number }[] | null,
): number {
  const fromParks = parks ? parks.reduce((sum, p) => sum + Math.max(0, Math.round(p.parked)), 0) : 0;
  const fromSurge = surge?.parked ? surge.parked.reduce((sum, n) => sum + Math.max(0, Math.round(n)), 0) : 0;
  const fromTowns = byTown ? byTown.reduce((sum, t) => sum + Math.max(0, Math.round(t.parked ?? 0)), 0) : 0;
  return Math.max(fromParks, fromSurge, fromTowns);
}

/** bookable tournament parking income ($): cars that actually parked times the parking fee per car */
export function computeParkingIncome(carsParked: number, fee: number): number {
  if (!Number.isFinite(carsParked) || !Number.isFinite(fee) || carsParked <= 0 || fee <= 0) return 0;
  return Math.max(0, Math.round(Math.max(0, carsParked) * Math.max(0, fee)));
}
