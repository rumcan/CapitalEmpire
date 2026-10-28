// T262 (#769): in-game shots of the grass shine (grass-shine.ts) off and on (window.__game.grassShine; on by default): a fairway, a green, the
// rough (?start=town) and a town lawn (--start fixture=range20: a new town's block lawns wear the desert) at 30% and 15%; a frame strip and an
// animated pan across the fairway at 30% (the sheen following the camera over the grass); and the numbers off and on: the frame's draw time
// (synchronous: the draw then a 1 px read that waits for the GPU), its GPU time (EXT_disjoint_timer_query_webgl2, when the browser has it), the
// bake times and the GPU bytes of the weight masks.
//   node scripts/dev/grass-shine-shots.mjs --base http://127.0.0.1:5186/ --out E:/ClaudeTemp/T262 [--only shots,strip,flip,numbers] [--frames 20]
//     [--start fixture=range20] [--seed N (the map)] [--at tee:688,619 (spots by hand, tiles; with --spots tee)] [--rounds 5 (--only pan)] [--modes off,on] [--spots fairway,green,rough,lawn] [--look '{"strength":1}'] [--tag v2] [--dpr 2] [--amplify 20]
// --amplify N: while the GPU time is measured every ground chunk is drawn N times over itself (gl.drawChunk), so the ground pass's cost (the
// shine's shader) stands out from the rest of the frame on a fast GPU; the GPU result is then the ground pass's ms per frame x N plus the rest
// Needs a dev server (vite) on --base. One headless Edge, closed when done; a fresh profile, so each start is a new game.
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://127.0.0.1:5186/'), out = opt('out', 'output/grass-shine'), look = JSON.parse(opt('look', '{}')), tag = opt('tag', '') ? `-${opt('tag', '')}` : '';
const only = new Set(opt('only', 'shots,strip,numbers').split(',')), modes = opt('modes', 'off,on').split(','), spotsWanted = opt('spots', 'fairway,green,rough,lawn').split(',');
const start = opt('start', 'start=town'), stripMode = 'on', zooms = opt('zooms', '0.3,0.15').split(',').map(Number), dpr = +opt('dpr', '1'), amplify = +opt('amplify', '1');
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
/** the shine off or on (every chunk is baked again); 'main': no switch (a build without the shine, for the side by side) */
const setMode = (page, m) => (m === 'main' ? Promise.resolve() : page.evaluate(on => { window.__game.grassShine = on; }, m === 'on'));
const report = { look, modes };
try {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: dpr });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  page.on('console', m => { if (m.type() === 'error' || /grass shine/.test(m.text())) console.log('[console]', m.text().slice(0, 300)); });
  await page.goto(`${base}?${start}&stamp=0${opt('seed', '') ? `&seed=${opt('seed', '')}` : ''}`, { timeout: 240000, waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 240000 });
  await page.addStyleTag({ content: '* { visibility: hidden !important } canvas { visibility: visible !important }' });
  await page.evaluate(look => { const g = window.__game; g.prebake = () => {}; g.setSpeed(0); g.setShowGrid?.(false); window.__night = 0; g.nightAmount = () => window.__night; g.setShine?.(look); }, look);
  // ---- the spots: the fairway cell with the most fairway round it, the largest green, the largest town lawn (a lot's or a block's)
  const spots = await page.evaluate(() => {
    const g = window.__game, grid = g.courseGrid, CT = 0.5, S = { rough: 1, fairway: 4, green: 8 }, out = {};
    if (grid) {
      let best = null, bestN = -1;
      for (let j = 0; j < grid.h; j += 4) for (let i = 0; i < grid.w; i += 4) {
        const c = j * grid.w + i; if (grid.surf[c] !== S.fairway) continue;
        let n = 0; for (let dj = -30; dj <= 30; dj += 3) for (let di = -30; di <= 30; di += 3) { const q = (j + dj) * grid.w + i + di; if (q >= 0 && q < grid.surf.length && grid.surf[q] === S.fairway) n++; }
        if (n > bestN) { bestN = n; best = { x: grid.x0 + (i + 0.5) * CT, y: grid.y0 + (j + 0.5) * CT }; }
      }
      out.fairway = best;
      // the rough cell with the most rough round it (well inside it, the view mostly rough)
      let rb = null, rn = -1;
      for (let j = 0; j < grid.h; j += 4) for (let i = 0; i < grid.w; i += 4) {
        const c = j * grid.w + i; if (grid.surf[c] !== S.rough) continue;
        let n = 0; for (let dj = -30; dj <= 30; dj += 3) for (let di = -30; di <= 30; di += 3) { const q = (j + dj) * grid.w + i + di; if (q >= 0 && q < grid.surf.length && grid.surf[q] === S.rough) n++; }
        if (n > rn) { rn = n; rb = { x: grid.x0 + (i + 0.5) * CT, y: grid.y0 + (j + 0.5) * CT }; }
      }
      out.rough = rb;
      const byHole = new Map();
      for (let j = 0; j < grid.h; j++) for (let i = 0; i < grid.w; i++) { const c = j * grid.w + i; if (grid.surf[c] !== S.green) continue; const l = byHole.get(grid.hole[c]) ?? []; l.push([grid.x0 + (i + 0.5) * CT, grid.y0 + (j + 0.5) * CT]); byHole.set(grid.hole[c], l); }
      let gr = null; for (const l of byHole.values()) if (!gr || l.length > gr.length) gr = l;
      if (gr) out.green = { x: gr.reduce((a, p) => a + p[0], 0) / gr.length, y: gr.reduce((a, p) => a + p[1], 0) / gr.length };
    }
    let lawn = null, area = 0;
    for (const ps of g.ground.lotPatches.values()) for (const p of ps) {
      // a lot's grass lawn (its look state built or upgraded: painted-surfaces.ts STATE_LAWN), not an untended yard; a new town's block lawns
      // wear the desert (painted-surfaces.json lawns), so the grown town's fixture has them (--start fixture=range20)
      if (!p.lawn || p.lawn.share < 1 || p.lawn.z < 1 || p.lawn.rough || !['built', 'upgraded'].includes(p.lawn.st)) continue;
      let a = 0; const q = p.pts; for (let k = 0; k < q.length; k += 2) { const k2 = (k + 2) % q.length; a += q[k] * q[k2 + 1] - q[k2] * q[k + 1]; } a = Math.abs(a) / 2;
      if (a > area) { area = a; let x = 0, y = 0; for (let k = 0; k < q.length; k += 2) { x += q[k]; y += q[k + 1]; } lawn = { x: x / (q.length / 2), y: y / (q.length / 2), area: Math.round(a) }; }
    }
    out.lawn = lawn;
    // the range's tee turf (a painted area), when the start has one
    for (const ps of g.ground.lotPatches.values()) for (const p of ps) if (p.paint && /range-tee/.test(p.tex) && !out.rangeTee) { const q = p.pts; let x = 0, y = 0; for (let k = 0; k < q.length; k += 2) { x += q[k]; y += q[k + 1]; } out.rangeTee = { x: x / (q.length / 2), y: y / (q.length / 2) }; }
    return out;
  });
  // --at name:x,y;name:x,y (tiles): spots by hand (a hole's tee)
  for (const a of opt('at', '').split(';').filter(Boolean)) { const [n, xy] = a.split(':'), [x, y] = xy.split(',').map(Number); spots[n] = { x, y }; }
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
    const label = Buffer.from(`<svg width="${Wd}" height="${Hd}" xmlns="http://www.w3.org/2000/svg">${text(16, 'off: the same fairway spot as the camera pans (it crosses the screen left to right)')}${text(lab + ch + gap + 16, "on: the sheen follows the camera over the grass, strongest near the screen's centre")}</svg>`);
    const comp = [{ input: label, left: 0, top: 0 }];
    rows.forEach((cuts, r) => cuts.forEach((c, i) => comp.push({ input: c, left: i * (cw + gap), top: lab + r * (ch + gap + lab) })));
    const file = join(out, `strip-fairway-30pct-${stripMode}${tag}.jpg`);
    await sharp({ create: { width: Wd, height: Hd, channels: 3, background: '#000' } }).composite(comp).jpeg({ quality: 90, mozjpeg: true }).toFile(file);
    console.log(file);
    // and the same strip's frames whole, on, for a short flip-book
    report.strip = file;
  }
  // ---- the pan capture (a flip-book, an animated WebP): the camera panning across the fairway at 30%, FLIP frames, each the whole
  //      screen at half size, off on the left and stripMode on the right at the same camera
  if (only.has('flip') && spots.fairway) {
    const N = +opt('frames', '20'), z = 0.3, X = (spots.fairway.x - spots.fairway.y) * 64, Y = (spots.fairway.x + spots.fairway.y) * 32, sides = [];
    for (const m of ['off', stripMode]) {
      await setMode(page, m); const frames = [];
      for (let i = 0; i < N; i++) {
        const f = -0.3 + 0.6 * i / (N - 1);
        await page.evaluate(([X, Y, f, z, W, H]) => { const g = window.__game; g.camEase = null; g.cam.z = z; g.cam.X = X + f * W / z; g.cam.Y = Y + f * 0.4 * H / z; }, [X, Y, f, z, W, H]);
        await settle(page, i ? 300 : 900);
        frames.push(await sharp(await page.screenshot({ type: 'png' })).resize(W / 2, H / 2).png().toBuffer());
      }
      sides.push(frames);
    }
    const lab = m => Buffer.from(`<svg width="${W / 2}" height="24" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="24" fill="#000" opacity="0.55"/><text x="8" y="17" font-family="Arial" font-size="15" fill="#fff">${m}</text></svg>`);
    const both = [];
    for (let i = 0; i < N; i++) both.push(await sharp({ create: { width: W + 6, height: H / 2, channels: 3, background: '#000' } }).composite([{ input: sides[0][i], left: 0, top: 0 }, { input: sides[1][i], left: W / 2 + 6, top: 0 }, { input: lab('off'), left: 0, top: 0 }, { input: lab('grass shine on'), left: W / 2 + 6, top: 0 }]).png().toBuffer());
    const anim = sharp(both, { join: { animated: true } });
    // (an animated WebP: a GIF of the same frames is three times its size)
    const webp = join(out, `pan-fairway-30pct-${stripMode}${tag}.webp`);
    await anim.webp({ quality: 80, delay: Array(N).fill(160), loop: 0 }).toFile(webp);
    console.log(webp); report.flip = webp;
  }
  // ---- the frame's CPU alone (--only pan): per zoom, --rounds pans over the fairway (the same as the numbers' pan), for a side by side of
  //      two builds on one map (--seed)
  if (only.has('pan') && spots.fairway) {
    report.pan = {};
    for (const z of zooms) {
      await look_(spots.fairway.x, spots.fairway.y, z); await settle(page);
      for (let round = 0; round < +opt('rounds', '5'); round++) {
        const pan = await page.evaluate(async z => {
          const g = window.__game, x0 = g.cam.X, y0 = g.cam.Y, v = z >= 0.25 ? [500, 200] : z >= 0.12 ? [900, 350] : [1600, 600], cpu = [], t0 = performance.now(); let last = t0;
          g.camEase = null;
          await new Promise(res => { const step = now => { const dt = Math.min(0.05, (now - last) / 1000), t = (now - t0) / 1000, dir = Math.floor(t / 1.5) % 2 ? -1 : 1; last = now; g.cam.z = z; g.cam.X += v[0] * dt * dir; g.cam.Y += v[1] * dt * dir; if (t > 0.5) cpu.push(g.perf.cpuMs); if (t < 6.5) requestAnimationFrame(step); else res(); }; requestAnimationFrame(step); });
          g.cam.X = x0; g.cam.Y = y0; cpu.sort((a, b) => a - b);
          return { avg: +(cpu.reduce((a, b) => a + b, 0) / Math.max(1, cpu.length)).toFixed(3), p95: +(cpu[Math.floor(0.95 * cpu.length)] ?? 0).toFixed(3), n: cpu.length };
        }, z);
        (report.pan[`${Math.round(z * 100)}pct`] ??= []).push(pan); await settle(page, 300);
      }
      console.log(`${Math.round(z * 100)}pct`, JSON.stringify(report.pan[`${Math.round(z * 100)}pct`]));
    }
    writeFileSync(join(out, `pan${tag}.json`), JSON.stringify(report.pan, null, 2));
  }
  // ---- the numbers, at the fairway: per mode (three rounds, alternating) the bake times of the view (invalidateAll) and their masks' share,
  //      the frame's CPU time while the camera pans (6 s, the bench's speeds), its draw time and GPU time (240 frames), and the masks' GPU bytes
  if (only.has('numbers') && spots.fairway) {
    report.frame = {}; report.gpu = {}; report.bake = {}; report.mem = {}; report.pan = {};
    for (const z of zooms) {
      await look_(spots.fairway.x, spots.fairway.y, z);
      for (let round = 0; round < 3; round++) for (const m of modes) {
        await setMode(page, m); await settle(page);
        const n0 = await page.evaluate(() => { const g = window.__game; g.ground.invalidateAll(); return g.ground.baked; });
        await settle(page);
        const [ms, mk] = await page.evaluate(n0 => { const g = window.__game, l = [], k2 = []; for (let k = n0; k < g.ground.baked; k++) { l.push(g.ground.bakeLog[k % 4096]); k2.push(g.ground.shineLog?.[k % 4096] ?? 0); } return [l, k2]; }, n0);
        const med = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
        const key = `${Math.round(z * 100)}pct-${m}`;
        (report.bake[key] ??= []).push({ bakes: ms.length, median: +med(ms).toFixed(2), mean: +(ms.reduce((a, b) => a + b, 0) / (ms.length || 1)).toFixed(2), maskMedian: +med(mk).toFixed(2), maskMax: +Math.max(0, ...mk).toFixed(2) });
        // the frame's CPU (engine perf.cpuMs) while the camera pans at the bench's speed for the zoom, there and back
        const pan = await page.evaluate(async z => {
          const g = window.__game, x0 = g.cam.X, y0 = g.cam.Y, v = z >= 0.25 ? [500, 200] : z >= 0.12 ? [900, 350] : [1600, 600], cpu = [], t0 = performance.now(); let last = t0;
          g.camEase = null;
          await new Promise(res => { const step = now => { const dt = Math.min(0.05, (now - last) / 1000), t = (now - t0) / 1000, dir = Math.floor(t / 1.5) % 2 ? -1 : 1; last = now; g.cam.z = z; g.cam.X += v[0] * dt * dir; g.cam.Y += v[1] * dt * dir; if (t > 0.5) cpu.push(g.perf.cpuMs); if (t < 6.5) requestAnimationFrame(step); else res(); }; requestAnimationFrame(step); });
          g.cam.X = x0; g.cam.Y = y0; cpu.sort((a, b) => a - b);
          return { avg: +(cpu.reduce((a, b) => a + b, 0) / Math.max(1, cpu.length)).toFixed(3), p95: +(cpu[Math.floor(0.95 * cpu.length)] ?? 0).toFixed(3), n: cpu.length };
        }, z);
        (report.pan[key] ??= []).push(pan); await settle(page);
        const t = await page.evaluate(() => {
          const g = window.__game, gl = g.gl.gl, px = new Uint8Array(4); cancelAnimationFrame(g.raf);
          for (let i = 0; i < 20; i++) { g.draw(performance.now()); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }
          const ts = [];
          for (let i = 0; i < 240; i++) { const a = performance.now(); g.draw(a); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); ts.push(performance.now() - a); }
          g.raf = requestAnimationFrame(g.frame); ts.sort((a, b) => a - b);
          return { draw: { median: +ts[120].toFixed(2), p95: +ts[228].toFixed(2), mean: +(ts.reduce((a, b) => a + b, 0) / ts.length).toFixed(2) } };
        });
        // the GPU queries' results come a frame or two later
        const gpu = await page.evaluate(async amplify => {
          const g = window.__game, gl = g.gl.gl, ext = gl.getExtension('EXT_disjoint_timer_query_webgl2'); if (!ext) return null;
          const orig = g.gl.drawChunk; if (amplify > 1) g.gl.drawChunk = function (...a) { for (let k = 0; k < amplify; k++) orig.apply(this, a); };
          // (a warm-up keeps the GPU's clocks up; each query times BATCH frames drawn back to back, so the result is ms per frame)
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
        (report.frame[key] ??= []).push(t.draw); (report.gpu[key] ??= []).push(gpu);
        if (round === 0) report.mem[key] = await page.evaluate(() => { const g = window.__game; return { groundMB: +(g.ground.residentPx * 4 / 1048576).toFixed(1), shineMB: +((g.ground.shineBytes ?? 0) / 1048576).toFixed(3), chunks: [...g.ground.tiles.values()].filter(t => t.tex).length }; });
        console.log(key, JSON.stringify({ pan, gpu, bake: report.bake[key].at(-1), frame: t.draw, mem: report.mem[key] }));
      }
    }
    writeFileSync(join(out, `numbers${tag}.json`), JSON.stringify(report, null, 2));
  }
  writeFileSync(join(out, `report${tag}.json`), JSON.stringify(report, null, 2));
  await ctx.close();
} finally { await browser.close(); }
