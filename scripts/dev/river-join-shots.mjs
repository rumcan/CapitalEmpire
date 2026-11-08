// T338 (#965): the owner's case, water painted across and beside the map's river or creek on the course: before the fix the painted pond drew
// its own bank and surface on top of the map's water; after it the two join (one water, one shoreline, no bank where they meet).
//   node scripts/dev/river-join-shots.mjs --base http://localhost:5186/ --out E:/ClaudeTemp/T338 --tag before [--kind creek|river] [--seed 7]
// Needs a dev server (vite) on --base. One headless Edge, closed when done.
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://localhost:5186/'), out = opt('out', 'E:/ClaudeTemp/T338'), tag = opt('tag', 'before'), seed = opt('seed', '7'), kind = opt('kind', 'any');
const zooms = opt('zooms', '0.3,0.12').split(',').map(Number), shift = +opt('shift', '0');
const W = 1280, H = 800;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const settle = async (page, ms = 900) => {
  await page.waitForTimeout(ms);
  await page.evaluate(() => { window.__calm = 0; });
  await page.waitForFunction(() => { const g = window.__game; window.__calm = g.ground.busy === 0 ? window.__calm + 1 : 0; return window.__calm > 20; }, null, { timeout: 60000, polling: 50 }).catch(() => console.log('  (settle timed out)'));
  await page.waitForTimeout(300);
};
const shot = async (page, name) => {
  const file = join(out, `${name}${shift ? `-s${shift}` : ''}-${tag}.jpg`);
  await sharp(await page.screenshot({ type: 'png' })).jpeg({ quality: 90, mozjpeg: true }).toFile(file);
  console.log(file); return file;
};
try {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  page.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 300)); });
  await page.goto(`${base}?start=town&seed=${seed}`, { timeout: 300000, waitUntil: 'commit' });
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 240000 });
  await page.addStyleTag({ content: '* { visibility: hidden !important } canvas { visibility: visible !important }' });
  await page.evaluate(() => { const g = window.__game; g.prebake = () => {}; g.setSpeed(0); g.setShowGrid?.(false); window.__night = 0; g.nightAmount = () => window.__night; });
  // the map water nearest the course grid's middle (a point on its centreline, its width, and the way's direction there)
  const spot = await page.evaluate(kind => {
    const g = window.__game, gr = g.courseGrid; if (!gr) return null;
    const cx = gr.x0 + gr.w * 0.25, cy = gr.y0 + gr.h * 0.25, x1 = gr.x0 + gr.w * 0.5, y1 = gr.y0 + gr.h * 0.5;
    let best = null, bd = Infinity;
    for (const w of g.terrain.waters) {
      if (kind !== 'any' && w.kind !== kind) continue;
      w.pts.forEach((p, i) => {
        const inside = p.x > gr.x0 + 20 && p.y > gr.y0 + 20 && p.x < x1 * 2 - gr.x0 - 20 && p.y < y1 * 2 - gr.y0 - 20;
        const d = Math.hypot(p.x - (gr.x0 + gr.w * 0.25), p.y - (gr.y0 + gr.h * 0.25)) + (inside ? 0 : 1e6);
        if (d < bd && i > 0 && i < w.pts.length - 1) { bd = d; const a = w.pts[i - 1], b = w.pts[i + 1], l = Math.hypot(b.x - a.x, b.y - a.y); best = { wi: g.terrain.waters.indexOf(w), i, kind: w.kind, x: p.x, y: p.y, w: p.w, ux: (b.x - a.x) / l, uy: (b.y - a.y) / l }; }
      });
    }
    return { grid: { x0: gr.x0, y0: gr.y0, w: gr.w, h: gr.h }, best, d: bd, cx, cy };
  }, kind);
  console.log('spot', JSON.stringify(spot));
  if (!spot?.best) throw new Error('no map water near the course grid');
  // (shift: that many centreline points along the waterway, for a clearer view)
  const b = await page.evaluate(([b, shift]) => {
    const P = window.__game.terrain.waters[b.wi].pts, i = Math.max(13, Math.min(P.length - 2, b.i + shift)), p = P[i], a = P[i - 1], c = P[i + 1], l = Math.hypot(c.x - a.x, c.y - a.y);
    return { ...b, i, x: p.x, y: p.y, w: p.w, ux: (c.x - a.x) / l, uy: (c.y - a.y) / l };
  }, [spot.best, shift]);
  console.log('at', JSON.stringify(b));
  // the land round it bare (the course's cells there none: the map's ground and its water show, as on newly bought land)
  await page.evaluate(async b => {
    const g = window.__game, cg = await import('/src/game/ext/course-grid/index.ts');
    g.paint.gridEdit('t338 bare', gr => ({ diffs: [cg.paintDisc(gr, b.x, b.y, 50, cg.SURF.none, 0, 0)], spent: 0 }));
    g.camEase = null; g.lookAt(b.x, b.y, 0.3);
  }, b);
  await settle(page, 2500);
  await page.evaluate(b => { const g = window.__game; g.camEase = null; g.lookAt(b.x - b.ux * 4, b.y - b.uy * 4, 0.3); }, b);
  await settle(page, 1500);
  await shot(page, `map-water-${b.kind}-30pct-bare`);
  // the owner's case: a strip of water laid across the map water, and one beside it (along its shore, touching it)
  const n = await page.evaluate(b => {
    const g = window.__game, nx = -b.uy, ny = b.ux, half = b.w / 2 * (b.kind === 'creek' ? 0.35 : 1);
    let cells = 0; const dig = (x, y, r) => { if (g.digPond(x, y, r, 'course')) cells++; };
    // across: from 8 tiles off one shore to 8 tiles off the other, 3 tiles wide
    for (let s = -(half + 8); s <= half + 8; s += 0.75) dig(b.x + b.ux * 6 + nx * s, b.y + b.uy * 6 + ny * s, 1.5);
    // beside: along the shore upstream (each centreline point's own normal), a pond reaching half a tile over the water's edge
    const P = g.terrain.waters[b.wi].pts;
    for (let k = b.i - 2; k >= Math.max(1, b.i - 6); k--) {
      const p = P[k], a = P[k - 1], c = P[k + 1], l = Math.hypot(c.x - a.x, c.y - a.y), mx = -(c.y - a.y) / l, my = (c.x - a.x) / l, hw = p.w / 2 * (b.kind === 'creek' ? 0.35 : 1);
      dig(p.x + mx * (hw + 2.5), p.y + my * (hw + 2.5), 3);
    }
    return cells;
  }, b);
  console.log('dug', n);
  for (const z of zooms) {
    await page.evaluate(([b, z]) => { window.__game.camEase = null; window.__game.lookAt(b.x - b.ux * 4, b.y - b.uy * 4, z); }, [b, z]);
    await settle(page, 1500);
    await shot(page, `map-water-${b.kind}-${Math.round(z * 100)}pct-painted`);
  }
  await ctx.close();
} finally { await browser.close(); }
