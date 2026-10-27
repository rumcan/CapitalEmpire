// T219 (#594, P27): in-game shots of the iconic places in a grown town (the range20 fixture: a town of about 5,500 residents, so every place
// is due): each place at 30% and 15%, and its card (a click on its props with the select tool). Prints each place and its frame.
//   node scripts/dev/place-shots.mjs --base http://127.0.0.1:5186/ --out E:/ClaudeTemp/T219
// Needs a dev server (vite) on --base. One headless Edge, closed when done.
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://127.0.0.1:5186/'), out = opt('out', 'output/place-shots'), url = opt('url', '?fixture=range20');
const W = 1400, H = 900;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const settle = async (page, ms = 1200) => {
  await page.waitForTimeout(ms);
  await page.evaluate(() => { window.__calm = 0; });
  await page.waitForFunction(() => { const g = window.__game; window.__calm = g.ground.busy === 0 && g.lotsPending === 0 ? window.__calm + 1 : 0; return window.__calm > 20; }, null, { timeout: 60000, polling: 50 }).catch(() => console.log('  (settle timed out)'));
  await page.waitForTimeout(400);
};
const shot = async (page, name) => {
  const file = join(out, `${name}.jpg`);
  await sharp(await page.screenshot({ type: 'png' })).jpeg({ quality: 86, mozjpeg: true }).toFile(file);
  console.log(file); return file;
};
try {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  page.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 300)); });
  await page.goto(`${base}${url}`);
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 240000 });
  // the town message that makes the places due comes with the load; wait for every place (or 90 s)
  await page.waitForFunction(() => { const g = window.__game; return g.places.length >= g.placeDefs.length; }, null, { timeout: 90000, polling: 500 }).catch(() => console.log('  (not every place placed)'));
  const places = await page.evaluate(() => { const g = window.__game; g.prebake = () => {}; g.setSpeed(0); return { pop: g.traffic.pop, places: g.places, defs: g.placeDefs.map(d => [d.id, d.pop, d.preset.w, d.preset.d]) }; });
  console.log(JSON.stringify(places));
  for (const p of places.places) {
    const def = places.defs.find(d => d[0] === p.id), n = [[0, -1], [-1, 0], [0, 1], [1, 0]][p.q], u = [-n[1], n[0]];
    const cx = p.x + u[0] * def[2] / 2 + n[0] * def[3] / 2, cy = p.y + u[1] * def[2] / 2 + n[1] * def[3] / 2;
    const hide = await page.addStyleTag({ content: '* { visibility: hidden !important } canvas { visibility: visible !important }' });
    for (const z of [0.3, 0.15]) {
      await page.evaluate(([x, y, z]) => { const g = window.__game; g.camEase = null; g.cam.z = z; g.cam.X = (x - y) * 64; g.cam.Y = (x + y) * 32; }, [cx, cy, z]);
      await settle(page);
      await shot(page, `${p.id}-${Math.round(z * 100)}pct`);
    }
    await hide.evaluate(n => n.remove());
    // the card: a click on one of its props (the select tool); the welcome card and the tool panel closed first
    await page.evaluate(() => { const g = window.__game; g.closeWelcome?.(false); g.panel = null; g.emit(); });
    await page.evaluate(([x, y]) => { const g = window.__game; g.camEase = null; g.cam.z = 0.3; g.cam.X = (x - y) * 64; g.cam.Y = (x + y) * 32; g.setTool('select'); }, [cx, cy]);
    await settle(page, 600);
    const at = await page.evaluate(id => {
      const g = window.__game, rect = g.canvas?.getBoundingClientRect?.() ?? { left: 0, top: 0 };
      for (const p of g.props) if (p.auto === 'place:' + id) { const big = window.__lib?.[p.item]?.big; const s = g.screen((p.x0 + p.x1) / 2, (p.y0 + p.y1) / 2); if (s) return { x: s.x / (g.dpr || 1) + rect.left, y: s.y / (g.dpr || 1) + rect.top, big }; }
      return null;
    }, p.id);
    if (at) { await page.mouse.click(at.x, at.y); await page.waitForTimeout(800); await shot(page, `${p.id}-card`); }
    const card = await page.evaluate(() => window.__game.placeCard());
    console.log('card', JSON.stringify(card));
    await page.evaluate(() => window.__game.closePlaceCard());
  }
} finally { await browser.close(); }
