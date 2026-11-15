// The map's BUILD NOW button (#1325; the owner, 2026-11-15: "building a new hole UIX is really bad. it is not clear at all where and what to click to build the actual hole.
// Add a button to the map where you are placeing the hole you to the side of the wireframe outline that says BUILD NOW", and "add the same build now to roads"). One shared
// button for New hole and the road tool (MapBuildNow.tsx): what it says and does comes from the engine (Engine.buildNowInfo), where it stands from the engine's screen box of the
// planned thing (Engine.buildNowPlace) and the rule below. Pure (no DOM, no engine): the placement is tested alone (tests/build-now.test.ts).

import type { ToolTile } from './tool-tiles';

/** what the button says and does, from the engine: id (what is being built: 'hole' or 'road'; a new id is a new button), the picture at its left, the words ("BUILD NOW" and the
 *  price, "$12,400"), whether it can be built and, when not, why (the button is greyed and says so); build: what a click does (exactly what the panel's Build, or Enter, does) */
export interface BuildNowInfo { id: 'hole' | 'road'; tile: ToolTile; price: string; ok: boolean; why: string; build(): void }

/** the planned thing's place on screen (css px over the map), written by Engine.buildNowPlace with no allocation: the box round it and the points the button must keep clear
 *  of (the tee and the green, the route's line): x y w h; pts (x, y pairs) and n (floats used) */
export interface BuildNowPlace { x: number; y: number; w: number; h: number; pts: Float32Array; n: number }
/** room for this many points (x, y pairs) in a BuildNowPlace */
export const PLACE_PTS = 96;
export const newPlace = (): BuildNowPlace => ({ x: 0, y: 0, w: 0, h: 0, pts: new Float32Array(PLACE_PTS * 2), n: 0 });

/** a rectangle by its edges (window px) */
export interface Rect { l: number; t: number; r: number; b: number }

/** the air between the button and the outline, and how near a kept-clear point (the tee, the green, the route) the button may come (px) */
export const GAP = 14, KEEP_R = 22;
/** how far the button is nudged along the outline's side, in steps of its own size, looking for a clear spot when no side has one */
const NUDGES = 8;

const clamp = (v: number, lo: number, hi: number) => (hi < lo ? lo : Math.max(lo, Math.min(hi, v)));
/** whether the box x y w h comes within r of any kept-clear point */
function hitsPts(x: number, y: number, w: number, h: number, pts: Float32Array, n: number, r: number): boolean {
  for (let i = 0; i + 1 < n; i += 2) {
    const dx = Math.max(x - pts[i]!, 0, pts[i]! - (x + w)), dy = Math.max(y - pts[i + 1]!, 0, pts[i + 1]! - (y + h));
    if (dx * dx + dy * dy < r * r) return true;
  }
  return false;
}
/** whether the box x y w h overlaps any of the rectangles */
function hitsRects(x: number, y: number, w: number, h: number, rs: readonly Rect[]): boolean {
  for (const q of rs) if (x < q.r && x + w > q.l && y < q.b && y + h > q.t) return true;
  return false;
}
const inside = (x: number, y: number, w: number, h: number, f: Rect) => x >= f.l && y >= f.t && x + w <= f.r && y + h <= f.b;

/** where the button (bw by bh) stands beside the planned thing o: at its side away from the panels (preferLeft: the panels are on the right, so the left side first; else the right
 *  side first, then the other, then below, then above), the first place that is wholly in the free map (free: clear of the rail, the top bar and the bottom), clear of every panel
 *  (avoid) and of the kept-clear points (the tee, the green, the route). When the outline fills the free map and no side has room, the button is held inside the free map and
 *  nudged along the sides until it clears the kept points and the panels (it then stands over the outline's rough, never over the tee or the green). Writes the top left into out */
export function placeBuildNow(o: BuildNowPlace, bw: number, bh: number, free: Rect, avoid: readonly Rect[], preferLeft: boolean, out: { x: number; y: number }): void {
  const cx = o.x + o.w / 2 - bw / 2, cy = o.y + o.h / 2 - bh / 2;
  // sides in order: 0 right, 1 left, 2 below, 3 above (the preferred of right/left first)
  for (let k = 0; k < 4; k++) {
    const side = k < 2 ? (preferLeft ? 1 - k : k) : k;
    const x = side === 0 ? o.x + o.w + GAP : side === 1 ? o.x - GAP - bw : clamp(cx, free.l, free.r - bw);
    const y = side === 2 ? o.y + o.h + GAP : side === 3 ? o.y - GAP - bh : clamp(cy, free.t, free.b - bh);
    if (inside(x, y, bw, bh, free) && !hitsRects(x, y, bw, bh, avoid) && !hitsPts(x, y, bw, bh, o.pts, o.n, KEEP_R)) { out.x = x; out.y = y; return; }
  }
  // no side has room: held in the free map, nudged along the sides to a clear spot
  for (let k = 0; k < 4; k++) {
    const side = k < 2 ? (preferLeft ? 1 - k : k) : k, vertical = side < 2;
    for (let m = 0; m <= NUDGES; m++) {
      const shift = (m % 2 ? 1 : -1) * Math.ceil(m / 2) * (vertical ? bh + 6 : bw + 6);
      const x0 = side === 0 ? o.x + o.w + GAP : side === 1 ? o.x - GAP - bw : cx + (vertical ? 0 : shift);
      const y0 = side === 2 ? o.y + o.h + GAP : side === 3 ? o.y - GAP - bh : cy + (vertical ? shift : 0);
      const x = clamp(x0, free.l, free.r - bw), y = clamp(y0, free.t, free.b - bh);
      if (!hitsRects(x, y, bw, bh, avoid) && !hitsPts(x, y, bw, bh, o.pts, o.n, KEEP_R)) { out.x = x; out.y = y; return; }
    }
  }
  out.x = clamp(o.x + o.w + GAP, free.l, free.r - bw); out.y = clamp(cy, free.t, free.b - bh);
}

/** the panels' side: true when more of the panels' area stands in the left half of the window (the rail and its panel are always at the left, so the button then goes to the outline's
 *  right first); the preference is for the side away from them */
export function panelsLeft(avoid: readonly Rect[], windowW: number): boolean {
  let left = 0, right = 0;
  for (const q of avoid) { const a = (q.r - q.l) * (q.b - q.t); if ((q.l + q.r) / 2 < windowW / 2) left += a; else right += a; }
  return left > right;
}
