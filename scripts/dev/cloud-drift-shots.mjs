// T379 (#1035; the owner, 2026-11-08: "clouds should move at x8 speed when you are on x1 and adjust accordingly for the rest"): the sun patches (the
// clouds, sun-patches.ts) drift with the game speed. Evidence for the clock's step (sun-patches.ts sunStep, which Engine.sunFrame adds each frame):
//   rates   the engine's own clock (window.__game.sunClock) read over real time at each game speed: paused, 1/40 ... 20x. The rate is in the old 1x rates
//           (before T379: 1 at 1x, the speed itself, and 1 again while paused); the same table is printed on lead/live and on this branch
//   strips  short strips of the same view (a boundary of the sun patches in the middle of the screen, 15%): 6 frames, each 0.5 s of real time after the last,
//           at game speed 1x and at 8x. The game is held paused and the clock is set frame by frame to what sunStep gives for that speed, so every strip is
//           exact (a screenshot takes longer than a frame); the patches' strength is at its top (200%) to show the edges
//   node scripts/dev/cloud-drift-shots.mjs --base http://127.0.0.1:5187/ --out E:/ClaudeTemp/T379 --tag after [--only rates,strips] [--step 0.5] [--zoom 0.15]
// Needs a dev server (vite) on --base. One headless Edge, closed when done; a fresh profile, so each start is a new game.
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://127.0.0.1:5187/'), out = opt('out', 'output/cloud-drift'), tag = opt('tag', 'after'), seed = opt('seed', '7');
const only = new Set(opt('only', 'rates,strips').split(',')), step = +opt('step', '0.5'), zoom = +opt('zoom', '0.15'), FRAMES = 6;
const W = 1280, H = 720, FW = 420, FH = Math.round(FW * H / W);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const settle = async (page, ms = 900) => {
  await page.waitForTimeout(ms);
  await page.evaluate(() => { window.__calm = 0; });
  await page.waitForFunction(() => { const g = window.__game; window.__calm = g.ground.busy === 0 ? window.__calm + 1 : 0; return window.__calm > 20; }, null, { timeout: 60000, polling: 50 }).catch(() => console.log('  (settle timed out)'));
  await page.waitForTimeout(300);
};
const label = (w, t) => Buffer.from(`<svg width="${w}" height="22" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="22" fill="#000" opacity="0.65"/><text x="6" y="16" font-family="Arial" font-size="13" fill="#fff">${t}</text></svg>`);
const report = { tag, zoom, step };
try {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => { try { localStorage.clear(); } catch { /* none */ } });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.route('**/*', r => { const x = r.request(); return x.method() !== 'GET' && x.method() !== 'HEAD' ? r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }) : r.continue(); });
  await page.goto(`${base}?start=town&seed=${seed}`, { timeout: 240000, waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 300000 });
  await page.evaluate(() => { const g = window.__game; g.prebake = () => {}; g.closeWelcome?.(false); window.__night = 0; g.nightAmount = () => window.__night; g.setSunLook({ on: true, strength: 2 }); g.emit(); });
  await page.addStyleTag({ content: '* { visibility: hidden !important } canvas { visibility: visible !important }' });
  await settle(page, 1500);

  if (only.has('rates')) {
    // the clock's rate at each game speed, over 1.5 s of real time (the game running at that speed)
    const rows = [];
    for (const k of [0, 1 / 40, 1 / 4, 1 / 2, 1, 2, 4, 8, 20]) {
      const r = await page.evaluate(async k => {
        const g = window.__game; g.setSpeed(k); await new Promise(r => setTimeout(r, 400));
        const c0 = g.sunClock, t0 = performance.now(), cpu = [];
        await new Promise(res => { const step = () => { cpu.push(g.perf.cpuMs); if (performance.now() - t0 < 1500) requestAnimationFrame(step); else res(); }; requestAnimationFrame(step); });
        const c1 = g.sunClock, t1 = performance.now(); cpu.sort((x, y) => x - y);
        return { speed: g.speed, rate: (c1 - c0) / ((t1 - t0) / 1000), cpuAvg: cpu.reduce((x, y) => x + y, 0) / Math.max(1, cpu.length), cpuP95: cpu[Math.floor(0.95 * cpu.length)] ?? 0, frames: cpu.length };
      }, k);
      rows.push({ speed: r.speed, rate: +r.rate.toFixed(3), cpuAvgMs: +r.cpuAvg.toFixed(3), cpuP95Ms: +r.cpuP95.toFixed(3), frames: r.frames }); console.log(`game speed ${r.speed}: the clouds drift at ${r.rate.toFixed(2)} x the old 1x rate; the frame's cpu ${r.cpuAvg.toFixed(2)} ms (p95 ${r.cpuP95.toFixed(2)}, ${r.frames} frames)`);
    }
    report.rates = rows;
    await page.evaluate(() => window.__game.setSpeed(0));
  }

  if (only.has('strips')) {
    // a boundary of the sun patches near the town, found on the clock's own picture (the CPU twin of the shader), at the clock the strips start from
    const spot = await page.evaluate(async () => {
      const g = window.__game, m = await import('/src/game/sun-patches.ts'), iso = await import('/src/game/iso.ts'), tex = m.sunNoise(), c0 = 5000;
      g.setSpeed(0); g.sunClock = c0; const off = m.sunOffsets(c0);
      const t = iso.tileOf(g.cam.X, g.cam.Y), cx = t.x, cy = t.y; let best = null, bd = 9;
      for (let j = -30; j <= 30; j++) for (let i = -30; i <= 30; i++) {
        const x = cx + i * 12, y = cy + j * 12, s = m.sunAt(tex, x, y, off);
        const wx = m.sunAt(tex, x - 60, y - 80, off), ex = m.sunAt(tex, x + 60, y + 80, off);
        const score = Math.abs(s - 0.5) + (Math.abs(wx - ex) > 0.6 ? 0 : 1);
        if (score < bd) { bd = score; best = { x, y, s, wx, ex }; }
      }
      return best;
    });
    report.spot = spot; console.log('view', JSON.stringify(spot));
    for (const k of [1, 8]) {
      const per = await page.evaluate(async ([k, dt]) => { const m = await import('/src/game/sun-patches.ts'); return m.sunStep(dt, k); }, [k, step]);
      const cells = [];
      for (let i = 0; i < FRAMES; i++) {
        await page.evaluate(([x, y, z, c]) => { const g = window.__game; g.setSpeed(0); g.camEase = null; g.lookAt(x, y, z); g.sunClock = c; }, [spot.x, spot.y, zoom, 5000 + i * per]);
        await page.waitForTimeout(i === 0 ? 1200 : 450);
        const frame = await sharp(await page.screenshot({ type: 'png' })).resize({ width: FW }).png().toBuffer();
        cells.push(await sharp(frame).extend({ top: 22, background: '#000' }).composite([{ input: label(FW, `${(i * step).toFixed(1)} s at ${k}x (clock +${(i * per).toFixed(1)})`), top: 0, left: 0 }]).png().toBuffer());
      }
      const sheet = await sharp({ create: { width: FW * FRAMES + 4 * (FRAMES - 1), height: FH + 22, channels: 3, background: '#000' } }).composite(cells.map((c, i) => ({ input: c, left: i * (FW + 4), top: 0 }))).png().toBuffer();
      const file = join(out, `${tag}-strip-${k}x.jpg`); await sharp(sheet).jpeg({ quality: 88, mozjpeg: true }).toFile(file); console.log(file);
      report[`strip${k}x`] = { clockPerFrame: +per.toFixed(4) };
    }
  }
  await ctx.close();
} finally { await browser.close(); }
writeFileSync(join(out, `${tag}-report.json`), JSON.stringify(report, null, 1));
console.log(JSON.stringify(report));
