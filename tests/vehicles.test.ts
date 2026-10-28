// T236 (#693): the car paints after the audit (only the kept ones drawn: none, so every car in its art's own colour unless ?carpaint=1), and the
// vehicle mix (vehicles.ts): every vehicle's pictures exist; only the two eight-way wagons drive; a bay's car is a vehicle with a picture at the
// bay's heading, never one that lacks it; the mix is deterministic per spot and varied; the lots' parked wagons take the same mix; the rusty
// pickup only replaces a farm's or junk yard's yellow one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAR_PAINT, KEPT_PAINTS, PAINTS, bodyOf, drawnPaint, hash3, paintAt, paintCode, paintOf } from '../src/game/car-paint';
import { DRIVERS, RUSTY_PICKUP, RUSTY_PICKUPS, VEHICLES, bayCar, bayFoot, groundOffset, isWagon, lotPickup, parkedAs, spotSeed, vehicleOf, vehiclesAt } from '../src/game/vehicles';
import { facings } from '../src/game/traffic';
import { LIBRARY } from '../src/game/library';
import { CAR_DIRECTIONS } from '../src/game/ext/car-art';

(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

const INDEX = new Map(LIBRARY.map((it, i) => [it.id, i] as const));
/** the vehicle a library picture belongs to, and the heading it stands for there */
const owner = (item: number) => { const id = LIBRARY[item]!.id; for (const v of [...VEHICLES, RUSTY_PICKUP]) { const h = v.views.indexOf(id); if (h >= 0) return { v, h }; } return null; };

test('paints: only the kept ones are drawn (none kept: every car its own colour), the full palette only with the switch on', () => {
  assert.equal(CAR_PAINT.on, false, 'off by default (?carpaint=1 turns it on)');
  assert.equal(KEPT_PAINTS.length, 0, 'the audit kept none');
  const burg = INDEX.get('cars:burgundy-wagon:SE')!, navy = INDEX.get('cars:navy-wood-panel-wagon:NW')!;
  for (let i = 0; i < 3000; i++) { const p = paintOf(hash3(i, 0x51)); assert.ok(p === 0 || KEPT_PAINTS.includes(p), `seed ${i}: paint ${p} is not kept`); }
  for (let k = 1; k <= PAINTS.length; k++) {
    assert.equal(drawnPaint(k), KEPT_PAINTS.includes(k));
    assert.equal(paintCode(burg, k), 0, `paint ${k} drawn on the burgundy wagon`); assert.equal(paintCode(navy, k), 0, `paint ${k} drawn on the navy wagon`);
  }
  assert.equal(paintAt(10.5, 20.25), 0);
  // the switch on (the art fix's look): T228's palette again
  CAR_PAINT.on = true;
  try {
    const seen = new Set<number>(); for (let i = 0; i < 3000; i++) seen.add(paintOf(hash3(i, 0x51)));
    assert.equal(seen.size, PAINTS.length + 1);
    assert.equal(paintCode(burg, 5), 5); assert.equal(paintCode(navy, 5), 21); assert.equal(bodyOf(INDEX.get('static:pickup_n')!), -1);
  } finally { CAR_PAINT.on = false; }
});

test('vehicles: every picture is in the library, a vehicle has each picture at one heading only, and only the two wagons have all eight', () => {
  for (const v of [...VEHICLES, RUSTY_PICKUP]) {
    assert.equal(v.views.length, 8, v.model);
    for (const id of v.views) if (id) assert.ok(INDEX.has(id), `${v.model}: ${id} missing`);
    const ids = v.views.filter(Boolean); assert.equal(new Set(ids).size, ids.length, `${v.model}: a picture at two headings`);
  }
  assert.deepEqual(DRIVERS.map(v => v.model), ['cars:burgundy-wagon', 'cars:navy-wood-panel-wagon']);
  // the drivers' pictures are the traffic's own (traffic.ts facings: types 0 and 1)
  const F = facings();
  DRIVERS.forEach((v, d) => v.views.forEach((id, h) => assert.equal(LIBRARY[F[d]![h]!.item]!.id, id)));
  // the facings the issue asked about: the pickup has six (no SE, no NW), world cars two or three, the rusty pickup three
  const n = (m: string) => [...VEHICLES, RUSTY_PICKUP].find(v => v.model === m)!.views.map((id, h) => (id ? CAR_DIRECTIONS[h] : '')).filter(Boolean).join(' ');
  assert.equal(n('static:pickup'), 'S SW W N NE E');
  assert.equal(n('world:car_0'), 'SE E'); assert.equal(n('world:car_2'), 'SE SW E');
  assert.equal(n('expansion:scrap-pickup-rear'), 'SW NE E');
  // every corner heading has a mix (the wagons and at least one other)
  for (const h of [0, 2, 4, 6]) assert.ok(vehiclesAt(h).length >= 3, `heading ${CAR_DIRECTIONS[h]}: ${vehiclesAt(h).length}`);
  assert.ok(!vehiclesAt(4).some(v => v.model === 'static:pickup'), 'no pickup at NW');
  assert.ok(vehiclesAt(4).some(v => v.model === 'static:compact_w'), 'the light blue compact at NW');
});

test('bays: a bay\'s car is a vehicle with a picture at the bay\'s heading, never one that lacks it, never the rusty pickup', () => {
  const lacking = new Map<number, number>();
  for (let dir = 0; dir < 4; dir++) {
    const h = dir * 2;
    for (let i = 0; i < 600; i++) {
      const x = 100 + (i % 30) * 1.25, y = 200 + Math.floor(i / 30) * 2.5 + dir * 100, f = bayCar(dir, x, y), o = owner(f.item);
      assert.ok(o, `${LIBRARY[f.item]!.id} is no vehicle's picture`);
      assert.equal(o!.h, h, `${LIBRARY[f.item]!.id} stands for heading ${CAR_DIRECTIONS[o!.h]} in a ${CAR_DIRECTIONS[h]} bay`);
      assert.notEqual(o!.v, RUSTY_PICKUP, 'the rusty pickup in a car park');
      assert.ok(o!.v.views[h], `${o!.v.model} lacks ${CAR_DIRECTIONS[h]}`);
      assert.equal(f.flip, false, 'never mirrored');
      if (!isWagon(f.item)) {
        // the wagons' size and body footprint, centred on the bay
        const w = facings()[0]![h]!, ft = bayFoot(f, x, y);
        assert.ok(Math.abs((ft[0] + ft[2]) / 2 - x) < 1e-9 && Math.abs((ft[1] + ft[3]) / 2 - y) < 1e-9);
        assert.ok(Math.abs(f.hx - w.hx) < 1e-9 && Math.abs(f.hy - w.hy) < 1e-9);
        assert.ok(Math.abs(f.size - (facings()[0]![h]!.size + facings()[1]![h]!.size) / 2) < 1e-9);
      }
      lacking.set(o!.v.views.filter(Boolean).length, 1);
    }
  }
  // single- and few-view vehicles did park (in the bays they have a picture for)
  assert.ok([...lacking.keys()].some(k => k < 8), 'no vehicle but the wagons parked');
});

test('the mix: deterministic per spot, varied, the wagons still the commonest', () => {
  for (let i = 0; i < 200; i++) {
    const x = 37.25 + i * 1.25, y = 81.5;
    assert.equal(spotSeed(x, y), spotSeed(x, y));
    for (let dir = 0; dir < 4; dir++) assert.equal(bayCar(dir, x, y).item, bayCar(dir, x, y).item, 'the same bay, the same car');
    assert.equal(vehicleOf(0, spotSeed(x, y)), vehicleOf(0, spotSeed(x, y)));
  }
  for (const h of [0, 2, 4, 6]) {
    const count = new Map<string, number>();
    for (let i = 0; i < 2000; i++) { const v = vehicleOf(h, spotSeed(i * 1.25, h * 10))!; count.set(v.model, (count.get(v.model) ?? 0) + 1); }
    assert.equal(count.size, vehiclesAt(h).length, `heading ${CAR_DIRECTIONS[h]}: every vehicle comes up`);
    const wagons = (count.get('cars:burgundy-wagon') ?? 0) + (count.get('cars:navy-wood-panel-wagon') ?? 0);
    assert.ok(wagons > 2000 * 0.3 && wagons < 2000 * 0.95, `heading ${CAR_DIRECTIONS[h]}: wagons ${wagons} of 2000`);
  }
});

test('lots: a parked wagon at a corner heading takes the mix (where it stood, at its size); a moving heading or another picture is kept', () => {
  const h0: [number, number, number, number] = [-1, -0.4, 1, 0.4];
  let swapped = 0;
  for (let i = 0; i < 300; i++) {
    const x = 50 + i * 0.7, y = 90 - i * 0.3;
    for (const d of CAR_DIRECTIONS) {
      const id = `cars:navy-wood-panel-wagon:${d}`, h = CAR_DIRECTIONS.indexOf(d), r = parkedAs(id, 1.08, h0, x, y);
      assert.deepEqual(r, parkedAs(id, 1.08, h0, x, y), 'deterministic');
      if (h % 2) { assert.equal(r.id, id, 'a moving heading is kept'); continue; }
      const o = owner(INDEX.get(r.id)!)!; assert.equal(o.h, h, `${r.id} at ${d}`); assert.notEqual(o.v, RUSTY_PICKUP);
      if (r.id !== id) {
        swapped++;
        // its footprint keeps its size, moved so its ground centre stands where the wagon's did (groundOffset)
        assert.ok(Math.abs((r.h[2] - r.h[0]) - (h0[2] - h0[0])) < 1e-9 && Math.abs((r.h[3] - r.h[1]) - (h0[3] - h0[1])) < 1e-9);
      } else assert.deepEqual(r.h, h0);
    }
  }
  assert.ok(swapped > 200, `only ${swapped} wagons took another vehicle`);
  for (const id of ['static:pickup_n', 'world:car_0', 'landscape:bush-deep-green', 'static:compact_e']) assert.equal(parkedAs(id, 1, h0, 3, 4).id, id);
  // the wagons' own anchors sit on their ground centre (the rule groundOffset reads the old art by)
  for (const d of ['SE', 'SW', 'NW', 'NE']) for (const m of ['burgundy-wagon', 'navy-wood-panel-wagon']) {
    const [gx, gy] = groundOffset(INDEX.get(`cars:${m}:${d}`)!); assert.ok(Math.abs(gx) <= 1 && Math.abs(gy) <= 1, `${m} ${d}: ${gx}, ${gy}`);
  }
});

test('the rusty pickup: only in a farm\'s or junk yard\'s yellow pickup\'s place, about half of them, the same lot always the same', () => {
  let rusty = 0;
  for (let seed = 0; seed < 400; seed++) {
    const a = lotPickup('static:pickup_n', seed, 2); assert.equal(a, lotPickup('static:pickup_n', seed, 2));
    assert.ok(a === 'static:pickup_n' || a === 'expansion:scrap-pickup-rear'); if (a !== 'static:pickup_n') rusty++;
    for (const other of ['cars:burgundy-wagon:NE', 'world:car_1', 'static:compact_n']) assert.equal(lotPickup(other, seed), other);
  }
  assert.ok(rusty > 120 && rusty < 280, `${rusty} of 400`);
  // the farm pool's facing letters: its base faces -y (NE), its :4 +y (SW), as the yellow pickup_n faces -y
  assert.equal(RUSTY_PICKUPS['expansion:scrap-pickup-rear'], 'n'); assert.equal(RUSTY_PICKUP.views[6], 'expansion:scrap-pickup-rear');
  assert.equal(RUSTY_PICKUPS[RUSTY_PICKUP.views[2]!], 's');
});
