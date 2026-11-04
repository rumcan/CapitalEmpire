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

/** a set of held keys read by name (has) */
export interface KeysHeld { has(name: string): boolean }
/** the parts of a keyboard event the held keys read */
type KeyEv = { code: string; key: string };
type ModEv = { shiftKey: boolean; altKey: boolean; ctrlKey: boolean; metaKey: boolean };
const MOD_CODES: Record<string, string> = { ShiftLeft: 'Shift', ShiftRight: 'Shift', ControlLeft: 'Control', ControlRight: 'Control', AltLeft: 'Alt', AltRight: 'Alt', MetaLeft: 'Meta', MetaRight: 'Meta', OSLeft: 'Meta', OSRight: 'Meta' };
/** a key's name by its place on the keyboard (e.code): letters lower case whatever Shift says, Space ' ', a modifier its plain name; else e.key */
export function keyName(e: KeyEv): string {
  if (/^Key[A-Z]$/.test(e.code)) return e.code.slice(3).toLowerCase();
  if (e.code === 'Space') return ' ';
  return MOD_CODES[e.code] ?? e.key;
}
/** the movement keys a map click drops (a key really held comes back with its next repeat) */
const MOVE_NAMES = new Set(['w', 'a', 's', 'd', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);
/** T330 (#941): the keys held, by e.code (the down and the up of a key always match, whatever Shift does to e.key), read by name. The engine
 *  clears them on blur, a hidden tab, a context menu, a text field taking the focus and Esc; a map click drops the movement keys */
export class HeldKeys implements KeysHeld {
  private m = new Map<string, string>(); // e.code (or 'name:' + the name, for add) -> the name
  down(e: KeyEv & Partial<ModEv>): void { if ('shiftKey' in e) this.syncMods(e as ModEv); this.m.set(e.code || 'key:' + e.key, keyName(e)); }
  up(e: KeyEv): void {
    this.m.delete(e.code || 'key:' + e.key);
    // a key whose code the browser left out (or that went down under another id): drop it by name too
    const n = keyName(e); for (const [id, v] of this.m) if (v === n && !MOD_CODES[id]) this.m.delete(id);
  }
  has(name: string): boolean { for (const v of this.m.values()) if (v === name) return true; return false; }
  /** holds a key by name (the road fuzzer's Shift) */
  add(name: string): void { this.m.set('name:' + name, name); }
  /** lets go of a key by name, wherever it came from */
  delete(name: string): void { for (const [id, v] of this.m) if (v === name) this.m.delete(id); }
  clear(): void { this.m.clear(); }
  /** drops the movement keys (WASD, the arrows), keeping Space and the modifiers */
  clearMoves(): void { for (const [id, v] of this.m) if (MOVE_NAMES.has(v)) this.m.delete(id); }
  /** drops a modifier the event says is up (its keyup was lost: the focus went elsewhere while it was held) */
  syncMods(e: ModEv): void {
    if (!e.shiftKey) this.delete('Shift'); if (!e.altKey) this.delete('Alt'); if (!e.ctrlKey) this.delete('Control'); if (!e.metaKey) this.delete('Meta');
  }
  get size(): number { return this.m.size; }
}

/** the walking keys (WASD only: the arrows pan the camera while you can walk) as a direction; kx, ky in -1..1 */
export function walkAxes(keys: KeysHeld): { kx: number; ky: number } {
  let kx = 0, ky = 0;
  if (keys.has('a') || keys.has('A')) kx -= 1; if (keys.has('d') || keys.has('D')) kx += 1;
  if (keys.has('w') || keys.has('W')) ky -= 1; if (keys.has('s') || keys.has('S')) ky += 1;
  return { kx, ky };
}
/** the camera's pan keys: the arrows; WASD too when you cannot walk (no character, or another tool in hand) */
export function panAxes(keys: KeysHeld, youWalk: boolean): { kx: number; ky: number } {
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
