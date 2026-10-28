// T228 (#661): in-game shots of the concept's streets: zebra crossings at town junctions, white edge lines along town roads, and car parks that
// show their cars. The grown town (?fixture=range20) is gravel, as towns grow: the shots upgrade the roads round its busiest junction to streets
// (the Upgrade tool's step, gravel -> street) and look at the junction and a street at 30% and 15%; a town car park (the range's, with its
// golfers' cars, and a public car park lot when the town has one); the club's car park on a busy everyday day (?start=town&golfers=60 at 11:00,
// T208) at 30% and 15%; and a sheet of the after shots beside the owner's concept picture.
//   node scripts/dev/street-shots.mjs --base http://127.0.0.1:5187/ --out E:/ClaudeTemp/T228 --tag before|after [--only town,club,sheet]
// Needs a dev server (vite) on --base. One headless Edge, closed when done; a fresh profile, so each start is a new game.
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://127.0.0.1:5187/'), out = opt('out', 'output/street-shots'), tag = opt('tag', 'after');
const only = new Set(opt('only', 'town,club,sheet').split(','));
const W = 1280, H = 800;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
/** wait until no chunk bake is in flight for a second (at most 60 s) */
const settle = async (page, ms = 1200) => {
  await page.waitForTimeout(ms);
  await page.evaluate(() => { window.__calm = 0; });
  await page.waitForFunction(() => { const g = window.__game; window.__calm = g.ground.busy === 0 && g.lotsPending === 0 ? window.__calm + 1 : 0; return window.__calm > 20; }, null, { timeout: 60000, polling: 50 }).catch(() => console.log('  (settle timed out)'));
  await page.waitForTimeout(400);
};
const shot = async (page, name) => {
  const file = join(out, `${name}-${tag}.jpg`);
  await sharp(await page.screenshot({ type: 'png' })).jpeg({ quality: 90, mozjpeg: true }).toFile(file);
  console.log(file); return file;
};
/** a fresh page on `url`, loaded, the UI hidden, broad day, no baking ahead; the game runs at speed 1 unless paused later */
const open = async url => {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  page.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 300)); });
  await page.goto(url);
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 240000 });
  await page.addStyleTag({ content: '* { visibility: hidden !important } canvas { visibility: visible !important }' });
  await page.evaluate(() => { const g = window.__game; g.prebake = () => {}; g.setShowGrid?.(false); window.__night = 0; g.nightAmount = () => window.__night; });
  await page.waitForFunction(() => window.__game.lotsPending === 0, null, { timeout: 60000 }).catch(() => {});
  return { page, ctx };
};
const look = (page, x, y, z) => page.evaluate(([x, y, z]) => { const g = window.__game; g.camEase = null; g.lookAt(x, y, z); }, [x, y, z]);
/** the town clock moved to a minute of the day (as the bench's scenes), then `secs` of real time for the cars to come */
const clockTo = async (page, minute, secs) => {
  await page.evaluate(async m => { const g = window.__game, { jumpTo } = await import('/src/game/sim/townclock.ts'), T = g.traffic; g.setSpeed(1); T.setTownClock(jumpTo(T.town, T.simTime(performance.now()), m, T.town.rate)); }, minute);
  await page.waitForTimeout(secs * 1000);
};
const report = { tag };
const files = {};
try {
  if (only.has('town') || only.has('sheet')) {
    const { page, ctx } = await open(`${base}?fixture=range20`);
    // ---- the busiest town junction (the most town nodes of 3+ arms within 40 tiles), its roads within 34 tiles upgraded gravel -> street
    const town = await page.evaluate(async () => {
      const g = window.__game, net = await import('/src/game/network.ts');
      const nodes = [...g.net.nodes.values()].filter(n => n.segs.length >= 3 && n.segs.every(s => s.cls.id === 'gravel'));
      let best = null, bn = -1;
      for (const n of nodes) { let k = 0; for (const m of nodes) if (Math.abs(m.x - n.x) + Math.abs(m.y - n.y) < 40) k++; if (k > bn) { bn = k; best = n; } }
      if (!best) return null;
      const R = 34, legs = [];
      for (const s of g.net.segs) if (s.cls.id === 'gravel' && Math.hypot((s.a.x + s.b.x) / 2 - best.x, (s.a.y + s.b.y) / 2 - best.y) < R) legs.push(s);
      for (const s of legs) g.edit.addLegs([{ a: { x: s.a.x, y: s.a.y }, b: { x: s.b.x, y: s.b.y } }], net.classOf('street'), s.style, [s.kind], true);
      g.commitNetwork();
      // a street: the middle of the longest upgraded arm out of the junction
      const arm = best.segs.map(s => (s.a === best ? s.b : s.a)).map(o => ({ o, L: Math.hypot(o.x - best.x, o.y - best.y) })).sort((a, b) => b.L - a.L)[0];
      return { x: best.x, y: best.y, arms: best.segs.length, upgraded: legs.length, street: arm ? { x: (best.x + arm.o.x) / 2, y: (best.y + arm.o.y) / 2 } : null };
    });
    report.town = town; console.log('town', JSON.stringify(town));
    await page.evaluate(() => window.__game.setSpeed(0));
    if (town) {
      for (const z of [0.3, 0.15]) { await look(page, town.x, town.y, z); await settle(page, 2500); (files[`junction${Math.round(z * 100)}`] = await shot(page, `junction-${Math.round(z * 100)}pct`)); }
      if (town.street) for (const z of [0.3, 0.15]) { await look(page, town.street.x, town.street.y, z); await settle(page); (files[`street${Math.round(z * 100)}`] = await shot(page, `street-${Math.round(z * 100)}pct`)); }
    }
    // ---- the town's car parks after the morning's golfers came: the range's car park (P n/44) and a public car park lot
    await clockTo(page, 9 * 60, 20);
    const parks = await page.evaluate(async () => {
      const g = window.__game, { isCarPark } = await import('/src/game/lots/compose.ts');
      const d = g.parkDefs[0], lot = [...g.traffic.lots.values()].find(l => isCarPark(l));
      return { range: d ? { x: d.x + d.w / 2, y: d.y + d.h / 2, bays: g.parkBuilt[0]?.bays.length, worker: g.traffic.parks.find(p => p.id === d.id)?.parked ?? 0, range: g.range.sim.parked(false) } : null,
        lot: lot ? { x: lot.o.x + lot.u.x * lot.w / 2 + lot.n.x * lot.d / 2, y: lot.o.y + lot.u.y * lot.w / 2 + lot.n.y * lot.d / 2, key: lot.key } : null };
    });
    report.parks = parks; console.log('parks', JSON.stringify(parks));
    await page.evaluate(() => window.__game.setSpeed(0));
    if (parks.range) for (const z of [0.3, 0.15]) { await look(page, parks.range.x, parks.range.y, z); await settle(page); (files[`rangepark${Math.round(z * 100)}`] = await shot(page, `range-carpark-${Math.round(z * 100)}pct`)); }
    if (parks.lot) for (const z of [0.3, 0.15]) { await look(page, parks.lot.x, parks.lot.y, z); await settle(page); (files[`lotpark${Math.round(z * 100)}`] = await shot(page, `town-carpark-lot-${Math.round(z * 100)}pct`)); }
    await ctx.close();
  }
  // ---- the club's car park on a busy everyday day (T208: 60 visitors, 11:00)
  if (only.has('club') || only.has('sheet')) {
    const { page, ctx } = await open(`${base}?start=town&golfers=60`);
    await clockTo(page, 11 * 60, 15);
    const club = await page.evaluate(() => {
      const g = window.__game, pk = g.dayPark, k = g.parkBuilt.indexOf(pk), d = k >= 0 ? g.parkDefs[k] : null;
      return d ? { x: d.x + d.w / 2, y: d.y + d.h / 2, bays: pk.bays.length, parked: g.dayPlay ? g.dayPlay.view.parkedNow(g.dayMinute) : 0 } : null;
    });
    report.club = club; console.log('club', JSON.stringify(club));
    await page.evaluate(() => window.__game.setSpeed(0));
    if (club) for (const z of [0.3, 0.15]) { await look(page, club.x, club.y, z); await settle(page); (files[`club${Math.round(z * 100)}`] = await shot(page, `club-carpark-${Math.round(z * 100)}pct`)); }
    await ctx.close();
  }
  // ---- the sheet: the junction, the street and the club's car park at 30%, each beside the concept's streets
  if (only.has('sheet') && files.junction30) {
    const h = 380, gap = 8, lab = 26;
    const crop = await sharp('docs/art/concept/maple-falls-concept.webp').extract({ left: 620, top: 300, width: 700, height: 420 }).png().toBuffer();
    const before = n => { const f = join(out, `${n}-before.jpg`); return existsSync(f) ? f : null; };
    const row = async cells => {
      cells = cells.filter(c => c[0]);
      const bufs = await Promise.all(cells.map(([f]) => sharp(f).resize({ height: h }).png().toBuffer({ resolveWithObject: true })));
      const Wd = bufs.reduce((s, b) => s + b.info.width, 0) + gap * (bufs.length - 1);
      let x = 0; const comp = [];
      const label = Buffer.from(`<svg width="${Wd}" height="${lab}" xmlns="http://www.w3.org/2000/svg">${bufs.map((b, i) => { const t = `<text x="${x + b.info.width / 2}" y="18" font-family="Arial" font-size="16" text-anchor="middle" fill="#fff">${cells[i][1]}</text>`; x += b.info.width + gap; return t; }).join('')}</svg>`);
      comp.push({ input: label, left: 0, top: 0 }); x = 0;
      for (const b of bufs) { comp.push({ input: b.data, left: x, top: lab }); x += b.info.width + gap; }
      return { buf: await sharp({ create: { width: Wd, height: h + lab, channels: 3, background: '#111' } }).composite(comp).png().toBuffer(), w: Wd, h: h + lab };
    };
    const rows = [
      await row([[before('junction-30pct'), 'junction 30%, before'], [files.junction30, `junction 30%, ${tag}`], [crop, 'the concept']]),
      await row([[before('street-30pct'), 'street 30%, before'], [files.street30, `street 30%, ${tag}`], [crop, 'the concept']]),
      ...(files.club30 ? [await row([[before('club-carpark-30pct'), 'club car park 30%, before'], [files.club30, `club car park 30%, ${tag}`], [crop, 'the concept']])] : []),
      ...(files.rangepark30 ? [await row([[before('range-carpark-30pct'), 'range car park 30%, before'], [files.rangepark30, `range car park 30%, ${tag}`], [crop, 'the concept']])] : []),
    ];
    const Wd = Math.max(...rows.map(r => r.w)), Hd = rows.reduce((s, r) => s + r.h + gap, -gap);
    let y = 0; const comp = []; for (const r of rows) { comp.push({ input: r.buf, left: 0, top: y }); y += r.h + gap; }
    const file = join(out, `sheet-streets-vs-concept-${tag}.jpg`);
    await sharp({ create: { width: Wd, height: Hd, channels: 3, background: '#111' } }).composite(comp).jpeg({ quality: 88, mozjpeg: true }).toFile(file);
    console.log(file);
  }
  writeFileSync(join(out, `shots-${tag}.json`), JSON.stringify(report, null, 2));
} finally { await browser.close(); }
