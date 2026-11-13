// Fairway Fortune jam build: checks itch.io's limits on dist-jam/ and zips it for upload.
// itch.io HTML5 limits: at most 1,000 files, 500 MB unpacked, 200 MB a file, paths of 240 characters.
// Usage: node scripts/jam/pack.mjs [distDir] [zipPath]   (run by `npm run build:jam` after the vite build)
import { readdirSync, statSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, relative, dirname, resolve, sep } from 'node:path';
import { execFileSync } from 'node:child_process';

export const LIMITS = { files: 1000, totalBytes: 500 * 1024 * 1024, fileBytes: 200 * 1024 * 1024, pathChars: 240 };
const dist = resolve(process.argv[2] ?? 'dist-jam');
const zip = resolve(process.argv[3] ?? 'F:/ClaudeTemp/jam/fairway-fortune-web.zip');
const mb = n => (n / 1048576).toFixed(1) + ' MB';

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name), st = statSync(p);
    if (st.isDirectory()) walk(p, out); else out.push({ path: relative(dist, p).split(sep).join('/'), size: st.size });
  }
  return out;
}

if (!existsSync(join(dist, 'index.html'))) { console.error(`FAIL: ${dist} has no index.html (run the vite build first)`); process.exit(1); }
const files = walk(dist), total = files.reduce((a, f) => a + f.size, 0), errors = [];
console.log(`${files.length} files, ${mb(total)} unpacked in ${dist}`);
if (files.length > LIMITS.files) errors.push(`${files.length} files (limit ${LIMITS.files})`);
if (total > LIMITS.totalBytes) errors.push(`${mb(total)} unpacked (limit ${mb(LIMITS.totalBytes)})`);
for (const f of files) {
  if (f.size > LIMITS.fileBytes) errors.push(`file over ${mb(LIMITS.fileBytes)}: ${f.path} (${mb(f.size)})`);
  if (f.path.length > LIMITS.pathChars) errors.push(`path over ${LIMITS.pathChars} chars (${f.path.length}): ${f.path}`);
}
const bySize = [...files].sort((a, b) => b.size - a.size).slice(0, 8);
console.log('largest: ' + bySize.map(f => `${f.path} ${mb(f.size)}`).join('; '));
const dirs = new Map();
for (const f of files) { const d = f.path.includes('/') ? f.path.split('/').slice(0, f.path.startsWith('assets/') ? 1 : 1)[0] : '.'; const e = dirs.get(d) ?? { n: 0, b: 0 }; e.n++; e.b += f.size; dirs.set(d, e); }
console.log('by folder: ' + [...dirs].map(([d, e]) => `${d} ${e.n} files ${mb(e.b)}`).join('; '));
if (errors.length) { console.error('FAIL: itch.io limits exceeded:\n  ' + errors.join('\n  ')); process.exit(1); }

mkdirSync(dirname(zip), { recursive: true });
if (existsSync(zip)) rmSync(zip);
// bsdtar (Windows' own tar.exe) writes a real zip with forward-slash entries, no new dependency
const tar = process.platform === 'win32' ? 'C:\\Windows\\System32\\tar.exe' : 'zip';
if (process.platform === 'win32') execFileSync(tar, ['-a', '-c', '-f', zip, '-C', dist, ...readdirSync(dist)], { stdio: 'inherit' });
else execFileSync('zip', ['-r', '-q', zip, '.'], { cwd: dist, stdio: 'inherit' });
console.log(`OK: ${zip} (${mb(statSync(zip).size)}), index.html at the zip root`);
