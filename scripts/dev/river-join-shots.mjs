// T338 (#965) and T344 (#982): the owner's case, water laid across and beside the map's river or creek: before the fix the painted pond drew its
// own bank and surface on top of the map's water; after it the two join (one water, one shoreline, no bank where they meet).
//   node scripts/dev/river-join-shots.mjs --base http://localhost:5186/ --out E:/ClaudeTemp/T344 --tag before [--what course|town|stones|fountain|narrow]
//     [--kind creek|river] [--seed 7] [--shift -8] [--zooms 0.3,0.12]
// --what course (T338, the default): course water (a strip across the water and a pond beside it, by the Fountain pond's course digs).
// --what town (T344): the town's painted water: the classic Paint's water area (a strip across and a long pond beside it, with the Water brush's
//   dirt border) and the Fountain pond in town (one over the water's edge, one a tile from it).
// --what stones (T344): a course pond beside the water with the Stones edge (T231), the boulders and plants round its shore.
// --what fountain (T344): the Fountain pond as the Props tool lays it in town (a painted water area and its Stones edge): one over the water's edge,
//   one a tile clear of it.
// --what narrow (T344): water laid on both banks of the narrowest creek inside the course grid, so the outline joins across it.
// Needs a dev server (vite) on --base. One headless Edge, closed when done.
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://localhost:5186/'), out = opt('out', 'E:/ClaudeTemp/T338'), tag = opt('tag', 'before'), seed = opt('seed', '7'), what = opt('what', 'course');
const kind = opt('kind', what === 'narrow' ? 'creek' : 'any');
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
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 900000 });
  await page.addStyleTag({ content: '* { visibility: hidden !important } canvas { visibility: visible !important }' });
  await page.evaluate(() => { const g = window.__game; g.prebake = () => {}; g.setSpeed(0); g.setShowGrid?.(false); window.__night = 0; g.nightAmount = () => window.__night; });
  // the map water nearest the course grid's middle (a point on its centreline, its width, and the way's direction there); narrow: the creek point
  // with the least water inside the middle of the grid
  const spot = await page.evaluate(([kind, narrow]) => {
    const g = window.__game, gr = g.courseGrid; if (!gr) return null;
    // (the grid is w x h cells of half a tile: its tile box x0..gx1, y0..gy1)
    const cx = gr.x0 + gr.w * 0.25, cy = gr.y0 + gr.h * 0.25, gx1 = gr.x0 + gr.w * 0.5, gy1 = gr.y0 + gr.h * 0.5;
    let best = null, bd = Infinity;
    for (const w of g.terrain.waters) {
      if (kind !== 'any' && w.kind !== kind) continue;
      w.pts.forEach((p, i) => {
        const inside = p.x > gr.x0 + 25 && p.y > gr.y0 + 25 && p.x < gx1 - 25 && p.y < gy1 - 25;
        // (narrow: the least width first, then the nearest)
        const d = (narrow ? p.w * 1000 : 0) + Math.hypot(p.x - cx, p.y - cy) + (inside ? 0 : 1e9);
        if (d < bd && i > 0 && i < w.pts.length - 1) { bd = d; const a = w.pts[i - 1], b = w.pts[i + 1], l = Math.hypot(b.x - a.x, b.y - a.y); best = { wi: g.terrain.waters.indexOf(w), i, kind: w.kind, x: p.x, y: p.y, w: p.w, ux: (b.x - a.x) / l, uy: (b.y - a.y) / l }; }
      });
    }
    return { grid: { x0: gr.x0, y0: gr.y0, w: gr.w, h: gr.h, gx1, gy1 }, best, d: bd, cx, cy, creeks: g.terrain.waters.filter(w => w.kind === 'creek').map(w => [w.pts.length, Math.min(...w.pts.map(p => p.w)), Math.max(...w.pts.map(p => p.w))]) };
  }, [kind, what === 'narrow']);
  console.log('spot', JSON.stringify(spot));
  if (!spot?.best) throw new Error('no map water near the course grid');
  // (shift: that many centreline points along the waterway, for a clearer view)
  const b = await page.evaluate(([b, shift]) => {
    const P = window.__game.terrain.waters[b.wi].pts, i = Math.max(13, Math.min(P.length - 2, b.i + shift)), p = P[i], a = P[i - 1], c = P[i + 1], l = Math.hypot(c.x - a.x, c.y - a.y);
    return { ...b, i, x: p.x, y: p.y, w: p.w, ux: (c.x - a.x) / l, uy: (c.y - a.y) / l };
  }, [spot.best, shift]);
  console.log('at', JSON.stringify(b), 'water width tiles', b.w * (b.kind === 'creek' ? 0.35 : 1));
  // the land round it bare (the course's cells there none: the map's ground and its water show, as on newly bought land)
  await page.evaluate(async b => {
    const g = window.__game, cg = await import('/src/game/ext/course-grid/index.ts');
    g.paint.gridEdit('t338 bare', gr => ({ diffs: [cg.paintDisc(gr, b.x, b.y, 50, cg.SURF.none, 0, 0)], spent: 0 }));
    g.camEase = null; g.lookAt(b.x, b.y, 0.3);
  }, b);
  await settle(page, 2500);
  await page.evaluate(b => { const g = window.__game; g.camEase = null; g.lookAt(b.x - b.ux * 4, b.y - b.uy * 4, 0.3); }, b);
  await settle(page, 1500);
  await shot(page, `map-water-${what}-${b.kind}-30pct-bare`);
  const made = await page.evaluate(([b, what]) => {
    const g = window.__game, nx = -b.uy, ny = b.ux, k = b.kind === 'creek' ? 0.35 : 1, half = b.w / 2 * k, P = g.terrain.waters[b.wi].pts;
    /** the centreline point k's own normal */
    const norm = i => { const p = P[i], a = P[i - 1], c = P[i + 1], l = Math.hypot(c.x - a.x, c.y - a.y); return { x: p.x, y: p.y, mx: -(c.y - a.y) / l, my: (c.x - a.x) / l, hw: p.w / 2 * k }; };
    // the course's water as the Fountain pond digs it (T338): r tiles round (x, y), on the course grid
    let cells = 0; const dig = (x, y, r) => { if (g.digPond(x, y, r, 'course')) cells++; };
    // the classic Paint's water area: the Water brush's dirt border (a step of 2: half a tile), straight corners
    let areas = 0, view = null; const area = (pts, border = 2) => { g.paint.addArea(pts, { tex: 'waterDark', border, btex: 'dirt', radius: 0 }); areas++; };
    if (what === 'course') {
      // across: from 8 tiles off one shore to 8 tiles off the other, 3 tiles wide
      for (let s = -(half + 8); s <= half + 8; s += 0.75) dig(b.x + b.ux * 6 + nx * s, b.y + b.uy * 6 + ny * s, 1.5);
      // beside: along the shore upstream (each centreline point's own normal), a pond reaching half a tile over the water's edge
      for (let q = b.i - 2; q >= Math.max(1, b.i - 6); q--) { const n = norm(q); dig(n.x + n.mx * (n.hw + 2.5), n.y + n.my * (n.hw + 2.5), 3); }
    } else if (what === 'town') {
      // across: a rectangle 3 tiles along the water and from 8 tiles off one shore to 8 off the other
      const cx = b.x + b.ux * 6, cy = b.y + b.uy * 6, s0 = -(half + 8), s1 = half + 8, t = 1.5;
      area([cx + nx * s0 - b.ux * t, cy + ny * s0 - b.uy * t, cx + nx * s1 - b.ux * t, cy + ny * s1 - b.uy * t, cx + nx * s1 + b.ux * t, cy + ny * s1 + b.uy * t, cx + nx * s0 + b.ux * t, cy + ny * s0 + b.uy * t]);
      // beside: along the shore upstream, from half a tile inside the water's edge to 5.5 tiles past it
      const inner = [], outer = [];
      for (let q = b.i - 2; q >= Math.max(1, b.i - 6); q--) { const n = norm(q); inner.push(n.x + n.mx * (n.hw - 0.5), n.y + n.my * (n.hw - 0.5)); outer.unshift(n.x + n.mx * (n.hw + 5.5), n.y + n.my * (n.hw + 5.5)); }
      area([...inner, ...outer]);
    } else if (what === 'fountain') {
      // the Fountain pond as the Props tool lays it in town (propstool.ts placePond): a painted water area and its Stones mark. One over the water's
      // edge (half a tile in), one a tile and a bit clear of it, a centreline point apart
      const pond = (x, y) => { g.digPond(x, y, 3, 'town'); g.setPondMarks([...(g.golf?.ponds ?? []), Math.round(x * 2) / 2, Math.round(y * 2) / 2]); areas++; };
      const f = norm(Math.min(P.length - 2, b.i + 1)), h = norm(Math.min(P.length - 2, b.i + 2));
      const fx = f.x + f.mx * (f.hw + 2.5), fy = f.y + f.my * (f.hw + 2.5), hx = h.x - h.mx * (h.hw + 4.2), hy = h.y - h.my * (h.hw + 4.2);
      pond(fx, fy); pond(hx, hy); view = { x: (fx + hx) / 2, y: (fy + hy) / 2 };
    } else if (what === 'stones') {
      // a pond beside the water (as the course variant), edged with Stones (T231: the Props tool's Stone pond edge), and one across the water
      for (let q = b.i - 2; q >= Math.max(1, b.i - 6); q--) { const n = norm(q); dig(n.x + n.mx * (n.hw + 2.5), n.y + n.my * (n.hw + 2.5), 3); }
      const m = norm(b.i - 4); g.setPondMarks([m.x + m.mx * (m.hw + 2.5), m.y + m.my * (m.hw + 2.5)]);
    } else if (what === 'narrow') {
      // on both banks of the creek: discs a tile and a half clear of the water, so that the join reaches across it
      for (let q = b.i - 3; q <= Math.min(P.length - 2, b.i + 3); q++) { const n = norm(q); for (const sg of [1, -1]) dig(n.x + sg * n.mx * (n.hw + 1.4), n.y + sg * n.my * (n.hw + 1.4), 1.5); }
    }
    return { cells, areas, half, view };
  }, [b, what]);
  console.log('made', JSON.stringify(made));
  for (const z of zooms) {
    await page.evaluate(([b, z, what, view]) => { const sh = what === 'narrow' ? 0 : -4; window.__game.camEase = null; window.__game.lookAt(view ? view.x : b.x + b.ux * sh, view ? view.y : b.y + b.uy * sh, z); }, [b, z, what, made.view]);
    await settle(page, 1800);
    await shot(page, `map-water-${what}-${b.kind}-${Math.round(z * 100)}pct-painted`);
  }
  await ctx.close();
} finally { await browser.close(); }
