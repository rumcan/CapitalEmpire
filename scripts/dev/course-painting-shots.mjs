// T238 (#697): in-game shots of course painting on the grown town's course land (?fixture=range20): a hole built with New hole, then Edit hole
// with its brushes open (Long grass painted beyond the hole's rough with the Round brush), a round green and a round bunker drawn with the
// Round brush, Long grass beside the rough and the fairway, and the brush shape option (Square | Round) in the Holes panel.
//   node scripts/dev/course-painting-shots.mjs --base http://127.0.0.1:5187/ --out E:/ClaudeTemp/T238 [--zoom 0.3]
// Needs a dev server (vite) on --base. One headless Edge, closed when done.
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://127.0.0.1:5187/'), out = opt('out', 'output/course-painting'), z = +opt('zoom', 0.3);
const W = 1440, H = 900;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
/** wait until no chunk bake is in flight for a second (at most 60 s) */
const settle = async (page, ms = 900) => {
  await page.waitForTimeout(ms);
  await page.evaluate(() => { window.__calm = 0; });
  await page.waitForFunction(() => { const g = window.__game; window.__calm = g.ground.busy === 0 ? window.__calm + 1 : 0; return window.__calm > 20; }, null, { timeout: 60000, polling: 50 }).catch(() => console.log('  (settle timed out)'));
  await page.waitForTimeout(400);
};
const save = async (buf, name) => { const file = join(out, `${name}.jpg`); await sharp(buf).jpeg({ quality: 88, mozjpeg: true }).toFile(file); console.log(file); return file; };
const shot = async (page, name) => save(await page.screenshot({ type: 'png' }), name);
/** the Holes panel as it shows on screen (its box clipped to the window) */
const panelShot = async (page, name) => {
  const b = await page.locator('[data-panel="holes"]').boundingBox(); if (!b) return;
  const x = Math.max(0, b.x), y = Math.max(0, b.y), w = Math.min(W, b.x + b.width) - x, h = Math.min(H, b.y + b.height) - y;
  await save(await page.screenshot({ type: 'png', clip: { x, y, width: w, height: h } }), name);
};
const HIDE = '* { visibility: hidden !important } canvas { visibility: visible !important }';
try {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  page.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 300)); });
  await page.goto(`${base}?fixture=range20&stamp=0`);
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 240000 });
  await page.evaluate(() => { const g = window.__game; g.prebake = () => {}; g.setSpeed(0); g.traffic.budget.money = 9_000_000; });
  await page.waitForFunction(() => window.__game.lotsPending === 0, null, { timeout: 120000, polling: 500 }).catch(() => console.log('  (lots pending timed out)'));

  // a hole with New hole on the biggest piece of owned land, then Edit hole with Long grass beyond its rough (the Round brush)
  const info = await page.evaluate(() => {
    const g = window.__game, p = g.paint, land = g.golfLand();
    const rects = [...land].map(([x, y, w, h]) => ({ x, y, w, h, cx: x + w / 2, cy: y + h / 2 })).filter(r => g.ownedAt(r.cx, r.cy) && !g.onRangePlot?.(r.cx, r.cy)).sort((a, b) => b.w * b.h - a.w * a.h);
    if (!rects.length) return { land };
    const r = rects[0], long = r.w >= r.h, half = Math.min(110, (long ? r.w : r.h) / 2 - 20);
    const tee = long ? { x: r.cx - half, y: r.cy } : { x: r.cx, y: r.cy - half }, green = long ? { x: r.cx + half, y: r.cy } : { x: r.cx, y: r.cy + half };
    g.setTool('course'); p.course = true;
    const far = -1e5; // css px no handle or line is at
    if (!p.setPlan()) return { why: 'setPlan', rect: r };
    p.wizard.suggestM = 0;
    p.pointerDown(tee, far, far); p.pointerUp(0.5); p.pointerMove(green, far, far); p.pointerDown(green, far, far); p.pointerUp(0.5);
    const built = p.buildPlan(), hole = p.wizard.plans().at(-1)?.hole ?? 1;
    return { rect: r, tee, green, built, hole, why: built ? '' : p.wizard.check?.().why };
  });
  console.log('hole', JSON.stringify(info));
  if (!info.built) throw new Error('no hole built');
  // walk out from the hole's middle across it: where the fairway ends and where the rough ends (tiles from the line)
  const geo = await page.evaluate(({ tee, green }) => {
    const g = window.__game, grid = g.courseGrid, S = { none: 0, rough: 1, fairway: 4 };
    const dx = green.x - tee.x, dy = green.y - tee.y, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
    const at = (x, y) => { const cx = Math.floor((x - grid.x0) / 0.5), cy = Math.floor((y - grid.y0) / 0.5); return cx >= 0 && cy >= 0 && cx < grid.w && cy < grid.h ? grid.surf[cy * grid.w + cx] : -1; };
    const mid = { x: (tee.x + green.x) / 2, y: (tee.y + green.y) / 2 };
    let fw = 0, ro = 0; for (let d = 0; d < 60; d += 0.5) { const s = at(mid.x + nx * d, mid.y + ny * d); if (!fw && s !== S.fairway) fw = d; if (fw && s !== S.rough && s !== S.fairway) { ro = d; break; } }
    return { ux, uy, nx, ny, mid, fw, ro, L };
  }, info);
  console.log('across', JSON.stringify(geo));
  await page.evaluate(({ info, geo }) => {
    const g = window.__game, p = g.paint, { ux, uy, nx, ny, mid, ro, L } = geo;
    g.editHole(info.hole);
    p.setEditBrush('longGrass'); p.setBrushShape('round'); p.setBrushR(3);
    const css = (x, y) => { const A = []; g.paint.host?.affine?.(A); return A.length ? { mx: A[0] + x * A[2] + y * A[4], my: A[1] + x * A[3] + y * A[5] } : { mx: -1e5, my: -1e5 }; };
    const stroke = (from, to, steps) => {
      const a = css(from.x, from.y); p.pointerDown(from, a.mx, a.my);
      for (let i = 1; i <= steps; i++) { const t = { x: from.x + (to.x - from.x) * i / steps, y: from.y + (to.y - from.y) * i / steps }, c = css(t.x, t.y); p.pointerMove(t, c.mx, c.my); }
      p.pointerUp(0.5);
    };
    // a band of long grass just past the rough on the far side (-n: right of the panel on screen), along the middle half of the hole, and a
    // wider patch past it
    const off = -(ro + 3), s0 = -L * 0.22, s1 = L * 0.22;
    stroke({ x: mid.x + ux * s0 + nx * off, y: mid.y + uy * s0 + ny * off }, { x: mid.x + ux * s1 + nx * off, y: mid.y + uy * s1 + ny * off }, 60);
    stroke({ x: mid.x + ux * s0 * 0.6 + nx * (off - 5), y: mid.y + uy * s0 * 0.6 + ny * (off - 5) }, { x: mid.x + ux * s1 * 0.5 + nx * (off - 6), y: mid.y + uy * s1 * 0.5 + ny * (off - 6) }, 40);
    p.cursor = { x: mid.x - ux * 3 + nx * (off - 2), y: mid.y - uy * 3 + ny * (off - 2) }; // the brush's round footprint on the long grass
  }, { info, geo });
  await page.evaluate(({ geo }) => { const g = window.__game; g.lookAt(geo.mid.x - geo.nx * (geo.ro - 2) + geo.ux * 10, geo.mid.y - geo.ny * (geo.ro - 2) + geo.uy * 10, 0.4); }, { geo });
  await settle(page, 2500);
  await shot(page, 'edit-hole-with-brushes');
  await panelShot(page, 'edit-hole-paint-panel');

  // Long grass beside the rough and the fairway at 30% (no UI, no brush cursor)
  await page.evaluate(() => { const g = window.__game; g.paint.setBrush('fairway'); g.setTool('select'); g.paint.cursor = null; });
  const css = await page.addStyleTag({ content: HIDE });
  await page.evaluate(({ geo, z }) => { const g = window.__game; g.lookAt(geo.mid.x - geo.nx * (geo.ro + 1), geo.mid.y - geo.ny * (geo.ro + 1), z); }, { geo, z });
  await settle(page, 2500);
  await shot(page, 'long-grass-beside-rough-and-fairway-30pct');

  // a round green and a round bunker beside it, drawn with the Round brush (Shape by hand) on the other side of the hole
  const rg = await page.evaluate(({ info, geo }) => {
    const g = window.__game, p = g.paint, { ux, uy, nx, ny, mid, ro, L } = geo;
    g.setTool('course'); p.course = true; p.setBrush('green'); p.setBrushShape('round'); p.setHole(info.hole);
    const c = { x: mid.x - nx * (ro + 22) + ux * L * 0.33, y: mid.y - ny * (ro + 22) + uy * L * 0.33 }; // past the far rough, beyond the long grass
    const dab = (kind, r, x, y) => { p.setBrush(kind); p.setBrushR(r); p.pointerDown({ x, y }, -1e5, -1e5); p.pointerUp(0.5); };
    dab('green', 7, c.x, c.y);
    dab('bunker', 2.5, c.x + nx * 0 + ux * 10.5, c.y + uy * 10.5);
    dab('bunker', 2, c.x - ux * 9 - nx * 6, c.y - uy * 9 - ny * 6);
    g.setTool('select'); p.cursor = null;
    return c;
  }, { info, geo });
  await page.evaluate(({ rg, z }) => { window.__game.lookAt(rg.x, rg.y, z); }, { rg, z });
  await settle(page, 2500);
  await shot(page, 'round-green-and-bunkers-30pct');

  // the brush shape option in Shape by hand (the Holes panel, Round in hand)
  await css.evaluate(n => n.remove());
  await page.evaluate(() => { const g = window.__game, p = g.paint; g.setTool('course'); p.setBrush('bunker'); p.setBrushShape('round'); p.setBrushR(2.5); });
  await page.waitForTimeout(800);
  await panelShot(page, 'brush-shape-option-panel');
  await shot(page, 'brush-shape-option-full');
  await ctx.close();
} finally { await browser.close(); }
