// T160 (#367; P25 #348 step 5): the game's house lots generated on the fly. A frozen house preset keeps its base (the house, drive and walk), its
// street items and fence, and its yard comes from the learned generator (lots/lot-gen.ts), seeded by the lot's place on its street, with a
// shipped model (lots/lot-models): the same lot always composes the same, a reload changes nothing, the owner's own presets stay exact, ?oldlots
// is today's composition, a town saved with model v1 keeps composing with v1 after v2 ships, and nothing overlaps or leaves the lot. Headless.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { addLotModel, compose, layModelFrom, lotModelVersion, lotSeed, pickedPreset, setGeneratedLots, setLotModel, type ComposeState, type LotGeom } from '../src/game/lots/compose';
import { LATEST, LOT_MODELS } from '../src/game/lots/lot-models';
import { LU, LV } from '../src/game/lots/town';
import { mulberry } from '../src/game/iso';
import { footprintOf } from '../src/game/lots/preset-art';
import { frameOf, toFrame } from '../src/game/lots/preset-frame';
import { OVERLAP, share } from '../src/game/lots/compose-core';
import { LIBRARY } from '../src/game/library';
import { isBuilding } from '../src/game/mirror';

(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

const fnv = (s: string) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16); };
/** the reference lots: 240 seeded lots of every use, state, size and facing (the same set T160 measured main's composition on) */
function referenceLots(): { g: LotGeom; st: ComposeState }[] {
  const r = mulberry(0x7160), out: { g: LotGeom; st: ComposeState }[] = [];
  const N = [{ x: 0, y: 1 }, { x: 1, y: 0 }, { x: 0, y: -1 }, { x: -1, y: 0 }], USES = [LU.RES, LU.RES, LU.RES, LU.COM, LU.IND, LU.TOUR, LU.GOV];
  for (let i = 0; i < 240; i++) {
    const n = N[Math.floor(r() * 4)]!, u = { x: -n.y, y: n.x }, w = 8 + 2 * Math.floor(r() * 5), d = 14 + 2 * Math.floor(r() * 4);
    const o = { x: 200 + Math.floor(r() * 400), y: 200 + Math.floor(r() * 400) };
    out.push({ g: { o, u, n, w, d }, st: { use: USES[Math.floor(r() * USES.length)]!, level: r() < 0.5 ? LV.BUILT : LV.UPGRADED, decline: Math.floor(r() * 4) % 4, seed: Math.floor(r() * 1000) } });
  }
  return out;
}
/** the exam set: 50 house lots of every size, state and facing, on 50 streets */
function examLots(): { g: LotGeom; st: ComposeState }[] {
  const r = mulberry(0xe4a3), N = [{ x: 0, y: 1 }, { x: 1, y: 0 }, { x: 0, y: -1 }, { x: -1, y: 0 }];
  return Array.from({ length: 50 }, (_, i) => {
    const n = N[i % 4]!, u = { x: -n.y, y: n.x }, w = 8 + 2 * Math.floor(r() * 7), d = 14 + 2 * Math.floor(r() * 5);
    return { g: { o: { x: 300 + 40 * i, y: 300 + 20 * (i % 7) }, u, n, w, d }, st: { use: LU.RES, level: i % 3 === 1 ? LV.UPGRADED : LV.BUILT, decline: i % 3 === 2 ? 2 : i % 5 === 0 ? 1 : 0, seed: i } };
  });
}
const frozenHouse = (l: { g: LotGeom; st: ComposeState }) => { const p = pickedPreset(l.g, l.st); return !!p && p.use === 'res' && !p.curated && !p.approved && !p.whole && l.st.use === LU.RES; };
const INDEX = new Map(LIBRARY.map((it, i) => [it.id, i] as const));

describe('lots generated on the fly (T160)', () => {
  it('1. the same lot composes the same layout every time, in any order (a reload changes nothing); neighbours and states differ', () => {
    setGeneratedLots(true);
    const lots = examLots(), a = lots.map(l => JSON.stringify(compose(l.g, l.st))), b = [...lots].reverse().map(l => JSON.stringify(compose(l.g, l.st))).reverse();
    assert.deepEqual(a, b);
    const g = lots[0]!.g, next = { ...g, o: { x: g.o.x + g.u.x * g.w, y: g.o.y + g.u.y * g.w } };
    assert.notEqual(lotSeed(g, 'built'), lotSeed(next, 'built'), 'the next lot along the street differs');
    assert.notEqual(lotSeed(g, 'built'), lotSeed(g, 'upgraded'), 'an upgrade lays it anew');
    assert.equal(lotSeed(g, 'built'), lotSeed({ ...g }, 'built'));
  });
  it('2. the owner\'s own presets (curated, approved, whole) and the uses the model does not generate compose exactly as with ?oldlots', () => {
    // T169: v3 generates industry and the open uses from their frozen presets too (lots-every-use.test.ts); the shops and the owner's own stay
    const lots = referenceLots().filter(l => { const p = pickedPreset(l.g, l.st); return !frozenHouse(l) && (!p || p.curated || p.approved || p.whole || p.use === 'com' || p.use === 'farm'); });
    assert.ok(lots.length > 30, `${lots.length} lots`);
    // with v3 (T171: v4 generates the shops too; a v3 town keeps them on their frozen presets)
    const was = lotModelVersion(); setLotModel(3);
    setGeneratedLots(false); const old = lots.map(l => JSON.stringify(compose(l.g, l.st)));
    setGeneratedLots(true); const now = lots.map(l => JSON.stringify(compose(l.g, l.st)));
    setLotModel(was);
    assert.deepEqual(now, old);
    // a frozen house lot is generated: its own preset's yard items are gone (only its house is drawn from it)
    const fh = referenceLots().find(l => frozenHouse(l) && l.st.decline === 0)!, gen = compose(fh.g, fh.st), oldc = (setGeneratedLots(false), compose(fh.g, fh.st)); setGeneratedLots(true);
    assert.ok(gen.props.filter(p => p.from).length <= 1 && oldc.props.filter(p => p.from).length > 1, 'only the house comes from the frozen preset');
  });
  // (T202: the pinned hash here followed the owner's presets, sizes and removals, and skipped since they changed: the rule it stood for)
  it('3. ?oldlots draws each lot from its frozen preset: every item that is not the street\'s, a fence or a decline\'s comes from the lot\'s own preset; the same every time', () => {
    setGeneratedLots(false);
    try {
      let drawn = 0;
      for (const l of referenceLots()) {
        const p = pickedPreset(l.g, l.st), c = compose(l.g, l.st);
        assert.equal(JSON.stringify(compose(l.g, l.st)), JSON.stringify(c), 'the same every time');
        if (!p) continue;
        for (const q of c.props) if (q.from) { assert.equal(q.from.preset, p.id, `${p.id}: ${q.id} from another preset`); drawn++; }
        if (p.props.some(q => { const it = LIBRARY[INDEX.get(q.id) ?? -1]; return !!it && isBuilding(it); }) && l.st.decline < 3) assert.ok(c.props.some(q => q.from), `${p.id}: drawn from its preset`);
      }
      assert.ok(drawn > 100, `${drawn} items drawn from the presets`);
    } finally { setGeneratedLots(true); }
  });

  it('4. a town keeps its lot model: one saved with v1 composes with v1 after another ships; an unknown version falls back below it', () => {
    assert.ok(LOT_MODELS[1], 'v1 ships'); assert.ok(LATEST >= 1);
    const lots = examLots().filter(frozenHouse).slice(0, 12), was = lotModelVersion(), nv = LATEST + 1;
    setLotModel(1); const v1 = lots.map(l => JSON.stringify(compose(l.g, l.st)));
    // the next version: everything deleted in the front yard and kept at the back (another taste)
    const counts: Record<string, [number, number]> = {};
    for (const c of ['small', 'medium', 'large', 'none']) for (const k of ['tree', 'bush', 'flowerbed', 'prop', 'car', 'decal']) { counts[`${c}|${k}|front`] = [40, 0]; counts[`${c}|${k}|back`] = [40, 40]; }
    addLotModel(nv, { v: nv, prior: { a: 1, b: 1 }, counts });
    setLotModel(nv); const v2 = lots.map(l => JSON.stringify(compose(l.g, l.st)));
    assert.notDeepEqual(v2, v1, 'the next version lays the lots its own way');
    setLotModel(1); assert.deepEqual(lots.map(l => JSON.stringify(compose(l.g, l.st))), v1, 'a v1 town still composes with v1');
    setLotModel(nv + 50); assert.equal(lotModelVersion(), nv, 'a version not shipped: the nearest below');
    setLotModel(was);
  });
  // (T202: the pinned hash here followed the owner's data and skipped since it changed: the rule it stood for)
  it('7. a town saved with v1 lays its generated lots without the taste (pairs and densities came with v2), the same every time', () => {
    const v1 = layModelFrom(LOT_MODELS[1]), v2 = layModelFrom(LOT_MODELS[2]);
    assert.equal(v1.pairs, undefined, 'v1 has no pairs'); assert.ok([...v1.kinds.values()].every(k => k === undefined), 'v1 has no densities');
    assert.ok(v2.pairs && [...v2.kinds.values()].some(k => k !== undefined), 'v2 has both');
    const was = lotModelVersion(), lots = [...examLots(), ...referenceLots()].filter(frozenHouse).slice(0, 30);
    try {
      setGeneratedLots(true); setLotModel(1);
      const a = lots.map(l => JSON.stringify(compose(l.g, l.st)));
      setLotModel(2); const b = lots.map(l => JSON.stringify(compose(l.g, l.st)));
      setLotModel(1); assert.deepEqual(lots.map(l => JSON.stringify(compose(l.g, l.st))), a, 'v1: the same every time, after v2');
      assert.ok(a.some((x, i) => x !== b[i]), 'the taste of v2 lays them otherwise');
    } finally { setLotModel(was); }
  });

  it('6. a generated lot keeps every building of its frozen preset (the house, a garage, a shed), and nothing generated stands on one', () => {
    setGeneratedLots(true);
    const many = [...examLots(), ...referenceLots()].filter(frozenHouse);
    let seen = 0;
    for (const l of many) {
      const p = pickedPreset(l.g, l.st)!, builds = p.props.filter(q => { const it = LIBRARY[INDEX.get(q.id) ?? -1]; return !!it && isBuilding(it); }).length;
      if (builds < 2) continue;
      setGeneratedLots(false); const old = compose(l.g, l.st).props.filter(q => q.from && isBuilding(LIBRARY[INDEX.get(q.id)!]!)).length; setGeneratedLots(true);
      const c = compose(l.g, l.st), kept = c.props.filter(q => q.from && isBuilding(LIBRARY[INDEX.get(q.id)!]!));
      assert.equal(kept.length, old, `${p.id}: the generated lot draws the buildings ?oldlots draws`);
      const fps = kept.map(q => { const h = footprintOf(q.id, q.scale, q.flip); return [q.x + h[0], q.y + h[1], q.x + h[2], q.y + h[3]] as [number, number, number, number]; });
      for (const q of c.props.filter(x => !x.from && !x.street && !/^(fencex|fencey)$/.test(LIBRARY[INDEX.get(x.id) ?? -1]?.kind ?? ''))) { const h = footprintOf(q.id, q.scale, q.flip), fp: [number, number, number, number] = [q.x + h[0], q.y + h[1], q.x + h[2], q.y + h[3]]; for (const b of fps) assert.ok(share(b, fp) <= OVERLAP + 1e-9, `${q.id} on a building of ${p.id}`); }
      seen++;
    }
    assert.ok(seen >= 5, `${seen} generated lots with a garage or a shed`);
  });
  it('5. the exam set: on the generated lots of 50 house lots nothing leaves the lot or overlaps beyond the rule; nothing stands on the walk', () => {
    setGeneratedLots(true);
    // the generated lots of the set (the owner's own presets are exact: theirs may overlap, as the owner laid them)
    let gen = 0;
    const lots = examLots().filter(frozenHouse);
    assert.ok(lots.length >= 20, `${lots.length} generated lots in the exam set`);
    for (const l of lots) {
      const c = compose(l.g, l.st), f = frameOf(l.g), boxes: { id: string; fp: [number, number, number, number] }[] = [];
      for (const p of c.props) {
        const it = LIBRARY[INDEX.get(p.id) ?? -1]; if (!it) continue;
        const h = footprintOf(p.id, p.scale, p.flip), fp: [number, number, number, number] = [p.x + h[0], p.y + h[1], p.x + h[2], p.y + h[3]];
        if (!p.from && !p.street && it.kind !== 'fencex' && it.kind !== 'fencey') {
          gen++;
          for (const [x, y] of [[fp[0], fp[1]], [fp[2], fp[3]]] as [number, number][]) { const q = toFrame(f, x, y); assert.ok(q.x >= -0.6 && q.x <= l.g.w + 0.6 && q.y >= -1.6 && q.y <= l.g.d + 0.6, `${p.id} inside the lot (${q.x.toFixed(2)}, ${q.y.toFixed(2)})`); }
        }
        if (it.kind !== 'fencex' && it.kind !== 'fencey' && p.id !== 'expansion:wheel-stop') boxes.push({ id: p.id, fp });
      }
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) assert.ok(share(boxes[i]!.fp, boxes[j]!.fp) <= OVERLAP + 1e-9, `${boxes[i]!.id} and ${boxes[j]!.id} overlap`);
    }
    assert.ok(gen > 50, `${gen} generated items on the exam lots`);
  });
});
