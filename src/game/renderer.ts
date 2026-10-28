import { CHUNK_H, CHUNK_W, HH, HW, MAP, MID_K, PLAN_H, PLAN_W, mulberry, tileOf } from './iso';
import { SK, add, linePath, mul, offsetPolyline, perp, roundPieces, roundedPath, sub, vlen, type BBox, type Decal, type Feature, type FxView, type LineRec, type Pt, type RoadNetwork, type SlabRun } from './network';
import { MOSAIC_TILES, PLACEHOLDER, canvas, ctx2d, type C2D, type Cnv, type Textures, type TexName, type TiledPick } from './textures';
import { fbm, maskFrom, smooth } from './canvas2d';
import { EAGER_PHOTO } from './grass-art';
import { PAINT_TEXES, isPaintPhoto, type PaintTex } from './paint';
import { exposeClip, exposeDraw, exposed, exposureOf } from './exposure';
import { POOL_ANCHOR, PPM, SLAB_CELL } from './ground-art';
import { POOL_SHARES, SPEC_MASK_K } from './lamp-reflect';
import { GLOSS, SWAMP, SwampField, glossTile, swampStreams } from './swamp';
import { REFLECT, SITE, WaterField, fieldPad, fieldRes, glintImage, hexRgb, riverLook, waterImages, waterLookActive, waterLookOf, type WaterLook } from './water-look';
import { LOT_DECALS } from './lot-decals';
import { clampDecals, drawDecals, flatSquash, placeDecals } from './map-decals';
import { layOnGround } from './base-grass';
import savedDecals from './map-decals.json';
import { HS, TC, type Waterway } from './terrain/types';
import { makeNoise } from './terrain/noise';
import { WOODLAND_TEX, classAlpha, rockAlpha, shadeField, shadeRGBA, slopeField, waterBox, waterShape } from './terrain-paint';
import { fairwayStripeLook, holeStripeLegs, legArea, type StripeLook } from './course-stripes';
import { LIP, collarToneOf, finishMow, finishOf, finishStripeLook, greenStripeLook, lipRuns, tonedCollar, type CourseFinish } from './course-finish';
import { quadBox, type CourseLayer, type CoursePatch, type CourseRim, type CourseTex, type CourseWall, type LotPatch, type MowStripes, type PatchTex } from './ground-protocol';
import { DRAW_ORDER, FaceForm, GREEN_FACE, STAIR_TREAD, SURF_HEIGHT, SUN_DIR, WALL_DROP, WALL_PX_PER_M, WALL_TEX, WallMat, defaultShadow, faceLight, faceScale, isOverlay, layerCode, shadowOwner, slopeLight, stairSteps, wallShade, type Stair, type WallShade } from './ext/course-walls';
import { SURF } from './ext/course-grid';
import { SPROUT_PERIOD, growDraws, seedColour, seedSprouts, sproutRes, type GrowDraw } from './ext/course-fx/seed';
import { courseImages, courseRes, lineField } from './ext/course-grid/field';
import { type GrassCellView } from './ext/grass-management';
import { grassOverlay } from './lawn-overlay';
import { surfaceOfTex } from './golf/costs';
import { CELL as COURSE_CELL } from './golf/paintcourse';
import { RUGGED, SPILL, SPILL_SHADE_OFF, inPoly, ruggedKind, ruggedRing, spillBlades, spillScale, warpLine, warpPoint, warpTriples, type RuggedKind } from './rugged-edges';
import { AREA_SHADE, EDGE_LOOKS, JOINT_SOFT, SHADE_RGB, areaLightEdge, areaShadeImages, areaShadeReach, areaShadow, bandRamp, edgeBox, edgeField, edgeImages, edgeReach, edgeRes, featherTiles, jointFeather, jointLen, jointRamp, jointShadeWeight, litBox, type EdgeImage } from './paint-edges';
import { CH_SIZE } from './ext/course-height';
import { CART_RIM, CART_SURFACE, cartCast, cartRim } from './cart-bevel';
import { faceShift, kerbFace, stepReach, upScreen } from './kerb-face';
import { HEIGHT_LIGHT_STRENGTH, HL_MASK, LUMA_SIGMA_PER_L, heightLightGrid, heightLightPictures, heightLightRect, type HeightLightGrid } from './ext/course-height/light';
import { PaintedGround, type LayLevel } from './painted-ground';
import { coversMap } from './painted-families';
import { bandOf, cellsIn, snappedCell, tileIndex, tileKey, tilePermutation, tileSize } from './painted-tiles';
import { BLOCK_UNDER, WOODLAND, lawnTexFor } from './painted-surfaces';
import { ROUGH_SOFT, ROUGH_TEX, roughBack, type RoughKind, type RoughMix } from './rough-yards';
import { SOFT, easeWeights, softAreaWidth, softDirt, softMaskImage, softRGBA, softRes, softRingImages, softWidth, type SoftImage } from './soft-edges';
import { BLEND_WAVES, blendAlpha, blendNoise, trimLru } from './painted-grass-lod';
import { LEAF_DENSITY_DEFAULT, PIC_REACH, STAMP, layLeaves, leafSignature, type LeafRoad } from './leaf-fall';
import { leafAtlasAt, type LeafAtlas } from './leaf-atlas';
import { SURVEY_COL, SURVEY_DASH, SURVEY_W } from './lots/survey';
import { LIVING_AO, LIVING_EDGE, maskContours, CasterStore, COURSE_GRASSY, COURSE_WATER, SHADOW_DIR, debugImage, grassyTex, influence, livingMasks, livingQueryBox, livingRes, livingSignature, waterTex, type Box, type InfluenceGrid, type LivingMasks, type RoadPiece, type WaterLine } from './living-ground';
/** the bytes of painted compositions a worker keeps (a chunk's look is about 3 MB at the closest zoom; the bake in progress keeps all of its own) */
const COMPOSED_BYTES = 64 << 20;
/** a painted composition is made and kept in squares of this many chunk px (only the part of a chunk a surface uses is composed) */
const PAINT_CELL = 128;
/** T199: the swamp tiles' glosses a worker keeps (two bands' worth, a quarter of a MB each) */
const GLOSS_TILES = 8;
/** a painted composition of a chunk: its picture, the cells composed so far, its size in bytes */
/** a chunk's living ground as made (drawLiving): its influence grid and its masks */
type LivingMade = { grid: InfluenceGrid; masks: LivingMasks | null };
/** T204: the tufts along a living-ground variant's edge, as dashed strokes of its outline (a dash across a wide butt-capped stroke is a blade
 *  standing across the edge; Skia lays thousands of them natively, where building them as shapes in script cost tens of ms a chunk): per
 *  layer, how far the blades reach each way (tiles) and the dash pattern (blade width, gap, ... tiles: from a hash, long and uneven so no
 *  period shows along an edge; three layers of different periods together never line up). out: the variant's tufts over the grass round it;
 *  back: the grass round it reaching back in (fewer) */
const TUFT_DASH = (seed: number, n: number, w0: number, w1: number, g0: number, g1: number) => { const d: number[] = []; let h = seed >>> 0; const r = () => { h = Math.imul(h ^ (h >>> 15), 2246822519) + 0x9e3779b9 >>> 0; return h / 4294967296; }; for (let k = 0; k < n; k++) d.push(w0 + (w1 - w0) * r(), g0 + (g1 - g0) * r()); return d; };
const TUFTS = {
  out: [{ len: 0.1, dash: TUFT_DASH(11, 41, 0.04, 0.08, 0.03, 0.12) }, { len: 0.28, dash: TUFT_DASH(23, 37, 0.04, 0.07, 0.08, 0.35) }, { len: 0.55, dash: TUFT_DASH(37, 29, 0.035, 0.06, 0.3, 1.1) }],
  back: [{ len: 0.12, dash: TUFT_DASH(41, 33, 0.04, 0.07, 0.1, 0.4) }, { len: 0.3, dash: TUFT_DASH(53, 31, 0.035, 0.06, 0.35, 1.2) }],
} as const;
type PaintedEntry = { buf: Cnv; cells: Uint8Array; bytes: number };
/** T204: a painted area's or lot lawn's drawn form (GroundPainter.ruggedOf): the patch as drawn (its outline rounded and wobbled), its kind, its
 *  winding (1: a side's (dy, -dx) points outward) */
type RuggedForm = { q: LotPatch; kind: RuggedKind; side: 1 | -1; /** its spill's blades by blade scale (each blade's outline point: own) */ blades?: Map<number, { tri: Float32Array; own: Int32Array }> };
/** T247: a dirt area's soft band over the chunk being baked, from its patch and drawn outline (null: none here, it keeps its hard outline), and
 *  what the bands of a chunk may meet: the areas near it, the course (as drawn), and which areas are drawn after a given one */
type SoftBand = (p0: LotPatch, ring: readonly number[], seam: number, grass?: boolean) => SoftBandImg | null;
type SoftBandImg = { a: SoftImage; p: SoftImage; full: boolean };
/** areas: the chunk's bands made so far, by drawn outline (kept while the areas near, the course and the roads stay as they were) */
type SoftCtx = { cands: readonly LotPatch[]; courses: readonly CoursePatch[]; rank: (p: LotPatch) => readonly [number, number, number]; areas: Map<readonly number[], SoftBandImg | null> };
/** the kinds of area the tall grass spills over (a hard one only in a few tufts) */
const SPILLS_ON: ReadonlySet<RuggedKind> = new Set<RuggedKind>(['short']);
/** a course chunk's spill paths are bucketed in squares this many tiles a side (a bake adds only the buckets near it) */
const SPILL_BUCKET = 16;
/** one bucket of a course chunk's spill: the tall layer outside (o), its tile box (grown by what its blades and bands reach), its blades and
 *  its shade bands (the runs moved a quarter and a half of the band into the turf) */
type SpillBucket = { o: number; box: BBox; blades: Path2D[]; near: Path2D; far: Path2D };
/** a run (flat x y) cut into pieces by the S-tile square each piece lies in (by its first piece's middle; each piece's last point is the
 *  next one's first), with that middle */
function splitRun(p: ArrayLike<number>, S: number): { p: number[]; x: number; y: number }[] {
  const out: { p: number[]; x: number; y: number }[] = [], n = p.length >> 1;
  let cur: { p: number[]; x: number; y: number } | null = null, key = '';
  for (let i = 0; i + 1 < n; i++) {
    const mx = (p[2 * i]! + p[2 * i + 2]!) / 2, my = (p[2 * i + 1]! + p[2 * i + 3]!) / 2, k = Math.floor(mx / S) + ':' + Math.floor(my / S);
    if (!cur || k !== key) { cur = { p: [p[2 * i]!, p[2 * i + 1]!], x: mx, y: my }; out.push(cur); key = k; }
    cur.p.push(p[2 * i + 2]!, p[2 * i + 3]!);
  }
  return out;
}
/** how far outside an area's outline the ground is read for the spill (the map's grass, or something laid there), tiles */
const SPILL_PROBE = 0.4;
/** T217: a ring's tile box (made once a ring: a course chunk's rings are never changed), so a point outside it skips the ring (never inside) */
const ringBoxes = new WeakMap<object, BBox>();
function ringBox(r: ArrayLike<number>): BBox {
  let b = ringBoxes.get(r as object);
  if (!b) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let k = 0; k + 1 < r.length; k += 2) { const x = r[k]!, y = r[k + 1]!; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    ringBoxes.set(r as object, b = [x0, y0, x1, y1]);
  }
  return b;
}
/** whether a course chunk (as drawn) lays a surface or a collar at tile (x, y) (even-odd over each layer's rings) */
/** T247: whether draw-order rank a lies above rank b (lexicographic) */
const rankAbove = (a: readonly [number, number, number], b: readonly [number, number, number]) => (a[0] !== b[0] ? a[0] > b[0] : a[1] !== b[1] ? a[1] > b[1] : a[2] > b[2]);
/** T247: the course surface a course chunk (as drawn) shows at tile (x, y): its top layer's surface there (CourseLayer.s; a collar band
 *  100 + its surface's), -1 where it lays nothing */
function courseSurfAt(c: CoursePatch, x: number, y: number): number {
  const x0 = c.cx * c.size - 0.2, y0 = c.cy * c.size - 0.2;
  if (x < x0 || y < y0 || x > x0 + c.size + 0.4 || y > y0 + c.size + 0.4) return -1;
  let top = -1;
  const inRings = (rs: readonly ArrayLike<number>[]) => { let k = false; for (const r of rs) { const b = ringBox(r); if (x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3] && inPoly(r, x, y)) k = !k; } return k; };
  for (const l of c.layers) { if (l.collar && inRings(l.collar.fill)) top = 100 + l.s; if (inRings(l.fill)) top = l.s; }
  return top;
}
function courseCovers(c: CoursePatch, x: number, y: number): boolean {
  const x0 = c.cx * c.size - 0.2, y0 = c.cy * c.size - 0.2;
  if (x < x0 || y < y0 || x > x0 + c.size + 0.4 || y > y0 + c.size + 0.4) return false;
  for (const l of c.layers) for (const rs of [l.fill, l.collar?.fill ?? []]) {
    let k = false;
    for (const r of rs) { const b = ringBox(r); if (x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3] && inPoly(r, x, y)) k = !k; }
    if (k) return true;
  }
  return false;
}
/** T217: an area's spill over one chunk as laid (its blades' and its shade bands' paths; null: none there), kept by chunk, blade scale and area while the
 *  ground laid before the area (others) and the course chunks are the same objects: a re-bake of the chunk (a course edit re-stales many)
 *  lays it again without reading the ground round the outline or building paths */
type SpillMemo = { others: readonly LotPatch[]; course: readonly CoursePatch[]; paths: { blades: Path2D[]; near: Path2D; far: Path2D } | null };
/** the chunks whose areas' spills a worker keeps, and the areas a chunk keeps (an area edited over and over leaves its old forms behind) */
const SPILL_MEMO_CHUNKS = 96, SPILL_MEMO_AREAS = 48;
const sameList = <T,>(a: readonly T[], b: readonly T[]) => { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; };
/** a run (flat x y, its tall side on side x (dy, -dx)) moved d tiles the other way (into the short side), each point along the mean of its
 *  pieces' normals, appended to path as an open polyline */
function offsetRun(path: Path2D, p: ArrayLike<number>, side: 1 | -1, d: number) {
  const n = p.length >> 1; if (n < 2) return;
  for (let i = 0; i < n; i++) {
    const h = Math.max(0, i - 1), j = Math.min(n - 1, i + 1), dx = p[2 * j]! - p[2 * h]!, dy = p[2 * j + 1]! - p[2 * h + 1]!, l = Math.hypot(dx, dy) || 1;
    const x = p[2 * i]! - (side * dy / l) * d, y = p[2 * i + 1]! + (side * dx / l) * d;
    if (i) path.lineTo(x, y); else path.moveTo(x, y);
  }
}
/** the living ground's leaf litter (T111): the chunks whose leaves a worker keeps laid out, the picture's side (px), the tiles it covers and
 *  the leaves a square metre of it holds (the stochastic layout overlaps its soft patches about two deep, so the ground shows about twice that) */
const LEAF_CHUNKS = 4, LEAF_PX = 1024, LEAF_PERIOD = 16, LEAF_DENSITY = 2.6;
/** the chunks whose influence grids and masks a worker keeps (about half a MB each) */
const LIVING_MADE = 12;
/** T217: the chunks whose living-ground variants' regions (rugged edges, T204) a worker keeps: a few kB of path each, so many more chunks than
 *  their grids and masks (a re-bake of a chunk whose masks were let go makes them again, but not its regions' contours and paths) */
const LIVING_EDGES = 128;
/** T247: the chunks whose living-ground soft band (soft-edges softMaskImage: a byte a px over the lush region's box) a worker keeps, and the
 *  chunks whose dirt areas' soft bands it keeps (by area: the band's images and the weights they were made for) */
const LIVING_SOFTS = 48, SOFT_MEMO_CHUNKS = 48, SOFT_MEMO_AREAS = 1024;
/** T247: the band images whose pictures a worker keeps (a few hundred kB each at most) */
const SOFT_PICS = 24;
/** T220: the fallen leaves (leaf-fall.ts): the chunks whose stamps a worker keeps as placed (a few kB each), and the share of the leaves the
 *  traffic leaves on a road by its family (a busy road's are blown away) */
const LEAF_MEMO = 128;
const LEAF_ROAD_KEEP: Record<string, number> = { small: 1, cart: 0.7, course: 0.6, rural: 0.55, medium: 0.45, large: 0.3 };
/** T220: the paved lot ground (drives, walks, car parks, yards' concrete) where only a few leaves lie */
const LEAF_HARD = new Set(['paving', 'pad', 'concrete', 'asphalt', 'lotAsphalt', 'slabs', 'asphaltDark', 'asphaltWorn', 'asphaltPatched', 'chipSeal', 'concreteStained', 'concreteCracked', 'concreteOld', 'concreteWeathered', 'gravel', 'roadgravel', 'spectatorPath']);
/** T217: the sets of bank and rock-face runs whose paths a worker keeps (courseBanks; a few hundred kB at most each) */
const BANK_BUILT = 32;
/** the lush variant's tint (multiplied over the grass laid over itself: deeper and greener, never a flat colour), and the warm light the derived
 *  soil is lifted by (screen) */
const LUSH_TINT = '#c4dcac', SOIL_LIFT = '#40291a', SOIL_WARM = '#f0cfa4';

/** screen px per tile unit along the iso axes at level 1 */
const TILE_PX = Math.hypot(HW, HH);
/** curb geometry in tiles (kit: top 0.13 m, joint 0.08 m, face 0.18 m, gutter 0.40 m); the face's height on screen is kerb-face.ts FACE_WORLD */
const CURB_TOP = 0.065, CURB_JOINT = 0.04, GUTTER = 0.2;
const SLAB_LEN = 1.25;
/** the owner's map decals (the sprite studio's Ground tab writes map-decals.json) */
const MAP_DECALS = clampDecals(savedDecals as Parameters<typeof clampDecals>[0]);
/** bridge geometry in world px at zoom 1: deck thickness, deck underside to water, railing height */
const DECK_T = 12, PIER_H = 40, RAIL_H = 10;
const YELLOW = 'rgba(246,168,36,0.93)', WHITE = 'rgba(229,225,207,0.9)';
export interface Camera { X: number; Y: number; z: number }
/** building footprints for the planner map: x0, y0, x1, y1, colour index (tiles), five floats each */
export type PlanBlocks = Float32Array;
export const PLAN_BLOCK_COLOURS = ['#c9b79a', '#d98f5a', '#e8d27a', '#8fae6a', '#6c7c8c'];
/** lot patches are indexed in cells of this many tiles */
const LOT_CELL = 32;
/** the asphalt of the planner map (the same colour as the roads) */
const PLAN_ASPHALT = '#3c4150';
/** a Paint texture's swatch colour (its mean), the flat fill of a photo texture this worker has not built yet */
const PAINT_COL = new Map(PAINT_TEXES.map(t => [t.id as string, t.col] as [string, string]));
/** the painted ground textures a photo (grass-art PHOTO_TEX) replaces in the ground layers: lot patches, verges, gravel roads (the dark grey
 *  Asphalt photo, the owner's call 2026-10-21), water, and the river and creek banks (the dirt photo, the owner 2026-10-21) */
/** T230: the photo water textures' mean colours (paint.ts's swatches), the glint's local mean where the water wears no painted look */
const WATER_PHOTO_MEAN: Readonly<Record<string, string>> = { water: '#0f2431', waterDark: '#0f2431', waterDeep: '#0d2330', waterClear: '#164959' };
const GROUND_PHOTO = new Map<string, string>([['dirt', 'dirt'], ['gravel', 'gravel'], ['roadgravel', 'asphalt'], ['field', 'field'], ['water', 'waterDark'], ['bank', 'dirt'], ['creek', 'dirt']]);
/** a ground photo drawn this many times its size (the owner, 2026-10-21: the gravel roads' asphalt "a lot" bigger); the hex-mixed mosaic
 *  still has 43 px a tile at 3x, above the 38 the closest zoom asks for */
const GROUND_SCALE = new Map<string, number>([['roadgravel', 3]]);
/** a patch's polygon as a closed path (tile space), all its points in order */
/** T204: blades (triangles, six numbers each; pick: by index, which to take) as paths of at most BLADES_PER_PATH each: one path of thousands
 *  of small closed shapes grows slower than linearly to build in a worker (measured: 9,000 blades, 175 ms), a few hundred stay cheap */
const BLADES_PER_PATH = 256;
function bladePaths(tri: ArrayLike<number>, pick?: (b: number, tx: number, ty: number) => boolean, out: Path2D[] = []): Path2D[] {
  let p: Path2D | null = null, n = 0;
  for (let b = 0, q = 0; q + 5 < tri.length; b++, q += 6) {
    const tx = tri[q + 4]!, ty = tri[q + 5]!;
    if (pick && !pick(b, tx, ty)) continue;
    if (!p || n >= BLADES_PER_PATH) { p = new Path2D(); out.push(p); n = 0; }
    p.moveTo(tri[q]!, tri[q + 1]!); p.lineTo(tri[q + 2]!, tri[q + 3]!); p.lineTo(tx, ty); p.closePath(); n++;
  }
  return out;
}
/** a closed polygon as a path; a long one (a rugged outline, T204: its patch keeps the array) made once and kept (paths are never changed) */
const polyPaths = new WeakMap<readonly number[], Path2D>();
const polyPath = (pts: number[]) => {
  let p = pts.length >= 32 ? polyPaths.get(pts) : undefined; if (p) return p;
  p = new Path2D(); p.moveTo(pts[0], pts[1]); for (let k = 2; k + 1 < pts.length; k += 2) p.lineTo(pts[k], pts[k + 1]); p.closePath();
  if (pts.length >= 32) polyPaths.set(pts, p);
  return p;
};
/** adds a closed flat ring x0 y0 x1 y1 ... (tiles) to a path */
const ringPath = (p: Path2D, pts: ArrayLike<number>) => { if (pts.length < 6) return; p.moveTo(pts[0]!, pts[1]!); for (let k = 2; k + 1 < pts.length; k += 2) p.lineTo(pts[k]!, pts[k + 1]!); p.closePath(); };
/** a painted area's or course chunk's place in the draw order among the painted areas */
const paintZ = (p: LotPatch) => p.course ? -1e300 : p.paint!.z; // the course under every painted area, even one ordered below 0
/** the course chunks' draw-order switch (renderer drawCourses): step 4, the dirt of seeded cells through the growth mask, is on (T076 landed);
 *  step 8, the fairway's mowing stripes, is GroundPainter.stripes (T218, on: the dev switch GroundCache.setStripes) */
const COURSE_DIRT = true;
/** T218: the fairways' stripe look, the range outfield preset's (course-stripes fairwayStripeLook; the presets are fixed at build) */
const FAIRWAY_STRIPES: StripeLook = fairwayStripeLook();
/** the strokes of a course surface's outward feather (a linear fade in this many steps) */
const FEATHER_STEPS = 4;
/** the soil seeded course cells show while they grow in (plan P21 3.4; a seeded-soil photo is in the art queue) */
const DIRT_TEX = 'dirt';
/** a course wall's painted look (T099, the hand-painted game-art style of T082; flat painted tones, never a repeating tile): three tone bands
 *  down the face (top, middle, foot) as the kerb face has, each a colour in full shade and in full sun (RGB; a face's colour is the mix by
 *  how much it faces the sun at the upper right), the bands' bottoms as fractions of the face, and the tufts at the top edge (grass over a bunker's lip and a green's bank, roots on a pond's bank): their colour,
 *  how far down the face they hang (a fraction of the face plus tiles), how far apart along the screen (tiles of x - y) and how many are
 *  left out, each one's length, lean and place hashed from where it is */
interface WallLook {
  bands: readonly (readonly [readonly number[], readonly number[]])[]; cuts: readonly number[];
  tuft: { col: readonly number[]; a: number; frac: number; len: number; gap: number; skip: number; w: number };
}
const WALL_LOOKS: readonly WallLook[] = [
  // turf: a raised green's or tee's bank like a kerb of sod: a bright cut grass lip, the grass face, dark earth at the foot
  { bands: [[[74, 104, 40], [186, 214, 104]], [[50, 74, 30], [132, 162, 68]], [[44, 40, 24], [118, 104, 62]]], cuts: [0.22, 0.7, 1],
    tuft: { col: [44, 74, 26], a: 0.85, frac: 0.2, len: 0.015, gap: 0.035, skip: 0.3, w: 0.024 } },
  // sand: a bunker's cut face: a dark band of roots and soil under the lip, brown earth, then the sand sliding down to the floor
  { bands: [[[44, 36, 20], [108, 90, 52]], [[86, 66, 40], [182, 146, 98]], [[148, 130, 96], [236, 216, 170]]], cuts: [0.16, 0.46, 1],
    tuft: { col: [54, 84, 30], a: 0.95, frac: 0.14, len: 0.03, gap: 0.03, skip: 0.25, w: 0.03 } },
  // water: a pond's wet bank: dark earth going darker and greener down to the water line, a few roots at the top
  { bands: [[[52, 44, 30], [132, 114, 82]], [[34, 30, 22], [92, 78, 58]], [[20, 28, 28], [54, 70, 64]]], cuts: [0.24, 0.62, 1],
    tuft: { col: [44, 54, 28], a: 0.8, frac: 0.22, len: 0.02, gap: 0.06, skip: 0.55, w: 0.026 } },
  // a green's bank (GREEN_BANK; the owner, 2026-10-25: "no shadows under greens please"): a slim face of mown grass in the green's own tones,
  // no dark earth at the foot and only a few light tufts, so the green reads crisp, never outlined in dark
  { bands: [[[74, 124, 62], [156, 210, 124]], [[66, 112, 56], [136, 188, 106]], [[62, 104, 52], [124, 172, 96]]], cuts: [0.35, 0.8, 1],
    tuft: { col: [70, 112, 52], a: 0.45, frac: 0.15, len: 0.008, gap: 0.05, skip: 0.65, w: 0.016 } },
];
/** WALL_LOOKS' entry for a green's bank over turf (course-walls faceScale: drawn GREEN_FACE tall) */
const GREEN_BANK = 3;
/** how many light steps a wall face is drawn in (each step one path per band) and the longest stretch of an edge given one light, tiles
 *  (the light is mixed between an edge's points, so a curved wall turns smoothly from sun to shade) */
const WALL_STEPS = 24, WALL_LIGHT_SPAN = 0.1;
/** the edge lines (lit top, tufts, contact shade, water line) leave out a face turned less than this toward the camera (a sliver where an edge
 *  runs up the screen: a line there would stand as a vertical glitch) */
const WALL_LINE_FACING = 0.2;
/** the shade colour every course shadow multiplies in (cool, so shade reads as sky light, T110) and the warm tint of the textured shines */
const SHADE_TINT = 'rgb(112,120,152)', SHINE_TINT = 'rgb(255,232,176)', RIM_TINT = 'rgb(236,234,214)';
/** a painted area's sun-side light (areaLight, T136) works in rows this many cache px tall, each over the lit band's span in it */
const LIGHT_ROW = 16;
/** a lit top edge (courseRims): its gap inside the edge, the width of its light and its soft ramp in, tiles (0.2 m, 0.44 m, 0.12 m) */
const RIM_GAP = 0.1, RIM_W = 0.22, RIM_RAMP = 0.06;
/** the wall art's shade per band in full shade (multiplied over the art: 1 is the art as painted), the top band being painted */
const WALL_ART_SHADE = [1, 0.5, 0.38];
/** a wall's drop eases from nothing (its face side-on to the camera) to full when its face turns this much toward the camera (cosine) */
const WALL_SIDE_ON = 0.3;
// ---- the raised surfaces' banks and rock faces (T127, courseBanks) ----
/** a bank's bands down its face (fractions from the crest to the foot) and the share of the slope's light each takes: it ramps in over the
 *  crest and out over the toe, so neither edge reads as a line (the owner: "an angled slope to a flat top not a hard 3d edge"); a rock face
 *  keeps its first band in the top's grass (the turf rolling over the crest) */
const BANK_BANDS = [0, 0.1, 0.22, 0.78, 0.9, 1], BANK_WEIGHT = [0.3, 0.7, 1, 0.75, 0.4], ROCK_WEIGHT = [0, 0.85, 1, 1, 0.9];
/** a grass bank's texture fades out over its toe in these steps (fraction from, alpha) */
const BANK_TOE: readonly (readonly [number, number])[] = [[0.84, 0.66], [0.92, 0.33]];
/** a bank's light steps: its slope light (course-walls slopeLight: 1 is flat ground) from BANK_B0 to BANK_B1, in BANK_STEPS steps */
const BANK_STEPS = 16, BANK_B0 = 0.3, BANK_B1 = 1.7;
/** how strongly a grass bank turned from the sun is shaded (a cool multiply) and one turned to it lit (a textured shine), T110 */
const BANK_SHADE = 0.95, BANK_SUN = 0.8;
/** the rock's painted earth and its stones, in full shade and in full sun (a stone's own shade varies a little round them) */
const ROCK_EARTH: readonly (readonly number[])[] = [[92, 78, 62], [196, 174, 138]], ROCK_STONE: readonly (readonly number[])[] = [[100, 96, 88], [232, 224, 206]];
/** the rock's stones: one where the top edge crosses a lattice line every STONE_GAP tiles (x or y, the segment's longer way: a place on the
 *  map, the same in every chunk, never a repeating tile), in rows down the face, STONE_PX world px across (zoom 1), STONE_SKIP left out */
const STONE_GAP = 0.14, STONE_PX = 9.5, STONE_SKIP = 0.14;
/** the stairs' treads and risers, in full shade and in full sun: stone on a rock face; in a grass bank, timber sleepers for risers and worn
 *  earth for treads */
const STEP_STONE = { tread: [[140, 132, 118], [232, 224, 204]], riser: [[70, 64, 58], [160, 150, 132]] } as const;
const STEP_TIMBER = { tread: [[118, 100, 74], [204, 184, 146]], riser: [[58, 40, 26], [122, 88, 56]] } as const;
const rgb = (c: readonly number[]) => `rgb(${Math.round(c[0]!)},${Math.round(c[1]!)},${Math.round(c[2]!)})`;
const mixRGB = (a: readonly number[], b: readonly number[], t: number) => [a[0]! + (b[0]! - a[0]!) * t, a[1]! + (b[1]! - a[1]!) * t, a[2]! + (b[2]! - a[2]!) * t];
/** a wall run's points (x, y, drop triples, tiles and metres): each one's normal (the mean of its segments' (dy, -dx)) and its drop on the
 *  ground plane, tiles along (1, 1). The drop eases to nothing where the face turns side-on to the camera (an edge running up the screen),
 *  so a wall's end folds in instead of standing as a sliver and a concave notch shows no spikes */
function wallPoints(p: ArrayLike<number>, k = 1): { t: Float64Array; nx: Float64Array; ny: Float64Array } {
  const n = p.length / 3, t = new Float64Array(n), nx = new Float64Array(n), ny = new Float64Array(n);
  for (let i = 0; i + 1 < n; i++) {
    const dx = p[3 * i + 3]! - p[3 * i]!, dy = p[3 * i + 4]! - p[3 * i + 1]!, l = Math.hypot(dx, dy) || 1;
    nx[i] += dy / l; ny[i] += -dx / l; nx[i + 1] += dy / l; ny[i + 1] += -dx / l;
  }
  for (let i = 0; i < n; i++) {
    const l = Math.hypot(nx[i]!, ny[i]!) || 1; nx[i] /= l; ny[i] /= l;
    const f = Math.max(0, Math.min(1, (nx[i]! + ny[i]!) * Math.SQRT1_2 / WALL_SIDE_ON));
    t[i] = p[3 * i + 2]! * WALL_DROP * k * f * f * (3 - 2 * f); // k: the face's share of the wall's height (a green's bank is slim)
  }
  return { t, nx, ny };
}
/** a bank run's points (T127; ext/course-walls FaceForm Bank or Rock, run r tiles a metre): each one's normal (the mean of its segments'
 *  (dy, -dx)) and its foot's offset from the top edge, tiles: out along the normal by the bank's width (r times the drop) and down the screen
 *  by the drop (WALL_DROP a metre, times k, the face's share of its height). Every value at a point comes from the point and its segments, so
 *  a run cut at a chunk border gives the same foot on both sides of the cut. No side-on easing: a sloped face shows round to its silhouette,
 *  where it turns edge-on by itself */
function bankPoints(p: ArrayLike<number>, r: number, k = 1, ends?: ReadonlyMap<string, readonly number[]>): { ox: Float64Array; oy: Float64Array; nx: Float64Array; ny: Float64Array } {
  const n = p.length / 3, ox = new Float64Array(n), oy = new Float64Array(n), nx = new Float64Array(n), ny = new Float64Array(n);
  for (let i = 0; i + 1 < n; i++) {
    const dx = p[3 * i + 3]! - p[3 * i]!, dy = p[3 * i + 4]! - p[3 * i + 1]!, l = Math.hypot(dx, dy) || 1;
    nx[i] += dy / l; ny[i] += -dx / l; nx[i + 1] += dy / l; ny[i + 1] += -dx / l;
  }
  // a run's ends that meet another run's end (endNormals) take their shared normal, so the two feet meet too (a chunk cut: the same normal on
  // both sides already; a kink where one layer's edge hands over to another's: no wedge of ground left between the faces)
  if (ends) for (const i of [0, n - 1]) { const e = ends.get(endKey(p[3 * i]!, p[3 * i + 1]!)); if (e) { nx[i] = e[0]!; ny[i] = e[1]!; } }
  for (let i = 0; i < n; i++) {
    const l = Math.hypot(nx[i]!, ny[i]!) || 1; nx[i] /= l; ny[i] /= l;
    const dh = p[3 * i + 2]!, w = r * dh, ease = r > 0 ? 1 : Math.max(0, Math.min(1, (nx[i]! + ny[i]!) * Math.SQRT1_2 / WALL_SIDE_ON)), t = dh * WALL_DROP * k * (r > 0 ? 1 : ease * ease * (3 - 2 * ease));
    ox[i] = nx[i]! * w + t; oy[i] = ny[i]! * w + t;
  }
  return { ox, oy, nx, ny };
}
/** a run end's place as a key (ends a few microtiles apart are one place) */
const endKey = (x: number, y: number) => `${Math.round(x * 4096)},${Math.round(y * 4096)}`;
/** the shared normal at every place where two or more runs end (the mean of their end segments' normals): bankPoints' ends */
function endNormals(ws: readonly CourseWall[]): Map<string, number[]> {
  const acc = new Map<string, number[]>();
  for (const w of ws) {
    const p = w.p, n = p.length / 3; if (n < 2) continue;
    for (const [i, j] of [[0, 1], [n - 1, n - 2]] as const) {
      const a = i < j ? i : j, b = i < j ? j : i, dx = p[3 * b]! - p[3 * a]!, dy = p[3 * b + 1]! - p[3 * a + 1]!, l = Math.hypot(dx, dy) || 1;
      const k = endKey(p[3 * i]!, p[3 * i + 1]!), v = acc.get(k); if (v) { v[0] += dy / l; v[1] += -dx / l; v[2]!++; } else acc.set(k, [dy / l, -dx / l, 1]);
    }
  }
  for (const [k, v] of acc) if (v[2]! < 2) acc.delete(k);
  return acc;
}
/** a wall run's foot offsets (tiles): a wall's straight down the screen (wallPoints), a bank's out and down (bankPoints) */
function footOffsets(w: CourseWall, ends?: ReadonlyMap<string, readonly number[]>): { ox: ArrayLike<number>; oy: ArrayLike<number> } {
  const k = faceScale({ m: w.m as WallMat, hs: w.hs ?? 0 });
  if (w.f) return bankPoints(w.p, w.r ?? 0, k, ends);
  const { t } = wallPoints(w.p, k);
  return { ox: t, oy: t };
}
/** the faces of some walls (and banks) as one path (tiles): each the top edge along and its foot back */
function wallFaces(ws: readonly CourseWall[]): Path2D {
  const path = new Path2D(), ends = endNormals(ws.filter(w => w.f));
  for (const w of ws) {
    const p = w.p, n = p.length / 3; if (n < 2) continue;
    const { ox, oy } = footOffsets(w, ends);
    path.moveTo(p[0]!, p[1]!); for (let i = 1; i < n; i++) path.lineTo(p[3 * i]!, p[3 * i + 1]!);
    for (let i = n - 1; i >= 0; i--) path.lineTo(p[3 * i]! + ox[i]!, p[3 * i + 1]! + oy[i]!);
    path.closePath();
  }
  return path;
}
/** a 0..1 hash of an integer and a salt (the tufts: the same on both sides of a chunk border, never a repeating tile) */
const hash01 = (k: number, salt: number) => { let h = Math.imul(k ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(salt + 0x632be5ab, 0xc2b2ae35); h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; return (h >>> 0) / 4294967296; };
/** signed shoelace area of a polygon (tile space): positive when its points run counter-clockwise on the axes */
const signedArea = (pts: number[]) => { let a = 0; const n = pts.length / 2; for (let i = 0; i < n; i++) { const j = (i + 1) % n; a += pts[2 * i] * pts[2 * j + 1] - pts[2 * j] * pts[2 * i + 1]; } return a / 2; };

/** Paints ground chunks (the full-quality bake) and planner chunks (the far-zoom map). Runs in the ground workers. */
/** the baked shade mask's size against its chunk's (T186: a quarter each way; the shades are soft) */
export const SHADE_MASK_K = 4;
/** a 2D context whose every transform is scaled by k first (T186: a chunk's drawing laid onto its smaller shade mask by the same calls: the
 *  chunk transform and the chunk's own px both land scaled) */
function scaledContext(g: C2D, k: number): C2D {
  const S = new DOMMatrix([k, 0, 0, k, 0, 0]);
  return new Proxy(g, {
    get(t, p) {
      if (p === 'setTransform') return (...a: unknown[]) => { t.setTransform(a.length === 0 ? S : a.length === 1 ? S.multiply(DOMMatrix.fromMatrix(a[0] as DOMMatrix2DInit)) : S.multiply(new DOMMatrix(a as number[]))); };
      if (p === 'resetTransform') return () => { t.setTransform(S); };
      if (p === 'transform' || p === 'getTransform' || p === 'translate' || p === 'scale' || p === 'rotate') { const f = Reflect.get(t, p, t) as (...a: unknown[]) => unknown; return (...a: unknown[]) => f.apply(t, a); }
      const v = Reflect.get(t, p, t); return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(t) : v;
    },
    set(t, p, v) { return Reflect.set(t, p, v, t); },
  });
}
export class GroundPainter {
  /** State-driven turf overlays, separate from the owner's base grass and lawn/mowing presets. */
  grassCells = new Map<number, GrassCellView>(); grassImages = new Map<string, Cnv>(); grassStrength = 0.45; grassHeat = false; grassMowing = false;
  /** the painted grass (painted-ground.ts): its patch pictures, the chunk being baked (its level, tile box and matrix) and the painted
   *  textures composed for it so far (one picture per family, a copy per tint) */
  private painted = new PaintedGround();
  private chunkNow: { key: string; L: number; box: BBox; M: DOMMatrix; Minv: DOMMatrix; W: number; H: number } | null = null;
  /** the tinted and toned copies the bake in progress made (by composition, tint and tone), and the compositions it uses (kept in the LRU) */
  private toned = new Map<string, PaintedEntry>(); private bakeKeys = new Set<string>();
  /** the bake in progress laid a tile set family (T145): its chunk then depends on the tile spec (GroundCache re-bakes it on a band or DPR change) */
  tilesUsed = false;
  /** T197 (the lot agent's T191 finding: a yard baked golden at the district zoom on a fresh page): the bake in progress fell back to the photo
   *  where a tile set's tiles were not decoded yet (tiledBuf null): its chunk is baked again soon (GroundCache: prov), so no placeholder stays */
  provisional = false;
  /** T186: the baked shade's multiplier, mirrored (the owner, 2026-10-27: "two shadows blocking the same light does not multiply a shadow"):
   *  every shade the bake darkens the ground with (the hillshade, the course height's shade, the painted areas' and the course's edge shade and
   *  cast shadows, the course walls' cast shadows) is laid again onto a white chunk-sized mask, so the mask holds how dark the ground already is
   *  from shade. The worker hands it on at a quarter of the chunk's size (takeShadeMask); the engine's sprite shadow layer then takes the max
   *  of the two, so a sprite's shadow over a baked shade darkens it only as far as the darker of them (gl.ts drawShadeMask, endShadows). Null
   *  between bakes and in a planner bake */
  private shadeMask: { cv: OffscreenCanvas; g: C2D; used: boolean } | null = null;
  /** lay a shade onto the mask too (the bake in progress has one): draw is the same drawing as onto the chunk, given the mask's context, whose
   *  transforms are the chunk's scaled down to the mask (scaledContext: so the chunk transform M and the chunk's px place it alike); its state
   *  is saved and restored round it */
  private onShadeMask(draw: (g: C2D) => void) {
    const m = this.shadeMask; if (!m) return;
    m.g.save(); m.g.resetTransform(); draw(m.g); m.g.restore(); m.used = true;
  }
  /** the mask of the bake just done (the worker transfers it), or null when it laid no shade (the chunk then has none: no texture, no draw) */
  takeShadeMask(): OffscreenCanvas | null {
    const m = this.shadeMask; this.shadeMask = null;
    return m?.used ? m.cv : null;
  }
  /** the planner's painted pictures (a look's far painting, tinted and toned), by look */
  private planPics = new Map<string, Cnv>();
  /** the course walls' painted cut faces (a look's near painting at a mip, tinted and toned), by look and mip */
  private wallPics = new Map<string, Cnv>();
  /** the painted grass composed for the last few chunks (an LRU), by chunk, level, family and art level */
  private composed = new Map<string, PaintedEntry>(); private composedBytes = 0;
  private scratch = new Map<string, Cnv>();
  /** the noise that wobbles the class edges (fixed seed) */
  private edgeNoise = makeNoise(7);
  /** planner colours per texture, computed once */
  private planCols = new Map<string, string>();
  /** the living ground (T111, living-ground.ts): the casters the engine sent (fences, hedges, walls, trees, bushes, buildings), the gear menu's
   *  Ground variety and the dev debug view of its influence maps, and the leaf litter (its picture, and the chunks laid with it) */
  casters = new CasterStore(); living = { on: true, debug: false };
  /** T204: the rugged edges on (the default) or off (the dev switch, GroundCache.setRugged) */
  rugged = true;
  /** T247: the soft dirt edges on (the default) or off (the dev switch, GroundCache.setSoftDirt: the look before T247) */
  softDirt = true;
  /** T218: the fairways' mowing stripes on (the default) or off (the dev switch, GroundCache.setStripes) */
  stripes = true;
  /** T215: the street lamps' reflection pools go onto a per-chunk reflection mask (the camera specular lights the road by it on the GPU, gl.ts
   *  FS_QUAD) instead of into the road picture (the dev switch window.__game.specCam, GroundCache.setSpecCam; off, the default, bakes them as before) */
  specCam = false;
  /** T215: the reflection mask of the bake in progress (a SPEC_MASK_K-th of the chunk's size each way, premultiplied as a canvas is: alpha the
   *  asphalt's coverage times the pools' intensity, colour the road's local mean colour times that; gl.ts specTexture keeps it premultiplied, so
   *  its bilinear lookup and the shader's division give the mean over the asphalt alone), made only when the chunk has a lamp pool; null between
   *  bakes, in a planner bake and with specCam off. (No getImageData: a read back of a worker's canvas stalls it, +24 ms a chunk) */
  private specMask: OffscreenCanvas | null = null;
  /** the reflection mask of the bake just done (the worker transfers it), or null when it has none */
  takeSpecMask(): OffscreenCanvas | null { const m = this.specMask; this.specMask = null; return m; }
  /** T199: the small streams drawn as swamp (swamp.ts; the default) or as their old creek bed (the dev switch window.__game.ground.setSwamp(false)
   *  compares the looks and the bake times); swamp only while the surface 'swamp' wears a painted look (painted-surfaces.ts, Studio > Painted) */
  swamp = true;
  /** T199: the streams' swamp band (swamp.ts SwampField), made with the terrain */
  private swampField = new SwampField([]);
  /** T199: the swamp band of the bake in progress (its cover over the chunk's tile box, res samples a tile, from x0 y0), which the living ground
   *  leaves alone; null when the chunk lays none */
  private swampNow: { cv: Cnv; x0: number; y0: number; res: number } | null = null;
  /** T199: the gloss mask of the bake in progress (a GLOSS.maskK-th of the chunk's size each way, premultiplied as a canvas is: alpha the
   *  swamp's pools' gloss, colour each pool's local mean colour times it; gl.ts glossLight lights the pools by it), made only with specCam on
   *  where the chunk lays the swamp's tile set, or (T230, waterOver) any pond or river; null otherwise */
  private glossMask: OffscreenCanvas | null = null;
  /** the gloss mask of the bake just done (the worker transfers it), or null when it has none */
  takeGlossMask(): OffscreenCanvas | null { const m = this.glossMask; this.glossMask = null; return m; }
  /** T199: each swamp tile's gloss (swamp.ts glossTile), by the tile's URL: made once per tile, the first time a bake lays it with the glint on
   *  (one read back of the tile, never of a chunk) */
  private glossTiles = new Map<string, Cnv>();
  /** T230: the water field of the bake in progress (water-look.ts WaterField: where the chunk's rivers, course ponds and painted water lie,
   *  each sample's distance from its shore and the shore's reflections), made the first time a water site asks (waterOver), with its look;
   *  undefined until then, null when the look is off and the glint too, or the chunk has no water */
  private waterNow: { f: WaterField; look: WaterLook } | null | undefined = undefined;
  /** T230: the chunk's water field (waterNow), made now if not yet */
  private waterField(lite: boolean): { f: WaterField; look: WaterLook } | null {
    if (this.waterNow !== undefined) return this.waterNow;
    const look = waterLookOf(this.tex.surfaces), c = this.chunkNow;
    if (!c || (!waterLookActive(look) && !this.specCam)) return (this.waterNow = null);
    const f = WaterField.over(c.box, fieldPad(look), fieldRes(c.L, lite)), fb = f.box;
    // the rivers, and the course's water and the painted water areas over the field's box (a pond reaching in from past the chunk counts: its
    // shore sets the depth here), each as it is drawn (the warped course, the rugged outline)
    for (const w of this.waters) if (w.w.kind === 'river' && w.box[2] >= fb[0] && w.box[0] <= fb[2] && w.box[3] >= fb[1] && w.box[1] <= fb[3]) f.waterway(w.w.pts, SITE.river);
    for (const p of this.lotsIn(fb)) {
      if (p.top || p.layby) continue;
      if (p.course) { for (const l of this.warpedCourse(p.course, lite).layers) if (l.s === COURSE_WATER && l.fill.length) f.rings(l.fill, SITE.course); }
      else if (p.paint && waterTex(p.tex)) f.rings([this.ruggedOf(p).q.pts], SITE.paint);
    }
    if (!f.any()) return (this.waterNow = null);
    f.shore(Math.max(look.reach, 3));
    if (look.on && look.reflect > 0) f.reflect(this.casters.query([fb[0] - REFLECT.reach - 3, fb[1] - REFLECT.reach - 3, fb[2], fb[3]]));
    return (this.waterNow = { f, look });
  }
  /** T230: the water look over one water site just drawn on g (its samples of the chunk's water field), clipped to its shape (clip, tile
   *  space): the light edge (a screen toward the bed's colour), then the depth and the shore's reflections (a multiply), then the deep's blue lift and the reflections'
   *  own colours (a faint screen), all curves over the water's own pixels (water-look.ts waterImages, waterPixel its twin); and with the glint
   *  on (specCam), the site's gloss onto the chunk's gloss mask beside the
   *  swamp's (water-look.ts glintImage: inset from the shore, its colour the shaded water's mean, `tex` the water's texture). The look off
   *  and the glint off: nothing at all */
  private waterOver(g: C2D, site: number, clip: () => Path2D, tex: string, lite: boolean) {
    const w = this.waterField(lite); if (!w) return;
    // (a river's water: the rivers' own depth strength, water-look.ts riverLook)
    const { f } = w, look = site === SITE.river ? riverLook(w.look) : w.look, c = this.chunkNow!, im = waterImages(f, site, look);
    const lay = (to: C2D, data: Uint8ClampedArray) => { const s = this.buffer('waterTone', f.W, f.H); ctx2d(s).putImageData(new ImageData(data as Uint8ClampedArray<ArrayBuffer>, f.W, f.H), 0, 0); to.drawImage(s, f.x0, f.y0, f.W / f.res, f.H / f.res); };
    if (im.edge || im.shade || im.tint) {
      g.save(); g.setTransform(c.M); g.clip(clip()); g.imageSmoothingEnabled = true; g.globalAlpha = 1;
      if (im.edge) { g.globalCompositeOperation = 'screen'; lay(g, im.edge); }
      if (im.shade) { g.globalCompositeOperation = 'multiply'; lay(g, im.shade); }
      if (im.tint) { g.globalCompositeOperation = 'screen'; lay(g, im.tint); }
      g.restore();
    }
    if (!this.specCam) return;
    const gi = glintImage(f, site, look, hexRgb(this.tex.paintedMean(tex) ?? WATER_PHOTO_MEAN[tex] ?? WATER_PHOTO_MEAN.waterDark));
    if (!gi) return;
    const K = GLOSS.maskK, mask = (this.glossMask ??= new OffscreenCanvas(Math.max(1, Math.ceil(c.W / K)), Math.max(1, Math.ceil(c.H / K)))), m = mask.getContext('2d')!;
    m.save(); m.setTransform(new DOMMatrix([1 / K, 0, 0, 1 / K, 0, 0]).multiply(c.M)); m.clip(clip()); m.imageSmoothingEnabled = true; m.imageSmoothingQuality = 'medium'; m.globalCompositeOperation = 'source-over'; lay(m, gi); m.restore();
  }
  /** T199: the streams are swamp: the switch on and the surface painted (the same for every chunk, so the living ground's banks agree) */
  private swampOn() { return this.swamp && !!this.tex.paintedOf('swamp'); }
  /** T199: a stream's swamp may reach into the tile box (the worker decodes the swamp's tiles only for such a chunk) */
  swampIn(b: BBox) { return this.swamp && !this.swampField.empty && this.swampField.near(b[0], b[1], b[2], b[3]).length > 0; }
  private leafPic: Cnv | null = null; private leafChunks = new Map<string, Cnv>();
  /** T220: the fallen leaves' density (the gear menu's Fallen leaves, GroundCache.setLeafDensity; 0: none, the ground exactly as before T220) */
  leafDensity = LEAF_DENSITY_DEFAULT;
  /** T220: the fallen leaves' atlases by level, and each chunk's stamps as placed, by its tile box, with the key of what they came from (T217's
   *  pattern: a re-bake draws them without placing them again); the patches' ids for that key, and the terrain's version */
  private leafAtlases = new Map<number, LeafAtlas>(); private leafMemo = new Map<string, { sig: string; stamps: Float32Array }>();
  private patchIds = new WeakMap<object, number>(); private patchSeq = 0; private terrainVer = 0;
  /** the influence grids and masks of the last few chunks, by chunk and sources (living-ground.ts livingSignature) */
  private livingMade = new Map<string, LivingMade>();
  /** T204: the living-ground variants' regions by chunk and sources (livingMade's key; T217: kept for more chunks than their masks) */
  private livingEdges = new Map<string, Map<'lush' | 'thin', Path2D | null>>();
  /** T204: a living-ground variant's region over a chunk (made once per chunk and sources, ck: livingMade's key): where its mask passes its
   *  level (LIVING_EDGE; living-ground maskContours), as a path (its rings, even-odd) */
  private livingEdge(ck: string, m: LivingMasks, key: 'lush' | 'thin'): Path2D | null {
    let e = this.livingEdges.get(ck);
    if (e) { this.livingEdges.delete(ck); this.livingEdges.set(ck, e); } else { this.livingEdges.set(ck, e = new Map()); trimLru(this.livingEdges, new Set([ck]), LIVING_EDGES); }
    let r = e.get(key);
    if (r === undefined) {
      const rings = maskContours(m[key], m.W, m.H, m.x0, m.y0, m.res, LIVING_EDGE[key]);
      if (!rings.length) r = null; else { r = new Path2D(); for (const q of rings) ringPath(r, q); }
      e.set(key, r);
    }
    return r;
  }
  /** T247: the living ground's lush region's soft band by chunk and sources (livingMade's key, which holds the level): the lush layer's share
   *  (soft-edges softMaskImage), made once (T217's pattern: a re-bake lays it again without making it); null when no region reaches the chunk */
  private livingSofts = new Map<string, SoftImage | null>();
  private livingSoftOf(ck: string, m: LivingMasks, L: number, box: BBox): SoftImage | null {
    let s = this.livingSofts.get(ck);
    if (s !== undefined) { this.livingSofts.delete(ck); this.livingSofts.set(ck, s); return s; }
    s = softMaskImage(m.lush, m.W, m.H, m.x0, m.y0, m.res, LIVING_EDGE.lush, softWidth(L), softRes(L), [box[0] - 1, box[1] - 1, box[2] + 1, box[3] + 1]);
    this.livingSofts.set(ck, s); trimLru(this.livingSofts, new Set([ck]), LIVING_SOFTS);
    return s;
  }
  /** T247: the device px rect [x, y, w, h] a tile box covers through M, within the canvas (W x H); null when empty */
  private static pxRect(M: DOMMatrix, x0: number, y0: number, x1: number, y1: number, W: number, H: number): [number, number, number, number] | null {
    let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
    for (const [x, y] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]] as const) { const X = M.a * x + M.c * y + M.e, Y = M.b * x + M.d * y + M.f; if (X < a) a = X; if (X > c) c = X; if (Y < b) b = Y; if (Y > d) d = Y; }
    const rx = Math.max(0, Math.floor(a) - 1), ry = Math.max(0, Math.floor(b) - 1), rw = Math.min(W, Math.ceil(c) + 1) - rx, rh = Math.min(H, Math.ceil(d) + 1) - ry;
    return rw > 0 && rh > 0 ? [rx, ry, rw, rh] : null;
  }
  /** T247: the band images' pictures (putSoft), the last SOFT_PICS made */
  private softPics = new Map<SoftImage, Cnv>();
  /** T247: a band image (soft-edges.ts: a byte a px over a tile box) stretched onto g through the chunk transform M (bilinear) with the op */
  private putSoft(g: C2D, img: SoftImage, M: DOMMatrix, op: GlobalCompositeOperation) {
    // (its picture made once and kept for the last few images: a re-bake lays it without filling and uploading it again)
    let s = this.softPics.get(img);
    if (s) { this.softPics.delete(img); this.softPics.set(img, s); }
    else {
      s = canvas(img.W, img.H); ctx2d(s).putImageData(new ImageData(softRGBA(img) as Uint8ClampedArray<ArrayBuffer>, img.W, img.H), 0, 0);
      this.softPics.set(img, s); for (const k of this.softPics.keys()) { if (this.softPics.size <= SOFT_PICS) break; this.softPics.delete(k); }
    }
    g.save(); g.setTransform(M); g.globalCompositeOperation = op; g.globalAlpha = 1; g.imageSmoothingEnabled = true; g.drawImage(s, img.x0, img.y0, img.W / img.r, img.H / img.r); g.restore();
  }
  /** T247: a scratch picture (src, chunk-sized; it is masked in place, so a scratch the caller is done with) laid onto g through a soft band
   *  image a (its share): only over a's tile box (rect: its device px), so nothing of src lands outside the band image's reach */
  private laySoft(g: C2D, src: Cnv, a: SoftImage, M: DOMMatrix, rect: readonly [number, number, number, number]) {
    const [rx, ry, rw, rh] = rect;
    this.putSoft(ctx2d(src), a, M, 'destination-in');
    g.save(); g.setTransform(M); g.beginPath(); g.rect(a.x0, a.y0, a.W / a.r, a.H / a.r); g.clip(); g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.drawImage(src, rx, ry, rw, rh, rx, ry, rw, rh); g.restore();
  }
  /** the texture a lawn patch is laid in: with the painted art on, every town lawn wears one of the painted lawns (painted-surfaces.ts lawnSlot:
   *  picked by where it lies, so neighbouring lots and blocks differ, and it stays put), else its preset's own painted look, else the map
   *  grass's; with the Grass setting 'photo', the preset's picture as before. T155: a lot's lawn wears its look state's lawn (painted-surfaces.ts
   *  lawnTexFor: built the fairway, upgraded the putting green, declined the rough) */
  private lawnTexOf(p0: LotPatch): string {
    const lt = this.tex.paintedOn ? lawnTexFor(p0.lawn, p0.pts, this.tex.surfaces) : '';
    return lt && this.tex.isPainted(lt) ? lt : this.tex.isPainted(p0.tex) || !this.tex.isPainted('grass') ? p0.tex : 'grass';
  }
  /** T247: whether a texture is dirt or desert with a soft edge (soft-edges softDirt: by its painted family, else the photo texture's name) */
  private softTex(t: string): boolean { return this.softDirt && softDirt(t, this.tex.familyOf(t)); }
  /** T247: whether a patch is laid in dirt or desert with a soft edge (a lawn by the town lawn or look it wears) */
  private softPatch(q: LotPatch): boolean { return this.softTex(q.lawn ? this.lawnTexOf(q) : q.tex); }
  /** T247: the dirt areas' soft bands by chunk (its key holds the level) and drawn outline, with what they were made from (the areas near, the
   *  course and the road network's version: an edit there makes them again) */
  private softMemo = new Map<string, { cands: readonly LotPatch[]; courses: readonly CoursePatch[]; ver: number; areas: Map<readonly number[], SoftBandImg | null> }>();
  /** T247: the chunk's kept bands (softMemo), checked once a bake: let go when the areas near, the course or the roads changed */
  private softAreasOf(cands: readonly LotPatch[], courses: readonly CoursePatch[]): Map<readonly number[], SoftBandImg | null> {
    const ck = this.chunkNow!.key, ver = this.net.version;
    let m = this.softMemo.get(ck);
    if (m && (m.ver !== ver || !sameList(m.cands, cands) || !sameList(m.courses, courses))) m = undefined;
    if (m) { this.softMemo.delete(ck); this.softMemo.set(ck, m); } else { this.softMemo.set(ck, m = { cands, courses, ver, areas: new Map() }); trimLru(this.softMemo, new Set([ck]), SOFT_MEMO_CHUNKS); }
    return m.areas;
  }
  /** T247: a dirt or desert area's soft band over the chunk being baked (soft-edges softRingImages over its drawn outline `ring`, weighted by what
   *  it meets: softWeights), made once per chunk, outline and neighbours (T217's pattern: a re-bake lays it again without making it); null when
   *  it has none here (it keeps its hard outline). seam: the cell size whose seams take no band (a painted area's, COURSE_CELL); grass: a lawn
   *  laid over earlier dirt or desert (softWeights) */
  private softBandOf(self: LotPatch, ring: readonly number[], sc: SoftCtx, L: number, box: BBox, seam: number, grass = false): SoftBandImg | null {
    const by = sc.areas, had = by.get(ring);
    if (had !== undefined) return had;
    // (a small area's band is held to a share of its size: softAreaWidth)
    const w = softAreaWidth(L, Math.abs(signedArea(ring as number[]))), wts = this.softWeights(self, ring, sc, w, box, grass);
    const img = wts ? softRingImages(ring, wts, [box[0] - 1, box[1] - 1, box[2] + 1, box[3] + 1], w, softRes(L), seam) : null;
    by.set(ring, img);
    for (const k of by.keys()) { if (by.size <= SOFT_MEMO_AREAS) break; by.delete(k); }
    return img;
  }
  /** T247: the soft band's weight at each point of a dirt area's drawn outline (eased along it: soft-edges easeWeights), from the ground across
   *  the band there, read at a few depths each side: 1 where the ground just outside is the map's or one area drawn earlier that is grass or dirt
   *  (what the band blends into) and the same ground lies under the band's inner half (the copy of it the band lays there: an earlier area hidden
   *  under the dirt must not show through); 0 where an area drawn later or alongside lies across the band (it would cover the band's outer half
   *  and leave tufts inside the dirt as a seam), or paving, water, a sand trap, the course or a road lies outside. Only the points near the chunk
   *  are read (the rest count as 1: their band never reaches it). null when it is 0 all round near the chunk. grass: the area is a lawn and
   *  blends only into earlier dirt or desert under and round it (a lot's lawn on a desert block: dirt meeting lawn from the lawn's side) */
  private softWeights(self: LotPatch, ring: readonly number[], sc: SoftCtx, w: number, box: BBox, grass = false): Float32Array | null {
    const n = ring.length >> 1; if (n < 3) return null;
    const h = w / 2, ease = Math.max(SOFT.ease, SOFT.easeK * w), g = h + ease + 3;
    // the depths read each side of the outline: just past it, about the middle of the half band, and the band's edge
    const depths = [Math.min(SOFT.probe, h), Math.min(h, Math.max(SOFT.probe, h / 2)), h];
    const x0 = box[0] - g, y0 = box[1] - g, x1 = box[2] + g, y1 = box[3] + g, side = signedArea(ring as number[]) >= 0 ? 1 : -1, myRank = sc.rank(self);
    const later = (q: LotPatch) => { const o = sc.rank(q); return o[0] !== myRank[0] ? o[0] > myRank[0] : o[1] !== myRank[1] ? o[1] > myRank[1] : o[2] >= myRank[2]; };
    const texOf = (q: LotPatch) => (q.lawn ? this.lawnTexOf(q) : q.tex), selfTex = texOf(self);
    const above = (a: LotPatch, b: LotPatch) => rankAbove(sc.rank(a), sc.rank(b));
    // the ground that may lie across the band: the other areas near (as drawn), and the roads and cart paths near the area
    // (only those whose drawn box comes within the band of the outline's box)
    const pb = quadBox(ring as number[]), near: LotPatch[] = [], np: (readonly number[])[] = [], nb: BBox[] = [];
    for (const q of sc.cands) {
      if (q === self || q.pts.length < 6 || q.course) continue;
      const qp = q.paint || (q.lawn && q.lawn.z >= 1) ? this.ruggedOf(q).q.pts : q.pts, b = ringBox(qp);
      if (b[2] < pb[0] - h - 1 || b[0] > pb[2] + h + 1 || b[3] < pb[1] - h - 1 || b[1] > pb[3] + h + 1) continue;
      near.push(q); np.push(qp); nb.push(b);
    }
    // a lawn blends only where earlier dirt lies under it: none near, no band
    if (grass && !near.some(q => !later(q) && this.softPatch(q))) return null;
    const cx = (pb[0] + pb[2]) / 2, cy = (pb[1] + pb[3]) / 2, rr = Math.hypot(pb[2] - pb[0], pb[3] - pb[1]) / 2 + h + 8;
    const segs = [...this.net.segsNear({ x: cx, y: cy }, rr)].filter(s => s.kind !== SK.TUNNEL);
    /** the ground at (x, y) as the band sees it: undefined where it must not blend (a later area, or the earlier ground on top is paving,
     *  water or sand), else the earlier area on top there (null: the map's own ground) */
    // the course is drawn with the painted areas, under all of them (paintZ): earlier than a painted area, later than a lawn or a lot's ground
    const courseLater = myRank[0] < 2, courseRank: readonly [number, number, number] = [2, -1e300, 0];
    const groundAt = (x: number, y: number): LotPatch | string | null | undefined => {
      let top: LotPatch | null = null;
      for (let q = 0; q < near.length; q++) {
        const b = nb[q]!, o = near[q]!; if (x < b[0] || x > b[2] || y < b[1] || y > b[3] || !inPoly(np[q]!, x, y)) continue;
        if (later(o)) return undefined;
        if (!top || above(o, top)) top = o;
      }
      // the course on top of the earlier ground there: its rough or fescue blends like the map's (each its own ground), the rest does not
      let cs = -1;
      for (let q = 0; q < sc.courses.length && cs < 0; q++) cs = courseSurfAt(sc.courses[q]!, x, y);
      if (cs >= 0 && (courseLater || !top || rankAbove(courseRank, sc.rank(top)))) return courseLater || grass || !COURSE_GRASSY.has(cs) ? undefined : `course:${cs}`;
      if (grass) return top && this.softPatch(top) ? top : undefined;
      // (the same dirt round it: nothing to blend, no band)
      if (top && texOf(top) === selfTex) return undefined;
      if (top) { const k = ruggedKind(top.tex, top.paint && top.paint.b > 0 ? top.paint.bt : undefined); if (!(top.lawn || k === 'tall' || k === 'short' || this.softTex(top.tex))) return undefined; }
      return top;
    };
    const raw = new Float32Array(n).fill(1); let any = false, zero = false;
    for (let i = 0; i < n; i++) {
      const x = ring[2 * i]!, y = ring[2 * i + 1]!; if (x < x0 || x > x1 || y < y0 || y > y1) { any = true; continue; }
      const hh = (i + n - 1) % n, j = (i + 1) % n, nx0 = (ring[2 * j + 1]! - ring[2 * hh + 1]!) * side, ny0 = -(ring[2 * j]! - ring[2 * hh]!) * side, l = Math.hypot(nx0, ny0);
      if (l < 1e-9) { any = true; continue; }
      const nx = nx0 / l, ny = ny0 / l;
      let open = true, was: LotPatch | string | null | undefined = undefined, first = true;
      for (const d of depths) {
        for (const s of [1, -1]) {
          const px = x + s * nx * d, py = y + s * ny * d, gnd = groundAt(px, py);
          if (gnd === undefined || (!first && gnd !== was)) { open = false; break; }
          was = gnd; first = false;
          if (s > 0) {
            for (let q = 0; q < segs.length && open; q++) {
              const sg = segs[q]!, ax = sg.a.x, ay = sg.a.y, dx = sg.b.x - ax, dy = sg.b.y - ay, l2 = dx * dx + dy * dy, t = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
              if (Math.hypot(ax + dx * t - px, ay + dy * t - py) <= sg.cls.h + sg.cls.walk + 0.25) open = false;
            }
            if (!open) break;
          }
        }
        if (!open) break;
      }
      if (open) any = true; else { raw[i] = 0; zero = true; }
    }
    if (!any) return null;
    return zero ? easeWeights(ring, raw, ease) : raw;
  }
  /** T247: a dirt or desert area (or a lawn over desert) drawn with its soft band, in place of its hard draw: its own fill (fill: laid under
   *  the chunk transform with no clip of its own, on past its outline) through its share (the band's a), kept where the band is laid (p), and
   *  through its hard outline (path, as draw has it) where it is not, laid over the ground drawn so far. So the ground under and round it shows
   *  through the band as it is, with no copy of the chunk (a copy would stall the bake until the GPU caught up). Without a band here the area is
   *  just drawn */
  private softArea(ctx: C2D, img: SoftBandImg | null, M: DOMMatrix, draw: () => void, fill: (g: C2D, r: number[]) => void, path: Path2D) {
    const W = ctx.canvas.width, H = ctx.canvas.height, a = img?.a, rect = a ? GroundPainter.pxRect(M, a.x0, a.y0, a.x0 + a.W / a.r, a.y0 + a.H / a.r, W, H) : null;
    if (!img || !a || !rect) { draw(); return; }
    const [rx, ry, rw, rh] = rect, s = this.bufferAtLeast('softLay', W, H), sg = ctx2d(s);
    // the fill over the band image's box
    sg.clearRect(rx, ry, rw, rh);
    sg.save(); sg.setTransform(M); sg.beginPath(); sg.rect(a.x0, a.y0, a.W / a.r, a.H / a.r); sg.clip(); fill(sg, [a.x0, a.y0, a.x0 + a.W / a.r, a.y0 + a.H / a.r]); sg.restore();
    // (the band all along the outline here: its share alone is the area, hard inside and out past the band)
    if (img.full) {
      this.putSoft(sg, a, M, 'destination-in');
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.drawImage(s, rx, ry, rw, rh, rx, ry, rw, rh); ctx.restore();
      return;
    }
    const hb = this.bufferAtLeast('softHard', W, H), hg = ctx2d(hb);
    // its hard part: the fill inside the outline, where the band is not laid
    hg.clearRect(rx, ry, rw, rh); hg.drawImage(s, rx, ry, rw, rh, rx, ry, rw, rh);
    hg.save(); hg.setTransform(M); hg.globalCompositeOperation = 'destination-in'; hg.fill(path); hg.restore();
    this.putSoft(hg, img.p, M, 'destination-out');
    // its soft part: the fill through its share where the band is laid; the two together (they never overlap: lighter adds them)
    this.putSoft(sg, a, M, 'destination-in'); this.putSoft(sg, img.p, M, 'destination-in');
    sg.save(); sg.setTransform(1, 0, 0, 1, 0, 0); sg.globalCompositeOperation = 'lighter'; sg.drawImage(hb, rx, ry, rw, rh, rx, ry, rw, rh); sg.restore();
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.drawImage(s, rx, ry, rw, rh, rx, ry, rw, rh); ctx.restore();
  }
  /** T204 (rugged-edges.ts): each painted area's and lot lawn's drawn form, by its patch (a patch keeps its object until it changes) */
  private ruggedForms = new WeakMap<LotPatch, RuggedForm>();
  /** the patch as it is drawn (T204): a soft area's outline rounded and wobbled (ruggedRing; gameplay keeps the patch's own pts), a hard one's
   *  (paving, paths, kerbs) or a small one's as it is; its kind (rugged-edges ruggedKind) and its outline's winding (the sign that turns a side's
   *  (dy, -dx) outward) */
  private ruggedOf(p: LotPatch): RuggedForm {
    if (!this.rugged) return { q: p, kind: 'hard', side: 1 };
    let f = this.ruggedForms.get(p);
    if (!f) {
      const kind = ruggedKind(p.tex, p.paint && p.paint.b > 0 ? p.paint.bt : undefined), pts = kind === 'hard' ? p.pts : ruggedRing(p.pts, COURSE_CELL);
      f = { q: pts === p.pts ? p : { ...p, pts: pts as number[] }, kind, side: signedArea(pts as number[]) >= 0 ? 1 : -1 };
      this.ruggedForms.set(p, f);
    }
    return f;
  }
  /** T204: the spill of each course chunk as drawn (warpedCourse), by blade scale: its blades and shade bands bucketed by place
   *  (SPILL_BUCKET tiles square) and by the tall layer outside, as paths made once (a bake only adds the buckets near its box) */
  private courseSpills = new WeakMap<CoursePatch, Map<number, SpillBucket[]>>();
  /** T217: each area's spill as laid over a chunk, by chunk key (with its level) and area (areaSpill) */
  private spillMemo = new Map<string, Map<RuggedForm, SpillMemo>>();
  private courseSpillOf(c: CoursePatch, k: number): SpillBucket[] {
    let m = this.courseSpills.get(c); if (!m) this.courseSpills.set(c, m = new Map());
    let out = m.get(k);
    if (!out) {
      const by = new Map<string, SpillBucket>(), tris = new Map<SpillBucket, number[]>(), S = SPILL_BUCKET;
      const at = (o: number, x: number, y: number) => {
        const i = Math.floor(x / S), j = Math.floor(y / S), key = `${o}:${i}:${j}`;
        let b = by.get(key); if (!b) { by.set(key, b = { o, box: [i * S - 1, j * S - 1, (i + 1) * S + 1, (j + 1) * S + 1], blades: [], near: new Path2D(), far: new Path2D() }); tris.set(b, []); }
        return b;
      };
      for (const r of c.spill ?? []) {
        const tri = spillBlades(r.p, 1, k);
        for (let q = 0; q + 5 < tri.length; q += 6) { const t = tris.get(at(r.o, tri[q + 4]!, tri[q + 5]!))!; for (let k = 0; k < 6; k++) t.push(tri[q + k]!); }
        for (const pc of splitRun(r.p, S)) { const b = at(r.o, pc.x, pc.y); offsetRun(b.near, pc.p, 1, SPILL.band / 4); offsetRun(b.far, pc.p, 1, SPILL.band / 2); }
      }
      for (const [b, t] of tris) bladePaths(t, undefined, b.blades);
      out = [...by.values()]; m.set(k, out);
    }
    return out;
  }
  /** the ground under every lawn, lot and painted area as baked so far (the map's grass, its meadows, banks and hillshade), as a fill in the
   *  chunk's px under its matrix (T204: the tall grass the spill over a short area, or over the fairway where the map's grass meets it, is
   *  cut from); only the part of the chunk near such an edge is copied, and only when there is one; null when none */
  private spillUnder(ctx: C2D, all: readonly LotPatch[], M: DOMMatrix, Minv: DOMMatrix, W: number, H: number): CanvasPattern | null {
    const box = this.chunkNow!.box, X0 = box[0] - 2, Y0 = box[1] - 2, X1 = box[2] + 2, Y1 = box[3] + 2;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    /** the points of a line near the chunk, grown by g tiles, into the box to copy */
    const take = (p: ArrayLike<number>, g: number) => {
      for (let q = 0; q + 1 < p.length; q += 2) {
        const x = p[q]!, y = p[q + 1]!; if (x < X0 || x > X1 || y < Y0 || y > Y1) continue;
        if (x - g < x0) x0 = x - g; if (x + g > x1) x1 = x + g; if (y - g < y0) y0 = y - g; if (y + g > y1) y1 = y + g;
      }
    };
    for (const p of all) {
      if (p.course) { for (const r of p.course.spill ?? []) if (r.o === 0) take(r.p, 2); continue; }
      if (!p.paint && !(p.lawn && p.lawn.z >= 1)) continue;
      const f = this.ruggedOf(p); if (SPILLS_ON.has(f.kind)) take(f.q.pts, 1.2);
    }
    if (x1 < x0) return null;
    let rx0 = Infinity, ry0 = Infinity, rx1 = -Infinity, ry1 = -Infinity;
    for (const [x, y] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]] as const) { const X = M.a * x + M.c * y + M.e, Y = M.b * x + M.d * y + M.f; rx0 = Math.min(rx0, X); rx1 = Math.max(rx1, X); ry0 = Math.min(ry0, Y); ry1 = Math.max(ry1, Y); }
    const rx = Math.max(0, Math.floor(rx0)), ry = Math.max(0, Math.floor(ry0)), rw = Math.min(W, Math.ceil(rx1)) - rx, rh = Math.min(H, Math.ceil(ry1)) - ry;
    if (rw <= 0 || rh <= 0) return null;
    const s = this.bufferKeep('spillUnder', W, H), g = ctx2d(s);
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(rx, ry, rw, rh); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.drawImage(ctx.canvas, rx, ry, rw, rh, rx, ry, rw, rh); g.restore();
    const p = ctx.createPattern(s, 'no-repeat'); p?.setTransform(Minv); return p;
  }
  /** T204: the tall grass's spill over a short area (a painted area, a lot's lawn) where its outline meets the map's grass: the blades of its
   *  outline (rugged-edges spillBlades, made once an area and blade scale) whose outline point has the map's grass just outside (no earlier
   *  lawn, lot, painted area or course layer there), cut from the ground under it (under) */
  private areaSpill(ctx: C2D, f: RuggedForm, others: readonly LotPatch[], course: readonly CoursePatch[], L: number, M: DOMMatrix, box: BBox, under: CanvasPattern) {
    const ring = f.q.pts, n = ring.length >> 1; if (n < 3 || !SPILLS_ON.has(f.kind)) return;
    // T217: laid as on this chunk's last bake when nothing round it changed (by the chunk and the blades' scale: its box is the same at every
    // level, so two levels with the same scale share it)
    const k = spillScale(L, TILE_PX), ck = `${this.chunkNow!.key.replace(/@.*/, '')}#${k}`;
    let byArea = this.spillMemo.get(ck);
    if (byArea) { this.spillMemo.delete(ck); this.spillMemo.set(ck, byArea); } else { this.spillMemo.set(ck, byArea = new Map()); trimLru(this.spillMemo, new Set([ck]), SPILL_MEMO_CHUNKS); }
    const memo = byArea.get(f);
    if (memo && sameList(memo.others, others) && sameList(memo.course, course)) {
      byArea.delete(f); byArea.set(f, memo);
      if (memo.paths) this.layBlades(ctx, M, memo.paths.blades, memo.paths.near, memo.paths.far, under);
      return;
    }
    const keep = (paths: SpillMemo['paths']) => { byArea.delete(f); byArea.set(f, { others: others.slice(), course: course.slice(), paths }); for (const a of byArea.keys()) { if (byArea.size <= SPILL_MEMO_AREAS) break; byArea.delete(a); } };
    const x0 = box[0] - 1.5, y0 = box[1] - 1.5, x1 = box[2] + 1.5, y1 = box[3] + 1.5;
    // which outline points have the map's grass just outside
    const tall = new Uint8Array(n), near = others.filter(o => o !== f.q && o.pts.length >= 6), nb = near.map(o => quadBox(o.pts));
    let any = false;
    for (let i = 0; i < n; i++) {
      const x = ring[2 * i]!, y = ring[2 * i + 1]!; if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      const h = (i + n - 1) % n, j = (i + 1) % n, nx = (ring[2 * j + 1]! - ring[2 * h + 1]!) * f.side, ny = -(ring[2 * j]! - ring[2 * h]!) * f.side, l = Math.hypot(nx, ny);
      if (l < 1e-9) continue;
      const ox = x + (nx / l) * SPILL_PROBE, oy = y + (ny / l) * SPILL_PROBE;
      let out = true;
      for (let q = 0; q < near.length && out; q++) { const b = nb[q]!; if (ox >= b[0] && ox <= b[2] && oy >= b[1] && oy <= b[3] && inPoly(near[q]!.pts, ox, oy)) out = false; }
      for (let q = 0; q < course.length && out; q++) out = !courseCovers(course[q]!, ox, oy);
      if (out) { tall[i] = 1; any = true; }
    }
    if (!any) { keep(null); return; }
    let set = f.blades?.get(k);
    if (!set) {
      const own: number[] = [], tri = spillBlades([...ring, ring[0]!, ring[1]!], f.side, k, false, [], own);
      set = { tri: Float32Array.from(tri), own: Int32Array.from(own) }; (f.blades ??= new Map()).set(k, set);
    }
    // the blades of the tall stretches near the chunk, and those stretches' shade bands
    const nearP = new Path2D(), farP = new Path2D(), own = set.own;
    const blades = bladePaths(set.tri, (b, tx, ty) => tx >= x0 && tx <= x1 && ty >= y0 && ty <= y1 && (tall[own[b]!] === 1 || tall[(own[b]! + 1) % n] === 1));
    if (!blades.length) { keep(null); return; }
    const band = (p: ArrayLike<number>) => { offsetRun(nearP, p, f.side, SPILL.band / 4); offsetRun(farP, p, f.side, SPILL.band / 2); };
    if (tall.every(v => v)) band([...ring, ring[0]!, ring[1]!]);
    else for (let i = 0; i < n; i++) if (tall[i] && !tall[(i + n - 1) % n]) { const p: number[] = []; for (let q = i; tall[q % n]; q++) p.push(ring[2 * (q % n)]!, ring[2 * (q % n) + 1]!); if (p.length >= 4) band(p); }
    keep({ blades, near: nearP, far: farP });
    this.layBlades(ctx, M, blades, nearP, farP, under);
  }
  /** lays the spill's blades (tile space): first the shade under their overhang, a soft band just inside the short side (near and far: the
   *  edge moved a quarter and a half of the band in, stroked half and full width, so it is strongest at the edge) and the blades moved toward
   *  the shadows (145 degrees on screen), all multiplied in the cool shade (T110: the ground keeps its texture) and laid on the shade mask
   *  too (T186); then the blades in `fill`, the tall ground's own picture (tone: its course tone over them) */
  private layBlades(ctx: C2D, M: DOMMatrix, blades: readonly Path2D[], near: Path2D, far: Path2D, fill: CanvasPattern | string, tone?: (draw: () => void) => void) {
    const shade = (g: C2D) => {
      g.save(); g.setTransform(M); g.globalCompositeOperation = 'multiply'; g.fillStyle = g.strokeStyle = SHADE_TINT; g.lineCap = 'butt'; g.lineJoin = 'round';
      g.globalAlpha = SPILL.bandA / 2; g.lineWidth = SPILL.band; g.stroke(far); g.lineWidth = SPILL.band / 2; g.stroke(near);
      g.globalAlpha = SPILL.shadeA; g.translate(SPILL_SHADE_OFF[0], SPILL_SHADE_OFF[1]); for (const b of blades) g.fill(b);
      g.restore();
    };
    shade(ctx); this.onShadeMask(shade);
    ctx.save(); ctx.setTransform(M); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.fillStyle = fill; for (const b of blades) ctx.fill(b); if (tone) for (const b of blades) tone(() => ctx.fill(b)); ctx.restore();
  }
  /** T204: each course chunk as it is drawn, by its patch (made once a patch): for the ground chunks, and for the district chunks (their
   *  lines split coarser: RUGGED.courseStepLite) */
  private warpedCourses = new WeakMap<CoursePatch, CoursePatch>(); private warpedLite = new WeakMap<CoursePatch, CoursePatch>();
  /** a course chunk as it is drawn (T204): every fill ring, edge, soft and joint run, collar, wall top, lit edge, stair and spill run moved by
   *  the one world-space wobble (rugged-edges warpLine: each side split the same way whichever line it is in), so the course's straight runs
   *  waver like the painted areas' and its pieces still meet each other and the neighbour chunks' (gameplay keeps the grid's cells). lite: a
   *  district chunk's, its sides split coarser (a tile is a few px there: the same wobble within a px, far fewer points to draw) */
  private warpedCourse(c: CoursePatch, lite = false): CoursePatch {
    if (!this.rugged) return c;
    const cache = lite ? this.warpedLite : this.warpedCourses, step = lite ? RUGGED.courseStepLite : RUGGED.courseStep;
    let w = cache.get(c);
    if (!w) {
      const rings = (a: readonly Float32Array[]) => a.map(q => warpLine(q, true, step)), lines = (a: readonly Float32Array[]) => a.map(q => warpLine(q, false, step));
      const opt = (a: readonly Float32Array[] | undefined) => (a ? lines(a) : undefined);
      const st = c.st?.slice();
      if (st) for (let q = 0; q + 4 < st.length; q += 5) { const [x, y] = warpPoint(st[q]!, st[q + 1]!); st[q] = x; st[q + 1] = y; }
      w = {
        ...c,
        layers: c.layers.map(l => ({
          ...l, fill: rings(l.fill), edges: lines(l.edges), soft: opt(l.soft), joint: opt(l.joint),
          collar: l.collar && { ...l.collar, fill: rings(l.collar.fill), edges: lines(l.collar.edges), soft: opt(l.collar.soft) },
        })),
        walls: c.walls?.map(x => ({ ...x, p: warpTriples(x.p, step) })), rims: c.rims?.map(r => ({ ...r, p: warpLine(r.p, false, step) })), st,
        spill: c.spill?.map(s => ({ ...s, p: warpLine(s.p) })),
      };
      cache.set(c, w);
    }
    return w;
  }
  /** forget the planner map's colours (the Grass setting changed: the grass is another picture) */
  resetPlanColours() { this.planCols.clear(); this.planPics.clear(); this.wallPics.clear(); }
  /** the painted looks changed (the studio saved the surfaces, or the Grass setting): the compositions made with the old ones go */
  resetPainted() { this.resetPlanColours(); this.composed.clear(); this.composedBytes = 0; }
  blocks: PlanBlocks = new Float32Array(0);
  /** hillshade per height sample, and the waterways with their bboxes (grown for the shore) */
  shade: Float32Array = new Float32Array(HS * HS);
  /** slope magnitude per height sample (bare rock on the steep faces) */
  slope: Float32Array = new Float32Array(HS * HS);
  /** the course height (T027), CH_SIZE² samples; any: some height is not 0. Its light is baked per chunk (heightLight, T126) */
  courseH = new Float32Array(CH_SIZE * CH_SIZE); courseAny = false;
  /** the course height light's strength (T126): light.json's, or the gear menu's Slope light (0 = off) */
  slopeLight = HEIGHT_LIGHT_STRENGTH;
  waters: { w: Waterway; box: BBox }[] = [];
  /** lot ground patches by lot key, and a grid (LOT_CELL tiles) of the patches they cover, keyed by cell */
  lotPatches = new Map<string, LotPatch[]>();
  private lotGrid = new Map<number, LotPatch[]>();
  constructor(public terrain: Uint8Array, public net: RoadNetwork, public tex: Textures) {}
  /** the screen textures laid on the ground (isoImage), per source picture */
  private isoPics = new WeakMap<Cnv, Cnv>();
  /** take a new terrain: classes, height samples and waterways */
  setTerrain(cls: Uint8Array, height: Float32Array, waters: Waterway[]) { this.terrainVer++; this.terrain.set(cls); this.shade = shadeField(height); this.slope = slopeField(height); this.waters = waters.map(w => ({ w, box: waterBox(w.pts, 4) })); this.swampField = new SwampField(swampStreams(waters)); }
  /** a sub-rect of the course height from the main thread (samples i0.., j0.., w by h, row-major): copied in (the chunks it lights re-bake) */
  setCourse(i0: number, j0: number, w: number, h: number, data: Float32Array) {
    for (let j = 0; j < h; j++) this.courseH.set(data.subarray(j * w, (j + 1) * w), (j0 + j) * CH_SIZE + i0);
    this.courseAny ||= data.some(v => v !== 0);
  }
  /** apply lot ground edits: each key in `set` replaces its patches, each key in `drop` loses them */
  setLotGround(set: [string, LotPatch[]][], drop: string[]) {
    for (const k of drop) this.lotRemove(k);
    for (const [k, ps] of set) { this.lotRemove(k); if (ps.length) { this.lotPatches.set(k, ps); for (const p of ps) this.lotCells(p, c => { const l = this.lotGrid.get(c); if (l) l.push(p); else this.lotGrid.set(c, [p]); }); } }
  }
  private lotRemove(k: string) {
    const old = this.lotPatches.get(k); if (!old) return; this.lotPatches.delete(k);
    for (const p of old) this.lotCells(p, c => { const l = this.lotGrid.get(c); if (!l) return; const i = l.indexOf(p); if (i >= 0) l.splice(i, 1); if (!l.length) this.lotGrid.delete(c); });
  }
  /** the grid cells a patch's box covers */
  private lotCells(p: LotPatch, fn: (c: number) => void) {
    const b = quadBox(p.pts);
    for (let cx = Math.floor(b[0] / LOT_CELL); cx <= Math.floor(b[2] / LOT_CELL); cx++) for (let cy = Math.floor(b[1] / LOT_CELL); cy <= Math.floor(b[3] / LOT_CELL); cy++) fn((cx + 1024) * 4096 + cy + 1024);
  }
  /** the lot patches that may touch a tile box (each once) */
  lotsIn(b: BBox): LotPatch[] {
    const out = new Set<LotPatch>();
    for (let cx = Math.floor(b[0] / LOT_CELL); cx <= Math.floor(b[2] / LOT_CELL); cx++) for (let cy = Math.floor(b[1] / LOT_CELL); cy <= Math.floor(b[3] / LOT_CELL); cy++) for (const p of this.lotGrid.get((cx + 1024) * 4096 + cy + 1024) ?? []) out.add(p);
    return [...out];
  }
  private buffer(name: string, W: number, H: number) {
    const c = this.bufferKeep(name, W, H); ctx2d(c).clearRect(0, 0, W, H); return c;
  }
  /** a named scratch buffer at least W x H (it only grows: no reallocation for each smaller box), its drawing state reset, its pixels kept */
  private bufferAtLeast(name: string, W: number, H: number) {
    const c = this.scratch.get(name);
    return this.bufferKeep(name, Math.max(W, c?.width ?? 0), Math.max(H, c?.height ?? 0));
  }
  /** a named scratch buffer W x H with its drawing state reset but its pixels kept (a caller that uses only a box of it clears or overwrites
   *  that box itself, rather than the whole chunk-sized canvas) */
  private bufferKeep(name: string, W: number, H: number) {
    let c = this.scratch.get(name); if (!c) { c = canvas(W, H); this.scratch.set(name, c); }
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    const g = ctx2d(c); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; return c;
  }
  /** the tile box a world-px rectangle covers (plus a margin) */
  static tileBox(X0: number, Y0: number, X1: number, Y1: number, pad = 1): BBox {
    const corners = [tileOf(X0, Y0), tileOf(X1, Y0), tileOf(X0, Y1), tileOf(X1, Y1)];
    return [Math.floor(Math.min(...corners.map(p => p.x))) - pad, Math.floor(Math.min(...corners.map(p => p.y))) - pad, Math.ceil(Math.max(...corners.map(p => p.x))) + pad, Math.ceil(Math.max(...corners.map(p => p.y))) + pad];
  }

  /** the planner colour of a texture: its mean RGB at the planner mip, 20% desaturated and lifted 5% (cached). It never depends on what this worker has built
   *  (every worker must plan the same colour): a lazy photo with no planner mip of its own uses its Paint swatch */
  /** the woodland floor's texture: its painted look when it has one (T128: its own surface, so a forest on the planner map need not wear the
   *  course's fescue), else the course's Fescue */
  private woodlandTex(): string { return this.tex.isPainted(WOODLAND) ? WOODLAND : WOODLAND_TEX; }
  private planColour(name: string): string {
    let c = this.planCols.get(name);
    if (!c) {
      // a painted texture: its look's mean colour (painted-families.ts lookColour, from the registry: the same in every worker)
      const pm = this.tex.paintedMean(name);
      if (pm) { const r = parseInt(pm.slice(1, 3), 16), g = parseInt(pm.slice(3, 5), 16), b = parseInt(pm.slice(5, 7), 16), y = 0.3 * r + 0.59 * g + 0.11 * b, lift = (v: number) => Math.round(Math.min(255, (v * 0.8 + y * 0.2) * 1.05)); c = `rgb(${lift(r)},${lift(g)},${lift(b)})`; this.planCols.set(name, c); return c; }
      // (a photo or a procedural texture a light boot has not made yet, T157: its Paint swatch, as a lazy photo's: never made for a colour; the
      // game's lazy ones, T166, are made for it: the same colour as ever)
      const img = name === 'lotAsphalt' ? this.tex.mosaicFor('lot', 0.035) : EAGER_PHOTO.has(name) && !GROUND_PHOTO.has(name) ? ((this.tex.makeForColour ? this.tex.built(name) : this.tex.mosaics.has(name)) ? this.tex.mosaicFor(name, 0.035) : null) : (this.tex.makeForColour ? this.tex.hasImage(name, 0.035) : this.tex.mips.has(name + '@0.035')) ? this.tex.image(name as TexName, 0.035) : null;
      if (!img || img === PLACEHOLDER) return PAINT_COL.get(name) ?? '#808080'; // (not kept: a texture being made, T168)
      const d = ctx2d(img).getImageData(0, 0, img.width, img.height).data, n = d.length / 4;
      let r = 0, g = 0, b = 0; for (let k = 0; k < d.length; k += 4) { r += d[k]; g += d[k + 1]; b += d[k + 2]; }
      const y = (0.3 * r + 0.59 * g + 0.11 * b) / n, lift = (s: number) => Math.round(Math.min(255, (s / n * 0.8 + y * 0.2) * 1.05));
      c = `rgb(${lift(r)},${lift(g)},${lift(b)})`; this.planCols.set(name, c);
    }
    return c;
  }

  /** the far-zoom map: flat terrain colours, sidewalks and roads as solid fills, building footprints */
  paintPlan(i: number, j: number, L: number): Cnv {
    const W = Math.round(PLAN_W * L), H = Math.round(PLAN_H * L), X0 = i * PLAN_W, Y0 = j * PLAN_H;
    const cv = canvas(W, H), ctx = ctx2d(cv);
    this.shadeMask = null; this.specMask = null; this.glossMask = null; this.swampNow = null; // (T186, T215, T199: a planner bake keeps no shade, reflection or gloss mask)
    const M = new DOMMatrix([HW * L, HH * L, -HW * L, HH * L, -X0 * L, -Y0 * L]);
    const box = GroundPainter.tileBox(X0, Y0, X0 + PLAN_W, Y0 + PLAN_H, 2), [tx0, ty0, tx1, ty1] = box;
    // the tile set families (T145) lay their tiles here as on the ground chunks (planTiled), at the camera's band (the furthest zoom: FAR)
    this.chunkNow = { key: `p${i},${j}@${L}`, L, box, M, Minv: M.inverse(), W, H }; this.toned.clear(); this.bakeKeys.clear(); this.tilesUsed = false; this.provisional = false;
    ctx.fillStyle = '#2c3a20'; ctx.fillRect(0, 0, W, H);
    ctx.setTransform(M);
    // the map grass: its look's far painting (it covers the map once, so it never repeats), else its flat colour
    const planTex = (t: string): CanvasPattern | string => { const tp = this.planTiled(ctx, t); if (tp) return tp; const pp = this.planPicture(t); if (!pp) return this.planColour(t); const pat = ctx.createPattern(pp.img, 'repeat')!, k = pp.period / pp.img.width; pat.setTransform(new DOMMatrix([k, 0, 0, k, 0, 0])); return pat; };
    ctx.fillStyle = planTex('grass'); ctx.fillRect(0, 0, MAP, MAP);
    // meadow and forest in 4 x 4 tile blocks (the planner never shows finer detail)
    const mx0 = Math.max(0, tx0), mx1 = Math.min(MAP, tx1), my0 = Math.max(0, ty0), my1 = Math.min(MAP, ty1), byType = new Map<number, Path2D>();
    for (let y = my0 - (my0 % 4); y < my1; y += 4) for (let x = mx0 - (mx0 % 4); x < mx1; x += 4) { const t = this.terrain[y * MAP + x]; if (t !== TC.PATCH && t !== TC.HILL) continue; let p = byType.get(t); if (!p) byType.set(t, (p = new Path2D())); p.rect(x, y, 4, 4); }
    for (const [t, p] of byType) { ctx.fillStyle = planTex(t === TC.PATCH ? 'meadow' : this.woodlandTex()); ctx.fill(p); }
    // bare rock on the steep faces, as a flat colour (before the river banks, so they read on top)
    const ra = rockAlpha(this.slope, tx0, ty0, tx1 - tx0, ty1 - ty0, 0.25, this.edgeNoise);
    if (ra) { const rb = this.buffer('small', ra.W, ra.H), rg = ctx2d(rb); rg.putImageData(new ImageData(ra.data as Uint8ClampedArray<ArrayBuffer>, ra.W, ra.H), 0, 0); rg.globalCompositeOperation = 'source-in'; rg.fillStyle = this.planColour('rock'); rg.fillRect(0, 0, ra.W, ra.H); rg.globalCompositeOperation = 'source-over'; ctx.setTransform(M); ctx.drawImage(rb, tx0, ty0, ra.W / 0.25, ra.H / 0.25); }
    // river banks, creeks and the water, then the hillshade (as on the ground), so the planner reads the valley too
    const vis = (b: BBox) => b[2] >= tx0 && b[0] <= tx1 && b[3] >= ty0 && b[1] <= ty1, near = this.waters.filter(w => vis(w.box));
    const shape = (kind: 'river' | 'creek', extra: number, col: string) => { const p = new Path2D(); let any = false; for (const w of near) if (w.w.kind === kind) any = waterShape(p, w.w.pts, extra, box) || any; if (any) { ctx.fillStyle = col; ctx.fill(p); } };
    // T199: the streams' swamp band (as the ground's, swamp.ts), in the swamp's look, under the river's banks
    const sa = this.swampOn() ? this.swampField.alpha(tx0, ty0, tx1 - tx0, ty1 - ty0, 0.25) : null;
    if (sa) {
      const sb = this.buffer('swampBand', sa.W, sa.H); ctx2d(sb).putImageData(new ImageData(sa.data as Uint8ClampedArray<ArrayBuffer>, sa.W, sa.H), 0, 0);
      const lb = this.buffer('layer', W, H), lg = ctx2d(lb); lg.setTransform(M); lg.imageSmoothingEnabled = true; lg.drawImage(sb, tx0, ty0, sa.W / 0.25, sa.H / 0.25);
      lg.globalCompositeOperation = 'source-in'; lg.fillStyle = this.planTiled(lg, 'swamp') ?? this.planColour('swamp'); lg.fillRect(tx0, ty0, tx1 - tx0, ty1 - ty0); lg.globalCompositeOperation = 'source-over';
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(lb, 0, 0); ctx.restore(); ctx.setTransform(M);
    }
    shape('river', 3, this.planColour('bank'));
    const sm = shadeRGBA(this.shade, tx0, ty0, tx1 - tx0, ty1 - ty0, 0.25), sb = this.buffer('small', sm.W, sm.H);
    ctx2d(sb).putImageData(new ImageData(sm.data as Uint8ClampedArray<ArrayBuffer>, sm.W, sm.H), 0, 0); ctx.setTransform(M); ctx.drawImage(sb, tx0, ty0, sm.W / 0.25, sm.H / 0.25);
    shape('river', 0, this.planColour('water'));
    shape('creek', 0, this.planColour('water'));
    // lot ground as flat fills (before the roads, so the kerbs stay on top)
    const planFill = (t: PatchTex) => t === 'asphalt' || t === 'asphaltDark' || t === 'asphaltWorn' ? PLAN_ASPHALT : t === 'slabs' ? '#9a9184' : t === 'concrete' ? '#48443f' : this.planColour(t);
    const lotAll = this.lotsIn(box).filter(p => !p.top), paintsP = lotAll.filter(p => p.paint || p.course).sort((a, b) => paintZ(a) - paintZ(b));
    for (const p of [...lotAll.filter(p => !p.paint && !p.course && p.tex !== 'marks' && !(p.lawn && p.lawn.share < 1)), ...paintsP]) {
      // a course chunk: each surface's collar band and fill rings in their flat planner colours (even-odd)
      if (p.course) { for (const l of p.course.layers) for (const [t, rings] of [...(l.collar ? [[l.collar.tex, l.collar.fill] as const] : []), [l.tex, l.fill] as const]) { if (!rings.length) continue; const path = new Path2D(); for (const q of rings) ringPath(path, q); ctx.fillStyle = this.planTiled(ctx, t) ?? this.planColour(t); ctx.fill(path, 'evenodd'); } this.planSeeded(ctx, p.course); continue; }
      ctx.fillStyle = planFill(p.tex); ctx.fill(polyPath(p.pts));
    }
    // the course height's light over the painted course (T028b, T126): over the lot and paint fills, under the roads
    if (this.courseAny && this.slopeLight > 0) { const hl = heightLightGrid(this.courseH, box, 0.25); if (hl) this.heightLight(ctx, hl, M, W, H, L); ctx.setTransform(M); }
    const v = this.net.view(box), minW = 1.2 / (TILE_PX * L);
    const fill = (list: Feature[], col: string) => { ctx.strokeStyle = ctx.fillStyle = col; ctx.lineJoin = 'round'; for (const f of list) { ctx.lineCap = f.cap; if (f.kind === 'stroke') { ctx.lineWidth = Math.max(minW, f.w); ctx.stroke(f.path); } else ctx.fill(f.path); } };
    fill(v.walkF.filter(f => f.tex !== 'turf'), '#9a9184');
    for (const [kind, look] of CART_SURFACE) fill(v.asphF.filter(f => f.tex === kind), look.plan); // the starter cart paths (T084), under the roads
    fill(v.asphF.filter(f => f.tex === 'gravel'), '#404040'); fill(v.asphF.filter(f => f.tex !== 'gravel' && !CART_SURFACE.has(f.tex)), '#3c4150'); fill(v.medianF, '#557a35');
    ctx.fillStyle = '#557a35'; for (const r of v.rbIslands) { ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2); ctx.fill(); }
    // tunnel routes have no road fills, so the planner marks them with a dashed line
    ctx.strokeStyle = 'rgba(60,65,80,0.85)'; ctx.lineCap = 'butt'; ctx.setLineDash([3, 2]);
    for (const t of v.tunnels) { ctx.lineWidth = Math.max(minW, t.w); ctx.stroke(linePath(t.pts, false)); }
    ctx.setLineDash([]);
    const b = this.blocks;
    for (let k = 0; k + 4 < b.length; k += 5) { if (b[k + 2] < tx0 || b[k] > tx1 || b[k + 3] < ty0 || b[k + 1] > ty1) continue; ctx.fillStyle = PLAN_BLOCK_COLOURS[b[k + 4] | 0] ?? PLAN_BLOCK_COLOURS[0]; ctx.fillRect(b[k], b[k + 1], b[k + 2] - b[k], b[k + 3] - b[k + 1]); }
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = Math.max(0.3, minW); ctx.strokeRect(0, 0, MAP, MAP);
    return cv;
  }

  /** the course height's light (T126, ext/course-height/light.ts) on the W x H chunk ctx draws at cache level L, whose tile to pixel matrix
   *  is M, from its light grid g. All of it is canvas compositing on the GPU over the pixels the light touches, never a read-back (which
   *  would stall the bake until the GPU caught up: 50-150 ms a chunk):
   *  - the shade: the grid's shade picture multiplied in (a cool tint; the texture stays);
   *  - the luminance masks (HL_MASK): the texels' luminance (a grey 'luminosity' copy) over its neighbourhood's mean (a blur of it, its edges
   *    grown so the chunk's border has a neighbourhood too): q = L / mean by 'color-dodge' over 1 − mean; the lift's mask clamp(2 (q − 0.45))
   *    by 'lighten' then 'difference' with a grey, doubled; the highlight's, clamp(4 (q − 1)), from max(0, L − mean) / mean, doubled twice;
   *  - the lift: the texels times their mask times the lift picture, added ('lighter'): c × (1 + gain × mask);
   *  - the highlight: its mask times the warm highlight picture, screened over ('screen') */
  private heightLight(ctx: C2D, g: HeightLightGrid, M: DOMMatrix, W: number, H: number, L: number) {
    const s = this.slopeLight; if (!(s > 0)) return;
    const r = heightLightRect(g, M, W, H); if (!r) return;
    const [x0, y0, x1, y1] = r, rw = x1 - x0, rh = y1 - y0, src = ctx.canvas as Cnv, pics = heightLightPictures(g, s);
    /** a picture of the grid stretched over the rect (bilinear between the light points) onto g2, through M shifted to the rect */
    const stretch = (g2: C2D, name: string, data: Uint8ClampedArray) => {
      const p = this.buffer(name, g.w, g.h); ctx2d(p).putImageData(new ImageData(data as Uint8ClampedArray<ArrayBuffer>, g.w, g.h), 0, 0);
      g2.setTransform(M.a, M.b, M.c, M.d, M.e - x0, M.f - y0); g2.imageSmoothingEnabled = true; g2.drawImage(p, g.x0, g.y0, g.w / g.res, g.h / g.res); g2.setTransform(1, 0, 0, 1, 0, 0);
    };
    /** a rect-sized buffer, filled with `fill` (opaque) or a copy of the chunk's rect */
    const rect = (name: string, fill: string | null) => { const b = this.buffer(name, rw, rh), bg = ctx2d(b); if (fill) { bg.fillStyle = fill; bg.fillRect(0, 0, rw, rh); } else bg.drawImage(src, x0, y0, rw, rh, 0, 0, rw, rh); return { b, bg }; };
    const op = (g2: C2D, o: GlobalCompositeOperation, draw: () => void) => { g2.globalCompositeOperation = o; draw(); g2.globalCompositeOperation = 'source-over'; };
    // the shade, straight onto the chunk (the picture is white where nothing is shaded)
    const sh = rect('hlShade', '#fff'); stretch(sh.bg, 'hlShadePic', pics.shade);
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'multiply'; ctx.drawImage(sh.b, x0, y0); ctx.restore();
    this.onShadeMask(m => { m.setTransform(1, 0, 0, 1, 0, 0); m.globalCompositeOperation = 'multiply'; m.drawImage(sh.b, x0, y0); });
    // the luminance, its neighbourhood's mean (a Gaussian, on a copy grown by P px so the edges have one) and 1 − mean
    const lum = rect('hlLum', '#808080'); op(lum.bg, 'luminosity', () => lum.bg.drawImage(src, x0, y0, rw, rh, 0, 0, rw, rh));
    const sig = Math.max(1.5, LUMA_SIGMA_PER_L * L), P = Math.ceil(3 * sig) + 1;
    const pad = this.buffer('hlPad', rw + 2 * P, rh + 2 * P), pg = ctx2d(pad); pg.imageSmoothingEnabled = true; pg.drawImage(lum.b, 0, 0, rw + 2 * P, rh + 2 * P); pg.drawImage(lum.b, P, P);
    const mean = this.buffer('hlMean', rw + 2 * P, rh + 2 * P), mg = ctx2d(mean); mg.filter = `blur(${sig.toFixed(1)}px)`; mg.drawImage(pad, 0, 0); mg.filter = 'none';
    const inv = rect('hlInv', '#fff'); op(inv.bg, 'difference', () => inv.bg.drawImage(mean, -P, -P));
    // the lift's mask: q = min(1, L / mean), then clamp(2 (q − 0.45))
    const grey = (v: number) => { const c = Math.round(v * 255); return `rgb(${c},${c},${c})`; };
    const ml = rect('hlLiftMask', null); ml.bg.drawImage(lum.b, 0, 0);
    op(ml.bg, 'color-dodge', () => ml.bg.drawImage(inv.b, 0, 0));
    ml.bg.fillStyle = grey(HL_MASK.liftLo); op(ml.bg, 'lighten', () => ml.bg.fillRect(0, 0, rw, rh)); op(ml.bg, 'difference', () => ml.bg.fillRect(0, 0, rw, rh));
    for (let k = HL_MASK.liftK; k > 1; k /= 2) op(ml.bg, 'lighter', () => ml.bg.drawImage(ml.b, 0, 0));
    // the highlight's mask: max(0, L − mean) / mean = q − 1, then clamp(4 (q − 1))
    const ms = rect('hlSpecMask', null); ms.bg.drawImage(lum.b, 0, 0);
    op(ms.bg, 'lighten', () => ms.bg.drawImage(mean, -P, -P)); op(ms.bg, 'difference', () => ms.bg.drawImage(mean, -P, -P));
    op(ms.bg, 'color-dodge', () => ms.bg.drawImage(inv.b, 0, 0));
    for (let k = HL_MASK.specK; k > 1; k /= 2) op(ms.bg, 'lighter', () => ms.bg.drawImage(ms.b, 0, 0));
    // the lift: c × mask × gain, added; then the highlight: mask × warm colour, screened (both pictures black where there is no light)
    const lift = rect('hlLift', null), gain = rect('hlGain', '#000'); stretch(gain.bg, 'hlLiftPic', pics.lift);
    op(lift.bg, 'multiply', () => { lift.bg.drawImage(ml.b, 0, 0); lift.bg.drawImage(gain.b, 0, 0); });
    const warm = rect('hlGain', '#000'); stretch(warm.bg, 'hlSpecPic', pics.spec);
    op(ms.bg, 'multiply', () => ms.bg.drawImage(warm.b, 0, 0));
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(lift.b, x0, y0);
    ctx.globalCompositeOperation = 'screen'; ctx.drawImage(ms.b, x0, y0);
    ctx.restore();
  }

  /** a top-down texture as it lies on the ground in the 2:1 view: the picture at half its height (exactly half, so each pixel is the mean of
   *  two rows), two periods tall so it still tiles; cached per picture */
  private isoImage(img: Cnv) {
    let c = this.isoPics.get(img);
    if (!c) { c = canvas(img.width, img.height); const g = ctx2d(c), p = g.createPattern(img, 'repeat')!; p.setTransform(new DOMMatrix([1, 0, 0, 0.5, 0, 0])); g.fillStyle = p; g.fillRect(0, 0, c.width, c.height); this.isoPics.set(img, c); }
    return c;
  }
  /** a screen-space texture aligned to the world origin, for a context whose transform is the chunk's iso matrix; laid on the ground (isoImage),
   *  so its grass, soil and water read in the 2:1 view like the roads' tile-space photos. The base grass and the textures made from it lie at
   *  the owner's angle and tilt (Textures.grassLay): then the pattern itself is turned and squashed (it still tiles at any angle). */
  private screenPattern(g: C2D, name: TexName, L: number, X0: number, Y0: number, Minv: DOMMatrix, G?: DOMMatrix) {
    const lay = name === 'grass' || name === 'meadow' || name === 'outside' ? this.tex.grassLay : null;
    if (!lay || (lay.angle === 0 && lay.tilt === 0.5)) {
      const img = this.isoImage(this.tex.image(name, L)), p = g.createPattern(img, 'repeat')!;
      const ox = ((X0 * L) % img.width + img.width) % img.width, oy = ((Y0 * L) % img.height + img.height) % img.height;
      const T0 = Minv.multiply(new DOMMatrix([1, 0, 0, 1, -ox, -oy])); p.setTransform(G ? G.multiply(T0) : T0); return p;
    }
    // the world origin (canvas -X0 L, -Y0 L) in the pattern's own px, brought within one period so the numbers stay small
    const img = this.tex.image(name, L), p = g.createPattern(img, 'repeat')!, A = layOnGround(lay.angle, lay.tilt), o = A.inverse().transformPoint(new DOMPoint(-X0 * L, -Y0 * L));
    const T0 = Minv.multiply(new DOMMatrix([1, 0, 0, 1, 0, 0]).multiply(A).translate(((o.x % img.width) + img.width) % img.width, ((o.y % img.height) + img.height) % img.height));
    p.setTransform(G ? G.multiply(T0) : T0); return p;
  }
  /** the asphalt mosaic, which lives in ground (tile) space: one period = period tiles (MOSAIC_TILES by default); G turns it about the origin */
  private groundPattern(g: C2D, img: Cnv, G?: DOMMatrix, period = MOSAIC_TILES) {
    const p = g.createPattern(img, 'repeat')!, s = period / img.width, S = new DOMMatrix([s, 0, 0, s, 0, 0]); p.setTransform(G ? G.multiply(S) : S); return p;
  }
  /** a Paint photo texture (an owner's preset or a grass-art PHOTO_TEX photo) as a tile-space fill under the current transform, as the painted
   *  areas lay it: the photo itself at the mip L * sx asks for (the mosaic only when the source is missing), turned and scaled by G; its flat
   *  Paint swatch while this worker has not built it (Textures.ensure) */
  private paintPhoto(g: C2D, t: string, L: number, G?: DOMMatrix, sx = 1, need?: BBox): CanvasPattern | string {
    const painted = this.paintedFill(g, t, need, sx); if (painted) return painted;
    if (!this.tex.has(t)) return PAINT_COL.get(t) ?? '#808080';
    const src = this.tex.sourceFor(t, L * sx);
    return src ? this.groundPattern(g, src.img, G, src.period) : this.groundPattern(g, this.tex.mosaicFor(t, L * sx), G, this.tex.periodOf(t));
  }
  /** the ground photo that replaces a painted ground texture (GROUND_PHOTO), in tile space under the current transform; null when there is none
   *  or this worker has not built it (the caller paints the screen texture) */
  private photoFill(g: C2D, t: string, L: number): CanvasPattern | null {
    const painted = this.paintedFill(g, t); if (painted) return painted;
    const photo = GROUND_PHOTO.get(t); if (!photo || !this.tex.has(photo)) return null;
    const k = GROUND_SCALE.get(t) ?? 1;
    return this.groundPattern(g, this.tex.mosaicFor(photo, L * k), undefined, this.tex.periodOf(photo) * k);
  }

  /** a painted texture (Textures.paintedOf) as a fill for the chunk being baked, in its pixels under the chunk's matrix: the look composed once
   *  per chunk (painted-ground.ts; never turned with an area, which would turn its painted light; an area's scale scales the look), over the
   *  part of the chunk asked for (need: a tile box; absent: all of it), then its tint and tone over a copy; null when the texture is not
   *  painted (the Grass setting 'photo', or its pictures missing: then it is laid as its photo) */
  private paintedFill(g: C2D, t: string, need?: BBox, scale = 1): CanvasPattern | null {
    const c = this.chunkNow, buf = c && this.paintedBuf(t, need, scale); if (!c || !buf) return null;
    const p = g.createPattern(buf, 'no-repeat')!; p.setTransform(c.Minv); return p;
  }
  /** the cells (PAINT_CELL device px squares of the chunk being baked) a tile box covers, as cell indices [i0, j0, i1, j1) */
  private cellsOf(need?: BBox): [number, number, number, number] {
    const c = this.chunkNow!, cw = Math.ceil(c.W / PAINT_CELL), chh = Math.ceil(c.H / PAINT_CELL);
    if (!need) return [0, 0, cw, chh];
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of [[need[0], need[1]], [need[2], need[1]], [need[0], need[3]], [need[2], need[3]]] as const) { const X = c.M.a * x + c.M.c * y + c.M.e, Y = c.M.b * x + c.M.d * y + c.M.f; x0 = Math.min(x0, X); x1 = Math.max(x1, X); y0 = Math.min(y0, Y); y1 = Math.max(y1, Y); }
    return [Math.max(0, Math.floor((x0 - 4) / PAINT_CELL)), Math.max(0, Math.floor((y0 - 4) / PAINT_CELL)), Math.min(cw, Math.ceil((x1 + 4) / PAINT_CELL)), Math.min(chh, Math.ceil((y1 + 4) / PAINT_CELL))];
  }
  /** brings the cells of `want` in entry e up to date: the bounding rectangle of the missing ones is drawn by fill (clipped to it), then marked */
  private fillCells(e: PaintedEntry, want: [number, number, number, number], fill: (g: C2D, rect: [number, number, number, number]) => boolean): boolean {
    const cw = Math.ceil(e.buf.width / PAINT_CELL);
    let i0 = Infinity, j0 = Infinity, i1 = -Infinity, j1 = -Infinity;
    for (let j = want[1]; j < want[3]; j++) for (let i = want[0]; i < want[2]; i++) if (!e.cells[j * cw + i]) { i0 = Math.min(i0, i); i1 = Math.max(i1, i + 1); j0 = Math.min(j0, j); j1 = Math.max(j1, j + 1); }
    if (i0 === Infinity) return true;
    const rect: [number, number, number, number] = [i0 * PAINT_CELL, j0 * PAINT_CELL, Math.min(e.buf.width, i1 * PAINT_CELL) - i0 * PAINT_CELL, Math.min(e.buf.height, j1 * PAINT_CELL) - j0 * PAINT_CELL];
    const g = ctx2d(e.buf); g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.beginPath(); g.rect(rect[0], rect[1], rect[2], rect[3]); g.clip();
    const ok = fill(g, rect); g.restore();
    if (ok) for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) e.cells[j * cw + i] = 1;
    return ok;
  }
  private paintedBuf(t: string, need?: BBox, scale = 1): Cnv | null {
    const c = this.chunkNow!, p = this.tex.paintedOf(t, scale); if (!p) return null;
    if (p.tiled) return this.tiledBuf(p.tiled, need);
    const want = this.cellsOf(need), cw = Math.ceil(c.W / PAINT_CELL), chh = Math.ceil(c.H / PAINT_CELL);
    // the composition depends only on where the chunk is, its level, the look and the art level, never on its roads or lots: an edited chunk (a
    // road, a lot, every send of a course stroke) is baked again over the one it composed before
    const ck = `${c.key}:${p.key}@${this.tex.paintedArtLevel}`;
    let base = this.composed.get(ck);
    if (base) { this.composed.delete(ck); this.composed.set(ck, base); }
    else {
      base = { buf: canvas(c.W, c.H), cells: new Uint8Array(cw * chh), bytes: c.W * c.H * 4 };
      this.composed.set(ck, base); this.composedBytes += base.bytes;
    }
    this.bakeKeys.add(ck);
    for (const [k, v] of this.composed) { if (this.composedBytes <= COMPOSED_BYTES) break; if (this.bakeKeys.has(k)) continue; this.composed.delete(k); this.composedBytes -= v.bytes; }
    const ws = this.tex.paintedWeights(p), levels: LayLevel[] = ws.map(w => ({ pic: px => this.tex.paintedImage(p[w.detail].src, px), period: p[w.detail].metres / 2, weight: w.weight, map: coversMap(p[w.detail]) }));
    const B = base;
    if (!this.fillCells(B, want, (g, rect) => { g.setTransform(c.M); return this.painted.composeLevels(g, levels, this.rectTiles(rect), c.L); })) return null;
    if (p.tint === '#ffffff' && p.tone === 0) return B.buf;
    // the look's tint (multiplied) and tone (each colour times 1 + tone: darker multiplied, lighter the picture added to itself) over a copy
    const tk = `${ck}|${p.tint}|${p.tone}`;
    let tone = this.toned.get(tk);
    if (!tone) { tone = { buf: this.buffer('toned:' + this.toned.size, c.W, c.H), cells: new Uint8Array(cw * chh), bytes: 0 }; this.toned.set(tk, tone); }
    this.fillCells(tone, want, (g, rect) => {
      g.clearRect(rect[0], rect[1], rect[2], rect[3]); g.drawImage(B.buf, 0, 0);
      if (p.tint !== '#ffffff') { g.globalCompositeOperation = 'multiply'; g.fillStyle = p.tint; g.fillRect(rect[0], rect[1], rect[2], rect[3]); }
      if (p.tone < 0) { const v = Math.round(255 * (1 + p.tone)); g.globalCompositeOperation = 'multiply'; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(rect[0], rect[1], rect[2], rect[3]); }
      else if (p.tone > 0) { g.globalCompositeOperation = 'lighter'; g.globalAlpha = p.tone; g.drawImage(g.canvas, 0, 0); }
      return true;
    });
    return tone.buf;
  }
  /** a tile set family (T145, painted-tiles.ts) over the part of the chunk being baked asked for: its band's four whole tiles at the band's
   *  one world size (T150: native / (anchor x DPR), from the tile spec), laid edge to edge on the world-anchored grid, axis-aligned in the chunk's own (screen) axes, each the tile its cell's
   *  permutation names; edges snapped to whole px (every chunk at this level agrees: no gap, no overlap). As authored: no scale, tint, tone,
   *  drift, mask or blend. null when a tile is not decoded */
  private tiledBuf(tp: TiledPick, need?: BBox): Cnv | null {
    const c = this.chunkNow!, ts = this.tex.tileTs, want = this.cellsOf(need), cw = Math.ceil(c.W / PAINT_CELL), chh = Math.ceil(c.H / PAINT_CELL);
    const ck = `${c.key}:tiles:${tp.fam.id}@${tileKey(ts)}`;
    let base = this.composed.get(ck);
    if (base) { this.composed.delete(ck); this.composed.set(ck, base); }
    else { base = { buf: canvas(c.W, c.H), cells: new Uint8Array(cw * chh), bytes: c.W * c.H * 4 }; this.composed.set(ck, base); this.composedBytes += base.bytes; }
    this.bakeKeys.add(ck); this.tilesUsed = true;
    for (const [k, v] of this.composed) { if (this.composedBytes <= COMPOSED_BYTES) break; if (this.bakeKeys.has(k)) continue; this.composed.delete(k); this.composedBytes -= v.bytes; }
    const band = bandOf(ts), lv = tp.fam.levels[band], urls = tp.urls[band], [w, h] = tileSize(lv, ts), perm = tilePermutation(tp.fam.id, band, urls.length);
    // the chunk's origin in its raster px (a whole number at every cache level) and its raster scale (px per world px)
    const L = c.L, ox = -c.M.e, oy = -c.M.f;
    return this.fillCells(base, want, (g, rect) => {
      const X0 = (rect[0] + ox) / L, Y0 = (rect[1] + oy) / L, X1 = (rect[0] + rect[2] + ox) / L, Y1 = (rect[1] + rect[3] + oy) / L;
      // the mip drawn is at most twice the size it lands at (Textures.tileImage), so plain bilinear filtering keeps it sharp and cheap
      g.setTransform(1, 0, 0, 1, 0, 0); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'medium';
      for (const q of cellsIn(X0, Y0, X1, Y1, w, h)) {
        const [a, b, a2, b2] = snappedCell(q.ix, q.iy, w, h, L), img = this.tex.tileImage(urls[tileIndex(perm, q.ix, q.iy)]!, a2 - a);
        if (!img) return false;
        g.drawImage(img, a - ox, b - oy, a2 - a, b2 - b);
      }
      return true;
    }) ? base.buf : (this.provisional = true, null);
  }
  /** T199: the swamp's gloss over the chunk being baked (swamp.ts): each tile's gloss (glossTileOf) laid where tiledBuf lays its picture, over
   *  the band's box, at a GLOSS.maskK-th of the chunk's size; then cut to the band (its cover, swampNow) and off the stream's water and lip (cut,
   *  tile space). null when a tile is not decoded */
  private swampGloss(tp: TiledPick, need: BBox, cut: Path2D | null): OffscreenCanvas | null {
    const c = this.chunkNow!, sw = this.swampNow!, K = GLOSS.maskK, ts = this.tex.tileTs, band = bandOf(ts), lv = tp.fam.levels[band], urls = tp.urls[band];
    const [w, h] = tileSize(lv, ts), perm = tilePermutation(tp.fam.id, band, urls.length), L = c.L, ox = -c.M.e, oy = -c.M.f, [i0, j0, i1, j1] = this.cellsOf(need);
    const X0 = (i0 * PAINT_CELL + ox) / L, Y0 = (j0 * PAINT_CELL + oy) / L, X1 = (Math.min(c.W, i1 * PAINT_CELL) + ox) / L, Y1 = (Math.min(c.H, j1 * PAINT_CELL) + oy) / L;
    const out = new OffscreenCanvas(Math.max(1, Math.ceil(c.W / K)), Math.max(1, Math.ceil(c.H / K))), g = out.getContext('2d')!;
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'medium'; g.setTransform(1 / K, 0, 0, 1 / K, 0, 0);
    for (const q of cellsIn(X0, Y0, X1, Y1, w, h)) {
      const [a, b, a2, b2] = snappedCell(q.ix, q.iy, w, h, L), gl = this.glossTileOf(urls[tileIndex(perm, q.ix, q.iy)]!);
      if (!gl) return null;
      g.drawImage(gl, a - ox, b - oy, a2 - a, b2 - b);
    }
    const S = new DOMMatrix([1 / K, 0, 0, 1 / K, 0, 0]).multiply(c.M);
    g.globalCompositeOperation = 'destination-in'; g.setTransform(S); g.drawImage(sw.cv, sw.x0, sw.y0, sw.cv.width / sw.res, sw.cv.height / sw.res);
    if (cut) { g.globalCompositeOperation = 'destination-out'; g.fillStyle = '#000'; g.fill(cut); }
    return out;
  }
  /** T199: a swamp tile's gloss (swamp.ts glossTile at GLOSS.tileScale of its native size), made once (a read back of the tile, not of a chunk) */
  private glossTileOf(url: string): Cnv | null {
    const have = this.glossTiles.get(url); if (have) { this.glossTiles.delete(url); this.glossTiles.set(url, have); return have; }
    const img = this.tex.tileImage(url); if (!img) return null;
    const w = Math.max(1, Math.round(img.width * GLOSS.tileScale)), h = Math.max(1, Math.round(img.height * GLOSS.tileScale)), cv = canvas(w, h), g = ctx2d(cv, { willReadFrequently: true });
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(img, 0, 0, w, h);
    g.putImageData(new ImageData(glossTile(g.getImageData(0, 0, w, h).data, w, h) as Uint8ClampedArray<ArrayBuffer>, w, h), 0, 0);
    this.glossTiles.set(url, cv); trimLru(this.glossTiles, new Set([url]), GLOSS_TILES);
    return cv;
  }
  /** a tile set family's fill for the planner chunk being baked (its course surfaces), or null when the texture is no tile set */
  private planTiled(g: C2D, t: string): CanvasPattern | null {
    if (!this.tex.paintedOf(t)?.tiled) return null;
    return this.paintedFill(g, t);
  }
  /** the tile box a device-px rectangle of the chunk being baked covers (plus a tile) */
  private rectTiles(rect: readonly number[]): BBox {
    const c = this.chunkNow!, pts = [[rect[0]!, rect[1]!], [rect[0]! + rect[2]!, rect[1]!], [rect[0]!, rect[1]! + rect[3]!], [rect[0]! + rect[2]!, rect[1]! + rect[3]!]].map(([x, y]) => c.Minv.transformPoint(new DOMPoint(x, y)));
    return [Math.floor(Math.min(...pts.map(q => q.x))) - 1, Math.floor(Math.min(...pts.map(q => q.y))) - 1, Math.ceil(Math.max(...pts.map(q => q.x))) + 1, Math.ceil(Math.max(...pts.map(q => q.y))) + 1];
  }
  /** a texture's painted picture for the planner (its far painting, which covers the map, tinted and toned as its look has it), or null */
  private planPicture(t: string): { img: Cnv; period: number } | null {
    const p = this.tex.paintedOf(t); if (!p) return null;
    const k = `${p.key}|${p.tint}|${p.tone}`; let img = this.planPics.get(k) ?? null;
    if (!img) {
      const src = this.tex.paintedImage(p.far.src); if (!src) return null;
      img = canvas(src.width, src.height); const g = ctx2d(img); g.drawImage(src, 0, 0);
      if (p.tint !== '#ffffff') { g.globalCompositeOperation = 'multiply'; g.fillStyle = p.tint; g.fillRect(0, 0, img.width, img.height); }
      if (p.tone < 0) { const v = Math.round(255 * (1 + p.tone)); g.globalCompositeOperation = 'multiply'; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(0, 0, img.width, img.height); }
      else if (p.tone > 0) { g.globalCompositeOperation = 'lighter'; g.globalAlpha = p.tone; g.drawImage(src, 0, 0); }
      this.planPics.set(k, img);
    }
    return { img, period: p.far.metres / 2 };
  }
  /** one ground chunk (CHUNK_W x CHUNK_H world px) at cache level L: the full-quality bake. lite = a district chunk
   *  (MID_K x MID_K ground chunks) for far zooms, without the detail too small to see there (slab sprites, litter,
   *  decals, tyre marks, wheel wear, curb joints) */
  paint(i: number, j: number, L: number, lite = false): Cnv {
    const CW = CHUNK_W * (lite ? MID_K : 1), CH = CHUNK_H * (lite ? MID_K : 1);
    const W = Math.round(CW * L), H = Math.round(CH * L), X0 = i * CW, Y0 = j * CH;
    const cv = canvas(W, H), ctx = ctx2d(cv);
    const M = new DOMMatrix([HW * L, HH * L, -HW * L, HH * L, -X0 * L, -Y0 * L]), Minv = M.inverse();
    const pats = new Map<TexName, CanvasPattern>();
    const pat = (n: TexName) => { let p = pats.get(n); if (!p) { p = this.photoFill(ctx, n, L) ?? this.screenPattern(ctx, n, L, X0, Y0, Minv); pats.set(n, p); } return p; };
    const box = GroundPainter.tileBox(X0, Y0, X0 + CW, Y0 + CH), [tx0, ty0, tx1, ty1] = box, vis = (b: BBox) => b[2] >= tx0 && b[0] <= tx1 && b[3] >= ty0 && b[1] <= ty1;
    this.chunkNow = { key: `${lite ? 'm' : 'g'}${i},${j}@${L}`, L, box, M, Minv, W, H }; this.toned.clear(); this.bakeKeys.clear(); this.tilesUsed = false; this.provisional = false;
    // T186: the shade mask (a quarter of the chunk's size), white (no shade) until a shade is laid on it; none for a district chunk (its
    // sprites' shadows are a few px: the far meshes)
    this.specMask = null; this.glossMask = null; this.swampNow = null; this.waterNow = undefined;
    if (lite) this.shadeMask = null;
    else { const mc = new OffscreenCanvas(Math.max(1, Math.ceil(W / SHADE_MASK_K)), Math.max(1, Math.ceil(H / SHADE_MASK_K))), mg = mc.getContext('2d')!; mg.fillStyle = '#fff'; mg.fillRect(0, 0, mc.width, mc.height); this.shadeMask = { cv: mc, g: scaledContext(mg, 1 / SHADE_MASK_K), used: false }; }
    const minW = 1 / (TILE_PX * L), net = this.net.view([tx0 - 8, ty0 - 8, tx1 + 8, ty1 + 8], !lite), tex = this.tex;
    const paint = (g: C2D, f: Feature) => { g.lineCap = f.cap; if (f.kind === 'stroke') { g.lineWidth = f.w; g.stroke(f.path); } else g.fill(f.path); };
    const ring = (g: C2D, f: Feature, extra: number) => { g.lineCap = f.cap; if (f.kind === 'stroke') { g.lineWidth = f.w + extra; g.stroke(f.path); } else { g.lineWidth = extra; g.stroke(f.path); } };
    /** a chunk-sized mask of the given features (black where covered) */
    const maskOf = (name: string, feats: Feature[], extra = 0) => { const m = this.buffer(name, W, H), g = ctx2d(m); g.setTransform(M); g.lineJoin = 'round'; g.fillStyle = g.strokeStyle = '#000'; for (const f of feats) extra ? ring(g, f, extra) : paint(g, f); return m; };
    const composite = (buf: Cnv, op: GlobalCompositeOperation = 'source-over', alpha = 1) => { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = op; ctx.globalAlpha = alpha; ctx.drawImage(buf, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.setTransform(M); };
    const through = (buf: Cnv, mask: Cnv) => { const g = ctx2d(buf); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'destination-in'; g.drawImage(mask, 0, 0); g.globalCompositeOperation = 'source-over'; };
    ctx.setTransform(M); ctx.lineJoin = 'round'; ctx.lineCap = 'butt';

    // ---- 1. terrain: grass; meadow and forest floor through soft noise-edged class masks; river banks and creek beds from
    //      the smoothed waterway lines; the baked hillshade; then the river water (flat, so unshaded)
    ctx.fillStyle = pat('grass'); ctx.fillRect(tx0, ty0, tx1 - tx0, ty1 - ty0);
    if (L >= 0.05) { this.drawDressing(ctx, box, L, M); ctx.setTransform(M); }
    const bw = tx1 - tx0, bh = ty1 - ty0;
    /** an RGBA image over the tile box (res px per tile), stretched onto g through the iso transform (bilinear) */
    const overlay = (g: C2D, img: { data: Uint8ClampedArray; W: number; H: number }, res: number) => { const s = this.buffer('small', img.W, img.H); ctx2d(s).putImageData(new ImageData(img.data as Uint8ClampedArray<ArrayBuffer>, img.W, img.H), 0, 0); g.setTransform(M); g.imageSmoothingEnabled = true; g.drawImage(s, tx0, ty0, img.W / res, img.H / res); };
    /** a texture through a mask: `mask` draws alpha into a chunk buffer, the texture fills it (source-in), then it is composited */
    const layer = (name: TexName, mask: (g: C2D) => void, fill: (g: C2D) => CanvasPattern | string = g => this.photoFill(g, name, L) ?? this.screenPattern(g, name, L, X0, Y0, Minv)) => { const b = this.buffer('layer', W, H), g = ctx2d(b); mask(g); g.globalCompositeOperation = 'source-in'; g.setTransform(M); g.fillStyle = fill(g); g.fillRect(tx0, ty0, bw, bh); g.globalCompositeOperation = 'source-over'; composite(b); };
    /** the water: the photo in tile space (under M) when this worker has it, else the screen texture */
    const water = (g: C2D): CanvasPattern | string => this.photoFill(g, 'water', L) ?? this.screenPattern(g, 'water', L, X0, Y0, Minv);
    const cres = lite ? 1 : 4;
    const meadow = classAlpha(this.terrain, TC.PATCH, tx0, ty0, bw, bh, cres, this.edgeNoise); if (meadow) layer('meadow', g => overlay(g, meadow, cres));
    // the woodland floor: its painted look (painted-surfaces.ts WOODLAND, T128), else the course's Fescue (terrain-paint.ts WOODLAND_TEX), laid
    // in tile space at scale 1 like a painted course area
    const woods = classAlpha(this.terrain, TC.HILL, tx0, ty0, bw, bh, cres, this.edgeNoise); if (woods) layer('meadow', g => overlay(g, woods, cres), g => this.paintPhoto(g, this.woodlandTex(), L));
    const ra = rockAlpha(this.slope, tx0, ty0, bw, bh, cres, this.edgeNoise); if (ra) layer('rock', g => overlay(g, ra, cres));
    const near = this.waters.filter(w => vis(w.box)), rivers = near.filter(w => w.w.kind === 'river'), creeks = near.filter(w => w.w.kind === 'creek');
    /** a feathered waterway mask: 4 nested shapes from extra + f down to extra - f (tiles), each adding a quarter of the alpha */
    const shore = (g: C2D, list: typeof near, extra: number, f: number, scale = 1) => { g.setTransform(M); g.globalCompositeOperation = 'lighter'; g.fillStyle = 'rgba(0,0,0,0.25)'; for (let s = 0; s < 4; s++) { const p = new Path2D(); let any = false; for (const w of list) any = waterShape(p, w.w.pts, extra + f * (1 - (2 * s) / 3), box, scale) || any; if (any) g.fill(p); } g.globalCompositeOperation = 'source-over'; };
    // T199: the small streams as swamp (swamp.ts): the band in the swamp's painted look, under the river's bank (a river keeps its look; the
    //      band reaches past its waterway's box, so it is asked of the field, not of the creeks in view); with the glint on, its gloss onto the
    //      chunk's gloss mask. The old creek bed while the swamp is off or unpainted, or its tiles not decoded yet (provisional: baked again)
    const sw = this.swampOn() ? this.swampField.alpha(tx0, ty0, bw, bh, cres) : null, swBuf = sw ? this.paintedBuf('swamp', sw.box) : null;
    if (sw && swBuf) {
      const sb = this.buffer('swampBand', sw.W, sw.H); ctx2d(sb).putImageData(new ImageData(sw.data as Uint8ClampedArray<ArrayBuffer>, sw.W, sw.H), 0, 0);
      this.swampNow = { cv: sb, x0: tx0, y0: ty0, res: cres };
      layer('creek', g => { g.setTransform(M); g.imageSmoothingEnabled = true; g.drawImage(sb, tx0, ty0, sw.W / cres, sw.H / cres); }, g => { const p = g.createPattern(swBuf, 'no-repeat')!; p.setTransform(Minv); return p; });
      const tp = this.specCam ? this.tex.paintedOf('swamp')?.tiled : undefined;
      if (tp) { const cut = new Path2D(); let any = false; for (const w of creeks) any = waterShape(cut, w.w.pts, SWAMP.lip, box, SWAMP.water) || any; this.glossMask = this.swampGloss(tp, sw.box, any ? cut : null); }
    }
    if (rivers.length) layer('bank', g => shore(g, rivers, 3, 0.8));
    // the creek bed (with the swamp: a thin muddy lip round the water), then the stream's narrow water
    if (creeks.length) { layer('creek', g => (this.swampNow ? shore(g, creeks, SWAMP.lip, SWAMP.lipFeather, SWAMP.water) : shore(g, creeks, 0.5, 0.5))); layer('water', g => shore(g, creeks, 0, SWAMP.waterFeather, SWAMP.water), water); }
    const sres = lite ? 0.25 : 0.5, hs = shadeRGBA(this.shade, tx0, ty0, bw, bh, sres); overlay(ctx, hs, sres); ctx.setTransform(M);
    // (T186: its shade on the mask, not its light: only when it shades anything)
    if (this.shadeMask) { const d = hs.data.slice(); let any = false; for (let k = 3; k < d.length; k += 4) { if (d[k - 1]! >= 160) d[k] = 0; else if (d[k]! > 4) any = true; } if (any) this.onShadeMask(g => overlay(g, { data: d, W: hs.W, H: hs.H }, sres)); }
    if (rivers.length) layer('water', g => shore(g, rivers, 0, 0.3), water);
    // T230: the river's depth, light edge and reflections (water-look.ts), clipped to its water; with the glint on, its gloss
    if (rivers.length) this.waterOver(ctx, SITE.river, () => { const p = new Path2D(); for (const w of rivers) waterShape(p, w.w.pts, 0.3, box); return p; }, 'water', lite);

    const walk = net.walkF.filter(f => vis(f.bbox)), asph = net.asphF.filter(f => vis(f.bbox));
    const med = net.medianF.filter(f => vis(f.bbox)), isl = net.islandF.filter(f => vis(f.bbox));
    const rbs = net.rbIslands.filter(i => vis([i.x - i.r, i.y - i.r, i.x + i.r, i.y + i.r]));
    const brs = net.bridges.filter(b => vis(b.bbox)), ports = net.portals.filter(p => vis(p.bbox));
    /** the chunk transform shifted dy world px straight down the screen */
    const shiftM = (dy: number) => new DOMMatrix([1, 0, 0, 1, 0, dy * L]).multiply(M);
    // ---- 1a. lot ground (driveways, walks, car parks, yards) before the verges and roads: each patch in its surface,
    //      a thin dark rim (paving and pads: 0.08 tiles in) or a soft edge (asphalt: 0.15 tiles in), then the bay lines.
    //      The car parks (asphalt with bay lines) are drawn again over the Paint tool's areas (1a'), so a painted area cannot hide their bays
    const all = this.lotsIn(box).filter(p => !p.top && !p.layby), tops = this.lotsIn(box).filter(p => p.top && p.lines?.length && !p.layby), laybys = this.lotsIn(box).filter(p => p.layby);
    // T247: a lot's lawn of dirt or desert with a soft band (soft-edges.ts) is drawn after the other lawns at its level, so the band blends into them
    const softOn = this.softDirt, softLawn = (p: LotPatch) => softOn && p.lawn!.z >= 1 && p.lawn!.share >= 1 && this.softTex(this.lawnTexOf(p)) ? 1 : 0;
    const lawns = all.filter(p => p.lawn).sort((a, b) => a.lawn!.z - b.lawn!.z || (softOn ? softLawn(a) - softLawn(b) : 0)), marks = all.filter(p => p.tex === 'marks'), lots = all.filter(p => !p.paint && !p.course && !p.lawn && p.tex !== 'marks'), paints = all.filter(p => p.paint || p.course).sort((a, b) => paintZ(a) - paintZ(b));
    const isPark = (p: LotPatch) => !!p.lines?.length && p.tex !== 'field' && p.tex !== 'dirt', parks = lots.filter(isPark), rest = lots.filter(p => !isPark(p));
    // T247: what the dirt areas' soft bands may meet: the areas near the chunk (out to the band's reach), the course, and the order they are
    // drawn in (lawns, lot ground, painted areas, car parks; an area drawn later or alongside keeps the hard edge between them)
    const sw0 = softOn ? softWidth(L) : 0, sReach = softOn ? sw0 / 2 + Math.max(SOFT.ease, SOFT.easeK * sw0) + Math.max(SOFT.probe, SOFT.probeK * sw0) + 4 : 0;
    const softCands = softOn ? this.lotsIn([box[0] - sReach, box[1] - sReach, box[2] + sReach, box[3] + sReach]).filter(p => !p.top && !p.layby && p.tex !== 'marks') : [];
    const rankOf = (p: LotPatch): [number, number, number] => p.lawn ? [0, p.lawn.z, softLawn(p)] : p.course ? [2, -1e300, 0] : p.paint ? [2, p.paint.z, 0] : isPark(p) ? [3, 0, 0] : [1, 0, 0];
    const sc: SoftCtx | null = softOn ? {
      cands: softCands, courses: softCands.filter(p => p.course).map(p => this.warpedCourse(p.course!, lite)),
      rank: rankOf, areas: new Map(),
    } : null;
    if (sc) sc.areas = this.softAreasOf(sc.cands, sc.courses);
    /** T247: a dirt area's soft band over this chunk from its drawn outline (null: none here, it keeps its hard outline) */
    const softBand = (p0: LotPatch, ring: readonly number[], seam: number, grass = false) => (sc ? this.softBandOf(p0, ring, sc, L, box, seam, grass) : null);
    /** the lot ground patches of a list: each in its surface and rim, then its lines (furrows, white and yellow bays) */
    const drawLots = (list: LotPatch[]) => {
      if (!list.length) return;
      const lotAsph = list.some(p => p.tex === 'asphalt') ? this.groundPattern(ctx, tex.mosaicFor('lot', L)) : null;
      // the commercial yards' concrete: the darker gravel photo (the Paint tool's Chip seal, the owner's choice 2026-10-21; the road islands keep the painted concrete)
      const lotConc = list.some(p => p.tex === 'concrete') ? this.groundPattern(ctx, tex.mosaicFor('chipSeal', L), undefined) : null;
      for (const p of list) {
        const path = polyPath(p.pts);
        // T247: a lot's dirt (a dirt car park, a vegetable bed, a building site, a field) with its soft band where it meets grass
        if (sc && this.softTex(p.tex)) {
          const fill = pat(p.tex as TexName);
          this.softArea(ctx, softBand(p, p.pts, 0), M, () => { ctx.fillStyle = fill; ctx.fill(path); }, (g, r) => { g.fillStyle = fill; g.fillRect(r[0]!, r[1]!, r[2]! - r[0]!, r[3]! - r[1]!); }, path);
          continue;
        }
        if (p.tex === 'slabs') { ctx.save(); ctx.clip(path); ctx.fillStyle = tex.curb.top; ctx.fill(path); if (!lite) this.slabGrid(ctx, new DOMMatrix(), quadBox(p.pts), M); ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = pat('grime'); ctx.fill(path); ctx.restore(); ctx.setTransform(M); }
        else { ctx.fillStyle = p.tex === 'asphalt' ? lotAsph! : p.tex === 'concrete' ? lotConc! : pat(p.tex as TexName); ctx.fill(path); }
        if (p.tex === 'asphalt' || p.tex === 'paving' || p.tex === 'pad' || p.tex === 'concrete' || p.tex === 'slabs') {
          ctx.save(); ctx.clip(path); ctx.strokeStyle = p.tex === 'asphalt' ? 'rgba(12,10,8,0.5)' : 'rgba(0,0,0,0.3)'; ctx.lineWidth = p.tex === 'asphalt' ? 0.3 : 0.16; ctx.stroke(path); ctx.restore();
        }
      }
      // lines: parking bays in worn off-white; furrows (field and dirt patches, the farms' crop rows) in dark brown
      // (and yellow parking lines, the bay rows that ask for them)
      for (const kind of ['furrow', 'white', 'yellow'] as const) {
        const set = list.filter(p => p.lines && p.lines.length && ((p.tex === 'field' || p.tex === 'dirt') ? 'furrow' : p.lineCol === 'yellow' ? 'yellow' : 'white') === kind);
        if (!set.length) continue;
        const lb = this.buffer('lotLines', W, H), lg = ctx2d(lb); lg.setTransform(M); lg.lineCap = 'butt'; lg.lineJoin = 'round';
        lg.strokeStyle = kind === 'furrow' ? 'rgba(74,58,36,0.5)' : kind === 'yellow' ? 'rgba(238,192,46,0.9)' : 'rgba(229,225,207,0.85)'; lg.lineWidth = Math.max(kind === 'yellow' ? 0.1 : 0.08, minW); lg.beginPath();
        for (const p of set) for (let k = 0; k + 3 < p.lines!.length; k += 4) { lg.moveTo(p.lines![k], p.lines![k + 1]); lg.lineTo(p.lines![k + 2], p.lines![k + 3]); }
        lg.stroke(); lg.setTransform(M); lg.globalCompositeOperation = 'destination-in'; lg.fillStyle = this.screenPattern(lg, 'wear', L, X0, Y0, Minv); lg.fillRect(tx0, ty0, tx1 - tx0, ty1 - ty0);
        composite(lb);
      }
      ctx.setTransform(M);
    };
    // ---- 1a. the lawns (lawns.ts): the road blocks' grass in soft patches, then each lot's own lawn, under the lots' own ground
    // T204: the ground under them all as baked so far, when some patch here takes the tall grass's spill (cut from it)
    const under = lite ? null : this.spillUnder(ctx, all, M, Minv, W, H), laid = [...lawns.map(p => (p.lawn!.z >= 1 ? this.ruggedOf(p).q : p)), ...rest];
    if (lawns.length) { this.drawLawns(ctx, lawns, L, X0, Y0, M, Minv, box, under, laid, sc ? softBand : null); ctx.setTransform(M); this.drawManagedGrass(ctx, lawns.map(p => (p.lawn!.z >= 1 ? this.ruggedOf(p).q : p)), box, L); }
    drawLots(rest);
    // ---- 1a'. painted areas (the Paint tool) in id order: over the lot ground, under the bridges and roads
    if (paints.length) { this.drawPaints(ctx, paints, L, X0, Y0, M, Minv, box, lite, under, laid, sc ? softBand : null); ctx.setTransform(M); }
    // ---- 1a'''. the course height's light (T028b, T126): its slopes lit by the sun at the upper right and shaded away from it, its steep rises'
    //      cast shadows and its hollows' occlusion, over the grass, the lots and the painted course, under the living ground, car parks and roads
    if (this.courseAny && this.slopeLight > 0) { const hl = heightLightGrid(this.courseH, box, lite ? 1 : 2); if (hl) this.heightLight(ctx, hl, M, W, H, L); ctx.setTransform(M); }
    // ---- 1a''''. the living ground (T111): grass variety from what stands here and its ambient occlusion, over the grass, the lots and the
    //      painted areas, under the car parks and roads
    if (this.living.on || this.living.debug) { this.drawLiving(ctx, L, lite, box, M, Minv, W, H, X0, Y0); ctx.setTransform(M); }
    // ---- 1a''. the car parks over the painted areas: their surface, rim and bay lines
    drawLots(parks);
    // ---- 1a". the lots' flat decals (leaf drifts, worn grass, oil stains, litter, mud) on top of all their ground (T183: the lawn, the lot's
    //      patches, the painted areas, the living ground's streaks and the car parks), under the bridges, roads and sprites
    if (marks.length) { this.drawMarks(ctx, marks, L, M, box); ctx.setTransform(M); }
    // ---- 1a"'. T232: the survey lines (a building site's plot, the player's empty land: lots/survey.ts): white dashes over the decals
    const surveys = marks.filter(p => p.survey && p.lines?.length);
    if (surveys.length) { this.drawSurvey(ctx, surveys, minW); ctx.setTransform(M); }
    // ---- 1b. bridge decks under the road: the shadow on the water, the piers, the deck's fascia and top
    for (const b of brs) {
      const path = linePath(b.pts, false);
      ctx.lineJoin = 'round'; ctx.lineCap = 'butt';
      ctx.setTransform(shiftM(DECK_T + PIER_H + 14)); ctx.strokeStyle = 'rgba(0,0,10,0.45)'; ctx.lineWidth = 2 * b.hw + 0.6; ctx.stroke(path);
      const piers = new Path2D();
      walkOpen(b.pts, 9, 3, (P, u) => { const n = perp(u), h = b.hw - 0.6, A = sub(P, mul(n, h)), B = add(P, mul(n, h)); piers.moveTo(A.x, A.y); piers.lineTo(B.x, B.y); });
      ctx.strokeStyle = '#4a4640'; ctx.lineWidth = 0.8;
      for (let dy = DECK_T; dy <= DECK_T + PIER_H; dy += Math.max(1, 3 / L)) { ctx.setTransform(shiftM(dy)); ctx.stroke(piers); }
      ctx.lineWidth = 2 * b.hw; ctx.strokeStyle = '#5d5850';
      for (let dy = DECK_T; dy >= 0; dy -= Math.max(1, 2 / L)) { ctx.setTransform(shiftM(dy)); ctx.stroke(path); }
      ctx.setTransform(M); ctx.strokeStyle = '#8f897e'; ctx.stroke(path);
      ctx.setTransform(M);
    }
    // ---- 2. verges (gravel) and sidewalks: slab sprites per 2.5 m, grime, masked to the sidewalk
    for (const f of walk) if (f.tex === 'gravel') { ctx.strokeStyle = 'rgba(40,32,18,0.3)'; ring(ctx, f, Math.max(0.18, 2 * minW)); }
    for (const f of walk) if (f.tex === 'gravel') { ctx.lineCap = f.cap; if (f.kind === 'stroke') { ctx.strokeStyle = pat('gravel'); ctx.lineWidth = f.w; ctx.stroke(f.path); } else { ctx.fillStyle = pat('gravel'); ctx.fill(f.path); } }
    const slabWalk = walk.filter(f => f.tex === 'slabs');
    if (slabWalk.length) {
      const walkMask = maskOf('walkMask', slabWalk);
      const sb = this.buffer('slabs', W, H), sg = ctx2d(sb);
      sg.setTransform(M); sg.fillStyle = tex.curb.top; sg.fillRect(tx0, ty0, tx1 - tx0, ty1 - ty0);
      sg.imageSmoothingEnabled = true; sg.imageSmoothingQuality = 'high';
      if (!lite) for (const run of net.slabRuns) this.drawSlabs(sg, run, box);
      sg.setTransform(M); sg.globalCompositeOperation = 'multiply'; sg.fillStyle = this.screenPattern(sg, 'grime', L, X0, Y0, Minv); sg.fillRect(tx0, ty0, tx1 - tx0, ty1 - ty0); sg.globalCompositeOperation = 'source-over';
      through(sb, walkMask);
      // soft dark casing where the sidewalk meets grass
      ctx.strokeStyle = 'rgba(30,22,12,0.45)'; for (const f of slabWalk) ring(ctx, f, Math.max(0.14, 2 * minW));
      composite(sb);
    }

    if (asph.length) {
      // the starter cart paths (dirt, cement slabs: T084) draw their own soft edges (5a), not the plain roads' dark one
      // the kerbed roads include those whose kerb face steps into this chunk from just below its bottom edge (T140)
      const shift = faceShift(L), up = upScreen(M, shift);
      const kerbed = net.asphF.filter(f => f.kerb && vis(stepReach(f.bbox, up))), plain = asph.filter(f => !f.kerb && !CART_SURFACE.has(f.tex));
      const asphMask = maskOf('asphMask', asph);
      // ---- 4. curb: raised top ring (joint colour outside, cream top inside), then the visible face between the top and the road
      if (kerbed.length) {
        const top = this.buffer('curbTop', W, H), tg = ctx2d(top);
        for (const dy of [0, -shift]) {
          tg.setTransform(new DOMMatrix([1, 0, 0, 1, 0, dy]).multiply(M)); tg.lineJoin = 'round';
          tg.strokeStyle = tex.curb.joint; for (const f of kerbed) ring(tg, f, 2 * (CURB_TOP + CURB_JOINT));
          tg.strokeStyle = tex.curb.top; for (const f of kerbed) ring(tg, f, 2 * CURB_TOP);
        }
        composite(top);
        // the face: a wall of height `shift` px standing on the asphalt edge wherever the road lies below the curb on screen = the kerbed
        // roads stepped up the screen less the roads, in three tones from the strip, light at the top (kerb-face.ts). The steps are taken on
        // the roads in tile space, never on this chunk's mask, so the face stays whole across the chunk's bottom edge (T140)
        const faceBands = this.buffer('faceBands', W, H);
        kerbFace(ctx2d(faceBands), kerbed, M, shift, tex.curb.face);
        composite(faceBands);
      }
      // plain (verge) roads: a soft dark edge instead of a curb, feathered by a 1 px blur (the owner: no hard vector line)
      if (plain.length) { ctx.save(); ctx.filter = 'blur(1px)'; ctx.strokeStyle = 'rgba(12,10,8,0.5)'; for (const f of plain) ring(ctx, f, Math.max(0.2, 2 * minW)); ctx.restore(); ctx.setTransform(M); }
      // ---- 5. asphalt: the painted mosaic in ground space, per class tone
      // ---- 5a. the starter cart paths (T084), first, so every road meeting one paints over it: packed dirt and cement slabs in flat painted
      // colour with soft blotches (the grime layer), a feathered worn halo round the dirt, a thin cast shade under the slabs falling at 145°, and
      // the sun's bevel (cart-bevel.ts; the sun at the upper right): a light rim on the edges facing it, a shade rim on those facing away. The
      // cast and the rims step the paths themselves in tile space, never this chunk's mask, so they stay on the paths' edges across the chunk's
      // border (T139). Their slab joints, wheel ruts and centre grass are markings (8); a dirt path's edge tufts are litter (10)
      const cartF = asph.filter(f => CART_SURFACE.has(f.tex));
      if (cartF.length) {
        const tpx = Math.hypot(M.a, M.b); // px per tile
        for (const [kind, look] of CART_SURFACE) {
          const feats = cartF.filter(f => f.tex === kind); if (!feats.length) continue;
          const m = maskOf('cartMask', feats);
          if (!lite && look.halo) { ctx.save(); ctx.filter = `blur(${Math.max(1, 0.14 * tpx).toFixed(1)}px)`; ctx.lineJoin = 'round'; ctx.strokeStyle = look.halo; for (const f of feats) ring(ctx, f, 0.4); ctx.restore(); ctx.setTransform(M); }
          if (!lite && look.cast) { const cb = this.buffer('cartRim', W, H); cartCast(ctx2d(cb), feats, M, W, H, look.cast); composite(cb); }
          // the body: the flat fill and its two rims, then the grime blotches multiplied over all three, so the light and the shade keep the
          // surface's texture (T110: no smooth shine)
          const bb = this.buffer('cartBody', W, H), bg = ctx2d(bb);
          bg.fillStyle = look.fill; bg.fillRect(0, 0, W, H);
          if (!lite) for (const [col, s, alpha] of [[look.lit, CART_RIM, look.litA], [look.shade, -CART_RIM, look.shadeA]] as const) {
            const rb = this.buffer('cartRim', W, H); cartRim(ctx2d(rb), m, feats, M, W, H, col, s);
            bg.globalAlpha = alpha; bg.drawImage(rb, 0, 0); bg.globalAlpha = 1;
          }
          bg.setTransform(M); bg.globalCompositeOperation = 'multiply'; bg.fillStyle = this.screenPattern(bg, 'grime', L, X0, Y0, Minv); bg.fillRect(tx0, ty0, tx1 - tx0, ty1 - ty0); bg.globalCompositeOperation = 'source-over';
          through(bb, m); composite(bb);
        }
      }
      // gravel roads are painted first, with their own pattern and no tones, so a paved road meeting one paints over it
      const gravelF = asph.filter(f => f.tex === 'gravel'), paved = asph.filter(f => f.tex !== 'gravel' && !CART_SURFACE.has(f.tex));
      if (gravelF.length) { const gp = pat('roadgravel'); for (const f of gravelF) { ctx.lineCap = f.cap; if (f.kind === 'stroke') { ctx.strokeStyle = gp; ctx.lineWidth = f.w; ctx.stroke(f.path); } else { ctx.fillStyle = gp; ctx.fill(f.path); } } }
      const base = this.groundPattern(ctx, tex.mosaicFor('base', L));
      for (const f of paved) { ctx.lineCap = f.cap; if (f.kind === 'stroke') { ctx.strokeStyle = base; ctx.lineWidth = f.w; ctx.stroke(f.path); } else { ctx.fillStyle = base; ctx.fill(f.path); } }
      // class tones as solid masks composited once (overlapping strokes and discs must not accumulate)
      const dark = asph.filter(f => f.tex === 'asphaltDark'), worn = asph.filter(f => f.tex === 'asphaltWorn');
      const toneLayer = (feats: Feature[], col: string, op: GlobalCompositeOperation, alpha: number) => {
        const tb = this.buffer('tone', W, H), tg = ctx2d(tb); tg.setTransform(M); tg.lineJoin = 'round'; tg.strokeStyle = tg.fillStyle = col;
        for (const f of feats) paint(tg, f); composite(tb, op, alpha);
      };
      if (dark.length) toneLayer(dark, 'rgb(10,12,24)', 'multiply', 0.28);
      if (worn.length) { toneLayer(worn, 'rgb(150,150,150)', 'multiply', 0.5); toneLayer(worn, 'rgb(190,180,160)', 'screen', 0.22); }
      // ---- 6. gutter: the strip's shadow rows just inside the curb (dark, then warm), masked to the asphalt
      if (kerbed.length) {
        const gb = this.buffer('gutter', W, H), gg = ctx2d(gb); gg.setTransform(M); gg.lineJoin = 'round';
        const [g0, g1, g2] = tex.curb.gutter;
        gg.strokeStyle = g2; gg.globalAlpha = 0.5; for (const f of kerbed) ring(gg, f, 2 * GUTTER);
        gg.strokeStyle = g1; gg.globalAlpha = 0.7; for (const f of kerbed) ring(gg, f, 2 * GUTTER * 0.6);
        gg.strokeStyle = g0; gg.globalAlpha = 0.9; for (const f of kerbed) ring(gg, f, 2 * GUTTER * 0.3);
        gg.globalAlpha = 1; through(gb, asphMask); composite(gb);
        // curb joints: dark ticks across the top every slab
        ctx.strokeStyle = tex.curb.joint; ctx.lineWidth = Math.max(0.02, minW * 0.9); ctx.beginPath();
        for (const j of net.joints) if (j.a.x >= tx0 && j.a.x <= tx1 && j.a.y >= ty0 && j.a.y <= ty1) { ctx.moveTo(j.a.x, j.a.y); ctx.lineTo(j.b.x, j.b.y); }
        ctx.save(); ctx.setTransform(new DOMMatrix([1, 0, 0, 1, 0, -shift]).multiply(M)); ctx.stroke(); ctx.restore(); ctx.setTransform(M);
      }
      // ---- 6b. on-street lay-bys (parking cut into a sidewalk): the road's asphalt, a kerb on the outer long edge and both ends (not the road side),
      // then their white bay lines chipped by the wear (not through the road's mask: they lie outside the asphalt)
      if (laybys.length) {
        ctx.setTransform(M); ctx.lineJoin = 'round'; ctx.lineCap = 'butt';
        for (const p of laybys) {
          const q = p.pts; ctx.fillStyle = base; ctx.fill(polyPath(q));
          ctx.beginPath(); ctx.moveTo(q[2], q[3]); ctx.lineTo(q[4], q[5]); ctx.lineTo(q[6], q[7]); ctx.lineTo(q[0], q[1]);
          ctx.strokeStyle = tex.curb.joint; ctx.lineWidth = 2 * (CURB_TOP + CURB_JOINT); ctx.stroke(); ctx.strokeStyle = tex.curb.top; ctx.lineWidth = 2 * CURB_TOP; ctx.stroke();
        }
        const lbb = this.buffer('laybyLines', W, H), lbg = ctx2d(lbb); lbg.setTransform(M); lbg.lineCap = 'butt';
        lbg.strokeStyle = WHITE; lbg.lineWidth = Math.max(0.08, minW); lbg.beginPath();
        for (const p of laybys) for (let k = 0; k + 3 < p.lines!.length; k += 4) { lbg.moveTo(p.lines![k], p.lines![k + 1]); lbg.lineTo(p.lines![k + 2], p.lines![k + 3]); }
        lbg.stroke(); lbg.setTransform(M); lbg.globalCompositeOperation = 'destination-in'; lbg.fillStyle = this.screenPattern(lbg, 'wear', L, X0, Y0, Minv); lbg.fillRect(tx0, ty0, tx1 - tx0, ty1 - ty0);
        composite(lbb); ctx.setTransform(M);
      }
      // ---- 7. medians, islands, roundabout centres
      const curbRing = (feats: Feature[]) => { ctx.strokeStyle = tex.curb.joint; for (const f of feats) ring(ctx, f, 2 * (CURB_TOP + CURB_JOINT)); ctx.strokeStyle = tex.curb.top; for (const f of feats) ring(ctx, f, 2 * CURB_TOP); };
      curbRing(med); curbRing(isl);
      for (const f of med) { ctx.lineCap = f.cap; ctx.strokeStyle = pat('grass'); ctx.lineWidth = f.w; ctx.stroke(f.path); }
      for (const f of isl) { ctx.fillStyle = pat('pad'); ctx.fill(f.path); }
      for (const i of rbs) {
        ctx.beginPath(); ctx.arc(i.x, i.y, i.r, 0, Math.PI * 2);
        ctx.strokeStyle = tex.curb.joint; ctx.lineWidth = 2 * (CURB_TOP + CURB_JOINT); ctx.stroke(); ctx.strokeStyle = tex.curb.top; ctx.lineWidth = 2 * CURB_TOP; ctx.stroke();
        ctx.fillStyle = pat('grass'); ctx.fill();
        const ringR = Math.max(0.8, i.r * 0.42);
        ctx.beginPath(); ctx.arc(i.x, i.y, ringR, 0, Math.PI * 2); ctx.arc(i.x, i.y, ringR - 0.7, 0, Math.PI * 2, true); ctx.fillStyle = pat('paving'); ctx.fill('evenodd');
      }
      // T215: with specCam on, the road's local mean colour before its decals, markings and pools: the asphalt alone (through its mask)
      // shrunk to the reflection mask's size, premultiplied by its coverage (the GPU takes the road's texture as each pixel's distance from it,
      // lamp-reflect.ts specPixel)
      const pools = net.pools.filter(p => p.x >= tx0 - 8 && p.x <= tx1 + 8 && p.y >= ty0 - 8 && p.y <= ty1 + 8);
      const specK = 1 / SPEC_MASK_K, mw = Math.max(1, Math.ceil(W * specK)), mh = Math.max(1, Math.ceil(H * specK));
      let specMean: OffscreenCanvas | null = null;
      if (this.specCam && pools.length) {
        const b = this.buffer('specRoad', W, H), bg = ctx2d(b); bg.drawImage(cv, 0, 0); bg.globalCompositeOperation = 'destination-in'; bg.drawImage(asphMask, 0, 0);
        specMean = new OffscreenCanvas(mw, mh); const sg = specMean.getContext('2d')!; sg.imageSmoothingEnabled = true; sg.imageSmoothingQuality = 'high'; sg.drawImage(b, 0, 0, W * specK, H * specK);
      }
      // ---- 8. decals, tyre marks, markings (chipped), crossings
      if (!lite) for (const d of net.decals) if (d.x >= tx0 - 2 && d.x <= tx1 + 2 && d.y >= ty0 - 2 && d.y <= ty1 + 2) drawDecal(ctx, d);
      if (!lite) for (const t of net.tyres) {
        if (t.x < tx0 - 8 || t.x > tx1 + 8 || t.y < ty0 - 8 || t.y > ty1 + 8) continue;
        ctx.save(); ctx.translate(t.x, t.y); ctx.rotate(t.ang);
        const g = ctx.createLinearGradient(t.start, 0, t.start + t.len, 0); g.addColorStop(0, 'rgba(10,10,14,0.35)'); g.addColorStop(1, 'rgba(10,10,14,0)');
        ctx.fillStyle = g; for (const lat of t.lat) ctx.fillRect(t.start, -lat - 0.11, t.len, 0.22); ctx.restore();
      }
      const lines = net.lines.filter(l => vis(l.bbox)), zebra = net.zebra.filter(z => vis(z.bbox)), bars = net.bars.filter(b => vis(b.bbox));
      if (lines.length || zebra.length || bars.length || tops.length) {
        const lb = this.buffer('lines', W, H), lg = ctx2d(lb); lg.setTransform(M); lg.lineJoin = 'round';
        // T228: the white edge lines first, broken where a cut lies (a lot's driveway, a bus stop: LotPatch.cut; the on-street bays' strip),
        // then every other marking over them
        const edges = lines.filter(l => l.edge);
        if (edges.length) {
          for (const l of edges) drawLine(lg, l, minW);
          const cuts = [...this.lotsIn(box).filter(p => p.cut), ...tops];
          if (cuts.length) { lg.globalCompositeOperation = 'destination-out'; lg.fillStyle = '#000'; for (const p of cuts) lg.fill(polyPath(p.pts)); lg.globalCompositeOperation = 'source-over'; }
        }
        for (const l of lines) if (!l.edge) drawLine(lg, l, minW);
        // on-street parking marks (lot ground patches drawn on top): the edge line and the bay ticks
        if (tops.length) { lg.strokeStyle = WHITE; lg.lineCap = 'butt'; lg.lineWidth = Math.max(0.08, minW); lg.beginPath(); for (const p of tops) for (let k = 0; k + 3 < p.lines!.length; k += 4) { lg.moveTo(p.lines![k], p.lines![k + 1]); lg.lineTo(p.lines![k + 2], p.lines![k + 3]); } lg.stroke(); }
        lg.fillStyle = WHITE; for (const z of zebra) lg.fill(z.path); for (const b of bars) lg.fill(b.path);
        // chipped paint: keep the line where the wear mask is opaque
        lg.setTransform(M); lg.globalCompositeOperation = 'destination-in'; lg.fillStyle = this.screenPattern(lg, 'wear', L, X0, Y0, Minv); lg.fillRect(tx0, ty0, tx1 - tx0, ty1 - ty0);
        through(lb, asphMask); composite(lb);
      }
      // ---- 9. polished wheel paths (very faint) and the street-lamp reflection pools (the painting's measured response)
      const wear = lite ? [] : net.wear.filter(w => vis(w.bbox));
      if (wear.length) {
        const wb = this.buffer('wear', W, H), wg = ctx2d(wb); wg.setTransform(M); wg.lineCap = 'round'; wg.lineJoin = 'round';
        for (const w of wear) { wg.strokeStyle = 'rgba(255,255,255,0.035)'; wg.lineWidth = 0.5; for (const o of w.offsets) wg.stroke(roundedPath(offsetPolyline(w.pts, o, w.closed), w.r, w.closed)); }
        through(wb, asphMask); composite(wb, 'screen');
      }
      if (pools.length) {
        const rotA = Math.PI / 2 - tex.stampAngle, sc = 1.2 / (2 * PPM);
        /** a pool's stamp transform (chunk px): the stamp's anchor on the pool, its streak turned to the screen's */
        const stampAt = (p: (typeof pools)[number]) => {
          const S = M.transformPoint(new DOMPoint(p.x, p.y));
          return new DOMMatrix([1, 0, 0, 1, S.x, S.y]).multiply(new DOMMatrix([Math.cos(rotA), Math.sin(rotA), -Math.sin(rotA), Math.cos(rotA), 0, 0])).multiply(new DOMMatrix([1, 0, 0, 1, -S.x, -S.y])).multiply(M).multiply(new DOMMatrix([sc, 0, 0, sc, p.x, p.y])).multiply(new DOMMatrix([1, 0, 0, 1, -POOL_ANCHOR[0], -POOL_ANCHOR[1]]));
        };
        if (specMean) {
          // T215: the pools' coverage (each stamp at its strength) onto the reflection mask instead, a SPEC_MASK_K-th of the chunk's size: the
          // road's mean (its alpha the asphalt's coverage) cut by the stamps' intensity 0.4 pool1 + 0.5 pool2 (lamp-reflect.ts poolIntensity), so
          // its alpha is stamp x asphalt mask x strength; the GPU lights the road by it times the camera falloff (gl.ts FS_QUAD), so the road
          // picture keeps no pool
          const k = specK, Sk = new DOMMatrix([k, 0, 0, k, 0, 0]);
          const mc = this.buffer('specCover', mw, mh), mg = ctx2d(mc); mg.globalCompositeOperation = 'lighter';
          ([[POOL_SHARES[0], tex.pool1], [POOL_SHARES[1], tex.pool2]] as const).forEach(([share, stamp]) => {
            const pm = this.buffer('specPool', mw, mh), pg = ctx2d(pm); pg.imageSmoothingEnabled = true;
            for (const p of pools) { pg.setTransform(Sk.multiply(stampAt(p))); pg.globalAlpha = p.strength; pg.drawImage(stamp, 0, 0); }
            mg.globalAlpha = share; mg.drawImage(pm, 0, 0);
          });
          const sg = specMean.getContext('2d')!; sg.globalCompositeOperation = 'destination-in'; sg.drawImage(mc, 0, 0);
          this.specMask = specMean;
        } else for (const [variant, stamp] of [['lit1', tex.pool1], ['lit2', tex.pool2]] as const) {
          const pm = this.buffer('poolMask', W, H), pg = ctx2d(pm); pg.imageSmoothingEnabled = true;
          for (const p of pools) { pg.setTransform(stampAt(p)); pg.globalAlpha = p.strength; pg.drawImage(stamp, 0, 0); }
          const lit = this.buffer('lit', W, H), lg = ctx2d(lit); lg.setTransform(M); lg.fillStyle = this.groundPattern(lg, tex.mosaicFor(variant, L)); lg.fillRect(tx0, ty0, tx1 - tx0, ty1 - ty0);
          through(lit, pm); through(lit, asphMask); composite(lit);
        }
        // the curb and sidewalk near a lamp catch some of the light too (CURB_HOT / walk terms)
        const glow = this.buffer('glow', W, H), gg = ctx2d(glow); gg.setTransform(M);
        for (const p of pools) { const g = gg.createRadialGradient(p.x, p.y, 0, p.x, p.y, 3.2); g.addColorStop(0, 'rgba(255,170,70,0.55)'); g.addColorStop(0.4, 'rgba(255,150,50,0.22)'); g.addColorStop(1, 'rgba(255,140,40,0)'); gg.fillStyle = g; gg.beginPath(); gg.arc(p.x, p.y, 3.2, 0, Math.PI * 2); gg.fill(); }
        gg.setTransform(1, 0, 0, 1, 0, 0); gg.globalCompositeOperation = 'destination-out'; gg.drawImage(asphMask, 0, 0);
        composite(glow, 'screen');
      }
    }
    // ---- 9b. bridge railings: a base rail on the deck edge, a top rail RAIL_H above it, and posts every tile (not in lite)
    if (brs.length) {
      const posts = new Path2D();
      ctx.lineJoin = 'round'; ctx.lineCap = 'butt';
      for (const b of brs) for (const s of [1, -1]) {
        const edge = offsetPolyline(b.pts, s * (b.hw - 0.12), false), path = linePath(edge, false);
        ctx.setTransform(M); ctx.strokeStyle = '#7a7468'; ctx.lineWidth = 0.08; ctx.stroke(path);
        if (lite) continue;
        ctx.setTransform(shiftM(-RAIL_H)); ctx.strokeStyle = '#d8d0c0'; ctx.lineWidth = 0.07; ctx.stroke(path);
        walkOpen(edge, 1, 0, p => { const q = M.transformPoint(new DOMPoint(p.x, p.y)); posts.moveTo(q.x, q.y); posts.lineTo(q.x, q.y - RAIL_H * L); });
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (!lite) { ctx.strokeStyle = '#c8c0b0'; ctx.lineWidth = Math.max(1, 1.5 * L); ctx.stroke(posts); }
      ctx.setTransform(M);
    }
    // ---- 9c. tunnel portals: the dark mouth on the slope, the headwall above it, and the arch
    for (const p of ports) {
      const d = p.dir, n = perp(d), P = { x: p.x, y: p.y }, H = 70 * L;
      const Dd = mul(d, 3), A = add(P, mul(n, p.hw)), B = sub(P, mul(n, p.hw));
      const mouth = ctx.createLinearGradient(P.x, P.y, P.x + Dd.x, P.y + Dd.y);
      mouth.addColorStop(0, 'rgba(8,7,12,0.95)'); mouth.addColorStop(1, 'rgba(8,7,12,0)');
      ctx.setTransform(M); ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.lineTo(B.x + Dd.x, B.y + Dd.y); ctx.lineTo(A.x + Dd.x, A.y + Dd.y); ctx.closePath();
      ctx.fillStyle = mouth; ctx.fill();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const wa = add(P, mul(n, p.hw + 0.8)), wb = sub(P, mul(n, p.hw + 0.8));
      const a = M.transformPoint(new DOMPoint(wa.x, wa.y)), b = M.transformPoint(new DOMPoint(wb.x, wb.y));
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(b.x, b.y - H); ctx.lineTo(a.x, a.y - H); ctx.closePath();
      ctx.fillStyle = '#7d776d'; ctx.fill();
      ctx.beginPath(); ctx.moveTo(a.x, a.y - H); ctx.lineTo(b.x, b.y - H); ctx.strokeStyle = '#a39c90'; ctx.lineWidth = Math.max(1, 3 * L); ctx.stroke();
      const ai = add(P, mul(n, p.hw * 0.85)), bi = sub(P, mul(n, p.hw * 0.85));
      const a2 = M.transformPoint(new DOMPoint(ai.x, ai.y)), b2 = M.transformPoint(new DOMPoint(bi.x, bi.y));
      ctx.beginPath(); ctx.moveTo(a2.x, a2.y); ctx.lineTo(a2.x, a2.y - 0.45 * H); ctx.bezierCurveTo(a2.x, a2.y - 0.8 * H, b2.x, b2.y - 0.8 * H, b2.x, b2.y - 0.45 * H); ctx.lineTo(b2.x, b2.y); ctx.closePath();
      ctx.fillStyle = '#07060a'; ctx.fill();
      ctx.setTransform(M);
    }
    // ---- 10. leaves and grass tufts, lit by the pools where they lie in one
    if (!lite) this.drawLitter(ctx, net, L, M, box, W, H);
    // ---- 11. the world beyond the map
    const outside = new Path2D(); outside.rect(tx0 - 4, ty0 - 4, tx1 - tx0 + 8, ty1 - ty0 + 8); outside.rect(0, 0, MAP, MAP);
    ctx.fillStyle = pat('outside'); ctx.fill(outside, 'evenodd');
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = Math.max(0.08, minW); ctx.strokeRect(0, 0, MAP, MAP);
    return cv;
  }

  /** the living ground (T111, living-ground.ts) over a chunk: its influence maps from the casters, roads, hard ground and water within reach,
   *  then the variants through their masks: lush (the grass multiplied by itself, tinted), thin (the soil lightening the grass's dark gaps, so
   *  the tufts stay), bare soil and leaf litter, or the painted variant sets (grass-lush, grass-patchy, dirt-bare, leaf-litter) when their art is
   *  in the game; then the ambient occlusion, a cool multiply over everything (T110: the texture stays, never a flat grey). The lots' hard
   *  ground, painted areas that are no grass, the course's managed turf and the water keep their look; the debug view shows the maps instead */
  private drawLiving(ctx: C2D, L: number, lite: boolean, box: BBox, M: DOMMatrix, Minv: DOMMatrix, W: number, H: number, X0: number, Y0: number) {
    const res = livingRes(L, lite), gb = livingQueryBox(box as Box, res);
    // ---- the sources within reach: casters, roads and cart paths, hard lot ground and painted areas, water (rivers, creeks, course and painted ponds)
    const casters = this.casters.query(gb), roads: RoadPiece[] = [], cx = (box[0] + box[2]) / 2, cy = (box[1] + box[3]) / 2, rr = Math.max(gb[2] - gb[0], gb[3] - gb[1]) / 2 + 6;
    for (const s of this.net.segsNear({ x: cx, y: cy }, rr)) if (s.kind !== SK.TUNNEL) roads.push({ ax: s.a.x, ay: s.a.y, bx: s.b.x, by: s.b.y, hw: s.cls.h + s.cls.walk, cart: !!s.cls.noCars });
    const lots = this.lotsIn([gb[0] - 2, gb[1] - 2, gb[2] + 2, gb[3] + 2]), paths: ArrayLike<number>[] = [], shores: { pts: ArrayLike<number>; ring?: boolean }[] = [];
    for (const p of lots) {
      if (p.course) { for (const l of p.course.layers) if (l.s === COURSE_WATER) for (const e of l.edges) shores.push({ pts: e }); continue; }
      if (p.top || p.lawn || p.tex === 'marks' || grassyTex(p.tex)) continue;
      // (T247: dirt and desert with a soft edge wear no trampled band of their own: their band is the grass going over to them)
      if (waterTex(p.tex)) shores.push({ pts: p.pts, ring: true }); else if (!this.softTex(p.tex)) paths.push(p.pts);
    }
    const waters = this.waters.filter(w => w.box[2] >= gb[0] - 4 && w.box[0] <= gb[2] + 4 && w.box[3] >= gb[1] - 4 && w.box[1] <= gb[3] + 4);
    const rivers: WaterLine[] = waters.map(w => ({ pts: w.w.pts, bank: w.w.kind === 'river' ? 2.6 : 0.4 }));
    const src = { casters, roads, paths, rivers, shores }, ck = `${this.chunkNow!.key}:${livingSignature(res, src)}`;
    let made = this.livingMade.get(ck);
    if (made) { this.livingMade.delete(ck); this.livingMade.set(ck, made); }
    else { made = { grid: influence(box, res, src), masks: null }; this.livingMade.set(ck, made); trimLru(this.livingMade, new Set([ck]), LIVING_MADE); }
    const grid = made.grid;
    /** a mask (one px per sample) stretched over g through the chunk transform (bilinear), with the op */
    const put = (g: C2D, data: Uint8ClampedArray, op: GlobalCompositeOperation) => {
      const s = this.buffer('livingSmall', grid.w, grid.h); ctx2d(s).putImageData(new ImageData(data as Uint8ClampedArray<ArrayBuffer>, grid.w, grid.h), 0, 0);
      g.save(); g.setTransform(M); g.globalCompositeOperation = op; g.globalAlpha = 1; g.imageSmoothingEnabled = true; g.drawImage(s, grid.ix0 / res, grid.iy0 / res, grid.w / res, grid.h / res); g.restore();
    };
    if (this.living.debug) { put(ctx, debugImage(grid), 'source-over'); return; }
    const m = made.masks ??= livingMasks(grid);
    // ---- the ground the variety leaves alone: the lots' hard ground, painted areas that are no grass, the course's managed turf and its
    //      collars (the pond's bank keeps it), the course walls' faces (T099: their own light and shade), the rivers' and creeks' water
    //      a surface wearing a hand-painted tile set (T145) keeps its art too: it is its own layer, never mixed inside
    const ex: { path: Path2D; rule: CanvasFillRule }[] = [], walls: CourseWall[] = [], tiled = (t: string) => !!this.tex.paintedOf(t)?.tiled;
    const rings = (rs: readonly ArrayLike<number>[]) => { const q = new Path2D(); for (const r of rs) ringPath(q, r); ex.push({ path: q, rule: 'evenodd' }); };
    for (const p of lots) {
      // (the course as it is drawn, T204)
      if (p.course) { const c = this.warpedCourse(p.course, lite); for (const l of c.layers) { if ((!COURSE_GRASSY.has(l.s) || tiled(l.tex)) && l.fill.length) rings(l.fill); if (l.collar && l.collar.n !== 'bank' && l.collar.fill.length) rings(l.collar.fill); } if (c.walls) walls.push(...c.walls); continue; }
      if (p.top || p.layby || p.lawn || p.tex === 'marks' || (grassyTex(p.tex) && !tiled(p.tex))) continue;
      ex.push({ path: polyPath(p.paint ? this.ruggedOf(p).q.pts : p.pts), rule: 'nonzero' }); // (a painted area as it is drawn, T204)
    }
    const wallPath = walls.length ? wallFaces(walls) : null;
    if (wallPath) ex.push({ path: wallPath, rule: 'nonzero' });
    for (const w of waters) { const q = new Path2D(); if (waterShape(q, w.w.pts, 0, box, w.w.kind === 'creek' ? 0.35 : 1)) ex.push({ path: q, rule: 'nonzero' }); }
    // (T199: and the streams' swamp, by its cover: a tile set keeps its art)
    const sw = this.swampNow;
    // the variants go onto a copy of the chunk when some ground is left alone (cut out at the end), else straight onto it
    const V = ex.length || sw ? this.buffer('living', W, H) : null, vg = V ? ctx2d(V) : ctx;
    if (V) vg.drawImage(ctx.canvas, 0, 0);
    const lay = (layer: Cnv, op: GlobalCompositeOperation, alpha = 1) => { vg.save(); vg.setTransform(1, 0, 0, 1, 0, 0); vg.globalCompositeOperation = op; vg.globalAlpha = alpha; vg.drawImage(layer, 0, 0); vg.restore(); };
    // a painted variant is composed only over the part of the chunk its mask reaches (T128: the lush, patchy and soil looks)
    const maskBox = (a: Uint8ClampedArray): BBox | undefined => {
      let i0 = Infinity, j0 = Infinity, i1 = -Infinity, j1 = -Infinity;
      for (let j = 0; j < m.H; j++) for (let i = 0; i < m.W; i++) if (a[(j * m.W + i) * 4 + 3]! > 5) { if (i < i0) i0 = i; if (i > i1) i1 = i; if (j < j0) j0 = j; if (j > j1) j1 = j; }
      return i0 === Infinity ? undefined : [m.x0 + i0 / m.res - 1, m.y0 + j0 / m.res - 1, m.x0 + (i1 + 1) / m.res + 1, m.y0 + (j1 + 1) / m.res + 1];
    };
    const art = (id: string, need?: BBox) => (this.tex.isPainted(id) ? this.paintedBuf(id, need) : null), T = 0.02;
    const both = (a?: BBox, b?: BBox): BBox | undefined => (a && b ? [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])] : a ?? b);
    const soilBox = both(m.max.thin > T ? maskBox(m.thin) : undefined, m.max.bare > T ? maskBox(m.bare) : undefined);
    /** the soil, made once a chunk: the painted dirt-bare set, else the game's dirt (its photo when built, else the painted screen texture) */
    let soilBuf: Cnv | null = null;
    const soil = (g: C2D) => {
      if (!soilBuf) soilBuf = art('dirt-bare');
      if (!soilBuf) {
        soilBuf = this.buffer('livingSoil', W, H); const s = ctx2d(soilBuf);
        s.setTransform(M); const pd = this.paintedFill(s, 'dirt', soilBox);
        s.fillStyle = pd ?? this.photoFill(s, 'dirt', L) ?? this.screenPattern(s, 'dirt', L, X0, Y0, Minv); s.fillRect(box[0] - 1, box[1] - 1, box[2] - box[0] + 2, box[3] - box[1] + 2);
        // the game's dirt is a dark, grey soil: lifted warm toward the painted grass's garden earth (in proportion to itself, so its grains
        // stay); the painted soil (painted-surfaces.ts dirt) is laid as its look has it
        if (!pd) { s.setTransform(1, 0, 0, 1, 0, 0); s.globalCompositeOperation = 'screen'; s.fillStyle = SOIL_LIFT; s.fillRect(0, 0, W, H);
          s.globalCompositeOperation = 'multiply'; s.fillStyle = SOIL_WARM; s.fillRect(0, 0, W, H); s.globalCompositeOperation = 'source-over'; }
      }
      g.drawImage(soilBuf, 0, 0);
    };
    /** T204: a variant's picture (layer) laid on the ground whole inside its region and as tufts over its edge (livingEdge), when the rugged
     *  edges are on; false (nothing laid) when they are off */
    const rugged = (layer: Cnv, key: 'lush' | 'thin') => {
      if (!this.rugged) return false;
      const region = this.livingEdge(ck, m, key);
      if (!region) return true;
      // the blades' width at least about a cache px (fewer, wider blades further out); the grass round it as it is now (copied as the variant
      // is drawn over it): the tufts reaching back into the lush grass are cut from it, at the closest levels only (further out they are a
      // px or two, not worth the copy); T217: no tufts at the far levels (k 4), so no copies of the pictures for them either
      const k = spillScale(L, TILE_PX), tufted = k <= 2, under = tufted && key === 'lush' && k === 1 ? vg.createPattern(vg.canvas, 'no-repeat') : null, p = tufted ? vg.createPattern(layer, 'no-repeat') : null;
      // T247: the lush grass (the open fescue's dirt patches since #621) through its soft band (soft-edges.ts: whole deep inside, the grass's
      // and its own tufts across a band that widens at the far levels, its 50% line the region's outline), else whole inside its region
      const soft = key === 'lush' && this.softDirt ? this.livingSoftOf(ck, m, L, box) : null, sr = soft ? GroundPainter.pxRect(M, soft.x0, soft.y0, soft.x0 + soft.W / soft.r, soft.y0 + soft.H / soft.r, W, H) : null;
      if (soft && sr) this.laySoft(vg, layer, soft, M, sr);
      else { vg.save(); vg.setTransform(M); vg.clip(region, 'evenodd'); vg.setTransform(1, 0, 0, 1, 0, 0); vg.globalCompositeOperation = 'source-over'; vg.globalAlpha = 1; vg.drawImage(layer, 0, 0); vg.restore(); }
      const tufts = (style: CanvasPattern | null, layers: readonly { len: number; dash: readonly number[] }[], inside: boolean) => {
        if (!style) return;
        style.setTransform(Minv);
        vg.save(); vg.setTransform(M);
        if (inside) vg.clip(region, 'evenodd');
        else { const o = new Path2D(); o.rect(box[0] - 3, box[1] - 3, box[2] - box[0] + 6, box[3] - box[1] + 6); o.addPath(region); vg.clip(o, 'evenodd'); }
        vg.globalCompositeOperation = 'source-over'; vg.globalAlpha = 1; vg.strokeStyle = style; vg.lineCap = 'butt'; vg.lineJoin = 'bevel';
        for (const t of layers) { vg.setLineDash(k === 1 ? t.dash as number[] : t.dash.map(v => v * k)); vg.lineWidth = 2 * t.len; vg.stroke(region); }
        vg.restore();
      };
      if (tufted) { tufts(p, TUFTS.out, false); tufts(under, TUFTS.back, true); }
      return true;
    };
    // lush: richer, denser grass along fences, walls and hedges, near water and on the verges: the grass laid over itself (its strokes' contrast
    // and colour deepen: darker gaps, brighter tips), tinted a deeper green
    if (m.max.lush > T) {
      const lb = this.buffer('livingLayer', W, H), lg = ctx2d(lb), a = art('grass-lush', maskBox(m.lush));
      if (a) lg.drawImage(a, 0, 0);
      else { lg.drawImage(vg.canvas, 0, 0); lg.globalCompositeOperation = 'overlay'; lg.drawImage(vg.canvas, 0, 0); lg.globalCompositeOperation = 'multiply'; lg.fillStyle = LUSH_TINT; lg.fillRect(0, 0, W, H); lg.globalCompositeOperation = 'source-over'; }
      // T204: the lush grass whole inside its region, its edge broken by its own tufts (no half-alpha cross-fade with the grass under it)
      if (!rugged(lb, 'lush')) { put(lg, m.lush, 'destination-in'); lay(lb, 'source-over'); }
    }
    // thin: patchy grass going over to soil, under trees, at doors and corners, on worn edges: the soil's colour on the grass's own strokes
    // (dry, thin turf that keeps its texture), then the soil in the grass's dark gaps (lighten: the lit tufts stay)
    if (m.max.thin > T) {
      const lb = this.buffer('livingLayer', W, H), lg = ctx2d(lb), a = art('grass-patchy', maskBox(m.thin));
      if (a) lg.drawImage(a, 0, 0); else soil(lg);
      // T204: the patchy grass keeps its soft depth inside (it is grass going over to soil: whole, it would read as bare dirt), but its outer
      // fade is cut along its region with tufts, not left to ghost out over the grass round it
      put(lg, m.thin, 'destination-in');
      if (!(a && rugged(lb, 'thin'))) { if (a) lay(lb, 'source-over'); else { lay(lb, 'color', 0.7); lay(lb, 'lighten'); } }
    }
    // bare: the soil, then the grass that was there laid back over it with lighten (its lit tufts and strokes run through the soil, its dark gaps
    // stay soil), so the soil's edge dissolves into thin grass instead of ending in a cut-out rim
    if (m.max.bare > T) {
      const kb = this.buffer('livingKeep', W, H), kg = ctx2d(kb); kg.drawImage(vg.canvas, 0, 0); put(kg, m.bare, 'destination-in');
      const lb = this.buffer('livingLayer', W, H), lg = ctx2d(lb); soil(lg); put(lg, m.bare, 'destination-in'); lay(lb, 'source-over');
      lay(kb, 'lighten', 0.9);
    }
    if (!lite && m.max.litter > T) {
      const lb = this.buffer('livingLayer', W, H), lg = ctx2d(lb), a = art('leaf-litter');
      lg.drawImage(a ?? this.leavesOfChunk(), 0, 0);
      put(lg, m.litter, 'destination-in'); lay(lb, 'source-over');
    }
    if (V) {
      const mb = this.buffer('livingMask', W, H), mg = ctx2d(mb);
      mg.fillStyle = '#000'; mg.fillRect(0, 0, W, H); mg.setTransform(M); mg.globalCompositeOperation = 'destination-out'; for (const e of ex) mg.fill(e.path, e.rule);
      if (sw) { mg.imageSmoothingEnabled = true; mg.drawImage(sw.cv, sw.x0, sw.y0, sw.cv.width / sw.res, sw.cv.height / sw.res); }
      vg.globalCompositeOperation = 'destination-in'; vg.drawImage(mb, 0, 0); vg.globalCompositeOperation = 'source-over';
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(V, 0, 0); ctx.restore();
    }
    // ---- the ambient occlusion: a cool multiply over everything, the foundations and paving too, but never over a course wall's face (its
    //      own light and shade, T099): there the shade layer is white
    // T181b (the owner: "what i dont like is the blanked color transparency over everything hiding the texture detail"): off (LIVING_AO); it
    //      took a fifth of a lawn's detail and darkened it a quarter, cool, wherever a house, tree or fence stood near: most of a town
    if (LIVING_AO && m.max.ao > 0.01) {
      if (!wallPath) put(ctx, m.ao, 'multiply');
      else {
        const ab = this.buffer('livingAo', W, H), ag = ctx2d(ab); ag.fillStyle = '#fff'; ag.fillRect(0, 0, W, H); put(ag, m.ao, 'source-over');
        ag.setTransform(M); ag.fillStyle = '#fff'; ag.fill(wallPath); ag.setTransform(1, 0, 0, 1, 0, 0);
        ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'multiply'; ctx.drawImage(ab, 0, 0); ctx.restore();
      }
    }
  }
  /** the leaf litter of the chunk being baked (T111): the leaf picture laid in the painted grass's stochastic layout (painted-ground.ts: soft
   *  patches at their own phases and turns, so it never repeats), alone (transparent between the leaves); kept for the last few chunks */
  private leavesOfChunk(): Cnv {
    const c = this.chunkNow!, have = this.leafChunks.get(c.key);
    if (have) { this.leafChunks.delete(c.key); this.leafChunks.set(c.key, have); return have; }
    const out = canvas(c.W, c.H), g = ctx2d(out); g.setTransform(c.M); this.painted.compose(g, this.leafPicture(), LEAF_PERIOD, c.box, c.L, false);
    this.leafChunks.set(c.key, out); trimLru(this.leafChunks, new Set([c.key]), LEAF_CHUNKS);
    return out;
  }
  /** the leaf litter's picture (made once): the game's leaf sprites (textures.ts leaves, as the litter on the verges) scattered over a seamless
   *  top-down square of LEAF_PERIOD tiles, each with a soft shade beside it away from the sun */
  private leafPicture(): Cnv {
    if (this.leafPic) return this.leafPic;
    const S = LEAF_PX, ppm = S / (LEAF_PERIOD * 2), c = canvas(S, S), g = ctx2d(c), r = mulberry(0x1eaf5), atlas = this.tex.leaves;
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    const n = Math.round((LEAF_PERIOD * 2) ** 2 * LEAF_DENSITY);
    for (let k = 0; k < n; k++) {
      const x = r() * S, y = r() * S, ang = r() * Math.PI * 2, sizeM = 0.12 + r() * 0.14, [sx, sy, sw, sh] = this.tex.leafRect(this.tex.pickLeaf(r, sizeM)), size = sizeM * ppm;
      for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) {
        if (x + dx < -size || x + dx > S + size || y + dy < -size || y + dy > S + size) continue;
        g.setTransform(1, 0, 0, 1, x + dx, y + dy); g.rotate(ang); g.drawImage(atlas, sx, sy, sw, sh, -size / 2, -size / 2, size, size);
      }
    }
    const out = canvas(S, S), og = ctx2d(out), k = Math.max(1, 0.03 * ppm);
    // the shade slides the seamless square with its wrapped neighbours too, so the leaves across its edge keep their shade (T140)
    for (const wx of [-S, 0, S]) for (const wy of [-S, 0, S]) og.drawImage(c, SHADOW_DIR[0] * k + wx, SHADOW_DIR[1] * k + wy);
    og.globalCompositeOperation = 'source-in'; og.fillStyle = 'rgba(30,22,12,0.42)'; og.fillRect(0, 0, S, S);
    og.globalCompositeOperation = 'source-over'; og.drawImage(c, 0, 0);
    this.leafPic = out; return out;
  }

  /** slab sprites along a run (tile space), stretched to 2.5 m x the sidewalk width like the builder's slab() */
  private drawSlabs(g: C2D, run: SlabRun, box: BBox) {
    const tex = this.tex, img = tex.slabs, [tx0, ty0, tx1, ty1] = box;
    if (run.kind === 'straight') {
      const dx = run.b.x - run.a.x, dy = run.b.y - run.a.y, L = Math.hypot(dx, dy); if (L < 0.05) return;
      const minx = Math.min(run.a.x, run.b.x) - 3, maxx = Math.max(run.a.x, run.b.x) + 3, miny = Math.min(run.a.y, run.b.y) - 3, maxy = Math.max(run.a.y, run.b.y) + 3;
      if (maxx < tx0 || minx > tx1 || maxy < ty0 || miny > ty1) return;
      const n = Math.max(1, Math.round(L / SLAB_LEN)), len = L / n, ang = Math.atan2(dy, dx), rng = mulberry(run.seed);
      const w = run.w1 - run.w0 - CURB_TOP - CURB_JOINT;
      for (let k = 0; k < n; k++) {
        const idx = tex.slabIndex(run.visible, rng()), [sx, sy, sw, sh] = tex.slabRect(idx);
        const cx = run.a.x + (dx / L) * (k + 0.5) * len + run.n.x * (run.w0 + CURB_TOP + CURB_JOINT), cy = run.a.y + (dy / L) * (k + 0.5) * len + run.n.y * (run.w0 + CURB_TOP + CURB_JOINT);
        if (cx < tx0 - 2 || cx > tx1 + 2 || cy < ty0 - 2 || cy > ty1 + 2) continue;
        g.save(); g.translate(cx, cy); g.rotate(ang);
        // the sprite's bottom row is the curb side: orient 'across' from the curb outwards
        const flip = run.n.x * Math.cos(ang + Math.PI / 2) + run.n.y * Math.sin(ang + Math.PI / 2) < 0;
        if (flip) g.scale(1, -1);
        g.drawImage(img, sx, sy, sw, sh, -len / 2 - 0.01, -0.01, len + 0.02, w + 0.02); g.restore();
      }
    } else {
      if (run.c.x + run.r1 < tx0 || run.c.x - run.r1 > tx1 || run.c.y + run.r1 < ty0 || run.c.y - run.r1 > ty1) return;
      const rm = (run.r0 + run.r1) / 2, span = run.a1 - run.a0, n = Math.max(1, Math.round(Math.abs(span) * rm / SLAB_LEN)), step = span / n, rng = mulberry(run.seed), inner = run.r0 + CURB_TOP + CURB_JOINT;
      for (let k = 0; k < n; k++) {
        const a0 = run.a0 + step * k, a1 = a0 + step, am = (a0 + a1) / 2, idx = tex.slabIndex(Math.cos(am) + Math.sin(am) < 0, rng()), [sx, sy, sw, sh] = tex.slabRect(idx);
        g.save(); g.translate(run.c.x, run.c.y); g.rotate(am);
        g.beginPath(); g.moveTo(Math.cos(a0 - am) * inner, Math.sin(a0 - am) * inner); g.arc(0, 0, run.r1 + 0.02, a0 - am, a1 - am, step < 0); g.arc(0, 0, inner, a1 - am, a0 - am, step > 0); g.closePath(); g.clip();
        const chord = Math.abs(step) * run.r1 + 0.1;
        g.drawImage(img, sx, sy, sw, sh, inner - 0.02, -chord / 2, run.r1 - inner + 0.06, chord);
        g.restore();
      }
    }
  }

  /** the blend masks (blendMask), by share and softness */
  private blendMasks = new Map<string, Cnv>();
  /** the course dirt's stage image (courseDirt), kept between chunks */
  private dirtImg: ImageData | null = null;
  /** the young grass's pattern squares by surface id and px a tile (sproutPattern) */
  private sprouts = new Map<number, Cnv>();
  /** a tileable mask of soft patches (the map grass's mix: B where the low-frequency noise is past 1 - share, blended over +-soft) */
  private blendMask(share: number, soft: number) {
    const key = `${share.toFixed(2)},${soft.toFixed(2)}`; let m = this.blendMasks.get(key);
    if (!m) { const N = 256, f = fbm(31, N, N, 3, 3), c0 = 1 - share; m = maskFrom(N, N, (x, y) => (share >= 1 ? 1 : share <= 0 ? 0 : smooth(c0 - soft, c0 + soft, f(x, y)))); this.blendMasks.set(key, m); }
    return m;
  }
  /** the lawns of a chunk (lawns.ts): each in its texture (a preset, turned by its angle), all of the patch or through the soft-patch mask (drawBlend) */
  private drawLawns(ctx: C2D, lawns: LotPatch[], L: number, X0: number, Y0: number, M: DOMMatrix, Minv: DOMMatrix, box: BBox, under: CanvasPattern | null = null, laid: readonly LotPatch[] = [], softBand: SoftBand | null = null) {
    for (const p0 of lawns) {
      // T204: a lot's lawn with its outline rounded and wobbled (its own pts still pick its look); a road block's grass lies under the
      // sidewalks that ring it, as it is
      const p = p0.lawn!.z >= 1 ? this.ruggedOf(p0).q : p0;
      // its texture: the town lawn, its look state's or its preset's (lawnTexOf)
      const t = this.lawnTexOf(p0);
      const lw = p.lawn!, pb = quadBox(p.pts), r = [Math.max(pb[0], box[0]) - 1, Math.max(pb[1], box[1]) - 1, Math.min(pb[2], box[2]) + 1, Math.min(pb[3], box[3]) + 1];
      if (r[2] <= r[0] || r[3] <= r[1] || !isPaintPhoto(p.tex) || !this.tex.has(t)) continue;
      const path = polyPath(p.pts), G = new DOMMatrix().rotateSelf(0, 0, lw.a);
      /** the whole patch in texture t (on g, over the tile box rr, clipped to the patch unless clip is false) */
      const fill = (t: string, g: C2D = ctx, rr: number[] = r, clip = true) => {
        const painted = this.paintedFill(g, t, rr as BBox), src = painted ? null : this.tex.sourceFor(t, L);
        g.save(); g.setTransform(M); if (clip) g.clip(path);
        g.fillStyle = painted ?? (src ? this.groundPattern(g, src.img, G, src.period) : this.groundPattern(g, this.tex.mosaicFor(t, L), G, this.tex.periodOf(t)));
        g.fillRect(rr[0]!, rr[1]!, rr[2]! - rr[0]!, rr[3]! - rr[1]!); g.restore();
      };
      // T247: a lot's lawn of dirt or desert with its soft band where it meets grass (the fill laid on past its outline over the band)
      // (and a lot's grass lawn over a desert block: its band where the desert lies under and round it)
      if (lw.share >= 1 && softBand && lw.z >= 1) this.softArea(ctx, softBand(p0, p.pts, 0, !this.softTex(t)), M, () => fill(t), (g, rr) => fill(t, g, rr, false), path);
      else if (lw.share >= 1) fill(t);
      else {
        // T194 (the owner: "fescue should also not coming through on edges of any of the green textures"): a block's grass in soft patches
        // lies over the rough, not the map's fescue: the whole block is the rough first (BLOCK_UNDER), its preset over the share of it
        // (the owner's blockShare: how much of the block is its preset, the rest the rough)
        if (this.tex.has(BLOCK_UNDER)) fill(BLOCK_UNDER);
        this.drawBlend(ctx, { t, s: lw.share, f: lw.soft, p: lw.patch }, 1, G, path, 'nonzero', r, L, X0, Y0, M, Minv);
      }
      // T222: a new or poor town's untended yard: fescue, dirt or desert over the mown lawn in soft patches (rough-yards.ts)
      if (lw.rough && lw.z >= 1) this.drawRough(ctx, p0, p, lw.rough, G, path, r, L, X0, Y0, M, Minv);
      // T204: a lot's lawn takes the tall grass's spill where the map's grass meets it
      if (under && lw.z >= 1) this.areaSpill(ctx, this.ruggedOf(p0), laid, [], L, M, box, under);
    }
  }
  /** a second texture laid over a surface in soft patches (a painted area's Blend with, PatchPaint m; a course look's; a road block's lawn): the
   *  texture (painted, a photo or preset in tile space at scale sx turned by G, else the screen texture) through the blend noise's mask
   *  (painted-grass-lod.ts blendNoise: world space, never periodic; share, softness and patch size from m), inside clip */
  private drawBlend(ctx: C2D, m: { t: string; s: number; f: number; p: number; g?: (x: number, y: number) => number }, sx: number, G: DOMMatrix, clip: Path2D, rule: CanvasFillRule, r: number[], L: number, X0: number, Y0: number, M: DOMMatrix, Minv: DOMMatrix, px?: readonly [number, number, number, number]) {
    if (m.s <= 0) return;
    // px (T222): the device box [x, y, w, h] the blend lies in (a yard's), so only that box of the scratch layer is cleared and laid over the chunk,
    // not the whole chunk-sized canvas; m.g weights the share by tile position
    let b: Cnv;
    if (px) { b = this.bufferAtLeast('blendBox', ctx.canvas.width, ctx.canvas.height); ctx2d(b).clearRect(px[0], px[1], px[2], px[3]); } else b = this.buffer('blend', ctx.canvas.width, ctx.canvas.height);
    const g = ctx2d(b), t = m.t;
    // the scratch layer's context is reused chunk after chunk: its clip is saved and restored, or the clips would add up
    g.save(); g.setTransform(M); g.clip(clip, rule);
    let style: CanvasPattern | string = PAINT_COL.get(t) ?? '#808080';
    const painted = this.paintedFill(g, t, r as BBox, sx);
    if (painted) style = painted;
    else if (isPaintPhoto(t)) { if (this.tex.has(t)) { const src = this.tex.sourceFor(t, L * sx); style = src ? this.groundPattern(g, src.img, G, src.period) : this.groundPattern(g, this.tex.mosaicFor(t, L * sx), G, this.tex.periodOf(t)); } }
    else if (t === 'asphaltDark' || t === 'lotAsphalt') style = this.groundPattern(g, this.tex.mosaicFor(t === 'lotAsphalt' ? 'lot' : 'base', L * sx), G);
    else if (this.tex.hasImage(t, L)) style = this.screenPattern(g, t as TexName, L, X0, Y0, Minv, G);
    g.fillStyle = style; g.fillRect(r[0], r[1], r[2] - r[0], r[3] - r[1]);
    if (m.s < 1) {
      const nm = this.noiseMask(r, m, L);
      g.globalCompositeOperation = 'destination-in'; g.imageSmoothingEnabled = true; g.drawImage(nm.img, nm.x0, nm.y0, nm.w, nm.h);
    }
    g.globalCompositeOperation = 'source-over'; g.restore();
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (px) ctx.drawImage(b, px[0], px[1], px[2], px[3], px[0], px[1], px[2], px[3]); else ctx.drawImage(b, 0, 0);
    ctx.restore();
  }
  /** T222: a rough yard's patches (rough-yards.ts): its fescue, dirt or desert (and a second look in finer patches) laid over the mown lawn through
   *  the blend noise, inside the lot's rugged outline (path), weighted by depth: most of the share in the back yard, `f` of it in the front */
  private drawRough(ctx: C2D, p0: LotPatch, p: LotPatch, mix: RoughMix, G: DOMMatrix, path: Path2D, r: number[], L: number, X0: number, Y0: number, M: DOMMatrix, Minv: DOMMatrix) {
    const q = p0.pts; if (q.length < 8) return;
    // the lot's frame from its four corners (o, o + u w, o + u w + n d, o + n d): the depth 0 at the street edge to 1 at the back
    const ox = q[0]!, oy = q[1]!, nx = q[6]! - ox, ny = q[7]! - oy, dd = nx * nx + ny * ny; if (dd < 1e-6) return;
    const depth = (x: number, y: number) => roughBack(mix.f, ((x - ox) * nx + (y - oy) * ny) / dd);
    // the yard's box in device px, from its drawn outline
    const W = ctx.canvas.width, H = ctx.canvas.height; let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let k = 0; k + 1 < p.pts.length; k += 2) { const x = p.pts[k]!, y = p.pts[k + 1]!, X = M.a * x + M.c * y + M.e, Y = M.b * x + M.d * y + M.f; x0 = Math.min(x0, X); x1 = Math.max(x1, X); y0 = Math.min(y0, Y); y1 = Math.max(y1, Y); }
    const bx = Math.max(0, Math.floor(x0) - 2), by = Math.max(0, Math.floor(y0) - 2), bw = Math.min(W, Math.ceil(x1) + 2) - bx, bh = Math.min(H, Math.ceil(y1) + 2) - by;
    if (!(bw > 0 && bh > 0)) return;
    const layers: [RoughKind, number, number][] = [[mix.k, mix.s, mix.p]]; if (mix.k2 && mix.s2) layers.push([mix.k2, mix.s2, mix.p2 ?? 0.3]);
    for (const [k, s, pa] of layers) {
      const t = ROUGH_TEX[k]; if (!this.tex.isPainted(t) && !this.tex.has(t)) continue;
      this.drawBlend(ctx, { t, s, f: ROUGH_SOFT, p: pa, g: depth }, 1, G, path, 'nonzero', r, L, X0, Y0, M, Minv, [bx, by, bw, bh]);
    }
  }
  /** the blend's mask over tile box r: blendAlpha of the blend noise sampled on the world grid (a step of a quarter of its shortest wave, finer
   *  at the closest zooms), as a small picture to stretch over r (x0, y0, w, h: tiles); outside r it is transparent */
  private noiseMask(r: number[], m: { s: number; f: number; p: number; g?: (x: number, y: number) => number }, L: number) {
    const step = Math.max(BLEND_WAVES[BLEND_WAVES.length - 1]![0] * m.p / 4, 1 / (8 * L * 10)), x0 = Math.floor(r[0]! / step) * step, y0 = Math.floor(r[1]! / step) * step;
    const w = Math.min(1024, Math.ceil((r[2]! - x0) / step) + 1), h = Math.min(1024, Math.ceil((r[3]! - y0) / step) + 1), st = Math.max((r[2]! - x0) / (w - 1), (r[3]! - y0) / (h - 1), step);
    const img = this.buffer('blendNoise', w, h), d = new ImageData(w, h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const o = (j * w + i) * 4; d.data[o + 3] = Math.round(255 * blendAlpha(blendNoise(x0 + i * st, y0 + j * st, m.p), m.g ? m.s * m.g(x0 + i * st, y0 + j * st) : m.s, m.f)); }
    ctx2d(img).putImageData(d, 0, 0);
    // the samples sit on the picture's pixel centres: the picture spans half a step more on each side
    return { img, x0: x0 - st / 2, y0: y0 - st / 2, w: w * st, h: h * st };
  }
  /** the painted areas of a chunk (the Paint tool), in id order. A crisp area (paving, kerbs: no edge profile) with no Shadow is drawn straight
   *  onto the chunk, as before. Any other is drawn into a scratch layer, given its sun-lit light and dark rims, its edge shade (T136, the Shadow
   *  slider: a cool multiply inside the edges turned from the sun and a textured light a gap inside those turned to it, both clipped to the area)
   *  and its feather (paint-edges.ts: images from its outline, made when the chunk bakes, never per frame), and laid over the chunk after the
   *  shadow it casts on the ground below */
  private drawPaints(ctx: C2D, paints: LotPatch[], L: number, X0: number, Y0: number, M: DOMMatrix, Minv: DOMMatrix, box: BBox, lite: boolean, under: CanvasPattern | null = null, others: readonly LotPatch[] = [], softBand: SoftBand | null = null) {
    const res = edgeRes(L);
    let layer: Cnv | null = null;
    /** an edge image over the tiles from (x0, y0) (res px a tile), stretched onto g through the chunk transform (bilinear) with the op */
    const put = (g: C2D, img: EdgeImage | null, x0: number, y0: number, op: GlobalCompositeOperation) => {
      if (!img) return;
      const s = this.buffer('small', img.W, img.H); ctx2d(s).putImageData(new ImageData(img.data as Uint8ClampedArray<ArrayBuffer>, img.W, img.H), 0, 0);
      g.save(); g.setTransform(M); g.globalCompositeOperation = op; g.globalAlpha = 1; g.imageSmoothingEnabled = true; g.drawImage(s, x0, y0, img.W / res, img.H / res); g.restore();
    };
    let course = false;
    // T204: the ground laid so far as drawn (the lawns, the lots, the painted areas before this one: the spill over an area reads the map's grass
    // just outside it only where none of them lies) and the course as drawn
    const drawn: LotPatch[] = [...others], courses = paints.filter(q => q.course).map(q => this.warpedCourse(q.course!, lite));
    for (const p0 of paints) {
      // the course chunks (all z 0, so side by side in the order) draw together, surface by surface, so a chunk's lower surface never
      // lands over its neighbour's higher one at a seam
      if (p0.course) { if (!course) { course = true; this.drawCourses(ctx, courses, L, X0, Y0, M, Minv, box, lite, under); } continue; }
      // T204: drawn with its outline rounded and wobbled (a soft area; paving and paths keep their line)
      const rf = this.ruggedOf(p0), p = rf.q;
      // T204: then the tall grass's spill over its edges where the map's grass meets them (a hard area's few tufts)
      const spill = () => { if (under) this.areaSpill(ctx, rf, drawn, courses, L, M, box, under); drawn.push(p); };
      const look = p.paint!.e ? EDGE_LOOKS[p.paint!.e] ?? null : null, sh = areaShadow(p.paint!.sh);
      // T230: a painted water area's depth, light edge and reflections (water-look.ts), clipped to its outline; with the glint on, its gloss
      const wet = (g: C2D) => { if (waterTex(p.tex)) this.waterOver(g, SITE.paint, () => polyPath(p.pts), p.tex, lite); };
      // T247: a dirt or desert area (the range's dirt tee, desert and yard; the Paint tool's dirt and waste) with no border, no Shadow and no
      // more of an edge than a flat feather: its soft band where it meets grass (the band stands in for the feather), else its hard outline
      if (softBand && this.softTex(p.tex) && !(p.paint!.b > 0) && !sh && (!look || look === EDGE_LOOKS.flat)) {
        const plain = { ...p, paint: { ...p.paint!, b: 0 } };
        this.softArea(ctx, softBand(p0, p.pts, COURSE_CELL), M, () => this.drawPaint(ctx, p, L, X0, Y0, M, Minv, box, lite, 0),
          (g, r) => this.drawPaint(g, { ...plain, pts: [r[0]!, r[1]!, r[2]!, r[1]!, r[2]!, r[3]!, r[0]!, r[3]!] }, L, X0, Y0, M, Minv, box, lite, 0, true), polyPath(p.pts));
        ctx.setTransform(M); spill(); continue;
      }
      if (!look && !sh) { this.drawPaint(ctx, p, L, X0, Y0, M, Minv, box, lite, 0); wet(ctx); spill(); continue; }
      const feather = look ? featherTiles(look, L) : 0, reach = Math.max(look ? edgeReach(look, feather) : 0, areaShadeReach(sh, feather)), eb = edgeBox(quadBox(p.pts), box, reach);
      if (!eb) { drawn.push(p); continue; }
      const [ex0, ey0, ex1, ey1] = eb, field = edgeField(p.pts, ex0, ey0, ex1 - ex0, ey1 - ey0, res, reach, COURSE_CELL);
      const im = look ? edgeImages(field, look, feather) : null, sd = sh ? areaShadeImages(field, sh, !lite && L >= AREA_SHADE.lightL, feather) : null;
      // the cast shadow on the ground under it, multiplied in the cool shade so the ground keeps its texture (T110)
      if (im) { put(ctx, im.shadow, ex0, ey0, 'multiply'); this.onShadeMask(m => put(m, im.shadow, ex0, ey0, 'multiply')); }
      layer ??= this.buffer('paintEdge', ctx.canvas.width, ctx.canvas.height);
      const g = ctx2d(layer), path = polyPath(p.pts);
      this.drawPaint(g, p, L, X0, Y0, M, Minv, box, lite, feather); wet(g);
      if (im) {
        // the bevel's light rim: a shine textured by the area's own colours a small gap inside where its edge reads (T110), then its dark rim
        const lb = litBox(im.light, ex0, ey0, res);
        if (im.light && lb) this.areaLight(g, im.light, lb, path, ex0, ey0, res, L, M, areaLightEdge(feather));
        put(g, im.dark, ex0, ey0, 'multiply');
        // (T186: on the mask inside the area: the dark rim lies inside its outline)
        this.onShadeMask(m => { m.setTransform(M); m.clip(path); put(m, im.dark, ex0, ey0, 'multiply'); });
      }
      if (sd && (sd.shade || sd.light)) {
        // the edge shade (T136): multiplied in its cool colour inside the area only (a crisp area has no cut to trim what lands outside), then
        // the light on the sun side
        if (sd.shade) { g.save(); g.setTransform(M); g.clip(path); put(g, sd.shade, ex0, ey0, 'multiply'); g.restore(); this.onShadeMask(m => { m.setTransform(M); m.clip(path); put(m, sd.shade, ex0, ey0, 'multiply'); }); }
        if (sd.light && sd.lightBox) this.areaLight(g, sd.light, sd.lightBox, path, ex0, ey0, res, L, M, areaLightEdge(feather));
      }
      if (im) put(g, im.cut, ex0, ey0, 'destination-out');
      // only the canvas px under the image box: laid over the chunk, then cleared for the next area
      let sx0 = Infinity, sy0 = Infinity, sx1 = -Infinity, sy1 = -Infinity;
      for (const [x, y] of [[ex0, ey0], [ex1, ey0], [ex0, ey1], [ex1, ey1]]) { const X = M.a * x! + M.c * y! + M.e, Y = M.b * x! + M.d * y! + M.f; sx0 = Math.min(sx0, X); sx1 = Math.max(sx1, X); sy0 = Math.min(sy0, Y); sy1 = Math.max(sy1, Y); }
      const rx = Math.max(0, Math.floor(sx0) - 2), ry = Math.max(0, Math.floor(sy0) - 2), rw = Math.min(layer.width, Math.ceil(sx1) + 2) - rx, rh = Math.min(layer.height, Math.ceil(sy1) + 2) - ry;
      if (rw > 0 && rh > 0) {
        ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.drawImage(layer, rx, ry, rw, rh, rx, ry, rw, rh); ctx.restore();
        g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(rx, ry, rw, rh); g.restore();
      }
      spill();
    }
  }
  /** the course chunks of a ground chunk (the course grid; plan P21 sections 3.4 and 3.8, T077; the walls T099), under the chunk transform,
   *  layer by layer in DRAW_ORDER (course-walls: rough 1 .. green 8, each surface's collar band just before it, the bunker's lip after the
   *  green) across every chunk:
   *  - a collar band: its outward feather (its soft runs only), its fill (a pond's bank then its wet soil and stones), its lit top edges;
   *  - a surface, its top: 1. a sunken surface's floor shade (paint-edges' field images, light from the upper right); 2. its outward
   *    feather: its soft runs stroked in its own texture at FEATHER_STEPS widths, widest first (a linear fade, unclipped; the fill covers the
   *    inner half); 3. its fill: the rings, even-odd; 4. the dirt of seeded cells and their young grass through the growth mask x the soft-patch noise
   *    (COURSE_DIRT); 5. the floor shade's light and dark rims; 6. its joint runs: a crisp mowing line where it meets its own collar (the
   *    kerb's joint); 7. its lit top edges (courseRims: a soft painted light along its edges whose step faces the sun at the upper right);
   *    8. last on its top, the fairway's mowing stripes (courseStripes, T218: clipped to its rings, at every tier as the range's are);
   *  - then the walls hanging over that layer (courseWalls), so every layer drawn later covers them where it overlaps and no wall crosses a
   *    later surface; the walls over the map grass go first of all.
   *  Edges that are walls or hidden under a later layer get no feather: they stay crisp, as a kerb's edge. No dark outline stroke. A district
   *  (lite) chunk draws the fills, the collar fills, the grow-in (the ground's state, never left out), the walls in their light steps and the
   *  fairway's stripes only (no feathers, shades, bands or edges; the stripes read at every zoom, as the range outfield's do) */
  private drawCourses(ctx: C2D, cs: CoursePatch[], L: number, X0: number, Y0: number, M: DOMMatrix, Minv: DOMMatrix, box: BBox, lite: boolean, under: CanvasPattern | null = null) {
    const r = [box[0] - 1, box[1] - 1, box[2] + 1, box[3] + 1], res = courseRes(L);
    // T227: the course finish (course-finish.ts): the greens' fine stripes, the collar's tone, the bunkers' lips (the bands: step 8)
    const fin = this.finish(), green = greenStripeLook(fin, FAIRWAY_STRIPES), collarTone = collarToneOf(fin), lip = fin.on ? fin.lip : 0;
    /** a course texture as a fill style on g: painted (its look, composed over the part `need` of the chunk), the photo or preset in tile space
     *  (turned and scaled about the origin), else the screen texture */
    const style = (g: C2D, t: CourseTex, need?: BBox) => {
      const G = new DOMMatrix().rotateSelf(0, 0, t.a).scaleSelf(t.sc, t.sc);
      const painted = this.paintedFill(g, t.tex, need, t.sc); if (painted) return painted;
      return isPaintPhoto(t.tex) ? this.paintPhoto(g, t.tex, L, G, t.sc) : this.screenPattern(g, t.tex as TexName, L, X0, Y0, Minv, G);
    };
    const ringsOf = (rings: readonly ArrayLike<number>[]) => { const p = new Path2D(); for (const q of rings) ringPath(p, q); return p; };
    /** the tile box of rings or polylines grown by pad, inside the chunk's box (a painted look is composed only there) */
    const boxOf = (lines: readonly ArrayLike<number>[], pad = 1): BBox => {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const q of lines) for (let k = 0; k + 1 < q.length; k += 2) { const x = q[k]!, y = q[k + 1]!; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      return [Math.max(r[0]!, x0 - pad), Math.max(r[1]!, y0 - pad), Math.min(r[2]!, x1 + pad), Math.min(r[3]!, y1 + pad)];
    };
    /** T227: the course finish's collar tone (a multiply of its tint at its strength, a tone that keeps the texture: left as it was by T261)
     *  over what g draws next with `draw` (fill or stroke), at alpha k */
    type CollarTone = { tc: string; ta: number };
    const collarOver = (g: C2D, c: CollarTone, k: number, draw: () => void) => {
      if (!(c.ta > 0)) return;
      g.globalCompositeOperation = 'multiply'; g.globalAlpha = c.ta * k; g.fillStyle = g.strokeStyle = c.tc; draw();
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    };
    /** rings filled even-odd in t: the fill, its blend with a second texture in soft patches (never periodic), then its exposure (T261,
     *  exposure.ts: the fill's own pixels darker or lighter, inside its rings); extra: the course finish's collar tone over it (T227) */
    const fill = (t: CourseTex, rings: readonly ArrayLike<number>[], extra?: CollarTone | null) => {
      if (!rings.length) return;
      const clip = ringsOf(rings), need = boxOf(rings);
      if (need[2] <= need[0] || need[3] <= need[1]) return;
      ctx.save(); ctx.setTransform(M); ctx.clip(clip, 'evenodd'); ctx.fillStyle = style(ctx, t, need); ctx.fillRect(need[0], need[1], need[2] - need[0], need[3] - need[1]); ctx.restore();
      if (t.m && !lite) this.drawBlend(ctx, t.m, t.sc, new DOMMatrix().rotateSelf(0, 0, t.a).scaleSelf(t.sc, t.sc), clip, 'evenodd', need, L, X0, Y0, M, Minv);
      if (exposed(t.x) || extra) {
        ctx.save(); ctx.setTransform(M); ctx.clip(clip, 'evenodd');
        exposeClip(ctx, t.x, need[0], need[1], need[2], need[3]);
        if (extra) collarOver(ctx, extra, 1, () => ctx.fillRect(need[0], need[1], need[2] - need[0], need[3] - need[1]));
        ctx.restore();
      }
    };
    /** polylines (a closed one repeats its first point) as one path */
    const linesOf = (lines: readonly ArrayLike<number>[]) => {
      const p = new Path2D();
      for (const q of lines) {
        const m = q.length; if (m < 4) continue;
        const ring = m >= 8 && q[0] === q[m - 2] && q[1] === q[m - 1]; // a closed edge: joined round at its first point too
        p.moveTo(q[0]!, q[1]!); for (let k = 2; k + 1 < (ring ? m - 2 : m); k += 2) p.lineTo(q[k]!, q[k + 1]!);
        if (ring) p.closePath();
      }
      return p;
    };
    /** soft edge polylines stroked in t, FEATHER_STEPS strokes from 2f wide down, alpha 1 / (n - k): out to f tiles past the edge the coverage
     *  falls linearly (butt ends: a polyline cut at a chunk seam meets its neighbour's end square on) */
    const feather = (t: CourseTex, lines: readonly ArrayLike<number>[], f: number, extra?: CollarTone | null) => {
      if (!lines.length || f <= 0) return;
      const p = linesOf(lines), n = FEATHER_STEPS, need = boxOf(lines, f + 1);
      if (need[2] <= need[0] || need[3] <= need[1]) return;
      ctx.save(); ctx.setTransform(M); ctx.lineJoin = 'round'; ctx.lineCap = 'butt'; const st = style(ctx, t, need);
      // each step's stroke, then its exposure (T261: the same stroke darker, or its texture added again) and the collar tone, at its alpha
      for (let k = 0; k < n; k++) { ctx.strokeStyle = st; ctx.globalAlpha = 1 / (n - k); ctx.lineWidth = 2 * f * (1 - k / n); ctx.stroke(p); exposeDraw(ctx, t.x, st, () => ctx.stroke(p), 1 / (n - k)); if (extra) collarOver(ctx, extra, 1 / (n - k), () => ctx.stroke(p)); }
      ctx.restore();
    };
    /** an edge image over the tiles from (x0, y0), stretched onto ctx through the chunk transform with the op */
    const put = (img: EdgeImage | null, x0: number, y0: number, op: GlobalCompositeOperation, g: C2D = ctx) => {
      if (!img) return;
      const s = this.buffer('small', img.W, img.H); ctx2d(s).putImageData(new ImageData(img.data as Uint8ClampedArray<ArrayBuffer>, img.W, img.H), 0, 0);
      g.save(); g.setTransform(M); g.globalCompositeOperation = op; g.imageSmoothingEnabled = true; g.drawImage(s, x0, y0, img.W / res, img.H / res); g.restore();
    };
    const flatF = featherTiles(EDGE_LOOKS.flat!, L), wallF = 0.5 * jointFeather(L);
    /** T256 (#743): what `draw` laid in the layer's own look, again in each of its alternate looks (another hole's, the property's, a
     *  facility's), clipped to that look's share of the chunk */
    type Alt = NonNullable<CourseLayer['alts']>[number];
    const alts = (l: CourseLayer, draw: (a: Alt) => void) => {
      if (!l.alts) return;
      for (const a of l.alts) {
        const p = new Path2D(), q = a.runs; for (let k = 0; k + 3 < q.length; k += 4) p.rect(q[k]!, q[k + 1]!, q[k + 2]! - q[k]!, q[k + 3]! - q[k + 1]!);
        ctx.save(); ctx.setTransform(M); ctx.clip(p); draw(a); ctx.restore();
      }
    };
    /** T204: the tall grass's spill over the fairway and its first cut (CoursePatch.spill, as drawn): for each tall layer outside, its blades
     *  (rugged-edges spillBlades, made once a patch and blade scale) cut from that layer's own picture and tone (the rough's, the fescue's), or
     *  from the ground under the course where the map's grass meets the turf */
    const spill = () => {
      const k = spillScale(L, TILE_PX), x0 = box[0] - 1, y0 = box[1] - 1, x1 = box[2] + 1, y1 = box[3] + 1;
      const by = new Map<number, { blades: Path2D[]; near: Path2D; far: Path2D; box: BBox }>();
      for (const c of cs) {
        if (!c.spill?.length) continue;
        for (const b of this.courseSpillOf(c, k)) {
          if (b.box[2] < x0 || b.box[0] > x1 || b.box[3] < y0 || b.box[1] > y1) continue;
          let e = by.get(b.o); if (!e) by.set(b.o, e = { blades: [], near: new Path2D(), far: new Path2D(), box: [Infinity, Infinity, -Infinity, -Infinity] });
          e.blades.push(...b.blades); e.near.addPath(b.near); e.far.addPath(b.far);
          e.box = [Math.min(e.box[0], b.box[0]), Math.min(e.box[1], b.box[1]), Math.max(e.box[2], b.box[2]), Math.max(e.box[3], b.box[3])];
        }
      }
      for (const [o, e] of by) {
        const t = o ? cs.flatMap(c => c.layers).find(l => l.s === o >> 1) : null;
        const need: BBox = [Math.max(r[0]!, e.box[0]), Math.max(r[1]!, e.box[1]), Math.min(r[2]!, e.box[2]), Math.min(r[3]!, e.box[3])];
        if (need[2] <= need[0] || need[3] <= need[1]) continue;
        const fill = t ? style(ctx, t, need) : under; if (!fill) continue;
        this.layBlades(ctx, M, e.blades, e.near, e.far, fill, t && exposed(t.x) ? draw => exposeDraw(ctx, t.x, fill, draw) : undefined);
      }
    };
    const layers = (s: number) => { const out: { c: CoursePatch; l: CourseLayer }[] = []; for (const c of cs) for (const l of c.layers) if (l.s === s) out.push({ c, l }); return out; };
    // the walls by the layer they hang over, the lit top edges by the layer they light. A raised surface's bank or rock face (T127) is drawn
    // just before that surface's first layer instead, over every flat layer drawn so far (one bank spans the rough and the fairway alike)
    // and kept off the ponds' and bunkers' fills (banksKept); one hanging over a layer drawn after its surface (a tee's bank over a green)
    // goes with that layer's walls
    const wallsOver = new Map<number, CourseWall[]>(), banksAt = new Map<number, CourseWall[]>(), rimsOn = new Map<number, CourseRim[]>(), allWalls = cs.flatMap(c => c.walls ?? []);
    const rankOf = (code: number) => DRAW_ORDER.indexOf(code), firstOf = (s: number) => DRAW_ORDER.find(c => c >> 1 === s) ?? -1;
    const push = <T>(m: Map<number, T[]>, k: number, v: T) => { const l = m.get(k); if (l) l.push(v); else m.set(k, [v]); };
    /** whether a run's face (and its shadow) can reach this ground chunk's box: a bank's or a rock face's runs elsewhere in the course
     *  chunks are skipped (they are many small shapes: stones, steps) */
    const near = (w: CourseWall) => {
      const p = w.p; let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, dh = 0;
      for (let i = 0; i + 2 < p.length; i += 3) { const x = p[i]!, y = p[i + 1]!; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (p[i + 2]! > dh) dh = p[i + 2]!; }
      const g = dh * ((w.r ?? 0) + WALL_DROP + 1) + 0.3; // the foot (out and down), a cast shadow, the stairs' flight
      return x1 + g >= r[0]! && x0 - g <= r[2]! && y1 + g >= r[1]! && y0 - g <= r[3]!;
    };
    for (const c of cs) {
      for (const w of c.walls ?? []) { if (w.f && !near(w)) continue; const at = w.f ? firstOf(w.hs ?? 0) : -1; if (at >= 0 && (w.lo === 0 || rankOf(w.lo) < rankOf(at))) push(banksAt, at, w); else push(wallsOver, w.lo, w); }
      for (const q of c.rims ?? []) push(rimsOn, q.hi, q);
    }
    // the tees' stairs, each once (every chunk a tee touches carries them)
    const stairMap = new Map<string, Stair>();
    for (const c of cs) for (let q = 0, st = c.st ?? []; q + 4 < st.length; q += 5) stairMap.set(`${st[q]},${st[q + 1]},${st[q + 2]},${st[q + 3]}`, { x: st[q]!, y: st[q + 1]!, nx: st[q + 2]!, ny: st[q + 3]!, half: st[q + 4]! });
    const stairs = [...stairMap.values()];
    /** a bank's grass: the first cut (a tee's own collar; round a green too: the green and its fringe sit on top, the bank below is the
     *  first cut), else the rough's, else the surface's own collar or look */
    const grassOf = (s: number): CourseTex | null => {
      for (const c of cs) for (const l of c.layers) if (l.collar?.n === 'first-cut' && (l.s === s || s === SURF.green)) return l.collar;
      for (const c of cs) for (const l of c.layers) if (l.s === SURF.rough) return l;
      for (const c of cs) for (const l of c.layers) if (l.s === s) return l.collar ?? l;
      return null;
    };
    /** the rings a layer is drawn with, all chunks', as one even-odd path: a surface's fill, a collar's band */
    const ringsOfCode = (code: number) => { const p = new Path2D(); for (const { l } of layers(code >> 1)) for (const q of (code & 1 ? l.collar?.fill : l.fill) ?? []) ringPath(p, q); return p; };
    /** the walls hanging over layer lo, clipped to it (a wall never pokes past the ground it stands on: a bunker's far wall stops at the sand's
     *  near edge, an island's wall at the water); over the map grass unclipped (every course layer is drawn after them) */
    // the course look's Shadow by surface (every chunk carries the same; by default none for a green, a hairline for the rest)
    const shs = cs.find(c => c.sh)?.sh, shades = new Map<number, WallShade>();
    const shadeOf = (s: number) => { let v = shades.get(s); if (!v) shades.set(s, v = wallShade(shs?.[s] ?? defaultShadow(s))); return v; };
    const banks = (ws: readonly CourseWall[]) => this.courseBanks(ctx, ws, L, M, Minv, X0, Y0, lite, shadeOf, grassOf, stairs, style);
    const walls = (lo: number) => {
      const ws = wallsOver.get(lo); if (!ws) return;
      const clip = lo ? ringsOfCode(lo) : null, wl = ws.filter(w => !w.f), bk = ws.filter(w => w.f);
      if (wl.length) this.courseWalls(ctx, wl, L, M, Minv, X0, Y0, lite, clip, shadeOf);
      // a tee's rock runs on down its cut face into a bunker (T127): the face's top share, the tee's height above the rough, in rock
      const lip = -(SURF_HEIGHT[SURF.bunker] ?? 0);
      for (const w of wl) if (w.m === WallMat.Sand && w.hs === SURF.tee && near(w)) {
        let band = this.rockBands.get(w);
        if (band === undefined) {
          const q = Float32Array.from(w.p); for (let i = 2; i < q.length; i += 3) q[i] = Math.max(0, q[i]! - lip);
          band = q.some((v, i) => i % 3 === 2 && v > 0.05) ? { p: q, lo: w.lo, m: WallMat.Turf, hs: SURF.tee, f: FaceForm.Rock, r: 0 } : null;
          this.rockBands.set(w, band);
        }
        if (band) bk.push(band);
      }
      if (bk.length) { const draw = banks(bk); ctx.save(); if (clip) { ctx.setTransform(M); ctx.clip(clip); } draw(); ctx.restore(); }
    };
    /** the banks drawn before layer `code` (its surface's first), kept off the fills of the ponds and bunkers drawn before it: one pass
     *  outside the boxes of the chunks that have such fills, and one in each of those boxes with its own fills cut out (one chunk's rings
     *  never overlap each other, so even-odd cuts them exactly; across chunks the 0.1-tile overlaps would not) */
    const banksKept = (ws: readonly CourseWall[], code: number) => {
      const draw = banks(ws), big = new Path2D(); big.rect(r[0]!, r[1]!, r[2]! - r[0]!, r[3]! - r[1]!);
      const cut = [SURF.water, SURF.bunker].filter(s => rankOf(layerCode(s, false)) < rankOf(code));
      const per = cs.map(c => ({ c, ls: c.layers.filter(l => cut.includes(l.s as 3 | 6) && l.fill.length) })).filter(q => q.ls.length);
      const boxOf = (c: CoursePatch, p: Path2D) => p.rect(c.cx * c.size, c.cy * c.size, c.size, c.size);
      ctx.save(); ctx.setTransform(M);
      if (per.length) { const p = new Path2D(big); for (const q of per) boxOf(q.c, p); ctx.clip(p, 'evenodd'); }
      draw(); ctx.restore();
      for (const { c, ls } of per) {
        ctx.save(); ctx.setTransform(M); const b = new Path2D(); boxOf(c, b); ctx.clip(b);
        for (const l of ls) { const e = new Path2D(big); for (const q of l.fill) ringPath(e, q); ctx.clip(e, 'evenodd'); }
        draw(); ctx.restore();
      }
    };
    /** the lit top edges on layer hi, clipped to it (a green's a hairline: its raised edge reads by a thin light, the owner 2026-10-25) */
    const rims = (hi: number) => { const rs = rimsOn.get(hi); if (rs && !lite) this.courseRims(ctx, rs, L, M, hi ? ringsOfCode(hi) : null, hi >> 1 === SURF.green ? 0.35 : 1); };
    walls(0); rims(0);
    for (const code of DRAW_ORDER) {
      const s = code >> 1, ls = layers(s), bk = banksAt.get(code);
      if (bk) banksKept(bk, code);
      if (code & 1) {
        // a lip or bank lies on the ground under it and takes no part in the walls (course-walls isOverlay): kept off every wall face
        const over = isOverlay(code) && allWalls.length > 0;
        if (over) { const keep = new Path2D(); keep.rect(r[0]!, r[1]!, r[2]! - r[0]!, r[3]! - r[1]!); keep.addPath(wallFaces(allWalls)); ctx.save(); ctx.setTransform(M); ctx.clip(keep, 'evenodd'); }
        // a thin band (the Border slider) feathers no wider than itself, but never under 0.6 of the flat feather (T196: no crisp outer line)
        // T227: the course finish's darker collar (every first cut, the greens' fringe): a multiply over its fill and its feathers alike
        // and a bunker's lip band in the fairway's first cut (its g: the bunker sits in the collar, as in the concept), toned as the collar
        const tex = (l: CourseLayer): CourseTex => (fin.on && l.collar!.g ? l.collar!.g : l.collar!);
        const tone = (l: CourseLayer): CollarTone | null => (collarTone && l.collar && (tonedCollar(l.collar.n) || (fin.on && l.collar.g)) ? collarTone : null);
        // T256: an alternate look's band (its lip grass with the finish), as tex; none: it keeps the layer's band
        const atone = (l: CourseLayer, a: Alt): CollarTone | null => (collarTone && l.collar && (tonedCollar(l.collar.n) || (fin.on && a.g)) ? collarTone : null);
        const band = (l: CourseLayer, draw: (t: CourseTex, tn: CollarTone | null) => void) => alts(l, a => { const t = fin.on && a.g ? a.g : a.band; if (t) draw(t, atone(l, a)); });
        if (!lite) for (const { l } of ls) if (l.collar) { const sf = l.collar.soft ?? l.collar.edges, w = Math.min(flatF, Math.max(l.collar.w ?? flatF, 0.6 * flatF)); feather(tex(l), sf, w, tone(l)); band(l, (t, tn) => feather(t, sf, w, tn)); }
        // T196: every edge of a raised band (a green's fringe, a tee's cut) softened a little, its walls' tops too: the band's texture fades
        // over the top of the face hanging from it (a pond's bank keeps its own wet edge)
        if (!lite && code !== layerCode(SURF.water, true)) for (const { l } of ls) if (l.collar) { const e = l.collar.edges; feather(tex(l), e, wallF, tone(l)); band(l, (t, tn) => feather(t, e, wallF, tn)); }
        for (const { l } of ls) if (l.collar) { const cf = l.collar.fill; fill(tex(l), cf, tone(l)); band(l, (t, tn) => fill(t, cf, tn)); }
        // T227: the bunker's raised grass lip round the sand (its lip band): lit on its far side, a light shade on its near side
        if (lip > 0 && !lite && code === layerCode(SURF.bunker, true)) this.bunkerGrassLip(ctx, ls.map(q => q.l), L, M, lip);
        // a pond's bank: wet soil fading out from the water's edge into the grass, and a few stones
        if (!lite && code === layerCode(SURF.water, true)) this.courseBank(ctx, ls.flatMap(q => q.l.edges), ringsOfCode(code), L, M);
        if (over) ctx.restore();
        rims(code);
      } else if (ls.length) {
        // the profile's feather width; the light and shade fields only for a sunken surface's floor (raised edges are walls now)
        const prof = EDGE_LOOKS[ls[0]!.l.e] ?? null, f = prof ? featherTiles(prof, L) : flatF, look = prof?.sunken ? prof : null;
        const ims: { im: ReturnType<typeof courseImages>; x0: number; y0: number }[] = [], edgePath = new Path2D();
        if (!lite && look) {
          // every chunk here takes the field over its own box from all the surface's edges within reach (so a seam is lit as one curve)
          const reach = edgeReach(look, f), all = ls.flatMap(q => q.l.edges);
          // the edges as a path: the floor light's gap is cut along them (T110)
          for (const e of all) { if (e.length < 4) continue; edgePath.moveTo(e[0]!, e[1]!); for (let k = 2; k + 1 < e.length; k += 2) edgePath.lineTo(e[k]!, e[k + 1]!); }
          let ex0 = Infinity, ey0 = Infinity, ex1 = -Infinity, ey1 = -Infinity;
          for (const e of all) for (let k = 0; k + 1 < e.length; k += 2) { const x = e[k]!, y = e[k + 1]!; if (x < ex0) ex0 = x; if (x > ex1) ex1 = x; if (y < ey0) ey0 = y; if (y > ey1) ey1 = y; }
          for (const c of cs) {
            const x0 = Math.max(box[0], c.cx * c.size), y0 = Math.max(box[1], c.cy * c.size), x1 = Math.min(box[2], (c.cx + 1) * c.size), y1 = Math.min(box[3], (c.cy + 1) * c.size);
            if (x1 <= x0 || y1 <= y0 || ex1 < x0 - reach || ex0 > x1 + reach || ey1 < y0 - reach || ey0 > y1 + reach) continue;
            const F = lineField(c.layers.find(q => q.s === s)?.fill ?? [], all, x0, y0, x1 - x0, y1 - y0, res, reach);
            if (F.any) ims.push({ im: courseImages(F, look, f), x0, y0 });
          }
        }
        for (const q of ims) { put(q.im.shadow, q.x0, q.y0, 'multiply'); this.onShadeMask(m => put(q.im.shadow, q.x0, q.y0, 'multiply', m)); } // 1
        // T256: each in the layer's own look, then in its alternate looks over their shares
        if (!lite) for (const { l } of ls) { const e = l.soft ?? l.edges; feather(l, e, f); alts(l, a => feather(a.look, e, f)); } // 2
        if (!lite) for (const { l } of ls) if (l.joint?.length) { const j = l.joint, jf = jointFeather(L); feather(l, j, jf); alts(l, a => feather(a.look, j, jf)); } // 2b: the cross-fade over its own collar (T196)
        if (!lite && !prof?.sunken && s !== SURF.water) for (const { l } of ls) { feather(l, l.edges, wallF); alts(l, a => feather(a.look, l.edges, wallF)); } // 2c: its walls' tops softened (T196)
        for (const { l } of ls) { fill(l, l.fill); alts(l, a => fill(a.look, l.fill)); }         // 3
        if (COURSE_DIRT) for (const { c, l } of ls) if (c.grow) this.courseDirt(ctx, c, l, L, X0, Y0, M, Minv, r); // 4: every tier, the grow-in is the ground's state (P23 D5.1)
        for (const q of ims) {                                                                     // 5
          // the light as a shine textured by the sand under it (T110: on its mid-tones and highlights only), starting a small gap inside the
          // lip (its edge reads at the outline: the feather lies outside), the shade multiplied
          const im = q.im.light, lb = litBox(im, q.x0, q.y0, res);
          if (im && lb) this.areaLight(ctx, im, lb, edgePath, q.x0, q.y0, res, L, M, 0, SHINE_TINT);
          put(q.im.dark, q.x0, q.y0, 'multiply'); this.onShadeMask(m => put(q.im.dark, q.x0, q.y0, 'multiply', m));
        }
        // 5a, T230: the pond's depth, light edge and reflections (water-look.ts), clipped to the course's water; with the glint on, its gloss
        if (s === SURF.water) this.waterOver(ctx, SITE.course, () => ringsOfCode(code), ls[0]!.l.tex, lite);
        // 5b, T227: the bunker's lip on the sand: the dark crescent inside its far rim, the light near lip (under the walls drawn after it)
        if (lip > 0 && !lite && s === SURF.bunker) this.bunkerSandLip(ctx, ls.map(q => q.l), L, M, lip);
        if (!lite) {                                                                               // 6
          const joints = ls.flatMap(q => q.l.joint ?? []);
          // T196: a soft shade on the collar side (the lower surface), reaching a little back over the surface, stronger turned from the sun:
          // no crisp mowing line
          if (joints.length) { const up = ringsOfCode(code), down = ringsOfCode(code | 1); this.courseJointShade(ctx, joints, L, M, up, down); this.onShadeMask(m => this.courseJointShade(m, joints, L, M, up, down)); }
        }
        rims(code);                                                                                // 7
        if (this.stripes && s === SURF.fairway) { const fl = finishStripeLook(fin, FAIRWAY_STRIPES); for (const { c, l } of ls) this.courseStripes(ctx, c, l, r, M, lite, fl ?? FAIRWAY_STRIPES, !!fl); } // 8 (T218; T227 the finish's bands)
        if (this.stripes && s === SURF.green && green) for (const { c, l } of ls) this.courseStripes(ctx, c, l, r, M, lite, green, true); // 8 (T227: the greens' fine stripes)
        if (s === SURF.fairway && !lite && this.rugged) spill();                                                   // 9: the tall grass's spill (T204)
      }
      walls(code);
    }
  }
  /** the walls hanging over one layer (T099; ext/course-walls WallRun: each run's top edge with its drop, the higher side on the left, the
   *  face looking along the right-hand normal toward the camera), all chunks' at once so a run cut at a chunk border is one shape. A face
   *  hangs straight down the screen from its edge, WALL_DROP tiles per metre along the tile direction (1, 1) (the top stays where the grid
   *  has it, so sprites and cursors line up), clipped to the layer it hangs over (clip: its rings; null over the map grass). In order: the
   *  shadow it casts on the ground past its foot (faces turned from the sun at the upper right: falling at 145°, as long as the drop) and a
   *  tight contact shade along the foot, both multiplied in a cool shade so the ground keeps its texture (T110), as strong as the course
   *  look's Shadow of the wall's owner (shadeOf(shadowOwner): none under a green, a hairline contact line elsewhere by default); a green's bank
   *  over turf in its own light grass look, GREEN_FACE tall (GREEN_BANK); any other face in its material's
   *  three bands (WALL_LOOKS), its light mixed along the edge between its points' normals against the sun (WALL_STEPS steps), its body in the
   *  material's wall art once that slot is registered (wallArt, shaded by the steps), else painted with the soil photo laid softly over it;
   *  the tufts hanging from the top edge. Lite: the face's middle band in its light steps only */
  private courseWalls(ctx: C2D, ws: readonly CourseWall[], L: number, M: DOMMatrix, Minv: DOMMatrix, X0: number, Y0: number, lite: boolean, clip: Path2D | null, shadeOf: (s: number) => WallShade = s => wallShade(defaultShadow(s))) {
    const px = 1 / (TILE_PX * L), NB = WALL_STEPS, sx = -SUN_DIR.x, sy = -SUN_DIR.y; // a cache px in tiles; the shadows' direction (tiles)
    // the runs by look (their material's, or a green's bank) and by whose Shadow they take
    const groups = new Map<number, CourseWall[]>();
    for (const w of ws) {
      const wr = { m: w.m as WallMat, hs: w.hs ?? 0 }, li = faceScale(wr) < 1 ? GREEN_BANK : w.m, key = li * 16 + shadowOwner(wr);
      const gr = groups.get(key); if (gr) gr.push(w); else groups.set(key, [w]);
    }
    for (const [key, runs] of groups) {
      const li = key >> 4, m = li === GREEN_BANK ? WallMat.Turf : li, look = WALL_LOOKS[li]!, sh = shadeOf(key & 15), face = li === GREEN_BANK ? GREEN_FACE : 1;
      const nb = lite ? 1 : look.bands.length, bases = Array.from({ length: nb }, () => new Path2D()), bands = Array.from({ length: nb * NB }, () => new Path2D());
      const shadow = [new Path2D(), new Path2D(), new Path2D()], foot = new Path2D(), tufts = [new Path2D(), new Path2D()];
      const T = look.tuft;
      let shade = false;
      for (const w of runs) {
        const p = w.p, n = p.length / 3; if (n < 2) continue;
        // per point: its drop (tiles along (1, 1)) and, from its normal, its light and how much it turns from the sun
        const { t, nx: pnx, ny: pny } = wallPoints(p, face), lit = new Float64Array(n), away = new Float64Array(n);
        for (let i = 0; i < n; i++) { lit[i] = faceLight(pnx[i]!, pny[i]!); away[i] = Math.max(0, -(pnx[i]! * SUN_DIR.x + pny[i]! * SUN_DIR.y)); }
        // each band's strip whole (under its light steps: no hairlines between them)
        for (let q = 0, f0 = 0; q < nb; q++) {
          const f1 = lite ? 1 : look.cuts[q]!, bp = bases[q]!;
          bp.moveTo(p[0]! + f0 * t[0]!, p[1]! + f0 * t[0]!); for (let i = 1; i < n; i++) bp.lineTo(p[3 * i]! + f0 * t[i]!, p[3 * i + 1]! + f0 * t[i]!);
          for (let i = n - 1; i >= 0; i--) bp.lineTo(p[3 * i]! + f1 * t[i]!, p[3 * i + 1]! + f1 * t[i]!);
          bp.closePath(); f0 = f1;
        }
        for (let i = 0; i + 1 < n; i++) {
          const x0 = p[3 * i]!, y0 = p[3 * i + 1]!, x1 = p[3 * i + 3]!, y1 = p[3 * i + 4]!, t0 = t[i]!, t1 = t[i + 1]!, len = Math.hypot(x1 - x0, y1 - y0);
          const k = lite ? 1 : Math.max(1, Math.ceil(len / WALL_LIGHT_SPAN)), lines = (y1 - y0 - (x1 - x0)) * Math.SQRT1_2 / (len || 1) >= WALL_LINE_FACING; // (dy - dx) / len: the face toward the camera
          // the bands, a stretch at a time, each stretch in the light mixed at its middle
          for (let j = 0; j < k; j++) {
            const a = j / k, b = (j + 1) / k, li = lit[i]! + (lit[i + 1]! - lit[i]!) * (a + b) / 2, bin = Math.round(li * (NB - 1));
            const xa = x0 + (x1 - x0) * a, ya = y0 + (y1 - y0) * a, ta = t0 + (t1 - t0) * a, xb = x0 + (x1 - x0) * b, yb = y0 + (y1 - y0) * b, tb = t0 + (t1 - t0) * b;
            let f0 = 0;
            for (let q = 0; q < nb; q++) {
              const f1 = lite ? 1 : look.cuts[q]!, path = bands[q * NB + bin]!;
              path.moveTo(xa + f0 * ta, ya + f0 * ta); path.lineTo(xb + f0 * tb, yb + f0 * tb); path.lineTo(xb + f1 * tb, yb + f1 * tb); path.lineTo(xa + f1 * ta, ya + f1 * ta); path.closePath();
              f0 = f1;
            }
          }
          if (lite) continue;
          // the tufts: one wherever the edge crosses a line x - y = (k + jitter) * gap (a place on the screen, the same in every chunk), some
          // left out; each one's length, lean and shade hashed from k
          const u0 = x0 - y0, u1 = x1 - y1;
          if (lines) { foot.moveTo(x0 + t0, y0 + t0); foot.lineTo(x1 + t1, y1 + t1); }
          if (lines && Math.abs(u1 - u0) > 1e-9) for (let q = Math.ceil(Math.min(u0, u1) / T.gap - 0.5), q1 = Math.floor(Math.max(u0, u1) / T.gap + 0.5); q <= q1; q++) {
            if (hash01(q, m + 3) < T.skip) continue;
            const u = (q + 0.8 * (hash01(q, m) - 0.5)) * T.gap, f = (u - u0) / (u1 - u0); if (f < 0 || f >= 1) continue;
            const X = x0 + f * (x1 - x0), Y = y0 + f * (y1 - y0), d = t0 + f * (t1 - t0), h = hash01(q, m + 7), len = (T.frac * d + T.len) * (0.35 + 1.1 * h * h), lean = (hash01(q, m + 13) - 0.5) * 0.6 * len;
            const tf = tufts[hash01(q, m + 17) < 0.5 ? 0 : 1]!; tf.moveTo(X - 0.004, Y - 0.004); tf.lineTo(X + len + lean, Y + len - lean);
          }
        }
        if (lite) continue;
        // the cast shadow: from the foot along the shadows' direction, as long as the drop times how much the face turns from the sun, in three
        // nested lengths (a soft end)
        if (sh.castA > 0 && away.some(a => a > 0.02)) {
          shade = true;
          for (let k = 0; k < 3; k++) {
            const sp = shadow[k]!, kk = (1 - k / 3) * sh.cast;
            sp.moveTo(p[0]! + t[0]!, p[1]! + t[0]!); for (let i = 1; i < n; i++) sp.lineTo(p[3 * i]! + t[i]!, p[3 * i + 1]! + t[i]!);
            for (let i = n - 1; i >= 0; i--) { const d = p[3 * i + 2]! * kk * away[i]!; sp.lineTo(p[3 * i]! + t[i]! + sx * d, p[3 * i + 1]! + t[i]! + sy * d); }
            sp.closePath();
          }
        }
      }
      ctx.save(); ctx.setTransform(M); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      if (clip) ctx.clip(clip);
      // the cast shadow and the contact shade darken and keep the ground's texture (T110): multiplied in a cool shade colour, the shadow in three
      // nested lengths (a penumbra that softens away from the wall), the contact shade tight and dark along the foot (the wall sits into the ground)
      ctx.globalCompositeOperation = 'multiply';
      if (shade) { ctx.fillStyle = SHADE_TINT; ctx.globalAlpha = sh.castA; for (const sp of shadow) ctx.fill(sp); ctx.globalAlpha = 1; }
      // (T186: the cast shadow on the mask too)
      if (shade) this.onShadeMask(m => { m.setTransform(M); if (clip) m.clip(clip); m.globalCompositeOperation = 'multiply'; m.fillStyle = SHADE_TINT; m.globalAlpha = sh.castA; for (const sp of shadow) m.fill(sp); });
      if (!lite && sh.softA + sh.lineA > 0) { ctx.strokeStyle = SHADE_TINT; ctx.globalAlpha = sh.softA; ctx.lineWidth = Math.max(sh.softPx * px, sh.soft); ctx.stroke(foot); ctx.globalAlpha = sh.lineA; ctx.lineWidth = Math.max(sh.linePx * px, sh.line); ctx.stroke(foot); ctx.globalAlpha = 1; }
      ctx.globalCompositeOperation = 'source-over';
      // the face: each band's strip in a mid tone first (no hairlines between the steps), then each band in each light step
      for (let q = 0; q < nb; q++) { const band = look.bands[lite ? 1 : q]!; ctx.fillStyle = rgb(mixRGB(band[0], band[1], 0.25)); ctx.fill(bases[q]!); }
      const art = lite || li === GREEN_BANK ? null : this.wallArt(ctx, WALL_TEX[m]!, L, Minv, X0, Y0); // a green's bank is mown grass, not a cut face
      for (let q = 0; q < nb; q++) {
        if (art && q > 0) {
          // the art's own colours for the body, shaded by the light steps (multiplied: its texture stays), darker toward the foot
          ctx.fillStyle = art; ctx.fill(bases[q]!);
          ctx.globalCompositeOperation = 'multiply';
          for (let b = 0; b < NB; b++) { const v = Math.round(255 * (WALL_ART_SHADE[q]! + (1 - WALL_ART_SHADE[q]!) * (b / (NB - 1)))); ctx.fillStyle = `rgb(${v},${v},${Math.min(255, v + 12)})`; ctx.fill(bands[q * NB + b]!); }
          ctx.globalCompositeOperation = 'source-over';
          continue;
        }
        for (let b = 0; b < NB; b++) { const band = look.bands[lite ? 1 : q]!; ctx.fillStyle = rgb(mixRGB(band[0], band[1], b / (NB - 1))); ctx.fill(bands[q * NB + b]!); }
      }
      if (!lite && !art) {
        // the placeholder's texture until the wall art lands: the soil photo laid softly over the painted body (never a flat face)
        const soil = this.paintPhoto(ctx, 'dirt', L);
        if (typeof soil !== 'string') { ctx.globalCompositeOperation = 'soft-light'; ctx.globalAlpha = li === GREEN_BANK ? 0.25 : 0.6; ctx.fillStyle = soil; for (let q = 1; q < nb; q++) ctx.fill(bases[q]!); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
      }
      if (!lite) {
        ctx.lineWidth = Math.max(px, T.w);
        ctx.strokeStyle = `rgba(${T.col.join(',')},${T.a})`; ctx.stroke(tufts[0]!);
        ctx.strokeStyle = `rgba(${T.col.map(v => Math.round(v * 1.35)).join(',')},${(T.a * 0.8).toFixed(2)})`; ctx.stroke(tufts[1]!);
      }
      ctx.restore();
      if (clip && !lite) {
        // the top band once more, unclipped: its top is the higher layer's own edge, exact (the clip runs along that edge and would leave a
        // hairline of the ground under it)
        ctx.save(); ctx.setTransform(M); ctx.fillStyle = rgb(mixRGB(look.bands[0]![0], look.bands[0]![1], 0.25)); ctx.fill(bases[0]!);
        for (let b = 0; b < NB; b++) { const band = look.bands[0]!; ctx.fillStyle = rgb(mixRGB(band[0], band[1], b / (NB - 1))); ctx.fill(bands[b]!); }
        ctx.restore();
      }
    }
  }
  /** the bank and rock faces of raised surfaces (T127, the owner 2026-10-25: "this T box should have a angled slope to a flat top not a hard
   *  3d edge ... if we are going that strong with raised ones the sides textures would be rocky with built in steps to the top"; "make the tee
   *  higher like as high as bunkers are deep and add stairs"). Each run (ext/course-walls FaceForm Bank or Rock) slopes from its top edge to
   *  a foot out along its normal by the bank's width and down the screen by its drop (bankPoints), all chunks' runs at once. Returns the
   *  painter, called once per clip pass (the geometry is built once):
   *  - a **grass bank** (a low tee, every green) in its surface's collar grass (grassOf: a tee's first cut, a green's fringe; tile space, so it
   *    runs on from the top without a seam), lit by the slope's normal against the sun at the upper right (slopeLight, BANK_STEPS steps) as
   *    the light rule asks (T110): turned away, a cool multiply; turned to the sun, a textured shine (the grass's own colour squared, so its
   *    dark gaps stay dark); the light ramps in over the crest and out over the toe (BANK_WEIGHT) and the grass fades out over the toe
   *    (BANK_TOE), so neither edge is a line, and no dark face or contact shade;
   *  - **rock** (a tee from ROCK_FROM up): the top's grass rolling over the crest with tufts hanging down, then painted earth lit by the
   *    slope (its art slot wallRock or the earth's wallTurf once registered, else the rocky dirt laid softly over it), stones set in it
   *    (hashed from where they are: never a repeating tile), each lit from the upper right with a soft shade at its lower left, the contact
   *    shade at the foot and, past the sun's angle, a short cast shadow (the tee's Shadow);
   *  - the **stairs** of a tee (Stair: its side's stretch on the 1 m grid), cut into the face of the run that crosses that stretch: risers
   *    straight down the screen and treads out along the side's normal, stone on rock, timber in a bank, each step lit as a face or as flat
   *    ground, the treads' noses catching the light; their tops are the run's own top edge and their foot its foot, so they sit in the face.
   *  Lite (district): each face in its light steps only */
  private courseBanks(ctx: C2D, ws: readonly CourseWall[], L: number, M: DOMMatrix, Minv: DOMMatrix, X0: number, Y0: number, lite: boolean, shadeOf: (s: number) => WallShade, grassOf: (s: number) => CourseTex | null, stairs: readonly Stair[], style: (g: C2D, t: CourseTex) => string | CanvasPattern): () => void {
    const px = 1 / (TILE_PX * L), NB = BANK_STEPS, NQ = BANK_BANDS.length - 1, sx = -SUN_DIR.x, sy = -SUN_DIR.y;
    const binOf = (b: number) => Math.max(0, Math.min(NB - 1, Math.round(((b - BANK_B0) / (BANK_B1 - BANK_B0)) * (NB - 1))));
    const bOfBin = (k: number) => BANK_B0 + (BANK_B1 - BANK_B0) * (k / (NB - 1));
    type Group = { f: FaceForm; hs: number; face: Path2D; bands: Path2D[]; upper: Path2D; toe: Path2D[]; crest: Path2D; body: Path2D; foot: Path2D; shadow: Path2D[]; shade: boolean;
      stoneShade: Path2D; stones: Path2D[]; lights: Path2D[]; tufts: Path2D[]; sides: Path2D[]; treads: Path2D[]; risers: Path2D[]; noses: Path2D; cheeks: Path2D; timber: boolean; stairs: boolean };
    // T217: the faces' paths are made once for these runs (tile space, the same at every level) and kept for the next bake they reach (T204's
    // warped wall tops have ten times the points: a re-bake of a chunk under a bank built them all again)
    const bkey = this.bankKey(ws, lite, stairs), built = this.bankBuilt.get(bkey) as Map<number, Group> | undefined;
    const groups = built ?? new Map<number, Group>(), ends = built ? null : endNormals(ws);
    if (built) { this.bankBuilt.delete(bkey); this.bankBuilt.set(bkey, built); }
    if (!built) for (const w of ws) {
      const p = w.p, n = p.length / 3; if (n < 2 || !w.f) continue;
      const hs = w.hs ?? 0, f = w.f as FaceForm, key = f * 16 + hs, r = w.r ?? 0, k = faceScale({ m: w.m as WallMat, hs }), ratio = 2 * r;
      let G = groups.get(key);
      if (!G) groups.set(key, G = { f, hs, face: new Path2D(), bands: Array.from({ length: NQ * NB }, () => new Path2D()), upper: new Path2D(), toe: BANK_TOE.map(() => new Path2D()), crest: new Path2D(), body: new Path2D(), foot: new Path2D(), shadow: [new Path2D(), new Path2D(), new Path2D()], shade: false,
        stoneShade: new Path2D(), stones: Array.from({ length: 6 }, () => new Path2D()), lights: [new Path2D(), new Path2D(), new Path2D()], tufts: [new Path2D(), new Path2D(), new Path2D()], sides: Array.from({ length: 4 }, () => new Path2D()), treads: Array.from({ length: 4 }, () => new Path2D()), risers: Array.from({ length: 4 }, () => new Path2D()), noses: new Path2D(), cheeks: new Path2D(), timber: f === FaceForm.Bank, stairs: false });
      const { ox, oy, nx, ny } = bankPoints(p, r, k, ends!), lb = new Float64Array(n);
      for (let i = 0; i < n; i++) lb[i] = slopeLight(nx[i]!, ny[i]!, ratio);
      const X = (i: number, d: number) => p[3 * i]! + d * ox[i]!, Y = (i: number, d: number) => p[3 * i + 1]! + d * oy[i]!;
      const strip = (path: Path2D, d0: number, d1: number) => { path.moveTo(X(0, d0), Y(0, d0)); for (let i = 1; i < n; i++) path.lineTo(X(i, d0), Y(i, d0)); for (let i = n - 1; i >= 0; i--) path.lineTo(X(i, d1), Y(i, d1)); path.closePath(); };
      strip(G.face, 0, 1); strip(G.crest, 0, BANK_BANDS[1]!); strip(G.body, BANK_BANDS[1]!, 1); strip(G.upper, 0, BANK_TOE[0]![0]);
      BANK_TOE.forEach(([d0], q) => strip(G.toe[q]!, d0, q + 1 < BANK_TOE.length ? BANK_TOE[q + 1]![0] : 1));
      // the bands, a stretch at a time, each in the light mixed at its middle
      for (let i = 0; i + 1 < n; i++) {
        const len = Math.hypot(p[3 * i + 3]! - p[3 * i]!, p[3 * i + 4]! - p[3 * i + 1]!), m = lite ? 1 : Math.max(1, Math.ceil(len / WALL_LIGHT_SPAN));
        for (let j = 0; j < m; j++) {
          const a = j / m, b = (j + 1) / m, bin = binOf(lb[i]! + (lb[i + 1]! - lb[i]!) * (a + b) / 2);
          const P = (t: number, d: number): [number, number] => [X(i, d) + (X(i + 1, d) - X(i, d)) * t, Y(i, d) + (Y(i + 1, d) - Y(i, d)) * t];
          for (let q = 0; q < NQ; q++) {
            const d0 = BANK_BANDS[q]!, d1 = BANK_BANDS[q + 1]!, path = G.bands[q * NB + bin]!, [ax, ay] = P(a, d0), [bx, by] = P(b, d0), [cx, cy] = P(b, d1), [dx, dy] = P(a, d1);
            path.moveTo(ax, ay); path.lineTo(bx, by); path.lineTo(cx, cy); path.lineTo(dx, dy); path.closePath();
          }
        }
      }
      if (lite || f !== FaceForm.Rock) { if (!lite && hs === SURF.tee) this.bankStairs(G, w, nx, ny, stairs, k); continue; }
      // rock: the foot (contact shade) and the cast shadow of a face steeper than the sun (a run under about 1 m a metre), turned from it
      G.foot.moveTo(X(0, 1), Y(0, 1)); for (let i = 1; i < n; i++) G.foot.lineTo(X(i, 1), Y(i, 1));
      const steep = r > 0 ? Math.max(0, Math.min(1, (0.97 - ratio) / 0.97)) : 0; // (a rock band on a wall: none)
      if (steep > 0) {
        G.shade = true;
        for (let s = 0; s < 3; s++) {
          const sp = G.shadow[s]!, kk = (1 - s / 3) * steep;
          sp.moveTo(X(0, 1), Y(0, 1)); for (let i = 1; i < n; i++) sp.lineTo(X(i, 1), Y(i, 1));
          for (let i = n - 1; i >= 0; i--) { const d = p[3 * i + 2]! * kk * Math.max(0, -(nx[i]! * SUN_DIR.x + ny[i]! * SUN_DIR.y)); sp.lineTo(X(i, 1) + sx * d, Y(i, 1) + sy * d); }
          sp.closePath();
        }
      }
      // the stones and the turf's tufts: built once per run (tile space: the same at every zoom) and kept with it (rockDetail)
      const rd = this.rockDetail(w, ox, oy, lb);
      rd.stones.forEach((q, t) => G.stones[t]!.addPath(q)); rd.lights.forEach((q, t) => G.lights[t]!.addPath(q)); G.stoneShade.addPath(rd.shade); rd.tufts.forEach((q, t) => G.tufts[t]!.addPath(q));
      if (hs === SURF.tee) this.bankStairs(G, w, nx, ny, stairs, k);
    }
    if (!built) { this.bankBuilt.set(bkey, groups); trimLru(this.bankBuilt, new Set([bkey]), BANK_BUILT); }
    const shine = (G: Group, paint: (g: C2D) => void) => {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const w of ws) if ((w.f as FaceForm) === G.f && (w.hs ?? 0) === G.hs) { const { ox, oy } = footOffsets(w); for (let i = 0; i < w.p.length / 3; i++) { const x = w.p[3 * i]!, y = w.p[3 * i + 1]!; x0 = Math.min(x0, x, x + ox[i]!); x1 = Math.max(x1, x, x + ox[i]!); y0 = Math.min(y0, y, y + oy[i]!); y1 = Math.max(y1, y, y + oy[i]!); } }
      if (x1 < x0) return;
      const box = this.cacheBox(M, x0, y0, x1, y1, ctx); if (!box) return;
      const B = this.buffer('bankMask', ctx.canvas.width, ctx.canvas.height), g = ctx2d(B);
      g.save(); g.setTransform(M); paint(g); g.restore();
      this.shine(ctx, box, SHINE_TINT, 1, m => { m.setTransform(1, 0, 0, 1, 0, 0); m.drawImage(B, box[0], box[1], box[2], box[3], box[0], box[1], box[2], box[3]); });
    };
    return () => {
      for (const G of groups.values()) {
        const rock = G.f === FaceForm.Rock, weight = rock ? ROCK_WEIGHT : BANK_WEIGHT, grass = grassOf(G.hs), sh = shadeOf(G.hs);
        ctx.save(); ctx.setTransform(M); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        if (lite) {
          // the light steps only: grass or earth, mixed by the slope's light
          const pair = rock ? ROCK_EARTH : [[70, 104, 52], [150, 190, 104]] as const;
          for (let b = 0; b < NB; b++) { ctx.fillStyle = rgb(mixRGB(pair[0]!, pair[1]!, b / (NB - 1))); for (let q = 0; q < NQ; q++) ctx.fill(G.bands[q * NB + b]!); }
          ctx.restore(); continue;
        }
        // rock: the cast shadow and the contact shade first, on the ground (multiplied in the cool shade: the ground keeps its texture)
        if (rock) {
          ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = SHADE_TINT; ctx.strokeStyle = SHADE_TINT;
          if (G.shade && sh.castA > 0) { ctx.globalAlpha = Math.min(1, sh.castA * 1.6); for (const sp of G.shadow) ctx.fill(sp); }
          if (G.shade && sh.castA > 0) this.onShadeMask(m => { m.setTransform(M); m.globalCompositeOperation = 'multiply'; m.fillStyle = SHADE_TINT; m.globalAlpha = Math.min(1, sh.castA * 1.6); for (const sp of G.shadow) m.fill(sp); });
          if (sh.softA + sh.lineA > 0) { ctx.globalAlpha = sh.softA; ctx.lineWidth = Math.max(sh.softPx * px, sh.soft); ctx.stroke(G.foot); ctx.globalAlpha = sh.lineA * 0.8; ctx.lineWidth = Math.max(sh.linePx * px, sh.line); ctx.stroke(G.foot); }
          ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
        }
        // the grass: a bank's whole face (fading out over the toe), a rock face's crest
        const gs = grass ? style(ctx, grass) : 'rgb(96,136,70)';
        ctx.fillStyle = gs;
        if (rock) ctx.fill(G.crest);
        else {
          ctx.fill(G.upper);
          BANK_TOE.forEach(([, a], q) => { ctx.globalAlpha = a; ctx.fill(G.toe[q]!); }); ctx.globalAlpha = 1;
        }
        if (rock) {
          // the painted earth in its light steps, its texture, the stones, then the texture once more over all of it (never a flat face)
          for (let b = 0; b < NB; b++) {
            const lt = Math.max(0, Math.min(1, (bOfBin(b) - BANK_B0) / (BANK_B1 - BANK_B0)));
            for (let q = 1; q < NQ; q++) { ctx.fillStyle = rgb(mixRGB(ROCK_EARTH[0]!, ROCK_EARTH[1]!, lt * weight[q]! + 0.5 * (1 - weight[q]!)).map(v => v * (q === NQ - 1 ? 0.95 : 1))); ctx.fill(G.bands[q * NB + b]!); }
          }
          const art = this.wallArt(ctx, 'wallRock', L, Minv, X0, Y0) ?? this.wallArt(ctx, WALL_TEX[WallMat.Turf]!, L, Minv, X0, Y0);
          if (art) { ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = 0.75; ctx.fillStyle = art; ctx.fill(G.body); }
          ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
          ctx.save(); ctx.clip(G.body);
          ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = 0.55; ctx.fillStyle = SHADE_TINT; ctx.fill(G.stoneShade);
          ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
          G.stones.forEach((sp, t) => { ctx.fillStyle = rgb(mixRGB(ROCK_STONE[0]!, ROCK_STONE[1]!, t / 5)); ctx.fill(sp); });
          G.lights.forEach((lp, t) => { ctx.fillStyle = `rgba(250,244,226,${(0.18 + 0.22 * t).toFixed(2)})`; ctx.fill(lp); });
          if (this.tex.image('rockyDirt', L)) { ctx.globalCompositeOperation = 'soft-light'; ctx.globalAlpha = art ? 0.35 : 0.7; ctx.fillStyle = this.screenPattern(ctx, 'rockyDirt', L, X0, Y0, Minv); ctx.fill(G.body); }
          ctx.restore();
          // the turf's tufts over the crest
          ctx.lineWidth = Math.max(px, 0.02);
          ctx.strokeStyle = 'rgba(46,74,30,0.9)'; ctx.stroke(G.tufts[0]!); ctx.strokeStyle = 'rgba(84,118,50,0.8)'; ctx.stroke(G.tufts[1]!); ctx.strokeStyle = 'rgba(70,96,40,0.85)'; ctx.stroke(G.tufts[2]!);
        } else {
          // a grass bank's light: turned away, a cool multiply; turned to the sun, a textured shine (shine, after this restore)
          ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = SHADE_TINT;
          for (let b = 0; b < NB; b++) {
            const dark = 1 - bOfBin(b); if (dark <= 0.01) continue;
            for (let q = 0; q < NQ; q++) { ctx.globalAlpha = Math.min(1, dark * weight[q]! * BANK_SHADE); ctx.fill(G.bands[q * NB + b]!); }
          }
          ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
        }
        ctx.restore();
        if (!rock) shine(G, g => {
          g.fillStyle = '#fff';
          for (let b = 0; b < NB; b++) { const lit = bOfBin(b) - 1; if (lit <= 0.01) continue; for (let q = 0; q < NQ; q++) { g.globalAlpha = Math.min(1, lit * weight[q]! * BANK_SUN); g.fill(G.bands[q * NB + b]!); } }
        });
        // the stairs, cut into the face
        if (G.stairs) {
          const look = G.timber ? STEP_TIMBER : STEP_STONE, flat = (1 - BANK_B0) / (BANK_B1 - BANK_B0);
          ctx.save(); ctx.setTransform(M); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
          G.sides.forEach((rp, t) => { ctx.fillStyle = rgb(mixRGB(look.riser[0], look.riser[1], t / 3)); ctx.fill(rp); });
          G.risers.forEach((rp, t) => { ctx.fillStyle = rgb(mixRGB(look.riser[0], look.riser[1], t / 3)); ctx.fill(rp); });
          G.treads.forEach((tp, t) => { ctx.fillStyle = rgb(mixRGB(look.tread[0], look.tread[1], Math.min(1, flat + 0.12 * (t - 1.5)))); ctx.fill(tp); });
          const soil = this.paintPhoto(ctx, 'dirt', L);
          if (typeof soil !== 'string') { ctx.globalCompositeOperation = 'soft-light'; ctx.globalAlpha = 0.45; ctx.fillStyle = soil; for (const q of [...G.sides, ...G.treads, ...G.risers]) ctx.fill(q); }
          ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
          ctx.strokeStyle = G.timber ? 'rgba(236,206,160,0.6)' : 'rgba(252,248,232,0.7)'; ctx.lineWidth = Math.max(px, 0.012); ctx.stroke(G.noses);
          ctx.globalCompositeOperation = 'multiply'; ctx.strokeStyle = SHADE_TINT; ctx.globalAlpha = 0.8; ctx.lineWidth = Math.max(1.2 * px, 0.018); ctx.stroke(G.cheeks);
          ctx.restore();
        }
      }
    };
  }
  /** T217: the banks' and rock faces' paths as made (courseBanks), by its runs (bankKey), the last BANK_BUILT sets of runs */
  private bankBuilt = new Map<string, Map<number, unknown>>();
  private wallIds = new WeakMap<CourseWall, number>(); private wallIdNext = 1;
  /** a set of runs' key for bankBuilt: lite, the stairs (cut into a tee's runs) and each run by its own id (a run keeps its object while its
   *  course chunk does) */
  private bankKey(ws: readonly CourseWall[], lite: boolean, stairs: readonly Stair[]): string {
    let s = lite ? 'm' : 'g';
    for (const q of stairs) s += `|${q.x},${q.y},${q.nx},${q.ny},${q.half}`;
    s += '#';
    for (const w of ws) { let id = this.wallIds.get(w); if (id === undefined) this.wallIds.set(w, id = this.wallIdNext++); s += id + ','; }
    return s;
  }
  /** each rock run's stones and tufts (courseBanks), kept with the run (a chunk patch's runs live as long as the patch) and made again only
   *  when its feet move (a neighbouring run's end, which its ends share, came or went) */
  private rockCache = new WeakMap<CourseWall, { key: string; stones: Path2D[]; lights: Path2D[]; shade: Path2D; tufts: Path2D[] }>();
  /** a tee's cut faces into bunkers as rock bands (drawCourses), one object per wall so its rockDetail is kept too */
  private rockBands = new WeakMap<CourseWall, CourseWall | null>();
  /** a rock run's stones: one where its top edge crosses a lattice line (the segment's longer way, every STONE_GAP tiles: a place on the
   *  map, the same in every chunk), in rows down the face below the grass lip, each a painted six-sided stone (STONE_PX across, turned and
   *  sized by a hash of its place) in one of six tones by the slope's light, with a lit cap toward the upper right and a soft shade at its
   *  lower left; and the turf's tufts hanging over the crest and growing at the foot, on a finer lattice */
  private rockDetail(w: CourseWall, ox: ArrayLike<number>, oy: ArrayLike<number>, lb: ArrayLike<number>) {
    const p = w.p, n = p.length / 3, key = `${ox[0]},${oy[0]},${ox[n - 1]},${oy[n - 1]}`;
    const was = this.rockCache.get(w); if (was && was.key === key) return was;
    const out = { key, stones: Array.from({ length: 6 }, () => new Path2D()), lights: [new Path2D(), new Path2D(), new Path2D()], shade: new Path2D(), tufts: [new Path2D(), new Path2D(), new Path2D()] };
    const cs = new Float64Array(6), sn = new Float64Array(6), rr = new Float64Array(6);
    for (let i = 0; i + 1 < n; i++) {
      const x0 = p[3 * i]!, y0 = p[3 * i + 1]!, ddx = p[3 * i + 3]! - x0, ddy = p[3 * i + 4]! - y0, sl = Math.hypot(ddx, ddy); if (sl < 1e-6) continue;
      const ax = Math.abs(ddx) >= Math.abs(ddy) ? 0 : 1, a0 = ax ? y0 : x0, a1 = ax ? y0 + ddy : x0 + ddx;
      for (let q = Math.ceil(Math.min(a0, a1) / STONE_GAP), q1 = Math.floor(Math.max(a0, a1) / STONE_GAP); q <= q1; q++) {
        const t = (q * STONE_GAP - a0) / (a1 - a0); if (t < 0 || t >= 1) continue;
        const cx = x0 + t * ddx, cy = y0 + t * ddy, salt = ax * 7919 + Math.round((ax ? cx : cy) / STONE_GAP) * 104729;
        const fx = ox[i]! + t * (ox[i + 1]! - ox[i]!), fy = oy[i]! + t * (oy[i + 1]! - oy[i]!), li = lb[i]! + t * (lb[i + 1]! - lb[i]!);
        const faceLen = Math.hypot((fx - fy) * HW, (fx + fy) * HH), rows = Math.max(1, Math.round(faceLen / (2 * STONE_PX)));
        for (let j = 0; j < rows; j++) {
          const hk = q * 37 + j;
          if (hash01(hk, salt + 1) < STONE_SKIP) continue;
          const d = 0.16 + 0.8 * Math.min(1, Math.max(0, (j + 0.5 + 0.6 * (hash01(hk, salt + 2) - 0.5)) / rows)), along = (hash01(hk, salt + 3) - 0.5) * 0.5 * STONE_GAP;
          const sx0 = cx + d * fx + along * ddx / sl, sy0 = cy + d * fy + along * ddy / sl, rad = STONE_PX * (0.6 + 0.7 * hash01(hk, salt + 4)) * (0.8 + 0.2 * d), rot = hash01(hk, salt + 5) * Math.PI;
          const tone = Math.max(0, Math.min(5, Math.round(((li - BANK_B0) / (BANK_B1 - BANK_B0)) * 5 + (hash01(hk, salt + 6) - 0.5) * 1.6)));
          for (let v = 0; v < 6; v++) { const an = rot + v * (Math.PI / 3); cs[v] = Math.cos(an) * 1.25; sn[v] = Math.sin(an) * 0.8; rr[v] = rad * (0.74 + 0.26 * hash01(hk, salt + 10 + v)); }
          // a shape at scale k offset (screen px) by (u, w): its screen points turned to tiles (x - y = sx / HW, x + y = sy / HH)
          const shape = (path: Path2D, k: number, u: number, wv: number) => {
            for (let v = 0; v < 6; v++) {
              const ssx = u + cs[v]! * rr[v]! * k, ssy = wv + sn[v]! * rr[v]! * k, tx = sx0 + ssx / 128 + ssy / 64, ty = sy0 + ssy / 64 - ssx / 128;
              if (v) path.lineTo(tx, ty); else path.moveTo(tx, ty);
            }
            path.closePath();
          };
          shape(out.shade, 1.12, -0.18 * rad, 0.3 * rad);
          shape(out.stones[tone]!, 1, 0, 0);
          shape(out.lights[Math.min(2, Math.floor(tone / 2))]!, 0.55, 0.22 * rad, -0.3 * rad);
        }
      }
      // grass tufts hanging over the crest, one where the edge crosses a finer lattice line, some left out; a few at the foot growing up
      for (let q = Math.ceil(Math.min(a0, a1) / 0.035), q1 = Math.floor(Math.max(a0, a1) / 0.035); q <= q1; q++) {
        const t = (q * 0.035 - a0) / (a1 - a0); if (t < 0 || t >= 1) continue;
        const cx = x0 + t * ddx, cy = y0 + t * ddy, salt = ax * 6007 + Math.round((ax ? cx : cy) / 0.035) * 7727;
        if (hash01(q, salt) < 0.3) continue;
        const fx = ox[i]! + t * (ox[i + 1]! - ox[i]!), fy = oy[i]! + t * (oy[i + 1]! - oy[i]!), ln = BANK_BANDS[1]! * (0.7 + 1.1 * hash01(q, salt + 2) ** 2), lean = (hash01(q, salt + 3) - 0.5) * 0.04;
        const tf = out.tufts[hash01(q, salt + 5) < 0.6 ? 0 : 1]!; tf.moveTo(cx, cy); tf.lineTo(cx + ln * fx + lean, cy + ln * fy - lean);
        if (hash01(q, salt + 7) < 0.45) { const up = 0.06 + 0.08 * hash01(q, salt + 8); out.tufts[2]!.moveTo(cx + fx, cy + fy); out.tufts[2]!.lineTo(cx + (1 - up) * fx - lean, cy + (1 - up) * fy + lean); }
      }
    }
    this.rockCache.set(w, out);
    return out;
  }
  /** a tee's stairs cut into one of its bank or rock runs (courseBanks): for each stair (Stair) whose stretch of the side this run crosses
   *  (the run's points within the stretch along the side, on that side), the run's top edge there clipped exactly at the stretch's ends (on
   *  cell lines: the same cut in every chunk) and, per step, a riser straight down the screen (lit as a face turned the side's way: four
   *  light steps) and a tread out along the side's normal (lit as flat ground), so the steps end at the face's own foot; the cheeks (the
   *  stairs' zigzag ends) and the treads' noses as lines */
  private bankStairs(G: { sides: Path2D[]; treads: Path2D[]; risers: Path2D[]; noses: Path2D; cheeks: Path2D; stairs: boolean }, w: CourseWall, nx: ArrayLike<number>, ny: ArrayLike<number>, stairs: readonly Stair[], k: number) {
    const p = w.p, n = p.length / 3, r = w.r ?? 0;
    for (const s of stairs) {
      const alongX = s.ny !== 0, c = alongX ? s.x : s.y, perp = alongX ? s.y : s.x, lo = c - s.half, hi = c + s.half;
      // the run's top edge within the stretch: x, y, drop (a straight side; the first stretch of it found)
      const q: number[] = [];
      for (let i = 0; i + 1 < n; i++) {
        const x0 = p[3 * i]!, y0 = p[3 * i + 1]!, x1 = p[3 * i + 3]!, y1 = p[3 * i + 4]!;
        if (Math.abs((alongX ? y0 : x0) - perp) > 0.75 || Math.abs((alongX ? y1 : x1) - perp) > 0.75) continue;
        if ((nx[i]! + nx[i + 1]!) * s.nx + (ny[i]! + ny[i + 1]!) * s.ny < 1) continue; // the run's face turned the side's way (mean cosine > 0.5)
        const a0 = alongX ? x0 : y0, a1 = alongX ? x1 : y1; if (Math.abs(a1 - a0) < 1e-9) continue;
        let ta = (lo - a0) / (a1 - a0), tb = (hi - a0) / (a1 - a0); if (ta > tb) [ta, tb] = [tb, ta];
        ta = Math.max(0, ta); tb = Math.min(1, tb); if (tb <= ta) continue;
        const at = (t: number) => [x0 + t * (x1 - x0), y0 + t * (y1 - y0), p[3 * i + 2]! + t * (p[3 * i + 5]! - p[3 * i + 2]!)];
        const A = at(ta), B = at(tb), L = q.length;
        if (!L || Math.hypot(q[L - 3]! - A[0]!, q[L - 2]! - A[1]!) > 1e-6) { if (L) break; q.push(...A); }
        q.push(...B);
      }
      const m = q.length / 3; if (m < 2) continue;
      let dh = 0; for (let j = 0; j < m; j++) dh += q[3 * j + 2]!; dh /= m;
      const N = stairSteps(dh), riserLit = Math.min(3, Math.round(3 * faceLight(s.nx, s.ny))), tread = N * STAIR_TREAD * 0.5;
      G.stairs = true;
      // a point of the flight: d out along the side (a fraction of the flight's run: N treads, or the face's own width if that is wider) and
      // e down (a fraction of the drop)
      const run = (j: number) => Math.max(r * q[3 * j + 2]!, tread);
      const P = (j: number, d: number, e: number): [number, number] => { const h = q[3 * j + 2]!, wd = run(j), t = h * WALL_DROP * k; return [q[3 * j]! + d * s.nx * wd + e * t, q[3 * j + 1]! + d * s.ny * wd + e * t]; };
      const quad = (path: Path2D, j: number, d0: number, e0: number, d1: number, e1: number) => {
        const a = P(j, d0, e0), b = P(j + 1, d0, e0), cc = P(j + 1, d1, e1), dd = P(j, d1, e1);
        path.moveTo(a[0], a[1]); path.lineTo(b[0], b[1]); path.lineTo(cc[0], cc[1]); path.lineTo(dd[0], dd[1]); path.closePath();
      };
      for (let st = 0; st < N; st++) {
        const f0 = st / N, f1 = (st + 1) / N;
        for (let j = 0; j + 1 < m; j++) {
          quad(G.risers[riserLit]!, j, f0, f0, f0, f1);            // the riser: straight down the screen
          quad(G.treads[Math.min(3, st % 2 ? 1 : 2)]!, j, f0, f1, f1, f1); // the tread: out along the side, a little variety step to step
        }
        // its nose: the tread's front edge (where the next riser drops), catching the light
        const a = P(0, f1, f1); G.noses.moveTo(a[0], a[1]); for (let j = 1; j < m; j++) { const b = P(j, f1, f1); G.noses.lineTo(b[0], b[1]); }
      }
      // the flight's ends: each end's zigzag as a line (the cheek), and the side of the flight where it stands out from the face (the zigzag
      // down to the ground and back along the face's own slope), lit as a face turned along the side
      for (const j of [0, m - 1]) {
        const a = P(j, 0, 0); G.cheeks.moveTo(a[0], a[1]);
        for (let st = 0; st < N; st++) { const f0 = st / N, f1 = (st + 1) / N, b = P(j, f0, f1), c2 = P(j, f1, f1); G.cheeks.lineTo(b[0], b[1]); G.cheeks.lineTo(c2[0], c2[1]); }
        const tx = q[3 * (m - 1)]! - q[0]!, ty = q[3 * (m - 1) + 1]! - q[1]!, tl = Math.hypot(tx, ty) || 1, sg = j ? 1 : -1;
        const side = G.sides[Math.min(3, Math.round(3 * faceLight(sg * tx / tl, sg * ty / tl)))]!, fr = r * q[3 * j + 2]! / run(j); // the face's width as a share of the flight's
        side.moveTo(a[0], a[1]);
        for (let st = 0; st < N; st++) { const f0 = st / N, f1 = (st + 1) / N, b = P(j, f0, f1), c2 = P(j, f1, f1); side.lineTo(b[0], b[1]); side.lineTo(c2[0], c2[1]); }
        for (let e = 1; e >= 0; e -= 0.25) { const b = P(j, fr * e, e); side.lineTo(b[0], b[1]); }
        side.closePath();
      }
    }
  }
  /** a course surface's joints with its own collar (T196, paint-edges JOINT_SOFT; the owner: "this should be blurred to be a shadow not a hard
   *  line"): the shade multiplied in SHADE_RGB (T110: cool, the textures stay), its peak at the joint and falling smoothly over jointLen into
   *  the collar (clipped to it: the lower side) and over inner x that back over the surface (clipped to it), by jointRamp's strokes; each
   *  segment weighted by how far it turns from the sun (jointShadeWeight, four steps). Its outward normal is (dy, -dx), the edges' own */
  private courseJointShade(g: C2D, joints: readonly ArrayLike<number>[], L: number, M: DOMMatrix, up: Path2D, down: Path2D) {
    const NB = 4, bins = Array.from({ length: NB }, () => new Path2D()), used = new Array<boolean>(NB).fill(false);
    for (const q of joints) for (let i = 0; i + 3 < q.length; i += 2) {
      const dx = q[i + 2]! - q[i]!, dy = q[i + 3]! - q[i + 1]!, l = Math.hypot(dx, dy); if (l < 1e-6) continue;
      const facing = (dy * SUN_DIR.x - dx * SUN_DIR.y) / l, w = jointShadeWeight(facing), k = Math.min(NB - 1, Math.max(0, Math.round((w - JOINT_SOFT.lit) / (1 - JOINT_SOFT.lit) * (NB - 1))));
      bins[k]!.moveTo(q[i]!, q[i + 1]!); bins[k]!.lineTo(q[i + 2]!, q[i + 3]!); used[k] = true;
    }
    const len = jointLen(L), [r, gc, b] = SHADE_RGB;
    for (const [clip, reach] of [[down, len], [up, len * JOINT_SOFT.inner]] as const) {
      g.save(); g.setTransform(M); g.clip(clip, 'evenodd'); g.globalCompositeOperation = 'multiply'; g.lineJoin = 'round'; g.lineCap = 'round';
      for (let k = 0; k < NB; k++) {
        if (!used[k]) continue;
        const w = JOINT_SOFT.lit + ((1 - JOINT_SOFT.lit) * k) / (NB - 1);
        for (const st of jointRamp(reach, JOINT_SOFT.shade * w)) { if (st.alpha <= 0) continue; g.strokeStyle = `rgba(${r},${gc},${b},${st.alpha.toFixed(4)})`; g.lineWidth = 2 * st.half; g.stroke(bins[k]!); }
      }
      g.restore();
    }
  }
  /** the lit top edges on one layer (T099; ext/course-walls RimRun: a height step whose face turns to the sun at the upper right, the higher
   *  side on the left), as the owner's light rule asks (T110): a band of light a small gap inside the edge (RIM_GAP, ramped in), on the higher
   *  top only (clipped to it), as strong as the face turns to the sun, and textured by the ground under it (shine: on its mid-tones and
   *  highlights, never its dark gaps). So a raised green or tee catches the light along its upper right edges and a bunker's near rim along
   *  its lip, as the kerb's top catches it */
  private courseRims(ctx: C2D, rs: readonly CourseRim[], L: number, M: DOMMatrix, clip: Path2D | null, thin = 1) {
    const px = 1 / (TILE_PX * L), steps = [new Path2D(), new Path2D(), new Path2D()], RW = RIM_W * thin, RG = RIM_GAP * (0.5 + 0.5 * thin); // thin: a hairline light
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const r of rs) {
      const p = r.p;
      for (let i = 0; i + 3 < p.length; i += 2) {
        const dx = p[i + 2]! - p[i]!, dy = p[i + 3]! - p[i + 1]!, l = Math.hypot(dx, dy); if (l < 1e-6) continue;
        const sun = (dy * SUN_DIR.x - dx * SUN_DIR.y) / l, k = sun > 0.66 ? 2 : sun > 0.38 ? 1 : 0, q = steps[k]!; // the face (dy, -dx) against the sun
        q.moveTo(p[i]!, p[i + 1]!); q.lineTo(p[i + 2]!, p[i + 3]!);
        x0 = Math.min(x0, p[i]!, p[i + 2]!); x1 = Math.max(x1, p[i]!, p[i + 2]!); y0 = Math.min(y0, p[i + 1]!, p[i + 3]!); y1 = Math.max(y1, p[i + 1]!, p[i + 3]!);
      }
    }
    if (x1 < x0) return;
    const R = RG + RW + 0.05, box = this.cacheBox(M, x0 - R, y0 - R, x1 + R, y1 + R, ctx); if (!box) return;
    // the band's alpha in its own buffer: strokes about the edge (brightest just inside the gap, fading inward), the gap cut out with a soft
    // ramp, clipped to the higher top
    const B = this.buffer('rimMask', ctx.canvas.width, ctx.canvas.height), g = ctx2d(B);
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(box[0], box[1], box[2], box[3]); g.setTransform(M); if (clip) g.clip(clip);
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (let k = 0; k < 3; k++) for (const [w, a] of [[RG + RW, 0.5], [RG + 0.55 * RW, 0.5]] as const) {
      g.strokeStyle = `rgba(255,255,255,${(a * (0.4 + 0.3 * k)).toFixed(3)})`; g.lineWidth = Math.max(2 * px, 2 * w); g.stroke(steps[k]!);
    }
    g.globalCompositeOperation = 'destination-out';
    for (const [w, a] of [[RG + RIM_RAMP * thin, 0.5], [RG, 1]] as const) { g.strokeStyle = `rgba(0,0,0,${a})`; g.lineWidth = Math.max(px, 2 * w); for (const q of steps) g.stroke(q); }
    g.restore();
    this.shine(ctx, box, RIM_TINT, 0.8, m => { m.setTransform(1, 0, 0, 1, 0, 0); m.drawImage(B, box[0], box[1], box[2], box[3], box[0], box[1], box[2], box[3]); });
  }
  /** a painted area's light on its sun side (T136, paint-edges areaShadeImages; the owner's rule T110): a shine textured by the area's own
   *  colours (each px gains its own colour squared times RIM_TINT, through the mask, so its mid-tones and highlights brighten and its dark gaps
   *  stay dark), its mask the low-resolution light image (res px a tile from tile (x0, y0)) stretched, with the gap inside the edge (e tiles
   *  in: paint-edges areaLightEdge) cut at full resolution (none within AREA_SHADE.gap of it, half over the ramp after it: areaLightGap). It
   *  works in a buffer the size of the light's box (the tile box lb) and only in the rows of LIGHT_ROW cache px the lit band crosses, each over
   *  the band's span in it, so its cost follows the band, not the chunk (T136's bake cost) */
  private areaLight(g: C2D, img: EdgeImage, lb: readonly number[], path: Path2D, x0: number, y0: number, res: number, L: number, M: DOMMatrix, e: number, tint = RIM_TINT) {
    const cb = this.cacheBox(M, lb[0]!, lb[1]!, lb[2]!, lb[3]!, g); if (!cb) return;
    const [bx, by, bw, bh] = cb;
    // the rows: each lit image px (its centre on the canvas, grown by its bilinear footprint) widens the span of the rows it reaches
    const fx = (Math.abs(M.a) + Math.abs(M.c)) / res, fy = (Math.abs(M.b) + Math.abs(M.d)) / res, rows = new Map<number, [number, number]>();
    for (let v = 0; v < img.H; v++) for (let u = 0; u < img.W; u++) {
      if (!img.data[4 * (v * img.W + u) + 3]) continue;
      const tx = x0 + (u + 0.5) / res, ty = y0 + (v + 0.5) / res, X = M.a * tx + M.c * ty + M.e, Y = M.b * tx + M.d * ty + M.f;
      for (let r = Math.floor((Y - fy) / LIGHT_ROW); r <= Math.floor((Y + fy) / LIGHT_ROW); r++) { const sp = rows.get(r); if (sp) { sp[0] = Math.min(sp[0], X - fx); sp[1] = Math.max(sp[1], X + fx); } else rows.set(r, [X - fx, X + fx]); }
    }
    const strips = new Path2D(); let any = false;
    for (const [r, [a, b]] of rows) {
      const sx0 = Math.max(bx, Math.floor(a) - 1), sx1 = Math.min(bx + bw, Math.ceil(b) + 1), sy0 = Math.max(by, r * LIGHT_ROW), sy1 = Math.min(by + bh, (r + 1) * LIGHT_ROW);
      if (sx1 > sx0 && sy1 > sy0) { strips.rect(sx0, sy0, sx1 - sx0, sy1 - sy0); any = true; }
    }
    if (!any) return;
    const s = this.buffer('small', img.W, img.H); ctx2d(s).putImageData(new ImageData(img.data as Uint8ClampedArray<ArrayBuffer>, img.W, img.H), 0, 0);
    // the light, in canvas px shifted by the box's corner: the area's colours squared, times the tint, through the mask, the gap cut out
    const A = this.bufferAtLeast('areaLight', bw, bh), a = ctx2d(A), T = new DOMMatrix([1, 0, 0, 1, -bx, -by]), px = 1 / (TILE_PX * L);
    a.save(); a.setTransform(T); a.clip(strips);
    a.globalCompositeOperation = 'copy'; a.drawImage(g.canvas as CanvasImageSource, bx, by, bw, bh, bx, by, bw, bh);
    a.globalCompositeOperation = 'multiply'; a.drawImage(g.canvas as CanvasImageSource, bx, by, bw, bh, bx, by, bw, bh); a.fillStyle = tint; a.fillRect(bx, by, bw, bh);
    a.setTransform(T.multiply(M)); a.globalCompositeOperation = 'destination-in'; a.imageSmoothingEnabled = true; a.drawImage(s, x0, y0, img.W / res, img.H / res);
    a.globalCompositeOperation = 'destination-out'; a.lineJoin = 'round';
    for (const [w, al] of [[e + AREA_SHADE.gap + AREA_SHADE.ramp, 0.5], [e + AREA_SHADE.gap, 1]] as const) { a.strokeStyle = `rgba(0,0,0,${al})`; a.lineWidth = Math.max(px, 2 * w); a.stroke(path); }
    a.restore();
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.clip(strips); g.globalCompositeOperation = 'lighter'; g.drawImage(A, 0, 0, bw, bh, bx, by, bw, bh); g.restore();
  }
  /** a shine laid on ctx inside a mask, textured by the ground under it (the owner's rule T110): the light added is the ground's own colour
   *  squared (so it lands on its mid-tones and highlights and leaves its dark gaps dark) times a warm tint and k, through the mask's alpha.
   *  box: the cache px rect to work in; mask draws the shine's alpha into the buffer (destination-in), under whatever transform it sets.
   *  squared false (T227's mowing bands): the ground's own colour, not squared, times the tint: a lift in proportion to the texture (its hue
   *  and contrast kept, its gaps still darkest), for a broad light that must not turn the grass more saturated */
  private shine(ctx: C2D, box: [number, number, number, number] | null, tint: string, k: number, mask: (g: C2D) => void, squared = true) {
    if (!box) return;
    // T227: the buffer's pixels kept and its work clipped to the box (a 'copy' or 'destination-in' otherwise clears the whole chunk-sized
    // canvas, each shine): only the box is ever read back, so the light is the same, for a box's cost instead of a chunk's
    const [x, y, w, h] = box, A = this.bufferKeep('shine', ctx.canvas.width, ctx.canvas.height), a = ctx2d(A);
    a.save(); a.setTransform(1, 0, 0, 1, 0, 0); a.beginPath(); a.rect(x, y, w, h); a.clip();
    a.globalCompositeOperation = 'copy'; a.drawImage(ctx.canvas as CanvasImageSource, x, y, w, h, x, y, w, h);
    a.globalCompositeOperation = 'multiply'; if (squared) a.drawImage(A as CanvasImageSource, x, y, w, h, x, y, w, h); a.fillStyle = tint; a.fillRect(x, y, w, h);
    a.globalCompositeOperation = 'destination-in'; mask(a);
    a.restore();
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'lighter';
    for (let left = k; left > 0.01; left -= 1) { ctx.globalAlpha = Math.min(1, left); ctx.drawImage(A as CanvasImageSource, x, y, w, h, x, y, w, h); }
    ctx.restore();
  }
  /** a tile box as a whole-px rect of ctx's canvas through M (null when it misses the canvas) */
  private cacheBox(M: DOMMatrix, x0: number, y0: number, x1: number, y1: number, ctx: C2D): [number, number, number, number] | null {
    let sx0 = Infinity, sy0 = Infinity, sx1 = -Infinity, sy1 = -Infinity;
    for (const [x, y] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]] as const) { const X = M.a * x + M.c * y + M.e, Y = M.b * x + M.d * y + M.f; sx0 = Math.min(sx0, X); sx1 = Math.max(sx1, X); sy0 = Math.min(sy0, Y); sy1 = Math.max(sy1, Y); }
    const rx = Math.max(0, Math.floor(sx0) - 1), ry = Math.max(0, Math.floor(sy0) - 1), rw = Math.min(ctx.canvas.width, Math.ceil(sx1) + 1) - rx, rh = Math.min(ctx.canvas.height, Math.ceil(sy1) + 1) - ry;
    return rw > 0 && rh > 0 ? [rx, ry, rw, rh] : null;
  }
  /** a wall material's art (its slot in course-walls WALL_TEX, a grass-art PHOTO_TEX entry) as a fill laid in screen space at the walls'
   *  scale, WALL_PX_PER_M x 0.6 art px per metre of wall (one art px a cache px at the closest zoom, smaller further out, never enlarged),
   *  anchored to the world so chunks meet; null until the art is registered and built (the painted placeholder draws instead) */
  private wallArt(g: C2D, slot: string, L: number, Minv: DOMMatrix, X0: number, Y0: number): CanvasPattern | null {
    // the painted cut face (painted-surfaces.ts wallTurf, wallSand, wallBank): its near painting, one repeat covering its metres (the family's
    // coverage times the look's scale) of wall at WALL_PX_PER_M world px a metre (scale 0.533 of a 40 m painting: one picture px a cache px at
    // the closest zoom, the walls' 48 px a metre, docs/art/WALL-PROMPTS.md), shrunk further out, tinted and toned as its look has it
    const pw = this.tex.paintedOf(slot);
    if (pw) {
      const want = WALL_PX_PER_M * L * pw.near.metres, src = this.tex.paintedImage(pw.near.src, Math.ceil(want)); if (!src) return null;
      const key = `${pw.key}|${pw.tint}|${pw.tone}|${src.width}`; let img = this.wallPics.get(key);
      if (!img) {
        img = canvas(src.width, src.height); const wg = ctx2d(img); wg.drawImage(src, 0, 0);
        if (pw.tint !== '#ffffff') { wg.globalCompositeOperation = 'multiply'; wg.fillStyle = pw.tint; wg.fillRect(0, 0, img.width, img.height); }
        if (pw.tone < 0) { const v = Math.round(255 * (1 + pw.tone)); wg.globalCompositeOperation = 'multiply'; wg.fillStyle = `rgb(${v},${v},${v})`; wg.fillRect(0, 0, img.width, img.height); }
        else if (pw.tone > 0) { wg.globalCompositeOperation = 'lighter'; wg.globalAlpha = pw.tone; wg.drawImage(src, 0, 0); }
        this.wallPics.set(key, img); trimLru(this.wallPics, new Set([key]), 12);
      }
      const k = want / img.width, pat = g.createPattern(img, 'repeat'); if (!pat) return null;
      pat.setTransform(Minv.multiply(new DOMMatrix([k, 0, 0, k, -X0 * L, -Y0 * L])));
      return pat;
    }
    if (!this.tex.has(slot)) return null;
    const full = this.tex.sourceFor(slot, 99); if (!full) return null;
    const want = full.img.width * Math.min(1, L / 0.6), src = this.tex.sourceFor(slot, want / (128 * full.period)) ?? full;
    const k = (full.img.width / src.img.width) * (L / 0.6), pat = g.createPattern(src.img, 'repeat'); if (!pat) return null;
    pat.setTransform(Minv.multiply(new DOMMatrix([k, 0, 0, k, -X0 * L, -Y0 * L])));
    return pat;
  }
  /** a pond's bank (its collar band, laid in the rough's grass): wet soil darkening toward the water, stroked from the water's edges in
   *  nested widths and clipped to the band, and a few stones half sunk in it, each placed where the edge crosses a tile line (x or y a whole
   *  number of STONE_GAP tiles: a place on the map, the same in every chunk), kept or left out, sized and turned by a hash of that place */
  private courseBank(ctx: C2D, edges: readonly ArrayLike<number>[], band: Path2D, L: number, M: DOMMatrix) {
    if (!edges.length) return;
    const px = 1 / (TILE_PX * L), wet = new Path2D(), stones: number[] = [], STONE_GAP = 0.17;
    for (const e of edges) {
      if (e.length < 4) continue;
      wet.moveTo(e[0]!, e[1]!); for (let k = 2; k + 1 < e.length; k += 2) wet.lineTo(e[k]!, e[k + 1]!);
      for (let k = 0; k + 3 < e.length; k += 2) {
        const x0 = e[k]!, y0 = e[k + 1]!, x1 = e[k + 2]!, y1 = e[k + 3]!, l = Math.hypot(x1 - x0, y1 - y0); if (l < 1e-6) continue;
        const nx = (y1 - y0) / l, ny = -(x1 - x0) / l; // out of the water, into the bank
        for (const axis of [0, 1]) {
          const a0 = axis ? y0 : x0, a1 = axis ? y1 : x1; if (Math.abs(a1 - a0) < 1e-9) continue;
          for (let q = Math.ceil(Math.min(a0, a1) / STONE_GAP), q1 = Math.floor(Math.max(a0, a1) / STONE_GAP); q <= q1; q++) {
            const f = (q * STONE_GAP - a0) / (a1 - a0); if (f < 0 || f >= 1) continue;
            const salt = axis * 7919 + Math.round((axis ? x0 + f * (x1 - x0) : y0 + f * (y1 - y0)) / STONE_GAP) * 104729; // the crossing's place
            if (hash01(q, salt) > 0.16) continue;
            const d = 0.06 + 0.22 * hash01(q, salt + 3), r = 0.03 + 0.045 * hash01(q, salt + 5);
            stones.push(x0 + f * (x1 - x0) + nx * d, y0 + f * (y1 - y0) + ny * d, r, hash01(q, salt + 9));
          }
        }
      }
    }
    ctx.save(); ctx.setTransform(M); ctx.clip(band); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const [w, c] of [[0.62, 'rgba(92,70,42,0.22)'], [0.42, 'rgba(78,58,36,0.3)'], [0.24, 'rgba(62,46,30,0.38)'], [0.1, 'rgba(44,34,24,0.5)']] as const) { ctx.strokeStyle = c; ctx.lineWidth = Math.max(2 * px, w); ctx.stroke(wet); }
    // the stones: a dark body, a lit face toward the sun at the upper right
    const body = new Path2D(), lit = new Path2D();
    for (let i = 0; i < stones.length; i += 4) {
      const x = stones[i]!, y = stones[i + 1]!, r = stones[i + 2]!, a = stones[i + 3]! * Math.PI;
      body.moveTo(x + r, y); body.ellipse(x, y, r, r * 0.72, a, 0, 2 * Math.PI);
      const lx = x + SUN_DIR.x * r * 0.3, ly = y + SUN_DIR.y * r * 0.3; lit.moveTo(lx + r * 0.55, ly); lit.ellipse(lx, ly, r * 0.55, r * 0.4, a, 0, 2 * Math.PI);
    }
    ctx.fillStyle = 'rgb(86,80,70)'; ctx.fill(body); ctx.fillStyle = 'rgba(196,188,164,0.85)'; ctx.fill(lit);
    ctx.restore();
  }
  /** drawCourses step 8, last on the fairway's top (T218; the owner's rule: the stripes go on top at the end, the only pattern allowed to
   *  repeat): its mowing stripes, as light as the range outfield's and drawn by the same mowStripes (the texture screened and multiplied, no
   *  flat wash). Each hole of l.stripes (course-stripes holeStripeLegs) in its share of the chunk (runs), each leg of its line of play in its
   *  share of that (legArea: a dogleg's legs split at each bend's bisector); hole 0 in the default direction. Clipped to the layer's rings
   *  (its wobbled outline, even-odd: never across the walls drawn after it, and inside T204's spill, drawn next) and to the chunk's own box,
   *  moved by the same wobble as its rings (courseOwnBox), so two chunks never stripe the same ground twice. In world tiles: the bands of
   *  neighbouring chunks meet. look: T218's (FAIRWAY_STRIPES), or T227's course finish (its bands, or a green's fine stripes), laid textured
   *  (mowBands) when `textured` */
  private courseStripes(ctx: C2D, c: CoursePatch, l: CourseLayer, r: readonly number[], M: DOMMatrix, lite: boolean, look: StripeLook = FAIRWAY_STRIPES, textured = false) {
    const st = l.stripes; if (!st?.length || !l.fill.length) return;
    const S = c.size, x0 = c.cx * S, y0 = c.cy * S, pad = RUGGED.limit + 0.2;
    const b = [Math.max(r[0]!, x0 - pad), Math.max(r[1]!, y0 - pad), Math.min(r[2]!, x0 + S + pad), Math.min(r[3]!, y0 + S + pad)];
    if (b[2]! <= b[0]! || b[3]! <= b[1]!) return;
    const rings = new Path2D(); for (const q of l.fill) ringPath(rings, q);
    ctx.save(); ctx.setTransform(M); ctx.clip(this.courseOwnBox(c, lite)); ctx.clip(rings, 'evenodd');
    for (const e of st) {
      let eb = b;
      if (e.runs) {
        // this hole's share of the chunk (rows of cells merged into boxes): clipped to it, the bands only over its box
        const p = new Path2D(); let ex0 = Infinity, ey0 = Infinity, ex1 = -Infinity, ey1 = -Infinity;
        for (let k = 0; k + 3 < e.runs.length; k += 4) {
          const a0 = e.runs[k]!, a1 = e.runs[k + 1]!, a2 = e.runs[k + 2]!, a3 = e.runs[k + 3]!;
          p.rect(a0, a1, a2 - a0, a3 - a1); ex0 = Math.min(ex0, a0); ey0 = Math.min(ey0, a1); ex1 = Math.max(ex1, a2); ey1 = Math.max(ey1, a3);
        }
        eb = [Math.max(b[0]!, ex0), Math.max(b[1]!, ey0), Math.min(b[2]!, ex1), Math.min(b[3]!, ey1)];
        if (eb[2]! <= eb[0]! || eb[3]! <= eb[1]!) continue;
        ctx.save(); ctx.clip(p);
      }
      // a green is mown one way, along the approach: its hole's last leg alone (no chevron where an aim point lies near it)
      const all = holeStripeLegs(e.line, look, e.a), legs = l.s === SURF.green ? [{ m: all[all.length - 1]!.m, cut: null }] : all;
      if (legs.length === 1) this.layBands(ctx, legs[0]!.m, eb, M, textured);
      else for (let i = 0; i < legs.length; i++) {
        const q = legArea(legs, i, eb); if (!q.length) continue;
        const p = new Path2D(); ringPath(p, q); let qx0 = Infinity, qy0 = Infinity, qx1 = -Infinity, qy1 = -Infinity;
        for (let k = 0; k + 1 < q.length; k += 2) { qx0 = Math.min(qx0, q[k]!); qx1 = Math.max(qx1, q[k]!); qy0 = Math.min(qy0, q[k + 1]!); qy1 = Math.max(qy1, q[k + 1]!); }
        ctx.save(); ctx.clip(p); this.layBands(ctx, legs[i]!.m, [qx0, qy0, qx1, qy1], M, textured); ctx.restore();
      }
      if (e.runs) ctx.restore();
    }
    ctx.restore();
  }
  /** T218: a course chunk's own tile box as a clip path, its sides split and moved by the wobble exactly as its rings' are (warpedCourse: the
   *  same step, so two chunks' shared side is the same curve), kept per patch and tier; the plain box when the rugged edges are off */
  private ownBoxes = new WeakMap<CoursePatch, { key: string; p: Path2D }>();
  private courseOwnBox(c: CoursePatch, lite: boolean): Path2D {
    const key = `${this.rugged ? 1 : 0}${lite ? 1 : 0}`, had = this.ownBoxes.get(c); if (had?.key === key) return had.p;
    const S = c.size, x0 = c.cx * S, y0 = c.cy * S, box = [x0, y0, x0 + S, y0, x0 + S, y0 + S, x0, y0 + S];
    const p = new Path2D(); ringPath(p, this.rugged ? warpLine(box, true, lite ? RUGGED.courseStepLite : RUGGED.courseStep) : box);
    this.ownBoxes.set(c, { key, p }); return p;
  }
  /** a grow stage's cells of a course chunk as an alpha mask (1 px per cell; one ImageData kept and reused, chunk after chunk) on the 'small'
   *  buffer */
  private growStageMask(c: CoursePatch, d: GrowDraw): Cnv {
    const n = Math.round(c.size / 0.5), grow = c.grow!, a = d.alpha;
    const img = this.dirtImg?.width === n ? this.dirtImg : (this.dirtImg = new ImageData(n, n)), data = img.data;
    for (let i = 0; i < n * n; i++) data[4 * i + 3] = grow[i] === a ? 255 : 0;
    const m = this.buffer('small', n, n); ctx2d(m).putImageData(img, 0, 0);
    return m;
  }
  /** the planner map's grow-in over a course chunk's flat fills (ctx in tile space): each seeded stage's cells in its surface's soil and
   *  young grass mixed (seedColour), fading by stage as the grass comes in; the same stages the street and district chunks draw (growDraws) */
  private planSeeded(ctx: C2D, c: CoursePatch) {
    for (const d of growDraws(c)) {
      const l = c.layers.find(q => q.s === d.s); if (!l) continue;
      const clip = new Path2D(); for (const q of l.fill) ringPath(clip, q);
      const m = this.growStageMask(c, d), mg = ctx2d(m);
      mg.globalCompositeOperation = 'source-in'; mg.fillStyle = seedColour(d.look, this.planColour(DIRT_TEX)); mg.fillRect(0, 0, m.width, m.height);
      ctx.save(); ctx.clip(clip, 'evenodd'); ctx.globalAlpha = d.alpha / 255; ctx.imageSmoothingEnabled = true; ctx.drawImage(m, c.cx * c.size, c.cy * c.size, c.size, c.size); ctx.restore();
    }
  }
  /** a surface's young grass as a pattern on g at cache level L (course-fx/seed.ts seedSprouts: one SPROUT_PERIOD square, its sprouts
   *  wrapped round its edges so it tiles), laid in tile space. The square is drawn at the chunk's own px a tile (sproutRes), so a district
   *  chunk's sprouts are antialiased into the same mean colour a close chunk shows, never thinned out by a minified pattern */
  private sproutPattern(g: C2D, d: GrowDraw, L: number): CanvasPattern | null {
    const ppt = sproutRes(TILE_PX * L), key = d.s * 64 + ppt;
    let cv = this.sprouts.get(key);
    if (!cv) {
      const P = SPROUT_PERIOD, S = P * ppt; cv = canvas(S, S); const sg = ctx2d(cv);
      sg.scale(ppt, ppt); sg.lineCap = 'round';
      for (const p of seedSprouts(d.look, d.s * 7919)) {
        const dx = Math.cos(p.a) * p.len / 2, dy = Math.sin(p.a) * p.len / 2, rx = Math.abs(dx) + p.wid, ry = Math.abs(dy) + p.wid;
        sg.strokeStyle = p.col; sg.lineWidth = p.wid;
        // drawn again a period over where it crosses the square's edge
        const xs = [0, ...(p.x - rx < 0 ? [P] : []), ...(p.x + rx > P ? [-P] : [])], ys = [0, ...(p.y - ry < 0 ? [P] : []), ...(p.y + ry > P ? [-P] : [])];
        for (const ox of xs) for (const oy of ys) { sg.beginPath(); sg.moveTo(p.x + ox - dx, p.y + oy - dy); sg.lineTo(p.x + ox + dx, p.y + oy + dy); sg.stroke(); }
      }
      this.sprouts.set(key, cv);
    }
    const pat = g.createPattern(cv, 'repeat'); pat?.setTransform(new DOMMatrix().scaleSelf(1 / ppt, 1 / ppt));
    return pat;
  }
  /** step 6 of a course layer: the soil over its seeded cells while they grow in (P21 3.4), with the surface's young grass coming up in it
   *  (P23 D5.2: a seeded green, tee, fairway and rough each read as what they will be), on every zoom tier (growDraws: the same month looks
   *  the same at every zoom, D5.1). The chunk's growth mask (1 px per cell, alpha = 1 - the grass share in quarters) is split by stage;
   *  each stage's cells take the soil and sprouts through the soft-patch noise (blendMask, the same noise for every stage, so the grass comes
   *  in as patches that spread), inside the layer's rings */
  private courseDirt(ctx: C2D, c: CoursePatch, l: CourseLayer, L: number, X0: number, Y0: number, M: DOMMatrix, Minv: DOMMatrix, r: number[]) {
    const draws = growDraws(c).filter(d => d.s === l.s); if (!draws.length) return;
    const clip = new Path2D(); for (const q of l.fill) ringPath(clip, q);
    for (const d of draws) {
      const st = d.stage, m = this.growStageMask(c, d);
      const b = this.buffer('courseDirt', ctx.canvas.width, ctx.canvas.height), g = ctx2d(b);
      g.save(); g.setTransform(M); g.clip(clip, 'evenodd');
      // the grow-in soil's painted look (painted-surfaces.ts growSoil), else the dirt
      g.fillStyle = this.paintedFill(g, 'growSoil', r as BBox) ?? (isPaintPhoto(DIRT_TEX) ? this.paintPhoto(g, DIRT_TEX, L) : this.screenPattern(g, DIRT_TEX as TexName, L, X0, Y0, Minv)); g.fillRect(r[0]!, r[1]!, r[2]! - r[0]!, r[3]! - r[1]!);
      // the young grass over the soil
      const sp = this.sproutPattern(g, d, L);
      if (sp) { g.fillStyle = sp; g.fillRect(r[0]!, r[1]!, r[2]! - r[0]!, r[3]! - r[1]!); }
      g.globalCompositeOperation = 'destination-in'; g.imageSmoothingEnabled = true; g.drawImage(m, c.cx * c.size, c.cy * c.size, c.size, c.size);
      if (st > 0) { const mask = this.blendMask(1 - st / 4, 0.12), mp = g.createPattern(mask, 'repeat')!; mp.setTransform(new DOMMatrix().scaleSelf(24 / mask.width, 24 / mask.width)); g.fillStyle = mp; g.fillRect(r[0]!, r[1]!, r[2]! - r[0]!, r[3]! - r[1]!); }
      g.restore();
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(b, 0, 0); ctx.restore();
    }
  }
  /** one painted area onto ctx: its polygon filled with its texture through G (turned and scaled in tile space about the origin), an optional
   *  tone filter over the fill, an optional border band inside its edge, and a thin rim for the paved textures; soft > 0 (the feather in tiles of an area
   *  with an edge profile: the caller feathers and bevels it) leaves out the border band's dark hairline and softens the band's inner edge (bandRamp) */
  private drawPaint(ctx: C2D, p: LotPatch, L: number, X0: number, Y0: number, M: DOMMatrix, Minv: DOMMatrix, box: BBox, lite: boolean, soft: number, plain = false) {
    const st = p.paint!, path = polyPath(p.pts), G = new DOMMatrix().rotateSelf(0, 0, st.a).scaleSelf(st.s, st.s), pb = quadBox(p.pts);
    // the border band's own scale and angle (absent: the fill's, as before); without them it shares G
    const bsx = st.bs ?? st.s, Gb = st.bs === undefined && st.ba === undefined ? G : new DOMMatrix().rotateSelf(0, 0, st.ba ?? st.a).scaleSelf(bsx, bsx);
    const r = [Math.max(pb[0], box[0]) - 1, Math.max(pb[1], box[1]) - 1, Math.min(pb[2], box[2]) + 1, Math.min(pb[3], box[3]) + 1];
    if (r[2] <= r[0] || r[3] <= r[1]) return;
    const asph = p.tex === 'asphalt' || p.tex === 'asphaltDark' || p.tex === 'asphaltWorn' || p.tex === 'lotAsphalt', paved = asph || p.tex === 'paving' || p.tex === 'pad' || p.tex === 'slabs';
    /** paints texture t over the area: a fill of its rectangle (w = 0), or a stroke of its edge w tiles wide; add (T261: a lighter exposure
     *  laying the band again, added to itself): the texture alone, without the slabs' sprites and grime or the dark asphalt's multiply */
    const lay = (t: string, w: number, Gx: DOMMatrix, sx: number, add = false) => {
      const put = (style: string | CanvasPattern) => { if (w) { ctx.strokeStyle = style; ctx.lineWidth = w; ctx.stroke(path); } else { ctx.fillStyle = style; ctx.fillRect(r[0], r[1], r[2] - r[0], r[3] - r[1]); } };
      const tone = (col: string, op: GlobalCompositeOperation, alpha: number) => { ctx.globalCompositeOperation = op; ctx.globalAlpha = alpha; put(col); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; };
      if (t === 'kerb') { ctx.strokeStyle = this.tex.curb.joint; ctx.lineWidth = w; ctx.stroke(path); ctx.strokeStyle = this.tex.curb.top; ctx.lineWidth = Math.max(0.02, w - 0.08); ctx.stroke(path); return; }
      if (t === 'slabs') {
        put(this.tex.curb.top);
        if (add) return;
        if (!lite) {
          if (w) {
            // one row of slab sprites along each edge, on the inside (the sign of the area says which normal points in)
            const n = p.pts.length / 2, sg = signedArea(p.pts) > 0 ? 1 : -1;
            for (let i = 0; i < n; i++) {
              const j = (i + 1) % n, ax = p.pts[2 * i], ay = p.pts[2 * i + 1], bx = p.pts[2 * j], by = p.pts[2 * j + 1], len = Math.hypot(bx - ax, by - ay);
              if (len < 1e-6) continue;
              const ux = (bx - ax) / len, uy = (by - ay) / len, seed = Math.round(ax * 4) * 73856093 ^ Math.round(ay * 4) * 19349663 ^ Math.round(bx * 4) * 83492791;
              this.drawSlabs(ctx, { kind: 'straight', a: { x: ax, y: ay }, b: { x: bx, y: by }, n: { x: -uy * sg, y: ux * sg }, w0: -(CURB_TOP + CURB_JOINT), w1: w / 2, visible: false, seed }, box);
            }
          } else this.slabGrid(ctx, Gx, r, M);
        }
        ctx.globalCompositeOperation = 'multiply'; put(this.screenPattern(ctx, 'grime', L, X0, Y0, Minv)); ctx.globalCompositeOperation = 'source-over';
        return;
      }
      if (t === 'asphaltDark') {
        put(this.groundPattern(ctx, this.tex.mosaicFor('base', L * sx), Gx));
        if (t === 'asphaltDark' && !add) tone('rgb(10,12,24)', 'multiply', 0.28);
        return;
      }
      if (t === 'lotAsphalt') { put(this.groundPattern(ctx, this.tex.mosaicFor('lot', L * sx), Gx)); return; }
      if (isPaintPhoto(t)) {
        // the photo itself at the mip this zoom and scale ask for (sharp at every scale); a photo this worker has not built yet
        // (Textures.ensure, before the edit that uses it lands) shows its flat Paint swatch
        put(this.paintPhoto(ctx, t, L, Gx, sx, r as BBox)); return;
      }
      put(this.screenPattern(ctx, t as TexName, L, X0, Y0, Minv, Gx));
    };
    ctx.save(); ctx.setTransform(M); ctx.clip(path); ctx.lineJoin = 'round';
    lay(p.tex, 0, G, st.s);
    if (st.m && !lite) this.drawBlend(ctx, st.m, st.s, G, path, 'nonzero', r, L, X0, Y0, M, Minv);
    // the fill's exposure (T261, exposure.ts: its own pixels, its blend included, darker or lighter inside the area; no tint is drawn)
    if (st.t) exposeClip(ctx, exposureOf(st.t, st.ta), r[0], r[1], r[2], r[3]);
    // (plain, T247: the fill alone, laid on past the area's outline over its soft band: no managed grass or stripes, which follow the area's cells)
    if (!plain) this.drawManagedGrass(ctx, [p], box, L);
    // the mowing stripes last on the fill (T132: the range's outfield), at every zoom
    // T227: with the course finish, the fairways' bands (course-finish finishMow: along the range's line of play, textured)
    if (st.mw && !plain) { const fm = finishMow(st.mw, this.finish(), FAIRWAY_STRIPES); if (fm) this.mowBands(ctx, fm, r, M); else this.mowStripes(ctx, st.mw, r); }
    if (st.b > 0) {
      if (!soft) { ctx.strokeStyle = 'rgba(0,0,0,0.28)'; ctx.lineWidth = 2 * st.b + 0.08; ctx.stroke(path); }
      const ramp = soft > 0 && st.bt !== 'kerb' && st.bt !== 'slabs' ? bandRamp(st.b, soft) : [{ half: st.b, alpha: 1 }];
      for (const s of ramp) { ctx.globalAlpha = s.alpha; lay(st.bt, 2 * s.half, Gb, bsx); }
      ctx.globalAlpha = 1;
      // the border's exposure (T261), inside the clip: darker, each band step's stroke again in the grey of f multiplied; lighter, the band
      // laid again added to itself at (f - 1) times the step's alpha
      const bx = st.bto ? exposureOf(st.bto, st.bta) : 1;
      if (exposed(bx) && bx < 1) for (const s of ramp) { ctx.lineWidth = 2 * s.half; exposeDraw(ctx, bx, '', () => ctx.stroke(path), s.alpha); }
      else if (exposed(bx)) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; for (const s of ramp) { ctx.globalAlpha = Math.min(1, (bx - 1) * s.alpha); lay(st.bt, 2 * s.half, Gb, bsx, true); } ctx.restore(); }
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    }
    else if (paved) { ctx.strokeStyle = asph ? 'rgba(12,10,8,0.5)' : 'rgba(0,0,0,0.3)'; ctx.lineWidth = asph ? 0.3 : 0.16; ctx.stroke(path); }
    ctx.restore();
  }
  /** a painted area's mowing stripes (PatchPaint.mw, T132) over tile box r, under the area's clip and the chunk transform: alternate bands along
   *  (ux, uy), the light ones screened with their colour, the dark ones multiplied, each band's edges softened by f (a gradient across it) */
  private mowStripes(ctx: C2D, m: MowStripes, r: number[]) {
    const w = Math.max(0.25, m.w), corners = [[r[0]!, r[1]!], [r[2]!, r[1]!], [r[0]!, r[3]!], [r[2]!, r[3]!]] as const;
    let s0 = Infinity, s1 = -Infinity, t0 = Infinity, t1 = -Infinity;
    for (const [x, y] of corners) { const dx = x - m.ox, dy = y - m.oy, s = dx * m.ux + dy * m.uy, t = -dx * m.uy + dy * m.ux; s0 = Math.min(s0, s); s1 = Math.max(s1, s); t0 = Math.min(t0, t); t1 = Math.max(t1, t); }
    const rgba = (hex: string, a: number) => `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
    const e = Math.min(0.49, Math.max(0.001, m.f * 0.5));
    ctx.save(); ctx.transform(m.ux, m.uy, -m.uy, m.ux, m.ox, m.oy);
    for (let k = Math.floor(s0 / w); k * w < s1; k++) {
      const light = (k & 1) === 0, col = light ? m.lc : m.dc, a = (light ? m.l : m.k) + m.t * 0.5;
      if (!(a > 0)) continue;
      const g = ctx.createLinearGradient(k * w, 0, (k + 1) * w, 0);
      g.addColorStop(0, rgba(col, 0)); g.addColorStop(e, rgba(col, a)); g.addColorStop(1 - e, rgba(col, a)); g.addColorStop(1, rgba(col, 0));
      ctx.globalCompositeOperation = light ? 'screen' : 'multiply'; ctx.fillStyle = g; ctx.fillRect(k * w, t0, w, t1 - t0);
    }
    ctx.restore();
  }
  /** a stripe set laid by T218's mowStripes, or (textured: T227's course finish) by mowBands */
  private layBands(ctx: C2D, m: MowStripes, r: number[], M: DOMMatrix, textured: boolean) { if (textured) this.mowBands(ctx, m, r, M); else this.mowStripes(ctx, m, r); }
  /** T227: the course finish's mowing bands (course-finish finishStripeLook, finishMow) over tile box r, under the caller's clip and the chunk
   *  transform M: alternate bands along (ux, uy), each band's edges softened by f. They modulate the grass and keep its detail (the owner's
   *  rules): the dark ones a multiply of the dark colour at k (the texture scaled, never washed), the light ones a shine textured by the grass
   *  itself (shine, not squared: its own colour times the light colour at l, through the light bands' mask), a lift in proportion to the
   *  texture, so its tips brighten most, its gaps stay dark and its hue holds */
  private mowBands(ctx: C2D, m: MowStripes, r: number[], M: DOMMatrix) {
    const w = Math.max(0.25, m.w), corners = [[r[0]!, r[1]!], [r[2]!, r[1]!], [r[0]!, r[3]!], [r[2]!, r[3]!]] as const;
    let s0 = Infinity, s1 = -Infinity, t0 = Infinity, t1 = -Infinity;
    for (const [x, y] of corners) { const dx = x - m.ox, dy = y - m.oy, s = dx * m.ux + dy * m.uy, t = -dx * m.uy + dy * m.ux; s0 = Math.min(s0, s); s1 = Math.max(s1, s); t0 = Math.min(t0, t); t1 = Math.max(t1, t); }
    const e = Math.min(0.49, Math.max(0.001, m.f * 0.5)), k0 = Math.floor(s0 / w), k1 = Math.ceil(s1 / w);
    /** band k's fill: its colour at alpha a across it, ramped in and out over its soft edge */
    const band = (g: C2D, k: number, rgb: string, a: number) => {
      const gr = g.createLinearGradient(k * w, 0, (k + 1) * w, 0);
      gr.addColorStop(0, `rgba(${rgb},0)`); gr.addColorStop(e, `rgba(${rgb},${a.toFixed(3)})`); gr.addColorStop(1 - e, `rgba(${rgb},${a.toFixed(3)})`); gr.addColorStop(1, `rgba(${rgb},0)`);
      g.fillStyle = gr; g.fillRect(k * w, t0, w, t1 - t0);
    };
    const rgbOf = (hex: string) => `${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)}`;
    if (m.k > 0) {
      ctx.save(); ctx.transform(m.ux, m.uy, -m.uy, m.ux, m.ox, m.oy); ctx.globalCompositeOperation = 'multiply';
      const dc = rgbOf(m.dc); for (let k = k0; k < k1; k++) if (k & 1) band(ctx, k, dc, Math.min(1, m.k));
      ctx.restore();
    }
    if (!(m.l > 0)) return;
    const box = this.cacheBox(M, r[0]!, r[1]!, r[2]!, r[3]!, ctx); if (!box) return;
    const B = this.bufferKeep('bandMask', ctx.canvas.width, ctx.canvas.height), g = ctx2d(B);
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(box[0], box[1], box[2], box[3]); g.setTransform(M); g.transform(m.ux, m.uy, -m.uy, m.ux, m.ox, m.oy);
    for (let k = k0; k < k1; k++) if (!(k & 1)) band(g, k, '255,255,255', 1);
    g.restore();
    this.shine(ctx, box, m.lc, m.l, a => { a.setTransform(1, 0, 0, 1, 0, 0); a.drawImage(B, box[0], box[1], box[2], box[3], box[0], box[1], box[2], box[3]); }, false);
  }
  /** T227: a bunker layer's edges sorted for its lip (course-finish lipRuns: the far and the near rim, each in weight steps), as paths, with
   *  their tile box; made once a layer (T217's pattern: a re-bake draws the kept paths) */
  private lipCache = new WeakMap<CourseLayer, { far: (Path2D | null)[]; near: (Path2D | null)[]; box: number[] }>();
  private lipPaths(l: CourseLayer) {
    let v = this.lipCache.get(l); if (v) return v;
    const runs = lipRuns(l.edges), box = [Infinity, Infinity, -Infinity, -Infinity];
    const paths = (bins: number[][]) => bins.map(b => {
      if (!b.length) return null;
      const p = new Path2D();
      for (let i = 0; i + 3 < b.length; i += 4) { p.moveTo(b[i]!, b[i + 1]!); p.lineTo(b[i + 2]!, b[i + 3]!); box[0] = Math.min(box[0]!, b[i]!, b[i + 2]!); box[1] = Math.min(box[1]!, b[i + 1]!, b[i + 3]!); box[2] = Math.max(box[2]!, b[i]!, b[i + 2]!); box[3] = Math.max(box[3]!, b[i + 1]!, b[i + 3]!); }
      return p;
    });
    v = { far: paths(runs.far), near: paths(runs.near), box }; this.lipCache.set(l, v);
    return v;
  }
  /** T227: the lips' rims of every bunker layer here: per weight step, one path of all the layers' segments, and their tile box (null: none) */
  private lipRims(ls: readonly CourseLayer[]) {
    const far: (Path2D | null)[] = [], near: (Path2D | null)[] = [], box = [Infinity, Infinity, -Infinity, -Infinity];
    for (const l of ls) {
      const v = this.lipPaths(l);
      for (const [to, from] of [[far, v.far], [near, v.near]] as const) from.forEach((p, i) => { if (!p) return; if (!to[i]) to[i] = new Path2D(); to[i]!.addPath(p); });
      box[0] = Math.min(box[0]!, v.box[0]!); box[1] = Math.min(box[1]!, v.box[1]!); box[2] = Math.max(box[2]!, v.box[2]!); box[3] = Math.max(box[3]!, v.box[3]!);
    }
    return box[2]! < box[0]! ? null : { far, near, box };
  }
  /** T227: a light band along rims (by weight step: weight i / (n - 1)) laid as a shine textured by what is under it (the owner's light rule,
   *  T110: inset from the edge by a gap, ramped in, strongest just past it and fading out over w), clipped to `clip` (even-odd), strength k */
  private rimShine(ctx: C2D, rims: readonly (Path2D | null)[], clip: Path2D, box: number[], gap: number, w: number, k: number, L: number, M: DOMMatrix, squared = true) {
    const R = gap + w + 0.1, cb = this.cacheBox(M, box[0]! - R, box[1]! - R, box[2]! + R, box[3]! + R, ctx); if (!cb) return;
    const px = 1 / (TILE_PX * L), n = rims.length, B = this.bufferKeep('lipMask', ctx.canvas.width, ctx.canvas.height), g = ctx2d(B);
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(cb[0], cb[1], cb[2], cb[3]); g.setTransform(M); g.clip(clip, 'evenodd');
    g.lineCap = 'round'; g.lineJoin = 'round';
    rims.forEach((p, i) => { if (!p) return; const wt = i / Math.max(1, n - 1); for (const [hw, a] of [[gap + w, 0.5], [gap + 0.55 * w, 0.5]] as const) { g.strokeStyle = `rgba(255,255,255,${(a * wt).toFixed(3)})`; g.lineWidth = Math.max(2 * px, 2 * hw); g.stroke(p); } });
    g.globalCompositeOperation = 'destination-out';
    for (const [hw, a] of [[gap + 0.06, 0.5], [gap, 1]] as const) { g.strokeStyle = `rgba(0,0,0,${a})`; g.lineWidth = Math.max(px, 2 * hw); for (const p of rims) if (p) g.stroke(p); }
    g.restore();
    this.shine(ctx, cb, SHINE_TINT, k, a => { a.setTransform(1, 0, 0, 1, 0, 0); a.drawImage(B, cb[0], cb[1], cb[2], cb[3], cb[0], cb[1], cb[2], cb[3]); }, squared);
  }
  /** T227: a cool shade along rims (by weight step), falling from a at the rim to none `reach` away (paint-edges jointRamp: smooth, no hard
   *  line), multiplied so the texture under it stays (T110), clipped to `clip` (even-odd); onto the shade mask too (shadow: it is a shade); off: the
   *  rims moved that many tiles along (1, 1), straight down the screen (a far rim's shade starts at its wall's foot) */
  private rimShade(ctx: C2D, rims: readonly (Path2D | null)[], clip: Path2D, reach: number, a: number, shadow: boolean, M: DOMMatrix, off = 0) {
    const [r, gc, b] = SHADE_RGB, n = rims.length;
    const lay = (g: C2D) => {
      g.save(); g.setTransform(M); g.clip(clip, 'evenodd'); if (off) g.setTransform(M.translate(off, off)); g.globalCompositeOperation = 'multiply'; g.lineJoin = 'round'; g.lineCap = 'round';
      rims.forEach((p, i) => { if (!p) return; for (const st of jointRamp(reach, Math.min(0.95, a * i / Math.max(1, n - 1)))) { if (st.alpha <= 0) continue; g.strokeStyle = `rgba(${r},${gc},${b},${st.alpha.toFixed(4)})`; g.lineWidth = 2 * st.half; g.stroke(p); } });
      g.restore();
    };
    lay(ctx); if (shadow) this.onShadeMask(lay);
  }
  /** T227: a bunker's lip on its sand (course-finish LIP; the sun at the upper right): the dark crescent inside its far rim (the rim facing the
   *  sun, whose lip shades the sand under it: a cool multiply that keeps the sand's texture, from the rim fading in over LIP.reach) and the light
   *  near lip (the rim turned from the sun, whose slope faces it: a shine textured by the sand, a gap inside the rim). Each rim segment by its
   *  weight (smooth from side-on: no step), clipped to the sand; k the lip strength. Drawn before the walls, so the far wall's face stays on top */
  private bunkerSandLip(ctx: C2D, ls: readonly CourseLayer[], L: number, M: DOMMatrix, k: number) {
    const rims = this.lipRims(ls); if (!rims) return;
    const sand = new Path2D(); for (const l of ls) for (const q of l.fill) ringPath(sand, q);
    // the crescent starts at the far wall's foot (its face hangs WALL_DROP tiles a metre down the screen, course-walls), so it is not hidden
    this.rimShade(ctx, rims.far, sand, LIP.reach, LIP.dark * k, true, M, LIP.foot * WALL_DROP * Math.abs(SURF_HEIGHT[SURF.bunker] ?? 0));
    this.rimShine(ctx, rims.near, sand, rims.box, LIP.gap, LIP.w, LIP.light * k, L, M);
  }
  /** T227: the bunker's thin raised grass lip round the sand (its lip band, course-walls 'lip'): its outer slope lit on the far side (a shine
   *  textured by the grass, inset a gap from the sand's edge, fading out across the band) and lightly shaded on the near side (turned from the
   *  sun), clipped to the band; k the lip strength */
  private bunkerGrassLip(ctx: C2D, ls: readonly CourseLayer[], L: number, M: DOMMatrix, k: number) {
    const with_ = ls.filter(l => l.collar?.fill.length); if (!with_.length) return;
    const rims = this.lipRims(with_); if (!rims) return;
    const band = new Path2D(); let bw = 0;
    for (const l of with_) { for (const q of l.collar!.fill) ringPath(band, q); bw = Math.max(bw, l.collar!.w ?? 0.5); }
    // the grass is dark (the first cut, toned): a lift in proportion to it, not squared, so the lit lip reads without turning it more saturated
    this.rimShine(ctx, rims.far, band, rims.box, LIP.grassGap, Math.max(0.1, bw - LIP.grassGap), LIP.grass * k, L, M, false);
    this.rimShade(ctx, rims.near, band, bw, LIP.shade * k, false, M);
  }
  /** T227: the course finish the surfaces file carries (course-finish.ts; Studio > Painted > Course finish) */
  private finish(): CourseFinish { return finishOf(this.tex.surfaces); }
  /** sidewalk slab sprites in a running bond over the rectangle r (tiles), in texture space: a tile is G (u, v), so the
   *  slabs turn with the area; the seeds depend on the cell only, so neighbouring chunks agree */
  private slabGrid(g: C2D, G: DOMMatrix, r: number[], M: DOMMatrix) {
    const SW = SLAB_LEN * SLAB_CELL[1] / SLAB_CELL[0], Gi = G.inverse();
    let u0 = Infinity, v0 = Infinity, u1 = -Infinity, v1 = -Infinity;
    for (const [x, y] of [[r[0], r[1]], [r[2], r[1]], [r[0], r[3]], [r[2], r[3]]]) { const q = Gi.transformPoint(new DOMPoint(x, y)); u0 = Math.min(u0, q.x); v0 = Math.min(v0, q.y); u1 = Math.max(u1, q.x); v1 = Math.max(v1, q.y); }
    const j0 = Math.floor(v0 / SW) - 1, j1 = Math.ceil(v1 / SW) + 1, k0 = Math.floor(u0 / SLAB_LEN) - 2, k1 = Math.ceil(u1 / SLAB_LEN) + 1;
    if ((j1 - j0 + 1) * (k1 - k0 + 1) > 20000) return;
    const img = this.tex.slabs;
    g.setTransform(M.multiply(G)); g.imageSmoothingEnabled = true;
    for (let j = j0; j <= j1; j++) for (let k = k0; k <= k1; k++) {
      const rng = mulberry((k * 73856093) ^ (j * 19349663) ^ 0x5eed), [sx, sy, sw, sh] = this.tex.slabRect(this.tex.slabIndex(false, rng()));
      g.drawImage(img, sx, sy, sw, sh, k * SLAB_LEN + (j & 1 ? SLAB_LEN / 2 : 0) - 0.01, j * SW - 0.01, SLAB_LEN + 0.02, SW + 0.02);
    }
    g.setTransform(M);
  }

  /** Conditions and tiny damage over existing turf, clipped to the actual polygon and terrain; roads/props still draw later. */
  private drawManagedGrass(ctx: C2D, patches: LotPatch[], box: BBox, _L: number) {
    if ((!this.grassStrength && !this.grassHeat) || !this.grassCells.size) return;
    for (const p of patches) {
      // Fresh seed/sod keeps its original grow-in texture and timing.
      // a hand-painted tile set (T145) and a lot's lawn (T181) are laid as authored: no condition picture mixed inside them; the Grass panel's
      // health colours (a view the player turns on, not art) still show over them, now that the fairway, greens and rough wear tile sets (T153)
      if (grassOverlay(p, this.grassHeat, t => !!this.tex.paintedOf(t)?.tiled, surfaceOfTex(p.tex as PaintTex)) === 'none') continue;
      const b = quadBox(p.pts); ctx.save(); ctx.clip(polyPath(p.pts));
      for (let y = Math.max(0, Math.floor(Math.max(b[1], box[1]) / 4) * 4); y < Math.min(MAP, b[3], box[3]); y += 4) for (let x = Math.max(0, Math.floor(Math.max(b[0], box[0]) / 4) * 4); x < Math.min(MAP, b[2], box[2]); x += 4) {
        const v = this.grassCells.get(y / 4 * (MAP / 4) + x / 4); if (!v) continue;
        ctx.save(); ctx.beginPath();
        for (let j = y; j < y + 4; j++) for (let i = x; i < x + 4; i++) if (this.terrain[j * MAP + i] <= TC.PATCH) ctx.rect(i, j, 1, 1);
        ctx.clip();
        if (this.grassHeat) { ctx.globalAlpha = 0.5; ctx.fillStyle = `hsl(${Math.round(v.health * v.coverage * 120)},75%,45%)`; ctx.fillRect(x, y, 4, 4); }
        else {
          const picture = this.grassImages.get(v.material), authored = this.paintedFill(ctx, v.material);
          ctx.globalAlpha = this.grassStrength;
          if (authored) { ctx.fillStyle = authored; ctx.fillRect(x, y, 4, 4); }
          else if (picture) { ctx.fillStyle = this.groundPattern(ctx, picture, undefined, 8); ctx.fillRect(x, y, 4, 4); }
          else { // Graceful condition tint until this exact generated material is installed.
            const stress = Math.max(1 - v.health, 1 - v.coverage); ctx.globalAlpha *= stress;
            ctx.fillStyle = '#9b8150'; ctx.beginPath(); ctx.ellipse(x + 2, y + 2, 2.8, 2.8, 0, 0, Math.PI * 2); ctx.fill();
          }
          const stamp = (id: string, amount: number, size: number, tiny = false, sx = x + 2, sy = y + 2) => {
            if (amount < 0.005) return;
            const sheet = this.grassImages.get(id), variant = Math.abs(Math.imul(v.id + 7, 1103515245) >>> 8) % 4;
            ctx.save(); ctx.translate(sx, sy); ctx.rotate(v.angle * Math.PI / 180); ctx.globalAlpha = Math.min(1, amount * 2) * this.grassStrength;
            if (sheet) ctx.drawImage(sheet, (variant % 2) * sheet.width / 2, Math.floor(variant / 2) * sheet.height / 2, sheet.width / 2, sheet.height / 2, -size / 2, -size / 2, size, size);
            else { ctx.fillStyle = '#695038'; ctx.beginPath(); ctx.ellipse(0, 0, tiny ? 0.12 : size / 2, tiny ? 0.055 : size / 5, 0, 0, Math.PI * 2); ctx.fill(); }
            ctx.restore();
          };
          stamp(v.foot > 0.45 ? 'crowd-heavy' : v.moisture > 0.8 ? 'mud-footprints' : 'crowd-light', v.foot, 4);
          stamp('cart-tracks', v.carts, 4); stamp(v.repair > 0 ? 'divots-repair' : 'divots-fresh', v.divots, 0.45, true, v.divotX, v.divotY);
          if (!v.divots) stamp('maintenance', v.repair * 0.2, 1);
          // Optional temporary cut sheen uses generated art; existing preset stripe generation stays untouched.
          if (this.grassMowing && this.grassImages.has('mowing-stripes')) stamp('mowing-stripes', Math.max(0, 0.25 - v.growth), 4);
        }
        ctx.restore();
      }
      ctx.restore();
    }
  }
  /** the map decals over the grass (map-decals.ts: nature patches, bare soil, grass patches, leaf scatters, tufts, as the owner set them in the
   *  studio), seeded per region so chunks agree. Drawn over the grass before everything else, so the terrain layers, lots and roads cover
   *  them; skipped on hills, water and banks. */
  private drawDressing(ctx: C2D, box: BBox, L: number, M: DOMMatrix) {
    const ground = (x: number, y: number) => x >= 0 && y >= 0 && x < MAP && y < MAP && this.terrain[Math.floor(y) * MAP + Math.floor(x)] <= TC.PATCH;
    drawDecals(ctx, placeDecals(box, MAP_DECALS, ground), this.tex, L, M);
  }

  /** T232: the survey lines (lots/survey.ts), in the chunk's transform (tiles): each side a run of dashes from its corner, at least 2.5 px wide */
  private drawSurvey(ctx: C2D, patches: LotPatch[], minW: number) {
    ctx.save(); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.lineCap = 'butt'; ctx.lineJoin = 'miter'; ctx.setLineDash(SURVEY_DASH as number[]); ctx.lineDashOffset = 0;
    ctx.strokeStyle = SURVEY_COL; ctx.lineWidth = Math.max(SURVEY_W, 2.5 * minW); ctx.beginPath();
    for (const p of patches) for (let k = 0, l = p.lines!; k + 3 < l.length; k += 4) { ctx.moveTo(l[k]!, l[k + 1]!); ctx.lineTo(l[k + 2]!, l[k + 3]!); }
    ctx.stroke(); ctx.restore();
  }
  /** the lots' flat decals: each centred on its ground point, scaled and mirrored; the top-down ones (flatSquash) at half height, lying on the ground */
  private drawMarks(ctx: C2D, patches: LotPatch[], L: number, M: DOMMatrix, box: BBox) {
    const [tx0, ty0, tx1, ty1] = box, img = this.tex.lotDecals;
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    for (const p of patches) for (let k = 0, m = p.marks ?? []; k + 4 < m.length; k += 5) {
      const d = LOT_DECALS[m[k]], x = m[k + 1], y = m[k + 2], s = m[k + 3];
      if (!d || x < tx0 - 4 || x > tx1 + 4 || y < ty0 - 4 || y > ty1 + 4) continue;
      const S = M.transformPoint(new DOMPoint(x, y)), q = flatSquash(d.id, d.w, d.h);
      ctx.globalAlpha = m[k + 4]; ctx.setTransform(L * s, 0, 0, L * Math.abs(s) * q, S.x, S.y);
      ctx.drawImage(img, d.x, d.y, d.w, d.h, -d.w / 2, -d.h / 2, d.w, d.h);
    }
    ctx.globalAlpha = 1;
  }

  /** T220: the fallen leaves over a chunk (leaf-fall.ts): its stamps, each one picture of the level's atlas copied 1:1 onto whole pixels (one
   *  drawImage a stamp, no transform: the pictures hold their leaves' turns and shadows) */
  private drawLeafFall(g: C2D, box: BBox, L: number, M: DOMMatrix, W: number, H: number) {
    const st = this.leafStamps(box, -M.e / L, -M.f / L); if (!st.length) return;
    const A = this.leafAtlas(L), rc = A.rects, img = A.cv, a = M.a, b = M.b, c = M.c, d = M.d, e = M.e, f = M.f;
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    for (let k = 0; k < st.length; k += STAMP) {
      const x = st[k]!, y = st[k + 1]!, p = st[k + 2]! * 6, sw = rc[p + 2]!, sh = rc[p + 3]!;
      const dx = Math.round(a * x + c * y + e - rc[p + 4]!), dy = Math.round(b * x + d * y + f - rc[p + 5]!);
      if (dx > W || dy > H || dx + sw < 0 || dy + sh < 0) continue;
      g.drawImage(img, rc[p]!, rc[p + 1]!, sw, sh, dx, dy, sw, sh);
    }
  }
  /** T220: a chunk's fallen leaves as placed (leaf-fall.ts layLeaves) from the casters near it (not the forest's), its yards (the house lots'
   *  own lawns), its paved lot ground and its roads; where none lie: water and woods, the course and the painted areas. Kept per chunk while
   *  what they came from is the same. X0, Y0: the chunk's corner (world px; a chunk lays only the stamps that reach its picture) */
  private leafStamps(box: BBox, X0: number, Y0: number): Float32Array {
    const casters = this.casters.query([box[0] - 12, box[1] - 12, box[2] + 12, box[3] + 12], 'f:'), pid = (o: object) => { let v = this.patchIds.get(o); if (!v) this.patchIds.set(o, (v = ++this.patchSeq)); return v; };
    const yards: number[][] = [], hard: number[][] = [], courses: CoursePatch[] = [], off: { pts: number[]; b: BBox }[] = [], ids: number[] = [];
    for (const p of this.lotsIn([box[0] - 3, box[1] - 3, box[2] + 3, box[3] + 3])) {
      if (p.top || p.layby || p.tex === 'marks') continue;
      if (p.course) { courses.push(p.course); ids.push(pid(p)); }
      else if (p.paint || waterTex(p.tex)) { off.push({ pts: p.pts, b: quadBox(p.pts) }); ids.push(pid(p)); }
      else if (p.lawn) { if (p.lawn.z >= 1 && p.pts.length >= 8) { yards.push(p.pts); ids.push(pid(p)); } }
      else if (LEAF_HARD.has(p.tex)) { hard.push(p.pts); ids.push(pid(p)); }
    }
    const roads: LeafRoad[] = [], cx = (box[0] + box[2]) / 2, cy = (box[1] + box[3]) / 2, rr = Math.max(box[2] - box[0], box[3] - box[1]) / 2 + 4;
    for (const s of this.net.segsNear({ x: cx, y: cy }, rr)) if (s.kind !== SK.TUNNEL) roads.push({ ax: s.a.x, ay: s.a.y, bx: s.b.x, by: s.b.y, h: s.cls.h, walk: s.cls.walk, keep: LEAF_ROAD_KEEP[s.cls.family] ?? 0.6 });
    const swampy = this.swampOn(), key = `${box[0]},${box[1]},${box[2]},${box[3]}`, sig = `${leafSignature({ casters, roads }, this.leafDensity)}:${this.terrainVer}:${swampy ? 1 : 0}:${ids.join(',')}`, have = this.leafMemo.get(key);
    if (have && have.sig === sig) { this.leafMemo.delete(key); this.leafMemo.set(key, have); return have.stamps; }
    const blocked = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= MAP || y >= MAP || this.terrain[Math.floor(y) * MAP + Math.floor(x)]! > TC.PATCH) return true;
      if (swampy && this.swampField.cover(x, y) > 0.5) return true; // (T199: the streams' swamp is water too)
      for (const c of courses) if (courseCovers(c, x, y)) return true;
      for (const q of off) if (x >= q.b[0] && x <= q.b[2] && y >= q.b[1] && y <= q.b[3] && inPoly(q.pts, x, y)) return true;
      return false;
    };
    const mx = (PIC_REACH + 1.5) * HW * Math.SQRT2, my = (PIC_REACH + 1.5) * HH * Math.SQRT2;
    const within = (x: number, y: number) => { const wx = (x - y) * HW, wy = (x + y) * HH; return wx >= X0 - mx && wx <= X0 + CHUNK_W + mx && wy >= Y0 - my && wy <= Y0 + CHUNK_H + my; };
    const stamps = layLeaves(box as Box, { casters, yards, hard, roads, blocked, within, cover: (x, y) => this.net.occAt(x, y) }, this.leafDensity);
    this.leafMemo.set(key, { sig, stamps }); trimLru(this.leafMemo, new Set([key]), LEAF_MEMO);
    return stamps;
  }
  /** T220: the fallen leaves' atlas at level L (leaf-atlas.ts), drawn once per level from the leaf sprites */
  private leafAtlas(L: number): LeafAtlas {
    let a = this.leafAtlases.get(L);
    if (!a) { const tex = this.tex; a = leafAtlasAt(L, tex.leaves, (r, sizeM) => tex.leafRect(tex.pickLeaf(r, sizeM))); this.leafAtlases.set(L, a); }
    return a;
  }
  private drawLitter(ctx: C2D, net: FxView, L: number, M: DOMMatrix, box: BBox, W: number, H: number) {
    const [tx0, ty0, tx1, ty1] = box, tex = this.tex, atlas = tex.leaves, occAt = (x: number, y: number) => this.net.occAt(x, y);
    const lb = this.buffer('leaves', W, H), g = ctx2d(lb); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    const pxPerM = 45.25 * L, shadowDx = 0.8 * L, shadowDy = 1.1 * L;
    const draw = (x: number, y: number, ang: number, sizeM: number, idx: number, pass: number) => {
      const S = M.transformPoint(new DOMPoint(x, y)), size = sizeM * pxPerM, [sx, sy, sw, sh] = tex.leafRect(idx);
      g.setTransform(1, 0, 0, 1, S.x + (pass ? 0 : shadowDx), S.y + (pass ? 0 : shadowDy)); g.scale(1, 0.74); g.rotate(ang);
      g.drawImage(atlas, sx, sy, sw, sh, -size / 2, -size / 2, size, size);
    };
    const inView: { x: number; y: number; ang: number; s: number; idx: number }[] = [];
    for (const l of net.leaves) { if (l.x < tx0 - 0.5 || l.x > tx1 + 0.5 || l.y < ty0 - 0.5 || l.y > ty1 + 0.5) continue; const r = mulberry((l.x * 977 + l.y * 131 + l.ang * 100) | 0); inView.push({ x: l.x, y: l.y, ang: l.ang, s: l.s, idx: tex.pickLeaf(r, l.s) }); }
    // a sparse scatter and a few drifts on the grass, as the builder's regionDressing does
    const rx0 = Math.floor(tx0 / 8), rx1 = Math.floor(tx1 / 8), ry0 = Math.floor(ty0 / 8), ry1 = Math.floor(ty1 / 8);
    for (let ry = ry0; ry <= ry1; ry++) for (let rx = rx0; rx <= rx1; rx++) {
      const r = mulberry(((rx * 7919) ^ (ry * 104729) ^ 0x51ed) >>> 0), g2 = () => { let u = 0; while (!u) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); };
      const add = (x: number, y: number, sizeM: number) => { if (x < 0 || y < 0 || x >= MAP || y >= MAP || occAt(x, y)) return; if (this.terrain[Math.floor(y) * MAP + Math.floor(x)] > 1) return; inView.push({ x, y, ang: r() * Math.PI * 2, s: sizeM, idx: tex.pickLeaf(r, sizeM) }); };
      const sizeOf = (k: string) => { const u = r(); return (k === 'stray' ? 0.96 : 1) * (u < 0.22 ? 0.11 + r() * 0.08 : u < 0.58 ? 0.2 + r() * 0.1 : u < 0.88 ? 0.32 + r() * 0.15 : 0.49 + r() * 0.16); };
      for (let i = 0; i < 30; i++) add(rx * 8 + r() * 8, ry * 8 + r() * 8, sizeOf('stray'));
      for (let c = 0; c < 2; c++) { if (r() > 0.6) continue; const X0 = rx * 8 + r() * 8, Y0 = ry * 8 + r() * 8, n = 4 + Math.floor(r() * r() * 22), sp = (0.35 + r() * 0.6) / 2; for (let i = 0; i < n; i++) add(X0 + g2() * sp, Y0 + g2() * sp, sizeOf('gutter')); }
    }
    g.globalAlpha = 0.22; g.globalCompositeOperation = 'source-over';
    // shadows (as a darkening of the ground): drawn black through the leaf alpha
    const sh = this.buffer('leafShadow', W, H), shg = ctx2d(sh);
    for (const l of inView) { const S = M.transformPoint(new DOMPoint(l.x, l.y)), size = l.s * pxPerM, [sx, sy, sw, swh] = tex.leafRect(l.idx); shg.setTransform(1, 0, 0, 1, S.x + shadowDx, S.y + shadowDy); shg.scale(1, 0.74); shg.rotate(l.ang); shg.drawImage(atlas, sx, sy, sw, swh, -size / 2, -size / 2, size, size); }
    shg.setTransform(1, 0, 0, 1, 0, 0); shg.globalCompositeOperation = 'source-in'; shg.fillStyle = '#05050f'; shg.fillRect(0, 0, W, H);
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 0.22; ctx.drawImage(sh, 0, 0); ctx.globalAlpha = 1;
    g.globalAlpha = 1;
    for (const l of inView) draw(l.x, l.y, l.ang, l.s, l.idx, 1);
    // T220: the fallen leaves, over the litter and under the tufts and the lamp pools' light
    if (this.leafDensity > 0) this.drawLeafFall(g, box, L, M, W, H);
    // tufts over the curb's grass edge
    if (L >= 0.15) {
      g.setTransform(M); g.lineCap = 'round';
      const cols = ['#4f7a2c', '#6c9a3a', '#3a5c22', '#86ac46'];
      for (const q of net.tufts) {
        if (q.x < tx0 || q.x > tx1 || q.y < ty0 || q.y > ty1) continue;
        const r = mulberry(900 + q.v + ((q.x * 31 + q.y * 17) | 0));
        g.save(); g.translate(q.x, q.y); g.rotate(q.ang);
        for (let i = 0; i < 7; i++) { const y = (r() - 0.5) * 0.3, len = 0.07 + r() * 0.12, ang = (r() - 0.5) * 1.3; g.strokeStyle = cols[(r() * cols.length) | 0]; g.lineWidth = 0.012 + r() * 0.012; g.beginPath(); g.moveTo(-0.04, y); g.lineTo(-0.04 + len * Math.cos(ang), y + len * Math.sin(ang)); g.stroke(); }
        g.restore();
      }
    }
    // leaves lying in a lamp pool are lit like the builder's (brighter, warmer)
    const pools = net.pools.filter(p => p.x >= tx0 - 8 && p.x <= tx1 + 8 && p.y >= ty0 - 8 && p.y <= ty1 + 8);
    if (pools.length) {
      const lm = this.buffer('leafLight', W, H), lg = ctx2d(lm), rotA = Math.PI / 2 - tex.stampAngle, sc = 1.2 / (2 * PPM);
      for (const p of pools) {
        const S = M.transformPoint(new DOMPoint(p.x, p.y));
        const T = new DOMMatrix([1, 0, 0, 1, S.x, S.y]).multiply(new DOMMatrix([Math.cos(rotA), Math.sin(rotA), -Math.sin(rotA), Math.cos(rotA), 0, 0])).multiply(new DOMMatrix([1, 0, 0, 1, -S.x, -S.y])).multiply(M).multiply(new DOMMatrix([sc, 0, 0, sc, p.x, p.y])).multiply(new DOMMatrix([1, 0, 0, 1, -POOL_ANCHOR[0], -POOL_ANCHOR[1]]));
        lg.setTransform(T); lg.drawImage(tex.pool1, 0, 0);
      }
      lg.setTransform(1, 0, 0, 1, 0, 0); lg.globalCompositeOperation = 'source-in'; lg.fillStyle = 'rgba(255,190,90,1)'; lg.fillRect(0, 0, W, H);
      lg.globalCompositeOperation = 'destination-in'; lg.drawImage(lb, 0, 0);
      g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'screen'; g.globalAlpha = 0.75; g.drawImage(lm, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(lb, 0, 0); ctx.setTransform(M);
  }
}

/** points every `step` tiles along an open polyline, from `skip` tiles in to `skip` tiles before the end, with the unit direction of the run each sits on */
function walkOpen(pts: Pt[], step: number, skip: number, fn: (p: Pt, u: Pt) => void) {
  let total = 0; for (let k = 0; k + 1 < pts.length; k++) total += vlen(sub(pts[k + 1], pts[k]));
  let next = skip, acc = 0;
  for (let k = 0; k + 1 < pts.length; k++) {
    const a = pts[k], l = vlen(sub(pts[k + 1], a)); if (l < 1e-9) continue;
    const u = mul(sub(pts[k + 1], a), 1 / l);
    while (next <= acc + l && next <= total - skip + 1e-6) { fn(add(a, mul(u, next - acc)), u); next += step; }
    acc += l;
  }
}

/** a road marking: optional sideways offset, rounded corners, dashes anchored to world position (so joining roads never shifts them) */
function drawLine(ctx: C2D, l: LineRec, minW: number) {
  const pts = l.offset ? offsetPolyline(l.pts, l.offset, l.closed) : l.pts;
  const pieces = roundPieces(pts, l.r, l.closed); if (!pieces.length) return;
  ctx.strokeStyle = l.color === '#d6b23b' ? YELLOW : l.color; ctx.lineWidth = Math.max(l.width, minW); ctx.lineCap = 'butt'; ctx.lineJoin = 'round';
  if (!l.dash) {
    ctx.setLineDash([]); ctx.beginPath();
    pieces.forEach((p, i) => { if (p.run) { if (i === 0) ctx.moveTo(p.a.x, p.a.y); else ctx.lineTo(p.a.x, p.a.y); ctx.lineTo(p.b.x, p.b.y); } else ctx.arcTo(p.ctrl.x, p.ctrl.y, p.to.x, p.to.y, p.r); });
    if (l.closed) ctx.closePath(); ctx.stroke(); return;
  }
  const period = l.dash[0] + l.dash[1], mod = (v: number) => ((v % period) + period) % period;
  ctx.setLineDash(l.dash);
  let carry = 0;
  for (const p of pieces) {
    if (p.run) {
      const dx = p.b.x - p.a.x, dy = p.b.y - p.a.y, len = Math.hypot(dx, dy); if (len < 1e-6) continue;
      let cx = dx / len, cy = dy / len; const forward = cx > 1e-9 || (Math.abs(cx) <= 1e-9 && cy > 0);
      if (!forward) { cx = -cx; cy = -cy; }
      const phi = p.a.x * cx + p.a.y * cy, off = forward ? mod(phi) : mod(-phi - l.dash[1]);
      ctx.lineDashOffset = off; ctx.beginPath(); ctx.moveTo(p.a.x, p.a.y); ctx.lineTo(p.b.x, p.b.y); ctx.stroke();
      carry = mod(off + len);
    } else {
      ctx.lineDashOffset = carry; ctx.beginPath(); ctx.moveTo(p.from.x, p.from.y); ctx.arcTo(p.ctrl.x, p.ctrl.y, p.to.x, p.to.y, p.r); ctx.stroke();
      const u = { x: p.from.x - p.ctrl.x, y: p.from.y - p.ctrl.y }, v = { x: p.to.x - p.ctrl.x, y: p.to.y - p.ctrl.y };
      const ang = Math.acos(Math.max(-1, Math.min(1, (u.x * v.x + u.y * v.y) / ((Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y)) || 1))));
      carry = mod(carry + (Math.PI - ang) * p.r);
    }
  }
  ctx.setLineDash([]); ctx.lineDashOffset = 0;
}

function rrect(ctx: C2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function drawDecal(ctx: C2D, d: Decal) {
  ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.ang); ctx.scale(d.s, d.s);
  const rng = mulberry(d.seed);
  switch (d.t) {
    case 'manhole': {
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.arc(0.04, 0.05, 0.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#343a4e'; ctx.beginPath(); ctx.arc(0, 0, 0.38, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#6a7086'; ctx.lineWidth = 0.055; ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 0.04; ctx.beginPath(); ctx.arc(0, 0, 0.27, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 0.035; ctx.beginPath(); for (const y of [-0.14, 0, 0.14]) { ctx.moveTo(-0.22, y); ctx.lineTo(0.22, y); } ctx.stroke();
      ctx.strokeStyle = 'rgba(255,230,190,0.2)'; ctx.lineWidth = 0.04; ctx.beginPath(); ctx.arc(0, 0, 0.34, Math.PI * 1.05, Math.PI * 1.6); ctx.stroke();
      break;
    }
    case 'drain': {
      ctx.fillStyle = '#262a38'; ctx.fillRect(-0.45, -0.21, 0.9, 0.42);
      ctx.strokeStyle = '#555c70'; ctx.lineWidth = 0.05; ctx.strokeRect(-0.45, -0.21, 0.9, 0.42);
      ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 0.055; ctx.beginPath(); for (const y of [-0.12, -0.04, 0.04, 0.12]) { ctx.moveTo(-0.37, y); ctx.lineTo(0.37, y); } ctx.stroke();
      break;
    }
    case 'oil': {
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 0.65); g.addColorStop(0, 'rgba(6,6,12,0.5)'); g.addColorStop(0.55, 'rgba(8,8,14,0.25)'); g.addColorStop(1, 'rgba(8,8,14,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, 0.65, 0.45, rng() * 0.6, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'patch': {
      const l = 1.8 + rng() * 1.3, w = 0.9 + rng() * 0.6; ctx.rotate((rng() - 0.5) * 0.25);
      rrect(ctx, -l / 2, -w / 2, l, w, 0.25);
      ctx.fillStyle = rng() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.16)'; ctx.fill();
      ctx.strokeStyle = 'rgba(4,5,8,0.6)'; ctx.lineWidth = 0.085; ctx.stroke();
      break;
    }
  }
  ctx.restore();
}
