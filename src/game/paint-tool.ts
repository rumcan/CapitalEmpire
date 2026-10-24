// The Paint tool's state and input (docs/PAINT-TOOL.md "The tool (UI)"): drawing outlines by clicks or a lasso, picking, erasing, the shape handles of the selected area, and the preview. No React; the engine and PaintPanel call it.
import type { LotPatch } from './ground-protocol';
import { BORDER_TEXES, BORDER_W, BRUSH_PRESETS, drawZ, DEFAULT_STYLE, MAX_PTS, MAX_SIDE, PAINT_TEXES, areaAt, boxOf, checkArea, clampStyle, crossings, fromTuples, insertCorner, insidePoly, moveCorner, polyBox, removeCorner, roundCorners, rotatePts, scalePts, simplify, snapPt, toTuple, translatePts, type BrushKind, type PaintArea, type PaintBox, type PaintTuple } from './paint';
import { dab, fillPoly, stroke as brushStroke, trace as traceMask, type Mask } from './brush';
import { MAP } from './iso';
import { holePreset, kindOfTex, placeHole, storedHolePreset, type HolePreset, type PresetProp, type StoredHole } from './golf/holepreset';
import HOLE_PRESETS from './golf/hole-presets.json';
import { EARTHWORK_PER_M3, areaBuildCost, growInMonths, surfaceOfTex, type PlantKind } from './golf/costs';  
import { PLANT_KINDS, clampPlant, type PlantBrushKind, type PlantSet } from './plant';
import { drawGhostPoly, drawGhostRing, drawGhostSnap, ghostStatus } from './ext/ghost-preview';
import { edgeProfileOf } from './paint-edges';
import { computeSnapPiecePlacement, type CoursePieceArchetype, type CoursePieceHeightOp, type SnapPiecePlacement, type SnapTargetRoad } from './ext/course-snap';
import { PIECE_BUTTONS, piecePropsOf, pieceAreas, pieceCost, pieceWhy, snapTargets } from './ext/course-pieces';
import { CourseHeightJournal, applyCourseHeightBrush, brushBox, estimateCourseBrushM3, unionBox, type CourseHeightBrushDab, type CourseHeightBrushMode, type CourseHeightField, type CourseHeightStep, type CourseTileBox } from './ext/course-height';
import { applyDiff, cellCentre, diffCost, fillPolygon, paintDisc, paintStroke, type Grid, type GridDiff, type PaintOpts } from './ext/course-grid';
import { SURF_SURFACE, mergeMany, plantMonth, polyCells, surfOfSurface, type GridArea } from './ext/course-grid/areas';
import { unitBuildCost } from './golf/costs';
/** whether a painted area has completed its grow-in (sod or non-seed areas are mature at once) */  
export function isAreaMature(a: PaintArea, currentMonth: number): boolean {  
 if (!a.plantKind || a.plantKind === 'sod') return true;  
 const s = surfaceOfTex(a.tex);  
 if (!s) return true;  
 const needed = growInMonths(s, a.plantKind);  
 if (needed <= 0) return true;  
 const planted = a.plantedMonth ?? 0;  
 const elapsed = Math.max(0, currentMonth - planted);  
 return elapsed >= needed;
}
/** the localStorage key of the edited plant brushes */
const PLANT_KEY = 'capitalempire.plantBrushes';
/** the plant brushes: the defaults, each replaced by its saved edit (clamped) */
function loadPlant(): Record<PlantBrushKind, PlantSet> {
  let saved: Partial<Record<PlantBrushKind, Partial<PlantSet>>> | null = null;
  try { saved = JSON.parse(localStorage.getItem(PLANT_KEY) ?? 'null'); } catch { /* no storage or a bad save */ }
  const out = {} as Record<PlantBrushKind, PlantSet>;
  for (const k of PLANT_KINDS) out[k.kind] = clampPlant(saved && typeof saved === 'object' ? saved[k.kind] : undefined, k.kind);
  return out;
}

export type PaintMode = 'draw' | 'pick' | 'erase' | 'hole' | 'brush' | 'plant' | 'piece' | 'height';
/** the golf holes a course has (the Course tool's hole strip) */
export const HOLE_COUNT = 18;
/** the studio's 18 preset holes (src/game/golf/hole-presets.json; null: an empty slot) */
const STORED: (StoredHole | null)[] = Array.from({ length: HOLE_COUNT }, (_, i) => ((HOLE_PRESETS as { holes?: (StoredHole | null)[] }).holes?.[i] ?? null));
/** the props an action added and removed (the engine's journal; opaque here), for undo */
export interface PropJournal { added: unknown[]; removed: unknown[] }
/** the areas at one moment, for undo: each area's id and save tuple (and the tuple as text, to compare), and the next id */
interface AreaSnap { ids: number[]; ts: PaintTuple[]; keys: string[]; nextId: number }
/** an undoable action: the areas before and after it, the props it added or removed, the money it spent, the course height blocks it changed (T027),
 *  the course grid cells it changed (T078: one merged diff) and the hole plans before and after it (as JSON; null when they did not change) */
interface UndoStep { label: string; before: AreaSnap; after: AreaSnap; props: PropJournal | null; spent: number; height: CourseHeightStep | null; grid: GridDiff | null; plans: { before: string; after: string } | null }
/** the most undo steps kept */
const UNDO_MAX = 100;
/** the most course-grid cells the undo steps keep in all (13 bytes a cell: about 26 MB); the oldest steps go first */
const UNDO_CELLS = 2_000_000;
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
export interface PaintHost { setLotGround(key: string, patches: LotPatch[] | null): void; emit(): void; save(): void; toast(text: string, kind?: 'info' | 'warn'): void; affine(out: number[]): void; placeProps(ps: PresetProp[], seed: number): number; golfMode?: () => boolean; money?: () => number; spend?: (n: number) => void; ownedLand?: (pts: number[]) => boolean; currentMonth?: () => number;
  /** the player did something that counts toward the tool unlocks (T033) */
  progress?(what: 'piece'): void;
  /** the road segments near tile (x, y) within r tiles, as snap targets for a cart path (T031) */
  roadsNear?(x: number, y: number, r: number): SnapTargetRoad[];
  /** the road network's revision (changes on every road edit): a planned cart path re-snaps when it does (T031) */
  roadRev?(): number;
  /** a plant brush dab: props from ids scattered in the circle (spaced, sized size[0]..size[1]); returns how many were placed */
  plant(ids: string[], x: number, y: number, r: number, spacing: number, size: [number, number], seed: number): number;
  /** removes the plant-brush props in the circle; returns how many */
  unplant(x: number, y: number, r: number): number;
  /** the sprites a plant brush can use */
  plantPool(kind: PlantBrushKind): { id: string; name: string }[];
  /** the prop journal (undo): begin records every prop added or removed until end, which returns them (null: none); undo and redo
   *  reverse or replay a journal and return the journal to keep for the opposite step */
  journal?: { begin(): void; end(): PropJournal | null; undo(j: PropJournal): PropJournal; redo(j: PropJournal): PropJournal };
  /** the course height field to edit, if any (T027) */
  courseHeight?(): CourseHeightField | null;
  /** the course height changed in this box: the engine re-flattens the roads there, saves and re-bakes */
  heightChanged?(box: CourseTileBox): void;
  /** the areas changed (an undo step was made, undone or redone): the engine re-fits the holes' pins and tee markers; pins: where a placed
   *  preset's flag stands, by hole (the pin goes there when it is on the green) */
  changed?(pins?: Map<number, { x: number; y: number }>): void;
  /** the golf game's course grid (T078; null in a classic game, which keeps painting course areas): the Course tool's golf surfaces paint
   *  into it, and its undo steps carry the cells they changed */
  grid?(): Grid | null;
  /** the grid changed by d (null: nothing new); flush: send the touched chunks now (else at most every SEND_MS) */
  gridChanged?(d: GridDiff | null, flush: boolean): void;
  /** the grid's course areas (gridAreas, cached by the engine): the holes in use, a hole's box and the pieces' snap targets */
  gridAreas?(): readonly GridArea[];
  /** whether tile (x, y) is on the golf game's owned land (the grid's cells outside it are never painted) */
  ownedAt?(x: number, y: number): boolean;
  /** the golf game's hole plans (save tuples) and their setter: undo and redo carry them */
  plans?(): unknown[];
  setPlans?(p: unknown[]): void;
  /** a course surface's look (a brush style) changed: the grid's chunks are drawn again in it */
  courseLook?(): void }
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

/** the edge profile field of an area's ground patch (paint-edges.ts): from its brush kind, else its texture's golf surface, else its texture;
 *  nothing when crisp (paving, kerbs), so those patches stay as they were */
function edgeOf(a: PaintArea): { e?: ReturnType<typeof edgeProfileOf> } {
  const e = edgeProfileOf(a.kind ?? surfaceOfTex(a.tex), a.tex, a.border > 0 ? a.btex : undefined);
  return e === 'crisp' ? {} : { e };
}

/** adds a polygon's corners to the current path (the caller begins the path and sets the transform) */
function trace(ctx: CanvasRenderingContext2D, pts: number[], closed: boolean) {
  const n = pts.length >> 1; if (n < 1) return;
  ctx.moveTo(pts[0]!, pts[1]!); for (let i = 1; i < n; i++) ctx.lineTo(pts[2 * i]!, pts[2 * i + 1]!);
  if (closed) ctx.closePath();
}

/** a flat outline x0 y0 x1 y1 ... as points */
function toXY(pts: readonly number[]): { x: number; y: number }[] { const out: { x: number; y: number }[] = []; for (let k = 0; k + 1 < pts.length; k += 2) out.push({ x: pts[k]!, y: pts[k + 1]! }); return out; }
/** the hole a planned piece is laid for */
const pl0 = (p: { pl: SnapPiecePlacement }) => p.pl.hole;

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
  /** the Course tool is on (the engine sets it): Draw is the Shape method (the current surface's style, tagged with the hole and kind),
   *  a placed preset becomes the current hole (or the next free one) */
  course = false;
  /** hole mode: the preset placed: 0 a generated hole (holeSeed), 1..18 the studio's preset in that slot */
  holeSlot = 0;
  /** undo and redo (Ctrl+Z, Ctrl+Y): the steps, and the action in progress (its depth: nested begins join one step) */
  private undos: UndoStep[] = [];
  private redos: UndoStep[] = [];
  private tx: { before: AreaSnap; spent: number; depth: number; label: string; gd: GridDiff[]; plans: string } | null = null;
  /** the course height blocks the action in progress touches, for undo (T027) */
  private hj = new CourseHeightJournal();
  /** the flag of the preset being placed (golf mode): the pin's spot for its hole, handed to the engine when the step commits */
  private pinHint: Map<number, { x: number; y: number }> | undefined;
  /** brush mode: the kind painted, the hole it is painted for, Rub out (strokes erase), and each kind's brush (radius, style: the presets, edited and remembered) */
  brushKind: BrushKind = 'fairway';
  brushHole = 1;
  rubOut = false;
  /** seed (grows in) or sod: how a golf area painted now is planted */
  plantKind: PlantKind = 'seed';
  brush: Record<BrushKind, BrushSet> = loadBrush();
  /** plant mode: the plant brush in use and each kind's brush (remembered); the drag in progress (erasing or not, the last dab) */
  plantBrush: PlantBrushKind = 'trees';
  plant: Record<PlantBrushKind, PlantSet> = loadPlant();
  /** piece mode (T030): the archetype in hand, its turn (degrees, R) and size (×, [ ]), whether it snaps to the piece it touches, and the plan at the cursor (rebuilt when its key changes) */
  pieceArch: CoursePieceArchetype = 'fairway-pear';
  pieceAngle = 0;
  pieceScale = 1;
  pieceSnap = true;
  piece: { key: string; pl: SnapPiecePlacement; areas: Omit<PaintArea, 'id'>[]; why: string; cost: number } | null = null;
  /** height mode (T027b): raise, lower, smooth or flatten; the brush radius (tiles, 1..32); the strength level (1..5); the drag in progress (its last dab, and whether it already said it ran out of money) */
  heightMode: CourseHeightBrushMode = 'raise';
  heightR = 6;
  heightLevel = 2;
  private heighting: { last: { x: number; y: number }; broke: boolean } | null = null;
  private planting: { erase: boolean; last: { x: number; y: number }; n: number } | null = null;
  private plantSeed = (Date.now() % 100000) | 0;
  /** brush mode: the stroke in progress, or null: its mask of this hole's cells of the kind, the radius, whether it erases, the last tile, and the dabs (x y pairs) for the preview */
  private stroke: { m: Mask; m0: Mask; r: number; erase: boolean; last: { x: number; y: number }; dabs: number[]; /** on the course grid (T078): the surface id, month value and brush rules each dab paints the cells with (the mask is unused) */ grid?: { g: Grid; s: number; month: number; opts: PaintOpts } } | null = null;
  private host: PaintHost;

  constructor(host: PaintHost) { this.host = host; }

  /** the ground patch of a painted area (outline, texture, scale, angle, border width, border texture, draw order; the tone only when it is on); a brush area draws above the layers below it */
  static patch(a: PaintArea, mature = true): LotPatch { return { pts: roundCorners(a.pts, a.radius), tex: mature ? a.tex : 'golfSod', paint: { s: a.scale, a: a.angle, b: BORDER_W[a.border]!, bt: a.btex, z: drawZ(a), ...(a.tone ? { t: a.tone, ta: a.toneAmt, tc: a.tint } : {}), ...(a.bscale !== DEFAULT_STYLE.bscale || a.bangle !== DEFAULT_STYLE.bangle ? { bs: a.bscale, ba: a.bangle } : {}), ...(a.btone ? { bto: a.btone, bta: a.btoneAmt, btc: a.btint } : {}), ...(a.mtex ? { m: { t: a.mtex, s: a.mshare ?? 0.5, f: a.msoft ?? 0.12, p: a.mpatch ?? 1 } } : {}), ...edgeOf(a) } }; }

  /** an area's outline with its corners rounded, cached per area until the radius or the corners change */
  private outlineOf(a: PaintArea): number[] {
    let c = this.rounded.get(a);
    if (!c || c.r !== a.radius || c.src !== a.pts) { c = { r: a.radius, src: a.pts, out: roundCorners(a.pts, a.radius) }; this.rounded.set(a, c); }
    return c.out;
  }

  /** sends an area's patch to the lot ground (key paint:<id>) */
  send(a: PaintArea, currentMonth?: number) { const m = currentMonth === undefined || isAreaMature(a, currentMonth); this.host.setLotGround('paint:' + a.id, [PaintTool.patch(a, m)]); }

  /** replaces the areas with the save tuples (none: clears) and sends their patches */
  load(ts?: PaintTuple[], currentMonth?: number) { this.clear(); this.undos = []; this.redos = []; this.tx = null; this.hj = new CourseHeightJournal(); this.areas = fromTuples(ts ?? []); this.nextId = this.areas.length + 1; for (const a of this.areas) this.send(a, currentMonth); }

  /** takes out the areas pred picks (their ground goes; T078's load moves the golf surfaces into the course grid), in paint order, and
   *  clears the undo steps (they name the old areas); returns them */
  takeAreas(pred: (a: PaintArea) => boolean): PaintArea[] {
    const out = this.areas.filter(pred); if (!out.length) return out;
    const gone = new Set(out);
    for (const a of out) this.host.setLotGround('paint:' + a.id, null);
    this.areas = this.areas.filter(a => !gone.has(a)); this.undos = []; this.redos = []; this.selected = 0; this.hover = 0; this.hoverH = null; this.drag = null;
    return out.sort((a, b) => drawZ(a) - drawZ(b));
  }
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
      if (a) { Object.assign(a, this.style); if (!this.style.mtex) { delete a.mtex; delete a.mshare; delete a.msoft; delete a.mpatch; } this.send(a); this.host.save(); }
    }
    if (this.mode === 'brush' || (this.course && this.mode === 'draw')) {
      // the brush preset takes the change (the Course tool's Shape method paints with it too), and the areas of this hole and kind re-style at once
      const k = this.brushKind;
      const was = this.brush[k].style;
      this.brush[k] = { r: this.brush[k].r, style: { ...this.style } }; this.saveBrush();
      let changed = false;
      for (const a of this.areas) if (a.hole === this.brushHole && a.kind === k) { Object.assign(a, this.brush[k].style); this.send(a); changed = true; }
      if (changed) this.host.save();
      // the grid's surfaces wear the brush looks (texture, scale, angle; not the tone): its chunks are drawn again only when one of those changed
      const st = this.brush[k].style;
      if (this.courseGrid() && (st.tex !== was.tex || st.scale !== was.scale || st.angle !== was.angle)) this.host.courseLook?.();
    }
    this.host.emit();
  }

  /** brush mode: sets a kind's radius (tiles, 0.5 to 20) and remembers it */
  setBrushR(r: number) { const k = this.brushKind; this.brush[k] = { r: Math.min(BR_MAX, Math.max(BR_MIN, Number.isFinite(r) ? r : this.brush[k].r)), style: this.brush[k].style }; this.saveBrush(); this.host.emit(); }

  /** writes the brush presets to localStorage (a storage that is missing or full is skipped) */
  private saveBrush() { try { localStorage.setItem(BRUSH_KEY, JSON.stringify(this.brush)); } catch { /* storage may be unavailable */ } }

  /** the golf brush: paints the kind (its preset's style, the panel shows it) for the brush hole; the outline and the selection are dropped */
  setBrush(kind: BrushKind) { this.mode = 'brush'; this.brushKind = kind; this.style = { ...this.brush[kind].style }; this.cancel(); this.selected = 0; this.hover = 0; this.hoverH = null; this.host.emit(); }

  /** the Course tool's Shape method: click corners (or lasso) to lay the kind for the current hole, in its preset's style */
  setShape(kind: BrushKind) { this.mode = 'draw'; this.brushKind = kind; this.style = { ...this.brush[kind].style }; this.cancel(); this.selected = 0; this.hover = 0; this.hoverH = null; this.host.emit(); }
  /** the Course tool opens (the engine calls it): coming from Paint, or from Pick or Erase, it starts on the current surface's brush */
  /** the Course tool opens on its Pieces method in golf mode (T035); classic keeps the brush */
  enterCourse() { const was = this.course; this.course = true; if (!was || !(this.mode === 'brush' || this.mode === 'hole' || this.mode === 'plant' || this.mode === 'piece' || this.mode === 'height' || this.mode === 'draw')) { if (this.host.golfMode?.()) this.setPiece(this.pieceArch); else this.setBrush(this.brushKind); } }
  /** the Paint tool opens: the golf brush, the Shape method and the hole presets are the Course tool's, so they fall back to Draw */
  enterPaint() { const was = this.course; this.course = false; if (this.mode === 'brush' || this.mode === 'hole' || this.mode === 'piece' || this.mode === 'height' || (was && this.mode === 'draw')) this.setMode('draw'); }
  /** the hole numbers that have painted areas */
  usedHoles(): Set<number> { const out = new Set<number>(); for (const a of this.areas) if (a.hole) out.add(a.hole); for (const a of this.host.gridAreas?.() ?? []) if (a.hole) out.add(a.hole); return out; }
  /** the lowest hole number (1..18) with no areas, or 0 when every hole has some */
  nextFreeHole(): number { const u = this.usedHoles(); for (let n = 1; n <= HOLE_COUNT; n++) if (!u.has(n)) return n; return 0; }
  /** a hole's bounding box [x0, y0, x1, y1] over its areas, or null when it has none */
  holeBox(n: number): [number, number, number, number] | null {
    let b: [number, number, number, number] | null = null;
    for (const a of [...this.areas, ...(this.host.gridAreas?.() ?? [])]) if (a.hole === n) { const q = polyBox(a.pts); b = b ? [Math.min(b[0], q[0]), Math.min(b[1], q[1]), Math.max(b[2], q[2]), Math.max(b[3], q[3])] : [q[0], q[1], q[2], q[3]]; }
    return b;
  }
  /** makes hole n (1..18) the current hole: the brush, the shapes and a placed preset go to it */
  setHole(n: number) { this.brushHole = Math.min(HOLE_COUNT, Math.max(1, Math.round(n))); this.cancel(); this.selected = 0; this.hoverH = null; this.host.emit(); }
  /** the studio's preset slots (1..18): each slot's name, or null when it is empty */
  presetSlots(): (string | null)[] { return STORED.map(h => h ? h.name : null); }
  /** hole mode: the preset placed next (0: a generated hole; 1..18: a studio slot; an empty slot means generated) */
  setHoleSlot(n: number) { this.holeSlot = n >= 1 && n <= HOLE_COUNT && STORED[n - 1] ? n : 0; this.ghost = null; this.host.emit(); }

  /** the areas now, for undo */
  private snapshot(): AreaSnap { const ts = this.areas.map(a => toTuple(a)); return { ids: this.areas.map(a => a.id), ts, keys: ts.map(t => JSON.stringify(t)), nextId: this.nextId }; }
  /** starts an undoable action (a nested begin joins the open one) */
  private begin(label: string) { if (this.tx) { this.tx.depth++; return; } this.tx = { before: this.snapshot(), spent: 0, depth: 1, label, gd: [], plans: this.plansKey() }; this.host.journal?.begin(); this.hj.begin(); }
  /** the hole plans as text (undo compares and restores them) */
  private plansKey(): string { return JSON.stringify(this.host.plans?.() ?? []); }
  /** ends an undoable action: it becomes an undo step when it changed the areas or the props, or spent money (the redo steps are dropped) */
  private commit() {
    const t = this.tx; if (!t || --t.depth > 0) return;
    this.tx = null;
    // the action's last chunks go out first, inside the prop journal: the trees they clear off new playing surfaces come back on undo
    if (t.gd.length) this.host.gridChanged?.(null, true);
    const props = this.host.journal?.end() ?? null, after = this.snapshot();
    const f = this.host.courseHeight?.() ?? null, height = f ? this.hj.end(f) : null; if (!f) this.hj.drop();
    const same = after.keys.length === t.before.keys.length && after.keys.every((k, i) => k === t.before.keys[i]); // a stroke that changed nothing re-made the same areas under new ids
    const gd = mergeMany(t.gd), grid = gd && gd.n ? gd : null, pk = this.plansKey(), plans = pk !== t.plans ? { before: t.plans, after: pk } : null;
    if (!props && !t.spent && same && !height && !grid && !plans) return;
    this.undos.push({ label: t.label, before: t.before, after, props, spent: t.spent, height, grid, plans }); if (this.undos.length > UNDO_MAX) this.undos.shift();
    // a few big grid steps (a whole preset hole, a long stroke) can outweigh a hundred small ones: the steps are capped by their cells too
    let cells = 0; for (const u of this.undos) cells += u.grid?.n ?? 0;
    while (cells > UNDO_CELLS && this.undos.length > 1) cells -= this.undos.shift()!.grid?.n ?? 0;
    this.redos = [];
    const hint = this.pinHint; this.pinHint = undefined; this.host.changed?.(hint);
  }
  /** puts the areas back as a snapshot has them: an area whose id and tuple did not change is kept, the others re-bake */
  private restore(s: AreaSnap) {
    const cur = new Map(this.areas.map(a => [a.id, a] as [number, PaintArea]));
    const m = this.host.currentMonth?.(), out: PaintArea[] = [], keep = new Set<number>();
    for (let i = 0; i < s.ids.length; i++) {
      const id = s.ids[i]!, old = cur.get(id);
      if (old && JSON.stringify(toTuple(old)) === s.keys[i]) { out.push(old); keep.add(id); continue; }
      const a = fromTuples([s.ts[i]!])[0]; if (!a) continue;
      const b: PaintArea = { ...a, id }; out.push(b); keep.add(id); this.send(b, m);
    }
    for (const a of this.areas) if (!keep.has(a.id)) this.host.setLotGround('paint:' + a.id, null);
    this.areas = out; this.nextId = s.nextId;
    this.selected = 0; this.hover = 0; this.hoverH = null; this.drag = null; this.stroke = null; this.planting = null; this.heighting = null; this.pts = []; this.lasso = false; this.down = null;
  }
  /** an undo step's grid cells and hole plans go back (undo) or forward (redo); the touched chunks are sent at once */
  private gridStep(u: UndoStep, undo: boolean) {
    const g = this.host.grid?.();
    if (u.grid && g) { applyDiff(g, u.grid, undo); this.host.gridChanged?.(u.grid, true); }
    if (u.plans && this.host.setPlans) { try { this.host.setPlans(JSON.parse(undo ? u.plans.before : u.plans.after) as unknown[]); } catch { /* the text is our own JSON */ } }
  }
  /** the course grid the Course tool paints a golf surface into: the golf game's grid (null: course areas are painted, as in a classic game) */
  private courseGrid(): Grid | null { return this.course && this.host.golfMode?.() ? this.host.grid?.() ?? null : null; }
  /** keeps a grid change in the open action and tells the engine (its chunks are sent within SEND_MS) */
  private gridApply(d: GridDiff) { if (!d.n) return; this.tx?.gd.push(d); this.host.gridChanged?.(d, false); }
  /** the brush rules on grid g for surface s: 'below' (a stroke slides past the surfaces drawn above it, as the old layers did), owned
   *  cells only, and a rub out takes only cells of its own surface on the current hole (as the old per-hole brush areas did) */
  private gridOpts(g: Grid, s: number, erase: boolean): PaintOpts {
    const own = this.host.ownedAt;
    const h = this.brushHole;
    return { over: 'below', rub: erase, allow: i => { if (erase && (g.surf[i] !== s || g.hole[i] !== h)) return false; if (!own) return true; const c = cellCentre(g, i); return own(c.x, c.y); } };
  }
  /** fills polygon pts (tiles) into grid g as surface s for hole h (the brush rules): the cells that change are charged (1 m² each at the
   *  surface's price; golf mode) and kept in the open action; false, with the toast and nothing changed, when the treasury cannot pay */
  private gridFill(g: Grid, pts: number[], s: number, h: number): boolean {
    const d = fillPolygon(g, toXY(pts), s, h, plantMonth(this.plantKind, this.host.currentMonth?.()), this.gridOpts(g, s, false));
    const cost = this.host.golfMode?.() ? Math.round(diffCost(d, v => unitBuildCost(SURF_SURFACE[v] ?? 'other', this.plantKind))) : 0, money = this.host.money?.() ?? 0;
    if (cost > 0 && money < cost) { applyDiff(g, d, true); this.host.toast(`Not enough money: this costs $${cost.toLocaleString()} (treasury: $${Math.round(money).toLocaleString()})`, 'warn'); return false; }
    if (cost > 0) { this.host.spend?.(cost); if (this.tx) this.tx.spent += cost; }
    this.gridApply(d); return true;
  }
  /** the grid surface id a painted area lays (its brush kind, else its texture's golf surface; 0: none, it stays a painted area) */
  private static surfOf(a: { kind?: BrushKind; tex: PaintArea['tex'] }): number { return surfOfSurface(a.kind ?? surfaceOfTex(a.tex)); }
  /** whether there is a step to undo / redo (the panel's buttons) */
  get canUndo() { return this.undos.length > 0 && !this.tx; }
  get canRedo() { return this.redos.length > 0 && !this.tx; }
  /** undoes the last action: its areas go back, its props are taken away or put back, its money is refunded */
  undo() {
    if (this.tx) return;
    const u = this.undos.pop(); if (!u) return;
    this.restore(u.before);
    this.gridStep(u, true);
    const f = this.host.courseHeight?.(); if (u.height && f) { const b = this.hj.apply(f, u.height, 'before'); if (b) this.host.heightChanged?.(b); }
    if (u.props && this.host.journal) u.props = this.host.journal.undo(u.props);
    if (u.spent) this.host.spend?.(-u.spent);
    this.host.changed?.();
    this.redos.push(u); this.host.save(); this.host.toast(`Undone: ${u.label}`); this.host.emit();
  }
  /** redoes the last undone action */
  redo() {
    if (this.tx) return;
    const u = this.redos.pop(); if (!u) return;
    this.restore(u.after);
    this.gridStep(u, false);
    const f = this.host.courseHeight?.(); if (u.height && f) { const b = this.hj.apply(f, u.height, 'after'); if (b) this.host.heightChanged?.(b); }
    if (u.props && this.host.journal) u.props = this.host.journal.redo(u.props);
    if (u.spent) this.host.spend?.(u.spent);
    this.host.changed?.();
    this.undos.push(u); this.host.save(); this.host.toast(`Redone: ${u.label}`); this.host.emit();
  }

  /** moves the selected area in the draw order (an undo step): 1 forward past the next area above it that it overlaps, -1 back past the next one
   *  below, 'front' / 'back' over / under every area it overlaps; a toast when there is nothing to pass */
  moveLayer(step: 1 | -1 | 'front' | 'back') {
    const a = this.selectedArea(); if (!a) { this.host.toast('Pick an area first (Pick, or a shape you just drew)', 'warn'); return; }
    const b = polyBox(a.pts), z = drawZ(a);
    const zs = this.areas.filter(q => { if (q === a) return false; const c = polyBox(q.pts); return c[0] < b[2] && c[2] > b[0] && c[1] < b[3] && c[3] > b[1]; }).map(drawZ).sort((p, q) => p - q);
    const up = zs.filter(v => v > z), down = zs.filter(v => v < z);
    let to: number | null = null;
    if (step === 1 && up.length) to = up.length > 1 ? (up[0]! + up[1]!) / 2 : up[0]! + 1;
    else if (step === -1 && down.length) { const k = down.length; to = k > 1 ? (down[k - 1]! + down[k - 2]!) / 2 : down[k - 1]! - 1; }
    else if (step === 'front' && up.length) to = up[up.length - 1]! + 1;
    else if (step === 'back' && down.length) to = down[0]! - 1;
    if (to === null) { this.host.toast(step === 1 || step === 'front' ? 'Already over every area it overlaps' : 'Already under every area it overlaps'); return; }
    this.begin('layer order'); a.order = to; this.send(a, this.host.currentMonth?.()); this.commit();
    this.host.save(); this.host.emit();
  }

  /** the plant brush: Trees, Bushes or Flowers scattered by dragging (Rub out / Alt removes them) */
  setPlant(kind: PlantBrushKind) { this.mode = 'plant'; this.plantBrush = kind; this.cancel(); this.selected = 0; this.hover = 0; this.hoverH = null; this.host.emit(); }
  /** piece mode: takes archetype arch in hand (T030) */
  setPiece(arch: CoursePieceArchetype) { this.mode = 'piece'; this.pieceArch = arch; this.cancel(); this.selected = 0; this.hover = 0; this.hoverH = null; this.piece = null; this.refreshPiece(); }
  /** piece mode: the turn (degrees, wrapped to 0..345), the size (0.5 to 2.5) and snapping of the piece in hand */
  setPieceOpts(o: { angle?: number; scale?: number; snap?: boolean }) {
    if (o.angle !== undefined) this.pieceAngle = ((Math.round(o.angle) % 360) + 360) % 360;
    if (o.scale !== undefined) this.pieceScale = Math.min(2.5, Math.max(0.5, Math.round(o.scale * 4) / 4));
    if (o.snap !== undefined) this.pieceSnap = o.snap;
    this.refreshPiece();
  }
  /** piece mode: re-plans the piece at the cursor and redraws the panel */
  private refreshPiece() { this.piece = this.cursor ? this.pieceAt(this.cursor) : null; this.host.emit(); }
  /** piece mode: the plan for the piece in hand at tile t: its placement (snapped to the touching course piece unless snapping is off), the areas it lays, why it cannot go ('' if it can) and its cost (golf mode) */
  private pieceAt(t: { x: number; y: number }): NonNullable<PaintTool['piece']> {
    const key = `${this.pieceArch}|${Math.round(t.x * 4)}|${Math.round(t.y * 4)}|${this.pieceAngle}|${this.pieceScale}|${this.pieceSnap}|${this.brushHole}|${this.areas.length}|${this.nextId}|${this.plantKind}|${this.host.courseHeight?.()?.rev ?? 0}|${this.host.roadRev?.() ?? 0}|${this.courseGrid()?.rev ?? 0}`;
    if (this.piece?.key === key) return this.piece;
    const b = PIECE_BUTTONS.find(q => q.arch === this.pieceArch) ?? PIECE_BUTTONS[2]!, golf = !!this.host.golfMode?.();
    // a cart path snaps to the road kerbs near it (T031); the other pieces do not look at the roads
    const roads = b.kind === 'path' && this.pieceSnap ? this.host.roadsNear?.(t.x, t.y, 12) : undefined;
    const pl = computeSnapPiecePlacement({ kind: b.kind, archetype: b.arch, cursor: t, angleDeg: this.pieceAngle, scale: this.pieceScale, snapEnabled: this.pieceSnap, defaultHole: this.brushHole, areas: snapTargets(this.snapAreas()), roads });
    const areas = pieceAreas(pl);
    // a snapped cart path's join apron sits on the road's verge, which may lie outside the course land: only the piece's own layers must be on owned land (the apron is still laid and priced)
    const landAreas = b.kind === 'path' ? areas.filter((_, i) => pl.layers[i]?.role !== 'join-apron') : areas;
    return { key, pl, areas, why: pieceWhy(landAreas, golf ? this.host.ownedLand : undefined), cost: golf ? this.piecePrice(areas) + this.earthworkCost(pl.heightOps) : 0 };
  }
  /** what a piece can snap to: the painted areas and, on the course grid, its blobs (outer rings; their texture says their kind; no collars) */
  private snapAreas(): (Pick<PaintArea, 'id' | 'pts' | 'kind' | 'hole'> & { tex?: string; order?: number })[] {
    const grid = this.courseGrid() ? this.host.gridAreas?.() ?? [] : [];
    return grid.length ? [...this.areas, ...grid.filter(a => !a.collar).map(a => ({ id: a.id, pts: a.outer, hole: a.hole || undefined, tex: a.tex }))] : this.areas;
  }
  /** the price of a piece's areas (golf mode): on the course grid, its golf surfaces by the cells they would change (1 m² each, as the
   *  Shape method charges; the collar layers it drops cost nothing: collars are automatic), its other layers (a cart path) by their
   *  painted area; without a grid, every layer by its area (pieceCost) */
  private piecePrice(areas: readonly Omit<PaintArea, 'id'>[]): number {
    const g = this.courseGrid(); if (!g) return pieceCost(areas, this.plantKind);
    const own = this.host.ownedAt, rest: Omit<PaintArea, 'id'>[] = [];
    let cost = 0;
    for (const a of areas) {
      const gs = PaintTool.surfOf(a), sf = a.kind ?? surfaceOfTex(a.tex);
      if (!gs) { if (sf !== 'fringe' && sf !== 'firstCut') rest.push(a); continue; }
      let n = 0;
      polyCells(g, roundCorners(a.pts, a.radius), (i, x, y) => { if (g.surf[i]! < gs && (!own || own(x, y))) n++; });
      cost += n * unitBuildCost(SURF_SURFACE[gs] ?? 'other', this.plantKind);
    }
    return Math.round(cost + (rest.length ? pieceCost(rest, this.plantKind) : 0));
  }
  /** applies a placed piece's height ops to the course height field (journaled for undo); the engine is told the changed box */
  private applyHeightOps(ops: readonly CoursePieceHeightOp[]) {
    const f = this.host.courseHeight?.(); if (!f || !ops.length) return;
    let box: CourseTileBox | null = null;
    for (const op of ops) { const dab: CourseHeightBrushDab = { x: op.x, y: op.y, radiusTiles: op.radiusTiles, mode: op.mode, strength: op.strength }; this.hj.touch(f, brushBox(dab)); box = unionBox(box, applyCourseHeightBrush(f, dab)); }
    if (box) this.host.heightChanged?.(box);
  }
  /** the earthworks price of a piece's height ops (golf mode): each op's earth (m³) measured on the field as it is now, × EARTHWORK_PER_M3; 0 with no field */
  private earthworkCost(ops: readonly CoursePieceHeightOp[]): number {
    const f = this.host.courseHeight?.(); if (!f || !ops.length) return 0;
    let m3 = 0;
    for (const op of ops) m3 += estimateCourseBrushM3(f, { x: op.x, y: op.y, radiusTiles: op.radiusTiles, mode: op.mode, strength: op.strength });
    return Math.round(m3 * EARTHWORK_PER_M3);
  }
  /** the dab the height brush lays at t: raise and lower move 0.1 m × level at the centre, smooth and flatten blend 0.2 × level */
  heightDab(t: { x: number; y: number }): CourseHeightBrushDab { return { x: t.x, y: t.y, radiusTiles: this.heightR, mode: this.heightMode, strength: this.heightMode === 'raise' || this.heightMode === 'lower' ? 0.1 * this.heightLevel : 0.2 * this.heightLevel }; }
  /** height mode with these settings (mode, radius 1..32, level 1..5) */
  setHeight(o: { mode?: CourseHeightBrushMode; r?: number; level?: number } = {}) {
    this.mode = 'height'; if (o.mode !== undefined) this.heightMode = o.mode;
    if (o.r !== undefined) this.heightR = Math.min(32, Math.max(1, Math.round(o.r)));
    if (o.level !== undefined) this.heightLevel = Math.min(5, Math.max(1, Math.round(o.level)));
    this.cancel(); this.selected = 0; this.hover = 0; this.hoverH = null; this.host.emit();
  }
  /** the earthworks price of one height dab (golf mode only): its earth (m³) on the field as it is now × EARTHWORK_PER_M3; 0 in classic mode */
  private dabCost(f: CourseHeightField, dab: CourseHeightBrushDab): number { return this.host.golfMode?.() ? Math.round(estimateCourseBrushM3(f, dab) * EARTHWORK_PER_M3) : 0; }
  /** why the height brush cannot work at t ('' if it can): in golf mode its square (radius r) must lie on your land */
  private heightWhy(t: { x: number; y: number }): string {
    if (!this.host.golfMode?.()) return ''; const r = this.heightR;
    return this.host.ownedLand?.([t.x - r, t.y - r, t.x + r, t.y - r, t.x + r, t.y + r, t.x - r, t.y + r]) === false ? 'Outside your land' : '';
  }
  /** one height dab at t: refused (with one toast per drag) when it is off your land or you cannot afford it; else journaled, charged and applied */
  private heightDabAt(t: { x: number; y: number }) {
    const f = this.host.courseHeight?.(), h = this.heighting; if (!f || !h) return;
    const why = this.heightWhy(t); if (why) { if (!h.broke) this.host.toast(why, 'warn'); h.broke = true; return; }
    const dab = this.heightDab(t), cost = this.dabCost(f, dab);
    if (cost > 0 && (this.host.money?.() ?? 0) < cost) { if (!h.broke) this.host.toast(`Not enough money: earthworks cost $${cost.toLocaleString()} a dab`, 'warn'); h.broke = true; return; }
    this.hj.touch(f, brushBox(dab)); const box = applyCourseHeightBrush(f, dab); if (!box) return;
    if (cost > 0) { this.host.spend?.(cost); this.tx!.spent += cost; }
    this.host.heightChanged?.(box);
  }
  /** height mode: the brush ring at the cursor (the inner dashed ring: where it works at full strength), green when it can go, red when not, and its label "Raise · r 6 · $120" */
  private drawHeight(v: PaintView) {
    const c = this.cursor, f = this.host.courseHeight?.(); if (!c || !f) return;
    const dab = this.heightDab(c), name = this.heightMode[0]!.toUpperCase() + this.heightMode.slice(1);
    const g = ghostStatus(this.heightWhy(c), this.dabCost(f, dab), this.host.money?.() ?? Infinity, `${name} · r ${this.heightR}`);
    drawGhostRing(v, c.x, c.y, this.heightR, this.heightR * 0.5, g.status);
    if (this.mouse) v.hint(this.mouse.mx, this.mouse.my, g.label, g.bad);
  }
  /** piece mode: a click lays the planned piece (all its areas, one undo step) when it can go and is affordable, else the toast says why; the layers under the core draw just below it (order), the core on its kind's layer */
  private placePiece() {
    if (this.cursor) this.piece = this.pieceAt(this.cursor); // re-plan: an undo since the last move may have changed the height (the price)
    const p = this.piece; if (!p) return;
    if (p.why) { this.host.toast(p.why, 'warn'); return; }
    if (p.cost > 0) {
      const treasury = this.host.money?.() ?? 0;
      if (treasury < p.cost) { this.host.toast(`Not enough money: this piece costs $${p.cost.toLocaleString()} (treasury: $${Math.round(treasury).toLocaleString()})`, 'warn'); return; }
    }
    this.begin('place ' + this.pieceArch);
    if (p.cost) { this.host.spend?.(p.cost); this.tx!.spent += p.cost; }
    const m = this.host.currentMonth?.() ?? 0, core = p.areas.find(a => a.kind), grid = this.courseGrid();
    for (const s of p.areas) {
      // on the course grid (T078) a golf surface's layer is laid into the cells (rounded as drawn) for the piece's hole; its collar layers
      // (fringe, first cut) are automatic now and are dropped; a cart path stays a painted area
      if (grid) {
        const gs = PaintTool.surfOf(s), sf = s.kind ?? surfaceOfTex(s.tex);
        if (gs) { const d = fillPolygon(grid, toXY(roundCorners(s.pts, s.radius)), gs, s.hole ?? pl0(p), plantMonth(this.plantKind, m), this.gridOpts(grid, gs, false)); this.gridApply(d); continue; }
        if (sf === 'fringe' || sf === 'firstCut') continue;
      }
      const id = this.nextId++;
      // the piece's core takes the remembered look of its surface (the brush style every area of that kind on the hole follows: texture, angle,
      // tone and border look), keeping its own corner radius: a placed piece and a brush stroke of the same surface match (the owner, 2026-10-24)
      const look = s.kind && this.brush[s.kind] ? (({ radius: _r, ...rest }) => rest)(this.brush[s.kind].style) : null;
      const a: PaintArea = { id, ...s, ...(look ?? {}), plantKind: this.plantKind, plantedMonth: m, ...(!s.kind && core?.kind ? { order: drawZ({ kind: core.kind, id }) } : {}) };
      this.areas.push(a); this.send(a, m);
    }
    this.applyHeightOps(p.pl.heightOps);
    // the pin goes to the piece's pin anchor (the engine's marker plan puts the hole's pin there); the dressing props are journaled with the step
    const pin = p.pl.props.find(q => q.kind === 'pin'); if (pin) this.pinHint = new Map([[p.pl.hole, { x: pin.x, y: pin.y }]]);
    const dress = piecePropsOf(p.pl.props); if (dress.length) this.host.placeProps(dress, this.plantSeed++);
    this.commit(); this.host.progress?.('piece'); this.piece = null; this.refreshPiece(); this.host.save();
  }
  /** piece mode: the planned piece as ghosts, bottom layer first (each in its surface's colour with its border band, the core dashed; red when it cannot go), the snap tick on the edge it joins, and its label */
  private drawPiece(v: PaintView) {
    const p = this.piece; if (!p) return;
    const status = p.why ? 'invalid' : 'valid';
    for (const a of p.areas) drawGhostPoly(v, a.pts, status, { fillColor: p.why ? undefined : rgba(TEX_COL.get(a.tex) ?? '#888888', 0.45), dashed: !!a.kind, borderWidthTiles: a.border > 0 ? BORDER_W[a.border]! : 0, borderColor: rgba(BTEX_COL.get(a.btex) ?? '#888888', 0.7) });
    const pl = p.pl;
    if (pl.snapPt && pl.snapNormal) drawGhostSnap(v, { x: pl.snapPt.x, y: pl.snapPt.y, kind: 'edge', nx: pl.snapNormal.x, ny: pl.snapNormal.y, halfSpan: 2 });
    const name = PIECE_BUTTONS.find(q => q.arch === this.pieceArch)?.name ?? 'Piece';
    const g = ghostStatus(p.why, p.cost, this.host.money?.() ?? Infinity, pl.snapped ? `${name} · joins hole ${pl.hole}` : `${name} · hole ${pl.hole}`);
    if (this.mouse) v.hint(this.mouse.mx, this.mouse.my, g.label, g.bad);
  }
  /** edits the current plant brush (radius, spacing, size range, sprites) and remembers it */
  setPlantSet(p: Partial<PlantSet>) {
    const k = this.plantBrush; this.plant[k] = clampPlant({ ...this.plant[k], ...p }, k);
    try { localStorage.setItem(PLANT_KEY, JSON.stringify(this.plant)); } catch { /* storage may be unavailable */ }
    this.host.emit();
  }
  /** the sprites the current plant brush picks from (its ids, or every sprite of the kind) */
  plantIds(): string[] { const s = this.plant[this.plantBrush], all = this.host.plantPool(this.plantBrush).map(x => x.id); return s.ids ? s.ids.filter(id => all.includes(id)) : all; }
  /** one plant dab at t: plant (or rub out) in the circle */
  private plantDab(t: { x: number; y: number }, erase: boolean) {
    const s = this.plant[this.plantBrush];
    const n = erase ? this.host.unplant(t.x, t.y, s.r) : this.host.plant(this.plantIds(), t.x, t.y, s.r, s.spacing, [s.lo, s.hi], this.plantSeed++);
    if (this.planting) this.planting.n += n;
  }
  /** drops the outline being drawn (its corners, the lasso and the press) and a stroke in progress (not applied); a handle drag in progress ends (its shape is kept, or reverted when it cannot be placed) */
  cancel() { if (this.drag) this.dragEnd(); this.pts = []; this.lasso = false; this.down = null; if (this.stroke) { this.stroke = null; this.commit(); } if (this.planting) { this.planting = null; this.commit(); } if (this.heighting) { this.heighting = null; this.commit(); } }

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
    if (this.mode === 'piece') { this.placePiece(); return; }
    if (this.mode === 'height') { this.begin(this.heightMode + ' ground'); this.heighting = { last: { x: t.x, y: t.y }, broke: false }; this.heightDabAt(t); this.host.emit(); return; }
    if (this.mode === 'brush') { this.strokeStart(t, alt); return; }
    if (this.mode === 'plant') { const erase = this.rubOut || alt; this.begin(erase ? 'rub out plants' : 'plant ' + this.plantBrush); this.planting = { erase, last: { x: t.x, y: t.y }, n: 0 }; this.plantDab(t, erase); this.host.emit(); return; }
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
    if (a) { this.begin('erase area'); this.remove(a.id); this.commit(); }
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
    if (this.mode === 'piece') { this.piece = t ? this.pieceAt(t) : null; return; }
    if (this.mode === 'height') { const h = this.heighting; if (h && t && Math.hypot(t.x - h.last.x, t.y - h.last.y) >= Math.max(0.5, this.heightR * 0.3)) { h.last = { x: t.x, y: t.y }; this.heightDabAt(t); } return; }
    if (this.mode === 'brush') {
      const s = this.stroke; if (!s || !t) return;
      if (s.grid) this.gridApply(paintStroke(s.grid.g, s.last.x, s.last.y, t.x, t.y, s.r, s.grid.s, this.brushHole, s.grid.month, s.grid.opts));
      else brushStroke(s.m, s.last.x, s.last.y, t.x, t.y, s.r, s.erase);
      s.last.x = t.x; s.last.y = t.y; s.dabs.push(t.x, t.y); return;
    }
    if (this.mode === 'plant') {
      // a dab every half radius along the drag (each dab only adds where the spacing allows, so going over a spot again fills it in)
      const pl = this.planting; if (!pl || !t) return;
      const step = Math.max(0.5, this.plant[this.plantBrush].r / 2), d = Math.hypot(t.x - pl.last.x, t.y - pl.last.y);
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
    if (this.mode === 'height') { if (this.heighting) { this.heighting = null; this.commit(); this.host.save(); } this.host.emit(); return; }
    if (this.mode === 'plant') { const pl = this.planting; this.planting = null; if (pl) this.commit(); if (pl && !pl.n && !pl.erase && !this.plantIds().length) this.host.toast('Pick at least one sprite for this brush', 'warn'); this.host.emit(); return; }
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
  if (this.course) this.style = { ...this.brush[this.brushKind].style };
  const why = checkArea(this.pts);
  if (why) { this.host.toast(why, 'warn'); if (fromLasso) this.cancel(); this.host.emit(); return; }
  // the Shape method on the course grid (T078): the outline's cells take the surface for the current hole (only the cells that change are charged)
  const grid = this.courseGrid(), gs = grid ? surfOfSurface(this.brushKind) : 0;
  if (grid && gs) {
    if (this.host.ownedLand && !this.host.ownedLand(this.pts)) { this.host.toast('Cannot paint outside owned course land: area must be fully inside owned parcels', 'warn'); if (fromLasso) this.cancel(); this.host.emit(); return; }
    this.begin('shape ' + this.brushKind);
    this.gridFill(grid, roundCorners(this.pts, this.style.radius), gs, this.brushHole);
    this.cancel(); this.commit(); this.host.save(); this.host.emit(); return;
  }
  let paid = 0;
  if (this.host.golfMode?.()) {
  if (this.host.ownedLand && !this.host.ownedLand(this.pts)) {
  this.host.toast('Cannot paint outside owned course land: area must be fully inside owned parcels', 'warn');
  if (fromLasso) this.cancel();
  this.host.emit();
  return;
  }
  const cost = Math.round(areaBuildCost(this.pts, this.style.tex, this.plantKind));
  if (cost > 0) {
  const treasury = this.host.money?.() ?? 0;
  if (treasury < cost) {
  this.host.toast(`Not enough money: painting this costs $${cost.toLocaleString()} (treasury: $${Math.round(treasury).toLocaleString()})`, 'warn');
  if (fromLasso) this.cancel();
  this.host.emit();
  return;
  }
  paid = cost;
  }
  }
  this.begin(this.course ? 'shape ' + this.brushKind : 'paint area');
  if (paid) { this.host.spend?.(paid); this.tx!.spent += paid; }
  const m = this.host.currentMonth?.() ?? 0;
  const a: PaintArea = { id: this.nextId++, pts: this.pts.slice(), ...this.style, plantKind: this.plantKind, plantedMonth: m, ...(this.course ? { hole: this.brushHole, kind: this.brushKind } : {}) };
  this.areas.push(a); this.send(a, m); this.cancel(); this.commit();
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
  private hole(): HolePreset {
    const h = this.holeSlot ? STORED[this.holeSlot - 1] : null, seed = h ? -this.holeSlot : this.holeSeed;
    if (this.holeC?.seed !== seed) this.holeC = { seed, p: h ? storedHolePreset(h) : holePreset(this.holeSeed) };
    return this.holeC.p;
  }
  /** the key of the hole placed next (the ghost is rebuilt when it changes) */
  private get holeKey() { return this.holeSlot ? -this.holeSlot : this.holeSeed; }

  /** lays the hole with its tee at tile t (rounded), turned by holeDir: its areas are added and sent in order, its props go to the host; a hole with a corner off 1..MAP-1 is refused */
  private placeHoleAt(t: { x: number; y: number }) {
    const p = placeHole(this.hole(), Math.round(t.x), Math.round(t.y), this.holeDir);
    for (const a of p.areas) for (const v of a.pts) if (!(v >= 1 && v <= MAP - 1)) { this.host.toast('The hole does not fit here', 'warn'); return; }
    // the Course tool: the hole is the current one, or the next free number when the current one has areas
    const hole = !this.course ? 0 : this.usedHoles().has(this.brushHole) ? this.nextFreeHole() : this.brushHole;
    if (this.course && !hole) { this.host.toast(`All ${HOLE_COUNT} holes have areas: erase one first`, 'warn'); return; }
    this.begin(this.holeSlot ? `preset ${this.holeSlot}` : 'golf hole');
    const grid = this.courseGrid(), own = this.host.ownedAt, month = plantMonth(this.plantKind, this.host.currentMonth?.());
    for (const a of p.areas) {
      // on the course grid (T078) the preset's golf surfaces are laid into the cells in its paint order (a later one over an earlier one, owned
      // land only); its fringe and first-cut bands are automatic collars now
      if (grid) {
        const gs = PaintTool.surfOf(a), sf = a.kind ?? surfaceOfTex(a.tex);
        if (gs) { this.gridApply(fillPolygon(grid, toXY(roundCorners(a.pts, a.radius)), gs, hole, month, own ? { allow: i => { const c = cellCentre(grid, i); return own(c.x, c.y); } } : {})); continue; }
        if (sf === 'fringe' || sf === 'firstCut') continue;
      }
      const k = a.kind ?? kindOfTex(a.tex); const b: PaintArea = { id: this.nextId++, ...a, ...(hole ? { hole, ...(k ? { kind: k } : {}) } : {}) }; this.areas.push(b); this.send(b);
    }
    this.host.save();
    // a golf game's holes have their own pin: the preset's flag only says where it goes
    const flag = hole && this.host.golfMode?.() ? p.props.find(q => q.kind === 'flag') : undefined;
    if (flag) this.pinHint = new Map([[hole, { x: flag.x, y: flag.y }]]);
    const n = this.host.placeProps(flag ? p.props.filter(q => q.kind !== 'flag') : p.props, this.holeSeed);
    this.commit();
    this.host.toast(`${hole ? `Hole ${hole}` : 'Golf hole'} placed: ${p.areas.length} painted areas, ${n} props`);
    if (hole) this.brushHole = hole;
    if (!this.holeSlot) this.holeSeed++;
    this.selected = 0; this.hoverH = null; this.host.emit();
  }

  /** brush mode: a press starts a stroke (Alt or Rub out erases): the mask holds this hole's cells of the kind (their outlines filled), and one dab lays at the press */
  private strokeStart(t: { x: number; y: number }, alt: boolean) {
    const k = this.brushKind, h = this.brushHole, r = this.brush[k].r, m: Mask = new Set(), erase = this.rubOut || alt;
    // on the course grid (T078) every dab paints the cells (a cart path still paints areas)
    const g = this.courseGrid(), s = g ? surfOfSurface(k) : 0;
    if (g && s) {
      this.begin((erase ? 'rub out ' : 'brush ') + k);
      const grid = { g, s, month: plantMonth(this.plantKind, this.host.currentMonth?.()), opts: this.gridOpts(g, s, erase) };
      this.stroke = { m, m0: m, r, erase, last: { x: t.x, y: t.y }, dabs: [t.x, t.y], grid };
      this.gridApply(paintDisc(g, t.x, t.y, r, s, h, grid.month, grid.opts));
      this.host.emit(); return;
    }
    for (const a of this.areas) if (a.hole === h && a.kind === k) fillPoly(m, this.outlineOf(a));
    const m0: Mask = new Set(m);
    dab(m, t.x, t.y, r, erase);
    this.begin((erase ? 'rub out ' : 'brush ') + k);
    this.stroke = { m, m0, r, erase, last: { x: t.x, y: t.y }, dabs: [t.x, t.y] };
    this.host.emit();
  }

  /** brush mode: a release ends the stroke: this hole's areas of the kind are replaced by one area per outline of the mask (in the preset's style; a stroke that erased everything leaves none); an outline wider than MAX_SIDE is skipped, with one toast */
  private strokeEnd() {
    const s = this.stroke; if (!s) return;
    this.stroke = null;
    if (s.grid) { this.commit(); this.host.save(); this.host.emit(); return; } // the grid's cells changed dab by dab (one undo step)
    // a stroke that changed no cell (rubbing out where nothing is) keeps the areas as they are (re-tracing would re-smooth them)
    if (s.m.size === s.m0.size) { let same = true; for (const c of s.m) if (!s.m0.has(c)) { same = false; break; } if (same) { this.commit(); this.host.emit(); return; } }
    const k = this.brushKind, h = this.brushHole, style = this.brush[k].style;
    let order: number | undefined; // the draw order the player gave the areas this stroke replaces (the highest), kept by the new ones
    for (let i = this.areas.length - 1; i >= 0; i--) { const a = this.areas[i]!; if (a.hole === h && a.kind === k) { if (a.order !== undefined) order = Math.max(order ?? -Infinity, a.order); this.areas.splice(i, 1); this.host.setLotGround('paint:' + a.id, null); } }
    let big = false;
    for (const o of traceMask(s.m)) {
      const b = polyBox(o);
      if (b[2] - b[0] > MAX_SIDE || b[3] - b[1] > MAX_SIDE) { big = true; continue; }
      const a: PaintArea = { id: this.nextId++, pts: o, ...style, hole: h, kind: k, ...(order !== undefined ? { order } : {}) };
      this.areas.push(a); this.send(a);
    }
    if (big) this.host.toast('Part of the stroke is too big for one area: paint it in two parts', 'warn');
    this.commit();
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
    const ctx = v.ctx, d = v.dpr, s = this.plant[this.plantBrush], erase = this.planting ? this.planting.erase : this.rubOut;
    const col = erase ? '#f87171' : PLANT_KINDS.find(k => k.kind === this.plantBrush)!.col;
    v.setIso(ctx); ctx.beginPath(); ctx.arc(c.x, c.y, s.r, 0, Math.PI * 2); ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = rgba(col, 0.18); ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 1.5 * d; ctx.stroke();
    if (!erase) { v.setIso(ctx); ctx.beginPath(); ctx.arc(c.x, c.y, Math.min(s.r, s.spacing / 2), 0, Math.PI * 2); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.setLineDash([3 * d, 3 * d]); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = d; ctx.stroke(); ctx.setLineDash([]); }
  }

  /** the ghost of the hole at the cursor (hole mode): every area's outline dashed white, the green, fairway, water and sand filled, and a dot at the flag; no props */
  private drawHolePreview(v: PaintView) {
    const c = this.cursor; if (!c) return;
    const ctx = v.ctx, d = v.dpr, x = Math.round(c.x), y = Math.round(c.y);
    let g = this.ghost;
    if (!g || g.x !== x || g.y !== y || g.dir !== this.holeDir || g.seed !== this.holeKey) {
      const p = placeHole(this.hole(), x, y, this.holeDir);
      this.ghost = g = { x, y, dir: this.holeDir, seed: this.holeKey, p, outs: p.areas.map(a => roundCorners(a.pts, a.radius)) };
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
    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); this.undo(); return true; }
      if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); this.redo(); return true; }
      if (this.selected && (e.code === 'BracketRight' || e.code === 'BracketLeft')) { e.preventDefault(); const f = e.code === 'BracketRight'; this.moveLayer(e.shiftKey ? (f ? 'front' : 'back') : f ? 1 : -1); return true; }
      return false;
    }
    if (this.selected && (e.key === 'PageUp' || e.key === 'PageDown')) {
      e.preventDefault(); const f = e.key === 'PageUp'; this.moveLayer(e.shiftKey ? (f ? 'front' : 'back') : f ? 1 : -1); return true;
    }
    if (this.mode === 'piece') {
      if (e.key === 'r' || e.key === 'R') { this.setPieceOpts({ angle: this.pieceAngle + (e.shiftKey ? -15 : 15) }); return true; }
      if (e.key === ']' || e.key === '[') { this.setPieceOpts({ scale: this.pieceScale + (e.key === ']' ? 0.25 : -0.25) }); return true; }
      if (e.key === 'Escape') { this.setBrush(this.brushKind); return true; }
    }
    if (this.course && e.key >= '1' && e.key <= '9') {
      const b = BRUSH_PRESETS[+e.key - 1]; if (!b) return false;
      if (this.mode === 'draw') this.setShape(b.kind); else this.setBrush(b.kind);
      return true;
    }
    if (this.course && e.key === 'Escape' && (this.mode === 'hole' || this.mode === 'plant' || (this.mode === 'draw' && !this.pts.length && !this.selected))) { this.setBrush(this.brushKind); return true; }
    switch (e.key) {
      case 'Enter': if (!this.pts.length) return false; this.finish(false); break;
      case 'Backspace': if (this.mode !== 'draw' || !this.pts.length) return false; this.pts.length -= 2; break;
      // Esc: out of a mode back to Draw; in Draw, the outline, then the selection (Pick and Erase with nothing picked go back to Draw too)
      case 'Escape': if (this.mode === 'hole' || this.mode === 'brush' || this.mode === 'plant') { this.setMode('draw'); return true; } if (this.pts.length) this.cancel(); else if (this.selected) { this.selected = 0; this.hoverH = null; } else if (!this.course && (this.mode === 'pick' || this.mode === 'erase')) { this.setMode('draw'); return true; } else return false; break;
      // Tab (Paint): Draw, Pick and Erase in turn
      case 'Tab': if (this.course || !(this.mode === 'draw' || this.mode === 'pick' || this.mode === 'erase')) return false; e.preventDefault(); this.setMode(this.mode === 'draw' ? 'pick' : this.mode === 'pick' ? 'erase' : 'draw'); return true;
      case 'r': case 'R': if (this.mode !== 'hole') return false; this.holeDir = ((this.holeDir + 1) % 4) as 0 | 1 | 2 | 3; break;
      case '[': case ']':
        if (this.mode === 'height') { this.setHeight({ r: this.heightR + (e.key === ']' ? 1 : -1) }); return true; }
        if (this.mode === 'plant') { this.setPlantSet({ r: this.plant[this.plantBrush].r + (e.key === ']' ? 1 : -1) }); return true; }
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
    if (this.mode === 'piece') { this.drawPiece(v); return; }
    if (this.mode === 'height') { this.drawHeight(v); return; }
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

  /** why outline P cannot be placed ('' if it can), as the commit checks it: the shape (checkArea), then in golf mode the owned course land */
  private outlineWhy(P: number[]): string {
    return checkArea(P) || (this.host.golfMode?.() && this.host.ownedLand && !this.host.ownedLand(P) ? 'Cannot paint outside owned course land' : '');
  }

  /** the outline being drawn: its fill, border band, dashed edge, crossing edges, corners, and why it cannot be placed; or the snapped cursor before the first corner */
  private drawOutline(v: PaintView) {
    const ctx = v.ctx, d = v.dpr;
    const P = this.outline();
    if (P.length >= 4) {
      const why = P.length >= 6 ? this.outlineWhy(P) : '', bad = why !== '';
      if (P.length >= 6) {
        // the shared ghost (T024): texture-tinted fill, the collar band clipped inside, the dashed wireframe; red with the reason when it cannot be placed
        drawGhostPoly(v, P, bad ? 'invalid' : 'valid', { fillColor: bad ? undefined : rgba(TEX_COL.get(this.style.tex) ?? '#888888', 0.5), borderWidthTiles: this.style.border > 0 ? BORDER_W[this.style.border]! : 0, borderColor: rgba(BTEX_COL.get(this.style.btex) ?? '#888888', 0.75) });
      } else {
        // two corners: the first edge, dashed
        v.setIso(ctx); ctx.beginPath(); trace(ctx, P, false); ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.strokeStyle = 'rgba(255,230,150,0.9)'; ctx.lineWidth = 1.5 * d; ctx.setLineDash([6 * d, 4 * d]); ctx.stroke(); ctx.setLineDash([]);
      }
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
    drawGhostPoly(v, P, 'invalid');
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
    if (g.k === 'edge' && n >= MAX_PTS) { this.host.toast('Too many corners', 'warn'); return; }
    this.begin('reshape area');
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
    this.commit();
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
