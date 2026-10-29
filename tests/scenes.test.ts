// T242 (#702, plan P28 3): set the scene. The manifest (scripts/assets/prep-scenes.mjs) lists every picture once and matches the files; each
// place's picture follows its state (the range's upgrades, the putting green, the home's stage and takings, a lot's level and decline, the town's
// fortunes for a farm, the clubhouse tier); a place with no art opens nothing; the card draws the picture, its tabs (wrapping), its line and
// numbers; the engine and the App wire it (the map click, the cards' Scene buttons, the guide, the toasts, Esc).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import {
  CONDITION, FARM_LINES, GOOD_TIMES, HARD_TIMES, HOME_SLUGS, HOME_SMART_AT, LINES, LOT_PLACES, RANGE_GOOD_WHEN, SCENE_MANIFEST, clubScene, clubWant, farmScene,
  lotPlaceHasArt, lotPlaceOf, lotScene, pickPicture, placeHasArt, rangeGood, rangeNews, rangeScene, rangeSceneKeys, rangeViewOfKey, sceneArt, townFortune,
  type RangeSceneFacts, type SceneManifest,
} from '../src/game/scenes';
import { SceneCard } from '../src/ui/SceneCard';

const DIR = 'src/assets/scenes';
const BATCH1 = ['hitting-bays', 'home-caravan', 'home-cottage', 'home-farmhouse', 'practice-green', 'pro-shop-inside', 'range-road', 'video-store-inside', 'video-store-outside'];

test('the manifest: every picture once, its file there at its size, 1024 px wide, 60-260 KB; no stray file; batch 1 complete', () => {
  const m = SCENE_MANIFEST, keys = m.pictures.map(p => `${p.slug}|${p.state}`);
  assert.equal(new Set(keys).size, keys.length, 'one picture per slug and state');
  for (const p of m.pictures) {
    const f = `${DIR}/${p.file}`;
    assert.ok(existsSync(f), f);
    assert.equal(statSync(f).size, p.bytes, `${p.file} bytes`);
    assert.equal(p.w, 1024, `${p.file} width`); assert.ok(p.h > 500 && p.h < 620, `${p.file} height ${p.h}`);
    assert.ok(p.bytes >= 60 * 1024 && p.bytes <= 260 * 1024, `${p.file} is ${Math.round(p.bytes / 1024)} KB`);
    assert.equal(p.file, `${p.slug}-${p.state}.webp`);
    assert.match(p.state, /^(rundown|upgraded|one|tier[1-5]|[a-z0-9-]+)$/);
    const head = readFileSync(f).subarray(0, 12).toString('latin1'); assert.ok(head.startsWith('RIFF') && head.endsWith('WEBP'), `${p.file} is a WebP`);
  }
  const files = readdirSync(DIR).filter(f => f.endsWith('.webp'));
  assert.deepEqual(files.sort(), m.pictures.map(p => p.file).sort(), 'every WebP in the folder is listed');
  for (const s of BATCH1) assert.ok(m.pictures.some(p => p.slug === s && p.state === 'rundown'), `${s} run-down`);
  for (const s of BATCH1.filter(s => s !== 'home-cottage')) assert.ok(m.pictures.some(p => p.slug === s && p.state === 'upgraded'), `${s} upgraded`);
  const total = m.pictures.reduce((a, p) => a + p.bytes, 0);
  assert.ok(total < 4.5 * 1024 * 1024, `the scenes add ${(total / 1048576).toFixed(2)} MB`);
});

test('pickPicture: the first wanted state the art has; hard times never borrow the good-times picture', () => {
  const m: SceneManifest = { v: 1, pictures: [{ slug: 'a', state: 'rundown', file: 'a-rundown.webp', w: 1, h: 1, bytes: 1 }, { slug: 'b', state: 'upgraded', file: 'b-upgraded.webp', w: 1, h: 1, bytes: 1 }, { slug: 'c', state: 'tier2', file: 'c-tier2.webp', w: 1, h: 1, bytes: 1 }] };
  assert.equal(pickPicture('a', GOOD_TIMES, m)?.file, 'a-rundown.webp', 'good times fall back to the run-down picture');
  assert.equal(pickPicture('b', HARD_TIMES, m), null, 'hard times never show the upgraded picture');
  assert.equal(pickPicture('b', GOOD_TIMES, m)?.file, 'b-upgraded.webp');
  assert.equal(pickPicture('zz', GOOD_TIMES, m), null, 'no art: nothing');
  assert.deepEqual(clubWant(3), ['tier3', 'tier2', 'tier1', 'rundown', 'one']);
  assert.deepEqual(clubWant(5).slice(0, 5), ['tier5', 'tier4', 'tier3', 'tier2', 'tier1']); assert.deepEqual(clubWant(5).slice(5), [...GOOD_TIMES]);
  assert.equal(pickPicture('c', clubWant(4), m)?.state, 'tier2', 'a tier with no picture shows the nearest tier below');
  assert.equal(pickPicture('c', clubWant(1), m), null, 'never a tier above');
});

const facts = (o: Partial<RangeSceneFacts> = {}): RangeSceneFacts => ({
  owned: [], putting: false, home: 0, homeName: 'Caravan', homeNext: { name: 'Cottage', at: 100000 }, lifetime: 0, golfers: 12, playing: 3, queue: 1, lost: 2, bays: 4, price: 6,
  seasonTakings: 1234, seasonBuckets: 200, shopExtra: 0, green: { today: 0, golfers: 0, takings: 0 }, ...o,
});
const shown = (f: RangeSceneFacts) => Object.fromEntries(rangeScene(f)!.views.map(v => [v.id, `${v.slug}:${v.state}`]));

test('the range: run-down at the start, each view upgraded once its upgrades are built (all of them)', () => {
  assert.deepEqual(shown(facts()), { road: 'range-road:rundown', bays: 'hitting-bays:rundown', shop: 'pro-shop-inside:rundown', green: 'practice-green:rundown', home: 'home-caravan:rundown' });
  const c = rangeScene(facts())!;
  assert.equal(c.views.find(v => v.id === 'shop')!.label, 'The shack, inside');
  assert.equal(c.views.find(v => v.id === 'home')!.label, 'Your caravan');
  assert.deepEqual(c.views.find(v => v.id === 'green')!.tiles.map(t => t.value), ['Not built']);
  for (const v of c.views) assert.equal(v.line, LINES[v.slug]!.rundown, `${v.id}'s line`);
  // part of the road's upgrades: still run-down; all three: upgraded
  assert.equal(shown(facts({ owned: ['grass', 'pave'] })).road, 'range-road:rundown');
  assert.equal(shown(facts({ owned: [...RANGE_GOOD_WHEN.road] })).road, 'range-road:upgraded');
  assert.equal(shown(facts({ owned: ['covered'] })).bays, 'hitting-bays:rundown', 'the bays need their turf too');
  assert.equal(shown(facts({ owned: ['covered', 'teeturf'] })).bays, 'hitting-bays:upgraded');
  const pro = rangeScene(facts({ owned: ['proshop'], shopExtra: 2 }))!.views.find(v => v.id === 'shop')!;
  assert.equal(pro.state, 'upgraded'); assert.equal(pro.label, 'The pro shop'); assert.equal(pro.line, LINES['pro-shop-inside']!.upgraded);
  const green = rangeScene(facts({ putting: true, green: { today: 4, golfers: 90, takings: 180 } }))!.views.find(v => v.id === 'green')!;
  assert.equal(green.state, 'upgraded'); assert.deepEqual(green.tiles.map(t => t.value), ['4', '90', '$180']);
  // the card opens on the view asked for, else the first
  assert.equal(rangeScene(facts(), 'home')!.at, 4); assert.equal(rangeScene(facts(), 'nope')!.at, 0);
});

test('your home: the caravan, the cottage, the farmhouse by stage; each smartens half way to the next; the cottage keeps its run-down picture until its upgraded one lands', () => {
  assert.equal(shown(facts({ lifetime: HOME_SMART_AT[0] - 1 })).home, 'home-caravan:rundown');
  assert.equal(shown(facts({ lifetime: HOME_SMART_AT[0] })).home, 'home-caravan:upgraded');
  const cottage = rangeScene(facts({ home: 1, homeName: 'Cottage', lifetime: 300000 }))!.views.find(v => v.id === 'home')!;
  assert.equal(cottage.slug, 'home-cottage'); assert.equal(cottage.state, 'rundown', 'no upgraded cottage yet: its run-down picture'); assert.equal(cottage.good, false);
  assert.equal(cottage.label, 'Your cottage');
  assert.equal(shown(facts({ home: 2, homeName: 'House', lifetime: 500000 })).home, 'home-farmhouse:rundown');
  assert.equal(shown(facts({ home: 2, homeName: 'House', lifetime: HOME_SMART_AT[2] })).home, 'home-farmhouse:upgraded');
  assert.deepEqual(HOME_SLUGS, ['home-caravan', 'home-cottage', 'home-farmhouse']);
  assert.equal(rangeGood('home', { owned: [], putting: false, home: 1, lifetime: HOME_SMART_AT[1] }), true);
});

test('a range piece opens its own view; the events: a picture that turns is news, a good-times picture still to make is not', () => {
  for (const [k, v] of [['caravan', 'home'], ['house', 'home'], ['chair1', 'home'], ['bed3', 'home'], ['shop', 'shop'], ['dispenser', 'shop'], ['roof2', 'bays'], ['light0', 'bays'], ['deck', 'bays'], ['putting-clip', 'green'], ['sign', 'road'], ['carpark', 'road'], ['flag1', 'road']] as const) assert.equal(rangeViewOfKey(k), v, k);
  const a = { owned: [] as string[], putting: false, home: 0 as const, lifetime: 0 };
  const k0 = rangeSceneKeys(a), k1 = rangeSceneKeys({ ...a, owned: ['proshop'] });
  assert.notEqual(k0.shop, k1.shop); assert.equal(k0.road, k1.road);
  assert.equal(rangeNews('shop', { ...a, owned: ['proshop'] }), 'The shack is a pro shop now');
  const c0 = rangeSceneKeys({ ...a, home: 1, lifetime: 100000 }), c1 = rangeSceneKeys({ ...a, home: 1, lifetime: 300000 });
  assert.equal(c0.home, c1.home, 'the cottage smartening shows the same picture: no news');
  assert.notEqual(rangeSceneKeys(a).home, c0.home, 'a move is news');
  assert.ok(sceneArt('range'));
});

test('the town: a video store is any lot drawn as world:video or world:video_rental (a view or a variation too); its picture follows the lot', () => {
  for (const id of ['world:video', 'world:video_rental', 'variation:world-video_rental-cc8c504f-plain:1', 'variation:world-video-0a1b2c3d-plain-corner:1']) assert.equal(lotPlaceOf(id)?.id, 'video', id);
  assert.equal(lotPlaceOf('world:diner')?.id, 'diner'); assert.equal(lotPlaceOf('variation:world-diner-c9878d46-plain:1')?.id, 'diner');
  assert.equal(lotPlaceOf('world:house_4'), null); assert.equal(lotPlaceOf('variation:world-house_0-51fa4b80-plain:1'), null);
  const video = LOT_PLACES.find(p => p.id === 'video')!, f = { jobs: 3, town: 'Maple Falls', pop: 1200 };
  assert.ok(lotPlaceHasArt(video));
  const built = lotScene(video, { level: 2, decline: 0, ...f })!;
  assert.deepEqual(built.views.map(v => `${v.id}:${v.slug}:${v.state}`), ['outside:video-store-outside:rundown', 'inside:video-store-inside:rundown'], 'built, not upgraded: hard times');
  assert.equal(built.views[0]!.line, LINES['video-store-outside']!.rundown);
  assert.deepEqual(built.views[0]!.tiles.map(t => t.value), [CONDITION[0], 'Getting by', '3', '1,200']);
  assert.deepEqual(lotScene(video, { level: 3, decline: 0, ...f })!.views.map(v => v.state), ['upgraded', 'upgraded'], 'upgraded and in good repair: good times');
  assert.deepEqual(lotScene(video, { level: 3, decline: 1, ...f })!.views.map(v => v.state), ['rundown', 'rundown'], 'declining: hard times again');
  assert.equal(lotScene(video, { level: 1, decline: 0, ...f }), null, 'still building: nothing to see');
  assert.equal(lotScene(video, { level: 2, decline: 0, ...f }, 'inside')!.at, 1);
  const diner = LOT_PLACES.find(p => p.id === 'diner')!;
  assert.equal(lotPlaceHasArt(diner), false); assert.equal(lotScene(diner, { level: 3, decline: 0, ...f }), null, 'no art: nothing new');
});

test('a farm: the farmhouse kitchen in the town\'s fortunes, in a farm\'s words; places and the clubhouse with no art open nothing', () => {
  const lots = (up: number, down: number, plain: number) => [...Array(up).fill({ level: 3, decline: 0 }), ...Array(down).fill({ level: 2, decline: 2 }), ...Array(plain).fill({ level: 2, decline: 0 }), { level: 1, decline: 0 }];
  assert.deepEqual(townFortune(lots(2, 1, 4)), { built: 7, up: 2, down: 1, good: false }, 'under 10 buildings: hard times');
  assert.equal(townFortune(lots(5, 2, 10)).good, true); assert.equal(townFortune(lots(3, 2, 10)).good, false, 'under a quarter upgraded');
  assert.equal(townFortune(lots(5, 6, 10)).good, false, 'more declining than upgraded');
  const hard = farmScene({ ha: 12.3, town: 'Maple Falls', fortune: townFortune(lots(1, 3, 10)) })!, good = farmScene({ ha: 12.3, town: 'Maple Falls', fortune: townFortune(lots(6, 1, 10)) })!;
  assert.equal(hard.views[0]!.pic.file, 'home-farmhouse-rundown.webp'); assert.equal(hard.views[0]!.line, FARM_LINES.rundown);
  assert.equal(good.views[0]!.pic.file, 'home-farmhouse-upgraded.webp'); assert.equal(good.views[0]!.line, FARM_LINES.upgraded);
  assert.equal(good.views[0]!.tiles[0]!.value, '12.3 ha');
  assert.equal(clubScene({ tier: 2, members: 10, visitors: 5, fees: 100, rounds: 30 }), null, 'no clubhouse art yet');
  assert.equal(sceneArt('club'), false); assert.equal(placeHasArt('drive-in'), false);
});

test('the card: the picture, its state, the tabs (wrapping, never a sideways scrollbar), the line and the numbers', () => {
  const html = renderToStaticMarkup(createElement(SceneCard, { view: rangeScene(facts({ owned: ['proshop'] }), 'shop')!, onView: () => {}, onClose: () => {}, padRight: '23rem' }));
  assert.match(html, /data-testid="scene-card" data-scene="pro-shop-inside" data-state="upgraded"/);
  assert.match(html, /Your driving range/); assert.match(html, /The pro shop/); assert.match(html, /data-testid="scene-state"[^>]*>Upgraded/);
  for (const t of ['road', 'bays', 'shop', 'green', 'home']) assert.ok(html.includes(`data-testid="scene-tab-${t}"`), t);
  assert.match(html, /flex flex-wrap gap-1\.5/); assert.doesNotMatch(html, /overflow-x-(auto|scroll)/); assert.match(html, /overflow-x-hidden/);
  assert.ok(html.includes(LINES['pro-shop-inside']!.upgraded.replace(/'/g, '&#x27;')), 'the line');
  assert.match(html, /data-testid="scene-numbers"/); assert.match(html, /Shop spend/);
  assert.match(html, /padding-right:23rem/); assert.match(html, /min\(760px, 100%/);
  assert.match(html, /aspect-ratio:1024 \/ 572/);
  // under node there is no picture URL: no <img>, never a placeholder picture
  assert.doesNotMatch(html, /<img[^>]*scene-picture/);
});

test('the wiring: the map click, Esc and a press on the map; the cards\' Scene buttons; the guide; the toasts', () => {
  const eng = readFileSync('src/game/engine.ts', 'utf8'), app = readFileSync('src/App.tsx', 'utf8');
  assert.match(eng, /if \(this\.sceneRef\) this\.closeScene\(\); \/\/ T242/);
  assert.match(eng, /if \(e\.key === 'Escape' && this\.sceneRef\) \{ this\.closeScene\(\); return; \}/);
  assert.match(eng, /\{ this\.openRangeCard\(true\); this\.inspectScene\(p\); return; \}/);
  assert.match(eng, /\{ this\.openClubCard\(true\); this\.inspectScene\(null, true\); return; \}/);
  assert.match(eng, /if \(p\) \{ this\.selected = p; this\.inspectScene\(p\); this\.emit\(\); return; \}/);
  assert.match(eng, /this\.sceneNewsCheck\(\); \/\/ T242/);
  assert.match(eng, /'The guide is done: your range is built\. Grow it, and the course, your way', 'good', this\.sceneArt\('range'\)/);
  assert.match(app, /<SceneCard view=\{sc\}/);
  assert.match(app, /<RangeCard view=\{rc\}[^\n]*onScene=\{game\.sceneArt\('range'\)/);
  assert.match(app, /<ClubhouseCard view=\{cc\}[^\n]*onScene=\{game\.sceneArt\('club'\)/);
  assert.match(app, /<PlaceCard view=\{pc\}[^\n]*onScene=\{game\.placeSceneArt\(pc\.id\)/);
  assert.match(app, /<RangeGuideCard view=\{gv\}[^\n]*onScene=\{game\.sceneArt\('range'\)/);
  assert.match(app, /data-testid="toast-scene"/);
  // the picture card's view is read only while it is open (sceneCard returns at once when shut)
  assert.match(eng, /sceneCard\(\): SceneCardView \| null \{\n {4}const r = this\.sceneRef; if \(!r\) return null;/);
});
