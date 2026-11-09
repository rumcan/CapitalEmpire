// T385 (#1042, #1039; the owner, 2026-11-08: "something needs to make sure every single lot is first and foremost logical and looks good before it adds a shit ton of
// crap. A house looking at the road with an appropriate driveway or parking area and fence. 3 trees and that is it ... remove all cars and mail boxes and shit. all of it."):
// the clean base of a house lot. A built house lot is composed in this order and nothing more: the house facing its road, its drive and front path, the fence of the lines it
// owns, at most three trees clear of all of them (in the autumn art and the desert art); no clutter is ever generated; a lot is a house with its base or an empty lot (never a
// yard with no house); the old saves compose their house lots clean (the models still tell the other uses apart); the old yards stay as an option. Headless.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { compose, housePalette, lotModelVersion, lotPresets, setLotModel, type ComposeState, type LotGeom } from '../src/game/lots/compose';
import { LATEST, LOT_MODELS } from '../src/game/lots/lot-models';
import { CLEAN_MODEL, HEDGE_IDS, MAX_TREES, cleanYards, clutterKind, isClutter, setCleanYards } from '../src/game/lots/clean-yards';
import { auditLot } from '../src/game/lots/lot-audit';
import { facingView, bestFacing, pictureHeading, turnsBetween } from '../src/game/lots/house-facing';
import { buildingRect, cleanGround, rectHitsQuad, rectsHit } from '../src/game/lots/clean-lot';
import { DESERT_THEME } from '../src/game/newart';
import { frameOf, roadOf } from '../src/game/lots/preset-frame';
import { footprintOf } from '../src/game/lots/preset-art';
import { frontageFrames } from '../src/game/golf/estate';
import { estateState, estateStreets } from '../src/game/dev/review-set';
import { HEDGE } from '../src/game/lots/autolot';
import { LU, LV } from '../src/game/lots/town';
import { mulberry, worldX, worldY } from '../src/game/iso';
import { LIBRARY } from '../src/game/library';
import { isBuilding } from '../src/game/mirror';
import { CLASS } from '../src/game/network';

(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };
const BY = new Map(LIBRARY.map(i => [i.id, i]));
const H = Math.SQRT1_2;
/** the lot's away vector n by road (presets.ts Road: the street lies along -n): 0 the street on +y ... 7 */
const NS = [{ x: 0, y: -1 }, { x: -H, y: -H }, { x: -1, y: 0 }, { x: -H, y: H }, { x: 0, y: 1 }, { x: H, y: H }, { x: 1, y: 0 }, { x: H, y: -H }];
const geom = (road: number, w: number, d: number, o = { x: 300, y: 300 }): LotGeom => { const n = NS[road]!, u = { x: -n.y, y: n.x }; return { o, u, n, w, d }; };

/** a seeded sample of house lots: every road, size, level, decline, tier and seed the town deals */
function sample(count: number, seed: number, roads: readonly number[] = [0, 1, 2, 3, 4, 5, 6, 7]): { g: LotGeom; st: ComposeState; road: number }[] {
  const r = mulberry(seed);
  return Array.from({ length: count }, () => {
    const road = roads[Math.floor(r() * roads.length)]!, w = [8, 10, 12, 12.5, 14, 15, 16.5, 20][Math.floor(r() * 8)]!, d = [14, 15, 16, 18, 19, 20][Math.floor(r() * 6)]!;
    const tier = [undefined, 0, 1, 2, 3][Math.floor(r() * 5)], o = { x: 200 + Math.floor(r() * 400), y: 200 + Math.floor(r() * 400) };
    const st: ComposeState = { use: LU.RES, level: r() < 0.7 ? LV.BUILT : LV.UPGRADED, decline: [0, 0, 0, 1, 2, 3][Math.floor(r() * 6)]!, seed: Math.floor(r() * 100000), ...(tier !== undefined ? { tier } : {}) };
    return { g: geom(road, w, d, o), st, road };
  });
}
const LOTS = sample(700, 0x385a);
const isTree = (id: string) => BY.get(id)?.kind === 'tree' || BY.get(id)?.kind === 'palm';
const isFenceId = (id: string) => /fence-privacy/.test(id);

describe('the clean base of a house lot (T385)', () => {
  it('1. the order: the house (and its garage), then the fence, then the trees; the ground the drive, then the path; nothing else', () => {
    setCleanYards(true);
    for (const { g, st } of LOTS) {
      const c = compose(g, st), kinds = c.props.map(p => (isBuilding(BY.get(p.id)!) ? 'house' : isFenceId(p.id) || HEDGE_IDS.has(p.id) ? 'fence' : isTree(p.id) ? 'tree' : 'other'));
      assert.ok(!kinds.includes('other'), `only a house, a fence and trees: ${c.props.map(p => p.id).join(', ')}`);
      const rank = { house: 0, fence: 1, tree: 2 } as const, order = kinds.map(k => rank[k as keyof typeof rank]);
      assert.deepEqual(order, [...order].sort((a, b) => a - b), 'the house first, the fence next, the trees last');
      // (the ground: the drive, then the path; no yard, bed, car park or decal)
      const ground = c.ground.filter(a => a.tex !== 'marks');
      assert.ok(ground.length <= 2, `at most a drive and a path: ${ground.length}`);
      if (ground.length === 2) assert.ok(ground[0]!.drive && !ground[1]!.drive, 'the drive first, then the path');
      assert.equal(c.ground.filter(a => a.tex === 'marks').length, 0, 'no ground decal on a clean house lot');
    }
  });

  it('2. no clutter is ever generated: no car, trailer, boat, mailbox, bin, crate, toy, hoop, trampoline, barbecue or junk, in every town, road, state, tier and seed', () => {
    setCleanYards(true);
    const WORDS = /mailbox|trash|dumpster|\bbin\b|crate|barrel|drum|pallet|cars:|trailer|boat|canoe|camper|caravan|mobile-home|trampoline|basketball|hoop|barbecue|bbq|grill|swing|sandbox|bike|tricycle|junk|scrap|tyre|appliance|woodpile|compost|leaf-bags|doghouse|hydrant|bench|pram|wagon|firepit|lawn-chair|picnic|washing-line/i;
    let houses = 0;
    for (const { g, st } of LOTS) {
      const c = compose(g, st), a = auditLot(g, c);
      // (a building is the house or its garage: the audit, which leaves the house out, finds any other)
      for (const p of c.props) { if (isBuilding(BY.get(p.id)!)) continue; assert.ok(!isClutter(p.id), `${p.id} is clutter (${clutterKind(p.id)})`); assert.ok(!WORDS.test(`${p.id} ${BY.get(p.id)?.name ?? ''}`), `${p.id} reads as clutter`); }
      assert.deepEqual(a.clutter, [], 'the audit finds none');
      houses += a.house ? 1 : 0;
    }
    assert.ok(houses > LOTS.length * 0.85, `${houses} of ${LOTS.length} lots have their house`);
  });

  it('3. the house faces the road on all four road sides (the best view the library has), and on the roads at 45 degrees where the art has the view', () => {
    setCleanYards(true);
    let axis = 0, diag = 0, off1 = 0, unknown = 0;
    for (const { g, st, road } of sample(500, 0x3851)) {
      const c = compose(g, st), a = auditLot(g, c); if (!a.house) continue;
      if (road % 2 === 0) { axis++; assert.equal(a.facingOff, 0, `road ${road}: the house's front meets the street`); }
      else { diag++; if (a.facingOff === null) unknown++; else { assert.ok(a.facingOff <= 1, `road ${road}: the nearest view at worst: ${a.facingOff}`); if (a.facingOff === 1) off1++; } }
    }
    assert.ok(axis > 150 && diag > 100, `${axis} axis lots and ${diag} lots at 45 degrees seen (${off1} on the nearest corner, ${unknown} unknown)`);
    assert.ok(unknown < diag * 0.1, `${unknown} of ${diag} lots at 45 degrees show a picture the view tables do not know`);
    // the four sides one house at a time: a dwelling with its views shows its front to the street on a map-axis road, and the town has plenty of them
    for (const road of [0, 2, 4, 6]) {
      const n = NS[road]!, f = frameOf({ o: { x: 0, y: 0 }, u: { x: -n.y, y: n.x }, n, w: 10, d: 16 }), exact = housePalette().filter(id => facingView(id, f).exact);
      assert.ok(exact.length >= 10, `${exact.length} dwellings face road ${road}`);
      for (const id of exact) assert.equal(pictureHeading(facingView(id, f).id), road, `${id} on road ${road}`);
    }
  });

  it('4. a drive only where a garage door faces the street, from the road to that door; a front path from the road to the front door (T398: no garage, no drive)', () => {
    setCleanYards(true);
    let parked = 0, garages = 0, drives = 0; const lacking: string[] = [];
    for (const { g, st } of LOTS) {
      const a = auditLot(g, compose(g, st)); if (!a.house) continue;
      parked++; if (a.garage) garages++; if (a.drive) drives++;
      if (!(a.driveOk && a.pathAtDoor && (!a.drive || a.driveConnects) && a.path)) lacking.push(`${g.w}x${g.d} road ${roadOf(g.n)} seed ${st.seed}: garage ${a.garage} drive ${a.drive} (ok ${a.driveOk}, meets ${a.driveConnects}) path ${a.path} (at the door ${a.pathAtDoor})`);
    }
    assert.ok(parked > 600, `${parked} lots checked`);
    assert.equal(drives, garages, 'a drive on every lot with a garage door facing the street, and on no other');
    assert.ok(lacking.length <= parked * 0.01, `${lacking.length} of ${parked} house lots have a drive that misses its garage door (or a drive and no garage), or a path that misses the door: ${lacking.slice(0, 4).join(' | ')}`);
  });

  it('5. at most three trees, clear of the house, its roof, the drive and the path, as the autumn tree and as the desert palm or rock', () => {
    setCleanYards(true);
    let withTrees = 0, three = 0, total = 0;
    for (const { g, st } of LOTS) {
      const a = auditLot(g, compose(g, st)); if (!a.house) continue;
      total++; assert.ok(a.trees <= MAX_TREES, `${a.trees} trees`); assert.ok(a.treesClear, 'every tree\'s picture (autumn and desert) stays off the house, the drive and the path');
      if (a.trees) withTrees++; if (a.trees === MAX_TREES) three++;
    }
    assert.ok(withTrees > total * 0.8 && three > total * 0.25, `${withTrees} of ${total} lots have trees, ${three} have three`);
  });

  it('5b. with the desert theme on, the palm or rock the engine draws for each tree (newart.ts lookOf, desertPick: the same spot, the same plant) covers no house, drive or path', () => {
    setCleanYards(true);
    const at = new Map(LIBRARY.map((it, i) => [it.id, i] as const));
    let checked = 0;
    DESERT_THEME.on = true;
    try {
      for (const { g, st } of LOTS.slice(0, 250)) {
        const c = compose(g, st), houses = c.props.filter(p => isBuilding(BY.get(p.id)!)).map(p => { const fp = footprintOf(p.id, p.scale, p.flip); return buildingRect(at.get(p.id)!, p.x, p.y, p.flip, p.scale, [p.x + fp[0], p.y + fp[1], p.x + fp[2], p.y + fp[3]]); });
        const quads = c.ground.filter(a => a.tex !== 'marks').map(a => a.pts.flatMap((v, i) => (i % 2 ? [] : [worldX(v, a.pts[i + 1]!), worldY(v, a.pts[i + 1]!)])));
        for (const p of c.props) {
          if (!isTree(p.id)) continue;
          const drawn = buildingRect(at.get(p.id)!, p.x, p.y, p.flip, p.scale);
          assert.ok(!houses.some(h => rectsHit(drawn, h, 0)), `${p.id} covers the house at ${p.x.toFixed(1)},${p.y.toFixed(1)}`); assert.ok(!quads.some(q => rectHitsQuad(drawn, q)), `${p.id} covers the drive or the path`);
          checked++;
        }
      }
    } finally { DESERT_THEME.on = false; }
    assert.ok(checked > 100, `${checked} trees checked`);
  });

  it('6. the fence runs along the lines the lot owns and never across the drive or the path', () => {
    setCleanYards(true);
    let fenced = 0;
    for (const { g, st } of LOTS) {
      const a = auditLot(g, compose(g, st)); if (!a.house) continue;
      assert.equal(a.fenceAcross, 0, 'no panel or shrub across the drive or the path');
      if (a.fence !== 'none') fenced++;
    }
    assert.ok(fenced > 600, `${fenced} lots fenced`);
    // (a road at 45 degrees takes a hedge, no fence picture runs along a screen axis; a map-axis road takes panels)
    const axis = auditLot(geom(0, 12, 16), compose(geom(0, 12, 16), { use: LU.RES, level: LV.BUILT, decline: 0, seed: 3 })), diag = auditLot(geom(1, 12, 16), compose(geom(1, 12, 16), { use: LU.RES, level: LV.BUILT, decline: 0, seed: 3 }));
    assert.ok(axis.fence === 'panels' || axis.fence === 'none'); assert.ok(diag.fence === 'hedge' || diag.fence === 'none');
    for (const id of HEDGE) assert.ok(HEDGE_IDS.has(id), `${id} is a boundary shrub, not a yard plant`);
  });

  it('7. a lot has its house or is an empty lot: never a yard, drive or path with no house (T383, #1039)', () => {
    setCleanYards(true);
    let empty = 0;
    for (const { g, st } of sample(1500, 0x3852)) {
      const c = compose(g, st), a = auditLot(g, c);
      if (a.house) continue;
      empty++;
      assert.ok(c.props.every(p => isFenceId(p.id) || HEDGE_IDS.has(p.id)), 'an empty lot holds its fence lines alone'); assert.equal(c.ground.length, 0, 'and no ground of its own');
    }
    // the starter lots too (tier 0: a trailer or a mobile home was drawn in the house's place, and the lot's yard round no house)
    let starters = 0;
    for (const { g, st } of sample(400, 0x3853)) { if (st.tier !== 0) continue; const a = auditLot(g, compose(g, { ...st, tier: 0 })); starters++; assert.ok(a.house || a.trees === 0, 'a starter lot is a house or an empty lot'); }
    assert.ok(starters > 20 && empty < 200, `${empty} empty lots of 1500, ${starters} starter lots`);
  });

  it('8. old saves compose their house lots clean (every model version); only the house yards change: the other uses compose as they did', () => {
    const was = lotModelVersion();
    try {
      const houses = sample(60, 0x3854);
      for (const v of [1, 2, 3, 4, 5]) {
        setCleanYards(true); setLotModel(v);
        for (const { g, st } of houses) { const a = auditLot(g, compose(g, st)); assert.deepEqual(a.clutter, [], `model v${v}`); assert.ok(a.trees <= MAX_TREES); }
      }
      // the other uses: the same composition clean or old (the switch moves house yards alone), and the same under v4 and v5 (v5 holds v4's data)
      const others: { g: LotGeom; st: ComposeState }[] = sample(120, 0x3855).map((l, i) => ({ g: l.g, st: { ...l.st, use: [LU.COM, LU.IND, LU.TOUR, LU.GOV][i % 4]! } }));
      for (const v of [3, 4]) {
        setLotModel(v); setCleanYards(false); const old = others.map(l => JSON.stringify(compose(l.g, l.st)));
        setCleanYards(true); const now = others.map(l => JSON.stringify(compose(l.g, l.st)));
        assert.deepEqual(now, old, `v${v}: a shop, a yard, a venue or a civic lot is as it was`);
      }
      setCleanYards(true); setLotModel(4); const four = others.map(l => JSON.stringify(compose(l.g, l.st))); setLotModel(5); assert.deepEqual(others.map(l => JSON.stringify(compose(l.g, l.st))), four, 'v5 lays the other uses as v4 does');
    } finally { setLotModel(was); setCleanYards(true); }
  });

  it('9. the lot model goes up: a new town records the clean base (LATEST), v5 carries v4\'s data; the old yards stay as an option (setCleanYards(false), ?oldyards)', () => {
    assert.equal(LATEST, 5); assert.equal(CLEAN_MODEL, LATEST); assert.ok(LOT_MODELS[LATEST] && LOT_MODELS[4]);
    const v4 = LOT_MODELS[4] as Record<string, unknown>, v5 = LOT_MODELS[5] as Record<string, unknown>;
    for (const k of Object.keys(v4)) if (k !== 'v' && k !== 'from') assert.deepEqual(v5[k], v4[k], `v5 ${k}`);
    assert.equal(v5.v, 5);
    try {
      setCleanYards(false); assert.equal(cleanYards(), false);
      let clutter = 0;
      for (const { g, st } of sample(300, 0x3856)) clutter += auditLot(g, compose(g, st)).clutter.length;
      assert.ok(clutter > 300, `the old yards: ${clutter} pieces of clutter in 300 lots`);
    } finally { setCleanYards(true); }
    assert.equal(cleanYards(), true);
  });

  it('10. the same lot composes the same every time; neighbours differ; the lot lab\'s forced preset is left as the owner lays it out', () => {
    setCleanYards(true);
    const lots = sample(40, 0x3857), a = lots.map(l => JSON.stringify(compose(l.g, l.st))), b = [...lots].reverse().map(l => JSON.stringify(compose(l.g, l.st))).reverse();
    assert.deepEqual(a, b); assert.ok(new Set(a).size > 20, 'neighbours differ');
    // (the lab's forced preset, or its forced template, is the owner's own layout: the clean base leaves it as it is)
    const forced = lotPresets().find(q => q.use === 'res' && q.whole && q.road === 0)!, g = geom(0, forced.w, forced.d), st: ComposeState = { use: LU.RES, level: LV.BUILT, decline: 0, seed: 11, preset: forced.id };
    const now = JSON.stringify(compose(g, st)); setCleanYards(false); const old = JSON.stringify(compose(g, st)); setCleanYards(true);
    assert.equal(now, old); assert.ok(compose(g, st).props.length > 12, "an owner's own preset keeps its props");
  });

  it('11. T353\'s estate lots (frontageFrames along its streets, the estate\'s own seeds) are the same clean lots', () => {
    setCleanYards(true);
    const frames = estateStreets({ x: 512, y: 512 }).flatMap((s, seg) => frontageFrames({ a: s.a, b: s.b, base: s.base, h: CLASS[s.base].h, walk: CLASS[s.base].walk, ra: 4, rb: 4 }, [1, -1], seg));
    assert.ok(frames.length > 30, `${frames.length} estate lots`);
    let houses = 0;
    frames.forEach((f, i) => {
      const g: LotGeom = { o: f.o, u: f.u, n: f.n, w: f.w, d: f.d }, c = compose(g, estateState(7, i)), a = auditLot(g, c);
      assert.deepEqual(a.clutter, []); assert.ok(a.trees <= MAX_TREES && a.treesClear); assert.equal(a.fenceAcross, 0);
      if (a.house) { houses++; assert.ok(a.facingOff !== null && a.facingOff <= 1); assert.ok(a.driveOk && a.pathAtDoor && a.path); }
    });
    assert.ok(houses > frames.length * 0.85, `${houses} of ${frames.length} estate lots have their house`);
  });
});

describe('house-facing.ts: the one function that picks the view facing the road (T385, T375)', () => {
  it('a building\'s picture on a lot and how well it faces: exact, or the eighth turns off; the best of a list', () => {
    assert.equal(turnsBetween(0, 0), 0); assert.equal(turnsBetween(7, 0), 1); assert.equal(turnsBetween(2, 6), 4); assert.equal(turnsBetween(1, 6), 3);
    const id = housePalette()[0]!;
    for (const road of [0, 2, 4, 6]) { const n = NS[road]!, f = frameOf({ o: { x: 0, y: 0 }, u: { x: -n.y, y: n.x }, n, w: 10, d: 16 }); assert.equal(facingView(id, f).exact, true); assert.equal(bestFacing([id], f)?.facing.off, 0); }
    assert.equal(bestFacing([], frameOf({ o: { x: 0, y: 0 }, u: { x: 1, y: 0 }, n: { x: 0, y: 1 }, w: 10, d: 16 })), null);
  });
});

describe('clean-lot.ts: the drive, the path, the pad (T385)', () => {
  const sq = (x0: number, y0: number, x1: number, y1: number) => [x0, y0, x1, y0, x1, y1, x0, y1];
  it('keeps a preset\'s drive and walk; an owner\'s paved strips from the street are a drive and a path; the rest of the ground goes', () => {
    const frozen = cleanGround([{ kind: 'drive', tex: 'paving', pts: sq(0, 0, 1.6, 7.7) }, { kind: 'walk', tex: 'paving', pts: sq(4, 0, 4.6, 3.2) }, { kind: 'bed', tex: 'field', pts: sq(3, 12, 7, 15) }], 8, 16, [2.4, 4.5, 7, 9]);
    assert.equal(frozen.drive?.kind, 'drive'); assert.equal(frozen.walk?.kind, 'walk'); assert.equal(frozen.parking, 'drive');
    const owner = cleanGround([{ kind: 'yard', tex: 'paving', pts: sq(0, 0, 1.6, 7.25) }, { kind: 'yard', tex: 'paving', pts: sq(5, 0, 5.6, 3.6) }, { kind: 'yard', tex: 'dirt', pts: sq(2, 8, 6, 11) }], 10, 15, [2.5, 4.5, 8, 9]);
    assert.equal(owner.drive?.kind, 'drive'); assert.equal(owner.walk?.kind, 'walk'); assert.equal(owner.drive!.pts.length, 8);
  });
  it('makes a drive beside the house and a path to its door where a preset has none; a parking pad in front when the house fills the width; nothing on a lot too small', () => {
    const made = cleanGround([], 12, 16, [5, 5, 9, 9]);
    assert.equal(made.parking, 'drive'); assert.ok(made.drive && Math.min(...made.drive.pts.filter((_, i) => i % 2 === 1)) === 0, 'it starts at the street'); assert.ok(made.walk);
    const pad = cleanGround([], 8, 16, [0.5, 5, 7.5, 9]);
    assert.equal(pad.parking, 'pad'); assert.ok(pad.drive && Math.max(...pad.drive.pts.filter((_, i) => i % 2 === 1)) <= 5 - 0.6 + 1e-9, 'the pad stays in front of the house');
    const none = cleanGround([], 8, 16, [0.5, 1, 7.5, 9]);
    assert.equal(none.drive, null);
  });
  it('a rectangle and a convex quad: overlap is overlap, touching is not', () => {
    const quad = [0, 0, 10, 0, 10, 10, 0, 10];
    assert.equal(rectHitsQuad([5, 5, 15, 15], quad), true); assert.equal(rectHitsQuad([10, 0, 20, 10], quad), false); assert.equal(rectHitsQuad([11, 11, 20, 20], quad), false);
  });
});
