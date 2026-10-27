// T215 (#561, phase 1): in-game shots of the street lamps' reflection pools with the camera specular off (baked, as before) and on
// (window.__game.specCam): a lamp-lit street with a pool at the screen's centre and at its edge, at night, at dusk and by day, at 30% and 15%;
// a frame strip panning the street from the edge to the centre; and the bake and frame times with it off and on.
//   node scripts/dev/spec-cam-shots.mjs --base http://127.0.0.1:5187/ --out E:/ClaudeTemp/T215 [--quick] [--look '{"inner":0.15}']
// Needs a dev server (vite) on --base. One headless Edge, closed when done; a fresh profile, so each start is a new game.
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://127.0.0.1:5187/'), out = opt('out', 'output/spec-cam'), quick = args.includes('--quick'), look = JSON.parse(opt('look', '{}'));
const W = 1280, H = 800;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
/** wait until no chunk bake is in flight for a second (at most 40 s) */
const settle = async (page, ms = 900) => {
  await page.waitForTimeout(ms);
  await page.evaluate(() => { window.__calm = 0; });
  await page.waitForFunction(() => { const g = window.__game; window.__calm = g.ground.busy === 0 ? window.__calm + 1 : 0; return window.__calm > 20; }, null, { timeout: 40000, polling: 50 }).catch(() => console.log('  (settle timed out)'));
  await page.waitForTimeout(300);
};
const shot = async (page, name) => {
  const file = join(out, `${name}.jpg`);
  await sharp(await page.screenshot({ type: 'png' })).jpeg({ quality: 85, mozjpeg: true }).toFile(file);
  console.log(file); return file;
};
const report = {};
try {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  page.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 300)); });
  await page.goto(`${base}?start=town&stamp=0`);
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 180000 });
  await page.addStyleTag({ content: '* { visibility: hidden !important } canvas { visibility: visible !important }' });
  // no baking ahead while the shots are taken (it keeps the workers busy), the look's knobs, and the night by hand (0 day .. 1 night)
  const street = await page.evaluate(look => {
    const g = window.__game; g.prebake = () => {}; g.setSpec(look); window.__night = 1; g.nightAmount = () => window.__night;
    // the pool with the most pools within 24 tiles: a lamp-lit street
    const ps = g.net.pools; let best = null, bestN = -1;
    for (const p of ps) { let n = 0; for (const q of ps) if (Math.hypot(q.x - p.x, q.y - p.y) < 24) n++; if (n > bestN) { bestN = n; best = p; } }
    return best ? { x: best.x, y: best.y, X: (best.x - best.y) * 64, Y: (best.x + best.y) * 32, near: bestN, pools: ps.length, spec: g.spec } : { pools: ps.length };
  }, look);
  console.log('street', JSON.stringify(street)); report.street = street;
  if (street.X === undefined) throw new Error('no lamp pool on the map');
  /** the camera with the pool at screen fraction fx across (0.5 = centre), at zoom z */
  const place = (fx, z) => page.evaluate(([X, Y, fx, z, W]) => { const g = window.__game; g.camEase = null; g.cam.z = z; g.cam.X = X - (fx - 0.5) * W / z; g.cam.Y = Y; }, [street.X, street.Y, fx, z, W]);
  const setSpec = async on => { await page.evaluate(on => { window.__game.specCam = on; }, on); };
  const setNight = v => page.evaluate(v => { window.__night = v; }, v);
  const lights = quick ? [['night', 1]] : [['night', 1], ['dusk', 0.5], ['day', 0]];
  const zooms = quick ? [0.3] : [0.3, 0.15];
  // ---- the views: off and on; for each zoom the pool at the centre and at the edge, at night, at dusk and by day
  for (const on of [false, true]) {
    await setSpec(on);
    for (const z of zooms) for (const [pos, fx] of [['centre', 0.5], ['edge', 0.92]]) {
      await place(fx, z); await settle(page);
      for (const [light, v] of lights) { await setNight(v); await page.waitForTimeout(250); await shot(page, `${light}-${Math.round(z * 100)}pct-${pos}-${on ? 'on' : 'off'}`); }
    }
  }
  if (!quick) {
    // ---- the frame strip: the street panned from the edge to the centre, at night, at 30%, off and on (six frames, two rows of three)
    for (const on of [false, true]) {
      await setSpec(on); await setNight(1);
      const frames = [];
      for (const fx of [0.95, 0.86, 0.77, 0.68, 0.59, 0.5]) { await place(fx, 0.3); await settle(page, 500); frames.push(await page.screenshot({ type: 'png' })); }
      const tw = W / 2, th = H / 2, tiles = await Promise.all(frames.map(f => sharp(f).resize(tw, th).png().toBuffer()));
      const file = join(out, `strip-night-30pct-${on ? 'on' : 'off'}.jpg`);
      await sharp({ create: { width: tw * 3, height: th * 2, channels: 3, background: '#000' } }).composite(tiles.map((t, i) => ({ input: t, left: (i % 3) * tw, top: Math.floor(i / 3) * th }))).jpeg({ quality: 85, mozjpeg: true }).toFile(file);
      console.log(file);
    }
    // ---- the numbers: each switch re-bakes the view (invalidateAll): the worker ms of those bakes; then the draw time, synchronous (the
    //      frame's CPU and GPU: the draw, then a 1 px read that waits for the GPU), 120 frames, the pool at the centre, at night and by day
    report.bake = {}; report.frame = {};
    for (const z of [0.3, 0.15]) {
      await place(0.5, z);
      for (const rep of [0, 1]) for (const on of [false, true]) {
        const n0 = await page.evaluate(on => { const g = window.__game; g.specCam = on; g.ground.invalidateAll(); return g.ground.baked; }, on);
        await settle(page);
        const ms = await page.evaluate(n0 => { const g = window.__game, l = []; for (let k = n0; k < g.ground.baked; k++) l.push(g.ground.bakeLog[k % 4096]); return l; }, n0);
        const s = [...ms].sort((a, b) => a - b), q = f => s.length ? s[Math.min(s.length - 1, Math.floor(f * s.length))] : 0;
        const k = `${Math.round(z * 100)}pct-${on ? 'on' : 'off'}`;
        (report.bake[k] ??= []).push({ bakes: s.length, median: +q(0.5).toFixed(1), p95: +q(0.95).toFixed(1), mean: +(s.reduce((a, b) => a + b, 0) / (s.length || 1)).toFixed(1) });
      }
      for (const on of [false, true]) {
        await setSpec(on); await settle(page);
        for (const [light, v] of [['night', 1], ['day', 0]]) {
          await setNight(v);
          const t = await page.evaluate(() => {
            const g = window.__game, gl = g.gl.gl, px = new Uint8Array(4); cancelAnimationFrame(g.raf);
            for (let i = 0; i < 10; i++) { g.draw(performance.now()); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }
            const ts = []; for (let i = 0; i < 120; i++) { const a = performance.now(); g.draw(a); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); ts.push(performance.now() - a); }
            g.raf = requestAnimationFrame(g.frame); ts.sort((a, b) => a - b);
            return { median: +ts[60].toFixed(2), p95: +ts[114].toFixed(2), mean: +(ts.reduce((a, b) => a + b, 0) / ts.length).toFixed(2) };
          });
          report.frame[`${Math.round(z * 100)}pct-${light}-${on ? 'on' : 'off'}`] = t;
        }
      }
    }
    writeFileSync(join(out, 'numbers.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  }
  await ctx.close();
} finally { await browser.close(); }
