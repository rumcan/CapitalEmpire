// T229 (#668): in-game shots of Frame with trees (golf/holeframe.ts). On the old start (?start=town) a par 4 is built with New hole in the open
// middle of the old nine with the toggle off (before), then framed from its card (after), from the same view at 30%; the course with every hole
// framed at 15% and a wider view; New hole's panel with the toggle and the price, its frame shown on the map as dots; and a sheet of the after
// shot beside the owner's concept picture (docs/art/concept/maple-falls-concept.webp).
//   node scripts/dev/frame-shots.mjs --base http://127.0.0.1:5186/ --out E:/ClaudeTemp/T229 [--only hole,course,panel,sheet] [--seed 1]
// Needs a dev server (vite) on --base. One headless Edge, closed when done; a fresh profile, so each start is a new game.
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://127.0.0.1:5186/'), out = opt('out', 'output/frame-shots'), seed = opt('seed', '1');
const only = new Set(opt('only', 'hole,course,panel,sheet').split(','));
const W = 1280, H = 800;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
/** wait until no chunk bake is in flight for a second (at most 60 s) */
const settle = async (page, ms = 900) => {
  await page.waitForTimeout(ms);
  await page.evaluate(() => { window.__calm = 0; });
  await page.waitForFunction(() => { const g = window.__game; window.__calm = g.ground.busy === 0 ? window.__calm + 1 : 0; return window.__calm > 20; }, null, { timeout: 60000, polling: 50 }).catch(() => console.log('  (settle timed out)'));
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
/** the new hole: a par 4 across the open middle of the old nine (hole-0 rough), its tee and green; New hole's plan up to the shape step */
const HOLE = { tee: { x: 822.25, y: 470.25 }, green: { x: 992.25, y: 476.25 } };
const plan = (page, frame) => page.evaluate(([h, frame]) => {
  const g = window.__game; g.setTool('course'); g.paint.setFrameTrees(frame);
  if (!g.paint.setPlan()) return 'no plan';
  const w = g.paint.wizard, far = () => ({ x: 1e9, y: 1e9 });
  w.press(h.tee, -1e5, -1e5, far); w.press(h.green, -1e5, -1e5, far);
  return w.step + ' ' + w.hole;
}, [HOLE, frame]);
const files = {};
try {
  if (only.has('hole') || only.has('course') || only.has('sheet')) {
    const { page, ctx } = await open();
    console.log('plan', await plan(page, false));
    const built = await page.evaluate(() => { const g = window.__game, n = g.paint.wizard.hole; const ok = g.paint.buildPlan(); g.paint.setBrush(g.paint.brushKind); g.setTool('select'); return { ok, n }; });
    console.log('built', JSON.stringify(built));
    // the view: round the green, its approach and the frame behind and beside it, at 30%
    const at = { x: HOLE.green.x - 4, y: HOLE.green.y + 6 };
    await hideUi(page);
    if (only.has('hole')) { await look(page, at.x, at.y, 0.3); await settle(page); files.before = await shot(page, 'hole-30pct-before'); }
    const framed = await page.evaluate(n => { const g = window.__game, v = g.holeFrameView(n); const k = g.frameHoleTrees(n); return { view: v, planted: k, again: g.holeFrameView(n) }; }, built.n);
    console.log('framed', JSON.stringify(framed));
    if (only.has('hole')) { await settle(page); files.after = await shot(page, 'hole-30pct-after'); }
    // every hole framed: the course at 15% (the new hole and the old nine's middle) and wider
    const all = await page.evaluate(() => { const g = window.__game, t0 = performance.now(), n = g.frameAllHoles(); return { n, ms: Math.round(performance.now() - t0), frames: [...g.props].filter(p => p.frame).length, props: g.props.size }; });
    console.log('all', JSON.stringify(all));
    if (only.has('course') || only.has('sheet')) {
      await look(page, (HOLE.tee.x + HOLE.green.x) / 2, (HOLE.tee.y + HOLE.green.y) / 2, 0.15); await settle(page, 1500); files.course15 = await shot(page, 'course-15pct-framed');
      await look(page, 960, 330, 0.15); await settle(page, 1500); files.course15b = await shot(page, 'course-15pct-framed-hole3');
      await look(page, 869, 440, 0.06); await settle(page, 2000); files.course6 = await shot(page, 'course-6pct-framed');
    }
    await ctx.close();
  }
  if (only.has('panel')) {
    const { page, ctx } = await open();
    console.log('plan', await plan(page, true));
    await page.evaluate(() => { const g = window.__game, pts = g.paint.wizard.planView(); g.fitView?.(pts, true); });
    await page.waitForFunction(() => !!window.__game.wizardFrame(), null, { timeout: 20000 }).catch(() => console.log('  (no frame preview)'));
    console.log('preview', JSON.stringify(await page.evaluate(() => window.__game.wizardFrame())));
    await page.evaluate(() => document.querySelector('[data-testid="wiz-frame"]')?.scrollIntoView({ block: 'center' }));
    await settle(page, 1200);
    files.panel = await shot(page, 'newhole-frame-toggle');
    const box = await page.evaluate(() => { const r = document.querySelector('[data-testid="wiz-frame"]')?.getBoundingClientRect(); return r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null; });
    if (box) files.panelZoom = await shot(page, 'newhole-frame-toggle-row', { x: Math.max(0, box.x - 8), y: Math.max(0, box.y - 40), width: Math.min(W, box.width + 16), height: Math.min(H, box.height + 56) });
    // the hole card's Trees row on a hole of the old nine (hole 3), its price on the button
    await page.evaluate(() => { const g = window.__game; g.paint.cancelPlan(); g.paint.setBrush(g.paint.brushKind); g.setTool('select'); g.openHoleCard(3); });
    await page.waitForTimeout(600);
    await page.evaluate(() => document.querySelector('[data-testid="hole-frame"]')?.scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(300);
    const card = await page.evaluate(() => { const r = document.querySelector('[data-testid="hole-card"]')?.getBoundingClientRect(); return r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null; });
    if (card) files.card = await shot(page, 'holecard-frame-row', card);
    await ctx.close();
  }
  if (only.has('sheet') && files.course15) {
    // the after shot beside the owner's concept picture, the same height
    const h = 800, concept = await sharp('docs/art/concept/maple-falls-concept.webp').resize({ height: h }).toBuffer({ resolveWithObject: true });
    const ours = await sharp(files.course15).resize({ height: h }).toBuffer({ resolveWithObject: true });
    const gap = 16, w = concept.info.width + ours.info.width + gap;
    await sharp({ create: { width: w, height: h, channels: 3, background: '#111' } })
      .composite([{ input: ours.data, left: 0, top: 0 }, { input: concept.data, left: ours.info.width + gap, top: 0 }])
      .jpeg({ quality: 88, mozjpeg: true }).toFile(join(out, 'sheet-frame-vs-concept.jpg'));
    console.log(join(out, 'sheet-frame-vs-concept.jpg'));
  }
} finally { await browser.close(); }
