// T227 (#656): in-game shots of the concept's course look (course-finish.ts: wide fairway bands, the darker first-cut collar, fine stripes on
// the greens, the bunker lips) with the finish off (today's look) and on, from the same views: a hole with bunkers and a green with its collar
// (?start=town, the old nine) at 30% and 15%, a concept-sized kidney bunker painted into a fairway (the town's own are small), the range
// outfield after Grass the outfield (?fixture=range20) at 30% and 15%; a sheet of the
// course beside the owner's concept picture; and the bake times of the same chunks with the finish off and on at 30% and 8%.
//   node scripts/dev/course-look-shots.mjs --base http://127.0.0.1:5187/ --out E:/ClaudeTemp/T227 [--only hole,green,bunker,range,sheet,bake]
//     [--finish '{"bandStrength":0.2}'] [--tag v2] [--modes off,on]
// Needs a dev server (vite) on --base. One headless Edge, closed when done; a fresh profile, so each start is a new game. On a build without
// the finish (main before T227) the switch does nothing and both shots show today's look: run it with --modes main.
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://127.0.0.1:5187/'), out = opt('out', 'output/course-look'), tag = opt('tag', '') ? `-${opt('tag', '')}` : '';
const only = new Set(opt('only', 'hole,green,bunker,range,sheet,bake').split(',')), extra = JSON.parse(opt('finish', '{}')), modes = opt('modes', 'off,on').split(',');
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
/** a fresh page on `url` (a new game or a fixture), loaded, the UI hidden, the game paused, broad day, no baking ahead */
const open = async url => {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  page.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 300)); });
  await page.goto(url);
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 240000 });
  await page.addStyleTag({ content: '* { visibility: hidden !important } canvas { visibility: visible !important }' });
  await page.evaluate(() => { const g = window.__game; g.prebake = () => {}; g.setSpeed(0); g.setShowGrid?.(false); window.__night = 0; g.nightAmount = () => window.__night; g.setGrade?.({ on: false }); });
  return { page, ctx };
};
const look = (page, x, y, z) => page.evaluate(([x, y, z]) => { const g = window.__game; g.camEase = null; g.lookAt(x, y, z); }, [x, y, z]);
/** the finish off (today's look), on (the tuned look, with `extra`), or main (no switch: the build as it is) */
const finish = (page, mode) => page.evaluate(([mode, extra]) => {
  const gr = window.__game.ground; if (mode === 'main' || !gr.setCourseFinish) return false;
  gr.setCourseFinish(mode === 'off' ? { on: false } : { on: true, ...extra }); return true;
}, [mode, extra]);
/** the course's spots: the hole whose bunkers lie nearest its fairway (the view between them), and a green with its collar */
const spots = page => page.evaluate(() => {
  const g = window.__game.courseGrid; if (!g) return null;
  const CT = 0.5, S = { fairway: 4, bunker: 6, green: 8 };
  const cells = s => { const o = []; for (let j = 0; j < g.h; j++) for (let i = 0; i < g.w; i++) { const c = j * g.w + i; if (g.surf[c] === s) o.push({ x: g.x0 + (i + 0.5) * CT, y: g.y0 + (j + 0.5) * CT, h: g.hole[c] }); } return o; };
  const bunkers = cells(S.bunker), greens = cells(S.green), fair = cells(S.fairway);
  // a coarse grid of fairway cells (8-tile buckets) to find the nearest fairway to each bunker cell quickly
  const near = (p, list, r) => list.filter(q => Math.abs(q.x - p.x) < r && Math.abs(q.y - p.y) < r).length;
  let best = null, bestN = -1;
  for (let k = 0; k < bunkers.length; k += Math.max(1, Math.floor(bunkers.length / 300))) {
    const b = bunkers[k], n = near(b, bunkers, 10) * 2 + Math.min(200, near(b, fair, 10));
    if (n > bestN) { bestN = n; best = b; }
  }
  // the green with the most cells of one hole
  const byHole = new Map(); for (const q of greens) { const l = byHole.get(q.h) ?? []; l.push(q); byHole.set(q.h, l); }
  let green = null; for (const [h, l] of byHole) if (!green || l.length > green.n) { let x = 0, y = 0; for (const q of l) { x += q.x; y += q.y; } green = { h, n: l.length, x: x / l.length, y: y / l.length }; }
  return { hole: best && { x: best.x, y: best.y, h: best.h, score: bestN }, green, counts: { bunker: bunkers.length, green: greens.length, fairway: fair.length } };
});
const report = { modes };
const files = {};
try {
  if (['hole', 'green', 'bunker', 'sheet', 'bake'].some(k => only.has(k))) {
    const { page, ctx } = await open(`${base}?start=town`);
    const sp = await spots(page); report.spots = sp; console.log('spots', JSON.stringify(sp));
    if (sp?.hole && (only.has('hole') || only.has('sheet'))) {
      for (const z of [0.3, 0.15]) {
        await look(page, sp.hole.x, sp.hole.y, z);
        for (const m of modes) { await finish(page, m); await settle(page); (files[`hole${Math.round(z * 100)}`] ??= []).push(await shot(page, `hole-${Math.round(z * 100)}pct-${m}`)); }
      }
    }
    // ---- a concept-sized kidney bunker (two discs of 3 and 2.5 tiles) painted into the middle of the widest fairway: the town's own bunkers are
    //      small (3 x 4 tiles), so the lip's crescent and its raised grass ring show best on one as large as the concept's
    if (only.has('bunker')) {
      const bk = await page.evaluate(async () => {
        const g = window.__game, grid = g.courseGrid, m = await import('/src/game/ext/course-grid/index.ts'), CT = 0.5;
        let best = null, bestN = -1;
        for (let j = 0; j < grid.h; j += 6) for (let i = 0; i < grid.w; i += 6) {
          const c = j * grid.w + i; if (grid.surf[c] !== m.SURF.fairway) continue;
          let n = 0; for (let dj = -24; dj <= 24; dj += 4) for (let di = -24; di <= 24; di += 4) { const q = (j + dj) * grid.w + i + di; if (q >= 0 && q < grid.surf.length && grid.surf[q] === m.SURF.fairway) n++; }
          if (n > bestN) { bestN = n; best = { x: grid.x0 + (i + 0.5) * CT, y: grid.y0 + (j + 0.5) * CT, h: grid.hole[c] }; }
        }
        if (!best) return null;
        for (const [dx, dy, r] of [[-1.6, 1.2, 3], [2, -1.4, 2.5]]) g.courseGridChanged(m.paintDisc(grid, best.x + dx, best.y + dy, r, m.SURF.bunker, best.h, 0), true);
        return best;
      });
      report.bunker = bk; console.log('bunker', JSON.stringify(bk));
      if (bk) for (const z of [0.3, 0.15]) {
        await look(page, bk.x, bk.y, z);
        for (const m of modes) { await finish(page, m); await settle(page, 1500); (files[`bunker${Math.round(z * 100)}`] ??= []).push(await shot(page, `bunker-${Math.round(z * 100)}pct-${m}`)); }
      }
    }
    if (sp?.green && only.has('green')) {
      for (const z of [0.3, 0.15]) {
        await look(page, sp.green.x, sp.green.y, z);
        for (const m of modes) { await finish(page, m); await settle(page); (files[`green${Math.round(z * 100)}`] ??= []).push(await shot(page, `green-${Math.round(z * 100)}pct-${m}`)); }
      }
    }
    // ---- the bake times: each run re-bakes the view (invalidateAll): the worker ms of those bakes, on the same chunks (the hole at the
    //      centre), three times each mode, alternating
    if (sp?.hole && only.has('bake')) {
      report.bake = {};
      for (const z of [0.3, 0.08]) {
        await look(page, sp.hole.x, sp.hole.y, z); await settle(page);
        for (let rep = 0; rep < 3; rep++) for (const m of modes) {
          await finish(page, m); await settle(page);
          const n0 = await page.evaluate(() => { const g = window.__game; g.ground.invalidateAll(); return g.ground.baked; });
          await settle(page);
          const ms = await page.evaluate(n0 => { const g = window.__game, l = []; for (let k = n0; k < g.ground.baked; k++) l.push(g.ground.bakeLog[k % 4096]); return l; }, n0);
          const s = [...ms].sort((a, b) => a - b), q = f => s.length ? s[Math.min(s.length - 1, Math.floor(f * s.length))] : 0;
          (report.bake[`${Math.round(z * 100)}pct-${m}`] ??= []).push({ bakes: s.length, median: +q(0.5).toFixed(1), p95: +q(0.95).toFixed(1), mean: +(s.reduce((a, b) => a + b, 0) / (s.length || 1)).toFixed(1) });
        }
      }
      console.log('bake', JSON.stringify(report.bake));
    }
    await ctx.close();
  }
  // ---- the range outfield after Grass the outfield (?fixture=range20: the grown town's range; the two ground upgrades given)
  if (only.has('range') || only.has('sheet')) {
    const { page, ctx } = await open(`${base}?fixture=range20`);
    const range = await page.evaluate(() => {
      const g = window.__game, b = g.range.ctx.biz(); if (!b) return null;
      for (const id of ['teeturf', 'grass']) if (!b.owned.includes(id)) b.owned.push(id);
      g.range.sync(true);
      const s = g.range.scene; if (!s) return null;
      const t = s.teeBox, n = t.length / 2; let x = 0, y = 0; for (let i = 0; i < t.length; i += 2) { x += t[i]; y += t[i + 1]; }
      const far = s.targets.length ? s.targets[Math.floor(s.targets.length / 2)] : null;
      return { tee: [x / n, y / n], target: far ? [far.x, far.y] : null, owned: b.owned };
    });
    report.range = range; console.log('range', JSON.stringify(range));
    if (range) {
      const [x, y] = range.target ? [range.tee[0] * 0.55 + range.target[0] * 0.45, range.tee[1] * 0.55 + range.target[1] * 0.45] : range.tee;
      for (const z of [0.3, 0.15]) {
        await look(page, x, y, z);
        for (const m of modes) { await finish(page, m); await settle(page); (files[`range${Math.round(z * 100)}`] ??= []).push(await shot(page, `range-${Math.round(z * 100)}pct-${m}`)); }
      }
    }
    await ctx.close();
  }
  // ---- the sheet: the hole at 30% and 15% off and on, and the concept's course, each the same height, labelled
  if (only.has('sheet') && files.hole30 && files.hole15) {
    const h = 400, gap = 8, lab = 26;
    const crop = await sharp('docs/art/concept/maple-falls-concept.webp').extract({ left: 180, top: 440, width: 760, height: 472 }).png().toBuffer();
    const row = async (cells, name) => {
      const bufs = await Promise.all(cells.map(([f]) => sharp(f).resize({ height: h }).png().toBuffer({ resolveWithObject: true })));
      const Wd = bufs.reduce((s, b) => s + b.info.width, 0) + gap * (bufs.length - 1);
      let x = 0; const comp = [];
      const label = Buffer.from(`<svg width="${Wd}" height="${lab}" xmlns="http://www.w3.org/2000/svg">${bufs.map((b, i) => { const t = `<text x="${x + b.info.width / 2}" y="18" font-family="Arial" font-size="16" text-anchor="middle" fill="#fff">${cells[i][1]}</text>`; x += b.info.width + gap; return t; }).join('')}</svg>`);
      comp.push({ input: label, left: 0, top: 0 }); x = 0;
      for (const b of bufs) { comp.push({ input: b.data, left: x, top: lab }); x += b.info.width + gap; }
      return { buf: await sharp({ create: { width: Wd, height: h + lab, channels: 3, background: '#111' } }).composite(comp).png().toBuffer(), w: Wd, h: h + lab, name };
    };
    const last = l => l[l.length - 1], first = l => l[0];
    const rows = [
      await row([[first(files.hole30), `hole 30%, ${modes[0]}`], [last(files.hole30), `hole 30%, ${last(modes)}`], [crop, 'the concept']]),
      await row([[first(files.hole15), `hole 15%, ${modes[0]}`], [last(files.hole15), `hole 15%, ${last(modes)}`], [crop, 'the concept']]),
      ...(files.range30 ? [await row([[first(files.range30), `range 30%, ${modes[0]}`], [last(files.range30), `range 30%, ${last(modes)}`], [crop, 'the concept']])] : []),
    ];
    const Wd = Math.max(...rows.map(r => r.w)), Hd = rows.reduce((s, r) => s + r.h + gap, -gap);
    let y = 0; const comp = []; for (const r of rows) { comp.push({ input: r.buf, left: 0, top: y }); y += r.h + gap; }
    const file = join(out, `sheet-course-vs-concept${tag}.jpg`);
    await sharp({ create: { width: Wd, height: Hd, channels: 3, background: '#111' } }).composite(comp).jpeg({ quality: 90, mozjpeg: true }).toFile(file);
    console.log(file);
  }
  writeFileSync(join(out, `numbers${tag}.json`), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }
