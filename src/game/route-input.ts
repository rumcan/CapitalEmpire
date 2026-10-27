// The road tool's mouse and keys (T207, #546; the owner, 2026-10-27: "change right click to be the same as backspace when building all roads and
// enter or double click to build road"), for every road it draws (town roads, and the path tool's cart paths and drives): a click adds a point;
// a right-click without a drag takes back the last point, as Backspace does (on the first point the route is dropped); Enter or a double-click
// builds. The double-click's second click adds no point (no duplicate, no leg of no length): it builds what the preview shows. A right drag
// still pans (the engine's pan). Pure: the engine asks routeAct what to do and does it.

/** a click's time (ms) and place (css px on the map) */
export interface Tap { t: number; mx: number; my: number }
/** a second click within this long (ms) and this near (css px) of the first is the double-click's (the browser's own double-click: about 500 ms) */
export const DOUBLE_MS = 500, DOUBLE_PX = 6;
/** whether tap is the second click of a double-click after prev */
export const isSecondTap = (prev: Tap | null, tap: Tap): boolean => !!prev && tap.t - prev.t >= 0 && tap.t - prev.t <= DOUBLE_MS && Math.hypot(tap.mx - prev.mx, tap.my - prev.my) <= DOUBLE_PX;

/** what the user did: a left click (second: the double-click's second click), a right-click without a drag, a double-click, Enter, Backspace */
export type RouteInput = 'click' | 'right' | 'double' | 'enter' | 'backspace';
/** what the road tool does: add the point, nothing, take back the last point, drop the route, build it */
export type RouteAct = 'point' | 'none' | 'back' | 'cancel' | 'build';
/** what an input does to a route of n points */
export function routeAct(input: RouteInput, n: number, second = false): RouteAct {
  switch (input) {
    case 'click': return second ? 'none' : 'point';
    case 'right': case 'backspace': return n > 1 ? 'back' : n === 1 ? 'cancel' : 'none';
    case 'double': case 'enter': return n > 1 ? 'build' : 'none';
  }
}
