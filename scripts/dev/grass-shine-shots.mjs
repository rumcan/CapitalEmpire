// T262 (#769, phase 1): in-game shots of the grass shine (grass-shine.ts) with it off and with each height source on (window.__game.grassShine:
// 'd' the chunk's own colour, 'c' the families' bump maps in tile space, 'a' a half-size bump layer per chunk, 'a4' a quarter-size one), on a
// fairway, a green and a town lawn (?start=town) at 30% and 15%; a frame strip panning across the fairway at 30% (the highlight sliding over
// the blades); and the numbers per source: the frame's draw time (synchronous: the draw then a 1 px read that waits for the GPU) and its GPU
// time (EXT_disjoint_timer_query_webgl2, when the browser has it), the bake times, and the GPU bytes of the shine's layers.
//   node scripts/dev/grass-shine-shots.mjs --base http://127.0.0.1:5186/ --out E:/ClaudeTemp/T262 [--only shots,strip,numbers]
//     [--modes off,d,c,a,a4] [--spots fairway,green,lawn] [--look '{"strength":1}'] [--strip d] [--tag v2]
// Needs a dev server (vite) on --base. One headless Edge, closed when done; a fresh profile, so each start is a new game.
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://127.0.0.1:5186/'), out = opt('out', 'output/grass-shine'), look = JSON.parse(opt('look', '{}')), tag = opt('tag', '') ? `-${opt('tag', '')}` : '';
const only = new Set(opt('only', 'shots,strip,numbers').split(',')), modes = opt('modes', 'off,d,c,a,a4').split(','), spotsWanted = opt('spots', 'fairway,green,lawn').split(',');
const stripMode = opt('strip', 'd'), zooms = opt('zooms', '0.3,0.15').split(',').map(Number);
const W = 1280, H = 800;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const settle = async (page, ms = 900) => {
  await page.waitForTimeout(ms);
  await page.evaluate(() => { window.__calm = 0; });
  await page.waitForFunction(() => { const g = window.__game; window.__calm = g.ground.busy === 0 ? window.__calm + 1 : 0; return window.__calm > 20; }, null, { timeout: 60000, polling: 50 }).catch(() => console.log('  (settle timed out)'));
  await page.waitForTimeout(300);
};
const shot = async (page, name) => {
  const file = join(out, `${name}${tag}.jpg`);
  await sharp(await page.screenshot({ type: 'png' })).jpeg({ quality: 90, mozjpeg: true }).toFile(file);
  console.log(file); return file;
};
const setMode = async (page, m) => {
  await page.evaluate(m => { window.__game.grassShine = m; }, m);
  if (m === 'c') await page.waitForFunction(() => !!window.__game.gl.bumpArr, null, { timeout: 30000 }).catch(() => console.log('  (no bump array)'));
};
const report = { look, modes };
try {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  page.on('console', m => { if (m.type() === 'error' || /grass shine/.test(m.text())) console.log('[console]', m.text().slice(0, 300)); });
  await page.goto(`${base}?start=town&stamp=0`);
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 240000 });
  await page.addStyleTag({ content: '* { visibility: hidden !important } canvas { visibility: visible !important }' });
  await page.evaluate(look => { const g = window.__game; g.prebake = () => {}; g.setSpeed(0); g.setShowGrid?.(false); window.__night = 0; g.nightAmount = () => window.__night; g.setShine(look); }, look);
  // ---- the spots: the fairway cell with the most fairway round it, the largest green, the largest town lawn (a lot's or a block's)
  const spots = await page.evaluate(() => {
    const g = window.__game, grid = g.courseGrid, CT = 0.5, S = { fairway: 4, green: 8 }, out = {};
    if (grid) {
      let best = null, bestN = -1;
      for (let j = 0; j < grid.h; j += 4) for (let i = 0; i < grid.w; i += 4) {
        const c = j * grid.w + i; if (grid.surf[c] !== S.fairway) continue;
        let n = 0; for (let dj = -30; dj <= 30; dj += 3) for (let di = -30; di <= 30; di += 3) { const q = (j + dj) * grid.w + i + di; if (q >= 0 && q < grid.surf.length && grid.surf[q] === S.fairway) n++; }
        if (n > bestN) { bestN = n; best = { x: grid.x0 + (i + 0.5) * CT, y: grid.y0 + (j + 0.5) * CT }; }
      }
      out.fairway = best;
      const byHole = new Map();
      for (let j = 0; j < grid.h; j++) for (let i = 0; i < grid.w; i++) { const c = j * grid.w + i; if (grid.surf[c] !== S.green) continue; const l = byHole.get(grid.hole[c]) ?? []; l.push([grid.x0 + (i + 0.5) * CT, grid.y0 + (j + 0.5) * CT]); byHole.set(grid.hole[c], l); }
      let gr = null; for (const l of byHole.values()) if (!gr || l.length > gr.length) gr = l;
      if (gr) out.green = { x: gr.reduce((a, p) => a + p[0], 0) / gr.length, y: gr.reduce((a, p) => a + p[1], 0) / gr.length };
    }
    let lawn = null, area = 0;
    for (const ps of g.ground.lotPatches.values()) for (const p of ps) {
      if (!p.lawn || p.lawn.share < 1) continue;
      let a = 0; const q = p.pts; for (let k = 0; k < q.length; k += 2) { const k2 = (k + 2) % q.length; a += q[k] * q[k2 + 1] - q[k2] * q[k + 1]; } a = Math.abs(a) / 2;
      if (a > area) { area = a; let x = 0, y = 0; for (let k = 0; k < q.length; k += 2) { x += q[k]; y += q[k + 1]; } lawn = { x: x / (q.length / 2), y: y / (q.length / 2), area: Math.round(a) }; }
    }
    out.lawn = lawn;
    return out;
  });
  console.log('spots', JSON.stringify(spots)); report.spots = spots;
  const look_ = (x, y, z) => page.evaluate(([x, y, z]) => { const g = window.__game; g.camEase = null; g.lookAt(x, y, z); }, [x, y, z]);
  // ---- the stills: each spot at each zoom, off and every source
  if (only.has('shots')) for (const sp of spotsWanted) {
    const at = spots[sp]; if (!at) { console.log('no', sp); continue; }
    for (const z of zooms) {
      await look_(at.x, at.y, z);
      for (const m of modes) { await setMode(page, m); await settle(page); await shot(page, `${sp}-${Math.round(z * 100)}pct-${m}`); }
    }
  }
  // ---- the pan strip: the fairway panned across the screen at 30%, off (top row) and stripMode (bottom row); each frame cut to the same 360 x
  //      240 px round one world point (the camera moves, the point stays in the cut's middle), so the highlight is seen sliding over the blades
  if (only.has('strip') && spots.fairway) {
    const places = [0.15, 0.3, 0.45, 0.6, 0.75, 0.9], cw = 360, ch = 240, rows = [], z = 0.3;
    const X = (spots.fairway.x - spots.fairway.y) * 64, Y = (spots.fairway.x + spots.fairway.y) * 32;
    for (const m of ['off', stripMode]) {
      await setMode(page, m); await page.evaluate(([X, Y, z]) => { const g = window.__game; g.camEase = null; g.cam.z = z; g.cam.X = X; g.cam.Y = Y; }, [X, Y, z]); await settle(page);
      const cuts = [];
      for (const fx of places) {
        await page.evaluate(([X, Y, fx, z, W, H]) => { const g = window.__game; g.camEase = null; g.cam.z = z; g.cam.X = X - (fx - 0.5) * W / z; g.cam.Y = Y - (fx - 0.5) * 0.4 * H / z; }, [X, Y, fx, z, W, H]);
        await settle(page, 400);
        const png = await page.screenshot({ type: 'png' }), px = Math.round(fx * W), py = Math.round(H / 2 + (fx - 0.5) * 0.4 * H);
        cuts.push(await sharp(png).extract({ left: Math.max(0, Math.min(W - cw, px - cw / 2)), top: Math.max(0, Math.min(H - ch, py - ch / 2)), width: cw, height: ch }).png().toBuffer());
      }
      rows.push(cuts);
    }
    const gap = 6, lab = 22, Wd = places.length * cw + (places.length - 1) * gap, Hd = 2 * ch + gap + 2 * lab;
    const text = (y, s) => `<text x="8" y="${y}" font-family="Arial" font-size="15" fill="#fff">${s}</text>`;
    const label = Buffer.from(`<svg width="${Wd}" height="${Hd}" xmlns="http://www.w3.org/2000/svg">${text(16, 'off: the same fairway spot as the camera pans (it crosses the screen left to right)')}${text(lab + ch + gap + 16, `on (${stripMode}): the shine slides over the blades and is strongest near the screen's centre`)}</svg>`);
    const comp = [{ input: label, left: 0, top: 0 }];
    rows.forEach((cuts, r) => cuts.forEach((c, i) => comp.push({ input: c, left: i * (cw + gap), top: lab + r * (ch + gap + lab) })));
    const file = join(out, `strip-fairway-30pct-${stripMode}${tag}.jpg`);
    await sharp({ create: { width: Wd, height: Hd, channels: 3, background: '#000' } }).composite(comp).jpeg({ quality: 90, mozjpeg: true }).toFile(file);
    console.log(file);
    // and the same strip's frames whole, on, for a short flip-book
    report.strip = file;
  }
  // ---- the numbers, at the fairway: per source (three rounds, alternating) the bake times of the view (invalidateAll), the frame's draw time
  //      and GPU time (240 frames), and the shine's GPU bytes
  if (only.has('numbers') && spots.fairway) {
    report.frame = {}; report.gpu = {}; report.bake = {}; report.mem = {};
    for (const z of zooms) {
      await look_(spots.fairway.x, spots.fairway.y, z);
      for (let round = 0; round < 3; round++) for (const m of modes) {
        await setMode(page, m); await settle(page);
        const n0 = await page.evaluate(() => { const g = window.__game; g.ground.invalidateAll(); return g.ground.baked; });
        await settle(page);
        const ms = await page.evaluate(n0 => { const g = window.__game, l = []; for (let k = n0; k < g.ground.baked; k++) l.push(g.ground.bakeLog[k % 4096]); return l; }, n0);
        const s = [...ms].sort((a, b) => a - b), q = f => s.length ? s[Math.min(s.length - 1, Math.floor(f * s.length))] : 0;
        const key = `${Math.round(z * 100)}pct-${m}`;
        (report.bake[key] ??= []).push({ bakes: s.length, median: +q(0.5).toFixed(1), mean: +(s.reduce((a, b) => a + b, 0) / (s.length || 1)).toFixed(1) });
        const t = await page.evaluate(() => {
          const g = window.__game, gl = g.gl.gl, px = new Uint8Array(4); cancelAnimationFrame(g.raf);
          for (let i = 0; i < 20; i++) { g.draw(performance.now()); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }
          const ts = [];
          for (let i = 0; i < 240; i++) { const a = performance.now(); g.draw(a); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); ts.push(performance.now() - a); }
          g.raf = requestAnimationFrame(g.frame); ts.sort((a, b) => a - b);
          return { draw: { median: +ts[120].toFixed(2), p95: +ts[228].toFixed(2), mean: +(ts.reduce((a, b) => a + b, 0) / ts.length).toFixed(2) } };
        });
        // the GPU queries' results come a frame or two later
        const gpu = await page.evaluate(async () => {
          const g = window.__game, gl = g.gl.gl, ext = gl.getExtension('EXT_disjoint_timer_query_webgl2'); if (!ext) return null;
          cancelAnimationFrame(g.raf); const qs = [];
          for (let i = 0; i < 120; i++) { const q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); g.draw(performance.now()); gl.endQuery(ext.TIME_ELAPSED_EXT); qs.push(q); }
          g.raf = requestAnimationFrame(g.frame);
          const res = [];
          for (let tries = 0; tries < 200 && res.length < qs.length; tries++) {
            await new Promise(r => setTimeout(r, 16));
            if (gl.getParameter(ext.GPU_DISJOINT_EXT)) return { disjoint: true };
            while (res.length < qs.length && gl.getQueryParameter(qs[res.length], gl.QUERY_RESULT_AVAILABLE)) res.push(gl.getQueryParameter(qs[res.length], gl.QUERY_RESULT) / 1e6);
          }
          for (const q of qs) gl.deleteQuery(q);
          res.sort((a, b) => a - b);
          return res.length ? { median: +res[res.length >> 1].toFixed(3), p95: +res[Math.floor(res.length * 0.95)].toFixed(3), n: res.length } : null;
        });
        (report.frame[key] ??= []).push(t.draw); (report.gpu[key] ??= []).push(gpu);
        if (round === 0) report.mem[key] = await page.evaluate(() => { const g = window.__game; return { groundMB: +(g.ground.residentPx * 4 / 1048576).toFixed(1), shineMB: +(g.ground.shineBytes / 1048576).toFixed(2), bumpArrMB: +((g.ground.grassShine === 'c' ? g.gl.bumpArrBytes : 0) / 1048576).toFixed(2), chunks: [...g.ground.tiles.values()].filter(t => t.tex).length }; });
        console.log(key, JSON.stringify({ frame: t.draw, gpu, bake: report.bake[key].at(-1), mem: report.mem[key] }));
      }
    }
    writeFileSync(join(out, `numbers${tag}.json`), JSON.stringify(report, null, 2));
  }
  writeFileSync(join(out, `report${tag}.json`), JSON.stringify(report, null, 2));
  await ctx.close();
} finally { await browser.close(); }
