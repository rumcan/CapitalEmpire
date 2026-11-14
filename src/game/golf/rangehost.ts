// The range business on the map (plan P24 Phase 1, T129): the engine's side of golf/rangebiz.ts. It lays the range's scene (its ground patches,
// its auto props and, once, its cart paths), steps the golfers on the town clock and books their sales, and hands the engine the golfers and cars
// to draw as movers and the balls and labels to draw over the map. The engine gives it a small context, so its own edits stay a few lines.
import { JAM } from '../features';
import type { Drawable } from '../sprites';
import { CAR_SCALE } from '../sprites';
import type { Prop } from '../types';
import type { LotPatch, MowStripes } from '../ground-protocol';
import type { Pt } from '../network';
import type { Rect } from './mode';
import { GOLFER_BASE, GOLFER_FRAMES, GOLFER_PEOPLE, WALK_DIRS } from '../library';
import { carHeading, facings } from '../traffic';
import { hash3, paintOf } from '../car-paint';
import { PRESETS, presetTex, surfacePreset, type Stripes } from '../paint-presets';
import { SURFACE_TEX } from './paintcourse';
import type { GolfSurface } from './types';
import type { OffRoad } from '../offroad';
import { homeScene } from './rangebiz';
import { RangeSim, garageSlots, rangeCounter, rangeScene, rangeStats, upgradeWhy, walkwayOf, walkwayReach, withPrice, withUpgrade, RANGE_UPGRADES, type CarSlot, type DemandCtx, type RangeBizSave, type RangeClock, type RangeScene, type RangeUpgradeId, type ScenePatch, type ScenePiece } from './rangebiz';
import { CASE_BALLS, DUMP_REACH, STANDING_LOW, ballsNear, bucketsLeft, caseCost, dump, fieldCount, nearestBall, orderBalls, perHour, pickAround, pickKit, pickSwath, stockOf, supplyKit, visitBalls, type BallSave, type PickKit } from './rangeballs';
import { worldX, worldY } from '../iso';
import { SPECTATOR_BASE, SPECTATOR_CLIPS, SPECTATOR_FRAMES, SPECTATOR_PEOPLE, STAFF_BASE, STAFF_CLIPS, STAFF_FRAMES, STAFF_PEOPLE } from '../library';
import { WALK_RATE, clipFrame, rowToward } from '../crowdview';
import { PLAYER_CART, PLAYER_RUN, PLAYER_WORKING, SHIFT_HOURS, SHIFT_STARTS, autoKit, bucketBalls, flowOf, nodeRates, onShift, robotBps, sellBps, staffBps, tripBps, washBps } from './rangeauto';
import { CELL_T, type Grid, type GridDiff } from '../ext/course-grid';
import { inPractice, practiceWords, scanPractice, type PracticeScan, type PracticeState } from './practice';
import { cellSet, coveredBy } from './practicestarter';
import type { PlanCells } from './practicebuild';
import type { StepAside } from './practicetool';
import { PRACTICE_APPEAL, PRACTICE_FEE, PRACTICE_IDS, practiceAppeal, rangeScale, rangeUpkeep, type PracticeId } from './rangesave';
import { PRI } from '../label-place';
import { LABEL_OUTLINE, type WorldLabels } from '../world-labels';
import { COFFEE, EXTRA_IDS, GARAGE_CARS, HOME_AT, HOME_NAME, KIOSK_SHARE, LESSON, LESSON_SHARE, homeStage, lotGround, needsOf, type HomeStage, type LotGround } from './rangesave';
import { RANGE_PIC_TEX } from './range-pics';
import { rangeLookOf, type RangeLook } from './range-look';
import { paintedSurfaces } from '../painted-surfaces-live';

/** what the host needs of the engine */
export interface RangeHostCtx {
  /** the range state in the save (null: not a range start), the plot and its facing (null: no range business) */
  biz(): RangeBizSave | null; plot(): { rect: Rect; facing: 0 | 1 | 2 | 3 } | null;
  /** T288: a bare start's home frame while the range is not placed (the save's home rect and golf.dir; null: the range is placed, or none) */
  bare?(): { rect: Rect; facing: 0 | 1 | 2 | 3 } | null;
  /** the range's car parks (T237: those within walking distance of door, the shop's counter: golf/walkserve.ts): their bays (point, heading
   *  and each one's entrance), the first one's entrance and a key that changes with them; null while none is built in reach */
  carPark(door: Pt): { bays: CarSlot[]; entrance: Pt; key?: string; /** T321: the off-road way to the entrance (its garage's cars) */ off?: OffRoad } | null;
  /** the range's car park (the lot on the plot) laid on rect (world) instead (T146: it keeps its near half beside the car park building); missing:
   *  the lot stays as it is */
  fitPark?(rect: Rect): void;
  /** T237: the car parks within walking distance of door (golf/walkserve.ts), nearest walk first: their ids, bays and walks (m); missing: none */
  lots?(door: Pt): { id: number; bays: number; m: number }[];
  /** T239: the range car park's ground as its upgrades have it (packed dirt, gravel, paved: the lot's bays, ground and gate props follow) */
  parkGround?(g: LotGround): void;
  /** T239: the cart paths (every Cart paths & roads path) with a leg in the world box (x0 y0 x1 y1), and the network's version (bumped by
   *  every road or path edit): the walkway the walkers use is read again when it changes */
  pathLegs?(box: readonly [number, number, number, number]): { a: Pt; b: Pt }[]; netVersion?(): number;
  /** places a scene piece as an auto prop (turned to its view, at its size, the key its auto) and removes one */
  addPiece(p: ScenePiece, key: string): Prop | null; removeProp(p: Prop): void;
  /** the ground patches of a key (null drops them), the cart paths to lay (cement slab, committed), the trees to clear off a box */
  setGround(key: string, patches: LotPatch[] | null): void; layPaths(legs: { a: Pt; b: Pt }[]): void; clearTrees(box: [number, number, number, number]): void;
  /** the treasury, a spend ($, construction), takings booked ($, business income) */
  money(): number; spend(n: number): void; book(n: number): void;
  /** T386: the supplier's invoice for balls ($): out of the treasury as the books' Range balls line (missing: not booked) */
  balls?(cost: number): void;
  /** T386: true the first time it is asked for this id in this game (a one-time note: the first time the ball room is out); missing: never */
  once?(id: string): boolean;
  /** the game month as an absolute count (Engine.golfMonthIndex), and the upgrades' upkeep paid ($, the ledger's upkeep: T132); missing: no
   *  upkeep is paid */
  month?(): number; payUpkeep?(n: number): void;
  /** the demand's inputs, the town day's length (sim s), the sim's time (s) and the town clock */
  demand(): DemandCtx; dayLen(): number; simT(): number; clock(): RangeClock;
  /** T266: how fast the range's time runs against the sim's now (1: the same; absent: 1). On the day/night town clock it is the clock's rate now over
   *  the day's mean (golf/pace.ts): the range lives on the flat day's time, so it sells as many buckets a town hour, and a real hour, as on it */
  pace?(): number;
  save(): void; toast(text: string, kind: 'good' | 'info' | 'warn'): void; emit(): void;
  /** the course grid (null: none yet), and the tee box laid into it as tee cells of no hole (world polygon; T130): false while there is no grid */
  grid(): Grid | null; layTee(pts: number[]): boolean; /** T306: the turfed tee's apron (fairway on the land's own cells) */ layApron?(pts: number[]): boolean;
}

/** the texture a scene patch is laid with: a golf surface takes the course's own preset (the brush's, the owner's studio presets), else its
 *  game texture; the rest are ground textures as they are */
function patchTex(s: ScenePatch['surf']): LotPatch['tex'] {
  if (s === 'concrete') return 'pad'; // the Paint tool's concrete
  // #1281: the practice area's starter set: packed earth is the range's tee dirt, the crude bunker's rim plain earth and its sand the course's bunker sand
  if (s === 'dirtGreen') return patchTex('teeDirt');
  if (s === 'scrape') return 'dirt';
  if (s === 'sand') return 'bunkerSand';
  // T258: the range's pictures (golf/range-pics.ts), laid flat by the patch's lay
  if (s === 'mats') return RANGE_PIC_TEX.mats;
  if (s === 'targetGreen') return RANGE_PIC_TEX.green;
  if (s === 'bullseye') return RANGE_PIC_TEX.bullseye;
  if (s === 'dirt' || s === 'grassDry' || s === 'asphaltDark' || s === 'gravel') return s;
  // the range's own presets (T132, T223: the owner tunes them in the studio), else the nearest game texture
  if (s in RANGE_PRESET) { const own = rangePreset(s as RangePresetKey); return own ? presetTex(own.id) : PRESET_FALLBACK[s as RangePresetKey](); }
  return (surfacePreset(s) ?? SURFACE_TEX[s as GolfSurface].tex) as LotPatch['tex'];
}
type RangePresetKey = 'outfield' | 'target' | 'desert' | 'teeDirt' | 'teeTurf' | 'yard';
/** the range's own texture presets (paint-presets.json, T132): the outfield (its mowing stripes) and the target greens; T223: the desert start's
 *  outfield (the Waste area sand's desert, no stripes), the range's tee box as packed dirt and as its divot-scarred turf (its own, so the
 *  course's tees never change with it), and the caravan's and the cottage's desert yard (painted-surfaces.json presets give each its look) */
export const RANGE_PRESET: Readonly<Record<RangePresetKey, string>> = { outfield: 'range-outfield', target: 'range-green', desert: 'range-outfield-desert', teeDirt: 'range-tee', teeTurf: 'range-tee-turf', yard: 'range-home-yard' };
/** the texture a range patch takes when its preset is missing (the course's fairway, green and tee, the waste sand and the dirt) */
const PRESET_FALLBACK: Readonly<Record<RangePresetKey, () => LotPatch['tex']>> = {
  outfield: () => patchTex('fairway'), target: () => patchTex('green'), teeTurf: () => patchTex('tee'),
  desert: () => 'wasteSand' as LotPatch['tex'], yard: () => 'wasteSand' as LotPatch['tex'], teeDirt: () => 'dirt',
};
const rangePreset = (s: RangePresetKey) => PRESETS.find(p => p.id === RANGE_PRESET[s]) ?? null;
/** the outfield's mowing stripes (PatchPaint.mw) from its preset's Stripes, laid in the range's frame: 'x' bands across the line of play
 *  (alternating down the range), 'y' bands down it (alternating across); null when the preset has them off */
export function outfieldStripes(sc: Pick<RangeScene, 'aim' | 'roadDir' | 'mowFrom'>, s: Stripes | null | undefined): MowStripes | null {
  if (!s?.on) return null;
  const u = s.dir === 'y' ? sc.roadDir : sc.aim, n = Math.hypot(u.x, u.y) || 1, na = Math.hypot(sc.aim.x, sc.aim.y) || 1;
  // T227: the line of play rides along, so the course finish lays the outfield's bands as the fairways' (course-finish finishMow)
  return { ux: u.x / n, uy: u.y / n, ox: sc.mowFrom.x, oy: sc.mowFrom.y, w: s.width, l: s.light, k: s.dark, lc: s.lightCol, dc: s.darkCol, t: s.tint, f: s.soft, lx: sc.aim.x / na, ly: sc.aim.y / na };
}
/** the takings are booked this often (sim s), not on every sale; a frame this long (sim s) is a skip */
const BOOK_EVERY = 2, SKIP_DT = 120;
/** T386 (#1043): the lying balls are one instanced draw (the engine's GL points: gl.ts drawPoints), at most this many a frame, thinned past it (every k-th
 *  ball, a little larger); the floats a point takes (gl.ts POINT_STRIDE: x y of the world px, r g b a); the pile a click picks up is this wide (tiles) */
export const BALL_DRAW_MAX = 4000, BALL_POINT_FLOATS = 6, PILE_REACH = 2.4;
/** a pick order (click a pile) looks for balls this far round the pile's middle (tiles) before it takes the basket home */
const ORDER_REACH = 7;
/** T386 part 2: the range attendant's stand-in: a young man in a cap from the spectators' art (staff_range_m is not rigged yet) */
const ATTENDANT_ART = Math.max(0, SPECTATOR_PEOPLE.findIndex(p => p.id === 'spectator:spec_m_young_cap'));
/** #1235: the painted range attendant (art/spectators/staff_range_m: walk, idle and a pick clip), once prep-sprites has packed it; -1 until then */
const ATTENDANT_STAFF = STAFF_PEOPLE.findIndex(p => p.id === 'staff:staff_range_m');
/** the practice area is read again at most this often (frames) while the grid changes (T130) */
const SCAN_FRAMES = 6;
/** the world labels' keys of the range's own stand-in pills (T151: the moving picker cart's and the practice strokes'), kept from frame to frame */
const ROBOT_KEY = 'range:robot', ATTENDANT_KEY = 'range:attendant', PICKER_KEY = 'range:picker', PUTT_KEY = 'range:putting-clip', CHIP_KEY = 'range:chipping-clip';
/** the practice facilities' names (T130) */
export const PRACTICE_NAME: Readonly<Record<PracticeId, string>> = { putting: 'Putting green', chipping: 'Chipping green and bunker' };

export class RangeHost {
  scene: RangeScene | null = null;
  readonly sim: RangeSim;
  /** the scene's auto props by key, and its stand-in labels (prop, text) */
  private props = new Map<string, Prop>(); labels: { p: Prop; text: string }[] = [];
  private key = ''; private lastT = -1; private owed = 0; private owedT = 0;
  /** the home's stage laid now (T133; -1: none yet since the load) */
  private home: HomeStage | -1 = -1;
  private movers: Drawable[] = []; private carDraw: Drawable[] = [];
  /** the balls in the air (x y h triples) */
  readonly flyingBuf = new Float32Array(3 * 600); nFlying = 0; // (T251: room for hundreds in the air and rolling, the bench's busy range)
  /** the range card is open */
  cardOpen = false;
  /** T386: the ball room's upgrade tree (the flyout beside the card) is open */
  treeOpen = false;
  /** T386 (the bench's full outfield, ?fieldBalls=N): balls to lay on the outfield as soon as the range stands; the draw of the lying balls (off: the bench's A/B) and the points the
   *  last frame drew */
  benchField = 0; drawField = true; lastField = 0;
  /** the practice facilities as the course grid holds them (T130; null: not read yet), the grid and its rev when read, frames since, and the
   *  practice greens' cup flags (auto props by key) */
  practice: PracticeScan | null = null; private scanG: Grid | null = null; private scanRev = -1; private scanAgo = 0; private cups = new Map<string, Prop>(); private cupKey = '';
  constructor(private ctx: RangeHostCtx, seed: number) { this.sim = new RangeSim(seed, GOLFER_PEOPLE.length); }
  /** T258: the range's ground art in place of the studio's (a test's, the console's: window.__game.range.lookOverride; null: the studio's) */
  lookOverride: RangeLook | null = null;
  /** T258: the range's ground art: the mats and the target greens as their pictures or their stand-ins, and the bullseye green (the studio's
   *  Painted > Range art, painted-surfaces.json `range`: golf/range-look.ts) */
  look(): RangeLook { return this.lookOverride ?? rangeLookOf(paintedSurfaces()); }

  /** the scene laid again when the range's state, its plot or its car park changed (cheap to call every frame: a key compares them) */
  sync(force = false): void {
    const b0 = this.ctx.biz();
    // T239: the car park's ground follows its upgrades (dirt, gravel, paved), before its bays are read
    if (b0 && this.ctx.plot()) this.ctx.parkGround?.(lotGround(b0));
    const b = b0, pl = this.ctx.plot(), cp = pl ? this.ctx.carPark(rangeCounter(pl.rect, pl.facing)) : null;
    // the home's stage (T133) re-lays the yard as the lifetime takings grow; T258: the studio's range art (the mats and greens as pictures or
    // stand-ins, the bullseye) re-lays the ground when the owner saves it
    const home = b ? homeStage(b) : 0, look = this.look();
    // T288: a bare start's home alone while the range is not placed (the trailer and its yard: no range, no golfers)
    const bare = b && !pl ? this.ctx.bare?.() ?? null : null;
    const key = b && pl ? `${pl.rect.join(',')}:${pl.facing}:${b.owned.join(',')}:${cp ? cp.key ?? cp.bays.length : -1}:${home}:${look.mats}:${look.greens}:${look.bullseye}:${b.practiceAt ? b.practiceAt.join(',') : b.practiceAt === null ? 'none' : ''}:${b.starter ? `${b.starter.seed}.${b.starter.gone.join('-')}` : ''}`
      : bare ? `bare:${bare.rect.join(',')}:${bare.facing}:${home}` : '';
    if (!force && key === this.key) { this.syncWalk(); return; }
    if (bare && b) { this.layBare(bare, b, home); this.key = key; return; }
    this.key = key; this.bareKey = ''; this.bareGate = null;
    if (!b || !pl) { this.drop(); return; }
    // the player moved house (T133): toasted once, never on a load
    if (this.home >= 0 && home > this.home) this.ctx.toast(`You moved into the ${HOME_NAME[home].toLowerCase()}: the range has taken $${HOME_AT[home - 1]!.toLocaleString()}`, 'good');
    this.home = home;
    const sc = rangeScene(pl.rect, pl.facing, b, { look });
    // the props: kept where the key and picture stay, the rest made again
    const want = new Map(sc.pieces.map(p => [p.key, p]));
    for (const [k, p] of this.props) { const w = want.get(k); if (!w || !this.scene || !sameSpot(this.scene.pieces.find(q => q.key === k), w)) { this.ctx.removeProp(p); this.props.delete(k); } }
    for (const [k, w] of want) if (!this.props.has(k)) { const p = this.ctx.addPiece(w, 'range:' + k); if (p) this.props.set(k, p); }
    this.labels = sc.pieces.filter(p => p.label && this.props.has(p.key)).map(p => ({ p: this.props.get(p.key)!, text: p.label! }));
    // laid as painted areas (the Paint tool's path, which knows the presets), in the scene's order and under anything the player paints
    // (T132: the target greens raised with a sun-lit edge in feathered collars, the outfield's stripes laid on its top)
    const mw = outfieldStripes(sc, rangePreset('outfield')?.stripes);
    // (T258: a picture laid flat by its lay: its turn, scale and corner)
    this.ctx.setGround('range:ground', sc.patches.map((p, i) => ({ pts: p.pts, tex: patchTex(p.surf), paint: { s: p.lay?.s ?? 1, a: p.lay?.a ?? 0, b: 0, bt: 'kerb', z: -1e6 + i, ...(p.edge ? { e: p.edge } : {}), ...(p.mow && mw ? { mw } : {}), ...(p.lay ? { o: [p.lay.x, p.lay.y] as [number, number] } : {}) } })));
    if (!this.scene) { this.ctx.clearTrees(sc.box); this.ctx.clearTrees(sc.practice.box); }
    // the old start's cement walkway, laid once (an old save's first load); T239: a guided start's walkway is the player's to lay
    if (b.paths === false) { this.ctx.layPaths(sc.paths); b.paths = true; this.ctx.save(); }
    // the car park building (T146): the lot keeps its near half beside it, the cart path is laid on round it once (an old save's first load too),
    // and its places follow the lot's bays (the lot's first: the nearest)
    if (sc.garage) {
      this.ctx.fitPark?.(sc.garage.lot);
      if (!b.garage) { this.ctx.layPaths([sc.garage.path]); b.garage = true; this.ctx.save(); }
    }
    this.scene = sc; this.walkVer = -1; this.walkKey = ''; this.syncWalk();
    this.sim.setScene(sc, [...(cp?.bays ?? []), ...(cp && sc.garage ? garageSlots(sc.garage, GARAGE_CARS).map(g => (cp.off ? { ...g, off: cp.off } : g)) : [])], cp?.entrance ?? null);
  }
  /** T288: the bare start's home laid now (its frame and stage; '' none) and its gate (where you first stand; null: none) */
  private bareKey = ''; bareGate: Pt | null = null;
  /** T288: lays a bare start's home alone (golf/rangebiz.ts homeScene): its props and its yard's ground, the trees cleared off its yard once */
  private layBare(h: { rect: Rect; facing: 0 | 1 | 2 | 3 }, b: RangeBizSave, home: HomeStage): void {
    if (this.scene) this.drop();
    const first = !this.bareKey; this.bareKey = 'laid'; this.home = home;
    const hs = homeScene(h.rect, h.facing, b), want = new Map(hs.pieces.map(p => [p.key, p]));
    for (const [key, p] of this.props) if (!want.has(key)) { this.ctx.removeProp(p); this.props.delete(key); }
    for (const [key, w] of want) { const old = this.props.get(key); if (old) { this.ctx.removeProp(old); this.props.delete(key); } const p = this.ctx.addPiece(w, 'range:' + key); if (p) this.props.set(key, p); }
    this.labels = hs.pieces.filter(p => p.label && this.props.has(p.key)).map(p => ({ p: this.props.get(p.key)!, text: p.label! }));
    this.ctx.setGround('range:ground', hs.patches.map((p, i) => ({ pts: p.pts, tex: patchTex(p.surf), paint: { s: 1, a: 0, b: 0, bt: 'kerb', z: -1e6 + i } })));
    if (first) this.ctx.clearTrees(hs.box);
    this.bareGate = hs.gate;
  }
  /** T239: the network's version and the paths' signature the walkway was read for */
  private walkVer = -1; private walkKey = '';
  /** T239: the walkway the walkers use (rangebiz walkwayOf), read again when the paths near the range front change: the scene the sim holds
   *  takes it at once (golfers already walking keep their way) */
  private syncWalk(): void {
    const sc = this.scene; if (!sc || !this.ctx.pathLegs) return;
    const v = this.ctx.netVersion?.() ?? 0; if (v === this.walkVer) return; this.walkVer = v;
    const legs = this.ctx.pathLegs(sc.front), k = legs.map(l => `${l.a.x},${l.a.y},${l.b.x},${l.b.y}`).sort().join(';');
    if (k === this.walkKey) return; this.walkKey = k;
    sc.walk = walkwayOf(sc, legs);
  }
  /** T239: whether the range's walkers have a walking path joining the car park, the shop and the tee */
  hasWalkway(): boolean { this.syncWalk(); return !!this.scene?.walk; }
  /** T459 (#1215): which of the car park, the shop and the tee box's back the paths near the range front reach now (null: no range scene) */
  walkReach(): { lot: boolean; shop: boolean; tee: boolean } | null {
    const sc = this.scene; if (!sc || !this.ctx.pathLegs) return null;
    return walkwayReach(sc, this.ctx.pathLegs(sc.front));
  }
  /** everything off the map (a new game, a load, not a range start) */
  drop(): void {
    for (const p of this.props.values()) this.ctx.removeProp(p);
    for (const p of this.cups.values()) this.ctx.removeProp(p);
    this.props.clear(); this.cups.clear(); this.cupKey = ''; this.labels = []; this.bareKey = ''; this.bareGate = null; this.scene = null; this.key = ''; this.lastT = -1; this.paidMonth = -1; this.home = -1; this.sim.clear(); this.sim.newDay(); this.sim.setBalls(null); this.order = null;
    this.practice = null; this.scanG = null; this.scanRev = -1; this.sim.setPractice(null);
    this.ctx.setGround('range:ground', null);
  }

  /** once a frame: the golfers move on by the sim time since the last frame, and their takings are booked every BOOK_EVERY sim s */
  step(): void {
    const b = this.ctx.biz(); if (!b || !this.scene) return;
    // T386: the sim sells and lands the range's balls: the save's book (a load or a new game brings a new one)
    if (this.sim.book !== (b.balls ?? null)) this.sim.setBalls(b.balls ?? null);
    if (this.benchField > 0 && b.balls) { this.sim.fill(this.benchField); this.benchField = 0; }
    // the tee box into the course grid once (a new game, an old save's first load: T130), then the practice area read as it changes
    if (!b.tee && this.ctx.layTee(this.scene.teeBox)) { b.tee = true; this.ctx.save(); }
    // T306 (#891): turfed, the land between the tee box and the outfield is turf too (once; an old save's first load after the turf too)
    if (b.tee && !b.apron && this.scene.apron && this.ctx.layApron?.(this.scene.apron)) { b.apron = true; this.ctx.save(); }
    this.scanPractice(b);
    this.upkeep(b);
    // (T266: the range's own time: the sim's, on the day/night clock run at its rate now over the day's mean; see pace)
    const t = this.ctx.simT(), dt = (this.lastT < 0 ? 0 : t - this.lastT) * (this.ctx.pace?.() ?? 1); this.lastT = t;
    if (dt <= 0) return;
    // a long frame (a slow tab, 20x) is stepped in pieces of half a second, so the golfers walk on; only a skip (two minutes and more of sim
    // time at once: Skip to season end) is booked by the expected sales and clears them
    const clock = this.ctx.clock(), dem = this.ctx.demand(), L = this.ctx.dayLen();
    if (dt >= SKIP_DT) this.owed += this.sim.step(dt, clock, b, dem, L);
    else for (let left = dt; left > 1e-9; left -= 0.5) this.owed += this.sim.step(Math.min(0.5, left), clock, b, dem, L);
    this.owedT += dt;
    if (this.owed > 0 && (this.owedT >= BOOK_EVERY || dt >= SKIP_DT)) {
      const n = Math.round(this.owed); this.ctx.book(n); if (b.balls) b.balls.till += n; // (T386: what the range takes is the range's till too: its gear is bought with it)
      this.owed = 0; this.owedT = 0; if (this.cardOpen) this.ctx.emit();
    }
    this.nFlying = this.sim.flying(this.flyingBuf);
    if (b.balls && b.owned.includes('autoorder')) this.standing(b, b.balls);
    // T386: the first time the ball room is out and golfers drive on, say what to do (once a game)
    if (b.balls && this.sim.today.noBalls > 0 && this.ctx.once?.('balls-out')) this.ctx.toast('The ball room is out of balls: golfers are driving on. Walk out onto the range and pick the balls up (hold F over them, or click a pile), then empty your basket at the ball room.', 'warn');
  }

  /** the month the upgrades' upkeep was last paid for (-1: not yet read since the load) */
  private paidMonth = -1;
  /** the upgrades' upkeep (T132): rangeUpkeep a game month, paid as each month begins (a skip pays every month it crossed), booked as upkeep and
   *  counted in the range's season and lifetime upkeep. The month of a load or a new game is not charged again */
  private upkeep(b: RangeBizSave): void {
    if (!this.ctx.month || !this.ctx.payUpkeep) return;
    const m = Math.floor(this.ctx.month());
    if (this.paidMonth < 0 || m < this.paidMonth) { this.paidMonth = m; return; }
    if (m === this.paidMonth) return;
    const n = (m - this.paidMonth) * rangeUpkeep(b); this.paidMonth = m;
    if (n <= 0) return;
    this.ctx.payUpkeep(n); b.season.upkeep += n; b.total.upkeep += n; this.ctx.save(); if (this.cardOpen) this.ctx.emit();
  }
  /** the golfers and cars in the tile box as movers (reused): the golfers' 3D frames, the cars at their size (CAR_SCALE x the owner size) about their centres */
  movers_(x0: number, y0: number, x1: number, y1: number): Drawable[] {
    const out = this.movers; out.length = 0;
    if (!this.scene) return out;
    const d = this.sim.view(), F = facings();
    for (let k = 0; k < d.nPeople; k++) {
      const p = d.people[k]!; if (p.x < x0 || p.x > x1 || p.y < y0 || p.y > y1) continue;
      const m = this.mover(out.length);
      m.item = (p.group === 2 ? STAFF_BASE + (p.person * WALK_DIRS.length + p.row) * STAFF_FRAMES : GOLFER_BASE + (p.person * WALK_DIRS.length + p.row) * GOLFER_FRAMES) + p.frame;   // (#1235: the academy pro may be the painted staff)
      m.x = p.x; m.y = p.y; m.flip = false; m.scale = 1; m.moving = false;
      // on the upper deck (T133): drawn up there, its footprint (the painter's order) kept on its bay
      m.lift = p.lift;
      m.x0 = p.x - 0.12; m.y0 = p.y - 0.12; m.x1 = p.x + 0.12; m.y1 = p.y + 0.12; out.push(m);
    }
    // T386 part 2: the attendants on shift (a spectator in a young man's cap stands in for staff_range_m), walking between the ball room and the pile
    for (let k = 0; k < d.nAgents; k++) {
      const g = d.agents[k]!; if (g.kind !== 'attendant' || g.x < x0 || g.x > x1 || g.y < y0 || g.y > y1) continue;
      const m = this.mover(out.length), row = rowToward(Math.cos(g.ang), Math.sin(g.ang));
      // (T459: at the ball room's door, emptying his basket, he stands: he does not walk on the spot)
      if (ATTENDANT_STAFF >= 0) {   // #1235: the painted attendant: walking with his basket, or picking at the pile
        const C = g.pick ? STAFF_CLIPS.pick : STAFF_CLIPS.walk, span = g.pick ? 1.6 : 1.4, rate = g.pick ? 1 : WALK_RATE;
        m.item = STAFF_BASE + (ATTENDANT_STAFF * WALK_DIRS.length + row) * STAFF_FRAMES + (g.moving || g.pick ? clipFrame(C, C.times[0]! + ((this.sim.clockT * rate + g.id * 0.7) % span)) : STAFF_CLIPS.idle.start);
      } else {
        const W = SPECTATOR_CLIPS.walk, frame = g.moving ? clipFrame(W, W.times[0]! + ((this.sim.clockT * WALK_RATE + g.id * 0.7) % 1.4)) : SPECTATOR_CLIPS.idle.start;
        m.item = SPECTATOR_BASE + (ATTENDANT_ART * WALK_DIRS.length + row) * SPECTATOR_FRAMES + frame;
      }
      m.x = g.x; m.y = g.y; m.flip = false; m.scale = 1; m.moving = false; m.lift = 0;
      m.x0 = g.x - 0.12; m.y0 = g.y - 0.12; m.x1 = g.x + 0.12; m.y1 = g.y + 0.12; out.push(m);
    }
    for (let k = 0; k < d.nCars; k++) {
      const c = d.cars[k]!; if (c.x < x0 || c.x > x1 || c.y < y0 || c.y > y1) continue;
      const f = F[c.type % 5]![carHeading(c.ang)]!, m = this.carMover(k), z = CAR_SCALE * f.size;
      m.item = f.item; m.flip = f.flip; m.scale = z; m.moving = true; m.paint = c.id >= 0 ? paintOf(hash3(c.id, 0x5a)) : 0; // (T228: its golfer's own paint)
      m.x = c.x - f.ox * z; m.y = c.y - f.oy * z; m.x0 = c.x - f.hx * z; m.x1 = c.x + f.hx * z; m.y0 = c.y - f.hy * z; m.y1 = c.y + f.hy * z;
      out.push(m);
    }
    return out;
  }
  /** T322: each car's id and point (tiles), every car of the range's sim (the tyre tracks sample them) */
  carPoints(f: (id: number, x: number, y: number) => void): void {
    if (!this.scene) return;
    const d = this.sim.view();
    for (let k = 0; k < d.nCars; k++) { const c = d.cars[k]!; f(c.id >= 0 ? c.id : -1 - k, c.x, c.y); }
  }
  private mover(k: number): Drawable { const a = this.peopleDraw; return a[k] ?? (a[k] = { item: 0, x: 0, y: 0, flip: false, scale: 1, x0: 0, y0: 0, x1: 0, y1: 0, moving: false }); }
  private peopleDraw: Drawable[] = [];
  private carMover(k: number): Drawable { const a = this.carDraw; return a[k] ?? (a[k] = { item: 0, x: 0, y: 0, flip: false, scale: CAR_SCALE, x0: 0, y0: 0, x1: 0, y1: 0, moving: true }); }

  /** over the map (canvas px, screen: a tile point to canvas px, ze: zoom x dpr): at the street tier the lying balls (white dots) and the balls in
   *  the air (a dot up its arc, its shadow on the grass) and the distance numbers over their markers; at district zoom the "Driving Range" label.
   *  The labels (the numbers, the car park building's count, the stand-in pills, the area's and the range's names) are world labels (T151):
   *  they go to labels, placed with the map's others so none overlap */
  drawOver(c: CanvasRenderingContext2D, screen: (x: number, y: number) => { x: number; y: number }, ze: number, zoom: number, dpr: number, w: number, h: number, labels: WorldLabels): void {
    const sc = this.scene; if (!sc) return;
    const on = (p: { x: number; y: number }, m = 40) => p.x > -m && p.y > -m && p.x < w + m && p.y < h + m;
    this.drawPractice(c, screen, zoom, dpr, on, labels);
    if (zoom >= 0.12) {
      const r = Math.max(0.9 * dpr, 0.09 * 64 * ze), L = this.sim.lying, n = this.sim.nLying;
      c.fillStyle = 'rgba(255,255,255,0.92)'; c.beginPath();
      for (let i = 0; i < n; i++) { const p = screen(L[2 * i]!, L[2 * i + 1]!); if (on(p, 4)) { c.moveTo(p.x + r, p.y); c.arc(p.x, p.y, r, 0, Math.PI * 2); } }
      c.fill();
      const F = this.flyingBuf;
      c.fillStyle = 'rgba(20,40,10,0.35)'; c.beginPath();
      for (let i = 0; i < this.nFlying; i++) { const p = screen(F[3 * i]!, F[3 * i + 1]!); if (on(p)) { c.moveTo(p.x + r, p.y); c.ellipse(p.x, p.y, r, r * 0.5, 0, 0, Math.PI * 2); } }
      c.fill(); c.fillStyle = '#ffffff'; c.beginPath();
      for (let i = 0; i < this.nFlying; i++) { const p = screen(F[3 * i]!, F[3 * i + 1]!), hy = F[3 * i + 2]! * 32 * ze * 1.4; if (on(p, 200)) { c.moveTo(p.x + r * 1.2, p.y - hy); c.arc(p.x, p.y - hy, r * 1.2, 0, Math.PI * 2); } }
      c.fill();
      // the distance numbers: a small dark plate with white figures just above each marker
      const px = Math.round(dpr * Math.max(9, 11 * Math.sqrt(Math.min(1, zoom / 0.3)))), font = `700 ${px}px system-ui, sans-serif`;
      // J7d/J7e (#1234, #1258): in the jam no distance is drawn here: the range's distances are PNG yardage signs in its scene (yardage-signs.ts) or nothing,
      // and a junk pile's name and distance show while the pointer is over it (the jam's labels show on hover: world-labels.ts hoverOnly)
      if (JAM) {
        // (J7e: the distances are the scene's PNG signs or nothing; a junk pile's name and distance show only while the pointer is over it)
        for (const j of sc.junk) { const q = screen(j.x, j.y); if (on(q)) labels.text(j, PRI.name, `${j.name} · ${j.m} m`, q.x, q.y - 1.4 * 32 * ze, font, px, '#f8fafc', LABEL_OUTLINE, 3 * dpr); }
      } else for (const t of sc.numbers) {
        const p = screen(t.x, t.y); if (!on(p)) continue;
        const y = p.y - (t.low ? 1.2 : 2.6) * 32 * ze - (t.low ? 0 : px), tw = labels.width(font, t.text) + 8 * dpr;
        labels.pill(t, PRI.marker, t.text, p.x, y, font, tw, px * 1.5, 'rgba(16,24,16,0.8)', 3 * dpr, '#f8fafc', 0.5 * dpr);
      }
      // the car park building's count (T146), as the car parks' own "P · parked/bays"
      if (sc.garage) {
        const q = screen(sc.garage.label.x, sc.garage.label.y);
        if (on(q, 100)) labels.text(sc.garage, PRI.count, `P · ${this.sim.parked(true)}/${GARAGE_CARS}`, q.x, q.y, `bold ${12 * dpr}px ui-sans-serif, system-ui, sans-serif`, 12 * dpr, '#f8fafc', LABEL_OUTLINE, 3 * dpr);
      }
      // T386: the ball room's door (a stand-in label until its art lands): its stock, or red when it is out and the bays sit empty
      const bk = this.balls();
      if (bk) {
        const q = screen(sc.ballRoom.x, sc.ballRoom.y);
        if (on(q, 100)) {
          const out = bk.clean + bk.dirty < bucketBalls(visitBalls(this.ctx.dayLen()), autoKit(this.ctx.biz()?.owned ?? [])), px = Math.round(dpr * 11), font = `700 ${px}px system-ui, sans-serif`;
          const t = out ? 'Ball room · OUT OF BALLS' : `Ball room · ${Math.floor(bk.clean + bk.dirty).toLocaleString()} balls${bk.dirty >= 1 ? ` (${Math.floor(bk.dirty).toLocaleString()} dirty)` : ''}`; // (the dirty ones sell too)
          labels.pill(sc.ballRoom, out ? PRI.warn : PRI.count, t, q.x, q.y - 3.6 * 32 * ze, font,   // (above the shop's roof: a label never lies on the art)
             labels.width(font, t) + 10 * dpr, px * 1.6, out ? 'rgba(127,29,29,0.92)' : 'rgba(16,24,16,0.8)', 4 * dpr, '#f8fafc', 0.5 * dpr);
        }
      }
      // T386 part 2: the robot pickers (small teal pucks with a ball on top: stand-ins) and the stand-in pills of the robots and the attendants
      const ag = this.sim.view(); let rob = false, att = false;
      for (let i = 0; i < ag.nAgents; i++) {
        const a = ag.agents[i]!, q = screen(a.x, a.y); if (!on(q, 30)) continue;
        if (a.kind === 'robot') {
          const w = Math.max(6 * dpr, 0.5 * 64 * ze);
          c.fillStyle = '#2dd4bf'; c.strokeStyle = '#134e4a'; c.lineWidth = 1.2 * dpr; c.beginPath(); c.roundRect(q.x - w / 2, q.y - w * 0.5, w, w * 0.55, w * 0.18); c.fill(); c.stroke();
          c.fillStyle = '#ffffff'; c.beginPath(); c.arc(q.x, q.y - w * 0.62, Math.max(1.2 * dpr, w * 0.17), 0, Math.PI * 2); c.fill();
          if (!rob) { rob = true; this.standInPill(labels, ROBOT_KEY, 'Stand In for robot picker', q.x, q.y - w - 12 * dpr, dpr); }
        } else if (!att && ATTENDANT_STAFF < 0) { att = true; this.standInPill(labels, ATTENDANT_KEY, 'Stand In for the range attendant (staff_range_m)', q.x, q.y - Math.max(44 * dpr, 4.6 * 32 * ze), dpr); }
      }
      // the ball picker cart's stand-in pill (T133: the eight-way wagon stands in for it)
      const pk = ag.picker;
      if (pk) {
        const q = screen(pk.x, pk.y);
        if (on(q)) this.standInPill(labels, PICKER_KEY, 'Stand In for Ball picker cart', q.x, q.y - 40 * dpr, dpr);
      }
    } else if (zoom >= 0.03) {
      const p = screen(sc.label.x, sc.label.y); if (!on(p, 200)) return;
      const px = Math.round(dpr * 12);
      labels.text(sc.label, PRI.name, 'Driving Range', p.x, p.y, `700 ${px}px system-ui, sans-serif`, px, '#ecfccb', 'rgba(10,30,10,0.85)', 3 * dpr);
    }
  }
  /** a stand-in pill of the range's own (the picker cart, the practice strokes): amber words on a dark pill centred on (x, y), a world label of the
   *  last rank */
  private standInPill(labels: WorldLabels, key: unknown, t: string, x: number, y: number, dpr: number): void {
    if (JAM) return;   // (the jam MVP: no stand-in labels, the owner 2026-11-13)
    const fp = Math.round(dpr * 10), font = `600 ${fp}px system-ui, sans-serif`;
    labels.pill(key, PRI.standIn, t, x, y, font, labels.width(font, t) + 10 * dpr, fp * 1.6, 'rgba(15,23,42,0.78)', 6 * dpr, '#fde68a', 0.5 * dpr);
  }

  // ---- the practice facilities (T130)
  /** reads the practice area when the grid changed (at most every SCAN_FRAMES frames): the facilities' states, the save's open flags (the appeal
   *  follows them; a facility that opens is toasted), the golfers' spots and the cup flags */
  private scanPractice(b: RangeBizSave): void {
    const g = this.ctx.grid(), sc = this.scene; if (!g || !sc) return;
    this.scanAgo++;
    if (g === this.scanG && g.rev === this.scanRev) return;
    if (this.practice && this.scanAgo < SCAN_FRAMES) return;
    this.scanG = g; this.scanRev = g.rev; this.scanAgo = 0;
    const p = scanPractice(g, sc.practice.box); this.practice = p; this.sim.setPractice(p);
    let changed = false;
    for (const id of PRACTICE_IDS) {
      const open = p[id].state === 'open', f = b.practice[id]; if (f.open === open) continue;
      f.open = open; changed = true;
      if (open) this.ctx.toast(`${PRACTICE_NAME[id]} open: +${Math.round(PRACTICE_APPEAL[id] * 100)}% visitors, $${PRACTICE_FEE} a golfer who uses it`, 'good');
    }
    if (changed) { this.ctx.save(); this.ctx.emit(); } else if (this.cardOpen) this.ctx.emit();
    // the cup flags: three on the putting green, one on the chipping green, once each is open
    const want: ScenePiece[] = [];
    for (const id of PRACTICE_IDS) if (p[id].state === 'open') p[id].cups.forEach((c, i) => want.push({ key: `practice-${id}${i}`, id: 'business:golf-pin-red', x: c.x, y: c.y, q: 0, scale: id === 'putting' ? 0.2 : 0.26 }));
    const key = want.map(w => `${w.key}@${w.x},${w.y}`).join('|'); if (key === this.cupKey) return;
    this.cupKey = key;
    for (const pr of this.cups.values()) this.ctx.removeProp(pr);
    this.cups.clear();
    for (const w of want) { const pr = this.ctx.addPiece(w, 'range:' + w.key); if (pr) this.cups.set(w.key, pr); }
  }
  /** the cells a course edit laid in the practice area hold no hole (T130: practice facilities are not holes): set in the grid and in the diff, so
   *  undo and redo keep them so */
  practiceCells(g: Grid | null, d: GridDiff | null): void {
    const sc = this.scene; if (!g || !d || !sc || !this.ctx.biz()) return;
    const [bx0, by0, bx1, by1] = sc.practice.box;
    for (let k = 0; k < d.n; k++) {
      if (!d.h1[k]) continue;
      const i = d.idx[k]!, cx = i % d.w, cy = (i - cx) / d.w, x = d.x0 + (cx + 0.5) * CELL_T, y = d.y0 + (cy + 0.5) * CELL_T;
      if (x < bx0 || x >= bx1 || y < by0 || y >= by1) continue;
      d.h1[k] = 0; const j = Math.floor((x - g.x0) / CELL_T) + Math.floor((y - g.y0) / CELL_T) * g.w; if (j >= 0 && j < g.hole.length) g.hole[j] = 0;
    }
  }
  /** the course pill's words for tile (x, y) (CursorEnv.zone): the practice area lays no hole */
  zoneAt(x: number, y: number): string { const sc = this.scene; return sc && this.ctx.biz() && inPractice(sc.practice, x, y) ? 'practice area (no hole)' : ''; }
  /** the practice facilities as the unlocks and hints read them (null: not a range start) */
  practiceFacts(): { putting: PracticeState; chipping: PracticeState } | null {
    if (!this.ctx.biz() || !this.scene) return null;
    const p = this.practice, b = this.ctx.biz()!;
    return { putting: p?.putting.state ?? (b.practice.putting.open ? 'open' : 'none'), chipping: p?.chipping.state ?? (b.practice.chipping.open ? 'open' : 'none') };
  }
  /** where the practice area is (its middle) and the facility to build next there (the hint's Show me, the card's Show area: T206, the
   *  practice tool armed with it): the putting green until it is open, then the chipping green */
  practiceTarget(): { x: number; y: number; kind: PracticeId } | null {
    const sc = this.scene; if (!sc) return null;
    const f = this.practiceFacts();
    return { ...sc.practice.label, kind: f && f.putting === 'open' ? 'chipping' : 'putting' };
  }

  /** the practice area (T130): until something is built there a faint dashed outline with its "Practice area" label (brighter while the hint
   *  points at it: hint), and at the street tier the stand-in pills of the practice strokes once golfers use a facility */
  hint = false;
  /** the practice area is not open yet (a range start's ramp, T132: it opens with the first range upgrade): its label says so */
  practiceLocked = false;
  /** T239: the practice area's price while it is land for sale (null: the player's) */
  practiceSale: number | null = null;
  /** #1281 (the owner: "if you click on the practice area label it takes you to the window to build the proper green"): the practice area is the selected thing, its
   *  build window (the range card at its Practice facilities) open: its outline and name stay while it is. practiceFocus counts the clicks that opened it, so the
   *  card scrolls to the Practice facilities and flashes them each time */
  practiceSelected = false; practiceFocus = 0;
  /** #1281: the area's name stands without its hint line (the engine sets it while Walk's hover words, which say the same, are up) */
  quietLabel = false;
  /** #1281: a facility built over the starter set (its cells: the plan's) replaces the pieces under it. They go from the save now (the scene lays itself again at
   *  the next frame: the key follows the save) and the returned step brings them back (undo) or takes them away again (redo); null: none was under it */
  replaceStarters(c: PlanCells): StepAside | null {
    const b = this.ctx.biz(), sc = this.scene, g = this.ctx.grid(); if (!b?.starter || !sc || !g || !sc.starter.length) return null;
    const hit = coveredBy(sc.starter, b.starter.gone, g, cellSet(c.green, c.bunker, c.tee, c.rough));
    if (!hit.length) return null;
    const before = [...b.starter.gone], after = [...before, ...hit].sort((x, y) => x - y), set = (gone: number[]) => { const k = this.ctx.biz()?.starter; if (k) { k.gone = [...gone]; this.ctx.save(); this.ctx.emit(); } };
    b.starter.gone = after; this.ctx.save();
    return { undo: () => set(before), redo: () => set(after) };
  }
  private drawPractice(c: CanvasRenderingContext2D, screen: (x: number, y: number) => { x: number; y: number }, zoom: number, dpr: number, on: (p: { x: number; y: number }, m?: number) => boolean, labels: WorldLabels): void {
    const sc = this.scene!, pa = sc.practice, p = this.practice;
    // (#1281: the outline stays, and brighter, while the area is the selected thing, its build window open; the name label is there for a click to find, on hover as every
    // name is, built or not)
    const built = !!(p ? p.built : this.ctx.biz()?.practice.putting.open), sel = this.practiceSelected;
    if (zoom >= 0.03 && pa.pts.length && (!built || sel)) {
      const pulse = this.hint ? 0.55 + 0.35 * Math.sin(performance.now() / 260) : sel ? 0.85 : 0.4;
      c.beginPath();
      for (let i = 0; i < pa.pts.length; i += 2) { const q = screen(pa.pts[i]!, pa.pts[i + 1]!); if (i) c.lineTo(q.x, q.y); else c.moveTo(q.x, q.y); }
      c.closePath(); c.fillStyle = `rgba(236,252,203,${((sel ? 0.1 : 0.06) * pulse).toFixed(3)})`; c.fill();
      c.setLineDash([7 * dpr, 6 * dpr]); c.lineWidth = (sel ? 2.4 : 1.6) * dpr; c.strokeStyle = `rgba(236,252,203,${pulse.toFixed(3)})`; c.stroke(); c.setLineDash([]);
    }
    if (zoom >= 0.03 && pa.pts.length) {
      const q = screen(pa.label.x, pa.label.y);
      if (on(q, 200)) {
        // the area's name and (at the street tier, while nothing is built there) its hint under it: one world label (T151) whose box holds both lines
        const px = Math.round(dpr * 13), lw = 3 * dpr, l = labels.text(pa, PRI.area, 'Practice area', q.x, q.y, `700 ${px}px system-ui, sans-serif`, px, '#ecfccb', 'rgba(10,30,10,0.85)', lw);
        const hint = this.quietLabel ? '' : this.practiceSale !== null ? `For sale: $${this.practiceSale.toLocaleString()} (Course ▸ Land for sale)` : this.practiceLocked ? 'Opens with your first range upgrade' : built ? '' : JAM ? 'Click to build proper greens here' : 'Click here to build a putting green';
        if (zoom >= 0.12 && hint) {
          const sf = `600 ${Math.round(px * 0.8)}px system-ui, sans-serif`, t = hint;
          // the box from the name's top to the hint's foot, its centre moved down to the middle
          const top = q.y - px / 2 - lw / 2, foot = q.y + px * 1.3 + px * 0.4 + lw / 2, mid = (top + foot) / 2;
          l.sub = t; l.subFont = sf; l.subFill = '#d9f99d'; l.w = Math.max(l.w, labels.width(sf, t) + lw); l.h = foot - top;
          l.y = l.py = mid; l.ty = q.y - mid; l.subDy = q.y + px * 1.3 - mid;
        }
      }
    }
    // the stand-in pills of the strokes (the 3D golfers have no putting or chipping clip yet: GOLF-SPRITES)
    if (zoom >= 0.12 && p) for (const id of PRACTICE_IDS) {
      const f = p[id]; if (f.state !== 'open' || !f.centre || !this.sim.practiceToday[id]) continue;
      const q = screen(f.centre.x, f.centre.y); if (!on(q)) continue;
      this.standInPill(labels, id === 'putting' ? PUTT_KEY : CHIP_KEY, id === 'putting' ? 'Stand In for golfer putting clip' : 'Stand In for golfer chipping clip', q.x, q.y - 34 * dpr, dpr);
    }
  }

  // ---- the range card's actions
  /** buys upgrade id (pays, re-lays the scene, saves); false with the reason toasted when it cannot */
  buy(id: RangeUpgradeId): boolean {
    const b = this.ctx.biz(); if (!b) return false;
    const why = upgradeWhy(b, id, this.ctx.money()); if (why) { this.ctx.toast(why, 'warn'); return false; }
    const u = RANGE_UPGRADES.find(q => q.id === id)!;
    this.ctx.spend(u.cost); Object.assign(b, withUpgrade(b, id));
    if (u.till && b.balls) b.balls.till = Math.max(0, b.balls.till - u.cost); // (T386: the ball loop's gear is paid from the range's till too)
    this.sync(true); this.ctx.save();
    this.ctx.toast(u.till && !JAM ? `${u.name} bought (-$${u.cost.toLocaleString()} from the range's till)` : `${u.name} ${u.till ? 'bought' : 'built'} (-$${u.cost.toLocaleString()})`, 'good'); this.ctx.emit(); // (J7c: in the jam the till is no purse: the cash pays)
    return true;
  }

  // ---- T386 (#1043): the ball loop: your hand work, the supplier, the balls as the engine draws them and the card shows them
  /** the range's balls (the save's: null when it is not a range start) */
  balls(): BallSave | null { return this.ctx.biz()?.balls ?? null; }
  /** what you pick with, from the upgrades owned (golf/rangeballs.ts pickKit) */
  kit(): PickKit { return pickKit(this.ctx.biz()?.owned ?? []); }
  /** a pick order (you clicked a pile): the pile's middle and the phase, 'pick' (the balls round it are picked up as you stand among them) then 'back' (the basket
   *  goes home to the ball room); null: none. Esc, a key walk or a click elsewhere cancels it */
  order: { x: number; y: number; phase: 'pick' | 'back' } | null = null;
  startOrder(x: number, y: number): void { this.order = { x, y, phase: 'pick' }; }
  cancelOrder(): void { this.order = null; }
  private pickAcc = 0;
  /** one frame of your hand work: the mover (you on foot, or your cart) went from (ox, oy) to (x, y) in dt real seconds. On foot with `pick` (F held, or a pick
   *  order in its pick phase) the balls within your reach go into your basket at the tube's or your hands' rate (a push picker also takes those within its swath
   *  along the way); in your cart with the pull-behind picker the balls within its swath go into its hopper; at the ball room (DUMP_REACH of its door) the basket
   *  and, from the cart, the hopper are emptied into it. Returns the balls picked and the balls emptied this frame */
  work(w: { x: number; y: number; ox: number; oy: number; dt: number; pick: boolean; inCart: boolean }): { picked: number; dumped: number } {
    const b = this.balls(), sc = this.scene, biz = this.ctx.biz(); if (!b || !sc || !biz) return { picked: 0, dumped: 0 };
    const kit = pickKit(biz.owned), moved = Math.hypot(w.x - w.ox, w.y - w.oy) > 1e-6;
    let picked = 0, dumped = 0;
    if (Math.hypot(w.x - sc.ballRoom.x, w.y - sc.ballRoom.y) <= DUMP_REACH) {
      dumped += dump(b, 'basket', kit.push ? 'push' : 'hand'); if (w.inCart) dumped += dump(b, 'hopper', 'cart');
    }
    if (w.inCart) {
      const space = kit.hopper - b.hopper;
      if (kit.cart > 0 && moved && space > 0) { const n = pickSwath(b, w.ox, w.oy, w.x, w.y, kit.cart / 2, space); b.hopper += n; picked += n; }
      this.pickAcc = 0;
    } else if (w.pick) {
      const space = kit.basket - b.basket;
      if (space > 0 && fieldCount(b) > 0) {
        let n = 0;
        if (kit.push && moved) n = pickSwath(b, w.ox, w.oy, w.x, w.y, kit.push / 2, space);
        else { this.pickAcc += kit.rate * w.dt; const want = Math.floor(this.pickAcc + 1e-9); if (want > 0) { n = pickAround(b, w.x, w.y, kit.reach, Math.min(want, space)); this.pickAcc -= want; if (n < want) this.pickAcc = 0; } }
        b.basket += n; picked += n;
      } else this.pickAcc = 0;
    } else this.pickAcc = 0;
    return { picked, dumped };
  }
  /** a pick order's next step (the engine walks you): null to carry on (the balls at your feet are picked in work), `walk` a ball to step to when none lies within
   *  your reach, `back` to take a full (or finished) basket to the ball room, `done` once it is emptied there. The order ends when the pile near its middle is gone */
  orderStep(px: number, py: number, moving: boolean): { walk?: Pt; back?: true; done?: true } | null {
    const o = this.order, b = this.balls(), sc = this.scene; if (!o || !b || !sc) return null;
    const kit = this.kit(), room = sc.ballRoom;
    if (o.phase === 'back') {
      if (b.basket === 0 && Math.hypot(px - room.x, py - room.y) <= DUMP_REACH) { this.order = null; return { done: true }; }
      return moving ? null : b.basket === 0 ? (this.order = null, { done: true }) : { back: true };
    }
    const left = ballsNear(b, o.x, o.y, ORDER_REACH);
    if (b.basket >= kit.basket || left === 0) { if (b.basket > 0) { o.phase = 'back'; return { back: true }; } this.order = null; return { done: true }; }
    if (moving || ballsNear(b, px, py, kit.reach) > 0) return null;
    const next = nearestBall(b, px, py, ORDER_REACH * 2);
    if (next) return { walk: next };
    if (b.basket > 0) { o.phase = 'back'; return { back: true }; }
    this.order = null; return { done: true };
  }
  /** the pile under a point (tiles): its middle (the nearest ball to the point within PILE_REACH) and the balls round it, or null when none lies there */
  pileAt(x: number, y: number): { x: number; y: number; n: number } | null {
    const b = this.balls(); if (!b || !this.scene) return null;
    const at = nearestBall(b, x, y, PILE_REACH); if (!at) return null;
    return { x: at.x, y: at.y, n: ballsNear(b, at.x, at.y, PILE_REACH) };
  }
  /** an order of `cases` cases of balls from the supplier (the tree's Supplier's account): into the ball room, charged to the till and the treasury, booked as the
   *  books' Range balls line; false with the reason toasted when it cannot */
  orderBalls(cases = 1, standing = false): boolean {
    const b = this.ctx.biz(), bs = b?.balls; if (!b || !bs) return false;
    if (!b.owned.includes('supplier')) { if (!standing) this.ctx.toast("Open the supplier's account first (Ball room upgrades)", 'warn'); return false; }
    const sup = supplyKit(b.owned), today = Math.round(bs.day.bought / CASE_BALLS), o = orderBalls(bs, cases, today, JAM ? this.ctx.money() : Math.min(bs.till, this.ctx.money()), sup);
    if (!o.cases) { if (!standing) this.ctx.toast(today >= sup.perDay ? "The supplier has delivered today's cases" : `A case costs $${caseCost(sup).toLocaleString()}: not enough in the range's till`, 'warn'); return false; }
    bs.till = Math.max(0, bs.till - o.cost); this.ctx.balls?.(o.cost);
    this.ctx.toast(`${standing ? 'Standing order: ' : ''}${(o.cases * CASE_BALLS).toLocaleString()} balls delivered (-$${o.cost.toLocaleString()})`, 'good'); this.ctx.save(); this.ctx.emit();
    return true;
  }
  /** T386 part 3: the Standing order: with the ball room down to STANDING_LOW buckets the supplier brings a case on his own (orderBalls: the till pays, the day's cases last), looked at every few sim seconds */
  private standT = -99;
  private standing(b: RangeBizSave, bs: BallSave): void {
    const t = this.sim.clockT; if (t - this.standT < 5) return; this.standT = t;
    if (stockOf(bs) >= STANDING_LOW * bucketBalls(visitBalls(this.ctx.dayLen()), autoKit(b.owned))) return;
    this.orderBalls(1, true);
  }
  /** the lying balls as GL points for the engine's one instanced draw: the points' world px (iso) and colour, BALL_POINT_FLOATS each, the shadows first (a soft dark dot
   *  a little down and left of each ball: the sun is at the upper right) and then the balls (white). Only the balls inside the world box X0 Y0 X1 Y1, thinned to at
   *  most BALL_DRAW_MAX (every k-th). `out` holds 2 * BALL_DRAW_MAX points. Returns the points in each set (the balls start at out[n * BALL_POINT_FLOATS]) */
  fieldPoints(out: Float32Array, X0: number, Y0: number, X1: number, Y1: number): number {
    const b = this.balls(); if (!b || !this.scene || !this.drawField) { this.lastField = 0; return 0; }
    const f = b.field, N = f.length / 2, S = BALL_POINT_FLOATS;
    let vis = 0; for (let k = 0; k < N; k++) { const X = worldX(f[2 * k]!, f[2 * k + 1]!), Y = worldY(f[2 * k]!, f[2 * k + 1]!); if (X >= X0 && X <= X1 && Y >= Y0 && Y <= Y1) vis++; }
    if (!vis) { this.lastField = 0; return 0; }
    const stride = Math.max(1, Math.ceil(vis / BALL_DRAW_MAX)); let n = 0, seen = 0;
    for (let k = 0; k < N; k++) {
      const X = worldX(f[2 * k]!, f[2 * k + 1]!), Y = worldY(f[2 * k]!, f[2 * k + 1]!); if (X < X0 || X > X1 || Y < Y0 || Y > Y1) continue;
      if (seen++ % stride) continue;
      if (n >= BALL_DRAW_MAX) break;
      let o = n * S; out[o] = X - 1.6; out[o + 1] = Y + 1.4; out[o + 2] = 0.06; out[o + 3] = 0.12; out[o + 4] = 0.04; out[o + 5] = 0.42; // the shadow: down and left
      o = (BALL_DRAW_MAX + n) * S; out[o] = X; out[o + 1] = Y; out[o + 2] = 1; out[o + 3] = 1; out[o + 4] = 0.97; out[o + 5] = 1;
      n++;
    }
    // (the balls' set packed straight after the shadows' set)
    if (n < BALL_DRAW_MAX) out.copyWithin(n * S, BALL_DRAW_MAX * S, (BALL_DRAW_MAX + n) * S);
    this.lastField = n; return n;
  }
  /** T386 part 2: the first range attendant's shift starts at this town hour (one of SHIFT_STARTS; the second starts a shift later) */
  setShift(h: number): void { const b = this.balls(); if (!b || !SHIFT_STARTS.includes(h)) return; b.shift = h; this.ctx.save(); this.ctx.emit(); }
  /** the ball loop as the card shows it (null: not a range start) */
  ballView() {
    const b = this.balls(), biz = this.ctx.biz(); if (!b || !biz) return null;
    const dayLen = this.ctx.dayLen(), kit = pickKit(biz.owned), cases = Math.round(b.day.bought / CASE_BALLS), a = autoKit(biz.owned), vb = bucketBalls(visitBalls(dayLen), a), sup = supplyKit(biz.owned);
    // T386 part 2: the flow (balls an hour at each stage and the bottleneck): you at a steady pace, the staff by the day's average, the robots; the tap and the washer; the bays
    const hour = this.ctx.clock().hour, st = rangeStats(biz, this.ctx.demand()), you = PLAYER_WORKING * tripBps(kit, { run: PLAYER_RUN, cart: PLAYER_CART });
    let staffAvg = 0; for (let h = 0; h < 24; h++) staffAvg += staffBps(a, kit, h, b.shift) / 24;
    const doneToday = Object.values(b.day.picked).reduce((x, n) => x + n, 0), hrs = Math.max(1, hour);
    const flow = flowOf({ outfield: fieldCount(b), dirty: b.dirty, clean: b.clean, pickBps: you + staffAvg + robotBps(a), washBps: washBps(a), sellBps: sellBps(st.bays, vb, this.sim.bayHours(dayLen), dayLen), doing: { pick: doneToday / hrs, wash: b.day.washed / hrs, sell: b.day.sold / hrs }, dayLen });
    let onNow = 0; for (let i = 0; i < a.attendants; i++) if (onShift(i, hour, b.shift)) onNow++;
    return {
      flow, dirty: b.dirty, staff: { attendants: a.attendants, shift: b.shift, starts: SHIFT_STARTS, hours: SHIFT_HOURS, onNow }, rates: nodeRates(kit, a, dayLen),
      clean: b.clean, buckets: bucketsLeft(b, vb), vb, field: fieldCount(b), inPlay: b.inPlay, basket: b.basket, hopper: b.hopper, kit, till: Math.floor(b.till),
      out: b.clean + b.dirty < vb, noBalls: this.sim.today.noBalls, supplier: biz.owned.includes('supplier'), caseBalls: CASE_BALLS, caseCost: caseCost(sup), casesLeft: Math.max(0, sup.perDay - cases),
      day: b.day, total: b.total, handHour: Math.round(perHour(kit.rate, dayLen)),
    };
  }
  /** sets the bucket price (whole dollars in the band) */
  setPrice(price: number): void { const b = this.ctx.biz(); if (!b) return; b.price = withPrice(b, price).price; this.ctx.save(); this.ctx.emit(); }
  /** whether tile (x, y) is on the range's front (the shop, the yard, the mats: where a click opens the card) */
  hit(x: number, y: number): boolean {
    const pl = this.ctx.plot(); if (!pl || !this.scene) return false;
    const [rx, ry, rw, rh] = pl.rect, f = pl.facing;
    // the front: the 26 tiles of the plot on the road side (the frame's v 0..26), turned with the facing
    const fr: Rect = f === 2 ? [rx, ry, rw, 26] : f === 0 ? [rx, ry + rh - 26, rw, 26] : f === 1 ? [rx, ry, 26, rh] : [rx + rw - 26, ry, 26, rh];
    return (x >= fr[0] && x < fr[0] + fr[2] && y >= fr[1] && y < fr[1] + fr[3]) || inPractice(this.scene.practice, x, y);
  }
  /** the range as the card shows it */
  view() {
    const b = this.ctx.biz(); if (!b) return null;
    const dem = this.ctx.demand(), st = rangeStats(b, dem), money = this.ctx.money();
    return {
      biz: b, stats: st, treeOpen: this.treeOpen, today: this.sim.today, hours: `${String(st.open).padStart(2, '0')}:00-${st.close}:00`, balls: this.ballView(),
      upgrades: RANGE_UPGRADES.map(u => ({ ...u, why: upgradeWhy(b, u.id, money), owned: b.owned.includes(u.id) })),
      demand: dem, dayLen: this.ctx.dayLen(),
      // the practice facilities (T130): each with its state's words, its appeal, its fee and today's and the season's golfers and takings
      practice: PRACTICE_IDS.map(id => {
        const f = this.practice?.[id] ?? { id, state: (b.practice[id].open ? 'open' : 'none') as PracticeState, m2: 0, need: 0 }, s = b.practice[id];
        return { id, name: PRACTICE_NAME[id], state: f.state, words: practiceWords(f), appeal: PRACTICE_APPEAL[id], today: this.sim.practiceToday[id], golfers: s.season.golfers, takings: s.season.takings };
      }),
      practiceAppeal: practiceAppeal(b), fee: PRACTICE_FEE, feeEach: PRACTICE_FEE * rangeScale(this.ctx.dayLen()),
      // #1281: how many pieces of the practice area's starter set still stand (dirt greens and the bunker scrape; 0: none, or all replaced)
      practiceStarter: this.scene && b.starter ? this.scene.starter.filter(p => !b.starter!.gone.includes(p.id)).length : 0,
      // the upgrades' upkeep (T132): a game month now, and paid this season
      upkeep: rangeUpkeep(b), upkeepSeason: b.season.upkeep,
      // the World of Golf extras (T133): what needs what, the kiosk's and the academy's season, the home and its next step
      needs: Object.fromEntries(RANGE_UPGRADES.map(u => [u.id, needsOf(u).map(n => RANGE_UPGRADES.find(q => q.id === n)!.name)])) as Record<RangeUpgradeId, string[]>,
      extras: EXTRA_IDS.map(id => ({ id, owned: b.owned.includes(id), season: b.extras[id].season, today: id === 'kiosk' ? this.sim.today.coffees : this.sim.today.lessons,
        words: id === 'kiosk' ? `${Math.round(KIOSK_SHARE * 100)}% of golfers buy a $${COFFEE} coffee · ${this.sim.today.kioskQueue} in line` : `${Math.round(LESSON_SHARE * 100)}% of golfers take a $${LESSON} lesson on the academy's two bays` })),
      home: { stage: homeStage(b), name: HOME_NAME[homeStage(b)], next: homeStage(b) < 2 ? { name: HOME_NAME[homeStage(b) + 1]!, at: HOME_AT[homeStage(b) as 0 | 1] } : null, total: b.total.takings },
      upstairs: this.sim.today.upstairs,
      // the car park (T146): the range's cars parked now of its bays (the lot's and the building's), the cars a full car park turned away today,
      // and the building's own count
      parking: { parked: this.sim.parked(), bays: this.sim.parkBays, turned: this.sim.today.noPark, garage: st.parking ? { parked: this.sim.parked(true), cars: GARAGE_CARS } : null,
        // T237: the car parks within walking distance of the shop (golf/walkserve.ts), nearest walk first
        lots: this.scene ? this.ctx.lots?.(this.scene.counter) ?? [] : [] },
    };
  }
}
/** whether two scene pieces stand in the same spot as the same picture */
function sameSpot(a: ScenePiece | undefined, b: ScenePiece): boolean { return !!a && a.id === b.id && a.x === b.x && a.y === b.y && a.q === b.q && a.scale === b.scale && a.fit === b.fit; }
export type RangeCardView = NonNullable<ReturnType<RangeHost['view']>>;
