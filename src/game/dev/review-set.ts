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
import { reviewId, type Check, type ReviewOverride, type ReviewRecord } from '../lots/review-file';

/** the two sets */
export type ReviewKind = 'town' | 'estate';
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
  return {
    house: [a.house && (a.facingOff === 0 || a.facingOff === null), a.house ? `${a.buildings} building${a.buildings === 1 ? '' : 's'}, ${turns}` : 'no house on the lot'],
    drive: [a.drive && a.driveConnects && a.path, `${a.drive ? (a.driveConnects ? 'drive meets the road' : 'drive does not reach the road') : 'no drive or parking'}, ${a.path ? 'front path' : 'no front path'}`],
    trees: [a.trees <= 3 && a.treesClear, `${a.trees} tree${a.trees === 1 ? '' : 's'}${a.treesClear ? ', clear of the house, drive and path' : ', one covers the house, drive or path'}`],
    fence: [a.fence !== 'none' && a.fenceAcross === 0, a.fence === 'none' ? 'no fence' : `${a.fencePieces} ${a.fence === 'hedge' ? 'hedge shrubs' : 'fence panels'}${a.fenceAcross ? `, ${a.fenceAcross} across the drive or path` : ''}`],
  };
}

