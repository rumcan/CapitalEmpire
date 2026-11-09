// T385 (#1042): the studio's Lot review: the review file (scripts/assets/lot-review.json: the four ticks, the bad mark and note, the override, merged per lot and sorted, one line a
// lot), the sets it browses (a seeded town, T353's estate: the same seed is the same town), what it places on a lot as that lot's override, the machine's reading, and its wiring
// (the dev server's route, the studio's tab, the light boot). Headless.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { CHECKS, CHECK_WORDS, REVIEW_PATH, formatReview, isBad, mergeReview, parseReview, readRecord, reviewId, standingOf, summaryOf, type ReviewRecord } from '../src/game/lots/review-file';
import { ROAD_FILTERS, estateState, estateStreets, overrideComposition, readingOf, reviewLot, roadCounts, roadVisible, sampleState, sampleStreets, townState, wantedOf } from '../src/game/dev/review-set';
import { auditLot } from '../src/game/lots/lot-audit';
import { compose, housePalette, type LotGeom } from '../src/game/lots/compose';
import { LU, LV } from '../src/game/lots/town';
import { LAB_BOX, REVIEW_BOX, bootFor, labBox } from '../src/game/dev/lab-boot';
import { MAP } from '../src/game/iso';
import { frontageFrames } from '../src/game/golf/estate';
import { CLASS } from '../src/game/network';
import { frameOf, roadOf } from '../src/game/lots/preset-frame';
import { facingView } from '../src/game/lots/house-facing';
import { baseOf } from '../src/game/lots/house-class';
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

describe('T403 (#1081): the Lot review on the roads at 45 degrees', () => {
  const C = { x: MAP / 2, y: MAP / 2 };   // (the engine lays the set round the map's centre)
  type Q = { x: number; y: number };
  /** the sample set's lots as the engine lays them (Game.stageReview: each street's frontageFrames on both sides, in key order) */
  const sampleFrames = () => {
    const out: { key: string; g: LotGeom; seg: number }[] = [];
    sampleStreets(C).forEach((st, seg) => {
      const cls = CLASS[st.base];
      for (const f of frontageFrames({ a: st.a, b: st.b, base: st.base, h: cls.h, walk: cls.walk, ra: 4, rb: 4 }, [1, -1], seg)) out.push({ key: `${seg}.${f.side > 0 ? 'l' : 'r'}${f.k}`, g: { o: f.o, u: f.u, n: f.n, w: f.w, d: f.d }, seg });
    });
    return out.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  };
  /** the states the page gives them (seed): the road's k-th lot the k-th house type */
  const sampleStates = (seed: number) => { const tally = new Map<number, number>(); return sampleFrames().map((f, i) => sampleState(seed, i, f.g, tally)); };
  const corners = (g: LotGeom): Q[] => [[0, 0], [g.w, 0], [g.w, g.d], [0, g.d]].map(([a, b]) => ({ x: g.o.x + g.u.x * a! + g.n.x * b!, y: g.o.y + g.u.y * a! + g.n.y * b! }));
  /** whether two convex quads have a gap between them (touching edges are no overlap) */
  const apart = (A: Q[], B: Q[]): boolean => {
    for (const P of [A, B]) for (let i = 0; i < P.length; i++) {
      const a = P[i]!, b = P[(i + 1) % P.length]!, ax = -(b.y - a.y), ay = b.x - a.x, pa = A.map(q => q.x * ax + q.y * ay), pb = B.map(q => q.x * ax + q.y * ay);
      if (Math.max(...pa) <= Math.min(...pb) + 1e-6 || Math.max(...pb) <= Math.min(...pa) + 1e-6) return true;
    }
    return false;
  };
  it('the road filter: all roads, the four along a map axis, the four at 45 degrees; the chips count them', () => {
    assert.deepEqual(ROAD_FILTERS.map(r => r.id), ['all', 'axis', '45']);
    for (let road = 0; road < 8; road++) { assert.equal(roadVisible('all', road), true); assert.equal(roadVisible('axis', road), road % 2 === 0); assert.equal(roadVisible('45', road), road % 2 === 1); }
    assert.deepEqual(roadCounts([0, 1, 1, 2, 3, 5, 6]), { all: 7, axis: 3, '45': 4 });
  });
  it('a sample lot is a review lot like the others: its id, its record, the file', () => {
    const id = reviewId('sample', 3, '2.l7'); assert.equal(id, 'sample:3:2.l7');
    const r = readRecord(rec({ kind: 'sample', seed: 3, key: '2.l7', road: 3 })); assert.ok(r); assert.equal(r.kind, 'sample');
    const m = mergeReview('', { [id]: rec({ kind: 'sample', seed: 3, key: '2.l7', road: 3 }) }, undefined); assert.ok(m.ok); assert.ok(parseReview(m.text).lots[id]);
    const g: LotGeom = { o: { x: 0, y: 0 }, u: { x: 0, y: 1 }, n: { x: -1, y: 0 }, w: 10, d: 15 };
    assert.equal(reviewLot('sample', 3, '2.l7', g, sampleState(3, 0, g, new Map())).road, roadOf(g.n));
  });
  it('the sample set has lots on all eight road headings, a lot for every house type on each, none touching another lot or another street, all inside the review\'s map box', () => {
    const fr = sampleFrames(), pal = housePalette(), byRoad = new Map<number, number>();
    for (const f of fr) byRoad.set(roadOf(f.g.n), (byRoad.get(roadOf(f.g.n)) ?? 0) + 1);
    assert.deepEqual([...byRoad.keys()].sort(), [0, 1, 2, 3, 4, 5, 6, 7], 'every heading has lots');
    for (const [road, n] of byRoad) assert.ok(n >= pal.length, `road ${road}: ${n} lots for ${pal.length} house types`);
    const qs = fr.map(f => corners(f.g));
    for (let i = 0; i < fr.length; i++) for (let j = i + 1; j < fr.length; j++) if (!apart(qs[i]!, qs[j]!)) assert.fail(`lots ${fr[i]!.key} and ${fr[j]!.key} overlap`);
    // (no lot reaches another street's verge)
    const streets = sampleStreets(C), cls = CLASS.road, half = cls.h + cls.walk;
    const dist = (p: Q, a: Q, b: Q) => { const dx = b.x - a.x, dy = b.y - a.y, t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy))); return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t); };
    fr.forEach((f, i) => streets.forEach((st, seg) => { if (seg !== f.seg) for (const p of qs[i]!) assert.ok(dist(p, st.a, st.b) > half, `lot ${f.key} is clear of street ${seg}`); }));
    // (the streets themselves keep apart)
    streets.forEach((s, i) => streets.forEach((t, j) => { if (j > i) for (const p of [s.a, s.b]) assert.ok(dist(p, t.a, t.b) > 3 * half, `streets ${i} and ${j} keep apart`); }));
    // (the whole set lies inside the review's box, which the lab's own is too small for)
    const box = labBox(REVIEW_BOX), small = labBox(LAB_BOX);
    for (const q of [...qs.flat(), ...streets.flatMap(s => [s.a, s.b])]) assert.ok(q.x > box[0] + 4 && q.x < box[2] - 4 && q.y > box[1] + 4 && q.y < box[3] - 4, 'inside the review\'s box');
    assert.ok(qs.flat().some(q => q.x < small[0] || q.x > small[2] || q.y < small[1] || q.y > small[3]), 'the lab\'s own box is too small for it');
    assert.deepEqual(bootFor('?lotreview', true).box, box); assert.deepEqual(bootFor('?lotlab', true).box, small); assert.ok(REVIEW_BOX > LAB_BOX);
  });
  it('a road\'s lots take the house types in the palette\'s order, each forced on the lot (a forced preset would draw the preset as it is and skip the clean base); the same seed lays the same set', () => {
    const fr = sampleFrames(), pal = housePalette(), a = sampleStates(7);
    assert.deepEqual(a, sampleStates(7), 'deterministic'); assert.notDeepEqual(a, sampleStates(8), 'the seed changes the lots');
    const next = new Map<number, number>(), shown = new Map<number, Set<string>>();
    fr.forEach((f, i) => {
      const road = roadOf(f.g.n), k = next.get(road) ?? 0, type = pal[k % pal.length]!, st = a[i]!; next.set(road, k + 1);
      assert.equal(wantedOf(st), type, `lot ${f.key}: road ${road}'s lot ${k} is laid to show type ${k % pal.length}`);
      assert.ok(st.preset === undefined && st.house === type, 'the type is forced on the lot and no preset is: a forced preset draws the preset as it is');
      assert.equal(st.use, LU.RES); assert.equal(st.level, LV.BUILT); assert.equal(st.decline, 0); assert.equal(st.tier, 3);
      (shown.get(road) ?? shown.set(road, new Set()).get(road)!).add(type);
    });
    for (let road = 0; road < 8; road++) assert.equal(shown.get(road)!.size, pal.length, `road ${road} is laid with every house type`);
  });
  it('the sample lots compose as house lots on every road: a house on each but the few of a type that cannot face its road, a house type with the pictures for the road faces it, a garage door facing the road on some, a reading for each', () => {
    const fr = sampleFrames(), st = sampleStates(7), by = { houses: 0, faces: 0, garages: 0, can: 0, canFace: 0, oddCan: 0, oddCanFace: 0, odd: 0, oddFaces: 0, canNoHouse: 0, driveNoGarage: 0, garageDriveBad: 0, clutter: 0, pathBad: 0 };
    fr.forEach((f, i) => {
      const a = auditLot(f.g, compose(f.g, st[i]!)), odd = roadOf(f.g.n) % 2 === 1, type = wantedOf(st[i]!), can = !!type && facingView(type, frameOf(f.g)).ok;
      if (odd) by.odd++;
      if (!a.house) { if (can) by.canNoHouse++; return; }   // (a type that cannot face its road and fits no swap leaves the lot empty: the review says so)
      by.houses++; if (a.facingOff === 0) by.faces++; if (a.garage) by.garages++;
      if (a.drive && !a.garage) by.driveNoGarage++; if (a.garage && !a.driveOk) by.garageDriveBad++; if (a.clutter.length) by.clutter++; if (!a.pathAtDoor) by.pathBad++;
      if (odd && a.facingOff === 0) by.oddFaces++;
      // (a type with the pictures to face the road must face it; the others show the nearest picture, and the reading says how far off)
      if (can) { by.can++; if (a.facingOff === 0) by.canFace++; if (odd) { by.oddCan++; if (a.facingOff === 0) by.oddCanFace++; } }
      assert.ok(a.houseId, 'a house has its id'); const rd = readingOf(a); assert.ok(rd.house[1].length > 5 && rd.drive[1].length > 5);
    });
    console.log(`T403 sample: ${fr.length} lots, ${JSON.stringify(by)}`);
    assert.equal(by.canNoHouse, 0, 'a lot laid with a type that can face its road has a house');
    // (the clean base runs on every sample lot: no garage, no drive; a drive reaches each garage door; the path reaches the front door; no yard clutter)
    assert.equal(by.driveNoGarage, 0, 'no garage, no drive'); assert.equal(by.garageDriveBad, 0, 'a drive reaches every garage door'); assert.equal(by.clutter, 0, 'no yard clutter'); assert.equal(by.pathBad, 0, 'the front path reaches the front door');
    assert.ok(by.houses >= fr.length * 0.8, `${by.houses} of ${fr.length} sample lots have a house`);
    assert.ok(by.faces >= by.houses * 0.5, `${by.faces} of ${by.houses} houses face the road`);
    assert.ok(by.odd >= 70 && by.oddCan >= 20, `${by.oddCan} of the ${by.odd} lots on the roads at 45 degrees are laid with a type that has the pictures to face them`);
    assert.ok(by.can >= 60 && by.canFace >= by.can * 0.8, `${by.canFace} of ${by.can} lots laid with a type that can face the road face it`);
    assert.ok(by.oddCanFace >= by.oddCan * 0.8, `${by.oddCanFace} of ${by.oddCan} such lots on the roads at 45 degrees face it`);
    assert.ok(by.garages >= 5, `${by.garages} sample lots show a garage door facing the road`);
  });
  it('ComposeState.house: a lot laid to show a house type draws it in the place of the preset house when it faces the road', () => {
    const fr = sampleFrames(), st = sampleStates(7), forced = fr.map((f, i) => ({ f, s: st[i]!, i })).filter(x => x.s.house !== undefined);
    assert.equal(forced.length, fr.length, 'every sample lot has its house type forced');
    let showed = 0, tried = 0;
    for (const { f, s } of forced) {
      if (roadOf(f.g.n) % 2) continue;   // (a road at 45 degrees draws the straight-on set, whose ids are not the palette's)
      if (!facingView(s.house!, frameOf(f.g)).ok) continue;   // (a type that cannot face the road is swapped for one that can)
      const a = auditLot(f.g, compose(f.g, s)); if (!a.house) continue;
      tried++; if (a.houseId && baseOf(a.houseId) === s.house) showed++;
    }
    console.log(`T403 forced: ${showed} of ${tried} lots on the roads along an axis draw the type they were laid to show`);
    assert.ok(tried >= 40 && showed >= tried * 0.8, `${showed} of ${tried} forced lots draw their type`);
  });
  it('the page: the Sample chip, the road filter chips, the saved session, the engine\'s sample kind and the review\'s map box', () => {
    const page = read('src/game/dev/lot-review.ts');
    assert.match(page, /chip\('Sample', kind === 'sample'/); assert.match(page, /for \(const r of ROAD_FILTERS\) rf\.append\(chip\(/); assert.match(page, /roadVisible\(roads, lots\[i\]!\.road\)/);
    assert.match(page, /\{ kind, seed, idx, filter, roads \} satisfies Session/); assert.match(page, /sampleStreets\(centre\)/); assert.match(page, /garageSideways: a\.garageSideways/);
    assert.match(page, /laid to show \$\{wantedOf\(l\.st\)\}/);
    assert.match(page, /if \(v\.length && !v\.includes\(idx\)\) idx = v\[0\]!;/);   // (a lot the road filter hides is not opened)
    assert.match(read('src/game/engine.ts'), /stageReview\(o: \{ kind: 'town' \| 'estate' \| 'sample'; state: \(i: number, g: LotGeom\) => ComposeState/);
    assert.match(read('src/game/dev/lab-boot.ts'), /q\.has\('lotreview'\) && !q\.has\('fullboot'\)\) return labBoot\(REVIEW_BOX\)/);
  });
});
