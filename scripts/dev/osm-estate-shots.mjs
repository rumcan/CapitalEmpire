// T354 (#996): a real golf estate in the game (Woodhill): its streets joined to the entry road and the house lots at the map's houses. A headless Edge on the dev server loads
// `?osmcourse=<id>` with the estate off (`?osmestate=0`, the course as it was) and on (the default for a residential estate), speeds the game up until some lots have sold and
// houses are going up, and shoots the same views of each: the whole land, the clubhouse and the entry road (the link that joins the estate's network), a stretch of the estate
// at 15% and the closest zoom (30%) over its busiest lots. Prints the numbers of the estate (lots by stage, the road network, the town's own lots) and checks them.
//   node scripts/dev/osm-estate-shots.mjs --base http://localhost:5201/ --out E:/ClaudeTemp/T354 [--course woodhill] [--wait 150] [--speed 20]
// Needs a dev server (vite) on --base. One headless Edge, closed when done; saving is off (?osmcourse= is a fixture-style start). Exits 1 on a failed check.
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://localhost:5201/'), out = opt('out', 'E:/ClaudeTemp/T354'), id = opt('course', 'woodhill'), waitS = Number(opt('wait', '150')), speed = Number(opt('speed', '20'));
const W = 1440, H = 900;
mkdirSync(out, { recursive: true });
const ONLY = opt('only', ''), BUILT_WANTED = Number(opt('built', '6'));
const VARIANTS = [{ key: 'before', q: '&osmestate=0', label: 'before (no estate: the course alone)' }, { key: 'after', q: '', label: 'after (the estate: streets joined to the entry road, lots at the houses)' }].filter(v => !ONLY || v.key === ONLY);
let bad = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) bad++; };
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const settle = async (page, ms = 900) => {
  await page.waitForTimeout(ms);
  await page.evaluate(() => { window.__calm = 0; });
  await page.waitForFunction(() => { const g = window.__game; window.__calm = g.ground.busy === 0 ? window.__calm + 1 : 0; return window.__calm > 30; }, null, { timeout: 240000, polling: 50 }).catch(() => console.log('  (settle timed out)'));
  await page.waitForTimeout(500);
};
const shot = async (page, name) => { const f = join(out, `${name}.png`); await page.screenshot({ path: f }); console.log('  ' + f); return f; };
// the tournament's results dialog the clock runs into: pick a card (it is not left until one is), then Back to the valley; the floating result panel is closed with its x
const dismiss = async page => {
  for (let k = 0; k < 4; k++) {
    const back = page.getByRole('button', { name: 'Back to the valley' });
    if (!(await back.count())) break;
    if (await back.first().isDisabled()) { const card = page.locator('button:has-text("Unlock"), button:has-text("Upgrade")').first(); if (await card.count()) await card.click({ timeout: 5000 }).catch(() => {}); await page.waitForTimeout(500); }
    if (!(await back.first().isDisabled())) { await back.first().click({ timeout: 5000 }).catch(() => {}); await page.waitForTimeout(700); }
  }
  await page.evaluate(() => { for (const b of document.querySelectorAll('button')) { const t = (b.getAttribute('aria-label') ?? b.textContent ?? '').trim(); if (/^(close|dismiss|×|x|✕)$/i.test(t) && b.closest('[class*="fixed"],[class*="absolute"]')) b.click(); } });
  await page.waitForTimeout(500);
};
// a picture of the map alone: every panel and dialog of the page hidden (visibility) while `fn` takes it, then shown again
const bare = async (page, fn) => {
  await page.evaluate(() => { const cv = document.querySelector('canvas'); window.__hid = []; for (let n = cv; n && n.parentElement && n !== document.body; n = n.parentElement) for (const sib of n.parentElement.children) if (sib !== n) { window.__hid.push([sib, sib.style.visibility]); sib.style.visibility = 'hidden'; } });
  await page.waitForTimeout(400);
  try { return await fn(); } finally { await page.evaluate(() => { for (const [el, v] of window.__hid ?? []) el.style.visibility = v; window.__hid = []; }); }
};
const look = (page, x, y, z) => page.evaluate(([x, y, z]) => { const g = window.__game; g.camEase = null; g.lookAt(x, y, z); g.emit(); }, [x, y, z]);
const frameOn = (page, pts, maxZ = 0.3) => page.evaluate(([pts, maxZ, W, H]) => {
  const g = window.__game, cx = pts.reduce((s, p) => s + p.x, 0) / pts.length, cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  const fits = z => { g.camEase = null; g.lookAt(cx, cy, z); return pts.every(p => { const s = g.screen(p.x, p.y), x = s.x / g.dpr, y = s.y / g.dpr; return x > 50 && x < W - 50 && y > 80 && y < H - 50; }); };
  let lo = 0.004, hi = maxZ; if (fits(hi)) { g.emit(); return hi; }
  for (let k = 0; k < 14; k++) { const m = (lo + hi) / 2; if (fits(m)) lo = m; else hi = m; }
  fits(lo); g.emit(); return lo;
}, [pts, maxZ, W, H]);
async function sideBySide(files, labels, name) {
  const h = 760, tiles = await Promise.all(files.map(async (f, i) => {
    const img = await sharp(f).resize({ height: h }).toBuffer(), m = await sharp(img).metadata();
    const cap = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${m.width}" height="34"><rect width="100%" height="100%" fill="#0b1220"/><text x="10" y="23" font-family="Segoe UI, Arial, sans-serif" font-size="18" fill="#e5e7eb">${labels[i].replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text></svg>`);
    return { img, w: m.width, cap };
  }));
  const total = tiles.reduce((s, t) => s + t.w, 0) + 12 * (tiles.length - 1);
  let left = 0; const comp = [];
  for (const t of tiles) { comp.push({ input: t.cap, left, top: 0 }, { input: t.img, left, top: 34 }); left += t.w + 12; }
  const f = join(out, `${name}.png`);
  await sharp({ create: { width: total, height: h + 34, channels: 3, background: '#0b1220' } }).composite(comp).png().toFile(f);
  console.log('  ' + f);
}

try {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const files = {}, numbers = {};
  for (const v of VARIANTS) {
    console.log(`\n-- ${id} ${v.key}`);
    const page = await ctx.newPage();
    page.on('pageerror', e => { console.log('[pageerror]', e.message); bad++; });
    page.on('console', m => { const t = m.text(); if (m.type() === 'error') console.log('[console]', t.slice(0, 300)); else if (/golf: the estate|estate/.test(t) && m.type() === 'log') console.log('[game]', t.slice(0, 500)); });
    await page.route('**/*', r => { const x = r.request(); return x.method() !== 'GET' && x.method() !== 'HEAD' ? r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }) : r.continue(); });
    await page.goto(`${base}?osmcourse=${id}${v.q}`, { waitUntil: 'domcontentloaded', timeout: 1200000 });
    await page.waitForFunction(() => window.__game?.ready, null, { timeout: 1200000 });
    await page.evaluate(() => { const g = window.__game; g.prebake = () => {}; g.setSpeed(0); window.__night = 0; g.nightAmount = () => window.__night; g.closeWho?.('Jack Burns', 2); g.closeWelcome?.(false); const p = g.golf.progress; if (p) { for (const k of ['who', 'welcome']) if (!p.seen.includes(k)) p.seen.push(k); if (p.tour) p.tour.off = true; } g.emit(); });
    const state = () => page.evaluate(() => {
      const g = window.__game, c = g.estateCard?.(), e = g.estateRt;
      return { card: c ? { total: c.total, sale: c.sale, sold: c.sold, building: c.building, built: c.built } : null, lots: (e?.lots ?? []).map(l => ({ x: l.o.x + (l.u.x * l.w + l.n.x * l.d) / 2, y: l.o.y + (l.u.y * l.w + l.n.y * l.d) / 2, st: l.st })), segs: g.net.segs.size, townLots: g.traffic.lots.size, townBuilt: g.traffic.built, money: g.money, osm: g.golf.osm?.id, course: g.golf.course, clubhouse: g.golf.clubhouse, ...(() => {
        // how the town's own lots sit on the club's land and against the estate's lots (bounding boxes: a lot's four corners)
        const box = l => { const c = [[0, 0], [l.w, 0], [l.w, l.d], [0, l.d]].map(([a, b]) => [l.o.x + l.u.x * a + l.n.x * b, l.o.y + l.u.y * a + l.n.y * b]); return [Math.min(...c.map(q => q[0])), Math.min(...c.map(q => q[1])), Math.max(...c.map(q => q[0])), Math.max(...c.map(q => q[1]))]; };
        const town = [...g.traffic.lots.values()].filter(v => v.o && v.w), inLand = town.filter(v => g.ownedAt(v.o.x + (v.u.x * v.w + v.n.x * v.d) / 2, v.o.y + (v.u.y * v.w + v.n.y * v.d) / 2));
        const tb = town.map(v => ({ v, b: box(v) })), over = (e?.lots ?? []).filter(l => { const b = box(l); return tb.some(t => t.v.level > 0 && t.b[0] < b[2] && t.b[2] > b[0] && t.b[1] < b[3] && t.b[3] > b[1]); }).length;
        return { townInLand: inLand.length, townBuiltInLand: inLand.filter(v => v.level > 0).length, estateOverTownBuilt: over };
      })() };
    });
    let s0 = await state();
    console.log('at the start', JSON.stringify({ card: s0.card, segs: s0.segs, townLots: s0.townLots }));
    check(s0.osm === id, `${v.key}: the game is on ${id}`);
    if (v.key === 'after') {
      check(!!s0.card && s0.card.total >= 5, `after: ${s0.card?.total} lots laid at the map's houses`);
      check(s0.card?.sale === s0.card?.total, 'after: every lot starts for sale');
    } else check(!s0.card || s0.card.total === 0, 'before: no lots');
    const add = (view, f) => { (files[view] ??= {})[v.key] = f; };
    // the views before the clock runs: the whole land, the clubhouse and the entry road, and the estate with its lots for sale
    const land = s0.course, corners = [{ x: land[0], y: land[1] }, { x: land[0] + land[2], y: land[1] }, { x: land[0], y: land[1] + land[3] }, { x: land[0] + land[2], y: land[1] + land[3] }];
    const zOver = await frameOn(page, corners, 0.3); console.log('  overview zoom', zOver.toFixed(4)); await settle(page, 1800);
    add('overview', await shot(page, `${id}-${v.key}-overview`));
    const ch = s0.clubhouse; await look(page, ch.x, ch.y, 0.09); await settle(page, 1500);
    add('clubhouse-9', await shot(page, `${id}-${v.key}-clubhouse-9`));
    // the busiest lots: the lot with most others within 40 tiles (the same place after the clock, when the houses are going up)
    let spot = { x: land[0] + land[2] * 0.6, y: land[1] + land[3] * 0.5 };
    if (v.key === 'after' && s0.lots.length) {
      let best = s0.lots[0], bn = -1;
      for (const a of s0.lots) { let n = 0; for (const b of s0.lots) if (Math.hypot(a.x - b.x, a.y - b.y) < 40) n++; if (n > bn || (n === bn && a.st > best.st)) { bn = n; best = a; } }
      spot = { x: best.x, y: best.y };
    }
    await look(page, spot.x, spot.y, 0.15); await settle(page, 1500);
    add('estate-15', await shot(page, `${id}-${v.key}-estate-15`));
    if (v.key === 'after') { await look(page, spot.x, spot.y, 0.3); await settle(page, 1500); add('estate-30', await shot(page, `${id}-${v.key}-estate-30`)); }
    // the estate's clock: speed up until a few houses are going up (the sold lots start them) or the time is out. The before game runs it a while too (the baseline of the console)
    const budget = v.key === 'after' ? waitS : Number(opt('beforeWait', '90'));
    await page.evaluate(sp => window.__game.setSpeed(sp), speed);
    const t0 = Date.now();
    while (Date.now() - t0 < budget * 1000) { await page.waitForTimeout(3000); await dismiss(page); /* (a tournament's results stop the clock until they are closed) */ const c = (await state()).card; if (v.key === 'after' && c && c.built >= BUILT_WANTED) break; }
    await page.evaluate(() => window.__game.setSpeed(0));
    await dismiss(page);
    const s1 = await state();
    console.log(`${v.key} after the clock`, JSON.stringify({ card: s1.card, money: s1.money, townLots: s1.townLots, townBuilt: s1.townBuilt }));
    if (v.key === 'after') {
      check(!!s1.card && s1.card.sold + s1.card.building + s1.card.built > 0, `after: lots sold (${s1.card?.sold} sold, ${s1.card?.building} building, ${s1.card?.built} built)`);
      // the houses: the lot nearest the spot that has gone furthest
      const far = l => Math.hypot(l.x - spot.x, l.y - spot.y), near = [...s1.lots].sort((p, q) => q.st - p.st || far(p) - far(q))[0];
      if (near && near.st >= 2) spot = { x: near.x, y: near.y };
      await dismiss(page);
      await look(page, spot.x, spot.y, 0.15); await settle(page, 1500); await dismiss(page);
      add('houses-15', await bare(page, () => shot(page, `${id}-${v.key}-houses-15`)));
      await look(page, spot.x, spot.y, 0.3); await settle(page, 1500); await dismiss(page);
      add('houses-30', await bare(page, () => shot(page, `${id}-${v.key}-houses-30`)));
    }
    numbers[v.key] = { card: s0.card, after: s1.card, segs: s0.segs, townLots: s0.townLots, townInLand: s0.townInLand, townBuilt: s1.townBuilt, townLotsAfter: s1.townLots, townBuiltInLand: s1.townBuiltInLand, estateOverTownBuilt: s1.estateOverTownBuilt };
    await page.close();
  }
  console.log('\nnumbers', JSON.stringify(numbers));
  const a = numbers.after, b = numbers.before;
  if (a && b) {
    check(a.segs > b.segs + 50, `the estate's streets are roads: ${b.segs} road pieces before, ${a.segs} after`);
    console.log(`  the town's own lots: ${b.townLots} before, ${a.townLots} after (built ${b.townBuilt} / ${a.townBuilt})`);
  }
  for (const [view, byVariant] of Object.entries(files)) {
    const keys = VARIANTS.map(v => v.key).filter(k => byVariant[k]);
    if (keys.length > 1) await sideBySide(keys.map(k => byVariant[k]), keys.map(k => VARIANTS.find(v => v.key === k).label), `${id}-${view}-compare`);
  }
} finally { await browser.close(); }
console.log(bad ? `\n${bad} check(s) FAILED` : '\nall checks passed');
process.exit(bad ? 1 : 0);
