// T258 (#755): the driving range's art. The hitting mats (GOLF-ART-LIST 19) and the target greens (20, the bullseye 27) are their pictures laid
// flat on the ground (golf/range-pics.ts, rangebiz.ts rangeScene, rangehost.ts), the stand-ins before them kept as a Studio option (golf/range-
// look.ts, painted-surfaces.json `range`); the owner's ChatGPT buildings and signs replace their stand-ins (and drop their "Stand In for"
// labels) as they land (scripts/assets/prep-range-art.mjs, golf/range-art.json), view 1 or view 2 by the piece's facing; until then nothing changes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { RANGE_ART, defaultRangeBiz, isTargetGreen, lightScore, rangeScene, rangeStats, withUpgrade, type RangeBizSave, type RangeUpgradeId, type ScenePatch } from '../src/game/golf/rangebiz';
import { RangeHost, type RangeHostCtx } from '../src/game/golf/rangehost';
import { DEFAULT_RANGE_LOOK, RANGE_STAND_INS, clampRangeLook, rangeLookOf } from '../src/game/golf/range-look';
import { PIC_TILES, RANGE_PICS, RANGE_PIC_TEX } from '../src/game/golf/range-pics';
import { plotPoint } from '../src/game/golf/range';
import { clampSurfaces } from '../src/game/painted-surfaces';
import { setPaintedSurfaces, paintedSurfaces } from '../src/game/painted-surfaces-live';
import { isPaintPhoto } from '../src/game/paint';
import { ruggedKind } from '../src/game/rugged-edges';
import { LIBRARY } from '../src/game/library';
import type { LotPatch } from '../src/game/ground-protocol';
import type { Rect } from '../src/game/golf/mode';
import ITEMS_FILE from '../src/game/golf/range-art-items.json';
import PICS_FILE from '../src/assets/ground/range-pics.json';

const plots: Record<0 | 1 | 2 | 3, Rect> = { 0: [500, 600, 70, 150], 1: [900, 300, 150, 70], 2: [200, 200, 70, 150], 3: [1200, 1300, 150, 70] };
const FACINGS = [0, 1, 2, 3] as const;
const buy = (ids: RangeUpgradeId[], s = defaultRangeBiz()): RangeBizSave => ids.reduce((q, id) => withUpgrade(q, id), s);
const EVERY: RangeUpgradeId[] = ['bays8', 'bays12', 'greens', 'targets', 'covered', 'dispenser', 'lights', 'kiosk', 'tier2', 'teeturf', 'grass'];
const ITEMS = ITEMS_FILE.items;
/** a world point in the plot's own frame (u along the road, v away from it) */
function frame(plot: Rect, f: 0 | 1 | 2 | 3, x: number, y: number) {
  const o = plotPoint(plot, f, 0, 0), a = plotPoint(plot, f, 1, 0), b = plotPoint(plot, f, 0, 1);
  const ux = a.x - o.x, uy = a.y - o.y, vx = b.x - o.x, vy = b.y - o.y, dx = x - o.x, dy = y - o.y, det = ux * vy - uy * vx;
  return { u: (dx * vy - dy * vx) / det, v: (ux * dy - uy * dx) / det };
}
/** a picture's lay as its axes: the picture's (px, py) in [0, 1]^2 of one period to world tiles */
const at = (p: ScenePatch, px: number, py: number) => {
  const l = p.lay!, a = l.a * Math.PI / 180, w = PIC_TILES * l.s, ex = Math.cos(a), ey = Math.sin(a), pic = PICS_FILE.pics;
  const h = p.surf === 'mats' ? w * pic.mats.h / pic.mats.w : w;
  return { x: l.x + ex * w * px - ey * h * py, y: l.y + ey * w * px + ex * h * py };
};

test('the mats: one picture a bay at the bays\' pitch along the open bays, centred on each bay, turned only (never mirrored), its light toward the upper right', () => {
  for (const f of FACINGS) for (const s of [defaultRangeBiz(), buy(['bays8', 'bays12']), buy(['bays8', 'bays12', 'bays24'])]) {
    const sc = rangeScene(plots[f], f, s), st = rangeStats(s), mats = sc.patches.filter(p => p.surf === 'mats');
    assert.equal(mats.length, 1, `facing ${f}: one strip`);
    const m = mats[0]!, us = [0, 2, 4, 6].map(k => frame(plots[f], f, m.pts[k]!, m.pts[k + 1]!).u);
    assert.ok(Math.abs(Math.max(...us) - Math.min(...us) - 2.5 * st.lowerBays) < 1e-6, `facing ${f}: ${st.lowerBays} bays of 2.5 tiles`);
    // each bay's golfer stands at the middle of a picture across the strip (the period's middle, u) and on its turf (v: half a tile behind it)
    const w = PIC_TILES * m.lay!.s; assert.ok(Math.abs(w - 2.5) < 1e-9, 'a picture is a bay wide');
    const c0 = at(m, 0.5, 0.5);
    for (const b of sc.bays.filter(q => !q.lift)) {
      const d = frame(plots[f], f, b.stand.x, b.stand.y), c = frame(plots[f], f, c0.x, c0.y), k = (d.u - c.u) / 2.5;
      assert.ok(Math.abs(k - Math.round(k)) < 1e-6, `facing ${f}: a bay on a picture's middle`);
      assert.ok(Math.abs(c.v - d.v - 0.5) < 1e-6, `facing ${f}: the turf just ahead of the golfer`);
    }
    // the picture's x axis lies along the bays (u), its y axis down or up the range: a turn, never a mirror (a lay has no flip at all)
    const a = m.lay!.a * Math.PI / 180, e = { x: Math.cos(a), y: Math.sin(a) }, du = { x: plotPoint(plots[f], f, 1, 0).x - plotPoint(plots[f], f, 0, 0).x, y: plotPoint(plots[f], f, 1, 0).y - plotPoint(plots[f], f, 0, 0).y };
    assert.ok(Math.abs(Math.abs(e.x * du.x + e.y * du.y) - 1) < 1e-9, `facing ${f}: along the bays`);
    assert.ok(lightScore(e) >= lightScore({ x: -e.x, y: -e.y }), `facing ${f}: the half turn with its light nearer the upper right`);
  }
});

test('the target greens: the picture at each green\'s size, upright as painted, its green the target\'s radius, the bullseye the 200 m green', () => {
  const pic = PICS_FILE.pics;
  for (const f of FACINGS) {
    const sc = rangeScene(plots[f], f, buy(['greens', 'targets']));
    assert.equal(sc.targets.length, 5);
    const greens = sc.patches.filter(isTargetGreen);
    assert.equal(greens.length, 5, `facing ${f}: a green under each flag`);
    sc.targets.forEach((t, i) => {
      const g = greens[i]!, bull = i === DEFAULT_RANGE_LOOK.bullseye, half = PIC_TILES * g.lay!.s / 2;
      assert.equal(g.surf, bull ? 'bullseye' : 'targetGreen');
      assert.equal(g.lay!.a, -45, 'upright as painted: its x axis to the screen\'s right, its light at the upper right');
      const c = at(g, 0.5, 0.5); assert.ok(Math.hypot(c.x - t.x, c.y - t.y) < 1e-6, `green ${i}: centred on its flag`);
      // its own green is the target's radius (the bullseye's outer ring as wide as a green's collar)
      if (bull) assert.ok(Math.abs(half * pic.bullseye.out - t.r * pic.green.out / pic.green.green) < 1e-6);
      else { assert.ok(Math.abs(half * pic.green.green - t.r) < 1e-6, `green ${i}: r ${t.r}`); assert.equal(g.edge, 'turf'); }
    });
    assert.equal(sc.patches.filter(p => p.surf === 'bullseye').length, 1, 'one bullseye');
    assert.equal(sc.patches.filter(p => p.surf === 'targetGreen' && p.edge === 'flat').length, 4, 'four greens in their collars');
  }
  // the first three greens (the Target greens upgrade) have no bullseye; the studio can move it or have none
  assert.equal(rangeScene(plots[2], 2, buy(['greens'])).patches.filter(p => p.surf === 'bullseye').length, 0);
  const first = rangeScene(plots[2], 2, buy(['greens']), { look: { ...DEFAULT_RANGE_LOOK, bullseye: 0 } }).patches.filter(isTargetGreen);
  assert.deepEqual(first.map(p => p.surf), ['bullseye', 'targetGreen', 'targetGreen']);
  assert.equal(rangeScene(plots[2], 2, buy(['greens', 'targets']), { look: { ...DEFAULT_RANGE_LOOK, bullseye: -1 } }).patches.filter(p => p.surf === 'bullseye').length, 0);
});

test('the stand-ins stay a Studio option: the old pads and turf squares, the old greens in their fringe and collar', () => {
  const s = buy(['greens', 'targets', 'bays8']), st = rangeStats(s);
  const now = rangeScene(plots[2], 2, s), old = rangeScene(plots[2], 2, s, { look: RANGE_STAND_INS });
  assert.equal(old.patches.filter(p => p.surf === 'mats').length, 0);
  assert.equal(old.patches.filter(p => p.surf === 'asphaltDark').length, st.lowerBays);
  assert.equal(old.patches.filter(p => p.surf === 'green').length, st.lowerBays);
  assert.equal(old.patches.filter(p => p.surf === 'target').length, 5); assert.equal(old.patches.filter(p => p.surf === 'fringe').length, 5);
  assert.ok(!old.patches.some(p => p.lay), 'no pictures');
  assert.equal(now.patches.filter(p => p.surf === 'asphaltDark' || p.surf === 'target' || p.surf === 'fringe').length, 0, 'the pictures replace them by default');
  // mats and greens apart
  const m = rangeScene(plots[2], 2, s, { look: { ...DEFAULT_RANGE_LOOK, mats: 'stand-in' } });
  assert.equal(m.patches.filter(p => p.surf === 'mats').length, 0); assert.equal(m.patches.filter(p => p.surf === 'targetGreen').length, 8);
  // the knobs: clamped, kept in the painted surfaces file, missing = the pictures
  assert.deepEqual(clampRangeLook({}), DEFAULT_RANGE_LOOK);
  assert.deepEqual(clampRangeLook({ mats: 'stand-in', greens: 'nope', bullseye: 9 }), { ...DEFAULT_RANGE_LOOK, mats: 'stand-in' });
  assert.deepEqual(clampRangeLook(RANGE_STAND_INS), RANGE_STAND_INS);
  assert.deepEqual(clampSurfaces({ range: RANGE_STAND_INS }).range, RANGE_STAND_INS);
  assert.equal(clampSurfaces({}).range, undefined, 'no block: none written');
  assert.deepEqual(rangeLookOf({}), DEFAULT_RANGE_LOOK); assert.deepEqual(rangeLookOf(null), DEFAULT_RANGE_LOOK);
});

test('the host lays the pictures as tile-space photos, one picture exactly on its mat or green, and lays the stand-ins again when the studio says so', () => {
  const biz = buy(['greens', 'targets']), grounds: LotPatch[][] = [];
  const ctx: RangeHostCtx = {
    biz: () => biz, plot: () => ({ rect: plots[2], facing: 2 }), carPark: () => null, addPiece: () => null, removeProp: () => {}, setGround: (_k, p) => { if (p) grounds.push(p); }, layPaths: () => {}, clearTrees: () => {},
    money: () => 1e6, spend: () => {}, book: () => {}, demand: () => ({ tier: 1, exits: 2, residents: 0 }), dayLen: () => 600, simT: () => 0, clock: () => ({ hour: 12, day: 1 }),
    save: () => {}, toast: () => {}, emit: () => {}, grid: () => null, layTee: () => false,
  };
  const before = paintedSurfaces();
  try {
    const h = new RangeHost(ctx, 3); h.sync();
    const g = grounds.at(-1)!, sc = h.scene!;
    const mats = g.filter(p => p.tex === RANGE_PIC_TEX.mats), greens = g.filter(p => p.tex === RANGE_PIC_TEX.green), bull = g.filter(p => p.tex === RANGE_PIC_TEX.bullseye);
    assert.equal(mats.length, 1); assert.equal(greens.length, 8); assert.equal(bull.length, 1);
    sc.patches.forEach((p, i) => {
      const q = g[i]!;
      if (!p.lay) { assert.equal(q.paint!.o, undefined); assert.equal(q.paint!.s, 1); return; }
      assert.deepEqual(q.paint!.o, [p.lay.x, p.lay.y]); assert.equal(q.paint!.a, p.lay.a); assert.equal(q.paint!.s, p.lay.s);
    });
    for (const t of Object.values(RANGE_PIC_TEX)) { assert.ok(isPaintPhoto(t), `${t} is laid in tile space`); assert.equal(ruggedKind(t), 'hard', `${t} keeps its outline`); }
    assert.deepEqual(RANGE_PICS.map(p => [p.tex, p.mix, p.tiles]), Object.values(RANGE_PIC_TEX).map(t => [t, 0, PIC_TILES]), 'plain photos, one picture a period');
    // the studio's Range art saved: the host lays the stand-ins again on its next sync (no reload)
    const n = grounds.length;
    setPaintedSurfaces({ ...before, range: RANGE_STAND_INS }); h.sync();
    assert.equal(grounds.length, n + 1, 'laid again');
    assert.equal(grounds.at(-1)!.filter(p => p.tex.startsWith('pic:')).length, 0, 'no pictures');
    h.sync(); assert.equal(grounds.length, n + 1, 'not again while nothing changes');
    h.lookOverride = DEFAULT_RANGE_LOOK; h.sync();
    assert.equal(grounds.at(-1)!.filter(p => p.tex.startsWith('pic:')).length, 10, 'the console\'s override wins');
  } finally { setPaintedSurfaces(before); }
});

test('the ChatGPT art: each slug replaces its stand-in pieces (no label, never turned), view 1 or view 2 by the piece\'s facing; none landed, nothing changes', () => {
  const s = buy(EVERY), keyOf = (k: string, piece: string) => new RegExp(`^${piece}(\\d|$)`).test(k);
  // which way each piece's front faces (its view index q: the front faces +y, -x, -y, +x for 0..3): the road (the tee: roadView, the facing's
  // own number) or the range; view 1 (the front and right side) for q 0 or 1, view 2 for 2 or 3
  const FACES: Record<string, 'road' | 'range'> = { shop: 'range', sign: 'road', roof: 'range', kiosk: 'range', dispenser: 'range', board: 'road', light: 'range' };
  for (const it of ITEMS) {
    // what has not landed stands as its labelled stand-in, as before T258
    if (!RANGE_ART[it.slug]) assert.ok(rangeScene(plots[2], 2, s).pieces.some(p => keyOf(p.key, it.piece) && !p.id.startsWith('range:')), `${it.slug}: its stand-in stands`);
    const fake = { [it.slug]: it.code === 'B' ? [`test:${it.slug}`] : [`test:${it.slug}-view1`, `test:${it.slug}-view2`] };
    for (const f of FACINGS) {
      const before = rangeScene(plots[f], f, s, { art: {} }), after = rangeScene(plots[f], f, s, { art: fake });
      const was = before.pieces.filter(p => keyOf(p.key, it.piece === 'roof' ? 'deck' : it.piece)), now = after.pieces.filter(p => p.id.startsWith('test:'));
      assert.ok(now.length > 0, `${it.slug}: drawn at facing ${f}`);
      assert.ok(now.every(p => keyOf(p.key, it.piece) && p.q === 0 && !p.label && p.scale === undefined && p.fit === undefined), `${it.slug}: in its stand-in's place, unlabelled, at its own size, never turned`);
      if (it.code === 'A') { const q = FACES[it.piece] === 'road' ? f : (f + 2) % 4; assert.ok(now.every(p => p.id.endsWith(q < 2 ? '-view1' : '-view2')), `${it.slug}: view ${q < 2 ? 1 : 2} at facing ${f}`); }
      if (it.piece !== 'roof') {
        assert.ok(was.some(p => p.label), `${it.slug}: its stand-in was labelled`);
        assert.equal(now.length, was.length, `${it.slug}: every stand-in replaced`);
        assert.ok(!after.pieces.some(p => keyOf(p.key, it.piece) && p.label), `${it.slug}: no label left`);
      } else {
        // the deck: its section stands on the ground in the covered roof's place under the second tier, no lifted copy
        assert.equal(after.pieces.filter(p => p.key.startsWith('deck')).length, 0, 'no lifted stand-in deck');
        assert.equal(now.length, before.pieces.filter(p => p.key.startsWith('deck')).length, 'one section a deck');
        assert.ok(now.every(p => !p.lift && p.foot), 'on the ground, on its roof\'s footprint');
        assert.equal(after.bays.filter(b => b.lift).length, before.bays.filter(b => b.lift).length, 'the upper bays stay');
      }
    }
  }
  // every slug of the queue is mapped, and every landed view is a library picture
  assert.deepEqual(ITEMS.map(i => i.slug).sort(), ['golf-clubhouse-shanty', 'golf-range-ball-dispenser', 'golf-range-coffee-kiosk', 'golf-range-deck', 'golf-range-distance-post', 'golf-range-floodlight', 'golf-range-sign', 'golf-range-yardage-board']);
  const ids = new Set(LIBRARY.map(it => it.id));
  for (const v of Object.values(RANGE_ART)) for (const id of v) assert.ok(ids.has(id), `${id} is packed`);
});

test('prep-range-art.mjs: finds each slug\'s newest views, sizes by the art list, and is a no-op when no file exists', async () => {
  const root = process.cwd(), script = path.join(root, 'scripts/assets/prep-range-art.mjs');
  const mod = await import(pathToFileURL(script).href) as { findRangeArt: (gen: string, items?: unknown[]) => { it: { slug: string }; views: (string | null)[]; status: string }[]; geometry: (it: unknown, view: number, p: { w: number; h: number; rgba: Buffer }) => { w: number; h: number; ax: number; ay: number; boxes: { hx: number; hy: number }[] } };
  const tmp = fs.mkdtempSync(path.join(process.env.TEMP ?? os.tmpdir(), 't258-gen-'));
  try {
    // an empty folder: nothing found, nothing written (the run lists the eight slugs)
    const watch = ['src/game/golf/range-art.json', 'src/assets/ground/range-pics.json', 'src/game/golf-library.ts', 'src/game/shadow-shapes.json', 'art/range-kit/items.json']
      .map(f => [f, fs.existsSync(path.join(root, f)) ? fs.readFileSync(path.join(root, f), 'utf8') : null] as const);
    const out = execFileSync(process.execPath, [script, '--gen', tmp, '--no-shadows'], { cwd: root, encoding: 'utf8' });
    assert.equal((out.match(/no file yet/g) ?? []).length, 8, out);
    assert.match(out, /nothing new: nothing changed/);
    for (const [f, txt] of watch) assert.equal(fs.existsSync(path.join(root, f)) ? fs.readFileSync(path.join(root, f), 'utf8') : null, txt, `${f} untouched`);
    // the newest version of each view; an A item waits for both views
    const b = path.join(tmp, 'buildings'); fs.mkdirSync(b);
    for (const n of ['golf-clubhouse-shanty-view1-v1.png', 'golf-clubhouse-shanty-view1-v2.png', 'golf-clubhouse-shanty-view2-v1.png', 'golf-range-sign-view1-v1.png', 'golf-range-distance-post-1view-v3.png', 'golf-range-deck-2views-v1.png']) fs.writeFileSync(path.join(b, n), '');
    const found = new Map(mod.findRangeArt(tmp).map(r => [r.it.slug, r]));
    assert.equal(found.get('golf-clubhouse-shanty')!.status, 'ready');
    assert.deepEqual(found.get('golf-clubhouse-shanty')!.views.map(v => path.basename(v!)), ['golf-clubhouse-shanty-view1-v2.png', 'golf-clubhouse-shanty-view2-v1.png']);
    assert.equal(found.get('golf-range-sign')!.status, 'partial', 'view 2 still to come');
    assert.equal(found.get('golf-range-distance-post')!.status, 'ready', 'a one-view item');
    assert.equal(found.get('golf-range-deck')!.status, 'none', 'a two-view sheet is not the queue\'s file name');
    // sizing: a building by its footprint's diamond (32 px a metre of width plus depth), its views' footprints turned; a mast by its height
    const pic = { w: 200, h: 300, rgba: Buffer.alloc(200 * 300 * 4, 255) }, shop = ITEMS.find(i => i.slug === 'golf-clubhouse-shanty')!, mast = ITEMS.find(i => i.slug === 'golf-range-floodlight')!;
    const v1 = mod.geometry(shop, 1, pic), v2 = mod.geometry(shop, 2, pic), m = mod.geometry(mast, 1, pic);
    assert.equal(v1.w, 32 * 20); assert.equal(v1.h, 32 * 20 * 1.5);
    assert.deepEqual([v1.boxes[0]!.hx, v1.boxes[0]!.hy], [6, 4]); assert.deepEqual([v2.boxes[0]!.hx, v2.boxes[0]!.hy], [4, 6]);
    assert.equal(m.h, 64 * 12); assert.equal(m.w, 64 * 12 / 1.5);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
