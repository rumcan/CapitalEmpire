// #1314 / #1305: shots of sandbox mode and the course building unlock on a dev server of your own (the normal game: npx vite --port N --strictPort).
// A fresh browser (storage cleared), the normal game with the unlocks on (?unlock=0&money=0): Who are you, Pick a spot for me; then New hole locked with its progress
// (the range's takings this season and its looks), the unlock happening (the takings and the looks set through window.__game, the test hook), then Settings > Exit to
// main menu: the title card with Sandbox open; Start sandbox: a sandbox game with every tool open, the Sandbox tag and its money. Checks the career save's bytes are the
// same before and after the sandbox game started (its own save slot) and prints the facts each step read.
//   node scripts/jam/sandbox-shots.mjs --base http://127.0.0.1:PORT/ [--out F:/ClaudeTemp/jam/sandbox] [--headed] [--town]   (--town: the town builds its own roads)
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2), has = k => args.includes(`--${k}`), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', ''); if (!base) { console.error('--base http://127.0.0.1:PORT/ (a dev server of your own)'); process.exit(2); }
const SHOTS = resolve(opt('out', 'F:/ClaudeTemp/jam/sandbox')); mkdirSync(SHOTS, { recursive: true });
const errors = [], fails = [];
const browser = await chromium.launch({ channel: 'chrome', headless: !has('headed'), args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 }, deviceScaleFactor: 1, acceptDownloads: false });
await ctx.addInitScript(() => { try { if (!sessionStorage.getItem('__sb')) { localStorage.clear(); indexedDB.deleteDatabase?.('capital-empire'); sessionStorage.setItem('__sb', '1'); } } catch { /* none */ } });
const page = await ctx.newPage();
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
page.on('console', m => { const t = m.text(); if (m.type() === 'error' && !/favicon|Failed to load resource/.test(t)) errors.push(`console: ${t.slice(0, 300)}`); });
const settle = (ms = 400) => page.waitForTimeout(ms);
const game = (fn, arg) => page.evaluate(fn, arg);
const shot = async name => { const p = resolve(SHOTS, name); await page.screenshot({ path: p, type: 'png' }); console.log(`shot ${p}`); };
const check = (ok, what) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${what}`); if (!ok) fails.push(what); };
/** the career slot's bytes, as a short digest (null: no save) */
const careerDigest = () => game(() => new Promise(res => { const r = indexedDB.open('capital-empire'); r.onerror = () => res(null); r.onsuccess = () => { try { const db = r.result, t = db.transaction('saves', 'readonly').objectStore('saves').get('town'); t.onsuccess = () => { const b = t.result; if (!b) return res(null); const u = new Uint8Array(b); let h = 0; for (let i = 0; i < u.length; i++) h = (h * 31 + u[i]) >>> 0; res(`${u.length}:${h}`); }; t.onerror = () => res(null); } catch { res(null); } }; }));
const facts = () => game(() => { const g = window.__game, ui = g.toolUi(), p = g.golf?.progress; return { sandbox: g.sandboxMode, unlockAll: g.unlockAll, money: Math.round(g.money), lock: ui?.newHoleLock ?? null, progress: ui?.newHoleProgress ?? null, locked: ui?.lockedTools.map(t => t.id) ?? [], ramp: p?.ramp, guide: !!p?.guide, tour: !!p?.tour, takings: Math.round(g.golf?.range?.season.takings ?? 0), owned: g.golf?.range?.owned ?? [] }; });
/** Who are you, then Pick a spot for me; waits until the start is laid */
async function start() {
  const who = page.locator('button', { hasText: "That's me" });
  await who.waitFor({ timeout: 120000 }); await page.locator('input[placeholder="Your name"]').fill('Sandbox Test').catch(() => {});
  await who.click(); await settle(1200);
  await page.locator('[data-testid="start-pick-auto"]').waitFor({ timeout: 120000 }); await settle(800);
  await page.locator('[data-testid="start-pick-auto"]').click();
  await page.waitForFunction(() => !window.__game.startPick && window.__game.golf?.range?.built !== false, null, { timeout: 120000 }).catch(() => {});
  await settle(5000);
}

try {
  const url = base + '?unlock=0&money=0';
  console.log(`sandbox shots: ${url} (Chrome ${browser.version()})`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 240000 });
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 240000 });
  await start();
  // ---- a normal new game: the range's first upgrade (the target greens) opens Holes; New hole waits, with its progress
  await game(() => { const b = window.__game.golf.range; if (!b.owned.includes('greens')) b.owned.push('greens'); b.season.takings = 1250; });
  await settle(1500); await game(() => window.__game.setTool('course')); await settle(1500);
  let f = await facts(); console.log('normal', JSON.stringify(f));
  check(!f.sandbox && !f.unlockAll && !!f.lock && f.progress?.have === 1250 && f.progress?.need === 5000 && f.progress?.looks?.done === 1, 'a normal new game: New hole locked with $1,250 of $5,000 and 1 of 3 looks');
  check(await page.locator('[data-testid="new-hole-progress"]').isVisible(), 'the Holes panel shows the progress under the locked New hole');
  await shot('03-normal-new-hole-locked.png');
  // ---- the unlock happening: the takings reach $5,000 and the range gets its third look
  await game(() => { const b = window.__game.golf.range; for (const id of ['gravel', 'teeturf']) if (!b.owned.includes(id)) b.owned.push(id); b.season.takings = 5000; });
  await settle(2500);
  f = await facts(); console.log('unlocked', JSON.stringify(f));
  check(f.lock === null && !f.locked.includes('buildings'), 'the unlock: New hole and the clubhouse open at $5,000 and 3 looks');
  check(await game(() => window.__game.toasts.some(t => /range is ready/i.test(t.text))), 'the celebration toast says the range is ready');
  await shot('04-unlock.png');
  await game(() => window.__game.save()); await settle(800);
  const before = await careerDigest(); console.log('career save', before);
  // ---- Settings > Exit to main menu: the title card, Sandbox open
  await page.locator('button[data-tip="Settings"]').click(); await settle(400);
  await page.locator('[data-testid="menu-exit-title"]').click(); await page.locator('[data-testid="title-card"]').waitFor({ timeout: 20000 }); await settle(600);
  await page.locator('[data-testid="title-sandbox"]').click(); await settle(400);
  if (has('town')) await page.locator('[data-testid="sandbox-roads-town"]').check();
  check(await page.locator('[data-testid="sandbox-options"]').isVisible(), 'the title card offers Sandbox with its town roads choice');
  await shot('01-title-sandbox.png');
  // ---- Start sandbox: its own save slot, every tool open, the Sandbox tag, its money, no tutorial
  await page.locator('[data-testid="title-sandbox-start"]').click(); await settle(2000);
  await start();
  await game(() => window.__game.setTool('course')); await settle(1500);
  f = await facts(); console.log('sandbox', JSON.stringify(f));
  const slot = await game(() => localStorage.getItem('capitalempire.slot'));
  check(!!f.sandbox && f.unlockAll && f.lock === null && !f.guide && !f.tour && f.money > 9_000_000, 'a sandbox game: everything unlocked, no guide or tutorial, about $10,000,000');
  check(await page.locator('[data-testid="sandbox-tag"]').isVisible(), 'the top bar wears the Sandbox tag');
  check(!(await page.locator('[data-testid="new-hole-lock"]').count()), 'New hole is open in the Holes panel');
  check(slot === 'sandbox', 'the sandbox game uses its own save slot');
  await game(() => window.__game.save()); await settle(800);
  check((await careerDigest()) === before, 'the career save is untouched by the sandbox game');
  await shot('02-sandbox-all-tools.png');
} catch (e) { console.error('error', e?.message ?? e); fails.push(String(e?.message ?? e)); }
finally {
  if (errors.length) console.log('page errors:\n' + errors.slice(0, 12).join('\n'));
  await browser.close();
  console.log(fails.length ? `FAILED: ${fails.length}` : 'all checks passed');
  process.exit(fails.length ? 1 : 0);
}
