// The placed things of a course as the features list the view from behind the golfer reads (T413, docs/CINDERLINKS-PORT.md): cart paths and the
// course's drives and nearby roads as paths, the clubhouse, halfway house, pro's office, teaching hut, estate houses and event structures (tents,
// grandstands, boards) as buildings, and planted trees. The shape is Cinderlinks' edits file (its parts/08c-features.md setFeatures and
// tools/MAP-CLI.md): { course, v: 1, features }, a path { id, kind: 'path', name, surface, width, pts }, a building { id, kind: 'building', name,
// at, w, d, h, rot, roof, wall, roofColour, floors }. Metres in the view's frame (protocol3p.ts: x east, y SOUTH of the course's centre), rot in
// degrees clockwise from east (with y south, the same turn Cinderlinks draws). Buildings also carry `use` so the view can later draw a tent or a
// stand differently; trees travel as { kind: 'tree', at, size }, which the view ignores for now.
//
// exportFeatures3p takes plain data (FeaturesInput) and is pure; gatherFeatures3p is the small adapter that builds that data from what the game
// keeps (the road network's segments, the business sites, the event structures, the estate's lots and the props). Pure TS, no DOM.
import { TILE_M } from '../types';
import type { Pt } from './types';
import { toView, type ViewPt } from './protocol3p';
import { BUSINESS, type BusinessId } from '../../business/catalogue';
import { STRUCTURE, type StructureKind } from '../tents';
import { structureRect, type PlacedEventStructure } from '../eventtool';
import { cornersOf, type EstateLot } from '../estate';

export type PathSurface = 'gravel' | 'concrete' | 'dirt' | 'sand';
export type Roof = 'gable' | 'hip' | 'flat';
/** what a building is, so the view can draw each kind its own way later */
export type BuildingUse = 'clubhouse' | 'halfway' | 'prooffice' | 'teachhut' | 'range' | 'house' | 'tent' | 'stand' | 'structure' | 'building';

export interface PathFeature { id: string; kind: 'path'; name: string; surface: PathSurface; width: number; pts: ViewPt[] }
export interface BuildingFeature { id: string; kind: 'building'; use: BuildingUse; name: string; at: ViewPt; w: number; d: number; h: number; rot: number;
  roof: Roof; wall: string; roofColour: string; floors: number }
export interface TreeFeature { id: string; kind: 'tree'; at: ViewPt; size: number }
export type Feature = PathFeature | BuildingFeature | TreeFeature;
/** the features file: the course's id, the version and the features */
export interface FeaturesFile { course: string; v: 1; features: Feature[] }

// ---------------------------------------------------------------- the plain input

/** one straight stretch of a path or road (tiles), its surface, its width (m) and the name its path gets */
export interface PathSegIn { a: Pt; b: Pt; surface: PathSurface; width: number; name: string }
/** a building: a key unique among the buildings (the id is made from it, so it must not change between exports), its use and name, its footprint's
 *  centre (tiles), its width along its own x and depth (m), its turn (degrees clockwise from east), and optionally its height (m), roof, colours and
 *  floors (absent: the use's defaults, STYLE) */
export interface BuildingIn { key: string; use: BuildingUse; name: string; at: Pt; w: number; d: number; rot: number;
  h?: number; roof?: Roof; wall?: string; roofColour?: string; floors?: number }
/** a planted tree: where it stands (tiles) and its height (m) */
export interface TreeIn { at: Pt; size: number }
export interface FeaturesInput { course: string; paths: readonly PathSegIn[]; buildings: readonly BuildingIn[]; trees: readonly TreeIn[] }

/** each use's look when the building does not say: height (m), roof, wall and roof colours, floors */
export const STYLE: Readonly<Record<BuildingUse, { h: number; roof: Roof; wall: string; roofColour: string; floors: number }>> = {
  clubhouse: { h: 7.5, roof: 'hip', wall: '#e8dcc0', roofColour: '#6b3a2a', floors: 2 },
  halfway: { h: 4, roof: 'gable', wall: '#ddcba4', roofColour: '#7a4a2e', floors: 1 },
  prooffice: { h: 3.5, roof: 'gable', wall: '#e4dccb', roofColour: '#5d4636', floors: 1 },
  teachhut: { h: 3, roof: 'gable', wall: '#c9b48e', roofColour: '#4f5b3a', floors: 1 },
  range: { h: 4, roof: 'flat', wall: '#d8d2c4', roofColour: '#8f8a80', floors: 1 },
  house: { h: 6.5, roof: 'gable', wall: '#e6dcc8', roofColour: '#8a3b2a', floors: 2 },
  tent: { h: 4, roof: 'gable', wall: '#f3f1ea', roofColour: '#fbfbf7', floors: 1 },
  stand: { h: 6, roof: 'flat', wall: '#8b9097', roofColour: '#d9dde2', floors: 1 },
  structure: { h: 3, roof: 'flat', wall: '#5f646b', roofColour: '#3f444a', floors: 1 },
  building: { h: 4.5, roof: 'gable', wall: '#e8dcc0', roofColour: '#8a3b2a', floors: 1 },
};

/** n to the centimetre (the file stays short and two exports of the same input match byte for byte) */
const r2 = (n: number): number => Math.round(n * 100) / 100;
const rv = (p: ViewPt): ViewPt => [r2(p[0]), r2(p[1])];
/** degrees in [0, 360) */
const deg360 = (d: number): number => r2(((d % 360) + 360) % 360);

/** the paths: stretches of the same surface, width and name that meet end to end are chained into one path (at a fork a path ends and the
 *  branches start their own); the stretches are sorted first, so the ids (p1, p2, ...) follow the input's content, not its order */
function chainPaths(segs: readonly PathSegIn[], centre: Pt): PathFeature[] {
  const key = (p: Pt): string => `${p.x.toFixed(3)},${p.y.toFixed(3)}`;
  const groups = new Map<string, PathSegIn[]>();
  for (const s of segs) {
    if (key(s.a) === key(s.b)) continue;
    const g = `${s.surface}|${s.width}|${s.name}`;
    (groups.get(g) ?? groups.set(g, []).get(g)!).push(s);
  }
  const out: PathFeature[] = [];
  for (const g of [...groups.keys()].sort()) {
    const list = groups.get(g)!.map(s => (key(s.a) <= key(s.b) ? s : { ...s, a: s.b, b: s.a }))
      .sort((p, q) => (key(p.a) + key(p.b) < key(q.a) + key(q.b) ? -1 : key(p.a) + key(p.b) > key(q.a) + key(q.b) ? 1 : 0));
    const at = new Map<string, number[]>(); // node -> the stretches touching it
    list.forEach((s, i) => { for (const k of [key(s.a), key(s.b)]) (at.get(k) ?? at.set(k, []).get(k)!).push(i); });
    const used = new Uint8Array(list.length);
    const walk = (start: string): Pt[] | null => {
      let here = start; const pts: Pt[] = [];
      for (;;) {
        const next = (at.get(here) ?? []).find(i => !used[i]);
        if (next === undefined) break;
        used[next] = 1; const s = list[next]!, fwd = key(s.a) === here;
        if (!pts.length) pts.push(fwd ? s.a : s.b);
        pts.push(fwd ? s.b : s.a); here = key(fwd ? s.b : s.a);
        if ((at.get(here) ?? []).length !== 2) break; // an end or a fork: the chain stops here
      }
      return pts.length > 1 ? pts : null;
    };
    const nodes = [...at.keys()].sort();
    const starts = [...nodes.filter(k => at.get(k)!.length !== 2), ...nodes]; // ends and forks first, then whatever is left (loops)
    const s0 = list[0]!;
    for (const k of starts) for (let pts = walk(k); pts; pts = walk(k))
      out.push({ id: '', kind: 'path', name: s0.name, surface: s0.surface, width: r2(s0.width), pts: pts.map(p => rv(toView(p, centre))) });
  }
  out.forEach((p, i) => { p.id = `p${i + 1}`; });
  return out;
}

/** the features file of the plain input; centre is the course's centre in tiles (export3p.ts's, T412). An empty course gives an empty list */
export function exportFeatures3p(input: FeaturesInput, centre: Pt): FeaturesFile {
  const features: Feature[] = chainPaths(input.paths, centre);
  const seen = new Set<string>();
  for (const b of [...input.buildings].sort((p, q) => (p.key < q.key ? -1 : p.key > q.key ? 1 : 0))) {
    let id = `b:${b.key}`; for (let n = 2; seen.has(id); n++) id = `b:${b.key}#${n}`; seen.add(id);
    const st = STYLE[b.use];
    features.push({ id, kind: 'building', use: b.use, name: b.name, at: rv(toView(b.at, centre)), w: r2(b.w), d: r2(b.d), h: r2(b.h ?? st.h), rot: deg360(b.rot),
      roof: b.roof ?? st.roof, wall: b.wall ?? st.wall, roofColour: b.roofColour ?? st.roofColour, floors: b.floors ?? st.floors });
  }
  [...input.trees].map(t => ({ at: rv(toView(t.at, centre)), size: r2(t.size) }))
    .sort((p, q) => p.at[0] - q.at[0] || p.at[1] - q.at[1] || p.size - q.size)
    .forEach((t, i) => features.push({ id: `t${i + 1}`, kind: 'tree', at: t.at, size: t.size }));
  return { course: input.course, v: 1, features };
}

// ---------------------------------------------------------------- the adapter: from where the game keeps things

/** a road network segment as network.ts Seg has it (only what is read) */
export interface NetSegLike { a: Pt; b: Pt; cls: { base: string; family: string; h: number; name: string } }
/** a placed prop and the library entry it shows (only what is read) */
export interface PropLike { item: number; x: number; y: number; scale: number; auto?: string }
export interface LibLike { kind: string; h: number; name: string }
/** where the game keeps the placed things: the road network's segments (engine.net.segs), the business sites (engine.bizDefs), the event
 *  structures (golf.structures), the estate's lots (engine.estateRt.lots), the props and the library they index (engine.props, LIBRARY), and the
 *  course's box in tiles [x0, y0, x1, y1] with the margin (tiles) inside which town roads count as near the course */
export interface GameFeatureSource {
  course: string; segs: Iterable<NetSegLike>;
  bizDefs: readonly { id: number; type: string; x: number; y: number; w: number; h: number }[];
  structures: readonly PlacedEventStructure[]; lots: readonly EstateLot[];
  props: Iterable<PropLike>; library: readonly LibLike[];
  box?: readonly [number, number, number, number]; margin?: number;
}

/** a road class's surface in the view (Cinderlinks draws gravel, concrete, dirt or sand; asphalt shows as concrete) and its name */
function surfaceOf(base: string): PathSurface {
  if (base === 'cart-walk' || base === 'cart-dirt') return 'dirt';
  if (base === 'gravel' || base === 'drive-gravel') return 'gravel';
  return 'concrete';
}
/** the business sites the course has, and their use */
const BIZ_USE: Partial<Record<BusinessId, BuildingUse>> = { clubhouse: 'clubhouse', halfway: 'halfway', prooffice: 'prooffice', teachhut: 'teachhut', range: 'range' };
/** an event structure's use from its catalogue kind (tents.ts StructureKind); a helipad is flat ground, so it is not exported */
const STRUCT_USE: Partial<Record<StructureKind, BuildingUse>> = {
  food: 'tent', drink: 'tent', snack: 'tent', merch: 'tent', hospitality: 'tent', media: 'tent', firstaid: 'tent', info: 'tent', toilet: 'structure',
  grandstand: 'stand', board: 'structure', tv: 'structure', gate: 'structure', transport: 'structure', display: 'structure',
};
/** each structure use's height (m) where the catalogue has none: a tent's ridge, a stand's back row, a board or gate */
const STRUCT_H: Partial<Record<StructureKind, number>> = { grandstand: 6, board: 4.5, tv: 5, gate: 4, toilet: 2.6, display: 3, transport: 3 };
/** a built estate house's wall colours, picked by the lot's seed */
const HOUSE_WALLS = ['#e6dcc8', '#d8c7a8', '#c9c3b6', '#eadfd0', '#b9a58a'];

/** the plain input of the placed things where the game keeps them (GameFeatureSource) */
export function gatherFeatures3p(src: GameFeatureSource): FeaturesInput {
  const paths: PathSegIn[] = [], buildings: BuildingIn[] = [], trees: TreeIn[] = [];
  const m = src.margin ?? 75, B = src.box;
  const near = (p: Pt): boolean => !B || (p.x >= B[0] - m && p.x <= B[2] + m && p.y >= B[1] - m && p.y <= B[3] + m);
  for (const s of src.segs) {
    const c = s.cls, course = c.family === 'cart' || c.family === 'course';
    if (!course && !(near(s.a) || near(s.b))) continue; // a town road counts only near the course
    // the width is the paved width (2 x the class's half width, in tiles of TILE_M): cart path 3 m, walking path 1.2 m, drive 4 m
    paths.push({ a: { x: s.a.x, y: s.a.y }, b: { x: s.b.x, y: s.b.y }, surface: surfaceOf(c.base), width: 2 * c.h * TILE_M, name: c.name });
  }
  // the business sites: axis-aligned footprints (x, y the top-left corner, w x h tiles: business/state.ts BizDef), never turned
  for (const d of src.bizDefs) {
    const use = BIZ_USE[d.type as BusinessId]; if (!use) continue;
    buildings.push({ key: `${d.type}:${d.id}`, use, name: BUSINESS[d.type as BusinessId]?.name ?? d.type, at: { x: d.x + d.w / 2, y: d.y + d.h / 2 },
      w: d.w * TILE_M, d: d.h * TILE_M, rot: 0 });
  }
  // the event structures: no stored size of their own, so the footprint is the catalogue's (or its art's, eventtool.ts structureRect), the box as
  // it stands on the map (x, y its top-left corner), turned already, so rot 0
  for (const s of src.structures) {
    const def = STRUCTURE[s.typeId], use = def && STRUCT_USE[def.kind]; if (!def || !use) continue;
    const [x, y, w, h] = structureRect(s); if (!(w > 0 && h > 0)) continue;
    buildings.push({ key: `event:${s.id}`, use, name: def.name, at: { x: x + w / 2, y: y + h / 2 }, w: w * TILE_M, d: h * TILE_M, rot: 0, ...(STRUCT_H[def.kind] ? { h: STRUCT_H[def.kind] } : {}) });
  }
  // the estate's houses: a lot stores its plot, not its house, so the house is derived: 60% of the lot's width and 50% of its depth, in the middle
  // of the plot, square to the street (its u). Only lots being built or built have one
  for (const l of src.lots) {
    if (l.st < 2) continue;
    const c = cornersOf(l), at = { x: (c[0]!.x + c[2]!.x) / 2, y: (c[0]!.y + c[2]!.y) / 2 };
    const ul = Math.hypot(l.u.x, l.u.y) || 1, nl = Math.hypot(l.n.x, l.n.y) || 1;
    buildings.push({ key: `lot:${l.id}`, use: 'house', name: l.st === 3 ? 'House' : 'House (being built)', at, w: l.w * ul * TILE_M * 0.6, d: l.d * nl * TILE_M * 0.5,
      rot: Math.atan2(l.u.y, l.u.x) * 180 / Math.PI, wall: HOUSE_WALLS[Math.abs(l.seed) % HOUSE_WALLS.length], ...(l.st === 2 ? { h: 3 } : {}) });
  }
  // the planted trees: props whose library entry is a tree (not the network's own, auto); the height is the picture's (px at 128 px a tile) x scale
  for (const p of src.props) {
    const L = src.library[p.item]; if (!L || L.kind !== 'tree' || p.auto) continue;
    trees.push({ at: { x: p.x, y: p.y }, size: L.h / 128 * TILE_M * p.scale });
  }
  return { course: src.course, paths, buildings, trees };
}
