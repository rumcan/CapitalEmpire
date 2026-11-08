// The real ground under a map-data course (T357, #999): the land height. A real course has 20 to 90 m of relief; the game's own course height
// (ext/course-height: a 4 m grid held to +-3 m, the player's shaping) cannot hold it, so a map-data game has a second, smooth layer under it, the LAND
// height: the elevation tiles (terrarium.ts), smoothed, read at the course's scale on the same 4 m lattice as the course height (CH_STEP), and laid
// round the land with a skirt that fades it out to the plain. The hillshade, the ball's roll and its lie, the break of a putt and the plays-like
// lengths read land + course height; the Height tool, the hole shaping and the road flattening still edit the course layer alone.
//
// What is laid (layLand):
//  - the land's heights relative to a baseline (the mean of the ground under the land itself: the plain stands at the course's average level) and in true
//    proportion: a course that was scaled down to fit the map (Woodhill, 90%) has its heights scaled by the same factor, so a slope reads as it does on the
//    real hill;
//  - a skirt: the real ground beyond the land goes on and is faded to the plain over SKIRT_T tiles (the heights times a smoothstep that is 1 at the land's
//    edge with no slope: so the slope is continuous across the edge, there is no cliff and no line in the light where the land ends);
//  - the game's own features level: a green, a tee and a pond sit on a level pad (the mean of the ground under it, its edge feathered into the
//    slope round it), so the 30 m data's noise is never on a green and a pond is never tilted. The green's own gentle tilt is designGreens': 1 to 2%,
//    front low and back high as the hole shaping lays it (ext/hole-ground), laid in the course layer, where the player's shaping is.
// Pure TypeScript, no DOM, deterministic; metres for heights, tiles (2 m) for places.
import { CH_SIZE, CH_STEP, clampCourseHeightM, sampleCourseGrid, type CourseHeightField, type CourseTileBox } from '../../ext/course-height';
import type { Pt } from '../../network';
import { heightAtM, packGrid, unpackGrid, type HeightGrid, type HeightPack, type OsmHeight } from './terrarium';
import { cosSin } from './rotate';
import type { OsmCourseSpec, SpecArea } from './types';

/** the skirt: how far (tiles) beyond the land the heights fade to the plain (400 m) */
export const SKIRT_T = 200;
/** the level pad under a green, a tee and a pond: its reach beyond the polygon (a sample is 2 tiles, so a pad of 2 keeps the polygon's edge itself level when it is
 *  read between samples), and the feather beyond that, tiles */
export const PAD = { green: { pad: 3, feather: 5 }, tee: { pad: 2, feather: 4 }, water: { pad: 2, feather: 4 } } as const;
/** a green's designed tilt (m per m, front low and back high): 1 to 2%, as the hole shaping lays it (ext/hole-ground HOLE_GROUND.green) */
export const GREEN_TILT = { min: 0.01, max: 0.02 } as const;

/** a course's real ground height as the game holds it: the smooth grid (a metres lattice in the stage-1 JSON's frame) and where it came from */
export interface OsmLand {
  grid: HeightGrid;
  /** the source's id ('srtm', 'ned'), the words the card uses ("SRTM, 30 m"), the credit line, the date the tiles were fetched */
  src: string; label: string; credit: string; fetched: string;
}

/** the grid of a fixture's (or a download's) height pack */
export async function landOfHeight(h: OsmHeight): Promise<OsmLand> {
  return { grid: await unpackGrid(h), src: h.src, label: h.label, credit: h.credit, fetched: h.fetched };
}

/** the stage-1 frame metres of the spec's tile (u, v) (x east, y north of the course's centre: the true size, so a scaled course reads the real ground) */
export function specToMetres(spec: Pick<OsmCourseSpec, 'originM' | 'scale'>, u: number, v: number): [number, number] {
  return [(spec.originM[0] + 2 * u) / spec.scale, (spec.originM[1] - 2 * v) / spec.scale];
}
/** the metres box (the stage-1 frame) the land and its skirt cover: the grid a download needs to hold it. anyTurn (a course to be placed, T356: the player turns it
 *  before it is laid): the square about the land's middle that holds it however it is turned, and its skirt */
export function landWindow(spec: Pick<OsmCourseSpec, 'originM' | 'scale' | 'w' | 'h'>, skirtT = SKIRT_T, anyTurn = false): [number, number, number, number] {
  if (anyTurn) {
    const [cx, cy] = specToMetres(spec, spec.w / 2, spec.h / 2), half = Math.hypot(spec.w, spec.h) / spec.scale + (2 * skirtT) / spec.scale; // (the land is 2w x 2h m at the map's scale: half its diagonal is hypot(w, h) m, and a tile of the skirt is 2 m, both at 1 / scale in true metres)
    return [cx - half, cy - half, cx + half, cy + half];
  }
  const a = specToMetres(spec, -skirtT, spec.h + skirtT), b = specToMetres(spec, spec.w + skirtT, -skirtT);
  return [a[0], a[1], b[0], b[1]];
}

/** the map from a tile of a turned spec's frame (T356's rotateSpec: about the middle of its land, the frame grown to the box round it) to the stage-1 metres, for layLand's
 *  `frame`: the turned frame's tile is turned back by `deg` about the frame's middle and read in the base spec's frame. base is the spec as converted, turned the spec turned by deg */
export function turnedFrame(base: Pick<OsmCourseSpec, 'originM' | 'scale' | 'w' | 'h'>, turned: Pick<OsmCourseSpec, 'w' | 'h'>, deg: number): (x: number, y: number) => [number, number] {
  const { c, s } = cosSin(deg), cx = base.w / 2, cy = base.h / 2, dx = turned.w / 2 - cx, dy = turned.h / 2 - cy;
  return (X, Y) => { const a = X - dx - cx, b = Y - dy - cy; return specToMetres(base, cx + c * a + s * b, cy - s * a + c * b); };
}

/** the land as a patch of the course height's lattice: samples (i0..i0+w-1, j0..j0+h-1), metres relative to base (the elevation, m above the datum, that
 *  0 stands for) */
export interface LandPatch { i0: number; j0: number; w: number; h: number; data: Float32Array; base: number; /** the land's own relief, m: its lowest to its highest sample inside the land (not the skirt) */ reliefM: number }

const smooth01 = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/** the signed distance (tiles) from (x, y) to the rings of an area, negative inside (even-odd) */
function signedDist(rings: readonly number[][], x: number, y: number): number {
  let best = Infinity, inside = false;
  for (const r of rings) {
    const n = r.length >> 1;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const ax = r[2 * j]!, ay = r[2 * j + 1]!, bx = r[2 * i]!, by = r[2 * i + 1]!, dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
      const t = L2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2)) : 0, d = Math.hypot(x - ax - dx * t, y - ay - dy * t);
      if (d < best) best = d;
      if ((ay > y) !== (by > y) && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) inside = !inside;
    }
  }
  return inside ? -best : best;
}
/** the box (tiles) of an area's rings */
function ringsBox(rings: readonly number[][]): [number, number, number, number] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of rings) for (let i = 0; i + 1 < r.length; i += 2) { x0 = Math.min(x0, r[i]!); x1 = Math.max(x1, r[i]!); y0 = Math.min(y0, r[i + 1]!); y1 = Math.max(y1, r[i + 1]!); }
  return [x0, y0, x1, y1];
}

/** one area's level pad on the patch: the samples within `pad` tiles of the polygon (or inside it) take the mean of the ground there; the feather
 *  beyond blends back into the slope. at: the spec frame's origin on the map (tiles). Samples are the patch's (i0, j0, w, h) */
function levelArea(F: Float64Array, p: { i0: number; j0: number; w: number; h: number }, a: SpecArea, at: Pt, pad: number, feather: number): void {
  const b = ringsBox(a.rings), reach = pad + feather;
  const iA = Math.max(p.i0, Math.floor((b[0] + at.x - reach) / CH_STEP - 0.5)), iB = Math.min(p.i0 + p.w - 1, Math.ceil((b[2] + at.x + reach) / CH_STEP - 0.5));
  const jA = Math.max(p.j0, Math.floor((b[1] + at.y - reach) / CH_STEP - 0.5)), jB = Math.min(p.j0 + p.h - 1, Math.ceil((b[3] + at.y + reach) / CH_STEP - 0.5));
  if (iA > iB || jA > jB) return;
  const w = iB - iA + 1, h = jB - jA + 1, d = new Float64Array(w * h);
  let sum = 0, n = 0, nearest = Infinity, nearV = 0;
  for (let j = jA; j <= jB; j++) {
    for (let i = iA; i <= iB; i++) {
      const sd = signedDist(a.rings, (i + 0.5) * CH_STEP - at.x, (j + 0.5) * CH_STEP - at.y), k = (j - jA) * w + (i - iA);
      d[k] = sd;
      const v = F[(j - p.j0) * p.w + (i - p.i0)]!;
      if (sd <= pad) { sum += v; n++; }
      if (Math.abs(sd) < nearest) { nearest = Math.abs(sd); nearV = v; }
    }
  }
  const level = n ? sum / n : nearV; // (a pad too small to hold a sample's centre takes the ground nearest it)
  for (let j = jA; j <= jB; j++) {
    for (let i = iA; i <= iB; i++) {
      const sd = d[(j - jA) * w + (i - iA)]!, wt = sd <= pad ? 1 : 1 - smooth01((sd - pad) / feather);
      if (wt <= 0) continue;
      const k = (j - p.j0) * p.w + (i - p.i0);
      F[k] = F[k]! + (level - F[k]!) * wt;
    }
  }
}

/** lays the land of a course on the map: the patch of the course height's lattice (see the header). spec is the course (its frame's north-west corner at
 *  tile `at` of the map, its heights in the stage-1 frame by originM and scale), land its ground. The patch covers the land and SKIRT_T tiles round it, held on
 *  the map. `frame` replaces the spec-to-metres map for a spec that was turned (T356's placing mode: a tile of the turned frame to the stage-1 metres) */
export function layLand(spec: OsmCourseSpec, land: OsmLand, at: Pt, opt: { skirtT?: number; frame?: (u: number, v: number) => [number, number] } = {}): LandPatch {
  const S = opt.skirtT ?? SKIRT_T, frame = opt.frame ?? ((u: number, v: number) => specToMetres(spec, u, v));
  const i0 = Math.max(0, Math.floor((at.x - S) / CH_STEP)), i1 = Math.min(CH_SIZE - 1, Math.ceil((at.x + spec.w + S) / CH_STEP));
  const j0 = Math.max(0, Math.floor((at.y - S) / CH_STEP)), j1 = Math.min(CH_SIZE - 1, Math.ceil((at.y + spec.h + S) / CH_STEP));
  const w = Math.max(0, i1 - i0 + 1), h = Math.max(0, j1 - j0 + 1);
  if (!w || !h) return { i0, j0, w: 0, h: 0, data: new Float32Array(0), base: 0, reliefM: 0 };
  const D = new Float64Array(w * h), out = new Float64Array(w * h), dOut = new Float32Array(w * h);
  let lSum = 0, lN = 0, allSum = 0;
  for (let j = 0; j < h; j++) {
    const v = (j0 + j + 0.5) * CH_STEP - at.y;
    for (let i = 0; i < w; i++) {
      const u = (i0 + i + 0.5) * CH_STEP - at.x, [X, Y] = frame(u, v), k = j * w + i, g = heightAtM(land.grid, X, Y);
      D[k] = g; allSum += g;
      const dx = Math.max(0, -u, u - spec.w), dy = Math.max(0, -v, v - spec.h);
      dOut[k] = Math.hypot(dx, dy);
      // the baseline's samples: the ground under the land itself
      if (dx === 0 && dy === 0) { lSum += g; lN++; }
    }
  }
  const base = lN ? lSum / lN : allSum / (w * h), k0 = spec.scale > 0 ? spec.scale : 1;
  for (let k = 0; k < w * h; k++) out[k] = (D[k]! - base) * k0 * (1 - smooth01(dOut[k]! / S));
  // the game's own features sit level: ponds, then tees, then greens (a green beside water or a tee stays level)
  const p = { i0, j0, w, h };
  for (const kind of ['water', 'tee', 'green'] as const) for (const a of spec.areas) if (a.surf === kind) levelArea(out, p, a, at, PAD[kind].pad, PAD[kind].feather);
  const data = new Float32Array(w * h); let lo = Infinity, hi = -Infinity;
  for (let k = 0; k < w * h; k++) { data[k] = out[k]!; if (dOut[k] === 0) { if (out[k]! < lo) lo = out[k]!; if (out[k]! > hi) hi = out[k]!; } }
  return { i0, j0, w, h, data, base, reliefM: hi >= lo ? hi - lo : 0 };
}

// ------------------------------------------------------------------------------------------------------------------------ the field
/** the land held by a game: CH_SIZE x CH_SIZE samples of the course height's lattice (null with no land), metres relative to base; rev counts the changes;
 *  box the tile box the land covers (null: none); base the elevation (m above the datum) 0 stands for; info what it came from */
export interface LandField { data: Float32Array | null; rev: number; box: CourseTileBox | null; base: number; info: LandInfo | null }
/** what a game keeps of where its land came from (the card's line and the credits') */
export interface LandInfo { src: string; label: string; credit: string; fetched: string; reliefM: number }

/** no land */
export function createLandField(): LandField { return { data: null, rev: 0, box: null, base: 0, info: null }; }

/** the patch added into the field (a placed course adds its own: a second one's skirt may overlap the first's, and the two simply add) */
export function addLandPatch(f: LandField, p: LandPatch, info: LandInfo): void {
  if (!p.w || !p.h) return;
  const d = f.data ?? (f.data = new Float32Array(CH_SIZE * CH_SIZE));
  for (let j = 0; j < p.h; j++) { const row = (p.j0 + j) * CH_SIZE + p.i0; for (let i = 0; i < p.w; i++) d[row + i] = d[row + i]! + p.data[j * p.w + i]!; }
  const b = patchBox(p);
  f.box = f.box ? [Math.min(f.box[0], b[0]), Math.min(f.box[1], b[1]), Math.max(f.box[2], b[2]), Math.max(f.box[3], b[3])] : b;
  f.base = f.info ? f.base : p.base; f.info = info; f.rev++;
}

/** the tile box a patch covers */
export function patchBox(p: LandPatch): CourseTileBox { return [p.i0 * CH_STEP, p.j0 * CH_STEP, (p.i0 + p.w) * CH_STEP, (p.j0 + p.h) * CH_STEP]; }

/** the land inside tile box b taken away (a course placed over land an older one laid: the new course's own ground replaces it; the skirts round it simply add). Bumps the field's rev
 *  when it changed anything */
export function clearLandIn(f: LandField, b: readonly number[]): void {
  if (!f.data) return;
  const i0 = Math.max(0, Math.ceil(b[0]! / CH_STEP - 0.5)), i1 = Math.min(CH_SIZE - 1, Math.floor(b[2]! / CH_STEP - 0.5)), j0 = Math.max(0, Math.ceil(b[1]! / CH_STEP - 0.5)), j1 = Math.min(CH_SIZE - 1, Math.floor(b[3]! / CH_STEP - 0.5));
  let any = false;
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const k = j * CH_SIZE + i; if (f.data[k] !== 0) { f.data[k] = 0; any = true; } }
  if (any) f.rev++;
}

/** the land's height (metres, relative) at tile (x, y): 0 with no land */
export function landAt(f: LandField, x: number, y: number): number { return f.data ? sampleCourseGrid(f.data, x, y) : 0; }
/** the ground's height (metres) at tile (x, y): the land plus the player's course height (the field is read only when it was ever edited: rev) */
export function groundAt(land: LandField, course: CourseHeightField, x: number, y: number): number {
  return (land.data ? sampleCourseGrid(land.data, x, y) : 0) + (course.rev ? sampleCourseGrid(course.data, x, y) : 0);
}
/** the land plus the course height as one field (a fresh array, CourseHeightField's shape; the course itself when there is no land): for a reader that wants the whole ground as a
 *  field (the console, the tests: the game's own readers sample it with groundAt instead, and the workers get groundRect) */
export function groundField(land: LandField, course: CourseHeightField): CourseHeightField {
  if (!land.data) return course;
  const d = new Float32Array(CH_SIZE * CH_SIZE), a = land.data, b = course.data;
  for (let k = 0; k < d.length; k++) d[k] = a[k]! + b[k]!;
  return { data: d, rev: course.rev + land.rev * 1_000_003 };
}
/** the samples of the ground (the course height, plus the land when there is one) over tile box b, whole samples with one to spare, clamped to the lattice: what the
 *  ground workers get to light (GroundCache.courseHeight). i0, j0 and the size are in samples, data row-major */
export function groundRect(course: Float32Array, land: Float32Array | null, b: readonly number[]): { i0: number; j0: number; w: number; h: number; data: Float32Array } {
  const i0 = Math.max(0, Math.floor(b[0]! / CH_STEP) - 1), i1 = Math.min(CH_SIZE - 1, Math.ceil(b[2]! / CH_STEP) + 1);
  const j0 = Math.max(0, Math.floor(b[1]! / CH_STEP) - 1), j1 = Math.min(CH_SIZE - 1, Math.ceil(b[3]! / CH_STEP) + 1);
  const w = Math.max(0, i1 - i0 + 1), h = Math.max(0, j1 - j0 + 1), data = new Float32Array(w * h);
  for (let j = 0; j < h; j++) data.set(course.subarray((j0 + j) * CH_SIZE + i0, (j0 + j) * CH_SIZE + i1 + 1), j * w);
  if (land) for (let j = 0; j < h; j++) { const row = (j0 + j) * CH_SIZE + i0, o = j * w; for (let i = 0; i < w; i++) data[o + i] = data[o + i]! + land[row + i]!; }
  return { i0, j0, w, h, data };
}
/** the relief of the land: the lowest to the highest sample inside its box, metres */
export function landRelief(f: LandField): number {
  if (!f.data || !f.box) return 0;
  const i0 = Math.max(0, Math.floor(f.box[0] / CH_STEP)), i1 = Math.min(CH_SIZE - 1, Math.ceil(f.box[2] / CH_STEP) - 1), j0 = Math.max(0, Math.floor(f.box[1] / CH_STEP)), j1 = Math.min(CH_SIZE - 1, Math.ceil(f.box[3] / CH_STEP) - 1);
  let lo = Infinity, hi = -Infinity;
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const v = f.data[j * CH_SIZE + i]!; if (v < lo) lo = v; if (v > hi) hi = v; }
  return hi >= lo ? hi - lo : 0;
}

// ------------------------------------------------------------------------------------------------------------------------ the designed green tilt
/** a seeded random source (mulberry32), 0 <= v < 1 */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** a text's hash (FNV-1a) */
function hashText(s: string): number { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; }

/** a green's designed tilt: the rise (m per m) along the unit direction (ux, uy) in tile frame, up from the front (where the approach comes in) to the back */
export interface GreenTilt { hole: number; cx: number; cy: number; ux: number; uy: number; tilt: number }

/** the designed tilt of every green of the spec that a hole plays to: 1 to 2% (seeded by the course and the hole, so the same twice), rising away from the
 *  approach (the last aim point, else the tee, to the green's middle), front low and back high. A green no hole claims (a practice green) and a second hole's
 *  claim on a double green are left out */
export function greenTilts(spec: OsmCourseSpec): GreenTilt[] {
  const out: GreenTilt[] = [], seen = new Set<number>();
  for (const a of spec.areas) {
    if (a.surf !== 'green' || a.hole < 1 || seen.has(a.hole)) continue;
    const hole = spec.holes.find(q => q.n === a.hole); if (!hole) continue;
    seen.add(a.hole);
    const b = ringsBox(a.rings), cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
    const from = hole.aims.length ? hole.aims[hole.aims.length - 1]! : hole.tees[0] ?? { x: cx - 1, y: cy };
    let ux = cx - from.x, uy = cy - from.y; const L = Math.hypot(ux, uy) || 1; ux /= L; uy /= L;
    const r = rng(hashText(`${spec.id}|green|${a.hole}`));
    out.push({ hole: a.hole, cx, cy, ux, uy, tilt: GREEN_TILT.min + (GREEN_TILT.max - GREEN_TILT.min) * r() });
  }
  return out;
}

/** lays every green's designed tilt into the course height field (the player's layer): a plane through the green's middle, rising away from the approach,
 *  held over the green's level pad (PAD.green: it takes the pad over, whatever was shaped there) and eased out over its feather, so the green's edge slope is its tilt and the
 *  fringe blends into the ground round it. Returns the tile box it touched (null: none) and bumps the field's rev */
export function designGreens(spec: OsmCourseSpec, at: Pt, field: CourseHeightField): CourseTileBox | null {
  let box: CourseTileBox | null = null;
  const tilts = greenTilts(spec), reach = PAD.green.pad + PAD.green.feather;
  for (const t of tilts) {
    const a = spec.areas.find(q => q.surf === 'green' && q.hole === t.hole)!, b = ringsBox(a.rings);
    const iA = Math.max(0, Math.floor((b[0] + at.x - reach) / CH_STEP - 0.5)), iB = Math.min(CH_SIZE - 1, Math.ceil((b[2] + at.x + reach) / CH_STEP - 0.5));
    const jA = Math.max(0, Math.floor((b[1] + at.y - reach) / CH_STEP - 0.5)), jB = Math.min(CH_SIZE - 1, Math.ceil((b[3] + at.y + reach) / CH_STEP - 0.5));
    for (let j = jA; j <= jB; j++) {
      for (let i = iA; i <= iB; i++) {
        const u = (i + 0.5) * CH_STEP - at.x, v = (j + 0.5) * CH_STEP - at.y, sd = signedDist(a.rings, u, v), wt = sd <= PAD.green.pad ? 1 : 1 - smooth01((sd - PAD.green.pad) / PAD.green.feather);
        if (wt <= 0) continue;
        const plane = t.tilt * ((u - t.cx) * t.ux + (v - t.cy) * t.uy) * 2; // (tiles of 2 m)
        const k = j * CH_SIZE + i;
        field.data[k] = clampCourseHeightM(field.data[k]! + (plane - field.data[k]!) * wt); // (the plane takes the pad over, the feather blends: a course placed over another's greens does not double their tilt)
      }
    }
    const bx: CourseTileBox = [Math.max(0, (iA) * CH_STEP), Math.max(0, jA * CH_STEP), (iB + 1) * CH_STEP, (jB + 1) * CH_STEP];
    box = box ? [Math.min(box[0], bx[0]), Math.min(box[1], bx[1]), Math.max(box[2], bx[2]), Math.max(box[3], bx[3])] : bx;
  }
  if (box) field.rev++;
  return box;
}

// ------------------------------------------------------------------------------------------------------------------------ the save
/** what a save keeps of the land (golf.land): the laid samples as a HeightPack in sample units (x0 = the first sample's column i0, y0 = its row j0, step 1, y
 *  running down the rows), the baseline, and where the land came from. The save is the whole of it: loading needs no fixture, no library and no tiles */
export interface LandSave extends HeightPack { b: number; src: string; label: string; credit: string; fetched: string; /** the land's own relief, m (the course card's line) */ r?: number }

/** the unit the save holds the land's heights to, metres: 2 cm (half the noise of 1 cm in the bytes; a slope's error at the 4 m lattice is 0.1%, which the light does not show) */
export const SAVE_UNIT = 0.02;

/** the land packed for a save (null with none); the box of the samples that are not 0, with a sample to spare */
export async function packLand(f: LandField): Promise<LandSave | null> {
  if (!f.data || !f.info) return null;
  let i0 = CH_SIZE, i1 = -1, j0 = CH_SIZE, j1 = -1;
  for (let j = 0; j < CH_SIZE; j++) { const row = j * CH_SIZE; for (let i = 0; i < CH_SIZE; i++) if (f.data[row + i] !== 0) { if (i < i0) i0 = i; if (i > i1) i1 = i; if (j < j0) j0 = j; j1 = j; } }
  if (i1 < 0) return null;
  i0 = Math.max(0, i0 - 1); j0 = Math.max(0, j0 - 1); i1 = Math.min(CH_SIZE - 1, i1 + 1); j1 = Math.min(CH_SIZE - 1, j1 + 1);
  const w = i1 - i0 + 1, h = j1 - j0 + 1, m = new Float32Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) m[j * w + i] = f.data[(j0 + j) * CH_SIZE + i0 + i]!;
  const p = await packGrid({ x0: i0, y0: j0, step: 1, w, h, m }, SAVE_UNIT);
  return { ...p, b: f.base, src: f.info.src, label: f.info.label, credit: f.info.credit, fetched: f.info.fetched, r: f.info.reliefM };
}

/** the land from a save, or null when the save is not one (never throws: a land that does not decode is a flat course, not a failed load) */
export async function unpackLand(s: unknown): Promise<LandField | null> {
  try {
    const p = s as LandSave | undefined;
    if (!p || typeof p !== 'object' || !Number.isInteger(p.x0) || !Number.isInteger(p.y0) || p.step !== 1) return null;
    if (p.x0 < 0 || p.y0 < 0 || p.x0 + p.w > CH_SIZE || p.y0 + p.h > CH_SIZE) return null;
    const g = await unpackGrid(p), data = new Float32Array(CH_SIZE * CH_SIZE);
    for (let j = 0; j < g.h; j++) for (let i = 0; i < g.w; i++) data[(p.y0 + j) * CH_SIZE + p.x0 + i] = g.m[j * g.w + i]!;
    const f: LandField = { data, rev: 1, box: [p.x0 * CH_STEP, p.y0 * CH_STEP, (p.x0 + p.w) * CH_STEP, (p.y0 + p.h) * CH_STEP], base: Number.isFinite(p.b) ? p.b : 0, info: null };
    f.info = { src: String(p.src ?? ''), label: String(p.label ?? ''), credit: String(p.credit ?? ''), fetched: String(p.fetched ?? ''), reliefM: 0 };
    f.info.reliefM = Number.isFinite(p.r) ? Math.round(p.r! * 10) / 10 : Math.round(landRelief(f) * 10) / 10;
    return f;
  } catch { return null; }
}
