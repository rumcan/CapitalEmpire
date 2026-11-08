// T333 (#959): a putt on a green raised by hand, in your walk-on round: the height brush dabbed beside the pin (the owner's flow), your ball put on the
// green and Jump to ball (the shot opens with the putter), then a shot of the green and the break grid's arrows counted by colour.
//   node scripts/dev/break-grid-shots.mjs --base http://localhost:5187/ --out E:/ClaudeTemp/T333 --name after --brush wide|default
// --flat: the flat line the game draws with (green.ts FLAT_SLOPE: 0.002; 0.004 before T333). --brush wide: one gentle wide dab (radius 20, level 1: under 0.4% on the green); default: the tool's default dab (radius 6, level 2) three times.
// Needs a dev server (vite) on --base. One Edge off-screen, closed when done; saves are not written. Exit 1 when the green shows no arrows.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://localhost:5187/'), out = opt('out', 'output/break-grid'), name = opt('name', 'grid'), brush = opt('brush', 'wide'), flat = +opt('flat', '0.002'); // (--flat: the game's FLAT_SLOPE, green.ts; 0.004 before T333)
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: false, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--window-position=-32000,-32000', '--window-size=1366,860', '--no-startup-window-focus'] });
const log = (...a) => console.log(...a);
let arrows = 0;
try {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 }, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => { try { localStorage.clear(); sessionStorage.clear(); } catch { /* none */ } });
  const page = await ctx.newPage();
  page.on('pageerror', e => log('[pageerror]', e.message));
  await page.route('**/*', r => { const x = r.request(); return x.method() !== 'GET' && x.method() !== 'HEAD' ? r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }) : r.continue(); });
  await page.goto(`${base}?start=town`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 300000 });
  await page.evaluate(() => { const g = window.__game; g.closeWho?.('Jack Burns', 2); g.closeWelcome?.(false); g.setSpeed(1); });
  await page.waitForFunction(() => !!window.__game?.you && !!window.__game.yrView(), null, { timeout: 90000 });
  await page.waitForTimeout(1000);
  const r = await page.evaluate(async ([brush, FLAT]) => {
    const g = window.__game; g.yourRoundStart('all');
    const R = g.yourRound(), v = g.yrView(), h = v.holes[R.card[R.at].i], pin = h.pin;
    g.money = 1e9; g.eventCardOpen = null;
    // the height brush (Ground height, raise) beside the pin: the tool's own dab (paint-tool.ts heightDabAt: journaled, charged, the ground re-baked)
    const p = g.paint; p.heightMode = 'raise';
    const dabs = brush === 'wide' ? (p.heightR = 20, p.heightLevel = 1, [{ x: pin.x + 8, y: pin.y }]) : (p.heightR = 6, p.heightLevel = 2, [0, 1, 2].map(k => ({ x: pin.x + 5, y: pin.y - 2 + k * 2 })));
    p.begin?.('raise ground'); p.heighting = { last: dabs[0], broke: false };
    for (const d of dabs) p.heightDabAt(d);
    p.heighting = null;
    // your ball on the green 3 tiles short of the pin, then Jump to ball: the shot opens with the putter
    g.yrFlight = null; g.shot = null; g.setYourRound({ ...g.yourRound(), ball: { x: pin.x - 3, y: pin.y + 0.5 }, lie: 'green' }); g.yourJump();
    g.lookAt(pin.x - 1, pin.y, 0.32);
    await new Promise(res => setTimeout(res, 1800));
    const bp = g.breakPins(), bg = bp.length ? g.breakGridOf(bp[0]) : null, b = [0, 0, 0, 0];
    const STEEP = 0.04, bucket = s => { const u = s <= FLAT ? 0 : Math.min(1, (s - FLAT) / (STEEP - FLAT)); return u <= 0 ? 0 : u < 0.3 ? 1 : u < 0.65 ? 2 : 3; };
    if (bg) for (let k = 0; k < bg.n; k++) { if ((bg.ij[2 * k] & 1) || (bg.ij[2 * k + 1] & 1)) continue; b[bucket(bg.pts[5 * k + 4])]++; }
    return { pin, club: g.shot?.input?.club, shown: bp.length, points: bg?.n ?? 0, buckets: b, fade: g.breakFade, rev: g.courseHeight.rev };
  }, [brush, flat]);
  log(JSON.stringify(r));
  arrows = r.buckets[1] + r.buckets[2] + r.buckets[3];
  await page.screenshot({ path: join(out, `${name}.png`), clip: { x: 283, y: 180, width: 800, height: 420 } });
  log(`${name}: grid ${r.shown ? 'shown' : 'NOT shown'}, ${arrows} arrows (gentle/firm/steep ${r.buckets.slice(1).join('/')}), ${r.buckets[0]} still dots`);
} finally { await browser.close(); }
process.exitCode = arrows ? 0 : 1;
