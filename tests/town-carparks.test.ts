// T296 (#881; the owner, 2026-11-02: "parking lots like the one now at the driving range needs to be all over town and they need to adapt to the street
// angle. also need different angles of the parking lot cement stoppers and parking lines that are at different angle based on the road"): the town's car
// parks laid along their street at any angle (lots/carpark-lot.ts layCarPark, the public car park template autolot.ts parkLot, the shop's car park, the
// presets' own car parks re-laid: relayParks). On the eight street headings and at free angles: the bays inside the lot and the car park, square to the
// street, never overlapping each other, the aisles or the islands; the painted lines along or across the street; a wheel stop in every bay (the picture
// on rows along a world axis, else a painted bar across the bay); every car in a bay, its picture the heading nearest the bay's axis.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HEDGE, Lay, autoLot, realTrees, relayParks } from '../src/game/lots/autolot';
import { STOP, bayDims, layCarPark, stopArt, type ParkPlan } from '../src/game/lots/carpark-lot';
import { type Box4, type LotGeom } from '../src/game/lots/compose-core';
import { frameOf, listToWorld, roadOf, type PresetFrame } from '../src/game/lots/preset-frame';
import { drawnView, isVehicle } from '../src/game/lots/preset-art';
import { CAR_DIRECTIONS, carHeading } from '../src/game/ext/car-art';
import { lotPreset, pickedPreset, setLotPresets, setTownCarParks } from '../src/game/lots/compose';
import { buildGroups } from '../src/game/lots/groups';
import { fitPreset, parsePresets, type PresetPatch, type PresetProp } from '../src/game/lots/presets';
import { LU, LV } from '../src/game/lots/town';
import { mulberry } from '../src/game/iso';
import PRESET_FIXTURE from './fixtures/lot-presets.json';

const FIX = parsePresets(PRESET_FIXTURE);
setLotPresets(FIX.presets, FIX.meta); buildGroups(FIX.presets);
(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

/** a lot of w x d tiles whose street lies at angle t (radians; t = r pi / 4 is road r) */
function lotAt(t: number, w: number, d: number): LotGeom {
  return { o: { x: 300, y: 300 }, u: { x: Math.cos(t), y: -Math.sin(t) }, n: { x: -Math.sin(t), y: -Math.cos(t) }, w, d };
}
/** the eight headings and free angles (none of them near a world axis) */
const ANGLES = [0, 1, 2, 3, 4, 5, 6, 7].map(r => r * Math.PI / 4).concat([0.21, 1.1, 2.6, 3.93, 5.5]);
const inside = (b: Box4, o: Box4, m = 1e-6) => b[0] >= o[0] - m && b[1] >= o[1] - m && b[2] <= o[2] + m && b[3] <= o[3] + m;
const area = (b: Box4) => Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
const meet = (a: Box4, b: Box4) => area([Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])]);
const CAR8 = /^cars:(.+):(SE|S|SW|W|NW|N|NE|E)$/;
/** the world heading index a car prop is drawn in (the frame turns its preset-frame id) */
const drawnHeading = (f: PresetFrame, id: string): number => CAR_DIRECTIONS.indexOf(CAR8.exec(drawnView(id, f, 0).id)![2] as (typeof CAR_DIRECTIONS)[number]);
/** every segment (x0 y0 x1 y1, preset frame) runs along or across the lot's street in the world (u or n), within 1e-6 */
function squareToStreet(f: PresetFrame, segs: readonly number[], tag: string) {
  const w = listToWorld(f, segs);
  for (let k = 0; k + 3 < w.length; k += 4) {
    const dx = w[k + 2]! - w[k]!, dy = w[k + 3]! - w[k + 1]!, l = Math.hypot(dx, dy);
    assert.ok(l > 1e-6, `${tag}: a zero-length segment`);
    const along = Math.abs((dx * f.u.x + dy * f.u.y) / l), across = Math.abs((dx * f.n.x + dy * f.n.y) / l);
    assert.ok(Math.abs(along - 1) < 1e-6 || Math.abs(across - 1) < 1e-6, `${tag}: a segment at ${(Math.atan2(dy, dx) * 180 / Math.PI).toFixed(1)} deg is neither along nor across the street`);
  }
}
/** the checks every laid car park passes: bays, lines, stops and cars (the bays' axis along the frame's y: square to the street) */
function checkPark(L: Lay, plan: ParkPlan, lot: LotGeom, tag: string) {
  const f = L.f, lotBox: Box4 = [0, 0, lot.w, lot.d];
  assert.ok(plan.bays.length >= 2, `${tag}: ${plan.bays.length} bays`);
  plan.bays.forEach((b, i) => {
    assert.ok(inside(b, lotBox), `${tag}: bay ${i} leaves the lot`);
    assert.ok(inside(b, plan.park), `${tag}: bay ${i} leaves the car park`);
    for (let j = i + 1; j < plan.bays.length; j++) assert.ok(meet(b, plan.bays[j]!) < 1e-6, `${tag}: bays ${i} and ${j} overlap`);
    for (const a of plan.aisles) assert.ok(meet(b, a) < 1e-6, `${tag}: bay ${i} on an aisle`);
    for (const s of plan.islands) assert.ok(meet(b, s) < 1e-6, `${tag}: bay ${i} on an island`);
    assert.ok(meet(b, plan.entrance) < 1e-6, `${tag}: bay ${i} in the entrance`);
  });
  // the entrance opens on the street
  assert.ok(Math.abs(plan.entrance[1]) < 1e-6 && plan.entrance[0] >= -1e-6 && plan.entrance[2] <= lot.w + 1e-6, `${tag}: the entrance is off the street`);
  // the asphalt: one patch with the lines (and the painted stops) square to the street, inside the lot
  const asph = L.patches.filter(p => p.kind === 'lot' && p.lines?.length) as (PresetPatch & { lines: number[] })[];
  assert.equal(asph.length, 1, `${tag}: one car park patch`);
  const P = asph[0]!;
  for (let k = 0; k + 1 < P.pts.length; k += 2) assert.ok(P.pts[k]! >= -1e-6 && P.pts[k]! <= lot.w + 1e-6 && P.pts[k + 1]! >= -1e-6 && P.pts[k + 1]! <= lot.d + 1e-6, `${tag}: the asphalt leaves the lot`);
  squareToStreet(f, P.lines, `${tag} lines`);
  // a wheel stop in every bay: the picture on rows along a world axis, else a bar across the bay, inside it
  const art = L.props.filter(q => q.id === STOP).length, bars = (P.stops?.length ?? 0) / 4;
  assert.equal(art + bars, plan.bays.length, `${tag}: ${art} + ${bars} stops for ${plan.bays.length} bays`);
  assert.equal(plan.art, art); assert.equal(plan.bars, bars);
  if (!stopArt(f)) assert.equal(art, 0, `${tag}: a stop's picture on rows off the world axes`);
  if (P.stops) {
    squareToStreet(f, P.stops, `${tag} stops`);
    for (let k = 0; k + 3 < P.stops.length; k += 4) {
      const mx = (P.stops[k]! + P.stops[k + 2]!) / 2, my = (P.stops[k + 1]! + P.stops[k + 3]!) / 2, b = plan.bays.find(q => mx > q[0] && mx < q[2] && my > q[1] && my < q[3]);
      assert.ok(b, `${tag}: a stop outside every bay`);
      assert.ok(Math.abs(P.stops[k + 3]! - P.stops[k + 1]!) < 1e-6, `${tag}: a stop not across its bay`);
      assert.ok(Math.min(P.stops[k]!, P.stops[k + 2]!) >= b[0] - 1e-6 && Math.max(P.stops[k]!, P.stops[k + 2]!) <= b[2] + 1e-6, `${tag}: a stop wider than its bay`);
    }
  }
  // the cars: each in a bay, one car to a bay, its picture the heading nearest the bays' axis (nosed in or backed in)
  const want = carHeading(Math.atan2(f.n.y, f.n.x)), taken = new Set<number>();
  for (const k of plan.cars) {
    const c = L.props[k]!, i = plan.bays.findIndex(b => c.x > b[0] && c.x < b[2] && c.y > b[1] && c.y < b[3]);
    assert.ok(isVehicle(c.id) && i >= 0, `${tag}: ${c.id} stands in no bay`);
    assert.ok(!taken.has(i), `${tag}: two cars in bay ${i}`); taken.add(i);
    assert.equal(c.scale, 1, `${tag}: a car at the road cars' size`);
    const h = drawnHeading(f, c.id);
    assert.ok(h === want || h === (want + 4) % 8, `${tag}: ${c.id} drawn heading ${CAR_DIRECTIONS[h]}, the bays run ${CAR_DIRECTIONS[want]}`);
  }
  // the lamps and island planting inside the lot
  for (const k of plan.lamps) { const b = L.boxOf(L.props[k]!); assert.ok(inside(b, [-1.5, -1.5, lot.w, lot.d]), `${tag}: a lamp outside the lot`); }
}

test('a car park laid along its street on the eight headings and at free angles: bays inside, square to the street, no overlaps, a stop in every bay, cars in bays facing along them', () => {
  let n = 0, side = 0, mid = 0, painted = 0, pictured = 0;
  for (const t of ANGLES) for (const [w, d] of [[20, 16], [14, 10], [26, 18], [12, 12], [30, 26]] as const) {
    const lot = lotAt(t, w, d), f = frameOf(lot), tag = `t${t.toFixed(2)} r${roadOf(lot.n)} ${w}x${d}`;
    const L = new Lay(f, w, d, 'park', 'built', roadOf(lot.n), 3, mulberry(11 + n));
    const plan = layCarPark(L, [0.4, 1.2, w - 0.4, d - 0.3], 5 + 3 * n, { tex: 'asphalt', trees: realTrees(), shrubs: HEDGE, lamps: true });
    assert.ok(plan, `${tag}: no car park`); n++;
    checkPark(L, plan, lot, tag);
    if (plan.mouth === 'side') side++; else mid++;
    painted += plan.bars; pictured += plan.art;
    // (a deep lot: islands and lamps)
    if (w >= 20 && d >= 16) { assert.ok(plan.islands.length >= 2, `${tag}: ${plan.islands.length} islands`); assert.ok(plan.lamps.length >= 1, `${tag}: no lamp`); }
  }
  assert.ok(side > 0 && mid > 0, `both entrances laid (${side} side drives, ${mid} middle mouths)`);
  assert.ok(painted > 0 && pictured > 0, `both stops drawn (${painted} painted, ${pictured} pictures)`);
});

test('a lot too shallow for a row and its aisle has no car park', () => {
  const lot = lotAt(0.7, 20, 4), L = new Lay(frameOf(lot), 20, 4, 'park', 'built', roadOf(lot.n), 3, mulberry(3));
  assert.equal(layCarPark(L, [0.4, 0.6, 19.6, 3.7], 9, { tex: 'asphalt', trees: [], shrubs: [], lamps: true }), null);
  assert.equal(L.patches.length, 0);
});

test('the public car park and the small shop (generated lots) on every heading: their car park patch square to the street, a stop per bay, its stops painted off the world axes', () => {
  for (const t of ANGLES) for (const [tpl, use, w, d] of [['park', 'park', 20, 16], ['park', 'park', 14, 10], ['shop', 'com', 20, 16], ['shop', 'com', 16, 12]] as const) {
    const lot = lotAt(t, w, d), f = frameOf(lot), tag = `${tpl} t${t.toFixed(2)} ${w}x${d}`;
    const p = autoLot(lot, use, 3, 21, 'built', tpl);
    assert.ok(p, `${tag}: null`);
    assert.equal(p.id, `auto:${tpl}`, `${tag}: drew ${p.id}`);
    const parks = p.patches.filter(a => a.kind === 'lot' && a.lines?.length);
    assert.equal(parks.length, 1, `${tag}: one car park`);
    const P = parks[0]!, bays = (P.lines!.length / 4), stops = p.props.filter(q => q.id === STOP).length + (P.stops?.length ?? 0) / 4;
    squareToStreet(f, P.lines!, tag);
    if (P.stops) squareToStreet(f, P.stops, `${tag} stops`);
    assert.ok(stops >= 2, `${tag}: ${stops} stops`);
    assert.ok(stops < bays, `${tag}: ${stops} stops for ${bays} lines (one more line than bays a row)`);
    if (!stopArt(f)) assert.equal(p.props.filter(q => q.id === STOP).length, 0, `${tag}: a stop's picture off the world axes`);
    // (the islands over the asphalt: drawn with the car parks)
    for (const a of p.patches) if (a.park) assert.ok(a.tex === 'slabs' || a.tex === 'grass', `${tag}: an island of ${a.tex}`);
  }
});

test('the town: a commercial lot the town makes a car park draws the generated car park at any angle; off, it draws its presets', () => {
  const st = { use: LU.COM, level: LV.BUILT, decline: 0, seed: 7 };
  for (const t of [0, Math.PI / 4, 0.3, 2.6]) for (const [w, d] of [[16, 14], [12, 10]] as const) {
    const lot = lotAt(t, w, d);
    assert.equal(pickedPreset(lot, st)?.id, 'auto:park', `t${t.toFixed(2)}`);
  }
  setTownCarParks(false);
  try { assert.notEqual(pickedPreset(lotAt(0, 12, 10), st)?.id, 'auto:park'); } finally { setTownCarParks(true); }
});

test("a preset's own car park re-laid along its street: its cars and wheel stops replaced, the bays sized from the car, square to the street, stops painted off the axes", () => {
  const withPark = FIX.presets.filter(p => (p.use === 'com' || p.use === 'civic') && p.road === undefined && p.patches.some(a => a.kind === 'lot' && (a.lines?.length ?? 0) >= 8) && p.props.some(q => q.id === STOP)).slice(0, 12);
  assert.ok(withPark.length >= 4, `${withPark.length} presets with a car park`);
  let relaid = 0;
  for (const p of withPark) for (const t of [0.14, 0, 1.0]) {
    const lot = lotAt(t, p.w, p.d), f = frameOf(lot), fit = fitPreset(p, p.w, p.d), tag = `${p.id} t${t}`;
    const out = relayParks(fit, f, lot, p.use, p.state, 77);
    assert.equal(out.props.length, out.from.length, `${tag}: from kept in step`);
    const parks = out.patches.filter(a => a.kind === 'lot' && a.lines?.length && a.stops !== undefined || (a.kind === 'lot' && a.lines?.length && out.props.some(q => q.id === STOP)));
    const boxes: Box4[] = out.patches.filter(a => a.kind === 'lot' && a.lines?.length).map(a => { const xs = a.pts.filter((_, i) => i % 2 === 0), ys = a.pts.filter((_, i) => i % 2 === 1); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; });
    if (!parks.length) continue;
    relaid++;
    for (const a of out.patches) if (a.kind === 'lot' && a.lines?.length) { squareToStreet(f, a.lines, tag); if (a.stops) squareToStreet(f, a.stops, `${tag} stops`); }
    if (!stopArt(f)) assert.equal(out.props.filter(q => q.id === STOP).length, 0, `${tag}: a stop's picture left on a frame off the world axes`);
    // the preset's own cars in the car park are gone; each car in one is a new one along the bays' axis, at the road cars' size
    const inPark = (q: PresetProp) => boxes.some(b => q.x >= b[0] - 0.05 && q.x <= b[2] + 0.05 && q.y >= b[1] - 0.05 && q.y <= b[3] + 0.05);
    for (let k = 0; k < out.props.length; k++) {
      const q = out.props[k]!;
      if (!isVehicle(q.id) || !inPark(q) || !CAR8.test(q.id)) continue;
      assert.equal(out.from[k], -1, `${tag}: a preset car left in the car park`);
      assert.equal(q.scale, 1);
    }
  }
  assert.ok(relaid >= 4, `${relaid} car parks re-laid`);
});

test('the composer re-lays a shop preset\'s car park on a lot a little off the map axes (no crooked stoppers)', () => {
  let seen = 0;
  for (let seed = 100; seed < 160 && seen < 6; seed++) {
    const lot = lotAt(0.12, 12, 12), st = { use: LU.COM, level: LV.BUILT, decline: 0, seed: seed * 100 + 50 };
    const r = lotPreset(lot, st); if (!r || r.preset.id.startsWith('auto:')) continue;
    const parks = r.fit.patches.filter(a => a.kind === 'lot' && a.lines?.length); if (!parks.length) continue;
    seen++;
    assert.equal(r.fit.props.filter(q => q.id === STOP).length, 0, `${r.preset.id}: a stop's picture at 7 degrees`);
    for (const a of parks) squareToStreet(r.frame, a.lines!, r.preset.id);
  }
  assert.ok(seen >= 1, 'no shop preset with a car park drawn');
  assert.ok(bayDims(frameOf(lotAt(0.12, 16, 14)), 1));
});
