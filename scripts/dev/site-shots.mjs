// T232 (#673): in-game shots of the concept's building sites: a town lot under construction at 30% (bare dirt in the white dashed survey line,
// the timber frame, lumber, heaps, the digger), a street with several sites, the player's bought land at 15% (its survey line on its own
// ground, and a town lot bulldozed there: bare dirt in its line), and a sheet of them beside the concept picture's corner.
// The grown town (?fixture=range20) builds lots as it grows; the shots use the lots building at load and, for the street, stage the lots along
// one street as building (the lot lab's staging, Engine.staged: composed exactly as the town composes a lot under construction).
//   node scripts/dev/site-shots.mjs --base http://127.0.0.1:5187/ --out E:/ClaudeTemp/T232 [--tag after]
// Needs a dev server (vite) on --base. One headless Edge, closed when done; a fresh profile, so each start is a new game.
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://127.0.0.1:5187/'), out = opt('out', 'output/site-shots'), tag = opt('tag', 'after');
const concept = opt('concept', 'docs/art/concept/maple-falls-concept.webp');
const W = 1280, H = 800;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const settle = async (page, ms = 1500) => {
  await page.waitForTimeout(ms);
  await page.evaluate(() => { window.__calm = 0; });
  await page.waitForFunction(() => { const g = window.__game; window.__calm = g.ground.busy === 0 && g.lotsPending === 0 ? window.__calm + 1 : 0; return window.__calm > 20; }, null, { timeout: 60000, polling: 50 }).catch(() => console.log('  (settle timed out)'));
  await page.waitForTimeout(500);
};
const shot = async (page, name) => { const file = join(out, `${name}-${tag}.jpg`); await sharp(await page.screenshot({ type: 'png' })).jpeg({ quality: 90, mozjpeg: true }).toFile(file); console.log(file); return file; };
const look = (page, x, y, z) => page.evaluate(([x, y, z]) => { const g = window.__game; g.camEase = null; g.lookAt(x, y, z); }, [x, y, z]);
const files = {};
try {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  page.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 300)); });
  await page.goto(`${base}?fixture=range20`);
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 240000 });
  await page.addStyleTag({ content: '* { visibility: hidden !important } canvas { visibility: visible !important }' });
  await page.evaluate(async () => { const g = window.__game; g.prebake = () => {}; g.setShowGrid?.(false); window.__night = 0; g.nightAmount = () => window.__night; g.setSpeed(0); window.__lib = (await import('/src/game/library.ts')).LIBRARY; });
  await page.waitForFunction(() => window.__game.lotsPending === 0, null, { timeout: 60000 }).catch(() => {});
  // ---- the town's lots: those building now, and a street of lots on the map axes to stage as sites
  const town = await page.evaluate(() => {
    const g = window.__game, lots = [...g.traffic.lots.values()], c = l => ({ x: l.o[0] + l.u[0] * l.w / 2 + l.n[0] * l.d / 2, y: l.o[1] + l.u[1] * l.w / 2 + l.n[1] * l.d / 2 });
    const axis = l => Math.max(Math.abs(l.u[0]), Math.abs(l.u[1])) > 0.99;
    // the trees standing over each (their footprints within a tile of its box): the house shot takes an open site
    const trees = l => { const xs = [l.o[0], l.o[0] + l.u[0] * l.w, l.o[0] + l.n[0] * l.d, l.o[0] + l.u[0] * l.w + l.n[0] * l.d], ys = [l.o[1], l.o[1] + l.u[1] * l.w, l.o[1] + l.n[1] * l.d, l.o[1] + l.u[1] * l.w + l.n[1] * l.d]; let n = 0; for (const p of g.propGrid.query([Math.min(...xs) - 1, Math.min(...ys) - 1, Math.max(...xs) + 1, Math.max(...ys) + 1])) if (window.__lib[p.item].kind === 'tree') n++; return n; };
    const building = lots.filter(l => l.level === 1).map(l => ({ key: l.key, use: l.use, w: l.w, d: l.d, axis: axis(l), trees: trees(l), ...c(l) })).sort((a, b) => a.trees - b.trees || b.w * b.d - a.w * a.d);
    // a row of 3 lots side by side on one street side (the same n, frontages in a line), house-sized, built or empty
    const rows = new Map();
    for (const l of lots) { if (!axis(l) || l.w < 7 || l.d < 9) continue; const k = `${l.n[0]},${l.n[1]},${Math.round(l.o[0] * Math.abs(l.n[0]) + l.o[1] * Math.abs(l.n[1]))}`; if (!rows.has(k)) rows.set(k, []); rows.get(k).push(l); }
    let row = null;
    for (const list of rows.values()) {
      list.sort((a, b) => (a.o[0] * a.u[0] + a.o[1] * a.u[1]) - (b.o[0] * b.u[0] + b.o[1] * b.u[1]));
      for (let i = 0; i + 3 <= list.length; i++) { const r = list.slice(i, i + 3); if (r.every((l, k) => k === 0 || Math.abs((l.o[0] * l.u[0] + l.o[1] * l.u[1]) - (r[k - 1].o[0] * r[k - 1].u[0] + r[k - 1].o[1] * r[k - 1].u[1]) - r[k - 1].w) < 1.5)) { row = r; break; } }
      if (row) break;
    }
    return { lots: lots.length, building, row: row?.map(l => ({ key: l.key, ...c(l) })) ?? null, golf: !!g.golf, parcels: g.golf?.parcels?.length ?? 0 };
  });
  console.log(`lots ${town.lots}, building now ${town.building.length} (houses ${town.building.filter(b => b.use === 1).length}), a row to stage: ${!!town.row}, golf ${town.golf}`);
  // ---- 1. a house going up at 30%: a house site the town is building, else the middle lot of the row staged as one
  let one = town.building.find(b => b.use === 1 && b.axis && b.w >= 7 && b.d >= 9) ?? null;
  if (!one && town.row) {
    const key = town.row[1].key;
    await page.evaluate(k => { const g = window.__game, v = g.traffic.lots.get(k), geo = { o: { x: v.o[0], y: v.o[1] }, u: { x: v.u[0], y: v.u[1] }, n: { x: v.n[0], y: v.n[1] }, w: v.w, d: v.d }; g.staged.set(k, { g: geo, st: { use: 1, level: 1, decline: 0, seed: v.seed } }); g.placeLot(k, geo, { use: 1, level: 1, decline: 0, seed: v.seed }); g.flushLotGround(); }, key);
    one = town.row[1]; console.log('  (no house building at load: one staged)');
  }
  if (one) { await look(page, one.x, one.y, 0.3); await settle(page); files.site = await shot(page, 'site-30'); }
  // ---- 2. a street with several sites at 22%: where the town is building most (its lots under construction within 24 tiles), else the row staged
  const cluster = town.building.map(b => ({ b, n: town.building.filter(q => Math.hypot(q.x - b.x, q.y - b.y) < 24).length })).sort((p, q) => q.n - p.n)[0];
  if (cluster && cluster.n >= 3) {
    const near = town.building.filter(q => Math.hypot(q.x - cluster.b.x, q.y - cluster.b.y) < 24), x = near.reduce((s, q) => s + q.x, 0) / near.length, y = near.reduce((s, q) => s + q.y, 0) / near.length;
    console.log(`  ${near.length} sites within 24 tiles of ${cluster.b.x.toFixed(0)},${cluster.b.y.toFixed(0)}`);
    await look(page, x, y, 0.22); await settle(page); files.street = await shot(page, 'street-sites-22');
  } else if (town.row) {
    await page.evaluate(row => {
      const g = window.__game;
      row.forEach((r, i) => { const v = g.traffic.lots.get(r.key), geo = { o: { x: v.o[0], y: v.o[1] }, u: { x: v.u[0], y: v.u[1] }, n: { x: v.n[0], y: v.n[1] }, w: v.w, d: v.d }, st = { use: i === 2 ? 2 : 1, level: 1, decline: 0, seed: v.seed }; g.staged.set(r.key, { g: geo, st }); g.placeLot(r.key, geo, st); });
      g.flushLotGround();
    }, town.row);
    const m = town.row[1]; await look(page, m.x, m.y, 0.22); await settle(page); files.street = await shot(page, 'street-sites-22');
  }
  // ---- 3. the player's bought land at 15%: the cheapest two blocks for sale (one with houses, if any: a house there bulldozed, its plot pegged out)
  if (town.golf) {
    const land = await page.evaluate(() => {
      const g = window.__game; g.traffic.unlimited = true;
      // blocks next to the land, each the one nearest the town's houses, until a block with houses is bought (at most 6 blocks)
      const homes = [...g.traffic.lots.values()].filter(l => l.level >= 2 && l.use === 1).map(l => [l.o[0] + l.u[0] * l.w / 2 + l.n[0] * l.d / 2, l.o[1] + l.u[1] * l.w / 2 + l.n[1] * l.d / 2]);
      const toHomes = r => { const cx = r[0] + r[2] / 2, cy = r[1] + r[3] / 2; let m = Infinity; for (const [x, y] of homes) m = Math.min(m, Math.hypot(x - cx, y - cy)); return m; };
      const bought = [];
      for (let i = 0; i < 6; i++) {
        if (bought.length >= 2 && bought.some(b => b.houses > 0)) break;
        const offers = g.land.offers().filter(o => !o.why).sort((a, b) => (b.houses > 0) - (a.houses > 0) || toHomes(a.rect) - toHomes(b.rect));
        const o = offers[0]; if (!o || !g.buyLandBlock(o.rect)) break;
        bought.push({ rect: o.rect, houses: o.houses });
      }
      // a house on a bought block bulldozed (the town lot bought out: its plot is the player's to build on)
      let cleared = null;
      for (const b of bought) {
        const [x, y, w, h] = b.rect, v = [...g.traffic.lots.values()].find(l => l.level >= 2 && l.use === 1 && l.o[0] > x + 1 && l.o[0] < x + w - 1 && l.o[1] > y + 1 && l.o[1] < y + h - 1);
        if (v) { const c = { x: v.o[0] + v.u[0] * v.w / 2 + v.n[0] * v.d / 2, y: v.o[1] + v.u[1] * v.w / 2 + v.n[1] * v.d / 2 }; g.buyOut(c); cleared = c; break; }
      }
      // no house on the land for sale (the town's blocks are ringed by public roads): a cleared plot recorded as buyOut records one, a 12 x 16
      // tile lot in the first block's far corner
      if (!cleared && bought.length) { const [x, y, w, h] = bought[0].rect; (g.golf.cleared ??= []).push([x + w - 14, y + h - 18, 1, 0, 0, 1, 12, 16]); g.surveySig = ''; cleared = { x: x + w - 8, y: y + h - 10, recorded: true }; }
      g.traffic.unlimited = false;
      return { bought, cleared, parcels: g.golf.parcels.length, cleared_n: g.golf.cleared?.length ?? 0 };
    });
    console.log(`  bought ${land.bought.length} blocks (${land.bought.map(b => `${b.rect.join(',')} houses ${b.houses}`).join('; ')}), cleared ${land.cleared_n}`);
    if (land.bought.length) {
      await page.evaluate(() => window.__game.setSpeed(1)); await page.waitForTimeout(2500); await page.evaluate(() => window.__game.setSpeed(0));
      const xs = land.bought.flatMap(b => [b.rect[0], b.rect[0] + b.rect[2]]), ys = land.bought.flatMap(b => [b.rect[1], b.rect[1] + b.rect[3]]);
      await look(page, (Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2, 0.15); await settle(page, 2500); files.land = await shot(page, 'bought-land-15');
      if (land.cleared) { await look(page, land.cleared.x, land.cleared.y, 0.3); await settle(page); files.cleared = await shot(page, 'cleared-plot-30'); }
    }
  }
  await ctx.close();
  // ---- 4. the sheet: the concept's top right corner (its building sites) beside the shots
  const tile = async (f, w, h) => sharp(f).resize(w, h, { fit: 'cover' }).toBuffer();
  const cm = await sharp(concept).metadata(), corner = await sharp(concept).extract({ left: Math.round(cm.width * 0.58), top: Math.round(cm.height * 0.1), width: Math.round(cm.width * 0.42), height: Math.round(cm.height * 0.42) }).resize(800, 500, { fit: 'cover' }).toBuffer();
  const cells = [corner, ...(await Promise.all([files.site, files.street, files.land].filter(Boolean).map(f => tile(f, 800, 500))))];
  const comp = cells.map((b, i) => ({ input: b, left: (i % 2) * 810, top: Math.floor(i / 2) * 510 }));
  const label = (t, x, y) => ({ input: Buffer.from(`<svg width="400" height="30"><rect width="400" height="30" fill="rgba(0,0,0,0.55)"/><text x="10" y="21" font-family="sans-serif" font-size="16" fill="#fff">${t}</text></svg>`), left: x, top: y });
  const names = ['The concept (its top right corner)', 'A house going up, 30%', 'A street of sites, 22%', 'Bought land, 15%'];
  cells.forEach((_, i) => comp.push(label(names[i], (i % 2) * 810, Math.floor(i / 2) * 510)));
  files.sheet = join(out, `sheet-${tag}.jpg`);
  await sharp({ create: { width: 1610, height: Math.ceil(cells.length / 2) * 510 - 10, channels: 3, background: '#1b1b1b' } }).composite(comp).jpeg({ quality: 88 }).toFile(files.sheet);
  console.log(files.sheet);
} finally { await browser.close(); }
