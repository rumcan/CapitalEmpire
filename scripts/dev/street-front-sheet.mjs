// T375 / T376: the street-front check sheet: each building of the town on a lot (the lot lab's staged lot, Game.stageLab, composed as the game composes it)
// with its road on each of the eight headings (the four map-axis roads, which draw the corner views, and the four screen-straight ones, which draw the
// straight-on views of an eight-view building), at the game's closest camera (30%). Each cell carries the lot's outline (yellow; the street side thick:
// a building's walls stay behind it, the sidewalk lies beyond), the main building's footprint (cyan) and a verdict on what it faces: front (its front meets
// the road), 45 off (a four-view building on a screen-straight road: the nearest corner), WRONG (its front is turned off the road by 90 degrees or more).
//   node scripts/dev/street-front-sheet.mjs --base http://127.0.0.1:5189/ --out E:/ClaudeTemp/T375 --tag before|after [--only shops,venues,houses] [--roads 0,1,2,3,4,5,6,7]
//     [--houses 6]  (houses: how many of the palette's, spread along it)
//     [--only wanted --wanted id,id,...]  (T398: any building by its library id, on the lot kind that shows it: each found by scanning lots of the town's use kinds along a street)
//     [--rows 8]  (rows a sheet: a long sheet is cut into files *-1, *-2 ...)
//     [--cap 25]  (T398: minutes the whole run may take before the browser is closed and the run fails; the page load of each attempt is capped at 6 minutes: a stuck page fails the job, it never hangs it)
//     [--front]  (T376: each cell framed on the lot's street front, the red line, larger: the base of the walls against the pavement; the sheets are named *-front-<tag>.png)
// Needs a dev server (vite) on --base. One headless Edge, closed when done. Nothing is saved.
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://127.0.0.1:5189/'), out = opt('out', 'output/street-front-sheet'), tag = opt('tag', 'after');
const only = new Set(opt('only', 'shops,venues,houses').split(',')), roads = opt('roads', '0,1,2,3,4,5,6,7').split(',').map(Number), nHouses = +opt('houses', '17');
mkdirSync(out, { recursive: true });
const front = args.includes('--front');
const W = 1500, H = 950, ZOOM = 0.3, CELL_W = front ? 560 : 400, CELL_H = front ? 330 : 300;
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
// (T398: the heavy lock is shared by every agent: a run that hangs on a page must fail, not hold it. The browser is closed first, then the process ends with status 3)
const watchdog = setTimeout(async () => { console.log(`[watchdog] over the ${opt('cap', '25')} minute cap: closing the browser`); try { await browser.close(); } catch { /* gone */ } process.exit(3); }, +opt('cap', '25') * 60000);
watchdog.unref();
try {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.route('**/*', r => { const x = r.request(); return x.method() !== 'GET' && x.method() !== 'HEAD' ? r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }) : r.continue(); });
  // (T398: a cold dev server pre-bundles its dependencies on the first load and reloads the page when it is done, which aborts a navigation in flight, and a machine
  // short of memory answers late: the load is tried again)
  for (let attempt = 1; ; attempt++) {
    try {
      await page.goto(`${base}?start=town&seed=1${opt('desert', '1') === '1' ? '&desert=on' : ''}`, { waitUntil: 'domcontentloaded', timeout: 360000 });
      await page.waitForFunction(() => window.__game?.ready, null, { timeout: 360000 }); break;
    } catch (e) { if (attempt >= 2) throw e; console.log(`  (load attempt ${attempt} failed: ${String(e.message).split(/\r?\n/)[0]}; again)`); await sleep(8000); }
  }
  await page.addStyleTag({ content: '* { visibility: hidden !important } canvas { visibility: visible !important }' });
  await page.evaluate(() => { const g = window.__game; g.prebake = () => {}; g.setShowGrid?.(false); window.__night = 0; g.nightAmount = () => window.__night; g.setSpeed(0); });
  const settle = async (ms = 500) => {
    const t0 = Date.now();
    await sleep(ms);
    await page.evaluate(() => { window.__calm = 0; });
    // (Game.lotsPending counts the staged lab lot as well, which stays: the lot queue alone says the lots are composed)
    await page.waitForFunction(() => { const g = window.__game; window.__calm = g.ground.busy === 0 && g.lotQueue.size === 0 ? window.__calm + 1 : 0; return window.__calm > 12; }, null, { timeout: 90000, polling: 50 }).catch(() => console.log('  (settle timed out)'));
    await sleep(200);
    const dt = Date.now() - t0; if (dt > 15000) { const st = await page.evaluate(() => ({ busy: window.__game.ground.busy, queue: window.__game.lotQueue.size })); console.log('  slow settle', dt, 'ms', JSON.stringify(st)); }
  };
  /** which building a lot shows and what it faces: the lot lab's lot staged for a road, shifted `shift` lattice cells along its street, `biz` forced */
  const stage = (o) => page.evaluate(async o => {
    const g = window.__game, { LU } = await import('/src/game/lots/town.ts'), { LIBRARY } = await import('/src/game/library.ts');
    const pa = await import('/src/game/lots/preset-art.ts'), { isBuilding } = await import('/src/game/mirror.ts'), { sizeKey } = pa;
    // (lead/live has no object-eight.ts: the before run reads the old art's views alone)
    let eight = null; try { eight = (await import('/src/game/object-eight.ts')).objectFacings; } catch { /* the old game */ }
    // (T398 forced: the building alone on the lot: the lot composes nothing (a shopping centre's part, biz '^force') and the building is put there in the picture the game draws for that road, at its owner size)
    const st = o.force ? { use: LU.NONE, level: 0, decline: 0, seed: o.seed, biz: '^force' } : { use: LU[o.use], level: 2, decline: 0, seed: o.seed, ...(o.biz ? { biz: o.biz } : {}) };
    // (stageLab resets the whole map: once for a lot's kind and road, then the lot moves along its street a lattice cell at a time)
    const lk = [o.use, o.road, o.w, o.d, o.seed, o.biz ?? '', o.force ? 'forced' : ''].join('|');
    if (window.__labKey !== lk) { window.__labGeom = g.stageLab({ road: o.road, w: o.w, d: o.d, st }).g; window.__labKey = lk; }
    let geom = window.__labGeom;
    if (o.shift) geom = { ...geom, o: { x: geom.o.x + geom.u.x * 7 * o.shift, y: geom.o.y + geom.u.y * 7 * o.shift } };
    if (o.force) {
      const { frameOf } = await import('/src/game/lots/preset-frame.ts'), dv = pa.drawnView(o.force, frameOf(geom), 0), q = { x: geom.o.x + geom.u.x * o.w / 2 + geom.n.x * o.d / 2, y: geom.o.y + geom.u.y * o.w / 2 + geom.n.y * o.d / 2 };
      g.lotOverride = key => key === 'lab' ? { props: [{ id: dv.id, x: q.x, y: q.y, flip: dv.flip, scale: pa.ownerScaleOf(o.force) }], ground: [] } : undefined;
    } else g.lotOverride = null;
    g.placeLot('lab', geom, st);
    const props = [...g.propsOfLot('lab')].filter(p => isBuilding(LIBRARY[p.item]));
    let main = null, area = 0; for (const p of props) { const a = (p.x1 - p.x0) * (p.y1 - p.y0); if (a > area) { area = a; main = p; } }
    const id = main ? LIBRARY[main.item].id : null;
    // where the drawn picture lies on the ring [NE, N, SE, E, SW, S, NW, W] (the road's order): an object8 picture by its ring, an old screen-axis picture (N E S W) on the odd places, an old corner on the even ones
    let ringPos = null, key = null, mode = null, subject = id ? sizeKey(id) : null;
    if (id) {
      const e = id.startsWith('object8:') && eight ? eight(id) : null, ax = pa.axisViews(id), fv = pa.fourViews(id);
      if (e && e.mode === 'eight') { ringPos = e.at; key = e.keys[e.at]; mode = 'eight'; subject = e.subject ?? subject; } // (an eight-view picture's subject is its set's, not its own id)
      else if (ax) { ringPos = 2 * ax.at + 1; key = 'axis' + 'NESW'[ax.at]; mode = 'axis'; }
      else if (fv) { ringPos = 2 * fv.at; key = ['NE', 'SE', 'SW', 'NW'][fv.at]; mode = 'four'; }
    }
    const diff = ringPos === null ? null : (((ringPos - o.road) % 8) + 8) % 8;
    const c = { x: geom.o.x + geom.u.x * o.w / 2 + geom.n.x * o.d / 2, y: geom.o.y + geom.u.y * o.w / 2 + geom.n.y * o.d / 2 };
    g.camEase = null; g.lookAt(c.x, c.y, o.zoom);
    return { id, subject, mode, key, ringPos, diff, geom, box: main ? [main.x0, main.y0, main.x1, main.y1] : null };
  }, o);
  /** the screen points of world tile points (the camera as it is now) */
  const project = pts => page.evaluate(async pts => {
    const g = window.__game, { worldX, worldY } = await import('/src/game/iso.ts');
    return pts.map(([x, y]) => [(worldX(x, y) - g.cam.X) * g.cam.z + g.cssW / 2, (worldY(x, y) - g.cam.Y) * g.cam.z + g.cssH / 2]);
  }, pts);
  const cell = async (o, label, staged) => {
    const r = staged ?? await stage({ ...o, zoom: ZOOM });
    await settle();
    const gm = r.geom, corner = (a, b) => [gm.o.x + gm.u.x * a + gm.n.x * b, gm.o.y + gm.u.y * a + gm.n.y * b];
    const lot = await project([corner(0, 0), corner(o.w, 0), corner(o.w, o.d), corner(0, o.d)]);
    const box = r.box ? await project([[r.box[0], r.box[1]], [r.box[2], r.box[1]], [r.box[2], r.box[3]], [r.box[0], r.box[3]]]) : null;
    const png = await page.screenshot({ type: 'png' });
    const xs = lot.map(p => p[0]), ys = lot.map(p => p[1]);
    const fxs = [lot[0][0], lot[1][0]], fys = [lot[0][1], lot[1][1]];
    const left = Math.max(0, Math.round((front ? Math.min(...fxs) : Math.min(...xs)) - 40)), top = Math.max(0, Math.round((front ? Math.min(...fys) - 200 : Math.min(...ys) - 150))), right = Math.min(W, Math.round((front ? Math.max(...fxs) : Math.max(...xs)) + 40)), bottom = Math.min(H, Math.round((front ? Math.max(...fys) + 70 : Math.max(...ys) + 50)));
    const pl = (pts, col, wd) => `<polygon points="${pts.map(p => `${(p[0] - left).toFixed(1)},${(p[1] - top).toFixed(1)}`).join(' ')}" fill="none" stroke="${col}" stroke-width="${wd}"/>`;
    const frontEdge = `<line x1="${(lot[0][0] - left).toFixed(1)}" y1="${(lot[0][1] - top).toFixed(1)}" x2="${(lot[1][0] - left).toFixed(1)}" y2="${(lot[1][1] - top).toFixed(1)}" stroke="#ff3b3b" stroke-width="4"/>`;
    const svg = Buffer.from(`<svg width="${right - left}" height="${bottom - top}" xmlns="http://www.w3.org/2000/svg">${pl(lot, '#ffe600', 1.5)}${frontEdge}${box ? pl(box, '#27e0ff', 1.5) : ''}</svg>`);
    const verdict = r.diff === null ? 'single view' : r.diff === 0 ? 'front' : (r.diff === 1 || r.diff === 7) ? '45 off' : 'WRONG';
    // (sharp runs a composite after the resize whatever the call order: frame the outlines first, then shrink)
    const framed = await sharp(png).extract({ left, top, width: right - left, height: bottom - top }).composite([{ input: svg }]).png().toBuffer();
    const buf = await sharp(framed).resize(CELL_W - 8, CELL_H - 52, { fit: 'inside' }).png().toBuffer();
    results.push({ label, road: o.road, id: r.id, subject: r.subject, mode: r.mode, key: r.key, verdict });
    console.log(`  cell ${label} road ${o.road}: ${r.key ?? '-'} ${verdict}`);
    return { buf, verdict, key: r.key, id: r.id };
  };
  const arrows = ['S', 'SW', 'W', 'NW', 'N', 'NE', 'E', 'SE'];
  const sheet = async (name, rows) => {
    const cols = roads.length, comp = []; let y = 0;
    for (const row of rows) {
      const head = Buffer.from(`<svg width="${CELL_W * cols}" height="26" xmlns="http://www.w3.org/2000/svg"><text x="8" y="19" font-family="Segoe UI,Arial" font-size="17" font-weight="700" fill="#ffd166">${row.label}</text></svg>`);
      comp.push({ input: head, left: 0, top: y }); y += 26;
      for (let c = 0; c < cols; c++) {
        const cl = row.cells[c]; if (!cl) continue;
        comp.push({ input: cl.buf, left: c * CELL_W + 4, top: y });
        const col = cl.verdict === 'front' ? '#64d98b' : cl.verdict === '45 off' ? '#ffb340' : cl.verdict === 'WRONG' ? '#ff5d5d' : '#9aa';
        comp.push({ input: Buffer.from(`<svg width="${CELL_W - 8}" height="24" xmlns="http://www.w3.org/2000/svg"><text x="4" y="17" font-family="Segoe UI,Arial" font-size="14" fill="${col}">road ${roads[c]} (${arrows[roads[c]]}) · ${cl.verdict} · ${cl.key ?? ''}</text></svg>`), left: c * CELL_W + 4, top: y + CELL_H - 50 });
      }
      y += CELL_H - 20;
    }
    const file = join(out, `${name}${front ? '-front' : ''}-${tag}.png`);
    await sharp({ create: { width: CELL_W * cols, height: y, channels: 4, background: '#3b4252' } }).composite(comp).png().toFile(file); console.log(file);
  };
  /** one sheet, or several of at most `rows` rows each (a house palette of 19 and eight roads is a very tall picture) */
  const perSheet = +opt('rows', '8');
  const sheets = async (name, rows) => { if (rows.length <= perSheet) return sheet(name, rows); for (let i = 0; i * perSheet < rows.length; i++) await sheet(`${name}-${i + 1}`, rows.slice(i * perSheet, (i + 1) * perSheet)); };
  const SHOPS = ['town:bakery', 'town:grocery', 'town:pharmacy', 'world:video', 'town:laundromat', 'world:video_rental', 'town:fish_tackle', 'town:barber'], VENUES = ['world:arcade', 'world:diner', 'world:snack_bar'];
  if (only.has('shops')) {
    const rows = [];
    for (const biz of SHOPS) { const cells = []; for (const road of roads) cells.push(await cell({ use: 'COM', road, w: 16, d: 14, seed: 31, biz }, biz)); rows.push({ label: biz, cells }); }
    await sheets('shops', rows);
  }
  if (only.has('venues')) {
    const rows = [];
    for (const want of VENUES) {
      const cells = [];
      for (const road of roads) {
        let best = null;
        for (let k = 0; k < 17 && !best; k++) { const shift = k % 2 ? (k + 1) / 2 : -k / 2, o = { use: 'TOUR', road, w: 20, d: 18, seed: 5, shift }, r = await stage({ ...o, zoom: ZOOM }); if (r.id && r.subject === want) best = await cell(o, want, r); }
        cells.push(best);
      }
      rows.push({ label: want, cells });
    }
    await sheets('venues', rows);
  }
  if (only.has('houses')) {
    const pal = await page.evaluate(async () => { const { housePalette } = await import('/src/game/lots/compose.ts'); return [...housePalette()]; });
    const picks = pal.filter((_, i) => i % Math.max(1, Math.floor(pal.length / nHouses)) === 0).slice(0, nHouses);
    const rows = [];
    for (const want of picks) {
      const cells = [];
      for (const road of roads) {
        let best = null;
        for (let k = 0; k < 21 && !best; k++) { const shift = k % 2 ? (k + 1) / 2 : -k / 2, o = { use: 'RES', road, w: 14, d: 14, seed: 3, shift }, r = await stage({ ...o, zoom: ZOOM }); if (r.id && (r.subject === want || r.id === want)) best = await cell(o, want, r); }
        cells.push(best);
      }
      rows.push({ label: want, cells });
    }
    await sheets('houses', rows);
  }
  if (only.has('forced')) {
    // T398: each building of --wanted (a library id) alone on a lot of each road asked for, in the picture the game draws for it on that road (corner views on the roads along an axis, the eight-view set's
    // straight-on views on the screen-straight ones): no town lot has to show it. Before the import: the nearest corner, 45 off; after: the straight-on view, front
    const rows = [];
    for (const want of opt('wanted', '').split(',').filter(Boolean)) {
      const cells = [];
      for (const road of roads) { const o = { use: 'RES', road, w: 20, d: 18, seed: 5, force: want }; cells.push(await cell(o, want, await stage({ ...o, zoom: ZOOM }))); }
      rows.push({ label: want, cells });
    }
    await sheets('forced', rows);
  }
  if (only.has('wanted')) {
    // T398: the buildings of the straight-views batch (or any): each on the first lot of a town use kind that shows it, on every road asked for
    const USES = [['TOUR', 20, 18, 5], ['GOV', 20, 18, 5], ['IND', 24, 20, 5], ['COM', 16, 14, 31], ['RES', 14, 14, 3]];
    const rows = [];
    for (const want of opt('wanted', '').split(',').filter(Boolean)) {
      const cells = [];
      for (const road of roads) {
        let best = null;
        for (const [use, w, d, seed] of USES) {
          for (let k = 0; k < 21 && !best; k++) { const shift = k % 2 ? (k + 1) / 2 : -k / 2, o = { use, road, w, d, seed, shift }, r = await stage({ ...o, zoom: ZOOM }); if (r.id && (r.subject === want || r.id === want)) best = await cell(o, want, r); }
          if (best) break;
        }
        if (!best) console.log(`  no lot shows ${want} on road ${road}`);
        cells.push(best);
      }
      rows.push({ label: want, cells });
    }
    await sheets('wanted', rows);
  }
  await ctx.close();
} finally { await browser.close(); }
writeFileSync(join(out, `street-front${front ? '-fronts' : ''}-${tag}.json`), JSON.stringify(results, null, 1));
const byBuilding = {}; for (const r of results) { (byBuilding[r.label] ??= []).push(`${r.road}:${r.verdict}`); }
console.log(JSON.stringify(byBuilding, null, 1));
