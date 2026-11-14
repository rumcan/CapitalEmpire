// #1295: looks at people walking the paths. Opens the game on a dev server (--base http://127.0.0.1:PORT/: `npx vite --port PORT`, never the owner's ports) in the installed Chrome
// (headless, WebGL), starts a new game at the range (Pick a spot for me), lays the walking path the guide asks for (from the car park's edge to the shack and along behind the mats) and a
// path out onto the field with the Cart paths & roads tool's own network call, runs the game for a while and takes: two frames a few seconds apart of the customers on the path, the attendant
// on the field path, and your character's clicked route along the path. Every figure it prints is measured in the page: how far each person's feet are from the nearest leg of the paths.
//   node scripts/jam/walk-on-paths-shots.mjs --base http://127.0.0.1:5391/ [--out dir] [--tag x] [--headed] [--logs] [--only list] [--far tiles] [--nopath] [--w 1366 --h 860]
// --only: comma list of steps: customers, attendant, you (default all). --nopath: lays no path (the dirt, for the before shots)
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2), has = k => args.includes(`--${k}`), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', ''), SHOTS = resolve(opt('out', 'F:/ClaudeTemp/jam/walk-on-paths/shots')), tag = opt('tag', '');
if (!base) { console.error('usage: node scripts/jam/walk-on-paths-shots.mjs --base http://127.0.0.1:PORT/'); process.exit(2); }
const only = new Set(opt('only', 'customers,attendant,you').split(','));
mkdirSync(SHOTS, { recursive: true });
const errors = [];
const browser = await chromium.launch({ channel: 'chrome', headless: !has('headed'), args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: Number(opt('w', 1366)), height: Number(opt('h', 860)) }, deviceScaleFactor: Number(opt('dsf', 1)), acceptDownloads: false });
await ctx.addInitScript(() => { try { if (!sessionStorage.getItem('__wop')) { localStorage.clear(); indexedDB.deleteDatabase?.('ce'); sessionStorage.setItem('__wop', '1'); } } catch { /* none */ } });
const page = await ctx.newPage();
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
page.on('console', m => { const t = m.text(); if (m.type() === 'error' && !/favicon|Failed to load resource: the server responded with a status of 404/.test(t)) errors.push(`console: ${t.slice(0, 300)}`); if (has('logs')) console.log(`[${m.type()}] ${t.slice(0, 200)}`); });
const settle = (ms = 400) => page.waitForTimeout(ms);
const game = (fn, arg) => page.evaluate(fn, arg);
const shot = async (name, clip) => { const p = resolve(SHOTS, tag + name); await page.screenshot({ path: p, type: 'jpeg', quality: 86, ...(clip ? { clip } : {}) }); console.log(`shot ${p}`); };

/** in the page: the plot's frame of the range scene (u along the county road, v away from it) from three of its anchors, and the legs of the paths now in the network */
const FRAME = `(() => {
  const g = window.__game, sc = g.range.scene; if (!sc) return null;
  const U = { x: (sc.carEdge.x - sc.shopJoin.x) / 14.4, y: (sc.carEdge.y - sc.shopJoin.y) / 14.4 }, V = { x: (sc.shopJoin.x - sc.counter.x) / 2.8, y: (sc.shopJoin.y - sc.counter.y) / 2.8 };
  const O = { x: sc.shopJoin.x - U.x * 34 - V.x * 16.2, y: sc.shopJoin.y - U.y * 34 - V.y * 16.2 };
  return { sc, P: (u, v) => ({ x: O.x + U.x * u + V.x * v, y: O.y + U.y * u + V.y * v }), uv: p => ({ u: ((p.x - O.x) * U.x + (p.y - O.y) * U.y) / (U.x * U.x + U.y * U.y), v: ((p.x - O.x) * V.x + (p.y - O.y) * V.y) / (V.x * V.x + V.y * V.y) }) };
})()`;

try {
  console.log(`walk-on-paths shots: ${base} (Chrome ${browser.version()})`);
  await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 240000 });
  const t0 = Date.now();
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 240000 });
  console.log('game ready after', Date.now() - t0, 'ms');
  if (await page.locator('[data-testid="title-card"]').waitFor({ timeout: 10000 }).then(() => true, () => false)) { await page.locator('[data-testid="title-new"]').click(); await settle(1500); }   // (the jam's title card)
  const who = page.locator('button', { hasText: "That's me" });
  if (await who.waitFor({ timeout: 20000 }).then(() => true, () => false)) { await page.locator('input[placeholder="Your name"]').fill('Shot Test').catch(() => {}); await who.click(); await settle(1500); }
  if (await page.locator('[data-testid="start-pick-card"]').waitFor({ timeout: 20000 }).then(() => true, () => false)) {
    await settle(1200); await page.locator('[data-testid="start-pick-auto"]').click();
    await page.waitForFunction(() => !window.__game.startPick, null, { timeout: 60000 });
  }
  await page.waitForFunction(() => !!window.__game.range?.scene, null, { timeout: 60000 });
  await page.evaluate(src => { window.__F = () => (0, eval)(src); }, FRAME);   // (the plot's frame, asked for in the page below)
  await page.waitForFunction(() => window.__game.firstViewBaked, null, { timeout: 60000, polling: 200 }).catch(() => {});
  await settle(1500);
  // the interface out of the way (--ui keeps it): the shots are of the map
  if (!has('ui')) await page.addStyleTag({ content: '.ui-root > :not(canvas):not(.sr-only) { visibility: hidden !important; }' });
  // the tutorial and the welcome card out of the way; a pause while the path is laid
  await game(() => { const g = window.__game; g.setSpeed(0); const gp = g.golf?.progress; if (gp) for (const k of ['who', 'welcome', 'tour']) if (!gp.seen.includes(k)) gp.seen.push(k); g.emit(); });
  await page.keyboard.press('Escape').catch(() => {});
  console.log('range', JSON.stringify(await game(() => { const g = window.__game, b = g.golf.range; return { owned: b.owned, money: Math.round(g.money), built: b.built, forSale: !!b.forSale, golfers: b.total?.golfers, dir: g.golf.dir, pop: g.traffic?.pop }; })));

  // the jam's old range is for sale until it is bought (with its push picker and its attendant); a busy day's demand for the shots (a new town has no residents: few come on their own)
  await game(() => { const g = window.__game; if (g.golf?.range?.forSale) g.buyRange(); const r = g.range; r.ctx.demand = () => ({ tier: 3, exits: 2, residents: Number(new URLSearchParams(location.search).get('res') ?? 6000), propsAppeal: 0, practiceAppeal: 0 }); });
  await settle(600);
  console.log('range now', JSON.stringify(await game(() => { const g = window.__game, b = g.golf.range; return { owned: b.owned, forSale: !!b.forSale, parkBays: g.range.sim.parkBays, balls: b.balls?.clean }; })));

  // the paths, laid with the road tool's own call (netops addLegs, then commitNetwork): the guide's walking path and a path out onto the field
  if (!has('nopath')) {
    const laid = await game(async () => {
      const g = window.__game, m = await import('/src/game/network.ts'), F = window.__F(); if (!F) return null;
      const { P, sc } = F, walk = m.CLASS['cart-walk'], legs = (...uv) => uv.slice(1).map((q, i) => ({ a: P(uv[i][0], uv[i][1]), b: P(q[0], q[1]) }));
      const guide = legs([48.4, 16.2], [42, 14.6], [35, 14.2], [30, 16.8], [4, 16.8]), field = legs([29.4, 13.4], [29.4, 30], [33, 80]);
      g.edit.addLegs(guide, walk, 0, undefined, true); g.edit.addLegs(field, walk, 0, undefined, true); g.commitNetwork();
      return { guide: guide.length, field: field.length, carEdge: sc.carEdge, net: g.net.version };
    });
    console.log('paths laid', JSON.stringify(laid));
  }
  await settle(800);
  const frame = await game(() => { const g = window.__game, F = window.__F(); const sc = F.sc; return { carEdge: sc.carEdge, counter: sc.counter, shopJoin: sc.shopJoin, ballRoom: sc.ballRoom, bays: sc.bays.length, walkNet: !!sc.walkNet, legs: sc.walkNet?.legs ?? 0 }; });
  console.log('scene', JSON.stringify(frame));

  /** the people the range draws now, each with how far its feet are from the nearest leg of the cart paths in the network */
  const feet = () => game(() => {
    const g = window.__game, sc = g.range.scene, d = g.range.sim.view(), legs = [];
    for (const s of g.net.segs) if (s.cls.family === 'cart') legs.push([s.a.x, s.a.y, s.b.x, s.b.y]);
    const off = (x, y) => Math.min(Infinity, ...legs.map(([ax, ay, bx, by]) => { const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy))); return Math.hypot(ax + dx * t - x, ay + dy * t - y); }));
    const F = window.__F(), people = d.people.slice(0, d.nPeople).map(p => ({ id: p.id, x: p.x, y: p.y, ...F.uv(p), off: legs.length ? off(p.x, p.y) : null })), agents = d.agents.slice(0, d.nAgents).map(a => ({ kind: a.kind, id: a.id, moving: a.moving, x: a.x, y: a.y, off: legs.length ? off(a.x, a.y) : null }));
    return { people, agents, legs: legs.length, golfers: g.golf.range.total?.golfers ?? 0, t: +g.range.sim.clockT.toFixed(1) };
  });
  /** a clip (css px) of w x h round the screen spot of a world point, kept inside the page */
const clipAround = (pt, w = 420, h = 280) => game(async ([pt, w, h]) => { const g = window.__game, iso = await import('/src/game/iso.ts'), ze = g.cam.z * g.dpr, sx = ((iso.worldX(pt.x, pt.y) - g.cam.X) * ze + g.cw / 2) / g.dpr, sy = ((iso.worldY(pt.x, pt.y) - g.cam.Y) * ze + g.ch / 2) / g.dpr; const x = Math.max(0, Math.min(g.cw / g.dpr - w, sx - w / 2)), y = Math.max(0, Math.min(g.ch / g.dpr - h, sy - h * 0.62)); return { x, y, width: w, height: h }; }, [pt, w, h]);
const lookAtPlot = (u, v, z) => game(([u, v, z]) => { const g = window.__game, F = window.__F(), p = F.P(u, v); g.camEase = null; g.lookAt(p.x, p.y, z); g.emit(); }, [u, v, z]);

  if (only.has('customers')) {
    // the game runs at speed until two customers walk the path between the car park and the shop (the camera close on it); then a frame frozen, and another 2.5 s on
    await lookAtPlot(42, 15, Number(opt('zoom', 0.3))); await game(() => window.__game.setSpeed(8));
    const t1 = Date.now(); let found = null;
    while (Date.now() - t1 < Number(opt('wait', 150)) * 1000) {
      await settle(150); const f = await feet(), on = f.people.filter(p => p.off !== null && p.off < 0.05 && p.u > 36 && p.u < 48.5);
      if (on.length >= Number(opt('want', 2))) { found = on.length; break; }
    }
    await game(() => window.__game.setSpeed(0));
    console.log('customers on the path between the car park and the shop:', found, 'golfers so far', (await feet()).golfers);
    const rows = [];
    for (let k = 0; k < 2; k++) {
      if (k) { await game(() => window.__game.setSpeed(2)); await settle(2500); await game(() => window.__game.setSpeed(0)); }
      await settle(250); const f = await feet(), here = f.people.filter(p => p.u > 30 && p.u < 52 && p.v > 8 && p.v < 20);
      console.log(`frame ${k + 1} t=${f.t}: ${f.people.length} people on foot, ${here.length} by the path (u 30..52); feet from the path (tiles):`, here.map(p => `${p.id}@${p.u.toFixed(0)},${p.v.toFixed(0)}:${p.off.toFixed(2)}`).join(' '));
      rows.push(f); await shot(`walk-on-paths-customers-${k + 1}.jpg`);
      // a close-up round the customer nearest the middle of the strip (the feet against the path)
      const mid = here.filter(p => p.off < 0.05).sort((a, b) => Math.abs(a.u - 42) - Math.abs(b.u - 42))[0];
      if (mid) await shot(`walk-on-paths-customers-${k + 1}-closeup.jpg`, await clipAround(mid));
    }
    const all = rows.flatMap(r => r.people.filter(p => p.off !== null && p.u > 36 && p.u < 48.5)); console.log('in the strip between the car park and the shop:', all.length, 'within 0.1 tile of a path', all.filter(p => p.off < 0.1).length, 'within 0.35', all.filter(p => p.off < 0.35).length);
    await game(() => window.__game.setSpeed(1));
  }

  if (only.has('attendant')) {
    // the attendant: out to the balls and back over the field path. The game runs at speed until he is out on it, the camera comes close on him, a frame frozen, and another 2.5 s on
    await game(() => window.__game.setSpeed(20));
    const t2 = Date.now(); let seen = null;
    while (Date.now() - t2 < 150000) {
      await settle(400); const f = await feet(), a = f.agents.find(g => g.kind === 'attendant' && g.moving);
      if (a && a.off !== null && a.off < 0.05) { const room = frame.ballRoom; if (Math.hypot(a.x - room.x, a.y - room.y) > Number(opt('far', 14))) { seen = a; break; } }
    }
    await game(() => window.__game.setSpeed(0));
    if (seen) {
      const follow = async () => { const f = await feet(), a = f.agents.find(g => g.kind === 'attendant'); if (a) await game(([x, y, z]) => { const g = window.__game; g.camEase = null; g.lookAt(x, y, z); g.emit(); }, [a.x, a.y, Number(opt('zoom', 0.3))]); return a; };
      for (let k = 0; k < 2; k++) {
        if (k) { await game(() => window.__game.setSpeed(2)); await settle(2500); await game(() => window.__game.setSpeed(0)); }
        const a = await follow(); await settle(350); const f = await feet(), a2 = f.agents.find(g => g.kind === 'attendant');
        console.log(`attendant, frame ${k + 1}: ${a2 ? `${a2.moving ? 'walking' : 'standing'} at ${a2.x.toFixed(1)},${a2.y.toFixed(1)}, ${a2.off.toFixed(3)} tiles from the path` : 'gone'}`);
        await shot(`walk-on-paths-attendant-${k + 1}.jpg`); if (a2) await shot(`walk-on-paths-attendant-${k + 1}-closeup.jpg`, await clipAround(a2, 420, 280));
      }
    } else console.log('the attendant was not seen out on the field path in two and a half minutes');
    await game(() => window.__game.setSpeed(1));
  }

  if (only.has('you')) {
    // your clicked route: Walk mode, a click at the far end of the path behind the mats, the route's points against the path's legs, then a frame part of the way along it
    await game(() => { const g = window.__game; g.setSpeed(1); g.setYouWalk(true); });
    await lookAtPlot(24, 15, 0.2); await settle(600);
    const r = await game(() => {
      const g = window.__game, F = window.__F(), y = g.you; if (!y) return { err: 'no you' };
      // put you by the car park's edge, then click the behind-the-mats end of the path
      const a = F.P(52, 16.5); y.x = a.x; y.y = a.y; y.moving = false; y.path.length = 0;
      return { you: { x: y.x, y: y.y } };
    });
    console.log('you placed', JSON.stringify(r));
    const target = await game(async () => {
      const g = window.__game, F = window.__F(), iso = await import('/src/game/iso.ts'), to = F.P(10, 16.8), ze = g.cam.z * g.dpr;
      return { mx: ((iso.worldX(to.x, to.y) - g.cam.X) * ze + g.cw / 2) / g.dpr, my: ((iso.worldY(to.x, to.y) - g.cam.Y) * ze + g.ch / 2) / g.dpr, to };
    });
    console.log('click at', JSON.stringify(target));
    await game(([mx, my]) => window.__game.youClick(mx, my, false), [target.mx, target.my]);
    await settle(300);
    const route = await game(() => { const g = window.__game, y = g.you, P = y.path, pts = []; for (let i = 0; i < P.length; i += 2) pts.push([+P[i].toFixed(2), +P[i + 1].toFixed(2)]); const legs = []; for (const s of g.net.segs) if (s.cls.family === 'cart') legs.push([s.a.x, s.a.y, s.b.x, s.b.y]); const off = (x, y) => Math.min(Infinity, ...legs.map(([ax, ay, bx, by]) => { const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy))); return Math.hypot(ax + dx * t - x, ay + dy * t - y); })); return { moving: y.moving, points: pts.length, offPath: pts.map(p => +off(p[0], p[1]).toFixed(3)), pts: pts.slice(0, 12) }; });
    console.log('your route', JSON.stringify(route));
    // two frames part of the way (real time: you walk at a person's pace, 0.7 tiles a second), the camera close on you
    await game(() => window.__game.setSpeed(1));
    for (let k = 0; k < 2; k++) {
      await settle(k ? 5500 : 8500);
      const at = await game(([z]) => { const g = window.__game, y = g.you, legs = []; for (const s of g.net.segs) if (s.cls.family === 'cart') legs.push([s.a.x, s.a.y, s.b.x, s.b.y]); const off = Math.min(Infinity, ...legs.map(([ax, ay, bx, by]) => { const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((y.x - ax) * dx + (y.y - ay) * dy) / (dx * dx + dy * dy))); return Math.hypot(ax + dx * t - y.x, ay + dy * t - y.y); })); g.camEase = null; g.lookAt(y.x, y.y, z); g.emit(); return { x: +y.x.toFixed(2), y: +y.y.toFixed(2), moving: y.moving, feetFromPath: +off.toFixed(3) }; }, [Number(opt('zoom', 0.3))]);
      console.log(`you, frame ${k + 1}`, JSON.stringify(at)); await settle(250); await shot(`walk-on-paths-you-${k + 1}.jpg`); await shot(`walk-on-paths-you-${k + 1}-closeup.jpg`, await clipAround(at, 420, 280));
    }
  }
  console.log('errors', errors.length ? errors.slice(0, 8) : 'none');
} finally {
  if (!has('keep')) await browser.close().catch(() => {});
}
