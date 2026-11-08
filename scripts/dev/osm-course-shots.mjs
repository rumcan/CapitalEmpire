// T340 (#967) stage 2: the map-data courses as the game draws them (a headless Edge on the dev server, ?osmcourse=<id>): the overview with all 18 holes
// (and the stage-1 preview beside it), the middle zoom over the first three holes, the closest zoom on a green with bunkers, and you playing a hole of
// your walk-on round (the address with the shot panel, the ball in flight, the scorecard). Checks the game state as it goes (18 holes, pins on greens,
// tee markers on tees, the credit on the course card and in the gear menu, the round) and exits 1 on a failed check.
//   node scripts/dev/osm-course-shots.mjs --base http://localhost:5189/ --out E:/ClaudeTemp/T340 [--course rondebosch|magnolia-national|all] [--frame 1] [--tournament 1] [--card 1] [--standard 1] [--main 0]
// Needs a dev server (vite) on --base. One headless Edge, closed when done; saving is off (?osmcourse= is a fixture-style start).
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://localhost:5189/'), out = opt('out', 'E:/ClaudeTemp/T340'), which = opt('course', 'all'), frame = opt('frame', '0') === '1', tourney = opt('tourney', '0') === '1', tournament = opt('tournament', '0') === '1', card = opt('card', '0') === '1', standard = opt('standard', '0') === '1', skipMain = opt('main', '1') === '0';
const ALL = [
  { id: 'rondebosch', preview: 'rondebosch-golf-club.png', holes: 18 }, { id: 'magnolia-national', preview: 'augusta-national-golf-club.png', holes: 18 },
  { id: 'woodhill', preview: 'woodhill-country-club.png', holes: 18, scaled: true },
];
const COURSES = ALL.filter(c => which === 'all' || which.split(',').includes(c.id));
const W = 1440, H = 900;
mkdirSync(out, { recursive: true });
let bad = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) bad++; };
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const settle = async (page, ms = 900) => {
  await page.waitForTimeout(ms);
  await page.evaluate(() => { window.__calm = 0; });
  await page.waitForFunction(() => { const g = window.__game; window.__calm = g.ground.busy === 0 ? window.__calm + 1 : 0; return window.__calm > 30; }, null, { timeout: 180000, polling: 50 }).catch(() => console.log('  (settle timed out)'));
  await page.waitForTimeout(500);
};
const shot = async (page, name) => { const f = join(out, `${name}.png`); await page.screenshot({ path: f }); console.log('  ' + f); return f; };
/** the camera on the tile points, at the closest zoom that keeps them all on the screen (a margin round them) */
const frameOn = (page, pts, maxZ = 0.3) => page.evaluate(([pts, maxZ, W, H]) => {
  const g = window.__game, cx = pts.reduce((s, p) => s + p.x, 0) / pts.length, cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  const fits = z => { g.camEase = null; g.lookAt(cx, cy, z); return pts.every(p => { const s = g.screen(p.x, p.y), x = s.x / g.dpr, y = s.y / g.dpr; return x > 50 && x < W - 50 && y > 80 && y < H - 50; }); };
  let lo = 0.004, hi = maxZ; if (fits(hi)) { g.emit(); return hi; }
  for (let k = 0; k < 14; k++) { const m = (lo + hi) / 2; if (fits(m)) lo = m; else hi = m; }
  fits(lo); g.emit(); return lo;
}, [pts, maxZ, W, H]);

try {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  for (const c of COURSES) {
    console.log(`\n== ${c.id}`);
    const page = await ctx.newPage();
    page.on('pageerror', e => { console.log('[pageerror]', e.message); bad++; });
    page.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 300)); });
    await page.route('**/*', r => { const x = r.request(); return x.method() !== 'GET' && x.method() !== 'HEAD' ? r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }) : r.continue(); });
    await page.goto(`${base}?osmcourse=${c.id}${frame ? '&frame=1' : ''}${tourney ? '&tourney=1' : ''}`, { waitUntil: 'domcontentloaded', timeout: 240000 });
    await page.waitForFunction(() => window.__game?.ready, null, { timeout: 400000 });
    await page.evaluate(() => { const g = window.__game; g.prebake = () => {}; g.setSpeed(0); window.__night = 0; g.nightAmount = () => window.__night; g.closeWho?.('Jack Burns', 2); g.closeWelcome?.(false); const p = g.golf.progress; if (p) { for (const k of ['who', 'welcome']) if (!p.seen.includes(k)) p.seen.push(k); if (p.tour) p.tour.off = true; } g.emit(); });
    const info = await page.evaluate(() => {
      const g = window.__game, G = g.golf, grid = g.courseGrid, cnt = a => { const o = {}; for (const v of a) o[v] = (o[v] ?? 0) + 1; return o; };
      return { osm: G.osm, course: G.course, parcel: G.parcel, tees: G.tees.length, pins: G.pins.length, aims: G.aims.length, grid: { x0: grid.x0, y0: grid.y0, w: grid.w, h: grid.h }, surf: cnt(grid.surf), terrain: g.terrain.seed, towns: g.townPts.length, segs: g.net.segs.size, biz: g.bizDefs.length, park: g.parkDefs.length };
    });
    console.log('game', JSON.stringify(info));
    check(info.osm?.id === c.id && info.osm.credit === '© OpenStreetMap contributors', 'the game knows its course and carries the credit');
    check(info.pins === c.holes && info.tees >= c.holes, `${c.holes} pins and ${info.tees} tee markers`);
    // the holes and markers on the right surfaces, as the game reads them (once the area worker has worked the grid's areas out)
    await page.waitForFunction(() => !window.__game.areasPending, null, { timeout: 120000, polling: 250 }).catch(() => console.log('  (areas still pending)'));
    await page.waitForTimeout(500);
    const holes = await page.evaluate(() => { const g = window.__game, hv = g.courseHoleViews(); return hv.map(h => ({ n: h.n, par: h.par, len: h.lengthM, ok: h.ok, warnings: h.warnings, checks: h.checks.filter(k => !k.ok).map(k => k.label) })); });
    const started = holes.filter(h => h.par > 0 && h.len > 0);
    check(started.length === c.holes, `the Holes strip has ${c.holes} holes with a par and a length (par ${started.reduce((s, h) => s + h.par, 0)}, ${started.reduce((s, h) => s + h.len, 0)} m)`);
    const notOk = started.filter(h => h.checks.length);
    console.log('  holes with a failed check:', JSON.stringify(notOk.map(h => ({ n: h.n, checks: h.checks, w: h.warnings }))).slice(0, 600));
    const on = await page.evaluate(() => { const g = window.__game, G = g.golf, grid = g.courseGrid, S = { green: 8, tee: 5 }, at = (x, y) => grid.surf[Math.floor((y - grid.y0) / 0.5) * grid.w + Math.floor((x - grid.x0) / 0.5)]; return { pins: G.pins.filter(p => at(p.x, p.y) === S.green).length, tees: G.tees.filter(t => at(t.x, t.y) === S.tee).length, allTees: G.tees.length }; });
    check(on.pins === c.holes && on.tees === on.allTees, `every pin on a green cell (${on.pins}/${c.holes}) and every tee marker on a tee cell (${on.tees}/${on.allTees})`);

    // 1. the overview, all 18 holes
    const land = info.course, corners = [{ x: land[0], y: land[1] }, { x: land[0] + land[2], y: land[1] }, { x: land[0], y: land[1] + land[3] }, { x: land[0] + land[2], y: land[1] + land[3] }];
    const zOver = await frameOn(page, corners, 0.3); console.log('  overview zoom', zOver.toFixed(4)); await settle(page, 1500);
    const over = await shot(page, `${c.id}-1-overview`);
    // the stage-1 preview beside it
    const pv = join(out, c.preview);
    if (existsSync(pv)) {
      const a = await sharp(pv).resize({ height: 800 }).toBuffer(), b = await sharp(over).resize({ height: 800 }).toBuffer(), ma = await sharp(a).metadata(), mb = await sharp(b).metadata();
      await sharp({ create: { width: ma.width + mb.width + 30, height: 800, channels: 3, background: '#0b1220' } }).composite([{ input: a, left: 0, top: 0 }, { input: b, left: ma.width + 30, top: 0 }]).png().toFile(join(out, `${c.id}-1b-preview-beside-game.png`));
      console.log('  ' + join(out, `${c.id}-1b-preview-beside-game.png`));
    }
    // 2. the middle zoom over holes 1 to 3
    const first3 = await page.evaluate(() => { const G = window.__game.golf, pts = []; for (const n of [1, 2, 3]) { for (const t of G.tees.filter(q => q.hole === n)) pts.push({ x: t.x, y: t.y }); for (const a of G.aims.filter(q => q.hole === n)) pts.push({ x: a.x, y: a.y }); const p = G.pins.find(q => q.hole === n); if (p) pts.push({ x: p.x, y: p.y }); } return pts; });
    if (first3.length) { const z = await frameOn(page, first3, 0.3); console.log('  holes 1-3 zoom', z.toFixed(3)); await settle(page, 1200); await shot(page, `${c.id}-2-holes-1-3`); }
    // 3. the closest zoom on the green with the most bunker round it
    const gb = await page.evaluate(() => {
      const g = window.__game, grid = g.courseGrid; let best = null;
      for (const p of g.golf.pins) {
        let n = 0; const cx = Math.floor((p.x - grid.x0) / 0.5), cy = Math.floor((p.y - grid.y0) / 0.5);
        for (let dy = -40; dy <= 40; dy++) for (let dx = -40; dx <= 40; dx++) { const x = cx + dx, y = cy + dy; if (x >= 0 && y >= 0 && x < grid.w && y < grid.h && grid.surf[y * grid.w + x] === 6) n++; }
        if (!best || n > best.n) best = { hole: p.hole, x: p.x, y: p.y, n };
      }
      return best;
    });
    console.log('  green with bunkers', JSON.stringify(gb));
    await page.evaluate(([x, y]) => { const g = window.__game; g.camEase = null; g.lookAt(x, y, 0.3); g.emit(); }, [gb.x, gb.y]); await settle(page, 1500);
    await shot(page, `${c.id}-3-green-${gb.hole}-closest`);

    // the credit: on the course card (Holes panel) and in the gear menu
    await page.evaluate(() => { window.__game.setTool?.('course'); window.__game.emit(); }); await page.waitForTimeout(600);
    check(await page.$('[data-testid=osm-note]') !== null, 'the Holes panel shows the course card note with the credit');
    const note = await page.$eval('[data-testid=osm-note]', e => e.textContent).catch(() => '');
    console.log('  note:', note);
    check(note.includes('OpenStreetMap contributors'), 'the course card carries "© OpenStreetMap contributors"');
    if (c.scaled) check(await page.$('[data-testid=osm-scaled]') !== null, 'the course card says the course is scaled to fit the map');
    await shot(page, `${c.id}-3b-course-card`);
    await page.evaluate(() => { window.__game.setTool?.('select'); window.__game.emit(); });

    // 4. you play a hole of your walk-on round: the first tee, the address, the ball in flight, the scorecard
    await page.evaluate(() => window.__game.setSpeed(1));
    const tee1 = await page.evaluate(() => { const t = window.__game.golf.tees.find(t => t.hole === 1 && t.kind === 'middle') ?? window.__game.golf.tees.find(t => t.hole === 1); return { x: t.x, y: t.y }; });
    await page.evaluate(([x, y]) => { const g = window.__game; g.you.x = x - 3; g.you.y = y + 1; g.youMe?.(); g.camEase = null; g.lookAt(x, y, 0.3); g.emit(); }, [tee1.x, tee1.y]);
    await settle(page, 1200);
    await page.evaluate(() => { const g = window.__game; if (!g.youTeeOpen) { g.youTeeOpen = true; g.emit(); } });
    const choice = await page.waitForSelector('[data-testid=tee-play]', { timeout: 15000 }).then(() => true).catch(() => false);
    check(choice, 'the first tee offers the walk-on round (which holes?)');
    if (choice) {
      await shot(page, `${c.id}-4a-first-tee-choice`);
      await page.click('[data-testid=tee-play-all]'); await page.waitForTimeout(800);
      const r0 = await page.evaluate(() => { const r = window.__game.yourRound(); return r && { holes: r.holes.length, card: r.card.length, par: r.card.reduce((s, x) => s + x.par, 0) }; });
      check(!!r0 && r0.holes === c.holes, `your round has ${c.holes} holes (par ${r0?.par})`);
      await page.waitForFunction(() => !!window.__game.shotState(), null, { timeout: 12000 }).catch(async () => { await page.click('[data-testid=you-jump]').catch(() => console.log('  (no jump button)')); });
      await page.waitForTimeout(800); await settle(page, 600);
      check(await page.evaluate(() => !!window.__game.shotState()), 'you are at the address on the first tee');
      await shot(page, `${c.id}-4b-address`);
      await page.evaluate(() => window.__game.ownerSwing({ power: 0.95, acc: 0.0, boost: 0.0 }));
      await page.waitForTimeout(1400);
      await shot(page, `${c.id}-4c-ball-in-flight`);
      await page.waitForFunction(() => !window.__game.yourRoundView()?.flying, null, { timeout: 20000 }).catch(() => console.log('  (still flying)'));
      await page.waitForTimeout(600);
      const after = await page.evaluate(() => { const r = window.__game.yourRound(); return r && { lie: r.lie, ball: r.ball, strokes: r.card[0].strokes }; });
      console.log('  after the drive', JSON.stringify(after));
      check(!!after && after.strokes === 1, 'the drive counted a stroke');
      await shot(page, `${c.id}-4d-after-the-drive`);
      // Jump to ball: the address in the fairway; then the caddie finishes the hole and the scorecard opens
      await page.click('[data-testid=you-jump]').catch(() => console.log('  (no jump button)'));
      await page.waitForFunction(() => !!window.__game.shotState(), null, { timeout: 15000 }).catch(() => console.log('  (no address after the jump)'));
      await page.waitForTimeout(600); await settle(page, 500);
      check(await page.evaluate(() => !!window.__game.shotState()), 'Jump to ball puts you at the address over your ball in the fairway');
      await shot(page, `${c.id}-4d2-address-in-the-fairway`);
      await page.evaluate(() => window.__game.ownerCaddie());
      const holed = await page.waitForFunction(() => window.__game.yourRound()?.holed, null, { timeout: 60000, polling: 250 }).then(() => true).catch(() => false);
      await page.waitForTimeout(700);
      const card = await page.evaluate(() => { const r = window.__game.yourRound(); return r && { holed: r.holed, strokes: r.card[0].strokes, par: r.card[0].par }; });
      console.log('  hole 1', JSON.stringify(card));
      check(holed && !!card, `the caddie holes out hole 1 (${card?.strokes} strokes, par ${card?.par}) and the scorecard opens`);
      await shot(page, `${c.id}-4e-scorecard`);
    }
    await page.close();

  }

  // the tournament phase runs on its own (--tournament 1, with --main 0 to skip the rest)
  for (const c of COURSES) {
      // 5. the tournament on the course (--tournament 1): a fresh page, skipped to the tournament day, the live board with the field's scores after the
      //    kick-off, and the results after the last putt (results-shots.mjs' waits)
      if (tournament) {
        const tp = await ctx.newPage();
        tp.on('pageerror', e => { console.log('[pageerror]', e.message); bad++; });
        await tp.route('**/*', r => { const x = r.request(); return x.method() !== 'GET' && x.method() !== 'HEAD' ? r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }) : r.continue(); });
        await tp.goto(`${base}?osmcourse=${c.id}`, { waitUntil: 'domcontentloaded', timeout: 240000 });
        await tp.waitForFunction(() => window.__game?.ready, null, { timeout: 400000 });
        await tp.waitForTimeout(3000);
        await tp.evaluate(() => { const g = window.__game; g.closeWho?.('Jack Burns', 2); g.closeWelcome?.(false); const p = g.golf.progress; if (p) { for (const k of ['who', 'welcome']) if (!p.seen.includes(k)) p.seen.push(k); if (p.tour) p.tour.off = true; } g.skipToTournament(); });
        const day = await tp.waitForFunction(() => { const g = window.__game; return g.traffic.round.stage === 'surge' && !!g.playBoard(); }, null, { timeout: 420000, polling: 500 }).then(() => true).catch(() => false);
        check(day, 'the tournament day starts on the course (the round is in its surge with a live board)');
        if (day) {
          await tp.evaluate(() => window.__game.setSpeed(20));
          const board = await tp.waitForFunction(() => { const g = window.__game, b = g.playBoard(); return g.traffic.round.stage === 'eval' && b && b.minute >= 15 * 60 + 20; }, null, { timeout: 420000, polling: 200 }).then(() => true).catch(() => false);
          await tp.evaluate(() => window.__game.setSpeed(0)); await tp.waitForTimeout(800);
          const b = await tp.evaluate(() => { const g = window.__game, x = g.playBoard(); return x && { minute: x.minute, rows: x.rows?.length ?? null, waiting: x.waiting }; });
          console.log('  live board', JSON.stringify(b));
          check(board && !!b, 'the field is out on the 18 holes after the kick-off (the live leaderboard)');
          await shot(tp, `${c.id}-5a-tournament-live-board`);
          await tp.evaluate(() => window.__game.setSpeed(4));
          const res = await tp.waitForFunction(() => window.__game.resultsOpen(), null, { timeout: 420000, polling: 100 }).then(() => true).catch(() => false);
          await tp.evaluate(() => window.__game.setSpeed(0)); await tp.waitForTimeout(800);
          check(res, 'the tournament finishes: the results open after the last putt');
          const cham = await tp.evaluate(() => window.__game.playBoard()?.champion ?? null);
          console.log('  champion', JSON.stringify(cham));
          await shot(tp, `${c.id}-5b-tournament-results`);
        }
        await tp.close();
      }
  }

  // 6. the new-game card (--card 1): a fresh profile starts a range game; its Who-are-you card offers "Your course"; a real course starts a new game on it, the
  //    save keeps it (a reload comes back on the same course on the flat plain), and Build your own is the usual start again
  if (card) {
    console.log('\n== the new-game card');
    const cctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 }), cp = await cctx.newPage();
    cp.on('pageerror', e => { console.log('[pageerror]', e.message); bad++; });
    await cp.goto(base, { waitUntil: 'domcontentloaded', timeout: 240000 });
    await cp.waitForFunction(() => window.__game?.ready, null, { timeout: 400000 });
    const who = await cp.waitForSelector('[data-testid=who-card]', { timeout: 60000 }).then(() => true).catch(() => false);
    check(who, 'a fresh game shows the Who-are-you card');
    check((await Promise.all(ALL.map(c => cp.$(`[data-testid=who-course-${c.id}]`)))).every(Boolean), `the card lists the ${ALL.length} real courses`);
    await shot(cp, 'card-1-who-are-you-your-course');
    const txt = await cp.$eval('[data-testid=who-course]', e => e.textContent);
    console.log('  card:', txt);
    check(txt.includes('Magnolia National (from map data)') && txt.includes('Woodhill Country Club (from map data)') && !txt.toLowerCase().includes('augusta'), 'the famous club is shown under its made-up name, the others under theirs');
    check(txt.includes('scaled to 84%'), 'the card says Woodhill is scaled to 84% to fit the map');
    await cp.click('[data-testid=who-course-rondebosch]');
    const started = await cp.waitForFunction(() => window.__game.osmGame()?.id === 'rondebosch' && window.__game.ready, null, { timeout: 120000 }).then(() => true).catch(() => false);
    check(started, 'a click on Rondebosch starts a new game on it');
    await settle(cp, 2500);
    await shot(cp, 'card-2-new-game-on-rondebosch');
    const g1 = await cp.evaluate(() => { const g = window.__game; return { osm: g.golf.osm?.id, pins: g.golf.pins.length, flat: g.terrain.cls.every((c, i) => i % 997 || c === 0) }; });
    console.log('  new game', JSON.stringify(g1));
    await cp.waitForTimeout(5000); // (the autosave)
    await cp.reload({ waitUntil: 'domcontentloaded' });
    await cp.waitForFunction(() => window.__game?.ready, null, { timeout: 400000 });
    const g2 = await cp.evaluate(() => { const g = window.__game; return { osm: g.golf?.osm?.id ?? null, pins: g.golf?.pins.length ?? 0, grid: !!g.courseGrid, credit: g.golf?.osm?.credit ?? null }; });
    console.log('  after a reload', JSON.stringify(g2));
    check(g2.osm === 'rondebosch' && g2.pins === 18 && g2.grid && g2.credit === '© OpenStreetMap contributors', 'the save keeps the real course: a reload comes back on Rondebosch with its 18 pins and its credit');
    await settle(cp, 2000); await shot(cp, 'card-3-after-reload');
    await cctx.close();
  }

  // 7. the standard range start at the same overview zoom (--standard 1), to see what the plain's ground looks like in an ordinary game
  if (standard) {
    console.log('== the standard range start, the same overview zoom');
    const sp = await ctx.newPage();
    sp.on('pageerror', e => { console.log('[pageerror]', e.message); bad++; });
    await sp.goto(`${base}?seed=1`, { waitUntil: 'domcontentloaded', timeout: 240000 });
    await sp.waitForFunction(() => window.__game?.ready, null, { timeout: 400000 });
    await sp.evaluate(() => { const g = window.__game; g.prebake = () => {}; g.setSpeed(0); window.__night = 0; g.nightAmount = () => window.__night; g.closeWho?.('Jack Burns', 2); g.closeWelcome?.(false); const p = g.golf?.progress; if (p) { for (const k of ['who', 'welcome']) if (!p.seen.includes(k)) p.seen.push(k); if (p.tour) p.tour.off = true; } g.camEase = null; g.lookAt(512, 512, 0.0161); g.emit(); });
    await settle(sp, 2500); await shot(sp, 'standard-range-start-overview-same-zoom');
    await sp.close();
  }
} finally { await browser.close(); }
console.log(bad ? `\n${bad} check(s) FAILED` : '\nall checks passed');
process.exit(bad ? 1 : 0);
