// T356 (#998) with T358 (#1003): a DOWNLOADED course on the Course > Place a real course menu, as the game draws it (a headless Edge on the dev server, the old start with
// its stamped town: ?start=town&seed=7&stamp=1). Wingate Park's Overpass answer (tests/fixtures/osm/overpass-wingatepark.json, a real answer with no hole lines) is put in
// the browser's library (IndexedDB capital-empire-osm, as the new-game card's search keeps it); the Course flyout then lists it under "Downloaded courses" beside the three
// featured ones, a click takes it in hand (read back from the library and converted as a new game would), and Place it lays it: the game saves it with its library id,
// `placed`, and the note that its holes were worked out from the fairways. Then the new-game card (a fresh game): the course opened from Downloaded courses previews with
// "Place it in my map" beside "Build this course"; Place hides the card and takes the course in hand over this game's map, Cancel brings the card back as it was, and
// Place it lays the course there (the game's own map, no new game). Exits 1 on a failed check.
//   node scripts/dev/real-place-kept-shots.mjs --base http://localhost:5189/ --out E:/ClaudeTemp/T356 [--seed 7]
import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://localhost:5189/'), out = opt('out', 'E:/ClaudeTemp/T356'), seed = opt('seed', '7');
const ID = 'way/4261725', W = 1440, H = 900;
mkdirSync(out, { recursive: true });
let bad = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) bad++; };
const raw = readFileSync('tests/fixtures/osm/overpass-wingatepark.json', 'utf8');
const rec = { id: ID, name: 'Wingatepark Country Club', place: 'Pretoria, South Africa', credit: '© OpenStreetMap contributors', licence: 'ODbL 1.0', fetchedAt: '2026-11-08T10:00:00.000Z', server: 'https://overpass-api.de/api/interpreter', bytes: raw.length, holes: 3, par: 12, grade: 'partial' };
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
/** puts Wingate Park in the browser's library (IndexedDB capital-empire-osm), as the new-game card's search keeps a course it fetched */
const keepCourse = page => page.evaluate(async ([r, text]) => {
  const db = await new Promise((res, rej) => {
    const q = indexedDB.open('capital-empire-osm', 1);
    q.onupgradeneeded = () => { const d = q.result; if (!d.objectStoreNames.contains('courses')) d.createObjectStore('courses', { keyPath: 'id' }); for (const s of ['raw', 'answers']) if (!d.objectStoreNames.contains(s)) d.createObjectStore(s); };
    q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
  });
  await new Promise((res, rej) => { const t = db.transaction(['courses', 'raw'], 'readwrite'); t.objectStore('courses').put(r); t.objectStore('raw').put(text, r.id); t.oncomplete = () => res(); t.onerror = () => rej(t.error); });
  db.close();
}, [rec, raw]);
const shot = async (page, name) => { const f = join(out, `${name}.png`); await page.screenshot({ path: f }); console.log('  ' + f); };
try {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('[pageerror]', e.message); bad++; });
  page.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 300)); });
  await page.route('**/*', r => { const x = r.request(); return x.method() !== 'GET' && x.method() !== 'HEAD' ? r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }) : r.continue(); });
  await page.goto(`${base}?start=town&seed=${seed}&stamp=1&money=1`, { waitUntil: 'domcontentloaded', timeout: 240000 });
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 400000 });
  await page.evaluate(() => { const g = window.__game; g.prebake = () => {}; g.setSpeed(0); g.closeWho?.('Jack Burns', 2); g.closeWelcome?.(false); const p = g.golf.progress; if (p) { for (const k of ['who', 'welcome']) if (!p.seen.includes(k)) p.seen.push(k); if (p.tour) p.tour.off = true; } g.emit(); });

  // ---- the library: a course kept as the new-game card's search keeps it ----
  await keepCourse(page);

  // ---- the menu: Course > Place a real course > Featured, Downloaded courses ----
  await page.click('[data-rail="course"]'); await page.waitForTimeout(900);
  const group = page.locator('button[role=menuitem]', { hasText: 'Place a real course' }).first();
  check(await group.count() > 0, 'the Course flyout lists "Place a real course…"');
  await group.click(); await page.waitForTimeout(600);
  const col = await page.$$eval('[data-flyout-col]', es => es.map(e => e.innerText));
  const kids = col[col.length - 1] ?? '';
  console.log('  the submenu:', JSON.stringify(kids));
  // (the captions are drawn in capitals; a row's place, holes and par are its tooltip)
  check(/featured/i.test(kids) && /Rondebosch/.test(kids) && /Magnolia/.test(kids) && /Woodhill/.test(kids), 'the three featured courses are listed under "Featured"');
  check(/downloaded courses/i.test(kids) && /Wingatepark Country Club/.test(kids), 'the downloaded course is listed under "Downloaded courses"');
  check(kids.toLowerCase().indexOf('downloaded courses') > kids.indexOf('Woodhill'), 'after the featured ones');
  const tip = await page.getAttribute(`button[role=menuitem][data-key="real:${ID}"]`, 'data-tip');
  check(tip === 'Pretoria, South Africa · 3 holes · par 12', `with its place, holes and par (${tip})`);
  await shot(page, 'k0-downloaded-in-the-menu');

  // ---- taken in hand from the library ----
  await page.click(`button[role=menuitem][data-key="real:${ID}"]`);
  await page.waitForFunction(() => window.__game.real.active, null, { timeout: 120000 });
  const hand = await page.evaluate(() => { const r = window.__game.real, v = r.view(); return { id: r.id, name: v.name, holes: v.holes, derived: !!r.spec.derived, w: r.spec.w, h: r.spec.h, deg: r.deg }; });
  console.log('  in hand', JSON.stringify(hand));
  check(hand.id === ID && hand.name === 'Wingatepark Country Club' && hand.holes === 3, 'it is in hand, read back from the library: its name, its three holes');
  check(hand.derived, 'its holes are a guess (worked out from the fairways: the map has no hole lines)');

  // ---- a pose that may go (turned 15 degrees on until one does), the outline and the price ----
  const pose = await page.evaluate(() => { const g = window.__game; let best = null; for (let k = 0; k < 24 && !best; k++) { best = g.real.best(16); if (!best) g.real.turn(1); } if (best) { g.real.at = { x: best.x, y: best.y }; g.emit(); } return best ? { x: best.x, y: best.y, n: best.n, total: g.real.plan().total, deg: g.real.deg } : null; });
  console.log('  pose', JSON.stringify(pose));
  check(!!pose, 'a pose over the town where it may go');
  await page.evaluate(p => { const g = window.__game; g.camEase = null; g.lookAt(p.x, p.y, 0.12); g.emit(); }, pose);
  await page.waitForTimeout(1500);
  const verdict = await page.evaluate(() => document.querySelector('[data-testid=real-place-verdict]')?.textContent ?? '');
  console.log('  verdict:', verdict);
  check(/click to place/.test(verdict), 'the card says it may go there, with the price');
  await shot(page, 'k1-downloaded-in-hand');

  // ---- the pop-up, then Place it ----
  const before = await page.evaluate(() => ({ pins: window.__game.golf.pins.length, osm: window.__game.golf.osm?.id ?? null }));
  await page.evaluate(() => { window.__game.real.click(); });
  await page.waitForSelector('[data-testid=real-place-card]', { timeout: 10000 });
  console.log('  pop-up:', await page.$eval('[data-testid=real-place-text]', e => e.textContent));
  await shot(page, 'k2-downloaded-popup');
  await page.click('[data-testid=real-place-go]');
  await page.waitForFunction(() => !window.__game.real.active, null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  const placed = await page.evaluate(() => { const g = window.__game, G = g.golf; return { osm: G.osm, pins: G.pins.length, rects: (G.courseRects ?? []).length, active: g.real.active }; });
  console.log('  placed', JSON.stringify({ ...placed, osm: placed.osm && { id: placed.osm.id, name: placed.osm.name, holes: placed.osm.holes, placed: placed.osm.placed, derived: placed.osm.derived, turn: placed.osm.turn } }));
  check(placed.osm?.id === ID && placed.osm?.placed === true, `the game saves it under its library id (${before.osm ?? 'no course of its own'} before) with "placed": on its own map`);
  check(placed.osm?.derived === true, 'and that its holes were worked out from the fairways');
  check(placed.pins === 3 && placed.rects >= 1, `3 pins, ${placed.rects} rect(s) of land bought`);
  await page.evaluate(() => { const g = window.__game; g.setTool('course'); g.emit(); }); await page.waitForTimeout(800);
  check(await page.$('[data-testid=osm-note]') !== null, 'the Holes panel shows the course card note with the credit');
  check(await page.$('[data-testid=osm-derived]') !== null, 'and says the holes were worked out from the fairways (a guess)');
  await shot(page, 'k3-downloaded-placed');

  // ---- the new-game card: after the preview, "Place it in my map" (the placing mode over this game's map) beside "Build this course" (a new game); Cancel brings the card back ----
  const ctx2 = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 }), card = await ctx2.newPage();
  card.on('pageerror', e => { console.log('[pageerror]', e.message); bad++; });
  await card.route('**/*', r => { const x = r.request(); return x.method() !== 'GET' && x.method() !== 'HEAD' ? r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }) : r.continue(); });
  await card.goto(`${base}?seed=${seed}&money=1`, { waitUntil: 'domcontentloaded', timeout: 240000 });
  await card.waitForFunction(() => window.__game?.ready, null, { timeout: 400000 });
  await keepCourse(card);
  await card.waitForSelector('[data-testid=who-card]', { timeout: 120000 });
  await card.click('[data-testid=who-course-open]');
  await card.waitForSelector('[data-testid=find-home]', { timeout: 20000 });
  const dl = `[data-testid="dl-open-${ID.replace('/', '-')}"]`;
  await card.waitForSelector(dl, { timeout: 20000 });
  await card.click(dl);
  await card.waitForSelector('[data-testid=find-preview]', { timeout: 60000 });
  check(await card.isEnabled('[data-testid=find-build]') && await card.isEnabled('[data-testid=find-place]'), 'the preview offers Build this course and Place it in my map');
  check((await card.textContent('[data-testid=find-place]')) === 'Place it in my map' && /Place keeps this map/.test(await card.textContent('[data-testid=find-place-note]')), 'with a line that says what each does');
  await shot(card, 'n0-preview-with-place');
  const own0 = await card.evaluate(() => ({ osm: window.__game.golf.osm?.id ?? null, seed: window.__game.terrain.seed, pins: window.__game.golf.pins.length }));
  await card.click('[data-testid=find-place]');
  await card.waitForFunction(() => window.__game.real.active, null, { timeout: 60000 });
  await card.waitForTimeout(600);
  check(!(await card.isVisible('[data-testid=who-card]')) && !(await card.isVisible('[data-testid=find-card]')), 'the card is out of the way while the course is in hand');
  check(await card.isVisible('[data-testid=real-place-hud]'), 'the placing card is there instead (outline, price, turn, Cancel)');
  check((await card.evaluate(() => window.__game.real.id)) === ID, 'with the course the search found');
  await shot(card, 'n1-placing-over-the-new-game');
  // back out: Cancel puts it down, the card is back as it was (the picker on the same preview), nothing bought, no new game started
  await card.click('[data-testid=real-place-cancel-hud]');
  await card.waitForTimeout(500);
  const own1 = await card.evaluate(() => ({ osm: window.__game.golf.osm?.id ?? null, seed: window.__game.terrain.seed, pins: window.__game.golf.pins.length, active: window.__game.real.active, rects: (window.__game.golf.courseRects ?? []).length }));
  check(!own1.active && own1.osm === own0.osm && own1.seed === own0.seed && own1.pins === own0.pins && own1.rects === 0, 'Cancel: no course in hand, nothing placed, the same game (not a new one)');
  check(await card.isVisible('[data-testid=who-card]') && await card.isVisible('[data-testid=find-preview]'), 'and the card is back with the picker on the same preview');
  await shot(card, 'n2-back-to-the-card');
  // again, and this time place it
  await card.click('[data-testid=find-place]');
  await card.waitForFunction(() => window.__game.real.active, null, { timeout: 60000 });
  const pose2 = await card.evaluate(() => { const g = window.__game; let best = null; for (let k = 0; k < 24 && !best; k++) { best = g.real.best(16); if (!best) g.real.turn(1); } if (best) { g.real.at = { x: best.x, y: best.y }; g.emit(); } return best ? { x: best.x, y: best.y, n: best.n } : null; });
  check(!!pose2, `a pose over the new game's map where it may go (${JSON.stringify(pose2)})`);
  await card.evaluate(p => { const g = window.__game; g.camEase = null; g.lookAt(p.x, p.y, 0.12); g.real.click(); g.emit(); }, pose2);
  await card.waitForSelector('[data-testid=real-place-card]', { timeout: 10000 });
  await shot(card, 'n3-popup-over-the-new-game');
  await card.click('[data-testid=real-place-go]');
  await card.waitForFunction(() => !window.__game.real.active, null, { timeout: 60000 });
  await card.waitForTimeout(1200);
  const own2 = await card.evaluate(() => { const G = window.__game.golf; return { osm: G.osm ? { id: G.osm.id, placed: G.osm.placed, derived: G.osm.derived } : null, pins: G.pins.length, seed: window.__game.terrain.seed }; });
  check(own2.osm?.id === ID && own2.osm?.placed === true && own2.pins === 3 && own2.seed === own0.seed, `Place it: the course is on this game's map (seed ${own2.seed}), not on a new flat map`);
  check(await card.isVisible('[data-testid=who-card]') && !(await card.$('[data-testid=find-card]')), 'the card is back, the picker closed');
  check(/Wingatepark Country Club/.test(await card.textContent('[data-testid=who-course-open]')) && /from map data/.test(await card.textContent('[data-testid=who-course-open]')), 'and its Your course row names the placed course');
  await shot(card, 'n4-card-after-placing');
} finally { await browser.close(); }
console.log(bad ? `\n${bad} check(s) FAILED` : '\nall checks passed');
process.exit(bad ? 1 : 0);
