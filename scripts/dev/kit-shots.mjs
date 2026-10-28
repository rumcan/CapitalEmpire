// T231 (#671): in-game shots of the concept kit (docs/art/CONCEPT-LOOK.md steps 5 and 8). On the old start (?start=town):
//   pond     a course pond given the Stone pond edge (its boulders round the shore, lily pads on its water) and a fountain jet, at 30%
//   town     a Fountain pond placed in the town with the Props tool (round water, its stones, lily pads and the jet), at 30%
//   yards    house lots' front yards with the kit (clipped hedges, shrubs, mums) at 30%
//   practice the practice area dressed with boulders, palms and the practice green lamp posts, at dusk (the lamps lit), 30%
//   menus    the Facilities flyout's Plants (the Palms brush) and the Props panel's Plants, Water, Stone and Furniture cards
//   sheet    the pond, the yards and the town's pond beside the owner's concept picture (docs/art/concept/maple-falls-concept.webp), from the
//            shots of the run or those already in --out
//   node scripts/dev/kit-shots.mjs --base http://127.0.0.1:5186/ --out E:/ClaudeTemp/T231 [--only pond,town,yards,practice,menus,sheet] [--seed 1]
// Needs a dev server (vite) on --base. One headless Edge, closed when done; a fresh profile, so each start is a new game.
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://127.0.0.1:5186/'), out = opt('out', 'output/kit-shots'), seed = opt('seed', '1');
const only = new Set(opt('only', 'pond,town,yards,practice,menus,sheet').split(','));
const W = 1280, H = 800;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
/** wait until no chunk bake is in flight for a second (at most 60 s) */
const settle = async (page, ms = 900) => {
  await page.waitForTimeout(ms);
  await page.evaluate(() => { window.__calm = 0; });
  await page.waitForFunction(() => { const g = window.__game; window.__calm = g.ground.busy === 0 ? window.__calm + 1 : 0; return window.__calm > 20; }, null, { timeout: 60000, polling: 50 }).catch(() => console.log('  (settle timed out)'));
  await page.waitForTimeout(400);
};
const shot = async (page, name, clip) => {
  const file = join(out, `${name}.jpg`);
  await sharp(await page.screenshot({ type: 'png', ...(clip ? { clip } : {}) })).jpeg({ quality: 90, mozjpeg: true }).toFile(file);
  console.log(file); return file;
};
const hideUi = page => page.addStyleTag({ content: '* { visibility: hidden !important } canvas { visibility: visible !important }' });
const look = (page, x, y, z) => page.evaluate(([x, y, z]) => { const g = window.__game; g.camEase = null; g.lookAt(x, y, z); }, [x, y, z]);
/** a fresh old start, loaded, paused, broad day, no baking ahead */
const open = async (q = `?start=town&seed=${seed}`) => {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  page.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 200)); });
  await page.goto(`${base}${q}`);
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 240000 });
  await page.evaluate(() => { const g = window.__game; g.prebake = () => {}; g.setSpeed(0); g.setShowGrid?.(false); window.__night = 0; g.nightAmount = () => window.__night; });
  return { page, ctx };
};
/** the course's ponds: each still-water body of the course grid (its cell count and middle), biggest first */
const ponds = page => page.evaluate(() => {
  const g = window.__game, cg = g.courseGrid; if (!cg) return [];
  const seen = new Uint8Array(cg.w * cg.h), out = [];
  for (let i = 0; i < cg.surf.length; i++) {
    if (cg.surf[i] !== 3 || seen[i]) continue;
    let n = 0, sx = 0, sy = 0; const st = [i]; seen[i] = 1;
    while (st.length) { const k = st.pop(), cx = k % cg.w, cy = (k - cx) / cg.w; n++; sx += cx; sy += cy; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const x = cx + dx, y = cy + dy; if (x < 0 || y < 0 || x >= cg.w || y >= cg.h) continue; const q = y * cg.w + x; if (cg.surf[q] === 3 && !seen[q]) { seen[q] = 1; st.push(q); } } }
    out.push({ n, x: cg.x0 + (sx / n + 0.5) * 0.5, y: cg.y0 + (sy / n + 0.5) * 0.5, at: { x: cg.x0 + (i % cg.w + 0.5) * 0.5, y: cg.y0 + (Math.floor(i / cg.w) + 0.5) * 0.5 } });
  }
  return out.sort((a, b) => b.n - a.n);
});
/** the props a kit id prefix has on the map */
const kitCount = page => page.evaluate(() => { const g = window.__game, c = g.decor.ctx, m = {}; for (const p of g.props) { const id = c.idOf(p); if (id.startsWith('kit:')) { const k = id.replace(/-[a-z0-9]+$/, ''); m[k] = (m[k] ?? 0) + 1; } } return m; });
/** the Props tool with an item in hand at a tile (the camera centred on it, the cursor in the middle of the canvas); returns the ghost */
const hand = (page, key, where, x, y) => page.evaluate(([key, where, x, y, W, H]) => {
  const g = window.__game; g.setTool('props'); g.decor.setView(where); g.decor.pick(key); g.camEase = null; g.lookAt(x, y, 0.3);
  g.decor.move(W / 2, H / 2); const gh = g.decor.ghost; return gh ? { why: gh.why, label: gh.label, x: gh.x, y: gh.y, ghosts: g.decor.ghosts.length } : null;
}, [key, where, x, y, W, H]);
const click = page => page.evaluate(([W, H]) => { const g = window.__game; g.decor.down(W / 2, H / 2); g.decor.up(); const r = { money: Math.round(g.money), marks: g.golf?.ponds ?? [] }; g.decor.pick(null); g.setTool('select'); return r; }, [W, H]);
const files = {};
try {
  if (only.has('probe-range')) {
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 }), page = await ctx.newPage();
    await page.goto(`${base}?start=range&seed=${seed}`);
    await page.waitForFunction(() => window.__game?.ready, null, { timeout: 240000 });
    console.log(JSON.stringify(await page.evaluate(() => { const g = window.__game, sc = g.range.scene; return { practice: sc?.practice ? { n: sc.practice.pts.length, x: sc.practice.pts[0], y: sc.practice.pts[1] } : null, shop: sc?.pieces.find(p => p.key === 'shop'), facilities: g.practice ? Object.keys(g.practice) : null, club: g.golf.clubhouse }; })));
    await ctx.close();
  }
  if (only.has('probe')) {
    const { page, ctx } = await open();
    console.log('ponds', JSON.stringify((await ponds(page)).slice(0, 8)));
    console.log('kit', JSON.stringify(await kitCount(page)));
    const town = await page.evaluate(() => window.__game.golf.town);
    console.log('town', JSON.stringify(town));
    await look(page, town.x, town.y, 0.3); await settle(page, 2500);
    console.log('near town', JSON.stringify(await page.evaluate(([x, y]) => { const g = window.__game, c = g.decor.ctx, near = [...g.props].filter(p => Math.abs(p.x - x) < 40 && Math.abs(p.y - y) < 40), ids = {}; for (const p of near) { const k = (p.auto ?? '-').split(':')[0] + ' ' + c.idOf(p).split(':')[0]; ids[k] = (ids[k] ?? 0) + 1; } return { n: near.length, lots: g.traffic.lots.size, ids }; }, [town.x, town.y])));
    await shot(page, 'probe-town');
    await ctx.close();
  }
  if (only.has('pond')) {
    const { page, ctx } = await open();
    const p = (await ponds(page))[0]; console.log('pond', JSON.stringify(p));
    await hideUi(page);
    await look(page, p.x, p.y, 0.3); await settle(page); files.pondBefore = await shot(page, 'pond-natural-30pct');
    // the Stone pond edge on it (the Props tool, as a player does), then a jet in its middle
    console.log('edge ghost', JSON.stringify(await hand(page, 'kit-pond-stones', 'course', p.at.x, p.at.y)));
    console.log('edge click', JSON.stringify(await click(page)));
    // the jet: the first spot from the pond's middle outward where the tool takes it (all of it on water)
    const spots = []; for (let r = 0; r <= 8; r += 0.5) for (let a = 0; a < 16; a++) spots.push({ x: p.x + Math.cos(a * Math.PI / 8) * r, y: p.y + Math.sin(a * Math.PI / 8) * r });
    let jetAt = null;
    for (const s of spots) { const gh = await hand(page, 'kit-fountain', 'course', s.x, s.y); if (gh && !gh.why) { jetAt = s; console.log('jet', JSON.stringify(gh), JSON.stringify(await click(page))); break; } }
    if (!jetAt) console.log('  (no spot for the jet)');
    await page.waitForTimeout(800); // the edges are laid within 15 frames
    files.pondAt = { x: p.x, y: p.y };
    await look(page, p.x, p.y, 0.3); await settle(page, 1500); files.pond = await shot(page, 'pond-stones-lilies-jet-30pct');
    await look(page, p.x, p.y, 0.15); await settle(page, 1500); files.pond15 = await shot(page, 'pond-stones-15pct');
    console.log('kit', JSON.stringify(await kitCount(page)));
    await ctx.close();
  }
  if (only.has('town') || only.has('yards')) {
    const { page, ctx } = await open('?fixture=range20&stamp=0'); // the range start's grown town (year 20): its houses and yards
    const town = await page.evaluate(() => window.__game.golf.town);
    await hideUi(page);
    if (only.has('yards')) {
      // the town's house lots are composed near the view: look at the town, wait, then at the yard with the most of the kit round it
      await look(page, town.x, town.y, 0.3); await settle(page, 2500);
      const spot = await page.evaluate(() => {
        const g = window.__game, c = g.decor.ctx, kit = [...g.props].filter(p => /^kit:(hedge|shrub|flowers)/.test(c.idOf(p)));
        let best = null, most = 0;
        for (const p of kit) { const n = kit.filter(q => Math.abs(q.x - p.x) < 14 && Math.abs(q.y - p.y) < 9).length; if (n > most) { most = n; best = { x: p.x, y: p.y }; } }
        return { best, most, all: kit.length };
      });
      console.log('yards', JSON.stringify(spot));
      if (spot.best) { await look(page, spot.best.x + 2, spot.best.y + 1, 0.3); await settle(page, 1500); files.yards = await shot(page, 'yards-hedges-shrubs-mums-30pct'); await look(page, spot.best.x + 2, spot.best.y + 1, 0.15); await settle(page, 1500); await shot(page, 'yards-15pct'); }
    }
    if (only.has('town')) {
      // a Fountain pond in the town: the first open grass from the town's middle outward where the Props tool takes it
      await page.addStyleTag({ content: '* { visibility: visible !important }' });
      const at = await page.evaluate(([cx, cy, W, H]) => {
        const g = window.__game; g.setTool('props'); g.decor.setView('town'); g.decor.pick('kit-pond');
        for (let r = 4; r <= 160; r += 1.5) for (let a = 0; a < 36; a++) {
          const x = Math.round((cx + Math.cos(a * Math.PI / 18) * r) * 2) / 2, y = Math.round((cy + Math.sin(a * Math.PI / 18) * r) * 2) / 2;
          g.camEase = null; g.lookAt(x, y, 0.3); g.decor.move(W / 2, H / 2); const gh = g.decor.ghost;
          if (gh && !gh.why) return { x, y, label: gh.label, ghosts: g.decor.ghosts.length };
        }
        return null;
      }, [town.x, town.y, W, H]);
      console.log('town pond', JSON.stringify(at));
      if (at) {
        await settle(page, 1500); files.townGhost = await shot(page, 'town-fountain-pond-ghost-30pct');
        console.log('placed', JSON.stringify(await click(page)));
        await hideUi(page);
        await page.waitForTimeout(800); await look(page, at.x, at.y, 0.3); await settle(page, 1500); files.town = await shot(page, 'town-fountain-pond-30pct');
        console.log('kit', JSON.stringify(await kitCount(page)));
        // undo takes it all back (the water, the stones, the jet)
        console.log('undo', JSON.stringify(await page.evaluate(() => { const g = window.__game; g.paint.undo(); return { marks: g.golf.ponds ?? [] }; })));
        await page.waitForTimeout(800); console.log('kit after undo', JSON.stringify(await kitCount(page)));
      }
    }
    await ctx.close();
  }
  if (only.has('practice')) {
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 }), page = await ctx.newPage();
    page.on('pageerror', e => console.log('[pageerror]', e.message));
    await page.goto(`${base}?start=range&seed=${seed}`);
    await page.waitForFunction(() => window.__game?.ready, null, { timeout: 240000 });
    await page.evaluate(() => { const g = window.__game; g.prebake = () => {}; g.setSpeed(0); window.__night = 0; g.nightAmount = () => window.__night; g.traffic.spend('construction', -500000); });
    const area = await page.evaluate(() => { const p = window.__game.range.scene.practice.pts; let x = 0, y = 0; for (let k = 0; k < p.length; k += 2) { x += p[k]; y += p[k + 1]; } return { x: x / (p.length / 2), y: y / (p.length / 2), pts: p }; });
    console.log('practice area', JSON.stringify(area));
    // a putting green in the practice area (Facilities > Practice), then the kit round it
    const green = await page.evaluate(([x, y, W, H]) => { const g = window.__game; g.setTool('practice'); g.practice.arm('putting'); g.camEase = null; g.lookAt(x, y, 0.3); g.practice.move(W / 2, H / 2); const gh = g.practice.ghost; const why = gh?.why ?? gh?.label; g.practice.click(W / 2, H / 2); g.setTool('select'); return why; }, [area.x, area.y, W, H]);
    console.log('green', green);
    const put = async (key, dx, dy) => {
      for (let r = 0; r <= 6; r += 0.5) for (let a = 0; a < 8; a++) {
        const x = area.x + dx + Math.cos(a * Math.PI / 4) * r, y = area.y + dy + Math.sin(a * Math.PI / 4) * r, gh = await hand(page, key, 'course', x, y);
        if (gh && !gh.why) { await click(page); return { key, x: gh.x, y: gh.y }; }
      }
      return { key, none: true };
    };
    const placed = [];
    for (const [key, dx, dy, turns] of [['kit-boulder-l', -7, -2, 0], ['kit-boulder-m', -6, -5, 1], ['kit-boulder-s', -4, -6, 2], ['kit-boulder-m', 6, 5, 2], ['kit-boulder-s', 7, 4, 1], ['kit-palm-canary', -8, 1, 2], ['kit-palm-canary', -6, 4, 1], ['kit-palm-windmill', 7, -4, 1], ['kit-palm-fan', -3, 6, 1], ['kit-palm-fan', 4, 6, 2], ['kit-lamp', -5, -1, 0], ['kit-lamp-twin', 5, 2, 0], ['kit-lamp', 3, -4, 0], ['kit-shrub', 1, 6, 0], ['kit-mums', 2, 7, 0], ['kit-mums', 0, 7, 3]]) {
      if (turns) await page.evaluate(([key, n]) => { const g = window.__game; g.setTool('props'); g.decor.setView('course'); g.decor.pick(key); for (let i = 0; i < n; i++) g.decor.turn(); }, [key, turns]);
      placed.push(turns ? await (async () => { for (let r = 0; r <= 6; r += 0.5) for (let a = 0; a < 8; a++) { const x = area.x + dx + Math.cos(a * Math.PI / 4) * r, y = area.y + dy + Math.sin(a * Math.PI / 4) * r; const gh = await page.evaluate(([x, y, W, H]) => { const g = window.__game; g.camEase = null; g.lookAt(x, y, 0.3); g.decor.move(W / 2, H / 2); const q = g.decor.ghost; return q ? { why: q.why, x: q.x, y: q.y } : null; }, [x, y, W, H]); if (gh && !gh.why) { await click(page); return { key, x: gh.x, y: gh.y, turned: turns }; } } return { key, none: true }; })() : await put(key, dx, dy));
    }
    console.log('placed', JSON.stringify(placed));
    await hideUi(page);
    await look(page, area.x, area.y, 0.3); await settle(page, 2000); files.practiceDay = await shot(page, 'practice-boulders-palms-lamps-30pct');
    await page.evaluate(() => { window.__night = 0.72; }); await settle(page, 1500); files.practice = await shot(page, 'practice-boulders-palms-lamps-dusk-30pct');
    await ctx.close();
  }
  if (only.has('menus')) {
    const { page, ctx } = await open();
    // Facilities > Plants (the brushes: Trees, Bushes, Flowers, Palms) and Decoration > Props > the groups
    await page.click('[data-rail="facilities"]'); await page.waitForTimeout(700);
    const row = async (level, text) => { const el = page.locator(`[data-flyout-col="${level}"] [role="menuitem"]`, { hasText: text }).first(); await el.hover(); await page.waitForTimeout(400); };
    await row(0, 'Plants'); files.menuPlants = await shot(page, 'menu-facilities-plants', { x: 0, y: 0, width: 760, height: 560 });
    // Plants > Palms: the plant brush's panel with the palms listed
    { const el = page.locator('[data-flyout-col="1"] [role="menuitem"]', { hasText: 'Palms' }).first(); await el.click(); await page.waitForTimeout(800); files.menuPalms = await shot(page, 'menu-plant-brush-palms'); }
    await page.click('[data-rail="facilities"]'); await page.waitForTimeout(700);
    await row(0, 'Decoration'); await row(1, 'Props'); files.menuProps = await shot(page, 'menu-facilities-decoration-props', { x: 0, y: 0, width: 900, height: 560 });
    { const el = page.locator('[data-flyout-col="2"] [role="menuitem"]', { hasText: 'All props' }).first(); await el.click(); await page.waitForTimeout(800); }
    // the Props panel: every group's cards (the kit's among them), a pond edge in hand
    await page.mouse.move(W - 10, H - 10);
    await page.evaluate(() => { const g = window.__game; g.decor.pick('kit-pond-stones'); g.emit(); });
    await page.waitForTimeout(600);
    const panel = await page.locator('[data-panel="props"]').boundingBox();
    console.log('panel', JSON.stringify(panel));
    if (panel) {
      const scroller = await page.evaluateHandle(() => { let el = document.querySelector('[data-panel="props"]'); while (el && el.scrollHeight <= el.clientHeight + 2) el = el.parentElement; return el; });
      const parts = [];
      for (let k = 0; k < 4; k++) {
        const clip = { x: Math.max(0, panel.x - 8), y: 0, width: Math.min(W - panel.x + 8, panel.width + 16), height: H };
        parts.push(await page.screenshot({ type: 'png', clip }));
        const more = await scroller.evaluate((el, k) => { if (!el) return false; const before = el.scrollTop; el.scrollTop += el.clientHeight - 60; return el.scrollTop !== before; }, k);
        if (!more) break; await page.waitForTimeout(300);
      }
      const metas = await Promise.all(parts.map(b => sharp(b).metadata())), width = metas[0].width, height = metas.reduce((s, m) => s + m.height, 0);
      let top = 0; const comp = parts.map((b, i) => { const o = { input: b, left: 0, top }; top += metas[i].height; return o; });
      await sharp({ create: { width, height, channels: 4, background: '#101418' } }).composite(comp).jpeg({ quality: 90 }).toFile(join(out, 'menu-props-panel.jpg'));
      console.log(join(out, 'menu-props-panel.jpg'));
    }
    // the Paint tool's plant brushes with Palms picked (its pictures listed)
    // (the plant brush's panel was taken above)

    await ctx.close();
  }
  if (only.has('sheet')) {
    // the pond and a yard beside the concept
    const concept = await sharp('docs/art/concept/maple-falls-concept.webp').resize(W, H, { fit: 'cover' }).png().toBuffer();
    // (the shots of this run, else the ones already in --out: a sheet alone is made from them)
    const have = (f, name) => f ?? (existsSync(join(out, `${name}.jpg`)) ? join(out, `${name}.jpg`) : null);
    files.pond = have(files.pond, 'pond-stones-lilies-jet-30pct'); files.yards = have(files.yards, 'yards-hedges-shrubs-mums-30pct'); files.town = have(files.town, 'town-fountain-pond-30pct');
    const tiles = [files.pond, files.yards, files.town].filter(Boolean);
    const comp = [{ input: concept, left: 0, top: 0 }, ...tiles.map((f, i) => ({ input: f, left: W * ((i + 1) % 2), top: H * Math.floor((i + 1) / 2) }))];
    const rows = Math.ceil((tiles.length + 1) / 2);
    const label = (t, x, y) => ({ input: Buffer.from(`<svg width="${W}" height="40"><rect width="100%" height="40" fill="rgba(0,0,0,0.55)"/><text x="16" y="27" font-family="sans-serif" font-size="20" fill="#f1e3b5">${t}</text></svg>`), left: x, top: y });
    comp.push(label('The concept (docs/art/concept/maple-falls-concept.webp)', 0, 0));
    if (files.pond) comp.push(label('T231: a course pond, Stone pond edge, lily pads, fountain jet (30%)', W, 0));
    if (files.yards) comp.push(label('T231: house yards, clipped hedges, shrubs, mums (30%)', 0, H));
    if (files.town) comp.push(label('T231: a Fountain pond in the town (30%)', W, H));
    await sharp({ create: { width: W * 2, height: H * rows, channels: 3, background: '#000' } }).composite(comp).jpeg({ quality: 88 }).toFile(join(out, 'sheet-beside-concept.jpg'));
    console.log(join(out, 'sheet-beside-concept.jpg'));
  }
} finally { await browser.close(); }
