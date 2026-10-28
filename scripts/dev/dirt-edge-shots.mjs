// T247 (#717): in-game shots of where dirt meets grass (the living ground's dirt patches on the open fescue, the range's desert, its dirt tee
// and dirt car park) with the soft dirt edge off (the look before T247) and on, from the same views at 30%, 15%, 8% and 4%; and the bake times
// of the same chunks with the edge off and on at 30% and 8% (as T227's course-look-shots.mjs: alternating runs, every bake pooled).
//   node scripts/dev/dirt-edge-shots.mjs --base http://127.0.0.1:5186/ --out E:/ClaudeTemp/T247 [--only patch,desert,park,tee,fresh,bake]
//     [--modes off,on] [--zooms 0.3,0.15,0.08,0.04] [--reps 3] [--tag v2] [--patch x,y (the open-fescue patch's tile)] [--seed 7 (the fresh start's map)]
// Needs a dev server (vite) on --base. One headless Edge, closed when done. On a build without the switch (main before T247) both modes show
// the same look: run it with --modes main.
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://127.0.0.1:5186/'), out = opt('out', 'output/dirt-edge'), tag = opt('tag', '') ? `-${opt('tag', '')}` : '';
const only = new Set(opt('only', 'patch,desert,park,tee,fresh,bake').split(',')), modes = opt('modes', 'off,on').split(','), reps = +opt('reps', '3');
const zooms = opt('zooms', '0.3,0.15,0.08,0.04').split(',').map(Number), patchAt = opt('patch', '') ? opt('patch', '').split(',').map(Number) : null;
const W = 1280, H = 800;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
/** wait until no chunk bake is in flight for a second (at most 60 s) */
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
/** a fresh page on `url`, loaded, the UI hidden, the game paused, broad day, no baking ahead */
const open = async url => {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  page.on('console', m => { if (m.type() === 'error' || m.text().startsWith('[soft]')) console.log('[console]', m.text().slice(0, 600)); });
  await page.goto(url);
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 240000 });
  await page.addStyleTag({ content: '* { visibility: hidden !important } canvas { visibility: visible !important }' });
  await page.evaluate(noLiving => { const g = window.__game; g.prebake = () => {}; g.setSpeed(0); g.setShowGrid?.(false); window.__night = 0; g.nightAmount = () => window.__night; if (noLiving) g.ground.setLiving(false, false); }, args.includes('--noliving'));
  return { page, ctx };
};
const look = (page, x, y, z) => page.evaluate(([x, y, z]) => { const g = window.__game; g.camEase = null; g.lookAt(x, y, z); }, [x, y, z]);
/** the soft dirt edge off (the look before T247), on, or main (no switch: the build as it is) */
const soft = (page, mode) => page.evaluate(mode => {
  const gr = window.__game.ground; if (mode === 'main' || !gr.setSoftDirt) return false;
  gr.setSoftDirt(mode === 'on'); return true;
}, mode);
/** the spots: the range's tee, its desert's edge, its car park, and the biggest dirt patch of the open fescue near the range (the living
 *  ground's open-ground patches: living-ground.ts openPatch's crests, away from lots, roads and the course) */
const spots = page => page.evaluate(async () => {
  const g = window.__game, lg = await import('/src/game/living-ground.ts'), sc = g.range?.scene ?? null;
  const centre = sc ? (() => { const b = sc.box; return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]; })() : [g.cam ? 1024 : 1024, 1024];
  const mid = pts => { let x = 0, y = 0; const n = pts.length / 2; for (let i = 0; i < pts.length; i += 2) { x += pts[i]; y += pts[i + 1]; } return [x / n, y / n]; };
  // a patch: the openPatch crest with the most crest round it, within 160 tiles of the range, its middle and its edge's point nearest the
  // range (the view sits on the edge so the patch and the fescue both show)
  let best = null;
  const R = +(window.__patchR ?? 260);
  for (let y = centre[1] - R; y <= centre[1] + R; y += 4) for (let x = centre[0] - R; x <= centre[0] + R; x += 4) {
    if (x < 40 || y < 40 || x > 2008 || y > 2008 || lg.openPatch(x, y) < 0.9) continue;
    // open ground: no road or path within 24 tiles
    if (g.net.segsNear({ x, y }, 24).length) continue;
    let n = 0; for (let dy = -12; dy <= 12; dy += 3) for (let dx = -12; dx <= 12; dx += 3) if (lg.openPatch(x + dx, y + dy) > 0.6) n++;
    const d = Math.hypot(x - centre[0], y - centre[1]);
    if (!best || n > best.n || (n === best.n && d < best.d)) best = { x, y, n, d };
  }
  // (the desert's view: the middle of its longest side, where it meets the fescue)
  const longMid = pts => { let b = null; for (let i = 0; i < pts.length; i += 2) { const j = (i + 2) % pts.length, l = Math.hypot(pts[j] - pts[i], pts[j + 1] - pts[i + 1]); if (!b || l > b.l) b = { l, x: (pts[i] + pts[j]) / 2, y: (pts[i + 1] + pts[j + 1]) / 2 }; } return [b.x, b.y]; };
  const desert = sc ? sc.patches.filter(p => p.surf === 'desert' || p.surf === 'yard').map(p => ({ surf: p.surf, mid: mid(p.pts), first: [p.pts[0], p.pts[1]], side: longMid(p.pts) })) : [];
  const tee = sc ? sc.patches.filter(p => p.surf === 'teeDirt' || p.surf === 'teeTurf').map(p => ({ surf: p.surf, mid: mid(p.pts), first: [p.pts[0], p.pts[1]] })) : [];
  const cp = g.range?.ctx.carPark?.() ?? null;
  const park = cp ? { entrance: cp.entrance, bays: cp.bays.length, mid: cp.bays.length ? [cp.bays.reduce((s, b) => s + b.x, 0) / cp.bays.length, cp.bays.reduce((s, b) => s + b.y, 0) / cp.bays.length] : null } : null;
  // a town lot's lawn of desert (the town lawns wear desert-run) meeting the open fescue: the desert lawn with the least other ground round it
  let block = null;
  try {
    const ps = await import('/src/game/painted-surfaces.ts'), live = await import('/src/game/painted-surfaces-live.ts'), file = live.paintedSurfaces(), all = [];
    for (const list of g.ground.lotPatches.values()) for (const p of list) all.push(p);
    const boxOf = q => { let a = 1e9, b = 1e9, c = -1e9, d = -1e9; for (let i = 0; i < q.length; i += 2) { a = Math.min(a, q[i]); c = Math.max(c, q[i]); b = Math.min(b, q[i + 1]); d = Math.max(d, q[i + 1]); } return [a, b, c, d]; };
    const boxes = all.map(p => boxOf(p.pts));
    for (let k = 0; k < all.length; k++) {
      const p = all[k]; if (!p.lawn || p.lawn.z < 1 || !(p.lawn.share >= 1)) continue;
      const t = ps.lawnTexFor(p.lawn, p.pts, file), look = t ? ps.lookOfTex(t, file) : null; if (look?.family !== 'desert-run') continue;
      const [a, b, c, d] = boxes[k]; let n = 0;
      for (let q = 0; q < all.length; q++) { if (q === k) continue; const o = boxes[q]; if (o[2] >= a - 6 && o[0] <= c + 6 && o[3] >= b - 6 && o[1] <= d + 6) n++; }
      if (!block || n < block.n) block = { x: (a + c) / 2, y: b, n, box: [a, b, c, d] };
    }
  } catch (e) { block = { error: String(e) }; }
  return { centre, patch: best, surfs: sc ? [...new Set(sc.patches.map(p => p.surf))] : [], desert, tee, park, block: block && !block.error ? block : null, blockErr: block?.error };
});
const report = { modes, zooms };
try {
  for (const [start, url] of [['range20', `${base}?fixture=range20`], ['fresh', `${base}?start=range&seed=${opt('seed', '7')}`]]) {
    if ((start === 'fresh' && !only.has('fresh')) || (start === 'range20' && only.has('freshOnly'))) continue;
    const { page, ctx } = await open(url);
    const sp = await spots(page); report[start] = sp; console.log(start, JSON.stringify(sp));
    const views = [];
    if (patchAt) sp.patch = { x: patchAt[0], y: patchAt[1], given: true };
    if (only.has('patch') && sp.patch) views.push(['patch', sp.patch.x, sp.patch.y]);
    if (only.has('desert') && sp.desert.length) views.push(['desert', sp.desert[0].side[0], sp.desert[0].side[1]]);
    if (only.has('tee') && sp.tee.length) views.push(['tee', sp.tee[0].mid[0], sp.tee[0].mid[1]]);
    if (only.has('park') && sp.park?.mid) views.push(['park', sp.park.mid[0], sp.park.mid[1]]);
    if (only.has('block') && sp.block) views.push(['block', sp.block.x, sp.block.y]);
    for (const [name, x, y] of views) for (const z of zooms) {
      await look(page, x, y, z);
      for (const m of modes) { await soft(page, m); await settle(page); await shot(page, `${start}-${name}-${Math.round(z * 100)}pct-${m}`); }
    }
    // ---- the bake times: each run re-bakes the view (invalidateAll) over the patch (range20) or the desert's edge (fresh): the worker ms of
    //      those bakes, --reps times each mode, alternating
    const bv = start === 'range20' ? sp.patch && [sp.patch.x, sp.patch.y] : sp.desert.length && sp.desert[0].side;
    if (only.has('bake') && bv) {
      const bake = (report[`${start}Bake`] = {}), pooled = {};
      for (const z of [0.3, 0.08]) {
        await look(page, bv[0], bv[1], z); await settle(page);
        for (let rep = 0; rep < reps; rep++) for (const m of modes) {
          await soft(page, m); await settle(page);
          const n0 = await page.evaluate(() => { const g = window.__game; g.ground.invalidateAll(); return g.ground.baked; });
          await settle(page);
          const ms = await page.evaluate(n0 => { const g = window.__game, l = []; for (let k = n0; k < g.ground.baked; k++) l.push(g.ground.bakeLog[k % 4096]); return l; }, n0);
          const s = [...ms].sort((a, b) => a - b), q = f => s.length ? s[Math.min(s.length - 1, Math.floor(f * s.length))] : 0;
          (bake[`${Math.round(z * 100)}pct-${m}`] ??= []).push({ bakes: s.length, median: +q(0.5).toFixed(1), p95: +q(0.95).toFixed(1), mean: +(s.reduce((a, b) => a + b, 0) / (s.length || 1)).toFixed(1) });
          (pooled[`${Math.round(z * 100)}pct-${m}`] ??= []).push(...ms);
        }
      }
      report[`${start}Pooled`] = Object.fromEntries(Object.entries(pooled).map(([k, l]) => { const s = [...l].sort((a, b) => a - b), q = f => s[Math.min(s.length - 1, Math.floor(f * s.length))]; return [k, { bakes: s.length, median: +q(0.5).toFixed(1), p25: +q(0.25).toFixed(1), p75: +q(0.75).toFixed(1), p95: +q(0.95).toFixed(1), mean: +(s.reduce((a, b) => a + b, 0) / s.length).toFixed(2) }]; }));
      console.log(start, 'bake', JSON.stringify(bake));
      console.log(start, 'pooled', JSON.stringify(report[`${start}Pooled`]));
    }
    await ctx.close();
  }
  writeFileSync(join(out, `numbers${tag}.json`), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }
