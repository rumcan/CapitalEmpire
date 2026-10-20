// The Lot Composer: deterministic, lived-in lots (Phase 3 step 5c). Headless: npm test (no DOM, no canvas).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASS, RoadNetwork, type Leg } from '../src/game/network';
import { NetEditor } from '../src/game/netops';
import { LotMap, type Lot } from '../src/game/lots/lots';
import { compose, isCarPark, type ComposeState, type Composition, type Placed } from '../src/game/lots/compose';
import { LU, LV } from '../src/game/lots/town';
import { LIBRARY } from '../src/game/library';
import { mulberry } from '../src/game/iso';

// the network builds Path2D outlines for the painters; in Node a stub that ignores them is enough
(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

const leg = (ax: number, ay: number, bx: number, by: number): Leg => ({ a: { x: ax, y: ay }, b: { x: bx, y: by } });
/** a 4x4 grid of streets, 40 tiles apart, and one boulevard line across it */
const O = 40, STEP = 40, LINES = 4, at = (k: number) => O + k * STEP, last = at(LINES - 1);

const byId = new Map(LIBRARY.map(i => [i.id, i]));
/** the street-placed items (the verge in front of a lot, up to 1.2 tiles) */
const STREET = new Set(['gen:trash-cans-row', 'world:mailbox', 'world:streetlamp', 'town:bus_stop', 'town:phone_booth', 'town:street_sign', 'town:utility_pole', 'world:hydrant', 'expansion:parking-meter', 'expansion:leaf-bags']);
const isFence = (id: string) => { const k = byId.get(id)?.kind; return k === 'fencex' || k === 'fencey' || id === 'world:hedge'; };
const isWheel = (id: string) => id === 'expansion:wheel-stop';
const isCar = (id: string) => byId.get(id)?.cat === 'Vehicles';
const isUpright = (id: string) => !isFence(id) && !isWheel(id);
const isHouse = (id: string) => byId.get(id)?.cat === 'Houses' && byId.get(id)?.kind === 'house';
const isRear = (id: string) => /^expansion:(ranch|cottage|dormer|duplex|victorian)-rear$/.test(id);

/** the footprint of a placed prop in world tiles (the engine's footprint: the union of its boxes) */
function fpOf(p: Placed): [number, number, number, number] {
  const it = byId.get(p.id)!;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const b of it.boxes) {
    const k = p.scale, hx = (p.flip ? b.hy : b.hx) * k / 2, hy = (p.flip ? b.hx : b.hy) * k / 2, dx = (p.flip ? b.dy : b.dx) * k / 2, dy = (p.flip ? b.dx : b.dy) * k / 2;
    x0 = Math.min(x0, p.x + dx - hx); x1 = Math.max(x1, p.x + dx + hx); y0 = Math.min(y0, p.y + dy - hy); y1 = Math.max(y1, p.y + dy + hy);
  }
  return [x0, y0, x1, y1];
}
/** a world point in the lot's frame: a along u, b along n (tiles) */
function toLot(l: Lot, x: number, y: number): { a: number; b: number } {
  const dx = x - l.o.x, dy = y - l.o.y;
  return { a: dx * l.u.x + dy * l.u.y, b: dx * l.n.x + dy * l.n.y };
}
/** the share of the smaller footprint two footprints share */
function share(p: number[], q: number[]): number {
  const ix = Math.min(p[2], q[2]) - Math.max(p[0], q[0]), iy = Math.min(p[3], q[3]) - Math.max(p[1], q[1]);
  if (ix <= 0 || iy <= 0) return 0;
  return ix * iy / Math.min((p[2] - p[0]) * (p[3] - p[1]), (q[2] - q[0]) * (q[3] - q[1]));
}
/** the lot's frame corners of a placed footprint (tiles) */
function fpCorners(l: Lot, f: number[]) { return [[f[0], f[1]], [f[2], f[1]], [f[2], f[3]], [f[0], f[3]]].map(([x, y]) => toLot(l, x, y)); }
/** the composition is inside the lot: props within 0.3 tiles (street items up to 1.2 into the verge), patches within 0.3, and the
 *  flat decals' centres inside the lot (their 'marks' patch only bounds them, 2 tiles out) */
function insideLot(l: Lot, c: Composition): string[] {
  const bad: string[] = [];
  for (const p of c.props) {
    const minB = STREET.has(p.id) ? -1.2 : -0.3;
    for (const q of fpCorners(l, fpOf(p))) if (q.a < -0.3 || q.a > l.w + 0.3 || q.b < minB || q.b > l.d + 0.3) { bad.push(`prop ${p.id}`); break; }
  }
  for (const g of c.ground) {
    if (g.tex === 'marks') { for (let k = 0, m = g.marks ?? []; k + 4 < m.length; k += 5) { const q = toLot(l, m[k + 1], m[k + 2]); if (q.a < 0 || q.a > l.w || q.b < 0 || q.b > l.d) { bad.push('mark'); break; } } continue; }
    for (let k = 0; k < g.pts.length; k += 2) { const q = toLot(l, g.pts[k], g.pts[k + 1]); if (q.a < -0.3 || q.a > l.w + 0.3 || q.b < -0.3 || q.b > l.d + 0.3) { bad.push(`patch ${g.tex}`); break; } }
  }
  return bad;
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
/** the 300 (lot, use, level, decline, seed) combos, deterministic */
const COMBOS: { lot: Lot; st: ComposeState }[] = (() => {
  const rnd = mulberry(20261018), out: { lot: Lot; st: ComposeState }[] = [];
  for (let i = 0; i < 300; i++) {
    const lot = LOTS[Math.floor(rnd() * LOTS.length)];
    out.push({ lot, st: { use: Math.floor(rnd() * 6), level: Math.floor(rnd() * 4), decline: Math.floor(rnd() * 4), seed: Math.floor(rnd() * 4294967296) >>> 0 } });
  }
  return out;
})();

test('the grid gives lots to compose', () => {
  assert.ok(LOTS.length >= 50, `only ${LOTS.length} lots`);
});

test('300 combos: every prop and patch lies inside its lot, and no two uprights overlap by more than 35%', () => {
  for (const { lot, st } of COMBOS) {
    const c = compose(lot, st), bad = insideLot(lot, c);
    assert.deepEqual(bad, [], `${lot.key} ${JSON.stringify(st)}: outside the lot`);
    const ups = c.props.filter(p => isUpright(p.id)).map(p => fpOf(p));
    for (let i = 0; i < ups.length; i++) for (let j = i + 1; j < ups.length; j++)
      assert.ok(share(ups[i], ups[j]) <= 0.35 + 1e-9, `${lot.key} ${JSON.stringify(st)}: uprights overlap ${Math.round(100 * share(ups[i], ups[j]))}%`);
  }
});

test('RES at BUILT: 14-56 uprights, exactly one main house, facing the road (front on +X/+Y lots, rear view on -X/-Y lots)', () => {
  let n = 0;
  for (const lot of LOTS) for (let seed = 1; seed <= 4; seed++) {
    const st: ComposeState = { use: LU.RES, level: LV.BUILT, decline: 0, seed: (lot.id * 97 + seed * 7919) >>> 0 };
    const c = compose(lot, st);
    const ups = c.props.filter(p => isUpright(p.id)).length;
    assert.ok(ups >= 14 && ups <= 56, `${lot.key} seed ${st.seed}: ${ups} uprights; ${c.props.map(p => p.id).join(' ')}`);
    const houses = c.props.filter(p => isHouse(p.id) || isRear(p.id));
    assert.equal(houses.length, 1, `${lot.key} w${lot.w} d${lot.d} seed ${st.seed}: ${houses.length} main houses; props ${c.props.map(p => p.id).join(' ')}`);
    const F = { x: -lot.n.x, y: -lot.n.y };
    const flip = Math.abs(F.x) > Math.abs(F.y), rear = flip ? F.x < 0 : F.y < 0;
    const h = houses[0];
    assert.equal(h.flip, flip, `${lot.key}: house flip`);
    assert.equal(isRear(h.id), rear, `${lot.key}: house front or rear view`);
    n++;
  }
  assert.ok(n > 100);
});

test('drives and walks reach the front edge and carry no uprights except cars', () => {
  let checked = 0;
  for (const lot of LOTS) for (let seed = 1; seed <= 3; seed++) {
    const st: ComposeState = { use: LU.RES, level: LV.BUILT, decline: 0, seed: (lot.id * 31 + seed * 104729) >>> 0 };
    const c = compose(lot, st);
    for (const g of c.ground) {
      if (g.tex !== 'paving') continue;
      const bs = []; for (let k = 0; k < g.pts.length; k += 2) bs.push(toLot(lot, g.pts[k], g.pts[k + 1]).b);
      assert.ok(Math.min(...bs) <= 0.05, `${lot.key}: a paving patch does not reach the front edge`);
      const [x0, y0, x1, y1] = [Math.min(...g.pts.filter((_, k) => k % 2 === 0)), Math.min(...g.pts.filter((_, k) => k % 2 === 1)), Math.max(...g.pts.filter((_, k) => k % 2 === 0)), Math.max(...g.pts.filter((_, k) => k % 2 === 1))];
      for (const p of c.props) {
        if (isCar(p.id)) continue;
        const f = fpOf(p);
        const ix = Math.min(f[2], x1) - Math.max(f[0], x0), iy = Math.min(f[3], y1) - Math.max(f[1], y0);
        assert.ok(!(ix > 0.05 && iy > 0.05), `${lot.key}: ${p.id} stands on a drive or walk`);
      }
      checked++;
    }
  }
  assert.ok(checked > 100, `only ${checked} drives and walks`);
});

test('determinism: the same input composes the same; another seed composes differently', () => {
  let same = 0;
  for (const { lot, st } of COMBOS) {
    const a = JSON.stringify(compose(lot, st)), b = JSON.stringify(compose(lot, st));
    assert.equal(a, b, `${lot.key} ${JSON.stringify(st)}: not deterministic`);
    if (a === JSON.stringify(compose(lot, { ...st, seed: (st.seed + 1) >>> 0 }))) same++;
  }
  assert.ok(same <= COMBOS.length * 0.05, `${same} of ${COMBOS.length} combos did not change with the seed`);
});

test('every use, level and decline composes without throwing and with at least one prop', () => {
  let n = 0;
  for (const lot of LOTS.slice(0, 40)) for (let use = 0; use <= 5; use++) for (let level = 0; level <= 3; level++) for (let decline = 0; decline <= 3; decline++) {
    const c = compose(lot, { use, level, decline, seed: (lot.id * 13 + use * 5 + level * 3 + decline) >>> 0 });
    assert.ok(c.props.length >= 1, `${lot.key} use ${use} level ${level} decline ${decline}: no props`);
    n++;
  }
  assert.equal(n, 40 * 6 * 4 * 4);
});

test('the average uprights per archetype (log)', () => {
  const names = ['NONE', 'RES', 'COM', 'IND', 'TOUR', 'GOV'], levels = ['EMPTY', 'BUILDING', 'BUILT', 'UPGRADED'];
  const sum = new Map<string, number>(), cnt = new Map<string, number>();
  for (const lot of LOTS) for (let use = 0; use <= 5; use++) for (let level = 0; level <= 3; level++) for (let seed = 1; seed <= 2; seed++) {
    const st: ComposeState = { use, level, decline: 0, seed: (lot.id * 17 + seed * 7 + use * 3 + level) >>> 0 };
    if (isCarPark(st)) continue;   // public car parks are sparse by design: the average is for the shops, houses and yards
    const c = compose(lot, st);
    const k = `${names[use]} ${levels[level]}`;
    sum.set(k, (sum.get(k) ?? 0) + c.props.filter(p => isUpright(p.id)).length);
    cnt.set(k, (cnt.get(k) ?? 0) + 1);
  }
  const lines = [...sum.keys()].map(k => `${k}: ${(sum.get(k)! / cnt.get(k)!).toFixed(1)}`);
  console.log(`uprights per lot (decline 0, ${LOTS.length} lots x 2 seeds)\n  ${lines.join('\n  ')}`);
  const avg = (k: string) => sum.get(k)! / cnt.get(k)!;
  assert.ok(avg('RES BUILT') >= 12);
  for (const u of ['COM', 'IND', 'TOUR', 'GOV']) assert.ok(avg(`${u} BUILT`) >= 14, `${u} BUILT averages ${avg(`${u} BUILT`).toFixed(1)} uprights, want 14+`);
});

/** the digest of a composition: FNV-1a over its props and ground (positions to 3 decimals) */
function digest(c: Composition): string {
  const s = c.props.map(p => `${p.id}|${p.x.toFixed(3)}|${p.y.toFixed(3)}|${p.flip ? 1 : 0}|${p.scale.toFixed(4)}`).join(';') + '#' +
    c.ground.map(g => `${g.tex}:${g.pts.map(v => v.toFixed(3)).join(',')}:${(g.lines ?? []).map(v => v.toFixed(3)).join(',')}:${(g.marks ?? []).join(',')}`).join(';');
  let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h.toString(16).padStart(8, '0');
}

test('compositions are pinned: digests of fixed seeds (re-pinned 2026-10-20 for the fenced, dressed lots)', () => {
  const CASES: [number, ComposeState, string][] = [
    [0, { use: LU.COM, level: LV.BUILT, decline: 0, seed: 123456 }, '38f6b250'],
    [7, { use: LU.COM, level: LV.UPGRADED, decline: 1, seed: 271828 }, '87a1d43e'],
    [15, { use: LU.COM, level: LV.BUILT, decline: 2, seed: 987654 }, '861b82d4'],
    [30, { use: LU.COM, level: LV.BUILT, decline: 3, seed: 42 }, '6dfd49de'],
    [4, { use: LU.COM, level: LV.BUILDING, decline: 0, seed: 5 }, '6700f011'],
    [20, { use: LU.RES, level: LV.BUILT, decline: 0, seed: 555555 }, 'a645ff9f'],
    [22, { use: LU.IND, level: LV.BUILT, decline: 0, seed: 777777 }, '33ea9a15'],
  ];
  for (const [, st] of CASES) assert.ok(!isCarPark(st), `${JSON.stringify(st)} is a car park`);
  assert.deepEqual(CASES.map(([i, st]) => digest(compose(LOTS[i], st))), CASES.map(c => c[2]));
});

test('about 15% of built commercial lots are public car parks: a car park has an asphalt bay patch and no building', () => {
  const rnd = mulberry(20261019);
  let parks = 0;
  for (let i = 0; i < 200; i++) {
    const lot = LOTS[i % LOTS.length];
    const st: ComposeState = { use: LU.COM, level: i % 2 ? LV.BUILT : LV.UPGRADED, decline: 0, seed: Math.floor(rnd() * 4294967296) >>> 0 };
    const c = compose(lot, st);
    const building = c.props.some(p => { const k = byId.get(p.id)?.kind; return k === 'building' || k === 'venue'; });
    if (!isCarPark(st)) { assert.ok(c.props.length > 0, `${lot.key} ${JSON.stringify(st)}: no props`); continue; }
    parks++;
    assert.ok(!building, `${lot.key} ${JSON.stringify(st)}: a car park with a building`);
    assert.ok(c.ground.some(g => g.tex === 'asphalt' && !!g.lines && g.lines.length >= 4), `${lot.key} ${JSON.stringify(st)}: no asphalt bay patch`);
    assert.ok(c.props.some(p => p.id === 'expansion:wheel-stop'), `${lot.key} ${JSON.stringify(st)}: no wheel stops`);
  }
  assert.ok(parks >= 15 && parks <= 45, `${parks} car parks of 200 commercial lots, want about 30`);
});

test('public car parks: cars fill most bays at upgraded, fewer at decline 1, none at decline 3', () => {
  const sum = [0, 0, 0];
  for (const lot of LOTS) {
    const seed = (lot.id * 100 + 7) >>> 0;   // seed % 100 = 7: a car park
    const cars = (st: ComposeState) => compose(lot, st).props.filter(p => byId.get(p.id)?.cat === 'Vehicles').length;
    sum[0] += cars({ use: LU.COM, level: LV.UPGRADED, decline: 0, seed });
    sum[1] += cars({ use: LU.COM, level: LV.BUILT, decline: 1, seed });
    assert.equal(cars({ use: LU.COM, level: LV.BUILT, decline: 3, seed }), 0, `${lot.key}: cars at decline 3`);
    sum[2] += cars({ use: LU.COM, level: LV.BUILT, decline: 0, seed });
  }
  assert.ok(sum[0] > sum[1] && sum[1] > 0, `upgraded ${sum[0]} cars, decline 1 ${sum[1]}`);
  assert.ok(sum[0] >= sum[2], `upgraded ${sum[0]} cars, built ${sum[2]}`);
});
