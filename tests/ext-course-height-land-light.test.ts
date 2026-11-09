// T388 (#1048): the real ground lit so the hills read. The slope light's gentle-ground gain (T263: built for a fairway's 1 to 3% rolls) tilts the light's normal 0.38 at a 3% slope and 0.45 at 10%, so under a map-data course
// every slope from 3 to 15% lit the same and a hill was blotches of "facing the sun" and "facing away". The land layer (golf/osm/land.ts) is now lit by its own response, proportional to the slope (light.ts landExag, LAND_GAIN):
// gentle ground stays calm, a hill's flanks catch the sun in proportion to their steepness, the player's own layer on top keeps the gentle gain, and a game with no land lights every number as it did.
// Also: the land as the workers are given it (land.ts landLightRect), the skirt that is longer (SKIRT_T), the plumbing from the engine to the painter, and the gear menu's way back to the old light.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CH_SIZE, CH_STEP, SUN_TILE_DIR } from '../src/game/ext/course-height';
import { LAND_EXAG, LAND_FLOOR, LAND_GAIN, LAND_KNEE, heightLightGrid, landExag, lightExag, sampleHeightLight, splineHeight, splineLand, type LightLand } from '../src/game/ext/course-height/light';
import { SKIRT_T, WINDOW_T, addLandPatch, clearLandIn, createLandField, landLightRect, landWindow, layLand, type LandField } from '../src/game/golf/osm/land';
import type { OsmCourseSpec } from '../src/game/golf/osm/types';
import { OSM_CREDIT } from '../src/game/golf/osm/types';
import type { HeightGrid } from '../src/game/golf/osm/terrarium';

/** a field with h(x, y) (world tiles, metres) at every sample centre */
function field(fn: (x: number, y: number) => number): Float32Array {
  const h = new Float32Array(CH_SIZE * CH_SIZE);
  for (let j = 0; j < CH_SIZE; j++) for (let i = 0; i < CH_SIZE; i++) h[j * CH_SIZE + i] = fn((i + 0.5) * CH_STEP, (j + 0.5) * CH_STEP);
  return h;
}
/** the land layer of h over the square of half-side `half` tiles about (cx, cy): the samples of the lattice, the way the workers hold them */
function layer(fn: (x: number, y: number) => number, cx: number, cy: number, half: number): LightLand {
  const i0 = Math.floor((cx - half) / CH_STEP), i1 = Math.ceil((cx + half) / CH_STEP), j0 = Math.floor((cy - half) / CH_STEP), j1 = Math.ceil((cy + half) / CH_STEP), w = i1 - i0 + 1, h = j1 - j0 + 1, data = new Float32Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) data[j * w + i] = fn((i0 + i + 0.5) * CH_STEP, (j0 + j + 0.5) * CH_STEP);
  return { i0, j0, w, h, data };
}
const box = (cx: number, cy: number, r: number) => [cx - r, cy - r, cx + r, cy + r] as const;
/** the distance (tiles) from (500, 500) toward the sun */
const toSun = (x: number, y: number) => (x - 500) * SUN_TILE_DIR.x + (y - 500) * SUN_TILE_DIR.y;
/** a plane of slope s (m per m) that falls toward the sun (it faces it: lit) or away from it (shaded); a tile is 2 m */
const plane = (s: number, facing: boolean) => (x: number, y: number) => (facing ? -1 : 1) * s * 2 * toSun(x, y);
/** the light at (500, 500) of a plane in the land layer (new) and of the same plane as the one summed field with no land layer (what the workers lit before) */
function lightOf(s: number, facing: boolean) {
  const fn = plane(s, facing), old = heightLightGrid(field(fn), box(500, 500, 10), 2)!, neu = heightLightGrid(field(() => 0), box(500, 500, 10), 2, layer(fn, 500, 500, 60))!;
  return { old: sampleHeightLight(old, 500, 500), neu: sampleHeightLight(neu, 500, 500) };
}

describe('the land layer\'s response (T388)', () => {
  it('the tilt per slope grows with the slope all the way (a hill\'s flank lights more than gentle ground), is faint on gentle ground and keeps growing on steep', () => {
    let prev = 0; for (let s = 0; s <= 1.0001; s += 0.0005) { const t = s * landExag(s * s); assert.ok(t >= prev - 1e-12, `monotonic at ${s}`); prev = t; }
    const tilt = (s: number) => s * landExag(s * s);
    assert.ok(tilt(0.02) < 0.06, `a 2% slope tilts only ${tilt(0.02).toFixed(3)}`); assert.ok(tilt(0.06) > 0.2 && tilt(0.06) < 0.35, `6%: ${tilt(0.06).toFixed(3)}`);
    assert.ok(tilt(0.1) > 0.5 && tilt(0.1) < 0.7, `10%: ${tilt(0.1).toFixed(3)}`); assert.ok(tilt(0.2) > 1.1 && tilt(0.2) > 1.8 * tilt(0.1), `20% is about twice 10%: ${tilt(0.2).toFixed(3)}`);
    // the player's gain is the opposite on this range: strong from 3% and the same from 4% to 10% (the cause of the blotches)
    const player = (s: number) => s * lightExag(s * s);
    assert.ok(player(0.1) / player(0.04) < 1.1, 'the gentle-ground gain is flat from 4 to 10%'); assert.ok(tilt(0.1) / tilt(0.04) > 4, 'the land\'s grows fourfold');
    assert.ok(tilt(0.02) < 0.2 * player(0.02), 'a gentle land slope is a fifth of what the player\'s own roll gets');
    assert.equal(landExag(0), LAND_EXAG * LAND_FLOOR); assert.equal(landExag(LAND_KNEE ** 2), LAND_EXAG); assert.equal(landExag(0.5 ** 2), LAND_EXAG);
    // the land's amplitude is a modest boost over the player's (a steep flank has room to show), never the 2x of the slider's top
    assert.ok(LAND_GAIN > 1 && LAND_GAIN <= 1.5, `the land's light is ${LAND_GAIN} times the player's`);
  });

  it('gentle ground on the land is calm and a hill\'s flank reads: a 3% slope lights and shades a third as much as before, a 10% and a 15% slope half as much again or more', () => {
    const g3f = lightOf(0.03, true), g3a = lightOf(0.03, false);
    assert.ok(g3f.neu.lift < 0.45 * g3f.old.lift, `3% facing the sun: lift ${g3f.neu.lift.toFixed(3)} against ${g3f.old.lift.toFixed(3)} before`);
    assert.ok(g3a.neu.dark < 0.4 * g3a.old.dark, `3% facing away: dark ${g3a.neu.dark.toFixed(3)} against ${g3a.old.dark.toFixed(3)} before`);
    const h10f = lightOf(0.1, true), h10a = lightOf(0.1, false), h15a = lightOf(0.15, false);
    assert.ok(h10f.neu.lift > 1.4 * h10f.old.lift, `10% facing the sun: lift ${h10f.neu.lift.toFixed(3)} against ${h10f.old.lift.toFixed(3)} before`);
    assert.ok(h10a.neu.dark > 1.5 * h10a.old.dark, `10% facing away: dark ${h10a.neu.dark.toFixed(3)} against ${h10a.old.dark.toFixed(3)} before`);
    assert.ok(h15a.neu.dark > h10a.neu.dark, 'and a steeper flank is darker still');
    // the contrast between a hill's flank and gentle ground beside it: 3% to 10% was a 1.1 times the light before, and is now a threefold
    assert.ok(h10f.old.lift / g3f.old.lift < 1.2, 'before: the 10% slope lit about the same as the 3% one'); assert.ok(h10f.neu.lift / g3f.neu.lift > 3, `now: ${(h10f.neu.lift / g3f.neu.lift).toFixed(1)} times`);
    assert.ok(h10a.neu.dark / g3a.neu.dark > 5, `shade: ${(h10a.neu.dark / g3a.neu.dark).toFixed(1)} times`);
    // the light rises with the slope on both sides, step by step
    const lifts = [0.03, 0.06, 0.1].map(s => lightOf(s, true).neu.lift), darks = [0.03, 0.06, 0.1, 0.15].map(s => lightOf(s, false).neu.dark);
    assert.ok(lifts[0]! < lifts[1]! && lifts[1]! < lifts[2]!, `lift ${lifts.map(v => v.toFixed(2))}`); assert.ok(darks.every((v, i) => i === 0 || v > darks[i - 1]!), `dark ${darks.map(v => v.toFixed(2))}`);
    // and the highlight only starts on a real flank (no sparkle on a 3% slope)
    assert.equal(g3f.neu.spec, 0, 'no highlight on a gentle slope'); assert.ok(h10f.neu.spec > 0.5, `a lit 10% flank has the highlight (${h10f.neu.spec.toFixed(2)})`);
  });

  it('a hill in the land: lit on its sunward flank, shaded on the far one, the top and the flat ground round it untouched', () => {
    const hill = (x: number, y: number) => { const d = Math.hypot(x - 500, y - 500); return d >= 160 ? 0 : 30 * (0.5 + 0.5 * Math.cos(Math.PI * d / 160)); }; // 30 m over 320 m: flanks of up to 15%
    const flat = field(() => 0), g = heightLightGrid(flat, box(500, 500, 200), 1, layer(hill, 500, 500, 180))!;
    const at = (d: number) => sampleHeightLight(g, 500 + SUN_TILE_DIR.x * d, 500 + SUN_TILE_DIR.y * d);
    const lit = at(80), away = at(-80), top = at(0), out = at(190);
    assert.ok(lit.lift > 0.8 && lit.dark === 0, `the sunward flank is lit (lift ${lit.lift.toFixed(2)})`); assert.ok(away.dark > 0.5 && away.lift === 0, `the far flank is shaded (dark ${away.dark.toFixed(2)})`);
    assert.ok(top.dark < 0.15 * away.dark && top.lift < 0.15 * lit.lift, `the top is near flat light (dark ${top.dark.toFixed(3)}, lift ${top.lift.toFixed(3)})`);
    assert.equal(out.dark + out.lift + out.spec, 0, 'the plain beyond the hill is untouched');
  });
});

describe('the land layer and the course height together (T388)', () => {
  it('a game with no land lights every number as before: no layer, a null layer and a layer of nothing give the same light', () => {
    const mound = (x: number, y: number) => { const d = Math.hypot(x - 500, y - 500); return d >= 12 ? 0 : 1.5 * (0.5 + 0.5 * Math.cos(Math.PI * d / 12)); }, h = field(mound), b = box(500, 500, 30);
    const none = heightLightGrid(h, b, 2)!, nul = heightLightGrid(h, b, 2, null)!, zero = heightLightGrid(h, b, 2, layer(() => 0, 500, 500, 60))!;
    assert.deepEqual(Array.from(nul.v), Array.from(none.v), 'a null layer is no layer');
    // (a layer's rect widens the grid the light is laid on: the same points, read at the same places)
    let seen = 0; for (let y = 475; y <= 525; y += 0.7) for (let x = 475; x <= 525; x += 0.7) {
      const a = sampleHeightLight(none, x, y), z = sampleHeightLight(zero, x, y); seen += a.dark + a.lift;
      for (const k of ['dark', 'lift', 'spec', 'cast', 'ao'] as const) assert.ok(Math.abs(a[k] - z[k]) < 1e-9, `${k} at ${x},${y}: ${a[k]} vs ${z[k]} (a land of nothing lights the mound as no land does: the gentle-ground gain, the same shade)`);
    }
    assert.ok(seen > 5, 'and the mound is lit');
    // a layer out of reach of the box changes nothing either (and is not read)
    const far = heightLightGrid(h, b, 2, layer(plane(0.1, true), 100, 100, 30))!; assert.deepEqual(Array.from(far.v), Array.from(none.v));
    // a layer under flat ground with nothing in reach lights nothing: null, as for no height
    assert.equal(heightLightGrid(field(() => 0), box(500, 500, 30), 2, layer(() => 0, 500, 500, 60)), null);
  });

  it('the player\'s own layer on the land keeps the gentle-ground gain: a green\'s 1.5% tilt over level land is lit as it is over no land, and on a hillside the two tilts add', () => {
    const tilt = plane(0.015, true), level = layer(() => 0, 500, 500, 60), withLand = heightLightGrid(field(tilt), box(500, 500, 10), 2, level)!, without = heightLightGrid(field(tilt), box(500, 500, 10), 2)!;
    const a = sampleHeightLight(withLand, 500, 500), b = sampleHeightLight(without, 500, 500);
    assert.ok(a.lift > 0.2 && Math.abs(a.lift - b.lift) < 1e-6 && Math.abs(a.dark - b.dark) < 1e-6, `a green's tilt: lift ${a.lift.toFixed(3)} on land, ${b.lift.toFixed(3)} without`);
    // a hillside facing away with the same tilt facing the sun laid by the player: the lit tilt eats into the shade (the sum of the two tilts)
    const hillside = layer(plane(0.1, false), 500, 500, 60), shaded = heightLightGrid(field(() => 0), box(500, 500, 10), 2, hillside)!, both = heightLightGrid(field(plane(0.03, true)), box(500, 500, 10), 2, hillside)!;
    assert.ok(sampleHeightLight(both, 500, 500).dark < sampleHeightLight(shaded, 500, 500).dark, 'the player\'s tilt toward the sun lightens the hillside\'s shade');
  });

  it('the old light is still there (the gear menu\'s Real ground hill light off): the land and the course height lit as one summed field, as before T388', () => {
    const hill = (x: number, y: number) => { const d = Math.hypot(x - 500, y - 500); return d >= 120 ? 0 : 40 * (0.5 + 0.5 * Math.cos(Math.PI * d / 120)); }, bump = (x: number, y: number) => { const d = Math.hypot(x - 520, y - 500); return d >= 12 ? 0 : 1.5 * (0.5 + 0.5 * Math.cos(Math.PI * d / 12)); };
    const sum = heightLightGrid(field((x, y) => hill(x, y) + bump(x, y)), box(500, 500, 100), 1)!, split = heightLightGrid(field(bump), box(500, 500, 100), 1, layer(hill, 500, 500, 130), true)!, neu = heightLightGrid(field(bump), box(500, 500, 100), 1, layer(hill, 500, 500, 130))!;
    let worst = 0, diff = 0;
    for (let y = 410; y <= 590; y += 3) for (let x = 410; x <= 590; x += 3) {
      const a = sampleHeightLight(sum, x, y), b = sampleHeightLight(split, x, y), c = sampleHeightLight(neu, x, y);
      for (const k of ['dark', 'lift', 'spec'] as const) { worst = Math.max(worst, Math.abs(a[k] - b[k])); diff = Math.max(diff, Math.abs(a[k] - c[k])); }
    }
    assert.ok(worst < 2e-3, `the classic light is the old one (worst difference ${worst})`); assert.ok(diff > 0.2, `and the new light is not (${diff.toFixed(2)})`);
  });

  it('two chunks that meet sample the same light along their seam, with a land layer under both', () => {
    const hill = (x: number, y: number) => { const d = Math.hypot(x - 500, y - 500); return d >= 120 ? 0 : 40 * (0.5 + 0.5 * Math.cos(Math.PI * d / 120)); }, f = field(() => 0), land = layer(hill, 500, 500, 130);
    const left = heightLightGrid(f, [440, 440, 500, 560], 2, land)!, right = heightLightGrid(f, [500, 440, 560, 560], 2, land)!;
    for (let y = 450; y < 550; y += 0.37) for (const x of [499.8, 500, 500.2]) { const a = sampleHeightLight(left, x, y), b = sampleHeightLight(right, x, y); for (const k of ['dark', 'lift', 'spec', 'cast', 'ao'] as const) assert.ok(Math.abs(a[k] - b[k]) < 1e-6, `${k} at ${x},${y}: ${a[k]} vs ${b[k]}`); }
  });

  it('the land layer\'s cubic is the field\'s: the same heights where it has samples, nothing outside its rect (the map\'s edge holds)', () => {
    const fn = (x: number, y: number) => 12 * Math.sin(x / 40) + 7 * Math.cos(y / 55), f = field(fn), land = layer(fn, 500, 500, 80);
    for (const [x, y] of [[500, 500], [483.3, 517.9], [470.6, 489.2]] as const) assert.ok(Math.abs(splineLand(land, x, y) - splineHeight(f, x, y)) < 1e-4, `at ${x},${y}`);
    assert.equal(splineLand(land, 300, 300), 0); assert.equal(splineLand(land, 700, 500), 0);
    // at the map's edge the rect's samples are held like the field's (a land clipped by the map has its border at the edge)
    const edge = layer(() => 5, 12, 100, 12), nearEdge = splineLand(edge, 0.5, 100); assert.ok(Math.abs(nearEdge - 5) < 1e-6, `held at the edge (${nearEdge})`);
  });
});

describe('the land as the workers are given it (T388)', () => {
  const patchOf = (fn: (u: number, v: number) => number): LandField => {
    const f = createLandField(), data = new Float32Array(CH_SIZE * CH_SIZE);
    for (let j = 100; j < 160; j++) for (let i = 120; i < 200; i++) data[j * CH_SIZE + i] = fn(i, j);
    f.data = data; f.rev = 1; f.box = [240, 200, 400, 320]; return f;
  };
  it('is the box of everything that is not 0 with a sample to spare, copied; none with no land; the same object until the land changes', () => {
    assert.equal(landLightRect(createLandField()), null);
    const f = patchOf((i, j) => 1 + ((i * 7 + j * 13) % 5)), r = landLightRect(f)!;
    assert.deepEqual([r.i0, r.j0, r.w, r.h], [119, 99, 82, 62]); assert.equal(r.data.length, 82 * 62);
    for (const [i, j] of [[120, 100], [199, 159], [150, 130]] as const) assert.equal(r.data[(j - r.j0) * r.w + (i - r.i0)], f.data![j * CH_SIZE + i]);
    assert.equal(r.data[0], 0, 'the spare sample is 0'); assert.notEqual(r.data.buffer, f.data!.buffer, 'a copy: the workers get their own');
    assert.equal(landLightRect(f), r, 'asked again: the same');
    f.data![130 * CH_SIZE + 150] = 99; f.rev++; const r2 = landLightRect(f)!; assert.notEqual(r2, r); assert.equal(r2.data[(130 - r2.j0) * r2.w + (150 - r2.i0)], 99, 'a changed land is read again');
    clearLandIn(f, [0, 0, CH_SIZE * CH_STEP, CH_SIZE * CH_STEP]); assert.equal(landLightRect(f), null, 'a land cleared away is none');
  });
});

describe('the skirt (T388)', () => {
  const grid = (fn: (x: number, y: number) => number): HeightGrid => { const w = 301, h = 301, m = new Float32Array(w * h); for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) m[j * w + i] = fn(-1200 + i * 8, 1200 - j * 8); return { x0: -1200, y0: 1200, step: 8, w, h, m }; };
  const spec = (): OsmCourseSpec => ({
    id: 'synth', name: 'Synth', credit: OSM_CREDIT, licence: '', source: '', place: '', scale: 1, derived: false, w: 100, h: 80, originM: [-100, 80], holes: [], areas: [], warnings: [], fills: [], otherCourses: [], course: null, parTotal: 4, gameParTotal: 4, lengthM: 300, counts: {},
  });
  const at = { x: 400, y: 400 };
  it('is 640 m long over data that goes 400 m: a download fetches no more tiles than before, and the climb back to the plain is gentler', () => {
    assert.equal(SKIRT_T, 320); assert.equal(WINDOW_T, 200); assert.ok(SKIRT_T > WINDOW_T);
    assert.deepEqual(landWindow(spec()).map(Math.round), [-100 - 400, 80 - 160 - 400, 100 + 400, 80 + 400], 'the window the data covers is the land and 400 m, as before');
    // a valley beyond the land's northern edge: the real ground falls 30 m below the land's level within 240 m of it and stays down: the skirt has to climb all of it back to the plain
    const smooth = (t: number) => { const c = Math.min(1, Math.max(0, t)); return c * c * (3 - 2 * c); };
    const valley = (_x: number, y: number) => (y <= 80 ? 100 : 100 - 30 * smooth((y - 80) / 120));
    const land = { grid: grid(valley), src: 't', label: 't', credit: 't', fetched: '' };
    /** the steepest slope (m per m) of the northern skirt beyond the real descent: only the fade's climb is left there */
    const steepest = (p: ReturnType<typeof layLand>) => {
      const f = createLandField(); addLandPatch(f, p, { src: 't', label: 't', credit: 't', fetched: '', reliefM: 0 }); let worst = 0;
      for (let j = p.j0 + 1; j < p.j0 + p.h - 1; j++) for (let i = p.i0 + 1; i < p.i0 + p.w - 1; i++) { const v = (j + 0.5) * CH_STEP - at.y; if (v > -70) continue; worst = Math.max(worst, Math.abs(f.data![(j + 1) * CH_SIZE + i]! - f.data![(j - 1) * CH_SIZE + i]!) / 8); }
      return worst;
    };
    const old = steepest(layLand(spec(), land, at, { skirtT: 200 })), now = steepest(layLand(spec(), land, at));
    assert.ok(old > 0.09 && old < 0.13, `a skirt of 200 tiles climbs back at ${(old * 100).toFixed(1)}%`); assert.ok(now < 0.7 * old, `the longer skirt's climb is ${(now * 100).toFixed(1)}%`);
    // it still ends at exactly 0, and the land's own heights are the same
    const f = createLandField(), p = layLand(spec(), land, at); addLandPatch(f, p, { src: 't', label: 't', credit: 't', fetched: '', reliefM: 0 });
    assert.equal(f.data![(Math.floor((at.y - SKIRT_T) / CH_STEP) - 1) * CH_SIZE + Math.floor((at.x + 50) / CH_STEP)], 0, 'nothing beyond the skirt');
    const g = createLandField(), q = layLand(spec(), land, at, { skirtT: 200 }); addLandPatch(g, q, { src: 't', label: 't', credit: 't', fetched: '', reliefM: 0 });
    const k = Math.floor((at.y + 40) / CH_STEP) * CH_SIZE + Math.floor((at.x + 50) / CH_STEP); assert.ok(Math.abs(f.data![k]! - g.data![k]!) < 1e-6, 'inside the land the heights are the same whatever the skirt');
  });
});

describe('the plumbing, and the way back (T388)', () => {
  const read = (p: string) => readFileSync(resolve(p), 'utf8');
  it('the engine hands the cache the land field at both places it hands the workers the heights; the cache sends the land layer when it changed, before the course; the worker and the painter light it', () => {
    const eng = read('src/game/engine.ts'), cache = read('src/game/ground-cache.ts'), worker = read('src/game/ground.worker.ts'), painter = read('src/game/renderer.ts'), protocol = read('src/game/ground-protocol.ts');
    assert.equal((eng.match(/this\.ground\.courseHeight\(this\.courseHeight\.data, [^)]*, this\.realLand\)/g) ?? []).length, 2, 'the changed box and the whole map after a load');
    assert.ok(!/this\.ground\.courseHeight\([^)]*this\.realLand\.data/.test(eng), 'no sum of the two is built any more');
    assert.ok(/courseHeight\(field: Float32Array, b: \[number, number, number, number\], land: LandField \| null = null\)/.test(cache) && /this\.syncLand\(land\);[\s\S]*groundRect\(field, null, b\)[\s\S]*t: 'course'/.test(cache), 'the land layer first, then the course height alone');
    assert.ok(/landLightRect\(f\)/.test(cache) && /this\.landSent\.rev === rev/.test(cache), 'sent when the field or its rev changed, not for every brush stroke');
    assert.ok(/case 'land': painter\.setLand\(m\.rect\)/.test(worker) && /case 'landLight': painter\.landClassic = m\.classic/.test(worker), 'the worker takes both messages');
    assert.ok(/t: 'land'; rect: LightLand \| null/.test(protocol) && /t: 'landLight'; classic: boolean/.test(protocol));
    assert.equal((painter.match(/heightLightGrid\(this\.courseH, box, [^)]*this\.landL, this\.landClassic\)/g) ?? []).length, 2, 'the chunk bake and the planner map light the land layer');
    assert.ok(/setLand\(rect: LightLand \| null\) \{ this\.landL = rect; this\.courseAny \|\|= !!rect; \}/.test(painter), 'a land alone is height to light');
  });
  it('the old light is an option: the gear menu\'s Real ground hill light (only with land), kept across reloads, ?landlight=classic on the dev server', () => {
    const eng = read('src/game/engine.ts'), app = read('src/App.tsx'), cache = read('src/game/ground-cache.ts');
    assert.ok(/capitalempire\.landLight/.test(eng) && /get\('landlight'\)/.test(eng) && /setLandClassic\(v: boolean\)/.test(eng) && /this\.ground\.setLandClassic\(v\)/.test(eng));
    assert.ok(/game\.landInfo\(\) && \(\s*<label[^>]*data-testid="land-light"[\s\S]*checked=\{!game\.landClassic\}[\s\S]*game\.setLandClassic\(!e\.target\.checked\)/.test(app), 'the checkbox is there with land, on by default');
    assert.ok(/setLandClassic\(v: boolean\) \{ if \(v === this\.landClassic\) return;[\s\S]*t: 'landLight'[\s\S]*this\.invalidateAll\(\)/.test(cache) && /t: 'landLight', classic: this\.landClassic/.test(cache), 'the workers switch and bake again, and a new worker starts with it');
  });
});
