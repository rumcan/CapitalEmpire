// Freeze today's lots into presets (P20 / T063), the bundled half of scripts/assets/freeze-lot-presets.mjs (run that, not this):
//   freeze.mjs --freeze <curated.json> <lot-presets.json> [--note "<text>"]... [--refreeze-curated]   the freeze, then the check
//   freeze.mjs --check  <curated.json> <lot-presets.json>   the check alone
// A freeze keeps the file's curated presets (curated: true) exactly as they are, and its header notes; the check compares the curated presets
// with the last commit's (git HEAD) and fails when one changed.
// The freeze runs the game's own composer (compose.ts layoutOfUse) on a canonical lot (the street on +y, so nothing turned or flipped) for
// every use (res, com, park, tour, ind, civic) x state (built, upgraded, declined) x size bucket of a real town, with 4 fixed seeds each, and
// converts each layout into a preset in the lot frame: props as { id, x, y, scale, view } (x, y the footprint centre; four-view art by its base
// id and view; scale over the owner scale), ground patches as { kind, tex, pts, lines }. What stays procedural (P20 decision 2) is left out:
// street items, fences, the leaf decals. Then the owner's 14 curated house lots: their builder ids mapped to the game's (houses to four-view
// houses, cars to the eight-way cars), Halloween and builder-only sprites dropped, the paving decals turned into drive, walk and yard patches,
// centred on the town's 10 x 15 house lot (res, built; the neglected ones declined), curated: true.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { CLASS, RoadNetwork, type Leg } from '../../src/game/network';
import { NetEditor } from '../../src/game/netops';
import { LotMap, type Lot } from '../../src/game/lots/lots';
import { townGrid, TOWN_BLOCKS } from '../../src/game/lots/seedtowns';
import { layoutOfUse, isCarPark, type ComposeState, type LotGeom } from '../../src/game/lots/compose';
import { LU, LV } from '../../src/game/lots/town';
import { TC } from '../../src/game/terrain/types';
import { LIBRARY } from '../../src/game/library';
import { standInFamily } from '../../src/game/newart';
import { isBuilding } from '../../src/game/mirror';
import { parkedCar } from '../../src/game/traffic';
import { BUCKET, bucketOf, formatPresets, parsePresets, type LotPreset, type PresetPatch, type PresetProp, type PresetState, type PresetUse } from '../../src/game/lots/presets';
import { baseView, footprintOf, fourViews, hasSprite, ownerScaleOf } from '../../src/game/lots/preset-art';
import { frameOf, listToFrame, toFrame } from '../../src/game/lots/preset-frame';

// the network builds Path2D outlines for the painters; in Node a stub that ignores them is enough
(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

const [mode, curatedFile, presetFile, ...opts] = process.argv.slice(2) as [string, string, string, ...string[]];
const BY = new Map(LIBRARY.map(i => [i.id, i]));
const isFence = (id: string) => { const k = BY.get(id)?.kind; return k === 'fencex' || k === 'fencey' || id === 'world:hedge'; };
/** a FNV-1a hash of a string (the variants' seeds) */
const fnv = (s: string) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0; return h; };
const r3 = (v: number) => Math.round(v * 1000) / 1000;
/** the reasons props were left out, counted */
const dropped = new Map<string, number>();
const drop = (why: string, n = 1) => dropped.set(why, (dropped.get(why) ?? 0) + n);
/** a footprint centre clamped into the lot's 0..size (tiles; a prop the composer let reach a little past its line, or the owner nudged over it,
 *  stays in its preset), rounded; each clamp is counted */
let clamped = 0;
const inLot = (v: number, size: number) => { const c = Math.min(size, Math.max(0, v)); if (Math.abs(c - v) > 1e-9) clamped++; return r3(c); };

// ---------------------------------------------------------------- the size buckets of a real town
const leg = (ax: number, ay: number, bx: number, by: number): Leg => ({ a: { x: ax, y: ay }, b: { x: bx, y: by } });
/** the lots of the tests' street grid (tests/compose.test.ts lotsOfGrid): 4 x 4 streets 40 tiles apart and a boulevard across */
function gridLots(): Lot[] {
  const O = 40, STEP = 40, LINES = 4, at = (k: number) => O + k * STEP, last = at(LINES - 1), e = new NetEditor(new RoadNetwork());
  for (let k = 0; k < LINES; k++) { e.addLegs([leg(O, at(k), last, at(k))], CLASS.street!, 0); e.addLegs([leg(at(k), O, at(k), last)], CLASS.street!, 0); }
  e.commit(); e.addLegs([leg(at(1) + 20, O, at(1) + 20, last)], CLASS.boulevard!, 0); e.commit();
  const lm = new LotMap(); lm.update(e.net, null); return [...lm.lots.values()];
}
/** the lots of a seed town (seedtowns.ts townGrid: TOWN_BLOCKS x TOWN_BLOCKS blocks, the middle lines avenues) on open ground: 448 lots, 156 sizes */
function townLots(): Lot[] {
  const g = townGrid({ x: 1024, y: 1024 }, TOWN_BLOCKS, () => TC.GROUND), e = new NetEditor(new RoadNetwork());
  g.legs.forEach((l, i) => e.addLegs([l], CLASS[g.cls[i]!]!, 0)); e.commit();
  const lm = new LotMap(); lm.update(e.net, null); return [...lm.lots.values()];
}
/** the frontage lots' full sizes by road class (lots.ts SIZE: street, road, avenue, arterial, boulevard), tiles */
const FULL: [number, number][] = [[10, 15], [12.5, 16], [15, 18], [16.5, 19], [20, 20]];
/** every bucket of the town and the grid, each laid out at the size most of its lots have (ties: the narrower, then the shallower), and the
 *  frontage full sizes whose bucket neither has; sorted by width, then depth */
function buckets(): { bw: number; bd: number; w: number; d: number; lots: number }[] {
  const seen = new Map<string, Map<string, { w: number; d: number; n: number }>>();
  const add = (w: number, d: number) => {
    const b = bucketOf(w, d), k = `${b.w}x${b.d}`; let m = seen.get(k); if (!m) seen.set(k, (m = new Map()));
    const s = `${w}x${d}`, e = m.get(s); if (e) e.n++; else m.set(s, { w, d, n: 1 });
  };
  for (const l of [...townLots(), ...gridLots()]) add(l.w, l.d);
  const out = [...seen].map(([k, m]) => {
    const best = [...m.values()].sort((a, b) => b.n - a.n || a.w - b.w || a.d - b.d)[0]!, [bw, bd] = k.split('x').map(Number) as [number, number];
    return { bw, bd, w: best.w, d: best.d, lots: [...m.values()].reduce((s, e) => s + e.n, 0) };
  });
  for (const [w, d] of FULL) { const b = bucketOf(w, d); if (!out.some(o => o.bw === b.w && o.bd === b.d)) out.push({ bw: b.w, bd: b.d, w, d, lots: 0 }); }
  return out.sort((a, b) => a.bw - b.bw || a.bd - b.bd);
}

// ---------------------------------------------------------------- the composer's layouts
const USES: [PresetUse, number][] = [['res', LU.RES], ['com', LU.COM], ['park', LU.COM], ['tour', LU.TOUR], ['ind', LU.IND], ['civic', LU.GOV]];
const STATES: [PresetState, number, number][] = [['built', LV.BUILT, 0], ['upgraded', LV.UPGRADED, 0], ['declined', LV.BUILT, 2]];
/** the variants per use, state and bucket */
const VARIANTS = 4;
/** a variant's seed: fixed by its use, state, bucket and number; a shop's never a car park's (isCarPark: seed % 100 < 15), a car park's always */
function seedOf(use: PresetUse, state: PresetState, bw: number, bd: number, k: number): number {
  const h = fnv(`${use}|${state}|${bw}x${bd}|${k}`) % 4000000000, base = h - (h % 100);
  return use === 'park' ? base + (h % 15) : use === 'com' ? base + 15 + (h % 85) : h;
}
/** a canonical lot of w x d tiles (the street on +y: u +x, n -y), placed apart per variant so the shop decks (dealt by the street and the slot along it) differ */
const canonical = (w: number, d: number, k: number): LotGeom => ({ o: { x: 4000 + 37 * k * w, y: 4000 + 53 * k }, u: { x: 1, y: 0 }, n: { x: 0, y: -1 }, w, d });

/** one variant's layout as a preset (null when the composer laid nothing out) */
function freezeOne(use: PresetUse, lu: number, state: PresetState, level: number, decline: number, b: { bw: number; bd: number; w: number; d: number }, k: number): LotPreset | null {
  const seed = seedOf(use, state, b.bw, b.bd, k), st: ComposeState = { use: lu, level, decline, seed };
  if (isCarPark(st) !== (use === 'park')) throw new Error(`seed ${seed} for ${use}`);
  const lot = canonical(b.w, b.d, k), f = frameOf(lot), lay = layoutOfUse(lot, st);
  if (!lay) return null;
  const props: PresetProp[] = [];
  for (const p of lay.props) {
    if (p.street) { drop('frozen: street items (procedural)'); continue; }
    if (isFence(p.id)) { drop('frozen: fences (procedural)'); continue; }
    if (p.flip) drop('frozen: a flipped prop stored unflipped (none expected on a canonical lot)');
    const fp = footprintOf(p.id, p.scale, p.flip), c = toFrame(f, p.x + (fp[0] + fp[2]) / 2, p.y + (fp[1] + fp[3]) / 2), bv = baseView(p.id);
    props.push({ id: bv.id, x: inLot(c.x, b.w), y: inLot(c.y, b.d), scale: r3(p.scale / ownerScaleOf(bv.id)), view: bv.view });
  }
  const patches: PresetPatch[] = lay.patches.map(a => ({ kind: a.kind, tex: a.tex, pts: listToFrame(f, a.pts).map(r3), ...(a.lines ? { lines: listToFrame(f, a.lines).map(r3) } : {}) }));
  return { id: `${use}-${state}-${b.bw}x${b.bd}-${k}`, use, state, w: b.w, d: b.d, props, patches };
}

// ---------------------------------------------------------------- the owner's curated house lots
interface CurItem { id: string; x: number; y: number; flip: boolean; scale: number; flat: boolean; scenario: string | null; cat: string | null; fw: number | null; fh: number | null; own: number }
interface Cur { id: string; W: number; D: number; rear: boolean; story: string; house: { id: string; x: number; y: number; scale: number; kept: boolean }; items: CurItem[] }
/** the town's house lot (lots.ts SIZE street): the curated 8 x 15 lots are centred on it, with a tile more yard each side (as the baked pictures were) */
const HOUSE_W = 10, HOUSE_D = 15;
const HALLOWEEN = /halloween|pumpkin|scarecrow|grave_|blowmold|yard-spider|yard-coffin|witch|sheet-ghost/;
/** the kerb pieces the street-items pass places (compose.ts): left out of a curated lot when they stand by its street edge */
const KERB = new Set(['gen:trash-cans-row', 'world:mailbox', 'expansion:leaf-bags', 'world:hydrant']);
/** the footprint span (half extents summed, tiles at scale 1) of a library sprite: how big a stand-in must be */
const span = (id: string) => { const b = footprintOf(id, 1, false); return (b[2] - b[0] + b[3] - b[1]) / 2; };
/** the game's four-view dwellings (front views): the stand-ins for a house without its four views */
const DWELLINGS = LIBRARY.filter(i => standInFamily(i) === 'dwelling' && fourViews(i.id)?.at === 0 && !/-north-|gen[:-]back-|[-_]rear|garage/.test(i.id)).map(i => i.id).sort();
/** the game's four-view art for a curated building without four views: the plain sibling of a corner variation, its variation's base, else
 *  for a house the four-view dwelling nearest in size (one of those within 25% of the nearest, picked by the lot); else itself */
function houseFor(id: string, lot: string): string {
  if (fourViews(id)) return id;
  const plain = id.replace('-plain-corner:', '-plain:');
  if (plain !== id && fourViews(plain)) return plain;
  const m = /^variation:([a-z]+)-(.+?)-[0-9a-f]{8}-/.exec(id), base = m ? `${m[1]}:${m[2]}` : '';
  if (base && fourViews(base)) return base;
  if (standInFamily(BY.get(id)!) !== 'dwelling') return id;
  const want = span(id), d = DWELLINGS.map(h => Math.abs(Math.log(span(h) / want))), best = Math.min(...d), near = DWELLINGS.filter((_, k) => d[k]! <= best + 0.25);
  return near[fnv(lot) % near.length] ?? id;
}
const mapped: string[] = [];
/** a decal's nominal size from its id (paint:slabs-tile-2_5m-1: 2.5 m), metres */
const metres = (id: string) => { const m = /-(\d+(?:_\d+)?)m-/.exec(id); return m ? Number(m[1]!.replace('_', '.')) : 2; };

function curated(v: Cur): LotPreset {
  const w = v.W / 2, d = v.D / 2, dx = (HOUSE_W - w) / 2;
  // a builder point (metres; the street at Y = D, or at Y = 0 on a rear lot) in the canonical lot frame (tiles): a rear lot is turned half round
  const at = (X: number, Y: number) => (v.rear ? { x: (v.W - X) / 2 + dx, y: Y / 2 } : { x: X / 2 + dx, y: (v.D - Y) / 2 });
  const props: PresetProp[] = [], patches: PresetPatch[] = [];
  let car = 0;
  for (const p of v.items) {
    if (p.flat) continue;
    if (p.cat === 'Halloween yard details' || HALLOWEEN.test(p.id)) { drop('curated: Halloween sprites'); continue; }
    const front = v.rear ? p.y : v.D - p.y;
    if (KERB.has(p.id) && front < 1.6) { drop('curated: kerb items (the street items stay procedural)'); continue; }
    if (!hasSprite(p.id)) { drop(`curated: not in the game library (builder only): ${p.id}`); continue; }
    if (BY.get(p.id)!.cat === 'Vehicles') {
      // the game's parked cars (the eight-way art), nose along the drive as the builder's car faced: n (-Y) or s (+Y), else to the street
      const nose = /_n(-v2)?$/.test(p.id) ? -1 : /_s(-v2)?$/.test(p.id) ? 1 : v.rear ? -1 : 1, toStreet = v.rear ? nose < 0 : nose > 0;
      const id = LIBRARY[parkedCar((fnv(v.id) + car++) % 2, toStreet ? 1 : 3).item]!.id, c = at(p.x, p.y);
      mapped.push(`${v.id}: car ${p.id} -> ${id}`);
      props.push({ id, x: r3(c.x), y: r3(c.y), scale: 1, view: 0 });
      continue;
    }
    let id = p.id, abs = p.scale;
    const it = BY.get(id)!;
    if (isBuilding(it) && !fourViews(id)) {
      const n = houseFor(id, v.id);
      if (n !== id) { abs = p.scale * span(id) / span(n); mapped.push(`${v.id}: ${id} -> ${n}`); id = n; }
    }
    if (p.flip) { const fv = fourViews(id); if (fv) id = fv.views[[1, 0, 3, 2][fv.at]!]!; else drop('curated: a mirrored prop stored unmirrored'); }
    const fp = footprintOf(id, abs, false), c = at(p.x + fp[0] + fp[2], p.y + fp[1] + fp[3]), bv = baseView(id);
    // four-view art keeps its world facing: on a rear lot (turned half round) its front now faces away from the street
    props.push({ id: bv.id, x: inLot(c.x, HOUSE_W), y: inLot(c.y, d), scale: r3(abs / ownerScaleOf(bv.id)), view: (fourViews(id) ? (bv.view + (v.rear ? 2 : 0)) % 4 : 0) as PresetProp['view'] });
  }
  // a house the owner rejected with no other of its pool left to stand in (the rear lots' only rear view): a four-view house in its place, its
  // street-side wall where the old one's was, centred on it, the size of the old one
  if (!v.house.kept && hasSprite(v.house.id)) {
    const h = v.house, want = span(h.id), pool = DWELLINGS.filter(id => id !== h.id), dist = pool.map(id => Math.abs(Math.log(span(id) / want))), best = Math.min(...dist);
    const near = pool.filter((_, k) => dist[k]! <= best + 0.25), id = near[fnv(v.id) % near.length]!, abs = h.scale * want / span(id);
    const fo = footprintOf(h.id, h.scale, false), co = at(h.x + fo[0] + fo[2], h.y + fo[1] + fo[3]), fn = footprintOf(id, abs, false);
    props.unshift({ id, x: inLot(co.x, HOUSE_W), y: inLot(co.y - (fo[3] - fo[1]) / 2 + (fn[3] - fn[1]) / 2, d), scale: r3(abs / ownerScaleOf(id)), view: 0 });
    mapped.push(`${v.id}: the rejected ${h.id} (no house left in its pool) -> ${id}`);
  }
  // the paving decals as ground patches: the drive and the walk each one strip from their decals to the street edge, a patio a square of slabs,
  // each stepping stone a small one; the rest of the decals are left out (the leaves stay procedural, the game casts its own shadows)
  const rect = (kind: PresetPatch['kind'], tex: string, X0: number, Y0: number, X1: number, Y1: number) => {
    const a = at(X0, Y0), b = at(X1, Y1), x0 = Math.max(0, Math.min(a.x, b.x)), x1 = Math.min(HOUSE_W, Math.max(a.x, b.x)), y0 = Math.max(0, Math.min(a.y, b.y)), y1 = Math.min(d, Math.max(a.y, b.y));
    if (x1 - x0 > 0.05 && y1 - y0 > 0.05) patches.push({ kind, tex, pts: [x0, y0, x1, y0, x1, y1, x0, y1].map(r3) });
  };
  const flats = v.items.filter(p => p.flat), streetY = v.rear ? 0 : v.D;
  const strip = (sc: string[], kind: PresetPatch['kind'], tex: string, half: number, step: number) => {
    const g = flats.filter(p => sc.includes(p.scenario ?? '')); if (!g.length) return;
    const xs = g.map(p => p.x).sort((a, b) => a - b), cx = xs[Math.floor(xs.length / 2)]!, ys = g.map(p => p.y);
    const far = v.rear ? Math.max(...ys) + step : Math.min(...ys) - step;
    rect(kind, tex, cx - half, far, cx + half, streetY);
  };
  const drives = flats.filter(p => p.scenario === 'drive' || p.scenario === 'blacktop'), black = drives.filter(p => p.scenario === 'blacktop').length > drives.length / 2;
  strip(['drive', 'blacktop'], 'drive', black ? 'asphalt' : 'paving', 1.6, 1.3);
  strip(['walk'], 'walk', 'slabs', 0.75, 0.75);
  for (const p of flats) {
    if (p.scenario === 'patio' || p.scenario === 'stepping') { const s = metres(p.id) * p.scale * (p.scenario === 'stepping' ? 0.7 : 1) / 2; rect(p.scenario === 'patio' ? 'yard' : 'walk', 'slabs', p.x - s, p.y - s, p.x + s, p.y + s); }
    else if (p.scenario !== 'drive' && p.scenario !== 'blacktop' && p.scenario !== 'walk') drop(`curated: ${/Leaves/i.test(p.scenario ?? '') ? 'leaf decals (procedural)' : /Shade|canopy/i.test(p.scenario ?? '') ? 'shade decals (the game casts shadows)' : `decals (${p.scenario ?? 'no scenario'})`}`);
  }
  return { id: `curated-${v.id.replace(/^lot:/, '')}`, use: 'res', state: v.story === 'neglected' ? 'declined' : 'built', w: HOUSE_W, d: HOUSE_D, props, patches, curated: true };
}

// ---------------------------------------------------------------- the check
/** prints the counts per use, state and bucket, the ids the game does not know and the empty presets; returns the problems found */
function report(presets: LotPreset[], invalid: number, bytes: number): number {
  let bad = invalid;
  const uses = [...new Set(presets.map(p => p.use))], states: PresetState[] = ['built', 'upgraded', 'declined'];
  console.log(`\n${presets.length} presets (${presets.filter(p => p.curated).length} curated), ${presets.reduce((s, p) => s + p.props.length, 0)} props, ${presets.reduce((s, p) => s + p.patches.length, 0)} patches, ${(bytes / 1024).toFixed(0)} KiB, ${invalid} invalid`);
  console.log(`use     ${states.map(s => s.padStart(9)).join('')}   buckets`);
  for (const u of uses) {
    const of = presets.filter(p => p.use === u), bk = new Map<string, number>();
    for (const p of of) { const b = bucketOf(p.w, p.d), k = `${b.w}x${b.d}`; bk.set(k, (bk.get(k) ?? 0) + 1); }
    console.log(`${u.padEnd(8)}${states.map(s => String(of.filter(p => p.state === s).length).padStart(9)).join('')}   ${bk.size}: ${[...bk].map(([k, n]) => `${k}:${n}`).join(' ')}`);
  }
  for (const u of ['res', 'com', 'park', 'tour', 'ind', 'civic'] as PresetUse[]) for (const s of states) if (!presets.some(p => p.use === u && p.state === s)) { console.log(`MISSING: no ${u} ${s} preset`); bad++; }
  const unknown = new Map<string, number>();
  for (const p of presets) for (const q of p.props) if (!hasSprite(q.id)) unknown.set(q.id, (unknown.get(q.id) ?? 0) + 1);
  if (unknown.size) { console.log(`ids the game does not know: ${[...unknown].map(([k, n]) => `${k} x${n}`).join(', ')}`); bad += unknown.size; } else console.log('every prop id is a game library id');
  // the buildings that cannot turn (no four views): on a lot facing another way they keep their picture (newart.ts draws a stand-in)
  const flat = new Map<string, number>();
  for (const p of presets) for (const q of p.props) { const it = BY.get(q.id); if (it && isBuilding(it) && !fourViews(q.id)) flat.set(q.id, (flat.get(q.id) ?? 0) + 1); }
  console.log(`buildings without four views (they keep their picture on a turned lot): ${[...flat.values()].reduce((s, n) => s + n, 0)} props of ${flat.size} sprites${flat.size ? `: ${[...flat].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} x${n}`).join(', ')}` : ''}`);
  const empty = presets.filter(p => !p.props.length);
  if (empty.length) console.log(`presets with no props (the composer laid out nothing at that size; a bare lot): ${empty.map(p => p.id).join(' ')}`);
  return bad;
}

if (mode === '--freeze') {
  const list: LotPreset[] = [], bks = buckets();
  console.log(`${bks.length} size buckets (step ${BUCKET}): ${bks.map(b => `${b.bw}x${b.bd}${b.w !== b.bw || b.d !== b.bd ? `@${b.w}x${b.d}` : ''}`).join(' ')}`);
  const cur = (JSON.parse(fs.readFileSync(curatedFile, 'utf8')) as Cur[]).map(curated);
  for (const [use, lu] of USES) for (const b of bks) for (const [state, level, decline] of STATES) {
    for (let k = 0; k < VARIANTS; k++) { const p = freezeOne(use, lu, state, level, decline, b, k); if (p) list.push(p); }
    // the curated house lots join the town's house bucket, after the composer's own
    if (use === 'res') for (const c of cur) { const cb = bucketOf(c.w, c.d); if (c.state === state && cb.w === b.bw && cb.d === b.bd) list.push(c); }
  }
  // the presets the owner has curated (curated: true) are his: kept from the file exactly as they are, in their place (or at the end when the
  // freeze makes no preset of that id), unless --refreeze-curated; the file's notes are kept, and each --note adds one
  const old = fs.existsSync(presetFile) ? parsePresets(JSON.parse(fs.readFileSync(presetFile, 'utf8'))) : { presets: [] as LotPreset[], invalid: 0 };
  const oldCurated = new Map(old.presets.filter(p => p.curated).map(p => [p.id, p] as const)), kept: string[] = [];
  if (!opts.includes('--refreeze-curated')) {
    list.forEach((p, i) => { const o = oldCurated.get(p.id); if (o) { list[i] = o; kept.push(p.id); } });
    for (const [id, o] of oldCurated) if (!kept.includes(id)) { list.push(o); kept.push(id); }
  }
  const notes = [...(old.meta?.notes ?? []), ...opts.flatMap((o, i) => (o === '--note' && opts[i + 1] ? [opts[i + 1]!] : []))];
  const text = formatPresets(list, notes.length ? { notes } : undefined);
  const block = (p: LotPreset) => formatPresets([p]);
  for (const id of kept) if (block(list.find(p => p.id === id)!) !== block(oldCurated.get(id)!)) throw new Error(`curated preset ${id} changed in the freeze`);
  const oldText = new Map(old.presets.map(p => [p.id, block(p)] as const)), changed = list.filter(p => oldText.has(p.id) && oldText.get(p.id) !== block(p));
  fs.writeFileSync(presetFile, text);
  console.log(`wrote ${presetFile}`);
  console.log(`curated presets kept exactly as they were: ${kept.length}${opts.includes('--refreeze-curated') ? ' (--refreeze-curated: laid out again)' : ''}`);
  const byUse = new Map<string, number>(); for (const p of changed) byUse.set(p.use, (byUse.get(p.use) ?? 0) + 1);
  console.log(`presets that differ from the file before: ${changed.length} (${[...byUse].map(([u, n]) => `${u} ${n}`).join(', ') || 'none'}); new: ${list.filter(p => !oldText.has(p.id)).length}; gone: ${old.presets.filter(p => !list.some(q => q.id === p.id)).length}`);
  console.log(`left out: ${[...dropped].map(([k, n]) => `\n  ${k}: ${n}`).join('')}`);
  console.log(`props whose footprint centre lay past the lot line, moved onto it: ${clamped}`);
  console.log(`mapped (curated): ${mapped.map(m => `\n  ${m}`).join('')}`);
}
const text = fs.readFileSync(presetFile, 'utf8'), parsed = parsePresets(JSON.parse(text));
let bad = report(parsed.presets, parsed.invalid, Buffer.byteLength(text));
if (parsed.meta) console.log(`notes:${parsed.meta.notes.map(n => `\n  ${n}`).join('')}`);
// the curated presets against the last commit's (git HEAD): a freeze must leave them as they were; an owner's edit since shows here too
try {
  const head = parsePresets(JSON.parse(execFileSync('git', ['show', 'HEAD:src/game/lots/lot-presets.json'], { cwd: path.dirname(presetFile), maxBuffer: 256 << 20 }).toString()));
  const now = new Map(parsed.presets.map(p => [p.id, formatPresets([p])] as const));
  const diff = head.presets.filter(p => p.curated && now.get(p.id) !== formatPresets([p])).map(p => p.id);
  if (diff.length) { console.log(`CURATED presets changed since the last commit (or gone): ${diff.join(' ')}`); bad += diff.length; }
  else console.log(`the ${head.presets.filter(p => p.curated).length} curated presets of the last commit are unchanged`);
} catch { console.log('(no committed lot-presets.json to compare the curated presets with)'); }
process.exit(bad ? 1 : 0);
