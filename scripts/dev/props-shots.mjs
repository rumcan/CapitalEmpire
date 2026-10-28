// T257 (#747): in-game shots of the props: their shadows, the Props panel's and the plant brush's thumbnails, the variety and a turned,
// flipped and scaled rock. On the range start (seed 1), on its plot's open grass behind the shop, broad day unless said:
//   rocks    three boulders (small, medium, large) on the grass, 30%
//   shrubs   a shrub bed: the six autumn shrubs with the mums before them, 30%
//   palms    the nine palms (windmill, Canary, dwarf fan), 30%
//   lamps    the practice green lamp posts among a few rocks and shrubs at dusk (the lamps lit), 30%
//   panel    the Props panel's Stone and Plants cards and the plant brush's Bushes and Palms at 1920 x 1080
//   variety  (after T257) the nine boulder shapes, a Rocks, mixed drag and the mixed shrubs, mums and palms, 30%
//   flip     (after T257) one rock as placed, flipped with R and scaled with [ and ] (80% and 120%), 30%
// 30% is the closest zoom (ZOOM_MAX): each scene also gets its middle enlarged 2.5x (<name>-x2.5.jpg) to see the shadows' feet.
//   node scripts/dev/props-shots.mjs --base http://127.0.0.1:5186/ --out E:/ClaudeTemp/T257 --tag before [--only rocks,shrubs,...]
// Needs a dev server (vite) on --base. One headless Edge, closed when done; a fresh profile, so each start is a new game.
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://127.0.0.1:5186/'), out = opt('out', 'output/props-shots'), tag = opt('tag', 'after'), seed = opt('seed', '1');
const only = new Set(opt('only', 'rocks,shrubs,palms,lamps,panel,variety,flip').split(','));
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const settle = async (page, ms = 900) => {
  await page.waitForTimeout(ms);
  await page.evaluate(() => { window.__calm = 0; });
  await page.waitForFunction(() => { const g = window.__game; window.__calm = g.ground.busy === 0 ? window.__calm + 1 : 0; return window.__calm > 20; }, null, { timeout: 60000, polling: 50 }).catch(() => console.log('  (settle timed out)'));
  await page.waitForTimeout(400);
};
const shot = async (page, name, clip, zoom) => {
  const file = join(out, `${tag}-${name}.jpg`), png = await page.screenshot({ type: 'png', ...(clip ? { clip } : {}) });
  await sharp(png).jpeg({ quality: 90, mozjpeg: true }).toFile(file);
  console.log(file);
  // the middle of a scene, enlarged (the closest zoom is 30%)
  if (zoom) { const m = await sharp(png).metadata(), w = Math.round(m.width / 2.5), h = Math.round(m.height / 2.5); const z = join(out, `${tag}-${name}-x2.5.jpg`); await sharp(png).extract({ left: Math.round((m.width - w) / 2), top: Math.round((m.height - h) / 2), width: w, height: h }).resize(m.width, m.height, { kernel: 'lanczos3' }).jpeg({ quality: 90 }).toFile(z); console.log(z); }
  return file;
};
const hideUi = page => page.addStyleTag({ content: '* { visibility: hidden !important } canvas { visibility: visible !important }' });
const look = (page, x, y, z) => page.evaluate(([x, y, z]) => { const g = window.__game; g.camEase = null; g.lookAt(x, y, z); }, [x, y, z]);
/** a fresh range start, loaded, paused, broad day, money to spend, no baking ahead; the open grass of its plot */
const open = async (W = 1280, H = 800) => {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 }), page = await ctx.newPage();
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  page.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 200)); });
  await page.goto(`${base}?start=range&seed=${seed}`);
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 240000 });
  await page.evaluate(() => { const g = window.__game; g.prebake = () => {}; g.setSpeed(0); window.__night = 0; g.nightAmount = () => window.__night; g.traffic.spend('construction', -2000000); });
  // open grass of the player's land (the range plot: the practice area is bought later): the first spot from the shop outward where a large
  // boulder may stand at every point of a 10 x 9 lattice 3 tiles apart (no road, water, building or prop in the way)
  const area = await page.evaluate(([W, H]) => {
    const g = window.__game, shop = g.range.scene.pieces.find(q => q.key === 'shop');
    g.setTool('props'); g.decor.setView('course'); g.decor.pick('kit-boulder-l');
    const ok = (x, y) => { g.camEase = null; g.lookAt(x, y, 0.3); g.decor.move(W / 2, H / 2); const q = g.decor.ghost; return q && !q.why; };
    let found = null;
    for (let r = 0; r <= 80 && !found; r += 4) for (let a = 0; a < Math.max(1, Math.round(r * 1.5)) && !found; a++) {
      const cx = Math.round(shop.x + Math.cos(a / Math.max(1, Math.round(r * 1.5)) * 2 * Math.PI) * r), cy = Math.round(shop.y + Math.sin(a / Math.max(1, Math.round(r * 1.5)) * 2 * Math.PI) * r);
      let all = true; for (let j = -4; j <= 4 && all; j++) for (let i = -4; i <= 5 && all; i++) all = ok(cx + i * 3, cy + j * 3);
      if (all) found = { x: cx, y: cy };
    }
    g.decor.pick(null); g.setTool('select');
    return found ?? { x: shop.x - 4, y: shop.y - 26 };
  }, [W, H]);
  console.log('area', JSON.stringify(area));
  return { page, ctx, area, W, H };
};
/** places library picture `id` as catalogue item `key` at the first free spot from (x, y) outward (the Props tool's own check with the item in
 *  hand), at its size times `size`, mirrored when flip; returns where */
const place = (s, key, id, x, y, flip = false, size = 1) => s.page.evaluate(([key, id, x, y, flip, size, W, H]) => {
  const g = window.__game, c = g.decor.ctx; g.setTool('props'); g.decor.setView('course'); g.decor.pick(key);
  for (let r = 0; r <= 5; r += 0.5) for (let a = 0; a < (r ? 12 : 1); a++) {
    const px = x + Math.cos(a * Math.PI / 6) * r, py = y + Math.sin(a * Math.PI / 6) * r;
    g.camEase = null; g.lookAt(px, py, 0.3); g.decor.move(W / 2, H / 2); const gh = g.decor.ghost;
    if (!gh || gh.why) continue;
    const item = c.item(id), k = c.scaleOf(item) * size, p = g.addProp(item, gh.x, gh.y, flip, k); p.decor = key;
    g.decor.pick(null); g.setTool('select'); return { id, x: gh.x, y: gh.y };
  }
  g.decor.pick(null); g.setTool('select'); return { id, none: true };
}, [key, id, x, y, flip, size, s.W, s.H]);
const B = { s: ['kit:boulder-small-a', 'kit:boulder-small-b', 'kit:boulder-small-c'], m: ['kit:boulder-medium-a', 'kit:boulder-medium-b', 'kit:boulder-medium-c'], l: ['kit:boulder-large-a', 'kit:boulder-large-b', 'kit:boulder-large-c'] };
const SHRUBS = ['kit:shrub-burning-bush', 'kit:shrub-golden-spirea', 'kit:shrub-boxwood-ball', 'kit:shrub-red-twig-dogwood', 'kit:shrub-blue-juniper', 'kit:shrub-plume-grass'];
const MUMS = ['kit:flowers-mums-red', 'kit:flowers-mums-yellow', 'kit:flowers-mums-orange', 'kit:flowers-mums-white', 'kit:flowers-mums-bronze', 'kit:flowers-black-eyed-susans'];
const PALMS = [['kit-palm-windmill', 'kit:palm-windmill-4m'], ['kit-palm-windmill', 'kit:palm-windmill-5m'], ['kit-palm-windmill', 'kit:palm-windmill-6m'], ['kit-palm-canary', 'kit:palm-canary-6m'], ['kit-palm-canary', 'kit:palm-canary-8m'], ['kit-palm-canary', 'kit:palm-canary-10m'], ['kit-palm-fan', 'kit:palm-dwarf-fan-2m'], ['kit-palm-fan', 'kit:palm-dwarf-fan-3m'], ['kit-palm-fan', 'kit:palm-dwarf-fan-3-5m']];
try {
  if (only.has('rocks') || only.has('shrubs') || only.has('palms') || only.has('lamps')) {
    const s = await open(), { page, area } = s, log = [];
    // the rocks: the owner's three, side by side (the first shape of each size)
    log.push(await place(s, 'kit-boulder-l', B.l[0], area.x - 3, area.y - 9), await place(s, 'kit-boulder-m', B.m[0], area.x - 0.5, area.y - 9.5), await place(s, 'kit-boulder-s', B.s[0], area.x + 1.5, area.y - 10));
    // the shrub bed: six shrubs in a row, the mums before them
    for (const [i, id] of SHRUBS.entries()) log.push(await place(s, 'kit-shrub', id, area.x - 4 + i * 1.6, area.y));
    for (const [i, id] of MUMS.entries()) log.push(await place(s, 'kit-mums', id, area.x - 4 + i * 1.6, area.y + 1.4));
    // the palms: three rows
    for (const [i, [key, id]] of PALMS.entries()) log.push(await place(s, key, id, area.x + 8 + (i % 3) * 3, area.y - 6 + Math.floor(i / 3) * 4));
    // the lamps among rocks and shrubs
    for (const [k, id, dx, dy] of [['kit-lamp', 'kit:lamp-post-single', -8, 8], ['kit-lamp-twin', 'kit:lamp-post-twin', -4, 8], ['kit-lamp', 'kit:lamp-post-single', 0, 8], ['kit-boulder-m', B.m[1], -6, 10], ['kit-shrub', SHRUBS[2], -2, 10], ['kit-boulder-s', B.s[2], -9, 10]]) log.push(await place(s, k, id, area.x + dx, area.y + dy));
    console.log('placed', JSON.stringify(log.filter(Boolean).filter(p => p.none)));
    await hideUi(page);
    if (only.has('rocks')) { await look(page, area.x - 1, area.y - 9.5, 0.3); await settle(page, 1800); await shot(page, 'rocks-30pct', null, true); }
    if (only.has('shrubs')) { await look(page, area.x, area.y + 0.7, 0.3); await settle(page, 1200); await shot(page, 'shrub-bed-30pct', null, true); }
    if (only.has('palms')) { await look(page, area.x + 11, area.y - 2, 0.3); await settle(page, 1200); await shot(page, 'palms-30pct', null, true); }
    if (only.has('lamps')) { await page.evaluate(() => { window.__night = 0.72; }); await look(page, area.x - 4, area.y + 9, 0.3); await settle(page, 1500); await shot(page, 'lamps-dusk-30pct', null, true); await page.evaluate(() => { window.__night = 0; }); }
    await s.ctx.close();
  }
  if (only.has('variety')) {
    const s = await open(), { page, area } = s;
    {
      // the nine shapes, each its own card (placed by its key)
      const keys = await page.evaluate(() => [...document.querySelectorAll('[data-card^="prop-kit-boulder"]')].length);
      const log = [];
      for (const [i, size] of ['s', 'm', 'l'].entries()) for (const [j, v] of ['a', 'b', 'c'].entries()) log.push(await place(s, `kit-boulder-${size}${v === 'a' ? '' : `-${v}`}`, B[size][j], area.x - 6 + j * 3.2, area.y - 10 + i * 3.2));
      // a Rocks, mixed drag, then the mixed shrubs, mums and palms (each a press, a drag and a let-go of the tool)
      const drag = (key, x0, y0, x1, y1) => page.evaluate(([key, x0, y0, x1, y1, W, H]) => {
        const g = window.__game; g.setTool('props'); g.decor.setView('course'); g.decor.pick(key); g.camEase = null; g.lookAt(x0, y0, 0.3);
        // the tool's own events: the cursor stays in the middle while the camera walks the drag
        g.decor.move(W / 2, H / 2); g.decor.down(W / 2, H / 2);
        for (let k = 1; k <= 24; k++) { g.lookAt(x0 + (x1 - x0) * k / 24, y0 + (y1 - y0) * k / 24, 0.3); g.decor.move(W / 2, H / 2); }
        g.decor.up(); const n = g.props.size; g.decor.pick(null); g.setTool('select'); return n;
      }, [key, x0, y0, x1, y1, s.W, s.H]);
      console.log('variety', JSON.stringify(log.filter(p => p.none)), keys);
      console.log('mixed rocks', await drag('kit-rocks-mixed', area.x + 5, area.y - 10, area.x + 13, area.y - 4));
      console.log('mixed shrubs', await drag('kit-shrubs-mixed', area.x - 6, area.y + 1, area.x + 4, area.y + 1));
      console.log('mixed mums', await drag('kit-mums-mixed', area.x - 6, area.y + 2.6, area.x + 4, area.y + 2.6));
      console.log('mixed palms', await drag('kit-palms-mixed', area.x - 2, area.y + 9, area.x + 8, area.y + 1));
      await hideUi(page);
      await look(page, area.x + 2, area.y - 6, 0.3); await settle(page, 1800); await shot(page, 'variety-boulders-30pct', null, true);
      await look(page, area.x + 1, area.y + 4, 0.3); await settle(page, 1200); await shot(page, 'variety-mixed-plants-30pct', null, true);
    }
    await s.ctx.close();
  }
  if (only.has('flip')) {
    const s = await open(), { page, area } = s;
    {
      // one rock as placed, one flipped (R twice: the next look is the mirror), one at 80% and one at 120% ([ and ]), all with the tool's keys
      const put = (presses, x, y) => page.evaluate(([presses, x, y, W, H]) => {
        const g = window.__game, key = e => ({ key: e, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, preventDefault() {} });
        g.setTool('props'); g.decor.setView('course'); g.decor.pick('kit-boulder-l-b'); g.camEase = null; g.lookAt(x, y, 0.3);
        for (const p of presses) g.decor.key(key(p));
        g.decor.move(W / 2, H / 2); const gh = g.decor.ghost, label = gh?.label; g.decor.down(W / 2, H / 2); g.decor.up();
        g.decor.pick(null); g.setTool('select'); return label;
      }, [presses, x, y, s.W, s.H]);
      // in a row across the screen (x up, y down: the screen's right), 2.4 tiles apart
      const at = k => [area.x + k * 2.4, area.y - k * 2.4];
      console.log('as placed', await put([], ...at(-1.5)));
      console.log('flipped', await put(['r'], ...at(-0.5)));
      console.log('80%', await put(['[', '[', '[', '['], ...at(0.5)));
      console.log('120% flipped', await put([']', ']', ']', ']', 'r'], ...at(1.5)));
      // a large rock in hand at 110%, below the row: the size in the cursor label (the game draws it at the mouse)
      await page.addStyleTag({ content: '* { visibility: hidden !important } canvas { visibility: visible !important }' });
      await page.evaluate(([x, y]) => { const g = window.__game, key = e => ({ key: e, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, preventDefault() {} }); g.setTool('props'); g.decor.setView('course'); g.decor.pick('kit-boulder-l'); g.camEase = null; g.lookAt(x, y, 0.3); g.decor.key(key(']')); g.decor.key(key(']')); }, [area.x, area.y]);
      await page.mouse.move(s.W / 2, s.H / 2 + 110); await page.waitForTimeout(300); await page.mouse.move(s.W / 2 + 1, s.H / 2 + 112);
      await settle(page, 1500); await shot(page, 'rock-flipped-scaled-30pct', null, true);
    }
    await s.ctx.close();
  }
  if (only.has('panel')) {
    const s = await open(1920, 1080), { page } = s;
    // Decoration > Props: the panel's Stone and Plants cards
    await page.evaluate(() => { const g = window.__game; g.setTool('props'); g.decor.setView('course'); g.emit(); });
    await page.waitForTimeout(1500);
    for (const grp of ['stone', 'plants']) {
      await page.evaluate(grp => { const g = window.__game; g.decor.focus = grp; g.emit(); }, grp); await page.waitForTimeout(2500);
      // the whole group: the panel's scroller stepped down a screen at a time and the pieces stacked
      const scroller = await page.evaluateHandle(() => { let el = document.querySelector('[data-panel="props"]'); while (el && el.scrollHeight <= el.clientHeight + 2) el = el.parentElement; if (el) el.scrollTop = 0; return el; });
      const box = await page.locator('[data-panel="props"]').boundingBox(), parts = [];
      if (!box) continue;
      for (let k = 0; k < 6; k++) {
        await page.waitForTimeout(900);
        const view = await scroller.evaluate(el => { if (!el) return null; const r = el.getBoundingClientRect(); return { y: Math.max(0, r.y), h: Math.min(r.height, innerHeight - Math.max(0, r.y)) }; });
        const clip = { x: Math.max(0, box.x - 8), y: view ? view.y : 0, width: Math.min(1920 - box.x + 8, box.width + 16), height: view ? view.h : 1080 };
        parts.push({ png: await page.screenshot({ type: 'png', clip }), clip });
        const step = await scroller.evaluate(el => { if (!el) return 0; const b = el.scrollTop; el.scrollTop += el.clientHeight - 40; return el.scrollTop - b; });
        if (!step) break; parts[parts.length - 1].next = step;
      }
      // stack: each next piece starts where the scroll moved it (its first clientHeight - step rows repeat the last piece's bottom)
      const comp = []; let top = 0, height = 0;
      for (const [i, q] of parts.entries()) { const skip = i ? q.clip.height - parts[i - 1].next : 0; const img = skip > 0 ? await sharp(q.png).extract({ left: 0, top: skip, width: q.clip.width, height: q.clip.height - skip }).toBuffer() : q.png; comp.push({ input: img, left: 0, top }); const h = q.clip.height - Math.max(0, skip); top += h; height = top; }
      const file = join(out, `${tag}-panel-${grp}-1920.jpg`);
      await sharp({ create: { width: parts[0].clip.width, height, channels: 4, background: '#101418' } }).composite(comp).jpeg({ quality: 92 }).toFile(file); console.log(file);
    }
    // the plant brush (Facilities > Plants): Bushes and Palms
    for (const kind of ['bushes', 'palms']) {
      await page.evaluate(kind => { const g = window.__game; g.setTool('paint'); g.paint.setPlant(kind); g.emit(); }, kind); await page.waitForTimeout(2500);
      const box = await page.evaluate(() => { const g = document.querySelector('div.grid.max-h-72'), r = g?.getBoundingClientRect(); return r ? { x: r.x, y: r.y - 150, width: r.width, height: r.height + 190 } : null; });
      if (box) await shot(page, `plant-brush-${kind}-1920`, { x: Math.max(0, box.x - 8), y: Math.max(0, box.y - 8), width: Math.min(1920 - box.x + 8, box.width + 16), height: Math.min(1080 - Math.max(0, box.y - 8), box.height + 16) });
    }
    await s.ctx.close();
  }
} finally { await browser.close(); }
