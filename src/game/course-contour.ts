// The course grid's heavy work off the main thread (T077b): a worker keeps a copy of the course grid (sent whole when the grid is made,
// grown, loaded or dropped, then cell by cell as it is painted) and runs jobs on it: turning 64-tile chunks into their lot-ground patches
// (ext/course-grid/patch.ts coursePatch: course-blobs outlines, looks, collars, mowing lines, growth mask, grow key), or working out the
// grid's course areas (areas.ts gridAreas) for some holes. Patches come back with their typed arrays transferred, so the main thread
// only forwards them. Jobs run in order on the worker's copy, which has every change posted before the job, so a job sees one whole state
// of the grid. Without a worker (none, or it failed) the same functions run on the calling thread.
import type { LotPatch } from './ground-protocol';
import { coursePatch, courseGrowKey, patchBuffers, type CourseLooks } from './ext/course-grid/patch';
import { gridAreas, type GridArea } from './ext/course-grid/areas';
import { applyDiff, type Grid, type GridDiff } from './ext/course-grid';
import CourseWorker from './course.worker?worker';

/** a chunk job: chunks as cx cy pairs, the looks, the effective game month, the holes' centre lines and the cart paths and drives (flat
 *  segments ax, ay, bx, by in tiles: the tees' stairs face the nearest, T127) */
export interface CourseJob { chunks: number[]; looks: CourseLooks; now: number; lines: [number, number[]][]; paths?: number[] }
/** a chunk's result: the chunk (cx, cy), its patch (null: nothing on it) and its grow key */
export interface CourseChunkOut { cx: number; cy: number; patch: LotPatch | null; grow: string }

export type ToCourse =
  | { t: 'grid'; g: { x0: number; y0: number; w: number; h: number; surf: Uint8Array; hole: Uint8Array; month: Uint16Array; carve?: Uint8Array } | null }
  | { t: 'cells'; x0: number; y0: number; w: number; idx: Uint32Array; s: Uint8Array; h: Uint8Array; m: Uint16Array; c?: Uint8Array }
  | ({ t: 'chunks'; id: number } & CourseJob)
  | { t: 'areas'; id: number; holes: number[] | null };
export type FromCourse =
  | { t: 'chunks'; id: number; out: CourseChunkOut[]; ms: number }
  | { t: 'areas'; id: number; areas: GridArea[]; ms: number }
  | { t: 'error'; id: number; message: string };

/** the patches of a chunk job on grid g (both threads run this) */
export function runChunks(g: Grid, job: CourseJob): CourseChunkOut[] {
  const lines = new Map(job.lines), out: CourseChunkOut[] = [];
  for (let k = 0; k + 1 < job.chunks.length; k += 2) {
    const cx = job.chunks[k]!, cy = job.chunks[k + 1]!;
    const patch = coursePatch(g, cx, cy, job.looks, job.now, lines, job.paths);
    out.push({ cx, cy, patch, grow: courseGrowKey(g, cx, cy, job.now, patch?.course?.grow) });
  }
  return out;
}
/** the transfer list of a chunk job's results */
export function chunkBuffers(out: readonly CourseChunkOut[]): ArrayBuffer[] { return out.flatMap(o => (o.patch ? patchBuffers(o.patch) : [])); }

/** the worker side's grid update: a whole grid, or changed cells written as they now are */
export function applyToCourse(g: Grid | null, m: ToCourse): Grid | null {
  if (m.t === 'grid') return m.g ? { ...m.g, rev: 0 } : null;
  if (m.t === 'cells' && g) applyDiff(g, { x0: m.x0, y0: m.y0, w: m.w, n: m.idx.length, idx: m.idx, s0: m.s, h0: m.h, m0: m.m, s1: m.s, h1: m.h, m1: m.m, ...(m.c ? { c0: m.c, c1: m.c } : {}) }, false);
  return g;
}

type Pending = { msg: ToCourse & { id: number }; done: (r: FromCourse) => void };

/** the main thread's side of one worker */
export class CourseContour {
  private worker: Worker | null = null;
  private failed = false;
  private nextId = 1;
  private jobs = new Map<number, Pending>();
  /** the grid as this side last sent it (the fallback runs on it) */
  private grid: Grid | null = null;

  /** whether jobs run off the main thread */
  get async(): boolean { return !!this.w(); }
  /** the worker, made on first use; null when there is none (the fallback runs) */
  private w(): Worker | null {
    if (this.worker || this.failed) return this.worker;
    try {
      const w = new CourseWorker();
      w.onmessage = (e: MessageEvent<FromCourse>) => { const p = this.jobs.get(e.data.id); if (!p) return; this.jobs.delete(e.data.id); if (e.data.t === 'error') { console.warn('course worker:', e.data.message); this.local(p); } else p.done(e.data); };
      w.onerror = e => { e.preventDefault(); console.warn('course worker failed; its jobs run on the main thread', e.message); this.fail(); };
      this.worker = w;
    } catch { this.failed = true; }
    return this.worker;
  }
  /** the worker failed: its jobs run here, now and from then on */
  private fail() {
    this.failed = true; this.worker?.terminate(); this.worker = null;
    const js = [...this.jobs.values()]; this.jobs.clear();
    for (const p of js) this.local(p);
  }
  /** a job run on this thread */
  private local(p: Pending) {
    const g = this.grid, t0 = performance.now(), m = p.msg;
    if (m.t === 'chunks') p.done({ t: 'chunks', id: m.id, out: g ? runChunks(g, m) : [], ms: performance.now() - t0 });
    else if (m.t === 'areas') p.done({ t: 'areas', id: m.id, areas: g ? gridAreas(g, m.holes ?? undefined) : [], ms: performance.now() - t0 });
  }
  private post(m: ToCourse & { id: number }, done: (r: FromCourse) => void) {
    const p: Pending = { msg: m, done }, w = this.w();
    if (!w) { this.local(p); return; }
    this.jobs.set(m.id, p); w.postMessage(m);
  }
  /** the grid changed as a whole (made, grown, loaded, dropped): the worker takes a copy */
  setGrid(g: Grid | null) {
    this.grid = g;
    this.w()?.postMessage({ t: 'grid', g: g ? { x0: g.x0, y0: g.y0, w: g.w, h: g.h, surf: g.surf.slice(), hole: g.hole.slice(), month: g.month.slice(), ...(g.carve ? { carve: g.carve.slice() } : {}) } : null } satisfies ToCourse);
  }
  /** cells of grid g changed (a diff applied either way): the worker takes their values as they now are */
  cells(g: Grid, d: GridDiff) {
    const w = this.worker; if (!w || !d.n) return;
    const n = d.n, idx = new Uint32Array(n), s = new Uint8Array(n), h = new Uint8Array(n), m = new Uint16Array(n), c = new Uint8Array(n), cv = g.carve;
    const same = d.x0 === g.x0 && d.y0 === g.y0 && d.w === g.w, ox = Math.round((d.x0 - g.x0) / 0.5), oy = Math.round((d.y0 - g.y0) / 0.5);
    let k2 = 0;
    for (let k = 0; k < n; k++) {
      let i = d.idx[k]!;
      if (!same) { const cx = i % d.w, cy = (i - cx) / d.w, gx = ox + cx, gy = oy + cy; if (gx < 0 || gy < 0 || gx >= g.w || gy >= g.h) continue; i = gy * g.w + gx; }
      idx[k2] = i; s[k2] = g.surf[i]!; h[k2] = g.hole[i]!; m[k2] = g.month[i]!; c[k2] = cv?.[i] ?? 0; k2++;
    }
    // the carve flags go along (T125: the worker's blobs leave a rubbed-out gap open)
    const msg = { t: 'cells' as const, x0: g.x0, y0: g.y0, w: g.w, idx: idx.slice(0, k2), s: s.slice(0, k2), h: h.slice(0, k2), m: m.slice(0, k2), c: c.slice(0, k2) } satisfies ToCourse;
    w.postMessage(msg, [msg.idx.buffer, msg.s.buffer, msg.h.buffer, msg.m.buffer, msg.c.buffer]);
  }
  /** a chunk job; done gets its results (later, from the worker; at once without one) */
  chunks(job: CourseJob, done: (out: CourseChunkOut[], ms: number) => void) {
    this.post({ t: 'chunks', id: this.nextId++, ...job }, r => { if (r.t === 'chunks') done(r.out, r.ms); });
  }
  /** an areas job for these holes (null: all); done gets the areas */
  areas(holes: number[] | null, done: (areas: GridArea[], ms: number) => void) {
    this.post({ t: 'areas', id: this.nextId++, holes }, r => { if (r.t === 'areas') done(r.areas, r.ms); });
  }
  /** forgets every job in flight (a reset): their results are dropped when they come */
  drop() { this.jobs.clear(); }
  terminate() { this.worker?.terminate(); this.worker = null; this.jobs.clear(); }
}
