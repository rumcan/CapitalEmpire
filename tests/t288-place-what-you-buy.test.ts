// T288 (#873, the owner 2026-10-31: "every upgrade should be something the user can place himself when he buys it. it doesnt auto build
// everything. Let him also place the first parking lot. let him place the driving range and the practice area himself. only his trailer and plot
// is there. no tee box, nothing. And make cart paths and roads its own button above facilities in the main left menu"; 2026-11-04, asked whether
// to unlock the road tool from the start of a new game: "Yes, unlock it"). The bare start, the placement helper (golf/placing.ts) and its
// checks for the range, its car park, the practice area and the upgrades, the save, the guide's placement steps, the rail's Cart paths & roads.
// The in-game run (each placement refused and fine, nothing built before its click) is scripts/dev/bare-start-shots.mjs.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CAR_PARK_PLACE_COST, PRACTICE_PLACE_COST, RANGE_PLACE_COST, framePt, landWhy, placeVerdict, rangeSpotAt, rectAt, rectSamples, rectsMeet, type LandCheck, type Placeable } from '../src/game/golf/placing';
import { plotOfFront, plotPoint, RANGE_PLOT } from '../src/game/golf/range';
import { NEAR, SETBACK } from '../src/game/golf/rangestart';
import { RANGE_UPGRADES, defaultRangeBiz, homeScene, homeYardBox, normalizeRangeBiz, rangeScene, rangeStructures, rangeTakes, upgradeFoot, upgradeWhy, withUpgrade, type RangeBizSave, type RangeUpgradeId } from '../src/game/golf/rangebiz';
import { NO_PRACTICE, PRACTICE_UV, inPractice, practiceAreaAt, practiceDims } from '../src/game/golf/practice';
import { PLACED_STEPS, RANGE_GUIDE, newRangeGuide, rangeGuideCurrent, rangeGuideTick, type GuideFacts } from '../src/game/ext/progressive-ui/guide';
import { TOOL_STAGE, GROUP_STAGE, RAMP_TOAST } from '../src/game/ext/progressive-ui';
import { TOWN_TOUR, tourStepFor } from '../src/game/ext/progressive-ui/tour';
import { RAIL, railEntries } from '../src/ui/rail-items';
import type { Rect } from '../src/game/golf/mode';

const homes: Record<0 | 1 | 2 | 3, Rect> = { 0: [500, 600, 70, 150], 1: [900, 300, 150, 70], 2: [200, 200, 70, 150], 3: [1200, 1300, 150, 70] };
const FACINGS = [0, 1, 2, 3] as const;
const bare = (): RangeBizSave => ({ ...defaultRangeBiz(), setback: SETBACK, built: false, home: [...homes[2]] as Rect, practiceAt: null });

describe('T288: the bare start (only the trailer and the plot)', () => {
  it('a new range game lays the county road alone: no drive, no range, no car park, no practice lot; the range not built, its home and no practice area', () => {
    const eng = readFileSync('src/game/engine.ts', 'utf8'), body = eng.slice(eng.indexOf('  private newRangeGame(): boolean {'), eng.indexOf('  private onRangePlot('));
    assert.match(body, /this\.edit\.addLegs\(road\.legs, CLASS\.road, 0, road\.kinds, true\);/, 'the county road');
    assert.doesNotMatch(body, /site\.drive|site\.carpark|practiceLot =|type: 'range'/, 'no drive, no car park, no range business, no practice lot for sale');
    assert.match(body, /this\.setBizDefs\(\[\]\); this\.parkDefs = \[\];/);
    assert.match(body, /built: false, home: \[\.\.\.site\.rangePlot\], practiceAt: null/);
    assert.match(body, /this\.setTool\('select'\)/, 'no panel opens: Select');
  });
  it('the home alone: the trailer, its yard, its fence; no shop, no tee box, no mats, no outfield; its gate beside the yard', () => {
    for (const f of FACINGS) {
      const hs = homeScene(homes[f], f, bare()), ids = hs.pieces.map(p => p.id);
      assert.ok(ids.includes('expansion:pop-up-caravan'), `${f}: the trailer`);
      assert.ok(hs.pieces.some(p => p.key.startsWith('yard-n')), `${f}: the yard's fence`);
      assert.ok(!hs.pieces.some(p => /^(shop|sign|bench|mark|flag|roof)/.test(p.key)), `${f}: nothing of the range`);
      assert.deepEqual(hs.patches.map(p => p.surf), ['yard'], `${f}: only the yard's ground`);
      const [x0, y0, x1, y1] = hs.box;
      for (const p of hs.pieces) assert.ok(p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1, `${f}: ${p.key} in the yard's box`);
      assert.ok(!(hs.gate.x > x0 + 1 && hs.gate.x < x1 - 1 && hs.gate.y > y0 + 1 && hs.gate.y < y1 - 1), `${f}: the gate outside the yard`);
    }
  });
  it('the range card refuses every upgrade until the range is placed; the save keeps built, home and practiceAt; an old save has none of them', () => {
    const s = bare();
    for (const u of RANGE_UPGRADES) assert.equal(upgradeWhy(s, u.id, 1e9), 'Place your driving range first', u.id);
    const back = normalizeRangeBiz(JSON.parse(JSON.stringify(s)));
    assert.equal(back.built, false); assert.deepEqual(back.home, s.home); assert.equal(back.practiceAt, null);
    const placed = normalizeRangeBiz(JSON.parse(JSON.stringify({ ...s, built: undefined, practiceAt: [10, 20, 36, 34] })));
    assert.equal(placed.built, undefined); assert.deepEqual(placed.practiceAt, [10, 20, 36, 34]);
    // a save from before T288: built, its home on its plot, its practice area on the plot's own spot
    const old = normalizeRangeBiz({ v: 1, owned: ['greens'], price: 6, desert: true, guided: true });
    assert.equal(old.built, undefined); assert.equal(old.home, undefined); assert.equal(old.practiceAt, undefined);
    assert.equal(upgradeWhy(old, 'bays8', 1e9), '', 'an old save buys as before');
    assert.deepEqual(normalizeRangeBiz({ ...s, home: [1, 2, 0, 3], practiceAt: 'x' }).home, undefined, 'junk dropped');
  });
});

describe('T288: the placement helper (golf/placing.ts)', () => {
  it('the range slides along the county road and back from it, its front toward the road; on its start spot it is the start\'s plot', () => {
    for (const f of FACINGS) {
      const home = homes[f], at = (u: number, v: number) => plotPoint(home, f, u, v);
      const p0 = at(RANGE_PLOT[0] / 2, 12), s0 = rangeSpotAt(home, f, p0.x, p0.y);
      assert.deepEqual(s0.plot, home, `${f}: the start spot`); assert.equal(s0.setback, SETBACK); assert.deepEqual([s0.du, s0.dv], [0, 0]);
      assert.deepEqual(plotOfFront(s0.front, f), s0.plot, `${f}: the front's plot is the plot`);
      // the drive: from J on the road's line (NEAR + set-back in front of the plot) to its end beside the car park; the door on the front
      const J = framePt(s0.plot, f, s0.J.x, s0.J.y); assert.deepEqual([Math.round(J.u), Math.round(J.v)], [RANGE_PLOT[0] + 2, -NEAR - SETBACK]);
      // slid 40 along the road and 30 back: the plot moves with it, J stays on the road's line
      const p1 = at(RANGE_PLOT[0] / 2 + 40, 12 + 30), s1 = rangeSpotAt(home, f, p1.x, p1.y);
      assert.deepEqual([s1.du, s1.dv], [40, 30]); assert.equal(s1.setback, SETBACK + 30);
      const J1 = framePt(home, f, s1.J.x, s1.J.y); assert.deepEqual([Math.round(J1.u), Math.round(J1.v)], [RANGE_PLOT[0] + 2 + 40, -NEAR - SETBACK], `${f}: J on the same road line`);
      // never nearer the road than the start's set-back (its car park keeps its frontage strip)
      const p2 = at(RANGE_PLOT[0] / 2, -30), s2 = rangeSpotAt(home, f, p2.x, p2.y); assert.equal(s2.dv, 0);
      assert.equal(framePt(home, f, p1.x, p1.y).u, RANGE_PLOT[0] / 2 + 40, 'framePt inverts plotPoint');
    }
  });
  it('a range placed on its start spot leaves the home where it stands (the home corner is not the range\'s); slid onto the home, it meets it', () => {
    for (const f of FACINGS) {
      const home = homes[f], y = homeYardBox(home, f), yard: Rect = [y[0], y[1], y[2] - y[0], y[3] - y[1]];
      assert.ok(!rangeTakes(home, f).some(r => rectsMeet(r, yard)), `${f}: the start spot keeps clear of the home`);
      const p = plotPoint(home, f, RANGE_PLOT[0] / 2 - 30, 12), s = rangeSpotAt(home, f, p.x, p.y);
      assert.ok(rangeTakes(s.plot, f).some(r => rectsMeet(r, yard)), `${f}: slid 30 toward the home, it meets the yard`);
    }
  });
  it('landWhy: off the player\'s land, on water, over the course; fine on open owned land (sampled to the far edges)', () => {
    const own: Rect = [0, 0, 100, 100], c = (o: Partial<LandCheck> = {}): LandCheck => ({ owned: (x, y) => x >= own[0] && y >= own[1] && x < own[2] && y < own[3], wet: () => false, course: () => false, ...o });
    assert.equal(landWhy([10, 10, 36, 34], c()), '');
    assert.equal(landWhy([80, 10, 21, 10], c()), 'Off your land: place it on your plot', 'one tile past the edge');
    assert.equal(landWhy([10, 10, 20, 20], c({ wet: (x, y) => x > 25 && y > 25 })), 'Not on water');
    assert.equal(landWhy([10, 10, 20, 20], c({ course: x => x < 12 })), 'The course is there');
    const pts = rectSamples([0, 0, 5, 5]); assert.ok(pts.some(p => p.x === 4.5) && pts.some(p => p.y === 4.5), 'the far edges sampled');
  });
  it('placeVerdict: the reason first, then the money, else the name and price with the click', () => {
    const p: Placeable<number> = { id: 'x', name: 'Thing', cost: 500, spot: () => 0, why: s => (s ? 'Nope' : ''), polys: () => [], build: () => true };
    assert.deepEqual(placeVerdict(p, 1, 1e6), { bad: true, label: 'Nope' });
    assert.deepEqual(placeVerdict(p, 0, 100), { bad: true, label: 'Not enough money: Thing costs $500' });
    assert.deepEqual(placeVerdict(p, 0, 1e6), { bad: false, label: 'Thing · $500 · click to build here' });
    assert.ok(RANGE_PLACE_COST > 0 && CAR_PARK_PLACE_COST > 0 && PRACTICE_PLACE_COST > 0);
    assert.deepEqual(rectAt(10.4, 20.6, 36, 34), [-8, 4, 36, 34]);
  });
  it('the practice area where it was placed: its box, the walk in on its edge nearest the car park; none placed: an empty box nothing lies in', () => {
    assert.deepEqual(practiceDims(2), [PRACTICE_UV[1] - PRACTICE_UV[0], PRACTICE_UV[3] - PRACTICE_UV[2]]); assert.deepEqual(practiceDims(1), [PRACTICE_UV[3] - PRACTICE_UV[2], PRACTICE_UV[1] - PRACTICE_UV[0]]);
    const a = practiceAreaAt([100, 200, 36, 34], { x: 90, y: 210 });
    assert.deepEqual(a.box, [100, 200, 136, 234]); assert.deepEqual(a.entry, { x: 100.5, y: 210 }); assert.ok(a.behind.x < 100, 'behind it outside');
    assert.ok(inPractice(a, 120, 220)); assert.ok(!inPractice(NO_PRACTICE, 0, 0) && !inPractice(NO_PRACTICE, 120, 220));
  });
  it('the scene: the practice area as placed (none: the empty box); the home in its own frame wherever the range stands', () => {
    const plot = homes[2], s = { ...bare(), built: undefined, home: [plot[0] - 200, plot[1], plot[2], plot[3]] as Rect };
    const sc = rangeScene(plot, 2, { ...s, practiceAt: null });
    assert.deepEqual(sc.practice.box, [0, 0, 0, 0]);
    const car = sc.pieces.find(p => p.id === 'expansion:pop-up-caravan')!; assert.ok(car.x < plot[0], 'the trailer stays in its own frame');
    assert.deepEqual(rangeScene(plot, 2, { ...s, practiceAt: [400, 200, 36, 34] }).practice.box, [400, 200, 436, 234]);
    assert.ok(rangeStructures(plot, 2, s).find(x => x.name === 'your caravan')!.box[2] < plot[0], 'the home\'s footprint in its frame too');
    // an old save (no home, no practiceAt): as before, the home and the practice area on the plot
    const old = rangeScene(plot, 2, defaultRangeBiz()); assert.ok(old.pieces.find(p => p.id === 'expansion:pop-up-caravan')!.x > plot[0]);
    assert.ok(old.practice.box[0] > plot[0] + plot[2], 'the practice area beside the plot');
  });
  it('every upgrade has a footprint on the range (its ghost snaps there): inside the plot and its frontage', () => {
    for (const f of FACINGS) {
      const plot = homes[f], s = { ...defaultRangeBiz(), setback: SETBACK }, a = plotPoint(plot, f, -2, -SETBACK - 2), b = plotPoint(plot, f, RANGE_PLOT[0] + 6, RANGE_PLOT[1] + 2);
      const [x0, x1, y0, y1] = [Math.min(a.x, b.x), Math.max(a.x, b.x), Math.min(a.y, b.y), Math.max(a.y, b.y)];
      for (const u of RANGE_UPGRADES) {
        const ps = upgradeFoot(plot, f, withUpgrade(s, u.id as RangeUpgradeId), u.id);
        assert.ok(ps.length >= 1 && ps.every(p => p.length >= 8), `${f} ${u.id}: a polygon`);
        for (const p of ps) for (let i = 0; i < p.length; i += 2) assert.ok(p[i]! >= x0 && p[i]! <= x1 && p[i + 1]! >= y0 && p[i + 1]! <= y1, `${f} ${u.id}: on the range`);
      }
    }
  });
  it('the engine: the build in hand takes the click and the right click, Esc puts it down, its ghost is drawn; an upgrade bought is placed', () => {
    const eng = readFileSync('src/game/engine.ts', 'utf8');
    assert.match(eng, /if \(this\.placing && !this\.placing\.sticky && !this\.keys\.has\(' '\) && \(e\.button === 0 \|\| e\.button === 2\)\) \{ this\.hover = this\.tileAt\(mx, my\); if \(e\.button === 0\) this\.placeAt\(\); else this\.cancelPlacing\(\); return; \}/);
    // (J9: the start in hand is sticky: a press and release without a drag places it, a drag pans, Esc and a right click do not put it down)
    assert.match(eng, /if \(this\.placing\?\.sticky && e\.button === 0 && !this\.keys\.has\(' '\)\) \{[^\n]*place: true \}; return; \}/);
    assert.match(eng, /cancelPlacing\(\) \{ if \(!this\.placing \|\| this\.placing\.sticky\) return;/);
    assert.match(eng, /if \(this\.placing\) \{ this\.cancelPlacing\(\); return true; \} \/\/ T288/);
    assert.match(eng, /this\.drawPlacing\(ctx\); \/\/ T288/);
    // (T386, #1043: the ball room's upgrade tree, the upgrades with a `branch` (the picking tools, the supply, staff and machines: gear, not buildings), is bought at once from the range's till; the buildings of the Upgrades list
    // are still placed: a bought upgrade takes the ghost in hand, a click builds it. buyRangeUpgrade keeps the T288 lines after the tree's exit)
    assert.match(eng, /buyRangeUpgrade\(id: RangeUpgradeId\) \{\n\s+\/\/ T386[^\n]*\n\s+if \(RANGE_UPGRADES\.find\(q => q\.id === id\)\?\.branch\) \{ this\.range\.buy\(id\); return; \}\n\s+const p = this\.upgradePlaceable\(id\); if \(p\) this\.startPlacing\(p\);\n\s+\}/);
    assert.ok(RANGE_UPGRADES.some(u => u.branch) && RANGE_UPGRADES.some(u => !u.branch), 'the tree\'s upgrades and the placed ones are both there');
    // the car park placed becomes the range's own lot (packed dirt: gravel and paving are upgrades)
    assert.match(eng, /this\.parkDefs\.push\(\{ \.\.\.d, id, ground: 'dirt' \}\); b\.lot = \[d\.x, d\.y, d\.w, d\.h\];/);
    // a pre-T288 save loads with its placement steps done (no reward)
    assert.match(eng, /if \(gd && rb && rb\.built !== false && !rb\.home\) for \(const id of PLACED_STEPS\)/);
  });
});

describe('T288: the guide\'s placement steps, the tutorial, the rail', () => {
  it('the guide starts with placing the range, then its car park; old ranges have them done', () => {
    assert.deepEqual(RANGE_GUIDE.slice(0, 2).map(s => s.id), PLACED_STEPS);
    const g = newRangeGuide(), f: GuideFacts = { pieces: 0, roads: 0, parks: 0, structures: 0, kinds: {}, runs: 0, tutorial: 'on', step: 1, start: 'range', rangePlaced: false, lotPlaced: false, golfers: 0, owned: [] };
    assert.deepEqual(rangeGuideTick(g, f), []);
    assert.deepEqual(rangeGuideTick(g, { ...f, rangePlaced: true }).map(s => s.id), ['guide-range-place']);
    assert.deepEqual(rangeGuideTick(g, { ...f, rangePlaced: true, lotPlaced: true }).map(s => s.id), ['guide-range-lot']);
    // (#1297, the owner, 2026-11-14: the practice area is no step of the guide any more: it is placed from the Range menu, Range › Place the practice area, when the player likes)
    assert.ok(!RANGE_GUIDE.some(s => s.id === 'guide-range-practice'));
    assert.match(RAMP_TOAST[1]!, /Range ▸ Place the practice area/, 'the ramp says where the practice area is placed, when its tools open');
    // a new game starts by placing the range (PR #1274): the first step is ticked at the first check, the car park is the one to do
    const fresh = newRangeGuide(); assert.deepEqual(rangeGuideTick(fresh, { ...f, rangePlaced: true }).map(s => s.id), ['guide-range-place']); assert.equal(rangeGuideCurrent(fresh), 2);
  });
  it('the road tool is open from the start (the owner, 2026-11-04: "Yes, unlock it"): the tutorial\'s roads step waits for a road', () => {
    assert.equal(TOOL_STAGE.road, 1); assert.equal(GROUP_STAGE.roads, 1);
    const st = TOWN_TOUR.find(s => s.id === 'tour-roads')!, shown = tourStepFor(st, { roadLock: null, start: 'range' });
    assert.equal(shown.done, 'auto', 'done when a town road is built'); assert.doesNotMatch(shown.body, /locked/); assert.match(shown.body, /Cart paths & roads/);
    // (J9: a new game places its range when the start is chosen, so its last step says it stands; an older save's bare start still says to place it)
    const golf = TOWN_TOUR.find(s => s.id === 'tour-golf')!;
    assert.match(tourStepFor(golf, { roadLock: null, start: 'range', rangePlaced: false }).body, /only your trailer/);
    assert.match(tourStepFor(golf, { roadLock: null, start: 'range', rangePlaced: true }).body, /you chose where/);
  });
  it('the rail: Cart paths & roads right under Course (#1272: Facilities is a tile of the Course flyout, no button); its tools the cart paths and the town roads', () => {
    const ids = railEntries(null, true, 'select', { range: true }).map(e => e.item.id);
    assert.ok(!ids.includes('facilities')); assert.equal(ids.indexOf('paths'), ids.indexOf('course') + 1);
    const p = RAIL.find(r => r.id === 'paths')!; assert.equal(p.label, 'Cart paths & roads'); assert.equal(p.section, 'course');
    assert.deepEqual(p.tools.map(t => [t.id, !!t.alt]), [['path', false], ['road', true]]);
    assert.ok(!RAIL.find(r => r.id === 'course')!.tools.some(t => t.id === 'path'), 'out of Course');
    // the range's rail item shows in a bare start (the placements), so the player can place the range
    assert.match(readFileSync('src/App.tsx', 'utf8'), /range: !!game\.range\.scene \|\| game\.rangePlaces\(\)\.length > 0/);
  });
});
