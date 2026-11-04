// T309 (#894): the farm animals in the game: a farm's herd at street zoom (30%) and 20%, and what they cost (the movers drawn and their ms a frame,
// the frame's CPU ms with and without them).
//   node scripts/dev/animal-shots.mjs --base http://127.0.0.1:5186/ --out F:/ClaudeTemp/T309/shots [--start town] [--seed n]
// Needs a dev server (vite) on --base. One headless Edge, closed when done.
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://127.0.0.1:5186/'), out = opt('out', 'output/animals'), start = opt('start', 'range'), seed = opt('seed', '');
const W = 1280, H = 800;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const settle = async (page, ms = 900) => {
  await page.waitForTimeout(ms);
  await page.evaluate(() => { window.__calm = 0; });
  await page.waitForFunction(() => { const g = window.__game; window.__calm = g.ground.busy === 0 && g.farmsPending === 0 ? window.__calm + 1 : 0; return window.__calm > 20; }, null, { timeout: 40000, polling: 50 }).catch(() => console.log('  (settle timed out)'));
  await page.waitForTimeout(300);
};
const shot = async (page, name) => {
  const file = join(out, `${name}.jpg`);
  await sharp(await page.screenshot({ type: 'png' })).jpeg({ quality: 88, mozjpeg: true }).toFile(file);
  console.log(file); return file;
};
/** the mean of a perf field over n frames */
const perfMean = (page, keys, n = 120) => page.evaluate(([keys, n]) => new Promise(ok => {
  const g = window.__game, sum = Object.fromEntries(keys.map(k => [k, 0])); let i = 0;
  const step = () => { for (const k of keys) sum[k] += g.perf[k] ?? 0; if (++i < n) requestAnimationFrame(step); else ok(Object.fromEntries(keys.map(k => [k, +(sum[k] / n).toFixed(4)]))); };
  requestAnimationFrame(step);
}), [keys, n]);
const report = {};
try {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  page.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 300)); });
  await page.goto(`${base}?start=${start}&stamp=0${seed ? '&seed=' + seed : ''}`);
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 180000 });
  await page.addStyleTag({ content: '* { visibility: hidden !important } canvas { visibility: visible !important }' });
  await page.evaluate(() => { const g = window.__game; g.prebake = () => {}; g.setShowGrid(false); window.__night = 0; g.nightAmount = () => window.__night; });
  await page.waitForFunction(() => window.__game.farmsPending === 0, null, { timeout: 90000 }).catch(() => console.log('  (farms still composing)'));
  // the herds: each farm's animals, the biggest herd first
  const herds = await page.evaluate(() => {
    const g = window.__game, o = [];
    for (const [k, f] of g.farmAnimals) { const v = { x: 0, y: 0 }; const a = f.list[0]; const c = { x: a.o.x + a.u.x * a.home[0] + a.n.x * a.home[1], y: a.o.y + a.u.y * a.home[0] + a.n.y * a.home[1] }; o.push({ key: k, n: f.list.length, kinds: [...new Set(f.list.map(a => a.kind))], x: c.x, y: c.y }); }
    return o.sort((a, b) => b.n - a.n);
  });
  report.farms = await page.evaluate(() => window.__game.farmMap.farms.size);
  report.herds = herds.length; report.animals = herds.reduce((s, h) => s + h.n, 0);
  console.log(`farms ${report.farms}, with animals ${herds.length}, animals ${report.animals}`);
  const place = (x, y, z) => page.evaluate(([x, y, z]) => { const g = window.__game; g.camEase = null; g.cam.z = z; g.cam.X = (x - y) * 64; g.cam.Y = (x + y) * 32; }, [x, y, z]);
  const picks = [herds.find(h => h.kinds.includes('cow')), herds.find(h => h.kinds.includes('horse')), herds.find(h => h.kinds.includes('sheep'))].filter(Boolean);
  for (const h of picks) {
    await place(h.x, h.y, 0.3); await settle(page);
    await shot(page, `herd-${h.kinds.join('-')}-30pct`);
    await page.waitForTimeout(4000); await shot(page, `herd-${h.kinds.join('-')}-30pct-4s-later`);
    await place(h.x, h.y, 0.2); await settle(page, 400); await shot(page, `herd-${h.kinds.join('-')}-20pct`);
  }
  // the cost: at the biggest herd at 30%, the animals' movers and ms, and the frame's CPU with them and with every herd taken away
  if (picks[0]) {
    await place(picks[0].x, picks[0].y, 0.3); await settle(page);
    report.with = await perfMean(page, ['animals', 'animalMs', 'cpuMs', 'frameMs']);
    await page.evaluate(() => { window.__herds = new Map(window.__game.farmAnimals); window.__game.farmAnimals.clear(); });
    report.without = await perfMean(page, ['animals', 'animalMs', 'cpuMs', 'frameMs']);
    await page.evaluate(() => { for (const [k, v] of window.__herds) window.__game.farmAnimals.set(k, v); });
    // and zoomed out to the street tier's widest (every herd on screen culled or drawn)
    await place(picks[0].x, picks[0].y, 0.12); await settle(page, 400);
    report.wide = await perfMean(page, ['animals', 'animalMs', 'cpuMs', 'frameMs']);
    console.log(JSON.stringify(report));
  }
  writeFileSync(join(out, 'animal-shots.json'), JSON.stringify(report, null, 1));
} catch (e) { console.log('[error]', e); }
finally { await browser.close(); }
