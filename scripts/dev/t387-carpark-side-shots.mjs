// T387 (#1045, the owner, 2026-11-08, desert start: "can't place the car park near the driving range if you build the driving range to the side"): the
// in-game run. On a new range game (a desert one) the driving range is placed at du tiles along the county road (0: its start spot; more: built to the
// side), then the Car park is taken in hand and its ghost is put, with the real pointer, on
//   beside   open owned ground beside the range's drive and its pro shop with the most woodland (TC.HILL) under it that has no water: the spot the old
//            rule refused with "not on buildable ground"
//   outfield the range's own outfield (refused: the driving range is there)
//   across   the town's side of the county road (refused: off your land)
//   water    the creek or river bank nearest the strip (refused: on water / a creek / the river bank), when the seed has one
// each shot with the verdict the ghost reads, and a JSON of the verdicts (the spot's coordinates and class counts too, the same before and after).
//   node scripts/dev/t387-carpark-side-shots.mjs --base http://localhost:5188/ --out E:/ClaudeTemp/T387 --tag after [--seed 1] [--du 0,90] [--zoom 0.2]
// Needs a dev server (vite) on --base. One headless Edge, closed when done; a fresh profile per layout, so each start is a new game.
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://localhost:5188/'), out = opt('out', 'output/t387-shots'), tag = opt('tag', 'after'), seed = opt('seed', '1'), zoom = +opt('zoom', '0.2'), dus = opt('du', '0,90').split(',').map(Number), desert = opt('desert', 'on');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
let bad = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) bad++; };
const settle = async (page, ms = 900) => {
  await page.waitForTimeout(ms);
  await page.evaluate(() => { window.__calm = 0; });
  await page.waitForFunction(() => { const g = window.__game; window.__calm = g.ground.busy === 0 ? window.__calm + 1 : 0; return window.__calm > 20; }, null, { timeout: 60000, polling: 50 }).catch(() => console.log('  (settle timed out)'));
  await page.waitForTimeout(300);
};
const shot = async (page, name) => {
  const file = join(out, `${tag}-${name}.jpg`);
  await sharp(await page.screenshot({ type: 'png' })).jpeg({ quality: 86, mozjpeg: true }).toFile(file);
  console.log('  ' + file); return file;
};
const look = (page, p, z) => page.evaluate(([x, y, z]) => { const g = window.__game; g.camEase = null; g.lookAt(x, y, z); g.emit(); }, [p.x, p.y, z]);
/** the pointer on world tile p (the camera already there) */
const hover = async (page, p) => { const s = await page.evaluate(([x, y]) => { const g = window.__game, q = g.screen(x, y); return { x: q.x / g.dpr, y: q.y / g.dpr }; }, [p.x, p.y]); await page.mouse.move(s.x, s.y); await page.waitForTimeout(250); };
/** what the ghost in hand reads at the pointer: the spot, its reason ('' when it may be built) and the money check's label */
const verdict = page => page.evaluate(() => {
  const g = window.__game, p = g.placing, h = g.hover; if (!p || !h) return null;
  const s = p.spot(h.x, h.y); return { name: p.name, why: p.why(s), spot: [s.x, s.y, s.w, s.h] };
});
try {
  const summary = [];
  for (const du of dus) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }), page = await ctx.newPage();
    page.on('pageerror', e => { console.log('[pageerror]', e.message); bad++; });
    page.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 300)); });
    await page.goto(`${base}?start=range&seed=${seed}&desert=${desert}`, { timeout: 240000, waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__game?.ready && window.__game.range?.bareGate, null, { timeout: 240000 });
    await page.evaluate(() => {
      const g = window.__game, p = g.golf.progress; g.prebake = () => {}; g.setSpeed(0); window.__night = 0; g.nightAmount = () => window.__night;
      if (p) { for (const k of ['who', 'welcome']) if (!p.seen.includes(k)) p.seen.push(k); if (p.tour) p.tour.off = true; }
      g.emit();
    });
    console.log(`==== seed ${seed}, the range ${du === 0 ? 'on its start spot' : du > 0 ? `${du} tiles along the road` : `${-du} tiles the other way`} (${tag})`);
    // the frame of the home's plot: u along the county road, v away from it (range.ts plotPoint)
    const home = await page.evaluate(() => ({ rect: window.__game.golf.range.home, f: window.__game.golf.dir }));
    const frame = (plot, f) => (u, v) => { const [px, py] = plot, W = 70, D = 150; return f === 2 ? { x: px + u, y: py + v } : f === 0 ? { x: px + W - u, y: py + D - v } : f === 1 ? { x: px + v, y: py + W - u } : { x: px + D - v, y: py + u }; };
    const H = frame(home.rect, home.f);
    // the other way along the road (du < 0) is land the player has not bought: a block the parcel's length beside it, as Course > Land for sale gives
    if (du < 0) await page.evaluate(([ux, uy]) => { const g = window.__game, pc = g.golf.parcel, along = Math.abs(ux) === 1 ? pc[2] : pc[3]; g.golf.parcels = [...(g.golf.parcels ?? [pc]), [pc[0] - ux * along, pc[1] - uy * along, pc[2], pc[3]]]; }, [H(1, 0).x - H(0, 0).x, H(1, 0).y - H(0, 0).y]);
    // the range: slid du along the road, placed with the pointer
    await page.evaluate(() => window.__game.placeRangePart('range'));
    await look(page, H(35 + du, 40), 0.1); await settle(page, 600);
    await hover(page, H(35 + du, 12)); let v = await verdict(page);
    console.log('  the range ghost:', JSON.stringify(v));
    if (v?.why) { console.log(`  (the range cannot go here: ${v.why})`); summary.push({ du, rangeWhy: v.why }); await ctx.close(); continue; }
    await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(600);
    const st = await page.evaluate(() => { const g = window.__game, b = g.golf.range; return { built: b.built === undefined, range: g.bizDefs.some(d => d.type === 'range'), setback: b.setback, front: g.bizDefs.find(d => d.type === 'range') }; });
    check(st.built && st.range, 'the range is built'); await settle(page);
    const plot = await page.evaluate(() => { const g = window.__game, d = g.bizDefs.find(b => b.type === 'range'), f = g.golf.dir, [x, y, w, h] = [d.x, d.y, d.w, d.h], back = 150 - 24; return f === 2 ? [x, y, 70, 150] : f === 0 ? [x, y - back, 70, 150] : f === 1 ? [x, y, 150, 70] : [x - back, y, 150, 70]; });
    const P = frame(plot, home.f), o = P(0, 0), U = { x: P(1, 0).x - o.x, y: P(1, 0).y - o.y }, V = { x: P(0, 1).x - o.x, y: P(0, 1).y - o.y };
    // J: the drive's mouth on the county road (the plot's frame: u 72 beside the plot, v back from the road by NEAR + the set-back)
    const J = await page.evaluate(() => { const g = window.__game, s = g.range.scene; return { x: s.J.x, y: s.J.y }; });
    const at = (ds, t) => ({ x: J.x + U.x * ds + V.x * t, y: J.y + U.y * ds + V.y * t });
    // the car park in hand
    await page.evaluate(() => window.__game.placeRangePart('carpark'));
    // where the strip's spots stand: the classes under each (0 ground 1 patch 2 woodland 3 water 4 creek 5 bank), by the ghost's own snapped rect, whatever the code
    const scan = await page.evaluate(([J, U, V]) => {
      const g = window.__game, p = g.placing, cls = g.terrain.cls, MAP = Math.round(Math.sqrt(cls.length)), res = [];
      for (let ds = -70; ds <= 70; ds += 2) {
        const pt = { x: J.x + U.x * ds + V.x * 12, y: J.y + U.y * ds + V.y * 12 }, s = p.spot(pt.x, pt.y), c = [0, 0, 0, 0, 0, 0];
        for (let y = s.y; y < s.y + s.h; y++) for (let x = s.x; x < s.x + s.w; x++) c[cls[y * MAP + x]]++;
        res.push({ ds, pt, spot: [s.x, s.y, s.w, s.h], cls: c, why: p.why(s) });
      }
      return res;
    }, [J, U, V]);
    // the far side of the drive and the near side beside the pro shop: the spot with the most woodland and no water
    const dry = scan.filter(r => r.cls[3] + r.cls[4] + r.cls[5] === 0 && Math.abs(r.ds) >= 12), wood = [...dry].sort((a, b) => b.cls[2] - a.cls[2] || Math.abs(a.ds) - Math.abs(b.ds))[0];
    const wet = [...scan].sort((a, b) => (b.cls[3] + b.cls[4] + b.cls[5]) - (a.cls[3] + a.cls[4] + a.cls[5]))[0];
    const rows = { du, J, facing: home.f, setback: st.setback, plot, beside: wood ?? null, water: wet && wet.cls[3] + wet.cls[4] + wet.cls[5] > 0 ? wet : null, verdicts: {} };
    const shots = [];
    if (wood) shots.push(['beside', wood.pt, `beside the drive, ${wood.cls[2]} woodland tiles under the ghost`]);
    shots.push(['outfield', P(35, 75), 'on the outfield']);
    shots.push(['across', at(14, -12), 'across the county road']);
    if (rows.water) shots.push(['water', rows.water.pt, `on water (${rows.water.cls[3]} water, ${rows.water.cls[4]} creek, ${rows.water.cls[5]} bank tiles)`]);
    for (const [name, p, what] of shots) {
      await look(page, p, zoom); await settle(page, 700);
      await hover(page, p); v = await verdict(page);
      console.log(`  ${what}: ${JSON.stringify(v)}`);
      rows.verdicts[name] = v; await shot(page, `du${du}-${name}`);
    }
    // every open spot is a click away from a car park: the first allowed one builds it, and the car park stands
    const okSpot = scan.find(r => !r.why && r.ds >= 12) ?? scan.find(r => !r.why);
    if (okSpot) {
      await look(page, okSpot.pt, zoom); await settle(page, 600); await hover(page, okSpot.pt); v = await verdict(page);
      check(v?.why === '', `a car park beside the range's drive may be built (${v?.why || 'ok'})`);
      const before = await page.evaluate(() => window.__game.parkDefs.length);
      await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(600);
      const after = await page.evaluate(() => ({ parks: window.__game.parkDefs.length, lot: !!window.__game.golf.range.lot, placing: window.__game.placing?.id ?? null }));
      check(after.parks === before + 1 && after.lot, `the click builds the car park (${JSON.stringify(after)})`);
      await settle(page, 900); await shot(page, `du${du}-built`);
    } else check(false, 'an allowed car park spot beside the range');
    summary.push(rows);
    await ctx.close();
  }
  writeFileSync(join(out, `${tag}-verdicts.json`), JSON.stringify(summary, null, 1));
  console.log(`verdicts: ${join(out, `${tag}-verdicts.json`)}`);
} finally { await browser.close(); }
process.exit(bad ? 1 : 0);
