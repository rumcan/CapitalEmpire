// Phase 1 gate: a road crosses a river on a bridge and a hill in a tunnel, on real generated terrain. Headless: npm test (bundled by esbuild, run by node --test; no DOM, no canvas).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAP } from '../src/game/iso';
import { classAt, generateTerrain, TC, type Terrain } from '../src/game/terrain';
import { splitByTerrain, structureLengths } from '../src/game/structures';
import { CLASS, RoadNetwork, SK, perp, norm, type Leg, type SegKind } from '../src/game/network';

// the network builds Path2D outlines for the painters; in Node a stub that ignores them is enough
(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

const SEEDS = [1, 2, 3];
const HALF = CLASS.street.h + CLASS.street.walk;
const memo = new Map<number, Terrain>();
/** a generated terrain, cached per seed across the tests */
function gen(seed: number): Terrain {
  let t = memo.get(seed);
  if (!t) { t = generateTerrain(seed); memo.set(seed, t); }
  return t;
}

/** the river leg across the river at its point nearest the map centre, and the water width there */
function riverLeg(t: Terrain): { leg: Leg; w: number } {
  const pts = t.waters.find(v => v.kind === 'river')!.pts;
  let best = 1, bestD = Infinity;
  for (let k = 1; k < pts.length - 1; k++) {
    const d = Math.hypot(pts[k].x - MAP / 2, pts[k].y - MAP / 2);
    if (d < bestD) { bestD = d; best = k; }
  }
  const P = pts[best], w = P.w;
  const n = norm(perp({ x: pts[best + 1].x - pts[best - 1].x, y: pts[best + 1].y - pts[best - 1].y }));
  const r = w / 2 + 20;
  return { leg: { a: { x: P.x - n.x * r, y: P.y - n.y * r }, b: { x: P.x + n.x * r, y: P.y + n.y * r } }, w };
}

/** the first east-west run of hill tiles (12..250 long, 10 clear tiles either side) on a row between y 100 and MAP - 100 */
function hillLeg(t: Terrain): Leg {
  const cls = t.cls;
  for (let y = 100; y < MAP - 100; y += 6) {
    for (let x = 100; x < MAP - 100; x++) {
      if (cls[y * MAP + x] !== TC.HILL || (x > 0 && cls[y * MAP + x - 1] === TC.HILL)) continue;
      let x1 = x;
      while (x1 < MAP && cls[y * MAP + x1] === TC.HILL) x1++;
      const len = x1 - x;
      let clear = x - 10 >= 0 && x1 + 10 <= MAP;
      for (let i = 1; clear && i <= 10; i++) {
        for (const c of [cls[y * MAP + x - i], cls[y * MAP + x1 + i - 1]]) if (c === TC.HILL || c === TC.WATER) clear = false;
      }
      if (len >= 12 && len <= 250 && clear) return { a: { x: x - 8, y }, b: { x: x1 + 8, y } };
      x = x1;
    }
  }
  assert.fail('no hill run on the scanned rows');
}

const parts = (legs: Leg[], kinds: SegKind[], kind: SegKind) => legs.filter((_, i) => kinds[i] === kind);

for (const seed of SEEDS) {
  test(`seed ${seed}: a road crosses the river on a bridge at least as wide as the river`, () => {
    const t = gen(seed);
    const { leg, w } = riverLeg(t);
    const split = splitByTerrain([leg], HALF, (x, y) => classAt(t, x, y));
    assert.ok(split.kinds.includes(SK.BRIDGE), 'the crossing has no bridge');
    const bridge = structureLengths(split.legs, split.kinds)[1];
    console.log(`seed ${seed}: river width ${w.toFixed(1)} tiles, bridge ${bridge.toFixed(1)} tiles`);
    assert.ok(bridge >= w, `bridge ${bridge} is shorter than the river ${w}`);
  });

  test(`seed ${seed}: a road crosses a hill in a tunnel, surfacing on ground at both ends`, () => {
    const t = gen(seed);
    const leg = hillLeg(t);
    const split = splitByTerrain([leg], HALF, (x, y) => classAt(t, x, y));
    assert.ok(split.kinds.includes(SK.TUNNEL), 'the hill crossing has no tunnel');
    assert.equal(split.kinds[0], SK.GROUND, 'the west end is not on ground');
    assert.equal(split.kinds[split.kinds.length - 1], SK.GROUND, 'the east end is not on ground');
    const tunnel = structureLengths(split.legs, split.kinds)[2];
    console.log(`seed ${seed}: hill run ${(leg.b.x - leg.a.x - 16).toFixed(0)} tiles, tunnel ${tunnel.toFixed(1)} tiles`);
  });

  test(`seed ${seed}: the bridge and the tunnel on one network give a BRIDGE route, a TUNNEL route and two portals`, () => {
    const t = gen(seed);
    const river = splitByTerrain([riverLeg(t).leg], HALF, (x, y) => classAt(t, x, y));
    const hill = splitByTerrain([hillLeg(t)], HALF, (x, y) => classAt(t, x, y));
    const net = new RoadNetwork();
    net.addLegs(river.legs, CLASS.street, 0, false, river.kinds);
    net.addLegs(hill.legs, CLASS.street, 0, false, hill.kinds);
    net.rebuild(true);
    const kinds = [...net.routes].map(r => r.kind);
    assert.ok(kinds.includes(SK.BRIDGE), 'no BRIDGE route');
    assert.ok(kinds.includes(SK.TUNNEL), 'no TUNNEL route');
    assert.ok(net.portals().length >= 2, `only ${net.portals().length} portals`);
    assert.ok(parts(river.legs, river.kinds, SK.BRIDGE).length > 0 && parts(hill.legs, hill.kinds, SK.TUNNEL).length > 0);
  });
}
