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
  /** the greens near it (greensNear): its cut face stands tall only where one is behind it */
  greens?: readonly Float64Array[];
  /** the My looks texture its sand wears (lookTexAt) */
  lookTex?: string;
}
export interface BunkerGeometryOptions {
  /** A complete host course-patch generation, not a per-feature bake key. */
  geometryRevision: string | number;
  ready: boolean;
  rugged?: boolean;
  /** Hosts with per-patch generation tokens can reject a mixed asynchronous batch. */
  patchRevision?(patch: CoursePatch): string | number;
  /** the settings a bunker anchored at this cell bakes with (its owner's look: look-settings bunkerSettingsOfLook); absent: its component's */
  settingsAt?(anchor: BunkerCell): BunkerSettings | undefined;
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
    // no rim mound (Rim height is gone from the card: the course draws the ground round a bunker), whatever an older save holds
    // the look of whoever owns the bunker's cells (a hole, the property, a facility: My looks), else the component's own (a host without looks)
    const base = options.settingsAt?.(owner.anchor) ?? component.settings;
    const settings = Object.freeze({ ...base, rim: 0, shadow: lookShadow(base.shadow, patches, owner.anchor) });
    // the picture reaches as far as its taller face (the no-green height may be the higher one)
    const dirty = getDirtyBoundsTiles(ringsTiles, bunkerAppearance({ ...settings, wall: Math.max(settings.wall, settings.wallLow) }));
    // Include interior and neighbouring course chunks as well as boundary
    // chunks: the complete collar and projected wall can reach beyond the sand.
    const sourcePatchKeys = patches.filter(patch => intersects(dirty, [patch.cx * patch.size, patch.cy * patch.size, (patch.cx + 1) * patch.size, (patch.cy + 1) * patch.size]))
      .map(patch => `cg:${patch.cx}:${patch.cy}`).sort();
    // A native contour can split one raw component (a removed thin neck). These
    // are render parts of the same existing owner, anchored by real sand cells.
    const id = counts.get(component.id) === 1 ? component.id : `${component.id}/part:${owner.anchor[0]}:${owner.anchor[1]}`;
    const greens = greensNear(shape.ringsTiles, patches), lookTex = lookTexAt(patches, owner.anchor);
    batch.inputs.push({ id, revision: options.rugged === false ? 'course-4676-flat-v1' : 'course-4676-rugged-v1',
      ringsTiles, settings, sourcePatchKeys: Object.freeze(sourcePatchKeys), ...(greens.length ? { greens } : {}), ...(lookTex ? { lookTex } : {}) });
  }
  return batch;
}

/** How far (tiles) past a bunker's outline its greens are read: past FACE_FAR in the bake, a green stands behind no wall. */
const GREEN_REACH = 4;
/** The green rings (tiles, as the course patches clip them) within GREEN_REACH of a bunker's outline: its cut face stands tall only where
 *  the green is right behind it (the owner, 2026-10-31: "make any vertical wall that does not have the green behind it small"). */
export function greensNear(rings: readonly ArrayLike<number>[], patches: readonly CoursePatch[]): Float64Array[] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const ring of rings) for (let i = 0; i + 1 < ring.length; i += 2) { x0 = Math.min(x0, ring[i]!); y0 = Math.min(y0, ring[i + 1]!); x1 = Math.max(x1, ring[i]!); y1 = Math.max(y1, ring[i + 1]!); }
  const out: Float64Array[] = []; if (!Number.isFinite(x0)) return out;
  x0 -= GREEN_REACH; y0 -= GREEN_REACH; x1 += GREEN_REACH; y1 += GREEN_REACH;
  for (const patch of patches) {
    if (patch.cx * patch.size > x1 || (patch.cx + 1) * patch.size < x0 || patch.cy * patch.size > y1 || (patch.cy + 1) * patch.size < y0) continue;
    for (const layer of patch.layers) if (layer.s === SURF.green) for (const ring of layer.fill) {
      let near = false; for (let i = 0; i + 1 < ring.length && !near; i += 2) near = ring[i]! >= x0 && ring[i]! <= x1 && ring[i + 1]! >= y0 && ring[i + 1]! <= y1;
      if (near) out.push(Float64Array.from(ring));
    }
  }
  return out;
}

/** The My looks texture the bunker layer lays at a cell: the look of the owner whose share holds it (a hole's, the property's, a facility's:
 *  the layer's alts), else the layer's own. */
export function lookTexAt(patches: readonly CoursePatch[], anchor: BunkerCell): string | undefined {
  const x = (anchor[0] + 0.5) * CELL_T, y = (anchor[1] + 0.5) * CELL_T;
  const patch = patches.find(p => x >= p.cx * p.size && x < (p.cx + 1) * p.size && y >= p.cy * p.size && y < (p.cy + 1) * p.size);
  const layer = patch?.layers.find(l => l.s === SURF.bunker); if (!layer) return undefined;
  for (const alt of layer.alts ?? []) for (let i = 0; i + 3 < alt.runs.length; i += 4) if (x >= alt.runs[i]! && y >= alt.runs[i + 1]! && x < alt.runs[i + 2]! && y < alt.runs[i + 3]!) return alt.look.tex;
  return layer.tex;
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
