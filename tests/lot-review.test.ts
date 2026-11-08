// T385 (#1042): the studio's Lot review: the review file (scripts/assets/lot-review.json: the four ticks, the bad mark and note, the override, merged per lot and sorted, one line a
// lot), the sets it browses (a seeded town, T353's estate: the same seed is the same town), what it places on a lot as that lot's override, the machine's reading, and its wiring
// (the dev server's route, the studio's tab, the light boot). Headless.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { CHECKS, CHECK_WORDS, REVIEW_PATH, formatReview, isBad, mergeReview, parseReview, readRecord, reviewId, standingOf, summaryOf, type ReviewRecord } from '../src/game/lots/review-file';
import { estateState, estateStreets, overrideComposition, readingOf, reviewLot, townState } from '../src/game/dev/review-set';
import { auditLot } from '../src/game/lots/lot-audit';
import { compose, type LotGeom } from '../src/game/lots/compose';
import { LU, LV } from '../src/game/lots/town';
import { bootFor } from '../src/game/dev/lab-boot';
import { LOT_DECALS } from '../src/game/lot-decals';
import { LIBRARY } from '../src/game/library';
import { mergeReview as devMerge, REVIEW_PATH as DEV_PATH } from '../src/game/dev/dev-save';

(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };
const root = process.cwd();
const read = (f: string) => fs.readFileSync(path.join(root, f), 'utf8');

const rec = (over: Partial<ReviewRecord> = {}): ReviewRecord => ({
  kind: 'town', seed: 7, theme: 'desert', key: '352,400|0,1000|1|3', o: [352, 400], u: [1, 0], n: [0, 1], w: 12, d: 16, use: 1, level: 2, decline: 0, tier: 2, lotSeed: 4242, road: 0,
  checks: { house: true, drive: true, trees: true, fence: true }, at: '2026-11-08T20:00:00.000Z', ...over,
});

describe('the review file (T385)', () => {
  it('the four checks, in the owner\'s order and words; a lot is bad when marked or when any check is unticked', () => {
    assert.deepEqual([...CHECKS], ['house', 'drive', 'trees', 'fence']); assert.equal(CHECK_WORDS.drive, 'Driveway or parking');
    assert.equal(isBad(rec()), false); assert.equal(isBad(rec({ bad: true })), true); assert.equal(isBad(rec({ checks: { house: true, drive: true, trees: false, fence: true } })), true);
    assert.equal(standingOf(undefined), 'none'); assert.equal(standingOf(rec()), 'ok'); assert.equal(standingOf(rec({ checks: { house: true } })), 'touched');
    assert.equal(standingOf(rec({ checks: { house: true, drive: true, trees: true, fence: false } })), 'bad'); assert.equal(standingOf(rec({ bad: true })), 'bad');
  });
  it('a record is read from raw data: normalised, and refused when it is not one', () => {
    const r = readRecord({ ...rec(), extra: 1, override: { props: [{ id: 'world:mailbox', a: 3.14159, b: 0.5, scale: 1 }], decals: [{ id: 'gen:drift-2', a: 4, b: 5, alpha: 1 }] } })!;
    assert.ok(r); assert.equal((r as unknown as { extra?: number }).extra, undefined); assert.deepEqual(r.override!.props, [{ id: 'world:mailbox', a: 3.142, b: 0.5 }]); assert.deepEqual(r.override!.decals, [{ id: 'gen:drift-2', a: 4, b: 5 }]);
    for (const bad of [null, [], 'x', { ...rec(), kind: 'farm' }, { ...rec(), checks: { house: 'yes' } }, { ...rec(), w: 0 }, { ...rec(), seed: -1 }, { ...rec(), road: 9 }, { ...rec(), note: 'x'.repeat(601) },
      { ...rec(), override: { props: [{ id: 'a', a: 1e9, b: 0 }], decals: [] } }, { ...rec(), override: { props: Array.from({ length: 301 }, () => ({ id: 'a', a: 1, b: 1 })), decals: [] } }, { ...rec(), audit: { a: { b: 1 } } }]) assert.equal(readRecord(bad), null);
  });
  it('merges per lot (an upsert replaces, a remove drops), sorted, one line a lot; a request that is not valid is refused whole', () => {
    const a = reviewId('town', 7, '1|2'), b = reviewId('estate', 7, '0.l3'), c = reviewId('town', 3, 'blk:a:b:1');
    let text = ''; let m = mergeReview(text, { [b]: rec({ kind: 'estate', key: '0.l3' }), [a]: rec({ key: '1|2', bad: true, note: 'tree through the garage' }) }, undefined);
    assert.ok(m.ok); text = m.text; assert.equal(m.count, 2);
    const lines = text.trimEnd().split('\n'); assert.equal(lines.length, 4); assert.ok(lines[1]!.includes(`"${b}"`) && lines[2]!.includes(`"${a}"`), 'sorted by id (the estate before the town), a lot a line');
    m = mergeReview(text, { [a]: rec({ key: '1|2' }), [c]: rec({ key: 'blk:a:b:1', seed: 3 }) }, [b]); assert.ok(m.ok);
    const f = parseReview(m.text); assert.deepEqual(Object.keys(f.lots).sort(), [a, c].sort()); assert.equal(f.lots[a]!.bad, undefined, 'the upsert replaced the record');
    for (const [up, rm] of [[{ 'nope': rec() }, undefined], [{ [a]: { kind: 'town' } }, undefined], [[], undefined], [{}, 'x'], [{ ['../../etc:1:x']: rec() }, undefined]] as const) assert.equal(mergeReview(text, up, rm).ok, false);
    assert.equal(mergeReview('not json', {}, undefined).ok, true, 'a broken file is an empty one');
    assert.deepEqual(parseReview(formatReview({ v: 1, lots: {} })).lots, {});
    // the dev server's merge is this one, and the file is where the lead looks
    assert.equal(devMerge, mergeReview); assert.equal(DEV_PATH, REVIEW_PATH); assert.equal(REVIEW_PATH, 'scripts/assets/lot-review.json');
  });
  it('the counts: the lots by standing, and how many are bad for each check', () => {
    const m = mergeReview('', {
      [reviewId('town', 1, 'a')]: rec({ key: 'a', seed: 1 }), [reviewId('town', 1, 'b')]: rec({ key: 'b', seed: 1, checks: { house: true, drive: false, trees: true, fence: false } }),
      [reviewId('town', 1, 'c')]: rec({ key: 'c', seed: 1, bad: true }), [reviewId('town', 1, 'd')]: rec({ key: 'd', seed: 1, checks: { house: true } }),
    }, undefined);
    assert.ok(m.ok);
    const s = summaryOf(parseReview(m.text)); assert.deepEqual({ lots: s.lots, ok: s.ok, bad: s.bad, touched: s.touched, marked: s.marked }, { lots: 4, ok: 1, bad: 2, touched: 1, marked: 1 }); assert.deepEqual(s.byCheck, { house: 0, drive: 1, trees: 0, fence: 1 });
  });
  it('a lot id takes the keys the town\'s lot map makes, and no path', () => {
    for (const key of ['352,400|0,1000|1|3', 'blk:12,8:n:4', '0.l12', '-3.r0']) assert.equal(mergeReview('', { [reviewId('town', 1, key)]: rec({ key }) }, undefined).ok, true, key);
    for (const key of ['../x', 'a/b', 'a b', '']) assert.equal(mergeReview('', { [`town:1:${key}`]: rec({ key: 'k' }) }, undefined).ok, false, key);
  });
});

describe('the sets the review browses (T385)', () => {
  it('a seeded town: the same seed is the same town; the states are house lots built or upgraded, a tenth declining, the four tiers; the seeds differ', () => {
    const a = Array.from({ length: 400 }, (_, i) => townState(7, i)), b = Array.from({ length: 400 }, (_, i) => townState(7, i)), c = Array.from({ length: 400 }, (_, i) => townState(8, i));
    assert.deepEqual(a, b); assert.notDeepEqual(a, c);
    assert.ok(a.every(s => s.use === LU.RES && (s.level === LV.BUILT || s.level === LV.UPGRADED)));
    const up = a.filter(s => s.level === LV.UPGRADED).length, down = a.filter(s => s.decline > 0).length, tiers = new Set(a.map(s => s.tier));
    assert.ok(up > 70 && up < 170, `${up} upgraded`); assert.ok(down > 40 && down < 140, `${down} declining`); assert.equal(tiers.size, 4);
    assert.equal(estateState(7, 3).level, LV.BUILT); assert.equal(estateState(7, 3).decline, 0); assert.notEqual(estateState(7, 3).seed, estateState(7, 4).seed);
  });
  it('the estate\'s streets keep inside the lab\'s 320 tile box and run along the map axes but for one a few degrees off', () => {
    const s = estateStreets({ x: 512, y: 512 });
    for (const st of s) for (const p of [st.a, st.b]) assert.ok(Math.abs(p.x - 512) <= 160 && Math.abs(p.y - 512) <= 160);
    const off = s.map(st => Math.abs(Math.atan2(st.b.y - st.a.y, st.b.x - st.a.x) * 180 / Math.PI) % 90).filter(d => d > 1 && d < 89);
    assert.equal(off.length, 1); assert.ok(off[0]! < 20, `${off[0]} degrees off`);
  });
  it('a lot of a set: its id, its road', () => {
    const l = reviewLot('town', 7, 'k1', { o: { x: 1, y: 1 }, u: { x: 1, y: 0 }, n: { x: 0, y: -1 }, w: 10, d: 15 }, townState(7, 0));
    assert.equal(l.id, 'town:7:k1'); assert.equal(l.road, 0);
  });
});

describe('what the review applies (T385)', () => {
  const g: LotGeom = { o: { x: 300, y: 300 }, u: { x: 1, y: 0 }, n: { x: 0, y: 1 }, w: 12, d: 16 };
  it('an override is the lot\'s own: its sprites at the owner size where they were put, turned to the lot\'s facing, its decals as the ground marks', () => {
    assert.equal(overrideComposition(g, undefined), undefined); assert.equal(overrideComposition(g, { props: [], decals: [] }), undefined);
    const decal = LOT_DECALS[0]!.id, c = overrideComposition(g, { props: [{ id: 'world:mailbox', a: 3, b: 0.5 }, { id: 'no:such:sprite', a: 1, b: 1 }], decals: [{ id: decal, a: 4, b: 5, scale: 1.5 }] })!;
    assert.equal(c.props.length, 1, 'a sprite the library lacks is left out'); assert.ok(Math.abs(c.props[0]!.x - 303) < 1e-6 && Math.abs(c.props[0]!.y - 300.5) < 1e-6);
    assert.equal(c.ground.length, 1); assert.equal(c.ground[0]!.tex, 'marks'); assert.equal(c.ground[0]!.marks!.length, 5); assert.equal(c.ground[0]!.marks![3], 1.5);
  });
  it('the machine\'s reading of a composed lot, in words, check by check', () => {
    const lot = { o: { x: 300, y: 300 }, u: { x: 1, y: 0 }, n: { x: 0, y: 1 }, w: 12, d: 16 }, a = auditLot(lot, compose(lot, { use: LU.RES, level: LV.BUILT, decline: 0, seed: 12 })), r = readingOf(a);
    assert.deepEqual(Object.keys(r), [...CHECKS]); for (const c of CHECKS) assert.ok(typeof r[c][1] === 'string' && r[c][1].length > 5);
    assert.equal(r.house[0], a.house && a.facingOff === 0); const none = readingOf({ ...a, house: false, buildings: 0, facingOff: null, trees: 5, treesClear: false, drive: false, fence: 'none', fencePieces: 0 });
    assert.deepEqual(CHECKS.map(c => none[c][0]), [false, false, false, false]); assert.match(none.house[1], /no house/);
  });
});

describe('the Lot review is wired into the studio (T385)', () => {
  it('the dev server\'s route, the light boot, the page, the studio\'s tab and the lead\'s report', () => {
    assert.match(read('vite.config.ts'), /"\/__dev\/lot-review"[\s\S]*mergeReview\(text, upsert, remove\)/);
    assert.equal(bootFor('?lotreview', true).kind, 'lab'); assert.notEqual(bootFor('?lotreview', false).kind, 'lab'); assert.notEqual(bootFor('?x', true).kind, 'lab');
    assert.match(read('src/App.tsx'), /has\('lotreview'\)[\s\S]*installLotReview/);
    const html = read('scripts/assets/review/studio.html');
    assert.match(html, /data-v="review"[^>]*>Lot review</); assert.match(html, /id="v-review"/); assert.match(html, /\?lotreview'/); assert.match(html, /loadReview\(\)/);
    assert.match(read('package.json'), /"lots:review": "node scripts\/lots\/review-report\.mjs"/);
    assert.match(read('src/game/engine.ts'), /stageReview\(o: \{ kind: 'town' \| 'estate'/); assert.match(read('src/game/engine.ts'), /this\.lotOverride\?\.\(key, g\)/);
    // (the palettes: the quick picks exist in the library, the decals are every group)
    assert.ok(LIBRARY.some(i => i.id === 'world:mailbox')); assert.equal(new Set(LOT_DECALS.map(d => d.group)).size, 8);
  });
});
