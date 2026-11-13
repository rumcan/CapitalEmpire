// J7 (#1225): the jam's Build menu as data (ui/jam/build-menu.ts) and the tips that replace the guided build (ui/jam/tips.ts). The owner: "make a better
// build menu with pictures and let the player decide. dont push them to build the practice green and chipping area"; "def add a built in dirt parking lot".
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCards, BUILD_GROUPS, HOLE_FROM, type BuildSource } from '../src/ui/jam/build-menu';
import { JAM_TIPS } from '../src/ui/jam/tips';
import { JUNK_APPEAL, JUNK_PILES, MIN_GAP, RANGE_JUNK, junkFactor, normalizeJunk } from '../src/game/golf/junk';
import { junkMetres, newRangeJunk } from '../src/game/golf/rangebiz';
import { RANGE_UPGRADES, defaultRangeBiz, normalizeRangeBiz, rangeStats, needsOf, upgradeWhy, type DemandCtx, type RangeBizSave } from '../src/game/golf/rangesave';
import type { RangeCardView } from '../src/game/golf/rangehost';

const CTX: DemandCtx = { tier: 0, exits: 1, residents: 300 };
/** the range view's fields the menu reads */
function view(b: RangeBizSave, money: number): RangeCardView {
  return {
    biz: b, demand: CTX, dayLen: 600, upkeep: 0,
    upgrades: RANGE_UPGRADES.map(u => ({ ...u, why: upgradeWhy(b, u.id, money), owned: b.owned.includes(u.id) })),
    needs: Object.fromEntries(RANGE_UPGRADES.map(u => [u.id, needsOf(u).map(n => RANGE_UPGRADES.find(q => q.id === n)!.name)])),
    practice: [{ id: 'putting', name: 'Putting green', state: 'none' }, { id: 'chipping', name: 'Chipping green and bunker', state: 'none' }],
  } as unknown as RangeCardView;
}
function src(o: { placed?: boolean; lot?: boolean; practice?: boolean; money?: number; owned?: string[]; ramp?: boolean; clubhouse?: boolean } = {}): BuildSource {
  const money = o.money ?? 75_000, b = { ...defaultRangeBiz(), owned: (o.owned ?? []) as RangeBizSave['owned'] } as RangeBizSave;
  if (o.placed === false) b.built = false;
  const placed = o.placed !== false;
  return {
    places: [
      { id: 'range', name: 'The driving range', cost: 15_000, done: placed, why: '' },
      { id: 'carpark', name: 'The car park', cost: 2_000, done: o.lot ?? placed, why: placed ? '' : 'Place your driving range first' },
      { id: 'practice', name: 'The practice area', cost: 5_000, done: !!o.practice, why: placed ? '' : 'Place your driving range first' },
    ],
    range: view(b, money), rangeUpkeep: 0,
    locks: { newHole: o.ramp ? null : 'Unlocks when the range takes $2,000 in a season, or in season 2', buildings: o.ramp ? null : 'Unlocks when the range takes $2,000 in a season, or in season 2', path: null, practice: null },
    clubhouse: { built: !!o.clubhouse, cost: 45_000, upkeep: 25 }, course: { course: { quality: 60, rep: 30, holes: 0 }, clubhouse: !!o.clubhouse }, money,
  };
}
const card = (cs: ReturnType<typeof buildCards>, id: string) => cs.find(c => c.id === id)!;

test('every card sits in one of the four groups, each group has cards, and every card has a picture and a name', () => {
  const cs = buildCards(src());
  for (const c of cs) { assert.ok(BUILD_GROUPS.some(g => g.id === c.group), c.id); assert.ok(c.name && ('scene' in c.pic ? c.pic.scene : 'tile' in c.pic ? c.pic.tile : c.pic.lib), c.id); }
  for (const g of BUILD_GROUPS) assert.ok(cs.some(c => c.group === g.id), g.id);
});
test('a new game: the range can be placed at once and is the only open Range card; everything on the range waits for it, with the reason', () => {
  const cs = buildCards(src({ placed: false }));
  const r = card(cs, 'range');
  assert.equal(r.why, null); assert.deepEqual(r.act, { k: 'place', id: 'range' }); assert.equal(r.cost, 15_000); assert.ok(r.payback);
  for (const c of cs.filter(c => c.group === 'range' && c.id !== 'range')) assert.equal(c.why, 'Place your driving range first', c.id);
  assert.equal(card(cs, 'practice').why, 'Place your driving range first');
});
test('the car park comes with the range: its card enlarges it (gravel, then paving), and places it only when there is none', () => {
  let c = card(buildCards(src()), 'carpark');
  assert.deepEqual(c.act, { k: 'upgrade', id: 'gravel' }); assert.equal(c.cost, 3_000); assert.match(c.line, /^Enlarge your car park/);
  c = card(buildCards(src({ owned: ['gravel'] })), 'carpark');
  assert.deepEqual(c.act, { k: 'upgrade', id: 'pave' });
  c = card(buildCards(src({ owned: ['gravel', 'pave'] })), 'carpark');
  assert.equal(c.done, 'Built');
  c = card(buildCards(src({ lot: false })), 'carpark');
  assert.deepEqual(c.act, { k: 'place', id: 'carpark' });
});
test('the practice area and its greens are offered like everything else: open to build in any order, never marked as a next step', () => {
  const cs = buildCards(src());
  assert.equal(card(cs, 'practice').why, null);
  assert.deepEqual(card(cs, 'practice').act, { k: 'place', id: 'practice' });
  assert.equal(card(cs, 'putting').why, 'Place the practice area first');
  const after = buildCards(src({ practice: true }));
  assert.equal(card(after, 'practice').done, 'Placed');
  assert.deepEqual(card(after, 'putting').act, { k: 'green', id: 'putting' });
  assert.equal(card(after, 'chipping').why, null);
});
test('greyed with a reason: New hole and the clubhouse until the ramp opens them, an upgrade that needs another, the cash short', () => {
  let cs = buildCards(src());
  assert.match(card(cs, 'hole').why!, /Unlocks when the range takes/);
  assert.match(card(cs, 'clubhouse').why!, /Unlocks/);
  assert.match(card(cs, 'bays12').why!, /Build 8 hitting bays first/);
  cs = buildCards(src({ ramp: true, money: 5_000 }));
  assert.match(card(cs, 'hole').why!, new RegExp(`Not enough cash: \\$${(HOLE_FROM - 5_000).toLocaleString('en-US')} short`));
  assert.match(card(cs, 'clubhouse').why!, /Not enough cash/);
  assert.match(card(cs, 'bays8').why!, /Not enough cash: \$3,000 short/);
  cs = buildCards(src({ ramp: true }));
  assert.equal(card(cs, 'hole').why, null); assert.equal(card(cs, 'clubhouse').why, null);
});
test('payback lines come from golf/payback.ts: a range upgrade has one, the clubhouse with no holes earns nothing yet, a built one shows none', () => {
  const cs = buildCards(src({ ramp: true }));
  assert.ok(card(cs, 'greens').payback); assert.equal(card(cs, 'greens').payback!.cost, 2_500);
  assert.equal(card(cs, 'clubhouse').payback!.verdict, 'none');
  assert.equal(card(buildCards(src({ ramp: true, clubhouse: true })), 'clubhouse').payback, null);
  assert.equal(card(buildCards(src({ owned: ['greens'] })), 'greens').done, 'Built');
});
test('the tips replace the step list: nothing in them orders a build, and the practice area tip says it is optional with no Show me', () => {
  for (const t of JAM_TIPS) assert.doesNotMatch(t.body, /\bfirst\b.*\bthen\b|step \d|next,/i, t.id);
  const p = JAM_TIPS.find(t => t.id === 'tip-practice')!;
  assert.match(p.title, /optional/); assert.equal(p.show, undefined);
});

test('J7: the old range for sale: its card is Buy, everything on the range waits for it, and it draws nobody until bought', () => {
  const sc = src(); const b = sc.range!.biz; b.forSale = true; sc.forSale = true;
  const cs = buildCards(sc), r = card(cs, 'range');
  assert.equal(r.name, 'Buy the driving range'); assert.deepEqual(r.act, { k: 'buyRange' }); assert.equal(r.why, null);
  assert.ok(r.payback && r.payback.extra > 0, 'the payback reads the range as it will be once bought');
  assert.equal(card(cs, 'practice').why, 'Buy the driving range first');
  assert.ok(card(cs, 'bays8').payback!.extra > 0, 'an upgrade is priced against the range once bought');
  assert.equal(rangeStats(b).appeal, 0);
  assert.equal(rangeStats({ ...b, forSale: undefined }).appeal > 0, true);
});
test('J7: the junk: a seeded scatter of library ids over the outfield, apart, each its distance; it saves and loads; each pile left costs a little appeal', () => {
  const a = newRangeJunk(42), b = newRangeJunk(42);
  assert.deepEqual(a, b, 'the same seed, the same junk'); assert.equal(a.length, JUNK_PILES);
  for (const p of a) { assert.ok(RANGE_JUNK.some(k => k.id === p.id)); assert.ok(junkMetres(p.v) >= 30, `${p.id} at ${junkMetres(p.v)} m`); }
  for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) assert.ok(Math.hypot(a[i]!.u - a[j]!.u, a[i]!.v - a[j]!.v) >= MIN_GAP);
  assert.notDeepEqual(newRangeJunk(7), a);
  const saved = normalizeRangeBiz(JSON.parse(JSON.stringify({ ...defaultRangeBiz(), forSale: true, junk: [...a, { id: 'nope', u: 1, v: 2 }, { id: a[0]!.id, u: NaN, v: 3 }] })));
  assert.equal(saved.forSale, true); assert.deepEqual(saved.junk, a, 'unknown kinds and broken spots dropped');
  assert.equal(normalizeJunk(undefined), undefined);
  assert.equal(junkFactor(0), 1); assert.ok(Math.abs(junkFactor(9) - (1 - 9 * JUNK_APPEAL)) < 1e-9); assert.equal(junkFactor(1e6), 0.5); assert.equal(junkFactor(NaN), 1);
  const clean = rangeStats(defaultRangeBiz()).appeal, dirty = rangeStats({ ...defaultRangeBiz(), junk: a }).appeal;
  assert.ok(dirty < clean && dirty > clean * 0.8, 'a small, honest effect');
});
test('J7: the Clear the junk card: one per range with junk, its price a pile, opening the range card list; none once the range is clean', () => {
  const sc = src(); sc.range!.biz.junk = newRangeJunk(1); sc.junk = { n: 9, cost: 250, first: sc.range!.biz.junk[0]!.id };
  const j = card(buildCards(sc), 'junk');
  assert.match(j.name, /9 left/); assert.deepEqual(j.act, { k: 'junk' }); assert.deepEqual(j.pic, { lib: sc.range!.biz.junk[0]!.id });
  assert.ok(j.payback && j.payback.extra > 0, 'a cleaner range draws more golfers');
  assert.equal(buildCards(src()).find(c => c.id === 'junk'), undefined);
});
