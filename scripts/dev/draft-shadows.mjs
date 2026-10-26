// Draft every library picture's vector shadow (T142) from its atlas pixels and its hand hints, and write src/game/shadow-shapes.json (one
// picture a line). Runs the dev page ?shadows=draft (src/game/dev/shadow-draft-page.ts) in a headless Edge, closed when done.
//   node scripts/dev/draft-shadows.mjs --base http://127.0.0.1:5188/ [--only id,id] [--out src/game/shadow-shapes.json]
// With --only, just those pictures are re-drafted and merged into the file. Needs a dev server (vite) on --base. Either way the file keeps no entry
// for a picture the library no longer has (the owner removed it in the studio: T164), so --only with a removed id just drops its stale entry.
import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://127.0.0.1:5188/'), out = opt('out', 'src/game/shadow-shapes.json'), only = opt('only', '');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
let res;
try {
  const page = await browser.newPage();
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  page.on('console', m => { if (/^\[draft\]/.test(m.text())) console.log(m.text()); });
  await page.goto(`${base}?shadows=draft${only ? `&only=${encodeURIComponent(only)}` : ''}`);
  await page.waitForFunction(() => window.__shadowDraft?.ready || window.__shadowDraft?.error, null, { timeout: 600000, polling: 1000 });
  res = await page.evaluate(() => window.__shadowDraft);
} finally { await browser.close(); }
if (res.error) { console.error(res.error); process.exit(1); }
let shapes = res.shapes;
if (only) { const old = JSON.parse(readFileSync(out, 'utf8')); shapes = { ...old, ...shapes }; }
// no entry for a picture the library no longer has
const lib = new Set(res.library ?? []), gone = lib.size ? Object.keys(shapes).filter(k => !lib.has(k)) : [];
for (const k of gone) delete shapes[k];
if (gone.length) console.log(`dropped ${gone.length} entries for pictures no longer in the library: ${gone.join(', ')}`);
const lines = Object.entries(shapes).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`);
writeFileSync(out, `{\n${lines.join(',\n')}\n}\n`);
console.log(`${Object.keys(res.shapes).length} drafted (${JSON.stringify(res.stats)}), ${lines.length} in ${out}, ${(readFileSync(out).length / 1024).toFixed(0)} KB`);
