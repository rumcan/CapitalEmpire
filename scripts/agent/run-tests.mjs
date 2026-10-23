// run-tests.mjs [test names or paths...]: bundles each tests/<name>.test.ts with esbuild and runs it with node --test, then prints one line per file and a verdict.
//   node scripts/agent/run-tests.mjs                 every tests/golf-*.test.ts plus the core suites (city, budget, business-city, business-visits, surge, town, paint)
//   node scripts/agent/run-tests.mjs golf-season city  just those
//   node scripts/agent/run-tests.mjs --all           every tests/*.test.ts (slow, needs RAM)
// Exit code 1 if any file fails. Needs `npm ci` done once. Output goes to output/tests (git-ignored).
import { spawnSync } from 'node:child_process'; import fs from 'node:fs'; import path from 'node:path';
const args = process.argv.slice(2), all = fs.readdirSync('tests').filter(f => f.endsWith('.test.ts')).map(f => f.replace('.test.ts', ''));
const core = ['city', 'budget', 'business-city', 'business-visits', 'surge', 'town', 'paint', 'seedtowns', 'parking-city', 'lot-ground'];
let names = args.includes('--all') ? all : args.length ? args.map(a => path.basename(a).replace(/\.test\.ts$/, '')) : [...all.filter(n => n.startsWith('golf-')), ...core.filter(n => all.includes(n))];
fs.mkdirSync('output/tests', { recursive: true });
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx'; let bad = 0;
for (const n of names) {
  const out = `output/tests/${n}.test.mjs`;
  const b = spawnSync(npx, ['esbuild', `tests/${n}.test.ts`, '--bundle', '--platform=node', '--format=esm', '--loader:.webp=empty', '--loader:.png=empty', '--loader:.jpg=empty', `--outfile=${out}`, '--log-level=error'], { encoding: 'utf8', shell: process.platform === 'win32' });
  if (b.status !== 0) { console.log(`BUILD-FAIL ${n}\n${(b.stdout || '') + (b.stderr || '')}`.slice(0, 1500)); bad++; continue; }
  const t = spawnSync(process.execPath, ['--test', out], { encoding: 'utf8' }), txt = (t.stdout || '') + (t.stderr || '');
  const g = k => (txt.match(new RegExp('^\\W*' + k + ' (\\d+)', 'm')) || [])[1] ?? '?';
  const ok = t.status === 0 && g('fail') === '0';
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}: tests ${g('tests')} pass ${g('pass')} fail ${g('fail')}`);
  if (!ok) { bad++; console.log(txt.split('\n').filter(l => /^✖|actual|expected|AssertionError|Error:/.test(l.trim())).slice(0, 8).join('\n')); }
}
console.log(bad ? `${bad} file(s) failed` : `all ${names.length} files pass`); process.exit(bad ? 1 : 0);
