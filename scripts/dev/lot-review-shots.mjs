// T385 (#1042): the same seeded town before (?oldyards: the house lots as they were composed) and after (the clean base), in the autumn and the desert look, from the lot review's
// own page (?lotreview: the lab's light boot, the street grid of a new game's town with its seeded house lots); and the studio's Lot review mode itself (its checklist, its
// quick pick palettes, its lot grid after some lots are ticked and marked).
//   node scripts/dev/lot-review-shots.mjs --base http://127.0.0.1:5186/ --out E:/ClaudeTemp/T385 [--seed 7] [--only town|ui|estate]
// Needs a dev server (vite) on --base and Microsoft Edge. One headless Edge, closed when done. Saves are not written to the server (every POST is answered here).
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://127.0.0.1:5186/'), out = opt('out', 'output/lot-review-shots'), seed = +opt('seed', '7'), only = opt('only', '');
const W = 1500, H = 900;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const errors = [];
async function open(url) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', e => { errors.push(e.message); console.log('[pageerror]', e.message); });
  page.on('console', m => { if (m.type() === 'error') { errors.push(m.text()); console.log('[console]', m.text().slice(0, 300)); } });
  await page.route('**/*', r => { const x = r.request(); return x.method() !== 'GET' && x.method() !== 'HEAD' ? r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }) : r.continue(); });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction(() => window.__game?.ready && window.__lotReview?.ready(), null, { timeout: 300000 });
  return { ctx, page };
}
const settle = async (page, ms = 1200) => {
  await page.waitForTimeout(ms);
  await page.evaluate(() => { window.__calm = 0; });
  await page.waitForFunction(() => { const g = window.__game; window.__calm = g.ground.busy === 0 && g.perf.chunksPending === 0 ? window.__calm + 1 : 0; return window.__calm > 20; }, null, { timeout: 90000, polling: 50 }).catch(() => console.log('(the ground never settled)'));
  await page.waitForTimeout(400);
};
const shot = async (page, name) => { const f = join(out, `${name}.jpg`); await sharp(await page.screenshot({ type: 'png' })).jpeg({ quality: 90, mozjpeg: true }).toFile(f); console.log(f); return f; };
/** the lots to show: the first built, not declining lot of each of the four map-axis roads, then two 'upgraded' ones, by their index in the set */
const pickLots = lots => {
  const want = [0, 2, 4, 6], out = [];
  for (const r of want) { const i = lots.findIndex(l => l.road === r && l.st.level === 2 && l.st.decline === 0 && l.g.w >= 10); if (i >= 0) out.push(i); }
  const up = lots.map((l, i) => [l, i]).filter(([l]) => l.st.level === 3 && l.st.decline === 0 && !out.includes(lots.indexOf(l))).slice(3, 5).map(([, i]) => i);
  return [...out, ...up];
};

if (!only || only === 'town') {
  for (const [theme, d] of [['autumn', 'off'], ['desert', 'on']]) {
    const shots = {};
    for (const [look, extra] of [['before', '&oldyards'], ['after', '']]) {
      const { ctx, page } = await open(`${base}?lotreview&dev&source=town&seed=${seed}&desert=${d}${extra}`);
      await page.evaluate(() => window.__lotReview.hide(true));
      const lots = await page.evaluate(() => window.__lotReview.lots().map(l => ({ road: l.road, st: l.st, g: l.g, id: l.id })));
      console.log(`${theme} ${look}: ${lots.length} lots`);
      await page.evaluate(() => { const g = window.__game; g.camEase = null; g.lookAt(512, 512, 0.05); });
      await settle(page, 2500); shots[`${look}-town`] = await shot(page, `${theme}-${look}-town`);
      const picks = pickLots(lots);
      for (const i of picks) {
        const l = lots[i], cx = l.g.o.x + (l.g.u.x * l.g.w + l.g.n.x * l.g.d) / 2, cy = l.g.o.y + (l.g.u.y * l.g.w + l.g.n.y * l.g.d) / 2;
        await page.evaluate(([x, y]) => { const g = window.__game; g.camEase = null; g.lookAt(x, y, 0.2); }, [cx, cy]);
        await settle(page); shots[`${look}-lot${i}`] = await shot(page, `${theme}-${look}-lot-${i}-road${l.road}`);
      }
      // a street: a row of lots along one street, at the street zoom
      const l0 = lots[picks[0]], cx = l0.g.o.x + l0.g.u.x * l0.g.w * 1.5 + l0.g.n.x * l0.g.d * 0.5, cy = l0.g.o.y + l0.g.u.y * l0.g.w * 1.5 + l0.g.n.y * l0.g.d * 0.5;
      await page.evaluate(([x, y]) => { const g = window.__game; g.camEase = null; g.lookAt(x, y, 0.12); }, [cx, cy]);
      await settle(page); shots[`${look}-street`] = await shot(page, `${theme}-${look}-street`);
      await ctx.close();
    }
    // before | after, side by side
    for (const k of Object.keys(shots).filter(k => k.startsWith('before-'))) {
      const name = k.slice(7), a = shots[k], b = shots[`after-${name}`]; if (!b) continue;
      const f = join(out, `${theme}-compare-${name}.jpg`);
      await sharp({ create: { width: W * 2 + 8, height: H, channels: 3, background: '#0b1220' } }).composite([{ input: a, left: 0, top: 0 }, { input: b, left: W + 8, top: 0 }]).jpeg({ quality: 88, mozjpeg: true }).toFile(f); console.log(f);
    }
  }
}

if (!only || only === 'estate') {
  for (const [look, extra] of [['before', '&oldyards'], ['after', '']]) {
    const { ctx, page } = await open(`${base}?lotreview&dev&source=estate&seed=${seed}&desert=on${extra}`);
    await page.evaluate(() => window.__lotReview.hide(true));
    await page.evaluate(() => { const g = window.__game; g.camEase = null; g.lookAt(450, 420, 0.12); });
    await settle(page, 2500); await shot(page, `estate-desert-${look}`);
    await ctx.close();
  }
}

if (!only || only === 'ui') {
  const { ctx, page } = await open(`${base}?lotreview&dev&source=town&seed=${seed}&desert=off`);
  const n = await page.evaluate(() => window.__lotReview.lots().length);
  console.log(`the review: ${n} lots`);
  await settle(page, 1500);
  // the first lots: tick, mark and place, the way the owner does (keys and clicks; every save is answered by the stub)
  await page.keyboard.press('g'); await page.waitForTimeout(500);
  await page.keyboard.press('g'); await page.waitForTimeout(500);
  await page.keyboard.press('b'); await page.waitForTimeout(500);
  await page.keyboard.press('Enter'); await page.waitForTimeout(500);
  await page.keyboard.press('g'); await page.waitForTimeout(500);
  await page.evaluate(() => window.__lotReview.open(0)); await settle(page);
  await shot(page, 'ui-1-review-grid');
  await page.evaluate(() => window.__lotReview.open(4)); await settle(page);
  await page.keyboard.press('1'); await page.keyboard.press('2'); await page.keyboard.press('3');
  await page.evaluate(() => window.__lotReview.flyout('checks')); await page.waitForTimeout(300);
  await shot(page, 'ui-2-checklist');
  await page.evaluate(() => window.__lotReview.flyout('props')); await page.waitForTimeout(500);
  await shot(page, 'ui-3-props');
  // arm the mailbox and click on the lot: the override
  const arm = page.locator('div[title^="Mailbox"]').first();
  if (await arm.count()) { await arm.click(); }
  const at = await page.evaluate(() => { const g = window.__game, r = window.__lotReview, l = r.lots()[r.index()].g; const t = { x: l.o.x + l.u.x * l.w * 0.3 + l.n.x * 1, y: l.o.y + l.u.y * l.w * 0.3 + l.n.y * 1 }; const c = g.canvas.getBoundingClientRect(), z = g.cam.z; const X = (t.x - t.y) * 64, Y = (t.x + t.y) * 32; return { x: c.left + g.cssW / 2 + (X - g.cam.X) * z, y: c.top + g.cssH / 2 + (Y - g.cam.Y) * z }; });
  await page.mouse.click(at.x, at.y); await settle(page, 800);
  await page.evaluate(() => window.__lotReview.flyout('decals')); await page.waitForTimeout(500);
  await shot(page, 'ui-4-decals-and-override');
  console.log('say:', await page.evaluate(() => window.__lotReview.say()));
  await ctx.close();
}
await browser.close();
console.log(errors.length ? `${errors.length} errors` : 'no page errors');
