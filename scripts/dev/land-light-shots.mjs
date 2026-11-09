// T388 (#1048): the real ground's slope light, as it was (?landlight=classic: the land and the course height lit as one field with the gentle-ground gain, so every 3 to 15% slope lit the same) and as it is
// (the default: the land lit by its own response, proportional to the slope), at the two zooms the owner looks at, 30% and 15%, over a hill and over the skirt, on each map-data course. Also checks the game's state
// (the land is laid, the light's two modes are what the engine says, the gear menu's checkbox is there and switches the ground) and exits 1 on a failed check.
//   node scripts/dev/land-light-shots.mjs --base http://localhost:5187/ --out E:/ClaudeTemp/T388 [--course woodhill,magnolia-national,rondebosch] [--sheet 1]
// Needs a dev server (vite) on --base. One headless Edge, closed when done; saving is off (?osmcourse= is a fixture-style start). --sheet 1 lays each look's classic and hills side by side as
// <id>-<look>-classic-vs-hills.png. A look is the camera at a point dx, dy tiles from the land's north-west corner (the land's frame), at a zoom.
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://localhost:5187/'), out = opt('out', 'E:/ClaudeTemp/T388'), which = opt('course', 'woodhill,magnolia-national,rondebosch').split(','), sheet = opt('sheet', '1') === '1';
// the looks, from output of the offline window search (the 120 and 60 tile windows where the slope light reads most, and the calm ones): the hill at 15%, its flank at 30%, ground that stays calm at 30%, the skirt where the real ground
// falls below the land's mean at 15%, and the whole land (the overview). A look is [name, dx, dy, zoom] (tiles from the land's north-west corner), or 'overview'
const LOOKS = {
  woodhill: [['overview'], ['hill15', 510, 180, 0.15], ['hill15b', 390, 90, 0.15], ['flank30', 510, 165, 0.3], ['flank30b', 405, 90, 0.3], ['calm30', 765, 135, 0.3], ['skirt15', 20, 10, 0.15]],
  'magnolia-national': [['overview'], ['hill15', 120, 540, 0.15], ['flank30', 90, 555, 0.3], ['calm30', 300, 60, 0.3], ['skirt15', 500, 690, 0.15]],
  rondebosch: [['overview'], ['hill15', 375, 375, 0.15], ['flank30', 390, 375, 0.3], ['calm30', 90, 495, 0.3], ['skirt15', 700, 330, 0.15]],
};
const W = 1440, H = 900, UI_OFF = '* { visibility: hidden !important } canvas { visibility: visible !important }';
mkdirSync(out, { recursive: true });
let bad = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) bad++; };
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const settle = async (page, ms = 900) => {
  await page.waitForTimeout(ms);
  await page.evaluate(() => { window.__calm = 0; });
  await page.waitForFunction(() => { const g = window.__game; window.__calm = g.ground.busy === 0 ? window.__calm + 1 : 0; return window.__calm > 30; }, null, { timeout: 240000, polling: 50 }).catch(() => console.log('  (settle timed out)'));
  await page.waitForTimeout(500);
};
const side = async (a, b, file) => {
  const A = await sharp(a).resize({ height: 600 }).toBuffer(), B = await sharp(b).resize({ height: 600 }).toBuffer(), ma = await sharp(A).metadata(), mb = await sharp(B).metadata();
  await sharp({ create: { width: ma.width + mb.width + 24, height: 600, channels: 3, background: '#0b1220' } }).composite([{ input: A, left: 0, top: 0 }, { input: B, left: ma.width + 24, top: 0 }]).png().toFile(file);
  console.log('  ' + file);
};
try {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  for (const id of which) {
    console.log(`\n== ${id}`);
    const files = { classic: {}, hills: {} };
    for (const mode of ['classic', 'hills']) {
      console.log(` -- ${mode}`);
      const page = await ctx.newPage();
      page.on('pageerror', e => { console.log('[pageerror]', e.message); bad++; });
      page.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 300)); });
      await page.route('**/*', r => { const x = r.request(); return x.method() !== 'GET' && x.method() !== 'HEAD' ? r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }) : r.continue(); });
      await page.goto(`${base}?osmcourse=${id}&seed=1&landlight=${mode}`, { waitUntil: 'domcontentloaded', timeout: 240000 });
      await page.waitForFunction(() => window.__game?.ready, null, { timeout: 400000 });
      await page.evaluate(() => { const g = window.__game; g.prebake = () => {}; g.setSpeed(0); window.__night = 0; g.nightAmount = () => window.__night; g.closeWho?.('Jack Burns', 2); g.closeWelcome?.(false); const p = g.golf.progress; if (p) for (const k of ['who', 'welcome']) if (!p.seen.includes(k)) p.seen.push(k); });
      const st = await page.evaluate(() => { const g = window.__game; return { classic: g.landClassic, land: g.landInfo(), slope: g.slopeLight }; });
      check(st.classic === (mode === 'classic'), `the engine says the light is ${mode}`); check(!!st.land && st.land.reliefM > 15 && st.slope === 1, `the game has real ground (${st.land?.reliefM} m) at the default Slope light of ${st.slope}`);
      for (const [name, dx, dy, z] of LOOKS[id] ?? []) {
        if (name === 'overview') await page.evaluate(([W, H]) => { // the closest zoom that keeps the land's four corners on the screen
          const g = window.__game, c = g.golf.course, pts = [[0, 0], [c[2], 0], [0, c[3]], [c[2], c[3]]].map(([x, y]) => ({ x: c[0] + x, y: c[1] + y })), cx = c[0] + c[2] / 2, cy = c[1] + c[3] / 2;
          const fits = z => { g.camEase = null; g.lookAt(cx, cy, z); return pts.every(p => { const s = g.screen(p.x, p.y), x = s.x / g.dpr, y = s.y / g.dpr; return x > 40 && x < W - 40 && y > 40 && y < H - 40; }); };
          let lo = 0.004, hi = 0.3; for (let k = 0; k < 14; k++) { const m = (lo + hi) / 2; if (fits(m)) lo = m; else hi = m; } fits(lo); g.emit();
        }, [1440, 900]);
        else await page.evaluate(([dx, dy, z]) => { const g = window.__game, c = g.golf.course; g.camEase = null; g.lookAt(c[0] + dx, c[1] + dy, z); g.emit(); }, [dx, dy, z]);
        await settle(page, 1500);
        const f = join(out, `${id}-${mode}-${name}.png`), off = await page.addStyleTag({ content: UI_OFF }); await page.screenshot({ path: f }); await off.evaluate(e => e.remove()); files[mode][name] = f; console.log('  ' + f);
      }
      if (mode === 'hills') {
        // the gear menu: the checkbox is there with land, on, and a click switches the ground's light and bakes it again (a click back restores it)
        await page.click('button[data-tip="Settings"]'); await page.waitForTimeout(500);
        const box = page.locator('[data-testid=land-light]');
        await box.scrollIntoViewIfNeeded().catch(() => undefined);
        check(await box.isVisible() && await box.locator('input').isChecked(), 'the gear menu has Real ground hill light, ticked');
        files.hills.menu = join(out, `${id}-hills-gear-menu.png`); await page.screenshot({ path: files.hills.menu });
        await box.locator('input').click(); await page.waitForTimeout(400);
        check(await page.evaluate(() => window.__game.landClassic), 'unticked: the engine is on the old light'); await settle(page, 600);
        await box.locator('input').click(); await page.waitForTimeout(400);
        check(await page.evaluate(() => !window.__game.landClassic), 'ticked again: the hills\' light'); await page.click('button[data-tip="Settings"]').catch(() => undefined);
      }
      await page.close();
    }
    if (sheet) for (const [name] of LOOKS[id] ?? []) await side(files.classic[name], files.hills[name], join(out, `${id}-${name}-classic-vs-hills.png`));
  }
} finally { await browser.close(); }
console.log(bad ? `\n${bad} problem(s)` : '\nall checks passed');
process.exit(bad ? 1 : 0);
