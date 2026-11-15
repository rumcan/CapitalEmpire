// scripts/jam/trailer-shots.mjs: the trailer's shots (scripts/jam/trailer.mjs record; docs/jam/VIDEO.md). Each shot is recorded on its own into
// <out>/shots/<name>.mp4 (the cut, trailer-edit.mjs, takes the moments it needs). The robot plays the jam build as a player does: real clicks on the
// game's buttons and on the map (the pointer drawn where the mouse is), the golf view's own keys; the engine is read to know where things are and when a
// swing's meter reaches the aim (the gold mark a player releases on), and called only to place the camera.
//   --only a,b   record those shots alone (names below); --takes N   golf takes to try for a good one (default 3)
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SHOTS = ['menu', 'range-build', 'town', 'import', 'hole-build', 'paint', 'decor', 'golf-tee', 'golf-draw', 'golf-putt', 'range-practice', 'times', 'night', 'alive'];

export async function record(env) {
  const { OUT, SAVE, WORLD, opt, has, launch, newPage, preview, freePort, Recorder, wait } = env;
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
  const start = async n => { await rec.start(n); };
  const stop = async () => { const r = await rec.stop(); if (r) { console.log('  ', JSON.stringify(r)); done.push(r); } return r; };

  // ---------- helpers on the current page
  const G = fn => page.evaluate(fn);
  const ev = (fn, a) => page.evaluate(fn, a);
  /** the pointer glides to (x, y) over ms, eased, as a hand moves a mouse */
  const glide = async (x, y, ms = 600) => {
    const from = await ev(() => window.__trailerMouse ?? { x: 960, y: 540 }), t0 = Date.now();
    for (;;) { const t = Math.min(1, (Date.now() - t0) / ms), e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2; await page.mouse.move(from.x + (x - from.x) * e, from.y + (y - from.y) * e); if (t >= 1) break; await wait(20); }
    await ev(p => { window.__trailerMouse = p; }, { x, y });
  };
  const clickAt = async (x, y, ms = 500) => { await glide(x, y, ms); await wait(120); await page.mouse.down(); await wait(70); await page.mouse.up(); };
  /** a stroke: press at the first point, drag through the rest */
  const stroke = async (pts, ms = 900) => {
    await glide(pts[0].x, pts[0].y, 400); await page.mouse.down();
    for (let k = 1; k < pts.length; k++) { const a = pts[k - 1], b = pts[k], seg = ms / (pts.length - 1), t0 = Date.now(); for (;;) { const t = Math.min(1, (Date.now() - t0) / seg); await page.mouse.move(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t); if (t >= 1) break; await wait(15); } }
    await page.mouse.up(); const l = pts[pts.length - 1]; await ev(p => { window.__trailerMouse = p; }, l);
  };
  const clickSel = async (sel, ms = 450) => {
    const loc = page.locator(sel).first(); await loc.waitFor({ state: 'visible', timeout: 15000 });
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
    page = await newPage(browser); rec = new Recorder(page, OUT, { width: 1920, height: 1080, quality: 88 });
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
    await ready(); await wait(4000); await closeCards(); await speed(1);
  }
  // ---------- the golf view
  const F = async js => { const f = page.frames().find(q => q.url().includes('cinderlinks')); return f ? f.evaluate(new Function(`return (async () => { ${js} })()`)) : null; };
  const turnNow = () => F("const t=HP&&HP.turn; return t&&!HP.sw&&HP.target?{stroke:t.stroke,lie:t.lie,dist:t.distM,club:(hostClub()?hostClub().club:null),tu:HP.target.u,earned:t.earned}:null");
  /** the view's keys reach it once its window has the focus (the panel focuses it on load; a click on the page's cards takes it away) */
  const focusView = () => G(() => document.querySelector('iframe')?.contentWindow?.focus());
  const untilTurn = async (ms = 30000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const s = await turnNow().catch(() => null); if (s) return s; await wait(250); } return null; };
  /** hold the swing until the meter reaches the aim's fill (the gold mark), tapping the boost meanwhile; then the spin taps in the air */
  async function swing({ boost = 0, spin = null, lead = 0.035 } = {}) {
    await focusView();
    if (!(await F('return nearBall()'))) { await page.keyboard.press('j'); await wait(1500); } // (J: to your ball, as the help says, when the golfer is not at it)
    await page.keyboard.down('Space');
    const meter = F(`const tgt=Math.min(0.995,(HP.target?HP.target.u:1)-${lead}); return await new Promise(res=>{const t0=performance.now(); const f=()=>{const s=HP.sw; if(s&&s.u>=tgt){res(s.u);return;} if(performance.now()-t0>8000){res(-1);return;} requestAnimationFrame(f);}; f();});`);
    if (boost) { await wait(450); for (let i = 0; i < boost; i++) { await page.keyboard.press('ArrowUp'); await wait(85); } }
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
  const ballRest = async (ms = 25000) => untilTurn(ms);

  const C = WORLD.view ?? {};
  try {
    // ---------------- the title card over the living menu scene, then a new game: the range placed and built up in stages
    if (want('menu') || want('range-build')) {
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
        for (const [id, name] of [['greens', 'greens'], ['grass', 'grass'], ['teeturf', 'tee'], ['targets', 'targets'], ['bays8', 'bays8'], ['bays12', 'bays12'], ['covered', 'covered'], ['dispenser', 'dispenser'], ['carpark', 'carpark'], ['carpark', 'carpark2']]) await stage(id, name);
        // the golfers come: a time-lapse at the top speed, the camera where it was
        await start('range-golfers'); await hold(); await speed(20); await wait(9000); await speed(1); await stop();
      });
    }
    // ---------------- the showcase club
    if (SHOTS.slice(2).some(want)) await club();
    await shot('town', async () => {
      // the town along the county road and the club in front of it, low and wide, then nearer over the range and the holes
      await speed(2); await cam(...(C.townA ?? [1010, 1110, 0.09])); await wait(4000);
      await start('town'); await cam(...(C.townB ?? [930, 960, 0.16]), 7000); await wait(7500); await cam(...(C.townC ?? [880, 880, 0.24]), 5000); await wait(5500); await stop();
    });
    await shot('import', async () => {
      await cam(...(C.importCam ?? [1080, 560, 0.06])); await wait(3000);
      await start('import');
      await clickSel('[data-testid="rail"] button:has-text("Course")', 450); await wait(700);
      await clickSel('text=Place a real course', 450); await wait(600);
      await clickSel('text=Magnolia National', 450); await wait(2500);
      const at = C.importAt ?? [1400, 760], p = await scr(at[0], at[1]);
      await glide(p.x - 250, p.y + 120, 900); await wait(500); await glide(p.x, p.y, 1200); await wait(900);
      await clickAt(p.x, p.y, 150); await wait(1200);
      await clickSel('button:has-text("Place it")', 500); await wait(7000); await stop();
    });
    await shot('hole-build', async () => {
      const h = WORLD.stageHole, mid = { x: (h.tee.x + h.green.x) / 2, y: (h.tee.y + h.green.y) / 2 };
      const z = C.holeZoom ?? 0.12, fix = () => cam(mid.x + 18, mid.y - 6, z);
      await closeCards(); await fix(); await wait(3000); await speed(1);
      await start('hole-build');
      await clickSel('[data-testid="rail"] button:has-text("Build")', 450); await wait(400);
      await clickSel('[data-testid="build-tab-course"]', 300); await wait(400);
      await clickSel('[data-testid="build-card-hole"]', 450); await wait(300); await fix(); await wait(600); // (the card centres the camera on the club: back to this spot)
      let p = await scr(h.tee.x, h.tee.y); await clickAt(p.x, p.y, 700); await wait(700);
      p = await scr(h.green.x, h.green.y); await glide(p.x, p.y, 1300); await wait(300); await clickAt(p.x, p.y, 100); await wait(1800);
      await clickSel('[data-testid="build-now"]', 700); await wait(3000);
      await page.keyboard.press('Escape'); await wait(400); await closeCards(); await glide(1700, 900, 500);
      await speed(20); await wait(12000); await speed(1); await closeCards(); await wait(1500); await stop();
    });
    await shot('paint', async () => {
      const P = C.paint ?? { at: [990, 1100], green: [[985, 1095], [995, 1098], [992, 1104], [984, 1102]], bunker: [[1000, 1094], [1004, 1097]], water: [[975, 1110], [985, 1116], [978, 1120]] };
      await cam(P.at[0], P.at[1], 0.3); await wait(3000);
      await start('paint');
      for (const [name, pts] of [['Green', P.green], ['Bunker', P.bunker], ['Water', P.water]]) {
        await clickSel('[data-testid="rail"] button:has-text("Course")', 400); await wait(500);
        await clickSel('text=Shape by hand', 400); await wait(500);
        await clickSel(`text=${name}`, 400); await wait(400);
        const sp = []; for (const [x, y] of pts) sp.push(await scr(x, y));
        await stroke(sp, 1400); await wait(900);
      }
      await stop();
    });
    await shot('decor', async () => {
      const D = C.decor ?? { at: [960, 1000], trees: [[955, 995], [962, 990], [968, 998]] };
      await cam(D.at[0], D.at[1], 0.28); await wait(2500);
      await start('decor');
      await clickSel('[data-testid="rail"] button:has-text("Course")', 400); await wait(500);
      await clickSel('text=Plants', 400); await wait(600);
      const firstLeaf = page.locator('[role="menuitem"]').first(); if (await firstLeaf.isVisible().catch(() => false)) { const b = await firstLeaf.boundingBox(); await clickAt(b.x + b.width / 2, b.y + b.height / 2, 300); }
      for (const [x, y] of D.trees) { const p = await scr(x, y); await clickAt(p.x, p.y, 450); await wait(250); }
      await page.keyboard.press('Escape'); await wait(1500); await stop();
    });
    // ---------------- the golf view
    const takes = +opt('takes', 3);
    await shot('golf-tee', async () => {
      for (let k = 0; k < takes; k++) {
        const t = await play(1, 'golden'); if (!t) throw new Error('no turn on hole 1');
        await wait(1500); await start(`golf-tee-${k}`); await wait(800);
        await swing({ boost: 7, spin: { key: 'ArrowUp', n: 3, after: 1300 }, lead: 0 }); await ballRest(); await wait(1200); await stop();
        await leave();
      }
    });
    /** a button in the golf view by its words: its box on the page (Playwright gives a frame's boxes in the page's own pixels) */
    const viewBox = async text => { const f = page.frames().find(q => q.url().includes('cinderlinks')); const b = await f?.locator(`text=${text}`).first().boundingBox().catch(() => null); return b ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : null; };
    /** the hole played out from where the ball lies: each stroke released on the aim's fill, the putts with the green's grid, until the cup (the next hole's tee) */
    const playOut = async (max = 9) => {
      let strokes = 0;
      for (let s = 0; s < max; s++) {
        const t = await untilTurn(30000); if (!t) break;
        if (s > 0 && t.lie === 'tee' && t.stroke === 1) break; // (holed: the view is on the next tee)
        await wait(t.club === 'putter' ? 2200 : 1300);
        await swing({ lead: t.club === 'putter' ? 0.0 : 0.03 }); strokes++; await wait(t.club === 'putter' ? 4500 : 3000);
      }
      return strokes;
    };
    await shot('golf-draw', async () => {
      for (let k = 0; k < takes; k++) {
        const t = await play(4, 'day'); if (!t) throw new Error('no turn on hole 4');
        await wait(1200); await start(`golf-par3-${k}`); await cursor(true); await wait(500);
        // the shot shape: the ball button, then the dot dragged to the left (a draw)
        const sb = await viewBox('Straight'); if (sb) { await clickAt(sb.x, sb.y, 500); await wait(800); }
        const c = { x: 1772, y: 820 };
        await glide(c.x, c.y, 500); await page.mouse.down(); await glide(c.x - 36, c.y + 2, 700); await page.mouse.up(); await wait(700);
        await cursor(false); await swing({ lead: 0.02 }); await ballRest(); await wait(600);
        const n = await playOut(); console.log(`   par-3 take ${k}: ${n + 1} strokes`);
        await wait(2500); await stop(); await leave();
      }
    });
    await shot('range-practice', async () => {
      await G(() => window.__game.close3p?.()); await G(() => window.__game.openPractice3p('range')); await cursor(false);
      if (!(await untilTurn(60000))) throw new Error('no practice turn');
      await wait(1500); await start('range-practice');
      for (let i = 0; i < 2; i++) { await swing({ lead: 0.0 }); await ballRest(); await wait(1500); }
      await stop(); await leave();
    });
    await shot('times', async () => {
      for (const t of ['day', 'golden', 'dusk', 'night']) { if (!(await play(4, t))) continue; await wait(2500); await start(`time-${t}`); await wait(3500); await stop(); await leave(); }
    });
    await shot('night', async () => {
      for (let k = 0; k < takes; k++) {
        if (!(await play(2, 'night'))) throw new Error('no night turn'); await wait(2000);
        await start(`night-${k}`); await swing({ lead: 0.02 }); await ballRest(); await wait(1200); await stop(); await leave();
      }
    });
    await shot('alive', async () => {
      await closeCards(); await speed(2);
      const A = C.alive ?? [[950, 1020, 0.34], [925, 990, 0.3]];
      await cam(...A[0]); await wait(3000);
      await start('alive'); await cam(...A[1], 8000); await wait(8500); await stop(); await speed(1);
    });
  } finally {
    await browser.close(); if (server) await new Promise(r => server.httpServer.close(r));
  }
  console.log(JSON.stringify(done, null, 1));
}
