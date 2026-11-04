// T324 (#924): the street lamps' light pools on the road at night, one shot per street heading (the world's X and Y streets: the iso
// diagonals; the world's diagonal streets: screen-straight) and the boulevard with the most lamps, each lamp's head ground point (the point
// straight below its lantern, lamp-pool.ts lampGround) ringed in cyan, so a pool off its lamp shows.
//   node scripts/dev/lamp-pool-shots.mjs --base http://127.0.0.1:5187/ --out F:/ClaudeTemp/T324/before [--headed]
// Needs a dev server (vite) on --base. One Edge (headless; --headed: a headed window off-screen, never in front), closed when done.
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://127.0.0.1:5187/'), out = opt('out', 'output/lamp-pools'), headed = args.includes('--headed');
const W = 1280, H = 800, Z = 0.3;
mkdirSync(out, { recursive: true });
const gpu = ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'];
const browser = await chromium.launch({ channel: 'msedge', headless: !headed, args: headed ? [...gpu, '--window-position=-32000,-32000', '--window-size=1366,860'] : gpu });
const settle = async (page, ms = 1500) => {
  await page.waitForTimeout(ms);
  await page.evaluate(() => { window.__calm = 0; });
  await page.waitForFunction(() => { const g = window.__game; window.__calm = g.ground.busy === 0 && !g.lotsPending ? window.__calm + 1 : 0; return window.__calm > 20; }, null, { timeout: 40000, polling: 50 }).catch(() => console.log('  (settle timed out)'));
  await page.waitForTimeout(300);
};
try {
for (const scene of ['town', 'grid', 'diag']) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.goto(scene === 'town' ? `${base}?start=town&stamp=0` : base, { timeout: 240000 });
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 180000 });
  await page.addStyleTag({ content: '* { visibility: hidden !important } canvas { visibility: visible !important }' });
  // the debug street grid (engine.ts stageLots) along the world's axes (the iso diagonals) or turned 45° (screen-straight streets)
  if (scene !== 'town') await page.evaluate(diag => { const g = window.__game; g.prebake = () => {}; g.stageLots({ cols: 2, rows: 2, uses: [1], level: 2, decline: 0, seed: 7, diag }); }, scene === 'diag');
  // the night by hand, the game paused, no baking ahead; each lamp's heading (its nearest segment's, folded to 0..180°) and its head point
  const lamps = await page.evaluate(async () => {
    const g = window.__game; g.prebake = () => {}; g.setSpeed(0); g.nightAmount = () => 1;
    const head = await import('/src/game/lamp-pool.ts').then(m => p => m.lampHeadOf(p)).catch(() => p => ({ x: (p.x0 + p.x1) / 2, y: (p.y0 + p.y1) / 2 }));
    const segs = [...g.net.segs.values()], out = [];
    for (const p of g.lampProps) {
      const c = { x: (p.x0 + p.x1) / 2, y: (p.y0 + p.y1) / 2 }; let best = null, bd = 6;
      for (const s of segs) {
        const dx = s.b.x - s.a.x, dy = s.b.y - s.a.y, L = Math.hypot(dx, dy); if (L < 1e-6) continue;
        const t = Math.max(0, Math.min(L, ((c.x - s.a.x) * dx + (c.y - s.a.y) * dy) / L)), d = Math.hypot(s.a.x + dx * t / L - c.x, s.a.y + dy * t / L - c.y);
        if (d < bd) { bd = d; best = { ang: ((Math.atan2(dy, dx) * 180 / Math.PI) + 360) % 180, median: s.cls.median > 0 }; }
      }
      if (best) out.push({ ...head(p), ...best });
    }
    return out;
  });
  console.log(scene, 'lamps', lamps.length);
  // the four street orientations (world X: 0°, world Y: 90° are the iso diagonals; 45° and 135° are screen-straight) and the boulevard
  const groups = scene === 'town' ? [['boulevard', l => l.median]] : scene === 'grid' ? [['heading-000-iso', l => Math.min(l.ang, 180 - l.ang) < 8], ['heading-090-iso', l => Math.abs(l.ang - 90) < 8]] : [['heading-045-straight', l => Math.abs(l.ang - 45) < 8], ['heading-135-straight', l => Math.abs(l.ang - 135) < 8]];
  const place = (x, y) => page.evaluate(([X, Y, z]) => { const g = window.__game; g.camEase = null; g.cam.z = z; g.cam.X = X; g.cam.Y = Y; }, [(x - y) * 64, (x + y) * 32, Z]);
  for (const [name, test] of groups) {
    const ls = lamps.filter(test); if (!ls.length) { console.log(name, 'none'); continue; }
    let c = ls[0], cn = -1; for (const l of ls) { let n = 0; for (const m of ls) if (Math.hypot(m.x - l.x, m.y - l.y) < 14) n++; if (n > cn) { cn = n; c = l; } }
    await place(c.x, c.y); await settle(page);
    const png = await page.screenshot({ type: 'png' });
    // ring each lamp's head ground point (cyan) on the shot
    const cX = (c.x - c.y) * 64, cY = (c.x + c.y) * 32, rings = lamps.map(l => ({ sx: ((l.x - l.y) * 64 - cX) * Z + W / 2, sy: ((l.x + l.y) * 32 - cY) * Z + H / 2 })).filter(r => r.sx > -20 && r.sx < W + 20 && r.sy > -20 && r.sy < H + 20);
    const svg = Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${rings.map(r => `<ellipse cx="${r.sx.toFixed(1)}" cy="${r.sy.toFixed(1)}" rx="7" ry="3.5" fill="none" stroke="#0ff" stroke-width="1.5"/>`).join('')}<text x="12" y="24" font-family="Arial" font-size="18" fill="#fff">${name} (${ls.length} lamps)</text></svg>`);
    const file = join(out, `${name}.jpg`);
    await sharp(png).composite([{ input: svg, left: 0, top: 0 }]).jpeg({ quality: 86, mozjpeg: true }).toFile(file);
    await sharp(png).jpeg({ quality: 86, mozjpeg: true }).toFile(join(out, `${name}-plain.jpg`));
    console.log(file, `centre ${c.x.toFixed(1)},${c.y.toFixed(1)}`);
  }
  await ctx.close();
}
} finally { await browser.close(); }
