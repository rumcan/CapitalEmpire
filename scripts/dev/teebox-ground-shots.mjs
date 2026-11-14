// #1278 (the owner, 2026-11-14: "can we remove the desert texture underneath the driving range tee box"): in-game shots of the driving range's tee box on the desert ground, dirt and turfed,
// at the closest zoom, before and after the fix. The tee box, its slab and its mats are ground of their own (PatchPaint.own): no sand spills over the turf's edge and no litter lies on them.
// "Before" is the same game with that flag taken off the range's ground patches (the old drawing, exactly: the scatter keeps its random stream, litter-scatter.ts), "after" with it on.
//   node scripts/dev/teebox-ground-shots.mjs --base http://127.0.0.1:5461/ --out docs/jam-shots [--prefix teebox-ground] [--seed 1] [--w 1600 --h 900] [--only turf,dirt,end,far] [--desert on|off]
// Needs a dev server (vite, VITE_JAM=1 for the jam look) on --base. One headless Chrome, closed when done; a fresh profile, so the start is a new game (the desert theme on unless --desert off).
// Writes <prefix>-turf-before|after.jpg and <prefix>-dirt-before|after.jpg (30%, the tee box's middle), <prefix>-turf-edge-before|after.jpg and <prefix>-dirt-edge-... (the slab and the turf's
// front edge, 3x), <prefix>-turf-end-before|after.jpg (the tee box's end, 5x) and <prefix>-turf-far-before|after.jpg (15%).
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://127.0.0.1:5461/'), out = opt('out', 'output/teebox-ground-shots'), prefix = opt('prefix', 'teebox-ground'), seed = opt('seed', '1'), desert = opt('desert', 'on');
const only = new Set(opt('only', 'turf,dirt,end,far').split(',')), W = +opt('w', 1600), H = +opt('h', 900), Q = +opt('q', 82);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-unsafe-swiftshader'] });
const settle = async (page, ms = 1200) => {
  await page.waitForTimeout(ms);
  await page.evaluate(() => { window.__calm = 0; });
  await page.waitForFunction(() => { const g = window.__game; window.__calm = g.ground.busy === 0 && (g.perf?.chunksPending ?? 0) === 0 ? window.__calm + 1 : 0; return window.__calm > 25; }, null, { timeout: 180000, polling: 50 }).catch(() => console.log('  (settle timed out)'));
  await page.waitForTimeout(500);
};
const write = async (png, name, crop, scale) => {
  const f = join(out, `${prefix}-${name}.jpg`);
  let img = sharp(png); if (crop) img = img.extract({ left: crop[0], top: crop[1], width: crop[2], height: crop[3] }).resize({ width: Math.round(crop[2] * scale), kernel: 'lanczos3' });
  await img.jpeg({ quality: Q, mozjpeg: true }).toFile(f); console.log(f);
};
/** the camera on a tile point at a zoom (the tutorial's own camera glide and its pulse rings let go of; asked again before each shot, where the view is kept) */
let view = null;
const look = async (page, x, y, z) => { view = [x, y, z]; await page.evaluate(([x, y, z]) => { const g = window.__game; g.camEase = null; g.guideAnchor = null; g.focus = null; g.guideRings = null; g.teeRingOn = false; g.lookAt(x, y, z); }, view); };
/** the range's ground patches as laid, with or without the own flag (the wrapper keeps the last laid set) */
const lay = (page, own) => page.evaluate(own => { const g = window.__game; g.setLotGround('range:ground', window.__all.map(p => (own ? p : { ...p, paint: { ...p.paint, own: undefined } }))); }, own);
try {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 }), page = await ctx.newPage();
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  page.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 300)); });
  await page.goto(`${base}?start=range&seed=${seed}&desert=${desert}`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__game?.ready && window.__game.range?.scene, null, { timeout: 600000 });
  await page.addStyleTag({ content: 'html.noui * { visibility: hidden !important } html.noui canvas { visibility: visible !important }' });
  await page.evaluate(() => {
    const g = window.__game; g.prebake = () => {}; g.closeWelcome?.(false); g.closeWho?.('Tester', 2); g.setSpeed(0); g.setShowGrid?.(false); window.__night = 0; g.nightAmount = () => window.__night; g.guideAnchor = null;
    document.documentElement.classList.add('noui');
    // (the range's ground patches as the scene lays them: kept by a wrapper, so the same set can be laid with the flag and without)
    const orig = g.setLotGround.bind(g); window.__cap = null; g.setLotGround = (k, p) => { if (k === 'range:ground') window.__cap = p; return orig(k, p); };
  });
  await page.waitForTimeout(9000); // (the new game's tutorial glides the camera to the shop and pulses a ring there a few seconds in)
  const tee = await page.evaluate(() => { const ps = window.__game.range.scene.teeBox, xs = ps.filter((_, i) => i % 2 === 0), ys = ps.filter((_, i) => i % 2 === 1); return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2, x0: Math.max(...xs), y0: (Math.min(...ys) + Math.max(...ys)) / 2 }; });
  console.log('tee box', JSON.stringify(tee));
  /** the screen as it is now in both looks (before: the flag off; after: on), written as <name>-before|after (a crop of it, scaled, when asked) */
  const both = async (name, crop, scale) => {
    for (const own of [false, true]) {
      await lay(page, own); await look(page, ...view); await settle(page, 1500); await look(page, ...view); await page.waitForTimeout(400);
      const cam = await page.evaluate(() => ({ ...window.__game.cam })); if (Math.abs(cam.z - view[2]) > 1e-6) console.log('  (the camera is at zoom', cam.z, 'not', view[2], ')');
      await write(await page.screenshot({ type: 'png' }), `${name}-${own ? 'after' : 'before'}`, crop, scale);
    }
  };
  /** the range's ground laid again with the tee box turfed or dirt, its patches kept for lay() */
  const resync = turfed => page.evaluate(turfed => {
    const g = window.__game, b = g.range.ctx.biz(); b.owned = b.owned.filter(x => x !== 'teeturf'); if (turfed) b.owned.push('teeturf');
    g.range.sync(true); window.__all = window.__cap.slice();
  }, turfed);
  for (const state of ['turf', 'dirt']) {
    if (!only.has(state) && !(state === 'turf' && (only.has('end') || only.has('far')))) continue;
    await resync(state === 'turf');
    if (only.has(state)) { await look(page, tee.x, tee.y, 0.3); await both(state, null, 1); await both(`${state}-edge`, [560, 330, 500, 260], 3); }
    if (state === 'turf' && only.has('end')) { await look(page, tee.x0 - 4, tee.y + 1, 0.3); await both('turf-end', [780, 380, 300, 160], 5); }
    if (state === 'turf' && only.has('far')) { await look(page, tee.x, tee.y - 3, 0.15); await both('turf-far', null, 1); }
  }
  await ctx.close();
} finally { await browser.close(); }
