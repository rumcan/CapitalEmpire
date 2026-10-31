import type { CoursePatch } from '../../ground-protocol';
import { RUGGED, warpLine } from '../../rugged-edges';
import { CELL_T, SURF } from '../course-grid';
import { BUNKER_SHADOW } from '../course-walls';
import type { BunkerCell, BunkerComponent } from './controller';
import { bunkerAppearance, type BunkerSettings } from './settings';
import { assembleBoundaryRings, getDirtyBoundsTiles, splitBunkerComponents } from './package/runtime/capital-empire-adapter.js';

/** Structurally the stage bridge's immutable input; no renderer module is needed here. */
export interface BunkerGeometryInput {
  id: string;
  revision: string;
  ringsTiles: readonly Float64Array[];
  settings: Readonly<BunkerSettings>;
  sourcePatchKeys: readonly string[];
}
export interface BunkerGeometryOptions {
  /** A complete host course-patch generation, not a per-feature bake key. */
  geometryRevision: string | number;
  ready: boolean;
  rugged?: boolean;
  /** Hosts with per-patch generation tokens can reject a mixed asynchronous batch. */
  patchRevision?(patch: CoursePatch): string | number;
}
export interface BunkerGeometryBatch {
  geometryRevision: string | number;
  complete: boolean;
  /** Empty while joins require controller.setRenderedJoins() and one fresh association pass. */
  inputs: BunkerGeometryInput[];
  joins: string[][];
  issues: string[];
}

const compareCells = (a: BunkerCell, b: BunkerCell) => a[1] - b[1] || a[0] - b[0];
const intersects = (a: readonly number[], b: readonly number[]) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];

/**
 * Assemble only real SURF 6 edges from the complete patch cache. Clipped fill
 * polygons never participate. Profile association uses unwarped sand, then the
 * renderer's shared world-space warp moves the exact completed rings once.
 */
export function buildBunkerGeometry(
  patches: readonly CoursePatch[], components: readonly BunkerComponent[], options: BunkerGeometryOptions,
): BunkerGeometryBatch {
  const batch: BunkerGeometryBatch = { geometryRevision: options.geometryRevision, complete: false, inputs: [], joins: [], issues: [] };
  const fail = (message: string) => { batch.issues.push(message); return batch; };
  if (!options.ready) return fail('The complete course-patch generation is not ready.');
  const keys = new Set<string>(), boundaries: Float32Array[] = [];
  for (const patch of patches) {
    const key = `cg:${patch.cx}:${patch.cy}`;
    if (keys.has(key)) return fail(`Duplicate course patch ${key}; mixed generations cannot replace native ground.`);
    keys.add(key);
    if (options.patchRevision && options.patchRevision(patch) !== options.geometryRevision) return fail(`Course patch ${key} belongs to a different geometry generation.`);
    for (const layer of patch.layers) if (layer.s === SURF.bunker) for (const edge of layer.edges) if (edge.length) boundaries.push(edge);
  }
  if (!boundaries.length) {
    if (components.length) return fail('Bunker cells exist but their complete true boundaries are unavailable.');
    batch.complete = true; return batch;
  }
  let shapes: ReturnType<typeof splitBunkerComponents>;
  try { shapes = splitBunkerComponents(assembleBoundaryRings(boundaries)); }
  catch (error) { return fail(error instanceof Error ? error.message : String(error)); }

  const matches: { shape: typeof shapes[number]; owners: { component: BunkerComponent; anchor: BunkerCell }[] }[] = [];
  for (const shape of shapes) {
    const owners: { component: BunkerComponent; anchor: BunkerCell }[] = [];
    for (const component of components) {
      if (!intersects(shape.boundsTiles, component.boundsTiles)) continue;
      const anchor = component.cells.find(cell => inside(shape.ringsTiles, (cell[0] + 0.5) * CELL_T, (cell[1] + 0.5) * CELL_T));
      if (anchor) owners.push({ component, anchor });
    }
    owners.sort((a, b) => compareCells(a.component.seed, b.component.seed));
    if (!owners.length) return fail('A drawn bunker boundary has no current cell-component owner; retain native fallback.');
    if (owners.length > 1) batch.joins.push(owners.map(owner => owner.component.id));
    matches.push({ shape, owners });
  }
  batch.complete = true;
  // Do not publish requests with conflicting raw profiles. The controller first
  // makes these native sand joins one visible selection and resolves its custom.
  if (batch.joins.length) return batch;

  const counts = new Map<string, number>();
  for (const match of matches) { const id = match.owners[0].component.id; counts.set(id, (counts.get(id) ?? 0) + 1); }
  for (const { shape, owners: [owner] } of matches) {
    const component = owner.component;
    const ringsTiles = shape.ringsTiles.map(ring => options.rugged === false ? ring.slice() : Float64Array.from(warpLine(ring, true, RUGGED.courseStep)));
    const settings = Object.freeze({ ...component.settings, shadow: lookShadow(component.settings.shadow, patches, owner.anchor) });
    const dirty = getDirtyBoundsTiles(ringsTiles, bunkerAppearance(settings));
    // Include interior and neighbouring course chunks as well as boundary
    // chunks: the complete collar and projected wall can reach beyond the sand.
    const sourcePatchKeys = patches.filter(patch => intersects(dirty, [patch.cx * patch.size, patch.cy * patch.size, (patch.cx + 1) * patch.size, (patch.cy + 1) * patch.size]))
      .map(patch => `cg:${patch.cx}:${patch.cy}`).sort();
    // A native contour can split one raw component (a removed thin neck). These
    // are render parts of the same existing owner, anchored by real sand cells.
    const id = counts.get(component.id) === 1 ? component.id : `${component.id}/part:${owner.anchor[0]}:${owner.anchor[1]}`;
    batch.inputs.push({ id, revision: options.rugged === false ? 'course-4676-flat-v1' : 'course-4676-rugged-v1',
      ringsTiles, settings, sourcePatchKeys: Object.freeze(sourcePatchKeys) });
  }
  return batch;
}

/** The course look's Shadow (Edges > Shadow, 0..1 on the bunker's chunk) scales the picture's: its default gives the card's own strength. */
function lookShadow(own: number, patches: readonly CoursePatch[], anchor: BunkerCell): number {
  const x = (anchor[0] + 0.5) * CELL_T, y = (anchor[1] + 0.5) * CELL_T;
  const patch = patches.find(p => x >= p.cx * p.size && x < (p.cx + 1) * p.size && y >= p.cy * p.size && y < (p.cy + 1) * p.size);
  const look = patch?.sh?.[SURF.bunker];
  return look === undefined || !Number.isFinite(look) ? own : Math.min(3, Math.max(0, own * look / BUNKER_SHADOW));
}

/** Even-odd rings retain islands/holes independently of winding; coordinates are unwarped tiles. */
function inside(rings: readonly ArrayLike<number>[], x: number, y: number): boolean {
  let result = false;
  for (const ring of rings) {
    let within = false;
    for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
      const ax = ring[j], ay = ring[j + 1], bx = ring[i], by = ring[i + 1];
      const cross = (x - ax) * (by - ay) - (y - ay) * (bx - ax);
      if (Math.abs(cross) < 1e-8 && x >= Math.min(ax, bx) - 1e-8 && x <= Math.max(ax, bx) + 1e-8 && y >= Math.min(ay, by) - 1e-8 && y <= Math.max(ay, by) + 1e-8) return true;
      if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) within = !within;
    }
    if (within) result = !result;
  }
  return result;
}
