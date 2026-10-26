// The New hole wizard and plan handles (plan P21 3.3 A and 3.5, T102): click the tee, click the green, and a whole hole is planned
// (fairway corridor, green, tee, rough) on the 1 m course grid; drag its handles (bends, widths at the stations, the green and the
// tee) and the ghost shows exactly the cells a Build lays and what they cost. Built plans are opened again from their line, edited
// (only the cells that differ change; hand touch-ups stay) or deleted. T119 (plan P23 4.4) finishes it: its own undo of the clicks and drags,
// Esc one stage back, the check table (what blocks Build and what only warns), Seed and Sod side by side, the hole's number, and the points
// the camera frames after each click. This module is the wizard's state and logic, with no DOM: the Paint tool's plan mode drives it
// (src/game/paint-tool.ts) and ./draw.ts draws it. Deterministic.
// Units: positions in tiles of 2 m; widths, lengths and areas in metres and m²; cells of 1 m (0.5 tile); money in $.

import { CELL_T, SURF, diffCost, type Grid, type GridDiff, type Pt } from '../course-grid';
import {
  CORRIDOR_M, decodePlan, defaultPlan, edgeOffset, encodePlan, planAims, planChanges, planGeom, planHandles, planInfo, rasterPlanBox, widthAt,
  type HolePlan, type PlanGeom, type PlanInfo, type PlanRaster,
} from '../hole-plan';
import type { AimPoint } from '../../golf/types';
import { worldX, worldY } from '../../iso';

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
/** after the tee click the camera frames everything this near the tee (m: the circle's radius, P23 4.4's "450 m round the tee"), so a par 3
 *  to a long par 4's green can be clicked; clipped to your land, where the green can go */
export const TEE_VIEW_M = 450;
/** another hole's line nearer than this (m) warns: golfers there are in range (P23 4.4) */
export const NEAR_M = 60;
/** a walk from the last hole's green longer than this (m) warns (P23 4.4) */
export const WALK_M = 150;
/** the ends of each line (m) the too-close check leaves out: the next tee often stands by the last green */
const NEAR_END_M = 40;
/** the wizard's own undo keeps this many steps */
const HISTORY_MAX = 60;
/** Build's block when an edit changes nothing (P23 4.4) */
export const NO_CHANGES = 'No changes';
/** the words of a tee or green the land rules refuse, by refusal, and of one on the practice area (P23 4.4; P24 D24) */
const SPOT_WHY: Readonly<Record<'off' | 'range' | 'practice', string>> = {
  off: 'off your land', range: 'on the driving range: golfers hit here', practice: 'on the practice area: golfers practise there',
};

/** why the land rules refuse a tile (the host's landWhy): off your land, or the driving range's own plot; '' where the course may go */
export type LandWhy = 'off' | 'range' | '';
/** a public road near the plan (the host's roads): a segment (tiles) and its name ('' unnamed) */
export interface WizRoad { ax: number; ay: number; bx: number; by: number; name: string }
/** a row of New hole's check table (P23 4.4): a block (Build waits), a warning (Build goes ahead) or a check passed; its words; the fix the
 *  card offers ('seed': plant Seed instead of Sod); the points (tiles) its Show me frames */
export interface WizCheck { id: string; kind: 'block' | 'warn' | 'ok'; text: string; fix?: 'seed'; show?: Pt[] }
/** one step of the wizard's own undo (P23 4.4: Ctrl+Z takes back a click or a drag, not the last hole): the step, the tee, the plan and the
 *  green's turn before the change, and what the change was */
interface WizSnap { step: WizStep; tee: Pt | null; plan: HolePlan | null; turnOff: number; label: string }
/** what each handle's drag is called in the undo button's tooltip */
const DRAG_WORD: Readonly<Record<HandleKind, string>> = {
  tee: 'move the tee', green: 'move the green', bend: 'move a bend', wl: 'set a width', wr: 'set a width', add: 'add a bend', line: 'add a bend',
};

/** the centre of the 1 m cell holding v (tiles): plan points snap to cell centres */
export const snapCell = (v: number) => (Math.floor(v / CELL_T) + 0.5) * CELL_T;
/** a point snapped to its cell centre */
export const snapPt = (p: Pt): Pt => ({ x: snapCell(p.x), y: snapCell(p.y) });
/** the swell seed a new plan for a hole gets (deterministic, never 0) */
export const planSeed = (hole: number) => hole * 101 + 7;

/** the green of a hole of suggested length m (metres) from tee toward the pointer at t, on the cell grid; null while the pointer is on the tee
 *  (no way to aim) */
export function suggestedGreen(tee: Pt, t: Pt, m: number): Pt | null {
  const dx = t.x - tee.x, dy = t.y - tee.y, d = Math.hypot(dx, dy);
  if (d < 1) return null;
  const k = m / 2 / d; // 1 tile = 2 m
  return snapPt({ x: tee.x + dx * k, y: tee.y + dy * k });
}

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
  /** why allow refuses tile (x, y), for Build's reason ("The tee is off your land") and the cells left out: 'off' your land (the default)
   *  or the driving range's plot ('range') */
  landWhy?(x: number, y: number): LandWhy;
  /** the month value new cells get (course-grid/areas plantMonth) */
  month(): number;
  /** what a cell of surface s costs ($) */
  price(s: number): number;
  /** what a cell of surface s costs seeded or sodded ($): the card's Seed and Sod prices side by side (missing: price for both) */
  priceAs?(s: number, sod: boolean): number;
  /** whether the course is planted with Sod now (the money block's fix is then Seed) */
  sod?(): boolean;
  /** the treasury ($) */
  money(): number;
  /** hole n's pin (for the tee's walk label and the long-walk warning), if it has one */
  pinOf?(hole: number): Pt | null;
  /** the practice area's box (tiles x0 y0 x1 y1; P24 D24: the cells laid there hold no hole), or null: none */
  practiceBox?(): readonly [number, number, number, number] | null;
  /** the box round your land (tiles x0 y0 x1 y1), which the tee's framing keeps to; null: no limit */
  landBox?(): readonly [number, number, number, number] | null;
  /** the public roads near box (tiles x0 y0 x1 y1), for the road-across warning */
  roads?(box: readonly [number, number, number, number]): WizRoad[];
  /** the holes as lines from tee to pin, for the too-close warning (a hole with a plan uses its plan's centre line instead) */
  holeLines?(): { hole: number; line: Pt[] }[];
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
  /** the refused cells (grid indices, in order): the cells-left-out warning says why each was left out */
  refusedIdx: Int32Array;
  /** the cells laid in the practice area (they hold no hole once built: P24 D24): how many, and their row runs (cy, a, b) for the hatch */
  practice: number; practiceRuns: Int32Array;
  /** the back tee or the pin on the practice area (Build waits) */
  teePractice: boolean; greenPractice: boolean;
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
  /** the hole's suggested length (m; T132: a range start's first hole is a par-3 of FIRST_PAR3_M): the green step places the green that far
   *  from the tee toward the pointer; 0 (the default, and after Any length) the pointer places it. PaintTool.setPlan sets it from its host */
  suggestM = 0;
  private ghostKey = '';
  private ghostVal: WizardGhost | null = null;
  private baseKey = '';
  private baseR: PlanRaster | null = null;
  private handleKey = '';
  private handleVal: PlanHandle[] = [];
  /** plan geometries by the plan's tuple (the live plan and the built ones, whose lines the pointer is tested against) */
  private geoms = new Map<string, PlanGeom>();
  /** the wizard's own undo and redo (P23 4.4), and the snapshot a drag in progress keeps until its release */
  private past: WizSnap[] = [];
  private future: WizSnap[] = [];
  private pending: WizSnap | null = null;
  /** the warnings, cached with the ghost and the built plans they were worked out for */
  private warnKey = '';
  private warnVal: WizCheck[] = [];

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
    this.past = []; this.future = []; this.pending = null;
  }
  /** a new game or a load (the owner's test, 2026-10-25: the last game's "New hole 10" and its plan stayed on screen): everything the
   *  wizard held goes (the plan, the built plan being edited, the ripple, the pointer, the cached ghost, handles and geometries) and it
   *  waits for the tee of hole `hole` (the game's first free number) */
  reset(hole = 1): void {
    this.start(hole);
    this.ripple = null; this.cursor = null;
    this.ghostKey = ''; this.ghostVal = null; this.baseKey = ''; this.baseR = null; this.handleKey = ''; this.handleVal = []; this.geoms.clear();
    this.warnKey = ''; this.warnVal = [];
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
    if (this.step === 'green') { if (t) this.followGreen(t); return; }
    this.hover = this.pick(mx, my, toScreen);
  }
  /** the green step: the live plan follows the pointer at tile t (none while the green would be nearer the tee than MIN_HOLE_M); with a
   *  suggested length (suggestM: a range start's first hole, a par-3) the pointer only aims it: the green sits suggestM from the tee that way */
  private followGreen(t: Pt): void {
    if (!this.tee) return;
    const p = this.suggestM > 0 ? suggestedGreen(this.tee, t, this.suggestM) : snapPt(t);
    if (!p) { this.plan = null; return; }
    if (Math.hypot(p.x - this.tee.x, p.y - this.tee.y) * 2 < MIN_HOLE_M) { this.plan = null; return; }
    if (!this.plan || this.plan.green.x !== p.x || this.plan.green.y !== p.y) this.plan = newPlan(this.hole, this.tee, p);
  }

  /** a press at tile t (css px mx, my): the tee step places the tee (or opens the plan whose line is under the pointer), the green step
   *  places the green, the shape step grabs a handle (the line or a '+' adds a bend first); returns what happened. The clicks and the drags
   *  are the wizard's own undo steps */
  press(t: Pt, mx: number, my: number, toScreen: ToScreen): 'tee' | 'green' | 'open' | 'drag' | null {
    if (this.step === 'tee') {
      const n = this.lineAt(mx, my, toScreen), p = n ? this.planOf(n) : null;
      if (p) { this.open(p); return 'open'; }
      const s = this.snap('place the tee');
      this.tee = snapPt(t); this.step = 'green'; this.plan = null; this.push(s); return 'tee';
    }
    if (this.step === 'green') {
      const s = this.snap('place the green');
      this.move(t, mx, my, toScreen);
      if (!this.plan) return null;
      this.step = 'shape'; this.push(s); return 'green';
    }
    const h = this.pick(mx, my, toScreen);
    if (!h || !this.plan) return null;
    this.pending = this.snap(DRAG_WORD[h.k]);
    if (h.k === 'add' || h.k === 'line') {
      const i = h.k === 'add' ? h.i : this.bendIndexAt(h);
      const bends = this.plan.bends.slice(); bends.splice(i, 0, snapPt(h));
      this.plan = reshape(this.plan, this.plan.tee, this.plan.green, bends, this.turnOff);
      this.drag = { k: 'bend', i, x: h.x, y: h.y };
    } else this.drag = h;
    this.hover = this.drag;
    return 'drag';
  }
  /** the release: a drag ends (an undo step when it changed the plan) */
  release(): void {
    const s = this.pending;
    if (s && this.plan && (!s.plan || JSON.stringify(encodePlan(s.plan)) !== JSON.stringify(encodePlan(this.plan)))) this.push(s);
    this.pending = null; this.drag = null;
  }

  // ---------- the wizard's own undo (P23 4.4, 4.10: Ctrl+Z and Ctrl+Y while New hole is open; its clicks and drags, never the last hole) ----------
  private snap(label: string): WizSnap {
    return { step: this.step, tee: this.tee && { ...this.tee }, plan: this.plan && clonePlan(this.plan), turnOff: this.turnOff, label };
  }
  private push(s: WizSnap): void { this.past.push(s); if (this.past.length > HISTORY_MAX) this.past.shift(); this.future = []; }
  private restore(s: WizSnap): void {
    this.step = s.step; this.tee = s.tee && { ...s.tee }; this.plan = s.plan && { ...clonePlan(s.plan), hole: this.hole }; this.turnOff = s.turnOff;
    this.hover = null; this.drag = null; this.pending = null;
    if (this.step === 'green' && this.cursor) this.followGreen(this.cursor);
  }
  /** takes back the last click or change of the plan on screen; false when there is none (or a drag is in hand) */
  undo(): boolean {
    if (this.drag || !this.past.length) return false;
    const s = this.past.pop()!;
    this.future.push(this.snap(s.label)); this.restore(s); return true;
  }
  /** does the last undone click or change again; false when there is none */
  redo(): boolean {
    if (this.drag || !this.future.length) return false;
    const s = this.future.pop()!;
    this.past.push(this.snap(s.label)); this.restore(s); return true;
  }
  /** what undo and redo would take back or do again ('' none), for the panel's tooltips */
  get undoLabel(): string { return this.past[this.past.length - 1]?.label ?? ''; }
  get redoLabel(): string { return this.future[this.future.length - 1]?.label ?? ''; }
  /** whether the wizard has something on screen (a tee, a plan, or a built plan open): Ctrl+Z then stays in the wizard */
  get busy(): boolean { return this.step !== 'tee' || !!this.base; }

  /**
   * Esc (P23 4.4): one stage back. A drag in hand is dropped (the plan as it was before it); shaping goes back to the green step with the tee
   * where it is (an edit closes instead, and the wizard waits for the tee of hole `free`); the green step goes back to the tee step; at the
   * tee step it is 'out' (the caller leaves New hole). Returns where it went
   */
  back(free: number): WizStep | 'out' {
    if (this.drag) { const s = this.pending; if (s) this.restore(s); else { this.drag = null; this.pending = null; } return this.step; }
    if (this.step === 'tee') return 'out';
    if (this.step === 'shape' && this.base) { this.start(free || this.hole); return 'tee'; }
    if (this.step === 'shape') {
      this.tee = this.plan ? { ...this.plan.tee } : this.tee;
      this.step = 'green'; this.plan = null; this.hover = null; this.turnOff = 0;
      // the clicks before the green stay undoable; what came after it went with the plan
      this.past = this.past.filter(s => s.step === 'tee'); this.future = [];
      if (this.cursor) this.followGreen(this.cursor);
      return 'green';
    }
    this.start(this.hole); return 'tee';
  }
  /** a new hole takes number n (the card's Number picker): the plan on screen too, its shape as it is */
  renumber(n: number): void {
    if (this.base) return;
    this.hole = n;
    if (this.plan) this.plan = { ...clonePlan(this.plan), hole: n };
  }
  /** the built plans changed under the wizard (a course undo or redo): an edit starts again (its plan may be gone), and so does the tee step
   *  (for hole `free`); a new plan on screen stays, renumbered only when its number is now taken */
  plansChanged(free: number, taken: (n: number) => boolean): void {
    if (this.base || this.step === 'tee') { this.start(free || this.hole); return; }
    if (free && taken(this.hole)) this.renumber(free);
  }

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
    this.push(this.snap('take out a bend'));
    this.plan = reshape(pl, pl.tee, pl.green, b, this.turnOff); this.hover = null; return true;
  }
  /** turns the green by deg degrees (R) */
  turnGreen(deg: number): void {
    if (!this.plan) return;
    this.push(this.snap('turn the green'));
    this.plan = { ...clonePlan(this.plan), greenTurn: this.plan.greenTurn + deg }; this.turnOff += deg;
  }
  /** sizes the green by dm2 m² within GREEN_M2_MIN..GREEN_M2_MAX ([ ]) */
  sizeGreen(dm2: number): void {
    if (!this.plan) return;
    const m2 = Math.max(GREEN_M2_MIN, Math.min(GREEN_M2_MAX, this.plan.greenM2 + dm2));
    if (m2 === this.plan.greenM2) return;
    this.push(this.snap('size the green'));
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
    // the practice area (P24 D24): the cells laid there will hold no hole, as row runs for the warning hatch
    const pb = this.host.practiceBox?.() ?? null, inPb = (x: number, y: number) => !!pb && x >= pb[0] && x < pb[2] && y >= pb[1] && y < pb[3];
    const pr: number[] = []; let practice = 0;
    if (pb) {
      let a0 = -1, b0 = -1, y0 = -1;
      for (let k = 0; k < dn; k++) {
        if (!s1[k]) continue;
        const i = idx[k]!, cx = i % g.w, cy = (i - cx) / g.w;
        if (!inPb(g.x0 + (cx + 0.5) * CELL_T, g.y0 + (cy + 0.5) * CELL_T)) continue;
        practice++;
        if (cy === y0 && cx === b0 + 1) { b0 = cx; continue; }
        if (y0 >= 0) pr.push(y0, a0, b0);
        y0 = cy; a0 = b0 = cx;
      }
      if (y0 >= 0) pr.push(y0, a0, b0);
    }
    this.ghostVal = {
      diff, cost, laid, cleared, refused: refused.length, runs: Int32Array.from(runs), edges, gx0: g.x0, gy0: g.y0, info, geom,
      teeOk: okAt(pl.tee.x, pl.tee.y), greenOk: okAt(pl.green.x, pl.green.y),
      refusedIdx: Int32Array.from(refused), practice, practiceRuns: Int32Array.from(pr),
      teePractice: inPb(pl.tee.x, pl.tee.y), greenPractice: inPb(pl.green.x, pl.green.y),
    };
    this.ghostKey = key;
    return this.ghostVal;
  }

  /** whether Build can go ahead now, and why not ('' when it can), as the first block of P23 4.4's table: the tee and the green on your land
   *  (not the driving range's plot, not the practice area), the money, an edit that changes nothing. id names the block ('land', 'range',
   *  'practice', 'money', 'same'); at, the tee or the green it stands on */
  check(): { ok: boolean; why: string; ghost: WizardGhost | null; id?: string; at?: 'tee' | 'green' } {
    const gh = this.step === 'shape' ? this.ghost() : null;
    if (!gh || !this.plan) return { ok: false, why: this.step === 'shape' ? 'No course here' : 'Click the tee, then the green', ghost: null };
    const pl = this.plan;
    for (const [at, ok, inPractice] of [['tee', gh.teeOk, gh.teePractice], ['green', gh.greenOk, gh.greenPractice]] as const) {
      const p = pl[at], why = ok ? (inPractice ? 'practice' : '') : (this.host.landWhy?.(p.x, p.y) || 'off');
      if (why) return { ok: false, why: `The ${at} is ${SPOT_WHY[why]}`, ghost: gh, id: why === 'off' ? 'land' : why, at };
    }
    const money = this.host.money();
    if (gh.cost > money) return { ok: false, why: `Not enough money: $${gh.cost.toLocaleString()} (you have $${Math.round(money).toLocaleString()})`, ghost: gh, id: 'money' };
    if (!gh.diff.n && !this.dirty) return { ok: false, why: NO_CHANGES, ghost: gh, id: 'same' };
    return { ok: true, why: '', ghost: gh };
  }

  /**
   * New hole's check table (P23 4.4) while shaping: the block Build waits on (check(), with Seed as the fix when Sod costs too much), the
   * warnings (cells left out, another hole's line under NEAR_M, a walk from the last green over WALK_M, a road across the line, cells on the
   * practice area), then the checks passed. The warnings are cached with the ghost and the built plans: two distances and a count, no new
   * simulation
   */
  checks(): WizCheck[] {
    const c = this.check(), gh = c.ghost, pl = this.plan; if (!gh || !pl) return [];
    const out: WizCheck[] = [];
    if (!c.ok) out.push({ id: c.id ?? 'block', kind: 'block', text: c.why, ...(c.id === 'money' && this.host.sod?.() ? { fix: 'seed' as const } : {}), ...(c.at ? { show: [{ ...pl[c.at] }] } : {}) });
    out.push(...this.warnings(gh));
    const has = (id: string) => out.some(r => r.id === id);
    if (!has('land') && !has('range') && !has('practice')) out.push({ id: 'ok-land', kind: 'ok', text: 'Tee and green on your land' });
    if (!has('road')) out.push({ id: 'ok-road', kind: 'ok', text: 'No road across the hole' });
    if (!has('near')) out.push({ id: 'ok-near', kind: 'ok', text: `No other hole within ${NEAR_M} m` });
    return out;
  }
  /** the warnings of the check table (see checks), cached */
  private warnings(gh: WizardGhost): WizCheck[] {
    const pl = this.plan!, plans = this.host.plans(), lines = this.host.holeLines?.() ?? [];
    const key = `${this.ghostKey}|${pl.hole}|${plans.map(p => JSON.stringify(encodePlan(p))).join(';')}|${JSON.stringify(lines)}|${JSON.stringify(this.host.pinOf?.(pl.hole - 1) ?? null)}`;
    if (key === this.warnKey) return this.warnVal;
    const out: WizCheck[] = [], g = this.host.grid();
    // cells left out, by why: not your land, the driving range's plot, another hole
    if (gh.refused && g) {
      const by = new Map<string, number>(); let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const i of gh.refusedIdx) {
        const cx = i % g.w, cy = (i - cx) / g.w, x = g.x0 + (cx + 0.5) * CELL_T, y = g.y0 + (cy + 0.5) * CELL_T;
        const land = !!this.host.allow && !this.host.allow(i);
        const what = land ? (this.host.landWhy?.(x, y) === 'range' ? 'the driving range' : 'not your land') : `hole ${g.hole[i]}`;
        by.set(what, (by.get(what) ?? 0) + 1);
        x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
      }
      const parts = [...by].sort((a, b) => b[1] - a[1]), m2 = (n: number) => `${n.toLocaleString()} m²`; // a cell is 1 m²
      const text = parts.length === 1 ? `${m2(gh.refused)} left out: ${parts[0]![0]}` : `${m2(gh.refused)} left out: ${parts.map(([w, n]) => `${w} ${m2(n)}`).join(', ')}`;
      out.push({ id: 'left', kind: 'warn', text, show: [{ x: x0, y: y0 }, { x: x1, y: y1 }] });
    }
    // too close to another hole: the nearest line (planned holes by their plan's line, the others tee to pin), the ends left out
    const mine = trimmed(gh.geom.line, NEAR_END_M / 2, 2);
    let near: { d: number; hole: number; a: Pt; b: Pt } | null = null;
    const others = new Map<number, Pt[]>();
    for (const p of plans) if (p.hole !== pl.hole) others.set(p.hole, this.geomOf(p).line);
    for (const l of lines) if (l.hole !== pl.hole && !others.has(l.hole) && l.line.length > 1) others.set(l.hole, l.line);
    for (const [hole, line] of others) {
      const r = lineGap(mine, trimmed(line, NEAR_END_M / 2, 2), NEAR_M / 2);
      if (r && (!near || r.d < near.d)) near = { ...r, hole };
    }
    if (near && near.d * 2 < NEAR_M) out.push({ id: 'near', kind: 'warn', text: `${Math.round(near.d * 2)} m from hole ${near.hole}'s line: golfers there are in range`, show: [near.a, near.b] });
    // a long walk from the last hole's green to this tee
    const last = pl.hole > 1 ? (this.planOf(pl.hole - 1)?.green ?? this.host.pinOf?.(pl.hole - 1) ?? null) : null;
    if (last) {
      const d = Math.round(Math.hypot(pl.tee.x - last.x, pl.tee.y - last.y) * 2);
      if (d > WALK_M) out.push({ id: 'walk', kind: 'warn', text: `${d} m walk from hole ${pl.hole - 1}'s green`, show: [{ ...last }, { ...pl.tee }] });
    }
    // a public road across the line
    if (this.host.roads) {
      const L = gh.geom.line, m = CORRIDOR_M / 2;
      let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
      for (const p of L) { bx0 = Math.min(bx0, p.x); by0 = Math.min(by0, p.y); bx1 = Math.max(bx1, p.x); by1 = Math.max(by1, p.y); }
      const names: string[] = []; let at: Pt | null = null;
      for (const r of this.host.roads([bx0 - m, by0 - m, bx1 + m, by1 + m])) {
        const q = crossing(L, r); if (!q) continue;
        at ??= q; const n = r.name || 'a road'; if (!names.includes(n)) names.push(n);
      }
      if (at) out.push({ id: 'road', kind: 'warn', text: `Crosses ${names.slice(0, 2).join(' and ')}${names.length > 2 ? ' and more' : ''}: carts need a crossing`, show: [at] });
    }
    // the practice area (P24 D24): the cells laid there stay practice, no hole
    if (gh.practice) {
      const r = gh.practiceRuns; let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let k = 0; k < r.length; k += 3) { const y = gh.gy0 + r[k]! * CELL_T; x0 = Math.min(x0, gh.gx0 + r[k + 1]! * CELL_T); x1 = Math.max(x1, gh.gx0 + (r[k + 2]! + 1) * CELL_T); y0 = Math.min(y0, y); y1 = Math.max(y1, y + CELL_T); }
      out.push({ id: 'practice-cells', kind: 'warn', text: 'Crosses the practice area: those cells stay practice', show: [{ x: x0, y: y0 }, { x: x1, y: y1 }] });
    }
    this.warnKey = key; this.warnVal = out;
    return out;
  }

  /** the plan's price planted with Seed and with Sod ($: the ghost's cells at each), or null with no ghost */
  costs(): { seed: number; sod: number } | null {
    const gh = this.ghost(); if (!gh) return null;
    const at = this.host.priceAs; if (!at) return { seed: gh.cost, sod: gh.cost };
    return { seed: Math.round(diffCost(gh.diff, s => at(s, false))), sod: Math.round(diffCost(gh.diff, s => at(s, true))) };
  }
  /** the price split by surface (P23 4.3): the cells each surface lays (1 m² each) and what they cost, by surface id */
  split(): Map<number, { cells: number; cost: number }> {
    const out = new Map<number, { cells: number; cost: number }>(), gh = this.ghost(); if (!gh) return out;
    const d = gh.diff;
    for (let k = 0; k < d.n; k++) {
      const s0 = d.s0[k]!, s1 = d.s1[k]!;
      if (s1 === SURF.none || s1 === s0 || (s1 === SURF.rough && s0 > SURF.rough)) continue;
      let v = out.get(s1); if (!v) out.set(s1, (v = { cells: 0, cost: 0 }));
      v.cells++; v.cost += this.host.price(s1);
    }
    for (const v of out.values()) v.cost = Math.round(v.cost);
    return out;
  }
  /** what the camera frames after the tee click (P23 4.4): points round the circle of TEE_VIEW_M round the tee, each kept inside your land's
   *  box (the host's landBox) where it has one, and the tee itself; [] with no tee */
  teeView(): Pt[] {
    const t = this.tee; if (!t) return [];
    const r = TEE_VIEW_M / 2, b = this.host.landBox?.() ?? null; // the radius in tiles (2 m)
    const keep = (x: number, y: number): Pt => (b ? { x: Math.max(b[0], Math.min(b[2], x)), y: Math.max(b[1], Math.min(b[3], y)) } : { x, y });
    return [{ ...t }, ...Array.from({ length: 24 }, (_, k) => keep(t.x + r * Math.cos((k * Math.PI) / 12), t.y + r * Math.sin((k * Math.PI) / 12)))];
  }
  /** what the camera frames after the green click (P23 4.4): the plan's corridor (its line with the rough either side) and the green */
  planView(): Pt[] {
    const pl = this.plan; if (!pl) return [];
    const geom = this.geomOf(pl), L = geom.line, m = CORRIDOR_M / 2, out: Pt[] = [];
    for (let i = 0; i < L.length; i += i + 8 < L.length ? 8 : Math.max(1, L.length - 1 - i)) {
      const p = L[i]!, nx = geom.nx[i]!, ny = geom.ny[i]!;
      out.push({ x: p.x + nx * m, y: p.y + ny * m }, { x: p.x - nx * m, y: p.y - ny * m });
      if (i === L.length - 1) break;
    }
    const gr = (geom.greenR + CORRIDOR_M / 2) / 2;
    for (let k = 0; k < 8; k++) out.push({ x: pl.green.x + gr * Math.cos((k * Math.PI) / 4), y: pl.green.y + gr * Math.sin((k * Math.PI) / 4) });
    return out;
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
    if (!c.ok && c.id !== 'same') return { text: `${head} · ${c.why}`, bad: true };
    return { text: gh.refused ? `${head} · ${gh.refused.toLocaleString()} m² left out` : head, bad: false };
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

/** the hole's shape in a word or two for the card: 'straight', 'dogleg left' or 'dogleg right' (as the golfer on the tee sees it: the
 *  iso view keeps the tiles' handedness), 'double dogleg', or 'n bends'; turns under 10° count as straight */
export function planShape(plan: HolePlan): string {
  const pts = [plan.tee, ...plan.bends, plan.green], turns: number[] = [];
  for (let i = 1; i + 1 < pts.length; i++) {
    const a = pts[i - 1]!, b = pts[i]!, c = pts[i + 1]!, ux = b.x - a.x, uy = b.y - a.y, vx = c.x - b.x, vy = c.y - b.y;
    const deg = (Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy) * 180) / Math.PI; // + turns right (tiles: y runs down)
    if (Math.abs(deg) >= 10) turns.push(deg);
  }
  if (!turns.length) return 'straight';
  if (turns.length === 1) return turns[0]! > 0 ? 'dogleg right' : 'dogleg left';
  return turns.length === 2 ? 'double dogleg' : `${turns.length} bends`;
}

/** a polyline (tiles) without endT tiles of its length at each end, as points about stepT tiles apart ([] when it is no longer than 2 endT) */
export function trimmed(line: readonly Pt[], endT: number, stepT: number): Pt[] {
  const n = line.length; if (n < 2) return [];
  const cum = new Float64Array(n);
  for (let i = 1; i < n; i++) cum[i] = cum[i - 1]! + Math.hypot(line[i]!.x - line[i - 1]!.x, line[i]!.y - line[i - 1]!.y);
  const L = cum[n - 1]!; if (L <= 2 * endT) return [];
  const out: Pt[] = []; let j = 1;
  const at = (s: number) => {
    while (j < n - 1 && cum[j]! < s) j++;
    const a = line[j - 1]!, b = line[j]!, seg = cum[j]! - cum[j - 1]!, u = seg > 0 ? (s - cum[j - 1]!) / seg : 0;
    return { x: a.x + u * (b.x - a.x), y: a.y + u * (b.y - a.y) };
  };
  for (let s = endT; s < L - endT; s += stepT) out.push(at(s));
  out.push(at(L - endT));
  return out;
}
/** the nearest approach (tiles) of two polylines (their points to the other's segments, both ways), and the two points; null when either
 *  is empty or their boxes lie farther apart than within tiles */
export function lineGap(a: readonly Pt[], b: readonly Pt[], within: number): { d: number; a: Pt; b: Pt } | null {
  if (!a.length || !b.length) return null;
  const box = (l: readonly Pt[]) => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const p of l) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); } return [x0, y0, x1, y1] as const; };
  const A = box(a), B = box(b);
  if (A[0] > B[2] + within || B[0] > A[2] + within || A[1] > B[3] + within || B[1] > A[3] + within) return null;
  let best: { d: number; a: Pt; b: Pt } | null = null;
  const pass = (P: readonly Pt[], Q: readonly Pt[], flip: boolean) => {
    for (const p of P) for (let j = 0; j < Q.length; j++) {
      const q0 = Q[j]!, q1 = Q[Math.min(Q.length - 1, j + 1)]!, dx = q1.x - q0.x, dy = q1.y - q0.y, l2 = dx * dx + dy * dy;
      const u = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - q0.x) * dx + (p.y - q0.y) * dy) / l2)) : 0, q = { x: q0.x + u * dx, y: q0.y + u * dy };
      const d = Math.hypot(p.x - q.x, p.y - q.y);
      if (!best || d < best.d) best = flip ? { d, a: q, b: { ...p } } : { d, a: { ...p }, b: q };
    }
  };
  pass(a, b, false); pass(b, a, true);
  return best;
}
/** where polyline L (tiles) first crosses segment r, or null */
function crossing(L: readonly Pt[], r: { ax: number; ay: number; bx: number; by: number }): Pt | null {
  const ex = r.bx - r.ax, ey = r.by - r.ay;
  for (let i = 1; i < L.length; i++) {
    const p = L[i - 1]!, q = L[i]!, dx = q.x - p.x, dy = q.y - p.y, den = dx * ey - dy * ex;
    if (!den) continue;
    const t = ((r.ax - p.x) * ey - (r.ay - p.y) * ex) / den, u = ((r.ax - p.x) * dy - (r.ay - p.y) * dx) / den;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return { x: p.x + t * dx, y: p.y + t * dy };
  }
  return null;
}

/** the free part of the map beside the panel (css px: left, top, right, bottom) */
export interface FreeRect { l: number; t: number; r: number; b: number }
/** a camera: the world point at the view's centre and the zoom */
export interface View { X: number; Y: number; z: number }
/**
 * the camera that frames tiles pts in the free rect of a cssW x cssH view (P23 4.4, the free map beside the panel): the points' box on the
 * screen fills the rect less pad css px a side, the zoom within zMin..zMax. zoomIn false only eases out (a farther zoom stays) and keeps the
 * centre while the box is already in the rect. null when there is nothing to frame
 */
export function frameView(pts: readonly Pt[], free: FreeRect, cssW: number, cssH: number, cam: View, zoomIn: boolean, zMin: number, zMax: number, pad = 24): View | null {
  if (!pts.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { const X = worldX(p.x, p.y), Y = worldY(p.x, p.y); x0 = Math.min(x0, X); y0 = Math.min(y0, Y); x1 = Math.max(x1, X); y1 = Math.max(y1, Y); }
  const fw = Math.max(40, free.r - free.l - 2 * pad), fh = Math.max(40, free.b - free.t - 2 * pad);
  let z = Math.max(zMin, Math.min(zMax, fw / Math.max(1, x1 - x0), fh / Math.max(1, y1 - y0)));
  if (!zoomIn) z = Math.min(z, cam.z);
  if (!zoomIn) {
    const sx = (X: number) => (X - cam.X) * z + cssW / 2, sy = (Y: number) => (Y - cam.Y) * z + cssH / 2;
    if (sx(x0) >= free.l + pad && sx(x1) <= free.r - pad && sy(y0) >= free.t + pad && sy(y1) <= free.b - pad) return { X: cam.X, Y: cam.Y, z };
  }
  const fx = (free.l + free.r) / 2, fy = (free.t + free.b) / 2;
  return { X: (x0 + x1) / 2 - (fx - cssW / 2) / z, Y: (y0 + y1) / 2 - (fy - cssH / 2) / z, z };
}

/** money as the card says it: "$950", "$282k", "$1.2M" */
export function aboutMoney(n: number): string {
  if (!Number.isFinite(n)) return 'unlimited';
  const a = Math.abs(n), s = n < 0 ? '-' : '';
  if (a < 999.5) return `${s}$${Math.round(a)}`;
  if (a < 999_500) return `${s}$${Math.round(a / 1000)}k`;
  return `${s}$${(a / 1e6).toFixed(a < 1e7 ? 1 : 0)}M`;
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
