// T337 (#963): the card catalogue (src/game/golf/cards/catalogue.ts): 40 to 60 cards, every card of the issue's starter list at its rarity, every effect applied through the one shot model (applyMods for the numbers, the
// mechanics shotOutcome and the round read), none of them breaking a replay, and the golden guarantee (no cards, and a mod with no moment, play as before).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TILE_M } from '../src/game/golf/types';
import {
  CLUB_ORDER, MECH_IDS, MOD_WHEN, allowedClubs, applyMods, carryFor, dayRound, hasMech, hitShot, kitOf, laserLines, laserReport, greenRead, readGameSkills, readMods, rng, shotOutcome, swingEffect, windEffect,
} from '../src/game/golf/play';
import type { Club, CourseView, GameSkills, Lie, ModCtx, PlayHole, Pt } from '../src/game/golf/play';
import { CARDS, MECH_NAME, addCard, cardById, cardEco, cardEffects, cardLines, cardMods, emptyCards, equipCard } from '../src/game/golf/cards';
import type { CardDef, CardsSave } from '../src/game/golf/cards';
import { PRESSURE, START_SKILLS, gameSkills, gearFor, startProfile, withCards } from '../src/game/golf/player';
import { HOT_HOLES, hotNerve, nextHole, playYours, scrambleLeft, startRound } from '../src/game/golf/play/yours';

const flat = (lie: Lie): CourseView => ({ holes: [], lieAt: () => lie });
const O: Pt = { x: 0, y: 0 };
const base = (over: Partial<GameSkills> = {}): GameSkills => ({ driving: 0.4, irons: 0.4, short: 0.4, putting: 0.4, ...over });
const card = (id: string): CardDef => cardById(id)!;
const owning = (ids: string[]): CardsSave => { let c = emptyCards(); for (const id of ids) c = equipCard(addCard(c, id).cards, id); return c; };
/** the golfer's game with these cards in his slots (a new game's profile, a round's pressure) */
const gameWith = (ids: string[], pressure: number = PRESSURE.everyday): GameSkills => gameSkills(START_SKILLS, pressure, gearFor(withCards(startProfile('m'), owning(ids)), pressure));
const NONE = gameWith([]);

test('catalogue: 40 to 60 cards, every card of the issue’s starter list at its rarity, every rarity, every mechanic and every moment has a card', () => {
  assert.ok(CARDS.length >= 40 && CARDS.length <= 60, `${CARDS.length} cards`);
  assert.equal(new Set(CARDS.map(c => c.id)).size, CARDS.length); assert.equal(new Set(CARDS.map(c => c.name)).size, CARDS.length);
  const ISSUE: [string, number][] = [['Driver Off the Deck', 2], ['Power Mash', 1], ['Mid-Flight Whisper', 2], ['Read the Feet', 3], ['Laser Rangefinder', 1], ['Slope Mode', 2], ['Lie-Angle Balanced Flatstick', 3], ['Arm-Lock', 1], ['Broomstick', 1],
    ['The Snowman Eraser', 4], ['Skins Hustler', 2], ['Scramble Captain', 2], ['Backyard Trick Shot', 3], ['Infomercial Wonder-Wedge', 0], ['Self-Correcting Ball', 4], ['Long Drive Shaft', 3], ['Pace Putting Robot', 2],
    ['Cold Beer, Hot Hands', 1], ['Range Rat', 0], ['Wind Whisperer', 2], ['Fairway Finder', 1], ['Clutch Gene', 4], ['Mic’d-Up Caddie', 2]];
  for (const [name, rarity] of ISSUE) { const c = CARDS.find(x => x.name.includes(name)); assert.ok(c, name); assert.equal(c!.rarity, rarity, `${name}: rarity`); }
  for (let r = 0; r < 5; r++) assert.ok(CARDS.filter(c => c.rarity === r).length >= 5, `rarity ${r} has cards`);
  for (const m of MECH_IDS) { assert.ok(CARDS.some(c => c.fx.mech?.includes(m)), `a card unlocks ${m}`); assert.ok(MECH_NAME[m], `${m} has words`); }
  for (const w of MOD_WHEN) assert.ok(CARDS.some(c => c.fx.mods?.some(m => m.when === w)), `a card has a mod for ${w}`);
  assert.ok(CARDS.every(c => c.inspiration.length > 20 && c.flavour.length > 8 && c.text.length > 20), 'every card has its words and its inspiration');
  assert.ok(CARDS.filter(c => c.banned).every(c => /Banned in competition/.test(cardLines(c).join())) && CARDS.filter(c => c.banned).length >= 7, 'the banned ones say so');
  for (const id of ['hot-driver', 'self-correcting-ball', 'scramble-captain', 'snowman-eraser', 'ace-magnet', 'fairway-finder', 'slope-mode']) assert.equal(card(id).banned, 'competition', id);
  assert.deepEqual(cardLines(card('deck-driver')), ['Driver off the deck: -7% carry · scatter -20% · mishits -2 in 100 · run +70% · wind -40%', 'Unlocks: the driver off the fairway']);
  assert.deepEqual(cardLines(card('clutch-gene')), ['On the last hole: scatter -15% · sweet spot +140%']); assert.deepEqual(cardLines(card('wind-whisperer')), ['wind -50%']);
});

test('every card applies: its mods change a kit (in the moment they are for), its mechanics are had when it is in a slot, its economy changes a factor; and it does nothing out of a slot', () => {
  const ctxFor = (w: string | undefined): ModCtx | undefined => w === 'tee' ? { tee: true, lie: 'tee' } : w === 'deck' ? { deck: true, lie: 'fairway' } : w === 'rough' ? { lie: 'rough' } : w === 'bunker' ? { lie: 'bunker' } : w === 'last' ? { last: true } : w === 'follow' ? { follow: true } : undefined;
  const row = (k: ReturnType<typeof applyMods>) => JSON.stringify([k.skill, k.carry, k.spread, k.sweet, k.speed, k.roll, k.mishit, k.spin, k.feel, k.line, k.luck, k.wind, k.miss, k.slope, k.stats]);
  for (const c of CARDS) {
    const sk = gameWith([c.id]);
    if (c.fx.mods?.length) {
      let changed = false;
      for (const m of c.fx.mods) for (const club of CLUB_ORDER) { const ctx = ctxFor(m.when); if (row(applyMods(sk, club, ctx)) !== row(applyMods(NONE, club, ctx))) changed = true; }
      assert.ok(changed, `${c.id}: its mods change a kit`);
      if (c.fx.mods.every(m => m.when)) for (const club of CLUB_ORDER) assert.equal(row(applyMods(sk, club)), row(applyMods(NONE, club)), `${c.id}: its mods for a moment do nothing without it (${club})`);
    }
    for (const m of c.fx.mech ?? []) { assert.ok(hasMech(sk, m), `${c.id}: unlocks ${m}`); assert.ok(!hasMech(NONE, m), `${c.id}: a new game has no ${m}`); }
    if (c.fx.eco) assert.ok(Object.values(cardEco(owning([c.id]))).some(v => v !== 1), `${c.id}: its economy`);
    assert.equal(cardEffects(addCard(emptyCards(), c.id).cards).mods.length, 0, `${c.id}: in the collection only, nothing`); assert.deepEqual(cardEco(addCard(emptyCards(), c.id).cards), { matchPay: 1, matchStake: 1, prize: 1, lesson: 1 });
    // banned in competition: its mods, mechanics and economy are out of a competition's game
    if (c.banned) { const g = gameWith([c.id], PRESSURE.tournament); assert.equal(g.mods?.length ?? 0, 0, `${c.id}: out of a competition`); for (const m of c.fx.mech ?? []) assert.ok(!hasMech(g, m)); }
  }
});

test('the driver off the deck: the card lets the driver off the fairway (and no other lie), flatter, longer to run and straighter than from the tee', () => {
  const g = gameWith(['deck-driver']);
  assert.ok(allowedClubs('fairway', false, g.clubs, g.mech).includes('driver') && !allowedClubs('rough', false, g.clubs, g.mech).includes('driver') && !allowedClubs('fairway', false, NONE.clubs, NONE.mech).includes('driver'), 'only with the card, only from the fairway');
  assert.ok(allowedClubs('fairway', false, undefined, g.mech).includes('driver') && !allowedClubs('fairway', false).includes('driver') && allowedClubs('tee', true, NONE.clubs, NONE.mech).includes('driver'), 'the original seven too');
  const deck = applyMods(g, 'driver', { deck: true, lie: 'fairway' }), tee = applyMods(g, 'driver', { tee: true, lie: 'tee' });
  assert.ok(deck.carry < 0.95 && deck.roll > 1.5 && deck.spread < 0.85 && deck.wind < 0.7 && deck.mishit < 0, 'flat, running and straight'); assert.equal(tee.carry, applyMods(NONE, 'driver', { tee: true, lie: 'tee' }).carry, 'from the tee it is the plain driver (the golfer’s own: his stats are in it)');
  const v = flat('fairway'), runs = (ctx?: ModCtx) => { let c = 0, t = 0; for (let k = 0; k < 80; k++) { const o = hitShot(rng(50 + k, 1, 1), g, 'fairway', O, { x: 220 / TILE_M, y: 0 }, 'driver', v, ctx ? { ctx } : undefined); c += o.landing.at.x; t += o.landing.rest.x; } return { carry: c / 80 * TILE_M, run: (t - c) / 80 * TILE_M }; };
  const a = runs({ deck: true, lie: 'fairway' }), b = runs();
  assert.ok(a.carry < b.carry * 0.96 && a.run > b.run * 1.5, `deck ${a.carry.toFixed(0)} + ${a.run.toFixed(1)} m against ${b.carry.toFixed(0)} + ${b.run.toFixed(1)} m`);
  // the model's own call: shotOutcome gives the deck's mods to a driver played from the fairway
  const { view, hole } = view18(4), inp = swing0('driver', { aim: { x: 150 / TILE_M, y: 0 } });
  const off = (sk: GameSkills) => { let s = 0; for (let k = 0; k < 40; k++) s += shotOutcome(view, hole, { x: 0, y: 0 }, 'fairway', sk, inp, rng(4, k, 1)).landing!.at.x; return s / 40 * TILE_M; };
  assert.ok(off(g) < off(NONE) * 0.97, 'off the fairway the card’s driver carries less than the plain one (flat)');
});

test('wind, miss and slope factors: the Wind Whisperer halves what the wind does, the Self-Correcting Ball halves the swing’s miss, Slope Mode halves the slope under the ball', () => {
  const view = flat('fairway'), wind = { mph: 20, from: 270 }, W = gameWith(['wind-whisperer']);
  const moved = (sk: GameSkills) => { let s = 0; for (let k = 0; k < 40; k++) { const a = hitShot(rng(7 + k, 2, 2), sk, 'fairway', O, { x: 180 / TILE_M, y: 0 }, 'iron6', view, { env: { wind } }), b = hitShot(rng(7 + k, 2, 2), sk, 'fairway', O, { x: 180 / TILE_M, y: 0 }, 'iron6', view, { env: {} }); s += Math.hypot(a.landing.at.x - b.landing.at.x, a.landing.at.y - b.landing.at.y); } return s / 40; };
  assert.ok(Math.abs(applyMods(W, 'iron6').wind - 0.5) < 1e-12 && applyMods(NONE, 'iron6').wind === 1);
  assert.equal(windEffect(wind, 'iron6', 1, 0, 0.5).exposure * 2, windEffect(wind, 'iron6', 1, 0, 1).exposure);
  assert.ok(moved(W) < moved(NONE) * 0.65 && moved(NONE) > 3, `the wind moves the Whisperer’s ball ${moved(W).toFixed(1)} tiles, the plain one's ${moved(NONE).toFixed(1)}`);
  const S = gameWith(['self-correcting-ball']), out = { power: 1, acc: 0.12, boost: 0 };
  const a = swingEffect(out, 0.4, false, 1, applyMods(S, 'driver').miss), b = swingEffect(out, 0.4, false, 1, 1);
  assert.ok(b.shape === 'hook' && Math.abs(Math.abs(a.deg) - Math.abs(b.deg) / 2) < 1e-9 && a.shape === b.shape, 'half the angle, the same shape'); assert.equal(swingEffect(out, 0.4, false).deg, b.deg, 'no factor: as before');
  const M = gameWith(['slope-mode']), up = { slope: { up: 0.06, across: 0.04 } };
  const lands = (sk: GameSkills) => { let s = 0; for (let k = 0; k < 40; k++) s += hitShot(rng(9 + k, 3, 3), sk, 'fairway', O, { x: 150 / TILE_M, y: 0 }, 'iron7', view, { env: up }).landing.at.x * TILE_M; return s / 40; };
  assert.ok(Math.abs(applyMods(M, 'iron7').slope - 0.5) < 1e-12 && Math.abs(lands(M) - 150) < Math.abs(lands(NONE) - 150), 'the hill costs half as much');
  assert.ok(Math.abs(carryFor(base({ mods: cardMods(card('wind-whisperer')) }), 'driver') - carryFor(base(), 'driver')) < 1e-9, 'the wind factor is no carry factor');
});

test('moments: Clutch Gene on the last hole, the Mic’d-Up Caddie when you follow him, Tall Tees off the tee, Hack-Out Boots in the rough, the Rake of Truth in sand; none of them anywhere else', () => {
  const sweet = (ids: string[], ctx?: ModCtx) => applyMods(gameWith(ids), 'iron6', ctx).sweet;
  assert.ok(sweet(['clutch-gene'], { last: true }) > 2 * sweet([]) && sweet(['clutch-gene']) === sweet([]) && sweet(['clutch-gene'], { last: false }) === sweet([]), 'the sweet spot is huge on the last hole only');
  const f = applyMods(gameWith(['mic-caddie']), 'iron6', { follow: true }), n = applyMods(gameWith(['mic-caddie']), 'iron6');
  assert.ok(f.skill > n.skill + 0.049 && f.stats.putting > n.stats.putting + 0.049 && f.carry > n.carry, 'following him: +5 on every stat'); assert.equal(n.skill, applyMods(NONE, 'iron6').skill, 'not following: nothing');
  const rel = (id: string, club: Club, ctx?: ModCtx) => applyMods(gameWith([id]), club, ctx).carry / applyMods(NONE, club, ctx).carry;
  assert.ok(Math.abs(rel('tall-tees', 'driver', { tee: true }) - 1.04) < 1e-9 && Math.abs(rel('tall-tees', 'driver', { lie: 'fairway' }) - 1) < 1e-9, 'Tall Tees: +4% carry off the tee only');
  assert.ok(Math.abs(rel('hackout-boots', 'iron6', { lie: 'rough' }) - 1.1) < 1e-9 && Math.abs(rel('hackout-boots', 'iron6', { lie: 'fescue' }) - 1.1) < 1e-9 && Math.abs(rel('hackout-boots', 'iron6', { lie: 'fairway' }) - 1) < 1e-9, 'Hack-Out Boots: +10% carry from the rough and the fescue only');
  assert.ok(applyMods(gameWith(['bunker-rake']), 'sw', { lie: 'bunker' }).spread < 0.82 && applyMods(gameWith(['bunker-rake']), 'sw', { lie: 'rough' }).spread === applyMods(NONE, 'sw', { lie: 'rough' }).spread);
  // the shot itself builds the moment: following the caddie (the saved input's flag) and the round's last hole
  const { view, hole } = view18(4), inp = (over: object) => swing0('iron6', { aim: { x: 100 / TILE_M, y: 0 }, ...over });
  const mic = gameWith(['mic-caddie']), plain = shotOutcome(view, hole, O, 'fairway', mic, inp({}), rng(1, 1, 1)), fol = shotOutcome(view, hole, O, 'fairway', mic, inp({ cad: true }), rng(1, 1, 1));
  assert.ok(fol.landing!.at.x > plain.landing!.at.x, 'a followed caddie carries further (+5 power)'); assert.deepEqual(shotOutcome(view, hole, O, 'fairway', NONE, inp({ cad: true }), rng(1, 1, 1)), shotOutcome(view, hole, O, 'fairway', NONE, inp({}), rng(1, 1, 1)), 'without the card the flag is nothing');
  const cl = gameWith(['clutch-gene']), acc = { power: 1, acc: 0.08, boost: 0 }, miss = (last: boolean) => { let m = 0; for (let k = 0; k < 60; k++) m += Math.abs(shotOutcome(view, hole, O, 'fairway', cl, inp({ swing: acc }), rng(2, k, 2), { last }).landing!.at.y); return m / 60; };
  assert.ok(miss(true) < miss(false), `on the last hole a click that would have missed is inside the huge sweet spot (${miss(true).toFixed(2)} tiles off the line against ${miss(false).toFixed(2)})`);
  // a mod with a moment the model does not know is dropped from a save, never made unconditional
  assert.deepEqual(readMods([{ id: 'a', when: 'moon', carry: 2 }, { id: 'b', when: 'last', sweet: 2 }]).map(m => m.id), ['b']); assert.equal(readMods([{ id: 'b', when: 'last', sweet: 2 }])[0]!.when, 'last');
  assert.deepEqual(readMods([{ id: 'c', wind: 0.5, miss: 0.5, slope: 0.5 }])[0], { id: 'c', wind: 0.5, miss: 0.5, slope: 0.5 });
});

// ---- the shot's own hooks ----
function view18(par: 3 | 4 | 5): { view: CourseView; hole: PlayHole } {
  const hole: PlayHole = { n: 1, par, tee: O, pin: { x: 120 / TILE_M, y: 0 }, line: [O, { x: 120 / TILE_M, y: 0 }] };
  const lieAt = (x: number, y: number): Lie => Math.hypot(x - hole.pin.x, y - hole.pin.y) <= 7 ? 'green' : Math.abs(y) <= 6 ? 'fairway' : Math.abs(y) <= 40 ? 'rough' : 'out';
  return { view: { holes: [hole], lieAt }, hole };
}
const swing0 = (club: Club, over: object = {}) => ({ club, aim: { x: 120 / TILE_M, y: 0 }, power: 1, swing: { power: 1, acc: 0, boost: 0 }, v: 2, ...over });

test('the shot’s hooks: Fairway Finder rolls a tee shot back from the rough, Backyard Trick Shot plays a wedge from the rough as from the fairway, Ace Magnet drops a close par-3 tee shot; each takes its draw only with the card', () => {
  const { view, hole } = view18(4), F = gameWith(['fairway-finder']), toRough = { aim: { x: 190 / TILE_M, y: 10 } };
  let moved = 0, rough = 0;
  for (let k = 0; k < 400; k++) {
    const a = shotOutcome(view, hole, O, 'tee', NONE, swing0('driver', toRough), rng(5, k, 1)), b = shotOutcome(view, hole, O, 'tee', F, swing0('driver', toRough), rng(5, k, 1));
    if (a.lie === 'rough' && !a.penalty) { rough++; if (b.lie === 'fairway') { moved++; assert.equal(b.landing!.restLie, 'fairway'); } } else assert.deepEqual(a.to, b.to, 'a shot not in the rough is the same shot');
  }
  assert.ok(rough > 40 && moved / rough > 0.15 && moved / rough < 0.45, `${moved} of ${rough} tee shots in the rough rolled back (3 in 10)`);
  const T = gameWith(['trick-shot']), land = (sk: GameSkills) => { let s = 0; for (let k = 0; k < 60; k++) s += shotOutcome(view, hole, { x: 30, y: 20 }, 'rough', sk, swing0('sw', { aim: { x: 50, y: 20 } }), rng(8, k, 1)).landing!.at.x * TILE_M; return s / 60; };
  assert.ok(land(T) > land(NONE) + 3, 'a wedge from the rough carries as from the fairway (no rough penalty)');
  const three = view18(3), A = gameWith(['ace-magnet']); let holed = 0, near = 0;
  for (let k = 0; k < 600; k++) {
    const o = shotOutcome(three.view, three.hole, O, 'tee', A, swing0('iron8'), rng(3, k, 1)), p = shotOutcome(three.view, three.hole, O, 'tee', NONE, swing0('iron8'), rng(3, k, 1));
    if (Math.hypot(p.to.x - three.hole.pin.x, p.to.y - three.hole.pin.y) * TILE_M <= 6 && !p.penalty) { near++; if (o.holed) { holed++; assert.deepEqual(o.to, three.hole.pin); } } else assert.deepEqual(o.to, p.to);
  }
  assert.ok(near > 40 && holed / near > 0.1 && holed / near < 0.35, `${holed} of ${near} close tee shots dropped (1 in 5)`);
  assert.ok(!shotOutcome(view, hole, O, 'tee', A, swing0('iron8'), rng(3, 3, 3)).holed, 'not on a par 4');
});

// ---- the round's cards ----
const HOLES = 18;
function roundView(): CourseView {
  const holes: PlayHole[] = Array.from({ length: HOLES }, (_, i) => { const y = 20 + 100 * i, tee = { x: 10, y }, pin = { x: 10 + 120 / TILE_M, y }; return { n: i + 1, par: 4 as const, tee, pin, line: [tee, pin] }; });
  const lieAt = (x: number, y: number): Lie => { for (const h of holes) { if (Math.hypot(x - h.pin.x, y - h.pin.y) <= 7) return 'green'; if (Math.abs(y - h.tee.y) <= 8 && x >= h.tee.x - 2 && x <= h.pin.x + 20) return 'fairway'; } return 'rough'; };
  return { holes, lieAt };
}
const puttFrom = (view: CourseView, i: number) => ({ club: 'putter' as const, aim: view.holes[i]!.pin, power: 1, swing: { power: 1, acc: 0, boost: 0 }, v: 2 });

test('round cards: the Snowman Eraser makes a double bogey a bogey once a round, Cold Beer gives two holes of nerve after a birdie, the Scramble Captain’s second ball is the better one once a nine', () => {
  const view = roundView(), E = gameWith(['snowman-eraser']), H = gameWith(['cold-beer']), S = gameWith(['scramble-captain']);
  // a hole holed out at par + 2: a double bogey: the eraser rubs it out to a bogey, once
  const at = (r: ReturnType<typeof startRound>, strokes: number, i = 0) => { const row = { ...r!.card[i]!, strokes }; const card = r!.card.slice(); card[i] = row; const pin = view.holes[i]!.pin; return { ...r!, at: i, card, ball: { x: pin.x - 0.1, y: pin.y }, lie: 'green' as const }; };
  const start = startRound(view, Array.from({ length: HOLES }, (_, i) => i), 1)!;
  let holedOnce = 0;
  for (let seed = 1; seed < 40 && holedOnce < 3; seed++) {
    const r = at(start, 5), withE = playYours(view, r, E, puttFrom(view, 0), seed), without = playYours(view, r, NONE, puttFrom(view, 0), seed);
    if (!withE.round.holed) continue; holedOnce++;
    assert.equal(without.round.card[0]!.strokes, 6, 'a double bogey without the card'); assert.equal(withE.round.card[0]!.strokes, 5, 'a bogey with it'); assert.equal(withE.round.card[0]!.er, true); assert.equal(withE.round.er, true);
    const again = playYours(view, { ...at(nextHole(view, { ...withE.round, holed: true }), 5, 1) }, E, puttFrom(view, 1), seed);
    if (again.round.holed) assert.equal(again.round.card[1]!.strokes, 6, 'once a round: the second double bogey stands');
    // a bogey, a par: nothing erased; and a match is no round for it
    const par = playYours(view, at(start, 3), E, puttFrom(view, 0), seed); if (par.round.holed) assert.equal(par.round.card[0]!.strokes, 4);
  }
  assert.ok(holedOnce >= 1, 'a putt from a tap-in distance went in');
  // a birdie: the next two holes carry the nerve bonus, then it is gone
  let heated = false;
  for (let seed = 1; seed < 40 && !heated; seed++) {
    const o = playYours(view, at(start, 2), H, puttFrom(view, 0), seed); if (!o.round.holed) continue; heated = true;
    assert.equal(o.round.card[0]!.strokes, 3); assert.equal(o.round.hot, HOT_HOLES + 1); assert.equal(hotNerve(o.round), 20);
    const h1 = nextHole(view, o.round), h2 = nextHole(view, { ...h1, holed: true }), h3 = nextHole(view, { ...h2, holed: true });
    assert.deepEqual([h1.hot, h2.hot, h3.hot], [2, 1, undefined]); assert.deepEqual([hotNerve(h1), hotNerve(h2), hotNerve(h3)], [20, 20, 0], 'two holes of it');
    assert.equal(playYours(view, at(start, 2), NONE, puttFrom(view, 0), seed).round.hot, undefined, 'no card, no nerve');
    assert.equal(playYours(view, at(start, 3), H, puttFrom(view, 0), seed).round.hot, undefined, 'a par is no birdie');
  }
  assert.ok(heated);
  // the scramble: once a nine, off the tee, only with the card; the second ball is a second draw and the better of the two stands
  const tee = start, teeIn = swing0('iron6', { aim: view.holes[0]!.pin, scr: true as const });
  assert.equal(scrambleLeft(tee, S), 1); assert.equal(scrambleLeft(tee, NONE), 0, 'no card'); assert.equal(scrambleLeft({ ...tee, mode: 'championship' }, S), 0, 'not in a competition');
  let better = 0, worse = 0;
  for (let seed = 1; seed < 60; seed++) {
    const one = playYours(view, tee, S, { ...teeIn, scr: undefined }, seed), two = playYours(view, tee, S, teeIn, seed), pin = view.holes[0]!.pin, d = (b: Pt) => Math.hypot(b.x - pin.x, b.y - pin.y);
    assert.equal(two.round.card[0]!.scr, true, 'the hole is marked'); assert.equal(one.round.card[0]!.scr, undefined);
    assert.ok(two.round.card[0]!.pen <= one.round.card[0]!.pen, 'never a penalty the first ball did not have'); if (two.round.card[0]!.pen === one.round.card[0]!.pen) { if (d(two.round.ball) < d(one.round.ball) - 1e-9) better++; else assert.ok(d(two.round.ball) <= d(one.round.ball) + 1e-9); } else worse--;
  }
  assert.ok(better > 15 && worse === 0, `${better} of 59 tee shots were better with the second ball`);
  const used = playYours(view, tee, S, teeIn, 3).round, next = nextHole(view, { ...used, holed: true });
  assert.equal(scrambleLeft(used, S), 0, 'the nine’s ball is used'); assert.equal(scrambleLeft(next, S), 0, 'on the same nine'); assert.equal(scrambleLeft({ ...next, at: 9 }, S), 1, 'a new nine has its own');
  assert.equal(playYours(view, { ...next, ball: view.holes[1]!.tee, lie: 'tee' }, S, { ...teeIn, aim: view.holes[1]!.pin }, 5).round.card[1]!.scr, undefined, 'a second one on the nine is not played');
});

test('eco cards: Skins Hustler, Sponsor Tent and the Lesson Voucher Book are factors the engine multiplies by; none without the card, none in competition for a banned one', () => {
  assert.deepEqual(cardEco(owning(['skins-hustler'])), { matchPay: 2, matchStake: 2, prize: 1, lesson: 1 });
  assert.equal(cardEco(owning(['sponsor-tent'])).prize, 1.5); assert.equal(cardEco(owning(['lesson-book'])).lesson, 2); assert.deepEqual(cardEco(owning(['skins-hustler', 'sponsor-tent'])), { matchPay: 2, matchStake: 2, prize: 1.5, lesson: 1 });
  assert.deepEqual(cardEco(undefined), { matchPay: 1, matchStake: 1, prize: 1, lesson: 1 }); assert.deepEqual(cardEco(emptyCards()), { matchPay: 1, matchStake: 1, prize: 1, lesson: 1 });
  assert.ok(cardLines(card('skins-hustler')).includes('Money matches you win pay x2') && cardLines(card('sponsor-tent')).includes('Title prizes +50%') && cardLines(card('lesson-book')).includes('A lesson adds x2'));
});

test('the laser reads the lies along the line, and Read the Feet the fall of a green', () => {
  const lieAt = (x: number): Lie => x * TILE_M > 238 ? 'green' : x * TILE_M >= 160 && x * TILE_M < 172 ? 'bunker' : x * TILE_M >= 112 && x * TILE_M < 131 ? 'water' : 'fairway';
  const rep = laserReport({ lieAt }, O, { x: 200 / TILE_M, y: 0 }, { x: 240 / TILE_M, y: 0 });
  assert.ok(Math.abs(rep.pinM - 240) < 1e-9 && Math.abs(rep.aimM - 200) < 1e-9); assert.deepEqual(rep.items.map(i => i.what), ['water', 'sand', 'green']);
  assert.ok(rep.items[0]!.from >= 110 && rep.items[0]!.from <= 114 && rep.items[0]!.to >= 129 && rep.items[0]!.to <= 133);
  const t = laserLines(rep); assert.ok(/^Pin 240\.0 m · aim 200\.0 m$/.test(t[0]!) && /Water: carry 11\d m, clear at 13\d m/.test(t[1]!) && /Green: from 23\d m/.test(t[3]!), t.join(' | '));
  assert.deepEqual(laserReport({ lieAt: () => 'fairway' }, O, { x: 50, y: 0 }, { x: 60, y: 0 }).items, []);
  // a green that falls to the right of the putt (the ground lower to the screen's south when putting east) breaks left to right; flat reads flat
  const down = (_x: number, y: number) => 0.05 * (-y) * 0.5; // (heights in metres: the ground falls as y grows)
  const r = greenRead(down, { x: 0, y: 0 }, { x: 5, y: 0 }); assert.ok(r.cross > 0 && /breaks left to right/.test(r.text), r.text);
  assert.ok(greenRead(down, { x: 5, y: 0 }, { x: 0, y: 0 }).cross < 0 && /right to left/.test(greenRead(down, { x: 5, y: 0 }, { x: 0, y: 0 }).text));
  assert.match(greenRead(() => 0, O, { x: 5, y: 0 }).text, /flat/); assert.match(greenRead(null, O, { x: 5, y: 0 }).text, /flat/);
  const up = greenRead((x: number) => 0.05 * x, O, { x: 5, y: 0 }); assert.ok(up.along < 0 && /uphill/.test(up.text), up.text);
});

// ---- no card breaks a replay ----
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
test('replay: every card, alone in a slot, leaves a tournament owner’s round replaying the same from his saved inputs, through a save (the banned ones are out of it, as in a tournament; the others take every flag they can)', () => {
  const v = course();
  for (const c of CARDS) {
    const skills = gameWith([c.id], PRESSURE.tournament), owner = { owner: 'm' as const, inputs: [], caddie: null, skills };
    const first = dayRound(v, 2, 61, owner); let t = first.own!.turn; const inputs = [];
    for (let k = 0; k < 14 && t; k++) {
      const club: Club = t.lie === 'green' ? 'putter' : t.lie === 'tee' ? 'driver' : (['iron7', 'sw', 'wood3'] as Club[])[k % 3]!;
      const input = { holeIdx: t.holeIdx, stroke: t.stroke, club, aim: t.suggested.aim, power: t.suggested.power, swing: { power: Math.min(1.05, t.suggested.power), acc: 0.02 * (k % 4), boost: k % 3 === 0 ? 0.03 : 0 }, ...(club === 'putter' ? {} : { spin: { x: 0, y: -0.4, pump: k % 5 } }), cad: true as const, scr: true as const, v: 2 };
      first.own!.live.play(input); inputs.push(first.own!.live.inputs[first.own!.live.inputs.length - 1]!); t = first.own!.live.advance();
    }
    const saved = JSON.parse(JSON.stringify({ ...owner, inputs, skills: JSON.parse(JSON.stringify(skills)) })), again = dayRound(v, 2, 61, { ...saved, skills: readGameSkills(saved.skills)! });
    assert.equal(JSON.stringify(again.plan.shots), JSON.stringify(first.plan.shots), `${c.id}: the same round`);
  }
});

test('golden: no cards (a kit with no moment) play the shot of before: applyMods and kitOf are the same with and without a moment, a shot with no card is the same through the new context', () => {
  const sk = base({ mods: [{ id: 'x', carry: 1.05 }] });
  for (const club of CLUB_ORDER) assert.deepEqual(applyMods(sk, club, { tee: true, lie: 'tee', last: true, deck: true, follow: true }), applyMods(sk, club), `${club}: a mod with no moment is no different with one`);
  assert.deepEqual(kitOf(0.4, 'driver', { tee: true }), kitOf(0.4, 'driver')); const kit = applyMods(base(), 'iron6'); assert.deepEqual([kit.wind, kit.miss, kit.slope], [1, 1, 1]);
  const { view, hole } = view18(4);
  for (const club of ['driver', 'iron6', 'sw', 'putter'] as Club[]) for (let k = 0; k < 6; k++) {
    const input = swing0(club, club === 'putter' ? { aim: { x: 59, y: 1 } } : {}), from = club === 'putter' ? { x: 55, y: 0 } : O;
    assert.deepEqual(shotOutcome(view, hole, from, 'fairway', NONE, input, rng(9, k, 4)), shotOutcome(view, hole, from, 'fairway', NONE, input, rng(9, k, 4), { last: true }), `${club} ${k}: a golfer with no cards plays the same shot with the moment and without`);
  }
});
