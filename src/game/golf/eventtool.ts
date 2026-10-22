// The Event tool's placement rules, rent/buy costs, and daily catchment takings for tents.ts structures (docs/GOLF-PLAN.md section 6). Pure TS, no DOM.
import type { Hole, Pt } from './holes';
import type { Rect } from './mode';
import {
  PRICE, STRUCTURE, catchmentWeight, tentDay,
  type PriceTerms, type StructureKind, type StructureType, type TentDay,
} from './tents';
import type { Need } from './tour';
import { TILE_M } from './types';

/** half-width of a hole's playing corridor (tiles; 15 tiles = 30 m each side = 60 m corridor, GOLF-PLAN 4.2 and 6.3) */
export const HOLE_CORRIDOR_HALF = 15;

/** closer limit for grandstands and TV camera towers, which may border a hole corridor as TIOs (tiles, GOLF-PLAN 6.3) */
export const TIO_CORRIDOR_HALF = 8;

/** maximum distance (tiles) from the outer owned-land boundary for placing a highway interchange */  
export const INTERCHANGE_EDGE_MAX_DIST = 10;

/** default tournament day operating hours for tents (07:00 gates open to 18:30 play end = 11.5 hours, GOLF-PLAN 5.5) */
export const DEFAULT_HOURS_OPEN = 11.5;

/** monthly off-season upkeep share of a permanently bought structure's buy price (GOLF-PLAN 6.1) */
export const BOUGHT_MONTHLY_UPKEEP_RATE = 0.01;

/** hospitality revenue ($) per guest capacity for pre-sold chalets and villages (GOLF-PLAN 6.1 and 6.2) */
export const HOSPITALITY_PER_GUEST = 250;

/** price card id ('cheap' | 'normal' | 'premium') */
export type PriceCardId = keyof typeof PRICE;

/** whether a placed structure is rented for the tournament or permanently bought */
export type PlaceMode = 'rent' | 'buy';

/** a placed event structure on the map */
export interface PlacedEventStructure {
  id: number;
  typeId: string;
  x: number;
  y: number;
  rotated?: boolean;
  mode: PlaceMode;
  priceCard?: PriceCardId;
}

/** placement validation result */
export interface StructurePlacementCheck {
  ok: boolean;
  rect: Rect;
  cost: number;
  reason?: string;
}

/** daily evaluation of one placed structure */
export interface PlacedStructureDay {
  id: number;
  typeId: string;
  kind: StructureKind;
  spectatorsReached: number;
  day: TentDay;
}

/** aggregated daily evaluation across all placed event structures */
export interface EventStructuresDaySummary {
  byStructure: PlacedStructureDay[];
  totalRevenue: number;
  sellingRevenue: number;
  hospitalityRevenue: number;
  rentCost: number;
  monthlyUpkeep: number;
  avgQueueMin: number;
  avgSatisfaction: number;
  gateLanes: number;
  toiletCubicles: number;
  grandstandSeats: number;
  needsProvided: Set<Need>;
}

/** world rectangle [x, y, w, h] (tiles) of a placed structure (swapping w and h when rotated) */
export function structureRect(s: { typeId: string; x: number; y: number; rotated?: boolean }): Rect {
  const def = STRUCTURE[s.typeId];
  if (!def) return [s.x, s.y, 0, 0];
  const w = s.rotated ? def.footprint.h : def.footprint.w;
  const h = s.rotated ? def.footprint.w : def.footprint.h;
  return [s.x, s.y, w, h];
}

/** find the index of the placed structure matched by a hit structure id (from its prop) or containing tile (x, y) in its footprint, or -1 */
export function findStructureIndexAt(
  structures: readonly PlacedEventStructure[],
  x: number,
  y: number,
  hitStructureId?: number | null,
): number {
  if (hitStructureId !== undefined && hitStructureId !== null) {
    const byId = structures.findIndex(s => s.id === hitStructureId);
    if (byId >= 0) return byId;
  }
  for (let i = 0; i < structures.length; i++) {
    const rect = structureRect(structures[i]!);
    if (x >= rect[0] && x <= rect[0] + rect[2] && y >= rect[1] && y <= rect[1] + rect[3]) return i;
  }
  return -1;
}

/** whether two Rects have a positive-area interior overlap */
function rectsOverlap(a: Rect, b: Rect): boolean {
  return Math.min(a[0] + a[2], b[0] + b[2]) > Math.max(a[0], b[0]) && Math.min(a[1] + a[3], b[1] + b[3]) > Math.max(a[1], b[1]);
}

/** whether point (x, y) lies inside or on the boundary of any Rect in parcels */
function inParcels(parcels: readonly Rect[], x: number, y: number): boolean {
  return parcels.some(r => r[2] > 0 && r[3] > 0 && x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3]);
}

/** centre point (tiles) of a Rect */
function rectCentre(r: Rect): Pt { return { x: r[0] + r[2] / 2, y: r[1] + r[3] / 2 }; }

/** distance from point p to segment a-b in tiles */
function ptSegDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
  return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t);
}

/** minimum distance (tiles) from a Rect's corners and centre to a polyline */
export function rectLineDist(r: Rect, line: readonly Pt[]): number {
  if (line.length === 0) return Infinity;
  const samples: Pt[] = [
    { x: r[0], y: r[1] }, { x: r[0] + r[2], y: r[1] },
    { x: r[0] + r[2], y: r[1] + r[3] }, { x: r[0], y: r[1] + r[3] },
    rectCentre(r),
  ];
  let best = Infinity;
  if (line.length === 1) {
    for (const p of samples) best = Math.min(best, Math.hypot(p.x - line[0]!.x, p.y - line[0]!.y));
    return best;
  }
  for (const p of samples) {
    for (let i = 0; i + 1 < line.length; i++) best = Math.min(best, ptSegDist(p, line[i]!, line[i + 1]!));
  }
  return best;
}

/** upfront cost ($) to place a structure in 'rent' or 'buy' mode (Infinity when that mode is not supported) */
export function structurePlaceCost(typeId: string, mode: PlaceMode): number {
  const def: StructureType | undefined = STRUCTURE[typeId];
  if (!def) return Infinity;
  if (mode === 'rent') return def.rent > 0 || def.buy === 0 ? def.rent : Infinity;
  return def.buy > 0 ? def.buy : Infinity;
}

/** options for validating structure placement */
export interface StructureCheckOpts { tier: number; holes: readonly Hole[]; existing: readonly PlacedEventStructure[]; parcels?: readonly Rect[]; roads?: readonly Rect[]; townPt?: Pt }

/** options for evaluating all placed structures on a tournament day */
export interface EvaluateEventDayOpts { placed: readonly PlacedEventStructure[]; holes: readonly Hole[]; gates: readonly Pt[]; tier: number; spectators: number; hoursOpen?: number; mobileOrdering?: boolean }

/** validate placing a structure given tier, holes, existing structures, optional owned parcels, and optional road rects */
export function checkStructurePlacement(candidate: { typeId: string; x: number; y: number; rotated?: boolean; mode: PlaceMode }, opts: StructureCheckOpts): StructurePlacementCheck {
  const def = STRUCTURE[candidate.typeId];
  const rect = structureRect(candidate);
  if (!def) return { ok: false, rect, cost: Infinity, reason: 'Unknown structure type' };
  if (def.tier > opts.tier + 1) return { ok: false, rect, cost: Infinity, reason: `Available from tier ${def.tier - 1}` };
  const cost = structurePlaceCost(candidate.typeId, candidate.mode);
  if (!Number.isFinite(cost)) return { ok: false, rect, cost, reason: `Cannot ${candidate.mode} ${def.name}` };
  if (opts.parcels && opts.parcels.length > 0) {
    const corners: [number, number][] = [
      [rect[0], rect[1]], [rect[0] + rect[2], rect[1]],
      [rect[0] + rect[2], rect[1] + rect[3]], [rect[0], rect[1] + rect[3]],
    ];
    if (!corners.every(([x, y]) => inParcels(opts.parcels!, x, y))) {
      return { ok: false, rect, cost, reason: 'Outside owned venue land' };
    }
  }
  if (def.id === 'interchange' && opts.parcels && opts.parcels.length > 0) {
    const minX = Math.min(...opts.parcels.map(r => r[0])), minY = Math.min(...opts.parcels.map(r => r[1]));
    const maxX = Math.max(...opts.parcels.map(r => r[0] + r[2])), maxY = Math.max(...opts.parcels.map(r => r[1] + r[3]));
    const dLeft = rect[0] - minX, dRight = maxX - (rect[0] + rect[2]), dTop = rect[1] - minY, dBottom = maxY - (rect[1] + rect[3]);
    if (Math.min(dLeft, dRight, dTop, dBottom) > INTERCHANGE_EDGE_MAX_DIST) {
      return { ok: false, rect, cost, reason: 'Interchange must sit at the edge of owned venue land' };
    }
    const refPt = opts.townPt ?? (opts.roads && opts.roads.length > 0 ? rectCentre(opts.roads[0]!) : null);
    if (refPt) {
      const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
      const edges = [
        { dEdge: dLeft, dTown: Math.hypot(minX - refPt.x, cy - refPt.y) },
        { dEdge: dRight, dTown: Math.hypot(maxX - refPt.x, cy - refPt.y) },
        { dEdge: dTop, dTown: Math.hypot(cx - refPt.x, minY - refPt.y) },
        { dEdge: dBottom, dTown: Math.hypot(cx - refPt.x, maxY - refPt.y) },
      ];
      const nearest = edges.reduce((a, b) => (b.dTown < a.dTown ? b : a));
      if (nearest.dEdge > INTERCHANGE_EDGE_MAX_DIST) {
        return { ok: false, rect, cost, reason: 'Interchange must sit at the parcel edge nearest the town road' };
      }
    }
  }
  if (opts.roads && opts.roads.some(r => rectsOverlap(rect, r))) {
    return { ok: false, rect, cost, reason: 'Cannot place on a road' };
  }
  if (opts.existing.some(e => rectsOverlap(rect, structureRect(e)))) {
    return { ok: false, rect, cost, reason: 'Overlaps an existing structure' };
  }
  // Grandstands and TV towers may border a corridor (TIO_CORRIDOR_HALF = 8 tiles); all other structures keep HOLE_CORRIDOR_HALF = 15 tiles
  const minClear = def.kind === 'grandstand' || def.id === 'tvTower' ? TIO_CORRIDOR_HALF : HOLE_CORRIDOR_HALF;
  for (const h of opts.holes) {
    if (h.line.length >= 2 && rectLineDist(rect, h.line) < minClear) {
      return { ok: false, rect, cost, reason: `Inside hole ${h.n} playing corridor` };
    }
  }
  return { ok: true, rect, cost };
}

/** derive the set of tour Needs satisfied by the placed event structures (given the holes for 18th-green grandstand check) */
export function structuresNeeds(placed: readonly PlacedEventStructure[], holes: readonly Hole[] = []): Set<Need> {
  const out = new Set<Need>();
  const h18 = holes.find(h => h.n === 18) ?? holes[holes.length - 1];
  const pin18 = h18 && h18.line.length ? h18.line[h18.line.length - 1]! : null;
  let tvCount = 0, standSeats = 0;
  for (const s of placed) {
    const def = STRUCTURE[s.typeId];
    if (!def) continue;
    if (def.id === 'gate') out.add('gate');
    if (def.kind === 'food') out.add('foodTent');
    if (def.kind === 'toilet') out.add('toilets');
    if (def.id === 'leaderboard') out.add('leaderboard');
    if (def.id === 'merchTent' || def.id === 'merchPavilion') out.add('merchTent');
    if (def.id === 'merchPavilion') out.add('merchPavilion');
    if (def.id === 'rangeStand') out.add('range');
    if (def.id === 'tvTower') tvCount++;
    if (def.id === 'broadcast') out.add('broadcast');
    if (def.id === 'chalet' || def.id === 'village') out.add('hospitality');
    if (def.id === 'village') out.add('hospitalityVillage');
    if (def.id === 'media') out.add('media');
    if (def.id === 'hotel') out.add('hotelRooms');
    if (def.id === 'coach') out.add('coachTerminal');
    if (def.id === 'interchange') out.add('interchange');
    if (def.kind === 'grandstand') {
      standSeats += def.capacity;
      if (pin18) {
        const c = rectCentre(structureRect(s));
        if (Math.hypot(c.x - pin18.x, c.y - pin18.y) <= 45) out.add('grandstand18');
      } else {
        out.add('grandstand18');
      }
    }
  }
  if (tvCount >= 2) out.add('tvTowers');
  if (standSeats >= 2000) out.add('grandstands');
  return out;
}

/** evaluate daily takings, queues, capacities, and rent/upkeep across all placed structures given holes and gates as crowd anchors */
export function evaluateEventToolDay(opts: EvaluateEventDayOpts): EventStructuresDaySummary {
  const hoursOpen = opts.hoursOpen ?? DEFAULT_HOURS_OPEN;
  const capMul = opts.mobileOrdering ? 1.3 : 1;
  // Build crowd anchor points from hole greens (18th/last green weighted 2x) and entrance gates
  const anchors: { x: number; y: number; weight: number }[] = [];
  for (let i = 0; i < opts.holes.length; i++) {
    const line = opts.holes[i]!.line;
    if (line.length) {
      const pin = line[line.length - 1]!;
      anchors.push({ x: pin.x, y: pin.y, weight: i === opts.holes.length - 1 ? 2 : 1 });
    }
  }
  for (const g of opts.gates) anchors.push({ x: g.x, y: g.y, weight: 1.5 });
  if (anchors.length === 0) anchors.push({ x: 0, y: 0, weight: 1 });
  const totalWeight = anchors.reduce((s, a) => s + a.weight, 0);

  // Group selling structures by kind to distribute each anchor's spectators by catchmentWeight (GOLF-PLAN 6.2)
  const sellingKinds: StructureKind[] = ['food', 'drink', 'snack', 'merch'];
  const reached = new Map<number, number>();
  for (const s of opts.placed) reached.set(s.id, 0);

  for (const kind of sellingKinds) {
    const group = opts.placed.filter(s => STRUCTURE[s.typeId]?.kind === kind);
    if (!group.length) continue;
    for (const a of anchors) {
      const zoneSpec = opts.spectators * (a.weight / totalWeight);
      const weights = group.map(s => {
        const c = rectCentre(structureRect(s));
        return catchmentWeight(Math.hypot(c.x - a.x, c.y - a.y) * TILE_M);
      });
      const sumW = weights.reduce((x, y) => x + y, 0);
      if (sumW <= 0) continue;
      const denom = Math.max(1, sumW);
      for (let i = 0; i < group.length; i++) {
        const id = group[i]!.id;
        reached.set(id, (reached.get(id) ?? 0) + zoneSpec * (weights[i]! / denom));
      }
    }
  }

  const byStructure: PlacedStructureDay[] = [];
  let sellingRevenue = 0, hospitalityRevenue = 0, rentCost = 0, monthlyUpkeep = 0;
  let queueSum = 0, satSum = 0, sellingCount = 0;
  let gateLanes = 0, toiletCubicles = 0, grandstandSeats = 0;

  for (const s of opts.placed) {
    const def = STRUCTURE[s.typeId];
    if (!def) continue;
    if (s.mode === 'rent') rentCost += def.rent;
    else monthlyUpkeep += Math.round(def.buy * BOUGHT_MONTHLY_UPKEEP_RATE);

    if (def.kind === 'gate') gateLanes += def.capacity;
    if (def.kind === 'toilet') toiletCubicles += def.capacity;
    if (def.kind === 'grandstand') grandstandSeats += def.capacity;

    const spec = reached.get(s.id) ?? 0;
    const priceTerms: PriceTerms = PRICE[s.priceCard ?? 'normal'];
    if (sellingKinds.includes(def.kind)) {
      const day = tentDay({
        kind: def.kind,
        tier: opts.tier,
        capacityPerHour: def.capacity * capMul,
        hoursOpen,
        spectators: spec,
        price: priceTerms,
      });
      sellingRevenue += day.revenue;
      queueSum += day.avgQueueMin;
      satSum += day.satisfaction;
      sellingCount++;
      byStructure.push({ id: s.id, typeId: s.typeId, kind: def.kind, spectatorsReached: Math.round(spec), day });
    } else if (def.kind === 'hospitality') {
      const rev = Math.round(def.capacity * HOSPITALITY_PER_GUEST * priceTerms.price);
      hospitalityRevenue += rev;
      byStructure.push({
        id: s.id, typeId: s.typeId, kind: def.kind, spectatorsReached: def.capacity,
        day: { demand: def.capacity, served: def.capacity, lost: 0, revenue: rev, avgQueueMin: 1, satisfaction: 1 },
      });
    } else {
      byStructure.push({
        id: s.id, typeId: s.typeId, kind: def.kind, spectatorsReached: 0,
        day: { demand: 0, served: 0, lost: 0, revenue: 0, avgQueueMin: 0, satisfaction: 1 },
      });
    }
  }

  return {
    byStructure,
    totalRevenue: sellingRevenue + hospitalityRevenue,
    sellingRevenue,
    hospitalityRevenue,
    rentCost,
    monthlyUpkeep,
    avgQueueMin: sellingCount > 0 ? queueSum / sellingCount : 0,
    avgSatisfaction: sellingCount > 0 ? satSum / sellingCount : 1,
    gateLanes,
    toiletCubicles,
    grandstandSeats,
    needsProvided: structuresNeeds(opts.placed, opts.holes),
  };
}
