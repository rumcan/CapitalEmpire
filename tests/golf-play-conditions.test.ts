// T334 (#960), part 1: the wind and the lie that changes the flight (src/game/golf/play/wind.ts, lies.ts, conditions.ts and their use in shot.ts hitShot,
// live.ts shotOutcome and round.ts). The day's wind (deterministic, gusts smooth, calm stays calm), what it does to a ball (a headwind shortens, a tailwind
// lengthens a little, a crosswind drifts it; more on high long shots, less on low short ones, none on a putt); what each lie does (the fairway clean, the first cut,
// the rough with its fliers, the deep rough, the fescue wild, the bunker short and high, the tee the most distance); the slope under the ball (uphill shorter, the ball
// above the feet pulls left, below pushes right); and the back-compat guarantee: a shot without conditions is played exactly as before T334 (golden values captured
// from the unchanged model), and a saved input with conditions replays exactly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TILE_M } from '../src/game/golf/types';
import type { GolfSurface } from '../src/game/golf/types';
import {
  CALM_MPH, FIRST_CUT_TILES, FLIER, LIE_FX, LIE_KINDS, LiveGroup, NO_EFFECT, NO_WIND, SLOPE_FX, WIND_CLUB, WIND_K, compassOf, dailyWind, fieldEnv, flierChance, gustAt, hitShot, kindFits,
  lieKindFor, lieKindOfSurface, makeCourseView, makeField, playRound, readEnv, readWind, readWindNow, rng, shotOutcome, slopeAt, slopeEffect, slopeLines, spinEffect, teeTimes,
  dayRound, lieView, previewShot, shotReport, windAt, windEffect, windNote, windOnShot, windRelText, windText, windToward, windView,
} from '../src/game/golf/play';
import type { Club, CourseView, Lie, OwnerInput, PlayHole, Pt, ShotEnv } from '../src/game/golf/play';
import type { Hole } from '../src/game/golf/holes';
import { normalizeGolfSave, stampWeather, weatherOn } from '../src/game/golf/mode';
import { withDayPins } from '../src/game/golf/daypins';
import { dayCourse } from '../src/game/golf/everyday';
import { playYours, startRound } from '../src/game/golf/play/yours';

const flat = (lie: Lie): CourseView => ({ holes: [], lieAt: () => lie });
const O: Pt = { x: 0, y: 0 };
const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y) * TILE_M;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs: number[]) => { const m = mean(xs); return Math.sqrt(mean(xs.map(x => (x - m) ** 2))); };
/** a full shot north-to-east along +x of `m` metres: lands (where it first touches) and rests (after the roll), for n seeds, with env */
function volley(club: Club, m: number, lie: Lie, env: ShotEnv | undefined, n = 200, sk = 0.6, view: CourseView = flat('fairway')) {
  const out: { at: Pt; to: Pt; carry: number; side: number; spinM: number | undefined }[] = [];
  for (let k = 0; k < n; k++) {
    const o = hitShot(rng(40 + k, 3, 5), sk, lie, O, { x: m / TILE_M, y: 0 }, club, view, env ? { env } : undefined);
    out.push({ at: o.landing.at, to: o.to, carry: dist(O, o.landing.at), side: o.landing.at.y * TILE_M, spinM: o.landing.spin });
  }
  return out;
}

// ---- the day's wind ----

test('wind: the day’s wind is deterministic from the seed and the day, mostly light with blustery and calm days, the prevailing wind from the west', () => {
  assert.deepEqual(dailyWind(7, 12), dailyWind(7, 12));
  assert.notDeepEqual(dailyWind(7, 12), dailyWind(7, 13));
  assert.notDeepEqual(dailyWind(7, 12), dailyWind(8, 12));
  const days = Array.from({ length: 600 }, (_, d) => dailyWind(3, d + 1));
  const mph = days.map(w => w.mph), calm = mph.filter(v => v < CALM_MPH).length / days.length, windy = mph.filter(v => v >= 15).length / days.length;
  assert.ok(mean(mph) > 5 && mean(mph) < 10, `the mean day is light: ${mean(mph).toFixed(1)} mph`);
  assert.ok(Math.max(...mph) <= 30 && Math.max(...mph) > 18, `the worst day is blustery, not a gale: ${Math.max(...mph)}`);
  assert.ok(calm > 0.04 && calm < 0.2, `some calm days: ${(calm * 100).toFixed(0)}%`);
  assert.ok(windy > 0.03 && windy < 0.25, `some windy ones: ${(windy * 100).toFixed(0)}%`);
  const west = days.filter(w => w.from >= 225 && w.from <= 315).length / days.length;
  assert.ok(west > 0.5 && west < 0.75, `the prevailing wind from the west: ${(west * 100).toFixed(0)}%`);
  assert.ok(days.every(w => w.from >= 0 && w.from < 360 && w.gusty >= 0 && w.gusty <= 1 && Number.isInteger(w.seed)), 'bearings, gustiness and seed are in range');
});

test('wind: gusts are smooth, bounded by the day’s gustiness, and a steady day stays steady; a calm day is calm whenever', () => {
  const w = { mph: 12, from: 270, gusty: 0.8, seed: 99 };
  const ts = Array.from({ length: 6000 }, (_, k) => k * 0.1), v = ts.map(t => windAt(w, t));
  assert.ok(Math.min(...v.map(x => x.mph)) >= 12 * (1 - 0.4 * 0.8) - 0.06, 'a lull is the mean less 40% of the gustiness');
  assert.ok(Math.max(...v.map(x => x.mph)) <= 12 * (1 + 0.7 * 0.8) + 0.06, 'a gust is the mean plus 70% of the gustiness at most');
  assert.ok(Math.max(...v.map(x => x.mph)) > 12 * 1.3, 'there are real gusts');
  let jump = 0; for (let k = 1; k < v.length; k++) jump = Math.max(jump, Math.abs(v[k]!.mph - v[k - 1]!.mph));
  assert.ok(jump < 1.4, `no snaps: the biggest change in 0.1 s is ${jump.toFixed(2)} mph`);
  assert.ok(v.every(x => Math.abs(((x.from - 270 + 540) % 360) - 180) <= 12.01), 'the direction wobbles by up to 12 degrees');
  const steady = Array.from({ length: 200 }, (_, k) => windAt({ mph: 9, from: 90, gusty: 0, seed: 5 }, k * 0.7));
  assert.ok(steady.every(x => x.mph === 9 && x.from === 90), 'gusty 0 is steady');
  assert.ok(Array.from({ length: 50 }, (_, k) => windAt(NO_WIND, k)).every(x => x.mph === 0), 'no wind is no wind');
  const g = Array.from({ length: 4000 }, (_, k) => gustAt(w, k * 0.25)); assert.ok(Math.min(...g) >= 0 && Math.max(...g) <= 1 && mean(g) < 0.5, 'the gust factor sits in 0..1, mostly low');
  assert.deepEqual(windAt(w, 41.5), windAt(w, 41.5), 'the same instant, the same wind');
});

test('wind: compass and geometry (north is the top of the screen): from the north it blows south; a shot north with a west wind is pushed right, a south wind helps', () => {
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;
  const S = windToward(0), E = windToward(270), N = windToward(180), Wd = windToward(90);
  assert.ok(near(S.x, Math.SQRT1_2) && near(S.y, Math.SQRT1_2), 'a north wind blows toward the south, tile (1, 1)');
  assert.ok(near(E.x, Math.SQRT1_2) && near(E.y, -Math.SQRT1_2), 'a west wind blows toward the east, tile (1, -1)');
  assert.ok(near(N.x, -Math.SQRT1_2) && near(N.y, -Math.SQRT1_2) && near(Wd.x, -Math.SQRT1_2) && near(Wd.y, Math.SQRT1_2));
  // a shot to the north: tile (-1, -1)
  const un = { x: -Math.SQRT1_2, y: -Math.SQRT1_2 };
  const west = windOnShot({ mph: 10, from: 270 }, un.x, un.y), south = windOnShot({ mph: 10, from: 180 }, un.x, un.y), north = windOnShot({ mph: 10, from: 0 }, un.x, un.y), east = windOnShot({ mph: 10, from: 90 }, un.x, un.y);
  assert.ok(near(west.cross, 10) && near(west.tail, 0), 'a west wind pushes a northbound shot right');
  assert.ok(near(east.cross, -10), 'an east wind pushes it left');
  assert.ok(near(south.tail, 10) && near(south.cross, 0), 'a south wind is behind it');
  assert.ok(near(north.tail, -10), 'a north wind is in its face');
  assert.deepEqual(windOnShot(null, 1, 0), { tail: 0, cross: 0 }); assert.deepEqual(windOnShot({ mph: 0, from: 10 }, 1, 0), { tail: 0, cross: 0 });
  assert.equal(compassOf(270), 'W'); assert.equal(compassOf(359), 'N'); assert.equal(compassOf(-45), 'NW'); assert.equal(compassOf(100), 'E');
});

test('wind: what it does to a shot: a headwind costs more than a tailwind gives, a crosswind drifts, more on the long high clubs, none on a putter', () => {
  const ux = 1, uy = 0, toward = (deg: number) => windToward(deg), head = { mph: 10, from: 0 };
  // a wind blowing against +x: a tile vector (-1, 0) has no exact bearing (the compass axes are the diagonals), so aim the shot along a diagonal instead
  const u = { x: -Math.SQRT1_2, y: -Math.SQRT1_2 };
  const dir = (from: number) => ({ mph: 10, from });
  const hw = windEffect(dir(0), 'driver', u.x, u.y), tw = windEffect(dir(180), 'driver', u.x, u.y), cw = windEffect(dir(270), 'driver', u.x, u.y);
  assert.ok(Math.abs(hw.carry - (1 - WIND_K.head * 10)) < 1e-9, `10 mph headwind costs a driver ${(100 * (1 - hw.carry)).toFixed(1)}%`);
  assert.ok(Math.abs(tw.carry - (1 + WIND_K.tail * 10)) < 1e-9, 'a tailwind adds half as much');
  assert.ok(1 - hw.carry > 1.8 * (tw.carry - 1), 'the headwind hurts about twice what the tailwind helps');
  assert.ok(Math.abs(cw.drift - WIND_K.cross * 10) < 1e-9 && cw.carry === 1, 'a pure crosswind drifts and does not change the carry');
  assert.ok(cw.drift > 0 && windEffect(dir(90), 'driver', u.x, u.y).drift < 0, 'a west wind pushes right, an east wind left');
  // exposure by club: driver, woods, long irons, short irons, wedges
  const d = (c: Club) => windEffect(dir(270), c, u.x, u.y).drift;
  assert.ok(d('driver') > d('iron4') && d('iron4') > d('iron6') && d('iron6') > d('iron8') && d('iron8') > d('pw') && d('pw') > d('sw') && d('sw') > 0, 'the longer the club, the more of the wind it catches');
  assert.equal(windEffect(dir(270), 'putter', u.x, u.y).drift, 0); assert.equal(windEffect(dir(0), 'putter', u.x, u.y).carry, 1);
  // a high shot catches 1.3 times and a low one 0.6 times
  assert.ok(Math.abs(windEffect(dir(270), 'iron6', u.x, u.y, 1.3).drift / windEffect(dir(270), 'iron6', u.x, u.y).drift - 1.3) < 1e-9);
  assert.ok(Math.abs(windEffect(dir(270), 'iron6', u.x, u.y, 0.6).drift / windEffect(dir(270), 'iron6', u.x, u.y).drift - 0.6) < 1e-9);
  // a gale does not make a negative carry
  assert.ok(windEffect({ mph: 40, from: 0 }, 'driver', u.x, u.y, 1.3).carry >= 0.55);
  assert.deepEqual(windEffect(null, 'driver', ux, uy), { ...NO_EFFECT, exposure: WIND_CLUB.driver });
  void toward; void head;
});

test('wind: the readings (a saved wind, the words for the panel)', () => {
  assert.deepEqual(readWind({ mph: 9.5, from: 725, gusty: 3, seed: 4.9 }), { mph: 9.5, from: 5, gusty: 1, seed: 4 });
  assert.equal(readWind({ mph: 9 }), null); assert.equal(readWind(null), null); assert.equal(readWind({ mph: NaN, from: 0, gusty: 0, seed: 0 }), null);
  assert.equal(readWind({ mph: 99, from: 0, gusty: 0, seed: 0 })!.mph, 40);
  assert.deepEqual(readWindNow({ mph: -3, from: -90 }), { mph: 0, from: 270 }); assert.equal(readWindNow({ mph: 'x', from: 1 }), null);
  assert.equal(windText({ mph: 1, from: 90 }), 'Calm'); assert.equal(windText({ mph: 11.6, from: 270 }), '12 mph from the W');
  assert.equal(windRelText({ tail: -8, cross: 1 }, 8), 'Into the wind'); assert.equal(windRelText({ tail: 7, cross: 0 }, 7), 'Helping');
  assert.equal(windRelText({ tail: 0.5, cross: 6 }, 6), 'Left to right'); assert.equal(windRelText({ tail: 0, cross: -6 }, 6), 'Right to left');
  assert.equal(windRelText({ tail: -6, cross: 5 }, 8), 'Into the wind, left to right'); assert.equal(windRelText({ tail: 1, cross: 1 }, 1), 'Calm');
});

// ---- the wind on a flying ball ----

test('wind on a shot: a headwind shortens the carry, a tailwind lengthens it a little, a crosswind drifts the ball: exactly the effect, on the same draws', () => {
  // the shot's line is +x (tile frame): its direction is the 0 angle; pick the bearings so the wind is along or across +x exactly: from a bearing whose toward vector is (1, 0)
  // is not on the compass's diagonals, so use the effect's own parts: the model must apply windEffect(wind, club, cos ang, sin ang)
  const wind = { mph: 12, from: 300 }, n = 80;
  const base = volley('iron6', 150, 'fairway', undefined, n), withWind = volley('iron6', 150, 'fairway', { wind }, n);
  for (let k = 0; k < n; k++) {
    // the same stream: the same angle and the same distance before the wind; so the landing differs by the wind alone (the carry factor and the drift)
    const b = base[k]!, w = withWind[k]!, ang = Math.atan2(b.at.y, b.at.x), e = windEffect(wind, 'iron6', Math.cos(ang), Math.sin(ang));
    const flown = dist(O, b.at) * e.carry, drift = e.drift * flown;
    const want = { x: (Math.cos(ang) * flown - Math.sin(ang) * drift) / TILE_M, y: (Math.sin(ang) * flown + Math.cos(ang) * drift) / TILE_M };
    assert.ok(Math.hypot(w.at.x - want.x, w.at.y - want.y) < 1e-6, `shot ${k}: lands ${JSON.stringify(w.at)} wanted ${JSON.stringify(want)}`);
  }
  // the means: a headwind from straight ahead (a bearing whose wind blows against +x: from 135 blows toward tile (-1, ...); use the sign of tail)
  const tail = (from: number) => windOnShot({ mph: 12, from }, 1, 0).tail;
  const headFrom = [0, 45, 90, 135, 180, 225, 270, 315].map(f => ({ f, t: tail(f) })).sort((a, b) => a.t - b.t);
  const against = headFrom[0]!.f, behind = headFrom[headFrom.length - 1]!.f;
  const L = (from: number) => mean(volley('iron6', 150, 'fairway', { wind: { mph: 12, from } }, 120).map(x => x.carry)), L0 = mean(volley('iron6', 150, 'fairway', undefined, 120).map(x => x.carry));
  assert.ok(L(against) < L0 - 5, `into the wind: ${L(against).toFixed(0)} against ${L0.toFixed(0)}`);
  assert.ok(L(behind) > L0 + 1.5 && L(behind) - L0 < L0 - L(against), `helping: ${L(behind).toFixed(0)} against ${L0.toFixed(0)}, less than the headwind costs`);
});

test('wind on a shot: more on the high long clubs, less on the low short ones; a bunker shot (high) feels more; a putt takes none', () => {
  const env: ShotEnv = { wind: { mph: 14, from: 270 } };
  const sideOf = (club: Club, m: number, lie: Lie = 'fairway') => mean(volley(club, m, lie, env, 120).map(x => x.side)) - mean(volley(club, m, lie, undefined, 120).map(x => x.side));
  const drv = sideOf('driver', 200), i6 = sideOf('iron6', 140), pw = sideOf('pw', 90), sw = sideOf('sw', 50);
  assert.ok(Math.abs(drv) > Math.abs(i6) && Math.abs(i6) > Math.abs(pw) && Math.abs(pw) > Math.abs(sw) && Math.abs(sw) > 0, `drift by club: ${[drv, i6, pw, sw].map(v => v.toFixed(1))}`);
  // the same club and distance from the sand (a high shot) is pushed further than from the fairway: by the lie's height (1.3), per metre of carry
  const f = sideOf('iron6', 100), b = sideOf('iron6', 100, 'bunker');
  assert.ok(Math.abs(b) > 1.15 * Math.abs(f) * (volley('iron6', 100, 'bunker', undefined, 60).length > 0 ? 0.7 : 1), `a bunker shot is pushed: ${b.toFixed(2)} against ${f.toFixed(2)} (and it carries 0.7 of the fairway's)`);
  // a putt: the same outcome with or without the wind in its input
  const view = flat('green'), hole: PlayHole = { n: 1, par: 4, tee: O, pin: { x: 40, y: 0 }, line: [O, { x: 40, y: 0 }] };
  const a = shotOutcome(view, hole, { x: 30, y: 0 }, 'green', 0.6, { club: 'putter', aim: hole.pin, power: 1, swing: { power: 1, acc: 0, boost: 0 } }, rng(1, 2, 3));
  const c = shotOutcome(view, hole, { x: 30, y: 0 }, 'green', 0.6, { club: 'putter', aim: hole.pin, power: 1, swing: { power: 1, acc: 0, boost: 0 }, env: { wind: { mph: 30, from: 0 }, lie: 'rough', slope: { up: 0.1, across: 0.1 } } }, rng(1, 2, 3));
  assert.deepEqual(c.to, a.to); assert.equal(c.holed, a.holed); assert.equal(c.env, null, 'a putt reads no conditions');
});

// ---- the lie ----

test('lies: the surface’s kind (fairway, first cut, rough, deep rough, fescue, sand), and the coarse lie’s own when nothing finer is known', () => {
  const k = (s: GolfSurface) => lieKindOfSurface(s);
  assert.deepEqual(['green', 'tee', 'fairway', 'fringe', 'firstCut', 'rough', 'longGrass', 'fescue', 'bunker', 'waste', 'water', 'path', 'other'].map(s => k(s as GolfSurface)),
    ['green', 'tee', 'fairway', 'fairway', 'firstcut', 'rough', 'deep', 'fescue', 'bunker', 'bunker', 'water', 'rough', 'rough']);
  assert.equal(lieKindFor(undefined, O, 'fescue'), 'fescue'); assert.equal(lieKindFor(() => 'deep', O, 'fescue'), 'deep'); assert.equal(lieKindFor(() => 'deep', O, 'rough'), 'deep');
  assert.equal(lieKindFor(() => 'bunker', O, 'fairway'), 'fairway', 'a reading that does not fit the lie (the ball was put elsewhere) is dropped');
  assert.ok(kindFits('firstcut', 'fairway') && kindFits('firstcut', 'rough') && !kindFits('firstcut', 'bunker') && kindFits('tee', 'tee') && !kindFits('tee', 'fairway'));
  assert.deepEqual([...LIE_KINDS].sort(), [...Object.keys(LIE_FX)].sort());
});

test('lies: the course view reads the first cut beside a fairway, the deep rough, the fescue and the sand', () => {
  // a fairway strip along y = 0..4 tiles, rough around it, long grass beyond y = 30, fescue beyond y = 60, a patch of waste at x 50..55
  const surf = (x: number, y: number): GolfSurface | null => {
    if (x < 0 || x > 200 || y < -80 || y > 80) return null;
    if (x >= 50 && x <= 55 && y >= 20 && y <= 25) return 'waste';
    if (y >= 0 && y <= 4) return 'fairway';
    if (y > 60 || y < -60) return 'fescue';
    if (y > 30 || y < -30) return 'longGrass';
    return 'rough';
  };
  const hole: Hole = { n: 1, par: 4, lengthM: 0, memberLengthM: 0, line: [{ x: 10, y: 2 }, { x: 190, y: 2 }], warnings: [] };
  const view = makeCourseView([hole], surf), kind = (x: number, y: number) => view.kindAt!(x, y);
  assert.equal(kind(100, 2), 'fairway');
  assert.equal(kind(100, 4 + FIRST_CUT_TILES * 0.5), 'firstcut', 'rough within 3 m of the fairway is the first cut');
  assert.equal(kind(100, -FIRST_CUT_TILES * 0.5), 'firstcut');
  assert.equal(kind(100, 4 + FIRST_CUT_TILES + 0.6), 'rough', 'further out it is rough');
  assert.equal(kind(100, 40), 'deep'); assert.equal(kind(100, -45), 'deep'); assert.equal(kind(100, 70), 'fescue');
  assert.equal(kind(52, 22), 'bunker'); assert.equal(view.lieAt(52, 22), 'bunker', 'the coarse lie is unchanged');
  assert.equal(view.lieAt(100, 40), 'fescue', 'the deep rough was the coarse fescue lie before; it still is');
  assert.equal(kind(500, 500), 'out'); assert.equal(kind(205, 2), 'rough', 'unpainted land near a played line is rough'); assert.equal(kind(100, 90), 'out', 'and far from one it is out of bounds');
});

test('lies: each lie does what the table says: the carry, the spread (and the tee is the most distance, the fairway clean)', () => {
  const carry = (lie: Lie, kind: ShotEnv['lie']) => mean(volley('iron6', 150, lie, { lie: kind }, 160, 0.6).map(x => x.carry));
  const fw = carry('fairway', 'fairway'), tee = carry('tee', 'tee'), fc = carry('fairway', 'firstcut'), rgh = carry('rough', 'rough'), deep = carry('rough', 'deep'), fes = carry('fescue', 'fescue'), bkr = carry('bunker', 'bunker');
  assert.ok(fw > 125 && fw < 150 && fw > fc && fc > rgh && rgh > deep && deep > fes, `fairway ${fw.toFixed(0)} > first cut ${fc.toFixed(0)} > rough ${rgh.toFixed(0)} > deep ${deep.toFixed(0)} > fescue ${fes.toFixed(0)}`);
  // each against the fairway within the noise: the table's carry (a flier adds a little to the rough's)
  assert.ok(Math.abs(fc / fw - LIE_FX.firstcut.carry) < 0.05, `first cut ${(fc / fw).toFixed(2)}`);
  assert.ok(Math.abs(rgh / fw - LIE_FX.rough.carry * (1 + 0.28 * 0.9 * (FLIER.carry - 1))) < 0.06, `rough ${(rgh / fw).toFixed(2)}`);
  assert.ok(deep / fw < 0.82 && fes / fw < 0.7, `deep ${(deep / fw).toFixed(2)}, fescue ${(fes / fw).toFixed(2)}: much shorter`);
  assert.ok(bkr / fw < 0.78 && bkr / fw > 0.6, `bunker ${(bkr / fw).toFixed(2)}: short`);
  // the tee: the most distance (a driver asked for more than it has): 3% over the fairway's
  const full = (lie: Lie, kind: ShotEnv['lie']) => mean(volley('driver', 400, lie, { lie: kind }, 120, 0.8).map(x => x.carry));
  assert.ok(full('tee', 'tee') > 1.02 * full('fairway', 'fairway') && full('tee', 'tee') < 1.05 * full('fairway', 'fairway'), `tee ${full('tee', 'tee').toFixed(0)} against fairway ${full('fairway', 'fairway').toFixed(0)}`);
  void tee;
  // the spread: the rough, the deep rough and the fescue scatter more (the sideways spread of the landing as a share of the carry: the angle; the fescue's carry is short, so its
  // sideways metres are no more than the rough's, but off a ball that goes 60% as far they are a wild miss)
  const spreadOf = (lie: Lie, kind: ShotEnv['lie']) => sd(volley('iron6', 150, lie, { lie: kind }, 300, 0.6).map(x => x.side / x.carry));
  const sf = spreadOf('fairway', 'fairway'), sr = spreadOf('rough', 'rough'), sdp = spreadOf('rough', 'deep'), ss = spreadOf('fescue', 'fescue');
  assert.ok(sr > 1.15 * sf && sdp > sr && ss > sdp, `spread (the miss as a share of the carry): fairway ${sf.toFixed(3)}, rough ${sr.toFixed(3)}, deep ${sdp.toFixed(3)}, fescue ${ss.toFixed(3)}`);
});

test('lies: a flier from the rough: the short irons get one now and then (it flies further, with no spin, and runs on); a driver almost never', () => {
  assert.ok(flierChance('rough', 'pw') > flierChance('rough', 'iron6') && flierChance('rough', 'iron6') > flierChance('rough', 'wood3') && flierChance('rough', 'wood3') > flierChance('rough', 'driver') && flierChance('rough', 'putter') === 0);
  assert.equal(flierChance('fairway', 'pw'), 0); assert.equal(flierChance('fescue', 'pw'), 0);
  const BACK = spinEffect({ x: 0, y: -1, pump: 5 }, 'pw', 'rough', 'rough');
  let fliers = 0, n = 400; const carries: number[] = [], runs: number[] = [];
  for (let k = 0; k < n; k++) {
    const o = hitShot(rng(900 + k, 1, 2), 0.7, 'rough', O, { x: 45, y: 0 }, 'pw', flat('fairway'), { env: { lie: 'rough' }, spin: BACK });
    // (a flier has no spin: its landing carries no spin read)
    if (o.landing.spin === undefined) { fliers++; carries.push(dist(O, o.landing.at)); runs.push(dist(o.landing.at, o.to)); }
  }
  const share = fliers / n;
  assert.ok(share > 0.2 && share < 0.45, `a pitching wedge from the rough: ${(share * 100).toFixed(0)}% fliers (the table: ${(100 * flierChance('rough', 'pw')).toFixed(0)}% less the mishits)`);
  const dr = (() => { let f = 0; for (let k = 0; k < n; k++) { const o = hitShot(rng(900 + k, 1, 2), 0.7, 'rough', O, { x: 90, y: 0 }, 'driver', flat('fairway'), { env: { lie: 'rough' }, spin: BACK }); void o; f += flierChance('rough', 'driver'); } return f / n; })();
  assert.ok(dr < 0.04, 'the driver’s flier chance is tiny');
  // fliers carry further than the same club's ordinary rough shots and run on more
  const ord: number[] = [], ordRun: number[] = [];
  for (let k = 0; k < 300; k++) { const o = hitShot(rng(5000 + k, 1, 2), 0.7, 'rough', O, { x: 45, y: 0 }, 'pw', flat('fairway'), { env: { lie: 'firstcut' } }); ord.push(dist(O, o.landing.at)); ordRun.push(dist(o.landing.at, o.to)); }
  assert.ok(mean(carries) > mean(ord) * 0.95, 'a flier carries as far as a first cut shot or more');
  assert.ok(mean(runs) > mean(ordRun), `and runs on more: ${mean(runs).toFixed(1)} m against ${mean(ordRun).toFixed(1)} m`);
});

test('lies: the fescue is wild (more bad strikes) and the deep rough twists off line; the spin the lie lets on', () => {
  const bad = (kind: ShotEnv['lie'], lie: Lie) => { let m = 0; const n = 600; for (let k = 0; k < n; k++) { const o = hitShot(rng(7000 + k, 2, 9), 0.7, lie, O, { x: 70, y: 0 }, 'iron6', flat('fairway'), { env: { lie: kind } }); if (dist(O, o.landing.at) < 0.62 * 140 * 0.6) m++; } return m / n; };
  assert.ok(bad('fescue', 'fescue') > bad('rough', 'rough') && bad('rough', 'rough') >= bad('fairway', 'fairway'), `bad strikes: fescue ${bad('fescue', 'fescue')}, rough ${bad('rough', 'rough')}, fairway ${bad('fairway', 'fairway')}`);
  const back = (kind: ShotEnv['lie'], lie: Lie) => spinEffect({ x: 0, y: -1, pump: 20 }, 'sw', lie, kind).back;
  assert.equal(back('fairway', 'fairway'), 1); assert.equal(back('tee', 'tee'), 1);
  assert.ok(back('firstcut', 'fairway') < 1 && back('firstcut', 'fairway') > back('rough', 'rough'), 'the first cut lets most of the spin on, the rough less');
  assert.equal(back('rough', 'rough'), LIE_FX.rough.spin); assert.equal(back('deep', 'rough'), LIE_FX.deep.spin); assert.ok(back('fescue', 'fescue') < back('deep', 'rough'));
  assert.equal(spinEffect({ x: 0, y: -1, pump: 20 }, 'sw', 'rough').back, spinEffect({ x: 0, y: -1, pump: 20 }, 'sw', 'rough', 'rough').back, 'the coarse rough and the rough kind agree');
});

// ---- the slope ----

test('slope: the height field under the ball: uphill, and the ball above or below the feet (right of the target line higher is above)', () => {
  // a plane rising to the east (+x) at 4% and to the south (+y) at 2%
  const h = (x: number, y: number) => 0.04 * TILE_M * x + 0.02 * TILE_M * y;
  const east = slopeAt(h, O, { x: 50, y: 0 }), south = slopeAt(h, O, { x: 0, y: 50 }), west = slopeAt(h, O, { x: -50, y: 0 }), north = slopeAt(h, O, { x: 0, y: -50 });
  assert.ok(Math.abs(east.up - 0.04) < 1e-9 && Math.abs(east.across - 0.02) < 1e-9, `a shot east: up 4%, and the ground rises to its right (south, with y down): the ball is above the feet: ${JSON.stringify(east)}`);
  assert.ok(Math.abs(south.up - 0.02) < 1e-9 && Math.abs(south.across - (-0.04)) < 1e-9, `a shot south: its right is the west, where the ground is lower: ${JSON.stringify(south)}`);
  assert.ok(Math.abs(west.up + 0.04) < 1e-9 && Math.abs(north.up + 0.02) < 1e-9, 'downhill the other way');
  assert.deepEqual(slopeAt(null, O, { x: 5, y: 5 }), { up: 0, across: 0 }); assert.deepEqual(slopeAt(() => 3, O, { x: 5, y: 5 }), { up: 0, across: 0 });
  assert.ok(Math.abs(slopeAt(h, O, O).up - 0.04) < 1e-9, 'with the aim on the ball the shot is read along +x');
  // the effects: uphill is shorter and runs less, downhill longer; the ball above the feet pulls left, below pushes right
  const up = slopeEffect({ up: 0.05, across: 0 }), down = slopeEffect({ up: -0.05, across: 0 }), above = slopeEffect({ up: 0, across: 0.04 }), below = slopeEffect({ up: 0, across: -0.04 });
  assert.ok(up.carry < 1 && down.carry > 1 && up.run < 1 && down.run > 1 && above.deg < 0 && below.deg > 0 && Math.abs(above.deg + below.deg) < 1e-9 && above.spread > 1 && up.spread === 1);
  assert.ok(Math.abs(slopeEffect({ up: 0, across: 5 }).deg) === SLOPE_FX.maxDeg && slopeEffect({ up: 5, across: 0 }).carry === 1 - SLOPE_FX.carryMax, 'held to the caps');
  assert.deepEqual(slopeEffect(null), { carry: 1, deg: 0, run: 1, spread: 1 });
  assert.deepEqual(slopeLines({ up: 0.003, across: 0.003 }), [], 'flat ground has nothing to say');
  assert.deepEqual(slopeLines({ up: 0.03, across: 0.03 }), ['Ball above your feet: pulls left 2°', 'Uphill lie: 3% shorter, higher']);
  assert.deepEqual(slopeLines({ up: -0.04, across: -0.05 }), ['Ball below your feet: pushes right 4°', 'Downhill lie: 4% longer, runs on']);
});

test('slope: the model: uphill carries less, the ball above the feet lands left of the line, below the feet right; no slope is flat ground', () => {
  const avg = (env: ShotEnv | undefined) => { const v = volley('iron6', 140, 'fairway', env, 160); return { carry: mean(v.map(x => x.carry)), side: mean(v.map(x => x.side)), run: mean(v.map(x => dist(x.at, x.to))) }; };
  const flatG = avg({ lie: 'fairway' }), up = avg({ slope: { up: 0.06, across: 0 } }), down = avg({ slope: { up: -0.06, across: 0 } }), above = avg({ slope: { up: 0, across: 0.06 } }), below = avg({ slope: { up: 0, across: -0.06 } });
  assert.ok(up.carry < flatG.carry * 0.97 && down.carry > flatG.carry * 1.03, `uphill ${up.carry.toFixed(0)}, flat ${flatG.carry.toFixed(0)}, downhill ${down.carry.toFixed(0)}`);
  assert.ok(down.run > flatG.run && up.run < flatG.run, 'downhill runs on, uphill pulls up');
  assert.ok(above.side < flatG.side - 3 && below.side > flatG.side + 3, `above the feet ${above.side.toFixed(1)} m, flat ${flatG.side.toFixed(1)}, below ${below.side.toFixed(1)}`);
  assert.deepEqual(volley('iron6', 140, 'fairway', { lie: 'fairway' }, 20), volley('iron6', 140, 'fairway', { slope: { up: 0, across: 0 }, lie: 'fairway' }, 20), 'a zero slope is flat ground');
});

// ---- the record kept with a shot ----

test('conditions: a saved shot’s conditions are read clamped, junk is refused', () => {
  assert.deepEqual(readEnv({ wind: { mph: 12, from: 400 }, lie: 'rough', slope: { up: 0.9, across: -0.02 } }), { wind: { mph: 12, from: 40 }, lie: 'rough', slope: { up: 0.4, across: -0.02 } });
  assert.deepEqual(readEnv({ lie: 'deep' }), { lie: 'deep' });
  assert.equal(readEnv({ lie: 'moon' }), null); assert.equal(readEnv({}), null); assert.equal(readEnv(null), null); assert.equal(readEnv(5), null); assert.equal(readEnv({ wind: { mph: 'x', from: 0 } }), null);
  assert.deepEqual(readEnv({ slope: { up: 'x', across: 0 }, lie: 'tee' }), { lie: 'tee' });
  assert.deepEqual(fieldEnv({ wind: { mph: 7, from: 180, gusty: 1, seed: 3 }, height: (x, y) => 0.01 * TILE_M * (x + y) }, undefined, { x: 5, y: 5 }, 'rough', { x: 40, y: 5 }),
    { lie: 'rough', wind: { mph: 7, from: 180 }, slope: fieldEnv({ height: (x, y) => 0.01 * TILE_M * (x + y) }, undefined, { x: 5, y: 5 }, 'rough', { x: 40, y: 5 }).slope });
  assert.deepEqual(fieldEnv({}, undefined, O, 'fairway', { x: 9, y: 0 }), { lie: 'fairway' }, 'no wind, no heights: only the lie');
});

// ---- back-compat: the model without conditions is the model as it was ----

const PARS: (3 | 4 | 5)[] = [3, 4, 4, 5, 3, 4, 4, 4, 5, 4, 3, 4, 4, 4, 5, 4, 4, 5], POND = [5, 12];
function segDist(p: Pt, a: Pt, b: Pt): number { const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2)) : 0; return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t); }
function course(): CourseView {
  const holes: PlayHole[] = PARS.map((par, h) => { const y = 20 + 60 * h, tee = { x: 10, y }, pin = { x: 10 + (par === 3 ? 160 : par === 4 ? 380 : 500) / TILE_M, y }; return { n: h + 1, par, tee, pin, line: [tee, pin] }; });
  const ponds = POND.map(h => ({ x: holes[h]!.tee.x + 100, y: holes[h]!.tee.y + 12.5 }));
  const lieAt = (x: number, y: number): Lie => {
    for (const h of holes) if (Math.hypot(x - h.pin.x, y - h.pin.y) <= 6) return 'green';
    for (const q of ponds) if (Math.hypot(x - q.x, y - q.y) <= 7.5) return 'water';
    let d = Infinity; for (const h of holes) d = Math.min(d, segDist({ x, y }, h.tee, h.pin));
    return d <= 7.5 ? 'fairway' : d <= 40 ? 'rough' : 'out';
  };
  return { holes, lieAt };
}
const fnv = (s: string): string => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16); };
const r6 = (v: number) => Math.round(v * 1e6) / 1e6;

test('back-compat: the shot model without conditions is the model as it was before T334 (golden values captured from the unchanged code): hitShot, shotOutcome, a field round and the owner’s live group', () => {
  // hitShot over the clubs, lies and skills, with no mod, a swing mod and a spin mod (70 shots)
  const clubs: Club[] = ['driver', 'wood3', 'iron4', 'iron6', 'iron8', 'pw', 'sw'], lies: Lie[] = ['tee', 'fairway', 'rough', 'fescue', 'bunker'], g1: unknown[] = [];
  let n = 0;
  for (const club of clubs) for (const lie of lies) for (const sk of [0.3, 0.8]) {
    n++;
    const mod = n % 3 === 0 ? { maxF: 1.05, spread: 1.2, angF: 0.5, roll: 1.5 } : n % 3 === 1 ? { spin: spinEffect({ x: 0.3, y: -0.6, pump: 2 }, club, lie) } : undefined;
    const o = hitShot(rng(7, n, 11), sk, lie, { x: 0, y: 0 }, { x: 90, y: 4 }, club, flat('fairway'), mod);
    g1.push([club, lie, sk, r6(o.to.x), r6(o.to.y), o.lie, o.penalty, r6(o.landing.at.x), r6(o.landing.at.y), o.landing.lie, o.landing.spin ?? null]);
  }
  assert.equal(g1.length, 70); assert.equal(fnv(JSON.stringify(g1)), '7537d5c3', 'hitShot: the same landings');
  // the shot model with an empty or junk conditions record is the model without it
  const o1 = hitShot(rng(7, 1, 11), 0.5, 'rough', O, { x: 80, y: 0 }, 'iron6', flat('fairway')), o2 = hitShot(rng(7, 1, 11), 0.5, 'rough', O, { x: 80, y: 0 }, 'iron6', flat('fairway'), { maxF: 1 });
  assert.deepEqual(o1, o2);
  // shotOutcome (the owner’s input path): a full shot, a swing, a swing with spin, two putts
  const view = course(), hole = view.holes[3]!, g2: unknown[] = [];
  const inputs = [
    { club: 'driver' as Club, aim: { x: hole.pin.x, y: hole.pin.y }, power: 0.9 },
    { club: 'iron6' as Club, aim: { x: 120, y: 200 }, power: 0.7, swing: { power: 0.9, acc: 0.05, boost: 0.02 } },
    { club: 'sw' as Club, aim: { x: 60, y: 200 }, power: 0.5, swing: { power: 1.1, acc: -0.12, boost: 0 }, spin: { x: 0.2, y: -0.8, pump: 4 } },
    { club: 'putter' as Club, aim: { x: hole.pin.x, y: hole.pin.y }, power: 1, swing: { power: 1.02, acc: 0.01, boost: 0 } },
    { club: 'putter' as Club, aim: { x: hole.pin.x + 1, y: hole.pin.y }, power: 1.2 },
  ];
  inputs.forEach((inp, k) => {
    const from = inp.club === 'putter' ? { x: hole.pin.x - 8, y: hole.pin.y } : { x: 30, y: 200 };
    const o = shotOutcome(view, hole, from, 'fairway', 0.4, inp, rng(9, k, 3));
    g2.push([k, r6(o.to.x), r6(o.to.y), o.lie, o.penalty, o.holed, o.landing ? [r6(o.landing.at.x), r6(o.landing.at.y)] : null]);
    assert.equal(o.env, null, 'no conditions read from an input without them');
  });
  assert.equal(fnv(JSON.stringify(g2)), 'b10b1918', 'shotOutcome: the same shots');
  // the field's round, tier 3, seed 3: 3810 shots
  const f = makeField(3, 3), gs = teeTimes(f, 3), plan = playRound(view, f, gs, 3);
  assert.equal(plan.shots.length, 3810); assert.equal(fnv(JSON.stringify(plan.shots)), '419b9662', 'playRound: the same field round');
  assert.equal(plan.strokes[0]!.reduce((a, b) => a + b, 0), 79); assert.equal(plan.strokes[5]!.reduce((a, b) => a + b, 0), 81);
  // the owner's live group with suggested inputs, 18 holes
  const field = makeField(3, 5), owner = field.find(g => !g.pro)!; owner.owner = true; owner.skill = 0.4;
  const groups = teeTimes(field, 5), gi = groups.findIndex(g => g.players.includes(owner.id)), pl = playRound(view, field, groups, 5, { live: gi }), lg = new LiveGroup(pl, view, gi, 5);
  for (let k = 0; k < 200; k++) {
    const t = lg.advance(); if (!t) break;
    const sg = t.suggested;
    lg.play({ holeIdx: t.holeIdx, stroke: t.stroke, club: sg.club, aim: sg.aim, power: k % 3 ? sg.power : sg.power * 0.85, ...(k % 4 === 0 ? { swing: { power: sg.power, acc: 0.03, boost: 0 } } : {}) });
  }
  assert.equal(lg.inputs.length, 93); assert.equal(fnv(JSON.stringify(pl.shots)), 'b5937623', 'the live group: the same shots'); assert.equal(pl.strokes[owner.id]!.reduce((a, b) => a + b, 0), 93);
  assert.ok(lg.inputs.every(i => !('env' in i)), 'no conditions are saved for an input that had none');
});

test('back-compat: a saved input with conditions replays exactly (a live group and a round of your own), whatever the wind and the terrain do afterwards', () => {
  const view = course(), field = makeField(3, 5), owner = field.find(g => !g.pro)!; owner.owner = true; owner.skill = 0.4;
  const groups = teeTimes(field, 5), gi = groups.findIndex(g => g.players.includes(owner.id)), pa = playRound(view, field, groups, 5, { live: gi }), a = new LiveGroup(pa, view, gi, 5);
  for (let k = 0; k < 60; k++) {
    const t = a.advance(); if (!t) break;
    const sg = t.suggested, env: ShotEnv = { lie: k % 2 ? 'rough' : 'fairway', wind: { mph: 4 + k % 9, from: (k * 47) % 360 }, slope: { up: ((k % 5) - 2) * 0.01, across: ((k % 7) - 3) * 0.01 } };
    a.play({ holeIdx: t.holeIdx, stroke: t.stroke, club: sg.club, aim: sg.aim, power: sg.power, ...(sg.club === 'putter' ? {} : { env }), swing: { power: Math.min(1.1, sg.power), acc: 0.02 * (k % 3), boost: 0 } });
  }
  assert.ok(a.inputs.filter(i => i.env).length >= 30, 'the inputs keep their conditions');
  const pb = playRound(view, field, groups, 5, { live: gi }), b = new LiveGroup(pb, view, gi, 5);
  b.replay(JSON.parse(JSON.stringify(a.inputs)) as OwnerInput[]); // (through JSON: what a save does)
  assert.deepEqual(b.inputs, a.inputs, 'the same inputs'); assert.equal(JSON.stringify(pb.shots), JSON.stringify(pa.shots), 'the same shots');
  assert.deepEqual(pb.strokes, pa.strokes);
  // your own round: the same input, the same shot, and a different one with other conditions
  const r0 = startRound(view, [3], 4)!, input = { club: 'driver' as Club, aim: { x: 120, y: 200 }, power: 1, swing: { power: 1, acc: 0, boost: 0 } };
  const y1 = playYours(view, r0, 0.5, { ...input, env: { wind: { mph: 15, from: 270 }, lie: 'tee' } }, 8), y2 = playYours(view, r0, 0.5, JSON.parse(JSON.stringify({ ...input, env: { wind: { mph: 15, from: 270 }, lie: 'tee' } })), 8);
  const y0 = playYours(view, r0, 0.5, input, 8);
  assert.deepEqual(y1.shot, y2.shot, 'the saved input replays'); assert.notDeepEqual(y1.shot.to, y0.shot.to, 'and the wind moved it');
});

// ---- the field and the day’s conditions ----

test('field: with the day’s conditions the model’s golfers play in the same weather (a headwind costs strokes); without them the day is as it was; the same conditions replay', () => {
  const view = course(), f = makeField(3, 3), gs = teeTimes(f, 3);
  const calm = playRound(view, f, gs, 3), same = playRound(view, f, gs, 3);
  assert.equal(JSON.stringify(calm.shots), JSON.stringify(same.shots), 'no conditions: deterministic as before');
  const hw = (from: number) => playRound(view, f, gs, 3, { cond: { wind: { mph: 18, from, gusty: 0, seed: 1 } } });
  const tot = (p: ReturnType<typeof playRound>) => p.strokes.reduce((a, r) => a + r.reduce((x, y) => x + y, 0), 0);
  // the tile x axis runs along the holes: a wind blowing against +x is from the bearing whose toward vector has the most -x
  const dirs = [0, 45, 90, 135, 180, 225, 270, 315].map(from => ({ from, x: windToward(from).x })), against = dirs.sort((a, b) => a.x - b.x)[0]!.from;
  const a = hw(against), a2 = hw(against);
  assert.equal(JSON.stringify(a.shots), JSON.stringify(a2.shots), 'the same conditions, the same day');
  assert.ok(tot(a) > tot(calm) + 12, `18 mph into the field's faces: ${tot(a)} strokes against ${tot(calm)}`);
  const none = playRound(view, f, gs, 3, { cond: { wind: null, height: null } });
  assert.ok(Math.abs(tot(none) - tot(calm)) < 0.08 * tot(calm), `no wind, only the lie’s kinds: ${tot(none)} against ${tot(calm)}`);
  assert.notEqual(fnv(JSON.stringify(none.shots)), fnv(JSON.stringify(calm.shots)), 'the lies’ kinds do change the shots');
  assert.ok(a.shots.every(s => Number.isFinite(s.to.x) && Number.isFinite(s.to.y)));
});

// ---- the panel's numbers: the preview, the wind dial, the lie's lines, the report's tail ----

test('preview: the flight the panel and the overlay expect agrees with what the model does (the lie, the slope and the wind), and is the aim itself on a fairway in no wind', () => {
  const u = { x: 1, y: 0 };
  const flatP = previewShot('iron6', 140, u.x, u.y, { lie: 'fairway' });
  assert.equal(flatP.carryM, 140); assert.equal(flatP.sideM, 0); assert.equal(flatP.spread, 1);
  assert.equal(previewShot('iron6', 140, u.x, u.y, null).carryM, 140);
  const rough = previewShot('iron6', 140, u.x, u.y, { lie: 'rough' });
  assert.ok(Math.abs(rough.carryM - 140 * LIE_FX.rough.carry) < 1e-9 && rough.spread === LIE_FX.rough.spread);
  // the wind's part: a wind from a bearing with a tail component along +x shifts the carry, one across it the side
  const bear = (f: (t: { tail: number; cross: number }) => number) => [0, 45, 90, 135, 180, 225, 270, 315].map(from => ({ from, e: windOnShot({ mph: 12, from }, 1, 0) })).sort((a, b) => f(b.e) - f(a.e))[0]!.from;
  const against = bear(e => -e.tail), pushRight = bear(e => e.cross);
  const hw = previewShot('driver', 200, 1, 0, { lie: 'fairway', wind: { mph: 12, from: against } }), cw = previewShot('driver', 200, 1, 0, { lie: 'fairway', wind: { mph: 12, from: pushRight } });
  assert.ok(hw.windCarryM < -8 && hw.carryM < 200, `a headwind: ${hw.windCarryM.toFixed(1)} m`);
  assert.ok(cw.windDriftM > 8 && cw.sideM === cw.windDriftM, `a crosswind: ${cw.windDriftM.toFixed(1)} m right`);
  // the slope's pull: the ball above the feet puts the landing left
  const sl = previewShot('iron6', 140, 1, 0, { lie: 'fairway', slope: { up: 0, across: 0.05 } });
  assert.ok(sl.sideM < -4 && sl.carryM < 140.001, `above the feet: ${sl.sideM.toFixed(1)} m`);
  // against the model: the mean landing's drift of many shots matches the preview's (the wind takes no draws, the randomness has mean zero)
  const env: ShotEnv = { lie: 'fairway', wind: { mph: 12, from: pushRight } }, v = volley('driver', 200, 'fairway', env, 400, 0.8), base = volley('driver', 200, 'fairway', { lie: 'fairway' }, 400, 0.8);
  const drift = mean(v.map(x => x.side)) - mean(base.map(x => x.side)), want = previewShot('driver', 200, 1, 0, env).windDriftM;
  assert.ok(Math.abs(drift - want) < 0.2 * Math.abs(want) + 0.5, `the model drifts ${drift.toFixed(1)} m, the preview ${want.toFixed(1)} m`);
});

test('panel: the wind dial reads the wind against the shot (up the line a tailwind, 180 into the face, 90 from the left), the lie’s lines and the report’s tail', () => {
  const north = { x: -Math.SQRT1_2, y: -Math.SQRT1_2 }, day = { mph: 10, from: 270, gusty: 0.5, seed: 1 };
  const tailW = windView({ mph: 10, from: 180 }, day, north.x, north.y), headW = windView({ mph: 10, from: 0 }, day, north.x, north.y), left = windView({ mph: 10, from: 90 }, day, north.x, north.y), right = windView({ mph: 10, from: 270 }, day, north.x, north.y);
  assert.ok(Math.abs(tailW.arrow) < 1e-6 && Math.abs(Math.abs(headW.arrow) - 180) < 1e-6 && Math.abs(right.arrow - 90) < 1e-6 && Math.abs(left.arrow + 90) < 1e-6, `${[tailW, headW, right, left].map(w => w.arrow.toFixed(0))}`);
  assert.equal(headW.rel, 'Into the wind'); assert.equal(tailW.rel, 'Helping'); assert.equal(right.rel, 'Left to right'); assert.equal(left.rel, 'Right to left');
  assert.equal(headW.text, '10 mph from the N'); assert.equal(headW.peak, 14); assert.equal(windView(null, null, 1, 0).calm, true); assert.equal(windView({ mph: 1, from: 0 }, day, 1, 0).rel, 'Calm');
  assert.deepEqual(lieView('fairway', 'iron6').lines, []); assert.equal(lieView('tee', 'driver').lines[0], 'carry +3%');
  assert.deepEqual(lieView('rough', 'pw').lines, ['carry -12%', 'scatter x1.3', '45% of the spin', 'a flier in 3 of 10']);
  assert.ok(lieView('fescue', 'iron6').lines.includes('wild strikes') && lieView('fescue', 'iron6').lines.includes('carry -40%'));
  assert.ok(lieView('rough', 'driver').flier < 0.05 && !lieView('rough', 'driver').lines.some(l => l.startsWith('a flier')), 'a driver gets no flier line');
  // the report's tail: what the wind did to a played shot
  const at = { x: 60, y: 0 }, up = windNote({ wind: { mph: 14, from: 270 }, lie: 'fairway' }, 'iron6', O, at);
  assert.ok(up && /^wind /.test(up), up ?? 'none'); assert.equal(windNote({ lie: 'fairway' }, 'iron6', O, at), null); assert.equal(windNote({ wind: { mph: 1, from: 0 } }, 'iron6', O, at), null);
  assert.equal(windNote({ wind: { mph: 20, from: 0 } }, 'putter', O, at), null, 'a putter has no wind'); assert.equal(windNote({ wind: { mph: 20, from: 0 } }, 'iron6', O, { x: 1, y: 0 }), null, 'a dribble has none');
  assert.equal(shotReport({ golfer: -1, hole: 0, stroke: 1, t: 0, from: O, to: { x: 55, y: 0 }, club: 'iron6', lie: 'fairway', penalty: 0, holed: false, landing: { at: { x: 50, y: 0 }, lie: 'fairway', rest: { x: 55, y: 0 }, restLie: 'fairway' } }, null, 'wind -8 m, 5 m right').text,
    '6-iron · carry 100 m, total 110 m · wind -8 m, 5 m right');
});

test('weather gate: a save from before the weather keeps no `weather`, one with it keeps it well formed; the course views carry the finer lie through the day pins and the everyday course', () => {
  const base = { town: { x: 1, y: 1 }, course: [0, 0, 9, 9], clubhouse: { x: 1, y: 1 } } as never;
  assert.equal(normalizeGolfSave(base)!.weather, undefined);
  assert.deepEqual(normalizeGolfSave({ ...(base as object), weather: { from: 7.9 } } as never)!.weather, { from: 7 });
  assert.equal(normalizeGolfSave({ ...(base as object), weather: { from: -1 } } as never)!.weather, undefined); assert.equal(normalizeGolfSave({ ...(base as object), weather: 'x' } as never)!.weather, undefined);
  const hole: Hole = { n: 1, par: 4, lengthM: 0, memberLengthM: 0, line: [{ x: 10, y: 2 }, { x: 190, y: 2 }], warnings: [] };
  const view = makeCourseView([hole, { ...hole, n: 2 }], () => 'rough');
  assert.equal(typeof view.kindAt, 'function');
  assert.equal(typeof withDayPins(view, () => ({ x: 150, y: 3 })).kindAt, 'function', 'the day’s pins keep the finer lie');
  assert.equal(typeof dayCourse(view).kindAt, 'function', 'the everyday course keeps it too');
});

test('day: dayRound with the day’s conditions plays the day in them, without them as before; the owner’s saved inputs replay either way', () => {
  const view = course(), seed = 12345, plain = dayRound(view, 3, seed, null), also = dayRound(view, 3, seed, null, undefined);
  assert.equal(JSON.stringify(plain.plan.shots), JSON.stringify(also.plan.shots), 'no conditions: the same day');
  const cond = { wind: { mph: 14, from: 200, gusty: 0, seed: 1 }, height: null }, a = dayRound(view, 3, seed, null, cond), b = dayRound(view, 3, seed, null, cond);
  assert.equal(JSON.stringify(a.plan.shots), JSON.stringify(b.plan.shots), 'the same conditions: the same day'); assert.notEqual(JSON.stringify(a.plan.shots), JSON.stringify(plain.plan.shots));
  // the owner plays two shots with conditions in his inputs, and the day rebuilt from them (a reload) gives the same state
  const o1 = dayRound(view, 3, seed, { owner: 'm', inputs: [], caddie: null }, cond), t0 = o1.own!.turn!, g = o1.own!;
  const inp: OwnerInput = { holeIdx: t0.holeIdx, stroke: t0.stroke, club: t0.suggested.club, aim: t0.suggested.aim, power: t0.suggested.power, env: { lie: 'tee', wind: { mph: 9, from: 300 } } };
  g.live.play(inp);
  const t1 = g.live.advance()!; g.live.play({ holeIdx: t1.holeIdx, stroke: t1.stroke, club: t1.suggested.club, aim: t1.suggested.aim, power: t1.suggested.power, env: { lie: 'fairway', wind: { mph: 11, from: 90 } } });
  const o2 = dayRound(view, 3, seed, { owner: 'm', inputs: JSON.parse(JSON.stringify(g.live.inputs)), caddie: null }, cond);
  assert.deepEqual(o2.own!.turn, g.live.advance(), 'the same next turn'); assert.equal(JSON.stringify(o2.plan.shots), JSON.stringify(o1.plan.shots), 'the same shots');
});

test('field: a moderate wind and the lie’s kinds cost a tour field a stroke or two a round, not more (it plays on in 8 mph as it did in a calm)', () => {
  const view = course(), seeds = [11, 12, 13, 14];
  let calm = 0, windy = 0, n = 0;
  for (const seed of seeds) {
    const f = makeField(5, seed), gs = teeTimes(f, seed), a = playRound(view, f, gs, seed), b = playRound(view, f, gs, seed, { cond: { wind: { mph: 8, from: 250, gusty: 0, seed: 2 } } });
    for (const g of f) { calm += a.strokes[g.id]!.reduce((x, y) => x + y, 0); windy += b.strokes[g.id]!.reduce((x, y) => x + y, 0); n++; }
  }
  const d = (windy - calm) / n;
  assert.ok(d > -1 && d < 4, `a tour golfer in 8 mph and the lie kinds: ${d.toFixed(2)} strokes a round more than in a calm`);
});

test('weather gate: a new game has the weather from its first tournament; a save from before it gets it from the next tournament (a day in progress and every day before play as they did); a save that has it keeps it', () => {
  const fresh: { weather?: { from: number } } = {};
  assert.equal(weatherOn(fresh, 0), true); assert.deepEqual(fresh.weather, { from: 0 }, 'a new game is stamped by its first look: it keeps the weather through every save');
  // an old save with the tournament day under way (three rounds done): the day in progress is key 3 and plays as it did; the next is key 4
  const mid: { weather?: { from: number } } = {}; stampWeather(mid, 3, true);
  assert.deepEqual(mid.weather, { from: 4 }); assert.equal(weatherOn(mid, 3), false, 'the day in progress plays as it did'); assert.equal(weatherOn(mid, 2), false); assert.equal(weatherOn(mid, 4), true);
  // an old save between tournaments: the next tournament is key 3 and has the weather
  const idle: { weather?: { from: number } } = {}; stampWeather(idle, 3, false);
  assert.deepEqual(idle.weather, { from: 3 }); assert.equal(weatherOn(idle, 2), false); assert.equal(weatherOn(idle, 3), true);
  // a save that has it keeps it, and the gate goes through a save and a load (normalizeGolfSave keeps weather)
  const kept = { weather: { from: 9 } }; stampWeather(kept, 1, false); assert.deepEqual(kept.weather, { from: 9 });
  const base = { town: { x: 1, y: 1 }, course: [0, 0, 9, 9], clubhouse: { x: 1, y: 1 }, weather: { from: 5 } } as never;
  assert.deepEqual(normalizeGolfSave(base)!.weather, { from: 5 });
  // and a day before the weather is played with no conditions: the same shots as playRound without them (what the engine passes for such a key)
  const view = course(), f = makeField(3, 9), gs = teeTimes(f, 9);
  assert.equal(JSON.stringify(playRound(view, f, gs, 9, weatherOn(mid, 3) ? { cond: { wind: null } } : undefined).shots), JSON.stringify(playRound(view, f, gs, 9).shots));
});
