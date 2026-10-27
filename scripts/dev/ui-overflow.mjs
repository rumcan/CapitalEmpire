// T193 (#502; the owner: "horizontal menu sliders" are not cool): no rail, flyout or tool panel overflows sideways or off the screen. Opens the
// game (every tool shown: Settings > Show every tool now) at 1366 x 768 and 1600 x 900, at 100% and 125% UI scale; opens every rail group's
// flyout and every submenu in it; picks every leaf and looks at the tool panel it opens (and the Junctions panel with a junction selected, where
// the roundabout's note once sat over a horizontal scrollbar), and Help › Keys (T202: F1, the Keys sheet scrolled through). A box fails when it is wider than it shows (its content scrolls or is cut
// sideways), when any element in it scrolls sideways, or when it passes the screen's edge. Nothing is saved: every POST is answered here.
//   npm run ui:overflow -- --url http://localhost:5173 [--channel msedge|chrome] [--quick]
import { chromium } from 'playwright-core';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const URL = arg('url', 'http://localhost:5173'), CHANNEL = arg('channel', process.platform === 'win32' ? 'msedge' : 'chrome'), QUICK = process.argv.includes('--quick');
const SIZES = [[1366, 768], [1600, 900]], SCALES = [1, 1.25];
const sleep = ms => new Promise(r => setTimeout(r, ms));

/** the boxes that break the rule, in the page: [what, why] */
const check = () => {
  const out = [], W = innerWidth, H = innerHeight, se = document.scrollingElement;
  if (se && (se.scrollTop || se.scrollLeft)) out.push(['the page', `scrolled (${se.scrollLeft}, ${se.scrollTop})`]);
  const boxes = [...document.querySelectorAll('[data-testid="rail"], [data-flyout-col], [data-testid="tool-panel"], [data-testid="help"]')].filter(e => e.offsetParent !== null);
  for (const b of boxes) {
    const name = b.getAttribute('data-testid') ?? `flyout ${b.getAttribute('data-flyout-col')}`, r = b.getBoundingClientRect();
    if (b.scrollWidth > b.clientWidth + 1) out.push([name, `content ${b.scrollWidth}px wide in ${b.clientWidth}px`]);
    if (r.right > W + 1 || r.left < -1) out.push([name, `past the screen's side (${Math.round(r.left)}..${Math.round(r.right)} of ${W})`]);
    if (r.bottom > H + 1 || r.top < -1) out.push([name, `past the screen's bottom (${Math.round(r.top)}..${Math.round(r.bottom)} of ${H})`]);
    for (const e of b.querySelectorAll('*')) {
      const ox = getComputedStyle(e).overflowX;
      if ((ox === 'auto' || ox === 'scroll') && e.scrollWidth > e.clientWidth + 1) out.push([name, `a sideways slider in <${e.tagName.toLowerCase()} class="${String(e.className).slice(0, 60)}">`]);
    }
  }
  return out;
};

const browser = await chromium.launch({ channel: CHANNEL, headless: true });
const fails = [];
let looked = 0;
try {
  for (const [W, H] of SIZES) for (const S of SCALES) {
    const tag = `${W}x${H} @${Math.round(S * 100)}%`;
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    await ctx.addInitScript(s => { try { localStorage.clear(); localStorage.setItem('capitalempire.uiScale', String(s)); } catch { /* none */ } }, S);
    const p = await ctx.newPage();
    await p.route('**/*', r => { const q = r.request(); return q.method() !== 'GET' && q.method() !== 'HEAD' ? r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }) : r.continue(); });
    await p.goto(`${URL}/?unlock=0`, { waitUntil: 'domcontentloaded', timeout: 180000 });
    await p.waitForFunction(() => window.__game?.ready, null, { timeout: 300000 });
    await sleep(2000);
    await p.evaluate(() => { const g = window.__game; g.setSpeed(0); g.setAdvancedTools(true); document.querySelectorAll('button[aria-label="Close"]').forEach(x => x.click()); g.emit(); });
    await sleep(500);
    const look = async what => { looked++; for (const [box, why] of await p.evaluate(check)) fails.push(`${tag} · ${what} · ${box}: ${why}`); };
    await look('the rail');
    const groups = await p.$$eval('[data-rail]', bs => bs.filter(b => b.getAttribute('aria-disabled') !== 'true').map(b => b.getAttribute('data-rail')));
    for (const g of groups) {
      await p.keyboard.press('Escape'); await sleep(120);
      try { await p.click(`[data-rail="${g}"]`, { timeout: 5000 }); } catch {
        const why = await p.evaluate(id => { const b = document.querySelector(`[data-rail="${id}"]`).getBoundingClientRect(), x = (b.left + b.right) / 2, y = (b.top + b.bottom) / 2, top = document.elementFromPoint(x, y); return `its button at (${Math.round(x)}, ${Math.round(y)}) is under <${top?.tagName.toLowerCase()} class="${String(top?.className).slice(0, 50)}">`; }, g);
        fails.push(`${tag} · the rail · ${g}: cannot be clicked: ${why}`); if (process.env.SHOT) await p.screenshot({ path: process.env.SHOT }); continue;
      }
      await sleep(250);
      if (!(await p.$('[data-flyout-col]'))) continue; // Select, Bulldoze: no flyout
      // every row with children, depth first: its column is looked at open
      const walk = async (level, trail) => {
        await look(`${g} ${trail.join(' > ')}`.trim());
        const n = await p.$$eval(`[data-flyout-col="${level}"] [aria-haspopup="menu"]:not([aria-disabled="true"])`, bs => bs.length);
        for (let k = 0; k < n; k++) {
          const b = p.locator(`[data-flyout-col="${level}"] [aria-haspopup="menu"]:not([aria-disabled="true"])`).nth(k), label = (await b.innerText()).split('\n')[0];
          await b.click(); await sleep(180);
          await walk(level + 1, [...trail, label]);
        }
      };
      await walk(0, []);
      // every leaf (--quick: the first of each column): picked, its tool panel looked at, then the group again
      await p.keyboard.press('Escape'); await sleep(120);
      const keys = await (async () => {
        const out = []; await p.click(`[data-rail="${g}"]`); await sleep(200);
        const collect = async (level, path) => {
          const rows = await p.$$eval(`[data-flyout-col="${level}"] [role="menuitem"]`, bs => bs.map(b => ({ key: b.getAttribute('data-key'), kids: b.getAttribute('aria-haspopup') === 'menu', locked: b.getAttribute('aria-disabled') === 'true' })));
          for (const r of rows) {
            if (r.locked) continue;
            if (!r.kids) { out.push([...path, r.key]); if (QUICK) break; continue; }
            const sel = `[data-flyout-col="${level}"] [role="menuitem"]`, idx = await p.$$eval(sel, (bs, k) => bs.findIndex(x => x.getAttribute('data-key') === k), r.key);
            if (idx < 0) continue;
            await p.locator(sel).nth(idx).click(); await sleep(150);
            await collect(level + 1, [...path, r.key]);
          }
        };
        await collect(0, []);
        await p.keyboard.press('Escape'); await sleep(100);
        return out;
      })();
      for (const path of keys) {
        await p.click(`[data-rail="${g}"]`); await sleep(200);
        let ok = true;
        for (let level = 0; level < path.length; level++) {
          const sel = `[data-flyout-col="${level}"] [role="menuitem"]`, idx = await p.$$eval(sel, (bs, k) => bs.findIndex(b => b.getAttribute('data-key') === k), path[level]);
          if (idx < 0) { ok = false; break; }
          await p.locator(sel).nth(idx).click(); await sleep(level === path.length - 1 ? 350 : 150);
        }
        if (!ok) { await p.keyboard.press('Escape'); continue; }
        await look(`${g} leaf ${path[path.length - 1]}`);
        await p.keyboard.press('Escape'); await sleep(80);
      }
    }
    // the Junctions panel with a junction selected (its type row and the roundabout's note)
    const sel = await p.evaluate(() => { const g = window.__game, nodes = [...(g.net.nodes?.values?.() ?? [])], n = nodes.find(x => x.arms?.length >= 3) ?? nodes.find(x => x.arms?.length >= 2); if (!n) return false; g.setTool('junction'); g.brush = 'select'; g.selectedJunction = n; g.emit(); return true; });
    if (sel) { await sleep(400); await look('Junctions, a junction selected'); }
    // Help › Keys (T202): F1 opens it; its top and its end (it scrolls vertically only)
    await p.keyboard.press('Escape'); await p.keyboard.press('Escape'); await sleep(150);
    await p.keyboard.press('F1'); await sleep(400);
    if (!(await p.$('[data-testid="keys-sheet"]'))) fails.push(`${tag} · Help › Keys: F1 did not open it`);
    else {
      await look('Help › Keys');
      await p.evaluate(() => { const c = document.querySelector('[data-testid="help"]'); c.scrollTop = c.scrollHeight; }); await sleep(150);
      await look('Help › Keys, scrolled to its end');
    }
    await ctx.close();
    console.log(`${tag}: looked ${looked} times so far, ${fails.length} failures so far`);
  }
} finally { await browser.close(); }
if (fails.length) { console.log(`FAIL: ${fails.length}`); for (const f of fails.slice(0, 60)) console.log('  ' + f); process.exit(1); }
console.log(`OK: no rail, flyout, tool panel or Help › Keys overflows (${looked} looks, ${SIZES.length} sizes x ${SCALES.length} UI scales)`);
