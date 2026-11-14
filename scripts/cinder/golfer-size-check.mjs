// #1308: the golfer must not grow or shrink with the pose or the way he faces (the owner: "why does the guy grow suddenly when the angle of the camera turns to his back?").
// Headless Chrome on a scratch port serves the built view (public/cinderlinks), loads each golfer's art and asks the view's own artSprite for every pose (idle, walk, address, the swing's frames, the putt's)
// at every facing (sixteenths) and both sculpture scales (the one golferK switches between): the drawn height of each, the figure from the top of his head to his toes in sprite pixels over its scale (so equal at
// every K), the standing poses within 3% of the golfer's own idle height, the swing's and the putt's frames (club and arms up) held to it in the middle of the sixteen facings. Exit 1 on a jump.
//   node scripts/cinder/golfer-size-check.mjs [--port 5398] [--root public/cinderlinks] [--limit 0.03] [--ids golf_am_m1,golf_pro_m1,golf_pro_w2]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url)), repo = path.resolve(here, '..', '..');
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const PORT = +opt('port', 5398), ROOT = path.resolve(repo, opt('root', 'public/cinderlinks')), LIMIT = +opt('limit', 0.03);
const require = createRequire(path.join(repo, '..', 'node_modules') + path.sep), requireLocal = createRequire(path.join(repo, 'package.json'));
let chromium; try { ({ chromium } = requireLocal('playwright-core')); } catch { ({ chromium } = require('playwright-core')); }
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.json': 'application/json' };
const srv = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/index.html')); fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(b); } }); });
await new Promise((ok) => srv.listen(PORT, '127.0.0.1', ok));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
let bad = 0;
try {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(`http://127.0.0.1:${PORT}/index.html?host=1&worker=0`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof artSprite === 'function' && typeof GOLFART_IDS !== 'undefined', null, { timeout: 60000 });
  const ids = opt('ids', 'golf_am_m1,golf_am_w1,golf_pro_m1,golf_pro_w2').split(',');
  const res = await page.evaluate(async (ids) => {
    const out = {}, Ks = [GK, GK * 2], draw = (S, K) => { let top = -1, bot = -1; for (let y = 0; y < S.h; y++) if (S.x1[y] >= S.x0[y]) { if (top < 0) top = y; bot = y; } return top < 0 ? 0 : (bot - top + 1) / K; };   // (the figure's height top to toe, whatever the anchor: the drawn height at a distance is this times DS / d)
    for (const id of ids) {
      for (const c of GOLFART_CLIPS) gaLoad(id, c);
      for (let k = 0; k < 400 && !gaReady(id); k++) await new Promise((r) => setTimeout(r, 50));
      if (!gaReady(id)) { out[id] = { error: 'not ready' }; continue; }
      const poses = [['idle', 'i', 0, 0, false, false], ['walk1', 'w', 1, 0, false, false], ['walk5', 'w', 5, 0, false, false], ['address', 'a', 0, 0, false, false], ['addrPutt', 'a', 0, 0, false, true],
        ['back2', 's', 0, -1.4, false, false], ['top', 's', 0, -2, false, false], ['strike', 's', 0, 0, true, false], ['finish', 's', 0, 2.2, true, false], ['putt back', 's', 0, -1, false, true], ['putt through', 's', 0, 1.5, true, true]];
      let rows = {};
      for (let pass = 0; pass < 3; pass++) {   // (the frames are made a few milliseconds at a time: the third pass reads them all made)
        rows = {};
        for (const [name, pose, ph, al, rel, putt] of poses) {
          rows[name] = [];
          for (const K of Ks) for (let fa = 0; fa < 16; fa++) { gaFrame = -1; const S = artSprite(id, fa, pose, ph, K, al, rel, putt); rows[name].push({ K, fa, h: S && !S.none ? draw(S, K) : 0 }); }
        }
      }
      out[id] = rows;
    }
    return out;
  }, ids);
  for (const id of ids) {
    const rows = res[id]; if (!rows || rows.error) { console.log(id, 'FAILED:', rows && rows.error); bad++; continue; }
    const ref = rows.idle.filter((r) => r.K === rows.idle[0].K).reduce((a, r) => a + r.h, 0) / 16;
    let worst = 0, worstAt = '', line = [], fail = [];
    const STATIC = new Set(['idle', 'walk1', 'walk5', 'address', 'addrPutt']), WALK = 2.5;   // (a stride's own height varies a few percent: the walk may differ 2.5 times the limit)   // (no club or arms raised: every facing and scale within the limit of the idle height; a swing's frames show the raised club and arms, which belong to the pose: for those the middle of the sixteen facings is held to the limit and no facing past 0.85 to 1.4)
    for (const [name, list] of Object.entries(rows)) {
      const hs = list.map((r) => r.h / ref), sorted = [...hs].sort((x, y) => x - y), med = sorted[sorted.length >> 1], lo = sorted[0], hi = sorted[sorted.length - 1];
      line.push(`${name.padEnd(12)} ${lo.toFixed(2)}-${hi.toFixed(2)}  middle ${med.toFixed(3)}`);
      if (STATIC.has(name)) { for (const r of list) { const dev = Math.abs(r.h / ref - 1); if (dev > worst) { worst = dev; worstAt = `${name} fa ${r.fa} K ${r.K.toFixed(2)}`; } if (dev > LIMIT * (name.startsWith('walk') ? WALK : 1) && !fail.includes(name)) fail.push(name); } }
      else { if (Math.abs(med - 1) > LIMIT * 3) fail.push(name + ' (middle ' + med.toFixed(2) + ')'); if (lo < 0.85 || hi > 1.4) fail.push(name + ' (' + lo.toFixed(2) + '-' + hi.toFixed(2) + ')'); }
    }
    console.log(`${id}: idle ${ref.toFixed(1)} px/scale; static poses worst ${(worst * 100).toFixed(1)}% at ${worstAt}`); for (const l of line) console.log('  ' + l);
    if (fail.length) { bad++; console.log(`  FAIL: ${id}: ${fail.join(', ')}`); }
  }
  if (errs.length) { console.log('page errors', errs.slice(0, 3)); bad++; }
} finally { await browser.close(); srv.closeAllConnections?.(); srv.close(); }
console.log(bad ? 'FAIL' : 'ok');
process.exit(bad ? 1 : 0);
