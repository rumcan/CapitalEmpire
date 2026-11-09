// T365 (#1020): each mowing pattern on a fairway, beside the owner's reference picture (E:/ClaudeTemp/tickets/mowing-reference.png: left, a real course's bold
// wide stripes with a crossed cut at the bottom; right, a broad two-tone split along the fairway's line), in the old nine (?start=town):
//   node scripts/dev/mow-pattern-shots.mjs --base http://localhost:5195/ --out E:/ClaudeTemp/T365 [--seed 7] [--zoom 14] [--only wide,halves] [--mow along]
// The longest fairway's own look (the panel's This hole: the old nine's holes have looks of their own, which the Course default does not reach) is given each
// pattern in turn through the Paint tool (the same calls the panel's chips make), and the camera sits on that fairway. Writes <out>/<pattern>.png (the picture, 1366 x 768 without the UI), <out>/<pattern>-ref.png (the reference | the shot, captioned),
// and <out>/all.png (every pattern in one sheet). --mow along: the fairway default as it was before T365 (the dev server's ?mow=along).
// Needs a dev server (vite) on --base. One headless Edge, closed when done; a fresh profile, no saves written.
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://localhost:5195/'), out = opt('out', 'E:/ClaudeTemp/T365'), seed = opt('seed', '7'), zoom = +opt('zoom', '14') / 100, mowFlag = opt('mow', ''), only = opt('only', '');
const REF = opt('ref', 'E:/ClaudeTemp/tickets/mowing-reference.png');
const W = 1366, H = 768;
/** the patterns shown: the id of the sheet, its caption and the look the Course default's fairway is given (undefined: none, the finish's own and its default pattern) */
const SHOTS = [
  ['default', 'The default (no pattern set: the finish\'s own)', undefined],
  ['along', 'Along the hole (the old default)', { pattern: 'along' }],
  ['wide', 'Wide stripes', { pattern: 'wide' }],
  ['crosscut', 'Crosscut, 90 degrees', { pattern: 'crosscut' }],
  ['crosscut45', 'Crosscut, 45 degrees', { pattern: 'crosscut', angle: 45 }],
  ['halves', 'Two-tone halves', { pattern: 'halves' }],
  ['collar', 'Collar ring', { pattern: 'collar' }],
].filter(([id]) => !only || only.split(',').includes(id));
mkdirSync(out, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const settle = async (page, ms = 900) => {
  await page.waitForTimeout(ms);
  await page.evaluate(() => { window.__calm = 0; });
  await page.waitForFunction(() => { const g = window.__game; window.__calm = g.ground.busy === 0 ? window.__calm + 1 : 0; return window.__calm > 20; }, null, { timeout: 90000, polling: 50 }).catch(() => console.log('  (settle timed out)'));
  await page.waitForTimeout(300);
};
const cap = (t, w) => Buffer.from(`<svg width="${w}" height="34"><rect width="100%" height="100%" fill="#0b1220"/><text x="12" y="23" font-family="Segoe UI, sans-serif" font-size="19" font-weight="700" fill="#ffd166">${t.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text></svg>`);
const captioned = async (png, t) => { const m = await sharp(png).metadata(); return sharp({ create: { width: m.width, height: m.height + 34, channels: 3, background: '#0b1220' } }).composite([{ input: cap(t, m.width), top: 0, left: 0 }, { input: png, top: 34, left: 0 }]).png().toBuffer(); };
async function row(items, file, gap = 8) {
  const cs = await Promise.all(items.map(([p, t]) => captioned(p, t))), ms = await Promise.all(cs.map(c => sharp(c).metadata()));
  const w = ms.reduce((a, m) => a + m.width, 0) + gap * (cs.length - 1), h = Math.max(...ms.map(m => m.height));
  let x = 0; const comp = cs.map((c, i) => { const o = { input: c, left: x, top: 0 }; x += ms[i].width + gap; return o; });
  await sharp({ create: { width: w, height: h, channels: 3, background: '#000' } }).composite(comp).png().toFile(file); console.log('  sheet ' + file);
}

const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const shots = new Map();
try {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => { try { localStorage.clear(); } catch { /* none */ } });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  page.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 300)); });
  await page.route('**/*', r => { const x = r.request(); return x.method() !== 'GET' && x.method() !== 'HEAD' ? r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }) : r.continue(); });
  await page.goto(`${base}?start=town&seed=${seed}${mowFlag ? `&mow=${mowFlag}` : ''}`, { waitUntil: 'domcontentloaded', timeout: 240000 });
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 300000 });
  await page.evaluate(() => { const g = window.__game; g.setSpeed(0); g.closeWelcome?.(false); g.prebake = () => {}; g.setShowGrid?.(false); window.__night = 0; g.nightAmount = () => window.__night; g.emit(); });
  await page.addStyleTag({ content: 'html.noui * { visibility: hidden !important } html.noui canvas { visibility: visible !important }' });
  await page.waitForFunction(() => window.__game?.courseGrid, null, { timeout: 120000 });
  await settle(page, 1500);
  // the longest fairway: the hole with the most fairway cells, its middle (tiles)
  const spot = await page.evaluate(() => {
    const g = window.__game.courseGrid, CT = 0.5, by = new Map();
    for (let j = 0; j < g.h; j++) for (let i = 0; i < g.w; i++) { const c = j * g.w + i; if (g.surf[c] === 4 && g.hole[c]) { const o = by.get(g.hole[c]) ?? { n: 0, x: 0, y: 0 }; o.n++; o.x += g.x0 + (i + 0.5) * CT; o.y += g.y0 + (j + 0.5) * CT; by.set(g.hole[c], o); } }
    let best = null; for (const [h, o] of by) if (!best || o.n > best.n) best = { h, n: o.n, x: o.x / o.n, y: o.y / o.n };
    return best;
  });
  console.log('  fairway', JSON.stringify(spot));
  const look = (x, y, z) => page.evaluate(([x, y, z]) => { const g = window.__game; g.camEase = null; g.lookAt(x, y, z); g.emit(); }, [x, y, z]);
  await page.evaluate(h => { const g = window.__game; g.setTool('select'); const p = g.paint; p.openSurface('fairway'); p.setLookDefault(false, false); p.setHole(h); g.emit(); }, spot.h);
  await look(spot.x, spot.y, zoom);
  for (const [id, label, mow] of SHOTS) {
    await page.evaluate(([h, m]) => { const g = window.__game, p = g.paint; p.setLookDefault(false, false); p.setHole(h); p.setStyle({ mow: m }); g.emit(); }, [spot.h, mow]);
    await look(spot.x, spot.y, zoom); await settle(page, 2500);
    await page.mouse.move(4, 4); await page.evaluate(() => document.documentElement.classList.add('noui')); await sleep(300);
    const png = await page.screenshot({ type: 'png' }); shots.set(id, png);
    await page.evaluate(() => document.documentElement.classList.remove('noui'));
    await sharp(png).toFile(join(out, `${id}.png`));
    // how strongly the pattern reads: the spread of the luminance over the middle of the frame (the fairway), the grass's own grain blurred away
    const st = await sharp(png).extract({ left: Math.round(W / 2 - 200), top: Math.round(H / 2 - 100), width: 400, height: 200 }).greyscale().blur(6).stats();
    console.log(`  shot ${id}: ${JSON.stringify(await page.evaluate(() => window.__game.paint.style.mow ?? null))} contrast ${st.channels[0].stdev.toFixed(1)}`);
  }
  await ctx.close();
} finally { await browser.close(); }

// the sheets: each shot's middle (a 1000 x 563 box) beside the reference, both 760 px wide
const box = { left: Math.round((W - 1000) / 2), top: Math.round((H - 563) / 2), width: 1000, height: 563 };
const refOk = existsSync(REF), ref = refOk ? await sharp(REF).resize({ width: 760 }).png().toBuffer() : null;
const crops = new Map();
for (const [id, label] of SHOTS) {
  const crop = await sharp(shots.get(id)).extract(box).resize({ width: 760 }).png().toBuffer(); crops.set(id, crop);
  await row([...(ref ? [[ref, 'Reference (the owner\'s picture)']] : []), [crop, label]], join(out, `${id}-ref.png`));
}
// every pattern in one sheet, three to a row
const rowsOf = []; for (let i = 0; i < SHOTS.length; i += 3) rowsOf.push(SHOTS.slice(i, i + 3));
let k = 0; for (const r of rowsOf) await row(r.map(([id, label]) => [crops.get(id), label]), join(out, `all-${++k}.png`));
