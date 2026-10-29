// The in-game dev editor's pure parts (P20 / T071): the frame maths through the fit and the turn, the edits to a preset, the studio JSON, the
// dev server's save whitelist. npm test.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyEdit, clampToLot, fit1, growWithin, placeInPreset, presetToWorld, removeSprite, replacePreset, scaleOverride, snap, studioJson, unfit, worldToPreset } from '../src/game/dev/lot-edit';
import { maxDrawScale } from '../src/game/newart';
import { checkDevRequest, checkDevSave, devSavePath, DEV_SAVE_FILES } from '../src/game/dev/dev-save';
import { frameOf, toFrame, toWorld } from '../src/game/lots/preset-frame';
import { fitPreset, formatPresets, type LotPreset } from '../src/game/lots/presets';
import { mulberry } from '../src/game/iso';
import { CLASS, RoadNetwork, type Leg } from '../src/game/network';
import { NetEditor } from '../src/game/netops';
import { LotMap } from '../src/game/lots/lots';
import { compose, setGeneratedLots, setShopVariety, lotPreset, setLotPresets, type PresetDrop } from '../src/game/lots/compose';
// these pin the frozen presets' own composition (?oldlots); T160's generated house lots are tested in tests/lots-on-the-fly.test.ts
setGeneratedLots(false);
// (T270: the editor's chain is pinned on the presets' own pictures, as ?oldshops draws them; a shop or house swapped by place is marked a stand-in)
setShopVariety(false);
import { LU, LV } from '../src/game/lots/town';
import { footprintOf } from '../src/game/lots/preset-art';
import { LIBRARY } from '../src/game/library';

const VEHICLE = new Set(LIBRARY.filter(i => i.cat === 'Vehicles').map(i => i.id));

(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

/** the eight lot frames: the street on each side, the along axis either way */
const FRAMES = [[1, 0, 0, 1], [-1, 0, 0, 1], [1, 0, 0, -1], [-1, 0, 0, -1], [0, 1, 1, 0], [0, -1, 1, 0], [0, 1, -1, 0], [0, -1, -1, 0]].map(([ux, uy, nx, ny]) => ({ u: { x: ux!, y: uy! }, n: { x: nx!, y: ny! } }));
const preset = (w: number, d: number, props: LotPreset['props'] = []): LotPreset => ({ id: 'p', use: 'res', state: 'built', w, d, props, patches: [] });

describe('the dev editor (T071)', () => {
  it('1. world to preset and back, through the fit and the turn, round-trips within 1e-6 for every facing and a bigger, equal or smaller lot', () => {
    const r = mulberry(71);
    let n = 0;
    for (const fr of FRAMES) for (const [pw, pd, lw, ld] of [[10, 15, 10, 15], [10, 15, 11, 16.5], [12, 16, 10.5, 14], [8, 16, 9.5, 15]]) {
      const f = frameOf({ o: { x: 200 + 50 * r(), y: 300 + 50 * r() }, ...fr, w: lw!, d: ld! }), p = { w: pw!, d: pd! };
      for (let k = 0; k < 50; k++) {
        const x = r() * pw!, y = r() * pd!, w = presetToWorld(f, p, x, y), back = worldToPreset(f, p, w.x, w.y, { x, y });
        assert.ok(Math.abs(back.x - x) < 1e-6 && Math.abs(back.y - y) < 1e-6, `${JSON.stringify(fr)} ${pw}x${pd} on ${lw}x${ld}: (${x}, ${y}) came back (${back.x}, ${back.y})`);
        // and the drawn point is fitPreset's: the same fit, then the frame
        const fp = fitPreset(preset(pw!, pd!, [{ id: 'a', x, y, scale: 1, view: 0 }]), lw!, ld!).props[0];
        if (fp) { const t = toWorld(f, fp.x, fp.y); assert.ok(Math.hypot(t.x - w.x, t.y - w.y) < 1e-9); }
        n++;
      }
    }
    assert.equal(n, 8 * 4 * 50);
  });

  it('1b. a move or a placing keeps the footprint inside the lot, for all 8 frames: clampToLot clamps in the lot frame, placeInPreset goes back to the preset', () => {
    const r = mulberry(171);
    for (const fr of FRAMES) for (const [pw, pd, lw, ld] of [[10, 15, 10, 15], [12, 16, 10.5, 14], [10, 15, 11, 16.5]]) {
      const f = frameOf({ o: { x: 300, y: 400 }, ...fr, w: lw!, d: ld! }), p = { w: pw!, d: pd! };
      for (let k = 0; k < 40; k++) {
        const hx = 0.2 + r() * 1.5, hy = 0.2 + r() * 1.5;
        // a point anywhere near the lot, often well past its edge
        const a = -6 + r() * (lw! + 12), b = -6 + r() * (ld! + 12), w = toWorld(f, a, b), c = clampToLot(f, w.x, w.y, hx, hy);
        // the footprint (world half extents) lies inside the lot: every corner in its frame within 0..size
        for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const q = toFrame(f, c.x + sx * hx, c.y + sy * hy); assert.ok(q.x >= -1e-9 && q.x <= lw! + 1e-9 && q.y >= -1e-9 && q.y <= ld! + 1e-9, `${JSON.stringify(fr)}: corner (${q.x}, ${q.y}) off a ${lw} x ${ld} lot`); }
        const inside = toFrame(f, w.x, w.y), ha = Math.abs(f.u.x) * hx + Math.abs(f.u.y) * hy, hb = Math.abs(f.n.x) * hx + Math.abs(f.n.y) * hy;
        assert.equal(c.clamped, !(inside.x >= ha - 1e-9 && inside.x <= lw! - ha + 1e-9 && inside.y >= hb - 1e-9 && inside.y <= ld! - hb + 1e-9), 'clamped says whether it moved');
        if (!c.clamped) assert.ok(Math.hypot(c.x - w.x, c.y - w.y) < 1e-9, 'a point already inside stays');
        // placed: the preset point draws back at the clamped point (exactly, wherever a preset point fits there: not in the gap of a bigger lot)
        const pl = placeInPreset(f, p, w.x, w.y, hx, hy), back = presetToWorld(f, p, pl.x, pl.y), cf = toFrame(f, c.x, c.y);
        const gap = (lw! > pw! && cf.x >= pw! / 2 && cf.x < pw! / 2 + lw! - pw!) || (ld! > pd! && cf.y >= pd! / 2 && cf.y < pd! / 2 + ld! - pd!);
        if (!gap) assert.ok(Math.hypot(back.x - c.x, back.y - c.y) < 1e-6, `${JSON.stringify(fr)} ${pw}x${pd} on ${lw}x${ld}: placed at (${c.x}, ${c.y}), drawn at (${back.x}, ${back.y})`);
        assert.equal(pl.clamped, c.clamped);
      }
    }
    // a footprint wider than the lot sits in its middle
    const f = frameOf({ o: { x: 0, y: 0 }, ...FRAMES[0]!, w: 4, d: 6 }), c = clampToLot(f, 50, 50, 5, 5), m = toFrame(f, c.x, c.y);
    assert.ok(Math.abs(m.x - 2) < 1e-9 && Math.abs(m.y - 3) < 1e-9 && c.clamped);
    assert.equal(snap(3.37), 3.25);
    assert.equal(snap(-0.13), -0.25);
  });

  it('2. unfit: the near and far halves go back by their rule; the overlap of a smaller lot keeps the old half; the gap of a bigger lot goes to the half\'s edge', () => {
    // preset 10 wide on a lot 12 wide: near [0, 5), gap [5, 7), far [7, 12]
    assert.equal(unfit(3, 10, 12, null), 3);
    assert.equal(unfit(9, 10, 12, null), 7);
    assert.equal(unfit(5.5, 10, 12, true), 5);
    assert.ok(Math.abs(unfit(5.5, 10, 12, false) - 5) < 1e-5 && unfit(5.5, 10, 12, false) < 5);
    assert.equal(fit1(unfit(5.5, 10, 12, true), 10, 12), 7, 'the gap point fits back to the far half\'s edge');
    // on a lot 8 wide: near [0, 5), far [3, 8]: 4 is in both
    assert.equal(unfit(4, 10, 8, false), 4);
    assert.equal(unfit(4, 10, 8, true), 6);
    assert.equal(unfit(4, 10, 8, null), 6, 'with no old half, the lot half it lies in (4 >= 8 / 2: far)');
    assert.equal(unfit(3.9, 10, 8, null), 3.9);
  });

  it('3. a lot prop drawn by compose goes back to its preset prop\'s point (the whole chain: the preset, fitted, turned, placed at its footprint centre)', () => {
    const leg = (ax: number, ay: number, bx: number, by: number): Leg => ({ a: { x: ax, y: ay }, b: { x: bx, y: by } });
    const e = new NetEditor(new RoadNetwork());
    for (let k = 0; k < 3; k++) { e.addLegs([leg(40, 40 + 40 * k, 120, 40 + 40 * k)], CLASS.street, 0); e.addLegs([leg(40 + 40 * k, 40, 40 + 40 * k, 120)], CLASS.street, 0); }
    e.commit();
    const lm = new LotMap(); lm.update(e.net, null);
    const qs = new Set<number>();
    let checked = 0;
    for (const lot of lm.lots.values()) for (const use of [LU.RES, LU.COM, LU.IND]) {
      const st = { use, level: LV.BUILT, decline: 0, seed: 50 }, lp = lotPreset(lot, st)!;
      qs.add(lp.frame.q);
      for (const q of compose(lot, st).props) {
        // a car may be moved inward off its lot's lines (compose-core fitCar); a stand-in for a removed picture keeps that one's street edge, not its centre (T167)
        if (!q.from || VEHICLE.has(q.id) || q.standIn) continue;
        const fp = footprintOf(q.id, q.scale, q.flip), src = lp.preset.props[q.from.prop]!;
        const back = worldToPreset(lp.frame, lp.preset, q.x + (fp[0] + fp[2]) / 2, q.y + (fp[1] + fp[3]) / 2, src);
        assert.ok(Math.abs(back.x - src.x) < 1e-6 && Math.abs(back.y - src.y) < 1e-6, `${lot.key} ${q.id}: (${src.x}, ${src.y}) came back (${back.x}, ${back.y})`);
        checked++;
      }
    }
    assert.equal(qs.size, 4, 'lots of all four facings');
    assert.ok(checked > 200, `${checked} props checked`);
  });

  it('3b. compose tells every preset prop a lot leaves out, with why (the dev editor\'s ghosts and its list): an overlap, the fit', () => {
    const lot = { o: { x: 100, y: 100 }, u: { x: 1, y: 0 }, n: { x: 0, y: -1 }, w: 10, d: 15 };
    const house = { id: 'world:house_1', x: 5, y: 7, scale: 1, view: 0 as const };
    const p: LotPreset = { id: 'test-res', use: 'res', state: 'built', w: 10, d: 15, props: [house, { ...house, x: 5.2, y: 7.1 }, { id: 'world:bench', x: 9.9, y: 14.9, scale: 1, view: 0 }], patches: [] };
    setLotPresets([p]);
    const drops: PresetDrop[] = [], c = compose(lot, { use: LU.RES, level: LV.BUILT, decline: 0, seed: 1 }, drops);
    assert.equal(c.props.filter(q => q.from?.preset === 'test-res' && q.from.prop === 1).length, 0, 'the copy on top of the house is left out');
    const d = drops.find(x => x.prop === 1);
    assert.ok(d && /^overlaps world:house_1 \d+%$/.test(d.why), JSON.stringify(drops));
    // every drop names its preset, a prop of it and a reason; the bench on the corner, if left out, is past the lot line
    for (const x of drops) assert.ok(x.preset === 'test-res' && p.props[x.prop] && x.why.length > 0, JSON.stringify(x));
    const bench = drops.find(x => x.prop === 2);
    if (bench) assert.equal(bench.why, 'past the lot line');
    // a lot smaller than the preset: a prop of the near half past the new size is left out by the fit
    const small: PresetDrop[] = [];
    setLotPresets([{ ...p, props: [house, { id: 'world:bench', x: 4, y: 7.4, scale: 1, view: 0 }] }]);
    compose({ ...lot, w: 10, d: 7 }, { use: LU.RES, level: LV.BUILT, decline: 0, seed: 1 }, small);
    assert.ok(small.some(x => x.prop === 1 && x.why === 'outside the lot at this size (the fit)'), JSON.stringify(small));
    const none: PresetDrop[] = [];
    setLotPresets([{ ...p, props: [house] }]);
    compose(lot, { use: LU.RES, level: LV.BUILT, decline: 0, seed: 1 }, none);
    assert.deepEqual(none, []);
  });

  it('4. the edits: move, scale, turn, delete, duplicate and add make a new curated preset and leave the old one as it was', () => {
    const p = preset(10, 15, [{ id: 'a', x: 2, y: 3, scale: 1, view: 0 }, { id: 'b', x: 8, y: 12, scale: 0.8, view: 3 }]), before = JSON.stringify(p);
    const mv = applyEdit(p, { op: 'move', prop: 0, x: 2.25, y: 40 })!;
    assert.deepEqual(mv.preset.props[0], { id: 'a', x: 2.25, y: 15, scale: 1, view: 0 }, 'moved, and clamped into the preset');
    assert.equal(mv.preset.curated, true);
    assert.equal(mv.prop, 0);
    assert.equal(applyEdit(p, { op: 'scale', prop: 1, factor: 1.05 })!.preset.props[1]!.scale, 0.84);
    assert.equal(applyEdit(p, { op: 'scale', prop: 1, factor: 100 })!.preset.props[1]!.scale, 5, 'scale capped');
    assert.equal(applyEdit(p, { op: 'turn', prop: 1, by: 1 })!.preset.props[1]!.view, 0, 'view 3 turns to 0');
    assert.equal(applyEdit(p, { op: 'turn', prop: 0, by: -1 })!.preset.props[0]!.view, 3);
    const del = applyEdit(p, { op: 'delete', prop: 0 })!;
    assert.deepEqual(del.preset.props.map(q => q.id), ['b']);
    assert.equal(del.prop, -1);
    const dup = applyEdit(p, { op: 'duplicate', prop: 1, dx: 0.5, dy: 0.5 })!;
    assert.deepEqual(dup.preset.props[2], { id: 'b', x: 8.5, y: 12.5, scale: 0.8, view: 3 });
    assert.equal(dup.prop, 2);
    const add = applyEdit(p, { op: 'add', id: 'world:bench', x: 5.12345, y: 1 })!;
    assert.deepEqual(add.preset.props[2], { id: 'world:bench', x: 5.123, y: 1, scale: 1, view: 0 });
    assert.equal(applyEdit(p, { op: 'delete', prop: 7 }), null);
    assert.equal(JSON.stringify(p), before, 'the old preset is not changed');
    const q = { ...p, id: 'q' }, list = replacePreset([p, q], { ...mv.preset });
    assert.equal(list[0]!.props[0]!.x, 2.25);
    assert.equal(list[1], q);
  });

  it('5. the library-wide sizes and removals are written as the studio writes them', () => {
    const sizes = scaleOverride({ 'world:bench': 1.2, 'a:b': 2 }, 'world:bush_1', 0.9, 1.05);
    assert.equal(sizes['world:bush_1'], 0.945);
    assert.equal(scaleOverride(sizes, 'world:bench', 0.5, 1 / 1.05)['world:bench'], 1.143, 'the studio size, not the base, is scaled');
    assert.equal(studioJson({ b: 1, a: { x: 1 } }), '{\n "a": {\n  "x": 1\n },\n "b": 1\n}\n');
    const rm = removeSprite({ old: { at: 't0' } }, 'world:bush_1', { name: 'Bush 1', cat: 'Trees & plants', kind: 'bush', w: 10, h: 12, quad: [0, 0, 10, 12], ax: 5, ay: 11 }, '2026-10-24T00:00:00.000Z');
    assert.deepEqual(rm['world:bush_1'], { at: '2026-10-24T00:00:00.000Z', name: 'Bush 1', cat: 'Trees & plants', kind: 'bush', w: 10, h: 12, quad: [0, 0, 10, 12], ax: 5, ay: 11 });
    assert.deepEqual(rm.old, { at: 't0' });
  });

  it('5b. a grow never passes the picture\'s pixels (newart.ts maxDrawScale): clamped by the step that would cross the limit, refused at it; a shrink always goes', () => {
    assert.equal(growWithin(1, 1.05, 2), 1.05);
    assert.equal(growWithin(1.98, 1.05, 2), 2, 'the step that crosses the limit stops at it');
    assert.equal(growWithin(2, 1.05, 2), null, 'refused at the limit, as the studio refuses');
    assert.equal(growWithin(2.5, 1.05, 2), null, 'and past it');
    assert.equal(growWithin(2.5, 1 / 1.05, 2), 2.5 / 1.05, 'a shrink from past the limit goes');
    assert.equal(growWithin(1, 1.05, Infinity), 1.05, 'a stand-in has no limit');
    // the four-view houses the presets hold: the largest drawn size of each is its smallest view's limit, finite and above 1
    const house = LIBRARY.findIndex(i => i.id === 'world:house_1');
    assert.ok(Number.isFinite(maxDrawScale(house)) && maxDrawScale(house) > 1, `world:house_1 limit ${maxDrawScale(house)}`);
  });

  it('6. the save endpoint writes only its three whitelisted files, whole and parsed', () => {
    assert.deepEqual(Object.keys(DEV_SAVE_FILES).sort(), ['lot-presets.json', 'removed.json', 'scale-overrides.json']);
    assert.equal(devSavePath('lot-presets.json'), 'src/game/lots/lot-presets.json');
    for (const bad of ['../lot-presets.json', 'src/game/lots/lot-presets.json', 'package.json', 'LOT-PRESETS.JSON', '__proto__', 'constructor', 'toString', '', null, 3, ['lot-presets.json']]) assert.equal(devSavePath(bad), null, String(bad));
    const one = formatPresets([preset(10, 15, [{ id: 'world:bench', x: 1, y: 2, scale: 1, view: 0 }])], { notes: ['n'] });
    const ok = checkDevSave({ file: 'lot-presets.json', json: one });
    assert.deepEqual(ok, { ok: true, path: 'src/game/lots/lot-presets.json', text: one });
    assert.equal(checkDevSave({ file: 'scale-overrides.json', json: '{"a":1}' }).ok, true);
    assert.equal(checkDevSave({ file: 'removed.json', json: '{}' }).ok, true);
    for (const body of [null, 'x', [], { file: 'vite.config.ts', json: '{}' }, { file: '../../x.json', json: '{}' }, { file: 'lot-presets.json', json: [] }, { file: 'lot-presets.json', json: '{}' },
      { file: 'lot-presets.json', json: '[' }, { file: 'scale-overrides.json', json: '[]' }, { file: 'removed.json', json: 'null' },
      // an empty list, a header alone or a broken preset would turn every lot vacant: refused
      { file: 'lot-presets.json', json: '[]' }, { file: 'lot-presets.json', json: '[{"meta":{"notes":[]}}]' }, { file: 'lot-presets.json', json: one.replace('"view":0', '"view":7') },
      { file: 'lot-presets.json', json: '[{"id":"x"}]' }]) assert.equal(checkDevSave(body).ok, false, JSON.stringify(body).slice(0, 80));
  });

  it('7. the endpoints answer only the dev server\'s own pages: another Origin or a cross-site fetch is refused, and a save must be application/json (a cross-site form can only send text/plain without a preflight)', () => {
    const host = '127.0.0.1:5233', own = `http://${host}`, json = 'application/json';
    assert.equal(checkDevRequest({ method: 'POST', host, origin: own, secFetchSite: 'same-origin', contentType: json }), null);
    assert.equal(checkDevRequest({ method: 'POST', host, origin: own, contentType: 'application/json; charset=utf-8' }), null);
    assert.equal(checkDevRequest({ method: 'GET', host, secFetchSite: 'same-origin' }), null, 'a same-origin GET sends no Origin and no Content-Type');
    assert.equal(checkDevRequest({ method: 'GET', host }), null, 'a tool with no browser headers (curl) is the owner on the PC');
    for (const r of [
      { method: 'POST', host, origin: 'https://evil.example', contentType: json },
      { method: 'POST', host, origin: 'http://127.0.0.1:5234', contentType: json },
      { method: 'POST', host, origin: 'null', contentType: json },
      { method: 'POST', host, secFetchSite: 'cross-site', contentType: json },
      { method: 'POST', host, secFetchSite: 'same-site', contentType: json },
      { method: 'POST', host, origin: own, contentType: 'text/plain' },
      { method: 'POST', host, origin: own },
      { method: 'POST', host, origin: own, contentType: 'application/jsonx' },
      { method: 'GET', host, origin: 'https://evil.example' },
      { method: 'GET', host, secFetchSite: 'cross-site' },
      { method: 'POST', origin: own, contentType: json },
    ]) assert.notEqual(checkDevRequest(r), null, JSON.stringify(r));
  });
});
