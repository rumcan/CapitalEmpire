// T356 (#998): a real course placed into a game under way, as the game draws it (a headless Edge on the dev server, the old start with its stamped town:
// ?start=town&seed=7&stamp=1): the green outline over the grown town (with the faint holes and the price), the red outline when the money is short and
// when the town's centre is under it, the pop-up that lists what goes, Cancel leaving everything as it was, the placed course at the overview, and a cut
// road that ends at its boundary at the closest zoom. Checks the game's state as it goes (the land bought, the buildings gone, no lot left with no road,
// the holes and the credit, nothing changed by Cancel) and exits 1 on a failed check.
//   node scripts/dev/real-place-shots.mjs --base http://localhost:5189/ --out E:/ClaudeTemp/T356 [--course rondebosch] [--seed 7] [--turn 15] [--start town|range] [--tag name]
// Needs a dev server (vite) on --base. One headless Edge, closed when done; saving is off (the requests that write are answered, not sent).
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://localhost:5189/'), out = opt('out', 'E:/ClaudeTemp/T356'), course = opt('course', 'rondebosch'), seed = opt('seed', '7'), turn = Number(opt('turn', '0')), startMode = opt('start', 'town'), tag = opt('tag', '');
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
const shot = async (page, name) => { const f = join(out, `${tag}${name}.png`); await page.screenshot({ path: f }); console.log('  ' + f); return f; };
/** a snapshot of everything Cancel must leave alone */
const snap = page => page.evaluate(() => { const g = window.__game, G = g.golf; return JSON.stringify({ net: g.net.version, segs: g.net.segs.size, lots: [...g.traffic.lots.values()].filter(l => l.level >= 1).length, parcels: G.parcels ?? null, parcel: G.parcel, courseRects: G.courseRects ?? null, gridRev: g.courseGrid.rev, pins: G.pins.length, tees: G.tees.length, osm: G.osm ?? null, props: g.props.size, money: g.money === Infinity ? 'inf' : Math.round(g.money) }); });

try {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('[pageerror]', e.message); bad++; });
  page.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 300)); });
  await page.route('**/*', r => { const x = r.request(); return x.method() !== 'GET' && x.method() !== 'HEAD' ? r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }) : r.continue(); });
  await page.goto(`${base}?start=${startMode}&seed=${seed}&stamp=1&money=1`, { waitUntil: 'domcontentloaded', timeout: 240000 });
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 400000 });
  await page.evaluate(() => { const g = window.__game; g.prebake = () => {}; g.setSpeed(0); window.__night = 0; g.nightAmount = () => window.__night; g.closeWho?.('Jack Burns', 2); g.closeWelcome?.(false); const p = g.golf.progress; if (p) { for (const k of ['who', 'welcome']) if (!p.seen.includes(k)) p.seen.push(k); if (p.tour) p.tour.off = true; } g.emit(); });
  const start = await page.evaluate(() => { const g = window.__game, G = g.golf, built = [...g.traffic.lots.values()].filter(l => l.level >= 2); return { seed: g.terrain.seed, town: G.town, holes: G.pins.length, pop: g.traffic.pop, built: built.length, segs: g.net.segs.size, osm: G.osm ?? null, parcel: G.parcel, course: G.course, money: g.money === Infinity ? 'inf' : g.money }; });
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
  // a pose where the course takes the most buildings and may go (every pose of the map's valid range tried, every 16 tiles; from the turn asked for, 15 degrees on
  // until one has a pose: a river through the middle of the map can refuse every pose at one angle)
  let usedTurn = turn, pose = null;
  for (let k = 0; k < 24; k++) {
    usedTurn = (turn + 15 * k) % 360;
    await page.evaluate(t => { const r = window.__game.real; r.turnBy(t - r.deg); }, usedTurn);
    pose = await page.evaluate(() => {
      const g = window.__game, r = g.real, t = r.turned(); let best = null; const why = {};
      for (let x = Math.ceil(4 + t.w / 2); x <= 1020 - t.w / 2; x += 16) for (let y = Math.ceil(4 + t.h / 2); y <= 1020 - t.h / 2; y += 16) {
        r.at = { x, y };
        const p = r.plan(); if (!p) continue;
        const k = p.ok ? 'ok' : p.why || 'short'; why[k] = (why[k] ?? 0) + 1;
        if (!p.ok) continue;
        const n = p.lots.keys.length + p.orphans.keys.length;
        if (!best || n > best.n) best = { x, y, n, roads: p.roads.m };
      }
      return best ? { ...best, why } : { why };
    });
    if (pose.n > 0) break;
  }
  console.log('seed', start.seed, '(asked for', seed + ')', 'turn', usedTurn);
  console.log('pose', JSON.stringify(pose).slice(0, 400));
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
  const mouseAt = async () => { if (!pose || !(pose.n > 0)) return; const p = await page.evaluate(() => { const g = window.__game, a = g.real.at, s = g.screen(a.x, a.y); return { x: s.x / g.dpr + 40, y: s.y / g.dpr + 30 }; }); await page.mouse.move(p.x, p.y); await page.evaluate(pos => { const g = window.__game; g.real.at = pos; }, pose); await page.waitForTimeout(300); };
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
  // (the land's middle kept on the map: the town's centre is then under its box)
  await page.evaluate(([x, y]) => { const g = window.__game, t = g.real.turned(), map = 1024, cl = (v, lo, hi) => Math.max(lo, Math.min(hi, v)); g.traffic.unlimited = true; g.real.at = { x: cl(x, 4 + t.w / 2, map - 4 - t.w / 2), y: cl(y, 4 + t.h / 2, map - 4 - t.h / 2) }; g.emit(); }, [T.x - 100, T.y]);
  await page.waitForTimeout(400);
  hud = await page.evaluate(() => document.querySelector('[data-testid=real-place-verdict]')?.textContent ?? '');
  console.log('  verdict:', hud);
  check(/town's centre|Your .* is in the way/.test(hud), 'red over what the place keeps (the town’s centre, the club’s buildings): it says so');
  const cz = await page.evaluate(() => { const o = window.__game.real.plan().outline, r = []; for (let i = 0; i < o.length; i += 2) r.push({ x: o[i], y: o[i + 1] }); return r; });
  await frame(cz); await mouseAt(); await settle(page, 800);
  await shot(page, '2b-red-outline-cannot-go-there');
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
  await page.evaluate(t => { const r = window.__game.real; r.turnBy(t - r.deg); }, usedTurn);
  await page.evaluate(p => { const g = window.__game; g.real.at = { x: p.x, y: p.y }; g.emit(); }, pose);

  // ---- Place it ----
  // (what Place it charges, read off the city worker's books: its treasury made real and rich, the sandbox's unlimited money off, then the fall in it)
  await page.evaluate(() => { const g = window.__game; g.traffic.sandbox(1, false); g.traffic.setBudget({ ...g.traffic.budget, money: 1e7 }, g.traffic.career); g.emit(); });
  await page.waitForTimeout(600);
  const pre = await page.evaluate(() => {
    const g = window.__game, built = [...g.traffic.lots.values()].filter(l => l.level >= 1), p = g.real.plan();
    return { money: g.traffic.budget.money, built: built.length, keys: p.lots.keys.length + p.orphans.keys.length, segs: g.net.segs.size, parcels: (g.golf.parcels ?? [g.golf.parcel]).length, plan: { total: p.total, land: p.land.price, roads: p.roads.value, build: p.build, comp: p.lots.comp + p.orphans.comp, cover: p.cover, outline: p.outline } };
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
  await page.waitForTimeout(800);
  const money1 = await page.evaluate(() => window.__game.traffic.budget.money), paid = Math.round(pre.money - money1);
  console.log(`  the city worker's treasury fell by ${paid} (the plan's total ${pre.plan.total}: land ${pre.plan.land} + roads ${pre.plan.roads} + the course ${pre.plan.build} + the buildings ${pre.plan.comp})`);
  check(Math.abs(paid - pre.plan.total) <= Math.max(100, pre.plan.total * 0.005), 'Place it charged what the plan said: the land, the roads taken, the course and the buildings bought out');
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

  // a cut road that ends at the boundary: of the dead ends within 14 tiles of the land bought, the one nearest the course's painted ground (the land keeps 40 m of
  // margin round the holes, but the real boundary's rough reaches its edge in places), closest zoom, the end ringed
  const end = await page.evaluate(([cover]) => {
    const g = window.__game, near = (x, y) => { let d = Infinity; for (const r of cover) d = Math.min(d, Math.hypot(Math.max(r[0] - x, 0, x - (r[0] + r[2])), Math.max(r[1] - y, 0, y - (r[1] + r[3])))); return d; };
    const paintedNear = (x, y) => { let best = Infinity, at = null; for (let dy = -16; dy <= 16; dy += 1) for (let dx = -16; dx <= 16; dx += 1) { if (g.courseSurfAt(x + dx + 0.25, y + dy + 0.25) !== 0) { const d = Math.hypot(dx, dy); if (d < best) { best = d; at = { x: x + dx, y: y + dy }; } } } return { d: best, at }; };
    let best = null;
    for (const n of g.net.nodes.values()) {
      if (n.segs.length !== 1) continue;
      const d = near(n.x, n.y); if (d > 14) continue;
      const q = paintedNear(n.x, n.y), key = Math.min(q.d, 40) + d * 0.01;
      if (!best || key < best.key) best = { x: n.x, y: n.y, d, cls: n.segs[0].cls.id, paint: q.d, at: q.at, key };
    }
    return best;
  }, [pre.plan.cover]);
  console.log('  cut road end', JSON.stringify(end));
  check(!!end, 'a road ends at the boundary of the course (a dead end next to its land)');
  if (end) {
    await page.evaluate(() => { window.__game.setTool('select'); window.__game.emit(); }); await page.mouse.move(700, 880);
    for (const [z, name] of [[0.12, '5a-cut-road-end-wide'], [0.3, '5-cut-road-ends-cleanly']]) {
      const mid = end.at ? { x: (end.x + end.at.x) / 2, y: (end.y + end.at.y) / 2 } : { x: end.x, y: end.y };
      await page.evaluate(([x, y, z, ex, ey]) => {
        const g = window.__game; g.camEase = null; g.lookAt(x, y, z); g.emit();
        document.getElementById('__ring')?.remove();
        const s = g.screen(ex, ey), r = document.createElement('div'); r.id = '__ring';
        r.style.cssText = `position:fixed;left:${s.x / g.dpr - 22}px;top:${s.y / g.dpr - 22}px;width:44px;height:44px;border:3px solid #fff;border-radius:50%;box-shadow:0 0 0 2px #0008;pointer-events:none;z-index:99`;
        const t = document.createElement('div'); t.textContent = 'the road ends here'; t.style.cssText = 'position:absolute;left:52px;top:8px;white-space:nowrap;font:700 14px sans-serif;color:#fff;text-shadow:0 0 3px #000,0 0 3px #000';
        r.appendChild(t); document.body.appendChild(r);
      }, [mid.x, mid.y, z, end.x, end.y]);
      await settle(page, 1500);
      await page.evaluate(([ex, ey]) => { const g = window.__game, s = g.screen(ex, ey), r = document.getElementById('__ring'); if (r) { r.style.left = `${s.x / g.dpr - 22}px`; r.style.top = `${s.y / g.dpr - 22}px`; } }, [end.x, end.y]);
      await shot(page, name);
    }
    await page.evaluate(() => { document.getElementById('__ring')?.remove(); });
  }
  // a game saved after placing loads again with its course on its own map (the save keeps its seed; `placed` stops the flat map of a new-game map-data course)
  const saved = await page.evaluate(() => { const g = window.__game, G = g.golf; return { seed: g.terrain.seed, pins: G.pins.length, rects: (G.courseRects ?? []).length, parcels: (G.parcels ?? []).length, segs: g.net.segs.size }; });
  await page.evaluate(() => { window.__game.setTool('select'); });
  await page.waitForTimeout(5000);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 240000 });
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 400000 });
  const reloaded = await page.evaluate(() => { const g = window.__game, G = g.golf, grid = g.courseGrid; let cells = 0; const holes = new Set(); if (grid) for (let i = 0; i < grid.hole.length; i++) if (grid.hole[i] && grid.surf[i]) { cells++; holes.add(grid.hole[i]); } return G ? { seed: g.terrain.seed, osm: G.osm, pins: G.pins.length, rects: (G.courseRects ?? []).length, parcels: (G.parcels ?? []).length, segs: g.net.segs.size, holes: holes.size, cells, active: g.real.active } : null; });
  console.log('reloaded', JSON.stringify(reloaded)?.slice(0, 300));
  check(!!reloaded && reloaded.osm?.placed === true && reloaded.osm?.id === course, 'the saved game loads again with its placed course and its credit');
  check(!!reloaded && reloaded.seed === saved.seed, `on its own map (seed ${saved.seed}), not the flat map`);
  check(!!reloaded && reloaded.pins === 18 && reloaded.holes === 18 && reloaded.cells > 1000, `with its 18 holes on the grid (${reloaded?.cells} cells)`);
  check(!!reloaded && reloaded.rects === saved.rects && reloaded.parcels === saved.parcels, 'and the land it bought');
  check(!!reloaded && !reloaded.active, 'no course in hand after a load');
  await shot(page, '7-after-reload');
  // the Holes panel's course card
  await page.evaluate(() => { window.__game.setTool?.('course'); window.__game.emit(); }); await page.waitForTimeout(600);
  check(await page.$('[data-testid=osm-note]') !== null, 'the Holes panel shows the course card note with the credit');
  await shot(page, '6-course-card');
} finally {
  await browser.close();
}
console.log(bad ? `\n${bad} check(s) FAILED` : '\nall checks passed');
process.exit(bad ? 1 : 0);
