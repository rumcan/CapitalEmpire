// T353 (#995): house lots on your course. The in-game check and shots, headless Edge, a dev server, real mouse events.
//   1. the menu (Course > Buildings > House lots) and the card; the tool's ghost for a click and for a drag (green, with the price tag);
//      a drag lays a row (the treasury pays LAY_COST a lot); Esc puts the tool down
//   2. the four stages in one row (for sale, sold, being built, built), close up; a ball on a lot is out of bounds (the played course reads the lots)
//   3. the tool over a hole's landing zone: red and hatched, with the reason
//   4. the live market: a new estate for sale, the game run on at speed 20: lots sell (the treasury and the books' Lot sales), houses are built, their owners
//      join the club and the levy is booked; the Budget panel's Lot sales line; a save and a reload bring every lot back as it was
//   node scripts/dev/estate-shots.mjs --base http://localhost:5186/ --out E:/ClaudeTemp/T353 [--tag after] [--seed 7] [--zoom 0.22] [--e2e 1]
// One headless Edge, closed when done; fresh profiles; the dev server's save routes answered with {ok:true}. Exit 1 when a check fails.
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://localhost:5186/'), out = opt('out', 'E:/ClaudeTemp/T353'), tag = opt('tag', 'after'), seed = opt('seed', '7'), ZOOM = +opt('zoom', '0.22'), e2e = opt('e2e', '1') !== '0';
const W = 1280, H = 800;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
let bad = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) bad++; };
const note = s => console.log('    ' + s);

const settle = async (page, ms = 900) => {
  await page.waitForTimeout(ms);
  await page.evaluate(() => { window.__calm = 0; });
  await page.waitForFunction(() => { const g = window.__game; window.__calm = g.ground.busy === 0 && g.lotsPending === 0 ? window.__calm + 1 : 0; return window.__calm > 20; }, null, { timeout: 120000, polling: 50 }).catch(() => console.log('  (settle timed out)'));
  await page.waitForTimeout(300);
};
const jpg = async (png, name) => { const f = join(out, `${name}-${tag}.jpg`); await sharp(png).jpeg({ quality: 90, mozjpeg: true }).toFile(f); console.log('  ' + f); return f; };
const shot = async (page, name) => jpg(await page.screenshot({ type: 'png' }), name);
const look = (page, x, y, z) => page.evaluate(([x, y, z]) => { const g = window.__game; g.camEase = null; g.lookAt(x, y, z); g.emit(); }, [x, y, z]);
const toScreen = (page, x, y) => page.evaluate(([x, y]) => { const g = window.__game, q = g.screen(x, y); return { x: q.x / g.dpr, y: q.y / g.dpr }; }, [x, y]);
/** the DOM's panels hidden (a clean map) or shown again */
const clean = async (page, on) => { if (on) { if (!page.__clean) page.__clean = await page.addStyleTag({ content: '* { visibility: hidden !important } canvas { visibility: visible !important }' }); } else if (page.__clean) { await page.__clean.evaluate(e => e.remove()); page.__clean = null; } };
const prep = page => page.evaluate(() => {
  const g = window.__game; g.prebake = () => {}; g.sandboxUnlock = true; g.setSpeed(0); window.__night = 0; g.nightAmount = () => window.__night; g.waterClock = 0;
  g.traffic.spend('construction', -2000000); // two million in the treasury (the worker books it)
  const p = g.golf.progress; if (p) { for (const k of ['who', 'welcome']) if (!p.seen.includes(k)) p.seen.push(k); if (p.tour) p.tour.off = true; }
  g.emit();
});
/** a fresh browser profile with no saves written to the network */
const fresh = async () => {
  const c = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await c.addInitScript(() => { try { localStorage.clear(); sessionStorage.clear(); } catch { /* none */ } });
  await c.route('**/*', r => { const x = r.request(); return x.method() !== 'GET' && x.method() !== 'HEAD' ? r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }) : r.continue(); });
  return c;
};
const open = async (ctx, query) => {
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('[pageerror]', e.message); bad++; });
  page.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 300)); });
  // (&money=0: the dev server's treasury is unlimited by default, and the checks read what the lots cost and bring in)
  await page.goto(`${base}${query}${query.includes('?') ? '&money=0' : '?money=0'}`, { timeout: 300000, waitUntil: 'commit' });
  await page.waitForFunction(() => window.__game?.ready && window.__game.golf, null, { timeout: 300000 });
  return page;
};
/** a street site on the player's land where lots fit (dev/estate-fixture.ts findSite: the old nine's course rect is rough all over, which a lot covers) */
const findSite = (page, o) => page.evaluate(async o => { const m = await import('/src/game/dev/estate-fixture.ts'); const t = performance.now(), s = m.findSite(window.__game, o); return s ? { ...s, ms: Math.round(performance.now() - t) } : null; }, o);

try {
  const ctx = await fresh();
  const page = await open(ctx, `?start=town&seed=${seed}`);
  await prep(page);
  const g0 = await page.evaluate(() => { const g = window.__game; return { rep: g.golf.rep, money: g.money, holes: g.holeLines().size, clubhouse: g.hasClubhouse }; });
  note(`the old nine: reputation ${g0.rep}, ${g0.holes} holes, the clubhouse ${g0.clubhouse ? 'stands' : 'is missing'}, $${Math.round(g0.money).toLocaleString()}`);

  // ---- a site for the estate street (the rules judge every lot), the street built as the road tool would
  const site = await findSite(page, { want: 8, len: 100, view: true }); // (the lots that look onto a fairway or a green first: a row beside a fairway)
  check(!!site && site.ok >= 8, `a street site with at least 8 lots the rules allow (${site ? `${site.ok} lots at ${JSON.stringify(site.a)}-${JSON.stringify(site.b)}, side ${site.side}, found in ${site.ms} ms` : 'none'})`);
  if (!site) throw new Error('no site');
  await page.evaluate(async site => { const m = await import('/src/game/dev/estate-fixture.ts'); m.buildStreet(window.__game, site); }, site);
  const horiz = site.a.y === site.b.y, mid = { x: (site.a.x + site.b.x) / 2, y: (site.a.y + site.b.y) / 2 };
  // the lots' band: the lot centres of the allowed lots, in street order
  const lots = await page.evaluate(async site => {
    const ES = await import('/src/game/golf/estate.ts'), g = window.__game, mid = { x: (site.a.x + site.b.x) / 2, y: (site.a.y + site.b.y) / 2 };
    const segs = g.estateStreets(mid, 80), plan = ES.planLots(g.estateMake(), { segs, side: site.side }, g.estateEnv());
    return { ok: plan.ok.map(f => ES.centreOf(f)), refused: plan.refused.map(r => r.why) };
  }, site);
  check(lots.ok.length >= 8, `the built street has ${lots.ok.length} lots the rules allow along it (${lots.refused.length} refused: ${[...new Set(lots.refused)].slice(0, 3).join(' | ')})`);
  // the longest run of lots side by side (their centres 10 tiles apart), at most 10: what one drag lays
  const sorted = lots.ok.sort((p, q) => horiz ? p.x - q.x : p.y - q.y), runs = [];
  for (const c of sorted) { const r = runs[runs.length - 1], prev = r?.[r.length - 1]; if (prev && Math.abs((horiz ? c.x - prev.x : c.y - prev.y) - 10) < 0.5) r.push(c); else runs.push([c]); }
  const row = runs.sort((p, q) => q.length - p.length)[0].slice(0, 10), first = row[0], last = row[row.length - 1], centre = { x: (first.x + last.x) / 2, y: (first.y + last.y) / 2 };
  check(row.length >= 6, `a run of ${row.length} lots side by side for one drag`);
  // the camera a little way behind the lots (their depth direction: the side of the course), so the fairway they look onto is in the picture
  const nvec = horiz ? { x: 0, y: site.side } : { x: -site.side, y: 0 }, cam = { x: centre.x + nvec.x * 9, y: centre.y + nvec.y * 9 };
  await look(page, cam.x, cam.y, ZOOM); await settle(page, 2500);

  // ---- the menu and the card
  await page.evaluate(() => { window.__game.setTool('select'); window.__game.emit(); });
  await page.click('[data-rail="course"]'); await page.waitForTimeout(500);
  await page.hover('[data-key="buildings"]'); await page.waitForTimeout(500);
  const items = await page.$$eval('[data-flyout-col="1"] [data-key]', els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
  check(items.some(t => /House lots/.test(t)), `Course > Buildings lists House lots (${items.join(' | ')})`);
  await shot(page, '01-menu');
  await page.click(`[data-key='buildings|{"k":"estate"}']`); await page.waitForTimeout(600);
  const armed = await page.evaluate(() => { const g = window.__game; return { tool: g.tool, ui: g.uiTool, placing: g.estatePlacing, on: g.estateTool.on, club: g.clubPlacing }; });
  check(armed.placing && armed.on && armed.ui === 'buildings' && !armed.club, `House lots is in hand (${JSON.stringify(armed)})`);
  await page.mouse.move(40, 780); await page.waitForTimeout(300);
  const card = await page.$eval('[data-card="estate"]', e => e.textContent.replace(/\s+/g, ' ').trim());
  check(/House lots/.test(card) && /\$1,000 a lot/.test(card), `the card says House lots, $1,000 a lot (${card.slice(0, 120)})`);
  await shot(page, '02-card');

  // ---- a click: the ghost of one lot with its price tag; a drag: the row
  await clean(page, true);
  const p1 = await toScreen(page, first.x, first.y), p2 = await toScreen(page, last.x, last.y);
  await page.mouse.move(p1.x, p1.y); await page.waitForTimeout(400); await settle(page, 300);
  const g1 = await page.evaluate(() => { const t = window.__game.estateTool.ghost; return t && { n: t.frames.length, ok: t.ok, label: t.label, bad: t.bad }; });
  check(!!g1 && g1.n === 1 && g1.ok === 1 && /House lot · \$1,000 to lay · asks about \$[\d,]+ \(/.test(g1.label), `the click's ghost is one lot with its price tag: "${g1?.label}"`);
  await shot(page, '03-ghost-click');
  const money0 = await page.evaluate(() => window.__game.money);
  await page.mouse.down(); await page.mouse.move(p2.x, p2.y, { steps: 12 }); await page.waitForTimeout(500); await settle(page, 300);
  const g2 = await page.evaluate(() => { const t = window.__game.estateTool.ghost; return t && { n: t.frames.length, ok: t.ok, refused: t.refused, label: t.label, cost: t.cost }; });
  check(!!g2 && g2.ok === row.length, `the drag's ghost is the row of ${row.length} lots (${JSON.stringify(g2)})`);
  await shot(page, '04-ghost-drag');
  await page.mouse.up(); await page.waitForTimeout(800);
  const laid = await page.evaluate(() => { const g = window.__game, e = g.estateRt; return { n: e?.lots.length ?? 0, money: g.money, st: e?.lots.map(l => l.st), toast: g.toasts?.[g.toasts.length - 1]?.text ?? null }; });
  check(laid.n === row.length && laid.st.every(s => s === 0), `the drag laid ${laid.n} lots, all for sale`);
  check(Math.round(money0 - laid.money) === 1000 * row.length, `the treasury paid $1,000 a lot (${Math.round(money0 - laid.money)})`);
  note(`toast: ${laid.toast}`);
  await settle(page, 1500);
  await shot(page, '05-laid-for-sale');
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  const esc = await page.evaluate(() => { const g = window.__game; return { placing: g.estatePlacing, on: g.estateTool.on }; });
  check(!esc.placing && !esc.on, 'Esc puts the tool down');
  // a lot cannot be laid twice, and the course's tools do not take its ground
  const again = await page.evaluate(async () => { const g = window.__game, ES = await import('/src/game/golf/estate.ts'), l = g.estateRt.lots[0], c = ES.centreOf(l); return { on: g.onEstate(c.x, c.y), off: g.onEstate(c.x, c.y + 60), own: g.ownedAt(c.x, c.y) }; });
  check(again.on && !again.off && again.own, `lot ground is not course land (onEstate ${again.on}), land beyond it is (${!again.off})`);

  // ---- the four stages in one row
  await page.evaluate(async () => { const m = await import('/src/game/dev/estate-fixture.ts'); m.setStages(window.__game, 'mix'); });
  await look(page, cam.x, cam.y, ZOOM); await settle(page, 3500);
  await shot(page, '06-stages-row');
  const stages = await page.evaluate(() => window.__game.estateRt.lots.map(l => l.st));
  check(JSON.stringify(stages.slice(0, 7)) === JSON.stringify([0, 0, 1, 1, 2, 2, 3]), `the row holds every stage (${stages.join(',')})`);
  // close up on the four stages: lots 2-7
  const near = row.slice(1, 7), cc = { x: (near[0].x + near[near.length - 1].x) / 2, y: (near[0].y + near[near.length - 1].y) / 2 };
  await look(page, cc.x, cc.y, 0.3); await settle(page, 3000);
  await shot(page, '07-stages-close');
  // the two lots for sale and the two sold, closer still (the For Sale post is a small stand-in sign)
  { const c2 = { x: (row[0].x + row[3].x) / 2, y: (row[0].y + row[3].y) / 2 }; await look(page, c2.x, c2.y, 0.3); await settle(page, 2500); await shot(page, '07b-for-sale-sold-close'); }
  // the props each stage draws (the lot queue ran): a sign for sale, the delivery when sold, the site, the house
  const draw = await page.evaluate(() => { const g = window.__game, out = []; for (const l of g.estateRt.lots.slice(0, 8)) out.push([l.st, g.propsOfLot(`estate:${l.id}`).length]); return out; });
  check(draw.every(([st, n]) => n > 0 || st === 3), `every lot drew something (stage, props: ${JSON.stringify(draw)})`);
  check(draw.filter(([st]) => st === 3).every(([, n]) => n > 3), 'a finished lot is a house lot (several props)');
  // a ball on a lot is out of bounds; beside it is not
  const ob = await page.evaluate(async () => {
    const g = window.__game, ES = await import('/src/game/golf/estate.ts'), view = g.playCourse(g.golf), l = g.estateRt.lots[4], c = ES.centreOf(l), side = ES.ptAt(l, l.w / 2, -1.2);
    return { lot: view.lieAt(c.x, c.y), lotKind: view.kindAt(c.x, c.y), away: view.lieAt(side.x, side.y) };
  });
  check(ob.lot === 'out' && ob.lotKind === 'out' && ob.away !== 'out', `a ball on a lot is out of bounds (${ob.lot}); the street in front of it is ${ob.away}`);

  // ---- the tool over a landing zone: red, hatched, the reason
  const rng = await page.evaluate(async () => {
    const m = await import('/src/game/dev/estate-fixture.ts'), g = window.__game, r = m.layEstateFixture(g, 0, { range: true });
    return { spot: r.rangeSpot, sites: r.sites.length };
  });
  check(!!rng.spot, `a street was built where lots are in range of a hole (${JSON.stringify(rng.spot)})`);
  if (rng.spot) {
    await page.evaluate(() => { const g = window.__game; g.placeEstate(true); g.emit(); });
    await look(page, rng.spot.x, rng.spot.y, ZOOM); await settle(page, 2500);
    const sp = await toScreen(page, rng.spot.x, rng.spot.y);
    await page.mouse.move(sp.x, sp.y); await page.waitForTimeout(500); await settle(page, 400);
    const gr = await page.evaluate(() => { const t = window.__game.estateTool.ghost; return t && { n: t.frames.length, ok: t.ok, refused: t.refused, label: t.label, bad: t.bad }; });
    check(!!gr && gr.bad && /golfers there are in range/.test(gr.label), `the ghost over the landing zone is refused with the hole card's words: "${gr?.label}"`);
    await shot(page, '08-refused-range');
    const m0 = await page.evaluate(() => ({ lots: window.__game.estateRt.lots.length, money: window.__game.money }));
    await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(500);
    const m1 = await page.evaluate(() => ({ lots: window.__game.estateRt.lots.length, money: window.__game.money }));
    check(m1.lots === m0.lots && m1.money === m0.money, 'a click there lays nothing and costs nothing');
    await page.keyboard.press('Escape');
  }
  // a click where no street is: the tool says so and the card offers an estate street
  await page.evaluate(() => { const g = window.__game; g.placeEstate(true); g.emit(); });
  const far = await page.evaluate(() => { const g = window.__game, c = g.golf.course; for (const [fx, fy] of [[0.5, 0.5], [0.2, 0.2], [0.8, 0.2], [0.2, 0.8], [0.8, 0.8], [0.5, 0.1], [0.5, 0.9], [0.1, 0.5], [0.9, 0.5]]) { const p = { x: c[0] + c[2] * fx, y: c[1] + c[3] * fy }; if (!g.estateStreets(p, 45).length) return p; } return null; });
  check(!!far, 'a spot with no street within reach');
  if (far) {
    await look(page, far.x, far.y, ZOOM); await settle(page, 1500);
    const fp = await toScreen(page, far.x, far.y);
    await page.mouse.move(fp.x, fp.y); await page.waitForTimeout(300);
    const gh = await page.evaluate(() => window.__game.estateTool.ghost?.label ?? null);
    check(gh === 'No street here: house lots front a street', `the ghost with no street says so: "${gh}"`);
    await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(500);
    const ns = await page.evaluate(() => { const g = window.__game; return { offer: !!g.estateOffer, label: g.estateTool.ghost?.label ?? null }; });
    check(ns.offer, 'a click with no street near leaves the offer of an estate street');
    await clean(page, false);
    await page.waitForTimeout(400);
    check(await page.$('[data-testid="estate-offer"]') !== null, 'the card shows the offer: no street within reach');
    await shot(page, '09-no-street-offer');
  } else await clean(page, false);

  // ---- Draw an estate street: the card's button puts the road tool in hand with a street; one drawn with real clicks and built with Enter brings House lots back armed,
  //      and a click lays a lot on it (the real network's street, cut back at its ends as the town's lots are)
  const site2 = await findSite(page, { want: 3, len: 60 });
  check(!!site2, `a second street site (${site2 ? `${site2.ok} lots` : 'none'})`);
  if (site2) {
    await page.click('[data-testid="estate-draw-street"]'); await page.waitForTimeout(500);
    const rd = await page.evaluate(() => { const g = window.__game; return { tool: g.tool, cls: g.roadClass, placing: g.estatePlacing, pending: !!g.estateStreet, segs: g.net.segs.size }; });
    check(rd.tool === 'road' && ['street', 'lane', 'gravel'].includes(rd.cls) && !rd.placing && rd.pending, `Draw an estate street puts the road tool in hand with a street (${JSON.stringify(rd)})`);
    // (zoomed out, the street's ends well inside the free map: the tool panel and the rail cover the left of the screen, and a click on them is no click on the map)
    await look(page, (site2.a.x + site2.b.x) / 2, (site2.a.y + site2.b.y) / 2, 0.1); await settle(page, 2000);
    const s1 = await toScreen(page, site2.a.x, site2.a.y), s2 = await toScreen(page, site2.b.x, site2.b.y);
    note(`the street's ends on the screen: ${JSON.stringify([s1, s2].map(q => [Math.round(q.x), Math.round(q.y)]))}`);
    await page.mouse.move(s1.x, s1.y); await page.waitForTimeout(300);
    await page.mouse.click(s1.x, s1.y); await page.waitForTimeout(400);
    const r1 = await page.evaluate(() => { const g = window.__game; return { route: g.route.length, toast: g.toasts[g.toasts.length - 1]?.text ?? null }; });
    check(r1.route === 1, `the first click starts the route (${JSON.stringify(r1)})`);
    await page.mouse.move(s2.x, s2.y, { steps: 6 }); await page.waitForTimeout(300);
    await page.mouse.click(s2.x, s2.y); await page.waitForTimeout(400);
    const r2 = await page.evaluate(() => { const g = window.__game; return { route: g.route.length, toast: g.toasts[g.toasts.length - 1]?.text ?? null }; });
    check(r2.route >= 2, `the second click adds the end (${JSON.stringify(r2)})`);
    await page.keyboard.press('Enter'); await page.waitForTimeout(1500);
    const built = await page.evaluate(() => { const g = window.__game; return { tool: g.tool, ui: g.uiTool, placing: g.estatePlacing, segs: g.net.segs.size, toast: g.toasts[g.toasts.length - 1]?.text ?? null }; });
    check(built.segs > rd.segs, `the street was built (${rd.segs} to ${built.segs} road pieces)`);
    check(built.placing && built.ui === 'buildings', `when the street is built House lots comes back armed (${JSON.stringify(built)})`);
    // a click on a lot of the new street lays it
    const pick = await page.evaluate(async site => {
      const ES = await import('/src/game/golf/estate.ts'), g = window.__game, mid = { x: (site.a.x + site.b.x) / 2, y: (site.a.y + site.b.y) / 2 };
      const plan = ES.planLots(g.estateMake(), { segs: g.estateStreets(mid, 50) }, g.estateEnv());
      return plan.ok.length ? ES.centreOf(plan.ok[0]) : null;
    }, site2);
    check(!!pick, 'a lot the rules allow stands beside the new street');
    if (pick) {
      const l0 = await page.evaluate(() => ({ n: window.__game.estateRt.lots.length, money: window.__game.money }));
      await look(page, pick.x, pick.y, 0.2); await settle(page, 1500);
      const ps = await toScreen(page, pick.x, pick.y);
      await page.mouse.move(ps.x, ps.y); await page.waitForTimeout(400); await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(600);
      const l1 = await page.evaluate(() => ({ n: window.__game.estateRt.lots.length, money: window.__game.money }));
      check(l1.n === l0.n + 1 && Math.round(l0.money - l1.money) === 1000, `a click lays one lot on the new street for $1,000 (${l0.n} to ${l1.n} lots, $${Math.round(l0.money - l1.money)})`);
    }
  }
  await page.evaluate(() => { const g = window.__game; g.placeEstate(false); g.setTool('select'); g.emit(); });
  await page.close();

  // ---- the live market, on a new game: lots for sale, the game run on
  if (e2e) {
    // (a new browser profile: the first game's autosave in this one would be loaded in place of a new game)
    const ctx2 = await fresh(), p2 = await open(ctx2, `?start=town&seed=${seed}`);
    await prep(p2);
    const lay = await p2.evaluate(async () => { const m = await import('/src/game/dev/estate-fixture.ts'), g = window.__game, r = m.layEstateFixture(g, 8, { stages: 'sale' }); return { lots: r.lots.length, ms: r.searchMs, club: g.golf.club ? Math.round(g.golf.club.members) : null, members0: g.golf.club?.members ?? null }; });
    check(lay.lots >= 6, `8 lots laid for sale in ${lay.ms} ms (${lay.lots})`);
    const snap = () => p2.evaluate(() => { const g = window.__game, e = g.estateRt, c = e ? e.lots.reduce((a, l) => { a[l.st]++; return a; }, [0, 0, 0, 0]) : null, b = g.traffic.budget, L = b.history.filter(l => l.lots).map(l => ({ day: l.day, lots: l.lots, net: l.net })); return { month: +g.golfMonthAt(performance.now()).toFixed(2), counts: c, money: Math.round(g.money), members: g.golf.club ? +g.golf.club.members.toFixed(2) : null, ledger: L, market: e ? +e.market.toFixed(2) : null, toasts: (g.toasts ?? []).slice(-3).map(t => t.text) }; });
    const s0 = await snap();
    note(`start ${JSON.stringify(s0)}`);
    await p2.evaluate(() => { const g = window.__game; g.setSpeed(20); });
    let last = s0, sold = false, built = false, ledger = false;
    const t0 = Date.now();
    while (Date.now() - t0 < 240000 && !(sold && built && ledger)) {
      await p2.waitForTimeout(8000);
      last = await snap();
      if (!sold && last.counts && last.counts[0] < 8) { sold = true; note(`first sale after ${Math.round((Date.now() - t0) / 1000)} s: ${JSON.stringify(last)}`); }
      if (!built && last.counts && last.counts[3] > 0) { built = true; note(`first house after ${Math.round((Date.now() - t0) / 1000)} s: ${JSON.stringify(last)}`); }
      if (!ledger && last.ledger.length) { ledger = true; note(`the books close a day with Lot sales after ${Math.round((Date.now() - t0) / 1000)} s: ${JSON.stringify(last.ledger)}`); }
    }
    await p2.evaluate(() => window.__game.setSpeed(0));
    check(sold, 'lots sold while the game ran');
    check(last.money > s0.money, `the treasury grew with the sales ($${s0.money.toLocaleString()} to $${last.money.toLocaleString()})`);
    check(built, 'a sold lot was built: the house stands');
    if (built) check(last.members > s0.members, `the finished houses brought members to the club (${s0.members} to ${last.members})`);
    check(ledger, `the books close a day with a Lot sales line (${JSON.stringify(last.ledger)})`);
    await settle(p2, 2500);
    const fin = await p2.evaluate(() => { const g = window.__game, c = g.estateRt.lots.find(l => l.st === 3) ?? g.estateRt.lots[0], q = c.o; return { x: q.x + c.u.x * c.w / 2 + c.n.x * c.d / 2, y: q.y + c.u.y * c.w / 2 + c.n.y * c.d / 2 }; });
    await look(p2, fin.x, fin.y, 0.28); await settle(p2, 3000);
    await clean(p2, true); await shot(p2, '10-market-after'); await clean(p2, false);
    // the money panel: the Lot sales line
    await p2.evaluate(() => { const g = window.__game; g.panel = 'budget'; g.emit(); });
    await p2.waitForTimeout(600);
    const rows = await p2.$$eval('div.space-y-0\\.5 > div', els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
    check(rows.some(t => /^Lot sales\s*\+\$[\d,]+/.test(t)), `the money panel has a Lot sales line (${rows.join(' | ')})`);
    await shot(p2, '11-money-panel');
    await p2.evaluate(() => { const g = window.__game; g.panel = null; g.emit(); });

    // ---- a save and a reload bring every lot back as it was
    const before = await p2.evaluate(() => JSON.stringify(window.__game.estateRt.lots.map(l => [l.id, l.st, l.price, l.member ?? false, l.seed])));
    await p2.evaluate(() => window.__game.save());
    await p2.waitForTimeout(1500);
    await p2.goto(`${base}?money=0`, { timeout: 300000, waitUntil: 'commit' });
    await p2.waitForFunction(() => window.__game?.ready && window.__game.golf, null, { timeout: 300000 });
    await settle(p2, 3000);
    const after = await p2.evaluate(() => { const g = window.__game; return { lots: JSON.stringify(g.estateRt?.lots.map(l => [l.id, l.st, l.price, l.member ?? false, l.seed]) ?? null), drawn: g.estateRt ? g.estateRt.lots.every(l => g.propsOfLot(`estate:${l.id}`).length > 0 || l.st === 3) : false }; });
    check(after.lots === before, 'after a save and a reload every lot is back as it was (id, stage, price, owner joined, seed)');
    check(after.drawn, 'and the lots are drawn again');
    await clean(p2, true); await shot(p2, '12-after-reload'); await clean(p2, false);
    await p2.close();
  }
} catch (e) { console.log('[script error]', e); bad++; } finally { await browser.close(); }
console.log(bad ? `${bad} problem(s)` : 'all checks passed');
process.exit(bad ? 1 : 0);
