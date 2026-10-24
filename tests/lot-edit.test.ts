// The in-game dev editor's pure parts (P20 / T071): the frame maths through the fit and the turn, the edits to a preset, the studio JSON, the
// dev server's save whitelist. npm test.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyEdit, fit1, presetToWorld, removeSprite, replacePreset, scaleOverride, studioJson, unfit, worldToPreset } from '../src/game/dev/lot-edit';
import { checkDevSave, devSavePath, DEV_SAVE_FILES } from '../src/game/dev/dev-save';
import { frameOf, toWorld } from '../src/game/lots/preset-frame';
import { fitPreset, type LotPreset } from '../src/game/lots/presets';
import { mulberry } from '../src/game/iso';
import { CLASS, RoadNetwork, type Leg } from '../src/game/network';
import { NetEditor } from '../src/game/netops';
import { LotMap } from '../src/game/lots/lots';
import { compose, lotPreset } from '../src/game/lots/compose';
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
        if (!q.from || VEHICLE.has(q.id)) continue;   // a car may be moved inward off its lot's lines (compose-core fitCar)
        const fp = footprintOf(q.id, q.scale, q.flip), src = lp.preset.props[q.from.prop]!;
        const back = worldToPreset(lp.frame, lp.preset, q.x + (fp[0] + fp[2]) / 2, q.y + (fp[1] + fp[3]) / 2, src);
        assert.ok(Math.abs(back.x - src.x) < 1e-6 && Math.abs(back.y - src.y) < 1e-6, `${lot.key} ${q.id}: (${src.x}, ${src.y}) came back (${back.x}, ${back.y})`);
        checked++;
      }
    }
    assert.equal(qs.size, 4, 'lots of all four facings');
    assert.ok(checked > 200, `${checked} props checked`);
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

  it('6. the save endpoint writes only its three whitelisted files, whole and parsed', () => {
    assert.deepEqual(Object.keys(DEV_SAVE_FILES).sort(), ['lot-presets.json', 'removed.json', 'scale-overrides.json']);
    assert.equal(devSavePath('lot-presets.json'), 'src/game/lots/lot-presets.json');
    for (const bad of ['../lot-presets.json', 'src/game/lots/lot-presets.json', 'package.json', 'LOT-PRESETS.JSON', '__proto__', 'constructor', 'toString', '', null, 3, ['lot-presets.json']]) assert.equal(devSavePath(bad), null, String(bad));
    const ok = checkDevSave({ file: 'lot-presets.json', json: '[\n]\n' });
    assert.deepEqual(ok, { ok: true, path: 'src/game/lots/lot-presets.json', text: '[\n]\n' });
    assert.equal(checkDevSave({ file: 'scale-overrides.json', json: '{"a":1}' }).ok, true);
    assert.equal(checkDevSave({ file: 'removed.json', json: '{}' }).ok, true);
    for (const body of [null, 'x', [], { file: 'vite.config.ts', json: '{}' }, { file: '../../x.json', json: '{}' }, { file: 'lot-presets.json', json: [] }, { file: 'lot-presets.json', json: '{}' },
      { file: 'lot-presets.json', json: '[' }, { file: 'scale-overrides.json', json: '[]' }, { file: 'removed.json', json: 'null' }]) assert.equal(checkDevSave(body).ok, false, JSON.stringify(body));
  });
});
