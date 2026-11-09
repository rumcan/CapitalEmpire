// T409 (#1105): the hills' look against the old one on the SAME chunks in ONE page (the bench's way, T265's bakeAB): each ground worker paints its last bakes of a tier again, the relief
// look on (the one the page is in, smooth by default) and off (?relief=old's code path) by turns, the order turned each round so neither always goes first, only the paint timed. Over Woodhill's
// real ground at the three zooms the owner looks at (30%, 15%: the ground chunks 'g'; 8%: the district chunks 'm'). Prints each tier's median, p95 and mean for both and the growth, and exits 1 when the
// median grows by more than --limit percent (default 15, the owner's "bake time grows by no more than about 15%").
//   node scripts/dev/relief-bake-ab.mjs --base http://127.0.0.1:5231/ [--course woodhill] [--mode smooth|bands] [--reps 4] [--limit 15]
// Needs a dev server (vite) on --base. One headless Edge, closed when done; saving is off.
import { chromium } from 'playwright-core';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://127.0.0.1:5231/'), course = opt('course', 'woodhill'), mode = opt('mode', 'smooth'), reps = +opt('reps', '4'), limit = +opt('limit', '15');
// the looks, tiles from the land's north-west corner, as relief-shots.mjs has them; each at the three zooms
const LOOKS = course === 'woodhill' ? [[510, 180], [405, 90], [20, 10]] : [[300, 300]], ZOOMS = [0.3, 0.15, 0.08];
const med = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) / 2)] : NaN; }, p95 = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.ceil(0.95 * s.length) - 1)] : NaN; }, mean = a => a.reduce((s, v) => s + v, 0) / (a.length || 1);
let bad = 0;
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const settle = async (page, ms = 900) => {
  await page.waitForTimeout(ms); await page.evaluate(() => { window.__calm = 0; });
  await page.waitForFunction(() => { const g = window.__game; window.__calm = g.ground.busy === 0 ? window.__calm + 1 : 0; return window.__calm > 30; }, null, { timeout: 240000, polling: 50 }).catch(() => console.log('  (settle timed out)'));
  await page.waitForTimeout(400);
};
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }), page = await ctx.newPage();
  page.on('pageerror', e => { console.log('[pageerror]', e.message); bad++; });
  await page.route('**/*', r => { const x = r.request(); return x.method() !== 'GET' && x.method() !== 'HEAD' ? r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }) : r.continue(); });
  await page.goto(`${base}?osmcourse=${course}&seed=1&relief=${mode}`, { waitUntil: 'commit', timeout: 600000 });
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 1200000, polling: 1000 });
  await page.evaluate(() => { const g = window.__game; g.prebake = () => {}; g.setSpeed(0); window.__night = 0; g.nightAmount = () => window.__night; g.closeWho?.('Jack Burns', 2); g.closeWelcome?.(false); const p = g.golf.progress; if (p) for (const k of ['who', 'welcome']) if (!p.seen.includes(k)) p.seen.push(k); });
  console.log(`relief look on: ${await page.evaluate(() => window.__game.reliefMode)} (off: old); ${reps} rounds a tier; Woodhill's looks at ${ZOOMS.map(z => z * 100 + '%').join(', ')}`);
  const tiers = new Map();
  for (const z of ZOOMS) {
    const kind = z < 0.1 ? 'm' : 'g', on = [], off = [];
    for (const [dx, dy] of LOOKS) {
      await page.evaluate(([dx, dy, z]) => { const g = window.__game, c = g.golf.course; g.camEase = null; g.lookAt(c[0] + dx, c[1] + dy, z); g.emit(); }, [dx, dy, z]);
      await settle(page, 1500);
      // (the workers' last bakes of this tier are this view's chunks: the A/B paints them again, new and old by turns)
      const r = await page.evaluate(([kind, reps]) => window.__game.ground.bakeAB(kind, reps, false, 'relief'), [kind, reps]);
      on.push(...r.on); off.push(...r.off);
    }
    tiers.set(z, { kind, on, off });
  }
  console.log('\ntier        paints   new median  old median   growth   new p95  old p95   growth   new mean  old mean   growth');
  for (const [z, { kind, on, off }] of tiers) {
    const g1 = (med(on) / med(off) - 1) * 100, g2 = (p95(on) / p95(off) - 1) * 100, g3 = (mean(on) / mean(off) - 1) * 100;
    console.log(`${String(Math.round(z * 100) + '% ' + kind).padEnd(10)} ${String(on.length).padStart(6)}  ${med(on).toFixed(1).padStart(10)}  ${med(off).toFixed(1).padStart(10)}  ${(g1 >= 0 ? '+' : '') + g1.toFixed(1).padStart(5)}%  ${p95(on).toFixed(1).padStart(8)} ${p95(off).toFixed(1).padStart(8)}  ${(g2 >= 0 ? '+' : '') + g2.toFixed(1).padStart(5)}%  ${mean(on).toFixed(1).padStart(9)} ${mean(off).toFixed(1).padStart(9)}  ${(g3 >= 0 ? '+' : '') + g3.toFixed(1).padStart(5)}%`);
    if (g1 > limit) { bad++; console.log(`FAIL the ${Math.round(z * 100)}% median grew ${g1.toFixed(1)}%, over the ${limit}% limit`); }
  }
} finally { await browser.close(); }
console.log(bad ? `\n${bad} problem(s)` : '\nall within the limit');
process.exit(bad ? 1 : 0);
