import { CHUNK_H, CHUNK_W, DISTRICT_Z, HH, HW, MAP, MID_BELOW, MID_H, MID_W, PLANNER_Z, PLAN_H, PLAN_W, SPR_H, SPR_W, ZOOM_MAX, ZOOM_MIN, clamp, levelFor, midLevelFor, planLevelFor, tileOf, worldX, worldY, mulberry } from './iso';
import { ATLAS_PAGES, LIBRARY, WALKER_BASE, WALKER_PEOPLE, WALK_DIRS, WALK_FRAMES } from './library';
import { FACING_ROW, Pedestrians, sidewalks, type Door, type WalkerView } from './ext/pedestrians';
import { GrassManagement, grassSurface, type GrassAction, type GrassCellView, type GrassScope, type GrassSettings } from './ext/grass-management';
import { drawGhostBlueprint, drawGhostHint, drawGhostPoly, drawGhostRing, ghostStatus, type GhostBlueprint, type GhostView } from './ext/ghost-preview';
import { busGhostLabel, costLabel, markerGhost, structureGhost, tollGhostLabel } from './ext/event-ghost';
import { getTournamentWeather } from './golf/weather';
import { CLASS, FLAG_COST, Grid, classOf, JUNCTIONS, KEY_CLASSES, RoadNetwork, SLIP_CORNER_COST, SPEED_BONUS_KMH, RB_LANE, ringRadius, NARROWER, VARIANTS as CLASS_VARIANTS, WIDER, SK, add, dot, mul, norm, perp, sub, unionBox, variantCost, vlen, type AutoProp, type BBox, type ClassId, type Leg, type Node, type NodeType, type PieceSel, type Pt, type PortalRec, type RoadClass, type Seg, type SegKind, type TypeId } from './network';
import { NetEditor, applyNodeEntry, netToOps, nodeEntry, straightChain } from './netops';
import { TIER_BADGE, flagRule, isLights, junctionCorners, slipPlan, slipsOn, type Corner } from './junctions';
import { MIN_SEP, checkLegs, replaceCuts, ringStubs, segDist as segSeg, snapPoint, type Snap } from './snap';
import { STRUCT_COST, STRUCT_MAX, highwayRoute, longestRun, splitByTerrain, structureLengths } from './structures';
import { GLRenderer, POINT_STRIDE, SHADOW_STRIDE, SPRITE_STRIDE } from './gl';
import { GroundCache } from './ground-cache';
import { lotBatch, type LotPatch } from './ground-protocol';
import { BLOCK_MAX_AREA, enclosedBlocks } from './blocks';
import { blockLawn, lotLawn } from './lawns';
import { PaintTool } from './paint-tool';
import type { PresetProp } from './golf/holepreset';
import { OWNER_SCALE } from './lots/scales';
import { areaAt, toTuple, type PaintTuple, type PaintTex } from './paint';
import { plantPoints, plantPool, type PlantBrushKind } from './plant';
import { ParkingTool } from './parking-tool';
import { gateSpots } from './parking-props';
import { drawParkingOverlay, type ParkOverlayView } from './parking-overlay';
import type { BayRowDef } from './event/rows';
import { inQuad, type CurbDef } from './event/curb';
import { SpriteTiles, spriteRect, type Drawable } from './sprites';
import { readSave, writeSave, clearSave, SAVE_VERSION, segRec, type SaveV5 } from './save';
import { CAR_COLOURS, parkedCar } from './traffic';
import { SimClient, type LotView } from './sim/client';
import { zoneOf } from './sim/routing';
import { lastRush, nextRush, windowOf, type Window } from './beforeafter';
import { placeStadium, siteAt, siteWhy, type Site } from './event/site';
import { BUSINESS, unlockedBy, unlockText, type BusinessId, type BusinessType, type Owned } from './business/catalogue';
import { freshStats, ownedOf, type BizDef, type BizStats } from './business/state';
import { businessArt } from './business/art';
import { BAY_D, BAY_W, BOOTH_W, BUS_ROUTE_COST, BUS_SEATS, CARDS, DECK_SEATS, PD_CELL, PLAZA_LEN, START_BOOTHS, START_BUSES, TOLL_BASE_COST, TOLL_BOOTH_COST, tollPrice, type CardId } from './event/config';
import { Round, SIGNAL_TIER_YEAR, SPEED_TIER_YEAR, signalTierOpen, speedTierOpen } from './event/round';
import type { BusRouteDef } from './event/bus';
import walkersUrl from '../assets/characters/walkers.png';
import { plazaEdge, plazaIslands, plazaKey, plazaLocal, plazaOutline, plazaPoint, plazaQuads, type TollDef } from './event/toll';
import { buildPark, parkCost, parkValid, type CarPark, type CarParkDef, type ParkView } from './event/carpark';
import { TC, classAt, generateTerrain, makeNoise, type Noise, type Terrain } from './terrain';
import { slopeField } from './terrain-paint';
import { FOREST_CELL, forestCell, type ForestTree } from './forest';
import { townTreeCell } from './towntrees';
import type { BendMode, LibItem, LineStyle, Prop, Tool } from './types';
import { LK, LaneGraph, laneAt, laneOff } from './sim/lanes';
import { LV, type LotTuple } from './lots/town';
import { acrossLines, compose, fenceOnly, isCarPark, type ComposeState, type FenceLines, type LotGeom, type Placed } from './lots/compose';
import { LotMap } from './lots/lots';
import { TOWN_BLOCKS, TOWN_POP, townCentres, townGrid } from './lots/seedtowns';
import { Names, RoadNames } from './ext/names';
import { FarmMap, claimedLots, composeFarm } from './ext/farms';
import { SIG, shown, sigKey } from './sim/signals';
import { Budget, DEBT_DAYS, LOAN, compensation, type Ledger } from './budget';
import { WIN_POP, classUnlocked, junctionUnlocked, tunnelsUnlocked, unlockOf } from './career';
import type { DisasterNote } from './city';
import type { DisasterKind } from './ext/disasters';
import { normalizeGolfSave, type GolfSave, type GolfView } from './golf/mode';
import { createCourseHeightField, flattenCourseCorridor, loadCourseHeight, saveCourseHeight, unionBox as unionCourseBox, type CourseHeightField, type CourseHeightSaveChunk, type CourseTileBox } from './ext/course-height';
import { planGolfGame } from './golf/start';
import { dressCourse } from './golf/dressing';
import { SEASON_START, monthsLeft, seasonLabel, seasonMonth, yearOf } from './golf/calendar';
import { computeTournamentCloseBook, computeYearEnd, type YearEndResult } from './golf/yearend';
import { countParkedCars } from './golf/parkingfee';
import { parkRideNeeds } from './golf/parkride';
import { applyCourseConsultantQuality, effectiveGrowInClockMonth, findGolfCard, isGolfCardId, parkRideNeedsWithCards } from './golf/golfcards';
import type { CourseFacts } from './golf/tour';
import { surfaceOfTex } from './golf/costs';
import { adjacentBlockPrice, buyAdjacentBlock, isAdjacentBlock, polyInParcels, type ParcelLandClass } from './golf/parcels';
import { buildCourseStatsPanel, type CourseStatsPanel } from './golf/coursestats';
import type { CourseArea, CourseLayout } from './golf/types';
import { deriveHoles, validateMarkerPlacement } from './golf/holes';
import { holeViews, markerPlan, tagByHole, type HoleView, type MarkerKind } from './golf/holeview';
import { CAST, castShear, clampCast, type CastShadow } from './cast-shadow';
import { PIN_RED_ID, PIN_YELLOW_ID, TEE_BACK_ID, TEE_FORWARD_ID, TEE_MIDDLE_ID } from './golf/dressing';
import { checkStructurePlacement, findStructureIndexAt, structureRect, structuresNeeds, type PlacedEventStructure, type StructurePlacementCheck } from './golf/eventtool';
import { STRUCTURE } from './golf/tents';
import { gallerySpots } from './golf/galleries';
import { tierInfo, type Need } from './golf/tour';
import { NightRenderer, clampNight, nightAt, nightDay, propLights, type NightLight, type NightSettings } from './night-light';
import { drawnAs } from './mirror';
import { TREE_MIRROR } from './tree-sun';
import { NEW_ART_ONLY, lookOf } from './newart';
import { STAGE_3_TIME_SEC, computeProgressiveUiState, emptyProgress, normalizeProgress, progressFacts, type PlayerProgressFacts, type ProgressiveUiState } from './ext/progressive-ui';

/** the junction types in Tab order (Shift+Tab goes back): each roundabout ring-lane count is its own step */
const VARIANTS: { type: NodeType; rl: 1 | 2 | 3 }[] = [{ type: 'plain', rl: 1 }, { type: 'stop', rl: 1 }, { type: 'mini', rl: 1 }, { type: 'signal', rl: 1 }, { type: 'slip', rl: 1 }, { type: 'roundabout', rl: 1 }, { type: 'roundabout', rl: 2 }, { type: 'roundabout', rl: 3 }];
/** what the lights' upgrades cost, by the tier they reach (index = tier: 0 fixed-time is free, 1 actuated, 2 adaptive) */
export const UPGRADE_COST: readonly number[] = [0, 1500, 3000];
/** the upgrade each signal tier brings, for the year toasts (index = tier; 0 has none) */
const SIGNAL_TOAST = ['', 'actuated traffic lights (loop detectors)', 'adaptive traffic lights'];

/** a game day and a game hour, sim s (one sim second is one game minute) */
const GAME_DAY = 1440, GAME_HOUR = 60;
/** the most townspeople walking at once */
const PED_MAX = 3000;
/** the sim speeds the time controls offer (sim s per s); 0 is paused */
export const SPEEDS = [1, 2, 4, 8, 20] as const;
/** the flow colours by v/c (below 0.5, below 0.8, below 1, and 1 or more; the Bottlenecks legend) and the junction LOS badge colours, A to F */
export const FLOW_COLS = ['#3ddc84', '#ffd23f', '#ff8c1a', '#ff3b3b'];
/** the heat map's bands by speed against the limit: Flowing (75%+), Slow (50-75%), Heavy (25-50%), Stopped (under 25%); see Game.drawFlow */
export const HEAT_COLS = ['#0ca30c', '#fab219', '#ec835a', '#d03b3b'];
/** the rgb of k (0 to 1) on a ramp of evenly spaced colour stops */
function rampRGB(stops: number[][], k: number): number[] { const t = clamp(k, 0, 1) * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(t)), f = t - i, a = stops[i]!, b = stops[i + 1]!; return [0, 1, 2].map(j => a[j]! + (b[j]! - a[j]!) * f); }
/** the congestion over time (drawHeatHist): 16 bins of k = log2(delay) / log2(60), clamped to 0 to 1 (k at each bin's middle): a glow (rgba, alpha 0.25 + 0.55 k),
 *  an opaque core, and a width (6 + 14 k); the ramp runs yellow, orange, red, deep magenta */
const HIST_BINS = 16, HIST_LOG = Math.log2(60);
/** the congestion ramp's colour stops (yellow, orange, red, deep magenta), also the legend's gradient */
export const HIST_RAMP = [[255, 226, 59], [255, 140, 26], [235, 40, 40], [150, 0, 110]];
const HIST_GLOW: string[] = [], HIST_CORE: string[] = [];
for (let b = 0; b < HIST_BINS; b++) {
  const k = (b + 0.5) / HIST_BINS, c = rampRGB(HIST_RAMP, k).map(v => Math.round(v));
  HIST_GLOW.push(`rgba(${c[0]},${c[1]},${c[2]},${(0.25 + 0.55 * k).toFixed(3)})`); HIST_CORE.push(`rgb(${c[0]},${c[1]},${c[2]})`);
}
/** the parking demand (drawParkDemand): 16 bins of k = min(1, log2(1 + cars per game hour) / log2(121)), blue (k 0), amber (0.5), red (1); the fill is rgba, alpha 0.15 + 0.35 k */
const PD_BINS = 16, PD_LOG = Math.log2(121);
const PD_FILL: string[] = Array.from({ length: PD_BINS }, (_, b) => {
  const k = (b + 0.5) / PD_BINS, c = rampRGB([[59, 130, 246], [255, 176, 32], [239, 68, 68]], k).map(v => Math.round(v));
  return `rgba(${c[0]},${c[1]},${c[2]},${(0.15 + 0.35 * k).toFixed(3)})`;
});
export const LOS_COL: Record<string, string> = { A: '#3ddc84', B: '#3ddc84', C: '#ffd23f', D: '#ff8c1a', E: '#ff3b3b', F: '#ff3b3b' };
/** a fresh random map seed (Math.random is fine here: the generator itself is seeded) */
const newSeed = () => (Math.random() * 0x7fffffff) | 0 || 1;
/** a filled disc of radius r at (x, y) in device px (the overlay's identity transform), colour col */
function disc(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, col: string) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill(); }
/** a bus stop's marker at (x, y) in device px: a rounded amber square of half side 6 px with a white B */
function busStop(ctx: CanvasRenderingContext2D, x: number, y: number, dpr: number) {
  const r = 6 * dpr;
  ctx.beginPath(); ctx.roundRect(x - r, y - r, 2 * r, 2 * r, 2.5 * dpr); ctx.fillStyle = '#ffbe3c'; ctx.fill(); ctx.strokeStyle = '#4a3200'; ctx.lineWidth = dpr; ctx.stroke();
  ctx.font = `bold ${9 * dpr}px ui-sans-serif, system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff'; ctx.fillText('B', x, y + 0.5 * dpr);
  ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
}
/** the distance, tiles, from point p to the rect (x, y, w, h): 0 inside it */
function rectDist(p: Pt, x: number, y: number, w: number, h: number): number { return Math.hypot(Math.max(x - p.x, 0, p.x - x - w), Math.max(y - p.y, 0, p.y - y - h)); }
/** the walkers' sheet: 12 cells of 32 px in one row (hero h, frame f in cell 4h + f), made on first use (the overlay) */
let walkSheet: HTMLImageElement | null = null;
/** one walker drawn from the sheet: cell (hero, frame), its feet at tile (x, y), h device px tall; the projection as screen() (ze, X0, Y0 the camera's scale
 *  and centre, cw, ch the view in device px); off the view it is skipped */
function walkerSprite(ctx: CanvasRenderingContext2D, sheet: HTMLImageElement, x: number, y: number, hero: number, frame: number, ze: number, X0: number, Y0: number, cw: number, ch: number, h: number) {
  const px = (worldX(x, y) - X0) * ze + cw / 2, py = (worldY(x, y) - Y0) * ze + ch / 2;
  if (px < -h || px > cw + h || py < -h || py > ch + h) return;
  ctx.drawImage(sheet, (4 * hero + frame) * 32, 0, 32, 32, px - h / 2, py - h, h, h);
}
/** a closed path over a flat x y list, in the current transform's units */
function ring(ctx: CanvasRenderingContext2D, p: number[]) { ctx.moveTo(p[0]!, p[1]!); for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i]!, p[i + 1]!); ctx.closePath(); }
/** the distance from p to the seg s, tiles */
function segDist(p: Pt, s: Seg): number { const d = sub(s.b, s.a), L2 = dot(d, d) || 1, k = Math.min(1, Math.max(0, dot(sub(p, s.a), d) / L2)); return vlen(sub(p, add(s.a, mul(d, k)))); }
/** a lot's rectangle as a box x0 y0 x1 y1 (tiles): its corner o, the unit sides u (length w) and n (length d) */
function lotBoxOf(o: ArrayLike<number>, u: ArrayLike<number>, n: ArrayLike<number>, w: number, d: number): number[] {
  const ax = o[0]! + u[0]! * w, ay = o[1]! + u[1]! * w, bx = o[0]! + n[0]! * d, by = o[1]! + n[1]! * d, cx = ax + n[0]! * d, cy = ay + n[1]! * d;
  return [Math.min(o[0]!, ax, bx, cx), Math.min(o[1]!, ay, by, cy), Math.max(o[0]!, ax, bx, cx), Math.max(o[1]!, ay, by, cy)];
}
/** the distance from tile (x, y) to a lot's rectangle (0 inside), the lot's frame as in lotBoxOf */
function lotGap(l: LotView, x: number, y: number): number {
  const dx = x - l.o[0], dy = y - l.o[1], a = dx * l.u[0] + dy * l.u[1], b = dx * l.n[0] + dy * l.n[1];
  return Math.hypot(Math.max(0, -a, a - l.w), Math.max(0, -b, b - l.d));
}
/** whether box b (x0 y0 x1 y1) comes within g tiles of the cell rectangle x0 y0 x1 y1 */
function boxNear(b: number[], x0: number, y0: number, x1: number, y1: number, g: number): boolean { return b[0]! < x1 + g && b[2]! > x0 - g && b[1]! < y1 + g && b[3]! > y0 - g; }
/** a toll gate's plaza as a box (its two ends, and the plaza's width at its booths, plus a margin) */
function tollBox(d: TollDef): number[] { const m = 10 + d.booths * BOOTH_W; return [Math.min(d.ax, d.bx) - m, Math.min(d.ay, d.by) - m, Math.max(d.ax, d.bx) + m, Math.max(d.ay, d.by) + m]; }
/** the box of a flat x y list of points (a paint area's outline or a ground patch), tiles */
function ptsBox(p: number[]): number[] { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (let i = 0; i < p.length; i += 2) { x0 = Math.min(x0, p[i]!); x1 = Math.max(x1, p[i]!); y0 = Math.min(y0, p[i + 1]!); y1 = Math.max(y1, p[i + 1]!); } return [x0, y0, x1, y1]; }
/** a piece of a screen-space label at (x, y), left-aligned, filled in col and outlined in the stroke style; returns the x after it */
function labelPiece(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, col: string): number { ctx.strokeText(s, x, y); ctx.fillStyle = col; ctx.fillText(s, x, y); return x + ctx.measureText(s).width; }

interface Build { legs: Leg[]; cls: RoadClass; t0: number; dur: number; total: number; cum: number[] }
interface Particle { x: number; y: number; vx: number; vy: number; vz: number; z: number; life: number; age: number; r: number }
export interface Toast { id: number; text: string; t: number; kind: 'info' | 'warn' | 'good' }
export interface Camera { X: number; Y: number; z: number }
const AUTO_TREES = ['world:tree_oak_1', 'ref:tree-maple-crimson', 'world:tree_oak_2', 'ref:tree-birch-gold'];  
const STRUCTURE_SPRITE: Record<string, string> = {  
 foodTent: 'golf:food-tent', drinksTent: 'expansion:backyard-tent', kiosk: 'business:fishing-rental-kiosk', foodTruck: 'town:produce_stand',  
 merchTent: 'expansion:backyard-tent', merchPavilion: 'business:golf-halfway-pavilion', chalet: 'business:golf-halfway-pavilion', village: 'business:golf-halfway-pavilion',  
 standS: 'golf:grandstand-s', standM: 'business:golf-bench-course-map', standL: 'business:golf-bench-course-map', leaderboard: 'golf:leaderboard',  
 holeBoard: 'poi:fishing-board', screen: 'poi:movie-display', tvTower: 'world:watertower', broadcast: 'business:golf-cart-garage', media: 'business:golf-clubhouse',  
 gate: 'ce:parking-entry', toilets: 'golf:toilet-block', firstAid: 'expansion:backyard-tent', info: 'ce:parking-kiosk', rideshare: 'town:produce_stand',  
 coach: 'business:golf-cart-garage', hotel: 'business:golf-clubhouse', interchange: 'ce:parking-entry', rangeStand: 'business:golf-bench-course-map', sponsorDisplay: 'poi:movie-display', helipad: 'business:golf-halfway-pavilion',  
};
/** a golf structure's sprite scale: its picture fitted to the structure's footprint (tiles, turned when rotated), then the owner's size for
 *  that sprite from the studio (OWNER_SCALE). The stand-in sprites are much bigger than the structures they stand for. */
function structureScale(typeId: string, it: LibItem, rotated: boolean) {
  const def = STRUCTURE[typeId], own = OWNER_SCALE[it.id] ?? 1; if (!def) return own;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const b of it.boxes) { const hx = (rotated ? b.hy : b.hx) / 2, hy = (rotated ? b.hx : b.hy) / 2, dx = (rotated ? b.dy : b.dx) / 2, dy = (rotated ? b.dx : b.dy) / 2; x0 = Math.min(x0, dx - hx); x1 = Math.max(x1, dx + hx); y0 = Math.min(y0, dy - hy); y1 = Math.max(y1, dy + hy); }
  const w = rotated ? def.footprint.h : def.footprint.w, h = rotated ? def.footprint.w : def.footprint.h, fw = x1 - x0, fh = y1 - y0;
  return (fw > 0 && fh > 0 ? Math.min(w / fw, h / fh) : 1) * own;
}
const autoKey = (a: AutoProp) => `${a.kind}@${a.x.toFixed(2)},${a.y.toFixed(2)}`;
/** a natural disaster's area colour and name (see Game.drawDisasters, disasterText) */
const DISASTER_COL: Record<DisasterKind, string> = { flood: '#3b82f6', storm: '#9ca3af', landslide: '#92400e', wildfire: '#f97316', quake: '#a855f7', paranormal: '#b08aff' };
const DISASTER_NAME: Record<DisasterKind, string> = { flood: 'Flood', storm: 'Storm', landslide: 'Landslide', wildfire: 'Wildfire', quake: 'Earthquake', paranormal: 'Paranormal night' };
/** the toast for a disaster's note (see City.disasterFrame): the warning, the start, the end, and the repairs */
function disasterText(n: DisasterNote): string {
  const name = DISASTER_NAME[n.kind], money = `$${n.cost.toLocaleString()}`, roads = `${n.n} road${n.n === 1 ? '' : 's'}`;
  switch (n.k) {
    case 'warned': return n.kind === 'paranormal' ? `Nightfall in ${Math.round(n.secs)} s: kids are preparing for a monster outbreak; expect traffic diversions` : n.kind === 'flood' ? `Flood warning: roads near the river may close in ${Math.round(n.secs)} s` : `${name} warning: roads in the area may close in ${Math.round(n.secs)} s`;
    case 'started': return n.kind === 'paranormal' ? `Paranormal night: kids are fighting monsters; ${roads} closed and traffic is being diverted` : n.kind === 'quake' ? `Earthquake: ${roads} closed (bridges, tunnels); click a red X to pay for its repair` : n.kind === 'flood' ? `Flood: the low roads by the river are closed (${roads})` : `${name}: ${roads} closed`;
    case 'ended': return n.kind === 'paranormal' ? 'Dawn: the monsters have vanished and traffic routes are open again' : `${name} over: the roads are open again`;
    case 'repaired': return `Repaired for ${money}`;
    case 'unpaid': return `Repair needs ${money}: not enough money`;
  }
}
const BUILDING_KINDS: Record<string, number> = { house: 0, shop: 1, venue: 1, arcade: 1, landmark: 4, barn: 3 };
/** a town lot's use as the player reads it in the toasts (index LU: NONE, RES, COM, IND, TOUR, GOV) */
const LOT_NAME = ['lot', 'residential lot', 'commercial lot', 'industrial lot', 'tourist lot', 'civic lot'];
/** the planner's building refresh for the town's lots: at most one per this many ms; the contact sheet's block size, tiles */
const LOT_BLOCKS_MS = 5000, BLOCK = 40;
/** a street prop whose footprint centre lies inside a lay-by grown by this many tiles is not placed (its bay stands there) */
const LAYBY_PAD = 0.3;
/** the library index by id, and the props the town's lots add (auto 'lot:' + key) */
const LIB_INDEX = new Map(LIBRARY.map((it, i) => [it.id, i] as const));
const isLotProp = (p: Prop) => !!p.auto && (p.auto.startsWith('lot:') || p.auto.startsWith('farm:'));
/** the farms composed per frame at most (the rest wait in the queue), so a big network does not stall a frame */
const FARMS_PER_FRAME = 4;
/** the lot fills by use * 4 + decline (EMPTY, RES green, COM blue, IND orange, TOUR magenta, GOV white), darker with each decline step */
/** a business's rect fill by family (alpha 0.5): sports amber, leisure violet, tourism teal, transport sky blue, property lime */
const FAMILY_FILL: Record<BusinessType['family'], string> = { sports: 'rgba(245,158,11,0.5)', leisure: 'rgba(139,92,246,0.5)', tourism: 'rgba(20,184,166,0.5)', transport: 'rgba(14,165,233,0.5)', property: 'rgba(132,204,22,0.5)' };
const LOT_FILL = Array.from({ length: 24 }, (_, i) => { const k = [1, 0.75, 0.5, 0.3][i & 3]!, c = [[0, 0, 0], [76, 175, 80], [47, 123, 217], [255, 140, 26], [217, 70, 239], [255, 255, 255]][i >> 2]!; return `rgb(${Math.round(c[0]! * k)},${Math.round(c[1]! * k)},${Math.round(c[2]! * k)})`; });

/** whether node n's arms are small enough for a mini-roundabout: 2 lanes each way at most (a one-way road: 4 lanes) */
const miniFits = (n: Node): boolean => n.arms.every(a => a.cls.laneCentres.length <= (a.cls.oneway ? 4 : 2));

/** the props an undoable Paint or Course action added and removed */
type PropLog = { added: Prop[]; removed: Prop[] };

export class Game {
  gl: GLRenderer; ov: CanvasRenderingContext2D;
  dpr = 1; cw = 1; ch = 1; cssW = 1; cssH = 1;
  cam: Camera = { X: worldX(MAP / 2, MAP / 2), Y: worldY(MAP / 2, MAP / 2), z: 0.16 };
  /** the map seed (saved) and the valley generated from it */
  seed = 1; terrain!: Terrain;
  /** the road, town and place names of the map (src/game/ext/names): derived from the seed and stable keys, so never saved; rebuilt by genTerrain */
  names!: Names; roadNames!: RoadNames;
  /** the town sites' centres (tiles) in the terrain's order: the town index of the names module */
  townPts: Pt[] = [];
  net = new RoadNetwork(); edit = new NetEditor(this.net); lanes = new LaneGraph();
  props = new Set<Prop>(); nextUid = 1;
  private propGrid = new Grid<Prop>(8); private lampProps = new Set<Prop>(); private autoByKey = new Map<string, Prop>();
  sprites = new SpriteTiles();
  /** forest: slope field and clearing noise of the terrain; trees planted per FOREST_CELL cell (key cj * 32 + ci), drawn as sprites only, never in props */
  private slope: Float32Array = new Float32Array(0); private clearing: Noise = makeNoise(0); private forest = new Map<number, Prop[]>(); private forestItem = new Map<string, number>();
  /** town trees: the same cells (key cj * 32 + ci) planted on the free ground in and around the towns, sprites only; the clump noise; the boxes of the lots and painted areas last seen (a change drops the cells around them) */
  private townClump: Noise = makeNoise(0); private townTrees = new Map<number, Prop[]>(); private lotBoxes = new Map<string, number[]>(); private paintBoxes = new Map<string, number[]>();
  /** tunnel mouths of the network: key of the last synced set, and the points themselves */
  private portalKey = ''; private portalPts: PortalRec[] = [];
  ground: GroundCache;
  /** lot ground edits made since the last frame (key -> patches, or null to drop), sent as one message per frame */
  private lotPending = new Map<string, LotPatch[] | null>();
  /** the atlas pages (mip 1) as images, for the 2D overlay and picking */
  pageImages: HTMLImageElement[] = []; private pageAlpha: { w: number; h: number; data: Uint8ClampedArray }[] = [];
  ready = false; loadProgress = 0;
  // tools
  tool: Tool = 'road'; roadClass: ClassId = 'street'; bendMode: BendMode = 90; lineStyle: LineStyle = 0;
  /** Replace on (E): finishing a route first bulldozes the road pieces it would clash with (replaceCuts in snap.ts), then builds it */
  replaceMode = false;
  /** the junction tool's brush: 'select' (a click selects a junction), or a type that a click installs on the junction (plain, stop, mini, signal, roundabout) */
  brush: 'select' | 'plain' | 'stop' | 'mini' | 'signal' | 'roundabout' = 'select';
  /** the ring lanes a roundabout installed (or re-laned) by the junction tool gets; set by the Roundabout card's chips and by Tab */
  ringLanes: 1 | 2 | 3 = 1;
  /** the junction the tool has selected (its panel section and map overlay); read it with selectedNode, which follows the rebuilds */
  selectedJunction: Node | null = null;
  /** the year seen last frame (0: none yet): a signal tier's year coming in toasts (see yearCheck) */
  private seenYear = 0;
  selected: Prop | null = null; showGrid = false; showLanes = false; showLots = false;
  /** the access overlay (key O): zones with built lots shaded by access; always on at the planner tier (below PLANNER_Z) */
  showAccess = false;
  /** the access overlay's growth state per zone, refreshed at most once a second (growthNow): the lots started within the last game day (growN), the lots declining (declN), and the totals */
  private growN = new Int32Array(256); private declN = new Int32Array(256); growTot = 0; declTot = 0; private growStamp = -Infinity;
  /** the flow overlay (key F, the Flow button, a jump): the live congestion heat map of each road direction (see drawFlow and setFlow) */
  showFlow = false;
  /** the flow overlay's view: 'time' the congestion over time (heat over hours, the default), 'now' the live bands */
  flowMode: 'time' | 'now' = 'time';
  /** the parking demand overlay (the Car park panel's toggle): cells shaded by the cars that wanted to park there per game hour */
  showParkDemand = false;
  /** the key (sigKey) of each main-thread signal plan, built once: the render loop reads it every frame */
  private sigKeys = new WeakMap<object, string>();
  /** the heat map's scratch: each dseg's band and lane key (255: not drawn), the keys in drawing order, and the counts, starts and fills per key */
  private heatKey = new Uint8Array(0); private heatOrd = new Int32Array(0);
  private histKey = new Uint8Array(0); private histOrd = new Int32Array(0);
  private histCnt = new Int32Array(HIST_BINS); private histStart = new Int32Array(HIST_BINS); private histFill = new Int32Array(HIST_BINS);
  private heatCnt = new Int32Array(32); private heatStart = new Int32Array(32); private heatFill = new Int32Array(32);
  /** the right-hand panel: the budget (the treasury), the bottlenecks (key B), or none */
  panel: 'budget' | 'bottlenecks' | null = null;
  /** the win's modal (App): set once when the career is won, cleared by its 'Keep building' */
  showWin = false;
  /** the before / after snapshot (the bottlenecks panel): the game hour it was taken at, the window before (null: no traffic on record yet), and the next rush, [start, end] in absolute game hours */
  snapshot: { at: number; before: Window | null; after: [number, number] } | null = null;
  /** a ring pulsed for 4 s where the camera jumped (see jumpTo): the tile and the time (performance.now, ms) */
  focus: { x: number; y: number; t: number } | null = null;
  /** the car inspected (its slot in the traffic client's arrays; -1: none; its info is traffic.car), and whether the camera follows it */
  inspecting = -1; followCar = false;
  hover: Pt | null = null; hoverProp: Prop | null = null; hoverNode: Node | null = null; hoverPiece: PieceSel | null = null;
  /** the select tool's road under the pointer when no prop is (its name; '' otherwise) */
  hoverRoad = '';
  route: Pt[] = [];
  /** the snaps of the route's first point and of its last click (see snap.ts: checkLegs judges the route against them) */
  routeFrom: Snap | null = null; routeLast: Snap | null = null;
  // economy (the books live in the city worker: traffic.budget, see the getters by the save)
  /** the sim speed (sim s per s; 0 = paused) and the last speed above 0 (what a resume goes back to) */
  speed = 1; private lastSpeed = 1; private lastFrame = 0;
  /** the dev sandbox (URL ?grow=N, ?stamp=0|1, ?money=0|1; the dev server defaults to grow 20, no stamp, money on; the bench forces the game's): the growth speed (1 = the game's),
   *  whether a new valley's towns are stamped to their residents, and unlimited money (sent to the city worker at init) */
  private sandboxGrow = 1; private stampOn = true; private sandboxMoney = false; private sandboxUnlock = false;
  /** a Space press that panned (held with the drag) does not also pause on release */
  private spacePanned = false;
  // fx
  builds: Build[] = []; particles: Particle[] = []; private growToast = -Infinity;
  toasts: Toast[] = []; toastId = 1;
  /** the city worker (cars, parcels, town): created with the game, so the town grows whenever the sim runs */
  traffic: SimClient;
  /** car light points, reused each frame (grown to 7 points per sim slot) */
  private lightBuf = new Float32Array(0);
  // perf
  /** the townspeople on the sidewalks (ext/pedestrians): the sidewalks follow the network (net.version), one walker per two
   *  built lots (at most PED_MAX), walking in real time while the game runs; drawn at the Street tier as movers */
  private peds = new Pedestrians(0x70656473, Math.max(1, WALKER_PEOPLE.length), PED_MAX, WALK_FRAMES - 1); private pedNet = -1; private pedTick = 0; private pedLots = -1;
  private pedView: WalkerView[] = []; private pedDraw: Drawable[] = [];
  /** Local care and wear augment the existing base grass, lawn presets, paint and grow-in. */
  grass = new GrassManagement(); grassPanel = false; grassHeat = false; grassRadius = 12; grassArea = false; grassDose = 1; grassAngle = 0;
  grassAction: GrassAction | null = null; grassTarget: Pt | null = null;
  private grassZones = new Map<string, string[]>(); private grassDelta: GrassCellView[] = []; private grassSim = -1; private grassElapsed = 0; private grassTrafficT = -1;
  private grassVisible = false;
  private grassPedX = new Float32Array(PED_MAX); private grassPedY = new Float32Array(PED_MAX); private grassPedOut = new Uint8Array(PED_MAX);
  private grassCarX = new Float32Array(0); private grassCarY = new Float32Array(0); private grassCarAlive = new Uint8Array(0);
  perf = { fps: 0, frameMs: 0, cpuMs: 0, drawMs: 0, instances: 0, draws: 0, chunksPending: 0, uploadKB: 0, frames: 0, tier: 'street' as 'street' | 'district' | 'planner', forest: 0, townTrees: 0, simActive: 0, simTickMs: 0, simMaxTickMs: 0, pop: 0, jobs: 0, built: 0, lotProps: 0 };
  private frameTimes: number[] = [];
  // input
  /** a drag in progress; build: a right-button press in the road tool (released without moving, it builds the route, as Enter) */
  private dragging: null | { kind: 'pan' | 'bulldoze' | 'park'; sx: number; sy: number; camX: number; camY: number; moved: boolean; build?: boolean } = null;
  /** the Paint tool: painted ground areas, its settings and the outline being drawn (docs/PAINT-TOOL.md) */
  paint = new PaintTool({ progress: () => this.bump('pieces'), setLotGround: (k, p) => { this.paintRev++; this.setLotGround(k, p); }, emit: () => this.emit(), save: () => this.scheduleSave(), toast: (t, k) => this.toast(t, k), affine: o => this.paintAffine(o), placeProps: (ps, seed) => this.placePresetProps(ps, seed), golfMode: () => this.golfMode, money: () => this.money, spend: n => this.traffic.spend('construction', n), ownedLand: pts => !this.golf || polyInParcels(this.golf.parcels ?? [this.golf.parcel], pts), currentMonth: () => !this.golf ? 0 : this.golfMonthIndex(), plant: (ids, x, y, r, spacing, size, seed) => this.plantProps(ids, x, y, r, spacing, size, seed), unplant: (x, y, r) => this.unplantProps(x, y, r), plantPool: k => plantPool(LIBRARY, k), courseHeight: () => this.courseHeight, roadsNear: (x, y, r) => { let k = 0; return [...this.net.segsNear({ x, y }, r)].map(s => ({ id: ++k, ax: s.a.x, ay: s.a.y, bx: s.b.x, by: s.b.y, halfWidthTiles: s.cls.h + s.cls.walk })); }, roadRev: () => this.net.version, heightChanged:b => { this.courseHeightChanged(unionCourseBox(b, this.flattenRoadsIn(b))!); },
    journal: { begin: () => { this.propLog = { added: [], removed: [] }; }, end: () => { const j = this.propLog; this.propLog = null; return j && (j.added.length || j.removed.length) ? j : null; }, undo: j => this.swapProps(j as PropLog, true), redo: j => this.swapProps(j as PropLog, false) },
    changed: pins => this.syncCourseMarkers(pins) });
  /** the Paint and Course tools drive the same PaintTool */
  get paintOn() { return this.tool === 'paint' || this.tool === 'course'; }
  /** the Course tool's hole strip: makes hole n current and moves the camera to its areas (when it has any) */
  goToHole(n: number) { this.paint.setHole(n); const b = this.paint.holeBox(n); if (b) this.lookAt((b[0] + b[2]) / 2, (b[1] + b[3]) / 2); }
  /** the golf land the town never builds on: the course and every parcel the player owns (tiles, [x, y, w, h]) */
  private golfLand(): [number, number, number, number][] { const g = this.golf; return g ? [g.course, ...(g.parcels ?? [g.parcel])] : []; }
  /** bumped whenever a painted area's ground is sent or removed (the hole views' cache key) */
  private paintRev = 0;
  private holeCache: { key: string; v: HoleView[] } | null = null;
  /** holes 1..18 as the Course panel shows them (par, lengths, checks; golf/holeview.ts), worked out again only when the areas or the markers change */
  courseHoleViews(): HoleView[] {
    const g = this.golf, key = `${this.paintRev}:${this.paint.areas.length}:${g ? JSON.stringify([g.pins, g.tees, g.aims]) : ''}`;
    if (this.holeCache?.key !== key) this.holeCache = { key, v: holeViews(this.paint.areas, g ? { pins: g.pins, tees: g.tees, aims: g.aims } : null) };
    return this.holeCache.v;
  }
  /** fits every hole's pin and tee markers to its painted green and tee (a golf game; golf/holeview.ts markerPlan): runs after each Course change,
   *  undo and redo, outside the undo journal (pins: a placed preset's flag spot by hole) */
  private syncCourseMarkers(pins?: Map<number, { x: number; y: number }>) {
    const g = this.golf; if (!g) return;
    const ops = markerPlan(this.paint.areas, g.pins, g.tees, pins);
    if (!ops.length) return;
    const placed = new Set<number>();
    for (const o of ops) if (o.op === 'set') { this.setGolfMarker(o.hole, o.kind, o.x, o.y); placed.add(o.hole); } else this.removeGolfMarker(o.hole, o.kind);
    if (placed.size) this.toast(`Hole ${[...placed].sort((a, b) => a - b).join(', ')}: pin and tee markers fitted to the green and tee`);
    this.syncCourseGates(); // the galleries follow the greens and tees
    this.scheduleSave(); this.emit();
  }
  /** places or moves a pin or tee marker with its prop, marked auto (it goes when its green or tee is gone) */
  private setGolfMarker(hole: number, kind: MarkerKind, x: number, y: number) {
    const g = this.golf!; this.removeGolfMarker(hole, kind);
    const sprId = kind === 'pin' ? (hole === 9 ? PIN_YELLOW_ID : PIN_RED_ID) : kind === 'back' ? TEE_BACK_ID : kind === 'middle' ? TEE_MIDDLE_ID : TEE_FORWARD_ID;
    const item = LIB_INDEX.get(sprId);
    if (item !== undefined) this.golfProps.set(kind === 'pin' ? 'pin:' + hole : `tee:${hole}:${kind}`, this.addProp(item, x, y, false, 1));
    if (kind === 'pin') g.pins.push({ hole, x, y, auto: true }); else g.tees.push({ hole, kind, x, y, auto: true });
  }
  /** removes a pin or tee marker and its prop (if there is one) */
  private removeGolfMarker(hole: number, kind: MarkerKind) {
    const g = this.golf!, key = kind === 'pin' ? 'pin:' + hole : `tee:${hole}:${kind}`, prop = this.golfProps.get(key);
    if (prop) { this.removeProp(prop); this.golfProps.delete(key); }
    const L: { hole: number; kind?: string }[] = kind === 'pin' ? g.pins : g.tees;
    for (let i = L.length - 1; i >= 0; i--) if (L[i]!.hole === hole && (kind === 'pin' || L[i]!.kind === kind)) L.splice(i, 1);
  }
  /** a golf game's painted course by hole (golf/holeview.ts tagByHole): untagged course areas take the hole they belong to (a hole tag, no
   *  brush kind), so the Course tool's strip and checks see the holes */
  private tagCourseHoles() {
    const g = this.golf; if (!g?.pins?.length) return;
    const tags = tagByHole(this.paint.areas, g.pins, g.tees ?? [], g.aims ?? []); let n = 0;
    this.paint.areas.forEach((a, i) => { if (tags[i]) { a.hole = tags[i]; n++; } });
    if (n) { this.paintRev++; this.scheduleSave(); }
  }
  /** the props added and removed while the Paint tool's action is open (undo), or null */
  private propLog: PropLog | null = null;
  /** undo (back) or redo of a prop journal: the props it added go, the props it removed come back (new objects); returns the journal for the opposite step */
  private swapProps(j: PropLog, back: boolean): PropLog {
    const kill = back ? j.added : j.removed, revive = back ? j.removed : j.added;
    for (const p of kill) this.removeProp(p);
    const out = revive.map(p => { const q = this.addProp(p.item, p.x, p.y, p.flip, p.scale); if (p.plant) q.plant = p.plant; return q; });
    this.scheduleSave();
    return back ? { added: kill, removed: out } : { added: out, removed: kill };
  }
  /** the Paint tool's projection into css px (its handles' hit tests): tile (x, y) is at (o[0] + x*o[2] + y*o[4], o[1] + x*o[3] + y*o[5]) */
  private paintAffine(o: number[]) { const s = this.screen(0, 0), ex = this.screen(1, 0), ey = this.screen(0, 1), d = this.dpr; o[0] = s.x / d; o[1] = s.y / d; o[2] = (ex.x - s.x) / d; o[3] = (ex.y - s.y) / d; o[4] = (ey.x - s.x) / d; o[5] = (ey.y - s.y) / d; }
  /** the Paint tool's snap distance: 10 css px in tiles */
  private get paintTol() { return 10 / (Math.hypot(HW, HH) * this.cam.z); }
  /** the Car park tool's bay rows, on-street runs and fee (docs/PARKING.md) */
  parking = new ParkingTool({ setLotGround: (k, p) => this.setLotGround(k, p), emit: () => this.emit(), save: () => this.scheduleSave(), toast: (t, k) => this.toast(t, k), money: () => this.money, spend: n => this.traffic.spend('construction', n), sendParking: (r, c, f) => { this.traffic.setParking(r, c, f); this.parkingChanged(); }, net: () => this.net, terrain: () => this.terrain.cls, mapSize: MAP, tollKeys: () => new Set(this.tollDefs.map(plazaKey)),
    occupied: q => { const xs = [q[0]!, q[2]!, q[4]!, q[6]!], ys = [q[1]!, q[3]!, q[5]!, q[7]!], r = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }, s = this.site;
      return this.lotsUnder(r) ? 'buildings stand there' : s && r.x < s.x + s.w && r.x + r.w > s.x && r.y < s.y + s.h && r.y + r.h > s.y ? 'on the stadium site' : ''; } });
  /** the parks the bay rows' lots and on-street runs make (parking.lots(), then parking.curbParks()), as the City has them; their gates and parked cars follow */
  extraParks: CarPark[] = [];
  /** the ids of the extra parks whose parked cars are on the map (their cars go when the park does) */
  private extraCarIds = new Set<number>();
  /** the entrance gates, P signs and pay machines by key gate:{id}:{k} (auto props, never saved) */
  private gateProps = new Map<string, Prop>();
  /** the overlay's view of this engine (its canvas is set each frame; reused, so the render loop allocates nothing) */
  private parkView: ParkOverlayView = { ctx: null as unknown as CanvasRenderingContext2D, dpr: 1, setIso: c => this.setIso(c), screen: (x, y) => this.screen(x, y) };
  /** the car park drag (the park tool, left button): the tile where it began and the one under the pointer (x1, y1), the rect it makes (def, id 0),
   *  its built park (null if not valid), the verdict (why: the reason it cannot be built, '' if it can) and the cost; mx, my: the cursor (CSS px) */
  private parkDrag: null | { x0: number; y0: number; x1: number; y1: number; def: CarParkDef; park: CarPark | null; why: string; cost: number; mx: number; my: number } = null;
  /** the car parks as the player placed them (saved; ids 1..n), and their builds on the network by index (null: no frontage now, drawn red) */
  parkDefs: CarParkDef[] = []; private parkBuilt: (CarPark | null)[] = [];
  /** the parked car props by key park:{id}:{i}, and the time of the last sync of them (ms) */
  private parkCars = new Map<string, Prop>(); private parkSyncAt = -Infinity;
  /** the toll gates as the player placed them (saved; ids 1..n), their plaza segs by id (only while the gate stands), their ground keys, the booths a new gate gets,
   *  whether R has flipped the way in, and the toll tool's plan at the cursor (seg null: no road within 4 tiles; why: the reason it cannot be built, '' if it can) */
  tollDefs: TollDef[] = []; private tollSegs = new Map<number, Seg>(); private tollGround = new Set<string>(); tollBooths = START_BOOTHS; private tollFlip = false;
  private tollHover: null | { mx: number; my: number; seg: Seg | null; a: Pt; b: Pt; why: string; cost: number; booths: number } = null;
  /** the businesses as the player placed them (saved; ids 1..n in the save's order): the main thread's copy, the city worker gets each change
   *  (setBusinesses); the stadium's site (siteAt, cached: see setBizDefs) */
  bizDefs: BizDef[] = []; private stadiumSite: Site | null = null;
  /** the types open to build at the last businesses message (null: none yet, or a new valley or a load: the next one only records them; see bizUnlocks) */
  private bizOpenSeen: Set<BusinessId> | null = null;
  /** the type in hand: the Business tool builds it (see selectBizType) */
  bizType: BusinessId = 'stadium';
  /** the business tool: whether R has turned the footprint (bizRot), and its ghost at the cursor (null: none; def: the business it would be, id 0;
   *  site: its site; why: the reason it cannot be built, '' if it can) */
  private bizRot = false;
  private bizHover: null | { mx: number; my: number; def: BizDef; site: Site; why: string } = null;
  /** the cursor in css px for the ghosts' labels (T019); null off the canvas */
  private ghostMouse: { mx: number; my: number } | null = null;
  /** the last event/marker ghost and the hover state it was built for (rebuilt when the key changes) */
  private ghostCache: { key: string; bp: GhostBlueprint } | null = null;
  /** the road route's price for the cursor label, kept while the route is unchanged (routeCost walks the route's structures) */
  private routeCostCache: { key: string; cost: number } | null = null;
  /** the add-lane tool's plan at the cursor: the straight run of road under it (segs; none on a toll plaza), the class it widens to (null: already the widest),
   *  its cost ($, as the road tool charges the upgrade) and why it cannot be built ('' if it can) */
  laneHover: null | { segs: Seg[]; to: RoadClass | null; cost: number; why: string; down: boolean } = null;
  /** the shuttle bus routes as the player drew them (saved; ids 1..n, a route's index is its sim index), the bus tool's first stop once it is chosen (its
   *  road point, tiles, its car park's id, and its town when the stop is beside a town's car park lot; null until then), and the tool's plan at the cursor
   *  (see busUpdate: the stop it would place, x, y, its car park or town, and why not) */
  busDefs: BusRouteDef[] = []; busPick: { x: number; y: number; park: number; town?: number } | null = null;
  /** the taken cards applied so far (saved: a card is never applied twice; see applyCards), the buses a new route gets and the seats of a bus */
  cardsApplied = 0; busFleet = START_BUSES; busSeats = BUS_SEATS;
  private busHover: null | { mx: number; my: number; x: number; y: number; park: number; why: string; town?: number } = null;
  keys = new Set<string>();
  private listeners = new Set<() => void>();
  private saveTimer = 0; private blocksTimer = 0;
  /** the town's lots: their props by key, the keys queued to apply, the lots staged by the contact sheet (stageLots; they win until a reset) */
  private lotProps = new Map<string, Prop[]>(); private lotQueue = new Set<string>(); private staged = new Map<string, { g: LotGeom; st: ComposeState }>();
  /** the lay-bys' quads by their 'curb:' key (their pts), and the boxes (grown by a tile) of the lay-bys that went or changed since the lots last heard */
  private laybys = new Map<string, number[]>(); private laybyDirty: number[][] = [];
  /** the farms (ext/farms): the accepted parcels follow the network; their props by key (auto 'farm:' + key, never saved), the keys queued to compose, the dev switch */
  private farmMap = new FarmMap(); private farmProps = new Map<string, Prop[]>(); private farmQueue = new Set<string>(); private farmsEnabled = true; private farmTick = 0;
  /** scratch for the starter check (the lot's box, the props found); the planner's last building refresh (ms) and the timer of the town's lot refresh */
  private lotBox: BBox = [0, 0, 0, 0]; private lotHits = new Set<Prop>(); private blocksAt = -Infinity; private lotBlocksTimer = 0;
  private raf = 0; private last = 0;
  private mask: OffscreenCanvas | null = null;
  /** Natural hazards and recurring monster nights; the settings preference survives reloads. */
  disastersEnabled = true;
  setDisasters(on: boolean) {
    this.disastersEnabled = on; this.traffic.disastersOn(on);
    try { localStorage.setItem('capitalempire.disasters', String(on)); } catch { /* storage may be unavailable */ }
    this.emit();
  }

  /** the night (night-light.ts: TrickOrTreat's moonlight and light pools): the owner's settings, which survive reloads */
  night: NightSettings = clampNight(null);
  private nightRenderer = new NightRenderer();
  /** the lights of the props round the view, in world px (placed on screen every frame), and what they were gathered for */
  private nightLights: NightLight[] = []; private nightKey = ''; private nightAt = -Infinity;
  setNight(n: Partial<NightSettings>) {
    this.night = clampNight({ ...this.night, ...n, types: { ...this.night.types, ...n.types } }); this.nightKey = '';
    try { localStorage.setItem('capitalempire.night', JSON.stringify(this.night)); } catch { /* storage may be unavailable */ }
    this.emit();
  }
  /** the night the player skipped (Skip night: its day, nightDay), which stays light */
  private skippedNight = NaN;
  /** how dark the clock's night is now (0 day .. 1 night; 0 on the days between nights and on a skipped night) */
  clockNight(): number {
    const c = this.clock(), h = c.hour + c.minute / 60, n = nightAt(this.night, h, c.day);
    return n > 0 && this.night.mode === 'clock' && nightDay(this.night, h, c.day) === this.skippedNight ? 0 : n;
  }
  /** Skip night (the HUD button while it is dark by the clock): daylight until the next night; the sim's clock runs on as it was */
  skipNight() {
    const c = this.clock(); this.skippedNight = nightDay(this.night, c.hour + c.minute / 60, c.day); this.nightKey = ''; this.emit();
  }
  /** how dark it is now (0 day .. 1 night): the clock's night */
  nightAmount() {
    return this.clockNight();
  }
  /** the night pass over the finished frame: the lights of the props in view (gathered again when the camera, the props or the settings
   *  change, at most every quarter second), then the moonlight */
  private drawNight(ctx: CanvasRenderingContext2D, now: number) {
    const amount = this.nightAmount(); if (!(amount > 0)) return;
    const ze = this.cam.z * this.dpr, W = ctx.canvas.width, H = ctx.canvas.height;
    // gathered over three screens round the view, again once the view has moved a screen, zoomed, or the props or settings changed
    const hw = W / ze, hh = H / ze, key = `${Math.round(this.cam.X / hw)},${Math.round(this.cam.Y / hh)},${Math.round(Math.log2(ze) * 4)},${W},${H},${this.props.size}`;
    if (key !== this.nightKey && (now - this.nightAt > 150 || !this.nightLights.length)) {
      this.nightKey = key; this.nightAt = now; const out: NightLight[] = [], world = (x: number, y: number) => ({ x: worldX(x, y), y: worldY(x, y) });
      for (const p of this.props) {
        const cx = (p.x0 + p.x1) / 2, cy = (p.y0 + p.y1) / 2, X = worldX(cx, cy), Y = worldY(cx, cy);
        if (Math.abs(X - this.cam.X) > 1.5 * hw || Math.abs(Y - this.cam.Y) > 1.5 * hh) continue;
        // the new-art preview lights the picture it draws (newart.ts)
        const q = NEW_ART_ONLY ? { ...p, ...lookOf(p) } : p, it = LIBRARY[q.item]; if (it) propLights(q, it, this.night, world, 1, out);
      }
      this.nightLights = out;
    }
    const ox = this.cw / 2 - this.cam.X * ze, oy = this.ch / 2 - this.cam.Y * ze;
    const placed = this.nightLights.map(l => ({ ...l, sx: l.sx * ze + ox, sy: l.sy * ze + oy, rx: l.rx * ze, ry: l.ry * ze }));
    const lights = placed;
    this.nightRenderer.apply(ctx, this.canvas, this.night, amount, lights);
  }

  /** the cast shadows (cast-shadow.ts): cast-shadow.json, as the baked lots have them, or the owner's tweak in the gear menu (survives reloads) */
  cast: CastShadow = CAST;
  setCast(c: Partial<CastShadow>) {
    this.cast = clampCast({ ...this.cast, ...c });
    try { localStorage.setItem('capitalempire.cast', JSON.stringify(this.cast)); } catch { /* storage may be unavailable */ }
    this.emit();
  }
  /** the contact shadows' darkness (shadow-shape.ts; 1 = TrickOrTreat's builder, 0 = none); the settings preference survives reloads */
  shadowStrength = 1.1;
  setShadowStrength(v: number) {
    this.shadowStrength = Math.max(0, Math.min(2, v));
    try { localStorage.setItem('capitalempire.shadows', String(this.shadowStrength)); } catch { /* storage may be unavailable */ }
    this.emit();
  }

  constructor(public canvas: HTMLCanvasElement, public overlay: HTMLCanvasElement) {
    this.gl = new GLRenderer(canvas);
    this.ov = overlay.getContext('2d')!;
    this.net.paintData = false;
    this.ground = new GroundCache(this.gl);
    this.traffic = new SimClient();
    try { this.disastersEnabled = localStorage.getItem('capitalempire.disasters') !== 'false'; } catch { /* default on */ }
    try { const v = parseFloat(localStorage.getItem('capitalempire.shadows') ?? ''); if (Number.isFinite(v)) this.shadowStrength = Math.max(0, Math.min(2, v)); } catch { /* default 1.1 */ }
    try { const n = localStorage.getItem('capitalempire.night'); if (n) this.night = clampNight(JSON.parse(n)); } catch { /* the defaults */ }
    try { const d = JSON.parse(localStorage.getItem('capitalempire.townday') ?? 'null'); if (d && typeof d === 'object') this.townDay = { minutes: Math.min(30, Math.max(0.5, +d.minutes || 10)), traffic: Math.min(4, Math.max(0, Number.isFinite(+d.traffic) ? +d.traffic : 1)) }; } catch { /* the defaults */ }
    this.traffic.setTownDay(this.townDay.minutes, this.townDay.traffic);
    try { const c = localStorage.getItem('capitalempire.cast'); if (c) this.cast = clampCast(JSON.parse(c)); } catch { /* cast-shadow.json */ }
    // the dev sandbox options (see sandboxGrow): the URL, else the defaults of the dev server or the build
    const q = new URLSearchParams(location.search), dev = import.meta.env.DEV;
    this.sandboxGrow = Number(q.get('grow') ?? (dev ? 20 : 1)) || 1;
    this.stampOn = q.has('stamp') ? q.get('stamp') === '1' : !dev;
    this.sandboxMoney = q.has('money') ? q.get('money') === '1' : dev;
    // every road class, junction (the roundabout without its card), tunnel and signal tier open from the start (?unlock=0 plays the unlocks)
    this.sandboxUnlock = q.has('unlock') ? q.get('unlock') === '1' : dev;
    this.traffic.onGrow = (legs) => this.townGrow(legs);
    this.traffic.onTown = (events) => { for (const e of events) this.lotQueue.add(e.key); };
    // a lot whose road was widened (or narrowed) keeps its house but moves back to the new verge: composed again there, not left over the road
    this.traffic.onLotsMoved = (keys) => { for (const k of keys) this.lotQueue.add(k); };
    this.traffic.onLedger = (l) => {
      if (this.bankrupt && this.traffic.budget.debtDays === DEBT_DAYS) { this.setSpeed(0); this.toast('Bankrupt: the town is out of money', 'warn'); }
      else if (this.bankrupt) { /* already bankrupt: the player keeps watching */ }
      else if (l.money < 0 && !this.traffic.unlimited) this.toast(`In the red: bankrupt in ${DEBT_DAYS - this.traffic.budget.debtDays} days unless the books recover`, 'warn');
      else this.toast(`Day ${l.day}: ${l.net >= 0 ? '+' : '−'}$${Math.abs(l.net).toLocaleString()}`, l.net >= 0 ? 'good' : 'info');
      this.scheduleSave(); this.emit();
    };
    if (NEW_ART_ONLY) setTimeout(() => this.toast('New-art preview: only the new four-view buildings and generated trees are drawn (?newart)', 'info'), 4000);
    this.traffic.onDisasters = (notes) => { for (const n of notes) this.toast(disasterText(n), n.k === 'repaired' ? 'good' : n.k === 'ended' ? 'info' : 'warn'); };
    this.traffic.onMilestone = (newly, won) => {
      for (const m of newly) {
        const what = [...m.classes.map(id => classOf(id).name), ...m.junctions.map(id => JUNCTIONS.find(j => j.id === id)!.name), ...(m.tunnels ? ['tunnels'] : [])].join(', ');
        this.toast(`${m.name}${what ? `: ${what}` : ''}${m.grant ? `, grant $${m.grant.toLocaleString()}` : ''}`, 'good');
      }
      if (won) { this.showWin = true; this.toast(`${WIN_POP.toLocaleString()} residents: the Career is won`, 'good'); }
      this.scheduleSave(); this.emit();
    };
    this.traffic.onBiz = () => this.bizUnlocks();
  }
  get cls() { return classOf(this.roadClass); }

  subscribe(fn: () => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  emit() { for (const l of this.listeners) l(); }
  toast(text: string, kind: Toast['kind'] = 'info') {
    this.toasts.push({ id: this.toastId++, text, t: performance.now(), kind });
    if (this.toasts.length > 4) this.toasts.shift();
    this.emit();
  }

  async init(opts: { bench?: number } = {}) {
    const tick = (p: number) => { this.loadProgress = p; this.emit(); };
    if (opts.bench) this.disastersEnabled = false;
    if (opts.bench) { this.sandboxGrow = 1; this.stampOn = true; this.sandboxMoney = false; this.sandboxUnlock = false; }
    this.traffic.sandbox(this.sandboxGrow, this.sandboxMoney); // before the terrain: the city worker reads its options from the first messages
    this.resize();
    const atlas = this.gl.loadAtlas(this.dpr >= 1.5);
    this.pageImages = await Promise.all(ATLAS_PAGES.map(row => new Promise<HTMLImageElement>(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(im); im.src = row[1]; })));
    this.pageAlpha = this.pageImages.map(im => { const w = Math.max(1, im.naturalWidth >> 1), h = Math.max(1, im.naturalHeight >> 1), c = new OffscreenCanvas(w, h), g = c.getContext('2d', { willReadFrequently: true })!; g.drawImage(im, 0, 0, w, h); return { w, h, data: g.getImageData(0, 0, w, h).data }; });
    tick(0.3);
    await atlas; tick(0.5); if (this.dead) return;
    const save = opts.bench ? null : await readSave(); if (this.dead) return;
    let loaded: SaveV5 | null = null;
    if (opts.bench) { this.genTerrain(1); const { buildBenchmark } = await import('./bench'); buildBenchmark(this, opts.bench); }
    else if (!save && this.newGolfGame()) { /* a new golf game: its town, drive and course are laid (see newGolfGame) */ }
    else if (!save || !this.load(save)) { this.golf = null; this.genTerrain(newSeed()); this.seedTowns(); }
    else loaded = save;
    tick(0.7);
    const tl = performance.now();
    this.ground.init(this.terrain);
    this.sendTerrain(); this.afterLoad();
    if (this.stampPending) { this.stampPending = false; this.traffic.stamp(TOWN_POP); this.scheduleSave(); }
    if (loaded) this.traffic.townState(loaded.lots ?? [], loaded.simT ?? 0, loaded.budget, loaded.money, loaded.career, loaded.shift ?? 0, loaded.round, loaded.bizStats);
    if (opts.bench) console.log('[bench] after load', Math.round(performance.now() - tl), 'ms');
    await new Promise<void>(res => { const wait = () => (this.ground.ready || this.dead ? res() : setTimeout(wait, 30)); wait(); });
    if (this.dead) return;
    this.ready = true; tick(1);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }
  /** generate the valley for a seed (about 0.3–0.6 s) */
  private genTerrain(seed: number) {
    this.seed = seed; this.terrain = generateTerrain(seed);
    this.names = new Names(seed); this.townPts = townCentres(this.terrain); this.roadNames = new RoadNames(this.names, this.townPts);
    for (const ps of this.forest.values()) for (const p of ps) this.sprites.remove(p);
    this.forest.clear(); this.perf.forest = 0; this.slope = slopeField(this.terrain.height); this.clearing = makeNoise(this.terrain.seed ^ 0x5f0e);
    for (const ps of this.townTrees.values()) for (const p of ps) this.sprites.remove(p);
    this.townTrees.clear(); this.perf.townTrees = 0; this.townClump = makeNoise(this.terrain.seed ^ 0x7c1a); this.lotBoxes.clear(); this.paintBoxes.clear();
  }
  /** a new golf game (golf/start.ts): the first seed of up to 8 whose valley has a course beside its town. Lays the town's streets (its avenue and
   *  gravel, free town roads), the gravel drive, the camera on the centre, the clubhouse and car park, the course's paints and the golf state. False,
   *  with nothing laid, when no seed fits (the caller then makes a classic game). */
  private newGolfGame(): boolean {
    for (let k = 0; k < 8; k++) {
      const seed = newSeed();
      this.genTerrain(seed);
      const s = planGolfGame(this.terrain, seed);
      if (!s) continue;
      this.townPts = [s.centre]; this.roadNames = new RoadNames(this.names, this.townPts);
      const byClass = new Map<ClassId, Leg[]>();
      s.town.legs.forEach((l, i) => { const id = s.town.cls[i]!; let a = byClass.get(id); if (!a) byClass.set(id, a = []); a.push(l); });
      for (const [id, legs] of byClass) this.edit.addLegs(legs, classOf(id), 0, undefined, true);
      this.edit.addLegs(s.drive, classOf('gravel'), 0, undefined, true);
      this.cam.X = worldX(s.centre.x, s.centre.y); this.cam.Y = worldY(s.centre.x, s.centre.y);
      if (this.stampOn) this.stampPending = true;
      const [vx, vy, vw, vh] = s.venue, [px, py, pw, ph] = s.carpark;
      this.setBizDefs([{ id: 1, type: 'clubhouse', x: vx, y: vy, w: vw, h: vh }]);
      this.parkDefs = [{ id: 1, x: px, y: py, w: pw, h: ph }];
      this.paint.load(s.paints.map((a, i) => toTuple({ id: i + 1, ...a })));
      this.golf = s.save; this.golf.progress = emptyProgress();
      for (const p of dressCourse(s.layout, seed)) {
      const i = LIB_INDEX.get(p.id);
      if (i !== undefined) {
      const prop = this.addProp(i, p.x, p.y, p.flip, p.scale);
      const pin = s.layout.pins.find(q => Math.abs(q.x - p.x) < 1 && Math.abs(q.y - p.y) < 1);
      if (pin && (p.id === PIN_RED_ID || p.id === PIN_YELLOW_ID)) {
      this.golfProps.set('pin:' + pin.hole, prop);
      } else {
      const tee = s.layout.tees.find(q => Math.abs(q.x - p.x) < 1 && Math.abs(q.y - p.y) < 1);
      if (tee) this.golfProps.set(`tee:${tee.hole}:${tee.kind}`, prop);
      }
      }
      }
      return true;
      }
      console.warn('golf: none of 8 seeds has a course beside its town; a classic game instead');
    return false;
  }
  dead = false;
  destroy() { this.dead = true; cancelAnimationFrame(this.raf); clearTimeout(this.saveTimer); clearTimeout(this.blocksTimer); clearTimeout(this.lotBlocksTimer); this.ground.terminate(); this.traffic?.terminate(); }

  // ---------- geometry helpers ----------
  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.cssW = r.width; this.cssH = r.height;
    this.cw = Math.max(1, Math.round(r.width * this.dpr)); this.ch = Math.max(1, Math.round(r.height * this.dpr));
    for (const c of [this.canvas, this.overlay]) if (c.width !== this.cw || c.height !== this.ch) { c.width = this.cw; c.height = this.ch; }
  }
  tileAt(mx: number, my: number) {
    const X = this.cam.X + (mx - this.cssW / 2) / this.cam.z, Y = this.cam.Y + (my - this.cssH / 2) / this.cam.z;
    return tileOf(X, Y);
  }
  screen(x: number, y: number) {
    const ze = this.cam.z * this.dpr;
    return { x: (worldX(x, y) - this.cam.X) * ze + this.cw / 2, y: (worldY(x, y) - this.cam.Y) * ze + this.ch / 2 };
  }
  setIso(ctx: CanvasRenderingContext2D) {
    const ze = this.cam.z * this.dpr;
    ctx.setTransform(HW * ze, HH * ze, -HW * ze, HH * ze, this.cw / 2 - this.cam.X * ze, this.ch / 2 - this.cam.Y * ze);
  }
  footprint(it: LibItem, x: number, y: number, flip: boolean, k: number) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const b of it.boxes) {
      const hx = (flip ? b.hy : b.hx) * k / 2, hy = (flip ? b.hx : b.hy) * k / 2, dx = (flip ? b.dy : b.dx) * k / 2, dy = (flip ? b.dx : b.dy) * k / 2;
      x0 = Math.min(x0, x + dx - hx); x1 = Math.max(x1, x + dx + hx); y0 = Math.min(y0, y + dy - hy); y1 = Math.max(y1, y + dy + hy);
    }
    return { x0, y0, x1, y1 };
  }
  canPlace(it: LibItem, x: number, y: number, flip: boolean, k: number, ignore?: Prop): string {
    const f = this.footprint(it, x, y, flip, k);
    if (f.x0 < 1 || f.y0 < 1 || f.x1 > MAP - 1 || f.y1 > MAP - 1) return 'Outside the town limits';
    for (let y = Math.floor(f.y0); y < Math.ceil(f.y1); y++) for (let x = Math.floor(f.x0); x < Math.ceil(f.x1); x++) {
      const c = this.terrain.cls[y * MAP + x]; if (c === TC.HILL || c === TC.WATER || c === TC.CREEK || c === TC.BANK) return 'Not on hills or water';
    }
    const occ = this.net.rectOcc(f.x0 + 0.08, f.y0 + 0.08, f.x1 - 0.08, f.y1 - 0.08);
    if (it.kind === 'car') { if (occ === 3) return 'Not on the median'; }
    else if (it.big) { if (occ) return 'Keep buildings off the road and sidewalk'; }
    else if (occ === 2) return 'Not on the asphalt';
    for (const p of this.propGrid.query([f.x0, f.y0, f.x1, f.y1])) {
      if (p === ignore) continue;
      const pit = LIBRARY[p.item];
      if (!(it.big || pit.big)) continue;
      if (f.x0 < p.x1 - 0.05 && f.x1 > p.x0 + 0.05 && f.y0 < p.y1 - 0.05 && f.y1 > p.y0 + 0.05) return 'Overlaps ' + pit.name;
    }
    return '';
  }
  /** places a golf hole's props (golf/holepreset.ts): a flag, trees, bushes and flowers from the library, picked and turned and sized by a seeded rnd; a prop that cannot be placed is skipped. Returns how many were placed */
  placePresetProps(ps: PresetProp[], seed: number): number {
    const trees = LIBRARY.flatMap((it, i) => it.kind === 'tree' && !/dead/.test(it.id) ? [i] : []), bushes = LIBRARY.flatMap((it, i) => it.kind === 'bush' ? [i] : []);
    const flowers = ['town:hydrangea', 'town:fern', 'town:ornamental_grass'].flatMap(id => LIB_INDEX.get(id) ?? []);
    const flag = LIB_INDEX.get('golf:flagstick') ?? LIB_INDEX.get('business:golf-pin-red');
    const rnd = mulberry(seed * 7919); let n = 0;
    for (const q of ps) {
      if (q.id !== undefined) {
        const i = LIB_INDEX.get(q.id); if (i === undefined) continue;
        const flip = q.flip ?? false, scale = q.scale ?? (OWNER_SCALE[q.id] ?? 1);
        if (this.canPlace(LIBRARY[i]!, q.x, q.y, flip, scale)) continue;
        this.addProp(i, q.x, q.y, flip, scale); n++; continue;
      }
      const pool = q.kind === 'tree' ? trees : q.kind === 'bush' ? bushes : q.kind === 'flower' ? flowers : flag === undefined ? [] : [flag];
      if (!pool.length) continue;
      const i = pool[Math.floor(rnd() * pool.length)]!, flip = q.kind === 'flag' ? false : rnd() < 0.5;
      const scale = (OWNER_SCALE[LIBRARY[i]!.id] ?? 1) * (q.kind === 'flag' ? 1 : 0.9 + 0.2 * rnd());
      if (this.canPlace(LIBRARY[i]!, q.x, q.y, flip, scale)) continue;
      this.addProp(i, q.x, q.y, flip, scale); n++;
    }
    this.scheduleSave(); return n;
  }
  /** a plant brush dab (paint-tool.ts, plant.ts): sprites from ids at the candidate spots of the circle, each at least 0.9 x spacing from
   *  every prop (planted, lot, town or forest) and where canPlace allows; sized lo..hi times the sprite's map scale; free, like Paint. Returns how many */
  plantProps(ids: string[], x: number, y: number, r: number, spacing: number, size: [number, number], seed: number): number {
    const pool = ids.flatMap(id => LIB_INDEX.get(id) ?? []); if (!pool.length) return 0;
    const rnd = mulberry(seed * 7919 + 13), s2 = (0.9 * spacing) ** 2; let n = 0;
    for (const q of plantPoints(x, y, r, spacing, seed)) {
      if (q.x < 1 || q.y < 1 || q.x > MAP - 1 || q.y > MAP - 1) continue;
      let near = false;
      for (const p of this.propGrid.query([q.x - spacing, q.y - spacing, q.x + spacing, q.y + spacing])) if ((p.x - q.x) ** 2 + (p.y - q.y) ** 2 < s2) { near = true; break; }
      if (near) continue;
      const i = pool[Math.floor(rnd() * pool.length)]!, flip = rnd() < 0.5, scale = (OWNER_SCALE[LIBRARY[i]!.id] ?? 1) * (size[0] + (size[1] - size[0]) * rnd());
      if (this.canPlace(LIBRARY[i]!, q.x, q.y, flip, scale)) continue;
      this.addProp(i, q.x, q.y, flip, scale).plant = 1; n++;
    }
    if (n) this.scheduleSave(); return n;
  }
  /** the sprites a plant brush can use (the Paint panel's picks) */
  plantPool(kind: PlantBrushKind) { return plantPool(LIBRARY, kind); }
  /** how many props the plant brushes have placed */
  plantedCount() { let n = 0; for (const p of this.props) if (p.plant) n++; return n; }
  /** the plant brush's Rub out: removes the props placed by a plant brush (Prop.plant) whose anchor is inside the circle; never other props. Returns how many */
  unplantProps(x: number, y: number, r: number): number {
    let n = 0;
    for (const p of [...this.propGrid.query([x - r, y - r, x + r, y + r])]) if (p.plant && (p.x - x) ** 2 + (p.y - y) ** 2 <= r * r) { this.removeProp(p); n++; }
    if (n) this.scheduleSave(); return n;
  }
  addProp(item: number, x: number, y: number, flip: boolean, scale: number, auto?: string): Prop {
    // no building is ever mirrored (mirror.ts): a flip draws the four-view art turned (its partner view), any other building unflipped
    const [id, f0] = drawnAs(LIBRARY[item]!, flip); if (id !== LIBRARY[item]!.id) item = LIB_INDEX.get(id) ?? item; flip = f0;
    // no tree is mirrored at random: the sun comes from the right, so a tree is drawn mirrored only when its art is lit from the left (tree-sun.ts)
    if (LIBRARY[item]!.kind === 'tree') flip = TREE_MIRROR.has(LIBRARY[item]!.id);
    const f = this.footprint(LIBRARY[item], x, y, flip, scale);
    const p: Prop = { uid: this.nextUid++, item, x, y, flip, scale, ...f };
    if (auto) p.auto = auto;
    this.props.add(p); this.propGrid.add(p, [p.x0, p.y0, p.x1, p.y1]); this.sprites.add(p);
    if (this.propLog) this.propLog.added.push(p);
    if (LIBRARY[item].kind === 'lamp') this.lampProps.add(p);
    if (LIBRARY[item].big && LIBRARY[item].kind !== 'car') this.scheduleBlocks(isLotProp(p)); // cars are not building blocks (sendBlocks skips them)
    return p;
  }
  removeProp(p: Prop) {
    if (!this.props.delete(p)) return;
    if (this.propLog) { const k = this.propLog.added.indexOf(p); if (k >= 0) this.propLog.added.splice(k, 1); else this.propLog.removed.push(p); }
    this.propGrid.remove(p); this.sprites.remove(p); this.lampProps.delete(p);
    if (p.auto) this.autoByKey.delete(p.auto);
    if (this.selected === p) this.selected = null;
    if (LIBRARY[p.item].big && LIBRARY[p.item].kind !== 'car') this.scheduleBlocks(isLotProp(p));
  }
  /** after moving, flipping or scaling a prop */
  /** plant the forest and town-tree cells near the view (world px rectangle): nearest to the view centre first, at most two cells per frame (forest and town together).
   *  A town cell has key + N * N (N cells a side) */
  private plantForest(X0: number, Y0: number, X1: number, Y1: number) {
    const a = tileOf(X0, Y0), b = tileOf(X1, Y0), c = tileOf(X0, Y1), d = tileOf(X1, Y1), g = 8, N = MAP / FOREST_CELL, NN = N * N;
    const ci0 = clamp(Math.floor((Math.min(a.x, b.x, c.x, d.x) - g) / FOREST_CELL), 0, N - 1), ci1 = clamp(Math.floor((Math.max(a.x, b.x, c.x, d.x) + g) / FOREST_CELL), 0, N - 1);
    const cj0 = clamp(Math.floor((Math.min(a.y, b.y, c.y, d.y) - g) / FOREST_CELL), 0, N - 1), cj1 = clamp(Math.floor((Math.max(a.y, b.y, c.y, d.y) + g) / FOREST_CELL), 0, N - 1);
    let todo: number[] | null = null;
    for (let cj = cj0; cj <= cj1; cj++) for (let ci = ci0; ci <= ci1; ci++) {
      const key = cj * N + ci;
      if (!this.forest.has(key)) { if (!todo) todo = []; todo.push(key); }
      if (!this.townTrees.has(key)) { if (!todo) todo = []; todo.push(key + NN); }
    }
    if (!todo) return;
    const m = tileOf((X0 + X1) / 2, (Y0 + Y1) / 2), mx = clamp(Math.floor(m.x / FOREST_CELL), 0, N - 1), my = clamp(Math.floor(m.y / FOREST_CELL), 0, N - 1);
    const dd = (q: number) => { const k = q % NN; return ((k % N) - mx) ** 2 + (Math.floor(k / N) - my) ** 2; };
    todo.sort((p, q) => dd(p) - dd(q));
    for (let k = 0; k < Math.min(2, todo.length); k++) {
      const q = todo[k]!, key = q % NN;
      if (q >= NN) this.plantTownCell(key, key % N, Math.floor(key / N)); else this.plantCell(key, key % N, Math.floor(key / N));
    }
  }
  /** plant one forest cell as sprites (not props: no selection, bulldozing or saving) */
  private plantCell(key: number, ci: number, cj: number) {
    const out = this.treeSprites(forestCell(this.terrain.seed, this.terrain.cls, this.terrain.height, this.slope, this.clearing, ci, cj));
    this.forest.set(key, out); this.perf.forest += out.length;
  }
  /** the sprites of planted trees (not props), skipping the ones in front of a tunnel mouth */
  private treeSprites(trees: ForestTree[]): Prop[] {
    const out: Prop[] = [];
    for (const tr of trees) {
      if (this.inPortal(tr.x, tr.y)) continue;
      let item = this.forestItem.get(tr.id);
      if (item === undefined) { item = LIBRARY.findIndex(i => i.id === tr.id); this.forestItem.set(tr.id, item); }
      if (item < 0) continue;
      const it = LIBRARY[item], b = it.boxes[0], ax = tr.x - b.dx * tr.scale / 2, ay = tr.y - b.dy * tr.scale / 2, flip = TREE_MIRROR.has(it.id); // the sun from the right (tree-sun.ts)
      const p: Prop = { uid: this.nextUid++, item, x: ax, y: ay, flip, scale: tr.scale, ...this.footprint(it, ax, ay, flip, tr.scale) };
      this.sprites.add(p); out.push(p);
    }
    return out;
  }
  /** plant one town-tree cell as sprites: the predicates are built from the lots, roads, businesses, car parks, toll plazas, painted areas and portals near the cell */
  private plantTownCell(key: number, ci: number, cj: number) {
    const x0 = ci * FOREST_CELL, y0 = cj * FOREST_CELL, x1 = x0 + FOREST_CELL, y1 = y0 + FOREST_CELL, g = 30;
    const lots: LotView[] = [];
    for (const l of this.traffic.lots.values()) if (boxNear(lotBoxOf(l.o, l.u, l.n, l.w, l.d), x0, y0, x1, y1, g)) lots.push(l);
    const bizs = this.bizDefs.filter(d => boxNear([d.x, d.y, d.x + d.w, d.y + d.h], x0, y0, x1, y1, g));
    const parks = this.parkDefs.filter(d => boxNear([d.x, d.y, d.x + d.w, d.y + d.h], x0, y0, x1, y1, g));
    const tolls: [TollDef, Seg][] = [];
    for (const d of this.tollDefs) { const s = this.tollSegs.get(d.id); if (s && boxNear(tollBox(d), x0, y0, x1, y1, g)) tolls.push([d, s]); }
    const paints = this.paint.areas.filter(a => boxNear(ptsBox(a.pts), x0, y0, x1, y1, g));
    const near = (x: number, y: number) => { for (const l of lots) if (lotGap(l, x, y) <= 24) return true; return false; };
    const free = (x: number, y: number, r: number) => {
      for (const l of lots) if (lotGap(l, x, y) < r) return false;
      const p = { x, y };
      for (const s of this.net.segsNear(p, r + 16)) if (segDist(p, s) < s.cls.h + s.cls.walk + r + 0.5) return false;
      for (const d of bizs) if (x > d.x - r && x < d.x + d.w + r && y > d.y - r && y < d.y + d.h + r) return false;
      for (const d of parks) if (x > d.x - r - 1 && x < d.x + d.w + r + 1 && y > d.y - r - 1 && y < d.y + d.h + r + 1) return false;
      for (const [d, s] of tolls) { const f = plazaLocal(d, x, y); if (f.t >= -r && f.t <= PLAZA_LEN + r && f.o >= -s.cls.h - r && f.o <= plazaEdge(d.booths, laneOff(s, 0)) + r) return false; }
      if (paints.length) for (let k = 0; k < 9; k++) { const a = k * Math.PI / 4; if (areaAt(paints, x + (k < 8 ? Math.cos(a) * r : 0), y + (k < 8 ? Math.sin(a) * r : 0))) return false; }
      return !this.inPortal(x, y);
    };
    const out = this.treeSprites(townTreeCell(this.terrain.seed, this.terrain.cls, this.townClump, ci, cj, free, near));
    this.townTrees.set(key, out); this.perf.townTrees += out.length;
  }
  /** the town-tree cells whose box (30 tiles around the cell) touches the box x0 y0 x1 y1 lose their trees: plantForest plants them again */
  private dropTownTrees(x0: number, y0: number, x1: number, y1: number) {
    const N = MAP / FOREST_CELL, g = 30;
    for (const [k, ps] of this.townTrees) {
      const ci = k % N, cj = Math.floor(k / N);
      if (!boxNear([x0, y0, x1, y1], ci * FOREST_CELL, cj * FOREST_CELL, (ci + 1) * FOREST_CELL, (cj + 1) * FOREST_CELL, g)) continue;
      for (const p of ps) this.sprites.remove(p);
      this.perf.townTrees -= ps.length; this.townTrees.delete(k);
    }
  }
  /** a lot's rectangle changed (or went): the town trees around its old and new box are dropped (a change of level alone does not move the trees) */
  private townLotChanged(key: string, box: number[] | null) {
    const old = this.lotBoxes.get(key);
    if (old && box && old.every((v, i) => v === box[i])) return;
    if (old) this.dropTownTrees(old[0]!, old[1]!, old[2]!, old[3]!);
    if (box) { this.dropTownTrees(box[0]!, box[1]!, box[2]!, box[3]!); this.lotBoxes.set(key, box); } else this.lotBoxes.delete(key);
  }
  /** no trees in front of a tunnel mouth: a short strip out of the portal, as wide as its road plus margin */
  private inPortal(x: number, y: number): boolean {
    for (const p of this.portalPts) {
      const dx = x - p.x, dy = y - p.y, t = dx * p.dir.x + dy * p.dir.y, lat = Math.abs(-dx * p.dir.y + dy * p.dir.x);
      if (t > -6 && t < 8 && lat < p.hw + 3) return true;
    }
    return false;
  }
  /** after a network rebuild: the forest cells near a tunnel mouth (old or new) re-plant without the trees in the way */
  private syncPortals() {
    const ps = this.net.portals(), key = ps.map(p => p.x.toFixed(2) + ',' + p.y.toFixed(2)).sort().join(';');
    if (key === this.portalKey) return;
    const pts = [...this.portalPts, ...ps], N = MAP / FOREST_CELL, g = 14;
    for (const [k, trees] of this.forest) {
      const x0 = (k % N) * FOREST_CELL - g, y0 = Math.floor(k / N) * FOREST_CELL - g, x1 = x0 + FOREST_CELL + 2 * g, y1 = y0 + FOREST_CELL + 2 * g;
      if (!pts.some(p => p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1)) continue;
      for (const p of trees) this.sprites.remove(p);
      this.perf.forest -= trees.length; this.forest.delete(k);
    }
    this.portalKey = key; this.portalPts = ps;
  }
  private propChanged(p: Prop) { const it = LIBRARY[p.item]; Object.assign(p, this.footprint(it, p.x, p.y, p.flip, p.scale)); this.propGrid.remove(p); this.propGrid.add(p, [p.x0, p.y0, p.x1, p.y1]); this.sprites.update(p); if (it.big) this.scheduleBlocks(); }
  /** street lamps light the road: their reflection pools are part of the ground picture */
  syncLamps() {
    const pts = [...this.lampProps].map(p => ({ x: (p.x0 + p.x1) / 2, y: (p.y0 + p.y1) / 2 }));
    const changed = this.net.setLamps(pts);
    this.ground.lamps(new Float32Array(pts.flatMap(p => [p.x, p.y])));
    for (const b of changed) this.ground.invalidate(b, false, 0, 'gm');
  }
  /** a lot's ground patches (driveways, walks, car parks, yards); null drops them. Batched: the ground hears of them once per frame */
  setLotGround(key: string, patches: LotPatch[] | null) {
    const keep: string[] = [];
    for (let i = 0; i < (patches?.length ?? 0); i++) { const p = patches![i], surface = (p.paint || p.lawn) && grassSurface(p.tex, !!p.lawn, surfaceOfTex(p.tex as PaintTex)); if (!surface) continue; const id = `${key}/${i}`; keep.push(id); this.grass.register(id, p.pts, surface, /worn|dry/i.test(p.tex) ? 'stressed' : 'maintained'); }
    for (const id of this.grassZones.get(key) ?? []) if (!keep.includes(id)) this.grass.remove(id);
    if (keep.length) this.grassZones.set(key, keep); else this.grassZones.delete(key);
    if (key.startsWith('paint:')) this.paintChanged(key, patches);
    if (key.startsWith('curb:')) this.laybyChanged(key, patches);
    this.lotPending.set(key, patches);
  }
  /** a curb's lay-by quad went, came or changed: it is kept for placeLot, and its old and new outline (grown by a tile) marks the lots to compose again */
  private laybyChanged(key: string, patches: LotPatch[] | null) {
    const old = this.laybys.get(key), q = patches?.find(p => p.layby)?.pts;
    if (old) this.laybyDirty.push(this.grownBox(ptsBox(old)));
    if (q) { this.laybys.set(key, q); this.laybyDirty.push(this.grownBox(ptsBox(q))); } else this.laybys.delete(key);
  }
  /** a box grown by a tile on each side (a new array: the dirty list keeps it) */
  private grownBox(b: number[]): number[] { return [b[0]! - 1, b[1]! - 1, b[2]! + 1, b[3]! + 1]; }
  /** the lots whose box touches a changed lay-by are queued to compose again (one pass a frame that a lay-by changed; applyLotQueue does the rest) */
  private laybyLots() {
    const d = this.laybyDirty; if (!d.length) return;
    for (const [key, b] of this.lotBoxes) for (const e of d) if (b[0]! <= e[2]! && b[2]! >= e[0]! && b[1]! <= e[3]! && b[3]! >= e[1]!) { this.lotQueue.add(key); break; }
    d.length = 0;
  }
  /** a street prop stands in a lay-by's bays: its footprint centre (as addProp's footprint) lies inside a lay-by grown by LAYBY_PAD */
  private inLayby(item: number, q: Placed): boolean {
    if (!this.laybys.size) return false;
    const f = this.footprint(LIBRARY[item]!, q.x, q.y, q.flip, q.scale), cx = (f.x0 + f.x1) / 2, cy = (f.y0 + f.y1) / 2;
    for (const p of this.laybys.values()) if (inQuad(p, cx, cy, LAYBY_PAD)) return true;
    return false;
  }
  /** a painted area went or came: the town trees around its old and new outline are dropped */
  private paintChanged(key: string, patches: LotPatch[] | null) {
    const old = this.paintBoxes.get(key);
    if (old) this.dropTownTrees(old[0]!, old[1]!, old[2]!, old[3]!);
    if (patches?.length) { const b = ptsBox(patches[0]!.pts); this.dropTownTrees(b[0]!, b[1]!, b[2]!, b[3]!); this.paintBoxes.set(key, b); } else this.paintBoxes.delete(key);
  }
  private flushLotGround() { if (!this.lotPending.size) return; const { set, drop } = lotBatch(this.lotPending); this.lotPending.clear(); this.ground.lotGround(set, drop); }
  /** the town's lots: up to 40 queued keys a frame (more while the queue is over 2,000, up to 400), so a loaded city fills in */
  private applyLotQueue() {
    const q = this.lotQueue; if (!q.size) return;
    const n = q.size > 2000 ? Math.min(400, 40 + Math.ceil((q.size - 2000) / 4)) : 40;
    let k = 0;
    for (const key of q) { if (k++ >= n) break; q.delete(key); this.applyLot(key); }
  }
  /** a lot follows the town: composed from its town state; dropped when EMPTY, gone or holding a starter building (a staged lot is as it was staged) */
  private applyLot(key: string) {
    const st = this.staged.get(key);
    const v = st ? undefined : this.traffic.lots.get(key);
    this.townLotChanged(key, st ? lotBoxOf([st.g.o.x, st.g.o.y], [st.g.u.x, st.g.u.y], [st.g.n.x, st.g.n.y], st.g.w, st.g.d) : v ? lotBoxOf(v.o, v.u, v.n, v.w, v.d) : null);
    if (st) { this.placeLot(key, st.g, st.st); return; }
    if (!v) { this.dropLot(key); return; }
    const g: LotGeom = { o: { x: v.o[0], y: v.o[1] }, u: { x: v.u[0], y: v.u[1] }, n: { x: v.n[0], y: v.n[1] }, w: v.w, d: v.d };
    // an empty lot, or one a starter house stands on, keeps only its share of the fence grid (none on the golf land): a starter house's lot all
    // the lines it owns, an empty lot only those it shares with a lot that has a house
    const starter = v.level !== LV.EMPTY && this.starterIn(v);
    this.houseChanged(key, v, v.level >= LV.BUILT || starter);
    if (v.level === LV.EMPTY || starter) {
      if (this.onGolfLand(lotBoxOf(v.o, v.u, v.n, v.w, v.d))) { this.dropLot(key); return; }
      const across = acrossLines(g), lines: FenceLines = starter ? { side: true, back: true } : { side: this.houseAt(across.side, key), back: !!across.back && this.houseAt(across.back, key) };
      if (lines.side || lines.back) this.placeFence(key, g, v.seed, lines); else this.dropLot(key);
      return;
    }
    this.placeLot(key, g, { use: v.use, level: v.level, decline: v.decline, seed: v.seed });
  }
  /** a lot's share of the fence grid alone (compose fenceOnly): panels that would stand in a building or another prop are left out */
  private placeFence(key: string, g: LotGeom, seed: number, lines: FenceLines) {
    this.dropLot(key);
    const ps: Prop[] = [];
    for (const q of fenceOnly(g, seed, lines).props) { const i = LIB_INDEX.get(q.id); if (i !== undefined && !this.canPlace(LIBRARY[i]!, q.x, q.y, q.flip, q.scale)) ps.push(this.addProp(i, q.x, q.y, q.flip, q.scale, 'lot:' + key)); }
    this.lotProps.set(key, ps); this.perf.lotProps += ps.length;
  }
  /** the lots with a house on them (built, or a starter house): an empty neighbour fences the line it shares with one */
  private houseLots = new Set<string>();
  /** is the point inside a lot (not `self`) that has a house on it (built, or a starter house) */
  private houseAt(p: { x: number; y: number }, self: string): boolean {
    for (const v of this.traffic.lots.values()) {
      if (v.key === self) continue;
      const rx = p.x - v.o[0], ry = p.y - v.o[1], a = rx * v.u[0] + ry * v.u[1], b = rx * v.n[0] + ry * v.n[1];
      if (a >= 0 && a <= v.w && b >= 0 && b <= v.d) return v.level >= LV.BUILT || (v.level !== LV.EMPTY && this.starterIn(v));
    }
    return false;
  }
  /** a lot got or lost its house: its empty neighbours (lots whose boxes touch its own) compose again, so their shared lines follow */
  private houseChanged(key: string, v: LotView, house: boolean) {
    if (house === this.houseLots.has(key)) return;
    if (house) this.houseLots.add(key); else this.houseLots.delete(key);
    const b = lotBoxOf(v.o, v.u, v.n, v.w, v.d);
    for (const w of this.traffic.lots.values()) {
      if (w.key === key || w.level !== LV.EMPTY) continue;
      const c = lotBoxOf(w.o, w.u, w.n, w.w, w.d);
      if (c[0]! <= b[2]! + 1 && c[2]! >= b[0]! - 1 && c[1]! <= b[3]! + 1 && c[3]! >= b[1]! - 1) this.lotQueue.add(w.key);
    }
  }
  /** a box (tiles [x0, y0, x1, y1]) that overlaps the golf land by more than half a tile */
  private onGolfLand(b: ArrayLike<number>): boolean {
    return this.golfLand().some(([x, y, w, h]) => Math.min(b[2]!, x + w) - Math.max(b[0]!, x) > 0.5 && Math.min(b[3]!, y + h) - Math.max(b[1]!, y) > 0.5);
  }
  /** a non-auto building (not a car) in the lot's box: the starter town's houses win over the lot */
  private starterIn(v: LotView): boolean {
    const x = v.o[0], y = v.o[1], ax = v.u[0] * v.w, ay = v.u[1] * v.w, bx = v.n[0] * v.d, by = v.n[1] * v.d, b = this.lotBox;
    b[0] = Math.min(x, x + ax, x + bx, x + ax + bx); b[1] = Math.min(y, y + ay, y + by, y + ay + by);
    b[2] = Math.max(x, x + ax, x + bx, x + ax + bx); b[3] = Math.max(y, y + ay, y + by, y + ay + by);
    this.lotHits.clear(); this.propGrid.query(b, this.lotHits);
    for (const p of this.lotHits) { const it = LIBRARY[p.item]; if (!p.auto && it.big && it.kind !== 'car') return true; }
    return false;
  }
  /** the road blocks' lawns on the ground (lawns.ts), by ground key ('lawn:' + block key), and the timer of the next sync after an edit */
  private blockLawns = new Set<string>(); private blockLawnTimer = 0;
  /** every road block gets its lawn (lawns.ts blockLawn): blocks that went lose theirs, new ones get one; a block whose corners stayed keeps it */
  private syncBlockLawns() {
    const keep = new Set<string>();
    for (const b of enclosedBlocks(this.net, BLOCK_MAX_AREA)) {
      const k = 'lawn:' + b.key; keep.add(k); if (this.blockLawns.has(k)) continue;
      const p = blockLawn(b); if (p) { this.setLotGround(k, [p]); this.blockLawns.add(k); }
    }
    for (const k of [...this.blockLawns]) if (!keep.has(k)) { this.setLotGround(k, null); this.blockLawns.delete(k); }
  }
  /** after a road edit: the blocks' lawns again in a moment (a drag of edits makes one sync) */
  private scheduleBlockLawns() { clearTimeout(this.blockLawnTimer); this.blockLawnTimer = window.setTimeout(() => this.syncBlockLawns(), 400); }
  /** the lot's props and ground go */
  private dropLot(key: string) {
    const old = this.lotProps.get(key);
    if (old) { for (const p of old) if (this.props.has(p)) { this.removeProp(p); this.perf.lotProps--; } this.lotProps.delete(key); }
    this.setLotGround(key, null);
  }
  /** composes a lot and adds its props (auto 'lot:' + key: never saved, and the tools ignore them) and its ground patches */
  private placeLot(key: string, g: LotGeom, st: ComposeState) {
    this.dropLot(key);
    const c = compose(g, st), ps: Prop[] = [];
    for (const q of c.props) { const i = LIB_INDEX.get(q.id); if (i !== undefined && !(q.street && this.inLayby(i, q))) ps.push(this.addProp(i, q.x, q.y, q.flip, q.scale, 'lot:' + key)); }
    this.lotProps.set(key, ps); this.perf.lotProps += ps.length;
    // a yard of its own only where a building stands (a big sprite that is not a car, as sendBlocks counts buildings, or a baked house lot); an
    // empty lot shows its block's grass
    const built = ps.some(p => { const it = LIBRARY[p.item]!; return !!it.block || (it.big && it.kind !== 'car'); });
    const lawn = built ? lotLawn(key, g) : null; this.setLotGround(key, lawn ? [lawn, ...c.ground] : c.ground);
  }
  /** the farms follow the network (ext/farms): the parcels of the changed country roads are derived again (all after a load or a
   *  new valley); the parcels that went lose their props and ground, the new ones queue to compose */
  private farmsUpdate(full = false) {
    if (!this.farmsEnabled || !this.terrain) return;
    const { added, removed } = this.farmMap.update(this.net, { cls: this.terrain.cls, seed: this.seed }, { towns: this.townPts, site: this.site, parks: this.farmParks() }, this.traffic.lots, full || this.net.lastFull);
    for (const k of removed) this.dropFarm(k);
    for (const k of added) this.farmQueue.add(k);
  }
  /** what the farms keep clear of besides the town and the site: the car parks, and in golf mode the course's rect too (the farm map's update and stale checks read the same list) */
  private farmParks(): { x: number; y: number; w: number; h: number }[] {
    if (!this.golf) return this.parkDefs;
    if (!this.golf.course) return this.parkDefs;
    const [x, y, w, h] = this.golf.course;
    return [...this.parkDefs, { x, y, w, h }];
  }
  /** a farm's props and ground go, and it leaves the compose queue */
  private dropFarm(key: string) {
    this.farmQueue.delete(key);
    const ps = this.farmProps.get(key);
    if (ps) { for (const p of ps) if (this.props.has(p)) this.removeProp(p); this.farmProps.delete(key); }
    this.setLotGround('farm:' + key, null);
  }
  /** every farm goes (a reset, the farms switched off) */
  private dropAllFarms() {
    for (const k of [...this.farmMap.farms.keys(), ...this.farmProps.keys()]) this.dropFarm(k);
    this.farmMap.clear(); this.farmQueue.clear();
  }
  /** a farm composes on apply: its farmhouse, barn and fields as auto props ('farm:' + key, never saved) and its ground patches; at most FARMS_PER_FRAME a frame */
  private applyFarmQueue() {
    const q = this.farmQueue; if (!q.size) return;
    let k = 0;
    for (const key of q) { if (k++ >= FARMS_PER_FRAME) break; q.delete(key); this.placeFarm(key); }
  }
  private placeFarm(key: string) {
    const f = this.farmMap.farms.get(key); if (!f) return;
    this.dropFarm(key);
    const c = composeFarm(f.p, f.seed), ps: Prop[] = [], pk = 'farm:' + key;
    for (const q of c.props) { const i = LIB_INDEX.get(q.id); if (i !== undefined) ps.push(this.addProp(i, q.x, q.y, q.flip, q.scale, pk)); }
    this.farmProps.set(key, ps); this.setLotGround(pk, c.ground);
  }
  /** the dev switch (window.__game.farmsOn(false)): farms on (the default) or off; off removes every farm's props and ground */
  farmsOn(on: boolean) { this.farmsEnabled = on; if (on) this.farmsUpdate(true); else this.dropAllFarms(); }
  /** median trees, roundabout trees and traffic lights follow the road network (only what the last rebuild changed) */
  /** the town street lamps waiting for houses near them (AutoProp.town), by key: tried again when the lots change (sendBlocks) */
  private lampWait = new Map<string, AutoProp>();
  private syncAutoProps(added: AutoProp[], removed: AutoProp[]) {
    let lamps = false;
    for (const a of removed) { const k = autoKey(a); this.lampWait.delete(k); const p = this.autoByKey.get(k); if (p) { this.removeProp(p); this.autoByKey.delete(k); lamps ||= a.kind === 'lamp'; } }
    for (const a of added) {
      const k = autoKey(a); if (this.autoByKey.has(k)) continue;
      // a town road's lamp stands only where the town has houses within 12 tiles
      if (a.town) { let near = false; for (const p of this.propGrid.query([a.x - 12, a.y - 12, a.x + 12, a.y + 12])) { const kind = LIBRARY[p.item]?.kind; if (kind === 'lot' || kind === 'house') { near = true; break; } } if (!near) { this.lampWait.set(k, a); continue; } this.lampWait.delete(k); }
      const id = a.kind === 'tree' ? AUTO_TREES[a.i % AUTO_TREES.length] : a.kind === 'rbtree' ? 'world:tree_oak_0' : a.kind === 'lamp' ? 'world:streetlamp' : 'town:traffic_light';
      const item = LIBRARY.findIndex(i => i.id === id); if (item < 0) continue;
      const it = LIBRARY[item], b = it.boxes[0], scale = a.kind === 'tree' ? 0.85 : a.kind === 'rbtree' ? 1.2 : a.kind === 'lamp' ? 0.9 : 1, x = a.x - b.dx * scale / 2, y = a.y - b.dy * scale / 2;
      // a street lamp gives way to whatever already stands there (a lot's own lamps, a tree, a building)
      if (a.kind === 'lamp' && this.canPlace(it, x, y, false, scale)) continue;
      const p = this.addProp(item, x, y, false, scale); p.auto = k; this.autoByKey.set(k, p); lamps ||= a.kind === 'lamp';
    }
    if (lamps) this.syncLamps();
  }
  /** building footprints for the planner map (debounced: many edits, one message); the town's lots wait, at most one refresh per LOT_BLOCKS_MS */
  private scheduleBlocks(lot = false) {
    if (!this.ready) return;
    if (lot) { if (!this.lotBlocksTimer) this.lotBlocksTimer = window.setTimeout(() => { this.lotBlocksTimer = 0; this.sendBlocks(true); }, Math.max(0, this.blocksAt + LOT_BLOCKS_MS - performance.now())); return; }
    clearTimeout(this.blocksTimer); this.blocksTimer = window.setTimeout(() => this.sendBlocks(true), 400);
  }
  private sendBlocks(invalidate: boolean) {
    if (this.lampWait.size) this.syncAutoProps([...this.lampWait.values()], []);
    const out: number[] = [];
    for (const p of this.props) {
      const it = LIBRARY[p.item]; if (!it.big || it.kind === 'car') continue;
      // a baked lot shows its house (block, metres around the anchor; mirrored with the lot), not the whole lot
      if (it.block) { const b = it.block, f = p.flip, s = p.scale / 2, hx = (f ? b.hy : b.hx) * s, hy = (f ? b.hx : b.hy) * s, cx = p.x + (f ? b.dy : b.dx) * s, cy = p.y + (f ? b.dx : b.dy) * s; out.push(cx - hx, cy - hy, cx + hx, cy + hy, BUILDING_KINDS.house ?? 0); continue; }
      out.push(p.x0, p.y0, p.x1, p.y1, BUILDING_KINDS[it.kind] ?? 2);
    }
    this.blocksAt = performance.now();
    this.ground.blocks(new Float32Array(out));
    if (invalidate) this.ground.invalidate([0, 0, MAP, MAP], false, 0, 'p');
  }

  // ---------- network edits ----------
  /** send the edits to the workers, refresh what depends on the network and mark the changed ground stale */
  private commitNetwork(keepPrev = false, until = 0) {
    const ops = this.edit.commit(); this.lanes.update(this.net);
    this.ground.netOps(ops); this.traffic.netOps(ops);
    if (this.net.lastDirty) { const d = this.net.lastDirty; this.ground.invalidate([d[0] - 2, d[1] - 2, d[2] + 2, d[3] + 2], keepPrev, until); this.dropTownTrees(d[0], d[1], d[2], d[3]); }
    if (this.net.lastDirty) { const hb = this.flattenRoadsIn(this.net.lastDirty); if (hb) this.courseHeightChanged(hb); }
    this.syncAutoProps(this.net.autoAdded, this.net.autoRemoved); this.syncPortals(); this.farmsUpdate(); this.scheduleBlockLawns();
    this.syncLamps(); if (this.parkDefs.length) this.syncParks(); this.parking.sync(); if (this.tollDefs.length) this.syncTolls(); if (this.busDefs.length) this.traffic.setBusRoutes(this.busDefs);
    this.scheduleSave(); this.emit();
  }
  /** flattens the course height under every road near box (its asphalt and verge, feathered over 2 tiles); returns the changed box */
  private flattenRoadsIn(box: CourseTileBox | BBox): CourseTileBox | null {
    const f = this.courseHeight; if (!f.rev) return null; // never edited: flat
    const cx = (box[0] + box[2]) / 2, cy = (box[1] + box[3]) / 2, r = Math.max(box[2] - box[0], box[3] - box[1]) / 2 + 16;
    let out: CourseTileBox | null = null;
    for (const s of this.net.segsNear({ x: cx, y: cy }, r)) out = unionCourseBox(out, flattenCourseCorridor(f, { ax: s.a.x, ay: s.a.y, bx: s.b.x, by: s.b.y, halfWidthTiles: s.cls.h + s.cls.walk, marginTiles: 2 }));
    return out;
  }
  /** the course height changed in box: save, and the workers take the new heights and re-bake the ground there */
  private courseHeightChanged(box: CourseTileBox) { this.scheduleSave(); this.ground.courseHeight(this.courseHeight.data, box); }
  private afterLoad() {
    const ops = this.edit.commit(true); this.lanes.update(this.net);
    // the city worker gets the whole network (the bench commits its own edits before this, so `ops` can be empty)
    this.ground.netOps(ops); this.traffic.netOps(netToOps(this.net)); this.syncPortals();
    this.syncAutoProps(this.net.autoProps, []);
    this.syncLamps(); this.sendBlocks(false); this.syncBlockLawns();
    this.ground.invalidateAll(); this.ground.courseHeight(this.courseHeight.data, [0, 0, MAP, MAP]); this.syncParks(); this.parking.sync(); this.traffic.setBusinesses(this.bizDefs); this.syncTolls(true); this.traffic.setBusRoutes(this.busDefs);
    this.farmsUpdate(true);
    // the worker's golf state (a new game or a load of one; a classic game turns it off)
    this.traffic.setGolf(!!this.golf, this.golf?.tier ?? 1, this.golf?.rep ?? 0, this.golfLand());
    this.syncGolfProps();
    this.tagCourseHoles();
    }
    golfProps = new Map<string, Prop>();
    golfStructureProps = new Map<number, Prop>();
    eventTool = false;
    eventStructurePending: { typeId: string; mode: 'rent' | 'buy' } | null = null;
    toggleEventTool() {
    if (!this.golfMode) return;
    this.eventTool = !this.eventTool;
    if (!this.eventTool) this.eventStructurePending = null;
    this.emit();
    }
    setPendingStructure(typeId: string, mode: 'rent' | 'buy') {
    this.eventStructurePending = { typeId, mode };
    const def = STRUCTURE[typeId];
    this.toast(`Selected ${def ? def.name : typeId} (${mode}). Click open owned land to place it.`);
    this.emit();
    }
    /** checkStructurePlacement for a candidate against the course's holes, placed structures and owned parcels (the click and the ghost share it) */
    private structureCheck(candidate: { typeId: string; x: number; y: number; mode: 'rent' | 'buy'; rotated?: boolean }): StructurePlacementCheck {
    const g = this.golf!;
    const holes = this.courseStatsView() ? deriveHoles(this.paint.areas.map(a => ({ id: a.id, surface: surfaceOfTex(a.tex) ?? 'other', pts: a.pts })), g.tees, g.pins, g.aims) : [];
    return checkStructurePlacement(candidate, { tier: g.tier, holes, existing: g.structures ?? [], parcels: g.parcels ?? [g.parcel] });
    }
    placeEventStructure(candidate: { typeId: string; x: number; y: number; mode: 'rent' | 'buy'; rotated?: boolean }): boolean {
    if (!this.golf) return false;
    const check = this.structureCheck(candidate);
    if (!check.ok) {
    this.toast(check.reason ?? 'Cannot place structure here', 'warn');
    return false;
    }
    if (this.money < check.cost) {
    this.toast(`Not enough money ($${check.cost.toLocaleString()} required)`, 'warn');
    return false;
    }
    if (candidate.mode === 'buy' && check.cost > 0) {
    this.traffic.spend('construction', check.cost);
    }
    const id = Math.max(0, ...(this.golf.structures ?? []).map(s => s.id)) + 1;
    const placed: PlacedEventStructure = { id, ...candidate };
    if (!this.golf.structures) this.golf.structures = [];
    this.golf.structures.push(placed); this.syncCourseGates(); this.bump('structures');
    const sprId = STRUCTURE_SPRITE[candidate.typeId] ?? 'expansion:backyard-tent';
    const item = LIB_INDEX.get(sprId);
    if (item !== undefined) {
    // the sprite sits on the middle of the structure's rectangle (x, y is its corner)
    const [rx, ry, rw, rh] = structureRect(placed);
    const prop = this.addProp(item, rx + rw / 2, ry + rh / 2, Boolean(candidate.rotated), structureScale(candidate.typeId, LIBRARY[item]!, Boolean(candidate.rotated)));
    this.golfStructureProps.set(id, prop);
    }
    const def = STRUCTURE[candidate.typeId];
    this.toast(candidate.mode === 'rent' ? `Placed ${def ? def.name : candidate.typeId} (rent $${check.cost.toLocaleString()}/yr at tournament)` : `Placed ${def ? def.name : candidate.typeId} ($${check.cost.toLocaleString()})`);
    this.eventStructurePending = null;
    this.scheduleSave();
    this.emit();
    return true;
    }
    removeStructure(i: number) {
    if (!this.golf?.structures) return;
    const s = this.golf.structures[i]!;
    const def = STRUCTURE[s.typeId];
    const refund = s.mode === 'buy' && def?.buy ? Math.round(def.buy * 0.5) : 0;
    const prop = this.golfStructureProps.get(s.id);
    if (prop) this.removeProp(prop);
    this.golfStructureProps.delete(s.id);
    this.golf.structures.splice(i, 1); this.syncCourseGates();
    if (refund > 0) this.traffic.spend('construction', -refund);
    this.scheduleSave();
    this.toast(`Removed ${def ? def.name : s.typeId}${refund > 0 ? ` (+$${refund.toLocaleString()})` : ''}`);
    this.emit();
    }
    holesTool = false;
    selectedGolfMarker: { hole: number; kind: 'pin' | 'back' | 'middle' | 'forward'; x: number; y: number } | null = null;
    toggleHolesTool() {
    if (!this.golfMode) return;
    this.holesTool = !this.holesTool;
    if (!this.holesTool) this.selectedGolfMarker = null;
    this.emit();
    }
    selectGolfMarker(hole: number, kind: 'pin' | 'back' | 'middle' | 'forward') {
    if (!this.golf) return;
    const pt = kind === 'pin' ? this.golf.pins.find(p => p.hole === hole) : this.golf.tees.find(t => t.hole === hole && t.kind === kind);
    if (pt) {
    this.selectedGolfMarker = { hole, kind, x: pt.x, y: pt.y };
    this.jumpTo(pt.x, pt.y);
    this.toast(`Selected Hole ${hole} ${kind === 'pin' ? 'pin' : kind + ' tee'}. Click a new position on the course to move it.`);
    this.emit();
    }
    }
    /** the course's gates to the sim (LEAD.md M2.1): every placed structure of kind 'gate', at its rectangle's middle, its capacity as lanes */
    private syncCourseGates() {
    const gates: { x: number; y: number; lanes: number }[] = [];
    for (const s of this.golf?.structures ?? []) { const def = STRUCTURE[s.typeId]; if (def?.kind !== 'gate') continue; const [x, y, w, h] = structureRect(s); gates.push({ x: x + w / 2, y: y + h / 2, lanes: Math.max(1, def.capacity) }); }
    this.traffic.setGates(gates);
    // the galleries (LEAD.md M2.2): the greens and tees of the course and the placed grandstands and tents
    this.traffic.setSpots(this.golf ? gallerySpots(this.golf.tees ?? [], this.golf.pins ?? [], this.golf.structures ?? []) : []);
    }
    private syncGolfProps() {
    this.golfProps.clear();
    this.golfStructureProps.clear();
    this.syncCourseGates();
    if (!this.golf) return;
    for (const pin of this.golf.pins ?? []) {
    const key = 'pin:' + pin.hole;
    const id = pin.hole === 9 ? PIN_YELLOW_ID : PIN_RED_ID;
    const item = LIB_INDEX.get(id);
    for (const p of this.props) {
    if (p.item === item && Math.hypot(p.x - pin.x, p.y - pin.y) < 2) { this.golfProps.set(key, p); break; }
    }
    }
    for (const tee of this.golf.tees ?? []) {
    const key = `tee:${tee.hole}:${tee.kind}`;
    const id = tee.kind === 'back' ? TEE_BACK_ID : tee.kind === 'middle' ? TEE_MIDDLE_ID : TEE_FORWARD_ID;
    const item = LIB_INDEX.get(id);
    for (const p of this.props) {
    if (p.item === item && Math.hypot(p.x - tee.x, p.y - tee.y) < 2) { this.golfProps.set(key, p); break; }
    }
    }
    const claimed = new Set<Prop>();
    for (const s of this.golf.structures ?? []) {
    const sprId = STRUCTURE_SPRITE[s.typeId] ?? 'expansion:backyard-tent';
    const item = LIB_INDEX.get(sprId);
    if (item === undefined) continue;
    let found: Prop | undefined;
    const [rx, ry, rw, rh] = structureRect(s), cx = rx + rw / 2, cy = ry + rh / 2;
    for (const p of this.props) {
    if (!claimed.has(p) && p.item === item && (Math.hypot(p.x - cx, p.y - cy) < 2 || Math.hypot(p.x - s.x, p.y - s.y) < 2)) { found = p; break; }
    }
    if (!found) found = this.addProp(item, cx, cy, Boolean(s.rotated), structureScale(s.typeId, LIBRARY[item]!, Boolean(s.rotated)));
    claimed.add(found);
    this.golfStructureProps.set(s.id, found);
    }
    }
    moveGolfMarker(hole: number, kind: 'pin' | 'back' | 'middle' | 'forward', x: number, y: number): boolean {
    if (!this.golf) return false;
    const areas: CourseArea[] = this.paint.areas.map(a => ({ id: a.id, surface: surfaceOfTex(a.tex) ?? 'other', pts: a.pts }));
    const v = validateMarkerPlacement(areas, kind, x, y);
    if (!v.ok) {
    this.toast(v.reason ?? 'Invalid placement', 'warn');
    return false;
    }
    const key = kind === 'pin' ? 'pin:' + hole : `tee:${hole}:${kind}`;
    const oldProp = this.golfProps.get(key);
    if (oldProp) this.removeProp(oldProp);
    const sprId = kind === 'pin' ? (hole === 9 ? PIN_YELLOW_ID : PIN_RED_ID) : (kind === 'back' ? TEE_BACK_ID : kind === 'middle' ? TEE_MIDDLE_ID : TEE_FORWARD_ID);
    const item = LIB_INDEX.get(sprId);
    if (item !== undefined) {
    const newProp = this.addProp(item, x, y, false, 1);
    this.golfProps.set(key, newProp);
    }
    if (kind === 'pin') {
    const p = this.golf.pins.find(q => q.hole === hole);
    if (p) { p.x = x; p.y = y; } else this.golf.pins.push({ hole, x, y });
    } else {
    const t = this.golf.tees.find(q => q.hole === hole && q.kind === kind);
    if (t) { t.x = x; t.y = y; } else this.golf.tees.push({ hole, kind, x, y });
    }
    this.selectedGolfMarker = null;
    this.scheduleSave();
    this.emit();
    this.toast(`Moved Hole ${hole} ${kind === 'pin' ? 'pin' : kind + ' tee'} to (${Math.round(x)}, ${Math.round(y)})`);
    return true;
    }

  // ---------- road routing ----------
  setTool(t: Tool) { if (t === 'business' && this.golfMode) return; /* golf mode: the game places the clubhouse, so no Business tool */ if (this.tool !== t) { this.paint.cancel(); this.cancelRoute(); this.selected = null; this.selectedJunction = null; this.parkDrag = null; this.parking.drag = null; this.tollHover = null; this.bizHover = null; this.busPick = null; this.busHover = null; this.laneHover = null; } this.tool = t; if (t === 'course') this.paint.enterCourse(); else if (t === 'paint') this.paint.enterPaint(); this.emit(); }
  /** the snap radius in tiles: about 14 screen px (at least 2 tiles) */
  private snapRadius() { return Math.max(2, 14 / (HW * this.cam.z)); }
  /** the road tool's snap under the cursor, or null with no cursor */
  private cursorSnap(): Snap | null { return this.hover ? snapPoint(this.net, this.hover, this.snapRadius()) : null; }
  /** why the preview route cannot be built ('' when it can): see checkLegs */
  routeBlock(legs: Leg[] = this.previewLegs()): string {
    if (!legs.length) return '';
    // judged exactly as a click at the cursor would be (roadClick refuses such a point), or, with the cursor on the last point, as finishing does
    const c0 = this.cursorSnap(), last = this.route[this.route.length - 1], cs = c0 && last ? this.aim(last, c0) : c0, onLast = !!cs && !!last && cs.p.x === last.x && cs.p.y === last.y;
    return checkLegs(this.net, legs, this.routeFrom, onLast || !cs ? this.routeLast : cs, this.cls, new Set(this.routeCuts(legs).map(c => c.seg)));
  }
  /** the road pieces the route bulldozes: with Replace on, those it clashes with (see replaceCuts); always, the hidden stubs inside a ring it joins (see ringStubs) */
  private routeCuts(legs: Leg[]): PieceSel[] {
    if (!legs.length) return [];
    const stubs = ringStubs(this.net, legs), cuts = this.replaceMode ? replaceCuts(this.net, legs, this.cls) : [];
    return [...stubs, ...cuts.filter(c => !stubs.some(x => x.seg === c.seg))];
  }
  /** legs from `from` to `p`: a right-angle bend, or (45° mode) a diagonal followed by a straight */
  private legsTo(from: Pt, p: Pt, straight = false): Leg[] {
    const dx = p.x - from.x, dy = p.y - from.y, ax = Math.abs(dx), ay = Math.abs(dy);
    if (!ax && !ay) return [];
    if (straight) {
      const k = Math.round((ax + ay) / 2);
      if (ax >= 2.4 * ay || ay >= 2.4 * ax) return [{ a: from, b: ax >= ay ? { x: p.x, y: from.y } : { x: from.x, y: p.y } }];
      return [{ a: from, b: { x: from.x + Math.sign(dx) * k, y: from.y + Math.sign(dy) * k } }];
    }
    if (!ax || !ay) return [{ a: from, b: p }];
    if (this.bendMode === 45) {
      const k = Math.min(ax, ay), corner = { x: from.x + Math.sign(dx) * k, y: from.y + Math.sign(dy) * k };
      if (corner.x === p.x && corner.y === p.y) return [{ a: from, b: p }];
      return [{ a: from, b: corner }, { a: corner, b: p }];
    }
    const corner = ax >= ay ? { x: p.x, y: from.y } : { x: from.x, y: p.y };
    return [{ a: from, b: corner }, { a: corner, b: p }];
  }
  /** a snap onto a road, seen from the route's last point: the point on that road square across from `from`, so the new road meets it
   *  straight (a T) instead of an L whose corner and last stretch would lie on the road itself; the snap as it is when that foot is off the
   *  road's span (within MIN_SEP of its ends) or `from` lies on the road's line */
  private aim(from: Pt, s: Snap): Snap {
    if (s.kind !== 'road' || !s.seg) return s;
    const a = s.seg.a, b = s.seg.b, dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy); if (L < 1e-6) return s;
    const t = ((from.x - a.x) * dx + (from.y - a.y) * dy) / L, q = { x: a.x + dx * t / L, y: a.y + dy * t / L };
    if (t < MIN_SEP || t > L - MIN_SEP || Math.hypot(from.x - q.x, from.y - q.y) < 1) return s;
    return { ...s, p: q };
  }
  previewLegs(): Leg[] {
    const legs: Leg[] = [];
    for (let i = 1; i < this.route.length; i++) legs.push({ a: this.route[i - 1], b: this.route[i] });
    const cs = this.cursorSnap();
    if (this.route.length && cs) { const last = this.route[this.route.length - 1]!; legs.push(...this.legsTo(last, this.aim(last, cs).p, this.keys.has('Shift'))); }
    return legs;
  }
  /** what the route under the pointer costs: the new road less the value of the pieces Replace (or a ring's hidden stubs) takes away (negative: a refund) */
  routeCost() { const legs = this.previewLegs(); return Math.round(this.structured(legs).cost - this.piecesValue(this.routeCuts(legs))); }
  /** the value of a road seg: its length x its class's cost x its kind's factor (STRUCT_COST: a bridge or a tunnel costs more), what building it charged */
  private segValue(s: Seg) { return vlen(sub(s.b, s.a)) * s.cls.cost * STRUCT_COST[s.kind]; }
  /** the value of every road on the map (see segValue): the bulldozer and Replace refund the fall in it, so the dead ends tidyEnds trims count too */
  private roadValue() { let v = 0; for (const s of this.net.segs) v += this.segValue(s); return v; }
  /** the value of road pieces (a part of a seg each), before they are cut */
  private piecesValue(cuts: PieceSel[]) { let v = 0; for (const c of cuts) v += vlen(sub(c.p1, c.p0)) * c.seg.cls.cost * STRUCT_COST[c.seg.kind]; return v; }
  /** the town's built-up lots (BUILDING or more) that the legs' centre lines run through: sampled every half tile, a point counts when it is
   *  at least half a tile inside the lot's rectangle (o, along u, away n, w by d) */
  private lotsInLegs(legs: Leg[]): LotView[] {
    const hit: LotView[] = [];
    if (!legs.length) return hit;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const l of legs) { x0 = Math.min(x0, l.a.x, l.b.x); y0 = Math.min(y0, l.a.y, l.b.y); x1 = Math.max(x1, l.a.x, l.b.x); y1 = Math.max(y1, l.a.y, l.b.y); }
    for (const v of this.traffic.lots.values()) {
      if (v.level < LV.BUILDING) continue;
      const [ox, oy] = v.o, [ux, uy] = v.u, [nx, ny] = v.n, R = Math.hypot(v.w, v.d) / 2 + 0.5;
      const cx = ox + (ux * v.w + nx * v.d) / 2, cy = oy + (uy * v.w + ny * v.d) / 2;
      if (cx < x0 - R || cx > x1 + R || cy < y0 - R || cy > y1 + R) continue;
      if (legs.some(l => {
        const k = Math.max(1, Math.ceil(vlen(sub(l.b, l.a)) / 0.5));
        for (let i = 0; i <= k; i++) {
          const x = l.a.x + (l.b.x - l.a.x) * i / k - ox, y = l.a.y + (l.b.y - l.a.y) * i / k - oy, a = x * ux + y * uy, b = x * nx + y * ny;
          if (a >= 0.5 && a <= v.w - 0.5 && b >= 0.5 && b <= v.d - 0.5) return true;
        }
        return false;
      })) hit.push(v);
    }
    return hit;
  }
  /** the compensation the route being drawn would cost: the built-up lots it runs through, and their total $ */
  routeCompensation(): { n: number; comp: number } {
    const hit = this.lotsInLegs(this.structured(this.previewLegs()).parts);
    return { n: hit.length, comp: hit.reduce((s, v) => s + compensation(v), 0) };
  }
  private roadClick(mx: number, my: number) {
    let s = snapPoint(this.net, this.tileAt(mx, my), this.snapRadius());
    if (this.route.length) s = this.aim(this.route[this.route.length - 1]!, s);
    if (!this.route.length) { this.routeFrom = s; this.route.push(s.p); this.routeLast = s; this.emit(); return; }
    const last = this.route[this.route.length - 1], add = this.legsTo(last, s.p, this.keys.has('Shift'));
    // a point the route could not be built with is refused at once (the preview shows it red with the same reason)
    const legs: Leg[] = []; for (let i = 1; i < this.route.length; i++) legs.push({ a: this.route[i - 1]!, b: this.route[i]! });
    const all = [...legs, ...add], why = add.length ? checkLegs(this.net, all, this.routeFrom, s, this.cls, new Set(this.routeCuts(all).map(c => c.seg))) : '';
    if (why) { this.toast(why, 'warn'); return; }
    for (const l of add) this.route.push(this.weld(l.b));
    this.routeLast = s; this.emit();
  }
  /** a route point within 0.05 tiles of a node lands on it: a 45° bend's corner a few hundredths off one was judged the same point by the rules
   *  but made a second node, and a road piece a few hundredths long (the road builder's stress test, 2026-10-19) */
  private weld(p: Pt): Pt {
    for (const s of this.net.segsNear(p, 0.2)) for (const n of [s.a, s.b]) if (Math.hypot(n.x - p.x, n.y - p.y) < 0.05) return { x: n.x, y: n.y };
    return p;
  }
  undoRoutePoint() { this.route.pop(); this.emit(); }
  cancelRoute() { this.route = []; this.routeFrom = this.routeLast = null; this.emit(); }
  /** strip test: does the prop footprint touch a leg's corridor of half width hw? */
  private propInLegs(p: Prop, legs: Leg[], hw: number) {
    const pts = [{ x: p.x0, y: p.y0 }, { x: p.x1, y: p.y0 }, { x: p.x0, y: p.y1 }, { x: p.x1, y: p.y1 }, { x: (p.x0 + p.x1) / 2, y: (p.y0 + p.y1) / 2 }];
    for (const l of legs) {
      const d = sub(l.b, l.a), L = vlen(d), u = mul(d, 1 / L), n = perp(u);
      for (const q of pts) { const w = sub(q, l.a), t = u.x * w.x + u.y * w.y, s = Math.abs(n.x * w.x + n.y * w.y); if (t > -hw && t < L + hw && s < hw) return true; }
    }
    return false;
  }
  /** does a road corridor of half width hw run into a business? (the stadium's footprint padded by 2 tiles, the others' by 1) */
  private crossesBiz(legs: Leg[], hw: number): boolean {
    if (!this.bizDefs.length) return false;
    for (const l of legs) {
      const d = sub(l.b, l.a), L = vlen(d); if (!L) continue;
      const u = mul(d, 1 / L), n = perp(u);
      for (let s = 0; s <= L; s += 0.5) for (let o = -hw; o <= hw + 1e-6; o += 0.5) {
        const x = l.a.x + u.x * s + n.x * o, y = l.a.y + u.y * s + n.y * o;
        for (const b of this.bizDefs) { const p = b.type === 'stadium' ? 2 : 1; if (x >= b.x - p && x < b.x + b.w + p && y >= b.y - p && y < b.y + b.h + p) return true; }
      }
    }
    return false;
  }
  /** does a road corridor of half width hw run into a car park (its rect padded by 1 tile)? */
  private crossesPark(legs: Leg[], hw: number): boolean {
    for (const l of legs) {
      const d = sub(l.b, l.a), L = vlen(d); if (!L) continue;
      const u = mul(d, 1 / L), n = perp(u);
      for (let s = 0; s <= L; s += 0.5) for (let o = -hw; o <= hw + 1e-6; o += 0.5) {
        const x = l.a.x + u.x * s + n.x * o, y = l.a.y + u.y * s + n.y * o;
        for (const p of this.parkDefs) if (x >= p.x - 1 && x <= p.x + p.w + 1 && y >= p.y - 1 && y <= p.y + p.h + 1) return true;
      }
    }
    return false;
  }
  /** does a road corridor of half width hw run into a toll plaza (its outline padded by 1 tile)? Legs along the plaza's own centre line are fine (upgrading the road) */
  private crossesToll(legs: Leg[], hw: number): boolean {
    for (const d of this.tollDefs) {
      const s = this.tollSegs.get(d.id); if (!s) continue;
      const h = s.cls.h, W = plazaEdge(d.booths, laneOff(s, 0)), onLine = (p: Pt) => Math.abs(plazaLocal(d, p.x, p.y).o) < 0.05;
      for (const l of legs) {
        if (onLine(l.a) && onLine(l.b)) continue;
        const dv = sub(l.b, l.a), L = vlen(dv); if (!L) continue;
        const u = mul(dv, 1 / L), n = perp(u);
        for (let k = 0; k <= L; k += 0.5) for (let o = -hw; o <= hw + 1e-6; o += 0.5) {
          const f = plazaLocal(d, l.a.x + u.x * k + n.x * o, l.a.y + u.y * k + n.y * o);
          if (f.t >= -1 && f.t <= PLAZA_LEN + 1 && f.o >= -h - 1 && f.o <= W + 1) return true;
        }
      }
    }
    return false;
  }
  /** does a road corridor of half width hw cross a hill or the river? (creeks and banks are fine: culverts, riverside roads); or a business */
  private blockedForRoad(legs: Leg[], hw: number): boolean {
    if (this.crossesBiz(legs, hw)) return true;
    for (const l of legs) {
      const d = sub(l.b, l.a), L = vlen(d); if (!L) continue;
      const u = mul(d, 1 / L), n = perp(u);
      for (let s = 0; s <= L; s += 0.5) for (let o = -hw; o <= hw + 1e-6; o += 0.5) {
        const x = l.a.x + u.x * s + n.x * o, y = l.a.y + u.y * s + n.y * o, c = classAt(this.terrain, x, y);
        if (c === TC.HILL || c === TC.WATER) return true;
      }
    }
    return false;
  }
  /** the legs split into ground, bridge and tunnel pieces, with their cost (money) and an error ('' if fine) */
  private structured(legs: Leg[]) {
    const { legs: parts, kinds } = splitByTerrain(legs, this.cls.h + this.cls.walk, (x, y) => classAt(this.terrain, x, y));
    // a split point (a bank, a tunnel mouth) within 2 tiles of a node on the route moves on to it: just off it, it left a road piece under a tile
    for (let i = 0; i + 1 < parts.length; i++) {
      const q = parts[i]!.b, r = parts[i + 1]!.a; if (Math.hypot(q.x - r.x, q.y - r.y) > 1e-6) continue;
      for (const s of this.net.segsNear(q, 2.5)) for (const m of [s.a, s.b]) { const d = Math.hypot(m.x - q.x, m.y - q.y); if (d > 1e-6 && d < 2 && segDist(m, { a: parts[i]!.a, b: parts[i + 1]!.b } as Seg) < 0.02) { parts[i]!.b = { x: m.x, y: m.y }; parts[i + 1]!.a = { x: m.x, y: m.y }; } }
    }
    let raw = 0; for (let i = 0; i < parts.length; i++) raw += vlen(sub(parts[i].b, parts[i].a)) * this.cls.cost * STRUCT_COST[kinds[i]];
    const cost = Math.round(raw), lens = structureLengths(parts, kinds);
    let err = '';
    if (longestRun(parts, kinds, SK.BRIDGE) > STRUCT_MAX[SK.BRIDGE]) err = `Bridges can span at most ${STRUCT_MAX[SK.BRIDGE] * 2} m`;
    else if (longestRun(parts, kinds, SK.TUNNEL) > STRUCT_MAX[SK.TUNNEL]) err = `Tunnels can be at most ${STRUCT_MAX[SK.TUNNEL] * 2} m long`;
    return { parts, kinds, cost, lens, err };
  }
  private propsNearLegs(legs: Leg[], hw: number) {
    let bb: BBox | null = null; for (const l of legs) bb = unionBox(bb, [Math.min(l.a.x, l.b.x) - hw, Math.min(l.a.y, l.b.y) - hw, Math.max(l.a.x, l.b.x) + hw, Math.max(l.a.y, l.b.y) + hw]);
    return bb ? [...this.propGrid.query(bb)].filter(p => this.propInLegs(p, legs, hw)) : [];
  }
  finishRoute() {
    const legs: Leg[] = [];
    for (let i = 1; i < this.route.length; i++) if (this.route[i].x !== this.route[i - 1].x || this.route[i].y !== this.route[i - 1].y) legs.push({ a: this.route[i - 1], b: this.route[i] });
    if (!legs.length) { this.cancelRoute(); return; }
    const cuts = this.routeCuts(legs), block = checkLegs(this.net, legs, this.routeFrom, this.routeLast, this.cls, new Set(cuts.map(c => c.seg)));
    if (block) { this.toast(block, 'warn'); return; }
    const cls = this.cls, st = this.structured(legs), { parts, kinds, cost: build, lens } = st, cost = Math.round(build - this.piecesValue(cuts));
    const hit = this.lotsInLegs(parts), comp = hit.reduce((s, v) => s + compensation(v), 0);
    if (!this.classOpen(cls.id)) { const lk = unlockOf('class', cls.id)!; this.toast(`${cls.name} unlocks at ${lk.pop.toLocaleString()} residents (${lk.name})`, 'warn'); return; }
    if (kinds.includes(SK.TUNNEL) && !this.tunnelsOpen()) { const lk = unlockOf('tunnel')!; this.toast(`Tunnels unlock at ${lk.pop.toLocaleString()} residents (${lk.name})`, 'warn'); return; }
    if (cost + comp > this.money) { this.toast(`Not enough money: the route costs $${cost.toLocaleString()}${comp ? ` and $${comp.toLocaleString()} compensation` : ''}`, 'warn'); return; }
    if (st.err) { this.toast(st.err, 'warn'); return; }
    if (this.crossesBiz(legs, cls.h + cls.walk)) { this.toast('Roads cannot cross a business', 'warn'); return; }
    if (this.crossesPark(legs, cls.h + cls.walk)) { this.toast('Roads cannot cross a car park', 'warn'); return; }
    if (this.crossesToll(legs, cls.h + cls.walk)) { this.toast('Roads cannot cross a toll plaza', 'warn'); return; }
    const total = this.net.legsLength(parts);
    const hw = cls.h + cls.walk, near = this.propsNearLegs(legs, hw);
    const blocking = near.filter(p => !p.auto && LIBRARY[p.item].big && LIBRARY[p.item].kind !== 'car');
    if (blocking.length) { this.toast(`${LIBRARY[blocking[0].item].name} is in the way — bulldoze it first`, 'warn'); return; }
    const cleared = near.filter(p => !p.auto && !LIBRARY[p.item].big);
    for (const p of cleared) this.removeProp(p);
    const now = performance.now(), dur = Math.min(4000, 700 + total * 70);
    const cum: number[] = []; let acc = 0; for (const l of parts) { cum.push(acc); acc += vlen(sub(l.b, l.a)); }
    // Replace charges the new road less the value of what it takes away: the cut pieces and the dead ends tidyEnds trims after them, measured
    let removed = this.roadValue();
    for (const c of cuts) this.edit.removePiece(c);
    removed -= this.roadValue();
    this.edit.addLegs(parts, cls, this.lineStyle, kinds);
    if (cuts.length) { const v = this.roadValue(); this.tidyEnds(cuts.flatMap(c => [c.p0, c.p1, c.seg.a, c.seg.b])); removed += v - this.roadValue(); }
    const paid = Math.round(build - removed);
    this.commitNetwork(true, now + dur + 150); this.bump('roads');
    this.builds.push({ legs: parts, cls, t0: now, dur, total, cum });
    this.traffic.spend('construction', paid);
    if (comp) this.traffic.spend('compensation', comp);
    this.route = [];
    const structs = [lens[SK.BRIDGE] ? `${Math.round(lens[SK.BRIDGE] * 2)} m bridge` : '', lens[SK.TUNNEL] ? `${Math.round(lens[SK.TUNNEL] * 2)} m tunnel` : ''].filter(Boolean);
    this.toast(`Built ${Math.round(total * 2)} m of ${cls.name.toLowerCase()}${structs.length ? ` (${structs.join(', ')})` : ''} ${paid < 0 ? `(refund $${(-paid).toLocaleString()})` : `for $${paid.toLocaleString()}`}${comp ? `, $${comp.toLocaleString()} compensation for ${hit.length} building${hit.length > 1 ? 's' : ''}` : ''}${cleared.length ? ` (cleared ${cleared.length} item${cleared.length > 1 ? 's' : ''})` : ''}${cuts.length ? `, replaced ${cuts.length} road piece${cuts.length > 1 ? 's' : ''} worth $${Math.round(removed).toLocaleString()}` : ''}`, 'good');
    // a one-way road that ends in a dead end traps cars: warned, not refused
    if (cls.oneway && parts.length && [parts[0]!.a, parts[parts.length - 1]!.b].some(p => this.net.nodeAt(p)?.segs.length === 1)) this.toast('A one-way road that ends in a dead end traps cars', 'warn');
  }
  /** what installing type t on node n costs (a roundabout re-laned pays the difference: a fall is free) and why it cannot be done: locked, already so,
   *  too few roads, or not enough money ('' when it can). rl: the ring lanes of a roundabout */
  /** the placed (not a lot's) props a ring would stand on: those whose footprint reaches within the ring's outer edge (its radius, as the network
   *  will make it, plus the widest arm's walk) of a roundabout or a mini installed at n (none for any other type). A road built over them is
   *  refused for the big ones and clears the small ones (finishRoute); a ring does the same (the owner's ring, 2026-10-20: buildings stood in it) */
  private ringProps(n: Node, t: NodeType, rl: 1 | 2 | 3): Prop[] {
    const hs = n.arms.map(a => a.h), walk = Math.max(0, ...n.arms.map(a => a.walk));
    const rb = t === 'roundabout' && n.arms.length >= 2 ? ringRadius(hs, rl) : t === 'mini' && n.arms.length >= 3 ? Math.max(4, Math.max(...hs) + 1) : 0;
    if (!(rb > 0)) return [];
    const R = rb + walk, out: Prop[] = [];
    for (const p of this.propGrid.query([n.x - R, n.y - R, n.x + R, n.y + R])) {
      if (p.auto) continue;
      const dx = Math.max(p.x0 - n.x, 0, n.x - p.x1), dy = Math.max(p.y0 - n.y, 0, n.y - p.y1);
      if (dx * dx + dy * dy < R * R) out.push(p);
    }
    return out;
  }
  installCheck(n: Node, t: NodeType, rl: 1 | 2 | 3): { cost: number; why: string; hit: Seg[] } {
    const spec = JUNCTIONS.find(j => j.id === t)!, same = t === 'signal' ? isLights(n) : n.type === t, ring = t === 'roundabout' && n.type === 'roundabout';
    const cost = ring ? Math.max(0, variantCost(t, rl) - variantCost(t, n.rl ?? 1)) : variantCost(t, rl);
    let why = '', hit: Seg[] = [];
    if (!this.junctionOpen(t)) { const lk = unlockOf('junction', t)!; why = this.eventMode ? `${spec.name} needs the Roundabout card` : `${spec.name} unlocks at ${lk.pop.toLocaleString()} residents (${lk.name})`; }
    else if (same && (t !== 'roundabout' || (n.rl ?? 1) === rl)) why = t === 'signal' ? 'It already has traffic lights' : t === 'plain' ? 'It is already plain' : t === 'stop' ? 'It is already an all-way stop' : t === 'mini' ? 'It is already a mini-roundabout' : `It already has a ${rl}-lane ring`;
    else if (n.arms.length < spec.minDeg) why = t === 'roundabout' ? 'A roundabout needs a junction or a bend in the road' : 'Needs a junction of three or more roads';
    else if (t === 'mini' && !miniFits(n)) why = 'Too big for a mini-roundabout (2 lanes each way at most)';
    else if (this.ringProps(n, t, rl).some(p => LIBRARY[p.item].big && LIBRARY[p.item].kind !== 'car')) { const p = this.ringProps(n, t, rl).find(q => LIBRARY[q.item].big && LIBRARY[q.item].kind !== 'car')!; why = `${LIBRARY[p.item].name} is in the way — bulldoze it first`; }
    // an arm that ends inside the ring (another junction or a bend within its radius plus 2 tiles): its road would run on to the island and cars
    // turned at its end there (the owner's 3-lane ring, 2026-10-19: an arterial met the street 10 tiles from the junction made a ring)
    // (a multi-lane ring needs its radius plus 6 tiles: closer, its entries and exits squeezed into the next junction; this was only a warning after
    // the build, the owner: "why does it tell me it needs longer approaches but builds it anyway")
    else if (t === 'roundabout' && n.arms.some(a => a.len < ringRadius(n.arms.map(b => b.h), rl) + (rl > 1 ? 6 : 2))) {
      const need = ringRadius(n.arms.map(b => b.h), rl) + (rl > 1 ? 6 : 2), short = n.arms.filter(a => a.len < need), a = short.reduce((p, q) => (q.len < p.len ? q : p));
      why = `Too close to the next junction or bend: a ${rl}-lane ring needs arms of ${Math.ceil(need * 2)} m (one is ${Math.round(a.len * 2)} m)`; hit = short.map(x => x.seg);
    }
    // a ring (or a mini's island) at n must not take in another road or junction: the owner's rings may not run over an unrelated street
    else if ((t === 'roundabout' || t === 'mini') && (hit = this.ringClash(n, t, rl)).length) why = 'Another road is in the way of the ring';
    else if (cost > this.money) why = `Not enough money: ${ring ? `the ${rl}-lane ring` : spec.name.toLowerCase()} costs $${cost.toLocaleString()}`;
    return { cost, why, hit };
  }
  /** the radius (tiles) a roundabout of rl ring lanes, or a mini (t), would have at node n: its circle */
  ringOf(n: Node, t: NodeType, rl: 1 | 2 | 3): number { const hs = n.arms.map(a => a.h); return t === 'roundabout' ? ringRadius(hs, rl) : Math.max(4, Math.max(...hs) + 1); }
  /** the segs in the way when a roundabout (or mini) of type t at node n, with rl ring lanes, would take in a road that is not one of n's arms: a seg within its
   *  circle plus the widest arm's walk (an arm's own continuation may meet the circle at its far end only), or a node within that reach that is not
   *  an arm's far end */
  private ringClash(n: Node, t: NodeType, rl: 1 | 2 | 3): Seg[] {
    const R = this.ringOf(n, t, rl) + Math.max(0, ...n.arms.map(a => a.walk)), out: Seg[] = [];
    const far = (m: Node) => n.arms.some(a => a.other === m);
    for (const s of this.net.segsNear(n, R + 12)) {
      if (s.a === n || s.b === n) continue;
      if (segDist(n, s) < R + (far(s.a) || far(s.b) ? 0 : s.cls.h + s.cls.walk) || [s.a, s.b].some(m => m !== n && !far(m) && Math.hypot(m.x - n.x, m.y - n.y) < R)) out.push(s);
    }
    return out;
  }
  /** installs type t on node n, as the brush, the Type control and the ring-lane chips do: the money is spent, new lights get the best tier open this
   *  year (lights already there keep their tier), a roundabout's ring lanes are set. The junction is selected even when refused (the panel says why) */
  private installType(n: Node, t: NodeType, rl: 1 | 2 | 3): boolean {
    this.selectedJunction = n;
    const { cost, why } = this.installCheck(n, t, rl);
    // the junction already is that type: the click just selects it (no warning)
    if (why && /^It (already|is already)/.test(why)) { this.emit(); return false; }
    if (why) { this.toast(why, 'warn'); this.emit(); return false; }
    const relane = n.type === 'roundabout' && t === 'roundabout', name = JUNCTIONS.find(j => j.id === t)!.name;
    // the small placed items under the ring go, as under a new road (the big ones refused it: installCheck)
    for (const p of this.ringProps(n, t, rl)) this.removeProp(p);
    this.traffic.spend('construction', cost);
    if (n.type !== t) this.edit.setNodeType(n, t);
    if (t === 'signal') this.edit.setSignal(n, this.signalTier(), undefined);
    if (t === 'roundabout') { this.edit.setNodeFlags(n, !!n.wide, !!n.tl, rl); this.ringLanes = rl; }
    else if ((t === 'stop' || t === 'mini') && (n.wide || n.tl)) this.edit.setNodeFlags(n, false, false, n.rl ?? 1); // no options on a stop or a mini: its flags go
    this.commitNetwork(); this.puff(n.x, n.y, 8);
    const m = this.net.nodeAt({ x: n.x, y: n.y }) ?? n; this.selectedJunction = m;
    const warn = this.armWarn(m);
    if (warn) this.toast(warn, 'warn');
    else this.toast(relane ? `Roundabout: ${rl} ring lane${rl > 1 ? 's' : ''}` : `${name} installed`, 'good');
    return true;
  }
  /** the Type control: the selected junction takes type t (a roundabout with ringLanes), as the brush would install it */
  setSelectedType(t: NodeType) { const n = this.selectedNode(); if (n) this.installType(n, t, this.ringLanes); this.emit(); }
  /** why a flag cannot go on at node n ('' when it can): its rule (flagRule), then the money */
  flagWhy(n: Node, k: 'wide' | 'tl'): string {
    const cost = FLAG_COST[k];
    return flagRule(n, k) || (cost > this.money ? `Not enough money: ${k === 'wide' ? 'widened turns' : 'turn lanes'} cost $${cost.toLocaleString()}` : '');
  }
  /** a flag on node n (widened turns, turn lanes): on costs FLAG_COST (refused by flagWhy), off is free. The junction is selected */
  setFlag(n: Node, k: 'wide' | 'tl', on: boolean) {
    this.selectedJunction = n;
    const name = k === 'wide' ? 'Widened turns' : 'Turn lanes', cost = FLAG_COST[k];
    if (on) { const why = this.flagWhy(n, k); if (why) { this.toast(why, 'warn'); this.emit(); return; } this.traffic.spend('construction', cost); }
    this.edit.setNodeFlags(n, k === 'wide' ? on : !!n.wide, k === 'tl' ? on : !!n.tl);
    this.commitNetwork(); this.puff(n.x, n.y, 8);
    this.toast(on ? `${name} added` : `${name} removed`, 'good');
  }
  /** the slipways of lights node n: the corners whose degs are in on have one, the others none (see slipPlan). Each corner that turns on pays
   *  SLIP_CORNER_COST; the last one off makes plain lights ('signal'). The junction is selected */
  setSlipways(n: Node, on: number[]) {
    this.selectedJunction = n;
    const cur = slipsOn(n), adds = on.filter(d => !cur.includes(d)).length, cost = adds * SLIP_CORNER_COST, plan = slipPlan(n, on);
    if (cost > this.money) { this.toast(`Not enough money: ${adds > 1 ? `${adds} slipways cost` : 'a slipway costs'} $${cost.toLocaleString()}`, 'warn'); this.emit(); return; }
    if (cost) this.traffic.spend('construction', cost);
    if (plan.type === 'signal') { if (n.type !== 'signal') this.edit.setNodeType(n, 'signal'); }
    else { if (n.type !== 'slip') this.edit.setNodeType(n, 'slip'); this.edit.setSlipOff(n, plan.off); }
    this.commitNetwork(); this.puff(n.x, n.y, 8);
    const dn = on.length - cur.length, pl = dn < 0 ? `${-dn > 1 ? `${-dn} slipways` : 'Slipway'} removed` : `${dn > 1 ? `${dn} slipways` : 'Slipway'} added for $${cost.toLocaleString()}`;
    this.toast(dn === 0 ? 'Slipways unchanged' : plan.type === 'signal' && dn < 0 ? `${pl}: plain lights again` : pl, dn === 0 ? 'info' : 'good');
  }
  /** a click on a corner's + or × (see cornerHit): that corner's slipway turns on (SLIP_CORNER_COST) or off (free), the others kept */
  private slipClick(n: Node, c: Corner) { const cur = slipsOn(n); this.setSlipways(n, c.on ? cur.filter(d => d !== c.deg) : [...cur, c.deg]); }
  /** the Upgrade (or Downgrade) tool's plan at tile t (null: no tile): the straight run of road under it (see straightChain; a toll plaza has none), the
   *  class it goes to (one step along WIDER, or back along NARROWER), what it costs (the difference between the two classes over the run; negative on a
   *  downgrade: a refund) and why it cannot be done */
  private laneUpdate(t: Pt | null) {
    const down = this.tool === 'downgrade', piece = t ? this.net.pieceNear(t) : null;
    if (!piece) { this.laneHover = t ? { segs: [], to: null, cost: 0, why: 'Point at a road', down } : null; return; }
    const tolls = [...this.tollSegs.values()], seg = piece.seg;
    const segs = straightChain(seg, x => tolls.includes(x)), next = (down ? NARROWER : WIDER)[seg.cls.id], to = next ? classOf(next) : null;
    let raw = 0; if (to) for (const s of segs) raw += vlen(sub(s.b, s.a)) * (to.cost - s.cls.cost) * STRUCT_COST[s.kind];
    const cost = Math.round(raw);
    let why = '';
    if (tolls.includes(seg)) why = down ? 'Toll plazas cannot be narrowed' : 'Toll plazas cannot be widened';
    else if (!to) why = down ? `${seg.cls.name} is already the smallest road of its kind` : `${seg.cls.name} is already the biggest road of its kind (more in Phase 7)`;
    else if (!down && !this.classOpen(to.id)) { const lk = unlockOf('class', to.id)!; why = `${to.name} unlocks at ${lk.pop.toLocaleString()} residents (${lk.name})`; }
    else if (to.h + to.walk > seg.cls.h + seg.cls.walk && this.widenClash(segs, to)) why = 'No room to widen: another road is too close';
    else if (cost > this.money) why = `Not enough money: ${to.name.toLowerCase()} costs $${cost.toLocaleString()} more`;
    this.laneHover = { segs, to, cost, why, down };
  }
  /** true when widening the run segs to class to would make their corridors meet a road they do not meet already (a new overlap, not the contact a
   *  junction has), or would put a seg through the circle of a roundabout or mini the run does not touch (a ring the run ends at re-sizes itself) */
  private widenClash(segs: Seg[], to: RoadClass): boolean {
    const run = new Set(segs), ends = new Set(segs.flatMap(s => [s.a, s.b])), wide = to.h + to.walk; // a ring the run touches is its own arm: it re-sizes itself
    for (const s of segs) {
      const L = vlen(sub(s.b, s.a)), mid = { x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2 }, ws = s.cls.h + s.cls.walk;
      for (const t of this.net.segsNear(mid, L / 2 + 14)) {
        if (run.has(t) || t.a === s.a || t.a === s.b || t.b === s.a || t.b === s.b) continue;
        const gap = segSeg(s.a, s.b, t.a, t.b), tw = t.cls.h + t.cls.walk;
        if (gap < wide + tw - 0.5 && gap >= ws + tw - 0.5) return true;
      }
      for (const t of this.net.segsNear(mid, L / 2 + 30)) for (const n of [t.a, t.b]) if (n.rb > 0 && !ends.has(n) && segDist(n, s) < n.rb + wide) return true;
      // a ring the run is an arm of grows with its widest arm: every arm must still be long enough for it (see installCheck)
      for (const n of [s.a, s.b]) if (n.type === 'roundabout' && n.rb > 0) { const rl = n.rl ?? 1, need = ringRadius(n.arms.map(a => (a.seg === s ? to.h : a.h)), rl) + (rl > 1 ? 6 : 2); if (n.arms.some(a => a.len < need)) return true; }
    }
    return false;
  }
  /** the Upgrade (Downgrade) tool's click: every seg of the run goes one class up (down), its kind and line style kept, and the difference is charged
   *  (refunded); the network rebuilds at once */
  private laneClick() {
    const h = this.laneHover; if (!h) return;
    if (!h.segs.length || !h.to || h.why) { this.toast(h.why || 'Point at a road', 'warn'); return; }
    this.traffic.spend('construction', h.cost);
    let tiles = 0;
    const from = h.segs[0]!.cls.name.toLowerCase();
    for (const s of h.segs) { tiles += vlen(sub(s.b, s.a)); this.edit.addLegs([{ a: s.a, b: s.b }], h.to, s.style, [s.kind]); }
    this.commitNetwork(); this.puff(h.segs[0]!.a.x, h.segs[0]!.a.y, 8);
    const price = h.cost < 0 ? `refund $${(-h.cost).toLocaleString()}` : `$${h.cost.toLocaleString()}`;
    this.toast(`${h.down ? 'Downgraded' : 'Upgraded'} ${Math.round(tiles * 2)} m of ${from} to ${h.to.name.toLowerCase()} (${price})`, 'good');
    this.laneUpdate(this.hover);
  }
  /** the Upgrade and Downgrade tools' right-click: the one-way straight run under the pointer is reversed (each seg replaced with its b-to-a, free); a two-way road is refused */
  private laneReverse(mx: number, my: number) {
    this.laneUpdate(this.tileAt(mx, my));
    const h = this.laneHover; if (!h || !h.segs.length) { this.toast('Point at a road', 'warn'); return; }
    const s0 = h.segs[0]!;
    if (!s0.cls.oneway) { this.toast('Only one-way roads can be reversed', 'warn'); return; }
    let tiles = 0;
    for (const s of h.segs) { tiles += vlen(sub(s.b, s.a)); this.edit.addLegs([{ a: s.b, b: s.a }], s.cls, s.style, [s.kind]); }
    this.commitNetwork();
    this.toast(`Reversed ${Math.round(tiles * 2)} m of one-way ${classOf(s0.cls.base).name.toLowerCase()}`, 'good');
    this.laneUpdate(this.hover);
  }
  /** the junction tool's badges (street and district zoom, drawn while the tool is open): one label per junction in view, dark like the old tags: its control
   *  (F, A or Ad for lights; RB and the ring lanes for a roundabout) and its options (W, TL, and SL with the slipways on). A plain junction with none has no label */
  private drawJunctionBadges(ctx: CanvasRenderingContext2D) {
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.font = `600 ${11 * this.dpr}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const d = this.dpr, W = this.cw, H = this.ch;
    for (const n of this.net.nodes.values()) {
      if (n.type === 'plain' && !n.wide && !n.tl) continue;
      const s = this.screen(n.x, n.y);
      if (s.x < -40 * d || s.x > W + 40 * d || s.y < -40 * d || s.y > H + 40 * d) continue;
      const parts: string[] = [];
      if (isLights(n)) parts.push(TIER_BADGE[n.sig ?? 1]!);
      if (n.type === 'roundabout') parts.push(`RB ${n.rl ?? 1}`);
      if (n.type === 'stop') parts.push('4S');
      if (n.type === 'mini') parts.push('MR');
      if (n.wide) parts.push('W');
      if (n.tl) parts.push('TL');
      const sl = n.type === 'slip' ? slipsOn(n).length : 0;
      if (sl) parts.push(`SL ${sl}`);
      if (!parts.length) continue;
      // the selected junction's badge sits above its ring, clear of the corner buttons
      const sel = n === this.selectedNode(), rr = sel ? (Math.max(...n.arms.map(a => a.h)) + 1.5) * Math.SQRT1_2 : 0;
      const tag = parts.join(' · '), y = sel ? this.screen(n.x - rr, n.y - rr).y - 22 * d : s.y - 14 * d, w = ctx.measureText(tag).width + 8 * d, h = 16 * d;
      ctx.fillStyle = 'rgba(15,23,42,0.85)'; ctx.fillRect(s.x - w / 2, y - h / 2, w, h);
      ctx.fillStyle = '#fde68a'; ctx.fillText(tag, s.x, y);
    }
  }
  /** the selected junction (the junction tool): a solid ring round it and, for lights, a round button at each corner that takes a slipway or has one:
   *  '+' (none) or '×' (has one). The buttons are the map's hit areas too (see cornerHit) */
  private drawSelectedJunction(ctx: CanvasRenderingContext2D) {
    const n = this.selectedNode(); if (!n) return;
    const r = Math.max(...n.arms.map(a => a.h)) + 1.5;
    this.setIso(ctx); ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2); ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2 * this.dpr; ctx.stroke();
    if (!isLights(n)) return;
    const d = this.dpr, R = 8 * d;
    ctx.font = `700 ${12 * d}px ui-sans-serif, system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const c of junctionCorners(n)) {
      if (!c.fits && !c.on) continue;
      const s = this.screen(c.at.x, c.at.y);
      ctx.beginPath(); ctx.arc(s.x, s.y, R, 0, Math.PI * 2);
      ctx.fillStyle = c.on ? '#fbbf24' : '#0f172a'; ctx.fill(); ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 1.5 * d; ctx.stroke();
      ctx.fillStyle = c.on ? '#0f172a' : '#fde68a'; ctx.fillText(c.on ? '×' : '+', s.x, s.y + 0.5 * d);
    }
  }
  /** the corner button under the pointer (within 14 px; a corner that takes a slipway or has one) of the selected lights: its node and corner, or null */
  private cornerHit(mx: number, my: number): { n: Node; c: Corner } | null {
    const n = this.selectedNode(); if (!n || !isLights(n)) return null;
    let hit: Corner | null = null, bd = 14;
    for (const c of junctionCorners(n)) {
      if (!c.fits && !c.on) continue;
      const s = this.screen(c.at.x, c.at.y), dd = Math.hypot(s.x / this.dpr - mx, s.y / this.dpr - my);
      if (dd < bd) { bd = dd; hit = c; }
    }
    return hit ? { n, c: hit } : null;
  }
  /** the junction tool's right click (before the pan): with a type brush the junction under it resets to plain (free) and is selected; a right click on
   *  empty ground deselects. Returns true when it reset a junction (then no pan starts) */
  private junctionRight(mx: number, my: number): boolean {
    const n = this.net.nearestNode(this.tileAt(mx, my), 2, 5);
    if (!n) { if (this.selectedJunction) { this.selectedJunction = null; this.emit(); } return false; }
    if (this.brush === 'select' || n.type === 'plain') return false;
    this.edit.setNodeType(n, 'plain'); this.commitNetwork(); this.puff(n.x, n.y, 8);
    this.selectedJunction = this.net.nodeAt({ x: n.x, y: n.y }) ?? n;
    this.toast('Reset to plain (free)', 'good'); return true;
  }
  /** the junction tool's click: a corner button of the selected lights toggles that slipway; with the select brush a click selects the junction under it
   *  (empty ground deselects); with a type brush the type is installed on the junction under it (installType) */
  private junctionClick(mx: number, my: number) {
    const hit = this.cornerHit(mx, my);
    if (hit) { this.slipClick(hit.n, hit.c); return; }
    const t = this.tileAt(mx, my);
    if (this.brush === 'select') { this.selectedJunction = this.net.nearestNode(t, 2, 5); this.emit(); return; }
    const type: NodeType = this.brush, minDeg = JUNCTIONS.find(j => j.id === type)!.minDeg;
    const n = this.net.nearestNode(t, minDeg, 5);
    if (!n) { this.toast(minDeg > 2 ? 'Click a junction where three or more roads meet' : 'Click a junction or a bend in the road', 'warn'); return; }
    this.installType(n, type, this.ringLanes); this.emit();
  }
  /** the selected junction as the network holds it now (a rebuild can replace the node object; a junction that is gone deselects), or null */
  selectedNode(): Node | null { const s = this.selectedJunction; if (!s) return null; this.selectedJunction = this.net.nodeAt({ x: s.x, y: s.y }) ?? null; return this.selectedJunction; }
  /** the warning for a junction whose arms are too short for its type (slipways need 54 m; a roundabout's ring needs its radius plus 12 m), or '' */
  private armWarn(n: Node): string {
    if (n.type === 'slip' && !n.arms.every(a => a.len >= 27)) return 'Slipways need long approaches (54 m+): short arms get plain corners';
    return '';
  }
  /** Tab (Shift+Tab back) in the road tool: the variant of the type in hand moves to the next one (CLASS_VARIANTS: one-way, trees, turn lane, median). Nothing is toasted */
  flipVariant(dir: 1 | -1) {
    const list = CLASS_VARIANTS[this.cls.base]!;
    if (list.length < 2) return;
    let i = list.indexOf(this.roadClass); if (i < 0) i = 0;
    this.roadClass = list[(i + dir + list.length) % list.length]!; this.emit();
  }
  /** the road tool's type pick: the same type keeps the variant in hand, another type starts at its plain variant */
  pickType(t: TypeId) { if (this.cls.base !== t) this.roadClass = CLASS_VARIANTS[t]![0]!; this.emit(); }
  /** Tab (Shift+Tab back) in the junction tool: the junction or bend under the pointer moves to the next type it can take (the open types in VARIANTS
   *  that fit its arms; a bend takes plain and the roundabouts). Money is checked for the rise; a flip down is free. The junction is selected, so the panel follows */
  private flipJunction(dir: 1 | -1) {
    const n = this.hover ? this.net.nearestNode(this.hover, 2, 5) : null;
    if (!n) { this.toast('Hover a junction or a bend in the road', 'warn'); return; }
    const fits = VARIANTS.filter(v => this.junctionOpen(v.type) && (v.type === 'plain' || n.arms.length >= JUNCTIONS.find(j => j.id === v.type)!.minDeg) && (v.type !== 'mini' || miniFits(n)));
    const i = fits.findIndex(v => v.type === n.type && (v.type !== 'roundabout' || v.rl === (n.rl ?? 1)));
    const k = i < 0 ? (dir > 0 ? 0 : fits.length - 1) : (i + dir + fits.length) % fits.length;
    if (k === i) { this.toast('No other junction type is open for this junction yet', 'warn'); return; }
    const v = fits[k]!, name = JUNCTIONS.find(j => j.id === v.type)!.name + (v.type === 'roundabout' ? `, ${v.rl} ring lane${v.rl > 1 ? 's' : ''}` : '');
    const price = variantCost(v.type, v.rl), cost = Math.max(0, price - variantCost(n.type, n.rl ?? 1));
    if (cost > this.money) { this.toast(`Not enough money: ${name} costs $${price.toLocaleString()}`, 'warn'); return; }
    this.traffic.spend('construction', cost);
    if (v.type === 'roundabout') this.ringLanes = v.rl;
    const hadLights = isLights(n), lit = v.type === 'signal' || v.type === 'slip';
    this.edit.setNodeType(n, v.type);
    if (lit && !hadLights) this.edit.setSignal(n, this.signalTier(), undefined);
    if (v.type === 'slip') this.edit.setSlipOff(n, []);
    if (v.type === 'roundabout') this.edit.setNodeFlags(n, !!n.wide, !!n.tl, v.rl);
    else if ((v.type === 'stop' || v.type === 'mini') && (n.wide || n.tl)) this.edit.setNodeFlags(n, false, false, n.rl ?? 1);
    this.commitNetwork(); this.puff(n.x, n.y, 8);
    const m = this.net.nodeAt({ x: n.x, y: n.y }) ?? n; this.selectedJunction = m;
    const warn = this.armWarn(m);
    if (warn) this.toast(warn, 'warn');
    else this.toast(`${name} (${price ? '$' + price.toLocaleString() : 'free'}) · Tab for the next type`, 'good');
  }
  /** the fixed-time green seconds of each phase (the panel's sliders, once released): sets the lights to fixed-time and commits the network */
  setSplit(n: Node, split: number[]) { this.edit.setSignal(n, 0, split); this.commitNetwork(); }
  /** buys the selected lights' upgrade to tier (1 actuated, 2 adaptive): the tier's year must have come and the cost be paid; the split is kept */
  upgradeSignal(tier: 1 | 2) {
    const n = this.selectedNode(); if (!n || !isLights(n) || (n.sig ?? 1) >= tier) return;
    const name = tier === 1 ? 'Actuated' : 'Adaptive', cost = UPGRADE_COST[tier]!;
    if (this.signalTier() < tier) { this.toast(`${name} lights from ${SIGNAL_TIER_YEAR[tier]}`, 'warn'); return; }
    if (cost > this.money) { this.toast(`Not enough money: ${name.toLowerCase()} lights cost $${cost.toLocaleString()}`, 'warn'); return; }
    this.traffic.spend('construction', cost);
    this.edit.setSignal(n, tier, n.split);
    this.commitNetwork(); this.puff(n.x, n.y, 8);
    this.toast(`${name} lights${tier === 1 ? ' (loop detectors)' : ''} installed for $${cost.toLocaleString()}`, 'good');
  }
  /** the calendar: the year against the one seen last frame; a signal tier's year coming in toasts once (the first frame only records the year) */
  private yearCheck() {
    const y = this.traffic.round.year, was = this.seenYear; this.seenYear = y;
    // a jump of more than one year is a load (or a new valley), not a finished round: no toast
    if (!was || y !== was + 1) return;
    for (let i = 1; i < SIGNAL_TIER_YEAR.length; i++) if (was < SIGNAL_TIER_YEAR[i]! && y >= SIGNAL_TIER_YEAR[i]!) this.toast(`${SIGNAL_TIER_YEAR[i]}: ${SIGNAL_TOAST[i]} available: select lit junctions with the Junctions tool to upgrade them`, 'good');
  }
  private bulldozeAt(mx: number, my: number, first: boolean) {
    const t = this.tileAt(mx, my);
    if (first) {
      const p = this.propAt(mx, my);
      if (this.golf?.structures?.length) {
        let hitId: number | null = null;
        if (p) for (const [sid, sp] of this.golfStructureProps) if (sp === p) { hitId = sid; break; }
        const idx = findStructureIndexAt(this.golf.structures, t.x, t.y, hitId);
        if (idx >= 0) { this.removeStructure(idx); return; }
      }
      if (p && !p.auto) { const it = LIBRARY[p.item], back = p.plant ? 0 : Math.round(it.cost * 0.5); this.removeProp(p); this.traffic.spend('construction', -back); if (it.kind === 'lamp') this.syncLamps(); this.scheduleSave(); this.toast(back ? `Removed ${it.name} (+$${back.toLocaleString()})` : `Removed ${it.name}`); return; }
  
 const k = this.parkIndexAt(t);
      if (k >= 0) { const id = this.parkDefs[k]!.id; this.removePark(k); this.scheduleSave(); this.toast(`Removed car park #${id} (no refund)`); this.emit(); return; }
      const g = this.tollIndexAt(t);
      if (g >= 0) { const id = this.tollDefs[g]!.id; this.removeToll(g); this.scheduleSave(); this.toast(`Removed toll gate #${id} (the road stays; no refund)`); this.emit(); return; }
      const b = this.busIndexAt(t);
      if (b >= 0) { const id = this.busDefs[b]!.id; this.removeBus(b); this.scheduleSave(); this.toast(`Removed bus route #${id} (no refund)`); this.emit(); return; }
    }
    const piece = this.net.pieceNear(t);
    if (!piece) { if (first) this.buyOut(t); return; }
    const before = this.roadValue(), name = piece.seg.cls.name.toLowerCase();
    this.edit.removePiece(piece); this.tidyEnds([piece.p0, piece.p1, piece.seg.a, piece.seg.b]);
    const refund = Math.round(before - this.roadValue()); // the piece and the dead ends tidyEnds trimmed after it
    if (refund > 0) { this.traffic.spend('construction', -refund); this.toast(`Removed ${name} (+$${refund.toLocaleString()})`); }
    this.commitNetwork();
    this.hoverPiece = this.net.pieceNear(t);
    this.puff(t.x, t.y, 10);
  }
  /** after cuts (the bulldozer, Replace): each dead end at pts (a cut's ends, the nodes of a seg taken whole) that crowds another road is cut back
   *  until it clears it (RoadNetwork.clearCut), a dead-end stub under 2 tiles goes, and the ends that leaves are looked at in turn. (A short seg
   *  taken whole left the two roads beside it as dead ends whose turning circles overlapped: the road builder's stress test, 2026-10-19) */
  private tidyEnds(pts: Pt[]) {
    const todo = [...pts];
    for (let k = 0; k < 40 && todo.length; k++) {
      const n = this.net.nodeAt(todo.pop()!); if (!n || n.segs.length !== 1) continue;
      const s = n.segs[0]!, d = sub(s.b, s.a), L = vlen(d), u = mul(d, 1 / L), atA = s.a === n, other = atA ? s.b : s.a;
      let cut = L;
      if (L >= 2) { const [s0, s1] = atA ? this.net.clearCut(s, 0, 0.001) : this.net.clearCut(s, L - 0.001, L); cut = atA ? s1 : L - s0; if (cut <= 0.01) continue; }
      if (L - cut < 2) cut = L;
      this.edit.removePiece(atA ? { seg: s, p0: s.a, p1: cut >= L ? s.b : add(s.a, mul(u, cut)) } : { seg: s, p0: cut >= L ? s.a : add(s.a, mul(u, L - cut)), p1: s.b });
      todo.push(cut >= L ? other : add(s.a, mul(u, atA ? cut : L - cut)));
    }
  }
  /** the bulldozer on a town building (no road, no prop there): the built lot (BUILDING or more) under tile t is bought out for its compensation, if the
   *  treasury covers it. The worker clears the lot and holds it (see City.buyLot); its price is spent there */
  private buyOut(t: Pt) {
    let v: LotView | null = null;
    for (const l of this.traffic.lots.values()) {
      if (l.level < LV.BUILDING) continue;
      const dx = t.x - l.o[0], dy = t.y - l.o[1], a = dx * l.u[0] + dy * l.u[1], b = dx * l.n[0] + dy * l.n[1];
      if (a >= 0 && a <= l.w && b >= 0 && b <= l.d) { v = l; break; }
    }
    if (!v) return;
    const c = compensation(v), name = LOT_NAME[v.use] ?? 'lot';
    if (c > this.money) { this.toast(`Not enough money: buying out this ${name} costs $${c.toLocaleString()}`, 'warn'); return; }
    this.traffic.buyLot(v.key);
    this.toast(`Bought and cleared ${name} for $${c.toLocaleString()}`, 'good');
    this.emit();
  }
  /** the client slot of the nearest alive car within 1.5 tiles of the tile under (mx, my), or -1 */
  private carAt(mx: number, my: number): number {
    const t = this.tileAt(mx, my), tr = this.traffic;
    let best = -1, bd = 1.5 * 1.5;
    for (let i = 0; i < tr.n; i++) {
      if (!tr.alive[i]) continue;
      const dx = tr.px[i]! - t.x, dy = tr.py[i]! - t.y, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  /** inspects the car in slot i (its trip, route and origin: see SimClient.inspect) and clears the junction watch */
  inspectCar(i: number) { this.inspecting = i; this.traffic.inspect(i); this.traffic.unwatch(); this.emit(); }
  /** closes the car inspector (its Close button, Esc): the camera stops following it */
  closeInspect() { this.inspecting = -1; this.followCar = false; this.traffic.inspect(-1); this.emit(); }
  /** closes the junction watch (its Close button, Esc) */
  closeWatch() { this.traffic.unwatch(); this.emit(); }
  propAt(mx: number, my: number): Prop | null {
    const X = this.cam.X + (mx - this.cssW / 2) / this.cam.z, Y = this.cam.Y + (my - this.cssH / 2) / this.cam.z, r = [0, 0, 0, 0];
    for (const p of this.sprites.at(X, Y)) {
      if (!this.props.has(p)) continue; // forest trees are not props: never picked
      spriteRect(p, r); if (X < r[0] || X > r[2] || Y < r[1] || Y > r[3]) continue;
      const it = LIBRARY[p.item], [page, u0, v0, u1, v1] = it.tex, a = this.pageAlpha[page];
      if (!a) return p;
      let u = (X - r[0]) / (r[2] - r[0]); if (p.flip) u = 1 - u;
      const v = (Y - r[1]) / (r[3] - r[1]), px = clamp(Math.floor((u0 + (u1 - u0) * u) * a.w), 0, a.w - 1), py = clamp(Math.floor((v0 + (v1 - v0) * v) * a.h), 0, a.h - 1);
      if (a.data[(py * a.w + px) * 4 + 3] > 20) return p;
    }
    return null;
  }
  deleteSelected() {
    if (!this.selected) return;
    const p = this.selected;
    if (this.golf?.structures?.length) {
      const idx = this.golf.structures.findIndex(s => this.golfStructureProps.get(s.id) === p);
      if (idx >= 0) { this.selected = null; this.removeStructure(idx); return; }
    }
    const it = LIBRARY[p.item]; this.removeProp(p); if (!p.auto && !p.plant) this.traffic.spend('construction', -Math.round(it.cost * 0.5)); if (it.kind === 'lamp') this.syncLamps(); this.scheduleSave(); this.toast(`Removed ${it.name}`); this.emit();
  }
  scaleSelected(f: number) {
    const p = this.selected; if (!p) return; const it = LIBRARY[p.item], k = clamp(p.scale * f, 0.6, 1.6);
    const err = this.canPlace(it, p.x, p.y, p.flip, k, p); if (err) { this.toast(err, 'warn'); return; }
    p.scale = k; this.propChanged(p); this.scheduleSave(); this.emit();
  }

  // ---------- input ----------
  pointerDown(e: PointerEvent) {
  const mx = e.offsetX, my = e.offsetY;
  if (this.grassPanel && e.button === 0 && !this.keys.has(' ')) { this.grassTarget = this.tileAt(mx, my); if (this.grassAction) this.careGrass(this.grassAction); this.emit(); return; }
  if (this.landMode && this.landHover && e.button === 0) {
  this.buyLandBlock(this.landHover.rect);
  return;
  }
  this.overlay.setPointerCapture(e.pointerId);
    if (this.eventTool && this.eventStructurePending && this.golf && this.hover && e.button === 0) {  
 this.placeEventStructure({ typeId: this.eventStructurePending.typeId, mode: this.eventStructurePending.mode, x: Math.round(this.hover.x), y: Math.round(this.hover.y) });  
 return;  
 }  
 if (this.holesTool && this.golf && this.hover && e.button === 0) {
    if (this.selectedGolfMarker) {
    this.moveGolfMarker(this.selectedGolfMarker.hole, this.selectedGolfMarker.kind, this.hover.x, this.hover.y);
    return;
    }
    for (const pin of this.golf.pins) {
    if (Math.hypot(this.hover.x - pin.x, this.hover.y - pin.y) <= 3) {
    this.selectGolfMarker(pin.hole, 'pin'); return;
    }
    }
    for (const tee of this.golf.tees) {
    if (Math.hypot(this.hover.x - tee.x, this.hover.y - tee.y) <= 2) {
    this.selectGolfMarker(tee.hole, tee.kind); return;
    }
    }
    }
    const pan = e.button === 1 || e.button === 2 || this.keys.has(' ');
    if (this.keys.has(' ')) this.spacePanned = true;
    if (this.tool === 'junction' && e.button === 2 && this.junctionRight(mx, my)) return;
    if (this.paintOn && e.button === 2 && this.paint.secondary(this.tileAt(mx, my), mx, my)) return;
    if ((this.tool === 'lane' || this.tool === 'downgrade') && e.button === 2) { this.laneReverse(mx, my); return; }
    if (pan || this.tool === 'select') {
      if (!pan && this.tool === 'select') {
        // a car under the pointer (street tier) is inspected; else a prop is selected; else, with the flow on, the junction there is watched
        const car = this.cam.z >= DISTRICT_Z ? this.carAt(mx, my) : -1;
        if (car >= 0) { this.inspectCar(car); return; }
        if (this.cam.z >= DISTRICT_Z && this.repairAt(mx, my)) return;
        const p = this.propAt(mx, my);
        if (p) { this.selected = p; this.emit(); return; }
        this.selected = null; this.emit();
        if (this.showFlow) { const t = this.tileAt(mx, my); this.traffic.watchAt(t.x, t.y); this.emit(); }
      }
      this.dragging = { kind: 'pan', sx: mx, sy: my, camX: this.cam.X, camY: this.cam.Y, moved: false, build: this.tool === 'road' && e.button === 2 }; return;
    }
    if (e.button !== 0) return;
    switch (this.tool) {
      case 'road': this.roadClick(mx, my); break;
      case 'junction': this.junctionClick(mx, my); break;
      case 'toll': this.tollUpdate(mx, my); this.tollClick(); break;
      case 'business': this.bizUpdate(mx, my); this.bizClick(); break;
      case 'bus': this.busUpdate(mx, my); this.busClick(); break;
      case 'lane': case 'downgrade': this.laneUpdate(this.tileAt(mx, my)); this.laneClick(); break;
      case 'bulldoze': this.bulldozeAt(mx, my, true); this.dragging = { kind: 'bulldoze', sx: mx, sy: my, camX: 0, camY: 0, moved: false }; break;
      case 'paint': case 'course': this.paint.pointerDown(this.tileAt(mx, my), mx, my, e.altKey); break;
      case 'park': {
        // the bay rows drag and the on-street click are the Parking tool's (docs/PARKING.md); the rectangle is the car park drag below
        if (this.parking.mode !== 'rect') { if (this.parking.mode === 'rows') this.parking.down(this.tileAt(mx, my)); else this.parking.click(); break; }
        const t = this.tileAt(mx, my), r = Math.round; this.parkDrag = { x0: r(t.x), y0: r(t.y), x1: r(t.x), y1: r(t.y), def: { id: 0, x: 0, y: 0, w: 0, h: 0 }, park: null, why: '', cost: 0, mx, my }; this.dragging = { kind: 'park', sx: mx, sy: my, camX: 0, camY: 0, moved: false }; this.parkUpdate(mx, my); break; }
    }
  }
  pointerMove(e: PointerEvent) {
  const mx = e.offsetX, my = e.offsetY;
  this.ghostMouse = { mx, my };
  this.hover = this.tileAt(mx, my);
  if (this.landMode && this.golf && this.hover) {
  const bx = Math.floor(this.hover.x / 40) * 40, by = Math.floor(this.hover.y / 40) * 40;
  const cand: [number, number, number, number] = [bx, by, 40, 40];
  const parcels = this.golf.parcels ?? [this.golf.parcel];
  if (isAdjacentBlock(parcels, cand)) {
  const info = this.blockLandClass(cand);
  const price = adjacentBlockPrice({ rect: cand, ...info, townPop: this.traffic.pop });
  this.landHover = { rect: cand, price, landClass: info.landClass };
  } else {
  this.landHover = null;
  }
  } else if (this.landMode) {
  this.landHover = null;
  }
  const d = this.dragging;
    if (d) {
      if (Math.abs(mx - d.sx) + Math.abs(my - d.sy) > 3) d.moved = true;
      if (d.kind === 'pan') { this.cam.X = d.camX - (mx - d.sx) / this.cam.z; this.cam.Y = d.camY - (my - d.sy) / this.cam.z; this.clampCam(); }
      else if (d.kind === 'bulldoze') this.bulldozeAt(mx, my, false);
      else if (d.kind === 'park') this.parkUpdate(mx, my);
    } else if (this.tool === 'select') this.hoverProp = this.propAt(mx, my);
    if (this.tool === 'select' && !d) this.hoverRoad = this.hoverProp ? '' : this.roadNameAt(this.hover);
    if (this.tool === 'junction') this.hoverNode = this.net.nearestNode(this.hover, this.brush === 'roundabout' || this.brush === 'select' ? 2 : 3, 5);
    if (this.tool === 'lane' || this.tool === 'downgrade') this.laneUpdate(this.hover);
    if (this.tool === 'bulldoze') this.hoverPiece = this.net.pieceNear(this.hover);
    if (this.tool === 'toll') this.tollUpdate(mx, my);
    if (this.tool === 'business') this.bizUpdate(mx, my);
    if (this.tool === 'bus') this.busUpdate(mx, my);
    if (this.paintOn) this.paint.pointerMove(this.hover, mx, my, this.keys.has('Shift'));
    if (this.tool === 'park') {
      if (this.parking.mode === 'rows') { if (this.hover) { this.parking.snap15 = this.keys.has('Shift'); this.parking.move(this.hover, mx, my); } }
      else if (this.parking.mode === 'curb') this.parking.hover(this.hover ? this.net.pieceNear(this.hover)?.seg ?? null : null, this.hover ?? { x: 0, y: 0 }, mx, my);
    }
  }
  pointerUp() {
    const d = this.dragging;
    if (d?.kind === 'park') this.parkRelease();
    // a right click (no drag) in the road tool builds the route drawn so far, as Enter does (the owner, 2026-10-19); a right drag still pans
    if (d?.kind === 'pan' && d.build && !d.moved && this.tool === 'road' && this.route.length > 1) this.finishRoute();
    if (this.paintOn) this.paint.pointerUp(this.paintTol);
    if (this.tool === 'park' && this.parking.mode === 'rows') this.parking.up();
    this.dragging = null;
  }
  pointerLeave() { this.paint.cursor = null; this.paint.mouse = null; this.paint.hover = 0; this.paint.hoverH = null; this.hover = null; this.hoverProp = null; this.hoverNode = null; this.hoverPiece = null; this.hoverRoad = ''; this.tollHover = null; this.bizHover = null; this.ghostMouse = null; this.busHover = null; this.laneHover = null; }
  /** the name of the road under tile t (the piece under it, then its route), or '' */
  roadNameAt(t: Pt | null): string {
    const piece = t ? this.net.pieceNear(t) : null;
    return piece ? this.roadNameOfSeg(piece.seg) : '';
  }
  /** the name of the route a segment belongs to, or '' */
  private roadNameOfSeg(s: Seg): string { const r = this.net.routeOfSeg(s); return r ? this.roadNames.nameOf(r) : ''; }
  /** a junction's name from the names of the roads meeting at it (Names.junction: "Maple Ave & 3rd St"), or '' */
  junctionName(n: Node): string { const names: string[] = []; for (const a of n.arms) { const s = this.roadNameOfSeg(a.seg); if (s) names.push(s); } return this.names.junction(names); }
  /** the name of the junction at tile position (x, y) (a node's position), or '' when there is no junction there */
  junctionNameAt(x: number, y: number): string { const n = this.net.nodeAt({ x, y }); return n ? this.junctionName(n) : ''; }
  doubleClick() { if (this.tool === 'road' && this.route.length > 1) this.finishRoute(); if (this.paintOn) this.paint.doubleClick(); }
  wheel(e: WheelEvent) {
    e.preventDefault();
    const f = Math.exp(-e.deltaY * 0.0014);
    this.zoomAt(clamp(this.cam.z * f, ZOOM_MIN, ZOOM_MAX), e.offsetX, e.offsetY);
  }
  zoomAt(z: number, mx = this.cssW / 2, my = this.cssH / 2) {
    const wx = this.cam.X + (mx - this.cssW / 2) / this.cam.z, wy = this.cam.Y + (my - this.cssH / 2) / this.cam.z;
    this.cam.z = z;
    this.cam.X = wx - (mx - this.cssW / 2) / z; this.cam.Y = wy - (my - this.cssH / 2) / z; this.clampCam(); this.emit();
  }
  clampCam() { this.cam.X = clamp(this.cam.X, -MAP * HW, MAP * HW); this.cam.Y = clamp(this.cam.Y, 0, MAP * HH * 2); }
  /** centres the camera on tile (x, y), zooms in to at least 0.2 (a closer zoom stays), shows the flow and pulses a ring there */
  jumpTo(x: number, y: number) {
    if (this.cam.z < 0.2) this.cam.z = 0.2;
    this.cam.X = worldX(x, y); this.cam.Y = worldY(x, y); this.clampCam();
    this.focus = { x, y, t: performance.now() }; this.setFlow(true); this.emit();
  }
  /** centres the camera on tile (x, y) as it is (the minimap, the town chip); a zoom z, when given, replaces the camera's (clamped) */
  lookAt(x: number, y: number, z?: number) {
    if (z !== undefined) this.cam.z = clamp(z, ZOOM_MIN, ZOOM_MAX);
    this.cam.X = worldX(x, y); this.cam.Y = worldY(x, y); this.clampCam(); this.emit();
  }
  /** shows or hides the flow overlay (the Flow button, key F, a jump) and turns the worker's heat map on or off with it (see SimClient.heatOn); callers emit */
  setFlow(on: boolean) { this.showFlow = on; this.traffic.heatOn(on || this.showParkDemand); }
  /** shows or hides the parking demand overlay (the Car park panel) and keeps the worker's heat on with it; callers emit */
  setParkDemand(on: boolean) { this.showParkDemand = on; this.traffic.heatOn(on || this.showFlow); }
  keyDown(e: KeyboardEvent) {
    const tag = (e.target as HTMLElement)?.tagName; if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    this.keys.add(e.key);
    if (this.paintOn && this.paint.key(e)) return;
    if (this.tool === 'park' && this.parking.key(e)) return;
    switch (e.key) {
      case 'Escape':
        if (this.tool === 'junction' && (this.selectedJunction || this.brush !== 'select')) { if (this.selectedJunction) this.selectedJunction = null; else this.brush = 'select'; this.emit(); break; }
        if (this.traffic.car || this.traffic.watch) { this.closeInspect(); this.closeWatch(); break; }
        if (this.busPick) { this.busPick = null; this.busHover = null; this.emit(); break; }
        if (this.route.length) this.cancelRoute(); else { this.selected = null; this.emit(); } break;
      case 'Enter': if (this.tool === 'road') this.finishRoute(); break;
      case 'Backspace': if (this.tool === 'road') this.undoRoutePoint(); break;
      case 'Delete': this.deleteSelected(); break;
      case 'g': case 'G': this.showGrid = !this.showGrid; this.emit(); break;
      case 'l': case 'L': this.showLanes = !this.showLanes; this.emit(); break;
      case 'k': case 'K': this.showLots = !this.showLots; this.emit(); break;
      case 'o': case 'O': this.showAccess = !this.showAccess; this.emit(); break;
      case 'f': case 'F': this.setFlow(!this.showFlow); this.emit(); break;
      case 'b': case 'B': this.panel = this.panel === 'bottlenecks' ? null : 'bottlenecks'; if (this.panel) this.traffic.requestReport(); this.emit(); break;
      case 'q': case 'Q': this.bendMode = this.bendMode === 90 ? 45 : 90; this.emit(); break;
      case 'e': case 'E': this.replaceMode = !this.replaceMode; this.toast(this.replaceMode ? 'Replace: on (roads in the way are bulldozed)' : 'Replace: off', 'info'); this.emit(); break;
      case 'r': case 'R': if (this.tool === 'toll') { this.tollFlip = !this.tollFlip; if (this.tollHover) this.tollUpdate(this.tollHover.mx, this.tollHover.my); this.emit(); }
        else if (this.tool === 'business') { this.bizRot = !this.bizRot; if (this.bizHover) this.bizUpdate(this.bizHover.mx, this.bizHover.my); this.emit(); }
        else this.setTool('road'); break;
      case 'j': case 'J': this.setTool('junction'); break;
      case 'x': case 'X': this.setTool('bulldoze'); break;
      case 'c': case 'C': this.setTool('course'); break;
      case 'a': case 'A': this.setTool('paint'); break;
      case 'p': case 'P': this.setTool('park'); break;
      case 't': case 'T': this.setTool('toll'); break;
      case 'u': case 'U': this.setTool('bus'); break;
      case 'm': case 'M': this.setTool('business'); break;
      case 'n': case 'N': this.setTool('lane'); break;
      case 'y': case 'Y': this.setTool('downgrade'); break;
      case 'v': case 'V': this.setTool('select'); break;
      case '1': case '2': case '3': case '4': case '5': case '6': { const c = KEY_CLASSES[+e.key - 1]; if (c) { this.roadClass = c; this.setTool('road'); } break; }
      case '+': case '=': this.zoomAt(clamp(this.cam.z * 1.25, ZOOM_MIN, ZOOM_MAX)); break;
      case '-': case '_': this.zoomAt(clamp(this.cam.z / 1.25, ZOOM_MIN, ZOOM_MAX)); break;
      case ' ': e.preventDefault(); if (!e.repeat) this.spacePanned = false; break;
      case '.': case '>': { const k = this.speed || this.lastSpeed; this.setSpeed(SPEEDS.find(s => s > k) ?? SPEEDS[SPEEDS.length - 1]!); break; }
      case ',': case '<': { const k = this.speed || this.lastSpeed; this.setSpeed(SPEEDS.filter(s => s < k).pop() ?? SPEEDS[0]); break; }
      case 'h': case 'H': this.skipToRush(); break;
      case 'Tab': if (this.tool === 'junction') { e.preventDefault(); if (!e.repeat) this.flipJunction(e.shiftKey ? -1 : 1); } else if (this.tool === 'road') { e.preventDefault(); if (!e.repeat) this.flipVariant(e.shiftKey ? -1 : 1); } break;
    }
  }
  keyUp(e: KeyboardEvent) {
    const tag = (e.target as HTMLElement)?.tagName;
    if (e.key === ' ' && !this.spacePanned && tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT' && tag !== 'BUTTON') this.togglePause();
    this.keys.delete(e.key);
  }
  /** traffic: n cars driving the network (0 = none); the sim worker starts on first use */
  setTraffic(n: number) { this.traffic.setTarget(n); this.emit(); }
  /** the town's growth option (its id, see GROWTH_OPTIONS) */
  setGrowth(id: string) { this.traffic.setOption(id); this.emit(); }
  /** the sim speed (0 pauses); a speed above 0 is remembered for the resume */
  setSpeed(k: number) { if (k > 0) this.lastSpeed = k; this.speed = k; this.traffic.setSpeed(k); this.emit(); }
  /** pauses, or resumes at the last speed */
  togglePause() { this.setSpeed(this.speed ? 0 : this.lastSpeed); }
  /** the game clock: the economy's day, and the time of day from the sim clock (one sim second is one game minute) */
  /** the time of day: in a golf game the town day's (LEAD.md M1: its own length, separate from the season; day counts town days from 1),
   *  else the classic game day (hours of GAME_HOUR) */
  clock(): { day: number; hour: number; minute: number } {
    // a golf game's town day runs on the sim's own time (it never stops; the season clock freezes at the season's end)
    const now = performance.now(), t = this.golfMode ? this.traffic.simTime(now) : this.traffic.clockTime(now), L = this.golfMode ? this.traffic.dayLen : 24 * GAME_HOUR, hl = L / 24;
    return { day: this.golfMode ? Math.floor(t / L) + 1 : this.day, hour: Math.floor(t / hl) % 24, minute: Math.floor((t % hl) / hl * 60) };
  }
  /** the owner's town day (LEAD.md M1): its length in real minutes at 1x and the town's traffic (times the lot trips); remembered */
  townDay = { minutes: 10, traffic: 1 };
  setTownDay(v: Partial<{ minutes: number; traffic: number }>) {
    this.townDay = { minutes: Math.min(30, Math.max(0.5, v.minutes ?? this.townDay.minutes)), traffic: Math.min(4, Math.max(0, v.traffic ?? this.townDay.traffic)) };
    try { localStorage.setItem('capitalempire.townday', JSON.stringify(this.townDay)); } catch { /* storage may be unavailable */ }
    this.traffic.setTownDay(this.townDay.minutes, this.townDay.traffic); this.nightKey = ''; this.emit();
  }
  /** fast-forwards the sim to the next 7:30 or 16:30 (game clock s 450 and 990 of the day); resumes first if paused. Not while the clock is frozen. */
  skipToRush() {
    if (this.traffic.skipping) return;
    if (this.traffic.stats.frozen) { this.toast('The clock is frozen during an event'); return; }
    const now = performance.now(), c = this.traffic.clockTime(now), day = Math.floor(c / GAME_DAY) * GAME_DAY;
    const target = [day + 450, day + 990].find(u => u > c) ?? day + GAME_DAY + 450, h = target % GAME_DAY === 450 ? 7 : 16;
    const until = this.traffic.simTime(now) + (target - c); // the sim time of the target, from the clock's offset now
    if (!this.speed) this.setSpeed(this.lastSpeed);
    this.traffic.skip(until);
    this.toast(`Skipping to the ${h === 7 ? 'morning' : 'evening'} rush…`);
  }
  /** takes the before / after snapshot now: the last rush window before this game hour and the next rush (the after numbers come with it); asks for a fresh report */
  takeSnapshot() {
    const at = Math.floor(this.traffic.clockTime(performance.now()) / GAME_HOUR), after = nextRush(at + 1); // the hour now began before the change: the after window starts at the next hour or later
    this.snapshot = { at, before: lastRush(this.traffic.hours, at), after };
    this.traffic.requestReport();
    this.toast(`Snapshot taken. Make your change; the after numbers come with the ${String(after[0] % 24).padStart(2, '0')}:00 rush`);
    this.emit();
  }
  /** drops the before / after snapshot */
  clearSnapshot() { this.snapshot = null; this.emit(); }
  /** the snapshot's rush window, once both its hours are in the city's snapshots (null until then) */
  get snapshotAfter(): Window | null { const s = this.snapshot; return s ? windowOf(this.traffic.hours, s.after[0], s.after[1], true) : null; }
  /** the access overlay's growth state, at most once a second: per zone, the lots started within the last game day (no declining, level BUILDING or more) and the lots declining (decline 1 or more); and the totals */
  private growthNow() {
    const now = performance.now();
    if (now - this.growStamp < 1000) return;
    this.growStamp = now; const T = this.traffic.clockTime(now);
    this.growN.fill(0); this.declN.fill(0); this.growTot = 0; this.declTot = 0;
    for (const l of this.traffic.lots.values()) {
      const z = zoneOf(l.o[0] + l.u[0] * l.w / 2 + l.n[0] * l.d / 2, l.o[1] + l.u[1] * l.w / 2 + l.n[1] * l.d / 2);
      if (l.decline >= 1) { this.declN[z]++; this.declTot++; }
      if (l.level >= LV.BUILDING && l.decline === 0 && T - l.since <= GAME_DAY) { this.growN[z]++; this.growTot++; }
    }
  }
  /** the terrain of the valley for the city worker: its classes, the highway entry (the start block's centre if none) and the seed */
  private sendTerrain() {
  const t = this.terrain, h = t.highway;
  this.traffic.terrain(t.cls, h.x >= 0 ? [h.x, h.y] : [t.start.x + t.start.size / 2, t.start.y + t.start.size / 2], this.seed, this.townPts.flatMap(p => [p.x, p.y]), t.height, this.golfMode);
  this.traffic.disastersOn(this.disastersEnabled);
  }
  /** the town lays a free gravel road: its legs go down like a road build, small props are cleared, and a big prop in the way skips it */
  private townGrow(legs: Leg[]) {
    const cls = CLASS.gravel, near = this.propsNearLegs(legs, cls.h + cls.walk);
    if (near.some(p => !p.auto && LIBRARY[p.item].big && LIBRARY[p.item].kind !== 'car')) return;
    for (const p of near) if (!p.auto && !LIBRARY[p.item].big) this.removeProp(p);
    const now = performance.now(), total = this.net.legsLength(legs), dur = Math.min(4000, 700 + total * 70);
    const cum: number[] = []; let acc = 0; for (const l of legs) { cum.push(acc); acc += vlen(sub(l.b, l.a)); }
    this.edit.addLegs(legs, cls, 2, undefined, true);
    this.commitNetwork(true, now + dur + 150);
    this.builds.push({ legs, cls, t0: now, dur, total, cum });
    if (now - this.growToast > 30000) { this.growToast = now; this.toast('The town laid a gravel road'); }
  }

  // ---------- the event (Phase 5 step 2c) ----------
  /** the stadium's site: the one the player placed (null: none yet; see setBizDefs). In golf mode, the clubhouse's site (the venue) */
  get site(): Site | null { return this.stadiumSite; }
  /** the placed stadium's spot as [x, y, w, h] tiles (null: none) */
  get stadiumDef(): [number, number, number, number] | null { const s = this.bizDefs.find(d => d.type === 'stadium'); return s ? [s.x, s.y, s.w, s.h] : null; }
  /** sets the placed businesses and the stadium's site from them (cached here, so the drawing needs no allocation) */
  private businessProps: Prop[] = [];
  private setBizDefs(defs: BizDef[]) {
    for (const p of this.businessProps) this.sprites.remove(p);
    for (const d of [...this.bizDefs, ...defs]) this.dropTownTrees(d.x, d.y, d.x + d.w, d.y + d.h);
    this.bizDefs = defs; const s = defs.find(d => d.type === 'stadium') ?? defs.find(d => d.type === 'clubhouse'); this.stadiumSite = s ? siteAt(s.x, s.y, s.w, s.h) : null;
    this.businessProps = defs.flatMap(d => businessArt(d, LIBRARY, LIB_INDEX));
    for (const p of this.businessProps) this.sprites.add(p);
  }
  /** the game's own spot for the stadium on this valley (placeStadium), as [x, y, w, h] tiles; null without towns or a fit */
  private gameSpot(): [number, number, number, number] | null { const s = placeStadium(this.terrain.cls, this.townPts); return s ? [s.x, s.y, s.w, s.h] : null; }
  /** how many businesses of type t are placed */
  private bizCount(t: BusinessId): number { let n = 0; for (const d of this.bizDefs) if (d.type === t) n++; return n; }
  /** whether a type is open to build: the dev sandbox's unlock-all, else its unlock is met by the businesses owned (see ownedBiz) */
  bizOpen(t: BusinessId): boolean { return this.sandboxUnlock || unlockedBy(this.ownedBiz()).includes(t); }
  /** the businesses owned as the unlock tree reads them: each placed one with its stats from the worker (fresh until the worker has sent them) */
  ownedBiz(): Owned[] { return ownedOf(this.bizDefs.map(d => this.traffic.biz.find(v => v.id === d.id) ?? { ...d, ...freshStats(d.id) })); }
  /** the unlock toasts: each type now open to build (see bizOpen) that was not open at the last businesses message gets one; the first message after a
   *  new valley or a load only records what is open */
  private bizUnlocks(): void {
    if (this.sandboxUnlock) return;
    const open = new Set(unlockedBy(this.ownedBiz()));
    if (this.bizOpenSeen) for (const id of open) if (!this.bizOpenSeen.has(id)) this.toast(`${BUSINESS[id].name} unlocked: build it with the Business tool (M)`, 'good');
    this.bizOpenSeen = open;
  }
  /** the type in hand: the Business tool builds it, and the ghost follows (R turns its footprint) */
  selectBizType(t: BusinessId) { this.bizType = t; if (this.bizHover) this.bizUpdate(this.bizHover.mx, this.bizHover.my); this.emit(); }
  /** the business tool's ghost at the cursor: the type in hand's footprint centred on the tile under it (R turns it), with the reason it cannot go there */
  private bizUpdate(mx: number, my: number) {
    const t = this.tileAt(mx, my), B = BUSINESS[this.bizType], w = this.bizRot ? B.footprint.h : B.footprint.w, h = this.bizRot ? B.footprint.w : B.footprint.h;
    const x = Math.round(t.x - w / 2), y = Math.round(t.y - h / 2), site = siteAt(x, y, w, h);
    this.bizHover = { mx, my, def: { id: 0, type: this.bizType, x, y, w, h }, site, why: this.bizWhy(B, site) };
  }
  /** why business type B cannot be built on site s ('' if it can), in order: not open (its unlock's text); the most of its type already; the spot (siteWhy:
   *  the town's distance, water); a road within 2 tiles; a car park in the way; another business within 2 tiles; a building; the money */
  private bizWhy(B: BusinessType, s: Site): string {
    const plural = B.name.endsWith('y') ? B.name.slice(0, -1) + 'ies' : B.name + 's';
    return (!this.bizOpen(B.id) ? unlockText(B, this.ownedBiz()) : '')
      || (this.bizCount(B.id) >= B.max ? (B.id === 'stadium' ? 'You have a stadium already (demolish it first)' : `You have the most ${plural} already (${B.max})`) : '')
      || siteWhy(s, this.terrain.cls, this.townPts, B.townMin, B.water)
      || (this.roadNearRect(s.x, s.y, s.w, s.h, 2) ? 'A road runs through it' : '')
      || (this.parkDefs.some(p => p.x < s.x + s.w + 1 && p.x + p.w > s.x - 1 && p.y < s.y + s.h + 1 && p.y + p.h > s.y - 1) ? 'A car park is in the way' : '')
      || (this.bizDefs.some(d => d.x < s.x + s.w + 2 && d.x + d.w > s.x - 2 && d.y < s.y + s.h + 2 && d.y + d.h > s.y - 2) ? 'Another business is in the way' : '')
      || (this.lotsUnder(s) ? 'Buildings stand there' : '')
      || (B.buildCost > this.money ? `Not enough money: the ${B.name.toLowerCase()} costs $${B.buildCost.toLocaleString()}` : '');
  }
  /** whether a road runs through the rect (x, y, w, h) grown by pad tiles: each seg's centre line sampled every 0.5 tiles, against the rect grown by pad and the seg's half-width */
  private roadNearRect(x: number, y: number, w: number, h: number, pad: number): boolean {
    for (const s of this.net.segs) {
      const g = s.cls.h + pad, ax = s.a.x, ay = s.a.y, bx = s.b.x, by = s.b.y;
      if (Math.max(ax, bx) < x - g || Math.min(ax, bx) > x + w + g || Math.max(ay, by) < y - g || Math.min(ay, by) > y + h + g) continue;
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 0.5));
      for (let k = 0; k <= n; k++) { const f = k / n; if (rectDist({ x: ax + (bx - ax) * f, y: ay + (by - ay) * f }, x, y, w, h) <= g) return true; }
    }
    return false;
  }
  /** the business tool's click: a valid, affordable business is built on the ghost (the worker gets the list); else the toast says why */
  private bizClick() {
    const h = this.bizHover; if (!h) return;
    if (h.why) { this.toast(h.why, 'warn'); return; }
    const B = BUSINESS[h.def.type];
    this.traffic.spend('construction', B.buildCost);
    this.setBizDefs([...this.bizDefs, { ...h.def, id: Math.max(0, ...this.bizDefs.map(d => d.id)) + 1 }]);
    this.traffic.setBusinesses(this.bizDefs); this.farmsUpdate();
    this.scheduleSave(); this.toast(`${B.name} built (-$${B.buildCost.toLocaleString()})`, 'good');
    this.bizUpdate(h.mx, h.my); this.emit();
  }
  /** demolishes a business by id (the stadium between rounds only): half its build cost comes back, and the worker drops it */
  demolishBusiness(id: number) {
    const d = this.bizDefs.find(q => q.id === id); if (!d) return;
    if (d.type === 'stadium' && this.traffic.round.stage !== 'free') { this.toast('Not while a round runs', 'warn'); return; }
    const B = BUSINESS[d.type];
    this.traffic.spend('construction', -B.buildCost / 2);
    this.setBizDefs(this.bizDefs.filter(q => q.id !== id)); this.traffic.setBusinesses(this.bizDefs); this.farmsUpdate();
    this.scheduleSave(); this.toast(`${B.name} demolished (+$${(B.buildCost / 2).toLocaleString()})`, 'good'); this.emit();
  }
  /** demolishes the stadium (between rounds only; see demolishBusiness) */
  demolishStadium() { const s = this.bizDefs.find(d => d.type === 'stadium'); if (s) this.demolishBusiness(s.id); }
  /** announces an event round: the build (10 minutes of wall clock) starts; the city worker refuses unless the round is free */
  startRound() { this.traffic.startRound(); this.toast('The event is announced: 10 minutes to build'); this.emit(); }
  /** ends the build now: the crowd's run to kick-off begins */
  startNow() { this.traffic.startNow(); this.emit(); }
  /** closes the eval: the round is free again and the clock runs on */
  closeRound() {
  if (this.golf && this.traffic.round.last) {
  const ye = this.golfYearEnd(this.traffic.round.last);
  if (ye) {
  this.golf.tier = ye.tier;
  this.golf.rep = ye.rep;
  this.golf.poorYears = ye.poorYears;
  this.traffic.setGolf(true, this.golf.tier, this.golf.rep, this.golfLand());
  const book = computeTournamentCloseBook(ye, this.traffic.round.last.tickets ?? 0, this.paint.areas, this.traffic.round.last.upkeep, this.traffic.round.last.toll ?? 0);
  if (book.bizIncome > 0) {
  this.traffic.spend('business', -book.bizIncome);
  }
  if (book.upkeepCost > 0) {
  this.traffic.spend('upkeep', book.upkeepCost);
  }
  this.scheduleSave();
  }
  }
  this.traffic.closeRound(); this.emit();
  }
  /** moves the camera to the stadium's centre, keeping the zoom */
  goToSite() { const s = this.site; if (!s) return; this.cam.X = worldX(s.c.x, s.c.y); this.cam.Y = worldY(s.c.x, s.c.y); this.clampCam(); this.emit(); }
  /** moves the camera to a business's centre, keeping the zoom */
  goToBusiness(id: number) { const d = this.bizDefs.find(q => q.id === id); if (!d) return; const cx = d.x + d.w / 2, cy = d.y + d.h / 2; this.cam.X = worldX(cx, cy); this.cam.Y = worldY(cx, cy); this.clampCam(); this.emit(); }

  // ---------- car parks (Phase 5 step 3b) ----------
  /** the index of the car park under tile t, or -1 */
  private parkIndexAt(t: Pt): number { return this.parkDefs.findIndex(d => t.x >= d.x && t.x < d.x + d.w && t.y >= d.y && t.y < d.y + d.h); }
  /** the car park drag: its rect to the pointer (tiles, rounded), the verdict (parkValid's reason, '' if it may be built), its built park and its cost */
  private parkUpdate(mx: number, my: number) {
    const pd = this.parkDrag; if (!pd) return;
    const t = this.tileAt(mx, my);
    pd.x1 = Math.round(t.x); pd.y1 = Math.round(t.y); pd.mx = mx; pd.my = my;
    const def: CarParkDef = { id: 0, x: Math.min(pd.x0, pd.x1), y: Math.min(pd.y0, pd.y1), w: Math.abs(pd.x1 - pd.x0), h: Math.abs(pd.y1 - pd.y0) };
    pd.def = def; pd.cost = parkCost(def); pd.why = parkValid(def, this.terrain.cls, this.net, this.site, this.parkDefs) || (this.lotsUnder(def) ? 'buildings stand there' : '');
    pd.park = pd.why ? null : buildPark(this.net, def);
  }
  /** whether a lot of the town that is not EMPTY overlaps rect r (its box against r) */
  private lotsUnder(r: { x: number; y: number; w: number; h: number }): boolean {
    for (const l of this.traffic.lots.values()) {
      if (l.level === LV.EMPTY) continue;
      const ax = l.o[0] + l.u[0] * l.w, ay = l.o[1] + l.u[1] * l.w, bx = l.o[0] + l.n[0] * l.d, by = l.o[1] + l.n[1] * l.d, cx = ax + l.n[0] * l.d, cy = ay + l.n[1] * l.d;
      if (Math.max(l.o[0], ax, bx, cx) > r.x && Math.min(l.o[0], ax, bx, cx) < r.x + r.w && Math.max(l.o[1], ay, by, cy) > r.y && Math.min(l.o[1], ay, by, cy) < r.y + r.h) return true;
    }
    return false;
  }
  /** the car park drag's end: a valid car park that is affordable is built (id: the next after the highest), else the toast says why */
  private parkRelease() {
    const pd = this.parkDrag; this.parkDrag = null; if (!pd) return;
    if (pd.why) { this.toast(pd.why, 'warn'); return; }
    if (!pd.park) { this.toast('Car park: no road along its sides', 'warn'); return; }
    if (pd.cost > this.money) { this.toast(`Not enough money: a car park this size costs $${pd.cost.toLocaleString()}`, 'warn'); return; }
    const id = Math.max(0, ...this.parkDefs.map(d => d.id)) + 1, bays = pd.park.bays.length;
    this.parkDefs.push({ ...pd.def, id }); this.bump('parks');
    this.dropTownTrees(pd.def.x, pd.def.y, pd.def.x + pd.def.w, pd.def.y + pd.def.h);
    this.traffic.spend('construction', pd.cost);
    this.syncParks();
    this.toast(`Car park: ${bays} bays ($${pd.cost.toLocaleString()})`, 'good');
    this.scheduleSave(); this.emit();
  }
  /** the car parks' builds on the network (after each network change and on load), and the list to the city worker (which builds them too) */
  private syncParks() {
    this.parkBuilt = this.parkDefs.map(d => buildPark(this.net, d));
    this.traffic.setParks(this.parkDefs);
    this.parkGrounds(); this.syncGates();
  }
  /** after the Parking tool's lists change (and after each network change, via its sync): the extra parks are its lots and on-street runs as the
   *  engine has them now, and their gates follow */
  private parkingChanged() { this.extraParks = [...this.parking.lots(), ...this.parking.curbParks()]; this.syncGates(); }
  /** the entrance gates, P signs and pay machines of every built car park and every extra park (gateSpots), as auto props gate:{id}:{k}, placed by
   *  their centre; a prop whose spot moved is replaced, and the props of parks that are gone are removed */
  private syncGates() {
    const want = new Map<string, { item: number; x: number; y: number; flip: boolean }>();
    const add = (p: CarPark | null) => {
      if (!p) return;
      gateSpots(p).forEach((g, k) => {
        const item = LIBRARY.findIndex(it => it.id === g.item), b = item >= 0 ? LIBRARY[item]!.boxes[0] : undefined;
        if (!b) return;
        // the box's centre sits at the spot (a flipped prop's box turns: dx and dy swap, see footprint)
        const ox = g.flip ? b.dy : b.dx, oy = g.flip ? b.dx : b.dy;
        want.set(`gate:${p.id}:${k}`, { item, x: g.x - ox / 2, y: g.y - oy / 2, flip: g.flip });
      });
    };
    for (const pk of this.parkBuilt) add(pk);
    for (const p of this.extraParks) add(p);
    for (const [key, p] of this.gateProps) {
      const w = want.get(key);
      if (w && w.item === p.item && w.x === p.x && w.y === p.y && w.flip === p.flip) continue;
      this.removeProp(p); this.gateProps.delete(key);
    }
    for (const [key, w] of want) if (!this.gateProps.has(key)) this.gateProps.set(key, this.addProp(w.item, w.x, w.y, w.flip, 1, key));
  }
  /** the car parks' asphalt and bay lines, baked into the ground like a lot's car park (key park:{id}); a car park gone, or without a frontage, drops its patch */
  private parkGrounds() {
    const keep = new Set<string>();
    this.parkDefs.forEach((d, k) => {
      const pk = this.parkBuilt[k]; if (!pk) return;
      const key = `park:${d.id}`, lines: number[] = [];
      for (const b of pk.bays) {
        if (b.dir % 2 === 0) for (const o of [-BAY_W / 2, BAY_W / 2]) lines.push(b.x - BAY_D / 2, b.y + o, b.x + BAY_D / 2, b.y + o);
        else for (const o of [-BAY_W / 2, BAY_W / 2]) lines.push(b.x + o, b.y - BAY_D / 2, b.x + o, b.y + BAY_D / 2);
      }
      keep.add(key); this.setLotGround(key, [{ pts: [d.x, d.y, d.x + d.w, d.y, d.x + d.w, d.y + d.h, d.x, d.y + d.h], tex: 'asphalt', lines }]);
    });
    for (const key of this.parkGround) if (!keep.has(key)) this.setLotGround(key, null);
    this.parkGround = keep;
  }
  /** the ground patch keys of the car parks (park:{id}) baked now */
  private parkGround = new Set<string>();
  /** removes car park k (no refund): its parked cars go with it */
  private removePark(k: number) { const d = this.parkDefs[k]!; this.dropParkCars(d.id); this.dropTownTrees(d.x, d.y, d.x + d.w, d.y + d.h); this.parkDefs.splice(k, 1); this.syncParks(); }
  /** removes the parked car props of car park id (they are contiguous from bay 0) */
  private dropParkCars(id: number) {
    for (let i = 0; ; i++) { const key = `park:${id}:${i}`, p = this.parkCars.get(key); if (!p) break; this.removeProp(p); this.parkCars.delete(key); }
  }
  /** the parked cars: the first `parked` bays of each car park (nearest its entrances first) get a car, an auto prop park:{id}:{i} (never saved), facing its
   *  bay and centred on it; only the difference is added or removed, at most twice a second */
  private syncParkCars(now: number) {
    if (now - this.parkSyncAt < 500) return;
    this.parkSyncAt = now;
    const views = this.traffic.parks;
    for (let k = 0; k < this.parkDefs.length; k++) this.parkCarsOf(this.parkDefs[k]!.id, this.parkBuilt[k] ?? null, views);
    // the bay rows' lots and on-street runs park the same way; the ones gone lose their cars
    const ids = new Set<number>();
    for (const p of this.extraParks) { ids.add(p.id); this.parkCarsOf(p.id, p, views); }
    for (const id of this.extraCarIds) if (!ids.has(id)) this.dropParkCars(id);
    this.extraCarIds = ids;
  }
  /** car park id's parked cars (pk: its built park, null if none): the first `parked` bays get a car, as syncParkCars says */
  private parkCarsOf(id: number, pk: CarPark | null, views: ParkView[]) {
    const v = views.find(q => q.id === id);
    const want = pk && v ? Math.min(v.parked, pk.bays.length) : 0;
    for (let i = 0; i < want; i++) {
      const key = `park:${id}:${i}`, have = this.parkCars.get(key);
      if (have && this.props.has(have)) continue;
      const bay = pk!.bays[i]!, facing = parkedCar(i, bay.dir);
      this.parkCars.set(key, this.addProp(facing.item, bay.x - facing.ox, bay.y - facing.oy, facing.flip, 1, key));
    }
    for (let i = want; ; i++) { const key = `park:${id}:${i}`, p = this.parkCars.get(key); if (!p) break; this.removeProp(p); this.parkCars.delete(key); }
  }
  /** moves the camera to car park id's centre, keeping the zoom */
  goToPark(id: number) { const d = this.parkDefs.find(q => q.id === id); if (!d) return; this.cam.X = worldX(d.x + d.w / 2, d.y + d.h / 2); this.cam.Y = worldY(d.x + d.w / 2, d.y + d.h / 2); this.clampCam(); this.emit(); }
  /** dev: n cars sent to car park id (the city worker parks them as bays allow; see parkTest there) */
  parkTest(id: number, n: number) { this.traffic.parkTest(id, n); }
  /** the car park bays as 1 px outlines (one stroke): the rect of each bay, its depth along the bay's facing (dir even: x) */
  private bayOutlines(ctx: CanvasRenderingContext2D, bays: { x: number; y: number; dir: number }[]) {
    this.setIso(ctx); ctx.beginPath();
    for (const b of bays) { const ex = b.dir % 2 === 0 ? BAY_D / 2 : BAY_W / 2, ey = b.dir % 2 === 0 ? BAY_W / 2 : BAY_D / 2; ctx.rect(b.x - ex, b.y - ey, 2 * ex, 2 * ey); }
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = this.dpr; ctx.stroke();
  }
  /** the car parks over the baked ground: red when it lost its frontage, its entrances as amber dots with a line to its edge, and the label
   *  P · parked/bays at its centre */
  private drawParks(ctx: CanvasRenderingContext2D) {
    const dpr = this.dpr;
    for (let k = 0; k < this.parkDefs.length; k++) {
      const d = this.parkDefs[k]!, pk = this.parkBuilt[k] ?? null;
      // the asphalt and the bays are baked into the ground (parkGrounds); the overlay only marks a car park that lost its frontage
      if (!pk) { this.setIso(ctx); ctx.beginPath(); ctx.rect(d.x, d.y, d.w, d.h); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = 'rgba(230,80,80,0.6)'; ctx.fill(); }
      if (pk) for (const e of pk.entrances) {
        const a = this.screen(clamp(e.x, d.x, d.x + d.w), clamp(e.y, d.y, d.y + d.h)), b = this.screen(e.x, e.y);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.strokeStyle = '#ffbe3c'; ctx.lineWidth = 2 * dpr; ctx.stroke();
        disc(ctx, b.x, b.y, 4 * dpr, '#ffbe3c');
      }
      const parked = this.traffic.parks.find(q => q.id === d.id)?.parked ?? 0, c = this.screen(d.x + d.w / 2, d.y + d.h / 2);
      const label = `P · ${parked}/${pk ? pk.bays.length : 0}`;
      ctx.font = `bold ${12 * dpr}px ui-sans-serif, system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round'; ctx.lineWidth = 3 * dpr; ctx.strokeStyle = 'rgba(2,6,23,0.9)'; ctx.strokeText(label, c.x, c.y);
      ctx.fillStyle = '#f8fafc'; ctx.fillText(label, c.x, c.y);
    }
    // the bay rows' lots and on-street runs: their entrances and labels, and a lot with no road in reach
    this.parkView.ctx = ctx; this.parkView.dpr = dpr; drawParkingOverlay(this.parkView, this.extraParks, this.traffic.parks, this.parking.rows);
    if (this.golf) {
    const parcels = this.golf.parcels ?? [this.golf.parcel];
    const rect = (x: number, y: number, w: number, h: number) => { this.setIso(ctx); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.setTransform(1, 0, 0, 1, 0, 0); };
    for (const r of parcels) {
    rect(r[0], r[1], r[2], r[3]);
    ctx.strokeStyle = 'rgba(234, 179, 8, 0.7)'; ctx.lineWidth = 1.5 * dpr; ctx.setLineDash([4 * dpr, 4 * dpr]); ctx.stroke(); ctx.setLineDash([]);
    }
    if (this.landMode && this.landHover) {
    const h = this.landHover, hr = h.rect;
    rect(hr[0], hr[1], hr[2], hr[3]);
    ctx.fillStyle = 'rgba(34, 197, 94, 0.2)'; ctx.fill();
    ctx.strokeStyle = '#22c55e'; ctx.lineWidth = 2 * dpr; ctx.stroke();
    const c = this.screen(hr[0] + hr[2] / 2, hr[1] + hr[3] / 2);
    const label = `$${h.price.toLocaleString()} (${h.landClass})`;
    ctx.font = `bold ${12 * dpr}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.strokeStyle = 'rgba(2, 6, 23, 0.9)'; ctx.lineWidth = 3 * dpr; ctx.strokeText(label, c.x, c.y);
    ctx.fillStyle = '#f8fafc'; ctx.fillText(label, c.x, c.y);
    ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
    }
    }
    ctx.lineJoin = 'miter'; ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
    }
  /** the car park drag: the rect green where parkValid allows it, else red; its bays and entrances when it can be built; and the verdict at the cursor
   *  (the reason, or the cost short of the money, or the bays and the cost) */
  private drawParkPreview(ctx: CanvasRenderingContext2D) {
    const pd = this.parkDrag; if (!pd) return;
    const d = pd.def, pk = pd.park, v = this.ghostView(ctx), g = ghostStatus(pd.why, pd.cost, this.money, `${pk ? pk.bays.length : 0} bays`);
    drawGhostBlueprint(v, { status: g.status, rects: [{ rect: { x: d.x, y: d.y, w: d.w, h: d.h } }] });
    if (pk) { this.bayOutlines(ctx, pk.bays); drawGhostBlueprint(v, { status: g.status, entrances: pk.entrances }); }
    drawGhostHint(v, pd.mx, pd.my, g.label, g.bad);
  }

  // ---------- toll gates (Phase 5 step 5b) ----------
  /** the road seg whose ends are the plaza's a and b (either way round, within 1e-3), or null */
  private tollSeg(d: TollDef): Seg | null {
    const at = (p: Pt, x: number, y: number) => Math.abs(p.x - x) < 1e-3 && Math.abs(p.y - y) < 1e-3;
    for (const s of this.net.segsNear({ x: (d.ax + d.bx) / 2, y: (d.ay + d.by) / 2 }, PLAZA_LEN / 2 + 1)) {
      if ((at(s.a, d.ax, d.ay) && at(s.b, d.bx, d.by)) || (at(s.a, d.bx, d.by) && at(s.b, d.ax, d.ay))) return s;
    }
    return null;
  }
  /** the index of the toll gate whose plaza (tapers included) holds tile t, or -1 */
  private tollIndexAt(t: Pt): number {
    return this.tollDefs.findIndex(d => { const s = this.tollSegs.get(d.id); if (!s) return false; const f = plazaLocal(d, t.x, t.y); return f.t >= 0 && f.t <= PLAZA_LEN && f.o >= -s.cls.h && f.o <= plazaEdge(d.booths, laneOff(s, 0)); });
  }
  /** the toll tool's plan at the cursor: the nearest road piece within 4 tiles, the plaza it would make (its a → b is the inbound way: toward the stadium, R flips it),
   *  and the verdict (why: the reason it cannot be built, '' if it can) */
  private tollUpdate(mx: number, my: number) {
    const t = this.tileAt(mx, my), booths = this.tollBooths, cost = TOLL_BASE_COST + booths * TOLL_BOOTH_COST;
    let best: Seg | null = null, bd = 4, pr = 0;
    for (const s of this.net.segsNear(t, 4)) {
      const dv = sub(s.b, s.a), L = vlen(dv); if (!L) continue;
      const u = mul(dv, 1 / L), k = clamp(dot(sub(t, s.a), u), 0, L), dist = vlen(sub(t, add(s.a, mul(u, k))));
      if (dist < bd) { bd = dist; best = s; pr = k; }
    }
    if (!best) { this.tollHover = { mx, my, seg: null, a: t, b: t, why: 'Point at a straight road', cost, booths }; return; }
    const seg: Seg = best, dv = sub(seg.b, seg.a), L = vlen(dv), u = mul(dv, 1 / L), P = add(seg.a, mul(u, pr));
    const toward = !this.site || dot(u, sub(this.site.c, P)) >= 0, s0 = Math.round(pr - PLAZA_LEN / 2);
    const p0 = add(seg.a, mul(u, s0)), p1 = add(seg.a, mul(u, s0 + PLAZA_LEN)), fwd = toward !== this.tollFlip;
    const a = fwd ? p0 : p1, b = fwd ? p1 : p0, ends = Math.min(pr, L - pr), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
    const junction = (p: Pt) => { for (const q of this.net.segsNear(p, 1)) if (q !== seg && segDist(p, q) < 0.6) return true; return false; };
    let why = '';
    if (seg.kind !== SK.GROUND) why = 'Toll gates go on ground-level road, not a bridge or tunnel';
    else if (ends < PLAZA_LEN / 2 + 6) why = 'Too close to a junction: a toll gate needs 21 tiles of straight road at each side';
    else if (junction(a) || junction(b)) why = 'A junction is in the way: move the gate';
    else if (this.tollDefs.some(d => Math.hypot((d.ax + d.bx) / 2 - cx, (d.ay + d.by) / 2 - cy) < 60)) why = 'Another toll gate is within 60 tiles';
    this.tollHover = { mx, my, seg, a, b, why, cost, booths };
  }
  /** the toll tool's click: a valid, affordable gate is built on the plan at the cursor (its plaza seg; the road is split at its ends) */
  private tollClick() {
    const h = this.tollHover; if (!h) return;
    if (!h.seg) { this.toast('Click a straight road to put a toll gate on it', 'warn'); return; }
    if (h.why) { this.toast(h.why, 'warn'); return; }
    if (h.cost > this.money) { this.toast(`Not enough money: a toll gate with ${h.booths} booths costs $${h.cost.toLocaleString()}`, 'warn'); return; }
    const s = h.seg, id = Math.max(0, ...this.tollDefs.map(d => d.id)) + 1, def: TollDef = { id, ax: h.a.x, ay: h.a.y, bx: h.b.x, by: h.b.y, booths: h.booths };
    this.tollDefs.push(def); { const b = tollBox(def); this.dropTownTrees(b[0]!, b[1]!, b[2]!, b[3]!); }
    this.edit.addLegs([{ a: h.a, b: h.b }], s.cls, s.style, [SK.GROUND]);
    this.commitNetwork();
    if (!this.tollDefs.includes(def)) { this.toast('The road would not take a toll gate here', 'warn'); this.tollUpdate(h.mx, h.my); return; }
    this.traffic.setTolls(this.tollDefs);
    this.traffic.spend('construction', h.cost);
    this.puff((h.a.x + h.b.x) / 2, (h.a.y + h.b.y) / 2, 8);
    this.toast(`Toll gate: ${h.booths} booths`, 'good');
    this.tollUpdate(h.mx, h.my);
  }
  /** the toll gates' plaza segs after each network change (and on load): a gate whose plaza seg is gone is dropped; the ground is baked for the rest
   *  (key toll:{id}); the worker gets the list when a gate was dropped, or when forced */
  private syncTolls(force = false) {
    const keep: TollDef[] = [], segs = new Map<number, Seg>();
    for (const d of this.tollDefs) { const s = this.tollSeg(d); if (s) { keep.push(d); segs.set(d.id, s); } }
    const dropped = keep.length !== this.tollDefs.length;
    this.tollDefs = keep; this.tollSegs = segs;
    const ground = new Set<string>();
    for (const d of keep) { const key = `toll:${d.id}`, s = segs.get(d.id)!; ground.add(key); this.setLotGround(key, this.tollPatches(d, s)); }
    for (const key of this.tollGround) if (!ground.has(key)) this.setLotGround(key, null);
    this.tollGround = ground;
    if (dropped || force) this.traffic.setTolls(this.tollDefs);
  }
  /** removes toll gate k (no refund): its plaza's ground goes; the road stays */
  private removeToll(k: number) {
    const d = this.tollDefs[k]!, key = `toll:${d.id}`, b = tollBox(d);
    this.dropTownTrees(b[0]!, b[1]!, b[2]!, b[3]!);
    this.tollDefs.splice(k, 1); this.tollSegs.delete(d.id); this.setLotGround(key, null); this.tollGround.delete(key);
    this.traffic.setTolls(this.tollDefs);
  }
  /** the plaza's asphalt patches for toll gate d on seg s (baked like a car park's) */
  private tollPatches(d: TollDef, s: Seg): LotPatch[] { return plazaQuads(d, s.cls.h, laneOff(s, 0)).map(pts => ({ pts, tex: 'asphalt' as const })); }
  /** moves the camera to toll gate id's plaza, keeping the zoom */
  goToToll(id: number) { const d = this.tollDefs.find(q => q.id === id); if (!d) return; const x = (d.ax + d.bx) / 2, y = (d.ay + d.by) / 2; this.cam.X = worldX(x, y); this.cam.Y = worldY(x, y); this.clampCam(); this.emit(); }
  /** the toll gates over the baked ground: a booth island between each pair of booth lanes and at both outer sides (grey, with an amber roof dot), and the
   *  label TOLL · $price above them (the price per car at the round's level) */
  private drawTolls(ctx: CanvasRenderingContext2D) {
    if (!this.tollDefs.length) return;
    const dpr = this.dpr, price = tollPrice(this.traffic.round.level);
    this.setIso(ctx); ctx.beginPath();
    for (const d of this.tollDefs) { const s = this.tollSegs.get(d.id); if (s) for (const i of plazaIslands(d, laneOff(s, 0))) ring(ctx, i.quad); }
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#d4d4d8'; ctx.fill(); ctx.strokeStyle = '#0f172a'; ctx.lineWidth = dpr; ctx.stroke();
    ctx.font = `bold ${12 * dpr}px ui-sans-serif, system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round'; ctx.lineWidth = 3 * dpr; ctx.strokeStyle = 'rgba(2,6,23,0.9)';
    for (const d of this.tollDefs) {
      const s = this.tollSegs.get(d.id); if (!s) continue;
      const off0 = laneOff(s, 0);
      for (const i of plazaIslands(d, off0)) { const p = this.screen(i.c.x, i.c.y); disc(ctx, p.x, p.y, 2 * dpr, '#ffbe3c'); }
      const mid = plazaPoint(d, PLAZA_LEN / 2, (-s.cls.h + plazaEdge(d.booths, off0)) / 2), c = this.screen(mid.x, mid.y), label = `TOLL · $${price}`;
      ctx.strokeText(label, c.x, c.y - 18 * dpr); ctx.fillStyle = '#f8fafc'; ctx.fillText(label, c.x, c.y - 18 * dpr);
    }
    ctx.lineJoin = 'miter'; ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
  }
  /** the toll tool's preview at the cursor: the plaza outline (green where it can go, else red), its inbound arrow and a booth line across each booth lane;
   *  the label: the reason, or the booths and the cost (red when short of the money) */
  private drawTollPreview(ctx: CanvasRenderingContext2D) {
    const h = this.tollHover; if (!h) return;
    const dpr = this.dpr, s = h.seg;
    if (s) {
      const d: TollDef = { id: 0, ax: h.a.x, ay: h.a.y, bx: h.b.x, by: h.b.y, booths: h.booths }, off0 = laneOff(s, 0), c = PLAZA_LEN / 2;
      const outline = plazaOutline(d, s.cls.h, off0);
      drawGhostPoly(this.ghostView(ctx), outline, h.why ? 'invalid' : 'valid');
      const q = (t: number, o: number, first = false) => { const p = plazaPoint(d, t, o); if (first) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); };
      this.setIso(ctx); ctx.beginPath();
      q(c - 6, 0, true); q(c + 6, 0); q(c + 3, -1.5); q(c + 6, 0); q(c + 3, 1.5);
      for (let k = 0; k < h.booths; k++) { const o = off0 + BOOTH_W * k; q(c, o - 0.8, true); q(c, o + 0.8); }
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.5 * dpr; ctx.stroke();
    }
    const g = tollGhostLabel(h.why, h.booths, h.cost, this.money);
    drawGhostHint(this.ghostView(ctx), h.mx, h.my, g.label, g.bad);
  }

  // ---------- shuttle bus routes (Phase 5 step 6b) ----------
  /** the road point nearest tile t within r tiles (its projection on the nearest seg's centre line), or null */
  private roadNear(t: Pt, r: number): Pt | null {
    let best: Pt | null = null, bd = r;
    for (const s of this.net.segsNear(t, r)) {
      const dv = sub(s.b, s.a), L = vlen(dv); if (!L) continue;
      const u = mul(dv, 1 / L), P = add(s.a, mul(u, clamp(dot(sub(t, s.a), u), 0, L))), d = vlen(sub(t, P));
      if (d < bd) { bd = d; best = P; }
    }
    return best;
  }
  /** the bus tool's plan at the cursor: the stop it would place (x, y: a road point within 4 tiles, else the tile under the cursor), the car park of a lot stop
   *  (park: its id; 0 for a doors stop, a town's car park or none), the town of a stop beside a town's car park lot (town), and why it cannot be placed ('' if
   *  it can). The lot stop: a car park within 12 tiles of the road point, else a town's car park lot (townParkAt); the doors stop: within 60 tiles of the
   *  stadium's rect. Once the first stop is picked, the plan is the doors stop */
  private busUpdate(mx: number, my: number) {
    const t = this.tileAt(mx, my), lot = !this.busPick, P = this.roadNear(t, 4);
    if (!P) { this.busHover = { mx, my, x: t.x, y: t.y, park: 0, why: lot ? 'Click a road beside a car park' : 'Click a road near the stadium' }; return; }
    if (lot) {
      let park = 0, bd = 12;
      for (const d of this.parkDefs) { const q = rectDist(P, d.x, d.y, d.w, d.h); if (q <= bd) { bd = q; park = d.id; } }
      if (park) { this.busHover = { mx, my, x: P.x, y: P.y, park, why: '' }; return; }
      const town = this.townParkAt(t, 12);
      this.busHover = town === null ? { mx, my, x: P.x, y: P.y, park: 0, why: 'Click a road beside a car park' } : { mx, my, x: P.x, y: P.y, park: 0, why: '', town };
    } else {
      const s = this.site, near = !!s && rectDist(P, s.x, s.y, s.w, s.h) <= 60;
      this.busHover = { mx, my, x: P.x, y: P.y, park: 0, why: near ? '' : 'Click a road near the stadium' };
    }
  }
  /** the town of the town public car park lot (a COM lot that isCarPark) whose centre is nearest tile t within r tiles, or null; the town is the nearest
   *  town centre to that lot's centre (the worker's town index: the terrain's towns, in order) */
  private townParkAt(t: Pt, r: number): number | null {
    let best: LotView | null = null, bd = r, bx = 0, by = 0;
    for (const v of this.traffic.lots.values()) {
      if (!isCarPark(v)) continue;
      const cx = v.o[0] + (v.u[0] * v.w + v.n[0] * v.d) / 2, cy = v.o[1] + (v.u[1] * v.w + v.n[1] * v.d) / 2, d = Math.hypot(cx - t.x, cy - t.y);
      if (d <= bd) { bd = d; best = v; bx = cx; by = cy; }
    }
    if (!best) return null;
    const cs = townCentres(this.terrain);
    let k = -1, kd = Infinity;
    cs.forEach((c, i) => { const d = (c.x - bx) ** 2 + (c.y - by) ** 2; if (d < kd) { kd = d; k = i; } });
    return k < 0 ? null : k;
  }
  /** the bus tool's click: the first picks the lot stop (its plan must have a car park), the second places the route with the doors stop if it is affordable
   *  (the first route is free: the starting kit) */
  private busClick() {
    const h = this.busHover; if (!h) return;
    if (h.why) { this.toast(h.why, 'warn'); return; }
    if (!this.busPick) { this.busPick = { x: h.x, y: h.y, park: h.park, town: h.town }; this.busUpdate(h.mx, h.my); this.emit(); return; }
    const cost = this.busDefs.length ? BUS_ROUTE_COST : 0, pk = this.busPick;
    if (cost > this.money) { this.toast(`Not enough money: a bus route costs $${cost.toLocaleString()}`, 'warn'); return; }
    const id = Math.max(0, ...this.busDefs.map(d => d.id)) + 1;
    this.busDefs.push({ id, park: pk.park, sx: pk.x, sy: pk.y, dx: h.x, dy: h.y, buses: this.busFleet, seats: this.busSeats, ...(pk.town !== undefined ? { town: pk.town } : {}) });
    if (cost) this.traffic.spend('construction', cost);
    this.traffic.setBusRoutes(this.busDefs);
    this.busPick = null; this.puff((pk.x + h.x) / 2, (pk.y + h.y) / 2, 8);
    this.toast(`Bus route #${id}: ${this.busFleet} buses of ${this.busSeats} seats${cost ? ` ($${cost.toLocaleString()})` : ' (the starting kit)'}`, 'good');
    this.busUpdate(h.mx, h.my); this.scheduleSave(); this.emit();
  }
  /** the index of the bus route with a stop within 3 tiles of tile t, or -1 */
  private busIndexAt(t: Pt): number { return this.busDefs.findIndex(d => Math.hypot(d.sx - t.x, d.sy - t.y) <= 3 || Math.hypot(d.dx - t.x, d.dy - t.y) <= 3); }
  /** removes bus route k (no refund) and sends the list to the city worker (which plans the buses again) */
  private removeBus(k: number) { this.busDefs.splice(k, 1); this.traffic.setBusRoutes(this.busDefs); }
  /** moves the camera to the midpoint of bus route id's stops, keeping the zoom */
  goToBus(id: number) { const d = this.busDefs.find(q => q.id === id); if (!d) return; const x = (d.sx + d.dx) / 2, y = (d.sy + d.dy) / 2; this.cam.X = worldX(x, y); this.cam.Y = worldY(x, y); this.clampCam(); this.emit(); }
  /** the bus routes over the baked ground: a bus-stop marker at each stop, and at the street and district zooms a thin dashed line between a route's two stops
   *  (white 30%: a schematic, not the path) */
  private drawBuses(ctx: CanvasRenderingContext2D) {
    if (!this.busDefs.length) return;
    const dpr = this.dpr;
    if (this.cam.z >= PLANNER_Z) {
      ctx.beginPath();
      for (const d of this.busDefs) { const a = this.screen(d.sx, d.sy), b = this.screen(d.dx, d.dy); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
      ctx.setLineDash([6 * dpr, 4 * dpr]); ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1.5 * dpr; ctx.stroke(); ctx.setLineDash([]);
    }
    for (const d of this.busDefs) { const a = this.screen(d.sx, d.sy), b = this.screen(d.dx, d.dy); busStop(ctx, a.x, a.y, dpr); busStop(ctx, b.x, b.y, dpr); }
  }
  /** the galleries' standing crowds (LEAD.md M2.2): each spot's fans as up to 48 standing walkers in rings round its point (0.75 tiles
   *  apart, the rings 0.9 tiles out each), with the count (`n watching`) at a closer zoom; below zoom 0.08 a green dot sized by the crowd */
  private drawGalleries(ctx: CanvasRenderingContext2D) {
    const G = this.traffic.gallery; if (!G.length) return;
    if (!walkSheet) { walkSheet = new Image(); walkSheet.src = walkersUrl; }
    const dpr = this.dpr, ze = this.cam.z * this.dpr, cw = this.cw, ch = this.ch, X0 = this.cam.X, Y0 = this.cam.Y, sprites = this.cam.z >= 0.08, h = 0.9 * HH * 2 * ze, sheet = walkSheet;
    ctx.font = `bold ${12 * dpr}px ui-sans-serif, system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round'; ctx.lineWidth = 3 * dpr; ctx.strokeStyle = 'rgba(2,6,23,0.9)';
    for (let i = 0; i + 3 < G.length; i += 4) {
      const x = G[i]!, y = G[i + 1]!, n = Math.round(G[i + 2]!); if (n <= 0) continue;
      const c = this.screen(x, y); if (c.x < -200 || c.y < -200 || c.x > cw + 200 || c.y > ch + 200) continue;
      if (!sprites) { ctx.fillStyle = 'rgba(134,239,172,0.85)'; ctx.beginPath(); ctx.arc(c.x, c.y, Math.min(10, 2 + Math.sqrt(n) / 3) * dpr, 0, Math.PI * 2); ctx.fill(); continue; }
      // rings of standing fans: 6 on the first, 12 on the next, 18 on the third ..., each fan a quarter turn of the walk cycle apart in hero
      for (let k = 0, ring = 1, onRing = 0, per = 6, m = Math.min(48, Math.ceil(n / 2)); k < m; k++) {
        const a = (onRing / per) * Math.PI * 2 + ring * 0.37, r = ring * 0.9;
        walkerSprite(ctx, sheet, x + Math.cos(a) * r, y + Math.sin(a) * r, (k + i) % 3, 0, ze, X0, Y0, cw, ch, h);
        if (++onRing >= per) { ring++; onRing = 0; per = 6 * ring; }
      }
      if (this.cam.z >= 0.2) { const t = `${n} watching`, ty = c.y - h * 1.6; ctx.strokeText(t, c.x, ty); ctx.fillStyle = '#bbf7d0'; ctx.fillText(t, c.x, ty); }
    }
  }
  /** the shuttle crowd on the map (during a surge and its eval): each lot stop's queue as up to 24 walkers in a 4 x 6 grid 0.7 tiles apart, 1.5 tiles behind the
   *  kerb (toward the stop's car park), with the count (`n waiting`); each walking group as min(n, 3) walkers 0.4 tiles apart, feet at the tile, the walk cycle
   *  of hero (group % 3), a frame each 180 ms; below zoom 0.08 each group is a 2 px amber dot. Culled to the view */
  private drawWalkers(ctx: CanvasRenderingContext2D, now: number) {
    const W = this.traffic.walkers, S = this.traffic.stops;
    if (!W.length && !S.length) return;
    if (!walkSheet) { walkSheet = new Image(); walkSheet.src = walkersUrl; }
    const dpr = this.dpr, ze = this.cam.z * this.dpr, cw = this.cw, ch = this.ch, X0 = this.cam.X, Y0 = this.cam.Y;
    const sprites = this.cam.z >= 0.08, h = 0.9 * HH * 2 * ze, tick = now / 180, sheet = walkSheet;
    ctx.font = `bold ${12 * dpr}px ui-sans-serif, system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round'; ctx.lineWidth = 3 * dpr; ctx.strokeStyle = 'rgba(2,6,23,0.9)';
    for (let i = 0; i + 3 < S.length; i += 4) {
      const sx = S[i]!, sy = S[i + 1]!, q = Math.round(S[i + 2]!), r = S[i + 3]!;
      const def = this.busDefs[r], park = def ? this.parkDefs.find(p => p.id === def.park) : undefined;
      let ux = 0, uy = 1;
      if (park) { const cx = park.x + park.w / 2 - sx, cy = park.y + park.h / 2 - sy, L = Math.hypot(cx, cy); if (L > 0) { ux = cx / L; uy = cy / L; } }
      const bx = sx + ux * 1.5, by = sy + uy * 1.5;
      for (let g = 0, nq = sprites ? Math.min(24, q) : 0; g < nq; g++) walkerSprite(ctx, sheet, bx + ((g & 3) - 1.5) * 0.7, by + ((g >> 2) - 2.5) * 0.7, ((r % 3) + 3) % 3, Math.floor(tick + g) % 4, ze, X0, Y0, cw, ch, h);
      if (q > 0) {
        const px = (worldX(sx, sy) - X0) * ze + cw / 2, py = (worldY(sx, sy) - Y0) * ze + ch / 2, label = `${q} waiting`;
        ctx.strokeText(label, px, py - 16 * dpr); ctx.fillStyle = '#f8fafc'; ctx.fillText(label, px, py - 16 * dpr);
      }
    }
    if (!sprites) {
      ctx.fillStyle = '#ffbe3c';
      for (let i = 0; i + 3 < W.length; i += 4) {
        const px = (worldX(W[i]!, W[i + 1]!) - X0) * ze + cw / 2, py = (worldY(W[i]!, W[i + 1]!) - Y0) * ze + ch / 2;
        if (px >= -2 * dpr && px <= cw + 2 * dpr && py >= -2 * dpr && py <= ch + 2 * dpr) ctx.fillRect(px - dpr, py - dpr, 2 * dpr, 2 * dpr);
      }
    } else for (let i = 0; i + 3 < W.length; i += 4) {
      const x = W[i]!, y = W[i + 1]!, k = Math.min(3, Math.round(W[i + 2]!)), idx = i >> 2, frame = Math.floor(tick + idx) % 4;
      for (let j = 0; j < k; j++) walkerSprite(ctx, sheet, x + (j - (k - 1) / 2) * 0.4, y, idx % 3, frame, ze, X0, Y0, cw, ch, h);
    }
    ctx.lineJoin = 'miter'; ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
  }
  /** the bus tool's preview at the cursor: once the first stop is picked, a line from it to the plan (white dashed) and the plan's stop; the label: the reason,
   *  the lot stop's car park, or the doors stop's cost (red when short of the money) */
  private drawBusPreview(ctx: CanvasRenderingContext2D) {
    const h = this.busHover; if (!h) return;
    const dpr = this.dpr, P = this.busPick;
    if (P) {
      const a = this.screen(P.x, P.y), b = this.screen(h.x, h.y);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.setLineDash([6 * dpr, 4 * dpr]); ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.5 * dpr; ctx.stroke(); ctx.setLineDash([]);
      busStop(ctx, a.x, a.y, dpr);
    }
    drawGhostRing(this.ghostView(ctx), h.x, h.y, 1.5, 0, h.why ? 'invalid' : 'valid');
    if (!h.why) { const b = this.screen(h.x, h.y); busStop(ctx, b.x, b.y, dpr); }
    const cost = this.busDefs.length ? BUS_ROUTE_COST : 0, g = busGhostLabel(h.why, !!P, cost, this.money, h.town !== undefined, h.park);
    drawGhostHint(this.ghostView(ctx), h.mx, h.my, g.label, g.bad);
  }

  // ---------- economy / save ----------
  /** the treasury, $ (the city's books, mirrored from the city worker; spend moves it at once); Infinity with unlimited money (the dev sandbox) */
  get money(): number { return this.traffic.unlimited ? Infinity : this.traffic.budget.money; }
  /** the dev sandbox's growth speed (1 = the game's), whether the towns are stamped at a new valley, and unlimited money (the top bar's badge) */
  get growth(): number { return this.sandboxGrow; }
  get stamped(): boolean { return this.stampOn; }
  /** the dev sandbox's unlock-all (see sandboxUnlock) */
  get unlockAll(): boolean { return this.sandboxUnlock; }
  get unlimited(): boolean { return this.traffic.unlimited; }
  /** the game day (from the city's books) */
  get day(): number { return this.traffic.day; }
  /** the last closed day's ledger, or null before the first day closes */
  get ledger(): Ledger | null { const h = this.traffic.budget.history; return h[h.length - 1] ?? null; }
  /** true once the city went too long in the red (the books stay so) */
  get bankrupt() { return this.traffic.budget.bankrupt; }
  /** the index of the highest career milestone reached (see career.ts; the city worker's, mirrored) */
  get reached() { return this.traffic.career.reached; }
  /** true once the career is won (WIN_POP residents; it stays so) */
  get won() { return this.traffic.career.won; }
  /** event mode: the valley has town centres (the stadium is then the player's to place: see site), and the event's rules replace the Career's unlocks (see classOpen, junctionOpen, tunnelsOpen) */
  get eventMode(): boolean { return this.townPts.length > 0; }
  /** the golf game's state (golf/mode.ts; null: a legacy classic game, which loads and plays as before) */
  golf: GolfSave | null = null;
  /** the course's subtle height field (T027; saved in golf.height) */
  courseHeight: CourseHeightField = createCourseHeightField();
  /** the course height as save chunks, cached by field and rev (see courseHeightChunks) */
  private chSave: { field: CourseHeightField; rev: number; chunks: CourseHeightSaveChunk[] } | null = null;
  /** golf mode: a new game is a golf game (one town, the old nine, the season); the stadium and the Business tool are off */
  get golfMode(): boolean { return this.golf !== null; }
  landMode = false;
  landHover: { rect: [number, number, number, number]; price: number; landClass: ParcelLandClass } | null = null;
  toggleLandMode() {
  if (!this.golfMode) return;
  this.landMode = !this.landMode;
  if (!this.landMode) this.landHover = null;
  this.emit();
  }
  private blockLandClass(r: [number, number, number, number]): { landClass: ParcelLandClass; houses: number; buildings: number } {
  const [bx, by, bw, bh] = r;
  for (let y = by; y < by + bh; y += 4) {
  for (let x = bx; x < bx + bw; x += 4) {
  if (x >= 0 && x < MAP && y >= 0 && y < MAP && this.terrain.cls[y * MAP + x] === TC.WATER) return { landClass: 'unbuildable', houses: 0, buildings: 0 };
  }
  }
  let houses = 0, buildings = 0, com = false, ind = false;
  for (const l of this.traffic.lots.values()) {
  if (l.level >= 1 && l.o[0] >= bx && l.o[0] < bx + bw && l.o[1] >= by && l.o[1] < by + bh) {
  if (l.use === 1) houses++;
  else if (l.use === 2) { buildings++; com = true; }
  else if (l.use === 3) { buildings++; ind = true; }
  else if (l.use > 1) buildings++;
  }
  }
  if (com) return { landClass: 'commercial', houses, buildings };
  if (ind) return { landClass: 'industrial', houses, buildings };
  if (houses > 0 || buildings > 0) return { landClass: 'town', houses, buildings };
  for (const f of this.farmMap.farms.values()) {
  if (f.p.o.x >= bx && f.p.o.x < bx + bw && f.p.o.y >= by && f.p.o.y < by + bh) return { landClass: 'farm', houses: 0, buildings: 0 };
  }
  return { landClass: 'open', houses: 0, buildings: 0 };
  }
  buyLandBlock(r: [number, number, number, number]) {
  if (!this.golf) return;
  const parcels = this.golf.parcels ?? [this.golf.parcel];
  const info = this.blockLandClass(r);
  const res = buyAdjacentBlock(parcels, { rect: r, ...info, townPop: this.traffic.pop }, this.money);
  if (!res.ok) {
  this.toast(res.reason ?? 'Cannot buy this block', 'warn');
  return;
  }
  this.golf.parcels = res.parcels;
  this.golf.parcel = res.bounds;
  this.traffic.setGolf(true, this.golf.tier, this.golf.rep, this.golfLand()); // the town keeps off the new land too
  this.traffic.spend('construction', res.price);
  this.scheduleSave();
  this.toast(`Purchased ${info.landClass} block ($${res.price.toLocaleString()})`);
  this.landHover = null;
  this.emit();
  }
  /** the golf HUD's view (null outside golf mode) */
  lastGolfMonth = -1;
  /** the game month as an absolute count (seasons so far x 12 + months since September), for planting and grow-in; on tournament day the clock sits on the next season's first instant, so it is read a unit earlier */
  golfMonthIndex(): number {
    const r = this.traffic.round, c = this.traffic.clockTime(performance.now()) - (r.stage !== 'free' ? 1 : 0);
    return r.runs * 12 + ((seasonMonth(c) - SEASON_START + 12) % 12);
  }
  /** counts a player action toward the tool unlocks (golf mode only; saved) */
  private bump(k: 'pieces' | 'roads' | 'parks' | 'structures') { const p = this.golf?.progress; if (!p) return; p[k]++; this.scheduleSave(); this.emit(); }
  /** the player's progress facts (T032), null outside golf mode */
  playerProgressFacts(): PlayerProgressFacts | null { const p = this.golf?.progress; return p ? progressFacts(p, this.traffic.round.runs) : null; }
  /** the progressive tool visibility (T032/T033), null outside golf mode (classic and sandbox show everything) */
  progressiveUi(): ProgressiveUiState | null { const f = this.playerProgressFacts(); return f ? computeProgressiveUiState(f) : null; }
  /** the tool visibility in force (T033): null shows everything (classic games, and the dev sandbox's unlock-all) */
  toolUi(): ProgressiveUiState | null { return this.unlockAll ? null : this.progressiveUi(); }
  /** hides a first-run hint for good (saved) */
  dismissHint(id: string) { const p = this.golf?.progress; if (!p || p.dismissed.includes(id)) return; p.dismissed.push(id); this.scheduleSave(); this.emit(); }
  /** the "Show all tools (Advanced)" toggle (saved) */
  setAdvancedTools(on: boolean) { const p = this.golf?.progress; if (!p || p.advanced === on) return; p.advanced = on; this.scheduleSave(); this.emit(); }
  golfView(): GolfView | null {
  if (!this.golf) return null;
  const c = this.traffic.clockTime(performance.now()), r = this.traffic.round, tier = this.golf.tier;
  const curM = this.golfMonthIndex();
  if (curM !== this.lastGolfMonth) {
  this.lastGolfMonth = curM;
  const effM = effectiveGrowInClockMonth(curM, this.golf.cards ?? this.traffic.round.cards);
  for (const a of this.paint.areas) if (a.plantKind === 'seed' && a.plantedMonth !== undefined) this.paint.send(a, effM); // only areas still growing in change with the month
  }
  return { tier, tierName: tierInfo(tier).name, month: seasonLabel(r.stage !== 'free' ? c - 1 : c, r.runs), monthsLeft: monthsLeft(c), year: yearOf(r.runs), live: r.stage !== 'free' };
  }
  /** course stats panel view data (null outside golf mode), derived from painted areas and hole objects */
  courseStatsView(): CourseStatsPanel | null {
  if (!this.golf) return null;
  const curM = this.golfMonthIndex();
  const areas: CourseArea[] = this.paint.areas.map(a => ({
  id: a.id,
  surface: surfaceOfTex(a.tex) ?? 'other',
  pts: a.pts,
  plantKind: a.plantKind,
  plantedMonth: a.plantedMonth,
  }));
  const layout: CourseLayout = {
  areas,
  tees: this.golf.tees,
  pins: this.golf.pins,
  aims: this.golf.aims,
  clubhouse: this.golf.clubhouse,
  };
  const holes = deriveHoles(layout.areas, layout.tees, layout.pins, layout.aims);
  const have = new Set<Need>(structuresNeeds(this.golf.structures ?? [], holes));
  if (this.parkDefs.length > 0) have.add('carpark');
  for (const n of parkRideNeeds(this.golf.clubhouse, this.parkDefs, this.busDefs)) have.add(n);
  const gCards = this.golf.cards ?? this.traffic.round.cards;
  for (const n of parkRideNeedsWithCards(this.golf.clubhouse, this.parkDefs, this.busDefs, gCards)) have.add(n);
  const panel = buildCourseStatsPanel(layout, this.golf.tier, have, effectiveGrowInClockMonth(curM, gCards), { field: this.courseHeight, areas: this.paint.areas.map(a => ({ hole: a.hole, surface: surfaceOfTex(a.tex) ?? 'other', pts: a.pts })) });
  return { ...panel, qualityScore: applyCourseConsultantQuality(panel.qualityScore, gCards) };
  }
  /** evaluates tournament day outcome and tour progression (null outside golf mode or without a finished round) */
  golfYearEnd(last = this.traffic.round.last): YearEndResult | null {
  if (!this.golf || !last) return null;
  const stats = this.courseStatsView();
  const holes = stats ? deriveHoles(this.paint.areas.map(a => ({ id: a.id, surface: surfaceOfTex(a.tex) ?? 'other', pts: a.pts })), this.golf.tees, this.golf.pins, this.golf.aims) : [];
  const have = new Set<Need>(structuresNeeds(this.golf.structures ?? [], holes));
  if (this.parkDefs.length > 0) have.add('carpark');
  for (const n of parkRideNeeds(this.golf.clubhouse, this.parkDefs, this.busDefs)) have.add(n);
  const facts: CourseFacts = { holes: stats?.totals.holes ?? 0, lengthM: stats?.totals.lengthM ?? 0, have };
  const gCards = this.golf.cards ?? this.traffic.round.cards;
  for (const n of parkRideNeedsWithCards(this.golf.clubhouse, this.parkDefs, this.busDefs, gCards)) have.add(n);
  const baseQ = stats ? buildCourseStatsPanel({ areas: this.paint.areas.map(a => ({ id: a.id, surface: surfaceOfTex(a.tex) ?? 'other', pts: a.pts, plantKind: a.plantKind, plantedMonth: a.plantedMonth })), tees: this.golf.tees, pins: this.golf.pins, aims: this.golf.aims, clubhouse: this.golf.clubhouse }, this.golf.tier, have, effectiveGrowInClockMonth(this.golfMonthIndex(), gCards), { field: this.courseHeight, areas: this.paint.areas.map(a => ({ hole: a.hole, surface: surfaceOfTex(a.tex) ?? 'other', pts: a.pts })) }).qualityScore : 85;
  const parked = countParkedCars(this.traffic.parks, this.traffic.round.surge, last.byTown);
  return computeYearEnd(this.golf.tier, this.golf.rep, last, facts, this.golf.poorYears ?? 0, this.golf.structures ?? [], holes, this.seed, baseQ, gCards, parked, this.parking.fee);
  }
  /** fast-forwards the season to the tournament (the end of the game day, one sim second past it); golf mode only, not while the clock is frozen */
  skipToTournament() {
  if (!this.golf || this.traffic.skipping) return;
  if (this.traffic.stats.frozen) { this.toast('The clock is frozen during an event'); return; }
    const now = performance.now(), c = this.traffic.clockTime(now), target = Math.floor(c / GAME_DAY) * GAME_DAY + GAME_DAY;
    const until = this.traffic.simTime(now) + (target - c) + 1; // one sim second past the target, so the worker's step crosses it
    if (!this.speed) this.setSpeed(this.lastSpeed);
    this.traffic.skip(until);
    this.toast('Skipping to the tournament…');
  }
  /** a road class is open to build: every class in event mode, else as the Career unlocks it */
  classOpen(id: ClassId): boolean { return this.sandboxUnlock || this.eventMode || classUnlocked(id, this.reached); }
  /** a junction type is open: in event mode all but the roundabout, which the Roundabout card opens; else as the Career unlocks it */
  junctionOpen(t: NodeType): boolean { if (this.golf?.cards?.includes('roundabout') && t === 'roundabout') return true; return this.sandboxUnlock ? true : this.eventMode ? t !== 'roundabout' || this.traffic.round.cards.includes('roundabout') : junctionUnlocked(t, this.reached); }
  /** the highest speed-limit tier open: the year's (see speedTierOpen), all of them with the dev sandbox's unlock-all */
  speedTierMax(): 0 | 1 | 2 | 3 { return this.sandboxUnlock ? 3 : speedTierOpen(this.traffic.round.year); }
  /** every road's speed limit raised by the tier's km/h (0 the roads' own limits): free, once its year has come; the lanes rebuild at the new limits */
  setSpeedTier(t: 0 | 1 | 2 | 3) {
    if (t > this.speedTierMax()) { this.toast(`+${SPEED_BONUS_KMH[t]} km/h speed limits from ${SPEED_TIER_YEAR[t]}`, 'warn'); return; }
    if (t === this.net.speedTier) return;
    this.edit.setSpeedTier(t); this.commitNetwork();
    this.toast(t ? `Speed limits +${SPEED_BONUS_KMH[t]} km/h on every road (up to 140)` : "Speed limits back to each road's own", 'good');
  }
  /** the best signal tier open: the year's (see signalTierOpen), every tier with the dev sandbox's unlock-all */
  signalTier(): 0 | 1 | 2 { return this.sandboxUnlock ? 2 : signalTierOpen(this.traffic.round.year); }
  /** tunnels are open: always in event mode, else as the Career unlocks them */
  tunnelsOpen(): boolean { return this.sandboxUnlock || this.eventMode || tunnelsUnlocked(this.reached); }
  /** takes a card of the eval's draft (the worker refuses what is not on it); its effects follow with the next frame (see applyCards) */
  pickCard(id: CardId) { if (this.golf && isGolfCardId(id) && this.traffic.round.stage === 'eval' && this.traffic.round.draft?.includes(id)) { this.golf.cards = [...(this.golf.cards ?? []), id]; this.scheduleSave(); } this.traffic.pickCard(id); this.emit(); }
  /** the new toll gates' booths, the new bus routes' buses and the seats of a bus, as the cards given set them (see applyCards; on load, the cards applied) */
  private setCardFields(cards: CardId[]) {
    this.tollBooths = START_BOOTHS + 2 * cards.filter(c => c === 'booths').length;
    this.busFleet = START_BUSES + 4 * cards.filter(c => c === 'buses').length;
    this.busSeats = cards.includes('doubledecker') ? DECK_SEATS : BUS_SEATS;
  }
  /** the round's cards not applied yet, in order: a toast each, and the effects on the toll gates and bus routes (booths, buses, double-decker seats);
   *  express and the double-decker seats of the routes are the worker's (City.applyCards); the roundabout's is its gate (see junctionOpen) */
  private applyCards() {
    const cards = this.traffic.round.cards;
    for (let i = this.cardsApplied; i < cards.length; i++) {
      const id = cards[i]!;
      if (id === 'booths') { this.tollBooths += 2; for (const d of this.tollDefs) { d.booths += 2; const b = tollBox(d); this.dropTownTrees(b[0]!, b[1]!, b[2]!, b[3]!); } this.syncTolls(true); }
      else if (id === 'buses') { this.busFleet += 4; for (const d of this.busDefs) d.buses += 4; this.traffic.setBusRoutes(this.busDefs); }
      else if (id === 'doubledecker') { this.busSeats = DECK_SEATS; for (const d of this.busDefs) d.seats = Math.max(d.seats, DECK_SEATS); this.traffic.setBusRoutes(this.busDefs); }
      if (this.golf) this.golf.cards = cards.filter(isGolfCardId);
      const cardName = findGolfCard(id)?.name ?? CARDS.find(c => c.id === id)?.name ?? id;
      this.toast(`Card: ${cardName}`, 'good');
    }
    this.cardsApplied = cards.length; this.scheduleSave(); this.emit();
  }
  /** takes a loan unit if the town can hold one more (else says why); the worker books it */
  borrow() { const b = Budget.from(this.traffic.budget); if (b.loans >= b.maxLoans(this.traffic.pop)) this.toast('No more credit: grow the town for more', 'warn'); else this.traffic.loan(true); }
  /** repays a loan unit if there is one and the treasury covers LOAN (else says why); the worker books it */
  repay() { const b = this.traffic.budget; if (!b.loans) this.toast('No loans to repay', 'warn'); else if (b.money < LOAN) this.toast('Not enough money to repay', 'warn'); else this.traffic.loan(false); }
  scheduleSave() { if (this.benchMode) return; clearTimeout(this.saveTimer); this.saveTimer = window.setTimeout(() => void this.save(), 800); }
  benchMode = false;
  async save() {
    if (this.benchMode) return 0;
    const d: SaveV5 = {
      version: SAVE_VERSION, map: MAP, seed: this.seed,
      segs: [...this.net.segs].map(segRec),
      nodes: [...this.net.nodes.values()].filter(n => n.type !== 'plain' || n.wide || n.tl).map(nodeEntry),
      props: [...this.props].filter(p => !p.auto).map(p => p.plant ? [LIBRARY[p.item].id, +p.x.toFixed(3), +p.y.toFixed(3), p.flip ? 1 : 0, p.scale, 1] : [LIBRARY[p.item].id, +p.x.toFixed(3), +p.y.toFixed(3), p.flip ? 1 : 0, p.scale]),
      money: this.traffic.budget.money, day: this.day, cam: { ...this.cam },
      lots: [...this.traffic.lots.values()].filter(l => l.level !== LV.EMPTY).map((l): LotTuple => [l.key, l.use, l.level, l.decline, l.seed, l.since]),
      simT: this.traffic.simTime(performance.now()), shift: this.traffic.stats.clock - this.traffic.stats.simT, budget: this.traffic.budget, career: this.traffic.career, round: this.traffic.round,
      parks: this.parkDefs.map((d): [number, number, number, number] => [d.x, d.y, d.w, d.h]),
      tolls: this.tollDefs.map((d): [number, number, number, number, number] => [d.ax, d.ay, d.bx, d.by, d.booths]),
      buses: this.busDefs.map((d): [number, number, number, number, number, number, number, number] => [d.park, +d.sx.toFixed(3), +d.sy.toFixed(3), +d.dx.toFixed(3), +d.dy.toFixed(3), d.buses, d.seats, d.town ?? -1]),
      cardsApplied: this.cardsApplied,
      biz: this.bizDefs.map((d): [BusinessId, number, number, number, number] => [d.type, d.x, d.y, d.w, d.h]),
      bizStats: this.bizDefs.map((d, k): BizStats => { const v = this.traffic.biz.find(q => q.id === d.id) ?? freshStats(d.id); return { id: k + 1, level: v.level, xp: v.xp, sat: v.sat, goodDays: v.goodDays, revenue: v.revenue, visitors: v.visitors, today: { ...v.today } }; }),
      paints: this.paint.save(),
      grass: this.grass.serialize(),
      rows: this.parking.rows.map((r): [number, number, number, number, number, number, string] => [r.ax, r.ay, r.bx, r.by, r.side, r.bay, r.col]),
      curbs: this.parking.curbs.map((c): [number, number, number, number] => [c.ax, c.ay, c.bx, c.by]),
      parkFee: this.parking.fee,
      speed: this.net.speedTier,
      golf: this.golf ? { ...this.golf, height: this.courseHeightChunks() } : undefined,
    };
    try { return await writeSave(d); } catch { return 0; }
  }
  /** the course height as save chunks (undefined when flat), recomputed only when the field changed */
  private courseHeightChunks(): CourseHeightSaveChunk[] | undefined {
    const f = this.courseHeight; if (!this.chSave || this.chSave.field !== f || this.chSave.rev !== f.rev) this.chSave = { field: f, rev: f.rev, chunks: saveCourseHeight(f) };
    return this.chSave.chunks.length ? this.chSave.chunks : undefined;
  }
  private load(d: SaveV5): boolean {
    try {
      this.bizOpenSeen = null;
      this.genTerrain(d.seed);
      // a golf game has one town (its centre, saved); a legacy save has none of these, and keeps the valley's three
      this.golf = normalizeGolfSave(d.golf);
      this.courseHeight = loadCourseHeight(this.golf?.height); this.chSave = null;
      if (this.golf) this.golf.progress = normalizeProgress(this.golf.progress);
      if (this.golf) { if (this.golf.cards?.length && (!d.round || !d.round.cards?.length)) { if (d.round) d.round.cards = this.golf.cards.slice() as CardId[]; } else if (!this.golf.cards && d.round?.cards?.length) { this.golf.cards = d.round.cards.filter(isGolfCardId); } }
      if (this.golf?.town) { this.townPts = [this.golf.town]; this.roadNames = new RoadNames(this.names, this.townPts); }
      // a save with businesses has its list; an old one has its stadium as id 1 (or, with no stadium field either, the game's spot)
      if (d.biz) this.setBizDefs(d.biz.map(([type, x, y, w, h], k): BizDef => ({ id: k + 1, type, x, y, w, h })));
      else { const at = d.stadium !== undefined ? d.stadium : this.gameSpot(); this.setBizDefs(at ? [{ id: 1, type: 'stadium', x: at[0], y: at[1], w: at[2], h: at[3] }] : []); }
      for (const [ax, ay, bx, by, cls, style, kind, town] of d.segs) this.edit.addLegs([{ a: { x: ax, y: ay }, b: { x: bx, y: by } }], classOf(cls), style as LineStyle, [(kind ?? 0) as SegKind], town ? true : undefined);
      if (d.speed) this.edit.setSpeedTier(Math.min(3, Math.max(0, d.speed | 0)) as 0 | 1 | 2 | 3);
      this.net.rebuild(true);
      for (const entry of d.nodes) applyNodeEntry(this.edit, entry);
      const index = new Map(LIBRARY.map((it, i) => [it.id, i]));
      for (const [id, x, y, flip, scale, plant] of d.props) { const i = index.get(id); if (i !== undefined) { const p = this.addProp(i, x, y, !!flip, scale); if (plant === 1) p.plant = 1; } }
      if (d.parks) this.parkDefs = d.parks.map(([x, y, w, h], k) => ({ id: k + 1, x, y, w, h }));
      if (d.tolls) this.tollDefs = d.tolls.map(([ax, ay, bx, by, booths], k) => ({ id: k + 1, ax, ay, bx, by, booths }));
      if (d.buses) this.busDefs = d.buses.map(([park, sx, sy, dx, dy, buses, seats, town], k) => ({ id: k + 1, park, sx, sy, dx, dy, buses, seats, ...(town !== undefined && town >= 0 ? { town } : {}) }));
      this.paint.load(d.paints as PaintTuple[] | undefined);
      this.grass.load(d.grass); this.grassSim = -1;
      // the bay rows and on-street runs (their ground and lists go to the City now: the network is built above; afterLoad syncs their gates)
      this.parking.load(d.rows?.map(([ax, ay, bx, by, side, bay, col], k): BayRowDef => ({ id: k + 1, ax, ay, bx, by, side: side < 0 ? -1 : 1, bay: bay === 60 || bay === 45 ? bay : 90, col: col === 'white' ? 'white' : 'yellow' })), d.curbs?.map(([ax, ay, bx, by], k): CurbDef => ({ id: k + 1, ax, ay, bx, by })), d.parkFee);
      // the cards the save had applied are in its tolls and routes already: only the fields new gates and routes take are set from them
      const cards = d.round?.cards ?? [], n = Math.min(cards.length, d.cardsApplied ?? cards.length);
      this.cardsApplied = n; this.setCardFields(cards.slice(0, n));
      if (d.cam) this.cam = { ...d.cam, z: clamp(d.cam.z, ZOOM_MIN, ZOOM_MAX) };
      return true;
    } catch (e) { console.error('load failed', e); return false; }
  }
  private reset() {
    this.courseHeight = createCourseHeightField(); this.chSave = null;
    this.grass.clear(); this.grassZones.clear(); this.grassSim = -1; this.grassElapsed = 0; this.grassTrafficT = -1; this.grassPedOut.fill(0); this.grassCarAlive.fill(0); this.grassTarget = null; this.grassAction = null;
    this.edit.clear(); this.snapshot = null;
    for (const p of [...this.props]) this.removeProp(p);
    this.sprites.clear(); this.autoByKey.clear(); this.forest.clear(); this.perf.forest = 0; this.townTrees.clear(); this.perf.townTrees = 0; this.lotBoxes.clear(); this.paintBoxes.clear();
    this.parkCars.clear(); this.parkDefs = []; this.parkBuilt = []; this.parkDrag = null; for (const k of this.parkGround) this.setLotGround(k, null); this.parkGround.clear();
    this.parking.clear(); this.extraParks = []; this.extraCarIds.clear(); this.gateProps.clear();
    this.tollDefs = []; this.tollSegs.clear(); this.tollHover = null; for (const k of this.tollGround) this.setLotGround(k, null); this.tollGround.clear();
    this.busDefs = []; this.busPick = null; this.busHover = null; this.paint.clear();
    this.golf = null; this.townPts = []; this.golfProps.clear(); this.golfStructureProps.clear();
    this.landMode = false; this.landHover = null; this.holesTool = false; this.selectedGolfMarker = null;
    this.eventTool = false; this.eventStructurePending = null; this.lastGolfMonth = -1;
    this.setBizDefs([]); this.bizHover = null; this.bizOpenSeen = null;
    // the new town's round has no cards: the mirror goes with it (a frame still in flight would otherwise apply the old cards again)
    this.cardsApplied = 0; this.setCardFields([]); this.traffic.round = new Round().view();
    for (const k of this.lotProps.keys()) this.setLotGround(k, null);
    for (const k of this.blockLawns) this.setLotGround(k, null); this.blockLawns.clear();
    this.lotProps.clear(); this.lotQueue.clear(); this.staged.clear(); this.perf.lotProps = 0;
    this.dropAllFarms();
    this.traffic.setGolf(false, 1, 0);
    this.traffic.setBudget(null, null); this.showWin = false; this.route = []; this.selected = null; this.builds = [];
  }
  newTown() {
    this.reset(); const golf = this.newGolfGame();
    if (!golf) this.genTerrain(newSeed());
    this.ground.terrain(this.terrain); this.sendTerrain();
    if (!golf) this.seedTowns(); // a golf game laid its town in newGolfGame
    this.afterLoad();
    if (this.stampPending) { this.stampPending = false; this.traffic.stamp(TOWN_POP); this.scheduleSave(); }
    void this.save(); this.toast(`New valley (seed ${this.seed})`); this.emit();
  }
  clearTown() { this.reset(); this.sendTerrain(); this.afterLoad(); void clearSave(); void this.save(); this.emit(); }
  /** debug (the contact sheet): an empty map at the camera, then a street grid of cols x rows blocks (BLOCK tiles). Every lot is composed
   *  directly (no town) with a use from uses (cycled), the level, decline and seed + i. The states hold until the next reset. */
  stageLots(o: { cols: number; rows: number; uses: number[]; level: number; decline: number; seed: number }) {
    this.reset(); this.afterLoad();
    const W = o.cols * BLOCK, H = o.rows * BLOCK, c = tileOf(this.cam.X, this.cam.Y);
    const x0 = clamp(Math.round(c.x - W / 2), 8, MAP - 8 - W), y0 = clamp(Math.round(c.y - H / 2), 8, MAP - 8 - H);
    const legs: Leg[] = [];
    for (let i = 0; i <= o.cols; i++) legs.push({ a: { x: x0 + i * BLOCK, y: y0 }, b: { x: x0 + i * BLOCK, y: y0 + H } });
    for (let j = 0; j <= o.rows; j++) legs.push({ a: { x: x0, y: y0 + j * BLOCK }, b: { x: x0 + W, y: y0 + j * BLOCK } });
    this.edit.addLegs(legs, CLASS.street, 0);
    this.commitNetwork();
    const { added } = new LotMap().update(this.net, this.terrain.cls);
    added.forEach((l, i) => {
      const g: LotGeom = { o: l.o, u: l.u, n: l.n, w: l.w, d: l.d }, st: ComposeState = { use: o.uses[i % o.uses.length]!, level: o.level, decline: o.decline, seed: o.seed + i };
      this.staged.set(l.key, { g, st }); this.placeLot(l.key, g, st);
    });
  }

  /** a new valley: the three towns' street grids (townGrid: the legs on buildable ground, the middle lines avenues), laid as one edit; the
   *  city worker stamps the towns to TOWN_POP residents after the network arrives (stampPending). No lamps yet: the net is rebuilt only by
   *  afterLoad's commit, so the lamps would need a second pass there. */
  private stampPending = false;
  seedTowns() {
    const cs = townCentres(this.terrain), cls = (x: number, y: number) => classAt(this.terrain, x, y);
    if (!cs.length) return;
    const byClass = new Map<ClassId, Leg[]>();
    for (const c of cs) {
      const g = townGrid(c, TOWN_BLOCKS, cls);
      g.legs.forEach((l, i) => { const id = g.cls[i]!; let a = byClass.get(id); if (!a) byClass.set(id, a = []); a.push(l); });
    }
    for (const [id, legs] of byClass) this.edit.addLegs(legs, classOf(id), 0, undefined, true);
    this.cam.X = worldX(cs[0]!.x, cs[0]!.y); this.cam.Y = worldY(cs[0]!.x, cs[0]!.y);
    if (this.stampOn) this.stampPending = true;
  }
  /** A starter Maple Falls showing every road type: highway with a 45° approach, a boulevard, an avenue, a roundabout, lights with slipways, streets and a lane. */
  seedTown() {
    const { start } = this.terrain, Ox = clamp(start.x + 32 - 80, 8, MAP - 168), Oy = clamp(start.y + 32 - 80, 8, MAP - 168);
    const net = this.net, byId = (id: string) => LIBRARY.findIndex(i => i.id === id);
    const legs = (pts: [number, number][]): Leg[] => pts.slice(1).map((p, i) => ({ a: { x: pts[i][0] + Ox, y: pts[i][1] + Oy }, b: { x: p[0] + Ox, y: p[1] + Oy } }));
    const road = (pts: [number, number][], c: RoadClass, s: LineStyle) => { const ls = legs(pts); if (!this.blockedForRoad(ls, c.h + c.walk)) this.edit.addLegs(ls, c, s); };
    road([[10, 50], [24, 36], [146, 36], [146, 64]], CLASS.road, 0);
    road([[80, 36], [80, 124]], CLASS.boulevard, 0);
    road([[36, 80], [128, 80]], CLASS.avenue, 0);
    road([[54, 80], [54, 108], [106, 108], [106, 80]], CLASS.street, 0);
    road([[54, 80], [54, 58]], CLASS.street, 1);
    road([[60, 124], [100, 124]], CLASS.street, 0);
    road([[106, 96], [122, 80]], CLASS.street, 0);
    road([[54, 94], [72, 94]], CLASS.lane, 0);
    road([[120, 108], [106, 108]], CLASS.street, 2);
    net.rebuild(true);
    const typed = (x: number, y: number, t: NodeType) => { const n = net.nodeAt({ x: x + Ox, y: y + Oy }); if (n) this.edit.setNodeType(n, t); };
    typed(80, 36, 'slip'); typed(80, 80, 'roundabout'); typed(80, 108, 'signal'); typed(106, 80, 'signal');
    net.rebuild();
    // helpers: a sprite facing +y with its front edge on frontY; flipped sprites face +x with their front edge on frontX
    const front = (id: string, cx: number, frontY: number, k = 1) => { const i = byId(id); if (i < 0) return; const it = LIBRARY[i], b = it.boxes[0], x = cx + Ox - b.dx * k / 2, y = frontY + Oy - (b.dy * k / 2 + b.hy * k / 2); if (!this.canPlace(it, x, y, false, k)) this.addProp(i, x, y, false, k); };
    const side = (id: string, frontX: number, cy: number, k = 1) => { const i = byId(id); if (i < 0) return; const it = LIBRARY[i], b = it.boxes[0], x = frontX + Ox - (b.dy * k / 2 + b.hy * k / 2), y = cy + Oy - b.dx * k / 2; if (!this.canPlace(it, x, y, true, k)) this.addProp(i, x, y, true, k); };
    const put = (id: string, x: number, y: number, k = 1, flip = false) => { const i = byId(id); if (i >= 0 && !this.canPlace(LIBRARY[i], x + Ox, y + Oy, flip, k)) this.addProp(i, x + Ox, y + Oy, flip, k); };
    front('town:postoffice', 45, 75.4); front('town:bakery', 54, 75.4); front('world:arcade', 63, 75.4);
    front('world:video_rental', 96, 75.4); front('town:grocery', 106, 75.4); front('world:diner', 115, 75.4); front('town:pharmacy', 123, 75.4);
    front('town:laundromat', 40, 118.9); front('town:fish_tackle', 128, 100);
    front('world:church', 54, 54.4); front('world:primary_school', 46, 32.2); front('ref:building-gas-canopy', 112, 32.2); side('town:firestation', 73.9, 62);
    front('world:barn', 30, 61); put('ref:landmark-windmill', 22, 72); put('world:watertower', 138, 76); put('world:gazebo', 102, 56);
    for (const [id, x] of [['world:house_1', 61], ['world:house_3', 69], ['gen:house-splitlevel', 91], ['world:house_4', 99]] as [string, number][]) front(id, x, 104.9);
    for (const [id, x] of [['gen:house-duplex', 66], ['world:house_1', 74], ['gen:house-l-ranch', 88], ['world:house_3', 96]] as [string, number][]) front(id, x, 120.9);
    for (const [id, y] of [['gen:house-ranch-long', 64], ['world:house_4', 72], ['gen:house-farmhouse-wrap', 88], ['gen:house-l-shape', 100]] as [string, number][]) side(id, 50.9, y);
    front('world:house_4', 60, 92.4); front('static:garage_timber', 67, 92.4);
    const trees = ['world:tree_oak_0', 'world:tree_oak_1', 'ref:tree-maple-crimson', 'world:tree_oak_2', 'ref:tree-birch-gold', 'world:tree_pine_0', 'ref:tree-spruce-blue', 'world:tree_pine_1'];
    const spots: [number, number][] = [[94, 48], [100, 50], [108, 47], [114, 52], [120, 58], [96, 60], [112, 62], [118, 48], [60, 113], [68, 113], [92, 113], [100, 113], [44, 86], [46, 100], [112, 90], [118, 96], [130, 56], [134, 48], [30, 72], [36, 66], [138, 92], [132, 100], [60, 44], [66, 48], [24, 60]];
    spots.forEach(([x, y], i) => put(trees[(i * 5) % trees.length], x, y, 0.95 + ((i * 7) % 4) * 0.08));
    this.lampsAlongRoads(this.net);
    put('world:hydrant', 60, 84.2, 0.9); put('world:mailbox', 68, 76.3, 0.9); put('world:bench', 92, 84.1, 0.9); put('world:trashcan', 94, 84.1, 0.9); put('town:bus_stop', 66, 84.1, 0.95);
    put('town:stop_sign', 57.4, 104.6, 0.9); put('town:phone_booth', 101, 76.3, 0.9); put('town:picnic_table', 104, 60, 0.95); put('town:bike_rack', 60, 76.3, 0.9); put('town:utility_pole', 36, 86, 1);
    put('world:car_0', 48, 37.2); put('static:pickup_n', 104, 34.9); put('world:schoolbus', 130, 37.3); put('static:van_e', 60, 82.2); put('world:car_2', 110, 77.8);
    put('world:car_1', 82, 60); put('static:compact_n', 76, 100); put('world:car_3', 66, 106.9); put('static:compact_e', 96, 109.1, 1, true);
    put('world:scarecrow', 30, 52, 0.9); put('ref:halloween-hay-bales', 34, 56, 0.9); put('world:pumpkin_0', 59, 101.5, 0.9); put('world:pumpkin_1', 91.5, 101.6, 0.9); put('gen:inflatable-pumpkin', 73, 117.8, 0.9);
    put('world:candy_stand', 110, 58, 0.9); put('ref:halloween-pumpkin-cluster', 48, 72.5, 0.9); put('ref:halloween-sheet-ghost', 97, 101, 0.9);
    const cx = start.x + 32, cy = start.y + 32;
    this.cam.X = worldX(cx, cy); this.cam.Y = worldY(cx, cy);
    this.buildHighway();
  }
  /** the highway from its map edge entry to the starter town's node nearest the entry (the start block centre if the town has no nodes) */
  private buildHighway() {
    const t = this.terrain, h = t.highway, hw = CLASS.road.h + CLASS.road.walk;
    if (h.x < 0) return;
    let target = { x: t.start.x + t.start.size / 2, y: t.start.y + t.start.size / 2 }, best = Infinity;
    for (const n of this.net.nodes.values()) { const d = (n.x - h.x) ** 2 + (n.y - h.y) ** 2; if (d < best) { best = d; target = { x: n.x, y: n.y }; } }
    const pts = highwayRoute(h, target, hw, (x, y) => classAt(t, x, y));
    const legs0: Leg[] = []; for (let i = 1; i < pts.length; i++) legs0.push({ a: pts[i - 1], b: pts[i] });
    const { legs, kinds } = splitByTerrain(legs0, hw, (x, y) => classAt(t, x, y));
    for (const p of this.propsNearLegs(legs, hw)) if (!LIBRARY[p.item].big) this.removeProp(p);
    this.edit.addLegs(legs, CLASS.road, 0, kinds, true);
  }
  /** street lamps on the sidewalk's outer half along every kerbed street, both sides, staggered */
  lampsAlongRoads(net: RoadNetwork, every = 1) {
    const lampId = LIBRARY.findIndex(i => i.id === 'world:streetlamp'), lampIt = LIBRARY[lampId], lb = lampIt.boxes[0];
    let n = 0;
    for (const r of net.routes) {
      if (r.cls.walkTex !== 'slabs' || r.closed) continue;
      for (let k = 0; k + 1 < r.pts.length; k++) {
        const a = r.pts[k], b = r.pts[k + 1], dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy); if (L < 6) continue;
        const ux = dx / L, uy = dy / L, nx = -uy, ny = ux, off = r.cls.h + r.cls.walk * 0.62, step = (r.cls.id === 'lane' ? 12 : 8) * every;
        for (let s = 4; s < L - 3; s += step) for (const side of [1, -1]) {
          const t = s + (side > 0 ? 0 : step / 2); if (t > L - 3) continue;
          const cx = a.x + ux * t + nx * side * off, cy = a.y + uy * t + ny * side * off, x = cx - lb.dx * 0.9 / 2, y = cy - lb.dy * 0.9 / 2;
          if (!this.canPlace(lampIt, x, y, false, 0.9)) { this.addProp(lampId, x, y, false, 0.9); n++; }
        }
      }
    }
    return n;
  }

  // ---------- fx ----------
  puff(x: number, y: number, n: number) {
    for (let i = 0; i < n; i++) this.particles.push({ x: x + (Math.random() - 0.5) * 1.5, y: y + (Math.random() - 0.5) * 1.5, vx: (Math.random() - 0.5) * 1.2, vy: (Math.random() - 0.5) * 1.2, vz: 0.6 + Math.random() * 1.2, z: 0, life: 0.6 + Math.random() * 0.6, age: 0, r: 0.25 + Math.random() * 0.3 });
  }
  private revealFront(b: Build, now: number) {
    const p = clamp((now - b.t0) / b.dur, 0, 1), e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    return e * b.total;
  }
  /** the build reveal as an alpha mask in screen space (half resolution) */
  private revealMask(now: number) {
    if (!this.builds.length) return null;
    const W = Math.ceil(this.cw / 2), H = Math.ceil(this.ch / 2);
    if (!this.mask || this.mask.width !== W || this.mask.height !== H) this.mask = new OffscreenCanvas(W, H);
    const g = this.mask.getContext('2d')!; g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, H); g.fillStyle = '#fff'; g.beginPath();
    for (const b of this.builds) {
      const front = this.revealFront(b, now), pad = b.cls.h + b.cls.walk + 14;
      b.legs.forEach((l, i) => {
        const d = sub(l.b, l.a), len = vlen(d), rl = clamp(front - b.cum[i], 0, len); if (rl <= 0) return;
        const u = mul(d, 1 / len), n = perp(u), done = rl >= len - 1e-6;
        const s = sub(l.a, mul(u, pad)), e = add(l.a, mul(u, rl + (done ? pad : 0)));
        const c = [add(s, mul(n, pad)), add(e, mul(n, pad)), sub(e, mul(n, pad)), sub(s, mul(n, pad))].map(q => this.screen(q.x, q.y));
        g.moveTo(c[0].x / 2, c[0].y / 2); for (let k = 1; k < 4; k++) g.lineTo(c[k].x / 2, c[k].y / 2); g.closePath();
      });
    }
    g.fill(); return this.mask;
  }

  /** the townspeople: new sidewalks when the network changed (looked at twice a second), the head count from the built lots */
  /** Current maintenance selection: a radius in tiles or the clicked registered grass polygon. */
  grassScope(): GrassScope | null { const p = this.grassTarget; if (!p || !this.grassHere(p.x, p.y)) return null; const zone = this.grassArea ? this.grass.zoneAt(p.x, p.y) : undefined; return this.grassArea && !zone ? null : { ...p, radius: this.grassRadius, zone }; }
  /** Only actual managed turf receives wear: exclude roads/sidewalks, non-ground terrain and overpainted bunkers/water/paths. */
  private grassHere(x: number, y: number): boolean {
    if (!this.grass.zoneAt(x, y) || this.net.occAt(x, y) || classAt(this.terrain, x, y) > TC.PATCH) return false;
    const p = areaAt(this.paint.areas, x, y); return !p || !!grassSurface(p.tex, false, surfaceOfTex(p.tex));
  }
  /** Pay for care through the existing treasury and update only the selected cells. */
  careGrass(action: GrassAction) {
    const scope = this.grassScope(); if (!scope) return;
    const cost = this.grass.quote(action, scope, this.grassDose); if (!cost) { this.toast('Select a grass area first', 'warn'); return; }
    if (cost > this.money) { this.toast(`Grass care needs $${cost}`, 'warn'); return; }
    const n = this.grass.apply(action, scope, this.grassDose, this.grassAngle); if (!n) return;
    this.traffic.spend('upkeep', cost); this.flushGrass(); this.scheduleSave(); this.toast(`${action}: ${n} turf cells ($${cost})`); this.emit();
  }
  /** Persist owner tuning without changing lawn/base-grass/mowing presets. */
  tuneGrass(settings: Partial<GrassSettings>) { this.grass.configure(settings); this.flushGrass(); this.scheduleSave(); this.emit(); }
  /** Record a player-marked turf strike, rendered as a small separate divot; never a full damaged turf tile. */
  markGrassDivot() { const p = this.grassTarget; if (!p || !this.grassHere(p.x, p.y)) return; this.grass.traffic(p.x, p.y, p.x, p.y, 1, 'divot', 0); this.flushGrass(); this.scheduleSave(); this.emit(); }
  private flushGrass() {
    const visible = this.grass.settings.enabled && this.grass.settings.strength > 0 || this.grassHeat;
    if (this.grass.drain(this.grassDelta) && (visible || this.grassVisible)) this.ground.grass(this.grassDelta, this.grass.settings.enabled ? this.grass.settings.strength : 0, this.grassHeat, this.grass.settings.mowing);
    this.grassVisible = visible;
  }
  private updateGrass() {
    const t = this.traffic.stats.simT;
    if (this.grassSim < 0 || t < this.grassSim) this.grassSim = t;
    this.grassElapsed += Math.max(0, t - this.grassSim) / GAME_DAY * (this.golfMode && this.traffic.round.stage === 'free' ? 365 : 1); this.grassSim = t;
    if (this.grassElapsed >= 0.25) {
      const days = Math.min(30, Math.floor(this.grassElapsed * 4) / 4), s = this.grass.settings;
      const r = this.traffic.round, weather = this.golf && r.stage !== 'free' ? getTournamentWeather(this.seed, r.stage === 'eval' && r.last ? r.last.run : r.runs + 1).condition : 'clear';
      this.grass.step(days, { rain: weather === 'rain' ? Math.max(s.rain, 0.2) : weather === 'storm' ? Math.max(s.rain, 0.4) : s.rain, evaporation: weather === 'heat' ? Math.max(s.evaporation, 0.12) : s.evaporation, temperature: weather === 'heat' ? Math.max(32, s.temperature) : s.temperature }); this.grassElapsed -= days;
    }
    // Use real movement/occupancy only. No artificial customers, cart routes or random divots are invented.
    if (this.grass.settings.enabled && this.speed && t - this.grassTrafficT >= 1) {
      const elapsed = this.grassTrafficT < 0 ? 0 : Math.min(5, t - this.grassTrafficT); this.grassTrafficT = t;
      for (let i = 0; i < this.peds.n; i++) {
        const out = this.peds.isOut(i), x = this.peds.x[i], y = this.peds.y[i];
        if (out && this.grassPedOut[i] && this.grassHere(x, y) && this.grassHere(this.grassPedX[i], this.grassPedY[i])) { const distance = Math.hypot(x - this.grassPedX[i], y - this.grassPedY[i]); if (distance > 0.05 && distance < 32) this.grass.traffic(this.grassPedX[i], this.grassPedY[i], x, y, distance, 'foot'); }
        this.grassPedOut[i] = out ? 1 : 0; this.grassPedX[i] = x; this.grassPedY[i] = y;
      }
      // Event frame groups have no stable visitor id: local occupancy is usable without inventing trajectories between groups.
      for (const fans of [this.traffic.walkers, this.traffic.stops, this.traffic.gallery]) for (let k = 0; k + 3 < fans.length; k += 4) if (fans[k + 2] > 0 && this.grassHere(fans[k], fans[k + 1])) this.grass.traffic(fans[k], fans[k + 1], fans[k], fans[k + 1], fans[k + 2] * 0.05 * elapsed, 'foot');
      const tr = this.traffic;
      if (this.grassCarAlive.length < tr.n) { this.grassCarX = new Float32Array(tr.n); this.grassCarY = new Float32Array(tr.n); this.grassCarAlive = new Uint8Array(tr.n); }
      for (let i = 0; i < tr.n; i++) {
        const x = tr.px[i], y = tr.py[i];
        if (tr.alive[i] && this.grassCarAlive[i] && this.grassHere(x, y) && this.grassHere(this.grassCarX[i], this.grassCarY[i])) { const d = Math.hypot(x - this.grassCarX[i], y - this.grassCarY[i]); if (d > 0.05 && d < 32) this.grass.traffic(this.grassCarX[i], this.grassCarY[i], x, y, d / 4, 'cart'); }
        this.grassCarAlive[i] = tr.alive[i]; this.grassCarX[i] = x; this.grassCarY[i] = y;
      }
    }
    this.flushGrass();
  }
  private updatePeds(dt: number) {
    if (!WALKER_PEOPLE.length) return;
    if (this.pedTick++ % 30 === 0) {
      if (this.pedNet !== this.net.version) {
        this.pedNet = this.net.version;
        // town sidewalks only (slab sidewalks, not the rural verges), and never in a tunnel
        const roads = [...this.net.routes].filter(r => r.cls.walkTex === 'slabs' && r.kind !== SK.TUNNEL).map(r => ({ pts: r.pts, h: r.cls.h, walk: r.cls.walk, closed: r.closed }));
        this.peds.setSidewalks(sidewalks(roads));
      }
      // the doors: every built lot's frontage, a tile in (houses are homes; shops, work, civic buildings and venues are places)
      const built = this.traffic?.built ?? 0;
      if (built !== this.pedLots && this.traffic) {
        this.pedLots = built; const doors: Door[] = [];
        for (const l of this.traffic.lots.values()) if (l.level >= LV.BUILT) doors.push({ x: l.o[0] + l.u[0] * l.w / 2 + l.n[0], y: l.o[1] + l.u[1] * l.w / 2 + l.n[1], kind: l.use === 1 ? 0 : 1 });
        this.peds.setDoors(doors);
      }
      this.peds.populate(Math.min(PED_MAX, built * 0.5));
    }
    if (this.speed) this.peds.step(dt);
  }
  /** the walkers in a tile box as movers (reused Drawables): each its person's frame for its facing (mirrored on the west side) */
  private pedMovers(x0: number, y0: number, x1: number, y1: number): Drawable[] {
    const m = this.peds.inBox(x0, y0, x1, y1, this.pedView), out = this.pedDraw; out.length = m;
    for (let k = 0; k < m; k++) {
      const v = this.pedView[k], [row, mirror] = FACING_ROW[v.face]!, d = out[k] ?? (out[k] = { item: 0, x: 0, y: 0, flip: false, scale: 1, x0: 0, y0: 0, x1: 0, y1: 0, moving: true });
      d.item = WALKER_BASE + (v.person * WALK_DIRS.length + row) * WALK_FRAMES + v.frame; d.x = v.x; d.y = v.y; d.flip = mirror;
      d.x0 = v.x - 0.12; d.y0 = v.y - 0.12; d.x1 = v.x + 0.12; d.y1 = v.y + 0.12;
    }
    return out;
  }

  // ---------- main loop ----------
  frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    // real play seconds of a golf game while the sim runs (T033): stops at the Stage 3 mark, so the save does not churn
    const pdt = this.lastFrame ? Math.min(0.25, (now - this.lastFrame) / 1000) : 0; this.lastFrame = now; const gp = this.golf?.progress; if (gp && this.speed > 0 && gp.playS < STAGE_3_TIME_SEC) gp.playS += pdt;
    this.applyLotQueue(); this.applyFarmQueue(); this.flushLotGround(); this.laybyLots();
    // the farms yield to the lots the town builds on (checked about once a second: the count walks every lot)
    if (this.farmsEnabled && ++this.farmTick % 60 === 0 && this.farmMap.stale(claimedLots(this.traffic.lots), this.site, this.farmParks().length)) this.farmsUpdate(true);
    if (this.traffic.round.cards.length > this.cardsApplied) this.applyCards();
    this.yearCheck();
    const t0 = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000), frameMs = now - this.last; this.last = now;
    this.resize();
    const sp = 900 / this.cam.z * dt; let kx = 0, ky = 0;
    if (this.keys.has('ArrowLeft') || this.keys.has('a') || this.keys.has('A')) kx -= 1; if (this.keys.has('ArrowRight') || this.keys.has('d') || this.keys.has('D')) kx += 1;
    if (this.keys.has('ArrowUp') || this.keys.has('w') || this.keys.has('W')) ky -= 1; if (this.keys.has('ArrowDown') || this.keys.has('s') || this.keys.has('S')) ky += 1;
    if (kx || ky) { this.cam.X += kx * sp * 0.6; this.cam.Y += ky * sp * 0.6; this.clampCam(); }
    this.onFrame?.(now, dt);
    for (const b of this.builds) {
      const front = this.revealFront(b, now); if (front >= b.total) continue;
      b.legs.forEach((l, i) => {
        const d = sub(l.b, l.a), len = vlen(d), rl = front - b.cum[i]; if (rl < 0 || rl > len) return;
        const u = mul(d, 1 / len), n = perp(u), f = add(l.a, mul(u, rl));
        for (let k = 0; k < 3; k++) { const s = (Math.random() - 0.5) * 2 * b.cls.h, q = add(f, mul(n, s)); this.particles.push({ x: q.x, y: q.y, vx: (Math.random() - 0.5) * 1.5 - u.x * 0.4, vy: (Math.random() - 0.5) * 1.5 - u.y * 0.4, vz: 0.8 + Math.random() * 1.6, z: 0, life: 0.7 + Math.random() * 0.7, age: 0, r: 0.3 + Math.random() * 0.5 }); }
      });
    }
    this.builds = this.builds.filter(b => now < b.t0 + b.dur + 150);
    for (const p of this.particles) { p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vz -= 0.8 * dt; p.r += 0.6 * dt; }
    this.particles = this.particles.filter(p => p.age < p.life);
    this.traffic?.update(now);
    this.updatePeds(dt);
    this.updateGrass();
    // the followed car: the camera centres on its interpolated place (the info itself comes at 10 Hz)
    if (this.followCar && this.traffic.car) {
      const tr = this.traffic, i = this.inspecting, live = tr.alive[i] === 1, x = live ? tr.px[i]! : tr.car!.x, y = live ? tr.py[i]! : tr.car!.y;
      this.cam.X = worldX(x, y); this.cam.Y = worldY(x, y);
    }
    const t1 = performance.now();
    this.draw(now);
    const t2 = performance.now();
    // perf counters (rolling one second)
    this.frameTimes.push(frameMs); if (this.frameTimes.length > 60) this.frameTimes.shift();
    const avg = this.frameTimes.reduce((s, v) => s + v, 0) / this.frameTimes.length;
    Object.assign(this.perf, { fps: 1000 / avg, frameMs: avg, cpuMs: t2 - t0, drawMs: t2 - t1, instances: this.gl.stats.instances, draws: this.gl.stats.draws, uploadKB: this.gl.stats.uploadFloats * 4 / 1024, chunksPending: this.ground.busy, simActive: this.traffic.stats.active, simTickMs: this.traffic.stats.tickMs, simMaxTickMs: this.traffic.stats.maxTickMs, pop: this.traffic.pop, jobs: this.traffic.jobs, built: this.traffic.built });
    this.perf.frames++;
  };
  /** a hook for the benchmark's camera path */
  onFrame: ((now: number, dt: number) => void) | null = null;

  private draw(now: number) {
    const z = this.cam.z, ze = z * this.dpr, gl = this.gl, cam = this.cam;
    const tier = z < PLANNER_Z ? 'planner' : z < DISTRICT_Z ? 'district' : 'street'; this.perf.tier = tier;
    gl.begin({ X: cam.X, Y: cam.Y, ze, cw: this.cw, ch: this.ch }, [0.106, 0.157, 0.086]);
    const X0 = cam.X - this.cw / 2 / ze, Y0 = cam.Y - this.ch / 2 / ze, X1 = cam.X + this.cw / 2 / ze, Y1 = cam.Y + this.ch / 2 / ze;
    const dist = (cx: number, cy: number) => Math.hypot(cx - cam.X, cy - cam.Y) * ze;
    // ---- planner map: the whole view at the planner tier, otherwise under any chunk not baked yet
    const pL = planLevelFor(ze), pi0 = Math.floor(X0 / PLAN_W), pi1 = Math.floor(X1 / PLAN_W), pj0 = Math.floor(Y0 / PLAN_H), pj1 = Math.floor(Y1 / PLAN_H);
    const drawPlan = () => {
      for (let j = pj0; j <= pj1; j++) for (let i = pi0; i <= pi1; i++) {
        const t = this.ground.tile('p', i, j); this.ground.need(t, pL, (tier === 'planner' ? 0 : 1e6) + dist((i + 0.5) * PLAN_W, (j + 0.5) * PLAN_H), now);
        if (t.tex) gl.drawChunk(t.tex, i * PLAN_W, j * PLAN_H, (i + 1) * PLAN_W, (j + 1) * PLAN_H);
      }
    };
    if (tier === 'planner') {
      drawPlan();
      // vehicles as dots coloured by type
      const tr = this.traffic;
      if (tr) {
        const pts = new Float32Array(tr.n * POINT_STRIDE); let n = 0;
        for (let i = 0; i < tr.n; i++) { if (!tr.alive[i]) continue; const X = worldX(tr.px[i], tr.py[i]), Y = worldY(tr.px[i], tr.py[i]); if (X < X0 || X > X1 || Y < Y0 || Y > Y1) continue; const c = CAR_COLOURS[tr.kind[i] % CAR_COLOURS.length], o = n * POINT_STRIDE; pts[o] = X; pts[o + 1] = Y; pts[o + 2] = c[0]; pts[o + 3] = c[1]; pts[o + 4] = c[2]; pts[o + 5] = 1; n++; }
        gl.upload(pts, n * POINT_STRIDE); gl.drawPoints(0, n, Math.max(1.5, Math.min(4, 5 * ze / 0.035)) * (this.dpr > 1 ? 1.5 : 1));
      }
    } else {
      // ---- ground: full chunks close up, district chunks (4 x 4, lite) further out
      const mid = z < MID_BELOW, kind = mid ? 'm' : 'g', CW = mid ? MID_W : CHUNK_W, CH = mid ? MID_H : CHUNK_H, L = mid ? midLevelFor(ze) : levelFor(ze);
      const i0 = Math.floor(X0 / CW), i1 = Math.floor(X1 / CW), j0 = Math.floor(Y0 / CH), j1 = Math.floor(Y1 / CH);
      // a chunk not baked yet shows its piece of the planner map meanwhile
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const t = this.ground.tile(kind, i, j); if (t.tex || t.prev) continue;
        const X = i * CW, Y = j * CH, pi = Math.floor(X / PLAN_W), pj = Math.floor(Y / PLAN_H), p = this.ground.tile('p', pi, pj);
        this.ground.need(p, pL, 1e6 + dist(X, Y), now);
        if (p.tex) gl.drawChunk(p.tex, X, Y, X + CW, Y + CH, false, 1, [(X - pi * PLAN_W) / PLAN_W, (Y - pj * PLAN_H) / PLAN_H, (X + CW - pi * PLAN_W) / PLAN_W, (Y + CH - pj * PLAN_H) / PLAN_H]);
      }
      const mask = this.revealMask(now); if (mask) gl.setMask(mask);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const t = this.ground.tile(kind, i, j);
        this.ground.need(t, L, dist((i + 0.5) * CW, (j + 0.5) * CH), now);
        const r = [i * CW, j * CH, (i + 1) * CW, (j + 1) * CH] as const;
        if (t.prev && now < t.prevUntil) { gl.drawChunk(t.prev, ...r); if (t.tex && t.tex !== t.prev && mask) gl.drawChunk(t.tex, ...r, true); }
        else if (t.tex) gl.drawChunk(t.tex, ...r);
      }
      // ---- sprites: every visible tile in one instanced draw (each instance clipped to its tile), vehicles merged in
      const vis: { i: number; j: number }[] = [];
      for (let j = Math.floor(Y0 / SPR_H); j <= Math.floor(Y1 / SPR_H); j++) for (let i = Math.floor(X0 / SPR_W); i <= Math.floor(X1 / SPR_W); i++) vis.push({ i, j });
      const c = [tileOf(X0, Y0), tileOf(X1, Y0), tileOf(X0, Y1), tileOf(X1, Y1)], pad = 6;
      // cars in tunnels are not drawn (the sim client skips them)
      const bx0 = Math.min(...c.map(p => p.x)) - pad, by0 = Math.min(...c.map(p => p.y)) - pad, bx1 = Math.max(...c.map(p => p.x)) + pad, by1 = Math.max(...c.map(p => p.y)) + pad;
      const cars: Drawable[] = this.traffic ? this.traffic.visible(bx0, by0, bx1, by1) : [];
      const movers = tier === 'street' && this.peds.n ? cars.concat(this.pedMovers(bx0, by0, bx1, by1)) : cars;
      this.plantForest(X0, Y0, X1, Y1);
      const f = this.sprites.frame(vis, movers), shadows = this.shadowStrength > 0;
      // car lights (night): lamps and beam glows of the cars in the same box, uploaded with the sprites
      const tr = this.traffic, lightOn = !!tr && cam.z >= 0.08;
      if (tr && lightOn && this.lightBuf.length < tr.n * 7 * POINT_STRIDE) this.lightBuf = new Float32Array(tr.n * 7 * POINT_STRIDE);
      const lt = tr && lightOn ? tr.lights(bx0, by0, bx1, by1, ze, Math.floor(now / 350) % 2 === 0, this.lightBuf) : null;
      const [sAt, pAt, lAt] = gl.uploadParts([[f.shadows, shadows ? f.shadowFloats : 0], [f.stream, f.floats], [this.lightBuf, lt ? (lt.small + lt.beams) * POINT_STRIDE : 0]]);
      // the cast shadows (cast-shadow.ts), faded out by night, then the contact shadows, then the sprites
      if (this.cast.on) { const sh = castShear(this.cast); gl.drawCast(pAt, f.floats / SPRITE_STRIDE, sh.sx, sh.sy, this.cast.strength * (1 - this.nightAmount())); }
      // the contact shadows lean toward the cast shadows' side (away from the sun): 6 px per metre of a shape's half extents at full length
      const lean = this.cast.on ? 6 * this.cast.length : 0, la = this.cast.angle * Math.PI / 180;
      if (shadows) gl.drawShadows(sAt, f.shadowFloats / SHADOW_STRIDE, this.shadowStrength, lean * Math.cos(la), lean * Math.sin(la));
      gl.drawSprites(pAt, f.floats / SPRITE_STRIDE, tier === 'district' ? 7 * this.dpr : 0);
      if (lt) { gl.drawPoints(lAt, lt.small, Math.max(2, 0.55 * 64 * ze), true); gl.drawPoints(lAt + lt.small * POINT_STRIDE, lt.beams, Math.max(4, 2.6 * 64 * ze), true); }
    }
    this.ground.pump(); this.ground.settle(now); this.ground.evict(now);
    this.syncParkCars(now);
    this.drawOverlay(now);
  }

  /** debug: the lane graph (white links, yellow connectors, cyan ring arcs, red conflict dots); lanes are drawn when an end is near the view */
  private drawLanes(ctx: CanvasRenderingContext2D) {
    const ze = this.cam.z * this.dpr, pad = 10;
    const c0 = tileOf(this.cam.X - this.cw / 2 / ze, this.cam.Y), c1 = tileOf(this.cam.X + this.cw / 2 / ze, this.cam.Y), top = tileOf(this.cam.X, this.cam.Y - this.ch / 2 / ze), bot = tileOf(this.cam.X, this.cam.Y + this.ch / 2 / ze);
    const x0 = Math.min(c0.x, top.x) - pad, x1 = Math.max(c1.x, bot.x) + pad, y0 = Math.min(c1.y, top.y) - pad, y1 = Math.max(c0.y, bot.y) + pad;
    const ok = (x: number, y: number) => x >= x0 && x <= x1 && y >= y0 && y <= y1, at = { x: 0, y: 0, hx: 0, hy: 0 };
    this.setIso(ctx); ctx.lineWidth = 0.08;
    for (const l of this.lanes.lanes) {
      if (!l) continue;
      const n = l.pts.length;
      if (!ok(l.pts[0], l.pts[1]) && !ok(l.pts[n - 2], l.pts[n - 1])) continue;
      if (l.kind === LK.LINK) ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      if (l.kind === LK.CONN) ctx.strokeStyle = '#ffd866';
      if (l.kind === LK.RING) ctx.strokeStyle = '#5ee6ff';
      ctx.beginPath(); ctx.moveTo(l.pts[0], l.pts[1]); for (let i = 2; i < n; i += 2) ctx.lineTo(l.pts[i], l.pts[i + 1]); ctx.stroke();
      for (const c of l.conflicts) {
        if (c.lane < l.id) continue;
        laneAt(l, c.s, at); ctx.fillStyle = '#ff4d4d'; ctx.beginPath(); ctx.arc(at.x, at.y, 0.15, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  /** debug (P): the parcels of the city worker in view: outline (amber at a corner), filled by use (EMPTY outline only, BUILDING at half alpha, declined darker), a dot at the frontage midpoint */
  private drawLots(ctx: CanvasRenderingContext2D) {
    const ze = this.cam.z * this.dpr, pad = 2;
    const c0 = tileOf(this.cam.X - this.cw / 2 / ze, this.cam.Y), c1 = tileOf(this.cam.X + this.cw / 2 / ze, this.cam.Y), top = tileOf(this.cam.X, this.cam.Y - this.ch / 2 / ze), bot = tileOf(this.cam.X, this.cam.Y + this.ch / 2 / ze);
    const x0 = Math.min(c0.x, top.x) - pad, x1 = Math.max(c1.x, bot.x) + pad, y0 = Math.min(c1.y, top.y) - pad, y1 = Math.max(c0.y, bot.y) + pad;
    // the lots are not indexed here: cull by the centre against the view (a lot reaches at most 24 tiles from its centre)
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, R = Math.max(x1 - x0, y1 - y0) / 2 + 24;
    this.setIso(ctx); ctx.lineWidth = 0.08;
    for (const l of this.traffic.lots.values()) {
      const ox = l.o[0], oy = l.o[1], ux = l.u[0] * l.w, uy = l.u[1] * l.w, nx = l.n[0] * l.d, ny = l.n[1] * l.d;
      if (Math.abs(ox + (ux + nx) / 2 - cx) > R || Math.abs(oy + (uy + ny) / 2 - cy) > R) continue;
      ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox + ux, oy + uy); ctx.lineTo(ox + ux + nx, oy + uy + ny); ctx.lineTo(ox + nx, oy + ny); ctx.closePath();
      if (l.level !== LV.EMPTY) { ctx.globalAlpha = l.level === LV.BUILDING ? 0.5 : 1; ctx.fillStyle = LOT_FILL[l.use * 4 + l.decline]!; ctx.fill(); ctx.globalAlpha = 1; }
      ctx.strokeStyle = l.corner ? 'rgba(255,176,32,0.9)' : 'rgba(255,255,255,0.5)'; ctx.stroke();
      ctx.fillStyle = ctx.strokeStyle; ctx.beginPath(); ctx.arc(ox + ux / 2, oy + uy / 2, 0.2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  /** the signal heads of the junctions in view (Street tier): a disc per arm at its stop line, green, amber or red at the sim's time */
  private drawSignals(ctx: CanvasRenderingContext2D) {
    const traffic = this.traffic; if (!traffic) return;
    const ze = this.cam.z * this.dpr, pad = 4;
    const c0 = tileOf(this.cam.X - this.cw / 2 / ze, this.cam.Y), c1 = tileOf(this.cam.X + this.cw / 2 / ze, this.cam.Y), top = tileOf(this.cam.X, this.cam.Y - this.ch / 2 / ze), bot = tileOf(this.cam.X, this.cam.Y + this.ch / 2 / ze);
    const x0 = Math.min(c0.x, top.x) - pad, x1 = Math.max(c1.x, bot.x) + pad, y0 = Math.min(c1.y, top.y) - pad, y1 = Math.max(c0.y, bot.y) + pad;
    this.setIso(ctx);
    for (const p of this.lanes.signals.values()) {
      const n = p.node;
      if (n.x < x0 || n.x > x1 || n.y < y0 || n.y > y1) continue;
      // the worker's runtime state of the plan (the phase served, the stage); red for all when none is known yet
      let key = this.sigKeys.get(p); if (key === undefined) { key = sigKey(n.x, n.y); this.sigKeys.set(p, key); }
      const sg = traffic.sigs.get(key);
      for (let i = 0; i < n.arms.length; i++) {
        const a = n.arms[i], inset = a.stop >= 0 ? a.stop : a.reachEdge, st = sg ? shown(p.armPhase[i]!, sg.idx, sg.stage) : SIG.RED;
        const x = n.x + a.dir.x * inset + a.nrm.x * a.h * 0.75, y = n.y + a.dir.y * inset + a.nrm.y * a.h * 0.75;
        ctx.fillStyle = st === 0 ? '#3ddc84' : st === 1 ? '#ffb020' : '#ff3b3b';
        ctx.beginPath(); ctx.arc(x, y, 0.35, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  /** the traffic incidents (SimClient.incidents, 3 floats each: x, y in tiles, kind 1 crash or 0 breakdown): a red warning triangle for a crash, amber
   *  for a breakdown, on the lane where it stands, in screen space; culled to the view (drawn at the street and district tiers, with the signals) */
  private drawIncidents(ctx: CanvasRenderingContext2D) {
    const F = this.traffic.incidents, dpr = this.dpr, r = 9 * dpr;
    if (!F.length) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (let k = 0; k + 2 < F.length; k += 3) {
      const p = this.screen(F[k]!, F[k + 1]!);
      if (p.x < -r || p.x > this.cw + r || p.y < -r || p.y > this.ch + r) continue;
      ctx.beginPath(); ctx.moveTo(p.x, p.y - r); ctx.lineTo(p.x + r * 0.9, p.y + r * 0.6); ctx.lineTo(p.x - r * 0.9, p.y + r * 0.6); ctx.closePath();
      ctx.fillStyle = F[k + 2] === 1 ? '#ff3b3b' : '#ffb020'; ctx.fill();
      ctx.lineWidth = 1.5 * dpr; ctx.strokeStyle = 'rgba(2,6,23,0.9)'; ctx.stroke();
    }
  }
  /** the natural disaster under way (SimClient.disasters): its area as a translucent polygon in its colour, and a red X on each closed road's midpoint (a
   *  quake's closure that can be paid for also has a ring: a click on it repairs it, see repairAt); at the district and street tiers */
  private drawDisasters(ctx: CanvasRenderingContext2D) {
    const D = this.traffic.disasters; if (!D.length) return;
    const dpr = this.dpr, r = 6 * dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (const d of D) {
      const A = d.area, col = DISASTER_COL[d.kind];
      if (A.length >= 6) {
        ctx.beginPath();
        for (let k = 0; k + 1 < A.length; k += 2) { const p = this.screen(A[k]!, A[k + 1]!); if (k) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); }
        ctx.closePath(); ctx.globalAlpha = 0.22; ctx.fillStyle = col; ctx.fill();
        ctx.globalAlpha = 0.7; ctx.lineWidth = 1.5 * dpr; ctx.strokeStyle = col; ctx.stroke();
      }
      for (const c of d.closures) {
        const p = this.screen(c.x, c.y);
        ctx.globalAlpha = 1; ctx.beginPath();
        ctx.moveTo(p.x - r, p.y - r); ctx.lineTo(p.x + r, p.y + r); ctx.moveTo(p.x + r, p.y - r); ctx.lineTo(p.x - r, p.y + r);
        ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 2.5 * dpr; ctx.stroke();
        if (c.repair) { ctx.beginPath(); ctx.arc(p.x, p.y, r * 1.8, 0, Math.PI * 2); ctx.strokeStyle = col; ctx.lineWidth = 1.5 * dpr; ctx.stroke(); }
      }
    }
    ctx.globalAlpha = 1;
  }
  /** a click (CSS px) on the ring of a closure that can be paid for (a quake's): asks the worker to repair it (it charges, or notes it unpaid); true if hit */
  private repairAt(mx: number, my: number): boolean {
    const dpr = this.dpr;
    for (const d of this.traffic.disasters) for (const c of d.closures) {
      if (!c.repair) continue;
      const p = this.screen(c.x, c.y);
      if (Math.hypot(p.x / dpr - mx, p.y / dpr - my) > 11) continue;
      this.traffic.repairDisaster(d.id, c.key); return true;
    }
    return false;
  }
  /** the traffic flow (key F): the congestion over time (drawHeatHist) or the live heat map (drawHeat, see flowMode) when the worker's geometry and heat are in, then the focus ring of a jump (4 s) */
  private drawFlow(ctx: CanvasRenderingContext2D) {
    const tr = this.traffic, G = tr.heatGeom, R = tr.heatRatio, D = tr.heatDens, H = tr.heatHist, now = performance.now();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (this.showFlow && G) { if (this.flowMode === 'time') { if (H) this.drawHeatHist(ctx, G, H); } else if (R && D) this.drawHeat(ctx, G, R, D, now); }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.lineCap = 'butt';
    const fo = this.focus, age = fo ? now - fo.t : Infinity;
    if (fo && age < 4000) {
      const s = this.screen(fo.x, fo.y), r = (18 + 10 * Math.sin(age / 1000 * Math.PI * 2)) * this.dpr;
      ctx.globalAlpha = 1 - age / 4000; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 * this.dpr;
      ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
    }
  }
  /** the congestion heat map (SimClient.heatGeom, heatRatio, heatDens): each direction of each road with traffic (1 vehicle per km per lane or more), on its own
   *  side of the road, in the band of its speed against the limit (Flowing 0.75+, Slow, Heavy, Stopped under 0.25; worst drawn last, on top): a glow, then a core.
   *  Screen space, one path per band and lane count (so each has its width), culled to the view; the keys are counting-sorted into the scratch arrays (no allocation) */
  private drawHeat(ctx: CanvasRenderingContext2D, G: Float32Array, R: Float32Array, D: Float32Array, now: number) {
    const ze = this.cam.z * this.dpr, cX = this.cam.X, cY = this.cam.Y, cw2 = this.cw / 2, ch2 = this.ch / 2, pad = 4;
    const c0 = tileOf(this.cam.X - this.cw / 2 / ze, this.cam.Y), c1 = tileOf(this.cam.X + this.cw / 2 / ze, this.cam.Y), top = tileOf(this.cam.X, this.cam.Y - this.ch / 2 / ze), bot = tileOf(this.cam.X, this.cam.Y + this.ch / 2 / ze);
    const x0 = Math.min(c0.x, top.x) - pad, x1 = Math.max(c1.x, bot.x) + pad, y0 = Math.min(c1.y, top.y) - pad, y1 = Math.max(c0.y, bot.y) + pad;
    const nD = Math.min(G.length / 6, R.length, D.length) | 0;
    if (this.heatKey.length < nD) { this.heatKey = new Uint8Array(nD); this.heatOrd = new Int32Array(nD); }
    const K = this.heatKey, ord = this.heatOrd, cnt = this.heatCnt, start = this.heatStart, fill = this.heatFill;
    // pass 1: the key of each dseg drawn (dead ids are NaN, no traffic is density under 1): band * 8 + lanes - 1, lanes 1 to 8
    cnt.fill(0);
    for (let d = 0; d < nD; d++) {
      const o = 6 * d, fx = G[o]!, fy = G[o + 1]!, tx = G[o + 2]!, ty = G[o + 3]!;
      K[d] = 255;
      if (Number.isNaN(fx) || D[d]! < 1 || Math.max(fx, tx) < x0 || Math.min(fx, tx) > x1 || Math.max(fy, ty) < y0 || Math.min(fy, ty) > y1) continue;
      const r = R[d]!, band = r >= 0.75 ? 0 : r >= 0.5 ? 1 : r >= 0.25 ? 2 : 3, lanes = Math.min(8, Math.max(1, G[o + 5]! | 0));
      const k = band * 8 + lanes - 1;
      K[d] = k; cnt[k] = cnt[k]! + 1;
    }
    // pass 2: the start of each key in ord; pass 3: the dsegs of each key, in dseg order
    let s = 0;
    for (let k = 0; k < 32; k++) { start[k] = s; fill[k] = s; s += cnt[k]!; }
    for (let d = 0; d < nD; d++) { const k = K[d]!; if (k !== 255) { const p = fill[k]!; fill[k] = p + 1; ord[p] = d; } }
    const zf = clamp(this.cam.z / 0.12, 0.6, 1.6), pulse = 0.85 + 0.15 * Math.sin(now / 1000 * Math.PI * 2);
    ctx.lineCap = 'round';
    for (let band = 0; band < 4; band++) for (let ln = 0; ln < 8; ln++) {
      const k = band * 8 + ln, n0 = start[k]!, n1 = n0 + cnt[k]!;
      if (n1 === n0) continue;
      // device px: 2.2 px a lane at the 0.12 zoom tier and up, scaled with the zoom, 2 to 9 px
      const w = clamp((ln + 1) * 2.2 * zf, 2, 9) * this.dpr;
      ctx.beginPath();
      for (let j = n0; j < n1; j++) {
        const o = 6 * ord[j]!, fx = G[o]!, fy = G[o + 1]!, tx = G[o + 2]!, ty = G[o + 3]!, dx = tx - fx, dy = ty - fy, L = Math.hypot(dx, dy) || 1, off = G[o + 4]!;
        // the lanes' centre: off tiles along perp(u) = (-uy, ux), u = (dx, dy) / L
        const ox = -dy / L * off, oy = dx / L * off;
        ctx.moveTo((worldX(fx + ox, fy + oy) - cX) * ze + cw2, (worldY(fx + ox, fy + oy) - cY) * ze + ch2);
        ctx.lineTo((worldX(tx + ox, ty + oy) - cX) * ze + cw2, (worldY(tx + ox, ty + oy) - cY) * ze + ch2);
      }
      ctx.strokeStyle = HEAT_COLS[band]!;
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = band === 0 ? 0.06 : 0.18; ctx.lineWidth = 3 * w; ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = band === 0 ? 0.45 : band === 1 ? 0.9 : band === 2 ? 0.95 : pulse;
      ctx.lineWidth = band === 3 ? 1.4 * w : w; ctx.stroke();
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
  /** the congestion over time (SimClient.heatHist: the delay per lane-km, an EMA of about 6 game hours): each dseg with a mean delay of one stopped car
   *  per lane-km or more (H >= 1) gets a glow along its lanes' side, coloured and widened by k = log2(H) / log2(60) (see HIST_GLOW). Screen space, one path per
   *  bin, hot bins drawn last (on top); culled to the view as drawHeat, the ids counting-sorted into the scratch arrays (no allocation) */
  private drawHeatHist(ctx: CanvasRenderingContext2D, G: Float32Array, H: Float32Array) {
    const ze = this.cam.z * this.dpr, cX = this.cam.X, cY = this.cam.Y, cw2 = this.cw / 2, ch2 = this.ch / 2, pad = 4;
    const c0 = tileOf(this.cam.X - this.cw / 2 / ze, this.cam.Y), c1 = tileOf(this.cam.X + this.cw / 2 / ze, this.cam.Y), top = tileOf(this.cam.X, this.cam.Y - this.ch / 2 / ze), bot = tileOf(this.cam.X, this.cam.Y + this.ch / 2 / ze);
    const x0 = Math.min(c0.x, top.x) - pad, x1 = Math.max(c1.x, bot.x) + pad, y0 = Math.min(c1.y, top.y) - pad, y1 = Math.max(c0.y, bot.y) + pad;
    const nD = Math.min(G.length / 6, H.length) | 0;
    if (this.histKey.length < nD) { this.histKey = new Uint8Array(nD); this.histOrd = new Int32Array(nD); }
    const K = this.histKey, ord = this.histOrd, cnt = this.histCnt, start = this.histStart, fill = this.histFill;
    // pass 1: the bin of each dseg drawn (dead ids are NaN, under a delay of 1 is not drawn): 255 = none
    cnt.fill(0);
    for (let d = 0; d < nD; d++) {
      const o = 6 * d, fx = G[o]!, fy = G[o + 1]!, tx = G[o + 2]!, ty = G[o + 3]!;
      K[d] = 255;
      if (Number.isNaN(fx) || H[d]! < 1 || Math.max(fx, tx) < x0 || Math.min(fx, tx) > x1 || Math.max(fy, ty) < y0 || Math.min(fy, ty) > y1) continue;
      const b = Math.min(HIST_BINS - 1, Math.floor(clamp(Math.log2(H[d]!) / HIST_LOG, 0, 1) * HIST_BINS));
      K[d] = b; cnt[b] = cnt[b]! + 1;
    }
    // pass 2: the start of each bin in ord; pass 3: the dsegs of each bin, in dseg order
    let s = 0;
    for (let b = 0; b < HIST_BINS; b++) { start[b] = s; fill[b] = s; s += cnt[b]!; }
    for (let d = 0; d < nD; d++) { const b = K[d]!; if (b !== 255) { const p = fill[b]!; fill[b] = p + 1; ord[p] = d; } }
    ctx.lineCap = 'round';
    for (let b = 0; b < HIST_BINS; b++) {
      const n0 = start[b]!, n1 = n0 + cnt[b]!;
      if (n1 === n0) continue;
      const k = (b + 0.5) / HIST_BINS, w = (6 + 14 * k) * this.dpr;
      ctx.beginPath();
      for (let j = n0; j < n1; j++) {
        const o = 6 * ord[j]!, fx = G[o]!, fy = G[o + 1]!, tx = G[o + 2]!, ty = G[o + 3]!, dx = tx - fx, dy = ty - fy, L = Math.hypot(dx, dy) || 1, off = G[o + 4]!;
        const ox = -dy / L * off, oy = dx / L * off;
        ctx.moveTo((worldX(fx + ox, fy + oy) - cX) * ze + cw2, (worldY(fx + ox, fy + oy) - cY) * ze + ch2);
        ctx.lineTo((worldX(tx + ox, ty + oy) - cX) * ze + cw2, (worldY(tx + ox, ty + oy) - cY) * ze + ch2);
      }
      ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = HIST_GLOW[b]!; ctx.lineWidth = w; ctx.stroke();
      ctx.globalCompositeOperation = 'source-over'; ctx.strokeStyle = HIST_CORE[b]!; ctx.lineWidth = 0.4 * w; ctx.stroke();
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
  /** the parking demand (SimClient.parkDemand, the Car park panel's toggle): each PD_CELL cell with 0.5 cars per game hour or more, shaded blue (low)
   *  to red (high) by its bin (PD_FILL); at the district and street tiers the cells over 5 are labelled with their cars per game hour (rounded).
   *  Supply (bays) is not drawn here */
  private drawParkDemand(ctx: CanvasRenderingContext2D) {
    const PD = this.traffic.parkDemand; if (!PD) return;
    const N = MAP / PD_CELL, dpr = this.dpr;
    this.setIso(ctx);
    for (let c = 0; c < PD.length; c++) {
      const v = PD[c]!; if (v < 0.5) continue;
      ctx.fillStyle = PD_FILL[Math.min(PD_BINS - 1, Math.floor(clamp(Math.log2(1 + v) / PD_LOG, 0, 1) * PD_BINS))]!;
      ctx.fillRect((c % N) * PD_CELL, ((c / N) | 0) * PD_CELL, PD_CELL, PD_CELL);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (this.cam.z < DISTRICT_Z) return;
    ctx.font = `bold ${11 * dpr}px sans-serif`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.lineJoin = 'round'; ctx.lineWidth = 3 * dpr; ctx.strokeStyle = '#0f172a'; ctx.fillStyle = '#fff';
    for (let c = 0; c < PD.length; c++) {
      const v = PD[c]!; if (v <= 5) continue;
      const p = this.screen((c % N) * PD_CELL + PD_CELL / 2, ((c / N) | 0) * PD_CELL + PD_CELL / 2), t = String(Math.round(v));
      const x = p.x - ctx.measureText(t).width / 2;
      ctx.strokeText(t, x, p.y); ctx.fillText(t, x, p.y);
    }
  }
  /** the car inspector and the junction routes (see SimClient.car and .watch): the inspected car's route ahead (cyan, dashed after its first
   *  stretch), its origin (blue) and destination (orange) dots, and a ring on the car; the watched junction's recorded crossings, from their
   *  origins (blue) and to their destinations (orange), and a ring on the junction */
  private drawInspect(ctx: CanvasRenderingContext2D) {
    const tr = this.traffic, c = tr.car, w = tr.watch, jn = w && w.node ? w.node : null;
    if (!c && !jn) return;
    this.setIso(ctx); ctx.globalAlpha = 0.9; ctx.strokeStyle = '#22d3ee'; ctx.lineWidth = 0.5;
    if (c) {
      const P = c.path;
      ctx.beginPath(); ctx.moveTo(P[0]!, P[1]!); ctx.lineTo(P[2]!, P[3]!); ctx.stroke();
      ctx.setLineDash([1.2, 0.8]); ctx.beginPath(); ctx.moveTo(P[2]!, P[3]!);
      for (let k = 4; k + 1 < P.length; k += 2) ctx.lineTo(P[k]!, P[k + 1]!);
      ctx.stroke(); ctx.setLineDash([]);
    }
    if (jn && w) {
      const L = w.lines, jx = jn[0], jy = jn[1];
      ctx.lineWidth = 0.35; ctx.globalAlpha = 0.3;
      ctx.strokeStyle = '#60a5fa'; ctx.beginPath(); for (let k = 0; k + 3 < L.length; k += 4) { ctx.moveTo(L[k]!, L[k + 1]!); ctx.lineTo(jx, jy); } ctx.stroke();
      ctx.strokeStyle = '#fb923c'; ctx.beginPath(); for (let k = 0; k + 3 < L.length; k += 4) { ctx.moveTo(jx, jy); ctx.lineTo(L[k + 2]!, L[k + 3]!); } ctx.stroke();
    }
    ctx.globalAlpha = 1; ctx.setTransform(1, 0, 0, 1, 0, 0);
    const dpr = this.dpr;
    if (c) {
      const i = this.inspecting, live = tr.alive[i] === 1, a = this.screen(c.ox, c.oy), b = this.screen(c.dx, c.dy), cs = live ? this.screen(tr.px[i]!, tr.py[i]!) : this.screen(c.x, c.y);
      disc(ctx, a.x, a.y, 6 * dpr, '#60a5fa'); disc(ctx, b.x, b.y, 6 * dpr, '#fb923c');
      ctx.beginPath(); ctx.arc(cs.x, cs.y, 12 * dpr, 0, Math.PI * 2); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 * dpr; ctx.stroke();
    }
    if (jn) { const s = this.screen(jn[0], jn[1]); ctx.beginPath(); ctx.arc(s.x, s.y, 12 * dpr, 0, Math.PI * 2); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 * dpr; ctx.stroke(); }
  }
  private drawOverlay(now: number) {
    const ctx = this.ov, ze = this.cam.z * this.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, this.cw, this.ch);
    if (this.showGrid && this.cam.z > 0.12) {
      const c0 = tileOf(this.cam.X - this.cw / 2 / ze, this.cam.Y), c1 = tileOf(this.cam.X + this.cw / 2 / ze, this.cam.Y), top = tileOf(this.cam.X, this.cam.Y - this.ch / 2 / ze), bot = tileOf(this.cam.X, this.cam.Y + this.ch / 2 / ze);
      const x0 = clamp(Math.floor(Math.min(c0.x, top.x)), 0, MAP), x1 = clamp(Math.ceil(Math.max(c1.x, bot.x)), 0, MAP), y0 = clamp(Math.floor(Math.min(c1.y, top.y)), 0, MAP), y1 = clamp(Math.ceil(Math.max(c0.y, bot.y)), 0, MAP);
      this.setIso(ctx); ctx.beginPath();
      for (let x = x0; x <= x1; x++) { ctx.moveTo(x, y0); ctx.lineTo(x, y1); } for (let y = y0; y <= y1; y++) { ctx.moveTo(x0, y); ctx.lineTo(x1, y); }
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1; ctx.stroke();
    }
    if (this.showLanes && this.cam.z > 0.12) this.drawLanes(ctx);
    if (this.showLots && this.cam.z > 0.06) this.drawLots(ctx);
    if (this.showAccess || this.cam.z < PLANNER_Z) this.drawAccess(ctx);
    if (this.cam.z < DISTRICT_Z) this.drawTownNames(ctx);
    if (this.traffic && this.cam.z >= DISTRICT_Z) { this.drawDisasters(ctx); this.drawSignals(ctx); this.drawIncidents(ctx); }
    if (this.tool === 'junction') { if (this.cam.z >= PLANNER_Z) this.drawJunctionBadges(ctx); this.drawSelectedJunction(ctx); }
    this.drawFlow(ctx);
    if (this.showParkDemand) this.drawParkDemand(ctx);
    this.drawInspect(ctx);
    this.drawGroundOverlays(ctx);
    this.drawStadium(ctx);
    this.drawBusinesses(ctx);
    this.drawParks(ctx);
    this.drawParkPreview(ctx);
    this.drawBuses(ctx);
    this.drawGalleries(ctx);
    this.drawWalkers(ctx, now);
    if (this.grassPanel) {
      const s = this.grassScope();
      if (s) {
        const polygon = s.zone && this.grass.polygon(s.zone); ctx.beginPath();
        if (polygon) { for (let k = 0; k < polygon.length; k += 2) { const p = this.screen(polygon[k], polygon[k + 1]); if (!k) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); } }
        else for (let k = 0; k < 48; k++) { const angle = k * Math.PI / 24, p = this.screen(s.x + Math.cos(angle) * s.radius, s.y + Math.sin(angle) * s.radius); if (!k) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); }
        ctx.closePath(); ctx.strokeStyle = '#86efac'; ctx.lineWidth = 2 * this.dpr; ctx.stroke();
      }
    }
    this.drawTolls(ctx);
    this.drawTollPreview(ctx);
    this.drawBizPreview(ctx);
    this.drawEventGhosts(ctx);
    this.drawBusPreview(ctx);
    for (const p of [this.selected, this.hoverProp]) {
      if (!p) continue;
      this.setIso(ctx); ctx.beginPath(); ctx.rect(p.x0, p.y0, p.x1 - p.x0, p.y1 - p.y0); ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = p === this.selected ? 'rgba(255,190,60,0.25)' : 'rgba(255,255,255,0.12)'; ctx.fill(); ctx.strokeStyle = p === this.selected ? '#ffbe3c' : 'rgba(255,255,255,0.6)'; ctx.lineWidth = 2; ctx.stroke();
    }
    // construction front: striped barrier, cones and dust
    for (const b of this.builds) {
      const front = this.revealFront(b, now); if (front >= b.total) continue;
      b.legs.forEach((l, i) => {
        const d = sub(l.b, l.a), len = vlen(d), rl = front - b.cum[i]; if (rl < 0 || rl > len) return;
        const u = mul(d, 1 / len), n = perp(u), f = add(l.a, mul(u, rl)), w = b.cls.h * 2, dd = 0.35;
        this.setIso(ctx); ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(Math.atan2(u.y, u.x));
        ctx.fillStyle = '#f2b632'; ctx.fillRect(-dd / 2, -w / 2, dd, w);
        ctx.fillStyle = '#1a1a1a'; for (let s = -w / 2; s < w / 2; s += 0.8) ctx.fillRect(-dd / 2, s, dd, 0.4);
        ctx.restore(); ctx.setTransform(1, 0, 0, 1, 0, 0);
        for (const t of [-b.cls.h + 0.4, b.cls.h - 0.4]) {
          const q = add(f, mul(n, t)), c = this.screen(q.x, q.y), hgt = 0.5 * HH * ze * 2.2, bw = 0.25 * HW * ze;
          ctx.fillStyle = '#ff7a1a'; ctx.beginPath(); ctx.moveTo(c.x, c.y - hgt); ctx.lineTo(c.x + bw, c.y); ctx.lineTo(c.x - bw, c.y); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#fff'; ctx.fillRect(c.x - bw * 0.5, c.y - hgt * 0.55, bw, hgt * 0.15);
        }
      });
    }
    for (const p of this.particles) {
      const s = this.screen(p.x, p.y), a = (1 - p.age / p.life) * 0.5, r = p.r * HW * ze;
      ctx.fillStyle = `rgba(214,190,150,${a.toFixed(3)})`; ctx.beginPath(); ctx.ellipse(s.x, s.y - p.z * HH * ze * 1.5, r, r * 0.7, 0, 0, Math.PI * 2); ctx.fill();
    }
    this.drawNight(ctx, now);
  }

  /** the map's three town names at the district and planner tiers: white with a dark outline, centred on each town site (screen px) */
  private drawTownNames(ctx: CanvasRenderingContext2D) {
    const dpr = this.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.font = `bold ${16 * dpr}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round'; ctx.lineWidth = 4 * dpr; ctx.strokeStyle = '#0f172a'; ctx.fillStyle = '#ffffff';
    this.townPts.forEach((c, i) => {
      const s = this.screen(c.x, c.y), label = this.names.town(i);
      ctx.strokeText(label, s.x, s.y); ctx.fillText(label, s.x, s.y);
    });
    ctx.textAlign = 'left';
  }

  /** the access overlay: each zone (128 tiles square) with a built lot, shaded by its access: green below 1.3, amber to 1.8, red above (25% alpha),
   *  with a red edge over 1.8; at the district and planner tiers each built zone is labelled with its growth (+started, −declining; growth stopped over 1.8) */
  private drawAccess(ctx: CanvasRenderingContext2D) {
    const T = this.traffic;
    this.growthNow();
    this.setIso(ctx);
    for (let z = 0; z < 256; z++) {
      if (!T.builtZone[z]) continue;
      const a = T.access[z]!, x0 = (z & 15) * 128, y0 = (z >> 4) * 128;
      ctx.fillStyle = a < 1.3 ? 'rgba(61,220,132,0.16)' : a <= 1.8 ? 'rgba(255,176,32,0.16)' : 'rgba(255,59,59,0.16)';
      ctx.fillRect(x0, y0, 128, 128);
      if (a > 1.8) { ctx.strokeStyle = 'rgba(255,59,59,0.6)'; ctx.lineWidth = 3 / (HW * this.cam.z * this.dpr); ctx.strokeRect(x0, y0, 128, 128); }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (this.cam.z < DISTRICT_Z) {
      // the labels in screen px, at each built zone's centre: started (green) and declining (red); growth stopped under them
      const dpr = this.dpr;
      ctx.font = `bold ${12 * dpr}px sans-serif`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.lineJoin = 'round'; ctx.lineWidth = 3 * dpr; ctx.strokeStyle = '#0f172a';
      for (let z = 0; z < 256; z++) {
        if (!T.builtZone[z]) continue;
        const g = this.growN[z]!, d = this.declN[z]!, stop = T.access[z]! > 1.8;
        if (!g && !d && !stop) continue;
        const c = this.screen((z & 15) * 128 + 64, (z >> 4) * 128 + 64), a = g ? `+${g}` : '', b = d ? ` −${d}` : '';
        let x = c.x - ctx.measureText(a + b).width / 2;
        if (a) x = labelPiece(ctx, a, x, c.y, '#3ddc84');
        if (b) labelPiece(ctx, b, x, c.y, '#ff3b3b');
        if (stop) { const s = 'growth stopped'; labelPiece(ctx, s, c.x - ctx.measureText(s).width / 2, c.y + (a || b ? 15 * dpr : 0), '#ff3b3b'); }
      }
    }
  }

  /** Stadium label; the planner retains a footprint while detail tiers use the sorted artwork. */
  private drawStadium(ctx: CanvasRenderingContext2D) {
    const s = this.site; if (!s) return;
    if (this.cam.z < PLANNER_Z) this.drawSite(ctx, s, 'rgba(150,160,175,0.55)');
    const dpr = this.dpr, c = this.screen(s.c.x, s.c.y), label = `STADIUM · L${this.traffic.round.level}`;
    ctx.font = `bold ${13 * dpr}px ui-sans-serif, system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round'; ctx.lineWidth = 4 * dpr; ctx.strokeStyle = 'rgba(2,6,23,0.9)'; ctx.strokeText(label, c.x, c.y);
    ctx.fillStyle = '#f8fafc'; ctx.fillText(label, c.x, c.y);
    ctx.lineJoin = 'miter'; ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
  }
  /** a stadium site drawn: the footprint in fill, its pitch inset 8 tiles, the outline and the 4 doors (the placed stadium and the business ghost) */
  private drawSite(ctx: CanvasRenderingContext2D, s: Site, fill: string) {
    const dpr = this.dpr, I = 8;
    const rect = (x: number, y: number, w: number, h: number) => { this.setIso(ctx); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.setTransform(1, 0, 0, 1, 0, 0); };
    rect(s.x, s.y, s.w, s.h); ctx.fillStyle = fill; ctx.fill();
    rect(s.x + I, s.y + I, s.w - 2 * I, s.h - 2 * I); ctx.fillStyle = 'rgba(70,140,70,0.55)'; ctx.fill();
    rect(s.x, s.y, s.w, s.h); ctx.strokeStyle = '#e9edf2'; ctx.lineWidth = 2 * dpr; ctx.stroke();
    ctx.fillStyle = '#ffbe3c';
    for (const d of s.doors) { const p = this.screen(d.x, d.y); ctx.beginPath(); ctx.arc(p.x, p.y, 6 * dpr, 0, Math.PI * 2); ctx.fill(); }
  }
  /** a business's rect drawn: its fill and the white outline (the placeholder art, until Phase 8) */
  private drawBizRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill: string) {
    this.setIso(ctx); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = '#e9edf2'; ctx.lineWidth = 2 * this.dpr; ctx.stroke();
  }
  /** Placed business labels; footprint fills only at planner zoom, below the detailed artwork tier. */
  private drawBusinesses(ctx: CanvasRenderingContext2D) {
    const dpr = this.dpr;
    for (const d of this.bizDefs) {
      if (d.type === 'stadium') continue;
      const B = BUSINESS[d.type], c = this.screen(d.x + d.w / 2, d.y + d.h / 2), label = `${B.name.toUpperCase()} · L${this.traffic.biz.find(v => v.id === d.id)?.level ?? 1}`;
      if (this.cam.z < PLANNER_Z) this.drawBizRect(ctx, d.x, d.y, d.w, d.h, FAMILY_FILL[B.family]);
      ctx.font = `bold ${11 * dpr}px ui-sans-serif, system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round'; ctx.lineWidth = 3 * dpr; ctx.strokeStyle = 'rgba(2,6,23,0.9)'; ctx.strokeText(label, c.x, c.y);
      ctx.fillStyle = '#f8fafc'; ctx.fillText(label, c.x, c.y);
      ctx.lineJoin = 'miter'; ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
    }
  }
  /** the business tool's ghost at the cursor: the footprint (green where it can go, else red; the stadium's with its doors) and the reason beside the cursor if
   *  it cannot. With the type in hand at its max only the hint shows (a red footprint would hide the real one) */
  private drawBizPreview(ctx: CanvasRenderingContext2D) {
    const h = this.bizHover; if (!h) return;
    if (this.bizCount(this.bizType) < BUSINESS[this.bizType].max) {
      const fill = h.why ? 'rgba(230,80,80,0.35)' : 'rgba(60,200,90,0.35)';
      if (this.bizType === 'stadium') this.drawSite(ctx, h.site, fill); else this.drawBizRect(ctx, h.def.x, h.def.y, h.def.w, h.def.h, fill);
      // Use the same composition and projection as the placed business, over its validity footprint.
      const ze = this.cam.z * this.dpr;
      ctx.save(); ctx.globalAlpha = h.why ? .35 : .65;
      for (const p of businessArt(h.def, LIBRARY, LIB_INDEX)) {
        const it = LIBRARY[p.item], [page, u0, v0, u1, v1] = it.tex, image = this.pageImages[page];
        if (!image?.naturalWidth) continue;
        const r = spriteRect(p), x = (r[0] - this.cam.X) * ze + this.cw / 2, y = (r[1] - this.cam.Y) * ze + this.ch / 2;
        const w = (r[2] - r[0]) * ze, height = (r[3] - r[1]) * ze;
        ctx.save(); ctx.translate(p.flip ? x + w : x, y); if (p.flip) ctx.scale(-1, 1);
        ctx.drawImage(image, u0 * image.naturalWidth, v0 * image.naturalHeight, (u1 - u0) * image.naturalWidth, (v1 - v0) * image.naturalHeight, 0, 0, w, height); ctx.restore();
      }
      ctx.restore();
    }
    if (h.why) this.hintAt(ctx, h.mx, h.my, h.why, true);
  }
  /** the overlay view the shared ghost drawers take (T019/T020) */
  private ghostView(ctx: CanvasRenderingContext2D): GhostView {
    return { ctx, setIso: c => this.setIso(c as CanvasRenderingContext2D), screen: (x, y) => this.screen(x, y), dpr: this.dpr };
  }
  /** the Event tool's and the Holes tool's ghosts at the cursor (T019): the pending structure's footprint or the selected marker's ring, green when the click would succeed, else red, with its one-line label; rebuilt only when the hover spot or the course changes */
  private drawEventGhosts(ctx: CanvasRenderingContext2D) {
    const h = this.hover, m = this.ghostMouse, g = this.golf; if (!h || !m || !g) return;
    let key = '', make: (() => GhostBlueprint) | null = null;
    if (this.eventTool && this.eventStructurePending) {
      const p = this.eventStructurePending, cand = { typeId: p.typeId, mode: p.mode, x: Math.round(h.x), y: Math.round(h.y) };
      key = `s|${p.typeId}|${p.mode}|${cand.x}|${cand.y}|${this.money}|${this.paint.areas.length}|${(g.structures ?? []).length}`;
      make = () => structureGhost(structureRect(cand), this.structureCheck(cand), this.money, STRUCTURE[p.typeId]?.name ?? p.typeId, p.mode);
    } else if (this.holesTool && this.selectedGolfMarker) {
      const s = this.selectedGolfMarker;
      key = `m|${s.hole}|${s.kind}|${h.x}|${h.y}|${this.paint.areas.length}`;
      make = () => markerGhost(h.x, h.y, s.hole, s.kind, validateMarkerPlacement(this.paint.areas.map(a => ({ id: a.id, surface: surfaceOfTex(a.tex) ?? 'other', pts: a.pts })), s.kind, h.x, h.y));
    }
    if (!make) return;
    if (this.ghostCache?.key !== key) this.ghostCache = { key, bp: make() };
    drawGhostBlueprint(this.ghostView(ctx), this.ghostCache.bp, m.mx, m.my);
  }
  /** a hint label beside the cursor at (mx, my) (screen px, as the tools' why): the text in red when bad, else green */
  private hintAt(ctx: CanvasRenderingContext2D, mx: number, my: number, text: string, bad: boolean) {
    const dpr = this.dpr, x = mx * dpr + 14 * dpr, y = my * dpr - 12 * dpr;
    ctx.font = `bold ${12 * dpr}px ui-sans-serif, system-ui, sans-serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round'; ctx.lineWidth = 3 * dpr; ctx.strokeStyle = 'rgba(2,6,23,0.9)'; ctx.strokeText(text, x, y);
    ctx.fillStyle = bad ? '#fecaca' : '#bbf7d0'; ctx.fillText(text, x, y);
    ctx.lineJoin = 'miter'; ctx.textBaseline = 'alphabetic';
  }
  /** the road tool's snap mark: an amber ring on a node or a dead end, a tick across the road on a road; nothing on the grid */
  private drawSnapMark(ctx: CanvasRenderingContext2D, s: Snap) {
    if (s.kind === 'node' || s.kind === 'end') {
      const c = this.screen(s.p.x, s.p.y);
      ctx.strokeStyle = '#ffb020'; ctx.lineWidth = 2 * this.dpr; ctx.beginPath(); ctx.arc(c.x, c.y, 8 * this.dpr, 0, Math.PI * 2); ctx.stroke();
    } else if (s.kind === 'road' && s.seg) {
      const n = perp(norm(sub(s.seg.b, s.seg.a))), h = s.seg.cls.h + 0.5, p = s.p;
      this.setIso(ctx); ctx.beginPath(); ctx.moveTo(p.x - n.x * h, p.y - n.y * h); ctx.lineTo(p.x + n.x * h, p.y + n.y * h); ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.strokeStyle = '#ffb020'; ctx.lineWidth = 2 * this.dpr; ctx.stroke();
    }
  }
  private drawGroundOverlays(ctx: CanvasRenderingContext2D) {
    const strip = (legs: Leg[], hw: number) => { for (const l of legs) { const d = sub(l.b, l.a), len = vlen(d) || 1, u = mul(d, 1 / len), n = perp(u); const c = [add(sub(l.a, mul(u, hw)), mul(n, hw)), add(add(l.b, mul(u, hw)), mul(n, hw)), sub(add(l.b, mul(u, hw)), mul(n, hw)), sub(sub(l.a, mul(u, hw)), mul(n, hw))]; ctx.moveTo(c[0].x, c[0].y); for (let k = 1; k < 4; k++) ctx.lineTo(c[k].x, c[k].y); ctx.closePath(); } };
    if (this.tool === 'road') {
      const legs = this.previewLegs(), cls = this.cls, cs = this.cursorSnap(), block = this.routeBlock(legs), bad = block !== '', cuts = this.routeCuts(legs);
      if (legs.length) {
        // the pieces Replace will take up: amber and dashed, under the route (drawn red on top they made a buildable route look refused, the
        // owner, 2026-10-19; red stays the colour of a refusal)
        if (cuts.length) { this.setIso(ctx); ctx.beginPath(); for (const c of cuts) strip([{ a: c.p0, b: c.p1 }], c.seg.cls.h + c.seg.cls.walk); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = 'rgba(251,191,36,0.22)'; ctx.fill(); ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]); ctx.stroke(); ctx.setLineDash([]); }
        this.setIso(ctx); ctx.beginPath(); strip(legs, cls.h + cls.walk); ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = cls.walkTex === 'gravel' ? 'rgba(150,140,120,0.45)' : 'rgba(230,200,160,0.45)'; ctx.fill();
        this.setIso(ctx); ctx.beginPath(); strip(legs, cls.h); ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = bad ? 'rgba(160,40,40,0.6)' : 'rgba(50,60,80,0.6)'; ctx.fill(); ctx.strokeStyle = bad ? 'rgba(248,113,113,0.9)' : 'rgba(255,230,150,0.9)'; ctx.lineWidth = 1.5; ctx.setLineDash([6, 4]); ctx.stroke(); ctx.setLineDash([]);
        if (cls.median) { this.setIso(ctx); ctx.beginPath(); strip(legs, cls.median / 2); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = 'rgba(90,160,70,0.55)'; ctx.fill(); }
        this.setIso(ctx); ctx.beginPath(); for (const l of legs) { ctx.moveTo(l.a.x, l.a.y); ctx.lineTo(l.b.x, l.b.y); } ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.strokeStyle = bad ? '#f87171' : '#ffd866'; ctx.lineWidth = 2; ctx.stroke();
        if (cls.oneway) {
          // the flow: a white chevron every 15 tiles on the centre line, in the drawn direction
          this.setIso(ctx); ctx.beginPath();
          for (const l of legs) {
            const dx = l.b.x - l.a.x, dy = l.b.y - l.a.y, L = Math.hypot(dx, dy); if (L < 0.01) continue;
            const ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
            for (let s = Math.min(7.5, L / 2); s < L; s += 15) {
              const px = l.a.x + ux * s, py = l.a.y + uy * s, tx = px - ux * 0.6, ty = py - uy * 0.6;
              ctx.moveTo(tx + nx * 0.8, ty + ny * 0.8); ctx.lineTo(px + ux * 0.6, py + uy * 0.6); ctx.lineTo(tx - nx * 0.8, ty - ny * 0.8);
            }
          }
          ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 2; ctx.stroke();
        }
        const pts = [...this.route, legs[legs.length - 1].b];
        for (const p of pts) { const s = this.screen(p.x, p.y); ctx.fillStyle = '#ffd866'; ctx.beginPath(); ctx.arc(s.x, s.y, 4 * this.dpr, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#4a3200'; ctx.lineWidth = 1.5; ctx.stroke(); }
      } else if (cs) {
        const s = this.screen(cs.p.x, cs.p.y);
        ctx.fillStyle = 'rgba(255,216,102,0.9)'; ctx.beginPath(); ctx.arc(s.x, s.y, 5 * this.dpr, 0, Math.PI * 2); ctx.fill();
      }
      if (cs) {
        this.drawSnapMark(ctx, cs);
        if (bad) { const c = this.screen(cs.p.x, cs.p.y); ctx.font = `bold ${12 * this.dpr}px ui-sans-serif, system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round'; ctx.lineWidth = 3 * this.dpr; ctx.strokeStyle = '#0f172a'; ctx.strokeText(block, c.x, c.y - 18 * this.dpr); ctx.fillStyle = '#f87171'; ctx.fillText(block, c.x, c.y - 18 * this.dpr); }
      }
      const gm = this.ghostMouse;
      if (legs.length && !bad && gm) {
        const key = `${cls.id}|` + legs.map(l => `${l.a.x},${l.a.y},${l.b.x},${l.b.y}`).join('|');
        if (this.routeCostCache?.key !== key) this.routeCostCache = { key, cost: this.routeCost() };
        let len = 0; for (const l of legs) len += vlen(sub(l.b, l.a));
        const g = costLabel('', this.routeCostCache.cost, this.money, `${Math.round(len * 2)} m of ${cls.name.toLowerCase()}`);
        drawGhostHint(this.ghostView(ctx), gm.mx, gm.my, g.label, g.bad);
      }
    } else if (this.tool === 'junction' && this.hoverNode) {
      const n = this.hoverNode, b = this.brush;
      if (b === 'roundabout' || b === 'mini') {
        // what the brush would build, before the click: the ring (its circle and island) amber, or red with the roads in the way red and the reason
        // written over it (the owner: show what it is going to build, with red where the issue is)
        const rl = this.ringLanes, c = this.installCheck(n, b, rl), R = this.ringOf(n, b, rl), ri = b === 'roundabout' ? R - rl * RB_LANE : R - 1.4, bad = !!c.why && !/^It (already|is already)/.test(c.why);
        this.setIso(ctx); ctx.beginPath(); ctx.arc(n.x, n.y, R, 0, Math.PI * 2); ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = bad ? 'rgba(240,80,60,0.28)' : 'rgba(60,70,90,0.45)'; ctx.fill(); ctx.strokeStyle = bad ? '#f87171' : '#ffd866'; ctx.lineWidth = 2; ctx.stroke();
        this.setIso(ctx); ctx.beginPath(); ctx.arc(n.x, n.y, Math.max(0.5, ri), 0, Math.PI * 2); ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = bad ? 'rgba(240,80,60,0.18)' : 'rgba(110,150,80,0.5)'; ctx.fill(); ctx.setLineDash([6, 4]); ctx.stroke(); ctx.setLineDash([]);
        if (c.hit.length) { this.setIso(ctx); ctx.beginPath(); strip(c.hit.map(s => ({ a: s.a, b: s.b })), Math.max(...c.hit.map(s => s.cls.h + s.cls.walk))); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = 'rgba(240,80,60,0.45)'; ctx.fill(); ctx.strokeStyle = '#f87171'; ctx.lineWidth = 2; ctx.stroke(); }
        if (bad) { const p = this.screen(n.x, n.y); ctx.font = `bold ${12 * this.dpr}px ui-sans-serif, system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round'; ctx.lineWidth = 3 * this.dpr; ctx.strokeStyle = '#0f172a'; ctx.strokeText(c.why, p.x, p.y - 22 * this.dpr); ctx.fillStyle = '#f87171'; ctx.fillText(c.why, p.x, p.y - 22 * this.dpr); }
      } else {
        const r = Math.max(...n.arms.map(a => a.h)) + 1.5;
        this.setIso(ctx); ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2); ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = 'rgba(255,216,102,0.22)'; ctx.fill(); ctx.strokeStyle = '#ffd866'; ctx.lineWidth = 2; ctx.setLineDash([8, 5]); ctx.stroke(); ctx.setLineDash([]);
      }
    } else if ((this.tool === 'lane' || this.tool === 'downgrade') && this.laneHover?.segs.length) {
      // the run the Upgrade (Downgrade) tool would change: amber (blue) where it can go, red where not
      const h = this.laneHover, cls = h.segs[0]!.cls, legs = h.segs.map(s => ({ a: s.a, b: s.b }));
      this.setIso(ctx); ctx.beginPath(); strip(legs, cls.h + cls.walk); ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = h.why ? 'rgba(240,80,60,0.3)' : h.down ? 'rgba(96,165,250,0.3)' : 'rgba(255,216,102,0.3)'; ctx.fill();
      this.setIso(ctx); ctx.beginPath(); for (const l of legs) { ctx.moveTo(l.a.x, l.a.y); ctx.lineTo(l.b.x, l.b.y); } ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.strokeStyle = h.why ? '#f87171' : h.down ? '#60a5fa' : '#ffd866'; ctx.lineWidth = 2; ctx.stroke();
      const gm = this.ghostMouse;
      if (gm) { const g = costLabel(h.why, h.cost, this.money, h.to ? `${h.down ? 'Downgrade' : 'Upgrade'} to ${h.to.name.toLowerCase()}` : ''); drawGhostHint(this.ghostView(ctx), gm.mx, gm.my, g.label, g.bad); }
    } else if (this.tool === 'bulldoze' && this.hoverPiece) {
      const pc = this.hoverPiece, cls = pc.seg.cls;
      this.setIso(ctx); ctx.beginPath(); strip([{ a: pc.p0, b: pc.p1 }], cls.h + cls.walk); ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = 'rgba(240,80,60,0.3)'; ctx.fill(); ctx.strokeStyle = '#f87171'; ctx.lineWidth = 1.5; ctx.stroke();
      const gm = this.ghostMouse;
      if (gm) drawGhostHint(this.ghostView(ctx), gm.mx, gm.my, `Click removes this ${cls.name.toLowerCase()} (refunds its value)`, true);
    } else if (this.paintOn) this.paint.drawPreview({ ctx, setIso: c => this.setIso(c), screen: (x, y) => this.screen(x, y), dpr: this.dpr, hint: (mx, my, t, b) => this.hintAt(ctx, mx, my, t, b) });
    else if (this.tool === 'park' && this.parking.mode !== 'rect') this.parking.drawPreview({ ctx, setIso: c => this.setIso(c), screen: (x, y) => this.screen(x, y), dpr: this.dpr, hint: (mx, my, t, b) => this.hintAt(ctx, mx, my, t, b) });
  }
}
