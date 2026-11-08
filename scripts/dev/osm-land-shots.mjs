// T357 (#999): the real ground height as the game draws it: each map-data course before (?land=0: the flat plain, as before T357) and after (the land under it), at the
// overview and at the middle zoom over the hole pair that runs over the most ground, and the slope reading under a ball on a sloping fairway (your walk-on round: the drive,
// then Jump to ball: the shot panel names the lie's slope). Checks the game state as it goes (the land laid, level greens, the greens' tilt, the ball reads the ground) and
// exits 1 on a failed check.
//   node scripts/dev/osm-land-shots.mjs --base http://localhost:5188/ --out E:/ClaudeTemp/T357 [--course woodhill,rondebosch,magnolia-national] [--slope 1] [--sheet 1]
//        [--look name:dx:dy:zoom,...] (extra views: the camera at a point dx, dy tiles from the land's north-west corner, at that zoom, before and after)
// Needs a dev server (vite) on --base. One headless Edge, closed when done; saving is off (?osmcourse= is a fixture-style start). --sheet 1 lays each course's before and after
// side by side as <id>-before-after-<view>.png.
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const looks = opt('look', '').split(',').filter(Boolean).map(t => { const [name, dx, dy, z] = t.split(':'); return { name, dx: +dx, dy: +dy, z: +z }; });
const base = opt('base', 'http://localhost:5188/'), out = opt('out', 'E:/ClaudeTemp/T357'), which = opt('course', 'woodhill,rondebosch,magnolia-national'), slope = opt('slope', '1') === '1', sheet = opt('sheet', '1') === '1';
// the hole pair of the middle zoom: where the ground rises and falls most (Woodhill's NE hill, Rondebosch's rise to the south west, Magnolia's creek)
// slopeHole: the hole whose fairway the second slope reading is taken on (the ball put 40% of the way down it, aimed at its pin): where it falls most
const ALL = [{ id: 'woodhill', holes: [5, 6], mid: 0.07, slopeHole: 6 }, { id: 'rondebosch', holes: [16, 18], mid: 0.07, slopeHole: 14 }, { id: 'magnolia-national', holes: [11, 12], mid: 0.07, slopeHole: 2 }];
const COURSES = ALL.filter(c => which.split(',').includes(c.id));
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
/** the camera on the tile points, at the closest zoom that keeps them all on the screen (a margin round them) */
const frameOn = (page, pts, maxZ = 0.3) => page.evaluate(([pts, maxZ, W, H]) => {
  const g = window.__game, cx = pts.reduce((s, p) => s + p.x, 0) / pts.length, cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  const fits = z => { g.camEase = null; g.lookAt(cx, cy, z); return pts.every(p => { const s = g.screen(p.x, p.y), x = s.x / g.dpr, y = s.y / g.dpr; return x > 50 && x < W - 50 && y > 80 && y < H - 50; }); };
  let lo = 0.004, hi = maxZ; if (fits(hi)) { g.emit(); return hi; }
  for (let k = 0; k < 14; k++) { const m = (lo + hi) / 2; if (fits(m)) lo = m; else hi = m; }
  fits(lo); g.emit(); return lo;
}, [pts, maxZ, W, H]);
const side = async (a, b, file) => {
  const A = await sharp(a).resize({ height: 760 }).toBuffer(), B = await sharp(b).resize({ height: 760 }).toBuffer(), ma = await sharp(A).metadata(), mb = await sharp(B).metadata();
  await sharp({ create: { width: ma.width + mb.width + 30, height: 760, channels: 3, background: '#0b1220' } }).composite([{ input: A, left: 0, top: 0 }, { input: B, left: ma.width + 30, top: 0 }]).png().toFile(file);
  console.log('  ' + file);
};

try {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  for (const c of COURSES) {
    console.log(`\n== ${c.id}`);
    const files = { before: {}, after: {} };
    for (const mode of [{ key: 'before', q: '&land=0' }, { key: 'after', q: '' }]) {
      console.log(` -- ${mode.key}`);
      const page = await ctx.newPage();
      page.on('pageerror', e => { console.log('[pageerror]', e.message); bad++; });
      page.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 300)); });
      await page.route('**/*', r => { const x = r.request(); return x.method() !== 'GET' && x.method() !== 'HEAD' ? r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }) : r.continue(); });
      await page.goto(`${base}?osmcourse=${c.id}&seed=1${mode.q}`, { waitUntil: 'domcontentloaded', timeout: 240000 });
      await page.waitForFunction(() => window.__game?.ready, null, { timeout: 400000 });
      await page.evaluate(() => { const g = window.__game; g.prebake = () => {}; g.setSpeed(0); window.__night = 0; g.nightAmount = () => window.__night; g.closeWho?.('Jack Burns', 2); g.closeWelcome?.(false); const p = g.golf.progress; if (p) { for (const k of ['who', 'welcome']) if (!p.seen.includes(k)) p.seen.push(k); if (p.tour) p.tour.off = true; } g.emit(); });
      const info = await page.evaluate(() => {
        const g = window.__game, G = g.golf, li = g.landInfo(), at = (x, y) => g.groundHeightAt(x, y);
        // the ground along each hole: tee to pin, and the steepest 10 m stretch of its line
        const holes = G.pins.map(p => { const t = G.tees.find(q => q.hole === p.hole && q.kind === 'middle') ?? G.tees.find(q => q.hole === p.hole); return { n: p.hole, rise: +(at(p.x, p.y) - at(t.x, t.y)).toFixed(1) }; });
        return { land: li, course: G.course, courseRev: g.courseHeight.rev, landBox: g.realLand.box, holes, tilts: g.courseHeight.rev };
      });
      console.log('  game', JSON.stringify({ land: info.land, courseRev: info.courseRev, landBox: info.landBox }));
      console.log('  rise tee to pin (m):', info.holes.map(h => `${h.n}:${h.rise}`).join(' '));
      if (mode.key === 'after') {
        check(!!info.land && info.land.reliefM > 15, `the game has real ground (${info.land?.label}, ${info.land?.reliefM} m of rise across the land)`);
        check(info.courseRev >= 1, 'the greens have their designed tilt in the course height');
        check(info.holes.some(h => Math.abs(h.rise) > 8), 'some hole climbs or falls more than 8 m');
      } else {
        check(!info.land && info.courseRev === 0 && info.holes.every(h => h.rise === 0), '?land=0 is the flat plain as before');
      }
      const land = info.course, corners = [{ x: land[0], y: land[1] }, { x: land[0] + land[2], y: land[1] }, { x: land[0], y: land[1] + land[3] }, { x: land[0] + land[2], y: land[1] + land[3] }];
      // the overview, the whole land
      const zOver = await frameOn(page, corners, 0.3); console.log('  overview zoom', zOver.toFixed(4)); await settle(page, 1500);
      files[mode.key].over = await shot(page, `${c.id}-${mode.key}-1-overview`);
      // the middle zoom over the pair
      const pts = await page.evaluate(holes => { const G = window.__game.golf, o = []; for (const n of holes) { for (const t of G.tees.filter(q => q.hole === n)) o.push({ x: t.x, y: t.y }); for (const a of G.aims.filter(q => q.hole === n)) o.push({ x: a.x, y: a.y }); const p = G.pins.find(q => q.hole === n); if (p) o.push({ x: p.x, y: p.y }); } return o; }, c.holes);
      const z = await frameOn(page, pts, 0.3), z2 = Math.max(z, c.mid);
      if (z2 !== z) await page.evaluate(([z2, pts]) => { const g = window.__game, cx = pts.reduce((s, p) => s + p.x, 0) / pts.length, cy = pts.reduce((s, p) => s + p.y, 0) / pts.length; g.camEase = null; g.lookAt(cx, cy, z2); g.emit(); }, [z2, pts]);
      console.log(`  holes ${c.holes.join(' and ')} zoom`, z2.toFixed(3)); await settle(page, 1500);
      files[mode.key].mid = await shot(page, `${c.id}-${mode.key}-2-mid-holes-${c.holes.join('-')}`);
      // the close zoom on a green (level, with its own tilt): the pin of the first hole of the pair
      const pin = await page.evaluate(n => { const p = window.__game.golf.pins.find(q => q.hole === n); return { x: p.x, y: p.y }; }, c.holes[0]);
      await page.evaluate(([x, y]) => { const g = window.__game; g.camEase = null; g.lookAt(x, y, 0.3); g.emit(); }, [pin.x, pin.y]); await settle(page, 1500);
      files[mode.key].green = await shot(page, `${c.id}-${mode.key}-3-green-${c.holes[0]}`);

      // extra views of the land (--look): the camera at a point of the land's frame
      for (const l of looks) {
        const o = await page.evaluate(([dx, dy, z]) => { const g = window.__game, c = g.golf.course; g.camEase = null; g.lookAt(c[0] + dx, c[1] + dy, z); g.emit(); return { x: c[0] + dx, y: c[1] + dy, h: g.groundHeightAt(c[0] + dx, c[1] + dy) }; }, [l.dx, l.dy, l.z]);
        await settle(page, 1500); console.log(`  look ${l.name} at ${o.x},${o.y} ground ${o.h.toFixed(1)} m`);
        files[mode.key][`look-${l.name}`] = await shot(page, `${c.id}-${mode.key}-look-${l.name}`);
      }

      // the slope reading: your walk-on round, the drive, Jump to ball: the shot panel names the lie's slope
      if (mode.key === 'after' && slope) {
        await page.evaluate(() => window.__game.setSpeed(1));
        const tee1 = await page.evaluate(() => { const t = window.__game.golf.tees.find(t => t.hole === 1 && t.kind === 'middle') ?? window.__game.golf.tees.find(t => t.hole === 1); return { x: t.x, y: t.y }; });
        await page.evaluate(([x, y]) => { const g = window.__game; g.you.x = x - 3; g.you.y = y + 1; g.youMe?.(); g.camEase = null; g.lookAt(x, y, 0.3); g.emit(); }, [tee1.x, tee1.y]);
        await settle(page, 1200);
        await page.evaluate(() => { const g = window.__game; if (!g.youTeeOpen) { g.youTeeOpen = true; g.emit(); } });
        const choice = await page.waitForSelector('[data-testid=tee-play]', { timeout: 15000 }).then(() => true).catch(() => false);
        check(choice, 'the first tee offers the walk-on round');
        if (choice) {
          await page.click('[data-testid=tee-play-all]'); await page.waitForTimeout(800);
          await page.waitForFunction(() => !!window.__game.shotState(), null, { timeout: 12000 }).catch(async () => { await page.click('[data-testid=you-jump]').catch(() => undefined); });
          await page.waitForTimeout(800); await settle(page, 600);
          const tee = await page.evaluate(() => { const c = window.__game.shotConditions(); return c && { on: c.on, slope: c.slope, lines: c.slopeLines, plays: c.playsLikeM, aimed: c.aimedM }; });
          console.log('  on the tee:', JSON.stringify(tee));
          await page.evaluate(() => window.__game.ownerSwing({ power: 0.95, acc: 0.0, boost: 0.0 }));
          await page.waitForTimeout(1400);
          await page.waitForFunction(() => !window.__game.yourRoundView()?.flying, null, { timeout: 20000 }).catch(() => console.log('  (still flying)'));
          await page.waitForTimeout(600);
          await page.click('[data-testid=you-jump]').catch(() => console.log('  (no jump button)'));
          await page.waitForFunction(() => !!window.__game.shotState(), null, { timeout: 15000 }).catch(() => console.log('  (no address after the jump)'));
          await page.waitForTimeout(600); await settle(page, 500);
          const lie = await page.evaluate(() => { const g = window.__game, c = g.shotConditions(), t = g.shotState(); return c && { lie: c.lie?.name ?? null, slope: c.slope, lines: c.slopeLines, ball: t?.turn?.ball ?? null, ground: t ? g.groundHeightAt(t.turn.ball.x, t.turn.ball.y) : null }; });
          console.log('  in the fairway:', JSON.stringify(lie));
          check(!!lie && (Math.abs(lie.slope.up) > 0.005 || Math.abs(lie.slope.across) > 0.005), `the lie's slope reads ${lie ? `${(lie.slope.up * 100).toFixed(1)}% along and ${(lie.slope.across * 100).toFixed(1)}% across` : ''}: ${lie?.lines.join(' | ') || '(nothing to say)'}`);
          await shot(page, `${c.id}-after-4-slope-reading-address`);
          // the same reading on a hole that falls: the ball put 40% of the way down its line, the aim at its pin (the shot state's ball and aim are all that change: the
          // panel works the lie's slope out from the ground under the ball as it does anywhere)
          const spot = await page.evaluate(n => {
            const g = window.__game, G = g.golf, p = G.pins.find(q => q.hole === n), t = G.tees.find(q => q.hole === n && q.kind === 'middle') ?? G.tees.find(q => q.hole === n), s0 = g.shotState();
            if (!s0 || !p || !t) return null;
            const bx = t.x + (p.x - t.x) * 0.4, by = t.y + (p.y - t.y) * 0.4;
            g.shot = { ...s0, turn: { ...s0.turn, ball: { x: bx, y: by } }, input: { ...s0.input, aim: { x: p.x, y: p.y } } };
            g.camEase = null; g.lookAt(bx, by, 0.3); g.emit();
            const c2 = g.shotConditions();
            return { hole: n, ball: { x: +bx.toFixed(1), y: +by.toFixed(1) }, ground: +g.groundHeightAt(bx, by).toFixed(1), slope: c2.slope, lines: c2.slopeLines, plays: Math.round(c2.playsLikeM), aimed: Math.round(c2.aimedM) };
          }, c.slopeHole);
          console.log('  on hole', c.slopeHole, 'fairway:', JSON.stringify(spot));
          await settle(page, 1200);
          check(!!spot && Math.abs(spot.slope.up) > 0.02 && spot.lines.length > 0, `hole ${c.slopeHole}: the lie reads ${spot ? `${(spot.slope.up * 100).toFixed(1)}% along the shot` : ''}: ${spot?.lines.join(' | ')}`);
          await shot(page, `${c.id}-after-5-slope-reading-hole-${c.slopeHole}`);
        }
      }
      await page.close();
    }
    if (sheet) for (const [k, n] of [['over', '1-overview'], ['mid', '2-mid'], ['green', '3-green'], ...looks.map(l => [`look-${l.name}`, `look-${l.name}`])]) await side(files.before[k], files.after[k], join(out, `${c.id}-before-after-${n}.png`)).catch(e => console.log('  (sheet:', e.message, ')'));
  }
} finally {
  await browser.close();
}
console.log(bad ? `\n${bad} check(s) failed` : '\nall checks pass');
process.exit(bad ? 1 : 0);
