// T330 (#941): a movement key stuck after walking with WASD, the camera scrolling down forever. The engine kept its held keys in a Set by e.key,
// so S down, Shift down (run), S up arrived as 'S' and left 's' held; a blur (Alt-Tab, the Alt tap's menu bar, a click outside) lost the keyup.
// HeldKeys (src/game/golf/cursors.ts) tracks keys by e.code and is cleared on blur, a hidden tab, a context menu, a text field's focus, Esc
// and a map click.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AltTap, HeldKeys, keyName, panAxes, walkAxes } from '../src/game/golf/cursors';

const ev = (code: string, key: string, mods: { shiftKey?: boolean; altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean } = {}) => ({ code, key, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, ...mods });

test('the old Set by e.key sticks S when Shift changes its key between down and up (the bug)', () => {
  const old = new Set<string>();
  old.add('s'); old.add('Shift'); old.delete('S'); old.delete('Shift');
  assert.deepEqual(walkAxes(old), { kx: 0, ky: 1 }); // still walking (or panning) down with nothing held
});

test('Shift pressed and released during a held S never leaves S held', () => {
  const k = new HeldKeys();
  k.down(ev('KeyS', 's')); k.down(ev('ShiftLeft', 'Shift', { shiftKey: true })); k.down(ev('KeyS', 'S', { shiftKey: true }));
  assert.ok(k.has('Shift')); assert.deepEqual(walkAxes(k), { kx: 0, ky: 1 });
  k.up(ev('KeyS', 'S', { shiftKey: true })); // released while Shift is down: e.key 'S', the code the same
  assert.deepEqual(walkAxes(k), { kx: 0, ky: 0 });
  k.up(ev('ShiftLeft', 'Shift'));
  assert.ok(!k.has('Shift')); assert.equal(k.size, 0);
  // the other order: Shift first, S down as 'S', Shift up, S up as 's'
  k.down(ev('ShiftLeft', 'Shift', { shiftKey: true })); k.down(ev('KeyS', 'S', { shiftKey: true })); k.up(ev('ShiftLeft', 'Shift')); k.up(ev('KeyS', 's'));
  assert.equal(k.size, 0);
});

test('a keydown then a blur (or a hidden tab, a context menu, a text field) stops the movement', () => {
  const k = new HeldKeys();
  k.down(ev('KeyS', 's')); k.down(ev('ArrowDown', 'ArrowDown'));
  assert.deepEqual(panAxes(k, true), { kx: 0, ky: 1 }); assert.deepEqual(panAxes(k, false), { kx: 0, ky: 1 });
  k.clear(); // the engine calls it on blur, visibilitychange (hidden), contextmenu, focusin into a field, Esc
  assert.deepEqual(panAxes(k, false), { kx: 0, ky: 0 }); assert.equal(k.size, 0);
});

test('Alt tapped while a direction is held does not stick it', () => {
  const k = new HeldKeys(), alt = new AltTap();
  k.down(ev('KeyD', 'd')); alt.down('d', false);
  k.down(ev('AltLeft', 'Alt', { altKey: true })); alt.down('Alt', false);
  assert.ok(alt.up('Alt')); k.up(ev('AltLeft', 'Alt'));
  k.up(ev('KeyD', 'd'));
  assert.equal(k.size, 0); assert.deepEqual(walkAxes(k), { kx: 0, ky: 0 });
});

test('a map click drops the movement keys (a held key comes back with its repeat) but keeps Space and Shift', () => {
  const k = new HeldKeys();
  k.down(ev('KeyW', 'w')); k.down(ev('ArrowLeft', 'ArrowLeft')); k.down(ev('Space', ' ')); k.down(ev('ShiftRight', 'Shift', { shiftKey: true }));
  k.clearMoves();
  assert.deepEqual(walkAxes(k), { kx: 0, ky: 0 }); assert.deepEqual(panAxes(k, false), { kx: 0, ky: 0 });
  assert.ok(k.has(' ')); assert.ok(k.has('Shift'));
});

test('a modifier whose keyup was lost is dropped by the next event that says it is up', () => {
  const k = new HeldKeys();
  k.down(ev('ShiftLeft', 'Shift', { shiftKey: true })); k.down(ev('AltLeft', 'Alt', { altKey: true }));
  k.syncMods({ shiftKey: false, altKey: false, ctrlKey: false, metaKey: false });
  assert.ok(!k.has('Shift')); assert.ok(!k.has('Alt'));
});

test('both Shifts held: letting one go keeps Shift held', () => {
  const k = new HeldKeys();
  k.down(ev('ShiftLeft', 'Shift', { shiftKey: true })); k.down(ev('ShiftRight', 'Shift', { shiftKey: true }));
  k.up(ev('ShiftLeft', 'Shift', { shiftKey: true })); assert.ok(k.has('Shift'));
  k.up(ev('ShiftRight', 'Shift')); assert.ok(!k.has('Shift'));
});

test('keys are named by their place on the keyboard (letters lower case, Space as a space); add and delete by name still work (roadfuzz)', () => {
  assert.equal(keyName(ev('KeyS', 'S')), 's'); assert.equal(keyName(ev('Space', ' ')), ' '); assert.equal(keyName(ev('ControlRight', 'Control')), 'Control');
  assert.equal(keyName(ev('', 'Unidentified')), 'Unidentified'); assert.equal(keyName(ev('Digit1', '!')), '!');
  const k = new HeldKeys(); k.add('Shift'); assert.ok(k.has('Shift')); k.delete('Shift'); assert.ok(!k.has('Shift'));
});
