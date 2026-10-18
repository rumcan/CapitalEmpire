import { CHUNK_H, CHUNK_W, DISTRICT_Z, HH, HW, MAP, MID_BELOW, MID_H, MID_W, PLANNER_Z, PLAN_H, PLAN_W, SPR_H, SPR_W, ZOOM_MAX, ZOOM_MIN, clamp, levelFor, midLevelFor, planLevelFor, tileOf, worldX, worldY } from './iso';
import { ATLAS_PAGES, LIBRARY } from './library';
import { CLASS, FLAG_COST, Grid, JUNCTIONS, KEY_CLASSES, RoadNetwork, WIDER, SK, add, dot, mul, norm, perp, sub, unionBox, vlen, type AutoProp, type BBox, type ClassId, type Leg, type Node, type NodeType, type PieceSel, type Pt, type PortalRec, type RoadClass, type Seg, type SegKind } from './network';
import { NetEditor, applyNodeEntry, netToOps, nodeEntry, straightChain } from './netops';
import { MIN_SEP, checkLegs, snapPoint, type Snap } from './snap';
import { STRUCT_COST, STRUCT_MAX, highwayRoute, longestRun, splitByTerrain, structureLengths } from './structures';
import { GLRenderer, POINT_STRIDE, SHADOW_STRIDE, SPRITE_STRIDE } from './gl';
import { GroundCache } from './ground-cache';
import { lotBatch, type LotPatch } from './ground-protocol';
import { SpriteTiles, spriteRect, type Drawable } from './sprites';
import { readSave, writeSave, clearSave, SAVE_VERSION, type SaveV5 } from './save';
import { CAR_COLOURS } from './traffic';
import { SimClient, type LotView } from './sim/client';
import { zoneOf } from './sim/routing';
import { lastRush, nextRush, windowOf, type Window } from './beforeafter';
import { insideSite, type Site } from './event/site';
import { BAY_D, BAY_W, BOOTH_W, BUS_ROUTE_COST, BUS_SEATS, CARDS, DECK_SEATS, PLAZA_LEN, START_BOOTHS, START_BUSES, TOLL_BASE_COST, TOLL_BOOTH_COST, tollPrice, type CardId } from './event/config';
import { Round } from './event/round';
import type { BusRouteDef } from './event/bus';
import walkersUrl from '../assets/characters/walkers.png';
import { plazaEdge, plazaIslands, plazaLocal, plazaOutline, plazaPoint, plazaQuads, type TollDef } from './event/toll';
import { buildPark, parkCost, parkValid, type CarPark, type CarParkDef } from './event/carpark';
import { TC, classAt, generateTerrain, makeNoise, type Noise, type Terrain } from './terrain';
import { slopeField } from './terrain-paint';
import { FOREST_CELL, forestCell } from './forest';
import type { BendMode, LibItem, LineStyle, Prop, Tool } from './types';
import { LK, LaneGraph, laneAt, laneOff } from './sim/lanes';
import { LV, type LotTuple } from './lots/town';
import { compose, isCarPark, type ComposeState, type LotGeom } from './lots/compose';
import { LotMap } from './lots/lots';
import { TOWN_BLOCKS, TOWN_POP, townCentres, townGrid } from './lots/seedtowns';
import { Names, RoadNames } from './ext/names';
import { SIG, shown, sigKey } from './sim/signals';
import { Budget, DEBT_DAYS, LOAN, compensation, type Ledger } from './budget';
import { WIN_POP, classUnlocked, junctionUnlocked, tunnelsUnlocked, unlockOf } from './career';

/** a game day and a game hour, sim s (one sim second is one game minute) */
const GAME_DAY = 1440, GAME_HOUR = 60;
/** the sim speeds the time controls offer (sim s per s); 0 is paused */
export const SPEEDS = [1, 2, 4, 8, 20] as const;
/** the flow colours by v/c (below 0.5, below 0.8, below 1, and 1 or more; the Bottlenecks legend) and the junction LOS badge colours, A to F */
export const FLOW_COLS = ['#3ddc84', '#ffd23f', '#ff8c1a', '#ff3b3b'];
/** the heat map's bands by speed against the limit: Flowing (75%+), Slow (50-75%), Heavy (25-50%), Stopped (under 25%); see Game.drawFlow */
export const HEAT_COLS = ['#0ca30c', '#fab219', '#ec835a', '#d03b3b'];
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
/** a piece of a screen-space label at (x, y), left-aligned, filled in col and outlined in the stroke style; returns the x after it */
function labelPiece(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, col: string): number { ctx.strokeText(s, x, y); ctx.fillStyle = col; ctx.fillText(s, x, y); return x + ctx.measureText(s).width; }

interface Build { legs: Leg[]; cls: RoadClass; t0: number; dur: number; total: number; cum: number[] }
interface Particle { x: number; y: number; vx: number; vy: number; vz: number; z: number; life: number; age: number; r: number }
export interface Toast { id: number; text: string; t: number; kind: 'info' | 'warn' | 'good' }
export interface Camera { X: number; Y: number; z: number }
const AUTO_TREES = ['world:tree_oak_1', 'ref:tree-maple-crimson', 'world:tree_oak_2', 'ref:tree-birch-gold'];
const autoKey = (a: AutoProp) => `${a.kind}@${a.x.toFixed(2)},${a.y.toFixed(2)}`;
const BUILDING_KINDS: Record<string, number> = { house: 0, shop: 1, venue: 1, arcade: 1, landmark: 4, barn: 3 };
/** a town lot's use as the player reads it in the toasts (index LU: NONE, RES, COM, IND, TOUR, GOV) */
const LOT_NAME = ['lot', 'residential lot', 'commercial lot', 'industrial lot', 'tourist lot', 'civic lot'];
/** the planner's building refresh for the town's lots: at most one per this many ms; the contact sheet's block size, tiles */
const LOT_BLOCKS_MS = 5000, BLOCK = 40;
/** the library index by id, and the props the town's lots add (auto 'lot:' + key) */
const LIB_INDEX = new Map(LIBRARY.map((it, i) => [it.id, i] as const));
const isLotProp = (p: Prop) => !!p.auto && p.auto.startsWith('lot:');
/** the lot fills by use * 4 + decline (EMPTY, RES green, COM blue, IND orange, TOUR magenta, GOV white), darker with each decline step */
const LOT_FILL = Array.from({ length: 24 }, (_, i) => { const k = [1, 0.75, 0.5, 0.3][i & 3]!, c = [[0, 0, 0], [76, 175, 80], [47, 123, 217], [255, 140, 26], [217, 70, 239], [255, 255, 255]][i >> 2]!; return `rgb(${Math.round(c[0]! * k)},${Math.round(c[1]! * k)},${Math.round(c[2]! * k)})`; });
/** the library cars by facing (index 0 +x e, 1 +y s, 2 -x w, 3 -y n): the sprites of the parked cars, picked by bay index */
const PARK_CARS: number[][] = [[], [], [], []];
LIBRARY.forEach((it, i) => { const m = /^static:[a-z]+_([enws])(?:-v2)?$/.exec(it.id); if (it.kind === 'car' && m) PARK_CARS['eswn'.indexOf(m[1]!)]!.push(i); });

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
  /** tunnel mouths of the network: key of the last synced set, and the points themselves */
  private portalKey = ''; private portalPts: PortalRec[] = [];
  ground: GroundCache;
  /** lot ground edits made since the last frame (key -> patches, or null to drop), sent as one message per frame */
  private lotPending = new Map<string, LotPatch[] | null>();
  /** the atlas pages (mip 1) as images, for the 2D overlay and picking */
  pageImages: HTMLImageElement[] = []; private pageAlpha: { w: number; h: number; data: Uint8ClampedArray }[] = [];
  ready = false; loadProgress = 0;
  // tools
  tool: Tool = 'road'; roadClass: ClassId = 'street'; bendMode: BendMode = 90; lineStyle: LineStyle = 0; junctionType: NodeType = 'signal';
  /** the junction tool's mode: 'type' installs junctionType; 'wide' and 'tl' toggle the widened-turns and turn-lane flags on the junction clicked */
  junctionMode: 'type' | 'wide' | 'tl' = 'type';
  selected: Prop | null = null; showGrid = false; showLanes = false; showLots = false;
  /** the access overlay (key O): zones with built lots shaded by access; always on at the planner tier (below PLANNER_Z) */
  showAccess = false;
  /** the access overlay's growth state per zone, refreshed at most once a second (growthNow): the lots started within the last game day (growN), the lots declining (declN), and the totals */
  private growN = new Int32Array(256); private declN = new Int32Array(256); growTot = 0; declTot = 0; private growStamp = -Infinity;
  /** the flow overlay (key F, the Flow button, a jump): the live congestion heat map of each road direction (see drawFlow and setFlow) */
  showFlow = false;
  /** the key (sigKey) of each main-thread signal plan, built once: the render loop reads it every frame */
  private sigKeys = new WeakMap<object, string>();
  /** the heat map's scratch: each dseg's band and lane key (255: not drawn), the keys in drawing order, and the counts, starts and fills per key */
  private heatKey = new Uint8Array(0); private heatOrd = new Int32Array(0);
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
  speed = 1; private lastSpeed = 1;
  /** the dev sandbox (URL ?grow=N, ?stamp=0|1, ?money=0|1; the dev server defaults to grow 20, no stamp, money on; the bench forces the game's): the growth speed (1 = the game's),
   *  whether a new valley's towns are stamped to their residents, and unlimited money (sent to the city worker at init) */
  private sandboxGrow = 1; private stampOn = true; private sandboxMoney = false;
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
  perf = { fps: 0, frameMs: 0, cpuMs: 0, drawMs: 0, instances: 0, draws: 0, chunksPending: 0, uploadKB: 0, frames: 0, tier: 'street' as 'street' | 'district' | 'planner', forest: 0, simActive: 0, simTickMs: 0, simMaxTickMs: 0, pop: 0, jobs: 0, built: 0, lotProps: 0 };
  private frameTimes: number[] = [];
  // input
  private dragging: null | { kind: 'pan' | 'bulldoze' | 'park'; sx: number; sy: number; camX: number; camY: number; moved: boolean } = null;
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
  /** the add-lane tool's plan at the cursor: the straight run of road under it (segs; none on a toll plaza), the class it widens to (null: already the widest),
   *  its cost ($, as the road tool charges the upgrade) and why it cannot be built ('' if it can) */
  laneHover: null | { segs: Seg[]; to: RoadClass | null; cost: number; why: string } = null;
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
  /** scratch for the starter check (the lot's box, the props found); the planner's last building refresh (ms) and the timer of the town's lot refresh */
  private lotBox: BBox = [0, 0, 0, 0]; private lotHits = new Set<Prop>(); private blocksAt = -Infinity; private lotBlocksTimer = 0;
  private raf = 0; private last = 0;
  private mask: OffscreenCanvas | null = null;

  constructor(public canvas: HTMLCanvasElement, public overlay: HTMLCanvasElement) {
    this.gl = new GLRenderer(canvas);
    this.ov = overlay.getContext('2d')!;
    this.net.paintData = false;
    this.ground = new GroundCache(this.gl);
    this.traffic = new SimClient();
    // the dev sandbox options (see sandboxGrow): the URL, else the defaults of the dev server or the build
    const q = new URLSearchParams(location.search), dev = import.meta.env.DEV;
    this.sandboxGrow = Number(q.get('grow') ?? (dev ? 20 : 1)) || 1;
    this.stampOn = q.has('stamp') ? q.get('stamp') === '1' : !dev;
    this.sandboxMoney = q.has('money') ? q.get('money') === '1' : dev;
    this.traffic.onGrow = (legs) => this.townGrow(legs);
    this.traffic.onTown = (events) => { for (const e of events) this.lotQueue.add(e.key); };
    this.traffic.onLedger = (l) => {
      if (this.bankrupt && this.traffic.budget.debtDays === DEBT_DAYS) { this.setSpeed(0); this.toast('Bankrupt: the town is out of money', 'warn'); }
      else if (this.bankrupt) { /* already bankrupt: the player keeps watching */ }
      else if (l.money < 0 && !this.traffic.unlimited) this.toast(`In the red: bankrupt in ${DEBT_DAYS - this.traffic.budget.debtDays} days unless the books recover`, 'warn');
      else this.toast(`Day ${l.day}: ${l.net >= 0 ? '+' : '−'}$${Math.abs(l.net).toLocaleString()}`, l.net >= 0 ? 'good' : 'info');
      this.scheduleSave(); this.emit();
    };
    this.traffic.onMilestone = (newly, won) => {
      for (const m of newly) {
        const what = [...m.classes.map(id => CLASS[id].name), ...m.junctions.map(id => JUNCTIONS.find(j => j.id === id)!.name), ...(m.tunnels ? ['tunnels'] : [])].join(', ');
        this.toast(`${m.name}${what ? `: ${what}` : ''}${m.grant ? `, grant $${m.grant.toLocaleString()}` : ''}`, 'good');
      }
      if (won) { this.showWin = true; this.toast(`${WIN_POP.toLocaleString()} residents: the Career is won`, 'good'); }
      this.scheduleSave(); this.emit();
    };
  }
  get cls() { return CLASS[this.roadClass]; }

  subscribe(fn: () => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  emit() { for (const l of this.listeners) l(); }
  toast(text: string, kind: Toast['kind'] = 'info') {
    this.toasts.push({ id: this.toastId++, text, t: performance.now(), kind });
    if (this.toasts.length > 4) this.toasts.shift();
    this.emit();
  }

  async init(opts: { bench?: number } = {}) {
    const tick = (p: number) => { this.loadProgress = p; this.emit(); };
    if (opts.bench) { this.sandboxGrow = 1; this.stampOn = true; this.sandboxMoney = false; }
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
    else if (!save || !this.load(save)) { this.genTerrain(newSeed()); this.seedTowns(); }
    else loaded = save;
    tick(0.7);
    const tl = performance.now();
    this.ground.init(this.terrain);
    this.sendTerrain(); this.afterLoad();
    if (this.stampPending) { this.stampPending = false; this.traffic.stamp(TOWN_POP); this.scheduleSave(); }
    if (loaded) this.traffic.townState(loaded.lots ?? [], loaded.simT ?? 0, loaded.budget, loaded.money, loaded.career, loaded.shift ?? 0, loaded.round);
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
  addProp(item: number, x: number, y: number, flip: boolean, scale: number, auto?: string): Prop {
    const f = this.footprint(LIBRARY[item], x, y, flip, scale);
    const p: Prop = { uid: this.nextUid++, item, x, y, flip, scale, ...f };
    if (auto) p.auto = auto;
    this.props.add(p); this.propGrid.add(p, [p.x0, p.y0, p.x1, p.y1]); this.sprites.add(p);
    if (LIBRARY[item].kind === 'lamp') this.lampProps.add(p);
    if (LIBRARY[item].big && LIBRARY[item].kind !== 'car') this.scheduleBlocks(isLotProp(p)); // cars are not building blocks (sendBlocks skips them)
    return p;
  }
  removeProp(p: Prop) {
    if (!this.props.delete(p)) return;
    this.propGrid.remove(p); this.sprites.remove(p); this.lampProps.delete(p);
    if (p.auto) this.autoByKey.delete(p.auto);
    if (this.selected === p) this.selected = null;
    if (LIBRARY[p.item].big && LIBRARY[p.item].kind !== 'car') this.scheduleBlocks(isLotProp(p));
  }
  /** after moving, flipping or scaling a prop */
  /** plant the forest cells near the view (world px rectangle): nearest to the view centre first, at most two cells per frame */
  private plantForest(X0: number, Y0: number, X1: number, Y1: number) {
    const a = tileOf(X0, Y0), b = tileOf(X1, Y0), c = tileOf(X0, Y1), d = tileOf(X1, Y1), g = 8, N = MAP / FOREST_CELL;
    const ci0 = clamp(Math.floor((Math.min(a.x, b.x, c.x, d.x) - g) / FOREST_CELL), 0, N - 1), ci1 = clamp(Math.floor((Math.max(a.x, b.x, c.x, d.x) + g) / FOREST_CELL), 0, N - 1);
    const cj0 = clamp(Math.floor((Math.min(a.y, b.y, c.y, d.y) - g) / FOREST_CELL), 0, N - 1), cj1 = clamp(Math.floor((Math.max(a.y, b.y, c.y, d.y) + g) / FOREST_CELL), 0, N - 1);
    let todo: number[] | null = null;
    for (let cj = cj0; cj <= cj1; cj++) for (let ci = ci0; ci <= ci1; ci++) {
      const key = cj * N + ci; if (this.forest.has(key)) continue;
      if (!todo) todo = []; todo.push(key);
    }
    if (!todo) return;
    const m = tileOf((X0 + X1) / 2, (Y0 + Y1) / 2), mx = clamp(Math.floor(m.x / FOREST_CELL), 0, N - 1), my = clamp(Math.floor(m.y / FOREST_CELL), 0, N - 1);
    const dd = (k: number) => ((k % N) - mx) ** 2 + (Math.floor(k / N) - my) ** 2;
    todo.sort((p, q) => dd(p) - dd(q));
    for (let k = 0; k < Math.min(2, todo.length); k++) this.plantCell(todo[k], todo[k] % N, Math.floor(todo[k] / N));
  }
  /** plant one forest cell as sprites (not props: no selection, bulldozing or saving) */
  private plantCell(key: number, ci: number, cj: number) {
    const trees = forestCell(this.terrain.seed, this.terrain.cls, this.terrain.height, this.slope, this.clearing, ci, cj), out: Prop[] = [];
    for (const tr of trees) {
      if (this.inPortal(tr.x, tr.y)) continue;
      let item = this.forestItem.get(tr.id);
      if (item === undefined) { item = LIBRARY.findIndex(i => i.id === tr.id); this.forestItem.set(tr.id, item); }
      if (item < 0) continue;
      const it = LIBRARY[item], b = it.boxes[0], ax = tr.x - b.dx * tr.scale / 2, ay = tr.y - b.dy * tr.scale / 2;
      const p: Prop = { uid: this.nextUid++, item, x: ax, y: ay, flip: tr.flip, scale: tr.scale, ...this.footprint(it, ax, ay, tr.flip, tr.scale) };
      this.sprites.add(p); out.push(p);
    }
    this.forest.set(key, out); this.perf.forest += out.length;
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
  setLotGround(key: string, patches: LotPatch[] | null) { this.lotPending.set(key, patches); }
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
    const st = this.staged.get(key); if (st) { this.placeLot(key, st.g, st.st); return; }
    const v = this.traffic.lots.get(key);
    if (!v || v.level === LV.EMPTY || this.starterIn(v)) { this.dropLot(key); return; }
    this.placeLot(key, { o: { x: v.o[0], y: v.o[1] }, u: { x: v.u[0], y: v.u[1] }, n: { x: v.n[0], y: v.n[1] }, w: v.w, d: v.d }, { use: v.use, level: v.level, decline: v.decline, seed: v.seed });
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
    for (const q of c.props) { const i = LIB_INDEX.get(q.id); if (i !== undefined) ps.push(this.addProp(i, q.x, q.y, q.flip, q.scale, 'lot:' + key)); }
    this.lotProps.set(key, ps); this.perf.lotProps += ps.length;
    this.setLotGround(key, c.ground);
  }
  /** median trees, roundabout trees and traffic lights follow the road network (only what the last rebuild changed) */
  private syncAutoProps(added: AutoProp[], removed: AutoProp[]) {
    for (const a of removed) { const p = this.autoByKey.get(autoKey(a)); if (p) this.removeProp(p); }
    for (const a of added) {
      const k = autoKey(a); if (this.autoByKey.has(k)) continue;
      const id = a.kind === 'tree' ? AUTO_TREES[a.i % AUTO_TREES.length] : a.kind === 'rbtree' ? 'world:tree_oak_0' : 'town:traffic_light';
      const item = LIBRARY.findIndex(i => i.id === id); if (item < 0) continue;
      const it = LIBRARY[item], b = it.boxes[0], scale = a.kind === 'tree' ? 0.85 : a.kind === 'rbtree' ? 1.2 : 1;
      const p = this.addProp(item, a.x - b.dx * scale / 2, a.y - b.dy * scale / 2, false, scale); p.auto = k; this.autoByKey.set(k, p);
    }
  }
  /** building footprints for the planner map (debounced: many edits, one message); the town's lots wait, at most one refresh per LOT_BLOCKS_MS */
  private scheduleBlocks(lot = false) {
    if (!this.ready) return;
    if (lot) { if (!this.lotBlocksTimer) this.lotBlocksTimer = window.setTimeout(() => { this.lotBlocksTimer = 0; this.sendBlocks(true); }, Math.max(0, this.blocksAt + LOT_BLOCKS_MS - performance.now())); return; }
    clearTimeout(this.blocksTimer); this.blocksTimer = window.setTimeout(() => this.sendBlocks(true), 400);
  }
  private sendBlocks(invalidate: boolean) {
    const out: number[] = [];
    for (const p of this.props) { const it = LIBRARY[p.item]; if (!it.big || it.kind === 'car') continue; out.push(p.x0, p.y0, p.x1, p.y1, BUILDING_KINDS[it.kind] ?? 2); }
    this.blocksAt = performance.now();
    this.ground.blocks(new Float32Array(out));
    if (invalidate) this.ground.invalidate([0, 0, MAP, MAP], false, 0, 'p');
  }

  // ---------- network edits ----------
  /** send the edits to the workers, refresh what depends on the network and mark the changed ground stale */
  private commitNetwork(keepPrev = false, until = 0) {
    const ops = this.edit.commit(); this.lanes.update(this.net);
    this.ground.netOps(ops); this.traffic.netOps(ops);
    if (this.net.lastDirty) { const d = this.net.lastDirty; this.ground.invalidate([d[0] - 2, d[1] - 2, d[2] + 2, d[3] + 2], keepPrev, until); }
    this.syncAutoProps(this.net.autoAdded, this.net.autoRemoved); this.syncPortals();
    this.syncLamps(); if (this.parkDefs.length) this.syncParks(); if (this.tollDefs.length) this.syncTolls(); if (this.busDefs.length) this.traffic.setBusRoutes(this.busDefs);
    this.scheduleSave(); this.emit();
  }
  private afterLoad() {
    const ops = this.edit.commit(true); this.lanes.update(this.net);
    // the city worker gets the whole network (the bench commits its own edits before this, so `ops` can be empty)
    this.ground.netOps(ops); this.traffic.netOps(netToOps(this.net)); this.syncPortals();
    this.syncAutoProps(this.net.autoProps, []);
    this.syncLamps(); this.sendBlocks(false);
    this.ground.invalidateAll(); this.syncParks(); this.syncTolls(true); this.traffic.setBusRoutes(this.busDefs);
  }

  // ---------- road routing ----------
  setTool(t: Tool) { if (this.tool !== t) { this.cancelRoute(); this.selected = null; this.parkDrag = null; this.tollHover = null; this.busPick = null; this.busHover = null; this.laneHover = null; } this.tool = t; this.emit(); }
  /** the snap radius in tiles: about 14 screen px (at least 2 tiles) */
  private snapRadius() { return Math.max(2, 14 / (HW * this.cam.z)); }
  /** the road tool's snap under the cursor, or null with no cursor */
  private cursorSnap(): Snap | null { return this.hover ? snapPoint(this.net, this.hover, this.snapRadius()) : null; }
  /** why the preview route cannot be built ('' when it can): see checkLegs */
  routeBlock(legs: Leg[] = this.previewLegs()): string {
    if (!legs.length) return '';
    // judged exactly as a click at the cursor would be (roadClick refuses such a point), or, with the cursor on the last point, as finishing does
    const c0 = this.cursorSnap(), last = this.route[this.route.length - 1], cs = c0 && last ? this.aim(last, c0) : c0, onLast = !!cs && !!last && cs.p.x === last.x && cs.p.y === last.y;
    return checkLegs(this.net, legs, this.routeFrom, onLast || !cs ? this.routeLast : cs, this.cls);
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
  routeCost() { return this.structured(this.previewLegs()).cost; }
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
    const why = add.length ? checkLegs(this.net, [...legs, ...add], this.routeFrom, s, this.cls) : '';
    if (why) { this.toast(why, 'warn'); return; }
    for (const l of add) this.route.push(l.b);
    this.routeLast = s; this.emit();
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
  /** does a road corridor of half width hw run into the stadium (its footprint padded by 2 tiles)? false with no site yet */
  private crossesStadium(legs: Leg[], hw: number): boolean {
    const site = this.site; if (!site) return false;
    for (const l of legs) {
      const d = sub(l.b, l.a), L = vlen(d); if (!L) continue;
      const u = mul(d, 1 / L), n = perp(u);
      for (let s = 0; s <= L; s += 0.5) for (let o = -hw; o <= hw + 1e-6; o += 0.5) {
        if (insideSite(site, l.a.x + u.x * s + n.x * o, l.a.y + u.y * s + n.y * o, 2)) return true;
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
  /** does a road corridor of half width hw cross a hill or the river? (creeks and banks are fine: culverts, riverside roads); or the stadium */
  private blockedForRoad(legs: Leg[], hw: number): boolean {
    if (this.crossesStadium(legs, hw)) return true;
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
    const block = checkLegs(this.net, legs, this.routeFrom, this.routeLast, this.cls);
    if (block) { this.toast(block, 'warn'); return; }
    const cls = this.cls, st = this.structured(legs), { parts, kinds, cost, lens } = st;
    const hit = this.lotsInLegs(parts), comp = hit.reduce((s, v) => s + compensation(v), 0);
    if (!this.classOpen(cls.id)) { const lk = unlockOf('class', cls.id)!; this.toast(`${cls.name} unlocks at ${lk.pop.toLocaleString()} residents (${lk.name})`, 'warn'); return; }
    if (kinds.includes(SK.TUNNEL) && !this.tunnelsOpen()) { const lk = unlockOf('tunnel')!; this.toast(`Tunnels unlock at ${lk.pop.toLocaleString()} residents (${lk.name})`, 'warn'); return; }
    if (cost + comp > this.money) { this.toast(`Not enough money: the route costs $${cost.toLocaleString()}${comp ? ` and $${comp.toLocaleString()} compensation` : ''}`, 'warn'); return; }
    if (st.err) { this.toast(st.err, 'warn'); return; }
    if (this.crossesStadium(legs, cls.h + cls.walk)) { this.toast('Roads cannot cross the stadium', 'warn'); return; }
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
    this.edit.addLegs(parts, cls, this.lineStyle, kinds);
    this.commitNetwork(true, now + dur + 150);
    this.builds.push({ legs: parts, cls, t0: now, dur, total, cum });
    this.traffic.spend('construction', cost);
    if (comp) this.traffic.spend('compensation', comp);
    this.route = [];
    const structs = [lens[SK.BRIDGE] ? `${Math.round(lens[SK.BRIDGE] * 2)} m bridge` : '', lens[SK.TUNNEL] ? `${Math.round(lens[SK.TUNNEL] * 2)} m tunnel` : ''].filter(Boolean);
    this.toast(`Built ${Math.round(total * 2)} m of ${cls.name.toLowerCase()}${structs.length ? ` (${structs.join(', ')})` : ''} for $${cost.toLocaleString()}${comp ? `, $${comp.toLocaleString()} compensation for ${hit.length} building${hit.length > 1 ? 's' : ''}` : ''}${cleared.length ? ` (cleared ${cleared.length} item${cleared.length > 1 ? 's' : ''})` : ''}`, 'good');
  }
  /** the junction tool in a flag mode (widened turns, turn lanes): a click on a junction or bend toggles that flag; turning it on costs FLAG_COST */
  private flagClick(mx: number, my: number) {
    const wide = this.junctionMode === 'wide', name = wide ? 'Widened turns' : 'Turn lanes';
    const n = this.net.nearestNode(this.tileAt(mx, my), 2, 5);
    if (!n) { this.toast('Click a junction or a bend in the road', 'warn'); return; }
    if (n.type === 'roundabout') { this.toast('Roundabouts have their own lanes: no flag here', 'warn'); return; }
    const on = wide ? !n.wide : !n.tl;
    if (on) {
      if (!wide && n.arms.length < 3) { this.toast('Turn lanes need a junction of three or more roads', 'warn'); return; }
      if (!wide && !n.arms.some(a => a.cls.laneCentres.length >= 2)) { this.toast('Turn lanes need a two-lane road at the junction', 'warn'); return; }
      const cost = FLAG_COST[wide ? 'wide' : 'tl'];
      if (cost > this.money) { this.toast(`Not enough money: ${name.toLowerCase()} cost $${cost.toLocaleString()}`, 'warn'); return; }
      this.traffic.spend('construction', cost);
    }
    this.edit.setNodeFlags(n, wide ? on : !!n.wide, wide ? !!n.tl : on);
    this.commitNetwork(); this.puff(n.x, n.y, 8);
    this.toast(on ? `${name} added` : `${name} removed`, 'good');
  }
  /** the add-lane tool's plan at tile t (null: no tile): the straight run of road under it (see straightChain; a toll plaza has none), the class it widens
   *  to, its cost and why it cannot be built */
  private laneUpdate(t: Pt | null) {
    const piece = t ? this.net.pieceNear(t) : null;
    if (!piece) { this.laneHover = t ? { segs: [], to: null, cost: 0, why: 'Point at a road' } : null; return; }
    const tolls = [...this.tollSegs.values()], seg = piece.seg;
    const segs = straightChain(seg, x => tolls.includes(x)), wider = WIDER[seg.cls.id], to = wider ? CLASS[wider] : null;
    let raw = 0; for (const s of segs) raw += vlen(sub(s.b, s.a)) * (to ? to.cost : 0) * STRUCT_COST[s.kind];
    const cost = Math.round(raw);
    let why = '';
    if (tolls.includes(seg)) why = 'Toll plazas cannot be widened';
    else if (!to) why = 'Already the widest road (more in Phase 7)';
    else if (!this.classOpen(to.id)) { const lk = unlockOf('class', to.id)!; why = `${to.name} unlocks at ${lk.pop.toLocaleString()} residents (${lk.name})`; }
    else if (cost > this.money) why = `Not enough money: ${to.name.toLowerCase()} costs $${cost.toLocaleString()}`;
    this.laneHover = { segs, to, cost, why };
  }
  /** the add-lane tool's click: every seg of the run goes up to the next class (its kind and line style kept); the network rebuilds at once */
  private laneClick() {
    const h = this.laneHover; if (!h) return;
    if (!h.to) { this.toast('Already the widest road (more in Phase 7)', 'warn'); return; }
    if (!h.segs.length || h.why) { this.toast(h.why || 'Point at a road', 'warn'); return; }
    this.traffic.spend('construction', h.cost);
    let tiles = 0;
    for (const s of h.segs) { tiles += vlen(sub(s.b, s.a)); this.edit.addLegs([{ a: s.a, b: s.b }], h.to, s.style, [s.kind]); }
    this.commitNetwork(); this.puff(h.segs[0]!.a.x, h.segs[0]!.a.y, 8);
    this.toast(`Added a lane: ${Math.round(tiles * 2)} m to ${h.to.name.toLowerCase()}`, 'good');
    this.laneUpdate(this.hover);
  }
  /** the junction flags over the flagged nodes (street and district zoom): W for widened turns, TL for turn lanes */
  private drawNodeFlags(ctx: CanvasRenderingContext2D) {
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.font = `600 ${11 * this.dpr}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const n of this.net.nodes.values()) {
      if (!n.wide && !n.tl) continue;
      const s = this.screen(n.x, n.y), tag = [n.wide ? 'W' : '', n.tl ? 'TL' : ''].filter(Boolean).join(' '), y = s.y - 14 * this.dpr;
      const w = ctx.measureText(tag).width + 8 * this.dpr, h = 16 * this.dpr;
      ctx.fillStyle = 'rgba(15,23,42,0.85)'; ctx.fillRect(s.x - w / 2, y - h / 2, w, h);
      ctx.fillStyle = '#fde68a'; ctx.fillText(tag, s.x, y);
    }
  }
  private junctionClick(mx: number, my: number) {
    if (this.junctionMode !== 'type') { this.flagClick(mx, my); return; }
    const t = this.tileAt(mx, my), spec = JUNCTIONS.find(j => j.id === this.junctionType)!;
    if (!this.junctionOpen(this.junctionType)) { const lk = unlockOf('junction', this.junctionType)!; this.toast(this.eventMode ? `${spec.name} needs the Roundabout card` : `${spec.name} unlocks at ${lk.pop.toLocaleString()} residents (${lk.name})`, 'warn'); return; }
    const n = this.net.nearestNode(t, spec.minDeg, 5);
    if (!n) { this.toast(spec.minDeg > 2 ? 'Click a junction where three or more roads meet' : 'Click a junction or a bend in the road', 'warn'); return; }
    if (n.type === this.junctionType) { this.toast(`That junction already has ${spec.name.toLowerCase()}`); return; }
    if (spec.cost > this.money) { this.toast(`Not enough money: ${spec.name} costs $${spec.cost.toLocaleString()}`, 'warn'); return; }
    this.traffic.spend('construction', spec.cost);
    this.edit.setNodeType(n, this.junctionType);
    this.commitNetwork();
    this.puff(n.x, n.y, 8);
    if (this.junctionType === 'slip' && !n.arms.every(a => a.len >= 27)) this.toast('Slipways need long approaches (54 m+): short arms get plain corners', 'warn');
    else this.toast(`${spec.name} installed`, 'good');
  }
  private bulldozeAt(mx: number, my: number, first: boolean) {
    const t = this.tileAt(mx, my);
    if (first) {
      const p = this.propAt(mx, my);
      if (p && !p.auto) { const it = LIBRARY[p.item]; this.removeProp(p); this.traffic.spend('construction', -Math.round(it.cost * 0.5)); if (it.kind === 'lamp') this.syncLamps(); this.scheduleSave(); this.toast(`Removed ${it.name} (+$${Math.round(it.cost * 0.5).toLocaleString()})`); return; }
      const k = this.parkIndexAt(t);
      if (k >= 0) { const id = this.parkDefs[k]!.id; this.removePark(k); this.scheduleSave(); this.toast(`Removed car park #${id} (no refund)`); this.emit(); return; }
      const g = this.tollIndexAt(t);
      if (g >= 0) { const id = this.tollDefs[g]!.id; this.removeToll(g); this.scheduleSave(); this.toast(`Removed toll gate #${id} (the road stays; no refund)`); this.emit(); return; }
      const b = this.busIndexAt(t);
      if (b >= 0) { const id = this.busDefs[b]!.id; this.removeBus(b); this.scheduleSave(); this.toast(`Removed bus route #${id} (no refund)`); this.emit(); return; }
    }
    const piece = this.net.pieceNear(t);
    if (!piece) { if (first) this.buyOut(t); return; }
    this.edit.removePiece(piece);
    this.commitNetwork();
    this.hoverPiece = this.net.pieceNear(t);
    this.puff(t.x, t.y, 10);
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
  deleteSelected() { if (!this.selected) return; const p = this.selected, it = LIBRARY[p.item]; this.removeProp(p); if (!p.auto) this.traffic.spend('construction', -Math.round(it.cost * 0.5)); if (it.kind === 'lamp') this.syncLamps(); this.scheduleSave(); this.toast(`Removed ${it.name}`); this.emit(); }
  scaleSelected(f: number) {
    const p = this.selected; if (!p) return; const it = LIBRARY[p.item], k = clamp(p.scale * f, 0.6, 1.6);
    const err = this.canPlace(it, p.x, p.y, p.flip, k, p); if (err) { this.toast(err, 'warn'); return; }
    p.scale = k; this.propChanged(p); this.scheduleSave(); this.emit();
  }

  // ---------- input ----------
  pointerDown(e: PointerEvent) {
    const mx = e.offsetX, my = e.offsetY;
    this.overlay.setPointerCapture(e.pointerId);
    const pan = e.button === 1 || e.button === 2 || this.keys.has(' ');
    if (this.keys.has(' ')) this.spacePanned = true;
    if (pan || this.tool === 'select') {
      if (!pan && this.tool === 'select') {
        // a car under the pointer (street tier) is inspected; else a prop is selected; else, with the flow on, the junction there is watched
        const car = this.cam.z >= DISTRICT_Z ? this.carAt(mx, my) : -1;
        if (car >= 0) { this.inspectCar(car); return; }
        const p = this.propAt(mx, my);
        if (p) { this.selected = p; this.emit(); return; }
        this.selected = null; this.emit();
        if (this.showFlow) { const t = this.tileAt(mx, my); this.traffic.watchAt(t.x, t.y); this.emit(); }
      }
      this.dragging = { kind: 'pan', sx: mx, sy: my, camX: this.cam.X, camY: this.cam.Y, moved: false }; return;
    }
    if (e.button !== 0) return;
    switch (this.tool) {
      case 'road': this.roadClick(mx, my); break;
      case 'junction': this.junctionClick(mx, my); break;
      case 'toll': this.tollUpdate(mx, my); this.tollClick(); break;
      case 'bus': this.busUpdate(mx, my); this.busClick(); break;
      case 'lane': this.laneUpdate(this.tileAt(mx, my)); this.laneClick(); break;
      case 'bulldoze': this.bulldozeAt(mx, my, true); this.dragging = { kind: 'bulldoze', sx: mx, sy: my, camX: 0, camY: 0, moved: false }; break;
      case 'park': { const t = this.tileAt(mx, my), r = Math.round; this.parkDrag = { x0: r(t.x), y0: r(t.y), x1: r(t.x), y1: r(t.y), def: { id: 0, x: 0, y: 0, w: 0, h: 0 }, park: null, why: '', cost: 0, mx, my }; this.dragging = { kind: 'park', sx: mx, sy: my, camX: 0, camY: 0, moved: false }; this.parkUpdate(mx, my); break; }
    }
  }
  pointerMove(e: PointerEvent) {
    const mx = e.offsetX, my = e.offsetY;
    this.hover = this.tileAt(mx, my);
    const d = this.dragging;
    if (d) {
      if (Math.abs(mx - d.sx) + Math.abs(my - d.sy) > 3) d.moved = true;
      if (d.kind === 'pan') { this.cam.X = d.camX - (mx - d.sx) / this.cam.z; this.cam.Y = d.camY - (my - d.sy) / this.cam.z; this.clampCam(); }
      else if (d.kind === 'bulldoze') this.bulldozeAt(mx, my, false);
      else if (d.kind === 'park') this.parkUpdate(mx, my);
    } else if (this.tool === 'select') this.hoverProp = this.propAt(mx, my);
    if (this.tool === 'select' && !d) this.hoverRoad = this.hoverProp ? '' : this.roadNameAt(this.hover);
    if (this.tool === 'junction') this.hoverNode = this.net.nearestNode(this.hover, this.junctionMode === 'type' ? JUNCTIONS.find(j => j.id === this.junctionType)!.minDeg : 2, 5);
    if (this.tool === 'lane') this.laneUpdate(this.hover);
    if (this.tool === 'bulldoze') this.hoverPiece = this.net.pieceNear(this.hover);
    if (this.tool === 'toll') this.tollUpdate(mx, my);
    if (this.tool === 'bus') this.busUpdate(mx, my);
  }
  pointerUp() { if (this.dragging?.kind === 'park') this.parkRelease(); this.dragging = null; }
  pointerLeave() { this.hover = null; this.hoverProp = null; this.hoverNode = null; this.hoverPiece = null; this.hoverRoad = ''; this.tollHover = null; this.busHover = null; this.laneHover = null; }
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
  doubleClick() { if (this.tool === 'road' && this.route.length > 1) this.finishRoute(); }
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
  /** shows or hides the flow overlay (the Flow button, key F, a jump) and turns the worker's heat map on or off with it (see SimClient.heatOn); callers emit */
  setFlow(on: boolean) { this.showFlow = on; this.traffic.heatOn(on); }
  keyDown(e: KeyboardEvent) {
    const tag = (e.target as HTMLElement)?.tagName; if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    this.keys.add(e.key);
    switch (e.key) {
      case 'Escape':
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
      case 'r': case 'R': if (this.tool === 'toll') { this.tollFlip = !this.tollFlip; if (this.tollHover) this.tollUpdate(this.tollHover.mx, this.tollHover.my); this.emit(); } else this.setTool('road'); break;
      case 'j': case 'J': this.setTool('junction'); break;
      case 'x': case 'X': this.setTool('bulldoze'); break;
      case 'p': case 'P': this.setTool('park'); break;
      case 't': case 'T': this.setTool('toll'); break;
      case 'u': case 'U': this.setTool('bus'); break;
      case 'n': case 'N': this.setTool('lane'); break;
      case 'v': case 'V': this.setTool('select'); break;
      case '1': case '2': case '3': case '4': case '5': case '6': { const c = KEY_CLASSES[+e.key - 1]; if (c) { this.roadClass = c; this.setTool('road'); } break; }
      case '+': case '=': this.zoomAt(clamp(this.cam.z * 1.25, ZOOM_MIN, ZOOM_MAX)); break;
      case '-': case '_': this.zoomAt(clamp(this.cam.z / 1.25, ZOOM_MIN, ZOOM_MAX)); break;
      case ' ': e.preventDefault(); if (!e.repeat) this.spacePanned = false; break;
      case '.': case '>': { const k = this.speed || this.lastSpeed; this.setSpeed(SPEEDS.find(s => s > k) ?? SPEEDS[SPEEDS.length - 1]!); break; }
      case ',': case '<': { const k = this.speed || this.lastSpeed; this.setSpeed(SPEEDS.filter(s => s < k).pop() ?? SPEEDS[0]); break; }
      case 'h': case 'H': this.skipToRush(); break;
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
  clock(): { day: number; hour: number; minute: number } { const t = this.traffic.clockTime(performance.now()); return { day: this.day, hour: Math.floor(t / GAME_HOUR) % 24, minute: Math.floor(t % GAME_HOUR) }; }
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
    this.traffic.terrain(t.cls, h.x >= 0 ? [h.x, h.y] : [t.start.x + t.start.size / 2, t.start.y + t.start.size / 2], this.seed, townCentres(t).flatMap(p => [p.x, p.y]));
  }
  /** the town lays a free gravel road: its legs go down like a road build, small props are cleared, and a big prop in the way skips it */
  private townGrow(legs: Leg[]) {
    const cls = CLASS.gravel, near = this.propsNearLegs(legs, cls.h + cls.walk);
    if (near.some(p => !p.auto && LIBRARY[p.item].big && LIBRARY[p.item].kind !== 'car')) return;
    for (const p of near) if (!p.auto && !LIBRARY[p.item].big) this.removeProp(p);
    const now = performance.now(), total = this.net.legsLength(legs), dur = Math.min(4000, 700 + total * 70);
    const cum: number[] = []; let acc = 0; for (const l of legs) { cum.push(acc); acc += vlen(sub(l.b, l.a)); }
    this.edit.addLegs(legs, cls, 2);
    this.commitNetwork(true, now + dur + 150);
    this.builds.push({ legs, cls, t0: now, dur, total, cum });
    if (now - this.growToast > 30000) { this.growToast = now; this.toast('The town laid a gravel road'); }
  }

  // ---------- the event (Phase 5 step 2c) ----------
  /** the stadium's site as the city worker placed it (null: none yet; it follows each terrain) */
  get site(): Site | null { return this.traffic.site; }
  /** announces an event round: the build (10 minutes of wall clock) starts; the city worker refuses unless the round is free */
  startRound() { this.traffic.startRound(); this.toast('The event is announced: 10 minutes to build'); this.emit(); }
  /** ends the build now: the crowd's run to kick-off begins */
  startNow() { this.traffic.startNow(); this.emit(); }
  /** closes the eval: the round is free again and the clock runs on */
  closeRound() { this.traffic.closeRound(); this.emit(); }
  /** moves the camera to the stadium's centre, keeping the zoom */
  goToSite() { const s = this.site; if (!s) return; this.cam.X = worldX(s.c.x, s.c.y); this.cam.Y = worldY(s.c.x, s.c.y); this.clampCam(); this.emit(); }

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
    this.parkDefs.push({ ...pd.def, id });
    this.traffic.spend('construction', pd.cost);
    this.syncParks();
    this.toast(`Car park: ${bays} bays ($${pd.cost.toLocaleString()})`, 'good');
    this.scheduleSave(); this.emit();
  }
  /** the car parks' builds on the network (after each network change and on load), and the list to the city worker (which builds them too) */
  private syncParks() {
    this.parkBuilt = this.parkDefs.map(d => buildPark(this.net, d));
    this.traffic.setParks(this.parkDefs);
    this.parkGrounds();
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
  private removePark(k: number) { this.dropParkCars(this.parkDefs[k]!.id); this.parkDefs.splice(k, 1); this.syncParks(); }
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
    for (let k = 0; k < this.parkDefs.length; k++) {
      const id = this.parkDefs[k]!.id, pk = this.parkBuilt[k] ?? null, v = views.find(q => q.id === id);
      const want = pk && v ? Math.min(v.parked, pk.bays.length) : 0;
      for (let i = 0; i < want; i++) {
        const key = `park:${id}:${i}`, have = this.parkCars.get(key);
        if (have && this.props.has(have)) continue;
        const bay = pk!.bays[i]!, item = PARK_CARS[bay.dir]![i % PARK_CARS[bay.dir]!.length]!, b = LIBRARY[item]!.boxes[0]!;
        this.parkCars.set(key, this.addProp(item, bay.x - b.dx / 2, bay.y - b.dy / 2, false, 1, key));
      }
      for (let i = want; ; i++) { const key = `park:${id}:${i}`, p = this.parkCars.get(key); if (!p) break; this.removeProp(p); this.parkCars.delete(key); }
    }
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
    ctx.lineJoin = 'miter'; ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
  }
  /** the car park drag: the rect green where parkValid allows it, else red; its bays and entrances when it can be built; and the verdict at the cursor
   *  (the reason, or the cost short of the money, or the bays and the cost) */
  private drawParkPreview(ctx: CanvasRenderingContext2D) {
    const pd = this.parkDrag; if (!pd) return;
    const dpr = this.dpr, d = pd.def, pk = pd.park;
    this.setIso(ctx); ctx.beginPath(); ctx.rect(d.x, d.y, d.w, d.h); ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = pd.why ? 'rgba(230,80,80,0.3)' : 'rgba(80,200,120,0.3)'; ctx.fill();
    if (pk) { this.bayOutlines(ctx, pk.bays); for (const e of pk.entrances) { const p = this.screen(e.x, e.y); disc(ctx, p.x, p.y, 4 * dpr, '#ffbe3c'); } }
    const short = !pd.why && pd.cost > this.money, bad = !!pd.why || short;
    const text = pd.why || (short ? `Not enough money: $${pd.cost.toLocaleString()}` : `${pk ? pk.bays.length : 0} bays · $${pd.cost.toLocaleString()}`);
    const x = pd.mx * dpr + 14 * dpr, y = pd.my * dpr - 12 * dpr;
    ctx.font = `bold ${12 * dpr}px ui-sans-serif, system-ui, sans-serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round'; ctx.lineWidth = 3 * dpr; ctx.strokeStyle = 'rgba(2,6,23,0.9)'; ctx.strokeText(text, x, y);
    ctx.fillStyle = bad ? '#fecaca' : '#bbf7d0'; ctx.fillText(text, x, y);
    ctx.lineJoin = 'miter'; ctx.textBaseline = 'alphabetic';
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
    this.tollDefs.push(def);
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
    const d = this.tollDefs[k]!, key = `toll:${d.id}`;
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
      this.setIso(ctx); ctx.beginPath(); ring(ctx, plazaOutline(d, s.cls.h, off0));
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = h.why ? 'rgba(230,80,80,0.3)' : 'rgba(80,200,120,0.3)'; ctx.fill();
      const q = (t: number, o: number, first = false) => { const p = plazaPoint(d, t, o); if (first) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); };
      this.setIso(ctx); ctx.beginPath();
      q(c - 6, 0, true); q(c + 6, 0); q(c + 3, -1.5); q(c + 6, 0); q(c + 3, 1.5);
      for (let k = 0; k < h.booths; k++) { const o = off0 + BOOTH_W * k; q(c, o - 0.8, true); q(c, o + 0.8); }
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.5 * dpr; ctx.stroke();
    }
    const short = !h.why && h.cost > this.money, bad = !!h.why || short;
    const text = h.why || (short ? `Not enough money: $${h.cost.toLocaleString()}` : `${h.booths} booths · $${h.cost.toLocaleString()}`);
    const x = h.mx * dpr + 14 * dpr, y = h.my * dpr - 12 * dpr;
    ctx.font = `bold ${12 * dpr}px ui-sans-serif, system-ui, sans-serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round'; ctx.lineWidth = 3 * dpr; ctx.strokeStyle = 'rgba(2,6,23,0.9)'; ctx.strokeText(text, x, y);
    ctx.fillStyle = bad ? '#fecaca' : '#bbf7d0'; ctx.fillText(text, x, y);
    ctx.lineJoin = 'miter'; ctx.textBaseline = 'alphabetic';
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
      for (let g = 0, nq = sprites ? Math.min(24, q) : 0; g < nq; g++) walkerSprite(ctx, sheet, bx + ((g & 3) - 1.5) * 0.7, by + ((g >> 2) - 2.5) * 0.7, r % 3, Math.floor(tick + g) % 4, ze, X0, Y0, cw, ch, h);
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
    if (!h.why) { const b = this.screen(h.x, h.y); busStop(ctx, b.x, b.y, dpr); }
    const cost = this.busDefs.length ? BUS_ROUTE_COST : 0, short = !h.why && !!P && cost > this.money, bad = !!h.why || short;
    const text = h.why || (!P ? (h.town !== undefined ? 'Lot stop · town car park' : `Lot stop · car park #${h.park}`) : short ? `Not enough money: $${cost.toLocaleString()}` : cost ? `Bus route · $${cost.toLocaleString()}` : 'Bus route · free (the starting kit)');
    const x = h.mx * dpr + 14 * dpr, y = h.my * dpr - 12 * dpr;
    ctx.font = `bold ${12 * dpr}px ui-sans-serif, system-ui, sans-serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round'; ctx.lineWidth = 3 * dpr; ctx.strokeStyle = 'rgba(2,6,23,0.9)'; ctx.strokeText(text, x, y);
    ctx.fillStyle = bad ? '#fecaca' : '#bbf7d0'; ctx.fillText(text, x, y);
    ctx.lineJoin = 'miter'; ctx.textBaseline = 'alphabetic';
  }

  // ---------- economy / save ----------
  /** the treasury, $ (the city's books, mirrored from the city worker; spend moves it at once); Infinity with unlimited money (the dev sandbox) */
  get money(): number { return this.traffic.unlimited ? Infinity : this.traffic.budget.money; }
  /** the dev sandbox's growth speed (1 = the game's), whether the towns are stamped at a new valley, and unlimited money (the top bar's badge) */
  get growth(): number { return this.sandboxGrow; }
  get stamped(): boolean { return this.stampOn; }
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
  /** event mode: a stadium site exists, and the event's rules replace the Career's unlocks (see classOpen, junctionOpen, tunnelsOpen) */
  get eventMode(): boolean { return this.site !== null; }
  /** a road class is open to build: every class in event mode, else as the Career unlocks it */
  classOpen(id: ClassId): boolean { return this.eventMode || classUnlocked(id, this.reached); }
  /** a junction type is open: in event mode all but the roundabout, which the Roundabout card opens; else as the Career unlocks it */
  junctionOpen(t: NodeType): boolean { return this.eventMode ? t !== 'roundabout' || this.traffic.round.cards.includes('roundabout') : junctionUnlocked(t, this.reached); }
  /** tunnels are open: always in event mode, else as the Career unlocks them */
  tunnelsOpen(): boolean { return this.eventMode || tunnelsUnlocked(this.reached); }
  /** takes a card of the eval's draft (the worker refuses what is not on it); its effects follow with the next frame (see applyCards) */
  pickCard(id: CardId) { this.traffic.pickCard(id); this.emit(); }
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
      if (id === 'booths') { this.tollBooths += 2; for (const d of this.tollDefs) d.booths += 2; this.syncTolls(true); }
      else if (id === 'buses') { this.busFleet += 4; for (const d of this.busDefs) d.buses += 4; this.traffic.setBusRoutes(this.busDefs); }
      else if (id === 'doubledecker') { this.busSeats = DECK_SEATS; for (const d of this.busDefs) d.seats = Math.max(d.seats, DECK_SEATS); this.traffic.setBusRoutes(this.busDefs); }
      this.toast(`Card: ${CARDS.find(c => c.id === id)!.name}`, 'good');
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
      segs: [...this.net.segs].map(s => [s.a.x, s.a.y, s.b.x, s.b.y, s.cls.id, s.style, s.kind]),
      nodes: [...this.net.nodes.values()].filter(n => n.type !== 'plain' || n.wide || n.tl).map(nodeEntry),
      props: [...this.props].filter(p => !p.auto).map(p => [LIBRARY[p.item].id, +p.x.toFixed(3), +p.y.toFixed(3), p.flip ? 1 : 0, p.scale]),
      money: this.traffic.budget.money, day: this.day, cam: { ...this.cam },
      lots: [...this.traffic.lots.values()].filter(l => l.level !== LV.EMPTY).map((l): LotTuple => [l.key, l.use, l.level, l.decline, l.seed, l.since]),
      simT: this.traffic.simTime(performance.now()), shift: this.traffic.stats.clock - this.traffic.stats.simT, budget: this.traffic.budget, career: this.traffic.career, round: this.traffic.round,
      parks: this.parkDefs.map((d): [number, number, number, number] => [d.x, d.y, d.w, d.h]),
      tolls: this.tollDefs.map((d): [number, number, number, number, number] => [d.ax, d.ay, d.bx, d.by, d.booths]),
      buses: this.busDefs.map((d): [number, number, number, number, number, number, number, number] => [d.park, +d.sx.toFixed(3), +d.sy.toFixed(3), +d.dx.toFixed(3), +d.dy.toFixed(3), d.buses, d.seats, d.town ?? -1]),
      cardsApplied: this.cardsApplied,
    };
    try { return await writeSave(d); } catch { return 0; }
  }
  private load(d: SaveV5): boolean {
    try {
      this.genTerrain(d.seed);
      for (const [ax, ay, bx, by, cls, style, kind] of d.segs) this.edit.addLegs([{ a: { x: ax, y: ay }, b: { x: bx, y: by } }], CLASS[cls as ClassId] ?? CLASS.street, style as LineStyle, [(kind ?? 0) as SegKind]);
      this.net.rebuild(true);
      for (const entry of d.nodes) applyNodeEntry(this.edit, entry);
      const index = new Map(LIBRARY.map((it, i) => [it.id, i]));
      for (const [id, x, y, flip, scale] of d.props) { const i = index.get(id); if (i !== undefined) this.addProp(i, x, y, !!flip, scale); }
      if (d.parks) this.parkDefs = d.parks.map(([x, y, w, h], k) => ({ id: k + 1, x, y, w, h }));
      if (d.tolls) this.tollDefs = d.tolls.map(([ax, ay, bx, by, booths], k) => ({ id: k + 1, ax, ay, bx, by, booths }));
      if (d.buses) this.busDefs = d.buses.map(([park, sx, sy, dx, dy, buses, seats, town], k) => ({ id: k + 1, park, sx, sy, dx, dy, buses, seats, ...(town !== undefined && town >= 0 ? { town } : {}) }));
      // the cards the save had applied are in its tolls and routes already: only the fields new gates and routes take are set from them
      const cards = d.round?.cards ?? [], n = Math.min(cards.length, d.cardsApplied ?? cards.length);
      this.cardsApplied = n; this.setCardFields(cards.slice(0, n));
      if (d.cam) this.cam = { ...d.cam, z: clamp(d.cam.z, ZOOM_MIN, ZOOM_MAX) };
      return true;
    } catch (e) { console.error('load failed', e); return false; }
  }
  private reset() {
    this.edit.clear(); this.snapshot = null;
    for (const p of [...this.props]) this.removeProp(p);
    this.sprites.clear(); this.autoByKey.clear(); this.forest.clear(); this.perf.forest = 0;
    this.parkCars.clear(); this.parkDefs = []; this.parkBuilt = []; this.parkDrag = null; for (const k of this.parkGround) this.setLotGround(k, null); this.parkGround.clear();
    this.tollDefs = []; this.tollSegs.clear(); this.tollHover = null; for (const k of this.tollGround) this.setLotGround(k, null); this.tollGround.clear();
    this.busDefs = []; this.busPick = null; this.busHover = null;
    // the new town's round has no cards: the mirror goes with it (a frame still in flight would otherwise apply the old cards again)
    this.cardsApplied = 0; this.setCardFields([]); this.traffic.round = new Round().view();
    for (const k of this.lotProps.keys()) this.setLotGround(k, null);
    this.lotProps.clear(); this.lotQueue.clear(); this.staged.clear(); this.perf.lotProps = 0;
    this.traffic.setBudget(null, null); this.showWin = false; this.route = []; this.selected = null; this.builds = [];
  }
  newTown() {
    this.reset(); this.genTerrain(newSeed()); this.ground.terrain(this.terrain); this.sendTerrain();
    this.seedTowns(); this.afterLoad();
    if (this.stampPending) { this.stampPending = false; this.traffic.stamp(TOWN_POP); this.scheduleSave(); }
    void this.save(); this.toast(`New valley (seed ${this.seed})`); this.emit();
  }
  clearTown() { this.reset(); this.afterLoad(); void clearSave(); void this.save(); this.emit(); }
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
    for (const [id, legs] of byClass) this.edit.addLegs(legs, CLASS[id], 0);
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
    this.edit.addLegs(legs, CLASS.road, 0, kinds);
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

  // ---------- main loop ----------
  frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    this.applyLotQueue(); this.flushLotGround();
    if (this.traffic.round.cards.length > this.cardsApplied) this.applyCards();
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
      const movers: Drawable[] = this.traffic ? this.traffic.visible(bx0, by0, bx1, by1) : [];
      this.plantForest(X0, Y0, X1, Y1);
      const f = this.sprites.frame(vis, movers), street = tier === 'street';
      // car lights (night): lamps and beam glows of the cars in the same box, uploaded with the sprites
      const tr = this.traffic, lightOn = !!tr && cam.z >= 0.08;
      if (tr && lightOn && this.lightBuf.length < tr.n * 7 * POINT_STRIDE) this.lightBuf = new Float32Array(tr.n * 7 * POINT_STRIDE);
      const lt = tr && lightOn ? tr.lights(bx0, by0, bx1, by1, ze, Math.floor(now / 350) % 2 === 0, this.lightBuf) : null;
      const [sAt, pAt, lAt] = gl.uploadParts([[f.shadows, street ? f.shadowFloats : 0], [f.stream, f.floats], [this.lightBuf, lt ? (lt.small + lt.beams) * POINT_STRIDE : 0]]);
      if (street) gl.drawShadows(sAt, f.shadowFloats / SHADOW_STRIDE);
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
  /** the traffic flow (key F): the live congestion heat map (see drawHeat) when the worker's geometry and heat are in, then the focus ring of a jump (4 s) */
  private drawFlow(ctx: CanvasRenderingContext2D) {
    const tr = this.traffic, G = tr.heatGeom, R = tr.heatRatio, D = tr.heatDens, now = performance.now();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (this.showFlow && G && R && D) this.drawHeat(ctx, G, R, D, now);
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
    if (this.traffic && this.cam.z >= DISTRICT_Z) this.drawSignals(ctx);
    if (this.cam.z >= PLANNER_Z) this.drawNodeFlags(ctx);
    this.drawFlow(ctx);
    this.drawInspect(ctx);
    this.drawGroundOverlays(ctx);
    this.drawStadium(ctx);
    this.drawParks(ctx);
    this.drawParkPreview(ctx);
    this.drawBuses(ctx);
    this.drawWalkers(ctx, now);
    this.drawTolls(ctx);
    this.drawTollPreview(ctx);
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

  /** the stadium's placeholder art (until Phase 8): the footprint with its pitch inset 8 tiles, the 4 doors, and the label at the centre (every zoom) */
  private drawStadium(ctx: CanvasRenderingContext2D) {
    const s = this.site; if (!s) return;
    const dpr = this.dpr, I = 8;
    const rect = (x: number, y: number, w: number, h: number) => { this.setIso(ctx); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.setTransform(1, 0, 0, 1, 0, 0); };
    rect(s.x, s.y, s.w, s.h); ctx.fillStyle = 'rgba(150,160,175,0.55)'; ctx.fill();
    rect(s.x + I, s.y + I, s.w - 2 * I, s.h - 2 * I); ctx.fillStyle = 'rgba(70,140,70,0.55)'; ctx.fill();
    rect(s.x, s.y, s.w, s.h); ctx.strokeStyle = '#e9edf2'; ctx.lineWidth = 2 * dpr; ctx.stroke();
    ctx.fillStyle = '#ffbe3c';
    for (const d of s.doors) { const p = this.screen(d.x, d.y); ctx.beginPath(); ctx.arc(p.x, p.y, 6 * dpr, 0, Math.PI * 2); ctx.fill(); }
    const c = this.screen(s.c.x, s.c.y), label = `STADIUM · L${this.traffic.round.level}`;
    ctx.font = `bold ${13 * dpr}px ui-sans-serif, system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round'; ctx.lineWidth = 4 * dpr; ctx.strokeStyle = 'rgba(2,6,23,0.9)'; ctx.strokeText(label, c.x, c.y);
    ctx.fillStyle = '#f8fafc'; ctx.fillText(label, c.x, c.y);
    ctx.lineJoin = 'miter'; ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
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
      const legs = this.previewLegs(), cls = this.cls, cs = this.cursorSnap(), block = this.routeBlock(legs), bad = block !== '';
      if (legs.length) {
        this.setIso(ctx); ctx.beginPath(); strip(legs, cls.h + cls.walk); ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = cls.walkTex === 'gravel' ? 'rgba(150,140,120,0.45)' : 'rgba(230,200,160,0.45)'; ctx.fill();
        this.setIso(ctx); ctx.beginPath(); strip(legs, cls.h); ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = bad ? 'rgba(160,40,40,0.6)' : 'rgba(50,60,80,0.6)'; ctx.fill(); ctx.strokeStyle = bad ? 'rgba(248,113,113,0.9)' : 'rgba(255,230,150,0.9)'; ctx.lineWidth = 1.5; ctx.setLineDash([6, 4]); ctx.stroke(); ctx.setLineDash([]);
        if (cls.median) { this.setIso(ctx); ctx.beginPath(); strip(legs, cls.median / 2); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = 'rgba(90,160,70,0.55)'; ctx.fill(); }
        this.setIso(ctx); ctx.beginPath(); for (const l of legs) { ctx.moveTo(l.a.x, l.a.y); ctx.lineTo(l.b.x, l.b.y); } ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.strokeStyle = bad ? '#f87171' : '#ffd866'; ctx.lineWidth = 2; ctx.stroke();
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
    } else if (this.tool === 'junction' && this.hoverNode) {
      const n = this.hoverNode, r = Math.max(...n.arms.map(a => a.h)) + 1.5;
      this.setIso(ctx); ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2); ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = 'rgba(255,216,102,0.22)'; ctx.fill(); ctx.strokeStyle = '#ffd866'; ctx.lineWidth = 2; ctx.setLineDash([8, 5]); ctx.stroke(); ctx.setLineDash([]);
    } else if (this.tool === 'lane' && this.laneHover?.segs.length) {
      // the run the add-lane tool would widen: amber where it can go, red where not
      const h = this.laneHover, cls = h.segs[0]!.cls, legs = h.segs.map(s => ({ a: s.a, b: s.b }));
      this.setIso(ctx); ctx.beginPath(); strip(legs, cls.h + cls.walk); ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = h.why ? 'rgba(240,80,60,0.3)' : 'rgba(255,216,102,0.3)'; ctx.fill();
      this.setIso(ctx); ctx.beginPath(); for (const l of legs) { ctx.moveTo(l.a.x, l.a.y); ctx.lineTo(l.b.x, l.b.y); } ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.strokeStyle = h.why ? '#f87171' : '#ffd866'; ctx.lineWidth = 2; ctx.stroke();
    } else if (this.tool === 'bulldoze' && this.hoverPiece) {
      const pc = this.hoverPiece, cls = pc.seg.cls;
      this.setIso(ctx); ctx.beginPath(); strip([{ a: pc.p0, b: pc.p1 }], cls.h + cls.walk); ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = 'rgba(240,80,60,0.3)'; ctx.fill(); ctx.strokeStyle = '#f87171'; ctx.lineWidth = 1.5; ctx.stroke();
    }
  }
}
