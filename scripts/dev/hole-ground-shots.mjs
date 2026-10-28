// T263 (#771): in-game shots of New hole's "Shape the ground" (ext/hole-ground). On the old start (?start=town) a par 4 is built with New hole in
// the open middle of the old nine, once with Shape the ground off and once on (fresh games of the same seed: the same hole, the same plan
// seed), Frame with trees off so the ground shows; each from the same views at 30% (the green and its surround; the drive's landing zone)
// and 15% (the landing zone to past the green), at the default Slope light and at the gear menu's strongest (2); side-by-side sheets of off and on, and a heat
// map of where they differ (the shaping's light: |on - off| x 4); then New hole's panel in the shape step with the tick box, the earthworks
// price and the gold pill on the map.
//   node scripts/dev/hole-ground-shots.mjs --base http://127.0.0.1:5187/ --out E:/ClaudeTemp/T263 [--only off,on,panel] [--seed 1]
// Needs a dev server (vite) on --base. One headless Edge, closed when done; a fresh profile, so each start is a new game.
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://127.0.0.1:5187/'), out = opt('out', 'output/hole-ground-shots'), seed = opt('seed', '1');
const only = new Set(opt('only', 'off,on,panel').split(','));
const W = 1280, H = 800;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
/** wait until no chunk bake is in flight for a second (at most 60 s) */
const settle = async (page, ms = 900) => {
  await page.waitForTimeout(ms);
  await page.evaluate(() => { window.__calm = 0; });
  await page.waitForFunction(() => { const g = window.__game; window.__calm = g.ground.idle ? window.__calm + 1 : 0; return window.__calm > 20; }, null, { timeout: 60000, polling: 50 }).catch(() => console.log('  (settle timed out)'));
  await page.waitForTimeout(400);
};
const shot = async (page, name, clip) => {
  const file = join(out, `${name}.jpg`);
  await sharp(await page.screenshot({ type: 'png', ...(clip ? { clip } : {}) })).jpeg({ quality: 90, mozjpeg: true }).toFile(file);
  console.log(file); return file;
};
const hideUi = page => page.addStyleTag({ content: '* { visibility: hidden !important } canvas { visibility: visible !important }' });
const look = (page, x, y, z) => page.evaluate(([x, y, z]) => { const g = window.__game; g.camEase = null; g.lookAt(x, y, z); }, [x, y, z]);
/** a fresh old start, loaded, paused, broad day, no baking ahead */
const open = async () => {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.goto(`${base}?start=town&seed=${seed}`);
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 240000 });
  await page.evaluate(() => { const g = window.__game; g.prebake = () => {}; g.setSpeed(0); g.setShowGrid?.(false); window.__night = 0; g.nightAmount = () => window.__night; });
  return { page, ctx };
};
/** the new hole: a par 4 across the open middle of the old nine (T229's spot); New hole's plan up to the shape step */
const HOLE = { tee: { x: 822.25, y: 470.25 }, green: { x: 992.25, y: 476.25 } };
const plan = (page, shape) => page.evaluate(([h, shape]) => {
  const g = window.__game; g.setTool('course'); g.paint.setFrameTrees(false); g.paint.setShapeGround(shape);
  if (!g.paint.setPlan()) return 'no plan';
  const w = g.paint.wizard, far = () => ({ x: 1e9, y: 1e9 });
  w.press(h.tee, -1e5, -1e5, far); w.press(h.green, -1e5, -1e5, far);
  return `${w.step} hole ${w.hole}`;
}, [HOLE, shape]);
/** builds the planned hole, back to the select tool; its number, the toast's price line and the ground's numbers */
const build = page => page.evaluate(() => {
  const g = window.__game, p = g.paint, n = p.wizard.hole, e = p.groundCost(), s = p.groundShape(), gh = p.wizard.ghost();
  const ok = p.buildPlan(); p.setBrush(p.brushKind); g.setTool('select');
  return { ok, n, grass: gh?.cost ?? 0, earth: e, tilt: s.tilt, raise: s.raise, features: s.features.map(f => `${f.kind} ${f.h.toFixed(2)} m`), samples: s.k.length };
});
const files = {};
try {
  for (const mode of ['off', 'on']) {
    if (!only.has(mode)) continue;
    const { page, ctx } = await open();
    console.log(mode, await plan(page, mode === 'on'));
    console.log('built', JSON.stringify(await build(page)));
    await hideUi(page);
    // the green and its surround at 30%; the drive's landing zone at 30%; the whole hole at 15%
    for (const light of [1, 2]) {
      const tag = light === 1 ? '' : '-light2';
      if (light !== 1) await page.evaluate(v => window.__game.setSlopeLight(v), light);
      await look(page, HOLE.green.x - 6, HOLE.green.y + 4, 0.3); await settle(page, 3000); files[`${mode}Green${tag}`] = await shot(page, `hole-30pct-green-shape-${mode}${tag}`);
      await look(page, HOLE.tee.x + 95, HOLE.tee.y + 4, 0.3); await settle(page, 3000); files[`${mode}Fairway${tag}`] = await shot(page, `hole-30pct-fairway-shape-${mode}${tag}`);
      await look(page, HOLE.green.x - 55, HOLE.green.y - 4, 0.15); /* the hole from its landing zone to past the green (all of it is wider than the screen at 15%) */ await settle(page, 3000); files[`${mode}Hole${tag}`] = await shot(page, `hole-15pct-shape-${mode}${tag}`);
    }
    await ctx.close();
  }
  if (only.has('bank')) {
    // a steep bank sculpted with the Ground height brush (Raise, the biggest step, six strokes along one line: about 3 m over 12 m) north of
    // the hole, at 30%: run before and after a change to the slope light (--tag names the shot)
    const { page, ctx } = await open();
    const r = await page.evaluate(() => {
      const g = window.__game, p = g.paint; g.setTool('course'); p.setHeight({ mode: 'raise', r: 6, level: 5 });
      const a = { x: 880, y: 432 }, b = { x: 930, y: 432 };
      for (let k = 0; k < 6; k++) { p.pointerDown(a, 0, 0); for (let t = 0.1; t <= 1.001; t += 0.1) p.pointerMove({ x: a.x + (b.x - a.x) * t, y: a.y }, 0, 0); p.pointerUp(0.5); }
      p.setBrush(p.brushKind); g.setTool('select');
      const d = g.courseHeight.data; let hi = 0; for (const v of d) hi = Math.max(hi, v);
      return { hi: +hi.toFixed(2), rev: g.courseHeight.rev };
    });
    console.log('bank', JSON.stringify(r));
    await hideUi(page);
    await look(page, 905, 432, 0.3); await settle(page, 3000); files.bank = await shot(page, `bank-30pct-brush-${opt('tag', 'now')}`);
    await ctx.close();
  }
  if (only.has('bench')) {
    // the chunk bakes at 30% over the shaped hole: every chunk in view baked again five times; the worker ms median and p95 (the slope light is
    // a bake constant: this is what a change to it costs)
    const { page, ctx } = await open();
    console.log('bench', await plan(page, true)); await build(page);
    await page.addStyleTag({ content: '* { visibility: hidden !important } canvas { visibility: visible !important }' });
    const ms = [];
    for (const at of [{ x: HOLE.green.x - 6, y: HOLE.green.y + 4 }, { x: HOLE.tee.x + 95, y: HOLE.tee.y + 4 }]) {
      await look(page, at.x, at.y, 0.3); await settle(page, 2000);
      for (let r = 0; r < 5; r++) {
        const n0 = await page.evaluate(() => { const g = window.__game; g.ground.invalidateAll(); return g.ground.baked; });
        await settle(page, 600);
        ms.push(...await page.evaluate(n0 => { const g = window.__game.ground, out = []; for (let n = n0; n < g.baked; n++) out.push(g.bakeLog[n % g.bakeLog.length]); return out; }, n0));
      }
    }
    ms.sort((a, b) => a - b);
    const q = p => ms.length ? +ms[Math.min(ms.length - 1, Math.floor(p * ms.length))].toFixed(2) : null;
    console.log(`bench: ${ms.length} bakes at 30%, worker ms median ${q(0.5)}, p95 ${q(0.95)}`);
    await ctx.close();
  }
  if (only.has('panel')) {
    const { page, ctx } = await open();
    console.log('plan', await plan(page, true));
    await page.evaluate(() => { const g = window.__game, pts = g.paint.wizard.planView(); g.fitView?.(pts, true); });
    console.log('earth', JSON.stringify(await page.evaluate(() => window.__game.paint.groundCost())));
    await page.evaluate(() => document.querySelector('[data-testid="wiz-ground"]')?.scrollIntoView({ block: 'center' }));
    await settle(page, 1500);
    files.panel = await shot(page, 'newhole-shape-ground-panel');
    const box = await page.evaluate(() => { const a = document.querySelector('[data-testid="wiz-frame"]')?.getBoundingClientRect(), b = document.querySelector('[data-testid="wiz-ground"]')?.getBoundingClientRect(); return a && b ? { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.max(a.right, b.right) - Math.min(a.x, b.x), height: Math.max(a.bottom, b.bottom) - Math.min(a.y, b.y) } : null; });
    if (box) files.panelZoom = await shot(page, 'newhole-shape-ground-row', { x: Math.max(0, box.x - 8), y: Math.max(0, box.y - 8), width: Math.min(W, box.width + 16), height: Math.min(H, box.height + 16) });
    // the tick box off: the price row says Off, the Build price drops
    await page.evaluate(() => { window.__game.paint.setShapeGround(false); });
    await page.waitForTimeout(500);
    if (box) files.panelOff = await shot(page, 'newhole-shape-ground-row-off', { x: Math.max(0, box.x - 8), y: Math.max(0, box.y - 8), width: Math.min(W, box.width + 16), height: Math.min(H, box.height + 16) });
    await page.evaluate(() => { window.__game.paint.setShapeGround(true); });
    await ctx.close();
  }
  // a before/after sheet of each view: Shape the ground off (left), on (right)
  for (const v of ['Green', 'Fairway', 'Hole']) for (const tag of ['', '-light2']) {
    const a = files[`off${v}${tag}`], b = files[`on${v}${tag}`]; if (!a || !b) continue;
    const gap = 12, l = await sharp(a).toBuffer(), r = await sharp(b).toBuffer();
    const file = join(out, `sheet-${v.toLowerCase()}${tag}-off-vs-on.jpg`);
    await sharp({ create: { width: W * 2 + gap, height: H, channels: 3, background: '#111' } }).composite([{ input: l, left: 0, top: 0 }, { input: r, left: W + gap, top: 0 }]).jpeg({ quality: 88, mozjpeg: true }).toFile(file);
    console.log(file);
    if (tag) continue;
    // where the shaping's light lands: |on - off| x 4, grey
    const A = await sharp(a).raw().toBuffer({ resolveWithObject: true }), B = await sharp(b).raw().toBuffer(), o = Buffer.alloc(A.data.length);
    for (let i = 0; i < o.length; i += 3) { const d = Math.min(255, (Math.abs(A.data[i] - B[i]) + Math.abs(A.data[i + 1] - B[i + 1]) + Math.abs(A.data[i + 2] - B[i + 2])) * 4 / 3); o[i] = o[i + 1] = o[i + 2] = d; }
    const heat = join(out, `heat-${v.toLowerCase()}-shape-on-minus-off.jpg`);
    await sharp(o, { raw: { width: A.info.width, height: A.info.height, channels: 3 } }).jpeg({ quality: 85 }).toFile(heat);
    console.log(heat);
  }
} finally { await browser.close(); }
