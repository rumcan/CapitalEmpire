// T323 (#921, the owner 2026-11-04): "camera follows my character. can we not have that and change the select in the menu to a walking icon or
// a pointer. you can select either. if you select the walking icon you control your characer and it walks where you clicked otherwise you are
// selecting, make a short cut like alt to quicky swap between cursors".
// The rail's Select slot holds two cursors: Walk (a click walks your character there and uses what you clicked) and Select (the old instant
// inspector). A tap of Alt alone swaps them (a press and release with no other key or click between, so Alt+Tab and Alt+key shortcuts never
// swap; its keyup's default is prevented so the browser's menu bar never takes the focus). The mode is remembered (localStorage).
// WASD walks you (or drives your cart) in either mode; the arrow keys pan the camera, which never follows you (Me centres once). Pure, no DOM.

/** the two cursors of the rail's Select slot */
export type CursorMode = 'walk' | 'select';
/** where the mode is remembered */
export const CURSOR_KEY = 'capitalempire.cursorMode';

/** the remembered mode (Walk when none is, or the storage cannot be read) */
export function loadCursorMode(s: Pick<Storage, 'getItem'> | null): CursorMode {
  try { return s?.getItem(CURSOR_KEY) === 'select' ? 'select' : 'walk'; } catch { return 'walk'; }
}
export function saveCursorMode(s: Pick<Storage, 'setItem'> | null, m: CursorMode): void {
  try { s?.setItem(CURSOR_KEY, m); } catch { /* storage may be unavailable */ }
}

/** a lone tap of Alt: down() on every keydown, up() on every keyup (true: Alt was tapped alone, swap the cursor), other() on a click or a
 *  wheel. A keydown while typing in a text field never arms it */
export class AltTap {
  private armed = false;
  down(key: string, typing: boolean): void { this.armed = key === 'Alt' && !typing; }
  up(key: string): boolean { const t = this.armed && key === 'Alt'; this.armed = false; return t; }
  other(): void { this.armed = false; }
}

/** the walking keys (WASD only: the arrows pan the camera while you can walk) as a direction; kx, ky in -1..1 */
export function walkAxes(keys: ReadonlySet<string>): { kx: number; ky: number } {
  let kx = 0, ky = 0;
  if (keys.has('a') || keys.has('A')) kx -= 1; if (keys.has('d') || keys.has('D')) kx += 1;
  if (keys.has('w') || keys.has('W')) ky -= 1; if (keys.has('s') || keys.has('S')) ky += 1;
  return { kx, ky };
}
/** the camera's pan keys: the arrows; WASD too when you cannot walk (no character, or another tool in hand) */
export function panAxes(keys: ReadonlySet<string>, youWalk: boolean): { kx: number; ky: number } {
  let kx = 0, ky = 0;
  if (keys.has('ArrowLeft')) kx -= 1; if (keys.has('ArrowRight')) kx += 1;
  if (keys.has('ArrowUp')) ky -= 1; if (keys.has('ArrowDown')) ky += 1;
  if (!youWalk) { const w = walkAxes(keys); kx = Math.sign(kx + w.kx); ky = Math.sign(ky + w.ky); }
  return { kx, ky };
}
/** the keys your character takes (their default is prevented so the page never scrolls) */
export const WALK_KEYS: ReadonlySet<string> = new Set(['w', 'a', 's', 'd', 'W', 'A', 'S', 'D']);

/** what the camera chases this frame: your ball in flight (after a shot, until a drag of the map lets go), never your walk or your drive */
export function cameraChase(flightBall: { x: number; y: number } | null, follow: boolean): { x: number; y: number } | null {
  return flightBall && follow ? flightBall : null;
}

/** what a plain left click does with Select in hand: walk (Walk mode, your character there, no Ctrl) or select (the instant look) */
export function clickDoes(mode: CursorMode, hasYou: boolean, ctrl: boolean): CursorMode {
  return hasYou && mode === 'walk' && !ctrl ? 'walk' : 'select';
}
