// T222 (#618): in-game shots of the rough yards: a range start's backyards early (fescue, dirt and desert patches over the mown lawn), a grown town's
// mown lawns (?fixture=range20), a vegetable garden on dirt, and (with --waste) a desert Waste area painted beside a fairway.
//   node scripts/dev/rough-yard-shots.mjs --base http://127.0.0.1:5186/ --out E:/ClaudeTemp/T222 [--probe] [--only start,grown,veg,waste]
// Needs a dev server (vite) on --base. One headless Edge, closed when done; a fresh profile, so each start is a new game.
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://127.0.0.1:5186/'), out = opt('out', 'output/rough-yards'), probe = args.includes('--probe'), only = new Set(opt('only', 'start,grown,veg,waste').split(','));
const W = 1280, H = 800;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
/** wait until no chunk bake is in flight for a second (at most 60 s) */
const settle = async (page, ms = 900) => {
  await page.waitForTimeout(ms);
  await page.evaluate(() => { window.__calm = 0; });
  await page.waitForFunction(() => { const g = window.__game; window.__calm = g.ground.busy === 0 ? window.__calm + 1 : 0; return window.__calm > 20; }, null, { timeout: 60000, polling: 50 }).catch(() => console.log('  (settle timed out)'));
  await page.waitForTimeout(300);
};
const shot = async (page, name) => {
  const file = join(out, `${name}.jpg`);
  await sharp(await page.screenshot({ type: 'png' })).jpeg({ quality: 88, mozjpeg: true }).toFile(file);
  console.log(file); return file;
};
/** a fresh page on `url` (a new game or a fixture), loaded, the UI hidden, the game paused */
const open = async (url, keepUi = false) => {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  page.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 300)); });
  await page.goto(url);
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 240000 });
  if (!keepUi) await page.addStyleTag({ content: '* { visibility: hidden !important } canvas { visibility: visible !important }' });
  await page.evaluate(() => { const g = window.__game; g.prebake = () => {}; g.setSpeed(0); });
  return page;
};
/** the camera on tile (x, y) at zoom z */
const look = (page, x, y, z) => page.evaluate(([x, y, z]) => { const g = window.__game; g.lookAt(x, y, z); }, [x, y, z]);
/** the rough yards' summary and the densest cluster of rough lots */
const summary = page => page.evaluate(() => {
  const g = window.__game, rows = [...g.yardRough].map(([k, v]) => ({ k, ...v, l: g.traffic.lots.get(k) })).filter(r => r.l);
  const rough = rows.filter(r => r.sig), homes = rows.filter(r => r.home);
  const best = rough.map(r => ({ x: r.l.o[0] + r.l.u[0] * r.l.w / 2 + r.l.n[0] * r.l.d / 2, y: r.l.o[1] + r.l.u[1] * r.l.w / 2 + r.l.n[1] * r.l.d / 2 }))
    .map(c => ({ ...c, n: rough.filter(r => Math.hypot(r.l.o[0] - c.x, r.l.o[1] - c.y) < 16).length, h: homes.filter(r => Math.hypot(r.l.o[0] - c.x, r.l.o[1] - c.y) < 16).length }))
    .sort((a, b) => b.n * 3 + b.h - (a.n * 3 + a.h))[0];
  return { pop: g.traffic.pop, lots: g.traffic.lots.size, yards: rows.length, homes: homes.length, rough: rough.length, kinds: rough.reduce((a, r) => { const m = r.l && g.yardMix?.get?.(r.k); return a; }, {}), best };
});
/** runs the game on until the town has `pop` residents (at most `secs` s), then pauses it */
const grow = async (page, pop, secs = 240) => {
  await page.evaluate(() => { window.__game.setSpeed(20); });
  await page.waitForFunction(p => window.__game.traffic.pop >= p, pop, { timeout: secs * 1000, polling: 500 }).catch(() => console.log('  (growth timed out)'));
  await page.evaluate(() => { window.__game.setSpeed(0); });
  await page.waitForTimeout(1500);
};
try {
  if (probe) {
    for (const [n, url] of [['start', `${base}?stamp=0`], ['grown', `${base}?fixture=range20&stamp=0`]]) {
      const page = await open(url, true);
      if (n === 'start') { await grow(page, +opt('pop', 150)); }
      console.log(n, JSON.stringify(await summary(page))); await page.context().close();
    }
  }
} finally { await browser.close(); }
