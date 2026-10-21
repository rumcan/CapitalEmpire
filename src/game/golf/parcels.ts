// Course land ownership as a rectangle list, adjacent block pricing by land class and buildings, adjacency checks, and GolfSave.parcel bounds (docs/GOLF-PLAN.md sections 3 and 4.4). Pure TS, no DOM.
import type { Rect } from './mode';
import { TILE_M } from './types';

/** land class of a candidate block beside the course (GOLF-PLAN 4.4) */
export type ParcelLandClass = 'farm' | 'open' | 'town' | 'commercial' | 'industrial' | 'unbuildable';

/** base 1985 $/m² by land class (houses on a town block are bought out at the land price per GOLF-PLAN 4.4) */
export const LAND_PRICE_SQM: Record<ParcelLandClass, number> = {
  farm: 1,
  open: 1.25,
  town: 2,
  industrial: 3,
  commercial: 4,
  unbuildable: Infinity,
};

/** buyout surcharge ($) per non-residential building on a block (houses add $0 per GOLF-PLAN 4.4 so buying never becomes a demolition puzzle) */
export const BUILDING_SURCHARGE = 4000;

/** surcharge ($) per house on a block (0 per GOLF-PLAN 4.4: "the houses go and the price is the same as for empty land") */
export const HOUSE_SURCHARGE = 0;

/** gentle price rise per 1,000 town residents above the 1,000-resident start (GOLF-PLAN 3 and 4.4) */
export const POP_GROWTH_RATE = 0.05;

/** a candidate block to buy adjacent to the course parcel list */
export interface AdjacentBlock {
  rect: Rect;
  landClass: ParcelLandClass;
  /** residential houses on the block (bought out at the land price: $0 extra per house) */
  houses?: number;
  /** non-residential buildings (shops, works, farmsteads) on the block */
  buildings?: number;
  /** current town population (optional; scales price gently above 1,000 residents) */
  townPop?: number;
}

/** result of attempting to buy an adjacent block */
export interface BuyBlockResult {
  ok: boolean;
  parcels: Rect[];
  bounds: Rect;
  price: number;
  reason?: string;
}

/** whether a rectangle has positive width and height */
export function validRect(r: Rect): boolean { return r[2] > 0 && r[3] > 0; }

/** area of a single Rect [x, y, w, h] in square metres (1 tile² = TILE_M² = 4 m²) */
export function rectAreaSqm(r: Rect): number { return validRect(r) ? r[2] * r[3] * TILE_M * TILE_M : 0; }

/** merge a list of owned Rects [x, y, w, h] into a single bounding Rect [x, y, w, h] matching GolfSave.parcel style ([0, 0, 0, 0] when empty) */
export function mergeParcelBounds(parcels: readonly Rect[]): Rect {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of parcels) {
    if (!validRect(r)) continue;
    if (r[0] < x0) x0 = r[0];
    if (r[1] < y0) y0 = r[1];
    if (r[0] + r[2] > x1) x1 = r[0] + r[2];
    if (r[1] + r[3] > y1) y1 = r[1] + r[3];
  }
  return x0 <= x1 && y0 <= y1 ? [x0, y0, x1 - x0, y1 - y0] : [0, 0, 0, 0];
}

/** initial owned parcel list from a placed course plan (course, venue, carpark) */
export function courseParcelList(plan: { course: Rect; venue: Rect; carpark: Rect }): Rect[] {
  return [plan.course, plan.venue, plan.carpark];
}

/** whether point (x, y) in tiles lies inside or on the boundary of Rect r */
export function inRect(r: Rect, x: number, y: number): boolean {
  return validRect(r) && x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3];
}

/** whether point (x, y) in tiles lies in any Rect of the owned parcel list */
export function inParcels(parcels: readonly Rect[], x: number, y: number): boolean {
  for (const r of parcels) if (inRect(r, x, y)) return true;
  return false;
}

/** whether every corner of polygon pts (x0, y0, x1, y1, ...) lies in the owned parcel list */
export function polyInParcels(parcels: readonly Rect[], pts: readonly number[]): boolean {
  if (pts.length < 6) return false;
  for (let i = 0; i + 1 < pts.length; i += 2) if (!inParcels(parcels, pts[i]!, pts[i + 1]!)) return false;
  return true;
}

/** whether two Rects have a positive-area interior overlap */
export function rectsOverlap(a: Rect, b: Rect): boolean {
  if (!validRect(a) || !validRect(b)) return false;
  return Math.min(a[0] + a[2], b[0] + b[2]) > Math.max(a[0], b[0]) && Math.min(a[1] + a[3], b[1] + b[3]) > Math.max(a[1], b[1]);
}

/** whether two non-overlapping Rects share a boundary edge segment of positive length (corner-only contact is false) */
export function rectsTouchEdge(a: Rect, b: Rect): boolean {
  if (!validRect(a) || !validRect(b) || rectsOverlap(a, b)) return false;
  const xTouch = a[0] + a[2] === b[0] || b[0] + b[2] === a[0];
  const yOverlap = Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]);
  if (xTouch && yOverlap > 0) return true;
  const yTouch = a[1] + a[3] === b[1] || b[1] + b[3] === a[1];
  const xOverlap = Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]);
  return yTouch && xOverlap > 0;
}

/** whether candidate Rect is disjoint in interior from all owned parcels and shares a positive-length edge with at least one */
export function isAdjacentBlock(parcels: readonly Rect[], candidate: Rect): boolean {
  if (!validRect(candidate) || parcels.length === 0) return false;
  for (const r of parcels) if (rectsOverlap(r, candidate)) return false;
  for (const r of parcels) if (rectsTouchEdge(r, candidate)) return true;
  return false;
}

/** exact union area in m² of a list of Rects (overlapping rects are not double-counted) */
export function parcelsAreaSqm(parcels: readonly Rect[]): number {
  const valid = parcels.filter(validRect);
  if (!valid.length) return 0;
  const xs = Array.from(new Set(valid.flatMap(r => [r[0], r[0] + r[2]]))).sort((a, b) => a - b);
  const ys = Array.from(new Set(valid.flatMap(r => [r[1], r[1] + r[3]]))).sort((a, b) => a - b);
  let tiles = 0;
  for (let i = 0; i + 1 < xs.length; i++) {
    const xm = (xs[i]! + xs[i + 1]!) / 2, dx = xs[i + 1]! - xs[i]!;
    for (let j = 0; j + 1 < ys.length; j++) {
      const ym = (ys[j]! + ys[j + 1]!) / 2, dy = ys[j + 1]! - ys[j]!;
      if (valid.some(r => xm > r[0] && xm < r[0] + r[2] && ym > r[1] && ym < r[1] + r[3])) tiles += dx * dy;
    }
  }
  return tiles * TILE_M * TILE_M;
}

/** price ($) to buy a block by its area, land class, buildings on it (houses add $0, non-residential buildings add BUILDING_SURCHARGE), and town population */
export function adjacentBlockPrice(block: AdjacentBlock): number {
  const rate = LAND_PRICE_SQM[block.landClass];
  if (!Number.isFinite(rate) || !validRect(block.rect)) return Infinity;
  const sqm = rectAreaSqm(block.rect);
  const housesCost = Math.max(0, block.houses ?? 0) * HOUSE_SURCHARGE;
  const bldgCost = Math.max(0, block.buildings ?? 0) * BUILDING_SURCHARGE;
  const popExtra = Math.max(0, (block.townPop ?? 1000) - 1000) / 1000 * POP_GROWTH_RATE;
  return Math.round((sqm * rate + housesCost + bldgCost) * (1 + popExtra));
}

/** attempt to buy an adjacent block: checks buildability, adjacency, no overlap, and cash >= price; returns updated parcel list and GolfSave.parcel bounds */
export function buyAdjacentBlock(parcels: readonly Rect[], block: AdjacentBlock, cash: number): BuyBlockResult {
  const cur = parcels.map(r => [...r] as Rect);
  const price = adjacentBlockPrice(block);
  if (!validRect(block.rect)) return { ok: false, parcels: cur, bounds: mergeParcelBounds(cur), price, reason: 'Invalid block dimensions' };
  if (block.landClass === 'unbuildable' || !Number.isFinite(price)) {
    return { ok: false, parcels: cur, bounds: mergeParcelBounds(cur), price, reason: 'Unbuildable land' };
  }
  if (cur.some(r => rectsOverlap(r, block.rect))) {
    return { ok: false, parcels: cur, bounds: mergeParcelBounds(cur), price, reason: 'Overlaps owned land' };
  }
  if (!isAdjacentBlock(cur, block.rect)) {
    return { ok: false, parcels: cur, bounds: mergeParcelBounds(cur), price, reason: 'Not adjacent to owned land' };
  }
  if (cash < price) {
    return { ok: false, parcels: cur, bounds: mergeParcelBounds(cur), price, reason: 'Insufficient funds' };
  }
  const next: Rect[] = [...cur, [...block.rect] as Rect];
  return { ok: true, parcels: next, bounds: mergeParcelBounds(next), price };
}
