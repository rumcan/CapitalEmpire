// The New hole wizard and plan handles (plan P21 3.3 A and 3.5, T102): click the tee, click the green, and a whole hole is planned
// (fairway corridor, green, tee, rough) on the 1 m course grid; drag its handles (bends, widths at the stations, the green and the
// tee) and the ghost shows exactly the cells a Build lays and what they cost. Built plans are opened again from their line, edited
// (only the cells that differ change; hand touch-ups stay) or deleted. This module is the wizard's state and logic, with no DOM: the
// Paint tool's plan mode drives it (src/game/paint-tool.ts) and ./draw.ts draws it. Deterministic.
// Units: positions in tiles of 2 m; widths, lengths and areas in metres and m²; cells of 1 m (0.5 tile); money in $.

import { CELL_T, SURF, diffCost, type Grid, type GridDiff, type Pt } from '../course-grid';
import {
  decodePlan, defaultPlan, edgeOffset, encodePlan, planAims, planChanges, planGeom, planHandles, planInfo, rasterPlanBox, widthAt,
  type HolePlan, type PlanGeom, type PlanInfo, type PlanRaster,
} from '../hole-plan';
import type { AimPoint } from '../../golf/types';

/** the wizard's steps: waiting for the tee click (or a click on a built plan's line, which opens it), waiting for the green click (a live
 *  plan follows the pointer), and shaping (the plan's handles; Build lays it) */
export type WizStep = 'tee' | 'green' | 'shape';
/** a plan handle: the tee, the green, a bend (i: its index), a fairway width handle on the left or right edge (i: the width handle's
 *  index), a '+' point that inserts a bend (i: the leg, so the new bend's index), or the centre line itself (dragging it adds a bend) */
export type HandleKind = 'tee' | 'green' | 'bend' | 'wl' | 'wr' | 'add' | 'line';
/** a handle at tile (x, y) */
export interface PlanHandle { k: HandleKind; i: number; x: number; y: number }
/** tile to css px (the overlay's iso projection) */
export type ToScreen = (x: number, y: number) => { x: number; y: number };

/** the green's size range (m²; P21: [ ] changes it) and step */
export const GREEN_M2_MIN = 400, GREEN_M2_MAX = 700, GREEN_M2_STEP = 50;
/** a width handle's range (m) */
export const WIDTH_MIN = 12, WIDTH_MAX = 60;
/** at most this many bends (P21) */
export const MAX_BENDS = 3;
/** the shortest hole the green click accepts (m from the tee) */
export const MIN_HOLE_M = 60;
/** how near (css px) the pointer must be to a handle, and to the centre line */
export const HIT_PX = 11, LINE_PX = 8;
/** a click on a built plan's line opens it only away from its ends (m): the next hole's tee often goes by the last green */
const END_M = 30;
/** the ghost's run label of a refused cell (outside the land, or another hole's playing surface) */
export const REFUSED = 255;

/** the centre of the 1 m cell holding v (tiles): plan points snap to cell centres */
export const snapCell = (v: number) => (Math.floor(v / CELL_T) + 0.5) * CELL_T;
/** a point snapped to its cell centre */
export const snapPt = (p: Pt): Pt => ({ x: snapCell(p.x), y: snapCell(p.y) });
/** the swell seed a new plan for a hole gets (deterministic, never 0) */
export const planSeed = (hole: number) => hole * 101 + 7;

/** a new plan from two clicks: the defaults by par (hole-plan defaultPlan) with the hole's swell seed */
export function newPlan(hole: number, tee: Pt, green: Pt, bends: Pt[] = []): HolePlan {
  const p = defaultPlan(hole, tee, green, bends);
  p.seed = planSeed(hole);
  return p;
}

/** re-plans after the tee, green or bends moved: the defaults for the new line (the stations follow the length and par may snap), keeping
 *  the green's shape, size and seed, the player's turn of the green (turnOff, degrees), and the player's widths while the number of
 *  stations stays (same par) */
export function reshape(old: HolePlan, tee: Pt, green: Pt, bends: Pt[], turnOff: number): HolePlan {
  const d = defaultPlan(old.hole, tee, green, bends);
  d.greenShape = old.greenShape; d.greenM2 = old.greenM2; d.seed = old.seed; d.greenTurn += turnOff;
  if (d.widths.length === old.widths.length) d.widths = d.widths.map((h, i) => ({ s: h.s, w: old.widths[i]!.w }));
  return d;
}

/** golf.aims written from the plans: every hole that had a plan before or has one after takes its plan's bends as aim points (none
 *  when its plan is gone); the other holes keep theirs. Sorted by hole, then order */
export function aimsFromPlans(aims: readonly AimPoint[], before: readonly HolePlan[], after: readonly HolePlan[]): AimPoint[] {
  const touched = new Set<number>([...before.map(p => p.hole), ...after.map(p => p.hole)]);
  const out = aims.filter(a => !touched.has(a.hole)).map(a => ({ ...a }));
  for (const p of after) out.push(...planAims(p));
  return out.sort((a, b) => a.hole - b.hole || a.order - b.order);
}

/** golf.plans (save tuples) decoded: bad tuples are dropped, the last plan per hole wins, sorted by hole */
export function decodePlans(raw: readonly unknown[] | null | undefined): HolePlan[] {
  const by = new Map<number, HolePlan>();
  for (const t of raw ?? []) { const p = decodePlan(t); if (p) by.set(p.hole, p); }
  return [...by.values()].sort((a, b) => a.hole - b.hole);
}
/** plans as save tuples */
export function encodePlans(plans: readonly HolePlan[]): unknown[] { return plans.map(p => encodePlan(p)); }
/** plans with plan in its hole's place (added or replaced), sorted by hole */
export function withPlan(plans: readonly HolePlan[], plan: HolePlan): HolePlan[] { return [...plans.filter(p => p.hole !== plan.hole), plan].sort((a, b) => a.hole - b.hole); }
/** plans without hole n's */
export function withoutPlan(plans: readonly HolePlan[], hole: number): HolePlan[] { return plans.filter(p => p.hole !== hole); }

/** what the wizard reads from the game */
export interface WizardHost {
  /** the course grid (null: no golf course, the wizard does nothing) */
  grid(): Grid | null;
  /** the built plans */
  plans(): readonly HolePlan[];
  /** whether the plan may lay grid cell i (owned land, not the range plot); missing = every cell */
  allow?(i: number): boolean;
  /** where a tee or green at tile (x, y) that allow refuses stands, for Build's reason ("The tee is <where>"): 'off your land' (the default)
   *  or 'on the driving range' */
  whereAt?(x: number, y: number): string;
  /** the month value new cells get (course-grid/areas plantMonth) */
  month(): number;
  /** what a cell of surface s costs ($) */
  price(s: number): number;
  /** the treasury ($) */
  money(): number;
  /** hole n's pin (for the tee's walk label), if it has one */
  pinOf?(hole: number): Pt | null;
}

/** what a Build would do now: the dry diff (hole-plan planChanges), its price, counts, the cells as row runs for the overlay, and the
 *  plan's info; teeOk / greenOk: the back tee and the pin stand on cells the plan may lay */
export interface WizardGhost {
  diff: GridDiff;
  cost: number;
  /** cells laid (a new surface), cleared (back to none), refused (outside the land, or another hole's playing surface: not laid) */
  laid: number; cleared: number; refused: number;
  /** row runs, flat (cy, a, b, s) in grid cells, sorted by row then column: s the new surface, 0 cleared, REFUSED refused */
  runs: Int32Array;
  /** per run label, the outline of its cells: segments (x0, y0, x1, y1) in grid cells along the cell edges */
  edges: Map<number, Float32Array>;
  /** the grid's origin (tiles) the runs and edges are on */
  gx0: number; gy0: number;
  info: PlanInfo;
  geom: PlanGeom;
  teeOk: boolean; greenOk: boolean;
}

/** the build animation (P21 3.5): the line draws itself, then the built cells pop along it in arc-length order */
export interface Ripple { t0: number; runs: Int32Array; delay: Float32Array; line: Pt[]; gx0: number; gy0: number }
/** the ripple's line time and cell spread (ms) and each run's pop (ms) */
export const RIPPLE_LINE_MS = 300, RIPPLE_SPREAD_MS = 600, RIPPLE_POP_MS = 450;

/** the outline segments of a set of row runs (each row's runs sorted, disjoint): the edges between a covered cell and an uncovered one */
function runEdges(rows: Map<number, number[]>): Float32Array {
  const out: number[] = [];
  const minus = (A: readonly number[], B: readonly number[] | undefined, y: number) => {
    // the parts of A's runs (inclusive cell ranges) not covered by B's, as horizontal edges at y
    let j = 0;
    for (let k = 0; k < A.length; k += 2) {
      let a = A[k]!; const b = A[k + 1]!;
      if (B) {
        while (j < B.length && B[j + 1]! < a) j += 2;
        let m = j;
        while (m < B.length && B[m]! <= b && a <= b) {
          if (B[m]! > a) out.push(a, y, B[m]!, y);
          a = Math.max(a, B[m + 1]! + 1);
          m += 2;
        }
      }
      if (a <= b) out.push(a, y, b + 1, y);
    }
  };
  for (const [cy, row] of rows) {
    for (let k = 0; k < row.length; k += 2) out.push(row[k]!, cy, row[k]!, cy + 1, row[k + 1]! + 1, cy, row[k + 1]! + 1, cy + 1);
    minus(row, rows.get(cy - 1), cy);
    minus(row, rows.get(cy + 1), cy + 1);
  }
  return Float32Array.from(out);
}

/** the wizard: its step, the hole, the live plan and the built plan being edited, the handle under the pointer and the one dragged */
export class HoleWizard {
  step: WizStep = 'tee';
  /** the hole the plan is for */
  hole = 1;
  /** the live plan (the green step's preview, or the plan being shaped), or null */
  plan: HolePlan | null = null;
  /** the built plan being edited (null: a new hole) */
  base: HolePlan | null = null;
  /** the green step: the clicked tee */
  tee: Pt | null = null;
  /** the handle under the pointer, and the one being dragged */
  hover: PlanHandle | null = null;
  drag: PlanHandle | null = null;
  /** the tee step: the built plan whose line is under the pointer (its hole; 0 none) */
  lineHole = 0;
  /** the player's turn of the green against the approach (degrees; R) */
  turnOff = 0;
  /** the last build's animation, or null */
  ripple: Ripple | null = null;
  /** the pointer (tiles), for the labels */
  cursor: Pt | null = null;
  private ghostKey = '';
  private ghostVal: WizardGhost | null = null;
  private baseKey = '';
  private baseR: PlanRaster | null = null;
  private handleKey = '';
  private handleVal: PlanHandle[] = [];
  /** plan geometries by the plan's tuple (the live plan and the built ones, whose lines the pointer is tested against) */
  private geoms = new Map<string, PlanGeom>();

  constructor(private readonly host: WizardHost) {}

  /** a plan's geometry, cached by its tuple (at most 64 kept) */
  geomOf(p: HolePlan): PlanGeom {
    const k = JSON.stringify(encodePlan(p));
    let v = this.geoms.get(k);
    if (!v) { if (this.geoms.size >= 64) this.geoms.clear(); v = planGeom(p); this.geoms.set(k, v); }
    return v;
  }

  /** a new hole: wait for the tee click */
  start(hole: number): void {
    this.step = 'tee'; this.hole = hole; this.plan = null; this.base = null; this.tee = null;
    this.hover = null; this.drag = null; this.lineHole = 0; this.turnOff = 0;
  }
  /** opens a built plan for editing (its handles back) */
  open(plan: HolePlan): void {
    this.start(plan.hole);
    this.step = 'shape';
    this.base = clonePlan(plan);
    this.plan = clonePlan(plan);
    this.turnOff = plan.greenTurn - defaultPlan(plan.hole, plan.tee, plan.green, plan.bends).greenTurn;
  }
  /** the built plans */
  plans(): readonly HolePlan[] { return this.host.plans(); }
  /** the built plan of hole n, if any */
  planOf(n: number): HolePlan | null { return this.host.plans().find(p => p.hole === n) ?? null; }
  /** whether the wizard has a plan on screen that is not built (or differs from its built version) */
  get dirty(): boolean { return !!this.plan && (!this.base || JSON.stringify(encodePlan(this.plan)) !== JSON.stringify(encodePlan(this.base))); }

  /** the pointer moved to tile t (null: off the map), at css px (mx, my) */
  move(t: Pt | null, mx: number, my: number, toScreen: ToScreen): void {
    this.cursor = t;
    if (this.drag) { if (t) this.dragTo(t); return; }
    if (this.step === 'tee') { this.lineHole = this.lineAt(mx, my, toScreen); return; }
    if (this.step === 'green') {
      if (!t || !this.tee) return;
      const p = snapPt(t);
      if (Math.hypot(p.x - this.tee.x, p.y - this.tee.y) * 2 < MIN_HOLE_M) { this.plan = null; return; }
      if (!this.plan || this.plan.green.x !== p.x || this.plan.green.y !== p.y) this.plan = newPlan(this.hole, this.tee, p);
      return;
    }
    this.hover = this.pick(mx, my, toScreen);
  }

  /** a press at tile t (css px mx, my): the tee step places the tee (or opens the plan whose line is under the pointer), the green step
   *  places the green, the shape step grabs a handle (the line or a '+' adds a bend first); returns what happened */
  press(t: Pt, mx: number, my: number, toScreen: ToScreen): 'tee' | 'green' | 'open' | 'drag' | null {
    if (this.step === 'tee') {
      const n = this.lineAt(mx, my, toScreen), p = n ? this.planOf(n) : null;
      if (p) { this.open(p); return 'open'; }
      this.tee = snapPt(t); this.step = 'green'; this.plan = null; return 'tee';
    }
    if (this.step === 'green') {
      this.move(t, mx, my, toScreen);
      if (!this.plan) return null;
      this.step = 'shape'; return 'green';
    }
    const h = this.pick(mx, my, toScreen);
    if (!h || !this.plan) return null;
    if (h.k === 'add' || h.k === 'line') {
      const i = h.k === 'add' ? h.i : this.bendIndexAt(h);
      const bends = this.plan.bends.slice(); bends.splice(i, 0, snapPt(h));
      this.plan = reshape(this.plan, this.plan.tee, this.plan.green, bends, this.turnOff);
      this.drag = { k: 'bend', i, x: h.x, y: h.y };
    } else this.drag = h;
    this.hover = this.drag;
    return 'drag';
  }
  /** the release: a drag ends */
  release(): void { this.drag = null; }

  /** a drag to tile t: the dragged handle follows (snapped to cell centres) and the plan re-plans at once */
  dragTo(t: Pt): void {
    const pl = this.plan, h = this.drag; if (!pl || !h) return;
    const p = snapPt(t);
    if (h.k === 'tee') this.plan = reshape(pl, p, pl.green, pl.bends, this.turnOff);
    else if (h.k === 'green') this.plan = reshape(pl, pl.tee, p, pl.bends, this.turnOff);
    else if (h.k === 'bend') { const b = pl.bends.slice(); b[h.i] = p; this.plan = reshape(pl, pl.tee, pl.green, b, this.turnOff); }
    else if (h.k === 'wl' || h.k === 'wr') this.plan = withWidthAt(pl, h.i, h.k === 'wl' ? 'left' : 'right', t);
    h.x = p.x; h.y = p.y;
  }
  /** removes bend i (right click or double click on it, or Delete over it) */
  removeBend(i: number): boolean {
    const pl = this.plan; if (!pl || i < 0 || i >= pl.bends.length) return false;
    const b = pl.bends.slice(); b.splice(i, 1);
    this.plan = reshape(pl, pl.tee, pl.green, b, this.turnOff); this.hover = null; return true;
  }
  /** turns the green by deg degrees (R) */
  turnGreen(deg: number): void { if (!this.plan) return; this.plan = { ...clonePlan(this.plan), greenTurn: this.plan.greenTurn + deg }; this.turnOff += deg; }
  /** sizes the green by dm2 m² within GREEN_M2_MIN..GREEN_M2_MAX ([ ]) */
  sizeGreen(dm2: number): void {
    if (!this.plan) return;
    const m2 = Math.max(GREEN_M2_MIN, Math.min(GREEN_M2_MAX, this.plan.greenM2 + dm2));
    this.plan = { ...clonePlan(this.plan), greenM2: m2 };
  }

  /** the plan's handles (cached per plan): tee, green, bends, the width handles on both edges, and the '+' points */
  handles(): PlanHandle[] {
    const pl = this.plan; if (!pl) return [];
    const key = JSON.stringify(encodePlan(pl));
    if (key === this.handleKey) return this.handleVal;
    const h = planHandles(pl, this.geomOf(pl)), out: PlanHandle[] = [];
    out.push({ k: 'tee', i: 0, x: pl.tee.x, y: pl.tee.y }, { k: 'green', i: 0, x: pl.green.x, y: pl.green.y });
    pl.bends.forEach((b, i) => out.push({ k: 'bend', i, x: b.x, y: b.y }));
    h.widths.forEach((w, i) => out.push({ k: 'wl', i, x: w.left.x, y: w.left.y }, { k: 'wr', i, x: w.right.x, y: w.right.y }));
    h.insertPoints.forEach((p, i) => out.push({ k: 'add', i, x: p.x, y: p.y }));
    this.handleKey = key; this.handleVal = out;
    return out;
  }
  /** the handle at css px (mx, my): the nearest within HIT_PX (the tee, green and bends win ties), else the centre line within LINE_PX
   *  while a bend can be added; null for none */
  pick(mx: number, my: number, toScreen: ToScreen): PlanHandle | null {
    const pl = this.plan; if (!pl) return null;
    let best: PlanHandle | null = null, bd = HIT_PX * HIT_PX;
    for (const h of this.handles()) {
      const s = toScreen(h.x, h.y), d = (s.x - mx) ** 2 + (s.y - my) ** 2 - (h.k === 'tee' || h.k === 'green' || h.k === 'bend' ? 9 : 0);
      if (d <= bd) { bd = d; best = h; }
    }
    if (best) return { ...best };
    if (pl.bends.length >= MAX_BENDS) return null;
    const near = nearLine(this.geomOf(pl), mx, my, toScreen, 0);
    return near && near.d <= LINE_PX ? { k: 'line', i: -1, x: near.x, y: near.y } : null;
  }
  /** the tee step: the built plan whose line passes within LINE_PX of css px (mx, my), away from its ends (its hole; 0 none) */
  lineAt(mx: number, my: number, toScreen: ToScreen): number {
    let best = 0, bd = LINE_PX;
    for (const p of this.host.plans()) {
      const near = nearLine(this.geomOf(p), mx, my, toScreen, END_M);
      if (near && near.d <= bd) { bd = near.d; best = p.hole; }
    }
    return best;
  }
  /** where a bend added at handle h goes among the bends (by its distance along the line) */
  private bendIndexAt(h: PlanHandle): number {
    const geom = this.geomOf(this.plan!);
    let k = 0, bd = Infinity;
    for (let i = 0; i < geom.line.length; i++) { const d = (geom.line[i]!.x - h.x) ** 2 + (geom.line[i]!.y - h.y) ** 2; if (d < bd) { bd = d; k = i; } }
    const s = geom.s[k]!;
    return geom.bends.filter(b => b.s < s).length;
  }

  /** what a Build would do now (cached until the plan, the grid or the prices change), or null with no plan or grid */
  ghost(): WizardGhost | null {
    const g = this.host.grid(), pl = this.plan; if (!g || !pl) return null;
    const month = this.host.month(), key = `${JSON.stringify(encodePlan(pl))}|${this.base ? JSON.stringify(encodePlan(this.base)) : ''}|${g.rev}|${g.x0},${g.y0},${g.w},${g.h}|${month}|${this.host.price(SURF.fairway)},${this.host.price(SURF.green)}`;
    if (key === this.ghostKey && this.ghostVal) return this.ghostVal;
    const geom = this.geomOf(pl), next = rasterPlanBox(pl, g, undefined, geom);
    let old: PlanRaster | null = null;
    if (this.base) {
      const bk = `${JSON.stringify(encodePlan(this.base))}|${g.x0},${g.y0},${g.w},${g.h}`;
      if (bk !== this.baseKey || !this.baseR) { this.baseR = rasterPlanBox(this.base, g, undefined, this.geomOf(this.base)); this.baseKey = bk; }
      old = this.baseR;
    }
    const refused: number[] = [];
    const allow = this.host.allow ? (i: number) => this.host.allow!(i) : undefined;
    // a cell another hole keeps is only worth a red mark when the plan wanted a playing surface there (rough corridors overlap freely)
    const diff = planChanges(g, this.base, pl, pl.hole, month, allow, { old, next }, (i, why, s) => { if (why === 'land' || s > SURF.rough) refused.push(i); });
    const cost = Math.round(diffCost(diff, s => this.host.price(s)));
    // row runs: the diff's cells (by their new surface) and the refused cells, both in index order, merged
    const runs: number[] = [], rows = new Map<number, Map<number, number[]>>();
    let laid = 0, cleared = 0, a = -1, b = -1, rs = -1, rowEnd = -1, cy = 0;
    const flush = () => {
      if (rs < 0) return;
      const c0 = a - cy * g.w, c1 = b - cy * g.w;
      runs.push(cy, c0, c1, rs);
      let m = rows.get(rs); if (!m) rows.set(rs, (m = new Map()));
      let r = m.get(cy); if (!r) m.set(cy, (r = []));
      r.push(c0, c1);
    };
    let p = 0, q = 0;
    const idx = diff.idx, s1 = diff.s1, dn = diff.n, rn = refused.length;
    while (p < dn || q < rn) {
      let i: number, s: number;
      if (q >= rn || (p < dn && idx[p]! < refused[q]!)) { i = idx[p]!; s = s1[p]!; p++; if (s) laid++; else cleared++; }
      else { i = refused[q]!; s = REFUSED; q++; }
      if (s === rs && i === b + 1 && i < rowEnd) { b = i; continue; }
      flush(); a = b = i; rs = s; cy = Math.floor(i / g.w); rowEnd = (cy + 1) * g.w;
    }
    flush();
    const edges = new Map<number, Float32Array>();
    for (const [s, m] of rows) edges.set(s, runEdges(m));
    const info = planInfo(pl, geom);
    const okAt = (x: number, y: number) => {
      const cx = Math.floor((x - g.x0) / CELL_T), cy = Math.floor((y - g.y0) / CELL_T);
      if (cx < 0 || cy < 0 || cx >= g.w || cy >= g.h) return false;
      return !this.host.allow || this.host.allow(cy * g.w + cx);
    };
    this.ghostVal = {
      diff, cost, laid, cleared, refused: refused.length, runs: Int32Array.from(runs), edges, gx0: g.x0, gy0: g.y0, info, geom,
      teeOk: okAt(pl.tee.x, pl.tee.y), greenOk: okAt(pl.green.x, pl.green.y),
    };
    this.ghostKey = key;
    return this.ghostVal;
  }

  /** whether Build can go ahead now, and why not ('' when it can): the tee and green on your land, the money */
  check(): { ok: boolean; why: string; ghost: WizardGhost | null } {
    const gh = this.step === 'shape' ? this.ghost() : null;
    if (!gh) return { ok: false, why: this.step === 'shape' ? 'No course here' : 'Click the tee, then the green', ghost: null };
    const where = (p: Pt | undefined) => (p && this.host.whereAt?.(p.x, p.y)) || 'off your land';
    if (!gh.teeOk) return { ok: false, why: `The tee is ${where(this.plan?.tee)}`, ghost: gh };
    if (!gh.greenOk) return { ok: false, why: `The green is ${where(this.plan?.green)}`, ghost: gh };
    const money = this.host.money();
    if (gh.cost > money) return { ok: false, why: `Not enough money: $${gh.cost.toLocaleString()} (you have $${Math.round(money).toLocaleString()})`, ghost: gh };
    if (!gh.diff.n && !this.dirty) return { ok: false, why: 'Nothing to change', ghost: gh };
    return { ok: true, why: '', ghost: gh };
  }

  /** the one-line label beside the pointer (P21 3.5) and whether it is a refusal */
  label(): { text: string; bad: boolean } {
    const n = this.hole;
    if (this.step === 'tee') {
      if (this.lineHole) return { text: `Hole ${this.lineHole} · click to edit its plan`, bad: false };
      const pin = n > 1 ? this.host.pinOf?.(n - 1) : null, c = this.cursor;
      const walk = pin && c ? ` · ${Math.round(Math.hypot(c.x - pin.x, c.y - pin.y) * 2)} m walk from hole ${n - 1}` : '';
      return { text: `Hole ${n} · click the tee${walk}`, bad: false };
    }
    if (this.step === 'green' && !this.plan) return { text: `Hole ${n} · click the green`, bad: false };
    const gh = this.ghost(); if (!gh) return { text: `Hole ${n}`, bad: false };
    const head = `Hole ${n} · par ${gh.info.par} · ${gh.info.lengthM} m · $${gh.cost.toLocaleString()}`;
    if (this.step === 'green') return { text: head, bad: !gh.teeOk || !gh.greenOk };
    const c = this.check();
    if (!c.ok && c.why !== 'Nothing to change') return { text: `${head} · ${c.why}`, bad: true };
    return { text: gh.refused ? `${head} · some cells left out` : head, bad: false };
  }

  /** a Build went through at time now (ms): the ripple starts from the ghost it laid, and the wizard waits for the next hole's tee */
  built(now: number, nextHole: number): void {
    const gh = this.ghostVal;
    if (gh) this.ripple = makeRipple(gh, now);
    this.start(nextHole);
  }
}

/** a deep copy of a plan */
export function clonePlan(p: HolePlan): HolePlan {
  return { ...p, tee: { ...p.tee }, green: { ...p.green }, bends: p.bends.map(b => ({ ...b })), widths: p.widths.map(w => ({ ...w })) };
}

/** plan with width handle i set from a drag to tile t on its left or right edge: the width that puts that edge (with its swell and bend
 *  boost) under the pointer, whole metres, WIDTH_MIN..WIDTH_MAX */
export function withWidthAt(plan: HolePlan, i: number, side: 'left' | 'right', t: Pt): HolePlan {
  const geom = planGeom(plan), h = geom.widths[i]; if (!h) return plan;
  let k = 0, bd = Infinity;
  for (let j = 0; j < geom.s.length; j++) { const d = Math.abs(geom.s[j]! - h.s); if (d < bd) { bd = d; k = j; } }
  const p = geom.line[k]!, sgn = side === 'left' ? 1 : -1;
  const halfM = Math.max(0, sgn * ((t.x - p.x) * geom.nx[k]! + (t.y - p.y) * geom.ny[k]!) * 2);
  const w0 = widthAt(plan, geom.s[k]!, geom) || h.w, r = w0 > 0 ? edgeOffset(plan, geom.s[k]!, side, geom) / w0 : 0;
  const w = Math.round(Math.max(WIDTH_MIN, Math.min(WIDTH_MAX, halfM / Math.max(0.2, 0.5 + r))));
  const out = clonePlan(plan);
  // the plan's widths are kept sorted, so geom.widths[i] is out.widths[i]
  out.widths = out.widths.slice().sort((a, b) => a.s - b.s);
  out.widths[i] = { s: out.widths[i]!.s, w };
  return out;
}

/** the point of the plan's centre line nearest css px (mx, my), skipping endM metres at each end: its tile position and distance (css px) */
function nearLine(geom: PlanGeom, mx: number, my: number, toScreen: ToScreen, endM: number): { x: number; y: number; d: number } | null {
  const L = geom.line, n = L.length;
  let best: { x: number; y: number; d: number } | null = null;
  let prev: { x: number; y: number } | null = null, pi = -1;
  for (let i = 0; i < n; i += i + 4 < n ? 4 : Math.max(1, n - 1 - i)) {
    if (geom.s[i]! < endM || geom.s[i]! > geom.lengthM - endM) { prev = null; continue; }
    const s = toScreen(L[i]!.x, L[i]!.y);
    if (prev) {
      const dx = s.x - prev.x, dy = s.y - prev.y, len2 = dx * dx + dy * dy;
      const u = len2 > 0 ? Math.max(0, Math.min(1, ((mx - prev.x) * dx + (my - prev.y) * dy) / len2)) : 0;
      const d = Math.hypot(prev.x + u * dx - mx, prev.y + u * dy - my);
      if (!best || d < best.d) {
        const a = L[pi]!, b = L[i]!;
        best = { x: a.x + u * (b.x - a.x), y: a.y + u * (b.y - a.y), d };
      }
    }
    prev = s; pi = i;
    if (i === n - 1) break;
  }
  return best;
}

/** the ripple of a built ghost: each laid run's delay after the line has drawn, by where along the line its middle lies */
function makeRipple(gh: WizardGhost, now: number): Ripple {
  const { runs, geom } = gh, L = geom.line, len = Math.max(1, geom.lengthM), out: number[] = [], delay: number[] = [];
  for (let k = 0; k < runs.length; k += 4) {
    const s = runs[k + 3]!; if (!s || s === REFUSED) continue;
    const x = gh.gx0 + ((runs[k + 1]! + runs[k + 2]! + 1) / 2) * CELL_T, y = gh.gy0 + (runs[k]! + 0.5) * CELL_T;
    let bi = 0, bd = Infinity;
    for (let i = 0; i < L.length; i += 4) { const d = (L[i]!.x - x) ** 2 + (L[i]!.y - y) ** 2; if (d < bd) { bd = d; bi = i; } }
    out.push(runs[k]!, runs[k + 1]!, runs[k + 2]!, s);
    delay.push(RIPPLE_LINE_MS + (RIPPLE_SPREAD_MS * geom.s[bi]!) / len);
  }
  return { t0: now, runs: Int32Array.from(out), delay: Float32Array.from(delay), line: L, gx0: gh.gx0, gy0: gh.gy0 };
}
