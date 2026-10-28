// T254 (#736): in-game shots of Edit Hole Layout and the four tee sets on the old nine (?start=town):
// - hole-card-tee-sets: the hole card with Edit Hole Layout, each set's length and par, and "Add tee";
// - four-tee-sets-30: a hole's four tee boxes (blue, white, yellow, red markers) at the closest zoom (30%);
// - layout-edit: Edit Hole Layout moving the tee and the green: the plan with its warnings before, then the markers moved and the grass unchanged,
//   the card's warning after;
// - golfers-tees: a tournament golfer on the blue tee, and an everyday member on the white.
//   node scripts/dev/tee-sets-shots.mjs --base http://127.0.0.1:5187/ --out E:/ClaudeTemp/T254 [--only card,layout,golfers]
// Needs a dev server (vite) on --base. One headless Edge, closed when done. Saves are not written (non-GET requests are answered locally).
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://127.0.0.1:5187/'), out = opt('out', 'output/tee-sets-shots'), only = opt('only', 'card,layout,golfers').split(',');
const W = 1366, H = 768;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const save = async (buf, name) => { const file = join(out, `${name}.jpg`); await sharp(buf).jpeg({ quality: 86, mozjpeg: true }).toFile(file); console.log(file); return file; };
/** two pngs side by side, each with a caption bar */
async function pair(a, b, ca, cb, name) {
  const cap = t => Buffer.from(`<svg width="${W}" height="36"><rect width="100%" height="100%" fill="#0b1220"/><text x="14" y="25" font-family="Segoe UI, sans-serif" font-size="20" font-weight="700" fill="#ffd166">${t}</text></svg>`);
  const col = async (png, t) => sharp({ create: { width: W, height: H + 36, channels: 3, background: '#0b1220' } }).composite([{ input: cap(t), top: 0, left: 0 }, { input: png, top: 36, left: 0 }]).png().toBuffer();
  const [x, y] = [await col(a, ca), await col(b, cb)];
  const img = await sharp({ create: { width: W * 2 + 8, height: H + 36, channels: 3, background: '#000' } }).composite([{ input: x, top: 0, left: 0 }, { input: y, top: 0, left: W + 8 }]).png().toBuffer();
  return save(await sharp(img).resize({ width: 2200 }).png().toBuffer(), name);
}
/** wait until no chunk bake is in flight for a moment */
const settle = async (page, ms = 900) => {
  await page.waitForTimeout(ms);
  await page.evaluate(() => { window.__calm = 0; });
  await page.waitForFunction(() => { const g = window.__game; window.__calm = g.ground.busy === 0 ? window.__calm + 1 : 0; return window.__calm > 20; }, null, { timeout: 60000, polling: 50 }).catch(() => console.log('  (settle timed out)'));
  await page.waitForTimeout(300);
};
async function open(url) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => { try { localStorage.clear(); } catch { /* none */ } });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  page.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 300)); });
  await page.route('**/*', r => { const x = r.request(); return x.method() !== 'GET' && x.method() !== 'HEAD' ? r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }) : r.continue(); });
  await page.goto(`${base}${url}`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 300000 });
  await page.evaluate(() => { const g = window.__game; g.setSpeed(0); g.closeWelcome?.(false); g.emit(); });
  await page.addStyleTag({ content: 'html.noui * { visibility: hidden !important } html.noui canvas { visibility: visible !important }' });
  await settle(page, 1500);
  return { ctx, page };
}
const look = (page, x, y, z) => page.evaluate(([x, y, z]) => { const g = window.__game; g.camEase = null; g.lookAt(x, y, z); g.emit(); }, [x, y, z]);
/** the css px of tile (x, y) */
const px = (page, x, y) => page.evaluate(([x, y]) => { const g = window.__game, s = g.screen(x, y); return { x: s.x / g.dpr, y: s.y / g.dpr }; }, [x, y]);
const png = page => page.screenshot({ type: 'png' });
/** a drag on the map from tile a to tile b (the real pointer: the engine's own path) */
async function drag(page, a, b, steps = 12) {
  const p = await px(page, a.x, a.y), q = await px(page, b.x, b.y);
  await page.mouse.move(p.x, p.y); await page.mouse.down();
  for (let k = 1; k <= steps; k++) await page.mouse.move(p.x + (q.x - p.x) * k / steps, p.y + (q.y - p.y) * k / steps);
  await page.mouse.up();
}
/** the grid's cells as one string (the layout edit must not change it) */
const gridKey = page => page.evaluate(() => { const g = window.__game.courseGrid; let h = 0; for (const a of [g.surf, g.hole, g.month]) for (let i = 0; i < a.length; i++) h = (h * 31 + a[i] + i) | 0; return `${g.rev}:${h}`; });
/** hole 1 of the old nine taken back to the land and built again with New hole on its own line (so it has a plan: Edit Hole Layout works on it),
 *  then its blue, yellow and red tees added from the card's Add tee */
async function plannedHole(page) {
  const h = await page.evaluate(() => {
    const g = window.__game, gs = g.golf, n = 1, pin = gs.pins.find(p => p.hole === n), tee = gs.tees.find(t => t.hole === n && t.kind === 'back') ?? gs.tees.find(t => t.hole === n);
    return { n, pin: { x: pin.x, y: pin.y }, tee: { x: tee.x, y: tee.y } };
  });
  // (the old nine's markers were placed by the course, not fitted: they go by hand with the hole)
  await page.evaluate(n => { const g = window.__game; g.deleteHole(n, false); g.removeGolfMarker(n, 'pin'); for (const k of ['back', 'middle', 'senior', 'forward']) g.removeGolfMarker(n, k); g.setTool('course'); g.paint.setPlan(n); g.emit(); }, h.n);
  // the hole a little right of the middle, clear of the Holes panel on the left
  await look(page, (h.tee.x + h.pin.x) / 2, (h.tee.y + h.pin.y) / 2, 0.07); await sleep(300);
  await page.evaluate(([W, H]) => { const g = window.__game, c = g.tileAt(W / 2 - 180, H / 2); g.camEase = null; g.lookAt(c.x, c.y, 0.07); g.emit(); }, [W, H]); await sleep(500);
  // the tee click frames the camera round it (T119): each spot is found on screen just before its click
  for (const p of [h.tee, h.pin]) {
    await page.evaluate(() => { window.__game.camEase = null; }); await sleep(300);
    const s = await px(page, p.x, p.y);
    await page.mouse.move(s.x - 20, s.y - 10); await page.mouse.move(s.x, s.y, { steps: 4 }); await sleep(200);
    console.log('  click', JSON.stringify(p), JSON.stringify(s), await page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y), g = window.__game; return `${e?.tagName}.${e?.className} hover=${JSON.stringify(g.hover)} step=${g.paint.wizard.step} mode=${g.paint.mode} tool=${g.tool}`; }, [s.x, s.y]));
    await page.mouse.down(); await sleep(60); await page.mouse.up(); await sleep(900);
  }
  console.log('  New hole:', JSON.stringify(await page.evaluate(() => { const p = window.__game.paint; return { step: p.wizard.step, hole: p.wizard.hole, ok: p.wizard.check().why || 'ok' }; })));
  console.log('  built:', await page.evaluate(() => window.__game.paint.buildPlan()));
  await settle(page, 2500);
  for (const k of ['back', 'senior', 'forward']) console.log(`  add ${k}:`, await page.evaluate(([n, k]) => window.__game.addTeeSet(n, k) || window.__game.toasts.slice(-1)[0]?.text, [h.n, k]));
  await settle(page, 2500);
  console.log('  tees:', JSON.stringify(await page.evaluate(n => window.__game.golf.tees.filter(t => t.hole === n), h.n)));
  return h;
}

try {
  if (only.includes('card') || only.includes('layout')) {
    const { ctx, page } = await open(`?start=town&seed=${opt('seed', '7')}`);
    const h = await plannedHole(page);
    const teeMid = await page.evaluate(n => { const t = window.__game.golf.tees.filter(q => q.hole === n); return { x: t.reduce((s, q) => s + q.x, 0) / t.length, y: t.reduce((s, q) => s + q.y, 0) / t.length }; }, h.n);
    // the card: Edit Hole Layout, each set's length and par, Add tee (none left to add: the four are laid)
    await page.evaluate(n => { const g = window.__game; g.setTool('select'); g.openHoleCard(n); g.emit(); }, h.n);
    await look(page, teeMid.x, teeMid.y, 0.14); await settle(page, 1500);
    await page.mouse.move(W / 2, H - 30); await sleep(400);
    await save(await png(page), 'hole-card-tee-sets');
    console.log('  card:', JSON.stringify(await page.evaluate(() => window.__game.holeCardView()?.tees)));
    // the four sets' tee boxes and markers at 30%
    await page.evaluate(() => { window.__game.closeHoleCard(); window.__game.emit(); });
    await look(page, teeMid.x, teeMid.y, 0.3); await settle(page, 2000);
    await page.evaluate(() => document.documentElement.classList.add('noui')); await sleep(400);
    await save(await png(page), 'four-tee-sets-30');
    await page.evaluate(() => document.documentElement.classList.remove('noui'));
    if (only.includes('layout')) {
      // Edit Hole Layout: the tee 30 m back off its box, the green 40 m across off its green
      const before = await gridKey(page);
      await page.evaluate(n => { window.__game.editHole(n); }, h.n); await sleep(400);
      const plan = await page.evaluate(() => { const w = window.__game.paint.wizard; return { tee: w.plan.tee, green: w.plan.green }; });
      const mid = { x: (plan.tee.x + plan.green.x) / 2, y: (plan.tee.y + plan.green.y) / 2 };
      // the hole right of the Holes panel: its middle at 62% across
      await look(page, mid.x, mid.y, 0.09); await sleep(200);
      await page.evaluate(([W, H]) => { const g = window.__game, c = g.tileAt(W / 2 - 0.14 * W, H / 2); g.camEase = null; g.lookAt(c.x, c.y, 0.09); g.emit(); }, [W, H]); await settle(page, 800);
      const dx = plan.green.x - plan.tee.x, dy = plan.green.y - plan.tee.y, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L;
      await drag(page, plan.green, { x: plan.green.x - uy * 20, y: plan.green.y + ux * 20 });
      await drag(page, plan.tee, { x: plan.tee.x - ux * 15, y: plan.tee.y - uy * 15 });
      await sleep(500); await page.mouse.move(W / 2, H - 30); await sleep(300);
      console.log('  checks:', JSON.stringify(await page.evaluate(() => window.__game.paint.wizard.checks().map(c => `${c.kind}: ${c.text}`))));
      const editShot = await png(page);
      console.log('  Move tees and flag:', await page.evaluate(() => window.__game.paint.buildPlan()));
      await settle(page, 1500);
      const after = await gridKey(page);
      console.log('  grid before', before, 'after', after, before === after ? '(unchanged)' : '!! CHANGED');
      console.log('  toast:', await page.evaluate(() => window.__game.toasts.slice(-1)[0]?.text));
      await page.evaluate(n => { const g = window.__game; g.setTool('select'); g.openHoleCard(n); g.emit(); }, h.n);
      // the moved tee sets (off their boxes, the grass as it was) left of the card, close in
      const tm = await page.evaluate(n => { const t = window.__game.golf.tees.filter(q => q.hole === n); return { x: t.reduce((s, q) => s + q.x, 0) / t.length, y: t.reduce((s, q) => s + q.y, 0) / t.length }; }, h.n);
      await look(page, tm.x, tm.y, 0.2); await sleep(200);
      await page.evaluate(([W, H]) => { const g = window.__game, c = g.tileAt(W / 2 + 0.13 * W, H / 2); g.camEase = null; g.lookAt(c.x, c.y, 0.2); g.emit(); }, [W, H]);
      await settle(page, 1200); await page.mouse.move(W / 2, H - 30); await sleep(400);
      const afterShot = await png(page);
      console.log('  card checks:', JSON.stringify(await page.evaluate(() => window.__game.holeCardView()?.checks.filter(c => !c.ok).map(c => c.text))));
      await pair(editShot, afterShot, 'Edit Hole Layout: tee and green dragged off their turf (the warnings)', 'After: the four tee sets moved off their boxes, no grass laid; the card warns', 'layout-edit');
    }
    await ctx.close();
  }
  if (only.includes('golfers')) {
    const { ctx, page } = await open(`?start=town&seed=${opt('seed', '7')}`);
    // hole 1 with its four sets on their own boxes (blue and white 25 m apart), then the everyday play is worked out again on it
    const h = await plannedHole(page);
    await page.evaluate(() => { const g = window.__game; g.setTool('select'); g.closeHoleCard(); g.dayPlay = null; g.dayCourse = null; g.emit(); });
    await page.keyboard.press('Escape'); await settle(page, 2500);
    const sets = await page.evaluate(n => window.__game.golf.tees.filter(t => t.hole === n), h.n);
    const blue = sets.find(t => t.kind === 'back'), white = sets.find(t => t.kind === 'middle');
    /** the camera between the blue and the white boxes at 30% (the stats chips and the board clear of them) */
    const frame = () => look(page, (blue.x + white.x) / 2, (blue.y + white.y) / 2 + 2, 0.3);
    /** the clock run up to minute t (by `now`), quickly and then slowly, and stopped there */
    const runTo = async (now, t) => {
      await page.evaluate(() => window.__game.setSpeed(8));
      await page.waitForFunction(([f, t]) => new Function(`return ${f}`)()(window.__game) >= t - 2, [now.toString(), t], { timeout: 300000, polling: 20 }).catch(() => console.log('  (the clock did not get there)'));
      await page.evaluate(() => window.__game.setSpeed(1));
      await page.waitForFunction(([f, t]) => new Function(`return ${f}`)()(window.__game) >= t - 0.12, [now.toString(), t], { timeout: 300000, polling: 10 }).catch(() => console.log('  (the clock did not get there)'));
      await page.evaluate(() => window.__game.setSpeed(0));
    };
    const quiet = async () => { await page.keyboard.press('Escape'); await page.mouse.move(W - 30, H / 2); await sleep(400); };
    // 1. an everyday member on the white tee: the town day's first white golfer's first stroke on hole 1
    const day = await page.evaluate(() => {
      const g = window.__game, d = g.dayPlay; if (!d) return null;
      const plan = d.view.plan, gs = plan.golfers, k = d.view.course?.holes?.findIndex?.(q => q.n === 1) ?? 0;
      const s = plan.shots.find(q => q.hole === Math.max(0, k) && q.stroke === 1 && gs[q.golfer]?.tees === 'middle' && q.t > g.dayMinute + 3);
      return s ? { t: s.t, from: s.from, who: gs[s.golfer].name, now: g.dayMinute } : { none: true, now: g.dayMinute, golfers: gs.length };
    });
    console.log('  everyday:', JSON.stringify(day), 'white', JSON.stringify(white));
    if (day && day.t) {
      await frame(); await runTo(g => g.dayMinute, day.t); await settle(page, 600); await quiet();
      console.log('  day minute', await page.evaluate(async who => {
        const g = window.__game, d = g.dayPlay, m = await import('/src/game/golf/play/round.ts'), plan = d.view.plan, id = plan.golfers.find(q => q.name === who).id;
        const s = m.stateAt(plan, d.view.view, g.dayMinute)[id];
        return JSON.stringify({ minute: g.dayMinute, id, x: s.x, y: s.y, action: s.action, hole: s.hole });
      }, day.who));
      await save(await png(page), 'golfer-member-white');
    }
    // 2. a tournament golfer on the blue tee: the field's first stroke on the first hole
    await page.evaluate(() => window.__game.skipToTournament());
    await page.waitForFunction(() => { const g = window.__game; return g.traffic.round.stage === 'surge' && !!g.playBoard(); }, null, { timeout: 240000, polling: 500 });
    const t1 = await page.evaluate(() => { const g = window.__game, pl = g.play, s = pl.plan.shots.find(q => q.hole === 0 && q.stroke === 1); return { t: s.t, from: s.from, who: pl.plan.golfers[s.golfer].name, tees: pl.plan.golfers[s.golfer].tees }; });
    console.log('  tournament:', JSON.stringify(t1), 'blue', JSON.stringify(blue));
    await frame(); await runTo(g => g.playBoard()?.minute ?? 0, t1.t); await settle(page, 600); await quiet();
    await save(await png(page), 'golfer-tournament-blue');
    await ctx.close();
  }
} finally {
  await browser.close();
}
