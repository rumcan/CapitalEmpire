// T260 (#763): in-game shots of a course Border of none (run it once on main with --tag before, once on the branch with --tag after, then
// --pair puts each before and after side by side):
// - looks-border-waste: Course › Shape by hand › Waste area › My looks: the style editor's Border section at the card's foot;
// - edges-rough, edges-waste, edges-tee: Course (hole 1 in hand) › More options › Edges on the rough, the waste area and the tee;
// - course-30: a tee, a bunker and a pond beside a fairway running into a green, painted into hole 1, at the closest zoom (30%);
// - tee-border-on-30 (after only): the same with the tee's Border set back to 1 m.
//   node scripts/dev/border-none-shots.mjs --base http://127.0.0.1:5187/ --out E:/ClaudeTemp/T260 --tag after
//   node scripts/dev/border-none-shots.mjs --out E:/ClaudeTemp/T260 --pair
// Needs a dev server (vite) on --base. One headless Edge, closed when done. Saves are not written (non-GET requests are answered locally).
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://127.0.0.1:5187/'), out = opt('out', 'output/border-none-shots'), tag = opt('tag', 'after');
const W = 1366, H = 768, NAMES = ['looks-border-waste', 'edges-rough', 'edges-waste', 'edges-tee', 'course-30'];
mkdirSync(out, { recursive: true });

/** each name's before and after pngs side by side, each with a caption bar, as one jpg */
async function pairAll() {
  const cap = (t, w) => Buffer.from(`<svg width="${w}" height="36"><rect width="100%" height="100%" fill="#0b1220"/><text x="12" y="25" font-family="Segoe UI, sans-serif" font-size="20" font-weight="700" fill="#ffd166">${t}</text></svg>`);
  for (const n of NAMES) {
    const a = join(out, `${n}-before.png`), b = join(out, `${n}-after.png`); if (!existsSync(a) || !existsSync(b)) { console.log('missing', n); continue; }
    const [ma, mb] = [await sharp(a).metadata(), await sharp(b).metadata()], h = Math.max(ma.height, mb.height) + 36;
    const col = async (f, m, t) => sharp({ create: { width: m.width, height: h, channels: 3, background: '#0b1220' } }).composite([{ input: cap(t, m.width), top: 0, left: 0 }, { input: f, top: 36, left: 0 }]).png().toBuffer();
    const img = await sharp({ create: { width: ma.width + mb.width + 8, height: h, channels: 3, background: '#000' } })
      .composite([{ input: await col(a, ma, 'Before (main)'), top: 0, left: 0 }, { input: await col(b, mb, 'After (T260: Border none)'), top: 0, left: ma.width + 8 }]).png().toBuffer();
    const file = join(out, `${n}.jpg`); await sharp(img).resize({ width: Math.min(2400, ma.width + mb.width + 8) }).jpeg({ quality: 88, mozjpeg: true }).toFile(file); console.log(file);
  }
}
if (args.includes('--pair')) { await pairAll(); process.exit(0); }

const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const save = async (buf, name) => { const file = join(out, `${name}-${tag}.png`); await sharp(buf).png().toFile(file); console.log(file); return file; };
/** wait until no chunk bake is in flight for a moment */
const settle = async (page, ms = 900) => {
  await page.waitForTimeout(ms);
  await page.evaluate(() => { window.__calm = 0; });
  await page.waitForFunction(() => { const g = window.__game; window.__calm = g.ground.busy === 0 ? window.__calm + 1 : 0; return window.__calm > 20; }, null, { timeout: 60000, polling: 50 }).catch(() => console.log('  (settle timed out)'));
  await page.waitForTimeout(300);
};
async function open(url) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => { try { localStorage.clear(); sessionStorage.clear(); } catch { /* none */ } });
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

/** the Edges sub-section of More options (its heading and what lies under it), as a png */
async function edgesShot(page, kind, name) {
  await page.locator(`[data-section="shape"] [data-swatch="${kind}"]`).first().click(); await sleep(400);
  const head = page.locator('[data-section="more"] h4.sub-head', { hasText: 'Edges' }).first();
  await head.scrollIntoViewIfNeeded(); await sleep(250);
  const more = await page.locator('[data-section="more"]').first().boundingBox(), hb = await head.boundingBox();
  if (!more || !hb) { console.log('  no Edges for', kind); return; }
  await save(await page.screenshot({ type: 'png', clip: { x: more.x - 6, y: hb.y - 10, width: more.width + 12, height: 150 } }), name);
}

try {
  const { ctx, page } = await open('?start=town');
  // ---- the panels: the Course tool with hole 1 in hand, More options open
  await page.evaluate(() => { const g = window.__game; g.setTool('course'); g.paint.setHole?.(1); g.emit(); });
  await sleep(800);
  const more = page.locator('[data-section="more"] .more-head').first();
  if ((await more.getAttribute('aria-expanded')) !== 'true') { await more.click(); await sleep(400); }
  for (const k of ['rough', 'waste', 'tee']) await edgesShot(page, k, `edges-${k}`);
  // the waste area's look: My looks, its style editor scrolled to the Border section at the foot
  await page.locator(`[data-section="shape"] [data-swatch="waste"]`).first().click(); await sleep(400);
  await page.locator('[data-section="more"] [data-looks]').first().click(); await sleep(800);
  const card = page.locator('[data-card="looks"]').first();
  await card.evaluate(el => { for (const d of el.querySelectorAll('details')) d.open = true; el.scrollTop = el.scrollHeight; }); await sleep(400);
  await save(await card.screenshot({ type: 'png' }), 'looks-border-waste');
  await page.keyboard.press('Escape'); await sleep(300);

  // ---- the course at 30%: a little hole painted into hole 1 on a clear patch of rough or grass beside it
  const spot = await page.evaluate(async () => {
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
    for (let r = 20; r < 220; r += 6) for (let a = 0; a < 16; a++) {
      const x = Math.round(cx + r * Math.cos(a * Math.PI / 8)), y = Math.round(cy + r * Math.sin(a * Math.PI / 8));
      if (!clear(x - 4, y - 4, 40, 34)) continue;
      const X = x, Y = y, P = (pts, s) => g.courseGridChanged(m.fillPolygon(grid, pts.map(([u, v]) => ({ x: X + u, y: Y + v })), s, 1, 0), true);
      const D = (u, v, r0, s) => g.courseGridChanged(m.paintDisc(grid, X + u, Y + v, r0, s, 1, 0), true);
      P([[2, 10], [6, 10], [6, 14], [2, 14]], S.tee);          // the tee (8 x 8 m) in the rough
      P([[9, 8], [24, 8], [24, 16], [9, 16]], S.fairway);     // the fairway
      D(28, 12, 3.5, S.green);                                // the green off its end
      D(17, 20.5, 2, S.bunker);                               // a bunker beside the fairway
      D(6, 21, 3, S.water);                                   // a pond by the tee
      return { x: X + 16, y: Y + 14 };
    }
    return null;
  });
  console.log('spot', JSON.stringify(spot));
  if (spot) {
    await page.evaluate(() => document.documentElement.classList.add('noui'));
    await look(page, spot.x, spot.y, 0.3); await settle(page, 3000);
    await save(await page.screenshot({ type: 'png' }), 'course-30');
    if (tag === 'after') {
      await page.evaluate(() => { const g = window.__game; g.paint.setCourseBorder(1, 'tee'); g.emit(); });
      await settle(page, 3000);
      await save(await page.screenshot({ type: 'png' }), 'tee-border-on-30');
    }
    console.log('borders', await page.evaluate(() => { const p = window.__game.paint; return JSON.stringify(['fairway', 'green', 'tee', 'bunker', 'water'].map(k => [k, p.courseBorder(k)])); }));
  }
  await ctx.close();
} finally {
  await browser.close();
}
