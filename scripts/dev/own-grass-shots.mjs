// T271 (#812): in-game shots of the course's own grasses:
// - grass-editor-new: Shape by hand › 9 Create your own: the editor card on a new grass;
// - grass-editor: the made grass's editor (its name, plays as, the painted grass families as pucks, scale, Exposure, stripes, Edges);
// - grass-swatches: Shape by hand's swatches with the grass after the eight, in hand, its key Shift+1, and 9 Create your own;
// - grass-course-30: a fairway with the custom grass painted beside it (and a strip of it in the rough), hole 1, at the closest zoom (30%);
// - grass-edit-hole: Edit hole's paint section with the grass in hand (when hole 1 has a plan).
//   node scripts/dev/own-grass-shots.mjs --base http://127.0.0.1:5186/ --out E:/ClaudeTemp/T271
// Needs a dev server (vite) on --base. One headless Edge, closed when done. Saves are not written (non-GET requests are answered locally).
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://127.0.0.1:5186/'), out = opt('out', 'output/own-grass-shots'), W = 1366, H = 1000;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const save = async (buf, name) => { const file = join(out, `${name}.png`); await sharp(buf).png().toFile(file); console.log(file); return file; };
const settle = async (page, ms = 900) => {
  await page.waitForTimeout(ms);
  await page.evaluate(() => { window.__calm = 0; });
  await page.waitForFunction(() => { const g = window.__game; window.__calm = g.ground.busy === 0 ? window.__calm + 1 : 0; return window.__calm > 20; }, null, { timeout: 60000, polling: 50 }).catch(() => console.log('  (settle timed out)'));
  await page.waitForTimeout(300);
};
/** an element's shot, its scroll box opened out first (a card taller than the screen shows whole) */
const shotOf = async (page, sel, name) => {
  // a tall window for the shot (the card's foot is drawn), the hint bar out of the way
  await page.setViewportSize({ width: W, height: 2400 }); await sleep(400);
  const el = page.locator(sel).first();
  await el.evaluate(e => { e.dataset.mh = e.style.maxHeight; e.style.maxHeight = 'none'; e.scrollTop = 0; });
  await sleep(900);
  const f = await save(await el.screenshot({ type: 'png' }), name);
  await el.evaluate(e => { e.style.maxHeight = e.dataset.mh ?? ''; });
  await page.setViewportSize({ width: W, height: H }); await sleep(300);
  return f;
};

try {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => { try { localStorage.clear(); sessionStorage.clear(); } catch { /* none */ } });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  page.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 300)); });
  await page.route('**/*', r => { const x = r.request(); return x.method() !== 'GET' && x.method() !== 'HEAD' ? r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }) : r.continue(); });
  await page.goto(`${base}?start=town`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 300000 });
  await page.evaluate(() => { const g = window.__game; g.setSpeed(0); g.closeWelcome?.(false); g.emit(); });
  await page.addStyleTag({ content: 'html.noui * { visibility: hidden !important } html.noui canvas { visibility: visible !important }' });
  await settle(page, 1500);

  // ---- the Holes tool, hole 1 in hand; 9 opens Create your own
  await page.evaluate(() => { const g = window.__game; g.setTool('course'); g.paint.setHole?.(1); g.paint.setBrush('fairway', 0); g.emit(); });
  await sleep(800);
  await page.mouse.move(W / 2, H / 2);
  await page.keyboard.press('Digit9'); await sleep(400);
  const fams = await page.evaluate(() => { const g = window.__game; return [...document.querySelectorAll('[data-card="grass"] [data-family]')].map(e => e.getAttribute('data-family')); });
  console.log('families', fams.length);
  await sleep(2500); // the family pucks' pictures
  await shotOf(page, '[data-card="grass"]', 'grass-editor-new');
  // the new grass: a fairway-like grass in another painted family, a little darker, striped, with a 1 m first cut; Create puts it in hand
  // a grass that reads apart from the fairway's own: the concept rough's darker, denser turf, mown as a fairway
  const pickFam = fams.find(f => f === 'rough-concept-run') ?? fams.find(f => /emerald/.test(f ?? '')) ?? fams[1];
  await page.locator('[data-testid="grass-name"]').fill('Links fairway'); await sleep(150);
  await page.locator(`[data-card="grass"] [data-family="${pickFam}"]`).click(); await sleep(300);
  await page.evaluate(() => { const g = window.__game; g.paint.editGrass({ tone: 1, toneAmt: 0.08, border: 1 }); g.emit(); });
  await page.locator('[data-testid="grass-create"]').click(); await sleep(600);
  const k = await page.evaluate(() => window.__game.paint.grassInHand);
  console.log('made grass', k, pickFam);
  // a second: a golden fescue, rounded off, for the rough
  const k2 = await page.evaluate(fams => { const p = window.__game.paint; p.openGrass(); p.editGrass({ name: 'Dune fescue', plays: 'fescue', family: fams.includes('golden-fescue') ? 'golden-fescue' : fams[2], round: true, smooth: 0.8, border: 0, tone: 2, toneAmt: 0.06 }); p.createGrass(); p.closeGrass(); return p.grassInHand; }, fams);
  console.log('made grass', k2);
  await page.evaluate(k => { window.__game.paint.openGrass(k); window.__game.emit(); }, k); await sleep(2000);
  await shotOf(page, '[data-card="grass"]', 'grass-editor');
  await page.keyboard.press('Escape'); await sleep(300);
  await page.evaluate(k => { const p = window.__game.paint; p.closeGrass(); p.setGrass(k); window.__game.emit(); }, k); await sleep(1500);
  await shotOf(page, '[data-section="shape"]', 'grass-swatches');

  // ---- the course at 30%: a fairway in the rough, the custom grass beside it, and a strip of it in the rough
  const spot = await page.evaluate(async ([k, k2]) => {
    const g = window.__game, grid = g.courseGrid, m = await import('/src/game/ext/course-grid/index.ts'), CT = 0.5, S = m.SURF;
    const hb = g.paint.holeBox(1); if (!hb) return null;
    const clear = (x0, y0, w, h) => {
      for (let y = y0; y < y0 + h; y += 0.5) for (let x = x0; x < x0 + w; x += 0.5) {
        const i = Math.floor((x - grid.x0) / CT), j = Math.floor((y - grid.y0) / CT); if (i < 0 || j < 0 || i >= grid.w || j >= grid.h) return false;
        const s = grid.surf[j * grid.w + i]; if (s !== S.none && s !== S.rough) return false;
      }
      return true;
    };
    const cx = (hb[0] + hb[2]) / 2, cy = (hb[1] + hb[3]) / 2;
    for (let r = 20; r < 240; r += 6) for (let a = 0; a < 16; a++) {
      const x = Math.round(cx + r * Math.cos(a * Math.PI / 8)), y = Math.round(cy + r * Math.sin(a * Math.PI / 8));
      if (!clear(x - 4, y - 4, 44, 36)) continue;
      const X = x, Y = y, P = (pts, s, o) => g.courseGridChanged(m.fillPolygon(grid, pts.map(([u, v]) => ({ x: X + u, y: Y + v })), s, 1, 0, o), true);
      P([[0, -2], [36, -2], [36, 28], [0, 28]], S.rough);                    // rough under it all
      P([[4, 6], [32, 6], [32, 13], [4, 13]], S.fairway);                    // the fairway
      P([[4, 13], [32, 13], [32, 19], [4, 19]], S.fairway, { look: k });     // the custom grass beside it, along its whole side
      P([[8, 21], [30, 21], [30, 24], [8, 24]], S.fairway, { look: k });     // and a strip of it alone in the rough
      g.courseGridChanged(m.paintDisc(grid, X + 2, Y + 24, 3.5, S.fescue, 1, 0, { look: k2 }), true); // the fescue grass, rounded, in the rough
      g.courseGridChanged(m.paintDisc(grid, X + 34, Y + 2, 3, S.fescue, 1, 0, { look: k2 }), true);
      return { x: X + 18, y: Y + 13 };
    }
    return null;
  }, [k, k2]);
  console.log('spot', JSON.stringify(spot));
  if (spot) {
    await page.evaluate(() => document.documentElement.classList.add('noui'));
    await page.evaluate(([x, y]) => { const g = window.__game; g.camEase = null; g.lookAt(x, y, 0.3); g.emit(); }, [spot.x, spot.y]);
    await page.mouse.move(5, 5);
    await settle(page, 3500);
    await save(await page.screenshot({ type: 'png' }), 'grass-course-30');
    await page.evaluate(() => document.documentElement.classList.remove('noui'));
    // the lie: the cell plays as a fairway
    const lie = await page.evaluate(([x, y]) => { const g = window.__game; return { surf: g.courseSurfAt(x, y + 3), draw: g.courseGrid.draw?.[g.courseGrid.w * Math.floor((y + 3 - g.courseGrid.y0) / 0.5) + Math.floor((x - g.courseGrid.x0) / 0.5)] }; }, [spot.x, spot.y]);
    console.log('lie', JSON.stringify(lie));
  }

  // ---- Edit hole with the grass in hand (hole 1 needs a plan)
  const edit = await page.evaluate(k => { const g = window.__game, p = g.paint; if (!p.hasPlan?.(1)) return false; p.editPlan(1); p.setGrass(k); g.emit(); return true; }, k);
  if (edit) { await sleep(1500); await shotOf(page, '[data-section="edit-paint"]', 'grass-edit-hole'); } else console.log('hole 1 has no plan: no Edit hole shot');
  await ctx.close();
} finally {
  await browser.close();
}
