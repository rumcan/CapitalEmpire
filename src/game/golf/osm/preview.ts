// The preview of a real course before it is imported (T358, #1003): a small top-down picture, north up, in the look of the stage-1 PNG preview
// (scripts/dev/osm-course.mjs): the boundary, rough, woods, water, fairways, tees, bunkers and greens in their colours, the hole lines white and numbered, the pins
// red. The picture is a list of drawing operations (previewOps: pure, deterministic, tested without a canvas) and a painter that runs them on a 2D canvas
// (paintPreview). Where the holes were worked out from the fairways (no hole lines on the map) the spec's holes are drawn instead, in amber, so the guess shows
// as a guess. No DOM here except the painter's context argument.
import { TILE_M } from '../types';
import { AREA_KINDS } from './fromosm';
import type { JFeature, OsmCourseJson, OsmCourseSpec } from './types';

export type PreviewOp =
  | { t: 'fill'; c: string; a: number; rings: number[][] }
  | { t: 'line'; c: string; w: number; pts: number[] }
  | { t: 'disc'; c: string; x: number; y: number; r: number }
  | { t: 'text'; s: string; x: number; y: number; c: string; size: number };

/** the stage-1 preview's colours */
export const PREVIEW_COLOURS: Readonly<Record<string, string>> = {
  background: '#1a2026', boundary: '#3c6038', rough: '#548042', wood: '#1c3e26', water: '#6098e0', water_hazard: '#2c6cd6', lateral_water_hazard: '#40b2d0', waterway: '#6098e0',
  fairway: '#88c458', tee: '#d8e276', bunker: '#f0dc98', green: '#5cec84', driving_range: '#689c54', cartpath: '#b0b0a8', path: '#928874', hole: '#ffffff', pin: '#ec3434',
  guess: '#ffc34a', rim: '#080a0c', outline: '#ececec',
};

type Pt = readonly [number, number];
/** the picture's frame: the corner of the extent (m), pixels per metre, the extent's height in pixels, and where its corner sits in the box (px) */
interface Frame { minX: number; minY: number; k: number; h: number; ox: number; oy: number }

/** the pixel of a point of the JSON (metres) in the frame: north up */
const px = (f: Frame, p: Pt): [number, number] => [f.ox + (p[0] - f.minX) * f.k, f.oy + f.h - (p[1] - f.minY) * f.k];
const flat = (f: Frame, ring: readonly Pt[]): number[] => { const o: number[] = []; for (const p of ring) { const q = px(f, p); o.push(q[0], q[1]); } return o; };

/** the extent of the picture: the boundary and every golf feature (and the spec's guessed hole lines in the JSON's frame) */
function extent(json: OsmCourseJson, extra: Pt[][]): { x0: number; y0: number; x1: number; y1: number } | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const see = (p: Pt) => { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; };
  const feat = (f: JFeature) => { if (f.pos) see(f.pos); for (const p of f.line ?? []) see(p); for (const q of f.polys ?? []) for (const p of q.outer) see(p); };
  if (json.boundary) feat(json.boundary);
  for (const k of [...AREA_KINDS, 'hole', 'pin']) for (const f of json.features[k] ?? []) feat(f);
  for (const l of extra) for (const p of l) see(p);
  return x0 <= x1 ? { x0, y0, x1, y1 } : null;
}

/** the spec's hole lines back in the JSON's metres (the spec's frame is tiles, x east and y south of the land's north-west corner, of the JSON scaled by spec.scale) */
function specLines(spec: OsmCourseSpec): { n: number; pts: Pt[] }[] {
  const o = spec.originM, k = spec.scale || 1;
  if (!o) return [];
  return spec.holes.map(h => { const pts: Pt[] = []; for (let i = 0; i + 1 < h.line.length; i += 2) pts.push([(o[0] + h.line[i]! * TILE_M) / k, (o[1] - h.line[i + 1]! * TILE_M) / k]); return { n: h.n, pts }; });
}

/** the drawing operations of a course's preview in a w x h box (CSS pixels), with a margin of 6% round it. Pass the spec to draw its holes when the map has no hole lines */
export function previewOps(json: OsmCourseJson, size: { w: number; h: number }, spec?: OsmCourseSpec | null): PreviewOp[] {
  const guess = !!spec?.derived && !(json.features.hole ?? []).length, guessed = guess && spec ? specLines(spec) : [];
  const e = extent(json, guessed.map(g => g.pts));
  const ops: PreviewOp[] = [];
  if (!e) return ops;
  const wM = Math.max(1, e.x1 - e.x0), hM = Math.max(1, e.y1 - e.y0), pad = 0.06 * Math.max(wM, hM);
  const k = Math.min(size.w / (wM + 2 * pad), size.h / (hM + 2 * pad));
  const f: Frame = { minX: e.x0 - pad, minY: e.y0 - pad, k, h: (hM + 2 * pad) * k, ox: (size.w - (wM + 2 * pad) * k) / 2, oy: (size.h - (hM + 2 * pad) * k) / 2 };
  const C = PREVIEW_COLOURS;
  const rings = (feat: JFeature): number[][][] => (feat.polys ?? []).map(p => [flat(f, p.outer), ...p.inner.map(r => flat(f, r))]);
  const fill = (kind: string, a = 1) => { for (const feat of json.features[kind] ?? []) for (const rs of rings(feat)) ops.push({ t: 'fill', c: C[kind] ?? C.rough!, a, rings: rs }); };
  const lines = (kind: string, w: number) => { for (const feat of json.features[kind] ?? []) if (feat.line) ops.push({ t: 'line', c: C[kind] ?? C.path!, w, pts: flat(f, feat.line) }); };
  if (json.boundary) for (const rs of rings(json.boundary)) ops.push({ t: 'fill', c: C.boundary!, a: 1, rings: rs });
  fill('wood', 0.85); fill('rough'); fill('driving_range'); fill('water'); lines('waterway', 1.4);
  fill('fairway'); fill('water_hazard'); fill('lateral_water_hazard'); fill('tee'); fill('bunker'); fill('green');
  lines('cartpath', 1.2); lines('path', 1);
  if (json.boundary) for (const p of json.boundary.polys ?? []) for (const r of [p.outer, ...p.inner]) ops.push({ t: 'line', c: C.outline!, w: 1, pts: flat(f, [...r, r[0]!]) });
  const holes = guess ? guessed.map(g => ({ n: g.n, pts: g.pts })) : (json.features.hole ?? []).filter(h => h.line && h.line.length >= 2).map(h => ({ n: h.ref ?? 0, pts: h.line! }));
  const colour = guess ? C.guess! : C.hole!;
  for (const h of holes) ops.push({ t: 'line', c: C.rim!, w: 3.6, pts: flat(f, h.pts) });
  for (const h of holes) ops.push({ t: 'line', c: colour, w: 1.8, pts: flat(f, h.pts) });
  for (const h of holes) { const [x, y] = px(f, h.pts[0]!); ops.push({ t: 'disc', c: C.rim!, x, y, r: 4 }, { t: 'disc', c: colour, x, y, r: 2.8 }); }
  for (const p of json.features.pin ?? []) if (p.pos) { const [x, y] = px(f, p.pos); ops.push({ t: 'disc', c: C.rim!, x, y, r: 3.8 }, { t: 'disc', c: C.pin!, x, y, r: 2.6 }); }
  for (const h of holes) if (h.n > 0) { const [x, y] = px(f, h.pts[0]!); ops.push({ t: 'text', s: String(h.n), x: x + 6, y: y - 6, c: '#ffffff', size: 10 }); }
  return ops;
}

/** a 2D canvas context, the parts the painter uses (so a test can pass a recorder) */
export interface Ctx2D {
  fillStyle: string | CanvasGradient | CanvasPattern; strokeStyle: string | CanvasGradient | CanvasPattern; lineWidth: number; globalAlpha: number; font: string; lineJoin: CanvasLineJoin; lineCap: CanvasLineCap;
  fillRect(x: number, y: number, w: number, h: number): void; beginPath(): void; moveTo(x: number, y: number): void; lineTo(x: number, y: number): void; closePath(): void;
  fill(rule?: CanvasFillRule): void; stroke(): void; arc(x: number, y: number, r: number, a0: number, a1: number): void; fillText(s: string, x: number, y: number): void;
}

/** runs the operations on a canvas context, over a background of the preview's colour */
export function paintPreview(ctx: Ctx2D, ops: readonly PreviewOp[], size: { w: number; h: number }): void {
  ctx.globalAlpha = 1; ctx.fillStyle = PREVIEW_COLOURS.background!; ctx.fillRect(0, 0, size.w, size.h);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const trace = (pts: readonly number[], close: boolean) => { ctx.moveTo(pts[0]!, pts[1]!); for (let i = 2; i + 1 < pts.length; i += 2) ctx.lineTo(pts[i]!, pts[i + 1]!); if (close) ctx.closePath(); };
  for (const op of ops) {
    if (op.t === 'fill') { ctx.globalAlpha = op.a; ctx.fillStyle = op.c; ctx.beginPath(); for (const r of op.rings) if (r.length >= 6) trace(r, true); ctx.fill('evenodd'); ctx.globalAlpha = 1; }
    else if (op.t === 'line') { ctx.strokeStyle = op.c; ctx.lineWidth = op.w; ctx.beginPath(); trace(op.pts, false); ctx.stroke(); }
    else if (op.t === 'disc') { ctx.fillStyle = op.c; ctx.beginPath(); ctx.arc(op.x, op.y, op.r, 0, Math.PI * 2); ctx.fill(); }
    else { ctx.fillStyle = op.c; ctx.font = `bold ${op.size}px system-ui, sans-serif`; ctx.fillText(op.s, op.x, op.y); }
  }
}
