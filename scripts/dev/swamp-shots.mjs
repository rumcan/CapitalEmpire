// T199 (#517): in-game shots of a small stream drawn as swamp (window.__game.ground.setSwamp: off is the old creek bed) at 30%, 8% and 2%, the
// swamp's pools with the camera glint off and on (window.__game.specCam) at 30% from the same view, a river nearby (unchanged), and the bake
// times of the same chunks with the swamp off and on (and the glint on).
//   node scripts/dev/swamp-shots.mjs --base http://127.0.0.1:5187/ --out E:/ClaudeTemp/T199 [--quick | --numbers (the bake and frame times only)]
// Needs a dev server (vite) on --base. One headless Edge, closed when done; a fresh profile, so each start is a new game.
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://127.0.0.1:5187/'), out = opt('out', 'output/swamp'), quick = args.includes('--quick'), numbers = args.includes('--numbers');
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
  await sharp(await page.screenshot({ type: 'png' })).jpeg({ quality: 88, mozjpeg: true }).toFile(file);
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
  // no baking ahead (it keeps the workers busy), the game paused, the dev map grid off (it lines the dark water), broad day (0 day .. 1 night, by hand)
  const where = await page.evaluate(() => {
    const g = window.__game; g.prebake = () => {}; g.setSpeed(0); g.setShowGrid(false); window.__night = 0; g.nightAmount = () => window.__night;
    const ws = g.terrain.waters, creeks = ws.filter(w => w.kind === 'creek'), river = ws.find(w => w.kind === 'river');
    // a creek's middle (its longest), and the creek point nearest the river (its mouth, the river nearby)
    const long = creeks.slice().sort((a, b) => b.pts.length - a.pts.length)[0];
    const mid = long.pts[Math.floor(long.pts.length / 2)];
    let mouth = null, best = Infinity;
    for (const c of creeks) for (const p of c.pts) for (const q of river.pts) { const d = Math.hypot(p.x - q.x, p.y - q.y) - q.w / 2; if (d > 6 && d < best) { best = d; mouth = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2, gap: d } } }
    const iso = p => ({ X: (p.x - p.y) * 64, Y: (p.x + p.y) * 32 });
    return { creeks: creeks.length, mid: { ...mid, ...iso(mid) }, mouth: mouth && { ...mouth, ...iso(mouth) } };
  });
  console.log('where', JSON.stringify(where)); report.where = where;
  const place = (p, z) => page.evaluate(([X, Y, z]) => { const g = window.__game; g.camEase = null; g.cam.z = z; g.cam.X = X; g.cam.Y = Y; }, [p.X, p.Y, z]);
  const setSwamp = on => page.evaluate(on => window.__game.ground.setSwamp(on), on);
  const setSpec = on => page.evaluate(on => { window.__game.specCam = on; }, on);
  if (!numbers) {
    // ---- the creek before (the old creek bed) and after (swamp) at 30%, 8% and 2%; the river nearby at 8%
    for (const on of [false, true]) {
      await setSwamp(on);
      for (const z of quick ? [0.3] : [0.3, 0.08, 0.02]) { await place(where.mid, z); await settle(page); await shot(page, `creek-${Math.round(z * 100)}pct-${on ? 'swamp' : 'before'}`); }
      if (where.mouth && !quick) { await place(where.mouth, 0.08); await settle(page); await shot(page, `river-8pct-${on ? 'swamp' : 'before'}`); await place(where.mouth, 0.3); await settle(page); await shot(page, `river-30pct-${on ? 'swamp' : 'before'}`); }
    }
    // ---- the glint off and on, the same view at 30%, by day and at dusk
    await setSwamp(true);
    for (const on of [false, true]) {
      await setSpec(on); await place(where.mid, 0.3); await settle(page);
      for (const [light, v] of quick ? [['day', 0]] : [['day', 0], ['dusk', 0.5]]) { await page.evaluate(v => { window.__night = v; }, v); await page.waitForTimeout(250); await shot(page, `glint-30pct-${light}-${on ? 'on' : 'off'}`); }
    }
    // the glint's centre-to-edge falloff: the same pools at the screen's centre and near its edge (on)
    await place({ X: where.mid.X + 0.42 * W / 0.3, Y: where.mid.Y }, 0.3); await settle(page); await page.evaluate(() => { window.__night = 0; }); await shot(page, 'glint-30pct-day-on-edge');
    await setSpec(false); await settle(page); await shot(page, 'glint-30pct-day-off-edge');
  }
  if (!quick) {
    // ---- the bake times: each switch re-bakes the view (invalidateAll): the worker ms of those bakes, on the same chunks (the creek at the
    //      centre), twice each: swamp off, swamp on, swamp on with the glint
    report.bake = {};
    for (const z of [0.3, 0.08]) {
      await place(where.mid, z);
      for (const rep of [0, 1]) for (const [k, sw, sp] of [['off', false, false], ['swamp', true, false], ['swamp+glint', true, true]]) {
        const n0 = await page.evaluate(([sw, sp]) => { const g = window.__game; g.ground.setSwamp(sw); g.specCam = sp; g.ground.invalidateAll(); return g.ground.baked; }, [sw, sp]);
        await settle(page);
        const ms = await page.evaluate(n0 => { const g = window.__game, l = []; for (let k = n0; k < g.ground.baked; k++) l.push(g.ground.bakeLog[k % 4096]); return l; }, n0);
        const s = [...ms].sort((a, b) => a - b), q = f => s.length ? s[Math.min(s.length - 1, Math.floor(f * s.length))] : 0;
        (report.bake[`${Math.round(z * 100)}pct-${k}`] ??= []).push({ bakes: s.length, median: +q(0.5).toFixed(1), p95: +q(0.95).toFixed(1), mean: +(s.reduce((a, b) => a + b, 0) / (s.length || 1)).toFixed(1) });
      }
    }
    // ---- the frame time with the glint off and on (the swamp at the centre, 30%): the draw then a 1 px read that waits for the GPU
    report.frame = {};
    await place(where.mid, 0.3);
    for (let round = 0; round < 3; round++) for (const on of [false, true]) {
      await setSpec(on); await settle(page);
      const t = await page.evaluate(() => {
        const g = window.__game, gl = g.gl.gl, px = new Uint8Array(4); cancelAnimationFrame(g.raf);
        for (let i = 0; i < 20; i++) { g.draw(performance.now()); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }
        const ts = []; for (let i = 0; i < 240; i++) { const a = performance.now(); g.draw(a); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); ts.push(performance.now() - a); }
        g.raf = requestAnimationFrame(g.frame); ts.sort((a, b) => a - b);
        return { median: +ts[120].toFixed(2), p95: +ts[228].toFixed(2), mean: +(ts.reduce((a, b) => a + b, 0) / ts.length).toFixed(2) };
      });
      (report.frame[`30pct-glint-${on ? 'on' : 'off'}`] ??= []).push(t);
    }
    writeFileSync(join(out, 'numbers.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  }
  await ctx.close();
} finally { await browser.close(); }
