// T363 (#1018; the owner, 2026-11-08: "the water glint should be a much more oval shape. A LOT more oval. so stretch it vertically and make it so I can
// make it thinner"): in-game shots of the camera glint on the water (Night panel > Lamp reflections and water glint, Follow the camera), and its
// per-frame cost. The glint is a falloff round the screen's centre (gl.ts FS_QUAD); the new Oval / thinness (SpecLook.oval) narrows it sideways.
//   shots    a pond at 30% and 15% with the glint on, the game's own knobs ("default") and the owner's tuned ones ("tuned": inner .3, outer .4, strength 300%),
//            at the oval the game starts with; --sweep (the branch only): the oval at 1, 2, 3, 5 and 8 side by side
//   numbers  per mode (round = oval 1, oval = the game's own), rounds alternating: the frame's CPU while the camera pans, the draw time (g.draw + a pixel read back)
//            and the GPU time (EXT_disjoint_timer_query_webgl2; --amplify N draws every ground chunk N times so the ground pass stands out; the per-frame
//            figure is the amplified one over N). On a build without the oval (lead/live) both modes are its round glint.
//   node scripts/dev/water-glint-shots.mjs --base http://127.0.0.1:5187/ --out E:/ClaudeTemp/T363 --tag after [--only shots,numbers] [--sweep] [--rounds 3] [--amplify 8] [--zooms 0.3,0.15]
// Needs a dev server (vite) on --base. One headless Edge, closed when done; a fresh profile, so each start is a new game.
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://127.0.0.1:5187/'), out = opt('out', 'output/water-glint'), tag = opt('tag', 'after'), seed = opt('seed', '7');
const only = new Set(opt('only', 'shots,numbers').split(',')), rounds = +opt('rounds', '3'), amplify = +opt('amplify', '8'), zooms = opt('zooms', '0.3,0.15').split(',').map(Number), sweep = args.includes('--sweep');
const W = 1280, H = 800, CLOCK = 12.3;
const TUNED = { inner: 0.3, outer: 0.4, strength: 3, day: 1 };
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const settle = async (page, ms = 900) => {
  await page.waitForTimeout(ms);
  await page.evaluate(() => { window.__calm = 0; });
  await page.waitForFunction(() => { const g = window.__game; window.__calm = g.ground.busy === 0 ? window.__calm + 1 : 0; return window.__calm > 20; }, null, { timeout: 60000, polling: 50 }).catch(() => console.log('  (settle timed out)'));
  await page.waitForTimeout(300);
};
/** wait until the ground has baked nothing new for a while (a glint switch or a new zoom bakes every chunk in view again: settle alone returns between bakes) */
const settleBake = async (page, quiet = 3000, max = 90000) => {
  const t0 = Date.now(); let last = -1, since = Date.now();
  while (Date.now() - t0 < max) {
    const s = await page.evaluate(() => { const g = window.__game; return { b: g.ground.baked, busy: g.ground.busy }; });
    if (s.b !== last || s.busy !== 0) { last = s.b; since = Date.now(); }
    if (Date.now() - since >= quiet) return;
    await page.waitForTimeout(150);
  }
  console.log('  (bake settle timed out)');
};
const save = async (buf, name) => { const file = join(out, `${tag}-${name}.jpg`); await sharp(buf).jpeg({ quality: 88, mozjpeg: true }).toFile(file); console.log(file); return file; };
const label = (w, t) => Buffer.from(`<svg width="${w}" height="26" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="26" fill="#000" opacity="0.6"/><text x="8" y="18" font-family="Arial" font-size="15" fill="#fff">${t}</text></svg>`);
const lookAt = (page, x, y, z) => page.evaluate(([x, y, z]) => { const g = window.__game; g.camEase = null; g.lookAt(x, y, z); }, [x, y, z]);
/** the course's biggest pond's centre (scripts/dev/water-shots.mjs) */
const pondSpot = page => page.evaluate(() => {
  const g = window.__game.courseGrid; if (!g) return null;
  const CT = 0.5, WATER = 3, cells = [];
  for (let j = 0; j < g.h; j++) for (let i = 0; i < g.w; i++) if (g.surf[j * g.w + i] === WATER) cells.push({ x: g.x0 + (i + 0.5) * CT, y: g.y0 + (j + 0.5) * CT });
  if (!cells.length) return null;
  let best = null, bn = -1;
  for (let k = 0; k < cells.length; k += Math.max(1, Math.floor(cells.length / 400))) { const c = cells[k], n = cells.filter(q => Math.abs(q.x - c.x) < 8 && Math.abs(q.y - c.y) < 8).length; if (n > bn) { bn = n; best = c; } }
  const near = cells.filter(q => Math.hypot(q.x - best.x, q.y - best.y) < 14); let x = 0, y = 0; for (const q of near) { x += q.x; y += q.y; }
  return { x: x / near.length, y: y / near.length };
});
const report = { tag, amplify, rounds };
try {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => { try { localStorage.clear(); } catch { /* none */ } });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.route('**/*', r => { const x = r.request(); return x.method() !== 'GET' && x.method() !== 'HEAD' ? r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }) : r.continue(); });
  await page.goto(`${base}?start=town&seed=${seed}`, { timeout: 240000, waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 300000 });
  await page.addStyleTag({ content: '* { visibility: hidden !important } canvas { visibility: visible !important }' });
  // no baking ahead, paused, the day, the water's clock held; the glint on (every chunk is baked again)
  const info = await page.evaluate(([clock]) => { const g = window.__game; g.prebake = () => {}; g.setSpeed(0); g.setShowGrid?.(false); window.__night = 0; g.nightAmount = () => window.__night; g.waterClock = clock; g.specCam = true; return { oval: g.spec.oval ?? null, spec: g.spec, water: g.waterLook }; }, [CLOCK]);
  report.game = info; console.log('the game starts with', JSON.stringify(info));
  await settleBake(page);
  const at = await pondSpot(page); report.pond = at; console.log('pond', JSON.stringify(at));
  if (!at) throw new Error('no pond');
  const setLook = (look) => page.evaluate(look => { window.__game.setSpec(look); }, look);

  if (only.has('shots')) {
    for (const z of zooms) {
      await lookAt(page, at.x, at.y, z); await settle(page, 1500); await settleBake(page);
      for (const [name, look] of [['default', { inner: 0.15, outer: 1, strength: 1, day: 0.5 }], ['tuned', TUNED]]) {
        await setLook(look); await page.waitForTimeout(400);
        const shot = await page.screenshot({ type: 'png' });
        await save(shot, `glint-${name}-${Math.round(z * 100)}pct`);
        // a 2x crop of the middle (the stripe's own texture: crests lit, troughs left, soft sides)
        if (name === 'tuned' && z === zooms[0]) await save(await sharp(shot).extract({ left: W / 2 - 210, top: H / 2 - 140, width: 420, height: 280 }).resize({ width: 840, kernel: 'nearest' }).png().toBuffer(), `glint-tuned-crop-${Math.round(z * 100)}pct`);
      }
      if (sweep && info.oval !== null && z === zooms[0]) {
        // the oval at 1, 2, 3, 5 and 8 over the same water, each a half-size frame with its label, side by side
        const cells = [];
        for (const o of [1, 2, 3, 5, 8]) {
          await setLook({ ...TUNED, oval: o }); await page.waitForTimeout(400);
          const frame = await sharp(await page.screenshot({ type: 'png' })).resize({ width: Math.round(W / 2) }).png().toBuffer();
          cells.push(await sharp(frame).extend({ top: 26, background: '#000' }).composite([{ input: label(Math.round(W / 2), `oval ${o} (tuned look, ${Math.round(z * 100)}%)`), top: 0, left: 0 }]).png().toBuffer());
        }
        const w2 = Math.round(W / 2), h2 = Math.round(H / 2) + 26;
        const sheet = await sharp({ create: { width: w2 * 3 + 16, height: h2 * 2 + 8, channels: 3, background: '#000' } }).composite(cells.map((c, k) => ({ input: c, left: (k % 3) * (w2 + 8), top: Math.floor(k / 3) * (h2 + 8) }))).png().toBuffer();
        await save(sheet, `glint-oval-sweep-${Math.round(z * 100)}pct`);
      }
      await setLook({ inner: 0.15, outer: 1, strength: 1, day: 0.5 });
    }
  }

  if (only.has('numbers')) {
    const num = report.numbers = {};
    await page.evaluate(() => { window.__game.waterClock = null; });
    await setLook(TUNED);
    const ovalDefault = await page.evaluate(() => { const o = window.__game.spec.oval; return typeof o === 'number' ? o : null; });
    for (const z of zooms) {
      await lookAt(page, at.x, at.y, z); await settle(page); await settleBake(page);
      for (let round = 0; round < rounds; round++) for (const m of ['round', 'oval']) {
        await setLook({ oval: m === 'round' ? 1 : ovalDefault ?? 1 }); await page.waitForTimeout(300);
        const key = `${Math.round(z * 100)}pct-${m}`, e = (num[key] ??= { pan: [], draw: [], gpu: [] });
        const pan = await page.evaluate(async z => {
          const g = window.__game, x0 = g.cam.X, y0 = g.cam.Y, v = z >= 0.25 ? [500, 200] : [900, 350], cpu = [], t0 = performance.now(); let last = t0;
          g.camEase = null;
          await new Promise(res => { const step = now => { const dt = Math.min(0.05, (now - last) / 1000), t = (now - t0) / 1000, dir = Math.floor(t / 1.5) % 2 ? -1 : 1; last = now; g.cam.z = z; g.cam.X += v[0] * dt * dir; g.cam.Y += v[1] * dt * dir; if (t > 0.5) cpu.push(g.perf.cpuMs); if (t < 5.5) requestAnimationFrame(step); else res(); }; requestAnimationFrame(step); });
          g.cam.X = x0; g.cam.Y = y0; cpu.sort((a, b) => a - b);
          return { avg: +(cpu.reduce((a, b) => a + b, 0) / Math.max(1, cpu.length)).toFixed(3), p95: +(cpu[Math.floor(0.95 * cpu.length)] ?? 0).toFixed(3), n: cpu.length };
        }, z);
        e.pan.push(pan); await settle(page, 600);
        const draw = await page.evaluate(() => {
          const g = window.__game, gl = g.gl.gl, px = new Uint8Array(4); cancelAnimationFrame(g.raf);
          for (let i = 0; i < 20; i++) { g.draw(performance.now()); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }
          const ts = [];
          for (let i = 0; i < 240; i++) { const a = performance.now(); g.draw(a); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); ts.push(performance.now() - a); }
          g.raf = requestAnimationFrame(g.frame); ts.sort((a, b) => a - b);
          return { median: +ts[120].toFixed(3), p95: +ts[228].toFixed(3), mean: +(ts.reduce((a, b) => a + b, 0) / ts.length).toFixed(3) };
        });
        e.draw.push(draw);
        const gpu = await page.evaluate(async amplify => {
          const g = window.__game, gl = g.gl.gl, ext = gl.getExtension('EXT_disjoint_timer_query_webgl2'); if (!ext) return null;
          const orig = g.gl.drawChunk; if (amplify > 1) g.gl.drawChunk = function (...a) { for (let k = 0; k < amplify; k++) orig.apply(this, a); };
          cancelAnimationFrame(g.raf); const qs = [], BATCH = 8, px = new Uint8Array(4);
          for (let i = 0; i < 60; i++) g.draw(performance.now());
          gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
          for (let i = 0; i < 40; i++) { const q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); for (let k = 0; k < BATCH; k++) g.draw(performance.now()); gl.endQuery(ext.TIME_ELAPSED_EXT); qs.push(q); }
          g.gl.drawChunk = orig; g.raf = requestAnimationFrame(g.frame);
          const res = [];
          for (let tries = 0; tries < 200 && res.length < qs.length; tries++) {
            await new Promise(r => setTimeout(r, 16));
            if (gl.getParameter(ext.GPU_DISJOINT_EXT)) return { disjoint: true };
            while (res.length < qs.length && gl.getQueryParameter(qs[res.length], gl.QUERY_RESULT_AVAILABLE)) res.push(gl.getQueryParameter(qs[res.length], gl.QUERY_RESULT) / 1e6 / BATCH);
          }
          for (const q of qs) gl.deleteQuery(q);
          res.sort((a, b) => a - b);
          return res.length ? { median: +res[res.length >> 1].toFixed(3), p95: +res[Math.floor(res.length * 0.95)].toFixed(3), n: res.length } : null;
        }, amplify);
        if (gpu) e.gpu.push(gpu);
        console.log(key, `round ${round}`, JSON.stringify({ pan, draw, gpu }));
      }
    }
    // pooled: the median of the rounds per key, the per-frame GPU ms (the amplified figure over N), and oval less round
    const med = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
    const sum = report.summary = {};
    for (const z of zooms) {
      const t = Math.round(z * 100), pick = m => { const e = num[`${t}pct-${m}`]; return e ? { panAvg: +med(e.pan.map(p => p.avg)).toFixed(3), panP95: +med(e.pan.map(p => p.p95)).toFixed(3), drawMedian: +med(e.draw.map(d => d.median)).toFixed(3), gpuPerFrame: +(med(e.gpu.filter(g => g.median !== undefined).map(g => g.median)) / amplify).toFixed(4) } : null; };
      const r = pick('round'), o = pick('oval');
      sum[`${t}pct`] = { round: r, oval: o, delta: r && o ? { panAvg: +(o.panAvg - r.panAvg).toFixed(3), panP95: +(o.panP95 - r.panP95).toFixed(3), drawMedian: +(o.drawMedian - r.drawMedian).toFixed(3), gpuPerFrame: +(o.gpuPerFrame - r.gpuPerFrame).toFixed(4) } : null };
    }
    console.log('SUMMARY', JSON.stringify(sum));
  }
  await ctx.close();
} finally { await browser.close(); }
writeFileSync(join(out, `${tag}-report.json`), JSON.stringify(report, null, 1));
console.log('== report written');
