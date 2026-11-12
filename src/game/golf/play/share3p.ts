// T434 (docs/CINDERLINKS-PORT.md, course sharing; for now a file, no server): a course written to a file that anyone can load and play with their own golfer.
// The file holds what the view is sent for a course (the course file of export3p.ts, the placed things of features3p.ts, the biome, the course type, the seed
// its fine detail grows from), the course's name, holes and par, and a hash of the course file (courseHash) so a ghost round (ghost3p.ts) can say which
// course it was played on. Loading it gives both halves: the `course` message for the view, and the course the golf model plays (shareView: the lies read off the
// file's outlines, the holes off its hole lines, the ground off its packed heights), in one frame, so a shot decided by the model lands where the view draws it.
// Pure TS, no DOM.
import type { CourseView, Lie, PlayHole, Pt } from './types';
import type { HeightAt } from './roll';
import { toMetres, toTiles, type CourseFile, type Frame3p } from './export3p';
import type { FeaturesFile } from './features3p';
import { PROTOCOL_V, type CourseMsg, type CourseType } from './protocol3p';
import { courseEntry3p } from './entry3p';
import { lieGrid3p } from './lies3p';
import { heightAtM, unpackGrid } from '../osm/terrarium';
import { inRing } from '../osm/geom';
import type { JFeature, JPt } from '../osm/types';

export const SHARE_KIND = 'capitalempire-course';
/** a shared course file's version: a file of another version is refused */
export const SHARE_V = 1;

/** a shared course: what the view is sent for it, its name, holes and par, and its course file's hash */
export interface CourseShare {
  v: 1; kind: typeof SHARE_KIND; name: string; holes: number; par: number; biome: string; type: CourseType; seed: number;
  file: CourseFile; features: FeaturesFile | null; hash: string;
  /** who made it (free words; absent: not said) */
  by?: string;
}

/** a text's hash: FNV-1a, 32 bits, as eight hex digits (the same on every machine) */
export function hashText(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}
/** a value as JSON with its object keys in order, so the same data always writes the same text */
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v as object).sort().filter(k => (v as Record<string, unknown>)[k] !== undefined).map(k => JSON.stringify(k) + ':' + canonical((v as Record<string, unknown>)[k])).join(',') + '}';
  return JSON.stringify(v ?? null);
}
/** the course file's hash: which course a ghost round was played on */
export const courseHash = (file: CourseFile): string => hashText(canonical(file));

/** the holes of a course file: each hole line by its number (the first line of a number), its par (as tagged, else by its length) */
function holeLines(file: CourseFile): { n: number; par: 3 | 4 | 5; line: JPt[] }[] {
  const by = new Map<number, { n: number; par: 3 | 4 | 5; line: JPt[] }>();
  for (const h of file.features.hole ?? []) {
    if (!h.line || h.line.length < 2 || !Number.isFinite(h.ref) || by.has(h.ref!)) continue;
    let len = 0; for (let k = 1; k < h.line.length; k++) len += Math.hypot(h.line[k]![0] - h.line[k - 1]![0], h.line[k]![1] - h.line[k - 1]![1]);
    const par = h.par === 3 || h.par === 4 || h.par === 5 ? h.par : len > 420 ? 5 : len > 220 ? 4 : 3;
    by.set(h.ref!, { n: h.ref!, par, line: h.line });
  }
  return [...by.values()].sort((a, b) => a.n - b.n);
}

/** a course to share: the course file and its placed things, the biome, type and seed the view is sent, and its name */
export function shareOf(file: CourseFile, features: FeaturesFile | null, o: { name: string; biome: string; type: CourseType; seed: number; by?: string }): CourseShare {
  const hs = holeLines(file);
  return { v: SHARE_V, kind: SHARE_KIND, name: o.name, holes: hs.length, par: hs.reduce((a, h) => a + h.par, 0), biome: o.biome, type: o.type, seed: o.seed | 0,
    file, features, hash: courseHash(file), ...(o.by ? { by: o.by } : {}) };
}
/** the file's text */
export const shareText = (s: CourseShare): string => JSON.stringify(s);
/** a shared course read back from a file's text, or why it cannot be used */
export function readShare(text: string): { share: CourseShare } | { why: string } {
  let o: unknown; try { o = JSON.parse(text); } catch { return { why: 'The file is not a course file (it does not read as JSON)' }; }
  const s = o as Partial<CourseShare>;
  if (!s || s.kind !== SHARE_KIND) return { why: 'The file is not a shared course' };
  if (s.v !== SHARE_V) return { why: `The course file is of another version (${String(s.v)}; this game reads ${SHARE_V})` };
  if (!s.file || typeof s.file !== 'object' || !s.file.features) return { why: 'The course file has no course in it' };
  if (!holeLines(s.file).length) return { why: 'The course has no holes' };
  if (courseHash(s.file) !== s.hash) return { why: 'The course file has been changed since it was made (its hash does not match)' };
  return { share: s as CourseShare };
}

/** the frame a shared course is played in: its centre at this tile (the model's tiles are only a frame here: nothing of the player's own map is used) */
export const SHARE_FRAME: Frame3p = { cx: 1024, cy: 1024 };

/** the lies by kind, the order a point is asked them in (a green over the fairway it sits in, and so on) */
const LIE_KINDS: readonly [string, Lie][] = [['green', 'green'], ['tee', 'tee'], ['bunker', 'bunker'], ['water', 'water'], ['water_hazard', 'water'], ['lateral_water_hazard', 'water'], ['fairway', 'fairway'], ['rough', 'rough']];

/** the course the golf model plays for a shared course, in SHARE_FRAME: each point's lie read off the file's outlines (inside the land and on none: rough;
 *  outside the land: out of bounds), the holes off its hole lines (the tee the line's first point, the pin the nearest pin to its end), and the ground's
 *  height off its packed grid (none: flat) */
export async function shareView(s: CourseShare): Promise<{ view: CourseView; frame: Frame3p; height: HeightAt }> {
  const f = SHARE_FRAME, F = s.file.features;
  type Ring = { r: JPt[]; holes: JPt[][]; x0: number; y0: number; x1: number; y1: number };
  const ringOf = (outer: JPt[], inner: JPt[][]): Ring => { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const p of outer) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; } return { r: outer, holes: inner, x0, y0, x1, y1 }; };
  const byKind: [Ring[], Lie][] = LIE_KINDS.map(([k, lie]) => [(F[k] ?? []).flatMap((ft: JFeature) => (ft.polys ?? []).filter(p => p.outer.length >= 3).map(p => ringOf(p.outer, p.inner ?? []))), lie]);
  const land = (s.file.boundary?.polys ?? []).map(p => ringOf(p.outer, p.inner ?? []));
  const inside = (q: Ring, X: number, Y: number): boolean => X >= q.x0 && X <= q.x1 && Y >= q.y0 && Y <= q.y1 && inRing(q.r, X, Y) && !q.holes.some(h => inRing(h, X, Y));
  const lieAt = (x: number, y: number): Lie => {
    const [X, Y] = toMetres(f, x, y);
    for (const [rings, lie] of byKind) for (const q of rings) if (inside(q, X, Y)) return lie;
    return !land.length || land.some(q => inside(q, X, Y)) ? 'rough' : 'out';
  };
  const pins = (F.pin ?? []).filter(p => p.pos).map(p => p.pos!);
  const holes: PlayHole[] = holeLines(s.file).map(h => {
    const end = h.line[h.line.length - 1]!; let pin: JPt = end, bd = 40;
    for (const p of pins) { const d = Math.hypot(p[0] - end[0], p[1] - end[1]); if (d < bd) { bd = d; pin = p; } }
    const line = h.line.map(p => toTiles(f, p[0], p[1])), pt = toTiles(f, pin[0], pin[1]);
    line[line.length - 1] = pt;
    return { n: h.n, par: h.par, tee: line[0]!, pin: pt, line };
  });
  let height: HeightAt = null;
  if (s.file.height) { const g = await unpackGrid(s.file.height); height = (x: number, y: number): number => { const [X, Y] = toMetres(f, x, y); return heightAtM(g, X, Y); }; }
  return { view: { holes, lieAt }, frame: f, height };
}

/** the `course` message the view is sent for a shared course, opening on hole `hole` (from 1); its model lies come with it, as the painted course's do */
export async function shareCourseMsg(s: CourseShare, view: CourseView, hole = 1): Promise<CourseMsg> {
  const course = await courseEntry3p(s.file) as unknown as Record<string, unknown>;
  const b = s.file.boundary?.polys?.[0]?.outer;
  if (b && b.length) {   // (T422: the model's lies over the land, so the view draws its grass where the model reads it)
    const ts = b.map(p => toTiles(SHARE_FRAME, p[0], p[1])), xs = ts.map(t => t.x), ys = ts.map(t => t.y), c: Pt = { x: SHARE_FRAME.cx, y: SHARE_FRAME.cy };
    course.lk = lieGrid3p(view, [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], c);
  }
  return { v: PROTOCOL_V, t: 'course', course, features: s.features ?? { course: String(s.file.meta?.id ?? 'shared'), v: 1, features: [] }, biome: s.biome, type: s.type, seed: s.seed, scale: 1, hole };
}
