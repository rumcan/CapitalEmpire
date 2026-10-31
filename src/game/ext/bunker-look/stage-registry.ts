import type { BBox } from '../../network';
import type { CoursePatch } from '../../ground-protocol';
import { activeBunkerStages, nativeBunkerCourse, type NativeBunkerCourse } from './stage-ownership';
import { bunkerStageRect, type BunkerStage } from './stage-atlas';
import { BUNKER_STAGE_CACHE_BYTES } from './stage-bridge';
import type { BunkerStageReady, BunkerStageRef } from './stage-types';

type Context = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
const CELL = 64;
const intersects = (a: readonly number[], b: readonly number[]) => a[0]! <= b[2]! && a[2]! >= b[0]! && a[1]! <= b[3]! && a[3]! >= b[1]!;
function area(points: ArrayLike<number>): number { let sum = 0; for (let i = 0, j = points.length - 2; i < points.length; j = i, i += 2) sum += points[j]! * points[i + 1]! - points[i]! * points[j + 1]!; return sum; }
function ring(path: Path2D, points: ArrayLike<number>, positive?: boolean): void {
  const n = points.length / 2, forward = positive === undefined || (area(points) > 0) === positive;
  for (let i = 0; i < n; i++) { const j = 2 * (forward ? i : n - i - 1); if (i) path.lineTo(points[j]!, points[j + 1]!); else path.moveTo(points[j]!, points[j + 1]!); } path.closePath();
}

/** A ground worker's owned atlases and immutable ownership snapshots; topology work runs once per edit, never per animation frame. */
export class BunkerStageRegistry {
  private readonly expected = new Map<string, BunkerStageRef>();
  private readonly ready = new Map<string, BunkerStageReady>();
  /** The previous picture of a component that is re-baking after an edit: shown (clipped to the new outline) until the new one lands,
   *  so an edited bunker never drops back to the native drawing for the bake's second. Closed when the new picture installs or fails. */
  private readonly held = new Map<string, BunkerStageReady>();
  private readonly courses = new Map<string, CoursePatch>();
  private readonly grid = new Map<string, Set<string>>();
  private readonly native = new WeakMap<CoursePatch, { version: number; value: NativeBunkerCourse }>();
  private readonly paths = new WeakMap<BunkerStageRef, Path2D>();
  private version = 0;
  private activeVersion = -1;
  private active = new Set<string>();
  private bytes = 0;
  constructor(private readonly drawnCourse: (course: CoursePatch) => CoursePatch = c => c) {}

  setCourses(set: [string, CoursePatch][], drop: string[]): void {
    let changed = false;
    for (const key of drop) if (this.courses.delete(key)) changed = true;
    for (const [key, course] of set) { if (this.courses.get(key) !== course) changed = true; this.courses.set(key, course); }
    if (changed) this.version++;
  }
  expect(set: BunkerStageRef[], drop: string[]): void {
    for (const id of drop) { this.expected.delete(id); this.close(id); }
    for (const ref of set) {
      const old = this.ready.get(ref.id);
      if (old && old.key !== ref.key) { this.closeHeld(ref.id); this.held.set(ref.id, old); this.ready.delete(ref.id); }
      else if (old) this.ready.set(ref.id, { ...old, ...ref });
      this.expected.set(ref.id, ref);
    }
    this.grid.clear();
    for (const ref of [...this.expected.values(), ...this.held.values()]) for (let y = Math.floor(ref.dirtyBoundsTiles[1] / CELL); y <= Math.floor(ref.dirtyBoundsTiles[3] / CELL); y++) for (let x = Math.floor(ref.dirtyBoundsTiles[0] / CELL); x <= Math.floor(ref.dirtyBoundsTiles[2] / CELL); x++) {
      const key = `${x},${y}`; let bucket = this.grid.get(key); if (!bucket) this.grid.set(key, bucket = new Set()); bucket.add(ref.id);
    }
    this.version++;
  }
  install(set: BunkerStageReady[], drop: { id: string; key: string }[]): void {
    for (const item of drop) {
      if (this.ready.get(item.id)?.key === item.key) this.close(item.id);
      // the bake for the current shape failed or was evicted: the held old picture no longer stands in for it
      else if (this.expected.get(item.id)?.key === item.key) this.closeHeld(item.id);
    }
    for (const sprite of set) {
      const b = sprite.boundsWorldPx;
      const valid = this.expected.get(sprite.id)?.key === sprite.key && Number.isSafeInteger(sprite.width) && Number.isSafeInteger(sprite.renderHeight) && sprite.width === sprite.renderWidth && sprite.height === sprite.renderHeight * 3 && sprite.image.width === sprite.width && sprite.image.height === sprite.height && sprite.width > 0 && sprite.renderHeight > 0 && sprite.width <= 512 && sprite.renderHeight <= 512 && b.length === 4 && b.every(Number.isFinite) && b[0] < b[2] && b[1] < b[3] && Number.isFinite(sprite.rasterScale) && sprite.rasterScale > 0;
      if (!valid) { sprite.image.close(); continue; }
      this.close(sprite.id);
      const bytes = sprite.width * sprite.height * 4;
      if (this.bytes + bytes > BUNKER_STAGE_CACHE_BYTES) { sprite.image.close(); continue; }
      this.ready.set(sprite.id, sprite); this.bytes += bytes;
    }
    this.version++;
  }
  private close(id: string): void { const sprite = this.ready.get(id); if (sprite) { sprite.image.close(); this.bytes -= sprite.width * sprite.height * 4; this.ready.delete(id); } this.closeHeld(id); }
  private closeHeld(id: string): void { const sprite = this.held.get(id); if (sprite) { sprite.image.close(); this.bytes -= sprite.width * sprite.height * 4; this.held.delete(id); } }
  /** What each expected component shows: its current picture, else its held previous one (with that picture's own rings and key). */
  private shown(id: string): BunkerStageReady | undefined { return this.ready.get(id) ?? this.held.get(id); }
  private shownRefs(): BunkerStageRef[] { return [...this.expected.values()].map(ref => this.shown(ref.id) ?? ref); }
  private activeIds(): Set<string> {
    if (this.activeVersion !== this.version) {
      const ready = new Map<string, string>();
      for (const ref of this.expected.values()) { const sprite = this.shown(ref.id); if (sprite?.sourcePatchKeys.every(key => this.courses.has(key))) ready.set(sprite.id, sprite.key); }
      this.active = activeBunkerStages([...this.courses.values()].map(c => this.drawnCourse(c)), this.shownRefs(), ready); this.activeVersion = this.version;
    }
    return this.active;
  }
  /** Find only prepared components touching this worker chunk, including grass/height reach outside source course chunks. */
  near(box: BBox): BunkerStageReady[] {
    const ids = new Set<string>(), active = this.activeIds(), out: BunkerStageReady[] = [];
    for (let y = Math.floor(box[1] / CELL); y <= Math.floor(box[3] / CELL); y++) for (let x = Math.floor(box[0] / CELL); x <= Math.floor(box[2] / CELL); x++) for (const id of this.grid.get(`${x},${y}`) ?? []) ids.add(id);
    for (const id of ids) { const sprite = this.shown(id); if (sprite && active.has(id) && intersects(box, sprite.dirtyBoundsTiles)) out.push(sprite); }
    return out;
  }
  /** Cached native fallback variant for this exact drawn patch and current ready-key set. */
  nativeCourse(course: CoursePatch): NativeBunkerCourse {
    const had = this.native.get(course); if (had?.version === this.version) return had.value;
    const value = nativeBunkerCourse(course, this.shownRefs(), this.activeIds()); this.native.set(course, { version: this.version, value }); return value;
  }
  private ownPath(ref: BunkerStageRef): Path2D { let path = this.paths.get(ref); if (!path) { path = new Path2D(); ref.ringsTiles.forEach((q, i) => ring(path!, q, i === 0)); this.paths.set(ref, path); } return path; }
  /** Draw a single explicit semantic atlas row at its native stage; no distance fields, geometry extraction or texture decoding occurs here. */
  draw(ctx: Context, stage: BunkerStage, box: BBox, L: number, X0: number, Y0: number, originalCourses: readonly CoursePatch[]): void {
    for (const sprite of this.near(box)) {
      const [x0, y0, x1, y1] = sprite.boundsWorldPx, dx = (x0 - X0) * L, dy = (y0 - Y0) * L, dw = (x1 - x0) * L, dh = (y1 - y0) * L;
      if (dx >= ctx.canvas.width || dy >= ctx.canvas.height || dx + dw <= 0 || dy + dh <= 0) continue;
      const source = bunkerStageRect(sprite.renderWidth, sprite.renderHeight, stage);
      ctx.save();
      try {
        ctx.setTransform(64 * L, 32 * L, -64 * L, 32 * L, -X0 * L, -Y0 * L);
        if (stage !== 'lip') {
          ctx.clip(this.ownPath(sprite), 'evenodd');
          // a held picture also stays inside the new outline: an erased part shows the course, not the old sand
          const now = this.expected.get(sprite.id); if (now && now.key !== sprite.key) ctx.clip(this.ownPath(now), 'evenodd');
        }
        else for (const course of originalCourses) for (const layer of course.layers) if ([3, 5, 6, 7, 8].includes(layer.s) && layer.fill.length) {
          // Nonzero: outside this neighbour OR inside the original owner; successive clips preserve overlaps and holes.
          const keep = new Path2D(); keep.rect(box[0] - 2, box[1] - 2, box[2] - box[0] + 4, box[3] - box[1] + 4);
          for (const q of layer.fill) ring(keep, q, area(q) < 0);
          sprite.ringsTiles.forEach((q, i) => ring(keep, q, i === 0)); ctx.clip(keep);
        }
        ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.imageSmoothingEnabled = true;
        ctx.drawImage(sprite.image, ...source, dx, dy, dw, dh);
      } finally { ctx.restore(); }
    }
  }
  get stats() { return { bytes: this.bytes, entries: this.ready.size, expected: this.expected.size, active: this.activeIds().size, maxBytes: BUNKER_STAGE_CACHE_BYTES }; }
  dispose(): void { for (const id of [...this.ready.keys(), ...this.held.keys()]) this.close(id); this.expected.clear(); this.courses.clear(); this.grid.clear(); this.version++; }
}
