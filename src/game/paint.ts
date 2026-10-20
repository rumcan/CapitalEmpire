// The Paint tool's data model (docs/PAINT-TOOL.md): pure helpers, no DOM, no canvas, importable from node tests.
import { MAP } from './iso';

/** the fill textures a painted area can take (the ground textures the roads and sidewalks already use) */
export type PaintTex = 'paving' | 'slabs' | 'pad' | 'asphalt' | 'asphaltDark' | 'asphaltWorn' | 'roadgravel' | 'gravel' | 'dirt' | 'rockyDirt' | 'rockyDirtAlt' | 'field' | 'grass';
/** a border's texture: any fill texture, or the kerb */
export type BorderTex = PaintTex | 'kerb';
/** the border width: 0 none, 1 small, 2 medium, 3 large (BORDER_W, in tiles) */
export type BorderSize = 0 | 1 | 2 | 3;
/** a painted ground area: a closed polygon of tiles, filled with one texture, with an optional border band inside its edge */
export interface PaintArea { id: number; pts: number[]; tex: PaintTex; scale: number; angle: number; border: BorderSize; btex: BorderTex }
/** the save tuple: [tex, scale, angle, border, btex, pts] */
export type PaintTuple = [string, number, number, number, string, number[]];
/** a tile box [x0, y0, x1, y1] */
export type PaintBox = [number, number, number, number];

/** the fill textures in the order the Paint panel shows them, with their short labels and preview colours */
export const PAINT_TEXES: { id: PaintTex; name: string; col: string }[] = [
  { id: 'paving', name: 'Pavers', col: '#a89c8c' },
  { id: 'slabs', name: 'Slabs', col: '#d8c8a8' },
  { id: 'pad', name: 'Concrete', col: '#b9ada0' },
  { id: 'asphalt', name: 'Asphalt', col: '#30333f' },
  { id: 'asphaltDark', name: 'Dark asphalt', col: '#22242e' },
  { id: 'asphaltWorn', name: 'Worn asphalt', col: '#4a4a4c' },
  { id: 'roadgravel', name: 'Road gravel', col: '#62574a' },
  { id: 'gravel', name: 'Gravel', col: '#5b5752' },
  { id: 'dirt', name: 'Dirt', col: '#56402f' },
  { id: 'rockyDirt', name: 'Rocky dirt', col: '#78452b' },
  { id: 'rockyDirtAlt', name: 'Rocky dirt alt', col: '#70432d' },
  { id: 'field', name: 'Field', col: '#5a4a2e' },
  { id: 'grass', name: 'Grass', col: '#4f6b2e' },
];
/** the border textures: the kerb first, then every fill texture */
export const BORDER_TEXES: { id: BorderTex; name: string; col: string }[] = [{ id: 'kerb', name: 'Kerb', col: '#f0dfbe' }, ...PAINT_TEXES];
/** the border width in tiles, by BorderSize */
export const BORDER_W = [0, 0.25, 0.5, 1];
/** the most corners an area may have */
export const MAX_PTS = 200;
/** the largest bounding box side in tiles (256 tiles = 512 m) */
export const MAX_SIDE = 256;
/** the smallest area in tiles² */
export const MIN_AREA = 1;
/** the texture scale range (1 = the textures' native size) */
export const SCALE_MIN = 0.25, SCALE_MAX = 4;
/** the style a new area starts with */
export const DEFAULT_STYLE: Omit<PaintArea, 'id' | 'pts'> = { tex: 'paving', scale: 1, angle: 0, border: 0, btex: 'kerb' };

const TEX_IDS = new Set<string>(PAINT_TEXES.map(t => t.id));
const BTEX_IDS = new Set<string>(BORDER_TEXES.map(t => t.id));

/** the signed shoelace area in tiles² (positive when the outline runs counter-clockwise on the map's axes) */
export function polyArea(pts: number[]): number {
  const n = pts.length >> 1; let s = 0;
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; s += pts[2 * i] * pts[2 * j + 1] - pts[2 * j] * pts[2 * i + 1]; }
  return s / 2;
}

/** the floored and ceiled tile box of a polygon (as quadBox in ground-protocol.ts) */
export function polyBox(pts: number[]): PaintBox {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let k = 0; k + 1 < pts.length; k += 2) { x0 = Math.min(x0, pts[k]); y0 = Math.min(y0, pts[k + 1]); x1 = Math.max(x1, pts[k]); y1 = Math.max(y1, pts[k + 1]); }
  return [Math.floor(x0), Math.floor(y0), Math.ceil(x1), Math.ceil(y1)];
}

const orient = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) => (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);

/** true when segment a-b and segment c-d properly cross (touching at an end does not count; collinear overlap does) */
function segCross(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number): boolean {
  const o1 = orient(ax, ay, bx, by, cx, cy), o2 = orient(ax, ay, bx, by, dx, dy), o3 = orient(cx, cy, dx, dy, ax, ay), o4 = orient(cx, cy, dx, dy, bx, by);
  if (o1 * o2 < 0 && o3 * o4 < 0) return true;
  if (o1 === 0 && o2 === 0 && o3 === 0 && o4 === 0) {
    const ox = Math.min(Math.max(ax, bx), Math.max(cx, dx)) - Math.max(Math.min(ax, bx), Math.min(cx, dx));
    const oy = Math.min(Math.max(ay, by), Math.max(cy, dy)) - Math.max(Math.min(ay, by), Math.min(cy, dy));
    return ox > 0 || oy > 0;
  }
  return false;
}

/** the indices of the edges (edge i runs from point i to point i+1) that cross a non-adjacent edge; empty for a simple outline */
export function crossings(pts: number[]): number[] {
  const n = pts.length >> 1, hit = new Uint8Array(n);
  for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
    if (i === 0 && j === n - 1) continue; // edge n-1 and edge 0 share point 0
    const i1 = (i + 1) % n, j1 = (j + 1) % n;
    if (segCross(pts[2 * i], pts[2 * i + 1], pts[2 * i1], pts[2 * i1 + 1], pts[2 * j], pts[2 * j + 1], pts[2 * j1], pts[2 * j1 + 1])) { hit[i] = 1; hit[j] = 1; }
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (hit[i]) out.push(i);
  return out;
}

/** '' when the outline can be placed as an area, else the reason (the Paint panel shows it beside the cursor) */
export function checkArea(pts: number[]): string {
  const n = pts.length >> 1;
  if (n < 3) return 'Needs 3 corners';
  if (n > MAX_PTS) return 'Too many corners';
  for (let k = 0; k < 2 * n; k++) if (!(pts[k] >= 0 && pts[k] <= MAP)) return 'Off the map';
  const b = polyBox(pts);
  if (b[2] - b[0] > MAX_SIDE || b[3] - b[1] > MAX_SIDE) return 'Too big (512 m max)';
  if (crossings(pts).length) return 'Edges cross';
  if (Math.abs(polyArea(pts)) < MIN_AREA) return 'Too small';
  return '';
}

/** a point rounded to whole tiles (grid) or to quarter tiles */
export function snapPt(x: number, y: number, grid: boolean): { x: number; y: number } {
  const q = grid ? 1 : 4;
  return { x: Math.round(x * q) / q + 0, y: Math.round(y * q) / q + 0 };
}

/** Douglas–Peucker on an open x,y polyline (both ends kept), then consecutive duplicate points dropped */
export function simplify(pts: number[], tol = 0.3): number[] {
  const n = pts.length >> 1;
  if (n === 0) return [];
  const keep = new Uint8Array(n); keep[0] = 1; keep[n - 1] = 1;
  const stack: number[] = [0, n - 1];
  while (stack.length) {
    const b = stack.pop()!, a = stack.pop()!;
    if (b - a < 2) continue;
    const ax = pts[2 * a], ay = pts[2 * a + 1], bx = pts[2 * b], by = pts[2 * b + 1];
    const len = Math.hypot(bx - ax, by - ay);
    let worst = -1, far = -1;
    for (let i = a + 1; i < b; i++) {
      const px = pts[2 * i], py = pts[2 * i + 1];
      const d = len > 0 ? Math.abs((bx - ax) * (py - ay) - (by - ay) * (px - ax)) / len : Math.hypot(px - ax, py - ay);
      if (d > worst) { worst = d; far = i; }
    }
    if (worst > tol) { keep[far] = 1; stack.push(a, far, far, b); }
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    if (!keep[i]) continue;
    const x = pts[2 * i], y = pts[2 * i + 1], m = out.length;
    if (m && out[m - 2] === x && out[m - 1] === y) continue;
    out.push(x, y);
  }
  return out;
}

/** even-odd point in polygon (a concave notch is outside) */
export function insidePoly(pts: number[], x: number, y: number): boolean {
  const n = pts.length >> 1; let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = pts[2 * i], yi = pts[2 * i + 1], xj = pts[2 * j], yj = pts[2 * j + 1];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** the topmost area (highest id) that contains the point, or null */
export function areaAt(areas: PaintArea[], x: number, y: number): PaintArea | null {
  let best: PaintArea | null = null;
  for (const a of areas) if ((!best || a.id > best.id) && insidePoly(a.pts, x, y)) best = a;
  return best;
}

/** an angle in [-90, 90] is kept as it is (90 stays 90, -90 stays -90); any other angle wraps by 180 (120 → -60, -100 → 80) */
function wrapAngle(a: number): number { return a >= -90 && a <= 90 ? a : ((((a + 90) % 180) + 180) % 180) - 90; }

const fin = (v: number, d: number) => Number.isFinite(v) ? v : d;

/** a copy of a style (or a whole area) with the scale, angle and border clamped and the textures checked (unknown → paving, kerb) */
export function clampStyle<T extends Omit<PaintArea, 'id' | 'pts'>>(s: T): T {
  return {
    ...s,
    tex: TEX_IDS.has(s.tex) ? s.tex : 'paving',
    scale: Math.min(SCALE_MAX, Math.max(SCALE_MIN, fin(s.scale, 1))),
    angle: wrapAngle(fin(s.angle, 0)),
    border: Math.min(3, Math.max(0, Math.round(fin(s.border, 0)))) as BorderSize,
    btex: BTEX_IDS.has(s.btex) ? s.btex : 'kerb',
  };
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** a painted area as its save tuple (scale and angle to 3 decimals) */
export function toTuple(a: PaintArea): PaintTuple { return [a.tex, r3(a.scale), r3(a.angle), a.border, a.btex, a.pts.slice()]; }

/** the areas from save tuples: a tuple whose outline fails checkArea is skipped; ids 1..n over the kept ones, styles clamped */
export function fromTuples(ts: PaintTuple[]): PaintArea[] {
  const out: PaintArea[] = [];
  for (const t of ts) {
    if (checkArea(t[5]) !== '') continue;
    const s = clampStyle({ tex: t[0] as PaintTex, scale: t[1], angle: t[2], border: t[3] as BorderSize, btex: t[4] as BorderTex });
    out.push({ id: out.length + 1, pts: t[5].slice(), ...s });
  }
  return out;
}

/** the first edge's direction in degrees (pt0 → pt1), wrapped as clampStyle wraps an angle (the panel's "Along first edge") */
export function edgeAngle(pts: number[]): number {
  const deg = Math.atan2(pts[3] - pts[1], pts[2] - pts[0]) * 180 / Math.PI;
  return wrapAngle(Math.round(deg * 1e6) / 1e6 + 0);
}
