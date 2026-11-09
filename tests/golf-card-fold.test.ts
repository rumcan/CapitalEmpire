// T348 (#990): the cards at the right edge fold away while your shot is open (src/game/golf/cardfold.ts, Game.stepFoldCards): the ones open when the shot opens close and come back FOLD_BACK_MS after the shot's run ends,
// a card you open yourself during the shot stays, one you closed stays closed, a neighbour's place is not taken (the bag and the cards, the range card and the clubhouse card), and two shots close together never flicker the cards.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CardFold, FOLD_BACK_MS, type OpenCards } from '../src/game/golf/cardfold';

const none: OpenCards = { bag: false, cards: false, player: false, staff: false, club: false, range: false, event: null };
const open = (o: Partial<OpenCards>): OpenCards => ({ ...none, ...o });

test('a shot opening folds the cards open at that moment and only them; nothing happens while it stays open', () => {
  const f = new CardFold();
  assert.equal(f.on, false); assert.equal(f.step(0, false, open({ event: 'mayor', player: true })), null, 'no shot: nothing');
  const a = f.step(100, true, open({ event: 'mayor', player: true, bag: true }));
  assert.deepEqual(a, { on: true, close: { player: true, bag: true, event: 'mayor' } }); assert.equal(f.on, true);
  // the engine closes them: the next frames see none open, the shot still open: nothing to do
  for (let t = 116; t < 5000; t += 16) assert.equal(f.step(t, true, none), null);
  assert.equal(f.on, true);
  // a shot with no card open: the fold is on (the guide cards stay away) and there is nothing to close
  const g = new CardFold(); assert.deepEqual(g.step(0, true, none), { on: true, close: {} });
});

test('the cards come back FOLD_BACK_MS after the last frame the shot was open, those that were open and are still closed; a second shot inside the delay keeps them away', () => {
  const f = new CardFold();
  f.step(0, true, open({ event: 'mayor', player: true, staff: true }));
  f.step(1000, true, none); // the last frame the shot is open: the delay runs from here
  assert.equal(f.step(1000 + FOLD_BACK_MS - 1, false, none), null, 'not yet'); assert.equal(f.on, true);
  // a second shot opens inside the delay (the putt after the chip): the cards stay away, the clock starts again
  assert.equal(f.step(1000 + FOLD_BACK_MS - 1, true, none), null); f.step(4000, true, none);
  assert.equal(f.step(4000 + FOLD_BACK_MS - 1, false, none), null);
  const back = f.step(4000 + FOLD_BACK_MS, false, none);
  assert.deepEqual(back, { on: false, back: { staff: true, player: true, event: 'mayor' } }); assert.equal(f.on, false);
  assert.equal(f.step(99999, false, none), null, 'and then nothing, until the next shot');
  // the next shot folds what is open then, not what was folded before
  assert.deepEqual(f.step(100000, true, open({ bag: true })), { on: true, close: { bag: true } });
});

test('a card you open during the shot stays; one you closed stays closed; the bag and the cards, the range card and the clubhouse card never stand together; the event card comes back only to an empty place', () => {
  const f = new CardFold();
  f.step(0, true, open({ bag: true, club: true, event: 'mayor', player: true }));
  f.step(500, true, open({ player: true, cards: true, range: true })); // meanwhile: your profile opened again by hand, the Cards card opened (the bag's neighbour), the range card opened (the clubhouse card's), and the event card did not
  const b = f.step(500 + FOLD_BACK_MS, false, open({ player: true, cards: true, range: true, event: 'club' }));
  // the profile is open (stays), the bag is not brought back over the Cards card, the clubhouse card not over the range card, the Mayor's Cup not over another event's card
  assert.deepEqual(b, { on: false, back: {} });
  // and with nothing opened by hand they all come back: the bag, the clubhouse card and the event
  const g = new CardFold(); g.step(0, true, open({ bag: true, club: true, event: 'club' })); g.step(10, true, none);
  assert.deepEqual(g.step(10 + FOLD_BACK_MS, false, none), { on: false, back: { club: true, bag: true, event: 'club' } });
  // the Cards card comes back to its own place, and the range card
  const h = new CardFold(); h.step(0, true, open({ cards: true, range: true })); h.step(10, true, none);
  assert.deepEqual(h.step(10 + FOLD_BACK_MS, false, none), { on: false, back: { range: true, cards: true } });
});

test('reset drops the fold with nothing to bring back', () => {
  const f = new CardFold(); f.step(0, true, open({ player: true })); f.reset();
  assert.equal(f.on, false); assert.equal(f.step(99999, false, none), null);
});
