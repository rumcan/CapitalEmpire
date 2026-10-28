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
/** the tile (x, y) of the densest cluster of lots matching `want` ('rough': rough yards, 'home': house lots), within 16 tiles */
const clusters = (page, want, count = 1) => page.evaluate(([want, count]) => {
  const g = window.__game, rows = [...g.yardRough].map(([k, v]) => ({ k, ...v, l: g.traffic.lots.get(k) })).filter(r => r.l && r.home);
  const mid = r => ({ x: r.l.o[0] + r.l.u[0] * r.l.w / 2 + r.l.n[0] * r.l.d / 2, y: r.l.o[1] + r.l.u[1] * r.l.w / 2 + r.l.n[1] * r.l.d / 2 });
  const rough = rows.filter(r => r.sig), pool = want === 'rough' ? rough : rows;
  const near = (c, list) => list.filter(r => Math.hypot(mid(r).x - c.x, mid(r).y - c.y) < 16).length;
  const ranked = pool.map(mid).map(c => ({ ...c, n: near(c, rough), h: near(c, rows) })).sort((a, b) => (want === 'rough' ? b.n * 3 + b.h - (a.n * 3 + a.h) : b.h - a.h)), out = [];
  for (const c of ranked) if (out.length < count && out.every(o => Math.hypot(o.x - c.x, o.y - c.y) > 28)) out.push(c);
  return out;
}, [want, count]);
const cluster = async (page, want) => (await clusters(page, want, 1))[0] ?? null;
/** the first lot (a house lot with its yard placed) whose composition lays a vegetable bed (dirt with furrow rows): the bed's centre */
const vegBed = page => page.evaluate(async () => {
  const g = window.__game, { compose } = await import('/src/game/lots/compose.ts'), found = [];
  for (const [k, v] of g.yardRough) {
    if (!v.home || v.sig) continue;
    const at = g.lotOf(k); if (!at) continue;
    const c = compose(at.g, at.st), bed = c.ground.find(p => p.tex === 'dirt' && p.lines && p.lines.length >= 8);
    if (bed) { let x = 0, y = 0; for (let i = 0; i < 8; i += 2) { x += bed.pts[i] / 4; y += bed.pts[i + 1] / 4; } found.push({ key: k, x, y, tex: bed.tex, rows: bed.lines.length / 4, area: Math.hypot(bed.pts[2] - bed.pts[0], bed.pts[3] - bed.pts[1]) * Math.hypot(bed.pts[6] - bed.pts[0], bed.pts[7] - bed.pts[1]) }); }
  }
  // the biggest bed on a mown yard
  return found.sort((a, b) => b.area - a.area)[0] ?? null;
});
/** a golf course on the owned land: a fairway down the middle of it (hole 1) and, beside it, a Waste area, through the Course brush as a player's
 *  strokes (the tool's own pointer calls): the centre of what was painted */
const paintCourse = page => page.evaluate(async () => {
  const g = window.__game, land = g.golfLand();
  // the largest piece of owned land whose middle is free of the range's plot (the range is not painted over)
  const rects = [...land].map(([x, y, w, h]) => ({ x, y, w, h, cx: x + w / 2, cy: y + h / 2 })).filter(r => g.ownedAt(r.cx, r.cy) && !g.onRangePlot(r.cx, r.cy)).sort((a, b) => b.w * b.h - a.w * a.h);
  if (!rects.length) return { land };
  const { cx, cy } = rects[0];
  g.setTool('course'); const p = g.paint; p.course = true;
  const stroke = (kind, r, from, to, steps) => {
    p.setBrush(kind); p.setBrushCells(0); p.setBrushR(r); p.brushHole = 1;
    p.pointerDown({ x: from.x, y: from.y }, 0, 0);
    for (let i = 1; i <= steps; i++) p.pointerMove({ x: from.x + (to.x - from.x) * i / steps, y: from.y + (to.y - from.y) * i / steps }, 0, 0);
    p.pointerUp(0.5);
  };
  // the fairway runs along the screen's x axis in tile space; the waste area is a bay beside it (+y), as a few dabs and a short stroke
  stroke('fairway', 5, { x: cx - 22, y: cy }, { x: cx + 22, y: cy }, 44);
  stroke('waste', 3, { x: cx - 8, y: cy + 8.5 }, { x: cx + 10, y: cy + 10 }, 18);
  stroke('waste', 3, { x: cx + 10, y: cy + 10 }, { x: cx + 14, y: cy + 14 }, 6);
  g.setTool('select'); p.cursor = null; // the brush's footprint and grid are not part of the picture
  const grid = g.courseGrid; const counts = {}; for (const v of grid.surf) counts[v] = (counts[v] || 0) + 1;
  return { cx, cy, rect: rects[0], counts, ownedMid: g.ownedAt(cx, cy) };
});
try {
  if (probe) {
    for (const [n, url] of [['start', `${base}?stamp=0`], ['grown', `${base}?fixture=range20&stamp=0`]]) {
      const page = await open(url, true);
      if (n === 'start') { await grow(page, +opt('pop', 150)); }
      console.log(n, JSON.stringify(await summary(page))); await page.context().close();
    }
  }
  const z = +opt('zoom', 0.3);
  if (only.has('start')) {
    // a range start's town early: grown to about 150 residents (the share of rough yards is about a third), the densest cluster of rough yards
    const page = await open(`${base}?stamp=0`);
    await grow(page, +opt('pop', 150));
    // --knob 2: the gear menu's Rough yards at 200% (more of the yards are rough, to see every look at once)
    const knob = +opt('knob', 1); if (knob !== 1) { await page.evaluate(k => window.__game.setRoughYards(k), knob); await page.waitForFunction(() => window.__game.lotsPending === 0, null, { timeout: 60000, polling: 300 }).catch(() => console.log('  (lots pending timed out)')); }
    const cs = await clusters(page, 'rough', +opt('views', 1)); console.log('start clusters', JSON.stringify(cs), JSON.stringify(await summary(page)));
    let k = 0; for (const c of cs) { await look(page, c.x, c.y, z); await settle(page); await shot(page, `start-rough-yards${knob !== 1 ? '-knob' + knob * 100 : ''}-30pct${cs.length > 1 ? '-' + 'abcdefgh'[k] : ''}`); k++; }
    await page.context().close();
  }
  if (only.has('grown')) {
    // the grown town (the range start's year 20, ?fixture=range20): mown lawns, the share of rough yards at its floor
    const page = await open(`${base}?fixture=range20&stamp=0`);
    await page.waitForFunction(() => window.__game.lotsPending === 0, null, { timeout: 120000, polling: 500 }).catch(() => console.log('  (lots pending timed out)'));
    const c = await cluster(page, 'home'); console.log('grown cluster', JSON.stringify(c), JSON.stringify(await summary(page)));
    if (c) { await look(page, c.x, c.y, z); await settle(page); await shot(page, 'grown-town-mown-lawns-30pct'); }
    if (only.has('veg')) {
      const v = await vegBed(page); console.log('veg bed', JSON.stringify(v));
      if (v) { await look(page, v.x, v.y, z); await settle(page); await shot(page, 'veg-garden-dirt-30pct'); }
    }
    if (only.has('waste')) {
      const w = await paintCourse(page); console.log('waste', JSON.stringify(w));
      if (w) { await look(page, w.cx + 2, w.cy + 7, z); await settle(page, 2000); await shot(page, 'waste-area-beside-fairway-30pct'); }
    }
    await page.context().close();
  }
} finally { await browser.close(); }
