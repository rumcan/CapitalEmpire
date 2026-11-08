// T376 (#1032): shops on a street that is not on the map's axes. A hand-drawn road is hardly ever exactly on an axis or a diagonal, and the lots along it
// are turned a few degrees off one: the shop's picture stays axis-aligned, so its footprint corner reaches past the turned front line (compose's REACH, 0.3 tile)
// and its picture's ground contact (steps, mats, planters) comes on top. This stages a real street (the lot map's own lots along it, as the game lays them)
// turned `tilt` degrees off the x axis, a shop of each business on a lot whose street lies toward the camera, at the game's closest camera (30%), with each lot's
// outline (yellow), its front line (red) and the shop's footprint (cyan); the numbers: the footprint's nearest corner and the picture's ground contact against
// the front line, in tiles (negative: over the line, on the pavement).
//   node scripts/dev/street-front-tilted.mjs --base http://127.0.0.1:5189/ --out E:/ClaudeTemp/T375 --tag before|after [--tilts 0,10,20] [--biz world:video_rental,town:fish_tackle,town:grocery]
//     [--pads src/game/lots/base-pad-data.ts]  (the pad table to count the pictures' ground contact with, read from this file: a build without the setback has none of its own)
// Needs a dev server (vite) on --base. One headless Edge, closed when done. Nothing is saved.
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://127.0.0.1:5189/'), out = opt('out', 'output/street-front-tilted'), tag = opt('tag', 'after');
const tilts = opt('tilts', '0,10,20').split(',').map(Number), bizs = opt('biz', 'world:video_rental,town:fish_tackle,town:grocery').split(',');
mkdirSync(out, { recursive: true });
const padsFile = opt('pads', ''), PADS = {};
if (padsFile) for (const l of readFileSync(padsFile, 'utf8').split(/\r?\n/)) { const m = /^\s*"([^"]+)":\s*\[([^\]]+)\]/.exec(l); if (m) PADS[m[1]] = m[2].split(',').map(Number); }
const W = 1100, H = 760, ZOOM = 0.3, CELL_W = 520, CELL_H = 330;
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
try {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.route('**/*', r => { const x = r.request(); return x.method() !== 'GET' && x.method() !== 'HEAD' ? r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }) : r.continue(); });
  await page.goto(`${base}?start=town&seed=1&desert=on`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 300000 });
  await page.addStyleTag({ content: '* { visibility: hidden !important } canvas { visibility: visible !important }' });
  await page.evaluate(() => { const g = window.__game; g.prebake = () => {}; g.setShowGrid?.(false); window.__night = 0; g.nightAmount = () => window.__night; g.setSpeed(0); });
  const settle = async () => {
    await sleep(500);
    await page.evaluate(() => { window.__calm = 0; });
    await page.waitForFunction(() => { const g = window.__game; window.__calm = g.ground.busy === 0 && g.lotQueue.size === 0 ? window.__calm + 1 : 0; return window.__calm > 12; }, null, { timeout: 90000, polling: 50 }).catch(() => console.log('  (settle timed out)'));
    await sleep(250);
  };
  /** a street turned tilt degrees, its lots as the lot map lays them; a shop (biz) on each of the chosen lots whose street lies toward the camera; their geometry and what each draws */
  const stage = (tilt, list) => page.evaluate(async ([tilt, list, PADS]) => {
    const g = window.__game, { LotMap } = await import('/src/game/lots/lots.ts'), { CLASS } = await import('/src/game/network.ts'), { LU } = await import('/src/game/lots/town.ts'), { LIBRARY } = await import('/src/game/library.ts');
    const { isBuilding } = await import('/src/game/mirror.ts'), { roadOf } = await import('/src/game/lots/preset-frame.ts'), { footprintOf } = await import('/src/game/lots/preset-art.ts');
    // (the pictures' ground contact toward the street: the table's row for the road 0, 1 or 2, metres at scale 1, tiles at the shop's scale)
    const pad = (id, road, s) => { const r = PADS[id]; return r && road >= 0 && road <= 2 ? r[road] * s / 2 : 0; };
    g.benchMode = true; g.farmsOn(false); g.reset(); g.afterLoad(); g.setSpeed(0);
    const t = g.terrain.start, R = { x: Math.round(t.x + t.size / 2), y: Math.round(t.y + t.size / 2) }, a = tilt * Math.PI / 180, D = { x: Math.cos(a), y: Math.sin(a) }, LEG = 80;
    g.edit.addLegs([{ a: { x: R.x - LEG * D.x, y: R.y - LEG * D.y }, b: { x: R.x + LEG * D.x, y: R.y + LEG * D.y } }], CLASS.street, 0);
    g.commitNetwork();
    const { added } = new LotMap().update(g.net, g.terrain.cls);
    // the lots whose street lies toward the camera (+y: their away vector n points to -y), near the middle, in order along the street
    const side = added.filter(l => l.n.y < -0.4 && Math.hypot(l.o.x - R.x, l.o.y - R.y) < 45 && l.w >= 9).sort((p, q) => (p.o.x - q.o.x) || (p.o.y - q.o.y));
    const pickAt = list.map((_, i) => side[Math.min(side.length - 1, Math.floor((i + 0.5) * side.length / list.length))]).filter(Boolean);
    const cells = [];
    pickAt.forEach((l, i) => {
      const geom = { o: l.o, u: l.u, n: l.n, w: l.w, d: l.d }, st = { use: LU.COM, level: 2, decline: 0, seed: 31 + 7 * i, biz: list[i] };
      g.staged.set(l.key, { g: geom, st }); g.placeLot(l.key, geom, st);
      const props = [...g.propsOfLot(l.key)].filter(p => isBuilding(LIBRARY[p.item]));
      let main = null, area = 0; for (const p of props) { const ar = (p.x1 - p.x0) * (p.y1 - p.y0); if (ar > area) { area = ar; main = p; } }
      if (!main) { cells.push({ key: l.key, geom, biz: list[i], id: null }); return; }
      const box = [main.x0, main.y0, main.x1, main.y1], corners = [[box[0], box[1]], [box[2], box[1]], [box[2], box[3]], [box[0], box[3]]];
      const b0 = Math.min(...corners.map(([x, y]) => (x - l.o.x) * l.n.x + (y - l.o.y) * l.n.y)), id = LIBRARY[main.item].id;
      // (the picture's ground contact toward the street, at the footprint's size: the box's width over the library box's: the scale)
      const fp = footprintOf(id, 1, false), k = (box[2] - box[0]) / Math.max(1e-6, fp[2] - fp[0]);
      cells.push({ key: l.key, geom, biz: list[i], id, box, road: roadOf(l.n), b0, front: b0 - pad(id, roadOf(l.n), k), tilt: Math.round(Math.atan2(-l.n.x, -l.n.y) * 180 / Math.PI) });
    });
    return cells;
  }, [tilt, list, PADS]);
  const project = pts => page.evaluate(async pts => {
    const g = window.__game, { worldX, worldY } = await import('/src/game/iso.ts');
    return pts.map(([x, y]) => [(worldX(x, y) - g.cam.X) * g.cam.z + g.cssW / 2, (worldY(x, y) - g.cam.Y) * g.cam.z + g.cssH / 2]);
  }, pts);
  const rows = [];
  for (const tilt of tilts) {
    const cells = await stage(tilt, bizs), row = { tilt, cells: [] };
    for (const c of cells) {
      if (!c.id) { console.log(`  no building on the ${c.biz} lot at tilt ${tilt}`); continue; }
      // the camera on the lot's front, then the shot
      await page.evaluate(([x, y, z]) => { const g = window.__game; g.camEase = null; g.lookAt(x, y, z); }, [c.geom.o.x + c.geom.u.x * c.geom.w / 2 + c.geom.n.x * 6, c.geom.o.y + c.geom.u.y * c.geom.w / 2 + c.geom.n.y * 6, ZOOM]);
      await settle();
      const g = c.geom, P = (a, b) => [g.o.x + g.u.x * a + g.n.x * b, g.o.y + g.u.y * a + g.n.y * b];
      const lot = await project([P(0, 0), P(g.w, 0), P(g.w, g.d), P(0, g.d)]), box = await project([[c.box[0], c.box[1]], [c.box[2], c.box[1]], [c.box[2], c.box[3]], [c.box[0], c.box[3]]]);
      const png = await page.screenshot({ type: 'png' });
      const fxs = [lot[0][0], lot[1][0]], fys = [lot[0][1], lot[1][1]];
      const left = Math.max(0, Math.round(Math.min(...fxs) - 50)), top = Math.max(0, Math.round(Math.min(...fys) - 210)), right = Math.min(W, Math.round(Math.max(...fxs) + 50)), bottom = Math.min(H, Math.round(Math.max(...fys) + 80));
      const pl = (pts, col, wd) => `<polygon points="${pts.map(p => `${(p[0] - left).toFixed(1)},${(p[1] - top).toFixed(1)}`).join(' ')}" fill="none" stroke="${col}" stroke-width="${wd}"/>`;
      const front = `<line x1="${(lot[0][0] - left).toFixed(1)}" y1="${(lot[0][1] - top).toFixed(1)}" x2="${(lot[1][0] - left).toFixed(1)}" y2="${(lot[1][1] - top).toFixed(1)}" stroke="#ff3b3b" stroke-width="3"/>`;
      const svg = Buffer.from(`<svg width="${right - left}" height="${bottom - top}" xmlns="http://www.w3.org/2000/svg">${pl(lot, '#ffe600', 1)}${front}${pl(box, '#27e0ff', 1.5)}</svg>`);
      const framed = await sharp(png).extract({ left, top, width: right - left, height: bottom - top }).composite([{ input: svg }]).png().toBuffer();
      const buf = await sharp(framed).resize(CELL_W - 8, CELL_H - 30, { fit: 'inside' }).png().toBuffer();
      const over = c.front < -0.03;
      row.cells.push({ buf, label: `${c.biz} · street ${c.tilt}° off · base ${c.front >= 0 ? '+' : ''}${c.front.toFixed(2)} tiles ${over ? 'OVER THE LINE' : 'behind it'}`, over });
      results.push({ tilt, biz: c.biz, id: c.id, road: c.road, lotTilt: c.tilt, footprintFront: +c.b0.toFixed(3), baseFront: +c.front.toFixed(3), over });
      console.log(`  tilt ${tilt}: ${c.biz} drawn as ${c.id}: footprint ${c.b0.toFixed(2)}, base ${c.front.toFixed(2)} tiles from the front line`);
    }
    rows.push(row);
  }
  const comp = []; let y = 0;
  for (const row of rows) {
    row.cells.forEach((c, i) => {
      comp.push({ input: c.buf, left: i * CELL_W + 4, top: y });
      comp.push({ input: Buffer.from(`<svg width="${CELL_W - 8}" height="26" xmlns="http://www.w3.org/2000/svg"><text x="4" y="18" font-family="Segoe UI,Arial" font-size="14" fill="${c.over ? '#ff5d5d' : '#64d98b'}">${c.label.replace(/&/g, '&amp;')}</text></svg>`), left: i * CELL_W + 4, top: y + CELL_H - 30 });
    });
    y += CELL_H;
  }
  if (comp.length) await sharp({ create: { width: CELL_W * bizs.length, height: Math.max(y, 1), channels: 4, background: '#3b4252' } }).composite(comp).png().toFile(join(out, `tilted-${tag}.png`));
  console.log(join(out, `tilted-${tag}.png`));
  await ctx.close();
} finally { await browser.close(); }
writeFileSync(join(out, `tilted-${tag}.json`), JSON.stringify(results, null, 1));
console.log(`${results.filter(r => r.over).length} of ${results.length} shops over the front line`);
