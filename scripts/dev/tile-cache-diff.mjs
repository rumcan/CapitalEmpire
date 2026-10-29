// T272 (#825): a pixel diff of the ground between two builds (main against the tile cache branch), the movers left out.
//   node scripts/dev/tile-cache-diff.mjs shoot --base http://localhost:5187/ --out E:/ClaudeTemp/T272/diff/main
//   node scripts/dev/tile-cache-diff.mjs diff --a E:/ClaudeTemp/T272/diff/main --b E:/ClaudeTemp/T272/diff/branch --out E:/ClaudeTemp/T272/diff/main-vs-branch
// shoot: three places (the grown town, ?fixture=range20, at its save's camera; the river where T265's tour starts, the river point nearest the
// first town; the range start, ?start=range&seed=7 (a new game's map is its own otherwise), at its own camera) at 30%, 15% and 8%, each a lossless PNG of the game's canvas once the ground is
// baked and calm (no bake in flight or asked for over 2 s). The same in every build: the sim paused (speed 0), no prebakes, midday light (night
// 0), and no movers or other sprites drawn (cars, people, trees, buildings: gl.drawSprites and their cast shadows off; the UI and the 2D overlay
// hidden), so only the baked ground is compared. One headless Edge, a fresh profile, closed when done.
// diff: for each shot in a and b, the mean and max absolute RGB difference, the share of pixels differing by more than 2 levels (any channel),
// and, when any pixel does, a diff image: main dimmed, those pixels red (and the JSON of the numbers).
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), mode = args[0], opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const W = 1600, H = 900, ZOOMS = [0.3, 0.15, 0.08];

async function shoot() {
  const base = opt('base', 'http://localhost:5187/'), out = opt('out', 'output/tile-cache-diff');
  mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
  const cams = {};
  try {
    for (const scene of [{ q: 'fixture=range20', places: ['town', 'river'] }, { q: 'start=range&seed=7', places: ['range'] }]) {
      const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 }), page = await ctx.newPage();
      page.on('pageerror', e => console.log('[pageerror]', e.message));
      await page.goto(`${base}?${scene.q}&stamp=0`, { timeout: 240000, waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.__game?.ready, null, { timeout: 240000 });
      await page.waitForFunction(() => window.__game.lotsPending === 0, null, { timeout: 60000, polling: 250 }).catch(() => console.log('  (lots still pending)'));
      await page.addStyleTag({ content: '* { visibility: hidden !important } canvas { visibility: visible !important }' });
      const home = await page.evaluate(() => {
        const g = window.__game;
        g.setSpeed(0); g.prebake = () => {}; g.nightAmount = () => 0; g.setShowGrid?.(false);
        g.gl.drawSprites = () => {}; g.gl.drawCast = () => {};
        for (const c of document.querySelectorAll('canvas')) if (c !== g.canvas) c.style.setProperty('visibility', 'hidden', 'important');
        // the river point nearest the first town (bench.ts riverFollow at 0, T265's tour)
        const r = g.terrain?.waters.find(w => w.kind === 'river'), town = g.townPts[0];
        let river = null; if (r && town) { let d = Infinity; for (const p of r.pts) { const e = Math.hypot(p.x - town.x, p.y - town.y); if (e < d) { d = e; river = p; } } }
        return { X: g.cam.X, Y: g.cam.Y, river };
      });
      for (const place of scene.places) for (const z of ZOOMS) {
        const cam = await page.evaluate(([place, z, home]) => {
          const g = window.__game;
          if (place === 'river' && home.river) g.lookAt(home.river.x, home.river.y, z);
          else { g.camEase = null; g.cam.X = home.X; g.cam.Y = home.Y; g.cam.z = z; g.clampCam?.(); }
          return { X: g.cam.X, Y: g.cam.Y, z: g.cam.z };
        }, [place, z, home]);
        // calm: nothing asked for and nothing in flight for 2 s (a provisional chunk's retry and the zoom crossfade done)
        await page.waitForTimeout(1500);
        await page.evaluate(() => { window.__calm = 0; });
        await page.waitForFunction(() => { const g = window.__game; window.__calm = g.ground.idle ? window.__calm + 1 : 0; return window.__calm > 40; }, null, { timeout: 120000, polling: 50 }).catch(() => console.log('  (settle timed out)'));
        await page.waitForTimeout(300);
        const name = `${place}-${Math.round(z * 100)}`, file = join(out, `${name}.png`);
        writeFileSync(file, await page.screenshot({ type: 'png' }));
        cams[name] = { ...cam, ...(await page.evaluate(() => { const gc = window.__game.ground; return { baked: gc.baked, provisional: gc.provisional, errors: gc.errors.length }; })) };
        console.log(file, JSON.stringify(cams[name]));
      }
      await ctx.close();
    }
  } finally { await browser.close(); }
  writeFileSync(join(out, 'cams.json'), JSON.stringify(cams, null, 1));
}

async function diff() {
  const a = opt('a'), b = opt('b'), out = opt('out', 'output/tile-cache-diff/diff');
  mkdirSync(out, { recursive: true });
  const rows = [];
  for (const f of readdirSync(a).filter(n => n.endsWith('.png')).sort()) {
    if (!existsSync(join(b, f))) { console.log('missing in b:', f); continue; }
    const A = await sharp(join(a, f)).removeAlpha().raw().toBuffer({ resolveWithObject: true }), B = await sharp(join(b, f)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const { width, height } = A.info, n = width * height, pa = A.data, pb = B.data, img = Buffer.alloc(n * 3);
    let sum = 0, max = 0, over = 0;
    for (let i = 0; i < n; i++) {
      let m = 0;
      for (let c = 0; c < 3; c++) { const d = Math.abs(pa[i * 3 + c] - pb[i * 3 + c]); sum += d; if (d > m) m = d; }
      if (m > max) max = m;
      const grey = Math.round((pa[i * 3] + pa[i * 3 + 1] + pa[i * 3 + 2]) / 3 * 0.35);
      if (m > 2) { over++; img[i * 3] = 255; img[i * 3 + 1] = Math.max(0, 80 - m); img[i * 3 + 2] = 0; } else img.fill(grey, i * 3, i * 3 + 3);
    }
    const row = { shot: f.replace('.png', ''), meanAbs: +(sum / (n * 3)).toFixed(4), maxAbs: max, over2Share: +(over / n).toFixed(6), over2Px: over, diffImage: null };
    if (over > 0) { const file = join(out, `${row.shot}-diff.png`); await sharp(img, { raw: { width, height, channels: 3 } }).png().toFile(file); row.diffImage = file; }
    rows.push(row); console.log(JSON.stringify(row));
  }
  writeFileSync(join(out, 'diff.json'), JSON.stringify(rows, null, 1));
}

if (mode === 'shoot') await shoot(); else if (mode === 'diff') await diff(); else console.log('usage: shoot --base URL --out DIR | diff --a DIR --b DIR --out DIR');
