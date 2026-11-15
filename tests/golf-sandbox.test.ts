// Sandbox mode (#1314) and the course building unlock (#1305): the sandbox flag is saved with the game and comes back from a save, a sandbox game has no tutorial and
// every tool open whatever the range has done, its treasury starts at SANDBOX_MONEY, and the title card's choice reaches the new game (the town roads option, #1317).
// The unlock rule: New hole and the clubhouse wait for RAMP_TAKINGS of range takings in a season (or season 2) with the progress shown; a sandbox game ignores it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LOOKS_NEEDED, NEW_BADGE_IDS, RAMP_TAKINGS, rangeLooks, SANDBOX_MONEY, computeProgressiveUiState, emptyProgress, makeSandbox, newRangeGuide, newTour, nextFirstRunHint, normalizeProgress,
  normalizeSandbox, progressFacts, rampProgress, sandboxTopUp, type CourseProgress, type GolfProgress,
} from '../src/game/ext/progressive-ui';
import { START_CHOICES, choiceFromStore, choiceHash, choiceOf, sandboxOf } from '../src/game/showcase';
import { buildCards } from '../src/ui/jam/build-menu';
import { unlockPct } from '../src/ui/unlock-bar';
import { readSave, saveSlot, setSaveSlot, setSaveStore, slotHasSave, writeSave, type SaveStore, type SaveV5 } from '../src/game/save';

/** a new range game's progress, as Engine.newRangeGame makes it (the ramp at 0, the guided build and the start tutorial running) */
const fresh = (): GolfProgress => ({ ...emptyProgress(), ramp: 0, guide: newRangeGuide(), tour: newTour() });
/** a range start's course: no hole, season 1, the range as given */
const course = (range: Partial<NonNullable<CourseProgress['range']>> = {}, c: Partial<CourseProgress> = {}): CourseProgress => ({ holes: 0, seasons: 0, invited: false, range: { upgrades: 0, seasonTakings: 0, propsPlaced: false, ...range }, ...c });

test('the sandbox flag is saved with the game: it survives a save (JSON) and a load (normalizeProgress); a normal game has none', () => {
  const p = makeSandbox(fresh(), { townRoads: true });
  assert.deepEqual(p.sandbox, { townRoads: true });
  const back = normalizeProgress(JSON.parse(JSON.stringify(p)));
  assert.deepEqual(back.sandbox, { townRoads: true }, 'a sandbox game loads as one, with its town roads choice');
  assert.deepEqual(normalizeProgress(JSON.parse(JSON.stringify(makeSandbox(fresh(), { townRoads: false })))).sandbox, { townRoads: false });
  assert.equal(normalizeProgress(JSON.parse(JSON.stringify(fresh()))).sandbox, undefined, 'a normal game stays normal');
  assert.equal(normalizeProgress({ ...fresh(), sandbox: 'yes' as never }).sandbox, undefined, 'a bad flag is no sandbox');
  assert.deepEqual(normalizeSandbox({ townRoads: 'x' }), { townRoads: false });
  assert.equal(normalizeSandbox(null), null);
});

test('a sandbox game: no start tutorial, no guided build, every stage and badge open, no hints', () => {
  const p = makeSandbox(fresh(), { townRoads: false });
  assert.equal(p.guide, undefined, 'no guided build card'); assert.equal(p.tour, undefined, 'no start tutorial');
  assert.equal(p.ramp, 3); assert.equal(p.stage, 3);
  for (const id of NEW_BADGE_IDS) assert.ok(p.seen.includes(id), `${id} is not NEW`);
  const f = progressFacts(p, course());
  assert.equal(f.sandbox, true);
  assert.equal(nextFirstRunHint(f), null, 'no hint');
  // even with the facts the tutorial would read (the range card unseen, nothing bought), no hint and no guide step
  assert.equal(f.guideStep, undefined);
});

test('the course building unlock (#1305): New hole and the clubhouse wait for the range takings, with the progress; a sandbox game ignores the lock', () => {
  // a normal new game: locked, with what opens it and how far along it is
  const n = progressFacts(fresh(), course({ upgrades: 1, seasonTakings: 750 })), sn = computeProgressiveUiState(n);
  assert.match(sn.newHoleLock ?? '', /takes \$5,000 in a season \(\$750 so far\), or in season 2/);
  assert.deepEqual(sn.newHoleProgress, { have: 750, need: RAMP_TAKINGS });
  assert.ok(sn.lockedTools.some(t => t.id === 'buildings'), 'the clubhouse (Buildings) waits too');
  assert.deepEqual(rampProgress(n), { have: 750, need: 5000 });
  // the unlock happening: the takings reach RAMP_TAKINGS
  const u = computeProgressiveUiState(progressFacts(fresh(), course({ upgrades: 1, seasonTakings: RAMP_TAKINGS })));
  assert.equal(u.newHoleLock, null); assert.equal(u.newHoleProgress, null); assert.ok(u.visibleTools.includes('buildings'));
  // or season 2
  assert.equal(computeProgressiveUiState(progressFacts(fresh(), course({}, { seasons: 1 }))).newHoleLock, null);
  // a sandbox game at minute zero, nothing taken: everything open, nothing locked, no ramp, no hint
  const s = computeProgressiveUiState(progressFacts(makeSandbox(fresh(), { townRoads: false }), course()));
  assert.equal(s.newHoleLock, null); assert.equal(s.newHoleProgress, null); assert.equal(s.ramp, null);
  assert.deepEqual(s.lockedTools, []); assert.deepEqual(s.lockedGroups, []); assert.equal(s.activeHint, null);
  for (const t of ['course', 'buildings', 'path', 'props', 'practice', 'greenkeeping', 'paint', 'junction', 'lane', 'park', 'bus', 'toll'] as const) assert.ok(s.visibleTools.includes(t), t);
  for (const c of ['land', 'holes', 'event', 'grass'] as const) assert.ok(s.visibleGolfChips.includes(c), c);
  assert.ok(s.shapeByHand); assert.deepEqual(s.lockedCourseClasses, []);
  assert.equal(s.stageLabel, 'Sandbox: every tool open');
  // the sandbox flag beats even a saved ramp step of 0 (a flag added to an older progress)
  const raw = { ...fresh(), sandbox: { townRoads: false } };
  assert.equal(computeProgressiveUiState(progressFacts(normalizeProgress(raw), course())).newHoleLock, null);
});

test('the game build also wants the range made pretty (#1305): 3 looks besides the takings, each listed; season 2 still opens it', () => {
  assert.equal(LOOKS_NEEDED, 3);
  assert.deepEqual(rangeLooks(['greens', 'pave', 'bays8'], true, false), ['greens', 'gravel', 'props']);
  assert.deepEqual(rangeLooks(['targets', 'teeturf', 'grass', 'gravel'], false, true), ['greens', 'teeturf', 'grass', 'gravel', 'putting']);
  assert.deepEqual(rangeLooks([], false, false), []);
  // the takings are there, the looks are not: still locked, and the lock says so
  const bare = computeProgressiveUiState(progressFacts(fresh(), course({ upgrades: 2, seasonTakings: RAMP_TAKINGS, looks: [] })));
  assert.match(bare.newHoleLock ?? '', /\(\$5,000 so far\) and looks cared for \(0 of 3\), or in season 2/);
  assert.equal(bare.newHoleProgress?.looks?.done, 0); assert.equal(bare.newHoleProgress?.looks?.items.length, 6);
  // two looks: still locked; the checklist ticks them
  const two = computeProgressiveUiState(progressFacts(fresh(), course({ upgrades: 2, seasonTakings: RAMP_TAKINGS, looks: ['greens', 'gravel'] })));
  assert.ok(two.newHoleLock); assert.deepEqual(two.newHoleProgress?.looks?.items.filter(i => i.done).map(i => i.id), ['greens', 'gravel']);
  // the third: open (the unlock happening)
  const three = computeProgressiveUiState(progressFacts(fresh(), course({ upgrades: 2, seasonTakings: RAMP_TAKINGS, looks: ['greens', 'gravel', 'props'] })));
  assert.equal(three.newHoleLock, null); assert.ok(three.visibleTools.includes('buildings'));
  // the looks without the takings: locked
  assert.ok(computeProgressiveUiState(progressFacts(fresh(), course({ upgrades: 2, seasonTakings: 10, looks: ['greens', 'gravel', 'props'] }))).newHoleLock);
  // season 2 opens it whatever the range looks like
  assert.equal(computeProgressiveUiState(progressFacts(fresh(), course({ looks: [] }, { seasons: 1 }))).newHoleLock, null);
  // a sandbox game never waits for either
  assert.equal(computeProgressiveUiState(progressFacts(makeSandbox(fresh(), { townRoads: false }), course({ looks: [] }))).newHoleLock, null);
});

test('the Build menu (jam) shows a locked New hole and clubhouse with their progress; open ones carry none', () => {
  const base = {
    places: [], range: null, rangeUpkeep: 0, clubhouse: { built: false, cost: 45000, upkeep: 300 }, course: null, money: 100000,
  } as unknown as Parameters<typeof buildCards>[0];
  const why = 'Unlocks when the range takes $5,000 in a season ($750 so far), or in season 2';
  const locked = buildCards({ ...base, locks: { newHole: why, buildings: why, path: null, practice: null, progress: { have: 750, need: 5000 } } });
  const hole = locked.find(c => c.id === 'hole')!, club = locked.find(c => c.id === 'clubhouse')!;
  assert.equal(hole.why, why); assert.deepEqual(hole.progress, { have: 750, need: 5000 });
  assert.equal(club.why, why); assert.deepEqual(club.progress, { have: 750, need: 5000 });
  const open = buildCards({ ...base, locks: { newHole: null, buildings: null, path: null, practice: null, progress: null } });
  assert.equal(open.find(c => c.id === 'hole')!.progress, undefined); assert.equal(open.find(c => c.id === 'clubhouse')!.progress, undefined);
  assert.equal(unlockPct(750, 5000), 15); assert.equal(unlockPct(9000, 5000), 100); assert.equal(unlockPct(-5, 5000), 0); assert.equal(unlockPct(1, 0), 100);
});

test('the sandbox treasury and the title card choice: SANDBOX_MONEY, and Sandbox (with its town roads option) carried through a reload', () => {
  assert.equal(SANDBOX_MONEY, 10_000_000);
  assert.equal(sandboxTopUp(600_000), 9_400_000); assert.equal(sandboxTopUp(75_000), 9_925_000); assert.equal(sandboxTopUp(SANDBOX_MONEY + 1), 0); assert.equal(sandboxTopUp(Infinity), 0);
  for (const c of START_CHOICES) { assert.equal(choiceOf(choiceHash(c)), c); assert.equal(choiceFromStore(c), c); }
  assert.deepEqual(sandboxOf('sandbox'), { townRoads: false }); assert.deepEqual(sandboxOf('sandbox-town'), { townRoads: true });
  assert.equal(sandboxOf('new'), null); assert.equal(sandboxOf('continue'), null); assert.equal(sandboxOf(null), null);
  assert.equal(choiceOf('#play=sandboxes'), null); assert.equal(choiceFromStore('sandbox-x'), null);
});

test('a sandbox game has its own save slot: the career save is never written while it runs, and each slot reads back its own game', async () => {
  const mem = new Map<string, ArrayBuffer>();
  const store: SaveStore = { get: async k => mem.get(k), put: async (k, v) => { mem.set(k, v); }, del: async k => { mem.delete(k); }, keys: async () => [...mem.keys()] };
  setSaveStore(store);
  const save = (seed: number, sandbox: boolean) => ({ version: 5, map: 2048, seed, segs: [], nodes: [], props: [], money: 1, day: 1, cam: { X: 0, Y: 0, z: 1 },
    golf: sandbox ? { progress: { sandbox: { townRoads: true } } } : undefined }) as unknown as SaveV5;
  const was = saveSlot();
  try {
    setSaveSlot('town'); await writeSave(save(11, false));
    const career = new Uint8Array(mem.get('town')!).slice();
    setSaveSlot('sandbox'); assert.equal(saveSlot(), 'sandbox');
    await writeSave(save(22, true));
    assert.deepEqual(new Uint8Array(mem.get('town')!), career, 'the career slot is untouched');
    assert.ok(await slotHasSave('town')); assert.ok(await slotHasSave('sandbox'));
    const sb = await readSave(); assert.equal(sb.status, 'ok'); assert.equal(sb.save?.seed, 22);
    assert.deepEqual((sb.save?.golf as { progress?: { sandbox?: unknown } } | undefined)?.progress?.sandbox, { townRoads: true });
    // a save made for the career slot (in flight when the slot switched) still lands there, never in the sandbox's
    await writeSave(save(33, false), 'town');
    assert.equal((await readSave()).save?.seed, 22, 'the sandbox slot still holds the sandbox game');
    setSaveSlot('town'); assert.equal((await readSave()).save?.seed, 33);
  } finally { setSaveSlot(was); }
});
