// T214 (#559, plan P26 phases 1-2): in-game shots of the club's members on the Clubhouse card (the old start's town and course, ?start=town):
// - before: on main, a new old-start game run into its first town day: the Clubhouse card (club-card-old-main) and the save written to
//   <out>/old-town.cesave (the "old save": no golf.club); the console says the card's member count;
// - load: on the branch, that save imported and loaded: the same card (club-card-old-branch), the member count the same as main's;
// - fresh: on the branch, a new old-start game: the founding drive's toast and the card after it (club-card-founding);
// - prices: on the branch, the card's Members block at a cheap, the fair and a dear price, at 1366 and 2560 px wide (club-card-<price>-<w>), and
//   the card's sideways overflow measured (none allowed);
//   node scripts/dev/club-shots.mjs --base http://127.0.0.1:5187/ --out E:/ClaudeTemp/T214 [--only before|load,fresh,prices]
// Needs a dev server (vite) on --base. One headless Edge, closed when done. Saves are not written to the server (non-GET requests are answered here).
import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://127.0.0.1:5187/'), out = opt('out', 'output/club-shots'), only = opt('only', 'load,fresh,prices');
const want = k => only.split(',').includes(k);
mkdirSync(out, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });

/** a page at width W (1300 high, or 1440 at 2560: tall enough for the whole card in one shot; its width is what the rules are about), the old
 *  start, ready, the welcome closed and the clock stopped */
async function open(W, url = `${base}?start=town`) {
  const ctx = await browser.newContext({ viewport: { width: W, height: W >= 2000 ? 1440 : 1300 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  page.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 300)); });
  await page.route('**/*', r => { const x = r.request(); return x.method() !== 'GET' && x.method() !== 'HEAD' ? r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }) : r.continue(); });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 300000 });
  await page.evaluate(() => { const g = window.__game; g.closeWelcome?.(false); g.emit(); });
  return { ctx, page };
}
/** runs the clock at speed s for ms, then stops it */
const run = (page, s, ms) => page.evaluate(async ([s, ms]) => { const g = window.__game; g.setSpeed(s); await new Promise(r => setTimeout(r, ms)); g.setSpeed(0); g.emit(); }, [s, ms]);
/** the card open, the members it shows (its header's count), and its shot */
async function card(page, name) {
  await page.evaluate(() => { const g = window.__game; document.querySelectorAll('button[aria-label="Close"]').forEach(x => x.click()); g.openClubCard(true); g.emit(); });
  await sleep(700);
  const el = page.locator('[data-testid="club-card"]').first();
  const head = await el.locator('.text-\\[12px\\]').first().textContent().catch(() => '');
  const info = await page.evaluate(() => { const c = document.querySelector('[data-testid="club-card"]'); return c ? { sw: c.scrollWidth, cw: c.clientWidth, h: c.scrollHeight } : null; });
  const file = join(out, `${name}.png`);
  // the whole card, scrolled through: its height unclipped for the shot
  await page.evaluate(() => { const c = document.querySelector('[data-testid="club-card"]'); if (c) { c.dataset.mh = c.style.maxHeight; c.style.maxHeight = 'none'; } });
  await sleep(200);
  await el.screenshot({ path: file });
  await page.evaluate(() => { const c = document.querySelector('[data-testid="club-card"]'); if (c) c.style.maxHeight = c.dataset.mh ?? ''; });
  console.log(file, '|', head?.trim(), '|', JSON.stringify(info));
  return { head, info };
}

try {
  if (want('before')) {
    const { ctx, page } = await open(1366);
    await run(page, 4, 6000);
    await card(page, 'club-card-old-main');
    const n = await page.evaluate(() => window.__game.clubCard()?.clubMembers);
    console.log('main: the card\'s members', n);
    const b64 = await page.evaluate(async () => {
      const g = window.__game; await g.save(); const s = await import('/src/game/save.ts'), buf = await s.exportSaveBytes();
      let bin = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i++) bin += String.fromCharCode(u[i]); return btoa(bin);
    });
    writeFileSync(join(out, 'old-town.cesave'), Buffer.from(b64, 'base64'));
    console.log(join(out, 'old-town.cesave'), Buffer.from(b64, 'base64').length, 'bytes');
    await ctx.close();
  }
  if (want('load')) {
    const { ctx, page } = await open(1366);
    const bytes = readFileSync(join(out, 'old-town.cesave')).toString('base64');
    const r = await page.evaluate(async b64 => {
      const g = window.__game; g.saveBlocked = true; const s = await import('/src/game/save.ts');
      const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      return s.importSaveBytes(u.buffer);
    }, bytes);
    console.log('import', JSON.stringify(r));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__game?.ready, null, { timeout: 300000 });
    await page.evaluate(() => { const g = window.__game; g.closeWelcome?.(false); g.setSpeed(0); g.emit(); });
    await sleep(2500); // the first frames: the club seeded from the old save (P26 section 8)
    await card(page, 'club-card-old-branch');
    console.log('branch: the club', JSON.stringify(await page.evaluate(() => window.__game.golf.club)));
    await ctx.close();
  }
  if (want('fresh')) {
    const { ctx, page } = await open(1366);
    await page.screenshot({ path: join(out, 'club-founding-toast.png'), clip: { x: 0, y: 0, width: 1366, height: 768 } }); // the founding drive's toast
    console.log(join(out, 'club-founding-toast.png'));
    await run(page, 1, 3000);
    const toasts = await page.evaluate(() => (window.__game.toasts ?? []).map(t => t.text));
    console.log('toasts', JSON.stringify(toasts));
    await card(page, 'club-card-founding');
    console.log('fresh: the club', JSON.stringify(await page.evaluate(() => window.__game.golf.club)));
    await ctx.close();
  }
  if (want('drawer')) {
    // a few months on (speed 20): the dues booked; the money chip's drawer (Dues, Wages) and the golfers chip's tip
    const { ctx, page } = await open(1366, `${base}?start=town&money=0`);
    await run(page, 20, 15000);
    console.log('the club', JSON.stringify(await page.evaluate(() => window.__game.golf.club)));
    await page.hover('[data-stat="money"]'); await sleep(400);
    const b = await page.locator('[data-stat="money"]').boundingBox(); await page.mouse.move(b.x + 30, b.y + b.height + 120); await sleep(500); // into the drawer: its tooltip goes
    await page.screenshot({ path: join(out, 'club-money-drawer.png'), clip: { x: 0, y: 0, width: 700, height: 600 } });
    console.log(join(out, 'club-money-drawer.png'));
    console.log('golfers tip:', await page.evaluate(() => document.querySelector('[data-stat="golfers"]')?.getAttribute('data-tip')));
    await ctx.close();
  }
  if (want('prices')) {
    for (const W of [1366, 2560]) {
      const { ctx, page } = await open(W);
      await run(page, 20, 12000); // a month or two: sales, churn and dues on the headline
      const fair = await page.evaluate(() => { const g = window.__game; g.openClubCard(true); return g.clubCard()?.members?.fair ?? 50; });
      console.log('fair', fair.toFixed(2));
      for (const [name, p] of [['cheap', Math.round(fair * 0.6 / 5) * 5], ['fair', Math.round(fair / 5) * 5], ['dear', Math.round(fair * 1.4 / 5) * 5]]) {
        await page.evaluate(p => { window.__game.setClubPrice(p); }, p);
        await page.evaluate(() => { const d = document.querySelector('[data-testid="club-why"]'); if (d) d.open = true; });
        const { info } = await card(page, `club-card-${name}-${W}`);
        if (info && info.sw > info.cw + 1) console.log(`FAIL: the card scrolls sideways at ${W} px (${info.sw} in ${info.cw})`);
      }
      await ctx.close();
    }
  }
} finally { await browser.close(); }
