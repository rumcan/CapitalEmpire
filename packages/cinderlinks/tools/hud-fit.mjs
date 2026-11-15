// npm run cinder:hudfit: the golf view's HUD in a real browser (Chrome, through playwright-core) at 1280x720, 1366x768, 1753x995 and 1920x1080, at 100% and
// 125% (the device scale), in host mode on Woodhill's 2nd hole with a tee turn: every box (the hole pill and its facts opened, the club picker and the bag
// opened, the shot panel opened, the help, the settings) must lie inside the picture, and the golfer must be in it, his feet in its lower part.
// (2026-11-15, the owner: "Icons are sliced off at the sides .. I cant see the player".) Fails (exit 1) on the first size that does not fit.
//   node packages/cinderlinks/tools/hud-fit.mjs [public/cinderlinks]
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { convert } from './course-import.mjs';
const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(process.argv[2] || path.join(HERE, '..', '..', '..', 'public', 'cinderlinks'));
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright-core')); } catch (e) { console.log('hud-fit: playwright-core is not installed: skipped'); process.exit(0); }
const raw = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'courses', 'raw', 'woodhill.json'), 'utf8')), ed = path.join(HERE, '..', 'courses', 'edits', 'woodhill.json');
const msg = { v: 1, t: 'course', course: convert(raw, 'woodhill.json'), features: fs.existsSync(ed) ? JSON.parse(fs.readFileSync(ed, 'utf8')) : null, biome: 'parkland', type: 'private', seed: 4242, scale: 1, hole: 2, time: 'golden' };
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.json': 'application/json' };
const srv = http.createServer((q, r) => { const p = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/index.html')); fs.readFile(p, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': mime[path.extname(p)] || 'application/octet-stream' }); r.end(d); } }); });
await new Promise((ok) => srv.listen(0, ok));
const port = srv.address().port;
const SIZES = [[1280, 720], [1366, 768], [1753, 995], [1920, 1080]], SCALES = [1, 1.25];
const fits = () => {   // every box shown in the HUD inside the picture (half a pixel of slack); the golfer's box on the picture
  const st = document.getElementById('stage').getBoundingClientRect(), off = [];
  for (const e of document.querySelectorAll('#hud, #hud *')) {
    if (e.closest('#help') && e.id !== 'help') continue;   // (inside the help it scrolls up and down)
    if (e.closest('#shotc') && e.id !== 'shotc') continue;   // (inside the shot panel likewise)
    const b = e.getBoundingClientRect(), cs = getComputedStyle(e); if (b.width < 1 || b.height < 1 || cs.display === 'none' || cs.visibility === 'hidden') continue;
    if (b.left < st.left - 0.5 || b.top < st.top - 0.5 || b.right > st.right + 0.5 || b.bottom > st.bottom + 0.5) off.push((e.id || e.className || e.tagName) + ' ' + [b.left, b.top, b.right, b.bottom].map(Math.round).join(','));
  }
  return { off, golfer: golB[2] >= 0 ? [golB[1] / VH, golB[3] / VH] : null };
};
let bad = 0; const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const [W, H] of SIZES) for (const k of SCALES) {
    const page = await browser.newPage({ viewport: { width: Math.round(W / k), height: Math.round(H / k) }, deviceScaleFactor: k });
    const errs = []; page.on('pageerror', (e) => errs.push(e.message));
    await page.goto('http://localhost:' + port + '/index.html?host=1&seed=4242'); await page.waitForTimeout(800);
    await page.evaluate((m) => window.postMessage(m, '*'), msg);
    for (let t = 0; t < 40; t++) { await page.waitForTimeout(500); if (await page.evaluate(() => typeof coverOn !== 'undefined' && !coverOn && !!course)) break; }
    await page.evaluate(() => {
      const S = course.S, b0 = [hole.tee.x / S, hole.tee.y / S], p0 = [hole.pin.x / S, hole.pin.y / S], dl = Math.hypot(p0[0] - b0[0], p0[1] - b0[1]), ux = (p0[0] - b0[0]) / dl, uy = (p0[1] - b0[1]) / dl;
      const kit = (club, carryM) => ({ club, carryM, scatterM: carryM / 6, longM: carryM / 10, playsM: carryM * 0.98, sideM: 2, loftDeg: 30, speed: 0.9, sweet: 0.08, bend: { m: 4, scrM: 7, pulled: 0.6, scrPulled: 1, skill: 0.6, accuracy: 0.6 } });
      const bag = [['driver', 230], ['wood3', 210], ['wood5', 195], ['hybrid', 185], ['iron4', 175], ['iron5', 165], ['iron6', 155], ['iron7', 145], ['iron8', 135], ['iron9', 125], ['pw', 110], ['gw', 98], ['sw', 85], ['lw', 70]].map(([c, m]) => kit(c, m)).concat([{ club: 'putter', carryM: 0, scatterM: 0, longM: 0, playsM: 0, sideM: 0, loftDeg: 3, speed: 1, sweet: 0.1, fit: 'Mallet head' }]);
      window.postMessage({ v: 1, t: 'turn', golfer: 0, holeIdx: 1, hole: holeN, par: hole.par, stroke: 1, at: 600, lie: 'rough', lieKind: 'rough', lieName: 'Second cut of rough', ball: b0, pin: p0, distM: dl, wind: { mph: 18, from: 250 }, slope: { up: 0.03, across: -0.02 }, clubs: bag, suggested: { club: 'driver', aim: [b0[0] + ux * 225, b0[1] + uy * 225], power: 1 }, lieNote: 'In the rough: the grass grabs the club and the ball comes out short' }, '*');
    });
    await page.waitForTimeout(2500);
    const runs = [['tee', null], ['pill', '#card'], ['bag', '#clubs .cur'], ['shot', '#shotBtn'], ['help', '#keys'], ['settings', '#styleBtn']];
    for (const [name, click] of runs) {
      if (click) { const el = await page.$(click); if (!el) { errs.push('no ' + click); continue; } await el.click(); await page.waitForTimeout(300); }
      const r = await page.evaluate(fits);
      if (r.off.length) errs.push(name + ': off the picture: ' + r.off.join(' | '));
      if (name === 'tee' && (!r.golfer || r.golfer[0] < 0 || r.golfer[1] > 1 || r.golfer[1] < 0.55)) errs.push('tee: the golfer is not whole in the lower part of the picture (' + JSON.stringify(r.golfer) + ')');
    }
    console.log((errs.length ? 'FAIL ' : 'ok   ') + W + 'x' + H + ' @' + Math.round(k * 100) + '%' + (errs.length ? ': ' + errs.join(' ;; ') : ''));
    if (errs.length) bad++;
    await page.close();
  }
} finally { await browser.close(); srv.close(); }
process.exit(bad ? 1 : 0);
