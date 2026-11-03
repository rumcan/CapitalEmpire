// T315 (#900): in-game shots of houses on the screen-straight streets (the roads at 45 degrees, where every building is drawn in its
// straight-on view, axis-library.ts): the engine's debug street grid turned 45 degrees (engine.ts stageLots diag), all houses, then a
// screen-vertical and a screen-horizontal street at street zoom (30%), the sun's cast shadows showing.
//   node scripts/dev/axis-street-shots.mjs --base http://127.0.0.1:5186/ --out F:/ClaudeTemp/T315 --tag before|after [--seed 7] [--zoom 0.3]
// Needs a dev server (vite) on --base. One headless Edge, closed when done.
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://127.0.0.1:5186/'), out = opt('out', 'output/axis-street-shots'), tag = opt('tag', 'after');
const seed = +opt('seed', '7'), zoom = +opt('zoom', '0.3'), extra = opt('q', '');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const settle = async (page, ms = 1500) => {
  await page.waitForTimeout(ms);
  await page.evaluate(() => { window.__calm = 0; });
  await page.waitForFunction(() => { const g = window.__game; window.__calm = g.ground.busy === 0 && g.lotsPending === 0 ? window.__calm + 1 : 0; return window.__calm > 20; }, null, { timeout: 90000, polling: 50 }).catch(() => console.log('  (settle timed out)'));
  await page.waitForTimeout(500);
};
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.goto(`${base}?${extra}`, { timeout: 300000 });
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 240000 });
  await page.addStyleTag({ content: '* { visibility: hidden !important } canvas { visibility: visible !important }' });
  const legs = await page.evaluate(seed => {
    const g = window.__game; g.prebake = () => {}; g.setShowGrid?.(false); window.__night = 0; g.nightAmount = () => window.__night;
    g.stageLots({ cols: 2, rows: 2, uses: [1], level: 2, decline: 0, seed, diag: true });
    g.setSpeed?.(0);
    return [...(g.net.segs.values ? g.net.segs.values() : g.net.segs)].map(s => ({ ax: s.a.x, ay: s.a.y, bx: s.b.x, by: s.b.y }));
  }, seed);
  // a screen-vertical street runs along (1, 1) in tiles, a screen-horizontal one along (1, -1); the middle of the grid's middle street of each
  const mid = legs.reduce((a, l) => ({ x: a.x + (l.ax + l.bx) / 2 / legs.length, y: a.y + (l.ay + l.by) / 2 / legs.length }), { x: 0, y: 0 });
  const pick = sgn => legs.filter(l => Math.sign((l.bx - l.ax) * (l.by - l.ay)) === sgn).map(l => ({ x: (l.ax + l.bx) / 2, y: (l.ay + l.by) / 2 }))
    .sort((a, b) => Math.hypot(a.x - mid.x, a.y - mid.y) - Math.hypot(b.x - mid.x, b.y - mid.y))[0];
  for (const [name, p] of [['vertical', pick(1)], ['horizontal', pick(-1)]]) {
    if (!p) { console.log('no', name, 'street'); continue; }
    await page.evaluate(([x, y, z]) => { const g = window.__game; g.camEase = null; g.lookAt(x, y, z); }, [p.x, p.y, zoom]);
    await settle(page);
    const file = join(out, `street-${name}-${Math.round(zoom * 100)}pct-${tag}.jpg`);
    await sharp(await page.screenshot({ type: 'png' })).jpeg({ quality: 90, mozjpeg: true }).toFile(file);
    console.log(file);
  }
  await ctx.close();
} finally { await browser.close(); }
