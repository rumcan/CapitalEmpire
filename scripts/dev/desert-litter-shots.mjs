// T384 (#1040): the same desert town before (?litter=leaves on the dev server: the autumn leaves in the desert, as it was) and after (the desert's litter: sand drifts, pebbles, dry brush, tumbleweed tufts) at the zooms the owner looks at, 30% and
// 15%: a street (the road's gutters and kerbs, the sidewalks, the yards, the roofs), a house's roof close, the open desert, a road. The town is the grown fixture (?fixture=range20) in the desert theme (&desert=on); each view is taken in
// both looks from the same camera, and laid side by side as <view>-before-vs-after.png. Also checks the game's state (the theme is on, the leaf density is the player's, not 0 in the desert) and exits 1 on a failed check.
//   node scripts/dev/desert-litter-shots.mjs --base http://localhost:5187/ --out E:/ClaudeTemp/T384 [--fixture range20] [--autumn 1]
// --autumn 1 also takes the street in the autumn theme (&desert=off), to show its leaves are as they were. Needs a dev server (vite) on --base. One headless Edge, closed when done; saving is off.
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://localhost:5187/'), out = opt('out', 'E:/ClaudeTemp/T384'), fixture = opt('fixture', 'range20'), autumn = opt('autumn', '0') === '1';
const W = 1440, H = 900, UI_OFF = '* { visibility: hidden !important } canvas { visibility: visible !important }';
mkdirSync(out, { recursive: true });
let bad = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) bad++; };
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const settle = async (page, ms = 1200) => {
  await page.waitForTimeout(ms);
  await page.evaluate(() => { window.__calm = 0; });
  await page.waitForFunction(() => { const g = window.__game; window.__calm = g.ground.busy === 0 ? window.__calm + 1 : 0; return window.__calm > 30; }, null, { timeout: 240000, polling: 50 }).catch(() => console.log('  (settle timed out)'));
  await page.waitForTimeout(500);
};
const side = async (a, b, file) => {
  const A = await sharp(a).resize({ height: 640 }).toBuffer(), B = await sharp(b).resize({ height: 640 }).toBuffer(), ma = await sharp(A).metadata(), mb = await sharp(B).metadata();
  await sharp({ create: { width: ma.width + mb.width + 24, height: 640, channels: 3, background: '#0b1220' } }).composite([{ input: A, left: 0, top: 0 }, { input: B, left: ma.width + 24, top: 0 }]).png().toFile(file);
  console.log('  ' + file);
};
/** a page on the fixture in a look, the ground baked once the theme is set; the views' camera points from the town itself */
async function open(look) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('[pageerror]', e.message); bad++; });
  page.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 300)); });
  await page.route('**/*', r => { const x = r.request(); return x.method() !== 'GET' && x.method() !== 'HEAD' ? r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }) : r.continue(); });
  await page.goto(`${base}?fixture=${fixture}&seed=2&${look}`, { waitUntil: 'domcontentloaded', timeout: 240000 });
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 400000 });
  await page.evaluate(() => { const g = window.__game; g.prebake = () => {}; g.setSpeed(0); window.__night = 0; g.nightAmount = () => 0; g.closeWho?.('Jack Burns', 2); g.closeWelcome?.(false); });
  return { ctx, page };
}
/** the camera points: the densest cluster of built lots (a street scene), a second lot beside it (a roof), a road's middle, and open ground well away from every lot */
const points = page => page.evaluate(() => {
  const g = window.__game, lots = [...g.traffic.lots.values()].filter(l => l.level > 0 && l.o && l.u && l.n).map(l => ({ x: l.o[0] + l.u[0] * l.w / 2 + l.n[0] * l.d / 2, y: l.o[1] + l.u[1] * l.w / 2 + l.n[1] * l.d / 2 }));
  if (!lots.length) return null;
  const near = (p, r) => lots.filter(q => Math.hypot(q.x - p.x, q.y - p.y) < r).length, best = lots.map(p => ({ p, n: near(p, 50) })).sort((a, b) => b.n - a.n)[0].p;
  const second = lots.filter(q => Math.hypot(q.x - best.x, q.y - best.y) > 14).sort((a, b) => Math.hypot(a.x - best.x, a.y - best.y) - Math.hypot(b.x - best.x, b.y - best.y))[0] ?? best;
  const segs = [...g.net.segs].map(s => ({ x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2, len: Math.hypot(s.a.x - s.b.x, s.a.y - s.b.y), d: Math.hypot((s.a.x + s.b.x) / 2 - best.x, (s.a.y + s.b.y) / 2 - best.y) })).filter(s => s.len > 12).sort((a, b) => a.d - b.d)[0] ?? best;
  const MAP = 1024; let open = { x: 512, y: 512, d: 0 };
  for (let y = 64; y < MAP - 64; y += 32) for (let x = 64; x < MAP - 64; x += 32) { let d = 1e9; for (const q of lots) d = Math.min(d, Math.hypot(q.x - x, q.y - y)); for (const s of g.net.segs) d = Math.min(d, Math.hypot((s.a.x + s.b.x) / 2 - x, (s.a.y + s.b.y) / 2 - y)); if (d > open.d && g.terrain[y * MAP + x] <= 1) open = { x, y, d }; }
  return { street: best, roof: second, road: { x: segs.x, y: segs.y }, open: { x: open.x, y: open.y }, lots: lots.length };
});
const VIEWS = [['street30', 'street', 0.3], ['street15', 'street', 0.15], ['roof30', 'roof', 0.3], ['road30', 'road', 0.3], ['open30', 'open', 0.3], ['open15', 'open', 0.15]];
try {
  const files = { before: {}, after: {} };
  let pts = null;
  for (const [mode, look] of [['before', 'desert=on&litter=leaves'], ['after', 'desert=on']]) {
    console.log(` -- ${mode}`);
    const { ctx, page } = await open(look);
    const st = await page.evaluate(() => { const g = window.__game; return { desert: g.desertTheme, density: g.leafDensity, lots: g.traffic.lots.size }; });
    check(st.desert === true && st.density === 1, `${mode}: the desert theme is on, the litter density is the player's (${st.density})`);
    pts ??= await points(page); check(!!pts && pts.lots > 5, `the town has ${pts?.lots} built lots to look at`);
    for (const [name, key, z] of VIEWS) {
      const p = pts[key]; await page.evaluate(([x, y, z]) => { const g = window.__game; g.camEase = null; g.lookAt(x, y, z); g.emit(); }, [p.x, p.y, z]);
      await settle(page, 1500);
      const f = join(out, `${name}-${mode}.png`), off = await page.addStyleTag({ content: UI_OFF }); await page.screenshot({ path: f }); await off.evaluate(e => e.remove()); files[mode][name] = f; console.log('  ' + f);
    }
    await ctx.close();
  }
  for (const [name] of VIEWS) await side(files.before[name], files.after[name], join(out, `${name}-before-vs-after.png`));
  if (autumn) {
    const { ctx, page } = await open('desert=off');
    const p = pts.street; await page.evaluate(([x, y]) => { const g = window.__game; g.camEase = null; g.lookAt(x, y, 0.3); g.emit(); }, [p.x, p.y]); await settle(page, 1500);
    const f = join(out, 'street30-autumn.png'), off = await page.addStyleTag({ content: UI_OFF }); await page.screenshot({ path: f }); await off.evaluate(e => e.remove()); console.log('  ' + f);
    await ctx.close();
  }
} finally { await browser.close(); }
console.log(bad ? `\n${bad} problem(s)` : '\nall checks passed');
process.exit(bad ? 1 : 0);
