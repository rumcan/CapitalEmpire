// T258 (#755): in-game shots of the range's art: the hitting mats (item 19), the target greens (20) and the bullseye green (27), and the
// range's buildings and signs as drawn (the ChatGPT two-view art once it lands, else the labelled stand-ins). On the range start (seed 1),
// broad day, the UI hidden (the map's labels stay):
//   mats      the tee box's mats as a new start has them, 30%
//   mats12    12 bays on the turfed tee, 30%
//   greens    the first target green (50 m) after the Target greens upgrade, 30%
//   bullseye  the 200 m green after More target greens (the bullseye), 30%
//   range15   the whole front of the range with every upgrade above, 15%
//   range8    the whole range, 8%
//   node scripts/dev/range-art-shots.mjs --base http://127.0.0.1:5186/ --out E:/ClaudeTemp/T258 --tag before [--only mats,greens,...]
// Needs a dev server (vite) on --base. One headless Edge, closed when done; a fresh profile, so each start is a new game.
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://127.0.0.1:5186/'), out = opt('out', 'output/range-art-shots'), tag = opt('tag', 'after'), seed = opt('seed', '1');
const only = new Set(opt('only', 'mats,mats12,greens,bullseye,range15,range8').split(','));
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const settle = async (page, ms = 900) => {
  await page.waitForTimeout(ms);
  await page.evaluate(() => { window.__calm = 0; });
  await page.waitForFunction(() => { const g = window.__game; window.__calm = g.ground.busy === 0 ? window.__calm + 1 : 0; return window.__calm > 20; }, null, { timeout: 60000, polling: 50 }).catch(() => console.log('  (settle timed out)'));
  await page.waitForTimeout(400);
};
const shot = async (page, name, zoom) => {
  const file = join(out, `${tag}-${name}.jpg`), png = await page.screenshot({ type: 'png' });
  await sharp(png).jpeg({ quality: 90, mozjpeg: true }).toFile(file);
  console.log(file);
  // the middle enlarged (30% is the closest zoom)
  if (zoom) { const m = await sharp(png).metadata(), w = Math.round(m.width / zoom), h = Math.round(m.height / zoom); const z = join(out, `${tag}-${name}-x${zoom}.jpg`); await sharp(png).extract({ left: Math.round((m.width - w) / 2), top: Math.round((m.height - h) / 2), width: w, height: h }).resize(m.width, m.height, { kernel: 'lanczos3' }).jpeg({ quality: 90 }).toFile(z); console.log(z); }
  return file;
};
const look = (page, x, y, z) => page.evaluate(([x, y, z]) => { const g = window.__game; g.camEase = null; g.lookAt(x, y, z); }, [x, y, z]);
/** the range's upgrades set as owned (a dev shortcut: no money, the scene laid again) */
const own = (page, ids) => page.evaluate(ids => { const g = window.__game, b = g.range.ctx.biz(); for (const id of ids) if (!b.owned.includes(id)) b.owned.push(id); g.range.sync(true); }, ids);
/** where the scene's things are (world tiles): the open bays' middle, each target green */
const spots = page => page.evaluate(() => {
  const sc = window.__game.range.scene, bays = sc.bays.filter(b => !b.lift), mid = bays.length ? [bays.reduce((s, b) => s + b.stand.x, 0) / bays.length, bays.reduce((s, b) => s + b.stand.y, 0) / bays.length] : null;
  const b = sc.box;
  return { bays: mid, targets: sc.targets.map(t => [t.x, t.y, t.r]), centre: [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2], facing: sc.facing, aim: sc.aim, front: sc.front,
    labels: sc.pieces.filter(p => p.label).map(p => `${p.key}: ${p.label}`), patches: [...new Set(sc.patches.map(p => p.surf))] };
});
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 }), page = await ctx.newPage();
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  page.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 300)); });
  await page.goto(`${base}?start=range&seed=${seed}`);
  await page.waitForFunction(() => window.__game?.ready && window.__game.range?.scene, null, { timeout: 240000 });
  await page.addStyleTag({ content: '* { visibility: hidden !important } canvas { visibility: visible !important }' });
  await page.evaluate(() => { const g = window.__game; g.prebake = () => {}; g.setSpeed(0); g.setShowGrid?.(false); window.__night = 0; g.nightAmount = () => window.__night; });
  let sp = await spots(page); console.log('start', JSON.stringify(sp));
  if (only.has('mats') && sp.bays) { await look(page, sp.bays[0], sp.bays[1], 0.3); await settle(page); await shot(page, 'mats-30pct', 2.5); }
  await own(page, ['teeturf', 'bays8', 'bays12']); sp = await spots(page);
  if (only.has('mats12') && sp.bays) { await look(page, sp.bays[0], sp.bays[1], 0.3); await settle(page); await shot(page, 'mats12-30pct', 2.5); }
  await own(page, ['greens']); sp = await spots(page); console.log('greens', JSON.stringify(sp.targets));
  if (only.has('greens') && sp.targets[0]) { await look(page, sp.targets[0][0], sp.targets[0][1], 0.3); await settle(page); await shot(page, 'greens-30pct', 2); }
  await own(page, ['targets']); sp = await spots(page); console.log('targets', JSON.stringify(sp.targets));
  if (only.has('bullseye') && sp.targets[3]) { await look(page, sp.targets[3][0], sp.targets[3][1], 0.3); await settle(page); await shot(page, 'bullseye-30pct', 2); }
  await own(page, ['grass', 'covered', 'lights', 'dispenser', 'kiosk']); sp = await spots(page); console.log('all', JSON.stringify(sp));
  if (only.has('greens') && sp.targets[0]) { await look(page, sp.targets[0][0], sp.targets[0][1], 0.3); await settle(page); await shot(page, 'greens-grass-30pct', 2); }
  if (only.has('bullseye') && sp.targets[3]) { await look(page, sp.targets[3][0], sp.targets[3][1], 0.3); await settle(page); await shot(page, 'bullseye-grass-30pct', 2); }
  if (only.has('mats12') && sp.bays) { await look(page, sp.bays[0], sp.bays[1], 0.3); await settle(page); await shot(page, 'mats-covered-30pct', 2.5); }
  if (only.has('range15') && sp.bays) {
    // the front of the range: the bays and the first greens beyond them
    const t = sp.targets[1] ?? sp.targets[0], x = t ? (sp.bays[0] + t[0]) / 2 : sp.bays[0], y = t ? (sp.bays[1] + t[1]) / 2 : sp.bays[1];
    await look(page, x, y, 0.15); await settle(page); await shot(page, 'range-15pct');
  }
  if (only.has('range8')) { await look(page, sp.centre[0], sp.centre[1], 0.08); await settle(page); await shot(page, 'range-8pct'); }
  await ctx.close();
} finally { await browser.close(); }
