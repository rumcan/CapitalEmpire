// T385 (#1042): the parts of the clean base of a house lot that need no composer: which ground patches are the drive and the front path (a preset
// of the owner's draws its drive as a paved strip, not a drive), a drive or a parking pad and a path where a preset has none, the trees (at most
// MAX_TREES, clear of the house, its roof, the drive and the path, in the autumn art and the desert art both) and the hedge a road at 45 degrees takes in
// place of fence panels. compose.ts (cleanHouse) draws the lot from them. Pure over the library: no DOM. Lot frame: x along the street 0..W, y away
// from it 0..D, the front edge at y = 0 (a preset frame, tiles of 2 m).
import { LIBRARY } from '../library';
import { worldX, worldY } from '../iso';
import { lookOf } from '../newart';
import { desertPick } from '../desert-theme';
import { footprintOf, ownerScaleOf, turned } from './preset-art';
import { toWorld, type PresetFrame } from './preset-frame';
import type { PresetPatch } from './presets';
import type { Build, Spec } from './compose-core';
import { realTrees, HEDGE } from './autolot';
import { MAX_TREES } from './clean-yards';

/** a box in the lot frame, x0, y0, x1, y1 (tiles) */
export type Box = [number, number, number, number];
/** a picture's rectangle on screen, x0, y0, x1, y1 (world px at zoom 1) */
export type Rect = [number, number, number, number];
const LIB_AT = new Map(LIBRARY.map((it, i) => [it.id, i] as const));

/** a point list's bounding box (x, y pairs) */
export function boxOfPts(pts: readonly number[]): Box {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i + 1 < pts.length; i += 2) { x0 = Math.min(x0, pts[i]!); x1 = Math.max(x1, pts[i]!); y0 = Math.min(y0, pts[i + 1]!); y1 = Math.max(y1, pts[i + 1]!); }
  return [x0, y0, x1, y1];
}
const rectPts = (b: Box): number[] => [b[0], b[1], b[2], b[1], b[2], b[3], b[0], b[3]];

// ---------------------------------------------------------------- the drive and the front path
/** a patch within this of the front edge touches it (tiles) */
const FRONT_EPS = 0.35;
/** the surfaces a drive or a path is laid in (the presets': paving, concrete, slabs, asphalt; gravel for a country drive) */
const PAVED_TEX = /paving|concrete|slabs|asphalt|gravel/;
/** a drive's width (one car, tiles of 2 m), the least width a patch is a drive and not a path, and the room kept between a drive and the house */
const DRIVE_W = 1.8, DRIVE_MIN = 1.2, SIDE = 0.3;
/** the least front yard (tiles, from the street to the house's front) that has a parking pad in it, and a path to the door */
const PAD_MIN = 1.4, PATH_MIN = 0.6;
/** the drive and path a clean base keeps: the preset's own (a drive patch, or a paved yard strip from the street that is a car wide; a walk patch, or a
 *  paved strip a person wide), or those it lacks made here: a drive beside the house (or a parking pad in front of it on a lot with no room beside it) and
 *  a path to the house's front. Both start at the street edge (the drive connects to the road) and stay inside the lot */
export interface CleanGround { drive: PresetPatch | null; walk: PresetPatch | null; parking: 'drive' | 'pad' | null }
export function cleanGround(patches: readonly PresetPatch[], W: number, D: number, house: Box | null, tex: { drive?: string; walk?: string } = {}): CleanGround {
  let drive: PresetPatch | null = null, walk: PresetPatch | null = null, dA = 0, wL = 0;
  for (const a of patches) {
    const b = boxOfPts(a.pts), w = b[2] - b[0], h = b[3] - b[1];
    const paved = a.kind === 'drive' || a.kind === 'walk' || (a.kind === 'yard' && PAVED_TEX.test(a.tex));
    if (!paved || b[1] > FRONT_EPS || h < 1) continue;
    if (a.kind === 'walk' || (a.kind === 'yard' && w < DRIVE_MIN)) { if (h > wL) { wL = h; walk = a; } }
    else if (w * h > dA) { dA = w * h; drive = a; }
  }
  const rect = (a: PresetPatch, kind: PresetPatch['kind']): PresetPatch => {
    const b = boxOfPts(a.pts), r: Box = [Math.max(0, b[0]), 0, Math.min(W, b[2]), Math.min(D, b[3])];
    return { kind, tex: a.tex, pts: rectPts(r) };
  };
  let parking: CleanGround['parking'] = null;
  let d = drive ? rect(drive, 'drive') : null, w = walk ? rect(walk, 'walk') : null;
  if (d) parking = 'drive';
  const hx0 = house ? house[0] : W / 2 - 3, hx1 = house ? house[2] : W / 2 + 3, hy = house ? house[1] : Math.min(5, D / 3);
  if (!d) {
    // a drive beside the house, from the street to its front, on the side with the room; else a parking pad before the house, on the side the path is not
    const room = Math.max(hx0, W - hx1), right = W - hx1 >= hx0, len = Math.min(Math.max(hy + 0.5, 3), 7, D - 1), dw = Math.min(DRIVE_W, room - SIDE - 0.4);
    if (dw >= DRIVE_MIN) { d = { kind: 'drive', tex: tex.drive ?? 'paving', pts: rectPts(right ? [W - SIDE - dw, 0, W - SIDE, len] : [SIDE, 0, SIDE + dw, len]) }; parking = 'drive'; }
    else if (hy >= PAD_MIN) {
      // (a house with its front near the street: a short apron, a car's width, from the street to its front)
      const wc = w ? (boxOfPts(w.pts)[0] + boxOfPts(w.pts)[2]) / 2 : (hx0 + hx1) / 2, left = wc > W / 2, ln = Math.min(2.6, hy - 0.2);
      d = { kind: 'drive', tex: tex.drive ?? 'paving', pts: rectPts(left ? [SIDE, 0, SIDE + DRIVE_W, ln] : [W - SIDE - DRIVE_W, 0, W - SIDE, ln]) }; parking = 'pad';
    }
  }
  if (!w && house && hy >= PATH_MIN) {
    // a path to the house's front, from the middle of it; moved off the drive when it would run along it
    const cx = (hx0 + hx1) / 2, db = d ? boxOfPts(d.pts) : null;
    let x0 = cx - 0.35, x1 = cx + 0.35;
    if (db && x1 > db[0] - 0.2 && x0 < db[2] + 0.2) { const s = (db[0] + db[2]) / 2 < W / 2 ? db[2] + 0.4 : db[0] - 0.4 - 0.7; x0 = s; x1 = s + 0.7; }
    w = { kind: 'walk', tex: tex.walk ?? 'paving', pts: rectPts([Math.max(0, x0), 0, Math.min(W, x1), Math.min(hy + 0.1, D)]) };
  }
  return { drive: d, walk: w, parking };
}

// ---------------------------------------------------------------- pictures on screen
/** a library picture's rectangle on screen, as the game draws a prop that is no car (sprites.ts spriteRect, without a look): the trimmed picture at the
 *  anchor (x, y: tiles), scaled */
function plainRect(item: number, x: number, y: number, flip: boolean, scale: number): Rect {
  const it = LIBRARY[item]!, X = worldX(x, y), Y = worldY(x, y), ax = flip ? it.w - it.ax : it.ax, left = X - ax * scale, top = Y - it.ay * scale, q = it.quad;
  const qx0 = flip ? it.w - q[2] : q[0], qx1 = flip ? it.w - q[0] : q[2];
  return [left + qx0 * scale, top + q[1] * scale, left + qx1 * scale, top + q[3] * scale];
}
/** the rectangle a building is drawn in (newart.ts lookOf: an old building is drawn as its new-art stand-in, centred on its footprint fp, world tiles x0, y0, x1, y1) */
export function buildingRect(item: number, x: number, y: number, flip: boolean, scale: number, fp?: Box): Rect {
  const l = lookOf({ item, x, y, flip, scale, ...(fp ? { x0: fp[0], y0: fp[1], x1: fp[2], y1: fp[3] } : {}) });
  if (l.hidden) { const X = worldX(x, y), Y = worldY(x, y); return [X, Y, X, Y]; }
  return plainRect(l.item, l.x ?? x, l.y ?? y, l.flip, l.scale);
}
/** the rectangles a tree is drawn in: its own picture, and the desert theme's palm or rock for the spot (desert-theme.ts desertPick: the same spot, the same
 *  plant), so the lot is clear in both themes */
export function treeRects(item: number, x: number, y: number, flip: boolean, scale: number): Rect[] {
  const out = [plainRect(item, x, y, flip, scale)], d = desertPick(item, x, y, scale);
  if (d) out.push(plainRect(d.item, x, y, false, d.scale));
  return out;
}
/** whether two screen rectangles come within m px of each other */
export const rectsHit = (a: Rect, b: Rect, m: number): boolean => a[0] < b[2] + m && a[2] > b[0] - m && a[1] < b[3] + m && a[3] > b[1] - m;
/** whether a rectangle and a convex quad (8 numbers) overlap on screen */
export function rectHitsQuad(r: Rect, q: readonly number[]): boolean {
  const rp = [r[0], r[1], r[2], r[1], r[2], r[3], r[0], r[3]], axes: [number, number][] = [[1, 0], [0, 1]];
  for (let k = 0; k < 4; k++) { const j = (k + 1) % 4; axes.push([-(q[2 * j + 1]! - q[2 * k + 1]!), q[2 * j]! - q[2 * k]!]); }
  for (const [ax, ay] of axes) {
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (let k = 0; k < 4; k++) { const pa = rp[2 * k]! * ax + rp[2 * k + 1]! * ay, pb = q[2 * k]! * ax + q[2 * k + 1]! * ay; a0 = Math.min(a0, pa); a1 = Math.max(a1, pa); b0 = Math.min(b0, pb); b1 = Math.max(b1, pb); }
    if (a1 <= b0 + 1e-6 || b1 <= a0 + 1e-6) return false;
  }
  return true;
}
/** a lot-frame box on screen: its four corners as the ground draws them (the frame f) */
export function boxOnScreen(f: PresetFrame, b: Box): number[] {
  return [[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]].flatMap(([x, y]) => { const p = toWorld(f, x!, y!); return [worldX(p.x, p.y), worldY(p.x, p.y)]; });
}

// ---------------------------------------------------------------- the trees
/** the picture margin a tree keeps from a house (screen px at zoom 1: a few tiles' worth of leaves), the room its trunk keeps inside the lot lines, the
 *  least spacing between two trees (tiles), the sizes a yard tree is drawn at (a share of its owner size) and the most spots tried for a lot's trees */
const HOUSE_M = 14, LINE_M = 1.1, SPACING = 3.2, SIZE_LO = 0.78, SIZE_HI = 1, TRIES = 70;
/** what the trees keep clear of: the buildings' pictures (screen rectangles) and the drive and the path (lot-frame boxes: no tree's picture covers them) */
export interface TreeKeep { houses: readonly Rect[]; ground: readonly Box[] }
/** the spots a lot's trees try, most wanted first: the lot's own whole-tile grid, each point nudged a little (the lot's draws), by how close it stands to a line the lot
 *  fences (a side, the back: a tree on the boundary reads as the yard's own and keeps the middle of the yard open), the front yard (the first tile and a half) last */
function treeSpots(W: number, D: number, r: () => number): [number, number][] {
  const out: { x: number; y: number; k: number }[] = [];
  for (let x = LINE_M; x <= W - LINE_M + 1e-9; x += 1) for (let y = LINE_M; y <= D - LINE_M + 1e-9; y += 1) {
    const jx = (r() - 0.5) * 0.6, jy = (r() - 0.5) * 0.6, px = Math.min(W - LINE_M, Math.max(LINE_M, x + jx)), py = Math.min(D - LINE_M, Math.max(LINE_M, y + jy));
    out.push({ x: px, y: py, k: Math.min(px, W - px, D - py) + (py < 2.4 ? 2.5 : 0) + r() * 1.2 });
  }
  return out.sort((a, b) => a.k - b.k).slice(0, TRIES).map(p => [p.x, p.y]);
}
/** lays a lot's trees: up to MAX_TREES, each from the owner's real trees (autolot.ts realTrees) at a size of its own, at the first spot where its picture, in
 *  the autumn art and the desert art, covers no building, drive or path, its trunk stands inside the lot, and it keeps SPACING from the trees before it.
 *  Returns how many were laid (a lot too small for one has none) */
export function cleanTrees(B: Build, f: PresetFrame, keep: TreeKeep, r: () => number, pool: readonly string[] = realTrees()): number {
  const { W, D } = B;
  if (!pool.length) return 0;
  const grounds = keep.ground.map(b => boxOnScreen(f, b)), laid: { x: number; y: number }[] = [];
  for (const [sx, sy] of treeSpots(W, D, r)) {
    if (laid.length >= MAX_TREES) break;
    for (let attempt = 0; attempt < 2; attempt++) {
      const id = pool[Math.floor(r() * pool.length)]!, t = turned(id, f.q), item = LIB_AT.get(t.id);
      if (item === undefined) continue;
      const s = ownerScaleOf(id) * (SIZE_LO + (SIZE_HI - SIZE_LO) * r()) * (attempt === 1 ? 0.8 : 1), h = footprintOf(t.id, s, t.flip);
      const x = Math.min(Math.max(sx, LINE_M + (h[2] - h[0]) / 2), W - LINE_M - (h[2] - h[0]) / 2), y = Math.min(Math.max(sy, LINE_M + (h[3] - h[1]) / 2), D - LINE_M - (h[3] - h[1]) / 2);
      const c = toWorld(f, x, y), ax = c.x - (h[0] + h[2]) / 2, ay = c.y - (h[1] + h[3]) / 2;
      if (laid.some(p => Math.hypot(p.x - c.x, p.y - c.y) < SPACING)) break;
      const rects = treeRects(item, ax, ay, t.flip, s);
      if (rects.some(q => keep.houses.some(b => rectsHit(q, b, HOUSE_M)) || grounds.some(g => rectHitsQuad(q, g)))) continue;
      if (!B.atW({ id: t.id, s, flip: t.flip, h } satisfies Spec, c, { plant: true })) continue;
      laid.push(c); break;
    }
  }
  return laid.length;
}

// ---------------------------------------------------------------- the hedge of a road at 45 degrees
/** the shrubs a hedge is laid with and the gap between them (tiles): round ones, which read as a hedge along any line (autolot.ts HEDGE) */
const HEDGE_STEP = 1.7, HEDGE_SIZE = 0.8;
/** a hedge along a boundary line of the lot (frame a, b: from the first point to the second), a shrub every HEDGE_STEP tiles, none where a drive or a path
 *  (lot-frame boxes, a margin each side) crosses it. Returns how many shrubs were laid */
export function hedgeRun(B: Build, a0: number, b0: number, a1: number, b1: number, open: readonly Box[], r: () => number): number {
  const len = Math.hypot(a1 - a0, b1 - b0), n = Math.max(1, Math.round(len / HEDGE_STEP));
  let laid = 0;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n, a = a0 + (a1 - a0) * t, b = b0 + (b1 - b0) * t;
    if (open.some(q => a > q[0] - 0.9 && a < q[2] + 0.9 && b > q[1] - 0.9 && b < q[3] + 0.9)) continue;
    const g = B.spec(HEDGE[Math.floor(r() * HEDGE.length)]!, { mul: HEDGE_SIZE });
    if (g && B.at(g, a, b, { boundary: true })) laid++;
  }
  return laid;
}
