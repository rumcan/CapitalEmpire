// T357 (#999): the real ground height under a map-data course: the terrarium tiles' decoding, the sampling's alignment with the map and the hole lines, the
// smoothing, the packing, the credits, the land laid under a course (its skirt, its level greens, tees and ponds, its scale), the greens' designed tilt, the land
// plus the course height, the save, and the browser's tile fetch (every request a fake: nothing here touches a server). Pure: no DOM.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import rondeboschJson from '../src/game/golf/osm/data/rondebosch.json';
import magnoliaJson from '../src/game/golf/osm/data/magnolia-national.json';
import woodhillJson from '../src/game/golf/osm/data/woodhill.json';
import { OSM_COURSES, loadOsmLand, specOf } from '../src/game/golf/osm';
import { OSM_CREDIT, type OsmCourseJson, type OsmCourseSpec, type SpecArea } from '../src/game/golf/osm/types';
import { planOsmGame } from '../src/game/golf/osm/start';
import {
  DEM_CREDIT_DEFAULT, DEM_TILES_CREDIT, MissingTile, EARTH_R, cropGrid, decimateGrid, decodePng, decodeTile, demSourceOf, demTileUrl, gridRange, heightAtM, latLonOf, packGrid, packStepOf, sampleTiles, smoothGrid,
  tileText, tileXY, tilesFor, unpackGrid, type DemTiles, type HeightGrid,
} from '../src/game/golf/osm/terrarium';
import {
  GREEN_TILT, PAD, SKIRT_T, addLandPatch, createLandField, designGreens, greenTilts, groundAt, groundField, groundRect, landAt, landOfHeight, landRelief, landWindow, layLand, packLand, specToMetres, unpackLand,
  type LandField, type LandPatch,
} from '../src/game/golf/osm/land';
import { DEM_GAP_MS, DemUnavailable, fetchLand, tilesKept, tilesOfCourse } from '../src/game/golf/osm/dem';
import { Cancelled, MemoryAnswerCache, ServerBusy, type Net } from '../src/game/golf/osm/polite';
import { CH_SIZE, CH_STEP, courseSlopeAt, createCourseHeightField } from '../src/game/ext/course-height';
import { slopeAt, slopeLines } from '../src/game/golf/play/lies';
import { normalizeGolfSave } from '../src/game/golf/mode';
import { holeTerrain } from '../src/game/golf/hole-terrain';
import { generateOldNine } from '../src/game/golf/coursegen';
import { buildCourseStatsPanel } from '../src/game/golf/coursestats';
import type { Need } from '../src/game/golf/tour';
import { MAP } from '../src/game/iso';

const ronde = rondeboschJson as unknown as OsmCourseJson, magnolia = magnoliaJson as unknown as OsmCourseJson, woodhill = woodhillJson as unknown as OsmCourseJson;

// ------------------------------------------------------------------------------------------------------------------------ a PNG encoder for the tests
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b: Uint8Array): number => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 255]! ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length), dv = new DataView(out.buffer);
  dv.setUint32(0, data.length); for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i); out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}
/** a terrarium PNG whose pixel (px, py) holds height h(px, py) metres (RGB, 8 bit), every row written with PNG filter `filter` (0 none, 1 sub, 2 up, 3 average, 4 paeth) */
function pngOf(h: (px: number, py: number) => number, filter: 0 | 1 | 2 | 3 | 4 = 0, size = 256): Uint8Array {
  const stride = size * 3, px = new Uint8Array(stride * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const v = h(x, y) + 32768, r = Math.floor(v / 256), g = Math.floor(v) % 256, b = Math.floor((v - Math.floor(v)) * 256);
    px[y * stride + x * 3] = r; px[y * stride + x * 3 + 1] = g; px[y * stride + x * 3 + 2] = b;
  }
  const raw = new Uint8Array((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = filter;
    for (let x = 0; x < stride; x++) {
      const a = x >= 3 ? px[y * stride + x - 3]! : 0, b = y > 0 ? px[(y - 1) * stride + x]! : 0, c = x >= 3 && y > 0 ? px[(y - 1) * stride + x - 3]! : 0, v = px[y * stride + x]!;
      let p = 0;
      if (filter === 1) p = a; else if (filter === 2) p = b; else if (filter === 3) p = (a + b) >> 1;
      else if (filter === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); p = pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      raw[y * (stride + 1) + 1 + x] = (v - p) & 255;
    }
  }
  const ihdr = new Uint8Array(13), dv = new DataView(ihdr.buffer); dv.setUint32(0, size); dv.setUint32(4, size); ihdr[8] = 8; ihdr[9] = 2;
  const parts = [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', new Uint8Array(zlib.deflateSync(raw))), chunk('IEND', new Uint8Array(0))];
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

// ------------------------------------------------------------------------------------------------------------------------ synthetic grids and courses
/** a grid of an analytic field over a metres box (x0, y0 the north-west sample; y north) */
function gridOfFn(f: (x: number, y: number) => number, x0 = -1200, y0 = 1200, step = 8, w = 301, h = 301): HeightGrid {
  const m = new Float32Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) m[j * w + i] = f(x0 + i * step, y0 - j * step);
  return { x0, y0, step, w, h, m };
}
const at = { x: 400, y: 400 };
/** a small course: its land 100 x 80 tiles (200 x 160 m) about the stage-1 frame's origin, one hole with a green, a tee and a pond */
function synth(over: Partial<OsmCourseSpec> = {}, areas: SpecArea[] = []): OsmCourseSpec {
  return {
    id: 'synth', name: 'Synth', credit: OSM_CREDIT, licence: '', source: '', place: '', scale: 1, derived: false, w: 100, h: 80, originM: [-100, 80],
    holes: [{ n: 1, ref: 1, tagPar: 4, par: 4, gamePar: 4, lengthM: 300, handicap: null, tees: [{ kind: 'middle', x: 14, y: 60 }], pin: { x: 46, y: 36 }, aims: [{ x: 30, y: 55 }], line: [14, 60, 30, 55, 46, 36], made: [] }],
    areas, warnings: [], fills: [], otherCourses: [], course: null, parTotal: 4, gameParTotal: 4, lengthM: 300, counts: {}, ...over,
  };
}
const GREEN: SpecArea = { surf: 'green', hole: 1, rings: [[40, 30, 52, 30, 52, 42, 40, 42]] };
const TEE: SpecArea = { surf: 'tee', hole: 1, rings: [[10, 56, 18, 56, 18, 64, 10, 64]] };
const POND: SpecArea = { surf: 'water', hole: 0, rings: [[60, 10, 80, 10, 80, 24, 60, 24]] };
/** a hill: 40 m up in the middle, and a 2% rise to the east */
const hill = (x: number, y: number): number => 100 + 40 * Math.exp(-(x * x + y * y) / (2 * 150 * 150)) + 0.02 * x;
const fieldOf = (p: LandPatch): LandField => { const f = createLandField(); addLandPatch(f, p, { src: 't', label: 't', credit: 't', fetched: '', reliefM: 0 }); return f; };

describe('the terrarium tiles (T357)', () => {
  it('decode: R*256 + G + B/256 - 32768 metres, through every PNG row filter', async () => {
    const h = (px: number, py: number) => (px === 0 && py === 0 ? 0 : px === 1 && py === 0 ? 517.5 : px === 2 && py === 0 ? -33.25 : 1400 + px * 0.5 - py * 0.25);
    for (const f of [0, 1, 2, 3, 4] as const) {
      const t = await decodeTile(pngOf(h, f));
      assert.equal(t.w, 256); assert.equal(t.h, 256);
      assert.equal(t.m[0], 0, `filter ${f}: R128 G0 B0 is sea level`);
      assert.equal(t.m[1], 517.5, `filter ${f}`);
      assert.equal(t.m[2], -33.25, `filter ${f}: below sea level`);
      assert.equal(t.m[5 * 256 + 200], 1400 + 100 - 1.25, `filter ${f}: a pixel further in`);
    }
  });
  it('a PNG that is not 8-bit RGB, or is not a PNG, is refused with a word, never read wrongly', async () => {
    await assert.rejects(() => decodePng(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9])), /not a PNG/);
    const good = pngOf(() => 100); good[24] = 16; // the bit depth byte of IHDR
    await assert.rejects(() => decodePng(good), /does not take/);
  });
  it('tile maths: Woodhill is in the tile the stage-1 sketch cached, and a window names the tiles it needs', () => {
    const c = { lat: -25.8161713, lon: 28.3150504 }, t = tileXY(c.lat, c.lon, 15);
    assert.equal(Math.floor(t.x), 18961); assert.equal(Math.floor(t.y), 18817);
    assert.equal(demTileUrl(15, 18961, 18817), 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/15/18961/18817.png');
    const keys = tilesFor(c, [-100, -100, 100, 100]);
    assert.deepEqual(keys.map(tileText), ['15/18961/18817']);
    const wide = tilesFor(c, [-1138, -767, 1138, 767]).map(tileText);
    assert.ok(wide.includes('15/18960/18816') && wide.includes('15/18962/18818') && wide.length === 9, wide.join(' '));
    const p = latLonOf(c, 0, 0); assert.equal(p.lat, c.lat); assert.equal(p.lon, c.lon);
    assert.ok(Math.abs(latLonOf(c, 0, 1000).lat - c.lat - (1000 / EARTH_R) * (180 / Math.PI)) < 1e-12);
  });
  it('sampling: north is up, east is right, and a metre is a metre (a tilted plane is read at its true slope)', async () => {
    const c = { lat: -25.8161713, lon: 28.3150504 }, tiles: DemTiles = new Map();
    for (let ty = 18816; ty <= 18818; ty++) for (let tx = 18960; tx <= 18962; tx++) tiles.set(`15/${tx}/${ty}`, await decodeTile(pngOf((px, py) => 1000 + 0.05 * ((tx - 18961) * 256 + px) - 0.08 * ((ty - 18817) * 256 + py))));
    const g = sampleTiles(tiles, c, [-300, -300, 300, 300], 10);
    const mpp = (2 * Math.PI * EARTH_R * Math.cos(c.lat * Math.PI / 180)) / (2 ** 15 * 256); // metres a pixel on the ground
    const at0 = heightAtM(g, 0, 0), east = heightAtM(g, 100, 0) - at0, north = heightAtM(g, 0, 100) - at0;
    assert.ok(Math.abs(east - 0.05 * (100 / mpp)) < 0.02, `100 m east rises ${east.toFixed(3)}, wanted ${(0.05 * 100 / mpp).toFixed(3)}`);
    assert.ok(Math.abs(north - 0.08 * (100 / mpp)) < 0.03, `100 m north rises ${north.toFixed(3)}, wanted ${(0.08 * 100 / mpp).toFixed(3)} (the image's rows run south)`);
    assert.ok(north > 0 && east > 0);
    const missing = new Map(tiles); missing.delete('15/18961/18817');
    assert.throws(() => sampleTiles(missing, c, [-300, -300, 300, 300], 10), (e: unknown) => e instanceof MissingTile && e.key.x === 18961 && e.key.y === 18817);
  });
});

describe('the smoothing and the packing (T357)', () => {
  it('a Gaussian of 25 m takes the 60 m diagonal ripple out and keeps an 800 m landform', () => {
    const ripple = (x: number, y: number) => 3 * Math.sin((2 * Math.PI * (x + y)) / (60 * Math.SQRT2)), land = (x: number) => 50 * Math.sin((2 * Math.PI * x) / 800);
    const rip = smoothGrid(gridOfFn(ripple, -800, 800, 4, 401, 401), 25), form = smoothGrid(gridOfFn(land, -800, 800, 4, 401, 401), 25);
    // measured in the middle (the edges are held: 3 sigma of margin is the caller's)
    let r = 0, e = 0;
    for (let j = 150; j < 250; j += 5) for (let i = 150; i < 250; i += 5) { r = Math.max(r, Math.abs(rip.m[j * rip.w + i]!)); e = Math.max(e, Math.abs(form.m[j * form.w + i]! - land(form.x0 + i * 4) * 0.98)); }
    assert.ok(r < 0.3, `the ripple (3 m) is left at ${r.toFixed(3)} m: under a tenth`);
    assert.ok(e < 0.5, `the 800 m landform keeps 98% of its height (off by ${e.toFixed(3)} m of 50)`);
  });
  it('a sigma of 0 leaves the grid as it is; cropping, decimating and reading keep the lattice (a point is where it was)', () => {
    const g = gridOfFn((x, y) => 100 + 0.1 * x - 0.05 * y, -100, 100, 4, 51, 51), same = smoothGrid(g, 0);
    assert.deepEqual(Array.from(same.m), Array.from(g.m));
    const c = cropGrid(g, [-40, -40, 40, 40]); assert.equal(c.x0, -40); assert.equal(c.y0, 40); assert.equal(c.w, 21); assert.equal(heightAtM(c, 0, 0), heightAtM(g, 0, 0));
    const d = decimateGrid(g, 3); assert.equal(d.step, 12); assert.equal(d.m[0], g.m[0]); assert.ok(Math.abs(heightAtM(d, 24, -12) - (100 + 2.4 + 0.6)) < 1e-4, 'a plane is exact through the cubic');
    assert.ok(Math.abs(heightAtM(g, 13.7, -6.1) - (100 + 1.37 + 0.305)) < 1e-4, 'and between the samples');
    const r = gridRange(g); assert.ok(r.min < r.p5 && r.p5 < r.p95 && r.p95 < r.max);
  });
  it('a packed grid comes back within half a unit, and a smooth one packs under a quarter of its 16-bit size', async () => {
    const g = gridOfFn((x, y) => 1400 + 40 * Math.exp(-(x * x + y * y) / (2 * 250 * 250)) + 0.01 * x + 0.003 * y, -1000, 1000, 16, 126, 126);
    const p = await packGrid(g), u = await unpackGrid(p);
    assert.equal(p.w, 126); assert.equal(p.step, 16); assert.equal(p.q, 0.01);
    let err = 0; for (let k = 0; k < g.m.length; k++) err = Math.max(err, Math.abs(u.m[k]! - g.m[k]!));
    assert.ok(err <= 0.0051, `max error ${err}`);
    assert.ok(p.d.length * 0.75 < g.m.length * 2 * 0.25, `${(p.d.length * 0.75).toFixed(0)} bytes for ${g.m.length * 2}`);
    // 2 cm units, and a range over 655 m takes a coarser unit
    const coarse = await packGrid(g, 0.02); assert.equal(coarse.q, 0.02);
    const tall = gridOfFn((x) => x * 2, -1000, 1000, 16, 126, 126), pt = await packGrid(tall), ut = await unpackGrid(pt);
    assert.ok(pt.q > 0.01); let e2 = 0; for (let k = 0; k < tall.m.length; k++) e2 = Math.max(e2, Math.abs(ut.m[k]! - tall.m[k]!)); assert.ok(e2 <= pt.q / 2 + 1e-3, `${e2} vs ${pt.q}`);
    await assert.rejects(() => unpackGrid({ ...p, w: 5 }), /wrong size/);
    await assert.rejects(() => unpackGrid({ ...p, v: 2 as 1 }), /not a height pack/);
  });
  it('the lattice step follows the smoothing: 16 m for SRTM, 8 m for 3DEP, never under 8 or over 48', () => {
    assert.equal(packStepOf(25), 16); assert.equal(packStepOf(8), 8); assert.equal(packStepOf(5), 8); assert.equal(packStepOf(60), 40); assert.equal(packStepOf(500), 48);
  });
});

describe('the credits (T357)', () => {
  it('a tile names its imagery, and the coarsest source sets the smoothing and the credit', () => {
    assert.equal(demSourceOf('srtm/S26E028.tif').label, 'SRTM, 30 m');
    assert.equal(demSourceOf('ned13/imgn34w083_13.tif').label, 'USGS 3DEP, 10 m');
    assert.equal(demSourceOf('ned13/a.tif, srtm/b.tif').id, 'srtm', 'mixed: the coarser rules');
    assert.equal(demSourceOf(null).id, 'dem'); assert.equal(demSourceOf('something/new.tif').id, 'dem');
    assert.match(demSourceOf('srtm/x.tif').credit, /SRTM terrain data courtesy of the U\.S\. Geological Survey/);
    assert.equal(DEM_CREDIT_DEFAULT, demSourceOf('srtm/x.tif').credit); assert.match(DEM_TILES_CREDIT, /Tilezen/);
    assert.match(demSourceOf('ea/lidar.tif').credit, /Environment Agency/);
  });
});

describe('the shipped fixtures carry their ground (T357)', () => {
  it('each has a height pack with its source, smoothed and kept at the step the source needs, a few tens of kB', async () => {
    for (const c of OSM_COURSES) {
      const j = (await c.load()), h = j.height!;
      assert.ok(h, `${c.id} has a height`);
      assert.equal(h.label, c.ground, `${c.id}: the card's label is the fixture's`);
      assert.equal(h.step, packStepOf(h.sigma)); assert.equal(h.z, 15); assert.match(h.credit, /Geological Survey/);
      assert.ok(h.d.length < 80_000, `${c.id}: ${h.d.length} chars`);
      const g = await unpackGrid(h), r = gridRange(g);
      assert.ok(r.max - r.min > 15 && r.max - r.min < 150, `${c.id}: ${(r.max - r.min).toFixed(1)} m of relief`);
    }
    assert.equal(woodhill.height!.src, 'srtm'); assert.equal(magnolia.height!.src, 'ned'); assert.equal(ronde.height!.src, 'srtm');
  });
  it('loadOsmLand unpacks the shipped ground once and kept; null for a course the game does not ship', async () => {
    const a = await loadOsmLand('woodhill'), b = await loadOsmLand('woodhill');
    assert.ok(a && a === b, 'the same object twice');
    assert.equal(await loadOsmLand('nope'), null);
    const w = await landOfHeight(woodhill.height!);
    assert.equal(w.label, 'SRTM, 30 m'); assert.equal(w.src, 'srtm'); assert.equal(w.grid.step, 16); assert.equal(w.fetched, '2026-11-08'); assert.match(w.credit, /Geological Survey/);
    assert.deepEqual(Array.from(w.grid.m.slice(0, 50)), Array.from(a!.grid.m.slice(0, 50)), 'the same grid the loader gives');
  });
  it('the fixtures still read as before (the height rides along: the converter never looks at it)', () => {
    for (const j of [ronde, magnolia, woodhill]) assert.ok(j.height && j.features && j.meta?.credit === OSM_CREDIT);
  });
});

describe('the land laid under a course (T357)', () => {
  it('is the ground relative to its own mean, in true proportion inside the land, and nothing at all beyond the skirt', () => {
    const spec = synth(), grid = gridOfFn(hill), p = layLand(spec, { grid, src: 't', label: 't', credit: 't', fetched: '' }, at), f = fieldOf(p);
    // two points inside the land differ by the real ground's difference (the baseline cancels)
    for (const [a, b] of [[[420, 420], [480, 440]], [[410, 480], [470, 410]]] as const) {
      const [ax, ay] = specToMetres(spec, a[0] - at.x, a[1] - at.y), [bx, by] = specToMetres(spec, b[0] - at.x, b[1] - at.y);
      assert.ok(Math.abs(landAt(f, a[0], a[1]) - landAt(f, b[0], b[1]) - (heightAtM(grid, ax, ay) - heightAtM(grid, bx, by))) < 0.05);
    }
    // the land's own mean is the plain's level: the samples under the land average 0
    let sum = 0, n = 0; const d = f.data!;
    for (let j = p.j0; j < p.j0 + p.h; j++) for (let i = p.i0; i < p.i0 + p.w; i++) { const u = (i + 0.5) * CH_STEP - at.x, v = (j + 0.5) * CH_STEP - at.y; if (u >= 0 && u <= spec.w && v >= 0 && v <= spec.h) { sum += d[j * CH_SIZE + i]!; n++; } }
    assert.ok(n > 1000 && Math.abs(sum / n) < 0.01, `the land averages ${(sum / n).toFixed(4)} m over ${n} samples`);
    // beyond the skirt (200 tiles past the land) the field is exactly zero
    assert.equal(landAt(f, at.x - SKIRT_T - 4, at.y + 40), 0); assert.equal(landAt(f, at.x + 100 + SKIRT_T + 4, at.y + 40), 0); assert.equal(landAt(f, at.x + 50, at.y - SKIRT_T - 6), 0);
    // across the land's edge the slope goes on (no line in the light where the land ends): the slope out from the edge, read 4 to 8 tiles inside and 4 to 8 tiles
    // outside, differs by a few per cent where the hill itself is 14% steep
    const out = (x: number, y: number, ox: number, oy: number, a: number, b: number) => (landAt(f, x + ox * b, y + oy * b) - landAt(f, x + ox * a, y + oy * a)) / ((b - a) * 2);
    for (const [x, y, ox, oy] of [[at.x, at.y + 40, -1, 0], [at.x + 100, at.y + 40, 1, 0], [at.x + 50, at.y, 0, -1], [at.x + 50, at.y + 80, 0, 1]] as const) {
      const inS = out(x, y, ox, oy, -8, -4), outS = out(x, y, ox, oy, 4, 8);
      assert.ok(Math.abs(inS - outS) < 0.03 && Math.abs(inS) > Math.abs(inS - outS), `the slope out from (${x - at.x}, ${y - at.y}) is ${inS.toFixed(4)} inside and ${outS.toFixed(4)} outside`);
    }
    // no cliff anywhere (the skirt included): the step between two neighbouring samples stays under the steepest of the data itself (the hill is 16% at its flank, 2% more
    // from the rise east: 4 m of 18%, with a little to spare)
    let worst = 0;
    for (let j = p.j0; j < p.j0 + p.h; j++) for (let i = p.i0; i < p.i0 + p.w - 1; i++) worst = Math.max(worst, Math.abs(d[j * CH_SIZE + i + 1]! - d[j * CH_SIZE + i]!));
    assert.ok(worst < 4 * 0.2, `the steepest step between two samples is ${worst.toFixed(3)} m`);
    assert.ok(landRelief(f) > 15 && f.base !== 0 && f.box![0] === p.i0 * CH_STEP, `relief ${landRelief(f).toFixed(1)} m, base ${f.base.toFixed(1)}`);
  });
  it('a course scaled down has its heights scaled with it, so a slope reads as it does on the real hill', () => {
    const grid = gridOfFn(hill), one = layLand(synth(), { grid, src: 't', label: 't', credit: 't', fetched: '' }, at);
    const half = layLand(synth({ scale: 0.5, w: 50, h: 40, originM: [-50, 40] }), { grid, src: 't', label: 't', credit: 't', fetched: '' }, at);
    // the half-size land covers half the ground at half the heights: a slope (m per m) is the same
    const f1 = fieldOf(one), f2 = fieldOf(half), s1 = (landAt(f1, at.x + 60, at.y + 40) - landAt(f1, at.x + 40, at.y + 40)) / 40, s2 = (landAt(f2, at.x + 30, at.y + 20) - landAt(f2, at.x + 20, at.y + 20)) / 20;
    assert.ok(Math.abs(s1 - s2) / Math.abs(s1) < 0.08, `${s1.toFixed(4)} vs ${s2.toFixed(4)}`);
  });
  it('lays greens, tees and ponds level (the mean under them, the edge feathered into the slope), and leaves the rest of the ground alone', () => {
    const grid = gridOfFn(hill), land = { grid, src: 't', label: 't', credit: 't', fetched: '' };
    const bare = fieldOf(layLand(synth(), land, at)), spec = synth({}, [POND, TEE, GREEN]), lay = layLand(spec, land, at), f = fieldOf(lay);
    for (const [name, a, pad] of [['green', GREEN, PAD.green.pad], ['tee', TEE, PAD.tee.pad], ['pond', POND, PAD.water.pad]] as const) {
      const r = a.rings[0]!, vals: number[] = [];
      for (let y = Math.min(r[1]!, r[5]!) - 3; y <= Math.max(r[1]!, r[5]!) + 3; y += 1) for (let x = Math.min(r[0]!, r[2]!) - 3; x <= Math.max(r[0]!, r[2]!) + 3; x += 1) {
        const inside = x >= r[0]! && x <= r[2]! && y >= r[1]! && y <= r[5]!;
        if (inside) vals.push(landAt(f, x + at.x, y + at.y));
      }
      assert.ok(Math.max(...vals) - Math.min(...vals) < 0.002, `the ${name} is level (${(Math.max(...vals) - Math.min(...vals)).toFixed(4)} m)`);
      assert.ok(pad >= 0);
    }
    // the green's pad reaches its edge and more: 3 tiles past the polygon the ground is the pad's too, and 12 tiles out it is the slope again
    const g0 = landAt(f, 46 + at.x, 36 + at.y), gPad = landAt(f, 55 + at.x, 36 + at.y), gOut = landAt(f, 66 + at.x, 36 + at.y);
    assert.ok(Math.abs(g0 - gPad) < 0.01, 'the pad reaches 3 tiles past the green');
    assert.ok(Math.abs(gOut - landAt(bare, 66 + at.x, 36 + at.y)) < 0.02, 'far from every feature the ground is the bare land');
    assert.ok(Math.abs(landAt(f, 20 + at.x, 20 + at.y) - landAt(bare, 20 + at.x, 20 + at.y)) < 1e-6, 'and untouched');
  });
  it('is the same twice, and a turned spec can say where its tiles read the ground (the frame hook)', () => {
    const grid = gridOfFn(hill), land = { grid, src: 't', label: 't', credit: 't', fetched: '' }, spec = synth({}, [GREEN]);
    const a = layLand(spec, land, at), b = layLand(spec, land, at);
    assert.deepEqual(Array.from(a.data), Array.from(b.data)); assert.equal(a.base, b.base);
    // a frame that reads 100 m further east gives the ground there
    const shifted = layLand(spec, land, at, { frame: (u, v) => { const [x, y] = specToMetres(spec, u, v); return [x + 100, y]; } });
    assert.notDeepEqual(Array.from(shifted.data), Array.from(a.data));
    assert.deepEqual(landWindow(spec).map(Math.round), [-100 - 400, 80 - 160 - 400, 100 + 400, 80 + 400]);
    assert.equal(layLand(synth({ w: 10, h: 10 }), land, { x: 5000, y: 5000 }).w, 0, 'a land off the map lays nothing');
  });
  it('Woodhill: the NE hill is under holes 5 and 6, and the land has the real relief at the map\'s scale', async () => {
    const land = (await loadOsmLand('woodhill'))!, spec = specOf(woodhill, { id: 'woodhill', name: 'Woodhill', place: '' }), plan = planOsmGame(spec)!;
    const f = fieldOf(layLand(spec, land, plan.at)), A = plan.at;
    // the highest ground of the land is in its north-east, within 300 m of the tee of hole 5 or hole 6
    let best = { v: -Infinity, x: 0, y: 0 };
    for (let y = A.y; y < A.y + spec.h; y += 4) for (let x = A.x; x < A.x + spec.w; x += 4) { const v = landAt(f, x, y); if (v > best.v) best = { v, x, y }; }
    assert.ok(best.x - A.x > spec.w / 2 && best.y - A.y < spec.h / 2, `the high point is at ${best.x - A.x}, ${best.y - A.y} of ${spec.w} x ${spec.h}: north east`);
    const tee = (n: number) => { const h = spec.holes.find(q => q.n === n)!, t = h.tees.find(q => q.kind === 'middle') ?? h.tees[0]!; return { x: t.x + A.x, y: t.y + A.y }; };
    const near = (n: number) => Math.hypot(tee(n).x - best.x, tee(n).y - best.y) * 2;
    assert.ok(Math.min(near(5), near(6)) < 300, `the high point is ${near(5).toFixed(0)} m from hole 5's tee and ${near(6).toFixed(0)} m from hole 6's`);
    const h6 = spec.holes.find(q => q.n === 6)!;
    assert.ok(landAt(f, tee(6).x, tee(6).y) - landAt(f, h6.pin.x + A.x, h6.pin.y + A.y) > 15, 'hole 6 runs down the hill');
    assert.ok(landAt(f, tee(5).x, tee(5).y) > 0.55 * best.v, 'the tee of hole 5 is high up it');
    // the real relief: 74 m between the lowest and highest sample of the land (90% scale: the data's 91 m with the skirt's fall)
    assert.ok(landRelief(f) > 60 && landRelief(f) < 95, `${landRelief(f).toFixed(1)} m`);
    assert.ok(f.base > 1400 && f.base < 1520, `the baseline is the real elevation, ${f.base.toFixed(0)} m`);
  });
  it('Rondebosch is nearly flat by the river and rises to the south west; Magnolia falls 20 m on its 18th', async () => {
    const lr = (await loadOsmLand('rondebosch'))!, sr = specOf(ronde, { id: 'rondebosch', name: 'R', place: '' }), pr = planOsmGame(sr)!, fr = fieldOf(layLand(sr, lr, pr.at));
    assert.ok(landRelief(fr) > 18 && landRelief(fr) < 40, `${landRelief(fr).toFixed(1)} m`);
    const sw = landAt(fr, pr.at.x + 60, pr.at.y + sr.h - 60), ne = landAt(fr, pr.at.x + sr.w - 60, pr.at.y + 60);
    assert.ok(sw > ne + 5, `south west ${sw.toFixed(1)} m is above north east ${ne.toFixed(1)} m`);
    const lm = (await loadOsmLand('magnolia-national'))!, sm = specOf(magnolia, { id: 'magnolia-national', name: 'M', place: '' }), pm = planOsmGame(sm)!, fm = fieldOf(layLand(sm, lm, pm.at));
    const h18 = sm.holes.find(q => q.n === 18)!, t18 = h18.tees.find(q => q.kind === 'middle') ?? h18.tees[0]!;
    assert.ok(landAt(fm, h18.pin.x + pm.at.x, h18.pin.y + pm.at.y) - landAt(fm, t18.x + pm.at.x, t18.y + pm.at.y) > 12, 'hole 18 climbs to the clubhouse');
  });
});

describe('the greens keep the game\'s own gentle tilt (T357)', () => {
  const grid = gridOfFn(hill), land = { grid, src: 't', label: 't', credit: 't', fetched: '' };
  it('is 1 to 2%, front low and back high along the approach, level across it, seeded by the course and the hole', () => {
    const spec = synth({}, [GREEN]), [t] = greenTilts(spec);
    assert.ok(t && t.tilt >= GREEN_TILT.min && t.tilt <= GREEN_TILT.max, `${t?.tilt}`);
    assert.deepEqual(greenTilts(spec), greenTilts(synth({}, [GREEN])), 'the same twice');
    assert.notEqual(greenTilts(synth({ id: 'other' }, [GREEN]))[0]!.tilt, t!.tilt, 'another course tilts its green differently');
    const field = createCourseHeightField(), box = designGreens(spec, at, field);
    assert.ok(box && field.rev === 1);
    // the plane through the middle: back minus front along (ux, uy) is the tilt over the distance
    const cx = at.x + t!.cx, cy = at.y + t!.cy, d = 4, sample = (x: number, y: number) => groundAt(createLandField(), field, x, y);
    const back = sample(cx + t!.ux * d, cy + t!.uy * d), front = sample(cx - t!.ux * d, cy - t!.uy * d), across = sample(cx - t!.uy * d, cy + t!.ux * d) - sample(cx + t!.uy * d, cy - t!.ux * d);
    assert.ok(back > front, 'back is higher than front');
    assert.ok(Math.abs((back - front) / (2 * d * 2) - t!.tilt) < 0.1 * t!.tilt + 0.002, `the rise is ${((back - front) / 16).toFixed(4)} m per m, tilt ${t!.tilt.toFixed(4)}`);
    assert.ok(Math.abs(across) < 0.02, `level across (${across.toFixed(3)} m)`);
    // the approach comes from the last aim point (30, 55) to the green's middle (46, 36): it climbs toward the north east (x up, y down the screen: y smaller)
    assert.ok(t!.ux > 0 && t!.uy < 0);
  });
  it('a green no hole plays to has none, a double green is tilted for its first hole only, and the tilt stays within the course height\'s 3 m', () => {
    assert.equal(greenTilts(synth({}, [{ ...GREEN, hole: 0 }])).length, 0);
    assert.equal(greenTilts(synth({}, [GREEN, { ...GREEN, rings: [[60, 30, 72, 30, 72, 42, 60, 42]] }])).length, 1);
    const f = createCourseHeightField(); designGreens(synth({}, [GREEN]), at, f);
    assert.ok(f.data.every(v => Math.abs(v) < 0.5));
  });
  it('on a laid course the green reads only that tilt: the land is level under it, so the ball and the break see 1 to 2%', () => {
    const spec = synth({}, [GREEN]), f = fieldOf(layLand(spec, land, at)), course = createCourseHeightField(); designGreens(spec, at, course);
    const t = greenTilts(spec)[0]!, c = { x: at.x + t.cx, y: at.y + t.cy };
    const slope = (x: number, y: number) => { const e = 2, gx = (groundAt(f, course, x + e, y) - groundAt(f, course, x - e, y)) / (2 * e * 2), gy = (groundAt(f, course, x, y + e) - groundAt(f, course, x, y - e)) / (2 * e * 2); return Math.hypot(gx, gy); };
    for (const [dx, dy] of [[0, 0], [3, 0], [-3, 2], [2, -3], [-4, -4]]) { const s = slope(c.x + dx, c.y + dy); assert.ok(s > 0.005 && s < 0.025, `green slope ${(s * 100).toFixed(2)}% at (${dx}, ${dy})`); }
    // beside it, on the real hill (2% east plus the hill's own fall), the ground is steeper than that
    const land2 = slope(at.x + 8, at.y + 8); assert.ok(land2 > 0 && Number.isFinite(land2));
    // the course's own slope reader sees what the ball sees
    const sl = courseSlopeAt({ data: groundField(f, course).data, rev: 1 }, c.x, c.y).mag; assert.ok(sl > 0.005 && sl < 0.025, `${sl}`);
  });
});

describe('the land plus the course height (T357)', () => {
  it('the ball reads both; the course height alone where there is no land; the field sum and the workers\' rect are the same sum', () => {
    const f = fieldOf(layLand(synth(), { grid: gridOfFn(hill), src: 't', label: 't', credit: 't', fetched: '' }, at)), c = createCourseHeightField();
    const x = at.x + 40.3, y = at.y + 30.7;
    assert.equal(groundAt(f, c, x, y), landAt(f, x, y), 'a course never edited adds nothing (rev 0)');
    c.data[(Math.floor(y / 2)) * CH_SIZE + Math.floor(x / 2)] = 1.5; c.rev = 1;
    const sum = groundAt(f, c, x, y);
    assert.ok(Math.abs(sum - (landAt(f, x, y) + groundAt(createLandField(), c, x, y))) < 1e-9, 'the sum is the land plus the course height');
    assert.ok(groundAt(f, c, x, y) > landAt(f, x, y) + 0.1, 'the player\'s mound stands on the land');
    assert.equal(groundAt(createLandField(), c, x, y), groundAt(createLandField(), { data: c.data, rev: 5 }, x, y), 'no land: the course height as before');
    assert.equal(groundAt(createLandField(), createCourseHeightField(), 5, 5), 0);
    const gf = groundField(f, c); assert.ok(Math.abs(gf.data[(Math.floor(y / 2)) * CH_SIZE + Math.floor(x / 2)]! - (f.data![(Math.floor(y / 2)) * CH_SIZE + Math.floor(x / 2)]! + 1.5)) < 1e-6);
    assert.equal(groundField(createLandField(), c), c, 'no land: the very field');
    // the workers' rect: the sum over the box and a sample more, inside the lattice
    const r = groundRect(c.data, f.data, [at.x, at.y, at.x + 20, at.y + 20]);
    assert.equal(r.i0, Math.floor(at.x / CH_STEP) - 1); assert.equal(r.w, 13);
    for (let j = 0; j < r.h; j++) for (let i = 0; i < r.w; i++) assert.ok(Math.abs(r.data[j * r.w + i]! - (c.data[(r.j0 + j) * CH_SIZE + r.i0 + i]! + f.data![(r.j0 + j) * CH_SIZE + r.i0 + i]!)) < 1e-6);
    const none = groundRect(c.data, null, [at.x, at.y, at.x + 20, at.y + 20]); assert.deepEqual(Array.from(none.data), Array.from(groundRect(c.data, new Float32Array(CH_SIZE * CH_SIZE), [at.x, at.y, at.x + 20, at.y + 20]).data));
    const edge = groundRect(c.data, f.data, [-50, -50, 8, 8]); assert.equal(edge.i0, 0); assert.equal(edge.j0, 0);
    const far = groundRect(c.data, f.data, [MAP - 8, MAP - 8, MAP + 50, MAP + 50]); assert.equal(far.i0 + far.w, CH_SIZE);
  });
  it('a hole\'s plays-like length comes from the ground: a hole that falls 22 m plays shorter, and the course height alone sees no rise', async () => {
    const land = (await loadOsmLand('woodhill'))!, spec = specOf(woodhill, { id: 'woodhill', name: 'W', place: '' }), plan = planOsmGame(spec)!;
    const f = fieldOf(layLand(spec, land, plan.at)), c = createCourseHeightField(), A = plan.at, h6 = spec.holes.find(q => q.n === 6)!;
    const hole = { n: 6, par: 4 as const, lengthM: h6.lengthM, line: [{ x: h6.tees[0]!.x + A.x, y: h6.tees[0]!.y + A.y }, ...h6.aims.map(a => ({ x: a.x + A.x, y: a.y + A.y })), { x: h6.pin.x + A.x, y: h6.pin.y + A.y }] } as unknown as Parameters<typeof holeTerrain>[1];
    const flat = holeTerrain(c, hole), real = holeTerrain((x, y) => groundAt(f, c, x, y), hole);
    assert.equal(flat.riseM, 0);
    assert.ok(real.riseM < -10, `the rise is ${real.riseM.toFixed(1)} m`);
    assert.ok(real.playsLikeM < hole.lengthM - 10 && real.playsLikeM >= hole.lengthM / 2, `${real.playsLikeM.toFixed(0)} m for a ${hole.lengthM} m hole`);
  });
  it('the course stats take the rise and plays-like length from the ground, and judge the slope on the player\'s own layer alone (a real hill is not the player\'s to smooth)', () => {
    const layout = generateOldNine({ x0: 0, y0: 0, x1: 300, y1: 450 }, 4), have = new Set<Need>(['carpark']), field = createCourseHeightField();
    const base = buildCourseStatsPanel(layout, 1, have, 7, { field, areas: layout.areas });
    // a hill that rises 20% along x: far over the 12% a fairway may have
    const hillside = buildCourseStatsPanel(layout, 1, have, 7, { field, areas: layout.areas, ground: (x: number) => x * 2 * 0.2 });
    assert.ok(base.rows.every(r => r.riseM === 0 && r.playsLikeM === r.lengthM), 'no ground: no rise');
    assert.ok(hillside.rows.some(r => Math.abs(r.riseM) > 3 && r.playsLikeM !== r.lengthM), `the ground gives rises: ${hillside.rows.map(r => r.riseM).join(' ')}`);
    assert.equal(hillside.qualityScore, base.qualityScore, 'the steep fairway penalty and the shaping bonus are the player\'s own layer\'s: the score does not move');
    assert.ok(!hillside.rows.some(r => r.warnings.some(w => /Fairway slope/.test(w))) && !hillside.qualityHints.some(h => /Smooth the steep fairway/.test(h)), 'no "smooth it" said of a real hill');
    assert.ok(hillside.qualityHints.some(h => /plays like a par/.test(h)), 'but the plays-like par is said');
    assert.equal(hillside.heightBonus, base.heightBonus);
  });
  it('a sloping fairway reads as one: the lie\'s slope under the ball, uphill and across (the same reader the ball uses)', async () => {
    const land = (await loadOsmLand('woodhill'))!, spec = specOf(woodhill, { id: 'woodhill', name: 'W', place: '' }), plan = planOsmGame(spec)!, f = fieldOf(layLand(spec, land, plan.at)), c = createCourseHeightField(), A = plan.at;
    const height = (x: number, y: number) => groundAt(f, c, x, y), h6 = spec.holes.find(q => q.n === 6)!, tee = h6.tees[0]!;
    // a ball a third of the way down hole 6, aiming at its pin: the ground falls away (downhill) and the lines say so
    const ball = { x: tee.x + A.x + (h6.pin.x - tee.x) / 3, y: tee.y + A.y + (h6.pin.y - tee.y) / 3 }, aim = { x: h6.pin.x + A.x, y: h6.pin.y + A.y };
    const s = slopeAt(height, ball, aim);
    assert.ok(s.up < -0.01, `downhill ${(s.up * 100).toFixed(1)}%`);
    assert.ok(slopeLines(s).some(l => /Downhill lie/.test(l)), slopeLines(s).join(' | '));
    assert.deepEqual(slopeAt(null, ball, aim), { up: 0, across: 0 });
    // on the flat ground of the old game the same reader says nothing
    assert.deepEqual(slopeLines(slopeAt((x, y) => groundAt(createLandField(), c, x, y), ball, aim)), []);
  });
});

describe('the land in a save (T357)', () => {
  it('packs and unpacks within 1 cm, keeps its source and baseline, and a golf save carries it through normalizing', async () => {
    const spec = synth({}, [GREEN, TEE, POND]), lay = layLand(spec, { grid: gridOfFn(hill), src: 'srtm', label: 'SRTM, 30 m', credit: DEM_CREDIT_DEFAULT, fetched: '2026-11-08' }, at);
    const f = createLandField(); addLandPatch(f, lay, { src: 'srtm', label: 'SRTM, 30 m', credit: DEM_CREDIT_DEFAULT, fetched: '2026-11-08', reliefM: 0 });
    const pk = await packLand(f); assert.ok(pk);
    assert.ok(pk!.x0 >= 0 && pk!.w <= CH_SIZE && pk!.step === 1 && pk!.q === 0.02);
    const back = (await unpackLand(JSON.parse(JSON.stringify(pk))))!; assert.ok(back && back.data);
    let err = 0; for (let k = 0; k < f.data!.length; k++) err = Math.max(err, Math.abs(f.data![k]! - back.data![k]!));
    assert.ok(err <= 0.0101, `max error ${err}`);
    assert.equal(back.info!.label, 'SRTM, 30 m'); assert.equal(back.info!.credit, DEM_CREDIT_DEFAULT); assert.equal(back.base, f.base); assert.ok(back.info!.reliefM > 20);
    // a load keeps the land the save held, and none where the save had none
    const plan = planOsmGame(specOf(woodhill, { id: 'woodhill', name: 'W', place: '' }))!;
    const n = normalizeGolfSave(JSON.parse(JSON.stringify({ ...plan.save, land: pk })))!;
    assert.deepEqual(n.land, JSON.parse(JSON.stringify(pk)));
    assert.equal(normalizeGolfSave(JSON.parse(JSON.stringify(plan.save)))!.land, undefined);
  });
  it('a land that does not unpack is a flat course, never a failed load; nothing to pack is none', async () => {
    assert.equal(await unpackLand(undefined), null); assert.equal(await unpackLand({}), null); assert.equal(await unpackLand({ v: 1, x0: -3, y0: 0, step: 1, w: 5, h: 5, base: 0, q: 0.01, d: 'AAAA' }), null);
    assert.equal(await unpackLand({ v: 1, x0: 0, y0: 0, step: 1, w: 5, h: 5, base: 0, q: 0.01, d: '!!!' }), null);
    assert.equal(await unpackLand({ v: 1, x0: CH_SIZE - 2, y0: 0, step: 1, w: 5, h: 5, base: 0, q: 0.01, d: 'AAAA' }), null, 'a box off the lattice');
    assert.equal(await packLand(createLandField()), null);
  });
});

// ------------------------------------------------------------------------------------------------------------------------ the browser's fetch (fakes only)
/** a network of one tile's bytes: counts requests, says what the server answers, and keeps time */
function fakeNet(png: Uint8Array, o: { status?: number; sources?: string; fail?: boolean; bytes?: (url: string) => Uint8Array } = {}): { net: Net; calls: string[]; slept: number[] } {
  const calls: string[] = [], slept: number[] = []; let t = 1_000_000;
  const net: Net = {
    fetch: async (url, init) => {
      calls.push(url); if (init?.signal?.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
      if (o.fail) throw new TypeError('network down');
      return new Response((o.bytes?.(url) ?? png).slice(), { status: o.status ?? 200, headers: { 'x-amz-meta-x-imagery-sources': o.sources ?? 'srtm/S26E028.tif' } });
    },
    now: () => t, sleep: async ms => { slept.push(ms); t += ms; }, deadline: (_ms, s) => ({ signal: s ?? new AbortController().signal, clear() {} }),
  };
  return { net, calls, slept };
}

describe('the browser fetches the ground of a downloaded course politely (T357)', () => {
  const spec = specOf(woodhill, { id: 'w', name: 'W', place: '' }), json: OsmCourseJson = { ...woodhill, meta: { ...woodhill.meta, centre: { lat: -25.8161713, lon: 28.3150504 } }, height: undefined };
  const keys = tilesOfCourse(spec, json);
  const plane = pngOf((px, py) => 1400 + 0.05 * px - 0.02 * py);

  it('asks for the tiles of the land and its skirt, one request each, 250 ms apart, nothing in parallel', async () => {
    assert.ok(keys.length >= 9 && keys.length <= 20, `${keys.length} tiles`);
    const { net, calls, slept } = fakeNet(plane), cache = new MemoryAnswerCache(), steps: string[] = [];
    const land = await fetchLand(spec, json, { net, cache }, { onStep: t => steps.push(t) });
    assert.equal(calls.length, keys.length); assert.equal(new Set(calls).size, calls.length, 'no tile twice');
    assert.ok(calls.every(u => u.startsWith('https://s3.amazonaws.com/elevation-tiles-prod/terrarium/15/')));
    assert.ok(slept.length === keys.length - 1 && slept.every(ms => ms <= DEM_GAP_MS && ms > 0), `the gate pauses: ${slept.join(',')}`);
    assert.equal(land.label, 'SRTM, 30 m'); assert.equal(land.src, 'srtm'); assert.match(land.credit, /Geological Survey/); assert.equal(land.fetched, new Date(1_000_000 + slept.reduce((a, b) => a + b, 0)).toISOString().slice(0, 10));
    assert.equal(land.grid.step, 16); assert.ok(steps.some(s => /elevation tile 1 of/.test(s)) && steps.some(s => /Working out/.test(s)));
    // the window covers the land and its skirt, in the frame's metres
    const w = landWindow(spec); assert.ok(land.grid.x0 <= w[0] + 0.5 && land.grid.y0 >= w[3] - 0.5 && land.grid.x0 + (land.grid.w - 1) * 16 >= w[2] - 16);
    assert.equal(await tilesKept(keys, cache), keys.length, 'every tile is kept');
  });
  it('never asks for a tile it holds: a second course (or the same one again) makes no request', async () => {
    const { net, calls } = fakeNet(plane), cache = new MemoryAnswerCache();
    await fetchLand(spec, json, { net, cache }); const first = calls.length;
    const again = fakeNet(plane); await fetchLand(spec, json, { net: again.net, cache });
    assert.equal(first, keys.length); assert.equal(again.calls.length, 0, 'all from the library');
  });
  it('reads the ground a tile gives: a plane rising east and north comes back as the same plane in metres', async () => {
    // an absolute plane: 0.05 m a pixel east, 0.02 m a pixel north, built per tile
    const bytes = (url: string) => { const m = /15\/(\d+)\/(\d+)\.png/.exec(url)!, tx = +m[1]!, ty = +m[2]!; return pngOf((px, py) => 1400 + 0.05 * ((tx - 18961) * 256 + px) - 0.02 * ((ty - 18817) * 256 + py)); };
    const { net } = fakeNet(plane, { bytes }), land = await fetchLand(spec, json, { net, cache: new MemoryAnswerCache() });
    const mpp = (2 * Math.PI * EARTH_R * Math.cos(json.meta!.centre!.lat * Math.PI / 180)) / (2 ** 15 * 256);
    const e = heightAtM(land.grid, 200, 0) - heightAtM(land.grid, 0, 0), n = heightAtM(land.grid, 0, 200) - heightAtM(land.grid, 0, 0);
    assert.ok(Math.abs(e - 0.05 * 200 / mpp) < 0.1 && Math.abs(n - 0.02 * 200 / mpp) < 0.1, `east ${e.toFixed(2)}, north ${n.toFixed(2)}`);
  });
  it('a busy server (429, 503) stops the lot at once with its Retry-After, a 404 or no network is "unavailable", and Cancel stops it', async () => {
    const cache = new MemoryAnswerCache();
    const busy = fakeNet(plane, { status: 429 });
    await assert.rejects(() => fetchLand(spec, json, { net: busy.net, cache }), (e: unknown) => e instanceof ServerBusy);
    assert.equal(busy.calls.length, 1, 'one request, then it stops');
    await assert.rejects(() => fetchLand(spec, json, { net: fakeNet(plane, { status: 404 }).net, cache }), (e: unknown) => e instanceof DemUnavailable && /no elevation data/.test(e.message));
    await assert.rejects(() => fetchLand(spec, json, { net: fakeNet(plane, { fail: true }).net, cache }), (e: unknown) => e instanceof DemUnavailable && /could not reach/.test(e.message));
    await assert.rejects(() => fetchLand(spec, json, { net: fakeNet(new Uint8Array(20)).net, cache }), (e: unknown) => e instanceof DemUnavailable);
    const ctl = new AbortController(); ctl.abort();
    await assert.rejects(() => fetchLand(spec, json, { net: fakeNet(plane).net, cache }, { signal: ctl.signal }), (e: unknown) => e instanceof Cancelled);
    assert.equal(await tilesKept(keys, cache), 0, 'a refused or failed tile is never kept');
  });
  it('a course with no position or too big a window is refused with a word, and a 3DEP tile gives the finer source', async () => {
    await assert.rejects(() => fetchLand(spec, { ...json, meta: { ...json.meta, centre: undefined } }, { net: fakeNet(plane).net, cache: new MemoryAnswerCache() }), (e: unknown) => e instanceof DemUnavailable);
    const f = fakeNet(plane, { sources: 'ned13/imgn34w083_13.tif' }), land = await fetchLand(spec, json, { net: f.net, cache: new MemoryAnswerCache() });
    assert.equal(land.label, 'USGS 3DEP, 10 m'); assert.equal(land.grid.step, 8);
    assert.equal(demTileUrl(15, 1, 2), 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/15/1/2.png');
  });
});
