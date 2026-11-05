// T341 (#968): the desert theme before (off) and after (on), from the same views: the town at street zoom (30%), the course at 15%, a far zoom
// (4%); and the switch's cost: its main-thread ms and the one re-bake of the view's ground (until no chunk is in flight).
//   node scripts/dev/desert-shots.mjs --base http://127.0.0.1:5187/ --out F:/ClaudeTemp/T341 [--url '?start=town']
// Needs a dev server (vite) on --base. One headless Edge, closed when done; saves are not written to the server.
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://127.0.0.1:5187/'), out = opt('out', 'output/desert-shots'), url = opt('url', '?start=town');
const W = 1280, H = 800;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
try {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  page.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 400)); });
  await page.route('**/*', r => { const x = r.request(); return x.method() !== 'GET' && x.method() !== 'HEAD' ? r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }) : r.continue(); });
  await page.goto(`${base}${url}`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 300000 });
  await page.evaluate(() => { const g = window.__game; g.closeWelcome?.(false); g.setSpeed(0); g.setDesertTheme(false); window.__night = 0; g.nightAmount = () => 0; });
  await page.addStyleTag({ content: '* { visibility: hidden !important } canvas { visibility: visible !important }' });
  const settle = async (ms = 1500) => {
    await page.waitForTimeout(ms);
    await page.evaluate(() => { window.__calm = 0; });
    await page.waitForFunction(() => { const g = window.__game; window.__calm = g.ground.busy === 0 && g.perf.chunksPending === 0 ? window.__calm + 1 : 0; return window.__calm > 20; }, null, { timeout: 90000, polling: 50 }).catch(() => console.log('  (settle timed out)'));
    await page.waitForTimeout(400);
  };
  const shot = async name => { const f = join(out, `${name}.jpg`); await sharp(await page.screenshot({ type: 'png' })).jpeg({ quality: 88, mozjpeg: true }).toFile(f); console.log(f); };
  const spots = await page.evaluate(() => {
    const g = window.__game, lots = [...g.traffic.lots.values()].filter(l => l.level > 0);
    let x = 0, y = 0; for (const l of lots) { x += l.o[0]; y += l.o[1]; } const n = Math.max(1, lots.length);
    // the built lot nearest the town's middle (its street), a little in front of it
    let best = null, bd = Infinity; for (const l of lots) { const d = (l.o[0] - x / n) ** 2 + (l.o[1] - y / n) ** 2; if (d < bd) { bd = d; best = l; } }
    const town = best ? [best.o[0] + best.u[0] * best.w / 2, best.o[1] + best.u[1] * best.w / 2] : [1024, 1024];
    const c = g.golf?.course; const course = c ? [c[0] + c[2] / 2, c[1] + c[3] / 2] : town;
    // the course's edge on the town's side: the middle of the side of its land nearest the town
    const edge = c ? [Math.min(c[0] + c[2], Math.max(c[0], town[0])), Math.min(c[1] + c[3], Math.max(c[1], town[1]))] : town;
    return { town, course, edge, lots: lots.length, rect: c };
  });
  console.log('spots', JSON.stringify(spots));
  const views = [['town-30', spots.town, 0.3], ['town-15', spots.town, 0.15], ['course-15', spots.course, 0.15], ['edge-15', spots.edge, 0.15], ['far-5', [(spots.town[0] + spots.course[0]) / 2, (spots.town[1] + spots.course[1]) / 2], 0.05]];
  for (const [name, [x, y], z] of views) {
    await page.evaluate(([x, y, z]) => { const g = window.__game; g.camEase = null; g.lookAt(x, y, z); }, [x, y, z]);
    await page.evaluate(() => window.__game.setDesertTheme(false)); await settle(); await shot(`${name}-off`);
    const t0 = Date.now();
    const ms = await page.evaluate(() => { const g = window.__game; g.setDesertTheme(true); return g.desertMs; });
    await settle(300); const bake = Date.now() - t0;
    console.log(`${name}: switch ${ms.toFixed(1)} ms main thread, the view re-baked in ${bake} ms (incl. the settle wait)`);
    await shot(`${name}-on`);
  }
  // off restores: the last view off again
  await page.evaluate(() => window.__game.setDesertTheme(false)); await settle(); await shot('far-5-off-again');
  const perf = await page.evaluate(async () => { const g = window.__game; g.setDesertTheme(true); await new Promise(r => setTimeout(r, 3000)); const a = { ...g.perf }; g.setDesertTheme(false); await new Promise(r => setTimeout(r, 3000)); const b = { ...g.perf }; return { on: { cpuMs: a.cpuMs, drawMs: a.drawMs, instances: a.instances }, off: { cpuMs: b.cpuMs, drawMs: b.drawMs, instances: b.instances } }; });
  console.log('perf', JSON.stringify(perf));
  await ctx.close();
} finally { await browser.close(); }
