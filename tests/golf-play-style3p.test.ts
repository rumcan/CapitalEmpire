// T447 (docs/CINDERLINKS-PORT.md; the owner, 2026-11-13: "these settings need to be applied based on what your Capital Empire course looks like ... simple grass
// is the only option"). The rules that read the view's biome and course type from the course (src/game/golf/play/look3p.ts biomeFor3p, courseTypeFor3p), the
// ground they read (export3p.ts groundOf3p), what Woodhill and a plain painted course get, and the view's side (packages/cinderlinks parts 09-hud and 08-render):
// in host mode the menu is the render distance alone and M and V do nothing; the simple grass is always on, with no box.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import woodhillJson from '../src/game/golf/osm/data/woodhill.json';
import { osmCourseToSpec } from '../src/game/golf/osm/convert';
import { specMarkers } from '../src/game/golf/osm/raster';
import type { OsmCourseJson } from '../src/game/golf/osm/types';
import type { CourseArea, GolfSurface } from '../src/game/golf/types';
import { exportCourse3p, groundOf3p, type CourseFile } from '../src/game/golf/play/export3p';
import {
  BIOMES_3P, COURSE_TYPES_3P, DESERT_SAND, KEPT_CONDITION, SHIPPED_LAT, TOUR_TIER, biomeFor3p, courseTypeFor3p, type Ground3p,
} from '../src/game/golf/play/look3p';

const part = (f: string) => fs.readFileSync(`${process.cwd()}/packages/cinderlinks/parts/${f}`, 'utf8');
const inland: Ground3p = { paintedM2: 500_000, sand: 0.03, water: 0.02, coast: false, treesPerHa: 4 };
const B = (o: Partial<Parameters<typeof biomeFor3p>[0]> = {}) => biomeFor3p({ desert: false, month: 6, lat: null, ground: inland, ...o });
const T = (o: Partial<Parameters<typeof courseTypeFor3p>[0]> = {}) => courseTypeFor3p({ tournament: false, condition: 90, tier: 1, members: 0, biome: 'parkland', ground: inland, ...o });

let nextId = 1;
const rect = (surface: GolfSurface, x0: number, y0: number, x1: number, y1: number): CourseArea => ({ id: nextId++, surface, pts: [x0, y0, x1, y0, x1, y1, x0, y1] });

describe('T447 the biome from the course', () => {
  it('reads the rules top down', () => {
    assert.equal(B(), 'parkland', 'the home map in summer');
    assert.equal(B({ month: 0 }), 'snow', 'the home map in January');
    assert.equal(B({ desert: true, month: 0 }), 'desert', 'the Desert theme wins');
    assert.equal(B({ lat: 64 }), 'snow', 'far north');
    assert.equal(B({ lat: 45, month: 0 }), 'parkland', 'a real course is not under the home map\'s snow');
    assert.equal(B({ ground: { ...inland, sand: DESERT_SAND } }), 'desert', 'a course of sand');
    assert.equal(B({ ground: { ...inland, coast: true, sand: 0.08 } }), 'beachside');
    assert.equal(B({ ground: { ...inland, coast: true } }), 'coastal');
    assert.equal(B({ lat: 4 }), 'jungle');
    assert.equal(B({ lat: SHIPPED_LAT.woodhill }), 'savanna', 'Pretoria');
    assert.equal(B({ lat: SHIPPED_LAT.rondebosch }), 'parkland', 'Cape Town');
    // every biome it gives is one the view grows
    for (const b of ['parkland', 'snow', 'desert', 'beachside', 'coastal', 'jungle', 'savanna']) assert.ok(BIOMES_3P.some(x => x[0] === b));
  });
});

describe('T447 the course type from the club', () => {
  it('reads the rules top down', () => {
    assert.equal(T(), 'public', 'no members yet');
    assert.equal(T({ members: 120 }), 'private', "a members' club, well kept");
    assert.equal(T({ members: 120, condition: KEPT_CONDITION - 1 }), 'public', 'a neglected club');
    assert.equal(T({ tier: TOUR_TIER, members: 300 }), 'tour', 'a tour venue');
    assert.equal(T({ tier: TOUR_TIER, condition: 50 }), 'public', 'a tour venue let go');
    assert.equal(T({ tournament: true, condition: 10 }), 'tour', 'a tournament today');
    const links = { biome: 'coastal' as const, ground: { ...inland, coast: true, sand: 0.05, treesPerHa: 0.2 } };
    assert.equal(T(links), 'links', 'by the sea, treeless and sandy');
    assert.equal(T({ ...links, ground: { ...links.ground, treesPerHa: 5 } }), 'public', 'a wooded course by the sea is no links');
    assert.equal(T({ ...links, tournament: true }), 'tour');
    for (const t of ['public', 'private', 'tour', 'links']) assert.ok(COURSE_TYPES_3P.some(x => x[0] === t));
  });
});

describe('T447 the ground and two real cases', () => {
  it('measures sand, water and a shore', async () => {
    // a course of rough with a bunker, and a lake along its whole east side
    const areas = [rect('rough', 0, 0, 300, 300), rect('bunker', 50, 50, 80, 80), rect('water', 240, 0, 300, 300)];
    const g = groundOf3p(await exportCourse3p({ areas, tees: [], pins: [], aims: [] }), 9);
    assert.ok(g.coast, 'the lake reaches the edge');
    assert.ok(Math.abs(g.sand - 900 / 90000) < 0.003, `sand ${g.sand}`);
    assert.ok(Math.abs(g.water - 0.2) < 0.01, `water ${g.water}`);
    assert.ok(Math.abs(g.treesPerHa - 9 / 36) < 0.01, `${g.treesPerHa} trees a hectare`);
    // a pond in the middle is no shore
    const pond = groundOf3p(await exportCourse3p({ areas: [rect('rough', 0, 0, 300, 300), rect('water', 120, 120, 180, 180)], tees: [], pins: [], aims: [] }));
    assert.equal(pond.coast, false);
    assert.deepEqual(groundOf3p({ features: {} } as CourseFile), { paintedM2: 0, sand: 0, water: 0, coast: false, treesPerHa: 0 });
  });

  it('Woodhill plays as savanna; a plain painted course on the home map as parkland', async () => {
    const src = woodhillJson as unknown as OsmCourseJson, spec = osmCourseToSpec(src, { id: 'woodhill' });
    const areas: CourseArea[] = spec.areas.filter(a => !a.clip).map((a, k) => ({ id: k + 1, surface: a.surf, pts: a.rings[0]! }));
    const g = groundOf3p(await exportCourse3p({ areas, ...specMarkers(spec, 0, 0) }));
    assert.equal(g.coast, false); assert.ok(g.sand < DESERT_SAND);
    const biome = biomeFor3p({ desert: false, month: 6, lat: SHIPPED_LAT.woodhill, ground: g });
    assert.equal(biome, 'savanna');
    assert.equal(courseTypeFor3p({ tournament: false, condition: 100, tier: 1, members: 0, biome, ground: g }), 'public');
    assert.equal(courseTypeFor3p({ tournament: false, condition: 100, tier: 1, members: 200, biome, ground: g }), 'private');
    const plain = groundOf3p(await exportCourse3p({ areas: [rect('rough', 0, 0, 200, 200), rect('fairway', 80, 20, 120, 180), rect('bunker', 70, 30, 78, 38)], tees: [], pins: [], aims: [] }));
    assert.equal(biomeFor3p({ desert: false, month: 6, lat: null, ground: plain }), 'parkland');
  });
});

describe('T447 the view', () => {
  it('in host mode the menu is the render distance alone, and M and V choose nothing', () => {
    const hud = part('09-hud.md');
    assert.match(hud, /styleMenu\.innerHTML = \(HOST \? '' : col\('Biome'/);
    assert.match(hud, /e\.code === 'KeyM' && !HOST/);
    assert.match(hud, /e\.code === 'KeyV' && !HOST/);
    assert.ok(!hud.includes('detailed ground reaches farther'), 'the help text drops the detailed ground');
  });
  it('the simple grass is the only grass: no box, no saved choice', () => {
    const hud = part('09-hud.md'), render = part('08-render.md');
    assert.ok(!hud.includes('simpleG') && !hud.includes('Simple grass everywhere'));
    assert.ok(!hud.includes("'cinderlinks.simple'") && !render.includes('function setSimple'));
    assert.match(render, /const SIMPLEG = true;/);
  });
});
