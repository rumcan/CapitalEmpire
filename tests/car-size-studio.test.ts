// T163 (the owner: "parked cars on the lots are not the same size as the ones saved in the library?"): a car parked on a lot is drawn at the
// width the studio's Library card shows for its model, at the same zoom: the card's own code (studio.html drawnOf, read from the file) on the
// studio's numbers (server.mjs: the model's size, CAR_SCALE; size-report.ts: sharp) against the game's (a lot composed from a preset, its car
// drawn by sprites.ts spriteRect). A size past the picture's pixels is drawn at its limit by both. A studio size changed while the game runs
// reaches its lots (lots/scales-live.ts): the tables in place, the car facings again. Headless.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { LIBRARY } from '../src/game/library';
import { spriteRect, type Drawable } from '../src/game/sprites';
import { CAR_SCALE, carModel, carModelSize, carOwnerScale } from '../src/game/ext/car-art';
import { PIXEL_LIMIT, PIXEL_SLACK } from '../src/game/sizes';
import { footprintOf, ownerScaleOf, turned } from '../src/game/lots/preset-art';
import { compose, lotPresets, setLotPresets } from '../src/game/lots/compose';
import { LU, LV } from '../src/game/lots/town';
import { OWNER_SCALE, STUDIO_SCALE, TABLE_SCALE } from '../src/game/lots/scales';
import { applyStudioScales, onStudioScales } from '../src/game/lots/scales-live';
import { parkedCar, resetFacings } from '../src/game/traffic';

(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

const INDEX = new Map(LIBRARY.map((it, i) => [it.id, i] as const)), Z = 0.3;
/** the studio card's drawn scale (studio.html, its own lines: PIXEL_SLACK, ownK, drawnOf) */
const html = fs.readFileSync('scripts/assets/review/studio.html', 'utf8');
const lines = ['const PIXEL_SLACK', 'const drawnOf'].map(h => html.split('\n').find(l => l.startsWith(h))!);
const drawnOf = new Function(`${lines.join('\n')}\nreturn drawnOf;`)() as (s: Record<string, unknown>) => { quad: number[]; k: number };
/** a car's card as the studio builds it (server.mjs /api/sprites: its model's size, CAR_SCALE; size-report.ts: sharp, the picture's limit) and its
 *  drawn width at zoom Z (studio.html stage(): the quad's width x k x K) */
function cardWidth(id: string): number {
  const it = LIBRARY[INDEX.get(id)!]!, s = { id, quad: it.quad, scale: carModelSize(STUDIO_SCALE, carModel(id)) ?? 1, carScale: CAR_SCALE, sharp: PIXEL_LIMIT[INDEX.get(id)!]! * PIXEL_SLACK / CAR_SCALE };
  const d = drawnOf(s); return (d.quad[2]! - d.quad[0]!) * d.k * Z;
}
/** a car composed on a lot as the engine places it (its scale, the footprint at it) and its drawn width at zoom Z (sprites.ts spriteRect) */
function gameWidth(id: string, scale: number): number {
  const i = INDEX.get(id)!, fp = footprintOf(id, scale, false), d: Drawable = { item: i, x: 10, y: 10, flip: false, scale, x0: 10 + fp[0], y0: 10 + fp[1], x1: 10 + fp[2], y1: 10 + fp[3] };
  const r = spriteRect(d); return (r[2] - r[0]) * Z;
}
/** the cars of a lot composed from a preset holding one (the preset forced, as the lab and the game draw it) */
function lotCars(): { id: string; scale: number }[] {
  const p = lotPresets().find(q => q.road === 0 && q.whole && q.props.some(x => /^cars:/.test(x.id)))!;
  const g = { o: { x: 100, y: 100 }, u: { x: 1, y: 0 }, n: { x: 0, y: -1 }, w: p.w, d: p.d };
  return compose(g, { use: LU.RES, level: LV.BUILT, decline: 0, seed: 3, preset: p.id }).props.filter(q => LIBRARY[INDEX.get(q.id) ?? -1]?.kind === 'car').map(q => ({ id: q.id, scale: q.scale }));
}

describe('parked cars on lots match the studio card (T163)', () => {
  it('1. every car picture the lots draw: the lot draws it at the card\'s width (30% zoom)', () => {
    const ids = new Set<string>();
    for (const p of lotPresets()) for (const q of p.props) if (LIBRARY[INDEX.get(q.id) ?? -1]?.kind === 'car') for (let k = 0; k < 4; k++) ids.add(turned(q.id, k).id);
    assert.ok(ids.size >= 8, `${ids.size} car pictures`);
    for (const id of ids) { const g = gameWidth(id, ownerScaleOf(id)), c = cardWidth(id); assert.ok(Math.abs(g - c) < 0.01, `${id}: lot ${g.toFixed(2)} px, card ${c.toFixed(2)} px`); }
    // a lot composed from a preset: its cars at their model's size, as wide as their cards
    const cars = lotCars(); assert.ok(cars.length > 0, 'the lot has a car');
    for (const c of cars) { assert.equal(c.scale, carOwnerScale(c.id)); assert.ok(Math.abs(gameWidth(c.id, c.scale) - cardWidth(c.id)) < 0.01, c.id); }
    // the car parks' cars (the facings) too
    for (let t = 0; t < 2; t++) for (let d = 0; d < 4; d++) { const f = parkedCar(t, d), id = LIBRARY[f.item]!.id; assert.ok(Math.abs(gameWidth(id, f.size) - cardWidth(id)) < 0.01, id); }
  });
  it('2. a size past the picture\'s pixels: the lot draws it at its limit, and so does the card (before, the card showed the size asked)', () => {
    const was = { ...STUDIO_SCALE }, model = carModel(lotCars()[0]!.id);
    try {
      applyStudioScales({ ...was, [model]: 3 });
      const cars = lotCars();
      for (const c of cars) if (carModel(c.id) === model) {
        const g = gameWidth(c.id, c.scale), card = cardWidth(c.id), asked = (LIBRARY[INDEX.get(c.id)!]!.quad[2] - LIBRARY[INDEX.get(c.id)!]!.quad[0]) * 3 * CAR_SCALE * Z;
        assert.ok(g < asked * 0.9, `${c.id} is drawn at its limit (${g.toFixed(1)} px, asked ${asked.toFixed(1)})`);
        assert.ok(Math.abs(g - card) < 0.01, `${c.id}: lot ${g.toFixed(2)} px, card ${card.toFixed(2)} px`);
      }
    } finally { applyStudioScales(was); }
  });
  it('3. a studio size saved while the game runs reaches its tables in place, the car facings and the listeners; a size cleared falls back', () => {
    const was = { ...STUDIO_SCALE }, model = carModel(parkedCar(0, 0) && LIBRARY[parkedCar(0, 0).item]!.id), heard: number[] = [];
    const un = onStudioScales(() => heard.push(1));
    try {
      const before = parkedCar(0, 0).size, next = +(before * 1.07).toFixed(3);
      const changed = applyStudioScales({ ...was, [model]: next });
      assert.deepEqual(changed, [model]); assert.equal(heard.length, 1);
      assert.equal(STUDIO_SCALE[model], next, 'the same table object, updated in place');
      assert.equal(carOwnerScale(LIBRARY[parkedCar(0, 0).item]!.id), next);
      assert.equal(parkedCar(0, 0).size, before, 'the facings keep their size until they are built again');
      resetFacings(); assert.equal(parkedCar(0, 0).size, next, 'built again: the new size');
      assert.equal(lotCars().find(c => carModel(c.id) === model)?.scale ?? next, next, 'a lot composed again takes it');
      // a non-car sprite: its size, then cleared back to the owner's table (or to none)
      const id = Object.keys(TABLE_SCALE).find(k => !(k in was))!;
      applyStudioScales({ ...was, [id]: 2.5 }); assert.equal(OWNER_SCALE[id], 2.5);
      applyStudioScales({ ...was }); assert.equal(OWNER_SCALE[id], TABLE_SCALE[id], 'cleared: the table\'s size');
      assert.equal(applyStudioScales({ ...was }).length, 0, 'nothing changed: nobody is told');
    } finally { un(); applyStudioScales(was); resetFacings(); setLotPresets(lotPresets()); }
  });
});
