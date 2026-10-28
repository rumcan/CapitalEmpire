// T237 (#694): in-game shots of the range start's car parks. On the range start (seed 1), broad day, the UI hidden (the map's labels stay)
// unless a shot needs it:
//   layout     the range's front at 15% and 30% (the frontage strip along the road, the car park in it)
//   grow       the frontage car park as dirt, gravel and paved (the range's upgrades), then a second lot laid along the road, 30%
//   dusk       the paved car park at 30% at dusk (its lamps on), with cars
//   preview    the Car park tool's placement preview: a lot beside the range (its serve lines) and one far down the road ("Too far to walk")
//   walk       golfers walking from the car park to the shop, 30%
//   card       the range card listing its car parks
//   node scripts/dev/carpark-shots.mjs --base http://127.0.0.1:5186/ --out E:/ClaudeTemp/T237 --tag after [--only layout,grow,...]
// Needs a dev server (vite) on --base. One headless Edge, closed when done; a fresh profile, so each start is a new game.
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://127.0.0.1:5186/'), out = opt('out', 'output/carpark-shots'), tag = opt('tag', 'after'), seed = opt('seed', '1');
const only = new Set(opt('only', 'layout,grow,dusk,preview,walk,card').split(','));
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const settle = async (page, ms = 900) => {
  await page.waitForTimeout(ms);
  await page.evaluate(() => { window.__calm = 0; });
  await page.waitForFunction(() => { const g = window.__game; window.__calm = g.ground.busy === 0 ? window.__calm + 1 : 0; return window.__calm > 20; }, null, { timeout: 60000, polling: 50 }).catch(() => console.log('  (settle timed out)'));
  await page.waitForTimeout(400);
};
const shot = async (page, name) => {
  const file = join(out, `${tag}-${name}.jpg`), png = await page.screenshot({ type: 'png' });
  await sharp(png).jpeg({ quality: 88, mozjpeg: true }).toFile(file);
  console.log(file);
  return file;
};
const look = (page, x, y, z) => page.evaluate(([x, y, z]) => { const g = window.__game; g.camEase = null; g.lookAt(x, y, z); }, [x, y, z]);
/** the range's upgrades set as owned (a dev shortcut: no money, the scene laid again) */
const own = (page, ids) => page.evaluate(ids => { const g = window.__game, b = g.range.ctx.biz(); for (const id of ids) if (!b.owned.includes(id)) b.owned.push(id); g.range.sync(true); }, ids);
/** where things are (world tiles): the range front's middle, the shop's counter, the car parks */
const spots = page => page.evaluate(() => {
  const g = window.__game, sc = g.range.scene, f = sc.front;
  return { front: [(f[0] + f[2]) / 2, (f[1] + f[3]) / 2], counter: [sc.counter.x, sc.counter.y], roadDir: sc.roadDir, rangeSide: sc.rangeSide, J: sc.J,
    parks: g.parkDefs.map(d => ({ id: d.id, x: d.x, y: d.y, w: d.w, h: d.h, ground: d.ground ?? 'paved' })), setback: g.golf?.range?.setback ?? 0 };
});
const uiHide = page => page.addStyleTag({ content: '* { visibility: hidden !important } canvas { visibility: visible !important }' }).then(t => t);
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 }), page = await ctx.newPage();
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  page.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 300)); });
  await page.goto(`${base}?start=range&seed=${seed}`);
  await page.waitForFunction(() => window.__game?.ready && window.__game.range?.scene, null, { timeout: 240000 });
  await page.evaluate(() => { const g = window.__game; g.prebake = () => {}; g.setSpeed(0); g.setShowGrid?.(false); window.__night = 0; g.nightAmount = () => window.__night; });
  const hide = await uiHide(page);
  let sp = await spots(page); console.log('start', JSON.stringify(sp));
  const pk = () => sp.parks[0], mid = d => [d.x + d.w / 2, d.y + d.h / 2];
  if (only.has('layout')) {
    await look(page, sp.front[0], sp.front[1], 0.15); await settle(page); await shot(page, 'layout-15pct');
    await look(page, sp.front[0], sp.front[1], 0.3); await settle(page); await shot(page, 'layout-30pct');
  }
  if (only.has('grow') && pk()) {
    const [x, y] = mid(pk());
    await look(page, x, y, 0.3); await settle(page); await shot(page, 'grow-1-dirt-30pct');
    await own(page, ['gravel']); await settle(page); await shot(page, 'grow-2-gravel-30pct');
    await own(page, ['pave']); await settle(page); await shot(page, 'grow-3-paved-30pct');
  }
  if (only.has('dusk') && pk()) {
    await own(page, ['gravel', 'pave']);
    // the car park busy: a town hour with golfers (the sim on, a little), cars in the bays
    await page.evaluate(() => { const g = window.__game; g.setSpeed(3); });
    await page.waitForTimeout(12000);
    await page.evaluate(() => { window.__game.setSpeed(0); });
    const [x, y] = mid(pk());
    await look(page, x, y, 0.3); await settle(page); await shot(page, 'paved-day-30pct');
    await page.evaluate(() => { window.__night = 0.85; }); await settle(page, 1500); await shot(page, 'paved-dusk-30pct');
    await page.evaluate(() => { window.__night = 0; });
  }
  await ctx.close();
} finally { await browser.close(); }
