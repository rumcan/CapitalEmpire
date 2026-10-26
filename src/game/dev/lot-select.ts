// The lot lab's multi-selection (T148): a set of one preset's props and decals (by their index there), the edits on the whole set (move,
// delete, turn, bigger and smaller), copy and paste, the box pick, and the house swap. Pure, no DOM, no library: the editor (lot-editor.ts)
// gives the art facts (a prop's footprint half extents in the lot's frame, whether it turns, its size limit) as callbacks. Every point is in the
// preset's own frame (tiles: x along the street, y away from it); an edit returns a new preset (the old one is not changed), flagged curated.
import type { LotPreset, PresetDecal, PresetProp, View } from '../lots/presets';
import { WHOLE_FRONT } from '../lots/presets';
import { SCALE_MAX, SCALE_MIN } from './lot-edit';

/** a selection: the indices of a preset's props and decals, each list sorted and without repeats */
export interface Selection { props: number[]; decals: number[] }
/** which list an item is in */
export type Kind = 'props' | 'decals';
/** a prop's footprint half extents in the lot's frame (tiles): ha along x, hb along y */
export interface Half { ha: number; hb: number }
/** what was copied: the props and decals relative to the selection's centre (the middle of the box round their points), as the preset holds
 *  them (sizes, turns; a decal's sign is its mirror) */
export interface Clip { props: PresetProp[]; decals: PresetDecal[] }

/** the empty selection */
export const NONE: Selection = { props: [], decals: [] };
/** how many items a selection holds */
export const count = (s: Selection) => s.props.length + s.decals.length;
/** a sorted list without repeats */
const tidy = (a: readonly number[]) => [...new Set(a)].sort((x, y) => x - y);
/** a number as the preset file writes it: rounded to 3 decimals */
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
/** a selection of these props and decals (tidied) */
export const selOf = (props: readonly number[] = [], decals: readonly number[] = []): Selection => ({ props: tidy(props), decals: tidy(decals) });
/** whether an item is selected */
export const has = (s: Selection, k: Kind, i: number) => s[k].includes(i);
/** a selection with one item added, or removed when it was there (Shift+click) */
export function toggle(s: Selection, k: Kind, i: number): Selection {
  const l = s[k], next = l.includes(i) ? l.filter(j => j !== i) : tidy([...l, i]);
  return k === 'props' ? { props: next, decals: s.decals } : { props: s.props, decals: next };
}
/** both selections together */
export const union = (a: Selection, b: Selection): Selection => selOf([...a.props, ...b.props], [...a.decals, ...b.decals]);
/** the selection kept to the items a preset has (an index past its lists goes: the preset changed under it) */
export const within = (s: Selection, p: LotPreset): Selection => ({ props: s.props.filter(i => i < p.props.length), decals: s.decals.filter(i => i < (p.decals?.length ?? 0)) });

/** an item on screen for the box pick: its list, index and point (screen px; the footprint centre of a prop, the centre of a decal) */
export interface ScreenPt { kind: Kind; i: number; x: number; y: number }
/** the items whose point lies inside the screen box spanned by two corners (any order; the edges count) */
export function inBox(pts: readonly ScreenPt[], x0: number, y0: number, x1: number, y1: number): Selection {
  const a = Math.min(x0, x1), b = Math.max(x0, x1), c = Math.min(y0, y1), d = Math.max(y0, y1), props: number[] = [], decals: number[] = [];
  for (const q of pts) if (q.x >= a && q.x <= b && q.y >= c && q.y <= d) (q.kind === 'props' ? props : decals).push(q.i);
  return selOf(props, decals);
}

/** the front a preset's decals may stand in front of its lot (a whole preset: the verge, WHOLE_FRONT tiles), else 0 */
const frontOf = (p: LotPreset) => (p.whole ? -WHOLE_FRONT : 0);
/** a preset with new props and decals (copies), flagged curated */
const edited = (p: LotPreset, props: PresetProp[], decals: PresetDecal[] | undefined): LotPreset => ({ ...p, props, ...(decals !== undefined ? { decals } : {}), curated: true });

/** the range (tiles) a group may shift by on one axis so every item stays inside [lo, hi] (an item already outside never blocks: it may stay):
 *  the intersection of each item's [lo + h - v, hi - h - v], each widened to hold 0 */
function shiftRange(items: readonly { v: number; h: number; lo: number; hi: number }[]): [number, number] {
  let a = -Infinity, b = Infinity;
  for (const q of items) { a = Math.max(a, Math.min(0, q.lo + q.h - q.v)); b = Math.min(b, Math.max(0, q.hi - q.h - q.v)); }
  return [a, b];
}

/** the selection moved by (dx, dy) tiles as one: the shift is cut short so every prop's footprint stays in the lot (x in [0, w], y in [0, d])
 *  and every decal in reach ([0, w] by [front, d]); the relative layout is kept. moved: the shift made; clamped: the lot's edge cut it short */
export function moveSel(p: LotPreset, s: Selection, dx: number, dy: number, half: (q: PresetProp) => Half): { preset: LotPreset; dx: number; dy: number; clamped: boolean } {
  const lo = frontOf(p), xs: { v: number; h: number; lo: number; hi: number }[] = [], ys: typeof xs = [];
  for (const i of s.props) { const q = p.props[i]; if (!q) continue; const h = half(q); xs.push({ v: q.x, h: h.ha, lo: 0, hi: p.w }); ys.push({ v: q.y, h: h.hb, lo: 0, hi: p.d }); }
  for (const i of s.decals) { const c = p.decals?.[i]; if (!c) continue; xs.push({ v: c.x, h: 0, lo: 0, hi: p.w }); ys.push({ v: c.y, h: 0, lo, hi: p.d }); }
  const [ax, bx] = shiftRange(xs), [ay, by] = shiftRange(ys), mx = clamp(dx, ax, bx), my = clamp(dy, ay, by);
  const props = p.props.map((q, i) => (s.props.includes(i) ? { ...q, x: r3(q.x + mx), y: r3(q.y + my) } : { ...q }));
  const decals = p.decals?.map((c, i) => (s.decals.includes(i) ? { ...c, x: r3(c.x + mx), y: r3(c.y + my) } : { ...c }));
  return { preset: edited(p, props, decals), dx: mx, dy: my, clamped: Math.abs(mx - dx) > 1e-9 || Math.abs(my - dy) > 1e-9 };
}
/** the selection removed */
export function deleteSel(p: LotPreset, s: Selection): LotPreset {
  return edited(p, p.props.filter((_, i) => !s.props.includes(i)).map(q => ({ ...q })), p.decals?.filter((_, i) => !s.decals.includes(i)).map(c => ({ ...c })));
}
/** each selected prop turned a quarter in place (its view + by), when its picture can show another view (turnable); each selected decal
 *  mirrored (a decal has no views: R mirrors it, as the lab did). turned: the props turned; mirrored: the decals */
export function turnSel(p: LotPreset, s: Selection, turnable: (q: PresetProp) => boolean, by = 1): { preset: LotPreset; turned: number; mirrored: number } {
  let turned = 0, mirrored = 0;
  const props = p.props.map((q, i) => { if (!s.props.includes(i) || !turnable(q)) return { ...q }; turned++; return { ...q, view: ((((q.view + by) % 4) + 4) % 4) as View }; });
  const decals = p.decals?.map((c, i) => { if (!s.decals.includes(i)) return { ...c }; mirrored++; return { ...c, scale: -c.scale }; });
  return { preset: edited(p, props, decals), turned, mirrored };
}
/** each selected item scaled by factor in place: a prop's scale kept in [SCALE_MIN, SCALE_MAX] and never grown past limit (the largest
 *  multiplier its picture's pixels allow: a grow from the limit or past it is refused, a step that would cross it stops at it, as the studio
 *  refuses it); a decal's size in the scale range, its sign (mirror) kept. changed: the items resized; refused: the props at their limit */
export function scaleSel(p: LotPreset, s: Selection, factor: number, limit: (q: PresetProp) => number): { preset: LotPreset; changed: number; refused: number } {
  let changed = 0, refused = 0;
  const props = p.props.map((q, i) => {
    if (!s.props.includes(i)) return { ...q };
    const lim = Math.min(SCALE_MAX, limit(q));
    if (factor > 1 && q.scale >= lim / 1.001) { refused++; return { ...q }; }
    changed++; return { ...q, scale: r3(clamp(factor > 1 ? Math.min(q.scale * factor, lim) : q.scale * factor, SCALE_MIN, SCALE_MAX)) };
  });
  const decals = p.decals?.map((c, i) => { if (!s.decals.includes(i)) return { ...c }; changed++; return { ...c, scale: r3(Math.sign(c.scale || 1) * clamp(Math.abs(c.scale) * factor, SCALE_MIN, SCALE_MAX)) }; });
  return { preset: edited(p, props, decals), changed, refused };
}

/** the selection copied: its props and decals (copies) relative to the middle of the box round their points; null for an empty selection */
export function copySel(p: LotPreset, s: Selection): Clip | null {
  const props = s.props.map(i => p.props[i]).filter((q): q is PresetProp => !!q), decals = s.decals.map(i => p.decals?.[i]).filter((c): c is PresetDecal => !!c);
  const pts = [...props, ...decals];
  if (!pts.length) return null;
  const cx = (Math.min(...pts.map(q => q.x)) + Math.max(...pts.map(q => q.x))) / 2, cy = (Math.min(...pts.map(q => q.y)) + Math.max(...pts.map(q => q.y))) / 2;
  return { props: props.map(q => ({ ...q, x: r3(q.x - cx), y: r3(q.y - cy) })), decals: decals.map(c => ({ ...c, x: r3(c.x - cx), y: r3(c.y - cy) })) };
}
/** a clip pasted into a preset with its centre at (x, y) (preset frame, tiles), as one: shifted as little as needed so every prop's footprint lies
 *  in the lot and every decal in reach (as moveSel keeps them); a clip bigger than the lot is centred on it and each item kept in it alone. The
 *  pasted items go after the preset's own, and sel holds them (the paste stays selected); clamped: the lot's edge moved it */
export function pasteClip(p: LotPreset, c: Clip, x: number, y: number, half: (q: PresetProp) => Half): { preset: LotPreset; sel: Selection; clamped: boolean } {
  const lo = frontOf(p), xs: { v: number; h: number; lo: number; hi: number }[] = [], ys: typeof xs = [];
  const hs = c.props.map(q => half(q));
  c.props.forEach((q, k) => { xs.push({ v: x + q.x, h: hs[k]!.ha, lo: 0, hi: p.w }); ys.push({ v: y + q.y, h: hs[k]!.hb, lo: 0, hi: p.d }); });
  for (const q of c.decals) { xs.push({ v: x + q.x, h: 0, lo: 0, hi: p.w }); ys.push({ v: y + q.y, h: 0, lo, hi: p.d }); }
  /** the shift on one axis: the least that puts every item inside (the range of shifts that do, nearest 0), or the middle of the lot's slack */
  const shift = (items: typeof xs) => {
    let a = -Infinity, b = Infinity;
    for (const q of items) { a = Math.max(a, q.lo + q.h - q.v); b = Math.min(b, q.hi - q.h - q.v); }
    return a <= b ? clamp(0, a, b) : (a + b) / 2;
  };
  const sx = shift(xs), sy = shift(ys);
  /** one item's point, kept inside alone (a clip bigger than the lot) */
  const put = (v: number, h: number, a: number, b: number) => r3(2 * h >= b - a ? (a + b) / 2 : clamp(v, a + h, b - h));
  const props = [...p.props.map(q => ({ ...q })), ...c.props.map((q, k) => ({ ...q, x: put(x + q.x + sx, hs[k]!.ha, 0, p.w), y: put(y + q.y + sy, hs[k]!.hb, 0, p.d) }))];
  const decals = [...(p.decals ?? []).map(q => ({ ...q })), ...c.decals.map(q => ({ ...q, x: put(x + q.x + sx, 0, 0, p.w), y: put(y + q.y + sy, 0, lo, p.d) }))];
  const sel = selOf(c.props.map((_, k) => p.props.length + k), c.decals.map((_, k) => (p.decals?.length ?? 0) + k));
  return { preset: edited(p, props, p.decals || c.decals.length ? decals : undefined), sel, clamped: Math.abs(sx) > 1e-9 || Math.abs(sy) > 1e-9 };
}

/** the next of a pool after the current one (dir 1) or before it (dir -1), wrapping; a current one not in the pool counts from where it would sort
 *  (rank: its place by the pool's order, e.g. its size). Never the current one: null when the pool holds nothing else */
export function cycle(pool: readonly string[], current: string, dir: 1 | -1, rank?: (id: string) => number): string | null {
  const others = pool.filter(id => id !== current);
  if (!others.length) return null;
  const at = pool.indexOf(current);
  if (at >= 0) { for (let k = 1; k <= pool.length; k++) { const n = pool[(((at + dir * k) % pool.length) + pool.length) % pool.length]!; if (n !== current) return n; } return null; }
  // not in the pool: the first one above it (dir 1) or the last one below it (dir -1), by rank, wrapping
  const r = rank ? rank(current) : -Infinity;
  if (dir > 0) return others.find(id => (rank ? rank(id) : 0) > r) ?? others[0]!;
  const below = others.filter(id => (rank ? rank(id) : 0) < r);
  return below[below.length - 1] ?? others[others.length - 1]!;
}
/** a building prop swapped for another sprite (Change house): the same view and place rules: its centre along the street kept and its street
 *  side (the footprint's edge nearest the street, y - hb) kept, so a deeper house reaches further back, never into the front yard; the footprint
 *  then kept in the lot (centred on an axis it is wider than); its scale multiplier kept, but never past the new picture's limit (maxScale) */
export function swapHouse(p: LotPreset, i: number, id: string, before: Half, after: Half, maxScale: number): LotPreset | null {
  const q = p.props[i]; if (!q) return null;
  const x = 2 * after.ha >= p.w ? p.w / 2 : clamp(q.x, after.ha, p.w - after.ha), y0 = q.y - before.hb + after.hb;
  const y = 2 * after.hb >= p.d ? p.d / 2 : clamp(y0, after.hb, p.d - after.hb);
  const props = p.props.map((o, k) => (k === i ? { ...o, id, x: r3(x), y: r3(y), scale: r3(clamp(Math.min(o.scale, maxScale), SCALE_MIN, SCALE_MAX)) } : { ...o }));
  return edited(p, props, p.decals?.map(c => ({ ...c })));
}
/** a preset's main building: the prop with the largest footprint (half extents' product) among those isBuilding names; -1 when it has none */
export function mainBuilding(p: LotPreset, isBuilding: (q: PresetProp) => boolean, half: (q: PresetProp) => Half): number {
  let best = -1, area = 0;
  p.props.forEach((q, i) => { if (!isBuilding(q)) return; const h = half(q), a = h.ha * h.hb; if (a > area) { area = a; best = i; } });
  return best;
}
