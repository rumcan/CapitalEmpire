// The road tool's mouse and keys (T207, #546; the owner, 2026-10-27: "change right click to be the same as backspace when building all roads and
// enter or double click to build road"), for every road it draws (town roads, and the path tool's cart paths and drives): a click adds a point;
// a right-click without a drag takes back the last point, as Backspace does (on the first point the route is dropped); Enter or a double-click
// builds. The double-click's second click adds no point (no duplicate, no leg of no length): it builds what the preview shows. A right drag
// still pans (the engine's pan). Pure: the engine asks routeAct what to do and does it.
// #1276 (the owner, 2026-11-14: "change the way the road building works so it is a click and drag and release builds like in sim city"): the press that
// begins a route is also a drag's start. Moved on far enough, its release builds the run from the press to the pointer (the preview is the ordinary
// one, from the route's first point to the pointer: the same ghost, cost and reasons); a press and release on the same spot is the click it always was
// (the route is begun and stays in hand: click again for each bend, double-click or Enter builds). Esc, a right click or Backspace during the drag
// drops it. RouteGesture holds that state; the engine builds, cancels or leaves the route as it answers.

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

/** how far (css px) the pointer must travel from the press that began a route before the press is a drag, not a click: a hand's or a touch pad's few
 *  pixels of wobble on a click are still the click's */
export const DRAG_PX = 8;
/** the least a dragged route may be (tiles: about 4 m, the shortest road the network keeps): a shorter one is a click that wobbled (at the far zoom a
 *  tile is a few pixels), so it begins the route and builds nothing, with no "too close" refusal for a road nobody drew */
export const DRAG_MIN_TILES = 2;

/** what a press's release does: build the dragged route; nothing, the press was a click (the route it began stays in hand: click again for the next
 *  point); or nothing at all (no press of the route's was down) */
export type DragEnd = 'build' | 'click' | 'none';

/** the press, drag and release of the road tool's first point (#1276). Pure: the engine begins it when a press starts a route, feeds it the pointer's
 *  moves and its release, and cancels it with the route; it never touches the route itself. */
export class RouteGesture {
  private d: { sx: number; sy: number; moved: boolean } | null = null;
  /** whether the press that began the route is still down (a release, a cancel or a lost release ends it) */
  get down(): boolean { return this.d !== null; }
  /** whether the pointer has travelled DRAG_PX from the press: this press is a drag, not a click */
  get dragged(): boolean { return !!this.d?.moved; }
  /** the press at (mx, my) (css px on the map) began the route */
  begin(mx: number, my: number): void { this.d = { sx: mx, sy: my, moved: false }; }
  /** the pointer is at (mx, my) with `buttons` held (the pointer event's bits: 1 the left, 2 the right; omitted: not known). A right button joining the
   *  left (a right click during the drag) is 'cancel': the drag is over and the engine drops the route. No button down at all means the release
   *  was missed (the pointer let go outside the window): 'lost', the press is no drag any more and builds nothing */
  move(mx: number, my: number, buttons?: number): 'cancel' | 'lost' | 'none' {
    const d = this.d; if (!d) return 'none';
    if (buttons !== undefined && (buttons & 2)) { this.d = null; return 'cancel'; }
    if (buttons === 0) { this.d = null; return 'lost'; }
    if (!d.moved && Math.hypot(mx - d.sx, my - d.sy) > DRAG_PX) d.moved = true;
    return 'none';
  }
  /** the release, with `tiles` the length of the route it would build: 'build' when the press was dragged and the route is long enough to be a road;
   *  else 'click'. The press is spent either way: a second release builds nothing */
  end(tiles: number): DragEnd {
    const d = this.d; this.d = null;
    return !d ? 'none' : d.moved && tiles >= DRAG_MIN_TILES ? 'build' : 'click';
  }
  /** Esc, Backspace, a right click, a tool change: no press is down any more */
  cancel(): void { this.d = null; }
}

/** The words about the bend, in one place for the hint line, the Paths panel, Help and the Keys sheet (App.tsx, ui/keymap.ts), so the one constant that switches the 45 degree
 *  bend (route-legs.ts BEND_45, `on`) takes them all away together (#1317, the owner: "remove the 45 degree angle for now"): off, none of them speaks of 45 degrees, or of a
 *  Q key; on, they say what #1276 made them say. Shift's one straight run is not about the bend and is told either way. */
export function bendWords(on: boolean): {
  /** after "build a street" in the hint, "lay a run" and "build a road" in the panel's description */
  bends: string;
  /** the end of the hint while a route is in hand */
  handKeys: string;
  /** the panel's last line from the Bends words to the Shift sentence */
  shift: string;
  /** Help's line on the bends and Shift */
  help: string;
  /** the Keys sheet's Q row (null: none) */
  qRow: [string, string] | null;
} {
  return {
    bends: on ? ' (it bends at 45°)' : '',
    handKeys: on ? ', Q for 90° bends' : '',
    shift: on ? 'Bends are 45° (Q: 90°); hold Shift for one straight run.' : 'Hold Shift for one straight run.',
    help: on ? 'Bends are 45° (Q toggles 90° bends); hold Shift to draw one straight run in any of the eight directions.' : 'Hold Shift to draw one straight run in any of the eight directions.',
    qRow: on ? ['Q', 'bends of 45° (every game starts with them) or 90°'] : null,
  };
}
