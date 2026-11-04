// T214 (#559, plan P26 phases 3-4): in-game shots of the pro's office, the teaching hut, the Staff card, a lesson and the staff in the world, on a
// new range start: the clubhouse placed by the game's own ghost (a spot found by scanning the screen), the office and the hut likewise (each
// refused spot's reason logged and one shot of a red ghost), the Staff card empty and full, your lesson booked from the talk card and taken
// with a bucket, the people at the hut and the office through the day.
//   node scripts/dev/pros-shots.mjs --base http://127.0.0.1:5186/ --out F:/ClaudeTemp/T214
// Needs a dev server (vite) on --base. One headless Edge, closed when done. Saves are not written to the server (non-GET requests are answered here).
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://127.0.0.1:5186/'), out = opt('out', 'output/pros-shots');
mkdirSync(out, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });

const W = 1600, H = 1000;
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const toasts = [];
page.on('pageerror', e => console.log('[pageerror]', e.message));
page.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 300)); });
await page.route('**/*', r => { const x = r.request(); return x.method() !== 'GET' && x.method() !== 'HEAD' ? r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }) : r.continue(); });
const shot = async (name, el) => { const f = join(out, `${name}.png`); if (el) await page.locator(el).first().screenshot({ path: f }); else await page.screenshot({ path: f }); console.log('shot', f); };

/** scans the screen for a spot the ghost accepts: update(mx, my) then the hover's why; returns the first free spot, or logs the reasons met */
async function findSpot(kind, near, reach = 400, step = 12) {
  return page.evaluate(([kind, near, reach, step]) => {
    const g = window.__game, upd = kind === 'club' ? (x, y) => g.clubUpdate(x, y) : (x, y) => g.proUpdate(x, y);
    const c = g.screen(near.x, near.y), cx = c.x / g.dpr, cy = c.y / g.dpr, whys = {};
    for (let r = 0; r <= reach; r += step) for (let a = 0; a < Math.max(1, Math.round(2 * Math.PI * r / step)); a++) {
      const t = a / Math.max(1, Math.round(2 * Math.PI * r / step)) * Math.PI * 2, mx = cx + Math.cos(t) * r, my = cy + Math.sin(t) * r;
      if (mx < 380 || my < 120 || mx > innerWidth - 20 || my > innerHeight - 80) continue;
      upd(mx, my); const h = g.bizHover; if (!h) continue;
      if (!h.why) return { mx, my, def: h.def, whys };
      whys[h.why] = (whys[h.why] ?? 0) + 1;
    }
    return { mx: null, whys };
  }, [kind, near, reach, step]);
}

try {
  await page.goto(`${base}?seed=${opt('seed', '7')}`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 300000 });
  await page.evaluate(() => { const g = window.__game; g.closeWelcome?.(false); g.closeWho?.('Pat Owner', 0); g.setSpeed(0); g.traffic.spend('business', -2000000); g.emit(); });
  await sleep(1500);
  const info = await page.evaluate(() => { const g = window.__game; const r = g.bizDefs.find(d => d.type === 'range'); return { start: g.golf?.start, range: r, money: g.money, club: g.golf?.clubhouse, z: g.cam.z }; });
  console.log('start', JSON.stringify(info));
  const rc = { x: info.range.x + info.range.w / 2, y: info.range.y + info.range.h / 2 };
  await page.evaluate(([x, y]) => { const g = window.__game; g.lookAt(x, y, 0.12); g.emit(); }, [rc.x, rc.y]);
  await sleep(1500);

  // the clubhouse, by the game's ghost
  await page.evaluate(() => window.__game.placeClubhouse(true));
  let s = await findSpot('club', rc, 600, 16);
  console.log('clubhouse spot', JSON.stringify(s));
  if (s.mx !== null) await page.evaluate(([x, y]) => { const g = window.__game; g.clubUpdate(x, y); g.clubClick(); }, [s.mx, s.my]);
  const club = await page.evaluate(() => window.__game.bizDefs.find(d => d.type === 'clubhouse'));
  console.log('clubhouse', JSON.stringify(club));
  if (club) { await page.evaluate(([x, y]) => { const g = window.__game; g.lookAt(x, y, 0.2); g.emit(); }, [club.x + club.w / 2, club.y + club.h / 2]); await sleep(3000); await shot('clubhouse-built'); }

  // a dirt cart path from the clubhouse's side out over your land (the office's front wants a path within 4 m: P26 3.1)
  const cc = club ? { x: club.x + club.w / 2, y: club.y + club.h / 2 } : rc;
  const paths = await page.evaluate(async c => {
    const g = window.__game, ok = (x, y) => g.ownedAt(x, y), built = [];
    for (const [ux, uy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) for (const side of [0.2, 0.5, 0.8]) {
      const a = { x: ux ? (ux > 0 ? c.x + c.w + 1.5 : c.x - 1.5) : c.x + c.w * side, y: uy ? (uy > 0 ? c.y + c.h + 1.5 : c.y - 1.5) : c.y + c.h * side };
      const b = { x: a.x + ux * 14, y: a.y + uy * 14 };
      let good = true; for (let k = 0; k <= 14; k++) if (!ok(a.x + (b.x - a.x) * k / 14, a.y + (b.y - a.y) * k / 14)) good = false;
      if (!good) continue;
      g.lookAt((a.x + b.x) / 2, (a.y + b.y) / 2, 0.2); g.setTool('path'); g.roadClass = 'cart-dirt'; g.emit();
      await new Promise(r => setTimeout(r, 300));
      const n0 = g.net.segs?.size ?? g.net.segs?.length ?? 0, pa = g.screen(a.x, a.y), pb = g.screen(b.x, b.y);
      g.roadClick(pa.x / g.dpr, pa.y / g.dpr); g.routeTap = null; g.roadClick(pb.x / g.dpr, pb.y / g.dpr); g.finishRoute(); g.cancelRoute?.(); g.emit();
      const n1 = g.net.segs?.size ?? g.net.segs?.length ?? 0; if (n1 !== n0) { built.push({ a, b }); if (built.length >= 2) return built; }
    }
    return built;
  }, club ?? { x: rc.x, y: rc.y, w: 1, h: 1 });
  const path = paths;
  console.log('cart path', JSON.stringify(path));
  await sleep(800);

  // the pro's office: its refused ghost on the range, then a free spot by the clubhouse
  await page.evaluate(([x, y]) => { const g = window.__game; g.lookAt(x, y, 0.2); g.placePro('prooffice'); g.emit(); }, [cc.x, cc.y]);
  await sleep(1200);
  const refused = await page.evaluate(([x, y]) => { const g = window.__game; g.lookAt(x, y, 0.2); const p = g.screen(x, y); g.proUpdate(p.x / g.dpr, p.y / g.dpr); g.emit(); return g.bizHover?.why; }, [rc.x + 6, rc.y + 30]);
  console.log('office refused on the range:', refused);
  await sleep(500); await shot('office-ghost-refused');
  s = await findSpot('pro', cc, 400, 10);
  console.log('office spot', JSON.stringify(s));
  if (s.mx !== null) { await page.evaluate(([x, y]) => { const g = window.__game; g.proUpdate(x, y); g.emit(); }, [s.mx, s.my]); await sleep(500); await shot('office-ghost-ok'); await page.evaluate(([x, y]) => { const g = window.__game; g.proUpdate(x, y); g.proClick(); }, [s.mx, s.my]); }
  await sleep(800);

  // the teaching hut by the range's mats
  const tee = await page.evaluate(() => { const sc = window.__game.range.scene, t = sc.teeBox; let x = 0, y = 0; for (let i = 0; i < t.length; i += 2) { x += t[i]; y += t[i + 1]; } return { x: x / (t.length / 2), y: y / (t.length / 2) }; });
  await page.evaluate(([x, y]) => { const g = window.__game; g.lookAt(x, y, 0.2); g.placePro('teachhut'); g.emit(); }, [tee.x, tee.y]);
  await sleep(1200);
  s = await findSpot('pro', tee, 500, 8);
  console.log('hut spot', JSON.stringify(s));
  if (s.mx !== null) await page.evaluate(([x, y]) => { const g = window.__game; g.proUpdate(x, y); g.proClick(); }, [s.mx, s.my]);
  await sleep(800);
  const built = await page.evaluate(() => window.__game.bizDefs.filter(d => d.type === 'prooffice' || d.type === 'teachhut'));
  console.log('built', JSON.stringify(built));

  // the Staff card: empty, then hired
  await page.evaluate(() => { const g = window.__game; g.openClubCard(false); g.openStaffCard(true); g.emit(); });
  await sleep(600); await shot('staff-card-empty', '[data-testid="staff-card"]');
  await page.evaluate(() => { const g = window.__game, h = g.bizDefs.find(d => d.type === 'teachhut'); g.hireClubStaff('head', null); g.hireClubStaff('teach', h?.id ?? null); g.hireClubStaff('sec', null); g.emit(); });
  await sleep(600); await shot('staff-card-full', '[data-testid="staff-card"]');
  console.log('staff line:', await page.evaluate(() => window.__game.staffLine()));
  await page.evaluate(() => { const g = window.__game; g.openClubCard(true); g.emit(); });
  await sleep(600); await shot('club-and-staff-cards');
  // Let go's inline confirm
  await page.locator('[data-testid="staff-letgo"]').first().click(); await sleep(300); await shot('staff-letgo-confirm', '[data-testid="staff-card"]');
  await page.locator('[data-testid="staff-no"]').first().click();

  // a working morning: 10:00, the people at the hut and the office
  await page.evaluate(() => { const g = window.__game; g.openStaffCard(false); g.openClubCard(false); g.setTool('select'); g.emit(); });
  const minute = await page.evaluate(async () => { const g = window.__game; g.setSpeed(4); for (let i = 0; i < 600; i++) { const t = g.townNow(); if (t.dayMin >= 600 && t.dayMin < 1000) break; await new Promise(r => setTimeout(r, 100)); } g.setSpeed(1); return g.townNow().dayMin; });
  console.log('day minute', minute);
  const hut = built.find(d => d.type === 'teachhut'), off = built.find(d => d.type === 'prooffice');
  for (const [name, d] of [['people-hut', hut], ['people-office', off]]) {
    if (!d) continue;
    await page.evaluate(([x, y]) => { const g = window.__game; g.lookAt(x, y, 0.3); g.emit(); }, [d.x + d.w / 2, d.y + d.h / 2]);
    for (let k = 0; k < 3; k++) { await sleep(2500); await shot(`${name}-${k}`); }
  }
  const seen = await page.evaluate(() => window.__game.proSeen.map(p => ({ ...p })));
  console.log('pros drawn', JSON.stringify(seen));

  // your lesson: talk to the teaching pro, book, hit a bucket
  const r = await page.evaluate(() => {
    const g = window.__game, pros = g.golf.crew.staff.pros, k = pros.findIndex(p => p.role === 'teach'), p = pros[k];
    g.youTalkTo(p.name, 'your teaching pro', { x: g.you?.x ?? 0, y: g.you?.y ?? 0 }, null, 'teach'); g.emit();
    return { name: p.name, view: g.lessonView() };
  });
  console.log('talk', JSON.stringify(r));
  await sleep(500); await shot('talk-lesson', '[data-testid="talk-card"]');
  await page.evaluate(() => { const g = window.__game; g.bookLesson(); g.emit(); });
  await sleep(400); await shot('talk-lesson-booked', '[data-testid="talk-card"]');
  const after = await page.evaluate(() => {
    const g = window.__game, before = { ...g.golf.player.skills }; g.closeYouTalk(); const lf = g.lessonFor('bucket'); g.practise('bucket');
    const e = g.golf.player.log.at(-1); return { lesson: lf, before, after: g.golf.player.skills, entry: e, booked: g.golf.player.lesson };
  });
  console.log('practice', JSON.stringify(after));
  // the months go by: the hut's lessons and the members' (golf/pros.ts lessonsMonth), the head pro's sales, the wages; the Staff card after
  const months = await page.evaluate(async () => {
    const g = window.__game, m0 = g.golfMonthIndex(), money0 = g.money; g.setSpeed(20);
    for (let i = 0; i < 900 && g.golfMonthIndex() < m0 + 4; i++) await new Promise(r => setTimeout(r, 100));
    g.setSpeed(0); g.emit();
    const st = g.golf.crew.staff; return { months: g.golfMonthIndex() - m0, pros: st.pros, seen: st.seen, club: g.golf.club?.members, range: g.golf.range?.total };
  });
  console.log('months on', JSON.stringify(months));
  await page.evaluate(() => { const g = window.__game; g.openClubCard(false); g.openStaffCard(true); g.emit(); });
  await sleep(600); await shot('staff-card-after', '[data-testid="staff-card"]');
  const hut2 = built.find(d => d.type === 'teachhut');
  if (hut2) { await page.evaluate(([x, y]) => { const g = window.__game; g.openStaffCard(false); g.lookAt(x, y, 0.3); g.emit(); }, [hut2.x + 1, hut2.y + 1]); await sleep(2500); await shot('hut-close'); }
} finally {
  await browser.close();
}
