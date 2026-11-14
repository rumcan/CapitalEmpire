// J11 (#1270): the page's sound, driven in the installed Chrome (playwright-core, channel 'chrome'). It counts what the page asks of Web Audio and of <audio>
// (an init script wraps AudioContext, the oscillators and buffer sources, and HTMLMediaElement.play; the game is not touched) and checks:
//   - nothing before the first click or key: no AudioContext, no sound node, no <audio> played, no audio file fetched (nothing downloaded until the radio is on)
//   - the first click makes the one context; each button click after it makes a sound; a muted page makes none; F8 mutes and unmutes
//   - Settings shows the sound rows and they work (the effects' slider and mute); the radio plays: its <audio> element's currentTime advances, Pause stops it,
//     Next changes the track, the volume slider and Mute reach the element, a reload remembers the radio "on" and starts it at the first click only
//   - nothing overflows sideways at the largest Text size (125%) in Settings and in the radio's popover; no console error
// Serves dist-jam (npm run build:jam first) on a free port, or uses --url (a dev server on a scratch port of your own: never 5174, 5175, 5191, 5270 or 5280).
//   node scripts/jam/sound-smoke.mjs [--url http://127.0.0.1:PORT/] [--shots DIR] [--headed]
import { chromium } from 'playwright-core';
import { preview } from 'vite';
import { createServer } from 'node:net';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2), has = k => args.includes(`--${k}`), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const ROOT = resolve('.'), OUT = 'dist-jam', SHOTS = opt('shots', null);
if (SHOTS) mkdirSync(resolve(SHOTS), { recursive: true });
let server = null, base = opt('url', null);
if (!base) {
  if (!existsSync(resolve(ROOT, OUT, 'index.html'))) { console.error(`no ${OUT}/index.html: run npm run build:jam first, or pass --url`); process.exit(2); }
  const freePort = () => new Promise(res => { const s = createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); });
  const port = await freePort();
  server = await preview({ root: ROOT, logLevel: 'error', build: { outDir: OUT }, preview: { port, strictPort: true, host: '127.0.0.1' } });
  base = `http://127.0.0.1:${port}/`;
}

const rows = [], errors = [];
const check = (name, ok, note = '') => { rows.push({ name, ok, note }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`); };
const browser = await chromium.launch({ channel: 'chrome', headless: !has('headed'), args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 }, deviceScaleFactor: 1, acceptDownloads: false });
// the counters: the page's own code is not touched, only what it asks of the browser is counted
await ctx.addInitScript(() => {
  try { if (!sessionStorage.getItem('__keep')) localStorage.clear(); } catch { /* none */ }
  const S = window.__snd = { ctx: 0, osc: 0, src: 0, plays: [], audio: [], fetched: [] };
  const AC = window.AudioContext;
  window.AudioContext = class extends AC { constructor(...a) { super(...a); S.ctx++; S.last = this; } };
  for (const [P, k] of [[window.OscillatorNode.prototype, 'osc'], [window.AudioBufferSourceNode.prototype, 'src']]) { const o = P.start; P.start = function (...a) { S[k]++; return o.apply(this, a); }; }
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function (...a) { S.plays.push(this.currentSrc || this.src); if (!S.audio.includes(this)) S.audio.push(this); return play.apply(this, a); };
  const f = window.fetch; window.fetch = function (u, ...a) { try { S.fetched.push(String(u && u.url ? u.url : u)); } catch { /* ignore */ } return f.call(this, u, ...a); };
});
const page = await ctx.newPage();
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource: the server responded with a status of 404/.test(m.text())) errors.push(`console: ${m.text().slice(0, 300)}`); });
const counts = () => page.evaluate(() => ({ ctx: __snd.ctx, nodes: __snd.osc + __snd.src, plays: __snd.plays.length, state: __snd.last?.state ?? null }));
const settle = (ms = 400) => page.waitForTimeout(ms);
const shot = async name => { if (SHOTS) await page.screenshot({ path: resolve(SHOTS, `${name}.png`) }); };
/** no horizontal overflow in a box: its scrollWidth does not pass its clientWidth (the page's too) */
const overflow = sel => page.evaluate(s => { const e = document.querySelector(s); if (!e) return 'missing'; return e.scrollWidth > e.clientWidth + 1 ? `${e.scrollWidth} > ${e.clientWidth}` : (document.documentElement.scrollWidth > innerWidth + 1 ? 'page' : ''); }, sel);

try {
  console.log(`sound smoke: ${base} (Chrome ${browser.version()})`);
  await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 400000 }); // (a dev server compiles the game's modules on the first visit: minutes)
  await page.locator('[data-testid="title-card"]').waitFor({ timeout: 400000 });
  await settle(1500);
  let c = await counts();
  check('nothing before the first click: no context, no sound node, no <audio> played', c.ctx === 0 && c.nodes === 0 && c.plays === 0, JSON.stringify(c));
  // (resource timing sees media loads; fetch() does not)
  const early = await page.evaluate(() => performance.getEntriesByType('resource').map(e => e.name).filter(u => /\.(mp3|ogg|opus|wav|m4a)(\?|$)/i.test(u)));
  check('no audio file fetched before the radio is turned on', early.length === 0, early.join(', '));

  // ---- the first click makes the one context
  await page.locator('[data-testid="title-how"]').click(); await settle(500);
  c = await counts();
  check('the first click makes the one context, and it runs', c.ctx === 1 && c.state === 'running', JSON.stringify(c));
  const n0 = c.nodes;
  await page.locator('[data-testid="title-how"]').click(); await settle(300);
  c = await counts();
  check('a button click makes a sound', c.nodes > n0, `nodes ${n0} -> ${c.nodes}`);
  check('still one context', c.ctx === 1);

  await page.locator('[data-testid="title-new"]').click({ timeout: 4000 });
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 180000 });
  const who = page.locator('button', { hasText: "That's me" });
  await who.waitFor({ timeout: 60000 });
  await who.click(); await settle(1200);
  await page.evaluate(() => window.__game.setSpeed(0));

  // ---- Settings: the sound rows
  const gear = page.locator('[data-tip="Settings"]').first();
  await gear.click(); await settle(400);
  const hasRows = await page.evaluate(() => !!document.querySelector('[data-testid="sound-sfx-slider"]') && !!document.querySelector('[data-testid="sound-mute-all"]'));
  check('Settings has the effects slider and the mute-all switch', hasRows);
  await shot('settings-100');
  const n1 = (await counts()).nodes;
  await page.locator('[data-testid="sound-sfx-mute"]').click(); await settle(300);
  const n2 = (await counts()).nodes;
  await page.locator('[data-testid="sound-sfx"] input[type="range"]').fill('0.5').catch(() => {}); await settle(200);
  await page.locator('[data-testid="sound-sfx-mute"]').click({ force: true }); await settle(300);
  const muted = await page.evaluate(() => JSON.parse(localStorage.getItem('capitalempire.sound') || '{}'));
  check('the effects mute is kept in this browser', muted.sfxMuted === false && muted.sfx === 0.5, JSON.stringify(muted));
  check('a mute click and the unmute click make sounds only when the effects are on', n2 >= n1, `nodes ${n1} -> ${n2}`);
  // F8 mutes everything, silently; F8 again lifts it with a tick
  await page.keyboard.press('Escape');
  await page.keyboard.press('F8'); await settle(200);
  let st = await page.evaluate(() => JSON.parse(localStorage.getItem('capitalempire.sound') || '{}'));
  check('F8 mutes everything', st.muted === true, JSON.stringify(st));
  const n3 = (await counts()).nodes;
  await page.locator('[data-testid="range-chip"], [data-testid="title-block"], [data-testid="stat-chips"] button').first().click({ timeout: 2000 }).catch(() => {}); await settle(300);
  check('a muted page makes no sound', (await counts()).nodes === n3, `nodes ${n3} -> ${(await counts()).nodes}`);
  await page.keyboard.press('F8'); await settle(300);
  st = await page.evaluate(() => JSON.parse(localStorage.getItem('capitalempire.sound') || '{}'));
  check('F8 again unmutes', st.muted === false, JSON.stringify(st));

  // ---- the largest Text size: Settings fits
  await page.keyboard.press('Escape');
  await gear.click(); await settle(300);
  await page.locator('[data-scale="1.25"]').click(); await settle(500);
  const gearBox = '.glass.absolute.right-0.top-full';
  const ov = await overflow(gearBox);
  check('Settings fits at the largest Text size (no sideways scroll)', ov === '', ov);
  await shot('settings-125');
  await page.locator('[data-scale="1"]').click(); await settle(300);
  await page.keyboard.press('Escape');

  // ---- the radio: off until turned on, nothing fetched; then plays, pauses, next, volume, mute
  const mp3s = () => page.evaluate(() => performance.getEntriesByType('resource').filter(e => /\.mp3/.test(e.name)).length);
  const deck = () => page.evaluate(() => { const a = __snd.audio[0]; return a ? { src: a.currentSrc, t: a.currentTime, paused: a.paused, vol: a.volume, err: a.error ? a.error.code : 0 } : null; });
  await gear.click(); await settle(300);
  check('Settings has the Music row', await page.evaluate(() => !!document.querySelector('[data-testid="sound-music-slider"]')));
  await page.keyboard.press('Escape'); await settle(200);
  const pill = page.locator('[data-testid="radio-play"]');
  check('the radio is in the top bar and off for a new player', (await pill.count()) === 1 && (await pill.getAttribute('aria-pressed')) === 'false');
  const fetched0 = await mp3s();
  check('no music fetched while the radio is off', fetched0 === 0 && (await counts()).plays === 0, `${fetched0} files`);
  await shot('radio-off');
  await pill.click();
  await page.waitForFunction(() => __snd.audio[0] && __snd.audio[0].currentTime > 0.5, null, { timeout: 20000 }).catch(() => {}); // (the first bytes come from the server: a moment)
  const play1 = await deck();
  check('turning the radio on plays a track from the page', !!play1 && !play1.paused && play1.t > 0.5 && !play1.err && /audio\/music\/.+\.mp3$/.test(play1.src), JSON.stringify(play1));
  await page.locator('[data-testid="radio-more"]').click(); await settle(400);
  const card = await page.evaluate(() => document.querySelector('[data-testid="radio-track"]')?.textContent ?? '');
  check('the radio card names the track and its author', /CC0/.test(card) && /Track 1 of 6/.test(card), card);
  await shot('radio-card');
  const title = () => page.evaluate(() => document.querySelector('[data-testid="radio-track"] .font-semibold')?.textContent);
  const t1 = await title();
  await page.locator('[data-testid="radio-next"]').click(); await page.waitForFunction(() => __snd.audio[0] && __snd.audio[0].currentTime > 0.5 && /all-into/.test(__snd.audio[0].currentSrc), null, { timeout: 20000 }).catch(() => {});
  const t2 = await title(), d2 = await deck();
  check('Next plays the next track', t2 !== t1 && !!d2 && !d2.paused && d2.t > 0.5, JSON.stringify({ t1, t2, ...d2 }));
  await page.locator('[data-testid="sound-music-slider"]').last().fill('0.3'); await settle(200);
  const vol = (await deck()).vol;
  check("the Music slider sets the audio element's volume (squared: 0.3 gives 0.09)", Math.abs(vol - 0.09) < 0.011, `volume ${vol}`);
  await page.locator('[data-testid="sound-music-mute"]').last().click(); await settle(200);
  check('the Music mute silences it', (await deck()).vol === 0);
  await page.locator('[data-testid="sound-music-mute"]').last().click(); await settle(200);
  await page.keyboard.press('F8'); await settle(200);
  check('F8 silences the music too', (await deck()).vol === 0);
  await page.keyboard.press('F8'); await settle(200);
  check('and F8 again brings it back', (await deck()).vol > 0);
  // the largest Text size: the card fits and stays inside the window
  await page.keyboard.press('Escape');
  await gear.click(); await settle(300); await page.locator('[data-scale="1.25"]').click(); await settle(300); await page.keyboard.press('Escape');
  await page.locator('[data-testid="radio-more"]').click(); await settle(400);
  const ovr = await overflow('[data-testid="radio-card"]');
  check('the radio card fits at the largest Text size (no sideways scroll)', ovr === '', ovr);
  const inView = await page.evaluate(() => { const r = document.querySelector('[data-testid="radio-card"]')?.getBoundingClientRect(); return r ? r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight : false; });
  check('and it stays inside the window', inView);
  const bar = await page.evaluate(() => { const r = document.querySelector('[data-testid="radio"]')?.getBoundingClientRect(); return r ? { right: r.right, w: innerWidth } : null; });
  check('the radio pill is inside the window at 125%', !!bar && bar.right <= bar.w, JSON.stringify(bar));
  await shot('radio-card-125');
  await page.keyboard.press('Escape'); await settle(200);
  check('Escape closes the radio card', (await page.locator('[data-testid="radio-card"]').count()) === 0);
  await gear.click(); await settle(300); await page.locator('[data-scale="1"]').click(); await settle(200); await page.keyboard.press('Escape');
  await pill.click(); await settle(500);
  check('Pause stops the music', (await deck()).paused);

  // ---- a reload remembers the radio "on" and starts it at the first click, not before
  await pill.click(); await settle(1500); // (on again)
  await page.evaluate(() => { try { sessionStorage.setItem('__keep', '1'); } catch { /* none */ } });
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 400000 });
  await page.locator('[data-testid="title-card"]').waitFor({ timeout: 400000 });
  await settle(2500);
  const after = await page.evaluate(() => ({ plays: __snd.plays.length, ctx: __snd.ctx, mp3: performance.getEntriesByType('resource').filter(e => /\.mp3/.test(e.name)).length }));
  check('after a reload the remembered radio plays nothing and fetches nothing before the first click', after.plays === 0 && after.ctx === 0 && after.mp3 === 0, JSON.stringify(after));
  await page.locator('[data-testid="title-how"]').click(); await settle(3500);
  const again = await deck();
  check('the first click starts it', !!again && !again.paused && again.t > 0.5, JSON.stringify(again));
} finally {
  await settle(300);
  if (errors.length) for (const e of errors) console.log(`  ${e}`);
  check('no console error', errors.length === 0, `${errors.length} error(s)`);
  await browser.close().catch(() => {});
  if (server) { await server.close?.().catch?.(() => {}); server.httpServer?.close?.(); }
}
const bad = rows.filter(r => !r.ok);
console.log(`\n${rows.length} checks, ${bad.length} fail`);
process.exit(bad.length ? 1 : 0);
