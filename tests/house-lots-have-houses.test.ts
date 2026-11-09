// T405 (#1088; the owner, 2026-11-09: "why is there a lot with no house?"): a built house lot always has a house. T398 (PRs 1098 to 1100) made the clean house lots stricter: a house whose garage door faces
// sideways, whose picture the owner marked, or that is too wide for the 3 m side gaps is left out (compose.ts cleanBase, pick.bad), and when no candidate passed the lot fell back to an EMPTY lot (its fence and nothing
// else). Now a last pass (compose.ts lastHouse, autolot.ts houseOnlyLot) gives the lot any dwelling that passes the owner's rules for its road and state and fits between the side gaps; a lot stays empty only where no
// such dwelling fits (a lot narrower than any house and its gaps). Headless: the town a new game lays (the Lot review's 'town' set) and streets at all eight road headings and the three lot widths
// (tests/helpers/house-census.ts), each lot composed as the game composes it.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { compose, housePalette, setLastHouse, type ComposeState } from '../src/game/lots/compose';
import { LV } from '../src/game/lots/town';
import { houseOnlyLot } from '../src/game/lots/autolot';
import { HEDGE_IDS, SIDE_GAP, setCleanYards } from '../src/game/lots/clean-yards';
import { auditLot } from '../src/game/lots/lot-audit';
import { facingView } from '../src/game/lots/house-facing';
import { frameOf, roadOf } from '../src/game/lots/preset-frame';
import { frameHalf } from '../src/game/lots/house-class';
import { allows, parseAllocations } from '../src/game/lots/house-alloc';
import ALLOC_JSON from '../src/game/lots/house-allocations.json';
import { stateOf } from '../src/game/lots/presets';
import { drawnView, ownerScaleOf } from '../src/game/lots/preset-art';
import { lotDrawLimit } from '../src/game/newart';
import { LIBRARY } from '../src/game/library';
import { sampleState, sampleStreets } from '../src/game/dev/review-set';
import { frontageFrames } from '../src/game/golf/estate';
import { CLASS } from '../src/game/network';
import { MAP } from '../src/game/iso';
import { census, report, roadLots, townLots, type CensusLot } from './helpers/house-census';

const ALLOC = parseAllocations(ALLOC_JSON), TOL = 0.05, LIB_AT = new Map(LIBRARY.map((it, i) => [it.id, i] as const));
const H = Math.SQRT1_2;
/** the lot's away vector n by road (presets.ts Road: the street lies along -n): 0 the street on +y ... 7 */
const NS = [{ x: 0, y: -1 }, { x: -H, y: -H }, { x: -1, y: 0 }, { x: -H, y: H }, { x: 0, y: 1 }, { x: H, y: H }, { x: 1, y: 0 }, { x: H, y: -H }];
const geom = (road: number, w: number, d: number) => { const n = NS[road]!; return { o: { x: 300, y: 300 }, u: { x: -n.y, y: n.x }, n, w, d }; };
/** the Lot review's sample set (T403, dev/review-set.ts: four streets of 280 tiles along both screen axes and both diagonals, every house type on every road heading, each laid to show its type): the lots as the page stages them */
function sampleLots(seed: number): CensusLot[] {
  const c = { x: MAP / 2, y: MAP / 2 }, frames: { key: string; g: ReturnType<typeof geom> }[] = [];
  sampleStreets(c).forEach((st, seg) => { const cls = CLASS[st.base]!; for (const f of frontageFrames({ a: st.a, b: st.b, base: st.base, h: cls.h, walk: cls.walk, ra: 4, rb: 4 }, [1, -1], seg)) frames.push({ key: `${seg}.${f.side > 0 ? 'l' : 'r'}${f.k}`, g: { o: f.o, u: f.u, n: f.n, w: f.w, d: f.d } }); });
  frames.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const tally = new Map<number, number>();
  return frames.map((f, i) => ({ set: `sample:${seed}`, key: f.key, g: f.g, st: sampleState(seed, i, f.g, tally), road: roadOf(f.g.n) }));
}
const describe1 = (l: CensusLot) => `${l.key} road ${l.road} ${l.g.w}x${l.g.d} tier ${l.st.tier} level ${l.st.level} decline ${l.st.decline} seed ${l.st.seed}`;

/** whether any dwelling the owner's rules allow on this lot fits between the side gaps at its natural size: it faces the road (no mark, no sideways garage door: facingView ok), the allocations allow it on the lot's
 *  road and state, and it is no wider than the room between the gaps nor deeper than the lot's house band (autolot.ts houseOnlyLot may draw one down to three quarters of its size: a lot only a smaller house fits is not
 *  counted here, so a lot this finds is one that cannot be empty) */
function houseFits(l: CensusLot): boolean {
  const f = frameOf(l.g), road = roadOf(l.g.n), state = stateOf(l.st.level, l.st.decline) ?? 'built', half = frameHalf(f);
  const room = l.g.w - 2 * SIDE_GAP, band = l.g.d - Math.min(4.5, 0.25 * l.g.d) - Math.min(3.5, 0.2 * l.g.d);
  return housePalette().some(id => {
    if (!allows(ALLOC, id, road, state) || !facingView(id, f).ok) return false;
    const h = half({ id, x: 0, y: 0, scale: 1, view: 0 });
    // (a picture is never drawn past its pixels: lotDrawLimit; autolot.ts Lay.fit scales a house by it too)
    return 2 * h.ha <= room + 1e-9 && 2 * h.hb <= band + 1e-9 && lotDrawLimit(LIB_AT.get(drawnView(id, f, 0).id) ?? -1) / ownerScaleOf(id) >= 1;
  });
}

describe('a built house lot always has a house (T405)', () => {
  it('1. the town a new game lays (the Lot review\'s town set): not one built house lot composes with no building, on four seeds', () => {
    for (const seed of [1, 2, 3, 4]) {
      const lots = townLots(seed), c = census(lots);
      assert.ok(lots.length > 200, `${lots.length} lots in the town`);
      assert.equal(c.empty, 0, `${report(`town ${seed}`, c)}; the first: ${c.emptyLots.slice(0, 3).map(describe1).join(' | ')}`);
    }
  });

  it('2. streets at all eight road headings and the three lot widths: every lot a house of the rules fits on has a house', () => {
    let total = 0, possible = 0; const miss: string[] = [], rd = Array.from({ length: 8 }, () => ({ total: 0, before: 0, after: 0 }));
    for (const seed of [1, 2, 3]) {
      const lots = roadLots(seed), was = census(lots, false), now = census(lots, true);
      total += lots.length; possible += lots.filter(houseFits).length;
      for (const l of now.emptyLots) if (houseFits(l)) miss.push(describe1(l));
      for (let r = 0; r < 8; r++) { rd[r]!.total += was.byRoad[r]!.total; rd[r]!.before += was.byRoad[r]!.empty; rd[r]!.after += now.byRoad[r]!.empty; }
    }
    setLastHouse(true);
    console.log(`T405 road sets: ${total} lots; empty without the last house -> with it, by road heading: ${rd.map((r, i) => `${i}: ${r.before}/${r.total} -> ${r.after}`).join(', ')}`);
    assert.deepEqual(miss.slice(0, 5), [], `${miss.length} lots with a house that fits are empty`);
    assert.ok(total > 700 && possible > total * 0.8, `${possible} of ${total} lots have a dwelling that fits at its natural size`);
  });

  it('2b. the Lot review\'s sample set (every house type on every road heading, each laid to show its type): a type that cannot stand on its road is swapped for one that can, so no lot is empty but where no dwelling fits', () => {
    let total = 0, possible = 0; const miss: string[] = [], rd = Array.from({ length: 8 }, () => ({ total: 0, before: 0, after: 0 }));
    for (const seed of [7, 8]) {
      const lots = sampleLots(seed), was = census(lots, false), now = census(lots, true);
      total += lots.length; possible += lots.filter(houseFits).length;
      for (const l of now.emptyLots) if (houseFits(l)) miss.push(describe1(l));
      for (let r = 0; r < 8; r++) { rd[r]!.total += was.byRoad[r]!.total; rd[r]!.before += was.byRoad[r]!.empty; rd[r]!.after += now.byRoad[r]!.empty; }
    }
    setLastHouse(true);
    console.log(`T405 sample set: ${total} lots; empty without the last house -> with it, by road heading: ${rd.map((r, i) => `${i}: ${r.before}/${r.total} -> ${r.after}`).join(', ')}`);
    assert.deepEqual(miss.slice(0, 5), [], `${miss.length} lots with a house that fits are empty`);
    assert.ok(total > 200 && possible > total * 0.8, `${possible} of ${total} sample lots have a dwelling that fits`);
  });

  it('3. a lot the last house gave a house keeps the owner\'s rules: the picture faces the road, it is not marked, its garage door is not sideways, the walls keep the side gap, the drive reaches its garage door and the path its front door', () => {
    setCleanYards(true);
    let rescued = 0; const bad: string[] = [], got = new Map<string, number>();
    for (const lots of [townLots(1), townLots(2), roadLots(1), roadLots(2), sampleLots(7)]) {
      const was = census(lots, false).emptyLots, now = new Set(census(lots, true).emptyLots);
      for (const l of was) {
        if (now.has(l)) continue;
        rescued++;
        const c = compose(l.g, l.st), a = auditLot(l.g, c); got.set(a.houseId ?? '(none)', (got.get(a.houseId ?? '(none)') ?? 0) + 1);
        if (!a.house || a.facingOff !== 0 || a.garageSideways || a.marked || !a.driveOk || !a.pathAtDoor) bad.push(`${describe1(l)}: house ${a.house} facing off ${a.facingOff} sideways ${a.garageSideways} marked ${a.marked} drive ok ${a.driveOk} path at the door ${a.pathAtDoor}`);
        let lo = Infinity, hi = -Infinity; for (const b of c.anchors?.boxes ?? []) { lo = Math.min(lo, b[0]); hi = Math.max(hi, b[2]); }
        if (lo < SIDE_GAP - TOL || hi > l.g.w - SIDE_GAP + TOL) bad.push(`${describe1(l)}: buildings from ${lo.toFixed(2)} to ${hi.toFixed(2)} of ${l.g.w}`);
      }
    }
    setLastHouse(true);
    console.log(`T405 rescued lots: ${rescued}, by the house they got: ${[...got].map(([k, v]) => `${k} ${v}`).join(', ')}`);
    assert.deepEqual(bad.slice(0, 5), [], `${bad.length} of ${rescued} rescued lots break a rule`);
  });

  it('4. houseOnlyLot: one dwelling of the list, centred between the gaps and drawn no smaller than three quarters of its size; nothing on a lot with no room for a house', () => {
    const ids = housePalette().filter(id => facingView(id, frameOf(geom(0, 12.5, 16))).ok), g = geom(0, 12.5, 16);
    const pr = houseOnlyLot(g, 'built', ids, SIDE_GAP);
    assert.ok(pr, 'a house on a lot of 12.5 x 16'); assert.equal(pr.props.length, 1); assert.ok(ids.includes(pr.props[0]!.id)); assert.equal(pr.id, 'auto:house'); assert.equal(pr.patches.length, 0);
    const q = pr.props[0]!, h = frameHalf(frameOf(g))(q);
    assert.ok(q.x - h.ha >= SIDE_GAP - TOL && q.x + h.ha <= g.w - SIDE_GAP + TOL, 'between the side gaps'); assert.ok(q.scale >= 0.75 && q.scale <= 1, `scale ${q.scale}`);
    assert.equal(houseOnlyLot(geom(0, 12.5, 16), 'built', [], SIDE_GAP), null, 'no dwelling given: none');
    assert.equal(houseOnlyLot(geom(0, 5, 16), 'built', ids, SIDE_GAP), null, 'a lot of 5 tiles has 2 tiles between its gaps');
  });

  it('5. the switch: the last house changes no lot that already had a house (the same composition, prop for prop); with it off a lot no candidate housed is an empty lot, as after T398', () => {
    setCleanYards(true);
    let kept = 0, emptied = 0;
    for (const l of [...townLots(1), ...townLots(2), ...roadLots(1)]) {
      const st = l.st;
      setLastHouse(false); const off = compose(l.g, st); setLastHouse(true); const on = compose(l.g, st);
      if (auditLot(l.g, off).house) { kept++; assert.deepEqual(on, off, `${describe1(l)}: a lot with a house is composed as it was`); }
      else { emptied++; assert.ok(off.props.every(p => /fence-privacy/.test(p.id) || HEDGE_IDS.has(p.id)) && off.ground.length === 0, 'an empty lot holds its fence lines alone'); }
    }
    assert.ok(kept > 700, `${kept} lots kept their house, ${emptied} were empty without the last house`);
  });

  it('6. the starter lots (tier 0: the house palette holds no tier 0 dwelling, which is where the lots were left empty): a tier 0 lot of every road heading, width, level and decline has a house', () => {
    setCleanYards(true);
    const states = [[LV.BUILT, 0], [LV.UPGRADED, 0], [LV.BUILT, 1], [LV.BUILT, 3]] as const;
    let lots = 0, was = 0; const miss: string[] = [];
    for (const seed of [1, 2, 3, 4, 5, 6]) for (const l of roadLots(seed)) for (const [level, decline] of states) {
      const st: ComposeState = { ...l.st, tier: 0, level, decline };
      setLastHouse(false); if (!auditLot(l.g, compose(l.g, st)).house) was++;
      setLastHouse(true); lots++;
      if (!auditLot(l.g, compose(l.g, st)).house && houseFits({ ...l, st })) miss.push(describe1({ ...l, st }));
    }
    console.log(`T405 starter lots: ${lots} tier 0 lots, ${was} empty without the last house, ${miss.length} with it`);
    assert.deepEqual(miss.slice(0, 5), [], `${miss.length} of ${lots} starter lots with a dwelling that fits are empty`);
    assert.ok(lots > 4000, `${lots} starter lots`);
  });
});
