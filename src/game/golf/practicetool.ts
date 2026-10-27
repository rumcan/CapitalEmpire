// Facilities ▸ Practice (T206, #540; the owner, 2026-10-27: "this should have its own building tools. not use the course hole building
// tools"): the engine's side of golf/practicebuild.ts. Pick a facility (the flyout, or Build on the range card) and its ghost follows the
// cursor over the practice area, green where it can go with its price, red with the reason where it cannot; [ / ] size it (never under what
// opens it), R turns it, Tab steps the putting green's outline; a click builds it, one step of the course tools' undo (PaintTool.gridEdit).
// Outside the area the pill under the map offers "Show area". The bulldozer takes a facility whole (facilityAt) for half its price back.
// The engine gives it a small context, so its own edits stay a few lines.
import type { Pt } from '../network';
import type { Grid, GridDiff } from '../ext/course-grid';
import { SURF, paintCells } from '../ext/course-grid';
import { plantMonth } from '../ext/course-grid/areas';
import { PRACTICE_SIZE, PRACTICE_WHY, PUTT_SHAPES, SIZE_STEP, TURNS, clampSize, facilityAt, facilityRefund, planCells, planCost, planWhy, practicePlan, type FacilityPlan, type PlanCells, type RefusalKind } from './practicebuild';
import type { PracticeId } from './rangesave';

/** a facility's name as the tool says it */
export const FACILITY_NAME: Readonly<Record<PracticeId, string>> = { putting: 'Putting green', chipping: 'Chipping green and bunker' };

/** what the tool needs of the engine */
export interface PracticeHostCtx {
  /** the practice area (null: not a range start) and the course grid (null: none yet) */
  area(): { box: readonly [number, number, number, number]; label: Pt; pts: number[] } | null; grid(): Grid | null;
  /** whether tile (x, y) is the player's land; whether a facility is open now (practice.ts's scan) */
  owned(x: number, y: number): boolean; open(kind: PracticeId): boolean;
  tileAt(mx: number, my: number): Pt; money(): number; month(): number;
  /** one step of the course tools' undo: run lays its cells (the diffs it returns) and what it spent ($; a refund below 0) */
  gridStep(label: string, run: (g: Grid) => { diffs: GridDiff[]; spent: number } | null): void; undo(): void; redo(): void;
  /** the camera on tile (x, y) at zoom z */
  lookAt(x: number, y: number, z: number): void;
  save(): void; toast(text: string, kind: 'good' | 'info' | 'warn'): void; emit(): void;
}

/** the ghost the engine draws: the plan, its cells, its price, why it is refused ('' when it can be built) and the kind of refusal, its label */
export interface PracticeGhost { plan: FacilityPlan; cells: PlanCells; cost: number; why: string; refusal: RefusalKind; label: string; m2: number }

export class PracticeTool {
  /** the facility in hand (null: none), its green's size per kind (m²), its turn (eighths), the putting green's outline and the wobble's seed */
  kind: PracticeId | null = null;
  size: Record<PracticeId, number> = { putting: PRACTICE_SIZE.putting.def, chipping: PRACTICE_SIZE.chipping.def };
  turn = 0; shape = 0; seed = 1;
  /** the ghost at the cursor (null: off the map or nothing in hand) */
  ghost: PracticeGhost | null = null;
  private at: Pt | null = null;
  constructor(private ctx: PracticeHostCtx) {}

  /** picks a facility (the flyout's row, the range card's Build): it is in hand; show: the camera moves to the practice area too */
  arm(kind: PracticeId, show = false): void {
    this.kind = kind; this.ghost = null;
    if (show) this.showArea();
    this.refresh(); this.ctx.emit();
  }
  /** the camera on the practice area (the pill's and the card's Show area) */
  showArea(): void { const a = this.ctx.area(); if (a) { this.ctx.lookAt(a.label.x, a.label.y, 0.3); if (!this.at) this.at = { ...a.label }; this.refresh(); } }
  /** the facility in hand goes down (a tool change, Esc); true when there was one */
  cancel(): boolean { const had = !!this.kind; this.kind = null; this.ghost = null; return had; }

  // ---- the pointer and the keys
  /** the cursor moved: the ghost follows (css px) */
  move(mx: number, my: number): void {
    const was = this.ghost?.label ?? ''; this.at = this.ctx.tileAt(mx, my); this.refresh();
    if ((this.ghost?.label ?? '') !== was) this.ctx.emit(); // the panel's and the pill's words follow (the refusal, the price)
  }
  /** the pointer left the map */
  leave(): void { this.at = null; this.ghost = null; }
  /** a click: builds the ghost, or says why not */
  click(mx: number, my: number): void {
    this.move(mx, my);
    const gh = this.ghost, k = this.kind; if (!gh || !k) return;
    if (gh.why) { this.ctx.toast(gh.why, 'warn'); return; }
    if (gh.cost > this.ctx.money()) { this.ctx.toast(`Not enough money: the ${FACILITY_NAME[k].toLowerCase()} costs $${gh.cost.toLocaleString()}`, 'warn'); return; }
    const c = gh.cells, month = plantMonth('seed', this.ctx.month());
    this.ctx.gridStep(`build the ${FACILITY_NAME[k].toLowerCase()}`, g => ({
      diffs: [paintCells(g, c.green, c.green.length, SURF.green, 0, month), paintCells(g, c.bunker, c.bunker.length, SURF.bunker, 0, month), paintCells(g, c.tee, c.tee.length, SURF.tee, 0, month)],
      spent: gh.cost,
    }));
    this.ctx.toast(`${FACILITY_NAME[k]} built (-$${gh.cost.toLocaleString()})`, 'good');
    this.seed++; this.ctx.save(); this.refresh(); this.ctx.emit();
  }
  /** a key in the tool: [ / ] size, R turns, Tab / Shift+Tab the putting green's outline, Ctrl+Z / Ctrl+Y undo and redo; true when taken */
  key(e: KeyboardEvent): boolean {
    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); this.ctx.undo(); this.refresh(); return true; }
      if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); this.ctx.redo(); this.refresh(); return true; }
      return false;
    }
    const kind = this.kind; if (!kind) return false;
    if (e.key === '[' || e.key === ']') { this.resize(e.key === ']' ? 1 : -1); return true; }
    if (e.key === 'r' || e.key === 'R') { this.setTurn(this.turn + (e.shiftKey ? -1 : 1)); return true; }
    if (e.key === 'Tab' && kind === 'putting') { e.preventDefault(); this.setShape(this.shape + (e.shiftKey ? -1 : 1)); return true; }
    return false;
  }
  /** a size step up (1) or down (-1), never past the facility's range (a step at the end says so) */
  resize(d: 1 | -1): void {
    const k = this.kind; if (!k) return;
    const was = this.size[k], next = clampSize(k, Math.round(was * (d > 0 ? SIZE_STEP : 1 / SIZE_STEP)));
    if (next === was) this.ctx.toast(d > 0 ? `The biggest ${FACILITY_NAME[k].toLowerCase()}: ${was} m²` : `The smallest that opens: ${was} m² of green`, 'info');
    this.size[k] = next; this.refresh(); this.ctx.emit();
  }
  setTurn(t: number): void { this.turn = ((Math.round(t) % TURNS) + TURNS) % TURNS; this.refresh(); this.ctx.emit(); }
  setShape(s: number): void { this.shape = ((Math.round(s) % PUTT_SHAPES.length) + PUTT_SHAPES.length) % PUTT_SHAPES.length; this.refresh(); this.ctx.emit(); }
  /** a fresh wobble for the putting green's outline (the panel's Reshape) */
  reseed(): void { this.seed++; this.refresh(); this.ctx.emit(); }

  // ---- the ghost
  /** the ghost worked out again at the cursor (cheap enough for every move: a few hundred cells) */
  refresh(): void {
    const k = this.kind, t = this.at, g = this.ctx.grid(), a = this.ctx.area();
    if (!k || !t || !g) { this.ghost = null; return; }
    const plan = practicePlan({ kind: k, x: t.x, y: t.y, m2: this.size[k], turn: this.turn, shape: this.shape, seed: this.seed }), cells = planCells(g, plan);
    const r = a ? planWhy(g, plan, cells, { box: a.box, owned: (x, y) => this.ctx.owned(x, y), open: this.ctx.open(k) }) : { why: PRACTICE_WHY.none, kind: 'outside' as RefusalKind };
    const cost = planCost(g, cells), m2 = cells.green.length;
    const label = r.why || `${FACILITY_NAME[k]} · ${m2} m² · $${cost.toLocaleString()}${cost > this.ctx.money() ? ' (not enough money)' : ''}`;
    this.ghost = { plan, cells, cost, why: r.why, refusal: r.kind, label, m2 };
  }
  /** the panel's and the pill's words for the facility in hand */
  get status(): string { const g = this.ghost; return g ? g.label : this.kind ? `Move the ${FACILITY_NAME[this.kind].toLowerCase()} over the practice area` : 'Pick a facility'; }

  // ---- the bulldozer
  /** the facility under tile (x, y) in the practice area, with what removing it refunds (null: none there) */
  facilityAt(x: number, y: number): { cells: number[]; refund: number; name: string } | null {
    const g = this.ctx.grid(), a = this.ctx.area(); if (!g || !a) return null;
    const f = facilityAt(g, a.box, x, y); if (!f) return null;
    return { cells: f.cells, refund: facilityRefund(f), name: f.bunker > 0 ? 'chipping green and bunker' : f.green > 0 ? 'practice green' : 'chip mat' };
  }
  /** the bulldozer on tile (x, y): the facility there goes whole (its cells back to the land's grass), half its price back; false: none there */
  removeAt(x: number, y: number): boolean {
    const f = this.facilityAt(x, y); if (!f) return false;
    this.ctx.gridStep(`remove the ${f.name}`, g => ({ diffs: [paintCells(g, f.cells, f.cells.length, SURF.none, 0, 0)], spent: -f.refund }));
    this.ctx.toast(`Removed the ${f.name} (+$${f.refund.toLocaleString()})`, 'good');
    this.ctx.save(); this.refresh(); this.ctx.emit();
    return true;
  }
}
