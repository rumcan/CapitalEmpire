// From the range to the first hole (plan P24 Phase 4a, T132): the unlock order of a range start (the range card, the practice area after the first
// upgrade, Props after the putting green, New hole at $20,000 of takings in a season or in season 2), the hint bar's words at each step (never
// "Step 1: Build your first hole" while the range is the job), the par-3 the first New hole suggests, the props' diminishing returns, the range
// upgrades' upkeep, the range's name plate and the car park's counter, and the Select panel's words for a decor prop.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FIRST_PAR3_M, RAMP_TAKINGS, RAMP_WHY, RANGE_HINTS, advanceProgress, computeProgressiveUiState, emptyProgress, isStuck, nextFirstRunHint, normalizeProgress,
  progressFacts, rampEarned, rampStep, type CourseProgress, type GolfProgress, type PlayerProgressFacts,
} from '../src/game/ext/progressive-ui';
import { HoleWizard, suggestedGreen, type WizardHost } from '../src/game/ext/hole-wizard';
import { makeGrid } from '../src/game/ext/course-grid';
import { planInfo } from '../src/game/ext/hole-plan';
import { DECOR, DECOR_BY_KEY, PROPS_DECAY, decorAppeal, decorInfo, kindAppeal, nextAppeal, sellBack } from '../src/game/golf/decor';
import { PROPS_APPEAL_CAP, RANGE_UPGRADES, RangeSim, defaultRangeBiz, normalizeRangeBiz, parkLabel, rangeMapLabel, rangeNewSeason, rangeScene, rangeUpkeep, withUpgrade, type CarSlot } from '../src/game/golf/rangebiz';
import { RangeHost, outfieldStripes, type RangeHostCtx } from '../src/game/golf/rangehost';
import type { Rect } from '../src/game/golf/mode';

/** a new range game's progress and its course: no hole, season 1, the range as given */
const course = (range: Partial<NonNullable<CourseProgress['range']>> = {}, c: Partial<CourseProgress> = {}): CourseProgress => ({ holes: 0, seasons: 0, invited: false, range: { upgrades: 0, seasonTakings: 0, propsPlaced: false, ...range }, ...c });
const fresh = (): GolfProgress => ({ ...emptyProgress(), ramp: 0 });
const facts = (p: GolfProgress, c: CourseProgress, practice?: PlayerProgressFacts['practice']): PlayerProgressFacts => { const f = progressFacts(p, c); if (practice) f.practice = practice; return f; };
const NONE = { putting: 'none', chipping: 'none' } as const, PUTT = { putting: 'open', chipping: 'none' } as const;
const locked = (f: PlayerProgressFacts) => Object.fromEntries(computeProgressiveUiState(f).lockedTools.map(t => [t.id, t.why]));
const visible = (f: PlayerProgressFacts) => computeProgressiveUiState(f).visibleTools;

test('the unlock order, step by step: the range card, the practice area, Props, then New hole; locked tools stay in place with their reason', () => {
  const p = fresh();
  // minute zero: Select and Bulldoze; Holes and Paths wait for the first upgrade, Props for the putting green, Buildings for New hole
  const f0 = facts(p, course(), NONE), s0 = computeProgressiveUiState(f0);
  assert.equal(rampStep(f0), 0); assert.equal(s0.ramp, 0);
  assert.deepEqual(locked(f0), { course: RAMP_WHY[1], path: RAMP_WHY[1], props: RAMP_WHY[2], buildings: RAMP_WHY[3], greenkeeping: 'Unlocks when your first hole is grown in', road: 'Unlocks with your third hole or the tour\'s invitation', lane: 'Unlocks with your third hole or the tour\'s invitation', downgrade: 'Unlocks with your third hole or the tour\'s invitation', junction: 'Unlocks with your third hole or the tour\'s invitation', bus: 'Unlocks with your third hole or the tour\'s invitation', park: 'Unlocks with your third hole or the tour\'s invitation', toll: 'Unlocks with your third hole or the tour\'s invitation', paint: 'Unlocks with your first hole' });
  assert.deepEqual(visible(f0), ['select', 'bulldoze']);
  assert.equal(s0.newHoleLock, RAMP_WHY[3]);
  assert.ok(s0.visibleGroups.includes('course'), 'the Course group stays on the rail, its tools locked in place');
  // the first upgrade: Holes (Shape by hand: Green and Bunker for the practice greens) and Paths open, with NEW badges; New hole still waits
  const f1 = facts(p, course({ upgrades: 1 }), NONE), s1 = computeProgressiveUiState(f1);
  assert.equal(rampStep(f1), 1);
  assert.ok(visible(f1).includes('course') && visible(f1).includes('path'));
  assert.deepEqual(Object.keys(locked(f1)).filter(k => ['course', 'path', 'props', 'buildings'].includes(k)).sort(), ['buildings', 'props']);
  assert.equal(s1.shapeByHand, true); assert.deepEqual([...s1.visibleCourseBrushes].sort(), ['bunker', 'green']);
  assert.equal(s1.newHoleLock, RAMP_WHY[3]); assert.ok(s1.newTools.includes('course') && s1.newTools.includes('path'));
  // the putting green opens: Props
  const f2 = facts(p, course({ upgrades: 1 }), PUTT);
  assert.equal(rampStep(f2), 2); assert.ok(visible(f2).includes('props')); assert.equal(locked(f2).buildings, RAMP_WHY[3]);
  // $20,000 of takings in a season: New hole and Buildings; the stages go on as before (Paint waits for the first hole)
  const f3 = facts(p, course({ upgrades: 1, seasonTakings: RAMP_TAKINGS }), PUTT), s3 = computeProgressiveUiState(f3);
  assert.equal(rampStep(f3), 3); assert.equal(s3.newHoleLock, null); assert.ok(visible(f3).includes('buildings'));
  assert.equal(locked(f3).paint, 'Unlocks with your first hole'); assert.equal(s3.stage, 1);
  assert.equal(rampEarned(facts(p, course({ upgrades: 1, seasonTakings: RAMP_TAKINGS - 1 }), PUTT)), 2, 'not a dollar short');
  // or the second season, whatever was bought; or a hole
  assert.equal(rampStep(facts(p, course({}, { seasons: 1 }), NONE)), 3);
  assert.equal(rampStep(facts(p, course({}, { holes: 1 }), NONE)), 3);
});

test('a step never closes again; Show every tool now opens everything; old saves keep every tool; other starts are unchanged', () => {
  const p = fresh(), c1 = course({ upgrades: 1 });
  assert.equal(advanceProgress(p, facts(p, c1, PUTT), 'select'), true); assert.equal(p.ramp, 2);
  // the putting green rubbed out again, the season's takings reset: Props stays open
  const back = facts(p, course({ upgrades: 1 }), NONE);
  assert.equal(rampStep(back), 2); assert.ok(visible(back).includes('props'));
  assert.equal(advanceProgress(p, back, 'select'), false, 'nothing falls');
  // opening Holes clears its NEW badge (saved)
  assert.equal(advanceProgress(p, back, 'course'), true); assert.ok(p.seen.includes('course')); assert.ok(!computeProgressiveUiState(facts(p, c1, NONE)).newTools.includes('course'));
  // Show every tool now
  const adv = { ...fresh(), advanced: true }, fa = facts(adv, course(), NONE), sa = computeProgressiveUiState(fa);
  assert.deepEqual(sa.lockedTools, []); assert.equal(sa.newHoleLock, null); assert.equal(sa.ramp, null);
  // a range save from before T132: no ramp saved, every tool as it had them, no NEW badges for them
  const old = normalizeProgress({ pieces: 0, roads: 0, parks: 0, structures: 0, playS: 50, dismissed: [], advanced: false, stage: 1, seen: [] });
  assert.equal(old.ramp, undefined);
  const fo = facts(old, course(), NONE), so = computeProgressiveUiState(fo);
  assert.equal(rampStep(fo), 3); assert.equal(so.newHoleLock, null);
  for (const t of ['course', 'path', 'props', 'buildings'] as const) { assert.ok(so.visibleTools.includes(t), t); assert.ok(!so.newTools.includes(t), `${t} not NEW`); }
  // the saved step round-trips, bad ones drop
  assert.equal(normalizeProgress(JSON.parse(JSON.stringify({ ...fresh(), ramp: 2 }))).ramp, 2);
  assert.equal(normalizeProgress({ ...fresh(), ramp: 'x' as never }).ramp, undefined);
  assert.equal(normalizeProgress({ ...fresh(), ramp: 9 as never }).ramp, 3);
  // a town or classic golf start: no range, no ramp (as before T132)
  const town = progressFacts(emptyProgress(), { holes: 0, seasons: 0, invited: false });
  assert.equal(town.ramp, undefined); assert.equal(computeProgressiveUiState(town).ramp, null); assert.equal(computeProgressiveUiState(town).newHoleLock, null);
  assert.ok(computeProgressiveUiState(town).visibleTools.includes('course') && computeProgressiveUiState(town).visibleTools.includes('props'));
  assert.equal(nextFirstRunHint(town)?.id, 'hint-build-first-hole');
});

test('the hint bar follows the ramp: never "Step 1: Build your first hole" while the range is the job; each step has Show me', () => {
  const p = fresh(), ids: string[] = [];
  const at = (c: CourseProgress, pr: PlayerProgressFacts['practice'], dismissed: string[] = []) => { const f = facts({ ...p, dismissed }, c, pr); const h = nextFirstRunHint(f); if (h) ids.push(h.id); return h; };
  // minute zero: the range is open, click it; once the card was seen: buy the first upgrade
  const h0 = at(course(), NONE)!;
  assert.equal(h0.id, 'hint-range-open'); assert.match(h0.title, /driving range is open/i); assert.match(h0.body, /Click the range/); assert.equal(h0.show, true);
  p.seen = ['range-card'];
  assert.equal(at(course(), NONE)?.id, 'hint-range-upgrade');
  // the first upgrade: paint the putting green (Show me pans there); then Props; then the chipping green; then the wait for New hole
  assert.equal(at(course({ upgrades: 1 }), NONE)?.id, 'hint-practice-putting');
  assert.equal(at(course({ upgrades: 1 }), PUTT)?.id, 'hint-range-props');
  assert.equal(at(course({ upgrades: 1, propsPlaced: true }), PUTT)?.id, 'hint-practice-chipping');
  const wait = at(course({ upgrades: 2, propsPlaced: true, seasonTakings: 12345 }), { putting: 'open', chipping: 'open' })!;
  assert.equal(wait.id, 'hint-range-wait'); assert.match(wait.body, /\$20,000 in a season \(\$12,345 so far\), or in season 2/); assert.ok(!wait.show);
  // New hole open: a par-3 first
  const h3 = at(course({ upgrades: 2, seasonTakings: RAMP_TAKINGS }), { putting: 'open', chipping: 'open' })!;
  assert.equal(h3.id, 'hint-range-first-hole'); assert.match(h3.title, /par-3/); assert.match(h3.body, new RegExp(`${FIRST_PAR3_M} m par-3`)); assert.equal(h3.show, true);
  // dismissed (Got it): the practice hints that are left, else nothing; never Step 1
  assert.equal(at(course({}, { seasons: 1 }), NONE, [RANGE_HINTS.firstHole.id])?.id, 'hint-practice-putting');
  assert.equal(at(course({}, { seasons: 1 }), { putting: 'open', chipping: 'open' }, [RANGE_HINTS.firstHole.id]), null);
  assert.ok(!ids.includes('hint-build-first-hole'), ids.join());
  for (const id of ids) assert.ok(!/^Step 1/.test(nextFirstRunHint(facts(p, course(), NONE))!.title), id);
  // the range start is never "stuck": the range is the job (the ramp offers the first hole itself)
  const long = facts({ ...p, playS: 5000 }, course(), NONE);
  assert.equal(isStuck(long), false); assert.equal(computeProgressiveUiState(long).stage, 1);
  // the first hole built: the stages' hints as everywhere (none at stage 2)
  assert.equal(nextFirstRunHint(facts(p, course({}, { holes: 1 }), NONE)), null);
});

test('the first New hole suggests a par-3: the green 150 m from the tee toward the pointer; Any length lets the click place it', () => {
  const g = makeGrid(0, 0, 600, 300), host: WizardHost = { grid: () => g, plans: () => [], month: () => 64, price: s => (s ? 2 : 0), money: () => 1e9 };
  const w = new HoleWizard(host), PX = 16, ts = (x: number, y: number) => ({ x: x * PX, y: y * PX });
  const s = suggestedGreen({ x: 20, y: 75 }, { x: 400, y: 75 }, FIRST_PAR3_M)!;
  assert.ok(Math.abs(Math.hypot(s.x - 20, s.y - 75) * 2 - FIRST_PAR3_M) < 1.5, 'the green sits 150 m out');
  assert.equal(suggestedGreen({ x: 20, y: 75 }, { x: 20.2, y: 75 }, 150), null, 'no way to aim on the tee itself');
  w.start(1); w.suggestM = FIRST_PAR3_M;
  w.press({ x: 20.25, y: 75.25 }, 20 * PX, 75 * PX, ts);
  w.move({ x: 300, y: 75 }, 300 * PX, 75 * PX, ts);
  assert.ok(w.plan); const info = planInfo(w.plan!);
  assert.equal(info.par, 3); assert.ok(Math.abs(info.lengthM - FIRST_PAR3_M) <= 3, `${info.lengthM} m`);
  assert.equal(w.press({ x: 300, y: 75 }, 300 * PX, 75 * PX, ts), 'green'); assert.ok(Math.abs(w.plan!.green.x - 95) < 1, 'placed by the suggestion, not the click');
  // without the suggestion the click sets the green
  const v = new HoleWizard(host); v.start(1); v.press({ x: 20, y: 75 }, 20 * PX, 75 * PX, ts); v.move({ x: 300, y: 75 }, 300 * PX, 75 * PX, ts);
  assert.ok(planInfo(v.plan!).lengthM > 500);
});

test('props have diminishing returns: $2,000 of grasses no longer reaches the cap; a real mix of $25-40k does', () => {
  const anchors = [{ x: 0, y: 0 }], at = (key: string, n: number) => Array.from({ length: n }, (_, i) => ({ key, x: (i % 5) * 1.5, y: Math.floor(i / 5) * 1.5 }));
  assert.ok(Math.abs(kindAppeal([0.01, 0.01, 0.01]) - 0.01 * (1 + PROPS_DECAY + PROPS_DECAY ** 2)) < 1e-12);
  assert.equal(kindAppeal([0.01, 0.15]), 0.15 + 0.01 * PROPS_DECAY, 'the best of a kind counts in full');
  // forty ornamental grasses ($2,000) were the cap before T132; now a plant's worth caps at 5%
  const grasses = at('grass-ornamental', 40);
  assert.equal(grasses.length * DECOR_BY_KEY.get('grass-ornamental')!.price, 2000);
  assert.ok(decorAppeal(grasses, anchors) < 0.051, `${decorAppeal(grasses, anchors)}`);
  // nine different plants are still one kind
  assert.ok(decorAppeal(DECOR.filter(d => d.kind === 'plant').map(d => ({ key: d.key, x: 1, y: 1 })), anchors) < 0.05);
  // each further one adds less
  const a1 = nextAppeal([], anchors, 'fountain'), a2 = nextAppeal(at('fountain', 1), anchors, 'fountain');
  assert.equal(a1, 0.15); assert.ok(Math.abs(a2 - 0.15 * PROPS_DECAY) < 1e-9);
  // a real mix: a fountain, a statue, a well, ten plants, an arch, two pillars, two benches, the board, a flag pole, three bins and lamps
  const mix = [...at('fountain', 1), ...at('statue', 1), ...at('well', 1), ...at('pot-terracotta', 5), ...at('hedge', 5), ...at('arch', 1), ...at('pillar', 2), ...at('bench', 2), ...at('board', 1), ...at('flagpole', 1), ...at('bin', 2), ...at('lamp', 1)];
  const cost = mix.reduce((s, p) => s + DECOR_BY_KEY.get(p.key)!.price, 0);
  assert.ok(cost >= 25000 && cost <= 40000, `$${cost}`);
  assert.equal(decorAppeal(mix, anchors), PROPS_APPEAL_CAP, 'the real mix reaches the cap');
  assert.ok(decorAppeal(mix.filter(p => p.key !== 'fountain'), anchors) < PROPS_APPEAL_CAP, 'without the fountain it does not');
  // the cheap way to the cap is gone: everything but the fountain and the statue, many of each, stays short for less than $15,000
  const cheap = [...at('pot-palm', 20), ...at('well', 4), ...at('arch', 4), ...at('bench', 4), ...at('bin', 4)];
  assert.ok(cheap.reduce((s, p) => s + DECOR_BY_KEY.get(p.key)!.price, 0) < 15000);
  assert.ok(decorAppeal(cheap, anchors) < 0.3, `${decorAppeal(cheap, anchors)}`);
  // out of reach counts nothing
  assert.equal(decorAppeal([{ key: 'fountain', x: 40, y: 0 }], anchors), 0);
});

test('the range upgrades cost upkeep each month, booked as upkeep and shown on the card; the season counts it', () => {
  for (const u of RANGE_UPGRADES) { assert.ok(u.upkeep > 0 && u.upkeep < u.cost / 50, `${u.id}: $${u.upkeep} a month`); }
  let s = defaultRangeBiz();
  assert.equal(rangeUpkeep(s), 0);
  s = withUpgrade(withUpgrade(s, 'bays8'), 'dispenser');
  assert.equal(rangeUpkeep(s), 60 + 30);
  // the host pays it as each game month begins (a skip pays every month crossed), never the month it was loaded in
  let month = 5, paid = 0;
  const plot: Rect = [200, 200, 70, 150], biz = s, ctx: RangeHostCtx = {
    biz: () => biz, plot: () => ({ rect: plot, facing: 2 }), carPark: () => null, addPiece: () => null, removeProp: () => {}, setGround: () => {}, layPaths: () => {}, clearTrees: () => {},
    money: () => 1e6, spend: () => {}, book: () => {}, month: () => month, payUpkeep: n => { paid += n; },
    demand: () => ({ tier: 1, exits: 2, residents: 0 }), dayLen: () => 600, simT: () => 0, clock: () => ({ hour: 12, day: 1 }),
    save: () => {}, toast: () => {}, emit: () => {}, grid: () => null, layTee: () => false,
  };
  const h = new RangeHost(ctx, 3); h.sync(); h.step(); h.step();
  assert.equal(paid, 0, 'the month of the load is not charged again');
  month = 6; h.step(); assert.equal(paid, 90); assert.equal(biz.season.upkeep, 90);
  month = 9; h.step(); assert.equal(paid, 90 * 4, 'a skip of three months pays three');
  const v = h.view()!; assert.equal(v.upkeep, 90); assert.equal(v.upkeepSeason, 360);
  // the season closes: its upkeep starts again, the lifetime keeps it; the save round-trips it
  assert.equal(normalizeRangeBiz(JSON.parse(JSON.stringify(biz))).season.upkeep, 360);
  rangeNewSeason(biz); assert.equal(biz.season.upkeep, 0); assert.equal(biz.total.upkeep, 360);
  assert.equal(normalizeRangeBiz({ v: 1, owned: [], price: 6, season: { takings: 5 } }).season.upkeep, 0, 'an old save has paid none');
});

test('the range stays a range: its own outfield preset with mowing stripes on top, target greens raised in a fringe and collar', () => {
  const sc = rangeScene([200, 200, 70, 150], 2, defaultRangeBiz());
  const out = sc.patches.filter(p => p.surf === 'outfield'); assert.equal(out.length, 1); assert.equal(out[0]!.mow, true);
  const greens = sc.patches.filter(p => p.surf === 'target'); assert.equal(greens.length, 2, 'two target greens to start');
  assert.ok(greens.every(p => p.edge === 'raised'));
  assert.equal(sc.patches.filter(p => p.surf === 'fringe').length, 2, 'each in its fringe ring');
  // the stripes follow the preset, across the line of play ('x') or down it ('y'), from the tee end of the outfield
  const across = outfieldStripes(sc, { on: true, dir: 'x', width: 6, light: 0.08, dark: 0.1, lightCol: '#c8e07c', darkCol: '#2e5a1c', tint: 0.2, soft: 0.25 })!;
  assert.deepEqual([across.ux, across.uy], [sc.aim.x, sc.aim.y]); assert.equal(across.w, 6); assert.deepEqual([across.ox, across.oy], [sc.mowFrom.x, sc.mowFrom.y]);
  const down = outfieldStripes(sc, { on: true, dir: 'y', width: 4, light: 0.1, dark: 0.1, lightCol: '#ffffff', darkCol: '#000000', tint: 0, soft: 0 })!;
  assert.deepEqual([down.ux, down.uy], [sc.roadDir.x, sc.roadDir.y]);
  assert.equal(outfieldStripes(sc, { on: false } as never), null, 'stripes off in the studio: none');
});

test('the name plate and the car park counter: plain words, and the range sim\'s parked cars counted', () => {
  assert.equal(rangeMapLabel(4), 'DRIVING RANGE · 4 BAYS'); assert.ok(!/L\d/.test(rangeMapLabel(12)));
  assert.equal(parkLabel(0, 3, 44), 'P · 3/44'); assert.equal(parkLabel(2, 3, 44), 'P · 5/44'); assert.equal(parkLabel(40, 9, 44), 'P · 44/44', 'never past the bays');
  // golfers come, park and play: the sim counts the cars standing in the car park
  const plot: Rect = [200, 200, 70, 150], s = defaultRangeBiz(), sc = rangeScene(plot, 2, s);
  const slots: CarSlot[] = Array.from({ length: 12 }, (_, i) => ({ x: plot[0] + 52 + (i % 6) * 2.6, y: plot[1] + 6 + Math.floor(i / 6) * 6, hx: 0, hy: 1 }));
  const r = new RangeSim(7, 10); r.setScene(sc, slots, { x: plot[0] + 69, y: plot[1] + 10 });
  let most = 0; for (let t = 0; t < 200; t += 0.1) { r.step(0.1, { hour: 17, day: 1 }, s, { tier: 3, exits: 2, residents: 3000 }, 600); most = Math.max(most, r.parked()); }
  assert.ok(most >= 1 && most <= 12, `${most} parked`);
  r.clear(); assert.equal(r.parked(), 0);
});

test('the Select panel names a decor prop by its catalogue name, with what it sells for', () => {
  const i = decorInfo('board')!;
  assert.equal(i.name, 'Welcome board'); assert.equal(i.group, 'Furniture'); assert.equal(i.sell, sellBack(DECOR_BY_KEY.get('board')!)); assert.equal(i.price, 2500);
  assert.equal(decorInfo('statue')!.standIn, 'Bronze golfer statue');
  assert.equal(decorInfo(undefined), null); assert.equal(decorInfo('no-such-prop'), null);
});
