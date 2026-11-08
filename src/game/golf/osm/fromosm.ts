// From an Overpass answer to the course JSON the converter reads (T358, #1003). This is the model-building half of scripts/dev/osm-course.mjs, ported so the
// browser can do what the script does: the answer's elements (nodes, ways, multipolygon relations, as geometry) become features by kind (tee, fairway,
// green, bunker, water hazards, rough, hole lines, pins, water, waterways, woods...) in metres, x east and y north of the course's centre (the middle of its
// boundary's bounding box), a local equirectangular projection. tests/golf-osm-fetch.test.ts checks this port against the script's own JSON for the answers the
// script cached (when this PC has them), so the two stay one thing. Pure TypeScript, no network, no DOM, deterministic.
import { OSM_CREDIT, OSM_LICENCE, type JFeature, type JPoly, type JPt, type OsmCourseJson } from './types';
import type { OverpassElement, OverpassJson } from './overpass';
import type { OsmRef } from './query';

const EARTH_R = 6371008.8;
export const AREA_KINDS = ['tee', 'fairway', 'green', 'bunker', 'water_hazard', 'lateral_water_hazard', 'rough', 'driving_range'] as const;
export const LINE_KINDS = ['hole', 'cartpath', 'path'] as const;
export const GOLF_KINDS = [...AREA_KINDS, ...LINE_KINDS, 'pin'] as const;
export const KINDS = [...GOLF_KINDS, 'water', 'waterway', 'wood', 'other'] as const;
type Kind = (typeof KINDS)[number];
const isIn = (list: readonly string[], k: string): boolean => list.includes(k);

/** a feature as the script writes it (the converter reads the JFeature part) */
export interface ModelFeature extends JFeature { area?: number; centroid?: JPt; open?: boolean; broken?: boolean }
/** what the model of an answer holds */
export interface Model { centre: { lat: number; lon: number }; boundary: ModelFeature | null; F: Record<string, ModelFeature[]>; skipped: { id: string; kind: string; why: string }[] }

// ------------------------------------------------------------------------------------------------------------------------ geometry (metres)
type Pt = [number, number];
const round1 = (v: number): number => Math.round(v * 10) / 10, round2 = (v: number): number => Math.round(v * 100) / 100;
const ringAreaOf = (r: Pt[]): number => { let s = 0; for (let i = 0, n = r.length; i < n; i++) { const a = r[i]!, b = r[(i + 1) % n]!; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; };
const orient = (r: Pt[], ccw: boolean): Pt[] => ((ringAreaOf(r) > 0) === ccw ? r : r.slice().reverse());
const polyAreaOf = (p: JPoly): number => Math.abs(ringAreaOf(p.outer as Pt[])) - p.inner.reduce((s, r) => s + Math.abs(ringAreaOf(r as Pt[])), 0);
function ringCentroidOf(r: Pt[]): Pt {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, n = r.length; i < n; i++) { const p = r[i]!, q = r[(i + 1) % n]!, w = p[0] * q[1] - q[0] * p[1]; a += w; cx += (p[0] + q[0]) * w; cy += (p[1] + q[1]) * w; }
  if (Math.abs(a) < 1e-9) return [r.reduce((s, p) => s + p[0], 0) / r.length, r.reduce((s, p) => s + p[1], 0) / r.length];
  return [cx / (3 * a), cy / (3 * a)];
}
function inRingAt(p: Pt, r: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const a = r[i]!, b = r[j]!;
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
const lineLength = (l: Pt[]): number => { let s = 0; for (let i = 1; i < l.length; i++) s += Math.hypot(l[i]![0] - l[i - 1]![0], l[i]![1] - l[i - 1]![1]); return s; };
const pointsOf = (f: ModelFeature): Pt[] => f.pos ? [f.pos as Pt] : f.line ? (f.line as Pt[]) : (f.polys ?? []).flatMap(p => p.outer as Pt[]);
export interface BBox { minX: number; minY: number; maxX: number; maxY: number }
function bboxOf(fs: ModelFeature[]): BBox {
  const b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const f of fs) for (const [x, y] of pointsOf(f)) { b.minX = Math.min(b.minX, x); b.maxX = Math.max(b.maxX, x); b.minY = Math.min(b.minY, y); b.maxY = Math.max(b.maxY, y); }
  return b;
}
const intTag = (v: string | undefined): number | null => (/^\s*\d+\s*$/.test(String(v ?? '')) ? parseInt(v!, 10) : null);

// ------------------------------------------------------------------------------------------------------------------------ Overpass elements -> features
type LL = [number, number];
const wayPoints = (el: { geometry?: ({ lat: number; lon: number } | null)[] }): LL[] => (el.geometry ?? []).filter((g): g is { lat: number; lon: number } => !!g).map(g => [g.lon, g.lat] as LL);
const samePt = (a: LL | Pt, b: LL | Pt): boolean => a[0] === b[0] && a[1] === b[1];
const isClosed = (pts: LL[]): boolean => pts.length >= 4 && samePt(pts[0]!, pts[pts.length - 1]!);
/** chains member ways that share end points into rings (end points are the same nodes, so their coordinates are equal) */
function joinWays(ways: LL[][]): LL[][] {
  const pool = ways.map(w => w.slice()), rings: LL[][] = [];
  while (pool.length) {
    let ring = pool.pop()!;
    for (let guard = 0; guard < 10000 && !isClosed(ring); guard++) {
      const end = ring[ring.length - 1]!, i = pool.findIndex(w => samePt(w[0]!, end) || samePt(w[w.length - 1]!, end));
      if (i < 0) break;
      const w = pool.splice(i, 1)[0]!;
      if (!samePt(w[0]!, end)) w.reverse();
      ring = ring.concat(w.slice(1));
    }
    rings.push(ring);
  }
  return rings;
}
type Shape = { pos: LL } | { line: LL[]; open?: boolean } | { polys: { outer: LL[]; inner: LL[][] }[]; broken?: boolean };
/** the geometry of one element in lon/lat: a point, a line (open: an unclosed area way), or polygons; null when unusable */
function shapeOf(el: OverpassElement, areaLike: boolean): Shape | null {
  if (el.type === 'node') return typeof el.lon === 'number' && typeof el.lat === 'number' ? { pos: [el.lon, el.lat] } : null;
  if (el.type === 'way') {
    const pts = wayPoints(el);
    if (pts.length < 2) return null;
    if (!areaLike) return { line: pts };
    return isClosed(pts) ? { polys: [{ outer: pts, inner: [] }] } : { line: pts, open: true };
  }
  if (el.type === 'relation' && areaLike && ['multipolygon', 'boundary'].includes(el.tags?.type ?? '')) {
    const outer: LL[][] = [], inner: LL[][] = [];
    for (const m of el.members ?? []) {
      if (m.type !== 'way' || !m.geometry) continue;
      const pts = wayPoints(m);
      if (pts.length >= 2) (m.role === 'inner' ? inner : outer).push(pts);
    }
    const polys: { outer: LL[]; inner: LL[][] }[] = joinWays(outer).map(o => ({ outer: o, inner: [] })), broken = polys.some(p => !isClosed(p.outer));
    for (const r of joinWays(inner)) { const host = polys.find(p => inRingAt(r[0]! as Pt, p.outer as Pt[])); if (host) host.inner.push(r); }
    return polys.length ? { polys, broken } : null;
  }
  return null;
}
function kindOf(el: OverpassElement, srcKey: string): Kind | 'boundary' {
  const t = el.tags ?? {};
  if (`${el.type}/${el.id}` === srcKey) return 'boundary';
  if (t.golf) return isIn(GOLF_KINDS, t.golf) ? (t.golf as Kind) : 'other';
  if (t.natural === 'water') return 'water';
  if (t.waterway) return 'waterway';
  if (t.natural === 'wood' || t.natural === 'scrub' || t.landuse === 'forest') return 'wood';
  return 'other';
}

/** all elements -> the model: the course's centre, boundary, the features by kind (coordinates projected to metres) and what was skipped. `fallbackCentre` is
 *  the centre when the source has no outline (a course mapped as a point) */
export function buildModel(elements: OverpassElement[], src: OsmRef, fallbackCentre: { lat: number; lon: number }): Model {
  const srcKey = `${src.type}/${src.id}`, srcEl = elements.find(e => `${e.type}/${e.id}` === srcKey);
  const srcShape = srcEl ? shapeOf(srcEl, true) : null;
  const lonLat: LL[] = srcShape && 'polys' in srcShape ? srcShape.polys.flatMap(p => p.outer) : srcShape && 'pos' in srcShape ? [srcShape.pos] : [];
  let lat0 = fallbackCentre.lat, lon0 = fallbackCentre.lon;
  if (lonLat.length) {
    const lons = lonLat.map(p => p[0]), lats = lonLat.map(p => p[1]);
    lon0 = (Math.min(...lons) + Math.max(...lons)) / 2; lat0 = (Math.min(...lats) + Math.max(...lats)) / 2;
  }
  const kx = Math.PI / 180 * EARTH_R * Math.cos(lat0 * Math.PI / 180), ky = Math.PI / 180 * EARTH_R;
  const P = ([lon, lat]: LL): Pt => [round2((lon - lon0) * kx), round2((lat - lat0) * ky)];
  const ring = (pts: LL[], ccw: boolean): Pt[] => { const r = pts.map(P); if (r.length > 1 && samePt(r[0]!, r[r.length - 1]!)) r.pop(); return orient(r, ccw); };
  const F: Record<string, ModelFeature[]> = Object.fromEntries(KINDS.map(k => [k, [] as ModelFeature[]])), skipped: Model['skipped'] = [];
  let boundary: ModelFeature | null = null;
  for (const el of elements) {
    const kind = kindOf(el, srcKey), areaLike = !isIn(LINE_KINDS, kind) && kind !== 'waterway' && kind !== 'pin';
    const shape = shapeOf(el, areaLike);
    if (!shape) { skipped.push({ id: `${el.type}/${el.id}`, kind, why: 'no usable geometry' }); continue; }
    const f: ModelFeature = { id: `${el.type}/${el.id}`, tags: el.tags ?? {} };
    const ref = intTag(f.tags!.ref); if (ref != null) f.ref = ref;
    if ('pos' in shape) f.pos = P(shape.pos);
    if ('line' in shape) { f.line = shape.line.map(P); f.length = round1(lineLength(f.line as Pt[])); if (shape.open) f.open = true; }
    if ('polys' in shape) {
      f.polys = shape.polys.map(p => ({ outer: ring(p.outer, true), inner: p.inner.map(r => ring(r, false)) }));
      f.area = round1(f.polys.reduce((s, p) => s + polyAreaOf(p), 0));
      f.centroid = ringCentroidOf(f.polys.reduce((a, b) => (Math.abs(ringAreaOf(b.outer as Pt[])) > Math.abs(ringAreaOf(a.outer as Pt[])) ? b : a)).outer as Pt[]).map(round2) as JPt;
      if (shape.broken) f.broken = true;
    }
    if (kind === 'hole') { const par = intTag(f.tags!.par); if (par != null) f.par = par; }
    if (kind === 'boundary') { boundary = f; continue; }
    if (kind === 'water' || kind === 'wood' || kind === 'waterway') {
      const b = bboxOf([f]);
      if (b.maxX - b.minX > 6000 || b.maxY - b.minY > 6000) { skipped.push({ id: f.id!, kind, why: 'larger than 6 km (not part of the course)' }); continue; }
    }
    F[kind]!.push(f);
  }
  return { centre: { lat: lat0, lon: lon0 }, boundary, F, skipped };
}

/** the bounding box of the boundary and the golf features, m (an empty box when there is nothing) */
export function modelBounds(m: Pick<Model, 'boundary' | 'F'>): BBox { return bboxOf([...(m.boundary ? [m.boundary] : []), ...GOLF_KINDS.flatMap(k => m.F[k] ?? [])]); }

/** what the course JSON says about where it came from */
export interface CourseInfo {
  /** the id the game knows it by (default: the object's "way/123") */ id?: string;
  /** the name the game shows (default: the object's name tag, else its id) */ name?: string;
  /** "Pretoria, South Africa" (default: the object's address tags) */ place?: string;
  /** the position to project about when the object has no outline (a course mapped as a point) */ at?: { lat: number; lon: number };
  /** when and from which server the answer came */ fetchedAt?: string; server?: string;
}

/** the course JSON of an Overpass answer for the object `ref` (the same JSON the script writes, with the parts the converter and the preview read) */
export function courseJsonOf(raw: OverpassJson, ref: OsmRef, info: CourseInfo = {}): OsmCourseJson {
  const model = buildModel(raw.elements, ref, info.at ?? { lat: 0, lon: 0 });
  const srcEl = raw.elements.find(e => e.type === ref.type && e.id === ref.id), tags = srcEl?.tags ?? {};
  const name = info.name?.trim() || tags.name?.trim() || `${ref.type}/${ref.id}`;
  const place = info.place ?? [tags['addr:city'], tags['addr:country']].filter(Boolean).join(', ');
  const b = modelBounds(model), counts = Object.fromEntries(KINDS.map(k => [k, model.F[k]!.length]));
  const meta = {
    attribution: `${OSM_CREDIT} (ODbL 1.0, https://www.openstreetmap.org/copyright)`, credit: OSM_CREDIT, licence: OSM_LICENCE, id: info.id ?? `${ref.type}/${ref.id}`, place,
    course: { osm: `${ref.type}/${ref.id}`, name, tags },
    centre: { lat: +model.centre.lat.toFixed(7), lon: +model.centre.lon.toFixed(7) },
    boundsM: b, sizeM: isFinite(b.minX) ? [Math.round(b.maxX - b.minX), Math.round(b.maxY - b.minY)] : [0, 0], counts, skipped: model.skipped,
    overpass: { server: info.server ?? null, fetchedAt: info.fetchedAt ?? raw.osm3s?.timestamp_osm_base ?? null },
  };
  return { meta, ...(model.boundary ? { boundary: model.boundary } : {}), features: model.F } as unknown as OsmCourseJson;
}
