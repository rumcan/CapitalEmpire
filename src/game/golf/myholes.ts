// T256 (#743; the owner, 2026-10-29: "that way you can save a hole with all the textures associated with it"): My holes, the player's own
// saved holes, the counterpart to the studio's StoredHole (golf/holepreset.ts: a name, areas and props in the local frame with the tee at the
// origin). A saved hole keeps, relative to its tee and turned so it faces +x (its facing kept to turn it back):
// - its cells (every cell of the hole on the course grid: its surfaces, whatever painted them);
// - its plan (tees, pin, bends, widths: ext/hole-plan HolePlan), so Edit hole works on it once placed;
// - its ground height edits (ext/course-height samples that are not level);
// - its looks (golf/looks.ts LookSet), and optionally its frame trees (StoredHole's props: sprite, place, scale).
// They live in the game save (GolfSave.myHoles) and in the browser (localStorage, guarded), so they can be reused across games. Pure: no DOM
// (the browser's storage is reached through a guarded global), importable from node tests. Units: tiles of 2 m, cells of 1 m (0.5 tile),
// height samples every CH_STEP tiles, metres.
import { CELL_T, N_SURF, SURF, type Grid } from '../ext/course-grid';
import { CH_SIZE, CH_STEP, clampCourseHeightM, type CourseHeightField } from '../ext/course-height';
import { decodePlan, encodePlan, type HolePlan } from '../ext/hole-plan';
import { normalizeBook, type LookSet } from './looks';
import type { StoredHole } from './holepreset';

/** a saved hole (the player's "My holes"): StoredHole's name and props (its frame trees; areas stay empty: the cells hold its surfaces), with
 *  v, facing: the quarter turns it faced when saved ((x, y) -> (-y, x) a turn; 0 faces +x), cells: x y surface triples (cell offsets from
 *  the tee cell, turned to face +x), plan: its plan's save tuple in the same frame (tiles from the tee cell's centre), heights: i j metres
 *  triples (height sample offsets from the tee's sample, turned), looks: its looks, par and m: its par and length when saved */
export interface MyHole extends StoredHole { v: 1; facing: 0 | 1 | 2 | 3; cells: number[]; plan?: unknown; heights?: number[]; looks?: LookSet; par?: number; m?: number }

/** the most My holes kept (the oldest goes first) */
export const MY_HOLES_MAX = 24;
/** the browser's key for My holes (across games) */
const KEY = 'capitalempire.myHoles';

/** (x, y) turned by q quarter turns ((x, y) -> (-y, x) each; q taken mod 4) */
export function turn(x: number, y: number, q: number): [number, number] {
  let a = x, b = y;
  for (let k = 0; k < ((q % 4) + 4) % 4; k++) { const t = a; a = -b; b = t; }
  return [a + 0, b + 0];
}
/** the quarter turns a heading (tile vector dx, dy) is nearest to (0 +x, 1 +y, 2 -x, 3 -y) */
export function facingOf(dx: number, dy: number): 0 | 1 | 2 | 3 {
  if (!dx && !dy) return 0;
  return ((Math.round(Math.atan2(dy, dx) / (Math.PI / 2)) % 4) + 4) % 4 as 0 | 1 | 2 | 3;
}

/** a plan moved: its points turned by q about (ox, oy) and then moved by (mx, my), its green turned with it, its hole number n */
function movePlan(p: HolePlan, ox: number, oy: number, q: number, mx: number, my: number, n: number): HolePlan {
  const m = (pt: { x: number; y: number }) => { const [a, b] = turn(pt.x - ox, pt.y - oy, q); return { x: a + mx, y: b + my }; };
  return { ...p, hole: n, tee: m(p.tee), green: m(p.green), bends: p.bends.map(m), widths: p.widths.map(w => ({ ...w })), greenTurn: (((p.greenTurn + 90 * q) % 360) + 360) % 360 };
}

/** what saving hole n needs: the grid, its plan (null: painted by hand), its tee and pin (tiles), the height field, its looks, its frame
 *  trees (sprite id, tile place, flip, scale), its name, par and length */
export interface CaptureCtx { grid: Grid; plan: HolePlan | null; tee: { x: number; y: number }; pin: { x: number; y: number } | null; field?: CourseHeightField | null; looks?: LookSet | null; frame?: readonly { id: string; x: number; y: number; flip: boolean; scale: number }[]; name: string; par?: number; m?: number }
/** hole n as a My holes entry (null when it has no cell) */
export function captureHole(n: number, c: CaptureCtx): MyHole | null {
  const g = c.grid, tcx = Math.floor((c.tee.x - g.x0) / CELL_T), tcy = Math.floor((c.tee.y - g.y0) / CELL_T);
  const to = c.pin ?? c.plan?.green ?? null, facing = to ? facingOf(to.x - c.tee.x, to.y - c.tee.y) : 0, back = (4 - facing) % 4;
  const cells: number[] = [];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < g.hole.length; i++) {
    if (g.hole[i] !== n || g.surf[i] === SURF.none) continue;
    const cx = i % g.w, cy = (i - cx) / g.w, [a, b] = turn(cx - tcx, cy - tcy, back);
    cells.push(a, b, g.surf[i]!);
    x0 = Math.min(x0, cx); y0 = Math.min(y0, cy); x1 = Math.max(x1, cx); y1 = Math.max(y1, cy);
  }
  if (!cells.length) return null;
  // the tee cell's centre (tiles): the plan's points, the trees and the heights are kept from it
  const ox = g.x0 + (tcx + 0.5) * CELL_T, oy = g.y0 + (tcy + 0.5) * CELL_T;
  const plan = c.plan ? encodePlan(movePlan(c.plan, ox, oy, back, 0, 0, 1)) : undefined;
  // the height samples over the hole's box (and a margin: the banks round it) that are not level
  const heights: number[] = [], f = c.field;
  if (f) {
    const pad = 4, bx0 = g.x0 + x0 * CELL_T - pad, by0 = g.y0 + y0 * CELL_T - pad, bx1 = g.x0 + (x1 + 1) * CELL_T + pad, by1 = g.y0 + (y1 + 1) * CELL_T + pad;
    const ti = Math.round(ox / CH_STEP), tj = Math.round(oy / CH_STEP);
    for (let j = Math.max(0, Math.floor(by0 / CH_STEP)); j <= Math.min(CH_SIZE - 1, Math.ceil(by1 / CH_STEP)); j++) for (let i = Math.max(0, Math.floor(bx0 / CH_STEP)); i <= Math.min(CH_SIZE - 1, Math.ceil(bx1 / CH_STEP)); i++) {
      const h = f.data[j * CH_SIZE + i]!; if (Math.abs(h) < 0.005) continue;
      const [a, b] = turn(i - ti, j - tj, back); heights.push(a, b, Math.round(h * 1000) / 1000);
    }
  }
  const props = (c.frame ?? []).map(t => { const [a, b] = turn(t.x - ox, t.y - oy, back); return { id: t.id, x: Math.round(a * 100) / 100, y: Math.round(b * 100) / 100, flip: t.flip, scale: t.scale }; });
  return { v: 1, name: c.name.trim().slice(0, 40) || `Hole ${n}`, areas: [], props, facing, cells, ...(plan ? { plan } : {}), ...(heights.length ? { heights } : {}), ...(c.looks ? { looks: JSON.parse(JSON.stringify(c.looks)) as LookSet } : {}), ...(c.par ? { par: c.par } : {}), ...(c.m ? { m: c.m } : {}) };
}

/** a saved hole placed with its tee cell at grid cell (tcx, tcy), turned q quarter turns from its saved frame (q = facing: as it was saved),
 *  as hole n: its cells (grid cell indices with their surfaces; cells off the grid are left out), its plan, its height samples (sample index,
 *  metres) and its frame trees (tiles) */
export interface Placed { cells: { i: number; s: number }[]; plan: HolePlan | null; heights: { k: number; h: number }[]; props: { id: string; x: number; y: number; flip: boolean; scale: number }[]; box: [number, number, number, number] }
export function placeMyHole(h: MyHole, g: Grid, tcx: number, tcy: number, q: number, n: number): Placed {
  const cells: { i: number; s: number }[] = [], ox = g.x0 + (tcx + 0.5) * CELL_T, oy = g.y0 + (tcy + 0.5) * CELL_T;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let k = 0; k + 2 < h.cells.length; k += 3) {
    const [a, b] = turn(h.cells[k]!, h.cells[k + 1]!, q), cx = tcx + a, cy = tcy + b;
    if (cx < 0 || cy < 0 || cx >= g.w || cy >= g.h) continue;
    cells.push({ i: cy * g.w + cx, s: h.cells[k + 2]! });
    x0 = Math.min(x0, cx); y0 = Math.min(y0, cy); x1 = Math.max(x1, cx); y1 = Math.max(y1, cy);
  }
  const raw = h.plan ? decodePlan(h.plan) : null, plan = raw ? movePlan(raw, 0, 0, q, ox, oy, n) : null;
  const heights: { k: number; h: number }[] = [], ti = Math.round(ox / CH_STEP), tj = Math.round(oy / CH_STEP);
  for (let k = 0; h.heights && k + 2 < h.heights.length; k += 3) {
    const [a, b] = turn(h.heights[k]!, h.heights[k + 1]!, q), i = ti + a, j = tj + b;
    if (i >= 0 && j >= 0 && i < CH_SIZE && j < CH_SIZE) heights.push({ k: j * CH_SIZE + i, h: clampCourseHeightM(h.heights[k + 2]!) });
  }
  const props = h.props.map(t => { const [a, b] = turn(t.x, t.y, q); return { ...t, x: a + ox, y: b + oy }; });
  return { cells, plan, heights, props, box: cells.length ? [g.x0 + x0 * CELL_T, g.y0 + y0 * CELL_T, g.x0 + (x1 + 1) * CELL_T, g.y0 + (y1 + 1) * CELL_T] : [ox, oy, ox, oy] };
}

/** a saved hole from a save or the browser (null when it is not one: no cells, a bad number) */
export function normalizeMyHole(raw: unknown): MyHole | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<MyHole>, cells = Array.isArray(r.cells) ? r.cells : null;
  if (!cells || !cells.length || cells.length % 3 || !cells.every((v, k) => Number.isInteger(v) && (k % 3 !== 2 || (v > 0 && v < N_SURF)))) return null;
  const heights = Array.isArray(r.heights) && r.heights.length % 3 === 0 && r.heights.every(v => Number.isFinite(v)) ? r.heights.slice() : undefined;
  const props = (Array.isArray(r.props) ? r.props : []).filter(p => p && typeof p.id === 'string' && Number.isFinite(p.x) && Number.isFinite(p.y)).map(p => ({ id: p.id, x: p.x, y: p.y, flip: !!p.flip, scale: Number.isFinite(p.scale) ? p.scale : 1 }));
  const looks = normalizeBook({ h1: r.looks })?.h1;
  const facing = (Number.isInteger(r.facing) ? (((r.facing! % 4) + 4) % 4) : 0) as 0 | 1 | 2 | 3;
  return { v: 1, name: typeof r.name === 'string' && r.name.trim() ? r.name.trim().slice(0, 40) : 'My hole', areas: [], props, facing, cells: cells.slice(), ...(r.plan !== undefined && decodePlan(r.plan) ? { plan: r.plan } : {}), ...(heights?.length ? { heights } : {}), ...(looks ? { looks } : {}), ...(Number.isFinite(r.par) ? { par: r.par } : {}), ...(Number.isFinite(r.m) ? { m: r.m } : {}) };
}
/** My holes from a save (the bad ones left out, at most MY_HOLES_MAX) */
export function normalizeMyHoles(raw: unknown): MyHole[] {
  return Array.isArray(raw) ? raw.map(normalizeMyHole).filter((h): h is MyHole => !!h).slice(-MY_HOLES_MAX) : [];
}
/** the same hole (by name and cells): a game's and the browser's lists join without doubles */
export const sameHole = (a: MyHole, b: MyHole) => a.name === b.name && a.cells.length === b.cells.length && a.cells.every((v, k) => v === b.cells[k]);
/** two lists joined: a's first, then b's not in a (at most MY_HOLES_MAX, the newest kept) */
export function joinHoles(a: readonly MyHole[], b: readonly MyHole[]): MyHole[] { return [...a, ...b.filter(h => !a.some(q => sameHole(q, h)))].slice(-MY_HOLES_MAX); }

/** the browser's storage, or null (none, or it throws) */
function store(): Storage | null { try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; } }
/** My holes kept in the browser (across games; none: empty) */
export function loadBrowserHoles(): MyHole[] { try { return normalizeMyHoles(JSON.parse(store()?.getItem(KEY) ?? '[]')); } catch { return []; } }
/** keeps My holes in the browser (a full or missing storage is skipped) */
export function saveBrowserHoles(list: readonly MyHole[]): void { try { store()?.setItem(KEY, JSON.stringify(list.slice(-MY_HOLES_MAX))); } catch { /* storage may be full or unavailable */ } }
