// T323 (#921): the rail's two cursors (Walk, Select), the lone Alt tap that swaps them, the keys (WASD walk in either cursor, the arrows pan) and
// the camera, which follows your ball's flight but never your walk (src/game/golf/cursors.ts)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AltTap, CURSOR_KEY, cameraChase, clickDoes, loadCursorMode, panAxes, saveCursorMode, walkAxes } from '../src/game/golf/cursors';

const store = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, m }; };

test('the cursor is remembered (Walk by default; a broken storage falls back to Walk)', () => {
  const s = store();
  assert.equal(loadCursorMode(s), 'walk');
  saveCursorMode(s, 'select'); assert.equal(s.m.get(CURSOR_KEY), 'select'); assert.equal(loadCursorMode(s), 'select');
  saveCursorMode(s, 'walk'); assert.equal(loadCursorMode(s), 'walk');
  assert.equal(loadCursorMode(null), 'walk');
  assert.equal(loadCursorMode({ getItem: () => { throw new Error('blocked'); } }), 'walk');
  assert.doesNotThrow(() => saveCursorMode({ setItem: () => { throw new Error('full'); } }, 'select'));
});

test('a lone tap of Alt swaps; Alt with another key, a click or while typing does not', () => {
  const a = new AltTap();
  a.down('Alt', false); assert.equal(a.up('Alt'), true, 'a lone tap');
  a.down('Alt', false); a.down('Tab', false); assert.equal(a.up('Alt'), false, 'Alt+Tab');
  a.down('Alt', false); a.other(); assert.equal(a.up('Alt'), false, 'Alt+click');
  a.down('Alt', true); assert.equal(a.up('Alt'), false, 'in a text field');
  assert.equal(a.up('Alt'), false, 'a keyup with no keydown (Alt+Tab back into the window)');
  a.down('w', false); assert.equal(a.up('w'), false, 'another key');
});

test('swapping by the rail and by Alt lands on the same two cursors', () => {
  let walk = true; const s = store(); const set = (on: boolean) => { walk = on; saveCursorMode(s, on ? 'walk' : 'select'); };
  set(false); assert.equal(walk, false); assert.equal(loadCursorMode(s), 'select'); // the rail's pointer
  const a = new AltTap(); a.down('Alt', false); if (a.up('Alt')) set(!walk); assert.equal(walk, true); assert.equal(loadCursorMode(s), 'walk');
  a.down('Alt', false); if (a.up('Alt')) set(!walk); assert.equal(walk, false);
  set(true); assert.equal(walk, true); // the rail's walking figure
});

test('a click walks only in Walk (with a character, no Ctrl); otherwise it selects', () => {
  assert.equal(clickDoes('walk', true, false), 'walk');
  assert.equal(clickDoes('walk', true, true), 'select', 'Ctrl+click looks at once');
  assert.equal(clickDoes('select', true, false), 'select');
  assert.equal(clickDoes('walk', false, false), 'select', 'no character');
});

test('WASD walk (in either cursor); the arrows pan, and WASD pan too only when you cannot walk', () => {
  const k = (...a: string[]) => new Set(a);
  assert.deepEqual(walkAxes(k('w', 'd')), { kx: 1, ky: -1 });
  assert.deepEqual(walkAxes(k('A', 'S')), { kx: -1, ky: 1 });
  assert.deepEqual(walkAxes(k('ArrowLeft', 'ArrowUp')), { kx: 0, ky: 0 }, 'the arrows never walk you');
  assert.deepEqual(panAxes(k('w', 'a'), true), { kx: 0, ky: 0 }, 'WASD walk you, the camera stays');
  assert.deepEqual(panAxes(k('ArrowRight', 'ArrowDown'), true), { kx: 1, ky: 1 });
  assert.deepEqual(panAxes(k('w', 'a'), false), { kx: -1, ky: -1 }, 'no character: WASD pan as before');
  assert.deepEqual(panAxes(k('a', 'ArrowLeft'), false), { kx: -1, ky: 0 }, 'never doubled');
});

test('the camera follows the ball in flight (until a drag), never you walking or driving', () => {
  assert.equal(cameraChase(null, true), null, 'walking or driving: no flight, the camera stays put');
  assert.deepEqual(cameraChase({ x: 10, y: 20 }, true), { x: 10, y: 20 });
  assert.equal(cameraChase({ x: 10, y: 20 }, false), null, 'dragged away');
  // a walk of 10 s under the frame's rule moves the camera not at all
  const cam = { X: 5, Y: 7 };
  for (let i = 0; i < 600; i++) { const ch = cameraChase(null, true); if (ch) { cam.X += (ch.x - cam.X) * 0.1; cam.Y += (ch.y - cam.Y) * 0.1; } }
  assert.deepEqual(cam, { X: 5, Y: 7 });
});
