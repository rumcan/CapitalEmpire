// J9 (#1268): looks at the new start (the jam build: npm run build:jam first, dist-jam; or the normal game on a dev server: --base http://127.0.0.1:PORT/).
// Opens the game in the installed Chrome (headless, WebGL), goes through the title card (jam) and Who are you, then the start's placement: shots of the step,
// a green and a red ghost, the ghost's cost as the pointer sweeps the map, and the game just after a start is laid at a spot (or by "Pick a spot for me").
//   node scripts/jam/j9-shots.mjs [--out dir] [--base url] [--port N] [--headed] [--keep] [--query a=b] [--only list] [--w 1366 --h 860] [--logs] [--frac 0.5]
// --only: comma list of steps: shots (the placement step: green, red), sweep (the ghost's cost), place (a click on a spot that fits; --frac picks which), auto (Pick a spot for me)
import { chromium } from 'playwright-core';
import { preview } from 'vite';
import { createServer } from 'node:net';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2), has = k => args.includes(`--${k}`), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const ROOT = resolve('.'), OUT = 'dist-jam', SHOTS = resolve(opt('out', 'F:/ClaudeTemp/jam/j9/shots'));
const only = new Set(opt('only', 'shots,sweep,place').split(','));
const tag = opt('tag', '');
mkdirSync(SHOTS, { recursive: true });
let server = null, base = opt('base', '');
if (!base) {
  if (!existsSync(resolve(ROOT, OUT, 'index.html'))) { console.error(`no ${OUT}/index.html: run npm run build:jam first`); process.exit(2); }
  const freePort = () => new Promise(res => { const s = createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); });
  const port = Number(opt('port', 0)) || await freePort();
  server = await preview({ root: ROOT, logLevel: 'error', build: { outDir: OUT }, preview: { port, strictPort: true, host: '127.0.0.1' } });
  base = `http://127.0.0.1:${port}/`;
}
const query = opt('query', '');
const url = base + (query ? '?' + query : '');
const errors = [];
const browser = await chromium.launch({ channel: 'chrome', headless: !has('headed'), args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: Number(opt('w', 1366)), height: Number(opt('h', 860)) }, deviceScaleFactor: 1, acceptDownloads: false });
await ctx.addInitScript(() => { try { if (!sessionStorage.getItem('__j9')) { localStorage.clear(); indexedDB.deleteDatabase?.('ce'); sessionStorage.setItem('__j9', '1'); } } catch { /* none */ } });
const page = await ctx.newPage();
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
page.on('console', m => { const t = m.text(); if (m.type() === 'error' && !/favicon|Failed to load resource: the server responded with a status of 404/.test(t)) errors.push(`console: ${t.slice(0, 300)}`); if (has('logs')) console.log(`[${m.type()}] ${t.slice(0, 200)}`); });
const settle = (ms = 400) => page.waitForTimeout(ms);
const game = (fn, arg) => page.evaluate(fn, arg);
const shot = async name => { const p = resolve(SHOTS, tag + name); await page.screenshot({ path: p, type: 'jpeg', quality: 82 }); console.log(`shot ${p}`); };
const state = () => game(() => { const g = window.__game, b = g.golf?.range; return { picking: !!g.startPick, money: Math.round(g.money), built: b?.built !== false, forSale: !!b?.forSale, scene: !!g.range?.scene, owned: b?.owned ?? [], speed: g.speed, cam: [Math.round(g.cam.X), Math.round(g.cam.Y), +g.cam.z.toFixed(3)], placing: g.placing?.id ?? null, dir: g.golf?.dir, parcel: g.golf?.parcel, home: b?.home, junk: b?.junk?.length, balls: b?.balls?.clean, seen: g.golf?.progress?.seen, tour: !!g.tourView(), baked: g.firstViewBaked, lots: g.traffic?.lots?.size, pop: g.traffic?.pop, golfers: b?.total?.golfers, houses: g.houseLots?.size, demand: (document.querySelector('[data-testid="range-card"]')?.innerText.match(/DEMAND A DAY\s*(\d+)/i) ?? [])[1] ?? null }; });
const hover = async (x, y) => { await page.mouse.move(x - 12, y - 12); await page.mouse.move(x, y, { steps: 4 }); await settle(500); };
/** every 20 px of the screen: whether the placement ghost fits there (the ghost's own test at each pointer position) */
const scan = () => game(() => {
  const g = window.__game, p = g.placing, out = { fit: [], refused: {}, n: 0 }; if (!p) return { ...out, none: true };
  const W = g.cssW, H = g.cssH;
  for (let y = 40; y < H - 140; y += 20) for (let x = 20; x < W - 20; x += 20) {
    const t = g.tileAt(x, y), s = p.spot(t.x, t.y); out.n++;
    if (!s.why) out.fit.push({ x, y }); else (out.refused[s.why] ??= []).push({ x, y });
  }
  return out;
});

/** hovers the candidates in turn (nearest the middle of the view first) until the ghost says it fits once its county road has settled; returns that spot or null */
async function hoverFit(list, tries = 8) {
  const cx = Number(opt('w', 1366)) / 2, cy = Number(opt('h', 860)) / 2;
  const sorted = [...list].sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy));
  const step = Math.max(1, Math.floor(sorted.length / tries)), pick = [];
  for (let i = Math.min(sorted.length - 1, Math.floor(sorted.length * Number(opt('frac', 0.35)))); i < sorted.length && pick.length < tries; i += step) pick.push(sorted[i]);
  for (const c of pick) {
    await hover(c.x, c.y); await settle(300);
    const v = await game(() => { const g = window.__game, p = g.placing, h = g.hover; if (!p || !h) return null; const s = p.spot(h.x, h.y); return { why: p.why(s), pending: !!s.pending, dir: s.dir }; });
    if (v && !v.why && !v.pending) return c;
  }
  return null;
}

try {
  console.log(`j9 shots: ${url} (Chrome ${browser.version()})`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 240000 });
  const t0 = Date.now();
  if (await page.locator('[data-testid="title-card"]').waitFor({ timeout: 20000 }).then(() => true, () => false)) { await page.locator('[data-testid="title-new"]').click(); await settle(1500); }
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 240000 });
  console.log('game ready after', Date.now() - t0, 'ms');
  if (opt('scale', '')) await game(v => document.documentElement.style.setProperty('--ui-scale', v), opt('scale')); // the largest Settings "Text size" is 1.25
  if (!has('nopick')) {
    const who = page.locator('button', { hasText: "That's me" });
    await who.waitFor({ timeout: 60000 });
    await shot('01-who.jpg');
    await page.locator('input[placeholder="Your name"]').fill('Shot Test').catch(() => {});
    await who.click(); await settle(1500);
    await page.locator('[data-testid="start-pick-card"]').waitFor({ timeout: 60000 });
    await settle(1500);
  } else await settle(3000);
  console.log('picking', JSON.stringify(await state()));
  if (only.has('shots')) {
    await shot('02-pick.jpg');
    const spots = await scan();
    console.log('spots', spots.n, 'fit', spots.fit.length, JSON.stringify(Object.fromEntries(Object.entries(spots.refused).map(([k, v]) => [k, v.length]))));
    if (spots.fit.length) { const f = await hoverFit(spots.fit); console.log('green at', JSON.stringify(f)); await shot('03-green.jpg'); }
    for (const [k, v] of Object.entries(spots.refused)) { const r = v[Math.floor(v.length / 2)]; await hover(r.x, r.y); await shot(`04-red-${k.slice(0, 8).replace(/\W/g, '')}.jpg`); }
  }
  if (only.has('turn')) {
    const dirOf = () => game(() => { const g = window.__game, pk = g.startPick; return pk ? { turn: pk.turn, last: pk.last, facing: g.startPickView()?.facing } : null; });
    console.log('facing before', JSON.stringify(await dirOf()));
    for (let i = 0; i < 4; i++) { await page.keyboard.press('r'); await settle(250); console.log('after R', i + 1, JSON.stringify(await dirOf())); }
    await page.keyboard.press('Shift+R'); await settle(250); console.log('after Shift+R', JSON.stringify(await dirOf()));
    await page.locator('[data-testid="start-pick-turn"]').click(); await settle(250); console.log('after Turn button', JSON.stringify(await dirOf()));
  }
  if (only.has('gen')) {
    // a new game's work on the page's thread: Game.newTown (terrain, plan, and with the pick the probe) then, with the pick, the click's own work (layStart: Pick a spot for me)
    const r = await game(async () => {
      const g = window.__game, out = { newTown: [], lay: [] };
      for (let i = 0; i < 4; i++) {
        let a = performance.now(); g.newTown(); out.newTown.push(+(performance.now() - a).toFixed(0));
        if (g.startPick) { const who = g.golf.progress; if (!who.seen.includes('who')) who.seen.push('who'); a = performance.now(); g.startPickAuto(); out.lay.push(+(performance.now() - a).toFixed(0)); }
        await new Promise(res => setTimeout(res, 400));
      }
      return out;
    });
    console.log('gen', JSON.stringify(r));
  }
  if (only.has('zoom')) {
    // the wheel zooms while the start is chosen, and the valley is bare close up too (nothing of the automatic plan shows before it is laid)
    const z0 = await game(() => window.__game.cam.z); await page.mouse.move(683, 380); await page.mouse.wheel(0, -500); await settle(900);
    const z1 = await game(() => window.__game.cam.z); console.log('wheel zoom', z0, '->', z1);
    await game(() => { const g = window.__game, a = g.startPick.auto; g.camEase = null; g.lookAt(a.cam.x, a.cam.y, 0.12); g.emit(); }); await settle(2500);
    await page.mouse.move(100, 100); await settle(800); await shot('12-zoomed-in-bare.jpg');
    await game(() => { const g = window.__game, a = g.startPick.auto; g.camEase = null; g.lookAt(a.cam.x, a.cam.y, 0.014); g.emit(); }); await settle(1200);
  }
  if (only.has('road')) {
    // the county road of a spot that fits (settleSpot: what a ghost does once the pointer rests, and a click does first): cold per J and axis, then kept (dev server only: it imports the module)
    const r = await game(async () => {
      const m = await import('/src/game/golf/rangestart.ts'), g = window.__game, pk = g.startPick, p = g.placing, out = [], seen = new Set();
      for (let y = 20; y < g.cssH - 20; y += 10) for (let x = 20; x < g.cssW - 20; x += 10) {
        const t = g.tileAt(x, y), s = p.spot(t.x, t.y); if (!s.pending) continue; const k = `${s.site.J.x},${s.site.J.y},${s.site.axis}`; if (seen.has(k)) continue; seen.add(k);
        const a = performance.now(); m.settleSpot(pk.probe, s); out.push({ ms: performance.now() - a, ok: !s.why, why: s.why });
      }
      const ms = out.map(o => o.ms).sort((a, b) => a - b), q = f => +ms[Math.min(ms.length - 1, Math.floor(ms.length * f))].toFixed(2);
      return { roads: out.length, noRoad: out.filter(o => !o.ok).length, minMs: q(0), medianMs: q(0.5), p90Ms: q(0.9), maxMs: q(0.999), totalMs: +ms.reduce((a, b) => a + b, 0).toFixed(0) };
    });
    console.log('county roads', JSON.stringify(r));
  }
  if (only.has('sweep')) {
    // the ghost's cost: the placement's spot (what the pointer asks every frame) and its shapes, over the map in a sweep, cold then warm
    const r = await game(() => {
      const g = window.__game, p = g.placing; if (!p) return null;
      const pass = () => { let max = 0, sum = 0, n = 0, over4 = 0, maxPolys = 0, sumPolys = 0, fits = 0;
        for (let y = 20; y < g.cssH - 20; y += 10) for (let x = 20; x < g.cssW - 20; x += 10) {
          const t = g.tileAt(x, y), a = performance.now(), s = p.spot(t.x, t.y), b = performance.now(); p.polys(s); const c = performance.now();
          const d = b - a; sum += d; n++; if (d > max) max = d; if (d > 4) over4++; if (!s.why) fits++; const e = c - b; sumPolys += e; if (e > maxPolys) maxPolys = e;
        }
        return { n, fits, meanMs: +(sum / n).toFixed(4), maxMs: +max.toFixed(2), over4ms: over4, polysMeanMs: +(sumPolys / n).toFixed(4), polysMaxMs: +maxPolys.toFixed(3) }; };
      const cold = pass(), warm = pass();
      // a steady pointer: the same tile asked 600 times (a frame each, 10 s at 60 fps)
      const t = g.tileAt(g.cssW / 2, g.cssH / 2), a = performance.now(); for (let i = 0; i < 600; i++) { const s = p.spot(t.x, t.y); p.polys(s); } const steady = (performance.now() - a) / 600;
      return { cold, warm, steadyPerFrameMs: +steady.toFixed(4) };
    });
    console.log('ghost cost', JSON.stringify(r));
  }
  if (only.has('auto')) {
    const t1 = Date.now();
    await page.locator('[data-testid="start-pick-auto"]').click();
    await page.waitForFunction(() => !window.__game.startPick, null, { timeout: 30000 });
    console.log('pick for me: click to laid', Date.now() - t1, 'ms'); await settle(3000);
    console.log('after auto', JSON.stringify(await state())); await shot('07-after-auto.jpg');
  } else if (only.has('place')) {
    const spots = await scan(), f = await hoverFit(spots.fit);
    if (!f) throw new Error('no spot that fits on this view');
    const t1 = Date.now();
    await page.mouse.down(); await page.mouse.up();
    await page.waitForFunction(() => !window.__game.startPick, null, { timeout: 30000 });
    console.log('click to laid', Date.now() - t1, 'ms');
    await settle(2500); console.log('after click', JSON.stringify(await state())); await shot('05-after-click.jpg');
    await settle(6000); console.log('6 s later', JSON.stringify(await state())); await shot('06-after-6s.jpg');
  }
  if (only.has('run')) {
    // the game runs on its own for a while at 20x: the town grows from its seed and golfers come to the range
    await game(() => window.__game.setSpeed(20)); const t2 = Date.now();
    for (let i = 0; i < Number(opt('runs', 6)); i++) { await settle(5000); console.log(`run ${Math.round((Date.now() - t2) / 1000)} s`, JSON.stringify(await state())); }
    await game(() => window.__game.setSpeed(1)); await shot('11-after-run.jpg');
  }
  if (only.has('second')) {
    // a second new game in the same session (Settings > New game: Game.newTown): the card comes again, and Pick a spot for me lays the automatic start
    await game(() => window.__game.newTown()); await settle(1500);
    console.log('after newTown', JSON.stringify(await state()));
    const who2 = page.locator('button', { hasText: "That's me" }); await who2.waitFor({ timeout: 60000 }); await who2.click(); await settle(1500);
    await page.locator('[data-testid="start-pick-card"]').waitFor({ timeout: 60000 }); await settle(800);
    console.log('second pick', JSON.stringify(await state())); await shot('08-second-pick.jpg');
    await page.locator('[data-testid="start-pick-auto"]').click();
    await page.waitForFunction(() => !window.__game.startPick, null, { timeout: 30000 }); await settle(3000);
    console.log('second laid', JSON.stringify(await state())); await shot('09-second-laid.jpg');
  }
  if (only.has('reload')) {
    await settle(3000); const before = await state(); console.log('before reload', JSON.stringify(before));
    await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForFunction(() => window.__game?.ready, null, { timeout: 240000 }); await settle(3000);
    if (await page.locator('[data-testid="title-card"]').isVisible().catch(() => false)) { await page.locator('[data-testid="title-continue"]').click().catch(() => {}); await settle(1500); }
    const after = await state(); console.log('after reload', JSON.stringify(after)); await shot('10-after-reload.jpg');
    console.log('reload keeps the start:', before.money === after.money && before.built === after.built && JSON.stringify(before.parcel) === JSON.stringify(after.parcel) && !after.picking);
  }
} finally {
  if (!has('keep')) { await browser.close().catch(() => {}); if (server) { await server.close?.().catch?.(() => {}); server.httpServer?.close?.(); } }
}
console.log(`${errors.length} console errors`); for (const e of errors) console.log('  ' + e);
process.exit(errors.length ? 1 : 0);
