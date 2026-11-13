// T452 (docs/CINDERLINKS-PORT.md; the owner, 2026-11-13, on their desert course: "All this needs to feel like the same course you built when you play").
// A painted hole with every surface kind goes out as the game sends it (export3p.ts exportCourse3p, entry3p.ts courseEntry3p, the host's lies from
// lies3p.ts) and into the built view (packages/cinderlinks, through its harness's --mats): every surface comes out as that surface in the desert and in
// the parkland, waste as waste (not a bunker), the course's own rough as grass (the desert's sand only off the course), no hillside, wood floor, rock or
// cliff of the view's own on the course, and the heights as built: the fairway's slope, the raised tee and the raised green (no 1.3x lift).
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import type { AimPoint, CourseArea, GolfSurface, Pin, TeeMark } from '../src/game/golf/types';
import { deriveHoles, surfaceAt } from '../src/game/golf/holes';
import { EXPORT_KIND, exportCourse3p, frame3p, tileBox, toMetres, type Export3pInput } from '../src/game/golf/play/export3p';
import { ENTRY_KIND, courseEntry3p } from '../src/game/golf/play/entry3p';
import { makeCourseView } from '../src/game/golf/play/courseview';
import { lieGrid3p } from '../src/game/golf/play/lies3p';

let nextId = 1;
const rect = (surface: GolfSurface, x0: number, y0: number, x1: number, y1: number): CourseArea => ({ id: nextId++, surface, pts: [x0, y0, x1, y0, x1, y1, x0, y1] });
const disc = (surface: GolfSurface, cx: number, cy: number, r: number, n = 32): CourseArea => ({
  id: nextId++, surface, pts: Array.from({ length: n }, (_, k) => [cx + r * Math.cos((2 * Math.PI * k) / n), cy + r * Math.sin((2 * Math.PI * k) / n)]).flat(),
});
const sstep = (a: number, b: number, v: number) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

/** one hole running north (tiles; y grows south): the tee at the bottom, the green at the top, the fairway between with its first cut, fescue and long
 *  grass in the corners, a waste area beside the fairway, a pond and a bunker; all on rough */
const AREAS: CourseArea[] = [
  rect('rough', 0, 0, 120, 260),
  rect('fescue', 4, 170, 24, 230), rect('longGrass', 96, 170, 116, 230),
  rect('firstCut', 38, 60, 82, 222), rect('fairway', 45, 60, 75, 220),
  rect('waste', 86, 90, 108, 150),
  disc('water', 18, 110, 9),
  disc('fringe', 60, 38, 12), disc('green', 60, 38, 9), disc('bunker', 78, 26, 4),
  rect('tee', 54, 228, 66, 240),
];
const TEES: TeeMark[] = [{ hole: 1, kind: 'back', x: 60, y: 236 }], PINS: Pin[] = [{ hole: 1, x: 60, y: 38 }], AIMS: AimPoint[] = [];
/** the ground as built (tiles in, metres out): rising 3 in 100 toward the green, the tee raised 1.5 m on banks 6 m wide, the green 1 m */
const heightAt = (x: number, y: number) => 0.03 * (240 - y) * 2
  + 1.5 * (1 - sstep(0, 3, Math.max(54 - x, x - 66, 228 - y, y - 240)))
  + 1.0 * (1 - sstep(12, 15, Math.hypot(x - 60, y - 38)));
/** a point of each kind, in tiles, and what the view must make of it */
const PROBES: { kind: string; at: [number, number]; want: string[] }[] = [
  { kind: 'tee', at: [60, 234], want: ['M_TEE'] },
  { kind: 'fairway', at: [60, 140], want: ['M_FAIR'] },
  { kind: 'fringe', at: [60, 48.5], want: ['M_FAIR'] },
  { kind: 'first cut', at: [41.5, 140], want: ['M_CUT'] },
  { kind: 'green', at: [60, 38], want: ['M_GREEN'] },
  { kind: 'rough', at: [16, 60], want: ['M_ROUGH'] },
  { kind: 'long grass', at: [106, 200], want: ['M_DEEP'] },
  { kind: 'fescue', at: [14, 200], want: ['M_DEEP'] },
  { kind: 'bunker', at: [78, 26], want: ['M_SAND'] },
  { kind: 'waste', at: [97, 120], want: ['M_WASTE'] },
  { kind: 'water', at: [18, 110], want: ['M_WATER'] },
];
const OFF: [number, number] = [134, 130];   // (28 m east of the painted course, inside the land its heights cover)

const ROOT = process.cwd(), OUT = path.join(ROOT, 'output', 't452-view');
type Mats = { loaded: boolean; why?: string; biome: string; names: Record<string, number>; mats: number[]; h: number[] };
let inp: Export3pInput, toView: (x: number, y: number) => [number, number], msgOf: (biome: string) => Record<string, unknown>;

function view(biome: string, probes: [number, number][]): Mats {
  const req = path.join(OUT, `req-${biome}.json`);
  fs.writeFileSync(req, JSON.stringify({ msg: msgOf(biome), probes: probes.map(([x, y]) => toView(x, y)) }));
  const r = spawnSync(process.execPath, [path.join(ROOT, 'packages', 'cinderlinks', 'harness.mjs'), path.join(OUT, 'game.js'), '--mats', req], { encoding: 'utf8', maxBuffer: 1 << 26 });
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout.trim().split('\n').pop()!) as Mats;
  assert.ok(out.loaded, `the view loads the course: ${out.why}`);
  return out;
}
const name = (m: Mats, code: number) => Object.entries(m.names).find(([, v]) => v === code)?.[0] ?? String(code);

describe('T452 the view is the course you built', () => {
  before(async () => {
    inp = { areas: AREAS, tees: TEES, pins: PINS, aims: AIMS, heightAt, name: 'Desert test', id: 't452' };
    const f = frame3p(inp), file = await exportCourse3p(inp), entry = await courseEntry3p(file);
    const b = tileBox(inp)!, holes = deriveHoles(AREAS, TEES, PINS, AIMS);
    entry.lk = lieGrid3p(makeCourseView(holes, (x, y) => surfaceAt(AREAS, x, y)), [b[0] - 40, b[1] - 40, b[2] + 40, b[3] + 40], { x: f.cx, y: f.cy });
    toView = (x, y) => { const [X, Y] = toMetres(f, x, y); return [X, -Y]; };
    msgOf = (biome) => ({ v: 1, t: 'course', course: entry, features: null, biome, type: 'public', seed: 4242, scale: 1, hole: 1 });
    fs.mkdirSync(OUT, { recursive: true });
    const r = spawnSync(process.execPath, [path.join(ROOT, 'packages', 'cinderlinks', 'build.mjs'), '--out', OUT], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr || r.stdout);
  });

  it('every painted surface goes out as its own kind, waste as waste', async () => {
    const file = await exportCourse3p(inp), kinds = Object.keys(file.features);
    for (const k of ['rough', 'fairway', 'green', 'tee', 'bunker', 'water', 'waste']) assert.ok(kinds.includes(k), `${k} exported`);
    assert.equal(EXPORT_KIND.waste, 'waste');
    const entry = await courseEntry3p(file);
    for (const key of ['T', 'F', 'G', 'B', 'W', 'R', 'X'] as const) assert.ok(entry.polys[key].length > 0, `entry shape ${key}`);
    assert.equal(ENTRY_KIND.rough, 'R'); assert.equal(ENTRY_KIND.waste, 'X');
  });

  for (const biome of ['desert', 'parkland']) {
    it(`each surface comes out as that surface in the view (${biome})`, () => {
      const m = view(biome, [...PROBES.map(p => p.at), OFF]);
      assert.equal(m.biome, biome);
      PROBES.forEach((p, k) => assert.ok(p.want.includes(name(m, m.mats[k]!)), `${p.kind}: the view made ${name(m, m.mats[k]!)}`));
      const off = name(m, m.mats[PROBES.length]!);
      if (biome === 'desert') assert.equal(off, 'M_DUNE', 'the desert\'s sand lies round the course');
      else assert.ok(['M_ROUGH', 'M_DEEP', 'M_FOREST'].includes(off), `off the course in the parkland: ${off}`);
    });
  }

  it('no ground of the view\'s own on the course, and the desert\'s rough is grass', () => {
    const pts: [number, number][] = [];
    for (let y = 4; y <= 256; y += 6) for (let x = 3; x <= 117; x += 6) pts.push([x, y]);
    const m = view('desert', pts), bad = new Set(['M_HILL', 'M_FOREST', 'M_DUNE', 'M_ROCK', 'M_CLIFF']);
    const wrong = pts.map((p, k) => [p, name(m, m.mats[k]!)] as const).filter(([, n]) => bad.has(n));
    assert.deepEqual(wrong, [], 'a painted point drawn as the view\'s own ground');
  });

  it('the heights as built: the fairway\'s slope, the raised tee and the raised green', () => {
    const at: [number, number][] = [[60, 200], [60, 80], [60, 234], [60, 214], [60, 38], [60, 62]], m = view('desert', at);
    const d = (a: number, b: number) => m.h[a]! - m.h[b]!, want = (a: number, b: number) => heightAt(...at[a]!) - heightAt(...at[b]!);
    assert.ok(Math.abs(d(1, 0) - want(1, 0)) < 0.25, `the fairway rises ${d(1, 0).toFixed(2)} m (built: ${want(1, 0).toFixed(2)})`);
    assert.ok(Math.abs(d(2, 3) - want(2, 3)) < 0.2, `the tee stands ${d(2, 3).toFixed(2)} m over the fairway (built: ${want(2, 3).toFixed(2)})`);
    assert.ok(Math.abs(d(4, 5) - want(4, 5)) < 0.25, `the green stands ${d(4, 5).toFixed(2)} m over the fairway below it (built: ${want(4, 5).toFixed(2)})`);
  });
});
