// T334 (#960), part 2: the player's stats and the modifiers that stack on them (src/game/golf/play/mods.ts applyMods, used by shot.ts hitShot and skillFor, live.ts shotOutcome, swing.ts, and
// golf/player.ts): power (the carry, most on the woods), accuracy (the scatter, the sweet spot, the marker's speed) and touch (the wedges' and the putter's feel) on top of driving, irons,
// the wedges and putting; plain data (`Mod`) stacked by one function, so T335's bag and T336's cards add to it. A golfer without the new stats (a field golfer, a save from before) plays as before.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TILE_M } from '../src/game/golf/types';
import { FAMILY, NEUTRAL, STAT_FX, STAT_IDS, SwingMeter, applyMods, carryFor, carryM, hitShot, kitOf, rng, shotOutcome, skillFor, sweetSpot, swingEffect, swingTime } from '../src/game/golf/play';
import type { Club, CourseView, GameSkills, Lie, Mod, PlayHole, Pt } from '../src/game/golf/play';
import { PRACTICE, PRESSURE, SKILL_IDS, START_SKILLS, gameSkills, handicapOf, normalizePlayer, practicePreview, startProfile } from '../src/game/golf/player';
import { normalizeGolfSave } from '../src/game/golf/mode';

const flat = (lie: Lie): CourseView => ({ holes: [], lieAt: () => lie });
const O: Pt = { x: 0, y: 0 };
const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y) * TILE_M;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
/** the interquartile range: the scatter without the mishits' tails (a mishit is 12 degrees off whatever the golfer's accuracy) */
const iqr = (xs: number[]) => { const s = xs.slice().sort((a, b) => a - b); return s[Math.floor(s.length * 0.75)]! - s[Math.floor(s.length * 0.25)]!; };
const CLUBS: Club[] = ['driver', 'wood3', 'iron4', 'iron6', 'iron8', 'pw', 'sw', 'putter'];
const base = (over: Partial<GameSkills> = {}): GameSkills => ({ driving: 0.5, irons: 0.5, short: 0.5, putting: 0.5, ...over });
/** n full shots of `club` aimed `m` metres along +x on a fairway from a fairway, the carry and the sideways landing of each, for a golfer's skills */
function volley(sk: GameSkills | number, club: Club, m: number, n = 300) {
  const out: { carry: number; side: number }[] = [];
  for (let k = 0; k < n; k++) { const o = hitShot(rng(70 + k, 3, 5), sk, 'fairway', O, { x: m / TILE_M, y: 0 }, club, flat('fairway')); out.push({ carry: dist(O, o.landing.at), side: o.landing.at.y * TILE_M }); }
  return out;
}

test('stats: with no mods and the stats at neutral (or absent) a club plays at its plain skill and factors of exactly 1: every club, every family', () => {
  for (const club of CLUBS) {
    for (const sk of [base(), base({ power: 0.5, accuracy: 0.5, touch: 0.5 }), base({ mods: [] })]) {
      const k = applyMods(sk, club);
      assert.deepEqual([k.carry, k.spread, k.sweet, k.speed, k.roll, k.mishit], [1, 1, 1, 1, 1, 0], `${club}`);
      assert.equal(k.skill, 0.5);
    }
    assert.deepEqual(kitOf(0.37, club).carry, 1); assert.equal(kitOf(0.37, club).skill, 0.37);
  }
  assert.equal(skillFor(base({ driving: 0.31 }), 'driver'), 0.31); assert.equal(skillFor(0.44, 'sw'), 0.44);
  assert.equal(carryFor(0.5, 'iron6'), carryM('iron6', 0.5)); assert.equal(carryFor(base(), 'iron6'), carryM('iron6', 0.5));
  assert.deepEqual(STAT_IDS, ['driving', 'irons', 'short', 'putting', 'power', 'accuracy', 'touch']); assert.equal(NEUTRAL, 0.5);
});

test('stats: power carries the woods furthest, the irons less, the wedge a little, the putter not at all; below neutral is shorter', () => {
  const at = (p: number, club: Club) => applyMods(base({ power: p }), club).carry;
  assert.ok(Math.abs(at(1, 'driver') - (1 + STAT_FX.power.wood * 0.5)) < 1e-12 && Math.abs(at(1, 'driver') - 1.1) < 1e-12, 'a 100 power drives 10% further than a 50');
  assert.ok(at(1, 'driver') > at(1, 'iron6') && at(1, 'iron6') > at(1, 'sw') && at(1, 'sw') > 1 && at(1, 'putter') === 1);
  assert.ok(Math.abs(at(1, 'wood3') - at(1, 'driver')) < 1e-12 && Math.abs(at(1, 'pw') - at(1, 'iron4')) < 1e-12, 'by family: the woods, the irons (the pitching wedge among them), the wedge');
  assert.ok(Math.abs(at(0, 'driver') - 0.9) < 1e-12 && at(0.25, 'iron6') < 1);
  // in the model: the driver carries 10% further at 100 power (the same streams: the mean carry of the volley)
  const a = mean(volley(base({ driving: 0.6, power: 0.5 }), 'driver', 400).map(x => x.carry)), b = mean(volley(base({ driving: 0.6, power: 1 }), 'driver', 400).map(x => x.carry));
  assert.ok(Math.abs(b / a - 1.1) < 0.012, `${a.toFixed(1)} -> ${b.toFixed(1)} m: x${(b / a).toFixed(3)}`);
  // the caddie's reading of the club's carry takes it too (carryFor), so the suggested club and the meter's 100% are the golfer's own
  assert.ok(Math.abs(carryFor(base({ power: 1 }), 'driver') / carryFor(base(), 'driver') - 1.1) < 1e-12);
});

test('stats: accuracy tightens the scatter, widens the sweet spot and slows the marker (woods and irons); touch does it for the putter, both for the wedge', () => {
  const k = (sk: Partial<GameSkills>, club: Club) => applyMods(base(sk), club);
  const A = k({ accuracy: 1 }, 'iron6'), a0 = k({ accuracy: 0 }, 'iron6');
  assert.ok(Math.abs(A.spread - 0.7) < 1e-12 && Math.abs(A.sweet - 1.4) < 1e-12 && Math.abs(A.speed - 0.85) < 1e-12 && Math.abs(a0.spread - 1.3) < 1e-12 && Math.abs(a0.sweet - 0.6) < 1e-12 && Math.abs(a0.speed - 1.15) < 1e-12);
  assert.deepEqual([k({ touch: 1 }, 'iron6').spread, k({ touch: 1 }, 'iron6').sweet, k({ touch: 1 }, 'driver').speed], [1, 1, 1], 'touch does nothing for a full shot');
  const T = k({ touch: 1 }, 'putter');
  assert.ok(Math.abs(T.spread - (1 - STAT_FX.putterSpread * 0.5)) < 1e-12 && Math.abs(T.sweet - 1.4) < 1e-12 && Math.abs(T.speed - 0.85) < 1e-12, 'the putter reads touch');
  assert.equal(k({ accuracy: 1 }, 'putter').spread, 1); assert.equal(k({ accuracy: 1 }, 'putter').sweet, 1);
  const W = k({ accuracy: 1, touch: 1 }, 'sw'), Wa = k({ accuracy: 1 }, 'sw'), Wt = k({ touch: 1 }, 'sw');
  assert.ok(Math.abs(W.sweet - 1.4) < 1e-12 && Math.abs(Wa.sweet - 1.2) < 1e-12 && Math.abs(Wt.sweet - 1.2) < 1e-12, 'the wedge reads the mean of the two');
  // the model: the lateral scatter of a volley (its interquartile range) is 30% smaller at 100 accuracy than at 50, and 30% bigger at 0
  const s0 = iqr(volley(base({ irons: 0.5 }), 'iron6', 130, 600).map(x => x.side)), s1 = iqr(volley(base({ irons: 0.5, accuracy: 1 }), 'iron6', 130, 600).map(x => x.side)), s2 = iqr(volley(base({ irons: 0.5, accuracy: 0 }), 'iron6', 130, 600).map(x => x.side));
  assert.ok(Math.abs(s1 / s0 - 0.7) < 0.09 && Math.abs(s2 / s0 - 1.3) < 0.12, `scatter: 0 ${s2.toFixed(1)}, 50 ${s0.toFixed(1)}, 100 ${s1.toFixed(1)} m`);
});

test('stats: the meter takes the stats: the marker’s speed, the sweet spot’s width, and a click error that is a pull at one accuracy is straight at another', () => {
  const sk = 0.5, sp = (acc: number) => applyMods(base({ accuracy: acc }), 'iron6');
  assert.ok(Math.abs(new SwingMeter(sk, sp(1).speed).speed - 1 / swingTime(sk, sp(1).speed)) < 1e-12 && new SwingMeter(sk, sp(1).speed).speed < new SwingMeter(sk).speed && new SwingMeter(sk, sp(0).speed).speed > new SwingMeter(sk).speed, 'a more accurate golfer has a slower marker');
  assert.equal(swingTime(0.5), swingTime(0.5, 1)); assert.equal(sweetSpot(0.5, 0.02), sweetSpot(0.5, 0.02, 1));
  assert.ok(Math.abs(sweetSpot(0.5, 0, 1.4) / sweetSpot(0.5) - 1.4) < 1e-12);
  // an accuracy click 0.06 meter units off the snap line: outside the sweet spot at skill 0.5 (0.0475), inside it when the sweet spot is x1.4 (0.0665)
  const click = { power: 1, acc: 0.06, boost: 0 };
  assert.equal(swingEffect(click, 0.5, false).shape === 'straight', false); assert.equal(swingEffect(click, 0.5, false, 1.4).shape, 'straight');
  assert.ok(Math.abs(swingEffect(click, 0.5, false, 0.6).deg) > Math.abs(swingEffect(click, 0.5, false).deg), 'a narrower sweet spot misses more');
  // the model plays the same through shotOutcome: the saved outcome and the golfer's skills decide the miss
  const view = flat('fairway'), hole: PlayHole = { n: 1, par: 4, tee: O, pin: { x: 90, y: 0 }, line: [O, { x: 90, y: 0 }] };
  const off = (sk2: GameSkills) => mean(Array.from({ length: 150 }, (_, k) => Math.abs(shotOutcome(view, hole, O, 'fairway', sk2, { club: 'iron6', aim: hole.pin, power: 1, swing: click }, rng(4, k, 4)).landing!.at.y * TILE_M)));
  assert.equal(off(base({ accuracy: 1 })), off(base({ accuracy: 1 })), 'deterministic');
  assert.ok(off(base({ accuracy: 1 })) < 0.8 * off(base({ accuracy: 0 })), `off the line: ${off(base({ accuracy: 1 })).toFixed(1)} m at 100 accuracy, ${off(base({ accuracy: 0 })).toFixed(1)} m at 0: the pull is a miss at 0 and none at 100`);
});

test('mods: stat changes are added and held to 0..1, the factors multiply, a mod for a club or a family reaches only those, and order does not matter', () => {
  const m1: Mod = { id: 'a', stats: { power: 0.3, driving: 0.1 }, carry: 1.04, spread: 0.9 }, m2: Mod = { id: 'b', stats: { power: 0.4 }, carry: 1.05, sweet: 1.1, speed: 0.95, roll: 1.2, mishit: 0.02 };
  const k = applyMods(base({ mods: [m1, m2] }), 'driver'), k2 = applyMods(base({ mods: [m2, m1] }), 'driver');
  assert.equal(k.stats.power, 1, 'power 0.5 + 0.7 is held to 1'); assert.ok(Math.abs(k.stats.driving - 0.6) < 1e-12 && Math.abs(k.skill - 0.6) < 1e-12);
  assert.ok(Math.abs(k.carry - 1.04 * 1.05 * 1.1) < 1e-12 && Math.abs(k.spread - 0.9) < 1e-12 && Math.abs(k.sweet - 1.1) < 1e-12 && Math.abs(k.speed - 0.95) < 1e-12 && Math.abs(k.roll - 1.2) < 1e-12 && Math.abs(k.mishit - 0.02) < 1e-12);
  assert.deepEqual(k, k2, 'the order of the mods does not change the kit');
  // by club and by family
  const only: Mod = { id: 'wedge-grind', clubs: ['sw'], spread: 0.8 }, fam: Mod = { id: 'iron-set', clubs: ['iron'], carry: 1.05 }, one: Mod = { id: 'tour-driver', clubs: ['driver'], carry: 1.08 };
  assert.equal(applyMods(base({ mods: [only] }), 'sw').spread, 0.8); assert.equal(applyMods(base({ mods: [only] }), 'pw').spread, 1); assert.equal(applyMods(base({ mods: [only] }), 'putter').spread, 1);
  for (const c of ['iron4', 'iron6', 'iron8', 'pw'] as Club[]) assert.equal(applyMods(base({ mods: [fam] }), c).carry, 1.05, `${c} is an iron`);
  assert.equal(applyMods(base({ mods: [fam] }), 'sw').carry, 1); assert.equal(applyMods(base({ mods: [fam] }), 'driver').carry, 1);
  assert.equal(applyMods(base({ mods: [one] }), 'driver').carry, 1.08); assert.equal(applyMods(base({ mods: [one] }), 'wood3').carry, 1);
  assert.deepEqual(CLUBS.map(c => FAMILY[c]), ['wood', 'wood', 'iron', 'iron', 'iron', 'iron', 'wedge', 'putter']);
  // a mod changes the skill the model reads (skillFor), so a card that adds driving is felt by the caddie and the meter too
  assert.ok(Math.abs(skillFor(base({ mods: [{ id: 'd', stats: { driving: 0.2 } }] }), 'driver') - 0.7) < 1e-12 && skillFor(base({ mods: [{ id: 'd', stats: { driving: 0.2 } }] }), 'iron6') === 0.5);
  // the mods in the model: a +10% carry card lengthens the driver 10%, a -20% scatter card tightens the volley
  const c0 = mean(volley(base(), 'driver', 400).map(x => x.carry)), c1 = mean(volley(base({ mods: [{ id: 'x', carry: 1.1 }] }), 'driver', 400).map(x => x.carry));
  assert.ok(Math.abs(c1 / c0 - 1.1) < 0.012, `x${(c1 / c0).toFixed(3)}`);
  const s0 = iqr(volley(base(), 'iron6', 130, 600).map(x => x.side)), s1 = iqr(volley(base({ mods: [{ id: 'y', spread: 0.8 }] }), 'iron6', 130, 600).map(x => x.side));
  assert.ok(Math.abs(s1 / s0 - 0.8) < 0.08, `scatter x${(s1 / s0).toFixed(2)}`);
});

test('back-compat: a golfer’s skills without the new fields (or with them at neutral) play every shot exactly as a plain skill did', () => {
  for (const club of CLUBS.filter(c => c !== 'putter')) for (const lie of ['tee', 'fairway', 'rough', 'bunker'] as Lie[]) for (const s of [0.2, 0.5, 0.9]) {
    const a = hitShot(rng(5, 6, 7), s, lie, O, { x: 70, y: 9 }, club, flat('fairway')), b = hitShot(rng(5, 6, 7), { driving: s, irons: s, short: s, putting: s }, lie, O, { x: 70, y: 9 }, club, flat('fairway'));
    const c = hitShot(rng(5, 6, 7), { driving: s, irons: s, short: s, putting: s, power: 0.5, accuracy: 0.5, touch: 0.5 }, lie, O, { x: 70, y: 9 }, club, flat('fairway'));
    assert.deepEqual(a, b, `${club} ${lie} ${s}: object skills`); assert.deepEqual(a, c, `${club} ${lie} ${s}: neutral stats`);
  }
  const view = flat('fairway'), hole: PlayHole = { n: 1, par: 4, tee: O, pin: { x: 90, y: 0 }, line: [O, { x: 90, y: 0 }] };
  const sw = { power: 0.9, acc: 0.05, boost: 0.02 }, a = shotOutcome(view, hole, O, 'fairway', 0.4, { club: 'iron6', aim: hole.pin, power: 1, swing: sw }, rng(1, 2, 3)), b = shotOutcome(view, hole, O, 'fairway', { driving: 0.4, irons: 0.4, short: 0.4, putting: 0.4 }, { club: 'iron6', aim: hole.pin, power: 1, swing: sw }, rng(1, 2, 3));
  assert.deepEqual(a, b);
});

// ---- the player's profile ----

test('player: the profile has the new stats at 50, an old profile loads with them, a bad one takes the start’s, and pressure takes off them like the skills', () => {
  assert.deepEqual(SKILL_IDS, ['driving', 'irons', 'short', 'putting', 'power', 'accuracy', 'touch', 'nerve']);
  assert.deepEqual([START_SKILLS.power, START_SKILLS.accuracy, START_SKILLS.touch], [50, 50, 50]);
  const old = { v: 1, name: 'Old', sex: 'm', skills: { driving: 40, irons: 30, short: 20, putting: 25, nerve: 35 }, log: [], rounds: [], today: { day: 0, n: {} }, busy: null, booked: null };
  const p = normalizePlayer(old)!; assert.deepEqual([p.skills.driving, p.skills.power, p.skills.accuracy, p.skills.touch, p.skills.nerve], [40, 50, 50, 50, 35]);
  const bad = normalizePlayer({ ...old, skills: { ...old.skills, power: 'x', accuracy: 250, touch: -4 } })!; assert.deepEqual([bad.skills.power, bad.skills.accuracy, bad.skills.touch], [50, 100, 0]);
  const g = gameSkills({ ...START_SKILLS, power: 80, accuracy: 60, touch: 40, nerve: 100 }, PRESSURE.tournament), g0 = gameSkills({ ...START_SKILLS, power: 80, accuracy: 60, touch: 40, nerve: 0 }, PRESSURE.tournament);
  assert.ok(Math.abs(g.power! - 0.8) < 1e-12 && Math.abs(g.accuracy! - 0.6) < 1e-12 && Math.abs(g.touch! - 0.4) < 1e-12, 'full nerve: nothing lost');
  assert.ok(Math.abs(g0.power! - 0.8 * (1 - 0.3 * 0.8)) < 1e-12 && g0.accuracy! < 0.6 && g0.touch! < 0.4, 'no nerve at the full pressure: 24% off');
  assert.deepEqual(gameSkills(START_SKILLS, 0).power, 0.5);
  // the shot model reads them: the profile's game is a GameSkills the model plays (power in the carry)
  assert.ok(carryFor(gameSkills({ ...START_SKILLS, power: 100 }, 0), 'driver') > 1.09 * carryFor(gameSkills({ ...START_SKILLS, power: 50 }, 0), 'driver'));
});

test('player: practice raises the new stats (the bucket power and accuracy, the putting green touch, the chipping green touch and accuracy), and the handicap follows them', () => {
  assert.ok((PRACTICE.bucket.gains.power ?? 0) > 0 && (PRACTICE.bucket.gains.accuracy ?? 0) > 0 && (PRACTICE.putting.gains.touch ?? 0) > 0 && (PRACTICE.chipping.gains.touch ?? 0) > 0 && (PRACTICE.chipping.gains.accuracy ?? 0) > 0);
  const p = startProfile('m'), pv = practicePreview(p, 'bucket', 1);
  assert.ok(pv.gains.some(g => g.id === 'power' && g.to > g.from) && pv.gains.some(g => g.id === 'accuracy' && g.to > g.from), 'a bucket shows its gains in power and accuracy');
  const sk = { ...START_SKILLS };
  assert.ok(handicapOf({ ...sk, accuracy: 80 }) < handicapOf(sk) && handicapOf({ ...sk, power: 80 }) < handicapOf(sk) && handicapOf({ ...sk, touch: 80 }) < handicapOf(sk), 'better stats, lower handicap');
  assert.ok(handicapOf({ ...sk, accuracy: 20 }) > handicapOf(sk), 'worse stats, higher');
  assert.equal(handicapOf({ ...sk, power: 50, accuracy: 50, touch: 50 }), handicapOf(sk), 'at 50 nothing changes');
});

test('save: a saved tournament owner keeps the new stats with his skills (a reload replays the same round), and a save without them loads as before', () => {
  const g0 = { town: { x: 1, y: 1 }, course: [0, 0, 9, 9], clubhouse: { x: 1, y: 1 }, play: { key: 3, owner: 'm', inputs: [], caddie: null, skills: { driving: 0.4, irons: 0.3, short: 0.2, putting: 0.3, power: 0.7, accuracy: 0.6, touch: 0.2 } } } as never;
  assert.deepEqual(normalizeGolfSave(g0)!.play!.skills, { driving: 0.4, irons: 0.3, short: 0.2, putting: 0.3, power: 0.7, accuracy: 0.6, touch: 0.2 });
  const old = { ...(g0 as object), play: { key: 3, owner: 'm', inputs: [], caddie: null, skills: { driving: 0.4, irons: 0.3, short: 0.2, putting: 0.3 } } } as never;
  assert.deepEqual(normalizeGolfSave(old)!.play!.skills, { driving: 0.4, irons: 0.3, short: 0.2, putting: 0.3 });
  const junk = { ...(g0 as object), play: { key: 3, owner: 'm', inputs: [], caddie: null, skills: { driving: 0.4, irons: 0.3, short: 0.2, putting: 0.3, power: 'x', accuracy: 9 } } } as never;
  assert.deepEqual(normalizeGolfSave(junk)!.play!.skills, { driving: 0.4, irons: 0.3, short: 0.2, putting: 0.3, accuracy: 1 });
});
