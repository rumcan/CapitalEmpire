// T358 (#1003): "Find a real course" on the new-game card, in a headless Edge on a dev server, with the map servers MOCKED (no live request: Nominatim and every Overpass
// server are answered here from the test fixtures and, where this PC has them, the answers the stage-1 script cached). It types into the search box, picks hits and
// candidates, reads the preview's grade, builds a course from it, and checks the rules of being polite as it goes (one Nominatim request a search, none for a search
// already made, at least 1.1 s between two, one Overpass query for the near look and one for an import, none for a course already kept, a "busy" message on a 429 and
// no request in the minute after it); then the library: kept in IndexedDB across a reload, Refresh is one request, Delete asks twice.
//   node scripts/dev/osm-search-shots.mjs --base http://localhost:5188/ --out E:/ClaudeTemp/T358
// Needs a dev server (vite) on --base. One headless Edge, closed when done. Exits 1 on a failed check. Run it from the repository's root.
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://localhost:5188/'), out = opt('out', 'E:/ClaudeTemp/T358'), W = 1440, H = 900;
mkdirSync(out, { recursive: true });
let bad = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) bad++; };
const fx = f => JSON.parse(readFileSync(join('tests/fixtures/osm', f), 'utf8'));
const RAW = 'E:/ClaudeTemp/T340/raw';
const cached = re => { const f = existsSync(RAW) ? readdirSync(RAW).find(n => re.test(n)) : null; return f ? JSON.parse(readFileSync(join(RAW, f), 'utf8')) : null; };
const ronde = cached(/^overpass-relation-10698368-.*\.json$/), woodhillRaw = cached(/^overpass-relation-5974410-.*\.json$/);
const J = (o, status = 200, h = {}) => ({ status, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', ...h }, body: JSON.stringify(o) });

// ---------------------------------------------------------------------------------------------------------------- the mocked map servers
const requests = [];                                        // every request the page made to a map server: { kind, at, q | body }
const nominatim = q => {
  if (q.includes('busy')) return J({}, 429, { 'retry-after': '60' });
  if (q.includes('wingatepark')) return J([{ osm_type: 'way', osm_id: 4261725, lat: '-25.829', lon: '28.262', category: 'leisure', type: 'golf_course', name: 'Wingatepark Country Club', display_name: 'Wingatepark Country Club, Wingate Park, Pretoria, City of Tshwane Metropolitan Municipality, Gauteng, South Africa', address: { suburb: 'Wingate Park', city: 'Pretoria', country: 'South Africa' } }]);
  if (q.includes('wingate')) return J(fx('nominatim-wingate.json'));
  if (q.includes('woodhill')) return J(fx('nominatim-woodhill.json'));
  if (q.includes('rondebosch')) return J(fx('nominatim-rondebosch.json'));
  if (q.includes('bloemfontein')) return J([{ osm_type: 'way', osm_id: 7792831, lat: '-29.1', lon: '26.2', category: 'leisure', type: 'golf_course', name: 'Bloemfontein Golf Club', display_name: 'Bloemfontein Golf Club, Rudolf Greyling Road, Ooseinde, Bloemfontein, Mangaung Metropolitan Municipality, Free State, South Africa', address: { city: 'Bloemfontein', country: 'South Africa' } }]);
  return J([]);
};
const nearWingate = { elements: [{ type: 'way', id: 4261725, tags: { leisure: 'golf_course', name: 'Wingatepark Country Club' }, bounds: { minlat: -25.8300, maxlat: -25.8280, minlon: 28.2600, maxlon: 28.2640 } }] };
const overpass = body => {
  if (body.includes('is_in(')) return J(body.includes('-25.820597') ? fx('near-woodhill.json') : body.includes('-25.825000') ? nearWingate : { elements: [] });
  if (body.includes('way(4261725)')) return J(fx('overpass-wingatepark.json'));
  if (body.includes('way(7792831)')) return J(fx('overpass-bloemfontein.json'));
  if (body.includes('relation(10698368)') && ronde) return J(ronde);
  if (body.includes('relation(5974410)') && woodhillRaw) return J(woodhillRaw);
  return J({ elements: [], remark: 'runtime error: no fixture for this query' });
};

const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await ctx.route(/^https:\/\/(nominatim\.openstreetmap\.org|overpass[^/]*)\//, route => {
  const req = route.request(), url = new URL(req.url()), at = Date.now();
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS' } });
  if (url.hostname.startsWith('nominatim')) { const q = (url.searchParams.get('q') ?? '').toLowerCase(); requests.push({ kind: 'nominatim', at, q, header: req.headers()['x-requested-with'] }); return route.fulfill(nominatim(q)); }
  const body = decodeURIComponent((req.postData() ?? '').replace(/^data=/, '')); requests.push({ kind: 'overpass', at, body, host: url.hostname });
  return route.fulfill(overpass(body));
});
const page = await ctx.newPage();
page.on('pageerror', e => { console.log('[pageerror]', e.message); bad++; });
const shot = async (name) => { await page.waitForTimeout(400); const f = join(out, `${name}.png`); await page.screenshot({ path: f }); console.log('  ' + f); };
const count = kind => requests.filter(r => r.kind === kind).length;
const T = id => `[data-testid="${id}"]`;
const type = async text => { await page.fill(T('find-input'), text); await page.press(T('find-input'), 'Enter'); };
/** back out of a preview, a hit list or a candidate list to the picker's home */
const home = async () => { for (let i = 0; i < 4 && !(await page.$(T('find-home'))); i++) { await page.click(T('find-back')); await page.waitForTimeout(150); } await page.waitForSelector(T('find-home'), { timeout: 10000 }); };
const openPicker = async () => {
  await page.waitForSelector(T('who-card'), { timeout: 120000 });
  if (!(await page.$(T('find-card')))) await page.click(T('who-course-open'));
  await page.waitForSelector(T('find-home'), { timeout: 20000 });
};

console.log('== the search, mocked');
await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 240000 });
await page.waitForFunction(() => window.__game?.ready, null, { timeout: 400000 });
await openPicker();
check(!!(await page.$(T('who-course-own'))) && !!(await page.$(T('who-course-rondebosch'))) && !!(await page.$(T('who-course-woodhill'))), 'the picker lists Build your own and the featured courses');
check((await page.$eval(T('find-downloaded-empty'), e => e.textContent)).includes('None yet'), 'Downloaded courses is empty at first');
await shot('1-picker-home');

// 1. "Wingate": Nominatim finds a suburb and a building but no golf course; the look near the best place offers the course
await type('Wingate');
await page.waitForSelector(T('find-near'), { timeout: 30000 });
check(count('nominatim') === 1 && count('overpass') === 1, `Wingate: one Nominatim request and one Overpass look (${count('nominatim')} and ${count('overpass')})`);
check(requests[0].header?.includes('CapitalEmpire'), `the request names the game in a header (${requests[0].header})`);
const near = await page.$eval(T('find-near'), e => e.textContent);
check(near.includes('Wingatepark Country Club') && near.includes('Wingate Park'), 'the candidates offer the Wingatepark Country Club, found near the Wingate Park suburb');
await shot('2-near-candidates');

// 2. pick it: ONE Overpass query for the course, the preview with its grade
await page.click(T('find-cand-way-4261725'));
await page.waitForSelector(T('find-preview'), { timeout: 60000 });
check(count('overpass') === 2 && requests[2].body.includes('way(4261725)') && requests[2].body.includes('map_to_area'), 'picking the course made exactly one more Overpass request, the course query');
const grade = await page.$eval(T('find-grade'), e => e.dataset.grade), counts = await page.$eval(T('find-counts'), e => e.textContent), summary = await page.$eval(T('find-summary'), e => e.textContent);
check(grade === 'partial', `the grade is Partial (${grade}): ${summary}`);
check(counts.startsWith('3 holes') && counts.includes('3 greens'), `the counts: ${counts}`);
check((await page.$eval(T('find-credit'), e => e.textContent)).includes('© OpenStreetMap contributors'), 'the preview carries the credit');
check(await page.$eval(T('find-canvas'), c => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data, seen = new Set(); for (let i = 0; i < d.length; i += 4 * 13) seen.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]); return seen.size >= 6; }), 'the preview canvas is drawn (background, the boundary, fairways, greens, the holes: six colours or more)');
await shot('3-preview-partial');

// 3. build it: a new game on it, kept as a downloaded course
await page.click(T('find-build'));
const built = await page.waitForFunction(() => window.__game.osmGame()?.id === 'way/4261725' && window.__game.ready, null, { timeout: 120000 }).then(() => true).catch(() => false);
check(built, 'Build this course starts a new game on the imported course');
const gstate = await page.evaluate(() => { const g = window.__game; return { osm: g.osmGame(), tees: g.golf.tees.length, pins: g.golf.pins.length, course: g.golf.course }; });
check(gstate.osm?.name === 'Wingatepark Country Club' && gstate.osm.derived === true && gstate.osm.holes === 3 && gstate.osm.credit === '© OpenStreetMap contributors' && gstate.pins === 3, `the game carries golf.osm for it (the map's own name, derived, 3 holes, the credit): ${JSON.stringify(gstate.osm)}`);
await page.waitForTimeout(2500);
await shot('4-game-on-the-imported-course');

// 4. the picker is on the new-game card: a new game brings it back (the gear menu's New game does the same); Downloaded courses lists the course, a search already made sends nothing
await page.evaluate(() => window.__game.newTown());
await openPicker();
const rows = await page.$$eval('[data-testid^=dl-row-]', els => els.map(e => e.textContent));
check(rows.length === 1 && rows[0].includes('Wingatepark Country Club') && rows[0].includes('3 holes'), `Downloaded courses lists the course: ${rows[0]}`);
check((await page.$eval('[data-testid^=dl-grade-]', e => e.dataset.grade)) === 'partial', 'its row carries the Partial grade');
await shot('5-downloaded-courses');
const n0 = requests.length;
await type('wingate');
await page.waitForSelector(T('find-near'), { timeout: 30000 });
check(requests.length === n0, 'the same search again (any case) sends nothing at all: the answers of Nominatim and of the near look were kept');
await home();

// 5. the kept course opens without a request; Refresh is exactly one
const n1 = requests.length;
await page.click('[data-testid^=dl-open-]');
await page.waitForSelector(T('find-preview'), { timeout: 30000 });
check(requests.length === n1, 'a kept course opens its preview with no request');
await home();
await page.click('[data-testid^=dl-refresh-]');
await page.waitForSelector(T('find-preview'), { timeout: 60000 });
check(requests.length === n1 + 1 && requests[n1].body.includes('way(4261725)'), 'Refresh is exactly one Overpass request');
await home();

// 6. a pasted link goes straight to the course (no Nominatim request, and it is already kept)
const n2 = requests.length;
await type('https://www.openstreetmap.org/way/4261725#map=17/-25.82/28.26');
await page.waitForSelector(T('find-preview'), { timeout: 30000 });
check(requests.length === n2, 'a pasted openstreetmap.org link to a kept course shows its preview with no request at all');
await home();

// 6b. the course's real name finds it by name (a hit); it is already kept, so picking it sends nothing
const n3 = requests.length;
await type('Wingatepark');
await page.waitForSelector(T('find-hits'), { timeout: 30000 });
check(requests.length === n3 + 1 && requests[n3].kind === 'nominatim', 'the real name of the course is one Nominatim request and lists it as a hit');
await page.click(T('find-hit-way-4261725'));
await page.waitForSelector(T('find-preview'), { timeout: 30000 });
check(requests.length === n3 + 1, 'and picking a hit that is already kept sends nothing');
await home();

// 7. Bloemfontein: a hit, a preview that says Outline only and cannot be built
await type('Bloemfontein');
await page.waitForSelector(T('find-hits'), { timeout: 30000 });
await shot('6-hits');
const gap = requests.filter(r => r.kind === 'nominatim'); const dt = gap[gap.length - 1].at - gap[gap.length - 2].at;
check(dt >= 1090, `two Nominatim requests are at least 1.1 s apart (${dt} ms)`);
await page.click(T('find-hit-way-7792831'));
await page.waitForSelector(T('find-preview'), { timeout: 60000 });
check((await page.$eval(T('find-grade'), e => e.dataset.grade)) === 'outline', 'Bloemfontein is Outline only');
check(await page.$eval(T('find-build'), b => b.disabled), 'and cannot be built (the button is disabled and says so)');
check((await page.$eval(T('find-summary'), e => e.textContent)).includes('only an outline'), 'the card says plainly that it is only an outline');
await shot('7-preview-outline-only');
await home();

// 8. the full ones (from the answers the script cached on this PC, when there)
if (ronde) {
  await type('Rondebosch');
  await page.waitForSelector(T('find-hits'), { timeout: 30000 });
  await page.click('[data-testid^=find-hit-]');
  await page.waitForSelector(T('find-preview'), { timeout: 60000 });
  check((await page.$eval(T('find-grade'), e => e.dataset.grade)) === 'full' && (await page.$eval(T('find-counts'), e => e.textContent)).startsWith('18 holes'), 'Rondebosch is Full: 18 holes');
  await shot('8-preview-full');
  await home();
} else console.log('  (no cached Rondebosch answer on this PC: the Full preview is skipped)');
if (woodhillRaw) {
  await type('Woodhill');
  await page.waitForSelector(T('find-near'), { timeout: 30000 });
  check((await page.$eval(T('find-near'), e => e.textContent)).includes('Woodhill Golf Estate'), 'Woodhill: no golf course by that name, the look near the club offers the estate that holds the golf features');
  await shot('9-near-woodhill-estate');
  await page.click(T('find-cand-relation-5974410'));
  await page.waitForSelector(T('find-preview'), { timeout: 90000 });
  check((await page.$eval(T('find-size'), e => e.textContent)).includes('scaled to 90%'), 'Woodhill: Full, and the size line says it is scaled to 90% to fit the map');
  await shot('10-preview-woodhill-scaled');
  await home();
}

// 9. a 429: the card says the servers are busy, and the next search sends nothing for the minute
await type('busy golf');
await page.waitForSelector(T('find-msg'), { timeout: 30000 });
const busy = await page.$eval(T('find-msg'), e => e.textContent), nb = requests.length;
check(busy.includes('map servers are busy') && busy.includes('a minute'), `a 429 says "${busy}"`);
await shot('11-servers-busy');
await type('another course');
await page.waitForTimeout(1500);
check(requests.length === nb && (await page.$eval(T('find-msg'), e => e.textContent)).includes('busy'), 'in the minute after a 429 a new search sends nothing and says busy again');

// 10. the library is IndexedDB: it is there after a reload (read from the database itself), Delete asks twice
const inDb = () => page.evaluate(() => new Promise(res => { const r = indexedDB.open('capital-empire-osm'); r.onsuccess = () => { const q = r.result.transaction('courses').objectStore('courses').getAll(); q.onsuccess = () => res(q.result.map(x => x.id)); }; r.onerror = () => res(null); }));
check((await inDb())?.includes('way/4261725'), `IndexedDB holds the downloaded course (${JSON.stringify(await inDb())})`);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__game?.ready, null, { timeout: 400000 });
check((await inDb())?.includes('way/4261725'), 'and still after a reload');
check(!!(await page.evaluate(() => window.__game.osmGame())), 'while the saved game, reloaded, is still on the imported course');
await page.goto(`${base}?osmcourse=rondebosch`, { waitUntil: 'domcontentloaded' }); // (a fixture-style game: no Who card here)
await page.waitForFunction(() => window.__game?.ready, null, { timeout: 400000 });
check((await inDb())?.includes('way/4261725'), 'and in another game');
await browser.newContext({ viewport: { width: W, height: H } }).then(async c2 => {
  await c2.route(/^https:\/\/(nominatim\.openstreetmap\.org|overpass[^/]*)\//, route => route.abort());
  const p2 = await c2.newPage();
  await p2.goto(base, { waitUntil: 'domcontentloaded', timeout: 240000 });
  await p2.waitForFunction(() => window.__game?.ready, null, { timeout: 400000 });
  await p2.waitForSelector(T('who-card'), { timeout: 60000 });
  await p2.click(T('who-course-open'));
  check(!!(await p2.waitForSelector(T('find-downloaded-empty'), { timeout: 20000 }).catch(() => null)), 'a fresh profile (another browser context) has no downloaded courses: the library is per browser');
  await c2.close();
});

await page.goto(base, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__game?.ready, null, { timeout: 400000 });
await page.evaluate(() => window.__game.newTown()); // (the saved game loads without the card: a new game brings it back)
await openPicker();
const nd = await page.$$eval('[data-testid^=dl-row-]', els => els.length);
await page.click('[data-testid^=dl-delete-]');
check((await page.$eval('[data-testid^=dl-delete-]', e => e.textContent)) === 'Sure?', 'Delete asks once before it deletes');
check(await page.$$eval('[data-testid^=dl-row-]', els => els.length) === nd, 'the first click deleted nothing');
await page.click('[data-testid^=dl-delete-]');
await page.waitForTimeout(500);
check(await page.$$eval('[data-testid^=dl-row-]', els => els.length) === nd - 1 && !(await inDb())?.includes('way/4261725'), 'the second click deletes the course from the library and from IndexedDB');
await shot('12-after-delete');

// the live servers were never asked: every request to a map server was answered by this script
check(requests.length > 0, `no live request: all ${requests.length} map-server requests were answered by the mocks (Nominatim ${count('nominatim')}, Overpass ${count('overpass')})`);
await browser.close();
console.log(bad ? `\n${bad} check(s) FAILED` : '\nall checks passed');
process.exit(bad ? 1 : 0);
