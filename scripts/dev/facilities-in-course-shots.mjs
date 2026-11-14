// #1272 (the owner, 2026-11-14: "move facilities button in main menu to this menu bottom right empty space"): in-game check and shots of Facilities as the sixth tile of the Course
// flyout, in the normal (non-jam) game on a new range start (seed 1): the rail without a Facilities button, the Course flyout with Facilities bottom right, its next level opened to
// the side, the deepest walk (Course > Facilities > Decoration > Props > the groups), a Facilities leaf in hand (Course lit), the Z key (Props, Course lit), and the same walk at the
// largest Text size (125%) on a small screen (1366 x 768): every column inside the screen, none scrolling sideways. Each step's state is checked and printed; a failed check exits 1.
//   node scripts/dev/facilities-in-course-shots.mjs --base http://127.0.0.1:5641/ --out docs/ui-shots [--seed 1] [--no-shots]
// Needs a dev server (vite) on --base. One headless Chrome, closed when done; a fresh profile, so the start is a new game. Saves are not written.
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://127.0.0.1:5641/'), out = opt('out', 'output/facilities-in-course-shots'), seed = opt('seed', '1'), noShots = args.includes('--no-shots');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
let bad = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) bad++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
/** a clip of the rail and every flyout column open now, grown by pad, within the viewport */
const clipOf = async (page, pad = 12) => {
  const boxes = [];
  // the rail, the flyout columns and the tool's panel (a sibling of the rail in its box)
  for (const el of await page.$$('[data-testid="rail"], [data-flyout-col], [data-testid="rail"] ~ *')) { const b = await el.boundingBox(); if (b && b.width > 0 && b.height > 0) boxes.push(b); }
  const vp = page.viewportSize(), x0 = 0, y0 = 0, x1 = Math.min(vp.width, Math.max(...boxes.map(b => b.x + b.width)) + pad), y1 = Math.min(vp.height, Math.max(...boxes.map(b => b.y + b.height)) + pad);
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
};
const shot = async (page, name) => {
  if (noShots) return;
  const file = join(out, `${name}.jpg`), png = await page.screenshot({ type: 'png', clip: await clipOf(page) });
  await sharp(png).jpeg({ quality: 86, mozjpeg: true }).toFile(file);
  console.log('  ' + file);
};
const tile = (page, level, key) => page.locator(`[data-flyout-col="${level}"] [data-key="${key}"]`);
const lit = page => page.evaluate(() => [...document.querySelectorAll('[data-testid="rail"] [data-rail][aria-pressed="true"]')].map(b => b.getAttribute('data-rail')));
const cols = page => page.evaluate(() => [...document.querySelectorAll('[data-flyout-col]')].map(c => { const b = c.getBoundingClientRect(); return { l: Math.round(b.left), r: Math.round(b.right), t: Math.round(b.top), b: Math.round(b.bottom), sw: c.scrollWidth, cw: c.clientWidth, labels: [...c.querySelectorAll('[role="menuitem"] .flyout-label')].map(x => x.textContent) }; }));
async function open(size, scale, query = `?start=range&seed=${seed}`) {
  const ctx = await browser.newContext({ viewport: size, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => { try { localStorage.clear(); } catch { /* none */ } });
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('[pageerror]', e.message); bad++; });
  page.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 300)); });
  await page.route('**/*', r => { const x = r.request(); return x.method() !== 'GET' && x.method() !== 'HEAD' ? r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }) : r.continue(); });
  await page.goto(`${base}${query}`, { timeout: 300000, waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game?.ready && (window.__game.range?.bareGate || window.__game.range?.scene), null, { timeout: 300000 });
  await page.evaluate(() => { const g = window.__game; g.prebake = () => {}; g.setSpeed(0); g.closeWelcome?.(false); const p = g.golf.progress; if (p) { for (const k of ['who', 'welcome']) if (!p.seen.includes(k)) p.seen.push(k); if (p.tour) p.tour.off = true; } g.emit(); });
  if (scale !== 1) await page.evaluate(s => document.documentElement.style.setProperty('--ui-scale', String(s)), scale);
  await sleep(1500);
  return { ctx, page };
}

try {
  const { ctx, page } = await open({ width: 1366, height: 768 }, 1);
  check(await page.evaluate(() => !window.__game.golfMode ? false : true), 'a golf game (the normal build, no jam)');
  // ---- the rail
  const order = await page.evaluate(() => [...document.querySelectorAll('[data-testid="rail"] [data-rail]')].map(b => b.getAttribute('data-rail')));
  console.log('  rail', order.join(' '));
  check(!order.includes('facilities') && order.includes('course') && order.indexOf('paths') === order.indexOf('course') + 1, 'the rail has no Facilities button; Cart paths & roads sits right under Course');
  check((await page.$$('[data-rail="facilities"], [data-testid="rail"] [data-guide="rail-facilities"]')).length === 0, 'no element of the rail carries the Facilities anchor');
  await shot(page, 'facilities-in-course-1-rail');

  // ---- the Course flyout: Facilities, the sixth tile, bottom right
  await page.click('[data-rail="course"]'); await sleep(700);
  const c0 = await page.evaluate(() => [...document.querySelectorAll('[data-flyout-col="0"] [role="menuitem"]')].map(b => { const r = b.getBoundingClientRect(); return { key: b.getAttribute('data-key'), x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), tile: b.getAttribute('data-tile'), more: !!b.querySelector('.flyout-pic-more'), guide: b.getAttribute('data-guide') }; }));
  console.log('  course tiles', c0.map(t => `${t.key}@${t.x},${t.y}`).join(' | '));
  const fac = c0.find(t => t.key === 'facilities');
  check(c0.length === 6 && !!fac, 'the Course flyout has six tiles, one of them Facilities');
  check(!!fac && fac.x === Math.max(...c0.map(t => t.x)) && fac.y === Math.max(...c0.map(t => t.y)) && c0[c0.length - 1] === fac, 'Facilities is the bottom right tile (the last of the grid)');
  check(fac?.tile === 'chipping-green' && fac.more && fac.guide === 'rail-facilities', 'a picture tile (the chipping green) with its more mark, carrying the guide anchor rail-facilities');
  check((await lit(page)).join() === 'walk' || (await lit(page)).length <= 1, `rail lit while the flyout is open and no tool in hand: ${(await lit(page)).join() || 'none'}`);
  await page.mouse.move(700, 120); await sleep(200);
  await shot(page, 'facilities-in-course-2-course-flyout');

  // ---- a click on Facilities opens its tools as the next level, to the side
  await tile(page, 0, 'facilities').hover(); await tile(page, 0, 'facilities').click(); await sleep(600);
  let cs = await cols(page);
  console.log('  columns', cs.map(c => `[${c.l}..${c.r}] ${c.labels.join(', ')}`).join('  ||  '));
  check(cs.length === 2 && cs[1].l >= cs[0].r, 'a second column opens beside the first, to the side');
  check(['Practice', 'Plants', 'Decoration'].every(l => cs[1]?.labels.includes(l)), 'its tools: Practice, Plants, Decoration (Props) ...');
  const lockedNow = await page.evaluate(() => [...document.querySelectorAll('[data-flyout-col="1"] [aria-disabled="true"] .flyout-label')].map(x => x.textContent));
  console.log('  locked in place:', lockedNow.join(', ') || 'none');
  await page.mouse.move(700, 120); await sleep(200);
  await shot(page, 'facilities-in-course-3-facilities-open');

  // ---- the deepest walk: Decoration > Props > the groups
  await tile(page, 1, 'decoration').hover(); await sleep(450);
  await page.locator('[data-flyout-col="2"] [data-key="props"]').hover(); await sleep(500);
  cs = await cols(page);
  console.log('  columns', cs.map(c => `[${c.l}..${c.r}]${c.sw > c.cw ? ' SIDEWAYS' : ''}`).join(' '));
  check(cs.length === 4 && cs.every((c, i) => i === 0 || c.l >= cs[i - 1].r) && cs.every(c => c.r <= 1366 && c.sw <= c.cw), 'four columns, each beside the last, all inside the screen, none scrolling sideways');
  await page.mouse.move(700, 120); await sleep(200);
  await shot(page, 'facilities-in-course-4-deepest-walk');

  // ---- a leaf: Props > All props: in hand, Course lit, the crumb names the way
  await page.locator('[data-flyout-col="3"] [role="menuitem"]', { hasText: 'All props' }).first().click(); await sleep(900);
  let st = await page.evaluate(() => { const g = window.__game; return { tool: g.uiTool, fly: !!document.querySelector('[data-testid="flyouts"]'), crumb: document.querySelector('[data-testid="tool-crumb"] .tool-crumb-text')?.textContent ?? null }; });
  console.log('  after the leaf', JSON.stringify(st), 'lit', (await lit(page)).join());
  check(st.tool === 'props' && !st.fly, 'Props in hand, the flyouts closed');
  check((await lit(page)).join() === 'course', 'the rail lights Course (not a Facilities button) while a Facilities tool is in hand');
  check(/^Course › Facilities › Decoration › Props/.test(st.crumb ?? ''), `the panel's crumb names the way: ${st.crumb}`);
  await page.mouse.move(700, 400); await sleep(200);
  await shot(page, 'facilities-in-course-5-props-in-hand-course-lit');

  // ---- the keys: Z is Props' key still; the back arrow reopens the flyouts at the leaf's place
  await page.evaluate(() => { const g = window.__game; g.setTool('select'); g.emit(); }); await sleep(300);
  st = await page.evaluate(() => window.__game.uiTool); check(st === 'select', 'back to Select');
  await page.keyboard.press('z'); await sleep(500);
  st = await page.evaluate(() => window.__game.uiTool); check(st === 'props', `Z takes Props in hand (${st})`);
  check((await lit(page)).join() === 'course', `Course lit after Z: ${(await lit(page)).join()}`);
  // (the Goal pill of the top bar stands over the tool panel's first row on a small screen: a click goes through the page's own handler instead of through the pill)
  const covered = await page.evaluate(() => { const b = document.querySelector('[data-testid="tool-crumb"] .tool-back'), r = b?.getBoundingClientRect(), top = r ? document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) : null; return top && !b.contains(top) ? (top.textContent ?? '').slice(0, 30) : null; });
  if (covered) console.log(`  (note: the panel's back arrow is under "${covered}": the top bar's Goal pill, not part of this change)`);
  await page.evaluate(() => document.querySelector('[data-testid="tool-crumb"] .tool-back').click()); await sleep(600);
  cs = await cols(page);
  check(cs.length >= 3 && cs[1]?.labels.includes('Decoration'), `the crumb's back arrow reopens Course > Facilities at the leaf's place (${cs.length} columns)`);
  await page.keyboard.press('Escape'); await sleep(300);
  check((await page.$('[data-testid="flyouts"]')) === null, 'Esc closes the flyouts');

  // ---- the number keys: 2 opens the Course menu with the keyboard leading; the last tile is reached by the arrow keys, Right goes in
  await page.evaluate(() => { const g = window.__game; g.setTool('select'); g.emit(); }); await sleep(200);
  // (numberedGroups: Range counts only once it is placed, so on this bare start Course is 1; with a range it is 2)
  const nCourse = await page.evaluate(() => (window.__game.range.scene ? '2' : '1'));
  await page.keyboard.press(nCourse); await sleep(500);
  check((await cols(page)).length === 1 && (await cols(page))[0].labels.includes('Facilities'), `the number key ${nCourse} opens the Course menu`);
  await page.keyboard.press('End'); await page.keyboard.press('ArrowRight'); await sleep(500);
  cs = await cols(page);
  check(cs.length === 2 && cs[1].labels.includes('Plants'), `End then Right on the last tile (Facilities) goes in: ${cs.map(c => c.labels.length).join(',')}`);
  await page.keyboard.press('Escape'); await sleep(200);
  await ctx.close();

  // ---- a game with a range (fixture): Practice is open; its leaf and the Plants leaf pick through Course, the rail lights Course
  const fx = await open({ width: 1366, height: 768 }, 1, '?fixture=range20');
  await fx.page.evaluate(() => { const g = window.__game; g.closeWho?.('Tester', 2); g.closeWelcome?.(false); g.setSpeed(0); g.emit(); }); await sleep(500);
  const reach = async (...leafs) => { // Course > Facilities > ... : hover each level, click the last
    await fx.page.click('[data-rail="course"]'); await sleep(500);
    await tile(fx.page, 0, 'facilities').hover(); await tile(fx.page, 0, 'facilities').click(); await sleep(500);
    for (let i = 0; i < leafs.length; i++) { const r = fx.page.locator(`[data-flyout-col="${i + 1}"] [role="menuitem"]`, { hasText: leafs[i] }).first(); await r.hover(); await sleep(450); if (i === leafs.length - 1) await r.click(); }
    await sleep(700);
    return fx.page.evaluate(() => ({ tool: window.__game.uiTool, lit: [...document.querySelectorAll('[data-testid="rail"] [data-rail][aria-pressed="true"]')].map(b => b.getAttribute('data-rail')).join(), fly: !!document.querySelector('[data-testid="flyouts"]') }));
  };
  const locksFx = await (async () => { await fx.page.click('[data-rail="course"]'); await sleep(500); await tile(fx.page, 0, 'facilities').hover(); await tile(fx.page, 0, 'facilities').click(); await sleep(500); const l = await fx.page.evaluate(() => [...document.querySelectorAll('[data-flyout-col="1"] [aria-disabled="true"]')].map(x => `${x.querySelector('.flyout-label')?.textContent}: ${x.querySelector('.flyout-why')?.textContent}`)); await fx.page.keyboard.press('Escape'); await sleep(200); return l; })();
  console.log('  fixture: range scene', await fx.page.evaluate(() => !!window.__game.range.scene), '| locked in Facilities:', locksFx.join(' | ') || 'none');
  let r;
  if (locksFx.some(l => l.startsWith('Practice'))) console.log('  (Practice is locked in this fixture: the Practice leaf is not reached)');
  else {
    r = await reach('Practice', 'Putting green');
    console.log('  Practice > Putting green:', JSON.stringify(r));
    check(r.tool === 'practice' && r.lit === 'course' && !r.fly, 'Practice > Putting green: the Practice tool in hand, Course lit, flyouts closed');
    await fx.page.evaluate(() => { const g = window.__game; g.setTool('select'); g.emit(); }); await sleep(300);
  }
  r = await reach('Plants', 'Trees');
  console.log('  Plants > Trees:', JSON.stringify(r));
  check(r.tool === 'paint' && r.lit === 'course' && !r.fly, 'Plants > Trees: the plant brush in hand, Course lit (not Town decoration)');
  await fx.ctx.close();

  // ---- the largest Text size on a small screen
  const big = await open({ width: 1366, height: 768 }, 1.25);
  await big.page.click('[data-rail="course"]'); await sleep(700);
  await tile(big.page, 0, 'facilities').hover(); await tile(big.page, 0, 'facilities').click(); await sleep(500);
  await tile(big.page, 1, 'decoration').hover(); await sleep(450);
  await big.page.locator('[data-flyout-col="2"] [data-key="props"]').hover(); await sleep(500);
  cs = await cols(big.page);
  console.log('  at 125% on 1366 x 768:', cs.map(c => `[${c.l}..${c.r} x ${c.t}..${c.b}]${c.sw > c.cw ? ' SIDEWAYS' : ''}`).join(' '));
  check(cs.length === 4 && cs.every(c => c.r <= 1366 && c.sw <= c.cw && c.b <= 768), 'at 125% text on 1366 x 768 all four columns fit the screen and none scrolls sideways');
  const pageSide = await big.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth && document.body.scrollWidth <= window.innerWidth);
  check(pageSide, 'no horizontal scrollbar on the page');
  await big.page.mouse.move(700, 120); await sleep(200);
  await shot(big.page, 'facilities-in-course-6-deepest-walk-125pct');
  await big.ctx.close();
} catch (e) {
  console.log('[script failed]', e.message.split('\n')[0]); bad++;
} finally {
  await browser.close();
}
console.log(bad ? `${bad} FAILED` : 'all ok');
process.exit(bad ? 1 : 0);
