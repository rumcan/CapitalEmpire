// The Lot Composer: deterministic, lived-in lots (Phase 3 step 5c). Headless: npm test (no DOM, no canvas).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASS, RoadNetwork, type Leg } from '../src/game/network';
import { NetEditor } from '../src/game/netops';
import { LotMap, type Lot } from '../src/game/lots/lots';
import { compose, isCarPark, type ComposeState, type Composition, type Placed } from '../src/game/lots/compose';
import { LU, LV } from '../src/game/lots/town';
import { LIBRARY } from '../src/game/library';
import { LOT_DECALS } from '../src/game/lot-decals';
import { mulberry } from '../src/game/iso';
import { CAR_SCALE } from '../src/game/ext/car-art';

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
const isUpright = (id: string) => !isFence(id) && !isWheel(id);

/** the footprint of a placed prop in world tiles (the engine's footprint: the union of its boxes) */
function fpOf(p: Placed): [number, number, number, number] {
  const it = byId.get(p.id)!;
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
    const minB = STREET.has(p.id) || p.id.startsWith('variation:sign-') ? -1.2 : -0.3;
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
/** does the library have a baked picture for the lot's size (exactly w x d tiles, e.g. 8 x 15) */
const bakedSize = (l: Lot) => LIBRARY.some(it => it.id.startsWith(`lot:${l.w}x${l.d}-`));
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
    // A baked lot's box bounds the whole picture, including lawn; it is not an upright collision footprint.
    const ups = c.props.filter(p => isUpright(p.id) && !p.id.startsWith('lot:')).map(p => fpOf(p));
    for (let i = 0; i < ups.length; i++) for (let j = i + 1; j < ups.length; j++)
      assert.ok(share(ups[i], ups[j]) <= 0.35 + 1e-9, `${lot.key} ${JSON.stringify(st)}: uprights overlap ${Math.round(100 * share(ups[i], ups[j]))}%`);
  }
});

test('RES at BUILT: one baked lot of the lot size, facing the road (front variants on +X/+Y lots, rear on -X/-Y), mirrored with the lot, centred on it', () => {
  let n = 0;
  for (const lot of LOTS) for (let seed = 1; seed <= 4; seed++) {
    const st: ComposeState = { use: LU.RES, level: LV.BUILT, decline: 0, seed: (lot.id * 97 + seed * 7919) >>> 0 };
    const c = compose(lot, st), F = { x: -lot.n.x, y: -lot.n.y };
    const flip = Math.abs(F.x) > Math.abs(F.y), rear = flip ? F.x < 0 : F.y < 0;
    const lots = c.props.filter(p => p.id.startsWith('lot:'));
    // a lot of a size with no baked picture (a block lot's cell) is composed live: no picture, the same fence layer
    if (!bakedSize(lot)) { assert.equal(lots.length, 0, `${lot.key}: a baked picture of another size`); assert.ok(c.props.some(p => /fence-privacy/.test(p.id)), `${lot.key}: no privacy panels`); continue; }
    assert.equal(lots.length, 1, `${lot.key}: ${c.props.map(p => p.id).join(' ')}`);
    // the fence layer: panels on the lot's own side line, and plants, beside the baked picture (which has no fences)
    assert.ok(c.props.some(p => /fence-privacy/.test(p.id)), `${lot.key}: no privacy panels`);
    const p = lots[0], m = /^lot:(\d+)x(\d+)-(front|rear)-\d+$/.exec(p.id);
    assert.ok(m, `${lot.key}: ${p.id} is not a baked lot`);
    assert.deepEqual([+m![1], +m![2], m![3]], [lot.w, lot.d, rear ? 'rear' : 'front'], `${lot.key}: ${p.id}`);
    assert.equal(p.flip, flip, `${lot.key}: flip`);
    const cx = lot.o.x + (lot.u.x * lot.w + lot.n.x * lot.d) / 2, cy = lot.o.y + (lot.u.y * lot.w + lot.n.y * lot.d) / 2;
    assert.ok(Math.hypot(p.x - cx, p.y - cy) < 1e-6, `${lot.key}: not centred`);
    assert.ok(!/neglected/.test(byId.get(p.id)!.name), `${lot.key}: a neglected lot at decline 0`);
    n++;
  }
  assert.ok(n > 100);
  // neighbours along a street never share a variant; decline 2 takes the neglected ones
  const rows = new Map<string, { a: number; id: string }[]>();
  for (const lot of LOTS) { if (!bakedSize(lot)) continue; const st: ComposeState = { use: LU.RES, level: LV.BUILT, decline: 0, seed: lot.id }; const id = compose(lot, st).props.find(p => p.id.startsWith('lot:'))!.id, k = `${lot.n.x},${lot.n.y},${Math.round(lot.o.x * lot.n.x + lot.o.y * lot.n.y)}`; let r = rows.get(k); if (!r) rows.set(k, (r = [])); r.push({ a: lot.o.x * lot.u.x + lot.o.y * lot.u.y, id }); }
  for (const r of rows.values()) { r.sort((p, q) => p.a - q.a); for (let i = 1; i < r.length; i++) if (Math.abs(r[i].a - r[i - 1].a - LOTS[0].w) < 0.01) assert.notEqual(r[i].id, r[i - 1].id, 'two neighbours share a variant'); }
  const neg = compose(LOTS[0], { use: LU.RES, level: LV.BUILT, decline: 2, seed: 5 }).props.find(p => p.id.startsWith('lot:'))!;
  assert.match(byId.get(neg.id)!.name, /neglected/);
});

test('residential fence boundaries meet exactly in every orientation, with one owner per shared line', () => {
  const frames = [
    { u: { x: 1, y: 0 }, n: { x: 0, y: 1 } },
    { u: { x: -1, y: 0 }, n: { x: 0, y: -1 } },
    { u: { x: 0, y: 1 }, n: { x: -1, y: 0 } },
    { u: { x: 0, y: -1 }, n: { x: 1, y: 0 } },
  ];
  const state: ComposeState = { use: LU.RES, level: LV.BUILT, decline: 0, seed: 553 };
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-7;
  // a panel stands a few cm off its line (its footprint wholly on the line's higher world-coordinate side, see Build.boundaryRun)
  const onLine = (a: number, b: number) => Math.abs(a - b) < 0.1;
  /** every panel's footprint touches its line from the higher world-coordinate side, never straddling it (the painter then sorts the lot behind
   *  the line before the fence: a straddling panel let that lot's bushes and decals paint over the boards) */
  const offLine = (lot: Lot, panels: Placed[], axis: 'a' | 'b', v: number) => {
    const dir = axis === 'a' ? lot.n : lot.u, P = axis === 'a' ? { x: lot.o.x + lot.u.x * v, y: lot.o.y + lot.u.y * v } : { x: lot.o.x + lot.n.x * v, y: lot.o.y + lot.n.y * v };
    for (const p of panels) {
      const f = fpOf(p), [lo, L] = Math.abs(dir.x) < 0.5 ? [f[0], P.x] : [f[1], P.y];
      assert.ok(lo >= L - 1e-6 && lo - L < 0.05, `panel footprint ${JSON.stringify(f)} must start at its line ${L.toFixed(3)} on the higher side`);
    }
  };
  const fences = (lot: Lot, decline = 0) => compose(lot, { ...state, decline }).props.filter(p => isFence(p.id));
  const centre = (lot: Lot, p: Placed) => { const f = fpOf(p); return toLot(lot, (f[0] + f[2]) / 2, (f[1] + f[3]) / 2); };
  const covers = (lot: Lot, panels: Placed[], axis: 'a' | 'b', from: number, to: number) => {
    const spans = panels.map(p => { const q = fpCorners(lot, fpOf(p)).map(c => c[axis]); return [Math.min(...q), Math.max(...q)]; }).sort((a, b) => a[0] - b[0]);
    assert.ok(spans.length > 0, 'missing fence run');
    assert.equal(spans.length, Math.ceil((to - from) / 2 - 1e-9), 'each shared run must have exactly one owner');
    assert.ok(near(spans[0][0], from) && near(spans[spans.length - 1][1], to), `run must fill ${from}..${to}: ${JSON.stringify(spans)}`);
    for (let i = 0; i < spans.length; i++) {
      assert.ok(near(spans[i][1] - spans[i][0], 2), 'every panel must remain 4 m long');
      assert.ok(near(panels[i].scale, panels[0].scale), 'panel heights must remain constant');
      if (i) assert.ok(spans[i][0] <= spans[i - 1][1] + 1e-7 && spans[i][0] > spans[i - 1][0], 'gap or duplicate panel in run');
    }
  };
  for (const frame of frames) {
    const lot: Lot = { ...LOTS[0], ...frame, o: { x: 100, y: 100 }, w: 8, d: 15 };
    const ownSide = lot.u.x + lot.u.y > 0 ? 0 : lot.w;
    for (const decline of [0, 1, 2, 3]) {
      const panels = fences(lot, decline), side = panels.filter(p => onLine(centre(lot, p).a, ownSide)), back = panels.filter(p => onLine(centre(lot, p).b, lot.d));
      offLine(lot, side, 'a', ownSide); offLine(lot, back, 'b', lot.d);
      assert.ok(panels.every(p => p.id === 'expansion:fence-privacy-x' || p.id === 'expansion:fence-privacy-y'), 'all residential boundaries stay wooden');
      assert.equal(panels.length, side.length + back.length, 'fence on an unowned line');
      covers(lot, side, 'b', 3.65, lot.d);
      if (lot.n.x + lot.n.y > 0) covers(lot, back, 'a', 0, lot.w); else assert.equal(back.length, 0);
    }
    // An unbaked lot has drive/walk patches; those must not clip the shared boundary panels away.
    const fallback: Lot = { ...lot, w: 9 }, fallbackSide = lot.u.x + lot.u.y > 0 ? 0 : fallback.w;
    const fallbackPanels = fences(fallback);
    covers(fallback, fallbackPanels.filter(p => onLine(centre(fallback, p).a, fallbackSide)), 'b', 3.65, fallback.d);
    if (fallback.n.x + fallback.n.y > 0) covers(fallback, fallbackPanels.filter(p => onLine(centre(fallback, p).b, fallback.d)), 'a', 0, fallback.w);
    const neighbour: Lot = { ...lot, o: { x: lot.o.x + lot.u.x * lot.w, y: lot.o.y + lot.u.y * lot.w } };
    const sharedSide = [...fences(lot), ...fences(neighbour)].filter(p => onLine(centre(lot, p).a, lot.w));
    covers(lot, sharedSide, 'b', 3.65, lot.d);
    const behind: Lot = { ...lot, n: { x: -lot.n.x, y: -lot.n.y }, o: { x: lot.o.x + lot.n.x * lot.d * 2, y: lot.o.y + lot.n.y * lot.d * 2 } };
    const sharedBack = [...fences(lot), ...fences(behind)].filter(p => onLine(centre(lot, p).b, lot.d));
    covers(lot, sharedBack, 'a', 0, lot.w);
    const c = compose(lot, state), marks = c.ground.filter(g => g.tex === 'marks').flatMap(g => g.marks ?? []);
    const trees = c.props.filter(p => byId.get(p.id)?.kind === 'tree').map(p => p.id);
    const nextTrees = compose(neighbour, state).props.filter(p => byId.get(p.id)?.kind === 'tree').map(p => p.id);
    assert.equal(new Set(trees).size, trees.length, 'a fence tree repeats within one lot');
    assert.ok(nextTrees.every(id => !trees.includes(id)), 'adjacent lots must receive different young trees');
    assert.ok(marks.length > 0, 'fence layer needs its own ground marks');
    for (const group of ['leaves', 'tufts']) for (const side of [0.5, lot.w - 0.5]) {
      let found = false;
      for (let i = 0; i < marks.length; i += 5) if (LOT_DECALS[marks[i]].group === group && Math.abs(toLot(lot, marks[i + 1], marks[i + 2]).a - side) < 0.01) found = true;
      assert.ok(found, `${group} missing on side ${side}`);
    }
  }
});

test('commercial, civic, vacant and construction lots draw no fence ring, only their wooden boundary panels; industrial yards retain chain-link', () => {
  for (const use of [LU.COM, LU.TOUR, LU.GOV, LU.NONE, LU.RES]) for (const level of [LV.EMPTY, LV.BUILDING, LV.BUILT]) {
    if (use === LU.RES && level === LV.BUILT) continue;
    const c = compose(LOTS[0], { use, level, decline: 0, seed: 123456 });
    assert.ok(c.props.filter(p => isFence(p.id)).every(p => /fence-privacy/.test(p.id)), `unexpected fence at use ${use}, level ${level}`);
  }
  assert.ok(compose(LOTS[0], { use: LU.IND, level: LV.BUILT, decline: 0, seed: 123456 }).props.some(p => /chainlink/.test(p.id)));
});

test('determinism: the same input composes the same; another seed composes differently', () => {
  let same = 0;
  for (const { lot, st } of COMBOS) {
    const a = JSON.stringify(compose(lot, st)), b = JSON.stringify(compose(lot, st));
    assert.equal(a, b, `${lot.key} ${JSON.stringify(st)}: not deterministic`);
    // a baked house lot is chosen by its place on the street, not its seed
    if (st.use !== LU.RES && a === JSON.stringify(compose(lot, { ...st, seed: (st.seed + 1) >>> 0 }))) same++;
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
  assert.ok(avg('RES BUILT') >= 6, 'a house lot is one baked picture plus its fence layer (panels and planting)');
  // TOUR 12.2 (was 13): on lots facing +/-X the venues are lettering, so they are flipped nowhere and those lots fall back to car parks
  // (lettering.ts). The east-facing venue art (EAST_FACING, GOLF-SPRITES / PROGRESS) restores the old density: re-pin TOUR 13 and COM 11.5 then.
  for (const [u, min] of [['IND', 14], ['TOUR', 12.2], ['GOV', 14]] as const) assert.ok(avg(`${u} BUILT`) >= min, `${u} BUILT averages ${avg(`${u} BUILT`).toFixed(1)} uprights, want ${min}+`);
  // a shop's car park now runs from its back wall to the back line (the bush row there goes): 12+ instead of 14+
  // 11.5: the car park takes the back bush row (2026-10-21), and the straight-on shop variations left the pool (frontal.ts).
  // 10.7 (was 11.5): the flipped shops on lots facing +/-X are car parks until the east-facing shop art arrives (see TOUR above)
  assert.ok(avg('COM BUILT') >= 10.7, `COM BUILT averages ${avg('COM BUILT').toFixed(1)} uprights, want 10.7+`);
});

test('RES houses keep a side yard of 1.3 tiles or more from the side line away from the drive (unbaked widths 10.5 and 12.5, 30 seeds each)', () => {
  const HOUSE = new Set([...LIBRARY.filter(i => i.cat === 'Houses' && i.kind === 'house').map(i => i.id), 'expansion:ranch-rear', 'expansion:cottage-rear',
    'expansion:dormer-rear', 'expansion:duplex-rear', 'expansion:victorian-rear', 'expansion:rundown-house']);
  let houses = 0;
  for (const w of [10.5, 12.5]) for (let seed = 1; seed <= 30; seed++) {
    const lot: Lot = { ...LOTS[0], w, d: 15, o: { x: 100, y: 100 }, u: { x: 1, y: 0 }, n: { x: 0, y: 1 } };
    const c = compose(lot, { use: LU.RES, level: LV.BUILT, decline: 0, seed });
    // the drive is the paving patch one drive wide (the front walk is 0.6 wide)
    const paving: number[][] = [];
    for (const g of c.ground) if (g.tex === 'paving') { const a: number[] = []; for (let k = 0; k < g.pts.length; k += 2) a.push(toLot(lot, g.pts[k], g.pts[k + 1]).a); paving.push([Math.min(...a), Math.max(...a)]); }
    const drive = paving.find(([a0, a1]) => Math.abs(a1 - a0 - 1.6) < 0.01);
    assert.ok(drive, `w ${w} seed ${seed}: no drive`);
    const driveAtZero = drive[0] < 0.01;
    for (const p of c.props.filter(p => HOUSE.has(p.id))) {
      houses++;
      const a = fpCorners(lot, fpOf(p)).map(q => q.a);
      const gap = driveAtZero ? w - Math.max(...a) : Math.min(...a);
      assert.ok(gap >= 1.3 - 1e-9, `w ${w} seed ${seed}: ${p.id} stands ${gap.toFixed(2)} tiles from the side line away from the drive`);
    }
  }
  assert.ok(houses >= 50, `${houses} houses`);
});

test('a lot whose frontage runs more than 20 degrees off both map axes composes a green, not a building; at 10 degrees it keeps its building', () => {
  const BUILDING = new Set(['building', 'venue', 'arcade', 'house']);
  const turned = (deg: number): Lot => { const t = (deg * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t); return { ...LOTS[0], w: 12, d: 15, o: { x: 100, y: 100 }, u: { x: c, y: s }, n: { x: -s, y: c } }; };
  const buildings = (lot: Lot, st: ComposeState) => compose(lot, st).props.filter(p => BUILDING.has(byId.get(p.id)?.kind ?? '')).map(p => p.id);
  for (let seed = 20; seed < 40; seed++) {
    for (const use of [LU.COM, LU.TOUR, LU.RES, LU.GOV, LU.IND]) {
      assert.deepEqual(buildings(turned(45), { use, level: LV.BUILT, decline: 0, seed }), [], `use ${use} seed ${seed}: a building on a 45-degree lot`);
    }
    assert.ok(buildings(turned(10), { use: LU.COM, level: LV.BUILT, decline: 0, seed }).length >= 1, `seed ${seed}: no shop at 10 degrees`);
  }
});

test('every use but industry draws its own boundary fence: a shared line gets one fence whatever the two uses are', () => {
  const lot: Lot = { ...LOTS[0], u: { x: 1, y: 0 }, n: { x: 0, y: 1 }, o: { x: 100, y: 100 }, w: 8, d: 15 };
  const states: ComposeState[] = [
    { use: LU.COM, level: LV.BUILT, decline: 0, seed: 40 }, { use: LU.COM, level: LV.UPGRADED, decline: 2, seed: 41 },
    { use: LU.TOUR, level: LV.BUILT, decline: 0, seed: 42 }, { use: LU.GOV, level: LV.BUILT, decline: 1, seed: 43 },
    { use: LU.NONE, level: LV.EMPTY, decline: 0, seed: 44 }, { use: LU.RES, level: LV.BUILDING, decline: 0, seed: 45 },
  ];
  for (const st of states) {
    // the own side line (u runs +X: the lot's side at a = 0): its panels, sorted along the line
    const spans = compose(lot, st).props.filter(p => /fence-privacy/.test(p.id)).map(p => fpCorners(lot, fpOf(p)))
      .filter(q => q.every(v => v.a < 0.3)).map(q => [Math.min(...q.map(v => v.b)), Math.max(...q.map(v => v.b))]).sort((x, y) => x[0] - y[0]);
    const k = JSON.stringify(st);
    assert.equal(spans.length, Math.ceil((lot.d - 3.65) / 2 - 1e-9), `${k}: ${spans.length} panels on the own side`);
    assert.ok(Math.abs(spans[0]![0] - 3.65) < 1e-6 && Math.abs(spans[spans.length - 1]![1] - lot.d) < 1e-6, `${k}: the own side runs ${spans[0]![0]}..${spans[spans.length - 1]![1]}`);
  }
});

test('cars never overlap one another (a car is kept only if it shares no ground with an earlier car)', () => {
  for (const { lot, st } of COMBOS) {
    const cars = compose(lot, st).props.filter(p => byId.get(p.id)?.cat === 'Vehicles').map(fpOf);
    for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) {
      const ix = Math.min(cars[i]![2], cars[j]![2]) - Math.max(cars[i]![0], cars[j]![0]), iy = Math.min(cars[i]![3], cars[j]![3]) - Math.max(cars[i]![1], cars[j]![1]);
      assert.ok(!(ix > 0.02 && iy > 0.02), `${lot.key} ${JSON.stringify(st)}: cars overlap`);
    }
  }
});

/** the digest of a composition: FNV-1a over its props and ground (positions to 3 decimals) */
function digest(c: Composition): string {
  const s = c.props.map(p => `${p.id}|${p.x.toFixed(3)}|${p.y.toFixed(3)}|${p.flip ? 1 : 0}|${p.scale.toFixed(4)}`).join(';') + '#' +
    c.ground.map(g => `${g.tex}:${g.pts.map(v => v.toFixed(3)).join(',')}:${(g.lines ?? []).map(v => v.toFixed(3)).join(',')}:${(g.marks ?? []).join(',')}`).join(';');
  let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h.toString(16).padStart(8, '0');
}

test('compositions are pinned: digests of fixed seeds (re-pinned 2026-10-21 for the studio curation, the straight-on variations left out (frontal.ts), the car park layout (bays 2.75 deep, the eight-way cars), the boundary fences of every use, the old pickup footprints at CAR_SCALE; 2026-10-20 for separate residential boundaries; panels off their line; the studio removals; the leaf drifts at DRIFT_K; the fenced block lots; shops at the street front)', () => {
  const CASES: [number, ComposeState, string][] = [
    [0, { use: LU.COM, level: LV.BUILT, decline: 0, seed: 123456 }, '8f7b1874'],
    [7, { use: LU.COM, level: LV.UPGRADED, decline: 1, seed: 271828 }, '24db9c24'],
    [15, { use: LU.COM, level: LV.BUILT, decline: 2, seed: 987654 }, 'd2837fbf'],
    [30, { use: LU.COM, level: LV.BUILT, decline: 3, seed: 42 }, 'e3044647'],
    [4, { use: LU.COM, level: LV.BUILDING, decline: 0, seed: 5 }, 'aae6d5c8'],
    [20, { use: LU.RES, level: LV.BUILT, decline: 0, seed: 555555 }, 'bc30f6ea'],
    [22, { use: LU.IND, level: LV.BUILT, decline: 0, seed: 777777 }, '014361e4'],
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
