// T403 (#1081): the Lot review's check sheet. It opens the studio's Lot review (?lotreview) on a set, steps through its lots with the page's own Next key and keeps a picture of the page at
// each (the lot at the closest camera the review fits it to, the drawer, the card with the machine's readings), tiled in sheets, with the card's text of every lot in a JSON file.
//   node scripts/dev/lot-review-sheet.mjs --base http://127.0.0.1:5189/ --out E:/ClaudeTemp/T398/review-sheets --tag after [--source sample|town|estate] [--roads all|axis|45] [--seed 7] [--every 4] [--count 20] [--desert 1]
//     --every N: a picture of every N-th lot of the filter (the sample's lots of a road are the house types in the palette's order: every 4th takes five types of each road)
//     --count N: how many pictures in all, in sheets of 20 (4 across)
// Needs a dev server (vite) on --base. One headless Edge, closed when done. Nothing is saved: the review's POSTs (its file, scripts/assets/lot-review.json) are answered here and never reach the server.
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://127.0.0.1:5189/'), out = opt('out', 'output/lot-review-sheet'), tag = opt('tag', 'after'), source = opt('source', 'sample'), roads = opt('roads', '45');
const seed = opt('seed', '7'), every = Math.max(1, +opt('every', 4)), count = Math.max(1, +opt('count', 20)), desert = opt('desert', '1') === '1' ? 'on' : 'off', start = +opt('start', 0);
mkdirSync(out, { recursive: true });
const W = 1500, H = 950, CW = 600, CH = Math.round(H * CW / W), COLS = 4, ROWS = 5;
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const sleep = ms => new Promise(r => setTimeout(r, ms));
// (the heavy lock is shared by every agent: a run that hangs must fail, not hold it)
const watchdog = setTimeout(async () => { console.log(`[watchdog] over the ${opt('cap', '14')} minute cap: closing the browser`); try { await browser.close(); } catch { /* gone */ } process.exit(3); }, +opt('cap', '14') * 60000);
watchdog.unref();
const shots = [], texts = [];
try {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.route('**/*', r => { const x = r.request(); return x.method() !== 'GET' && x.method() !== 'HEAD' ? r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }) : r.continue(); });
  await page.addInitScript(() => { try { sessionStorage.removeItem('ce-lotreview'); } catch { /* none */ } });
  const url = `${base}?lotreview&source=${source}&seed=${seed}&roads=${roads}&desert=${desert}&lot=${start}`;
  console.log('open', url);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 360000 });
  const card = () => page.evaluate(() => document.querySelector('#ce-lotreview')?.innerText ?? '');
  await page.waitForFunction(() => /LOT \d+ \/ \d+/.test(document.querySelector('#ce-lotreview')?.innerText ?? ''), null, { timeout: 360000, polling: 500 });
  const settle = async () => {
    await sleep(600);
    await page.evaluate(() => { window.__calm = 0; });
    await page.waitForFunction(() => { const g = window.__game; if (!g) return true; window.__calm = g.ground?.busy === 0 && g.lotQueue?.size === 0 ? (window.__calm ?? 0) + 1 : 0; return window.__calm > 12; }, null, { timeout: 60000, polling: 50 }).catch(() => console.log('  (settle timed out)'));
    await sleep(300);
  };
  await settle();
  for (let n = 0; n < count; n++) {
    const text = await card(), head = (text.match(/LOT \d+ \/ \d+/) ?? ['?'])[0];
    const png = await page.screenshot({ type: 'png' });
    shots.push({ head, png }); texts.push({ n, head, text });
    console.log(`  shot ${n + 1}: ${head}`);
    for (let k = 0; k < every; k++) { await page.keyboard.press('ArrowRight'); await sleep(120); }
    await settle();
  }
  await ctx.close();
} finally { await browser.close(); }
// tiled sheets: COLS across, ROWS down, each shot at CW x CH with its lot's head line
for (let s = 0; s * COLS * ROWS < shots.length; s++) {
  const part = shots.slice(s * COLS * ROWS, (s + 1) * COLS * ROWS), rows = Math.ceil(part.length / COLS), comp = [];
  for (let i = 0; i < part.length; i++) {
    const buf = await sharp(part[i].png).resize(CW - 6, CH - 6, { fit: 'inside' }).png().toBuffer(), x = (i % COLS) * CW + 3, y = Math.floor(i / COLS) * CH + 3;
    comp.push({ input: buf, left: x, top: y });
  }
  const file = join(out, `lot-review-${source}-${roads}-${s + 1}-${tag}.png`);
  await sharp({ create: { width: COLS * CW, height: rows * CH, channels: 4, background: '#3b4252' } }).composite(comp).png().toFile(file); console.log(file);
}
if (opt('full', '0') === '1') for (let i = 0; i < shots.length; i++) writeFileSync(join(out, `lot-review-${source}-${roads}-lot${String(i + 1).padStart(2, '0')}-${tag}.png`), shots[i].png);
writeFileSync(join(out, `lot-review-${source}-${roads}-${tag}.json`), JSON.stringify(texts, null, 1));
