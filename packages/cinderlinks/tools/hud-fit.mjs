// npm run cinder:hudfit: the golf view's HUD in a real browser (Chrome, through playwright-core) at 1280x720, 1366x768, 1753x995 and 1920x1080, at 100% and
// 125% (the device scale), in host mode on Woodhill's 2nd hole with a tee turn: every box (the hole pill and its facts opened, the club picker and the bag
// opened, the shot panel opened, the help, the settings; #1336: the boost bar while held, the spin readout in flight; #1344: practising, the drills panel open and folded and the
// last ball's strip at the top centre, clear of the hole pill, the map and the swing bar) must lie inside the picture, and the golfer must be in it, his feet in its lower part.
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
    if (e.closest('#prac') && e.id !== 'prac') continue;   // (#1344: and inside the practice panel)
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
    // #1336: the swing held with the boost bar up, and the spin readout of a flight (its ball and words): set, measured and put back in one go (no frame between)
    for (const [name, setup] of [['boost', 'HP.sw = { t: 0.5, u: 0.6, lv: 0.7, spd: 0.9, g: null, rel: false }; hostMeterShow();'],
      ['air', 'HP.air = { ax: -3, ay: -5, cap: { side: 8, top: 8, back: 8 }, inp: {}, sent: false, n: 0 }; const keep = HP.play; HP.play = { air: true, t: 0, tL: 9 }; hostSpinShow(); HP.play = keep;']]) {
      const r = await page.evaluate('(() => { ' + setup + ' const on = (document.querySelector("#swingBtn u.boostbar.on") || document.querySelector("#spinRead.on")) ? 1 : 0, r = (' + fits.toString() + ')(); HP.sw = null; HP.air = null; hostMeterShow(); hostSpinShow(); return Object.assign(r, { on }); })()');
      if (!r.on) errs.push(name + ': not shown'); if (r.off.length) errs.push(name + ': off the picture: ' + r.off.join(' | '));
    }
    // #1344: practising on the range: the drills panel open and folded to its pill, and the last ball's strip at the top centre. All inside the picture; the strip over none of the
    // hole pill, the map, the swing bar, the club picker or the panels; the panel never wider than itself (no sideways scroll bar)
    {
      const drills = [['distance', 'Distance control'], ['shaping', 'Shot shaping'], ['flight', 'Flight'], ['junk', 'Junk targets'], ['updown', 'Up and down'], ['putting', 'Putting'], ['bunker', 'Bunker']]
        .map(([id, name], i) => ({ id, name, goal: 'Stop 5 balls within 10 m of the 100 m flag: a long goal that wraps over two lines', got: i % 5, need: 5, done: i === 0, reward: '+2 Irons, +1 Accuracy', here: i < 4 }));
      const last = { kind: 'full', club: 'driver', carryM: 201.9, rollM: 16.2, totalM: 218.1, offM: -6.4, pinM: 30.2, holed: false, ballMph: 140, clubMph: 97, smash: 1.44, launchDeg: 11.4, apexM: 24.6, backRpm: 2750, sideRpm: -450,
        tips: ['Pulled 6.4 m left: early release', 'Boost had faded: release at the top of your taps'] };
      { const h = await page.$('#help.on'); if (h) { const k = await page.$('#keys'); if (k) { await k.click(); await page.waitForTimeout(200); } } }   // (the help the run above opened: an overlay he asks for, shut here)
      await page.evaluate((m) => window.postMessage(m, '*'), { v: 1, t: 'practice', place: 'range', drills, active: 'shaping', note: 'Fade landed: 1 of 2', paid: null, flags: [], hcp: '18.2', balls: 11, last });
      await page.waitForTimeout(500);
      for (const fold of [false, true]) {
        const r = await page.evaluate('(() => { pracFoldSet(' + fold + '); const fit = (' + fits.toString() + ')(); ' +
          'const box = (s) => { const e = document.querySelector(s); if (!e) return null; const cs = getComputedStyle(e); if (cs.display === "none" || cs.visibility === "hidden") return null; const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 ? b : null; }; ' +
          'const lb = box("#lastBall"), pe = document.getElementById("prac"), over = []; ' +
          'for (const s of ["#card", "#minimap", "#swingBtn", "#prac", "#clubs", "#corner", "#shotc", "#help"]) { const b = box(s); if (lb && b && lb.left < b.right - 0.5 && b.left < lb.right - 0.5 && lb.top < b.bottom - 0.5 && b.top < lb.bottom - 0.5) over.push(s); } ' +
          'return { off: fit.off, lb: !!lb, prac: !!box("#prac"), over, sideways: pe ? pe.scrollWidth > pe.clientWidth + 1 : true, fold: pe ? pe.className : "" }; })()');
        const nm = 'practice' + (fold ? ' folded' : '');
        if (!r.lb || !r.prac) errs.push(nm + ': the readout or the panel is not shown');
        if (r.fold !== (fold ? 'panel fold' : 'panel')) errs.push(nm + ': the panel did not ' + (fold ? 'fold' : 'open') + ' (' + r.fold + ')');
        if (r.off.length) errs.push(nm + ': off the picture: ' + r.off.join(' | '));
        if (r.over.length) errs.push(nm + ': the last-ball readout is over ' + r.over.join(', '));
        if (r.sideways) errs.push(nm + ': the practice panel scrolls sideways');
      }
      await page.evaluate(() => pracFoldSet(false));
    }
    console.log((errs.length ? 'FAIL ' : 'ok   ') + W + 'x' + H + ' @' + Math.round(k * 100) + '%' + (errs.length ? ': ' + errs.join(' ;; ') : ''));
    if (errs.length) bad++;
    await page.close();
  }
} finally { await browser.close(); srv.close(); }
process.exit(bad ? 1 : 0);
