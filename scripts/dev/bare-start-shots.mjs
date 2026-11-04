// T288 (#873): in-game check and shots of the bare start and the placements. On a new range game (seed 1): the bare start (the trailer and the
// plot alone), the driving range's ghost refused (on the home) and fine, placed; the car park's ghost and placed; the practice area's; the target
// greens' ghost off the range (refused) and on it, placed; the rail's Cart paths & roads button and its flyout. Each step's state is checked
// (no range, no car park before; each thing only after its click) and printed; a failed check exits 1.
//   node scripts/dev/bare-start-shots.mjs --base http://127.0.0.1:5187/ --out F:/ClaudeTemp/T288 [--seed 1]
// Needs a dev server (vite) on --base. One headless Edge, closed when done; a fresh profile, so the start is a new game.
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://127.0.0.1:5187/'), out = opt('out', 'output/bare-start-shots'), seed = opt('seed', '1');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
let bad = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) bad++; };
const settle = async (page, ms = 900) => {
  await page.waitForTimeout(ms);
  await page.evaluate(() => { window.__calm = 0; });
  await page.waitForFunction(() => { const g = window.__game; window.__calm = g.ground.busy === 0 ? window.__calm + 1 : 0; return window.__calm > 20; }, null, { timeout: 60000, polling: 50 }).catch(() => console.log('  (settle timed out)'));
  await page.waitForTimeout(300);
};
const shot = async (page, name) => {
  const file = join(out, `${name}.jpg`), png = await page.screenshot({ type: 'png' });
  await sharp(png).jpeg({ quality: 86, mozjpeg: true }).toFile(file);
  console.log('  ' + file);
};
const look = (page, p, z) => page.evaluate(([x, y, z]) => { const g = window.__game; g.camEase = null; g.lookAt(x, y, z); g.emit(); }, [p.x, p.y, z]);
/** the home frame's point (u along the road, v away from it) in world tiles (range.ts plotPoint) */
const homePt = (page, u, v) => page.evaluate(([u, v]) => {
  const g = window.__game, [px, py] = g.golf.range.home, f = g.golf.dir, W = 70, D = 150;
  return f === 2 ? { x: px + u, y: py + v } : f === 0 ? { x: px + W - u, y: py + D - v } : f === 1 ? { x: px + v, y: py + W - u } : { x: px + D - v, y: py + u };
}, [u, v]);
/** the pointer on world tile p (the camera already there) */
const hover = async (page, p) => { const s = await page.evaluate(([x, y]) => { const g = window.__game, q = g.screen(x, y); return { x: q.x / g.dpr, y: q.y / g.dpr }; }, [p.x, p.y]); await page.mouse.move(s.x, s.y); await page.waitForTimeout(250); return s; };
const verdict = page => page.evaluate(() => { const g = window.__game, p = g.placing, h = g.hover; if (!p || !h) return null; const s = p.spot(h.x, h.y); return { why: p.why(s), name: p.name }; });
const state = page => page.evaluate(() => {
  const g = window.__game, b = g.golf.range;
  return { range: g.bizDefs.some(d => d.type === 'range'), scene: !!g.range.scene, parks: g.parkDefs.length, built: b.built, lot: !!b.lot, practiceAt: b.practiceAt, owned: [...b.owned], money: Math.round(g.money), placing: g.placing?.id ?? null,
    drive: g.net.segs ? [...g.net.segs.values()].filter(s => s.cls.id === 'drive-gravel').length : -1, props: [...g.range.props?.keys?.() ?? []].length };
});
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }), page = await ctx.newPage();
  page.on('pageerror', e => { console.log('[pageerror]', e.message); bad++; });
  page.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 300)); });
  await page.goto(`${base}?start=range&seed=${seed}`, { timeout: 240000, waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game?.ready && window.__game.range?.bareGate, null, { timeout: 240000 });
  await page.evaluate(() => { const g = window.__game; g.prebake = () => {}; g.setSpeed(0); window.__night = 0; g.nightAmount = () => window.__night; });
  // close the start cards (who are you, the tutorial) so the map shows
  await page.evaluate(() => { const g = window.__game, p = g.golf.progress; if (p) { for (const k of ['who', 'welcome']) if (!p.seen.includes(k)) p.seen.push(k); if (p.tour) p.tour.off = true; } g.emit(); });
  let st = await state(page); console.log('start', JSON.stringify(st));
  check(!st.range && !st.scene && st.parks === 0 && st.built === false && st.practiceAt === null && st.props > 0, 'a bare start: no range, no car park, no practice area; the home laid');
  const gate = await page.evaluate(() => window.__game.range.bareGate);
  await look(page, gate, 0.3); await settle(page); await shot(page, '01-bare-start-trailer-30pct');
  await look(page, await homePt(page, 60, 40), 0.1); await settle(page); await shot(page, '02-bare-start-plot-10pct');

  // the driving range: on the home (refused), then on its start spot (fine), placed
  await page.evaluate(() => window.__game.placeRangePart('range'));
  st = await state(page); check(st.placing === 'range' && !st.range, 'Place the driving range: a ghost in hand, nothing built');
  await look(page, await homePt(page, 35, 60), 0.08); await settle(page, 600);
  await hover(page, await homePt(page, 10, 12)); let v = await verdict(page); console.log('  on the home:', JSON.stringify(v));
  check(!!v?.why, 'the range over the home is refused'); await shot(page, '03-range-ghost-refused-on-home-8pct');
  await hover(page, await homePt(page, 35, 12)); v = await verdict(page); console.log('  start spot:', JSON.stringify(v));
  check(v?.why === '', 'the range on its start spot may be built'); await shot(page, '04-range-ghost-fine-8pct');
  st = await state(page); check(!st.range, 'still nothing built before the click');
  await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(500);
  st = await state(page); console.log('  placed', JSON.stringify(st)); check(st.range && st.scene && st.built === undefined && st.placing === null && st.drive >= 1, 'the click builds the range and its drive');
  await settle(page); await shot(page, '05-range-placed-8pct');

  // the car park: snapped on the road beside the range
  await page.evaluate(() => window.__game.placeRangePart('carpark'));
  await look(page, await homePt(page, 59, -10), 0.2); await settle(page, 600);
  { const s = await hover(page, await homePt(page, 45, 24)); v = await verdict(page); console.log('  car park on the range:', JSON.stringify(v), JSON.stringify(s)); } check(!!v?.why, 'a car park on the range is refused');
  await hover(page, await homePt(page, 59, -10)); v = await verdict(page); console.log('  car park by the road:', JSON.stringify(v));
  check(v?.why === '', 'the car park beside the road may be built'); await shot(page, '06-carpark-ghost-20pct');
  st = await state(page); check(st.parks === 0, 'no car park before the click');
  await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(500);
  st = await state(page); check(st.parks === 1 && st.lot, 'the click builds the car park, the range\'s own lot'); await settle(page); await shot(page, '07-carpark-placed-20pct');

  // the practice area: beside the car park, across the drive
  await page.evaluate(() => window.__game.placeRangePart('practice'));
  await look(page, await homePt(page, 93, 19), 0.12); await settle(page, 600);
  await hover(page, await homePt(page, 62, 30)); v = await verdict(page); check(!!v?.why, `the practice area on the range is refused (${v?.why})`);
  await hover(page, await homePt(page, 93, 19)); v = await verdict(page); console.log('  practice:', JSON.stringify(v));
  check(v?.why === '', 'the practice area beside the car park may be built'); await shot(page, '08-practice-ghost-12pct');
  await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(500);
  st = await state(page); check(Array.isArray(st.practiceAt), 'the click places the practice area'); await settle(page); await shot(page, '09-practice-placed-12pct');

  // an upgrade: the target greens, off the range (refused) and over it (snapped), placed
  await page.evaluate(() => window.__game.buyRangeUpgrade('greens'));
  st = await state(page); check(st.placing === 'greens' && !st.owned.includes('greens'), 'Target greens: in hand, not owned yet');
  await look(page, await homePt(page, 35, 70), 0.08); await settle(page, 600);
  await hover(page, await homePt(page, 120, 100)); v = await verdict(page); check(!!v?.why, `the greens off the range are refused (${v?.why})`); await shot(page, '10-greens-ghost-off-range-8pct');
  await hover(page, await homePt(page, 35, 70)); v = await verdict(page); check(v?.why === '', 'the greens over the range may be built'); await shot(page, '11-greens-ghost-on-range-8pct');
  await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(500);
  st = await state(page); check(st.owned.includes('greens') && st.placing === null, 'the click builds the target greens'); await settle(page); await shot(page, '12-greens-placed-8pct');

  // Esc puts a build in hand down: nothing built, nothing paid
  const m0 = (await state(page)).money;
  await page.evaluate(() => window.__game.buyRangeUpgrade('teeturf')); await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  st = await state(page); check(st.placing === null && !st.owned.includes('teeturf') && st.money === m0, 'Esc puts the tee turf down: nothing built or paid');

  // the rail: Cart paths & roads above Facilities, its flyout
  const order = await page.evaluate(() => [...document.querySelectorAll('[data-testid="rail"] [data-rail]')].map(b => b.getAttribute('data-rail')));
  console.log('  rail', order.join(' '));
  check(order.indexOf('paths') > order.indexOf('course') && order.indexOf('paths') === order.indexOf('facilities') - 1, 'Cart paths & roads sits right above Facilities');
  await page.click('[data-rail="paths"]'); await page.waitForTimeout(400); await shot(page, '13-rail-cart-paths-and-roads-flyout');
  const rows = await page.evaluate(() => [...document.querySelectorAll('[data-flyout-col="0"] [data-key]')].map(b => `${b.textContent}${b.getAttribute('aria-disabled') ? ' (locked)' : ''}`));
  console.log('  flyout', rows.join(' | ')); check(rows.length === 2, 'its flyout: the cart paths and the roads');
  const roads = await page.$('[data-flyout-col="0"] [data-key="roads"]'); if (roads) { await roads.hover(); await roads.click(); await page.waitForTimeout(400); await shot(page, '14-rail-roads-open'); }
  const roadLock = await page.evaluate(() => window.__game.toolLock('road')); check(roadLock === null, `the road tool is open from the start (${roadLock})`);
  await ctx.close();
} finally { await browser.close(); }
console.log(bad ? `${bad} check(s) failed` : 'all checks passed');
process.exit(bad ? 1 : 0);
