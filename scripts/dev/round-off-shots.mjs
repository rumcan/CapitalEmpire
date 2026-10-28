// T253 (#735): in-game shots of Round off and the bunkers (each part's PR runs it with its own --tag):
// - edges-bunker-off / edges-bunker-on: Course (hole 1 in hand) › More options › Edges on the bunker, Round off unticked and ticked;
// - edges-edit-hole: the same in Edit hole (hole 1's layout editor open with the bunker brush in hand), when hole 1 has a plan;
// - looks-bunker: Course › Shape by hand › Bunker › My looks, the style editor's Border section (Round off under the Border);
// - square-<z> / round25-<z> / round100-<z>: a 10 m square bunker, a kidney bunker and a green painted into hole 1 on a clear patch, at 30%
//   and 15% (z 30, 15), square (as painted), rounded at Smoothness 25% and 100%;
// - green-<z>: the green's edge close up (30%);
// - reference: round100-30 beside docs/art/reference/bunkers-and-pond-reference.png.
//   node scripts/dev/round-off-shots.mjs --base http://127.0.0.1:5187/ --out E:/ClaudeTemp/T253 --tag part1
// Needs a dev server (vite) on --base. One headless Edge, closed when done. Saves are not written (non-GET requests are answered locally).
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://127.0.0.1:5187/'), out = opt('out', 'output/round-off-shots'), tag = opt('tag', 'after'), only = opt('only', '');
const W = 1366, H = 768;
mkdirSync(out, { recursive: true });

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
async function edgesShot(page, name) {
  const head = page.locator('[data-section="more"] h4.sub-head', { hasText: 'Edges' }).first();
  await head.scrollIntoViewIfNeeded(); await sleep(250);
  const more = await page.locator('[data-section="more"]').first().boundingBox(), hb = await head.boundingBox();
  if (!more || !hb) { console.log('  no Edges'); return; }
  await save(await page.screenshot({ type: 'png', clip: { x: more.x - 6, y: hb.y - 10, width: more.width + 12, height: 190 } }), name);
}
/** Round off for the bunker and the green of the owner in hand (hole 1): off, or on at a Smoothness */
const roundOff = (page, sm) => page.evaluate(sm => { const p = window.__game.paint; for (const k of ['bunker', 'green']) p.setRoundOff(sm === null ? { round: false } : { round: true, smooth: sm }, k); window.__game.emit(); }, sm);

/** Edit hole's Edges (a hole built with New hole on the range fixture's land, its layout editor open with the bunker brush in hand) */
async function editHoleShot() {
  const { ctx, page } = await open('?fixture=range20&stamp=0');
  const info = await page.evaluate(() => {
    const g = window.__game, p = g.paint, land = g.golfLand();
    g.traffic.budget.money = 9_000_000;
    const rects = [...land].map(([x, y, w, h]) => ({ x, y, w, h, cx: x + w / 2, cy: y + h / 2 })).filter(r => g.ownedAt(r.cx, r.cy) && !g.onRangePlot?.(r.cx, r.cy)).sort((a, b) => b.w * b.h - a.w * a.h);
    if (!rects.length) return { why: 'no land' };
    const r = rects[0], long = r.w >= r.h, half = Math.min(110, (long ? r.w : r.h) / 2 - 20);
    const tee = long ? { x: r.cx - half, y: r.cy } : { x: r.cx, y: r.cy - half }, green = long ? { x: r.cx + half, y: r.cy } : { x: r.cx, y: r.cy + half };
    g.setTool('course'); p.course = true;
    const far = -1e5;
    if (!p.setPlan()) return { why: 'setPlan' };
    p.wizard.suggestM = 0;
    p.pointerDown(tee, far, far); p.pointerUp(0.5); p.pointerMove(green, far, far); p.pointerDown(green, far, far); p.pointerUp(0.5);
    const built = p.buildPlan(), hole = p.wizard.plans().at(-1)?.hole ?? 1;
    if (built) { g.editHole(hole); p.setEditBrush('bunker'); g.emit(); }
    return { built, hole };
  });
  console.log('edit hole', JSON.stringify(info));
  if (info.built) {
    await sleep(1000);
    const sec = page.locator('[data-section="edit-edges"]').first();
    await sec.locator('[data-round] input[type="checkbox"]').first().check().catch(e => console.log('  no tick box', e.message)); await sleep(400);
    await sec.scrollIntoViewIfNeeded(); await sleep(250);
    await save(await sec.screenshot({ type: 'png' }), 'edges-edit-hole');
    const panel = page.locator('[data-panel="holes"]').first();
    if (await panel.count()) await save(await panel.screenshot({ type: 'png' }), 'edit-hole-panel');
  }
  await ctx.close();
}

try {
  if (!only || only === 'edit') await editHoleShot();
  if (only === 'edit') process.exit(0);
  const { ctx, page } = await open(opt('url', '?start=town'));
  await page.evaluate(() => { const g = window.__game; g.setTool('course'); g.paint.setHole?.(1); g.emit(); });
  await sleep(800);
  const more = page.locator('[data-section="more"] .more-head').first();
  if ((await more.getAttribute('aria-expanded')) !== 'true') { await more.click(); await sleep(400); }
  if (!only || only === 'ui') {
    await page.locator(`[data-section="shape"] [data-swatch="bunker"]`).first().click(); await sleep(400);
    await edgesShot(page, 'edges-bunker-off');
    await page.locator('[data-section="more"] [data-round] input[type="checkbox"]').first().check(); await sleep(300);
    await edgesShot(page, 'edges-bunker-on');
    // My looks: the bunker's style editor, its Border section (Round off under it)
    await page.locator('[data-section="more"] [data-looks]').first().click(); await sleep(800);
    const card = page.locator('[data-card="looks"]').first();
    if (await card.count()) {
      await card.evaluate(el => { for (const d of el.querySelectorAll('details')) d.open = true; const r = el.querySelector('[data-round]'); r?.scrollIntoView({ block: 'center' }); }); await sleep(400);
      await save(await card.screenshot({ type: 'png' }), 'looks-bunker');
      await page.keyboard.press('Escape'); await sleep(300);
    }
    await roundOff(page, null); await sleep(200);
    // Edit hole: hole 1's layout editor with the bunker brush in hand, when hole 1 has a plan
    const ed = await page.evaluate(() => { const g = window.__game, p = g.paint; if (!p.hasPlan(1)) return false; g.editHole(1); return p.setEditBrush('bunker'); });
    if (ed) {
      await sleep(800);
      if ((await more.getAttribute('aria-expanded')) !== 'true') { await more.click(); await sleep(400); }
      await page.locator('[data-section="more"] [data-round] input[type="checkbox"]').first().check().catch(() => {}); await sleep(300);
      await edgesShot(page, 'edges-edit-hole');
      await page.evaluate(() => { const p = window.__game.paint; p.setEditBrush(null); p.cancelPlan?.(); p.setHole(1); window.__game.emit(); }); await sleep(400);
      await roundOff(page, null);
    } else console.log('  hole 1 has no plan: no Edit hole shot');
  }

  // ---- the course: a square bunker, a kidney bunker and a green painted into hole 1 on a clear patch of rough or grass near it
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
    for (let r = 20; r < 260; r += 6) for (let a = 0; a < 16; a++) {
      const x = Math.round(cx + r * Math.cos(a * Math.PI / 8)), y = Math.round(cy + r * Math.sin(a * Math.PI / 8));
      if (!clear(x - 6, y - 6, 46, 30)) continue;
      const X = x, Y = y, P = (pts, s) => g.courseGridChanged(m.fillPolygon(grid, pts.map(([u, v]) => ({ x: X + u, y: Y + v })), s, 1, 0), true);
      const D = (u, v, r0, s) => g.courseGridChanged(m.paintDisc(grid, X + u, Y + v, r0, s, 1, 0), true);
      P([[-4, -6], [40, -6], [40, 24], [-4, 24]], S.rough);  // a clean bed of rough under it all
      P([[0, 0], [5, 0], [5, 5], [0, 5]], S.bunker);         // the square bunker, 10 x 10 m
      D(12, 3, 2.2, S.bunker); D(15, 1.8, 1.8, S.bunker); D(17.5, 3.4, 2, S.bunker); // a kidney of three round dabs
      D(30, 9, 5, S.green); D(26, 13, 3, S.green);           // a green of two dabs
      D(23, 16.5, 1.6, S.bunker); D(25.5, 17.5, 1.4, S.bunker); // a bunker by the green
      return { x: X + 18, y: Y + 8 };
    }
    return null;
  });
  console.log('spot', JSON.stringify(spot));
  if (spot) {
    await page.evaluate(() => document.documentElement.classList.add('noui'));
    // --finish '{"bowl":0}': the course finish's knobs for these shots (ground.setCourseFinish; bowl 0 is the bunkers before T253 part 2)
    const fx = JSON.parse(opt('finish', '{}'));
    if (Object.keys(fx).length) await page.evaluate(fx => window.__game.ground.setCourseFinish(fx), fx);
    const variants = opt('variants', 'square,round25,round100').split(',');
    for (const [name, sm] of [['square', null], ['round25', 0.25], ['round100', 1]].filter(([n]) => variants.includes(n))) {
      await roundOff(page, sm);
      for (const z of [30, 15]) {
        await look(page, spot.x, spot.y, z / 100); await settle(page, 2500);
        await save(await page.screenshot({ type: 'png' }), `${name}-${z}`);
      }
    }
    // the green's edge close up, rounded at 100%
    await look(page, spot.x + 11, spot.y + 2, 0.3); await settle(page, 2500);
    await save(await page.screenshot({ type: 'png' }), 'green-30');
    // beside the reference: the rounded scene and the owner's picture at the same height
    const ref = await sharp('docs/art/reference/bunkers-and-pond-reference.png').resize({ height: H }).toBuffer(), rm = await sharp(ref).metadata();
    await look(page, spot.x, spot.y, 0.3); await settle(page, 1500);
    const shot = await page.screenshot({ type: 'png' });
    const img = await sharp({ create: { width: W + rm.width + 8, height: H, channels: 3, background: '#000' } }).composite([{ input: shot, left: 0, top: 0 }, { input: ref, left: W + 8, top: 0 }]).png().toBuffer();
    const file = join(out, `reference-${tag}.jpg`); await sharp(img).resize({ width: 2400 }).jpeg({ quality: 88, mozjpeg: true }).toFile(file); console.log(file);
  }
  await ctx.close();
} finally {
  await browser.close();
}
