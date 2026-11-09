// T409 (#1105): the hills as they were (?relief=old: T126's and T388's light, no slope materials) and as they are (the relief light and the slope materials: smooth, and in four soft bands), at the three zooms the
// owner looks at, 30%, 15% and 8%, in autumn and in the desert, over the range start's own hills (the Height tool's ground: a gentle hill, a moderate hill and a steep valley side sculpted on the open
// ground beside the home, the same numbers every run) and over Woodhill's real ground (?osmcourse=woodhill). Also checks the game's state (the mode the engine and the worker are in, the gear menu's
// Hill relief select) and exits 1 on a failed check.
//   node scripts/dev/relief-shots.mjs --base http://127.0.0.1:5231/ --out E:/ClaudeTemp/T409/shots [--scene hills,woodhill] [--theme autumn,desert] [--modes old,smooth,bands] [--zooms 0.3,0.15,0.08] [--sheet 1]
// Needs a dev server (vite) on --base. One headless Edge, closed when done; saving is off. --sheet 1 lays old | smooth | bands side by side as <scene>-<theme>-<look>-<zoom>-sheet.png.
// The sculpted hills (HILLS below, tiles from the camera's tile at the start, heights in metres, written straight into the course height field and handed to the ground as an edit does):
//   gentle    a dome 2.4 m high and 36 tiles (72 m) across the foot: about 3 degrees at its steepest, the light only
//   moderate  a dome 3 m high and 8 tiles round: 15 degrees at its steepest, the hillside's band
//   steep     a valley 6 m deep between two 3 m ridges, its sides rising over 4 tiles (8 m): 37 degrees on average and up to 48, the rock's band, one side facing the sun and one away
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://127.0.0.1:5231/'), out = opt('out', 'E:/ClaudeTemp/T409/shots'), scenes = opt('scene', 'hills,woodhill').split(','), themes = opt('theme', 'autumn,desert').split(','), modes = opt('modes', 'old,smooth,bands').split(',');
const zooms = opt('zooms', '0.3,0.15,0.08').split(',').map(Number), sheet = opt('sheet', '1') === '1', only = opt('look', '');
// the looks: [name, dx, dy] tiles from the scene's anchor (the camera's tile for the hills, the land's north-west corner for Woodhill)
const LOOKS = {
  hills: [['gentle', 0, 0], ['moderate', 52, 6], ['steep', 22, -48]],
  woodhill: [['hill', 510, 180], ['flank', 405, 90]],
};
/** the features: [kind, dx, dy, ...numbers] in tiles from the camera's tile; dome: radius, height; valley: half width of the floor, width of a side, ridge height, length */
const HILLS = [['dome', 0, 0, 18, 2.4], ['dome', 52, 6, 8, 3], ['valley', 22, -48, 5, 4, 3, 22]];
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
const side = async (files, file) => {
  const imgs = await Promise.all(files.map(f => sharp(f).resize({ height: 540 }).toBuffer())), metas = await Promise.all(imgs.map(i => sharp(i).metadata()));
  let x = 0; const comps = imgs.map((input, k) => { const c = { input, left: x, top: 0 }; x += metas[k].width + 16; return c; });
  await sharp({ create: { width: x - 16, height: 540, channels: 3, background: '#0b1220' } }).composite(comps).png().toFile(file);
  console.log('  ' + file);
};
/** the hills, sculpted into the course height field in the page: the ground then bakes as it does after an edit */
const sculpt = hills => {
  const g = window.__game, f = g.courseHeight, d = f.data, N = 512, STEP = 2;
  const sm = t => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
  const { X, Y } = g.cam, bx = (X / 64 + Y / 32) / 2, by = (Y / 32 - X / 64) / 2;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  const put = (i, j, v) => { const k = j * N + i; d[k] = Math.max(-3, Math.min(3, d[k] + v)); };
  for (const [kind, dx, dy, a, b, c, e] of hills) {
    const cx = bx + dx, cy = by + dy, R = kind === 'dome' ? a : (a + b + 16 + 6) * 1.2;
    const i0 = Math.max(0, Math.floor((cx - R) / STEP)), i1 = Math.min(N - 1, Math.ceil((cx + R) / STEP)), j0 = Math.max(0, Math.floor((cy - R) / STEP)), j1 = Math.min(N - 1, Math.ceil((cy + R) / STEP));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = (i + 0.5) * STEP - cx, y = (j + 0.5) * STEP - cy;
      if (kind === 'dome') { const t = 1 - Math.hypot(x, y) / a; if (t > 0) put(i, j, b * sm(t)); }
      else { // a valley along the tile y axis: the floor |x| < a (a tiles) at -3 m, the sides rising over b tiles to the ridge (c m), the ridge flat 8 tiles and fading over 8 more; the whole fading over the last e tiles of its length
        const u = Math.abs(x), side = sm((u - a) / b), ridgeFade = 1 - sm((u - a - b - 8) / 8), along = 1 - sm((Math.abs(y) - e) / 6);
        const h = (-3 + (3 + c) * side) * (u < a + b + 16 ? 1 : 0) * ridgeFade * along; if (h !== 0) put(i, j, h);
      }
    }
    x0 = Math.min(x0, cx - R); y0 = Math.min(y0, cy - R); x1 = Math.max(x1, cx + R); y1 = Math.max(y1, cy + R);
  }
  f.rev++; g.courseHeightChanged([Math.max(0, x0), Math.max(0, y0), Math.min(1024, x1), Math.min(1024, y1)]);
  return { bx, by };
};
try {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  for (const scene of scenes) for (const theme of themes) {
    const files = {};
    for (const mode of modes) {
      console.log(`\n== ${scene} ${theme} ${mode}`);
      const page = await ctx.newPage();
      page.on('pageerror', e => { console.log('[pageerror]', e.message); bad++; });
      page.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 300)); });
      await page.route('**/*', r => { const x = r.request(); return x.method() !== 'GET' && x.method() !== 'HEAD' ? r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }) : r.continue(); });
      const q = scene === 'woodhill' ? `?osmcourse=woodhill&seed=1&relief=${mode}` : `?seed=1&relief=${mode}`;
      await page.goto(`${base}${q}${theme === 'desert' ? '&desert=on' : ''}`, { waitUntil: 'domcontentloaded', timeout: 240000 });
      await page.waitForFunction(() => window.__game?.ready, null, { timeout: 400000 });
      await page.evaluate(() => { const g = window.__game; g.prebake = () => {}; g.setSpeed(0); window.__night = 0; g.nightAmount = () => window.__night; g.closeWho?.('Jack Burns', 2); g.closeWelcome?.(false); const p = g.golf.progress; if (p) for (const k of ['who', 'welcome']) if (!p.seen.includes(k)) p.seen.push(k); });
      const st = await page.evaluate(() => { const g = window.__game; return { mode: g.reliefMode, ground: g.ground.relief, desert: g.desertTheme, land: g.landInfo?.() ?? null }; });
      check(st.mode === mode && st.ground === mode, `the engine and the ground are on the ${mode} relief`); check(st.desert === (theme === 'desert'), `the ${theme} theme is on`);
      let anchor = { x: 0, y: 0 };
      if (scene === 'hills' && opt('probe', '') === '1') { // the layout round the start before any hill is made: the camera's tile, the home, the roads near it
        console.log(JSON.stringify(await page.evaluate(() => { const g = window.__game, { X, Y } = g.cam, bx = (X / 64 + Y / 32) / 2, by = (Y / 32 - X / 64) / 2; return { bx, by, home: g.golf?.range?.home, towns: g.townPts, start: g.terrain.start, roads: [...g.net.segsNear({ x: bx, y: by }, 140)].map(s => [Math.round(s.a.x), Math.round(s.a.y), Math.round(s.b.x), Math.round(s.b.y)]) }; })));
      }
      if (scene === 'hills') { anchor = await page.evaluate(sculpt, HILLS); await settle(page, 1500); } else check(!!st.land && st.land.reliefM > 15, `Woodhill's real ground is laid (${st.land?.reliefM} m)`);
      for (const [name, dx, dy] of LOOKS[scene]) {
        if (only && only !== name) continue;
        for (const z of zooms) {
          await page.evaluate(([scene, dx, dy, z, ax, ay]) => { const g = window.__game, c = g.golf.course; g.camEase = null; if (scene === 'woodhill') g.lookAt(c[0] + dx, c[1] + dy, z); else g.lookAt(ax + dx, ay + dy, z); g.emit(); }, [scene, dx, dy, z, anchor.bx, anchor.by]);
          await settle(page, 1500);
          const f = join(out, `${scene}-${theme}-${name}-${Math.round(z * 100)}-${mode}.png`), off = await page.addStyleTag({ content: UI_OFF }); await page.screenshot({ path: f }); await off.evaluate(e => e.remove());
          (files[`${name}-${Math.round(z * 100)}`] ??= {})[mode] = f; console.log('  ' + f);
        }
      }
      if (mode === modes[0] || mode === 'bands') {
        // the gear menu: the Hill relief select is there, on the mode this run is in, and choosing another switches the ground (and the engine) and bakes it again
        await page.click('button[data-tip="Settings"]'); await page.waitForTimeout(500);
        const row = page.locator('[data-testid=hill-relief] select'); await row.scrollIntoViewIfNeeded().catch(() => undefined);
        check(await row.isVisible() && (await row.inputValue()) === mode, `the gear menu's Hill relief says ${mode}`);
        if (mode === modes[0]) {
          const other = mode === 'old' ? 'bands' : 'old'; await row.selectOption(other); await page.waitForTimeout(400);
          check(await page.evaluate(m => window.__game.reliefMode === m && window.__game.ground.relief === m, other), `choosing ${other} switches the engine and the ground`); await settle(page, 600);
          await row.selectOption(mode); await page.waitForTimeout(400);
        }
        await page.click('button[data-tip="Settings"]').catch(() => undefined);
      }
      await page.close();
    }
    if (sheet && modes.length > 1) for (const [key, byMode] of Object.entries(files)) { const list = modes.map(m => byMode[m]).filter(Boolean); if (list.length > 1) await side(list, join(out, `${scene}-${theme}-${key}-sheet.png`)); }
  }
} finally { await browser.close(); }
console.log(bad ? `\n${bad} problem(s)` : '\nall checks passed');
process.exit(bad ? 1 : 0);
