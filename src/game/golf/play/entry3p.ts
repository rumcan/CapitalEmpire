// The course file (export3p.ts, the map importer's JSON) as the one entry of Cinderlinks' course list the view loads (T416). The same sums as
// packages/cinderlinks/tools/course-import.mjs convert(), which the view's own build and its harness use; that one runs in Node (zlib, Buffer), this
// one in the page (the platform's DecompressionStream through terrarium.ts). The y axis is flipped: the file's y grows north, the view's south
// (protocol3p.ts). Keep the two in step: a change to convert() belongs here too. Pure TS, no DOM.
import { PACKED, fromBase64, inflate, toBase64, type HeightPack } from '../osm/terrarium';
import type { CourseFile } from './export3p';
import type { LieGrid } from './lies3p';

/** one hole as the view reads it: its number, par, length (m), its line and its pin as flat [x, y, x, y, ...] in metres, y south */
export interface EntryHole { n: number; par: number; lenM: number; line: number[]; pin: [number, number] }
/** the heights as the view reads them: the 16-bit units, unpacked (base64 of a little-endian Uint16Array), with the pack's frame */
export interface EntryHeights { x0: number; y0: number; step: number; w: number; h: number; base: number; q: number; d: string; reliefM: number; src: string; credit: string }
/** the entry: the course's id and names, its holes, its shapes by kind (T tee, F fairway, G green, B bunker, W water; each a flat ring), the
 *  streams, and the heights (null: flat) */
export interface CourseEntry {
  id: string; name: string; place: string; osm: string; credit: string; licence: string;
  holes: EntryHole[]; polys: Record<'T' | 'F' | 'G' | 'B' | 'W', number[][]>; streams: number[][]; hg: EntryHeights | null;
  /** T422: the host's lies over the course (lies3p.ts), so the view draws the first cut, the rough and the fescue where the model reads them; absent: the view's own */
  lk?: LieGrid;
}

const r1 = (v: number): number => Math.round(v * 10) / 10;
const KIND: Record<string, 'T' | 'F' | 'G' | 'B' | 'W'> = { tee: 'T', fairway: 'F', green: 'G', bunker: 'B', water_hazard: 'W', lateral_water_hazard: 'W', water: 'W' };

/** the heights unpacked to their 16-bit units (the predictive delta and zigzag undone), as course-import.mjs unpackHeights */
export async function unpackHeights3p(p: (HeightPack & { label?: string; src?: string; credit?: string }) | undefined | null): Promise<EntryHeights | null> {
  if (!p || p.v !== 1) return null;
  const n = p.w * p.h, out = new Uint16Array(n), known = PACKED.get(p);
  if (known && known.length === n) out.set(known);   // (T438: a pack made in this visit: its samples as they were packed, the same as decoding them)
  else {
    const planes = await inflate(fromBase64(p.d), 'deflate-raw');
    if (planes.length !== 2 * n) throw new Error('a height pack of the wrong size');
    const u = new Int32Array(n);
    for (let j = 0; j < p.h; j++) for (let i = 0; i < p.w; i++) {
      const k = j * p.w + i, z = planes[k]! | (planes[n + k]! << 8), r = z & 1 ? -((z + 1) >> 1) : z >> 1;
      const pred = i > 0 && j > 0 ? u[k - 1]! + u[k - p.w]! - u[k - p.w - 1]! : i > 0 ? u[k - 1]! : j > 0 ? u[k - p.w]! : 0;
      u[k] = pred + r; out[k] = u[k]!;
    }
  }
  let lo = 65535, hi = 0; for (let k = 0; k < n; k++) { const v = out[k]!; if (v < lo) lo = v; if (v > hi) hi = v; }
  return { x0: p.x0, y0: p.y0, step: p.step, w: p.w, h: p.h, base: p.base, q: p.q, d: toBase64(new Uint8Array(out.buffer)), reliefM: +((hi - lo) * p.q).toFixed(1),
    src: p.label || p.src || '', credit: p.credit || '' };
}

type Pt2 = [number, number];
interface LooseFeature { polys?: { outer?: Pt2[] }[]; line?: Pt2[]; pos?: Pt2; ref?: number; par?: number }

/** the course file as the view's course entry; throws when it has no hole lines (the view cannot guess holes) */
export async function courseEntry3p(file: CourseFile): Promise<CourseEntry> {
  const F = (file.features ?? {}) as Record<string, LooseFeature[] | undefined>;
  const polys: CourseEntry['polys'] = { T: [], F: [], G: [], B: [], W: [] };
  for (const [kind, key] of Object.entries(KIND)) for (const ft of F[kind] ?? []) for (const p of ft.polys ?? []) {
    if (!p.outer || p.outer.length < 3) continue;
    const ring: number[] = []; for (const q of p.outer) ring.push(r1(q[0]), r1(-q[1]));
    polys[key].push(ring);
  }
  const streams: number[][] = [];
  for (const ft of F.waterway ?? []) { if (!ft.line || ft.line.length < 2) continue; const l: number[] = []; for (const q of ft.line) l.push(r1(q[0]), r1(-q[1])); streams.push(l); }
  const pins = (F.pin ?? []).filter(p => p.pos).map(p => [p.pos![0], -p.pos![1]] as Pt2);
  const byRef = new Map<number, EntryHole>();
  for (const h of F.hole ?? []) { // (the first line of each number)
    if (!h.line || h.line.length < 2 || !Number.isFinite(h.ref) || byRef.has(h.ref!)) continue;
    const line: number[] = []; for (const q of h.line) line.push(r1(q[0]), r1(-q[1]));
    const ex = line[line.length - 2]!, ey = line[line.length - 1]!;
    let pin: Pt2 = [ex, ey], bd = 40; for (const p of pins) { const d = Math.hypot(p[0] - ex, p[1] - ey); if (d < bd) { bd = d; pin = [r1(p[0]), r1(p[1])]; } }
    let len = 0; for (let k = 2; k < line.length; k += 2) len += Math.hypot(line[k]! - line[k - 2]!, line[k + 1]! - line[k - 1]!);
    const par = h.par !== undefined && h.par >= 3 && h.par <= 5 ? h.par : len > 420 ? 5 : len > 220 ? 4 : 3;
    byRef.set(h.ref!, { n: h.ref!, par, lenM: Math.round(len), line, pin });
  }
  const holes = [...byRef.values()].sort((a, b) => a.n - b.n);
  if (!holes.length) throw new Error('the course has no hole lines');
  const m = (file.meta ?? {}) as { id?: string; course?: { name?: string; osm?: string }; place?: string; credit?: string; licence?: string };
  return {
    id: m.id || 'painted', name: m.course?.name || m.id || 'Course', place: m.place || '', osm: m.course?.osm || '', credit: m.credit || '', licence: m.licence || '',
    holes, polys, streams, hg: await unpackHeights3p(file.height as (HeightPack & { label?: string }) | undefined),
  };
}
