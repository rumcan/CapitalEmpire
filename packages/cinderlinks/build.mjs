// Cinderlinks' build, in Node (no PowerShell, no bash): join the parts into cinderlinks.fd.md, compile it with Fidelity's compiler
// (compiler/fidelity.mjs, every Check: line must pass), write the real courses (courses.js) and the course edits, and syntax-check game.js.
//   node packages/cinderlinks/build.mjs [--out <dir>]      default: public/cinderlinks/ (Vite serves it at /cinderlinks/index.html)
// npm run cinder:build runs it; npm run build runs it first.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { compileText } from './compiler/fidelity.mjs';
import { convert } from './tools/course-import.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const k = process.argv.indexOf('--out');
const OUT = k > 0 ? path.resolve(process.argv[k + 1]) : path.join(HERE, '..', '..', 'public', 'cinderlinks');
const fail = (msg) => { console.error('cinder:build failed: ' + msg); process.exit(1); };

// 1. the parts, in file-name order, joined into one distilled file (kept beside the parts for reading; git ignores it)
const partsDir = path.join(HERE, 'parts');
const parts = fs.readdirSync(partsDir).filter((f) => f.endsWith('.md')).sort();
if (!parts.length) fail('no parts in ' + partsDir);
const brs = parts.map((f) => fs.readFileSync(path.join(partsDir, f), 'utf8')).join('');
fs.writeFileSync(path.join(HERE, 'cinderlinks.fd.md'), brs, 'utf8');

// 2. compile into a clean folder (the folder is only ever this build's output)
fs.rmSync(OUT, { recursive: true, force: true });
try { console.log(compileText(brs, OUT, 'cinderlinks.fd.md')); } catch (e) { fail(e.message); }

// 3. the real courses the page offers (courses/raw: CapitalEmpire's map importer's files)
const rawDir = path.join(HERE, 'courses', 'raw');
const raws = fs.existsSync(rawDir) ? fs.readdirSync(rawDir).filter((f) => f.endsWith('.json')).sort() : [];
if (raws.length) {
  const list = raws.map((f) => convert(JSON.parse(fs.readFileSync(path.join(rawDir, f), 'utf8')), f));
  const js = "// Cinderlinks: real courses, made by tools/course-import.mjs from CapitalEmpire's map importer. Map data © OpenStreetMap contributors, ODbL 1.0 (https://www.openstreetmap.org/copyright).\n" +
    'const COURSES = ' + JSON.stringify(list) + ';\n';
  fs.writeFileSync(path.join(OUT, 'courses.js'), js, 'utf8');
  console.log('courses: ' + list.map((c) => c.id).join(', ') + ' (' + Buffer.byteLength(js) + ' bytes)');
}

// 4. the paths and buildings added to courses (the page polls edits/<id>.json)
const editDir = path.join(HERE, 'courses', 'edits');
if (fs.existsSync(editDir)) {
  const edits = fs.readdirSync(editDir).filter((f) => f.endsWith('.json'));
  if (edits.length) { fs.mkdirSync(path.join(OUT, 'edits'), { recursive: true }); for (const f of edits) fs.copyFileSync(path.join(editDir, f), path.join(OUT, 'edits', f)); }
}

// 4b. T450: CapitalEmpire's golfers (art/golfers/<id>): only the three clips the view draws (idle and walk, the drive, the putt), each picture and its
// frame table; the models and previews stay behind. A checkout without the art builds without it (the view then draws its own figure)
{
  const ART = path.join(HERE, '..', '..', 'art', 'golfers'), CLIPS = ['sheet', 'golf_drive', 'golf_putt'];
  const ids = fs.existsSync(ART) ? fs.readdirSync(ART).filter((id) => CLIPS.every((c) => fs.existsSync(path.join(ART, id, c + '.webp')) && fs.existsSync(path.join(ART, id, c + '.json')))) : [];
  let bytes = 0;
  for (const id of ids) {
    const to = path.join(OUT, 'golfart', id); fs.mkdirSync(to, { recursive: true });
    for (const c of CLIPS) for (const ext of ['.webp', '.json']) { fs.copyFileSync(path.join(ART, id, c + ext), path.join(to, c + ext)); bytes += fs.statSync(path.join(to, c + ext)).size; }
  }
  console.log(ids.length ? 'golfer art: ' + ids.length + ' golfers (' + (bytes / 1e6).toFixed(1) + ' MB)' : 'golfer art: none found in art/golfers (the view draws its own figure)');
}

// 5. game.js must at least parse
const game = path.join(OUT, 'game.js');
const chk = spawnSync(process.execPath, ['--check', game], { encoding: 'utf8' });
if (chk.status !== 0) fail('game.js does not parse:\n' + chk.stderr);
console.log('syntax ok: ' + fs.statSync(game).size + ' bytes -> ' + path.relative(process.cwd(), OUT));
