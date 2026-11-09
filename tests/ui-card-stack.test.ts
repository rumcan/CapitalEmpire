// T394 (#1061): the cards at the right edge stand side by side, never one under another (ui/golf/card-stack.ts; the playtest: the Staff card opened under
// the Player card, "the element at the Staff card's centre top is player-card", most of it out of reach). The card on the right (the Range card, the
// Clubhouse card, a place's, a hole's, the event announcement), the Staff card, your profile, then your bag or your cards: each one column left of the cards
// open before it. Pure, Node.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { STACK_ORDER, stackCol, stackFit, stackRight, type StackCard, type StackOpen } from '../src/ui/golf/card-stack';

const open = (...on: StackCard[]): StackOpen => ({ main: on.includes('main'), staff: on.includes('staff'), player: on.includes('player'), bag: on.includes('bag') });

test('every combination of open cards stands in its own column, from the edge in (the Staff card was hidden under your profile)', () => {
  for (let m = 0; m < 16; m++) {
    const on = STACK_ORDER.filter((_, i) => m & (1 << i)), o = open(...on);
    assert.deepEqual(on.map(c => stackCol(o, c)), on.map((_, i) => i), `${on.join(' + ') || 'none'}: one column each, no two alike`);
  }
});

test('the playtest case: the Staff card with your profile open: the Staff card at the edge, the profile to its left (both stood at the edge before)', () => {
  assert.equal(stackCol(open('staff', 'player'), 'staff'), 0);
  assert.equal(stackCol(open('staff', 'player'), 'player'), 1);
  // all of them: the card on the right, Staff, profile, cards
  const all = open('main', 'staff', 'player', 'bag');
  assert.deepEqual(STACK_ORDER.map(c => stackCol(all, c)), [0, 1, 2, 3]);
});

test('the layouts that worked stand where they stood: the Staff card beside the Clubhouse card, your profile beside a card on the right, the bag beside both', () => {
  assert.equal(stackCol(open('staff'), 'staff'), 0, 'the Staff card alone: at the edge');
  assert.equal(stackCol(open('main', 'staff'), 'staff'), 1, 'beside the Clubhouse card (T214)');
  assert.equal(stackCol(open('player'), 'player'), 0, 'your profile alone: at the edge (T241)');
  assert.equal(stackCol(open('main', 'player'), 'player'), 1, 'beside the card on the right');
  assert.equal(stackCol(open('bag'), 'bag'), 0, 'your bag alone: at the edge (T335)');
  assert.equal(stackCol(open('main', 'bag'), 'bag'), 1); assert.equal(stackCol(open('player', 'bag'), 'bag'), 1);
  assert.equal(stackCol(open('main', 'player', 'bag'), 'bag'), 2, 'beside your profile and the card on the right');
});

test('the guides stand left of the card on the right and the Staff card (they are hidden while your profile, bag or cards are open)', () => {
  const guide = (o: StackOpen) => stackCol({ ...o, player: false, bag: false }, 'bag');
  assert.equal(guide(open()), 0, 'no card open: at the edge'); assert.equal(guide(open('main')), 1); assert.equal(guide(open('staff')), 1); assert.equal(guide(open('main', 'staff')), 2);
});

test('stackRight: the classes the cards were given before (23rem, 45rem; 19.5rem, 41rem, 63rem beside the Budget panel), and one more column; held to what fits', () => {
  assert.deepEqual([0, 1, 2, 3].map(c => stackRight(c, false)), ['right-3', 'right-[23rem]', 'right-[45rem]', 'right-[67rem]']);
  assert.deepEqual([0, 1, 2, 3].map(c => stackRight(c, true)), ['right-[19.5rem]', 'right-[41rem]', 'right-[63rem]', 'right-[85rem]']);
  assert.equal(stackRight(9, false), 'right-[67rem]', 'past the table: the last column');
  assert.equal(stackRight(3, false, 3), 'right-[45rem]', 'held to the 3 that fit: over the last column, not off the screen');
  assert.equal(stackRight(2, true, 2), 'right-[41rem]'); assert.equal(stackRight(-1, false), 'right-3');
});

test('stackFit: three columns at 1280 wide (the playtest window), two beside the Budget panel, at least one, four at most', () => {
  assert.equal(stackFit(1280, false), 3); assert.equal(stackFit(1280, true), 2); assert.equal(stackFit(1366, false), 3);
  assert.equal(stackFit(800, false), 1); assert.equal(stackFit(320, true), 1); assert.equal(stackFit(1920, false), 4); assert.equal(stackFit(3840, true), 4);
});

test("the classes are written whole in the source, where Tailwind's scanner reads them (a built class name would never get its rule)", () => {
  const src = readFileSync('src/ui/golf/card-stack.ts', 'utf8');
  for (const c of ['right-3', 'right-[19.5rem]', 'right-[23rem]', 'right-[41rem]', 'right-[45rem]', 'right-[63rem]', 'right-[67rem]', 'right-[85rem]']) assert.ok(src.includes(`'${c}'`), c);
});
