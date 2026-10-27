// Golden tests for save fixtures and migrations (T043 / plan P07): npm test.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  SAVE_VERSION,
  upgradeSave,
  readSave,
  setSaveStore,
  idbStore,
  gzip,
  type SaveStore,
  type SaveV5,
} from '../src/game/save';
import { normalizeGolfSave } from '../src/game/golf/mode';
import {
  createCourseHeightField,
  loadCourseHeight,
  saveCourseHeight,
  sampleCourseHeight,
  CH_SIZE,
} from '../src/game/ext/course-height';
import { normalizeProgress } from '../src/game/ext/progressive-ui/progress';

function loadFixture(name: string): string {
  try {
    return fs.readFileSync(new URL(`./fixtures/saves/${name}`, import.meta.url), 'utf8');
  } catch {
    return fs.readFileSync(path.join(process.cwd(), 'tests/fixtures/saves', name), 'utf8');
  }
}

function createMemoryStore(): SaveStore & { map: Map<string, ArrayBuffer> } {
  const map = new Map<string, ArrayBuffer>();
  return {
    map,
    async get(k: string) { return map.get(k); },
    async put(k: string, v: ArrayBuffer) { map.set(k, v); },
    async del(k: string) { map.delete(k); },
    async keys() { return Array.from(map.keys()); },
  };
}

describe('save fixtures & golden tests (T043)', () => {
  it('1. classic-v3.json -> upgradeSave gives version 5, seed 7, same 2 segs, and no golf', () => {
    const raw = loadFixture('classic-v3.json');
    const parsed = JSON.parse(raw);
    const upgraded = upgradeSave(parsed);
    assert.ok(upgraded, 'expected upgradeSave to accept classic-v3');
    assert.equal(upgraded.version, SAVE_VERSION);
    assert.equal(upgraded.seed, 7);
    assert.deepEqual(upgraded.segs, parsed.segs);
    assert.equal(upgraded.golf, undefined);
    assert.equal('golf' in upgraded, false);
  });

  it('2. classic-v4.json -> version 5, the same segs, nodes and props', () => {
    const raw = loadFixture('classic-v4.json');
    const parsed = JSON.parse(raw);
    const upgraded = upgradeSave(parsed);
    assert.ok(upgraded, 'expected upgradeSave to accept classic-v4');
    assert.equal(upgraded.version, SAVE_VERSION);
    assert.deepEqual(upgraded.segs, parsed.segs);
    assert.deepEqual(upgraded.nodes, parsed.nodes);
    assert.deepEqual(upgraded.props, parsed.props);
  });

  it('3. classic-v5.json -> upgradeSave returns it unchanged (deep-equal to parsed file)', () => {
    const raw = loadFixture('classic-v5.json');
    const parsed = JSON.parse(raw) as SaveV5;
    const upgraded = upgradeSave(parsed);
    assert.ok(upgraded, 'expected upgradeSave to accept classic-v5');
    assert.deepEqual(upgraded, parsed);
  });

  it('4. golf-v5-pre-height.json -> normalizeGolfSave keeps tier 2, rep 14, 2 tees, gate; loadCourseHeight all-zero; normalizeProgress experienced-player default', () => {
    const raw = loadFixture('golf-v5-pre-height.json');
    const parsed = JSON.parse(raw) as SaveV5;
    assert.ok(parsed.golf);
    const g = normalizeGolfSave(parsed.golf);
    assert.ok(g);
    assert.equal(g.tier, 2);
    assert.equal(g.rep, 14);
    assert.equal(g.tees.length, 2);
    assert.equal(g.structures?.length, 1);
    assert.equal(g.structures?.[0]?.typeId, 'gate');

    const h = loadCourseHeight(parsed.golf.height);
    assert.equal(h.data.every(v => v === 0), true);

    const p = normalizeProgress(parsed.golf.progress);
    assert.equal(p.stage, 3, 'an old save opens at stage 3 with every tool (T117; was the 10-minute playS default)');
  });

  it('5. golf-v5-height-progress.json -> loadCourseHeight has non-zero sample near (600, 600) and (1400, 900); saveCourseHeight deep-equals fixture height; normalizeProgress keeps counters', () => {
    const raw = loadFixture('golf-v5-height-progress.json');
    const parsed = JSON.parse(raw) as SaveV5;
    assert.ok(parsed.golf);

    const h = loadCourseHeight(parsed.golf.height);
    const s1 = sampleCourseHeight(h, 600, 600);
    const s2 = sampleCourseHeight(h, 1400, 900);
    assert.ok(s1 > 0, 'sample near (600, 600) should be raised');
    assert.ok(s2 > 0, 'sample near (1400, 900) should be raised');

    const reSavedHeight = saveCourseHeight(h);
    assert.deepEqual(reSavedHeight, parsed.golf.height);

    const p = normalizeProgress(parsed.golf.progress);
    assert.equal(p.pieces, 4);
    assert.equal(p.roads, 2);
    assert.equal(p.parks, 1);
    assert.equal(p.structures, 1);
    assert.deepEqual(p.dismissed, ['hint-build-first-hole']);
    assert.equal(p.stage, 3, 'a progress saved before T117 keeps every tool');
  });

  it('6. future-v99.json -> upgradeSave returns null, readSave returns future with backup slot holding same bytes', async () => {
    const raw = loadFixture('future-v99.json');
    const parsed = JSON.parse(raw);
    assert.equal(upgradeSave(parsed), null);

    const gz = await gzip(raw);
    const store = createMemoryStore();
    await store.put('town', gz);
    setSaveStore(store);

    try {
      const res = await readSave();
      assert.equal(res.status, 'future');
      assert.equal(res.version, 99);
      assert.equal(res.backedUp, true);
      assert.ok(res.backup);

      const backedUpBuf = await store.get(res.backup);
      assert.ok(backedUpBuf);
      assert.deepEqual(new Uint8Array(backedUpBuf), new Uint8Array(gz));
    } finally {
      setSaveStore(idbStore);
    }
  });

  it('7. Size (P07 decision 8): fully edited heightfield (64x64 blocks) gzip size is under 2 MB', async () => {
    const field = createCourseHeightField();
    const blocks = CH_SIZE / 16; // 64
    for (let bj = 0; bj < blocks; bj++) {
      for (let bi = 0; bi < blocks; bi++) {
        field.data[(bj * 16) * CH_SIZE + bi * 16] = 0.5;
      }
    }
    const height = saveCourseHeight(field);
    assert.equal(height.length, 4096, 'expected 4096 non-zero chunks');

    const json = JSON.stringify({ golf: { height } });
    const gz = await gzip(json);
    const sizeBytes = gz.byteLength;
    const sizeMB = (sizeBytes / (1024 * 1024)).toFixed(3);
    console.log(`[P07 decision 8 size test] 4096-chunk heightfield gzip size: ${sizeBytes} bytes (${sizeMB} MB)`);

    assert.ok(sizeBytes < 2 * 1024 * 1024, `expected gzip size under 2 MB, got ${sizeBytes} bytes`);
  });

  it('8. golf-v5-range-start.json (plan P22 T087: seed 1 at minute zero) -> version 5, golf.start range with its exits, only the county road and the drive as segs, the range, no lots', () => {
    const raw = loadFixture('golf-v5-range-start.json');
    const parsed = JSON.parse(raw);
    const s = upgradeSave(parsed);
    assert.ok(s, 'expected upgradeSave to accept the range start');
    assert.equal(s.version, SAVE_VERSION);
    assert.equal(s.seed, 1);
    const g = normalizeGolfSave(s.golf);
    assert.ok(g);
    assert.equal(g.start, 'range');
    assert.equal(g.tier, 1);
    assert.equal(g.exits?.length, 2);
    for (const e of g.exits!) assert.ok(e.x <= 1 || e.y <= 1 || e.x >= s.map - 2 || e.y >= s.map - 2, 'each exit is on the border');
    assert.deepEqual(g.tees, []);
    // only the county road (town road segs) and the range's drive
    assert.deepEqual([...new Set(s.segs.map(q => q[4]))].sort(), ['drive-gravel', 'road']);
    assert.ok(s.segs.every(q => q[7] === 1), 'every seg is a town seg (free, no upkeep)');
    assert.equal(s.segs.filter(q => q[4] === 'drive-gravel').length, 1);
    // the road runs edge to edge: its seg ends include both exits
    const ends = s.segs.filter(q => q[4] === 'road').flatMap(q => [`${q[0]},${q[1]}`, `${q[2]},${q[3]}`]);
    for (const e of g.exits!) assert.ok(ends.includes(`${e.x},${e.y}`), 'an exit is a road end');
    assert.deepEqual(s.biz?.map(b => b[0]), ['range']);
    assert.deepEqual(s.lots ?? [], []);
    assert.equal(normalizeProgress(g.progress).pieces, 0);
  });

  it('9. golf-v5-range-20y.json (T098, plan P22 2.7.3: seed 1 grown 20 seasons, scripts/sim/range-fixture.ts) -> loads, a grown range-start town, the course land empty, under 2 MB gzipped', async () => {
    const raw = loadFixture('golf-v5-range-20y.json');
    const gz = await gzip(raw);
    assert.ok(gz.byteLength < 2 * 1024 * 1024, `${(gz.byteLength / 1024).toFixed(0)} KB gzipped (under 2 MB)`);
    const s = upgradeSave(JSON.parse(raw));
    assert.ok(s, 'expected upgradeSave to accept the grown town');
    assert.equal(s.version, SAVE_VERSION);
    assert.equal(s.seed, 1);
    const g = normalizeGolfSave(s.golf);
    assert.ok(g);
    assert.equal(g.start, 'range');
    assert.equal(g.exits?.length, 2);
    assert.deepEqual(g.tees, [], 'the course land is still to build: no tees');
    assert.deepEqual(g.pins, [], 'and no pins');
    // P22 2.7's year-20 band: 1,800-3,200 lots
    const lots = s.lots ?? [];
    assert.ok(lots.length >= 1800 && lots.length <= 3200, `${lots.length} lots`);
    // the town's streets (gravel, the towns') keep 6 tiles off the golf land
    const land = [g.course, g.parcel];
    for (const [ax, ay, bx, by, cls, , , town] of s.segs) {
      if (cls !== 'gravel' || town !== 1) continue;
      for (const [x, y, w, h] of land) for (let i = 0; i <= 10; i++) {
        const px = ax + (bx - ax) * i / 10, py = ay + (by - ay) * i / 10;
        assert.ok(Math.hypot(Math.max(x - px, 0, px - x - w), Math.max(y - py, 0, py - y - h)) >= 6 - 1e-6, `a town street at (${px}, ${py}) by the golf land`);
      }
    }
    assert.ok(typeof s.simT === 'number' && s.simT >= 20 * 1440, 'the clock after 20 seasons');
  });
});
