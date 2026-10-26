// Hand-drawn vector shadows (T142, the owner, 2026-10-26: "can you put a smart opus on the shadows to vector draw each shadow individually
// for all assets?"). Every library picture has its own two shapes on the ground (shadow-shapes.json, drafted from its picture by
// scripts/dev/draft-shadows.mjs, then corrected by eye on the audit sheets: src/game/dev/shadow-hints.json):
//   - the CONTACT shape(s): where the picture meets the ground (a building's walls, a bench's legs, a sign's two posts), dark and tight;
//   - the CAST shape(s): the picture's silhouette laid on the ground away from the sun (the upper right: the shadow falls at 145 degrees on
//     screen), each vertex keeping its foot point and its height, so the shape follows the gear menu's sun (angle, length) like the old
//     silhouette shadows did, and a mirrored picture still casts to the lower left.
// Coordinates are the picture's display px (world px at scale 1) about its anchor, x right and y down the screen: a ground point (x, y) is the
// spot of the 2:1 ground plane drawn there. A cast vertex (x, y, h) is the ground point (x, y) under a point h px up the picture, and lands at
// (x + h * sx, y + h * sy) for the sun's shear (cast-shadow.ts castShear). A mirrored sprite mirrors x.
// The GPU draws them (gl.ts drawVector) as filled triangles with a feathered rim, from one mesh texture built here once, one instance per
// sprite. Sprites with no entry (the walkers' animated frames, new art) keep T141's shadows (shadow-shape.ts and the silhouette cast).
// Pure: importable from node (tests, the draft) and the game.
import SHAPES from './shadow-shapes.json';
import { CAST, castShear } from './cast-shadow';

/** one picture's shadow (shadow-shapes.json). Rings are flat arrays; a cast ring wound the other way round is a hole (the gap under a bench) */
export interface VectorShadow {
  /** contact rings [x, y, x, y, ...] (ground points, display px about the anchor) */
  c?: number[][];
  /** cast rings [x, y, h, x, y, h, ...] (ground foot point and height, display px) */
  s?: number[][];
  /** the cast shape's soft rim at its foot (display px; default 3) and its growth per px of height (the penumbra; default 0.04) */
  f?: number; p?: number;
  /** the contact shape's soft rim (display px; default from its size) and darkness (0..1; default 0.7) */
  fc?: number; kc?: number;
  /** the contact shape's lean along the sun, as a height (display px; default 8): it moves like a point that high */
  cl?: number;
  /** the cast shape's darkness at its foot (0..1, times the gear menu's strength; default 1) and how much lighter it gets at its tip (default 0.3) */
  ks?: number; fade?: number;
  /** the same shapes as another picture (a variation that differs only in colour) */
  same?: string;
  /** why it was drawn by hand */
  n?: string;
}
export const VECTOR_SHADOWS: Readonly<Record<string, VectorShadow>> = SHAPES as Record<string, VectorShadow>;

/** library ids that keep T141's shadows on purpose (vector-shadow test: every other drawn picture has an entry), by prefix or exact id */
export const VECTOR_FALLBACK: readonly { id: string; why: string }[] = [
  { id: 'walker', why: 'the walkers, the crowd and the golfers: thousands of animated frames; their silhouette cast moves with their legs' },
];

/** a built mesh: vertices (VERTEX_FLOATS each) and triangle indices, and each picture's range in the indices */
/** a picture's two ranges in the indices: as drawn, and mirrored (a mirrored sprite: its x mirrored, the sun's side kept, so its rings are
 *  filled where they land then) */
export interface VectorRange { first: number; count: number; mfirst: number; mcount: number;
  /** the far copies (the district zoom, where a shadow is a few px: each ring cut to a few points, no holes, no rim), drawn and mirrored */
  ffirst: number; fcount: number; fmfirst: number; fmcount: number }
export interface VectorMesh { verts: Float32Array; idx: Uint32Array; nVerts: number; nIdx: number; at: Map<string, VectorRange> }
/** floats per mesh vertex: x, y, h (display px), kind (0 contact, 1 cast), core (darkness), edge (1 on the shape, 0 at the rim's outside), 2 spare */
export const VERTEX_FLOATS = 8;

const D = { f: 3, p: 0.04, kc: 0.7, cl: 8, ks: 1, fade: 0.3 };

type P = [number, number];
const area = (r: P[]) => { let a = 0; for (let i = 0, n = r.length; i < n; i++) { const p = r[i]!, q = r[(i + 1) % n]!; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; };
const cross = (o: P, a: P, b: P) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
function inside(pt: P, r: P[]) {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i]!, b = r[j]!; if ((a[1] > pt[1]) !== (b[1] > pt[1]) && pt[0] < (b[0] - a[0]) * (pt[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; }
  return c;
}
function segsCross(a: P, b: P, c: P, d: P) {
  const d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}
/** triangulate a polygon (indices into pts) with holes, all wound positive for the outer and negative for the holes: the holes are bridged into
 *  the outer ring, then ears are clipped. Returns triangles as index triples */
export function triangulate(pts: P[], outer: number[], holes: number[][]): number[] {
  let ring = outer.slice();
  // bridge each hole, rightmost first, to the nearest ring vertex it can see
  const hs = holes.map(h => { let m = 0; for (let i = 1; i < h.length; i++) if (pts[h[i]!]![0] > pts[h[m]!]![0]) m = i; return { h, m }; }).sort((a, b) => pts[b.h[b.m]!]![0] - pts[a.h[a.m]!]![0]);
  for (let k = 0; k < hs.length; k++) {
    const { h, m } = hs[k]!, M = pts[h[m]!]!;
    const edges: [P, P][] = [];
    for (let i = 0; i < ring.length; i++) edges.push([pts[ring[i]!]!, pts[ring[(i + 1) % ring.length]!]!]);
    for (let q = k; q < hs.length; q++) { const r = hs[q]!.h; for (let i = 0; i < r.length; i++) edges.push([pts[r[i]!]!, pts[r[(i + 1) % r.length]!]!]); }
    let best = -1, bd = Infinity;
    for (let i = 0; i < ring.length; i++) {
      const Pp = pts[ring[i]!]!, dd = (Pp[0] - M[0]) ** 2 + (Pp[1] - M[1]) ** 2; if (dd >= bd) continue;
      if (edges.some(([a, b]) => segsCross(M, Pp, a, b))) continue;
      best = i; bd = dd;
    }
    if (best < 0) continue; // (cannot happen for a hole inside its ring; dropped rather than drawn wrong)
    const loop = [...h.slice(m), ...h.slice(0, m), h[m]!];
    ring = [...ring.slice(0, best + 1), ...loop, ...ring.slice(best)];
  }
  // ear clipping (O(n^2), n is small); a ring wound positive has its ears with cross > 0
  const out: number[] = [], r = ring.slice();
  let guard = r.length * r.length + 10;
  while (r.length > 3 && guard-- > 0) {
    let cut = -1, bestCross = Infinity, fallback = -1;
    for (let i = 0; i < r.length; i++) {
      const a = pts[r[(i + r.length - 1) % r.length]!]!, b = pts[r[i]!]!, c = pts[r[(i + 1) % r.length]!]!, cr = cross(a, b, c);
      if (Math.abs(cr) < bestCross) { bestCross = Math.abs(cr); fallback = i; }
      if (cr <= 1e-9) continue;
      let ok = true;
      for (let j = 0; j < r.length && ok; j++) {
        const pj = r[j]!; if (pj === r[(i + r.length - 1) % r.length] || pj === r[i] || pj === r[(i + 1) % r.length]) continue;
        const p = pts[pj]!; if ((p[0] === a[0] && p[1] === a[1]) || (p[0] === b[0] && p[1] === b[1]) || (p[0] === c[0] && p[1] === c[1])) continue;
        if (cross(a, b, p) >= 0 && cross(b, c, p) >= 0 && cross(c, a, p) >= 0) ok = false;
      }
      if (ok) { cut = i; break; }
    }
    if (cut < 0) cut = fallback; // a degenerate corner: clip its flattest vertex
    const ia = r[(cut + r.length - 1) % r.length]!, ib = r[cut]!, ic = r[(cut + 1) % r.length]!;
    if (cross(pts[ia]!, pts[ib]!, pts[ic]!) > 1e-9) out.push(ia, ib, ic);
    r.splice(cut, 1);
  }
  if (r.length === 3 && cross(pts[r[0]!]!, pts[r[1]!]!, pts[r[2]!]!) > 1e-9) out.push(r[0]!, r[1]!, r[2]!);
  return out;
}

/** the shear the shapes were drafted for (cast-shadow.json's sun): a cast ring is triangulated and rimmed where it lies under this sun */
export const DRAFT_SHEAR = castShear(CAST);

/** the extra soft rim every contact (blob) shadow gets, display px (the owner, 2026-10-26: "make the blob shadows more blurry across the
 *  board. like 2px") */
export const BLOB_BLUR = 2;
/** add one entry's triangles to the growing mesh: its contact rings, then its cast rings (outer rings and holes by winding), each filled and
 *  rimmed outward with its feather; far: the far copy (each ring cut to FAR_POINTS, no holes, no rim) */
function addEntry(e: VectorShadow, V: number[], I: number[], mirror: boolean, far = false) {
  const sx = DRAFT_SHEAR.sx, sy = DRAFT_SHEAR.sy;
  // mirrored: every x negated and every ring reversed (so outer rings and holes keep their winding)
  const mir = (rings: number[][], stride: number) => !mirror ? rings : rings.map(r => { const o: number[] = []; for (let i = r.length - stride; i >= 0; i -= stride) { o.push(-r[i]!); for (let k = 1; k < stride; k++) o.push(r[i + k]!); } return o; });
  const kinds: [0 | 1, number[][], number][] = [[0, mir(e.c ?? [], 2), 2], [1, mir(e.s ?? [], 3), 3]];
  for (const [kind, rings, stride] of kinds) {
    if (!rings.length) continue;
    // the ground rings as drawn under the draft sun (x, y), with each vertex's base and height
    const R = rings.map(fl => { const out: { p: P; x: number; y: number; h: number }[] = []; for (let i = 0; i + stride - 1 < fl.length; i += stride) { const x = fl[i]!, y = fl[i + 1]!, h = kind ? fl[i + 2]! : (e.cl ?? D.cl); out.push({ p: [x + h * sx, y + h * sy], x, y, h }); }
      // (a contact ring is always filled: wound positive whichever way it was drawn)
      return !kind && area(out.map(v => v.p)) < 0 ? out.reverse() : out; }).filter(r => r.length >= 3 && Math.abs(area(r.map(v => v.p))) > 0.5)
      .filter(r => !far || area(r.map(v => v.p)) > 0).map(r => far ? cut(r, FAR_POINTS) : r);
    if (!R.length) continue;
    const hMax = Math.max(1, ...R.flatMap(r => r.map(v => v.h)));
    // contact: its rim from its size (a post's spot stays tight, a building's base soft)
    let size = 0; if (!kind) { const xs = R.flatMap(r => r.map(v => v.p[0])), ys = R.flatMap(r => r.map(v => v.p[1])); size = Math.min(Math.max(...xs) - Math.min(...xs), 2 * (Math.max(...ys) - Math.min(...ys))); }
    const fc = (e.fc ?? Math.max(1.5, Math.min(8, size * 0.12))) + BLOB_BLUR;
    const pts: P[] = [], base = V.length / VERTEX_FLOATS, ringIdx: number[][] = [];
    const vertex = (x: number, y: number, h: number, core: number, edge: number) => { V.push(x, y, h, kind, core, edge, 0, 0); };
    for (const r of R) {
      const idx: number[] = [];
      for (const v of r) { idx.push(pts.length); pts.push(v.p); const core = kind ? (e.ks ?? D.ks) * (1 - (e.fade ?? D.fade) * Math.min(1, v.h / hMax)) : (e.kc ?? D.kc); vertex(v.x, v.y, v.h, core, 1); }
      ringIdx.push(idx);
    }
    // fill: each outer ring (positive) with the holes (negative) whose first point it holds
    const outers = ringIdx.filter(r => area(r.map(i => pts[i]!)) > 0), holes = ringIdx.filter(r => area(r.map(i => pts[i]!)) < 0);
    for (const o of outers) {
      const op = o.map(i => pts[i]!), mine = holes.filter(h => inside(pts[h[0]!]!, op));
      for (const t of triangulate(pts, o, mine)) I.push(base + t);
    }
    // the rim: each ring's vertices pushed outward (away from the filled side) along the mitred normal by the feather, edge 0 (none far off:
    // a few px of shadow need no soft edge)
    if (!far) for (const ring of ringIdx) {
      const n = ring.length, rimAt = V.length / VERTEX_FLOATS;
      for (let i = 0; i < n; i++) {
        const a = pts[ring[(i + n - 1) % n]!]!, b = pts[ring[i]!]!, c = pts[ring[(i + 1) % n]!]!;
        const n1 = norm(b[1] - a[1], -(b[0] - a[0])), n2 = norm(c[1] - b[1], -(c[0] - b[0]));
        const m = norm(n1[0] + n2[0], n1[1] + n2[1]), cosA = Math.max(0.4, m[0] * n2[0] + m[1] * n2[1]);
        const o = (base + ring[i]!) * VERTEX_FLOATS, h = V[o + 2]!, w = kind ? (e.f ?? D.f) + (e.p ?? D.p) * h : fc, L = w / cosA;
        vertex(V[o]! + m[0] * L, V[o + 1]! + m[1] * L, h, V[o + 4]!, 0);
      }
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n, a = base + ring[i]!, b = base + ring[j]!, oa = rimAt + i, ob = rimAt + j;
        I.push(a, b, ob, a, ob, oa);
      }
    }
  }
}
const norm = (x: number, y: number): P => { const l = Math.hypot(x, y); return l > 1e-9 ? [x / l, y / l] : [0, 0]; };
/** the far copy's points a ring */
const FAR_POINTS = 8;
/** a ring cut to at most n of its points (Douglas-Peucker on where they land, the tolerance raised until it fits) */
function cut<T extends { p: P }>(r: T[], n: number): T[] {
  if (r.length <= n) return r;
  const keep = (tol: number) => {
    const k = new Uint8Array(r.length); let i0 = 0, i1 = 0, best = -1;
    for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) { const d = (r[i]!.p[0] - r[j]!.p[0]) ** 2 + (r[i]!.p[1] - r[j]!.p[1]) ** 2; if (d > best) { best = d; i0 = i; i1 = j; } }
    const dp = (a: number, b: number) => { // a..b along the ring (b may wrap past the end)
      let far = -1, at = -1; const A = r[a % r.length]!.p, B = r[b % r.length]!.p;
      for (let q = a + 1; q < b; q++) { const Q = r[q % r.length]!.p, d = segDist(Q, A, B); if (d > far) { far = d; at = q; } }
      if (far > tol) { k[at % r.length] = 1; dp(a, at); dp(at, b); }
    };
    k[i0] = 1; k[i1] = 1; dp(i0, i1); dp(i1, i0 + r.length);
    return r.filter((_, i) => k[i]);
  };
  let tol = 1, out = keep(tol); while (out.length > n) { tol *= 1.4; out = keep(tol); }
  return out.length >= 3 ? out : r.slice(0, 3);
}
function segDist(p: P, a: P, b: P) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy; if (!l) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l)); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

/** build the mesh of every entry (each `same` entry shares its source's range) */
export function buildVectorMesh(shapes: Readonly<Record<string, VectorShadow>> = VECTOR_SHADOWS): VectorMesh {
  const V: number[] = [], I: number[] = [], at = new Map<string, VectorRange>();
  for (const [id, e] of Object.entries(shapes)) {
    if (e.same) continue;
    // (an entry with no shapes draws none: a flat picture)
    const first = I.length; addEntry(e, V, I, false); const mfirst = I.length; addEntry(e, V, I, true);
    const ffirst = I.length; addEntry(e, V, I, false, true); const fmfirst = I.length; addEntry(e, V, I, true, true);
    at.set(id, { first, count: mfirst - first, mfirst, mcount: ffirst - mfirst, ffirst, fcount: fmfirst - ffirst, fmfirst, fmcount: I.length - fmfirst });
  }
  for (const [id, e] of Object.entries(shapes)) if (e.same) { const r = at.get(e.same); if (r) at.set(id, r); }
  return { verts: Float32Array.from(V), idx: Uint32Array.from(I), nVerts: V.length / VERTEX_FLOATS, nIdx: I.length, at };
}
let MESH: VectorMesh | null = null;
/** the game's mesh, built on first use */
export function vectorMesh(): VectorMesh { return MESH ??= buildVectorMesh(); }
/** T172: the mesh's vertices and indices let go once they are on the GPU (gl.ts initVector; about 11 MB): the ranges (`at`) and the counts
 *  stay for the sprites. Only for a page that uploads the mesh once (the game) */
export function releaseVectorMeshData() { if (MESH) MESH = { ...MESH, verts: new Float32Array(0), idx: new Uint32Array(0) }; }
/** does a library id have a vector shadow (an entry with at least one shape) */
export function hasVectorShadow(id: string): boolean { return vectorMesh().at.has(id); }
/** is a library id on the fallback list (keeps T141's shadows on purpose) */
export function vectorFallback(id: string, kind: string): string | null {
  for (const f of VECTOR_FALLBACK) if (f.id === kind || f.id === id || id.startsWith(f.id + ':')) return f.why;
  return null;
}
