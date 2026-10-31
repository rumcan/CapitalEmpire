import type { CourseLayer, CoursePatch, CourseRim, CourseWall } from '../../ground-protocol';
import type { BunkerStageRef } from './stage-types';

const BUNKER = 6, FILL = 12, SAND = 1, TEE = 5, EPS = 0.002;
function distance2(points: ArrayLike<number>, x: number, y: number, stride = 2, close = true): number {
  let best = Infinity;
  const n = Math.floor(points.length / stride), sides = close ? n : n - 1;
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % n, ax = points[i * stride]!, ay = points[i * stride + 1]!, dx = points[j * stride]! - ax, dy = points[j * stride + 1]! - ay;
    const length = dx * dx + dy * dy, t = length ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / length)) : 0;
    best = Math.min(best, (x - ax - t * dx) ** 2 + (y - ay - t * dy) ** 2);
  }
  return best;
}
function inRing(points: ArrayLike<number>, x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 2; i < points.length; j = i, i += 2) {
    const ax = points[j]!, ay = points[j + 1]!, bx = points[i]!, by = points[i + 1]!;
    if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
  }
  return inside;
}
/** Exact complete feature containment (even-odd holes) with only Float32 seam-rounding tolerance. */
export function bunkerOwnsPoint(ref: BunkerStageRef, x: number, y: number): boolean {
  let inside = false;
  for (const ring of ref.ringsTiles) { if (distance2(ring, x, y) <= EPS * EPS) return true; if (inRing(ring, x, y)) inside = !inside; }
  return inside;
}
function nearBoundary(ref: BunkerStageRef, x: number, y: number, reach = EPS): boolean { return ref.ringsTiles.some(ring => distance2(ring, x, y) <= reach * reach); }
const courseKey = (course: CoursePatch) => `cg:${course.cx}:${course.cy}`;
function ringOwned(ref: BunkerStageRef, ring: ArrayLike<number>): boolean {
  for (let i = 0; i + 1 < ring.length; i += 2) if (bunkerOwnsPoint(ref, ring[i]!, ring[i + 1]!)) return true;
  return false;
}
function collarOwners(ring: ArrayLike<number>, refs: readonly BunkerStageRef[], width: number): string[] {
  return refs.filter(ref => ringOwned(ref, ring) || ref.ringsTiles.some(q => {
    for (let i = 0; i + 1 < q.length; i += 2) if (inRing(ring, q[i]!, q[i + 1]!)) return true;
    for (let i = 0; i + 1 < ring.length; i += 2) if (nearBoundary(ref, ring[i]!, ring[i + 1]!, width + 0.5)) return true;
    return false;
  })).map(ref => ref.id);
}

/** A shared native collar is replaced atomically; pending/evicted neighbours keep only that local group native. */
export function activeBunkerStages(courses: readonly CoursePatch[], refs: readonly BunkerStageRef[], ready: ReadonlyMap<string, string>): Set<string> {
  const active = new Set(refs.filter(ref => ready.get(ref.id) === ref.key).map(ref => ref.id));
  const groups: string[][] = [];
  for (const c of courses) {
    const local = refs.filter(ref => ref.sourcePatchKeys.includes(courseKey(c)));
    for (const l of c.layers) if (l.s === BUNKER && l.collar?.fill.length) for (const ring of l.collar.fill) {
      const owners = collarOwners(ring, local, l.collar.w ?? 0);
      // An unlabelled band's own native geometry stays untouched; it must not couple unrelated components elsewhere in this chunk.
      if (owners.length) groups.push(owners);
    }
  }
  let changed = true;
  while (changed) { changed = false; for (const group of groups) if (group.some(id => !active.has(id))) for (const id of group) if (active.delete(id)) changed = true; }
  return active;
}

/** Split true polyline segments, retaining their original coordinates and metre drops; never invent a closing edge. */
function spans(points: Float32Array, stride: 2 | 3, keep: (x: number, y: number, dx: number, dy: number) => boolean): Float32Array[] {
  const out: Float32Array[] = []; let current: number[] = [];
  for (let i = 0; i + 2 * stride <= points.length; i += stride) {
    const x = points[i]!, y = points[i + 1]!, dx = points[i + stride]! - x, dy = points[i + stride + 1]! - y;
    if (keep(x + dx / 2, y + dy / 2, dx, dy)) { if (!current.length) for (let k = 0; k < stride; k++) current.push(points[i + k]!); for (let k = 0; k < stride; k++) current.push(points[i + stride + k]!); }
    else if (current.length) { out.push(Float32Array.from(current)); current = []; }
  }
  if (current.length) out.push(Float32Array.from(current)); return out;
}

export interface NativeBunkerCourse { course: CoursePatch; teeSand: CourseWall[] }
/** Remove only owned native bunker runs. Other surfaces, materials and unowned rim spans retain object identity. */
export function nativeBunkerCourse(c: CoursePatch, refs: readonly BunkerStageRef[], active: ReadonlySet<string>): NativeBunkerCourse {
  const local = refs.filter(ref => active.has(ref.id) && ref.sourcePatchKeys.includes(courseKey(c)));
  if (!local.length) return { course: c, teeSand: [] };
  const owned = (x: number, y: number) => local.some(ref => bunkerOwnsPoint(ref, x, y));
  const edge = (x: number, y: number) => local.some(ref => nearBoundary(ref, x, y));
  const keepRuns = (all: readonly Float32Array[] | undefined, width = 0) => all?.flatMap(q => spans(q, 2, (x, y) => !local.some(ref => width ? nearBoundary(ref, x, y, width + 0.5) : nearBoundary(ref, x, y))));
  const layers = c.layers.map((l): CourseLayer => {
    if (l.s !== BUNKER) return l;
    const collar = l.collar && { ...l.collar, fill: l.collar.fill.filter(ring => !collarOwners(ring, local, l.collar!.w ?? 0).length), edges: keepRuns(l.collar.edges, l.collar.w ?? 0)!, soft: keepRuns(l.collar.soft, l.collar.w ?? 0) };
    return { ...l, fill: l.fill.filter(ring => !local.some(ref => ringOwned(ref, ring))), edges: keepRuns(l.edges)!, soft: keepRuns(l.soft), joint: keepRuns(l.joint), ...(collar ? { collar } : {}) };
  });
  const teeSand: CourseWall[] = [], walls: CourseWall[] = [];
  for (const wall of c.walls ?? []) {
    if (wall.m !== SAND || wall.lo !== FILL) { walls.push(wall); continue; }
    const belongs = (x: number, y: number, dx: number, dy: number) => {
      const length = Math.hypot(dx, dy) || 1;
      return owned(x, y) || owned(x + 0.04 * dy / length, y - 0.04 * dx / length);
    };
    for (const p of spans(wall.p, 3, (x, y, dx, dy) => !belongs(x, y, dx, dy))) walls.push({ ...wall, p });
    if (wall.hs === TEE) for (const p of spans(wall.p, 3, belongs)) teeSand.push({ ...wall, p });
  }
  const rims: CourseRim[] = [];
  for (const rim of c.rims ?? []) {
    const kept = spans(rim.p, 2, (x, y) => !edge(x, y));
    if (kept.length === 1 && kept[0].length === rim.p.length) rims.push(rim); else for (const p of kept) rims.push({ ...rim, p });
  }
  return { course: { ...c, layers, ...(c.walls ? { walls } : {}), ...(c.rims ? { rims } : {}) }, teeSand };
}
