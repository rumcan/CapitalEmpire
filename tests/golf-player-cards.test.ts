// T336 (#962): your cards (src/game/golf/cards): the catalogue as data (parody names, every effect plain `Mod`s the shot model reads through the one function that stacks them, mods.ts applyMods), the 8 slots (swapped
// between rounds, never in one), the mechanics a card unlocks (the Space power-spam and spin added in the air: gated in the model for a new game, kept by a save from before the cards), the earning table, the vending
// machine's odds and reel, the save, and the golden guarantee: no cards (and a save from before them) play every shot exactly as before.
// (tests/golf-cards.test.ts is the tournament's draft cards, an older thing with a like name.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TILE_M } from '../src/game/golf/types';
import {
  CLUB_IDS, CLUB_ORDER, LEGACY_MECH, MECH_IDS, applyMods, bagGear, carryFor, dayRound, hasMech, hitShot, kitOf, normalizeBag, readGameSkills, readMech, readMods, rng, shotOutcome, spinEffect,
} from '../src/game/golf/play';
import type { Club, CourseView, GameSkills, Lie, PlayHole, Pt } from '../src/game/golf/play';
import {
  CARDS, DUDS, EARN_TABLE, GRADES, MATCH_BIG_STAKE, PULLS_MAX, RARITIES, RARITY_ODDS, DUD_SHARE, REEL_AFTER, REEL_STOP, SLOTS,
  addCard, addPull, bestGrade, cardById, cardEffects, cardLines, cardMods, cardsGear, createSpin, earnFromMatch, earnFromPlace, emptyCards, equipCard, equipWhy, equipped, normalizeCards, oddsView, ownsCard, practiceFactor,
  rollPrize, takePull, unequipCard, unequipWhy, weightedPick,
} from '../src/game/golf/cards';
import type { CardDef, CardsSave, Grade } from '../src/game/golf/cards';
import { PRESSURE, START_SKILLS, bookRound, gameSkills, gearFor, gearOf, normalizePlayer, practicePreview, startProfile, withBag, withCards } from '../src/game/golf/player';
import { normalizeGolfSave } from '../src/game/golf/mode';

const flat = (lie: Lie): CourseView => ({ holes: [], lieAt: () => lie });
const O: Pt = { x: 0, y: 0 };
const base = (over: Partial<GameSkills> = {}): GameSkills => ({ driving: 0.5, irons: 0.5, short: 0.5, putting: 0.5, ...over });
const ORIGINAL: Club[] = ['driver', 'wood3', 'iron4', 'iron6', 'iron8', 'pw', 'sw', 'putter'];
const card = (id: string): CardDef => cardById(id)!;
const withCardMods = (ids: string[], over: Partial<GameSkills> = {}): GameSkills => ({ ...base(over), mods: ids.flatMap(id => cardMods(card(id))) });
/** cards that own these and have them in the first slots */
const owning = (ids: string[], legacy = false): CardsSave => { let c = emptyCards(legacy); for (const id of ids) c = equipCard(addCard(c, id).cards, id); return c; };
/** a seeded stream for the odds' draws */
const seeded = (seed: number) => rng(seed, 17, 3);

// ---- the catalogue ----

test('catalogue: every card is data: a made-up name, a rarity, an effect, its words and its inspiration; ids and names are unique; every rarity has cards; no trademark or real name', () => {
  assert.ok(CARDS.length >= 15, `${CARDS.length} cards in the starter set`);
  assert.equal(new Set(CARDS.map(c => c.id)).size, CARDS.length, 'ids are unique'); assert.equal(new Set(CARDS.map(c => c.name)).size, CARDS.length, 'names are unique');
  for (let r = 0; r < RARITIES.length; r++) assert.ok(CARDS.some(c => c.rarity === r), `a ${RARITIES[r]!.name} card`);
  assert.deepEqual(RARITIES.map(r => r.id), ['common', 'uncommon', 'rare', 'epic', 'legendary']);
  // overpowered is the owner's brief ("we can always delete some"): a legendary dwarfs a common
  const mark = (c: CardDef) => (c.fx.mods ?? []).reduce((a, m) => a + Math.abs((m.carry ?? 1) - 1) + Math.abs((m.sweet ?? 1) - 1) + Math.abs((m.spread ?? 1) - 1) + Object.values(m.stats ?? {}).reduce((s, v) => s + Math.abs(v ?? 0), 0), 0);
  assert.ok(mark(card('pro-in-a-bottle')) > mark(card('lead-tape')) * 3, 'the legendary bottle dwarfs a roll of lead tape');
  const bad = /\b(titleist|callaway|taylor ?made|ping|cobra|mizuno|srixon|cleveland|scotty|cameron|odyssey|nike|adidas|footjoy|puma|garmin|trackman|bushnell|aimpoint|tiger|rory|mcilroy|scheffler|koepka|mickelson|nicklaus|palmer|wham-o|hula hoop|bob does|internet invitational|good good|pelz|sik)\b/i;
  for (const c of CARDS) {
    for (const [k, v] of Object.entries({ name: c.name, text: c.text, flavour: c.flavour, inspiration: c.inspiration })) { assert.ok(v.length >= (k === 'name' ? 4 : 10), `${c.id}.${k} has words`); assert.ok(!bad.test(v), `${c.id}.${k} names no trademark or real person: ${v}`); }
    assert.ok(c.rarity >= 0 && c.rarity <= 4); assert.ok(c.fx.mods?.length || c.fx.mech?.length || c.fx.practice, `${c.id} does something`);
  }
  for (const d of DUDS) { assert.ok(!bad.test(d.name) && !bad.test(d.quote), d.id); assert.ok(d.name && d.quote); }
  assert.ok(DUDS.length >= 6 && new Set(DUDS.map(d => d.id)).size === DUDS.length, 'the golf junk');
  assert.ok(DUDS.some(d => /Tee/.test(d.name)) && DUDS.some(d => /Retriever/.test(d.name)) && DUDS.some(d => /Pencil/.test(d.name)), 'a broken tee, a ball retriever with no head, a scorecard pencil');
});

test('catalogue: a card’s mods are plain Mod data the model reads: known clubs and families, factors in range, they survive a save unchanged, and its words say what it does', () => {
  for (const c of CARDS) {
    const mods = cardMods(c); assert.equal(mods.length, c.fx.mods?.length ?? 0);
    assert.deepEqual(readMods(JSON.parse(JSON.stringify(mods))), mods, `${c.id}: the mods survive a save as they are`);
    for (const m of mods) { assert.ok(m.id.startsWith(`card:${c.id}`) && m.name === c.name); for (const cl of m.clubs ?? []) assert.ok(CLUB_IDS.includes(cl), `${c.id}: ${cl} is a club or a family`); }
    for (const k of c.fx.mech ?? []) assert.ok((MECH_IDS as readonly string[]).includes(k), `${c.id}: ${k} is a mechanic`);
    assert.ok(cardLines(c).length >= 1, `${c.id} has lines`);
  }
  assert.deepEqual(cardLines(card('wonder-wedge')), ['Wedges: -10% carry · spin +40%']);
  assert.deepEqual(cardLines(card('long-drive-shaft')), ['Driver: +10% carry · sweet spot -20%']);
  assert.deepEqual(cardLines(card('flatstick')), ['Putter: leave -50% · sweet spot +30% · line +80%']);
  assert.deepEqual(cardLines(card('pro-in-a-bottle')), ['+15 to every skill and stat']);
  assert.deepEqual(cardLines(card('power-mash')), ['Unlocks: Space power-spam']); assert.deepEqual(cardLines(card('mid-flight-whisper')), ['Unlocks: spin in the air']);
  assert.deepEqual(cardLines(card('range-rat')), ['Practice gains +50%']); assert.ok(cardLines(card('hot-driver')).includes('Banned in competition'));
  assert.ok(cardLines(card('overspeed-sticks'))[0]!.includes('+10 power'));
});

// ---- card effects through applyMods ----

test('effects: each card changes the kit of the clubs it is for and no others, through applyMods alone', () => {
  const ID = [1, 1, 1, 1, 1, 0, 1, 1, 1, 0];
  const row = (k: ReturnType<typeof applyMods>) => [k.carry, k.spread, k.sweet, k.speed, k.roll, k.mishit, k.spin, k.feel, k.line, k.luck];
  const identity = (k: ReturnType<typeof applyMods>) => row(k).every((v, i) => v === ID[i]);
  const kits = (ids: string[], club: Club, over: Partial<GameSkills> = {}) => applyMods(withCardMods(ids, over), club);
  // the Infomercial Wonder-Wedge: the three wedges (a family), spin up and distance down; the pitching wedge is an iron and is left alone
  for (const c of ['gw', 'sw', 'lw'] as Club[]) { const k = kits(['wonder-wedge'], c), p = applyMods(base(), c); assert.equal(k.spin, 1.4); assert.ok(Math.abs(k.carry - 0.9) < 1e-12); assert.equal(k.spread, p.spread); }
  for (const c of ['driver', 'iron7', 'pw', 'putter'] as Club[]) assert.ok(identity(kits(['wonder-wedge'], c)), `${c} untouched`);
  assert.ok(carryFor(withCardMods(['wonder-wedge']), 'sw') < carryFor(base(), 'sw') * 0.91 && carryFor(withCardMods(['wonder-wedge']), 'sw') > carryFor(base(), 'sw') * 0.89);
  // the Long Drive Shaft: the driver only: +10% carry (about 25 yd), a narrower sweet spot
  const d = kits(['long-drive-shaft'], 'driver'); assert.ok(Math.abs(d.carry - 1.1) < 1e-12 && Math.abs(d.sweet - 0.8) < 1e-12); assert.ok(identity(kits(['long-drive-shaft'], 'wood3')));
  const yd = (carryFor(withCardMods(['long-drive-shaft'], { driving: 0.5 }), 'driver') - carryFor(base({ driving: 0.5 }), 'driver')) * 1.09361; assert.ok(yd > 20 && yd < 30, `${yd.toFixed(1)} yd more`);
  // the putter cards: the Flatstick halves the leave and nearly doubles the line window; the Arm-Lock trades feel for line; the Lucky Ball Marker gives luck; none touches the woods
  const f = kits(['flatstick'], 'putter'); assert.equal(f.line, 1.8); assert.equal(f.sweet, 1.3); assert.equal(f.spread, 0.5); assert.ok(identity(kits(['flatstick'], 'driver')));
  const a = kits(['arm-lock'], 'putter'); assert.ok(a.line > 1 && a.feel < 1 && a.sweet > 1); const b = kits(['broomstick'], 'putter'); assert.ok(b.line > a.line && b.feel < a.feel, 'the broomstick is straighter and number than the arm-lock');
  assert.equal(kits(['lucky-marker'], 'putter').luck, 0.35); assert.equal(kits(['lucky-marker'], 'iron6').luck, 0);
  // Hybrid Hero: the hybrid and the 5-wood only; Lead Tape: the woods (a family); Tour Van Fitting: every club, against that club's own plain kit
  for (const c of ['hybrid', 'wood5'] as Club[]) { const k = kits(['hybrid-hero'], c); assert.ok(k.carry > 1.04 && k.spread < 0.85 && k.sweet > 1.2 && k.mishit < 0); }
  assert.ok(identity(kits(['hybrid-hero'], 'iron6')) && identity(kits(['hybrid-hero'], 'wood3')));
  for (const c of ['driver', 'wood3', 'wood5'] as Club[]) assert.ok(kits(['lead-tape'], c).sweet > 1.1); assert.ok(identity(kits(['lead-tape'], 'iron6')));
  for (const c of CLUB_ORDER) { const k = kits(['tour-van-fitting'], c), p = applyMods(base(), c); assert.ok(Math.abs(k.spread / p.spread - 0.9) < 1e-9 && Math.abs(k.sweet / p.sweet - 1.12) < 1e-9 && Math.abs(k.mishit - p.mishit + 0.01) < 1e-9, c); }
  // stat cards raise the stats the model reads: Overspeed Sticks power (the woods most), the Hoop accuracy (a tighter scatter, a wider sweet spot, a slower marker), the bottle all seven
  assert.ok(carryFor(withCardMods(['overspeed-sticks']), 'driver') > carryFor(base(), 'driver') * 1.019 && carryFor(withCardMods(['overspeed-sticks']), 'putter') === carryFor(base(), 'putter'));
  const h = kits(['swing-hoop'], 'iron6'); assert.ok(h.spread < 1 && h.sweet > 1 && h.speed < 1);
  const bt = kits(['pro-in-a-bottle'], 'driver'), bp = kits(['pro-in-a-bottle'], 'putter'); assert.ok(Math.abs(bt.skill - 0.65) < 1e-12 && Math.abs(bp.skill - 0.65) < 1e-12 && bt.carry > 1 && bt.spread < 1 && bp.spread < 1);
  assert.ok(Math.abs(bt.stats.power - 0.65) < 1e-12 && Math.abs(bt.stats.touch - 0.65) < 1e-12);
  // cards stack in slot order, after the bag's: two cards for the driver multiply
  const both = kits(['long-drive-shaft', 'hot-driver'], 'driver'); assert.ok(Math.abs(both.carry - 1.1 * 1.18) < 1e-12 && Math.abs(both.sweet - 0.8 * 1.15) < 1e-12);
  // the model reads it: a driver with the Long Drive Shaft flies further for the same strike; the Wonder-Wedge's wedge takes more spin for the same dot
  const v = flat('fairway'), flyCarry = (sk: GameSkills) => { let s = 0; for (let k = 0; k < 60; k++) s += hitShot(rng(40 + k, 1, 2), sk, 'tee', O, { x: 300 / TILE_M, y: 0 }, 'driver', v).landing.at.x * TILE_M; return s / 60; };
  assert.ok(flyCarry(withCardMods(['long-drive-shaft'])) > flyCarry(base()) * 1.07, 'the shaft carries further in the model');
  const spinOf = (sk: GameSkills) => spinEffect({ x: 0, y: -1, pump: 0 }, 'sw', 'fairway', undefined, kitOf(sk, 'sw').spin).back;
  assert.ok(spinOf(withCardMods(['wonder-wedge'])) > spinOf(base()), 'more backspin gets on with the wedge');
});

test('effects: a card’s mechanics and practice bonus come from its fx, the practice bonus multiplies, and a card banned in competition is switched off in one', () => {
  const c = owning(['power-mash', 'mid-flight-whisper', 'range-rat', 'hot-driver', 'long-drive-shaft']);
  const e = cardEffects(c); assert.deepEqual(e.mech, ['boost', 'airspin']); assert.equal(e.practice, 1.5);
  assert.deepEqual(e.mods.map(m => m.id), ['card:hot-driver', 'card:long-drive-shaft'], 'the mods in slot order');
  const ec = cardEffects(c, true); assert.deepEqual(ec.mods.map(m => m.id), ['card:long-drive-shaft'], 'the banned card sits in its slot and does nothing in competition'); assert.deepEqual(ec.mech, ['boost', 'airspin'], 'the other cards stay in play');
  assert.equal(practiceFactor(owning(['range-rat'])), 1.5); assert.equal(practiceFactor(undefined), 1); assert.equal(practiceFactor(emptyCards()), 1);
  // gear: the bag's mods first, then the cards'; the clubs are the bag's
  const bag = normalizeBag({ v: 1, lv: { driver: 2 } })!, p = withCards(withBag(startProfile('m'), bag), c);
  const g = gearOf(p), gc = gearOf(p, true); assert.deepEqual(g.mods.slice(0, bagGear(bag).mods.length), bagGear(bag).mods, 'the bag’s mods come first'); assert.equal(g.mods.length, bagGear(bag).mods.length + 2); assert.equal(gc.mods.length, bagGear(bag).mods.length + 1);
  assert.deepEqual(g.clubs, bagGear(bag).clubs); assert.equal(gearOf(p), gearOf(p), 'remembered'); assert.equal(gearOf(p, true), gearOf(p, true));
  assert.equal(gearFor(p, PRESSURE.tournament).mods.length, gc.mods.length, 'a tournament’s pressure is competition'); assert.equal(gearFor(p, PRESSURE.match).mods.length, g.mods.length, 'a money match is not'); assert.equal(gearFor(p, PRESSURE.everyday).mods.length, g.mods.length);
  // a golfer with no card mods keeps the bag's very same mods list
  assert.equal(cardsGear(bagGear(null), emptyCards()).mods, bagGear(null).mods);
});

// ---- the golden guarantee: no cards, and a save from before them, play as before ----

const view = flat('fairway'), hole: PlayHole = { n: 1, par: 4, tee: O, pin: { x: 90, y: 0 }, line: [O, { x: 90, y: 0 }] };
const plain = { driving: 0.4, irons: 0.4, short: 0.4, putting: 0.4 };
const swingOf = (club: Club, boost: number) => ({ club, aim: club === 'putter' ? { x: 89, y: 1 } : hole.pin, power: club === 'putter' ? 1.1 : 0.8, swing: { power: 0.95, acc: 0.07, boost }, spin: club === 'putter' ? undefined : { x: 0.3, y: -0.5, pump: 3 }, v: 2 });

test('golden: a profile with no cards (a save from before them) and a new game’s empty ones play every shot of the original clubs exactly as the plain skills do', () => {
  const old = startProfile('m'); delete (old as { cards?: unknown }).cards; // (a save from before the cards)
  const fresh = startProfile('m'); // (a new game: empty cards)
  assert.equal(old.cards, undefined); assert.ok(fresh.cards && !fresh.cards.legacy && fresh.cards.own.length === 0 && fresh.cards.slots.length === SLOTS);
  assert.equal(gearOf(old), bagGear(null), 'no cards: the bag’s gear itself'); assert.deepEqual(gearOf(fresh).mods, bagGear(null).mods); assert.deepEqual(gearOf(fresh).clubs, bagGear(null).clubs); assert.deepEqual(gearOf(fresh).mech, [], 'a new game has no mechanic');
  const gOld = gameSkills(START_SKILLS, PRESSURE.everyday, gearOf(old)), gNew = gameSkills(START_SKILLS, PRESSURE.everyday, gearOf(fresh)), g0 = gameSkills(START_SKILLS, PRESSURE.everyday, bagGear(null));
  assert.deepEqual(gOld, g0, 'a save from before the cards: the same game'); assert.equal(gOld.mech, undefined); assert.deepEqual({ ...gNew, mech: undefined }, { ...g0, mech: undefined }, 'a new game: the same, but its list of mechanics');
  for (const club of ORIGINAL) for (const lie of ['tee', 'fairway', 'rough', 'bunker'] as Lie[]) for (const s of [0.2, 0.5, 0.9]) {
    if (club === 'putter') continue;
    const p = { driving: s, irons: s, short: s, putting: s };
    assert.deepEqual(hitShot(rng(5, 6, 7), p, lie, O, { x: 70, y: 9 }, club, flat('fairway')), hitShot(rng(5, 6, 7), { ...gameSkills(START_SKILLS, 0, gearOf(fresh)), ...p }, lie, O, { x: 70, y: 9 }, club, flat('fairway')), `${club} ${lie} ${s}`);
  }
  // the model's whole shot (the swing's outcome, the spin, the putt) with the game of a profile with no cards and one with empty cards: identical for a swing without the two moves
  for (const club of ORIGINAL) {
    const from = club === 'putter' ? { x: 83, y: 0 } : O;
    for (let k = 0; k < 8; k++) {
      const input = { ...swingOf(club, 0), spin: club === 'putter' ? undefined : { x: 0.3, y: -0.5, pump: 0 } }, want = shotOutcome(view, hole, from, 'fairway', plain, input, rng(9, k, 4));
      assert.deepEqual(shotOutcome(view, hole, from, 'fairway', { ...gameSkills(START_SKILLS, 0, gearOf(old)), ...plain }, input, rng(9, k, 4)), want, `${club} ${k}: no cards`);
      assert.deepEqual(shotOutcome(view, hole, from, 'fairway', gameSkills({ ...START_SKILLS, driving: 40, irons: 40, short: 40, putting: 40 }, 0, gearOf(fresh)), input, rng(9, k, 4)).to, want.to, `${club} ${k}: empty cards`);
    }
  }
  // the legacy mechanics: a game with no list of them boosts and pumps exactly as before; a plain skill number too
  for (const club of ORIGINAL.filter(c => c !== 'putter')) for (let k = 0; k < 6; k++) {
    const input = swingOf(club, 0.04), a = shotOutcome(view, hole, O, 'fairway', plain, input, rng(3, k, 9)), b = shotOutcome(view, hole, O, 'fairway', 0.4, input, rng(3, k, 9));
    assert.equal(a.sw!.boost, 0.04); assert.equal(a.spin!.pump, 3); assert.equal(b.sw!.boost, 0.04); assert.equal(b.spin!.pump, 3);
  }
  assert.deepEqual(LEGACY_MECH, ['boost', 'airspin']); assert.ok(hasMech(0.4, 'boost') && hasMech(plain, 'airspin') && hasMech(null, 'boost') && hasMech(undefined, 'airspin'));
});

test('mechanics: without the card the Space power-spam and the spin added in the air count for nothing in the model; with it they play; a save’s list round-trips', () => {
  const none = { ...plain, mech: [] as never[] }, boostOnly = { ...plain, mech: ['boost' as const] }, spinOnly = { ...plain, mech: ['airspin' as const] };
  const input = swingOf('iron6', 0.05); let dNone = 0, dBoost = 0;
  const along = (o: ReturnType<typeof shotOutcome>) => o.landing!.at.x * TILE_M;
  for (let k = 0; k < 24; k++) {
    const r = () => rng(11, k, 2), a = shotOutcome(view, hole, O, 'fairway', none, input, r()), b = shotOutcome(view, hole, O, 'fairway', boostOnly, input, r()), c = shotOutcome(view, hole, O, 'fairway', spinOnly, input, r());
    assert.equal(a.sw!.boost, 0, 'no card: the boost is none'); assert.equal(a.spin!.pump, 0, 'no card: the clicks in the air are none');
    assert.equal(b.sw!.boost, 0.05, 'Power Mash: the boost plays'); assert.equal(b.spin!.pump, 0, 'but not the spin'); assert.equal(c.sw!.boost, 0, 'Mid-Flight Whisper: no boost'); assert.equal(c.spin!.pump, 3, 'the spin plays');
    dNone += along(a); dBoost += along(b);
    // the same stream and the same swing without the moves: identical to the locked game's
    assert.deepEqual(shotOutcome(view, hole, O, 'fairway', none, swingOf('iron6', 0), r()).to, shotOutcome(view, hole, O, 'fairway', none, { ...swingOf('iron6', 0), spin: { x: 0.3, y: -0.5, pump: 0 } }, r()).to);
  }
  assert.ok(dBoost > dNone, 'the unlocked boost adds distance: it is real');
  // the saved input keeps what was played (the clamped boost and clicks): the outcome the engine writes into the save
  const o = shotOutcome(view, hole, O, 'fairway', none, input, rng(1, 2, 3)); assert.equal(o.sw!.boost, 0); assert.equal(o.spin!.pump, 0);
  // a save's list: known ids without repeats; an empty list stays empty (nothing unlocked); not a list at all is no list (the legacy set)
  assert.deepEqual(readMech(['boost', 'moon', 'boost', 5]), ['boost']); assert.deepEqual(readMech([]), []); assert.equal(readMech(undefined), undefined); assert.equal(readMech('boost'), undefined);
  assert.deepEqual(readGameSkills({ ...plain, mech: [] }), { ...plain, mech: [] }); assert.deepEqual(readGameSkills({ ...plain, mech: ['airspin', 'x'] }), { ...plain, mech: ['airspin'] }); assert.equal(readGameSkills(plain)!.mech, undefined);
});

test('mechanics: cards give them; a legacy profile keeps the two it always had; a new game has none until a card unlocks one', () => {
  const g = (p: ReturnType<typeof startProfile>) => gameSkills(START_SKILLS, PRESSURE.everyday, gearOf(p));
  const fresh = startProfile('m'), pm = withCards(fresh, owning(['power-mash'])), both = withCards(fresh, owning(['power-mash', 'mid-flight-whisper']));
  assert.ok(!hasMech(g(fresh), 'boost') && !hasMech(g(fresh), 'airspin')); assert.ok(hasMech(g(pm), 'boost') && !hasMech(g(pm), 'airspin')); assert.ok(hasMech(g(both), 'boost') && hasMech(g(both), 'airspin'));
  const legacy = withCards(fresh, emptyCards(true)); assert.ok(hasMech(g(legacy), 'boost') && hasMech(g(legacy), 'airspin'), 'a legacy profile with cards still has them, and a card adds to them');
  assert.deepEqual(gearOf(withCards(fresh, owning(['wonder-wedge'], true))).mech, ['boost', 'airspin']);
  // an owned card that is not in a slot gives nothing: owning is not enough
  const owned = addCard(emptyCards(), 'power-mash').cards; assert.ok(!hasMech(g(withCards(fresh, owned)), 'boost'), 'in the collection, not in a slot');
  // the saved game of a booking keeps the list
  const bk = bookRound(withCards(fresh, owning(['power-mash'])), 3, 600), back = normalizePlayer(JSON.parse(JSON.stringify(bk)))!;
  assert.deepEqual(back.booked!.skills.mech, ['boost']); assert.deepEqual(back.cards, bk.cards);
  const old = startProfile('m'); delete (old as { cards?: unknown }).cards; assert.equal(bookRound(old, 3, 600).booked!.skills.mech, undefined, 'a save from before the cards books a round with the legacy mechanics');
});

// ---- the 8 slots ----

test('slots: eight; the first free one by default, a picked one swaps; a card is in one slot; the collection is kept; never mid-round; never a card you do not own', () => {
  assert.equal(SLOTS, 8); const ids = CARDS.map(c => c.id);
  let c = emptyCards(); assert.equal(c.slots.length, 8); assert.ok(c.slots.every(s => s === null));
  assert.equal(equipWhy(c, ids[0]!), 'You do not have this card yet'); assert.equal(equipWhy(c, 'moon'), 'Not a card');
  for (const id of ids) c = addCard(c, id).cards;
  assert.equal(addCard(c, ids[0]!).isNew, false, 'a card is owned once'); assert.equal(c.own.length, ids.length);
  for (let k = 0; k < 8; k++) { assert.equal(equipWhy(c, ids[k]!), null); c = equipCard(c, ids[k]!); assert.equal(c.slots[k], ids[k]); }
  assert.equal(equipped(c).length, 8); assert.equal(equipWhy(c, ids[8]!), 'All 8 slots are full: pick a slot to swap it in'); assert.equal(equipCard(c, ids[8]!), c, 'no slot: unchanged');
  assert.equal(equipWhy(c, ids[0]!), 'Already in a slot');
  // a swap: the ninth card into slot 3 puts that slot's card back in the collection (still owned)
  assert.equal(equipWhy(c, ids[8]!, 3), null); const s = equipCard(c, ids[8]!, 3); assert.equal(s.slots[3], ids[8]); assert.ok(!s.slots.includes(ids[3]!) && ownsCard(s, ids[3]!), 'swapped out, still owned');
  // a card already in play moves to another slot (it leaves the first)
  const m = equipCard(unequipCard(c, 6), ids[0]!, 6); assert.equal(m.slots[6], ids[0]); assert.equal(m.slots[0], null); assert.equal(m.slots.filter(x => x === ids[0]).length, 1);
  assert.equal(equipWhy(c, ids[0]!, 0), 'Already in that slot'); assert.equal(equipWhy(c, ids[9]!, 8), 'No such slot'); assert.equal(equipWhy(c, ids[9]!, -1), 'No such slot');
  // between rounds, never in one: the engine's reason blocks the swap and the unequip
  const why = 'You are out on the course: your cards change when the round is over';
  assert.equal(equipWhy(c, ids[8]!, 3, why), why); assert.equal(unequipWhy(c, 3, why), why); assert.equal(unequipWhy(c, 3), null); assert.equal(unequipWhy(unequipCard(c, 3), 3), 'Nothing in that slot'); assert.equal(unequipWhy(c, 8), 'Nothing in that slot');
  assert.equal(equipWhy(emptyCards(), ids[0]!, 0, why), 'You do not have this card yet', 'not owning comes first');
  const u = unequipCard(c, 2); assert.equal(u.slots[2], null); assert.ok(ownsCard(u, ids[2]!)); assert.equal(u.own.length, c.own.length);
  assert.equal(unequipCard(emptyCards(), 0).slots[0], null);
});

test('slots: eight cards of the catalogue in play at once stack through applyMods without breaking the model (in order, nothing past the limits a save keeps)', () => {
  let c = emptyCards(); for (const d of CARDS.slice(-8)) c = equipCard(addCard(c, d.id).cards, d.id);
  const mods = cardEffects(c).mods; assert.ok(mods.length >= 6 && mods.length <= 24, `${mods.length} mods`);
  assert.equal(readMods(JSON.parse(JSON.stringify(mods))).length, mods.length, 'every mod survives a save');
  const sk = base({ mods }); for (const club of CLUB_ORDER) { const k = applyMods(sk, club); for (const v of [k.carry, k.spread, k.sweet, k.speed, k.roll, k.spin, k.feel, k.line]) assert.ok(Number.isFinite(v) && v > 0, `${club}`); assert.ok(k.skill >= 0 && k.skill <= 1 && k.luck >= 0); }
});

// ---- the earning table ----

test('earning: a title pays gold, 2nd and 3rd silver, the top quarter bronze, a money-match win bronze (silver for a big stake); a loss, a tie of a match and a poor finish pay nothing', () => {
  assert.deepEqual(earnFromPlace(1, 24, 'the Club Championship'), { grade: 'gold', why: 'Won the Club Championship' });
  assert.equal(earnFromPlace(2, 24, 'the Mayor’s Cup')!.grade, 'silver'); assert.equal(earnFromPlace(3, 24, 'x')!.grade, 'silver'); assert.equal(earnFromPlace(4, 24, 'x')!.grade, 'bronze'); assert.equal(earnFromPlace(6, 24, 'x')!.grade, 'bronze');
  assert.equal(earnFromPlace(7, 24, 'x'), null, 'a quarter of 24 is 6'); assert.equal(earnFromPlace(24, 24, 'x'), null);
  assert.equal(earnFromPlace(null, 24, 'x'), null, 'did not play or did not finish'); assert.equal(earnFromPlace(0, 24, 'x'), null);
  assert.equal(earnFromPlace(1, 1, 'x')!.grade, 'gold'); assert.equal(earnFromPlace(2, 3, 'x'), null, 'a podium place needs the top half of a field'); assert.equal(earnFromPlace(2, 4, 'x')!.grade, 'silver');
  assert.ok(/Finished 2nd in the Mayor’s Cup/.test(earnFromPlace(2, 20, 'the Mayor’s Cup')!.why) && /Finished 5th of 20/.test(earnFromPlace(5, 20, 'x')!.why));
  assert.equal(earnFromMatch('w', 100)!.grade, 'bronze'); assert.equal(earnFromMatch('w', MATCH_BIG_STAKE)!.grade, 'silver'); assert.equal(earnFromMatch('w', 5000)!.grade, 'silver'); assert.equal(earnFromMatch('l', 500), null); assert.equal(earnFromMatch('h', 500), null);
  assert.ok(/\$1,200 money match/.test(earnFromMatch('w', 1200)!.why));
  assert.deepEqual(EARN_TABLE.map(r => r.grade), ['gold', 'gold', 'silver', 'bronze', 'silver', 'bronze']); assert.ok(EARN_TABLE.every(r => r.what.length > 10));
  // the pulls wait at the machine, by grade, up to a limit
  let c = emptyCards(); c = addPull(addPull(addPull(c, 'gold'), 'bronze', 2), 'silver'); assert.deepEqual(c.pulls, { bronze: 2, silver: 1, gold: 1 }); assert.equal(bestGrade(c), 'gold');
  c = takePull(c, 'gold'); assert.equal(bestGrade(c), 'silver'); assert.equal(takePull(takePull(takePull(takePull(c, 'silver'), 'bronze'), 'bronze'), 'bronze').pulls.bronze, 0, 'never below none'); assert.equal(bestGrade(emptyCards()), null);
  assert.equal(addPull(emptyCards(), 'gold', 500).pulls.gold, PULLS_MAX); assert.deepEqual(GRADES, ['bronze', 'silver', 'gold']);
});

// ---- the vending machine's odds ----

test('vending odds: bronze is TrickOrTreat’s table (half common, one in a hundred legendary, one in five a dud), silver is better, gold never a common and never a dud', () => {
  assert.deepEqual(RARITY_ODDS.bronze, [50, 30, 15, 4, 1]); assert.equal(DUD_SHARE.bronze, 0.2); assert.equal(DUD_SHARE.gold, 0); assert.equal(RARITY_ODDS.gold[0], 0);
  const none = new Set<string>(), N = 40000;
  for (const grade of GRADES) {
    const r = seeded(grade.length * 31), count = { dud: 0, voucher: 0, rar: [0, 0, 0, 0, 0] };
    for (let k = 0; k < N; k++) { const p = rollPrize(none, grade, r); if (p.kind === 'dud') count.dud++; else if (p.kind === 'voucher') count.voucher++; else count.rar[p.rarity]++; }
    const dud = DUD_SHARE[grade], sum = RARITY_ODDS[grade].reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(count.dud / N - dud) < 0.012, `${grade}: ${(count.dud / N).toFixed(3)} duds`); assert.equal(count.voucher, 0, 'nothing is complete yet');
    for (let q = 0; q < 5; q++) assert.ok(Math.abs(count.rar[q]! / N - (1 - dud) * RARITY_ODDS[grade][q]! / sum) < 0.012, `${grade} rarity ${q}: ${(count.rar[q]! / N).toFixed(3)}`);
  }
  const g = seeded(5); for (let k = 0; k < 4000; k++) { const p = rollPrize(none, 'gold', g); assert.ok(p.kind === 'card' && p.rarity >= 1, 'gold: an uncommon or better, always a card'); }
  // better grades are worth more: the chance of an epic or better
  const big = (grade: Grade) => { const r = seeded(77), n = 20000; let c = 0; for (let k = 0; k < n; k++) { const p = rollPrize(none, grade, r); if (p.kind !== 'dud' && p.rarity >= 3) c++; } return c / n; };
  assert.ok(big('bronze') < big('silver') && big('silver') < big('gold'), `${big('bronze').toFixed(3)} < ${big('silver').toFixed(3)} < ${big('gold').toFixed(3)}`);
});

test('vending odds: you never draw a card you own; when you own every card of a rarity its draw pays a sponsor’s voucher; the prize is a pure function of the stream; the catalogue view says it', () => {
  const owned = new Set(CARDS.filter(c => c.rarity <= 1).map(c => c.id)), r = seeded(9);
  let vouchers = 0, cards = 0;
  for (let k = 0; k < 6000; k++) { const p = rollPrize(owned, 'bronze', r); if (p.kind === 'card') { cards++; assert.ok(!owned.has(p.card.id), 'never a duplicate'); assert.ok(p.rarity >= 2); } else if (p.kind === 'voucher') { vouchers++; assert.ok(p.rarity <= 1, 'a voucher stands in for a complete rarity'); } }
  assert.ok(vouchers > 3000 && cards > 600, `${vouchers} vouchers ${cards} cards`);
  const all = new Set(CARDS.map(c => c.id)), a = seeded(3); for (let k = 0; k < 500; k++) { const p = rollPrize(all, 'silver', a); assert.ok(p.kind !== 'card', 'owning everything: vouchers and duds'); }
  assert.deepEqual(rollPrize(new Set(), 'silver', seeded(21)), rollPrize(new Set(), 'silver', seeded(21)), 'the same stream, the same prize');
  const v = oddsView(owned, 'bronze'); assert.equal(v.dud, 0.2); assert.equal(v.rows.length, 5); assert.ok(Math.abs(v.rows.reduce((a, x) => a + x.chance, 0) + v.dud - 1) < 1e-12);
  assert.equal(v.rows[0]!.pays, 'voucher'); assert.equal(v.rows[0]!.left, 0); assert.equal(v.rows[2]!.pays, 'card'); assert.equal(v.rows[2]!.left, v.rows[2]!.total); assert.ok(Math.abs(v.rows[0]!.chance - 0.8 * 0.5) < 1e-12);
  assert.ok(weightedPick([{ weight: 0 }, { weight: NaN }], () => 0.5) === null && weightedPick([{ weight: 0 }, { weight: 2 }], () => 0.99)!.weight === 2);
});

test('vending reel: the prize is laid at the stop tile with a near miss either side, the decoys decide nothing, the same seed lays the same reel', () => {
  const win = rollPrize(new Set(), 'gold', seeded(2)), s = createSpin(7, 'gold', win, seeded(4));
  assert.equal(s.reel.length, REEL_STOP + REEL_AFTER + 1); assert.equal(s.stop, REEL_STOP); assert.equal(s.reel[REEL_STOP], win); assert.equal(s.winner, win); assert.equal(s.status, 'spinning'); assert.equal(s.id, 7);
  const near = (i: number) => { const p = s.reel[i]!; return p.kind === 'card' && p.rarity >= 2; };
  assert.ok(near(REEL_STOP - 1) && near(REEL_STOP + 1), 'a rare or better either side');
  assert.deepEqual(createSpin(7, 'gold', win, seeded(4)).reel.map(p => p.key), s.reel.map(p => p.key));
  const other = createSpin(7, 'gold', win, seeded(99)); assert.equal(other.reel[REEL_STOP], win, 'whatever the decoys, the prize is where the reel stops'); assert.notDeepEqual(other.reel.map(p => p.key), s.reel.map(p => p.key));
  const bronze = createSpin(1, 'bronze', rollPrize(new Set(), 'bronze', seeded(1)), seeded(6)); assert.ok(bronze.reel.some(p => p.kind === 'dud'), 'a bronze reel shows the junk too');
  assert.ok(createSpin(1, 'gold', win, seeded(8)).reel.every(p => p.kind !== 'dud'), 'a gold reel has none');
});

// ---- the save ----

test('save: your cards survive a save whole; junk, a card since cut, a duplicate and an unowned slot are cleaned; the profile keeps them; a save from before them has none', () => {
  const rich: CardsSave = { v: 1, own: ['power-mash', 'flatstick', 'range-rat'], slots: ['flatstick', null, 'power-mash', null, null, null, null, null], pulls: { bronze: 2, silver: 0, gold: 1 }, opened: 5, junk: 2, paid: { tourney: 4 } };
  assert.deepEqual(normalizeCards(JSON.parse(JSON.stringify(rich))), rich);
  assert.deepEqual(normalizeCards({ ...rich, legacy: true }), { ...rich, legacy: true });
  const dirty = normalizeCards({ v: 1, own: ['power-mash', 'power-mash', 'a-card-since-cut', 7, 'flatstick'], slots: ['flatstick', 'flatstick', 'a-card-since-cut', 'range-rat', 'power-mash', null, null, null, 'power-mash', 'x'], pulls: { bronze: 500, silver: -3, gold: 'x' }, opened: -1, junk: 2.7, paid: { tourney: 'x' } })!;
  assert.deepEqual(dirty.own, ['power-mash', 'flatstick']); assert.deepEqual(dirty.slots, ['flatstick', null, null, null, 'power-mash', null, null, null], 'one slot each, only what you own, eight slots');
  assert.deepEqual(dirty.pulls, { bronze: PULLS_MAX, silver: 0, gold: 0 }); assert.equal(dirty.opened, 0); assert.equal(dirty.junk, 2); assert.equal(dirty.paid, undefined); assert.equal(dirty.legacy, undefined);
  for (const junk of [null, undefined, 5, 'x', []]) assert.equal(normalizeCards(junk), undefined);
  assert.equal(normalizeCards({})!.own.length, 0, 'an object with nothing in it is empty cards, not none: only absence is a save from before them');
  // the profile
  const p = withCards(startProfile('m'), rich), back = normalizePlayer(JSON.parse(JSON.stringify(p)))!; assert.deepEqual(back.cards, rich);
  const old = JSON.parse(JSON.stringify(startProfile('m'))); delete old.cards; assert.equal(normalizePlayer(old)!.cards, undefined, 'an old save has none: it keeps the mechanics'); assert.equal(normalizePlayer({ ...old, cards: 'x' })!.cards, undefined);
  assert.deepEqual(normalizePlayer(JSON.parse(JSON.stringify(startProfile('m'))))!.cards, emptyCards(), 'a new game keeps its empty cards');
  assert.deepEqual(startProfile('w', true).cards, emptyCards(true)); assert.equal(startProfile('m').cards!.legacy, undefined);
  // the golf save keeps the player's cards
  const gs = { town: { x: 1, y: 1 }, course: [0, 0, 9, 9], clubhouse: { x: 1, y: 1 }, player: JSON.parse(JSON.stringify(p)) } as never;
  assert.deepEqual(normalizeGolfSave(gs)!.player!.cards, rich);
  // a card cut from the catalogue after a save was made: its owner keeps the rest
  assert.equal(cardById('a-card-since-cut'), undefined);
});

test('practice: Range Rat adds half as much again to every skill a session raises; without it a session is exactly what it was', () => {
  const p0 = startProfile('m'), p1 = withCards(p0, owning(['range-rat'])), old = startProfile('m'); delete (old as { cards?: unknown }).cards;
  const a = practicePreview(p0, 'bucket', 1), b = practicePreview(p1, 'bucket', 1), c = practicePreview(old, 'bucket', 1);
  assert.deepEqual(a, c, 'no card: the session as before');
  for (let i = 0; i < a.gains.length; i++) { assert.ok(Math.abs(b.gains[i]!.gain - a.gains[i]!.gain * 1.5) < 0.02, `${a.gains[i]!.id}: ${b.gains[i]!.gain} vs ${a.gains[i]!.gain}`); assert.ok(b.gains[i]!.to > a.gains[i]!.to); }
});

// ---- a tournament owner with cards, replayed ----

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

test('replay: a tournament owner with cards in his slots (stats, club mods, both mechanics, a card banned in competition left out) replays the same round from his saved inputs, through a save, with the caddie after', () => {
  const v = course(), p = withCards(startProfile('m'), owning(['power-mash', 'mid-flight-whisper', 'long-drive-shaft', 'flatstick', 'pro-in-a-bottle', 'hot-driver', 'wonder-wedge', 'lead-tape']));
  const skills = gameSkills(START_SKILLS, PRESSURE.tournament, gearFor(p, PRESSURE.tournament)); // (the tournament: the banned card is out of it)
  assert.ok(!skills.mods!.some(m => m.id === 'card:hot-driver') && hasMech(skills, 'boost') && hasMech(skills, 'airspin'));
  const owner = { owner: 'm' as const, inputs: [], caddie: null, skills };
  const first = dayRound(v, 2, 91, owner); let t = first.own!.turn; const inputs = [];
  for (let k = 0; k < 40 && t; k++) {
    const club: Club = t.lie === 'green' ? 'putter' : t.lie === 'tee' ? 'driver' : (['iron7', 'sw', 'wood3', 'iron5'] as Club[])[k % 4]!;
    const input = { holeIdx: t.holeIdx, stroke: t.stroke, club, aim: t.suggested.aim, power: t.suggested.power, swing: { power: Math.min(1.05, t.suggested.power), acc: 0.02 * (k % 4), boost: k % 3 === 0 ? 0.03 : 0 }, ...(club === 'putter' ? {} : { spin: { x: 0, y: -0.4, pump: k % 5 } }), v: 2 };
    first.own!.live.play(input); inputs.push(first.own!.live.inputs[first.own!.live.inputs.length - 1]!); t = first.own!.live.advance();
  }
  assert.ok(inputs.length >= 20, `${inputs.length} shots`); assert.ok(inputs.some(i => i.swing && i.swing.boost > 0), 'a boosted swing was played'); assert.ok(inputs.some(i => i.spin && i.spin.pump > 0), 'spin was added in the air');
  const saved = JSON.parse(JSON.stringify({ ...owner, inputs, skills })), again = dayRound(v, 2, 91, { ...saved, skills: readGameSkills(saved.skills)! });
  assert.equal(JSON.stringify(again.plan.shots), JSON.stringify(first.plan.shots), 'the same shots, the field’s too');
  const c = dayRound(v, 2, 91, { ...saved, caddie: saved.inputs.length, skills: readGameSkills(saved.skills)! }), d = dayRound(v, 2, 91, { ...saved, caddie: saved.inputs.length, skills: readGameSkills(saved.skills)! });
  assert.equal(JSON.stringify(c.plan.shots), JSON.stringify(d.plan.shots), 'the caddie’s remaining round is the same twice'); assert.equal(c.own!.turn, null);
  // the same owner with a new game's cards and no mechanic plays boosted and spun inputs as if they carried none: the saved input keeps what was played
  const locked = gameSkills(START_SKILLS, PRESSURE.tournament, gearFor(startProfile('m'), PRESSURE.tournament)), lo = dayRound(v, 2, 91, { owner: 'm', inputs: [], caddie: null, skills: locked });
  const lt = lo.own!.turn!; lo.own!.live.play({ holeIdx: lt.holeIdx, stroke: lt.stroke, club: 'driver', aim: lt.suggested.aim, power: lt.suggested.power, swing: { power: 1, acc: 0, boost: 0.05 }, spin: { x: 0, y: -0.4, pump: 4 }, v: 2 });
  const kept = lo.own!.live.inputs[0]!; assert.equal(kept.swing!.boost, 0); assert.equal(kept.spin!.pump, 0);
});
