// The in-game dev editor's maths (P20 / T071): where a lot's sprite sits in its preset and back, through the fit (fitPreset) and the turn
// (preset-frame.ts), the edits it makes to a preset, and the studio JSON for the library-wide sizes and removals. Pure, no DOM, no library.
import type { LotPreset, PresetProp, View } from '../lots/presets';
import { toFrame, toWorld, type PresetFrame, type Pt } from '../lots/preset-frame';

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

/** one side of a preset's fit (fitPreset) undone: a coordinate v of a lot lotSize long back to the preset laid out presetSize long (tiles).
 *  fitPreset keeps the near half (below presetSize / 2) and moves the far half by the change in size, so the fitted near half covers
 *  [0, presetSize / 2) and the far half [presetSize / 2 + change, lotSize]. A coordinate in only one of them goes back by its rule; in both
 *  (a smaller lot: they overlap) it keeps the half far says (the prop's old half; when null, the lot half it lies in); in neither (a bigger lot:
 *  the stretched gap) it goes to the edge of that half, so it fits back as close as a preset point can. fit(unfit(v)) = v wherever a preset
 *  point fits to v, and unfit(fit(x), far = x >= presetSize / 2) = x */
export function unfit(v: number, presetSize: number, lotSize: number, far: boolean | null): number {
  const half = presetSize / 2, change = lotSize - presetSize, inNear = v < half, inFar = v >= half + change;
  const useFar = inNear && inFar ? (far ?? v >= lotSize / 2) : inFar ? true : inNear ? false : (far ?? v - half >= change / 2);
  if (useFar) return inFar ? v - change : half;
  return inNear ? v : Math.max(0, half - 1e-6);
}
/** one side of fitPreset: a preset coordinate in a lot lotSize long (tiles) */
export const fit1 = (x: number, presetSize: number, lotSize: number) => (x < presetSize / 2 ? x : x + lotSize - presetSize);

/** a preset point (tiles) as it is drawn on a lot: fitted to the lot's size, then turned into the world by the lot's frame (world tiles) */
export function presetToWorld(f: PresetFrame, p: { w: number; d: number }, x: number, y: number): Pt {
  return toWorld(f, fit1(x, p.w, f.w), fit1(y, p.d, f.d));
}
/** a world point (tiles) on a lot back in its preset (tiles): the turn and the fit undone; keep: the prop's old preset point, whose halves an
 *  ambiguous coordinate keeps (see unfit) */
export function worldToPreset(f: PresetFrame, p: { w: number; d: number }, wx: number, wy: number, keep?: { x: number; y: number }): Pt {
  const c = toFrame(f, wx, wy);
  return { x: unfit(c.x, p.w, f.w, keep ? keep.x >= p.w / 2 : null), y: unfit(c.y, p.d, f.d, keep ? keep.y >= p.d / 2 : null) };
}

/** a world point (tiles) for a prop whose footprint has world half extents hx, hy, moved onto a lot so the whole footprint lies inside it: the
 *  point in the lot's frame clamped to [half, size - half] on each side (the lot's middle when the footprint is wider than the lot); the point
 *  back in world tiles, and whether it moved (an arrow move that met the lot edge, a placing past it) */
export function clampToLot(f: PresetFrame, wx: number, wy: number, hx: number, hy: number): { x: number; y: number; clamped: boolean } {
  const c = toFrame(f, wx, wy), ha = Math.abs(f.u.x) * hx + Math.abs(f.u.y) * hy, hb = Math.abs(f.n.x) * hx + Math.abs(f.n.y) * hy;
  const x = 2 * ha >= f.w ? f.w / 2 : clamp(c.x, ha, f.w - ha), y = 2 * hb >= f.d ? f.d / 2 : clamp(c.y, hb, f.d - hb), w = toWorld(f, x, y);
  return { x: w.x, y: w.y, clamped: Math.abs(x - c.x) > 1e-9 || Math.abs(y - c.y) > 1e-9 };
}
/** a sprite placed at a world point (tiles) on a lot drawn from preset p: its point in the preset (the footprint kept inside the lot, then the
 *  turn and the fit undone, the half by the lot half it lies in), and whether the lot edge stopped it */
export function placeInPreset(f: PresetFrame, p: { w: number; d: number }, wx: number, wy: number, hx: number, hy: number): { x: number; y: number; clamped: boolean } {
  const c = clampToLot(f, wx, wy, hx, hy), q = worldToPreset(f, p, c.x, c.y);
  return { x: q.x, y: q.y, clamped: c.clamped };
}
/** a point snapped to the move grid (quarter tiles), as the arrows move */
export const snap = (v: number) => Math.round(v * 4) / 4;

/** one edit to a preset: move a prop to a preset point, scale it by a factor, turn its view, delete it, duplicate it (offset in the preset,
 *  tiles), or add a library sprite at a preset point */
export type PresetEdit =
  | { op: 'move'; prop: number; x: number; y: number }
  | { op: 'scale'; prop: number; factor: number }
  | { op: 'turn'; prop: number; by: number }
  | { op: 'delete'; prop: number }
  | { op: 'duplicate'; prop: number; dx: number; dy: number }
  | { op: 'add'; id: string; x: number; y: number; view?: View; scale?: number };
/** the smallest and largest prop scale an edit leaves (a multiplier of the owner scale) */
export const SCALE_MIN = 0.1, SCALE_MAX = 5;

/** a preset with one edit made: a new preset (the old one is not changed), flagged curated (the owner edited it); points clamped into the
 *  preset and rounded to 3 decimals. prop: the index of the prop edited, the copy or the new one (-1 after a delete); null when the edit names
 *  no prop of the preset */
export function applyEdit(p: LotPreset, e: PresetEdit): { preset: LotPreset; prop: number } | null {
  const props: PresetProp[] = p.props.map(q => ({ ...q }));
  const at = (x: number, y: number) => ({ x: r3(clamp(x, 0, p.w)), y: r3(clamp(y, 0, p.d)) });
  let prop: number;
  if (e.op === 'add') {
    props.push({ id: e.id, ...at(e.x, e.y), scale: r3(clamp(e.scale ?? 1, SCALE_MIN, SCALE_MAX)), view: e.view ?? 0 });
    prop = props.length - 1;
  } else {
    const q = props[e.prop];
    if (!q || !Number.isInteger(e.prop)) return null;
    prop = e.prop;
    if (e.op === 'move') Object.assign(q, at(e.x, e.y));
    else if (e.op === 'scale') q.scale = r3(clamp(q.scale * e.factor, SCALE_MIN, SCALE_MAX));
    else if (e.op === 'turn') q.view = ((((q.view + Math.round(e.by)) % 4) + 4) % 4) as View;
    else if (e.op === 'delete') { props.splice(e.prop, 1); prop = -1; }
    else { props.push({ ...q, ...at(q.x + e.dx, q.y + e.dy) }); prop = props.length - 1; }
  }
  return { preset: { ...p, props, patches: p.patches.map(a => ({ ...a, pts: a.pts.slice(), ...(a.lines ? { lines: a.lines.slice() } : {}) })), curated: true }, prop };
}
/** a drawn size grown or shrunk by factor, a grow never past limit (the largest size the picture's pixels allow: newart.ts maxDrawScale): the
 *  new size, clamped to the limit by a step that would cross it; null for a grow from the limit (or past it), which the studio refuses too */
export function growWithin(now: number, factor: number, limit: number): number | null {
  if (factor <= 1) return now * factor;
  if (now >= limit / 1.001) return null;
  return Math.min(now * factor, limit);
}
/** a preset list with one preset replaced by its edited copy (matched by id), the others as they are; the list unchanged when none matches */
export const replacePreset = (list: readonly LotPreset[], p: LotPreset): LotPreset[] => list.map(q => (q.id === p.id ? p : q));

/** the studio's JSON layout for its id-keyed files (scale-overrides.json, removed.json: scripts/assets/overrides.mjs and removed.mjs): keys
 *  sorted, one-space indent, a final newline */
export const studioJson = (m: Readonly<Record<string, unknown>>) => JSON.stringify(Object.fromEntries(Object.entries(m).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))), null, 1) + '\n';
/** the sprite sizes with one sprite resized as the studio's Library tab does it (server.mjs /api/scale): its size (the studio's, else base,
 *  the owner's map scale) times factor, to 3 decimals; a new object */
export function scaleOverride(sizes: Readonly<Record<string, number>>, id: string, base: number, factor: number): Record<string, number> {
  return { ...sizes, [id]: +((sizes[id] ?? base) * factor).toFixed(3) };
}
/** the removals with one sprite removed as the studio does it (server.mjs /api/remove): when (ISO time) and what it was (name, cat, kind, w, h,
 *  quad, ax, ay: the studio lists a removed sprite from these); a new object */
export function removeSprite(removed: Readonly<Record<string, unknown>>, id: string, item: { name: string; cat: string; kind: string; w: number; h: number; quad?: number[]; ax: number; ay: number }, at: string): Record<string, unknown> {
  const old = (removed[id] && typeof removed[id] === 'object' ? removed[id] : {}) as Record<string, unknown>;
  const info = Object.fromEntries((['name', 'cat', 'kind', 'w', 'h', 'quad', 'ax', 'ay'] as const).filter(k => item[k] !== undefined).map(k => [k, item[k]]));
  return { ...removed, [id]: { ...old, at, ...info } };
}
