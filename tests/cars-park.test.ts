// Parked cars keep their lot (Lot Composer, CAR_INSET): every Vehicles prop of many composed lots lies at least 0.39 tiles inside its own lot's box
// on every side (sides, back and front), at the size the game draws cars (CAR_SCALE). Headless: npm test (no DOM, no canvas).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASS, RoadNetwork, type Leg } from '../src/game/network';
import { NetEditor } from '../src/game/netops';
import { LotMap, type Lot } from '../src/game/lots/lots';
import { compose, type ComposeState, type Placed } from '../src/game/lots/compose';
import { LIBRARY } from '../src/game/library';
import { CAR_SCALE } from '../src/game/ext/car-art';

// the network builds Path2D outlines for the painters; in Node a stub that ignores them is enough
(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

const leg = (ax: number, ay: number, bx: number, by: number): Leg => ({ a: { x: ax, y: ay }, b: { x: bx, y: by } });
/** a 4x4 grid of streets, 40 tiles apart, and one boulevard line across it (as compose.test.ts) */
const O = 40, STEP = 40, LINES = 4, at = (k: number) => O + k * STEP, last = at(LINES - 1);
/** the least a parked car may stand inside its lot (CAR_INSET is 0.4; the test allows a hair for rounding) */
const MIN_INSIDE = 0.39;

const byId = new Map(LIBRARY.map(i => [i.id, i]));

/** the footprint of a placed prop in world tiles (the engine's footprint: the union of its boxes, a car at CAR_SCALE) */
function fpOf(p: Placed): [number, number, number, number] {
  const it = byId.get(p.id)!;
  // T236: a car of the vehicle mix stands on its own footprint (Placed.foot: the body at its owner size), drawn at CAR_SCALE of it
  if (p.foot) { const f = p.foot, cx = (f[0] + f[2]) / 2, cy = (f[1] + f[3]) / 2, k = it.kind === 'car' ? CAR_SCALE : 1, hx = (f[2] - f[0]) * k / 2, hy = (f[3] - f[1]) * k / 2; return [cx - hx, cy - hy, cx + hx, cy + hy]; }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const b of it.boxes) {
    const k = p.scale * (it.kind === 'car' ? CAR_SCALE : 1), hx = (p.flip ? b.hy : b.hx) * k / 2, hy = (p.flip ? b.hx : b.hy) * k / 2, dx = (p.flip ? b.dy : b.dx) * k / 2, dy = (p.flip ? b.dx : b.dy) * k / 2;
    x0 = Math.min(x0, p.x + dx - hx); x1 = Math.max(x1, p.x + dx + hx); y0 = Math.min(y0, p.y + dy - hy); y1 = Math.max(y1, p.y + dy + hy);
  }
  return [x0, y0, x1, y1];
}
/** a world point in the lot's frame: a along u, b along n (tiles) */
function toLot(l: Lot, x: number, y: number): { a: number; b: number } {
  const dx = x - l.o.x, dy = y - l.o.y;
  return { a: dx * l.u.x + dy * l.u.y, b: dx * l.n.x + dy * l.n.y };
}
/** the lots of a 4x4 street grid with one boulevard across it */
function lotsOfGrid(): Lot[] {
  const e = new NetEditor(new RoadNetwork());
  for (let k = 0; k < LINES; k++) {
    e.addLegs([leg(O, at(k), last, at(k))], CLASS.street, 0);
    e.addLegs([leg(at(k), O, at(k), last)], CLASS.street, 0);
  }
  e.commit();
  e.addLegs([leg(at(1) + 20, O, at(1) + 20, last)], CLASS.boulevard, 0);
  e.commit();
  const lm = new LotMap(); lm.update(e.net, null);
  return [...lm.lots.values()].sort((p, q) => (p.key < q.key ? -1 : p.key > q.key ? 1 : 0));
}

const LOTS = lotsOfGrid();

test('the grid gives lots to compose', () => {
  assert.ok(LOTS.length >= 50, `only ${LOTS.length} lots`);
});

test('every Vehicles prop (parked cars, pickups, junk cars) of 40 seeds per lot lies at least 0.39 tiles inside its lot on every side', () => {
  let cars = 0, worst = Infinity;
  for (const lot of LOTS) for (let seed = 1; seed <= 40; seed++) {
    // every use, level and decline in turn, a seed per lot and seed (deterministic)
    const st: ComposeState = { use: seed % 6, level: seed % 4, decline: (seed >> 2) % 4, seed: (lot.id * 7919 + seed * 104729) >>> 0 };
    const c = compose(lot, st);
    for (const p of c.props) {
      if (byId.get(p.id)?.cat !== 'Vehicles') continue;
      cars++;
      const f = fpOf(p), q = [[f[0], f[1]], [f[2], f[1]], [f[2], f[3]], [f[0], f[3]]].map(([x, y]) => toLot(lot, x, y));
      const a0 = Math.min(...q.map(v => v.a)), a1 = Math.max(...q.map(v => v.a)), b0 = Math.min(...q.map(v => v.b)), b1 = Math.max(...q.map(v => v.b));
      const inside = Math.min(a0, lot.w - a1, b0, lot.d - b1);
      worst = Math.min(worst, inside);
      assert.ok(inside >= MIN_INSIDE, `${lot.key} ${JSON.stringify(st)}: ${p.id} stands ${inside.toFixed(3)} tiles inside its lot`);
    }
  }
  console.log(`cars park: ${cars} vehicles of ${LOTS.length * 40} composed lots, least inside the lot ${worst.toFixed(3)} tiles`);
  assert.ok(cars >= 200, `only ${cars} vehicles across the lots`);
});
