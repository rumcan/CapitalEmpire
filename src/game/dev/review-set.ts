// T385 (#1042): the sets of lots the studio's Lot review (lot-review.ts) browses: a generated town's house lots and T353's estate lots, each lot with a stable id
// (its set, its seed and its key), the compose state the game gives such a lot, and its road. The engine lays the streets and the lots' frames
// (Game.stageReview: townGrid and LotMap for the town, golf/estate.ts frontageFrames for the estate); this module holds what is pure and seeded: the states,
// the estate's streets and the ids, so the same seed is the same town before and after a change, and what the review applies: an override as a composition on its lot, the
// machine's reading of a lot as words. Pure: no DOM, no game state.
import { LIBRARY } from '../library';
import { LU, LV } from '../lots/town';
import { MARK_ID, mix, type ComposeState, type Composition, type LotGeom, type Placed } from '../lots/compose-core';
import { mulberry } from '../iso';
import { frameOf, roadOf, type Pt } from '../lots/preset-frame';
import { ownerScaleOf, turned } from '../lots/preset-art';
import type { LotAudit } from '../lots/lot-audit';
import { reviewId, type Check, type ReviewKind, type ReviewOverride, type ReviewRecord } from '../lots/review-file';
import { housePalette, lotPresets } from '../lots/compose';
import { baseOf, areaOf } from '../lots/house-class';
import { roleOf } from '../lots/groups';
import { isBuilding } from '../mirror';
export type { ReviewKind } from '../lots/review-file';
/** a lot of a review set, as the page stages and lists it: its id, its key in the engine (staged under it), its frame, its compose state and its road (0..7) */
export interface ReviewLot { id: string; kind: ReviewKind; seed: number; key: string; g: LotGeom; st: ComposeState; road: number }
/** a lot of a set with its road worked out */
export function reviewLot(kind: ReviewKind, seed: number, key: string, g: LotGeom, st: ComposeState): ReviewLot {
  return { id: reviewId(kind, seed, key), kind, seed, key, g, st, road: roadOf(g.n) };
}
/** the state of the i-th lot of a seeded town (its lots in key order): a house lot built (a share of them upgraded), a tenth of them going down (decline 1 to 3), the
 *  building tier a town draws (0 the starter shacks to 3) and a seed of its own. Deterministic from the seed and i */
export function townState(seed: number, i: number): ComposeState {
  const r = mulberry(mix(seed, 0x385, i)), up = r() < 0.3, d = r(), tier = Math.floor(r() * 4);
  return { use: LU.RES, level: up ? LV.UPGRADED : LV.BUILT, decline: d < 0.8 ? 0 : d < 0.9 ? 1 : d < 0.96 ? 2 : 3, seed: Math.floor(r() * 100000), tier };
}
/** the state of an estate lot (T353, Game.estateLotState: the town's own house lot at its stage, from the lot's seed): built, no decline */
export function estateState(seed: number, i: number): ComposeState {
  return { use: LU.RES, level: LV.BUILT, decline: 0, seed: mix(seed, 0x353, i) % 100000 };
}
/** the estate's streets round a centre (tiles): one along +x, one along +y and a road a few degrees off the axes (the estate takes a street up to 20 degrees off), each
 *  with the lots of both its sides; they keep inside the lab's 320 tile box */
export function estateStreets(c: Pt): { a: Pt; b: Pt; base: 'street' | 'road' }[] {
  return [
    { a: { x: c.x - 120, y: c.y - 90 }, b: { x: c.x + 20, y: c.y - 90 }, base: 'street' },
    { a: { x: c.x + 70, y: c.y - 110 }, b: { x: c.x + 70, y: c.y + 20 }, base: 'street' },
    { a: { x: c.x - 120, y: c.y + 40 }, b: { x: c.x - 10, y: c.y + 68 }, base: 'road' },
  ];
}
/** whether a record belongs to the lot a set lays under this id (the same set, seed and key) */
export const recordFits = (l: ReviewLot, r: Pick<ReviewRecord, 'kind' | 'seed' | 'key'>): boolean => r.kind === l.kind && r.seed === l.seed && r.key === l.key;
const LIB_AT = new Map(LIBRARY.map((it, i) => [it.id, i] as const));
/** an override as a composition on a lot (the engine adds it to the lot's own: Game.lotOverride): each sprite turned to the lot's facing as the lots turn their props, at its owner size, the
 *  anchor where it was placed; the decals as the lot's ground marks */
export function overrideComposition(g: LotGeom, ov: ReviewOverride | undefined): Composition | undefined {
  if (!ov || (!ov.props.length && !ov.decals.length)) return undefined;
  const f = frameOf(g), P = (a: number, b: number) => ({ x: g.o.x + g.u.x * a + g.n.x * b, y: g.o.y + g.u.y * a + g.n.y * b });
  const props: Placed[] = [];
  for (const p of ov.props) {
    if (!LIB_AT.has(p.id)) continue;
    const t = turned(p.id, f.q), q = P(p.a, p.b);
    props.push({ id: t.id, x: +q.x.toFixed(3), y: +q.y.toFixed(3), flip: p.flip ? !t.flip : t.flip, scale: ownerScaleOf(p.id) * (p.scale ?? 1) });
  }
  const marks: number[] = [];
  for (const d of ov.decals) { const i = MARK_ID.get(d.id); if (i === undefined) continue; const q = P(d.a, d.b); marks.push(i, +q.x.toFixed(3), +q.y.toFixed(3), d.scale ?? 1, d.alpha ?? 1); }
  const quad = [P(-2, -2), P(g.w + 2, -2), P(g.w + 2, g.d + 2), P(-2, g.d + 2)].flatMap(q => [q.x, q.y]);
  return { props, ground: marks.length ? [{ pts: quad, tex: 'marks' as const, marks }] : [] };
}
/** the machine's reading of one check: whether it is right, and in words */
export function readingOf(a: LotAudit): Record<Check, [boolean, string]> {
  const turns = a.facingOff === null ? 'facing not known' : a.facingOff === 0 ? 'its front faces the road' : `${a.facingOff * 45} degrees off the road`;
  // (T398: the garage door faces the street, the drive goes to it and to nothing else, the path to the front door; a picture the owner marked is never drawn)
  const doors = a.garageSideways ? ', its garage door faces sideways' : a.marked ? ', a picture the owner marked' : a.garage ? ', its garage door faces the road' : '';
  return {
    house: [a.house && (a.facingOff === 0 || a.facingOff === null) && !a.garageSideways && !a.marked, a.house ? `${a.buildings} building${a.buildings === 1 ? '' : 's'}, ${turns}${doors}` : 'no house on the lot'],
    drive: [a.house && a.driveOk && a.pathAtDoor && (!a.drive || a.driveConnects) && a.path, `${a.garage ? (a.driveOk ? 'the drive meets the road and reaches the garage door' : 'the drive does not reach the garage door') : a.drive ? 'a drive and no garage door' : 'no garage, no drive'}, ${a.path ? (a.pathAtDoor ? 'the front path reaches the front door' : 'the front path misses the front door') : 'no front path'}`],
    trees: [a.trees <= 3 && a.treesClear, `${a.trees} tree${a.trees === 1 ? '' : 's'}${a.treesClear ? ', clear of the house, drive and path' : ', one covers the house, drive or path'}`],
    fence: [a.fence !== 'none' && a.fenceAcross === 0, a.fence === 'none' ? 'no fence' : `${a.fencePieces} ${a.fence === 'hedge' ? 'hedge shrubs' : 'fence panels'}${a.fenceAcross ? `, ${a.fenceAcross} across the drive or path` : ''}`],
  };
}

// ---------- T403 (#1081): the road filter and the sample set
/** the Lot review's road filter (the owner, 2026-11-09: "the Lot review has no lots on 45-degree roads, the streets that run straight across or down the screen, and those are exactly where the
 *  facing, garage and driveway problems show"): all roads, the four along a map axis (0, 2, 4, 6: the street lies on the lot's +y, +x, -y or -x side; the corner views draw), or the four at 45 degrees
 *  (1, 3, 5, 7: the streets straight across or down the screen; the turned straight-on views draw) */
export type RoadFilter = 'all' | 'axis' | '45';
export const ROAD_FILTERS: readonly { id: RoadFilter; label: string; title: string }[] = [
  { id: 'all', label: 'All roads', title: 'every lot' },
  { id: 'axis', label: 'Axis', title: 'lots on the four roads along a map axis (↙ ↘ ↗ ↖): the corner views draw' },
  { id: '45', label: '45°', title: 'lots on the four roads at 45 degrees, the streets straight across or down the screen (↓ → ↑ ←): the turned straight-on views draw' },
];
/** whether a lot on a road (0..7) shows under the filter */
export const roadVisible = (filter: RoadFilter, road: number): boolean => filter === 'all' || (filter === 'axis' ? road % 2 === 0 : road % 2 === 1);
/** how many lots of a list stand on each road kind, for the filter's chips */
export function roadCounts(roads: readonly number[]): Record<RoadFilter, number> { return { all: roads.length, axis: roads.filter(r => r % 2 === 0).length, '45': roads.filter(r => r % 2 === 1).length }; }

/** the sample set's streets round a centre (tiles): four roads (the road class: lots of 12.5 x 16 tiles, wide enough for most house types with the side gaps) of 280 tiles, one along +x, one along +y and two at 45
 *  degrees (along (1, 1): straight down the screen; along (1, -1): straight across it), each with the lots of both its sides (frontageFrames: 21 lots a side): the eight sides are the eight road headings, so every
 *  road has a lot for each of the house types (19 now, and room for 21). They do not cross and no lot of one touches a street or a lot of another; the set reaches 320 tiles from the centre, inside the review's
 *  map box (lab-boot.ts REVIEW_BOX); tests/lot-review.test.ts checks all of this */
export function sampleStreets(c: Pt): { a: Pt; b: Pt; base: 'road' }[] {
  const L = 280, h = L / Math.SQRT2;
  return [
    { a: { x: c.x - L / 2, y: c.y - 290 }, b: { x: c.x + L / 2, y: c.y - 290 }, base: 'road' },
    { a: { x: c.x + 290, y: c.y - L / 2 }, b: { x: c.x + 290, y: c.y + L / 2 }, base: 'road' },
    { a: { x: c.x - 280, y: c.y - 130 }, b: { x: c.x - 280 + h, y: c.y - 130 + h }, base: 'road' },
    { a: { x: c.x - 70, y: c.y + 300 }, b: { x: c.x - 70 + h, y: c.y + 300 - h }, base: 'road' },
  ];
}
/** the main house of a preset: its widest building that is a house (the clean base keeps the same one) */
function houseOfPreset(props: readonly { id: string; scale: number }[]): string | null {
  let best: string | null = null, area = 0;
  for (const q of props) { const it = LIBRARY[LIB_AT.get(q.id) ?? -1]; if (!it || !isBuilding(it) || roleOf(q.id) !== 'house') continue; const a = areaOf(q.id) * q.scale * q.scale; if (a > area) { area = a; best = baseOf(q.id); } }
  return best;
}
let PRESETS_OF: Map<string, string[]> | null = null, TYPE_OF: Map<string, string> | null = null;
/** the frozen built house presets by the house type they hold (a house palette entry's base id), in file order: what a sample lot forces to show that type */
function presetsByType(): { by: Map<string, string[]>; of: Map<string, string> } {
  if (!PRESETS_OF || !TYPE_OF) {
    PRESETS_OF = new Map(); TYPE_OF = new Map(); const pal = new Set(housePalette());
    for (const p of lotPresets()) {
      if (p.use !== 'res' || p.state !== 'built' || p.road !== undefined) continue;
      const t = houseOfPreset(p.props); if (!t || !pal.has(t)) continue;
      let a = PRESETS_OF.get(t); if (!a) PRESETS_OF.set(t, a = []); a.push(p.id); TYPE_OF.set(p.id, t);
    }
  }
  return { by: PRESETS_OF, of: TYPE_OF };
}
/** the house type (a house palette entry) the sample lot with this forced preset was laid to show, or null */
export const wantedOfPreset = (preset: string | undefined): string | null => (preset ? presetsByType().of.get(preset) ?? null : null);
/** the house type a sample lot was laid to show: the type forced on it (a type no frozen preset holds), or the one its frozen preset holds; null for any other lot */
export const wantedOf = (st: Pick<ComposeState, 'preset' | 'house'>): string | null => st.house ?? wantedOfPreset(st.preset);
/** the state of a sample lot: the lots of a road take the house types in the palette's order (the k-th lot of the road the k-th type, round again past the last), each as a frozen built preset that holds that type,
 *  or, for a type no frozen preset holds, the lot's own preset with that house in its place (ComposeState.house); at the top tier, built, no decline. A type that cannot face the road is swapped for one that
 *  can, as in the game. tally: how many lots each road has had (the caller's, one per staging). Deterministic from the seed and the lot's place in the road */
export function sampleState(seed: number, i: number, g: { n: Pt }, tally: Map<number, number>): ComposeState {
  const road = roadOf(g.n), k = tally.get(road) ?? 0; tally.set(road, k + 1);
  const pal = housePalette(), type = pal[k % pal.length]!, list = presetsByType().by.get(type), round = Math.floor(k / pal.length);
  const base: ComposeState = { use: LU.RES, level: LV.BUILT, decline: 0, seed: mix(seed, 0x403, i) % 100000, tier: 3 };
  return list?.length ? { ...base, preset: list[(round + mix(seed, 0x403, road)) % list.length]! } : { ...base, house: type };
}
