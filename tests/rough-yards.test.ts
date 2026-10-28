// T222 (#618; the owner, 2026-10-27: "some backyards could also be fascue and dirt especialy at the start of the game. desert backyards", and "dirt on
// farms and backyard veg gardens"): a new or poor town's house lots wear rough yards (golden fescue, dirt, desert) in soft patches over the mown lawn;
// the share falls as the town grows; an upgraded lot stays mown; a vegetable bed lays the Dirt surface. Headless.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lotLawn } from '../src/game/lawns';
import { clampRoughYards, ROUGH_TEX, ROUGH_YARDS, roughBack, roughChance, roughRoll, roughSig, roughShare, roughTexes, roughYard, type RoughKind } from '../src/game/rough-yards';
import { BED_TEX, Build, patchTex } from '../src/game/lots/compose-core';
import { lookOfTex, clampSurfaces } from '../src/game/painted-surfaces';
import FILE from '../src/game/painted-surfaces.json';

const g = { o: { x: 10, y: 20 }, u: { x: 1, y: 0 }, n: { x: 0, y: 1 }, w: 8, d: 12 };
/** n lot seeds, spread like the town's (a 32-bit hash each) */
const seeds = (n: number) => Array.from({ length: n }, (_, i) => (Math.imul(i + 1, 2654435761) ^ (i * 40503)) >>> 0);
const SEEDS = seeds(6000);
/** the share of the seeds that are rough in a town of `pop` */
const frac = (pop: number, state: 'built' | 'declined' | 'upgraded' = 'built', knob = 1) => SEEDS.filter(s => roughYard(s, true, state, pop, knob)).length / SEEDS.length;

test('the share by stage: about 40% at the start, falling in a line to about 10% by 3,000 residents, then staying there', () => {
  assert.equal(ROUGH_YARDS.start, 0.4); assert.equal(ROUGH_YARDS.end, 0.1); assert.equal(ROUGH_YARDS.popEnd, 3000);
  assert.ok(Math.abs(roughShare(0) - 0.4) < 1e-9);
  assert.ok(Math.abs(roughShare(1500) - 0.25) < 1e-9);
  assert.ok(Math.abs(roughShare(3000) - 0.1) < 1e-9);
  assert.ok(Math.abs(roughShare(9000) - 0.1) < 1e-9, 'it stays at the floor in a big town');
  let prev = Infinity; for (let pop = 0; pop <= 4000; pop += 100) { const s = roughShare(pop); assert.ok(s <= prev + 1e-12, `falls at ${pop}`); prev = s; }
  // the knob scales the schedule: 0 none, 2 twice it; nonsense falls back to the default
  assert.equal(roughShare(0, 0), 0); assert.ok(Math.abs(roughShare(0, 2) - 0.8) < 1e-9);
  assert.equal(clampRoughYards(9), 2); assert.equal(clampRoughYards(-1), 0); assert.equal(clampRoughYards(NaN), 1);
});

test('the lawn mix is deterministic from the lot\'s seed, and falls with the town\'s size', () => {
  for (const s of SEEDS.slice(0, 400)) assert.deepEqual(roughYard(s, true, 'built', 120), roughYard(s, true, 'built', 120), 'a re-bake gives the same yard');
  // about 40% of the built homes are rough at the start, about 10% at 3,000 residents (the hash spreads like a uniform)
  assert.ok(Math.abs(frac(0) - 0.4) < 0.03, `start ${frac(0)}`);
  assert.ok(Math.abs(frac(1500) - 0.25) < 0.03, `1,500 ${frac(1500)}`);
  assert.ok(Math.abs(frac(3000) - 0.1) < 0.025, `3,000 ${frac(3000)}`);
  assert.ok(frac(0) > frac(500) && frac(500) > frac(1500) && frac(1500) > frac(3000), 'the share falls as the town grows');
  // a yard that is rough in a bigger town is rough in a smaller one: as the town grows a rough yard turns to lawn and never back
  for (const s of SEEDS.slice(0, 2000)) {
    if (roughYard(s, true, 'built', 3000)) assert.ok(roughYard(s, true, 'built', 1500), 'rough at 3,000 is rough at 1,500');
    if (roughYard(s, true, 'built', 1500)) assert.ok(roughYard(s, true, 'built', 0), 'rough at 1,500 is rough at the start');
  }
  // the roll is one number per lot: the lot is rough exactly while its roll is under the chance
  for (const s of SEEDS.slice(0, 500)) assert.equal(!!roughYard(s, true, 'built', 700), roughRoll(s) < roughChance(true, 'built', 700));
  // the knob: 0 mows every yard, more makes more
  assert.equal(frac(0, 'built', 0), 0); assert.ok(frac(0, 'built', 2) > frac(0, 'built', 1));
});

test('upgraded lots stay mown; so do shops and works, and a lot that is not built; a poor lot is rougher', () => {
  for (const pop of [0, 400, 3000]) {
    assert.equal(frac(pop, 'upgraded'), 0, `upgraded at ${pop}`);
    for (const s of SEEDS.slice(0, 600)) { assert.equal(roughYard(s, false, 'built', pop), null, 'a shop or works'); assert.equal(roughYard(s, true, null, pop), null, 'not built'); }
  }
  assert.equal(roughChance(true, 'upgraded', 0), 0);
  assert.ok(frac(0, 'declined') > frac(0, 'built') + 0.1, `declined ${frac(0, 'declined')} vs built ${frac(0, 'built')}`);
  assert.ok(roughChance(true, 'declined', 0, 2) <= ROUGH_YARDS.cap, 'a chance is never above the cap');
});

test('a rough yard is a soft mix: fescue, dirt and desert all appear, patches are partial, the front is mostly mown', () => {
  const kinds = new Set<RoughKind>(), second = new Set<RoughKind>();
  let withSecond = 0, rough = 0;
  for (const s of SEEDS) {
    const m = roughYard(s, true, 'built', 0); if (!m) continue;
    rough++; kinds.add(m.k);
    assert.ok(m.s >= 0.5 && m.s <= 0.8, 'the main look covers part of the yard, never all of it (no hard rectangle)');
    assert.ok(m.p > 0.3 && m.p < 1, 'patch size'); assert.ok(m.f >= 0.15 && m.f <= 0.4, 'the front keeps a share of it');
    if (m.k2) { withSecond++; second.add(m.k2); assert.notEqual(m.k2, m.k); assert.ok(m.s2! > 0.2 && m.s2! < 0.45); assert.ok(m.p2! > 0 && m.p2! < 1); }
    assert.deepEqual(roughTexes(m), m.k2 ? [ROUGH_TEX[m.k], ROUGH_TEX[m.k2]] : [ROUGH_TEX[m.k]]);
    assert.notEqual(roughSig(m), '');
  }
  assert.deepEqual([...kinds].sort(), ['desert', 'dirt', 'fescue']);
  assert.ok(second.has('dirt') && second.has('fescue'));
  assert.ok(withSecond / rough > 0.4 && withSecond / rough < 0.7, `about half have a second look (${withSecond / rough})`);
  assert.equal(roughSig(null), '');
  // the depth weight: the front keeps f of the share, the back yard all of it, smoothly between
  assert.equal(roughBack(0.3, 0), 0.3); assert.equal(roughBack(0.3, 0.3), 0.3); assert.equal(roughBack(0.3, 1), 1); assert.equal(roughBack(0.3, 0.75), 1);
  let last = 0; for (let b = 0; b <= 1; b += 0.05) { const v = roughBack(0.3, b); assert.ok(v >= last - 1e-12); last = v; }
});

test('the looks are the game\'s own: fescue the course\'s golden fescue, dirt the Dirt surface (dirt-run), desert the Waste area sand (desert-run)', () => {
  const file = clampSurfaces(FILE);
  assert.equal(lookOfTex(ROUGH_TEX.fescue, file)!.family, 'golden-fescue');
  assert.equal(lookOfTex(ROUGH_TEX.dirt, file)!.family, 'dirt-run');
  assert.equal(lookOfTex(ROUGH_TEX.desert, file)!.family, 'desert-run');
});

test('the lot\'s lawn carries the mix (the renderer lays it); without one it is as before', () => {
  const m = roughYard(SEEDS.find(s => roughYard(s, true, 'built', 0))!, true, 'built', 0)!;
  const rough = lotLawn('lot-1', g, ['a'], 'built', m)!, mown = lotLawn('lot-1', g, ['a'], 'built')!;
  assert.deepEqual(rough.lawn!.rough, m); assert.equal('rough' in mown.lawn!, false);
  assert.deepEqual({ ...rough.lawn!, rough: undefined }, { ...mown.lawn!, rough: undefined }, 'the same lawn otherwise');
  assert.deepEqual(rough.pts, mown.pts); assert.equal(rough.lawn!.z, 1);
  assert.equal('rough' in lotLawn('lot-1', g, ['a'], 'built', null)!.lawn!, false);
});

test('the engine: placeLot rolls the lot\'s own seed against the town\'s residents; the share is rechecked as the town grows; the gear menu has the knob', () => {
  const src = readFileSync('src/game/engine.ts', 'utf8');
  assert.match(src, /roughYard\(st\.seed, home, state, this\.traffic\.pop, this\.roughYards\)/, 'from the lot\'s seed and the town\'s size');
  assert.match(src, /home = st\.use === LU\.RES/, 'houses only');
  assert.match(src, /this\.placesCheck\(\); this\.roughCheck\(\);/, 'rechecked as the town grows');
  assert.match(readFileSync('src/App.tsx', 'utf8'), /game\.setRoughYards\(/, 'the gear menu\'s Rough yards');
});

test('vegetable beds lay the Dirt surface (dirt-run) under their rows, the procedural ones and the presets\'', () => {
  assert.equal(BED_TEX, 'dirt');
  assert.equal(lookOfTex(BED_TEX, clampSurfaces(FILE))!.family, 'dirt-run');
  assert.equal(patchTex('bed', 'field'), 'dirt', 'a preset\'s bed the studio saved as a field');
  assert.equal(patchTex('bed', 'grass'), 'grass'); assert.equal(patchTex('drive', 'field'), 'field', 'only beds change');
  let k = 7; const B = new Build({ o: { x: 0, y: 0 }, u: { x: 1, y: 0 }, n: { x: 0, y: 1 }, w: 14, d: 16 }, () => (k = (k * 16807) % 2147483647) / 2147483647);
  B.bed(1.2, 11, 6, 14.6);
  const bed = B.done().ground.find(p => p.lines && p.lines.length);
  assert.ok(bed, 'a bed with rows'); assert.equal(bed!.tex, 'dirt'); assert.ok(bed!.lines!.length >= 8, 'furrows every half tile');
});
