// T230 (#669): in-game shots of the concept's water (water-look.ts: deeper and more teal toward the middle, a lighter edge with a hint of the
// bed, soft dark reflections of the shore's trees and buildings, and the camera glint on ponds and rivers) with the look off (today's water)
// and on, from the same views: the river in the grown town (?fixture=range20) at 30% and 15%, a course pond (?start=town) at 30%, the river
// (the map's big water) at 8%, the glint off and on from the same view (by day and at dusk), a sheet beside the owner's concept picture, and
// the bake times of the same water chunks with the look off and on (and the glint on) at 30% and 8%.
//   node scripts/dev/water-shots.mjs --base http://127.0.0.1:5187/ --out E:/ClaudeTemp/T230 [--only river,pond,glint,sheet,bake]
//     [--modes off,on | lake,on | main] [--tag before] [--seed 7 (the town start's map)] [--look '{"depth":1.2}'] [--reps 3]
// Needs a dev server (vite) on --base. One headless Edge, closed when done; a fresh profile, so each start is a new game. On a build without
// the look (main before T230) the switches do nothing: run it with --modes main.
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://127.0.0.1:5187/'), out = opt('out', 'output/water'), tag = opt('tag', '') ? `-${opt('tag', '')}` : '', seed = opt('seed', '7');
const only = new Set(opt('only', 'river,pond,glint,reflect,sheet,bake').split(',')), extra = JSON.parse(opt('look', '{}')), modes = opt('modes', 'off,on').split(','), reps = +opt('reps', '3');
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
/** a fresh page on `url`, loaded, the UI hidden, the game paused, broad day, no baking ahead (the colour grade as the game has it) */
const open = async url => {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  page.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 300)); });
  await page.goto(url);
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 240000 });
  await page.addStyleTag({ content: '* { visibility: hidden !important } canvas { visibility: visible !important }' });
  await page.evaluate(() => { const g = window.__game; g.prebake = () => {}; g.setSpeed(0); g.setShowGrid?.(false); window.__night = 0; g.nightAmount = () => window.__night; });
  return { page, ctx };
};
const look = (page, x, y, z) => page.evaluate(([x, y, z]) => { const g = window.__game; g.camEase = null; g.lookAt(x, y, z); }, [x, y, z]);
/** the water look off (the new water picture, no depth), on (the tuned look, with `extra`), lake (main's water: the lake picture on ponds and
 *  rivers, the look off: the studio's way back to the old water), or main (no switch: the build as it is) */
const water = (page, mode) => page.evaluate(async ([mode, extra]) => {
  const gr = window.__game.ground; if (mode === 'main' || !gr.setWaterLook) return false;
  // (the ponds wear the concept's deep water, the rivers the brighter lake, the lead's call 2026-10-28; lake: the old water on both)
  gr.setSurfaceLook('water', { family: mode === 'lake' ? 'lake' : 'pond-concept-run' }); gr.setSurfaceLook('river', { family: 'lake' });
  gr.setWaterLook(mode === 'on' ? { on: true, ...extra } : { on: false }); return true;
}, [mode, extra]);
const glint = (page, on) => page.evaluate(on => { window.__game.specCam = on; }, on);
const night = (page, v) => page.evaluate(v => { window.__night = v; }, v);
/** the river's shore nearest the town (its houses' lots), and the river's middle there */
const riverSpots = page => page.evaluate(() => {
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
  return { town: { x: tx, y: ty, n }, mid: { x: best.x, y: best.y, w: best.w }, shore: { x: best.x + ux * best.w / 2, y: best.y + uy * best.w / 2 }, gap: bd };
});
/** the course's biggest pond (the water cell with the most water within 8 tiles), its centre */
const pondSpot = page => page.evaluate(() => {
  const g = window.__game.courseGrid; if (!g) return null;
  const CT = 0.5, WATER = 3, cells = [];
  for (let j = 0; j < g.h; j++) for (let i = 0; i < g.w; i++) if (g.surf[j * g.w + i] === WATER) cells.push({ x: g.x0 + (i + 0.5) * CT, y: g.y0 + (j + 0.5) * CT });
  if (!cells.length) return null;
  let best = null, bn = -1;
  for (let k = 0; k < cells.length; k += Math.max(1, Math.floor(cells.length / 400))) { const c = cells[k], n = cells.filter(q => Math.abs(q.x - c.x) < 8 && Math.abs(q.y - c.y) < 8).length; if (n > bn) { bn = n; best = c; } }
  const near = cells.filter(q => Math.hypot(q.x - best.x, q.y - best.y) < 14); let x = 0, y = 0; for (const q of near) { x += q.x; y += q.y; }
  return { x: x / near.length, y: y / near.length, cells: near.length, all: cells.length };
});
const bakeRun = async (page, key, report, pooled) => {
  const n0 = await page.evaluate(() => { const g = window.__game; g.ground.invalidateAll(); return g.ground.baked; });
  await settle(page);
  const ms = await page.evaluate(n0 => { const g = window.__game, l = []; for (let k = n0; k < g.ground.baked; k++) l.push(g.ground.bakeLog[k % 4096]); return l; }, n0);
  const s = [...ms].sort((a, b) => a - b), q = f => s.length ? s[Math.min(s.length - 1, Math.floor(f * s.length))] : 0;
  (report.bake[key] ??= []).push({ bakes: s.length, median: +q(0.5).toFixed(1), p95: +q(0.95).toFixed(1), mean: +(s.reduce((a, b) => a + b, 0) / (s.length || 1)).toFixed(1) });
  (pooled[key] ??= []).push(...ms);
};
const report = { modes, look: extra };
const files = {};
try {
  if (['river', 'glint', 'sheet', 'bake'].some(k => only.has(k))) {
    const { page, ctx } = await open(`${base}?fixture=range20`);
    const rs = await riverSpots(page); report.river = rs; console.log('river', JSON.stringify(rs));
    if (rs && (only.has('river') || only.has('sheet'))) {
      for (const [z, at] of [[0.3, rs.shore], [0.15, rs.shore], [0.08, rs.mid]]) {
        await look(page, at.x, at.y, z);
        for (const m of modes) { await water(page, m); await glint(page, false); await settle(page); (files[`river${Math.round(z * 100)}`] ??= []).push(await shot(page, `river-${Math.round(z * 100)}pct-${m}`)); }
      }
    }
    if (rs && only.has('glint') && !modes.includes('main')) {
      await look(page, rs.shore.x, rs.shore.y, 0.3); await water(page, 'on');
      for (const on of [false, true]) { await glint(page, on); await settle(page); for (const [light, v] of [['day', 0], ['dusk', 0.5]]) { await night(page, v); await page.waitForTimeout(300); (files[`rglint-${light}`] ??= []).push(await shot(page, `glint-river-30pct-${light}-${on ? 'on' : 'off'}`)); } }
      await night(page, 0); await glint(page, false);
    }
    if (rs && only.has('bake')) {
      report.bake = {}; const pooled = {};
      for (const [z, at] of [[0.3, rs.shore], [0.08, rs.mid]]) {
        await look(page, at.x, at.y, z); await settle(page);
        for (let rep = 0; rep < reps; rep++) for (const m of modes.includes('main') ? ['main'] : [...modes, 'on+glint']) {
          await water(page, m === 'on+glint' ? 'on' : m); await glint(page, m === 'on+glint'); await settle(page);
          await bakeRun(page, `river-${Math.round(z * 100)}pct-${m}`, report, pooled);
        }
        await glint(page, false);
      }
      report.pooled = Object.fromEntries(Object.entries(pooled).map(([k, l]) => { const s = [...l].sort((a, b) => a - b), q = f => s[Math.min(s.length - 1, Math.floor(f * s.length))]; return [k, { bakes: s.length, median: +q(0.5).toFixed(1), p25: +q(0.25).toFixed(1), p75: +q(0.75).toFixed(1), p95: +q(0.95).toFixed(1), mean: +(s.reduce((a, b) => a + b, 0) / s.length).toFixed(2) }]; }));
      console.log('pooled', JSON.stringify(report.pooled));
    }
    await ctx.close();
  }
  if (['pond', 'glint', 'reflect', 'sheet'].some(k => only.has(k))) {
    const { page, ctx } = await open(`${base}?start=town&seed=${seed}`);
    const ps = await pondSpot(page); report.pond = ps; console.log('pond', JSON.stringify(ps));
    if (ps) {
      await look(page, ps.x, ps.y, 0.3);
      for (const m of modes) { await water(page, m); await glint(page, false); await settle(page); (files.pond30 ??= []).push(await shot(page, `pond-30pct-${m}`)); }
      if (only.has('glint') && !modes.includes('main')) {
        await water(page, 'on');
        for (const on of [false, true]) { await glint(page, on); await settle(page); for (const [light, v] of [['day', 0], ['dusk', 0.5]]) { await night(page, v); await page.waitForTimeout(300); (files[`pglint-${light}`] ??= []).push(await shot(page, `glint-pond-30pct-${light}-${on ? 'on' : 'off'}`)); } }
        await night(page, 0); await glint(page, false);
      }
      // ---- the reflections: trees planted along the pond's far (up-screen) shore, as the concept frames its ponds (the town's pond stands
      //      in open rough), the look off and on, and the glint on over them
      if (only.has('reflect')) {
        const planted = await page.evaluate(async () => {
          const g = window.__game, grid = g.courseGrid, { LIBRARY } = await import('/src/game/library.ts'), CT = 0.5, WATER = 3;
          const trees = LIBRARY.map((it, i) => ({ it, i })).filter(q => q.it.kind === 'tree');
          const pick = n => trees[(n * 7919) % trees.length].i;
          // the pond's up-screen shore: per diagonal (x - y, 2-tile bins) the water cell nearest the top of the screen (least x + y)
          const top = new Map();
          for (let j = 0; j < grid.h; j++) for (let i = 0; i < grid.w; i++) if (grid.surf[j * grid.w + i] === WATER) { const x = grid.x0 + (i + 0.5) * CT, y = grid.y0 + (j + 0.5) * CT, b = Math.round((x - y) / 2.2), q = top.get(b); if (!q || x + y < q.x + q.y) top.set(b, { x, y }); }
          let n = 0; for (const [, q] of [...top].sort((a, b) => a[0] - b[0])) { g.addProp(pick(n++), q.x - 1.3, q.y - 1.3, false, 1); }
          return { trees: trees.length, planted: n };
        });
        report.planted = planted; console.log('planted', JSON.stringify(planted));
        for (const m of modes) { await water(page, m); await glint(page, false); await settle(page, 1500); (files.reflect30 ??= []).push(await shot(page, `reflect-pond-30pct-${m}`)); }
        if (!modes.includes('main')) { await water(page, 'on'); await glint(page, true); await settle(page, 1500); await shot(page, 'reflect-pond-30pct-on-glint'); await glint(page, false); }
      }
    }
    await ctx.close();
  }
  // ---- the sheet: the river at 30% and 15%, the pond at 30%, the river at 8% (first and last mode) beside the concept's course pond and lake
  if (only.has('sheet') && files.river30 && files.pond30) {
    const h = 380, gap = 8, lab = 26;
    const pond = await sharp('docs/art/concept/maple-falls-concept.webp').extract({ left: 520, top: 600, width: 420, height: 230 }).png().toBuffer();
    const lake = await sharp('docs/art/concept/maple-falls-concept.webp').extract({ left: 1440, top: 56, width: 285, height: 190 }).png().toBuffer();
    const row = async cells => {
      const bufs = await Promise.all(cells.map(([f]) => sharp(f).resize({ height: h }).png().toBuffer({ resolveWithObject: true })));
      const Wd = bufs.reduce((s, b) => s + b.info.width, 0) + gap * (bufs.length - 1);
      let x = 0; const comp = [];
      const label = Buffer.from(`<svg width="${Wd}" height="${lab}" xmlns="http://www.w3.org/2000/svg">${bufs.map((b, i) => { const t = `<text x="${x + b.info.width / 2}" y="18" font-family="Arial" font-size="16" text-anchor="middle" fill="#fff">${cells[i][1]}</text>`; x += b.info.width + gap; return t; }).join('')}</svg>`);
      comp.push({ input: label, left: 0, top: 0 }); x = 0;
      for (const b of bufs) { comp.push({ input: b.data, left: x, top: lab }); x += b.info.width + gap; }
      return { buf: await sharp({ create: { width: Wd, height: h + lab, channels: 3, background: '#111' } }).composite(comp).png().toBuffer(), w: Wd, h: h + lab };
    };
    const LABEL = { lake: 'before (the old water)', off: 'new picture, look off', on: 'after', main: 'main' }, last = l => l[l.length - 1], first = l => l[0], a = LABEL[modes[0]] ?? modes[0], b = LABEL[last(modes)] ?? last(modes);
    const rows = [
      await row([[first(files.pond30), `course pond 30%, ${a}`], [last(files.pond30), `course pond 30%, ${b}`], [pond, 'the concept\'s pond']]),
      ...(files.reflect30 ? [await row([[first(files.reflect30), `trees on its far shore, ${a}`], [last(files.reflect30), `trees on its far shore, ${b}`], [pond, 'the concept\'s pond']])] : []),
      await row([[first(files.river30), `river in town 30%, ${a}`], [last(files.river30), `river in town 30%, ${b}`], [lake, 'the concept\'s lake']]),
      ...(files.river15 ? [await row([[first(files.river15), `river 15%, ${a}`], [last(files.river15), `river 15%, ${b}`], [lake, 'the concept\'s lake']])] : []),
      ...(files.river8 ? [await row([[first(files.river8), `river 8%, ${a}`], [last(files.river8), `river 8%, ${b}`], [lake, 'the concept\'s lake']])] : []),
    ];
    const Wd = Math.max(...rows.map(r => r.w)), Hd = rows.reduce((s, r) => s + r.h + gap, -gap);
    let y = 0; const comp = []; for (const r of rows) { comp.push({ input: r.buf, left: 0, top: y }); y += r.h + gap; }
    const file = join(out, `sheet-water-vs-concept${tag}.jpg`);
    await sharp({ create: { width: Wd, height: Hd, channels: 3, background: '#111' } }).composite(comp).jpeg({ quality: 88, mozjpeg: true }).toFile(file);
    console.log(file);
  }
  writeFileSync(join(out, `numbers${tag}.json`), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }
