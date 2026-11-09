// T378 (#1034): the course names catalogue on the new-game card, in a headless Edge on a dev server, with the map servers MOCKED (no live request: the catalogue itself is the
// real one, public/catalogue/, served by the dev server). A player in South Africa (locale en-ZA) opens Your course > Change or find a course: the filter list loads its files
// (the player's country first), "wing" narrows it to the courses with a word starting "wing" (Wingatepark Country Club first, no map server asked while typing: the check
// counts the requests), the country button opens a flyout (South Africa first), choosing it narrows the list to that country, a row is picked and imports THAT course by its OSM
// id (no Nominatim request; one Overpass query for way(4261725)); the main Overpass server answers 502 and the card says which server it asks next and that the servers are slow
// today (the first mirror answers after 7 s, so the card shows the wait); then the preview, "Place it in my map", the outline over the new game's map, and the course placed.
//   node scripts/dev/osm-catalogue-shots.mjs --base http://localhost:5196/ --out E:/ClaudeTemp/T378/shots
// Needs a dev server (vite) on --base (and public/catalogue/ built: node scripts/dev/osm-course-catalogue.mjs --build-only). One headless Edge, closed when done. Exits 1 on a
// failed check. Run it from the repository's root.
import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://localhost:5196/'), out = opt('out', 'E:/ClaudeTemp/T378/shots'), W = 1440, H = 900, ID = 'way/4261725';
mkdirSync(out, { recursive: true });
let bad = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) bad++; };
const J = (o, status = 200, h = {}) => ({ status, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', ...h }, body: JSON.stringify(o) });
const wingate = JSON.parse(readFileSync('tests/fixtures/osm/overpass-wingatepark.json', 'utf8'));

const requests = [];                                        // every request the page made to a map server: { kind, host, at, body }
const T = id => `[data-testid="${id}"]`;
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
try {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, locale: 'en-ZA' });
  const files = [];                                          // the catalogue's own files the page loaded
  await ctx.route(/^https:\/\/(nominatim\.openstreetmap\.org|overpass[^/]*|maps\.mail\.ru)\//, async route => {
    const req = route.request(), url = new URL(req.url()), at = Date.now();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS' } });
    if (url.hostname.startsWith('nominatim')) { requests.push({ kind: 'nominatim', host: url.hostname, at, body: url.search }); return route.fulfill(J([])); }
    const body = decodeURIComponent((req.postData() ?? '').replace(/^data=/, '')); requests.push({ kind: 'overpass', host: url.hostname, at, body });
    if (url.hostname === 'overpass-api.de') return route.fulfill(J({}, 502));                        // the main server is down today
    if (url.hostname === 'maps.mail.ru') { await new Promise(r => setTimeout(r, 7000)); return route.fulfill(J(body.includes('way(4261725)') ? wingate : { elements: [] })); } // the mirror answers, slowly
    return route.fulfill(J({ elements: [], remark: 'runtime error: no fixture' }));
  });
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('[pageerror]', e.message); bad++; });
  page.on('response', r => { const u = r.url(); if (/\/catalogue\//.test(u)) files.push({ url: u, status: r.status() }); });
  const shot = async (_page, name) => { await page.waitForTimeout(400); const f = join(out, `${name}.png`); await page.screenshot({ path: f }); console.log('  ' + f); };

  console.log('== the picker, the catalogue and "wing"');
  await page.goto(`${base}?seed=7&money=1`, { waitUntil: 'domcontentloaded', timeout: 240000 });
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 400000 });
  await page.waitForSelector(T('who-card'), { timeout: 120000 });
  check(files.length === 0, 'the catalogue is not asked for before the picker opens (the game started without a request for it)');
  await page.click(T('who-course-open'));
  await page.waitForSelector(T('find-home'), { timeout: 20000 });
  await page.waitForSelector(T('cat-finder'), { timeout: 20000 });
  // the files load: the index, then every chunk (South Africa's first: the browser says en-ZA)
  await page.waitForFunction(() => /golf courses in \d+ countries/.test(document.querySelector('[data-testid=cat-status]')?.textContent ?? '') && !/loading/.test(document.querySelector('[data-testid=cat-status]')?.textContent ?? ''), null, { timeout: 120000 });
  const status = await page.$eval(T('cat-status'), e => e.textContent);
  console.log('  status:', status);
  const order = files.map(f => new URL(f.url).pathname.split('/').pop());
  console.log('  files, in the order they came:', order.join(' '));
  check(order[0] === 'index.json' && /^za\./.test(order[1] ?? ''), 'the index first, then the South African file (the player is in en-ZA)');
  check(files.every(f => f.status === 200), `${files.length} files, all answered 200`);
  check(requests.length === 0, 'no map server was asked for any of it');
  await shot(page, 'c0-picker-loaded');

  // typing narrows the list, locally
  const counts = [];
  for (const q of ['w', 'wi', 'win', 'wing']) {
    await page.fill(T('cat-input'), q);
    await page.waitForTimeout(150);
    counts.push(+((await page.$eval(T('cat-count'), e => e.textContent)).replace(/,/g, '').match(/^\s*(\d+)/)?.[1] ?? 0));
  }
  console.log('  matches while typing w, wi, win, wing:', counts.join(' > '));
  check(counts[0] > counts[1] && counts[1] >= counts[2] && counts[2] >= counts[3] && counts[3] >= 1, 'the list narrows as the player types');
  check(requests.length === 0, 'and no map server is asked while typing (the filter is local)');
  const rows = await page.$$eval('[data-testid^=cat-row-]', es => es.map(e => e.innerText.replace(/\s+/g, ' ').trim()));
  console.log('  the first rows:', JSON.stringify(rows.slice(0, 6)));
  check(rows[0].startsWith('Wingatepark Country Club') && /Pretoria, South Africa/.test(rows[0]), 'Wingatepark Country Club is the first row: its name, its town and its country');
  await shot(page, 'c1-filter-wing');

  // the country flyout: the player's own country first; South Africa narrows the list to its courses
  await page.click(T('cat-country'));
  await page.waitForSelector(T('cat-countries'), { timeout: 5000 });
  const countries = await page.$$eval('[data-testid^=cat-country-]', es => es.map(e => e.getAttribute('data-testid')).filter(t => t !== 'cat-country-all' && t !== 'cat-countries-close'));
  check(countries[0] === 'cat-country-ZA', `the flyout lists South Africa first, the player's own country (${countries.slice(0, 4).join(', ')})`);
  const conts = await page.$$eval('[data-testid^=cat-continent-]', es => es.map(e => e.getAttribute('data-testid')).filter(t => t !== 'cat-continent-countries'));
  check(conts.length >= 2 && conts.length <= 6, `and the continents (${conts.join(', ')}): two levels, not one long column of countries`);
  check(!(await page.$(T('cat-continent-countries'))), 'the countries of a continent are not shown until it is opened');
  await shot(page, 'c2a-country-flyout');
  await page.click(T('cat-continent-AF'));
  await page.waitForSelector(T('cat-continent-countries'), { timeout: 5000 });
  const africa = await page.$eval(T('cat-continent-countries'), e => e.innerText.replace(/\s+/g, ' ').trim());
  console.log('  Africa:', africa.slice(0, 120));
  check(/South Africa/.test(africa), 'a continent opens a second column of its countries (Africa: South Africa with its number of courses)');
  await shot(page, 'c2b-continent-opened');
  await page.click(T('cat-country-ZA-in-list'));
  await page.waitForTimeout(300);
  check(!(await page.$(T('cat-countries'))), 'choosing a country closes the flyout');
  const zaRows = await page.$$eval('[data-testid^=cat-row-]', es => es.map(e => e.innerText.replace(/\s+/g, ' ').trim()));
  console.log('  "wing" in South Africa:', JSON.stringify(zaRows));
  check(zaRows.length >= 1 && zaRows.length <= 3 && zaRows[0].startsWith('Wingatepark Country Club') && zaRows.every(r => /South Africa/.test(r)), '"wing" in South Africa is Wingatepark Country Club (and what else starts that way there)');
  check((await page.$eval(T('cat-country'), e => e.textContent)).startsWith('South Africa'), 'the country button names the country');
  await shot(page, 'c3-wing-in-south-africa');

  // no sideways scroll, a sticky count
  const box = await page.$eval(T('cat-list'), e => ({ sw: e.scrollWidth, cw: e.clientWidth, ox: getComputedStyle(e).overflowX, sticky: getComputedStyle(e.querySelector('[data-testid=cat-count]')).position }));
  check(box.sw <= box.cw + 1 && box.ox !== 'scroll' && box.ox !== 'auto' && box.sticky === 'sticky', `the list does not scroll sideways (${box.sw} <= ${box.cw}, overflow-x ${box.ox}) and its count is sticky`);
  const page_ = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  check(page_, 'and the page has no horizontal scrollbar');

  console.log('== a pick: the import goes by the OSM id');
  await page.click(T('cat-row-way-4261725'));
  await page.waitForSelector(T('find-working'), { timeout: 10000 });
  await page.waitForFunction(() => /asking maps\.mail\.ru/.test(document.querySelector('[data-testid=find-progress]')?.textContent ?? ''), null, { timeout: 20000 });
  await page.waitForSelector(T('find-slow'), { timeout: 5000 });
  const progress = await page.$eval(T('find-progress'), e => e.textContent), slow = await page.$eval(T('find-slow'), e => e.textContent);
  console.log('  progress:', progress, '|', slow);
  check(/overpass-api\.de was busy \(HTTP 502\): asking maps\.mail\.ru/.test(progress), 'the card says which server it asks next, and why');
  check(/The map servers are slow today: overpass-api\.de is being left alone for 1 min\./.test(slow), 'and that the map servers are slow today');
  await page.waitForSelector(T('find-waited'), { timeout: 8000 }).catch(() => undefined);
  check(!!(await page.$(T('find-waited'))), 'and counts the seconds of the wait');
  await shot(page, 'c4-asking-the-mirror');
  await page.waitForSelector(T('find-preview'), { timeout: 60000 });
  const over = requests.filter(r => r.kind === 'overpass');
  console.log('  map requests:', requests.map(r => `${r.kind}@${r.host}`).join(', '));
  check(requests.every(r => r.kind === 'overpass') && over.length === 2 && over[0].host === 'overpass-api.de' && over[1].host === 'maps.mail.ru', 'exactly two requests: the main server (502), then the mirror; no Nominatim at all (nothing is guessed from a name)');
  check(over.every(r => r.body.includes('way(4261725)') && r.body.includes('map_to_area')), 'both ask for way(4261725): the course by its OSM id');
  check((await page.$eval(T('find-name'), e => e.textContent)) === 'Wingatepark Country Club', 'the preview is Wingatepark Country Club');
  console.log('  preview:', await page.$eval(T('find-counts'), e => e.textContent), '|', await page.$eval(T('find-grade'), e => e.dataset.grade));
  await shot(page, 'c5-preview');

  console.log('== placed in the new game\'s map');
  const before = await page.evaluate(() => ({ osm: window.__game.golf.osm?.id ?? null, seed: window.__game.terrain.seed }));
  await page.click(T('find-land')); // (no elevation tiles asked for: this run mocks only the map servers)
  await page.click(T('find-place'));
  await page.waitForFunction(() => window.__game.real.active, null, { timeout: 60000 });
  await page.waitForTimeout(600);
  const pose = await page.evaluate(() => { const g = window.__game; let best = null; for (let k = 0; k < 24 && !best; k++) { best = g.real.best(16); if (!best) g.real.turn(1); } if (best) { g.real.at = { x: best.x, y: best.y }; g.emit(); } return best ? { x: best.x, y: best.y } : null; });
  check(!!pose, `a pose over the map where the imported course may go (${JSON.stringify(pose)})`);
  await page.evaluate(p => { const g = window.__game; g.camEase = null; g.lookAt(p.x, p.y, 0.12); g.emit(); }, pose);
  await page.waitForTimeout(1500);
  const verdict = await page.evaluate(() => document.querySelector('[data-testid=real-place-verdict]')?.textContent ?? '');
  console.log('  verdict:', verdict);
  check(await page.evaluate(() => window.__game.real.id) === ID, 'the course in hand is the one picked from the list');
  await shot(page, 'c6-placing-the-outline');
  await page.evaluate(() => { window.__game.real.click(); });
  await page.waitForSelector(T('real-place-card'), { timeout: 10000 });
  await page.click(T('real-place-go'));
  await page.waitForFunction(() => !window.__game.real.active, null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  const placed = await page.evaluate(() => { const G = window.__game.golf; return { osm: G.osm ? { id: G.osm.id, name: G.osm.name, placed: G.osm.placed } : null, pins: G.pins.length, seed: window.__game.terrain.seed }; });
  console.log('  placed:', JSON.stringify(placed));
  check(placed.osm?.id === ID && placed.osm?.placed === true && placed.seed === before.seed, 'the course is on this game\'s own map, not on a new one');
  await page.evaluate(() => { const g = window.__game; g.setTool('course'); g.emit(); });
  await page.waitForTimeout(800);
  await shot(page, 'c7-placed');
} finally { await browser.close(); }
console.log(bad ? `\n${bad} check(s) FAILED` : '\nall checks passed');
process.exit(bad ? 1 : 0);
