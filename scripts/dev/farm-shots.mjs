// T259 (#759): in-game shots of the farms: a farm at 30%, 15% and 8% before (the farm model 1, T005's farmstead by the road, as main draws it)
// and after (model 2: the farmstead set back on its lane with the windbreak, the fields by the month), the same farm in spring (ploughed),
// summer (young corn) and autumn (ripe corn), an orchard, and the lane with its windbreak.
//   node scripts/dev/farm-shots.mjs --base http://127.0.0.1:5186/ --out E:/ClaudeTemp/T259 [--probe (the farms found, no shots)] [--start town]
// Needs a dev server (vite) on --base. One headless Edge, closed when done; a fresh profile, so each start is a new game (?seed= keeps the map).
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://127.0.0.1:5186/'), out = opt('out', 'output/farms'), probe = args.includes('--probe'), start = opt('start', 'range'), seed = opt('seed', '');
const W = 1280, H = 800;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
/** wait until no chunk bake is in flight and no farm waits to compose, for a second (at most 40 s) */
const settle = async (page, ms = 900) => {
  await page.waitForTimeout(ms);
  await page.evaluate(() => { window.__calm = 0; });
  await page.waitForFunction(() => { const g = window.__game; window.__calm = g.ground.busy === 0 && g.farmsPending === 0 ? window.__calm + 1 : 0; return window.__calm > 20; }, null, { timeout: 40000, polling: 50 }).catch(() => console.log('  (settle timed out)'));
  await page.waitForTimeout(300);
};
const shot = async (page, name) => {
  const file = join(out, `${name}.jpg`);
  await sharp(await page.screenshot({ type: 'png' })).jpeg({ quality: 86, mozjpeg: true }).toFile(file);
  console.log(file); return file;
};
const report = {};
try {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  page.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 300)); });
  await page.goto(`${base}?start=${start}&stamp=0${seed ? '&seed=' + seed : ''}`);
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 180000 });
  await page.addStyleTag({ content: '* { visibility: hidden !important } canvas { visibility: visible !important }' });
  // no baking ahead, the game paused, the dev grid off, broad day
  await page.evaluate(() => { const g = window.__game; g.prebake = () => {}; g.setSpeed(0); g.setShowGrid(false); window.__night = 0; g.nightAmount = () => window.__night; });
  await page.waitForFunction(() => window.__game.farmsPending === 0, null, { timeout: 60000 }).catch(() => console.log('  (farms still composing)'));
  // the farms: each with its parcel, its model 2 layout's windbreak and orchard, and its centre on screen
  const farms = await page.evaluate(() => {
    const g = window.__game, iso = (x, y) => ({ X: (x - y) * 64, Y: (x + y) * 32 }), out = [];
    for (const [k, f] of g.farmMap.farms) {
      const p = f.p, at = (a, b) => ({ x: p.o.x + p.u.x * a + p.n.x * b, y: p.o.y + p.u.y * a + p.n.y * b });
      const c = at(p.w / 2, p.d / 2), props = g.farmProps.get(k) ?? [], lib = window.__lib ?? null;
      out.push({ key: k, w: p.w, d: p.d, ...iso(c.x, c.y), cx: c.x, cy: c.y, u: p.u, n: p.n, props: props.length, labels: (g.farmLabels.get(k) ?? []).map(l => l.text) });
    }
    return out;
  });
  console.log('farms', farms.length); report.farms = farms.length;
  const withOrchard = farms.filter(f => f.labels.some(t => /orchard/.test(t))), withWind = farms.filter(f => f.labels.some(t => /windbreak/.test(t)));
  console.log('orchards', withOrchard.length, 'windbreaks', withWind.length);
  if (probe) { console.log(JSON.stringify(farms.slice(0, 12), null, 1)); throw new Error('probe done'); }
  const place = (p, z) => page.evaluate(([X, Y, z]) => { const g = window.__game; g.camEase = null; g.cam.z = z; g.cam.X = X; g.cam.Y = Y; }, [p.X, p.Y, z]);
  const setModel = m => page.evaluate(m => window.__game.setFarmModel(m), m);
  const setMonth = m => page.evaluate(m => window.__game.setFarmMonth(m), m);
  // the farm shown: the biggest with an orchard and a windbreak (else the biggest)
  const both = farms.filter(f => withOrchard.includes(f) && withWind.includes(f)).sort((a, b) => b.w * b.d - a.w * a.d);
  const farm = both[0] ?? farms.sort((a, b) => b.w * b.d - a.w * a.d)[0];
  report.farm = farm;
  // a point at (a, b) of the farm's frame (tiles from its front-left corner) on screen
  const pt = (f, a, b) => { const x = f.cx + f.u.x * (a - f.w / 2) + f.n.x * (b - f.d / 2), y = f.cy + f.u.y * (a - f.w / 2) + f.n.y * (b - f.d / 2); return { X: (x - y) * 64, Y: (x + y) * 32 }; };
  // (--look: the look check alone: the farm at 30% and 15% in April, July, October and November, model 2)
  if (args.includes('--look')) {
    await setModel(2);
    for (const [name, m] of [['apr', 3], ['jul', 6], ['oct', 9], ['nov', 10]]) { await setMonth(m); for (const z of [0.3, 0.15]) { await place(z === 0.3 ? pt(farm, farm.w / 2, farm.d * 0.3) : farm, z); await settle(page); await shot(page, `look-${Math.round(z * 100)}pct-${name}`); } }
    // each crop state's field close up (30%), on whichever farm has one in that month
    for (const [st, m] of [['young', 6], ['ripe', 9], ['stubble', 10], ['ploughed', 3]]) {
      await setMonth(m); await settle(page, 300);
      const at = await page.evaluate(st => { for (const ls of window.__game.farmLabels.values()) for (const l of ls) if (l.text.includes(st)) return { x: l.p.x, y: l.p.y }; return null; }, st);
      if (at) { await place({ X: (at.x - at.y) * 64, Y: (at.x + at.y) * 32 }, 0.3); await settle(page); await shot(page, `look-close-${st}`); }
    }
    throw new Error('probe done');
  }
  // ---- before: model 1 (main's farms) at 30%, 15% and 8%
  await setModel(1); await setMonth(9);
  for (const z of [0.3, 0.15, 0.08]) { await place(z === 0.3 ? pt(farm, farm.w / 2, 18) : farm, z); await settle(page); await shot(page, `farm-${Math.round(z * 100)}pct-before`); }
  // ---- after: model 2 in spring (April: ploughed), summer (July: young corn) and autumn (October: ripe corn), at 30%, 15% and 8%
  await setModel(2);
  for (const [name, m] of [['spring', 3], ['summer', 6], ['autumn', 9]]) {
    await setMonth(m);
    for (const z of [0.3, 0.15, 0.08]) { await place(z === 0.3 ? pt(farm, farm.w / 2, farm.d * 0.3) : farm, z); await settle(page); await shot(page, `farm-${Math.round(z * 100)}pct-${name}`); }
  }
  // ---- November (stubble) at 15%
  await setMonth(10); await place(farm, 0.15); await settle(page); await shot(page, 'farm-15pct-november');
  // ---- an orchard at 30% (summer and autumn), and the lane with its windbreak at 30% and 15%
  const labs = await page.evaluate(k => (window.__game.farmLabels.get(k) ?? []).map(l => ({ text: l.text, x: l.p.x, y: l.p.y })), farm.key);
  report.labels = labs;
  const orch = labs.find(l => /orchard/.test(l.text)), lane = labs.find(l => /lane/.test(l.text));
  if (orch) for (const [name, m] of [['summer', 6], ['autumn', 9], ['winter', 0]]) { await setMonth(m); await place({ X: (orch.x - orch.y) * 64 + 200, Y: (orch.x + orch.y) * 32 + 150 }, 0.3); await settle(page); await shot(page, `orchard-30pct-${name}`); }
  await setMonth(9);
  if (lane) for (const z of [0.3, 0.15]) { await place({ X: (lane.x - lane.y) * 64, Y: (lane.x + lane.y) * 32 }, z); await settle(page); await shot(page, `lane-${Math.round(z * 100)}pct`); }
  // a second farm with a windbreak on both sides (if there is one), at 15%
  writeFileSync(join(out, 'farm-shots.json'), JSON.stringify(report, null, 1));
} catch (e) { if (!/probe done/.test(String(e))) console.log('[error]', e); }
finally { await browser.close(); }
