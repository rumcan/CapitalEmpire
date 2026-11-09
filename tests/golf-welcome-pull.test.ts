// T389 (#1049): the welcome pull. A new game starts with the Space power-spam and the spin in the air locked until a card is won (T336/T337), so it is dealt ONE silver pull on its first visit to the pro shop or its first round,
// to meet the prize machine early. Saved and idempotent: dealt once, kept through a save and load, never dealt again (a spent pull, a lost mark, an older save, a save from before the cards). Pure: golf/cards collection.ts
// (welcomeDue, grantWelcome) and the profile's save (player.ts normalizePlayer, mode.ts normalizeGolfSave); the engine's wiring is checked from its source (the Game needs a canvas).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { addCard, addPull, bestGrade, emptyCards, grantWelcome, normalizeCards, pullCount, rollPrize, takePull, welcomeDue } from '../src/game/golf/cards';
import type { CardsSave } from '../src/game/golf/cards';
import { rng } from '../src/game/golf/play';
import { normalizePlayer, startProfile, withCards } from '../src/game/golf/player';
import { normalizeGolfSave } from '../src/game/golf/mode';

const reload = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
/** the golf save a profile sits in (the same stand-in the cards' own save test uses) */
const golfSave = (p: unknown) => ({ town: { x: 1, y: 1 }, course: [0, 0, 9, 9], clubhouse: { x: 1, y: 1 }, player: reload(p) }) as never;
const newGame = (): CardsSave => startProfile('m').cards!;

test('welcome: a new game is due one silver pull, and it is dealt once: asking again changes nothing', () => {
  const fresh = newGame();
  assert.ok(welcomeDue(fresh), 'a new game’s empty cards are due it');
  const dealt = grantWelcome(fresh);
  assert.deepEqual(dealt.pulls, { bronze: 0, silver: 1, gold: 0 }, 'one silver pull'); assert.equal(pullCount(dealt), 1); assert.equal(bestGrade(dealt), 'silver');
  assert.equal(dealt.welcome, true, 'and the mark that it was dealt');
  assert.deepEqual({ ...dealt, pulls: fresh.pulls, welcome: undefined }, { ...fresh, welcome: undefined }, 'nothing else moves: no card, no slot, nothing opened');
  assert.equal(fresh.pulls.silver, 0, 'the cards passed in are not changed'); assert.equal(fresh.welcome, undefined);
  // once: no longer due, and asking again (the next visit, the next round) hands back the very same cards
  assert.ok(!welcomeDue(dealt)); assert.equal(grantWelcome(dealt), dealt, 'unchanged: the same object'); assert.deepEqual(grantWelcome(grantWelcome(fresh)), dealt, 'twice is once');
  let c = fresh; for (let i = 0; i < 5; i++) c = grantWelcome(c); assert.equal(c.pulls.silver, 1, 'five visits and rounds, one pull');
});

test('welcome: the mark and the pull survive a save and a load (the profile and the golf save), and a load never deals it again, spent or not', () => {
  const dealt = grantWelcome(newGame()), p = withCards(startProfile('m'), dealt);
  // the cards, the profile, the golf save: the pull and the mark come back whole
  assert.deepEqual(normalizeCards(reload(dealt)), dealt); assert.deepEqual(normalizePlayer(reload(p))!.cards, dealt); assert.deepEqual(normalizeGolfSave(golfSave(p))!.player!.cards, dealt);
  const back = normalizePlayer(reload(p))!.cards!; assert.equal(back.welcome, true); assert.equal(back.pulls.silver, 1); assert.ok(!welcomeDue(back), 'not due after a load');
  // a new game that has not been welcomed yet carries no mark, and is still due after a load (a save before the first visit)
  const fresh = normalizePlayer(reload(startProfile('m')))!.cards!; assert.equal(fresh.welcome, undefined); assert.ok(welcomeDue(fresh), 'a reload before the first visit changes nothing');
  assert.ok(!('welcome' in emptyCards()), 'no mark on empty cards: the saves of a game not yet welcomed stay as they were');
  // the pull spent at the machine (a card, a dud or a voucher: opened counts), saved, loaded: nothing comes back
  const prize = rollPrize(new Set(), 'silver', rng(7, 17, 3));
  let spent: CardsSave = { ...takePull(dealt, 'silver'), opened: dealt.opened + 1 };
  if (prize.kind === 'card') spent = addCard(spent, prize.card.id).cards; else if (prize.kind === 'dud') spent = { ...spent, junk: 1 };
  assert.equal(pullCount(spent), 0); assert.ok(!welcomeDue(spent), 'spent: not due again');
  const afterLoad = normalizePlayer(reload(withCards(startProfile('m'), spent)))!.cards!; assert.ok(!welcomeDue(afterLoad)); assert.equal(afterLoad.welcome, true); assert.equal(grantWelcome(afterLoad), afterLoad); assert.equal(pullCount(afterLoad), 0, 'no second pull');
  // even a save whose mark was lost (written by a build that did not know it) is not dealt it again: it has opened a pull, or still holds it
  const { welcome: _m, ...unmarked } = spent; void _m;
  assert.ok(!welcomeDue(normalizeCards(reload(unmarked))), 'opened a pull: the machine is no stranger');
  const { welcome: _w, ...holding } = dealt; void _w;
  assert.ok(!welcomeDue(normalizeCards(reload(holding))), 'the pull is still waiting: nothing on top of it');
});

test('welcome: only a new game gets it: a save from before the cards, legacy cards, and a save that has already met the machine get nothing', () => {
  // a save from before the cards has no cards at all (it keeps both mechanics): never due, and the load keeps it that way
  const old = reload(startProfile('m')) as { cards?: unknown }; delete old.cards;
  assert.equal(normalizePlayer(old)!.cards, undefined); assert.ok(!welcomeDue(undefined)); assert.ok(!welcomeDue(normalizePlayer(old)!.cards));
  // the legacy cards the first pull of such a save makes: it keeps both mechanics, so it needs no welcome
  const legacy = emptyCards(true); assert.ok(!welcomeDue(legacy)); assert.equal(grantWelcome(legacy), legacy); assert.deepEqual(legacy.pulls, { bronze: 0, silver: 0, gold: 0 });
  // an older save of the cards (a new game from before this ticket) that already earned or opened something has met the machine
  const met: [string, CardsSave][] = [
    ['owns a card', addCard(emptyCards(), 'power-mash').cards],
    ['has a pull waiting', addPull(emptyCards(), 'bronze')],
    ['has opened a pull', { ...emptyCards(), opened: 1, junk: 1 }],
    ['was paid a tournament’s', { ...emptyCards(), paid: { tourney: 3 } }],
  ];
  for (const [what, c] of met) { assert.ok(!welcomeDue(c), `a save that ${what} is not due it`); assert.equal(grantWelcome(c), c, `${what}: nothing added`); assert.ok(!welcomeDue(normalizeCards(reload(c))), `${what}, after a load`); }
  // but a new game of the same build that has simply not visited yet is due, whatever else the profile holds (skills, a log)
  assert.ok(welcomeDue(withCards(startProfile('w'), emptyCards()).cards));
});

test('welcome: the pull is an ordinary silver pull: the machine spends it, with silver’s odds, and what it wins is yours', () => {
  const dealt = grantWelcome(newGame());
  assert.equal(bestGrade(dealt), 'silver'); const after = takePull(dealt, 'silver'); assert.equal(pullCount(after), 0); assert.equal(bestGrade(after), null);
  // a seeded run of silver pulls for a collection of nothing: each is a card or a dud (a voucher is for a rarity you own every card of)
  const kinds = new Set<string>(); const r = rng(11, 17, 3);
  for (let i = 0; i < 400; i++) kinds.add(rollPrize(new Set(), 'silver', r).kind);
  assert.deepEqual([...kinds].sort(), ['card', 'dud'], 'a new game’s silver pull is a card or a dud, never a voucher');
});

test('welcome: the engine deals it from the pro shop’s three doors and the three ways a first round begins, once, through the one function that checks the mark', () => {
  const eng = readFileSync(resolve('src/game/engine.ts'), 'utf8');
  /** the body of a method, from its signature to the next method at the same indent (or the end of its own line for one-liners) */
  const body = (sig: RegExp): string => { const m = sig.exec(eng); assert.ok(m, `${sig} is in the engine`); const at = m!.index; const next = eng.indexOf('\n  /**', at + 1); return eng.slice(at, next < 0 ? at + 3000 : Math.min(next, at + 3000)); };
  for (const door of [/\n {2}openBagCard\(/, /\n {2}openCardsCard\(/, /\n {2}openVending\(/]) assert.ok(/welcomePull\('shop'\)/.test(body(door)), `${door} deals the welcome pull as a visit to the pro shop`);
  for (const start of [/\n {2}yourRoundStart\(/, /\n {2}private matchBegin\(/, /\n {2}bookedAuto\(/]) assert.ok(/welcomePull\('round'\)/.test(body(start)), `${start} deals it as the first round begins`);
  const fn = body(/\n {2}private welcomePull\(/);
  assert.ok(/welcomeDue\(c\)/.test(fn) && /grantWelcome\(c\)/.test(fn) && /bagShop\(\)\.shop/.test(fn) && /this\.setPlayer\(withCards\(/.test(fn) && /this\.toast\(/.test(fn), 'it asks welcomeDue, deals through grantWelcome, needs a shop for a visit, saves through setPlayer and says it');
  // no other place deals one (the dev hooks and the earnings add their own pulls, never the welcome mark)
  assert.equal((eng.match(/grantWelcome\(/g) ?? []).length, 1, 'one place deals it');
});
