// #1278 (the owner, 2026-11-14: "can we remove the desert texture underneath the driving range tee box"): the range's tee box is its own ground from edge to edge. In the desert the map's
// sand spilled over the turf's front edge (a fringe of orange blades: renderer.ts areaSpill, a 'short' area) and the ground litter's scatter (pebbles, clumps of sand, twigs, tumbleweed: desert-litter.ts)
// lay over the turf, the slab and the mats. Now the scene flags the tee box, its slab and its mats (ScenePatch.own, PatchPaint.own): the spill skips them (rugged-edges.ts ruggedKindOf) and the scatter
// (litter-scatter.ts) and the fallen leaves skip them and the margin round the tee box where its raised face and apron lie. Pure: the drawing is looked at in the real game
// (scripts/dev/teebox-ground-shots.mjs, docs/jam-shots/teebox-ground-*.jpg); the wiring is read from the source.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defaultRangeBiz, rangeScene, withUpgrade, type RangeBizSave, type RangeScene } from '../src/game/golf/rangebiz';
import { RANGE_PRESET } from '../src/game/golf/rangehost';
import type { Rect } from '../src/game/golf/mode';
import { plotPoint } from '../src/game/golf/range';
import { presetTex } from '../src/game/paint-presets';
import { LITTER_REGION, onOwnGround, ownGroundOf, scatterLitter } from '../src/game/litter-scatter';
import { ruggedKind, ruggedKindOf } from '../src/game/rugged-edges';

const plot: Rect = [200, 200, 70, 150];
const FACINGS = [0, 1, 2, 3] as const;
/** the range as a new game has it (dirt tee) and turfed (the Turf the tee box upgrade) and fully grown */
const dirt = (): RangeBizSave => defaultRangeBiz();
const turf = (): RangeBizSave => withUpgrade(defaultRangeBiz(), 'teeturf');
const grown = (): RangeBizSave => (['teeturf', 'bays8', 'bays12', 'grass', 'covered', 'lights', 'dispenser', 'kiosk', 'greens', 'targets'] as const).reduce((q, id) => withUpgrade(q, id), defaultRangeBiz());
const STATES: [string, () => RangeBizSave][] = [['dirt tee', dirt], ['turfed tee', turf], ['grown range', grown]];
/** the scene's patches as the ground painter gets them (rangehost.ts sync: the paint's own margin) */
const candidates = (sc: RangeScene) => sc.patches.map(p => ({ pts: p.pts, paint: p.own === undefined ? undefined : { own: p.own } }));
/** a point of the plot frame (u along the road, v away from it) in the world */
const at = (facing: 0 | 1 | 2 | 3, u: number, v: number) => plotPoint(plot, facing, u, v);

describe('the tee box is flagged as ground of its own (#1278)', () => {
  for (const [name, make] of STATES) for (const facing of FACINGS) it(`${name}, facing ${facing}: the tee box, its slab and its mats are, nothing else`, () => {
    const sc = rangeScene(plot, facing, make());
    const own = sc.patches.filter(p => p.own !== undefined);
    const iTee = sc.patches.findIndex(p => p.surf === 'teeDirt' || p.surf === 'teeTurf'), tee = sc.patches[iTee]!;
    assert.ok(tee && tee.own! > 2, 'the tee box wears a margin: its raised face and apron (TEE_GAP, 2.6 tiles)');
    // (the slab is the concrete laid right over the tee box; the kiosk's patio and the car park building's concrete are no part of it)
    const slab = sc.patches[iTee + 1]!; assert.equal(slab.surf, 'concrete', 'the slab follows the tee box');
    assert.deepEqual([...new Set(own.map(p => p.surf))].sort(), ['concrete', 'mats', tee.surf].sort(), 'the tee box, the slab and the mats (or the stand-in mats’ squares)');
    assert.deepEqual(own.filter(p => p.surf === 'concrete'), [slab], 'one concrete patch only: the slab');
    for (const p of own.filter(q => q !== tee)) assert.equal(p.own, 0, `${p.surf}: on it alone`);
    for (const p of sc.patches.filter(q => q.own === undefined)) assert.ok(!['teeDirt', 'teeTurf', 'mats'].includes(p.surf) && p !== slab, `${p.surf} is no ground of its own`);
    // (the outfield, the shop's dirt and the yard take the map's ground and its litter as before)
    assert.ok(sc.patches.some(p => p.surf === 'dirt' && p.own === undefined) && sc.patches.some(p => (p.surf === 'desert' || p.surf === 'outfield') && p.own === undefined));
  });
});

describe('the ground of its own covers the tee box, its apron and its face (#1278)', () => {
  for (const [name, make] of STATES) for (const facing of FACINGS) it(`${name}, facing ${facing}`, () => {
    const sc = rangeScene(plot, facing, make()), zone = ownGroundOf(candidates(sc));
    // every point of the tee box (the course grid's tee cells), the turfed apron's strip and the margin round them (a grid across them)
    for (let u = 4; u <= 67; u += 1.5) for (let v = 18; v <= 26.6; v += 0.6) { const p = at(facing, u, v); assert.ok(onOwnGround(zone, p.x, p.y), `u ${u}, v ${v}`); }
    for (const [u, v] of [[3.2, 21], [67.8, 21], [35, 16], [35, 26.4]] as const) { const p = at(facing, u, v); assert.ok(onOwnGround(zone, p.x, p.y), `the raised face's margin at u ${u}, v ${v}`); }
    // and nothing beyond it: the shop's front, the outfield well down the range, the car park
    for (const [u, v] of [[35, 11], [35, 31], [35, 80], [20, 8], [60, 8]] as const) { const p = at(facing, u, v); assert.ok(!onOwnGround(zone, p.x, p.y), `the open ground at u ${u}, v ${v}`); }
    // (the turfed apron's strip, between the tee box and the outfield: all of it but its last tile at each fence)
    if (sc.apron) for (let u = 2; u <= 68; u += 2) { const p = at(facing, u, 25.5); assert.ok(onOwnGround(zone, p.x, p.y), `the apron at u ${u}`); }
  });
});

describe('no litter and no scrub is placed on the tee box (#1278)', () => {
  /** the scatter over the whole plot (every region it reaches), no road, no building, no water: what the ground painter's drawLitter lays, as the sprite ids a stub gives it */
  const scatter = (sc: RangeScene, own: (x: number, y: number) => boolean) => {
    const b = sc.box, r = (v: number) => Math.floor(v / LITTER_REGION);
    return scatterLitter(r(b[0]), r(b[1]), r(b[2]), r(b[3]), () => true, own, (rnd, sizeM) => Math.floor(rnd() * 9 + sizeM));
  };
  for (const [name, make] of STATES) for (const facing of FACINGS) it(`${name}, facing ${facing}: the scatter lays none on ground of its own, and moves no other piece`, () => {
    const sc = rangeScene(plot, facing, make()), zone = ownGroundOf(candidates(sc)), inZone = (x: number, y: number) => onOwnGround(zone, x, y);
    const without = scatter(sc, () => false), withZone = scatter(sc, inZone);
    // (the control: with nothing excluded the scatter does lie on the tee box, the slab and its margin: the test is no empty one)
    const onGround = without.filter(s => inZone(s.x, s.y));
    assert.ok(onGround.length > 30, `${onGround.length} pieces of the unexcluded scatter lie on the tee box's ground`);
    assert.equal(withZone.filter(s => inZone(s.x, s.y)).length, 0, 'no piece on the tee box, its slab, its mats or their margin');
    // every piece off the ground of its own keeps its place, turn, size and picture: the scatter's random stream is spent the same either way
    assert.deepEqual(withZone, without.filter(s => !inZone(s.x, s.y)), 'only the pieces on the ground of its own are gone');
  });
  for (const [name, make] of STATES) for (const facing of FACINGS) it(`${name}, facing ${facing}: the scene's desert scrub, cacti, rocks and dead wood stand clear of it`, () => {
    const sc = rangeScene(plot, facing, make()), zone = ownGroundOf(candidates(sc));
    const scrub = sc.pieces.filter(p => /^desert\d+$/.test(p.key)), grassed = sc.patches.some(p => p.surf === 'outfield');
    if (!grassed) assert.ok(scrub.length > 20, `${scrub.length} pieces of desert scrub on a desert outfield`); else assert.equal(scrub.length, 0, 'a grassed outfield has none');
    for (const p of sc.pieces) assert.ok(!onOwnGround(zone, p.x, p.y) || !/^(desert|oasis)\d+$/.test(p.key), `${p.key} stands on the tee box's ground`);
  });
});

describe('the map\'s ground does not spill over the tee box\'s edge (#1278)', () => {
  const tex = (surf: 'teeDirt' | 'teeTurf') => presetTex(RANGE_PRESET[surf]);
  it('an ordinary painted area of the tee\'s textures is a short one (the map\'s ground spills over its edge): the spill the owner saw', () => {
    assert.equal(ruggedKind(tex('teeTurf')), 'short'); assert.equal(ruggedKind(tex('teeDirt')), 'short');
    assert.equal(ruggedKindOf(tex('teeTurf'), { b: 0, bt: 'kerb' }), 'short');
  });
  it('with PatchPaint.own it is not: its outline keeps its wobble (it meets the course\'s tee cells, which wobble with it) and nothing spills over it', () => {
    for (const s of ['teeDirt', 'teeTurf'] as const) {
      const k = ruggedKindOf(tex(s), { b: 0, bt: 'kerb', own: 2.6 });
      assert.notEqual(k, 'short', `${s} takes no spill`); assert.equal(k, 'tall', `${s}: a wobble, no spill over itself`);
    }
  });
  it('a hard area (the slab, the mats\' pictures) stays hard, and a hard border still wins', () => {
    assert.equal(ruggedKindOf('pad', { b: 0, bt: 'kerb', own: 0 }), 'hard'); assert.equal(ruggedKindOf('pic:range-mats', { b: 0, bt: 'kerb', own: 0 }), 'hard');
    assert.equal(ruggedKindOf(tex('teeTurf'), { b: 0.2, bt: 'kerb', own: 1 }), 'hard');
    assert.equal(ruggedKindOf(tex('teeTurf')), 'short', 'no paint: as before');
  });
  it('the scene\'s own tee patch is the one that takes no spill, and rangehost lays the flag into the ground painter\'s paint', () => {
    const sc = rangeScene(plot, 0, turf()), tee = sc.patches.find(p => p.surf === 'teeTurf')!;
    assert.equal(ruggedKindOf(tex('teeTurf'), { b: 0, bt: 'kerb', ...(tee.own !== undefined ? { own: tee.own } : {}) }), 'tall');
    assert.ok(/\.\.\.\(p\.own !== undefined \? \{ own: p\.own \} : \{\}\)/.test(readFileSync(resolve('src/game/golf/rangehost.ts'), 'utf8')), 'rangehost sends the scene patch\'s own margin');
  });
});

describe('the ground painter lays them (#1278, read from the source)', () => {
  const ren = readFileSync(resolve('src/game/renderer.ts'), 'utf8');
  it('the area\'s form takes the own rule, the road litter\'s scatter is the pure scatter and the fallen leaves skip the margin', () => {
    assert.ok(/const kind = ruggedKindOf\(p\.tex, p\.paint\)/.test(ren), 'ruggedOf: the kind from the texture and the paint');
    assert.ok(/scatterLitter\(Math\.floor\(tx0 \/ 8\)/.test(ren) && /ownGroundOf\(this\.lotsIn\(\[tx0 - 4, ty0 - 4, tx1 \+ 4, ty1 \+ 4\]\)\)/.test(ren) && /onOwnGround\(own, x, y\)/.test(ren), 'drawLitter: the scatter skips ground of its own');
    assert.ok(/return own\.length > 0 && onOwnGround\(own, x, y\)/.test(ren) && /ownPatches\.push\(p\)/.test(ren), 'leafStamps: no fallen leaf on it or its margin');
    assert.ok(!/for \(let ry = ry0; ry <= ry1; ry\+\+\) for \(let rx = rx0; rx <= rx1; rx\+\+\) \{\s*const r = mulberry\(\(\(rx \* 7919\)/.test(ren), 'the scatter is not laid inline any more (it would skip nothing)');
  });
});
