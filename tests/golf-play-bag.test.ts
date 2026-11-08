// T335 (#961): your bag (src/game/golf/play/bag.ts): the 14 clubs, their upgrades (Garage-sale, Club, Tour, Prototype) and the putter's shaft and head, all read by the shot model through the one
// function that stacks modifiers (mods.ts applyMods). The checks: the bag is 14 clubs and every club is in every table; a default bag is no mods at all and the original clubs play exactly as before (the golden
// guarantee); each level does what the table says through applyMods and in the model (carry, scatter, spin); the putter's shafts and heads trade feel, accuracy and luck in the model; the caddie picks among the
// bag's clubs (never the lob wedge) and without a bag as before; the bag, its mods and its clubs survive a save; buying, vouchers and fitting.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TILE_M } from '../src/game/golf/types';
import {
  CLUBS, CLUB_BASE, CLUB_GROUPS, CLUB_NAME, CLUB_ORDER, CLUB_SHORT, DEFAULT_BAG, FAMILY, FLIER_CLUB, HEADS, KIND_OF, LEVEL_FX, LEVEL_NAME, LOFT, MAX_LEVEL, PART_OF, PRICES, SHAFTS, SPIN_BACK_CAP, WIND_CLUB,
  addVoucher, allowedClubs, applyMods, bagGear, bagMods, bagView, carryFor, carryM, chooseShot, clubsOf, fitPart, forgivePips, hitShot, kitOf, levelOf, luckyPutt, normalizeBag, partWhy, priceOf, readClubs, readGameSkills, readMods,
  dayRound, rng, setThird, shotOutcome, skillFor, spinCap, spinEffect, swingEffect, upgradeClub, clubUpgradeWhy, voucherWhy,
} from '../src/game/golf/play';
import type { BagSave, Club, CourseView, GameSkills, Lie, PlayHole, Pt } from '../src/game/golf/play';
import { PRESSURE, START_SKILLS, bookRound, gameSkills, gearOf, normalizePlayer, startProfile, withBag } from '../src/game/golf/player';
import { normalizeGolfSave } from '../src/game/golf/mode';
import { HUMANS, botRound } from './helpers/swing-bot';

const flat = (lie: Lie): CourseView => ({ holes: [], lieAt: () => lie });
const O: Pt = { x: 0, y: 0 };
const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y) * TILE_M;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const iqr = (xs: number[]) => { const s = xs.slice().sort((a, b) => a - b); return s[Math.floor(s.length * 0.75)]! - s[Math.floor(s.length * 0.25)]!; };
const base = (over: Partial<GameSkills> = {}): GameSkills => ({ driving: 0.5, irons: 0.5, short: 0.5, putting: 0.5, ...over });
/** the golfer's game with a bag's gear in it */
const withGear = (bag: BagSave | null, over: Partial<GameSkills> = {}): GameSkills => ({ ...base(over), mods: bagGear(bag).mods, clubs: bagGear(bag).clubs });
const ORIGINAL: Club[] = ['driver', 'wood3', 'iron4', 'iron6', 'iron8', 'pw', 'sw', 'putter'];
const bagOf = (lv: Partial<Record<Club, number>>, more: Partial<BagSave> = {}): BagSave => normalizeBag({ v: 1, lv, ...more })!;
/** n full shots of `club` aimed `m` metres along +x on a fairway, the carry and the sideways landing of each */
function volley(sk: GameSkills | number, club: Club, m: number, n = 300, lie: Lie = 'fairway') {
  const out: { carry: number; side: number; to: Pt; spinM: number | undefined }[] = [];
  for (let k = 0; k < n; k++) { const o = hitShot(rng(70 + k, 3, 5), sk, lie, O, { x: m / TILE_M, y: 0 }, club, flat(lie)); out.push({ carry: dist(O, o.landing.at), side: o.landing.at.y * TILE_M, to: o.to, spinM: o.landing.spin }); }
  return out;
}

// ---- the 14 clubs ----

test('bag: 14 clubs (a 5-wood or a hybrid in the third wood’s slot), and every club is in every table the model reads', () => {
  const bag = clubsOf(null), hy = clubsOf({ v: 1, third: 'hybrid' });
  assert.equal(bag.length, 14); assert.equal(hy.length, 14);
  assert.deepEqual(bag, ['driver', 'wood3', 'wood5', 'iron4', 'iron5', 'iron6', 'iron7', 'iron8', 'iron9', 'pw', 'gw', 'sw', 'lw', 'putter']);
  assert.ok(hy.includes('hybrid') && !hy.includes('wood5') && bag.includes('wood5') && !bag.includes('hybrid'));
  assert.equal(CLUB_ORDER.length, 15, 'the 14 and the hybrid');
  const ids = [...CLUB_ORDER].sort();
  for (const [name, table] of Object.entries({ CLUBS, FAMILY, PART_OF, WIND_CLUB, FLIER_CLUB, SPIN_BACK_CAP, CLUB_NAME, LOFT, CLUB_SHORT, KIND_OF })) assert.deepEqual(Object.keys(table).sort(), ids, `${name} has every club`);
  assert.deepEqual(CLUB_GROUPS.flatMap(g => g.clubs).sort(), ids, 'the groups hold every club once');
  assert.deepEqual(ORIGINAL.map(c => CLUBS[c]), [250, 225, 195, 170, 145, 120, 90, 0], 'the original clubs’ carries are what they were');
});

test('bag: the clubs form a ladder: each shorter than the one before, higher in loft, taking more spin and catching less wind; the 7-iron sits between the 6 and the 8', () => {
  const full = CLUB_ORDER.filter(c => c !== 'putter');
  for (let i = 1; i < full.length; i++) {
    const a = full[i - 1]!, b = full[i]!;
    assert.ok(CLUBS[a] > CLUBS[b], `${a} carries further than ${b}`);
    assert.ok(carryM(a, 0.5) > carryM(b, 0.5));
    assert.ok(LOFT[a] < LOFT[b], `${b} has more loft`); assert.ok(SPIN_BACK_CAP[a] <= SPIN_BACK_CAP[b], `${b} takes at least as much backspin`); assert.ok(WIND_CLUB[a] >= WIND_CLUB[b], `${b} catches no more wind`);
  }
  assert.equal(CLUBS.iron7, (CLUBS.iron6 + CLUBS.iron8) / 2); assert.equal(CLUBS.iron5, (CLUBS.iron4 + CLUBS.iron6) / 2); assert.equal(CLUBS.iron9, (CLUBS.iron8 + CLUBS.pw) / 2);
  assert.equal(CLUBS.gw, (CLUBS.pw + CLUBS.sw) / 2); assert.ok(CLUBS.lw < CLUBS.sw);
  // the parts of the game: the 5-wood drives, the hybrid and the gap wedge play the irons (as the pitching wedge always did), only the lob wedge joins the sand wedge in the short game
  assert.deepEqual(['wood5', 'hybrid', 'iron5', 'iron7', 'iron9', 'gw', 'lw'].map(c => PART_OF[c as Club]), ['driving', 'irons', 'irons', 'irons', 'irons', 'irons', 'short']);
  assert.deepEqual(['wood5', 'hybrid', 'gw', 'lw'].map(c => FAMILY[c as Club]), ['wood', 'iron', 'wedge', 'wedge']);
  // a golfer’s skill for the new clubs is his part of the game’s
  const sk = base({ driving: 0.3, irons: 0.6, short: 0.2 });
  assert.deepEqual(['wood5', 'hybrid', 'iron7', 'gw', 'lw'].map(c => skillFor(sk, c as Club)), [0.3, 0.6, 0.6, 0.6, 0.2]);
});

test('bag: a default bag is no mods at all, and the original clubs play exactly as they did (kit, shots, the swing’s outcome)', () => {
  assert.deepEqual(bagMods(null), []); assert.deepEqual(bagMods(DEFAULT_BAG), []); assert.equal(bagGear(null).mods.length, 0); assert.equal(bagGear(null).clubs.length, 14);
  assert.equal(normalizeBag(DEFAULT_BAG), null); assert.equal(normalizeBag({ v: 1, lv: { driver: 0 } }), null);
  for (const club of ORIGINAL) {
    const k = applyMods(withGear(null), club);
    assert.deepEqual([k.carry, k.spread, k.sweet, k.speed, k.roll, k.mishit, k.spin, k.feel, k.luck], [1, 1, 1, 1, 1, 0, 1, 1, 0], `${club}: the identity kit`);
    assert.deepEqual(kitOf(0.4, club), kitOf(0.4, club)); assert.equal(CLUB_BASE[club], undefined, `${club} has no base character`);
  }
  // the model: every original club, lie and skill plays the same shot with the default bag in the golfer's game as with his plain skills, and the same swing’s shot
  for (const club of ORIGINAL.filter(c => c !== 'putter')) for (const lie of ['tee', 'fairway', 'rough', 'bunker'] as Lie[]) for (const s of [0.2, 0.5, 0.9]) {
    const plain = { driving: s, irons: s, short: s, putting: s };
    assert.deepEqual(hitShot(rng(5, 6, 7), plain, lie, O, { x: 70, y: 9 }, club, flat('fairway')), hitShot(rng(5, 6, 7), { ...plain, ...withGear(null, plain) }, lie, O, { x: 70, y: 9 }, club, flat('fairway')), `${club} ${lie} ${s}`);
  }
  const view = flat('fairway'), hole: PlayHole = { n: 1, par: 4, tee: O, pin: { x: 90, y: 0 }, line: [O, { x: 90, y: 0 }] };
  for (const club of ORIGINAL) {
    const input = { club, aim: club === 'putter' ? { x: 89, y: 1 } : hole.pin, power: club === 'putter' ? 1.1 : 0.8, swing: { power: 0.95, acc: 0.07, boost: 0.02 }, spin: club === 'putter' ? undefined : { x: 0.3, y: -0.5, pump: 3 }, v: 2 };
    const from = club === 'putter' ? { x: 83, y: 0 } : O;
    for (let k = 0; k < 8; k++) assert.deepEqual(shotOutcome(view, hole, from, 'fairway', withGear(null, { driving: 0.4, irons: 0.4, short: 0.4, putting: 0.4 }), input, rng(9, k, 4)), shotOutcome(view, hole, from, 'fairway', { driving: 0.4, irons: 0.4, short: 0.4, putting: 0.4 }, input, rng(9, k, 4)), `${club} ${k}`);
  }
  // the new clubs have a character of their own: a hybrid forgives and runs on, a lob wedge lands soft and is hard to hit, a gap wedge lands a little softer than the pitching wedge
  const hy = applyMods(withGear(null), 'hybrid'), lw = applyMods(withGear(null), 'lw'), w5 = applyMods(withGear(null), 'wood5'), gw = applyMods(withGear(null), 'gw');
  assert.ok(hy.spread < 1 && hy.sweet > 1 && hy.roll > 1 && hy.mishit < 0, 'the hybrid forgives and runs on'); assert.ok(lw.spread > 1 && lw.sweet < 1 && lw.roll < 1 && lw.mishit > 0, 'the lob wedge lands soft and is hard to hit');
  assert.ok(w5.spread < 1 && w5.sweet > 1 && w5.roll > 1); assert.ok(gw.roll < 1 && gw.spread === 1);
  assert.ok(forgivePips(hy) > forgivePips(applyMods(withGear(null), 'iron4')) && forgivePips(lw) === 1 && forgivePips(applyMods(withGear(null), 'iron6')) === 2);
});

// ---- upgrades ----

test('upgrades: each level is its table’s numbers through applyMods, for that club only; levels only improve a club; a bag’s mods are plain data that survive a save', () => {
  assert.deepEqual(LEVEL_NAME, ['Garage-sale', 'Club', 'Tour', 'Prototype']); assert.equal(MAX_LEVEL, 3);
  for (const club of ['driver', 'wood3', 'iron7', 'pw', 'gw', 'sw', 'lw', 'putter'] as Club[]) {
    let prev = applyMods(withGear(null), club);
    for (let lv = 1; lv <= 3; lv++) {
      const k = applyMods(withGear(bagOf({ [club]: lv })), club), fx = LEVEL_FX[KIND_OF[club]][lv - 1]!, p0 = applyMods(withGear(null), club);
      assert.ok(Math.abs(k.carry - p0.carry * (fx.carry ?? 1)) < 1e-12 && Math.abs(k.spread - p0.spread * (fx.spread ?? 1)) < 1e-12 && Math.abs(k.sweet - p0.sweet * (fx.sweet ?? 1)) < 1e-12 && Math.abs(k.spin - (fx.spin ?? 1)) < 1e-12 && Math.abs(k.feel - (fx.feel ?? 1)) < 1e-12 && Math.abs(k.mishit - (p0.mishit + (fx.mishit ?? 0))) < 1e-12, `${club} ${LEVEL_NAME[lv]}`);
      assert.ok(k.carry >= prev.carry && k.spread <= prev.spread && k.sweet >= prev.sweet && k.spin >= prev.spin && k.mishit <= prev.mishit && forgivePips(k) >= forgivePips(prev), `${club}: ${LEVEL_NAME[lv]} is no worse than the level before`);
      prev = k;
    }
    assert.ok(forgivePips(prev) > forgivePips(applyMods(withGear(null), club)), `${club}: a Prototype forgives more than a Garage-sale one`);
  }
  // the woods gain distance, the irons spin and forgiveness, the wedges spin, the putter feel
  const at3 = (club: Club) => applyMods(withGear(bagOf({ [club]: 3 })), club);
  assert.ok(at3('driver').carry > 1.05 && at3('iron6').carry > 1.02 && at3('iron6').carry < at3('driver').carry && at3('sw').carry === 1 && at3('sw').spin > at3('iron6').spin && at3('putter').feel > 1);
  // only that club: a Tour 7-iron changes the 7-iron and nothing else
  const t7 = withGear(bagOf({ iron7: 2 }));
  for (const c of CLUB_ORDER) assert.equal(applyMods(t7, c).sweet !== applyMods(withGear(null), c).sweet, c === 'iron7', `${c}`);
  // the carry the caddie and the meter read follows the upgrade (carryFor), and the bag’s mods carry ids and names
  assert.ok(Math.abs(carryFor(withGear(bagOf({ driver: 3 })), 'driver') / carryFor(withGear(null), 'driver') - LEVEL_FX.driver[2].carry!) < 1e-12);
  const rich = bagOf({ driver: 3, iron7: 1, gw: 2, putter: 2 }, { third: undefined, shaft: 'whip', head: 'lie' }), mods = bagMods(rich);
  assert.deepEqual(mods.map(m => m.id), ['club:driver:3', 'club:iron7:1', 'club:gw:2', 'club:putter:2', 'shaft:whip', 'head:lie']);
  assert.equal(mods[0]!.name, 'Prototype driver'); assert.deepEqual(mods[0]!.clubs, ['driver']); assert.deepEqual(mods[4]!.clubs, ['putter']);
  assert.deepEqual(readMods(JSON.parse(JSON.stringify(mods))), mods, 'through a save: the same mods, nothing dropped or made global');
  assert.ok(mods.length < 64);
});

test('upgrades in the model: a Tour driver carries further, a Prototype iron scatters less, a Tour wedge puts more spin on the ball; a sweet spot wider by the level takes a click error that missed before', () => {
  const c0 = mean(volley(withGear(null), 'driver', 400).map(x => x.carry)), c1 = mean(volley(withGear(bagOf({ driver: 2 })), 'driver', 400).map(x => x.carry)), c3 = mean(volley(withGear(bagOf({ driver: 3 })), 'driver', 400).map(x => x.carry));
  assert.ok(Math.abs(c1 / c0 - LEVEL_FX.driver[1].carry!) < 0.012 && Math.abs(c3 / c0 - LEVEL_FX.driver[2].carry!) < 0.012 && c3 > c1 && c1 > c0, `driver carry: ${c0.toFixed(1)} -> ${c1.toFixed(1)} -> ${c3.toFixed(1)} m`);
  const s0 = iqr(volley(withGear(null), 'iron7', 130, 800).map(x => x.side)), s3 = iqr(volley(withGear(bagOf({ iron7: 3 })), 'iron7', 130, 800).map(x => x.side));
  assert.ok(Math.abs(s3 / s0 - LEVEL_FX.iron[2].spread!) < 0.09, `iron scatter x${(s3 / s0).toFixed(2)}`);
  // spin: the same dot and clicks on a green: a better wedge pulls the ball back further (its backspin cap and the lie’s share are higher)
  const view = flat('fairway'), hole: PlayHole = { n: 1, par: 4, tee: O, pin: { x: 30, y: 0 }, line: [O, { x: 30, y: 0 }] }, spinIn = { x: 0, y: -0.4, pump: 1 };
  const back = (sk: GameSkills) => mean(Array.from({ length: 60 }, (_, k) => shotOutcome(view, hole, O, 'fairway', sk, { club: 'sw', aim: hole.pin, power: 1, spin: spinIn }, rng(3, k, 1)).landing!.spin ?? 0));
  assert.ok(back(withGear(bagOf({ sw: 3 }))) < back(withGear(null)) - 0.5, `spin's change to the run: ${back(withGear(null)).toFixed(2)} m plain, ${back(withGear(bagOf({ sw: 3 }))).toFixed(2)} m with a Prototype wedge`);
  assert.ok(spinCap('iron6', 'fairway', 0, -1, undefined, 1.3) > spinCap('iron6', 'fairway', 0, -1) && spinCap('iron6', 'rough', 0, -1, undefined, 2) > spinCap('iron6', 'rough', 0, -1) && spinCap('iron6', 'fairway', 0, -1, undefined, 1) === spinCap('iron6', 'fairway', 0, -1), 'more grooves, more spin; 1 changes nothing');
  assert.equal(spinEffect({ x: 0, y: -1, pump: 20 }, 'driver', 'fairway').back, SPIN_BACK_CAP.driver); assert.ok(spinEffect({ x: 0, y: -1, pump: 20 }, 'driver', 'fairway', undefined, 1.5).back > SPIN_BACK_CAP.driver);
  // the sweet spot: an accuracy click 0.052 off the snap line is a (small) pull at skill 0.5, and straight with a Prototype club’s wider sweet spot (the meter reads the kit’s `sweet`)
  const click = { power: 1, acc: 0.052, boost: 0 }, shapeOf = (sk: GameSkills) => swingEffect(click, skillFor(sk, 'iron6'), false, applyMods(sk, 'iron6').sweet).shape;
  assert.equal(shapeOf(withGear(null)), 'pull'); assert.equal(shapeOf(withGear(bagOf({ iron6: 3 }))), 'straight');
  // and the model plays it: the saved outcome decides the miss from the golfer’s clubs
  const hole2: PlayHole = { n: 1, par: 4, tee: O, pin: { x: 80, y: 0 }, line: [O, { x: 80, y: 0 }] };
  const aim = (sk: GameSkills) => shotOutcome(view, hole2, O, 'fairway', sk, { club: 'iron6', aim: hole2.pin, power: 1, swing: click }, rng(4, 1, 4)).landing!.at.y;
  assert.notEqual(aim(withGear(bagOf({ iron6: 3 }))), aim(withGear(null)));
});

test('upgrades over rounds: a full bag of Prototypes plays a club golfer’s round better than the default bag, the default bag as well as no bag at all', () => {
  const view = course(), sk0 = base({ driving: 0.3, irons: 0.26, short: 0.24, putting: 0.28 }), all3 = Object.fromEntries(CLUB_ORDER.map(c => [c, 3])) as Record<Club, number>;
  const total = (sk: GameSkills) => { let t = 0; for (let seed = 1; seed <= 24; seed++) t += botRound(view, sk, HUMANS.club, seed, 3, undefined, [0, 1, 3, 4, 5, 6]).total; return t / 24; };
  const plain = total(sk0), dflt = total({ ...sk0, ...withGear(null, sk0) }), proto = total({ ...sk0, ...withGear(bagOf(all3), sk0) });
  assert.ok(proto < plain - 1, `six holes: ${plain.toFixed(1)} plain, ${dflt.toFixed(1)} default bag, ${proto.toFixed(1)} with a Prototype bag`);
  assert.ok(Math.abs(dflt - plain) < 1, 'the default bag’s finer ladder plays the model’s own average: it picks the same parts of the game');
});

// ---- the putter ----

test('putter: a whippy shaft trades accuracy for feel and luck, a stiff counter-balanced one feel for accuracy, a lie-angle balanced head squares the face; each is plain data on the putter only', () => {
  const kit = (shaft: string, head = 'blade') => applyMods(withGear(normalizeBag({ v: 1, shaft, head, own: { shaft: [shaft], head: [head] } })), 'putter');
  const stock = kit('stock'), whip = kit('whip'), stiff = kit('stiff'), mallet = kit('stock', 'mallet'), lie = kit('stock', 'lie'), both = kit('whip', 'lie');
  assert.deepEqual([stock.feel, stock.sweet, stock.luck, stock.spread], [1, 1, 0, 1], 'the stock putter');
  assert.ok(whip.feel > 1 && whip.spread < 1 && whip.luck > 0 && whip.sweet < 1, 'whippy: feel and luck up, line down');
  assert.ok(stiff.sweet > 1 && stiff.feel < 1 && stiff.luck === 0, 'stiff: line up, feel down');
  assert.ok(whip.feel > stock.feel && stock.feel > stiff.feel && stiff.sweet > stock.sweet && stock.sweet > whip.sweet, 'a trade in both ways');
  assert.ok(mallet.sweet > 1 && mallet.feel < 1 && lie.sweet > mallet.sweet && lie.feel < 1, 'a mallet forgives; the lie-angle balanced head keeps the face squarest, and a little numb');
  assert.equal(both.luck, 0, 'the lie-angle balanced head takes the lip-outs (and the lucky drops) out of a whippy shaft: luck never falls below none');
  // only the putter
  const g = withGear(normalizeBag({ v: 1, shaft: 'whip', own: { shaft: ['whip'] } }));
  for (const c of CLUB_ORDER.filter(x => x !== 'putter')) assert.deepEqual([applyMods(g, c).feel, applyMods(g, c).luck], [1, 0], `${c} is untouched by the putter’s shaft`);
  // the touch stat is still the putter’s own: with the putter’s shaft the kits stack
  assert.ok(applyMods({ ...g, touch: 0.8 }, 'putter').spread < whip.spread && applyMods({ ...g, touch: 0.8 }, 'putter').sweet > whip.sweet);
});

test('putter in the model: feel holds the pace error; the stiff shaft keeps the line click; luck drops a miss now and then and lips a putt out now and then, and takes a draw only when it is there', () => {
  const view = flat('green'), hole: PlayHole = { n: 1, par: 4, tee: O, pin: { x: 6, y: 0 }, line: [O, { x: 6, y: 0 }] }; // the cup 6 tiles (12 m) from the tee
  const gearOfParts = (shaft: string, head = 'blade') => withGear(normalizeBag({ v: 1, shaft, head, own: { shaft: [shaft], head: [head] } }));
  const holed = (sk: GameSkills, swing: { power: number; acc: number; boost: number }, from: Pt, n = 700) => { let h = 0; for (let k = 0; k < n; k++) if (shotOutcome(view, hole, from, 'green', sk, { club: 'putter', aim: hole.pin, power: 1, swing, v: 2 }, rng(11, k, 2)).holed) h++; return h; };
  const near: Pt = { x: 4.5, y: 0 }; // 1.5 tiles = 3 m from the cup
  // pace: 18% long. The whippy shaft holes more of them than the stock one, and the stock more than the stiff one
  const longPace = { power: 1.18, acc: 0, boost: 0 };
  const hs = holed(gearOfParts('stock'), longPace, near), hw = holed(gearOfParts('whip'), longPace, near), hf = holed(gearOfParts('stiff'), longPace, near);
  assert.ok(hw > hs + 12 && hs > hf + 12, `pace 18% long from 3 m: ${hw} whippy, ${hs} stock, ${hf} stiff of 700`);
  // line: a click error that is a miss for the stock sweet spot is straight in the stiff shaft’s wider one
  const lineMiss = { power: 1, acc: 0.11, boost: 0 };
  const ls = holed(gearOfParts('stock'), lineMiss, near), lw = holed(gearOfParts('whip'), lineMiss, near), lf = holed(gearOfParts('stiff'), lineMiss, near);
  assert.ok(lf > ls + 100 && lf > lw + 100, `line click 0.11 off from 3 m: ${lf} stiff, ${ls} stock, ${lw} whippy of 700`);
  // luck: a perfect tap-in lips out now and then with luck and never without; a sure miss drops now and then with luck
  const tap: Pt = { x: 5.8, y: 0 }, perfect = { power: 1, acc: 0, boost: 0 };
  const t0 = holed(gearOfParts('stock'), perfect, tap, 2000), t1 = holed(gearOfParts('whip'), perfect, tap, 2000);
  assert.ok(t1 < t0 - 15, `a 0.4 m putt: ${t0} holed of 2000 without luck, ${t1} with the whippy shaft (lip-outs)`);
  const wild = { power: 1, acc: 0.25, boost: 0 }, w0 = holed(gearOfParts('stock'), wild, near, 2000), w1 = holed(gearOfParts('whip'), wild, near, 2000);
  assert.equal(w0, 0, 'a sure miss never drops without luck'); assert.ok(w1 > 15 && w1 < 120, `a sure miss from 3 m drops ${w1} of 2000 with luck`);
  // luckyPutt: no luck, no draw; luck takes exactly one
  let draws = 0; const r = () => { draws++; return 0.5; };
  assert.deepEqual(luckyPutt(r, { holed: false, leaveM: 1 }, 3, 0), { holed: false, leaveM: 1 }); assert.equal(draws, 0);
  luckyPutt(r, { holed: true, leaveM: 0 }, 3, 0.4); assert.equal(draws, 1);
  assert.deepEqual(luckyPutt(() => 0, { holed: false, leaveM: 2 }, 1, 1), { holed: true, leaveM: 0 }, 'a lucky bounce');
  assert.deepEqual(luckyPutt(() => 0, { holed: true, leaveM: 0 }, 1, 1), { holed: false, leaveM: 0.3 }, 'a lip-out leaves a tap-in');
  assert.deepEqual(luckyPutt(() => 0.99, { holed: false, leaveM: 2 }, 1, 1), { holed: false, leaveM: 2 }); assert.deepEqual(luckyPutt(() => 0.99, { holed: true, leaveM: 0 }, 1, 1), { holed: true, leaveM: 0 });
  // the stock putter’s stream is untouched: the same results as without the bag
  for (let k = 0; k < 30; k++) assert.deepEqual(shotOutcome(view, hole, near, 'green', gearOfParts('stock'), { club: 'putter', aim: hole.pin, power: 1.05, swing: { power: 1.04, acc: 0.03, boost: 0 }, v: 2 }, rng(5, k, 2)), shotOutcome(view, hole, near, 'green', base(), { club: 'putter', aim: hole.pin, power: 1.05, swing: { power: 1.04, acc: 0.03, boost: 0 }, v: 2 }, rng(5, k, 2)));
});

// ---- the caddie and the panel ----

test('the caddie picks among the clubs in the bag (a 7-iron for a 7-iron distance, never the lob wedge), the original seven without one, and the panel offers what the lie allows', () => {
  const hole = (len: number): PlayHole => ({ n: 1, par: 4, tee: O, pin: { x: len / TILE_M, y: 0 }, line: [O, { x: len / TILE_M, y: 0 }] });
  const sk = withGear(null), plain = base(), bagClubs = clubsOf(null);
  const pick = (s: GameSkills | number, d: number, lie: Lie = 'fairway') => chooseShot(lie, O, hole(d), s, false).club;
  // every club of the ladder is the pick for a distance just inside its carry
  for (const c of ['wood3', 'wood5', 'iron4', 'iron5', 'iron6', 'iron7', 'iron8', 'iron9', 'pw', 'gw', 'sw'] as Club[]) assert.equal(pick(sk, carryFor(sk, c) - 0.5), c, `${c}`);
  assert.equal(pick(sk, 20), 'sw', 'a chip is the sand wedge’s'); assert.equal(pick(sk, 12, 'rough'), 'sw');
  for (const d of [8, 25, 40, 55, 70, 90, 120, 150, 180, 220]) assert.ok(pick(sk, d) !== 'lw' && pick(sk, d) !== 'putter' && pick(sk, d) !== 'driver', `${d} m: not the lob wedge, putter or driver off the deck`);
  assert.equal(chooseShot('tee', O, hole(450), sk, true).club, 'driver'); assert.equal(chooseShot('tee', O, hole(140), sk, true).club, 'iron6', 'a short hole off the tee takes the iron');
  assert.equal(chooseShot('green', { x: 90, y: 0 }, hole(200), sk, false).club, 'putter');
  // with the hybrid for the 5-wood, the hybrid is picked where the 5-wood was
  const hy = withGear({ v: 1, third: 'hybrid' }); assert.equal(pick(hy, carryFor(hy, 'hybrid') - 0.5), 'hybrid'); assert.ok(!bagClubs.includes('hybrid'));
  // without a bag: the original seven, exactly (the same pick as before for every distance, for a number and for skills)
  const SEVEN: Club[] = ['sw', 'pw', 'iron8', 'iron6', 'iron4', 'wood3', 'driver'];
  for (const d of [10, 40, 70, 100, 130, 160, 190, 215, 240]) for (const s of [plain, 0.5 as number]) assert.ok(SEVEN.includes(pick(s, d)), `${d} m without a bag: ${pick(s, d)}`);
  // the same distance, a bag with a stronger club (a Prototype 7-iron carrying past the 6-iron): the shortest that reaches, by what each carries for him
  const strong = withGear(bagOf({ iron7: 3 }, {})), d = carryM('iron6', 0.5) - 0.2;
  assert.ok(carryFor(strong, 'iron7') <= carryFor(strong, 'iron6'));
  assert.equal(pick(strong, d), 'iron6');
  // allowedClubs
  assert.deepEqual(allowedClubs('fairway', false, bagClubs), ['wood3', 'wood5', 'iron4', 'iron5', 'iron6', 'iron7', 'iron8', 'iron9', 'pw', 'gw', 'sw', 'lw']);
  assert.deepEqual(allowedClubs('tee', true, bagClubs).slice(0, 3), ['driver', 'wood3', 'wood5']); assert.ok(allowedClubs('green', false, bagClubs).includes('putter') && !allowedClubs('rough', false, bagClubs).includes('putter'));
  assert.ok(allowedClubs('fairway', false, clubsOf({ v: 1, third: 'hybrid' })).includes('hybrid') && !allowedClubs('fairway', false, clubsOf({ v: 1, third: 'hybrid' })).includes('wood5'));
  assert.deepEqual(allowedClubs('fairway', false), ['wood3', 'iron4', 'iron6', 'iron8', 'pw', 'sw'], 'without a bag: the original');
  assert.deepEqual(allowedClubs('tee', true), ['driver', 'wood3', 'iron4', 'iron6', 'iron8', 'pw', 'sw']);
});

test('every club plays: each carries what the table says, from the tee the 5-wood is shorter than the 3-wood, and a bunker shot with the lob wedge is a splash like the sand wedge’s', () => {
  const sk = withGear(null, { driving: 0.9, irons: 0.9, short: 0.9 });
  const carry = (c: Club) => mean(volley(sk, c, 300, 160).map(x => x.carry));
  const exp = (c: Club) => carryFor(sk, c);
  for (const c of CLUB_ORDER.filter(x => x !== 'putter')) assert.ok(Math.abs(carry(c) / exp(c) - 1) < 0.045, `${c}: ${carry(c).toFixed(1)} m against ${exp(c).toFixed(1)}`); // (every club of the bag, the original eight and the new)
  assert.ok(carry('wood3') > carry('wood5') && carry('wood5') > carry('iron4') && carry('iron6') > carry('iron7') && carry('pw') > carry('gw') && carry('gw') > carry('sw') && carry('sw') > carry('lw'));
  // a bunker shot of 25 m: the sand wedge and the lob wedge both carry it (a splash is exactly the distance), the gap wedge plays a full-shot bunker lie
  const b = (c: Club) => mean(Array.from({ length: 100 }, (_, k) => dist(O, hitShot(rng(8, k, 1), sk, 'bunker', O, { x: 25 / TILE_M, y: 0 }, c, flat('fairway')).landing.at)));
  assert.ok(Math.abs(b('sw') - 25) < 3 && Math.abs(b('lw') - 25) < 3, `splash: sand ${b('sw').toFixed(1)}, lob ${b('lw').toFixed(1)} m of 25`);
  // the new clubs are in the flier table and catch the wind like their neighbours
  assert.ok(FLIER_CLUB.iron7 > 0.9 && FLIER_CLUB.wood5 < FLIER_CLUB.wood3 && WIND_CLUB.iron7 < WIND_CLUB.iron6 && WIND_CLUB.iron7 > WIND_CLUB.iron8);
});

// ---- the shop: buying, vouchers, fitting ----

test('shop: an upgrade costs its class’s price, needs the shop and the money, goes one level at a time to Prototype; a sponsor’s voucher is free up to Tour; parts you own fit free', () => {
  const ok = { shop: true, money: 1e6 }, b0 = null;
  assert.equal(priceOf('driver', 1), 900); assert.equal(priceOf('iron7', 3), 2600); assert.equal(priceOf('putter', 2), 1300); assert.equal(PRICES.wedge[0], 400);
  assert.equal(clubUpgradeWhy(b0, 'driver', ok), null); assert.equal(clubUpgradeWhy(b0, 'driver', { shop: false, shopWhy: 'No shop', money: 1e6 }), 'No shop'); assert.match(clubUpgradeWhy(b0, 'driver', { shop: true, money: 800 })!, /Needs \$900/);
  assert.equal(clubUpgradeWhy(b0, 'hybrid', ok), 'Not in your bag', 'the hybrid is not in a bag with the 5-wood');
  let { bag, cost } = upgradeClub(b0, 'driver'); assert.equal(cost, 900); assert.equal(levelOf(bag, 'driver'), 1);
  ({ bag, cost } = upgradeClub(bag, 'driver')); assert.equal(cost, 2600); ({ bag, cost } = upgradeClub(bag, 'driver')); assert.equal(cost, 7000); assert.equal(levelOf(bag, 'driver'), 3);
  assert.equal(clubUpgradeWhy(bag, 'driver', ok), 'A Prototype already'); assert.equal(upgradeClub(bag, 'driver').cost, 0); assert.equal(levelOf(upgradeClub(bag, 'driver').bag, 'driver'), 3);
  // vouchers
  assert.equal(voucherWhy(b0, 'iron6'), 'No voucher'); let v = addVoucher(b0); assert.equal(v!.vouchers, 1); assert.equal(voucherWhy(v, 'iron6'), null);
  const used = upgradeClub(v, 'iron6', true); assert.equal(used.cost, 0); assert.equal(levelOf(used.bag, 'iron6'), 1); assert.equal(used.bag?.vouchers, undefined, 'the voucher is spent');
  v = addVoucher(addVoucher(bagOf({ iron6: 2 }))); assert.equal(voucherWhy(v, 'iron6'), 'A voucher goes up to Tour'); assert.equal(levelOf(upgradeClub(v, 'iron6', true).bag, 'iron6'), 2, 'unchanged');
  for (let i = 0; i < 20; i++) v = addVoucher(v); assert.ok(v!.vouchers! <= 9);
  // the third wood: the slot keeps each club’s own level
  const w = bagOf({ wood5: 2, hybrid: 1 }); assert.equal(levelOf(w, 'wood5'), 2); assert.ok(bagMods(w).some(m => m.id === 'club:wood5:2') && !bagMods(w).some(m => m.id === 'club:hybrid:1'));
  const sw = setThird(w, 'hybrid'); assert.ok(bagMods(sw).some(m => m.id === 'club:hybrid:1') && !bagMods(sw).some(m => m.id === 'club:wood5:2')); assert.equal(setThird(setThird(w, 'hybrid'), 'wood5')?.third, undefined);
  // parts
  assert.equal(partWhy(b0, 'shaft', 'stock', ok), 'Fitted'); assert.equal(partWhy(b0, 'shaft', 'whip', ok), null); assert.match(partWhy(b0, 'shaft', 'whip', { shop: true, money: 100 })!, /Needs \$450/); assert.equal(partWhy(b0, 'head', 'moon', ok), 'No such part');
  const f1 = fitPart(b0, 'shaft', 'whip'); assert.equal(f1.cost, 450); assert.equal(f1.bag?.shaft, 'whip');
  const f2 = fitPart(f1.bag, 'shaft', 'stock'); assert.equal(f2.cost, 0); assert.equal(f2.bag?.shaft, undefined); assert.deepEqual(f2.bag?.own?.shaft, ['whip'], 'the whippy shaft stays yours');
  const f3 = fitPart(f2.bag, 'shaft', 'whip'); assert.equal(f3.cost, 0, 'a part you own fits free'); assert.equal(partWhy(f2.bag, 'shaft', 'whip', { shop: false, money: 0 }), null, 'and anywhere, with no shop');
  assert.ok(SHAFTS.length >= 3 && HEADS.length >= 3);
});

test('save: the bag survives a save whole, junk is refused, the profile keeps it, and an older save loads with the default bag', () => {
  const rich: BagSave = { v: 1, lv: { driver: 3, iron7: 1, putter: 2, hybrid: 1 }, third: 'hybrid', shaft: 'whip', head: 'lie', own: { shaft: ['whip', 'stiff'], head: ['lie'] }, vouchers: 2 };
  assert.deepEqual(normalizeBag(JSON.parse(JSON.stringify(rich))), rich);
  assert.deepEqual(normalizeBag({ v: 1, lv: { driver: 9, moon: 2, iron6: -1, pw: 'x' }, shaft: 'plasma', head: 'mallet', own: { shaft: ['whip', 'plasma', 'whip'] }, vouchers: 99, third: 'x' }), { v: 1, lv: { driver: 3 }, head: 'mallet', own: { shaft: ['whip'], head: ['mallet'] }, vouchers: 9 });
  for (const junk of [null, undefined, 5, 'x', [], {}, { lv: 4 }, { v: 1, own: [] }]) assert.equal(normalizeBag(junk), null);
  // the profile
  const p = startProfile('m'); assert.equal(p.bag, undefined); assert.deepEqual(gearOf(p).clubs, clubsOf(null)); assert.equal(gearOf(p).mods.length, 0);
  const q = withBag(p, rich); assert.deepEqual(normalizePlayer(JSON.parse(JSON.stringify(q)))!.bag, rich); assert.equal(withBag(q, null).bag, undefined);
  const old = { v: 1, name: 'Old', sex: 'm', skills: { driving: 40, irons: 30, short: 20, putting: 25, nerve: 35 }, log: [], rounds: [], today: { day: 0, n: {} }, busy: null, booked: null };
  assert.equal(normalizePlayer(old)!.bag, undefined, 'an old save has no bag: the default'); assert.equal(normalizePlayer({ ...old, bag: { lv: { driver: 'x' } } })!.bag, undefined);
  // the game your bag plays: the gear in the skills (gameSkills' third argument); without it the game as it was
  const g0 = gameSkills(START_SKILLS, PRESSURE.everyday), g1 = gameSkills(START_SKILLS, PRESSURE.everyday, gearOf(q));
  assert.equal(g0.clubs, undefined); assert.equal(g0.mods, undefined); assert.deepEqual(g1.clubs, clubsOf(rich)); assert.deepEqual(g1.mods, bagMods(rich));
  assert.deepEqual([g1.driving, g1.irons, g1.short, g1.putting], [g0.driving, g0.irons, g0.short, g0.putting], 'the skills are the skills');
  // a booked round plays with the bag, and the booking survives the save
  const booked = bookRound(q, 4, 600), back = normalizePlayer(JSON.parse(JSON.stringify(booked)))!;
  assert.deepEqual(back.booked!.skills, booked.booked!.skills); assert.deepEqual(back.booked!.skills.clubs, clubsOf(rich)); assert.ok(back.booked!.skills.mods!.length === bagMods(rich).length);
  assert.deepEqual(readGameSkills(JSON.parse(JSON.stringify(g1))), g1, 'the game reads back whole');
  // the tournament owner keeps his bag with his skills (a reload replays the same round)
  const gs = { town: { x: 1, y: 1 }, course: [0, 0, 9, 9], clubhouse: { x: 1, y: 1 }, play: { key: 3, owner: 'm', inputs: [], caddie: null, skills: JSON.parse(JSON.stringify(g1)) } } as never;
  assert.deepEqual(normalizeGolfSave(gs)!.play!.skills, g1);
});

test('save: mods and clubs a save names are read safely: a mod for clubs we do not know is dropped (never made global), the new fields are clamped, a forgiving club’s mishit can fall', () => {
  const m = readMods([{ id: 'a', clubs: ['moon'], carry: 2 }, { id: 'b', clubs: 'driver', carry: 2 }, { id: 'c', clubs: ['driver', 'moon'], carry: 2 }, { id: 'd', mishit: -0.9, luck: 5, spin: 99, feel: 0.01 }, { id: 'e', mishit: -0.02, luck: -0.5 }, { id: 'f' }]);
  assert.deepEqual(m.map(x => x.id), ['c', 'd', 'e', 'f'], 'the unknown-clubs mod and the malformed one are dropped'); assert.deepEqual(m[0]!.clubs, ['driver']);
  assert.deepEqual([m[1]!.mishit, m[1]!.luck, m[1]!.spin, m[1]!.feel], [-0.5, 1, 4, 0.25]); assert.deepEqual([m[2]!.mishit, m[2]!.luck], [-0.02, -0.5]);
  assert.deepEqual(readClubs(['driver', 'moon', 'driver', 'wood', 'putter']), ['driver', 'putter']); assert.equal(readClubs(['moon']), null); assert.equal(readClubs('driver'), null);
  assert.deepEqual(readGameSkills({ driving: 0.3, irons: 0.3, short: 0.3, putting: 0.3, clubs: ['moon'] }), { driving: 0.3, irons: 0.3, short: 0.3, putting: 0.3 }, 'no known clubs: no bag');
  // a mod's luck adds and never goes below none; mishit can fall below the base chance
  assert.ok(Math.abs(applyMods(base({ mods: [{ id: 'x', luck: 0.3 }, { id: 'y', luck: 0.2 }] }), 'putter').luck - 0.5) < 1e-12); assert.equal(applyMods(base({ mods: [{ id: 'x', luck: -0.3 }] }), 'putter').luck, 0);
  assert.ok(applyMods(base({ mods: [{ id: 'x', mishit: -0.02 }] }), 'iron6').mishit === -0.02);
});

// ---- the card ----

test('card: the bag view has the 14 clubs in four groups with their carry, launch, spin and forgiveness from the model, what the next level adds and costs, and the putter’s parts', () => {
  const sk = gameSkills(START_SKILLS, 0, gearOf({ bag: undefined })), ctx = { shop: true, money: 5000 }, v = bagView(null, sk, ctx);
  assert.equal(v.rows.length, 14); assert.deepEqual(v.groups.map(g => g.name), ['Woods', 'Irons', 'Wedges', 'Putter']); assert.deepEqual(v.groups.map(g => g.rows.length), [3, 6, 4, 1]);
  assert.equal(v.points, 0); assert.equal(v.max, 42);
  const drv = v.rows.find(r => r.club === 'driver')!, i7 = v.rows.find(r => r.club === 'iron7')!, lw = v.rows.find(r => r.club === 'lw')!, pt = v.rows.find(r => r.club === 'putter')!;
  assert.equal(drv.carryM, carryFor(sk, 'driver')); assert.equal(drv.launch, 'Low'); assert.equal(lw.launch, 'Very high'); assert.equal(lw.runs, 'lands soft'); assert.equal(v.rows.find(r => r.club === 'hybrid'), undefined);
  assert.equal(drv.spinPct, 12); assert.equal(v.rows.find(r => r.club === 'sw')!.spinPct, 100); assert.equal(pt.carryM, 0); assert.equal(pt.spinPct, 0);
  assert.equal(drv.next!.price, 900); assert.equal(drv.next!.name, 'Club'); assert.deepEqual(drv.next!.lines, ['+2% carry', 'scatter -3%', 'sweet spot +4%']); assert.equal(drv.next!.why, null); assert.equal(drv.next!.voucherWhy, 'No voucher');
  assert.equal(i7.next!.lines.includes('spin +10%'), true);
  // a Tour driver: the next is the Prototype, and the lines are what it adds over the Tour level
  const b = bagOf({ driver: 2 }), v2 = bagView(b, gameSkills(START_SKILLS, 0, bagGear(b)), ctx), d2 = v2.rows.find(r => r.club === 'driver')!;
  assert.equal(d2.levelName, 'Tour'); assert.ok(d2.carryM > drv.carryM * 1.035); assert.equal(d2.next!.name, 'Prototype'); assert.equal(d2.next!.price, 7000); assert.equal(d2.next!.why, 'Needs $7,000'); assert.ok(d2.next!.lines.some(l => /^\+1\.9% carry|^\+2% carry/.test(l)), d2.next!.lines.join());
  assert.ok(d2.forgive > drv.forgive); assert.equal(v2.points, 2);
  // no shop: the reason; busy is the engine's
  assert.equal(bagView(null, sk, { shop: false, shopWhy: 'No pro shop', money: 1e9 }).rows[0]!.next!.why, 'No pro shop');
  // the putter's fitting
  assert.equal(v.putter.shafts.length, SHAFTS.length); assert.equal(v.putter.shafts[0]!.fitted, true); assert.equal(v.putter.shafts[1]!.why, null); assert.equal(v.putter.shafts[1]!.owned, false);
  const fit = fitPart(null, 'shaft', 'whip').bag, v3 = bagView(fit, gameSkills(START_SKILLS, 0, bagGear(fit)), ctx);
  assert.equal(v3.putter.shaft, 'whip'); assert.ok(v3.putter.feel > 1.2 && v3.putter.line < 1 && v3.putter.luck > 0); assert.equal(v.putter.feel, 1);
  assert.equal(v3.putter.shafts.find(s => s.id === 'whip')!.fitted, true); assert.ok(v3.putter.shafts.find(s => s.id === 'whip')!.lines.includes('luck +25%'));
  // the hybrid in the slot
  const hv = bagView({ v: 1, third: 'hybrid' }, sk, ctx); assert.equal(hv.third.is, 'hybrid'); assert.ok(hv.rows.some(r => r.club === 'hybrid') && !hv.rows.some(r => r.club === 'wood5'));
});

// ---- a tournament owner with a bag, replayed ----

const PARS: (3 | 4 | 5)[] = [3, 4, 4, 5, 3, 4, 4, 4, 5];
function course(): CourseView {
  const holes: PlayHole[] = PARS.map((par, h) => { const y = 20 + 60 * h, tee = { x: 10, y }, pin = { x: 10 + (par === 3 ? 160 : par === 4 ? 380 : 500) / TILE_M, y }; return { n: h + 1, par, tee, pin, line: [tee, pin] }; });
  const lieAt = (x: number, y: number): Lie => {
    for (const h of holes) if (Math.hypot(x - h.pin.x, y - h.pin.y) <= 6) return 'green';
    let d = Infinity; for (const h of holes) { const dx = h.pin.x - h.tee.x, L2 = dx * dx, t = Math.max(0, Math.min(1, ((x - h.tee.x) * dx) / L2)); d = Math.min(d, Math.hypot(x - h.tee.x - dx * t, y - h.tee.y)); }
    return d <= 7.5 ? 'fairway' : d <= 40 ? 'rough' : 'out';
  };
  return { holes, lieAt };
}

test('replay: a tournament owner with a bag (new clubs, upgrades, a fitted putter) replays the same round from his saved inputs, through a save, with the caddie after', () => {
  const view = course(), bag = bagOf({ driver: 3, iron7: 2, gw: 1, putter: 2 }, { shaft: 'whip', own: { shaft: ['whip'] } }), skills = gameSkills(START_SKILLS, PRESSURE.tournament, bagGear(bag));
  const owner = { owner: 'm' as const, inputs: [], caddie: null, skills };
  // play him by hand with the clubs of his bag (a different one each shot), then through the day's round again with the saved inputs
  const first = dayRound(view, 2, 77, owner); let t = first.own!.turn; const inputs = [];
  const cycle: Club[] = ['driver', 'iron7', 'gw', 'wood5', 'iron9', 'lw', 'iron5'];
  for (let k = 0; k < 30 && t; k++) {
    const club: Club = t.lie === 'green' ? 'putter' : t.lie === 'tee' ? 'driver' : cycle[k % cycle.length]!;
    const input = { holeIdx: t.holeIdx, stroke: t.stroke, club, aim: t.suggested.aim, power: t.suggested.power, swing: { power: Math.min(1.05, t.suggested.power), acc: 0.02 * (k % 4), boost: 0 }, v: 2 };
    first.own!.live.play(input); inputs.push(first.own!.live.inputs[first.own!.live.inputs.length - 1]!); t = first.own!.live.advance();
  }
  assert.ok(inputs.length >= 20, `${inputs.length} shots played`); assert.ok(inputs.some(i => i.club === 'gw') && inputs.some(i => i.club === 'iron7') && inputs.some(i => i.club === 'lw') && inputs.some(i => i.club === 'iron9'));
  const saved = JSON.parse(JSON.stringify({ ...owner, inputs, skills: JSON.parse(JSON.stringify(skills)) })), again = dayRound(view, 2, 77, { ...saved, skills: readGameSkills(saved.skills)! });
  assert.equal(JSON.stringify(again.plan.shots), JSON.stringify(first.plan.shots), 'the same shots, the field’s too');
  // and then the caddie plays the rest (with his bag: the same twice)
  const c = dayRound(view, 2, 77, { ...saved, caddie: saved.inputs.length, skills: readGameSkills(saved.skills)! }), d = dayRound(view, 2, 77, { ...saved, caddie: saved.inputs.length, skills: readGameSkills(saved.skills)! });
  assert.equal(JSON.stringify(c.plan.shots), JSON.stringify(d.plan.shots), 'the caddie’s remaining round is the same twice');
  assert.equal(c.own!.turn, null, 'the caddie finished his group');
});
