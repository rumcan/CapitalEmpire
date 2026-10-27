// The range business on the map (plan P24 Phase 1, T129): the engine's side of golf/rangebiz.ts. It lays the range's scene (its ground patches,
// its auto props and, once, its cart paths), steps the golfers on the town clock and books their sales, and hands the engine the golfers and cars
// to draw as movers and the balls and labels to draw over the map. The engine gives it a small context, so its own edits stay a few lines.
import type { Drawable } from '../sprites';
import { CAR_SCALE } from '../sprites';
import type { Prop } from '../types';
import type { LotPatch, MowStripes } from '../ground-protocol';
import type { Pt } from '../network';
import type { Rect } from './mode';
import { GOLFER_BASE, GOLFER_FRAMES, GOLFER_PEOPLE, WALK_DIRS } from '../library';
import { carHeading, facings } from '../traffic';
import { PRESETS, presetTex, surfacePreset, type Stripes } from '../paint-presets';
import { SURFACE_TEX } from './paintcourse';
import type { GolfSurface } from './types';
import { RangeSim, garageSlots, rangeScene, rangeStats, upgradeWhy, withPrice, withUpgrade, RANGE_UPGRADES, type CarSlot, type DemandCtx, type RangeBizSave, type RangeClock, type RangeScene, type RangeUpgradeId, type ScenePatch, type ScenePiece } from './rangebiz';
import { CELL_T, type Grid, type GridDiff } from '../ext/course-grid';
import { inPractice, practiceWords, scanPractice, type PracticeScan, type PracticeState } from './practice';
import { PRACTICE_APPEAL, PRACTICE_FEE, PRACTICE_IDS, practiceAppeal, rangeScale, rangeUpkeep, type PracticeId } from './rangesave';
import { PRI } from '../label-place';
import { LABEL_OUTLINE, type WorldLabels } from '../world-labels';
import { COFFEE, EXTRA_IDS, GARAGE_CARS, HOME_AT, HOME_NAME, KIOSK_SHARE, LESSON, LESSON_SHARE, homeStage, needsOf, type HomeStage } from './rangesave';

/** what the host needs of the engine */
export interface RangeHostCtx {
  /** the range state in the save (null: not a range start), the plot and its facing (null: no range business) */
  biz(): RangeBizSave | null; plot(): { rect: Rect; facing: 0 | 1 | 2 | 3 } | null;
  /** the range's car park: its bays (point and heading) and its entrance; null while it is not built */
  carPark(): { bays: CarSlot[]; entrance: Pt } | null;
  /** the range's car park (the lot on the plot) laid on rect (world) instead (T146: it keeps its near half beside the car park building); missing:
   *  the lot stays as it is */
  fitPark?(rect: Rect): void;
  /** places a scene piece as an auto prop (turned to its view, at its size, the key its auto) and removes one */
  addPiece(p: ScenePiece, key: string): Prop | null; removeProp(p: Prop): void;
  /** the ground patches of a key (null drops them), the cart paths to lay (cement slab, committed), the trees to clear off a box */
  setGround(key: string, patches: LotPatch[] | null): void; layPaths(legs: { a: Pt; b: Pt }[]): void; clearTrees(box: [number, number, number, number]): void;
  /** the treasury, a spend ($, construction), takings booked ($, business income) */
  money(): number; spend(n: number): void; book(n: number): void;
  /** the game month as an absolute count (Engine.golfMonthIndex), and the upgrades' upkeep paid ($, the ledger's upkeep: T132); missing: no
   *  upkeep is paid */
  month?(): number; payUpkeep?(n: number): void;
  /** the demand's inputs, the town day's length (sim s), the sim's time (s) and the town clock */
  demand(): DemandCtx; dayLen(): number; simT(): number; clock(): RangeClock;
  save(): void; toast(text: string, kind: 'good' | 'info' | 'warn'): void; emit(): void;
  /** the course grid (null: none yet), and the tee box laid into it as tee cells of no hole (world polygon; T130): false while there is no grid */
  grid(): Grid | null; layTee(pts: number[]): boolean;
}

/** the texture a scene patch is laid with: a golf surface takes the course's own preset (the brush's, the owner's studio presets), else its
 *  game texture; the rest are ground textures as they are */
function patchTex(s: ScenePatch['surf']): LotPatch['tex'] {
  if (s === 'concrete') return 'pad'; // the Paint tool's concrete
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
  const u = s.dir === 'y' ? sc.roadDir : sc.aim, n = Math.hypot(u.x, u.y) || 1;
  return { ux: u.x / n, uy: u.y / n, ox: sc.mowFrom.x, oy: sc.mowFrom.y, w: s.width, l: s.light, k: s.dark, lc: s.lightCol, dc: s.darkCol, t: s.tint, f: s.soft };
}
/** the takings are booked this often (sim s), not on every sale; a frame this long (sim s) is a skip */
const BOOK_EVERY = 2, SKIP_DT = 120;
/** the practice area is read again at most this often (frames) while the grid changes (T130) */
const SCAN_FRAMES = 6;
/** the world labels' keys of the range's own stand-in pills (T151: the moving picker cart's and the practice strokes'), kept from frame to frame */
const PICKER_KEY = 'range:picker', PUTT_KEY = 'range:putting-clip', CHIP_KEY = 'range:chipping-clip';
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
  readonly flyingBuf = new Float32Array(3 * 160); nFlying = 0;
  /** the range card is open */
  cardOpen = false;
  /** the practice facilities as the course grid holds them (T130; null: not read yet), the grid and its rev when read, frames since, and the
   *  practice greens' cup flags (auto props by key) */
  practice: PracticeScan | null = null; private scanG: Grid | null = null; private scanRev = -1; private scanAgo = 0; private cups = new Map<string, Prop>(); private cupKey = '';
  constructor(private ctx: RangeHostCtx, seed: number) { this.sim = new RangeSim(seed, GOLFER_PEOPLE.length); }

  /** the scene laid again when the range's state, its plot or its car park changed (cheap to call every frame: a key compares them) */
  sync(force = false): void {
    const b = this.ctx.biz(), pl = this.ctx.plot(), cp = this.ctx.carPark();
    // the home's stage (T133) re-lays the yard as the lifetime takings grow
    const home = b ? homeStage(b) : 0;
    const key = b && pl ? `${pl.rect.join(',')}:${pl.facing}:${b.owned.join(',')}:${cp ? cp.bays.length : -1}:${home}` : '';
    if (!force && key === this.key) return;
    this.key = key;
    if (!b || !pl) { this.drop(); return; }
    // the player moved house (T133): toasted once, never on a load
    if (this.home >= 0 && home > this.home) this.ctx.toast(`You moved into the ${HOME_NAME[home].toLowerCase()}: the range has taken $${HOME_AT[home - 1]!.toLocaleString()}`, 'good');
    this.home = home;
    const sc = rangeScene(pl.rect, pl.facing, b);
    // the props: kept where the key and picture stay, the rest made again
    const want = new Map(sc.pieces.map(p => [p.key, p]));
    for (const [k, p] of this.props) { const w = want.get(k); if (!w || !this.scene || !sameSpot(this.scene.pieces.find(q => q.key === k), w)) { this.ctx.removeProp(p); this.props.delete(k); } }
    for (const [k, w] of want) if (!this.props.has(k)) { const p = this.ctx.addPiece(w, 'range:' + k); if (p) this.props.set(k, p); }
    this.labels = sc.pieces.filter(p => p.label && this.props.has(p.key)).map(p => ({ p: this.props.get(p.key)!, text: p.label! }));
    // laid as painted areas (the Paint tool's path, which knows the presets), in the scene's order and under anything the player paints
    // (T132: the target greens raised with a sun-lit edge in feathered collars, the outfield's stripes laid on its top)
    const mw = outfieldStripes(sc, rangePreset('outfield')?.stripes);
    this.ctx.setGround('range:ground', sc.patches.map((p, i) => ({ pts: p.pts, tex: patchTex(p.surf), paint: { s: 1, a: 0, b: 0, bt: 'kerb', z: -1e6 + i, ...(p.edge ? { e: p.edge } : {}), ...(p.mow && mw ? { mw } : {}) } })));
    if (!this.scene) { this.ctx.clearTrees(sc.box); this.ctx.clearTrees(sc.practice.box); }
    if (!b.paths) { this.ctx.layPaths(sc.paths); b.paths = true; this.ctx.save(); }
    // the car park building (T146): the lot keeps its near half beside it, the cart path is laid on round it once (an old save's first load too),
    // and its places follow the lot's bays (the lot's first: the nearest)
    if (sc.garage) {
      this.ctx.fitPark?.(sc.garage.lot);
      if (!b.garage) { this.ctx.layPaths([sc.garage.path]); b.garage = true; this.ctx.save(); }
    }
    this.scene = sc;
    this.sim.setScene(sc, [...(cp?.bays ?? []), ...(cp && sc.garage ? garageSlots(sc.garage, GARAGE_CARS) : [])], cp?.entrance ?? null);
  }
  /** everything off the map (a new game, a load, not a range start) */
  drop(): void {
    for (const p of this.props.values()) this.ctx.removeProp(p);
    for (const p of this.cups.values()) this.ctx.removeProp(p);
    this.props.clear(); this.cups.clear(); this.cupKey = ''; this.labels = []; this.scene = null; this.key = ''; this.lastT = -1; this.paidMonth = -1; this.home = -1; this.sim.clear(); this.sim.newDay();
    this.practice = null; this.scanG = null; this.scanRev = -1; this.sim.setPractice(null);
    this.ctx.setGround('range:ground', null);
  }

  /** once a frame: the golfers move on by the sim time since the last frame, and their takings are booked every BOOK_EVERY sim s */
  step(): void {
    const b = this.ctx.biz(); if (!b || !this.scene) return;
    // the tee box into the course grid once (a new game, an old save's first load: T130), then the practice area read as it changes
    if (!b.tee && this.ctx.layTee(this.scene.teeBox)) { b.tee = true; this.ctx.save(); }
    this.scanPractice(b);
    this.upkeep(b);
    const t = this.ctx.simT(), dt = this.lastT < 0 ? 0 : t - this.lastT; this.lastT = t;
    if (dt <= 0) return;
    // a long frame (a slow tab, 20x) is stepped in pieces of half a second, so the golfers walk on; only a skip (two minutes and more of sim
    // time at once: Skip to season end) is booked by the expected sales and clears them
    const clock = this.ctx.clock(), dem = this.ctx.demand(), L = this.ctx.dayLen();
    if (dt >= SKIP_DT) this.owed += this.sim.step(dt, clock, b, dem, L);
    else for (let left = dt; left > 1e-9; left -= 0.5) this.owed += this.sim.step(Math.min(0.5, left), clock, b, dem, L);
    this.owedT += dt;
    if (this.owed > 0 && (this.owedT >= BOOK_EVERY || dt >= SKIP_DT)) { this.ctx.book(Math.round(this.owed)); this.owed = 0; this.owedT = 0; if (this.cardOpen) this.ctx.emit(); }
    this.nFlying = this.sim.flying(this.flyingBuf);
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
      m.item = GOLFER_BASE + (p.person * WALK_DIRS.length + p.row) * GOLFER_FRAMES + p.frame; m.x = p.x; m.y = p.y; m.flip = false; m.scale = 1; m.moving = false;
      // on the upper deck (T133): drawn up there, its footprint (the painter's order) kept on its bay
      m.lift = p.lift;
      m.x0 = p.x - 0.12; m.y0 = p.y - 0.12; m.x1 = p.x + 0.12; m.y1 = p.y + 0.12; out.push(m);
    }
    for (let k = 0; k < d.nCars; k++) {
      const c = d.cars[k]!; if (c.x < x0 || c.x > x1 || c.y < y0 || c.y > y1) continue;
      const f = F[c.type % 5]![carHeading(c.ang)]!, m = this.carMover(k), z = CAR_SCALE * f.size;
      m.item = f.item; m.flip = f.flip; m.scale = z; m.moving = true;
      m.x = c.x - f.ox * z; m.y = c.y - f.oy * z; m.x0 = c.x - f.hx * z; m.x1 = c.x + f.hx * z; m.y0 = c.y - f.hy * z; m.y1 = c.y + f.hy * z;
      out.push(m);
    }
    return out;
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
      for (const t of sc.numbers) {
        const p = screen(t.x, t.y); if (!on(p)) continue;
        const y = p.y - (t.low ? 1.2 : 2.6) * 32 * ze - (t.low ? 0 : px), tw = labels.width(font, t.text) + 8 * dpr;
        labels.pill(t, PRI.marker, t.text, p.x, y, font, tw, px * 1.5, 'rgba(16,24,16,0.8)', 3 * dpr, '#f8fafc', 0.5 * dpr);
      }
      // the car park building's count (T146), as the car parks' own "P · parked/bays"
      if (sc.garage) {
        const q = screen(sc.garage.label.x, sc.garage.label.y);
        if (on(q, 100)) labels.text(sc.garage, PRI.count, `P · ${this.sim.parked(true)}/${GARAGE_CARS}`, q.x, q.y, `bold ${12 * dpr}px ui-sans-serif, system-ui, sans-serif`, 12 * dpr, '#f8fafc', LABEL_OUTLINE, 3 * dpr);
      }
      // the ball picker cart's stand-in pill (T133: the eight-way wagon stands in for it)
      const pk = this.sim.view().picker;
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
  private drawPractice(c: CanvasRenderingContext2D, screen: (x: number, y: number) => { x: number; y: number }, zoom: number, dpr: number, on: (p: { x: number; y: number }, m?: number) => boolean, labels: WorldLabels): void {
    const sc = this.scene!, pa = sc.practice, p = this.practice;
    if (zoom >= 0.03 && !(p ? p.built : this.ctx.biz()?.practice.putting.open)) {
      const pulse = this.hint ? 0.55 + 0.35 * Math.sin(performance.now() / 260) : 0.4;
      c.beginPath();
      for (let i = 0; i < pa.pts.length; i += 2) { const q = screen(pa.pts[i]!, pa.pts[i + 1]!); if (i) c.lineTo(q.x, q.y); else c.moveTo(q.x, q.y); }
      c.closePath(); c.fillStyle = `rgba(236,252,203,${(0.06 * pulse).toFixed(3)})`; c.fill();
      c.setLineDash([7 * dpr, 6 * dpr]); c.lineWidth = 1.6 * dpr; c.strokeStyle = `rgba(236,252,203,${pulse.toFixed(3)})`; c.stroke(); c.setLineDash([]);
      const q = screen(pa.label.x, pa.label.y);
      if (on(q, 200)) {
        // the area's name and (at the street tier) its hint under it: one world label (T151) whose box holds both lines
        const px = Math.round(dpr * 13), lw = 3 * dpr, l = labels.text(pa, PRI.area, 'Practice area', q.x, q.y, `700 ${px}px system-ui, sans-serif`, px, '#ecfccb', 'rgba(10,30,10,0.85)', lw);
        if (zoom >= 0.12) {
          const sf = `600 ${Math.round(px * 0.8)}px system-ui, sans-serif`, t = this.practiceLocked ? 'Opens with your first range upgrade' : 'Build a putting green here (Facilities ▸ Practice)';
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
    this.ctx.spend(u.cost); Object.assign(b, withUpgrade(b, id)); this.sync(true); this.ctx.save();
    this.ctx.toast(`${u.name} built (-$${u.cost.toLocaleString()})`, 'good'); this.ctx.emit();
    return true;
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
      biz: b, stats: st, today: this.sim.today, hours: `${String(st.open).padStart(2, '0')}:00-${st.close}:00`,
      upgrades: RANGE_UPGRADES.map(u => ({ ...u, why: upgradeWhy(b, u.id, money), owned: b.owned.includes(u.id) })),
      demand: dem, dayLen: this.ctx.dayLen(),
      // the practice facilities (T130): each with its state's words, its appeal, its fee and today's and the season's golfers and takings
      practice: PRACTICE_IDS.map(id => {
        const f = this.practice?.[id] ?? { id, state: (b.practice[id].open ? 'open' : 'none') as PracticeState, m2: 0, need: 0 }, s = b.practice[id];
        return { id, name: PRACTICE_NAME[id], state: f.state, words: practiceWords(f), appeal: PRACTICE_APPEAL[id], today: this.sim.practiceToday[id], golfers: s.season.golfers, takings: s.season.takings };
      }),
      practiceAppeal: practiceAppeal(b), fee: PRACTICE_FEE, feeEach: PRACTICE_FEE * rangeScale(this.ctx.dayLen()),
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
      parking: { parked: this.sim.parked(), bays: this.sim.parkBays, turned: this.sim.today.noPark, garage: st.parking ? { parked: this.sim.parked(true), cars: GARAGE_CARS } : null },
    };
  }
}
/** whether two scene pieces stand in the same spot as the same picture */
function sameSpot(a: ScenePiece | undefined, b: ScenePiece): boolean { return !!a && a.id === b.id && a.x === b.x && a.y === b.y && a.q === b.q && a.scale === b.scale && a.fit === b.fit; }
export type RangeCardView = NonNullable<ReturnType<RangeHost['view']>>;
