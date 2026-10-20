// The Parking tool's state and input (docs/PARKING.md sections 1 and 2): the bay rows and the on-street curbs the player lays, the parking fee, the drag
// and hover, validation and the preview. No React; the engine calls it, and the city worker gets the full lists (ParkingHost.sendParking).
import type { LotPatch } from './ground-protocol';
import type { PaintView } from './paint-tool';
import { type Pt, type RoadNetwork, type Seg, sub, vlen } from './network';
import { ROW_BAY_COST, lotPark, rowBays, rowCheck, rowGeom, rowLines, rowLots, rowQuad, type BayRowDef } from './event/rows';
import { curbCheck, curbFrom, curbLines, curbQuad, resolveCurb, type Curb, type CurbDef } from './event/curb';
import type { CarPark } from './event/carpark';
import { CURB_BAY_COST } from './event/config';

/** the tool's modes: rect is the engine's car park drag (this tool does nothing in it), rows lays bay rows, curb marks on-street parking */
export type ParkMode = 'rect' | 'rows' | 'curb';

/** what the tool needs from the engine and the city worker */
export interface ParkingHost {
  setLotGround(key: string, patches: LotPatch[] | null): void;
  emit(): void;
  save(): void;
  toast(text: string, kind?: 'info' | 'warn' | 'good'): void;
  /** the money there is, and spend (construction) */
  money(): number;
  spend(n: number): void;
  /** the city worker gets the full lists and the fee (SimClient.setParking) */
  sendParking(rows: BayRowDef[], curbs: CurbDef[], fee: number): void;
  net(): RoadNetwork;
  terrain(): Uint8Array;
  mapSize: number;
  /** the toll plaza dseg keys (curbs may not overlap them) */
  tollKeys(): Set<string>;
}

/** the most a car pays ($) */
const FEE_MAX = 50;
/** a drag shorter than this (tiles) is a click */
const CLICK = 0.5;
/** a row's start snaps to the end of an existing row's front line within this many tiles */
const SNAP_END = 1.5;
/** Shift's angle step: 15 degrees, radians */
const STEP = Math.PI / 12;

/** a point inside the convex quad q (x0 y0 … x3 y3, corners in order; the boundary counts) */
function inFlat(q: number[], x: number, y: number): boolean {
  let pos = false, neg = false;
  for (let i = 0; i < 8; i += 2) {
    const j = (i + 2) & 7, k = (q[j]! - q[i]!) * (y - q[i + 1]!) - (q[j + 1]! - q[i + 1]!) * (x - q[i]!);
    if (k > 0) pos = true; else if (k < 0) neg = true;
    if (pos && neg) return false;
  }
  return true;
}

/** adds a polygon's corners to the current path (the caller begins the path and sets the transform) */
function trace(ctx: CanvasRenderingContext2D, pts: number[], closed: boolean) {
  const n = pts.length >> 1; if (n < 1) return;
  ctx.moveTo(pts[0]!, pts[1]!); for (let i = 1; i < n; i++) ctx.lineTo(pts[2 * i]!, pts[2 * i + 1]!);
  if (closed) ctx.closePath();
}

/** fills and/or outlines a polygon (x0 y0 … in tiles) on the overlay; lw in css px */
function poly(v: PaintView, P: number[], fill: string | null, stroke: string | null, lw: number) {
  const ctx = v.ctx;
  v.setIso(ctx); ctx.beginPath(); trace(ctx, P, true); ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw * v.dpr; ctx.stroke(); }
}

/** strokes the separate segments x0 y0 x1 y1 … (tiles) on the overlay; lw in css px */
function segs(v: PaintView, L: number[], col: string, lw: number) {
  const ctx = v.ctx;
  v.setIso(ctx); ctx.beginPath();
  for (let i = 0; i + 3 < L.length; i += 4) { ctx.moveTo(L[i]!, L[i + 1]!); ctx.lineTo(L[i + 2]!, L[i + 3]!); }
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.strokeStyle = col; ctx.lineWidth = lw * v.dpr; ctx.stroke();
}

/** the Parking tool: the rows and curbs, the fee, the drag (rows) and the hovered run (curb), and the preview */
export class ParkingTool {
  /** the bay rows as laid */
  rows: BayRowDef[] = [];
  /** the on-street runs as marked */
  curbs: CurbDef[] = [];
  /** the parking fee per car ($) */
  fee = 5;
  mode: ParkMode = 'rect';
  /** the bays' angle to the aisle (the next row) */
  bay: 90 | 60 | 45 = 90;
  /** the next row's line colour */
  col: 'white' | 'yellow' = 'yellow';
  /** the side the next row's bays stand on (Tab flips it) */
  side: 1 | -1 = 1;
  /** Shift held: the drag's angle snaps to 15 degrees */
  snap15 = false;
  /** the row drag: its start and its pointer end, tiles, or null */
  drag: { a: Pt; b: Pt } | null = null;
  /** the row under the pointer when not dragging (its id; 0: none) */
  hoverRow = 0;
  /** the run under the pointer in curb mode, or null */
  hoverCurb: CurbDef | null = null;
  /** the id of the existing curb the hovered run overlaps (0: none): a click removes it */
  hoverExisting = 0;
  /** the reason the current preview cannot go ('' if it can) */
  why = '';
  /** the pointer in css px, or null */
  mouse: { mx: number; my: number } | null = null;
  /** the bays and the cost ($) of the preview: the row being dragged, or the hovered run */
  count = 0;
  cost = 0;
  /** the hovered run as resolved (its bays and strip), or the existing curb (hoverExisting), or null */
  private shown: Curb | null = null;
  /** the ground keys sent last time (row:<id>, curb:<id>) */
  private keys = new Set<string>();
  private host: ParkingHost;

  constructor(host: ParkingHost) { this.host = host; }

  /** the next free id of a list: its largest id + 1 */
  nextId(list: { id: number }[]): number { let m = 0; for (const d of list) if (d.id > m) m = d.id; return m + 1; }

  /** re-sends every row's and curb's ground patch and drops the keys no longer in use (a curb whose run is gone is dropped) */
  private ground() {
    const net = this.host.net(), now = new Set<string>();
    for (const r of this.rows) {
      const k = 'row:' + r.id, p: LotPatch = { pts: rowQuad(r), tex: 'asphalt', lines: rowLines(r) };
      if (r.col === 'yellow') p.lineCol = 'yellow';
      now.add(k); this.host.setLotGround(k, [p]);
    }
    for (const d of this.curbs) {
      const c = resolveCurb(net, d); if (!c) continue;
      const k = 'curb:' + d.id; now.add(k);
      this.host.setLotGround(k, [{ pts: curbQuad(c), tex: 'asphalt', top: true, lines: curbLines(c) }]);
    }
    for (const k of this.keys) if (!now.has(k)) this.host.setLotGround(k, null);
    this.keys = now;
  }

  /** re-sends the ground and the full lists and fee to the city worker (after any change, after load, after network edits) */
  sync() { this.ground(); this.host.sendParking(this.rows, this.curbs, this.fee); }

  /** the rows, curbs and fee replaced by the saved ones (the fee 5 when absent); the drag and hover reset; syncs (no save) */
  load(rows?: BayRowDef[], curbs?: CurbDef[], fee?: number) {
    this.rows = (rows ?? []).map(r => ({ ...r }));
    this.curbs = (curbs ?? []).map(c => ({ ...c }));
    this.fee = Math.max(0, Math.min(FEE_MAX, Math.round(fee ?? 5)));
    this.resetInput(); this.sync();
  }

  /** removes every row and curb (their ground goes at once) and resets the drag and hover; the fee and the panel's settings stay */
  clear() { this.rows = []; this.curbs = []; this.resetInput(); this.sync(); }

  /** the drag and hover state cleared */
  private resetInput() { this.drag = null; this.hoverRow = 0; this.hoverCurb = null; this.hoverExisting = 0; this.why = ''; this.shown = null; }

  /** the rows, curbs and fee as plain copies (the engine's save format is its own) */
  save(): { rows: BayRowDef[]; curbs: CurbDef[]; fee: number } { return { rows: this.rows.map(r => ({ ...r })), curbs: this.curbs.map(c => ({ ...c })), fee: this.fee }; }

  /** sets the parking fee ($ per car), clamped to 0..50 and rounded to whole dollars; syncs and saves */
  setFee(n: number) { this.fee = Math.max(0, Math.min(FEE_MAX, Math.round(n))); this.sync(); this.host.save(); this.host.emit(); }

  /** the start of a row drag at t: snapped to the nearest end of an existing row's front line within 1.5 tiles, else to the quarter tile */
  private snapStart(t: Pt): Pt {
    let best: Pt | null = null, bd = SNAP_END;
    for (const r of this.rows) for (const e of [{ x: r.ax, y: r.ay }, { x: r.bx, y: r.by }]) {
      const d = Math.hypot(e.x - t.x, e.y - t.y); if (d <= bd) { bd = d; best = e; }
    }
    return best ?? { x: Math.round(t.x * 4) / 4, y: Math.round(t.y * 4) / 4 };
  }

  /** the row from a to b with the panel's settings (id 0) */
  private def(a: Pt, b: Pt): BayRowDef { return { id: 0, ax: a.x, ay: a.y, bx: b.x, by: b.y, side: this.side, bay: this.bay, col: this.col }; }

  /** the ground roads near row d for rowCheck: every seg within half the row's length + 30 tiles of its middle, as its centre line and half width */
  private roads(d: BayRowDef): { a: Pt; b: Pt; hw: number }[] {
    const m = { x: (d.ax + d.bx) / 2, y: (d.ay + d.by) / 2 }, r = vlen(sub({ x: d.bx, y: d.by }, { x: d.ax, y: d.ay })) / 2 + 30;
    const out: { a: Pt; b: Pt; hw: number }[] = [];
    for (const s of this.host.net().segsNear(m, r)) out.push({ a: s.a, b: s.b, hw: s.cls.h + s.cls.walk });
    return out;
  }

  /** reads row d into the preview: its bay count, its cost, and why it cannot go ('' if it can) */
  private aim(d: BayRowDef) {
    this.count = rowBays(d).length; this.cost = this.count * ROW_BAY_COST;
    this.why = rowCheck(d, this.host.terrain(), this.roads(d), this.rows, this.host.mapSize) || (this.cost > this.host.money() ? 'not enough money' : '');
  }

  /** the row whose paving holds tile t, or null */
  private rowAt(t: Pt): BayRowDef | null { for (const r of this.rows) if (inFlat(rowQuad(r), t.x, t.y)) return r; return null; }

  /** a press at tile t in rows mode starts a row drag (its start snapped) */
  down(t: Pt) {
    if (this.mode !== 'rows') return;
    const a = this.snapStart(t), b = { x: t.x, y: t.y };
    this.drag = { a, b }; this.aim(this.def(a, b));
  }

  /** the pointer moves to tile t (css px mx, my): a drag follows it (Shift: the angle snaps to 15 degrees) and is re-checked; otherwise the row under it is hovered */
  move(t: Pt, mx: number, my: number) {
    if (this.mode !== 'rows') return;
    this.mouse = { mx, my };
    const d = this.drag;
    if (!d) { this.hoverRow = this.rowAt(t)?.id ?? 0; return; }
    let b = { x: t.x, y: t.y };
    if (this.snap15) {
      const D = sub(t, d.a), L = vlen(D), th = Math.round(Math.atan2(D.y, D.x) / STEP) * STEP;
      b = { x: d.a.x + Math.cos(th) * L, y: d.a.y + Math.sin(th) * L };
    }
    d.b = b; this.aim(this.def(d.a, b));
  }

  /** the release: a drag under 0.5 tiles is a click (it removes the row under the pointer, no refund); a longer one lays a row, or toasts why it cannot */
  up() {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    if (vlen(sub(d.b, d.a)) < CLICK) {
      const r = this.rowAt(d.b);
      if (r) this.removeRow(r.id);
      this.why = ''; this.host.emit(); return;
    }
    const def = this.def(d.a, d.b);
    this.aim(def);
    if (this.why) { this.host.toast(this.why, 'warn'); this.why = ''; this.host.emit(); return; }
    this.rows.push({ ...def, id: this.nextId(this.rows) });
    this.host.spend(this.cost);
    this.host.toast(`${this.count} bays ($${this.cost})`, 'good');
    this.sync(); this.host.save();
    this.why = ''; this.host.emit();
  }

  /** removes row id (no refund): its ground goes at once */
  private removeRow(id: number) {
    this.rows = this.rows.filter(r => r.id !== id);
    this.host.toast('Row removed');
    this.sync(); this.host.save();
  }

  /** flips the side the next row's bays stand on (Tab); a drag is re-checked */
  flipSide() {
    this.side = this.side === 1 ? -1 : 1;
    if (this.drag) this.aim(this.def(this.drag.a, this.drag.b));
    this.host.emit();
  }

  /** the pointer over road seg (null: off the road) at tile t, optionally with its css px (mx, my): the run it would park, and the existing curb it overlaps (curb mode) */
  hover(seg: Seg | null, t: Pt, mx?: number, my?: number) {
    if (this.mode !== 'curb') return;
    if (mx !== undefined && my !== undefined) this.mouse = { mx, my };
    this.aimCurb(seg ? curbFrom(this.host.net(), seg, t) : null);
  }

  /** reads a run into the preview: the existing curb it overlaps (hoverExisting), or its bays, cost and the reason it cannot go */
  private aimCurb(def: CurbDef | null) {
    this.hoverCurb = def; this.hoverExisting = 0; this.why = ''; this.count = 0; this.cost = 0; this.shown = null;
    if (!def) return;
    const net = this.host.net(), c = resolveCurb(net, def);
    this.shown = c; this.count = c?.bays.length ?? 0; this.cost = this.count * CURB_BAY_COST;
    const ex = this.curbs.find(o => curbCheck(net, def, new Set(), [o]) === 'it already has parking');
    if (ex) { this.hoverExisting = ex.id; this.shown = resolveCurb(net, ex); return; }
    this.why = curbCheck(net, def, this.host.tollKeys(), this.curbs) || (this.cost > this.host.money() ? 'not enough money' : '');
  }

  /** a click in curb mode: removes the existing curb under the pointer, else adds the hovered run (toasting why it cannot go) */
  click() {
    if (this.mode !== 'curb') return;
    if (this.hoverExisting) { this.removeCurb(this.hoverExisting); this.aimCurb(this.hoverCurb); this.host.emit(); return; }
    if (!this.hoverCurb) return;
    if (this.why) { this.host.toast(this.why, 'warn'); return; }
    this.curbs.push({ ...this.hoverCurb, id: this.nextId(this.curbs) });
    this.host.spend(this.cost);
    this.host.toast(`${this.count} on-street bays ($${this.cost})`, 'good');
    this.sync(); this.host.save();
    this.aimCurb(this.hoverCurb); this.host.emit();
  }

  /** removes curb id (no refund): its ground goes at once */
  private removeCurb(id: number) {
    this.curbs = this.curbs.filter(c => c.id !== id);
    this.host.toast('On-street parking removed');
    this.sync(); this.host.save();
  }

  /** a key press: Tab flips the side (rows mode); Escape cancels a row drag. True when the tool used it */
  key(e: KeyboardEvent): boolean {
    if (e.key === 'Tab' && this.mode === 'rows') { e.preventDefault(); this.flipSide(); return true; }
    if (e.key === 'Escape' && this.drag) { this.drag = null; this.why = ''; this.host.emit(); return true; }
    return false;
  }

  /** the rows' lots as car parks for the City and the sim (a lot with no road in reach is left out) */
  lots(): CarPark[] {
    const net = this.host.net(), out: CarPark[] = [];
    for (const rs of rowLots(this.rows)) { const p = lotPark(net, rs); if (p) out.push(p); }
    return out;
  }

  /** the curbs as car parks for the City and the sim: id −curb id, one entrance at the run's middle, the bays of the kerb */
  curbParks(): CarPark[] {
    const net = this.host.net(), out: CarPark[] = [];
    for (const d of this.curbs) {
      const c = resolveCurb(net, d); if (!c) continue;
      out.push({ id: -c.id, x: c.entrance.x, y: c.entrance.y, w: 0, h: 0, side: 0, seg: c.seg, entrances: [c.entrance], bays: c.bays, pv: c.pv, curb: true });
    }
    return out;
  }

  /** the overlay preview: the row being dragged (its paving, bay lines and front, or why it cannot go), the row under the pointer, or the run under the pointer
   *  (amber, red when it cannot go; the existing curb it overlaps, red) */
  drawPreview(v: PaintView) {
    const m = this.mouse;
    if (this.mode === 'rows') {
      const dr = this.drag;
      if (dr && vlen(sub(dr.b, dr.a)) >= CLICK) {
        const def = this.def(dr.a, dr.b), G = rowGeom(def), bad = this.why !== '';
        poly(v, rowQuad(def), bad ? 'rgba(160,40,40,0.5)' : 'rgba(50,60,80,0.45)', null, 0);
        segs(v, rowLines(def), bad ? '#f87171' : def.col === 'yellow' ? '#facc15' : '#f8fafc', 1.5);
        const ctx = v.ctx, e = { x: dr.a.x + G.u.x * G.count * G.pitch, y: dr.a.y + G.u.y * G.count * G.pitch };
        v.setIso(ctx); ctx.beginPath(); ctx.moveTo(dr.a.x, dr.a.y); ctx.lineTo(e.x, e.y);
        ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 2 * v.dpr; ctx.setLineDash([6 * v.dpr, 4 * v.dpr]); ctx.stroke(); ctx.setLineDash([]);
        if (m) v.hint(m.mx, m.my, bad ? this.why : `${this.count} bays · $${this.cost}`, bad);
        return;
      }
      const r = this.rows.find(q => q.id === this.hoverRow);
      if (r) { poly(v, rowQuad(r), null, '#f87171', 2); if (m) v.hint(m.mx, m.my, 'click removes', true); }
      return;
    }
    if (this.mode === 'curb' && this.hoverCurb) {
      const bad = this.why !== '';
      if (this.hoverExisting) {
        if (this.shown) poly(v, curbQuad(this.shown), null, '#f87171', 2);
        if (m) v.hint(m.mx, m.my, 'click removes the parking', true);
        return;
      }
      if (this.shown) {
        poly(v, curbQuad(this.shown), bad ? 'rgba(160,40,40,0.35)' : 'rgba(255,216,102,0.35)', null, 0);
        segs(v, curbLines(this.shown), '#f8fafc', 1.5);
      }
      if (m) v.hint(m.mx, m.my, bad ? this.why : `${this.count} on-street bays · $${this.cost}`, bad);
    }
  }
}
