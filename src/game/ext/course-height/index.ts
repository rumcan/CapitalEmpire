// Subtle golf course height field (UIX revamp T026, Owner choice 2A).
// Fine 2-tile (4 m) grid on the 2048x2048 tile map (1024x1024 samples), clamped to [-3.0, +3.0] m.
// Lighting is strictly from the sun on the right of the isometric screen (+screenX => +tileX, -tileY).
// Supports raise/lower/smooth brushes, automatic road-corridor flattening, sun-right hillshade/slope, and course quality evaluation.
// Pure TypeScript, no DOM globals, deterministic. Units: world coordinates in tiles (2 m); heights in metres (m).
/** map width/height in 2 m tiles (matches MAP in src/game/iso.ts) */
export const COURSE_MAP_TILES = 2048;
/** tiles per course height sample (2 tiles = 4 m resolution) */
export const CH_STEP = 2;
/** course height samples per side (2048 / 2 = 1024) */
export const CH_SIZE = COURSE_MAP_TILES / CH_STEP;
/** minimum and maximum course height offset in metres (±3.0 m) */
export const CH_MIN_M = -3.0;
export const CH_MAX_M = 3.0;
/** area of one course height sample (4 m × 4 m), for earth volumes: m³ = Σ|Δh| (m) × COURSE_CELL_M2 */
export const COURSE_CELL_M2 = 16;
/** maximum comfortable putting green slope (metres per metre, 0.06 = 6%) before a warning is raised */
export const GREEN_MAX_SLOPE = 0.06;
/** unit light vector in tile-space (x, y, z) for the sun on the right of the isometric screen (+screenX = +tileX - tileY) */
export const SUN_RIGHT_LIGHT = (() => {
 const LX = 0.85, LY = -0.55, LZ = 1.05, L = Math.hypot(LX, LY, LZ);
 return { lx: LX / L, ly: LY / L, lz: LZ / L } as const;
})();
/** brush mode for editing the subtle course height field */
export type CourseHeightBrushMode = 'raise' | 'lower' | 'smooth' | 'flatten';
/** parameters for a single course height brush dab in world tiles */
export interface CourseHeightBrushDab {
 /** brush centre x in world tiles */
 x: number;
 /** brush centre y in world tiles */
 y: number;
 /** brush radius in world tiles (clamped to 1..32) */
 radiusTiles: number;
 /** brush mode */
 mode: CourseHeightBrushMode;
 /** height delta in metres at brush centre for 'raise'/'lower' (default 0.25 m), or blend weight (0..1) for 'smooth'/'flatten' */
 strength?: number;
}
/** axis-aligned bounding box in world tiles [x0, y0, x1, y1] */
export type CourseTileBox = [number, number, number, number];
/** road segment for automatic corridor flattening in world tiles */
export interface CourseRoadCorridor {
 ax: number;
 ay: number;
 bx: number;
 by: number;
 /** half-width of the roadbed in world tiles (corridor is flattened to 0 m inside halfWidth and blended over marginTiles) */
 halfWidthTiles: number;
 /** feather margin outside halfWidthTiles in world tiles (default 2 tiles = 4 m) */
 marginTiles?: number;
}
/** sparse save tuple for non-zero course height chunks: [chunkX, chunkY, ...qCentimetres] for 16x16 sample blocks */
export type CourseHeightSaveChunk = [number, number, ...number[]];
/** mutable course height field state (1024x1024 Float32Array in metres) */
export interface CourseHeightField {
 /** CH_SIZE * CH_SIZE height offsets in metres, clamped to [CH_MIN_M, CH_MAX_M] */
 readonly data: Float32Array;
 /** monotonically increasing revision counter bumped on every mutation */
 rev: number;
}
/** creates a zeroed 1024x1024 course height field */
export function createCourseHeightField(): CourseHeightField {
 return { data: new Float32Array(CH_SIZE * CH_SIZE), rev: 0 };
}
/** clamps a height offset in metres to [CH_MIN_M, CH_MAX_M] and eliminates -0 */
export function clampCourseHeightM(h: number): number {
 if (!Number.isFinite(h)) return 0;
 return Math.max(CH_MIN_M, Math.min(CH_MAX_M, h)) + 0;
}
/** bilinear sample of a raw CH_SIZE² course height array (metres) at world tile (x, y) */
export function sampleCourseGrid(d: Float32Array, x: number, y: number): number {
 const fx = Math.max(0, Math.min(CH_SIZE - 1, (x - CH_STEP * 0.5) / CH_STEP));
 const fy = Math.max(0, Math.min(CH_SIZE - 1, (y - CH_STEP * 0.5) / CH_STEP));
 const i = Math.min(CH_SIZE - 2, Math.floor(fx)), j = Math.min(CH_SIZE - 2, Math.floor(fy));
 const tx = fx - i, ty = fy - j, k = j * CH_SIZE + i;
 const top = d[k]! + (d[k + 1]! - d[k]!) * tx;
 const bot = d[k + CH_SIZE]! + (d[k + CH_SIZE + 1]! - d[k + CH_SIZE]!) * tx;
 return top + (bot - top) * ty;
}
/** bilinear sample of the course height offset (metres) at world tile (x, y) */
export function sampleCourseHeight(field: CourseHeightField, x: number, y: number): number { return sampleCourseGrid(field.data, x, y); }
/** computes local slope gradient { gx, gy, mag } in metres per metre at world tile (x, y) */
export function courseSlopeAt(field: CourseHeightField, x: number, y: number): { gx: number; gy: number; mag: number } {
 const stepM = CH_STEP * 2; // 2 tiles = 4 m
 const hx1 = sampleCourseHeight(field, x + CH_STEP, y);
 const hx0 = sampleCourseHeight(field, x - CH_STEP, y);
 const hy1 = sampleCourseHeight(field, x, y + CH_STEP);
 const hy0 = sampleCourseHeight(field, x, y - CH_STEP);
 const gx = (hx1 - hx0) / (2 * stepM) + 0;
 const gy = (hy1 - hy0) / (2 * stepM) + 0;
 return { gx, gy, mag: Math.hypot(gx, gy) };
}
/** computes directional hillshade (-1..+1, 0 on flat ground) at world tile (x, y) with the sun on the right of the screen */
export function courseShadeAt(field: CourseHeightField, x: number, y: number): number {
 const { gx, gy } = courseSlopeAt(field, x, y);
 if (gx === 0 && gy === 0) return 0;
 const EXAG = 2.2;
 const { lx, ly, lz } = SUN_RIGHT_LIGHT;
 const nx = -EXAG * gx, ny = -EXAG * gy, nz = 1, nl = Math.hypot(nx, ny, nz);
 return (nx * lx + ny * ly + nz * lz) / nl - lz;
}
/** writes the sun-right hillshade of the raw height samples h into out (as courseShadeAt, 0 on flat ground) for every sample whose centre lies in box grown by one sample (clamped) */
export function courseShadeInto(h: Float32Array, out: Float32Array, box: CourseTileBox): void {
 const i0 = Math.max(0, Math.ceil(box[0] / CH_STEP - 1.5)), i1 = Math.min(CH_SIZE - 1, Math.floor(box[2] / CH_STEP + 0.5));
 const j0 = Math.max(0, Math.ceil(box[1] / CH_STEP - 1.5)), j1 = Math.min(CH_SIZE - 1, Math.floor(box[3] / CH_STEP + 0.5));
 const EXAG = 2.2;
 const { lx, ly, lz } = SUN_RIGHT_LIGHT;
 for (let j = j0; j <= j1; j++) {
  const ja = Math.max(0, j - 1) * CH_SIZE, jb = Math.min(CH_SIZE - 1, j + 1) * CH_SIZE, jc = j * CH_SIZE;
  for (let i = i0; i <= i1; i++) {
   const ia = Math.max(0, i - 1), ib = Math.min(CH_SIZE - 1, i + 1);
   const gx = (h[jc + ib]! - h[jc + ia]!) / 8, gy = (h[jb + i]! - h[ja + i]!) / 8; // neighbours 2 samples (8 m) apart
   const k = jc + i;
   if (gx === 0 && gy === 0) { out[k] = 0; continue; }
   const nx = -EXAG * gx, ny = -EXAG * gy, nz = 1, nl = Math.hypot(nx, ny, nz);
   out[k] = (nx * lx + ny * ly + nz * lz) / nl - lz;
  }
 }
}
/** a brush dab's radius (clamped to 1..32 tiles) and its inclusive sample range i0..i1, j0..j1 (clamped to the field) */
function brushRange(dab: CourseHeightBrushDab) {
 const rTiles = Math.max(1, Math.min(32, Number.isFinite(dab.radiusTiles) ? dab.radiusTiles : 6));
 const i0 = Math.max(0, Math.floor((dab.x - rTiles) / CH_STEP));
 const i1 = Math.min(CH_SIZE - 1, Math.ceil((dab.x + rTiles) / CH_STEP));
 const j0 = Math.max(0, Math.floor((dab.y - rTiles) / CH_STEP));
 const j1 = Math.min(CH_SIZE - 1, Math.ceil((dab.y + rTiles) / CH_STEP));
 return { rTiles, i0, i1, j0, j1 };
}
/** one pass of a brush dab: writes the new heights (write), or only measures them (no write: the field and its rev are untouched, box is null).
 *  m3 is the earth moved, Σ|next − old| × COURSE_CELL_M2 over the samples */
function brushPass(field: CourseHeightField, dab: CourseHeightBrushDab, write: boolean): { box: CourseTileBox | null; m3: number } {
 const { rTiles, i0, i1, j0, j1 } = brushRange(dab);
 if (i0 > i1 || j0 > j1) return { box: null, m3: 0 };
 const d = field.data;
 const strength = Number.isFinite(dab.strength) ? dab.strength! : (dab.mode === 'smooth' || dab.mode === 'flatten' ? 0.5 : 0.25);
 let snapshot: Float32Array | null = null;
 if (dab.mode === 'smooth') {
  const w = i1 - i0 + 3, h = j1 - j0 + 3;
  snapshot = new Float32Array(w * h);
  for (let jj = 0; jj < h; jj++) {
   const sj = Math.max(0, Math.min(CH_SIZE - 1, j0 - 1 + jj));
   for (let ii = 0; ii < w; ii++) {
    const si = Math.max(0, Math.min(CH_SIZE - 1, i0 - 1 + ii));
    snapshot[jj * w + ii] = d[sj * CH_SIZE + si]!;
   }
  }
 }
 let changed = false, moved = 0;
 const wSnap = i1 - i0 + 3;
 for (let j = j0; j <= j1; j++) {
  const wy = (j + 0.5) * CH_STEP;
  for (let i = i0; i <= i1; i++) {
   const wx = (i + 0.5) * CH_STEP;
   const dist = Math.hypot(wx - dab.x, wy - dab.y);
   if (dist >= rTiles) continue;
   const t = 1 - dist / rTiles;
   const falloff = t * t * (3 - 2 * t);
   const idx = j * CH_SIZE + i, old = d[idx]!;
   let next = old;
   if (dab.mode === 'raise') {
    next = clampCourseHeightM(old + Math.abs(strength) * falloff);
   } else if (dab.mode === 'lower') {
    next = clampCourseHeightM(old - Math.abs(strength) * falloff);
   } else if (dab.mode === 'flatten') {
    const w = Math.max(0, Math.min(1, strength)) * falloff;
    next = clampCourseHeightM(old * (1 - w));
   } else if (dab.mode === 'smooth' && snapshot) {
    const si = i - i0 + 1, sj = j - j0 + 1;
    let sum = 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) sum += snapshot[(sj + dj) * wSnap + (si + di)]!;
    const avg = sum / 9;
    const w = Math.max(0, Math.min(1, strength)) * falloff;
    next = clampCourseHeightM(old + (avg - old) * w);
   }
   moved += Math.abs(next - old);
   if (write && Math.abs(next - old) > 1e-6) {
    d[idx] = next;
    changed = true;
   }
  }
 }
 const m3 = moved * COURSE_CELL_M2;
 if (!write || !changed) return { box: null, m3 };
 field.rev++;
 return { box: [i0 * CH_STEP, j0 * CH_STEP, (i1 + 1) * CH_STEP, (j1 + 1) * CH_STEP], m3 };
}
/** applies a raise, lower, smooth, or flatten brush dab and returns the dirtied world-tile bounding box (or null if unchanged) */
export function applyCourseHeightBrush(field: CourseHeightField, dab: CourseHeightBrushDab): CourseTileBox | null { return brushPass(field, dab, true).box; }
/** the earth (m³) a brush dab would move on this field, without changing it (the golf earthwork price) */
export function estimateCourseBrushM3(field: CourseHeightField, dab: CourseHeightBrushDab): number { return brushPass(field, dab, false).m3; }
/** the tile box a brush dab may touch (its sample range: applyCourseHeightBrush writes nothing outside it) */
export function brushBox(dab: CourseHeightBrushDab): CourseTileBox {
 const { i0, i1, j0, j1 } = brushRange(dab);
 return [i0 * CH_STEP, j0 * CH_STEP, (i1 + 1) * CH_STEP, (j1 + 1) * CH_STEP];
}
/** the union of two tile boxes (null is empty): the box covering both */
export function unionBox(a: CourseTileBox | null, b: CourseTileBox | null): CourseTileBox | null {
 if (!a) return b;
 if (!b) return a;
 return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
}
/** the corridor's half-width, feather margin, outer reach and inclusive sample range (shared by flattenCourseCorridor and corridorBox) */
function corridorRange(road: CourseRoadCorridor) {
 const hw = Math.max(0.5, road.halfWidthTiles), margin = Math.max(0, road.marginTiles ?? 2), outer = hw + margin;
 const minX = Math.min(road.ax, road.bx) - outer, maxX = Math.max(road.ax, road.bx) + outer;
 const minY = Math.min(road.ay, road.by) - outer, maxY = Math.max(road.ay, road.by) + outer;
 const i0 = Math.max(0, Math.floor(minX / CH_STEP)), i1 = Math.min(CH_SIZE - 1, Math.ceil(maxX / CH_STEP));
 const j0 = Math.max(0, Math.floor(minY / CH_STEP)), j1 = Math.min(CH_SIZE - 1, Math.ceil(maxY / CH_STEP));
 return { hw, margin, outer, i0, i1, j0, j1 };
}
/** the tile box flattenCourseCorridor may touch for a road segment */
export function corridorBox(road: CourseRoadCorridor): CourseTileBox {
 const { i0, i1, j0, j1 } = corridorRange(road);
 return [i0 * CH_STEP, j0 * CH_STEP, (i1 + 1) * CH_STEP, (j1 + 1) * CH_STEP];
}
/** flattens course height to 0 m along a road corridor (and feathers over marginTiles) so roads stay flat and drivable */
export function flattenCourseCorridor(field: CourseHeightField, road: CourseRoadCorridor): CourseTileBox | null {
 const { hw, margin, outer, i0, i1, j0, j1 } = corridorRange(road);
 if (i0 > i1 || j0 > j1) return null;
 const dx = road.bx - road.ax, dy = road.by - road.ay, len2 = dx * dx + dy * dy;
 const d = field.data;
 let changed = false;
 for (let j = j0; j <= j1; j++) {
  const wy = (j + 0.5) * CH_STEP;
  for (let i = i0; i <= i1; i++) {
   const wx = (i + 0.5) * CH_STEP;
   const t = len2 > 0 ? Math.max(0, Math.min(1, ((wx - road.ax) * dx + (wy - road.ay) * dy) / len2)) : 0;
   const dist = Math.hypot(wx - (road.ax + dx * t), wy - (road.ay + dy * t));
   if (dist >= outer) continue;
   const idx = j * CH_SIZE + i, old = d[idx]!;
   if (old === 0) continue;
   let keep = 0;
   if (dist > hw && margin > 0) {
    const u = (dist - hw) / margin;
    keep = u * u * (3 - 2 * u);
   }
   const next = Math.abs(old * keep) < 1e-4 ? 0 : clampCourseHeightM(old * keep);
   if (Math.abs(next - old) > 1e-6) {
    d[idx] = next;
    changed = true;
   }
  }
 }
 if (!changed) return null;
 field.rev++;
 return [i0 * CH_STEP, j0 * CH_STEP, (i1 + 1) * CH_STEP, (j1 + 1) * CH_STEP];
}
/** evaluates course height variety bonus (0..+5 points) and steep-green warnings for CourseStatsPanel (Owner choice 2A) */
export function evaluateCourseHeightQuality(
 field: CourseHeightField,
 areas: readonly { hole?: number; surface: string; pts: readonly number[] }[],
): { bonusPoints: number; steepGreenHoles: number[]; hints: string[] } {
 let activeAreas = 0;
 const steepGreenSet = new Set<number>();
 for (const a of areas) {
  if (a.surface !== 'fairway' && a.surface !== 'green' && a.surface !== 'tee') continue;
  const n = a.pts.length >> 1;
  if (n < 3) continue;
  let cx = 0, cy = 0, minH = Infinity, maxH = -Infinity, maxSlope = 0;
  for (let k = 0; k < n; k++) {
   const px = a.pts[2 * k]!, py = a.pts[2 * k + 1]!;
   cx += px; cy += py;
   const h = sampleCourseHeight(field, px, py);
   if (h < minH) minH = h;
   if (h > maxH) maxH = h;
   if (a.surface === 'green') maxSlope = Math.max(maxSlope, courseSlopeAt(field, px, py).mag);
  }
  cx /= n; cy /= n;
  const ch = sampleCourseHeight(field, cx, cy);
  minH = Math.min(minH, ch); maxH = Math.max(maxH, ch);
  if (a.surface === 'green') maxSlope = Math.max(maxSlope, courseSlopeAt(field, cx, cy).mag);
  if (maxH - minH >= 0.25 || Math.abs(ch) >= 0.25) activeAreas++;
  if (a.surface === 'green' && maxSlope > GREEN_MAX_SLOPE && a.hole) steepGreenSet.add(a.hole);
 }
 const steepGreenHoles = Array.from(steepGreenSet).sort((a, b) => a - b);
 const bonusPoints = Math.min(5, Math.floor((activeAreas + 1) / 2));
 const hints: string[] = [];
 if (steepGreenHoles.length > 0) {
  hints.push(`Smooth steep putting green slopes (>6%) on hole${steepGreenHoles.length === 1 ? '' : 's'} ${steepGreenHoles.join(', ')}`);
 } else if (bonusPoints === 0 && areas.some(a => a.surface === 'fairway' || a.surface === 'green')) {
  hints.push('Add gentle fairway contours or raised tees (+5 quality bonus)');
 }
 return { bonusPoints, steepGreenHoles, hints };
}
const SAVE_BLOCK = 16;
/** serialises non-zero 16x16 sample blocks into compact centimetre tuples for save files */
export function saveCourseHeight(field: CourseHeightField): CourseHeightSaveChunk[] {
 const out: CourseHeightSaveChunk[] = [], d = field.data, blocks = CH_SIZE / SAVE_BLOCK;
 for (let bj = 0; bj < blocks; bj++) {
  for (let bi = 0; bi < blocks; bi++) {
   let any = false;
   const vals: number[] = [];
   for (let dj = 0; dj < SAVE_BLOCK; dj++) {
    const row = (bj * SAVE_BLOCK + dj) * CH_SIZE + bi * SAVE_BLOCK;
    for (let di = 0; di < SAVE_BLOCK; di++) {
     const cm = Math.round(d[row + di]! * 100) + 0;
     if (cm !== 0) any = true;
     vals.push(cm);
    }
   }
   if (any) out.push([bi, bj, ...vals]);
  }
 }
 return out;
}
/** restores a CourseHeightField from compact save chunks */
export function loadCourseHeight(chunks: readonly CourseHeightSaveChunk[] | undefined): CourseHeightField {
 const field = createCourseHeightField();
 if (!chunks) return field;
 const d = field.data, blocks = CH_SIZE / SAVE_BLOCK, count = SAVE_BLOCK * SAVE_BLOCK;
 for (const ch of chunks) {
  const bi = ch[0], bj = ch[1];
  if (!Number.isInteger(bi) || !Number.isInteger(bj) || bi < 0 || bj < 0 || bi >= blocks || bj >= blocks) continue;
  for (let k = 0; k < count && k + 2 < ch.length; k++) {
   const dj = (k / SAVE_BLOCK) | 0, di = k % SAVE_BLOCK;
   d[(bj * SAVE_BLOCK + dj) * CH_SIZE + bi * SAVE_BLOCK + di] = clampCourseHeightM((ch[k + 2] ?? 0) / 100);
  }
 }
 field.rev = 1;
 return field;
}

// The undo journal (T027): the height blocks an action changes, for undo and redo.
export * from './journal';
