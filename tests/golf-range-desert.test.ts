// T223 (#622): the desert range start. A new range has a desert outfield (the Waste area sand's desert, no mowing stripes) and a dirt tee box with
// its mats; the player turfs the tee box, then grasses the outfield into the mown, striped outfield of before. The home's yard is the desert
// for the caravan and the cottage; the house keeps its lawn. A range saved before T223 keeps its grass (both upgrades owned on its load).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GRASS_UPGRADES, GROUND_APPEAL, HOME_AT, RANGE_UPGRADES, defaultRangeBiz, normalizeRangeBiz, rangeScene, rangeStats, upgradeWhy, withUpgrade,
  type RangeBizSave, type RangeUpgradeId, type ScenePatch,
} from '../src/game/golf/rangebiz';
import { normalizeGolfSave, type GolfSave, type Rect } from '../src/game/golf/mode';
import { plotPoint } from '../src/game/golf/range';
import { RANGE_PRESET } from '../src/game/golf/rangehost';
import { PRESETS } from '../src/game/paint-presets';
import { FAIRWAY_STRIPE_PRESET } from '../src/game/course-stripes';
import { clampSurfaces, knownFamily, lookOfTex } from '../src/game/painted-surfaces';
import { PRESET_FAMILY } from '../src/game/ext/grass-management/catalog';
import surfacesFile from '../src/game/painted-surfaces.json';

const plot: Rect = [200, 200, 70, 150];
const buy = (ids: RangeUpgradeId[], s = defaultRangeBiz()): RangeBizSave => ids.reduce((q, id) => withUpgrade(q, id), s);
const surfs = (s: RangeBizSave) => rangeScene(plot, 2, s).patches.map(p => p.surf);
const count = (s: RangeBizSave, surf: ScenePatch['surf']) => surfs(s).filter(x => x === surf).length;
/** a patch's corners in the plot frame (u along the road, v away from it) */
function frame(pts: number[]) {
  const o = plotPoint(plot, 2, 0, 0), a = plotPoint(plot, 2, 1, 0), b = plotPoint(plot, 2, 0, 1);
  const ux = a.x - o.x, uy = a.y - o.y, vx = b.x - o.x, vy = b.y - o.y, det = ux * vy - uy * vx, out: { u: number; v: number }[] = [];
  for (let k = 0; k < pts.length; k += 2) { const dx = pts[k]! - o.x, dy = pts[k + 1]! - o.y; out.push({ u: (dx * vy - dy * vx) / det, v: (ux * dy - uy * dx) / det }); }
  return out;
}

test('a new range starts in the desert: a desert outfield without stripes, a dirt tee box under its mats, the target greens as before', () => {
  const d = defaultRangeBiz(), sc = rangeScene(plot, 2, d), st = rangeStats(d);
  assert.equal(d.desert, true); assert.ok(!st.teeTurf && !st.grass);
  assert.equal(count(d, 'desert'), 1); assert.equal(count(d, 'outfield'), 0, 'no mown outfield yet');
  assert.ok(!sc.patches.find(p => p.surf === 'desert')!.mow, 'the desert carries no mowing stripes');
  assert.equal(count(d, 'teeDirt'), 1); assert.equal(count(d, 'teeTurf'), 0);
  // the dirt covers the tee box (the course grid's tee cells) and their 1 m first-cut collar, and lies under the mats' deck
  const tee = sc.patches.findIndex(p => p.surf === 'teeDirt'), deck = sc.patches.findIndex(p => p.surf === 'concrete');
  assert.ok(tee >= 0 && deck > tee, 'the mats are laid over the dirt');
  const box = (pts: number[]) => { const c = frame(pts), us = c.map(q => q.u), vs = c.map(q => q.v); return [Math.min(...us), Math.max(...us), Math.min(...vs), Math.max(...vs)].map(x => Math.round(x * 1e6) / 1e6); };
  assert.deepEqual(box(sc.teeBox), [4, 67, 18, 24], 'the course grid\'s tee cells');
  assert.deepEqual(box(sc.patches[tee]!.pts), [3.45, 67.55, 17.45, 24.55], 'the tee cells and their collar');
  // turfed, the turf is the tee box alone (its first-cut collar shows round it, as round a course tee)
  assert.deepEqual(box(rangeScene(plot, 2, buy(['teeturf'])).patches.find(p => p.surf === 'teeTurf')!.pts), [4, 67, 18, 24]);
  assert.equal(count(d, 'target'), sc.targets.length, 'a target green under each flag');
  assert.equal(count(d, 'fringe'), sc.targets.length);
});

test('the two ground upgrades: turf the tee box, then grass the outfield; on the card with their effects', () => {
  const [tee, grass] = [RANGE_UPGRADES.find(u => u.id === 'teeturf')!, RANGE_UPGRADES.find(u => u.id === 'grass')!];
  assert.equal(tee.name, 'Turf the tee box'); assert.equal(tee.cost, 4000); assert.match(tee.effect, /visitors/);
  assert.equal(grass.name, 'Grass the outfield'); assert.equal(grass.cost, 12000); assert.equal(grass.needs, 'teeturf'); assert.match(grass.effect, /visitors/);
  for (const u of [tee, grass]) assert.ok(u.upkeep > 0 && u.upkeep < u.cost / 50, `${u.id}: $${u.upkeep} a month`);
  const d = defaultRangeBiz();
  assert.equal(upgradeWhy(d, 'grass', 1e9), 'Build Turf the tee box first');
  assert.equal(upgradeWhy(d, 'teeturf', 4000), '');
  assert.match(upgradeWhy(d, 'teeturf', 3999), /Not enough money/);
  // turfed: the tee box is the range's turf, the outfield still the desert; a nicer tee draws more golfers who pay a dollar more
  const t = buy(['teeturf']), s0 = rangeStats(d), s1 = rangeStats(t);
  assert.equal(count(t, 'teeTurf'), 1); assert.equal(count(t, 'teeDirt'), 0); assert.equal(count(t, 'desert'), 1); assert.equal(count(t, 'outfield'), 0);
  assert.ok(Math.abs(s1.appeal - s0.appeal * (1 + GROUND_APPEAL.teeturf)) < 1e-9); assert.equal(s1.ref, s0.ref + 1);
  // grassed: the mown, striped outfield in its first cut, as every range had before T223
  const g = buy(['teeturf', 'grass']), s2 = rangeStats(g), sc = rangeScene(plot, 2, g);
  assert.equal(count(g, 'outfield'), 1); assert.equal(count(g, 'desert'), 0); assert.equal(count(g, 'teeTurf'), 1);
  assert.equal(sc.patches.find(p => p.surf === 'outfield')!.mow, true);
  assert.ok(Math.abs(s2.appeal - (1 + GROUND_APPEAL.teeturf + GROUND_APPEAL.grass)) < 1e-9); assert.equal(s2.ref, s1.ref);
  // a fresh start's demand is what it was before T223: the gate's numbers hold
  assert.equal(s0.appeal, 1); assert.equal(s0.ref, 6);
});

test('the save: a new range stays in the desert through a save and a load; a range saved before T223 keeps its grass', () => {
  const d = buy(['bays8']), back = normalizeRangeBiz(JSON.parse(JSON.stringify(d)));
  assert.deepEqual(back, d); assert.equal(count(back, 'desert'), 1);
  const t = buy(['teeturf']); assert.deepEqual(normalizeRangeBiz(JSON.parse(JSON.stringify(t))).owned, ['teeturf']);
  // before T223: no desert flag
  const old = normalizeRangeBiz({ v: 1, owned: ['bays8', 'targets'], price: 7, season: {}, total: { takings: 50 }, paths: true, tee: true });
  assert.deepEqual(old.owned, [...GRASS_UPGRADES, 'bays8', 'targets']); assert.equal(old.desert, true);
  assert.equal(count(old, 'outfield'), 1); assert.equal(count(old, 'teeTurf'), 1); assert.equal(count(old, 'desert'), 0); assert.equal(count(old, 'teeDirt'), 0);
  assert.deepEqual(normalizeRangeBiz(JSON.parse(JSON.stringify(old))), old, 'loaded again, it stays as it is');
  // an old save that somehow lists a ground upgrade is not given it twice
  assert.deepEqual(normalizeRangeBiz({ v: 1, owned: ['grass', 'teeturf', 'bays8'] }).owned, ['teeturf', 'grass', 'bays8']);
  // through the golf save (golf/mode.ts), as the game loads it
  const base = { v: 1, tier: 1, rep: 0, town: { x: 0, y: 0 }, course: [0, 0, 10, 10], parcel: [0, 0, 10, 10], dir: 2, tees: [], pins: [], aims: [], clubhouse: { x: 0, y: 0 } } as unknown as GolfSave;
  assert.deepEqual(normalizeGolfSave(JSON.parse(JSON.stringify({ ...base, start: 'range', range: defaultRangeBiz() })))!.range!.owned, []);
  const { desert: _gone, ...pre } = defaultRangeBiz();
  assert.deepEqual(normalizeGolfSave(JSON.parse(JSON.stringify({ ...base, start: 'range', range: { ...pre, owned: ['lights'] } })))!.range!.owned, ['teeturf', 'grass', 'lights']);
});

test('the home yard: the desert for the caravan and the cottage, a lawn for the house', () => {
  const at = (takings: number) => { const s = defaultRangeBiz(); s.total.takings = takings; return s; };
  for (const [t, yard] of [[0, true], [HOME_AT[0], true], [HOME_AT[1], false]] as const) {
    const s = at(t);
    assert.equal(count(s, 'yard'), yard ? 1 : 0, `$${t}: the desert yard`);
    assert.equal(count(s, 'grassDry'), 0, 'no dry lawn any more');
  }
  // the house's yard is the mown lawn (the first cut): one more first-cut patch than the cottage's (the target greens' collars)
  assert.equal(count(at(HOME_AT[1]), 'firstCut'), count(at(HOME_AT[0]), 'firstCut') + 1);
});

test('the range\'s presets: each has its painted look; the mown outfield, its stripes and the course\'s tee are as before', () => {
  const S = clampSurfaces(surfacesFile), presets = PRESETS.map(p => ({ id: p.id, surface: p.surface, painted: p.painted }));
  // which painting each preset wears is the owner's (Studio › Painted; T225's rule: no pins on the owner's picks), so this checks that each
  // has a known look and that the upgrades change the ground: the turfed tee is not the dirt tee, the grassed outfield not the desert
  const fam = {} as Record<keyof typeof RANGE_PRESET, string>;
  for (const [k, id] of Object.entries(RANGE_PRESET) as [keyof typeof RANGE_PRESET, string][]) {
    const p = PRESETS.find(q => q.id === id); assert.ok(p, `${k}: preset ${id}`);
    assert.equal(p.lawn, false, `${id}: never a town lawn`);
    const look = lookOfTex(`preset:${id}`, S, presets); assert.ok(look, `${id}: a painted look`);
    assert.ok(knownFamily(look.family), `${look.family} is in the manifest`); fam[k] = look.family;
  }
  assert.notEqual(fam.teeTurf, fam.teeDirt, 'Turf the tee box changes the tee\'s ground');
  assert.notEqual(fam.outfield, fam.desert, 'Grass the outfield changes the outfield\'s ground');
  // only the mown outfield has stripes (T218), and the fairways still take theirs from it
  for (const id of Object.values(RANGE_PRESET)) assert.equal(PRESETS.find(q => q.id === id)!.stripes.on, id === RANGE_PRESET.outfield, `${id}: stripes`);
  assert.equal(FAIRWAY_STRIPE_PRESET, RANGE_PRESET.outfield);
  // the course's tees keep the tee surface's look; the range's turf is managed as a tee (the desert and dirt are no grass)
  assert.equal(S.surfaces.tee!.family, 'tee-run');
  assert.equal(PRESET_FAMILY[RANGE_PRESET.teeTurf], 'golf-tee'); assert.equal(PRESET_FAMILY[RANGE_PRESET.desert], undefined); assert.equal(PRESET_FAMILY[RANGE_PRESET.teeDirt], undefined);
});
