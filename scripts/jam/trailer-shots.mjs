// scripts/jam/trailer-shots.mjs: the trailer's shots (scripts/jam/trailer.mjs record; docs/jam/VIDEO.md). Each shot is recorded on its own into
// <out>/shots/<name>.mp4 (the cut, trailer-edit.mjs, takes the moments it needs). The robot plays the jam build as a player does: real clicks on the
// game's buttons and on the map (the pointer drawn where the mouse is), the golf view's own keys; the engine is read to know where things are and when a
// swing's meter reaches the aim (the gold mark a player releases on), and called only to place the camera.
//   --only a,b   record those shots alone (names below); --takes N   golf takes to try for a good one (default 3)
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SHOTS = ['menu', 'range-build', 'town-grow', 'town', 'hole-full', 'golf-new', 'texture', 'props-range', 'traffic', 'hole-build', 'paint', 'decor', 'golf-tee', 'golf-draw', 'golf-putt', 'range-practice', 'times', 'night', 'alive']; // (and import, golf-real: a new game on a real course, recorded last)

export async function record(env) {
  const { OUT, SAVE, WORLD, opt, has, launch, newPage, preview, freePort, Recorder, wait: realWait } = env;
  const FR = 1000 / 30; // (a frame of the clip)
  const only = opt('only', null)?.split(',') ?? null, want = s => !only || only.includes(s);
  let server = null, base = opt('base', null);
  if (!base) {
    if (!existsSync(resolve('dist-jam/index.html'))) { console.error('no dist-jam/index.html: npm run build:jam first (or --base a VITE_JAM=1 dev server)'); process.exit(2); }
    const port = await freePort();
    server = await preview({ root: resolve('.'), logLevel: 'error', build: { outDir: 'dist-jam' }, preview: { port, strictPort: true, host: '127.0.0.1' } });
    base = `http://127.0.0.1:${port}/`;
  }
  console.log('recording from', base);
  const browser = await launch(), done = [];
  let page = null, rec = null;
  const shot = async (name, fn) => {
    if (!want(name)) return;
    console.log('shot', name);
    try { await fn(); } catch (e) { console.log(`  ${name} failed: ${String(e?.message ?? e).split('\n')[0]}`); try { await rec?.stop(); } catch { /* none */ } done.push({ name, error: String(e?.message ?? e).split('\n')[0] }); }
  };
  /** the construction dust's state (build-dust.ts: armed, the town's lot queue, the particles alive), logged with each shot */
  const dustState = () => page.evaluate(() => { const g = window.__game; return g?.dust ? { armed: g.dust.arm.armed, quiet: Math.round(g.dust.arm.quietUntil - performance.now()), queue: g.lotQueue?.size ?? null, alive: g.dust.pool.n } : null; }).catch(() => null);
  const start = async n => { await rec.start(n); console.log(`   dust at ${n}:`, JSON.stringify(await dustState())); };
  /** a wait: while a shot records (step mode) it is that many frames of the clip, else real time */
  const wait = async ms => { if (rec?.on) await rec.tick(Math.max(1, Math.round(ms / FR))); else await realWait(ms); };
  /** until fn (in the page) is true: frame by frame while recording, else polled; false after ms */
  const stepUntil = async (fn, ms = 30000, arg) => {
    if (rec?.on) { for (let i = 0; i < ms / FR; i++) { if (await page.evaluate(fn, arg)) return true; await rec.tick(1); } return false; }
    return page.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);
  };
  const stop = async () => { const d = await dustState(); const r = await rec.stop(); if (r) r.dust = d; if (r) { console.log('  ', JSON.stringify(r)); done.push(r); } return r; };

  // ---------- helpers on the current page
  const G = fn => page.evaluate(fn);
  const ev = (fn, a) => page.evaluate(fn, a);
  /** the pointer glides to (x, y) over ms, eased, as a hand moves a mouse */
  const glide = async (x, y, ms = 600) => {
    const from = await ev(() => window.__trailerMouse ?? { x: 960, y: 540 }), t0 = Date.now(), ease = t => t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    if (rec?.on) { const n = Math.max(1, Math.round(ms / FR)); for (let i = 1; i <= n; i++) { const e = ease(i / n); await page.mouse.move(from.x + (x - from.x) * e, from.y + (y - from.y) * e); await rec.tick(1); } }
    else for (;;) { const t = Math.min(1, (Date.now() - t0) / ms), e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2; await page.mouse.move(from.x + (x - from.x) * e, from.y + (y - from.y) * e); if (t >= 1) break; await wait(20); }
    await ev(p => { window.__trailerMouse = p; }, { x, y });
  };
  const clickAt = async (x, y, ms = 500) => { await glide(x, y, ms); await wait(120); await page.mouse.down(); await wait(70); await page.mouse.up(); };
  /** a stroke: press at the first point, drag through the rest */
  const stroke = async (pts, ms = 900) => {
    await glide(pts[0].x, pts[0].y, 400); await page.mouse.down();
    for (let k = 1; k < pts.length; k++) { const a = pts[k - 1], b = pts[k], seg = ms / (pts.length - 1), t0 = Date.now();
      if (rec?.on) { const n = Math.max(1, Math.round(seg / FR)); for (let i = 1; i <= n; i++) { await page.mouse.move(a.x + (b.x - a.x) * i / n, a.y + (b.y - a.y) * i / n); await rec.tick(1); } continue; }
      for (;;) { const t = Math.min(1, (Date.now() - t0) / seg); await page.mouse.move(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t); if (t >= 1) break; await wait(15); } }
    await page.mouse.up(); const l = pts[pts.length - 1]; await ev(p => { window.__trailerMouse = p; }, l);
  };
  const clickSel = async (sel, ms = 450) => {
    const loc = page.locator(sel).first();
    if (rec?.on) for (let i = 0; i < 150 && !(await loc.isVisible().catch(() => false)); i++) await rec.tick(1); // (the page's own timers run on the clip's clock)
    await loc.waitFor({ state: 'visible', timeout: 15000 });
    const b = await loc.boundingBox(); await clickAt(b.x + b.width / 2, b.y + b.height / 2, ms);
  };
  /** tile -> CSS px on the page */
  const scr = (x, y) => ev(([x, y]) => { const g = window.__game, s = g.screen(x, y), d = g.dpr || 1; return { x: s.x / d, y: s.y / d }; }, [x, y]);
  /** the camera to tile (x, y) at zoom z: at once, or eased over ms (the engine's own camera ease) */
  const cam = (x, y, z, ms = 0) => ev(([x, y, z, ms]) => {
    const g = window.__game, a = { ...g.cam }; g.lookAt(x, y, z); const b = { ...g.cam };
    if (ms > 0) { g.cam.X = a.X; g.cam.Y = a.Y; g.cam.z = a.z; g.camEase = { a, b, t0: performance.now(), ms }; }
  }, [x, y, z, ms]);
  const speed = k => ev(k => window.__game.setSpeed(k), k);
  /** the cards a running club raises (the month's statement, the range card, a hole card, an event card) put away, as a player closes them */
  const closeCards = () => G(() => {
    const g = window.__game; g.openRangeCard?.(false); g.closeHoleCard?.(); g.setTool('select');
    for (const b of document.querySelectorAll('button')) { const l = (b.getAttribute('aria-label') || b.title || '').toLowerCase(), t = b.innerText.trim(); if (b.offsetParent && (l === 'close' || l.startsWith('close the') || l === 'dismiss' || t === '×' || t === '✕')) b.click(); }
    for (const a of document.querySelectorAll('button, a')) if (a.offsetParent && /^Hide this checklist$/.test(a.innerText.trim())) a.click();
  });
  const cursor = on => ev(on => window.__trailerCursor?.(on), on);
  async function open(url) {
    if (page) { try { await rec?.stop(); } catch { /* none */ } await page.context().close().catch(() => {}); }
    page = await newPage(browser); rec = new Recorder(page, OUT, { width: 1920, height: 1080, quality: 88, step: !has('realtime') });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180000 });
  }
  const ready = () => page.waitForFunction(() => window.__game?.ready && !window.__game.show, null, { timeout: 300000 });
  async function who() {
    const btn = page.locator('button', { hasText: "That's me" });
    await btn.waitFor({ timeout: 120000 }); await wait(800);
    await clickSel('input[placeholder="Your name"]'); await page.keyboard.type('Sam', { delay: 60 });
    await clickSel('button:has-text("That\'s me")');
  }
  /** the showcase club, loaded the way a player loads a save (the gear menu's Load: its file input), into a page of its own */
  async function club() {
    await open(`${base}#play=new`); await ready(); await wait(2000);
    await G(() => history.replaceState(null, '', location.pathname + location.search + '#play=continue'));
    // (the gear menu's Load calls game.loadSaveFile with the picked file; the gear is not on screen while a new game asks who you are, so the robot hands the
    // same function the file's bytes)
    const nav = page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 120000 }).catch(e => e);
    await page.evaluate(b64 => { const s = atob(b64), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); void window.__game.loadSaveFile(new File([u], 'showcase.cesave')); }, readFileSync(SAVE).toString('base64'));
    await nav;
    await ready(); await wait(4000); await closeCards();
    // (a town event's leaderboard has no close: the club runs on until it is over, as it would for a player)
    for (let k = 0; k < 45 && await G(() => !!document.querySelector('[data-testid="leaderboard"]')); k++) { await speed(20); await wait(2000); }
    // and on to a month from spring to late summer with no event card (the golf view draws the season: in winter the rough is frosted white)
    const months = WORLD.view?.months ?? ['Apr', 'May', 'Jun', 'Jul', 'Aug'];
    for (let k = 0; k < 120; k++) {
      const s = await G(() => ({ m: document.body.innerText.match(/\b([A-Z][a-z]{2}) 19\d\d\b/)?.[1] ?? '', ev: !!document.querySelector('[data-testid="leaderboard"]') }));
      if (!s.ev && months.includes(s.m)) break;
      await speed(20); await closeCards(); await wait(1500);
    }
    console.log('   club at', await G(() => document.body.innerText.match(/\b[A-Z][a-z]{2} 19\d\d\b/)?.[0]));
    await closeCards(); await speed(1);
  }
  // ---------- the golf view
  const F = async js => { const f = page.frames().find(q => q.url().includes('cinderlinks')); return f ? f.evaluate(new Function(`return (async () => { ${js} })()`)) : null; };
  const turnNow = () => F("const t=HP&&HP.turn; return t&&!HP.sw&&HP.target?{stroke:t.stroke,lie:t.lie,dist:t.distM,club:(hostClub()?hostClub().club:null),tu:HP.target.u,earned:t.earned}:null");
  /** the view's keys reach it once its window has the focus (the panel focuses it on load; a click on the page's cards takes it away) */
  const focusView = () => G(() => document.querySelector('iframe')?.contentWindow?.focus());
  const untilTurn = async (ms = 30000) => { for (let k = 0; k < ms / 250; k++) { const s = await turnNow().catch(() => null); if (s) return s; await wait(250); } return null; };
  /** hold the swing until the meter reaches the aim's fill (the gold mark), tapping the boost meanwhile; then the spin taps in the air */
  async function swing({ boost = 0, spin = null, lead = 0.035 } = {}) {
    await focusView();
    if (!(await F('return nearBall()'))) { await page.keyboard.press('j'); await wait(1500); } // (J: to your ball, as the help says, when the golfer is not at it)
    await page.keyboard.down('Space');
    if (rec?.on) { // (frame by frame: the meter is read after each frame; the boost tapped every third frame from the 14th)
      const tgt = Math.min(0.995, ((await F('return HP.target ? HP.target.u : 1')) ?? 1) - lead); let taps = 0;
      for (let i = 0; i < 240; i++) { await rec.tick(1); if (boost && i >= 13 && i % 3 === 0 && taps < boost) { await page.keyboard.press('ArrowUp'); taps++; } const u = await F('return HP.sw ? HP.sw.u : -1'); if (u >= tgt) break; }
      await page.keyboard.up('Space');
      if (spin) { await wait(spin.after ?? 1100); for (let i = 0; i < spin.n; i++) { await page.keyboard.press(spin.key); await wait(170); } }
      return;
    }
    const meter = F(`const tgt=Math.min(0.995,(HP.target?HP.target.u:1)-${lead}); return await new Promise(res=>{const t0=performance.now(); const f=()=>{const s=HP.sw; if(s&&s.u>=tgt){res(s.u);return;} if(performance.now()-t0>8000){res(-1);return;} requestAnimationFrame(f);}; f();});`);
    // (#1368: tap while the meter rises and let go at the mark: tapping first and releasing after was a late release on the falling meter, the 30-40 m 'duff')
    let done = false; meter.then(() => { done = true; });
    if (boost) { await wait(150); for (let i = 0; i < boost && !done; i++) { await page.keyboard.press('ArrowUp'); await wait(60); } }
    await meter; await page.keyboard.up('Space');
    if (spin) { await wait(spin.after ?? 1100); for (let i = 0; i < spin.n; i++) { await page.keyboard.press(spin.key); await wait(170); } }
  }
  /** the hole card's time of day, then Play this hole (the view loads; the robot waits for the golfer's first turn) */
  async function play(hole, time = 'golden') {
    await G(() => window.__game.close3p?.()); await wait(500);
    await ev(n => window.__game.openHoleCard(n), hole); await wait(700);
    await clickSel(`[data-testid="hole-time-3p-${time}"]`, 350); await wait(300);
    await clickSel('[data-testid="hole-play-3p"]', 350);
    await cursor(false); const t = await untilTurn(60000); await focusView(); return t;
  }
  const leave = async () => { await page.keyboard.press('Escape'); await wait(1500); await G(() => { const g = window.__game; if (g.view3pHole !== null) g.close3p(); }); await cursor(true); };
  /** the ball at rest after a stroke: the next turn (its stroke count moved on from prev) */
  const ballRest = async (prev = null, ms = 30000) => { await wait(1500); for (let k = 0; k < ms / 250; k++) { const s = await turnNow().catch(() => null); if (s && (prev === null || s.stroke !== prev)) return s; if (k > 8 && await F('return typeof holed !== "undefined" && !!holed').catch(() => false)) return null; /* (in the cup) */ await wait(250); } return null; };

  const C = WORLD.view ?? {};
  const takes = +opt('takes', 3), golfTakes = +opt('takes-golf', takes); // (--takes-golf: the tee shot and the par 3 apart, the takes the cut picks from)
  try {
    // ---------------- the title card over the living menu scene, then a new game: the range placed and built up in stages
    if (want('menu') || want('range-build') || want('town-grow')) {
      await open(base);
      await page.locator('[data-testid="title-card"]').waitFor({ timeout: 180000 }); await wait(9000);
      await shot('menu', async () => { await cursor(false); await start('menu'); await wait(7000); await stop(); await cursor(true); });
      await shot('range-build', async () => {
        const nav = page.waitForNavigation({ waitUntil: 'commit', timeout: 15000 }).catch(() => null);
        await clickSel('[data-testid="title-new"]'); await nav; await ready(); await who();
        await page.locator('[data-testid="start-pick-card"]').waitFor({ timeout: 90000 }); await wait(2500);
        // a spot that fits: the pointer looks over the middle of the map until the ghost is green (the game's own hover test)
        // (as scripts/jam/smoke.mjs finds one: the ghost's own test over the view, then the pointer rests on a candidate until its verdict is settled and green)
        const fits = await G(() => { const g = window.__game, p = g.placing, out = []; if (!p) return out; const W = g.cssW, H = g.cssH;
          for (let y = 160; y < H - 260; y += 30) for (let x = 300; x < W - 300; x += 30) { const t = g.tileAt(x, y), s = p.spot(t.x, t.y); if (!s.why) out.push({ x, y }); }
          return out.sort((a, b) => Math.hypot(a.x - W / 2, a.y - H / 2) - Math.hypot(b.x - W / 2, b.y - H / 2)).slice(0, 10); });
        let spot = null;
        for (const c of fits) {
          await page.mouse.move(c.x, c.y, { steps: 3 }); await wait(500);
          const v = await G(() => { const g = window.__game, p = g.placing, h = g.hover; if (!p || !h) return null; const s = p.spot(h.x, h.y); return { why: p.why(s), pending: !!s.pending }; });
          if (v && !v.why && !v.pending) { spot = c; break; }
        }
        await start('range-place');
        await glide(spot ? spot.x - 160 : 900, spot ? spot.y + 90 : 600, 700); await wait(500);
        if (spot) await clickAt(spot.x, spot.y, 900); else await clickSel('[data-testid="start-pick-auto"], button:has-text("Pick a spot for me")');
        await wait(6000); await stop();
        const skip = page.locator('button', { hasText: 'Skip tutorial' }).first(); if (await skip.isVisible().catch(() => false)) await skip.click();
        await closeCards(); await G(() => window.__game.traffic.spend('bank', -150000)); // (the set's cash, never filmed: the range's stages one after another)
        // the camera fixed on the range, framed to the right of the Build menu
        // (the tee box and the first half of the outfield, the range's middle at x 1290 px: right of the Build menu, which covers 0..870 px)
        const z = C.rangeZoom ?? 0.13, fixed = await ev(([z, k]) => { const g = window.__game, sc = g.range.scene, b = sc.bays[0].stand;
          g.lookAt(b.x + sc.aim.x * k, b.y + sc.aim.y * k, z); g.cam.X -= 330 / g.cam.z; g.camEase = null; return { ...g.cam }; }, [z, C.rangeAhead ?? 30]);
        await wait(2500);
        const hold = () => ev(c => { const g = window.__game; g.camEase = null; g.cam.X = c.X; g.cam.Y = c.Y; g.cam.z = c.z; }, fixed);
        // the outfield's middle on screen (where a ghost that needs the range is placed)
        const field = async () => { const p = await G(() => { const g = window.__game, sc = g.range.scene, c = sc.counter, s = g.screen(c.x + sc.aim.x * 70, c.y + sc.aim.y * 70), d = g.dpr || 1; return { x: s.x / d, y: s.y / d }; }); return p; };
        const stage = async (id, name) => {
          await start(`range-${name}`);
          await clickSel('[data-testid="rail"] button:has-text("Build")', 400); await wait(500);
          await clickSel('[data-testid="build-tab-range"]', 300).catch(() => {}); await wait(300);
          const card = page.locator(`[data-testid="build-card-${id}"]`).first();
          if (!(await card.isVisible().catch(() => false)) || await card.getAttribute('aria-disabled') === 'true') { console.log(`   ${id}: ${await card.getAttribute('title').catch(() => 'no card')}`); await page.keyboard.press('Escape'); await stop(); return; }
          await clickSel(`[data-testid="build-card-${id}"]`, 500); await wait(250); await hold();
          const placing = await G(() => !!window.__game.placing);
          if (placing) { const f = await field(); await glide(f.x + 120, f.y - 60, 500); await wait(250); await glide(f.x, f.y, 400); await wait(450); await clickAt(f.x, f.y, 120); }
          await hold(); await wait(1600); await stop();
        };
        for (let k = 0; k < 9 && await G(() => (window.__game.golf.range.junk || []).length > 0); k++) await G(() => window.__game.clearJunk(0)); // (the junk: Clear the junk, pile by pile: the card's act)
        for (const [id, name] of [['greens', 'greens'], ['teeturf', 'tee'], ['grass', 'grass'], ['targets', 'targets'], ['bays8', 'bays8'], ['bays12', 'bays12'], ['covered', 'covered'], ['dispenser', 'dispenser'], ['carpark', 'carpark'], ['carpark', 'carpark2']]) await stage(id, name);
        // the golfers come: a time-lapse at the top speed, the camera where it was
        await start('range-golfers'); await hold(); await speed(20); await wait(9000); await speed(1); await stop();
      });
      // the town growing (the owner: "see a beginning and later stages of the town"): one camera on the town by the county road, a few seconds as it is,
      // then years at the top speed as a time-lapse (C.townLapse frames, each C.townEvery frames of the clock), the club's cards put away as they come
      await shot('town-grow', async () => {
        await closeCards();
        // (the camera on the town's lots near its seed, built or not yet: where the houses will come; the seed itself can sit in an empty field)
        const c = await G(() => { const g = window.__game, t = g.golf.town ?? g.golf.home; if (!t) return null; const pts = []; for (const l of g.traffic.lots.values()) if (l.o && Math.hypot(l.o[0] - t.x, l.o[1] - t.y) < 160) pts.push(l.o);
          return pts.length ? { x: pts.reduce((s, p) => s + p[0], 0) / pts.length, y: pts.reduce((s, p) => s + p[1], 0) / pts.length, n: pts.length } : t; });
        if (!c) throw new Error('no town'); console.log('   town lots', JSON.stringify(c));
        const o = C.townGrowOff ?? [0, 0], z = C.townGrowZoom ?? 0.14; // (close enough that a new house reads)
        await cam(c.x + o[0], c.y + o[1], z); await wait(2500); await speed(1);
        await start('town-grow'); await wait(2500);
        await speed(20);
        // (each picture: the page one frame on, so the clouds and the light roll as in play; the sim worker C.townEvery frames on, so the town grows fast. The
        // owner, 2026-11-16: with both 16 frames on, the cloud patches jumped five wavelengths a picture and flashed)
        const frames = C.townLapse ?? 900, every = C.townEvery ?? 16;
        for (let i = 0; i < frames; i += 30) {
          await rec.tick(Math.min(30, frames - i), 1, every);
          await G(() => { const g = window.__game; if (g.seasonReport) g.seasonReport = null; }); await closeCards(); // (the season's report card: closed as a player closes it)
          if (await G(() => window.__game.speed !== 20)) await speed(20);
        }
        await speed(1); await wait(1500); await stop();
      });
    }
    // ---------------- the showcase club
    if (SHOTS.slice(3).some(want)) await club();
    await shot('town', async () => {
      // the town along the county road and the club in front of it, low and wide, then nearer over the range and the holes
      await speed(2); await cam(...(C.townA ?? [1010, 1110, 0.09])); await wait(4000);
      await start('town'); await cam(...(C.townB ?? [930, 960, 0.16]), 7000); await wait(7500); await cam(...(C.townC ?? [880, 880, 0.24]), 5000); await wait(5500); await stop();
    });
    // ---------------- a hole built properly (the owner, 2026-11-15: "build a hole with bunkers and water and a green and trees etc properly"): New hole (tee, green,
    // BUILD NOW), then shaped by hand on the Holes panel (bunkers by the green, a pond in front, the green widened, long grass along the edges), the Trees and
    // props brush and a bench and a fountain by the tee, then the hole grown in (a time-lapse) from the same camera; then its tee shot from behind the golfer
    /** a scribble filling a disc (tile coords), as a hand fills a shape with the brush */
    const disc = (cx, cy, r) => { const p = []; for (let a = 0; a <= Math.PI * 6; a += 0.45) { const rr = r * (0.25 + 0.75 * a / (Math.PI * 6)); p.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); } return p; };
    const tiles = async pts => ev(pts => { const g = window.__game, d = g.dpr || 1; return pts.map(([x, y]) => { const s = g.screen(x, y); return { x: s.x / d, y: s.y / d }; }); }, pts);
    const surface = async name => { // (the Holes panel's surface tiles: back to all of them when one is open)
      const back = page.locator('[data-testid="tool-panel"] button:has-text("All surfaces")').first(); if (await back.isVisible().catch(() => false)) { await clickSel('[data-testid="tool-panel"] button:has-text("All surfaces")', 300); await wait(300); }
      await clickSel(`[data-testid="tool-panel"] button:has-text("${name}")`, 400); await wait(350);
    };
    const buildCard = async id => { await clickSel('[data-testid="rail"] button:has-text("Build")', 450); await wait(450); await clickSel('[data-testid="build-tab-course"]', 300); await wait(450); await clickSel(`[data-testid="build-card-${id}"]`, 550); await wait(700); };
    let newHole = null;
    await shot('hole-full', async () => {
      const h = WORLD.stageHole, mid = { x: (h.tee.x + h.green.x) / 2, y: (h.tee.y + h.green.y) / 2 }, z = C.holeZoom ?? 0.12;
      const fix = (x = mid.x + 18, y = mid.y - 6, zz = z) => ev(([x, y, z]) => { const g = window.__game; g.lookAt(x, y, z); g.camEase = null; }, [x, y, zz]);
      await closeCards(); await G(() => window.__game.close3p?.()); await fix(); await wait(2500); await speed(1);
      await start('hole-full');
      await buildCard('hole'); await wait(400); await fix(); await wait(300); // (the card fits the view on its next frame: back to this spot)
      let p = await scr(h.tee.x, h.tee.y); await clickAt(p.x, p.y, 700); await wait(600);
      p = await scr(h.green.x, h.green.y); await glide(p.x, p.y, 1200); await wait(250); await clickAt(p.x, p.y, 100); await wait(1600);
      await clickSel('[data-testid="build-now"]', 700); await wait(2200);
      await page.keyboard.press('Escape'); await wait(300); await closeCards();
      // the hole as the game laid it: its tee and its pin
      newHole = await G(() => { const G = window.__game.golf, n = Math.max(...G.pins.map(q => q.hole)), pin = G.pins.find(q => q.hole === n), tee = (G.tees || []).find(q => q.hole === n); return { n, g: { x: pin.x, y: pin.y }, t: tee ? { x: tee.x, y: tee.y } : null }; });
      const T = newHole.t ?? h.tee, Gp = newHole.g, L = Math.hypot(Gp.x - T.x, Gp.y - T.y), u = { x: (Gp.x - T.x) / L, y: (Gp.y - T.y) / L }, v = { x: -u.y, y: u.x };
      const at = (a, b) => [Gp.x + u.x * a + v.x * b, Gp.y + u.y * a + v.y * b], atT = (a, b) => [T.x + u.x * a + v.x * b, T.y + u.y * a + v.y * b];
      const whole = () => fix((T.x + Gp.x) / 2 + 14, (T.y + Gp.y) / 2 - 4, z);
      await whole(); await wait(300);
      // the green end, closer
      await fix(Gp.x - u.x * 8, Gp.y - u.y * 8, C.greenZoom ?? 0.22); await wait(500);
      await clickSel('[data-testid="rail"] button:has-text("Course")', 400); await wait(700);
      await clickSel('[data-testid="tool-panel"] button:has-text("Round")', 300).catch(() => {});
      await clickSel('[data-testid="tool-panel"] button:has-text("4×4")', 300).catch(() => {});
      await surface('Green'); await stroke(await tiles(disc(...at(0, 0), 6)), 1600); await wait(400);
      await surface('Bunker'); await stroke(await tiles(disc(...at(2, 11), 3.5)), 1400); await wait(250); await stroke(await tiles(disc(...at(-4, -10), 3)), 1200); await wait(400);
      await surface('Water'); await stroke(await tiles(disc(...at(-19, 2), 6)), 1800); await wait(500);
      // the whole hole again: long grass along both edges, then the trees and the props
      await whole(); await wait(500);
      await surface('Long grass');
      for (const s of [1, -1]) { await stroke(await tiles([atT(25, 16 * s), at(-L / 2, 16 * s), at(-25, 16 * s)]), 1500); await wait(250); }
      await page.keyboard.press('Escape'); await wait(300);
      await buildCard('props'); await clickSel('[data-testid="tool-panel"] button:has-text("Ornamental maple")', 400); await wait(300);
      for (const s of [1, -1]) { await stroke(await tiles([atT(30, 22 * s), at(-L / 2, 23 * s), at(-30, 22 * s)]), 1300); await wait(250); }
      for (const [name, a, b] of [['Park bench', -6, 7], ['Plaza fountain', -4, -9]]) {
        const btn = page.locator('[data-testid="tool-panel"] button', { hasText: name }).first(); await btn.scrollIntoViewIfNeeded().catch(() => {}); await wait(250);
        const bb = await btn.boundingBox(); if (!bb) continue; await clickAt(bb.x + bb.width / 2, bb.y + bb.height / 2, 400); await wait(300);
        const q = (await tiles([atT(a, b)]))[0]; await clickAt(q.x, q.y, 600); await wait(400);
      }
      await page.keyboard.press('Escape'); await wait(400); await closeCards(); await glide(1800, 980, 400);
      // grown in: a time-lapse, the same camera
      await speed(20); await rec.tick(C.growFrames ?? 240, 1, C.growEvery ?? 6); // (the page a frame a picture: the clouds roll; the sim 6) await speed(1); await closeCards(); await wait(1200); await stop();
    });
    await shot('golf-new', async () => {
      if (!newHole) throw new Error('no new hole');
      for (let k = 0; k < Math.min(2, takes); k++) {
        const t = await play(newHole.n, 'golden'); if (!t) throw new Error(`hole ${newHole.n} not playable yet`);
        await wait(1200); await start(`golf-new-${k}`); await wait(600); await swing({ lead: 0 }); await ballRest(t.stroke); await wait(800); await stop(); await leave();
      }
    });
    // ---------------- a texture chosen (the owner: "show how you customise a texture"): the Texture Painter, a surface, its Main texture opened, another look picked
    // and painted with; then a second look
    await shot('texture', async () => {
      const TC = C.textureCam ?? [948, 905, 0.3];
      await closeCards(); await cam(...TC); await wait(2000);
      await start('texture'); await glide(1150, 760, 300);
      await buildCard('texture'); await cam(...TC); await wait(400);
      const P2 = C.texture ?? { a: [[1420, 430], [1530, 450], [1560, 510], [1470, 540], [1390, 500], [1440, 460], [1510, 480]], b: [[1170, 340], [1280, 350], [1310, 410], [1220, 440], [1150, 400], [1200, 370]] }; // (both on the rough: the range's outfield is not painted)
      for (const [surf, look, pts] of [['Fairway', 'Fescue', P2.a], ['Bunker', 'Worn path', P2.b]]) {
        await surface(surf);
        // (a round 4x4 brush: the paint and its dust read at this zoom; a 1-cell brush leaves a thin line and a wisp)
        await clickSel('[data-testid="tool-panel"] button:has-text("Round")', 300).catch(() => {}); await clickSel('[data-testid="tool-panel"] button:has-text("4×4")', 300).catch(() => {});
        await clickSel('[data-testid="tool-panel"] button[aria-haspopup]', 500); await wait(700); // (Main texture: the looks, as pictures)
        await clickSel(`[data-testid="tool-panel"] button:has-text("${look}")`, 600); await wait(600);
        await stroke(pts.map(([x, y]) => ({ x, y })), 1500); await wait(700);
      }
      await page.keyboard.press('Escape'); await wait(800); await stop();
    });
    // ---------------- the props (the owner: "how many props we have"): the Trees and props card, its list scrolled from the trees to the media, then a few placed
    await shot('props-range', async () => {
      await closeCards(); await cam(...(C.propsCam ?? [940, 1000, 0.3])); await wait(2000);
      await start('props-range'); await glide(1150, 760, 300);
      await buildCard('props');
      const box = await page.locator('[data-testid="tool-panel"]').first().boundingBox();
      await glide(box.x + box.width / 2, box.y + box.height * 0.6, 400);
      for (let i = 0; i < (C.propsScroll ?? 26); i++) { await page.mouse.wheel(0, 420); await wait(130); }
      await wait(400);
      for (const [name, x, y] of C.propsPlace ?? [['Golfer statue', 1250, 560], ['Flower planter', 1380, 620], ['Lamp post', 1150, 640]]) {
        const btn = page.locator('[data-testid="tool-panel"] button', { hasText: name }).first(); await btn.scrollIntoViewIfNeeded().catch(() => {}); await wait(300);
        const bb = await btn.boundingBox(); if (!bb) continue; await clickAt(bb.x + bb.width / 2, bb.y + bb.height / 2, 450); await wait(300); await clickAt(x, y, 600); await wait(500);
      }
      await page.keyboard.press('Escape'); await wait(1200); await stop();
    });
    // ---------------- the town: traffic in its streets, close (the owner: "how traffic actually works")
    await shot('traffic', async () => {
      await closeCards(); await speed(1);
      // (the town's built houses: their middle, where its streets and its cars are; the town's seed point can be an empty field)
      const c = await G(() => { const g = window.__game, pts = []; for (const l of g.traffic.lots.values()) if (l.o && (l.level ?? 0) > 0) pts.push({ x: l.o[0], y: l.o[1] });
        const m = pts.length ? { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length } : g.golf.town;
        let best = null; for (const n of g.net.nodes.values()) if (n.segs.length >= 3) { const d = Math.hypot(n.x - m.x, n.y - m.y); if (!best || d < best.d) best = { x: n.x, y: n.y, d }; } // (the junction nearest the houses)
        return best && best.d < 120 ? best : m; });
      const o = C.trafficOff ?? [0, 0], z = C.trafficZoom ?? 0.42;
      await cam(c.x + o[0], c.y + o[1], z); await wait(2500);
      await start('traffic'); await wait(2500); await cam(c.x + o[0] + 12, c.y + o[1] - 6, z * 1.1, 6000); await wait(6200); await stop();
    });
    // ---------------- the golf view
    await shot('golf-tee', async () => {
      for (let k = 0; k < golfTakes; k++) {
        const t = await play(1, 'golden'); if (!t) throw new Error('no turn on hole 1');
        await wait(1500); await start(`golf-tee-${k}`); await wait(800);
        await swing({ boost: +opt('boost', 4), spin: { key: 'ArrowUp', n: 3, after: 1300 }, lead: 0 }); await ballRest(t.stroke); await wait(1200); await stop(); // (boost taps on: #1368 was the robot's late release, fixed above)
        await leave();
      }
    });
    /** a button in the golf view by its words: its box on the page (Playwright gives a frame's boxes in the page's own pixels) */
    const viewBox = async text => { const f = page.frames().find(q => q.url().includes('cinderlinks')); const b = await f?.locator(`text=${text}`).first().boundingBox().catch(() => null); return b ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : null; };
    /** the hole played out from where the ball lies: each stroke released on the aim's fill, the putts with the green's grid, until the cup (the next hole's tee) */
    const playOut = async (max = 9) => {
      let strokes = 0;
      for (let s = 0; s < max; s++) {
        const t = await untilTurn(12000); if (!t) break;
        if (s > 0 && t.lie === 'tee' && t.stroke === 1) break; // (holed: the view is on the next tee)
        await wait(t.club === 'putter' ? 2200 : 1300);
        await swing({ lead: t.club === 'putter' ? 0.0 : 0.03 }); strokes++; await ballRest(t.stroke); await wait(t.club === 'putter' ? 1500 : 500);
      }
      return strokes;
    };
    await shot('golf-draw', async () => {
      for (let k = 0; k < golfTakes; k++) {
        const t = await play(4, 'day'); if (!t) throw new Error('no turn on hole 4');
        await wait(1200); await start(`golf-par3-${k}`); await cursor(true); await wait(500);
        // the shot shape: the ball button, then the dot dragged to the left (a draw)
        const sb = (await viewBox('Straight')) ?? { x: 1755, y: 1037 }; { // (the ball button, bottom right: its box from the view, or where it is drawn at 1920x1080)
          await clickAt(sb.x, sb.y, 500); await wait(800); }
        const c = { x: 1785, y: 843 }; // (the shot-shape ball's centre at 1920x1080)
        await glide(c.x, c.y, 500); await page.mouse.down(); await glide(c.x - 30, c.y + 1, 700); await page.mouse.up(); await wait(1200); await clickAt(sb.x, sb.y, 400); await wait(400);
        await cursor(false); await swing({ lead: 0.02, spin: { key: 'ArrowDown', n: +opt('backspin', 4), after: 900 } }); await ballRest(t.stroke); await wait(600); // (backspin tapped in the air: the ball checks on the green)
        const n = await playOut(); console.log(`   par-3 take ${k}: ${n + 1} strokes`);
        await wait(2500); await stop(); await leave();
      }
    });
    await shot('range-practice', async () => {
      await G(() => window.__game.close3p?.()); await G(() => window.__game.openPractice3p('range')); await cursor(false);
      if (!(await untilTurn(60000))) throw new Error('no practice turn');
      await wait(1500); await start('range-practice');
      for (let i = 0; i < 2; i++) { const t = await untilTurn(); await swing({ lead: 0.0 }); await ballRest(t?.stroke ?? null); await wait(2500); }
      await stop(); await leave();
    });
    await shot('times', async () => {
      for (const t of ['day', 'golden', 'dusk', 'night']) { if (!(await play(4, t))) continue; await wait(2500); await start(`time-${t}`); await wait(3500); await stop(); await leave(); }
    });
    await shot('night', async () => {
      for (let k = 0; k < takes; k++) {
        const t = await play(2, 'night'); if (!t) throw new Error('no night turn'); await wait(2000);
        await start(`night-${k}`); await swing({ lead: 0.02 }); await ballRest(t.stroke); await wait(1200); await stop(); await leave();
      }
    });
    await shot('alive', async () => {
      await closeCards(); await speed(2);
      const A = C.alive ?? [[950, 1020, 0.34], [925, 990, 0.3]];
      await cam(...A[0]); await wait(3000);
      await start('alive'); await cam(...A[1], 8000); await wait(8500); await stop(); await speed(1);
    });
    // ---------------- a real course placed into the running club (last: it replaces the club's own holes): Build > Course > the course's card, the course in hand
    // moved over the map to a pose that takes no houses or roads (found by the game's own planner before the recording), a click, Place it; the camera rises over
    // it. Then one of its holes played. (`--import new` instead films a new game's Who are you? card > Change or find a course > the course.)
    const realShots = async () => {
      if (!want('import') && !want('golf-real')) return;
      const R = WORLD.realCourse ?? { id: 'magnolia-national', name: 'Magnolia National', hole: 16, cam: [0.05, 0.03] };
      const viaNew = opt('import', 'club') === 'new';
      if (viaNew) await open(`${base}?real=1#play=new`); else if (!page) await club();
      await ready();
      await shot('import', async () => {
        if (viaNew) {
          await page.locator('[data-testid="who-course-open"]').waitFor({ timeout: 120000 }); await wait(2500);
          await start('import');
          await clickSel('input[placeholder="Your name"]'); await page.keyboard.type('Sam', { delay: 50 });
          await clickSel('[data-testid="who-course-open"]', 600); await wait(1600);
          await clickSel(`button:has-text("${R.name}")`, 800);
          await stepUntil(() => new Set((window.__game?.golf?.pins ?? []).map(p => p.hole)).size >= 9, 120000);
        } else {
          await closeCards(); await G(() => window.__game.close3p?.()); await cam(930, 900, 0.07); await wait(2000);
          await start('import');
          await clickSel('[data-testid="rail"] button:has-text("Build")', 450); await wait(500);
          await clickSel('[data-testid="build-tab-course"]', 350); await wait(500);
          await clickSel(`[data-testid="build-card-real-${R.id}"]`, 600);
          await stepUntil(() => window.__game.real.active, 60000);
          // the pose: the planner's own check over the map, no houses, no roads, clear of the club's buildings (turned back to how it came)
          const pose = await G(() => { const R = window.__game.real, d0 = R.deg; let best = null;
            for (let x = 300; x <= 1700; x += 100) for (let y = 300; y <= 1700; y += 100) { R.at = { x, y }; const pl = R.plan(true); if (!pl || pl.why || !pl.bounds) continue;
              const c = pl.lots.houses + pl.lots.shops + pl.roads.segs * 3 + pl.over.club.length * 100 + Math.hypot(x - 900, y - 800) / 1000; if (!best || c < best.c) best = { x, y, c }; }
            R.at = null; return best; });
          if (!pose) throw new Error('no pose fits');
          await cam(pose.x + 30, pose.y + 20, R.cam[0], 1500); await wait(1700);
          const p = await scr(pose.x, pose.y);
          await glide(p.x - 380, p.y + 220, 300); await glide(p.x, p.y, 1600); await wait(900);
          await clickAt(p.x, p.y, 120); await wait(1800);
          await clickSel('button:has-text("Place it")', 700);
          await stepUntil(() => !window.__game.real.active, 60000);
        }
        await wait(1500); await closeCards();
        const c = await G(() => { const ps = window.__game.golf.pins; let x = 0, y = 0; for (const p of ps) { x += p.x; y += p.y; } return [x / ps.length, y / ps.length]; });
        await cam(c[0], c[1], R.cam[0], 1200); await wait(1500); await closeCards();
        await cam(c[0], c[1], R.cam[1], 5000); await wait(5500); await stop();
      });
      await shot('golf-real', async () => {
        for (let k = 0; k < takes; k++) {
          const t = await play(R.hole, 'golden'); if (!t) throw new Error(`no turn on ${R.name} ${R.hole}`);
          await wait(1500); await start(`golf-real-${k}`); await swing({ lead: 0.02 }); await ballRest(t.stroke); await wait(600);
          const n = await playOut(); console.log(`   ${R.name} ${R.hole} take ${k}: ${n + 1} strokes`); await wait(2000); await stop(); await leave();
        }
      });
    };
    await realShots();
  } finally {
    await browser.close(); if (server) await new Promise(r => server.httpServer.close(r));
  }
  console.log(JSON.stringify(done, null, 1));
}
