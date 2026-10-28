// The golf place (golf/place.ts): the course, venue, car park and drive beside the town, the course's orientation onto that site, and the town's avenue classes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAP } from '../src/game/iso';
import { TC } from '../src/game/terrain/types';
import { SITE_MARGIN } from '../src/game/event/config';
import { BLOCK } from '../src/game/lots/roads';
import { TOWN_BLOCKS, townGrid } from '../src/game/lots/seedtowns';
import { generateOldNine } from '../src/game/golf/coursegen';
import { CLUB_MAX, CLUB_MIN, canonicalSite, golfTownClasses, orientLayout, placeCourse, townAxis } from '../src/game/golf/place';
import type { Rect } from '../src/game/golf/mode';
import type { Pt } from '../src/game/network';
import { HIDDEN_MAX, hiddenShare } from '../src/game/golf/parkplace';

/** the town's centre, tiles: the town grid's top-left tile is (880, 880) */
const CENTRE: Pt = { x: 1024, y: 1024 };
/** the town grid's span, tiles */
const SPAN = TOWN_BLOCKS * BLOCK;

/** a map of GROUND */
const ground = (): Uint8Array => new Uint8Array(MAP * MAP).fill(TC.GROUND);

/** a map of GROUND with WATER wherever pred(x, y) holds */
function water(pred: (x: number, y: number) => boolean): Uint8Array {
  const cls = ground();
  for (let y = 0; y < MAP; y++) for (let x = 0; x < MAP; x++) if (pred(x, y)) cls[y * MAP + x] = TC.WATER;
  return cls;
}

/** the endpoints of the town's legs on a terrain (the legs it actually lays) */
function endsOf(cls: Uint8Array, centre: Pt): Pt[] {
  return townGrid(centre, TOWN_BLOCKS, (x, y) => cls[y * MAP + x]).legs.flatMap(l => [l.a, l.b]);
}

/** the centre of a rect */
const mid = (r: Rect): Pt => ({ x: r[0] + r[2] / 2, y: r[1] + r[3] / 2 });

/** whether two rects share a tile */
const overlap = (a: Rect, b: Rect) => a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];

test('all ground: a plan with the venue 150 to 350 tiles out, a one-leg drive from the town edge, the parcels apart and inside the map', () => {
  const cls = ground(), ends = endsOf(cls, CENTRE), p = placeCourse(cls, CENTRE, ends, 1);
  assert.ok(p);
  const c = mid(p.venue), d = Math.hypot(c.x - CENTRE.x, c.y - CENTRE.y);
  assert.ok(d >= CLUB_MIN && d <= CLUB_MAX, `venue ${d.toFixed(1)} tiles from the centre`);
  assert.ok(p.drive.length === 1 || p.drive.length === 2, 'the drive, and a spur to a car park beside the venue (T237)');
  const { a, b } = p.drive[0];
  assert.ok(a.x === b.x || a.y === b.y, 'the drive is axis aligned');
  assert.ok(ends.some(e => e.x === a.x && e.y === a.y), 'the drive starts at a grid edge point');
  assert.ok(!overlap(p.course, p.venue) && !overlap(p.course, p.carpark) && !overlap(p.venue, p.carpark), 'the course, venue and car park do not overlap');
  // the car park keeps 3 tiles from the drive's centre line (the line x = a.x or y = a.y)
  const vertical = a.x === b.x, line = vertical ? a.x : a.y;
  const lo = vertical ? p.carpark[0] : p.carpark[1], hi = lo + (vertical ? p.carpark[2] : p.carpark[3]);
  assert.ok(Math.max(lo - line, line - hi) >= 3, 'the car park keeps 3 tiles from the drive');
  for (const r of [p.course, p.venue, p.carpark]) {
    assert.ok(r[0] >= SITE_MARGIN && r[1] >= SITE_MARGIN && r[0] + r[2] <= MAP - SITE_MARGIN && r[1] + r[3] <= MAP - SITE_MARGIN, `rect ${r.join(',')} inside the margin`);
  }
});

test('water north of y 900 and east of x 1150: the course lies south or west of the town', () => {
  const cls = water((x, y) => y < 900 || x > 1150);
  const p = placeCourse(cls, CENTRE, endsOf(cls, CENTRE), 1);
  assert.ok(p, 'a plan');
  assert.ok(p.dir === 2 || p.dir === 3, `dir ${p.dir}`);
});

test('all water: no plan', () => {
  const cls = water(() => true);
  assert.equal(placeCourse(cls, CENTRE, endsOf(cls, CENTRE), 1), null);
});

test('the same inputs and seed give the same plan', () => {
  const cls = ground(), ends = endsOf(cls, CENTRE);
  assert.deepEqual(placeCourse(cls, CENTRE, ends, 3), placeCourse(cls, CENTRE, ends, 3));
});

test('orientLayout: on each side the oriented course holds its areas and its clubhouse faces the town', () => {
  const A = townAxis(CENTRE);
  for (const dir of [0, 1, 2, 3] as const) {
    // the three sides of the town other than dir are flooded: north (y < y0), east, south, west
    const cls = water((x, y) => (dir !== 0 && y < A.y0) || (dir !== 1 && x >= A.x0 + SPAN) || (dir !== 2 && y >= A.y0 + SPAN) || (dir !== 3 && x < A.x0));
    const p = placeCourse(cls, CENTRE, endsOf(cls, CENTRE), 1);
    assert.ok(p, `dir ${dir}: a plan`);
    assert.equal(p.dir, dir);
    const lay = orientLayout(generateOldNine(canonicalSite(p), 7), p);
    const [cx, cy, w, h] = p.course;
    for (const area of lay.areas) {
      for (let i = 0; i < area.pts.length; i += 2) {
        const x = area.pts[i], y = area.pts[i + 1];
        assert.ok(x >= cx - 1 && x <= cx + w + 1 && y >= cy - 1 && y <= cy + h + 1, `dir ${dir}: ${area.surface} at ${x},${y}`);
      }
    }
    const c = mid(p.venue), cl = lay.clubhouse;
    assert.ok(Math.hypot(cl.x - c.x, cl.y - c.y) <= 40, `dir ${dir}: clubhouse ${Math.hypot(cl.x - c.x, cl.y - c.y).toFixed(1)} tiles from the venue`);
    // the town lies south (dir 0), west (1), north (2) or east (3) of the course: the clubhouse is on that side
    const facing = [cl.y >= cy + h / 2, cl.x <= cx + w / 2, cl.y <= cy + h / 2, cl.x >= cx + w / 2][dir];
    assert.ok(facing, `dir ${dir}: the clubhouse faces the town`);
  }
});

test('golfTownClasses: the 8 legs of the main axis are avenues, every other leg gravel', () => {
  const cls = ground(), legs = townGrid(CENTRE, TOWN_BLOCKS, (x, y) => cls[y * MAP + x]).legs, A = townAxis(CENTRE);
  for (const dir of [0, 1, 2, 3] as const) {
    const onAxis = (l: { a: Pt; b: Pt }) => dir % 2 === 0 ? l.a.x === A.ax && l.b.x === A.ax : l.a.y === A.ay && l.b.y === A.ay;
    assert.equal(legs.filter(onAxis).length, 8, `dir ${dir}: legs on the axis`);
    const out = golfTownClasses(legs, CENTRE, dir);
    assert.equal(out.length, legs.length);
    legs.forEach((l, i) => assert.equal(out[i], onAxis(l) ? 'avenue' : 'gravel', `dir ${dir}: leg ${i}`));
  }
});

test('T237: the club car park is never behind the clubhouse in screen space; beside it on a spur off the drive where the drive side is', () => {
  // each side of the town by water on the other three: the course lies that way (dir 0 north .. 3 west)
  const only: ((x: number, y: number) => boolean)[] = [(_x, y) => y > 860, x => x < 1180, (_x, y) => y < 1180, x => x > 860];
  const dirs = new Set<number>();
  for (const pred of only) {
    const cls = water((x, y) => pred(x, y) && !(x >= 860 && x < 1190 && y >= 860 && y < 1190)), p = placeCourse(cls, CENTRE, endsOf(cls, CENTRE), 1);
    if (!p) continue;
    dirs.add(p.dir);
    const c = p.carpark, v = p.venue;
    const share = hiddenShare({ x: c[0], y: c[1], w: c[2], h: c[3] }, { rect: v, name: 'the clubhouse', reach: 24 });
    assert.ok(share <= HIDDEN_MAX, `dir ${p.dir}: ${Math.round(share * 100)}% of the car park behind the clubhouse`);
    assert.ok(!overlap(c, v) && !overlap(c, p.course), `dir ${p.dir}: apart`);
    // its entrance road: one of the drive's legs runs along a side of it, 3 tiles off
    const along = p.drive.some(({ a, b }) => {
      if (a.x === b.x) return [c[0] - 3, c[0] + c[2] + 3].some(x => Math.abs(x - a.x) < 1e-9) && Math.min(a.y, b.y) <= c[1] + c[3] && Math.max(a.y, b.y) >= c[1];
      return [c[1] - 3, c[1] + c[3] + 3].some(y => Math.abs(y - a.y) < 1e-9) && Math.min(a.x, b.x) <= c[0] + c[2] && Math.max(a.x, b.x) >= c[0];
    });
    assert.ok(along, `dir ${p.dir}: the car park's side is on a drive`);
  }
  assert.ok(dirs.size >= 3, `the sides tried: ${[...dirs].join(',')}`);
});
