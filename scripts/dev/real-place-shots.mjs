// T356 (#998): a real course placed into a game under way, as the game draws it (a headless Edge on the dev server, the old start with its stamped town:
// ?start=town&seed=1&stamp=1): the green outline over the grown town (with the faint holes and the price), the red outline when the money is short and
// when the town's centre is under it, the pop-up that lists what goes, Cancel leaving everything as it was, the placed course at the overview, and a cut
// road that ends at its boundary at the closest zoom. Checks the game's state as it goes (the land bought, the buildings gone, no lot left with no road,
// the holes and the credit, nothing changed by Cancel) and exits 1 on a failed check.
//   node scripts/dev/real-place-shots.mjs --base http://localhost:5189/ --out E:/ClaudeTemp/T356 [--course rondebosch] [--seed 1] [--turn 15]
// Needs a dev server (vite) on --base. One headless Edge, closed when done; saving is off (the requests that write are answered, not sent).
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://localhost:5189/'), out = opt('out', 'E:/ClaudeTemp/T356'), course = opt('course', 'rondebosch'), seed = opt('seed', '1'), turn = Number(opt('turn', '0'));
const W = 1440, H = 900;
mkdirSync(out, { recursive: true });
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
/** a snapshot of everything Cancel must leave alone */
const snap = page => page.evaluate(() => { const g = window.__game, G = g.golf; return JSON.stringify({ net: g.net.version, segs: g.net.segs.size, lots: [...g.traffic.lots.values()].filter(l => l.level >= 1).length, parcels: G.parcels ?? null, parcel: G.parcel, courseRects: G.courseRects ?? null, gridRev: g.courseGrid.rev, pins: G.pins.length, tees: G.tees.length, osm: G.osm ?? null, props: g.props.size, money: g.money === Infinity ? 'inf' : Math.round(g.money) }); });

try {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('[pageerror]', e.message); bad++; });
  page.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 300)); });
  await page.route('**/*', r => { const x = r.request(); return x.method() !== 'GET' && x.method() !== 'HEAD' ? r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }) : r.continue(); });
  await page.goto(`${base}?start=town&seed=${seed}&stamp=1&money=1`, { waitUntil: 'domcontentloaded', timeout: 240000 });
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 400000 });
  await page.evaluate(() => { const g = window.__game; g.prebake = () => {}; g.setSpeed(0); window.__night = 0; g.nightAmount = () => window.__night; g.closeWho?.('Jack Burns', 2); g.closeWelcome?.(false); const p = g.golf.progress; if (p) { for (const k of ['who', 'welcome']) if (!p.seen.includes(k)) p.seen.push(k); if (p.tour) p.tour.off = true; } g.emit(); });
  const start = await page.evaluate(() => { const g = window.__game, G = g.golf, built = [...g.traffic.lots.values()].filter(l => l.level >= 2); return { town: G.town, holes: G.pins.length, pop: g.traffic.pop, built: built.length, segs: g.net.segs.size, osm: G.osm ?? null, parcel: G.parcel, course: G.course, money: g.money === Infinity ? 'inf' : g.money }; });
  console.log('start', JSON.stringify(start));
  check(!start.osm && start.holes > 0, `an ordinary game under way: ${start.holes} holes of its own, ${start.built} built lots, pop ${start.pop}`);

  // ---- the course in hand: its menu entry, then a pose over the town ----
  await page.evaluate(() => { const g = window.__game; g.setTool('select'); g.emit(); });
  const started = await page.evaluate(async id => { const ok = await window.__game.startRealPlace(id); return { ok, active: window.__game.real.active, tool: window.__game.tool }; }, course);
  check(started.ok && started.active && started.tool === 'select', `${course} is in hand, Select under it`);
  // the flyout: Course > Place a real course
  await page.evaluate(() => { window.__game.real.cancel(); });
  const railBtn = await page.$('[data-rail="course"]');
  if (railBtn) { await railBtn.click(); await page.waitForTimeout(500); }
  const menuText = await page.evaluate(() => document.body.innerText);
  check(/Place a real course/.test(menuText), 'the Course flyout lists "Place a real course…"');
  await shot(page, '0-course-menu');
  await page.keyboard.press('Escape');
  await page.evaluate(async id => { await window.__game.startRealPlace(id); }, course);
  if (turn) await page.evaluate(t => { for (let d = 0; d < t; d += 15) window.__game.real.turn(1); }, turn);

  // a pose over the town: the east, west, north or south side of its centre where the course takes the most buildings without taking the centre
  const pose = await page.evaluate(() => {
    const g = window.__game, T = g.golf.town, r = g.real; let best = null;
    for (let dx = -460; dx <= 460; dx += 20) for (let dy = -460; dy <= 460; dy += 20) {
      r.at = { x: Math.round(T.x + dx), y: Math.round(T.y + dy) };
      const p = r.plan(); if (!p || !p.ok) continue;
      const n = p.lots.keys.length + p.orphans.keys.length;
      if (!best || n > best.n) best = { x: r.at.x, y: r.at.y, n, roads: p.roads.m };
    }
    return best;
  });
  console.log('pose', JSON.stringify(pose));
  check(!!pose && pose.n > 0, `a pose that takes ${pose?.n} buildings and ${pose?.roads} m of road and is allowed`);
  await page.evaluate(p => { const g = window.__game; g.real.at = { x: p.x, y: p.y }; g.emit(); }, pose);
  const frame = (pts, maxZ = 0.3) => page.evaluate(([pts, maxZ, W, H]) => {
    const g = window.__game, cx = pts.reduce((s, p) => s + p.x, 0) / pts.length, cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    const fits = z => { g.camEase = null; g.lookAt(cx, cy, z); return pts.every(p => { const s = g.screen(p.x, p.y), x = s.x / g.dpr, y = s.y / g.dpr; return x > 40 && x < W - 40 && y > 130 && y < H - 40; }); };
    let lo = 0.004, hi = maxZ; if (fits(hi)) { g.emit(); return hi; }
    for (let k = 0; k < 14; k++) { const m = (lo + hi) / 2; if (fits(m)) lo = m; else hi = m; }
    fits(lo); g.emit(); return lo;
  }, [pts, maxZ, W, H]);
  const corners = await page.evaluate(() => { const o = window.__game.real.plan().outline, r = []; for (let i = 0; i < o.length; i += 2) r.push({ x: o[i], y: o[i + 1] }); return r; });
  const z = await frame(corners); console.log('  zoom', z.toFixed(4));
  // the pointer over the map, where the pose stands (so the price label shows by it)
  const mouseAt = async () => { const p = await page.evaluate(() => { const g = window.__game, a = g.real.at, s = g.screen(a.x, a.y); return { x: s.x / g.dpr + 40, y: s.y / g.dpr + 30 }; }); await page.mouse.move(p.x, p.y); await page.evaluate(pos => { const g = window.__game; g.real.at = pos; }, pose); await page.waitForTimeout(300); };
  await mouseAt(); await settle(page, 1200);
  let hud = await page.evaluate(() => document.querySelector('[data-testid=real-place-verdict]')?.textContent ?? '');
  console.log('  verdict:', hud);
  check(/click to place/.test(hud), 'the card says it may go there, with the price');
  const planA = await page.evaluate(() => { const p = window.__game.real.plan(); return { total: p.total, land: p.land.price, ha: p.land.ha, houses: p.lots.houses + p.orphans.houses, shops: p.lots.shops + p.orphans.shops, m: p.roads.m, orphans: p.orphans.keys.length, build: p.build, demolish: p.demolish, why: p.why }; });
  console.log('  plan', JSON.stringify(planA));
  await shot(page, '1-green-outline-over-town');

  // ---- red: the money short (the sandbox's unlimited money off: the treasury is what the game has) ----
  await page.evaluate(() => { const g = window.__game; g.traffic.unlimited = false; g.emit(); });
  await page.waitForTimeout(400);
  hud = await page.evaluate(() => document.querySelector('[data-testid=real-place-verdict]')?.textContent ?? '');
  console.log('  verdict:', hud);
  check(/^Not enough money: \$[\d,]+ \(short \$[\d,]+\)/.test(hud), 'the outline is red: not enough money, with the shortfall');
  const red = await page.evaluate(() => { const p = window.__game.real.plan(); return { ok: p.ok, affordable: p.affordable, why: p.why, short: p.short }; });
  check(!red.ok && !red.affordable && red.why === '' && red.short > 0, 'red for the money alone (nothing is wrong with the place)');
  await shot(page, '2-red-outline-short-of-money');
  // a click then opens no pop-up
  await page.evaluate(() => { window.__game.real.click(); });
  check(await page.$('[data-testid=real-place-card]') === null, 'a click on a pose the money does not cover opens no pop-up');
  // red for the place: the town's centre under it
  const T = start.town;
  await page.evaluate(([x, y]) => { const g = window.__game; g.traffic.unlimited = true; g.real.at = { x, y }; g.emit(); }, [T.x + 120, T.y]);
  await page.waitForTimeout(400);
  hud = await page.evaluate(() => document.querySelector('[data-testid=real-place-verdict]')?.textContent ?? '');
  console.log('  verdict:', hud);
  check(/town's centre/.test(hud), 'red over the town’s centre: it says so');
  const cz = await page.evaluate(() => { const o = window.__game.real.plan().outline, r = []; for (let i = 0; i < o.length; i += 2) r.push({ x: o[i], y: o[i + 1] }); return r; });
  await frame(cz); await mouseAt(); await settle(page, 800);
  await shot(page, '2b-red-outline-town-centre');
  // back to the good pose
  await page.evaluate(p => { const g = window.__game; g.real.at = { x: p.x, y: p.y }; g.emit(); }, pose);
  await frame(corners);

  // ---- the pop-up, then Cancel: nothing changed ----
  const before = await snap(page);
  await page.evaluate(() => { window.__game.real.click(); });
  await page.waitForSelector('[data-testid=real-place-card]', { timeout: 10000 });
  const text = await page.$eval('[data-testid=real-place-text]', e => e.textContent);
  console.log('  pop-up:', text);
  check(/^This will buy [\d,]+ ha, demolish .*\(\$[\d,]+\)\./.test(text), 'the pop-up says what is bought and demolished, with the price');
  const sumText = await page.$eval('[data-testid=real-place-sum]', e => e.textContent);
  check(/Land/.test(sumText) && /Total/.test(sumText), 'the pop-up has the sum line by line');
  const replaces = await page.$('[data-testid=real-place-replaces]') !== null;
  check(replaces === (start.holes > 0), 'it says the player’s holes are replaced');
  await shot(page, '3-popup');
  await page.click('[data-testid=real-place-cancel]');
  await page.waitForTimeout(400);
  check(await page.$('[data-testid=real-place-card]') === null, 'Cancel closes the pop-up');
  check((await page.evaluate(() => window.__game.real.active)) === true, 'the course is still in hand after Cancel');
  const after = await snap(page);
  check(before === after, 'Cancel left the roads, lots, land, grid, markers and money exactly as they were');
  await page.evaluate(() => { window.__game.real.cancel(); });
  check((await snap(page)) === before, 'putting the course down (Esc) changes nothing either');
  await page.evaluate(async id => { await window.__game.startRealPlace(id); }, course);
  if (turn) await page.evaluate(t => { for (let d = 0; d < t; d += 15) window.__game.real.turn(1); }, turn);
  await page.evaluate(p => { const g = window.__game; g.real.at = { x: p.x, y: p.y }; g.emit(); }, pose);

  // ---- Place it ----
  const pre = await page.evaluate(() => {
    const g = window.__game, built = [...g.traffic.lots.values()].filter(l => l.level >= 1), p = g.real.plan();
    return { built: built.length, keys: p.lots.keys.length + p.orphans.keys.length, segs: g.net.segs.size, parcels: (g.golf.parcels ?? [g.golf.parcel]).length, plan: { total: p.total, cover: p.cover, outline: p.outline } };
  });
  await page.evaluate(() => { window.__game.real.click(); });
  await page.waitForSelector('[data-testid=real-place-go]', { timeout: 10000 });
  const t0 = Date.now();
  await page.click('[data-testid=real-place-go]');
  await page.waitForFunction(() => !window.__game.real.active, null, { timeout: 60000 });
  console.log(`  laid in ${Date.now() - t0} ms (click to the frame)`);
  await page.evaluate(() => { const g = window.__game; g.setSpeed(1); });
  await page.waitForTimeout(2500);
  await page.evaluate(() => { const g = window.__game; g.setSpeed(0); });
  await page.waitForFunction(() => !window.__game.areasPending, null, { timeout: 180000, polling: 250 }).catch(() => console.log('  (areas still pending)'));
  const post = await page.evaluate(() => {
    const g = window.__game, G = g.golf, grid = g.courseGrid, built = [...g.traffic.lots.values()].filter(l => l.level >= 1);
    let holeCells = 0; const holes = new Set(); for (let i = 0; i < grid.hole.length; i++) if (grid.hole[i] && grid.surf[i]) { holeCells++; holes.add(grid.hole[i]); }
    return { osm: G.osm, pins: G.pins.length, tees: G.tees.length, aims: G.aims.length, built: built.length, segs: g.net.segs.size, parcels: (G.parcels ?? [G.parcel]).length, courseRects: (G.courseRects ?? []).length, holes: holes.size, holeCells, tool: g.tool };
  });
  console.log('placed', JSON.stringify(post));
  check(post.osm?.placed === true && post.osm.id === course && post.osm.credit === '© OpenStreetMap contributors', 'the game knows its placed course and carries the credit');
  check(post.pins === 18 && post.tees >= 18 && post.holes === 18, `18 holes: ${post.pins} pins, ${post.tees} tee markers, ${post.holes} holes on the grid`);
  check(post.courseRects === pre.plan.cover.length && post.parcels >= pre.parcels + pre.plan.cover.length, `the land is bought: ${post.courseRects} rects joined the ${pre.parcels} the game had`);
  check(post.built <= pre.built - pre.keys + 5, `the buildings under it are gone: ${pre.built} built lots before, ${post.built} after (${pre.keys} planned)`);
  check(post.segs <= pre.segs, `roads: ${pre.segs} pieces before, ${post.segs} after`);
  // no lot left with no road in front of it, among those that had one
  const orphans = await page.evaluate(() => {
    const g = window.__game; let n = 0; const bad = [];
    for (const l of g.traffic.lots.values()) {
      if (l.level < 1) continue;
      const fx = l.o[0] + l.u[0] * l.w / 2, fy = l.o[1] + l.u[1] * l.w / 2; let near = false;
      for (const s of g.net.segsNear({ x: fx, y: fy }, 14)) { const dx = s.b.x - s.a.x, dy = s.b.y - s.a.y, L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((fx - s.a.x) * dx + (fy - s.a.y) * dy) / L2)) : 0; if (Math.hypot(fx - s.a.x - dx * t, fy - s.a.y - dy * t) <= s.cls.h + s.cls.walk + 3) { near = true; break; } }
      if (!near) { n++; if (bad.length < 5) bad.push({ key: l.key, level: l.level, o: l.o }); }
    }
    return { n, bad };
  });
  console.log('  lots with no road:', JSON.stringify(orphans));
  check(orphans.n <= 2, `no lot is left with no road in front of it (${orphans.n} found; the game had some of its own before)`);
  await frame(corners.map(c => c)); await settle(page, 1500);
  await shot(page, '4-placed-overview');

  // a cut road that ends at the boundary: the dead end nearest the cover's edge, closest zoom
  const end = await page.evaluate(([cover]) => {
    const g = window.__game, rects = cover, near = (x, y) => { let d = Infinity; for (const r of rects) d = Math.min(d, Math.hypot(Math.max(r[0] - x, 0, x - (r[0] + r[2])), Math.max(r[1] - y, 0, y - (r[1] + r[3])))); return d; };
    let best = null;
    for (const n of g.net.nodes.values()) { if (n.segs.length !== 1) continue; const d = near(n.x, n.y); if (d < 12 && (!best || d < best.d)) best = { x: n.x, y: n.y, d, cls: n.segs[0].cls.id }; }
    return best;
  }, [pre.plan.cover]);
  console.log('  cut road end', JSON.stringify(end));
  check(!!end, 'a road ends at the boundary of the course (a dead end next to its land)');
  if (end) {
    await page.evaluate(([x, y]) => { const g = window.__game; g.camEase = null; g.lookAt(x, y, 0.3); g.emit(); }, [end.x, end.y]);
    await settle(page, 1500);
    await shot(page, '5-cut-road-ends-cleanly');
  }
  // the Holes panel's course card
  await page.evaluate(() => { window.__game.setTool?.('course'); window.__game.emit(); }); await page.waitForTimeout(600);
  check(await page.$('[data-testid=osm-note]') !== null, 'the Holes panel shows the course card note with the credit');
  await shot(page, '6-course-card');
} finally {
  await browser.close();
}
console.log(bad ? `\n${bad} check(s) FAILED` : '\nall checks passed');
process.exit(bad ? 1 : 0);
