// T251 (#728): animated captures of golf balls landing, bouncing and rolling, as the game draws them (a headless Edge on the dev server):
//   drive     a tournament drive (the old start's course, ?tourney=1) landing on a fairway and running out, 30%
//   slope     the same drive with the ground tilted across its landing (a dev height dab): the roll bends and stops on the same point, 30%
//   approach  an approach landing on a green and checking up, 30%
//   bunker    a ball plugging in a bunker with its puff of sand, 30% (when the day has one)
//   water     a splash, 30% (when the day has one)
//   range     the busy range (the greens and targets bought, 80 balls kept in the air): balls landing, running out and gathering in the hollows
//             round the target greens, 15%
// Each is the page's screencast (CDP) while the ball plays, cropped round the action and enlarged: an animated GIF (ffmpeg on the PATH) and a
// strip of six frames (PNG). The console reports each shot's landing, its rest and its lies.
//   node scripts/dev/ball-roll-shots.mjs --base http://127.0.0.1:5186/ --out E:/ClaudeTemp/T251 [--only drive,slope,approach,bunker,water,range] [--seed 7]
// Needs a dev server (vite) on --base. One headless Edge, closed when done; saves are not written (non-GET requests are answered locally).
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://127.0.0.1:5186/'), out = opt('out', 'output/ball-roll-shots'), seed = opt('seed', '7'), W = 1366, H = 900;
const only = new Set(opt('only', 'drive,slope,approach,bunker,water,range').split(','));
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const settle = async (page, ms = 900) => {
  await page.waitForTimeout(ms);
  await page.evaluate(() => { window.__calm = 0; });
  await page.waitForFunction(() => { const g = window.__game; window.__calm = g.ground.busy === 0 ? window.__calm + 1 : 0; return window.__calm > 20; }, null, { timeout: 60000, polling: 50 }).catch(() => console.log('  (settle timed out)'));
  await page.waitForTimeout(300);
};
/** the town clock to minute m of the day */
const jump = (page, m) => page.evaluate(async m => { const g = window.__game, T = g.traffic, c = await import('/src/game/sim/townclock.ts'); T.setTownClock(c.jumpTo(T.town, T.simTime(performance.now()), m, T.town.rate)); }, m);
/** (--debug) the town day and minute now, and the play's */
const when = page => page.evaluate(async () => { const g = window.__game, T = g.traffic, c = await import('/src/game/sim/townclock.ts'), tt = c.townTimeOf(T.town, T.simTime(performance.now())); return `day ${tt.day} min ${tt.dayMin.toFixed(2)} speed ${g.speed} play ${!!g.play}`; });
/** a new page on the game with the query q, the UI hidden, broad day */
async function open(q) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => { try { localStorage.clear(); sessionStorage.clear(); } catch { /* none */ } });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  page.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 300)); });
  await page.route('**/*', r => { const x = r.request(); return x.method() !== 'GET' && x.method() !== 'HEAD' ? r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }) : r.continue(); });
  await page.goto(`${base}?${q}`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 300000 });
  await page.evaluate(() => { const g = window.__game; g.closeWelcome?.(false); window.__night = 0; g.nightAmount = () => window.__night; g.emit(); });
  await page.addStyleTag({ content: '* { visibility: hidden !important } canvas { visibility: visible !important }' });
  return { ctx, page };
}
/** the page's screencast, started before go() runs, for ms milliseconds after until() resolves: the frames (jpeg) and their times (s), and what until
 *  gave (mark) */
async function record(page, ms, go, until = null) {
  const cdp = await page.context().newCDPSession(page), frames = [];
  cdp.on('Page.screencastFrame', f => { frames.push({ t: f.metadata.timestamp, buf: Buffer.from(f.data, 'base64') }); cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {}); });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, everyNthFrame: 1, maxWidth: W, maxHeight: H });
  await page.waitForTimeout(150);
  if (go) await go();
  const mark = until ? await until() : null;
  await page.waitForTimeout(ms);
  await cdp.send('Page.stopScreencast').catch(() => {}); await cdp.detach().catch(() => {});
  return Object.assign(frames, { mark });
}
/** frames cropped round the canvas point (cx, cy) (w x h px) and enlarged k times: an animated GIF of those from a to b (s from t0: the strike) at
 *  their own rate, and a strip of six from sa to sb, cropped tighter (sw x sh round the same point, enlarged ks times) with their times since the
 *  strike, the landing marked (a yellow tick) and the model's end point (a red ring) when given (canvas px); the frames' folder is removed after */
async function save(frames, name, o) {
  const { cx, cy, w, h, k, t0, a, b, sa, sb, sw, sh, ks, marks } = o, use = frames.filter(f => f.t - t0 >= a && f.t - t0 <= b).filter((_, i) => i % (o.step ?? 1) === 0);
  if (use.length < 4) { console.log(`  ${name}: too few frames (${use.length} of ${frames.length}; the strike ${(t0 - frames[0].t).toFixed(2)} s in)`); return; }
  const dir = join(out, `${name}-frames`); rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  const box = (ww, hh) => ({ left: Math.max(0, Math.min(W - ww, Math.round(cx - ww / 2))), top: Math.max(0, Math.min(H - hh, Math.round(cy - hh / 2))), width: ww, height: hh });
  const fps = (use.length - 1) / Math.max(1e-3, use[use.length - 1].t - use[0].t);
  for (let i = 0; i < use.length; i++) await sharp(use[i].buf).extract(box(w, h)).resize(Math.round(w * k), Math.round(h * k), { kernel: 'lanczos3' }).png().toFile(join(dir, `f${String(i).padStart(4, '0')}.png`));
  const gif = join(out, `${name}.gif`);
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', fps.toFixed(2), '-i', join(dir, 'f%04d.png'), '-vf', 'split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle', '-loop', '0', gif], { stdio: 'inherit' });
  if (r.status === 0) console.log(`${gif} (${use.length} frames at ${fps.toFixed(1)} fps, ${a.toFixed(1)} to ${b.toFixed(1)} s from the strike)`); else console.log(`  ${name}: ffmpeg failed`);
  rmSync(dir, { recursive: true, force: true });
  // the strip: six frames evenly from sa to sb, three a row
  const n = 6, sbx = box(sw, sh), cw = Math.round(sw * ks), ch = Math.round(sh * ks);
  const tiles = await Promise.all(Array.from({ length: n }, async (_, j) => {
    const tt = sa + (sb - sa) * j / (n - 1), f = frames.reduce((p, q) => Math.abs(q.t - t0 - tt) < Math.abs(p.t - t0 - tt) ? q : p);
    const m = (marks ?? []).map(q => ({ x: (q.x - sbx.left) * ks, y: (q.y - sbx.top) * ks, kind: q.kind }));
    const svg = `<svg width="${cw}" height="${ch}"><rect x="6" y="6" width="86" height="22" rx="4" fill="rgba(15,23,42,0.75)"/><text x="12" y="22" font-family="sans-serif" font-size="14" fill="#f8fafc">+${(f.t - t0).toFixed(2)} s</text>${m.map(q => q.kind === 'rest' ? `<circle cx="${q.x}" cy="${q.y}" r="${3.2 * ks}" fill="none" stroke="#ef4444" stroke-width="1.5"/>` : `<path d="M${q.x - 3 * ks} ${q.y} L${q.x + 3 * ks} ${q.y}" stroke="#facc15" stroke-width="1.5"/>`).join('')}</svg>`;
    return { input: await sharp(f.buf).extract(sbx).resize(cw, ch, { kernel: 'lanczos3' }).composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).png().toBuffer(), left: (j % 3) * cw, top: Math.floor(j / 3) * ch };
  }));
  const strip = join(out, `${name}-strip.png`);
  await sharp({ create: { width: 3 * cw, height: 2 * ch, channels: 3, background: '#000' } }).composite(tiles).png().toFile(strip);
  console.log(strip);
}
/** a tile point's canvas px now */
const screenOf = (page, x, y) => page.evaluate(async ([x, y]) => { const g = window.__game, iso = await import('/src/game/iso.ts'), z = g.cam.z * g.dpr; return { x: ((iso.worldX(x, y) - g.cam.X) * z + g.cw / 2) / g.dpr, y: ((iso.worldY(x, y) - g.cam.Y) * z + g.ch / 2) / g.dpr }; }, [x, y]);

/** the tournament's shot of a kind (the longest roll among them, struck after 08:00): its golfer, minute, club, from, landing, rest and lies */
const pick = (page, kind, after = 480) => page.evaluate(([kind, after]) => {
  const pl = window.__game.play; if (!pl) return null;
  const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const ok = {
    drive: s => s.club === 'driver' && s.landing.lie === 'fairway' && s.landing.restLie === 'fairway' && d(s.landing.at, s.landing.rest) > 6,
    approach: s => ['pw', 'sw', 'iron8', 'iron6', 'iron4'].includes(s.club) && s.landing.lie === 'green' && s.landing.restLie === 'green' && d(s.landing.at, s.landing.rest) > 0.6,
    bunker: s => s.landing.lie === 'bunker',
    water: s => s.landing.lie === 'water' || s.landing.restLie === 'water',
  }[kind];
  const c = pl.plan.shots.filter(s => s.landing && s.t > after && ok(s)).sort((a, b) => d(b.landing.at, b.landing.rest) - d(a.landing.at, a.landing.rest));
  const s = c[0]; if (!s) return null;
  return { golfer: s.golfer, t: s.t, club: s.club, from: s.from, to: s.to, land: s.landing.at, rest: s.landing.rest, lie: s.landing.lie, restLie: s.landing.restLie, penalty: s.penalty, n: c.length };
}, [kind, after]);

/** plays shot s on screen: the clock paused just before it, the camera at zoom z over its landing and rest, then 1x while the screencast runs */
async function playShot(page, s, name, z, k = 2, w = 560, h = 340) {
  const fx = (s.land.x + s.rest.x) / 2, fy = (s.land.y + s.rest.y) / 2;
  await page.evaluate(() => window.__game.setSpeed(0));
  await jump(page, s.t - 2.5);
  await page.evaluate(([x, y, z]) => { const g = window.__game; g.camEase = null; g.lookAt(x, y, z); }, [fx, fy, z]);
  await settle(page, 1200);
  const c = await screenOf(page, fx, fy), L = await screenOf(page, s.land.x, s.land.y), R = await screenOf(page, s.rest.x, s.rest.y);
  // (the clock was set 2.5 minutes before the shot while the view settled: always forward, as a clock set back lands on the next day; the paused
  // clock still creeps a little. Then 1x: the strike comes a second or two in; the flight is 1.4 s (a chip's 0.9), the bounce and roll over by 2.2 s,
  // a splash 0.7 s more)
  const dbg = args.includes('--debug');
  if (dbg) console.log('  before', s.t.toFixed(2), await when(page));
  const frames = await record(page, 3600, async () => { await page.evaluate(() => { window.__go = performance.now() / 1000; window.__game.setSpeed(1); }); if (dbg) setTimeout(async () => console.log('  +1s', await when(page)), 1000); },
    // (the strike: when the playback started the golfer's swing, PlayView swingAt in real seconds of performance.now, on the screencast's clock)
    async () => { await page.waitForFunction(([id, t]) => { const pv = window.__game.play.pv, k = pv.k[id], l = pv.shots[id]; return k > 0 && l[k - 1].t === t && pv.swingAt[id] >= window.__go; }, [s.golfer, s.t], { polling: 10, timeout: 30000 }).catch(() => console.log('  (no strike seen)')); return page.evaluate(id => (performance.timeOrigin + window.__game.play.pv.swingAt[id] * 1000) / 1000, s.golfer); });
  const strike = frames.mark;
  if (args.includes('--debug')) console.log('  frames', frames[0].t, frames[frames.length - 1].t, 'strike', strike, 'now', Date.now() / 1000, await page.evaluate(id => [performance.now(), window.__game.play.pv.swingAt[id]], s.golfer));
  await page.evaluate(() => window.__game.setSpeed(0));
  const fl = s.club === 'pw' || s.club === 'sw' ? 0.9 : 1.4, wet = s.lie === 'water' || s.restLie === 'water', end = 2.2 + (wet ? 0.7 : 0) + (s.lie === 'bunker' ? 0.45 : 0);
  console.log(`${name}: ${s.club} from ${s.from.x.toFixed(1)},${s.from.y.toFixed(1)}; lands ${s.land.x.toFixed(1)},${s.land.y.toFixed(1)} (${s.lie}), rests ${s.rest.x.toFixed(1)},${s.rest.y.toFixed(1)} (${s.restLie}); roll ${Math.hypot(s.rest.x - s.land.x, s.rest.y - s.land.y).toFixed(2)} tiles; ${frames.length} frames, the strike ${(strike - frames[0].t).toFixed(2)} s in`);
  const sw = Math.round(Math.min(w, Math.max(220, Math.abs(L.x - R.x) + 170))), sh = Math.round(Math.min(h, Math.max(150, Math.abs(L.y - R.y) + 130)));
  await save(frames, name, { cx: c.x, cy: c.y, w, h, k, t0: strike, a: fl - 0.6, b: end + 0.6, sa: fl - 0.1, sb: s.lie === 'bunker' ? fl + 0.5 : end, sw, sh, ks: 2, marks: [{ ...L, kind: 'land' }, { ...R, kind: 'rest' }] });
}

try {
  if (['drive', 'slope', 'approach', 'bunker', 'water'].some(k => only.has(k))) {
    const { ctx, page } = await open(`start=town&tourney=1&everyday=0&seed=${seed}`);
    await jump(page, 8 * 60); await page.evaluate(() => window.__game.setSpeed(1)); await page.waitForTimeout(1500); await page.evaluate(() => window.__game.setSpeed(0));
    const ok = await page.evaluate(() => !!window.__game.play); console.log('the tournament round', ok ? 'built' : 'MISSING');
    // the shots in time order, each a few minutes after the one before (the clock only goes forward)
    const drive = await pick(page, 'drive'), plays = [];
    if (drive && only.has('drive')) plays.push([drive, 'drive-30pct', 560, 340]);
    for (const kind of ['approach', 'bunker', 'water']) {
      if (!only.has(kind)) continue;
      const s = (drive && await pick(page, kind, drive.t + 4)) ?? await pick(page, kind, 480);
      if (!s) { console.log(`${kind}: none today`); continue; }
      plays.push([s, `${kind}-30pct`, 460, 300]);
    }
    plays.sort((a, b) => a[0].t - b[0].t);
    let last = -Infinity;
    for (const [s, name, w, h] of plays) {
      if (s.t < last + 4) { console.log(`${name}: too soon after the shot before (${s.t.toFixed(1)})`); continue; }
      await playShot(page, s, name, 0.3, 2, w, h); last = s.t;
    }
    await ctx.close();
    if (drive && only.has('slope')) {
      // the same drive on a fresh page (the same seed, the same round), the ground first tilted across its roll
      const { ctx, page } = await open(`start=town&tourney=1&everyday=0&seed=${seed}`);
      await jump(page, 8 * 60); await page.evaluate(() => window.__game.setSpeed(1)); await page.waitForTimeout(1500); await page.evaluate(() => window.__game.setSpeed(0));
      // a bank raised along one side of the roll (4 tiles off its line, 1.5 m): the ground falls across the roll, which bends and stops on the same point
      await page.evaluate(async s => {
        const g = window.__game, ch = await import('/src/game/ext/course-height/index.ts');
        const dx = s.rest.x - s.land.x, dy = s.rest.y - s.land.y, L = Math.hypot(dx, dy), nx = -dy / L, ny = dx / L;
        let box = null;
        for (let k = 0; k <= 4; k++) { const u = k / 4, x = s.land.x + dx * u + nx * 5, y = s.land.y + dy * u + ny * 5; box = ch.unionBox(box, ch.applyCourseHeightBrush(g.courseHeight, { x, y, radiusTiles: 8, mode: 'raise', strength: 0.5 })); }
        g.courseHeightChanged(box);
      }, drive);
      await playShot(page, drive, 'drive-slope-30pct', 0.3);
      await ctx.close();
    }
  }
  if (only.has('range')) {
    const { ctx, page } = await open(`start=range&seed=1`);
    await page.waitForFunction(() => window.__game.range?.scene, null, { timeout: 120000 });
    await page.evaluate(() => { const g = window.__game, b = g.range.ctx.biz(); for (const id of ['teeturf', 'bays8', 'bays12', 'greens', 'targets', 'grass']) if (!b.owned.includes(id)) b.owned.push(id); g.range.sync(true); g.prebake = () => {}; });
    const sp = await page.evaluate(() => { const sc = window.__game.range.scene, bays = sc.bays.filter(b => !b.lift), m = bays.reduce((a, b) => [a[0] + b.stand.x / bays.length, a[1] + b.stand.y / bays.length], [0, 0]), t = sc.targets[2] ?? sc.targets[0]; return { bays: m, t: t ? [t.x, t.y] : m, targets: sc.targets.length }; });
    const fx = sp.bays[0] * 0.25 + sp.t[0] * 0.75, fy = sp.bays[1] * 0.25 + sp.t[1] * 0.75;
    // (open hours: a closed range's balls are picked at once)
    await jump(page, 10 * 60);
    await page.evaluate(([x, y]) => { const g = window.__game; g.camEase = null; g.lookAt(x, y, 0.15); g.range.sim.benchBalls = 80; g.setSpeed(1); }, [fx, fy]);
    await settle(page, 12000); // (the balls in the air and many lying)
    const c = await screenOf(page, fx, fy);
    const frames = await record(page, 5000, null), t0 = frames[0].t;
    console.log(`range: ${sp.targets} target greens; ${frames.length} frames; lying ${await page.evaluate(() => window.__game.range.sim.nLying)}`);
    await save(frames, 'range-15pct', { cx: c.x, cy: c.y, w: 720, h: 440, k: 1.3, t0, a: 0, b: 5, sa: 0.5, sb: 4.5, sw: 480, sh: 300, ks: 1.5, step: 2 }); // (every second frame: the mown stripes make a big GIF)
    await ctx.close();
  }
} finally { await browser.close(); }
