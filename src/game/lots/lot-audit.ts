// T385 (#1042): what a composed house lot holds, read the way the owner reads it in the lot review (src/game/dev/lot-review.ts): the four things a clean base is
// (clean-yards.ts: a house facing its road, a drive and a path, a fence, at most three trees), whether each is right, and every piece of clutter that
// stands there. The review shows it beside the owner's own ticks; the tests hold the composer to it. Pure over the library: no DOM.
import { LIBRARY } from '../library';
import { worldX, worldY } from '../iso';
import { isBuilding } from '../mirror';
import { hit, type Composition, type LotGeom } from './compose-core';
import { clutterKind, HEDGE_IDS, MAX_TREES } from './clean-yards';
import { facingView, pictureHeading, turnsBetween } from './house-facing';
import { buildingRect, rectHitsQuad, rectsHit, treeRects, type Rect } from './clean-lot';
import { footprintOf } from './preset-art';
import { frameOf, roadOf } from './preset-frame';
import { isFence } from './item-kinds';

const BY = new Map(LIBRARY.map(i => [i.id, i]));
const LIB_AT = new Map(LIBRARY.map((it, i) => [it.id, i] as const));
/** what the audit finds on a lot */
export interface LotAudit {
  /** a building stands on the lot (a lot with a yard and no building is the bug of T383, #1039) */
  house: boolean; buildings: number;
  /** how many eighth turns the house's picture is off the lot's street (0: its front faces the road; null: no house, or a picture the tables do not know) */
  facingOff: number | null;
  /** a drive or parking pad is laid, and its end is at the lot's front edge (it meets the road) */
  drive: boolean; driveConnects: boolean;
  /** a front path is laid, from the lot's front edge */
  path: boolean;
  /** the trees, and whether every one's picture (autumn and desert) stays off the buildings, the drive and the path */
  trees: number; treesClear: boolean;
  /** the boundary: fence panels, a hedge (a road at 45 degrees), or none; its pieces, and how many stand across the drive or the path */
  fence: 'panels' | 'hedge' | 'none'; fencePieces: number; fenceAcross: number;
  /** the clutter on the lot: each prop that is no house, garage, fence, hedge piece or tree (clean-yards.ts clutterKind), by id */
  clutter: string[];
}
/** a lot-frame point of a world point */
const frameOfPt = (g: LotGeom, x: number, y: number): [number, number] => { const dx = x - g.o.x, dy = y - g.o.y; return [dx * g.u.x + dy * g.u.y, dx * g.n.x + dy * g.n.y]; };
/** a patch's lowest b (its distance from the front edge, tiles) */
const frontOf = (g: LotGeom, pts: readonly number[]): number => { let m = Infinity; for (let i = 0; i + 1 < pts.length; i += 2) m = Math.min(m, frameOfPt(g, pts[i]!, pts[i + 1]!)[1]); return m; };
/** a patch's four corners on screen */
const onScreen = (pts: readonly number[]): number[] => { const o: number[] = []; for (let i = 0; i + 1 < pts.length; i += 2) o.push(worldX(pts[i]!, pts[i + 1]!), worldY(pts[i]!, pts[i + 1]!)); return o; };

/** the audit of a lot's composition (the lot's geometry g, the composition c as compose gives it) */
export function auditLot(g: LotGeom, c: Composition): LotAudit {
  const road = roadOf(g.n), f = frameOf(g);
  const builds = c.props.filter(p => { const it = BY.get(p.id); return !!it && isBuilding(it); });
  // the house: the widest building (its footprint area)
  let house = builds[0], area = 0;
  for (const b of builds) { const fp = footprintOf(b.id, b.scale, b.flip), a = (fp[2] - fp[0]) * (fp[3] - fp[1]); if (a > area) { area = a; house = b; } }
  const heading = house ? pictureHeading(house.id) : null;
  const facingOff = house ? (heading !== null ? turnsBetween(heading, road) : facingView(house.id, f).exact ? 0 : null) : null;
  // the ground: a drive (flagged), the path (a patch that is neither a drive nor the ground marks)
  const patches = c.ground.filter(a => a.tex !== 'marks' && a.pts.length >= 6);
  const drives = patches.filter(a => a.drive), paths = patches.filter(a => !a.drive);
  const quads = patches.map(a => onScreen(a.pts)), worldQuads = patches.map(a => a.pts);
  // the trees, in the autumn art and the desert art
  const trees = c.props.filter(p => { const it = BY.get(p.id); return it?.kind === 'tree' || it?.kind === 'palm'; });
  const houseRects: Rect[] = builds.map(b => { const fp = footprintOf(b.id, b.scale, b.flip); return buildingRect(LIB_AT.get(b.id)!, b.x, b.y, b.flip, b.scale, [b.x + fp[0], b.y + fp[1], b.x + fp[2], b.y + fp[3]]); });
  let treesClear = true;
  for (const t of trees) for (const r of treeRects(LIB_AT.get(t.id)!, t.x, t.y, t.flip, t.scale)) if (houseRects.some(h => rectsHit(r, h, 0)) || quads.some(q => rectHitsQuad(r, q))) treesClear = false;
  // the boundary: fence panels (kind fence) or the hedge's shrubs, and any that stand across the drive or the path
  const fences = c.props.filter(p => { const it = BY.get(p.id); return it?.kind === 'fencex' || it?.kind === 'fencey' || isFence(p.id); });
  const hedges = c.props.filter(p => HEDGE_IDS.has(p.id));
  const pieces = fences.length ? fences : hedges;
  const across = pieces.filter(p => { const fp = footprintOf(p.id, p.scale, p.flip), box: [number, number, number, number] = [p.x + fp[0], p.y + fp[1], p.x + fp[2], p.y + fp[3]]; return worldQuads.some(q => hit(box, q)); }).length;
  return {
    house: builds.length > 0, buildings: builds.length, facingOff,
    drive: drives.length > 0, driveConnects: drives.some(a => frontOf(g, a.pts) <= 0.4), path: paths.some(a => frontOf(g, a.pts) <= 0.4),
    trees: trees.length, treesClear: treesClear && trees.length <= MAX_TREES,
    fence: fences.length ? 'panels' : hedges.length ? 'hedge' : 'none', fencePieces: pieces.length, fenceAcross: across,
    clutter: c.props.filter(p => clutterKind(p.id) !== null).map(p => p.id),
  };
}
