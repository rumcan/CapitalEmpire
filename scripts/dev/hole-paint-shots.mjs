// T256 (#743): in-game shots of the property's paint and each hole's own paint and looks:
// - range-build: Range › Build (the gold row) painting the practice area, its panel and the cursor saying "Painting your property";
// - property-vs-hole: the same brush on your property and on a hole, side by side (the panel's and the cursor's words);
// - two-bunker-looks-30: two holes' bunkers in two sands at the closest zoom (30%);
// - looks-card: the My looks card saying what it edits ("Bunkers on hole n");
// - delete-choice: the hole card's Delete, the two choices;
// - my-holes: a hole saved to My holes, its ghost from New hole › From My holes, and the hole placed again.
//   node scripts/dev/hole-paint-shots.mjs --base http://127.0.0.1:5187/ --out E:/ClaudeTemp/T256 [--only range,holes]
// Needs a dev server (vite) on --base. One headless Edge, closed when done. Saves are not written (non-GET requests are answered locally).
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://127.0.0.1:5187/'), out = opt('out', 'output/hole-paint-shots'), only = opt('only', 'range,holes').split(',');
const W = 1366, H = 768;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const save = async (buf, name) => { const file = join(out, `${name}.jpg`); await sharp(buf).jpeg({ quality: 86, mozjpeg: true }).toFile(file); console.log(file); return file; };
/** two pngs side by side, each with a caption bar */
async function pair(a, b, ca, cb, name) {
  const cap = t => Buffer.from(`<svg width="${W}" height="36"><rect width="100%" height="100%" fill="#0b1220"/><text x="14" y="25" font-family="Segoe UI, sans-serif" font-size="20" font-weight="700" fill="#ffd166">${t}</text></svg>`);
  const col = async (png, t) => sharp({ create: { width: W, height: H + 36, channels: 3, background: '#0b1220' } }).composite([{ input: cap(t), top: 0, left: 0 }, { input: png, top: 36, left: 0 }]).png().toBuffer();
  const [x, y] = [await col(a, ca), await col(b, cb)];
  const img = await sharp({ create: { width: W * 2 + 8, height: H + 36, channels: 3, background: '#000' } }).composite([{ input: x, top: 0, left: 0 }, { input: y, top: 0, left: W + 8 }]).png().toBuffer();
  return save(await sharp(img).resize({ width: 2200 }).png().toBuffer(), name);
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
/** a drag on the map from tile a to tile b (the real pointer: the engine's own path) */
async function drag(page, a, b, steps = 12) {
  const p = await px(page, a.x, a.y), q = await px(page, b.x, b.y);
  await page.mouse.move(p.x, p.y); await page.mouse.down();
  for (let k = 1; k <= steps; k++) await page.mouse.move(p.x + (q.x - p.x) * k / steps, p.y + (q.y - p.y) * k / steps);
  await page.mouse.up();
}
/** the rail group's flyout, then each column's row by key */
async function pick(page, group, ...rows) {
  await page.keyboard.press('Escape'); await sleep(150);
  await page.click(`[data-rail="${group}"]`); await sleep(350);
  for (const [level, key] of rows.entries()) { await page.locator(`[data-flyout-col="${level}"] [data-key="${key}"]`).first().click(); await sleep(350); }
}

try {
  if (only.includes('range')) {
    const { ctx, page } = await open('?start=range');
    // the Range flyout with its gold Build row
    await page.keyboard.press('Escape'); await page.click('[data-rail="range"]'); await sleep(400);
    await save(await png(page), 'range-flyout-build');
    await page.locator('[data-flyout-col="0"] .flyout-row-gold').first().click(); await sleep(500);
    // the guided start's practice area is for sale (T239): buy it, so it is your land
    console.log('bought the practice area:', await page.evaluate(() => { const g = window.__game; return g.buyPracticeLot(g.range.practiceSale ?? 0); }));
    const box = await page.evaluate(() => window.__game.range.scene?.practice.box ?? null);
    console.log('practice box', JSON.stringify(box), 'property', await page.evaluate(() => window.__game.paint.property));
    if (box) {
      const cx = (box[0] + box[2]) / 2, cy = (box[1] + box[3]) / 2;
      await look(page, cx, cy, 0.3); await settle(page);
      // long grass round the edge, a waste-area path through it, a bunker's worth of sand off to the side (the Round brush)
      await page.evaluate(() => { const p = window.__game.paint; p.setBrush('longGrass'); p.setBrushShape('round'); p.setBrushR(2); });
      await drag(page, { x: box[0] + 2, y: box[1] + 3 }, { x: box[2] - 2, y: box[1] + 3 }, 20);
      await drag(page, { x: box[0] + 2, y: box[3] - 3 }, { x: box[2] - 2, y: box[3] - 3 }, 20);
      await page.evaluate(() => { const p = window.__game.paint; p.setBrush('waste'); p.setBrushShape('square'); p.setBrushCells(3); });
      await drag(page, { x: cx - 8, y: box[1] + 6 }, { x: cx - 8, y: box[3] - 6 }, 24);
      await page.evaluate(() => { const p = window.__game.paint; p.setBrush('fairway'); p.setBrushShape('round'); p.setBrushR(3); });
      await drag(page, { x: cx + 4, y: cy - 4 }, { x: cx + 10, y: cy + 2 }, 10);
      await settle(page, 1500);
      const c = await px(page, cx + 6, cy + 6); await page.mouse.move(c.x, c.y); await sleep(600);
      await save(await png(page), 'range-build-practice');
      console.log('  cells of no hole in the practice area:', await page.evaluate(b => { const g = window.__game.courseGrid; let n = 0; for (let j = Math.floor((b[1] - g.y0) * 2); j < (b[3] - g.y0) * 2; j++) for (let i = Math.floor((b[0] - g.x0) * 2); i < (b[2] - g.x0) * 2; i++) { const k = j * g.w + i; if (g.surf[k] && !g.hole[k]) n++; } return n; }, box));
    }
    await ctx.close();
  }
  if (only.includes('holes')) {
    const { ctx, page } = await open('?start=town');
    // two holes' fairways nearest each other: a bunker of each beside the spot
    const sp = await page.evaluate(async () => {
      const g = window.__game, grid = g.courseGrid, m = await import('/src/game/ext/course-grid/index.ts'), CT = 0.5, pts = [];
      for (let j = 0; j < grid.h; j += 4) for (let i = 0; i < grid.w; i += 4) { const c = j * grid.w + i; if (grid.surf[c] === m.SURF.fairway && grid.hole[c]) pts.push({ x: grid.x0 + (i + 0.5) * CT, y: grid.y0 + (j + 0.5) * CT, h: grid.hole[c] }); }
      let best = null, bd = Infinity;
      for (let a = 0; a < pts.length; a += 3) for (let b = a + 1; b < pts.length; b += 3) { const p = pts[a], q = pts[b]; if (p.h === q.h) continue; const d = (p.x - q.x) ** 2 + (p.y - q.y) ** 2; if (d < bd && d > 64) { bd = d; best = { a: p, b: q }; } }
      if (!best) return null;
      const { a, b } = best;
      for (const [p, dx] of [[a, 0], [b, 0]]) g.courseGridChanged(m.paintDisc(grid, p.x + dx, p.y, 3, m.SURF.bunker, p.h, 0), true);
      return { a, b, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, d: Math.sqrt(bd) };
    });
    console.log('two holes', JSON.stringify(sp));
    if (sp) {
      const A = sp.a.h, B = sp.b.h;
      // hole A's bunkers in another sand and border (its own look); hole B keeps the course default
      await page.evaluate(A => { const g = window.__game; g.setTool('course'); const p = g.paint; p.setHole(A); p.setBrush('bunker'); p.setStyle({ tex: 'wasteSand', btex: 'dirt' }); g.emit(); }, A);
      await look(page, sp.mid.x, sp.mid.y, 0.3); await settle(page, 2500);
      await page.evaluate(() => document.documentElement.classList.add('noui'));
      await settle(page, 600);
      await save(await png(page), 'two-bunker-looks-30');
      console.log('  hole', A, 'bunker', await page.evaluate(A => JSON.stringify(window.__game.golf.looks[`h${A}`].bunker.tex), A), 'hole', B, await page.evaluate(B => JSON.stringify(window.__game.golf.looks[`h${B}`]?.bunker?.tex), B));
      await page.evaluate(() => document.documentElement.classList.remove('noui'));
      // the cursor's words on hole A against the property
      const hp = await px(page, sp.a.x, sp.a.y + 6); await page.mouse.move(hp.x, hp.y); await sleep(700);
      const holeShot = await png(page);
      await page.evaluate(() => { window.__game.openPropertyPaint('bunker'); });
      await sleep(400); const pp = await px(page, sp.mid.x, sp.mid.y - 10); await page.mouse.move(pp.x, pp.y); await sleep(700);
      const propShot = await png(page);
      await pair(propShot, holeShot, 'Range › Build: "Painting your property"', `Holes › Shape by hand: "Painting hole ${A}"`, 'property-vs-hole');
      // the My looks card on hole A's bunker
      await page.evaluate(A => { const g = window.__game; g.paint.setProperty(false); g.paint.setHole(A); g.paint.setBrush('bunker'); g.emit(); }, A); await sleep(300);
      if (!(await page.locator('[data-looks]').count())) { await page.locator('.more-head').first().click(); await sleep(300); }
      await page.locator('[data-looks]').first().click(); await sleep(600);
      await page.mouse.move(W - 40, H / 2); await sleep(300);
      await save(await png(page), 'looks-card');
      console.log('  card says:', await page.locator('[data-testid="looks-what"]').textContent().catch(() => '(none)'));
      await page.keyboard.press('Escape'); await sleep(200);
      // the hole card's Delete: its two choices
      await page.evaluate(A => { const g = window.__game; g.setTool('select'); g.openHoleCard(A); g.emit(); }, A); await sleep(500);
      await page.locator('[data-testid="hole-delete"]').click(); await sleep(400);
      await save(await png(page), 'delete-choice');
      await page.getByText('Keep it', { exact: true }).click(); await sleep(200);
      // Save hole, then New hole › From My holes: the ghost, and the hole placed again
      await page.locator('[data-testid="hole-save"]').click(); await sleep(200);
      await page.locator('[data-testid="hole-save-form"] input[type="text"], [data-testid="hole-save-form"] input:not([type])').first().fill('Twin bunkers');
      await page.locator('[data-testid="hole-save-go"]').click(); await sleep(400);
      const saved = await page.evaluate(() => window.__game.myHoles().map(h => ({ name: h.name, cells: h.cells.length / 3, plan: !!h.plan, looks: !!h.looks, trees: h.props.length })));
      console.log('  My holes:', JSON.stringify(saved));
      // delete hole A keeping nothing, so a hole number is free, then place the saved hole where the ghost fits
      await page.evaluate(() => { const g = window.__game; g.closeHoleCard(); g.setTool('course'); g.paint.setPlan(); g.emit(); }); await sleep(400);
      await page.locator('[data-testid="from-my-holes"] button').first().click(); await sleep(300);
      const listShot = await png(page);
      await page.locator('[data-testid="from-my-holes"] li button', { hasText: 'Place' }).first().click(); await sleep(300);
      const spot = await page.evaluate(() => {
        const g = window.__game, p = g.paint, L = g.golf, b = [L.course, ...(L.parcels ?? [L.parcel])];
        // the spot that leaves the fewest cells out (none: at once)
        let best = null;
        search: for (const turn of [0, 1, 2, 3]) {
          p.myTurn = turn;
          for (const r of b) for (let y = r[1] + 10; y < r[1] + r[3] - 10; y += 12) for (let x = r[0] + 10; x < r[0] + r[2] - 10; x += 12) {
            const gh = p.myHoleGhost({ x, y }); if (!gh || gh.why) continue;
            if (!best || gh.out.length < best.out) best = { x, y, turn, n: gh.n, cost: gh.cost, out: gh.out.length };
            if (!gh.out.length) break search;
          }
        }
        if (best) p.myTurn = best.turn;
        return best;
      });
      console.log('  place at', JSON.stringify(spot));
      if (spot) {
        // the ghost's middle in view: the placed hole's box round the tee
        const mid = await page.evaluate(s => { const gh = window.__game.paint.myHoleGhost({ x: s.x, y: s.y }); const b = gh.placed.box; return { x: (b[0] + b[2]) / 2, y: (b[1] + b[3]) / 2, w: b[2] - b[0], h: b[3] - b[1] }; }, spot);
        // the tee a little right of the middle (clear of the panel), the hole's box as far as it shows
        await page.evaluate(([s, m, W, H]) => {
          const g = window.__game; g.camEase = null; g.lookAt(s.x, s.y, 0.12);
          const a = g.screen(s.x, s.y), b = g.screen(m.x, m.y), dx = (b.x - a.x) / g.dpr, dy = (b.y - a.y) / g.dpr, L = Math.hypot(dx, dy) || 1;
          // the tee at 62% across, pulled the hole's way back toward the middle as far as the panel allows
          const ox = Math.max(-0.12 * W, Math.min(0.25 * W, (dx / L) * 0.2 * W)), oy = (dy / L) * 0.15 * H;
          const c = g.tileAt(W / 2 + ox - 0.12 * W * (dx < 0 ? -1 : 1) * 0, H / 2 + oy); g.lookAt(c.x, c.y, 0.12); g.emit();
          const t = g.screen(s.x, s.y); if (t.x / g.dpr < 0.45 * W) { const d = g.tileAt(W / 2 - (0.62 * W - t.x / g.dpr), H / 2); g.lookAt(d.x, d.y, 0.12); g.emit(); }
        }, [spot, mid, W, H]); await settle(page, 1200);
        const t = await px(page, spot.x, spot.y); await page.mouse.move(t.x - 30, t.y - 10); await page.mouse.move(t.x, t.y, { steps: 5 }); await sleep(700);
        console.log('  pointer', JSON.stringify(t), await page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return `${e?.tagName}.${e?.className} hover=${JSON.stringify(window.__game.hover)}`; }, [t.x, t.y]));
        console.log('  at the pointer:', JSON.stringify(await page.evaluate(() => { const g = window.__game, gh = g.paint.myHoleGhost(); return { mode: g.paint.mode, tool: g.tool, cursor: g.paint.cursor, why: gh?.why, note: gh?.note, n: gh?.n, z: g.cam.z, money: g.money }; })));
        const ghostShot = await png(page);
        await page.mouse.click(t.x, t.y); await sleep(500); await page.mouse.move(W - 40, H / 2);
        console.log('  after the click:', JSON.stringify(await page.evaluate(() => { const g = window.__game; return { mode: g.paint.mode, toasts: g.toasts.slice(-3).map(q => q.text) }; })));
        await settle(page, 2500);
        const placed = await png(page);
        console.log('  placed:', JSON.stringify(await page.evaluate(n => {
          const g = window.__game, gr = g.courseGrid, by = {}, saved = {}, h = g.myHoles()[0];
          let c = 0; for (let i = 0; i < gr.hole.length; i++) if (gr.hole[i] === n && gr.surf[i]) { c++; by[gr.surf[i]] = (by[gr.surf[i]] ?? 0) + 1; }
          for (let k = 2; k < h.cells.length; k += 3) saved[h.cells[k]] = (saved[h.cells[k]] ?? 0) + 1;
          return { hole: n, cells: c, by, saved, plan: (g.golf.plans ?? []).length, looks: g.golf.looks[`h${n}`]?.bunker?.tex };
        }, spot.n)));
        await pair(ghostShot, placed, 'New hole › From My holes: the ghost (R turns it)', `Built again as hole ${spot.n}`, 'my-holes-placed');
        await save(listShot, 'my-holes-list');
      }
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}
