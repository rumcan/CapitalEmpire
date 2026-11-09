// A map-data course turned and put on a map that already has things on it (T356, #998). The converter (convert.ts) makes a spec in the frame of
// its land (tiles of 2 m, x east and y south of the land's north-west corner); the placing mode turns that spec about the middle of its land
// BEFORE it is rasterised to the course grid (raster.ts paintSpec), moves it to where the player puts it, and covers the turned land with the
// few rectangles the game's ownership model holds (the land is a list of axis-aligned rects, and the build grid's shader takes 32 of them at
// most). Never a mirror: a real course is not mirrored. Pure TypeScript, no DOM, deterministic.
import type { Rect } from '../mode';
import type { OsmCourseSpec, SpecArea, SpecHole, TPt } from './types';

/** the placing mode's rotation step (R, Shift+R, the wheel with Shift), degrees; Alt turns freely */
export const ROT_STEP = 15;
/** the finest turn Alt+R makes, degrees */
export const ROT_FINE = 1;
/** the most rectangles the cover of a turned land may be (the owned-land shader takes 32 in all: golf/osm/place.ts leaves the rest for the land the player already owns) */
export const COVER_MAX = 18;

/** an angle in [0, 360): 360 is 0 (rounded to 1e-6 degrees, so a sum of steps lands on the step) */
export function normDeg(d: number): number {
  const r = Math.round((((d % 360) + 360) % 360) * 1e6) / 1e6;
  return r >= 360 ? 0 : r;
}
/** an angle snapped to the nearest step, in [0, 360) */
export const snapDeg = (d: number, step = ROT_STEP): number => normDeg(Math.round(d / step) * step);

/** cos and sin of an angle in degrees, exact for the right angles (so a quarter turn swaps the sides with no rounding in them) */
export function cosSin(deg: number): { c: number; s: number } {
  const d = normDeg(deg);
  if (d === 0) return { c: 1, s: 0 };
  if (d === 90) return { c: 0, s: 1 };
  if (d === 180) return { c: -1, s: 0 };
  if (d === 270) return { c: 0, s: -1 };
  const r = (d * Math.PI) / 180;
  return { c: Math.cos(r), s: Math.sin(r) };
}

/** a coordinate rounded to 1e-4 tile (a fraction of a millimetre: the rings of a turned course stay small and the same twice) */
const q = (v: number): number => Math.round(v * 1e4) / 1e4;

/** the outline of a spec's land in its own frame: the four corners x, y of the oriented rectangle the land is (a spec that was never turned: its
 *  frame's rectangle). A turned spec carries it (outline); its bounding box is the frame (w, h) */
export function outlineOf(spec: Pick<OsmCourseSpec, 'w' | 'h' | 'outline'>): number[] {
  return spec.outline ? spec.outline.slice() : [0, 0, spec.w, 0, spec.w, spec.h, 0, spec.h];
}

/** the size (tiles, rounded up to whole tiles) of the box round a w x h land turned by deg degrees */
export function turnedSize(w: number, h: number, deg: number): { w: number; h: number } {
  const { c, s } = cosSin(deg), tw = Math.abs(w * c) + Math.abs(h * s), th = Math.abs(w * s) + Math.abs(h * c);
  return { w: Math.max(1, Math.ceil(tw - 1e-9)), h: Math.max(1, Math.ceil(th - 1e-9)) };
}

/** the first angle (the steps of ROT_STEP from 0, else any whole degree) at which a w x h land turned fits inside a square of side `room` tiles, or null when
 *  no turn does (a land longer than the room's diagonal allows: the map cannot grow, so the course is refused) */
export function firstFittingAngle(w: number, h: number, room: number): number | null {
  const fits = (d: number) => { const t = turnedSize(w, h, d); return t.w <= room && t.h <= room; };
  for (let d = 0; d < 360; d += ROT_STEP) if (fits(d)) return d;
  for (let d = 0; d < 360; d += 1) if (fits(d)) return d;
  return null;
}

/** the spec turned by deg degrees (clockwise on the map, a rotation of the tile plane and never a mirror) about the middle of its land: every ring,
 *  tee marker, pin, aim point and hole line moves with it; the frame grows to the box round the turned land (w, h), with the land's middle at its
 *  middle. What the holes are is untouched: their order, lengths, pars, handicaps and what was made up. A spec that was turned already turns on
 *  from there (rotateSpec(rotateSpec(s, 15), 15) is rotateSpec(s, 30), to a rounding), its `rot` the sum. deg 0 gives the spec itself */
export function rotateSpec(spec: OsmCourseSpec, deg: number): OsmCourseSpec {
  const d = normDeg(deg);
  if (d === 0) return spec;
  const { c, s } = cosSin(d), cx = spec.w / 2, cy = spec.h / 2;
  const out = outlineOf(spec), turned: number[] = [];
  for (let i = 0; i < out.length; i += 2) turned.push(cx + (out[i]! - cx) * c - (out[i + 1]! - cy) * s, cy + (out[i]! - cx) * s + (out[i + 1]! - cy) * c);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < turned.length; i += 2) { x0 = Math.min(x0, turned[i]!); x1 = Math.max(x1, turned[i]!); y0 = Math.min(y0, turned[i + 1]!); y1 = Math.max(y1, turned[i + 1]!); }
  const W = Math.max(1, Math.ceil(x1 - x0 - 1e-9)), H = Math.max(1, Math.ceil(y1 - y0 - 1e-9));
  // (the turned land's middle, which is the middle of the old one, goes to the middle of the new frame)
  const dx = W / 2 - cx, dy = H / 2 - cy;
  const px = (x: number, y: number): number => q(cx + (x - cx) * c - (y - cy) * s + dx), py = (x: number, y: number): number => q(cy + (x - cx) * s + (y - cy) * c + dy);
  const flat = (a: readonly number[]): number[] => { const r: number[] = []; for (let i = 0; i + 1 < a.length; i += 2) r.push(px(a[i]!, a[i + 1]!), py(a[i]!, a[i + 1]!)); return r; };
  const pt = (p: TPt): TPt => ({ x: px(p.x, p.y), y: py(p.x, p.y) });
  const areas: SpecArea[] = spec.areas.map(a => ({ ...a, rings: a.rings.map(flat) }));
  const holes: SpecHole[] = spec.holes.map(h => ({ ...h, tees: h.tees.map(t => ({ ...t, ...pt(t) })), pin: pt(h.pin), aims: h.aims.map(pt), line: flat(h.line) }));
  // (T354: the estate's streets and houses turn with the rest)
  const estate = spec.estate ? { ...spec.estate, streets: spec.estate.streets.map(s => ({ ...s, pts: flat(s.pts) })), houses: flat(spec.estate.houses) } : undefined;
  return { ...spec, w: W, h: H, areas, holes, ...(estate ? { estate } : {}), rot: normDeg((spec.rot ?? 0) + d), outline: flat(out) };
}

/** a spec's playing length, tee to pin along the aim points, summed over its holes, m: the quantity a turn must not change (lengthM is copied by
 *  rotateSpec; this one is measured on the turned tiles, for the tests) */
export function measuredLengthM(spec: OsmCourseSpec): number {
  let sum = 0;
  for (const h of spec.holes) {
    const t = h.tees.find(k => k.kind === 'middle') ?? h.tees[0];
    if (!t) continue;
    const pts = [t, ...h.aims, h.pin];
    for (let i = 1; i < pts.length; i++) sum += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y) * 2;
  }
  return sum;
}

/** the outline of the spec's land on the map when its frame's north-west corner stands at tile (ox, oy): four corners x, y */
export function outlineAt(spec: Pick<OsmCourseSpec, 'w' | 'h' | 'outline'>, ox: number, oy: number): number[] {
  const o = outlineOf(spec), r: number[] = [];
  for (let i = 0; i < o.length; i += 2) r.push(o[i]! + ox, o[i + 1]! + oy);
  return r;
}

/** where the frame's north-west corner goes for the land's middle at tile (cx, cy): whole tiles */
export function originFor(spec: Pick<OsmCourseSpec, 'w' | 'h'>, cx: number, cy: number): { ox: number; oy: number } {
  return { ox: Math.round(cx - spec.w / 2), oy: Math.round(cy - spec.h / 2) };
}

/** the horizontal x-extent of a convex polygon (flat x, y) inside the slab y0..y1: [min x, max x], or null when the polygon misses the slab */
function slabExtent(poly: readonly number[], y0: number, y1: number): [number, number] | null {
  let lo = Infinity, hi = -Infinity;
  const n = poly.length >> 1, take = (x: number) => { if (x < lo) lo = x; if (x > hi) hi = x; };
  for (let i = 0; i < n; i++) {
    const ax = poly[2 * i]!, ay = poly[2 * i + 1]!, j = (i + 1) % n, bx = poly[2 * j]!, by = poly[2 * j + 1]!;
    if (ay >= y0 && ay <= y1) take(ax);
    for (const y of [y0, y1]) if ((ay < y && by > y) || (ay > y && by < y)) take(ax + ((y - ay) * (bx - ax)) / (by - ay));
  }
  return lo <= hi ? [lo, hi] : null;
}

/** the least rectangles (whole tiles, [x, y, w, h], disjoint, top to bottom) that cover a convex polygon: horizontal strips as thick as it takes to
 *  keep them at most `max`, each as wide as the polygon is in its slab, rounded outward; strips that come out the same width are one. A polygon with
 *  its sides along the axes is one rectangle, exactly itself. The land bought for a turned course is this cover, so the outline shown is the land got */
export function coverStrips(poly: readonly number[], max = COVER_MAX): Rect[] {
  if (poly.length < 6) return [];
  let top = Infinity, bottom = -Infinity;
  for (let i = 1; i < poly.length; i += 2) { top = Math.min(top, poly[i]!); bottom = Math.max(bottom, poly[i]!); }
  const y0 = Math.floor(top + 1e-9), y1 = Math.ceil(bottom - 1e-9), H = y1 - y0;
  if (H <= 0) return [];
  const band = Math.max(1, Math.ceil(H / Math.max(1, max))), out: Rect[] = [];
  for (let y = y0; y < y1; y += band) {
    const e = Math.min(y1, y + band), ext = slabExtent(poly, y, e);
    if (!ext) continue;
    const xa = Math.floor(ext[0] + 1e-9), xb = Math.ceil(ext[1] - 1e-9);
    if (xb <= xa) continue;
    const last = out[out.length - 1];
    if (last && last[0] === xa && last[2] === xb - xa && last[1] + last[3] === y) last[3] += e - y; else out.push([xa, y, xb - xa, e - y]);
  }
  return out;
}

/** whether a point is inside a convex polygon (flat x, y, either winding), the edge counting as inside */
export function inConvex(poly: readonly number[], x: number, y: number): boolean {
  const n = poly.length >> 1;
  let pos = false, neg = false;
  for (let i = 0; i < n; i++) {
    const ax = poly[2 * i]!, ay = poly[2 * i + 1]!, j = (i + 1) % n, cross = (poly[2 * j]! - ax) * (y - ay) - (poly[2 * j + 1]! - ay) * (x - ax);
    if (cross > 1e-9) pos = true; else if (cross < -1e-9) neg = true;
    if (pos && neg) return false;
  }
  return true;
}

/** whether a point lies in one of the rects (the half-open rule the game's ownedAt uses: the near edges in, the far ones out) */
export function inRects(rects: readonly Rect[], x: number, y: number): boolean {
  for (const r of rects) if (x >= r[0] && x < r[0] + r[2] && y >= r[1] && y < r[1] + r[3]) return true;
  return false;
}

/** the area (tiles squared) of a list of disjoint rects */
export const rectsArea = (rects: readonly Rect[]): number => rects.reduce((s, r) => s + r[2] * r[3], 0);

/** the box [x, y, w, h] round a list of rects, or null with none */
export function boundsOf(rects: readonly Rect[]): Rect | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of rects) { x0 = Math.min(x0, r[0]); y0 = Math.min(y0, r[1]); x1 = Math.max(x1, r[0] + r[2]); y1 = Math.max(y1, r[1] + r[3]); }
  return x0 <= x1 ? [x0, y0, x1 - x0, y1 - y0] : null;
}

/** the outline of a cover (strips top to bottom, as coverStrips makes them) as one polygon, flat x, y: down the left sides and up the right ones. A cover
 *  that is one rectangle is its four corners. The staircase the ghost draws, and the land bought */
export function coverOutline(cover: readonly Rect[]): number[] {
  const out: number[] = [];
  for (const r of cover) out.push(r[0], r[1], r[0], r[1] + r[3]);
  for (let i = cover.length - 1; i >= 0; i--) { const r = cover[i]!; out.push(r[0] + r[2], r[1] + r[3], r[0] + r[2], r[1]); }
  // (the points where two neighbouring strips are as wide as each other on a side repeat: dropped)
  const pts: number[] = [];
  for (let i = 0; i < out.length; i += 2) { const n = pts.length; if (n >= 2 && pts[n - 2] === out[i] && pts[n - 1] === out[i + 1]) continue; pts.push(out[i]!, out[i + 1]!); }
  if (pts.length >= 4 && pts[0] === pts[pts.length - 2] && pts[1] === pts[pts.length - 1]) { pts.pop(); pts.pop(); }
  return pts;
}
