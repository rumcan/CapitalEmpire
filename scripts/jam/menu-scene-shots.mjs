// J12 (#1271): looks at the living scene behind the jam's title card, stop by stop, and keeps the pictures:
//   --posters  src/assets/showcase/<stop id>.jpg   the still of each stop's first view (no card): the first picture while the engine boots, and the
//              picture a slow machine, a hidden tab or "reduce motion" keeps (ui/jam/MenuScene.tsx)
//   --docs     docs/jam-shots/j12-<stop id>.jpg    each stop with the title card over it, and j12-moves-a.jpg / j12-moves-b.jpg: the range a few
//              seconds apart, to show it moves
//   node scripts/jam/menu-scene-shots.mjs --base http://127.0.0.1:5412/ --posters --docs [--only range,farm] [--dir F:/scratch]
// --base is a vite dev server started with VITE_JAM=1, or a preview of dist-jam. The scene is the page's own (window.__showDirector, window.__showcase
// are its hooks); the director is stopped and the camera put on each stop's view by hand. One headless Chrome at 1600 x 900, closed when done.
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; }, has = k => args.includes(`--${k}`);
const base = opt('base', 'http://127.0.0.1:5412/'), only = opt('only', '') ? opt('only', '').split(',') : null, W = Number(opt('w', 1600)), H = Number(opt('h', 900));
const posterDir = resolve(opt('posters-dir', 'src/assets/showcase')), docsDir = resolve(opt('docs-dir', 'docs/jam-shots')), scratch = resolve(opt('dir', 'output/menu-scene'));
const Q = Number(opt('quality', 66));
mkdirSync(scratch, { recursive: true }); if (has('posters')) mkdirSync(posterDir, { recursive: true }); if (has('docs')) mkdirSync(docsDir, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: !has('headed'), args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-unsafe-swiftshader'] });
let failed = '';
try {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.goto(base, { waitUntil: 'commit', timeout: 120000 });
  await page.waitForFunction(() => window.__showDirector?.phase === 'play', null, { timeout: 240000 });
  await page.evaluate(() => { window.__showDirector.end(); });
  const stops = (await page.evaluate(() => window.__showcase.stops)).filter(s => !only || only.includes(s.id));
  const hide = on => page.evaluate(on => { let s = document.getElementById('__clean'); if (!s) { s = document.createElement('style'); s.id = '__clean'; document.head.appendChild(s); } s.textContent = on ? '[data-testid=title-card], [data-testid=menu-scene] { display: none !important; }' : '[data-testid=menu-scene] { display: none !important; }'; }, on);
  /** the town clock to a golf hour of the same day, so the day's golfers and cars are out */
  const clockTo = hour => page.evaluate(h => { const g = window.__game, T = g.traffic, st = T.simTime(performance.now()), day = g.townNow().day - 1; T.setTownClock({ ...T.town, t0: st, m0: day * 1440 + h * 60 }); }, hour);
  const camTo = (s, u) => page.evaluate(([s, u, W, H]) => { const g = window.__game, p = window.__showcase.poseAt(s, u, W, H); g.camEase = null; g.cam.X = p.X; g.cam.Y = p.Y; g.cam.z = p.z; g.clampCam(); }, [s, u, W, H]);
  const baked = async (ms = 60000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await page.evaluate(() => window.__game.viewReady(window.__game.cam))) return true; await page.waitForTimeout(300); } return false; };
  const jpeg = async (file, png) => { const buf = await sharp(png).jpeg({ quality: Q, mozjpeg: true }).toBuffer(); writeFileSync(file, buf); console.log(file, buf.length, 'bytes'); return buf.length; };
  let total = 0;
  for (const s of stops) {
    await clockTo(7.3); await camTo(s, 0); await page.waitForTimeout(500); const ok = await baked(); await page.waitForTimeout(9000); // (the first golfers and cars come out)
    if (!ok) console.log(`  (${s.id}: the ground was not all baked)`);
    await hide(true);
    const png = await page.screenshot({ type: 'png' });
    writeFileSync(join(scratch, `${s.id}-0.png`), png);
    if (has('posters')) total += await jpeg(join(posterDir, `${s.id}.jpg`), png);
    if (has('docs')) {
      await camTo(s, 0.4); await page.waitForTimeout(1500); await hide(false);
      await jpeg(join(docsDir, `j12-${s.id}.jpg`), await page.screenshot({ type: 'png' }));
      if (s.id === 'range') { // two frames five seconds apart, the card over them: the camera has glided a third of the stop and the people, cars and balls have moved
        await camTo(s, 0.15); await page.waitForTimeout(800); await jpeg(join(docsDir, 'j12-moves-a.jpg'), await page.screenshot({ type: 'png' }));
        const t0 = Date.now(); for (let k = 1; k <= 25; k++) { await camTo(s, 0.15 + 0.35 * Math.min(1, (Date.now() - t0) / 5000)); await page.waitForTimeout(200); }
        await camTo(s, 0.5); await jpeg(join(docsDir, 'j12-moves-b.jpg'), await page.screenshot({ type: 'png' }));
      }
    }
  }
  if (has('posters')) console.log(`posters: ${stops.length} files, ${total} bytes`);
} catch (e) { failed = String(e?.message ?? e); console.error(failed); } finally { await browser.close(); }
process.exit(failed ? 1 : 0);
