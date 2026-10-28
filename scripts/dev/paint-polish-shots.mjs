// T252 (#731): in-game shots of course painting's polish on the grown town's course land (?fixture=range20): a hole built with New hole, then
// Shape by hand's surfaces (the Holes panel) and Edit hole's "Paint hole n" section at 1920 and 1366 px; the brush cursor over the map with
// Bunker in hand and with Erase; Edit hole's looks entry opened; Edit hole's Ground height (Raise, Lower, Smooth, Flatten).
//   node scripts/dev/paint-polish-shots.mjs --base http://127.0.0.1:5187/ --out E:/ClaudeTemp/T252 --tag after [--widths 1920,1366]
// Needs a dev server (vite) on --base. One headless Edge, closed when done. Saves are not written (non-GET requests are answered locally).
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://127.0.0.1:5187/'), out = opt('out', 'output/paint-polish'), tag = opt('tag', 'after');
const widths = opt('widths', '1920,1366').split(',').map(Number);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const sleep = ms => new Promise(r => setTimeout(r, ms));
/** wait until no chunk bake is in flight for a second (at most 60 s) */
const settle = async (page, ms = 900) => {
  await sleep(ms);
  await page.evaluate(() => { window.__calm = 0; });
  await page.waitForFunction(() => { const g = window.__game; window.__calm = g.ground.busy === 0 ? window.__calm + 1 : 0; return window.__calm > 20; }, null, { timeout: 60000, polling: 50 }).catch(() => console.log('  (settle timed out)'));
  await sleep(400);
};
const save = async (buf, name) => { const file = join(out, `${name}.jpg`); await sharp(buf).jpeg({ quality: 90, mozjpeg: true }).toFile(file); console.log(file); return file; };
/** an element's box clipped to the window, shot (nothing when it is not on screen) */
const boxShot = async (page, sel, name, W, H, pad = 0) => {
  const l = page.locator(sel).first(); if (!(await l.count())) { console.log(`  (no ${sel})`); return; }
  await l.scrollIntoViewIfNeeded().catch(() => {});
  await sleep(250);
  const b = await l.boundingBox(); if (!b) return;
  const x = Math.max(0, b.x - pad), y = Math.max(0, b.y - pad), w = Math.min(W, b.x + b.width + pad) - x, h = Math.min(H, b.y + b.height + pad) - y;
  await save(await page.screenshot({ type: 'png', clip: { x, y, width: w, height: h } }), name);
};

try {
  for (const W of widths) {
    const H = W >= 1920 ? 1080 : 768;
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    await ctx.addInitScript(() => { try { localStorage.clear(); } catch { /* none */ } });
    const page = await ctx.newPage();
    page.on('pageerror', e => console.log('[pageerror]', e.message));
    page.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 300)); });
    await page.route('**/*', r => { const x = r.request(); return x.method() !== 'GET' && x.method() !== 'HEAD' ? r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }) : r.continue(); });
    await page.goto(`${base}?fixture=range20&stamp=0`, { waitUntil: 'domcontentloaded', timeout: 180000 });
    await page.waitForFunction(() => window.__game?.ready, null, { timeout: 300000 });
    await page.evaluate(() => { const g = window.__game; g.prebake = () => {}; g.setSpeed(0); g.closeWelcome?.(false); g.traffic.budget.money = 9_000_000; g.emit(); });
    await page.waitForFunction(() => window.__game.lotsPending === 0, null, { timeout: 120000, polling: 500 }).catch(() => console.log('  (lots pending timed out)'));

    // a hole with New hole on the biggest piece of owned land
    const info = await page.evaluate(() => {
      const g = window.__game, p = g.paint, land = g.golfLand();
      const rects = [...land].map(([x, y, w, h]) => ({ x, y, w, h, cx: x + w / 2, cy: y + h / 2 })).filter(r => g.ownedAt(r.cx, r.cy) && !g.onRangePlot?.(r.cx, r.cy)).sort((a, b) => b.w * b.h - a.w * a.h);
      if (!rects.length) return { why: 'no land' };
      const r = rects[0], long = r.w >= r.h, half = Math.min(110, (long ? r.w : r.h) / 2 - 20);
      const tee = long ? { x: r.cx - half, y: r.cy } : { x: r.cx, y: r.cy - half }, green = long ? { x: r.cx + half, y: r.cy } : { x: r.cx, y: r.cy + half };
      g.setTool('course'); p.course = true;
      const far = -1e5;
      if (!p.setPlan()) return { why: 'setPlan' };
      p.wizard.suggestM = 0;
      p.pointerDown(tee, far, far); p.pointerUp(0.5); p.pointerMove(green, far, far); p.pointerDown(green, far, far); p.pointerUp(0.5);
      const built = p.buildPlan(), hole = p.wizard.plans().at(-1)?.hole ?? 1;
      return { tee, green, built, hole, why: built ? '' : p.wizard.check?.().why };
    });
    console.log(W, 'hole', JSON.stringify(info));
    if (!info.built) throw new Error('no hole built');

    // Shape by hand, Bunker in hand (the Holes panel)
    await page.evaluate(() => { const g = window.__game, p = g.paint; g.setTool('course'); p.setBrush('bunker'); g.emit(); });
    await sleep(800);
    await boxShot(page, '[data-section="shape"]', `${tag}-shape-by-hand-${W}`, W, H, 6);
    await boxShot(page, '[data-panel="holes"]', `${tag}-holes-panel-${W}`, W, H);

    // Edit hole with Bunker in hand: its paint section, and the cursor over the map (the hole's rough, a little off its middle)
    const mid = { x: (info.tee.x + info.green.x) / 2, y: (info.tee.y + info.green.y) / 2 };
    await page.evaluate(({ hole, mid }) => { const g = window.__game, p = g.paint; g.editHole(hole); p.setEditBrush('bunker'); g.lookAt(mid.x, mid.y, 0.45); g.emit(); }, { hole: info.hole, mid });
    await settle(page, 2000);
    await boxShot(page, '[data-section="edit-paint"]', `${tag}-edit-hole-paint-${W}`, W, H, 6);
    await boxShot(page, '[data-panel="holes"]', `${tag}-edit-hole-panel-${W}`, W, H);
    if (W !== 1920) { await ctx.close(); continue; }

    /** the css px of tile (x, y) */
    const css = (t) => page.evaluate(t => { const A = []; window.__game.paint.host.affine(A); return { x: A[0] + t.x * A[2] + t.y * A[4], y: A[1] + t.x * A[3] + t.y * A[5] }; }, t);
    const at = await css({ x: mid.x + 14, y: mid.y - 14 });
    const cursorShot = async name => {
      await page.mouse.move(at.x - 30, at.y - 10); await sleep(120);
      for (let i = 1; i <= 6; i++) { await page.mouse.move(at.x - 30 + 5 * i, at.y - 10 + (10 * i) / 6); await sleep(60); }
      await sleep(900);
      const x = Math.max(0, at.x - 260), y = Math.max(0, at.y - 170);
      await save(await page.screenshot({ type: 'png', clip: { x, y, width: Math.min(560, W - x), height: Math.min(360, H - y) } }), name);
    };
    await cursorShot(`${tag}-cursor-bunker`);
    await save(await page.screenshot({ type: 'png' }), `${tag}-cursor-bunker-full`);
    // Erase
    await page.evaluate(() => { const g = window.__game, p = g.paint; p.rubOut = true; g.emit(); });
    await cursorShot(`${tag}-cursor-erase`);
    await page.evaluate(() => { const g = window.__game, p = g.paint; p.setEditBrush('bunker'); g.emit(); });

    // Edit hole's looks entry, opened
    const looks = page.locator('[data-section="edit-paint"] [data-looks]');
    if (await looks.count()) {
      await page.mouse.move(W / 2, 40);
      await looks.first().click(); await sleep(900);
      await save(await page.screenshot({ type: 'png' }), `${tag}-edit-hole-looks-open`);
      await boxShot(page, '[data-section="edit-paint"]', `${tag}-edit-hole-looks-entry`, W, H, 6);
      await looks.first().click(); await sleep(400);
    } else console.log('  (no looks entry in Edit hole)');

    // Edit hole's Ground height (Raise in hand), and its cursor
    const gh = page.locator('[data-section="edit-paint"] [data-ground-height]');
    if (await gh.count()) {
      await gh.first().click(); await sleep(600);
      await boxShot(page, '[data-section="edit-paint"]', `${tag}-edit-hole-ground-height`, W, H, 6);
      await cursorShot(`${tag}-edit-hole-ground-height-cursor`);
    } else console.log('  (no Ground height in Edit hole)');
    await ctx.close();
  }
} finally { await browser.close(); }
