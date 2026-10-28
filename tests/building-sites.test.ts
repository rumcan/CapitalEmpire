// T232 (#673): building sites you can see. A town lot under construction is bare dirt inside a white dashed survey line round its plot, with the
// site kit (a house's timber frame, lumber stacks, heaps, the digger), laid the same way every time; a built lot shows none of it; the player's
// land is pegged out by the same line (lots/survey.ts). Headless: npm test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASS, RoadNetwork, type Leg } from '../src/game/network';
import { NetEditor } from '../src/game/netops';
import { LotMap, type Lot } from '../src/game/lots/lots';
import { compose, setLotPresets, type ComposeState, type Composition } from '../src/game/lots/compose';
import { DIGGER, SITE_HEAPS, SITE_LUMBER, SITE_PIECES, TIMBER_FRAME, frameView } from '../src/game/lots/compose';
import { LU, LV } from '../src/game/lots/town';
import { LIBRARY } from '../src/game/library';
import { parsePresets } from '../src/game/lots/presets';
import { SURVEY_INSET, rectPlot, surveyBlocks, surveyLines, surveyPatch } from '../src/game/lots/survey';
import PRESET_FIXTURE from './fixtures/lot-presets.json';

{ const f = parsePresets(PRESET_FIXTURE); setLotPresets(f.presets, f.meta); }
(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

const leg = (ax: number, ay: number, bx: number, by: number): Leg => ({ a: { x: ax, y: ay }, b: { x: bx, y: by } });
/** the lots of a 4x4 street grid, a boulevard across it and one street at 30 degrees (its lots are angled) */
function lotsOfGrid(): Lot[] {
  const e = new NetEditor(new RoadNetwork());
  for (let k = 0; k < 4; k++) { e.addLegs([leg(40, 40 + k * 40, 160, 40 + k * 40)], CLASS.street, 0); e.addLegs([leg(40 + k * 40, 40, 40 + k * 40, 160)], CLASS.street, 0); }
  e.commit(); e.addLegs([leg(100, 40, 100, 160)], CLASS.boulevard, 0); e.commit();
  e.addLegs([leg(220, 60, 220 + 80 * Math.cos(Math.PI / 6), 60 + 80 * Math.sin(Math.PI / 6))], CLASS.street, 0); e.commit();
  const lm = new LotMap(); lm.update(e.net, null);
  return [...lm.lots.values()].sort((p, q) => (p.key < q.key ? -1 : p.key > q.key ? 1 : 0));
}
const LOTS = lotsOfGrid();
const byId = new Map(LIBRARY.map(i => [i.id, i]));
const USES = [LU.RES, LU.COM, LU.TOUR, LU.IND, LU.GOV];
const angled = (l: Lot) => Math.max(Math.abs(l.u.x), Math.abs(l.u.y)) < Math.cos(Math.PI / 9);
const site = (l: Lot, use: number, seed: number): Composition => compose(l, { use, level: LV.BUILDING, decline: 0, seed });
const toLot = (l: Lot, x: number, y: number) => { const dx = x - l.o.x, dy = y - l.o.y; return { a: dx * l.u.x + dy * l.u.y, b: dx * l.n.x + dy * l.n.y }; };
const digest = (c: Composition) => JSON.stringify([c.props.map(p => [p.id, p.x.toFixed(3), p.y.toFixed(3), p.flip, p.scale.toFixed(4)]), c.ground.map(g => [g.tex, g.pts, g.lines ?? [], g.marks ?? []])]);

test('the grid gives axis and angled lots to build on', () => {
  assert.ok(LOTS.length >= 50, `only ${LOTS.length} lots`);
  assert.ok(LOTS.some(angled), 'no angled lot');
});

test('the kit is in the library at its size: lumber, heaps and the timber frame (two views), none a building, the frame and digger big', () => {
  for (const id of [...SITE_LUMBER, ...SITE_HEAPS, ...TIMBER_FRAME, DIGGER]) { const it = byId.get(id); assert.ok(it, `${id} missing`); assert.equal(it!.cat, 'Construction'); assert.equal(it!.kind, 'decor'); }
  assert.equal(SITE_LUMBER.length, 3); assert.equal(SITE_HEAPS.length, 3);
  const box = (id: string) => byId.get(id)!.boxes[0]!;
  // the frame: 12 x 9 m in the art list, its picture square, so 10.4 m a side; a heap about 3 m across (its box 2.4 m)
  for (const id of TIMBER_FRAME) { assert.equal(box(id).hx, 5.2); assert.equal(box(id).hy, 5.2); assert.ok(byId.get(id)!.big); }
  for (const id of SITE_HEAPS) { assert.equal(box(id).hx, 1.2); assert.ok(Math.abs(byId.get(id)!.w - 32 * Math.SQRT2 * 3) < 0.01, `${id} is not 3 m across`); }
  // a picture's width is its footprint's diamond: 32 px a metre of its length plus its depth (heaps: round)
  for (const id of [...SITE_LUMBER, ...TIMBER_FRAME]) { const b = box(id), it = byId.get(id)!; assert.ok(Math.abs(it.w - 64 * (b.hx + b.hy)) < 0.01, `${id}: ${it.w} px for ${2 * b.hx} x ${2 * b.hy} m`); }
});

test('the survey line follows the plot: four sides SURVEY_INSET inside its lines, along its frame, on axis and angled lots and the player\'s land', () => {
  const check = (o: { x: number; y: number }, u: { x: number; y: number }, n: { x: number; y: number }, w: number, d: number, lines: number[], inset: number) => {
    assert.equal(lines.length, 16, 'four sides');
    const P = (a: number, b: number) => [o.x + u.x * a + n.x * b, o.y + u.y * a + n.y * b];
    const want = [P(inset, inset), P(w - inset, inset), P(w - inset, d - inset), P(inset, d - inset)];
    for (let k = 0; k < 4; k++) {
      const s = want[k]!, e = want[(k + 1) % 4]!;
      for (const [got, exp] of [[lines[4 * k]!, s[0]!], [lines[4 * k + 1]!, s[1]!], [lines[4 * k + 2]!, e[0]!], [lines[4 * k + 3]!, e[1]!]]) assert.ok(Math.abs(got - exp) < 2e-3, `side ${k}: ${got} for ${exp}`);
    }
  };
  let n = 0;
  for (const l of LOTS) for (const use of [LU.RES, LU.IND]) {
    const c = site(l, use, 7), s = c.ground.filter(g => g.survey);
    assert.equal(s.length, 1, `${l.key}: one survey line`);
    assert.equal(s[0]!.tex, 'marks', 'nothing filled');
    check(l.o, l.u, l.n, l.w, l.d, s[0]!.lines!, SURVEY_INSET);
    // its patch bounds its lines
    const xs = s[0]!.pts.filter((_, i) => i % 2 === 0), ys = s[0]!.pts.filter((_, i) => i % 2 === 1);
    for (let i = 0; i < 16; i += 2) assert.ok(s[0]!.lines![i]! >= Math.min(...xs) && s[0]!.lines![i]! <= Math.max(...xs) && s[0]!.lines![i + 1]! >= Math.min(...ys) && s[0]!.lines![i + 1]! <= Math.max(...ys));
    n++;
  }
  assert.ok(n > 0);
  // a block of the player's land (T200: a map-axis rect), and a plot too small to peg out
  const r: [number, number, number, number] = [200, 120, 40, 40];
  check({ x: 200, y: 120 }, { x: 1, y: 0 }, { x: 0, y: 1 }, 40, 40, surveyPatch(rectPlot(r), 0.6)!.lines!, 0.6);
  assert.deepEqual(surveyLines(rectPlot([0, 0, 1, 1])), []); assert.equal(surveyPatch(rectPlot([0, 0, 1, 1])), null);
});

test('the player\'s adjacent empty blocks are pegged out as one plot: one line round them all, none along the sides they share', () => {
  const a: [number, number, number, number] = [100, 100, 40, 40], b: [number, number, number, number] = [100, 140, 40, 40], c: [number, number, number, number] = [140, 100, 40, 40], lone: [number, number, number, number] = [300, 300, 40, 40];
  const ps = surveyBlocks([a, b, c, lone], 0.6);
  // a lone block: its four sides, as surveyPatch draws them
  assert.deepEqual(ps[3]!.lines, surveyPatch(rectPlot(lone), 0.6)!.lines);
  // the L of three: every segment on the union's outline (0.6 in), none inside it
  const segs: number[][] = []; for (const p of ps.slice(0, 3)) for (let k = 0; k + 3 < p!.lines!.length; k += 4) segs.push(p!.lines!.slice(k, k + 4));
  const onOutline = (x: number, y: number) => [100.6, 179.4].some(v => Math.abs(x - v) < 1e-6) || [100.6, 179.4].some(v => Math.abs(y - v) < 1e-6) || (Math.abs(x - 139.4) < 1e-6 && y >= 139.4) || (Math.abs(y - 139.4) < 1e-6 && x >= 139.4);
  for (const s of segs) assert.ok(onOutline(s[0]!, s[1]!) && onOutline(s[2]!, s[3]!), `a segment inside the plot: ${s.join(',')}`);
  // the outline's length: the L's perimeter (80 + 80 + 40 + 40 + 40 + 40 = 320 tiles) less the insets (the inner corner's two sides stop an
  // inset short of it: a gap no longer than a dash's)
  const len = segs.reduce((t, s) => t + Math.hypot(s[2]! - s[0]!, s[3]! - s[1]!), 0);
  assert.ok(len <= 320 - 8 * 0.6 + 1e-6 && len >= 320 - 8 * 0.6 - 2 * 0.6 - 1e-6, `outline ${len}`);
});

test('a site is bare dirt to the line: one Dirt patch over the lot, inside its lines, under the line', () => {
  for (const l of LOTS) {
    const c = site(l, LU.RES, 11), dirt = c.ground.filter(g => g.tex === 'dirt'), at = c.ground.findIndex(g => g.survey);
    assert.equal(dirt.length, 1, `${l.key}: one dirt patch`);
    assert.ok(c.ground.indexOf(dirt[0]!) < at, 'the dirt before the line');
    for (let k = 0; k < 8; k += 2) { const q = toLot(l, dirt[0]!.pts[k]!, dirt[0]!.pts[k + 1]!); assert.ok(q.a >= -1e-6 && q.a <= l.w + 1e-6 && q.b >= -1e-6 && q.b <= l.d + 1e-6, `${l.key}: dirt past the lot`); assert.ok(Math.min(q.a, l.w - q.a, q.b, l.d - q.b) < SURVEY_INSET, 'the dirt reaches the line'); }
  }
});

test('the kit only while building: every site has some of it, no built, upgraded, declined or empty lot shows any of it or a survey line', () => {
  for (const l of LOTS) for (const use of USES) {
    const c = site(l, use, 3), kit = c.props.filter(p => SITE_PIECES.has(p.id));
    assert.ok(kit.length >= 2, `${l.key} use ${use}: ${kit.length} kit pieces`);
    assert.ok(kit.some(p => SITE_HEAPS.includes(p.id) || SITE_LUMBER.includes(p.id)), `${l.key} use ${use}: no heap or lumber`);
    for (const [level, decline] of [[LV.EMPTY, 0], [LV.BUILT, 0], [LV.BUILT, 2], [LV.UPGRADED, 0], [LV.UPGRADED, 3]] as const) {
      const b = compose(l, { use, level, decline, seed: 3 });
      assert.deepEqual(b.props.filter(p => SITE_PIECES.has(p.id)).map(p => p.id), [], `${l.key} use ${use} level ${level}: kit on a lot that is not building`);
      assert.ok(!b.ground.some(g => g.survey), `${l.key} use ${use} level ${level}: a survey line`);
    }
  }
});

test('a house going up: its timber frame (view 1 where the street lies toward the camera, view 2 where away) on every map-axis lot that holds it', () => {
  let framed = 0, v1 = 0, v2 = 0;
  for (const l of LOTS) {
    const c = site(l, LU.RES, 5), fr = c.props.filter(p => (TIMBER_FRAME as readonly string[]).includes(p.id));
    if (angled(l)) { assert.equal(fr.length, 0, `${l.key}: a frame on an angled lot`); continue; }
    if (l.w < 6.2 || l.d < 7.3) continue; // too small for a 5.2-tile frame and its yard
    assert.equal(fr.length, 1, `${l.key} (${l.w} x ${l.d}): no frame`);
    const F = { x: -l.n.x, y: -l.n.y }, want = F.x > 0.5 || F.y > 0.5 ? TIMBER_FRAME[0] : TIMBER_FRAME[1];
    assert.equal(fr[0]!.id, want, `${l.key}: the frame's view for a street toward ${F.x},${F.y}`);
    assert.equal(frameView({ F }), want);
    // where the house will stand: set back from the front, inside the lot
    const q = toLot(l, fr[0]!.x, fr[0]!.y);
    assert.ok(q.b > 1 && q.b < l.d - 2, `${l.key}: the frame ${q.b.toFixed(2)} tiles in`);
    // and round it the kit: on a house lot of the town's sizes (10 x 12 tiles or more) the digger, two heaps, two lumber stacks or more; on a
    // smaller one what fits, two pieces at least
    const n = (ids: readonly string[]) => c.props.filter(p => ids.includes(p.id)).length;
    if (l.w >= 10 && l.d >= 12) { assert.equal(n([DIGGER]), 1, `${l.key}: no digger`); assert.equal(n(SITE_HEAPS), 2, `${l.key}: heaps`); assert.ok(n(SITE_LUMBER) >= 2, `${l.key}: lumber`); }
    else assert.ok(n([DIGGER, ...SITE_HEAPS, ...SITE_LUMBER]) >= 2, `${l.key} (${l.w} x ${l.d}): a bare frame`);
    // none of it lost behind the frame's walls: no piece's ground point above the frame's on screen and within its width
    const f = fr[0]!, fb = byId.get(f.id)!.boxes[0]!, half = (fb.hx + fb.hy) * f.scale / 2;
    for (const p of c.props) if (SITE_PIECES.has(p.id) && p !== f) { const dx = p.x - f.x, dy = p.y - f.y; assert.ok(!(dx + dy < -0.3 && Math.abs(dx - dy) < half), `${l.key}: ${p.id} behind the frame`); }
    framed++; if (fr[0]!.id === TIMBER_FRAME[0]) v1++; else v2++;
  }
  assert.ok(framed >= 20 && v1 > 0 && v2 > 0, `${framed} framed (${v1} view 1, ${v2} view 2)`);
  // the other uses' sites have no frame
  for (const l of LOTS) for (const use of [LU.COM, LU.IND, LU.GOV]) assert.ok(!site(l, use, 5).props.some(p => (TIMBER_FRAME as readonly string[]).includes(p.id)), `${l.key} use ${use}: a frame`);
});

test('nothing on a site is mirrored: the kit, the digger and the supplies are drawn as painted', () => {
  for (const l of LOTS) for (const use of USES) for (const p of site(l, use, 9).props) if (byId.get(p.id)?.cat === 'Construction') assert.equal(p.flip, false, `${l.key}: ${p.id} mirrored`);
});

test('deterministic: a lot and seed lay the same site whatever was laid before, another seed another, and neighbours differ', () => {
  const cases: [Lot, ComposeState][] = LOTS.slice(0, 24).map((l, i) => [l, { use: USES[i % USES.length]!, level: LV.BUILDING, decline: 0, seed: 1000 + i }]);
  const first = cases.map(([l, st]) => digest(compose(l, st)));
  for (const l of LOTS.slice(24, 60)) compose(l, { use: LU.RES, level: LV.BUILDING, decline: 0, seed: 77 });
  assert.deepEqual([...cases].reverse().map(([l, st]) => digest(compose(l, st))).reverse(), first, 'the same lot and seed lay the same site');
  const moved = cases.filter(([l, st], k) => digest(compose(l, { ...st, seed: st.seed + 1 })) !== first[k]).length;
  assert.ok(moved >= cases.length - 2, `${moved} of ${cases.length} sites moved with the seed`);
  assert.equal(new Set(first).size, cases.length, 'every site its own');
});
