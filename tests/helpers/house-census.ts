// T405: a headless census of a generated town's built house lots: which compose with no building ("why is there a lot with no house?", the owner, 2026-11-09).
// The town is the one a new game lays and the studio's Lot review stages as its 'town' set (Game.stageReview: townGrid's six blocks across, the lots LotMap cuts along and
// between its streets, each given review-set.ts townState(seed, i)); the streets at the eight road headings are the roads the player lays at 45 degrees (the T353 estate's
// way: golf/estate.ts frontageFrames along a street, each lot given the same town states). Pure and headless: no engine, no DOM. Written to run on older commits too (it
// reads only what T385 gave: compose, auditLot, townState, LotMap, frontageFrames; a commit before T405 lacks setLastHouse: take out the two lines that name it), so the
// census can be taken before and after a change.
import { MAP } from '../../src/game/iso';
import { RoadNetwork, CLASS, classOf, type ClassId } from '../../src/game/network';
import { NetEditor } from '../../src/game/netops';
import { LotMap } from '../../src/game/lots/lots';
import { townGrid } from '../../src/game/lots/seedtowns';
import { TC } from '../../src/game/terrain/types';
import { compose, setGeneratedLots, type ComposeState, type LotGeom } from '../../src/game/lots/compose';
import { setLastHouse } from '../../src/game/lots/compose';
import { setCleanYards } from '../../src/game/lots/clean-yards';
import { auditLot } from '../../src/game/lots/lot-audit';
import { roadOf } from '../../src/game/lots/preset-frame';
import { townState } from '../../src/game/dev/review-set';
import { frontageFrames } from '../../src/game/golf/estate';

(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

/** a lot of a census: where it is (set, key), its frame, the state a town gives it, and its road heading (0..7: 0, 2, 4, 6 lie along a map axis, 1, 3, 5, 7 at 45 degrees) */
export interface CensusLot { set: string; key: string; g: LotGeom; st: ComposeState; road: number }

/** the lots of the town a new game lays (the Lot review's 'town' set, headless): six blocks of streets and avenues on open ground, cut into lots by the lot map; the i-th lot in key order
 *  has townState(seed, i). Only the map-axis roads occur (the grid is a square lattice) */
export function townLots(seed = 1): CensusLot[] {
  const c = { x: MAP / 2, y: MAP / 2 }, gr = townGrid(c, 6, () => TC.GROUND), byClass = new Map<ClassId, typeof gr.legs>();
  gr.legs.forEach((l, i) => { const id = gr.cls[i]!; let a = byClass.get(id); if (!a) byClass.set(id, a = []); a.push(l); });
  const edit = new NetEditor(new RoadNetwork());
  for (const [id, legs] of byClass) edit.addLegs(legs, classOf(id), 0, undefined, true);
  edit.commit();
  const frames = new LotMap().update(edit.net, null).added.map(l => ({ key: l.key, g: { o: l.o, u: l.u, n: l.n, w: l.w, d: l.d } as LotGeom })).sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return frames.map((f, i) => ({ set: `town:${seed}`, key: f.key, g: f.g, st: townState(seed, i), road: roadOf(f.g.n) }));
}

/** the four directions a player's roads take, with the two at 45 degrees (along (1, 1) and (1, -1)): both sides of each give the eight road headings */
const HEADINGS = [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: Math.SQRT1_2, y: Math.SQRT1_2 }, { x: Math.SQRT1_2, y: -Math.SQRT1_2 }];
/** the lots along straight streets of the three widths a town's lots take (street 10, road 12.5, avenue 15 tiles of frontage), one of each width in each of the four directions, both sides of
 *  each: every road heading, every lot width. States are townState(seed, i) again (the tier, the level, the decline a town deals) */
export function roadLots(seed = 1): CensusLot[] {
  const out: { set: string; key: string; g: LotGeom }[] = [];
  const c = { x: MAP / 2, y: MAP / 2 };
  HEADINGS.forEach((h, hi) => (['street', 'road', 'avenue'] as const).forEach((base, bi) => {
    const cls = CLASS[base]!, o = { x: c.x - 600 + hi * 300 + bi * 60, y: c.y - 600 + bi * 400 }, L = 160;
    const a = o, b = { x: o.x + h.x * L, y: o.y + h.y * L };
    for (const f of frontageFrames({ a, b, base, h: cls.h, walk: cls.walk, ra: 4, rb: 4 }, [1, -1], hi * 3 + bi)) out.push({ set: `road:${seed}:${base}`, key: `${hi}.${base}.${f.side > 0 ? 'l' : 'r'}${f.k}`, g: { o: f.o, u: f.u, n: f.n, w: f.w, d: f.d } });
  }));
  return out.map((l, i) => ({ ...l, st: townState(seed, i), road: roadOf(l.g.n) }));
}

/** the census of a list of lots: how many compose with no building at all, by road heading, and the empty ones themselves */
export interface Census { total: number; empty: number; byRoad: { total: number; empty: number }[]; emptyLots: CensusLot[] }
/** last: with the last house on (the game's way; false: a lot no candidate gave a house is left empty, as after T398) */
export function census(lots: readonly CensusLot[], last = true): Census {
  setGeneratedLots(true); setCleanYards(true);
  setLastHouse(last);
  const byRoad = Array.from({ length: 8 }, () => ({ total: 0, empty: 0 })), emptyLots: CensusLot[] = [];
  for (const l of lots) {
    const a = auditLot(l.g, compose(l.g, l.st)), r = byRoad[l.road]!;
    r.total++;
    if (!a.house) { r.empty++; emptyLots.push(l); }
  }
  return { total: lots.length, empty: emptyLots.length, byRoad, emptyLots };
}
/** a census as one line per road heading, for a report */
export function report(name: string, c: Census): string {
  const rows = c.byRoad.map((r, i) => (r.total ? `road ${i}: ${r.empty}/${r.total}` : '')).filter(Boolean).join(', ');
  return `${name}: ${c.empty} of ${c.total} built house lots compose with no building (${rows})`;
}
