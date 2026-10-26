// Auto-sized lots (T155 PR 2, #333; the owner, 2026-10-26: "to make every combination for every lot size and direction will need 1500 lots ... we
// need to make the lots auto size. If we design a layout on the largest lot then save it, it need to auto adjust based on smaller sizes and just
// remove props as the size goed down the trees and props"). A lab preset laid out on the largest lot size of its type and state is a MASTER; saving
// it derives every smaller size of that type, state and road angle:
//   - the house (the main building) keeps its street edge and its spot along the street, shifted in only as far as it must to fit;
//   - fences on the lot's edges follow their edge (a run along the back moves forward with the back, the right side moves in with the right edge),
//     each keeping its place along the edge; segments past the new corner go;
//   - everything else keeps its distance from the house (the yard between the house and an edge shrinks), shifted in a little when it pokes out;
//     ground patches (paths, drives) and decals map the same way;
//   - what no longer fits, or would overlap something it did not overlap on the master, is dropped by priority: trees first, then large props,
//     then small props; decals last (only when they leave the lot).
// A derived preset is marked (derived: the master's id) and derived again whenever its master is saved; a hand edit detaches it (detached: the
// master's id), and the master then leaves that size alone. Pure: the caller gives each prop's footprint and kind (src/game/dev/lot-derive.ts).
import { bucketOf, WHOLE_FRONT, type LotPreset, type PresetDecal, type PresetPatch, type PresetProp } from './presets';

/** a prop's footprint half extents in the preset frame (tiles: ha along x, hb along y) */
export interface Half { ha: number; hb: number }
/** what a prop is to the derive: the house (kept), a fence (follows the edges), a tree, a large or a small prop (dropped in that order) */
export type DeriveKind = 'house' | 'fence' | 'tree' | 'large' | 'small';
export interface DeriveInfo { half: (q: PresetProp) => Half; kind: (q: PresetProp, i: number) => DeriveKind }
/** what a derive dropped, by kind */
export type DropCounts = Record<'tree' | 'large' | 'small' | 'fence' | 'decal', number>;
/** a size of a type and state: its bucket and the lot size it is composed at (tiles) */
export interface DeriveSize { w: number; d: number; bw: number; bd: number }
/** a derived preset's id: its master's and its bucket */
export const derivedId = (masterId: string, bw: number, bd: number) => `${masterId}~${bw}x${bd}`;
/** how near an edge (tiles) a fence must lie to follow it; the overlap (tiles) that counts as overlapping; the farthest (tiles) a prop is shifted in */
const EDGE = 0.75, TOUCH = 0.15, SHIFT = 2;
/** the keep order: a conflict drops the later one (trees first, then large props, then small props) */
const KEEP: readonly ('small' | 'large' | 'tree')[] = ['small', 'large', 'tree'];
type Box = [number, number, number, number];
const boxOf = (x: number, y: number, h: Half): Box => [x - h.ha, y - h.hb, x + h.ha, y + h.hb];
/** whether two footprints overlap (more than a touch) */
const overlap = (a: Box, b: Box) => Math.min(a[2], b[2]) - Math.max(a[0], b[0]) > TOUCH && Math.min(a[3], b[3]) - Math.max(a[1], b[1]) > TOUCH;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** a monotone piecewise-linear map through knots [in, out] (sorted by in; a repeated in keeps its first); beyond the ends, a shift by the end knot */
export function knotMap(knots: readonly [number, number][]): (v: number) => number {
  const k: [number, number][] = [];
  for (const p of [...knots].sort((a, b) => a[0] - b[0])) if (!k.length || p[0] - k[k.length - 1]![0] > 1e-9) k.push(p);
  return v => {
    if (v <= k[0]![0]) return v - k[0]![0] + k[0]![1];
    for (let i = 0; i + 1 < k.length; i++) { const [a0, b0] = k[i]!, [a1, b1] = k[i + 1]!; if (v <= a1) return b0 + ((v - a0) * (b1 - b0)) / (a1 - a0); }
    const e = k[k.length - 1]!; return v - e[0] + e[1];
  };
}

/** one size derived from a master (w x d tiles, the preset's id): its props, patches and decals as the file head says, and what was dropped; null
 *  when the master's house does not fit the lot at all */
export function derivePreset(m: LotPreset, w: number, d: number, info: DeriveInfo, id: string): { preset: LotPreset; dropped: DropCounts } | null {
  const dx = w - m.w, dy = d - m.d, lo = m.whole ? -WHOLE_FRONT : 0, eps = 1e-6;
  const halves = m.props.map(q => info.half(q)), kinds = m.props.map((q, i) => info.kind(q, i)), master = m.props.map((q, i) => boxOf(q.x, q.y, halves[i]!));
  const dropped: DropCounts = { tree: 0, large: 0, small: 0, fence: 0, decal: 0 };
  // the house: its spot along the street and its street edge kept, shifted in only as far as it must
  const hi = kinds.indexOf('house'), hq = hi >= 0 ? m.props[hi]! : null, hh = hi >= 0 ? halves[hi]! : null;
  let X = knotMap([[0, 0], [m.w, w]]), Y = knotMap([[lo, lo], [0, 0], [m.d, d]]), hx = 0, hy = 0;
  if (hq && hh) {
    if (2 * hh.ha > w + eps || 2 * hh.hb > d + eps) return null;
    // its spot along the street as a share of the free width (a house in the middle stays in the middle, one by an edge stays by it)
    const g0 = Math.max(0, hq.x - hh.ha), g1 = Math.max(0, m.w - hq.x - hh.ha), G = w - 2 * hh.ha;
    hx = G <= 0 ? w / 2 : hh.ha + (g0 + g1 > 1e-9 ? (G * g0) / (g0 + g1) : G / 2);
    hy = 2 * hh.hb >= d ? d / 2 : clamp(hq.y, hh.hb, d - hh.hb);
    X = knotMap([[0, 0], [hq.x - hh.ha, hx - hh.ha], [hq.x + hh.ha, hx + hh.ha], [m.w, w]]);
    Y = knotMap([[lo, lo], [0, 0], [hq.y - hh.hb, hy - hh.hb], [hq.y + hh.hb, hy + hh.hb], [m.d, d]]);
  }
  /** a prop's centre on the derived lot: the edge of its footprint that faces the house (or its centre, with no house) mapped, its size kept */
  const place = (q: PresetProp, h: Half): { x: number; y: number } => {
    if (!hq) return { x: X(q.x), y: Y(q.y) };
    const x = q.x >= hq.x ? X(q.x - h.ha) + h.ha : X(q.x + h.ha) - h.ha, y = q.y >= hq.y ? Y(q.y - h.hb) + h.hb : Y(q.y + h.hb) - h.hb;
    return { x, y };
  };
  const kept: { i: number; q: PresetProp; b: Box }[] = [];
  const inside = (b: Box) => b[0] >= -eps && b[2] <= w + eps && b[1] >= lo - eps && b[3] <= d + eps;
  /** whether a footprint would overlap a kept one it did not overlap on the master */
  const clash = (i: number, b: Box) => kept.some(k => overlap(k.b, b) && !overlap(master[k.i]!, master[i]!));
  if (hq && hh) kept.push({ i: hi, q: { ...hq, x: r3(hx), y: r3(hy) }, b: boxOf(hx, hy, hh) });
  // the fences: those on an edge follow it (corners first, then the edges), the others are placed as props
  const fences = m.props.map((_, i) => i).filter(i => kinds[i] === 'fence').map(i => {
    const b = master[i]!, L = b[0] <= EDGE, R = b[2] >= m.w - EDGE, F = b[1] <= EDGE, B = b[3] >= m.d - EDGE;
    return { i, L, R, F, B, n: +(L || R) + +(F || B) };
  }).sort((a, b) => b.n - a.n || a.i - b.i);
  for (const f of fences) {
    const q = m.props[f.i]!, h = halves[f.i]!;
    const p = f.n ? { x: f.R && !f.L ? q.x + dx : q.x, y: f.B && !f.F ? q.y + dy : q.y } : place(q, h), b = boxOf(p.x, p.y, h);
    if (!inside(b) || clash(f.i, b)) { dropped.fence++; continue; }
    kept.push({ i: f.i, q: { ...q, x: r3(p.x), y: r3(p.y) }, b });
  }
  // the rest in keep order: small props, large props, trees (a conflict drops the later one)
  for (const k of KEEP) for (let i = 0; i < m.props.length; i++) {
    if (kinds[i] !== k) continue;
    const q = m.props[i]!, h = halves[i]!, p = place(q, h);
    if (2 * h.ha > w + eps || 2 * h.hb > d - lo + eps) { dropped[k]++; continue; }
    // shifted in when it pokes out a little (never far: a prop that would travel more than SHIFT tiles goes)
    const x = clamp(p.x, h.ha, w - h.ha), y = clamp(p.y, lo + h.hb, d - h.hb), b = boxOf(x, y, h);
    if (Math.abs(x - p.x) > SHIFT || Math.abs(y - p.y) > SHIFT || clash(i, b)) { dropped[k]++; continue; }
    kept.push({ i, q: { ...q, x: r3(x), y: r3(y) }, b });
  }
  const props = kept.sort((a, b) => a.i - b.i).map(k => k.q);
  // the ground patches and lines mapped and kept in the lot; the decals mapped, dropped only when they leave it
  const fit = (a: readonly number[]) => { const o: number[] = []; for (let i = 0; i + 1 < a.length; i += 2) o.push(r3(clamp(X(a[i]!), 0, w)), r3(clamp(Y(a[i + 1]!), 0, d))); return o; };
  const patches: PresetPatch[] = m.patches.map(a => ({ ...a, pts: fit(a.pts), ...(a.lines ? { lines: fit(a.lines) } : {}) }));
  let decals: PresetDecal[] | undefined;
  if (m.decals) {
    decals = [];
    for (const c of m.decals) { const x = X(c.x), y = Y(c.y); if (x < -eps || x > w + eps || y < lo - eps || y > d + eps) dropped.decal++; else decals.push({ ...c, x: r3(x), y: r3(y) }); }
  }
  const preset: LotPreset = { id, use: m.use, state: m.state, w, d, props, patches, ...(m.road !== undefined ? { road: m.road } : {}), ...(m.approved ? { approved: true } : {}), ...(m.whole ? { whole: true } : {}), ...(decals ? { decals } : {}), derived: m.id };
  return { preset, dropped };
}

/** the largest size of a type and state (the master's): the greatest area, then the greatest width */
export function largestSize<T extends DeriveSize>(sizes: readonly T[]): T | undefined {
  let best: T | undefined;
  for (const s of sizes) if (!best || s.bw * s.bd > best.bw * best.bd || (s.bw * s.bd === best.bw * best.bd && s.bw > best.bw)) best = s;
  return best;
}
/** whether a preset is a master: a lab preset (a road), not derived, laid out on the largest size of its type and state */
export function isMaster(p: LotPreset, sizes: readonly DeriveSize[]): boolean {
  const L = largestSize(sizes), b = bucketOf(p.w, p.d);
  return p.road !== undefined && !p.derived && p.use !== 'farm' && !!L && b.w === L.bw && b.d === L.bd;
}
/** a preset after a hand edit: a derived one is detached from its master (it keeps the master's id as detached, and is the owner's now) */
export function detach(p: LotPreset): LotPreset {
  if (!p.derived) return p;
  const { derived, ...rest } = p;
  return { ...rest, detached: derived, curated: true };
}
/** the same cell: the type, state, road angle and size bucket */
const sameCell = (p: LotPreset, m: LotPreset, s: DeriveSize) => { const b = bucketOf(p.w, p.d); return p.use === m.use && p.state === m.state && p.road === m.road && b.w === s.bw && b.d === s.bd; };
/** a master's derive: every smaller size of its type and state (one that fits inside the master's bucket) derived, except a size the owner
 *  detached from it (a hand edit) or one its house does not fit; upsert: the derived presets (each replacing its own id); remove: the master's
 *  derived presets of sizes no longer derived; covered and skipped: the report */
export function deriveAll(m: LotPreset, sizes: readonly DeriveSize[], info: DeriveInfo, all: readonly LotPreset[]): { upsert: LotPreset[]; remove: string[]; covered: { key: string; dropped: DropCounts }[]; skipped: { key: string; why: string }[] } {
  const mb = bucketOf(m.w, m.d), upsert: LotPreset[] = [], covered: { key: string; dropped: DropCounts }[] = [], skipped: { key: string; why: string }[] = [];
  for (const s of sizes) {
    const key = `${s.bw}x${s.bd}`;
    if (s.bw === mb.w && s.bd === mb.d) continue;
    if (s.bw > mb.w || s.bd > mb.d) { skipped.push({ key, why: 'larger than the master' }); continue; }
    if (all.some(p => p.detached === m.id && sameCell(p, m, s))) { skipped.push({ key, why: 'hand-edited (detached)' }); continue; }
    const r = derivePreset(m, s.w, s.d, info, derivedId(m.id, s.bw, s.bd));
    if (!r) { skipped.push({ key, why: 'the house does not fit' }); continue; }
    upsert.push(r.preset); covered.push({ key, dropped: r.dropped });
  }
  const keep = new Set(upsert.map(p => p.id));
  return { upsert, remove: all.filter(p => p.derived === m.id && !keep.has(p.id)).map(p => p.id), covered, skipped };
}
