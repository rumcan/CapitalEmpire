// T438 (docs/CINDERLINKS-PORT.md): the course export's time, headless, for `npm run cinder:bench`. What the engine does when the view opens a hole
// (engine.ts course3pMsg): exportCourse3p (outlines, holes, the packed heights), courseEntry3p (the entry the view reads) and lieGrid3p (the model's lies
// over the course and 40 tiles round it). Two courses: Woodhill imported as the game imports it, and a painted 18-hole course. The game's ground is
// stood in for by a smooth height function and its lie lookup by a tile raster made before the clock starts (the game's own is a raster too).
// Prints one JSON line. The features (features3p.ts) need the game's town and are measured in the browser only.
import woodhillJson from '../../src/game/golf/osm/data/woodhill.json';
import { osmCourseToSpec } from '../../src/game/golf/osm/convert';
import { specMarkers } from '../../src/game/golf/osm/raster';
import { inRing } from '../../src/game/golf/osm/geom';
import type { OsmCourseJson } from '../../src/game/golf/osm/types';
import type { AimPoint, CourseArea, GolfSurface, Pin, TeeMark } from '../../src/game/golf/types';
import { exportCourse3p, frame3p, tileBox, type Export3pInput } from '../../src/game/golf/play/export3p';
import { courseEntry3p } from '../../src/game/golf/play/entry3p';
import { lieGrid3p } from '../../src/game/golf/play/lies3p';
import type { Lie } from '../../src/game/golf/play';

const ground = (x: number, y: number) => 3 * Math.sin(x / 37) + 2 * Math.cos(y / 53) + 0.01 * x;
const LIE: Partial<Record<GolfSurface, Lie>> = { green: 'green', fringe: 'fairway', tee: 'tee', fairway: 'fairway', bunker: 'bunker', waste: 'bunker', water: 'water' };

/** the areas' lies on a tile raster (later areas over earlier, as painted), looked up as the game's raster is */
function lieRaster(inp: Export3pInput, box: [number, number, number, number]): (x: number, y: number) => Lie {
  const x0 = Math.floor(box[0]), y0 = Math.floor(box[1]), w = Math.ceil(box[2]) - x0 + 1, h = Math.ceil(box[3]) - y0 + 1, g = new Uint8Array(w * h);
  const ids: Lie[] = ['rough'];
  for (const a of inp.areas) {
    const lie = LIE[a.surface] ?? 'rough'; let id = ids.indexOf(lie); if (id < 0) { id = ids.length; ids.push(lie); }
    const p = a.pts, poly: [number, number][] = []; for (let k = 0; k < p.length; k += 2) poly.push([p[k]!, p[k + 1]!]);
    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity; for (const [x, y] of poly) { bx0 = Math.min(bx0, x); by0 = Math.min(by0, y); bx1 = Math.max(bx1, x); by1 = Math.max(by1, y); }
    for (let y = Math.max(y0, Math.floor(by0)); y <= Math.min(y0 + h - 1, Math.ceil(by1)); y++) for (let x = Math.max(x0, Math.floor(bx0)); x <= Math.min(x0 + w - 1, Math.ceil(bx1)); x++)
      if (inRing(poly, x + 0.5, y + 0.5)) g[(y - y0) * w + (x - x0)] = id;
  }
  return (x, y) => { const i = Math.floor(x) - x0, j = Math.floor(y) - y0; return i >= 0 && j >= 0 && i < w && j < h ? ids[g[j * w + i]!]! : 'rough'; };
}

function woodhill(): Export3pInput {
  const spec = osmCourseToSpec(woodhillJson as unknown as OsmCourseJson, { id: 'woodhill' });
  const areas: CourseArea[] = spec.areas.filter(a => !a.clip).map((a, k) => ({ id: k + 1, surface: a.surf, pts: a.rings[0]! }));
  return { areas, ...specMarkers(spec, 0, 0), heightAt: ground, name: 'Woodhill', date: '2026-11-13' };
}

/** eighteen painted holes in three rows of six, 150 to 260 m: a tee, a fairway with a bend, a green, two bunkers, a pond on every third, on rough */
function painted(): Export3pInput {
  let id = 1;
  const rect = (surface: GolfSurface, x0: number, y0: number, x1: number, y1: number): CourseArea => ({ id: id++, surface, pts: [x0, y0, x1, y0, x1, y1, x0, y1] });
  const disc = (surface: GolfSurface, cx: number, cy: number, rx: number, ry = rx, n = 28): CourseArea => ({ id: id++, surface,
    pts: Array.from({ length: n }, (_, k) => [cx + rx * Math.cos((2 * Math.PI * k) / n) * (1 + 0.12 * Math.sin(3 * k)), cy + ry * Math.sin((2 * Math.PI * k) / n) * (1 + 0.1 * Math.cos(2 * k))]).flat() });
  const areas: CourseArea[] = [rect('rough', 0, 0, 6 * 70 + 40, 3 * 160 + 40)], tees: TeeMark[] = [], pins: Pin[] = [], aims: AimPoint[] = [];
  for (let n = 1; n <= 18; n++) {
    const col = (n - 1) % 6, row = Math.floor((n - 1) / 6), x = 40 + col * 70, teeY = 30 + row * 160 + 150, len = 75 + ((n * 37) % 55), gy = teeY - len, bend = ((n % 3) - 1) * 10;
    areas.push(disc('fairway', x + bend / 2, (teeY + gy) / 2, 14, len / 2 - 8, 40));
    if (n % 3 === 0) areas.push(disc('water', x + bend, gy + len * 0.45, 6, 5));
    areas.push(rect('tee', x - 5, teeY - 6, x + 5, teeY + 6), disc('green', x + bend, gy, 11, 9), disc('bunker', x + bend + 14, gy + 3, 4, 3), disc('bunker', x + bend - 13, gy - 4, 3));
    tees.push({ hole: n, kind: 'back', x, y: teeY + 3 }, { hole: n, kind: 'middle', x, y: teeY - 3 });
    pins.push({ hole: n, x: x + bend, y: gy }); aims.push({ hole: n, x: x + bend / 2, y: (teeY + gy) / 2, order: 1 });
  }
  return { areas, tees, pins, aims, heightAt: ground, name: 'Painted 18', date: '2026-11-13' };
}

async function time(inp: Export3pInput, runs: number) {
  const b = tileBox(inp)!, box: [number, number, number, number] = [b[0] - 40, b[1] - 40, b[2] + 40, b[3] + 40], lieAt = lieRaster(inp, box), f = frame3p(inp);
  const ms: number[] = [];
  let parts = { exportMs: 0, entryMs: 0, liesMs: 0 };
  for (let k = 0; k < runs; k++) {
    const t0 = performance.now(), file = await exportCourse3p(inp, { deflate: false }), t1 = performance.now(), entry = await courseEntry3p(file), t2 = performance.now();
    entry.lk = lieGrid3p({ lieAt }, box, { x: f.cx, y: f.cy }); const t3 = performance.now();
    ms.push(t3 - t0); if (k === runs - 1) parts = { exportMs: +(t1 - t0).toFixed(1), entryMs: +(t2 - t1).toFixed(1), liesMs: +(t3 - t2).toFixed(1) };
  }
  const sorted = [...ms].sort((a, c) => a - c);
  return { firstMs: +ms[0]!.toFixed(1), medianMs: +sorted[Math.floor(sorted.length / 2)]!.toFixed(1), ...parts, areas: inp.areas.length };
}

const out = { woodhill: await time(woodhill(), 5), painted: await time(painted(), 5) };
console.log(JSON.stringify(out));
