// The Paint tool's data model (docs/PAINT-TOOL.md): pure helpers, no DOM, no canvas, importable from node tests.
import { MAP } from './iso';
import { isPhotoTex, type GrassTex } from './grass-art';
import { PRESETS, presetTex, surfacePreset } from './paint-presets';

/** the fill textures a painted area can take (the ground textures the roads and sidewalks already use, and the photo textures of grass-art.ts PHOTO_TEX) */
export type PaintTex = 'paving' | 'slabs' | 'pad' | 'asphalt' | 'asphaltDark' | 'asphaltWorn' | 'lotAsphalt' | 'roadgravel' | 'gravel' | 'dirt' | 'rockyDirt' | 'rockyDirtAlt' | 'field' | 'grass' | 'bunkerSand' | 'wasteSand' | 'pineStraw' | 'barkMulch' | 'spectatorPath' | 'woodChips' | 'grassDry' | 'asphaltPatched' | 'chipSeal' | 'concreteStained' | 'concreteCracked' | 'concreteOld' | 'concreteWeathered' | 'waterDark' | 'waterDeep' | 'waterClear' | GrassTex | `preset:${string}`;
/** a border's texture: any fill texture, or the kerb */
export type BorderTex = PaintTex | 'kerb';
/** the border width as a step on a continuous scale (the owner, 2026-10-25: "should be a slider"): 0 none, 1 small, 2 medium, 3 large (the
 *  old buttons, BORDER_W), anything between, up to BORDER_STEP_MAX (huge); borderW gives the width in tiles */
export type BorderSize = number;
/** a painted ground area: a closed polygon of tiles, filled with one texture, with an optional border band inside its edge, corners rounded by radius (tiles, 0 sharp),
 *  and a tone filter over the fill: tone 0 none, 1 Multiply (darker), 2 Lighten (screen); toneAmt its strength (0..1); tint its colour ('#rrggbb');
 *  the border band has its own scale, angle, tone, strength and tint (bscale, bangle, btone, btoneAmt, btint), by default the fill's scale and angle with no tone;
 *  plantKind / plantedMonth: a golf area sown from seed (grows in) or laid as sod, and the month it was planted */
export interface PaintArea { id: number; pts: number[]; tex: PaintTex; scale: number; angle: number; border: BorderSize; btex: BorderTex; radius: number; tone: 0 | 1 | 2; toneAmt: number; tint: string; bscale: number; bangle: number; btone: 0 | 1 | 2; btoneAmt: number; btint: string; hole?: number; kind?: BrushKind; plantKind?: 'seed' | 'sod'; plantedMonth?: number;
  /** a second texture blended over the fill in soft patches (the map grass's mix): mtex the texture, mshare how much of the area it covers (0..1),
   *  msoft how soft its edge is, mpatch the patches' size (1 = about 5 tiles); absent = no blend */
  mtex?: PaintTex; mshare?: number; msoft?: number; mpatch?: number;
  /** the draw order the player set (the layer buttons and keys): replaces the default (drawZ); absent = the default */
  order?: number;
  /** its edge shade (T136, the Shadow slider beside Border width): 0 none .. 1 strong; the area reads as slightly raised, the shade on its
   *  edges turned away from the sun (paint-edges.ts areaShadeAlpha); absent = 0, as every area before it */
  shadow?: number;
}
/** an area's draw order on the ground (higher draws over lower): the player's order, else its brush layer's band and then its id (the order made) */
export const drawZ = (a: { order?: number; kind?: BrushKind; id: number }) => a.order ?? (a.kind ? BRUSH_LAYER[a.kind] * 1e6 : 0) + a.id;
/** the golf brush's kinds: the areas a stroke paints (BRUSH_PRESETS) */
export type BrushKind = 'rough' | 'water' | 'fairway' | 'tee' | 'bunker' | 'green' | 'path';
/** the save tuple: [tex, scale, angle, border, btex, pts, radius, tone, toneAmt, tint, hole, kind, plantKind, plantedMonth, bscale, bangle, btone, btoneAmt, btint];
 *  elements 6 to 9 are optional on load (older saves have no radius, and none has no tone: they load sharp and untoned); 10 and 11 (the hole and the brush kind) are
 *  written when anything after them is (as 0 and '' when absent, no tag on load); 12 and 13 (seed or sod, the month) when the area has a plantKind or a border style
 *  (as '' and 0 when absent); 14 to 18 (the border's scale, angle, tone, strength and tint) only when one differs from its default, and optional on load;
 *  19 to 22 (the blend: its texture, share, softness and patch size) only when the area blends a second texture (then 10 to 18 are written too);
 *  23 the player's draw order (null when unset and a later slot is written); 24 the edge shade (T136) only when it is above 0 (then every slot
 *  before it is written too); toTuple writes ten, twelve, fourteen, nineteen, twenty-three, twenty-four or twenty-five */
export type PaintTuple = [string, number, number, number, string, number[], number?, number?, number?, string?, number?, string?, string?, number?, number?, number?, number?, number?, string?, string?, number?, number?, number?, (number | null)?, number?];
/** the draw order layer of each brush kind (a patch's z is layer * 1e6 + id, so a later kind paints over an earlier one) */
export const BRUSH_LAYER: Record<BrushKind, number> = { rough: 1, water: 2, fairway: 3, tee: 4, bunker: 5, green: 6, path: 7 };
const BRUSH_KIND_IDS = new Set<string>(Object.keys(BRUSH_LAYER));
/** a tile box [x0, y0, x1, y1] */
export type PaintBox = [number, number, number, number];

/** the fill textures in the order the Paint panel shows them, with their short labels and preview colours */
export const PAINT_TEXES: { id: PaintTex; name: string; col: string }[] = [
  { id: 'paving', name: 'Pavers', col: '#a89c8c' },
  { id: 'slabs', name: 'Slabs', col: '#d8c8a8' },
  { id: 'pad', name: 'Concrete', col: '#999691' },
  { id: 'concreteStained', name: 'Stained concrete', col: '#726759' },
  { id: 'concreteCracked', name: 'Cracked concrete', col: '#736452' },
  { id: 'concreteOld', name: 'Old concrete', col: '#7c6b59' },
  { id: 'concreteWeathered', name: 'Weathered concrete', col: '#776551' },
  { id: 'asphalt', name: 'Asphalt', col: '#404040' },
  { id: 'asphaltDark', name: 'Dark asphalt', col: '#22242e' },
  { id: 'asphaltWorn', name: 'Worn asphalt', col: '#434343' },
  { id: 'lotAsphalt', name: 'Car park asphalt', col: '#3a3b3f' },
  { id: 'asphaltPatched', name: 'Patched asphalt', col: '#444443' },
  { id: 'chipSeal', name: 'Chip seal', col: '#48443f' },
  { id: 'roadgravel', name: 'Road gravel', col: '#7a6d5e' },
  { id: 'gravel', name: 'Gravel', col: '#4b4a48' },
  { id: 'dirt', name: 'Dirt', col: '#7a634c' },
  { id: 'rockyDirt', name: 'Rocky dirt', col: '#78452b' },
  { id: 'rockyDirtAlt', name: 'Rocky dirt alt', col: '#70432d' },
  { id: 'field', name: 'Field', col: '#493e35' },
  { id: 'grass', name: 'Grass', col: '#505d1c' },
  { id: 'grassDry', name: 'Dry grass', col: '#595d1c' },
  { id: 'lawnLush', name: 'Lush lawn', col: '#4a5e1a' },
  { id: 'lawnWorn', name: 'Worn lawn', col: '#57591b' },
  { id: 'lawnClover', name: 'Clover lawn', col: '#48682d' },
  { id: 'golfGreen', name: 'Putting green', col: '#62812d' },
  { id: 'golfFairway', name: 'Fairway', col: '#416114' },
  { id: 'golfSod', name: 'New sod', col: '#435d19' },
  { id: 'golfRough', name: 'Rough', col: '#52571f' },
  { id: 'golfFringe', name: 'Fringe', col: '#405f16' },
  { id: 'golfTee', name: 'Tee', col: '#48631d' },
  { id: 'golfFirstCut', name: 'First cut', col: '#595f20' },
  { id: 'golfFescue', name: 'Fescue', col: '#6a6235' },
  { id: 'bunkerSand', name: 'Bunker sand', col: '#ddcfbe' },
  { id: 'wasteSand', name: 'Waste sand', col: '#b5976f' },
  { id: 'pineStraw', name: 'Pine straw', col: '#9a5a34' },
  { id: 'barkMulch', name: 'Bark mulch', col: '#513d33' },
  { id: 'spectatorPath', name: 'Spectator path', col: '#90865f' },
  { id: 'woodChips', name: 'Wood chips', col: '#b18152' },
  { id: 'meadowLush', name: 'Meadow', col: '#4a632b' },
  { id: 'meadowFlowers', name: 'Wildflowers', col: '#4e5f27' },
  { id: 'waterDark', name: 'Water', col: '#0f2431' },
  { id: 'waterDeep', name: 'Deep water', col: '#0d2330' },
  { id: 'waterClear', name: 'Clear water', col: '#164959' },
];
// the owner's texture presets (paint-presets.ts) are fill textures too
PAINT_TEXES.push(...PRESETS.map(p => ({ id: presetTex(p.id), name: p.name, col: p.col })));
/** the border textures: the kerb first, then every fill texture */
export const BORDER_TEXES: { id: BorderTex; name: string; col: string }[] = [{ id: 'kerb', name: 'Kerb', col: '#f0dfbe' }, ...PAINT_TEXES];
/** what the Paint tool offers: only the owner's presets (the textures above stay, so saved areas still draw); the border menu adds the kerb */
export const MENU_TEXES = PAINT_TEXES.filter(t => t.id.startsWith('preset:'));
export const BORDER_MENU: { id: BorderTex; name: string; col: string }[] = [{ id: 'kerb', name: 'Kerb', col: '#f0dfbe' }, ...MENU_TEXES];
/** true for a texture laid in tile space (a photo of grass-art.ts PHOTO_TEX or an owner's preset), not a screen-space painting */
export const isPaintPhoto = (t: string) => t.startsWith('preset:') || isPhotoTex(t);
/** the border width in tiles at the old whole steps (none, small, medium, large) */
export const BORDER_W = [0, 0.25, 0.5, 1];
/** the largest border step: a band 4 tiles (8 m) wide */
export const BORDER_STEP_MAX = 6;
/** a border step's width in tiles: through the old steps (BORDER_W: 0, 0.25, 0.5, 1 tile), straight between them, then a tile more a step
 *  up to BORDER_STEP_MAX (so old saves draw as they did, and a fraction of step 1 is a hairline) */
export function borderW(b: number): number {
  const v = Math.min(BORDER_STEP_MAX, Math.max(0, Number.isFinite(b) ? b : 0));
  if (v >= 3) return 1 + (v - 3);
  const k = Math.floor(v), f = v - k;
  return BORDER_W[k]! + (k < 3 ? (BORDER_W[k + 1]! - BORDER_W[k]!) * f : 0);
}
/** the border step whose width is w tiles (borderW inverted) */
export function borderStep(w: number): number {
  const v = Math.max(0, Number.isFinite(w) ? w : 0);
  if (v >= 1) return Math.min(BORDER_STEP_MAX, 3 + (v - 1));
  return v >= 0.5 ? 2 + (v - 0.5) / 0.5 : v / 0.25;
}
/** the most corners an area may have */
export const MAX_PTS = 200;
/** the largest bounding box side in tiles (256 tiles = 512 m) */
export const MAX_SIDE = 256;
/** the smallest area in tiles² */
export const MIN_AREA = 1;
/** the texture scale range (1 = the textures' native size) */
export const SCALE_MIN = 0.25, SCALE_MAX = 4;
/** the largest corner radius in tiles (15 tiles = 30 m); 0 keeps the corners sharp */
export const RADIUS_MAX = 15;
/** the style a new area starts with */
export const DEFAULT_STYLE: Omit<PaintArea, 'id' | 'pts'> = { tex: 'paving', scale: 1, angle: 0, border: 0, btex: 'kerb', radius: 0, tone: 0, toneAmt: 0.35, tint: '#000000', bscale: 1, bangle: 0, btone: 0, btoneAmt: 0.35, btint: '#000000' };

const TEX_IDS = new Set<string>(PAINT_TEXES.map(t => t.id));
const BTEX_IDS = new Set<string>(BORDER_TEXES.map(t => t.id));
/** a '#rrggbb' colour */
const TINT_RE = /^#[0-9a-fA-F]{6}$/;

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

/** the closed outline (x0 y0 x1 y1 ...) with every corner replaced by a circular arc of radius r (tiles): the arc is tangent to both edges, its tangent length is clamped to half the shorter neighbour edge, and it runs the short way round (about 5° a segment). Nearly straight corners and r <= 0 keep their points; r <= 0 returns a copy */
export function roundCorners(pts: number[], r: number): number[] {
  if (!(r > 0)) return pts.slice();
  const n = pts.length >> 1, out: number[] = [];
  for (let i = 0; i < n; i++) {
    const px = pts[2 * i]!, py = pts[2 * i + 1]!;
    const a = (i + n - 1) % n, b = (i + 1) % n;
    const ax = pts[2 * a]! - px, ay = pts[2 * a + 1]! - py, bx = pts[2 * b]! - px, by = pts[2 * b + 1]! - py;
    const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
    if (la === 0 || lb === 0) { out.push(px, py); continue; }
    const ux = ax / la, uy = ay / la, vx = bx / lb, vy = by / lb;
    const theta = Math.acos(Math.max(-1, Math.min(1, ux * vx + uy * vy)));
    if (theta < 1e-6 || theta > Math.PI - 0.01) { out.push(px, py); continue; }
    const th = Math.tan(theta / 2), sh = Math.sin(theta / 2);
    const d = Math.min(r / th, 0.5 * Math.min(la, lb)), re = d * th;
    // the arc's centre lies on the bisector of u and v, re / sin(theta / 2) from the corner
    const hx = ux + vx, hy = uy + vy, k = re / (sh * Math.hypot(hx, hy));
    const cx = px + hx * k, cy = py + hy * k;
    const t1x = px + ux * d, t1y = py + uy * d, t2x = px + vx * d, t2y = py + vy * d;
    const a1 = Math.atan2(t1y - cy, t1x - cx);
    let sweep = Math.atan2(t2y - cy, t2x - cx) - a1; // wrapped into (-PI, PI]: the short way, |sweep| = PI - theta
    if (sweep > Math.PI) sweep -= 2 * Math.PI; else if (sweep < -Math.PI) sweep += 2 * Math.PI;
    const seg = Math.max(2, Math.ceil((Math.PI - theta) / (Math.PI / 18)));
    out.push(t1x, t1y);
    for (let s = 1; s < seg; s++) { const ang = a1 + sweep * s / seg; out.push(cx + re * Math.cos(ang), cy + re * Math.sin(ang)); }
    out.push(t2x, t2y);
  }
  return out;
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

/** a copy of a style (or a whole area) with the scale, angle, border, radius and tone clamped and the textures and tint checked (unknown → paving, kerb; a bad tint → black, or white when lightening) */
export function clampStyle<T extends Omit<PaintArea, 'id' | 'pts'>>(st: T): T {
  // the blend's fields are kept only with a known texture (they are left out, not undefined, without one); the edge shade only above 0
  const { mtex, mshare, msoft, mpatch, shadow, ...rest } = st, s = rest as T, sh = Math.round(Math.min(1, Math.max(0, fin(shadow ?? 0, 0))) * 1000) / 1000;
  const tone = Math.min(2, Math.max(0, Math.round(fin(s.tone, 0)))) as 0 | 1 | 2, btone = Math.min(2, Math.max(0, Math.round(fin(s.btone, 0)))) as 0 | 1 | 2;
  return {
    ...s,
    tex: TEX_IDS.has(s.tex) ? s.tex : 'paving',
    scale: Math.min(SCALE_MAX, Math.max(SCALE_MIN, fin(s.scale, 1))),
    angle: wrapAngle(fin(s.angle, 0)),
    border: Math.round(Math.min(BORDER_STEP_MAX, Math.max(0, fin(s.border, 0))) * 1000) / 1000,
    btex: BTEX_IDS.has(s.btex) ? s.btex : 'kerb',
    radius: Math.min(RADIUS_MAX, Math.max(0, fin(s.radius, 0))),
    tone,
    toneAmt: Math.min(1, Math.max(0, fin(s.toneAmt, 0.35))),
    tint: TINT_RE.test(s.tint) ? s.tint.toLowerCase() : tone === 2 ? '#ffffff' : '#000000',
    bscale: Math.min(SCALE_MAX, Math.max(SCALE_MIN, fin(s.bscale, 1))),
    bangle: wrapAngle(fin(s.bangle, 0)),
    btone,
    btoneAmt: Math.min(1, Math.max(0, fin(s.btoneAmt, 0.35))),
    btint: TINT_RE.test(s.btint) ? s.btint.toLowerCase() : btone === 2 ? '#ffffff' : '#000000',
    ...(mtex && TEX_IDS.has(mtex)
      ? { mtex, mshare: Math.min(1, Math.max(0, fin(mshare ?? 0.5, 0.5))), msoft: Math.min(0.5, Math.max(0.01, fin(msoft ?? 0.12, 0.12))), mpatch: Math.min(4, Math.max(0.25, fin(mpatch ?? 1, 1))) }
      : {}),
    ...(sh > 0 ? { shadow: sh } : {}),
  };
}
/** copies a (clamped) style onto an area: its optional fields that the style leaves out (the blend, the edge shade) go from the area too */
export function assignStyle(a: PaintArea, st: Omit<PaintArea, 'id' | 'pts'>): PaintArea {
  Object.assign(a, st);
  if (!st.mtex) { delete a.mtex; delete a.mshare; delete a.msoft; delete a.mpatch; }
  if (!st.shadow) delete a.shadow;
  return a;
}

/** the golf brush presets, in the panel's order: each kind's texture style and its brush radius r (tiles); the Paint panel's edits replace these (remembered) */
/** a golf surface's texture: the owner's first preset standing for it, else the game's old one */
const S = (surface: string, old: PaintTex): PaintTex => surfacePreset(surface) ?? old;
/** the golf surface each of the game's old course photos stands for, and the photo the brushes fall back to (the water pieces' clear water
 *  lays as the brushes' dark water) */
const COURSE_SURFACE_OF: Record<string, [string, PaintTex]> = {
  golfFairway: ['fairway', 'golfFairway'], golfFirstCut: ['firstCut', 'golfFirstCut'], golfFringe: ['fringe', 'golfFringe'], golfGreen: ['green', 'golfGreen'],
  golfTee: ['tee', 'golfTee'], golfRough: ['rough', 'golfRough'], bunkerSand: ['bunker', 'bunkerSand'], waterDark: ['water', 'waterDark'], waterClear: ['water', 'waterDark'],
};
/** a course texture as the brushes lay it: the owner's preset for its golf surface, else the brushes' photo, so a placed piece and a brush stroke
 *  of the same surface always match (the owner, 2026-10-24: the pieces laid a blocky old fairway photo the brushes never use) */
export function courseTex(tex: PaintTex): PaintTex { const s = COURSE_SURFACE_OF[tex]; return s ? S(s[0], s[1]) : tex; }
export const BRUSH_PRESETS: { kind: BrushKind; name: string; r: number; style: Omit<PaintArea, 'id' | 'pts' | 'hole' | 'kind'> }[] = [
  { kind: 'fairway', name: 'Fairway', r: 5, style: clampStyle({ ...DEFAULT_STYLE, tex: S('fairway', 'golfFairway'), border: 3, btex: S('firstCut', 'golfFirstCut'), radius: 0 }) },
  { kind: 'green', name: 'Green', r: 4, style: clampStyle({ ...DEFAULT_STYLE, tex: S('green', 'golfGreen'), border: 2, btex: S('fringe', 'golfFringe') }) },
  { kind: 'tee', name: 'Tee', r: 2, style: clampStyle({ ...DEFAULT_STYLE, tex: S('tee', 'golfTee'), border: 1, btex: S('firstCut', 'golfFirstCut') }) },
  { kind: 'rough', name: 'Rough', r: 8, style: clampStyle({ ...DEFAULT_STYLE, tex: S('rough', 'golfRough'), border: 0 }) },
  { kind: 'bunker', name: 'Bunker', r: 2, style: clampStyle({ ...DEFAULT_STYLE, tex: S('bunker', 'bunkerSand'), border: 2, btex: S('rough', 'golfRough') }) },
  { kind: 'water', name: 'Water', r: 4, style: clampStyle({ ...DEFAULT_STYLE, tex: S('water', 'waterDark'), border: 2, btex: 'dirt' }) },
  { kind: 'path', name: 'Cart path', r: 1, style: clampStyle({ ...DEFAULT_STYLE, tex: S('path', 'asphalt'), border: 0 }) },
];

const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** a painted area as its save tuple (scale, angle, radius and strength to 3 decimals) */
export function toTuple(a: PaintArea): PaintTuple {
  const t: PaintTuple = [a.tex, r3(a.scale), r3(a.angle), a.border, a.btex, a.pts.slice(), r3(a.radius), a.tone, r3(a.toneAmt), a.tint];
  // a slot is written when it or any later one is set (od: the player's draw order, slot 23, and sd: the edge shade, slot 24, need every slot
  // before them; an unset order before a shade is written as null)
  const sd = !!a.shadow && a.shadow > 0, od = a.order !== undefined || sd, mx = !!a.mtex || od, bd = mx || a.bscale !== DEFAULT_STYLE.bscale || a.bangle !== DEFAULT_STYLE.bangle || a.btone !== DEFAULT_STYLE.btone || a.btoneAmt !== DEFAULT_STYLE.btoneAmt || a.btint !== DEFAULT_STYLE.btint;
  if (a.kind || a.hole || a.plantKind || bd) t.push(a.hole ?? 0, a.kind ?? '');
  if (a.plantKind || bd) t.push(a.plantKind ?? '', a.plantKind ? a.plantedMonth ?? 0 : 0);
  if (bd) t.push(r3(a.bscale), r3(a.bangle), a.btone, r3(a.btoneAmt), a.btint);
  if (mx) t.push(a.mtex ?? '', r3(a.mshare ?? 0.5), r3(a.msoft ?? 0.12), r3(a.mpatch ?? 1));
  if (od) t.push(a.order !== undefined ? Math.round(a.order * 1e6) / 1e6 : null);
  if (sd) t.push(r3(a.shadow!));
  return t;
}

/** the areas from save tuples: a tuple whose outline fails checkArea is skipped; ids 1..n over the kept ones, styles clamped (a missing radius is sharp, a missing tone is none, a missing edge shade is none); a hole tag that is not a positive integer and a kind that is not a BrushKind are dropped */
export function fromTuples(ts: PaintTuple[]): PaintArea[] {
  const out: PaintArea[] = [];
  for (const t of ts) {
    if (checkArea(t[5]) !== '') continue;
    const s = clampStyle({ tex: t[0] as PaintTex, scale: t[1], angle: t[2], border: t[3] as BorderSize, btex: t[4] as BorderTex, radius: t[6] ?? 0, tone: (t[7] ?? 0) as 0 | 1 | 2, toneAmt: t[8] ?? DEFAULT_STYLE.toneAmt, tint: t[9] ?? DEFAULT_STYLE.tint,
      bscale: t[14] ?? DEFAULT_STYLE.bscale, bangle: t[15] ?? DEFAULT_STYLE.bangle, btone: (t[16] ?? 0) as 0 | 1 | 2, btoneAmt: t[17] ?? DEFAULT_STYLE.btoneAmt, btint: t[18] ?? DEFAULT_STYLE.btint,
      ...(typeof t[19] === 'string' && t[19] ? { mtex: t[19] as PaintTex, mshare: t[20], msoft: t[21], mpatch: t[22] } : {}),
      ...(typeof t[24] === 'number' ? { shadow: t[24] } : {}) });
    const tags: { hole?: number; kind?: BrushKind; plantKind?: 'seed' | 'sod'; plantedMonth?: number } = {};
    if (Number.isInteger(t[10]) && t[10]! > 0) tags.hole = t[10];
    if (typeof t[11] === 'string' && BRUSH_KIND_IDS.has(t[11])) tags.kind = t[11] as BrushKind;
    if (typeof t[12] === 'string' && (t[12] === 'seed' || t[12] === 'sod')) tags.plantKind = t[12];
    if (tags.plantKind && Number.isInteger(t[13])) tags.plantedMonth = t[13];
    const order = typeof t[23] === 'number' && Number.isFinite(t[23]) ? { order: t[23] } : {};
    out.push({ id: out.length + 1, pts: t[5].slice(), ...s, ...tags, ...order });
  }
  return out;
}

/** the first edge's direction in degrees (pt0 → pt1), wrapped as clampStyle wraps an angle (the panel's "Along first edge") */
export function edgeAngle(pts: number[]): number {
  const deg = Math.atan2(pts[3] - pts[1], pts[2] - pts[0]) * 180 / Math.PI;
  return wrapAngle(Math.round(deg * 1e6) / 1e6 + 0);
}

/** a tile value rounded to quarter tiles (no -0) */
const q4 = (v: number) => Math.round(v * 4) / 4 + 0;

/** a copy of the corners with corner i moved to (x, y) (quarter tiles): the shape editing of the Paint tool's handles */
export function moveCorner(pts: number[], i: number, x: number, y: number): number[] {
  const out = pts.map(q4);
  out[2 * i] = q4(x); out[2 * i + 1] = q4(y);
  return out;
}

/** a copy of the corners with a new corner at (x, y) on edge e (edge e runs from corner e to corner e+1; the new corner takes index e+1) */
export function insertCorner(pts: number[], e: number, x: number, y: number): number[] {
  const n = pts.length >> 1, k = e + 1, out: number[] = [];
  for (let j = 0; j < n; j++) { if (j === k) out.push(q4(x), q4(y)); out.push(q4(pts[2 * j]!), q4(pts[2 * j + 1]!)); }
  if (k >= n) out.push(q4(x), q4(y));
  return out;
}

/** a copy of the corners without corner i; null when that would leave fewer than 3 */
export function removeCorner(pts: number[], i: number): number[] | null {
  const n = pts.length >> 1;
  if (n <= 3) return null;
  const out: number[] = [];
  for (let j = 0; j < n; j++) if (j !== i) out.push(q4(pts[2 * j]!), q4(pts[2 * j + 1]!));
  return out;
}

/** a copy of the corners moved by (dx, dy) (quarter tiles) */
export function translatePts(pts: number[], dx: number, dy: number): number[] {
  const out = pts.map(q4); const n = pts.length >> 1;
  for (let j = 0; j < n; j++) { out[2 * j] = q4(pts[2 * j]! + dx); out[2 * j + 1] = q4(pts[2 * j + 1]! + dy); }
  return out;
}

/** a copy of the corners turned by deg (degrees, counter-clockwise on the map's axes) about (cx, cy) (quarter tiles) */
export function rotatePts(pts: number[], cx: number, cy: number, deg: number): number[] {
  const r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r), n = pts.length >> 1, out: number[] = [];
  for (let j = 0; j < n; j++) {
    const x = pts[2 * j]! - cx, y = pts[2 * j + 1]! - cy;
    out.push(q4(cx + x * c - y * s), q4(cy + x * s + y * c));
  }
  return out;
}

/** a copy of the corners scaled by (sx, sy) about the anchor (ax, ay) (quarter tiles) */
export function scalePts(pts: number[], ax: number, ay: number, sx: number, sy: number): number[] {
  const n = pts.length >> 1, out: number[] = [];
  for (let j = 0; j < n; j++) out.push(q4(ax + (pts[2 * j]! - ax) * sx), q4(ay + (pts[2 * j + 1]! - ay) * sy));
  return out;
}

/** the axis-aligned box [x0, y0, x1, y1] of the corners, tiles (not floored or ceiled) */
export function boxOf(pts: number[]): PaintBox {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let k = 0; k + 1 < pts.length; k += 2) { x0 = Math.min(x0, pts[k]!); y0 = Math.min(y0, pts[k + 1]!); x1 = Math.max(x1, pts[k]!); y1 = Math.max(y1, pts[k + 1]!); }
  return [x0, y0, x1, y1];
}
