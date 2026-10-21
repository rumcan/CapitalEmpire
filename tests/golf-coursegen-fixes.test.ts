import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { OLD_NINE_PARS, generateOldNine } from '../src/game/golf/coursegen';
import { courseAreas } from '../src/game/golf/paintcourse';
import { COURSE_SIZES } from '../src/game/golf/place';
import { TILE_M } from '../src/game/golf/types';

function ptInPoly(x: number, y: number, pts: number[]): boolean {
  let inside = false;
  const n = pts.length >> 1;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = pts[2 * i]!, yi = pts[2 * i + 1]!, xj = pts[2 * j]!, yj = pts[2 * j + 1]!;
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}

describe('generateOldNine (G1d coursegen fixes)', () => {
  const site = { x0: 0, y0: 0, x1: 300, y1: 450 };

  it('is deterministic per seed and builds all 9 holes, tees, pins, and surfaces', () => {
    assert.deepEqual(OLD_NINE_PARS, [4, 3, 5, 4, 4, 3, 4, 5, 4]);
    assert.equal(OLD_NINE_PARS.reduce((a, b) => a + b, 0), 36);
    const a = generateOldNine(site, 17);
    const b = generateOldNine(site, 17);
    const c = generateOldNine(site, 18);
    assert.deepEqual(a, b);
    assert.notDeepEqual(a.pins, c.pins);
    assert.equal(a.pins.length, 9);
    assert.equal(a.tees.length, 27);
    assert.equal(a.areas.filter(x => x.surface === 'rough').length, 1);
    assert.equal(a.areas.filter(x => x.surface === 'fairway').length, 7);
    assert.equal(a.areas.filter(x => x.surface === 'fringe').length, 9);
    assert.equal(a.areas.filter(x => x.surface === 'green').length, 9);
    assert.equal(a.areas.filter(x => x.surface === 'tee').length, 9);
    assert.equal(a.areas.filter(x => x.surface === 'bunker').length, 6);
    assert.equal(a.areas.filter(x => x.surface === 'water').length, 1);
  });

  it('preserves GOLF-PLAN 4.2 par-by-length brackets across COURSE_SIZES and seeds', () => {
    for (const [W, H] of COURSE_SIZES) {
      for (const seed of [1, 2, 7, 19, 42, 99]) {
        const l = generateOldNine({ x0: 0, y0: 0, x1: W, y1: H }, seed);
        for (let h = 1; h <= 9; h++) {
          const back = l.tees.find(t => t.hole === h && t.kind === 'back')!;
          const pin = l.pins.find(p => p.hole === h)!;
          const aims = l.aims.filter(a => a.hole === h).sort((x, y) => x.order - y.order);
          const pts = [back, ...aims, pin];
          let tiles = 0;
          for (let k = 0; k < pts.length - 1; k++) {
            tiles += Math.hypot(pts[k + 1]!.x - pts[k]!.x, pts[k + 1]!.y - pts[k]!.y);
          }
          const metres = tiles * TILE_M;
          const derivedPar = metres <= 230 ? 3 : metres <= 430 ? 4 : 5;
          assert.equal(derivedPar, OLD_NINE_PARS[h - 1], `${W}x${H} seed ${seed} hole ${h}: ${metres}m`);
        }
      }
    }
  });

  it('places back, middle, and forward tee markers inside each painted tee rectangle and clears the clubhouse', () => {
    for (const seed of [1, 5, 12, 33]) {
      const l = generateOldNine(site, seed);
      const teeAreas = l.areas.filter(a => a.surface === 'tee');
      for (let h = 1; h <= 9; h++) {
        const poly = teeAreas[h - 1]!.pts;
        for (const t of l.tees.filter(m => m.hole === h)) {
          assert.equal(ptInPoly(t.x, t.y, poly), true, `seed ${seed} hole ${h} ${t.kind} inside tee box`);
        }
      }
      assert.equal(ptInPoly(l.clubhouse.x, l.clubhouse.y, teeAreas[0]!.pts), false, 'clubhouse clear of hole 1 tee');
    }
  });

  it('extends par 4/5 fairways into the green fringe and emits zero dropped Paint areas', () => {
    for (const [W, H] of COURSE_SIZES) {
      for (const seed of [1, 3, 8, 21, 55]) {
        const l = generateOldNine({ x0: 0, y0: 0, x1: W, y1: H }, seed);
        const fairways = l.areas.filter(a => a.surface === 'fairway');
        let fi = 0;
        for (let h = 1; h <= 9; h++) {
          if (OLD_NINE_PARS[h - 1]! < 4) continue;
          const fw = fairways[fi++]!.pts;
          const pin = l.pins[h - 1]!;
          let minDist = Infinity;
          for (let k = 0; k < fw.length; k += 2) {
            minDist = Math.min(minDist, Math.hypot(fw[k]! - pin.x, fw[k + 1]! - pin.y));
          }
          assert.ok(minDist <= 11, `hole ${h} fairway reaches fringe (minDist=${minDist})`);
        }
        const stats = { dropped: 0 };
        const paints = courseAreas(l, stats);
        assert.equal(stats.dropped, 0, `${W}x${H} seed ${seed} dropped paint areas`);
        assert.ok(paints.length >= l.areas.length);
      }
    }
  });

  it('throws when the site is too small to fit nine holes', () => {
    assert.throws(() => generateOldNine({ x0: 0, y0: 0, x1: 20, y1: 20 }, 1), /too small/);
  });
});
