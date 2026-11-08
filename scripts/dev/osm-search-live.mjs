// T358 (#1003): ONE real search on the new-game card, with the real servers (no mock): the proof, in a real browser that enforces CORS, that the card's requests are accepted by Nominatim and
// Overpass. It makes exactly what a player's search makes: one Nominatim request (the course's name), then, on the pick, one Overpass query (the course). Run it by hand, once, never in a loop,
// never in a test: both servers are free public services. Prints each request to a map server with its status and time, and takes the card's screenshots.
//   node scripts/dev/osm-search-live.mjs --base http://localhost:5188/ --out E:/ClaudeTemp/T358 [--name "Wingatepark Country Club"]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://localhost:5188/'), out = opt('out', 'E:/ClaudeTemp/T358'), name = opt('name', 'Wingatepark Country Club');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }), page = await ctx.newPage();
const log = [];
page.on('request', r => { if (/nominatim|overpass/.test(r.url())) log.push({ method: r.method(), url: r.url().slice(0, 140), t0: Date.now(), headers: r.method() === 'GET' ? r.headers()['x-requested-with'] : undefined }); });
page.on('response', r => { const e = log.find(l => r.url().startsWith(l.url.slice(0, 100)) && l.status === undefined && l.method === r.request().method()); if (e) { e.status = r.status(); e.ms = Date.now() - e.t0; } });
page.on('requestfailed', r => { const e = log.find(l => l.method === r.method() && r.url().startsWith(l.url.slice(0, 100)) && l.status === undefined); if (e) { e.status = `failed: ${r.failure()?.errorText}`; e.ms = Date.now() - e.t0; } });
page.on('pageerror', e => console.log('[pageerror]', e.message));
page.on('console', m => { if (/CORS|blocked|Failed to fetch/i.test(m.text())) console.log('[console]', m.text().slice(0, 200)); });
const shot = async n => { await page.waitForTimeout(400); const f = join(out, `${n}.png`); await page.screenshot({ path: f }); console.log('  ' + f); };
const T = id => `[data-testid="${id}"]`;

await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 240000 });
await page.waitForFunction(() => window.__game?.ready, null, { timeout: 400000 });
await page.waitForSelector(T('who-card'), { timeout: 120000 });
await page.click(T('who-course-open'));
await page.fill(T('find-input'), name);
console.log(`searching the real Nominatim for "${name}" ...`);
await page.press(T('find-input'), 'Enter');
const first = await Promise.race([page.waitForSelector(T('find-hits'), { timeout: 60000 }).then(() => 'hits'), page.waitForSelector(T('find-near'), { timeout: 60000 }).then(() => 'near'), page.waitForSelector(T('find-msg'), { timeout: 60000 }).then(() => 'msg')]).catch(() => 'timeout');
console.log('  the card shows:', first, first === 'msg' ? await page.$eval(T('find-msg'), e => e.textContent) : '');
await shot('live-1-search-result');
if (first === 'hits') {
  const rows = await page.$$eval('[data-testid^=find-hit-]', els => els.map(e => e.textContent));
  console.log('  hits:', JSON.stringify(rows));
  console.log('picking the first hit: one real Overpass query ...');
  await page.click('[data-testid^=find-hit-]');
  const done = await Promise.race([page.waitForSelector(T('find-preview'), { timeout: 200000 }).then(() => 'preview'), page.waitForSelector(T('find-msg'), { timeout: 200000 }).then(() => 'msg')]).catch(() => 'timeout');
  console.log('  the card shows:', done, done === 'msg' ? await page.$eval(T('find-msg'), e => e.textContent) : '');
  if (done === 'preview') {
    console.log('  grade:', await page.$eval(T('find-grade'), e => e.dataset.grade), '| counts:', await page.$eval(T('find-counts'), e => e.textContent));
    console.log('  size:', await page.$eval(T('find-size'), e => e.textContent));
    await shot('live-2-preview');
  } else await shot('live-2-no-preview');
}
console.log('\nrequests to the map servers:');
for (const l of log) console.log(`  ${l.method} ${l.url}  -> ${l.status} in ${l.ms} ms${l.headers ? `  (X-Requested-With: ${l.headers})` : ''}`);
await browser.close();
