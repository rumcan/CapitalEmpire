// T219 follow-up (#594): an iconic place at each of its four facings, in a grown town (the range20 fixture). The place is moved to the nearest free
// ground that takes its footprint at each quarter turn (the street on +y, +x, -y, -x: lots/iconic.ts q 0..3), composed again, and shot at 30% (and
// the zooms asked). Prints where it stood. Dev only: it reaches into the game (window.__game) as place-shots.mjs does.
//   node scripts/dev/place-facings.mjs --base http://127.0.0.1:5186/ --out E:/ClaudeTemp/T219b --place drive-in --zoom 0.3,0.15
// Needs a dev server (vite) on --base. One headless Edge, closed when done.
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://127.0.0.1:5186/'), out = opt('out', 'output/place-facings'), url = opt('url', '?fixture=range20'), id = opt('place', 'drive-in');
const zooms = opt('zoom', '0.3').split(',').map(Number), qs = opt('q', '0,1,2,3').split(',').map(Number), W = +opt('w', 1400), H = +opt('h', 900);
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
  await sharp(await page.screenshot({ type: 'png' })).jpeg({ quality: 88, mozjpeg: true }).toFile(file);
  console.log(file); return file;
};
try {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  page.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 300)); });
  await page.goto(`${base}${url}`);
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 240000 });
  await page.waitForFunction(pid => window.__game.places.some(p => p.id === pid), id, { timeout: 90000, polling: 500 }).catch(() => console.log('  (the place was not placed)'));
  await page.evaluate(() => { const g = window.__game; g.prebake = () => {}; g.setSpeed(0); g.closeWelcome?.(false); g.panel = null; g.emit(); });
  const hide = await page.addStyleTag({ content: '* { visibility: hidden !important } canvas { visibility: visible !important }' });
  for (const q of qs) {
    // the nearest free ground for this quarter turn, by rings about where the place stands now
    const at = await page.evaluate(([pid, q]) => {
      const g = window.__game, def = g.placeDefs.find(d => d.id === pid), i = g.places.findIndex(p => p.id === pid);
      if (!def || i < 0) return null;
      const AWAY = [[0, -1], [-1, 0], [0, 1], [1, 0]], cur = g.places[i], cn = AWAY[cur.q], cu = [-cn[1], cn[0]];
      const c0 = { x: cur.x + cu[0] * def.preset.w / 2 + cn[0] * def.preset.d / 2, y: cur.y + cu[1] * def.preset.w / 2 + cn[1] * def.preset.d / 2 };
      const n = AWAY[q], u = [-n[1], n[0]], w = def.preset.w, d = def.preset.d;
      const box = (cx, cy) => { const o = { x: cx - u[0] * w / 2 - n[0] * d / 2, y: cy - u[1] * w / 2 - n[1] * d / 2 }; const xs = [o.x, o.x + u[0] * w, o.x + n[0] * d, o.x + u[0] * w + n[0] * d], ys = [o.y, o.y + u[1] * w, o.y + n[1] * d, o.y + u[1] * w + n[1] * d]; return { o, b: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] }; };
      // the place itself is not in its own way
      const keep = g.places.splice(i, 1)[0];
      let found = null;
      for (let r = 0; r <= 400 && !found; r += 4) for (let a = 0; a < (r ? 16 : 1) && !found; a++) {
        const cx = c0.x + r * Math.cos(a * Math.PI / 8), cy = c0.y + r * Math.sin(a * Math.PI / 8), t = box(cx, cy);
        if (g.placeFree(t.b)) found = { x: t.o.x, y: t.o.y, q, cx, cy };
      }
      g.places.splice(i, 0, keep);
      if (!found) return null;
      g.places[i] = { id: pid, x: found.x, y: found.y, q };
      g.syncPlaces();
      return found;
    }, [id, q]);
    console.log(`facing ${q}:`, JSON.stringify(at));
    if (!at) continue;
    for (const z of zooms) {
      await page.evaluate(([x, y, z]) => { const g = window.__game; g.camEase = null; g.cam.z = z; g.cam.X = (x - y) * 64; g.cam.Y = (x + y) * 32; }, [at.cx, at.cy, z]);
      await settle(page);
      await shot(page, `${id}-q${q}-${Math.round(z * 1000) / 10}pct`);
    }
  }
  await hide.evaluate(n => n.remove());
} finally { await browser.close(); }
