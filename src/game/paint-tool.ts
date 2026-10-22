// The Paint tool's state and input (docs/PAINT-TOOL.md "The tool (UI)"): drawing outlines by clicks or a lasso, picking, erasing, the shape handles of the selected area, and the preview. No React; the engine and PaintPanel call it.
import type { LotPatch } from './ground-protocol';
import { BORDER_TEXES, BORDER_W, BRUSH_LAYER, BRUSH_PRESETS, DEFAULT_STYLE, MAX_PTS, MAX_SIDE, PAINT_TEXES, areaAt, boxOf, checkArea, clampStyle, crossings, fromTuples, insertCorner, insidePoly, moveCorner, polyBox, removeCorner, roundCorners, rotatePts, scalePts, simplify, snapPt, toTuple, translatePts, type BrushKind, type PaintArea, type PaintBox, type PaintTuple } from './paint';
import { dab, fillPoly, stroke as brushStroke, trace as traceMask, type Mask } from './brush';
import { MAP } from './iso';
import { holePreset, placeHole, type HolePreset, type PresetProp } from './golf/holepreset';
import { PLANT_KINDS, clampPlant, type PlantKind, type PlantSet } from './plant';
/** the localStorage key of the edited plant brushes */
const PLANT_KEY = 'capitalempire.plantBrushes';
/** the plant brushes: the defaults, each replaced by its saved edit (clamped) */
function loadPlant(): Record<PlantKind, PlantSet> {
  let saved: Partial<Record<PlantKind, Partial<PlantSet>>> | null = null;
  try { saved = JSON.parse(localStorage.getItem(PLANT_KEY) ?? 'null'); } catch { /* no storage or a bad save */ }
  const out = {} as Record<PlantKind, PlantSet>;
  for (const k of PLANT_KINDS) out[k.kind] = clampPlant(saved && typeof saved === 'object' ? saved[k.kind] : undefined, k.kind);
  return out;
}

export type PaintMode = 'draw' | 'pick' | 'erase' | 'hole' | 'brush' | 'plant';
/** a brush preset's editable settings: the brush radius (tiles) and the area style it paints */
type BrushSet = { r: number; style: Omit<PaintArea, 'id' | 'pts' | 'hole' | 'kind'> };
/** the localStorage key of the edited brush presets */
const BRUSH_KEY = 'capitalempire.brushPresets';
/** the brush radius range in tiles */
const BR_MIN = 0.5, BR_MAX = 20;
/** the brush presets: BRUSH_PRESETS, each replaced by its saved edit (a missing or bad save keeps the defaults; no storage keeps them too) */
function loadBrush(): Record<BrushKind, BrushSet> {
  const out = {} as Record<BrushKind, BrushSet>;
  for (const p of BRUSH_PRESETS) out[p.kind] = { r: p.r, style: { ...p.style } };
  try {
    const saved = JSON.parse(localStorage.getItem(BRUSH_KEY) ?? 'null') as Partial<Record<BrushKind, { r?: number; style?: Partial<BrushSet['style']> }>> | null;
    if (saved && typeof saved === 'object') for (const p of BRUSH_PRESETS) {
      const s = saved[p.kind]; if (!s || typeof s !== 'object') continue;
      out[p.kind] = { r: Number.isFinite(s.r) ? Math.min(BR_MAX, Math.max(BR_MIN, s.r!)) : p.r, style: clampStyle({ ...p.style, ...s.style }) };
    }
  } catch { /* no storage or a bad save: the defaults */ }
  return out;
}
/** what the tool needs from the engine: the lot ground, redraws, saves, toasts, the css px projection of tiles (affine A: tile (x, y) is at (A[0] + x*A[2] + y*A[4], A[1] + x*A[3] + y*A[5])), and the props of a placed golf hole (returns how many were placed) */
export interface PaintHost { setLotGround(key: string, patches: LotPatch[] | null): void; emit(): void; save(): void; toast(text: string, kind?: 'info' | 'warn'): void; affine(out: number[]): void; placeProps(ps: PresetProp[], seed: number): number;
  /** a plant brush dab: props from ids scattered in the circle (spaced, sized size[0]..size[1]); returns how many were placed */
  plant(ids: string[], x: number, y: number, r: number, spacing: number, size: [number, number], seed: number): number;
  /** removes the plant-brush props in the circle; returns how many */
  unplant(x: number, y: number, r: number): number;
  /** the sprites a plant brush can use */
  plantPool(kind: PlantKind): { id: string; name: string }[] }
/** the ghost's fill by texture (the hole preview): the green, fairway, water and sand; other areas are only outlined */
const GHOST_FILL: Record<string, string> = { golfGreen: 'rgba(120,200,120,0.35)', golfFairway: 'rgba(150,210,120,0.25)', waterDark: 'rgba(70,120,200,0.35)', bunkerSand: 'rgba(230,210,150,0.4)' };
/** what the preview needs to draw (the engine's overlay helpers) */
export interface PaintView { ctx: CanvasRenderingContext2D; setIso(ctx: CanvasRenderingContext2D): void; screen(x: number, y: number): { x: number; y: number }; dpr: number; hint(mx: number, my: number, text: string, bad: boolean): void }
/** a handle of the selected area: a corner (i), the "+" of edge i (edge i runs from corner i to i+1), a box corner (i: 0 low x low y, 1 high x low y, 2 high x high y, 3 low x high y: a scale), the rotate handle, or the inside (move) */
export interface Grab { k: 'corner' | 'edge' | 'scale' | 'rotate' | 'move'; i: number }
/** a handle drag: the shape before it (start), the shape it starts from (base: start, or with the new corner of an edge drag), the candidate at the pointer (cand; bad: why it cannot be applied, '') */
interface Drag { g: Grab; a: PaintArea; start: number[]; base: number[]; cand: number[]; bad: string; last: number; px: number; py: number; cx: number; cy: number; a0: number; ax: number; ay: number; bx: number; by: number }

/** a handle's hit radius and the rotate handle's offset, in css px */
const HIT = 9, ROT_UP = 26, SCALE_OUT = 10;
/** the least time between two bakes of an area during a drag, ms */
const SEND_MS = 120;

const TEX_COL = new Map(PAINT_TEXES.map(t => [t.id as string, t.col] as [string, string]));
const BTEX_COL = new Map(BORDER_TEXES.map(t => [t.id as string, t.col] as [string, string]));

/** a '#rrggbb' colour with an alpha, as an rgba() string */
function rgba(hex: string, a: number): string { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }

/** adds a polygon's corners to the current path (the caller begins the path and sets the transform) */
function trace(ctx: CanvasRenderingContext2D, pts: number[], closed: boolean) {
  const n = pts.length >> 1; if (n < 1) return;
  ctx.moveTo(pts[0]!, pts[1]!); for (let i = 1; i < n; i++) ctx.lineTo(pts[2 * i]!, pts[2 * i + 1]!);
  if (closed) ctx.closePath();
}

/** writes the css px of tile (x, y) under the affine A into slot s of out */
function put(out: number[], s: number, A: number[], x: number, y: number) { out[2 * s] = A[0]! + x * A[2]! + y * A[4]!; out[2 * s + 1] = A[1]! + x * A[3]! + y * A[5]!; }

/** the Paint tool: the painted areas, the panel's style, the outline being drawn (clicks or a lasso), and the handles of the selected area */
export class PaintTool {
  areas: PaintArea[] = [];
  nextId = 1;
  mode: PaintMode = 'draw';
  /** the panel's settings: for the next area, or mirroring the selected area */
  style: Omit<PaintArea, 'id' | 'pts'> = { ...DEFAULT_STYLE };
  /** corners snap to whole tiles (else to quarter tiles) */
  snap = true;
  /** the corners placed so far, x0 y0 x1 y1 ... (tiles) */
  pts: number[] = [];
  /** the tile under the pointer (raw), or null */
  cursor: { x: number; y: number } | null = null;
  /** the pointer in css px, or null */
  mouse: { mx: number; my: number } | null = null;
  /** the selected area's id (0: none); a closed shape is selected at once, Pick selects on press */
  selected = 0;
  /** the area under the pointer in pick or erase (0: none) */
  hover = 0;
  /** the handle under the pointer, or null */
  hoverH: Grab | null = null;
  private down: { mx: number; my: number } | null = null;
  /** true while a freehand outline is being drawn */
  lasso = false;
  /** the handle drag in progress, or null */
  private drag: Drag | null = null;
  /** the reused buffers of outline() and the handle layout (css px, slots as layout()) and the affine */
  private ol: number[] = [];
  private lay: number[] = [];
  private A: number[] = [0, 0, 0, 0, 0, 0];
  /** each area's rounded outline, kept until its radius or corners change (the overlay draws the picked and hovered areas every frame) */
  private rounded = new WeakMap<PaintArea, { r: number; src: number[]; out: number[] }>();
  /** hole mode: the quarter turns of the next hole (r turns it), and its seed (each placed hole takes the next one) */
  holeDir: 0 | 1 | 2 | 3 = 0;
  holeSeed = 1;
  /** the preset for holeSeed (recomputed only when the seed changes) */
  private holeC: { seed: number; p: HolePreset } | null = null;
  /** the ghost of the hole at the cursor: placed areas, their rounded outlines; kept until the cell, turn or seed changes */
  private ghost: { x: number; y: number; dir: number; seed: number; p: HolePreset; outs: number[][] } | null = null;
  /** brush mode: the kind painted, the hole it is painted for, Rub out (strokes erase), and each kind's brush (radius, style: the presets, edited and remembered) */
  brushKind: BrushKind = 'fairway';
  brushHole = 1;
  rubOut = false;
  brush: Record<BrushKind, BrushSet> = loadBrush();
  /** plant mode: the kind planted and each kind's brush (remembered); the drag in progress (erasing or not, the last dab) */
  plantKind: PlantKind = 'trees';
  plant: Record<PlantKind, PlantSet> = loadPlant();
  private planting: { erase: boolean; last: { x: number; y: number }; n: number } | null = null;
  private plantSeed = (Date.now() % 100000) | 0;
  /** brush mode: the stroke in progress, or null: its mask of this hole's cells of the kind, the radius, whether it erases, the last tile, and the dabs (x y pairs) for the preview */
  private stroke: { m: Mask; r: number; erase: boolean; last: { x: number; y: number }; dabs: number[] } | null = null;
  private host: PaintHost;

  constructor(host: PaintHost) { this.host = host; }

  /** the ground patch of a painted area (outline, texture, scale, angle, border width, border texture, draw order; the tone only when it is on); a brush area draws above the layers below it */
  static patch(a: PaintArea): LotPatch { return { pts: roundCorners(a.pts, a.radius), tex: a.tex, paint: { s: a.scale, a: a.angle, b: BORDER_W[a.border]!, bt: a.btex, z: (a.kind ? BRUSH_LAYER[a.kind] * 1e6 : 0) + a.id, ...(a.tone ? { t: a.tone, ta: a.toneAmt, tc: a.tint } : {}), ...(a.bscale !== DEFAULT_STYLE.bscale || a.bangle !== DEFAULT_STYLE.bangle ? { bs: a.bscale, ba: a.bangle } : {}), ...(a.btone ? { bto: a.btone, bta: a.btoneAmt, btc: a.btint } : {}) } }; }

  /** an area's outline with its corners rounded, cached per area until the radius or the corners change */
  private outlineOf(a: PaintArea): number[] {
    let c = this.rounded.get(a);
    if (!c || c.r !== a.radius || c.src !== a.pts) { c = { r: a.radius, src: a.pts, out: roundCorners(a.pts, a.radius) }; this.rounded.set(a, c); }
    return c.out;
  }

  /** sends an area's patch to the lot ground (key paint:<id>) */
  private send(a: PaintArea) { this.host.setLotGround('paint:' + a.id, [PaintTool.patch(a)]); }

  /** replaces the areas with the save tuples (none: clears) and sends their patches */
  load(ts?: PaintTuple[]) { this.clear(); this.areas = fromTuples(ts ?? []); this.nextId = this.areas.length + 1; for (const a of this.areas) this.send(a); }

  /** removes every area from the ground and resets the drawing and selection (the style and mode stay) */
  clear() {
    for (const a of this.areas) this.host.setLotGround('paint:' + a.id, null);
    this.areas = []; this.pts = []; this.selected = 0; this.hover = 0; this.hoverH = null; this.drag = null; this.nextId = 1; this.lasso = false; this.down = null; this.stroke = null;
  }

  /** the areas as save tuples */
  save(): PaintTuple[] { return this.areas.map(a => toTuple(a)); }

  /** switches between Draw, Pick and Erase, dropping the outline and the selection */
  setMode(m: PaintMode) { this.mode = m; this.cancel(); this.selected = 0; this.hover = 0; this.hoverH = null; this.host.emit(); }

  /** changes the panel's style; a selected area takes the change at once (its ground re-bakes) */
  setStyle(p: Partial<Omit<PaintArea, 'id' | 'pts'>>) {
    this.style = clampStyle({ ...this.style, ...p });
    if (this.selected) {
      const a = this.areas.find(q => q.id === this.selected);
      if (a) { Object.assign(a, this.style); this.send(a); this.host.save(); }
    }
    if (this.mode === 'brush') {
      // the brush preset takes the change, and the areas of this hole and kind re-style at once
      const k = this.brushKind;
      this.brush[k] = { r: this.brush[k].r, style: { ...this.style } }; this.saveBrush();
      let changed = false;
      for (const a of this.areas) if (a.hole === this.brushHole && a.kind === k) { Object.assign(a, this.brush[k].style); this.send(a); changed = true; }
      if (changed) this.host.save();
    }
    this.host.emit();
  }

  /** brush mode: sets a kind's radius (tiles, 0.5 to 20) and remembers it */
  setBrushR(r: number) { const k = this.brushKind; this.brush[k] = { r: Math.min(BR_MAX, Math.max(BR_MIN, Number.isFinite(r) ? r : this.brush[k].r)), style: this.brush[k].style }; this.saveBrush(); this.host.emit(); }

  /** writes the brush presets to localStorage (a storage that is missing or full is skipped) */
  private saveBrush() { try { localStorage.setItem(BRUSH_KEY, JSON.stringify(this.brush)); } catch { /* storage may be unavailable */ } }

  /** the golf brush: paints the kind (its preset's style, the panel shows it) for the brush hole; the outline and the selection are dropped */
  setBrush(kind: BrushKind) { this.mode = 'brush'; this.brushKind = kind; this.style = { ...this.brush[kind].style }; this.cancel(); this.selected = 0; this.hover = 0; this.hoverH = null; this.host.emit(); }

  /** the plant brush: Trees, Bushes or Flowers scattered by dragging (Rub out / Alt removes them) */
  setPlant(kind: PlantKind) { this.mode = 'plant'; this.plantKind = kind; this.cancel(); this.selected = 0; this.hover = 0; this.hoverH = null; this.host.emit(); }
  /** edits the current plant brush (radius, spacing, size range, sprites) and remembers it */
  setPlantSet(p: Partial<PlantSet>) {
    const k = this.plantKind; this.plant[k] = clampPlant({ ...this.plant[k], ...p }, k);
    try { localStorage.setItem(PLANT_KEY, JSON.stringify(this.plant)); } catch { /* storage may be unavailable */ }
    this.host.emit();
  }
  /** the sprites the current plant brush picks from (its ids, or every sprite of the kind) */
  plantIds(): string[] { const s = this.plant[this.plantKind], all = this.host.plantPool(this.plantKind).map(x => x.id); return s.ids ? s.ids.filter(id => all.includes(id)) : all; }
  /** one plant dab at t: plant (or rub out) in the circle */
  private plantDab(t: { x: number; y: number }, erase: boolean) {
    const s = this.plant[this.plantKind];
    const n = erase ? this.host.unplant(t.x, t.y, s.r) : this.host.plant(this.plantIds(), t.x, t.y, s.r, s.spacing, [s.lo, s.hi], this.plantSeed++);
    if (this.planting) this.planting.n += n;
  }
  /** drops the outline being drawn (its corners, the lasso and the press) and a stroke in progress (not applied); a handle drag in progress ends (its shape is kept, or reverted when it cannot be placed) */
  cancel() { if (this.drag) this.dragEnd(); this.pts = []; this.lasso = false; this.down = null; this.stroke = null; }

  /** the cursor over the overlay: a grab while dragging, a handle's own cursor over it, else the crosshair */
  get cursorStyle(): string {
    if (this.drag) return 'grabbing';
    const g = this.hoverH;
    if (!g || !this.selected) return 'crosshair';
    switch (g.k) {
      case 'corner': case 'edge': return 'pointer';
      case 'scale': return g.i % 2 ? 'nesw-resize' : 'nwse-resize';
      case 'rotate': return 'grab';
      default: return 'move';
    }
  }

  /** the selected area (undefined: none) */
  private selectedArea(): PaintArea | undefined { return this.selected ? this.areas.find(q => q.id === this.selected) : undefined; }

  /** a press on tile t (css px mx, my): a handle of the selected area starts a drag; else draw waits for the release (a click or a lasso) and deselects; pick selects the area under it; erase removes it */
  pointerDown(t: { x: number; y: number }, mx: number, my: number, alt = false) {
    const sel = this.selectedArea();
    if (sel) { const g = this.grabAt(sel, t, mx, my); if (g) { this.startDrag(sel, g, t); this.host.emit(); return; } }
    if (this.mode === 'hole') { this.placeHoleAt(t); return; }
    if (this.mode === 'brush') { this.strokeStart(t, alt); return; }
    if (this.mode === 'plant') { const erase = this.rubOut || alt; this.planting = { erase, last: { x: t.x, y: t.y }, n: 0 }; this.plantDab(t, erase); this.host.emit(); return; }
    if (this.mode === 'draw') {
      if (this.selected) { this.selected = 0; this.hoverH = null; this.host.emit(); }
      this.down = { mx, my }; this.cursor = t; return;
    }
    if (this.mode === 'pick') {
      const a = areaAt(this.areas, t.x, t.y);
      this.selected = a?.id ?? 0; this.hoverH = null;
      if (a) this.take(a);
      this.host.emit(); return;
    }
    const a = areaAt(this.areas, t.x, t.y);
    if (a) this.remove(a.id);
  }

  /** a right press (draw, pick) on a corner of the selected area removes that corner and returns true; otherwise false (the press pans) */
  secondary(t: { x: number; y: number }, mx: number, my: number): boolean {
    const sel = this.selectedArea();
    const g = sel ? this.grabAt(sel, t, mx, my) : null;
    if (!sel || g?.k !== 'corner') return false;
    this.cutCorner(sel, g.i); return true;
  }

  /** a move over tile t (null off the map), with shift (rotate in 15° steps, scale uniform): a drag follows the pointer; else the handle under it is highlighted, and the lasso is drawn or the area under the pointer hovered */
  pointerMove(t: { x: number; y: number } | null, mx: number, my: number, shift = false) {
    this.cursor = t; this.mouse = { mx, my };
    if (this.drag) { this.dragTo(t, shift); return; }
    if (this.mode === 'brush') { const s = this.stroke; if (s && t) { brushStroke(s.m, s.last.x, s.last.y, t.x, t.y, s.r, s.erase); s.last.x = t.x; s.last.y = t.y; s.dabs.push(t.x, t.y); } return; }
    if (this.mode === 'plant') {
      // a dab every half radius along the drag (each dab only adds where the spacing allows, so going over a spot again fills it in)
      const pl = this.planting; if (!pl || !t) return;
      const step = Math.max(0.5, this.plant[this.plantKind].r / 2), d = Math.hypot(t.x - pl.last.x, t.y - pl.last.y);
      if (d < step) return;
      const k = Math.floor(d / step);
      for (let i = 1; i <= k; i++) this.plantDab({ x: pl.last.x + (t.x - pl.last.x) * i * step / d, y: pl.last.y + (t.y - pl.last.y) * i * step / d }, pl.erase);
      pl.last = { x: pl.last.x + (t.x - pl.last.x) * k * step / d, y: pl.last.y + (t.y - pl.last.y) * k * step / d };
      return;
    }
    const sel = this.selectedArea();
    this.setHover(sel && t ? this.grabAt(sel, t, mx, my) : null);
    if (this.mode !== 'draw') { this.hover = t ? (areaAt(this.areas, t.x, t.y)?.id ?? 0) : 0; return; }
    const d = this.down;
    if (d && !this.lasso && this.pts.length === 0 && Math.abs(mx - d.mx) + Math.abs(my - d.my) > 6) { this.lasso = true; this.pts = []; }
    if (this.lasso && t) {
      const x = Math.round(t.x * 4) / 4, y = Math.round(t.y * 4) / 4, n = this.pts.length;
      if (n === 0 || Math.hypot(x - this.pts[n - 2]!, y - this.pts[n - 1]!) >= 0.3) this.pts.push(x, y);
    }
  }

  /** the release: a handle drag ends; in draw, a lasso is simplified and closed, and a press without a drag is a click that adds a corner (tol: the close distance in tiles) */
  pointerUp(tol: number) {
    if (this.drag) { this.dragEnd(); return; }
    if (this.mode === 'brush') { this.strokeEnd(); return; }
    if (this.mode === 'plant') { const pl = this.planting; this.planting = null; if (pl && !pl.n && !pl.erase && !this.plantIds().length) this.host.toast('Pick at least one sprite for this brush', 'warn'); this.host.emit(); return; }
    if (this.mode !== 'draw') return;
    if (this.lasso) {
      let p = simplify(this.pts); const n = p.length;
      if (n >= 4 && p[0] === p[n - 2] && p[1] === p[n - 1]) p = p.slice(0, n - 2);
      this.pts = p; this.lasso = false; this.down = null; this.finish(true); return;
    }
    if (this.down) { this.down = null; if (this.cursor) this.addCorner(this.cursor, tol); }
  }

  /** adds a corner at tile t, snapped; with 3 or more placed, a point within tol (at least 0.5 tile) of the first corner closes the outline */
  private addCorner(t: { x: number; y: number }, tol: number) {
    const p = snapPt(t.x, t.y, this.snap), n = this.pts.length;
    if (n >= 6 && Math.hypot(p.x - this.pts[0]!, p.y - this.pts[1]!) <= Math.max(tol, 0.5)) { this.finish(false); return; }
    if (n && p.x === this.pts[n - 2] && p.y === this.pts[n - 1]) return;
    this.pts.push(p.x, p.y); this.host.emit();
  }

  /** closes the outline: a valid one becomes an area with the panel's style, and is selected (its handles show, its style is the panel's); an invalid one toasts why (a lasso is dropped, a click keeps its corners for Backspace) */
  private finish(fromLasso: boolean) {
    if (this.pts.length < 6) { if (fromLasso) this.cancel(); return; }
    const why = checkArea(this.pts);
    if (why) { this.host.toast(why, 'warn'); if (fromLasso) this.cancel(); this.host.emit(); return; }
    const a: PaintArea = { id: this.nextId++, pts: this.pts.slice(), ...this.style };
    this.areas.push(a); this.send(a); this.cancel();
    this.selected = a.id; this.hoverH = null; this.take(a);
    this.host.save(); this.host.emit();
  }

  /** removes an area and its ground (it re-bakes at once) */
  remove(id: number) {
    const i = this.areas.findIndex(a => a.id === id); if (i < 0) return;
    this.areas.splice(i, 1); this.host.setLotGround('paint:' + id, null);
    if (this.selected === id) { this.selected = 0; this.hoverH = null; }
    if (this.drag?.a.id === id) this.drag = null;
    if (this.hover === id) this.hover = 0;
    this.host.save(); this.host.emit();
  }

  /** the preset for the current seed, in the local frame (cached until the seed changes) */
  private hole(): HolePreset { if (this.holeC?.seed !== this.holeSeed) this.holeC = { seed: this.holeSeed, p: holePreset(this.holeSeed) }; return this.holeC.p; }

  /** lays the hole with its tee at tile t (rounded), turned by holeDir: its areas are added and sent in order, its props go to the host; a hole with a corner off 1..MAP-1 is refused */
  private placeHoleAt(t: { x: number; y: number }) {
    const p = placeHole(this.hole(), Math.round(t.x), Math.round(t.y), this.holeDir);
    for (const a of p.areas) for (const v of a.pts) if (!(v >= 1 && v <= MAP - 1)) { this.host.toast('The hole does not fit here', 'warn'); return; }
    for (const a of p.areas) { const b: PaintArea = { id: this.nextId++, ...a }; this.areas.push(b); this.send(b); }
    this.host.save();
    const n = this.host.placeProps(p.props, this.holeSeed);
    this.host.toast(`Golf hole placed: ${p.areas.length} painted areas, ${n} props`);
    this.holeSeed++; this.selected = 0; this.hoverH = null; this.host.emit();
  }

  /** brush mode: a press starts a stroke (Alt or Rub out erases): the mask holds this hole's cells of the kind (their outlines filled), and one dab lays at the press */
  private strokeStart(t: { x: number; y: number }, alt: boolean) {
    const k = this.brushKind, h = this.brushHole, r = this.brush[k].r, m: Mask = new Set(), erase = this.rubOut || alt;
    for (const a of this.areas) if (a.hole === h && a.kind === k) fillPoly(m, this.outlineOf(a));
    dab(m, t.x, t.y, r, erase);
    this.stroke = { m, r, erase, last: { x: t.x, y: t.y }, dabs: [t.x, t.y] };
    this.host.emit();
  }

  /** brush mode: a release ends the stroke: this hole's areas of the kind are replaced by one area per outline of the mask (in the preset's style; a stroke that erased everything leaves none); an outline wider than MAX_SIDE is skipped, with one toast */
  private strokeEnd() {
    const s = this.stroke; if (!s) return;
    this.stroke = null;
    const k = this.brushKind, h = this.brushHole, style = this.brush[k].style;
    for (let i = this.areas.length - 1; i >= 0; i--) { const a = this.areas[i]!; if (a.hole === h && a.kind === k) { this.areas.splice(i, 1); this.host.setLotGround('paint:' + a.id, null); } }
    let big = false;
    for (const o of traceMask(s.m)) {
      const b = polyBox(o);
      if (b[2] - b[0] > MAX_SIDE || b[3] - b[1] > MAX_SIDE) { big = true; continue; }
      const a: PaintArea = { id: this.nextId++, pts: o, ...style, hole: h, kind: k };
      this.areas.push(a); this.send(a);
    }
    if (big) this.host.toast('Part of the stroke is too big for one area: paint it in two parts', 'warn');
    this.host.save(); this.host.emit();
  }

  /** brush mode: the brush's circle under the cursor (white, red when rubbing out), and during a stroke every dab's circle filled translucent in the kind's colour (red when erasing) */
  private drawBrush(v: PaintView) {
    const ctx = v.ctx, d = v.dpr, c = this.cursor, s = this.stroke, r = this.brush[this.brushKind].r, erase = s ? s.erase : this.rubOut;
    if (s && s.dabs.length) {
      v.setIso(ctx); ctx.beginPath();
      for (let i = 0; i < s.dabs.length; i += 2) { const x = s.dabs[i]!, y = s.dabs[i + 1]!; ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, Math.PI * 2); }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = erase ? 'rgba(240,80,60,0.35)' : rgba(TEX_COL.get(this.brush[this.brushKind].style.tex) ?? '#888888', 0.35); ctx.fill();
    }
    if (!c) return;
    v.setIso(ctx); ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, Math.PI * 2); ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.strokeStyle = erase ? '#f87171' : '#ffffff'; ctx.lineWidth = 1.5 * d; ctx.stroke();
  }

  /** plant mode: the brush circle under the cursor in the kind's colour (red when rubbing out), its spacing shown as a dot ring */
  private drawPlant(v: PaintView) {
    const c = this.cursor; if (!c) return;
    const ctx = v.ctx, d = v.dpr, s = this.plant[this.plantKind], erase = this.planting ? this.planting.erase : this.rubOut;
    const col = erase ? '#f87171' : PLANT_KINDS.find(k => k.kind === this.plantKind)!.col;
    v.setIso(ctx); ctx.beginPath(); ctx.arc(c.x, c.y, s.r, 0, Math.PI * 2); ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = rgba(col, 0.18); ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 1.5 * d; ctx.stroke();
    if (!erase) { v.setIso(ctx); ctx.beginPath(); ctx.arc(c.x, c.y, Math.min(s.r, s.spacing / 2), 0, Math.PI * 2); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.setLineDash([3 * d, 3 * d]); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = d; ctx.stroke(); ctx.setLineDash([]); }
  }

  /** the ghost of the hole at the cursor (hole mode): every area's outline dashed white, the green, fairway, water and sand filled, and a dot at the flag; no props */
  private drawHolePreview(v: PaintView) {
    const c = this.cursor; if (!c) return;
    const ctx = v.ctx, d = v.dpr, x = Math.round(c.x), y = Math.round(c.y);
    let g = this.ghost;
    if (!g || g.x !== x || g.y !== y || g.dir !== this.holeDir || g.seed !== this.holeSeed) {
      const p = placeHole(this.hole(), x, y, this.holeDir);
      this.ghost = g = { x, y, dir: this.holeDir, seed: this.holeSeed, p, outs: p.areas.map(a => roundCorners(a.pts, a.radius)) };
    }
    for (let i = 0; i < g.outs.length; i++) {
      const P = g.outs[i]!, f = GHOST_FILL[g.p.areas[i]!.tex];
      v.setIso(ctx); ctx.beginPath(); trace(ctx, P, true); ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (f) { ctx.fillStyle = f; ctx.fill(); }
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.5 * d; ctx.setLineDash([6 * d, 4 * d]); ctx.stroke(); ctx.setLineDash([]);
    }
    for (const q of g.p.props) {
      if (q.kind !== 'flag') continue;
      const s = v.screen(q.x, q.y);
      ctx.beginPath(); ctx.arc(s.x, s.y, 3 * d, 0, Math.PI * 2); ctx.fillStyle = '#ffd866'; ctx.fill();
    }
  }

  /** a double click closes the outline being drawn (draw, 3 or more corners) */
  doubleClick() { if (this.mode === 'draw' && this.pts.length >= 6) this.finish(false); }

  /** a key press: true when the tool used it (Enter closes, Backspace undoes a corner, Esc cancels or deselects (hole mode: back to Draw), R turns the hole (hole mode), [ and ] size the brush (brush mode), Delete removes the hovered corner of the selected area, else the selected area) */
  key(e: KeyboardEvent): boolean {
    switch (e.key) {
      case 'Enter': if (!this.pts.length) return false; this.finish(false); break;
      case 'Backspace': if (this.mode !== 'draw' || !this.pts.length) return false; this.pts.length -= 2; break;
      case 'Escape': if (this.mode === 'hole' || this.mode === 'brush' || this.mode === 'plant') { this.setMode('draw'); return true; } if (this.pts.length) this.cancel(); else if (this.selected) { this.selected = 0; this.hoverH = null; } else return false; break;
      case 'r': case 'R': if (this.mode !== 'hole') return false; this.holeDir = ((this.holeDir + 1) % 4) as 0 | 1 | 2 | 3; break;
      case '[': case ']':
        if (this.mode === 'plant') { this.setPlantSet({ r: this.plant[this.plantKind].r + (e.key === ']' ? 1 : -1) }); return true; }
        if (this.mode !== 'brush') return false; this.setBrushR(this.brush[this.brushKind].r + (e.key === ']' ? 1 : -1)); break;
      case 'Delete': {
        if (!this.selected) return false;
        const a = this.selectedArea(), g = this.hoverH;
        if (a && g?.k === 'corner') this.cutCorner(a, g.i); else this.remove(this.selected);
        return true;
      }
      default: return false;
    }
    this.host.emit(); return true;
  }

  /** the outline as drawn: the corners, plus the snapped cursor while clicking (not lassoing); a reused buffer, valid until the next call */
  outline(): number[] {
    const c = this.cursor;
    if (this.mode !== 'draw' || this.lasso || !this.pts.length || !c) return this.pts;
    const p = snapPt(c.x, c.y, this.snap), ol = this.ol;
    ol.length = 0; for (const v of this.pts) ol.push(v); ol.push(p.x, p.y);
    return ol;
  }

  /** the overlay preview: the outline being drawn (draw); the selected area, shaded, with its handles (draw and pick); a drag's candidate that cannot be applied, in red; the hovered area (pick and erase) */
  drawPreview(v: PaintView) {
    if (this.mode === 'draw') this.drawOutline(v);
    if (this.mode === 'hole') { this.drawHolePreview(v); return; }
    if (this.mode === 'brush') { this.drawBrush(v); return; }
    if (this.mode === 'plant') { this.drawPlant(v); return; }
    const a = this.selectedArea();
    if (a) { this.shade(v, a, '', '#fbbf24', 2); this.drawHandles(v, this.drag ? this.drag.cand : a.pts); }
    if (this.drag?.bad) this.drawBad(v, this.drag.cand, this.drag.bad);
    if (this.mode === 'draw') return;
    const h = this.areas.find(q => q.id === this.hover);
    if (h) {
      if (this.mode === 'erase') this.shade(v, h, 'rgba(240,80,60,0.3)', '#f87171', 2);
      else this.shade(v, h, null, 'rgba(255,255,255,0.8)', 1.5);
    }
  }

  /** the outline being drawn: its fill, border band, dashed edge, crossing edges, corners, and why it cannot be placed; or the snapped cursor before the first corner */
  private drawOutline(v: PaintView) {
    const ctx = v.ctx, d = v.dpr;
    const P = this.outline();
    if (P.length >= 4) {
      const why = P.length >= 6 ? checkArea(P) : '', bad = why !== '';
      v.setIso(ctx); ctx.beginPath(); trace(ctx, P, true); ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = bad ? 'rgba(160,40,40,0.5)' : rgba(TEX_COL.get(this.style.tex) ?? '#888888', 0.5); ctx.fill();
      if (this.style.border > 0 && P.length >= 6) {
        // the border band: twice the width, stroked in tile units on the clipped edge
        v.setIso(ctx); ctx.beginPath(); trace(ctx, P, true);
        ctx.save(); ctx.clip(); ctx.lineWidth = 2 * BORDER_W[this.style.border]!; ctx.strokeStyle = rgba(BTEX_COL.get(this.style.btex) ?? '#888888', 0.75); ctx.stroke(); ctx.restore();
      }
      v.setIso(ctx); ctx.beginPath(); trace(ctx, P, true); ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.strokeStyle = bad ? '#f87171' : 'rgba(255,230,150,0.9)'; ctx.lineWidth = 1.5 * d; ctx.setLineDash([6 * d, 4 * d]); ctx.stroke(); ctx.setLineDash([]);
      if (P.length >= 6) {
        const hit = crossings(P), n = P.length >> 1;
        if (hit.length) {
          v.setIso(ctx); ctx.beginPath();
          for (const i of hit) { const j = (i + 1) % n; ctx.moveTo(P[2 * i]!, P[2 * i + 1]!); ctx.lineTo(P[2 * j]!, P[2 * j + 1]!); }
          ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.strokeStyle = '#f87171'; ctx.lineWidth = 3 * d; ctx.stroke();
        }
      }
      if (!this.lasso) {
        for (let i = 0; i < this.pts.length >> 1; i++) {
          const s = v.screen(this.pts[2 * i]!, this.pts[2 * i + 1]!);
          ctx.beginPath(); ctx.arc(s.x, s.y, 4 * d, 0, Math.PI * 2); ctx.fillStyle = '#ffd866'; ctx.fill(); ctx.strokeStyle = '#4a3200'; ctx.lineWidth = 1.5 * d; ctx.stroke();
        }
        if (this.pts.length >= 6) {
          const s = v.screen(this.pts[0]!, this.pts[1]!);
          ctx.beginPath(); ctx.arc(s.x, s.y, 9 * d, 0, Math.PI * 2); ctx.strokeStyle = '#ffd866'; ctx.lineWidth = 2 * d; ctx.stroke();
        }
      }
      if (bad && this.mouse) v.hint(this.mouse.mx, this.mouse.my, why, true);
    }
    if (!this.pts.length && this.cursor && !this.lasso) {
      const p = snapPt(this.cursor.x, this.cursor.y, this.snap), s = v.screen(p.x, p.y);
      ctx.beginPath(); ctx.arc(s.x, s.y, 4 * d, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,216,102,0.9)'; ctx.fill();
    }
  }

  /** the handles of the selected area's shape P (its raw corners): a dot on each corner, a "+" on each edge's midpoint, the dashed box, the four scale squares just outside its corners, and the rotate dot above the top edge; the hovered handle is highlighted */
  private drawHandles(v: PaintView, P: number[]) {
    const ctx = v.ctx, d = v.dpr, n = P.length >> 1, b = boxOf(P), L = this.lay, hv = this.hoverH, A = this.A;
    this.host.affine(A); this.layout(P, b, A);
    // the box: tile space, dashed
    v.setIso(ctx); ctx.beginPath(); ctx.moveTo(b[0], b[1]); ctx.lineTo(b[2], b[1]); ctx.lineTo(b[2], b[3]); ctx.lineTo(b[0], b[3]); ctx.closePath(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = d; ctx.setLineDash([5 * d, 4 * d]); ctx.stroke(); ctx.setLineDash([]);
    // the rotate stem: from the top edge's midpoint to the rotate dot
    const rot = 2 * n + 4, foot = 2 * n + 5;
    ctx.beginPath(); ctx.moveTo(L[2 * foot]! * d, L[2 * foot + 1]! * d); ctx.lineTo(L[2 * rot]! * d, L[2 * rot + 1]! * d);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.5 * d; ctx.stroke();
    for (let h = 0; h < 2 * n + 5; h++) {
      const x = L[2 * h]! * d, y = L[2 * h + 1]! * d;
      if (h < n) {
        const hot = hv?.k === 'corner' && hv.i === h;
        ctx.beginPath(); ctx.arc(x, y, (hot ? 6 : 4) * d, 0, Math.PI * 2); ctx.fillStyle = hot ? '#ffffff' : '#ffd866'; ctx.fill();
        ctx.strokeStyle = '#4a3200'; ctx.lineWidth = 1.5 * d; ctx.stroke();
      } else if (h < 2 * n) {
        const hot = hv?.k === 'edge' && hv.i === h - n;
        ctx.beginPath(); ctx.arc(x, y, 3.5 * d, 0, Math.PI * 2); ctx.fillStyle = hot ? '#ffd866' : 'rgba(255,255,255,0.85)'; ctx.fill();
        ctx.strokeStyle = '#0f172a'; ctx.lineWidth = d; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x - 2.5 * d, y); ctx.lineTo(x + 2.5 * d, y); ctx.moveTo(x, y - 2.5 * d); ctx.lineTo(x, y + 2.5 * d);
        ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 1.2 * d; ctx.stroke();
      } else if (h < rot) {
        const hot = hv?.k === 'scale' && hv.i === h - 2 * n;
        ctx.fillStyle = hot ? '#ffd866' : '#ffffff'; ctx.fillRect(x - 4.5 * d, y - 4.5 * d, 9 * d, 9 * d);
        ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 1.2 * d; ctx.strokeRect(x - 4.5 * d, y - 4.5 * d, 9 * d, 9 * d);
      } else {
        const hot = hv?.k === 'rotate';
        ctx.beginPath(); ctx.arc(x, y, 6 * d, 0, Math.PI * 2); ctx.fillStyle = hot ? '#ffd866' : '#ffffff'; ctx.fill();
        ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 1.2 * d; ctx.stroke();
      }
    }
  }

  /** a candidate shape that cannot be applied during a drag: red, its crossing edges marked, and why beside the pointer */
  private drawBad(v: PaintView, P: number[], why: string) {
    const ctx = v.ctx, d = v.dpr;
    v.setIso(ctx); ctx.beginPath(); trace(ctx, P, true); ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = 'rgba(160,40,40,0.5)'; ctx.fill();
    ctx.strokeStyle = '#f87171'; ctx.lineWidth = 1.5 * d; ctx.setLineDash([6 * d, 4 * d]); ctx.stroke(); ctx.setLineDash([]);
    const hit = crossings(P), n = P.length >> 1;
    if (hit.length) {
      v.setIso(ctx); ctx.beginPath();
      for (const i of hit) { const j = (i + 1) % n; ctx.moveTo(P[2 * i]!, P[2 * i + 1]!); ctx.lineTo(P[2 * j]!, P[2 * j + 1]!); }
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.strokeStyle = '#f87171'; ctx.lineWidth = 3 * d; ctx.stroke();
    }
    if (this.mouse) v.hint(this.mouse.mx, this.mouse.my, why, true);
  }

  /** the handles' css px for the affine A into out, in slots: corner i at slot i; the "+" of edge i at n + i; box corner k at 2n + k (pushed SCALE_OUT px outward from the box centre); the rotate handle at 2n + 4 (ROT_UP px above the top edge's midpoint); the top edge's midpoint at 2n + 5 (the stem's foot) */
  private layout(P: number[], b: PaintBox, A: number[], out: number[] = this.lay) {
    const n = P.length >> 1;
    out.length = 2 * (2 * n + 6);
    for (let i = 0; i < n; i++) put(out, i, A, P[2 * i]!, P[2 * i + 1]!);
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; put(out, n + i, A, (P[2 * i]! + P[2 * j]!) / 2, (P[2 * i + 1]! + P[2 * j + 1]!) / 2); }
    const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
    const ccx = A[0]! + cx * A[2]! + cy * A[4]!, ccy = A[1]! + cx * A[3]! + cy * A[5]!;
    for (let k = 0; k < 4; k++) {
      const s = 2 * n + k;
      put(out, s, A, k === 1 || k === 2 ? b[2] : b[0], k >= 2 ? b[3] : b[1]);
      const dx = out[2 * s]! - ccx, dy = out[2 * s + 1]! - ccy, l = Math.hypot(dx, dy);
      if (l > 1e-9) { out[2 * s] = out[2 * s]! + dx / l * SCALE_OUT; out[2 * s + 1] = out[2 * s + 1]! + dy / l * SCALE_OUT; }
    }
    put(out, 2 * n + 5, A, cx, b[1]);
    put(out, 2 * n + 4, A, cx, b[1]); out[2 * (2 * n + 4) + 1] = out[2 * (2 * n + 4) + 1]! - ROT_UP;
  }

  /** the handle under css px (mx, my) of the area a, in the layout's order (corners, edge "+" dots, box corners, rotate); else the inside (move) when the tile t is inside it; else null */
  private grabAt(a: PaintArea, t: { x: number; y: number } | null, mx: number, my: number): Grab | null {
    const P = a.pts, n = P.length >> 1, L = this.lay, R = HIT * HIT;
    this.host.affine(this.A); this.layout(P, boxOf(P), this.A);
    for (let h = 0; h < 2 * n + 5; h++) {
      const dx = L[2 * h]! - mx, dy = L[2 * h + 1]! - my;
      if (dx * dx + dy * dy > R) continue;
      return h < n ? { k: 'corner', i: h } : h < 2 * n ? { k: 'edge', i: h - n } : h < 2 * n + 4 ? { k: 'scale', i: h - 2 * n } : { k: 'rotate', i: 0 };
    }
    return t && insidePoly(P, t.x, t.y) ? { k: 'move', i: 0 } : null;
  }

  /** sets the hovered handle; a change emits, so the overlay's cursor follows */
  private setHover(g: Grab | null) { const h = this.hoverH; if (h?.k === g?.k && h?.i === g?.i) return; this.hoverH = g; this.host.emit(); }

  /** starts a drag of handle g on the selected area a: an edge's "+" first inserts its corner at the midpoint (the area shows it at once), then that corner is dragged */
  private startDrag(a: PaintArea, g: Grab, t: { x: number; y: number }) {
    const start = a.pts, n = start.length >> 1;
    let base = start, eg = g;
    if (g.k === 'edge') {
      if (n >= MAX_PTS) { this.host.toast('Too many corners', 'warn'); return; }
      const j = (g.i + 1) % n;
      base = insertCorner(start, g.i, (start[2 * g.i]! + start[2 * j]!) / 2, (start[2 * g.i + 1]! + start[2 * j + 1]!) / 2);
      eg = { k: 'corner', i: g.i + 1 };
      a.pts = base;
    }
    const b = boxOf(base), C = [[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]], o = C[(eg.i + 2) % 4]!, c = C[eg.i % 4]!;
    const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2, p = snapPt(t.x, t.y, this.snap);
    this.drag = { g: eg, a, start, base, cand: base, bad: '', last: 0, px: p.x, py: p.y, cx, cy, a0: Math.atan2(t.y - cy, t.x - cx), ax: o[0]!, ay: o[1]!, bx: c[0]!, by: c[1]! };
    this.hoverH = eg;
  }

  /** the shape a drag's pointer at tile t (raw) gives: a corner moved, the whole shape moved, turned about the box centre (shift: 15° steps), or scaled about the opposite box corner (shift: uniform) */
  private candidate(d: Drag, t: { x: number; y: number }, shift: boolean): number[] {
    const p = snapPt(t.x, t.y, this.snap);
    switch (d.g.k) {
      case 'corner': return moveCorner(d.base, d.g.i, p.x, p.y);
      case 'move': return translatePts(d.base, p.x - d.px, p.y - d.py);
      case 'rotate': {
        let deg = (Math.atan2(t.y - d.cy, t.x - d.cx) - d.a0) * 180 / Math.PI;
        if (shift) deg = Math.round(deg / 15) * 15;
        return rotatePts(d.base, d.cx, d.cy, deg);
      }
      default: {
        const dx = d.bx - d.ax, dy = d.by - d.ay;
        let sx = Math.abs(dx) > 1e-9 ? (p.x - d.ax) / dx : 1, sy = Math.abs(dy) > 1e-9 ? (p.y - d.ay) / dy : 1;
        if (shift) { const L = Math.hypot(dx, dy); sx = sy = L > 1e-9 ? Math.hypot(p.x - d.ax, p.y - d.ay) / L : 1; }
        return scalePts(d.base, d.ax, d.ay, sx, sy);
      }
    }
  }

  /** a drag's pointer move: the candidate is checked; a valid one is applied at once and sent at most every SEND_MS, an invalid one is only shown (red) */
  private dragTo(t: { x: number; y: number } | null, shift: boolean) {
    const d = this.drag; if (!d || !t) return;
    d.cand = this.candidate(d, t, shift);
    d.bad = checkArea(d.cand);
    if (d.bad) return;
    d.a.pts = d.cand;
    const now = performance.now();
    if (now - d.last >= SEND_MS) { d.last = now; this.send(d.a); }
  }

  /** a drag's release: a valid shape is kept and sent; an invalid one reverts to the shape before the drag and toasts why; the host saves */
  private dragEnd() {
    const d = this.drag; if (!d) return;
    this.drag = null;
    d.a.pts = d.bad ? d.start : d.cand;
    this.send(d.a);
    if (d.bad) this.host.toast(d.bad, 'warn');
    this.host.save(); this.host.emit();
  }

  /** removes corner i of an area (3 is the least); a result that cannot be placed is not applied, and a toast says why */
  private cutCorner(a: PaintArea, i: number) {
    const r = removeCorner(a.pts, i);
    if (!r) { this.host.toast('An area needs 3 corners', 'warn'); return; }
    const why = checkArea(r);
    if (why) { this.host.toast(why, 'warn'); return; }
    a.pts = r; this.hoverH = null; this.send(a); this.host.save(); this.host.emit();
  }

  /** fills (when fill is set) and outlines an area's polygon on the overlay; lw in css px */
  private shade(v: PaintView, a: PaintArea, fill: string | null, stroke: string, lw: number) {
    const ctx = v.ctx;
    v.setIso(ctx); ctx.beginPath(); trace(ctx, this.outlineOf(a), true); ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    ctx.strokeStyle = stroke; ctx.lineWidth = lw * v.dpr; ctx.stroke();
  }

  /** copies a picked area's look into the panel's style */
  private take(a: PaintArea) { this.style = { tex: a.tex, scale: a.scale, angle: a.angle, border: a.border, btex: a.btex, radius: a.radius, tone: a.tone, toneAmt: a.toneAmt, tint: a.tint, bscale: a.bscale, bangle: a.bangle, btone: a.btone, btoneAmt: a.btoneAmt, btint: a.btint }; }
}
