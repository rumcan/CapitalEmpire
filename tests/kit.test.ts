// The concept's kit in the game (T231, #671): the atlas stays within budget (the kit shares the golf page: no page added); the kit joins no pool
// that picks by kind (no lot, hole or farm drawn before it moves); the catalogue, the menus and the plant brushes carry it; the fountain jet
// stands only in water; a hedge is a run; R steps a variant item's pictures; and the yards' kit leaves every lot's other props where they were.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ATLAS_PAGES, LIBRARY } from '../src/game/library';
import { MB, atlasBudget, planAtlas } from '../src/game/atlas-pages';
import { KIT_BOULDERS, KIT_FLOWERS, KIT_FOUNTAIN, KIT_HEDGE, KIT_LAMPS, KIT_LILIES, KIT_PALM_IDS, KIT_POND_EDGE, KIT_SHRUBS, fountainAt, fountainFrame, isKit } from '../src/game/kit';
import { APPEAL, DECOR, DECOR_BY_KEY, decorAppeal, decorSpotWhy, type Box, type DecorSpot } from '../src/game/golf/decor';
import { PropsTool, type PropsHostCtx } from '../src/game/golf/propstool';
import { PLANT_KINDS, plantPool } from '../src/game/plant';
import { kindPools } from '../src/game/lots/item-kinds';
import { BUSHES, TREES } from '../src/game/lots/compose-core';
import { drawnAs } from '../src/game/mirror';
import { kindOf } from '../src/game/shadow-shape';
import { RAIL } from '../src/ui/rail-items';
import { menuOf, leavesOf } from '../src/ui/flyout-menu';
import { KIT_YARDS, compose, setGeneratedLots, setLotPresets, type ComposeState } from '../src/game/lots/compose';
import { parsePresets } from '../src/game/lots/presets';
import { CLASS, RoadNetwork, type Leg } from '../src/game/network';
import { NetEditor } from '../src/game/netops';
import { LotMap } from '../src/game/lots/lots';
import { LU, LV } from '../src/game/lots/town';
import { mulberry } from '../src/game/iso';
import PRESET_FIXTURE from './fixtures/lot-presets.json';
import type { Prop } from '../src/game/types';

const BY = new Map(LIBRARY.map((it, i) => [it.id, { it, i }]));
const KIT_IDS = [...KIT_SHRUBS, ...KIT_FLOWERS, ...KIT_BOULDERS.small, ...KIT_BOULDERS.medium, ...KIT_BOULDERS.large, ...KIT_PALM_IDS, ...KIT_LAMPS, KIT_HEDGE.x, KIT_HEDGE.y, KIT_HEDGE.end!,
  KIT_POND_EDGE.x, KIT_POND_EDGE.y, KIT_POND_EDGE.inner, KIT_POND_EDGE.outer, ...KIT_FOUNTAIN, ...KIT_LILIES];

test('the atlas: the kit is in the library on the golf page, packed apart from the golf art, and no page is added (the plan stays within budget)', () => {
  // the golf page (golf-library.ts appendGolf's; its first golf pictures are drawn from their four views now, views-library.ts): the kit's page
  const golf = BY.get(KIT_IDS[0]!)!.it.tex[0];
  for (const id of KIT_IDS) {
    const e = BY.get(id); assert.ok(e, `${id} is in the library`);
    const t = e!.it.tex; assert.equal(t[0], golf, `${id} is on the golf page`);
    assert.ok(t[1] >= 0 && t[2] >= 0 && t[3] <= 1 && t[4] <= 1 && t[3] > t[1] && t[4] > t[2], `${id} UVs`);
  }
  // nothing on the golf page overlaps another picture (the kit was packed round the golf art)
  const on = LIBRARY.filter(it => it.tex[0] === golf);
  for (let a = 0; a < on.length; a++) for (let b = a + 1; b < on.length; b++) {
    const p = on[a]!.tex, q = on[b]!.tex, ix = Math.min(p[3], q[3]) - Math.max(p[1], q[1]), iy = Math.min(p[4], q[4]) - Math.max(p[2], q[2]);
    assert.ok(ix <= 1e-6 || iy <= 1e-6, `${on[a]!.id} and ${on[b]!.id} overlap on the page`);
  }
  // the kit is appended last: every kit item after every other item (no saved index moves)
  const firstKit = LIBRARY.findIndex(it => isKit(it.id)), lastOther = LIBRARY.reduce((m, it, i) => (isKit(it.id) ? m : i), -1);
  assert.ok(firstKit > lastOther, 'the kit comes after every other library item');
  // the page count is that of main before T231 (74: 22 sprite and walker pages and 52 of the other packs); every page is still used
  assert.equal(ATLAS_PAGES.length, 74, 'no atlas page added');
  for (const dpr of [1, 2]) {
    const plan = planAtlas({ pages: ATLAS_PAGES.length, size: 2048, levels: 5, bpp: 1, budget: atlasBudget(dpr), finest: dpr > 1 ? 0 : 1 });
    assert.ok(plan.bytes <= atlasBudget(dpr), `dpr ${dpr}: ${(plan.bytes / MB).toFixed(1)} MB`);
  }
});

test('the kit joins no pool that picks by kind: the lots\' learned pools, the composer\'s trees and bushes, the Trees brush; never mirrored', () => {
  const pools = kindPools();
  for (const [k, ids] of Object.entries(pools)) assert.ok(!ids.some(isKit), `the ${k} pool has kit art`);
  assert.ok(!TREES.some(isKit) && !BUSHES.some(isKit), 'the composer\'s trees and bushes');
  assert.ok(!plantPool(LIBRARY, 'trees').some(p => isKit(p.id)), 'the Trees brush stays autumn broadleaves and conifers');
  for (const id of KIT_IDS) assert.deepEqual(drawnAs(BY.get(id)!.it, true), [id, false], `${id} is never mirrored`);
  // shadows by kind: lily pads and the jet none, a palm a tree's
  assert.equal(kindOf(BY.get(KIT_LILIES[0])!.it), 'none'); assert.equal(kindOf(BY.get(KIT_FOUNTAIN[0])!.it), 'none'); assert.equal(kindOf(BY.get(KIT_PALM_IDS[0]!)!.it), 'tree');
  // the lamp posts are lamps (lit at night: their glows and the lamps' ground light)
  for (const id of KIT_LAMPS) { const it = BY.get(id)!.it; assert.equal(it.kind, 'lamp'); assert.ok((it.glows?.length ?? 0) > 0, `${id} glows at night`); }
});

test('the menus: Facilities > Plants has the Palms brush; the kit\'s shrubs and mums join Bushes and Flowers; Decoration\'s groups carry the kit', () => {
  assert.deepEqual(PLANT_KINDS.map(k => k.kind), ['trees', 'bushes', 'flowers', 'palms']);
  assert.deepEqual(plantPool(LIBRARY, 'palms').map(p => p.id).sort(), [...KIT_PALM_IDS].sort());
  for (const id of KIT_SHRUBS) assert.ok(plantPool(LIBRARY, 'bushes').some(p => p.id === id), id);
  for (const id of KIT_FLOWERS) assert.ok(plantPool(LIBRARY, 'flowers').some(p => p.id === id), id);
  // the flyout: Facilities > Plants > Palms, and Decoration > Props > the groups
  const fac = RAIL.find(r => r.id === 'facilities')!;
  const rows = menuOf(fac, { golf: true, ui: null, roads: [], paths: [], junctions: [], surfaces: [], cares: [], practice: [], plants: PLANT_KINDS.map(k => ({ id: k.kind, name: k.name, col: k.col })), propGroups: [{ id: 'plants', name: 'Plants' }, { id: 'water', name: 'Water' }, { id: 'stone', name: 'Stone' }, { id: 'furniture', name: 'Furniture' }], materials: [], range: [], newHoleWhy: null } as never);
  const labels = leavesOf(rows).map(l => [...l.path.map(k => k.split(':')[0]), l.row.label].join(' > '));
  assert.ok(labels.some(l => /Palms$/.test(l)), `Palms in the Facilities menu: ${labels.join(' | ')}`);
  // the catalogue: the kit's items by group, each a library picture, priced and with an appeal as decor.ts's rules
  const want: [string, string][] = [['kit-shrub', 'plants'], ['kit-mums', 'plants'], ['kit-hedge', 'plants'], ['kit-palm-windmill', 'plants'], ['kit-palm-canary', 'plants'], ['kit-palm-fan', 'plants'],
    ['kit-fountain', 'water'], ['kit-pond', 'water'], ['kit-pond-stones', 'water'], ['kit-boulder-s', 'stone'], ['kit-boulder-m', 'stone'], ['kit-boulder-l', 'stone'], ['kit-lamp', 'furniture'], ['kit-lamp-twin', 'furniture']];
  for (const [k, g] of want) {
    const d = DECOR_BY_KEY.get(k); assert.ok(d, k); assert.equal(d!.group, g, `${k} group`); assert.ok(!d!.hidden, `${k} is in the panel`);
    assert.ok(BY.has(d!.id), `${k} picture`); for (const v of d!.variants ?? []) assert.ok(BY.has(v), `${k} variant ${v}`);
    assert.ok(d!.price >= 50 && d!.appeal > 0, `${k} price and appeal`);
  }
  assert.equal(DECOR_BY_KEY.get('kit-shrub')!.appeal, APPEAL.plant); assert.equal(DECOR_BY_KEY.get('kit-lamp')!.appeal, APPEAL.small);
  assert.ok(DECOR.filter(d => d.key.startsWith('kit-')).every(d => d.kind !== 'sign'));
  // a stone-edged pond counts once near the range (its mark), as the stonework does
  assert.ok(decorAppeal([{ key: 'kit-pond-stones', x: 5, y: 5 }], [{ x: 0, y: 0 }]) > 0);
});

/** a map for the spot check: owned x 0..100, water at x 60..80 (the course's pond) */
const spot = (over: Partial<DecorSpot> = {}): DecorSpot => ({
  owned: x => x >= 0 && x < 100, water: b => b[2] > 60 && b[0] < 80, road: () => false, course: () => '', range: () => '', overlaps: () => '',
  wet: x => x >= 60 && x < 80, ...over,
});
const box = (x: number, y: number, h = 0.5): Box => [x - h, y - h, x + h, y + h];

test('the fountain jet stands only in water: all of it on the pond, on your land from the course, off it from the town', () => {
  assert.equal(decorSpotWhy(box(70, 10), spot(), 'course', true), '');
  assert.match(decorSpotWhy(box(40, 10), spot(), 'course', true), /Only in water/);
  assert.match(decorSpotWhy(box(60.2, 10), spot(), 'course', true), /Only in water/, 'half on the bank');
  assert.match(decorSpotWhy(box(70, 10), spot({ wet: undefined }), 'course', true), /Only in water/, 'a map that knows no water');
  assert.match(decorSpotWhy(box(70, 10), spot(), 'town', true), /off your land/);
  assert.match(decorSpotWhy(box(70, 10), spot({ overlaps: () => 'the jet' }), 'course', true), /Overlaps/);
  // everything else stays off the water
  assert.equal(decorSpotWhy(box(70, 10), spot()), 'Not on water');
  assert.equal(DECOR_BY_KEY.get('kit-fountain')!.water, 'in');
});

/** a Props tool on a stub map: owned everywhere, no water, nothing in the way; props kept in a list */
function tool() {
  const props: Prop[] = [], items = new Map(LIBRARY.map((it, i) => [it.id, i]));
  let uid = 1, money = 1e6;
  const ctx: PropsHostCtx = {
    golf: () => true, item: id => items.get(id), idOf: p => LIBRARY[p.item]!.id, scaleOf: () => 1,
    footprint: (item, x, y, k) => { const b = LIBRARY[item]!.boxes[0]!; return [x - b.hx * k / 2, y - b.hy * k / 2, x + b.hx * k / 2, y + b.hy * k / 2]; },
    spot: { owned: () => true, water: () => false, road: () => false, course: () => '' },
    propsIn: () => [], props: () => props, propName: () => 'a prop', scene: () => null,
    addProp: (item, x, y, scale) => { const p = { uid: uid++, item, x, y, flip: false, scale, x0: x, y0: y, x1: x, y1: y } as Prop; props.push(p); return p; },
    removeProp: p => { props.splice(props.indexOf(p), 1); },
    propAt: () => null, tileAt: (mx, my) => ({ x: mx, y: my }), selected: () => null, select: () => {}, hover: () => {},
    money: () => money, spend: n => { money -= n; }, step: (_l, run) => { run(); }, undo: () => {}, redo: () => {}, save: () => {}, toast: () => {}, emit: () => {},
  };
  return { t: new PropsTool(ctx), props, money: () => money };
}

test('a hedge is a run: press, drag along the map and let go lays its pieces end to end on the axis dragged along, priced a piece', () => {
  const { t, props, money } = tool(), d = DECOR_BY_KEY.get('kit-hedge')!;
  t.pick('kit-hedge'); t.down(10, 10); t.move(18.2, 11); assert.equal(t.ghosts.length + 1, 4, 'four 2-tile pieces along x');
  t.up();
  assert.equal(props.length, 4); assert.ok(props.every(p => LIBRARY[p.item]!.id === KIT_HEDGE.x && p.y === 10), 'x pieces on the start\'s row');
  assert.deepEqual(props.map(p => p.x), [11, 13, 15, 17], 'end to end from the start');
  assert.ok(props.every(p => p.decor === 'kit-hedge')); assert.equal(1e6 - money(), 4 * d.price);
  // along y, backwards
  t.down(30, 30); t.move(30.5, 25.9); t.up();
  const ys = props.slice(4); assert.equal(ys.length, 2); assert.ok(ys.every(p => LIBRARY[p.item]!.id === KIT_HEDGE.y && p.x === 30)); assert.deepEqual(ys.map(p => p.y), [29, 27]);
  // a click without a drag lays one piece; Esc drops a drag
  t.down(50, 50); t.up(); assert.equal(props.length, 7);
  t.down(60, 60); t.move(70, 60); assert.ok(t.esc()); t.up(); assert.equal(props.length, 7, 'Esc laid nothing');
});

test('R steps a variant item through its pictures (nothing turned or mirrored); the jet loops its four frames', () => {
  const { t } = tool(), d = DECOR_BY_KEY.get('kit-shrub')!;
  t.pick('kit-shrub');
  const seen = Array.from({ length: d.variants!.length + 1 }, (_, k) => { if (k) t.turn(); return LIBRARY[t.pictureOf(d, t.view)!]!.id; });
  assert.deepEqual(seen.slice(0, -1), [...KIT_SHRUBS]); assert.equal(seen.at(-1), KIT_SHRUBS[0], 'and round again');
  assert.ok(t.turns(d));
  const frames = Array.from({ length: 8 }, (_, k) => fountainAt(k / 7));
  assert.ok(new Set(frames).size === 4 && frames.every(f => fountainFrame(f) >= 0));
  assert.equal(fountainFrame('kit:boulder-small-a'), -1);
});

// ---------- the yards
setGeneratedLots(false);
{ const f = parsePresets(PRESET_FIXTURE); setLotPresets(f.presets, f.meta); }
(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };
const leg = (ax: number, ay: number, bx: number, by: number): Leg => ({ a: { x: ax, y: ay }, b: { x: bx, y: by } });
function lots() {
  const e = new NetEditor(new RoadNetwork()), O = 40, at = (k: number) => O + k * 40;
  for (let k = 0; k < 4; k++) { e.addLegs([leg(O, at(k), at(3), at(k))], CLASS.street, 0); e.addLegs([leg(at(k), O, at(k), at(3))], CLASS.street, 0); }
  e.commit();
  const lm = new LotMap(); lm.update(e.net, null);
  return [...lm.lots.values()].sort((p, q) => (p.key < q.key ? -1 : p.key > q.key ? 1 : 0));
}

test('the yards\' kit: house lots get hedges, shrubs and mums by draws of their own, and every lot\'s other props and ground stay exactly where they were', () => {
  const L = lots(), rnd = mulberry(231), states: ComposeState[] = [];
  for (let i = 0; i < 160; i++) states.push({ use: [LU.RES, LU.RES, LU.RES, LU.COM, LU.IND][Math.floor(rnd() * 5)]!, level: [LV.BUILT, LV.UPGRADED, LV.BUILDING][Math.floor(rnd() * 3)]!, decline: Math.floor(rnd() * 4), seed: Math.floor(rnd() * 4294967296) >>> 0 });
  let kit = 0, hedges = 0, plants = 0;
  for (const [i, st] of states.entries()) {
    const lot = L[i % L.length]!;
    KIT_YARDS.on = false; const before = compose(lot, st);
    KIT_YARDS.on = true; const after = compose(lot, st);
    const mine = after.props.filter(p => isKit(p.id)), rest = after.props.filter(p => !isKit(p.id));
    assert.deepEqual(rest, before.props, `lot ${lot.key} ${JSON.stringify(st)}: the other props moved`);
    assert.deepEqual(after.ground, before.ground, 'the ground did not change');
    kit += mine.length; hedges += mine.filter(p => p.id === KIT_HEDGE.x || p.id === KIT_HEDGE.y).length; plants += mine.filter(p => (KIT_SHRUBS as readonly string[]).includes(p.id) || (KIT_FLOWERS as readonly string[]).includes(p.id)).length;
    if (mine.length) assert.equal(st.use, LU.RES, 'only house lots');
    if (mine.length) assert.ok(st.level >= LV.BUILT && st.decline < 2, 'built and kept');
    assert.ok(mine.every(p => !p.flip), 'never mirrored');
  }
  KIT_YARDS.on = true;
  assert.ok(hedges > 0 && plants > 0, `the yards got hedges (${hedges}) and plants (${plants}) of ${kit} kit props`);
});
