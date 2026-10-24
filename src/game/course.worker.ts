// The course worker (T077b, course-contour.ts): keeps a copy of the course grid and runs jobs on it: chunks into lot-ground patches
// (posted back with their typed arrays transferred) and the grid's course areas for some holes.
import type { Grid } from './ext/course-grid';
import { gridAreas } from './ext/course-grid/areas';
import { applyToCourse, chunkBuffers, runChunks, type FromCourse, type ToCourse } from './course-contour';

const scope = self as unknown as DedicatedWorkerGlobalScope;
let grid: Grid | null = null;

scope.onmessage = (e: MessageEvent<ToCourse>) => {
  const m = e.data;
  if (m.t === 'grid' || m.t === 'cells') { grid = applyToCourse(grid, m); return; }
  const t0 = performance.now();
  try {
    if (m.t === 'chunks') { const out = grid ? runChunks(grid, m) : []; scope.postMessage({ t: 'chunks', id: m.id, out, ms: performance.now() - t0 } satisfies FromCourse, chunkBuffers(out)); }
    else scope.postMessage({ t: 'areas', id: m.id, areas: grid ? gridAreas(grid, m.holes ?? undefined) : [], ms: performance.now() - t0 } satisfies FromCourse);
  } catch (err) {
    scope.postMessage({ t: 'error', id: m.id, message: String(err) } satisfies FromCourse);
  }
};
