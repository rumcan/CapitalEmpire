// T269 (#810): in-game shots of the grounds crew and the day's pin (the old start's course, ?start=town):
// - pin: the hole card with today's pin (hole-card-today-pin), and the green at the closest zoom on two mornings (day-pin-<n>), the flag on each
//   day's cup; the console reports the cups against the placed pins;
// - crew: a frame strip of the greenkeeper changing a cup (greenkeeper-moving-hole) and of the ride-on mower finishing a band along the fairway, its
//   fresh stripe laid behind it (mower-crossing-fairway), each with its middle frame;
// - staff: the club card's Grounds crew as hired (club-card-staff) and after three short-handed days (club-card-staff-short);
//   node scripts/dev/crew-shots.mjs --base http://127.0.0.1:5186/ --out E:/ClaudeTemp/T269 [--only pin,crew,staff]
// Needs a dev server (vite) on --base. One headless Edge, closed when done. Saves are not written (non-GET requests are answered locally).
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://127.0.0.1:5186/'), out = opt('out', 'output/crew-shots'), only = opt('only', ''), W = 1366, H = 900;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const save = async (buf, name) => { const file = join(out, `${name}.png`); await sharp(buf).png().toFile(file); console.log(file); return file; };
const settle = async (page, ms = 900) => {
  await page.waitForTimeout(ms);
  await page.evaluate(() => { window.__calm = 0; });
  await page.waitForFunction(() => { const g = window.__game; window.__calm = g.ground.busy === 0 ? window.__calm + 1 : 0; return window.__calm > 20; }, null, { timeout: 60000, polling: 50 }).catch(() => console.log('  (settle timed out)'));
  await page.waitForTimeout(300);
};
/** the town clock to minute m of the day (the next one: a minute past today's moves to tomorrow's) */
const jump = (page, m) => page.evaluate(async m => { const g = window.__game, T = g.traffic, c = await import('/src/game/sim/townclock.ts'); T.setTownClock(c.jumpTo(T.town, T.simTime(performance.now()), m, T.town.rate)); }, m);
const want = k => !only || only.split(',').includes(k);

try {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => { try { localStorage.clear(); sessionStorage.clear(); } catch { /* none */ } });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  page.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 300)); });
  await page.route('**/*', r => { const x = r.request(); return x.method() !== 'GET' && x.method() !== 'HEAD' ? r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }) : r.continue(); });
  await page.goto(`${base}?start=town`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 300000 });
  await page.evaluate(() => { const g = window.__game; g.closeWelcome?.(false); g.emit(); });
  await settle(page, 1500);

  if (want('pin')) {
    // ---- the day's pins: two mornings, the flag on each day's cup; the hole card's line
    const report = () => page.evaluate(() => {
      const g = window.__game, gs = g.golf, dp = gs.dayPins, flags = gs.pins.map(p => { const f = g.golfProps.get('pin:' + p.hole); return f ? { hole: p.hole, x: f.x, y: f.y } : null; });
      return { day: dp?.day, holes: gs.pins.map(p => { const t = dp?.today.find(q => q.hole === p.hole), f = flags.find(q => q?.hole === p.hole); return { h: p.hole, placed: [p.x, p.y], today: t ? [t.x, t.y] : null, flag: f ? [f.x, f.y] : null, text: g.todayPinText(p.hole) }; }) };
    });
    await jump(page, 6 * 60 + 30); await page.evaluate(() => window.__game.setSpeed(1)); await sleep(1500); await page.evaluate(() => window.__game.setSpeed(0));
    const r1 = await report(); console.log('day', r1.day, JSON.stringify(r1.holes.slice(0, 4)));
    const h = r1.holes.find(q => q.today && q.text) ?? r1.holes[0];
    await page.evaluate(([x, y]) => { window.__game.lookAt(x, y, 0.3); }, h.today ?? h.placed); await settle(page, 1200);
    await page.addStyleTag({ content: 'html.noui * { visibility: hidden !important } html.noui canvas { visibility: visible !important }' });
    await page.evaluate(() => document.documentElement.classList.add('noui'));
    await save(await page.screenshot({ type: 'png', clip: { x: W / 2 - 260, y: H / 2 - 200, width: 520, height: 360 } }), `day-pin-${r1.day}`);
    await page.evaluate(() => document.documentElement.classList.remove('noui'));
    // the next morning
    await jump(page, 6 * 60 + 30); await page.evaluate(() => window.__game.setSpeed(1)); await sleep(1500); await page.evaluate(() => window.__game.setSpeed(0));
    const r2 = await report(); console.log('day', r2.day, JSON.stringify(r2.holes.slice(0, 4)));
    const moved = r2.holes.filter(q => { const a = r1.holes.find(o => o.h === q.h); return a?.today && q.today && Math.hypot(a.today[0] - q.today[0], a.today[1] - q.today[1]) > 1; }).length;
    const onCup = r2.holes.filter(q => q.today && q.flag && Math.hypot(q.today[0] - q.flag[0], q.today[1] - q.flag[1]) < 1e-3).length;
    console.log(`cups moved overnight: ${moved}/${r2.holes.length}; flags on today's cup: ${onCup}/${r2.holes.length}`);
    await page.evaluate(() => document.documentElement.classList.add('noui'));
    await settle(page, 1200);
    await save(await page.screenshot({ type: 'png', clip: { x: W / 2 - 260, y: H / 2 - 200, width: 520, height: 360 } }), `day-pin-${r2.day}`);
    await page.evaluate(() => document.documentElement.classList.remove('noui'));
    // the hole card
    await page.evaluate(n => { const g = window.__game; g.setTool('course'); g.openHoleCard(n); g.emit(); }, h.h); await sleep(1200);
    const card = page.locator('[data-testid="hole-today-pin"]').first();
    console.log('card line:', await card.textContent().catch(() => '(none)'));
    const sec = card.locator('xpath=ancestor::section[1]');
    await save(await sec.screenshot({ type: 'png' }), 'hole-card-today-pin');
    await page.evaluate(() => { const g = window.__game; g.closeHoleCard(); g.setTool('select'); g.emit(); });
  }
  if (want('crew')) {
    // ---- the crew: each strip on a fresh day (05:00, the crew made with its play), the clock then moved on to its moment the same day
    await page.addStyleTag({ content: 'html.noui * { visibility: hidden !important } html.noui canvas { visibility: visible !important }' });
    // (a loaded game's first day keeps its cups: the next day is the crew's first)
    const freshDay = async () => { for (let k = 0; k < 3; k++) { await jump(page, 5 * 60); await page.evaluate(() => window.__game.setSpeed(1)); await sleep(1500); await page.evaluate(() => window.__game.setSpeed(0)); if (await page.evaluate(() => (window.__game.crew?.day.cups.length ?? 0) > 0)) return; } };
    const crewInfo = () => page.evaluate(() => {
      const g = window.__game, c = g.crew; if (!c) return null;
      const gk = c.day.workers.find(w => w.role === 'gk'), mo = c.day.workers.find(w => w.role === 'mo');
      const cup = c.day.cups[1] ?? c.day.cups[0], gl = cup && gk?.legs.find(l => l.act === 'kneel' && l.t0 >= cup.t - 4);
      // the mower near the end of his fourth band: its fresh stripe is laid as he finishes it
      const e = c.day.mown[3], ml = e && mo?.legs.find(l => l.act === 'mow' && l.t1 >= e.t - 1e-6);
      return { minute: g.dayMinute, day: c.town, cup, at: gl ? [gl.ax, gl.ay] : null, mow: ml ? { t: e.t, at: [ml.ax, ml.ay], to: [ml.bx, ml.by] } : null, cups: c.day.cups.length, mown: c.day.mown.length };
    });
    /** a strip of n frames of the clip box round (x, y) at zoom z, one every `every` ms of the game at speed 1 */
    const strip = async (name, x, y, z, n, every, box = { w: 420, h: 300 }) => {
      await page.evaluate(([x, y, z]) => window.__game.lookAt(x, y, z), [x, y, z]); await settle(page, 600);
      await page.evaluate(() => document.documentElement.classList.add('noui'));
      const frames = [];
      await page.evaluate(() => window.__game.setSpeed(1));
      for (let k = 0; k < n; k++) {
        frames.push(await page.screenshot({ type: 'png', clip: { x: W / 2 - box.w / 2, y: H / 2 - box.h / 2, width: box.w, height: box.h } }));
        console.log('  frame', k, JSON.stringify(await page.evaluate(() => { const g = window.__game, v = g.crew?.view; return { m: Math.round(g.dayMinute), people: v?.people.map(p => [p.role, Math.round(p.x), Math.round(p.y)]) }; })));
        await sleep(every);
      }
      await page.evaluate(() => { window.__game.setSpeed(0); document.documentElement.classList.remove('noui'); });
      const img = sharp({ create: { width: box.w * n + 4 * (n - 1), height: box.h, channels: 3, background: '#111' } }).composite(frames.map((f, k) => ({ input: f, left: k * (box.w + 4), top: 0 })));
      await save(await img.png().toBuffer(), name);
      await save(frames[Math.floor(n / 2)], `${name}-mid`);
    };
    await freshDay(); let info = await crewInfo(); console.log('crew', JSON.stringify(info));
    if (info?.at) { await jump(page, info.cup.t - 5.5); await strip('greenkeeper-moving-hole', info.at[0], info.at[1], 0.3, 6, 1100); }
    await freshDay(); info = await crewInfo(); console.log('crew', JSON.stringify(info));
    if (info?.mow) { await jump(page, info.mow.t - 6); await strip('mower-crossing-fairway', info.mow.to[0], info.mow.to[1], 0.3, 6, 1500, { w: 640, h: 420 }); }
  }
  if (want('staff')) {
    // ---- the club card's Grounds crew: as hired (the crew the course needs), then short-handed for three days
    const card = async name => {
      await page.evaluate(() => { const g = window.__game; g.openClubCard(true); g.emit(); }); await sleep(1500);
      const el = page.locator('[data-testid="club-card"]').first();
      await el.evaluate(e => { e.dataset.mh = e.style.maxHeight; e.style.maxHeight = 'none'; });
      await sleep(400); await save(await el.screenshot({ type: 'png' }), name);
      console.log(name, JSON.stringify(await page.evaluate(() => window.__game.clubCard()?.crew)));
    };
    const day = async () => { await jump(page, 5 * 60); await page.evaluate(() => window.__game.setSpeed(1)); await sleep(1200); await page.evaluate(() => window.__game.setSpeed(0)); };
    await day(); await jump(page, 9 * 60); await card('club-card-staff');
    await page.evaluate(() => { const g = window.__game; g.crewHire('gk', -1); g.crewHire('mo', -1); });
    for (let k = 0; k < 3; k++) await day();
    await jump(page, 9 * 60); await card('club-card-staff-short');
    await page.evaluate(() => { const g = window.__game; g.crewHire('gk', 1); g.crewHire('mo', 1); g.openClubCard(false); });
  }
} finally {
  await browser.close();
}
