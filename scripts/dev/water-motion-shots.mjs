// T248 (#718): in-game shots of the water's motion (water-motion.ts: two ripple layers, the rivers' flow, the waves lapping at the shore, the
// wet bank and the sparkle) with the motion off (today's still water) and on, from the same views and the same held clock: the river's shore
// in the grown town (?fixture=range20) and a course pond (?start=town) at 30% and 15%, and a close shore crop; an animated WebP of each
// (frames a quarter second apart on the held clock); and the numbers off and on: the bake times of the view (and the masks' ms), the frame's CPU
// while the camera pans (the bench's speeds), its draw time, its GPU time (EXT_disjoint_timer_query_webgl2; --amplify N draws every ground
// chunk N times so the ground pass stands out), and the masks' GPU bytes.
//   node scripts/dev/water-motion-shots.mjs --base http://127.0.0.1:5187/ --out E:/ClaudeTemp/T248 [--only shots,anim,numbers] [--modes off,on | main]
//     [--views river,pond,bridge] [--zooms 0.3,0.15] [--frames 16] [--tag v1] [--look '{"foam":1.5}'] [--amplify 20] [--rounds 3] [--parts bake,pan,draw,gpu]
// Needs a dev server (vite) on --base. One headless Edge, closed when done; a fresh profile, so each start is a new game. On a build without the
// motion (main) the switch does nothing: run it with --modes main.
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://127.0.0.1:5187/'), out = opt('out', 'output/water-motion'), tag = opt('tag', '') ? `-${opt('tag', '')}` : '', seed = opt('seed', '7');
const only = new Set(opt('only', 'shots,anim,numbers').split(',')), modes = opt('modes', 'off,on').split(','), look = JSON.parse(opt('look', '{}'));
const views = opt('views', 'river,pond').split(','), zooms = opt('zooms', '0.3,0.15').split(',').map(Number), frames = +opt('frames', '16'), amplify = +opt('amplify', '1'), rounds = +opt('rounds', '3');
const parts = new Set(opt('parts', 'bake,pan,draw,gpu').split(','));
const W = 1280, H = 800, CLOCK = 12.3, CROP = { left: 427, top: 267, width: 426, height: 266 };
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const settle = async (page, ms = 900) => {
  await page.waitForTimeout(ms);
  await page.evaluate(() => { window.__calm = 0; });
  await page.waitForFunction(() => { const g = window.__game; window.__calm = g.ground.busy === 0 ? window.__calm + 1 : 0; return window.__calm > 20; }, null, { timeout: 60000, polling: 50 }).catch(() => console.log('  (settle timed out)'));
  await page.waitForTimeout(300);
};
const png = page => page.screenshot({ type: 'png' });
const save = async (buf, name) => { const file = join(out, `${name}${tag}.jpg`); await sharp(buf).jpeg({ quality: 90, mozjpeg: true }).toFile(file); console.log(file); return file; };
const open = async url => {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  page.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 300)); });
  await page.goto(url, { timeout: 240000, waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 240000 });
  await page.addStyleTag({ content: '* { visibility: hidden !important } canvas { visibility: visible !important }' });
  await page.evaluate(([look, clock]) => { const g = window.__game; g.prebake = () => {}; g.setSpeed(0); g.setShowGrid?.(false); window.__night = 0; g.nightAmount = () => window.__night; if (g.setWaterMotion) { g.setWaterMotion(look); g.waterClock = clock; } }, [look, CLOCK]);
  return { page, ctx };
};
const lookAt = (page, x, y, z) => page.evaluate(([x, y, z]) => { const g = window.__game; g.camEase = null; g.lookAt(x, y, z); }, [x, y, z]);
/** the motion off or on (every chunk is baked again); main: no switch */
const setMode = (page, m) => page.evaluate(m => { const g = window.__game; if (m === 'main' || !g.setWaterMotion) return false; g.waterMotion = m === 'on'; return true; }, m);
const clock = (page, t) => page.evaluate(t => { window.__game.waterClock = t; }, t);
/** the river's shore nearest the town (its houses' lots), and the river's middle there (scripts/dev/water-shots.mjs) */
const riverSpot = page => page.evaluate(() => {
  const g = window.__game, river = g.terrain.waters.filter(w => w.kind === 'river').sort((a, b) => b.pts.length - a.pts.length)[0]; if (!river) return null;
  const pts = [...(g.houseLots?.values?.() ?? [])].map(l => l.c ?? l.centre ?? l).filter(p => p && Number.isFinite(p.x));
  let tx = 0, ty = 0, n = 0;
  for (const p of pts) { tx += p.x; ty += p.y; n++; }
  if (!n && g.townPts?.length) for (const p of g.townPts) { tx += p.x ?? p[0]; ty += p.y ?? p[1]; n++; }
  if (!n) { const c = river.pts[Math.floor(river.pts.length / 2)]; tx = c.x; ty = c.y; n = 1; }
  tx /= n; ty /= n;
  let best = null, bd = Infinity;
  for (const p of river.pts) { const d = Math.hypot(p.x - tx, p.y - ty) - p.w / 2; if (d < bd) { bd = d; best = p; } }
  const l = Math.hypot(tx - best.x, ty - best.y) || 1, ux = (tx - best.x) / l, uy = (ty - best.y) / l;
  // (the view: a third of the way from the shore into the water, so both the bank and the open river show)
  return { x: best.x + ux * best.w / 3, y: best.y + uy * best.w / 3, w: best.w };
});
/** a bridge over the river (the road network's bridge segments: the longest), its middle */
const bridgeSpot = page => page.evaluate(() => {
  const g = window.__game; let best = null, bl = 0;
  for (const s of g.net.segs) { if (s.kind !== 1) continue; const l = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y); if (l > bl) { bl = l; best = s; } }
  return best ? { x: (best.a.x + best.b.x) / 2, y: (best.a.y + best.b.y) / 2, len: bl } : null;
});
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
const report = { modes, look, views: {} };
const label = (w, t) => Buffer.from(`<svg width="${w}" height="24" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="24" fill="#000" opacity="0.55"/><text x="8" y="17" font-family="Arial" font-size="15" fill="#fff">${t}</text></svg>`);
try {
  for (const view of views) {
    const { page, ctx } = await open(view === 'pond' ? `${base}?start=town&seed=${seed}` : `${base}?fixture=range20`);
    const at = view === 'river' ? await riverSpot(page) : view === 'bridge' ? await bridgeSpot(page) : await pondSpot(page);
    report.views[view] = at; console.log(view, JSON.stringify(at));
    if (!at) { await ctx.close(); continue; }
    // ---- stills: each zoom, each mode, the same held clock; a side by side of the first and last mode, and a close crop of the shore
    if (only.has('shots')) {
      for (const z of zooms) {
        await lookAt(page, at.x, at.y, z); const bufs = [];
        for (const m of modes) { await setMode(page, m); await clock(page, CLOCK); await settle(page); const b = await png(page); bufs.push(b); await save(b, `${view}-${Math.round(z * 100)}pct-${m}`); }
        if (bufs.length > 1) {
          const half = await Promise.all(bufs.map(b => sharp(b).resize(W / 2, H / 2).png().toBuffer()));
          const sbs = await sharp({ create: { width: W + 6, height: H / 2, channels: 3, background: '#000' } }).composite([{ input: half[0], left: 0, top: 0 }, { input: half.at(-1), left: W / 2 + 6, top: 0 }, { input: label(W / 2, `${modes[0]} (before)`), left: 0, top: 0 }, { input: label(W / 2, `${modes.at(-1)} (after)`), left: W / 2 + 6, top: 0 }]).png().toBuffer();
          await save(sbs, `${view}-${Math.round(z * 100)}pct-before-after`);
          // the close crop: the screen's middle third, twice its size (the shore lies there)
          const crops = await Promise.all(bufs.map(b => sharp(b).extract(CROP).resize(Math.round(W * 2 / 3), Math.round(H * 2 / 3), { kernel: 'nearest' }).png().toBuffer()));
          const cw = Math.round(W * 2 / 3), ch = Math.round(H * 2 / 3);
          const cc = await sharp({ create: { width: 2 * cw + 6, height: ch, channels: 3, background: '#000' } }).composite([{ input: crops[0], left: 0, top: 0 }, { input: crops.at(-1), left: cw + 6, top: 0 }, { input: label(cw, `${modes[0]} (before), 2x crop`), left: 0, top: 0 }, { input: label(cw, `${modes.at(-1)} (after), 2x crop`), left: cw + 6, top: 0 }]).png().toBuffer();
          await save(cc, `${view}-${Math.round(z * 100)}pct-shore-crop`);
        }
      }
    }
    // ---- the animated WebP: the motion on, frames a quarter second apart on the held clock, at each zoom: the whole screen at half size and
    //      the shore crop at full size side by side
    if (only.has('anim') && !modes.includes('main')) {
      await setMode(page, 'on');
      for (const z of zooms) {
        await lookAt(page, at.x, at.y, z); await clock(page, CLOCK); await settle(page);
        const fr = [];
        for (let i = 0; i < frames; i++) {
          await clock(page, CLOCK + i * 0.25); await page.waitForTimeout(60);
          const b = await png(page);
          const full = await sharp(b).resize(W / 2, H / 2).png().toBuffer(), crop = await sharp(b).extract(CROP).resize({ height: H / 2 }).png().toBuffer();
          const cm = await sharp(crop).metadata();
          fr.push(await sharp({ create: { width: W / 2 + 6 + cm.width, height: H / 2, channels: 3, background: '#000' } }).composite([{ input: full, left: 0, top: 0 }, { input: crop, left: W / 2 + 6, top: 0 }, { input: label(W / 2, `${view} ${Math.round(z * 100)}%, t = ${(i * 0.25).toFixed(2)} s`), left: 0, top: 0 }]).png().toBuffer());
        }
        const file = join(out, `${view}-${Math.round(z * 100)}pct-anim${tag}.webp`);
        await sharp(fr, { join: { animated: true } }).webp({ quality: 78, delay: Array(frames).fill(250), loop: 0 }).toFile(file);
        console.log(file);
      }
    }
    // ---- the numbers, per zoom and mode (rounds, alternating): the bake times of the view, the frame's CPU while panning, its draw and GPU
    //      times (the clock running), the masks' bytes
    if (only.has('numbers')) {
      const num = report.views[view].numbers = {};
      await page.evaluate(() => { window.__game.waterClock = null; });
      for (const z of zooms) {
        await lookAt(page, at.x, at.y, z);
        for (let round = 0; round < rounds; round++) for (const m of modes) {
          await setMode(page, m); await settle(page);
          const key = `${Math.round(z * 100)}pct-${m}`, e = (num[key] ??= { bake: [], pan: [], draw: [], gpu: [] });
          if (parts.has('bake')) {
          const n0 = await page.evaluate(() => { const g = window.__game; g.ground.invalidateAll(); return g.ground.baked; });
          await settle(page);
          const [ms, mk] = await page.evaluate(n0 => { const g = window.__game, l = [], k2 = []; for (let k = n0; k < g.ground.baked; k++) { l.push(g.ground.bakeLog[k % 4096]); k2.push(g.ground.waterLog?.[k % 4096] ?? 0); } return [l, k2]; }, n0);
          const med = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
          e.bake.push({ bakes: ms.length, median: +med(ms).toFixed(2), mean: +(ms.reduce((a, b) => a + b, 0) / (ms.length || 1)).toFixed(2), maskMedian: +med(mk).toFixed(3), maskMax: +Math.max(0, ...mk).toFixed(2), all: ms, masks: mk });
          }
          const pan = !parts.has('pan') ? null : await page.evaluate(async z => {
            const g = window.__game, x0 = g.cam.X, y0 = g.cam.Y, v = z >= 0.25 ? [500, 200] : z >= 0.12 ? [900, 350] : [1600, 600], cpu = [], t0 = performance.now(); let last = t0;
            g.camEase = null;
            await new Promise(res => { const step = now => { const dt = Math.min(0.05, (now - last) / 1000), t = (now - t0) / 1000, dir = Math.floor(t / 1.5) % 2 ? -1 : 1; last = now; g.cam.z = z; g.cam.X += v[0] * dt * dir; g.cam.Y += v[1] * dt * dir; if (t > 0.5) cpu.push(g.perf.cpuMs); if (t < 6.5) requestAnimationFrame(step); else res(); }; requestAnimationFrame(step); });
            g.cam.X = x0; g.cam.Y = y0; cpu.sort((a, b) => a - b);
            return { avg: +(cpu.reduce((a, b) => a + b, 0) / Math.max(1, cpu.length)).toFixed(3), p95: +(cpu[Math.floor(0.95 * cpu.length)] ?? 0).toFixed(3), n: cpu.length };
          }, z);
          if (pan) { e.pan.push(pan); await settle(page); }
          const draw = !parts.has('draw') ? null : await page.evaluate(() => {
            const g = window.__game, gl = g.gl.gl, px = new Uint8Array(4); cancelAnimationFrame(g.raf);
            for (let i = 0; i < 20; i++) { g.draw(performance.now()); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }
            const ts = [];
            for (let i = 0; i < 240; i++) { const a = performance.now(); g.draw(a); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); ts.push(performance.now() - a); }
            g.raf = requestAnimationFrame(g.frame); ts.sort((a, b) => a - b);
            return { median: +ts[120].toFixed(2), p95: +ts[228].toFixed(2), mean: +(ts.reduce((a, b) => a + b, 0) / ts.length).toFixed(2) };
          });
          if (draw) e.draw.push(draw);
          const gpu = !parts.has('gpu') ? null : await page.evaluate(async amplify => {
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
          if (round === 0) e.mem = await page.evaluate(() => { const g = window.__game; return { groundMB: +(g.ground.residentPx * 4 / 1048576).toFixed(1), waterKB: +((g.ground.waterBytes ?? 0) / 1024).toFixed(1), chunks: [...g.ground.tiles.values()].filter(t => t.tex).length }; });
          const b = e.bake.at(-1); console.log(view, key, JSON.stringify({ bake: b ? { ...b, all: undefined, masks: undefined } : null, pan, draw, gpu, mem: e.mem }));
        }
      }
      await page.evaluate(c => { window.__game.waterClock = c; }, CLOCK);
    }
    await ctx.close();
  }
  writeFileSync(join(out, `report${tag}.json`), JSON.stringify(report, null, 2));
} finally { await browser.close(); }
