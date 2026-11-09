// T364 (#1019): in-game shots of the tees, before and after: the tee's grass is the putting green's (no mowing lines), and a raised tee's cut sides wear
// the bunker's wall (its picture and its stage shader's light, sun at the upper right) instead of the painted earth and set stones.
//   node scripts/dev/tee-look-shots.mjs --base http://localhost:5195/ --out E:/ClaudeTemp/T364 [--seed 7] [--hole 1] [--only after] [--states raised,flat] [--zooms 30,15]
// (--only after: no old-look run and no before | after sheets, the after shots alone as <state>-<zoom>-after.png, to tune a look)
// For each of the old nine's tees (the largest, or --hole) in two states, a raised tee (the default 0.6 m) and a flat one (the Height slider at its lowest,
// 0.15 m: a low grass bank), at 30% and 15%: the old look (the dev server's ?tee=old: the fairway's grass, the rock sides) beside the new, on one build.
// Writes <out>/<state>-<zoom>-before.png, -after.png and the captioned sheet <state>-<zoom>.png (before | after), plus a 3x crop of the tee at 30%.
// Needs a dev server (vite) on --base. One headless Edge at a time, closed when done; a fresh profile each time, no saves written.
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://localhost:5195/'), out = opt('out', 'E:/ClaudeTemp/T364'), seed = opt('seed', '7'), holeArg = opt('hole', ''), only = opt('only', '');
const W = 1366, H = 768, ZOOMS = opt('zooms', '30,15').split(',').map(v => +v / 100), STATES = opt('states', 'raised,flat').split(',');
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
/** captioned images side by side, 8 px apart */
async function pair(items, file) {
  const cs = await Promise.all(items.map(([p, t]) => captioned(p, t))), ms = await Promise.all(cs.map(c => sharp(c).metadata()));
  const w = ms.reduce((a, m) => a + m.width, 0) + 8 * (cs.length - 1), h = Math.max(...ms.map(m => m.height));
  let x = 0; const comp = cs.map((c, i) => { const o = { input: c, left: x, top: 0 }; x += ms[i].width + 8; return o; });
  await sharp({ create: { width: w, height: h, channels: 3, background: '#000' } }).composite(comp).png().toFile(file); console.log('  sheet ' + file);
}

/** one game: the tee framed at each zoom in each state; returns the shots by `${state}-${zoom}` and the tee's screen spot at 30% */
async function run(browser, query) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => { try { localStorage.clear(); } catch { /* none */ } });
  const page = await ctx.newPage(), shots = {}, at = {};
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  page.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 300)); });
  await page.route('**/*', r => { const x = r.request(); return x.method() !== 'GET' && x.method() !== 'HEAD' ? r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }) : r.continue(); });
  try {
    await page.goto(`${base}?start=town&seed=${seed}${query}`, { waitUntil: 'domcontentloaded', timeout: 240000 });
    await page.waitForFunction(() => window.__game?.ready, null, { timeout: 300000 });
    await page.evaluate(() => { const g = window.__game; g.setSpeed(0); g.closeWelcome?.(false); g.prebake = () => {}; g.setShowGrid?.(false); window.__night = 0; g.nightAmount = () => window.__night; g.emit(); });
    await page.addStyleTag({ content: 'html.noui * { visibility: hidden !important } html.noui canvas { visibility: visible !important }' });
    await page.waitForFunction(() => window.__game?.courseGrid, null, { timeout: 120000 });
    await settle(page, 1500);
    const tee = await page.evaluate(h => {
      const g = window.__game.courseGrid, CT = 0.5, by = new Map();
      for (let j = 0; j < g.h; j++) for (let i = 0; i < g.w; i++) { const c = j * g.w + i; if (g.surf[c] === 5) { const k = g.hole[c], o = by.get(k) ?? { n: 0, x: 0, y: 0 }; o.n++; o.x += g.x0 + (i + 0.5) * CT; o.y += g.y0 + (j + 0.5) * CT; by.set(k, o); } }
      const all = [...by].map(([k, o]) => ({ hole: k, n: o.n, x: o.x / o.n, y: o.y / o.n })).sort((a, b) => b.n - a.n || a.hole - b.hole);
      return (h ? all.find(t => t.hole === +h) : null) ?? all[0];
    }, holeArg);
    console.log(`  tee: hole ${tee.hole} at ${tee.x.toFixed(1)}, ${tee.y.toFixed(1)}`);
    const look = (z) => page.evaluate(([x, y, z]) => { const g = window.__game; g.camEase = null; g.lookAt(x, y, z); g.emit(); }, [tee.x, tee.y, z]);
    for (const state of STATES) {
      if (state === 'flat') { await page.evaluate(() => window.__game.paint.setSurfaceHeight(0.15, 'tee')); await sleep(1200); }
      for (const z of ZOOMS) {
        await look(z); await settle(page, state === 'flat' ? 2500 : 1500);
        await page.mouse.move(4, 4); await page.evaluate(() => document.documentElement.classList.add('noui')); await sleep(300);
        shots[`${state}-${Math.round(z * 100)}`] = await page.screenshot({ type: 'png' });
        if (z === 0.3) at[state] = await page.evaluate(([x, y]) => { const g = window.__game, s = g.screen(x, y); return { x: s.x / g.dpr, y: s.y / g.dpr }; }, [tee.x, tee.y]);
        await page.evaluate(() => document.documentElement.classList.remove('noui'));
      }
    }
    console.log('  tee height now', await page.evaluate(() => window.__game.paint.surfaceHeight('tee')));
  } finally { await ctx.close(); }
  return { shots, at };
}

const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
try {
  const before = only === 'after' ? null : (console.log('before (?tee=old)'), await run(browser, '&tee=old'));
  console.log('after'); const after = await run(browser, '');
  for (const key of Object.keys(after.shots)) {
    const [state, z] = key.split('-'), name = `${state}-${z}`;
    if (!before) { await sharp(after.shots[key]).toFile(join(out, `${name}-after.png`)); console.log('  shot ' + join(out, `${name}-after.png`)); continue; }
    await sharp(before.shots[key]).toFile(join(out, `${name}-before.png`)); await sharp(after.shots[key]).toFile(join(out, `${name}-after.png`));
    const label = `${state === 'raised' ? 'Raised tee (0.6 m)' : 'Flat tee (0.15 m)'}, ${z}%`;
    await pair([[before.shots[key], `${label}: before`], [after.shots[key], `${label}: after`]], join(out, `${name}.png`));
    if (z === '30') {
      // a 3x crop of the tee at the closest zoom (the same box in both)
      const c = after.at[state], box = { left: Math.max(0, Math.round(c.x - 230)), top: Math.max(0, Math.round(c.y - 150)), width: 460, height: 300 };
      const crop = async p => sharp(p).extract(box).resize({ width: 1380, kernel: 'lanczos3' }).png().toBuffer();
      await pair([[await crop(before.shots[key]), `${label}: before (3x)`], [await crop(after.shots[key]), `${label}: after (3x)`]], join(out, `${name}-crop.png`));
    }
  }
} finally { await browser.close(); }
