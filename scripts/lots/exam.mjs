// The lot generator's exam sheet (T161, #379; P25 #348 step 6): the fixed 50 lots of src/game/lots/lot-exam.ts (sizes, the four axis road angles,
// the three states), each composed as the game composes it with a model, shot in the lot lab (?lotlab&dev&exam: src/game/dev/lot-exam.ts) and
// laid out as one contact sheet with the training measures in its head. Run it after each training session to see the progress.
//   npm run lots:exam -- [--url http://localhost:5174] [--model learned|shipped|<version>[,...]] [--out output/lot-exam] [--rows n]
// --model: learned (default: the lab's samples now, the model Ship model would ship), shipped (the latest shipped), a version; a comma list
// makes a sheet for each (e.g. 1,2,learned to compare). Needs the dev server running (npm run dev) and Microsoft Edge. Nothing is saved but the
// sheets: every dev save the page might make is answered here and never reaches the server. --rows n: the first n rows only (a quick look).
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const URL_ = opt('url', 'http://localhost:5174').replace(/\/$/, ''), MODELS = opt('model', 'learned').split(',').filter(Boolean), OUT = opt('out', 'output/lot-exam'), ROWS = Number(opt('rows', '0')) || Infinity;
const STATE_NAMES = { built: 'Built', upgraded: 'Upgraded', declined: 'Decrepit' }, KINDS = ['tree', 'bush', 'flowerbed', 'prop', 'car', 'decal'];
const sleep = ms => new Promise(r => setTimeout(r, ms));
/** the sheet's scale of a shot */
const SCALE = 0.6;
/** the convex hull of points (monotone chain), counter-clockwise */
function convexHull(ps) {
  const p = [...ps].sort((a, b) => a[0] - b[0] || a[1] - b[1]), cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], hi = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.reverse()) { while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], q) <= 0) hi.pop(); hi.push(q); }
  return [...lo.slice(0, -1), ...hi.slice(0, -1)];
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '').replace(/^(\d{8})/, '$1-');

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
const errors = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(String(e).slice(0, 300)));
  // no dev save ever reaches the server (the presets, the samples, the models, the allocations are the owner's)
  await page.route('**/__dev/**', r => (r.request().method() === 'GET' ? r.continue() : r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })));
  await page.goto(`${URL_}/?lotlab&dev&exam`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction(() => !!window.__lotExam && [...document.querySelectorAll('button')].some(b => b.textContent === 'Generate ▶' && b.offsetParent), null, { timeout: 240000 });
  await sleep(3000);
  for (const which of MODELS) {
    const label = await page.evaluate(m => window.__lotExam.model(m), which);
    const stats = await page.evaluate(() => window.__lotExam.stats());
    const lots = await page.evaluate(() => window.__lotExam.lots()), rows = await page.evaluate(() => window.__lotExam.rows());
    const shots = new Map();
    console.log(`model ${label}: ${lots.length} lots in ${rows.length} rows`);
    for (let k = 0; k < Math.min(rows.length, ROWS); k++) {
      const ids = await page.evaluate(n => window.__lotExam.stage(n), k);
      await sleep(k === 0 ? 9000 : 6000);
      for (const i of ids) {
        const rect = await page.evaluate(n => window.__lotExam.focus(n), i);
        if (!rect) continue;
        await sleep(1200);
        const png = await page.screenshot({ clip: { x: rect.x, y: rect.y, width: rect.w, height: rect.h } });
        const counts = await page.evaluate(n => window.__lotExam.counts(n), i);
        shots.set(i, { png: png.toString('base64'), counts, w: rect.w, h: rect.h, poly: rect.poly, up: rect.up });
      }
      console.log(`  row ${k + 1}/${rows.length}: lots ${ids.join(', ')}`);
    }
    // the sheet: the head (the model, the measures, each state's mean items) and the lots by state, small to large
    const per = {};
    for (const l of lots) { const c = shots.get(l.i)?.counts; if (!c) continue; const a = (per[l.state] ??= { n: 0, items: 0, pairs: 0, k: Object.fromEntries(KINDS.map(x => [x, 0])) }); a.n++; a.items += c.items; a.pairs += c.pairs; for (const x of KINDS) a.k[x] += c.kinds[x]; }
    const mean = (v, n) => (n ? (v / n).toFixed(1) : '-');
    const head = `<h1>Lot generator exam &middot; model ${esc(label)} &middot; ${new Date().toISOString().slice(0, 16).replace('T', ' ')}</h1>
<p>Samples ${stats.total} (wizard ${stats.bySrc.wizard}, from presets ${stats.bySrc.preset}, gallery ${stats.bySrc.gallery}) &middot; wizard keep share: first ten lots ${(100 * stats.first).toFixed(0)}%, last ten ${(100 * stats.last).toFixed(0)}% (${stats.wizardLots} lots) &middot; gallery: ${stats.judged ? `${(100 * stats.up).toFixed(0)}% of ${stats.judged} judged Good` : 'none judged'} &middot; latest shipped v${stats.latest}</p>
<p>${Object.entries(per).map(([s, a]) => `<b>${STATE_NAMES[s]}</b> per lot: ${mean(a.items, a.n)} items (${KINDS.map(x => `${x}s ${mean(a.k[x], a.n)}`).join(', ')}), pairs ${mean(a.pairs, a.n)}`).join(' &nbsp;|&nbsp; ')}</p>`;
    // a lot's shot with all but the lot dimmed (its ground and verge, and the room over it its art stands up into) and its outline
    const cell = l => {
      const s = shots.get(l.i); if (!s) return '';
      const hull = convexHull([...s.poly, ...s.poly.map(([x, y]) => [x, y - s.up])]), pts = q => q.map(p => p.join(',')).join(' ');
      const svg = `<svg viewBox="0 0 ${s.w} ${s.h}" width="${Math.round(s.w * SCALE)}" height="${Math.round(s.h * SCALE)}"><image href="data:image/png;base64,${s.png}" width="${s.w}" height="${s.h}"/><path fill="rgba(6,9,16,.6)" fill-rule="evenodd" d="M0 0H${s.w}V${s.h}H0Z M${hull.map(p => p.join(' ')).join('L')}Z"/><polygon points="${pts(s.poly)}" fill="none" stroke="#fbbf24" stroke-width="2"/></svg>`;
      return `<figure>${svg}<figcaption style="max-width:${Math.round(s.w * SCALE)}px"><b>#${l.i}</b> road ${l.road} &middot; ${l.w}&times;${l.d} &middot; ${s.counts?.items ?? 0} items, ${s.counts?.pairs ?? 0} pairs<br><span>${esc(l.preset)}</span></figcaption></figure>`;
    };
    const body = ['built', 'upgraded', 'declined'].map(s => `<h2>${STATE_NAMES[s]}</h2><div class="g">${lots.filter(l => l.state === s).sort((a, b) => a.w * a.d - b.w * b.d || a.i - b.i).map(cell).join('')}</div>`).join('');
    const sheet = await ctx.newPage();
    await sheet.setViewportSize({ width: 2200, height: 900 });
    await sheet.setContent(`<html><body style="margin:14px;background:#0c121c;color:#e5e7eb;font:13px system-ui,sans-serif"><style>h1{font-size:20px;margin:0 0 6px}h2{font-size:16px;margin:14px 0 6px;color:#fbbf24}p{margin:3px 0;color:#cbd5e1}.g{display:flex;flex-wrap:wrap;gap:8px}figure{margin:0;background:#111827;border:1px solid #1f2937;border-radius:6px;padding:4px}figure svg{display:block}figcaption{font-size:11px;padding:3px 2px 0;color:#d1d5db;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}figcaption span{color:#6b7280}</style>${head}${body}</body></html>`);
    await sleep(500);
    const base = path.join(OUT, `exam-${String(label).split(' ')[0].replace(/[^a-z0-9]+/gi, '')}-${stamp}`);
    await sheet.screenshot({ path: `${base}.png`, fullPage: true });
    fs.writeFileSync(`${base}.json`, JSON.stringify({ model: label, at: new Date().toISOString(), stats, perState: per, lots: lots.map(l => ({ ...l, ...(shots.get(l.i)?.counts ?? {}) })) }, null, 1));
    await sheet.close();
    console.log(`  sheet: ${base}.png`);
  }
  await page.evaluate(() => window.__lotExam.done());
} catch (e) { console.log('FAILED', String(e).slice(0, 600)); process.exitCode = 1; }
finally { await browser.close(); }
console.log(`page errors: ${errors.length}`); for (const e of errors.slice(0, 8)) console.log(' ', e);
