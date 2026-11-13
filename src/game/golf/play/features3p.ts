// The placed things of a course as the features list the view from behind the golfer reads (T413, docs/CINDERLINKS-PORT.md): cart paths and the
// course's drives and nearby roads as paths, the clubhouse, halfway house, pro's office, teaching hut, estate houses and event structures (tents,
// grandstands, boards) as buildings, and planted trees. The shape is Cinderlinks' edits file (its parts/08c-features.md setFeatures and
// tools/MAP-CLI.md): { course, v: 1, features }, a path { id, kind: 'path', name, surface, width, pts }, a building { id, kind: 'building', name,
// at, w, d, h, rot, roof, wall, roofColour, floors }. Metres in the view's frame (protocol3p.ts: x east, y SOUTH of the course's centre), rot in
// degrees clockwise from east (with y south, the same turn Cinderlinks draws). Buildings also carry `use` so the view can later draw a tent or a
// stand differently. T451: the trees travel apart from the features, packed (TreesPack: the file's `trees`): every tree in the course's box and
// 150 m round it (planted, the network's own, the woods, the town's and the river belts'), each with its species (the library id), height and
// crown width, and per species the build the view sculpts it as (form, hue) and the game's own picture of it (pic: the atlas page and box), so the
// view stands the course's trees where the game draws them, in its own sculpted look or in the game's pictures.
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
export type BuildingUse = 'clubhouse' | 'halfway' | 'prooffice' | 'teachhut' | 'range' | 'house' | 'tent' | 'stand' | 'board' | 'structure' | 'building';

export interface PathFeature { id: string; kind: 'path'; name: string; surface: PathSurface; width: number; pts: ViewPt[] }
export interface BuildingFeature { id: string; kind: 'building'; use: BuildingUse; name: string; at: ViewPt; w: number; d: number; h: number; rot: number;
  roof: Roof; wall: string; roofColour: string; floors: number }
export type Feature = PathFeature | BuildingFeature;
/** T451: the build a tree is sculpted as in the view: 0 a conifer, 1 a broadleaf, 2 an airy broadleaf (birch, aspen), 3 a palm, 4 a dead snag;
 *  T454: 5 a cactus, 6 a bush (a shrub, a desert plant, a clump of grass or reeds), 7 a flat-topped acacia or joshua tree */
export type TreeForm = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
/** T454: the library kinds that are plants the view stands where they stand (a tree, a palm, a cactus or desert shrub, a bush, a plant), and the
 *  course props that are trees by their id (their kind is decor) */
export const PLANT_KINDS: ReadonlySet<string> = new Set(['tree', 'palm', 'shrub', 'bush', 'plant']);
export const PLANT_IDS: ReadonlySet<string> = new Set(['newprop:small-tree', 'newprop:flowering-tree']);
const isPlant = (L: { kind: string; id?: string }): boolean => PLANT_KINDS.has(L.kind) || (!!L.id && PLANT_IDS.has(L.id));
/** T451: the game's picture of a species: the atlas page's address (mip 0), the picture's box on it (uv, 0..1), the display rectangle w x h (px at
 *  128 a tile) with the ground point ax, ay in it, and the trimmed picture's box inside that rectangle (quad: x0, y0, x1, y1 display px) */
export interface TreePic { url: string; uv: [number, number, number, number]; w: number; h: number; ax: number; ay: number; quad: [number, number, number, number] }
/** T451: the course's trees, packed: the box they were gathered in (view metres x0, y0, x1, y1: inside it the view grows none of its own), the
 *  species (library ids) with each one's form, hue (0..1 along the view's leaf colours: deep green, lush, lime, ember, rose) and picture (null:
 *  none), and the trees, five numbers each: x, y (view metres), height and crown width (m), the species' index */
export interface TreesPack { box: [number, number, number, number]; sp: string[]; form: TreeForm[]; hue: number[]; pic: (TreePic | null)[]; t: number[] }
/** the features file: the course's id, the version, the features and (T451) the trees */
export interface FeaturesFile { course: string; v: 1; features: Feature[]; trees?: TreesPack }

// ---------------------------------------------------------------- the plain input

/** one straight stretch of a path or road (tiles), its surface, its width (m) and the name its path gets */
export interface PathSegIn { a: Pt; b: Pt; surface: PathSurface; width: number; name: string }
/** a building: a key unique among the buildings (the id is made from it, so it must not change between exports), its use and name, its footprint's
 *  centre (tiles), its width along its own x and depth (m), its turn (degrees clockwise from east), and optionally its height (m), roof, colours and
 *  floors (absent: the use's defaults, STYLE) */
export interface BuildingIn { key: string; use: BuildingUse; name: string; at: Pt; w: number; d: number; rot: number;
  h?: number; roof?: Roof; wall?: string; roofColour?: string; floors?: number }
/** a tree: where it stands (its ground point, tiles), its height and crown width (m) and its species (the library id; '' when not known) */
export interface TreeIn { at: Pt; size: number; crown?: number; sp?: string }
/** the plain input; T451: treeBox, the tile box the trees were gathered in (absent: the trees' own box), and pics, the species' pictures */
export interface FeaturesInput { course: string; paths: readonly PathSegIn[]; buildings: readonly BuildingIn[]; trees: readonly TreeIn[];
  treeBox?: readonly [number, number, number, number]; pics?: Readonly<Record<string, TreePic>> }

/** T451: at most this many trees go to the view (the course message stays quick: about 1 MB); past it the ones outside the course's own box are
 *  thinned first, evenly, and the course's own too if they alone are more */
export const MAX_TREES = 40000;
/** T451: how a species is sculpted in the view, from its library id: its form (a conifer, broadleaf, airy broadleaf, palm or dead snag) and its
 *  leaf colour on the view's scale (0.1 deep green .. 0.95 rose); the names say it (gen:tree-maple-scarlet, capital:tree-pine-open, world:tree_pine_0) */
export function treeLook(sp: string, conifers?: ReadonlySet<string>): { form: TreeForm; hue: number } {
  const s = sp.toLowerCase();
  if (/dead|snag/.test(s)) return { form: 4, hue: 0.3 };
  if (/palm/.test(s)) return { form: 3, hue: 0.3 };
  if (/cact|saguaro|ocotillo|prickly|cholla|agave|yucca/.test(s)) return { form: 5, hue: 0.3 };   // (T454: the desert's)
  if (/acacia|joshua/.test(s)) return { form: 7, hue: 0.4 };
  if (/shrub|bush|broom|sage|grass|reed|cattail|hedge|fern|hydrangea|plant/.test(s)) return { form: 6, hue: /yellow|golden|russet/.test(s) ? 0.7 : /red|burning/.test(s) ? 0.92 : 0.3 };
  if (conifers?.has(sp) || /pine|spruce|fir\b|fir-|cedar|conifer|cypress|larch|juniper|hemlock|yew/.test(s)) return { form: 0, hue: /blue/.test(s) ? 0.02 : 0.1 };
  const airy = /birch|aspen|willow/.test(s) ? 2 : 1;
  const hue = /scarlet|crimson|red|rose|cherry|blossom/.test(s) ? 0.92 : /ember|amber|orange|gold|yellow|autumn/.test(s) ? 0.8
    : /lime|birch|aspen|young/.test(s) ? 0.45 : /near-bare|patchy/.test(s) ? 0.55 : 0.25;
  return { form: airy, hue };
}

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
  board: { h: 4.5, roof: 'flat', wall: '#2f5a3e', roofColour: '#e8e0c4', floors: 1 },
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
  const trees = packTrees(input, centre);
  return trees ? { course: input.course, v: 1, features, trees } : { course: input.course, v: 1, features };
}

/** a tenth of a metre */
const r1 = (n: number): number => Math.round(n * 10) / 10;
/** T451: the trees packed for the view (TreesPack), or null when there are none. The trees are sorted by place, so the same input packs the same
 *  whatever its order; past MAX_TREES the ones outside the course's own box (treeBox shrunk by the margin it was grown by, MARGIN_T) are kept one
 *  in k, evenly, and the course's own the same way when they alone are more */
function packTrees(input: FeaturesInput, centre: Pt): TreesPack | null {
  if (!input.trees.length) return null;
  let list = [...input.trees].sort((p, q) => p.at.x - q.at.x || p.at.y - q.at.y || p.size - q.size || (p.sp ?? '').localeCompare(q.sp ?? ''));
  const tb = input.treeBox ?? [Math.min(...list.map(t => t.at.x)), Math.min(...list.map(t => t.at.y)), Math.max(...list.map(t => t.at.x)), Math.max(...list.map(t => t.at.y))];
  if (list.length > MAX_TREES) {
    const m = input.treeBox ? MARGIN_T : 0, inside = (t: TreeIn) => t.at.x >= tb[0] + m && t.at.x <= tb[2] - m && t.at.y >= tb[1] + m && t.at.y <= tb[3] - m;
    // (evenly: one in k along the trees sorted by place, which leaves every stretch of the land its share; never the first n, which would bare a side)
    const even = (a: TreeIn[], n: number): TreeIn[] => { if (a.length <= n) return a; const k = a.length / n; return a.filter((_, i) => Math.floor(i / k) !== Math.floor((i - 1) / k)).slice(0, n); };
    const core = list.filter(inside), rim = list.filter(t => !inside(t)), keep = even(core, MAX_TREES);
    list = [...keep, ...even(rim, MAX_TREES - keep.length)];
    list.sort((p, q) => p.at.x - q.at.x || p.at.y - q.at.y || p.size - q.size);
  }
  const spIdx = new Map<string, number>(), sp: string[] = [], form: TreeForm[] = [], hue: number[] = [], pic: (TreePic | null)[] = [], t: number[] = [];
  for (const tr of list) {
    const id = tr.sp ?? '';
    let k = spIdx.get(id);
    if (k === undefined) { k = sp.length; spIdx.set(id, k); sp.push(id); const L = treeLook(id); form.push(L.form); hue.push(L.hue); pic.push(input.pics?.[id] ?? null); }
    const v = toView(tr.at, centre);
    t.push(r1(v[0]), r1(v[1]), r1(tr.size), r1(tr.crown ?? tr.size * 0.55), k);
  }
  const a = toView({ x: tb[0], y: tb[1] }, centre), b = toView({ x: tb[2], y: tb[3] }, centre);
  return { box: [r1(a[0]), r1(a[1]), r1(b[0]), r1(b[1])], sp, form, hue, pic, t };
}
/** T451: how far round the course's box the trees are gathered, tiles (150 m) */
export const MARGIN_T = 75;

// ---------------------------------------------------------------- the adapter: from where the game keeps things

/** a road network segment as network.ts Seg has it (only what is read) */
export interface NetSegLike { a: Pt; b: Pt; cls: { base: string; family: string; h: number; name: string } }
/** a placed prop and the library entry it shows (only what is read) */
export interface PropLike { item: number; x: number; y: number; scale: number; auto?: string }
/** a library entry (only what is read): T451 its id and display width, its picture on the atlas (tex: page, u0, v0, u1, v1; quad) and ground point */
export interface LibLike { kind: string; h: number; name: string; id?: string; w?: number; ax?: number; ay?: number; tex?: readonly number[]; quad?: readonly number[] }
/** T451: a tree the game plants by itself (the woods', the town's, the river belts'): its library id, ground point (tiles) and scale */
export interface GameTree { id: string; x: number; y: number; scale: number }
/** where the game keeps the placed things: the road network's segments (engine.net.segs), the business sites (engine.bizDefs), the event
 *  structures (golf.structures), the estate's lots (engine.estateRt.lots), the props and the library they index (engine.props, LIBRARY), and the
 *  course's box in tiles [x0, y0, x1, y1] with the margin (tiles) inside which town roads count as near the course. T451: the trees the game plants
 *  itself in the course's own box (courseBox, tiles; absent: box) grown by MARGIN_T (engine.trees3p), and the atlas pages' addresses (library.ts ATLAS_PAGES)
 *  for the species' pictures */
export interface GameFeatureSource {
  course: string; segs: Iterable<NetSegLike>;
  bizDefs: readonly { id: number; type: string; x: number; y: number; w: number; h: number }[];
  structures: readonly PlacedEventStructure[]; lots: readonly EstateLot[];
  props: Iterable<PropLike>; library: readonly LibLike[];
  box?: readonly [number, number, number, number]; margin?: number;
  trees?: Iterable<GameTree>; pages?: readonly (readonly string[])[]; courseBox?: readonly [number, number, number, number];
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
  grandstand: 'stand', board: 'board', tv: 'structure', gate: 'structure', transport: 'structure', display: 'structure',
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
  // T451: the trees: the props whose library entry is a plant (T454: a tree, palm, cactus, shrub or bush; planted by the player or the network's own, auto) and the trees the game plants by
  // itself (src.trees), inside the course's box grown by MARGIN_T. A tree's height is its picture's, from the top of the trimmed picture down to its
  // ground point, and its crown the trimmed picture's width (display px at 128 a tile, x its scale)
  const CB = src.courseBox ?? B, tb: [number, number, number, number] | undefined = CB ? [CB[0] - MARGIN_T, CB[1] - MARGIN_T, CB[2] + MARGIN_T, CB[3] + MARGIN_T] : undefined;
  const inBox = (x: number, y: number): boolean => !tb || (x >= tb[0] && x <= tb[2] && y >= tb[1] && y <= tb[3]);
  const byId = new Map<string, LibLike>(), pics: Record<string, TreePic> = {};
  for (const L of src.library) if (L.id && isPlant(L) && !byId.has(L.id)) byId.set(L.id, L);
  const add = (L: LibLike, x: number, y: number, scale: number): void => {
    if (!inBox(x, y)) return;
    const q = L.quad, m = TILE_M / 128 * scale, h = q && L.ay !== undefined ? (L.ay - q[1]!) * m : L.h * m, w = q ? (q[2]! - q[0]!) * m : (L.w ?? L.h * 0.7) * m;
    const sp = L.id ?? L.name;
    trees.push({ at: { x, y }, size: h, crown: w * 0.92, sp });
    const page = L.tex && src.pages?.[L.tex[0]!]?.[0];
    if (page && !pics[sp] && q && L.w !== undefined && L.ax !== undefined && L.ay !== undefined)
      pics[sp] = { url: page, uv: [L.tex![1]!, L.tex![2]!, L.tex![3]!, L.tex![4]!], w: L.w, h: L.h, ax: L.ax, ay: L.ay, quad: [q[0]!, q[1]!, q[2]!, q[3]!] };
  };
  for (const p of src.props) { const L = src.library[p.item]; if (L && isPlant(L)) add(L, p.x, p.y, p.scale); }   // (T454: every plant, not only kind tree: the desert's palms, cacti and shrubs are kinds of their own)
  for (const t of src.trees ?? []) { const L = byId.get(t.id); if (L) add(L, t.x, t.y, t.scale); }
  return { course: src.course, paths, buildings, trees, ...(tb ? { treeBox: tb } : {}), pics };
}
