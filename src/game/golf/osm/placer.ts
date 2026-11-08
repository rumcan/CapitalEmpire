// The placing mode of a real course (T356, #998): a map-data course in hand in a game under way. Course › Place a real course › (a course) takes it in
// hand: its outline and a faint drawing of its holes follow the pointer, green where it may go and affordable, red where it cannot or the money is short,
// with the price by the pointer; R / Shift+R (or the wheel with Shift) turn it 15 degrees, Alt turns it freely; a click asks (the pop-up lists what goes);
// Place it lays it, Cancel leaves everything as it was. This class is the mode's state and its drawing; the engine is its host (the world it plans against,
// the money, the toasts, and laying the course: buying the land, taking down what stands there, painting the grid). Pure of the engine, so the tests drive it
// with a made-up host; only draw() needs a canvas.
import { drawGhostHint, drawGhostPoly, type GhostView } from '../../ext/ghost-preview';
import type { Pt } from '../../network';
import { loadOsmSpec, osmCourseInfo, osmDisplayName, type OsmCourseInfo } from './index';
import { PLACE_EDGE, placeLabel, planPlace, popupText, priceLines, type PlacePlan, type PlaceWorld } from './place';
import { gridBuildCost, scratchOf } from './placegrid';
import { ROT_FINE, ROT_STEP, coverOutline, firstFittingAngle, normDeg, rotateSpec } from './rotate';
import type { OsmCourseSpec } from './types';

/** what the card, the pop-up and the saved game need of a course: a shipped course's entry without its loader (a downloaded course, T358, has none) */
export type RealInfo = Omit<OsmCourseInfo, 'load'>;
/** the entry of a course from its spec (a downloaded course's: its name, place, holes, its par as the game works it out and as the map has it, its scale) */
export const realInfoOf = (s: OsmCourseSpec): RealInfo => ({ id: s.id, name: s.name, place: s.place, holes: s.holes.length, par: s.gameParTotal, mappedPar: s.parTotal, ...(s.scale < 1 ? { scale: s.scale } : {}) });

/** what the placing mode reads of the game and asks it to do */
export interface RealHost {
  /** the map's side, tiles */
  map: number;
  /** the world as the planner reads it (the engine's live collections); fresh: worked out from the live state now, nothing kept from an earlier plan (a click and Place it plan so) */
  world(fresh?: boolean): PlaceWorld;
  /** a key that changes whenever something a plan reads does (the roads, the lots, the land, the money, a tournament): plans are worked out again */
  revision(): string;
  /** the tile under the camera's middle: where a course in hand first stands */
  centre(): Pt;
  toast(text: string, kind?: 'info' | 'warn' | 'good'): void;
  emit(): void;
  /** Select in hand, the cards that hide the map shut: the course in hand has the map */
  enter(): void;
  /** how many holes the game has now (the pop-up says they are replaced) */
  holes(): number;
  /** lays the course: buys the land, takes down what stands there, paints the grid, puts the markers, pays (the plan is the one just worked out); true when it did */
  lay(c: { id: string; info: RealInfo; spec: OsmCourseSpec; turned: OsmCourseSpec; plan: PlacePlan; deg: number }): boolean;
  /** a downloaded course (T358's library) by its id, as a spec the game would build (scaled to fit the map when it must be): null when it is no longer kept or
   *  has no holes. Absent (the tests): only the shipped courses */
  kept?(id: string): Promise<{ info: RealInfo; spec: OsmCourseSpec } | null>;
}

/** the course in hand as the card and the pop-up read it */
export interface RealView {
  id: string; name: string; place: string; credit: string; holes: number; par: number; scale: number;
  /** the turn, degrees, and the plan of the pose under the pointer (null before the pointer has been over the map) */
  deg: number; plan: PlacePlan | null; label: { text: string; bad: boolean } | null;
  /** the pop-up, when a click asked: the plan it lists, its sentence and its sum line by line, and the holes of the game it replaces (0: none) */
  popup: { plan: PlacePlan; text: string; lines: { label: string; amount: number }[]; replaces: number } | null;
}

/** the faint drawing of a course: its areas by surface as one path each (filled non-zero: outer rings wound one way, inner the other, so overlaps join and
 *  islands cut out), and the hole lines. Built once for a spec in its own frame and drawn under the pose's transform */
interface Sketch { layers: { path: Path2D; fill: string }[]; lines: Path2D; w: number; h: number }
const LAYERS: { surf: string; fill: string }[] = [
  { surf: 'rough', fill: 'rgba(120,180,95,0.16)' }, { surf: 'fairway', fill: 'rgba(160,222,115,0.46)' }, { surf: 'water', fill: 'rgba(95,165,235,0.62)' },
  { surf: 'bunker', fill: 'rgba(242,224,165,0.85)' }, { surf: 'tee', fill: 'rgba(196,240,150,0.70)' }, { surf: 'green', fill: 'rgba(90,230,135,0.82)' },
];
const area2 = (r: readonly number[]): number => { let a = 0; for (let i = 0, n = r.length >> 1; i < n; i++) { const j = (i + 1) % n; a += r[2 * i]! * r[2 * j + 1]! - r[2 * j]! * r[2 * i + 1]!; } return a; };
function ringTo(path: Path2D, r: readonly number[], positive: boolean): void {
  const n = r.length >> 1; if (n < 3) return;
  const rev = (area2(r) > 0) !== positive;
  for (let k = 0; k < n; k++) { const i = rev ? n - 1 - k : k; if (k) path.lineTo(r[2 * i]!, r[2 * i + 1]!); else path.moveTo(r[2 * i]!, r[2 * i + 1]!); }
  path.closePath();
}
function sketchOf(spec: OsmCourseSpec): Sketch | null {
  if (typeof Path2D === 'undefined') return null;
  const layers = LAYERS.map(l => ({ path: new Path2D(), fill: l.fill, surf: l.surf }));
  for (const a of spec.areas) {
    const L = layers.find(l => l.surf === a.surf); if (!L) continue;
    a.rings.forEach((r, k) => ringTo(L.path, r, k === 0));
  }
  const lines = new Path2D();
  for (const h of spec.holes) { const l = h.line; for (let i = 0; i + 1 < l.length; i += 2) { if (i) lines.lineTo(l[i]!, l[i + 1]!); else lines.moveTo(l[i]!, l[i + 1]!); } }
  return { layers: layers.map(l => ({ path: l.path, fill: l.fill })), lines, w: spec.w, h: spec.h };
}

/** the placing mode */
export class RealPlacer {
  /** the course in hand (null: none) and its shipped entry, its spec as converted, the turn (degrees clockwise) and where its land's middle stands (whole tiles) */
  id: string | null = null; info: RealInfo | null = null; spec: OsmCourseSpec | null = null; deg = 0; at: Pt | null = null;
  /** the plan a click asked the pop-up about (null: no pop-up) */
  confirming: PlacePlan | null = null;
  /** the course being loaded (its id), so a second pick or a cancel in the meantime wins */
  private loading: string | null = null;
  private build = 0;
  private turnedBy = new Map<number, OsmCourseSpec>();
  private cache: { key: string; plan: PlacePlan } | null = null;
  private sketch: { spec: OsmCourseSpec; s: Sketch | null } | null = null;
  /** the plan the card last showed and when (ms): the card is told of a new one at most every 150 ms while the pointer moves */
  private shown: PlacePlan | null = null; private shownAt = 0;
  constructor(private host: RealHost) {}

  get active(): boolean { return this.id !== null; }

  /** the course `id` as a spec: a shipped course, else a downloaded one (the host's library); null when it is neither */
  private async source(id: string): Promise<{ info: RealInfo; spec: OsmCourseSpec } | null> {
    const info = osmCourseInfo(id);
    if (info) { const spec = await loadOsmSpec(id); return spec ? { info, spec } : null; }
    return (await this.host.kept?.(id)) ?? null;
  }

  /** takes the course `id` (a shipped course's, or a downloaded one's, T358) in hand: loads it, and says so (and why not) when it cannot go in this map in any
   *  turn. True when it is in hand */
  async start(id: string): Promise<boolean> {
    this.cancel(false);
    this.loading = id;
    const src = await this.source(id).catch(() => null);
    if (this.loading !== id) return false; // (put down, or another picked, while it loaded)
    this.loading = null;
    if (!src) { this.host.toast(osmCourseInfo(id) || !this.host.kept ? 'That course is not in this build' : 'That course is no longer kept in this browser: download it again on the new-game card (Your course)', 'warn'); return false; }
    return this.take(id, src.info, src.spec);
  }

  /** takes a spec in hand as it is (the owner, 2026-11-08: after "Build this course" in the new-game card's search the player may place the course it found with
   *  this mode instead of starting a new game on it): the same as `start` for a course whose spec the caller already has. True when it is in hand */
  startSpec(spec: OsmCourseSpec): Promise<boolean> {
    this.cancel(false);
    return Promise.resolve(this.take(spec.id, realInfoOf(spec), spec));
  }

  /** the course in hand: its turn that fits the map first, the price of painting it, the land's middle at the camera's, the hint; refused (and said) when it fits the
   *  map in no turn. True when it is in hand */
  private take(id: string, info: RealInfo, spec: OsmCourseSpec): boolean {
    const room = this.host.map - 2 * PLACE_EDGE, deg = firstFittingAngle(spec.w, spec.h, room);
    if (deg === null) {
      this.host.toast(`${osmDisplayName(info.name)} is bigger than the map in every direction (${spec.w} x ${spec.h} tiles; the map is ${this.host.map}): the map cannot grow, so pick a smaller or a scaled course`, 'warn');
      return false;
    }
    this.host.enter(); // (Select in hand: picking a tool puts a course in hand down, so this comes first)
    this.id = id; this.info = info; this.spec = spec; this.deg = deg; this.confirming = null; this.turnedBy.clear(); this.cache = null; this.shown = null;
    this.build = gridBuildCost(scratchOf(spec, 0, 0));
    const c = this.host.centre(); this.at = { x: Math.round(c.x), y: Math.round(c.y) };
    this.host.toast(`${info.name}: move it to a spot and click to place it · R turns it (Shift+R back, Alt for any angle) · Esc puts it down`, 'info');
    this.host.emit();
    return true;
  }

  /** puts the course down: nothing was bought, taken down or paid */
  cancel(emit = true): void {
    const was = this.id !== null || this.loading !== null;
    this.id = null; this.info = null; this.spec = null; this.at = null; this.confirming = null; this.loading = null; this.cache = null; this.turnedBy.clear(); this.sketch = null; this.deg = 0;
    if (was && emit) this.host.emit();
  }

  /** the spec turned to the current angle (kept by angle) */
  turned(): OsmCourseSpec | null {
    if (!this.spec) return null;
    let t = this.turnedBy.get(this.deg);
    if (!t) { t = rotateSpec(this.spec, this.deg); if (this.turnedBy.size > 12) this.turnedBy.delete(this.turnedBy.keys().next().value!); this.turnedBy.set(this.deg, t); }
    return t;
  }

  /** R (dir 1: clockwise) and Shift+R (dir -1): on to the next multiple of the step (from an angle between two, to the one in that direction); with `fine`
   *  (Alt) one degree. Not with the pop-up open */
  turn(dir: 1 | -1, fine = false): void {
    if (!this.spec || this.confirming) return;
    if (fine) this.deg = normDeg(this.deg + dir * ROT_FINE);
    else { const k = this.deg / ROT_STEP; this.deg = normDeg((dir > 0 ? Math.floor(k + 1e-9) + 1 : Math.ceil(k - 1e-9) - 1) * ROT_STEP); }
    this.cache = null; this.host.emit();
  }
  /** the wheel with Alt: the angle by `d` degrees as it comes, no stops */
  turnBy(d: number): void {
    if (!this.spec || this.confirming) return;
    this.deg = normDeg(Math.round((this.deg + d) * 100) / 100); this.cache = null; this.host.emit();
  }

  /** the pointer is over tile p: the land's middle goes to its nearest whole tile */
  move(p: Pt | null): void {
    if (!p || !this.spec || this.confirming) return;
    const x = Math.round(p.x), y = Math.round(p.y);
    if (this.at && this.at.x === x && this.at.y === y) return;
    this.at = { x, y };
  }

  /** the plan of the course where it stands (worked out again only when the pose or the world changes) */
  plan(fresh = false): PlacePlan | null {
    const t = this.turned();
    if (!t || !this.at) return null;
    const key = `${this.id}|${this.deg}|${this.at.x},${this.at.y}|${this.host.revision()}`;
    if (fresh || this.cache?.key !== key) this.cache = { key, plan: planPlace(this.host.world(fresh), t, { x: this.at.x, y: this.at.y, deg: this.deg }, this.build) };
    return this.cache.plan;
  }

  /** a click on the map: the pop-up when the course may go there and the money holds, else the toast says why (the outline is red then) */
  click(): void {
    if (this.confirming) return;
    const p = this.plan(true);
    if (!p) return;
    const l = placeLabel(p, this.info?.name ?? 'The course');
    if (l.bad) { this.host.toast(l.text, 'warn'); return; }
    this.confirming = p; this.host.emit();
  }
  /** Cancel in the pop-up: back to the course in hand, nothing touched */
  closePopup(): void { if (this.confirming) { this.confirming = null; this.host.emit(); } }

  /** Place it in the pop-up: the plan worked out again now (the town has grown since the pop-up opened), and if the course may still go there and the money
   *  holds, the host lays it. True when it did */
  confirm(): boolean {
    const t = this.turned();
    if (!this.confirming || !t || !this.at || !this.id || !this.info || !this.spec) return false;
    const fresh = planPlace(this.host.world(true), t, { x: this.at.x, y: this.at.y, deg: this.deg }, this.build);
    const l = placeLabel(fresh, this.info.name);
    if (l.bad) { this.confirming = null; this.host.toast(l.text, 'warn'); this.host.emit(); return false; }
    const ok = this.host.lay({ id: this.id, info: this.info, spec: this.spec, turned: t, plan: fresh, deg: this.deg });
    if (ok) this.cancel(); else this.host.emit();
    return ok;
  }

  /** the pose, over the map's whole valid range every `step` tiles at the current turn, where the course may go and takes the most buildings (null: none may
   *  go anywhere at this turn): the bench's and the shots' (it leaves the pose where it was) */
  best(step = 16): { x: number; y: number; n: number; plan: PlacePlan } | null {
    const t = this.turned(), was = this.at;
    if (!t) return null;
    let best: { x: number; y: number; n: number; plan: PlacePlan } | null = null;
    for (let x = Math.ceil(PLACE_EDGE + t.w / 2); x <= this.host.map - PLACE_EDGE - t.w / 2; x += step) for (let y = Math.ceil(PLACE_EDGE + t.h / 2); y <= this.host.map - PLACE_EDGE - t.h / 2; y += step) {
      this.at = { x, y };
      const p = this.plan();
      if (!p?.ok) continue;
      const n = p.lots.keys.length + p.orphans.keys.length;
      if (!best || n > best.n) best = { x, y, n, plan: p };
    }
    this.at = was; this.cache = null;
    return best;
  }

  /** the card's and the pop-up's view of the mode (null: none in hand) */
  view(): RealView | null {
    if (!this.id || !this.info || !this.spec) return null;
    const plan = this.plan(), c = this.confirming;
    return {
      id: this.id, name: this.info.name, place: this.info.place, credit: '© OpenStreetMap contributors', holes: this.info.holes, par: this.info.par, scale: this.spec.scale,
      deg: this.deg, plan, label: plan ? placeLabel(plan, this.info.name) : null,
      popup: c ? { plan: c, text: popupText(c), lines: priceLines(c), replaces: this.host.holes() } : null,
    };
  }

  /** the outline, the faint holes and the price by the pointer, on the overlay: the land bought in green (red, hatched, when it may not go there or the
   *  money is short) and the course in it as it will lie, turned. `mouse` is the pointer in css px (null: no label) */
  draw(ctx: CanvasRenderingContext2D, v: GhostView, mouse: { mx: number; my: number } | null): void {
    const plan = this.plan(), t = this.turned(), spec = this.spec;
    if (!plan || !t || !spec || !plan.bounds) return;
    const bad = !plan.ok;
    if (plan !== this.shown) { const now = performance.now(); if (now - this.shownAt > 150) { this.shown = plan; this.shownAt = now; this.host.emit(); } }
    drawGhostPoly(v, coverOutline(plan.cover), bad ? 'invalid' : 'valid', { lineWidthPx: 2.5, dashed: false, cross: bad });
    if (!this.sketch || this.sketch.spec !== spec) this.sketch = { spec, s: sketchOf(spec) };
    const sk = this.sketch.s;
    if (sk) {
      // the course in its own frame, to the pose: its land's middle on the turned frame's middle, turned (the same maps as rotateSpec and originFor)
      const th = (this.deg * Math.PI) / 180;
      v.setIso(ctx);
      ctx.translate(plan.ox + t.w / 2, plan.oy + t.h / 2); ctx.rotate(th); ctx.translate(-sk.w / 2, -sk.h / 2);
      ctx.globalAlpha = bad ? 0.55 : 1;
      for (const l of sk.layers) { ctx.fillStyle = l.fill; ctx.fill(l.path, 'nonzero'); }
      ctx.globalAlpha = bad ? 0.35 : 0.6; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 0.35; ctx.setLineDash([]); ctx.stroke(sk.lines);
      ctx.globalAlpha = 1; ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    if (mouse && !this.confirming) { const l = placeLabel(plan, this.info?.name ?? 'The course'); drawGhostHint(v, mouse.mx, mouse.my, l.text, l.bad); }
  }
}
