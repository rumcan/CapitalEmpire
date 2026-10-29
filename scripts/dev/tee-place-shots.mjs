// T268 (#809): in-game shots of each tee set placed by hand on the old nine (?start=town):
// - place-each-colour: a 2 x 2 sheet, each colour's ghost at the pointer from the hole card's Place (and the white's Move, turned and sized);
// - tees-placed-30: the four placed boxes and their markers at the closest zoom (30%);
// - refused-spot: the ghost over another hole, red and hatched, with the reason;
// - drag-move: a tee box dragged on the map with the card open (before and after);
// - scorecard-after-move: the Course stats scorecard's yardages and the card's tee rows before and after the blue is moved back.
//   node scripts/dev/tee-place-shots.mjs --base http://127.0.0.1:5187/ --out E:/ClaudeTemp/T268
// Needs a dev server (vite) on --base. One headless Edge, closed when done. Saves are not written (non-GET requests are answered locally).
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://127.0.0.1:5187/'), out = opt('out', 'output/tee-place-shots');
const W = 1366, H = 768;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const save = async (buf, name) => { const file = join(out, `${name}.jpg`); await sharp(buf).jpeg({ quality: 86, mozjpeg: true }).toFile(file); console.log(file); return file; };
const cap = (t, w) => Buffer.from(`<svg width="${w}" height="36"><rect width="100%" height="100%" fill="#0b1220"/><text x="14" y="25" font-family="Segoe UI, sans-serif" font-size="20" font-weight="700" fill="#ffd166">${t.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text></svg>`);
/** a png with a caption bar on top */
const captioned = async (png, t) => { const m = await sharp(png).metadata(); return sharp({ create: { width: m.width, height: m.height + 36, channels: 3, background: '#0b1220' } }).composite([{ input: cap(t, m.width), top: 0, left: 0 }, { input: png, top: 36, left: 0 }]).png().toBuffer(); };
/** captioned pngs in a grid of cols */
async function sheet(items, cols, name, width = 2200) {
  const cs = await Promise.all(items.map(([p, t]) => captioned(p, t))), m = await sharp(cs[0]).metadata(), rows = Math.ceil(cs.length / cols);
  const img = await sharp({ create: { width: m.width * cols + 8 * (cols - 1), height: m.height * rows + 8 * (rows - 1), channels: 3, background: '#000' } })
    .composite(cs.map((c, i) => ({ input: c, left: (i % cols) * (m.width + 8), top: Math.floor(i / cols) * (m.height + 8) }))).png().toBuffer();
  return save(await sharp(img).resize({ width }).png().toBuffer(), name);
}
/** captioned pngs of any sizes side by side (each padded to the tallest), scaled up 1.5x so the small text reads */
async function strip(items, name) {
  const cs = await Promise.all(items.map(async ([p, t]) => { const m = await sharp(p).metadata(); return captioned(await sharp(p).resize({ width: Math.round(m.width * 1.5) }).png().toBuffer(), t); }));
  const ms = await Promise.all(cs.map(c => sharp(c).metadata())), h = Math.max(...ms.map(m => m.height)), w = ms.reduce((a, m) => a + m.width, 0) + 8 * (cs.length - 1);
  let x = 0; const comp = cs.map((c, i) => { const o = { input: c, left: x, top: 0 }; x += ms[i].width + 8; return o; });
  return save(await sharp({ create: { width: w, height: h, channels: 3, background: '#0b1220' } }).composite(comp).png().toBuffer(), name);
}
/** wait until no chunk bake is in flight for a moment */
const settle = async (page, ms = 900) => {
  await page.waitForTimeout(ms);
  await page.evaluate(() => { window.__calm = 0; });
  await page.waitForFunction(() => { const g = window.__game; window.__calm = g.ground.busy === 0 ? window.__calm + 1 : 0; return window.__calm > 20; }, null, { timeout: 60000, polling: 50 }).catch(() => console.log('  (settle timed out)'));
  await page.waitForTimeout(300);
};
async function open(url) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => { try { localStorage.clear(); } catch { /* none */ } });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  page.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 300)); });
  await page.route('**/*', r => { const x = r.request(); return x.method() !== 'GET' && x.method() !== 'HEAD' ? r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }) : r.continue(); });
  await page.goto(`${base}${url}`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 300000 });
  await page.evaluate(() => { const g = window.__game; g.setSpeed(0); g.closeWelcome?.(false); g.emit(); });
  await page.addStyleTag({ content: 'html.noui * { visibility: hidden !important } html.noui canvas { visibility: visible !important }' });
  await settle(page, 1500);
  return { ctx, page };
}
const look = (page, x, y, z) => page.evaluate(([x, y, z]) => { const g = window.__game; g.camEase = null; g.lookAt(x, y, z); g.emit(); }, [x, y, z]);
/** the css px of tile (x, y) */
const px = (page, x, y) => page.evaluate(([x, y]) => { const g = window.__game, s = g.screen(x, y); return { x: s.x / g.dpr, y: s.y / g.dpr }; }, [x, y]);
const png = page => page.screenshot({ type: 'png' });
/** the pointer to tile (x, y) the way a player moves it */
const hover = async (page, t) => { const s = await px(page, t.x, t.y); await page.mouse.move(s.x - 30, s.y - 20); await page.mouse.move(s.x, s.y, { steps: 6 }); await sleep(250); return s; };
/** the first of the spots where the tee in hand's ghost can go (the ghost asked at each, the pointer left alone), else the first */
const freeSpot = async (page, cands) => { const r = await page.evaluate(cands => { const g = window.__game, h = g.hover, whys = []; let pick = null; for (const c of cands) { g.hover = c; const v = g.teeGhost(); whys.push(v ? v.why || 'ok' : 'none'); if (v && !v.why) { pick = c; break; } } g.hover = h; g.teeGhostMemo = null; return { pick, whys }; }, cands); console.log('  spots:', r.whys.join(' | ')); return r.pick ?? cands[0]; };
/** the camera on tile t at zoom z, t a little left of the middle (clear of the card) */
const frameAt = async (page, t, z) => { await look(page, t.x, t.y, z); await sleep(150); await page.evaluate(([W, H, z]) => { const g = window.__game, c = g.tileAt(W / 2 + 0.1 * W, H / 2 + 0.05 * H); g.camEase = null; g.lookAt(c.x, c.y, z); g.emit(); }, [W, H, z]); await sleep(400); };
const toast = page => page.evaluate(() => window.__game.toasts.slice(-1)[0]?.text);
const tees = (page, n) => page.evaluate(n => window.__game.golf.tees.filter(t => t.hole === n).map(t => `${t.kind}@${t.x.toFixed(1)},${t.y.toFixed(1)}`).join(' '), n);
/** hole 1 of the old nine taken back to the land and built again with New hole on its own line (the white tee alone) */
async function plannedHole(page) {
  const h = await page.evaluate(() => {
    const g = window.__game, gs = g.golf, n = 1, pin = gs.pins.find(p => p.hole === n), tee = gs.tees.find(t => t.hole === n && t.kind === 'back') ?? gs.tees.find(t => t.hole === n);
    return { n, pin: { x: pin.x, y: pin.y }, tee: { x: tee.x, y: tee.y } };
  });
  await page.evaluate(n => { const g = window.__game; g.deleteHole(n, false); g.removeGolfMarker(n, 'pin'); for (const k of ['back', 'middle', 'senior', 'forward']) g.removeGolfMarker(n, k); g.setTool('course'); g.paint.setPlan(n); g.emit(); }, h.n);
  await look(page, (h.tee.x + h.pin.x) / 2, (h.tee.y + h.pin.y) / 2, 0.07); await sleep(300);
  await page.evaluate(([W, H]) => { const g = window.__game, c = g.tileAt(W / 2 - 180, H / 2); g.camEase = null; g.lookAt(c.x, c.y, 0.07); g.emit(); }, [W, H]); await sleep(500);
  for (const p of [h.tee, h.pin]) {
    await page.evaluate(() => { window.__game.camEase = null; }); await sleep(300);
    const s = await px(page, p.x, p.y);
    await page.mouse.move(s.x - 20, s.y - 10); await page.mouse.move(s.x, s.y, { steps: 4 }); await sleep(200);
    await page.mouse.down(); await sleep(60); await page.mouse.up(); await sleep(900);
  }
  console.log('  built:', await page.evaluate(() => window.__game.paint.buildPlan()));
  await settle(page, 2500);
  await page.evaluate(() => { const g = window.__game; g.paint.setBrush(g.paint.brushKind); g.setTool('select'); g.emit(); });
  console.log('  tees:', await tees(page, h.n));
  return h;
}
/** the line of play's frame at the white tee: along (u) toward the pin and across (v), tiles */
const frameOf = (white, pin) => { const dx = pin.x - white.x, dy = pin.y - white.y, L = Math.hypot(dx, dy), u = { x: dx / L, y: dy / L }; return { u, v: { x: -u.y, y: u.x }, at: (a, c) => ({ x: white.x + u.x * a - u.y * c, y: white.y + u.y * a + u.x * c }) }; };

try {
  const { ctx, page } = await open(`?start=town&seed=${opt('seed', '7')}`);
  const h = await plannedHole(page);
  const white = await page.evaluate(n => { const t = window.__game.golf.tees.find(q => q.hole === n && q.kind === 'middle'); return { x: t.x, y: t.y }; }, h.n);
  const pin = await page.evaluate(n => { const p = window.__game.golf.pins.find(q => q.hole === n); return { x: p.x, y: p.y }; }, h.n), F = frameOf(white, pin);
  // the card open, the camera on the tees a little left of the card
  await page.evaluate(n => { const g = window.__game; g.setTool('select'); g.openHoleCard(n); g.emit(); }, h.n);
  const mid = F.at(12, 0);
  const Z = 0.24;
  await look(page, mid.x, mid.y, Z); await sleep(200);
  await page.evaluate(([W, H, Z]) => { const g = window.__game, c = g.tileAt(W / 2 + 0.13 * W, H / 2); g.camEase = null; g.lookAt(c.x, c.y, Z); g.emit(); }, [W, H, Z]);
  await settle(page, 1500);
  // each colour: its Place (the white: Move, turned a step and a size up), the ghost at the spot, then the click lays it
  // (hole 9's green lies just behind this tee: the blue goes beside the white, the first free spot from 16 tiles back)
  const blues = [[-16, 3], [-12, 9], [-8, 11], [-4, 12], [0, 12], [-6, -12], [-2, -13]].map(([a, c]) => F.at(a, c));
  const spots = { back: null, senior: F.at(14, -4), forward: F.at(26, 3), middle: F.at(2, -9) }, shots = [];
  for (const k of ['back', 'senior', 'forward', 'middle']) {
    await page.click(`[data-place-tee="${k}"]`); await sleep(200);
    if (!spots[k]) spots[k] = await freeSpot(page, blues);
    await frameAt(page, { x: (spots[k].x + white.x) / 2, y: (spots[k].y + white.y) / 2 }, Z); await settle(page, 600);
    await hover(page, spots[k]);
    if (k === 'middle') { await page.keyboard.press('r'); await page.keyboard.press(']'); await page.keyboard.press(']'); await sleep(200); }
    const gh = await page.evaluate(() => { const g = window.__game, v = g.teeGhost(); return v && { why: v.why, m: v.m, par: v.par, cost: v.cost, s: v.s, cells: v.cells.length, m3: Math.round(v.m3) }; });
    console.log(`  ${k} ghost:`, JSON.stringify(gh));
    shots.push([await png(page), `${{ back: 'Blue', senior: 'Yellow', forward: 'Red', middle: 'White (Move, R and ] ])' }[k]}: ${gh?.why || `${gh?.m} m, par ${gh?.par}, $${gh?.cost}`}`]);
    await page.mouse.down(); await sleep(60); await page.mouse.up(); await settle(page, 1200);
    console.log(`  ${k} laid:`, await toast(page));
  }
  console.log('  tees:', await tees(page, h.n), JSON.stringify(await page.evaluate(n => Object.keys(window.__game.golf.teeBoxes ?? {}).filter(k => k.startsWith(n + ':')), h.n)));
  await sheet(shots, 2, 'place-each-colour');
  // the four boxes at 30%
  await page.evaluate(() => { window.__game.closeHoleCard(); window.__game.emit(); });
  const c4 = F.at(5, 0); await look(page, c4.x, c4.y, 0.3); await settle(page, 2000);
  await page.mouse.move(W - 20, H - 20); await page.evaluate(() => document.documentElement.classList.add('noui')); await sleep(400);
  await save(await png(page), 'tees-placed-30');
  await page.evaluate(() => document.documentElement.classList.remove('noui'));
  // a refused spot: the red's Move over another hole's cells
  await page.evaluate(n => { const g = window.__game; g.openHoleCard(n); g.emit(); }, h.n);
  const other = await page.evaluate(([n, x, y]) => {
    const g = window.__game, grid = g.courseGrid; let best = null, bd = Infinity;
    for (let i = 0; i < grid.surf.length; i += 3) { const hh = grid.hole[i]; if (!hh || hh === n || !grid.surf[i]) continue; const cx = i % grid.w, cy = (i - cx) / grid.w, X = grid.x0 + (cx + 0.5) * 0.5, Y = grid.y0 + (cy + 0.5) * 0.5, d = Math.hypot(X - x, Y - y); if (d < bd) { bd = d; best = { x: X, y: Y, hole: hh }; } }
    return best;
  }, [h.n, white.x, white.y]);
  console.log('  nearest other hole cell:', JSON.stringify(other));
  if (other) {
    const m = { x: (other.x + white.x) / 2, y: (other.y + white.y) / 2 };
    await look(page, m.x, m.y, 0.2); await sleep(200);
    await page.evaluate(([W, H]) => { const g = window.__game, c = g.tileAt(W / 2 + 0.12 * W, H / 2); g.camEase = null; g.lookAt(c.x, c.y, 0.2); g.emit(); }, [W, H]); await settle(page, 1200);
    await page.click('[data-place-tee="forward"]'); await sleep(200);
    await hover(page, other);
    console.log('  refused ghost:', JSON.stringify(await page.evaluate(() => window.__game.teeGhost()?.why)));
    await save(await png(page), 'refused-spot');
    await page.mouse.down(); await sleep(60); await page.mouse.up(); await sleep(300);
    console.log('  refused click toast:', await toast(page), '| still in hand:', await page.evaluate(() => !!window.__game.teePlace));
    await page.keyboard.press('Escape'); await sleep(200);
  }
  // a drag on the map: the yellow's box with the card open
  await look(page, mid.x, mid.y, Z); await sleep(200);
  await page.evaluate(([W, H, Z]) => { const g = window.__game, c = g.tileAt(W / 2 + 0.13 * W, H / 2); g.camEase = null; g.lookAt(c.x, c.y, Z); g.emit(); }, [W, H, Z]); await settle(page, 1200);
  const yb = await page.evaluate(n => window.__game.golf.teeBoxes[`${n}:senior`], h.n);
  await frameAt(page, yb, Z); await settle(page, 600);
  const from = await px(page, yb.x + 1, yb.y);
  await page.mouse.move(from.x, from.y); await sleep(150);
  const dragBefore = await png(page);
  await page.mouse.down(); await sleep(100);
  // (the box in hand: its first free spot a few tiles off, the press's offset kept)
  const dest = await freeSpot(page, [[0, 7], [0, -7], [5, 5], [-5, 5], [5, -5], [8, 0]].map(([a, c]) => ({ x: yb.x + 1 + F.u.x * a + F.v.x * c, y: yb.y + F.u.y * a + F.v.y * c })));
  const to = await px(page, dest.x, dest.y);
  for (let k = 1; k <= 12; k++) { await page.mouse.move(from.x + (to.x - from.x) * k / 12, from.y + (to.y - from.y) * k / 12); await sleep(20); }
  await sleep(250); const dragging = await png(page);
  await page.mouse.up(); await settle(page, 1200);
  console.log('  drag:', await toast(page), JSON.stringify(await page.evaluate(n => window.__game.golf.teeBoxes[`${n}:senior`], h.n)).slice(0, 80));
  await page.mouse.move(W / 2, H - 30); await sleep(300);
  await sheet([[dragBefore, 'The yellow tee box, the card open'], [dragging, 'Dragging it: the ghost follows'], [await png(page), 'Let go: laid there, the old ground back']], 3, 'drag-move', 2600);
  // the scorecard's yardages before and after a move
  await page.evaluate(() => { window.__game.closeHoleCard(); window.__game.emit(); });
  const chip = await page.$('[data-testid="season-chip"], [data-testid="founding-chip"]');
  if (chip) await chip.click(); await sleep(800);
  const statsBox = async () => { const el = await page.$('[data-testid="season-stats"]'); return el ? el.boundingBox() : null; };
  const yards = () => page.evaluate(() => { const v = window.__game.courseStatsView?.(); return JSON.stringify(v?.rows?.[0]?.sets?.map(s => `${s.kind}:${s.lengthM}`) ?? v?.rows?.[0]); });
  console.log('  scorecard before:', await yards());
  const sb = await statsBox(); console.log('  stats box:', JSON.stringify(sb));
  const clip = sb ? { x: Math.max(0, sb.x - 6), y: Math.max(0, sb.y - 6), width: Math.min(W - sb.x + 6, sb.width + 12), height: Math.min(H - sb.y + 6, sb.height + 12) } : { x: W - 520, y: 60, width: 520, height: 600 };
  const breakdown = async () => { const loc = page.locator('[data-testid="season-stats"] .max-h-56').locator('..'); await loc.scrollIntoViewIfNeeded(); await sleep(300); return loc.screenshot({ type: 'png' }); };
  const before = await breakdown();
  await page.evaluate(n => { const g = window.__game; g.openHoleCard(n); g.emit(); }, h.n);
  // (the blue has hole 9 just behind it: the red goes 30 m further up the line instead)
  await page.click('[data-place-tee="forward"]'); await sleep(200);
  const rb = await page.evaluate(n => window.__game.golf.teeBoxes[`${n}:forward`], h.n);
  const red2 = await freeSpot(page, [15, 13, 11, 9].flatMap(d => [{ x: rb.x + F.u.x * d, y: rb.y + F.u.y * d }, { x: rb.x + F.u.x * d + F.v.x * 3, y: rb.y + F.u.y * d + F.v.y * 3 }]));
  console.log('  red to:', JSON.stringify(red2), 'from', JSON.stringify({ x: rb.x, y: rb.y }));
  await frameAt(page, red2, 0.2); await settle(page, 600);
  await hover(page, red2); await page.mouse.down(); await sleep(60); await page.mouse.up(); await settle(page, 1200);
  console.log('  red moved:', await toast(page));
  const cardRows = await page.$('[data-testid="hole-tees"]'), cardShot = cardRows ? await cardRows.screenshot({ type: 'png' }) : null;
  await page.evaluate(() => { window.__game.closeHoleCard(); window.__game.emit(); }); await sleep(300);
  if (!(await statsBox())) { const c2 = await page.$('[data-testid="season-chip"], [data-testid="founding-chip"]'); if (c2) await c2.click(); await sleep(800); }
  console.log('  scorecard after:', await yards());
  const after = await breakdown();
  const items = [[before, 'Scorecard before'], [after, 'After the red is moved 30 m up the line']];
  if (cardShot) items.push([cardShot, "The card's tee rows after the move"]);
  await strip(items, 'scorecard-after-move');
  // undo from the card: Ctrl+Z takes the move back
  await page.evaluate(n => { const g = window.__game; g.openHoleCard(n); g.emit(); }, h.n); await page.mouse.move(W / 2, H / 2); await sleep(200);
  await page.keyboard.press('Control+z'); await sleep(500);
  console.log('  undo:', await toast(page), '|', await yards());
  // Edit Hole Layout: its Tee sets rows, the blue moved from there (the plan's handles stay; Ctrl+Z takes the tee back before any plan drag)
  await page.keyboard.press('Escape'); await page.evaluate(n => { const g = window.__game; g.closeHoleCard(); g.editHole(n); g.emit(); }, h.n); await sleep(1200);
  const sec = await page.$('[data-section="edit-tees"]'); console.log('  Edit Hole Layout tee rows:', !!sec);
  if (sec) {
    await sec.scrollIntoViewIfNeeded(); await sleep(200);
    await page.click('[data-section="edit-tees"] [data-place-tee="back"]'); await sleep(200);
    const bb = await page.evaluate(n => window.__game.golf.teeBoxes[`${n}:back`], h.n);
    const spot = await freeSpot(page, [[0, 6], [0, -6], [4, 6], [-3, 7], [6, 0], [3, -8]].map(([a, c]) => ({ x: bb.x + F.u.x * a + F.v.x * c, y: bb.y + F.u.y * a + F.v.y * c })));
    await frameAt(page, spot, Z); await settle(page, 600);
    await hover(page, spot);
    await save(await png(page), 'edit-layout-move');
    await page.mouse.down(); await sleep(60); await page.mouse.up(); await settle(page, 1000);
    console.log('  edit move:', await toast(page), '| still editing:', await page.evaluate(() => window.__game.paint.wizard.base?.hole ?? null), '| undo label:', await page.evaluate(() => window.__game.paint.topUndo));
    await page.keyboard.press('Control+z'); await sleep(500);
    console.log('  edit undo:', await toast(page), '| blue back:', JSON.stringify(await page.evaluate(n => { const t = window.__game.golf.tees.find(q => q.hole === n && q.kind === 'back'); return { x: t.x, y: t.y }; }, h.n)), 'was', JSON.stringify({ x: bb.x, y: bb.y }));
  }
  // the ghost's cost: a frame draws the cached box (drawTeeGhost); a new cell under the pointer works the box out again (teePlan)
  console.log('  ghost cost:', JSON.stringify(await page.evaluate(([n, x, y]) => {
    const g = window.__game, ctx = g.ov; g.placeTee(n, 'senior'); g.hover = { x, y }; g.ghostMouse = { mx: 400, my: 300 };
    g.teeGhost(); let t0 = performance.now(); for (let i = 0; i < 2000; i++) g.drawTeeGhost(ctx); const draw = (performance.now() - t0) / 2000;
    t0 = performance.now(); for (let i = 0; i < 300; i++) { g.hover = { x: x + (i % 20) * 0.5, y }; g.teeGhost(); } const cell = (performance.now() - t0) / 300;
    g.teePlace.moving = true; g.teeOldMemo = null; t0 = performance.now(); for (let i = 0; i < 300; i++) { g.hover = { x: x + (i % 20) * 0.5, y: y + 1 }; g.teeGhost(); } const moveCell = (performance.now() - t0) / 300;
    g.cancelTeePlace(); return { drawMsPerFrame: +draw.toFixed(4), newCellMs: +cell.toFixed(3), newCellMovingMs: +moveCell.toFixed(3) };
  }, [h.n, white.x + 20, white.y + 6])));
  await ctx.close();
} finally {
  await browser.close();
}
