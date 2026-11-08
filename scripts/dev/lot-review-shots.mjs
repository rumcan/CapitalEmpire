// T385 (#1042): the same seeded town before (?oldyards: the house lots as they were composed) and after (the clean base), in the autumn and the desert look, from the lot review's
// own page (?lotreview: the lab's light boot, the street grid of a new game's town with its seeded house lots); the estate's lots the same way; and the studio's Lot review
// mode itself, driven the way the owner drives it (real clicks and keys: the keys G, B, Enter, the arrows, the grid, the Valid dropdown and its ticks, a note and Ctrl+Enter, the
// filters, the Props and Decals flyouts with a typed search, a tile armed and a click on the lot, U and C, the Estate and Desert chips): every result is read back from the page,
// a FAIL line (and exit code 1) when one is not as it should be, and its shots are of the states reached.
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
      const { ctx, page } = await open(`${base}?lotreview&source=town&seed=${seed}&desert=${d}${extra}`);
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
    const { ctx, page } = await open(`${base}?lotreview&source=estate&seed=${seed}&desert=on${extra}`);
    await page.evaluate(() => window.__lotReview.hide(true));
    await page.evaluate(() => { const g = window.__game; g.camEase = null; g.lookAt(450, 420, 0.12); });
    await settle(page, 2500); await shot(page, `estate-desert-${look}`);
    await ctx.close();
  }
}

if (!only || only === 'ui') {
  // the review page driven the way the owner drives it: real clicks and keys (the page's own pointer path), every result read back from the page; the shots are of the states reached
  const R = '#ce-lotreview';
  let { ctx, page } = await open(`${base}?lotreview&source=town&seed=${seed}&desert=off`);
  const ok = (v, what, extra = '') => { console.log(`${v ? 'ok  ' : 'FAIL'} ${what}${extra ? `  [${extra}]` : ''}`); if (!v) errors.push(`FAIL ${what}`); return v; };
  const until = async (fn, arg, ms = 6000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await page.evaluate(fn, arg)) return true; } catch { /* the page is being navigated */ } await page.waitForTimeout(200); } return false; };
  const idx = () => page.evaluate(() => window.__lotReview.index());
  const idxIs = i => until(i => window.__lotReview.index() === i, i);
  const idAt = i => page.evaluate(i => window.__lotReview.lots()[i].id, i);
  const rec = id => page.evaluate(id => window.__lotReview.file().lots[id] ?? null, id);
  const say = () => page.evaluate(() => window.__lotReview.say());
  const status = () => page.evaluate(() => document.querySelector('#ce-lotreview').lastElementChild.textContent);
  const flyShown = () => page.evaluate(() => getComputedStyle(document.querySelector('#ce-lotreview').children[2]).display !== 'none');
  const bt = re => page.locator(`${R} button`, { hasText: re });
  const gridCount = () => page.locator(`${R} button`).filter({ hasText: /^\d+$/ }).count();
  const cardText = () => page.locator(R).innerText();
  /** a click on the lot's ground: (fa) along the street as a fraction of the lot's width, (fd) tiles in from the street */
  const clickLot = async (fa, fd) => {
    const at = await page.evaluate(([fa, fd]) => { const g = window.__game, r = window.__lotReview, l = r.lots()[r.index()].g; const t = { x: l.o.x + l.u.x * l.w * fa + l.n.x * fd, y: l.o.y + l.u.y * l.w * fa + l.n.y * fd }; const c = g.canvas.getBoundingClientRect(), s = g.screen(t.x, t.y); return { x: c.left + s.x / g.dpr, y: c.top + s.y / g.dpr }; }, [fa, fd]);
    await page.mouse.click(at.x, at.y); await settle(page, 800);
    return say();
  };
  console.log(`the review: ${await page.evaluate(() => window.__lotReview.lots().length)} lots`);
  await settle(page, 1500);
  ok((await idx()) === 0, 'opens on lot 1');

  // the keys: G (good), G, B (bad), Enter on a lot with nothing ticked, G
  for (const k of ['g', 'g', 'b', 'Enter', 'g']) { await page.keyboard.press(k); await page.waitForTimeout(450); }
  ok(await idxIs(5), 'five keys, five lots on', String(await idx()));
  const r5 = []; for (let i = 0; i < 5; i++) r5.push(await rec(await idAt(i)));
  ok(r5[0]?.checks.house && r5[0].checks.drive && r5[0].checks.trees && r5[0].checks.fence && !r5[0].bad, 'G saves a lot with all four checks valid');
  ok(r5[2]?.bad === true, 'B marks the lot bad');
  ok(r5[3] && Object.values(r5[3].checks).length === 4 && Object.values(r5[3].checks).every(v => v === false), 'Enter on an untouched lot saves it with every check unticked (bad by the ticks)');
  ok(r5[4]?.checks.trees === true, 'G on the fifth');
  console.log('say:', await say());
  await page.evaluate(() => window.__lotReview.open(0)); await settle(page);
  await shot(page, 'ui-1-review-grid');

  // the buttons, the arrows and the grid
  await bt(/Next/).click(); ok(await idxIs(1), 'the Next button goes to lot 2');
  await page.keyboard.press('ArrowRight'); await page.waitForTimeout(250); await page.keyboard.press('.'); ok(await idxIs(3), 'Right arrow and . step on');
  await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(250); await page.keyboard.press(','); ok(await idxIs(1), 'Left arrow and , step back');
  await bt(/Prev/).click(); ok(await idxIs(0), 'the Prev button goes back');
  await bt(/^9$/).click(); ok(await idxIs(8), 'a lot button of the grid opens that lot');

  // the checklist: the dropdown opens a flyout beside the card, the ticks are read back by the dropdown
  await bt(/^Valid:/).click(); await page.waitForTimeout(300);
  ok(await flyShown() && (await cardText()).includes('VALID'), 'the Valid dropdown opens the checklist flyout');
  await shot(page, 'ui-2-checklist');
  const boxes = page.locator(`${R} input[type=checkbox]`);
  ok((await boxes.count()) === 4, 'the checklist has four checks', String(await boxes.count()));
  await boxes.nth(0).click(); await boxes.nth(1).click(); await page.waitForTimeout(250);
  const dd = await bt(/^Valid:/).innerText();
  ok(/House, Driveway or parking/.test(dd) && !/Trees/.test(dd), 'ticking House and Driveway is read back by the dropdown', dd.replace(/\s+/g, ' '));

  // a note and Ctrl+Enter: bad, with the note, on to the next lot
  const id8 = await idAt(8);
  await page.locator(`${R} textarea`).click(); await page.keyboard.type('the drive ends at the fence'); await page.keyboard.press('Control+Enter');
  ok(await idxIs(9), 'Ctrl+Enter in the note goes on to the next lot');
  const r8 = await rec(id8);
  ok(r8 && r8.bad === true && r8.note === 'the drive ends at the fence' && r8.checks.house === true && r8.checks.drive === true && r8.checks.trees === false && r8.checks.fence === false, 'Ctrl+Enter marks the lot bad with its note and the ticks as left', JSON.stringify(r8 && { bad: r8.bad, note: r8.note, checks: r8.checks }));

  // the filters
  await bt(/^Bad$/).click(); await page.waitForTimeout(250);
  ok((await gridCount()) === 3, 'the Bad filter lists the three lots marked bad', String(await gridCount()));
  await bt(/^To do$/).click(); await page.waitForTimeout(250);
  const todo = await gridCount(), all = await page.evaluate(() => window.__lotReview.lots().length);
  ok(todo === all - 6, 'the To do filter leaves out the six lots looked at', `${todo} of ${all}`);
  await bt(/^All$/).click(); await page.waitForTimeout(250);
  ok((await gridCount()) === all, 'the All filter lists every lot');

  // the props: P opens the flyout (the lot is fitted again beside it), the search is typed (its keys are its own), a tile is armed, Esc stops it, a click on the lot places it
  await page.keyboard.press('p'); await page.waitForTimeout(500);
  ok(await flyShown(), 'P opens the props flyout');
  await settle(page, 600); await shot(page, 'ui-3-props');
  const before = await idx(), search = page.locator(`${R} input[placeholder^="search"]`);
  await search.click(); await page.keyboard.type('mailbox'); await page.waitForTimeout(300);
  ok((await idx()) === before && (await page.evaluate(id => window.__lotReview.file().lots[id]?.bad, await idAt(before))) !== true, 'typing a search is no key command (the b of mailbox marks nothing)');
  const mail = page.locator(`${R} div[title*="world:mailbox"]`).first();
  ok((await mail.count()) === 1, 'the search finds the mailbox');
  await mail.click(); await page.waitForTimeout(250);
  ok(/placing world:mailbox/.test(await status()), 'a click on the tile arms it', await status());
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  ok(!/placing/.test(await status()) && !(await flyShown()), 'Esc stops placing and closes the flyout');
  await page.keyboard.press('p'); await page.waitForTimeout(500); await settle(page, 600);
  await page.locator(`${R} div[title*="world:mailbox"]`).first().click(); await page.waitForTimeout(250);
  const said1 = await clickLot(0.3, 1.2); console.log('say:', said1);
  ok(/placed \(1 sprites, 0 decals/.test(said1), 'a click on the lot, beside the open flyout, places the mailbox', said1);
  const id9 = await idAt(9);
  ok((await rec(id9))?.override?.props?.length === 1, 'the placed mailbox is in the lot\'s record');
  await shot(page, 'ui-4-override-placed');
  await page.keyboard.press('u'); await page.waitForTimeout(500);
  ok(/placed here: 0 sprites, 0 decals/.test(await cardText()), 'U takes the last one off', await say());
  await page.locator(`${R} div[title*="world:mailbox"]`).first().click(); await page.waitForTimeout(250);
  ok(/placed \(1 sprites, 0 decals/.test(await clickLot(0.3, 1.2)), 'the mailbox placed again');

  // the decals: D switches the flyout, the first tile is armed, a click places it
  await page.keyboard.press('d'); await page.waitForTimeout(500);
  const dtile = page.locator(`${R} div[title]`).first(); console.log('decal tile:', await dtile.getAttribute('title')); await dtile.click(); await page.waitForTimeout(250);
  const said2 = await clickLot(0.7, 5); console.log('say:', said2);
  ok(/placed \(1 sprites, 1 decals/.test(said2), 'a decal placed the same way', said2);
  await shot(page, 'ui-5-decal-placed');
  await page.keyboard.press('Escape'); await page.waitForTimeout(500); await settle(page, 600);
  await shot(page, 'ui-6-lot-with-override');
  await bt(/Next/).click(); await idxIs(10); await bt(/Prev/).click(); await idxIs(9);
  ok(/placed here: 1 sprites, 1 decals/.test(await cardText()), 'what was placed stays with the lot when the review goes on and comes back');
  await page.keyboard.press('c'); await page.waitForTimeout(500);
  ok(/placed here: 0 sprites, 0 decals/.test(await cardText()), 'C clears what was placed', await say());

  // the estate, then the desert look (the page is framed again; the set and the lot are kept)
  await bt(/^Estate$/).click();
  ok(await until(() => window.__lotReview.lots().length > 0 && window.__lotReview.lots()[0].id.startsWith('estate:'), null, 120000), 'the Estate chip lays the estate lots');
  ok((await page.evaluate(() => window.__lotReview.lots().length)) > 10, 'the estate has its lots', String(await page.evaluate(() => window.__lotReview.lots().length)));
  await settle(page, 1500); await shot(page, 'ui-7-estate');
  await bt(/^Desert$/).click();
  ok(await until(() => location.search.includes('desert=on') && window.__game?.ready && window.__lotReview?.ready(), null, 240000), 'the Desert chip frames the page again in the desert look');
  ok((await page.evaluate(() => window.__game.desertTheme)) === true && (await page.evaluate(() => window.__lotReview.lots()[0].id.startsWith('estate:'))), 'the desert page is on the same set');
  await settle(page, 1500); await shot(page, 'ui-8-estate-desert');
  await ctx.close();
}
await browser.close();
console.log(errors.length ? `${errors.length} errors` : 'no page errors'); process.exitCode = errors.length ? 1 : 0;
