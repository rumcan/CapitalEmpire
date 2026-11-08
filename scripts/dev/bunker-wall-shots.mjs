// T367 (#1022; the owner, 2026-11-08: "change default of the bunker wall with no green behind to 0"): the Bunker look's "Wall height (no green behind)"
// starts at 0 (it was 0.25 m). Shots of a fresh game's bunker, with the setting at its default:
//   panel   the Bunker look card (Holes > a hole's Bunker brush > Bunker look), scrolled to the "Wall height (no green behind)" row: the slider and its number
//   bunker  a bunker painted on a fairway (no green behind it), at the closest zoom (30%), the screen without the UI; and a 2x crop of it
// It prints the setting the game holds (window.__game.bunkers.defaults.wallLow) and the number the card shows.
//   node scripts/dev/bunker-wall-shots.mjs --base http://127.0.0.1:5187/ --out E:/ClaudeTemp/T367 --tag after
// Needs a dev server (vite) on --base. One headless Edge, closed when done; a fresh profile, so each start is a new game. Saves are not written.
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://127.0.0.1:5187/'), out = opt('out', 'output/bunker-wall-shots'), tag = opt('tag', 'after'), seed = opt('seed', '1');
const W = 1366, H = 768;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const report = { tag };
/** wait until no chunk bake is in flight for a moment */
const settle = async (page, ms = 900) => {
  await page.waitForTimeout(ms);
  await page.evaluate(() => { window.__calm = 0; });
  await page.waitForFunction(() => { const g = window.__game; window.__calm = g.ground.busy === 0 ? window.__calm + 1 : 0; return window.__calm > 20; }, null, { timeout: 60000, polling: 50 }).catch(() => console.log('  (settle timed out)'));
  await page.waitForTimeout(300);
};
const save = async (buf, name) => { const file = join(out, `${tag}-${name}.jpg`); await sharp(buf).jpeg({ quality: 88, mozjpeg: true }).toFile(file); console.log(file); return file; };
try {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => { try { localStorage.clear(); } catch { /* none */ } });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.route('**/*', r => { const x = r.request(); return x.method() !== 'GET' && x.method() !== 'HEAD' ? r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }) : r.continue(); });
  await page.goto(`${base}?start=town&seed=${seed}`, { waitUntil: 'domcontentloaded', timeout: 240000 });
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 300000 });
  await page.evaluate(() => { const g = window.__game; g.setSpeed(0); g.closeWelcome?.(false); g.prebake = () => {}; g.emit(); });
  await page.addStyleTag({ content: 'html.noui * { visibility: hidden !important } html.noui canvas { visibility: visible !important }' });
  await page.waitForFunction(() => window.__game?.courseGrid, null, { timeout: 120000 });
  await settle(page, 1500);
  report.setting = await page.evaluate(() => window.__game.bunkers.defaults.wallLow);
  console.log('the game holds wallLow', report.setting);

  // a fairway cell with fairway all round it (no green within its 6 cells): paint a bunker there
  const spot = await page.evaluate(async () => {
    const g = window.__game, grid = g.courseGrid, m = await import('/src/game/ext/course-grid/index.ts'), CT = 0.5, R = 6;
    const is = (i, j, s) => grid.surf[j * grid.w + i] === s;
    for (let j = R + 2; j < grid.h - R - 2; j += 3) for (let i = R + 2; i < grid.w - R - 2; i += 3) {
      const h = grid.hole[j * grid.w + i]; if (!h || !is(i, j, m.SURF.fairway)) continue;
      let ok = true;
      for (let dj = -R; dj <= R && ok; dj += 2) for (let di = -R; di <= R && ok; di += 2) { const c = (j + dj) * grid.w + i + di; if (grid.surf[c] !== m.SURF.fairway || grid.hole[c] !== h) ok = false; }
      if (!ok) continue;
      const x = grid.x0 + (i + 0.5) * CT, y = grid.y0 + (j + 0.5) * CT;
      g.courseGridChanged(m.paintDisc(grid, x, y, 3, m.SURF.bunker, h, 0), true);
      return { x, y, hole: h };
    }
    return null;
  });
  console.log('bunker at', JSON.stringify(spot));
  report.spot = spot;

  // the card: the hole in hand, the Bunker brush, Bunker look
  if (spot) {
    await page.evaluate(h => { const g = window.__game; g.setTool('course'); const p = g.paint; p.setHole(h); p.setBrush('bunker'); g.emit(); }, spot.hole);
    await page.evaluate(([x, y]) => { const g = window.__game; g.camEase = null; g.lookAt(x, y, 0.3); g.emit(); }, [spot.x, spot.y]);
    await sleep(600);
    try {
      let chip = page.locator('[data-bunker-look]').first();
      if (!(await chip.count())) { const more = page.locator('.more-head').first(); if (await more.count()) { await more.click(); await sleep(300); } chip = page.locator('[data-bunker-look]').first(); }
      await chip.scrollIntoViewIfNeeded(); await chip.click(); await sleep(800);
      const row = page.locator('[data-card="looks"] label:has-text("Wall height (no green behind)")').first();
      await row.scrollIntoViewIfNeeded(); await sleep(400);
      const card = page.locator('[data-card="looks"]').first(), box = await card.boundingBox();
      const box2 = await row.boundingBox();
      // the number beside the slider
      report.shown = await row.evaluate(el => el.closest('div')?.querySelector('input[type="number"]')?.value ?? null);
      console.log('the card shows', report.shown, 'm');
      if (box) {
        const clip = { x: Math.max(0, box.x - 6), y: Math.max(0, box.y - 6), width: Math.min(W - Math.max(0, box.x - 6), box.width + 12), height: Math.min(H - Math.max(0, box.y - 6), box.height + 12) };
        await save(await page.screenshot({ type: 'png', clip }), 'panel');
      } else await save(await page.screenshot({ type: 'png' }), 'panel');
      if (box2) report.rowBox = box2;
    } catch (e) { console.log('[panel failed]', String(e.message).split('\n')[0]); await save(await page.screenshot({ type: 'png' }), 'panel-fallback'); }
    // the bunker, the UI away
    await page.evaluate(() => { const g = window.__game; g.setTool('select'); g.emit(); });
    await page.evaluate(([x, y]) => { const g = window.__game; g.camEase = null; g.lookAt(x, y, 0.3); g.emit(); }, [spot.x, spot.y]);
    await settle(page, 6000); // (the bunker picture bakes on its own worker)
    await page.evaluate(() => document.documentElement.classList.add('noui'));
    await settle(page, 800);
    const shot = await page.screenshot({ type: 'png' });
    await save(shot, 'bunker-30');
    const cx = Math.round(W / 2), cy = Math.round(H / 2), cw = 420, ch = 280;
    await save(await sharp(shot).extract({ left: cx - cw / 2, top: cy - ch / 2, width: cw, height: ch }).resize({ width: cw * 2, kernel: 'nearest' }).png().toBuffer(), 'bunker-crop');
    await page.evaluate(() => document.documentElement.classList.remove('noui'));
  }
  await ctx.close();
} finally { await browser.close(); }
writeFileSync(join(out, `${tag}-summary.json`), JSON.stringify(report, null, 1));
console.log(JSON.stringify(report));
