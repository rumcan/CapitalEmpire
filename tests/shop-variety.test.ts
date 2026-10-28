// T270 (#811; the owner: "I have 5 video vault stores next to eachother"): the shop a lot shows is picked by its place (lots/variety.ts), so the
// lots side by side on a street and the lot across never show the same shop or named business, every shop picture is used about as often, a
// named business stands once to a block, the choice is the same however often and in whatever order the lots are drawn, and a swapped shop is
// never drawn past its pixels or mirrored. Towns headless: the golf start's town (as ?start=town lays it) and the classic seed towns.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIBRARY } from '../src/game/library';
import { lookOf } from '../src/game/newart';
import { isBuilding } from '../src/game/mirror';
import { PIXEL_LIMIT } from '../src/game/sizes';
import { backPalette, compose, housePalette, lotPresets, pickedPreset, type Composition, type LotGeom, type Placed } from '../src/game/lots/compose';
import { footprintOf } from '../src/game/lots/preset-art';
import { BUSINESS, NAMED, SHOP_PALETTE, VENUE_PALETTE, colourOf, layoutOf } from '../src/game/lots/variety';
import { LU, LV } from '../src/game/lots/town';
import { City } from '../src/game/city';
import { CLASS, RoadNetwork, classOf, type ClassId, type Leg, type Pt } from '../src/game/network';
import { NetEditor } from '../src/game/netops';
import { classAt, generateTerrain } from '../src/game/terrain';
import { TOWN_BLOCKS, TOWN_POP, townCentres, townGrid } from '../src/game/lots/seedtowns';
import { planGolfGame } from '../src/game/golf/start';
import { mulberry } from '../src/game/iso';

// the network builds Path2D outlines for the painters; in Node a stub that ignores them is enough
(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

const INDEX = new Map(LIBRARY.map((it, i) => [it.id, i] as const));
/** a picture as the eye sees it: a view's or the east view's base */
const pic = (id: string) => id.replace(/^view:/, '').replace(/:(n|ne|e|se|s|sw|w|nw)$/, '').replace(/^east:/, '');
/** a lot facing a street along x (n along y; u either way along x: the frontage [a, a + w]) */
const along = (a: number, w: number, ny: 1 | -1, ux: 1 | -1, y = 100): LotGeom => ({ o: { x: ux > 0 ? a : a + w, y }, u: { x: ux, y: 0 }, n: { x: 0, y: ny }, w, d: 14 });
/** the same along y */
const alongY = (a: number, w: number, nx: 1 | -1, uy: 1 | -1, x = 100): LotGeom => ({ o: { x, y: uy > 0 ? a : a + w }, u: { x: 0, y: uy }, n: { x: nx, y: 0 }, w, d: 14 });

test('the street lattice: two lots side by side (7-25 tiles) never share a colour, nor the lot across (up to 21 tiles, overlapping)', () => {
  assert.deepEqual(layoutOf(SHOP_PALETTE.length), { step: 3, across: 4 });
  // the eight shops, the houses, and palettes the art requests would make (docs/GOLF-SPRITES.md, T270)
  for (const n of [SHOP_PALETTE.length, housePalette().length, 9, 10, 12, 14]) lattice(n);
});
function lattice(n: number) {
  const r = mulberry(270811 + n);
  for (let i = 0; i < 20000; i++) {
    const make = r() < 0.5 ? along : alongY, a = (r() - 0.5) * 4000, w1 = 7 + r() * 18, w2 = 7 + r() * 18, f = r() < 0.5 ? 1 : -1;
    const s = (r() < 0.5 ? 1 : -1) as 1 | -1, t = (r() < 0.5 ? 1 : -1) as 1 | -1;
    const L = make(a, w1, f as 1 | -1, s), R = make(a + w1, w2, f as 1 | -1, t);
    assert.notEqual(colourOf(L, n), colourOf(R, n), `${n} colours, side by side: ${a.toFixed(2)} +${w1.toFixed(2)} +${w2.toFixed(2)}`);
    // across: the other facing, its frontage overlapping (both up to 21 tiles)
    const v1 = 7 + r() * 14, v2 = 7 + r() * 14, b = a + (r() * 2 - 1) * (v1 + v2) / 2 * 0.999 + (v1 - v2) / 2;
    const P = make(a, v1, f as 1 | -1, s), Q = make(b, v2, -f as 1 | -1, t, 112);
    if (Math.min(a + v1, b + v2) - Math.max(a, b) <= 0) continue;
    assert.notEqual(colourOf(P, n), colourOf(Q, n), `${n} colours, across: ${a.toFixed(2)} +${v1.toFixed(2)} / ${b.toFixed(2)} +${v2.toFixed(2)}`);
  }
  // the frontage, not the way the lot's frame runs, places it
  assert.equal(colourOf(along(40, 14, 1, 1), n), colourOf(along(40, 14, 1, -1), n));
}

/** a town headless: the golf start's (one town beside its course, as ?start=town) or the classic seed towns, stamped to TOWN_POP each */
function town(seed: number, golf: boolean): City | null {
  const t = generateTerrain(seed), city = new City(1), editor = new NetEditor(new RoadNetwork());
  editor.net.paintData = false;
  const byClass = new Map<ClassId, Leg[]>(), add = (legs: Leg[], cls: readonly ClassId[]) => legs.forEach((l, i) => { const id = cls[i]!; let a = byClass.get(id); if (!a) byClass.set(id, a = []); a.push(l); });
  let centres: Pt[];
  if (golf) {
    const s = planGolfGame(t, seed); if (!s) return null;
    centres = [s.centre]; add(s.town.legs, s.town.cls);
    for (const [id, legs] of byClass) editor.addLegs(legs, classOf(id), 0, undefined, true);
    editor.addLegs(s.drive, classOf('drive-gravel'), 0, undefined, true);
  } else {
    centres = townCentres(t);
    for (const c of centres) { const g = townGrid(c, TOWN_BLOCKS, (x, y) => classAt(t, x, y)); add(g.legs, g.cls); }
    for (const [id, legs] of byClass) editor.addLegs(legs, CLASS[id], 0, undefined, true);
  }
  city.terrain(t.cls, t.highway.x >= 0 ? { x: t.highway.x, y: t.highway.y } : centres[0]!, seed, centres, undefined, golf);
  city.netOps(editor.commit(true));
  city.stamp(TOWN_POP);
  return city;
}
interface Row { key: string; use: number; g: LotGeom; c: Composition; drawn: string; ax: 0 | 1; a0: number; a1: number; f: number; ns: number }
/** every built lot of a town composed, with the picture its biggest building is drawn as (newart.ts lookOf) and its frontage on its street's axis */
function rows(city: City): Row[] {
  const out: Row[] = [];
  for (const st of city.town.states.values()) {
    if (st.level < LV.BUILT) continue;
    const l = city.lots.lots.get(st.key); if (!l) continue;
    const g: LotGeom = { o: l.o, u: l.u, n: l.n, w: l.w, d: l.d }, c = compose(g, { use: st.use, level: st.level, decline: st.decline, seed: st.seed });
    let best = 0, drawn = '';
    for (const q of c.props) {
      const i = INDEX.get(q.id), it = i === undefined ? null : LIBRARY[i]!; if (!it || !isBuilding(it) || !it.big) continue;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const b of it.boxes) { const hx = (q.flip ? b.hy : b.hx) * q.scale / 2, hy = (q.flip ? b.hx : b.hy) * q.scale / 2, dx = (q.flip ? b.dy : b.dx) * q.scale / 2, dy = (q.flip ? b.dx : b.dy) * q.scale / 2; x0 = Math.min(x0, q.x + dx - hx); x1 = Math.max(x1, q.x + dx + hx); y0 = Math.min(y0, q.y + dy - hy); y1 = Math.max(y1, q.y + dy + hy); }
      const a = (x1 - x0) * (y1 - y0), look = lookOf({ item: i!, x: q.x, y: q.y, flip: q.flip, scale: q.scale, x0, y0, x1, y1 });
      if (a > best && !look.hidden) { best = a; drawn = pic(LIBRARY[look.item]!.id); }
    }
    if (!drawn) continue;
    const ax = Math.abs(l.u.x) >= Math.abs(l.u.y) ? 0 : 1, e0 = ax ? l.o.y : l.o.x, e1 = e0 + (ax ? l.u.y : l.u.x) * l.w;
    out.push({ key: st.key, use: st.use, g, c, drawn, ax, a0: Math.min(e0, e1), a1: Math.max(e0, e1), f: ax ? l.o.x : l.o.y, ns: Math.sign(ax ? l.n.x : l.n.y) });
  }
  return out;
}
/** the pairs of lots side by side on one block face (one front line and facing, frontages touching) and across a street (the other facing,
 *  front lines within 24 tiles, frontages overlapping by over a tile, each in front of the other) */
function neighbours(list: Row[]): { side: [Row, Row][]; across: [Row, Row][] } {
  const side: [Row, Row][] = [], across: [Row, Row][] = [];
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const p = list[i]!, q = list[j]!; if (p.ax !== q.ax) continue;
    const ov = Math.min(p.a1, q.a1) - Math.max(p.a0, q.a0);
    if (p.ns === q.ns && Math.abs(p.f - q.f) < 2 && ov > -2 && ov < 1) side.push([p, q]);
    else if (p.ns === -q.ns && Math.abs(p.f - q.f) < 24 && ov > 1 && (q.f - p.f) * p.ns < 0) across.push([p, q]);
  }
  return { side, across };
}
const shopLike = (r: Row) => r.use === LU.COM || r.use === LU.TOUR;
const TOWNS: { name: string; city: City }[] = [];
for (const [seed, golf] of [[1, true], [4, true], [2, false]] as const) { const c = town(seed, golf); if (c) TOWNS.push({ name: `${golf ? 'golf' : 'classic'} seed ${seed}`, city: c }); }
const ROWS = TOWNS.map(t => ({ name: t.name, rows: rows(t.city) }));

test('no two shops alike side by side or across the street; houses nearly never (the golf start town and a classic town)', () => {
  assert.equal(TOWNS.length, 3, 'the three towns were laid');
  let judged = 0;
  for (const { name, rows: list } of ROWS) {
    const shops = list.filter(shopLike), { side, across } = neighbours(shops);
    judged += side.length + across.length;
    const same = ([p, q]: [Row, Row]) => p.drawn === q.drawn || BUSINESS[p.drawn] !== undefined && BUSINESS[p.drawn] === BUSINESS[q.drawn];
    const venues = ([p, q]: [Row, Row]) => p.use === LU.TOUR && q.use === LU.TOUR, pairs = [...side, ...across];
    assert.deepEqual(pairs.filter(x => !venues(x) && same(x)).map(([p, q]) => `${p.drawn} ${p.key} / ${q.key}`), [], `${name}: shops alike`);
    // two venues (tour lots: only three venue pictures, variety.ts BY_EIGHT) can match two or three cells apart; rarely
    const v = pairs.filter(venues);
    assert.ok(v.filter(same).length <= Math.max(2, v.length / 4), `${name}: ${v.filter(same).length} of ${v.length} venue pairs alike`);
    // houses: the allocations and sizes leave a lot only part of the houses, so a few pairs still match (were a third of them)
    const h = neighbours(list.filter(r => r.use === LU.RES)), hp = [...h.side, ...h.across], hAlike = hp.filter(([p, q]) => p.drawn === q.drawn).length;
    assert.ok(hAlike <= 0.06 * hp.length, `${name}: ${hAlike} of ${hp.length} house neighbour pairs alike`);
  }
  assert.ok(judged >= 60, `${judged} shop neighbour pairs judged`);
});

test('every shop picture used, none past twice the average; a named business once to a block', () => {
  for (const { name, rows: list } of ROWS) {
    const shops = list.filter(r => r.use === LU.COM), count = new Map<string, number>();
    for (const r of shops) count.set(r.drawn, (count.get(r.drawn) ?? 0) + 1);
    const avg = shops.length / SHOP_PALETTE.length;
    for (const [id, k] of count) assert.ok(k <= Math.max(2 * avg, avg + 2), `${name}: ${id} on ${k} of ${shops.length} shop lots (average ${avg.toFixed(1)})`);
    // (a town of 16 shops shows at least 6 of the 8, of 48 every one: the lattice spreads them by place, not by count)
    if (shops.length >= 16) assert.ok(count.size >= (shops.length >= 48 ? SHOP_PALETTE.length : 6), `${name}: ${count.size} shop pictures in use (${[...count.keys()].join(', ')})`);
    for (const id of count.keys()) assert.ok(SHOP_PALETTE.includes(id), `${name}: ${id} is a shop front`);
    for (const r of list.filter(x => x.use === LU.TOUR)) assert.ok(VENUE_PALETTE.includes(r.drawn) || /gas/.test(r.drawn), `${name}: a tour lot drawn as ${r.drawn}`);
    // the block lots (blk:<block>:<side>:<cell>) of one block: no named business twice
    const blocks = new Map<string, string[]>();
    for (const r of shops) { if (!r.key.startsWith('blk:')) continue; const b = r.key.split(':').slice(1, 3).join(':'); const l = blocks.get(b) ?? []; l.push(BUSINESS[r.drawn] ?? r.drawn); blocks.set(b, l); }
    for (const [b, l] of blocks) for (const nm of NAMED) assert.ok(l.filter(x => x === nm).length <= 1, `${name}: block ${b} has ${l.filter(x => x === nm).length} x ${nm}`);
  }
});

test('the choice is by place: the same lot draws the same, alone, again, or after others in another order; the presets are not touched', () => {
  const presets = JSON.stringify(lotPresets());
  const list = ROWS[0]!.rows.filter(r => r.use !== LU.RES).concat(ROWS[0]!.rows.filter(r => r.use === LU.RES).slice(0, 60));
  const digest = (c: Composition) => JSON.stringify(c.props.map(p => [p.id, p.x.toFixed(3), p.y.toFixed(3), p.flip, p.scale.toFixed(4)]));
  const st = (r: Row) => { const s = TOWNS[0]!.city.town.states.get(r.key)!; return { use: s.use, level: s.level, decline: s.decline, seed: s.seed }; };
  const back = [...list].reverse().map(r => digest(compose({ o: { ...r.g.o }, u: { ...r.g.u }, n: { ...r.g.n }, w: r.g.w, d: r.g.d }, st(r)))).reverse();
  assert.deepEqual(back, list.map(r => digest(r.c)), 'composed again in the other order, from copies of the lots');
  assert.equal(JSON.stringify(lotPresets()), presets, 'no preset changed');
});

test('a swapped shop or house is never drawn past its pixels, nor mirrored', () => {
  let swapped = 0;
  for (const { name, rows: list } of ROWS) for (const r of list) {
    if (r.use !== LU.COM && r.use !== LU.TOUR && r.use !== LU.RES) continue;
    const s = TOWNS.find(t => t.name === name)!.city.town.states.get(r.key)!, preset = pickedPreset(r.g, { use: s.use, level: s.level, decline: s.decline, seed: s.seed });
    if (!preset) continue;
    // the lot's biggest building, and whether its preset holds that picture (else it was swapped in)
    let main: Placed | null = null, area = 0;
    for (const p of r.c.props) { const it = LIBRARY[INDEX.get(p.id) ?? -1]; if (!it || !isBuilding(it) || !it.big) continue; const fp = footprintOf(p.id, p.scale, p.flip), a = (fp[2] - fp[0]) * (fp[3] - fp[1]); if (a > area) { area = a; main = p; } }
    const palette = r.use === LU.RES ? [...housePalette(), ...backPalette()] : [...SHOP_PALETTE, ...VENUE_PALETTE];
    if (!main || !palette.includes(pic(main.id)) || preset.props.some(q => pic(q.id) === pic(main!.id))) continue;
    swapped++;
    const i = INDEX.get(main.id)!;
    assert.ok(main.scale <= PIXEL_LIMIT[i]! + 1e-9, `${name}: ${main.id} drawn at ${main.scale.toFixed(3)}, past its pixels ${PIXEL_LIMIT[i]!.toFixed(3)}`);
    assert.equal(main.flip, false, `${name}: ${main.id} mirrored`);
  }
  assert.ok(swapped >= 20, `${swapped} swapped shops and houses checked`);
});
