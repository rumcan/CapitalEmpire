// T270 (#811): before/after shots of shop variety. The new town (?start=town&seed=N): the street with the most Video Vaults before (found in the
// before run, the same spot after; &stamp=1 builds the town as a build does, a dev server does not); the grown town (?fixture=range20): its
// main street, the densest block of shops. Each at 30% and 15%, before = ?oldshops (every lot drawn as before T270), after = the variety by
// place; a sheet of each scene (before | after, 30% over 15%).
//   node scripts/dev/shop-variety-shots.mjs --base http://127.0.0.1:5187/ --out E:/ClaudeTemp/T270 [--seed 4] [--only town|grown]
// Needs a dev server (vite) on --base. One headless Edge, a fresh profile a page (each start a new game), closed when done.
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://127.0.0.1:5187/'), out = opt('out', 'output/shop-variety-shots'), seed = opt('seed', '4');
const W = 1280, H = 800;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const settle = async (page, ms = 1500) => {
  await page.waitForTimeout(ms);
  await page.evaluate(() => { window.__calm = 0; });
  await page.waitForFunction(() => { const g = window.__game; window.__calm = g.ground.busy === 0 && g.lotsPending === 0 ? window.__calm + 1 : 0; return window.__calm > 20; }, null, { timeout: 90000, polling: 50 }).catch(() => console.log('  (settle timed out)'));
  await page.waitForTimeout(500);
};
const look = (page, x, y, z) => page.evaluate(([x, y, z]) => { const g = window.__game; g.camEase = null; g.lookAt(x, y, z); }, [x, y, z]);
/** the shop and venue lots of the town: each one's centre and the picture its biggest building is drawn as (newart.ts lookOf) */
const shops = page => page.evaluate(() => {
  const g = window.__game, L = window.__lib, lookOf = window.__lookOf, out = [];
  for (const [key, l] of g.traffic.lots) {
    if ((l.use !== 2 && l.use !== 4) || l.level < 2) continue;
    let best = 0, drawn = null;
    for (const p of g.propsOfLot(key)) { const it = L[p.item]; if (!it || !it.big || it.kind === 'car' || it.kind === 'tree') continue; const a = (p.x1 - p.x0) * (p.y1 - p.y0); if (a > best) { best = a; const lk = lookOf(p); drawn = L[lk.item].id.replace(/^view:/, '').replace(/:(n|ne|e|se|s|sw|w|nw)$/, '').replace(/^east:/, ''); } }
    if (drawn) out.push({ key, use: l.use, drawn, x: l.o[0] + l.u[0] * l.w / 2 + l.n[0] * l.d / 2, y: l.o[1] + l.u[1] * l.w / 2 + l.n[1] * l.d / 2 });
  }
  return out;
});
/** the spot with the most of a picture (or of any shop) within r tiles */
const densest = (list, r, pick) => { let best = null, n = -1; for (const s of list) { if (pick && !pick(s)) continue; const k = list.filter(q => (!pick || pick(q)) && Math.hypot(q.x - s.x, q.y - s.y) < r).length; if (k > n) { n = k; best = s; } } return best ? { x: best.x, y: best.y, n } : null; };
/** a shop front's picture (the eight the shop lots show) */
const SHOP = /^(town:(bakery|grocery|pharmacy|laundromat|fish_tackle|barber)|world:video(_rental)?)$/;
const near = (list, at, r) => list.filter(q => Math.hypot(q.x - at.x, q.y - at.y) < r);
const spots = {}, files = {}, log = {};
try {
  for (const [scene, query] of [['town', `?start=town&seed=${seed}&stamp=1`], ['grown', '?fixture=range20']]) {
    if (opt('only', scene) !== scene) continue;
    for (const tag of ['before', 'after']) {
      const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      page.on('pageerror', e => console.log('[pageerror]', e.message));
      await page.goto(`${base}${query}${tag === 'before' ? '&oldshops' : ''}`);
      await page.waitForFunction(() => window.__game?.ready, null, { timeout: 240000 });
      await page.addStyleTag({ content: '* { visibility: hidden !important } canvas { visibility: visible !important }' });
      await page.evaluate(async () => { const g = window.__game; g.prebake = () => {}; g.setShowGrid?.(false); window.__night = 0; g.nightAmount = () => window.__night; g.setSpeed(0); window.__lib = (await import('/src/game/library.ts')).LIBRARY; window.__lookOf = (await import('/src/game/newart.ts')).lookOf; });
      // the town stamped (its shops built) and every lot composed
      await page.waitForFunction(() => { const g = window.__game; return [...g.traffic.lots.values()].filter(l => l.use === 2 && l.level >= 2).length >= 5 && g.lotsPending === 0; }, null, { timeout: 180000, polling: 500 })
        .catch(async () => console.log('  (no shops yet)', await page.evaluate(() => { const g = window.__game, ls = [...g.traffic.lots.values()]; return { lots: ls.length, built: ls.filter(l => l.level >= 2).length, shops: ls.filter(l => l.use === 2).length, pending: g.lotsPending, golf: !!g.golf }; })));
      await page.waitForTimeout(1500);
      const list = await shops(page);
      if (!list.length) { console.log(`${scene} ${tag}: no shop lots`); await page.close(); await ctx.close(); continue; }
      // the spot: the new town's most Video Vaults (before), the grown town's densest shops; the after run looks at the same place
      spots[scene] ??= scene === 'town' ? densest(list, 40, s => s.drawn === 'world:video_rental') ?? densest(list, 40) : densest(list, 40, s => s.use === 2 && SHOP.test(s.drawn));
      const at = spots[scene], here = near(list, at, 45), count = {};
      for (const s of here) count[s.drawn] = (count[s.drawn] ?? 0) + 1;
      log[`${scene}-${tag}`] = { at, shopsInTown: list.length, near: here.length, pictures: count, townVideoVaults: list.filter(s => s.drawn === 'world:video_rental').length };
      console.log(`${scene} ${tag}: ${list.length} shop/venue lots; at (${at.x.toFixed(0)}, ${at.y.toFixed(0)}): ${JSON.stringify(count)}`);
      for (const z of [0.3, 0.15]) {
        await look(page, at.x, at.y, z); await settle(page);
        const file = join(out, `${scene}-${Math.round(z * 100)}-${tag}.jpg`);
        await sharp(await page.screenshot({ type: 'png' })).jpeg({ quality: 88, mozjpeg: true }).toFile(file);
        files[`${scene}-${Math.round(z * 100)}-${tag}`] = file; console.log(' ', file);
      }
      await page.close(); await ctx.close();
    }
    // the sheet: before | after, 30% over 15%, labelled
    if (![30, 15].every(z => files[`${scene}-${z}-before`] && files[`${scene}-${z}-after`])) continue;
    const cw = W / 2, ch = H / 2, tiles = [];
    for (const [r, z] of [[0, 30], [1, 15]]) for (const [c, tag] of [[0, 'before'], [1, 'after']]) {
      tiles.push({ input: await sharp(files[`${scene}-${z}-${tag}`]).resize(cw, ch).toBuffer(), left: c * cw, top: r * ch + 28 * (r + 1) });
      tiles.push({ input: Buffer.from(`<svg width="${cw}" height="28"><rect width="100%" height="100%" fill="#111"/><text x="8" y="19" font-size="15" fill="#fff" font-family="sans-serif">${scene === 'town' ? `New town (seed ${seed})` : 'Grown town (range20)'}, ${z}%: ${tag === 'before' ? 'before (?oldshops)' : 'after (T270)'}</text></svg>`), left: c * cw, top: r * (ch + 28) });
    }
    const sheet = join(out, `${scene}-sheet.jpg`);
    await sharp({ create: { width: W, height: 2 * (ch + 28), channels: 3, background: '#111' } }).composite(tiles).jpeg({ quality: 85 }).toFile(sheet);
    files[`${scene}-sheet`] = sheet; console.log(' ', sheet);
  }
} finally {
  await browser.close();
  writeFileSync(join(out, 'shots.json'), JSON.stringify({ spots, files, log }, null, 1));
}
